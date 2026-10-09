// الإصدار 10 — الذاكرة القانونية لكل شركة والأطراف المتعاملة (B10-39…B10-43، L-51، L-55، L-57، CS-15، CS-18، CS-22).
//
// المحتوى: عناصر الذاكرة (عقود، نماذج، تراخيص، قرارات، مواقف، مفوَّضون، سياسات، نزاعات، مواعيد) للبوابة ولفريق المكتب،
// والأطراف المتعاملة (ضمنية من حقول الطلبات والعناصر)، ومستندات العناصر (من الرفع على مراحل للبوابة، وملفات الفريق)،
// والمواعيد المهمة، والأرشفة، والحذف النهائي بترتيب ثابت (لمدير النظام)، ومهمة التذكيرات b2b.memory.
//
// قواعد معيارية:
//  - البوابة تقرأ الذاكرة عبر readableMemorySql فقط، والأطراف عبر visibleCounterpartySql، والطلبات المرتبطة عبر
//    visibleRequestSql (L-51). غير المقروء = 404 بنفس جسم غير الموجود.
//  - عرض البوابة لا يحوي staff_notes ولا matter_id ولا created_by_user_id (B10 §7.6).
//  - العضو يضيف العقود والنماذج والتراخيص والمواعيد فقط ويعدّل ما أضافه هو؛ «اطلاع فقط» لا يكتب؛ مدير البوابة كل شيء.
//  - مستخدم الشركة لا يدخل documents.save ولا السجل كفاعل (L-19): مستندات البوابة تأتي من الرفع على مراحل.
//  - مهمة التذكيرات: «مرة في اليوم بعد 8 صباحًا بتوقيت القاهرة» تُقرأ من job_runs؛ لكل عنصر في معاملة واحدة تُسجَّل
//    صفوف كل المواعيد المستحقة ويُرسل أحدثها فقط، والتجديد التلقائي «مقارنة ثم تبديل» على end_date (CS-15).
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, now, normalizeArabic, parseJson, badRequest, notFound, forbidden, ApiError, v, cairoDayKey, arabicCount, arabicDate, truncate } from '../util.js';
import { LABELS } from '../constants.js';
import {
  computeMemoryDates, memoryKindByKey, TYPE_FIELDS, validateMemory, MEMORY_KIND_KEYS, MEMBER_MEMORY_KINDS, MEMORY_FIELDS,
  addDaysKey, addMonthsKey, isDateKey, cairoToday,
} from '../../public/assets/js/lib/company-catalog-fields.js';
import { readableMemorySql, visibleCounterpartySql, visibleRequestSql, companyActor, SYSTEM_ACTOR } from './companies.js';

const label = (group, key) => LABELS[group]?.[key] || key || '';
const major = (minor) => (minor === null || minor === undefined ? null : Math.round(Number(minor)) / 100);
const DAYS_FORMS = ['يوم واحد', 'يومين', 'أيام', 'يومًا'];
const PER_ITEM_DOCS = 10;
const PER_CALL = 5;
const CREATES_PER_DAY = 100;
const COUNTERPARTY_KINDS = Object.keys(LABELS.company_counterparty_kind || { other: 1 });
/** حالات لا تذكير لها ولا ظهور في «المواعيد المهمة» */
const TERMINAL = new Set(['expired', 'terminated', 'retired', 'superseded', 'revoked', 'cancelled', 'done', 'settled', 'won', 'lost', 'closed', 'draft']);
const DATE_KIND_LABEL = { notice: 'آخر موعد للإخطار', end: 'انتهاء', next: 'موعد' };

export const MEMORY_TEXT = Object.freeze({
  not_found: 'العنصر غير موجود في ذاكرتكم القانونية.',
  kind_not_allowed: 'لا يمكنكم إضافة هذا النوع إلى الذاكرة القانونية؛ تواصلوا مع مديري البوابة في شركتكم.',
  own_items_only: 'يعدّل العضو ما أضافه بنفسه فقط.',
  fields: 'راجعوا الحقول المظللة.',
  documents_limit: 'وصل هذا العنصر للحد الأقصى من المستندات (10 مستندات).',
  document_required: 'أرفقوا ملف النموذج المعتمد.',
  daily_limit: 'أضفتم عناصر كثيرة إلى الذاكرة اليوم؛ حاولوا غدًا أو تواصلوا مع فريقكم القانوني.',
  archived: 'هذا العنصر مؤرشف.',
});

