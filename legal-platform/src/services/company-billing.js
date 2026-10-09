// الإصدار 10 — باقات الشركات واشتراكاتها واستخدامها والتكاليف الإضافية المعتمدة (L-28، L-31، L-53، L-54، L-62).
// الفوترة في 10.0 = الباقات، والاشتراك بلقطة من الشروط، والاستخدام في دورات شهرية مثبتة على يوم بداية الاشتراك،
// وسجل تكاليف إضافية (لا فواتير ولا مدفوعات — 10.1). لا تكلفة مفاجئة: كل تكلفة تتبع موافقة الشركة أو شرطًا رأته قبل الإرسال
// ويُبلَّغ بها مديرو البوابة وجهات الفواتير (INV-B10). المبالغ مخزنة بالقرش وتُعرض للشركة بالجنيه.
import { nowIso, now, badRequest, notFound, forbidden, ApiError, v, parseJson, formatEgp } from '../util.js';
import { LABELS } from '../constants.js';
import { REQUEST_TYPE_KEYS, EXCLUDED_WORK, typeByKey } from '../../public/assets/js/lib/company-catalog.js';
import {
  calendars,
  calendarJson,
  promisePreview,
  usageCycle,
  cycleBounds,
  nextPeriodStart,
  businessHoursText,
  urgentHoursText,
  businessMinutesBetween,
  cairoDayKey,
  slaFor,
} from '../../public/assets/js/lib/company-sla.js';
import { visibleRequestSql, readableMemorySql, companyActor } from './companies.js';

const TIERS = ['starter', 'growth', 'enterprise', 'custom'];
const PERIODS = ['monthly', 'quarterly', 'annual'];
const POLICIES = ['approve', 'bill', 'block'];
const SENIOR = ['always', 'high_risk', 'never'];
const SLA_KEYS = ['urgent', 'high', 'normal', 'low'];
const EXCLUDED_KEYS = EXCLUDED_WORK.map((x) => x.key);
const label = (group, key) => LABELS[group]?.[key] || key || '';
const major = (minor) => (minor === null || minor === undefined ? null : Math.round(Number(minor)) / 100);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** شروط افتراضية معقولة لشروط خاصة ناقصة */
export const TERMS_DEFAULTS = Object.freeze({
  tier: 'custom',
  billing_period: 'monthly',
  price_minor: null,
  currency: 'EGP',
  included_requests: null,
  urgent_per_month: null,
  included_hours: null,
  max_entities: 1,
  max_users: null,
  overage_policy: 'approve',
  overage_price_minor: null,
  contract_value_cap_minor: null,
  scope_types: REQUEST_TYPE_KEYS,
  excluded_work: ['litigation', 'arbitration', 'mna', 'criminal', 'debt_collection', 'due_diligence'],
  sla: {
    urgent: { first_response_hours: 2, delivery_hours: 8, clock: 'calendar' },
    high: { first_response_hours: 3, delivery_hours: 12, clock: 'business' },
    normal: { first_response_hours: 6, delivery_hours: 18, clock: 'business' },
    low: { first_response_hours: 12, delivery_hours: 30, clock: 'business' },
  },
  size_factor: { S: 0.5, M: 1, L: 2 },
  senior_review: 'high_risk',
  revision_rounds: 2,
});

/**
 * التحقق من شروط الباقة (B10 §6.1 + urgent_per_month؛ لا ساعات في 10.0، L-31). يعيد نسخة نظيفة بالمفاتيح المعروفة فقط.
 * الساعات 1–720، معاملات الحجم 0.25–5، الأنواع والأعمال المستبعدة من الكتالوج، والحجم ≤ 8 كيلوبايت.
 */
