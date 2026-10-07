// محرك الاستقبال الموحد (Intake Engine) والإرسال الموحد.
// الموقع وواتساب (وأي قناة مستقبلية) مجرد «أبواب» تصل إلى نفس المكان:
// كل رسالة واردة تُوحَّد، يُحدَّد عميلها، ثم تُلحق بالطلب أو الملف المفتوح بدل إنشاء قصة منفصلة.
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, addHours, parseJson, badRequest, notFound, cairoYear, truncate } from '../util.js';
// v9.1 b-site (B91-01/B91-10): قاعدة القناة الواحدة وتأكيد الرقم بنقرة واحدة وصياغة رسائل المستفيد/ة
import { sha256, latinDigits, normalizePhone, addressName, addressForm, genderize } from '../util.js';
import { CODE_PREFIX, LABELS } from '../constants.js';
import { CLIENT_TEXTS } from '../constants.js'; // v9.1 b-site
import { parseWebhook, sourceFromReferral } from './whatsapp.js';

const REF_RE = /REQ-(\d{4})-(\d{5})/i;
// v9.1 b-site: «… وكود التأكيد 482913» في رسالة واتساب الجاهزة من شاشة نجاح الطلب (يقبل الأرقام العربية)
const CONFIRM_CODE_RE = /كود\s*(?:ال)?تأكيد\s*[:：]?\s*(\d{6})(?!\d)/;
const CONFIRM_MAX_FAILURES = 5;
/** القنوات التي تثبت أن صاحب الطلب هو صاحب الرقم: واتساب، أو سجلت الإدارة الطلب من مكالمة أو حضور شخصي */
const CONFIRMING_CHANNELS = new Set(['whatsapp', 'phone', 'walk_in']);
/** رسالة الخطأ عند إرسال الإدارة عبر واتساب لطلب رقمه غير مؤكد (B91-01) */
export const UNCONFIRMED_WHATSAPP_ERROR = 'رقم هذا الطلب غير مؤكد. أكّدوا هوية المستفيد/ة أولًا ثم أعيدوا الإرسال.';

// ───────────── v9.1 fixes: روابط صفحة المتابعة لا تُحفظ في نص الرسالة أبدًا ─────────────
/** متغير الرابط في نص واتساب: يُستبدل برابط جديد عند الإرسال الفعلي فقط (dispatch)، ولا يُحفظ الرابط في قاعدة البيانات */
export const PORTAL_LINK_VAR = '{portal_link}';
/**
 * النص المحفوظ (يظهر للإدارة وفي صفحة المتابعة): بلا الرابط ولا عنوانه.
 * «صفحة طلبك: {portal_link}» ← يُحذف السطر؛ «صوّري الورقة وابعتيها هنا، أو من صفحتك: {portal_link}» ← «صوّري الورقة وابعتيها هنا.»
 */
export function withoutLinkLines(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  for (const line of lines) {
    const at = line.indexOf(PORTAL_LINK_VAR);
    if (at < 0) {
      out.push(line);
      continue;
    }
    let before = line.slice(0, at);
    const after = line.slice(at + PORTAL_LINK_VAR.length).replace(/\{portal_link\}/g, '').trim();
    const colon = Math.max(before.lastIndexOf(':'), before.lastIndexOf('：'));
    if (colon >= 0) before = before.slice(0, colon);
    // عنوان الرابط («أو من صفحتك» / «التفاصيل») بعد آخر فاصل جملة يُحذف معه
    const sep = Math.max(before.lastIndexOf('،'), before.lastIndexOf('.'), before.lastIndexOf(','));
    const keep = (sep >= 0 ? before.slice(0, sep) : '').trim();
    const rest = [keep ? `${keep}.` : '', after].filter(Boolean).join(' ');
    if (rest) out.push(rest);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * رسالة تأكيد الرقم الجاهزة («السلام عليكم، ده رقم طلبي REQ-… وكود التأكيد 123456») ليست من وقائع الطلب:
 * تُحذف من النص قبل التحليل والملخص والمعاينة. يعيد ما كتبته المستفيدة غير ذلك (أو '' إن لم تكتب شيئًا آخر).
 */
export function stripIdentityConfirm(text) {
  let s = latinDigits(String(text ?? ''));
  s = s.replace(
    /(?:السلام\s+عليكم(?:\s+ورحمة\s+الله(?:\s+وبركاته)?)?\s*[،,.!]*\s*)?(?:(?:ده|دا|هذا|هذه)\s+)?(?:رقم\s+طلبي\s*[:：]?\s*)?REQ-\d{4}-\d{5}\s*[،,]?\s*(?:و\s*)?كود\s*(?:ال)?تأكيد\s*[:：]?\s*\d{6}(?!\d)\s*[.،]?/gi,
    ' ',
  );
  s = s.replace(/كود\s*(?:ال)?تأكيد\s*[:：]?\s*\d{6}(?!\d)/g, ' ');
  return s.replace(/[ \t]+/g, ' ').replace(/^\s*[،,.!]+\s*/, '').trim();
}
/** نص رسالة واردة كما يدخل التحليل والوقائع: رسالة تأكيد الرقم بلا رقم الطلب والكود */
export function factsText(body, meta) {
  const m = typeof meta === 'string' ? parseJson(meta, {}) : meta || {};
  return m.identity_confirm ? stripIdentityConfirm(body) : String(body ?? '');
}

/**
 * طلب لا يُثبت أن مقدّمه صاحب رقم الهاتف، فلا يظهر في رابط البوابة الكامل لصاحب الرقم
 * (رمز الدخول عبر واتساب أو رابط ترسله الإدارة) حتى تؤكد الإدارة الهوية من صفحة الطلب:
 *  - طلب من نموذج الموقع طابق رقمه عميلًا مسجلًا (phone_match_unverified)، أو
 *  - أي طلب بدأ من نموذج الموقع (الرقم فيه مجرد إدخال؛ قد يكون خطأً في الكتابة أو رقم قريب أو رقم الخصم)،
 *    ما لم يُرسله صاحب رابط بوابة كامل (sender_verified) أو تؤكد الإدارة هويته (identity_confirmed_at).
 * يعمل كذلك على الطلبات القديمة التي أُنشئت قبل هذه العلامات (first_channel = 'website').
 * alias: اسم جدول intakes في الاستعلام (اختياري).
 */
export function portalUnverifiedSql(alias = '') {
  const c = (col) => (alias ? `${alias}.${col}` : col);
  return `(COALESCE(json_extract(${c('source_detail')}, '$.phone_match_unverified'), 0) = 1 OR (${c('first_channel')} = 'website' AND json_extract(${c('source_detail')}, '$.identity_confirmed_at') IS NULL AND COALESCE(json_extract(${c('source_detail')}, '$.sender_verified'), 0) = 0))`;
}
/** نفس الشرط لصف طلب محمّل */
export function isPortalUnverifiedIntake(i) {
  if (!i) return false;
  const sd = parseJson(i.source_detail, {});
  if (sd.phone_match_unverified) return true;
  return i.first_channel === 'website' && !sd.identity_confirmed_at && !sd.sender_verified;
}

/** استنتاج مصدر العميل من بيانات الموقع (UTM / Referrer / رمز جهة الإحالة) */
export function sourceFromWebAttribution(attr = {}) {
  const a = attr || {};
  const src = String(a.utm_source || '').toLowerCase();
  const medium = String(a.utm_medium || '').toLowerCase();
  const ref = String(a.referrer || '').toLowerCase();
  const paid = /cpc|ppc|paid|ad|ads|sponsored|display/.test(medium);
  const detail = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'referrer', 'landing_path']) {
    if (a[k]) detail[k] = String(a[k]).slice(0, 300);
  }
  const campaign = a.utm_campaign ? String(a.utm_campaign).slice(0, 150) : null;
  if (a.ref) return { source: 'referral', campaign: campaign || String(a.ref).slice(0, 100), detail };
  if (/^(fb|facebook|meta)/.test(src)) return { source: paid || !medium ? 'facebook_ad' : 'social_organic', campaign, detail };
  if (/^(ig|instagram)/.test(src)) return { source: paid || !medium ? 'instagram_ad' : 'social_organic', campaign, detail };
  if (/google/.test(src) || /google\./.test(ref)) return { source: 'google', campaign, detail };
  if (src) return { source: 'other', campaign, detail };
  if (/facebook\.|instagram\.|t\.co|twitter\.|x\.com|tiktok\.|linkedin\./.test(ref)) return { source: 'social_organic', campaign, detail };
  if (ref && !ref.includes('localhost')) return { source: 'other', campaign, detail };
  return { source: 'direct', campaign, detail };
}

