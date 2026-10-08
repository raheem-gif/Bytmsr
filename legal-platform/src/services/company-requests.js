// الإصدار 10 — طلبات الشركات: كائن العلاقة مع الشركة (L-21) بجانب ملف العمل الداخلي في المحرك.
//
// المحتوى: الرفع على مراحل (L-27)، والإرسال والقوائم والبحث والمتابعة (L-51، L-54، L-55)، وعرض الطلب للشركة (§4.5،
// L-25)، والرسائل والمستندات والمتابعون والإلغاء والتصعيد (CO-18)، وقاعدة التنزيل (L-52)، وصفوف فريق المكتب وصفحة الطلب،
// والاستيضاح قبل القبول وبعده مع إيقاف مستوى الخدمة ومرحلة «تأكيد الموعد» (L-28)، والقبول ← ملف في المحرك (B10-24)،
// وعروض الأسعار والتكاليف (L-31، L-61)، والتسليمات وبوابة المستندات (L-56، L-58) والاعتماد وطلب التعديلات والإغلاق.
//
// قواعد معيارية:
//  - كل قراءة لطلب من البوابة عبر visibleRequestSql، والمعرّفات المتداخلة (رسالة، تسليم، عرض) عبر الطلب الظاهر (L-51).
//  - غير الظاهر = 404 بنفس جسم غير الموجود (L-35). الكتابة من «اطلاع فقط» = 403 (يفحصها غلاف المسارات).
//  - مستخدم الشركة لا يدخل خدمة من خدمات المحرك ولا عمودًا يشير إلى users(id) أبدًا (L-19): الفاعل companyActor أو SYSTEM_ACTOR.
//  - لا شيء يصل الشركة عن المحامين أو الفريق أو الذكاء الاصطناعي أو الملاحظات الداخلية أو التكاليف الداخلية (INV-B4).
import fs from 'node:fs';
import path from 'node:path';
import {
  nowIso, now, badRequest, notFound, conflict, forbidden, ApiError, v, parseJson, normalizeArabic, arabicDate, arabicTime,
  truncate, formatEgp, cairoDayKey, addDays, arabicCount,
} from '../util.js';
import { LABELS, AREA_CODES } from '../constants.js';
import {
  REQUEST_TYPE_KEYS, typeByKey, validateFields, renderTitle, TYPE_FIELDS, REQUEST_LIMITS, B2B_SKILLS, DELIVERABLE_KINDS, cairoToday,
  memoryKindByKey,
} from '../../public/assets/js/lib/company-catalog-fields.js';
import {
  calendars, dueAt, slaState, slaFor, deliveryHours, pauseRemaining, resumeDue, businessMinutesBetween, remainingMinutes, durationText, hoursText,
  addBusinessMinutes,
} from '../../public/assets/js/lib/company-sla.js';
import { visibleRequestSql, readableMemorySql, companyActor, SYSTEM_ACTOR, REQUEST_CODE_RE } from './companies.js';
import { TERMS_DEFAULTS } from './company-billing.js';
import { redact } from '../ai/redact.js';

// ───────────────────────── ثوابت ─────────────────────────
export const OPEN_STATUSES = Object.freeze(['submitted', 'awaiting_company', 'in_progress', 'delivered']);
const CLOSED_STATUSES = ['closed', 'declined', 'cancelled'];
const WRITERS = ['company_admin', 'member'];
const UPLOAD_TTL_MS = 24 * 3600 * 1000;
const UPLOADS_PER_HOUR = 60;
const UPLOADS_IN_FLIGHT = 4;
const SUBMITS_PER_HOUR = 30;
const MESSAGES_PER_HOUR = 120;
const PER_CALL = 5;
const PER_REQUEST = REQUEST_LIMITS.files_per_request;
const ESCALATE_EVERY_MS = 24 * 3600 * 1000;
const REOPEN_DAYS = 30;
/** أنواع الملفات في البوابة (لا صوت ولا فيديو؛ L-27): الامتداد ← النوع */
const UPLOAD_EXT = Object.freeze({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.txt': 'text/plain',
});
const UPLOAD_MIMES = new Set(Object.values(UPLOAD_EXT));
const AV_EXT = /\.(?:mp3|m4a|ogg|oga|opus|wav|webm|mp4|m4v|mov|avi|mkv|3gp|aac|amr|flac)$/i;
const SAVE_TO_MEMORY_TYPES = ['contract_review', 'contract_drafting', 'nda'];
const COUNTERPARTY_FIELDS = { counterparty_name: 'other', sender_name: 'other', supplier_name: 'supplier' };
const SEARCH_FIELDS = ['counterparty_name', 'sender_name', 'supplier_name', 'item_name', 'campaign_name'];
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const label = (group, key) => LABELS[group]?.[key] || key || '';
const major = (minor) => (minor === null || minor === undefined ? null : Math.round(Number(minor)) / 100);

// ───────────────────────── نصوص الشركة (عربية فصحى بصيغة الجمع) ─────────────────────────
export const COMPANY_TEXT = Object.freeze({
  not_found: 'الطلب غير موجود.',
  upload_not_found: 'الملف غير موجود.',
  upload_unavailable: 'هذا الملف لم يعد متاحًا للإرفاق؛ ارفعوه من جديد.',
  busy: 'الخادم مشغول برفع ملفات أخرى الآن؛ نعيد المحاولة بعد لحظات.',
  uploads_rate: 'رفعتم ملفات كثيرة خلال ساعة؛ حاولوا بعد قليل.',
  files_per_day: 'وصلت شركتكم للحد اليومي من الملفات المرفوعة؛ حاولوا غدًا أو تواصلوا مع فريقكم القانوني.',
  storage_full: 'امتلأت المساحة المتاحة لملفات شركتكم؛ تواصلوا مع فريقكم القانوني.',
  file_type: 'نوع الملف غير مدعوم. المسموح: PDF أو Word أو Excel أو صور أو ملف نصي.',
  file_av: 'لا نقبل التسجيلات الصوتية أو الفيديو هنا؛ اكتبوا ما تريدون قوله في الوصف.',
  file_empty: 'الملف فارغ.',
  per_call: 'الحد 5 ملفات في المرة؛ أضيفوا الباقي من صفحة الطلب بعد إرساله.',
  per_request: 'وصل الطلب للحد الأقصى من المستندات (30 مستندًا).',
  submit_rate: 'أرسلتم طلبات كثيرة خلال ساعة؛ حاولوا بعد قليل.',
  message_rate: 'أرسلتم رسائل كثيرة خلال ساعة؛ حاولوا بعد قليل.',
  fields: 'راجعوا الحقول المظللة.',
  memory_not_found: 'العنصر غير موجود في ذاكرتكم القانونية.',
  urgent_allowance: (m) => `استخدمتم الطلبات العاجلة المتاحة في باقتكم لهذه الدورة (${m})؛ سُجّل الطلب بأولوية «مرتفع».`,
  accepted: (when) => `بدأ فريقكم القانوني العمل على الطلب. موعد التسليم المتوقع: ${when}.`,
  confirm: (when) => `نؤكد لكم موعد التسليم قبل ${when}.`,
  escalation_throttled: 'رفعتم هذا الطلب لإدارة المكتب خلال آخر 24 ساعة؛ سيتواصل معكم مدير علاقتكم لدينا.',
  cancel_state: 'لا يمكن إلغاء الطلب بعد بدء العمل عليه؛ راسلوا فريقكم القانوني.',
  closed_state: 'هذا الطلب مغلق؛ لا يمكن الإضافة إليه.',
  quote_expired: 'انتهت صلاحية عرض السعر. اطلبوا من فريقكم القانوني عرضًا جديدًا.',
  quote_state: 'لم يعد عرض السعر بانتظار القرار.',
  revision_limit: 'انتهت جولات التعديل المتاحة لهذا الطلب أو مدتها؛ راسلوا فريقكم القانوني لأي ملاحظة.',
  deliverable_state: 'لم يعد هذا التسليم بانتظار قراركم.',
  clarification_answered: 'سبق الرد على هذا السؤال.',
  reply_empty: 'اكتبوا ردكم أو أرفقوا ملفًا أو حددوا ما ليس متوفرًا لديكم.',
});

/** خطأ «غير موجود» واحد للطلب غير الموجود وغير الظاهر (L-35) */
const requestNotFound = () => new ApiError(404, COMPANY_TEXT.not_found, 'not_found');

/** «الخميس 8 أكتوبر 2026، 4:00 مساءً» */
export function whenText(iso) {
  return iso ? `${arabicDate(iso)}، ${arabicTime(iso)}` : '';
}

