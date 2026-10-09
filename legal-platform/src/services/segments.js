// v11 segment-server (§5.5): نوع الخدمة «خيري» / «أفراد وشركات» — المكان الوحيد الذي يقرر.
// الأرقام (الأساسي، الأفراد والشركات، غير المضبوط)، ما يظهر للعامة من أرقام وجمل جاهزة، أولوية الإشارات على رسالة واردة،
// النبرة والنصوص، تغيير الإدارة لنوع الخدمة (بسبب وسجل)، والجاهزية. المحامون لا يرون شيئًا من هذا أبدًا.
import { LABELS, ENUMS, CLIENT_TEXTS, CLIENT_TEXTS_PAID, CLIENT_TEXTS_CHARITY_EXTRA, SEGMENT_CHANGE_TEXTS, SEGMENT_CHOICE_TEXTS } from '../constants.js';
import { nowIso, addDays, parseJson, badRequest, notFound, ApiError, arabicCount, truncate, normalizeArabic } from '../util.js';
import { publicWhatsAppDigits } from '../channels/whatsapp.js';
import { parseSegment, segmentFromCookie, paidWaPrefill, paidPrefillOf, COMPANY_PREFILL, PAID_TOPICS, CHOICE_IDS } from '../../public/assets/js/public/segment.js';
import { topicFromWaPrefill, waPrefill } from '../../public/assets/js/public/topics.js';
import { segmentHint } from '../ai/heuristic.js';

/** تحية الموقع العامة (مثل SITE_GREETING في site.js) وتحية «عايزة أحكيلكم» — إشارتا «خيري» على رقم مشترك (L11-22) */
export const SITE_GREETING = 'السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.';
const CHARITY_GENERIC = 'السلام عليكم، عايزة أحكيلكم مشكلتي.';
const OPEN_INTAKE = "('new','in_review','awaiting_client')";
const UNSET_LABEL = 'غير محدد';
const LEGACY_SOURCE_LABEL = 'قبل الإصدار 11 (خيري)';
const VERIFIED_KEY = 'wa_paid_verified';
// كلمات لا تصل عميل الأفراد والشركات (L11-25، INV-12): مجانية أو اسم الجمعية أو أمر بصيغة المؤنث العامية
export const PAID_BANNED_RE = /ببلاش|مجان|المؤسسة|\{ي\}|\{ة\}|اكتبي|ابعتي|صوّري|صوري|اختاري|سجّلي|سجلي|اضغطي|قولي|تقدري|حاولي|ارجعي/;

const normCmp = (s) =>
  normalizeArabic(String(s ?? '').normalize('NFC'))
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/,/g, '،')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!؟?]+$/, '')
    .trim();

/** «الزوج» في سطور اختيارات الموقع للإدارة ← «الزوج أو الزوجة» لطلبات الأفراد والشركات (للعرض فقط، لا يدخل التحليل) */
export function paidStaffLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => String(l).replace(/(:\s*)الزوج(?=$|\s*[،.])/u, '$1الزوج أو الزوجة'));
}