/** الاسم الموحَّد لطرف (للتفرد داخل الشركة) */
export function counterpartyNorm(name) {
  const s = ` ${normalizeArabic(String(name ?? '')).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return s
    .replace(/ (?:شركه|مؤسسه|ش م م)(?= )/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** نص البحث لعنصر ذاكرة (العنوان والملخص واسم الطرف وقيم الحقول النصية وأسماء مستنداته) */
export function memorySearchText(item, counterpartyName = '', docNames = []) {
  const data = typeof item?.data === 'string' ? parseJson(item.data, {}) : item?.data || {};
  const values = Object.entries(data)
    .filter(([k, x]) => k !== 'history' && k !== 'anchor_day' && (typeof x === 'string' || typeof x === 'number'))
    .map(([, x]) => x);
  return normalizeArabic([item?.title, item?.summary, counterpartyName, ...values, ...docNames].filter(Boolean).join(' '));
}

/**
 * G-R3: يوم المرساة لتكرار شهري/سنوي — المحفوظ في data.anchor_day ما دام التاريخ الحالي هو نفسه مقصوصًا على آخر الشهر
 * (31 ← 28 فبراير)، وإلا يوم التاريخ الحالي (تاريخ أدخله المستخدم أو عدّله).
 */
export function anchorDayOf(d, key) {
  const day = Number(String(key).slice(8, 10));
  const a = Number(d?.anchor_day);
  if (Number.isInteger(a) && a > day && a <= 31) {
    const last = new Date(Date.UTC(Number(String(key).slice(0, 4)), Number(String(key).slice(5, 7)), 0)).getUTCDate();
    if (day === last) return a;
  }
  return day;
}

export function createCompanyMemory(app) {
  const { db, config } = app;
  const reqs = () => app.companyRequests;
  const since = (ms) => new Date(now().getTime() - ms).toISOString();

  // ───────────────────────── أدوات ─────────────────────────
  function getRow(id) {
    return db.get('SELECT * FROM company_memory WHERE id = ?', Number(id) || 0) || null;
  }
  /** عنصر مقروء للمستخدم (غير المقروء = 404 بنفس الجسم) */
  function readable(cu, id, { includeArchived = false } = {}) {
    const mem = readableMemorySql(cu, 'm');
    const m = db.get(`SELECT m.* FROM company_memory m WHERE m.id = ? AND ${mem.sql}${includeArchived ? '' : ' AND m.archived_at IS NULL'}`, Number(id) || 0, ...mem.params);
    if (!m) throw new ApiError(404, MEMORY_TEXT.not_found, 'not_found');
    return m;
  }
  function staffItem(mid) {
    const m = getRow(mid);
    if (!m) throw notFound('عنصر الذاكرة غير موجود');
    return m;
  }
  const dataOf = (m) => {
    const d = parseJson(m.data, {});
    return d && typeof d === 'object' ? d : {};
  };
  const remindOf = (m) => {
    const own = parseJson(m.remind_days, null);
    if (Array.isArray(own) && own.length) return own.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
    const all = app.settings.get('b2b_memory_remind_days') || {};
    const list = all[m.kind] || all.other || memoryKindByKey(m.kind)?.remind_days || [30, 7];
    return [...list].map(Number).filter((n) => Number.isInteger(n) && n >= 0);
  };
  const cpRow = (id) => (id ? db.get('SELECT id, name, kind FROM company_counterparties WHERE id = ?', id) : null);
  const entityRow = (id) => (id ? db.get('SELECT id, name FROM company_entities WHERE id = ?', id) : null);
  function docsOf(mid) {
    return db.all('SELECT d.* FROM company_memory_documents md JOIN documents d ON d.id = md.document_id WHERE md.memory_id = ? ORDER BY d.id', mid);
  }
  function refreshSearch(mid) {
    const m = getRow(mid);
    if (!m) return;
    const cp = cpRow(m.counterparty_id);
    const docNames = docsOf(mid).flatMap((d) => [d.title, d.filename]);
    db.run('UPDATE company_memory SET search_norm = ? WHERE id = ?', memorySearchText(m, cp?.name || '', docNames), mid);
  }
  /** تاريخ العنصر كما يُعرض: بدأ، آخر موعد للإخطار، ينتهي، وسجل التجديد التلقائي */
  function datesOf(m) {
    const d = dataOf(m);
    return {
      start_date: m.start_date || null,
      end_date: m.end_date || null,
      notice_deadline: m.notice_deadline || null,
      next_date: m.next_date || null,
      history: Array.isArray(d.history) ? d.history.map((h) => ({ from: h.from || null, to: h.to || null, at: h.at || null })) : [],
    };
  }
  /** القيم المعروضة: data بلا history، والمبالغ بالجنيه */
  function dataView(m) {
    const d = { ...dataOf(m) };
    delete d.history;
    delete d.anchor_day;
    for (const k of Object.keys(d)) {
      if (k.endsWith('_minor')) {
        d[k.slice(0, -6)] = major(d[k]);
        delete d[k];
      }
    }
    return d;
  }
  function createdBy(m) {
    if (m.created_by_company_user_id) {
      const u = db.get('SELECT name FROM company_users WHERE id = ?', m.created_by_company_user_id);
      if (u) return { kind: 'user', name: u.name };
    }
    return { kind: 'team' };
  }
  /** ما يحق لمستخدم الشركة في العنصر (B10-39) */
  function canOf(cu, company, m) {
    const ro = app.companies.isReadOnly(company);
    const admin = cu.role === 'company_admin';
    const member = cu.role === 'member' && MEMBER_MEMORY_KINDS.includes(m.kind) && m.created_by_company_user_id === cu.id;
    const write = !ro && !m.archived_at && (admin || member);
    return { edit: write, archive: write, add_documents: write && docsOf(m.id).length < PER_ITEM_DOCS, start_request: !ro && ['company_admin', 'member'].includes(cu.role) };
  }
  /** صف القائمة (البوابة والإدارة) */
  function rowView(m, { staff = false } = {}) {
    const cp = cpRow(m.counterparty_id);
    const ent = entityRow(m.entity_id);
    const d = dataOf(m);
    const out = {
      id: m.id,
      kind: m.kind,
      kind_label: label('company_memory_kind', m.kind),
      title: m.title,
      status: m.status,
      status_label: label('company_memory_status', m.status),
      counterparty: cp ? { id: cp.id, name: cp.name } : null,
      entity: ent ? { id: ent.id, name: ent.name } : null,
      start_date: m.start_date || null,
      end_date: m.end_date || null,
      notice_deadline: m.notice_deadline || null,
      next_date: m.next_date || null,
      value: major(m.value_minor),
      currency: m.currency || null,
      renewal_type: m.kind === 'contract' ? d.renewal_type || null : null,
      our_role: m.kind === 'contract' ? d.our_role || null : null,
      // J-05: نوع النموذج (لاقتراح نموذج السرية المعتمد في طلب «اتفاقية سرية» فقط)
      template_kind: m.kind === 'template' ? d.template_kind || null : null,
      access: m.access,
      access_label: label('company_memory_access', m.access),
      archived: !!m.archived_at,
      documents_count: Number(db.value('SELECT COUNT(*) FROM company_memory_documents WHERE memory_id = ?', m.id)),
      updated_at: m.updated_at,
    };
    if (staff) {
      out.under_review = m.status === 'under_review' && !m.reviewed_at;
      out.source_request = m.source_request_id ? db.get('SELECT id, code FROM company_requests WHERE id = ?', m.source_request_id) || null : null;
    }
    return out;
  }
  /** صفحة العنصر للبوابة (B10 §7.6): بلا ملاحظات الفريق ولا matter_id ولا من أضافه من الفريق */
  function companyItemView(cu, company, m) {
    const vis = visibleRequestSql(cu, 'r');
    const requests = db
      .all(`SELECT r.* FROM company_request_memory l JOIN company_requests r ON r.id = l.request_id WHERE l.memory_id = ? AND ${vis.sql} ORDER BY r.id DESC`, m.id, ...vis.params)
      .map((r) => {
        const stage = reqs().stageOf(r);
        return { code: r.code, title: r.title, stage, stage_label: label('company_stage', stage) };
      });
    const srcVisible = m.source_request_id ? db.get(`SELECT r.code FROM company_requests r WHERE r.id = ? AND ${vis.sql}`, m.source_request_id, ...vis.params) : null;
    return {
      item: {
        ...rowView(m),
        summary: m.summary || null,
        data: dataView(m),
        dates: datesOf(m),
        remind_days: remindOf(m),
        reminder_text: ['contract', 'licence', 'person', 'key_date', 'dispute'].includes(m.kind) ? remindText(remindOf(m)) : null,
        created_by: createdBy(m),
        created_at: m.created_at,
        source_request: srcVisible ? { code: srcVisible.code } : null,
        can: canOf(cu, company, m),
      },
      documents: docsOf(m.id).map((d) => reqs().companyDocView(d)),
      requests,
    };
  }
  function staffItemView(m) {
    const reviewer = m.reviewed_by ? db.get('SELECT name FROM users WHERE id = ?', m.reviewed_by) : null;
    const staffCreator = m.created_by_user_id ? db.get('SELECT name FROM users WHERE id = ?', m.created_by_user_id) : null;
    const owner = m.owner_company_user_id ? db.get('SELECT id, name FROM company_users WHERE id = ?', m.owner_company_user_id) : null;
    return {
      item: {
        ...rowView(m, { staff: true }),
        summary: m.summary || null,
        data: dataView(m),
        dates: datesOf(m),
        remind_days: remindOf(m),
        remind_days_custom: Array.isArray(parseJson(m.remind_days, null)),
        staff_notes: m.staff_notes || null,
        matter_id: m.matter_id || null,
        owner: owner || null,
        created_by: m.created_by_user_id ? { kind: 'staff', name: staffCreator?.name || null } : createdBy(m),
        created_by_kind: m.created_by_kind,
        reviewed_at: m.reviewed_at || null,
        reviewed_by: reviewer?.name || null,
        archived_at: m.archived_at || null,
        created_at: m.created_at,
        grantable: memoryKindByKey(m.kind)?.grantable !== false,
      },
      documents: docsOf(m.id).map((d) => reqs().staffDocView(d)),
      requests: db
        .all('SELECT r.id, r.code, r.title, r.status FROM company_request_memory l JOIN company_requests r ON r.id = l.request_id WHERE l.memory_id = ? ORDER BY r.id DESC', m.id)
        .map((r) => ({ ...r, status_label: label('company_request_status', r.status) })),
      reminders: db.all('SELECT due_date, offset_days, created_at FROM company_memory_reminders WHERE memory_id = ? ORDER BY created_at DESC, offset_days LIMIT 50', m.id),
      grants: Number(db.value('SELECT COUNT(*) FROM assignment_memory_grants WHERE memory_id = ?', m.id)),
    };
  }
  /** «سنذكّركم قبل 60 و30 و7 أيام.» — المعدود يتبع آخر عدد، و1 و2 بلفظهما («ويوم واحد»، «ويومين») */
  function remindText(days) {
    const list = [...new Set(days.map(Number))].filter((n) => n > 0).sort((a, b) => b - a);
    if (!list.length) return null;
    if (list.length === 1) return `سنذكّركم قبل ${arabicCount(list[0], DAYS_FORMS)}.`;
    const noun = (n) => {
      const r = n % 100;
      if (r >= 3 && r <= 10) return 'أيام';
      if (r >= 11 && r <= 99) return 'يومًا';
      return 'يوم';
    };
    const join = (ns) => ns.map(String).join(' و');
    const last = list.at(-1);
    if (last <= 2) {
      const head = list.slice(0, -1);
      return `سنذكّركم قبل ${join(head)} ${noun(head.at(-1))} و${last === 1 ? 'يوم واحد' : 'يومين'}.`;
    }
    return `سنذكّركم قبل ${join(list)} ${noun(last)}.`;
  }

  /**
   * قيم العنصر بعد التحقق (validateMemory) + الطرف والكيان داخل الشركة. existing: العنصر الحالي عند التعديل.
   * staff: الإدارة (الوصول وكل الأنواع). يعيد { row, counterpartyName }.
   */
  function itemInput(companyId, kind, body, { existing = null, staff = false, admin = false, privateOrigin = false } = {}) {
    const partial = !!existing;
    const src = { ...(body || {}) };
    // صياغة البوابة: الحقول في data أو في الجذر
    if (src.data && typeof src.data === 'object') Object.assign(src, src.data);
    const { values, errors } = validateMemory(kind, src, { partial });
    if (Object.keys(errors).length) throw badRequest(MEMORY_TEXT.fields, { fields: errors });
    const row = {};
    if (values.title !== undefined) row.title = String(values.title).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    for (const k of ['start_date', 'end_date', 'value_minor', 'currency', 'summary']) if (values[k] !== undefined) row[k] = values[k];
    if (values.entity_id !== undefined) row.entity_id = values.entity_id ? app.companies.requireEntity(companyId, values.entity_id).id : null;
    if (values.remind_days !== undefined) row.remind_days = JSON.stringify(values.remind_days);
    if (values.access !== undefined) {
      if (!staff && !admin) throw forbidden('يحدد مديرو البوابة مَن يرى العنصر.');
      row.access = values.access;
    }
    // data: دمج مع القائم عند التعديل (history يبقى)
    const prevData = existing ? dataOf(existing) : {};
    if (Object.keys(values.data).length || !existing) row.data = JSON.stringify({ ...prevData, ...values.data });
    // G-R3: تاريخ يغيّره المستخدم يصبح هو المرساة الجديدة للتكرار
    if (existing && prevData.anchor_day !== undefined && ((row.start_date !== undefined && row.start_date !== existing.start_date) || (row.end_date !== undefined && row.end_date !== existing.end_date))) {
      const next = row.data ? JSON.parse(row.data) : { ...prevData };
      delete next.anchor_day;
      row.data = JSON.stringify(next);
    }
    let counterpartyName = null;
    if (values.counterparty !== undefined) {
      counterpartyName = values.counterparty || null;
      const access = row.access || existing?.access || memoryKindByKey(kind)?.default_access || 'all';
      row.counterparty_id = counterpartyName ? svc.upsertCounterparty(companyId, counterpartyName, { kind: 'other', privateOrigin: privateOrigin || access === 'admins' }) : null;
    }
    if (!existing && !row.title) throw badRequest(MEMORY_TEXT.fields, { fields: { title: 'هذا الحقل مطلوب.' } });
    return { row, counterpartyName };
  }
  /** التواريخ المحسوبة بعد الإدخال */
  function withDates(kind, merged) {
    const d = computeMemoryDates(kind, merged, { today: cairoToday(now()) });
    return { notice_deadline: d.notice_deadline, next_date: d.next_date };
  }
  function auditActivity(m, actor, e) {
    app.activity.log({ actor, company_id: m.company_id, ...e, data: { memory_id: m.id, kind: m.kind, ...(e.data || {}) } });
  }
  function companyAct(m, cu, company, e) {
    app.activity.log({ actor: { kind: 'company' }, company_id: m.company_id, company_user_id: cu.id, ...e, data: { memory_id: m.id, kind: m.kind, by: companyActor(cu, company).name, ...(e.data || {}) } });
  }
  function checkDaily(companyId) {
    const n = Number(db.value("SELECT COUNT(*) FROM company_memory WHERE company_id = ? AND created_by_kind = 'company' AND created_at >= ?", companyId, since(86400000)));
    if (n >= CREATES_PER_DAY) throw new ApiError(429, MEMORY_TEXT.daily_limit, 'rate_limited');
  }
  /** ربط ملفات مرحلية بالعنصر (L-27): للمستخدم نفسه، غير مستخدمة، ≤ 5 في المرة و≤ 10 للعنصر */
  function attachUploads(cu, m, uploadIds, t) {
    const ups = reqs().takeUploads(cu, uploadIds, { max: PER_CALL, t });
    if (!ups.length) return 0;
    const have = Number(db.value('SELECT COUNT(*) FROM company_memory_documents WHERE memory_id = ?', m.id));
    if (have + ups.length > PER_ITEM_DOCS) throw new ApiError(409, MEMORY_TEXT.documents_limit, 'memory_documents_limit');
    reqs().markUsed(ups, t);
    for (const u of ups) db.run('INSERT OR IGNORE INTO company_memory_documents (memory_id, document_id) VALUES (?, ?)', m.id, u.document_id);
    return ups.length;
  }
  /** ملفات الفريق (base64) أو مستندات قائمة في الشركة (document_ids) */
  function attachStaffFiles(m, company, body, actor, saved) {
    const ids = v.ids(body.document_ids, 'المستندات');
    // gate G7-02: مستند قائم يُضاف للذاكرة فقط إن كانت الشركة تراه بالفعل — ما رفعته هي، أو ملف تسليم أُرسل، أو مرفق رسالة
    // من الفريق، أو مستند في عنصر ذاكرة آخر — وبشرط ألا يوسّع الظهور (ملف طلب خاص أو عنصر للمديرين ← عنصر للمديرين فقط)
    const access = db.value('SELECT access FROM company_memory WHERE id = ?', m.id) || m.access || 'all';
    const privateReq = (rid) => rid && db.value('SELECT visibility FROM company_requests WHERE id = ?', rid) === 'private';
    for (const did of ids) {
      const d = db.get('SELECT * FROM documents WHERE id = ? AND (company_id = ? OR client_id = ?)', did, company.id, company.client_id);
      if (!d) throw badRequest('المستند ليس من ملفات هذه الشركة');
      const released = db.get("SELECT d.request_id FROM company_deliverable_documents dd JOIN company_deliverables d ON d.id = dd.deliverable_id WHERE dd.document_id = ? AND d.status = 'released' AND d.company_id = ? LIMIT 1", did, company.id);
      const sent = db.get("SELECT m.request_id FROM company_message_documents md JOIN company_messages m ON m.id = md.message_id WHERE md.document_id = ? AND m.company_id = ? LIMIT 1", did, company.id);
      const inMemory = db.all('SELECT cm.access FROM company_memory_documents md JOIN company_memory cm ON cm.id = md.memory_id WHERE md.document_id = ? AND cm.company_id = ? AND cm.id != ?', did, company.id, m.id);
      const fromCompany = d.uploaded_by_kind === 'client' && !!d.company_user_id;
      const reqId = released?.request_id ?? sent?.request_id ?? (fromCompany ? d.company_request_id : null);
      const seen = fromCompany || !!released || !!sent || inMemory.length > 0;
      const widens = access !== 'admins' && (privateReq(reqId) || (inMemory.length > 0 && !released && !sent && !fromCompany && inMemory.every((x) => x.access === 'admins')));
      if (!seen || widens) throw badRequest('هذا المستند لم يصل الشركة بعد (أو يصل لمديري البوابة فقط)؛ أرسله أولًا في تسليم أو رسالة، أو ارفعه من جديد.', { fields: { document_ids: 'مستند غير متاح للشركة' } });
    }
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length > PER_CALL) throw badRequest('الحد 5 ملفات في المرة');
    for (const f of files) {
      const did = app.documents.save(f || {}, { client_id: company.client_id, company_id: company.id, title: f?.title }, actor);
      saved.push(db.value('SELECT storage_key FROM documents WHERE id = ?', did));
      ids.push(did);
    }
    const have = Number(db.value('SELECT COUNT(*) FROM company_memory_documents WHERE memory_id = ?', m.id));
    if (have + ids.length > PER_ITEM_DOCS) throw new ApiError(409, 'وصل العنصر للحد الأقصى من المستندات (10 مستندات).', 'memory_documents_limit');
    // gate G7-02 (INV-B11): ملفات الفريق في الذاكرة تمر ببوابة أسماء المحامين (العنوان واسم الملف وبيانات الكاتب)
    if (app.companyDocGate?.companyFilesGate && ids.length) {
      const gate = app.companyDocGate.companyFilesGate({ companyId: company.id, documentIds: ids });
      const err = app.companyDocGate.gateError(gate, { docsReviewed: true });
      if (err) throw new ApiError(err.status, err.message, err.code, gate);
    }
    for (const did of ids) db.run('INSERT OR IGNORE INTO company_memory_documents (memory_id, document_id) VALUES (?, ?)', m.id, did);
    return ids.length;
  }
  const unlink = (keys) => {
    for (const k of keys) reqs().unlinkStored(k);
  };
  /** عند تأكيد الفريق لعقد حُفظ تلقائيًا: تُزال علامة memory_pending عن الطلب (L-55) */
  function clearPending(mid) {
    for (const r of db.all('SELECT id, flags FROM company_requests WHERE memory_item_id = ?', mid)) {
      const f = parseJson(r.flags, []);
      if (Array.isArray(f) && f.includes('memory_pending')) db.run('UPDATE company_requests SET flags = ?, rev = rev + 1 WHERE id = ?', JSON.stringify(f.filter((x) => x !== 'memory_pending')), r.id);
    }
  }
  /** قائمة بالتصفية (مشتركة بين البوابة والإدارة) */
  function listWhere(baseSql, baseParams, q = {}, { allowArchived = false } = {}) {
    const where = [baseSql];
    const params = [...baseParams];
    if (q.kind) {
      const kinds = String(q.kind).split(',').filter((k) => MEMORY_KIND_KEYS.includes(k));
      if (!kinds.length) throw badRequest('نوع غير معروف');
      where.push(`m.kind IN (${kinds.map(() => '?').join(',')})`);
      params.push(...kinds);
    }
    if (q.status) {
      const st = String(q.status).split(',').filter((s) => /^[a-z_]{2,30}$/.test(s));
      if (st.length) {
        where.push(`m.status IN (${st.map(() => '?').join(',')})`);
        params.push(...st);
      }
    }
    if (q.entity_id) {
      where.push('m.entity_id = ?');
      params.push(Number(q.entity_id) || 0);
    }
    if (q.counterparty_id) {
      where.push('m.counterparty_id = ?');
      params.push(Number(q.counterparty_id) || 0);
    }
    if (q.renewal_type && ['auto', 'manual', 'none'].includes(q.renewal_type)) {
      where.push("json_extract(m.data, '$.renewal_type') = ?");
      params.push(q.renewal_type);
    }
    if (q.due_within_days !== undefined && q.due_within_days !== '') {
      const n = Math.max(0, Math.min(Number(q.due_within_days) || 0, 3650));
      const today = cairoToday(now());
      where.push('m.next_date IS NOT NULL AND m.next_date >= ? AND m.next_date <= ?');
      params.push(today, addDaysKey(today, n));
    }
    if (!(allowArchived && (q.include_archived === '1' || q.include_archived === true || q.archived === '1'))) where.push('m.archived_at IS NULL');
    return { where: where.join(' AND '), params };
  }
  function filterQ(rows, q) {
    const nq = q ? normalizeArabic(String(q).trim()).replace(/\s+/g, ' ') : '';
    if (!nq) return rows;
    if (nq.length > 100) throw badRequest('نص البحث أطول من المسموح.');
    return rows.filter((m) => (m.search_norm || memorySearchText(m, cpRow(m.counterparty_id)?.name || '')).includes(nq));
  }
  const ORDER = "ORDER BY CASE WHEN m.next_date IS NULL THEN 1 ELSE 0 END, m.next_date, m.title, m.id";

  // ───────────────────────── التذكيرات (b2b.memory) ─────────────────────────
  /**
   * يمر على العناصر النشطة: يمرّر التواريخ التي فاتت (تجديد تلقائي، انتهاء، تكرار الموعد)، ثم يرسل أحدث تذكير مستحق.
   * لكل عنصر معاملة واحدة، وإشعار واحد على الأكثر في التشغيلة؛ صفوف company_memory_reminders تمنع التكرار.
   */
  function runReminders({ today = cairoToday(now()) } = {}) {
    const out = { checked: 0, reminded: 0, rolled: 0, expired: 0, done: 0 };
    const rows = db.all(
      `SELECT m.* FROM company_memory m JOIN companies c ON c.id = m.company_id
       WHERE m.archived_at IS NULL AND c.status != 'ended' AND (m.next_date IS NOT NULL OR m.end_date IS NOT NULL)
       ORDER BY m.id`,
    );
    for (const m0 of rows) {
      if (TERMINAL.has(m0.status)) continue;
      out.checked += 1;
      try {
        db.tx(() => {
          const res = processItem(m0, today);
          if (res.reminded) out.reminded += 1;
          if (res.rolled) out.rolled += 1;
          if (res.expired) out.expired += 1;
          if (res.done) out.done += 1;
        });
      } catch (e) {
        app.log('b2b.memory item', e);
      }
    }
    return out;
  }
  function processItem(m0, today) {
    let m = m0;
    const res = { reminded: false, rolled: false, expired: false, done: false };
    let notified = false;
    const company = db.get('SELECT * FROM companies WHERE id = ?', m.company_id);
    const d = dataOf(m);
    // 1) التواريخ التي فاتت
    if (m.kind === 'contract' && m.end_date && m.end_date < today) {
      const term = Number(d.term_months);
      if (d.renewal_type === 'auto' && Number.isInteger(term) && term > 0) {
        // تجديد تلقائي (P1): حلقة حتى end_date > اليوم، إشعار واحد، ومقارنة ثم تبديل على end_date
        let end = m.end_date;
        const history = Array.isArray(d.history) ? [...d.history] : [];
        let guard = 0;
        // G-R3: يوم المرساة يبقى (31 أغسطس ← 28 فبراير ← 31 أغسطس)، لا يُقصّ الأساس المحفوظ
        const anchor = anchorDayOf(d, m.end_date);
        while (end <= today && guard < 600) {
          const next = addMonthsKey(end, term, anchor);
          history.push({ from: end, to: next, at: today });
          end = next;
          guard += 1;
        }
        const data = { ...d, anchor_day: anchor, history: history.slice(-24) };
        const dates = computeMemoryDates('contract', { ...m, end_date: end, data }, { today });
        const ch = db.run(
          "UPDATE company_memory SET end_date = ?, data = ?, notice_deadline = ?, next_date = ?, status = CASE WHEN status IN ('renewed','expired') THEN 'active' ELSE status END, updated_at = ? WHERE id = ? AND end_date = ?",
          end,
          JSON.stringify(data),
          dates.notice_deadline,
          dates.next_date,
          nowIso(),
          m.id,
          m.end_date,
        );
        if (ch.changes) {
          res.rolled = true;
          m = getRow(m.id);
          notifyItem(company, m, { title: `تجدّد تلقائيًا: ${m.title}`, body: `تجدّد تلقائيًا حسب بنود العقد حتى ${arabicDate(`${end}T10:00:00Z`, { weekday: false })}.` });
          notified = true;
        }
      } else if (['active', 'renewed', 'under_review'].includes(m.status)) {
        db.run("UPDATE company_memory SET status = 'expired', next_date = NULL, updated_at = ? WHERE id = ? AND status = ?", nowIso(), m.id, m.status);
        res.expired = true;
        return res;
      }
    } else if ((m.kind === 'licence' || m.kind === 'person') && m.end_date && m.end_date < today) {
      if (!TERMINAL.has(m.status)) {
        db.run("UPDATE company_memory SET status = 'expired', next_date = NULL, updated_at = ? WHERE id = ?", nowIso(), m.id);
        res.expired = true;
      }
      return res;
    } else if (m.kind === 'key_date' && m.start_date && m.start_date < today) {
      const rec = d.recurrence;
      if (rec === 'yearly' || rec === 'monthly') {
        let date = m.start_date;
        let guard = 0;
        // G-R3: التكرار من يوم المرساة (29 فبراير يعود 29 في السنة الكبيسة، و31 يعود بعد الشهر القصير)
        const anchor = anchorDayOf(d, m.start_date);
        while (date < today && guard < 1200) {
          date = addMonthsKey(date, rec === 'yearly' ? 12 : 1, anchor);
          guard += 1;
        }
        const ch = db.run('UPDATE company_memory SET start_date = ?, next_date = ?, data = ?, updated_at = ? WHERE id = ? AND start_date = ?', date, date, JSON.stringify({ ...d, anchor_day: anchor }), nowIso(), m.id, m.start_date);
        if (ch.changes) {
          res.rolled = true;
          m = getRow(m.id);
        }
      } else {
        db.run("UPDATE company_memory SET status = 'done', next_date = NULL, updated_at = ? WHERE id = ? AND status = 'active'", nowIso(), m.id);
        res.done = true;
        return res;
      }
    }
    // 2) إعادة حساب next_date (فات آخر موعد للإخطار ← الانتهاء)
    const dates = computeMemoryDates(m.kind, m, { today });
    if (dates.next_date !== m.next_date || dates.notice_deadline !== m.notice_deadline) {
      db.run('UPDATE company_memory SET next_date = ?, notice_deadline = ? WHERE id = ?', dates.next_date, dates.notice_deadline, m.id);
      m = getRow(m.id);
    }
    const next = m.next_date;
    if (!next || !isDateKey(next) || next < today) return res;
    // 3) المواعيد المستحقة: صف لكل موعد مستحق، ويُرسل أحدثها فقط (أصغر إزاحة) — مرة واحدة في التشغيلة
    const due = remindOf(m).filter((off) => addDaysKey(next, -off) <= today);
    if (!due.length) return res;
    const t = nowIso();
    const fresh = [];
    for (const off of due) {
      const r = db.run('INSERT OR IGNORE INTO company_memory_reminders (memory_id, due_date, offset_days, created_at) VALUES (?, ?, ?, ?)', m.id, next, off, t);
      if (r.changes) fresh.push(off);
    }
    if (!fresh.length || notified) return res;
    const newest = Math.min(...due);
    if (!fresh.includes(newest)) return res;
    const days = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const dateKind = m.kind === 'contract' && next === m.notice_deadline ? 'notice' : ['contract', 'licence', 'person'].includes(m.kind) ? 'end' : 'next';
    const when = days === 0 ? 'اليوم' : `بعد ${arabicCount(days, DAYS_FORMS)}`;
    notifyItem(company, m, {
      title: `موعد يقترب: ${m.title}`,
      body: `${DATE_KIND_LABEL[dateKind]} ${arabicDate(`${next}T10:00:00Z`, { weekday: false })} — ${when}`,
      email: { template: 'renewal', vars: { kind_label: label('company_memory_kind', m.kind), date: arabicDate(`${next}T10:00:00Z`, { weekday: false }), days, memory_id: m.id } },
    });
    res.reminded = true;
    return res;
  }
  /** إشعار عنصر ذاكرة: مديرو البوابة + صاحب العنصر (إن كان يقرؤه)، ومدير العلاقة لدى الفريق */
  function notifyItem(company, m, { title, body, email = null }) {
    const ids = new Set(app.companyNotify.admins(company.id).map((u) => u.id));
    if (m.owner_company_user_id && m.access === 'all') {
      const o = db.get('SELECT id FROM company_users WHERE id = ? AND company_id = ? AND active = 1', m.owner_company_user_id, company.id);
      if (o) ids.add(o.id);
    }
    app.companyNotify.notify([...ids], { companyId: company.id, type: 'memory.renewal', title, body, link: `#/memory/item/${m.id}`, email });
    const mgr = app.companies.accountManagerOf(company);
    if (mgr) {
      app.notifications.notify([mgr.id], {
        type: 'company.renewal',
        title: truncate(`موعد يقترب لدى ${company.name}: ${m.title}`, 120),
        body,
        link: `#/companies/${company.id}`,
      });
    }
  }

  const svc = {
    MEMORY_TEXT,
    counterpartyNorm,
    memorySearchText,
    refreshSearch,
    runReminders,
    remindOf,

    /**
     * طرف ضمني من حقل في طلب أو عنصر ذاكرة (B10-40). privateOrigin: نشأ من طلب خاص أو عنصر لمديري البوابة؛ يبقى
     * private_only حتى يرد في طلب مشترك أو عنصر مقروء للجميع (CS-22). يعيد معرّف الطرف أو null.
     */
    upsertCounterparty(companyId, name, { kind = 'other', privateOrigin = false } = {}) {
      const clean = String(name ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      const norm = counterpartyNorm(clean);
      if (!clean || norm.length < 2) return null;
      const t = nowIso();
      const prev = db.get('SELECT id, private_only, kind FROM company_counterparties WHERE company_id = ? AND name_norm = ?', companyId, norm);
      if (prev) {
        if (prev.private_only && !privateOrigin) db.run('UPDATE company_counterparties SET private_only = 0, updated_at = ? WHERE id = ?', t, prev.id);
        if (prev.kind === 'other' && kind !== 'other') db.run('UPDATE company_counterparties SET kind = ?, updated_at = ? WHERE id = ?', kind, t, prev.id);
        return prev.id;
      }
      return db.insert('company_counterparties', { company_id: companyId, name: clean, name_norm: norm, kind, private_only: privateOrigin ? 1 : 0, created_at: t, updated_at: t });
    },

    /**
     * حفظ العقد في الذاكرة عند اعتماد التسليم (L-55): عنصر «عقد» بحالة «قيد المراجعة»، حقوله من حقول الطلب (الطرف الآخر،
     * القيمة، العملة، الكيان)، ومستنداته مستندات التسليم النهائي، ووصوله «مديرو البوابة فقط» إن كان الطلب خاصًا.
     * يعيد معرّف العنصر.
     */
    createContractFromRequest(r, deliverable, { cu = null } = {}) {
      const fields = parseJson(r.fields, {}) || {};
      const t = nowIso();
      const cpName = fields.counterparty_name || null;
      const cpId = cpName ? svc.upsertCounterparty(r.company_id, cpName, { kind: 'other', privateOrigin: r.visibility === 'private' }) : null;
      const data = {};
      if (fields.contract_kind) data.contract_kind = fields.contract_kind;
      if (fields.our_role) data.our_role = fields.our_role;
      if (fields.governing_law) data.governing_law = fields.governing_law;
      if (r.type === 'nda') {
        data.contract_kind = 'other';
        if (fields.duration_months) data.term_months = fields.duration_months;
      }
      const value = Number(fields.contract_value);
      const kindLabel = fields.contract_kind ? TYPE_FIELDS.contract_review.find((f) => f.key === 'contract_kind')?.options?.find((o) => o.key === fields.contract_kind)?.label : null;
      const title = r.type === 'nda' ? `اتفاقية سرية${cpName ? ` مع ${cpName}` : ''}` : `عقد${kindLabel ? ` ${kindLabel}` : ''}${cpName ? ` مع ${cpName}` : ''}`;
      const item = {
        company_id: r.company_id,
        kind: 'contract',
        title: (title.trim() === 'عقد' ? String(r.title || 'عقد') : title).slice(0, 200),
        entity_id: r.entity_id || null,
        counterparty_id: cpId,
        status: 'under_review',
        value_minor: Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null,
        currency: Number.isFinite(value) && value > 0 ? fields.currency || 'EGP' : null,
        summary: deliverable?.summary ? String(deliverable.summary).slice(0, 2000) : null,
        data: JSON.stringify(data),
        tags: '[]',
        access: r.visibility === 'private' ? 'admins' : memoryKindByKey('contract')?.default_access || 'all',
        owner_company_user_id: cu?.id ?? r.submitted_by,
        source_request_id: r.id,
        created_by_kind: 'system',
        created_by_company_user_id: cu?.id ?? null,
        created_at: t,
        updated_at: t,
      };
      const dates = computeMemoryDates('contract', item);
      item.notice_deadline = dates.notice_deadline;
      item.next_date = dates.next_date;
      item.search_norm = memorySearchText(item, cpName || '');
      const id = db.insert('company_memory', item);
      if (deliverable?.id) {
        for (const d of db.all('SELECT document_id FROM company_deliverable_documents WHERE deliverable_id = ?', deliverable.id)) {
          db.run('INSERT OR IGNORE INTO company_memory_documents (memory_id, document_id) VALUES (?, ?)', id, d.document_id);
        }
      }
      db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, created_at) VALUES (?, ?, 'company', ?)", r.id, id, t);
      refreshSearch(id);
      return id;
    },

    /** قرار الشركة عند الاعتماد كموقف معتمد (P1، B10-29) — وصوله لمديري البوابة فقط */
    createPositionFromDecision(r, { topic, decision }, cu) {
      const t = nowIso();
      const item = {
        company_id: r.company_id,
        kind: 'position',
        title: String(topic).slice(0, 200),
        entity_id: r.entity_id || null,
        status: 'active',
        summary: String(decision).slice(0, 2000),
        data: JSON.stringify({ topic: String(topic).slice(0, 200), decision: String(decision).slice(0, 2000), decided_at: t.slice(0, 10), decided_by_text: cu?.name || null }),
        tags: '[]',
        access: 'admins',
        owner_company_user_id: cu?.id ?? null,
        source_request_id: r.id,
        created_by_kind: 'company',
        created_by_company_user_id: cu?.id ?? null,
        created_at: t,
        updated_at: t,
      };
      item.search_norm = memorySearchText(item);
      const id = db.insert('company_memory', item);
      db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, created_at) VALUES (?, ?, 'company', ?)", r.id, id, t);
      return id;
    },

    // ===================== البوابة =====================
    /** GET /api/company/memory — القائمة + أعداد كل نوع للمحور (U10-59) */
    list(cu, company, q = {}) {
      const mem = readableMemorySql(cu, 'm');
      const { where, params } = listWhere(mem.sql, mem.params, q, { allowArchived: cu.role === 'company_admin' });
      const rows = filterQ(db.all(`SELECT m.* FROM company_memory m WHERE ${where} ${ORDER} LIMIT 2000`, ...params), q.q);
      const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500);
      const today = cairoToday(now());
      const soonTo = addDaysKey(today, 60);
      const counts = {};
      for (const r of db.all(
        `SELECT m.kind, COUNT(*) AS n, SUM(CASE WHEN m.next_date >= ? AND m.next_date <= ? AND m.status NOT IN ('expired','terminated','retired','superseded','revoked','cancelled','done','closed') THEN 1 ELSE 0 END) AS soon
         FROM company_memory m WHERE ${mem.sql} AND m.archived_at IS NULL GROUP BY m.kind`,
        today,
        soonTo,
        ...mem.params,
      )) {
        counts[r.kind] = { total: Number(r.n), soon: Number(r.soon) || 0 };
      }
      const cp = visibleCounterpartySql(cu, 'cp');
      return {
        items: rows.slice(0, limit).map((m) => rowView(m)),
        total: rows.length,
        counts,
        counterparties: Number(db.value(`SELECT COUNT(*) FROM company_counterparties cp WHERE ${cp.sql}`, ...cp.params)),
        entities: app.companies.entities(company.id).length,
        max_entities: app.companies.maxEntitiesOf(company.id),
        can: { create: !app.companies.isReadOnly(company) && ['company_admin', 'member'].includes(cu.role), kinds: cu.role === 'company_admin' ? MEMORY_KIND_KEYS : cu.role === 'member' ? MEMBER_MEMORY_KINDS : [] },
      };
    },
    /** GET /api/company/memory/:id */
    get(cu, company, id) {
      const m = readable(cu, id, { includeArchived: cu.role === 'company_admin' });
      return companyItemView(cu, company, m);
    },
    /** POST /api/company/memory — مدير البوابة أي نوع؛ العضو العقود والنماذج والتراخيص والمواعيد (B10-39) */
    create(cu, company, body = {}) {
      const kind = v.oneOf(body.kind, MEMORY_KIND_KEYS, 'النوع', { required: true });
      const admin = cu.role === 'company_admin';
      if (!admin && !MEMBER_MEMORY_KINDS.includes(kind)) throw forbidden(MEMORY_TEXT.kind_not_allowed);
      checkDaily(company.id);
      const meta = memoryKindByKey(kind);
      const uploadIds = body.upload_ids ?? body.uploads ?? [];
      if (meta?.requires_document && (!Array.isArray(uploadIds) || !uploadIds.length)) throw badRequest(MEMORY_TEXT.document_required, { fields: { upload_ids: MEMORY_TEXT.document_required } });
      const t = nowIso();
      const { row } = itemInput(company.id, kind, body, { admin });
      const access = admin ? row.access || meta?.default_access || 'all' : meta?.default_access || 'all';
      const full = {
        company_id: company.id,
        kind,
        status: kind === 'contract' && body.status === 'draft' ? 'draft' : 'active',
        data: '{}',
        tags: '[]',
        ...row,
        access,
        owner_company_user_id: cu.id,
        created_by_kind: 'company',
        created_by_company_user_id: cu.id,
        created_at: t,
        updated_at: t,
      };
      Object.assign(full, withDates(kind, full));
      const id = db.tx(() => {
        const mid = db.insert('company_memory', full);
        attachUploads(cu, { id: mid }, uploadIds, t);
        return mid;
      });
      refreshSearch(id);
      const m = getRow(id);
      companyAct(m, cu, company, { type: 'company_memory.created', summary: `أضافت ${company.name} عنصرًا إلى الذاكرة القانونية: ${label('company_memory_kind', kind)}` });
      return companyItemView(cu, company, m);
    },
    /** PATCH /api/company/memory/:id */
    update(cu, company, id, body = {}) {
      const m = readable(cu, id);
      if (!canOf(cu, company, m).edit) throw forbidden(cu.role === 'member' ? MEMORY_TEXT.own_items_only : 'غير مصرح لكم بتعديل هذا العنصر.');
      const admin = cu.role === 'company_admin';
      const { row } = itemInput(company.id, m.kind, body, { existing: m, admin });
      if (body.status !== undefined) {
        const statuses = memoryKindByKey(m.kind).statuses.map((s) => s.key).filter((s) => s !== 'under_review');
        row.status = v.oneOf(body.status, statuses, 'الحالة', { required: true });
      }
      const merged = { ...m, ...row };
      Object.assign(row, withDates(m.kind, merged));
      row.updated_at = nowIso();
      const sets = Object.keys(row);
      db.run(`UPDATE company_memory SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND company_id = ?`, ...sets.map((k) => row[k]), m.id, company.id);
      refreshSearch(m.id);
      const after = getRow(m.id);
      companyAct(after, cu, company, { type: 'company_memory.updated', summary: `عدّلت ${company.name} عنصرًا في الذاكرة القانونية`, data: { fields: sets } });
      return companyItemView(cu, company, after);
    },
    /** POST /api/company/memory/:id/documents {upload_ids ≤ 5} (≤ 10 للعنصر) */
    addDocuments(cu, company, id, body = {}) {
      const m = readable(cu, id);
      if (!canOf(cu, company, m).edit) throw forbidden(cu.role === 'member' ? MEMORY_TEXT.own_items_only : 'غير مصرح لكم بتعديل هذا العنصر.');
      const ids = body.upload_ids;
      if (!Array.isArray(ids) || !ids.length) throw badRequest('اختاروا ملفًا واحدًا على الأقل.', { fields: { upload_ids: 'اختاروا ملفًا واحدًا على الأقل.' } });
      const t = nowIso();
      const n = db.tx(() => {
        const k = attachUploads(cu, m, ids, t);
        db.run('UPDATE company_memory SET updated_at = ? WHERE id = ?', t, m.id);
        return k;
      });
      refreshSearch(m.id);
      companyAct(m, cu, company, { type: 'company_memory.documents_added', summary: `أضافت ${company.name} مستندات إلى عنصر في الذاكرة القانونية (${n})` });
      return companyItemView(cu, company, getRow(m.id));
    },
    /** POST /api/company/memory/:id/archive — لا يظهر في القوائم ولا تُرسل تذكيراته؛ يستعيده الفريق */
    archive(cu, company, id) {
      const m = readable(cu, id);
      if (!canOf(cu, company, m).archive) throw forbidden(cu.role === 'member' ? MEMORY_TEXT.own_items_only : 'غير مصرح لكم بأرشفة هذا العنصر.');
      db.run('UPDATE company_memory SET archived_at = ?, updated_at = ? WHERE id = ? AND company_id = ?', nowIso(), nowIso(), m.id, company.id);
      companyAct(m, cu, company, { type: 'company_memory.archived', summary: `أرشفت ${company.name} عنصرًا من الذاكرة القانونية` });
      return { ok: true, id: m.id };
    },
    /** GET /api/company/key-dates?from=&to= → المواعيد من العناصر المقروءة (U10-64) */
    keyDates(cu, company, q = {}) {
      const today = cairoToday(now());
      const from = isDateKey(q.from) ? q.from : today;
      const to = isDateKey(q.to) ? q.to : addDaysKey(from, 60);
      if (to < from) throw badRequest('نهاية الفترة قبل بدايتها.');
      if (addDaysKey(from, 800) < to) throw badRequest('الفترة طويلة جدًا (سنتان على الأكثر).');
      const mem = readableMemorySql(cu, 'm');
      const where = [`${mem.sql}`, 'm.archived_at IS NULL'];
      const params = [...mem.params];
      if (q.kind && MEMORY_KIND_KEYS.includes(q.kind)) {
        where.push('m.kind = ?');
        params.push(q.kind);
      }
      const rows = db.all(
        `SELECT m.* FROM company_memory m WHERE ${where.join(' AND ')} AND (
           (m.end_date >= ? AND m.end_date <= ?) OR (m.notice_deadline >= ? AND m.notice_deadline <= ?) OR (m.next_date >= ? AND m.next_date <= ?))`,
        ...params,
        from,
        to,
        from,
        to,
        from,
        to,
      );
      const items = [];
      for (const m of rows) {
        if (TERMINAL.has(m.status)) continue;
        const seen = new Set();
        const push = (date, dateKind) => {
          if (!date || date < from || date > to || seen.has(date)) return;
          seen.add(date);
          items.push({ memory_id: m.id, kind: m.kind, kind_label: label('company_memory_kind', m.kind), title: m.title, date, date_kind: dateKind, date_kind_label: DATE_KIND_LABEL[dateKind] });
        };
        if (m.kind === 'contract') {
          push(m.notice_deadline, 'notice');
          push(m.end_date, 'end');
        } else if (m.kind === 'licence' || m.kind === 'person') push(m.end_date, 'end');
        else push(m.next_date, 'next');
      }
      items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.memory_id - b.memory_id));
      return { from, to, items };
    },
    /** GET /api/company/counterparties?q= (CS-22) */
    counterparties(cu, company, q = {}) {
      const cp = visibleCounterpartySql(cu, 'cp');
      const mem = readableMemorySql(cu, 'm');
      const vis = visibleRequestSql(cu, 'r');
      const nq = q.q ? counterpartyNorm(q.q) : '';
      const rows = db.all(`SELECT cp.* FROM company_counterparties cp WHERE ${cp.sql} ORDER BY cp.name LIMIT 1000`, ...cp.params).filter((c) => !nq || c.name_norm.includes(nq));
      return {
        items: rows.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          kind_label: label('company_counterparty_kind', c.kind),
          memory_items: Number(db.value(`SELECT COUNT(*) FROM company_memory m WHERE m.counterparty_id = ? AND m.archived_at IS NULL AND ${mem.sql}`, c.id, ...mem.params)),
          contracts: Number(db.value(`SELECT COUNT(*) FROM company_memory m WHERE m.counterparty_id = ? AND m.kind = 'contract' AND m.archived_at IS NULL AND ${mem.sql}`, c.id, ...mem.params)),
          requests: Number(db.value(`SELECT COUNT(*) FROM company_requests r WHERE ${vis.sql} AND r.search_norm LIKE ?`, ...vis.params, `%${c.name_norm.replace(/[%_]/g, ' ')}%`)),
        })),
      };
    },

    // ===================== فريق المكتب (8.2.15) =====================
    staffList(companyId, q = {}) {
      app.companies.require(companyId);
      const { where, params } = listWhere('m.company_id = ?', [companyId], q, { allowArchived: true });
      const rows = filterQ(db.all(`SELECT m.* FROM company_memory m WHERE ${where} ${ORDER} LIMIT 2000`, ...params), q.q);
      return {
        items: rows.map((m) => rowView(m, { staff: true })),
        total: rows.length,
        under_review: Number(db.value("SELECT COUNT(*) FROM company_memory WHERE company_id = ? AND status = 'under_review' AND archived_at IS NULL", companyId)),
      };
    },
    staffGet(mid) {
      return staffItemView(staffItem(mid));
    },
    /** POST /api/admin/companies/:id/memory (وPOST /api/admin/company-requests/:id/memory مع sourceRequest) */
    staffCreate(companyId, body = {}, actor, { sourceRequest = null } = {}) {
      const company = app.companies.require(companyId);
      const kind = v.oneOf(body.kind, MEMORY_KIND_KEYS, 'النوع', { required: true });
      const t = nowIso();
      const { row } = itemInput(company.id, kind, body, { staff: true, privateOrigin: sourceRequest?.visibility === 'private' });
      const meta = memoryKindByKey(kind);
      const statuses = meta.statuses.map((s) => s.key);
      const full = {
        company_id: company.id,
        kind,
        status: body.status ? v.oneOf(body.status, statuses, 'الحالة', { required: true }) : 'active',
        data: '{}',
        tags: '[]',
        ...row,
        access: row.access || (sourceRequest?.visibility === 'private' ? 'admins' : meta.default_access || 'all'),
        staff_notes: v.str(body.staff_notes, 'ملاحظات الفريق', { max: 4000 }),
        source_request_id: sourceRequest?.id ?? null,
        created_by_kind: 'staff',
        created_by_user_id: actor.id,
        reviewed_at: t,
        reviewed_by: actor.id,
        created_at: t,
        updated_at: t,
      };
      Object.assign(full, withDates(kind, full));
      const saved = [];
      let id;
      try {
        id = db.tx(() => {
          const mid = db.insert('company_memory', full);
          attachStaffFiles({ id: mid }, company, body, actor, saved);
          if (meta.requires_document && !Number(db.value('SELECT COUNT(*) FROM company_memory_documents WHERE memory_id = ?', mid))) {
            throw badRequest('أرفق ملف النموذج المعتمد', { fields: { files: 'أرفق ملف النموذج المعتمد' } });
          }
          if (sourceRequest) db.run("INSERT OR IGNORE INTO company_request_memory (request_id, memory_id, linked_by_kind, linked_by, created_at) VALUES (?, ?, 'staff', ?, ?)", sourceRequest.id, mid, actor.id, t);
          return mid;
        });
      } catch (e) {
        unlink(saved);
        throw e;
      }
      refreshSearch(id);
      const m = getRow(id);
      auditActivity(m, actor, { type: 'company_memory.created', company_request_id: sourceRequest?.id ?? null, summary: `أضاف الفريق عنصرًا إلى ذاكرة ${company.name}: ${label('company_memory_kind', kind)}` });
      return staffItemView(m);
    },
    /** PATCH /api/admin/company-memory/:mid — يشمل تأكيد العقد المحفوظ تلقائيًا (reviewed، L-55) */
    staffUpdate(mid, body = {}, actor) {
      const m = staffItem(mid);
      const { row } = itemInput(m.company_id, m.kind, body, { existing: m, staff: true });
      const statuses = memoryKindByKey(m.kind).statuses.map((s) => s.key);
      if (body.status !== undefined) row.status = v.oneOf(body.status, statuses, 'الحالة', { required: true });
      if (body.staff_notes !== undefined) row.staff_notes = v.str(body.staff_notes, 'ملاحظات الفريق', { max: 4000 });
      if (body.matter_id !== undefined) {
        const company = app.companies.require(m.company_id);
        const matter = body.matter_id ? db.get('SELECT id FROM matters WHERE id = ? AND client_id = ?', Number(body.matter_id) || 0, company.client_id) : null;
        if (body.matter_id && !matter) throw badRequest('القضية ليست من ملفات هذه الشركة');
        row.matter_id = matter?.id ?? null;
      }
      if (body.archived === false && m.archived_at) row.archived_at = null; // استعادة
      const confirm = v.bool(body.reviewed) || v.bool(body.confirm) || (row.status && row.status !== 'under_review');
      if (confirm && !m.reviewed_at) {
        row.reviewed_at = nowIso();
        row.reviewed_by = actor.id;
        if (m.status === 'under_review' && !row.status) row.status = 'active';
      }
      const merged = { ...m, ...row };
      Object.assign(row, withDates(m.kind, merged));
      row.updated_at = nowIso();
      const sets = Object.keys(row);
      db.tx(() => {
        db.run(`UPDATE company_memory SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...sets.map((k) => row[k]), m.id);
        if (row.reviewed_at || (row.status && row.status !== 'under_review')) clearPending(m.id);
      });
      refreshSearch(m.id);
      const after = getRow(m.id);
      auditActivity(after, actor, { type: confirm && !m.reviewed_at ? 'company_memory.reviewed' : 'company_memory.updated', summary: confirm && !m.reviewed_at ? 'أكّد الفريق عنصرًا في الذاكرة القانونية' : 'عدّل الفريق عنصرًا في الذاكرة القانونية', data: { fields: sets } });
      return staffItemView(after);
    },
    staffAddDocuments(mid, body = {}, actor) {
      const m = staffItem(mid);
      const company = app.companies.require(m.company_id);
      const saved = [];
      let n;
      try {
        n = db.tx(() => {
          const k = attachStaffFiles(m, company, body, actor, saved);
          db.run('UPDATE company_memory SET updated_at = ? WHERE id = ?', nowIso(), m.id);
          return k;
        });
      } catch (e) {
        unlink(saved);
        throw e;
      }
      refreshSearch(m.id);
      auditActivity(m, actor, { type: 'company_memory.documents_added', summary: `أضاف الفريق مستندات إلى عنصر في ذاكرة ${company.name} (${n})` });
      return staffItemView(getRow(m.id));
    },
    /** أرشفة أو استعادة ({restore:true}) */
    staffArchive(mid, body = {}, actor) {
      const m = staffItem(mid);
      const restore = v.bool(body.restore);
      db.run('UPDATE company_memory SET archived_at = ?, updated_at = ? WHERE id = ?', restore ? null : nowIso(), nowIso(), m.id);
      auditActivity(m, actor, { type: restore ? 'company_memory.restored' : 'company_memory.archived', summary: restore ? 'استعاد الفريق عنصرًا من أرشيف الذاكرة' : 'أرشف الفريق عنصرًا من الذاكرة القانونية' });
      return staffItemView(getRow(m.id));
    },
    /**
     * الحذف النهائي (A، CS-18) في معاملة واحدة بهذا الترتيب: منح المحامين ← روابط الطلبات ← التذكيرات ← صفوف مستندات
     * العنصر ← المستندات التي لا تشير إليها رسالة أو تسليم أو ملف أو طلب أو عنصر آخر (وإلا تُفصل وتبقى) ← العنصر.
     * الملفات تُحذف من القرص بعد نجاح المعاملة؛ والأعداد في سجل الأمان company.memory_purged.
     */
    purge(mid, actor, ctx = null) {
      const m = staffItem(mid);
      const company = app.companies.require(m.company_id);
      const keys = [];
      const counts = db.tx(() => {
        const c = { grants: 0, request_links: 0, reminders: 0, document_links: 0, documents_deleted: 0, documents_kept: 0 };
        c.grants = db.run('DELETE FROM assignment_memory_grants WHERE memory_id = ?', m.id).changes;
        c.request_links = db.run('DELETE FROM company_request_memory WHERE memory_id = ?', m.id).changes;
        c.reminders = db.run('DELETE FROM company_memory_reminders WHERE memory_id = ?', m.id).changes;
        const docs = db.all('SELECT d.* FROM company_memory_documents md JOIN documents d ON d.id = md.document_id WHERE md.memory_id = ?', m.id);
        c.document_links = db.run('DELETE FROM company_memory_documents WHERE memory_id = ?', m.id).changes;
        for (const d of docs) {
          const used =
            d.case_id ||
            d.company_request_id ||
            db.get('SELECT 1 FROM company_message_documents WHERE document_id = ?', d.id) ||
            db.get('SELECT 1 FROM company_deliverable_documents WHERE document_id = ?', d.id) ||
            db.get('SELECT 1 FROM company_memory_documents WHERE document_id = ?', d.id);
          if (used) {
            c.documents_kept += 1;
            continue;
          }
          db.run('DELETE FROM company_uploads WHERE document_id = ?', d.id);
          db.run('DELETE FROM documents WHERE id = ?', d.id);
          keys.push(d.storage_key);
          c.documents_deleted += 1;
        }
        // طلبات تشير إلى العنصر (حفظ تلقائي من تسليم): تُفصل وتزول علامة الانتظار
        clearPending(m.id);
        db.run('UPDATE company_requests SET memory_item_id = NULL WHERE memory_item_id = ?', m.id);
        db.run('DELETE FROM company_memory WHERE id = ?', m.id);
        return c;
      });
      unlink(keys);
      app.audit.log({
        actor,
        ctx,
        type: 'company.memory_purged',
        company_id: company.id,
        summary: `حذف نهائي لعنصر من ذاكرة ${company.name} (${label('company_memory_kind', m.kind)})`,
        data: { memory_id: m.id, kind: m.kind, ...counts },
      });
      return { ok: true, purged: m.id, counts };
    },

    // ───────── الأطراف (الإدارة) ─────────
    staffCounterparties(companyId, q = {}) {
      app.companies.require(companyId);
      const nq = q.q ? counterpartyNorm(q.q) : '';
      const rows = db.all('SELECT * FROM company_counterparties WHERE company_id = ? ORDER BY name', companyId).filter((c) => !nq || c.name_norm.includes(nq));
      return {
        items: rows.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          kind_label: label('company_counterparty_kind', c.kind),
          registry_no: c.registry_no || null,
          notes: c.notes || null,
          risk_level: c.risk_level || null,
          blocked: !!c.blocked,
          private_only: !!c.private_only,
          memory_items: Number(db.value('SELECT COUNT(*) FROM company_memory WHERE counterparty_id = ? AND archived_at IS NULL', c.id)),
          created_at: c.created_at,
        })),
      };
    },
    counterpartyFields(body, { partial = false } = {}) {
      const out = {};
      if (!partial || body.name !== undefined) {
        const name = app.companies.plainName(body.name, 'الاسم', { required: true, min: 2, max: 200, field: 'name' });
        out.name = name;
        out.name_norm = counterpartyNorm(name);
        if (out.name_norm.length < 2) throw badRequest('الاسم قصير جدًا', { fields: { name: 'الاسم قصير جدًا' } });
      }
      if (body.kind !== undefined) out.kind = v.oneOf(body.kind, COUNTERPARTY_KINDS, 'النوع', { required: true });
      if (body.registry_no !== undefined) out.registry_no = v.str(body.registry_no, 'رقم السجل', { max: 60 });
      if (body.notes !== undefined) out.notes = v.str(body.notes, 'ملاحظات', { max: 2000 });
      if (body.risk_level !== undefined) out.risk_level = v.oneOf(body.risk_level || null, ['low', 'medium', 'high'], 'مستوى المخاطر');
      if (body.blocked !== undefined) out.blocked = v.bool(body.blocked) ? 1 : 0;
      return out;
    },
    staffCreateCounterparty(companyId, body = {}, actor) {
      const company = app.companies.require(companyId);
      const f = svc.counterpartyFields(body);
      if (db.get('SELECT 1 FROM company_counterparties WHERE company_id = ? AND name_norm = ?', company.id, f.name_norm)) throw new ApiError(409, 'هذا الطرف مسجل لدى الشركة', 'duplicate');
      const t = nowIso();
      const id = db.insert('company_counterparties', { company_id: company.id, kind: 'other', ...f, private_only: 0, created_at: t, updated_at: t });
      app.activity.log({ actor, company_id: company.id, type: 'company_counterparty.created', summary: `أضاف الفريق طرفًا متعاملًا لـ${company.name}` });
      return { counterparty: svc.staffCounterparties(company.id).items.find((c) => c.id === id) };
    },
    staffUpdateCounterparty(cid, body = {}, actor) {
      const c = db.get('SELECT * FROM company_counterparties WHERE id = ?', Number(cid) || 0);
      if (!c) throw notFound('الطرف غير موجود');
      const f = svc.counterpartyFields(body, { partial: true });
      if (f.name_norm && f.name_norm !== c.name_norm && db.get('SELECT 1 FROM company_counterparties WHERE company_id = ? AND name_norm = ? AND id != ?', c.company_id, f.name_norm, c.id)) {
        throw new ApiError(409, 'هذا الطرف مسجل لدى الشركة', 'duplicate');
      }
      if (!Object.keys(f).length) throw badRequest('لا تغييرات');
      f.updated_at = nowIso();
      const sets = Object.keys(f);
      db.run(`UPDATE company_counterparties SET ${sets.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...sets.map((k) => f[k]), c.id);
      for (const m of db.all('SELECT id FROM company_memory WHERE counterparty_id = ?', c.id)) refreshSearch(m.id);
      app.activity.log({ actor, company_id: c.company_id, type: 'company_counterparty.updated', summary: 'عدّل الفريق بيانات طرف متعامل', data: { counterparty_id: c.id, fields: sets } });
      return { counterparty: svc.staffCounterparties(c.company_id).items.find((x) => x.id === c.id) };
    },

    /** حذف ملفات القرص (للاختبارات والمهام) */
    _unlinkAbs(abs) {
      if (!abs.startsWith(config.uploadsDir + path.sep)) return;
      try {
        fs.unlinkSync(abs);
      } catch {
        /* لا ملف */
      }
    },
  };

  /**
   * مهمة b2b.memory (B10-42، CS-15): كل 60 دقيقة، وتعمل مرة واحدة في اليوم (القاهرة) بعد 8 صباحًا. اليوم الذي عملت فيه
   * يُقرأ من job_runs.last_result لا من الذاكرة، فإعادة التشغيل لا تكرر التذكيرات (وصفوف التذكيرات تمنعها أيضًا).
   */
  app.jobs?.register('b2b.memory', {
    everyMinutes: 60,
    label: 'خدمة الشركات: تذكيرات مواعيد الذاكرة القانونية والتجديد التلقائي',
    deferred: (r) => !!r?.deferred,
    run: async () => {
      const prev = parseJson(db.value("SELECT last_result FROM job_runs WHERE name = 'b2b.memory'"), null);
      const lastDay = prev?.day || null;
      if (app.settings.get('b2b_enabled') === false) return { deferred: true, day: lastDay };
      const today = cairoToday(now());
      const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: '2-digit', hourCycle: 'h23' }).format(now()));
      if (lastDay === today) return { day: today, acted: false };
      if (hour < 8) return { deferred: true, day: lastDay };
      return { day: today, acted: true, ...runReminders({ today }) };
    },
  });

  void SYSTEM_ACTOR;
  void cairoDayKey;
  void MEMORY_FIELDS;
  return svc;
}
