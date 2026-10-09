// v10 b2b-staff (STF-7/8/9، U10-S20/S21/S23؛ مدير النظام فقط) — محرر «شروط الباقة» (B10 §6.1 + urgent_per_month، L-53):
// يُستخدم في «إضافة شركة» (شروط مخصصة)، و«تغيير الباقة» من صفحة الشركة، و«باقات الشركات» في الإعدادات.
// المبالغ تُكتب بالجنيه وتُرسل بالقرش (price_minor …). لا «سعر ساعة» في 10.0: عروض الأسعار خارج الباقة
// مبلغ ثابت أو بحد أقصى فقط (L-31). التحقق نفسه على الخادم (validateTerms)؛ هنا تحقق فوري بنفس الحدود.

import { h, mount } from '../../lib/h.js';
import { label, money, count } from '../../lib/fmt.js';
import { form, icon } from '../../lib/ui.js';
import { REQUEST_TYPES, EXCLUDED_WORK } from '../../lib/company-catalog.js';

const SLA_ROWS = [
  { key: 'urgent', label: 'عاجل' },
  { key: 'high', label: 'مرتفع' },
  { key: 'normal', label: 'عادي' },
  { key: 'low', label: 'منخفض' },
];
const CLOCKS = [
  { value: 'business', label: 'ساعات العمل' },
  { value: 'calendar', label: 'يوميًا (ساعات العاجل)' },
];
const TIERS = ['starter', 'growth', 'enterprise', 'custom'];
const PERIODS = ['monthly', 'quarterly', 'annual'];
const SENIOR = ['always', 'high_risk', 'never'];
/** «عند تجاوز الطلبات المشمولة» (U10-S23 بعد L-31: لا مطالبات في 10.0) */
export const OVERAGE_POLICIES = [
  { value: 'approve', label: 'تطلب موافقة الشركة' },
  { value: 'bill', label: 'تُضاف تكلفة إضافية تلقائيًا' },
  { value: 'block', label: 'لا طلبات إضافية حتى الدورة التالية' },
];
export const BASES_NOTE = 'عروض الأسعار للأعمال خارج الباقة: «مبلغ ثابت» أو «بحد أقصى» فقط.';