export function validateTerms(input, { base = TERMS_DEFAULTS } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('شروط الباقة غير صالحة');
  if (JSON.stringify(input).length > 8192) throw badRequest('شروط الباقة أطول من المسموح');
  const src = { ...base, ...input };
  const errors = {};
  const out = {};
  const int = (k, l, { min = 0, max = 1e9, nullable = false } = {}) => {
    const val = src[k];
    if ((val === null || val === undefined || val === '') && nullable) return null;
    const n = Number(val);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors[k] = `«${l}» يجب أن يكون عددًا صحيحًا بين ${min} و${max}`;
      return null;
    }
    return n;
  };
  const oneOf = (k, list, l) => {
    if (!list.includes(src[k])) errors[k] = `قيمة «${l}» غير مسموح بها`;
    return src[k];
  };
  out.tier = oneOf('tier', TIERS, 'الفئة');
  out.billing_period = oneOf('billing_period', PERIODS, 'فترة الاشتراك');
  out.price_minor = int('price_minor', 'سعر الاشتراك', { min: 0, max: 1e11, nullable: true });
  out.currency = 'EGP';
  out.included_requests = int('included_requests', 'الطلبات المشمولة شهريًا', { min: 0, max: 10000, nullable: true });
  out.urgent_per_month = int('urgent_per_month', 'الطلبات العاجلة في الدورة', { min: 0, max: 1000, nullable: true });
  out.included_hours = src.included_hours === null || src.included_hours === undefined || src.included_hours === '' ? null : Number(src.included_hours);
  if (out.included_hours !== null && !(out.included_hours >= 0 && out.included_hours <= 10000)) errors.included_hours = '«الساعات المشمولة» خارج النطاق';
  out.max_entities = int('max_entities', 'عدد الكيانات', { min: 1, max: 500 });
  out.max_users = int('max_users', 'عدد المستخدمين', { min: 1, max: 5000, nullable: true });
  out.overage_policy = oneOf('overage_policy', POLICIES, 'سياسة تجاوز الباقة');
  out.overage_price_minor = int('overage_price_minor', 'سعر الطلب الإضافي', { min: 0, max: 1e11, nullable: true });
  if (out.overage_policy === 'bill' && out.overage_price_minor === null) errors.overage_price_minor = 'حدد سعر الطلب الإضافي عند اختيار إضافة التكلفة تلقائيًا';
  out.contract_value_cap_minor = int('contract_value_cap_minor', 'الحد الأقصى لقيمة العقد', { min: 0, max: 1e14, nullable: true });
  const types = Array.isArray(src.scope_types) ? [...new Set(src.scope_types)] : null;
  if (!types || types.some((t) => !REQUEST_TYPE_KEYS.includes(t))) errors.scope_types = 'أنواع الطلبات المشمولة غير صالحة';
  out.scope_types = types || [];
  const ex = Array.isArray(src.excluded_work) ? [...new Set(src.excluded_work)] : null;
  if (!ex || ex.some((t) => !EXCLUDED_KEYS.includes(t))) errors.excluded_work = 'الأعمال المستبعدة غير صالحة';
  out.excluded_work = ex || [];
  out.sla = {};
  const sla = src.sla && typeof src.sla === 'object' ? src.sla : {};
  for (const p of SLA_KEYS) {
    const s = sla[p] || base.sla?.[p] || TERMS_DEFAULTS.sla[p];
    const fr = Number(s?.first_response_hours);
    const dl = Number(s?.delivery_hours);
    const clock = s?.clock === 'calendar' ? 'calendar' : s?.clock === 'business' ? 'business' : null;
    if (!(fr >= 1 && fr <= 720) || !(dl >= 1 && dl <= 720) || dl < fr || !clock) errors[`sla.${p}`] = `مواعيد «${label('priority', p)}» غير صالحة (1–720 ساعة، والتسليم بعد الرد الأول)`;
    out.sla[p] = { first_response_hours: fr, delivery_hours: dl, clock: clock || 'business' };
  }
  out.size_factor = {};
  const sf = src.size_factor && typeof src.size_factor === 'object' ? src.size_factor : {};
  for (const k of ['S', 'M', 'L']) {
    const n = Number(sf[k] ?? TERMS_DEFAULTS.size_factor[k]);
    if (!(n >= 0.25 && n <= 5)) errors[`size_factor.${k}`] = 'معامل الحجم بين 0.25 و5';
    out.size_factor[k] = n;
  }
  out.senior_review = oneOf('senior_review', SENIOR, 'المراجعة الثانية');
  out.revision_rounds = int('revision_rounds', 'جولات التعديل', { min: 0, max: 10 });
  if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], { fields: errors });
  return out;
}

