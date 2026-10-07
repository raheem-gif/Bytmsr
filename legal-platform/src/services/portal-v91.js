// v9.1 b-portal — صفحة متابعة المستفيد/ة بلغة بسيطة: «إيه المطلوب مني دلوقتي؟»، «طلبك وصل لفين؟»،
// الورق المطلوب بندًا بندًا، الرد بخلاصة وخطوات، الجلسة («هحضر / مش هقدر»)، المصاريف بموافقتها، وطلب مكالمة.
//
// كل ما هنا يُبنى من نطاق رابط البوابة نفسه (app.portal.scopeOf): لا يصل صاحب الرابط إلا لطلباته وما تفرع عنها،
// ولا يُرسل للمستفيد/ة اسم محامٍ ولا ملاحظة داخلية ولا كود داخلي (INH-/MTR-/CL-): الكود الوحيد هو رقم الطلب REQ-.
//
// API (يستخدمه src/services/analytics.js createPortal و src/routes/public.js):
//   createPortalV91(app, { scopeOf, inList }) → {
//     home(client, sc, view)                       بيانات الصفحة الرئيسية (home) تُضاف إلى portal.view
//     decorate(client, sc, view)                    يضيف للطلبات/الردود/المواعيد/الفواتير حقول 9.1 ويحذف أكواد الملفات
//     replyToRequest(client, intakeId, id, body, o) رد على طلب ورق/معلومة (بنود، «مش لاقية»، صور لكل بند)
//     postMessage(client, intakeId, body, o)        رسالة من البوابة (answer_id / invoice_number اختياريان)
//     eventResponse(client, intakeId, id, body, o)  «هحضر / مش هقدر أحضر / عندي سؤال»
//     invoiceResponse(client, intakeId, number, body, o)  «موافقة / عندي سؤال / مش قادرة أدفع»
//     callback(client, intakeId, body, o)           «اطلبي مكالمة» (مرتين في اليوم على الأكثر)
//     onButtonReply(result, msg)                    زر «هحضر / مش هقدر» في رسالة واتساب التفاعلية
//     officeOpen(schedule, iso)                     هل المؤسسة تعمل الآن؟ (true/false/null)
//   }
//   export shortRefCodes(q, iso) → ['REQ-2026-00029', 'REQ-2025-00029'] للبحث برقم الطلب القصير («29» أو «29/2026»)
//   export parseItems(raw) → [{ label }] (يقبل ["…"] أو [{label}])
//   export spokenRef(code) → '29' من REQ-2026-00029

import * as U from '../util.js';
import { LABELS } from '../constants.js';

const { nowIso, addDays, parseJson, cairoParts, badRequest, notFound, conflict, v, truncate, fromMinor, arabicCount, ApiError } = U;

// ───────────── أدوات النص (تُستخدم أدوات util.js إن وُجدت — وحدة b-site — وإلا البديل المحلي بنفس القواعد) ─────────────

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const KUNYA_RE = /^(أم|ام|إم|أبو|ابو)$/;