export function createSegments(app) {
  const { db, config } = app;
  const S = (k) => app.settings.get(k);
  const unknownLogged = new Map(); // pid → اليوم (سطر سجل واحد لكل رقم في اليوم)
  if (String(process.env.WHATSAPP_SEGMENT || '').trim().toLowerCase() === 'paid') {
    app.log?.('WHATSAPP_SEGMENT=paid is not supported for the main number in 11.0; it is read as charity (the paid side uses a second number or wa_paid_on_main)');
  }

  const label = (s) => LABELS.segment[s] || UNSET_LABEL;
  const shortLabel = (s) => LABELS.segment_short[s] || UNSET_LABEL;
  const longLabel = (s) => LABELS.segment_long[s] || UNSET_LABEL;
  const sourceLabel = (src, seg) => (src ? LABELS.segment_source[src] || src : seg === 'charity' ? LEGACY_SOURCE_LABEL : seg === 'paid' ? LABELS.segment_source.company : null);
  const modeOf = (raw) => (String(raw || '').trim().toLowerCase() === 'shared' ? 'shared' : 'charity');

  function waConfig() {
    let wa = {};
    try {
      wa = app.integrations.get('whatsapp');
    } catch {
      wa = {};
    }
    return wa;
  }

  /** وقت التحقق من رقم الأفراد والشركات إن طابق المعرّف والرقم الحاليين، وإلا null [r2 S4] */
  function paidVerifiedAt(wa = waConfig()) {
    const v = S(VERIFIED_KEY);
    const pid = String(wa.paid_phone_number_id || '').trim();
    const digits = publicWhatsAppDigits(wa.paid_number);
    if (!v || typeof v !== 'object' || !pid || !digits) return null;
    return v.pid === pid && v.number === digits && v.at ? v.at : null;
  }

  /** الأرقام المضبوطة الآن: [{ key:'main', pid, digits, mode }, { key:'paid', pid, digits, mode:'paid', verified }?] */
  function lines() {
    const wa = waConfig();
    const main = { key: 'main', pid: String(wa.phone_number_id || '').trim(), digits: app.whatsapp?.publicDigits?.() || '', mode: modeOf(wa.segment) };
    const out = [main];
    const pid = String(wa.paid_phone_number_id || '').trim();
    if (pid) {
      const at = paidVerifiedAt(wa);
      out.push({ key: 'paid', pid, digits: publicWhatsAppDigits(wa.paid_number), mode: 'paid', verified: !!at, verified_at: at });
    }
    return out;
  }
  const lineByKey = (key) => lines().find((l) => l.key === key) || null;

  /**
   * الرقم الذي وصلت عليه رسالة (metadata.phone_number_id) [r2 S8]: الأساسي المضبوط ← main؛ رقم الأفراد والشركات ← paid؛
   * بلا معرّف أو SIM (المحاكي) ← main؛ SIM-PAID (محاكي العرض) ← paid؛ معرّف موجود غير مضبوط ← { key:'unknown', pid }
   * (ما دام الرقم الأساسي مضبوطًا؛ في وضع المحاكاة بلا معرّف أساسي يبقى الأساسي كما في 10.0).
   */
  function lineFor(phoneNumberId) {
    const pid = String(phoneNumberId ?? '').trim();
    const ls = lines();
    const main = ls[0];
    const paid = ls.find((l) => l.key === 'paid') || null;
    if (!pid || pid === 'SIM') return main;
    if (paid && pid === paid.pid) return paid;
    if (pid === 'SIM-PAID') return paid || { key: 'paid', pid: 'SIM-PAID', digits: '', mode: 'paid', verified: false, simulated: true };
    if (pid === main.pid || !main.pid) return main;
    const day = nowIso().slice(0, 10);
    if (unknownLogged.get(pid) !== day) {
      unknownLogged.set(pid, day);
      app.log?.(`whatsapp: message on an unconfigured phone_number_id …${pid.slice(-4)} (stored, no automated reply)`);
    }
    return { key: 'unknown', pid, digits: '', mode: null };
  }

  /** معرّفات تُعد «نفس الرقم» لكل خط (المحاكي مع الرقم الأساسي، ومحاكي العرض مع رقم الأفراد والشركات) */
  function pidsFor(key) {
    const l = lineByKey(key);
    if (key === 'main') return { pids: [l?.pid, 'SIM'].filter(Boolean), configured: !!l?.pid };
    if (key === 'paid') return { pids: [l?.pid, 'SIM-PAID'].filter(Boolean), configured: !!l };
    return { pids: [], configured: false };
  }

  /**
   * شرط SQL لرسائل واردة «على هذا الخط» (نافذة الـ 24 ساعة لكل رقم، L11-50): معرّف الرقم الحالي فقط، وللأساسي
   * الصفوف القديمة بلا معرّف (wa_pid IS NULL) — وفي وضع المحاكاة (بلا معرّف أساسي) كل ما وصل على الأساسي.
   */
  function lineSql(key, alias = 'm') {
    const col = (c) => `${alias}.${c}`;
    if (key === 'main') {
      const { pids, configured } = pidsFor('main');
      const legacy = `(${col('wa_pid')} IS NULL AND COALESCE(${col('wa_line')}, 'main') = 'main')`;
      if (!configured) return { sql: `(COALESCE(${col('wa_line')}, 'main') = 'main')`, params: [] };
      return { sql: `(${col('wa_pid')} IN (${pids.map(() => '?').join(', ')}) OR ${legacy})`, params: pids };
    }
    if (key === 'paid') {
      const { pids, configured } = pidsFor('paid');
      if (!configured) return { sql: `(${col('wa_pid')} = 'SIM-PAID' AND ${col('wa_line')} = 'paid')`, params: [] };
      return { sql: `(${col('wa_pid')} IN (${pids.map(() => '?').join(', ')}))`, params: pids };
    }
    return { sql: '0', params: [] };
  }

  /** هل هذا الرقم مضبوط الآن ويمكن الإرسال منه؟ */
  function lineConfigured(key) {
    if (key === 'main') return true;
    if (key === 'paid') return !!lineByKey('paid');
    return false;
  }

  /**
   * أرقام واتساب لكل جانب من الموقع ([r2 P4/S4] جدول §5.5): بلا وسيط = الرقم الأساسي (للمستدعين القدامى).
   * paid: رقم الأفراد والشركات المُتحقق منه، وإلا الأساسي ما دام wa_paid_on_main، وإلا ''.
   */
  function publicDigits(segment) {
    const ls = lines();
    const main = ls[0];
    if (segment === undefined || segment === null || segment === 'charity') return main.digits;
    const paid = ls.find((l) => l.key === 'paid');
    if (main.mode === 'shared') return main.digits;
    if (paid && paid.verified && paid.digits) return paid.digits;
    return S('wa_paid_on_main') === false ? '' : main.digits;
  }

  /** الجملة الجاهزة لرابط wa.me: الخيري كما في 10.0، والأفراد والشركات جملة الحجز (topicKey 'company' = جملة الشركات) */
  function publicPrefill(segment, topicKey = null) {
    if (segment === 'paid' || segment === 'neutral') return topicKey === 'company' ? COMPANY_PREFILL : paidWaPrefill(topicKey);
    return topicKey ? waPrefill(topicKey) : SITE_GREETING;
  }

  /** نوع خدمة طلب الموقع: segment في الطلب › كعكة bm_seg › الإعداد الافتراضي (قيمة غير صالحة تُتجاهل ولا ترفض الطلب أبدًا) */
  function fromWebsite({ body, cookieHeader } = {}) {
    const p = parseSegment(body?.segment);
    if (p) return { segment: p, source: 'website', via: 'param' };
    const c = segmentFromCookie(cookieHeader);
    if (c) return { segment: c, source: 'website', via: 'cookie' };
    return { segment: parseSegment(S('segment_website_default')) || 'charity', source: 'website_default', via: 'default' };
  }

  /** جملة جاهزة في رسالة واتساب: { segment, topic, requester, rest } أو null (S11-21، L11-22) */
  function tagOf(text) {
    const paid = paidPrefillOf(text);
    if (paid) return { segment: 'paid', topic: paid.topic, requester: paid.requester, rest: paid.rest };
    const s = normCmp(text);
    if (!s) return null;
    const topic = topicFromWaPrefill(text);
    if (topic) return { segment: 'charity', topic, requester: null, rest: '' };
    if (s === normCmp(SITE_GREETING) || s === normCmp(CHARITY_GENERIC)) return { segment: 'charity', topic: null, requester: null, rest: '' };
    return null;
  }

  /**
   * إشارة الرسالة نفسها (القاعدتان d وe) لاستهداف الطلب المفتوح (S11 §3.4، L11-49):
   *   رقم الأفراد والشركات ← paid/wa_line (الرقم يغلب الجملة)؛ الرقم الأساسي «الخيري» ← charity/wa_line، إلا جملة الحجز أو
   *   الشركات مع wa_paid_on_main ← paid/wa_tag [r2 P4]؛ الرقم المشترك أو غير المضبوط ← الجملة الجاهزة إن وُجدت (wa_tag)، وإلا null.
   * kind: 'line' (رقم مخصص) | 'tag' (جملة جاهزة = إشارة طلب جديد) | null
   */
  function messageSignal({ msg, line, text }) {
    const none = { segment: null, source: null, kind: null, tag: null, topic: null, requester: null, line: line?.key ?? null, mismatchable: false };
    if (!msg || msg.channel !== 'whatsapp' || !line) return none;
    const tag = tagOf(text);
    // [r2 S7] علامة «كتب على رقم آخر» لها معنى فقط حين يكون للأفراد والشركات رقمهم المخصص
    const mismatchable = !!lineByKey('paid') && (line.key === 'paid' || line.key === 'main');
    if (line.key === 'paid') return { ...none, segment: 'paid', source: 'wa_line', kind: 'line', tag: tag?.segment || null, topic: tag?.topic ?? null, mismatchable };
    if (line.key === 'main' && line.mode !== 'shared') {
      if (tag?.segment === 'paid' && S('wa_paid_on_main') !== false) return { ...none, segment: 'paid', source: 'wa_tag', kind: 'tag', tag: 'paid', topic: tag.topic, requester: tag.requester };
      return { ...none, segment: 'charity', source: 'wa_line', kind: 'line', tag: tag?.segment || null, topic: tag?.topic ?? null, mismatchable };
    }
    if (tag) return { ...none, segment: tag.segment, source: 'wa_tag', kind: 'tag', tag: tag.segment, topic: tag.topic, requester: tag.requester };
    return none;
  }

  /** القاعدة f [r2 S3]: نوع خدمة آخر طلب أو ملف للعميل خلال segment_returning_days (0 = متوقفة) */
  function returningSegment(clientId) {
    const days = Number(S('segment_returning_days'));
    if (!clientId || !Number.isFinite(days) || days <= 0) return null;
    const since = addDays(nowIso(), -days);
    const row = db.get(
      `SELECT segment, created_at FROM (
         SELECT segment, created_at FROM intakes WHERE client_id = ? AND segment IS NOT NULL AND created_at >= ?
         UNION ALL SELECT segment, created_at FROM cases WHERE client_id = ? AND company_id IS NULL AND created_at >= ?
       ) ORDER BY created_at DESC LIMIT 1`,
      clientId,
      since,
      clientId,
      since,
    );
    return parseSegment(row?.segment);
  }

  /**
   * نوع خدمة طلب جديد من رسالة واردة (S11 §3.3 بتعديلات L11-21): b مرجع › c اختيار صريح › d الرقم المخصص › e الجملة
   * الجاهزة › f العميل العائد (رقم مشترك) › g NULL. كل الحقول null لا undefined أبدًا (L11-41).
   * ctx: { msg, line, client, signal }
   */
  function resolveInbound({ msg = {}, line = null, client = null, signal = null } = {}) {
    const out = { segment: null, source: null, tag: null, requester: null };
    const sig = signal || messageSignal({ msg, line, text: msg?.text });
    out.tag = sig.tag ?? null;
    out.requester = sig.requester ?? (msg?.requester_kind === 'company' ? 'company' : null);
    // b) مرجع صريح (نقل الرسائل، طلب جديد من صفحة متابعة طلب بعينه)
    const ref = parseSegment(msg?.ref_segment);
    if (ref) return { ...out, segment: ref, source: 'reference' };
    if (msg?.ref_segment === null && msg?.ref_segment_unset === true) return { ...out, segment: null, source: 'reference' };
    // b') طلب جديد من صفحة متابعة (رابط البوابة): نوع خدمة آخر طلب للعميل (S11-07)
    if (msg?.portal_client_id && msg.channel !== 'whatsapp' && !parseSegment(msg?.segment) && client?.id) {
      const last = db.get('SELECT segment FROM intakes WHERE client_id = ? ORDER BY id DESC LIMIT 1', client.id);
      if (last) return { ...out, segment: last.segment ?? null, source: 'reference' };
    }
    // c) اختيار صريح (الموقع، نموذج الإدارة، بوابة الشركات)
    const explicit = parseSegment(msg?.segment);
    if (explicit) return { ...out, segment: explicit, source: LABELS.segment_source[msg.segment_source] ? msg.segment_source : msg.channel === 'website' ? 'website' : 'manual' };
    // d/e) الرقم المخصص أو الجملة الجاهزة
    if (sig.segment) return { ...out, segment: sig.segment, source: sig.source };
    // رسائل غير واتساب بلا اختيار: الخيري كما كان (الإدارة تحدد في النموذج؛ مسارات قديمة لا تمرر شيئًا)
    if (msg?.channel !== 'whatsapp') return { ...out, segment: 'charity', source: msg?.staff_entry ? 'reference' : msg?.channel === 'website' ? 'website_default' : 'manual' };
    // f) عميل عائد على الرقم المشترك أو غير المضبوط
    const back = returningSegment(client?.id);
    if (back) return { ...out, segment: back, source: 'returning' };
    // g) لا إشارة: «غير محدد» والإدارة تختار (الاقتراح المحلي لا يُطبَّق أبدًا)
    return out;
  }

  /** طلب القصة (من الطلب أو الملف أو الملف المستمر) */
  function storyIntakeRow({ intakeId = null, caseId = null, matterId = null } = {}) {
    if (intakeId) return db.get('SELECT * FROM intakes WHERE id = ?', intakeId) || null;
    let cid = caseId;
    if (!cid && matterId) cid = db.value('SELECT case_id FROM matters WHERE id = ?', matterId) ?? null;
    if (!cid) return null;
    const iid = db.value('SELECT intake_id FROM cases WHERE id = ?', cid);
    return iid ? db.get('SELECT * FROM intakes WHERE id = ?', iid) || null : null;
  }
  function storySegment(story) {
    if (story.caseId || story.matterId) {
      let cid = story.caseId;
      if (!cid && story.matterId) cid = db.value('SELECT case_id FROM matters WHERE id = ?', story.matterId) ?? null;
      const c = cid ? db.get('SELECT segment, company_id FROM cases WHERE id = ?', cid) : null;
      if (c) return c.company_id ? 'paid' : c.segment;
    }
    const i = storyIntakeRow(story);
    return i ? i.segment : 'charity';
  }

  /** آخر رسالة واتساب واردة في القصة (الطلب وملفه وملفه المستمر) */
  function lastInboundOfStory({ clientId, intakeId = null, caseId = null, matterId = null }) {
    const intake = storyIntakeRow({ intakeId, caseId, matterId });
    const cid = caseId || intake?.case_id || (matterId ? db.value('SELECT case_id FROM matters WHERE id = ?', matterId) : null) || null;
    const mid = matterId || (cid ? db.value('SELECT matter_id FROM cases WHERE id = ?', cid) : null) || null;
    const parts = [];
    const params = [];
    if (intake?.id) {
      parts.push('intake_id = ?');
      params.push(intake.id);
    }
    if (cid) {
      parts.push('case_id = ?');
      params.push(cid);
    }
    if (mid) {
      parts.push('matter_id = ?');
      params.push(mid);
    }
    if (!parts.length) return null;
    return db.get(
      `SELECT id, wa_line, wa_pid, created_at FROM messages WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' AND (${parts.join(' OR ')}) ORDER BY id DESC LIMIT 1`,
      clientId,
      ...params,
    );
  }

  /**
   * الرقم الذي يُرد منه في قصة (INV-16): رقم آخر رسالة واتساب منها، ما دام مضبوطًا الآن بنفس المعرّف؛ بلا رسائل واتساب
   * ← رقم نوع الخدمة (الأفراد والشركات ← رقمهم المُتحقق منه، وإلا الأساسي). null = رقم غير مضبوط أو استُبدل.
   */
  function lineForStory(story = {}) {
    if (!story.clientId) return null;
    const last = lastInboundOfStory(story);
    if (last) {
      const key = last.wa_line || 'main';
      if (key === 'unknown') return null;
      if (!lineConfigured(key)) return null;
      const { pids, configured } = pidsFor(key);
      if (key === 'main' && (!configured || !last.wa_pid)) return 'main';
      return pids.includes(last.wa_pid) ? key : null;
    }
    const seg = storySegment(story);
    const paid = lineByKey('paid');
    if (seg === 'paid' && paid && paid.verified) return 'paid';
    return 'main';
  }

  /**
   * الرقم الذي يُرسل منه كود دخول صفحة المتابعة (/portal، P1): رقم آخر رسالة واتساب من صاحب الرقم ما دام مضبوطًا بنفس
   * المعرّف، وإلا الأساسي (القالب AUTHENTICATION نفسه في نفس الحساب؛ نص الكود محايد كما هو).
   */
  function lineForPhone(clientId) {
    if (!clientId) return 'main';
    const last = db.get("SELECT wa_line, wa_pid FROM messages WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' ORDER BY id DESC LIMIT 1", clientId);
    const key = last?.wa_line || 'main';
    if (key !== 'paid' || !lineConfigured('paid')) return 'main';
    return pidsFor('paid').pids.includes(last.wa_pid) ? 'paid' : 'main';
  }

  /** «سيُرسل من: …» في رؤوس الإرسال (L11-61): { key, label } أو null بلا عميل */
  function sendLine(story = {}) {
    if (!story.clientId) return null;
    const key = lineForStory(story);
    if (!key) {
      const last = lastInboundOfStory(story);
      return last?.wa_line === 'unknown'
        ? { key: 'unknown', label: `${LABELS.wa_line.unknown} — صفحة المتابعة فقط` }
        : { key: 'portal', label: 'صفحة المتابعة فقط — الرقم الذي كتب عليه لم يعد مضبوطًا' };
    }
    const confirmed = app.engine?.isStoryConfirmed?.({ clientId: story.clientId, intakeId: story.intakeId ?? null, caseId: story.caseId ?? null, matterId: story.matterId ?? null });
    if (confirmed === false) return { key: 'portal', label: 'صفحة المتابعة فقط — الرقم غير مؤكد' };
    return { key, label: LABELS.wa_line[key] };
  }

  /** نبرة صف طلب/ملف/ملف مستمر: charity | paid | neutral (NULL) */
  function tone(row) {
    if (!row) return 'charity';
    if (row.company_id) return 'paid';
    if (row.segment === undefined) return 'charity';
    return row.segment === 'charity' ? 'charity' : row.segment === 'paid' ? 'paid' : 'neutral';
  }

  /**
   * نبرة عميل بلا قصة محددة (رابط البوابة، صفحة المتابعة العامة): أحدث طلب مفتوح أو ملف مفتوح، وإلا أحدث طلب، وإلا الخيري.
   * scopeIntakeId (رابط طلب بعينه) يغلب.
   */
  function clientTone(clientId, { scopeIntakeId = null } = {}) {
    if (scopeIntakeId) {
      const i = db.get('SELECT segment, case_id FROM intakes WHERE id = ?', scopeIntakeId);
      if (i) {
        const c = i.case_id ? db.get('SELECT segment, company_id FROM cases WHERE id = ?', i.case_id) : null;
        return tone(c || i);
      }
    }
    if (!clientId) return 'charity';
    const open = db.get(
      `SELECT segment, company_id, at FROM (
         SELECT segment, NULL AS company_id, COALESCE(last_message_at, created_at) AS at FROM intakes WHERE client_id = ? AND status IN ${OPEN_INTAKE}
         UNION ALL SELECT segment, company_id, updated_at AS at FROM cases WHERE client_id = ? AND status != 'closed'
       ) ORDER BY at DESC LIMIT 1`,
      clientId,
      clientId,
    );
    if (open) return tone(open);
    const last = db.get('SELECT segment FROM intakes WHERE client_id = ? ORDER BY id DESC LIMIT 1', clientId);
    return last ? tone(last) : 'charity';
  }

  /** نص رسالة العميل بالنبرة: الأفراد والشركات لا يرجعون أبدًا لنص الخيري (المحايد = نص الأفراد بلا أتعاب، والترحيب لا يُرسل) */
  function text(key, t = 'charity') {
    if (t === 'charity') return CLIENT_TEXTS[key] ?? CLIENT_TEXTS_CHARITY_EXTRA[key] ?? null;
    if (key === 'otp') return CLIENT_TEXTS.otp;
    if (t === 'neutral') {
      if (key === 'story_ack') return CLIENT_TEXTS_PAID.story_ack_neutral;
      if (/^story_welcome/.test(key) || key === 'fee_line') return null;
    }
    return CLIENT_TEXTS_PAID[key] ?? null;
  }

  /** نص رسالة تغيير نوع الخدمة المقترح (S11 §10.4) */
  function changeText(to) {
    return to === 'paid' ? SEGMENT_CHANGE_TEXTS.to_paid : SEGMENT_CHANGE_TEXTS.to_charity;
  }

  /**
   * [مراجعة 11.0] ملء متغيرات رسالة تغيير نوع الخدمة ({hello} {ref_no} {first_name} {org_name} و{ي}/{ة}) بكلمات العميل
   * وبنبرة الجانب الذي جاء منه (الخيري ← «أهلًا يا …» و«طلب رقم 29»؛ الأفراد والشركات ← «مرحبًا …» و«الطلب رقم 29»)،
   * فلا تصل العميل رسالة فيها «{hello}» أبدًا. يعيد النص بعد الملء (قد يبقى فيه متغير غير معروف يرفضه المستدعي).
   */
  function fillChangeText(template, story, fromTone) {
    let tpl = String(template ?? '');
    const i = storyIntakeRow(story);
    let w;
    if (i && app.stories?.words) {
      w = app.stories.words({ ...i, segment: fromTone === 'charity' ? 'charity' : 'paid' });
    } else {
      const cw = app.engine?.clientWords ? app.engine.clientWords({ clientId: story.clientId, caseId: story.caseId ?? null }) : { first_name: '', form: 'f' };
      const paidSide = fromTone !== 'charity';
      w = {
        first_name: cw.first_name,
        form: cw.form,
        hello: paidSide ? (cw.first_name ? `مرحبًا ${cw.first_name}` : 'مرحبًا بكم') : cw.first_name ? `أهلًا يا ${cw.first_name}` : 'أهلًا بيك{ي}',
        ref_no: '',
        org_name: app.brand?.displayName ? app.brand.displayName() : '',
      };
    }
    if (!w.ref_no) tpl = tpl.replace(/\s*\(\{ref_no\}\)/g, '').replace(/\s*\{ref_no\}/g, '');
    return app.engine.fillClientText(tpl, { hello: w.hello, ref_no: w.ref_no, first_name: w.first_name, org_name: w.org_name, client_name: w.first_name }, w.form);
  }
  /** الرسالة المقترحة (S11 §10.4) عند التحويل إلى to، جاهزة للإرسال؛ null من «غير محدد» أو بلا عميل أو لنفس النوع */
  function changeMessage(story, from, to) {
    if (!story?.clientId || !parseSegment(from) || !parseSegment(to) || from === to) return null;
    return fillChangeText(changeText(to), story, from);
  }

  const mappedPurpose = (purpose) => {
    try {
      return !!db.get('SELECT 1 FROM wa_template_mappings WHERE purpose = ?', purpose);
    } catch {
      return false;
    }
  };
  /**
   * غرض القالب خارج النافذة بالنبرة [r2 S15]: الخيري كما هو؛ الأفراد والشركات/المحايد ← '<purpose>@paid' إن رُبط، وإلا
   * portal_update المحايد. استبيان الخيري لا يصل الأفراد والشركات أبدًا (null = لا يُرسل بقالب).
   */
  function templatePurpose(purpose, t = 'charity') {
    if (t === 'charity' || !purpose || purpose === 'otp' || purpose === 'lawyer_alert' || /@paid$/.test(purpose)) return purpose;
    if (mappedPurpose(`${purpose}@paid`)) return `${purpose}@paid`;
    if (purpose === 'survey') return null;
    return 'portal_update';
  }

  /** أعداد الطلبات المفتوحة بنوع الخدمة تحت نفس المرشحات */
  function counts(whereSql = '1', params = []) {
    const r = db.get(
      `SELECT COALESCE(SUM(CASE WHEN i.segment = 'charity' THEN 1 ELSE 0 END), 0) AS charity,
              COALESCE(SUM(CASE WHEN i.segment = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN i.segment IS NULL THEN 1 ELSE 0 END), 0) AS unset
         FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id WHERE ${whereSql}`,
      ...params,
    );
    return { charity: Number(r?.charity || 0), paid: Number(r?.paid || 0), unset: Number(r?.unset || 0) };
  }

  /** الاقتراح المحلي (r2 S14): يُحفظ في segment_hint لكل طلب جديد ولا يُطبَّق أبدًا */
  function hint(t) {
    return segmentHint(t);
  }
  function hintOf(row) {
    const h = parseJson(row?.segment_hint, null);
    return h && parseSegment(h.segment) ? { segment: h.segment, reasons: Array.isArray(h.reasons) ? h.reasons.slice(0, 3) : [] } : null;
  }
  /** يحسب الاقتراح من نص الطلب ويحفظه (أو NULL) — لا يلمس segment أبدًا (INV-04) */
  function storeHint(intakeId, t) {
    const h = segmentHint(t);
    const val = h.segment ? JSON.stringify({ segment: h.segment, reasons: h.reasons, confidence: h.confidence }) : null;
    db.run('UPDATE intakes SET segment_hint = ? WHERE id = ?', val, intakeId);
    return h;
  }

  // ───────────── تغيير الإدارة لنوع الخدمة (S11-39، r2 S6/S21) ─────────────
  function cleanReason(reason, reasonCode, fromNull) {
    const code = reasonCode === undefined || reasonCode === null || reasonCode === '' ? null : String(reasonCode);
    if (code && !ENUMS.segment_reason_codes.includes(code)) throw badRequest('سبب غير معروف');
    let r = typeof reason === 'string' ? reason.trim() : reason == null ? '' : null;
    if (r === null) throw badRequest('اكتبوا سبب التغيير.');
    if (!r && code) r = LABELS.segment_reason_codes[code];
    if (fromNull) return { reason: r ? r.slice(0, 300) : 'تحديد نوع الخدمة', code };
    if (r.length < 3 || r.length > 300) throw new ApiError(400, 'اكتبوا سبب التغيير.', 'segment_reason_required', { fields: { reason: 'اكتبوا سبب التغيير.' } });
    return { reason: r, code };
  }
  function changeSummary(actor, from, to, reason) {
    return `غيّر ${actor?.name || 'النظام'} نوع الخدمة من «${label(from)}» إلى «${label(to)}»: ${truncate(reason, 300)}`;
  }
  function validTarget(segment) {
    const s = parseSegment(segment);
    if (!s) throw new ApiError(400, 'اختاروا نوع الخدمة أولًا.', 'segment_required', { fields: { segment: 'اختاروا نوع الخدمة أولًا.' } });
    return s;
  }
  function sendChangeMessage(story, message, actor, fromTone = 'charity') {
    if (!message || message.send !== true) return null;
    const raw = typeof message.text === 'string' ? message.text.trim() : '';
    if (!raw) throw badRequest('اكتبوا نص الرسالة أو ألغوا «إرسال رسالة للعميل».');
    if (raw.length > 2000) throw badRequest('الرسالة أطول من المسموح');
    // [مراجعة 11.0] النص المقترح (S11 §10.4) فيه {hello} و{ref_no} و{ي}: تُملأ هنا بكلمات العميل ونبرة جانبه، ومتغير باقٍ يُرفض
    const body = fillChangeText(raw, story, fromTone);
    const left = /\{([^{}\n]{1,40})\}/u.exec(body);
    if (left) throw badRequest(`الرسالة فيها متغير لم يُملأ: {${left[1]}}`);
    // ليست آلية أبدًا؛ قاعدة القناة الواحدة (B91-01) تقرر واتساب أو صفحة المتابعة فقط
    return app.engine.sendToClient({ client_id: story.clientId, intake_id: story.intakeId ?? null, case_id: story.caseId ?? null, body, channel: 'auto', author: actor });
  }

  /**
   * تغيير نوع خدمة طلب (PUT /api/admin/intakes/:id/segment). من «غير محدد» بلا سبب (يُسجل «تحديد نوع الخدمة»)،
   * ومن قيمة إلى أخرى بسبب 3–300 حرف. نفس القيمة = بلا تغيير. الطلب الذي صار ملفًا يُغيَّر من صفحة الملف.
   */
  function setIntake(id, segment, { actor = null, ctx = null, reason, reasonCode, message, via = 'override' } = {}) {
    const intake = db.get('SELECT * FROM intakes WHERE id = ?', id);
    if (!intake) throw notFound('الطلب غير موجود');
    const to = validTarget(segment);
    if (intake.case_id) throw new ApiError(409, 'غيّروا نوع الخدمة من صفحة الملف.', 'segment_on_case', { case_id: intake.case_id });
    const from = intake.segment ?? null;
    if (from === to) return { ...intakeBlock(intake), unchanged: true, message_id: null };
    const r = cleanReason(reason, reasonCode, from === null);
    const h = hintOf(intake);
    const t = nowIso();
    let msgRow = null;
    db.tx(() => {
      db.run("UPDATE intakes SET segment = ?, segment_source = 'staff', segment_set_at = ?, segment_set_by = ?, updated_at = ? WHERE id = ?", to, t, actor?.id ?? null, t, intake.id);
      const data = { entity: 'intake', id: intake.id, code: intake.code, from, to, reason: r.reason, reason_code: r.code, hint_used: !!h && h.segment === to, via };
      app.activity.log({ intake_id: intake.id, client_id: intake.client_id, actor, type: 'segment.changed', summary: changeSummary(actor, from, to, r.reason), data });
      app.audit?.log({ actor, ctx, type: 'segment.changed', severity: 'info', summary: `تغيير نوع الخدمة للطلب ${intake.code}: «${label(from)}» ← «${label(to)}»`, data });
      if (intake.assigned_staff_id && intake.assigned_staff_id !== actor?.id) {
        app.notifications.notify([intake.assigned_staff_id], { type: 'segment.changed', title: `تغيير نوع الخدمة — الطلب ${intake.code}: ${label(to)}`, body: truncate(r.reason, 140), link: `#/inbox/${intake.id}` });
      }
      if (intake.client_id) msgRow = sendChangeMessage({ clientId: intake.client_id, intakeId: intake.id }, message, actor, from === 'charity' ? 'charity' : 'paid');
      // P1 (S11-30): دقة اقتراح نوع الخدمة في «أداء الذكاء الاصطناعي» — اختيار الإدارة لطلب «غير محدد» كان له اقتراح
      if (from === null && h && app.ai?.recordFeedback) {
        const sug = db.get("SELECT id FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_analysis' ORDER BY id DESC LIMIT 1", intake.id);
        app.ai.recordFeedback({ suggestion_id: sug?.id ?? null, entity_type: 'intake', entity_id: intake.id, field: 'segment', verdict: h.segment === to ? 'accepted' : 'corrected', ai_value: h.segment, final_value: to, actor });
      }
    });
    return { ...intakeBlock(db.get('SELECT * FROM intakes WHERE id = ?', intake.id)), unchanged: false, message_id: msgRow?.id ?? null };
  }

  /** هل على الملف أتعاب مسجلة (أحداث عمل، أو فواتير للعميل عليها مدفوعات)؟ تغييره عندها لمدير النظام فقط [r2 S6] */
  function feesRecorded(caseId) {
    const events = Number(db.value('SELECT COUNT(*) FROM billable_events WHERE case_id = ?', caseId) || 0);
    const paidInvoices = Number(
      db.value(
        `SELECT COUNT(*) FROM payments p JOIN invoices inv ON inv.id = p.invoice_id
          WHERE inv.case_id = ? OR inv.matter_id IN (SELECT id FROM matters WHERE case_id = ?)`,
        caseId,
        caseId,
      ) || 0,
    );
    return events > 0 || paidInvoices > 0;
  }

  /**
   * تغيير نوع خدمة ملف (PUT /api/admin/cases/:id/segment): ينتقل لملفاته المستمرة وطلبه في معاملة واحدة. ملف شركة
   * «أفراد وشركات» دائمًا؛ ملف مربوط ببرنامج تمويل لا يصير «أفراد وشركات»؛ مع أتعاب مسجلة لمدير النظام فقط، ولقطات
   * الفترات المسجلة لا تتغير (affected_periods للعرض فقط).
   */
  function setCase(id, segment, { actor = null, ctx = null, reason, reasonCode, message, via = 'override' } = {}) {
    const c = db.get('SELECT * FROM cases WHERE id = ?', id);
    if (!c) throw notFound('الملف غير موجود');
    const to = validTarget(segment);
    if (c.company_id) throw new ApiError(409, 'ملف شركة؛ نوع الخدمة «أفراد وشركات» دائمًا.', 'company_always_paid');
    const from = c.segment;
    if (from === to) return { ...caseBlock(c), unchanged: true, affected_periods: [], cancelled_invoices: [], message_id: null };
    if (to === 'paid' && c.program_id) throw new ApiError(409, 'الملف مربوط ببرنامج تمويل؛ افصلوه أولًا ثم غيّروا نوع الخدمة.', 'segment_program_linked');
    if (feesRecorded(c.id) && actor?.role !== 'admin') throw new ApiError(403, 'سُجّلت أتعاب على هذا الملف؛ تغيير نوع الخدمة لمدير النظام فقط.', 'fees_recorded');
    const r = cleanReason(reason, reasonCode, false);
    const periods = db.all('SELECT DISTINCT period FROM billable_events WHERE case_id = ? ORDER BY period', c.id).map((x) => x.period);
    const t = nowIso();
    let msgRow = null;
    const cancelled = [];
    db.tx(() => {
      db.run('UPDATE cases SET segment = ?, updated_at = ? WHERE id = ?', to, t, c.id);
      db.run('UPDATE matters SET segment = ?, updated_at = ? WHERE case_id = ?', to, t, c.id);
      if (c.intake_id) db.run("UPDATE intakes SET segment = ?, segment_source = 'staff', segment_set_at = ?, segment_set_by = ? WHERE id = ?", to, t, actor?.id ?? null, c.intake_id);
      // [مراجعة 11.0] ملف صار «خيري»: الأتعاب المقترحة على الملف نفسه بلا أي دفعة تُلغى في نفس المعاملة (رسالة التحويل
      // تقول «لن تُطلب منكم أي أتعاب»، ولا تذكير بمبلغ ولا زر موافقة على صفحة المتابعة بعدها). ما عليه دفعات يبقى (لمدير النظام).
      if (to === 'charity') {
        const open = db.all(
          `SELECT id, number FROM invoices WHERE case_id = ? AND matter_id IS NULL AND status NOT IN ('cancelled', 'paid')
             AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = invoices.id) ORDER BY id`,
          c.id,
        );
        for (const inv of open) {
          db.run("UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ?", t, inv.id);
          app.activity.log({ case_id: c.id, client_id: c.client_id, actor, type: 'invoice.cancelled', summary: `أُلغيت الأتعاب المقترحة ${inv.number} بتحويل الملف إلى «${label(to)}»`, data: { invoice_id: inv.id, via: 'segment.changed' } });
          cancelled.push(inv.number);
        }
      }
      const data = { entity: 'case', id: c.id, code: c.code, from, to, reason: r.reason, reason_code: r.code, affected_periods: periods, via, ...(cancelled.length ? { cancelled_invoices: cancelled } : {}) };
      app.activity.log({ case_id: c.id, intake_id: c.intake_id ?? null, client_id: c.client_id, actor, type: 'segment.changed', summary: changeSummary(actor, from, to, r.reason), data });
      app.audit?.log({ actor, ctx, type: 'segment.changed', severity: periods.length ? 'warning' : 'info', summary: `تغيير نوع الخدمة للملف ${c.code}: «${label(from)}» ← «${label(to)}»`, data });
      if (c.case_manager_id && c.case_manager_id !== actor?.id) {
        app.notifications.notify([c.case_manager_id], { type: 'segment.changed', title: `تغيير نوع الخدمة — الملف ${c.code}: ${label(to)}`, body: truncate(r.reason, 140), link: `#/cases/${c.id}` });
      }
      msgRow = sendChangeMessage({ clientId: c.client_id, intakeId: c.intake_id ?? null, caseId: c.id }, message, actor, from === 'charity' ? 'charity' : 'paid');
    });
    return { ...caseBlock(db.get('SELECT * FROM cases WHERE id = ?', c.id)), unchanged: false, affected_periods: periods, cancelled_invoices: cancelled, message_id: msgRow?.id ?? null };
  }

  // ───────────── كتل العرض للإدارة (§5.6) ─────────────
  function requesterOf(row) {
    const fa = parseJson(row?.form_answers, {}) || {};
    const r = fa.requester && typeof fa.requester === 'object' ? fa.requester : parseJson(row?.source_detail, {})?.requester;
    if (!r || r.kind !== 'company') return null;
    return {
      company_name: r.company_name || null,
      job_title: r.job_title || null,
      email: r.email || null,
      employees: r.employees || null,
      employees_label: r.employees ? LABELS.requester_employees[r.employees] || r.employees : null,
      needs: Array.isArray(r.needs) ? r.needs : [],
      needs_labels: Array.isArray(r.needs) ? r.needs.map((k) => LABELS.requester_needs[k] || k) : [],
    };
  }
  function lineMismatchOf(intake) {
    const m = db.get("SELECT meta FROM messages WHERE intake_id = ? AND direction = 'in' AND json_extract(meta, '$.line_mismatch') IS NOT NULL ORDER BY id DESC LIMIT 1", intake.id);
    const lm = parseJson(m?.meta, {})?.line_mismatch;
    if (!lm || !lm.line) return null;
    return { line: lm.line, line_label: lm.line === 'paid' ? 'كتب على رقم الأفراد والشركات' : 'كتب على الرقم الأساسي', item_segment: lm.item_segment ?? null };
  }
  function lastLineOf(intake) {
    const m = db.get("SELECT wa_line, wa_pid FROM messages WHERE intake_id = ? AND direction = 'in' AND channel = 'whatsapp' ORDER BY id DESC LIMIT 1", intake.id);
    return m || null;
  }
  /** كتلة segment في تفاصيل الطلب */
  function intakeBlock(intake) {
    const setBy = intake.segment_set_by ? db.value('SELECT name FROM users WHERE id = ?', intake.segment_set_by) : null;
    const h = hintOf(intake);
    const last = lastLineOf(intake);
    const waLine = last?.wa_line || intake.wa_line || null;
    return {
      value: intake.segment ?? null,
      label: label(intake.segment),
      short_label: shortLabel(intake.segment),
      long_label: longLabel(intake.segment),
      source: intake.segment_source ?? null,
      source_label: sourceLabel(intake.segment_source, intake.segment),
      set_at: intake.segment_set_at ?? null,
      set_by_name: setBy ?? null,
      wa_line: waLine,
      wa_line_label: waLine ? LABELS.wa_line[waLine] || null : null,
      wa_pid_last4: waLine === 'unknown' && last?.wa_pid ? String(last.wa_pid).slice(-4) : null,
      hint: h,
      mismatch_hint: intake.segment === 'charity' && h?.segment === 'paid' ? { reasons: h.reasons } : null,
      line_mismatch: lineMismatchOf(intake),
      requester: requesterOf(intake),
      can_change: !intake.case_id,
      block: intake.case_id ? 'segment_on_case' : null,
      // [مراجعة 11.0] نص «إرسال رسالة للعميل» المقترح (S11 §10.4) جاهزًا بالاسم ورقم الطلب، للتحويل إلى الجانب الآخر فقط
      change_message: intake.case_id ? null : changeMessageBlock({ clientId: intake.client_id, intakeId: intake.id }, intake.segment ?? null),
    };
  }
  /** { charity, paid }: الرسالة المقترحة للتحويل إلى كل جانب (null لنفس الجانب، ومن «غير محدد» بلا رسالة مقترحة) */
  function changeMessageBlock(story, from) {
    if (!story.clientId || !parseSegment(from)) return null;
    try {
      return { charity: changeMessage(story, from, 'charity'), paid: changeMessage(story, from, 'paid') };
    } catch (e) {
      app.log?.('segment change message', e);
      return null;
    }
  }
  /** كتلة segment في تفاصيل الملف */
  function caseBlock(c) {
    const company = !!c.company_id;
    const value = company ? 'paid' : c.segment;
    const out = {
      value,
      label: company ? 'شركة' : label(value),
      short_label: company ? 'شركة' : shortLabel(value),
      long_label: longLabel(value),
      company,
      can_change: !company,
      block: company ? 'company_always_paid' : null,
      admin_only: !company && feesRecorded(c.id),
      // [مراجعة 11.0] النص المقترح لرسالة التحويل (S11 §10.4) جاهزًا للإرسال
      change_message: company ? null : changeMessageBlock({ clientId: c.client_id, intakeId: c.intake_id ?? null, caseId: c.id }, c.segment),
    };
    return out;
  }
  /** أتعاب ملف الأفراد (r2 P5): عدد فواتير الملف وهل وافق العميل على واحدة منها */
  function caseFees(c) {
    const r = db.get(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN client_agreed_at IS NOT NULL OR status IN ('paid','partially_paid') THEN 1 ELSE 0 END), 0) AS agreed
         FROM invoices WHERE case_id = ? AND matter_id IS NULL AND status != 'cancelled'`,
      c.id,
    );
    return { invoices: Number(r?.n || 0), agreed: Number(r?.agreed || 0) > 0 };
  }

  // ───────────── التكاملات: رقم الأفراد والشركات ووضع الرقم الأساسي (§5.4) ─────────────
  function openWhatsAppStories() {
    return Number(
      db.value(
        `SELECT COUNT(DISTINCT client_id) FROM (
           SELECT client_id FROM intakes WHERE status IN ${OPEN_INTAKE} AND channels LIKE '%"whatsapp"%' AND client_id IS NOT NULL
           UNION SELECT c.client_id FROM cases c JOIN intakes i ON i.id = c.intake_id WHERE c.status != 'closed' AND c.company_id IS NULL AND i.channels LIKE '%"whatsapp"%'
         )`,
      ) || 0,
    );
  }
  /** تحقق مترابط قبل حفظ حقول واتساب؛ يعيد ما يلزم بعد الحفظ (سجل تغيير الوضع ومسح التحقق) */
  function checkWhatsAppSave(before, after, { confirm = false } = {}) {
    const fields = {};
    const pid = String(after.paid_phone_number_id || '').trim();
    const mainDigits = publicWhatsAppDigits(after.number) || publicWhatsAppDigits(S('whatsapp_display_number'));
    const paidDigits = publicWhatsAppDigits(after.paid_number);
    if (pid && pid === String(after.phone_number_id || '').trim()) fields.paid_phone_number_id = 'معرّف رقم الأفراد والشركات لازم يختلف عن معرّف الرقم الأساسي';
    if (paidDigits && mainDigits && paidDigits === mainDigits) fields.paid_number = 'رقم الأفراد والشركات لازم يختلف عن الرقم الأساسي';
    if (pid && modeOf(after.segment) !== 'charity') fields.segment = 'مع وجود رقم للأفراد والشركات يبقى الرقم الأساسي للخيري';
    const keys = Object.keys(fields);
    if (keys.length) throw badRequest(fields[keys[0]], { fields });
    const from = modeOf(before.segment);
    const to = modeOf(after.segment);
    let modeChange = null;
    if (from !== to) {
      const open = openWhatsAppStories();
      if (open > 0 && !confirm) {
        const n = arabicCount(open, ['محادثة واتساب مفتوحة', 'محادثتين واتساب مفتوحتين', 'محادثات واتساب مفتوحة', 'محادثة واتساب مفتوحة']);
        throw new ApiError(409, `فيه ${n}؛ تغيير الوضع يغيّر طريقة تصنيف رسائلهم الجديدة. أكّدوا للمتابعة.`, 'mode_change_confirm', { open });
      }
      modeChange = { from, to, open };
    }
    const paidChanged = String(before.paid_phone_number_id || '').trim() !== pid || publicWhatsAppDigits(before.paid_number) !== paidDigits;
    return { modeChange, paidChanged };
  }
  function afterWhatsAppSave({ modeChange, paidChanged }, { actor = null, ctx = null } = {}) {
    if (paidChanged) db.run('DELETE FROM settings WHERE key = ?', VERIFIED_KEY);
    if (modeChange) {
      app.audit?.log({
        actor,
        ctx,
        type: 'integration.wa_mode_changed',
        severity: 'warning',
        summary: `تغيير وضع رقم واتساب الأساسي من «${LABELS.wa_segment_mode[modeChange.from]}» إلى «${LABELS.wa_segment_mode[modeChange.to]}» (محادثات مفتوحة: ${modeChange.open})`,
        data: modeChange,
      });
    }
  }
  /** يسجل نجاح التحقق من رقم الأفراد والشركات (اختبار الاتصال) */
  function markPaidVerified(pid, digits) {
    const at = nowIso();
    app.settings.set(VERIFIED_KEY, { pid: String(pid), number: String(digits), at });
    return at;
  }

  // ───────────── الجاهزية (r2 S4/S9/S15) ─────────────
  function readiness() {
    const items = [];
    const add = (key, level, title, detail, href = '#/integrations') => items.push({ key, level, title, detail, href });
    const ls = lines();
    const main = ls[0];
    const paid = ls.find((l) => l.key === 'paid');
    if (paid && !paid.verified) {
      add('wa_paid_unverified', 'warning', 'رقم واتساب الأفراد والشركات لم يُتحقق منه بعد', 'لا يظهر هذا الرقم للعامة (ولا تخرج منه رسائل لمن لم يكتب عليه) حتى ينجح «اختبار الاتصال» في صفحة التكاملات ويطابق الرقم المسجل لدى ميتا. من يكتب عليه مباشرة يُرد عليه منه.');
    }
    if (main.mode !== 'shared' && !(paid && paid.verified)) {
      if (S('wa_paid_on_main') === false) {
        add('wa_paid_side', 'warning', 'صفحات الأفراد والشركات بلا واتساب', 'لا يوجد رقم أفراد وشركات مُتحقق منه، واستخدام الرقم الأساسي لهم متوقف: تظهر لهم صفحة الطلب والهاتف فقط، وطلباتهم من الموقع تبقى بلا تأكيد على واتساب حتى تتصلوا بهم.', '#/settings?section=site');
      } else {
        add('wa_paid_side', 'ok', 'الأفراد والشركات على الرقم الأساسي بجملة الحجز', 'تظهر صفحات الأفراد والشركات الرقم الأساسي بجملة «أرغب في حجز استشارة قانونية»، فتصبح رسائلهم «أفراد وشركات» وتُرد عليهم بأسلوبهم. اسم الرقم في واتساب هو ما ضبطتموه لدى ميتا.', '#/settings?section=site');
      }
    }
    if (main.mode === 'shared') {
      const days = Number(S('segment_returning_days'));
      if (!(days > 0)) add('wa_shared_returning', 'warning', 'الرقم المشترك لا يتذكر نوع خدمة من راسلنا قبل كده', 'كل رسالة جديدة بلا جملة جاهزة تبقى «غير محدد» حتى من عملاء سابقين. اضبطوا «تذكّر نوع الخدمة لمن راسلنا قبل كده» بعدد أيام أكبر من صفر.', '#/settings?section=stories');
      if (!S('wa_segment_choice_enabled')) add('wa_shared_choice', 'info', 'الرسائل الجديدة على الرقم المشترك تبقى «غير محدد» حتى يختار الفريق نوع الخدمة', 'أزرار اختيار نوع الخدمة متوقفة؛ تختار الإدارة نوع الخدمة من صفحة الطلب.', '#/settings?section=stories');
    }
    const unknown = db.get("SELECT wa_pid, MAX(created_at) AS at, COUNT(*) AS n FROM messages WHERE direction = 'in' AND wa_line = 'unknown' AND created_at >= ? GROUP BY wa_pid ORDER BY at DESC LIMIT 1", addDays(nowIso(), -7));
    if (unknown) {
      add('wa_unknown_number', 'warning', `وصلت رسائل على رقم غير مضبوط في التكاملات (…${String(unknown.wa_pid || '').slice(-4)})`, 'حُفظت الرسائل وطلباتها ولم يُرسل لها أي رد آلي. أضيفوا الرقم في التكاملات (رقمًا أساسيًا أو رقم الأفراد والشركات) أو أوقفوا اشتراكه في Webhook لدى ميتا.');
    }
    // قوالب الأفراد والشركات (أو القالب المحايد البديل) بكلمات الخيري، مع وجود عملاء أفراد وشركات
    const paidTraffic = Number(db.value("SELECT COUNT(*) FROM intakes WHERE segment = 'paid'") || 0) + Number(db.value("SELECT COUNT(*) FROM cases WHERE segment = 'paid' AND company_id IS NULL") || 0);
    if (paidTraffic > 0) {
      try {
        const rows = db.all(
          `SELECT m.purpose, t.name, t.body_text FROM wa_template_mappings m JOIN wa_templates t ON t.name = m.template_name AND t.language = m.language
            WHERE m.purpose LIKE '%@paid' OR m.purpose = 'portal_update'`,
        );
        const bad = rows.filter((r) => PAID_BANNED_RE.test(String(r.body_text || '').replace(/\{\{\s*\d+\s*\}\}/g, '')));
        if (bad.length) {
          add('wa_paid_templates', 'warning', 'قالب واتساب يصل عملاء الأفراد والشركات بكلام الخيري', `القالب ${bad.map((r) => `«${r.name}»`).join('، ')} فيه «ببلاش» أو «مجاني» أو اسم المؤسسة أو صيغة المؤنث. اربطوا قالبًا بصيغة الجمع المهذبة لأغراض «— الأفراد والشركات».`, '#/quick-replies');
        }
      } catch {
        // جداول القوالب غير متاحة (وحدة الرسائل غير محمّلة)
      }
    }
    return items;
  }

  // ───────────── أزرار اختيار نوع الخدمة على الرقم المشترك (S11-20، P1) ─────────────
  /**
   * أول رسالة من شخص على الرقم المشترك بلا أي إشارة («غير محدد»): رسالة واحدة بزرين «خيري — مجاني» / «أفراد وشركات».
   * كل الشروط معًا: الإعداد مفعّل؛ الرقم المشترك؛ الرسالة أنشأت الطلب؛ نوعه «غير محدد»؛ ليست كود تأكيد ولا رقم طلب ولا جملة
   * جاهزة؛ القصة مؤهلة للرسائل الآلية (stories.autoEligible)؛ لا رسالة صادرة لهذا العميل خلال 24 ساعة؛ مرة واحدة للطلب
   * (المطالبة بالعمود) ومرة لكل عميل في 30 يومًا. داخل نافذة الـ 24 ساعة فقط (session_only)، ولا تجعل رسائلها «مقروءة».
   */
  function maybeChoice(i, result = {}) {
    if (!i || !S('wa_segment_choice_enabled')) return false;
    if (!result.created_intake || result.duplicate || result.no_auto) return false;
    const seg = result.segment || {};
    if (seg.line !== 'main' || seg.mode !== 'shared' || seg.tag) return false;
    if (i.segment !== null) return false;
    if (result.identity_confirm || result.confirmed_intake || result.story?.mentioned_ref || result.story?.staff_entry) return false;
    if (!app.stories?.autoEligible?.(i)) return false;
    const since24 = addDays(nowIso(), -1);
    if (db.get("SELECT 1 FROM messages WHERE client_id = ? AND direction = 'out' AND created_at >= ?", i.client_id, since24)) return false;
    if (db.get('SELECT 1 FROM intakes WHERE client_id = ? AND id != ? AND segment_choice_sent_at >= ?', i.client_id, i.id, addDays(nowIso(), -30))) return false;
    const claim = db.run('UPDATE intakes SET segment_choice_sent_at = ? WHERE id = ? AND segment_choice_sent_at IS NULL AND segment IS NULL', nowIso(), i.id);
    if (claim.changes !== 1) return false;
    const org = app.brand?.displayName ? app.brand.displayName() : '';
    const body = app.engine.fillClientText(SEGMENT_CHOICE_TEXTS.segment_choice, { org_name: org }, 'f');
    try {
      app.engine.sendToClient({
        client_id: i.client_id,
        intake_id: i.id,
        body,
        channel: 'whatsapp',
        automated: true,
        rule: 'segment_choice',
        keep_unread: true,
        meta: {
          portal_hidden: true,
          wa: {
            type: 'buttons',
            session_only: true,
            text: body,
            footer: SEGMENT_CHOICE_TEXTS.segment_choice_footer,
            buttons: [
              { id: CHOICE_IDS.charity, title: 'خيري — مجاني' },
              { id: CHOICE_IDS.paid, title: 'أفراد وشركات' },
            ],
          },
        },
      });
      return true;
    } catch (e) {
      app.log?.('segment choice message failed', e);
      return false;
    }
  }

  /**
   * جواب الاختيار (زر seg:… أو الكلمات نفسها مكتوبة) لطلب أُرسل له الاختيار وما زال «غير محدد»: يُسجَّل النوع بمصدر
   * «اختيار من أزرار واتساب» (الإدارة تغلب دائمًا: الطلب المحدد لا يتغير)، ثم مرة واحدة: الترحيب بنبرة النوع إن كان مفعّلًا،
   * وإلا تأكيد قصير. لا يحرك story_rev (ليس من الوقائع) ولا يُرد عليه باختيار آخر أبدًا.
   */
  function onChoice(i, choice, msg = {}) {
    const to = parseSegment(choice);
    if (!i || !to) return false;
    const t = nowIso();
    const r = db.run("UPDATE intakes SET segment = ?, segment_source = 'wa_choice', segment_set_at = ?, updated_at = ? WHERE id = ? AND segment IS NULL AND segment_choice_sent_at IS NOT NULL", to, t, t, i.id);
    if (r.changes !== 1) return false;
    const via = /^seg:/.test(String(msg?.reply?.id || '')) ? 'button' : 'typed';
    app.activity.log({
      intake_id: i.id,
      client_id: i.client_id,
      actor: { kind: 'client' },
      type: 'segment.changed',
      summary: `اختار/ت «${label(to)}» من أزرار واتساب`,
      data: { entity: 'intake', id: i.id, code: i.code, from: null, to, via: 'wa_choice', segment_choice: to, answer: via },
    });
    const row = db.get('SELECT * FROM intakes WHERE id = ?', i.id);
    try {
      if (S('story_welcome_enabled') && app.stories?.sendWelcomeAfterChoice?.(row)) return true;
      const key = to === 'paid' ? 'segment_chosen_paid' : 'segment_chosen_charity';
      const tpl = text(key, to);
      if (tpl && app.stories?.autoEligible?.(row) && !db.get("SELECT 1 FROM messages WHERE intake_id = ? AND automation_rule = 'segment_chosen'", i.id)) {
        app.engine.sendToClient({
          client_id: row.client_id,
          intake_id: row.id,
          body: app.stories.fill(tpl, row),
          channel: 'whatsapp',
          automated: true,
          rule: 'segment_chosen',
          keep_unread: true,
          meta: { portal_hidden: true, wa: { session_only: true } },
        });
      }
    } catch (e) {
      app.log?.('segment chosen message failed', e);
    }
    return true;
  }

  const svc = {
    label,
    shortLabel,
    longLabel,
    sourceLabel,
    lines,
    lineFor,
    lineSql,
    lineConfigured,
    publicDigits,
    publicPrefill,
    fromWebsite,
    tagOf,
    messageSignal,
    returningSegment,
    resolveInbound,
    lineForStory,
    lineForPhone,
    sendLine,
    tone,
    clientTone,
    text,
    changeText,
    changeMessage,
    templatePurpose,
    paidStaffLines,
    counts,
    hint,
    hintOf,
    storeHint,
    setIntake,
    setCase,
    feesRecorded,
    intakeBlock,
    caseBlock,
    caseFees,
    requesterOf,
    paidVerifiedAt: () => paidVerifiedAt(),
    markPaidVerified,
    checkWhatsAppSave,
    afterWhatsAppSave,
    openWhatsAppStories,
    readiness,
    // P1 (SS-9، S11-20): أزرار اختيار نوع الخدمة على الرقم المشترك
    maybeChoice,
    onChoice,
    PAID_TOPICS,
  };
  return svc;
}