export function createEngine(app) {
  const { db, config } = app;
  // قيم سرية للإرسال الفعلي فقط (مثل رمز الدخول) لا تُحفظ في قاعدة البيانات: معرف الرسالة ← { text, vars }
  const secrets = new Map();

  function nextIntakeCode(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`intake:${y}`, 1);
    return `${CODE_PREFIX.intake}-${y}-${String(n).padStart(5, '0')}`;
  }

  /** آخر قناة وارد استخدمها العميل (لاختيار قناة الرد تلقائيًا) */
  function lastInbound(clientId) {
    return db.get(
      "SELECT channel, created_at FROM messages WHERE client_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1",
      clientId,
    );
  }

  // طلب أنشأه نموذج الموقع برقم عميل مسجل ولم تتحقق الإدارة بعد من أن المرسل صاحب الرقم
  const isUnverifiedIntake = (i) => !!i && !!parseJson(i.source_detail, {}).phone_match_unverified;

  // ───────────── v9.1 b-site (B91-01): قاعدة القناة الواحدة لكل رسالة صادرة ─────────────
  // «القصة» = الطلب وما تفرع عنه (الملف والملف المستمر). القصة «مؤكدة» إذا بدأت من واتساب أو مكالمة أو حضور شخصي،
  // أو أكدت الإدارة الهوية، أو كتبها صاحب رابط بوابة كامل، أو أرسلت المستفيدة من نفس الرقم رسالة واتساب فيها رقم الطلب
  // وكود التأكيد. القصة المؤكدة تصلها الرسائل على واتساب (وتبقى في صفحة المتابعة)، وغير المؤكدة في صفحة المتابعة فقط.

  /** طلب القصة (من الطلب نفسه أو من الملف أو الملف المستمر) أو null */
  function storyIntake({ intakeId = null, caseId = null, matterId = null } = {}) {
    if (intakeId) {
      const i = db.get('SELECT * FROM intakes WHERE id = ?', intakeId);
      if (i) return i;
    }
    let cid = caseId;
    if (!cid && matterId) cid = db.value('SELECT case_id FROM matters WHERE id = ?', matterId) ?? null;
    if (cid) {
      const iid = db.value('SELECT intake_id FROM cases WHERE id = ?', cid);
      if (iid) return db.get('SELECT * FROM intakes WHERE id = ?', iid) || null;
    }
    return null;
  }

  /** هل رقم الهاتف هوية موثّقة لهذا العميل؟ (واتساب أو سجلته الإدارة، أو طلب بنفس الرقم أُكدت هويته) */
  function phoneVerifiedFor(clientId, phone) {
    if (!phone) return false;
    if (app.messaging?.verifiedClientForPhone) return app.messaging.verifiedClientForPhone(phone)?.id === clientId;
    const ident = db.get("SELECT channels FROM client_identities WHERE kind = 'phone' AND value = ? AND client_id = ?", phone, clientId);
    const chans = parseJson(ident?.channels, []);
    return !!ident && (!chans.length || chans.some((c) => c !== 'website'));
  }

  /** الرقم الذي تُرسل إليه رسائل القصة: رقم التواصل في الطلب إن كان من أرقام العميل، وإلا رقمه الأساسي */
  function storyPhone(clientId, intake) {
    const p = intake?.contact_phone ? normalizePhone(intake.contact_phone) : null;
    if (p && db.get("SELECT 1 FROM client_identities WHERE client_id = ? AND kind = 'phone' AND value = ?", clientId, p)) return p;
    return app.clients.primaryPhone(clientId);
  }

  /** هل القصة مؤكدة؟ (انظر أعلاه). بلا طلب: يكفي أن يكون الرقم هوية موثّقة للعميل */
  function isStoryConfirmed({ clientId, intakeId = null, caseId = null, matterId = null } = {}) {
    const intake = storyIntake({ intakeId, caseId, matterId });
    if (intake) {
      if (isPortalUnverifiedIntake(intake)) return false;
      const sd = parseJson(intake.source_detail, {});
      if (CONFIRMING_CHANNELS.has(intake.first_channel) || sd.identity_confirmed_at || sd.sender_verified) return true;
    }
    const cid = clientId ?? intake?.client_id;
    return !!cid && phoneVerifiedFor(cid, storyPhone(cid, intake));
  }

  /** تأكيد القصة (يستخدمه زر «تأكيد الهوية» ورسالة واتساب فيها رقم الطلب وكود التأكيد) */
  function confirmStory(intake, via, actor = null) {
    const sd = parseJson(intake.source_detail, {});
    delete sd.phone_match_unverified;
    sd.identity_confirmed_at = nowIso();
    sd.identity_confirmed_via = via;
    if (actor?.id) {
      sd.identity_confirmed_by = actor.id;
      sd.identity_confirmed_by_name = actor.name;
    }
    delete sd.confirm_hash; // الكود استُخدم مرة واحدة
    db.update('intakes', intake.id, { source_detail: JSON.stringify(sd), updated_at: nowIso() });
    return sd;
  }

  /**
   * كود التأكيد في رسالة واتساب من نفس الرقم: يعيد 'confirmed' أو 'wrong' أو 'locked' أو null (لا كود أو لا ينطبق).
   * 5 أكواد خاطئة تقفل التأكيد بالرسالة (أرقام الطلبات متسلسلة فلا يُسمح بالتخمين) وتُنبَّه الإدارة.
   */
  function tryConfirmCode(intake, senderPhone, text) {
    const m = CONFIRM_CODE_RE.exec(latinDigits(String(text || '')));
    if (!m || !intake) return null;
    if (normalizePhone(intake.contact_phone || '') !== normalizePhone(senderPhone || '')) return null;
    const sd = parseJson(intake.source_detail, {});
    if (!isPortalUnverifiedIntake(intake)) return null; // مؤكدة بالفعل
    if (sd.confirm_locked_at) return 'locked';
    const fresh = sd.confirm_hash && (!sd.confirm_expires_at || sd.confirm_expires_at > nowIso());
    // البصمة المفتاحية الحالية، مع قبول البصمة القديمة (sha256) للأكواد الصادرة قبل التحديث حتى تنتهي صلاحيتها
    if (fresh && (app.integrations.hmac('intake-confirm', m[1]) === sd.confirm_hash || sha256(m[1]) === sd.confirm_hash)) {
      confirmStory(intake, 'whatsapp_ref');
      // v9.1 fixes: الرسالة تثبت أن صاحب الرقم هو من أرسلها، لا أن المتصفح الذي يحمل رابط الموقع هو صاحب الرقم
      // (أي شخص يعرف الرقم يستطيع تقديم طلب به ثم استدراج صاحبة الرقم لإرسال الرسالة الجاهزة). روابط الموقع
      // التي صدرت لهذا الطلب قبل التأكيد تُلغى، والرابط الجديد يصلها في رد واتساب على رقمها فقط.
      const revoked = app.clients.revokePortalTokens(intake.client_id, { intakeId: intake.id });
      app.activity.log({
        intake_id: intake.id,
        client_id: intake.client_id,
        actor: { kind: 'client' },
        type: 'identity.confirmed',
        summary: `أكّدت المستفيدة رقمها برسالة واتساب فيها رقم الطلب وكود التأكيد${revoked ? ' (أُلغي رابط الموقع القديم ووصلها رابط جديد على واتساب)' : ''}`,
        data: { via: 'whatsapp_ref', revoked_links: revoked },
      });
      return 'confirmed';
    }
    const failures = (Number(sd.confirm_failures) || 0) + 1;
    sd.confirm_failures = failures;
    if (failures >= CONFIRM_MAX_FAILURES) {
      sd.confirm_locked_at = nowIso();
      delete sd.confirm_hash;
    }
    db.update('intakes', intake.id, { source_detail: JSON.stringify(sd) });
    if (failures >= CONFIRM_MAX_FAILURES) {
      app.notifications.notifyStaff({
        type: 'identity.confirm_locked',
        title: `توقف تأكيد الرقم برسالة واتساب في الطلب ${intake.code}`,
        body: `وصلت ${CONFIRM_MAX_FAILURES} رسائل بكود تأكيد غير صحيح. اتصلوا بالمستفيد/ة وتأكدوا من هويته/ها ثم اضغطوا «تأكيد الهوية».`,
        link: `#/inbox/${intake.id}`,
      });
      return 'locked';
    }
    return 'wrong';
  }

  /**
   * verifiedSender: المرسل أثبت ملكية الرقم (واتساب) أو دخل برابط بوابة العميل الكامل.
   * هذا المرسل لا تُوجَّه رسائله تلقائيًا إلى طلب غير موثّق أنشأه شخص آخر من الموقع بنفس الرقم،
   * وإلا وصلت رسائل صاحب الرقم إلى رابط بوابة ذلك الشخص.
   */
  function findTarget(client, { refIntake, forceNew, caseId, intakeId, verifiedSender, portalSender = false }) {
    if (intakeId) {
      // رسالة من رابط بوابة خاص بطلب بعينه
      const i = db.get('SELECT * FROM intakes WHERE id = ? AND client_id = ?', intakeId, client.id);
      if (i) {
        const c = i.case_id ? db.get('SELECT * FROM cases WHERE id = ?', i.case_id) : null;
        return { intake: i, caseRow: c };
      }
    }
    if (caseId) {
      // رد موجه لملف بعينه (مثل الرد على طلب معلومات من البوابة)
      const c = db.get('SELECT * FROM cases WHERE id = ? AND client_id = ?', caseId, client.id);
      if (c) return { intake: c.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null, caseRow: c };
    }
    // طلب «جديد» صريح (نموذج الموقع) يتقدم على أي رقم طلب مذكور في النص
    if (forceNew) return { intake: null, caseRow: null };
    if (refIntake) return { intake: refIntake, caseRow: refIntake.case_id ? db.get('SELECT * FROM cases WHERE id = ?', refIntake.case_id) : null };
    const skipUnverified = verifiedSender ? 1 : 0;
    // صاحب رابط البوابة الكامل (رمز واتساب أو رابط من الإدارة) لا يرى الطلبات غير الموثّقة في صفحته،
    // فلا تُوجَّه رسالته إليها أيضًا (وإلا وصلت لرابط مقدّم طلب الموقع الذي ربما أخطأ في كتابة رقمه).
    // v9.1 fixes: ونفس القاعدة لصاحب الرقم على واتساب: طلب الموقع غير المؤكد صدر له رابط قبل التأكيد، فلا تُوجَّه إليه
    // رسائل صاحب الرقم تلقائيًا (وإلا ردّت عليها الإدارة في صفحة المتابعة فقرأها حامل رابط الموقع). يبقى ذكر رقم الطلب
    // صراحة (refIntake أعلاه) وتأكيده بالكود أو من الإدارة.
    const skipSql = portalUnverifiedSql();
    const openIntake = db.get(
      `SELECT * FROM intakes WHERE client_id = ? AND status IN ('new','in_review','awaiting_client')
         AND NOT (? = 1 AND ${skipSql})
       ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openIntake) return { intake: openIntake, caseRow: null };
    const unverifiedCaseIds = `SELECT id FROM cases WHERE intake_id IN (SELECT id FROM intakes WHERE ${skipSql})`;
    const openCase = db.get(
      `SELECT * FROM cases WHERE client_id = ? AND status != 'closed' AND NOT (? = 1 AND id IN (${unverifiedCaseIds})) ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openCase) {
      return { intake: openCase.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', openCase.intake_id) : null, caseRow: openCase };
    }
    // ملف عمل مستمر مفتوح (قضية أمام المحكمة) بعد إغلاق الاستشارة
    const openMatter = db.get(
      `SELECT * FROM matters WHERE client_id = ? AND status != 'closed'
         AND NOT (? = 1 AND case_id IN (${unverifiedCaseIds}))
       ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openMatter) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', openMatter.case_id);
      return { intake: c?.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null, caseRow: c, matter: openMatter };
    }
    return { intake: null, caseRow: null };
  }

  const engine = {
    lastInbound,
    /** وضع المعاينة: الرسائل تُسجَّل فقط (داخل معاملة سيُتراجع عنها) ولا تُرسل لواتساب */
    dryRun: false,

    /**
     * استقبال رسالة واردة موحدة من أي قناة.
     * msg: { channel, external_id, from_phone, from_email, contact_name, text, attachments, timestamp,
     *        attribution: {source, campaign, detail}, governorate, legal_area_hint, portal_client_id,
     *        force_new_intake, intake_kind }
     * @returns {{ duplicate, client, intake, caseRow, message_id, created_intake, document_ids }}
     */
    receive(msg) {
      if (!LABELS.channel[msg.channel]) throw badRequest('قناة غير معروفة');
      const text = String(msg.text ?? '').slice(0, 20000);
      const result = db.tx(() => {
        if (msg.external_id) {
          const dup = db.get('SELECT id, intake_id, case_id, client_id FROM messages WHERE channel = ? AND external_id = ?', msg.channel, msg.external_id);
          if (dup) return { duplicate: true, message_id: dup.id };
        }
        const t = nowIso();
        // 1) تحديد العميل
        let client;
        let createdClient = false;
        if (msg.portal_client_id) {
          client = app.clients.require(msg.portal_client_id);
        } else {
          if (!msg.from_phone && !msg.from_email) throw badRequest('لا يمكن تحديد المرسل: رقم الهاتف أو البريد مطلوب');
          const r = app.clients.resolveOrCreate({
            phone: msg.from_phone,
            email: msg.from_email,
            name: msg.contact_name,
            governorate: msg.governorate,
            channel: msg.channel,
            // واتساب يثبت ملكية الرقم؛ أما الموقع فالرقم والبريد مجرد بيانات مُدخلة
            verified: msg.channel !== 'website',
          });
          client = r.client;
          createdClient = r.created;
        }

        // المرسل موثّق: واتساب يثبت ملكية الرقم، ورابط البوابة الكامل يصدره الموظفون للعميل نفسه.
        // أما نموذج الموقع ورابط البوابة الخاص بطلب واحد فبياناتهما مجرد مُدخلات غير مثبتة.
        const verifiedSender = msg.channel !== 'website' || (!!msg.portal_client_id && !msg.target_intake_id);

        // 1-ب) رد على استبيان الرضا (زر أو رقم من 1 إلى 5 أو تعليق بعد تقييم منخفض):
        // يُسجَّل تقييمًا في ملفه بدل أن يفتح طلبًا جديدًا أو يُنبّه الإدارة برسالة «جديدة»
        const surveyMatch = app.messaging?.matchSurveyReply?.(client, msg, text, { verifiedSender });
        if (surveyMatch) {
          const sc = surveyMatch.caseRow;
          const smeta = { survey_id: surveyMatch.survey.id, survey_reply: surveyMatch.kind };
          if (msg.timestamp) smeta.provider_timestamp = msg.timestamp;
          if (msg.context_id) smeta.reply_to = msg.context_id;
          const surveyMessageId = db.insert('messages', {
            client_id: client.id,
            intake_id: sc.intake_id ?? null,
            case_id: sc.id,
            matter_id: sc.matter_id ?? null,
            direction: 'in',
            channel: msg.channel,
            external_id: msg.external_id || null,
            body: text,
            status: 'received',
            meta: JSON.stringify(smeta),
            created_at: t,
          });
          const outcome = app.messaging.recordSurveyReply(surveyMatch, { messageId: surveyMessageId, channel: msg.channel, text });
          return {
            duplicate: false,
            client,
            created_client: createdClient,
            intake: null,
            caseRow: sc,
            message_id: surveyMessageId,
            created_intake: false,
            document_ids: [],
            survey: outcome,
          };
        }

        // 2) رقم طلب مذكور في الرسالة (الانتقال من الموقع إلى واتساب)
        // لا نتبع رقم الطلب لمرسل غير موثّق: من يعرف رقم هاتف عميل ورقم طلبه لا يصل بذلك إلى ملفه
        let refIntake = null;
        let identityConflict = null;
        let mentionedRef = null;
        let refToUnverified = null;
        let confirmOutcome = null; // v9.1 b-site: نتيجة كود التأكيد في رسالة واتساب
        let confirmedIntake = null;
        // v9.1 b-site: رقم الطلب يُقبل بالأرقام العربية أيضًا («REQ-٢٠٢٦-٠٠٠٢٩») مثل كود التأكيد
        const m = REF_RE.exec(latinDigits(text));
        // v9.1 fixes: رسالة تأكيد الرقم الجاهزة (رقم الطلب + كود التأكيد) تُعلَّم فلا تدخل وقائع الطلب ولا تحليله ولا معاينته
        const confirmLike = msg.channel === 'whatsapp' && !!m && CONFIRM_CODE_RE.test(latinDigits(text));
        if (m && !verifiedSender) mentionedRef = `REQ-${m[1]}-${m[2]}`;
        if (m && verifiedSender) {
          let ref = db.get('SELECT * FROM intakes WHERE code = ?', `REQ-${m[1]}-${m[2]}`);
          if (ref) {
            const refClient = ref.client_id ? app.clients.get(ref.client_id) : null;
            // v9.1 b-site (B91-01): رقم الطلب + كود التأكيد من نفس الرقم عبر واتساب = إثبات ملكية الرقم (مثل رمز الدخول)
            if (refClient && refClient.id === client.id && msg.channel === 'whatsapp') {
              confirmOutcome = tryConfirmCode(ref, msg.from_phone, text);
              if (confirmOutcome === 'confirmed') {
                ref = db.get('SELECT * FROM intakes WHERE id = ?', ref.id);
                confirmedIntake = ref;
              }
            }
            if (refClient && refClient.id === client.id && isPortalUnverifiedIntake(ref)) {
              // v9.1 fixes: صاحب الرقم يذكر رقم طلب موقع لم يتأكد (بلا كود صحيح): أرقام الطلبات متسلسلة وقد يكون شخص آخر
              // قدّم الطلب برقمه ويحمل رابطه. لا تُضاف رسالته إلى ذلك الطلب (وإلا ردّت الإدارة عليها في صفحة الموقع فقرأها
              // حامل الرابط)، ولا يُعاد فتحه؛ تُنبَّه الإدارة لتؤكد الهوية من صفحة الطلب إن كان هو مقدّمه.
              refToUnverified = ref;
              mentionedRef = ref.code;
            } else if (refClient && refClient.id === client.id) {
              // نستخدم الطلب المذكور فقط إذا كان ما زال حيًا؛ أما المنتهي فلا نُلحق به الرسالة حتى لا تُدفن في ملف مغلق
              const refCase = ref.case_id ? db.get('SELECT status FROM cases WHERE id = ?', ref.case_id) : null;
              if (['new', 'in_review', 'awaiting_client'].includes(ref.status) || (refCase && refCase.status !== 'closed')) {
                refIntake = ref;
              } else if (['handled_internally', 'archived'].includes(ref.status) && !ref.case_id) {
                // العميل عاد لنفس الموضوع: نعيد فتح الطلب للفرز
                db.update('intakes', ref.id, { status: 'in_review', updated_at: nowIso() });
                refIntake = db.get('SELECT * FROM intakes WHERE id = ?', ref.id);
              }
            } else if (refClient) {
              // رقم مختلف يذكر رقم طلب لعميل آخر: لا ندمج تلقائيًا حماية للخصوصية، ونطلب تحقق الإدارة
              identityConflict = { intake_id: ref.id, intake_code: ref.code, client_code: refClient.code };
            }
          }
        }

        // 3) تحديد الطلب/الملف المستهدف
        const target = findTarget(client, {
          refIntake,
          forceNew: !!msg.force_new_intake,
          caseId: msg.target_case_id,
          intakeId: msg.target_intake_id,
          verifiedSender,
          portalSender: !!msg.portal_client_id && !msg.target_intake_id,
        });
        let intake = target.intake;
        let caseRow = target.caseRow;
        const matter = target.matter || (caseRow?.matter_id ? db.get('SELECT * FROM matters WHERE id = ?', caseRow.matter_id) : null);
        let createdIntake = false;

        if (!intake) {
          let attribution = msg.attribution || null;
          const previous = Number(db.value('SELECT COUNT(*) FROM intakes WHERE client_id = ?', client.id));
          if (msg.channel === 'website' && !createdClient && !msg.portal_client_id) {
            // طلب من الموقع برقم عميل موجود: الرقم غير موثّق، فننبه الإدارة قبل الاعتماد على هذا الربط
            attribution = { ...(attribution || {}), detail: { ...((attribution && attribution.detail) || {}), phone_match_unverified: true } };
          }
          if (msg.channel === 'website' && verifiedSender) {
            // طلب جديد كتبه صاحب رابط بوابة كامل (أثبت ملكية الرقم): يظهر في بوابته رغم أن قناته «الموقع»
            attribution = { ...(attribution || {}), detail: { ...((attribution && attribution.detail) || {}), sender_verified: true } };
          }
          if (!attribution || !attribution.source || attribution.source === 'unknown') {
            attribution = { ...(attribution || {}), source: previous > 0 ? 'returning' : attribution?.source || 'unknown' };
          }
          const id = db.insert('intakes', {
            code: nextIntakeCode(t),
            client_id: client.id,
            status: 'new',
            kind: msg.intake_kind || null,
            first_channel: msg.channel,
            last_channel: msg.channel,
            channels: JSON.stringify([msg.channel]),
            source: LABELS.source[attribution.source] ? attribution.source : 'unknown',
            source_detail: JSON.stringify(attribution.detail || {}),
            campaign: attribution.campaign || null,
            legal_area: msg.legal_area_hint || null,
            contact_name: msg.contact_name || client.name || null,
            contact_phone: msg.from_phone || app.clients.primaryPhone(client.id),
            governorate: msg.governorate || client.governorate || null,
            created_at: t,
            updated_at: t,
          });
          intake = db.get('SELECT * FROM intakes WHERE id = ?', id);
          createdIntake = true;
          app.activity.log({
            intake_id: intake.id,
            client_id: client.id,
            actor: { kind: 'client' },
            type: 'intake.created',
            summary: `طلب وارد جديد عبر ${LABELS.channel[msg.channel]} (المصدر: ${LABELS.source[intake.source]})`,
            data: { channel: msg.channel, source: intake.source, campaign: intake.campaign },
          });
        }

        // 4) حفظ الرسالة
        const meta = {};
        if (msg.referral) meta.referral = msg.referral;
        if (identityConflict) meta.identity_conflict = identityConflict;
        if (mentionedRef) meta.mentioned_ref = mentionedRef; // للمراجعة اليدوية فقط، دون ربط تلقائي
        if (confirmLike) meta.identity_confirm = confirmOutcome || 'unmatched';
        if (msg.context_id) meta.reply_to = msg.context_id;
        if (msg.info_request_id) meta.info_request_id = msg.info_request_id;
        // v9.1 b-portal: بيانات منظمة لرسالة من صفحة المتابعة (سؤال على رد، رد على موعد، طلب مكالمة…)
        if (msg.extra_meta && typeof msg.extra_meta === 'object') {
          for (const [k, val] of Object.entries(msg.extra_meta)) if (val !== undefined && !(k in meta)) meta[k] = val;
        }
        // نعتمد وقت الاستلام في الخادم للترتيب، ونحفظ توقيت المزوّد للرجوع إليه
        if (msg.timestamp) meta.provider_timestamp = msg.timestamp;
        const messageId = db.insert('messages', {
          client_id: client.id,
          intake_id: intake?.id ?? null,
          case_id: caseRow?.id ?? null,
          matter_id: matter?.id ?? null,
          direction: 'in',
          channel: msg.channel,
          external_id: msg.external_id || null,
          body: text,
          status: 'received',
          meta: JSON.stringify(meta),
          created_at: t,
        });

        // 5) المرفقات القادمة من الواجهة (base64) تُحفظ فورًا؛ وسائط واتساب تُنزَّل لاحقًا بشكل غير متزامن
        const documentIds = [];
        for (const a of msg.attachments || []) {
          if (a.data_base64 || a.buffer) {
            documentIds.push(
              app.documents.save(a, {
                client_id: client.id,
                intake_id: intake?.id,
                case_id: caseRow?.id,
                // لا نربط المرفق بالملف المستمر: المحامي المسؤول لا يرى مرفقات العميل إلا إذا أتاحتها الإدارة
                message_id: messageId,
                info_request_id: msg.info_request_id,
              }, { kind: 'client' }),
            );
          }
        }

        // 6) تحديث العدادات والحالة
        if (intake) {
          const chans = parseJson(intake.channels, []);
          if (!chans.includes(msg.channel)) chans.push(msg.channel);
          db.update('intakes', intake.id, {
            last_message_at: t,
            last_inbound_at: t,
            last_channel: msg.channel,
            channels: JSON.stringify(chans),
            unread_count: (intake.unread_count || 0) + 1,
            // رسالة البوابة تعيد طلبًا منتهيًا للفرز، إلا إذا كان طلبًا غير موثّق الهوية فيبقى كما أغلقته الإدارة
            status:
              intake.status === 'awaiting_client' ||
              (msg.target_intake_id && ['handled_internally', 'archived'].includes(intake.status) && !isUnverifiedIntake(intake))
                ? 'in_review'
                : intake.status,
            updated_at: t,
          });
        }
        if (caseRow) {
          db.run('UPDATE cases SET unread_count = unread_count + 1, updated_at = ? WHERE id = ?', t, caseRow.id);
        }
        if (!createdIntake) {
          app.activity.log({
            intake_id: intake?.id,
            case_id: caseRow?.id,
            matter_id: matter?.id,
            client_id: client.id,
            actor: { kind: 'client' },
            type: 'message.received',
            summary: `رسالة جديدة من العميل عبر ${LABELS.channel[msg.channel]}`,
            data: { message_id: messageId },
          });
        }

        // 7) إشعارات الإدارة
        if (identityConflict) {
          app.notifications.notifyStaff({
            type: 'identity_conflict',
            title: `رقم جديد يذكر الطلب ${identityConflict.intake_code}`,
            body: 'وصلت رسالة من رقم غير مسجل لصاحب الطلب. تحقق من هوية المرسل قبل دمج العميلين.',
            link: `#/inbox/${intake.id}`,
          });
        }
        // v9.1 b-site: تأكيد تلقائي بالكود ← ملاحظة في سجل الطلب (أعلاه) بدل تنبيه الإدارة
        if (refToUnverified && !confirmedIntake) {
          app.notifications.notifyStaff({
            type: 'identity.ref_from_owner',
            title: `صاحب الرقم ذكر الطلب ${refToUnverified.code} عبر ${LABELS.channel[msg.channel]}`,
            body: 'الطلب أُنشئ من الموقع ورقمه غير مؤكد، فلم تُضف الرسالة إليه (قد يكون شخص آخر قدّمه بهذا الرقم). إن كان المرسل هو مقدّم الطلب فأكّدوا هويته من صفحة الطلب.',
            link: `#/inbox/${refToUnverified.id}`,
          });
        }
        if (createdIntake) {
          app.notifications.notifyStaff({
            type: 'intake.new',
            title: `طلب وارد جديد ${intake.code} عبر ${LABELS.channel[msg.channel]}`,
            body: truncate(text, 140),
            link: `#/inbox/${intake.id}`,
          });
        } else if (caseRow && !msg.skip_staff_notice) {
          // (v9.1 b-portal: رسائل صفحة المتابعة المنظمة ترسل إشعارها المحدد بنفسها بدل هذا الإشعار العام)
          const pending = Number(
            db.value("SELECT COUNT(*) FROM info_requests WHERE case_id = ? AND status = 'sent_to_client'", caseRow.id),
          );
          app.notifications.notifyStaff(
            {
              type: 'case.client_message',
              title: `رسالة جديدة من العميل في الملف ${caseRow.code}`,
              body: pending ? `قد تكون ردًا على طلب معلق للعميل (الطلبات المعلقة: ${pending}). ${truncate(text, 100)}` : truncate(text, 140),
              link: `#/cases/${caseRow.id}`,
            },
            { caseManagerId: caseRow.case_manager_id },
          );
        }

        return {
          duplicate: false,
          client,
          created_client: createdClient,
          intake: intake ? db.get('SELECT * FROM intakes WHERE id = ?', intake.id) : null,
          caseRow,
          message_id: messageId,
          created_intake: createdIntake,
          document_ids: documentIds,
          // v9.1 b-site: الطلب الذي تأكد رقمه بهذه الرسالة (رقم الطلب + كود التأكيد)
          confirmed_intake: confirmedIntake,
          confirm_outcome: confirmOutcome,
          identity_confirm: confirmLike,
        };
      });
      // v9.1 b-site (B91-01): ردّ واتساب فوري بعد تأكيد الرقم برابط صفحتها (نطاق الرقم نفسه، مثل الدخول برمز)
      if (result.confirmed_intake && !result.duplicate) {
        try {
          engine.sendConfirmationReply(result.client, result.confirmed_intake, msg.from_phone);
        } catch (e) {
          app.log('confirmation reply failed', e);
        }
      }

      if (result.survey) {
        // شكر العميل على تقييمه (وطلب تعليقه إن كان التقييم منخفضًا) بعد حفظ التقييم
        try {
          app.messaging.afterSurveyReply(result.survey);
        } catch (e) {
          app.log('survey follow-up failed', e);
        }
        return result;
      }
      if (!result.duplicate && msg.reply?.id && app.portal?.onButtonReply) {
        // v9.1 b-portal: زر «هحضر / مش هقدر» في تذكير الجلسة على واتساب = نفس رد صفحة المتابعة
        try {
          app.portal.onButtonReply(result, msg);
        } catch (e) {
          app.log('event button reply failed', e);
        }
      }
      if (!result.duplicate) {
        // تحليل الذكاء الاصطناعي للطلبات التي لم تتحول بعد إلى ملفات (مؤجل قليلًا لتجميع الرسائل المتتابعة)
        // (v9.1 fixes: رسالة تأكيد الرقم وحدها لا تضيف وقائع، فلا تعيد التحليل)
        const onlyConfirm = result.identity_confirm && !stripIdentityConfirm(msg.text).replace(/[\s،,.!؟?]/g, '') && !(msg.attachments || []).length;
        if (result.intake && !result.caseRow && result.intake.status !== 'converted' && !onlyConfirm) {
          app.ai.scheduleIntakeAnalysis(result.intake.id);
        }
        // تنزيل وسائط واتساب في الخلفية
        const pendingMedia = (msg.attachments || []).filter((a) => a.media_id);
        if (pendingMedia.length) engine.fetchWhatsAppMedia(result, pendingMedia).catch((e) => app.log('media', e));
      }
      return result;
    },

    async fetchWhatsAppMedia(result, items) {
      for (const a of items) {
        if (!app.whatsapp.configured) {
          db.run(
            "UPDATE messages SET meta = json_set(meta, '$.pending_media', json(?)) WHERE id = ?",
            JSON.stringify(items.map((x) => ({ media_id: x.media_id, kind: x.kind, mime: x.mime }))),
            result.message_id,
          );
          return;
        }
        try {
          const { buffer, mime } = await app.whatsapp.downloadMedia(a.media_id);
          const ext = { image: 'jpg', audio: 'ogg', video: 'mp4', document: 'pdf' }[a.kind] || 'bin';
          app.documents.save(
            { filename: a.filename || `${a.kind}-${a.media_id}.${ext}`, mime: a.mime || mime, buffer },
            {
              client_id: result.client.id,
              intake_id: result.intake?.id,
              case_id: result.caseRow?.id,
              message_id: result.message_id,
            },
            { kind: 'client' },
          );
        } catch (e) {
          app.log('whatsapp media download failed', e);
        }
      }
    },

    /** معالجة Webhook واتساب بالكامل */
    handleWhatsAppWebhook(payload) {
      const { messages, statuses } = parseWebhook(payload);
      const results = [];
      let failed = 0;
      for (const m of messages) {
        if (!m.from_phone) continue;
        // رسالة واحدة معيبة لا يجب أن توقف بقية الدفعة (ميتا تعيد إرسال الدفعة كاملة عند الفشل)
        try {
          const attribution = sourceFromReferral(m.referral);
          results.push(engine.receive({ ...m, attribution }));
        } catch (e) {
          failed++;
          app.log(`whatsapp inbound ${m.external_id} failed`, e);
        }
      }
      for (const s of statuses) {
        try {
          engine.applyStatus(s);
        } catch (e) {
          app.log('whatsapp status failed', e);
        }
      }
      return { received: results.filter((r) => !r.duplicate).length, duplicates: results.filter((r) => r.duplicate).length, failed, statuses: statuses.length };
    },

    applyStatus({ external_id, status, error }) {
      const allowed = ['sent', 'delivered', 'read', 'failed'];
      if (!allowed.includes(status)) return;
      const row = db.get("SELECT id, status FROM messages WHERE channel = 'whatsapp' AND external_id = ?", external_id);
      if (!row) return;
      // لا نرجع الحالة للخلف (read بعد delivered)
      const order = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
      if ((order[status] ?? 0) < (order[row.status] ?? 0) && status !== 'failed') return;
      db.update('messages', row.id, { status, error: error || null });
    },

    // ===================== الإرسال الموحد =====================
    // v9.1 b-site (B91-01): قاعدة واحدة لكل رسالة صادرة (رد الإدارة، طلب معلومة، الرد النهائي، مستند، أتمتة):
    // القصة المؤكدة ← واتساب (وتبقى في صفحة المتابعة)، وغير المؤكدة ← صفحة المتابعة فقط ولا يصل الرقم أي شيء.
    isStoryConfirmed,
    storyPhone,
    confirmStory,

    /**
     * اختيار القناة: 'whatsapp' للقصة المؤكدة التي لها رقم، وإلا 'website'.
     * طلب واتساب صراحة لقصة غير مؤكدة يُرفض (400) — زر «تأكيد الهوية» يرفع المنع.
     */
    pickChannel(clientId, requested = 'auto', { intakeId = null, caseId = null, matterId = null } = {}) {
      if (requested && !['auto', 'whatsapp', 'website'].includes(requested)) throw badRequest('قناة الإرسال غير مدعومة');
      if (requested === 'website') return 'website';
      const intake = storyIntake({ intakeId, caseId, matterId });
      const phone = storyPhone(clientId, intake);
      const confirmed = isStoryConfirmed({ clientId, intakeId, caseId, matterId });
      if (requested === 'whatsapp') {
        if (!phone) throw badRequest('لا يوجد رقم هاتف مسجل لهذا العميل للإرسال عبر واتساب');
        if (!confirmed) throw badRequest(UNCONFIRMED_WHATSAPP_ERROR);
        return 'whatsapp';
      }
      return confirmed && phone ? 'whatsapp' : 'website';
    },

    /** وصف القناة لصندوق الرد في صفحات الإدارة: «واتساب + صفحة المتابعة» أو «صفحة المتابعة فقط — الرقم غير مؤكد» */
    channelHint({ clientId, intakeId = null, caseId = null, matterId = null } = {}) {
      const confirmed = !!clientId && isStoryConfirmed({ clientId, intakeId, caseId, matterId });
      const phone = clientId ? storyPhone(clientId, storyIntake({ intakeId, caseId, matterId })) : null;
      return {
        confirmed,
        whatsapp: confirmed && !!phone,
        text: confirmed && phone ? 'واتساب + صفحة المتابعة' : confirmed ? 'صفحة المتابعة فقط — لا يوجد رقم واتساب' : 'صفحة المتابعة فقط — الرقم غير مؤكد',
      };
    },

    /** هل نحن داخل نافذة الـ 24 ساعة منذ آخر رسالة واتساب من العميل؟ */
    inWindow(clientId) {
      const lastIn = db.get(
        "SELECT created_at FROM messages WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' ORDER BY id DESC LIMIT 1",
        clientId,
      );
      return !!lastIn && addHours(lastIn.created_at, 24) > nowIso();
    },

    /**
     * إرسال رسالة للعميل عبر قناة المؤسسة.
     * meta.wa (اختياري) يحدد شكل رسالة واتساب: { type: 'document', document_id, caption } | { type: 'buttons', text, buttons, footer }
     *   | { type: 'otp' } | { purpose, force_template }؛ وmeta.vars قيم متغيرات القالب المربوط عند الإرسال خارج النافذة.
     * attachments: معرفات مستندات تُرفق بالرسالة (تظهر للعميل في البوابة وللإدارة في المحادثة).
     * @returns {object} صف الرسالة
     */
    sendToClient({ client_id, intake_id = null, case_id = null, matter_id = null, body, channel = 'auto', author = null, automated = false, rule = null, meta = {}, attachments = [], unconfirmed = null }) {
      if (!body || !String(body).trim()) throw badRequest('نص الرسالة فارغ');
      const client = app.clients.require(client_id);
      const story = { clientId: client.id, intakeId: intake_id, caseId: case_id, matterId: matter_id };
      // v9.1 b-site (B91-01): الرسائل الآلية لقصة غير مؤكدة لا تصل الرقم أبدًا. التذكيرات تُتخطى ({ skipped: 'unconfirmed' })
      // ويُبلَّغ المستدعي، وما سواها (unconfirmed: 'portal') يُتاح في صفحة المتابعة فقط.
      if (automated && channel !== 'website' && !isStoryConfirmed(story)) {
        if ((unconfirmed || 'skip') === 'skip') return { skipped: 'unconfirmed', id: null, channel: null, status: 'skipped' };
        channel = 'website';
      }
      const ch = engine.pickChannel(client.id, channel || 'auto', story);
      const to = ch === 'whatsapp' ? storyPhone(client.id, storyIntake(story)) : null;
      const row = engine.record({ client_id: client.id, intake_id, case_id, matter_id, channel: ch, to, body, author, automated, rule, meta, attachments });
      if (intake_id) db.update('intakes', intake_id, { last_message_at: row.created_at, unread_count: 0, updated_at: row.created_at });
      return row;
    },

    /**
     * تسجيل رسالة صادرة ثم إرسالها (واتساب) أو إتاحتها في البوابة (الموقع).
     * secret: قيم لا تُحفظ في قاعدة البيانات أبدًا (مثل رمز الدخول) وتُستخدم عند الإرسال الفعلي فقط: { text, vars }.
     */
    record({ client_id, intake_id = null, case_id = null, matter_id = null, channel, to = null, body, author = null, automated = false, rule = null, meta = {}, attachments = [], secret = null }) {
      const t = nowIso();
      const docIds = [...new Set((attachments || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
      const fullMeta = { ...meta };
      if (docIds.length) {
        fullMeta.sent_documents = docIds
          .map((id) => app.documents.get(id))
          .filter(Boolean)
          .map((d) => ({ id: d.id, title: d.title, filename: d.filename, mime: d.mime, size: d.size }));
      }
      const id = db.insert('messages', {
        client_id,
        intake_id,
        case_id,
        matter_id,
        direction: 'out',
        channel,
        to_address: channel === 'whatsapp' ? to : null,
        body: String(body).slice(0, 4096),
        author_user_id: author?.id ?? null,
        automated: automated ? 1 : 0,
        automation_rule: rule,
        status: channel === 'website' ? 'sent' : 'queued',
        meta: JSON.stringify(fullMeta),
        sent_at: channel === 'website' ? t : null,
        created_at: t,
      });
      for (const docId of docIds) {
        db.run('INSERT OR IGNORE INTO message_attachments (message_id, document_id, created_at) VALUES (?, ?, ?)', id, docId, t);
      }
      if (channel === 'whatsapp') {
        if (!to) {
          db.update('messages', id, { status: 'failed', error: 'لا يوجد رقم هاتف مسجل لهذا العميل للإرسال عبر واتساب' });
        } else if (!app.whatsapp.configured) {
          db.update('messages', id, { status: 'simulated', sent_at: t });
        } else if (engine.dryRun) {
          // معاينة (مثل «كم رسالة ستُرسل لو شُغلت القواعد الآن؟»): تُسجَّل داخل معاملة تُلغى، ولا تُرسل أبدًا
        } else {
          if (secret) secrets.set(id, secret);
          // الإرسال الفعلي غير متزامن؛ الحالة تُحدَّث عند النجاح/الفشل ومن Webhook الحالات
          engine.dispatch(id).catch((e) => app.log('dispatch', e));
        }
      }
      return db.get('SELECT * FROM messages WHERE id = ?', id);
    },

    /** إرسال رسالة واتساب مسجلة بالفعل (مع مراعاة نافذة الـ 24 ساعة والقوالب المربوطة) */
    async dispatch(messageId) {
      const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
      const secret = secrets.get(messageId) || null;
      secrets.delete(messageId);
      if (!msg || msg.status !== 'queued' || msg.channel !== 'whatsapp') return;
      const meta = parseJson(msg.meta, {});
      const wa = meta.wa || {};
      const inWindow = engine.inWindow(msg.client_id);
      try {
        let wamid;
        let via;
        let templateName = null;
        if (wa.type === 'otp' && !secret) {
          // الرمز لا يُحفظ في قاعدة البيانات؛ رسالة عالقة بعد إعادة تشغيل الخادم لم تعد صالحة
          throw Object.assign(new Error('otp expired'), { arabic: 'انتهت صلاحية رمز الدخول قبل إرساله (أُعيد تشغيل الخادم). يطلب العميل رمزًا جديدًا.' });
        }
        if (wa.type === 'document') {
          if (!inWindow) {
            throw Object.assign(new Error('outside 24h window'), {
              arabic: 'لا يرسل واتساب المستندات إلا خلال 24 ساعة من آخر رسالة من العميل.',
            });
          }
          const doc = app.documents.get(wa.document_id);
          if (!doc) throw Object.assign(new Error('document missing'), { arabic: 'المستند المطلوب إرساله لم يعد موجودًا' });
          const abs = path.join(config.uploadsDir, doc.storage_key);
          if (!abs.startsWith(config.uploadsDir + path.sep) || !fs.existsSync(abs)) {
            throw Object.assign(new Error('document file missing'), { arabic: 'ملف المستند غير موجود على الخادم' });
          }
          const mediaId = await app.whatsapp.uploadMedia({ buffer: fs.readFileSync(abs), mime: doc.mime, filename: doc.filename });
          wamid = await app.whatsapp.sendDocument(msg.to_address, { mediaId, filename: doc.filename, caption: wa.caption || null });
          via = 'document';
        } else if (wa.type === 'buttons' && inWindow && Array.isArray(wa.buttons) && wa.buttons.length) {
          wamid = await app.whatsapp.sendButtons(msg.to_address, renderLinks(msg, wa.text || meta.wa_text || msg.body), wa.buttons, { footer: wa.footer });
          via = 'interactive';
        } else if (inWindow && !wa.force_template) {
          // v9.1 b-site: meta.wa_text = نص واتساب (مثل طلب المستند مع «صوّري الورقة وابعتيها هنا» ورابط صفحتها)،
          // ونص الرسالة نفسه هو ما يظهر في صفحة المتابعة. (v9.1 fixes: {portal_link} يُستبدل برابط جديد هنا فقط)
          wamid = await app.whatsapp.sendText(msg.to_address, secret?.text || renderLinks(msg, meta.wa_text || msg.body));
          via = 'session';
        } else {
          const plan = app.messaging?.templatePlan ? app.messaging.templatePlan(msg, meta, secret?.vars || {}) : legacyPlan(msg);
          if (!plan) {
            throw Object.assign(new Error('no template'), {
              arabic: 'خارج نافذة الـ 24 ساعة ولا يوجد قالب رسائل معتمد مربوط بهذا الغرض. اربط قالبًا من صفحة «الردود الجاهزة والقوالب».',
            });
          }
          wamid = await app.whatsapp.sendTemplate(msg.to_address, plan.name, plan.language, plan.params, { buttons: plan.buttons || [] });
          via = 'template';
          templateName = plan.name;
        }
        db.update('messages', msg.id, {
          status: 'sent',
          external_id: wamid,
          sent_at: nowIso(),
          error: null,
          meta: JSON.stringify({ ...meta, via, ...(templateName ? { template: templateName } : {}) }),
        });
      } catch (e) {
        let reason = String(e.arabic || e.message || e);
        // مستند تعذر إرساله عبر واتساب (خارج النافذة أو رفضته ميتا) لا يضيع على العميل: يُتاح له في بوابة العملاء برسالة مستقلة
        if (wa.type === 'document') {
          const fallback = portalFallback(msg, wa);
          if (fallback) reason = `${reason.replace(/[.،\s]+$/, '')}. أُتيح المستند للعميل في بوابة العملاء بدلًا من ذلك.`;
        }
        db.update('messages', msg.id, { status: 'failed', error: reason.slice(0, 500) });
        // فشل رمز الدخول يظهر في صندوق الصادر وسجل الأمان دون إغراق الإدارة بإشعار لكل طلب من الموقع العام
        if (wa.type !== 'otp') {
          app.notifications.notifyStaff({
            type: 'message.failed',
            title: wa.type === 'document' ? 'تعذر إرسال المستند عبر واتساب' : 'تعذر إرسال رسالة واتساب',
            body: reason.slice(0, 200),
            link: msg.case_id ? `#/cases/${msg.case_id}` : msg.intake_id ? `#/inbox/${msg.intake_id}` : '#/automations',
          });
        }
      }
    },

    /** إعادة محاولة رسالة فاشلة */
    retry(messageId) {
      const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
      if (!msg || msg.direction !== 'out') throw notFound('الرسالة غير موجودة');
      if (msg.status !== 'failed') throw badRequest('يمكن إعادة إرسال الرسائل الفاشلة فقط');
      if (parseJson(msg.meta, {}).wa?.type === 'otp') throw badRequest('لا يُعاد إرسال رموز الدخول؛ يطلب العميل رمزًا جديدًا من صفحة البوابة');
      db.update('messages', msg.id, { status: 'queued', error: null });
      if (!app.whatsapp.configured) db.update('messages', msg.id, { status: 'simulated', sent_at: nowIso() });
      else engine.dispatch(msg.id).catch((e) => app.log('dispatch', e));
      return db.get('SELECT * FROM messages WHERE id = ?', msg.id);
    },

    /** إرسال أي رسائل عالقة في قائمة الانتظار (مثلًا بعد إعادة تشغيل الخادم) */
    async flushQueue() {
      if (!app.whatsapp.configured) return 0;
      const rows = db.all("SELECT id FROM messages WHERE direction = 'out' AND status = 'queued' AND channel = 'whatsapp' AND created_at < ? LIMIT 50", addHours(nowIso(), -0.02));
      for (const r of rows) await engine.dispatch(r.id);
      return rows.length;
    },

    // ───────────── v9.1 b-site (B91-10): كلمات رسائل المستفيد/ة ─────────────
    /**
     * متغيرات المخاطبة لرسالة: { first_name, form, ref } — الاسم بالكنية («أم محمد») والصيغة ('f' افتراضيًا، 'm' لـ«أبو …»
     * أو لما حددته الإدارة في address_form) ورقم الطلب REQ (الرقم الوحيد الذي تراه المستفيدة).
     */
    clientWords({ clientId, intakeId = null, caseId = null, matterId = null } = {}) {
      const client = clientId ? app.clients.get(clientId) : null;
      const intake = storyIntake({ intakeId, caseId, matterId });
      const name = client?.name || intake?.contact_name || '';
      const form = addressForm({ name, address_form: client?.address_form });
      return { first_name: addressName(name), form, ref: intake?.code || null };
    },

    /**
     * ملء نص رسالة للمستفيد/ة: {متغير} من القيم، ثم رموز النوع {ي}/{ة}. «أهلًا يا {first_name}» بلا اسم ← «أهلًا بيكي».
     * المتغيرات غير المعروفة تبقى كما هي.
     */
    fillClientText(template, values = {}, form = 'f') {
      let t = String(template ?? '');
      // (بلا اسم: «شكرًا على رأيك يا {first_name}.» ← «شكرًا على رأيك.» بلا مسافة قبل علامة الترقيم)
      if (!values.first_name) t = t.replace(/(أهلًا|أهلا|مرحبًا)\s+يا\s+\{first_name\}/g, '$1 بيك{ي}').replace(/[ \t]*يا\s+\{first_name\}/g, '').replace(/[ \t]*\{first_name\}/g, '');
      t = t.replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null && values[k] !== '' ? String(values[k]) : m));
      return genderize(t, form);
    },

    /**
     * رابط صفحة المتابعة لرسالة واتساب: نطاق الرقم نفسه مثل الدخول برمز (لا تظهر فيه قصص غير مؤكدة).
     * v9.1 fixes: رابط مطلق فقط (PUBLIC_BASE_URL)، وإلا null ولا يُصدر رابط (رابط «/p/…» نسبي لا يُفتح من واتساب).
     * يُستدعى عند الإرسال الفعلي فقط (renderLinks / templatePlan) فلا يُحفظ الرابط في نص الرسالة.
     */
    messageLink(clientId, phone) {
      if (!clientId || !config.publicBaseUrl) return null;
      if (app.clients.messageLink) return app.clients.messageLink(clientId, phone);
      const token = app.clients.issuePortalToken(clientId, { phone: phone || null, days: config.portalOtpTokenDays || 30 });
      return app.clients.portalUrl(token);
    },

    /** رابط صفحة المتابعة لقصة بعينها (على رقم القصة) — للقوالب التي تحتوي {portal_link} (عند الإرسال الفعلي فقط) */
    storyLink({ clientId, intakeId = null, caseId = null, matterId = null } = {}) {
      return engine.messageLink(clientId, storyPhone(clientId, storyIntake({ intakeId, caseId, matterId })));
    },

    withoutLinkLines,
    renderLinks: (msg, text) => renderLinks(msg, text),

    /** الرد الفوري بعد تأكيد الرقم برسالة واتساب (رقم الطلب + كود التأكيد) */
    sendConfirmationReply(client, intake, phone) {
      const to = normalizePhone(phone || intake.contact_phone || '') || storyPhone(client.id, intake);
      const words = engine.clientWords({ clientId: client.id, intakeId: intake.id });
      // v9.1 fixes: {portal_link} يبقى متغيرًا في نص واتساب ويُصدر الرابط عند الإرسال؛ النص المحفوظ بلا سطر الرابط
      const text = engine.fillClientText(
        CLIENT_TEXTS.confirm_reply,
        { first_name: words.first_name, ref: intake.code, org_name: app.settings.get('org_name') || 'بيوت مصر' },
        words.form,
      );
      return engine.record({
        client_id: client.id,
        intake_id: intake.id,
        case_id: intake.case_id || null,
        channel: 'whatsapp',
        to,
        body: withoutLinkLines(text),
        automated: true,
        rule: 'identity_confirm',
        meta: text.includes(PORTAL_LINK_VAR) ? { wa_text: text } : {},
      });
    },
  };

  /**
   * إتاحة مستند فشل إرساله عبر واتساب في بوابة العملاء (رسالة «الموقع» مرفق بها المستند).
   * مرة واحدة لكل رسالة فاشلة حتى لا تتكرر عند إعادة المحاولة. يعيد رسالة البوابة أو null.
   */
  function portalFallback(msg, wa) {
    try {
      const existing = db.get("SELECT * FROM messages WHERE client_id = ? AND json_extract(meta, '$.portal_fallback_for') = ?", msg.client_id, msg.id);
      if (existing) return existing;
      const doc = wa.document_id ? app.documents.get(wa.document_id) : null;
      if (!doc) return null;
      const org = app.settings.get('org_name') || 'بيوت مصر';
      // v9.1 b-site (B91-10): صياغة بسيطة بلا أكواد الملفات الداخلية
      const words = engine.clientWords({ clientId: msg.client_id, intakeId: msg.intake_id, caseId: msg.case_id, matterId: msg.matter_id });
      return engine.record({
        client_id: msg.client_id,
        intake_id: msg.intake_id,
        case_id: msg.case_id,
        matter_id: msg.matter_id,
        channel: 'website',
        body: engine.fillClientText(CLIENT_TEXTS.document_fallback, { title: doc.title || doc.filename, org_name: org }, words.form),
        author: msg.author_user_id ? { id: msg.author_user_id } : null,
        automated: !!msg.automated,
        meta: { portal_fallback_for: msg.id },
        attachments: [doc.id],
      });
    } catch (err) {
      app.log('document portal fallback failed', err);
      return null;
    }
  }

  /**
   * v9.1 fixes: نص واتساب عند الإرسال الفعلي: {portal_link} ← رابط جديد بنطاق رقم الرسالة (لا يُحفظ في قاعدة البيانات)،
   * وبلا رابط مطلق (PUBLIC_BASE_URL غير مضبوط) يُحذف سطر الرابط بدل إرسال «/p/…» لا يُفتح.
   */
  function renderLinks(msg, text) {
    const s = String(text ?? '');
    if (!s.includes(PORTAL_LINK_VAR)) return s;
    const link = msg?.client_id ? engine.messageLink(msg.client_id, msg.to_address) : null;
    return link ? s.split(PORTAL_LINK_VAR).join(link) : withoutLinkLines(s);
  }

  /** القالب الافتراضي القديم من الإعدادات: متغير واحد يحمل نص الرسالة */
  function legacyPlan(msg) {
    const s = app.settings.all();
    if (!s.whatsapp_template_name) return null;
    return { name: s.whatsapp_template_name, language: s.whatsapp_template_language || 'ar', params: [msg.body] };
  }

  return engine;
}

/** تجهيز رسائل المحادثة للعرض (للإدارة) */
export function mapMessage(r, docsByMessage = new Map()) {
  const meta = parseJson(r.meta, {});
  // المستندات المرسلة للعميل مع رسالة صادرة (إرسال مستند للعميل) تظهر مرفقة بها
  const sent = Array.isArray(meta.sent_documents) ? meta.sent_documents.map((d) => ({ id: d.id, title: d.title, filename: d.filename, mime: d.mime, size: d.size })) : [];
  const own = docsByMessage.get(r.id) || [];
  const ownIds = new Set(own.map((d) => d.id));
  return {
    id: r.id,
    direction: r.direction,
    channel: r.channel,
    body: r.body,
    status: r.status,
    error: r.error,
    automated: !!r.automated,
    automation_rule: r.automation_rule,
    author_name: r.author_name || null,
    intake_id: r.intake_id,
    case_id: r.case_id,
    matter_id: r.matter_id,
    meta,
    created_at: r.created_at,
    documents: [...own, ...sent.filter((d) => !ownIds.has(d.id))],
  };
}