function localAddressName(name) {
  const w = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  if (KUNYA_RE.test(w[0])) return w[1] ? `${w[0]} ${w[1]}` : '';
  if (w[0] === 'عبد' && w[1]) return `${w[0]} ${w[1]}`;
  return w[0];
}
function localAddressForm(p) {
  if (p?.address_form === 'm' || p?.address_form === 'f') return p.address_form;
  return /^(أبو|ابو)$/.test(String(p?.name ?? '').trim().split(/\s+/)[0] || '') ? 'm' : 'f';
}
function localGenderize(text, form = 'f') {
  const f = form !== 'm';
  return String(text ?? '').replace(/\{ي\}/g, f ? 'ي' : '').replace(/\{ة\}/g, f ? 'ة' : '');
}
function localSpokenTime(iso) {
  const p = cairoParts(iso);
  const period = p.hour < 4 ? 'بالليل' : p.hour < 6 ? 'الفجر' : p.hour < 12 ? 'الصبح' : p.hour < 15 ? 'الضهر' : p.hour < 18 ? 'العصر' : 'بالليل';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const mins = p.minute === 0 ? '' : p.minute === 30 ? ' ونص' : p.minute === 15 ? ' وربع' : `:${String(p.minute).padStart(2, '0')}`;
  return `${h12}${mins} ${period}`;
}
function localSpokenDate(iso) {
  const p = cairoParts(iso);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${AR_DAYS[dow]} ${p.day} ${AR_MONTHS[p.month - 1]}`;
}
function localDayWord(iso, nowValue = nowIso()) {
  const key = (x) => {
    const p = cairoParts(x);
    return Date.UTC(p.year, p.month - 1, p.day);
  };
  const diff = Math.round((key(iso) - key(nowValue)) / 86400000);
  if (diff === 0) return 'النهارده';
  if (diff === 1) return 'بكرة';
  if (diff === 2) return 'بعد يومين';
  if (diff >= 3 && diff <= 10) return `بعد ${diff} أيام`;
  if (diff === -1) return 'إمبارح';
  return `يوم ${localSpokenDate(iso)}`;
}

export const addressName = typeof U.addressName === 'function' ? U.addressName : localAddressName;
export const addressForm = typeof U.addressForm === 'function' ? U.addressForm : localAddressForm;
export const genderize = typeof U.genderize === 'function' ? U.genderize : localGenderize;
export const spokenTime = typeof U.spokenTime === 'function' ? U.spokenTime : localSpokenTime;
export const spokenDate = typeof U.spokenDate === 'function' ? U.spokenDate : localSpokenDate;
export const dayWord = typeof U.dayWord === 'function' ? U.dayWord : localDayWord;

/** رقم الطلب كما يُقال في التليفون: REQ-2026-00029 → «29» */
export function spokenRef(code) {
  const m = /^REQ-\d{4}-(\d+)$/.exec(String(code || ''));
  return m ? String(Number(m[1])) : '';
}

/**
 * البحث برقم الطلب القصير (B91-21): «29» أو «٢٩» أو «29/2026» ← أكواد REQ المطابقة تمامًا،
 * السنة الحالية أولًا ثم السابقة. [] لأي نص آخر.
 */
export function shortRefCodes(q, iso = nowIso()) {
  const s = (U.latinDigits ? U.latinDigits(String(q ?? '')) : String(q ?? '')).trim();
  const m = /^(\d{1,5})(?:\s*\/\s*(\d{4}))?$/.exec(s);
  if (!m || Number(m[1]) === 0) return [];
  const n = String(Number(m[1])).padStart(5, '0');
  if (m[2]) return [`REQ-${m[2]}-${n}`];
  const y = cairoParts(iso).year;
  return [`REQ-${y}-${n}`, `REQ-${y - 1}-${n}`];
}

/** بنود الورق المطلوب: ["…"] أو [{label}] ← [{label}] (5 بنود على الأكثر، 80 حرفًا للبند) */
export function parseItems(raw) {
  const arr = Array.isArray(raw) ? raw : parseJson(raw, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? x.label ?? x.title ?? '' : ''))
    .map((s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => ({ label }));
}

/** البنود من نص «بند في كل سطر» (لحقل الإدارة) */
export function itemsFromLines(text) {
  return parseItems(
    String(text ?? '')
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\s\-–•*\d.)]+/, '').trim())
      .filter(Boolean),
  );
}

/**
 * بنود الورق كما تكتبها الإدارة (مصفوفة أو «بند في كل سطر») ← نص JSON [{label}] للتخزين، أو null بلا بنود.
 * أكثر من 5 بنود أو بند أطول من 80 حرفًا ← 400 (لا نحذف شيئًا كتبته الإدارة بصمت).
 */
export function itemsInput(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const list = (Array.isArray(raw) ? raw : String(raw).split(/\r?\n/))
    .map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? x.label ?? '' : ''))
    .map((s) => String(s).replace(/^[\s\-–•*]*(?:\d+[.)-]\s*)?/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (list.length > 5) throw badRequest('البنود المطلوبة 5 على الأكثر (بند في كل سطر)');
  if (list.some((s) => s.length > 80)) throw badRequest('كل بند 80 حرفًا على الأكثر');
  return list.length ? JSON.stringify(list.map((label) => ({ label }))) : null;
}

/** خطوات الرد: مصفوفة أو نص «خطوة في كل سطر» ← ≤ 8 خطوات، كل خطوة ≤ 160 حرفًا */
export function parseSteps(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    arr = trimmed.startsWith('[') ? parseJson(trimmed, []) : trimmed.split(/\r?\n/);
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => String(s ?? '').replace(/^[\s\-–•*]*(?:\d+[.)-]\s*)?/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((s) => s.slice(0, 160));
}

/**
 * v9.1 fixes: نص تذكير الجلسة بقائمة «هاتي معاكي» التي اعتمدتها الإدارة (ملاحظة الموعد) بدل «هاتي معاكي بطاقتك» وحدها،
 * وسطر اللقاء («المحامي هيقابلك …») قبل التوقيع. بلا ملاحظة معتمدة يبقى النص كما هو.
 */
export function withClientNote(body, e, form = 'f') {
  if (!e || !e.client_text_approved || !e.client_note) return body;
  const lines = String(e.client_note).split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8);
  const meetRe = /(هيقابل|هتقابل|هنقابل|هنستنا|هيستنا|نتقابل|مكان اللقا|ميعاد اللقا)/;
  const bring = lines.filter((s) => !meetRe.test(s));
  const meet = lines.find((s) => meetRe.test(s)) || null;
  let out = String(body);
  const beforeSignature = (text, line) => {
    const parts = text.split('\n');
    const at = parts.findIndex((p) => /^—\s/.test(p));
    if (at >= 0) parts.splice(at, 0, line);
    else parts.push(line);
    return parts.join('\n');
  };
  if (bring.length) {
    const items = bring.some((s) => /بطاق/.test(s)) ? bring : ['بطاقتك', ...bring];
    const say = form === 'm' ? 'هات معاك' : 'هاتي معاكي';
    const re = /هاتي?(?:\s+معاكي?)?\s+بطاقتك(?:\s+الشخصية)?/;
    out = re.test(out) ? out.replace(re, `${say}: ${items.join('، ')}`) : beforeSignature(out, `${say}: ${items.join('، ')}.`);
  }
  if (meet) out = beforeSignature(out, meet);
  return out;
}

/** نص تذكير «قبلها بيوم» (B91-13): {ي} و{ة} حسب صيغة المخاطبة */
export const DAY_BEFORE_TEMPLATE =
  'أهلًا يا {first_name}، فكّرناك: بكرة {event_kind} الساعة {time_spoken} في {location}.\nهات{ي} بطاقتك. لو في أي مشكلة رد{ي} علينا هنا.\n— {org_name}';

/**
 * حقول الرد الموجه للمستفيد/ة (B91-08) من جسم طلب الإدارة: { summary ≤ 400، steps ≤ 8 × ≤ 160، voice_document_id }.
 * الحقول غير المرسلة لا تُعاد (تبقى كما هي عند التعديل). voice_document_id رسالة صوتية من مستندات الملف نفسه فقط.
 */
export function clientAnswerFields(app, caseId, body = {}) {
  const out = {};
  if (body.summary !== undefined) out.summary = v.str(body.summary, 'الخلاصة بكلام بسيط', { max: 400 }) || null;
  if (body.steps !== undefined) {
    const list = Array.isArray(body.steps) ? body.steps : String(body.steps ?? '').split(/\r?\n/);
    const clean = list.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (clean.length > 8) throw badRequest('الخطوات المطلوبة 8 على الأكثر (خطوة في كل سطر)');
    if (clean.some((s) => s.length > 160)) throw badRequest('كل خطوة 160 حرفًا على الأكثر');
    out.steps = clean.length ? JSON.stringify(clean) : null;
  }
  if (body.voice_document_id !== undefined) {
    const id = body.voice_document_id === null || body.voice_document_id === '' ? null : Number(body.voice_document_id);
    if (id !== null) {
      const d = Number.isInteger(id) ? app.db.get('SELECT id, mime FROM documents WHERE id = ? AND case_id = ?', id, caseId) : null;
      if (!d || !/^audio\//.test(d.mime)) throw badRequest('الرسالة الصوتية لازم تكون ملفًا صوتيًا من مستندات هذا الملف');
    }
    out.voice_document_id = id;
  }
  return out;
}

/**
 * نص رسالة الرد على واتساب حين توجد خلاصة (B91-08): التحية بالاسم، الخلاصة، الخطوات مرقمة، ورابط صفحتها
 * (رابط مقصور على طلبها، ولا رابط لطلب من الموقع لم تتأكد هوية صاحبه)، ≤ 1000 حرف. null إن لم توجد خلاصة.
 */
export function answerMessageText(app, ans, caseRow, { forWhatsApp = false } = {}) {
  if (!ans?.summary || !String(ans.summary).trim()) return null;
  const client = app.clients.get(caseRow.client_id) || {};
  const form = addressForm(client);
  const name = addressName(client.name);
  const org = app.settings.get('org_name') || 'بيوت مصر';
  const intake = caseRow.intake_id ? app.db.get('SELECT * FROM intakes WHERE id = ?', caseRow.intake_id) : null;
  const story = { clientId: caseRow.client_id, intakeId: intake?.id ?? null, caseId: caseRow.id };
  // قاعدة القناة الواحدة (B91-01): القصة المؤكدة فقط تأخذ رابطًا على رقمها، وغير المؤكدة تقرأ الرد في صفحتها.
  // v9.1 fixes: الرابط لا يُكتب في نص الرسالة المحفوظ أبدًا: نص واتساب (forWhatsApp) يحمل {portal_link} ويُصدر الرابط
  // عند الإرسال الفعلي (engine.renderLinks)، والنص المحفوظ يقول «الرد كامل على صفحتك.» فقط
  const withLink = forWhatsApp && !!app.engine?.isStoryConfirmed?.(story);
  const steps = parseSteps(ans.steps);
  const head = `${name ? `أهلًا يا ${name}` : 'أهلًا بيك{ي}'}، ردّنا على مشكلتك جاهز.\n\n${String(ans.summary).trim()}`;
  const tail = `\n\n${withLink ? 'الرد كامل على صفحتك: {portal_link}' : 'الرد كامل على صفحتك.'}\nلو عندك سؤال، رد{ي} علينا هنا.\n— ${org}`;
  // طول الرابط الفعلي عند الإرسال (≈ 70 حرفًا) يُحسب ضمن حد الـ 1000 حرف
  const linkRoom = withLink ? 70 : 0;
  let list = '';
  if (steps.length) {
    list = `\n\nتعمل{ي} إيه دلوقتي:`;
    let i = 0;
    for (const s of steps) {
      const line = `\n${i + 1}. ${s}`;
      if ((head + list + line + tail).length + linkRoom > 960) {
        list += '\nوباقي الخطوات على صفحتك.';
        break;
      }
      list += line;
      i++;
    }
  }
  return genderize(`${head}${list}${tail}`, form).slice(0, 1000);
}

const STUDY_DAYS = ['يوم', 'يومين', 'أيام', 'يوم'];
const WORK_DAYS = ['يوم شغل', 'يومين شغل', 'أيام شغل', 'يوم شغل'];
const WHEN_LABEL = { morning: 'الصبح', noon: 'الضهر', any: 'أي وقت' };
/** سطر مكان اللقاء في ملاحظة الجلسة («المحامي هيقابلك قدام باب القاعة…») */
export const MEET_RE = /(هيقابل|هتقابل|هنقابل|هنستنا|هيستنا|نتقابل|مكان اللقا|ميعاد اللقا)/;
/** مفتاح منع التكرار من الصفحة: نفس الإرسال بعد انقطاع النت لا يُسجَّل مرتين */
const CLIENT_REF_RE = /^[A-Za-z0-9_-]{8,64}$/;
const RESPONSE_TEXT = {
  yes: 'هحضر إن شاء الله',
  no: 'مش هقدر أحضر',
  question: 'عندي سؤال',
};

/** «10:00» ← دقائق من منتصف الليل، أو null */
function hm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h <= 24 && mi < 60 ? h * 60 + mi : null;
}

export function createPortalV91(app, { scopeOf, inList }) {
  const { db } = app;
  const setting = (k) => app.settings.get(k);

  /** بيانات التواصل الظاهرة في الموقع (نفس مصدر رأس الموقع وتذييله) */
  function contact() {
    const ps = app.site?.publicSettings ? app.site.publicSettings() : null;
    const s = app.settings.all();
    const digits = ps ? ps.whatsapp_digits : app.whatsapp?.publicDigits ? app.whatsapp.publicDigits() : '';
    return {
      org_name: ps?.org_name || s.org_name,
      phone: ps?.org_phone || s.org_phone || '',
      phone_e164: ps?.org_phone_e164 || '',
      whatsapp_digits: digits || '',
      office_hours: ps?.office_hours || s.office_hours || '',
      open_now: officeOpen(s.office_hours_schedule),
    };
  }

  /**
   * هل المؤسسة تعمل الآن بتوقيت القاهرة؟ من office_hours_schedule { days: [0..6 بترقيم getDay], from, to }.
   * null إن لم يُضبط جدول صالح (لا نقول «مقفولين» بلا معلومة).
   */
  function officeOpen(schedule, iso = nowIso()) {
    const sc = typeof schedule === 'string' ? parseJson(schedule, null) : schedule;
    if (!sc || typeof sc !== 'object' || !Array.isArray(sc.days)) return null;
    const from = hm(sc.from);
    const to = hm(sc.to);
    if (from === null || to === null || to <= from) return null;
    const p = cairoParts(iso);
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const mins = p.hour * 60 + p.minute;
    return sc.days.map(Number).includes(dow) && mins >= from && mins < to;
  }

  // ───────────── القصص: طلب واحد وما تفرع عنه (ملف الاستشارة والقضية) ─────────────

  /** رقم الطلب الذي يخص ملفًا (أو كود الملف إن لم يكن له طلب — حالة نادرة لملفات أنشأتها الإدارة يدويًا) */
  function refOfCase(caseId) {
    if (!caseId) return null;
    const c = db.get('SELECT c.code, i.code AS intake_code FROM cases c LEFT JOIN intakes i ON i.id = c.intake_id WHERE c.id = ?', caseId);
    return c ? c.intake_code || c.code : null;
  }
  function refOfMatter(matterId) {
    const m = db.get('SELECT case_id FROM matters WHERE id = ?', matterId);
    return m ? refOfCase(m.case_id) : null;
  }

  function stories(sc) {
    const C = inList(sc.caseIds);
    const I = inList(sc.intakeIds);
    const M = inList(sc.matterIds);
    const out = [];
    const seenCases = new Set();
    for (const i of db.all(`SELECT * FROM intakes WHERE id IN (${I}) ORDER BY id DESC`)) {
      const kase = i.case_id && sc.caseIds.includes(i.case_id) ? db.get('SELECT * FROM cases WHERE id = ?', i.case_id) : db.get(`SELECT * FROM cases WHERE intake_id = ? AND id IN (${C}) ORDER BY id DESC LIMIT 1`, i.id);
      if (kase) seenCases.add(kase.id);
      out.push({ intake: i, kase, ref: i.code });
    }
    for (const kase of db.all(`SELECT * FROM cases WHERE id IN (${C}) ORDER BY id DESC`)) {
      if (seenCases.has(kase.id)) continue;
      const intake = kase.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', kase.intake_id) : null;
      out.push({ intake, kase, ref: intake?.code || kase.code });
    }
    for (const s of out) {
      s.matter = s.kase ? db.get(`SELECT * FROM matters WHERE case_id = ? AND id IN (${M}) ORDER BY id DESC LIMIT 1`, s.kase.id) : null;
    }
    return out;
  }

  /**
   * مرحلة القصة بالكلام البسيط (نفس الكلمات في الصفحة وفي رسائل واتساب):
   * received | review | waiting_you | study | final_review | answered | court | done
   */
  function stageOf(story, { form = 'f', iso = nowIso() } = {}) {
    const { intake, kase, matter } = story;
    const etaReview = Math.max(1, Number(setting('portal_eta_review_days')) || 2);
    const etaMin = Math.max(1, Number(setting('portal_eta_study_min_days')) || 7);
    const etaMax = Math.max(etaMin, Number(setting('portal_eta_study_max_days')) || 14);
    const reviewHint = `غالبًا خلال ${arabicCount(etaReview, WORK_DAYS)}`;
    const studyHint = `ده بياخد غالبًا من ${etaMin} لـ ${arabicCount(etaMax, STUDY_DAYS).replace(/^(\d+) أيام$/, '$1 يوم')}`;
    // طلب مننا لسه مستنيين ردها عليه (ورق أو معلومة)
    let waiting = null;
    if (kase) {
      const reqs = db.all("SELECT id, kind, items, items_missing, status FROM info_requests WHERE case_id = ? AND status IN ('sent_to_client','client_replied')", kase.id);
      for (const r of reqs) {
        const st = requestState(r);
        if (st.can_reply) waiting = waiting === 'paper' || r.kind === 'document' ? 'paper' : 'reply';
      }
    }
    if (!kase && intake?.status === 'awaiting_client') waiting = 'reply';
    const waitingHint = waiting ? `مستنيين منك ${waiting === 'paper' ? 'الورق' : 'ردّك'} عشان نكمّل` : null;

    let step = 2;
    let key = 'review';
    let hint = reviewHint;
    let complete = false;
    let doneLabel = false;
    const answerSent = kase ? Number(db.value("SELECT COUNT(*) FROM client_answers WHERE case_id = ? AND status = 'sent'", kase.id)) > 0 : false;

    if (matter) {
      step = 5;
      if (matter.status === 'closed') {
        key = 'done';
        complete = true;
        hint = genderize('شوف{ي} آخر رسالة مننا', form);
      } else {
        key = 'court';
        const next = db.get("SELECT starts_at FROM matter_events WHERE matter_id = ? AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1", matter.id, iso);
        hint = next ? `الجلسة الجاية: ${spokenDate(next.starts_at)}` : 'لسه مفيش جلسة متحددة';
      }
    } else if (kase) {
      if (kase.status === 'closed' || kase.status === 'answered') {
        step = 4;
        complete = true;
        if (answerSent) {
          key = 'answered';
          hint = genderize('اقر{ي} الرد في «ردّنا عليك{ي}»', form);
        } else {
          key = 'done';
          doneLabel = true;
          hint = genderize('شوف{ي} آخر رسالة مننا', form);
        }
      } else if (kase.status === 'under_review' || kase.status === 'approved') {
        step = 3;
        key = 'final_review';
        hint = 'بنراجع الرد قبل ما نبعته لك';
      } else if (kase.status === 'assigned' || kase.status === 'in_progress') {
        step = 3;
        key = 'study';
        hint = studyHint;
      } else {
        step = 2;
        key = 'review';
        hint = reviewHint;
      }
    } else if (intake) {
      if (intake.status === 'new') {
        key = 'received';
      } else if (['handled_internally', 'archived'].includes(intake.status)) {
        step = 4;
        key = 'done';
        complete = true;
        doneLabel = true;
        hint = genderize('شوف{ي} آخر رسالة مننا', form);
      }
    }
    if (waiting && !complete && key !== 'court') {
      key = 'waiting_you';
      hint = waitingHint;
    }
    const titles = ['استلمنا طلبك', 'فريقنا بيراجع طلبك', 'المحامي بيدرس مشكلتك', doneLabel ? 'الطلب خلص' : 'وصلك الرد'];
    if (matter) titles.push('قضيتك في المحكمة');
    const steps = titles.map((title, i) => {
      const n = i + 1;
      const state = n < step || (n === step && complete) ? 'done' : n === step ? 'current' : 'next';
      return { n, title, state, hint: n === step ? hint : null };
    });
    return { step, key, title: titles[step - 1], hint, complete, steps };
  }

  // ───────────── طلبات الورق والمعلومات ─────────────

  /** حالة كل بند: needed | received | missing، والملفات التي أرسلتها لكل بند */
  function requestState(r) {
    const items = parseItems(r.items);
    const missing = new Set((parseJson(r.items_missing, []) || []).map(Number));
    const docs = db.all(
      "SELECT id, filename, mime, info_request_item AS item, created_at FROM documents WHERE info_request_id = ? AND uploaded_by_kind = 'client' ORDER BY id",
      r.id,
    );
    const open = r.status === 'sent_to_client' || r.status === 'client_replied';
    const rows = (items.length ? items : [{ label: null }]).map((it, idx) => {
      const files = docs.filter((d) => (items.length ? d.item === idx : true)).map((d) => ({ id: d.id, filename: d.filename, mime: d.mime, at: d.created_at }));
      const status = files.length ? 'received' : missing.has(idx) && items.length ? 'missing' : 'needed';
      return { label: it.label, status, files };
    });
    const extra = items.length ? docs.filter((d) => d.item === null || d.item === undefined || d.item >= items.length).map((d) => ({ id: d.id, filename: d.filename, mime: d.mime, at: d.created_at })) : [];
    const canReply = open && (items.length ? rows.some((x) => x.status === 'needed') : r.status === 'sent_to_client');
    return { items: items.length ? rows : [], files: items.length ? [] : rows[0].files, extra_files: extra, can_reply: canReply, all_done: !!items.length && rows.every((x) => x.status !== 'needed') };
  }

  // ───────────── تزيين بيانات الصفحة ─────────────

  function eventView(e, iso) {
    const approved = !!e.client_text_approved;
    // ملاحظة «هاتي معاكي» تمر بنفس بوابة الاعتماد: ما كتبه المحامي لا يصل قبل اعتماد الإدارة
    const lines = approved && e.client_note ? String(e.client_note).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 8) : [];
    // سطر «المحامي هيقابلك …» مكان لقاء لا ورقة تجيبها: يظهر وحده تحت «المحامي هيقابلك فين؟» (بلا اسم المحامي أبدًا)
    const isMeet = (s) => MEET_RE.test(s);
    const note = lines.filter((s) => !isMeet(s));
    const meet = lines.find(isMeet) || null;
    const location = e.location || null;
    return {
      client_note: note,
      meet_note: meet,
      map_url: location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}` : null,
      client_response: e.client_response || null,
      client_response_at: e.client_response_at || null,
      kind_label: LABELS.event_kind[e.kind] || 'موعد',
      spoken: { date: spokenDate(e.starts_at), time: spokenTime(e.starts_at), day: dayWord(e.starts_at, iso) },
    };
  }

  /**
   * أكواد الملفات الداخلية (INH-/FAM-/MTR-/CL-…) في نصوص قديمة تصل للمستفيد/ة («بخصوص ملفكم رقم FAM-2026-00001»):
   * تُستبدل برقم طلبها REQ- (الرقم الوحيد الذي تعرفه)، وكود العميل يُحذف.
   */
  function scrubber(client, sc) {
    const map = new Map();
    for (const c of db.all(`SELECT id, code FROM cases WHERE id IN (${inList(sc.caseIds)})`)) map.set(c.code, refOfCase(c.id));
    for (const m of db.all(`SELECT code, case_id FROM matters WHERE id IN (${inList(sc.matterIds)})`)) map.set(m.code, refOfCase(m.case_id));
    return (text) => {
      if (text == null) return text;
      let s = String(text);
      for (const [code, ref] of map) if (code && s.includes(code)) s = s.split(code).join(ref && /^REQ-/.test(ref) ? ref : 'طلبك');
      if (client.code) s = s.split(client.code).join('').replace(/\(\s*\)/g, '');
      return s.replace(/\b(?:INH|FAM|GRD|PEN|PRP|CIV|LAB|CRM|COM|TAX|ADM|GEN|MTR)-\d{4}-\d{3,6}\b/g, 'طلبك').replace(/\bCL-\d{3,8}\b/g, '');
    };
  }

  function decorate(client, sc, view) {
    const iso = nowIso();
    const scrub = scrubber(client, sc);
    view.messages = (view.messages || []).map((m) => ({ ...m, body: scrub(m.body) }));
    view.answers = (view.answers || []).map((a) => ({ ...a, body: scrub(a.body) }));
    view.requests = (view.requests || []).map((r) => ({ ...r, message: scrub(r.message) }));
    // الطلبات
    const reqRows = new Map(db.all(`SELECT * FROM info_requests WHERE case_id IN (${inList(sc.caseIds)})`).map((r) => [r.id, r]));
    view.requests = (view.requests || []).map((r) => {
      const row = reqRows.get(r.id) || {};
      const { case_code, ...rest } = r;
      void case_code;
      const st = requestState(row);
      return { ...rest, story_ref: refOfCase(row.case_id), ...st };
    });
    // الردود: الخلاصة والخطوات والرسالة الصوتية (إن أرفقتها الإدارة)
    const ansRows = new Map(db.all(`SELECT id, case_id, summary, steps, voice_document_id FROM client_answers WHERE case_id IN (${inList(sc.caseIds)}) AND status = 'sent'`).map((a) => [a.id, a]));
    view.answers = (view.answers || []).map((a) => {
      const row = ansRows.get(a.id) || {};
      const { case_code, ...rest } = a;
      void case_code;
      const voice = row.voice_document_id ? db.get('SELECT id, mime FROM documents WHERE id = ?', row.voice_document_id) : null;
      return {
        ...rest,
        story_ref: refOfCase(row.case_id),
        summary: row.summary ? String(row.summary).slice(0, 400) : null,
        steps: parseSteps(row.steps),
        voice: voice && /^audio\//.test(voice.mime) ? { id: voice.id, mime: voice.mime } : null,
      };
    });
    // المواعيد
    const evRows = new Map(db.all(`SELECT * FROM matter_events WHERE matter_id IN (${inList(sc.matterIds)})`).map((e) => [e.id, e]));
    view.events = (view.events || []).map((e) => {
      const row = evRows.get(e.id) || e;
      const { matter_code, ...rest } = e;
      void matter_code;
      return { ...rest, story_ref: refOfMatter(row.matter_id), ...eventView({ ...row, location: e.location }, iso) };
    });
    // الفواتير: المبلغ والسبب والموافقة، بلا لون أحمر ولا «متأخر منذ»
    view.invoices = (view.invoices || []).map((i) => {
      const row = db.get('SELECT matter_id, case_id, due_at, client_agreed_at, client_response, client_response_at FROM invoices WHERE number = ?', i.number) || {};
      const overdue = (i.status === 'unpaid' || i.status === 'partially_paid') && i.due_at && i.due_at < iso;
      return {
        ...i,
        days_overdue: overdue ? Math.max(0, Math.floor((Date.parse(iso) - Date.parse(i.due_at)) / 86400000)) : 0,
        client_agreed_at: row.client_agreed_at || null,
        client_response: row.client_response || null,
        client_response_at: row.client_response_at || null,
        needs_agreement: i.status === 'unpaid' && !row.client_agreed_at && Number(i.paid_amount || 0) === 0,
        story_ref: row.matter_id ? refOfMatter(row.matter_id) : refOfCase(row.case_id),
      };
    });
    return view;
  }

  /** هل يصلها الجديد على واتساب؟ رقم كتبته في الموقع لا يُعد مؤكدًا حتى يُثبت (B91-01) */
  function whatsappConfirmed(client, sc) {
    if (app.engine?.isStoryConfirmed) {
      // نفس قاعدة القناة الواحدة في الإرسال (B91-01): القصة الأحدث في الرابط مؤكدة الرقم
      const intakeId = sc.intake?.id ?? sc.intakeIds[sc.intakeIds.length - 1] ?? null;
      return !!app.engine.isStoryConfirmed({ clientId: client.id, intakeId, caseId: intakeId ? null : sc.caseIds[0] ?? null });
    }
    if (sc.websiteOnly) {
      const sd = parseJson(sc.intake?.source_detail, {});
      return !!(sd.whatsapp_confirmed_at || sd.confirmed_at || sd.phone_confirmed_at);
    }
    return !!db.get("SELECT 1 FROM messages WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' LIMIT 1", client.id);
  }

  function home(client, sc, view) {
    const iso = nowIso();
    const displayName = view.client?.name || '';
    // رابط طلب من الموقع لم تتأكد هويته: نخاطب بالاسم الذي كتبه فقط (لا نكشف إعداد صاحب الرقم)
    const form = sc.websiteOnly ? addressForm({ name: displayName }) : addressForm({ name: displayName, address_form: client.address_form });
    const all = stories(sc);
    const storyViews = all.map((s) => {
      const stage = stageOf(s, { form, iso });
      const nextHearing = s.matter
        ? db.get("SELECT starts_at FROM matter_events WHERE matter_id = ? AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1", s.matter.id, iso)
        : null;
      return {
        ref: s.ref,
        spoken_ref: spokenRef(s.ref),
        intake_id: s.intake?.id ?? null,
        stage,
        has_matter: !!s.matter,
        next_hearing_at: nextHearing?.starts_at || null,
        active: !stage.complete,
        created_at: s.intake?.created_at || s.kase?.created_at || null,
      };
    });
    // الأحدث النشط أولًا، ثم ما انتهى
    storyViews.sort((a, b) => Number(b.active) - Number(a.active) || String(b.created_at).localeCompare(String(a.created_at)));

    // ما ينتظرها بترتيب الأهمية: جلسة خلال 3 أيام، ثم الورق/الرد المطلوب، ثم جلسة خلال 14 يومًا، ثم الردود والرسائل
    // (الرد والرسالة «جديدان» بحسب ما فتحته على هذا الجهاز: تقرره الصفحة بـ localStorage)
    const next = [];
    const soon = addDays(iso, 3);
    const within14 = addDays(iso, 14);
    const hearings = (view.events || []).filter((e) => e.client_attendance_required && e.starts_at >= iso && e.starts_at <= within14);
    const hearingItem = (e) => ({ kind: 'hearing', id: e.id, story_ref: e.story_ref, at: e.starts_at });
    for (const e of hearings.filter((x) => x.starts_at <= soon)) next.push(hearingItem(e));
    for (const r of (view.requests || []).filter((x) => x.can_reply)) next.push({ kind: 'request', id: r.id, story_ref: r.story_ref, at: r.created_at });
    // آخر رسالة كتبها فريقنا بنفسه (لا التذكيرات الآلية، ولا رسالة الرد أو طلب الورق: لهما بطاقتهما)
    const lastOut = [...(view.messages || [])].reverse().find((m) => m.direction === 'out' && !m.kind);
    const excerpt = (m) => truncate(String(m.body || '').replace(/\s+/g, ' '), 80);
    // طلب مستنيين ردها عليه من غير طلب ورق/معلومة منظم (الإدارة سألتها في رسالة): «محتاجين ردّك» يفضل ظاهرًا
    // لحد ما ترد (أول رسالة منها ترجع الطلب للمراجعة)، فلا يقول الشريط «مستنيين ردّك» والبطاقة «مفيش حاجة مطلوبة»
    let replyMsgId = null;
    for (const st of storyViews) {
      if (st.stage.key !== 'waiting_you') continue;
      if ((view.requests || []).some((r) => r.can_reply && r.story_ref === st.ref)) continue;
      replyMsgId = lastOut?.id ?? null;
      next.push({ kind: 'reply', id: st.intake_id, story_ref: st.ref, at: lastOut?.created_at || null, message_id: replyMsgId, text: lastOut ? excerpt(lastOut) : null });
    }
    for (const e of hearings.filter((x) => x.starts_at > soon)) next.push(hearingItem(e));
    for (const a of [...(view.answers || [])].sort((x, y) => String(y.sent_at).localeCompare(String(x.sent_at)))) next.push({ kind: 'answer', id: a.id, story_ref: a.story_ref, at: a.sent_at });
    if (lastOut && lastOut.id !== replyMsgId) next.push({ kind: 'message', id: lastOut.id, story_ref: null, at: lastOut.created_at, text: excerpt(lastOut) });

    const unpaid = (view.invoices || []).filter((i) => i.status === 'unpaid' || i.status === 'partially_paid');
    const ref = sc.full ? storyViews[0]?.ref || null : sc.intake?.code || storyViews[0]?.ref || null;
    const instructions = String(setting('portal_payment_instructions') || '').trim().slice(0, 500);
    return {
      address: form,
      name: addressName(displayName),
      ref,
      spoken_ref: spokenRef(ref),
      whatsapp_confirmed: whatsappConfirmed(client, sc),
      stories: storyViews,
      next,
      contact: contact(),
      money: {
        unpaid_total: Math.round(unpaid.reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount || 0)), 0) * 100) / 100,
        needs_agreement: unpaid.filter((i) => i.needs_agreement).length,
        payment_instructions: instructions || null,
      },
    };
  }

  // ───────────── رسائل البوابة المنظمة ─────────────

  /** وجهة رسالة من البوابة تخص ملفًا بعينه: رابط الطلب يبقى على طلبه، وغيره على الملف نفسه */
  function targetForCase(intakeId, caseId) {
    return intakeId ? { target_intake_id: intakeId } : { target_case_id: caseId };
  }

  /**
   * رسالة واردة من البوابة عبر المحرك نفسه (نفس الحفظ والمرفقات والعدادات)، مع بيانات إضافية
   * ودون إشعار «رسالة جديدة» العام: نرسل إشعارًا محددًا بدلًا منه.
   */
  function receivePortal(client, target, text, { attachments = [], meta = {}, infoRequestId = null, clientRef = null } = {}) {
    return app.engine.receive({
      channel: 'website',
      portal_client_id: client.id,
      text,
      attachments,
      info_request_id: infoRequestId || undefined,
      extra_meta: meta,
      skip_staff_notice: true,
      // نفس الإرسال بعد انقطاع النت («حاولي تاني» / «النت رجع… ابعتي»): المحرك يعيد الرسالة الأولى (duplicate) بلا رسالة
      // ولا مرفقات ولا إشعار جديد. المفتاح مقصور على صاحب الرابط فلا يتصادم مع رسائل غيره.
      external_id: clientRef ? `portal:${client.id}:${clientRef}` : undefined,
      ...target,
    });
  }

  /** مفتاح منع التكرار كما أرسلته الصفحة (اختياري؛ صيغة غير صالحة ← 400) */
  function clientRefOf(body) {
    const ref = body?.client_ref;
    if (ref === undefined || ref === null || ref === '') return null;
    if (typeof ref !== 'string' || !CLIENT_REF_RE.test(ref)) throw badRequest('صيغة الإرسال غير صالحة');
    return ref;
  }

  const docsOf = (body, { max = 5 } = {}) => {
    const docs = body.documents == null ? [] : Array.isArray(body.documents) ? body.documents : null;
    if (!docs) throw badRequest('صيغة المرفقات غير صالحة');
    const isAudio = (d) => (app.documents.isAudio ? app.documents.isAudio(d || {}) : /^audio\//.test(String(d?.mime || '')));
    const audio = docs.filter(isAudio).length;
    if (docs.length - audio > max) throw badRequest(`تقدري تبعتي لحد ${max} صور في المرة الواحدة`);
    if (audio > 3) throw badRequest('تقدري تبعتي لحد 3 رسايل صوتية');
    for (const d of docs) if (!d || typeof d.data_base64 !== 'string' || !d.data_base64) throw badRequest('الملف فاضي. اختاري الصورة تاني');
    return docs;
  };

  const notifyFor = (caseId, n) => {
    const c = caseId ? db.get('SELECT case_manager_id FROM cases WHERE id = ?', caseId) : null;
    app.notifications.notifyStaff(n, { caseManagerId: c?.case_manager_id || null });
  };
  const who = (form) => (form === 'm' ? 'المستفيد' : 'المستفيدة');

  const svc = {
    officeOpen,
    stageOf,
    requestState,
    decorate,
    home,
    contact,

    /** رد على طلب ورق/معلومة: صور لكل بند، «مش لاقية الورقة دي»، ونص أو رسالة صوتية اختياريان */
    replyToRequest(client, intakeId, requestId, body = {}, { phone = null } = {}) {
      const sc = scopeOf(client, intakeId, { phone });
      const r = db.get('SELECT * FROM info_requests WHERE id = ?', requestId);
      if (!r || !sc.caseIds.includes(r.case_id)) throw notFound('الطلب غير موجود');
      const c = db.get('SELECT * FROM cases WHERE id = ?', r.case_id);
      if (!c || c.client_id !== client.id) throw notFound('الطلب غير موجود');
      if (!['sent_to_client', 'client_replied'].includes(r.status)) throw conflict('الطلب ده خلص، مش محتاجين فيه حاجة تانية.');
      const items = parseItems(r.items);
      const docs = docsOf(body);
      const itemOf = (d) => {
        if (d.item === undefined || d.item === null || d.item === '') return null;
        const n = Number(d.item);
        if (!Number.isInteger(n) || n < 0 || n >= items.length) throw badRequest('البند المختار مش موجود في الطلب');
        return n;
      };
      const docItems = docs.map(itemOf);
      const rawMissing = body.missing_items == null ? [] : Array.isArray(body.missing_items) ? body.missing_items : null;
      if (!rawMissing) throw badRequest('صيغة البنود غير صالحة');
      const missing = [...new Set(rawMissing.map(Number))];
      for (const n of missing) if (!Number.isInteger(n) || n < 0 || n >= items.length) throw badRequest('البند المختار مش موجود في الطلب');
      const text = v.str(body.body, 'الرد', { max: 5000 }) || '';
      if (!text && !docs.length && !missing.length) throw badRequest('صوّري ورقة الأول أو اكتبي ردّك.');
      const form = sc.websiteOnly ? addressForm({ name: sc.intake?.contact_name }) : addressForm(client);
      const lines = [];
      if (text) lines.push(text);
      for (const n of missing) lines.push(`${form === 'm' ? 'مش لاقي' : 'مش لاقية'}: ${items[n].label}`);
      if (!lines.length) {
        const labels = [...new Set(docItems.filter((x) => x !== null).map((n) => items[n].label))];
        lines.push(labels.length ? `[صور: ${labels.join('، ')}]` : '[مستند مرفق ردًا على الطلب]');
      }
      const combined = lines.join('\n');
      const clientRef = clientRefOf(body);
      const res = receivePortal(client, targetForCase(intakeId, c.id), combined, { attachments: docs, infoRequestId: r.id, meta: { info_request_reply: true, missing_items: missing.length ? missing : undefined }, clientRef });
      if (res.duplicate) {
        // وصل الإرسال الأول فعلًا (انقطع النت قبل الرد): لا ورق مكرر ولا إشعار ثانٍ
        const same = db.get('SELECT * FROM info_requests WHERE id = ?', r.id);
        return { ok: true, duplicate: true, message_id: res.message_id, request: { id: r.id, status: same.status, ...requestState(same) } };
      }
      const t = nowIso();
      db.tx(() => {
        (res.document_ids || []).forEach((docId, idx) => {
          const item = docItems[idx];
          db.run('UPDATE documents SET info_request_id = ?, case_id = COALESCE(case_id, ?), info_request_item = ? WHERE id = ?', r.id, c.id, item, docId);
        });
        const prevMissing = (parseJson(r.items_missing, []) || []).map(Number);
        const mergedMissing = [...new Set([...prevMissing, ...missing])].sort((a, b) => a - b);
        db.update('info_requests', r.id, {
          status: 'client_replied',
          client_reply: r.client_reply ? `${r.client_reply}\n---\n${combined}` : combined,
          items_missing: items.length ? JSON.stringify(mergedMissing) : r.items_missing ?? null,
          replied_at: t,
          updated_at: t,
        });
      });
      const ref = refOfCase(c.id);
      app.activity.log({
        case_id: c.id,
        actor: { kind: 'client' },
        type: 'info_request.replied',
        summary: docs.length
          ? `أرسل${form === 'm' ? '' : 'ت'} ${who(form)} ${arabicCount(docs.length, U.AR_UNITS?.document || ['مستند', 'مستندين', 'مستندات', 'مستندًا'])} من صفحة المتابعة ردًا على الطلب`
          : missing.length
            ? `أفاد${form === 'm' ? '' : 'ت'} ${who(form)} بعدم وجود: ${missing.map((n) => items[n].label).join('، ')}`
            : `ردّ${form === 'm' ? '' : 'ت'} ${who(form)} على طلب المعلومات من صفحة المتابعة`,
        data: { info_request_id: r.id, message_id: res.message_id, missing_items: missing },
      });
      notifyFor(c.id, {
        type: 'info_request.replied',
        title: docs.length ? `وصلت ورقة جديدة للطلب ${ref}` : missing.length ? `${who(form)} مش ${form === 'm' ? 'لاقي' : 'لاقية'} ورقة في الطلب ${ref}` : `وصل رد على طلب في الطلب ${ref}`,
        body: truncate(combined, 160),
        link: `#/cases/${c.id}`,
      });
      const fresh = db.get('SELECT * FROM info_requests WHERE id = ?', r.id);
      return { ok: true, message_id: res.message_id, request: { id: r.id, status: fresh.status, ...requestState(fresh) } };
    },

    /** رسالة من صفحة المتابعة. answer_id: سؤال على رد بعينه؛ invoice_number: سؤال على مبلغ بعينه */
    postMessage(client, intakeId, body = {}, { phone = null } = {}) {
      const sc = scopeOf(client, intakeId, { phone });
      const text = v.str(body.body, 'الرسالة', { max: 5000 }) || '';
      const docs = docsOf(body);
      if (!text && !docs.length) throw badRequest('اكتبي رسالتك أو سجّلي رسالة صوتية');
      const meta = {};
      let target = app.portal.targetFor(client, intakeId, { phone });
      let note = null;
      if (body.answer_id !== undefined && body.answer_id !== null && body.answer_id !== '') {
        const aid = Number(body.answer_id);
        const a = Number.isInteger(aid) ? db.get(`SELECT id, case_id FROM client_answers WHERE id = ? AND status = 'sent' AND case_id IN (${inList(sc.caseIds)})`, aid) : null;
        if (!a) throw badRequest('الرد ده مش موجود في صفحتك');
        meta.answer_id = a.id;
        target = targetForCase(intakeId, a.case_id);
        note = { type: 'answer.client_question', title: `سؤال من المستفيد/ة على الرد في الطلب ${refOfCase(a.case_id)}`, caseId: a.case_id };
      } else if (body.invoice_number) {
        const inv = db.get(
          `SELECT * FROM invoices WHERE number = ? AND status != 'cancelled' AND (matter_id IN (${inList(sc.matterIds)}) OR case_id IN (${inList(sc.caseIds)}))`,
          String(body.invoice_number).slice(0, 40),
        );
        if (!inv) throw badRequest('المبلغ ده مش موجود في صفحتك');
        meta.invoice_number = inv.number;
        const caseId = inv.case_id || db.value('SELECT case_id FROM matters WHERE id = ?', inv.matter_id);
        target = targetForCase(intakeId, caseId);
        db.update('invoices', inv.id, { client_response: inv.client_response === 'cannot_pay' ? 'cannot_pay' : 'question', client_response_at: nowIso() });
        note = { type: 'invoice.client_response', title: `سؤال من المستفيد/ة على مبلغ ${fromMinor(inv.amount_minor).toLocaleString('en-US')} ج.م في الطلب ${refOfCase(caseId)}`, caseId };
      }
      const res = receivePortal(client, target, text || (docs.length ? '[مرفقات]' : ''), { attachments: docs, meta, clientRef: clientRefOf(body) });
      if (res.duplicate) return { ok: true, duplicate: true, message_id: res.message_id };
      if (note) {
        notifyFor(note.caseId, { type: note.type, title: note.title, body: truncate(text || '[رسالة صوتية أو صورة]', 160), link: `#/cases/${note.caseId}` });
      } else if (res.caseRow && !res.created_intake) {
        notifyFor(res.caseRow.id, { type: 'case.client_message', title: `رسالة جديدة من المستفيد/ة في الطلب ${refOfCase(res.caseRow.id)}`, body: truncate(text || '[مرفقات]', 140), link: `#/cases/${res.caseRow.id}` });
      }
      return { ok: true, message_id: res.message_id };
    },

    /** «هحضر إن شاء الله» / «مش هقدر أحضر» / «عندي سؤال» على موعد يلزم حضورها */
    eventResponse(client, intakeId, eventId, body = {}, { phone = null, via = 'portal' } = {}) {
      const sc = scopeOf(client, intakeId, { phone });
      const answer = v.oneOf(body.answer, ['yes', 'no', 'question'], 'الرد', { required: true });
      const e = db.get(`SELECT e.*, m.case_id, m.code AS matter_code, m.court FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE e.id = ? AND e.matter_id IN (${inList(sc.matterIds)})`, eventId);
      if (!e) throw notFound('الميعاد ده مش موجود');
      if (e.status !== 'scheduled' || e.starts_at < addDays(nowIso(), -1)) throw conflict('الميعاد ده عدّى أو اتلغى.');
      return recordEventResponse(client, e, answer, { intakeId, form: sc.websiteOnly ? addressForm({ name: sc.intake?.contact_name }) : addressForm(client), via });
    },

    /** موافقة المستفيد/ة على مصاريف القضية (أو سؤالها أو «مش قادرة أدفع») */
    invoiceResponse(client, intakeId, number, body = {}, { phone = null } = {}) {
      const sc = scopeOf(client, intakeId, { phone });
      const answer = v.oneOf(body.answer, ['agree', 'question', 'cannot_pay'], 'الرد', { required: true });
      const inv = db.get(
        `SELECT * FROM invoices WHERE number = ? AND status != 'cancelled' AND (matter_id IN (${inList(sc.matterIds)}) OR case_id IN (${inList(sc.caseIds)}))`,
        String(number || '').slice(0, 40),
      );
      if (!inv) throw notFound('المبلغ ده مش موجود');
      if (inv.status === 'paid' && answer !== 'question') throw conflict('المبلغ ده اتدفع خلاص.');
      const form = sc.websiteOnly ? addressForm({ name: sc.intake?.contact_name }) : addressForm(client);
      const t = nowIso();
      const caseId = inv.case_id || db.value('SELECT case_id FROM matters WHERE id = ?', inv.matter_id);
      const amount = `${fromMinor(inv.amount_minor).toLocaleString('en-US')} ج.م`;
      const patch = { client_response: answer, client_response_at: t };
      if (answer === 'agree' && !inv.client_agreed_at) patch.client_agreed_at = t;
      db.update('invoices', inv.id, patch);
      const said = { agree: 'موافقة على', question: 'عندي سؤال على', cannot_pay: form === 'm' ? 'مش قادر أدفع' : 'مش قادرة أدفع' }[answer];
      const text = answer === 'cannot_pay' ? `${said}: ${amount} (${inv.description})` : `${said} مصاريف القضية: ${amount} (${inv.description})`;
      const res = receivePortal(client, targetForCase(intakeId, caseId), text, { meta: { invoice_number: inv.number, invoice_response: answer } });
      const ref = refOfCase(caseId);
      app.activity.log({
        case_id: caseId,
        matter_id: inv.matter_id,
        client_id: client.id,
        actor: { kind: 'client' },
        type: 'invoice.client_response',
        summary: answer === 'agree' ? `وافق${form === 'm' ? '' : 'ت'} ${who(form)} على الفاتورة ${inv.number} (${amount})` : answer === 'cannot_pay' ? `أبلغ${form === 'm' ? '' : 'ت'} ${who(form)} بعدم القدرة على دفع الفاتورة ${inv.number} (طلب إعفاء)` : `سؤال من ${who(form)} على الفاتورة ${inv.number}`,
        data: { invoice_id: inv.id, answer, message_id: res.message_id },
      });
      notifyFor(caseId, {
        type: 'invoice.client_response',
        title:
          answer === 'cannot_pay'
            ? `«مش قادرة أدفع»: طلب إعفاء من ${amount} في الطلب ${ref}`
            : answer === 'agree'
              ? `وافق${form === 'm' ? '' : 'ت'} ${who(form)} على ${amount} في الطلب ${ref}`
              : `سؤال على مبلغ ${amount} في الطلب ${ref}`,
        body: `${inv.number} — ${inv.description}`,
        link: inv.matter_id ? `#/matters/${inv.matter_id}` : `#/cases/${caseId}`,
      });
      return { ok: true, client_agreed_at: patch.client_agreed_at || inv.client_agreed_at || null, client_response: answer };
    },

    /** «اطلبي مكالمة»: الصبح / الضهر / أي وقت — مرتين في اليوم على الأكثر لكل مستفيد/ة */
    callback(client, intakeId, body = {}, { phone = null } = {}) {
      const when = v.oneOf(body.when || 'any', ['morning', 'noon', 'any'], 'الوقت المناسب', { required: true });
      const since = addDays(nowIso(), -1);
      const sc = scopeOf(client, intakeId, { phone });
      // v9.1 fixes: الحد لكل نطاق رابط (طلبات الرابط وما تفرع عنها)، لا لكل العميل: طلب موقع غير مؤكد برقمها
      // لا يستهلك حصة صاحبة الرقم الحقيقية (ولا العكس)
      const n = Number(
        db.value(
          `SELECT COUNT(*) FROM messages WHERE client_id = ? AND direction = 'in' AND json_extract(meta, '$.callback') IS NOT NULL AND created_at > ?
             AND (intake_id IN (${inList(sc.intakeIds)}) OR case_id IN (${inList(sc.caseIds)}) OR matter_id IN (${inList(sc.matterIds)}))`,
          client.id,
          since,
        ),
      );
      if (n >= 2) throw new ApiError(429, 'طلبتي مكالمة مرتين النهارده. هنكلمك قريب إن شاء الله.', 'callback_limit');
      const form = sc.websiteOnly ? addressForm({ name: sc.intake?.contact_name }) : addressForm(client);
      const text = `${form === 'm' ? 'طلب المستفيد' : 'طلبت المستفيدة'} مكالمة (${WHEN_LABEL[when]})`;
      // v9.1 fixes: الرسالة في محادثتها بكلامها هي؛ صياغة الإدارة («طلبت المستفيدة مكالمة») في السجل والإشعار فقط
      const own = `${form === 'm' ? 'عايز' : 'عايزة'} حد يكلمني — ${WHEN_LABEL[when]}`;
      const res = receivePortal(client, app.portal.targetFor(client, intakeId, { phone }), own, { meta: { callback: when } });
      const ref = res.intake?.code || (res.caseRow ? refOfCase(res.caseRow.id) : null);
      app.activity.log({ intake_id: res.intake?.id, case_id: res.caseRow?.id, client_id: client.id, actor: { kind: 'client' }, type: 'client.callback', summary: text, data: { when, message_id: res.message_id } });
      notifyFor(res.caseRow?.id || null, {
        type: 'client.callback',
        title: `${text}${ref ? ` — الطلب ${ref}` : ''}`,
        body: 'اتصلوا على رقمها المسجل في الطلب، والمكالمة نفسها فرصة لتأكيد هويتها.',
        link: res.caseRow ? `#/cases/${res.caseRow.id}` : res.intake ? `#/inbox/${res.intake.id}` : null,
      });
      return { ok: true };
    },

    /**
     * تذكير «قبلها بيوم» بموعد يلزم حضورها (B91-13) — تستدعيه قاعدة hearing_reminder مرة واحدة لكل موعد.
     * داخل نافذة واتساب يُرسل بزرين «هحضر / مش هقدر» يرجعان لنفس معالجة الصفحة (onButtonReply).
     * e: صف الموعد مع client_id وcase_id وintake_id وmatter_code. params.template_day_before يتقدم على النص الافتراضي.
     */
    dayBeforeReminder(e, params = {}) {
      const client = app.clients.get(e.client_id) || {};
      const words = app.engine?.clientWords ? app.engine.clientWords({ clientId: e.client_id, intakeId: e.intake_id ?? null, caseId: e.case_id, matterId: e.matter_id }) : null;
      const form = words?.form || addressForm(client);
      const kind = LABELS.event_kind[e.kind] || 'موعد';
      const vars = {
        first_name: words ? words.first_name : addressName(client.name),
        event_kind: kind,
        time_spoken: spokenTime(e.starts_at),
        date: spokenDate(e.starts_at),
        location: e.location || e.matter_court || 'المحكمة',
        org_name: app.settings.get('org_name') || 'بيوت مصر',
      };
      const tpl = typeof params.template_day_before === 'string' && params.template_day_before.trim() ? params.template_day_before : DAY_BEFORE_TEMPLATE;
      // (v9.1 fixes: قائمة «هاتي معاكي» وسطر اللقاء المعتمدان من الإدارة بدل «هاتي بطاقتك» وحدها)
      const body = withClientNote(
        app.engine?.fillClientText
          ? app.engine.fillClientText(tpl, vars, form)
          : genderize(String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ? String(vars[k]) : m)).replace(/يا \{first_name\}/, 'بيك{ي}'), form),
        e,
        form,
      );
      const msg = app.engine.sendToClient({
        client_id: e.client_id,
        intake_id: e.intake_id ?? null,
        case_id: e.case_id,
        matter_id: e.matter_id,
        body,
        automated: true,
        rule: 'hearing_reminder',
        meta: {
          vars: { ...vars, matter_code: e.matter_code, time: spokenTime(e.starts_at) },
          reminder: 'day_before',
          event_id: e.id,
          wa: { type: 'buttons', text: body, buttons: [{ id: `evt:${e.id}:yes`, title: 'هحضر' }, { id: `evt:${e.id}:no`, title: 'مش هقدر' }] },
        },
      });
      // رقم غير مؤكد (B91-01): لا يصل الرقم شيء، والتخطي يُسجَّل مرة واحدة
      if (!msg || msg.skipped) return msg?.skipped ? `skipped_${msg.skipped}` : 'skipped';
      app.activity.log({ matter_id: e.matter_id, case_id: e.case_id, actor: { kind: 'system' }, type: 'automation.hearing_reminder', summary: `أُرسل تذكير آلي للمستفيد/ة قبل الموعد بيوم (${kind} — ${spokenDate(e.starts_at)} الساعة ${spokenTime(e.starts_at)})` });
      return { message_id: msg.id };
    },

    /** زر «هحضر / مش هقدر» في رسالة تذكير واتساب التفاعلية (evt:<id>:yes|no) — نفس معالجة الصفحة */
    onButtonReply(result, msg) {
      const m = /^evt:(\d+):(yes|no)$/.exec(msg?.reply?.id || '');
      if (!m || !result?.client || msg.channel !== 'whatsapp') return null;
      const e = db.get('SELECT e.*, m.case_id, m.code AS matter_code, m.court, m.client_id FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE e.id = ?', Number(m[1]));
      if (!e || e.client_id !== result.client.id || e.status !== 'scheduled') return null;
      return recordEventResponse(result.client, e, m[2], { form: addressForm(result.client), via: 'whatsapp', messageId: result.message_id });
    },
  };

  function recordEventResponse(client, e, answer, { intakeId = null, form = 'f', via = 'portal', messageId = null } = {}) {
    const t = nowIso();
    db.update('matter_events', e.id, { client_response: answer, client_response_at: t });
    const kind = LABELS.event_kind[e.kind] || 'موعد';
    const when = `${kind} يوم ${spokenDate(e.starts_at)}`;
    const text = `${form === 'm' ? 'ردّ المستفيد' : 'ردّت المستفيدة'}: ${RESPONSE_TEXT[answer]} — ${when}`;
    let mid = messageId;
    if (via === 'portal') {
      // v9.1 fixes: رسالتها في محادثتها بكلامها هي («هحضر إن شاء الله — جلسة يوم …»)؛ صياغة الإدارة في السجل والإشعار فقط
      const own = `${RESPONSE_TEXT[answer]} — ${when}`;
      const res = receivePortal(client, targetForCase(intakeId, e.case_id), own, { meta: { event_id: e.id, event_response: answer } });
      mid = res.message_id;
    } else if (messageId) {
      db.run("UPDATE messages SET meta = json_set(meta, '$.event_id', ?, '$.event_response', ?) WHERE id = ?", e.id, answer, messageId);
    }
    app.activity.log({ matter_id: e.matter_id, case_id: e.case_id, client_id: client.id, actor: { kind: 'client' }, type: 'event.client_response', summary: text, data: { event_id: e.id, answer, via, message_id: mid } });
    const ref = refOfCase(e.case_id);
    app.notifications.notifyStaff(
      {
        type: 'event.client_response',
        title:
          answer === 'no'
            ? `مهم: ${form === 'm' ? 'المستفيد مش هيقدر' : 'المستفيدة مش هتقدر'} تحضر ${when} — الطلب ${ref}`
            : answer === 'yes'
              ? `${form === 'm' ? 'المستفيد هيحضر' : 'المستفيدة هتحضر'} ${when} — الطلب ${ref}`
              : `سؤال من ${who(form)} على ${when} — الطلب ${ref}`,
        body: e.matter_code ? `الملف ${e.matter_code}${e.court ? ` — ${e.court}` : ''}` : null,
        link: `#/matters/${e.matter_id}`,
      },
      { caseManagerId: db.value('SELECT case_manager_id FROM cases WHERE id = ?', e.case_id) || null },
    );
    // v9.1 fixes: المحامي المسؤول يعرف حضورها المتوقع (بصياغة محايدة، بلا ردها الحرفي ولا أي بيانات تواصل)
    const lawyerId = answer === 'question' ? null : db.value('SELECT responsible_lawyer_id FROM matters WHERE id = ?', e.matter_id);
    if (lawyerId) {
      app.notifications.notify(lawyerId, {
        type: 'event.client_attendance',
        title: answer === 'yes' ? `أكّدت المستفيد/ة حضور ${when}` : `أبلغت المستفيد/ة بتعذّر حضور ${when}`,
        body: e.matter_code ? `الملف ${e.matter_code}` : null,
        link: `#/my/matters/${e.matter_id}`,
      });
    }
    return { ok: true, client_response: answer, client_response_at: t };
  }

  return svc;
}