export function createCompanyRequests(app) {
  const { db, config } = app;
  const companies = () => app.companies;
  const cals = () => calendars(app.settings.all());
  const termsOf = (companyId) => app.companyBilling.activeSubscription(companyId)?.terms || TERMS_DEFAULTS;
  const companyOf = (id) => db.get('SELECT * FROM companies WHERE id = ?', id);
  let uploadsInFlight = 0;

  // ───────────────────────── أدوات عامة ─────────────────────────
  function flagsOf(r) {
    const f = parseJson(r.flags, []);
    return Array.isArray(f) ? f : [];
  }
  function withFlags(r, add = [], remove = []) {
    const s = new Set(flagsOf(r));
    for (const x of remove) s.delete(x);
    for (const x of add) s.add(x);
    return JSON.stringify([...s]);
  }
  function getById(id) {
    return db.get('SELECT * FROM company_requests WHERE id = ?', Number(id) || 0) || null;
  }
  function requireStaffRequest(id) {
    const r = getById(id);
    if (!r) throw notFound('طلب الشركة غير موجود');
    return r;
  }
  /** الطلب الظاهر لمستخدم الشركة بالرمز (وإلا 404) */
  function visibleByCode(cu, code) {
    const c = String(code || '').toUpperCase();
    if (!REQUEST_CODE_RE.test(c)) throw requestNotFound();
    const vis = visibleRequestSql(cu, 'r');
    const r = db.get(`SELECT r.* FROM company_requests r WHERE r.code = ? AND ${vis.sql}`, c, ...vis.params);
    if (!r) throw requestNotFound();
    return r;
  }
  function isVisible(cu, requestId) {
    const vis = visibleRequestSql(cu, 'r');
    return !!db.get(`SELECT 1 FROM company_requests r WHERE r.id = ? AND ${vis.sql}`, requestId, ...vis.params);
  }
  /** تحديث مع مقارنة الإصدار (rev): تعارض ← 409 request_changed بالصفحة الحديثة */
  function casUpdate(r, patch, { actor = null } = {}) {
    const t = nowIso();
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    const sql = `UPDATE company_requests SET ${keys.map((k) => `${k} = ?`).join(', ')}${keys.length ? ', ' : ''}rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?`;
    const res = db.run(sql, ...keys.map((k) => patch[k]), t, r.id, r.rev);
    if (!res.changes) throw new ApiError(409, 'تغيّر الطلب منذ فتحته؛ راجِع آخر نسخة ثم أعد المحاولة.', 'request_changed', actor ? { request: svc.staffDetail(r.id, actor) } : undefined);
    return getById(r.id);
  }
  function checkRev(r, body) {
    if (body?.rev === undefined || body?.rev === null || body?.rev === '') return;
    if (Number(body.rev) !== Number(r.rev)) throw new ApiError(409, 'تغيّر الطلب منذ فتحته؛ راجِع آخر نسخة ثم أعد المحاولة.', 'request_changed');
  }
  function since(ms) {
    return new Date(now().getTime() - ms).toISOString();
  }
  const sizeLabel = (s) => ({ S: 'صغير', M: 'متوسط', L: 'كبير', XL: 'كبير جدًا' })[s] || s;

  function activity(r, actor, e) {
    app.activity.log({ actor, company_id: r.company_id, company_request_id: r.id, case_id: r.case_id ?? null, ...e });
  }
  function companyActivity(r, cu, c, e) {
    app.activity.log({
      actor: { kind: 'company' },
      company_id: r.company_id,
      company_request_id: r.id,
      company_user_id: cu.id,
      ...e,
      data: { ...(e.data || {}), by: companyActor(cu, c).name },
    });
  }

  // ───────────────────────── مستوى الخدمة (L-28) ─────────────────────────
  function calOf(clock, c = cals()) {
    return clock === 'calendar' ? c.urgent : c.business;
  }
  /** إيقاف موعد التسليم أثناء انتظار الشركة */
  function pausePatch(r, reason, t) {
    if (!r.delivery_due_at || r.sla_paused_at) return {};
    db.insert('company_sla_pauses', { request_id: r.id, reason, started_at: t });
    return { sla_paused_at: t, sla_remaining_minutes: pauseRemaining(t, r.delivery_due_at, r.sla_clock, cals()) };
  }
  /** الاستئناف: الموعد الجديد = الآن + الدقائق المتبقية، وتُجمع دقائق الإيقاف */
  function resumePatch(r, t) {
    if (!r.sla_paused_at) return {};
    const c = cals();
    const paused = businessMinutesBetween(r.sla_paused_at, t, calOf(r.sla_clock, c));
    db.run('UPDATE company_sla_pauses SET ended_at = ?, business_minutes = ? WHERE request_id = ? AND ended_at IS NULL', t, paused, r.id);
    return {
      delivery_due_at: resumeDue(t, r.sla_remaining_minutes, r.sla_clock, c),
      sla_paused_at: null,
      sla_remaining_minutes: null,
      sla_paused_minutes_total: (Number(r.sla_paused_minutes_total) || 0) + paused,
    };
  }
  /** أول رد (CO-3): القبول أو الاستيضاح أو عرض السعر أو طلب الموافقة على تكلفة أو الاعتذار فقط */
  function firstResponsePatch(r, kind, t) {
    return r.first_response_at ? {} : { first_response_at: t, first_response_kind: kind };
  }
  /** مرحلة «تأكيد الموعد» بعد رد الشركة على استيضاح قبل القبول أو موافقتها على عرض (L-28) */
  function confirmDue(r, t) {
    const s = slaFor(termsOf(r.company_id), r.priority);
    return dueAt(t, s.first_response_hours, s.clock, cals());
  }

  /** وعد الطلب كما تراه الشركة (U10-44) أو فريق المكتب (staff: at_risk ظاهرة والمرحلة الداخلية) */
  function promiseOf(r, { staff = false } = {}) {
    const p = promiseCore(r, { staff });
    if (!staff) delete p.phase;
    return p;
  }
  function promiseCore(r, { staff = false } = {}) {
    const t = nowIso();
    const c = cals();
    const terms = termsOf(r.company_id);
    const p = {
      first_response_by: null,
      first_response_at: r.first_response_at || null,
      confirm_by: null,
      delivery_by: r.delivery_due_at || null,
      state: null,
      paused: !!r.sla_paused_at || r.status === 'awaiting_company',
      changed_reason: r.delivery_due_reason && r.delivery_due_original_at && r.delivery_due_at !== r.delivery_due_original_at ? r.delivery_due_reason : null,
      delivery_estimate_text: null,
      phase: null,
    };
    if (r.status === 'cancelled' || r.status === 'declined') return { ...p, paused: false };
    if (r.delivered_at && (r.status === 'delivered' || r.status === 'closed')) {
      p.state = r.delivery_due_at ? (r.delivered_at <= r.delivery_due_at ? 'met' : 'missed') : 'met';
      p.delivered_at = r.delivered_at;
      p.paused = false;
      return p;
    }
    if (r.status === 'closed') return { ...p, paused: false };
    if (r.accepted_at && r.delivery_due_at) {
      p.phase = 'delivery';
      const st = slaState({ startIso: r.accepted_at, dueIso: r.delivery_due_at, pausedAt: r.sla_paused_at, clock: r.sla_clock, cals: c, now: t });
      p.state = !staff && st === 'at_risk' ? 'on_track' : st;
      p.paused = st === 'paused';
      return p;
    }
    // قبل القبول: التسليم المعتاد لطلب مثل هذا (L-54)
    const type = typeByKey(r.type);
    const h = deliveryHours(terms, r.priority, type?.default_size || 'M');
    const clock = slaFor(terms, r.priority).clock;
    if (h) p.delivery_estimate_text = clock === 'calendar' ? hoursText(h) : durationText(h, c.business);
    if (r.status === 'awaiting_company') {
      p.phase = null;
      p.state = 'paused';
      return p;
    }
    if (r.confirm_due_at) {
      p.phase = 'confirm';
      p.confirm_by = r.confirm_due_at;
      p.state = t > r.confirm_due_at ? 'late' : staff ? slaState({ startIso: r.updated_at, dueIso: r.confirm_due_at, clock, cals: c, now: t }) : 'on_track';
      if (!staff && p.state === 'at_risk') p.state = 'on_track';
      return p;
    }
    if (!r.first_response_at) {
      p.phase = 'first_response';
      p.first_response_by = r.first_response_due_at || null;
      if (r.first_response_due_at) {
        const st = slaState({ startIso: r.created_at, dueIso: r.first_response_due_at, clock: r.sla_clock, cals: c, now: t });
        p.state = !staff && st === 'at_risk' ? 'on_track' : st;
      } else p.state = 'on_track';
      return p;
    }
    p.state = 'on_track';
    return p;
  }

  /** مستوى الخدمة لفريق المكتب: { phase, due_at, state, business_minutes_left, paused } */
  function staffSla(r) {
    const pr = promiseOf(r, { staff: true });
    const phase = pr.phase;
    const due = phase === 'delivery' ? r.delivery_due_at : phase === 'confirm' ? r.confirm_due_at : phase === 'first_response' ? r.first_response_due_at : null;
    let left = null;
    if (due && pr.state !== 'paused') {
      const clock = phase === 'delivery' ? r.sla_clock : slaFor(termsOf(r.company_id), r.priority).clock;
      left = remainingMinutes(nowIso(), due, clock, cals());
    } else if (pr.state === 'paused' && r.sla_remaining_minutes !== null && r.sla_remaining_minutes !== undefined) left = Number(r.sla_remaining_minutes);
    return {
      phase,
      phase_label: phase ? label('company_sla_phase', phase) : null,
      due_at: due || null,
      state: pr.state,
      state_label: pr.state ? label('company_sla_state', pr.state) : null,
      business_minutes_left: left,
      paused: pr.state === 'paused',
    };
  }

  // ───────────────────────── المرحلة والجدول الزمني (L-25) ─────────────────────────
  /** بداية دورة العمل الحالية: القبول، أو آخر «طلب تعديلات»، أو آخر إعادة فتح */
  function cycleStartOf(r) {
    const changes = db.value("SELECT MAX(decided_at) FROM company_deliverables WHERE request_id = ? AND decision = 'changes_requested'", r.id);
    return [r.accepted_at, r.reopened_at, changes].filter(Boolean).sort().pop() || null;
  }
  /** المراجعة النهائية: أول رأي مقدم في الدورة الحالية لم يُعد للمحامي */
  function finalReviewAt(r, start) {
    if (!r.case_id || !start) return null;
    return db.value("SELECT MIN(submitted_at) FROM opinions WHERE case_id = ? AND status IN ('submitted','approved') AND submitted_at >= ?", r.case_id, start) || null;
  }
  function stageOf(r) {
    if (CLOSED_STATUSES.includes(r.status)) return r.status;
    if (r.status === 'delivered') return 'delivered';
    if (r.status === 'awaiting_company') return r.waiting_on === 'info' ? 'needs_you' : 'approval';
    if (r.status === 'in_progress') {
      if (r.waiting_on === 'info') return 'needs_you';
      if (r.waiting_on === 'quote' || r.waiting_on === 'overage') return 'approval';
      return finalReviewAt(r, cycleStartOf(r)) ? 'final_review' : 'working';
    }
    return 'received';
  }
  function timelineOf(r) {
    const start = cycleStartOf(r);
    const deliveredAt = start
      ? db.value("SELECT MIN(released_at) FROM company_deliverables WHERE request_id = ? AND final = 1 AND status IN ('released','withdrawn') AND released_at >= ?", r.id, start)
      : null;
    const timeline = [
      { stage: 'received', at: r.created_at },
      { stage: 'working', at: start },
      { stage: 'final_review', at: finalReviewAt(r, start) || (deliveredAt ? deliveredAt : null) },
      { stage: 'delivered', at: deliveredAt || null },
    ];
    if (r.status === 'closed') timeline.push({ stage: 'closed', at: r.closed_at });
    // الدورات السابقة (قبل كل «طلب تعديلات»)
    const history = db
      .all("SELECT version, released_at, decided_at FROM company_deliverables WHERE request_id = ? AND decision = 'changes_requested' ORDER BY decided_at", r.id)
      .map((d, i) => ({ cycle: i + 1, delivered_at: d.released_at, changes_requested_at: d.decided_at, version: d.version }));
    return { timeline, timeline_history: history };
  }

  // ───────────────────────── العروض المختصرة ─────────────────────────
  function companyDocView(d) {
    const pv = app.documents.publicView(d);
    return {
      id: pv.id,
      title: pv.title,
      filename: pv.filename,
      mime: pv.mime,
      size: pv.size,
      kind: pv.kind,
      from: d.uploaded_by_kind === 'client' ? 'company' : 'team',
      created_at: pv.created_at,
      url: `/api/company/documents/${d.id}/download`,
    };
  }
  function staffDocView(d) {
    return { ...app.documents.publicView(d), company_request_id: d.company_request_id ?? null, case_id: d.case_id ?? null };
  }
  function userName(id) {
    return id ? db.value('SELECT name FROM company_users WHERE id = ?', id) || null : null;
  }
  function entityOf(r) {
    if (!r.entity_id) return null;
    const e = db.get('SELECT id, name FROM company_entities WHERE id = ? AND company_id = ?', r.entity_id, r.company_id);
    return e ? { id: e.id, name: e.name } : null;
  }
  function needsYou(stage) {
    return stage === 'needs_you' || stage === 'approval' || stage === 'delivered';
  }
  /** صف الطلب في القوائم (U10-27) */
  function rowView(r) {
    const stage = stageOf(r);
    const type = typeByKey(r.type);
    const pr = promiseOf(r);
    return {
      code: r.code,
      type: r.type,
      type_label: type?.company_label || r.type,
      title: r.title,
      stage,
      stage_label: label('company_stage', stage),
      needs_you: needsYou(stage),
      promise: { delivery_by: pr.delivery_by, confirm_by: pr.confirm_by, first_response_by: pr.first_response_by, state: pr.state, paused: pr.paused },
      priority: r.priority,
      visibility: r.visibility,
      updated_at: r.updated_at,
      created_at: r.created_at,
      submitted_by: { id: r.submitted_by, name: userName(r.submitted_by) },
    };
  }

  function messageDocs(messageId, view) {
    return db
      .all('SELECT d.* FROM company_message_documents md JOIN documents d ON d.id = md.document_id WHERE md.message_id = ? ORDER BY d.id', messageId)
      .map(view);
  }
  function messageView(m, { staff = false } = {}) {
    const out = {
      id: m.id,
      direction: m.direction,
      kind: m.kind,
      author: m.direction === 'in' ? { kind: 'user', id: m.author_company_user_id, name: userName(m.author_company_user_id) } : { kind: 'team' },
      body: m.body,
      items: parseJson(m.items, null),
      missing_items: parseJson(m.missing_items, null),
      reply_to_id: m.reply_to_id || null,
      answered_at: m.answered_at || null,
      documents: messageDocs(m.id, staff ? staffDocView : companyDocView),
      created_at: m.created_at,
    };
    if (staff && m.direction === 'out') out.author = { kind: 'team', staff_name: m.author_user_id ? db.value('SELECT name FROM users WHERE id = ?', m.author_user_id) : null };
    if (staff) out.info_request_id = m.info_request_id || null;
    return out;
  }
  function quoteView(q, { staff = false, money = true } = {}) {
    if (!q) return null;
    const out = {
      number: q.number,
      kind: q.kind,
      kind_label: label('company_quote_kind', q.kind),
      basis: q.basis,
      basis_label: label('company_quote_basis', q.basis),
      amount: q.basis === 'fixed' ? major(q.amount_minor) : null,
      cap: q.basis === 'capped' ? major(q.cap_minor) : null,
      amount_text: q.basis === 'fixed' ? formatEgp(q.amount_minor) : formatEgp(q.cap_minor),
      currency: q.currency || 'EGP',
      scope_of_work: q.scope_of_work,
      assumptions: q.assumptions || null,
      excluded: q.excluded || null,
      valid_until: q.valid_until,
      status: q.status,
      status_label: label('company_quote_status', q.status),
      sent_at: q.sent_at,
      decided_at: q.decided_at || null,
      decided_by: q.decided_by_company_user_id ? { id: q.decided_by_company_user_id, name: userName(q.decided_by_company_user_id) } : null,
      decision_note: q.decision_note || null,
    };
    if (!money) {
      out.amount = null;
      out.cap = null;
      out.amount_text = null;
    }
    if (staff) {
      out.id = q.id;
      out.created_by = q.created_by ? { id: q.created_by, name: db.value('SELECT name FROM users WHERE id = ?', q.created_by) } : null;
    }
    return out;
  }
  function deliverableDocs(id, view) {
    return db
      .all('SELECT d.* FROM company_deliverable_documents dd JOIN documents d ON d.id = dd.document_id WHERE dd.deliverable_id = ? ORDER BY d.id', id)
      .map(view);
  }
  function deliverableView(d, { staff = false } = {}) {
    const out = {
      id: d.id,
      version: d.version,
      kind: d.kind,
      kind_label: label('company_deliverable_kind', d.kind),
      title: d.title,
      summary: d.summary,
      body: d.body || null,
      recommendations: parseJson(d.recommendations, []) || [],
      risk_level: d.risk_level || null,
      risk_level_label: d.risk_level ? label('company_risk_level', d.risk_level) : null,
      final: !!d.final,
      status: d.status,
      documents: deliverableDocs(d.id, staff ? staffDocView : companyDocView),
      released_at: d.released_at || null,
      decision: d.decision || null,
      decided_at: d.decided_at || null,
      rating: d.rating ?? null,
      feedback: d.feedback || null,
    };
    if (staff) {
      Object.assign(out, {
        status_label: label('company_deliverable_status', d.status),
        opinion_id: d.opinion_id || null,
        docs_reviewed: !!d.docs_reviewed,
        prepared_by: d.prepared_by ? db.value('SELECT name FROM users WHERE id = ?', d.prepared_by) : null,
        released_by: d.released_by ? db.value('SELECT name FROM users WHERE id = ?', d.released_by) : null,
        withdrawn_at: d.withdrawn_at || null,
        withdraw_reason: d.withdraw_reason || null,
        created_at: d.created_at,
        updated_at: d.updated_at,
      });
    }
    return out;
  }
  function watchersOf(r) {
    return db
      .all('SELECT u.id, u.name, u.role FROM company_request_watchers w JOIN company_users u ON u.id = w.company_user_id WHERE w.request_id = ? AND u.active = 1 ORDER BY u.name', r.id)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, role_label: label('company_user_role', u.role) }));
  }
  function memoryRefs(r, cu = null) {
    const where = cu ? readableMemorySql(cu, 'm') : { sql: 'm.company_id = ?', params: [r.company_id] };
    return db
      .all(
        `SELECT m.id, m.kind, m.title, m.status, m.next_date FROM company_request_memory l JOIN company_memory m ON m.id = l.memory_id
         WHERE l.request_id = ? AND m.archived_at IS NULL AND ${where.sql} ORDER BY m.id`,
        r.id,
        ...where.params,
      )
      .map((m) => ({ id: m.id, kind: m.kind, kind_label: label('company_memory_kind', m.kind), title: m.title, status: m.status, next_date: m.next_date || null }));
  }
  /** مستندات الطلب كما تراها الشركة: ما رفعته للطلب + مرفقات الرسائل + ملفات التسليمات المرسلة (L-52) */
  function companyDocuments(r) {
    const rows = db.all(
      `SELECT d.* FROM documents d WHERE d.company_request_id = ? AND d.uploaded_by_kind = 'client' AND d.company_user_id IS NOT NULL
       UNION SELECT d.* FROM company_message_documents md JOIN company_messages m ON m.id = md.message_id JOIN documents d ON d.id = md.document_id WHERE m.request_id = ?
       UNION SELECT d.* FROM company_deliverable_documents dd JOIN company_deliverables x ON x.id = dd.deliverable_id JOIN documents d ON d.id = dd.document_id
         WHERE x.request_id = ? AND x.status = 'released'
       ORDER BY 1`,
      r.id,
      r.id,
      r.id,
    );
    return rows.map(companyDocView);
  }

  /** ما يحق للمستخدم فعله في الطلب (§4.5 can) */
  function canOf(cu, company, r, { quote = null, finalDeliverable = null } = {}) {
    const ro = companies().isReadOnly(company);
    const writer = !ro && WRITERS.includes(cu.role);
    const admin = cu.role === 'company_admin';
    const submitter = r.submitted_by === cu.id;
    const watcher = !!db.get('SELECT 1 FROM company_request_watchers WHERE request_id = ? AND company_user_id = ?', r.id, cu.id);
    const settings = companies().settingsOf(company);
    const open = !['cancelled', 'declined'].includes(r.status);
    const docs = Number(db.value('SELECT COUNT(*) FROM documents WHERE company_request_id = ?', r.id));
    const decide = writer && (admin || submitter || watcher) && r.status === 'delivered' && !!finalDeliverable && !finalDeliverable.decision;
    const escalateAt = r.last_escalated_at ? Date.parse(r.last_escalated_at) + ESCALATE_EVERY_MS : 0;
    return {
      message: writer && open,
      upload: writer && open && r.status !== 'closed' && docs < PER_REQUEST,
      answer: writer && open,
      cancel: writer && (admin || submitter) && ['submitted', 'awaiting_company'].includes(r.status),
      approve_quote: writer && !!quote && quote.status === 'sent' && (admin || (submitter && settings.quote_approvers === 'admins_or_submitter')),
      decide_deliverable: decide,
      escalate: writer && (admin || submitter) && OPEN_STATUSES.includes(r.status) && now().getTime() >= escalateAt,
      edit_watchers: writer && (admin || submitter) && open,
      record_decision: decide && admin,
      save_to_memory: decide && SAVE_TO_MEMORY_TYPES.includes(r.type),
    };
  }

  /** صفحة الطلب للشركة (§4.5، B10 §7.4 + D9 + L-25) */
  function companyView(cu, company, r) {
    const stage = stageOf(r);
    const type = typeByKey(r.type);
    const terms = termsOf(r.company_id);
    const promise = promiseOf(r);
    const quoteRow = db.get("SELECT * FROM company_quotes WHERE request_id = ? ORDER BY CASE status WHEN 'sent' THEN 0 ELSE 1 END, id DESC LIMIT 1", r.id);
    const delivs = db.all("SELECT * FROM company_deliverables WHERE request_id = ? AND status = 'released' ORDER BY version", r.id);
    const finalD = [...delivs].reverse().find((d) => d.final) || null;
    const autoClose = r.status === 'delivered' && r.delivered_at ? addDays(r.delivered_at, Number(app.settings.get('b2b_auto_close_days')) || 7) : null;
    const windowDays = Number(app.settings.get('b2b_revision_window_days')) || 30;
    const quote = quoteView(quoteRow);
    if (quote && quoteRow.status === 'sent') {
      quote.approver_names = companies()
        .settingsOf(company)
        .quote_approvers === 'admins_or_submitter'
        ? [...new Set([...app.companyNotify.admins(company.id).map((u) => u.name), userName(r.submitted_by)].filter(Boolean))]
        : app.companyNotify.admins(company.id).map((u) => u.name);
    }
    const tl = timelineOf(r);
    return {
      request: {
        code: r.code,
        type: r.type,
        type_label: type?.company_label || r.type,
        title: r.title,
        description: r.description,
        fields: parseJson(r.fields, {}) || {},
        entity: entityOf(r),
        priority: r.priority,
        requested_priority: r.requested_priority,
        priority_changed: r.priority !== r.requested_priority,
        priority_changed_reason: r.priority !== r.requested_priority ? r.priority_changed_reason || null : null,
        urgent_reason: r.urgent_reason || null,
        needed_by: r.needed_by || null,
        visibility: r.visibility,
        visibility_label: label('company_visibility', r.visibility),
        submitted_by: { id: r.submitted_by, name: userName(r.submitted_by) },
        created_at: r.created_at,
        updated_at: r.updated_at,
        status: r.status,
        stage,
        stage_label: label('company_stage', stage),
        waiting_on: r.waiting_on || null,
        promise,
        remaining_business_hours: r.sla_paused_at && r.sla_remaining_minutes !== null ? Math.round((Number(r.sla_remaining_minutes) / 60) * 10) / 10 : null,
        revisions: { used: Number(r.revision_count) || 0, max: Number(terms.revision_rounds ?? 0), until: r.delivered_at ? addDays(r.delivered_at, windowDays) : null },
        auto_close_at: autoClose,
        escalated: !!r.escalated_at,
        last_escalated_at: r.last_escalated_at || null,
        scope: r.quota_kind ? { in_plan: r.quota_kind === 'included' || r.quota_kind === 'free', quota_kind: r.quota_kind, quota_kind_label: label('company_quota_kind', r.quota_kind) } : null,
        resolution: r.resolution || null,
        resolution_note: ['declined', 'closed'].includes(r.status) ? r.resolution_note || null : null,
        rating: r.rating ?? null,
        can: canOf(cu, company, r, { quote: quoteRow, finalDeliverable: finalD }),
      },
      timeline: tl.timeline,
      timeline_history: tl.timeline_history,
      messages: db.all('SELECT * FROM company_messages WHERE request_id = ? ORDER BY id', r.id).map((m) => messageView(m)),
      quote,
      deliverables: delivs.map((d) => deliverableView(d)),
      documents: companyDocuments(r),
      watchers: watchersOf(r),
      matter: null,
      memory_refs: memoryRefs(r, cu),
    };
  }

  // ───────────────────────── الإشعارات ─────────────────────────
  function recipients(r, { admins = false, submitter = true, watchers = true } = {}) {
    const ids = new Set();
    if (submitter) ids.add(r.submitted_by);
    if (watchers) for (const w of db.all('SELECT company_user_id FROM company_request_watchers WHERE request_id = ?', r.id)) ids.add(w.company_user_id);
    if (admins) for (const u of app.companyNotify.admins(r.company_id)) ids.add(u.id);
    return [...ids];
  }
  /** إشعار الشركة بحدث على طلب، مع تتبع البريد لعلامة «لم تُبلَّغ الشركة بالبريد» (CO-2) */
  function notifyCompany(r, { type, title, body = null, email = 'request_update', focus = '', ...who }) {
    const res = app.companyNotify.notify(recipients(r, who), {
      companyId: r.company_id,
      type,
      title,
      body,
      link: `#/requests/${r.code}${focus}`,
      requestId: r.id,
      email: email ? { template: email, vars: { code: r.code } } : null,
    });
    db.run('UPDATE company_requests SET last_notice_at = ?, last_notice_email_id = ? WHERE id = ?', nowIso(), res?.email?.id ?? null, r.id);
    return res;
  }
  function accountManagerId(company) {
    return companies().accountManagerOf(company)?.id ?? null;
  }
  function notifyStaff(r, company, { type, title, body = null, toHandler = true }) {
    const cm = (toHandler && r.handler_id) || accountManagerId(company);
    app.notifications.notifyStaff({ type, title, body, link: `#/company-requests/${r.id}` }, { caseManagerId: cm });
    if (toHandler && r.handler_id && r.handler_id !== accountManagerId(company)) {
      const am = accountManagerId(company);
      if (am) app.notifications.notify([am], { type, title, body, link: `#/company-requests/${r.id}` });
    }
  }
  /** بريد عاجل لفريق المكتب (L-53): مدير العلاقة ومديرو النظام الذين لهم بريد — بلا عنوان الطلب */
  function staffAlertEmail(r, company, subject, key) {
    const ids = new Set([accountManagerId(company), ...db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((x) => x.id)].filter(Boolean));
    for (const uid of ids) {
      const u = db.get('SELECT id, name, email FROM users WHERE id = ? AND active = 1', uid);
      if (!u?.email) continue;
      app.email?.send('staff_alert', { to: u.email, name: u.name, company, vars: { subject, request_id: r.id }, dedupeKey: `staff_alert:${key}:${r.id}:${u.id}`, security: true });
    }
  }

  // ───────────────────────── نص البحث (L-55) ─────────────────────────
  function refreshSearch(requestId) {
    const r = getById(requestId);
    if (!r) return;
    const fields = parseJson(r.fields, {}) || {};
    const ent = entityOf(r);
    const docs = db.all("SELECT title, filename FROM documents WHERE company_request_id = ? AND uploaded_by_kind = 'client'", r.id);
    const delivDocs = db.all(
      "SELECT d.title, d.filename FROM company_deliverable_documents dd JOIN company_deliverables x ON x.id = dd.deliverable_id JOIN documents d ON d.id = dd.document_id WHERE x.request_id = ? AND x.status = 'released'",
      r.id,
    );
    const parts = [r.code, r.title, ent?.name, ...SEARCH_FIELDS.map((k) => fields[k]), ...docs.flatMap((d) => [d.title, d.filename]), ...delivDocs.flatMap((d) => [d.title, d.filename])];
    db.run('UPDATE company_requests SET search_norm = ? WHERE id = ?', normalizeArabic(parts.filter(Boolean).join(' ')), r.id);
  }

  // ───────────────────────── الرفع على مراحل (L-27) ─────────────────────────
  function uploadedMime(file) {
    const name = String(file?.name ?? file?.filename ?? '');
    const ext = path.extname(name).toLowerCase();
    const declared = String(file?.mime || '').split(';')[0].trim().toLowerCase();
    if (AV_EXT.test(name) || /^(?:audio|video)\//.test(declared)) return { error: COMPANY_TEXT.file_av };
    if (UPLOAD_EXT[ext]) return { mime: UPLOAD_EXT[ext] };
    if (!ext && UPLOAD_MIMES.has(declared)) return { mime: declared };
    return { error: COMPANY_TEXT.file_type };
  }
  /** المستخدم في الشركة نفسها رفع هذه الملفات ولم يستخدمها بعد ولم تنتهِ (≤ max) — داخل المعاملة */
  function takeUploads(cu, ids, { max = PER_CALL, t = nowIso() } = {}) {
    if (ids === undefined || ids === null) return [];
    if (!Array.isArray(ids)) throw badRequest('صيغة المرفقات غير صالحة');
    const list = [...new Set(ids.map((x) => Number(x)))];
    if (list.some((n) => !Number.isInteger(n) || n <= 0)) throw badRequest('صيغة المرفقات غير صالحة');
    if (list.length > max) throw badRequest(COMPANY_TEXT.per_call, { fields: { upload_ids: COMPANY_TEXT.per_call } });
    const out = [];
    for (const id of list) {
      const u = db.get('SELECT * FROM company_uploads WHERE id = ? AND company_id = ? AND company_user_id = ?', id, cu.company_id, cu.id);
      if (!u) throw new ApiError(404, COMPANY_TEXT.upload_not_found, 'not_found', { upload_id: id });
      if (u.used_at || u.expires_at <= t) throw new ApiError(409, COMPANY_TEXT.upload_unavailable, 'upload_unavailable', { upload_id: id });
      out.push(u);
    }
    return out;
  }
  function markUsed(uploads, t) {
    for (const u of uploads) {
      const res = db.run('UPDATE company_uploads SET used_at = ? WHERE id = ? AND used_at IS NULL', t, u.id);
      if (!res.changes) throw new ApiError(409, COMPANY_TEXT.upload_unavailable, 'upload_unavailable', { upload_id: u.id });
    }
  }
  function unlinkStored(storageKey) {
    if (!storageKey) return;
    const abs = path.join(config.uploadsDir, storageKey);
    if (!abs.startsWith(config.uploadsDir + path.sep)) return;
    try {
      fs.unlinkSync(abs);
    } catch {
      /* لا ملف */
    }
  }

  // ───────────────────────── إرسال الطلب وتحققه ─────────────────────────
  /** عنصر ذاكرة مقروء للمستخدم ومن النوع المسموح (L-51) — وإلا 400 memory_not_found */
  function requireReadableMemory(cu, id, kinds = null, field = 'memory_id') {
    const mem = readableMemorySql(cu, 'm');
    const m = db.get(`SELECT m.* FROM company_memory m WHERE m.id = ? AND m.archived_at IS NULL AND ${mem.sql}`, Number(id) || 0, ...mem.params);
    if (!m || (kinds && !kinds.includes(m.kind))) throw new ApiError(400, COMPANY_TEXT.memory_not_found, 'memory_not_found', { fields: { [field]: COMPANY_TEXT.memory_not_found } });
    return m;
  }
  function validWatchers(companyId, ids, exceptId) {
    if (ids === undefined || ids === null) return [];
    if (!Array.isArray(ids)) throw badRequest('قائمة المتابعين غير صالحة');
    const list = [...new Set(ids.map(Number))].filter((n) => n !== exceptId);
    if (list.length > REQUEST_LIMITS.watchers_max) throw badRequest('الحد 10 متابعين.', { fields: { watcher_ids: 'الحد 10 متابعين.' } });
    for (const id of list) {
      if (!Number.isInteger(id) || !db.get('SELECT 1 FROM company_users WHERE id = ? AND company_id = ? AND active = 1 AND invite_pending = 0', id, companyId)) {
        throw badRequest('اختاروا المتابعين من زملائكم في القائمة.', { fields: { watcher_ids: 'اختاروا المتابعين من زملائكم في القائمة.' } });
      }
    }
    return list;
  }
  function cleanLine(s, max) {
    return String(s ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  const svc = {
    COMPANY_TEXT,
    stageOf,
    promiseOf,
    staffSla,
    refreshSearch,
    whenText,

    // ===================== الرفع (POST /api/company/uploads) =====================
    /** حارس الطلب قبل قراءة الجسم: ≤ 4 أجسام رفع في الوقت نفسه (429 busy)؛ يعيد دالة الإفراج */
    acquireUploadSlot() {
      if (uploadsInFlight >= UPLOADS_IN_FLIGHT) throw new ApiError(429, COMPANY_TEXT.busy, 'busy');
      uploadsInFlight += 1;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          uploadsInFlight -= 1;
        }
      };
    },
    uploadsInFlight: () => uploadsInFlight,

    /** ملف واحد ← documents.save فورًا + صف company_uploads مربوط بمن رفعه 24 ساعة */
    stageUpload(cu, company, body = {}) {
      const file = body.file && typeof body.file === 'object' ? body.file : null;
      if (!file || typeof file.data_base64 !== 'string' || !file.data_base64) throw badRequest(COMPANY_TEXT.file_empty, { fields: { file: COMPANY_TEXT.file_empty } });
      const m = uploadedMime(file);
      if (m.error) throw badRequest(m.error, { fields: { file: m.error } });
      const b64 = file.data_base64.startsWith('data:') && file.data_base64.includes(',') ? file.data_base64.split(',')[1] : file.data_base64;
      const approx = Math.floor((b64.length * 3) / 4);
      const maxMb = Number(config.maxUploadMb) || 8;
      if (approx > maxMb * 1024 * 1024 + 4) throw new ApiError(413, `الملف أكبر من ${maxMb} ميجابايت.`, 'file_too_large');
      const t = nowIso();
      const recent = Number(db.value('SELECT COUNT(*) FROM company_uploads WHERE company_user_id = ? AND created_at >= ?', cu.id, since(3600000)));
      if (recent >= UPLOADS_PER_HOUR) throw new ApiError(429, COMPANY_TEXT.uploads_rate, 'rate_limited');
      const perDay = Math.max(1, Number(app.settings.get('b2b_files_per_day')) || 200);
      const today = Number(db.value('SELECT COUNT(*) FROM company_uploads WHERE company_id = ? AND created_at >= ?', company.id, since(86400000)));
      if (today >= perDay) throw new ApiError(429, COMPANY_TEXT.files_per_day, 'rate_limited');
      const storageMb = Math.max(1, Number(app.settings.get('b2b_storage_mb')) || 2048);
      const used = Number(db.value('SELECT COALESCE(SUM(size), 0) FROM documents WHERE company_id = ?', company.id));
      if (used + approx > storageMb * 1024 * 1024) throw new ApiError(409, COMPANY_TEXT.storage_full, 'storage_full');
      const name = cleanLine(file.name ?? file.filename, 150) || 'ملف';
      let storageKey = null;
      try {
        return db.tx(() => {
          const docId = app.documents.save(
            { filename: name, mime: m.mime, data_base64: b64 },
            { client_id: company.client_id, company_id: company.id, company_user_id: cu.id, title: cleanLine(body.title || name, 200) },
            { kind: 'client' },
          );
          const d = db.get('SELECT * FROM documents WHERE id = ?', docId);
          storageKey = d.storage_key;
          const expires = new Date(Date.parse(t) + UPLOAD_TTL_MS).toISOString();
          const id = db.insert('company_uploads', { company_id: company.id, company_user_id: cu.id, document_id: docId, created_at: t, expires_at: expires });
          return { upload_id: id, filename: d.filename, size: d.size, mime: d.mime, expires_at: expires };
        });
      } catch (e) {
        // ملف كُتب لمعاملة تراجعت يُحذف من القرص (L-27)
        if (storageKey) unlinkStored(storageKey);
        throw e;
      }
    },

    /** حذف الملفات المرحلية المنتهية غير المستخدمة وملفاتها (b2b.cleanup) */
    purgeExpiredUploads() {
      const t = nowIso();
      const rows = db.all(
        `SELECT u.id, u.document_id, d.storage_key FROM company_uploads u JOIN documents d ON d.id = u.document_id
         WHERE u.used_at IS NULL AND u.expires_at <= ? AND d.company_request_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM company_message_documents md WHERE md.document_id = d.id)
           AND NOT EXISTS (SELECT 1 FROM company_memory_documents mm WHERE mm.document_id = d.id)`,
        t,
      );
      let n = 0;
      for (const r of rows) {
        db.tx(() => {
          db.run('DELETE FROM company_uploads WHERE id = ?', r.id);
          db.run('DELETE FROM documents WHERE id = ?', r.document_id);
        });
        unlinkStored(r.storage_key);
        n += 1;
      }
      return n;
    },

    // ===================== إرسال طلب (POST /api/company/requests) =====================
    create(cu, company, body = {}, ctx = null) {
      const t = nowIso();
      // client_ref قبل أي ربط للمستندات (إعادة الإرسال الآمنة)
      let clientRef = null;
      if (body.client_ref !== undefined && body.client_ref !== null && body.client_ref !== '') {
        clientRef = String(body.client_ref);
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(clientRef)) throw badRequest('مرجع الإرسال غير صالح');
        const prev = db.get('SELECT * FROM company_requests WHERE submitted_by = ? AND client_ref = ?', cu.id, clientRef);
        if (prev) {
          if (ctx) ctx.status = 200;
          return { ...companyView(cu, company, prev), replay: true };
        }
      }
      const recent = Number(db.value('SELECT COUNT(*) FROM company_requests WHERE submitted_by = ? AND created_at >= ?', cu.id, since(3600000)));
      if (recent >= SUBMITS_PER_HOUR) throw new ApiError(429, COMPANY_TEXT.submit_rate, 'rate_limited');
      const errors = {};
      const type = REQUEST_TYPE_KEYS.includes(body.type) ? body.type : null;
      if (!type) throw badRequest(COMPANY_TEXT.fields, { fields: { type: 'اختاروا نوع الطلب.' } });
      const spec = typeByKey(type);
      const today = cairoToday(now());
      const fv = validateFields(type, body.fields, { today });
      Object.assign(errors, Object.fromEntries(Object.entries(fv.errors).map(([k, val]) => [`fields.${k}`, val])));
      // الإشارات إلى الذاكرة داخل الشركة ومقروءة للمستخدم (L-51)
      for (const f of TYPE_FIELDS[type] || []) {
        if (f.kind === 'memory_ref' && fv.values[f.key] !== undefined) requireReadableMemory(cu, fv.values[f.key], f.memory_kinds || null, `fields.${f.key}`);
      }
      const description = typeof body.description === 'string' ? body.description.replace(/\r\n/g, '\n').trim() : '';
      if (description.length < REQUEST_LIMITS.description_min) errors.description = 'اكتبوا وصفًا من 10 أحرف على الأقل.';
      else if (description.length > REQUEST_LIMITS.description_max) errors.description = 'النص أطول من المسموح.';
      let title = cleanLine(body.title, REQUEST_LIMITS.title_max + 1);
      if (!title) title = renderTitle(type, fv.values) || spec.company_label;
      if (title.length > REQUEST_LIMITS.title_max) errors.title = 'النص أطول من المسموح.';
      const priority = ['normal', 'high', 'urgent'].includes(body.priority) ? body.priority : body.priority ? null : 'normal';
      if (!priority) errors.priority = 'اختاروا من القائمة.';
      const urgentReason = cleanLine(body.urgent_reason, 301);
      if (priority === 'urgent' && !urgentReason) errors.urgent_reason = 'اكتبوا سبب الاستعجال.';
      if (urgentReason.length > 300) errors.urgent_reason = 'النص أطول من المسموح.';
      let neededBy = null;
      if (body.needed_by) {
        const s = String(body.needed_by).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) errors.needed_by = 'اكتبوا تاريخًا صحيحًا.';
        else if (s < today) errors.needed_by = 'اختاروا تاريخًا من اليوم أو بعده.';
        else neededBy = s;
      }
      const ents = companies().entities(company.id);
      let entityId = null;
      if (body.entity_id !== undefined && body.entity_id !== null && body.entity_id !== '') {
        const e = ents.find((x) => x.id === Number(body.entity_id));
        if (!e) errors.entity_id = 'اختاروا كيانًا من القائمة.';
        else entityId = e.id;
      } else if (ents.length > 1) errors.entity_id = 'اختاروا الكيان المعني.';
      else entityId = ents[0]?.id ?? null;
      const settings = companies().settingsOf(company);
      const visibility = body.visibility === 'private' || body.visibility === 'company' ? body.visibility : spec.default_visibility === 'private' ? 'private' : settings.default_visibility || 'company';
      if (Object.keys(errors).length) throw badRequest(COMPANY_TEXT.fields, { fields: errors });
      const watchers = validWatchers(company.id, body.watcher_ids, cu.id);
      const uploads = takeUploads(cu, body.upload_ids, { t });
      if (spec.requires_document && !uploads.length) throw badRequest(COMPANY_TEXT.fields, { fields: { upload_ids: `أرفقوا ${spec.document_label || 'المستند'}.` } });

      // الحد العاجل في الدورة (L-53)
      const quota = app.companyBilling.quota(company);
      let storedPriority = priority;
      let notice = null;
      if (priority === 'urgent' && quota && quota.urgent_included !== null && quota.urgent_used >= quota.urgent_included) {
        storedPriority = 'high';
        notice = 'urgent_allowance';
      }
      const terms = termsOf(company.id);
      const sla = slaFor(terms, storedPriority);
      const frDue = dueAt(t, sla.first_response_hours, sla.clock, cals());
      const id = db.tx(() => {
        const n = db.nextCounter(`company_request:${company.id}`, 1);
        const code = `${company.prefix}-${String(n).padStart(4, '0')}`;
        const rid = db.insert('company_requests', {
          company_id: company.id,
          number: n,
          code,
          type,
          title,
          description,
          fields: JSON.stringify(fv.values),
          entity_id: entityId,
          submitted_by: cu.id,
          visibility,
          requested_priority: priority,
          urgent_reason: priority === 'urgent' ? urgentReason : null,
          needed_by: neededBy,
          priority: storedPriority,
          priority_changed_reason: notice,
          status: 'submitted',
          flags: '[]',
          practice_area: spec.default_area,
          skills: JSON.stringify(spec.default_skills || []),
          size: spec.default_size,
          sla_clock: sla.clock,
          first_response_due_at: frDue,
          client_ref: clientRef,
          last_company_activity_at: t,
          created_at: t,
          updated_at: t,
        });
        markUsed(uploads, t);
        for (const u of uploads) db.run('UPDATE documents SET company_request_id = ? WHERE id = ? AND company_id = ?', rid, u.document_id, company.id);
        for (const w of watchers) db.run('INSERT OR IGNORE INTO company_request_watchers (request_id, company_user_id, added_by, created_at) VALUES (?, ?, ?, ?)', rid, w, cu.id, t);
        // أطراف ضمنية من حقول الطلب (B10-40)
        for (const [k, kind] of Object.entries(COUNTERPARTY_FIELDS)) {
          if (fv.values[k]) app.companyMemory?.upsertCounterparty(company.id, fv.values[k], { kind, privateOrigin: visibility === 'private' });
        }
        for (const f of TYPE_FIELDS[type] || []) {
          if (f.kind === 'memory_ref' && fv.values[f.key]) db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, created_at) VALUES (?, ?, 'company', ?)", rid, fv.values[f.key], t);
        }
        return rid;
      });
      refreshSearch(id);
      const r = getById(id);
      companyActivity(r, cu, company, { type: 'company_request.submitted', summary: `أرسلت ${company.name} الطلب ${r.code} (${spec.label})`, data: { priority: storedPriority, requested_priority: priority, files: uploads.length } });
      notifyStaff(r, company, { type: 'company_request.new', title: `طلب شركة جديد: ${company.name} — ${r.code}`, toHandler: false });
      if (storedPriority === 'urgent') staffAlertEmail(r, company, `طلب عاجل من ${company.name} — ${r.code}`, 'urgent');
      app.ai?.scheduleCompanyTriage?.(r.id);
      if (ctx) ctx.status = 201;
      const out = companyView(cu, company, r);
      if (notice) {
        out.notice = notice;
        out.notice_text = COMPANY_TEXT.urgent_allowance(quota.urgent_included);
      }
      return out;
    },

    // ===================== القوائم والبحث والمتابعة =====================
    list(cu, company, q = {}) {
      const vis = visibleRequestSql(cu, 'r');
      const where = [vis.sql];
      const params = [...vis.params];
      if (q.scope === 'mine') {
        where.push('r.submitted_by = ?');
        params.push(cu.id);
      }
      const query = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
      if (query) {
        where.push('r.search_norm LIKE ?');
        params.push(`%${normalizeArabic(query).replace(/[%_]/g, ' ')}%`);
      } else if (q.state === 'closed') where.push("r.status IN ('closed','declined','cancelled')");
      else if (q.state !== 'all') where.push("r.status IN ('submitted','awaiting_company','in_progress','delivered')");
      if (q.type && REQUEST_TYPE_KEYS.includes(q.type)) {
        where.push('r.type = ?');
        params.push(q.type);
      }
      if (q.before) {
        const b = String(q.before).toUpperCase();
        const ref = REQUEST_CODE_RE.test(b) ? db.get('SELECT id FROM company_requests WHERE code = ? AND company_id = ?', b, cu.company_id) : null;
        if (ref) {
          where.push('r.id < ?');
          params.push(ref.id);
        }
      }
      const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 50);
      const rows = db.all(`SELECT r.* FROM company_requests r WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ?`, ...params, limit + 1);
      const more = rows.length > limit;
      const items = rows.slice(0, limit).map(rowView);
      return { items, next_before: more ? items[items.length - 1].code : null, searched: !!query };
    },

    /** بحث واحد في الطلبات والذاكرة والمستندات (L-55) */
    search(cu, company, rawQ) {
      const q = typeof rawQ === 'string' ? rawQ.trim() : '';
      if (q.length < 2 || q.length > 100) throw badRequest('اكتبوا من حرفين إلى 100 حرف للبحث.');
      const nq = normalizeArabic(q).replace(/\s+/g, ' ').trim();
      const like = `%${nq.replace(/[%_]/g, ' ')}%`;
      const vis = visibleRequestSql(cu, 'r');
      const requests = db.all(`SELECT r.* FROM company_requests r WHERE ${vis.sql} AND r.search_norm LIKE ? ORDER BY r.id DESC LIMIT 5`, ...vis.params, like).map(rowView);
      const mem = readableMemorySql(cu, 'm');
      const memory = db
        .all(
          `SELECT m.*, cp.name AS cp_name FROM company_memory m LEFT JOIN company_counterparties cp ON cp.id = m.counterparty_id
           WHERE ${mem.sql} AND m.archived_at IS NULL ORDER BY COALESCE(m.next_date, '9999') , m.id DESC LIMIT 1000`,
          ...mem.params,
        )
        .filter((m) => (m.search_norm || app.companyMemory?.memorySearchText(m, m.cp_name) || normalizeArabic(m.title)).includes(nq))
        .slice(0, 5)
        .map((m) => ({ id: m.id, kind: m.kind, kind_label: label('company_memory_kind', m.kind), title: m.title, next_date: m.next_date || null }));
      const documents = svc.searchDocuments(cu, nq, 5);
      return { q, requests, memory, documents };
    },

    /** المستندات التي يحق للمستخدم تنزيلها (L-52) ويطابق عنوانها أو اسم ملفها */
    searchDocuments(cu, nq, limit = 5) {
      const vis = visibleRequestSql(cu, 'r');
      const mem = readableMemorySql(cu, 'm');
      const rows = db.all(
        `SELECT d.id, d.title, d.filename, r.code AS request_code, NULL AS memory_id, d.id AS sort_id FROM documents d JOIN company_requests r ON r.id = d.company_request_id
           WHERE d.uploaded_by_kind = 'client' AND d.company_user_id IS NOT NULL AND ${vis.sql}
         UNION SELECT d.id, d.title, d.filename, r.code, NULL, d.id FROM company_message_documents md JOIN company_messages cm ON cm.id = md.message_id
           JOIN company_requests r ON r.id = cm.request_id JOIN documents d ON d.id = md.document_id WHERE ${vis.sql}
         UNION SELECT d.id, d.title, d.filename, r.code, NULL, d.id FROM company_deliverable_documents dd JOIN company_deliverables x ON x.id = dd.deliverable_id
           JOIN company_requests r ON r.id = x.request_id JOIN documents d ON d.id = dd.document_id WHERE x.status = 'released' AND ${vis.sql}
         UNION SELECT d.id, d.title, d.filename, NULL, m.id, d.id FROM company_memory_documents mmd JOIN company_memory m ON m.id = mmd.memory_id
           JOIN documents d ON d.id = mmd.document_id WHERE m.archived_at IS NULL AND ${mem.sql}
         ORDER BY 6 DESC LIMIT 2000`,
        ...vis.params,
        ...vis.params,
        ...vis.params,
        ...mem.params,
      );
      const seen = new Set();
      const out = [];
      for (const d of rows) {
        if (seen.has(d.id)) continue;
        if (!normalizeArabic(`${d.title || ''} ${d.filename || ''}`).includes(nq)) continue;
        seen.add(d.id);
        out.push({ id: d.id, title: d.title, filename: d.filename, request_code: d.request_code || null, memory_id: d.memory_id || null, url: `/api/company/documents/${d.id}/download` });
        if (out.length >= limit) break;
      }
      return out;
    },

    /** «المتابعة» (B10 §7.3 بلا الفواتير؛ كل القوائم عبر L-51) */
    home(cu, company) {
      const vis = visibleRequestSql(cu, 'r');
      const ro = companies().isReadOnly(company);
      const writer = !ro && WRITERS.includes(cu.role);
      const admin = cu.role === 'company_admin';
      const settings = companies().settingsOf(company);
      const attention = [];
      for (const m of db.all(
        `SELECT cm.id, cm.created_at, r.code, r.title FROM company_messages cm JOIN company_requests r ON r.id = cm.request_id
         WHERE cm.kind = 'clarification' AND cm.answered_at IS NULL AND r.status IN ('awaiting_company','in_progress') AND ${vis.sql} ORDER BY cm.id`,
        ...vis.params,
      )) {
        attention.push({ kind: 'clarification', request_code: m.code, title: m.title, since: m.created_at, message_id: m.id, can_answer: writer });
      }
      for (const qrow of db.all(
        `SELECT q.*, r.code, r.title, r.submitted_by FROM company_quotes q JOIN company_requests r ON r.id = q.request_id WHERE q.status = 'sent' AND ${vis.sql} ORDER BY q.id`,
        ...vis.params,
      )) {
        const canApprove = writer && (admin || (qrow.submitted_by === cu.id && settings.quote_approvers === 'admins_or_submitter'));
        attention.push({
          kind: qrow.kind === 'overage' ? 'overage' : 'quote',
          request_code: qrow.code,
          title: qrow.title,
          quote_number: qrow.number,
          amount: major(qrow.basis === 'capped' ? qrow.cap_minor : qrow.amount_minor),
          basis: qrow.basis,
          currency: qrow.currency || 'EGP',
          valid_until: qrow.valid_until,
          since: qrow.sent_at,
          can_approve: canApprove,
        });
      }
      for (const d of db.all(
        `SELECT x.id, x.title, x.released_at, r.code, r.title AS request_title, r.submitted_by, r.id AS rid FROM company_deliverables x JOIN company_requests r ON r.id = x.request_id
         WHERE x.status = 'released' AND x.final = 1 AND x.decision IS NULL AND r.status = 'delivered' AND ${vis.sql} ORDER BY x.released_at`,
        ...vis.params,
      )) {
        const watcher = !!db.get('SELECT 1 FROM company_request_watchers WHERE request_id = ? AND company_user_id = ?', d.rid, cu.id);
        attention.push({ kind: 'deliverable', request_code: d.code, title: d.request_title, deliverable_id: d.id, deliverable_title: d.title, released_at: d.released_at, since: d.released_at, can_decide: writer && (admin || d.submitted_by === cu.id || watcher) });
      }
      const today = cairoDayKey(now());
      const in30 = cairoDayKey(new Date(now().getTime() + 30 * 86400000));
      const in60 = cairoDayKey(new Date(now().getTime() + 60 * 86400000));
      const mem = readableMemorySql(cu, 'm');
      const memRows = db.all(
        `SELECT m.id, m.kind, m.title, m.next_date, m.notice_deadline, m.end_date FROM company_memory m WHERE ${mem.sql} AND m.archived_at IS NULL AND m.next_date >= ? AND m.next_date <= ? ORDER BY m.next_date LIMIT 20`,
        ...mem.params,
        today,
        in60,
      );
      const daysLeft = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
      const dateKind = (m) => (m.next_date === m.notice_deadline ? 'notice' : m.next_date === m.end_date ? 'end' : 'next');
      for (const m of memRows.filter((x) => x.next_date <= in30)) {
        attention.push({ kind: 'renewal', memory_id: m.id, memory_kind: m.kind, kind_label: label('company_memory_kind', m.kind), title: m.title, date: m.next_date, date_kind: dateKind(m), days_left: daysLeft(m.next_date) });
      }
      if (admin || cu.billing_contact) {
        for (const ch of db.all(
          `SELECT ch.*, r.code, r.id AS rid FROM company_charges ch LEFT JOIN company_requests r ON r.id = ch.request_id
           WHERE ch.company_id = ? AND ch.voided_at IS NULL AND ch.created_at >= ? ORDER BY ch.id DESC LIMIT 5`,
          company.id,
          since(7 * 86400000),
        )) {
          attention.push({ kind: 'charge', charge_id: ch.id, request_code: ch.rid && isVisible(cu, ch.rid) ? ch.code : null, amount: major(ch.amount_minor), amount_text: formatEgp(ch.amount_minor), description: ch.description, since: ch.created_at });
        }
      }
      const open = db
        .all(`SELECT r.* FROM company_requests r WHERE ${vis.sql} AND r.status IN ('submitted','awaiting_company','in_progress','delivered') ORDER BY r.updated_at DESC LIMIT 20`, ...vis.params)
        .map(rowView);
      const quota = app.companyBilling.quota(company, { prices: admin || !!cu.billing_contact });
      const sub = app.companyBilling.activeSubscription(company.id);
      const out = {
        company: { ...companies().publicCompany(company), plan: sub ? { name: companies().planLabel(sub), period: sub.terms?.billing_period || 'monthly', period_label: label('company_plan_period', sub.terms?.billing_period || 'monthly') } : null },
        account_manager: companies().visibleAccountManager(company),
        attention,
        open_requests: open,
        counts: {
          open: Number(db.value(`SELECT COUNT(*) FROM company_requests r WHERE ${vis.sql} AND r.status IN ('submitted','awaiting_company','in_progress','delivered')`, ...vis.params)),
          needs_you: open.filter((x) => x.needs_you).length,
        },
        usage: quota
          ? { cycle_start: quota.cycle_start, cycle_end: quota.cycle_end, included: quota.included, used: quota.used, pending: quota.pending, remaining: quota.included === null ? null : Math.max(0, quota.included - quota.used), unlimited: quota.unlimited, overage_policy: quota.policy, urgent_used: quota.urgent_used, urgent_included: quota.urgent_included }
          : null,
        upcoming: memRows.slice(0, 5).map((m) => ({ memory_id: m.id, kind: m.kind, kind_label: label('company_memory_kind', m.kind), title: m.title, date: m.next_date, date_kind: dateKind(m), days_left: daysLeft(m.next_date) })),
        email_enabled: !!app.email?.enabled?.(),
      };
      if (admin) {
        const maxEnt = companies().maxEntitiesOf(company.id);
        out.setup = {
          profile_complete: !!(company.legal_name && company.commercial_registry),
          entities: companies().entities(company.id).length,
          max_entities: maxEnt,
          users_active: Number(db.value('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1 AND invite_pending = 0', company.id)),
          invites_pending: Number(db.value('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1 AND invite_pending = 1', company.id)),
          memory_items: Number(db.value('SELECT COUNT(*) FROM company_memory WHERE company_id = ? AND archived_at IS NULL', company.id)),
          two_factor_self: !!app.companyAuth?.twoFactorEnabled?.(cu.id),
        };
      }
      out.first_login = Number(db.value('SELECT COUNT(*) FROM company_sessions WHERE company_user_id = ?', cu.id)) <= 1 && !db.get('SELECT 1 FROM company_requests WHERE submitted_by = ?', cu.id);
      return out;
    },

    // ===================== صفحة الطلب وإجراءات الشركة =====================
    view(cu, company, code) {
      return companyView(cu, company, visibleByCode(cu, code));
    },

    /** رسالة من الشركة للفريق (120 في الساعة لكل مستخدم) */
    addMessage(cu, company, code, body = {}) {
      const r = visibleByCode(cu, code);
      if (['cancelled', 'declined'].includes(r.status)) throw conflict(COMPANY_TEXT.closed_state);
      const recent = Number(db.value("SELECT COUNT(*) FROM company_messages WHERE author_company_user_id = ? AND direction = 'in' AND created_at >= ?", cu.id, since(3600000)));
      if (recent >= MESSAGES_PER_HOUR) throw new ApiError(429, COMPANY_TEXT.message_rate, 'rate_limited');
      const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : '';
      if (text.length > 5000) throw badRequest('النص أطول من المسموح.', { fields: { body: 'النص أطول من المسموح.' } });
      const t = nowIso();
      const uploads = takeUploads(cu, body.upload_ids, { t });
      if (!text && !uploads.length) throw badRequest('اكتبوا رسالتكم أو أرفقوا ملفًا.', { fields: { body: 'اكتبوا رسالتكم أو أرفقوا ملفًا.' } });
      const docsNow = Number(db.value('SELECT COUNT(*) FROM documents WHERE company_request_id = ?', r.id));
      if (docsNow + uploads.length > PER_REQUEST) throw new ApiError(409, COMPANY_TEXT.per_request, 'request_documents_limit');
      const mid = db.tx(() => {
        markUsed(uploads, t);
        const id = db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'message', body: text || '[مرفقات]', author_company_user_id: cu.id, created_at: t });
        for (const u of uploads) {
          db.run('UPDATE documents SET company_request_id = ?, case_id = COALESCE(case_id, ?) WHERE id = ?', r.id, r.case_id ?? null, u.document_id);
          db.run('INSERT OR IGNORE INTO company_message_documents (message_id, document_id) VALUES (?, ?)', id, u.document_id);
        }
        db.run('UPDATE company_requests SET staff_unread = staff_unread + 1, last_company_activity_at = ?, rev = rev + 1, updated_at = ? WHERE id = ?', t, t, r.id);
        return id;
      });
      if (uploads.length) refreshSearch(r.id);
      companyActivity(r, cu, company, { type: 'company_request.message', summary: `رسالة من ${company.name} على ${r.code}${uploads.length ? ` مع ${uploads.length} مرفقات` : ''}` });
      notifyStaff(r, company, { type: 'company_request.message', title: `رسالة من ${company.name} — ${r.code}` });
      return { message: messageView(db.get('SELECT * FROM company_messages WHERE id = ?', mid)), request: rowView(getById(r.id)) };
    },

    /** مستندات إضافية للطلب (≤ 5 في المرة، ≤ 30 للطلب) */
    addDocuments(cu, company, code, body = {}) {
      const r = visibleByCode(cu, code);
      if (CLOSED_STATUSES.includes(r.status)) throw conflict(COMPANY_TEXT.closed_state);
      const t = nowIso();
      const uploads = takeUploads(cu, body.upload_ids, { t });
      if (!uploads.length) throw badRequest('اختاروا ملفًا واحدًا على الأقل.', { fields: { upload_ids: 'اختاروا ملفًا واحدًا على الأقل.' } });
      const docsNow = Number(db.value('SELECT COUNT(*) FROM documents WHERE company_request_id = ?', r.id));
      if (docsNow + uploads.length > PER_REQUEST) throw new ApiError(409, COMPANY_TEXT.per_request, 'request_documents_limit');
      const title = cleanLine(body.title, 200) || null;
      db.tx(() => {
        markUsed(uploads, t);
        for (const u of uploads) {
          db.run('UPDATE documents SET company_request_id = ?, case_id = COALESCE(case_id, ?), title = COALESCE(?, title) WHERE id = ?', r.id, r.case_id ?? null, title, u.document_id);
        }
        db.run('UPDATE company_requests SET staff_unread = staff_unread + 1, last_company_activity_at = ?, rev = rev + 1, updated_at = ? WHERE id = ?', t, t, r.id);
      });
      refreshSearch(r.id);
      companyActivity(r, cu, company, { type: 'company_request.documents', summary: `أضافت ${company.name} ${uploads.length} مستندات إلى ${r.code}` });
      notifyStaff(r, company, { type: 'company_request.message', title: `مستندات جديدة من ${company.name} — ${r.code}` });
      return { documents: db.all(`SELECT * FROM documents WHERE id IN (${uploads.map(() => '?').join(',')})`, ...uploads.map((u) => u.document_id)).map(companyDocView) };
    },

    /** الإلغاء: المرسل أو مدير البوابة، قبل بدء العمل فقط */
    cancel(cu, company, code, body = {}) {
      const r = visibleByCode(cu, code);
      if (cu.role !== 'company_admin' && r.submitted_by !== cu.id) throw forbidden('يلغي الطلب مرسله أو مديرو البوابة.');
      if (!['submitted', 'awaiting_company'].includes(r.status)) throw conflict(COMPANY_TEXT.cancel_state);
      const t = nowIso();
      const reason = cleanLine(body.reason, 500) || null;
      db.tx(() => {
        db.run("UPDATE company_quotes SET status = 'withdrawn', updated_at = ? WHERE request_id = ? AND status = 'sent'", t, r.id);
        db.run("UPDATE company_requests SET status = 'cancelled', resolution = 'cancelled', resolution_note = ?, waiting_on = NULL, closed_at = ?, confirm_due_at = NULL, rev = rev + 1, updated_at = ? WHERE id = ?", reason, t, t, r.id);
      });
      companyActivity(r, cu, company, { type: 'company_request.cancelled', summary: `ألغت ${company.name} الطلب ${r.code}${reason ? `: ${truncate(reason, 120)}` : ''}` });
      notifyStaff(r, company, { type: 'company_request.message', title: `ألغت ${company.name} الطلب ${r.code}` });
      return companyView(cu, company, getById(r.id));
    },

    /** التصعيد لإدارة المكتب (P0، CO-18): مرة كل 24 ساعة */
    escalate(cu, company, code, body = {}) {
      const r = visibleByCode(cu, code);
      if (cu.role !== 'company_admin' && r.submitted_by !== cu.id) throw forbidden('يصعّد الطلب مرسله أو مديرو البوابة.');
      if (!OPEN_STATUSES.includes(r.status)) throw conflict(COMPANY_TEXT.closed_state);
      if (r.last_escalated_at && now().getTime() - Date.parse(r.last_escalated_at) < ESCALATE_EVERY_MS) throw new ApiError(429, COMPANY_TEXT.escalation_throttled, 'escalation_throttled');
      const reason = cleanLine(body.reason, 501);
      if (reason.length > 500) throw badRequest('النص أطول من المسموح.', { fields: { reason: 'النص أطول من المسموح.' } });
      const t = nowIso();
      db.run('UPDATE company_requests SET escalated_at = ?, escalation_reason = ?, last_escalated_at = ?, escalation_acked_at = NULL, rev = rev + 1, updated_at = ? WHERE id = ?', t, reason || null, t, t, r.id);
      companyActivity(r, cu, company, { type: 'company_request.escalated', summary: `صعّدت ${company.name} الطلب ${r.code} لإدارة المكتب${reason ? `: ${truncate(reason, 160)}` : ''}` });
      // حرج: مدير العلاقة ومديرو النظام
      app.notifications.notifyStaff({ type: 'company_request.escalated', title: `تصعيد من ${company.name} — ${r.code}`, body: reason ? truncate(reason, 200) : null, link: `#/company-requests/${r.id}` }, { caseManagerId: accountManagerId(company) });
      return companyView(cu, company, getById(r.id));
    },

    /** متابعو الطلب من الزملاء (≤ 10؛ المرسل أو مدير البوابة) */
    setWatchers(cu, company, code, body = {}) {
      const r = visibleByCode(cu, code);
      if (cu.role !== 'company_admin' && r.submitted_by !== cu.id) throw forbidden('يعدّل المتابعين مرسل الطلب أو مديرو البوابة.');
      const ids = validWatchers(company.id, body.company_user_ids, r.submitted_by);
      const t = nowIso();
      db.tx(() => {
        db.run('DELETE FROM company_request_watchers WHERE request_id = ?', r.id);
        for (const id of ids) db.run('INSERT INTO company_request_watchers (request_id, company_user_id, added_by, created_at) VALUES (?, ?, ?, ?)', r.id, id, cu.id, t);
        db.run('UPDATE company_requests SET rev = rev + 1, updated_at = ? WHERE id = ?', t, r.id);
      });
      companyActivity(r, cu, company, { type: 'company_request.watchers', summary: `عدّلت ${company.name} متابعي ${r.code} (${ids.length})` });
      return { watchers: watchersOf(r) };
    },

    /** رد الشركة على استيضاح (SRV-9): نص و/أو ملفات و/أو بنود «غير متوفر لدينا» */
    replyClarification(cu, company, code, messageId, body = {}) {
      const r = visibleByCode(cu, code);
      const m = db.get("SELECT * FROM company_messages WHERE id = ? AND request_id = ? AND kind = 'clarification'", Number(messageId) || 0, r.id);
      if (!m) throw requestNotFound();
      if (m.answered_at) throw conflict(COMPANY_TEXT.clarification_answered);
      if (CLOSED_STATUSES.includes(r.status)) throw conflict(COMPANY_TEXT.closed_state);
      const text = typeof body.body === 'string' ? body.body.replace(/\r\n/g, '\n').trim() : '';
      if (text.length > 5000) throw badRequest('النص أطول من المسموح.', { fields: { body: 'النص أطول من المسموح.' } });
      const items = parseJson(m.items, []) || [];
      const missing = Array.isArray(body.missing_items) ? [...new Set(body.missing_items.map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < items.length) : [];
      const t = nowIso();
      const uploads = takeUploads(cu, body.upload_ids, { t });
      if (!text && !uploads.length && !missing.length) throw badRequest(COMPANY_TEXT.reply_empty, { fields: { body: COMPANY_TEXT.reply_empty } });
      const docsNow = Number(db.value('SELECT COUNT(*) FROM documents WHERE company_request_id = ?', r.id));
      if (docsNow + uploads.length > PER_REQUEST) throw new ApiError(409, COMPANY_TEXT.per_request, 'request_documents_limit');
      const missingText = missing.length ? `غير متوفر لدينا: ${missing.map((i) => items[i]?.label).filter(Boolean).join('، ')}` : '';
      let replyId;
      db.tx(() => {
        markUsed(uploads, t);
        replyId = db.insert('company_messages', {
          company_id: r.company_id,
          request_id: r.id,
          direction: 'in',
          kind: 'clarification_reply',
          body: text || missingText || '[مرفقات]',
          missing_items: missing.length ? JSON.stringify(missing) : null,
          reply_to_id: m.id,
          info_request_id: m.info_request_id || null,
          author_company_user_id: cu.id,
          created_at: t,
        });
        for (const u of uploads) {
          db.run('UPDATE documents SET company_request_id = ?, case_id = COALESCE(case_id, ?), info_request_id = COALESCE(info_request_id, ?) WHERE id = ?', r.id, r.case_id ?? null, m.info_request_id ?? null, u.document_id);
          db.run('INSERT OR IGNORE INTO company_message_documents (message_id, document_id) VALUES (?, ?)', replyId, u.document_id);
        }
        db.run('UPDATE company_messages SET answered_at = ? WHERE id = ?', t, m.id);
        // طلب معلومات من المحامي: الرد يصل للإدارة لتراجعه ثم تتيحه (لا رسالة واتساب ولا messages)
        if (m.info_request_id) {
          const ir = db.get('SELECT * FROM info_requests WHERE id = ?', m.info_request_id);
          if (ir && ['sent_to_client', 'client_replied'].includes(ir.status)) {
            const reply = [text, missingText].filter(Boolean).join('\n');
            db.update('info_requests', ir.id, {
              status: 'client_replied',
              client_reply: ir.client_reply ? `${ir.client_reply}\n---\n${reply}` : reply || null,
              items_missing: missing.length ? JSON.stringify(missing) : undefined,
              replied_at: t,
              updated_at: t,
            });
          }
        }
        const stillOpen = Number(db.value("SELECT COUNT(*) FROM company_messages WHERE request_id = ? AND kind = 'clarification' AND answered_at IS NULL", r.id));
        const cur = getById(r.id);
        const patch = { staff_unread: (Number(cur.staff_unread) || 0) + 1, last_company_activity_at: t };
        if (!stillOpen && cur.waiting_on === 'info') {
          if (cur.status === 'awaiting_company') {
            Object.assign(patch, { status: 'submitted', waiting_on: null, confirm_due_at: confirmDue(cur, t), flags: withFlags(cur, ['clarification_answered']) });
          } else if (cur.status === 'in_progress') {
            Object.assign(patch, { waiting_on: null, flags: withFlags(cur, ['clarification_answered']), ...resumePatch(cur, t) });
          }
        } else patch.flags = withFlags(cur, ['clarification_answered']);
        db.update('company_requests', r.id, { ...patch, rev: cur.rev + 1, updated_at: t });
      });
      if (uploads.length) refreshSearch(r.id);
      const after = getById(r.id);
      companyActivity(r, cu, company, { type: 'company_request.reply', summary: `ردّت ${company.name} على استيضاح في ${r.code}${missing.length ? ` (${missing.length} غير متوفر)` : ''}` });
      notifyStaff(after, company, { type: 'company_request.reply', title: `ردّت ${company.name} على سؤالكم — ${r.code}` });
      if (after.status === 'submitted' && r.status === 'awaiting_company') app.ai?.scheduleCompanyTriage?.(r.id, { reason: 'clarification_answered' });
      return { message: messageView(db.get('SELECT * FROM company_messages WHERE id = ?', replyId)), request: companyView(cu, company, after).request };
    },

    // ===================== التنزيل (L-52) =====================
    /** المستند إن حق للمستخدم تنزيله، وإلا null */
    downloadable(cu, docId) {
      const d = db.get('SELECT * FROM documents WHERE id = ?', Number(docId) || 0);
      if (!d) return null;
      const vis = visibleRequestSql(cu, 'r');
      // (أ) رفعته الشركة لطلب ظاهر
      if (d.uploaded_by_kind === 'client' && d.company_user_id && d.company_request_id) {
        if (db.get(`SELECT 1 FROM company_requests r WHERE r.id = ? AND ${vis.sql}`, d.company_request_id, ...vis.params)) return d;
      }
      // (ب) مرفق برسالة على طلب ظاهر
      if (db.get(`SELECT 1 FROM company_message_documents md JOIN company_messages m ON m.id = md.message_id JOIN company_requests r ON r.id = m.request_id WHERE md.document_id = ? AND ${vis.sql}`, d.id, ...vis.params)) return d;
      // (ج) ملف تسليم مُرسل لطلب ظاهر
      if (
        db.get(
          `SELECT 1 FROM company_deliverable_documents dd JOIN company_deliverables x ON x.id = dd.deliverable_id JOIN company_requests r ON r.id = x.request_id
           WHERE dd.document_id = ? AND x.status = 'released' AND ${vis.sql}`,
          d.id,
          ...vis.params,
        )
      ) {
        return d;
      }
      // (د) مستند عنصر ذاكرة مقروء وغير مؤرشف في الشركة نفسها
      const mem = readableMemorySql(cu, 'm');
      if (db.get(`SELECT 1 FROM company_memory_documents md JOIN company_memory m ON m.id = md.memory_id WHERE md.document_id = ? AND m.archived_at IS NULL AND ${mem.sql}`, d.id, ...mem.params)) return d;
      return null;
    },
    download(ctx, cu, company, docId) {
      const d = svc.downloadable(cu, docId);
      if (!d) throw new ApiError(404, 'المستند غير موجود.', 'not_found');
      app.activity.log({ actor: { kind: 'company' }, company_id: company.id, company_user_id: cu.id, company_request_id: d.company_request_id ?? null, type: 'company_document.downloaded', summary: `نزّلت ${company.name} مستندًا`, data: { document_id: d.id, by: companyActor(cu, company).name } });
      app.documents.send(ctx.res, d, { inline: ctx.query.inline === '1' });
      ctx.streamed = true;
    },

    // ===================== فريق المكتب: القائمة والصفحة =====================
    /** صف قائمة فريق المكتب (8.2.1 + §4.6) */
    staffRow(r, company = companyOf(r.company_id)) {
      const flags = new Set(flagsOf(r));
      if (r.escalated_at) flags.add('escalated');
      if (r.status === 'in_progress' && r.case_id && db.get("SELECT 1 FROM opinions WHERE case_id = ? AND status = 'approved' AND COALESCE(reviewed_at, updated_at) >= ?", r.case_id, cycleStartOf(r) || r.accepted_at || '')) {
        if (!db.get("SELECT 1 FROM company_deliverables WHERE request_id = ? AND status = 'released' AND final = 1 AND released_at >= ?", r.id, cycleStartOf(r) || '')) flags.add('opinion_approved_not_delivered');
      }
      if (r.needed_by && r.delivery_due_at && `${r.needed_by}T23:59:59` < cairoLocal(r.delivery_due_at)) flags.add('deadline_conflict');
      if (r.status === 'awaiting_company' && svc.notEmailed(r)) flags.add('company_not_emailed');
      const sug = r.ai_suggestion_id ? db.get('SELECT * FROM ai_suggestions WHERE id = ?', r.ai_suggestion_id) : null;
      const triage = sug ? parseJson(sug.output, null) : null;
      const handler = r.handler_id ? db.get('SELECT id, name FROM users WHERE id = ?', r.handler_id) : null;
      const lead = r.case_id ? db.get("SELECT u.name FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ? AND a.role = 'lead' AND a.status != 'withdrawn' ORDER BY a.id DESC LIMIT 1", r.case_id) : null;
      const stage = stageOf(r);
      const type = typeByKey(r.type);
      return {
        id: r.id,
        code: r.code,
        company: { id: company.id, name: company.name, prefix: company.prefix },
        type: r.type,
        type_label: type?.label || r.type,
        title: r.title,
        priority: r.priority,
        priority_label: label('priority', r.priority),
        requested_priority: r.requested_priority,
        status: r.status,
        status_label: label('company_request_status', r.status),
        stage,
        stage_label: STAFF_STAGE[stage] || stage,
        waiting_on: r.waiting_on || null,
        flags: [...flags],
        sla: staffSla(r),
        handler,
        lead_name: lead?.name || null,
        ai: triage
          ? {
              one_line: triage.one_line || null,
              type: triage.type || null,
              area: triage.practice_area || null,
              size: triage.effort?.size || null,
              scope: triage.scope_check?.in_plan === false ? 'out_of_scope' : triage.scope_check ? 'in_scope' : null,
              excluded_work: triage.excluded_work && triage.excluded_work !== 'none' ? triage.excluded_work : null,
              senior_review: triage.senior_review ?? triage.senior_review_recommended ?? null,
              confidence: triage.confidence ?? null,
              provider: sug.provider,
            }
          : null,
        escalated: !!r.escalated_at,
        staff_unread: Number(r.staff_unread) || 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    },

    /** «لم تُبلَّغ الشركة بالبريد»: البريد غير مفعّل، أو آخر تنبيه بلا بريد أو بريد تخطى أو فشل (CO-2) */
    notEmailed(r) {
      if (!app.email?.enabled?.()) return true;
      if (!r.last_notice_email_id) return true;
      const e = db.get('SELECT status FROM email_outbox WHERE id = ?', r.last_notice_email_id);
      return !e || ['skipped', 'failed'].includes(e.status);
    },

    /** قائمة طلبات الشركات لفريق المكتب (ترتيب «الطابور»: المصعّد، المتأخر، القريب، الجديد الأقدم، ثم الموعد) */
    staffList(q = {}) {
      const where = ['1=1'];
      const params = [];
      const st = q.status;
      if (st === 'open' || !st) where.push("r.status IN ('submitted','awaiting_company','in_progress','delivered')");
      else if (st === 'closed') where.push("r.status IN ('closed','declined','cancelled')");
      else if (st !== 'all') {
        where.push('r.status = ?');
        params.push(String(st));
      }
      if (q.company_id) {
        where.push('r.company_id = ?');
        params.push(Number(q.company_id) || 0);
      }
      if (q.handler_id) {
        where.push('r.handler_id = ?');
        params.push(Number(q.handler_id) || 0);
      }
      if (q.type && REQUEST_TYPE_KEYS.includes(q.type)) {
        where.push('r.type = ?');
        params.push(q.type);
      }
      const rows = db.all(`SELECT r.* FROM company_requests r WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT 500`, ...params);
      const cos = new Map();
      const co = (id) => {
        if (!cos.has(id)) cos.set(id, companyOf(id));
        return cos.get(id);
      };
      const nq = q.q ? normalizeArabic(String(q.q).trim()) : '';
      let items = rows
        .filter((r) => !nq || normalizeArabic(`${r.code} ${r.title} ${co(r.company_id)?.name || ''}`).includes(nq) || (r.search_norm || '').includes(nq))
        .map((r) => svc.staffRow(r, co(r.company_id)));
      if (q.sla === 'at_risk' || q.sla === 'late' || q.sla === 'paused') items = items.filter((x) => x.sla.state === q.sla);
      if (q.flag) items = items.filter((x) => x.flags.includes(String(q.flag)));
      const rank = (x) => {
        if (x.escalated) return 0;
        if (x.sla.state === 'late') return 1;
        if (x.flags.includes('plan_error')) return 2;
        if (x.sla.state === 'at_risk') return 3;
        if (x.status === 'submitted') return 4;
        return 5;
      };
      items.sort((a, b) => rank(a) - rank(b) || (rank(a) === 4 ? a.created_at.localeCompare(b.created_at) : (a.sla.due_at || '9999').localeCompare(b.sla.due_at || '9999')) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
      const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
      return { items: items.slice(0, limit), total: items.length };
    },

    /** صفحة طلب الشركة لفريق المكتب (8.2.2 + §4.6) */
    staffDetail(id, actor) {
      const r = requireStaffRequest(id);
      const company = companyOf(r.company_id);
      const isAdmin = actor?.role === 'admin';
      const sub = app.companyBilling.activeSubscription(company.id);
      const submitter = db.get('SELECT id, name, email, phone, job_title, role FROM company_users WHERE id = ?', r.submitted_by);
      const am = companies().accountManagerOf(company);
      const sug = r.ai_suggestion_id ? db.get('SELECT * FROM ai_suggestions WHERE id = ?', r.ai_suggestion_id) : null;
      const c = r.case_id ? db.get('SELECT * FROM cases WHERE id = ?', r.case_id) : null;
      const team = c
        ? db
            .all(
              `SELECT a.id, a.role, a.status, a.due_at, a.lawyer_id, u.name FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ? ORDER BY a.id`,
              c.id,
            )
            .map((a) => ({ assignment_id: a.id, lawyer_id: a.lawyer_id, lawyer_name: a.name, role: a.role, role_label: label('assignment_role', a.role), status: a.status, status_label: label('assignment_status', a.status), due_at: a.due_at }))
        : [];
      const quotes = db.all('SELECT * FROM company_quotes WHERE request_id = ? ORDER BY id', r.id).map((q) => quoteView(q, { staff: true, money: true }));
      const delivs = db.all('SELECT * FROM company_deliverables WHERE request_id = ? ORDER BY version', r.id).map((d) => deliverableView(d, { staff: true }));
      const memoryItem = r.memory_item_id ? db.get('SELECT id, kind, title, status, reviewed_at FROM company_memory WHERE id = ?', r.memory_item_id) : null;
      const tl = timelineOf(r);
      const terms = termsOf(company.id);
      const opinions = c
        ? db
            .all(
              `SELECT o.id, o.version, o.status, o.submitted_at, o.reviewed_at, a.role, u.name FROM opinions o JOIN assignments a ON a.id = o.assignment_id JOIN users u ON u.id = a.lawyer_id
               WHERE o.case_id = ? AND o.status IN ('submitted','approved') ORDER BY o.id`,
              c.id,
            )
            .map((o) => ({ id: o.id, version: o.version, status: o.status, role: o.role, lawyer_name: o.name, submitted_at: o.submitted_at, reviewed_at: o.reviewed_at }))
        : [];
      const workFiles = c ? db.all("SELECT * FROM documents WHERE case_id = ? AND uploaded_by_kind = 'lawyer' AND assignment_id IS NOT NULL ORDER BY id", c.id).map(staffDocView) : [];
      return {
        rev: r.rev,
        request: {
          id: r.id,
          ...companyView({ id: -1, role: 'company_admin', company_id: company.id, billing_contact: 1 }, company, r).request,
          status_label: label('company_request_status', r.status),
          practice_area: r.practice_area,
          skills: parseJson(r.skills, []) || [],
          size: r.size,
          size_label: r.size ? sizeLabel(r.size) : null,
          scope: r.scope,
          quota_kind: r.quota_kind,
          quota_period: r.quota_period,
          requires_senior_review: !!r.requires_senior_review,
          risk_level: r.risk_level || null,
          handler_id: r.handler_id || null,
          flags: svc.staffRow(r, company).flags,
          escalation: r.escalated_at ? { at: r.escalated_at, reason: r.escalation_reason || null } : null,
          staff_unread: Number(r.staff_unread) || 0,
          accept_plan: parseJson(r.accept_plan, null),
          accept_plan_error: r.accept_plan_error || null,
          first_response_kind: r.first_response_kind || null,
          delivery_window_hours: r.delivery_window_hours ?? null,
        },
        timeline: tl.timeline,
        timeline_history: tl.timeline_history,
        company: {
          id: company.id,
          name: company.name,
          prefix: company.prefix,
          status: company.status,
          status_label: label('company_status', company.status),
          read_only: companies().isReadOnly(company),
          account_manager: am ? { id: am.id, name: am.name } : null,
          email_enabled: !!app.email?.enabled?.(),
          plan: sub ? { name: companies().planLabel(sub), included_requests: terms.included_requests ?? null, overage_policy: terms.overage_policy, senior_review: terms.senior_review, scope_types: terms.scope_types, excluded_work: terms.excluded_work, revision_rounds: terms.revision_rounds } : null,
          settings: companies().settingsOf(company),
        },
        submitter: submitter ? { ...submitter, role_label: label('company_user_role', submitter.role) } : null,
        triage: sug ? { id: sug.id, provider: sug.provider, model: sug.model, created_at: sug.created_at, output: parseJson(sug.output, null) } : null,
        scope_check: svc.scopeCheck(r, company),
        case: c ? { id: c.id, code: c.code, status: c.status, status_label: label('case_status', c.status), team, opinions, work_files: workFiles } : null,
        notes: db
          .all('SELECT n.*, u.name FROM company_request_notes n JOIN users u ON u.id = n.user_id WHERE n.request_id = ? ORDER BY n.id', r.id)
          .map((n) => ({ id: n.id, body: n.body, author: n.name, created_at: n.created_at })),
        messages: db.all('SELECT * FROM company_messages WHERE request_id = ? ORDER BY id', r.id).map((m) => messageView(m, { staff: true })),
        documents: db
          .all(
            `SELECT d.* FROM documents d WHERE d.company_request_id = ? OR (? IS NOT NULL AND d.case_id = ?) ORDER BY d.id`,
            r.id,
            r.case_id ?? null,
            r.case_id ?? null,
          )
          .map(staffDocView),
        watchers: watchersOf(r),
        memory_refs: memoryRefs(r),
        memory_item: memoryItem ? { ...memoryItem, kind_label: label('company_memory_kind', memoryItem.kind), pending: !memoryItem.reviewed_at } : null,
        sla: {
          ...staffSla(r),
          clock: r.sla_clock,
          first_response_due_at: r.first_response_due_at,
          first_response_at: r.first_response_at,
          confirm_due_at: r.confirm_due_at,
          delivery_due_at: r.delivery_due_at,
          delivery_due_original_at: r.delivery_due_original_at,
          delivery_due_reason: r.delivery_due_reason,
          paused_minutes_total: Number(r.sla_paused_minutes_total) || 0,
          pauses: db.all('SELECT reason, started_at, ended_at, business_minutes FROM company_sla_pauses WHERE request_id = ? ORDER BY id', r.id),
          company_sees: promiseOf(r),
        },
        quotes,
        deliverables: delivs,
        charges: isAdmin
          ? db.all('SELECT * FROM company_charges WHERE request_id = ? ORDER BY id', r.id).map((ch) => app.companyBilling.chargeView(ch))
          : null,
        activity: db
          .all('SELECT a.*, u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.company_request_id = ? ORDER BY a.id DESC LIMIT 200', r.id)
          .map((a) => ({ id: a.id, type: a.type, summary: a.summary, actor_kind: a.actor_kind, actor_name: a.actor_name || parseJson(a.data, {})?.by || null, created_at: a.created_at })),
      };
    },

    /** فحص الباقة الحتمي (B10-24): النوع ضمن الباقة، لا عمل مستبعد، والقيمة ≤ الحد؛ مع الرصيد والسياسة */
    scopeCheck(r, company = companyOf(r.company_id), { type = r.type, excludedWork = null } = {}) {
      const sub = app.companyBilling.activeSubscription(company.id);
      const terms = sub?.terms || TERMS_DEFAULTS;
      const fields = parseJson(r.fields, {}) || {};
      const reasons = [];
      if (!(terms.scope_types || []).includes(type)) reasons.push('type_not_in_plan');
      const stage = TYPE_FIELDS[type]?.find((f) => f.key === 'stage')?.options?.find((o) => o.key === fields.stage);
      const ex = excludedWork || stage?.excluded_work || null;
      if (ex && (terms.excluded_work || []).includes(ex)) reasons.push(`excluded:${ex}`);
      const value = Number(fields.contract_value ?? fields.amount ?? fields.amount_claimed);
      if (terms.contract_value_cap_minor !== null && terms.contract_value_cap_minor !== undefined && Number.isFinite(value) && Math.round(value * 100) > terms.contract_value_cap_minor) reasons.push('value_above_cap');
      const quota = app.companyBilling.quota(company);
      return {
        in_plan: reasons.length === 0,
        reasons,
        reason_labels: reasons.map((x) => (x === 'type_not_in_plan' ? 'نوع الطلب غير مشمول في الباقة' : x === 'value_above_cap' ? 'قيمة العقد أعلى من الحد المشمول' : `عمل مستبعد: ${label('company_excluded_work', x.split(':')[1])}`)),
        quota: quota ? { used: quota.used, pending: quota.pending, included: quota.included, unlimited: quota.unlimited, policy: quota.policy, cycle_start: quota.cycle_start } : null,
        would_be: app.companyBilling.classify(company, { outOfScope: reasons.length > 0, excludeRequestId: r.id }).quota_kind,
      };
    },

    /** تعديل من فريق المكتب (8.2.9): الأولوية، المسؤول، موعد التسليم مع السبب، المخاطر، المراجعة الثانية */
    staffPatch(id, body = {}, actor) {
      const r = requireStaffRequest(id);
      checkRev(r, body);
      const company = companyOf(r.company_id);
      const patch = {};
      if (body.priority !== undefined) patch.priority = v.oneOf(body.priority, ['low', 'normal', 'high', 'urgent'], 'الأولوية', { required: true });
      if (body.handler_id !== undefined) {
        if (body.handler_id === null || body.handler_id === '') patch.handler_id = null;
        else {
          const h = db.get("SELECT id FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", Number(body.handler_id) || 0);
          if (!h) throw badRequest('المسؤول يجب أن يكون حسابًا نشطًا من فريق الإدارة');
          patch.handler_id = h.id;
        }
      }
      if (body.risk_level !== undefined) patch.risk_level = v.oneOf(body.risk_level || null, ['low', 'medium', 'high'], 'درجة المخاطر');
      if (body.requires_senior_review !== undefined) patch.requires_senior_review = v.bool(body.requires_senior_review) ? 1 : 0;
      let dueChanged = false;
      if (body.delivery_due_at !== undefined) {
        if (!r.accepted_at) throw conflict('يُحدَّد موعد التسليم عند بدء العمل');
        const due = v.iso(body.delivery_due_at, 'موعد التسليم', { required: true });
        const reason = v.str(body.due_reason, 'سبب تعديل الموعد', { required: true, max: 300 });
        if (due !== r.delivery_due_at) {
          patch.delivery_due_at = due;
          patch.delivery_due_reason = reason;
          if (r.sla_paused_at) patch.sla_remaining_minutes = pauseRemaining(r.sla_paused_at, due, r.sla_clock, cals());
          dueChanged = true;
        }
      }
      const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (r[k] ?? null));
      if (!changed.length) return svc.staffDetail(r.id, actor);
      const after = casUpdate(r, Object.fromEntries(changed.map((k) => [k, patch[k]])), { actor });
      if (after.case_id && patch.handler_id) db.run('UPDATE cases SET case_manager_id = ?, updated_at = ? WHERE id = ?', patch.handler_id, nowIso(), after.case_id);
      if (after.case_id && dueChanged) db.run('UPDATE cases SET due_at = ?, updated_at = ? WHERE id = ?', patch.delivery_due_at, nowIso(), after.case_id);
      activity(after, actor, { type: 'company_request.updated', summary: `عدّل الفريق ${r.code}: ${changed.join('، ')}`, data: { fields: changed } });
      if (dueChanged) {
        notifyCompany(after, { type: 'request.due_changed', title: `تعديل موعد التسليم — ${r.code}`, body: `الموعد الجديد: ${whenText(patch.delivery_due_at)}. ${patch.delivery_due_reason}` });
      }
      void company;
      return svc.staffDetail(r.id, actor);
    },

    /** رسالة فريق المكتب: داخلية (ملاحظة) أو للشركة (8.2.8) — الخارجية تمر بحارس الأسماء وبوابة المستندات (CS-12) */
    staffMessage(id, body = {}, actor, ctx = null) {
      const r = requireStaffRequest(id);
      const company = companyOf(r.company_id);
      const text = v.str(body.body, 'نص الرسالة', { required: true, max: 5000 });
      const t = nowIso();
      if (v.bool(body.internal)) {
        db.insert('company_request_notes', { request_id: r.id, user_id: actor.id, body: text, created_at: t });
        activity(r, actor, { type: 'company_request.note', summary: `ملاحظة داخلية على ${r.code}` });
        return svc.staffDetail(r.id, actor);
      }
      if (CLOSED_STATUSES.includes(r.status) && r.status !== 'closed') throw conflict('الطلب مغلق.');
      // المرفقات: مستندات موجودة في الطلب أو ملفه (document_ids) أو ملفات جديدة (files) — بنفس نمط مسارات الإدارة
      const docIds = v.ids(body.document_ids, 'المستندات');
      const newIds = [];
      const gateDocs = () => app.companyDocGate.companyDocGate({ requestId: r.id, texts: { body: text }, documentIds: [...docIds, ...newIds] });
      // حارس الأسماء أولًا على النص والمستندات القائمة (قبل حفظ أي ملف)
      let g = gateDocs();
      let err = app.companyDocGate.gateError(g, { docsReviewed: v.bool(body.docs_reviewed) });
      if (err && err.code !== 'office_docs_review_required') throw new ApiError(err.status, err.message, err.code, g);
      const files = Array.isArray(body.files) ? body.files : [];
      if (files.length > 5) throw badRequest('الحد 5 ملفات في المرة');
      const saved = [];
      try {
        for (const f of files) {
          const did = app.documents.save(f || {}, { client_id: company.client_id, case_id: r.case_id ?? null, company_id: company.id, title: f?.title }, actor);
          db.run('UPDATE documents SET company_request_id = ? WHERE id = ?', r.id, did);
          newIds.push(did);
          saved.push(db.value('SELECT storage_key FROM documents WHERE id = ?', did));
        }
        g = gateDocs();
        err = app.companyDocGate.gateError(g, { docsReviewed: v.bool(body.docs_reviewed) });
        if (err) throw new ApiError(err.status, err.message, err.code, g);
      } catch (e) {
        // ملفات جديدة لم تمر بالبوابة لا تبقى
        for (const did of newIds) db.run('DELETE FROM documents WHERE id = ?', did);
        for (const k of saved) unlinkStored(k);
        throw e;
      }
      const mid = db.tx(() => {
        const mId = db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'message', body: text, author_user_id: actor.id, created_at: t });
        for (const did of [...docIds, ...newIds]) db.run('INSERT OR IGNORE INTO company_message_documents (message_id, document_id) VALUES (?, ?)', mId, did);
        db.run('UPDATE company_requests SET staff_unread = 0, rev = rev + 1, updated_at = ? WHERE id = ?', t, r.id);
        return mId;
      });
      activity(r, actor, { type: 'company_request.message_sent', summary: `رسالة من الفريق للشركة على ${r.code}`, data: { message_id: mid, documents: docIds.length + newIds.length } });
      notifyCompany(getById(r.id), { type: 'request.message', title: `رسالة جديدة من فريقكم القانوني — ${r.code}`, body: truncate(text, 80) });
      void ctx;
      return svc.staffDetail(r.id, actor);
    },

    /** تمت قراءة رسائل الشركة */
    staffMarkRead(id, actor) {
      const r = requireStaffRequest(id);
      db.run('UPDATE company_requests SET staff_unread = 0 WHERE id = ?', r.id);
      return svc.staffDetail(r.id, actor);
    },

    // ===================== الفرز (SRV-7) =====================
    /** آخر فرز محفوظ للطلب (للإدارة فقط) */
    staffTriageGet(id) {
      const r = requireStaffRequest(id);
      const sug = r.ai_suggestion_id ? db.get('SELECT * FROM ai_suggestions WHERE id = ?', r.ai_suggestion_id) : null;
      return { triage: sug ? { id: sug.id, provider: sug.provider, model: sug.model, created_at: sug.created_at, output: parseJson(sug.output, null) } : null, scope_check: svc.scopeCheck(r) };
    },
    /** إعادة الفرز بطلب موظف (20 في الساعة لكل موظف) */
    /** ملخص التسليم بالذكاء الاصطناعي (P1): يتطلب رأيًا معتمدًا في ملف الطلب؛ يُسجَّل في نشاط الطلب */
    async staffAiDeliverable(id, body = {}, actor) {
      const r = requireStaffRequest(id);
      const out = await app.ai.companyAi.deliverableSummary(r.id, actor, { opinionId: body.opinion_id });
      activity(r, actor, { type: 'company_request.ai_deliverable', summary: `اقتراح ملخص تسليم بالذكاء الاصطناعي على ${r.code}`, data: { suggestion_id: out.suggestion_id } });
      return out;
    },

    async staffTriageRun(id, actor) {
      const r = requireStaffRequest(id);
      await app.ai.triageCompanyRequest(r.id, actor, { reason: 'staff' });
      activity(r, actor, { type: 'company_request.triaged', summary: `أعاد الفريق فرز ${r.code} بالذكاء الاصطناعي` });
      return svc.staffTriageGet(r.id);
    },

    // أدوات داخلية للأقسام التالية (القبول، العروض، التسليمات)
    _internal: {
      getById,
      requireStaffRequest,
      casUpdate,
      checkRev,
      companyOf,
      termsOf,
      cals,
      calOf,
      pausePatch,
      resumePatch,
      firstResponsePatch,
      confirmDue,
      notifyCompany,
      notifyStaff,
      staffAlertEmail,
      activity,
      companyActivity,
      visibleByCode,
      companyView,
      quoteView,
      deliverableView,
      withFlags,
      flagsOf,
      unlinkStored,
      requestNotFound,
      cleanLine,
      isVisible,
    },
  };

  /** وقت محلي بالقاهرة YYYY-MM-DDTHH:MM:SS لمقارنة «تحتاجونه قبل» بالموعد */
  function cairoLocal(iso) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    const g = (k) => p.find((x) => x.type === k)?.value;
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
  }

  // ═════════════════════════ SRV-8: محو هوية موظفي الشركة لما يصل للمحامي (L-57) ═════════════════════════
  /** منقٍّ لكل نص يصل لمحامٍ على ملف شركة: أسماء مستخدمي الشركة وبريدهم وهواتفهم، ورموز طلباتها */
  function lawyerRedactor(companyId) {
    const users = db.all('SELECT name, email, phone FROM company_users WHERE company_id = ?', companyId);
    const names = users.map((u) => u.name).filter(Boolean);
    const emails = users.map((u) => u.email).filter(Boolean);
    const phones = users.map((u) => u.phone).filter(Boolean);
    const prefix = db.value('SELECT prefix FROM companies WHERE id = ?', companyId);
    const codeRe = prefix ? new RegExp(`\\b${prefix}-\\d{4,6}\\b`, 'g') : null;
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text) => {
      if (text === null || text === undefined || text === '') return text;
      let s = String(text);
      for (const e of emails) s = s.replace(new RegExp(escRe(e), 'gi'), '[بريد إلكتروني]');
      for (const p of phones) for (const form of new Set([p, p.replace(/^\+20/, '0'), p.replace(/^\+/, '')])) s = s.split(form).join('[رقم هاتف]');
      s = redact(s, { names }).text;
      if (codeRe) s = s.replace(codeRe, '[رقم الطلب]');
      return s;
    };
  }

  // ═════════════════════════ SRV-8: القبول ← ملف في المحرك (B10-24) ═════════════════════════
  const PARTY_ROLES = ['opponent', 'related', 'witness'];
  function lawyerOk(lawyerId, field) {
    const l = db.get("SELECT u.id, u.name, u.active, u.invite_pending FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ? AND u.role = 'lawyer'", Number(lawyerId) || 0);
    if (!l) throw badRequest('المحامي المختار غير موجود', { fields: { [field]: 'اختر محاميًا من القائمة' } });
    if (!l.active) throw new ApiError(409, `حساب ${l.name} موقوف؛ اختر محاميًا آخر.`, 'lawyer_inactive', { fields: { [field]: 'الحساب موقوف' } });
    if (l.invite_pending) throw new ApiError(409, `لم يفعّل ${l.name} حسابه بعد؛ اختر محاميًا آخر.`, 'lawyer_inactive', { fields: { [field]: 'لم يفعّل حسابه' } });
    return l;
  }
  function excludedFor(companyId, lawyerId) {
    return !!db.get("SELECT 1 FROM company_team WHERE company_id = ? AND lawyer_id = ? AND role = 'excluded'", companyId, lawyerId);
  }
  /** تنظيف جسم القبول (يُستخدم أيضًا للتحقق من خطة البدء المحفوظة مع عرض السعر) */
  function acceptInput(r, company, body = {}, actor) {
    const type = REQUEST_TYPE_KEYS.includes(body.type) ? body.type : r.type;
    const spec = typeByKey(type);
    const fields = parseJson(r.fields, {}) || {};
    const area = v.oneOf(body.practice_area || body.legal_area || r.practice_area || spec.default_area, AREA_CODES, 'المجال القانوني', { required: true });
    const skills = Array.isArray(body.skills) ? [...new Set(body.skills)].filter((s) => B2B_SKILLS.some((x) => x.key === s)) : parseJson(r.skills, []) || [];
    const priority = v.oneOf(body.priority || r.priority, ['low', 'normal', 'high', 'urgent'], 'الأولوية', { required: true });
    const size = v.oneOf(body.size || r.size || spec.default_size, ['S', 'M', 'L', 'XL'], 'الحجم', { required: true });
    const dueOverride = body.delivery_due_at ? v.iso(body.delivery_due_at, 'موعد التسليم') : null;
    if (size === 'XL' && !dueOverride) throw badRequest('حدد موعد التسليم للطلبات الكبيرة جدًا (XL)', { fields: { delivery_due_at: 'مطلوب للحجم XL' } });
    const dueReason = dueOverride ? v.str(body.due_reason, 'سبب موعد التسليم', { required: true, max: 300 }) : null;
    const scope = v.oneOf(body.scope || null, ['in_scope', 'out_of_scope'], 'النطاق');
    const quota = v.oneOf(body.quota || null, ['included', 'overage', 'out_of_scope', 'free'], 'الاحتساب من الباقة');
    const requiresSenior = body.requires_senior_review !== undefined ? v.bool(body.requires_senior_review) : !!r.requires_senior_review;
    const risk = v.oneOf(body.risk_level || r.risk_level || null, ['low', 'medium', 'high'], 'درجة المخاطر');
    const caseTitle = v.str(body.case_title || r.title, 'عنوان الملف', { required: true, max: 200 });
    const brief = v.str(body.brief_for_lawyer, 'ملخص الطلب للمحامي', { required: true, min: 20, max: 20000 });
    const issues = (Array.isArray(body.issues) ? body.issues : [])
      .map((x) => (typeof x === 'string' ? x : x?.title))
      .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 20);
    const docIds = body.document_ids === undefined || body.document_ids === null ? null : v.ids(body.document_ids, 'المستندات');
    const cpSrc = Array.isArray(body.counterparties)
      ? body.counterparties
      : Object.keys(COUNTERPARTY_FIELDS)
          .filter((k) => fields[k])
          .map((k) => ({ name: fields[k], role: spec.party_role || 'related' }));
    const counterparties = cpSrc.map((cp) => ({
      name: v.str(cp?.name, 'اسم الطرف', { required: true, min: 2, max: 150 }),
      role: v.oneOf(cp?.role || spec.party_role || 'related', PARTY_ROLES, 'صفة الطرف', { required: true }),
    }));
    const memoryIds = v.ids(body.memory_ids, 'عناصر الذاكرة');
    let handlerId = r.handler_id || (actor && !actor.kind && ['admin', 'case_manager'].includes(actor.role) ? actor.id : null);
    if (body.handler_id) {
      const h = db.get("SELECT id FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", Number(body.handler_id) || 0);
      if (!h) throw badRequest('المسؤول يجب أن يكون حسابًا نشطًا من فريق الإدارة', { fields: { handler_id: 'اختر من القائمة' } });
      handlerId = h.id;
    }
    const assign = {};
    for (const role of ['lead', 'reviewer']) {
      const a = body.assign?.[role];
      if (!a || !a.lawyer_id) continue;
      const l = lawyerOk(a.lawyer_id, `assign.${role}.lawyer_id`);
      assign[role] = {
        lawyer_id: l.id,
        lawyer_name: l.name,
        fee_mode: a.fee_mode || undefined,
        fee_amount: a.fee_amount,
        due_at: a.due_at ? v.iso(a.due_at, 'موعد تسليم المحامي') : undefined,
        brief: a.brief ? v.str(a.brief, 'المطلوب من المحامي', { max: 5000 }) : undefined,
        force: v.bool(a.force),
      };
    }
    if (assign.lead && assign.reviewer && assign.lead.lawyer_id === assign.reviewer.lawyer_id) throw badRequest('المراجع يجب أن يكون محاميًا غير المحامي الأساسي', { fields: { 'assign.reviewer.lawyer_id': 'اختر محاميًا آخر' } });
    return {
      type,
      spec,
      area,
      skills,
      priority,
      size,
      dueOverride,
      dueReason,
      scope,
      quota,
      requiresSenior: requiresSenior || !!assign.reviewer,
      risk,
      caseTitle,
      brief,
      issues,
      docIds,
      counterparties,
      memoryIds,
      handlerId,
      assign,
      note: v.str(body.note_to_company, 'ملاحظة للشركة', { max: 1000 }),
      conflictAck: v.bool(body.conflict_ack),
      aiSuggestionId: body.ai_suggestion_id ? Number(body.ai_suggestion_id) : r.ai_suggestion_id || null,
    };
  }

  /** نص الطلب كاملًا للوقائع الداخلية في الملف (للإدارة فقط) */
  function renderedRequest(r, type) {
    const spec = typeByKey(type);
    const fields = parseJson(r.fields, {}) || {};
    const lines = [`طلب شركة ${r.code} — ${spec?.label || type}`, r.title];
    for (const f of TYPE_FIELDS[type] || []) {
      const val = fields[f.key];
      if (val === undefined || val === null || val === '') continue;
      const opt = (k) => f.options?.find((o) => o.key === k)?.label ?? k;
      lines.push(`${f.label}: ${Array.isArray(val) ? val.map(opt).join('، ') : f.options ? opt(val) : val}`);
    }
    if (r.needed_by) lines.push(`تحتاجه الشركة قبل: ${r.needed_by}`);
    lines.push('', r.description);
    return lines.join('\n');
  }

  /** إغلاق ملف المحرك من دورة الطلب بفاعل النظام؛ الملف المغلق مسبقًا يُعد نجاحًا (L-19، L-65) */
  function closeEngineCase(r, outcome, note) {
    if (!r.case_id) return;
    const c = db.get('SELECT status FROM cases WHERE id = ?', r.case_id);
    if (!c || c.status === 'closed') return;
    app.cases.close(r.case_id, { outcome, note: note || null, force: true }, SYSTEM_ACTOR, { viaCompanyRequest: true });
  }

  /**
   * القبول (8.2.4): ملف في المحرك بفريق ومستندات وأطراف وذاكرة، وتحديد الاحتساب من الباقة والمواعيد، ثم إسناد المحامي
   * الأساسي والمراجع (أخطاء الإسناد تعود في assign_errors والقبول يبقى). plan: تشغيل خطة البدء بعد الموافقة على عرض (L-61).
   */
  function acceptRequest(id, body = {}, actor, ctx = null, { plan = false } = {}) {
    const r = requireStaffRequest(id);
    const company = companyOf(r.company_id);
    if (r.case_id) throw new ApiError(409, 'بدأ العمل على هذا الطلب بالفعل.', 'already_accepted');
    if (plan ? !['submitted', 'awaiting_company'].includes(r.status) : r.status !== 'submitted') {
      throw new ApiError(409, r.status === 'awaiting_company' ? 'الطلب بانتظار الشركة؛ انتظر ردها أو اسحب العرض أولًا.' : 'لا يمكن قبول الطلب في حالته الحالية.', 'invalid_transition');
    }
    if (!plan) checkRev(r, body);
    if (body.quota === 'free' && actor?.role !== 'admin') throw forbidden('عدم احتساب الطلب من الباقة متاح لدور «إدارة النظام» فقط');
    const input = acceptInput(r, company, body, actor);
    const red = lawyerRedactor(company.id);
    const warnings = [];
    const brief = red(input.brief);
    const issues = input.issues.map(red);
    if (brief !== input.brief || issues.some((x, i) => x !== input.issues[i])) warnings.push('حُذفت من ملخص المحامي أو مسائله بيانات تخص موظفي الشركة (أسماء أو بريد أو هاتف). راجع النص قبل الإسناد.');
    // الاحتساب من الباقة (حتمي؛ L-28)
    const terms = termsOf(company.id);
    const sc = svc.scopeCheck(r, company, { type: input.type });
    const scope = input.scope || (sc.in_plan ? 'in_scope' : 'out_of_scope');
    let quotaKind;
    let quotaPeriod;
    let billOverage = false;
    if (plan && r.quota_kind) {
      quotaKind = r.quota_kind;
      quotaPeriod = r.quota_period;
    } else if (input.quota === 'free') {
      const cls = app.companyBilling.classify(company, { free: true });
      quotaKind = 'free';
      quotaPeriod = cls.quota_period;
    } else if (scope === 'out_of_scope' || input.quota === 'out_of_scope') {
      throw new ApiError(409, 'الطلب خارج نطاق الباقة؛ أرسل للشركة عرض سعر أولًا.', 'out_of_scope_requires_quote', { scope_check: sc });
    } else {
      const cls = app.companyBilling.classify(company, { excludeRequestId: r.id });
      if (cls.quota_kind === 'overage') {
        const policy = terms.overage_policy || 'approve';
        if (policy === 'block') throw new ApiError(409, 'استنفدت الشركة الطلبات المشمولة في دورتها والباقة لا تسمح بطلبات إضافية حتى الدورة التالية.', 'quota_blocked', { scope_check: sc });
        if (policy === 'approve') throw new ApiError(409, 'استنفدت الشركة الطلبات المشمولة؛ أرسل لها طلب موافقة على تكلفة إضافية (عرض «طلب إضافي فوق الباقة»).', 'overage_approval_required', { scope_check: sc, overage_price: major(terms.overage_price_minor) });
        billOverage = true;
      }
      quotaKind = cls.quota_kind;
      quotaPeriod = cls.quota_period;
    }
    // الإسناد: استبعاد المحامي لهذه الشركة يُرفض قبل أي تغيير ما لم يُطلب صراحة
    for (const role of ['lead', 'reviewer']) {
      const a = input.assign[role];
      if (a && excludedFor(company.id, a.lawyer_id) && !a.force) {
        throw new ApiError(409, `${a.lawyer_name} مستبعد من العمل لهذه الشركة (الفريق المفضل).`, 'lawyer_excluded_for_company', { fields: { [`assign.${role}.lawyer_id`]: 'مستبعد لهذه الشركة' } });
      }
    }
    // تعارض المصالح على الأطراف (B10-25)
    const conflicts = [];
    for (const cp of input.counterparties) {
      try {
        for (const m of app.practice.conflicts.check({ name: cp.name }, { subjectRole: cp.role, family: { caseIds: [], matterIds: [], clientId: company.client_id } })) conflicts.push({ subject: cp.name, ...m });
      } catch (e) {
        app.log('company accept conflicts', e);
      }
    }
    const high = conflicts.filter((m) => m.level === 'high');
    if (high.length && !input.conflictAck) throw new ApiError(409, 'وُجد تعارض مصالح محتمل مع أحد الأطراف؛ راجعه ثم أكد المتابعة.', 'conflict_review_required', { matches: high });
    // المواعيد
    const t = nowIso();
    const sla = slaFor(terms, input.priority);
    const factor = Number(terms.size_factor?.[input.size] ?? 1) || 1;
    const windowH = input.size === 'XL' ? null : Math.round(sla.delivery_hours * factor * 100) / 100;
    const deliveryDue = input.dueOverride || dueAt(t, windowH, sla.clock, cals());
    const requestDocIds = db.all('SELECT id FROM documents WHERE company_request_id = ?', r.id).map((d) => d.id);
    const docIds = input.docIds === null ? requestDocIds : input.docIds;
    for (const d of docIds) if (!requestDocIds.includes(d)) throw badRequest('بعض المستندات المختارة لا تخص هذا الطلب', { fields: { document_ids: 'اختر من مستندات الطلب' } });
    const memIds = input.memoryIds.filter((mid) => db.get('SELECT 1 FROM company_memory WHERE id = ? AND company_id = ? AND archived_at IS NULL', mid, company.id));
    const deadlineConflict = r.needed_by && deliveryDue && cairoDayKey(deliveryDue) > r.needed_by;
    let caseRow;
    const chargeIds = [];
    db.tx(() => {
      const caseId = db.insert('cases', {
        code: app.cases.nextCaseCode(input.area, t),
        client_id: company.client_id,
        intake_id: null,
        legal_area: input.area,
        title: input.caseTitle,
        facts_internal: renderedRequest(r, input.type),
        facts_shared: brief,
        status: 'new',
        priority: input.priority,
        case_manager_id: input.handlerId,
        due_at: deliveryDue,
        source: 'company_portal',
        channel: 'company_portal',
        created_by: actor && !actor.kind ? actor.id : null,
        created_at: t,
        updated_at: t,
        company_id: company.id,
        company_request_id: r.id,
      });
      issues.forEach((title, idx) => db.insert('case_issues', { case_id: caseId, number: idx + 1, title, legal_area: input.area, origin: 'staff', status: 'active', created_at: t }));
      for (const d of docIds) db.run('UPDATE documents SET case_id = ? WHERE id = ? AND company_request_id = ?', caseId, d, r.id);
      const partyActor = actor && !actor.kind ? actor : { id: null };
      for (const cp of input.counterparties) {
        try {
          app.practice.parties.add({ caseId }, { name: cp.name, role: cp.role }, partyActor);
        } catch (e) {
          if (e?.status !== 409) throw e;
        }
      }
      for (const mid of memIds) db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, linked_by, created_at) VALUES (?, ?, 'staff', ?, ?)", r.id, mid, actor && !actor.kind ? actor.id : null, t);
      const patch = {
        status: 'in_progress',
        waiting_on: null,
        type: input.type,
        case_id: caseId,
        handler_id: input.handlerId,
        practice_area: input.area,
        skills: JSON.stringify(input.skills),
        size: input.size,
        scope,
        quota_kind: billOverage ? 'overage' : quotaKind,
        quota_period: quotaPeriod,
        requires_senior_review: input.requiresSenior ? 1 : 0,
        risk_level: input.risk,
        priority: input.priority,
        sla_clock: sla.clock,
        delivery_window_hours: windowH,
        delivery_due_at: deliveryDue,
        delivery_due_original_at: deliveryDue,
        delivery_due_reason: input.dueReason,
        accepted_at: t,
        accepted_by: actor && !actor.kind ? actor.id : null,
        confirm_due_at: null,
        accept_plan_error: null,
        flags: withFlags(r, deadlineConflict ? ['deadline_conflict'] : [], ['quote_approved', 'plan_error', 'clarification_answered']),
        ...firstResponsePatch(r, 'accept', t),
      };
      if (plan) db.update('company_requests', r.id, { ...patch, rev: r.rev + 1, updated_at: t });
      else casUpdate(r, patch, { actor });
      db.insert('company_messages', {
        company_id: r.company_id,
        request_id: r.id,
        direction: 'out',
        kind: 'status',
        body: [COMPANY_TEXT.accepted(whenText(deliveryDue)), input.note].filter(Boolean).join('\n'),
        author_user_id: actor && !actor.kind ? actor.id : null,
        created_at: t,
      });
      if (billOverage) {
        chargeIds.push(app.companyBilling.insertCharge({ company, request: r, kind: 'overage', description: `طلب إضافي فوق الباقة — ${r.code}`, amountMinor: Number(terms.overage_price_minor) || 0, period: quotaPeriod, actor }));
      }
      caseRow = db.get('SELECT * FROM cases WHERE id = ?', caseId);
    });
    for (const cid of chargeIds) app.companyBilling.notifyCharge(cid, { actor, ctx });
    if (input.quota === 'free') app.audit.log({ actor, ctx, type: 'company.quota_free', severity: 'warning', company_id: company.id, summary: `طلب ${r.code} دون احتساب من باقة «${company.name}»`, data: { request_id: r.id } });
    if (high.length) app.audit.log({ actor, ctx, type: 'company.conflict_acknowledged', severity: 'warning', company_id: company.id, summary: `المتابعة في ${r.code} رغم تعارض مصالح محتمل (${high.length})`, data: { request_id: r.id, case_id: caseRow.id, subjects: [...new Set(high.map((m) => m.subject))] } });
    activity(getById(r.id), actor, { type: 'company_request.accepted', summary: `بدأ العمل على ${r.code} في الملف ${caseRow.code}`, data: { case_id: caseRow.id, quota_kind: billOverage ? 'overage' : quotaKind, plan } });
    // التغذية الراجعة لمقترح الفرز
    if (input.aiSuggestionId && app.ai?.recordFeedback) {
      const sug = db.get("SELECT * FROM ai_suggestions WHERE id = ? AND entity_type = 'company_request' AND entity_id = ?", input.aiSuggestionId, r.id);
      const out = sug ? parseJson(sug.output, null) : null;
      if (out) {
        for (const [field, ai, fin] of [
          ['company_type', out.type, input.type],
          ['legal_area', out.practice_area, input.area],
          ['urgency', out.urgency, input.priority],
          ['scope', out.scope_check?.in_plan === false ? 'out_of_scope' : 'in_scope', scope],
          ['effort', out.effort?.size, input.size],
        ]) {
          try {
            app.ai.recordFeedback({ suggestion_id: sug.id, entity_type: 'company_request', entity_id: r.id, case_id: caseRow.id, field, verdict: ai === fin ? 'accepted' : 'corrected', ai_value: ai ?? null, final_value: fin, actor: actor && !actor.kind ? actor : null, replace: true });
          } catch (e) {
            app.log('company triage feedback', e);
          }
        }
      }
    }
    // الإسناد بعد الالتزام: الأخطاء لا تلغي القبول
    const assignments = [];
    const assignErrors = [];
    const staffActor = actor && !actor.kind ? actor : db.get("SELECT * FROM users WHERE id = ?", input.handlerId) || db.get("SELECT * FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
    for (const role of ['lead', 'reviewer']) {
      const a = input.assign[role];
      if (!a) continue;
      try {
        const res = app.cases.assign(caseRow.id, { lawyer_id: a.lawyer_id, role, brief: a.brief, due_at: a.due_at, fee_mode: a.fee_mode, fee_amount: a.fee_amount, force: a.force, memory_ids: memIds.length ? memIds : undefined }, staffActor);
        assignments.push({ role, assignment_id: res.assignment.id, lawyer_id: a.lawyer_id, lawyer_name: a.lawyer_name, due_at: res.assignment.due_at });
        warnings.push(...(res.warnings || []));
      } catch (e) {
        assignErrors.push({ role, lawyer_id: a.lawyer_id, code: e.code || 'error', error: e.message });
      }
    }
    const after = getById(r.id);
    notifyCompany(after, { type: 'request.accepted', title: `بدأ العمل على طلبكم ${r.code}`, body: `موعد التسليم المتوقع: ${whenText(deliveryDue)}.` });
    return {
      request: svc.staffDetail(r.id, actor && !actor.kind ? actor : staffActor).request,
      case: { id: caseRow.id, code: caseRow.code },
      assignments,
      warnings,
      conflicts,
      assign_errors: assignErrors,
    };
  }

  /** اقتراح المحامين (B10-37): اقتراح المحرك + التخصصات + الفريق المفضل − المستبعدون */
  function suggestLawyers(id, role = 'lead') {
    const r = requireStaffRequest(id);
    const skills = new Set(parseJson(r.skills, []) || []);
    const pod = new Map(db.all('SELECT lawyer_id, role FROM company_team WHERE company_id = ?', r.company_id).map((x) => [x.lawyer_id, x.role]));
    const leadId = r.case_id ? db.value("SELECT lawyer_id FROM assignments WHERE case_id = ? AND role = 'lead' AND status != 'withdrawn' ORDER BY id DESC LIMIT 1", r.case_id) : null;
    const base = app.lawyers.suggest({ area: r.practice_area, case_id: r.case_id || undefined });
    const excluded = [];
    const items = [];
    for (const l of base) {
      if (pod.get(l.id) === 'excluded') {
        excluded.push({ id: l.id, name: l.name, reason: 'مستبعد لهذه الشركة' });
        continue;
      }
      if (role === 'reviewer' && leadId === l.id) continue;
      const ls = new Set(parseJson(db.value('SELECT skills FROM lawyers WHERE user_id = ?', l.id), []) || []);
      const overlap = [...skills].filter((s) => ls.has(s));
      let score = l.score + Math.min(2, overlap.length);
      const reasons = [...(l.reasons || [])];
      if (overlap.length) reasons.unshift(`تخصصات الشركات: ${overlap.map((s) => label('b2b_skill', s)).join('، ')}`);
      const pref = pod.get(l.id);
      if ((role === 'lead' && pref === 'preferred_lead') || (role === 'reviewer' && pref === 'preferred_reviewer')) {
        score += 1.5;
        reasons.unshift(label('company_pod_role', pref));
      }
      const rate = db.value('SELECT b2b_rate_minor FROM lawyers WHERE user_id = ?', l.id);
      items.push({ id: l.id, name: l.name, score: Math.round(score * 100) / 100, reasons, over_capacity: l.over_capacity, b2b_rate: rate ? major(rate) : null, skills: [...ls] });
    }
    items.sort((a, b) => b.score - a.score);
    return { role, items: items.slice(0, 10), excluded };
  }

  // ───────── خطاطيف المحرك (B10 §8.4) ─────────
  /** عند إسناد محامٍ لملف شركة: الاستبعاد، الموعد الافتراضي من موعد التسليم، وسعر طلبات الشركات */
  function assignDefaults(c, lawyerId, role, body = {}) {
    if (excludedFor(c.company_id, lawyerId) && !v.bool(body.force)) throw new ApiError(409, 'هذا المحامي مستبعد من العمل لهذه الشركة (الفريق المفضل).', 'lawyer_excluded_for_company');
    const out = {};
    const r = c.company_request_id ? getById(c.company_request_id) : null;
    if (r?.delivery_due_at && !r.sla_paused_at) {
      const cal = calOf(r.sla_clock);
      const t = nowIso();
      const start = t > (r.accepted_at || t) ? t : r.accepted_at;
      const window = businessMinutesBetween(start, r.delivery_due_at, cal);
      const buffer = Math.max(Math.round(window * 0.25), 240);
      const target = role === 'reviewer' ? window - Math.round(buffer / 2) : window - buffer;
      out.due_at = target > 0 ? addBusinessMinutes(start, target, cal) : r.delivery_due_at;
    }
    if (body.fee_mode === undefined || body.fee_mode === null || body.fee_mode === '') {
      const rate = db.value('SELECT b2b_rate_minor FROM lawyers WHERE user_id = ?', lawyerId);
      if (rate) {
        out.fee_mode = 'custom';
        out.fee_amount_minor = Number(rate);
      }
    }
    return out;
  }
  /** منح الذاكرة للمحامي: عناصر الطلب المرتبطة افتراضيًا أو المختارة؛ «المفوَّضون» لا يُمنحون أبدًا (L-57) */
  function setMemoryGrants(assignmentId, memoryIds, actor, { replace = true } = {}) {
    const a = db.get('SELECT a.*, c.company_id FROM assignments a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', assignmentId);
    if (!a) throw notFound('الإسناد غير موجود');
    if (!a.company_id) throw badRequest('منح الذاكرة لملفات الشركات فقط');
    const ids = [...new Set((memoryIds || []).map(Number))];
    const rows = [];
    for (const mid of ids) {
      const m = db.get('SELECT id, kind FROM company_memory WHERE id = ? AND company_id = ? AND archived_at IS NULL', mid, a.company_id);
      if (!m) throw badRequest('عنصر الذاكرة غير موجود في هذه الشركة', { fields: { memory_ids: 'اختر من ذاكرة الشركة' } });
      if (memoryKindByKey(m.kind)?.grantable === false) throw new ApiError(400, 'لا يُتاح «المفوَّضون بالتوقيع» للمحامين.', 'memory_kind_not_grantable', { memory_id: m.id });
      rows.push(m.id);
    }
    const t = nowIso();
    db.tx(() => {
      if (replace) db.run('DELETE FROM assignment_memory_grants WHERE assignment_id = ?', a.id);
      for (const mid of rows) db.run('INSERT OR IGNORE INTO assignment_memory_grants (assignment_id, memory_id, granted_by, granted_at) VALUES (?, ?, ?, ?)', a.id, mid, actor && !actor.kind ? actor.id : null, t);
    });
    return { memory_ids: db.all('SELECT memory_id FROM assignment_memory_grants WHERE assignment_id = ? ORDER BY memory_id', a.id).map((x) => x.memory_id) };
  }
  function onAssignmentCreated(assignmentId, c, body = {}, actor = null) {
    let ids;
    if (body.memory_ids !== undefined && body.memory_ids !== null) ids = v.ids(body.memory_ids, 'عناصر الذاكرة');
    else {
      ids = db
        .all('SELECT l.memory_id, m.kind FROM company_request_memory l JOIN company_memory m ON m.id = l.memory_id WHERE l.request_id = ? AND m.archived_at IS NULL', c.company_request_id)
        .filter((x) => memoryKindByKey(x.kind)?.grantable !== false)
        .map((x) => x.memory_id);
    }
    return setMemoryGrants(assignmentId, ids, actor);
  }
  /** كتلة «سياق الشركة» في صفحة الإسناد للمحامي (§4.7، L-57): الحقول المسموحة فقط، وكل نص منقًّى */
  function lawyerBlock(a, c, g) {
    const r = c.company_request_id ? getById(c.company_request_id) : null;
    if (!r) return null;
    const red = lawyerRedactor(c.company_id);
    const company = companyOf(c.company_id);
    const fields = parseJson(r.fields, {}) || {};
    const spec = typeByKey(r.type);
    const memIds = db.all('SELECT memory_id FROM assignment_memory_grants WHERE assignment_id = ?', a.id).map((x) => x.memory_id);
    const context = (memIds.length ? app.ai.companyContext(c.company_id, { memoryIds: memIds, forLawyer: true }) : []).map((m) => ({
      id: m.id,
      kind: m.kind,
      kind_label: label('company_memory_kind', m.kind),
      title: red(m.title),
      summary: red(m.summary),
      dates: m.dates,
      data: Object.fromEntries(Object.entries(m.data || {}).map(([k, val]) => [k, typeof val === 'string' ? red(val) : val])),
      documents: db
        .all('SELECT d.* FROM company_memory_documents md JOIN documents d ON d.id = md.document_id WHERE md.memory_id = ? ORDER BY d.id', m.id)
        .map((d) => ({ ...app.documents.publicView(d), title: red(d.title), filename: red(d.filename) })),
    }));
    return {
      name: g.client_name ? company.name : null,
      entity: entityOf(r)?.name || null,
      request_type: r.type,
      request_type_label: spec?.label || r.type,
      priority: r.priority,
      priority_label: label('priority', r.priority),
      output_language: fields.output_language || 'ar',
      delivery_due_at: r.delivery_due_at || null,
      requires_senior_review: !!r.requires_senior_review,
      context,
    };
  }
  /** تنقية صفحة الإسناد كاملة لملف شركة (L-57): الوقائع والمسائل وعناوين المستندات والردود المتاحة */
  function lawyerView(view, a, c, g) {
    const red = lawyerRedactor(c.company_id);
    const out = { ...view };
    if (out.facts) out.facts = red(out.facts);
    out.issues = (out.issues || []).map((i) => ({ ...i, title: red(i.title), details: red(i.details) }));
    out.documents = (out.documents || []).map((d) => ({ ...d, title: red(d.title), filename: red(d.filename) }));
    out.info_requests = (out.info_requests || []).map((x) => ({ ...x, response_text: red(x.response_text), question: red(x.question), documents: (x.documents || []).map((d) => ({ ...d, title: red(d.title), filename: red(d.filename) })) }));
    out.case_open_requests = (out.case_open_requests || []).map((x) => ({ ...x, client_message: red(x.client_message), items: (x.items || []).map(red) }));
    out.client_label = g.client_name ? companyOf(c.company_id)?.name || null : null;
    out.company = lawyerBlock(a, c, g);
    // ملفات عمل المحامي على هذا الإسناد (D3، P1) — لا تصل للشركة أبدًا (L-52)
    out.work_files = db
      .all("SELECT * FROM documents WHERE assignment_id = ? AND uploaded_by_kind = 'lawyer' ORDER BY id", a.id)
      .map((d) => ({ ...app.documents.publicView(d), title: red(d.title), filename: red(d.filename), deletable: !workFilesLocked(a.id) }));
    return out;
  }

  // ═════════════════════════ ملفات عمل المحامي في ملفات الشركات (§4.7، D3، P1) ═════════════════════════
  const WORK_FILE_MIMES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);
  const WORK_FILE_EXT = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const WORK_FILES_MAX = 5;
  /** بعد اعتماد رأي الإسناد لا تُحذف ملفات العمل (صارت جزءًا من سجل الملف) */
  function workFilesLocked(assignmentId) {
    return !!db.get("SELECT 1 FROM opinions WHERE assignment_id = ? AND status = 'approved'", assignmentId);
  }
  function lawyerAssignmentForWork(assignmentId, lawyer) {
    const a = app.visibility.requireAssignment(assignmentId, lawyer);
    const c = db.get('SELECT * FROM cases WHERE id = ?', a.case_id);
    if (!c || !c.company_id) throw notFound('الإسناد غير موجود');
    if (a.status === 'withdrawn') throw notFound('الإسناد غير موجود');
    return { a, c };
  }
  function addWorkFiles(assignmentId, body = {}, lawyer) {
    const { a, c } = lawyerAssignmentForWork(assignmentId, lawyer);
    app.cases.requireOpen(c.id);
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) throw badRequest('أرفق ملفًا واحدًا على الأقل', { fields: { files: 'أرفق ملفًا' } });
    if (files.length > WORK_FILES_MAX) throw badRequest(`الحد ${WORK_FILES_MAX} ملفات في المرة`, { fields: { files: `الحد ${WORK_FILES_MAX} ملفات` } });
    const live = Number(db.value("SELECT COUNT(*) FROM documents WHERE assignment_id = ? AND uploaded_by_kind = 'lawyer'", a.id));
    if (live + files.length > WORK_FILES_MAX) throw new ApiError(409, `الحد ${WORK_FILES_MAX} ملفات عمل لكل إسناد؛ احذف ملفًا قديمًا أولًا.`, 'work_files_limit');
    for (const f of files) {
      const ext = String(f?.filename || f?.name || '').toLowerCase().split('.').pop();
      const mime = WORK_FILE_EXT[ext] || String(f?.mime || '').toLowerCase();
      if (!WORK_FILE_MIMES.has(mime)) throw badRequest('ملفات العمل: PDF أو Word أو Excel أو صور فقط', { fields: { files: 'نوع غير مسموح' } });
    }
    const keys = [];
    let ids;
    try {
      ids = db.tx(() =>
        files.map((f) => {
          const did = app.documents.save({ filename: f.filename || f.name, mime: f.mime, data_base64: f.data_base64 }, { case_id: c.id, assignment_id: a.id, company_request_id: c.company_request_id || null, title: f.title }, lawyer);
          keys.push(db.value('SELECT storage_key FROM documents WHERE id = ?', did));
          return did;
        }),
      );
    } catch (e) {
      for (const k of keys) unlinkStored(k);
      throw e;
    }
    db.run('UPDATE assignments SET last_activity_at = ? WHERE id = ?', nowIso(), a.id);
    app.activity.log({ case_id: c.id, actor: lawyer, type: 'work_file.added', summary: `أضاف ${lawyer.name} ${ids.length === 1 ? 'ملف عمل' : `${ids.length} ملفات عمل`} في الملف ${c.code}`, data: { assignment_id: a.id, document_ids: ids } });
    const red = lawyerRedactor(c.company_id);
    return { documents: ids.map((id) => db.get('SELECT * FROM documents WHERE id = ?', id)).map((d) => ({ ...app.documents.publicView(d), title: red(d.title), filename: red(d.filename), deletable: true })) };
  }
  function deleteWorkFile(docId, lawyer) {
    const d = db.get("SELECT * FROM documents WHERE id = ? AND uploaded_by_kind = 'lawyer' AND uploaded_by_user_id = ? AND assignment_id IS NOT NULL", Number(docId) || 0, lawyer.id);
    if (!d) throw notFound('الملف غير موجود');
    const { a, c } = lawyerAssignmentForWork(d.assignment_id, lawyer);
    if (workFilesLocked(a.id)) throw new ApiError(409, 'اعتُمد رأيك في هذا الإسناد؛ لا تُحذف ملفات العمل بعد الاعتماد.', 'work_file_locked');
    const used = ['company_deliverable_documents', 'company_message_documents', 'company_memory_documents'].some((tb) => db.get(`SELECT 1 FROM ${tb} WHERE document_id = ?`, d.id));
    if (used) throw new ApiError(409, 'استخدم الفريق هذا الملف في رسالة أو تسليم؛ لا يُحذف.', 'work_file_in_use');
    db.run('DELETE FROM documents WHERE id = ?', d.id);
    unlinkStored(d.storage_key);
    app.activity.log({ case_id: c.id, actor: lawyer, type: 'work_file.deleted', summary: `حذف ${lawyer.name} ملف عمل من الملف ${c.code}`, data: { assignment_id: a.id, document_id: d.id } });
    return { ok: true };
  }

  // ═════════════════════════ SRV-9: الاستيضاح وإيقاف مستوى الخدمة ═════════════════════════
  function itemsFrom(input) {
    const list = Array.isArray(input) ? input : typeof input === 'string' ? input.split('\n') : [];
    const clean = list.map((x) => String(typeof x === 'string' ? x : x?.label ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (clean.length > 5) throw badRequest('الحد 5 بنود للاستيضاح', { fields: { items: 'الحد 5 بنود' } });
    if (clean.some((x) => x.length > 200)) throw badRequest('كل بند 200 حرف على الأكثر', { fields: { items: 'البند أطول من المسموح' } });
    return clean.map((labelText) => ({ label: labelText }));
  }
  /** استيضاح على طلب في ملف (طلب معلومات من المحامي وافقت عليه الإدارة، أو طلب من الإدارة مباشرة) — حارس #14 */
  function clarificationFromInfo(ir, c, actor, body = {}) {
    const r = c.company_request_id ? getById(c.company_request_id) : null;
    if (!r) throw notFound('طلب الشركة غير موجود');
    if (CLOSED_STATUSES.includes(r.status)) throw conflict('طلب الشركة مغلق.');
    const company = companyOf(r.company_id);
    const message = v.str(body.client_message, 'نص الرسالة للشركة', { required: true, max: 3000 });
    const items = body.items !== undefined ? itemsFrom(body.items) : parseJson(ir.items, []) || [];
    const t = nowIso();
    db.tx(() => {
      const mid = db.insert('company_messages', {
        company_id: r.company_id,
        request_id: r.id,
        direction: 'out',
        kind: 'clarification',
        body: message,
        items: items.length ? JSON.stringify(items) : null,
        info_request_id: ir.id,
        author_user_id: actor && !actor.kind ? actor.id : null,
        created_at: t,
      });
      db.update('info_requests', ir.id, {
        status: 'sent_to_client',
        client_message: message,
        decided_by: actor?.id ?? null,
        decided_at: t,
        sent_at: t,
        sent_channel: 'company_portal',
        items: body.items !== undefined ? JSON.stringify(items) : undefined,
        company_message_id: mid,
        updated_at: t,
      });
      const cur = getById(r.id);
      db.update('company_requests', r.id, { waiting_on: 'info', ...(cur.status === 'in_progress' ? pausePatch(cur, 'info', t) : {}), rev: cur.rev + 1, updated_at: t });
    });
    app.activity.log({ case_id: c.id, actor, type: 'info_request.sent', summary: 'وافقت الإدارة على الطلب وأرسلته للشركة عبر بوابتها', company_id: r.company_id, company_request_id: r.id });
    if (ir.requested_by && ir.assignment_id) {
      app.notifications.notify(ir.requested_by, { type: 'info_request.sent', title: `أُرسل طلبك للشركة في الملف ${c.code}`, body: 'سيصلك إشعار عند إتاحة الرد لك.', link: `#/my/assignments/${ir.assignment_id}` });
    }
    notifyCompany(getById(r.id), { type: 'request.clarification', title: `فريقكم القانوني يحتاج معلومة — ${r.code}`, body: r.title, email: 'clarification', focus: '?focus=action' });
    void company;
    return db.get('SELECT * FROM info_requests WHERE id = ?', ir.id);
  }
  /** استيضاح من الإدارة (8.2.5): قبل القبول ← «بانتظار ردكم» (أول رد)؛ بعده ← طلب معلومات على الملف (نفس الفرع) */
  function clarify(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    checkRev(r, body);
    const text = v.str(body.body, 'نص الاستيضاح', { required: true, min: 5, max: 3000 });
    const items = itemsFrom(body.items);
    if (r.case_id && ['in_progress', 'delivered'].includes(r.status)) {
      app.requests.createInfoByStaff(r.case_id, actor, { kind: items.length ? 'document' : 'information', question: text, client_message: text, items: items.map((x) => x.label) });
      activity(getById(r.id), actor, { type: 'company_request.clarify', summary: `استيضاح من الفريق على ${r.code} أثناء العمل` });
      return svc.staffDetail(r.id, actor);
    }
    if (!['submitted', 'awaiting_company'].includes(r.status)) throw new ApiError(409, 'لا يمكن الاستيضاح في حالة الطلب الحالية.', 'invalid_transition');
    const t = nowIso();
    db.tx(() => {
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'clarification', body: text, items: items.length ? JSON.stringify(items) : null, author_user_id: actor.id, created_at: t });
      casUpdate(r, { status: 'awaiting_company', waiting_on: r.waiting_on && r.waiting_on !== 'info' ? r.waiting_on : 'info', confirm_due_at: null, flags: withFlags(r, [], ['clarification_answered']), ...firstResponsePatch(r, 'clarify', t) }, { actor });
    });
    const after = getById(r.id);
    activity(after, actor, { type: 'company_request.clarify', summary: `استيضاح من الفريق على ${r.code}${items.length ? ` (${items.length} بنود)` : ''}` });
    notifyCompany(after, { type: 'request.clarification', title: `فريقكم القانوني يحتاج معلومة — ${r.code}`, body: r.title, email: 'clarification', focus: '?focus=action' });
    return svc.staffDetail(r.id, actor);
  }

  // ═════════════════════════ SRV-10: عروض الأسعار والتكاليف ═════════════════════════
  function quoteById(id) {
    const q = db.get('SELECT * FROM company_quotes WHERE id = ?', Number(id) || 0);
    if (!q) throw notFound('عرض السعر غير موجود');
    return q;
  }
  /** إرسال عرض سعر (A، 8.2.7): مبلغ ثابت أو بحد أقصى فقط (L-31)؛ رقم لكل شركة {prefix}-Q-NNN (L-35) */
  function sendQuote(id, body = {}, actor, ctx) {
    const r = requireStaffRequest(id);
    checkRev(r, body);
    const company = companyOf(r.company_id);
    if (!['submitted', 'awaiting_company'].includes(r.status)) throw new ApiError(409, 'يُرسل عرض السعر قبل بدء العمل فقط.', 'invalid_transition');
    if (db.get("SELECT 1 FROM company_quotes WHERE request_id = ? AND status = 'sent'", r.id)) throw new ApiError(409, 'يوجد عرض سعر مفتوح لهذا الطلب؛ اسحبه أولًا.', 'quote_open');
    const kind = v.oneOf(body.kind, ['out_of_scope', 'overage'], 'نوع العرض', { required: true });
    if (body.basis === 'hourly') throw new ApiError(400, 'العرض بالساعة غير متاح في هذا الإصدار؛ اختر مبلغًا ثابتًا أو بحد أقصى.', 'basis_not_available');
    const basis = v.oneOf(body.basis, ['fixed', 'capped'], 'أساس العرض', { required: true });
    const amountMinor = basis === 'fixed' ? v.money(body.amount, 'المبلغ', { required: true, min: 1 }) : null;
    const capMinor = basis === 'capped' ? v.money(body.cap ?? body.amount, 'الحد الأقصى', { required: true, min: 1 }) : null;
    const scopeOfWork = v.str(body.scope_of_work, 'نطاق العمل', { required: true, min: 10, max: 3000 });
    const assumptions = v.str(body.assumptions, 'الافتراضات', { max: 2000 });
    const excluded = v.str(body.excluded, 'ما لا يشمله العرض', { max: 2000 });
    const validDays = v.int(body.valid_days, 'مدة الصلاحية', { min: 1, max: 90 }) ?? (Number(app.settings.get('b2b_quote_valid_days')) || 14);
    const message = v.str(body.message, 'رسالة للشركة', { max: 2000 });
    let plan = null;
    if (body.accept_plan && typeof body.accept_plan === 'object') {
      acceptInput(r, company, body.accept_plan, actor); // تحقق مبكر من الخطة
      plan = body.accept_plan;
    }
    const t = nowIso();
    const validUntil = addDays(t, validDays);
    let qid;
    db.tx(() => {
      const n = db.nextCounter(`company_quote:${company.id}`, 1);
      const number = `${company.prefix}-Q-${String(n).padStart(3, '0')}`;
      qid = db.insert('company_quotes', {
        company_id: company.id,
        request_id: r.id,
        number,
        kind,
        basis,
        amount_minor: amountMinor,
        cap_minor: capMinor,
        currency: 'EGP',
        scope_of_work: scopeOfWork,
        assumptions,
        excluded,
        valid_until: validUntil,
        status: 'sent',
        created_by: actor.id,
        sent_at: t,
        created_at: t,
        updated_at: t,
      });
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'quote', body: message || `أرسلنا لكم عرض السعر ${number} للموافقة.`, author_user_id: actor.id, created_at: t });
      casUpdate(r, {
        status: 'awaiting_company',
        waiting_on: kind === 'overage' ? 'overage' : 'quote',
        confirm_due_at: null,
        accept_plan: plan ? JSON.stringify(plan) : null,
        accept_plan_error: null,
        flags: withFlags(r, [], ['quote_approved', 'plan_error']),
        ...firstResponsePatch(r, kind === 'overage' ? 'overage' : 'quote', t),
      }, { actor });
    });
    const q = quoteById(qid);
    app.audit.log({ actor, ctx, type: 'company.quote_sent', company_id: company.id, summary: `إرسال عرض السعر ${q.number} (${label('company_quote_basis', basis)} ${formatEgp(amountMinor ?? capMinor)}) على ${r.code} لـ«${company.name}»`, data: { quote_id: q.id, request_id: r.id, kind, basis, amount_minor: amountMinor, cap_minor: capMinor, with_plan: !!plan } });
    const after = getById(r.id);
    notifyCompany(after, { type: 'request.quote', title: `عرض سعر بانتظار موافقتكم — ${r.code}`, body: `${formatEgp(amountMinor ?? capMinor)}${basis === 'capped' ? ' (حد أقصى)' : ''} · صالح حتى ${arabicDate(validUntil)}`, email: 'quote', focus: '?focus=action', admins: true });
    return svc.staffDetail(r.id, actor);
  }
  /** سحب العرض (A) ← يعود الطلب «جديدًا» مع مرحلة تأكيد الموعد */
  function withdrawQuote(quoteId, body = {}, actor, ctx) {
    const q = quoteById(quoteId);
    if (q.status !== 'sent') throw new ApiError(409, 'العرض ليس مفتوحًا.', 'quote_state');
    const r = getById(q.request_id);
    const t = nowIso();
    db.tx(() => {
      db.run("UPDATE company_quotes SET status = 'withdrawn', decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ? AND status = 'sent'", t, v.str(body.reason, 'السبب', { max: 500 }), t, q.id);
      const openClar = db.get("SELECT 1 FROM company_messages WHERE request_id = ? AND kind = 'clarification' AND answered_at IS NULL", r.id);
      if (r.status === 'awaiting_company') {
        db.update('company_requests', r.id, openClar ? { waiting_on: 'info', rev: r.rev + 1, updated_at: t } : { status: 'submitted', waiting_on: null, confirm_due_at: confirmDue(r, t), accept_plan: null, rev: r.rev + 1, updated_at: t });
      }
    });
    app.audit.log({ actor, ctx, type: 'company.quote_withdrawn', company_id: q.company_id, summary: `سحب عرض السعر ${q.number} (${r.code})`, data: { quote_id: q.id } });
    notifyCompany(getById(r.id), { type: 'request.message', title: `سحب فريقكم القانوني عرض السعر — ${r.code}`, body: 'سيتواصل معكم فريقكم القانوني بالخطوة التالية.', admins: true });
    return svc.staffDetail(r.id, actor);
  }
  /** الفاعل الذي تُنفَّذ به خطة البدء: مرسل العرض إن بقي نشطًا، وإلا مدير العلاقة، وإلا أي مدير نظام نشط (L-61) */
  function planActor(q, company) {
    const ok = (uid) => (uid ? db.get("SELECT * FROM users WHERE id = ? AND active = 1 AND role IN ('admin','case_manager')", uid) : null);
    return ok(q.created_by) || ok(companies().accountManagerOf(company)?.id) || db.get("SELECT * FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
  }
  /** تشغيل خطة البدء بعد الموافقة (خطوة مستقلة؛ أي فشل ← plan_error ولا يفشل نقر الشركة) */
  function runAcceptPlan(r, q, company) {
    const planBody = parseJson(r.accept_plan, null);
    if (!planBody) return null;
    const actor = planActor(q, company);
    try {
      if (!actor) throw new ApiError(409, 'لا يوجد حساب إدارة نشط لتنفيذ الخطة', 'no_actor');
      return acceptRequest(r.id, planBody, actor, null, { plan: true });
    } catch (e) {
      const cur = getById(r.id);
      db.update('company_requests', r.id, { flags: withFlags(cur, ['plan_error']), accept_plan_error: String(e.message || e).slice(0, 500), rev: cur.rev + 1, updated_at: nowIso() });
      activity(cur, SYSTEM_ACTOR, { type: 'company_request.plan_error', summary: `تعذّر بدء العمل تلقائيًا على ${r.code}: ${truncate(String(e.message || e), 160)}`, data: { code: e.code || null } });
      notifyStaff(cur, company, { type: 'company_request.plan_error', title: `تعذّر بدء العمل تلقائيًا بعد موافقة ${company.name} على العرض — ${r.code}` });
      return null;
    }
  }
  /** موافقة الشركة على عرض (L-61): معاملة واحدة (إعادة التحقق، الموافقة، التكلفة، الاحتساب) ثم خطة البدء */
  function approveQuote(cu, company, code, number, body = {}) {
    const r = visibleByCode(cu, code);
    const q = db.get('SELECT * FROM company_quotes WHERE number = ? AND request_id = ?', String(number || '').toUpperCase(), r.id);
    if (!q) throw requestNotFound();
    const settings = companies().settingsOf(company);
    if (cu.role !== 'company_admin' && !(r.submitted_by === cu.id && settings.quote_approvers === 'admins_or_submitter')) throw forbidden('يوافق على عروض الأسعار مديرو البوابة.');
    if (q.status === 'approved') return { ...companyView(cu, company, getById(r.id)), approved_quote: quoteView(q) };
    if (q.status === 'expired') throw new ApiError(409, COMPANY_TEXT.quote_expired, 'quote_expired');
    if (q.status !== 'sent') throw new ApiError(409, COMPANY_TEXT.quote_state, 'quote_state');
    const t = nowIso();
    if (q.valid_until < t) {
      // انتهى العرض قبل أن تمر المهمة: نفس مسار الانتهاء (يعود الطلب «جديدًا» ويُبلَّغ الفريق)
      expireQuotes();
      throw new ApiError(409, COMPANY_TEXT.quote_expired, 'quote_expired');
    }
    const note = cleanLine(body.note, 500) || null;
    let chargeId = null;
    let fresh = false;
    db.tx(() => {
      const res = db.run("UPDATE company_quotes SET status = 'approved', decided_at = ?, decided_by_company_user_id = ?, decision_note = ?, updated_at = ? WHERE id = ? AND status = 'sent' AND valid_until >= ?", t, cu.id, note, t, q.id, t);
      if (!res.changes) return;
      fresh = true;
      if (!db.get('SELECT 1 FROM company_charges WHERE quote_id = ?', q.id)) {
        chargeId = app.companyBilling.insertCharge({
          company,
          request: r,
          quote: q,
          kind: q.kind,
          description: `عرض السعر ${q.number}${q.basis === 'capped' ? ' (الحد الأقصى المعتمد)' : ''}`,
          amountMinor: q.basis === 'capped' ? q.cap_minor : q.amount_minor,
          actor: null,
        });
      }
      const cls = app.companyBilling.classify(company, { outOfScope: true });
      const cur = getById(r.id);
      const openClar = db.get("SELECT 1 FROM company_messages WHERE request_id = ? AND kind = 'clarification' AND answered_at IS NULL", r.id);
      db.update('company_requests', r.id, {
        quota_kind: q.kind === 'overage' ? 'overage' : 'out_of_scope',
        quota_period: cls.quota_period,
        status: openClar ? 'awaiting_company' : 'submitted',
        waiting_on: openClar ? 'info' : null,
        confirm_due_at: confirmDue(cur, t),
        flags: withFlags(cur, ['quote_approved'], ['plan_error']),
        rev: cur.rev + 1,
        updated_at: t,
      });
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'status', body: `تمت الموافقة على عرض السعر ${q.number}.${note ? `\n${note}` : ''}`, author_company_user_id: cu.id, created_at: t });
    });
    if (!fresh) return { ...companyView(cu, company, getById(r.id)), approved_quote: quoteView(quoteById(q.id)) };
    const actorC = companyActor(cu, company);
    if (chargeId) app.companyBilling.notifyCharge(chargeId, { actor: actorC });
    app.audit.log({ actor: actorC, type: 'company.quote_approved', company_id: company.id, company_user_id: cu.id, summary: `وافقت «${company.name}» على عرض السعر ${q.number} (${r.code}) بواسطة ${cu.name}`, data: { quote_id: q.id, request_id: r.id } });
    companyActivity(r, cu, company, { type: 'company_request.quote_approved', summary: `وافقت ${company.name} على عرض السعر ${q.number}` });
    notifyStaff(getById(r.id), company, { type: 'company_request.quote_decided', title: `وافقت ${company.name} على عرض السعر — ${r.code}` });
    const others = recipients(r, { admins: true }).filter((x) => x !== cu.id);
    app.companyNotify.notify(others, { companyId: company.id, type: 'request.quote_decided', title: `تمت الموافقة على عرض السعر — ${r.code}`, body: `بواسطة ${cu.name}`, link: `#/requests/${r.code}`, requestId: r.id, email: { template: 'request_update', vars: { code: r.code } } });
    if (getById(r.id).accept_plan) runAcceptPlan(getById(r.id), quoteById(q.id), company);
    return { ...companyView(cu, company, getById(r.id)), approved_quote: quoteView(quoteById(q.id)) };
  }
  function rejectQuote(cu, company, code, number, body = {}) {
    const r = visibleByCode(cu, code);
    const q = db.get('SELECT * FROM company_quotes WHERE number = ? AND request_id = ?', String(number || '').toUpperCase(), r.id);
    if (!q) throw requestNotFound();
    const settings = companies().settingsOf(company);
    if (cu.role !== 'company_admin' && !(r.submitted_by === cu.id && settings.quote_approvers === 'admins_or_submitter')) throw forbidden('يقرر في عروض الأسعار مديرو البوابة.');
    if (q.status !== 'sent') throw new ApiError(409, COMPANY_TEXT.quote_state, 'quote_state');
    const reason = cleanLine(body.reason, 501);
    if (!reason) throw badRequest('اكتبوا سبب الرفض.', { fields: { reason: 'اكتبوا سبب الرفض.' } });
    if (reason.length > 500) throw badRequest('النص أطول من المسموح.', { fields: { reason: 'النص أطول من المسموح.' } });
    const t = nowIso();
    db.tx(() => {
      db.run("UPDATE company_quotes SET status = 'rejected', decided_at = ?, decided_by_company_user_id = ?, decision_note = ?, updated_at = ? WHERE id = ? AND status = 'sent'", t, cu.id, reason, t, q.id);
      db.run("UPDATE company_requests SET status = 'cancelled', resolution = 'quote_rejected', resolution_note = ?, waiting_on = NULL, closed_at = ?, confirm_due_at = NULL, rev = rev + 1, updated_at = ? WHERE id = ?", reason, t, t, r.id);
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'status', body: `رُفض عرض السعر ${q.number}: ${reason}`, author_company_user_id: cu.id, created_at: t });
    });
    const actorC = companyActor(cu, company);
    app.audit.log({ actor: actorC, type: 'company.quote_rejected', company_id: company.id, company_user_id: cu.id, summary: `رفضت «${company.name}» عرض السعر ${q.number} (${r.code})`, data: { quote_id: q.id, request_id: r.id } });
    companyActivity(r, cu, company, { type: 'company_request.quote_rejected', summary: `رفضت ${company.name} عرض السعر ${q.number}` });
    notifyStaff(getById(r.id), company, { type: 'company_request.quote_decided', title: `رفضت ${company.name} عرض السعر — ${r.code}` });
    const others = recipients(r, { admins: true }).filter((x) => x !== cu.id);
    app.companyNotify.notify(others, { companyId: company.id, type: 'request.quote_decided', title: `رُفض عرض السعر — ${r.code}`, body: `بواسطة ${cu.name}`, link: `#/requests/${r.code}`, requestId: r.id });
    return companyView(cu, company, getById(r.id));
  }
  /** انتهاء صلاحية العروض (مهمة b2b.reminders) ← يعود الطلب «جديدًا» ويُبلَّغ الفريق */
  function expireQuotes() {
    const t = nowIso();
    let n = 0;
    for (const q of db.all("SELECT * FROM company_quotes WHERE status = 'sent' AND valid_until < ?", t)) {
      const r = getById(q.request_id);
      db.tx(() => {
        db.run("UPDATE company_quotes SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'sent'", t, q.id);
        if (r.status === 'awaiting_company' && (r.waiting_on === 'quote' || r.waiting_on === 'overage')) {
          db.update('company_requests', r.id, { status: 'submitted', waiting_on: null, accept_plan: null, confirm_due_at: confirmDue(r, t), rev: r.rev + 1, updated_at: t });
        }
      });
      notifyStaff(getById(r.id), companyOf(r.company_id), { type: 'company_request.quote_decided', title: `انتهت صلاحية عرض السعر — ${r.code}` });
      n += 1;
    }
    return n;
  }

  // ═════════════════════════ SRV-11: التسليمات وبوابة المستندات والإغلاق ═════════════════════════
  function deliverableById(id) {
    const d = db.get('SELECT * FROM company_deliverables WHERE id = ?', Number(id) || 0);
    if (!d) throw notFound('التسليم غير موجود');
    return d;
  }
  function recommendationsInput(x) {
    const list = Array.isArray(x) ? x : typeof x === 'string' ? x.split('\n') : [];
    const clean = list.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (clean.length > 10) throw badRequest('الحد 10 توصيات', { fields: { recommendations: 'الحد 10 توصيات' } });
    if (clean.some((s) => s.length > 500)) throw badRequest('كل توصية 500 حرف على الأكثر', { fields: { recommendations: 'التوصية أطول من المسموح' } });
    return clean;
  }
  /** مستندات التسليم: مستندات قائمة في الملف أو الطلب (document_ids) + ملفات جديدة يرفعها الفريق (files) */
  function deliverableDocIds(r, company, body, actor, saved) {
    const ids = v.ids(body.document_ids, 'المستندات');
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length > 10) throw badRequest('الحد 10 ملفات في المرة');
    for (const f of files) {
      const did = app.documents.save(f || {}, { client_id: company.client_id, case_id: r.case_id ?? null, company_id: company.id, title: f?.title }, actor);
      db.run('UPDATE documents SET company_request_id = ? WHERE id = ?', r.id, did);
      // مفتاح التخزين يُحفظ الآن: بعد تراجع المعاملة يختفي صف المستند ويبقى الملف على القرص ما لم يُحذف (L-27)
      saved.push(db.value('SELECT storage_key FROM documents WHERE id = ?', did));
      ids.push(did);
    }
    return ids;
  }
  function deliverableFields(r, body, { partial = false } = {}) {
    const out = {};
    if (!partial || body.kind !== undefined) out.kind = v.oneOf(body.kind || typeByKey(r.type)?.deliverable_kind || 'memo', DELIVERABLE_KINDS.map((x) => x.key), 'نوع التسليم', { required: true });
    if (!partial || body.title !== undefined) out.title = v.str(body.title, 'عنوان التسليم', { required: true, max: 200 });
    if (!partial || body.summary !== undefined) out.summary = v.str(body.summary, 'الخلاصة', { required: true, min: 10, max: 3000 });
    if (body.body !== undefined) out.body = v.str(body.body, 'النص', { max: 30000 });
    if (body.recommendations !== undefined) out.recommendations = JSON.stringify(recommendationsInput(body.recommendations));
    if (body.risk_level !== undefined) out.risk_level = v.oneOf(body.risk_level || null, ['low', 'medium', 'high'], 'درجة المخاطر');
    if (body.final !== undefined) out.final = v.bool(body.final) ? 1 : 0;
    if (body.docs_reviewed !== undefined) out.docs_reviewed = v.bool(body.docs_reviewed) ? 1 : 0;
    if (body.opinion_id !== undefined) {
      if (body.opinion_id === null || body.opinion_id === '') out.opinion_id = null;
      else {
        const o = r.case_id ? db.get("SELECT id FROM opinions WHERE id = ? AND case_id = ? AND status = 'approved'", Number(body.opinion_id) || 0, r.case_id) : null;
        if (!o) throw badRequest('الرأي المختار ليس رأيًا معتمدًا في ملف هذا الطلب', { fields: { opinion_id: 'اختر رأيًا معتمدًا' } });
        out.opinion_id = o.id;
      }
    }
    return out;
  }
  function setDeliverableDocs(did, ids) {
    db.run('DELETE FROM company_deliverable_documents WHERE deliverable_id = ?', did);
    for (const id of [...new Set(ids)]) db.run('INSERT OR IGNORE INTO company_deliverable_documents (deliverable_id, document_id) VALUES (?, ?)', did, id);
  }
  /** مسودة تسليم (8.2.6، S) */
  function createDeliverable(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    const company = companyOf(r.company_id);
    if (!['in_progress', 'delivered'].includes(r.status)) throw new ApiError(409, 'يُعد التسليم بعد بدء العمل على الطلب.', 'invalid_transition');
    const f = deliverableFields(r, body);
    const saved = [];
    let did;
    try {
      did = db.tx(() => {
        const ids = deliverableDocIds(r, company, body, actor, saved);
        const version = Number(db.value('SELECT COALESCE(MAX(version), 0) FROM company_deliverables WHERE request_id = ?', r.id)) + 1;
        const t = nowIso();
        const newId = db.insert('company_deliverables', {
          company_id: r.company_id,
          request_id: r.id,
          version,
          recommendations: '[]',
          final: 1,
          ...f,
          status: 'draft',
          prepared_by: actor.id,
          created_at: t,
          updated_at: t,
        });
        setDeliverableDocs(newId, ids);
        return newId;
      });
    } catch (e) {
      for (const k of saved) unlinkStored(k);
      throw e;
    }
    activity(r, actor, { type: 'company_deliverable.drafted', summary: `مسودة تسليم على ${r.code}` });
    return { deliverable: deliverableView(deliverableById(did), { staff: true }), precheck: precheck(did) };
  }
  function updateDeliverable(did, body = {}, actor) {
    const d = deliverableById(did);
    if (d.status !== 'draft') throw new ApiError(409, 'التسليم أُرسل بالفعل؛ لا يُعدَّل بعد الإرسال.', 'deliverable_released');
    const r = getById(d.request_id);
    const company = companyOf(r.company_id);
    const f = deliverableFields(r, body, { partial: true });
    const saved = [];
    try {
      db.tx(() => {
        if (body.document_ids !== undefined || body.files !== undefined) {
          const keep = body.document_ids === undefined ? db.all('SELECT document_id FROM company_deliverable_documents WHERE deliverable_id = ?', d.id).map((x) => x.document_id) : [];
          const ids = deliverableDocIds(r, company, body, actor, saved);
          setDeliverableDocs(d.id, [...keep, ...ids]);
        }
        if (Object.keys(f).length) db.update('company_deliverables', d.id, { ...f, updated_at: nowIso() });
      });
    } catch (e) {
      for (const k of saved) unlinkStored(k);
      throw e;
    }
    return { deliverable: deliverableView(deliverableById(d.id), { staff: true }), precheck: precheck(d.id) };
  }
  /** الفحص المسبق (D12 + file_authors): نفس بوابة الإرسال */
  function precheck(did) {
    const d = deliverableById(did);
    const r = getById(d.request_id);
    const approved = r.case_id ? db.all("SELECT o.id, a.role FROM opinions o JOIN assignments a ON a.id = o.assignment_id WHERE o.case_id = ? AND o.status = 'approved'", r.case_id) : [];
    const docIds = db.all('SELECT document_id FROM company_deliverable_documents WHERE deliverable_id = ?', d.id).map((x) => x.document_id);
    const gate = app.companyDocGate.companyDocGate({ requestId: r.id, texts: { title: d.title, summary: d.summary, body: d.body || '', recommendations: parseJson(d.recommendations, []) || [] }, documentIds: docIds });
    return {
      approved_opinion: approved.length > 0,
      senior_review: r.requires_senior_review ? (approved.some((x) => x.role === 'reviewer') ? 'ok' : 'missing') : 'not_required',
      lawyer_names: gate.lawyer_names,
      file_authors: gate.file_authors,
      office_docs: gate.office_docs,
      foreign_docs: gate.foreign_docs,
      docs_reviewed: !!d.docs_reviewed,
    };
  }
  /** الإرسال للشركة (8.2.6) — كل البوابات على الخادم (L-56، D4) */
  function releaseDeliverable(did, body = {}, actor, ctx) {
    const d = deliverableById(did);
    if (d.status !== 'draft') throw new ApiError(409, 'التسليم أُرسل بالفعل.', 'deliverable_released');
    const r = getById(d.request_id);
    const company = companyOf(r.company_id);
    if (!['in_progress', 'delivered'].includes(r.status)) throw new ApiError(409, 'لا يُرسل التسليم في حالة الطلب الحالية.', 'invalid_transition');
    if (r.status === 'in_progress' && r.waiting_on === 'info' && d.final) throw new ApiError(409, 'الطلب بانتظار رد الشركة على استيضاح؛ أرسل التسليم بعد ردها أو أرسله تسليمًا مرحليًا.', 'waiting_on_company');
    if (body.docs_reviewed !== undefined) db.update('company_deliverables', d.id, { docs_reviewed: v.bool(body.docs_reviewed) ? 1 : 0, updated_at: nowIso() });
    const pc = precheck(d.id);
    const isAdmin = actor?.role === 'admin';
    const overrideReason = v.str(body.override_reason, 'سبب التجاوز', { max: 500 });
    const overrides = [];
    if (!pc.approved_opinion) {
      if (!(isAdmin && overrideReason)) throw new ApiError(409, 'لا يوجد رأي معتمد في ملف الطلب بعد؛ اعتمد الرأي أولًا.', 'approved_opinion_required', pc);
      overrides.push('approved_opinion');
    }
    if (pc.senior_review === 'missing') {
      if (!(isAdmin && overrideReason)) throw new ApiError(409, 'الطلب يحتاج مراجعة ثانية مستقلة معتمدة قبل الإرسال.', 'senior_review_required', pc);
      overrides.push('senior_review');
    }
    const allowNames = v.bool(body.allow_names);
    if (allowNames && !(isAdmin && overrideReason)) throw forbidden('السماح بالأسماء متاح لدور «إدارة النظام» مع ذكر السبب');
    const err = app.companyDocGate.gateError(
      { lawyer_names: pc.lawyer_names, file_authors: pc.file_authors, office_docs: pc.office_docs, foreign_docs: pc.foreign_docs },
      { docsReviewed: !!deliverableById(d.id).docs_reviewed, allowNames },
    );
    if (err) throw new ApiError(err.status, err.message, err.code, pc);
    if (allowNames && pc.lawyer_names.length) overrides.push('lawyer_names');
    const t = nowIso();
    const message = v.str(body.message, 'رسالة للشركة', { max: 2000 });
    db.tx(() => {
      db.update('company_deliverables', d.id, { status: 'released', released_by: actor.id, released_at: t, updated_at: t });
      const cur = getById(r.id);
      if (d.final) {
        db.update('company_requests', r.id, { status: 'delivered', delivered_at: t, waiting_on: null, flags: withFlags(cur, [], ['changes_requested', 'opinion_approved_not_delivered']), ...resumePatch(cur, t), rev: cur.rev + 1, updated_at: t });
      } else db.update('company_requests', r.id, { rev: cur.rev + 1, updated_at: t });
      if (message) db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'deliverable', body: message, author_user_id: actor.id, created_at: t });
    });
    refreshSearch(r.id);
    activity(getById(r.id), actor, { type: 'company_deliverable.released', summary: `أُرسل التسليم ${d.version} (${d.final ? 'نهائي' : 'مرحلي'}) على ${r.code}`, data: { deliverable_id: d.id, overrides } });
    if (overrides.length) app.audit.log({ actor, ctx, type: 'company.deliverable_released_override', severity: 'warning', company_id: company.id, summary: `إرسال تسليم ${r.code} مع تجاوز: ${overrides.join('، ')} — ${overrideReason}`, data: { deliverable_id: d.id, overrides } });
    notifyCompany(getById(r.id), { type: 'request.deliverable', title: `جاهز للمراجعة — ${r.code}`, body: d.title, email: 'deliverable', focus: '?focus=deliverable', admins: r.visibility === 'company' });
    return svc.staffDetail(r.id, actor);
  }
  /** سحب تسليم أُرسل (A) */
  function withdrawDeliverable(did, body = {}, actor, ctx) {
    const d = deliverableById(did);
    if (d.status !== 'released') throw new ApiError(409, 'التسليم ليس مرسلًا.', 'deliverable_state');
    if (d.decision === 'accepted') throw new ApiError(409, 'اعتمدت الشركة هذا التسليم؛ لا يُسحب.', 'deliverable_state');
    const reason = v.str(body.reason, 'سبب السحب', { required: true, max: 500 });
    const r = getById(d.request_id);
    const t = nowIso();
    db.tx(() => {
      db.update('company_deliverables', d.id, { status: 'withdrawn', withdrawn_at: t, withdraw_reason: reason, updated_at: t });
      const cur = getById(r.id);
      if (d.final && cur.status === 'delivered') db.update('company_requests', r.id, { status: 'in_progress', delivered_at: null, rev: cur.rev + 1, updated_at: t });
    });
    app.audit.log({ actor, ctx, type: 'company.deliverable_withdrawn', severity: 'warning', company_id: r.company_id, summary: `سحب التسليم ${d.version} من ${r.code}: ${reason}`, data: { deliverable_id: d.id } });
    notifyCompany(getById(r.id), { type: 'request.message', title: `سحب فريقكم القانوني تسليمًا — ${r.code}`, body: reason });
    return svc.staffDetail(r.id, actor);
  }
  /**
   * «تعبئة من الرأي المعتمد» (L-58) — حتمية بلا ذكاء اصطناعي ولا حفظ: الخلاصة = قسم «الخلاصة التنفيذية» إن وُجد وإلا أول جملتين،
   * التوصيات = خطوات المحامي للشركة، المخاطر = درجة مخاطر الطلب، النص = نص الرأي.
   */
  function prefill(id, body = {}) {
    const r = requireStaffRequest(id);
    if (!r.case_id) throw new ApiError(409, 'لم يبدأ العمل على الطلب بعد.', 'invalid_transition');
    const o = db.get("SELECT * FROM opinions WHERE id = ? AND case_id = ? AND status = 'approved'", Number(body.opinion_id) || 0, r.case_id);
    if (!o) throw badRequest('اختر رأيًا معتمدًا في ملف هذا الطلب', { fields: { opinion_id: 'اختر رأيًا معتمدًا' } });
    const text = String(o.body || '');
    const section = (names) => {
      const lines = text.split('\n');
      const isHeading = (l) => /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:الخلاصة التنفيذية|المخاطر|التوصيات|خطوات للشركة|الوقائع|التحليل|الرأي)\s*(?:\*\*)?\s*:?\s*$/u.test(l);
      const start = lines.findIndex((l) => names.some((n) => l.replace(/[#*:\s]/g, '').startsWith(n.replace(/\s/g, ''))) && isHeading(l));
      if (start < 0) return null;
      const out = [];
      for (let i = start + 1; i < lines.length; i++) {
        if (isHeading(lines[i])) break;
        out.push(lines[i]);
      }
      const s = out.join('\n').trim();
      return s || null;
    };
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!؟?])\s+/u).filter((x) => x.trim().length > 3);
    const summary = section(['الخلاصة التنفيذية']) || sentences.slice(0, 2).join(' ').trim();
    let recs = parseJson(o.client_steps, null);
    if (!Array.isArray(recs) || !recs.length) {
      const block = section(['التوصيات']) || section(['خطوات للشركة']);
      recs = block ? block.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)-])\s*/, '').trim()).filter(Boolean).slice(0, 10) : [];
    }
    return { summary: summary.slice(0, 3000), recommendations: recs, risk_level: r.risk_level || null, body: text, opinion_id: o.id };
  }

  /** اعتماد الشركة للتسليم النهائي (B10-29، L-55) */
  function acceptDeliverable(cu, company, code, did, body = {}) {
    const r = visibleByCode(cu, code);
    const d = db.get("SELECT * FROM company_deliverables WHERE id = ? AND request_id = ? AND status = 'released'", Number(did) || 0, r.id);
    if (!d) throw requestNotFound();
    const watcher = !!db.get('SELECT 1 FROM company_request_watchers WHERE request_id = ? AND company_user_id = ?', r.id, cu.id);
    if (cu.role !== 'company_admin' && r.submitted_by !== cu.id && !watcher) throw forbidden('يعتمد التسليم مرسل الطلب أو متابعوه أو مديرو البوابة.');
    if (d.decision === 'accepted' && r.status === 'closed') return companyView(cu, company, r);
    const rating = Number(body.rating);
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : null;
    // أغلق الفريق الطلب (أو أُغلق تلقائيًا) والشركة على صفحة قديمة: يُسجَّل الاعتماد والتقييم ويبقى الطلب مغلقًا (CS-9 → 200)
    if (r.status === 'closed' && d.final && !d.decision && ['staff_closed', 'auto_closed'].includes(r.resolution)) {
      const ok = Number.isInteger(rating) && rating >= 1 && rating <= 5;
      const t0 = nowIso();
      db.tx(() => {
        db.update('company_deliverables', d.id, { decision: 'accepted', decided_by_company_user_id: cu.id, decided_at: t0, rating: ok ? rating : null, feedback: comment || null, updated_at: t0 });
        if (ok) db.run('UPDATE company_requests SET rating = COALESCE(rating, ?), rev = rev + 1, updated_at = ? WHERE id = ?', rating, t0, r.id);
      });
      closeEngineCase(getById(r.id), 'answered', 'اعتمدت الشركة التسليم');
      companyActivity(r, cu, company, { type: 'company_request.accepted_by_company', summary: `اعتمدت ${company.name} التسليم على ${r.code} بعد إغلاقه${ok ? ` بتقييم ${rating}/5` : ''}`, data: { rating: ok ? rating : null } });
      return companyView(cu, company, getById(r.id));
    }
    if (!d.final || d.decision || r.status !== 'delivered') throw new ApiError(409, COMPANY_TEXT.deliverable_state, 'deliverable_state');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest('اختاروا تقييمًا من 1 إلى 5.', { fields: { rating: 'اختاروا تقييمًا من 1 إلى 5.' } });
    const canSave = SAVE_TO_MEMORY_TYPES.includes(r.type);
    const save = canSave && (body.save_to_memory === undefined ? true : v.bool(body.save_to_memory));
    let decision = null;
    if (body.record_decision && typeof body.record_decision === 'object') {
      if (cu.role !== 'company_admin') throw forbidden('يسجل القرار مديرو البوابة.');
      const topic = cleanLine(body.record_decision.topic, 200);
      const text = typeof body.record_decision.decision === 'string' ? body.record_decision.decision.trim().slice(0, 2000) : '';
      if (topic && text) decision = { topic, decision: text };
    }
    const t = nowIso();
    let memoryId = null;
    db.tx(() => {
      db.update('company_deliverables', d.id, { decision: 'accepted', decided_by_company_user_id: cu.id, decided_at: t, rating, feedback: comment || null, updated_at: t });
      const cur = getById(r.id);
      if (save) memoryId = app.companyMemory.createContractFromRequest(cur, d, { cu });
      if (decision) app.companyMemory.createPositionFromDecision(cur, decision, cu);
      db.update('company_requests', r.id, {
        status: 'closed',
        resolution: 'accepted',
        closed_at: t,
        rating,
        memory_item_id: memoryId ?? cur.memory_item_id ?? null,
        flags: withFlags(cur, memoryId ? ['memory_pending'] : [], ['changes_requested']),
        rev: cur.rev + 1,
        updated_at: t,
      });
      if (comment) db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'message', body: comment, author_company_user_id: cu.id, created_at: t });
    });
    closeEngineCase(getById(r.id), 'answered', comment ? truncate(comment, 300) : 'اعتمدت الشركة التسليم');
    const after = getById(r.id);
    companyActivity(after, cu, company, { type: 'company_request.accepted_by_company', summary: `اعتمدت ${company.name} التسليم على ${r.code} بتقييم ${rating}/5${memoryId ? ' وحفظت العقد في الذاكرة' : ''}`, data: { rating, memory_item_id: memoryId } });
    if (rating <= 2) {
      app.notifications.notifyStaff({ type: 'company_request.accepted_low_rating', title: `تقييم منخفض (${rating}/5) من ${company.name} — ${r.code}`, body: comment ? truncate(comment, 200) : null, link: `#/company-requests/${r.id}` }, { caseManagerId: accountManagerId(company) });
    }
    if (memoryId) notifyStaff(after, company, { type: 'company_request.memory_pending', title: `عقد جديد في الذاكرة القانونية لـ${company.name} بانتظار مراجعتك — ${r.code}` });
    return companyView(cu, company, after);
  }
  /** طلب تعديلات على التسليم النهائي (داخل نافذة التعديل وعدد الجولات) — دورة عمل جديدة في المتتبع (L-25) */
  function requestChanges(cu, company, code, did, body = {}) {
    const r = visibleByCode(cu, code);
    const d = db.get("SELECT * FROM company_deliverables WHERE id = ? AND request_id = ? AND status = 'released'", Number(did) || 0, r.id);
    if (!d) throw requestNotFound();
    const watcher = !!db.get('SELECT 1 FROM company_request_watchers WHERE request_id = ? AND company_user_id = ?', r.id, cu.id);
    if (cu.role !== 'company_admin' && r.submitted_by !== cu.id && !watcher) throw forbidden('يطلب التعديلات مرسل الطلب أو متابعوه أو مديرو البوابة.');
    if (!d.final || d.decision || r.status !== 'delivered') throw new ApiError(409, COMPANY_TEXT.deliverable_state, 'deliverable_state');
    const comment = typeof body.comment === 'string' ? body.comment.replace(/\r\n/g, '\n').trim() : '';
    if (!comment) throw badRequest('اكتبوا التعديلات المطلوبة.', { fields: { comment: 'اكتبوا التعديلات المطلوبة.' } });
    if (comment.length > 3000) throw badRequest('النص أطول من المسموح.', { fields: { comment: 'النص أطول من المسموح.' } });
    const terms = termsOf(r.company_id);
    const windowDays = Number(app.settings.get('b2b_revision_window_days')) || 30;
    if (Number(r.revision_count) >= Number(terms.revision_rounds ?? 0) || (r.delivered_at && Date.parse(addDays(r.delivered_at, windowDays)) < now().getTime())) {
      throw new ApiError(409, COMPANY_TEXT.revision_limit, 'revision_limit');
    }
    const t = nowIso();
    const hours = Math.max(1, (Number(r.delivery_window_hours) || slaFor(terms, r.priority).delivery_hours) * 0.5);
    const due = dueAt(t, hours, r.sla_clock, cals());
    db.tx(() => {
      db.update('company_deliverables', d.id, { decision: 'changes_requested', decided_by_company_user_id: cu.id, decided_at: t, feedback: comment, updated_at: t });
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'message', body: comment, author_company_user_id: cu.id, created_at: t });
      const cur = getById(r.id);
      db.update('company_requests', r.id, {
        status: 'in_progress',
        revision_count: (Number(cur.revision_count) || 0) + 1,
        delivery_due_at: due,
        flags: withFlags(cur, ['changes_requested']),
        staff_unread: (Number(cur.staff_unread) || 0) + 1,
        last_company_activity_at: t,
        rev: cur.rev + 1,
        updated_at: t,
      });
    });
    const after = getById(r.id);
    companyActivity(after, cu, company, { type: 'company_request.changes_requested', summary: `طلبت ${company.name} تعديلات على ${r.code}` });
    notifyStaff(after, company, { type: 'company_request.changes_requested', title: `طلبت ${company.name} تعديلات — ${r.code}`, body: truncate(comment, 200) });
    return companyView(cu, company, after);
  }

  /** الاعتذار عن الطلب (S): قبل القبول أو بعده؛ بعده يُرجع الطلب إلى رصيد الباقة (CS-19) */
  function decline(id, body = {}, actor, ctx) {
    const r = requireStaffRequest(id);
    checkRev(r, body);
    if (!['submitted', 'awaiting_company', 'in_progress'].includes(r.status)) throw new ApiError(409, 'لا يمكن الاعتذار عن الطلب في حالته الحالية.', 'invalid_transition');
    const kind = v.oneOf(body.kind, ['out_of_scope', 'conflict', 'not_legal', 'duplicate', 'other'], 'سبب الاعتذار', { required: true });
    const reason = v.str(body.reason_for_company, 'السبب كما تقرؤه الشركة', { required: true, min: 5, max: 1000 });
    const note = v.str(body.note, 'ملاحظة داخلية', { max: 2000 });
    const t = nowIso();
    db.tx(() => {
      db.run("UPDATE company_quotes SET status = 'withdrawn', updated_at = ? WHERE request_id = ? AND status = 'sent'", t, r.id);
      casUpdate(r, { status: 'declined', resolution: 'declined', resolution_kind: kind, resolution_note: reason, waiting_on: null, closed_at: t, confirm_due_at: null, ...resumePatch(r, t), ...firstResponsePatch(r, 'decline', t) }, { actor });
      if (note) db.insert('company_request_notes', { request_id: r.id, user_id: actor.id, body: note, created_at: t });
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'status', body: reason, author_user_id: actor.id, created_at: t });
    });
    closeEngineCase(getById(r.id), 'not_eligible', reason);
    if (r.accepted_at) app.companyBilling.releaseQuota(getById(r.id), { actor, ctx, reason: 'firm_declined' });
    activity(getById(r.id), actor, { type: 'company_request.declined', summary: `اعتذر الفريق عن ${r.code} (${kind})` });
    notifyCompany(getById(r.id), { type: 'request.declined', title: `اعتذرنا عن الطلب ${r.code}`, body: reason });
    return svc.staffDetail(r.id, actor);
  }
  const CLOSE_OUTCOME = { delivered: 'answered', resolved: 'resolved', withdrawn: 'client_withdrew', duplicate: 'duplicate' };
  /** إغلاق من الفريق (S) */
  function staffClose(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    checkRev(r, body);
    if (!['in_progress', 'delivered'].includes(r.status)) throw new ApiError(409, 'يُغلق الطلب بعد بدء العمل عليه؛ قبل ذلك استخدم «الاعتذار».', 'invalid_transition');
    const outcome = v.oneOf(body.outcome, Object.keys(CLOSE_OUTCOME), 'نتيجة الإغلاق', { required: true });
    const note = v.str(body.note_for_company, 'ملاحظة للشركة', { max: 1000 });
    const t = nowIso();
    db.tx(() => {
      casUpdate(r, { status: 'closed', resolution: 'staff_closed', resolution_kind: outcome, resolution_note: note, waiting_on: null, closed_at: t, ...resumePatch(r, t) }, { actor });
      if (note) db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'status', body: note, author_user_id: actor.id, created_at: t });
    });
    closeEngineCase(getById(r.id), CLOSE_OUTCOME[outcome], note);
    activity(getById(r.id), actor, { type: 'company_request.closed', summary: `أغلق الفريق ${r.code} (${outcome})` });
    notifyCompany(getById(r.id), { type: 'request.closed', title: `أُغلق الطلب ${r.code}`, body: note || null });
    return svc.staffDetail(r.id, actor);
  }
  /** إعادة الفتح (S) خلال 30 يومًا من الإغلاق */
  function reopen(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    checkRev(r, body);
    if (r.status !== 'closed') throw new ApiError(409, 'يُعاد فتح الطلبات المغلقة فقط.', 'invalid_transition');
    if (!r.closed_at || now().getTime() - Date.parse(r.closed_at) > REOPEN_DAYS * 86400000) throw new ApiError(409, 'مضى أكثر من 30 يومًا على إغلاق الطلب؛ اطلب من الشركة طلبًا جديدًا.', 'reopen_window');
    if (!r.case_id) throw new ApiError(409, 'لم يبدأ العمل على هذا الطلب.', 'invalid_transition');
    const reason = v.str(body.reason, 'سبب إعادة الفتح', { required: true, max: 500 });
    const t = nowIso();
    const terms = termsOf(r.company_id);
    const hours = Math.max(1, (Number(r.delivery_window_hours) || slaFor(terms, r.priority).delivery_hours) * 0.5);
    db.tx(() => {
      casUpdate(r, { status: 'in_progress', reopened_at: t, closed_at: null, resolution: null, resolution_kind: null, resolution_note: null, delivery_due_at: dueAt(t, hours, r.sla_clock, cals()), delivered_at: null }, { actor });
      db.insert('company_request_notes', { request_id: r.id, user_id: actor.id, body: `إعادة فتح: ${reason}`, created_at: t });
      db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'out', kind: 'status', body: 'أعاد فريقكم القانوني فتح الطلب لاستكمال العمل عليه.', author_user_id: actor.id, created_at: t });
    });
    const c = db.get('SELECT status FROM cases WHERE id = ?', r.case_id);
    if (c?.status === 'closed') app.cases.reopen(r.case_id, { note: reason }, actor, { viaCompanyRequest: true });
    activity(getById(r.id), actor, { type: 'company_request.reopened', summary: `أعاد الفريق فتح ${r.code}: ${truncate(reason, 160)}` });
    notifyCompany(getById(r.id), { type: 'request.message', title: `أُعيد فتح الطلب ${r.code}`, body: null });
    return svc.staffDetail(r.id, actor);
  }
  /** إقرار التصعيد (S) */
  function escalationAck(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    if (!r.escalated_at) throw new ApiError(409, 'لا يوجد تصعيد مفتوح على هذا الطلب.', 'invalid_transition');
    const note = v.str(body.note, 'ملاحظة', { max: 1000 });
    const t = nowIso();
    db.run('UPDATE company_requests SET escalated_at = NULL, escalation_acked_at = ?, rev = rev + 1, updated_at = ? WHERE id = ?', t, t, r.id);
    if (note) db.insert('company_request_notes', { request_id: r.id, user_id: actor.id, body: `إقرار التصعيد: ${note}`, created_at: t });
    activity(getById(r.id), actor, { type: 'company_request.escalation_ack', summary: `أقر الفريق تصعيد ${r.code}` });
    return svc.staffDetail(r.id, actor);
  }
  /** روابط الذاكرة بالطلب (S، 8.2.12) */
  function setMemoryLinks(id, body = {}, actor) {
    const r = requireStaffRequest(id);
    const ids = v.ids(body.memory_ids, 'عناصر الذاكرة');
    for (const mid of ids) if (!db.get('SELECT 1 FROM company_memory WHERE id = ? AND company_id = ?', mid, r.company_id)) throw badRequest('عنصر الذاكرة غير موجود في هذه الشركة');
    const t = nowIso();
    db.tx(() => {
      db.run("DELETE FROM company_request_memory WHERE request_id = ? AND linked_by_kind IN ('staff','ai_accepted')", r.id);
      for (const mid of ids) db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, linked_by, created_at) VALUES (?, ?, 'staff', ?, ?)", r.id, mid, actor.id, t);
    });
    activity(r, actor, { type: 'company_request.memory_links', summary: `ربط ${ids.length} عناصر من الذاكرة بـ${r.code}` });
    return svc.staffDetail(r.id, actor);
  }
  /** إغلاق تلقائي بعد التسليم بلا قرار (مهمة b2b.reminders) — فاعل النظام */
  function autoClose() {
    const days = Number(app.settings.get('b2b_auto_close_days')) || 7;
    const cutoff = new Date(now().getTime() - days * 86400000).toISOString();
    let n = 0;
    for (const r of db.all("SELECT * FROM company_requests WHERE status = 'delivered' AND delivered_at <= ?", cutoff)) {
      const t = nowIso();
      const res = db.run("UPDATE company_requests SET status = 'closed', resolution = 'auto_closed', closed_at = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND status = 'delivered'", t, t, r.id);
      if (!res.changes) continue;
      closeEngineCase(getById(r.id), 'answered', 'أُغلق تلقائيًا بعد التسليم');
      activity(getById(r.id), SYSTEM_ACTOR, { type: 'company_request.auto_closed', summary: `أُغلق ${r.code} تلقائيًا بعد ${arabicCount(days, ['يوم واحد', 'يومين', 'أيام', 'يومًا'])} من التسليم` });
      notifyCompany(getById(r.id), { type: 'request.closed', title: `أُغلق الطلب ${r.code}`, body: 'أُغلق الطلب تلقائيًا بعد التسليم. يمكنكم مراسلة فريقكم القانوني لأي ملاحظة.' });
      n += 1;
    }
    return n;
  }

  // ═════════════════════════ SRV-13: مهمتا مستوى الخدمة والتذكيرات ═════════════════════════
  /**
   * b2b.sla (كل 5 دقائق): «يقترب موعده» و«متأخر» لمراحل الرد الأول وتأكيد الموعد والتسليم — مرة واحدة لكل
   * (مرحلة، حالة، موعد) عبر company_request_alerts. المتأخر يصل مديري النظام أيضًا، ومعه بريد staff_alert (L-53).
   */
  function runSla() {
    const out = { at_risk: 0, late: 0 };
    const t = nowIso();
    for (const r of db.all("SELECT * FROM company_requests WHERE status IN ('submitted','in_progress') ORDER BY id")) {
      const s = staffSla(r);
      if (!s.phase || !s.due_at || !['at_risk', 'late'].includes(s.state)) continue;
      const key = `${s.phase}:${s.state}:${s.due_at}`;
      const ins = db.run('INSERT OR IGNORE INTO company_request_alerts (request_id, kind, key, created_at) VALUES (?, ?, ?, ?)', r.id, 'sla', key, t);
      if (!ins.changes) continue;
      const company = companyOf(r.company_id);
      const phaseLabel = label('company_sla_phase', s.phase);
      if (s.state === 'at_risk') {
        notifyStaff(r, company, { type: 'company_request.sla_at_risk', title: `طلب شركة يقترب موعده — ${r.code}`, body: `${company.name} · ${phaseLabel}` });
        out.at_risk += 1;
      } else {
        // المتأخر: المسؤول ومدير العلاقة ومديرو النظام (notifyStaff مع caseManagerId يضم المديرين) + بريد عاجل بلا عنوان الطلب
        app.notifications.notifyStaff({ type: 'company_request.sla_late', title: `طلب شركة متأخر — ${r.code}`, body: `${company.name} · ${phaseLabel}`, link: `#/company-requests/${r.id}` }, { caseManagerId: r.handler_id || accountManagerId(company) });
        if (r.handler_id && accountManagerId(company) && r.handler_id !== accountManagerId(company)) {
          app.notifications.notify([accountManagerId(company)], { type: 'company_request.sla_late', title: `طلب شركة متأخر — ${r.code}`, body: `${company.name} · ${phaseLabel}`, link: `#/company-requests/${r.id}` });
        }
        staffAlertEmail(r, company, `تأخر الرد على ${r.code} — ${company.name}`, `late:${s.phase}:${s.due_at}`);
        activity(r, SYSTEM_ACTOR, { type: 'company_request.sla_late', summary: `تأخر ${r.code} في مرحلة «${phaseLabel}»` });
        out.late += 1;
      }
    }
    return out;
  }

  /**
   * تذكير الشركة باستيضاح أو عرض سعر لم تُرد عليه بعد b2b_reminder_after_hours ساعة عمل، ثم بالمدة نفسها بعد كل
   * تذكير، حتى b2b_max_reminders (مفاتيح remind:<msg|quote>:<n> في company_request_alerts).
   */
  function remindCompanies() {
    const out = { clarifications: 0, quotes: 0 };
    const afterH = Math.max(1, Number(app.settings.get('b2b_reminder_after_hours')) || 16);
    const max = Math.max(0, Number(app.settings.get('b2b_max_reminders')) || 0);
    if (!max) return out;
    const c = cals();
    const t = nowIso();
    const due = (fromIso) => addBusinessMinutes(fromIso, afterH * 60, c.business) <= t;
    for (const m of db.all(
      `SELECT m.*, r.code FROM company_messages m JOIN company_requests r ON r.id = m.request_id
       WHERE m.kind = 'clarification' AND m.answered_at IS NULL AND r.status = 'awaiting_company' AND m.reminder_count < ?`,
      max,
    )) {
      if (!due(m.last_reminder_at || m.created_at)) continue;
      const n = Number(m.reminder_count) + 1;
      const ins = db.run('INSERT OR IGNORE INTO company_request_alerts (request_id, kind, key, created_at) VALUES (?, ?, ?, ?)', m.request_id, 'remind', `remind:msg${m.id}:${n}`, t);
      if (!ins.changes) continue;
      db.run('UPDATE company_messages SET reminder_count = ?, last_reminder_at = ? WHERE id = ?', n, t, m.id);
      notifyCompany(getById(m.request_id), { type: 'request.clarification', title: `تذكير: فريقكم القانوني يحتاج معلومة — ${m.code}`, email: 'clarification', focus: '?focus=action' });
      out.clarifications += 1;
    }
    for (const q of db.all(
      `SELECT q.*, r.code FROM company_quotes q JOIN company_requests r ON r.id = q.request_id
       WHERE q.status = 'sent' AND q.valid_until >= ? AND r.status = 'awaiting_company'`,
      t,
    )) {
      const sent = db.all("SELECT key, created_at FROM company_request_alerts WHERE request_id = ? AND kind = 'remind' AND key LIKE ? ORDER BY created_at", q.request_id, `remind:quote${q.id}:%`);
      if (sent.length >= max) continue;
      if (!due(sent.at(-1)?.created_at || q.sent_at || q.created_at)) continue;
      const ins = db.run('INSERT OR IGNORE INTO company_request_alerts (request_id, kind, key, created_at) VALUES (?, ?, ?, ?)', q.request_id, 'remind', `remind:quote${q.id}:${sent.length + 1}`, t);
      if (!ins.changes) continue;
      notifyCompany(getById(q.request_id), { type: 'request.quote', title: `تذكير: عرض سعر بانتظار موافقتكم — ${q.code}`, email: 'quote', focus: '?focus=action', admins: true });
      out.quotes += 1;
    }
    return out;
  }

  Object.assign(svc, {
    // أدوات تشاركها الذاكرة القانونية (SRV-12): عرض المستندات، والرفع على مراحل، وحذف ملفات القرص
    companyDocView,
    staffDocView,
    takeUploads,
    markUsed,
    unlinkStored,
    notifyStaffAbout: notifyStaff,
    staffAlertEmail,
    lawyerRedactor,
    accept: acceptRequest,
    acceptInput,
    suggestLawyers,
    assignDefaults,
    onAssignmentCreated,
    setMemoryGrants,
    lawyerBlock,
    lawyerView,
    addWorkFiles,
    deleteWorkFile,
    clarificationFromInfo,
    clarify,
    sendQuote,
    withdrawQuote,
    approveQuote,
    rejectQuote,
    expireQuotes,
    runAcceptPlan,
    createDeliverable,
    updateDeliverable,
    precheck,
    releaseDeliverable,
    withdrawDeliverable,
    prefill,
    acceptDeliverable,
    requestChanges,
    decline,
    close: staffClose,
    reopen,
    escalationAck,
    setMemoryLinks,
    autoClose,
    closeEngineCase,
    runSla,
    remindCompanies,
  });

  // مهمة دورية: طلبات جديدة لم تُفرز (بعد إعادة التشغيل مثلًا) — الحد التلقائي يُعد من ai_usage فلا تكرار مفرط
  app.jobs?.register('b2b.triage', {
    everyMinutes: 5,
    label: 'فرز طلبات الشركات الجديدة',
    deferred: (r) => !!r?.deferred,
    run: async () => {
      if (app.settings.get('b2b_enabled') === false) return { deferred: true };
      let n = 0;
      for (const id of app.ai?.companyAi?.pendingWithoutTriage?.() || []) {
        try {
          if (await app.ai.triageCompanyRequest(id, null, { reason: 'job' })) n += 1;
        } catch (e) {
          app.log('b2b.triage', e);
        }
      }
      return { triaged: n };
    },
  });

  // b2b.reminders (كل ساعة): تذكير الشركات بالاستيضاحات والعروض، انتهاء العروض، الإغلاق التلقائي بعد التسليم، ودورة حياة
  // الشركات (نهاية الفترة التجريبية وتنبيهها، وانتهاء الاشتراكات اليدوية — CO-20)
  app.jobs?.register('b2b.reminders', {
    everyMinutes: 60,
    label: 'خدمة الشركات: التذكيرات وانتهاء العروض والإغلاق التلقائي والفترات التجريبية والاشتراكات',
    deferred: (r) => !!r?.deferred,
    run: async () => {
      if (app.settings.get('b2b_enabled') === false) return { deferred: true };
      return { reminders: remindCompanies(), quotes_expired: expireQuotes(), auto_closed: autoClose(), lifecycle: app.companies.runLifecycle?.() || null };
    },
  });
  // b2b.sla (كل 5 دقائق): تنبيهات «يقترب موعده» و«متأخر» لفريق المكتب
  app.jobs?.register('b2b.sla', {
    everyMinutes: 5,
    label: 'خدمة الشركات: تنبيهات مواعيد الرد والتسليم',
    deferred: (r) => !!r?.deferred,
    run: async () => {
      if (app.settings.get('b2b_enabled') === false) return { deferred: true };
      return runSla();
    },
  });

  return svc;
}

/** تسميات المراحل لفريق المكتب (staff_label من الكتالوج) */
const STAFF_STAGE = {
  received: 'بانتظار الفرز',
  needs_you: 'بانتظار رد الشركة',
  approval: 'بانتظار موافقة الشركة',
  working: 'جارٍ العمل',
  final_review: 'مراجعة نهائية',
  delivered: 'سُلِّم — بانتظار اعتماد الشركة',
  closed: 'مكتمل',
  declined: 'اعتذرنا عنه',
  cancelled: 'ملغى',
};