/** شروط مبدئية لشروط مخصصة جديدة (نفس قيم الخادم الافتراضية) */
export const TERMS_BLANK = Object.freeze({
  tier: 'custom',
  billing_period: 'monthly',
  price_minor: null,
  currency: 'EGP',
  included_requests: 10,
  urgent_per_month: 1,
  included_hours: null,
  max_entities: 1,
  max_users: 5,
  overage_policy: 'approve',
  overage_price_minor: null,
  contract_value_cap_minor: null,
  scope_types: REQUEST_TYPES.map((t) => t.key),
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

// صيغ العدد والمعدود (count من fmt.js: [مفرد، مثنى بالياء كبقية المنصة، جمع 3–10، تمييز 11–99])
const URGENT_FORMS = ['طلب عاجل واحد', 'طلبين عاجلين', 'طلبات عاجلة', 'طلبًا عاجلًا'];
const USER_FORMS = ['مستخدم واحد', 'مستخدمَين', 'مستخدمين', 'مستخدمًا'];
const ENTITY_FORMS = ['كيان واحد', 'كيانين', 'كيانات', 'كيانًا'];
const ROUND_FORMS = ['جولة تعديل واحدة', 'جولتي تعديل', 'جولات تعديل', 'جولة تعديل'];
export const roundsText = (n) => (!Number(n) ? 'بلا جولات تعديل' : count(n, ROUND_FORMS));

const toMajor = (minor) => (minor === null || minor === undefined || minor === '' ? null : Math.round(Number(minor)) / 100);
const toMinor = (major) => (major === null || major === undefined || major === '' ? null : Math.round(Number(major) * 100));
const opts = (group, keys) => keys.map((k) => ({ value: k, label: label(group, k) }));

/** سطر واحد يلخص الشروط (بطاقة الاشتراك وقائمة الباقات) */
export function termsSummary(t = {}, { money: showMoney = true } = {}) {
  const parts = [];
  parts.push(t.included_requests == null ? 'طلبات غير محدودة' : `${count(t.included_requests, 'request')} في الدورة`);
  parts.push(t.urgent_per_month == null ? 'العاجل غير محدود' : t.urgent_per_month === 0 ? 'بلا طلبات عاجلة' : count(t.urgent_per_month, URGENT_FORMS));
  parts.push(t.max_users == null ? 'مستخدمون بلا حد' : count(t.max_users, USER_FORMS));
  parts.push(count(t.max_entities ?? 1, ENTITY_FORMS));
  if (showMoney && t.price_minor != null) parts.push(`${money(toMajor(t.price_minor))} / ${label('company_plan_period', t.billing_period || 'monthly')}`);
  return parts.join(' · ');
}

/** جدول مواعيد الخدمة للعرض فقط */
export function slaTable(t = {}) {
  const sla = t.sla || {};
  return h(
    'table.cs-sla-table',
    h('caption.sr-only', 'مواعيد الخدمة'),
    h('thead', h('tr', h('th', { scope: 'col' }, 'الأولوية'), h('th', { scope: 'col' }, 'الرد الأول'), h('th', { scope: 'col' }, 'التسليم'), h('th', { scope: 'col' }, 'الساعة'))),
    h(
      'tbody',
      SLA_ROWS.map((r) => {
        const s = sla[r.key] || {};
        return h('tr', h('th', { scope: 'row' }, r.label), h('td.num', `${s.first_response_hours ?? '—'} س`), h('td.num', `${s.delivery_hours ?? '—'} س`), h('td', CLOCKS.find((c) => c.value === s.clock)?.label || '—'));
      }),
    ),
  );
}

/**
 * محرر الشروط.
 * @param {object} [terms] شروط البداية (من باقة أو اشتراك)
 * @param {{money?: boolean}} [o] money=false يخفي حقول الأسعار (لا يحدث في 10.0 لأن المحرر لمدير النظام فقط)
 * @returns {{el: HTMLElement, validate: () => boolean, getTerms: () => object, setTerms: (t: object) => void, showError: (err: any) => boolean, isDirty: () => boolean}}
 */
export function termsEditor(terms = {}, { money: showMoney = true } = {}) {
  const t0 = { ...TERMS_BLANK, ...(terms || {}), sla: { ...TERMS_BLANK.sla, ...(terms?.sla || {}) }, size_factor: { ...TERMS_BLANK.size_factor, ...(terms?.size_factor || {}) } };
  const values = (t) => ({
    tier: t.tier,
    billing_period: t.billing_period,
    price: toMajor(t.price_minor),
    included_requests: t.included_requests,
    urgent_per_month: t.urgent_per_month,
    max_entities: t.max_entities,
    max_users: t.max_users,
    overage_policy: t.overage_policy,
    overage_price: toMajor(t.overage_price_minor),
    contract_value_cap: toMajor(t.contract_value_cap_minor),
    scope_types: t.scope_types || [],
    excluded_work: t.excluded_work || [],
    size_S: t.size_factor?.S,
    size_M: t.size_factor?.M,
    size_L: t.size_factor?.L,
    senior_review: t.senior_review,
    revision_rounds: t.revision_rounds,
  });

  const basics = form(
    [
      { name: 'tier', label: 'الفئة', type: 'select', required: true, placeholder: false, options: opts('company_plan_tier', TIERS) },
      { name: 'billing_period', label: 'فترة الاشتراك', type: 'select', required: true, placeholder: false, options: opts('company_plan_period', PERIODS) },
      showMoney && { name: 'price', label: 'السعر لكل فترة', type: 'money', min: 0 },
      { name: 'included_requests', label: 'الطلبات المشمولة في الدورة', type: 'number', integer: true, min: 0, max: 10000, hint: 'فارغ = غير محدودة. الدورة شهر يبدأ من يوم بداية الاشتراك.' },
      { name: 'urgent_per_month', label: 'الطلبات العاجلة في الدورة', type: 'number', integer: true, min: 0, max: 1000, hint: 'فارغ = غير محدودة. ما يزيد يُسجَّل بأولوية «مرتفع».' },
      { name: 'max_entities', label: 'الكيانات', type: 'number', integer: true, min: 1, max: 500, required: true },
      { name: 'max_users', label: 'المستخدمون', type: 'number', integer: true, min: 1, max: 5000, hint: 'فارغ = بلا حد.' },
      { name: 'overage_policy', label: 'عند تجاوز الطلبات المشمولة', type: 'select', required: true, placeholder: false, options: OVERAGE_POLICIES },
      showMoney && { name: 'overage_price', label: 'سعر الطلب الإضافي', type: 'money', min: 0, hint: 'مطلوب عند «تُضاف تكلفة إضافية تلقائيًا».' },
      { name: 'contract_value_cap', label: 'حد قيمة العقد', type: 'money', min: 0, hint: 'العقود الأعلى قيمة خارج الباقة. فارغ = بلا حد.' },
      { name: 'senior_review', label: 'المراجعة الثانية المستقلة', type: 'select', required: true, placeholder: false, options: opts('company_senior_review', SENIOR) },
      { name: 'revision_rounds', label: 'جولات التعديل', type: 'number', integer: true, min: 0, max: 10, required: true },
      { name: 'size_S', label: 'معامل الحجم S', type: 'number', min: 0.25, max: 5, required: true },
      { name: 'size_M', label: 'معامل الحجم M', type: 'number', min: 0.25, max: 5, required: true },
      { name: 'size_L', label: 'معامل الحجم L', type: 'number', min: 0.25, max: 5, required: true },
      { name: 'scope_types', label: 'الأنواع المشمولة', type: 'checkboxes', required: true, options: REQUEST_TYPES.map((x) => ({ value: x.key, label: x.label })) },
      { name: 'excluded_work', label: 'الأعمال المستبعدة', type: 'checkboxes', options: EXCLUDED_WORK.filter((x) => x.key !== 'other_excluded').map((x) => ({ value: x.key, label: x.label })) },
    ],
    { values: values(t0), footer: false, className: 'cs-terms-form' },
  );

  // «مواعيد الخدمة»: عاجل/مرتفع/عادي/منخفض × الرد الأول · التسليم · الساعة
  const slaInputs = {};
  const slaErr = {};
  const slaRows = SLA_ROWS.map((r) => {
    const s = t0.sla[r.key] || {};
    const fr = h('input.input.num', { type: 'text', inputmode: 'numeric', dir: 'ltr', value: String(s.first_response_hours ?? ''), 'aria-label': `${r.label}: الرد الأول بالساعات` });
    const dl = h('input.input.num', { type: 'text', inputmode: 'numeric', dir: 'ltr', value: String(s.delivery_hours ?? ''), 'aria-label': `${r.label}: التسليم بالساعات` });
    const ck = h('select.input', { 'aria-label': `${r.label}: الساعة` }, CLOCKS.map((c) => h('option', { value: c.value, selected: c.value === (s.clock || 'business') }, c.label)));
    const err = h('p.field-error', { hidden: true });
    slaInputs[r.key] = { fr, dl, ck };
    slaErr[r.key] = err;
    const clear = () => {
      if (!err.hidden) checkSla(r.key);
    };
    fr.addEventListener('input', clear);
    dl.addEventListener('input', clear);
    return h('tr', h('th', { scope: 'row' }, r.label), h('td', fr), h('td', dl), h('td', h('div.select-wrap', ck)), h('td.cs-sla-err', err));
  });
  const parseH = (el) => {
    const s = String(el.value || '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    return s === '' ? NaN : Number(s);
  };
  function checkSla(key) {
    const { fr, dl } = slaInputs[key];
    const a = parseH(fr);
    const b = parseH(dl);
    let msg = '';
    if (!(a >= 1 && a <= 720) || !(b >= 1 && b <= 720)) msg = 'بين 1 و720 ساعة';
    else if (b < a) msg = 'التسليم بعد الرد الأول';
    const err = slaErr[key];
    err.textContent = msg;
    err.hidden = !msg;
    fr.toggleAttribute('aria-invalid', Boolean(msg) && !(a >= 1 && a <= 720));
    dl.toggleAttribute('aria-invalid', Boolean(msg));
    return !msg;
  }
  const slaBox = h(
    'div.field.field-full.cs-sla-grid',
    h('span.field-label', 'مواعيد الخدمة'),
    h(
      'div.table-wrap',
      h(
        'table.cs-sla-table.is-edit',
        h('caption.sr-only', 'مواعيد الخدمة لكل أولوية'),
        h('thead', h('tr', h('th', { scope: 'col' }, 'الأولوية'), h('th', { scope: 'col' }, 'الرد الأول بالساعات'), h('th', { scope: 'col' }, 'التسليم بالساعات'), h('th', { scope: 'col' }, 'الساعة'), h('th', { scope: 'col' }, h('span.sr-only', 'ملاحظات')))),
        h('tbody', slaRows),
      ),
    ),
    h('p.field-hint', '«يوميًا» = كل أيام الأسبوع داخل «ساعات الطلبات العاجلة» في إعدادات خدمة الشركات؛ «ساعات العمل» = مواعيد العمل وأيامه.'),
  );

  const el = h('div.cs-terms', basics.el, slaBox, h('p.cs-note', icon('info', { size: 16 }), BASES_NOTE));

  const api = {
    el,
    validate() {
      let ok = basics.validate();
      for (const r of SLA_ROWS) ok = checkSla(r.key) && ok;
      const v = basics.getValues();
      if (showMoney && v.overage_policy === 'bill' && v.overage_price == null) {
        basics.setErrors({ overage_price: 'حدد سعر الطلب الإضافي عند اختيار إضافة التكلفة تلقائيًا' });
        ok = false;
      }
      return ok;
    },
    getTerms() {
      const v = basics.getValues();
      const sla = {};
      for (const r of SLA_ROWS) {
        const { fr, dl, ck } = slaInputs[r.key];
        sla[r.key] = { first_response_hours: parseH(fr), delivery_hours: parseH(dl), clock: ck.value };
      }
      const out = {
        tier: v.tier,
        billing_period: v.billing_period,
        currency: 'EGP',
        included_requests: v.included_requests,
        urgent_per_month: v.urgent_per_month,
        included_hours: null,
        max_entities: v.max_entities,
        max_users: v.max_users,
        overage_policy: v.overage_policy,
        contract_value_cap_minor: toMinor(v.contract_value_cap),
        scope_types: v.scope_types,
        excluded_work: v.excluded_work,
        sla,
        size_factor: { S: v.size_S, M: v.size_M, L: v.size_L },
        senior_review: v.senior_review,
        revision_rounds: v.revision_rounds,
      };
      if (showMoney) {
        out.price_minor = toMinor(v.price);
        out.overage_price_minor = toMinor(v.overage_price);
      }
      return out;
    },
    setTerms(t) {
      const n = { ...TERMS_BLANK, ...(t || {}), sla: { ...TERMS_BLANK.sla, ...(t?.sla || {}) }, size_factor: { ...TERMS_BLANK.size_factor, ...(t?.size_factor || {}) } };
      basics.setValues(values(n));
      for (const r of SLA_ROWS) {
        const s = n.sla[r.key] || {};
        slaInputs[r.key].fr.value = String(s.first_response_hours ?? '');
        slaInputs[r.key].dl.value = String(s.delivery_hours ?? '');
        slaInputs[r.key].ck.value = s.clock || 'business';
        slaErr[r.key].hidden = true;
      }
      snapshot = JSON.stringify(api.getTerms());
    },
    /** يعرض أخطاء الخادم (details.fields بمفاتيح الشروط) على حقولها؛ يعيد true إن وُجد خطأ لحقل معروف */
    showError(err) {
      const f = err?.details?.fields;
      if (!f || typeof f !== 'object') return false;
      const map = { price_minor: 'price', overage_price_minor: 'overage_price', contract_value_cap_minor: 'contract_value_cap', 'size_factor.S': 'size_S', 'size_factor.M': 'size_M', 'size_factor.L': 'size_L' };
      const m = {};
      let any = false;
      for (const [k, msg] of Object.entries(f)) {
        if (/^sla\./.test(k)) {
          const key = k.slice(4);
          if (slaErr[key]) {
            slaErr[key].textContent = String(msg);
            slaErr[key].hidden = false;
            any = true;
          }
        } else if (basics.control(map[k] || k)) {
          m[map[k] || k] = String(msg);
          any = true;
        }
      }
      basics.setErrors(m);
      return any;
    },
    isDirty: () => JSON.stringify(api.getTerms()) !== snapshot,
  };
  let snapshot = JSON.stringify(api.getTerms());
  return api;
}

/** عرض الشروط للقراءة فقط (ملخص + الأنواع المستبعدة + جدول المواعيد) */
export function termsView(t = {}, { money: showMoney = true } = {}) {
  const box = h('div.cs-terms-view');
  mount(
    box,
    h('p.cs-terms-line', termsSummary(t, { money: showMoney })),
    h(
      'p.cs-terms-line.muted',
      `عند التجاوز: ${OVERAGE_POLICIES.find((p) => p.value === t.overage_policy)?.label || '—'}`,
      showMoney && t.overage_price_minor != null ? ` (${money(toMajor(t.overage_price_minor))} للطلب)` : '',
      ` · ${label('company_senior_review', t.senior_review)} · ${roundsText(t.revision_rounds)}`,
    ),
    t.contract_value_cap_minor != null ? h('p.cs-terms-line.muted', `حد قيمة العقد: ${money(toMajor(t.contract_value_cap_minor))}`) : null,
    (t.excluded_work || []).length ? h('p.cs-terms-line.muted', `مستبعد: ${t.excluded_work.map((k) => label('company_excluded_work', k)).join('، ')}`) : null,
    slaTable(t),
  );
  return box;
}