export function createCompanyBilling(app) {
  const { db } = app;

  const cals = () => calendars(app.settings.all());
  function activeSubscription(companyId) {
    const s = db.get("SELECT s.*, p.name AS plan_name, p.key AS plan_key FROM company_subscriptions s LEFT JOIN company_plans p ON p.id = s.plan_id WHERE s.company_id = ? AND s.status = 'active'", companyId);
    return s ? { ...s, terms: parseJson(s.terms, {}) || {} } : null;
  }
  function planRow(id) {
    const p = db.get('SELECT * FROM company_plans WHERE id = ?', Number(id) || 0);
    if (!p) throw notFound('الباقة غير موجودة');
    return { ...p, terms: parseJson(p.terms, {}) || {} };
  }
  function planView(p, { money = true } = {}) {
    const terms = { ...p.terms };
    // review (B10 §8.3.1): الأسعار وأرقام الإيراد لمدير النظام فقط؛ مدير الحالات يرى الشروط والأعداد
    if (!money) {
      delete terms.price_minor;
      delete terms.overage_price_minor;
    }
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description || null,
      active: !!p.active,
      terms,
      companies: Number(db.value("SELECT COUNT(*) FROM company_subscriptions WHERE plan_id = ? AND status = 'active'", p.id)),
      updated_at: p.updated_at,
    };
  }
  /** الدورة الحالية (أو التي تحتوي التاريخ at) للاشتراك النشط */
  function cycleOf(sub, at = now()) {
    if (!sub) return null;
    return usageCycle(sub.starts_on, at);
  }

  const svc = {
    validateTerms,
    activeSubscription,
    cycleOf,

    // ===================== الباقات (الإدارة) =====================
    plans({ all = true, money = true } = {}) {
      return { items: db.all(`SELECT * FROM company_plans ${all ? '' : 'WHERE active = 1'} ORDER BY id`).map((p) => planView({ ...p, terms: parseJson(p.terms, {}) || {} }, { money })) };
    },
    createPlan(body = {}, actor, ctx) {
      const key = v.str(body.key, 'مفتاح الباقة', { required: true, max: 40 });
      if (!/^[a-z0-9_-]{2,40}$/.test(key)) throw badRequest('مفتاح الباقة حروف لاتينية صغيرة وأرقام فقط', { fields: { key: 'مثل growth' } });
      if (db.get('SELECT 1 FROM company_plans WHERE key = ?', key)) throw new ApiError(409, 'يوجد باقة بهذا المفتاح', 'conflict');
      const name = app.companies.plainName(body.name, 'اسم الباقة', { required: true, max: 80, field: 'name' });
      const terms = validateTerms(body.terms || {});
      const t = nowIso();
      const id = db.insert('company_plans', { key, name, description: v.str(body.description, 'الوصف', { max: 1000 }), terms: JSON.stringify(terms), active: body.active === false ? 0 : 1, created_by: actor?.id ?? null, created_at: t, updated_at: t });
      app.audit.log({ actor, ctx, type: 'company.plan_saved', summary: `إنشاء باقة شركات «${name}» (${key})`, data: { plan_id: id, key } });
      return planView(planRow(id));
    },
    updatePlan(id, body = {}, actor, ctx) {
      const p = planRow(id);
      const patch = {};
      if (body.name !== undefined) patch.name = app.companies.plainName(body.name, 'اسم الباقة', { required: true, max: 80, field: 'name' });
      if (body.description !== undefined) patch.description = v.str(body.description, 'الوصف', { max: 1000 });
      if (body.active !== undefined) patch.active = v.bool(body.active) ? 1 : 0;
      if (body.terms !== undefined) patch.terms = JSON.stringify(validateTerms(body.terms, { base: p.terms }));
      if (Object.keys(patch).length) {
        db.update('company_plans', p.id, { ...patch, updated_at: nowIso() });
        app.audit.log({ actor, ctx, type: 'company.plan_saved', summary: `تعديل باقة الشركات «${p.name}»: ${Object.keys(patch).join('، ')} (الاشتراكات القائمة تحتفظ بلقطة شروطها)`, data: { plan_id: p.id, fields: Object.keys(patch) } });
      }
      return planView(planRow(p.id));
    },

    // ===================== الاشتراكات =====================
    /** مدخلات الاشتراك من جسم الطلب: plan_id و/أو terms، starts_on، renews، ends_on */
    subscriptionInput(body = {}, { required = false } = {}) {
      let planId = null;
      let terms = null;
      if (body.plan_id !== undefined && body.plan_id !== null && body.plan_id !== '') {
        const p = planRow(body.plan_id);
        if (!p.active) throw badRequest('الباقة غير مفعّلة');
        planId = p.id;
        terms = body.terms ? validateTerms(body.terms, { base: p.terms }) : validateTerms(p.terms);
      } else if (body.terms) {
        terms = validateTerms(body.terms);
      } else if (required) throw badRequest('اختر باقة أو حدد شروطًا خاصة', { fields: { plan_id: 'اختر باقة' } });
      const startsOn = body.starts_on ? String(body.starts_on).slice(0, 10) : cairoDayKey(now());
      if (!DATE_RE.test(startsOn)) throw badRequest('تاريخ بداية الاشتراك غير صالح', { fields: { starts_on: 'YYYY-MM-DD' } });
      const endsOn = body.ends_on ? String(body.ends_on).slice(0, 10) : null;
      if (endsOn && (!DATE_RE.test(endsOn) || endsOn <= startsOn)) throw badRequest('تاريخ نهاية الاشتراك يجب أن يكون بعد بدايته', { fields: { ends_on: 'بعد البداية' } });
      return {
        plan_id: planId,
        terms,
        starts_on: startsOn,
        ends_on: endsOn,
        renews: v.oneOf(body.renews || 'auto', ['auto', 'manual'], 'التجديد', { required: true }),
        note: v.str(body.subscription_note ?? body.note, 'ملاحظة', { max: 500 }),
      };
    },
    startSubscription(companyId, input, actor) {
      return db.insert('company_subscriptions', {
        company_id: companyId,
        plan_id: input.plan_id,
        terms: JSON.stringify(input.terms),
        status: 'active',
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        renews: input.renews,
        note: input.note,
        created_by: actor?.id ?? null,
        created_at: nowIso(),
      });
    },
    /** تغيير الباقة (A، 8.1.11): إنهاء الاشتراك الحالي اليوم وبدء جديد (السجل محفوظ) */
    setSubscription(companyId, body = {}, actor, ctx) {
      const c = app.companies.require(companyId);
      const input = svc.subscriptionInput(body, { required: true });
      const prev = activeSubscription(c.id);
      const t = nowIso();
      db.tx(() => {
        if (prev) db.run("UPDATE company_subscriptions SET status = 'ended', ended_at = ?, ends_on = COALESCE(ends_on, ?) WHERE id = ?", t, cairoDayKey(now()), prev.id);
        svc.startSubscription(c.id, input, actor);
      });
      const sub = activeSubscription(c.id);
      app.audit.log({
        actor,
        ctx,
        company_id: c.id,
        type: 'company.subscription_changed',
        severity: 'warning',
        summary: `تغيير اشتراك «${c.name}» إلى ${sub.plan_name || 'شروط خاصة'} من ${input.starts_on}${prev ? ` (كان ${prev.plan_name || 'شروطًا خاصة'})` : ''}`,
        data: { from_plan_id: prev?.plan_id ?? null, to_plan_id: input.plan_id, starts_on: input.starts_on },
      });
      return svc.subscriptionView(sub, { money: true });
    },
    subscriptionView(sub, { money = false } = {}) {
      if (!sub) return null;
      const terms = { ...sub.terms };
      if (!money) {
        delete terms.price_minor;
        delete terms.overage_price_minor;
      }
      return {
        id: sub.id,
        plan_id: sub.plan_id,
        plan_key: sub.plan_key || null,
        plan_name: sub.plan_name || label('company_plan_tier', sub.terms?.tier) || null,
        tier: sub.terms?.tier || null,
        period: sub.terms?.billing_period || 'monthly',
        period_label: label('company_plan_period', sub.terms?.billing_period || 'monthly'),
        status: sub.status,
        starts_on: sub.starts_on,
        ends_on: sub.ends_on || null,
        renews: sub.renews,
        next_period_starts: nextPeriodStart(sub.starts_on, sub.terms?.billing_period || 'monthly', now()),
        terms,
        created_at: sub.created_at,
      };
    },

    // ===================== الاستخدام والحصة (L-28، L-53) =====================
    /**
     * حصة الدورة الحالية: المستخدم (ما بدأ العمل عليه ضمن الباقة في هذه الدورة)، والمعلّق (طلبات لم تُحتسب بعد —
     * CO-7c)، والطلبات العاجلة الممنوحة في الدورة.
     */
    quota(company, { at = now(), prices = false } = {}) {
      const sub = activeSubscription(company.id);
      if (!sub) return null;
      const cycle = cycleOf(sub, at);
      const b = cycleBounds(cycle);
      const terms = sub.terms;
      const used = Number(db.value("SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND quota_kind = 'included' AND quota_period = ?", company.id, cycle.start));
      const pending = Number(db.value("SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND status IN ('submitted','awaiting_company') AND quota_kind IS NULL", company.id));
      const urgentUsed = Number(
        db.value(
          "SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND requested_priority = 'urgent' AND COALESCE(priority_changed_reason, '') != 'urgent_allowance' AND created_at >= ? AND created_at < ?",
          company.id,
          b.start,
          b.end,
        ),
      );
      const included = terms.included_requests ?? null;
      const out = {
        cycle_start: cycle.start,
        cycle_end: cycle.end,
        used,
        pending,
        included,
        unlimited: included === null,
        policy: terms.overage_policy || 'approve',
        urgent_used: urgentUsed,
        urgent_included: terms.urgent_per_month ?? null,
      };
      if (prices) out.overage_price = major(terms.overage_price_minor);
      return out;
    },

    /**
     * تصنيف طلب عند قبوله (L-28): يُحتسب على دورة الاستخدام التي قُبل فيها. «free» للطلبات التي يقرر الفريق عدم
     * احتسابها، و«out_of_scope» لما يخرج عن نطاق الباقة؛ وإلا «included» ما بقي رصيد وإلا «overage».
     * @returns {{quota_kind: string, quota_period: string|null, remaining: number|null}}
     */
    classify(company, { at = now(), outOfScope = false, free = false, excludeRequestId = null } = {}) {
      const sub = activeSubscription(company.id);
      const cycle = sub ? cycleOf(sub, at) : null;
      const period = cycle ? cycle.start : null;
      if (free) return { quota_kind: 'free', quota_period: period, remaining: null };
      if (outOfScope) return { quota_kind: 'out_of_scope', quota_period: period, remaining: null };
      const included = sub ? (sub.terms.included_requests ?? null) : 0;
      if (included === null) return { quota_kind: 'included', quota_period: period, remaining: null };
      const used = period
        ? Number(db.value("SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND quota_kind = 'included' AND quota_period = ? AND id != ?", company.id, period, excludeRequestId ?? 0))
        : 0;
      const remaining = Math.max(0, included - used);
      return { quota_kind: remaining > 0 ? 'included' : 'overage', quota_period: period, remaining };
    },

    /**
     * إرجاع طلب مشمول إلى رصيد الباقة حين يعتذر الفريق عنه بعد قبوله (CS-19): يصبح «free» مع تدقيق
     * company.quota_released. الحالات الأخرى (سحب الشركة للطلب بعد بدء العمل…) لا تُرجع الرصيد (O-17).
     * @returns {boolean} true إن أُرجع فعلًا
     */
    releaseQuota(request, { actor, ctx = null, reason = 'firm_declined' } = {}) {
      const r = typeof request === 'object' ? request : db.get('SELECT * FROM company_requests WHERE id = ?', request);
      if (!r || r.quota_kind !== 'included') return false;
      db.update('company_requests', r.id, { quota_kind: 'free', updated_at: nowIso() });
      app.audit.log({
        actor: actor || { kind: 'system' },
        ctx,
        type: 'company.quota_released',
        company_id: r.company_id,
        summary: `إرجاع الطلب ${r.code} إلى رصيد الباقة (دورة ${r.quota_period || '—'})`,
        data: { request_id: r.id, code: r.code, quota_period: r.quota_period, reason },
      });
      return true;
    },

    /** «الباقة والاستخدام» (GET /api/company/plan، §4.5): مدخلات الوعد نفسها التي يحسب بها الخادم (L-54) */
    planFor(cu, company) {
      const sub = activeSubscription(company.id);
      const money = cu.role === 'company_admin' || !!cu.billing_contact;
      const c = cals();
      const nowI = nowIso();
      const base = {
        server_now: nowI,
        calendar: calendarJson(c),
        business_hours_text: businessHoursText(c.business),
        urgent_hours_text: urgentHoursText(c.urgent),
        contracting_entity: app.companies.contractingEntity(),
      };
      if (!sub) return { plan: null, ...base, quota: null, promise_preview: null, sla_table: [], scope_types: [], excluded_work: [] };
      const t = sub.terms;
      const period = t.billing_period || 'monthly';
      const plan = {
        name: sub.plan_name || label('company_plan_tier', t.tier),
        tier: t.tier,
        period,
        period_label: label('company_plan_period', period),
        starts_on: sub.starts_on,
        ends_on: sub.ends_on || null,
        next_period_starts: nextPeriodStart(sub.starts_on, period, now()),
      };
      if (money) {
        plan.price = major(t.price_minor);
        plan.currency = 'EGP';
        plan.renews = sub.renews;
      }
      return {
        plan,
        included_requests: t.included_requests ?? null,
        urgent_per_month: t.urgent_per_month ?? null,
        max_users: t.max_users ?? null,
        max_entities: t.max_entities ?? null,
        revision_rounds: t.revision_rounds ?? 0,
        senior_review: t.senior_review || 'never',
        senior_review_label: label('company_senior_review', t.senior_review || 'never'),
        scope_types: t.scope_types || [],
        excluded_work: t.excluded_work || [],
        contract_value_cap: major(t.contract_value_cap_minor),
        sla_table: ['urgent', 'high', 'normal'].map((p) => ({ priority: p, ...slaFor(t, p) })),
        size_factor: t.size_factor || { S: 0.5, M: 1, L: 2 },
        ...base,
        promise_preview: promisePreview(nowI, t, c),
        quota: svc.quota(company, { prices: money }),
      };
    },

    /** الاستخدام لدورة (GET /api/company/usage؛ بلا مبالغ). القوائم والأعداد عبر مسندات الظهور (L-51) */
    usageFor(cu, company, { cycle = null } = {}) {
      const sub = activeSubscription(company.id);
      if (!sub) return { cycle: null, cycles: [], requests: null, sla: null, satisfaction: null, upcoming_renewals: [] };
      const at = cycle && DATE_RE.test(String(cycle)) ? String(cycle) : now();
      const cyc = cycleOf(sub, at);
      const b = cycleBounds(cyc);
      const vis = visibleRequestSql(cu, 'r');
      const inCycle = (col) => `${col} >= ? AND ${col} < ?`;
      const count = (extra, ...params) => Number(db.value(`SELECT COUNT(*) FROM company_requests r WHERE ${vis.sql} AND ${extra}`, ...vis.params, ...params));
      const byType = Object.fromEntries(
        db.all(`SELECT r.type, COUNT(*) AS n FROM company_requests r WHERE ${vis.sql} AND ${inCycle('r.created_at')} GROUP BY r.type`, ...vis.params, b.start, b.end).map((x) => [x.type, Number(x.n)]),
      );
      const quotaCount = (kind) => Number(db.value('SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND quota_kind = ? AND quota_period = ?', company.id, kind, cyc.start));
      const fr = db.all(`SELECT r.first_response_at, r.first_response_due_at FROM company_requests r WHERE ${vis.sql} AND r.first_response_at IS NOT NULL AND ${inCycle('r.first_response_at')}`, ...vis.params, b.start, b.end);
      const dl = db.all(`SELECT r.accepted_at, r.delivered_at, r.delivery_due_at FROM company_requests r WHERE ${vis.sql} AND r.delivered_at IS NOT NULL AND ${inCycle('r.delivered_at')}`, ...vis.params, b.start, b.end);
      const rate = (rows, done, due) => (rows.length ? Math.round((rows.filter((x) => x[due] && x[done] <= x[due]).length / rows.length) * 100) / 100 : null);
      const c = cals();
      const turn = dl.filter((x) => x.accepted_at).map((x) => businessMinutesBetween(x.accepted_at, x.delivered_at, c.business) / 60);
      const rated = db.all(`SELECT r.rating FROM company_requests r WHERE ${vis.sql} AND r.rating IS NOT NULL AND r.closed_at IS NOT NULL AND ${inCycle('r.closed_at')}`, ...vis.params, b.start, b.end);
      const mem = readableMemorySql(cu, 'm');
      const today = cairoDayKey(now());
      const until = cairoDayKey(new Date(now().getTime() + 60 * 86400000));
      const renewals = db
        .all(`SELECT m.id, m.kind, m.title, m.next_date, m.notice_deadline, m.end_date FROM company_memory m WHERE ${mem.sql} AND m.archived_at IS NULL AND m.next_date >= ? AND m.next_date <= ? ORDER BY m.next_date LIMIT 20`, ...mem.params, today, until)
        .map((m) => ({
          memory_id: m.id,
          kind: m.kind,
          kind_label: label('company_memory_kind', m.kind),
          title: m.title,
          date: m.next_date,
          date_kind: m.next_date === m.notice_deadline ? 'notice' : m.next_date === m.end_date ? 'end' : 'next',
          days_left: Math.round((Date.parse(`${m.next_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000),
        }));
      // الدورات السابقة للاختيار (حتى 12 دورة)
      const cycles = [];
      let probe = cycleOf(sub, now());
      for (let i = 0; i < 12 && probe; i++) {
        cycles.push({ start: probe.start, end: probe.end });
        if (probe.start <= sub.starts_on) break;
        const prevDay = new Date(Date.parse(`${probe.start}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
        probe = usageCycle(sub.starts_on, prevDay);
      }
      return {
        cycle: { start: cyc.start, end: cyc.end },
        cycles,
        requests: {
          submitted: count(inCycle('r.created_at'), b.start, b.end),
          accepted: count(`r.accepted_at IS NOT NULL AND ${inCycle('r.accepted_at')}`, b.start, b.end),
          delivered: dl.length,
          closed: count(`r.closed_at IS NOT NULL AND ${inCycle('r.closed_at')}`, b.start, b.end),
          by_type: Object.fromEntries(Object.entries(byType).map(([k, n]) => [k, { count: n, label: typeByKey(k)?.company_label || k }])),
          included_used: quotaCount('included'),
          included_limit: sub.terms.included_requests ?? null,
          overage: quotaCount('overage'),
          out_of_scope: quotaCount('out_of_scope'),
        },
        sla: {
          first_response_met_rate: rate(fr, 'first_response_at', 'first_response_due_at'),
          delivery_met_rate: rate(dl, 'delivered_at', 'delivery_due_at'),
          delivered_on_time: dl.filter((x) => x.delivery_due_at && x.delivered_at <= x.delivery_due_at).length,
          avg_turnaround_business_hours: turn.length ? Math.round((turn.reduce((a, x) => a + x, 0) / turn.length) * 10) / 10 : null,
        },
        satisfaction: { avg_rating: rated.length ? Math.round((rated.reduce((a, x) => a + Number(x.rating), 0) / rated.length) * 10) / 10 : null, count: rated.length },
        upcoming_renewals: renewals,
      };
    },

    // ===================== التكاليف الإضافية (القراءة؛ الإنشاء في SRV-10) =====================
    /** «التكاليف الإضافية المعتمدة» للشركة: مديرو البوابة وجهات الفواتير فقط (L-51) */
    chargesFor(cu, company, { cycle = null } = {}) {
      if (cu.role !== 'company_admin' && !cu.billing_contact) throw forbidden('التكاليف الإضافية متاحة لمديري البوابة وجهات الفواتير في شركتكم.');
      const sub = activeSubscription(company.id);
      const where = ['ch.company_id = ?'];
      const params = [company.id];
      if (cycle && DATE_RE.test(String(cycle)) && sub) {
        where.push('ch.period = ?');
        params.push(cycleOf(sub, String(cycle)).start);
      }
      const vis = visibleRequestSql(cu, 'r');
      const rows = db.all(
        `SELECT ch.*, r.code AS request_code, CASE WHEN r.id IS NULL THEN 1 WHEN ${vis.sql} THEN 1 ELSE 0 END AS visible
         FROM company_charges ch LEFT JOIN company_requests r ON r.id = ch.request_id WHERE ${where.join(' AND ')} ORDER BY ch.id DESC LIMIT 500`,
        ...vis.params,
        ...params,
      );
      const items = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kind_label: label('company_charge_kind', r.kind),
        description: r.description,
        amount: major(r.amount_minor),
        amount_text: formatEgp(r.amount_minor),
        currency: r.currency || 'EGP',
        request_code: r.visible ? r.request_code || null : null,
        cycle: r.period,
        created_at: r.created_at,
        voided: !!r.voided_at,
        replaces_charge_id: r.replaces_charge_id || null,
      }));
      return { items, total_unvoided: major(rows.filter((r) => !r.voided_at).reduce((a, r) => a + Number(r.amount_minor), 0)) };
    },
    /** ملخص التكاليف لصفحة الشركة عند مدير النظام */
    chargesSummary(company) {
      const sub = activeSubscription(company.id);
      const cyc = sub ? cycleOf(sub, now()) : null;
      const r = db.get('SELECT COUNT(*) AS n, COALESCE(SUM(amount_minor), 0) AS total FROM company_charges WHERE company_id = ? AND voided_at IS NULL AND period = ?', company.id, cyc?.start ?? '');
      return { cycle: cyc, count: Number(r?.n || 0), total_minor: Number(r?.total || 0), price_minor: sub?.terms?.price_minor ?? null };
    },
    actorFor: companyActor,

    // ===================== التكاليف الإضافية (SRV-10، L-31، INV-B10) =====================
    /** عرض تكلفة لفريق المكتب */
    chargeView(ch) {
      const r = ch.request_id ? db.get('SELECT code FROM company_requests WHERE id = ?', ch.request_id) : null;
      const q = ch.quote_id ? db.get('SELECT number, basis, cap_minor FROM company_quotes WHERE id = ?', ch.quote_id) : null;
      return {
        id: ch.id,
        company_id: ch.company_id,
        kind: ch.kind,
        kind_label: label('company_charge_kind', ch.kind),
        description: ch.description,
        amount: major(ch.amount_minor),
        amount_minor: Number(ch.amount_minor),
        amount_text: formatEgp(ch.amount_minor),
        currency: ch.currency || 'EGP',
        request_id: ch.request_id || null,
        request_code: r?.code || null,
        quote_id: ch.quote_id || null,
        quote_number: q?.number || null,
        quote_basis: q?.basis || null,
        cap: q?.basis === 'capped' ? major(q.cap_minor) : null,
        period: ch.period,
        replaces_charge_id: ch.replaces_charge_id || null,
        created_by: ch.created_by ? db.value('SELECT name FROM users WHERE id = ?', ch.created_by) : null,
        created_at: ch.created_at,
        voided: !!ch.voided_at,
        voided_at: ch.voided_at || null,
        void_reason: ch.void_reason || null,
      };
    },

    /**
     * إضافة تكلفة (كل مسار إدراج يمر هنا): موافقة على عرض، سياسة «تُضاف تلقائيًا» عند القبول، أو إضافة يدوية من مدير النظام.
     * كل إدراج يُبلَّغ به مديرو البوابة وجهات الفواتير في البوابة وبالبريد (INV-B10). يعيد معرّف التكلفة.
     * notify: false داخل معاملة أكبر (يستدعي المتصل notifyCharge بعد الالتزام).
     */
    insertCharge({ company, request = null, quote = null, kind, description, amountMinor, period = null, replacesChargeId = null, actor = null }) {
      const sub = activeSubscription(company.id);
      const per = period || (sub ? cycleOf(sub, now()).start : cairoDayKey(now()));
      return db.insert('company_charges', {
        company_id: company.id,
        request_id: request?.id ?? null,
        quote_id: quote?.id ?? null,
        kind,
        description: String(description).slice(0, 300),
        amount_minor: Math.round(Number(amountMinor)),
        currency: 'EGP',
        period: per,
        replaces_charge_id: replacesChargeId,
        created_by: actor && !actor.kind ? actor.id : null,
        created_at: nowIso(),
      });
    },
    /** إشعار مديري البوابة وجهات الفواتير بتكلفة (العنوان بالرمز فقط لمن يرى الطلب؛ البريد بالمبلغ والرمز فقط) */
    notifyCharge(chargeId, { actor = null, ctx = null } = {}) {
      const ch = db.get('SELECT * FROM company_charges WHERE id = ?', chargeId);
      if (!ch) return;
      const company = db.get('SELECT * FROM companies WHERE id = ?', ch.company_id);
      const r = ch.request_id ? db.get('SELECT * FROM company_requests WHERE id = ?', ch.request_id) : null;
      const amount = formatEgp(ch.amount_minor);
      for (const u of app.companyNotify.billingRecipients(company.id)) {
        const vis = r ? visibleRequestSql(u, 'r') : null;
        const sees = r && db.get(`SELECT 1 FROM company_requests r WHERE r.id = ? AND ${vis.sql}`, r.id, ...vis.params);
        const code = sees ? r.code : null;
        app.companyNotify.notify([u.id], {
          companyId: company.id,
          type: 'charge.added',
          title: code ? `أُضيفت تكلفة إضافية ${amount} — ${code}` : `أُضيفت تكلفة إضافية ${amount}`,
          body: ch.description,
          link: '#/plan',
          requestId: sees ? r.id : null,
          email: { template: 'charge_added', vars: { amount, code } },
        });
      }
      app.audit.log({
        actor: actor || { kind: 'system' },
        ctx,
        type: 'company.charge_created',
        company_id: company.id,
        summary: `إضافة تكلفة على «${company.name}»: ${amount}${r ? ` — ${r.code}` : ''} (${label('company_charge_kind', ch.kind)})`,
        data: { charge_id: ch.id, amount_minor: ch.amount_minor, kind: ch.kind, request_id: ch.request_id, quote_id: ch.quote_id, replaces_charge_id: ch.replaces_charge_id },
      });
    },
    addCharge(opts) {
      const id = svc.insertCharge(opts);
      svc.notifyCharge(id, { actor: opts.actor, ctx: opts.ctx });
      return id;
    },

    /** تكاليف شركة لفريق المكتب (S قراءة) */
    staffCharges(companyId, { cycle = null } = {}) {
      const c = app.companies.require(companyId);
      const sub = activeSubscription(c.id);
      const where = ['company_id = ?'];
      const params = [c.id];
      let cyc = null;
      if (cycle && DATE_RE.test(String(cycle)) && sub) {
        cyc = cycleOf(sub, String(cycle));
        where.push('period = ?');
        params.push(cyc.start);
      }
      const rows = db.all(`SELECT * FROM company_charges WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 1000`, ...params);
      return { items: rows.map((x) => svc.chargeView(x)), cycle: cyc, total_unvoided: major(rows.filter((x) => !x.voided_at).reduce((a, x) => a + Number(x.amount_minor), 0)) };
    },

    /** إضافة يدوية أو استبدال (A): الاستبدال لا يزيد على المبلغ المستبدل (حد العرض بحد أقصى) — وإلا 409 charge_exceeds_cap */
    staffAddCharge(companyId, body = {}, actor, ctx) {
      const c = app.companies.require(companyId);
      const kind = v.oneOf(body.kind || 'adjustment', ['out_of_scope', 'overage', 'expense', 'adjustment'], 'نوع التكلفة', { required: true });
      const description = v.str(body.description, 'الوصف', { required: true, max: 300 });
      const amountMinor = v.money(body.amount, 'المبلغ', { required: true, min: 0.01 });
      let request = null;
      if (body.request_code || body.request_id) {
        request = body.request_id
          ? db.get('SELECT * FROM company_requests WHERE id = ? AND company_id = ?', Number(body.request_id) || 0, c.id)
          : db.get('SELECT * FROM company_requests WHERE code = ? AND company_id = ?', String(body.request_code).toUpperCase(), c.id);
        if (!request) throw badRequest('الطلب غير موجود في هذه الشركة');
      }
      let replaced = null;
      if (body.replaces_charge_id) {
        replaced = db.get('SELECT * FROM company_charges WHERE id = ? AND company_id = ?', Number(body.replaces_charge_id) || 0, c.id);
        if (!replaced) throw notFound('التكلفة المستبدلة غير موجودة');
        if (replaced.voided_at) throw new ApiError(409, 'التكلفة المستبدلة ملغاة بالفعل', 'conflict');
        if (amountMinor > Number(replaced.amount_minor)) {
          throw new ApiError(409, `لا يزيد المبلغ الجديد على ${formatEgp(replaced.amount_minor)} (الحد الذي وافقت عليه الشركة).`, 'charge_exceeds_cap', { cap: major(replaced.amount_minor) });
        }
        if (!request && replaced.request_id) request = db.get('SELECT * FROM company_requests WHERE id = ?', replaced.request_id);
      }
      const id = db.tx(() => {
        if (replaced) db.run("UPDATE company_charges SET voided_at = ?, voided_by = ?, void_reason = 'استُبدلت بتكلفة أقل' WHERE id = ?", nowIso(), actor.id, replaced.id);
        return svc.insertCharge({ company: c, request, kind: replaced ? replaced.kind : kind, description, amountMinor, period: replaced?.period || null, replacesChargeId: replaced?.id ?? null, actor });
      });
      svc.notifyCharge(id, { actor, ctx });
      return svc.chargeView(db.get('SELECT * FROM company_charges WHERE id = ?', id));
    },

    /** إلغاء تكلفة (A) */
    voidCharge(chargeId, body = {}, actor, ctx) {
      const ch = db.get('SELECT * FROM company_charges WHERE id = ?', Number(chargeId) || 0);
      if (!ch) throw notFound('التكلفة غير موجودة');
      if (ch.voided_at) throw new ApiError(409, 'التكلفة ملغاة بالفعل', 'conflict');
      const reason = v.str(body.reason, 'سبب الإلغاء', { required: true, max: 300 });
      db.run('UPDATE company_charges SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', nowIso(), actor.id, reason, ch.id);
      const c = db.get('SELECT name FROM companies WHERE id = ?', ch.company_id);
      app.audit.log({ actor, ctx, type: 'company.charge_voided', severity: 'warning', company_id: ch.company_id, summary: `إلغاء تكلفة ${formatEgp(ch.amount_minor)} على «${c?.name}»: ${reason}`, data: { charge_id: ch.id } });
      return svc.chargeView(db.get('SELECT * FROM company_charges WHERE id = ?', ch.id));
    },

    /**
     * صفوف ملف CSV للتكاليف (CO-28): سطر اشتراك لكل شركة في كل دورة (من لقطة الشروط) + التكاليف المعتمدة.
     * filters: { cycle (YYYY-MM-DD داخل الدورة)، company_id }
     */
    chargesCsvRows({ cycle = null, company_id = null } = {}) {
      const companies = company_id ? db.all('SELECT * FROM companies WHERE id = ?', Number(company_id) || 0) : db.all('SELECT * FROM companies ORDER BY name');
      const rows = [];
      for (const c of companies) {
        const sub = activeSubscription(c.id);
        const at = cycle && DATE_RE.test(String(cycle)) ? String(cycle) : now();
        const cyc = sub ? cycleOf(sub, at) : null;
        if (sub && cyc) {
          rows.push({
            company: c.name,
            prefix: c.prefix,
            cycle: cyc.start,
            kind: label('company_charge_kind', 'subscription'),
            description: `${sub.plan_name || label('company_plan_tier', sub.terms?.tier)} — ${label('company_plan_period', sub.terms?.billing_period || 'monthly')}`,
            request_code: '',
            amount: major(sub.terms?.price_minor) ?? '',
            currency: 'EGP',
            created_at: sub.created_at,
            voided: '',
          });
        }
        const where = ['ch.company_id = ?'];
        const params = [c.id];
        if (cyc) {
          where.push('ch.period = ?');
          params.push(cyc.start);
        }
        for (const ch of db.all(`SELECT ch.*, r.code FROM company_charges ch LEFT JOIN company_requests r ON r.id = ch.request_id WHERE ${where.join(' AND ')} ORDER BY ch.id`, ...params)) {
          rows.push({
            company: c.name,
            prefix: c.prefix,
            cycle: ch.period,
            kind: label('company_charge_kind', ch.kind),
            description: ch.description,
            request_code: ch.code || '',
            amount: major(ch.amount_minor),
            currency: ch.currency || 'EGP',
            created_at: ch.created_at,
            voided: ch.voided_at ? 'نعم' : '',
          });
        }
      }
      return rows;
    },
  };
  return svc;
}
