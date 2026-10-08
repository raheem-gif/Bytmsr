// الإصدار 10 — الشركات العميلة (خدمة «الإدارة القانونية الخارجية»): الشركة وعميلها الداخلي وكياناتها ومستخدموها،
// وأدوات العزل المشتركة لكل خدمات الشركات (L-14، L-18، L-19، L-34، L-50، L-51، L-60، L-62).
//
// قواعد العزل (معيارية):
//  - كل استعلام للشركة يربط company_id من الجلسة (لا من الطلب) — ومعرّفات الكيانات والزملاء من الجسم تُتحقق داخل الشركة.
//  - الطلبات تُقرأ فقط عبر visibleRequestSql، والذاكرة عبر readableMemorySql، والأطراف عبر visibleCounterpartySql (L-51).
//  - لا يدخل كائن مستخدم شركة خدمةً من خدمات المحرك أو سجل الأمان أو documents.save كفاعل؛ الفاعل { kind: 'company', name }
//    أو SYSTEM_ACTOR (L-19)، لأن أعمدة الفاعل في الجداول المشتركة تشير إلى users(id).
import { nowIso, now, badRequest, notFound, conflict, forbidden, ApiError, v, parseJson, normalizeArabic, arabicCount } from '../util.js';
import { LABELS, AREA_CODES, CODE_PREFIX, DEFAULT_SETTINGS } from '../constants.js';
import * as brandModule from '../brand.js';
import { calendars, slaState, cairoDayKey, validHours } from '../../public/assets/js/lib/company-sla.js';

// ───────────────────────── أدوات مشتركة (تُستورد من بقية خدمات الشركات) ─────────────────────────
/** فاعل النظام لتأثيرات الشركة على المحرك (إغلاق الملف عند اعتماد الشركة…) — L-19 */
export const SYSTEM_ACTOR = Object.freeze({ kind: 'system' });

/** فاعل مستخدم الشركة في السجلات: بلا معرّف (لا يُكتب في أعمدة users أبدًا) */
export function companyActor(cu, company) {
  const c = company?.name ? ` (${company.name})` : '';
  return { kind: 'company', name: `${cu?.name || 'مستخدم شركة'}${c}` };
}

const NOT_PLAIN_RE = /[\p{Cc}\p{Cf}<>]/u;
/** نفس brand.isPlainName (EXP-1)؛ نسخة محلية احتياطية بالتعبير نفسه */
export function isPlainName(s) {
  if (typeof brandModule.isPlainName === 'function') return brandModule.isPlainName(s);
  return typeof s === 'string' && !NOT_PLAIN_RE.test(s);
}

/**
 * اسم أو مسمى وظيفي يصل إلى ترويسة أو عنوان إشعار أو بريد (CS-4): بلا رموز تحكم أو محارف تنسيق أو < >.
 * الفحص قبل طي المسافات (فلا يمر سطر جديد متخفيًا في مسافة).
 */
export function plainName(value, label, { required = false, min = 0, max = 120, plural = false, field = null } = {}) {
  const key = field || label;
  const err = (msg) => badRequest(msg, { fields: { [key]: msg } });
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw err(plural ? 'هذا الحقل مطلوب.' : `الحقل «${label}» مطلوب`);
    return null;
  }
  if (typeof value !== 'string') throw err(`قيمة «${label}» غير صالحة`);
  if (!isPlainName(value)) throw err(plural ? 'اكتبوا الاسم بحروف عادية بلا رموز تحكم أو أقواس.' : 'اكتب الاسم بحروف عادية بلا رموز تحكم أو أقواس');
  const s = value.replace(/\s+/g, ' ').trim();
  if (s.length > max) throw err(plural ? 'النص أطول من المسموح.' : `«${label}» أطول من المسموح`);
  if (s.length < min) throw err(plural ? 'النص أقصر من المطلوب.' : `«${label}» أقصر من المطلوب`);
  return s;
}

/**
 * الطلبات التي يراها مستخدم الشركة (L-51): مدير البوابة كل طلبات شركته؛ العضو ما أرسله ∪ المشترك مع الشركة ∪ ما يتابعه؛
 * «اطلاع فقط» المشترك ∪ ما يتابعه. يعيد { sql, params } لجملة WHERE على الاسم المستعار alias.
 */
export function visibleRequestSql(cu, alias = 'r') {
  const watched = `EXISTS (SELECT 1 FROM company_request_watchers w WHERE w.request_id = ${alias}.id AND w.company_user_id = ?)`;
  if (cu.role === 'company_admin') return { sql: `${alias}.company_id = ?`, params: [cu.company_id] };
  if (cu.role === 'member') {
    return { sql: `(${alias}.company_id = ? AND (${alias}.submitted_by = ? OR ${alias}.visibility = 'company' OR ${watched}))`, params: [cu.company_id, cu.id, cu.id] };
  }
  return { sql: `(${alias}.company_id = ? AND (${alias}.visibility = 'company' OR ${watched}))`, params: [cu.company_id, cu.id] };
}

/** عناصر الذاكرة المقروءة (L-51): مدير البوابة كلها، والعضو و«اطلاع فقط» ما وصوله «كل فريق الشركة» */
export function readableMemorySql(cu, alias = 'm') {
  if (cu.role === 'company_admin') return { sql: `${alias}.company_id = ?`, params: [cu.company_id] };
  return { sql: `(${alias}.company_id = ? AND ${alias}.access = 'all')`, params: [cu.company_id] };
}

/**
 * الأطراف المتعاملة الظاهرة (CS-22): أطراف من نوع «موظف» أو نشأت من طلبات خاصة فقط تظهر لمديري البوابة فحسب،
 * إلا إذا أشار إليها عنصر ذاكرة يقرؤه المستخدم.
 */
export function visibleCounterpartySql(cu, alias = 'cp') {
  if (cu.role === 'company_admin') return { sql: `${alias}.company_id = ?`, params: [cu.company_id] };
  return {
    sql: `(${alias}.company_id = ? AND ((${alias}.kind != 'employee' AND ${alias}.private_only = 0)
          OR EXISTS (SELECT 1 FROM company_memory mm WHERE mm.counterparty_id = ${alias}.id AND mm.company_id = ${alias}.company_id AND mm.access = 'all' AND mm.archived_at IS NULL)))`,
    params: [cu.company_id],
  };
}

/** بادئات محجوزة لا تُعطى لشركة (CS-34): بادئات المنصة وأكواد المجالات وكل CODE_PREFIX */
export const RESERVED_PREFIXES = Object.freeze(new Set(['REQ', 'INV', 'CL', 'MTR', 'RCPT', 'CO', 'Q', 'KR', ...AREA_CODES, ...Object.values(CODE_PREFIX)]));
export const PREFIX_RE = /^[A-Z]{2,5}$/;
export const REQUEST_CODE_RE = /^[A-Z]{2,5}-\d{4,6}$/;

const ROLES = ['company_admin', 'member', 'viewer'];
const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-500', '500+'];
const LEGAL_FORMS = Object.keys(LABELS.legal_form);
const RELATIONS = Object.keys(LABELS.company_entity_relation);
const STATUSES = ['trial', 'active', 'past_due', 'suspended', 'ended'];
const POD_ROLES = ['preferred_lead', 'preferred_reviewer', 'excluded'];
const USERS_FORMS = ['مستخدم', 'مستخدمين', 'مستخدمين', 'مستخدمًا'];
const DEFAULT_COMPANY_SETTINGS = Object.freeze({ show_account_manager: true, default_visibility: 'company', quote_approvers: 'admins' });

const label = (group, key) => LABELS[group]?.[key] || key || '';

// ───────── قواعد إعدادات خدمة الشركات (PUT /api/admin/b2b/settings، B10 §6.5 + §4.9) ─────────
const intRule = (min, max, l) => (val) => {
  const n = Number(val);
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { error: `«${l}» عدد صحيح بين ${min} و${max}` };
};
const hoursRule = (l, { nullable = false } = {}) => (val) => {
  if (val === null && nullable) return { value: null };
  if (!validHours(val)) return { error: `«${l}»: اختر يومًا واحدًا على الأقل، وبداية قبل النهاية (HH:MM)` };
  return { value: { days: [...new Set(val.days.map(Number))].sort((a, b) => a - b), from: val.from, to: val.to } };
};
export const B2B_SETTING_RULES = Object.freeze({
  b2b_enabled: (val) => (typeof val === 'boolean' ? { value: val } : { error: 'قيمة «تفعيل بوابة الشركات» غير صالحة' }),
  b2b_business_hours: hoursRule('مواعيد العمل لمستوى الخدمة', { nullable: true }),
  // {days: كل الأيام، from '00:00'، to '24:00'} = ساعة عاجلة على مدار اليوم (L-53)
  b2b_urgent_hours: hoursRule('ساعات الطلبات العاجلة'),
  b2b_holidays: (val) => {
    if (!Array.isArray(val) || val.length > 60 || !val.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))) return { error: 'العطلات قائمة تواريخ YYYY-MM-DD (60 على الأكثر)' };
    return { value: [...new Set(val.map(String))].sort() };
  },
  b2b_auto_close_days: intRule(1, 60, 'الإغلاق التلقائي بعد التسليم (أيام)'),
  b2b_revision_window_days: intRule(1, 365, 'مدة طلب التعديلات (أيام)'),
  b2b_reminder_after_hours: intRule(1, 240, 'التذكير بعد (ساعات عمل)'),
  b2b_max_reminders: intRule(0, 10, 'عدد التذكيرات'),
  b2b_quote_valid_days: intRule(1, 90, 'صلاحية عرض السعر (أيام)'),
  b2b_trial_days: intRule(1, 120, 'مدة الفترة التجريبية (أيام)'),
  b2b_ended_readonly_days: intRule(0, 365, 'مدة الاطلاع بعد انتهاء التعاقد (أيام)'),
  b2b_memory_remind_days: (val) => {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return { error: 'مواعيد التذكير غير صالحة' };
    const out = {};
    for (const [k, list] of Object.entries(val)) {
      if (!/^[a-z_]{2,20}$/.test(k) || !Array.isArray(list) || list.length > 6 || !list.every((n) => Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 365)) return { error: `مواعيد التذكير لـ«${k}» غير صالحة (حتى 6 أعداد من 0 إلى 365)` };
      out[k] = [...new Set(list.map(Number))].sort((a, b) => b - a);
    }
    return { value: out };
  },
  b2b_terms_url: (val) => {
    const s = String(val ?? '').trim();
    if (!s) return { value: '' };
    if (s.length > 500 || !/^https:\/\/[^\s<>"']+$/i.test(s)) return { error: 'رابط شروط الخدمة يبدأ بـ https:// (500 حرف على الأكثر) أو يُترك فارغًا' };
    return { value: s };
  },
  b2b_storage_mb: intRule(50, 102400, 'المساحة المتاحة لكل شركة (ميجابايت)'),
  b2b_files_per_day: intRule(10, 10000, 'الملفات في اليوم لكل شركة'),
  b2b_outbox_retention_days: intRule(7, 3650, 'الاحتفاظ بصندوق البريد الصادر (أيام)'),
  b2b_notifications_retention_days: intRule(30, 3650, 'الاحتفاظ بالإشعارات المقروءة (أيام)'),
  company_session_idle_hours: intRule(1, 72, 'مدة الخمول قبل الخروج (ساعات)'),
  company_session_max_hours: intRule(1, 720, 'المدة القصوى للجلسة (ساعات)'),
  company_remember_days: intRule(1, 90, 'تذكر الجهاز (أيام)'),
  company_remember_days_2fa: intRule(1, 90, 'تذكر الجهاز مع التحقق بخطوتين (أيام)'),
  company_invite_valid_hours: intRule(1, 336, 'صلاحية رابط الدعوة (ساعات)'),
  company_reset_valid_minutes: intRule(10, 1440, 'صلاحية رابط تعيين كلمة المرور (دقائق)'),
  company_email_max_per_hour: intRule(1, 200, 'رسائل البريد في الساعة لكل مستخدم'),
});

export function createCompanies(app) {
  const { db } = app;

  // ───────── الهوية التجارية (L-02: لا اسم حرفي في الكود) ─────────
  const brandName = () => app.brand?.displayName?.() || app.settings.get('brand_name') || DEFAULT_SETTINGS.brand_name || app.settings.get('org_name');
  const brandShort = () => app.brand?.shortName?.() || app.settings.get('brand_short_name') || DEFAULT_SETTINGS.brand_short_name || brandName();
  const FSI = String.fromCharCode(0x2068);
  const PDI = String.fromCharCode(0x2069);

  function audit(actor, ctx, company, e) {
    app.audit.log({ actor, ctx, company_id: company?.id ?? null, ...e });
  }
  function activity(actor, company, e) {
    app.activity.log({ actor, company_id: company?.id ?? null, client_id: company?.client_id ?? null, ...e });
  }

  // ───────── الشركة ─────────
  function get(id) {
    return db.get('SELECT * FROM companies WHERE id = ?', Number(id) || 0) || null;
  }
  function requireCompany(id) {
    const c = get(id);
    if (!c) throw notFound('الشركة غير موجودة');
    return c;
  }
  const isReadOnly = (c) => !!c && (c.status === 'suspended' || c.status === 'ended');
  function settingsOf(c) {
    const s = parseJson(c?.settings, {}) || {};
    return { ...DEFAULT_COMPANY_SETTINGS, ...s };
  }
  function activeSubscription(companyId) {
    const s = db.get("SELECT s.*, p.name AS plan_name, p.key AS plan_key FROM company_subscriptions s LEFT JOIN company_plans p ON p.id = s.plan_id WHERE s.company_id = ? AND s.status = 'active'", companyId);
    if (!s) return null;
    return { ...s, terms: parseJson(s.terms, {}) || {} };
  }
  function planLabel(sub) {
    if (!sub) return null;
    return sub.plan_name || label('company_plan_tier', sub.terms?.tier) || null;
  }
  const entitiesCount = (companyId) => Number(db.value("SELECT COUNT(*) FROM company_entities WHERE company_id = ? AND status = 'active'", companyId));

  /** شكل الشركة كما تراه البوابة (§4.5) */
  function publicCompany(c) {
    const sub = activeSubscription(c.id);
    return {
      id: c.id,
      name: c.name,
      prefix: c.prefix,
      status: c.status,
      status_label: label('company_status', c.status),
      read_only: isReadOnly(c),
      trial_ends_at: c.status === 'trial' ? c.trial_ends_at || null : null,
      plan_label: planLabel(sub),
      entities_count: entitiesCount(c.id),
      require_2fa: !!c.require_2fa,
    };
  }

  /**
   * مدير العلاقة الفعلي (L-50): المعيَّن إن كان حسابًا نشطًا بدور إدارة، وإلا أول مدير نظام نشط — ويُحدَّث صف الشركة مرة
   * واحدة (مقارنة وتبديل) ويُبلَّغ المدير الجديد (CS-28).
   */
  function accountManagerOf(c) {
    if (!c) return null;
    const u = c.account_manager_id ? db.get("SELECT id, name, email, role, active FROM users WHERE id = ? AND role IN ('admin','case_manager')", c.account_manager_id) : null;
    if (u && u.active) return u;
    const fallback = db.get("SELECT id, name, email, role, active FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1");
    if (!fallback) return null;
    const changed = db.run('UPDATE companies SET account_manager_id = ?, updated_at = ? WHERE id = ? AND account_manager_id IS ?', fallback.id, nowIso(), c.id, c.account_manager_id ?? null).changes;
    if (changed) {
      c.account_manager_id = fallback.id;
      try {
        app.notifications.notify([fallback.id], { type: 'company.manager_reassigned', title: `أصبحت مدير العلاقة لـ${c.name}`, body: 'أُوقف حساب مدير العلاقة السابق، فانتقلت الشركة إليك تلقائيًا. يمكنك تعيين مدير آخر من صفحة الشركة.', link: `#/companies/${c.id}` });
        activity(SYSTEM_ACTOR, c, { type: 'company.manager_reassigned', summary: `انتقلت ${c.name} تلقائيًا إلى مدير العلاقة ${fallback.name} بعد إيقاف المدير السابق` });
      } catch (e) {
        app.log('company manager fallback notify', e);
      }
    }
    return fallback;
  }
  /** اسم مدير العلاقة كما تراه الشركة (L-22): فقط حين يسمح إعداد الشركة ويكون الحساب نشطًا */
  function visibleAccountManager(c) {
    if (!settingsOf(c).show_account_manager) return null;
    const m = accountManagerOf(c);
    return m ? { name: m.name } : null;
  }
  /** الجهة المتعاقدة (L-62): الكيان القانوني للمكتب لا الاسم التجاري */
  function contractingEntity() {
    return { legal_name: app.settings.get('org_legal_name') || '', registration: app.settings.get('org_registration') || '' };
  }

  function validStaffManager(id) {
    const n = v.int(id, 'مدير العلاقة', { required: true, min: 1 });
    const u = db.get("SELECT id, name FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", n);
    if (!u) throw badRequest('مدير العلاقة يجب أن يكون حسابًا نشطًا من فريق الإدارة (مدير نظام أو مدير حالات)', { fields: { account_manager_id: 'اختر مدير علاقة نشطًا من فريق الإدارة' } });
    return u;
  }

  /** فحص البادئة: { available, reason: null|'taken'|'reserved'|'invalid' } */
  function prefixCheck(prefix, { companyId = null } = {}) {
    const p = String(prefix ?? '').trim().toUpperCase();
    if (!PREFIX_RE.test(p)) return { available: false, reason: 'invalid' };
    if (RESERVED_PREFIXES.has(p)) return { available: false, reason: 'reserved' };
    const taken = db.get('SELECT id FROM companies WHERE prefix = ?', p);
    if (taken && taken.id !== companyId) return { available: false, reason: 'taken' };
    return { available: true, reason: null };
  }
  function requirePrefix(prefix, { companyId = null } = {}) {
    const p = String(prefix ?? '').trim().toUpperCase();
    const r = prefixCheck(p, { companyId });
    if (!r.available) {
      const msg =
        r.reason === 'invalid'
          ? 'البادئة من حرفين إلى خمسة أحرف لاتينية كبيرة، مثل NFD'
          : r.reason === 'reserved'
            ? 'هذه البادئة محجوزة لأرقام المنصة؛ اختر بادئة أخرى'
            : 'هذه البادئة مستخدمة لشركة أخرى';
      throw badRequest(msg, { fields: { prefix: msg }, reason: r.reason });
    }
    return p;
  }

  // ───────── الكيانات ─────────
  function entityView(e) {
    return {
      id: e.id,
      name: e.name,
      legal_form: e.legal_form || null,
      legal_form_label: e.legal_form ? label('legal_form', e.legal_form) : null,
      relation: e.relation,
      relation_label: label('company_entity_relation', e.relation),
      parent_entity_id: e.parent_entity_id || null,
      commercial_registry: e.commercial_registry || null,
      tax_id: e.tax_id || null,
      jurisdiction: e.jurisdiction || null,
      status: e.status,
    };
  }
  function entities(companyId, { includeInactive = false } = {}) {
    return db
      .all(`SELECT * FROM company_entities WHERE company_id = ? ${includeInactive ? '' : "AND status = 'active'"} ORDER BY CASE relation WHEN 'parent' THEN 0 ELSE 1 END, id`, companyId)
      .map(entityView);
  }
  /** كيان من الشركة نفسها (وإلا 400 — المعرّف من الجسم لا يُصدَّق، L-51) */
  function requireEntity(companyId, entityId, { field = 'entity_id' } = {}) {
    const e = db.get("SELECT * FROM company_entities WHERE id = ? AND company_id = ? AND status = 'active'", Number(entityId) || 0, companyId);
    if (!e) throw badRequest('الكيان غير موجود في هذه الشركة', { fields: { [field]: 'اختاروا كيانًا من القائمة.' } });
    return e;
  }
  function entityFields(body, companyId, { partial = false, plural = false } = {}) {
    const out = {};
    if (!partial || body.name !== undefined) out.name = plainName(body.name, 'الاسم القانوني', { required: true, max: 200, plural, field: 'name' });
    if (body.legal_form !== undefined) out.legal_form = v.oneOf(body.legal_form || null, LEGAL_FORMS, 'الشكل القانوني');
    if (body.relation !== undefined) out.relation = v.oneOf(body.relation, RELATIONS, 'العلاقة', { required: true });
    if (body.parent_entity_id !== undefined) out.parent_entity_id = body.parent_entity_id ? requireEntity(companyId, body.parent_entity_id, { field: 'parent_entity_id' }).id : null;
    for (const [k, l, max] of [
      ['commercial_registry', 'السجل التجاري', 60],
      ['tax_id', 'البطاقة الضريبية', 60],
      ['jurisdiction', 'المحافظة أو الاختصاص', 100],
      ['notes', 'ملاحظات', 1000],
    ]) {
      if (body[k] !== undefined) out[k] = v.str(body[k], l, { max });
    }
    if (body.status !== undefined) out.status = v.oneOf(body.status, ['active', 'inactive'], 'الحالة', { required: true });
    return out;
  }

  // ───────── المستخدمون ─────────
  function userState(u) {
    if (!u.active) return 'inactive';
    if (u.invite_pending) return 'invite_pending';
    if (u.locked_until && Date.parse(u.locked_until) > now().getTime()) return 'locked';
    return 'active';
  }
  /** عرض المستخدم: للإدارة (staff) بالبريد والهاتف، وللفريق في البوابة بالبريد بلا هاتف */
  function userView(u, { staff = false } = {}) {
    const state = userState(u);
    const out = {
      id: u.id,
      name: u.name,
      email: u.email,
      job_title: u.job_title || null,
      role: u.role,
      role_label: label('company_user_role', u.role),
      billing_contact: !!u.billing_contact,
      active: !!u.active,
      state,
      state_label: label('company_user_state', state),
      two_factor: app.companyAuth?.twoFactorEnabled?.(u.id) || false,
      last_login_at: u.last_login_at || null,
      created_at: u.created_at,
    };
    if (staff) {
      out.phone = u.phone || null;
      out.email_pref = u.email_pref;
      out.locked_until = u.locked_until && Date.parse(u.locked_until) > now().getTime() ? u.locked_until : null;
      out.failed_login_count = Number(u.failed_login_count) || 0;
      out.terms_accepted_at = u.terms_accepted_at || null;
      out.sessions = app.companyAuth?.listSessions?.(u.id)?.length || 0;
      out.created_by_kind = u.created_by_kind;
    }
    return out;
  }
  function requireUser(uid) {
    const u = db.get('SELECT * FROM company_users WHERE id = ?', Number(uid) || 0);
    if (!u) throw notFound('المستخدم غير موجود');
    return u;
  }
  const activeAdminsCount = (companyId, exceptId = 0) =>
    Number(db.value("SELECT COUNT(*) FROM company_users WHERE company_id = ? AND role = 'company_admin' AND active = 1 AND invite_pending = 0 AND id != ?", companyId, exceptId));
  const usersCount = (companyId) => Number(db.value('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1', companyId));
  const lastAdminError = () => new ApiError(409, 'يجب أن يبقى للشركة مدير بوابة واحد نشط على الأقل. عيّنوا مديرًا آخر أولًا.', 'last_admin');

  function maxUsersOf(companyId) {
    const t = activeSubscription(companyId)?.terms;
    return t && t.max_users !== null && t.max_users !== undefined ? Number(t.max_users) : null;
  }
  function maxEntitiesOf(companyId) {
    const t = activeSubscription(companyId)?.terms;
    return t && t.max_entities !== null && t.max_entities !== undefined ? Number(t.max_entities) : null;
  }

  /** حد يومي لدعوات وروابط فريق الشركة (20 لكل شركة في اليوم، L-60) */
  function dailyTeamLinks(companyId) {
    const since = new Date(now().getTime() - 86400000).toISOString();
    const tokens = Number(
      db.value(
        "SELECT COUNT(*) FROM company_account_tokens t JOIN company_users u ON u.id = t.company_user_id WHERE u.company_id = ? AND t.created_by_kind = 'company' AND t.created_at >= ?",
        companyId,
        since,
      ),
    );
    const conflicts = Number(db.value("SELECT COUNT(*) FROM activity WHERE company_id = ? AND type = 'company.invite_conflict' AND created_at >= ?", companyId, since));
    return tokens + conflicts;
  }
  function checkDailyTeamLinks(companyId) {
    if (dailyTeamLinks(companyId) >= 20) throw new ApiError(429, 'وصلتم للحد اليومي للدعوات وروابط تعيين كلمة المرور (20 في اليوم). حاولوا غدًا أو تواصلوا مع فريقكم القانوني.', 'rate_limited');
  }

  function newUserRow(companyId, data, createdBy) {
    const t = nowIso();
    return db.insert('company_users', {
      company_id: companyId,
      email: data.email,
      name: data.name,
      job_title: data.job_title ?? null,
      phone: data.phone ?? null,
      role: data.role,
      billing_contact: data.billing_contact ? 1 : 0,
      email_pref: 'important',
      password_hash: '!invite-pending',
      active: 1,
      invite_pending: 1,
      created_by_kind: createdBy.kind,
      created_by_user_id: createdBy.user_id ?? null,
      created_by_company_user_id: createdBy.company_user_id ?? null,
      created_at: t,
      updated_at: t,
    });
  }

  function inviteFields(body, { plural }) {
    return {
      name: plainName(body.name, 'الاسم', { required: true, min: 2, max: 120, plural, field: 'name' }),
      email: v.email(body.email, 'البريد الإلكتروني', { required: true }),
      job_title: plainName(body.job_title, 'الوظيفة', { max: 120, plural, field: 'job_title' }),
      phone: body.phone !== undefined ? v.phone(body.phone, 'رقم الهاتف') : null,
      role: v.oneOf(body.role || 'member', ROLES, 'الدور', { required: true }),
      billing_contact: v.bool(body.billing_contact),
    };
  }

  const svc = {
    SYSTEM_ACTOR,
    companyActor,
    visibleRequestSql,
    readableMemorySql,
    visibleCounterpartySql,
    isPlainName,
    plainName,
    brandName,
    brandShort,
    brandIsolated: () => `${FSI}${brandName()}${PDI}`,
    get,
    require: requireCompany,
    isReadOnly,
    settingsOf,
    publicCompany,
    activeSubscription,
    planLabel,
    accountManagerOf,
    visibleAccountManager,
    contractingEntity,
    prefixCheck,
    entities,
    requireEntity,
    entityView,
    userView,
    userState,
    maxUsersOf,
    maxEntitiesOf,

    // ===================== الإدارة: الشركات =====================
    /** قائمة الشركات للإدارة (8.1.1) */
    staffList({ status = null, q = null } = {}) {
      const where = ['1=1'];
      const params = [];
      if (status && STATUSES.includes(status)) {
        where.push('c.status = ?');
        params.push(status);
      }
      const rows = db.all(`SELECT c.* FROM companies c WHERE ${where.join(' AND ')} ORDER BY c.name`, ...params);
      const nq = q ? normalizeArabic(String(q).trim()) : '';
      const cals = calendars(app.settings.all());
      const nowI = nowIso();
      const in30 = cairoDayKey(new Date(now().getTime() + 30 * 86400000));
      const today = cairoDayKey(now());
      return {
        items: rows
          .filter((c) => !nq || normalizeArabic(`${c.name} ${c.legal_name || ''} ${c.prefix} ${c.code}`).includes(nq))
          .map((c) => {
            const sub = activeSubscription(c.id);
            const mgr = accountManagerOf(c);
            const open = db.all("SELECT * FROM company_requests WHERE company_id = ? AND status IN ('submitted','awaiting_company','in_progress','delivered')", c.id);
            let atRisk = 0;
            let late = 0;
            for (const r of open) {
              const phase = r.delivery_due_at ? 'delivery' : r.confirm_due_at ? 'confirm' : 'first_response';
              const due = phase === 'delivery' ? r.delivery_due_at : phase === 'confirm' ? r.confirm_due_at : r.first_response_due_at;
              if (!due || r.status === 'delivered' || (phase === 'first_response' && r.first_response_at)) continue;
              const st = slaState({ startIso: phase === 'delivery' ? r.accepted_at : r.created_at, dueIso: due, pausedAt: r.sla_paused_at, clock: r.sla_clock, cals, now: nowI });
              if (st === 'late') late += 1;
              else if (st === 'at_risk') atRisk += 1;
            }
            return {
              id: c.id,
              code: c.code,
              prefix: c.prefix,
              name: c.name,
              status: c.status,
              status_label: label('company_status', c.status),
              plan_name: planLabel(sub),
              account_manager: mgr ? { id: mgr.id, name: mgr.name } : null,
              users: usersCount(c.id),
              open_requests: open.filter((r) => r.status !== 'delivered').length,
              awaiting_company: open.filter((r) => r.status === 'awaiting_company').length,
              at_risk: atRisk,
              late,
              renewals_30d: Number(db.value('SELECT COUNT(*) FROM company_memory WHERE company_id = ? AND archived_at IS NULL AND next_date >= ? AND next_date <= ?', c.id, today, in30)),
              trial_ends_at: c.status === 'trial' ? c.trial_ends_at : null,
            };
          }),
      };
    },

    /** صفحة الشركة للإدارة (8.1.3) — المبالغ لمدير النظام فقط */
    staffView(id, actor) {
      const c = requireCompany(id);
      const sub = activeSubscription(c.id);
      const mgr = accountManagerOf(c);
      const isAdmin = actor?.role === 'admin';
      const counts = Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM company_requests WHERE company_id = ? GROUP BY status', c.id).map((r) => [r.status, Number(r.n)]));
      const memory = Object.fromEntries(db.all('SELECT kind, COUNT(*) AS n FROM company_memory WHERE company_id = ? AND archived_at IS NULL GROUP BY kind', c.id).map((r) => [r.kind, Number(r.n)]));
      const today = cairoDayKey(now());
      const upcoming = db
        .all('SELECT id, kind, title, next_date, notice_deadline, end_date FROM company_memory WHERE company_id = ? AND archived_at IS NULL AND next_date >= ? ORDER BY next_date LIMIT 10', c.id, today)
        .map((m) => ({ ...m, kind_label: label('company_memory_kind', m.kind) }));
      let conflicts = [];
      try {
        conflicts = app.practice?.conflicts?.check ? app.practice.conflicts.check({ name: c.name }, { subjectRole: 'client', family: { caseIds: [], matterIds: [], clientId: c.client_id }, includeClients: true }) : [];
      } catch (e) {
        app.log('company conflicts', e);
      }
      const quota = app.companyBilling?.quota ? app.companyBilling.quota(c) : null;
      return {
        company: {
          id: c.id,
          code: c.code,
          prefix: c.prefix,
          prefix_locked: !!db.get('SELECT 1 FROM company_requests WHERE company_id = ? LIMIT 1', c.id),
          name: c.name,
          legal_name: c.legal_name,
          industry: c.industry,
          size_band: c.size_band,
          commercial_registry: c.commercial_registry,
          tax_id: c.tax_id,
          address: c.address,
          status: c.status,
          status_label: label('company_status', c.status),
          status_reason: c.status_reason,
          trial_ends_at: c.trial_ends_at,
          ended_at: c.ended_at,
          read_only: isReadOnly(c),
          require_2fa: !!c.require_2fa,
          settings: settingsOf(c),
          notes_internal: c.notes_internal,
          account_manager: mgr ? { id: mgr.id, name: mgr.name } : null,
          client_id: c.client_id,
          email_enabled: !!app.email?.enabled?.(),
          created_at: c.created_at,
        },
        subscription: sub ? app.companyBilling.subscriptionView(sub, { money: isAdmin }) : null,
        entities: entities(c.id, { includeInactive: true }),
        users: db.all('SELECT * FROM company_users WHERE company_id = ? ORDER BY active DESC, role, name', c.id).map((u) => userView(u, { staff: true })),
        team: svc.pod(c.id),
        quota,
        requests: { counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
        memory: { counts: memory, upcoming },
        billing: isAdmin && app.companyBilling?.chargesSummary ? app.companyBilling.chargesSummary(c) : null,
        conflicts,
      };
    },

    /**
     * إنشاء شركة (A، 8.1.2): العميل الداخلي والكيان الأم والاشتراك وأول مدير بوابة ودعوته في معاملة واحدة،
     * مع فحص تعارض مصالح لاسم الشركة (لا يمنع الإنشاء).
     */
    create(body = {}, actor, ctx) {
      const name = plainName(body.name, 'اسم الشركة', { required: true, min: 2, max: 150, field: 'name' });
      const prefix = requirePrefix(body.prefix);
      const legal_name = plainName(body.legal_name, 'الاسم القانوني', { max: 200, field: 'legal_name' });
      const status = v.oneOf(body.status || 'trial', ['trial', 'active'], 'الحالة', { required: true });
      const trialDays = v.int(body.trial_days, 'مدة الفترة التجريبية', { min: 1, max: 120 }) ?? (Number(app.settings.get('b2b_trial_days')) || 14);
      const manager = validStaffManager(body.account_manager_id);
      const fa = body.first_admin && typeof body.first_admin === 'object' ? body.first_admin : null;
      if (!fa) throw badRequest('بيانات أول مستخدم (مدير بوابة الشركة) مطلوبة', { fields: { first_admin: 'اكتب اسم أول مستخدم وبريده' } });
      const admin = {
        name: plainName(fa.name, 'اسم أول مستخدم', { required: true, min: 2, max: 120, field: 'first_admin.name' }),
        email: v.email(fa.email, 'بريد أول مستخدم', { required: true }),
        job_title: plainName(fa.job_title, 'وظيفة أول مستخدم', { max: 120, field: 'first_admin.job_title' }),
        phone: v.phone(fa.phone, 'هاتف أول مستخدم'),
        role: 'company_admin',
        billing_contact: fa.billing_contact === undefined ? true : v.bool(fa.billing_contact),
      };
      if (db.get('SELECT 1 FROM company_users WHERE email = ?', admin.email)) throw new ApiError(409, 'هذا البريد مسجل بالفعل لمستخدم في بوابة الشركات', 'email_taken', { fields: { 'first_admin.email': 'البريد مسجل بالفعل' } });
      const profile = svc.profileFields(body, { staff: true });
      const sub = app.companyBilling.subscriptionInput(body, { required: true });
      const ent = body.entity && typeof body.entity === 'object' ? body.entity : {};
      const entityName = plainName(ent.name, 'اسم الكيان', { max: 200, field: 'entity.name' }) || legal_name || name;
      const entityForm = v.oneOf(ent.legal_form || null, LEGAL_FORMS, 'الشكل القانوني');
      const t = nowIso();
      const result = db.tx(() => {
        const n = db.nextCounter('company', 1);
        const client = app.clients.create({ name, notes: 'عميل داخلي لشركة عميلة (خدمة الشركات) — لا يُستخدم مباشرة' });
        const id = db.insert('companies', {
          code: `${CODE_PREFIX.company}-${String(n).padStart(5, '0')}`,
          prefix,
          name,
          legal_name,
          ...profile,
          status,
          trial_ends_at: status === 'trial' ? new Date(now().getTime() + trialDays * 86400000).toISOString() : null,
          account_manager_id: manager.id,
          client_id: client.id,
          require_2fa: v.bool(body.require_2fa) ? 1 : 0,
          settings: JSON.stringify({ ...DEFAULT_COMPANY_SETTINGS, ...svc.settingsInput(body.settings || {}) }),
          notes_internal: v.str(body.notes_internal, 'ملاحظات داخلية', { max: 3000 }),
          created_by: actor?.id ?? null,
          created_at: t,
          updated_at: t,
        });
        db.run('UPDATE clients SET company_id = ? WHERE id = ?', id, client.id);
        db.insert('company_entities', { company_id: id, name: entityName, legal_form: entityForm, relation: 'parent', commercial_registry: profile.commercial_registry ?? null, tax_id: profile.tax_id ?? null, status: 'active', created_at: t, updated_at: t });
        const subId = app.companyBilling.startSubscription(id, sub, actor);
        const uid = newUserRow(id, admin, { kind: 'staff', user_id: actor?.id ?? null });
        return { id, subId, uid };
      });
      const company = get(result.id);
      const cu = requireUser(result.uid);
      const invite = app.companyAuth.sendInvite(ctx, cu, company, { kind: 'staff', user_id: actor?.id ?? null });
      let conflicts = [];
      try {
        conflicts = app.practice?.conflicts?.check ? app.practice.conflicts.check({ name }, { subjectRole: 'client', family: { caseIds: [], matterIds: [], clientId: company.client_id }, includeClients: true }) : [];
      } catch (e) {
        app.log('company create conflicts', e);
      }
      audit(actor, ctx, company, { type: 'company.created', summary: `إنشاء شركة عميلة «${name}» (${prefix}) بباقة ${planLabel(activeSubscription(company.id)) || 'بشروط خاصة'} وحالة «${label('company_status', status)}»`, data: { prefix, status, conflicts: conflicts.length } });
      audit(actor, ctx, company, { type: 'company.user_invited', summary: `دعوة ${cu.name} مديرًا لبوابة ${name}`, company_user_id: cu.id, data: { role: 'company_admin', emailed: invite.emailed } });
      activity(actor, company, { type: 'company.created', summary: `أُنشئت الشركة العميلة ${name}`, data: { prefix } });
      return { company: svc.staffView(company.id, actor).company, subscription: app.companyBilling.subscriptionView(activeSubscription(company.id), { money: true }), invite, conflicts };
    },

    /** حقول ملف الشركة (8.1.4، B10-19) */
    profileFields(body, { staff = false, plural = false } = {}) {
      const out = {};
      if (body.legal_name !== undefined) out.legal_name = plainName(body.legal_name, 'الاسم القانوني', { max: 200, plural, field: 'legal_name' });
      if (body.industry !== undefined) out.industry = v.str(body.industry, 'النشاط', { max: 120 });
      if (body.size_band !== undefined) out.size_band = v.oneOf(body.size_band || null, SIZE_BANDS, 'حجم الشركة');
      if (body.commercial_registry !== undefined) out.commercial_registry = v.str(body.commercial_registry, 'السجل التجاري', { max: 60 });
      if (body.tax_id !== undefined) out.tax_id = v.str(body.tax_id, 'البطاقة الضريبية', { max: 60 });
      if (body.address !== undefined) out.address = v.str(body.address, 'العنوان', { max: 300 });
      void staff;
      return out;
    },
    settingsInput(s = {}) {
      const out = {};
      if (s.show_account_manager !== undefined) out.show_account_manager = v.bool(s.show_account_manager);
      if (s.default_visibility !== undefined) out.default_visibility = v.oneOf(s.default_visibility, ['company', 'private'], 'الظهور الافتراضي', { required: true });
      if (s.quote_approvers !== undefined) out.quote_approvers = v.oneOf(s.quote_approvers, ['admins', 'admins_or_submitter'], 'من يوافق على عروض الأسعار', { required: true });
      return out;
    },

    /** تعديل الشركة (A، 8.1.4) */
    update(id, body = {}, actor, ctx) {
      const c = requireCompany(id);
      const patch = svc.profileFields(body, { staff: true });
      if (body.name !== undefined) patch.name = plainName(body.name, 'اسم الشركة', { required: true, min: 2, max: 150, field: 'name' });
      if (body.prefix !== undefined && String(body.prefix).toUpperCase() !== c.prefix) {
        if (db.get('SELECT 1 FROM company_requests WHERE company_id = ? LIMIT 1', c.id)) throw new ApiError(409, 'لا يمكن تغيير البادئة بعد أول طلب للشركة', 'prefix_locked');
        patch.prefix = requirePrefix(body.prefix, { companyId: c.id });
      }
      let managerChanged = null;
      if (body.account_manager_id !== undefined && Number(body.account_manager_id) !== c.account_manager_id) {
        managerChanged = validStaffManager(body.account_manager_id);
        patch.account_manager_id = managerChanged.id;
      }
      if (body.settings !== undefined) patch.settings = JSON.stringify({ ...settingsOf(c), ...svc.settingsInput(body.settings || {}) });
      if (body.notes_internal !== undefined) patch.notes_internal = v.str(body.notes_internal, 'ملاحظات داخلية', { max: 3000 });
      if (body.require_2fa !== undefined) patch.require_2fa = v.bool(body.require_2fa) ? 1 : 0;
      if (body.trial_ends_at !== undefined && c.status === 'trial') patch.trial_ends_at = v.iso(body.trial_ends_at, 'نهاية الفترة التجريبية', { required: true });
      const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (c[k] ?? null));
      if (changed.length) {
        db.update('companies', c.id, { ...Object.fromEntries(changed.map((k) => [k, patch[k]])), updated_at: nowIso() });
        if (patch.name && c.client_id) db.run('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?', patch.name, nowIso(), c.client_id);
        audit(actor, ctx, c, { type: 'company.updated', summary: `تعديل بيانات الشركة «${c.name}»: ${changed.join('، ')}`, data: { fields: changed } });
        if (managerChanged) {
          try {
            app.notifications.notify([managerChanged.id], { type: 'company.manager_reassigned', title: `أصبحت مدير العلاقة لـ${patch.name || c.name}`, link: `#/companies/${c.id}` });
          } catch (e) {
            app.log('manager notify', e);
          }
        }
      }
      return svc.staffView(c.id, actor);
    },

    /** حالة الشركة (A، 8.1.5) */
    setStatus(id, body = {}, actor, ctx) {
      const c = requireCompany(id);
      const status = v.oneOf(body.status, ['active', 'past_due', 'suspended', 'ended'], 'الحالة', { required: true });
      const reason = v.str(body.reason, 'السبب', { max: 500 });
      if (status === c.status) return svc.staffView(c.id, actor);
      const t = nowIso();
      db.update('companies', c.id, { status, status_reason: reason, ended_at: status === 'ended' ? t : null, updated_at: t });
      audit(actor, ctx, c, {
        type: 'company.status_changed',
        severity: status === 'suspended' || status === 'ended' ? 'warning' : 'info',
        summary: `تغيير حالة «${c.name}» من «${label('company_status', c.status)}» إلى «${label('company_status', status)}»${reason ? ` — ${reason}` : ''}`,
        data: { from: c.status, to: status, reason },
      });
      if (status === 'suspended' || status === 'ended') {
        app.companyNotify?.notify(
          app.companyNotify.admins(c.id).map((u) => u.id),
          { companyId: c.id, type: 'company.suspended', title: 'حساب شركتكم للاطلاع فقط', body: 'يمكنكم عرض الطلبات والمستندات وتنزيلها، ولا يمكن إرسال طلبات جديدة أو الرد الآن.', link: '#/' },
        );
      }
      return svc.staffView(c.id, actor);
    },

    // ===================== الكيانات =====================
    /** إضافة كيان: من مدير البوابة (حد الباقة صارم) أو من الإدارة (override بسبب، لمدير النظام فقط) */
    createEntity(companyId, body = {}, { actor = null, cu = null, ctx = null } = {}) {
      const c = requireCompany(companyId);
      const fields = entityFields({ relation: 'subsidiary', ...body }, c.id, { plural: !!cu });
      if (fields.relation === 'parent' && db.get("SELECT 1 FROM company_entities WHERE company_id = ? AND relation = 'parent' AND status = 'active'", c.id)) {
        throw badRequest('للشركة كيان أم بالفعل؛ اختاروا علاقة أخرى', { fields: { relation: 'اختاروا علاقة أخرى.' } });
      }
      const max = maxEntitiesOf(c.id);
      const count = entitiesCount(c.id);
      let override = false;
      if (max !== null && count >= max) {
        if (cu || !v.bool(body.override)) throw new ApiError(409, 'وصلتم للحد الأقصى من الكيانات في باقتكم. تواصلوا مع مدير علاقتكم لدينا للزيادة.', 'max_entities', { max, count });
        if (actor?.role !== 'admin') throw forbidden('تجاوز حد الكيانات في الباقة متاح لدور «إدارة النظام» فقط');
        if (!v.str(body.override_reason, 'سبب التجاوز', { max: 500 })) throw badRequest('اكتب سبب تجاوز حد الكيانات في الباقة', { fields: { override_reason: 'السبب مطلوب' } });
        override = true;
      }
      const t = nowIso();
      const id = db.insert('company_entities', { company_id: c.id, status: 'active', ...fields, created_at: t, updated_at: t });
      const by = cu ? companyActor(cu, c) : actor;
      app.activity.log({ actor: cu ? { kind: 'company' } : actor, company_id: c.id, company_user_id: cu?.id ?? null, client_id: c.client_id, type: 'company.entity_added', summary: `أُضيف الكيان «${fields.name}» إلى ${c.name}`, data: { entity_id: id, by: cu ? by.name : undefined } });
      if (override) audit(actor, ctx, c, { type: 'company.entity_override', severity: 'warning', summary: `تجاوز حد الكيانات (${max}) لشركة «${c.name}»: ${body.override_reason}`, data: { max, count } });
      return entityView(db.get('SELECT * FROM company_entities WHERE id = ?', id));
    },
    updateEntity(entityId, body = {}, { actor = null, cu = null, companyId = null } = {}) {
      const e = db.get('SELECT * FROM company_entities WHERE id = ?' + (companyId ? ' AND company_id = ?' : ''), Number(entityId) || 0, ...(companyId ? [companyId] : []));
      if (!e) throw notFound('الكيان غير موجود');
      const c = requireCompany(e.company_id);
      const fields = entityFields(body, c.id, { partial: true, plural: !!cu });
      if (fields.parent_entity_id === e.id) throw badRequest('لا يكون الكيان تابعًا لنفسه');
      if (fields.status === 'inactive' && e.relation === 'parent') throw badRequest('لا يمكن إيقاف الكيان الأم للشركة');
      if (fields.relation === 'parent' && e.relation !== 'parent') throw badRequest('للشركة كيان أم بالفعل');
      if (fields.relation && e.relation === 'parent' && fields.relation !== 'parent') throw badRequest('لا يمكن تغيير علاقة الكيان الأم');
      const changed = Object.keys(fields).filter((k) => (fields[k] ?? null) !== (e[k] ?? null));
      if (changed.length) {
        db.update('company_entities', e.id, { ...Object.fromEntries(changed.map((k) => [k, fields[k]])), updated_at: nowIso() });
        app.activity.log({ actor: cu ? { kind: 'company' } : actor, company_id: c.id, company_user_id: cu?.id ?? null, client_id: c.client_id, type: 'company.entity_updated', summary: `تعديل الكيان «${e.name}» في ${c.name}`, data: { entity_id: e.id, fields: changed, by: cu ? companyActor(cu, c).name : undefined } });
      }
      return entityView(db.get('SELECT * FROM company_entities WHERE id = ?', e.id));
    },

    // ===================== المستخدمون =====================
    staffUsers(companyId) {
      requireCompany(companyId);
      return { items: db.all('SELECT * FROM company_users WHERE company_id = ? ORDER BY active DESC, role, name', companyId).map((u) => userView(u, { staff: true })) };
    },

    /**
     * دعوة مستخدم: من الإدارة (S؛ ودعوة «مدير بوابة» لشركة لها مدير نشط = A، L-60) أو من مدير البوابة (حد المستخدمين صارم،
     * 20 رابطًا في اليوم، ولا دعوات في شركة للاطلاع فقط). بريد لدى شركة أخرى: نفس شكل الرد مع pending_review للشركة،
     * و409 صريح للإدارة.
     */
    inviteUser(companyId, body = {}, { actor = null, cu = null, ctx = null } = {}) {
      const c = requireCompany(companyId);
      if (isReadOnly(c)) throw new ApiError(403, cu ? 'حساب شركتكم في وضع الاطلاع فقط؛ لا يمكن دعوة مستخدمين الآن.' : 'الشركة للاطلاع فقط (موقوفة أو منتهية)؛ لا تُرسل دعوات', 'company_read_only');
      const data = inviteFields(body, { plural: !!cu });
      if (cu) checkDailyTeamLinks(c.id);
      const existing = db.get('SELECT * FROM company_users WHERE email = ?', data.email);
      if (existing) {
        if (existing.company_id === c.id) throw new ApiError(409, cu ? 'هذا البريد مسجل بالفعل لأحد زملائكم.' : 'هذا البريد مسجل بالفعل لمستخدم في هذه الشركة', 'email_taken', { fields: { email: 'البريد مسجل بالفعل' } });
        if (!cu) throw new ApiError(409, 'هذا البريد مسجل لمستخدم في شركة عميلة أخرى', 'email_taken', { fields: { email: 'البريد مسجل لدى شركة أخرى' } });
        // L-60: لا خطأ مميز يكشف عميلًا آخر للمكتب — نفس الشكل، ومراجعة من فريق المكتب
        app.activity.log({ actor: { kind: 'company' }, company_id: c.id, company_user_id: cu.id, client_id: c.client_id, type: 'company.invite_conflict', summary: `دعوة من ${c.name} لبريد مسجل لدى شركة أخرى`, data: { by: companyActor(cu, c).name } });
        audit(companyActor(cu, c), ctx, c, { type: 'company.invite_conflict', severity: 'warning', company_user_id: cu.id, summary: `حاول ${cu.name} (${c.name}) دعوة بريد مسجل لدى شركة عميلة أخرى`, data: { other_company_id: existing.company_id } });
        app.notifications.notifyStaff({ type: 'company.invite_conflict', title: `دعوة لبريد مسجل لدى شركة أخرى — ${c.name}`, link: `#/companies/${c.id}` }, { caseManagerId: accountManagerOf(c)?.id ?? null });
        return { user: { id: null, name: data.name, email: data.email, role: data.role, role_label: label('company_user_role', data.role), state: 'invite_pending', state_label: label('company_user_state', 'invite_pending') }, invite: { url: null, expires_at: null, emailed: false, pending_review: true } };
      }
      if (!cu && data.role === 'company_admin' && activeAdminsCount(c.id) > 0 && actor?.role !== 'admin') {
        throw forbidden('دعوة «مدير بوابة» لشركة لها مدير نشط متاحة لدور «إدارة النظام» فقط');
      }
      const max = maxUsersOf(c.id);
      if (max !== null && usersCount(c.id) >= max) {
        if (cu || !v.bool(body.override)) {
          throw new ApiError(409, `وصلتم للحد الأقصى من المستخدمين في باقتكم (${arabicCount(max, USERS_FORMS)}). أوقفوا حسابًا غير مستخدم أو تواصلوا مع مدير علاقتكم لدينا.`, 'max_users', { max });
        }
        if (actor?.role !== 'admin') throw forbidden('تجاوز حد المستخدمين في الباقة متاح لدور «إدارة النظام» فقط');
      }
      const uid = newUserRow(c.id, data, cu ? { kind: 'company', company_user_id: cu.id } : { kind: 'staff', user_id: actor?.id ?? null });
      const u = requireUser(uid);
      const invite = app.companyAuth.sendInvite(ctx, u, c, cu ? { kind: 'company', company_user_id: cu.id, name: cu.name } : { kind: 'staff', user_id: actor?.id ?? null });
      audit(cu ? companyActor(cu, c) : actor, ctx, c, {
        type: 'company.user_invited',
        company_user_id: cu ? cu.id : u.id,
        summary: `دعوة ${u.name} (${label('company_user_role', u.role)}) إلى بوابة ${c.name}${cu ? ` بواسطة ${cu.name}` : ''}`,
        data: { invited_company_user_id: u.id, role: u.role, emailed: invite.emailed, override: !cu && max !== null && usersCount(c.id) > max },
      });
      if (!cu) app.companyNotify?.teamChangedByStaff(c.id, u.name);
      return { user: userView(u, { staff: !cu }), invite };
    },

    /**
     * تعديل مستخدم من الإدارة (S؛ البريد والترقية إلى «مدير البوابة» = A، L-60). تغيير البريد ينهي الجلسات والروابط المفتوحة
     * ويرسل إشعارًا أمنيًا إلى البريد القديم. كل تعديل من الإدارة يُبلَّغ به مديرو البوابة.
     */
    updateUserByStaff(uid, body = {}, actor, ctx) {
      const u = requireUser(uid);
      const c = requireCompany(u.company_id);
      const patch = {};
      if (body.name !== undefined) patch.name = plainName(body.name, 'الاسم', { required: true, min: 2, max: 120, field: 'name' });
      if (body.job_title !== undefined) patch.job_title = plainName(body.job_title, 'الوظيفة', { max: 120, field: 'job_title' });
      if (body.phone !== undefined) patch.phone = v.phone(body.phone, 'رقم الهاتف');
      if (body.role !== undefined) patch.role = v.oneOf(body.role, ROLES, 'الدور', { required: true });
      if (body.billing_contact !== undefined) patch.billing_contact = v.bool(body.billing_contact) ? 1 : 0;
      if (body.active !== undefined) patch.active = v.bool(body.active) ? 1 : 0;
      if (body.email !== undefined) patch.email = v.email(body.email, 'البريد الإلكتروني', { required: true });
      const emailChange = patch.email !== undefined && patch.email.toLowerCase() !== String(u.email).toLowerCase();
      if (!emailChange) delete patch.email;
      if ((emailChange || (patch.role === 'company_admin' && u.role !== 'company_admin')) && actor?.role !== 'admin') {
        throw forbidden('تغيير البريد الإلكتروني أو الترقية إلى «مدير البوابة» متاح لدور «إدارة النظام» فقط');
      }
      if (emailChange && db.get('SELECT 1 FROM company_users WHERE email = ? AND id != ?', patch.email, u.id)) throw new ApiError(409, 'هذا البريد مسجل بالفعل لمستخدم آخر في بوابة الشركات', 'email_taken', { fields: { email: 'البريد مسجل بالفعل' } });
      return applyUserPatch(u, c, patch, { actor, ctx, byStaff: true, emailChange });
    },

    /** تعديل زميل من مدير البوابة: الدور، جهة الفواتير، الإيقاف (لا البريد، ولا حسابه هو) */
    updateUserByCompany(cu, uid, body = {}, ctx) {
      const c = requireCompany(cu.company_id);
      const u = db.get('SELECT * FROM company_users WHERE id = ? AND company_id = ?', Number(uid) || 0, cu.company_id);
      if (!u) throw notFound('المستخدم غير موجود');
      if (u.id === cu.id) throw forbidden('لا يمكن تعديل حسابكم من صفحة الفريق؛ استخدموا «حسابي والأمان».');
      const patch = {};
      if (body.role !== undefined) patch.role = v.oneOf(body.role, ROLES, 'الدور', { required: true });
      if (body.billing_contact !== undefined) patch.billing_contact = v.bool(body.billing_contact) ? 1 : 0;
      if (body.active !== undefined) patch.active = v.bool(body.active) ? 1 : 0;
      if (body.job_title !== undefined) patch.job_title = plainName(body.job_title, 'الوظيفة', { max: 120, plural: true, field: 'job_title' });
      if (patch.active === 1 && !u.active) {
        const max = maxUsersOf(c.id);
        if (max !== null && usersCount(c.id) >= max) throw new ApiError(409, `وصلتم للحد الأقصى من المستخدمين في باقتكم (${arabicCount(max, USERS_FORMS)}). أوقفوا حسابًا غير مستخدم أو تواصلوا مع مدير علاقتكم لدينا.`, 'max_users', { max });
      }
      return applyUserPatch(u, c, patch, { cu, ctx, byStaff: false, emailChange: false });
    },

    /** إعادة إصدار الدعوة: من الإدارة (S) أو من مدير البوابة (ضمن حد اليوم) */
    resendInvite(uid, { actor = null, cu = null, ctx = null } = {}) {
      const u = cu ? db.get('SELECT * FROM company_users WHERE id = ? AND company_id = ?', Number(uid) || 0, cu.company_id) : requireUser(uid);
      if (!u) throw notFound('المستخدم غير موجود');
      const c = requireCompany(u.company_id);
      if (!u.invite_pending) throw conflict(cu ? 'فعّل هذا الزميل حسابه بالفعل.' : 'فعّل المستخدم حسابه بالفعل');
      if (!u.active) throw conflict(cu ? 'هذا الحساب موقوف.' : 'الحساب موقوف');
      if (isReadOnly(c)) throw new ApiError(403, 'حساب شركتكم في وضع الاطلاع فقط؛ لا يمكن دعوة مستخدمين الآن.', 'company_read_only');
      if (cu) checkDailyTeamLinks(c.id);
      const invite = app.companyAuth.sendInvite(ctx, u, c, cu ? { kind: 'company', company_user_id: cu.id, name: cu.name } : { kind: 'staff', user_id: actor?.id ?? null });
      audit(cu ? companyActor(cu, c) : actor, ctx, c, { type: 'company.user_invite_resent', company_user_id: cu ? cu.id : u.id, summary: `إعادة إصدار دعوة ${u.name} لبوابة ${c.name}`, data: { invited_company_user_id: u.id, emailed: invite.emailed } });
      return { user: userView(u, { staff: !cu }), invite };
    },

    /**
     * رابط تعيين كلمة المرور: من الإدارة (A) يعود مرة واحدة للنسخ، ومن مدير البوابة بالبريد فقط — وإن تعذر البريد
     * فـ 409 ask_team (L-60؛ لا رابط لزميل أبدًا).
     */
    resetLink(uid, { actor = null, cu = null, ctx = null } = {}) {
      const u = cu ? db.get('SELECT * FROM company_users WHERE id = ? AND company_id = ?', Number(uid) || 0, cu.company_id) : requireUser(uid);
      if (!u) throw notFound('المستخدم غير موجود');
      const c = requireCompany(u.company_id);
      if (u.invite_pending) throw conflict(cu ? 'لم يفعّل هذا الزميل حسابه بعد؛ أعيدوا إرسال الدعوة بدلًا من ذلك.' : 'لم يقبل المستخدم دعوته بعد؛ أعد إصدار الدعوة');
      if (!u.active) throw conflict(cu ? 'هذا الحساب موقوف.' : 'الحساب موقوف');
      if (cu) {
        if (u.id === cu.id) throw forbidden('لتغيير كلمة مروركم استخدموا «حسابي والأمان».');
        if (!app.email?.enabled?.()) throw new ApiError(409, 'لا يمكن إرسال الرابط بالبريد الآن. اطلبوا من فريقكم القانوني إرسال رابط جديد.', 'ask_team');
        checkDailyTeamLinks(c.id);
      }
      const r = app.companyAuth.sendReset(ctx, u, c, cu ? { kind: 'company', company_user_id: cu.id } : { kind: 'staff', user_id: actor?.id ?? null });
      if (cu && !r.emailed) throw new ApiError(409, 'لا يمكن إرسال الرابط بالبريد الآن. اطلبوا من فريقكم القانوني إرسال رابط جديد.', 'ask_team');
      audit(cu ? companyActor(cu, c) : actor, ctx, c, { type: 'company_auth.reset_link_issued', severity: 'warning', company_user_id: u.id, summary: `إصدار رابط تعيين كلمة المرور لحساب «${u.email}» (${c.name})${cu ? ` بطلب من ${cu.name}` : ''}`, data: { emailed: r.emailed } });
      if (!cu) app.companyNotify?.teamChangedByStaff(c.id, u.name);
      return cu ? { user: userView(u), reset: { emailed: true, expires_at: r.expires_at } } : { user: userView(u, { staff: true }), reset: r };
    },

    /** إنهاء كل جلسات مستخدم: من الإدارة (A) أو من مدير البوابة لزميل */
    revokeSessions(uid, { actor = null, cu = null, ctx = null } = {}) {
      const u = cu ? db.get('SELECT * FROM company_users WHERE id = ? AND company_id = ?', Number(uid) || 0, cu.company_id) : requireUser(uid);
      if (!u) throw notFound('المستخدم غير موجود');
      const c = requireCompany(u.company_id);
      const n = app.companyAuth.revokeUserSessions(u.id);
      audit(cu ? companyActor(cu, c) : actor, ctx, c, { type: 'company_auth.sessions_revoked', severity: 'warning', company_user_id: u.id, summary: `إنهاء كل جلسات «${u.email}» (${c.name})${cu ? ` بواسطة ${cu.name}` : ' بواسطة الإدارة'}`, data: { count: n } });
      if (!cu) app.companyNotify?.teamChangedByStaff(c.id, u.name);
      return { revoked: n, user: userView(requireUser(u.id), { staff: !cu }) };
    },

    /** إلغاء التحقق بخطوتين لمستخدم (A) */
    resetTwoFactor(uid, actor, ctx) {
      const u = requireUser(uid);
      const c = requireCompany(u.company_id);
      db.tx(() => {
        db.run('DELETE FROM company_user_2fa WHERE company_user_id = ?', u.id);
        db.run('DELETE FROM company_recovery_codes WHERE company_user_id = ?', u.id);
      });
      const n = app.companyAuth.revokeUserSessions(u.id);
      audit(actor, ctx, c, { type: 'company_auth.2fa_reset_by_staff', severity: 'warning', company_user_id: u.id, summary: `إلغاء التحقق بخطوتين لحساب «${u.email}» (${c.name}) وإنهاء ${n} جلسة`, data: { sessions_revoked: n } });
      app.companyNotify?.teamChangedByStaff(c.id, u.name);
      return { user: userView(requireUser(u.id), { staff: true }) };
    },

    /** رفع الإيقاف المؤقت (A) */
    unlock(uid, actor, ctx) {
      const u = requireUser(uid);
      const c = requireCompany(u.company_id);
      const n = db.run('DELETE FROM company_login_locks WHERE company_user_id = ?', u.id).changes;
      db.update('company_users', u.id, { locked_until: null, failed_login_count: 0, updated_at: nowIso() });
      audit(actor, ctx, c, { type: 'company_auth.unlocked', company_user_id: u.id, summary: `رفع الإيقاف المؤقت عن «${u.email}» (${c.name})`, data: { sources: n } });
      return { user: userView(requireUser(u.id), { staff: true }) };
    },

    // ===================== البوابة: الفريق والزملاء والملف =====================
    /** صفحة «الفريق» لمدير البوابة (U10-67) */
    team(cu) {
      const users = db.all('SELECT * FROM company_users WHERE company_id = ? ORDER BY active DESC, CASE role WHEN \'company_admin\' THEN 0 WHEN \'member\' THEN 1 ELSE 2 END, name', cu.company_id);
      return { items: users.map((u) => ({ ...userView(u), me: u.id === cu.id })), count: usersCount(cu.company_id), max_users: maxUsersOf(cu.company_id) };
    },
    /** الزملاء النشطون (للمتابعين؛ بلا بريد — D9، CO-25) */
    colleagues(cu) {
      return {
        items: db
          .all('SELECT id, name, role FROM company_users WHERE company_id = ? AND active = 1 AND invite_pending = 0 ORDER BY name', cu.company_id)
          .map((u) => ({ id: u.id, name: u.name, role: u.role, role_label: label('company_user_role', u.role) })),
      };
    },
    /** «بيانات الشركة» (U10-78) */
    profile(cu, company) {
      const c = get(company.id);
      return {
        name: c.name,
        legal_name: c.legal_name || null,
        commercial_registry: c.commercial_registry || null,
        tax_id: c.tax_id || null,
        address: c.address || null,
        industry: c.industry || null,
        size_band: c.size_band || null,
        status: c.status,
        status_label: label('company_status', c.status),
        plan_label: planLabel(activeSubscription(c.id)),
        account_manager: visibleAccountManager(c),
        contracting_entity: contractingEntity(),
        require_2fa: !!c.require_2fa,
        entities_count: entitiesCount(c.id),
        can_edit: cu.role === 'company_admin',
      };
    },
    updateProfile(cu, company, body = {}, ctx) {
      const c = get(company.id);
      const patch = svc.profileFields(body, { plural: true });
      if (body.require_2fa !== undefined) patch.require_2fa = v.bool(body.require_2fa) ? 1 : 0;
      const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (c[k] ?? null));
      if (changed.length) {
        db.update('companies', c.id, { ...Object.fromEntries(changed.map((k) => [k, patch[k]])), updated_at: nowIso() });
        audit(companyActor(cu, c), ctx, c, { type: 'company.updated', company_user_id: cu.id, summary: `عدّل ${cu.name} بيانات الشركة «${c.name}»: ${changed.join('، ')}`, data: { fields: changed } });
      }
      return svc.profile(cu, get(c.id));
    },

    // ===================== دورة حياة الشركات (مهمة b2b.reminders؛ SRV-13، CO-20، CS-16) =====================
    /**
     * نهاية الفترة التجريبية ← «للاطلاع فقط» (status_reason = trial_ended) مع إشعار الشركة والفريق؛ تنبيه قبلها بـ 3 أيام
     * مرة واحدة (automation_runs)؛ والاشتراك اليدوي بعد ends_on ← منتهٍ مع إشعار الفريق «حدِّد الخطوة التالية».
     */
    runLifecycle() {
      const out = { trial_ending: 0, trial_ended: 0, subscriptions_ended: 0 };
      const t = nowIso();
      const nowMs = now().getTime();
      const DAYS = ['يوم واحد', 'يومين', 'أيام', 'يومًا'];
      for (const c of db.all("SELECT * FROM companies WHERE status = 'trial' AND trial_ends_at IS NOT NULL ORDER BY id")) {
        const mgr = accountManagerOf(c);
        const adminIds = app.companyNotify.admins(c.id).map((u) => u.id);
        if (c.trial_ends_at <= t) {
          const ch = db.run("UPDATE companies SET status = 'suspended', status_reason = 'trial_ended', updated_at = ? WHERE id = ? AND status = 'trial'", t, c.id).changes;
          if (!ch) continue;
          audit(SYSTEM_ACTOR, null, c, { type: 'company.status_changed', severity: 'warning', summary: `انتهت الفترة التجريبية لـ«${c.name}» فأصبح حسابها للاطلاع فقط`, data: { from: 'trial', to: 'suspended', reason: 'trial_ended' } });
          app.companyNotify.notify(adminIds, {
            companyId: c.id,
            type: 'company.suspended',
            title: 'حساب شركتكم للاطلاع فقط',
            body: 'انتهت الفترة التجريبية. يمكنكم عرض الطلبات والمستندات وتنزيلها، ولا يمكن إرسال طلبات جديدة حتى اختيار الباقة.',
            link: '#/',
            email: { template: 'trial', vars: { subject: 'انتهت الفترة التجريبية', line: 'انتهت الفترة التجريبية لبوابة شركتكم، وأصبح الحساب للاطلاع فقط حتى اختيار الباقة.' } },
          });
          app.notifications.notifyStaff({ type: 'company.suspended', title: `انتهت الفترة التجريبية لـ${c.name} — الحساب للاطلاع فقط`, link: `#/companies/${c.id}` }, { caseManagerId: mgr?.id ?? null });
          out.trial_ended += 1;
          continue;
        }
        const leftMs = Date.parse(c.trial_ends_at) - nowMs;
        if (leftMs > 3 * 86400000) continue;
        const days = Math.max(1, Math.ceil(leftMs / 86400000));
        app.companyNotify.once('b2b.trial_ending', `${c.id}:${c.trial_ends_at}`, () => {
          app.companyNotify.notify(adminIds, {
            companyId: c.id,
            type: 'company.trial_ending',
            title: `تنتهي الفترة التجريبية خلال ${arabicCount(days, DAYS)}`,
            body: settingsOf(c).show_account_manager && mgr ? `تواصلوا مع مدير علاقتكم لدينا: ${mgr.name} لاختيار الباقة.` : 'تواصلوا مع فريقكم القانوني لاختيار الباقة.',
            link: '#/plan',
            email: { template: 'trial', vars: { subject: 'تقترب نهاية الفترة التجريبية', line: `تنتهي الفترة التجريبية لبوابة شركتكم خلال ${arabicCount(days, DAYS)}.` } },
          });
          app.notifications.notifyStaff({ type: 'company.trial_ending', title: `تنتهي الفترة التجريبية لـ${c.name} خلال ${arabicCount(days, DAYS)}`, link: `#/companies/${c.id}` }, { caseManagerId: mgr?.id ?? null });
          out.trial_ending += 1;
        });
      }
      const today = cairoDayKey(now());
      for (const s of db.all("SELECT * FROM company_subscriptions WHERE status = 'active' AND renews = 'manual' AND ends_on IS NOT NULL AND ends_on < ? ORDER BY id", today)) {
        const ch = db.run("UPDATE company_subscriptions SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'active'", t, s.id).changes;
        if (!ch) continue;
        const c = get(s.company_id);
        audit(SYSTEM_ACTOR, null, c, { type: 'company.subscription_changed', summary: `انتهى اشتراك «${c.name}» (تجديد يدوي، حتى ${s.ends_on})`, data: { subscription_id: s.id, ended: true } });
        app.notifications.notifyStaff({ type: 'company.subscription_ended', title: `انتهى اشتراك ${c.name} — حدِّد الخطوة التالية`, link: `#/companies/${c.id}` }, { caseManagerId: accountManagerOf(c)?.id ?? null });
        out.subscriptions_ended += 1;
      }
      return out;
    },

    // ===================== نظرة عامة لفريق المكتب (8.1.15 بلا المطالبات) =====================
    /** GET /api/admin/b2b/overview — S؛ mrr_minor لمدير النظام فقط. badge = ما يحتاج الفريق (U10-S01) */
    overview(actor) {
      const counts = (sql, ...p) => Object.fromEntries(db.all(sql, ...p).map((r) => [r.k, Number(r.n)]));
      const st = counts('SELECT status AS k, COUNT(*) AS n FROM companies GROUP BY status');
      const q = counts("SELECT status AS k, COUNT(*) AS n FROM company_requests WHERE status IN ('submitted','awaiting_company','in_progress','delivered') GROUP BY status");
      let atRisk = 0;
      let late = 0;
      let paused = 0;
      let needs = 0;
      for (const r of db.all("SELECT * FROM company_requests WHERE status IN ('submitted','awaiting_company','in_progress')")) {
        const s = app.companyRequests.staffSla(r);
        if (s.state === 'late') late += 1;
        else if (s.state === 'at_risk') atRisk += 1;
        else if (s.state === 'paused') paused += 1;
        const flags = parseJson(r.flags, []) || [];
        if (r.escalated_at || ['clarification_answered', 'quote_approved', 'changes_requested', 'plan_error', 'memory_pending'].some((f) => flags.includes(f))) needs += 1;
      }
      const today = cairoDayKey(now());
      const in30 = cairoDayKey(new Date(now().getTime() + 30 * 86400000));
      const out = {
        companies: { trial: st.trial || 0, active: st.active || 0, past_due: st.past_due || 0, suspended: st.suspended || 0, ended: st.ended || 0, total: Object.values(st).reduce((a, b) => a + b, 0) },
        queue: { submitted: q.submitted || 0, awaiting_company: q.awaiting_company || 0, in_progress: q.in_progress || 0, delivered: q.delivered || 0 },
        sla: { at_risk: atRisk, late, paused },
        escalated: Number(db.value("SELECT COUNT(*) FROM company_requests WHERE escalated_at IS NOT NULL AND status IN ('submitted','awaiting_company','in_progress','delivered')")),
        renewals_30d: Number(db.value('SELECT COUNT(*) FROM company_memory m JOIN companies c ON c.id = m.company_id WHERE m.archived_at IS NULL AND m.next_date >= ? AND m.next_date <= ? AND c.status != ?', today, in30, 'ended')),
        memory_under_review: Number(db.value("SELECT COUNT(*) FROM company_memory WHERE status = 'under_review' AND archived_at IS NULL")),
        needs_staff: needs,
      };
      out.badge = out.queue.submitted + needs + late;
      if (actor?.role === 'admin') {
        let mrr = 0;
        for (const s of db.all("SELECT s.terms FROM company_subscriptions s JOIN companies c ON c.id = s.company_id WHERE s.status = 'active' AND c.status IN ('active','past_due')")) {
          const tm = parseJson(s.terms, {}) || {};
          const p = Number(tm.price_minor) || 0;
          mrr += tm.billing_period === 'annual' ? p / 12 : tm.billing_period === 'quarterly' ? p / 3 : p;
        }
        out.mrr_minor = Math.round(mrr);
      }
      return out;
    },

    // ===================== إعدادات خدمة الشركات (PUT /api/admin/b2b/settings؛ حارس #23) =====================
    b2bSettings() {
      const keys = Object.keys(DEFAULT_SETTINGS).filter((k) => k.startsWith('b2b_') || k.startsWith('company_'));
      const all = app.settings.all();
      return { values: Object.fromEntries(keys.map((k) => [k, all[k] ?? DEFAULT_SETTINGS[k]])), defaults: Object.fromEntries(keys.map((k) => [k, DEFAULT_SETTINGS[k]])), office_hours_schedule: all.office_hours_schedule ?? null };
    },
    saveB2bSettings(body = {}, actor, ctx) {
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('بيانات غير صالحة');
      const src = body.values && typeof body.values === 'object' ? body.values : body;
      const out = {};
      const errors = {};
      for (const [k, val] of Object.entries(src)) {
        const rule = B2B_SETTING_RULES[k];
        if (!rule) {
          errors[k] = 'إعداد غير معروف';
          continue;
        }
        const r = rule(val);
        if (r.error) errors[k] = r.error;
        else out[k] = r.value;
      }
      const idle = out.company_session_idle_hours ?? app.settings.get('company_session_idle_hours');
      const max = out.company_session_max_hours ?? app.settings.get('company_session_max_hours');
      if (Number(max) < Number(idle)) errors.company_session_max_hours = 'المدة القصوى للجلسة يجب ألا تقل عن مدة الخمول';
      if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], { fields: errors });
      if (!Object.keys(out).length) throw badRequest('لم تُرسل أي قيم لتحديثها');
      for (const [k, val] of Object.entries(out)) app.settings.set(k, val);
      app.audit.log({ actor, ctx, type: 'company.settings_updated', severity: 'warning', summary: `تحديث إعدادات خدمة الشركات: ${Object.keys(out).join('، ')}`, data: { keys: Object.keys(out) } });
      return svc.b2bSettings();
    },

    // ===================== الفريق المفضل (للإدارة فقط) =====================
    pod(companyId) {
      return db
        .all('SELECT t.lawyer_id, t.role, t.note, u.name FROM company_team t JOIN users u ON u.id = t.lawyer_id WHERE t.company_id = ? ORDER BY t.role, u.name', companyId)
        .map((r) => ({ lawyer_id: r.lawyer_id, name: r.name, role: r.role, role_label: label('company_pod_role', r.role), note: r.note || null }));
    },
    setPod(companyId, items, actor) {
      const c = requireCompany(companyId);
      if (!Array.isArray(items)) throw badRequest('القائمة غير صالحة');
      if (items.length > 50) throw badRequest('القائمة أطول من المسموح');
      const rows = items.map((it) => {
        const lawyerId = v.int(it?.lawyer_id, 'المحامي', { required: true, min: 1 });
        if (!db.get("SELECT 1 FROM users WHERE id = ? AND role = 'lawyer'", lawyerId)) throw badRequest('المحامي غير موجود');
        return { lawyer_id: lawyerId, role: v.oneOf(it.role, POD_ROLES, 'الدور', { required: true }), note: v.str(it.note, 'ملاحظة', { max: 300 }) };
      });
      const t = nowIso();
      db.tx(() => {
        db.run('DELETE FROM company_team WHERE company_id = ?', c.id);
        for (const r of rows) db.run('INSERT OR REPLACE INTO company_team (company_id, lawyer_id, role, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', c.id, r.lawyer_id, r.role, r.note, actor?.id ?? null, t);
      });
      activity(actor, c, { type: 'company.pod_updated', summary: `تحديث الفريق المفضل لـ${c.name} (${rows.length})` });
      return { items: svc.pod(c.id) };
    },
  };

  /** تطبيق تعديل مستخدم (مشترك بين الإدارة ومدير البوابة) مع قاعدة آخر مدير ونتائجها */
  function applyUserPatch(u, c, patch, { actor = null, cu = null, ctx = null, byStaff, emailChange }) {
    const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (u[k] ?? null));
    if (!changed.length) return { user: userView(u, { staff: byStaff }) };
    const losingAdmin = u.role === 'company_admin' && u.active && !u.invite_pending && ((patch.role && patch.role !== 'company_admin') || patch.active === 0);
    if (losingAdmin && c.status !== 'ended' && activeAdminsCount(c.id, u.id) === 0) throw lastAdminError();
    const t = nowIso();
    const oldEmail = u.email;
    db.tx(() => {
      db.update('company_users', u.id, { ...Object.fromEntries(changed.map((k) => [k, patch[k]])), deactivated_at: patch.active === 0 ? t : patch.active === 1 ? null : undefined, updated_at: t });
    });
    const who = byStaff ? actor : companyActor(cu, c);
    let revoked = 0;
    if (patch.active === 0 || emailChange) revoked = app.companyAuth.revokeUserSessions(u.id);
    if (emailChange) {
      app.companyAuth.revokeOpenTokens(u.id);
      app.email?.send('security_old_email', { to: oldEmail, name: u.name, company: c, companyUserId: u.id, security: true });
      audit(who, ctx, c, { type: 'company.user_email_changed', severity: 'warning', company_user_id: u.id, summary: `تغيير بريد مستخدم الشركة ${u.name} (${c.name}) وإنهاء جلساته وروابطه المفتوحة`, data: { sessions_revoked: revoked } });
    }
    if (patch.role && patch.role !== u.role) {
      audit(who, ctx, c, { type: 'company.user_role_changed', severity: patch.role === 'company_admin' ? 'warning' : 'info', company_user_id: byStaff ? u.id : cu.id, summary: `تغيير دور ${u.name} في ${c.name} من «${label('company_user_role', u.role)}» إلى «${label('company_user_role', patch.role)}»`, data: { target_company_user_id: u.id, from: u.role, to: patch.role } });
    }
    if (patch.active === 0 && u.active) {
      audit(who, ctx, c, { type: 'company.user_deactivated', severity: 'warning', company_user_id: byStaff ? u.id : cu.id, summary: `إيقاف حساب ${u.name} في ${c.name}${revoked ? ` وإنهاء ${revoked} جلسة` : ''}`, data: { target_company_user_id: u.id } });
    }
    if (patch.active === 1 && !u.active) audit(who, ctx, c, { type: 'company.user_reactivated', company_user_id: byStaff ? u.id : cu.id, summary: `إعادة تفعيل حساب ${u.name} في ${c.name}`, data: { target_company_user_id: u.id } });
    const other = changed.filter((k) => !['role', 'active', 'email'].includes(k));
    if (other.length) audit(who, ctx, c, { type: 'company.user_updated', company_user_id: byStaff ? u.id : cu.id, summary: `تعديل بيانات ${u.name} في ${c.name}: ${other.join('، ')}`, data: { target_company_user_id: u.id, fields: other } });
    if (byStaff) app.companyNotify?.teamChangedByStaff(c.id, patch.name || u.name);
    return { user: userView(requireUser(u.id), { staff: byStaff }) };
  }

  return svc;
}
