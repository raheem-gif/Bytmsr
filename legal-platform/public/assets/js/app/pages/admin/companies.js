// v10 b2b-staff (STF-7، U10-S19/S20) — «الشركات العميلة»: قائمة الشركات مع صحة الخدمة ومدير العلاقة،
// و«إضافة شركة» (مدير النظام فقط): البادئة مع فحص فوري، مدير العلاقة من فريقنا، الباقة أو شروط مخصصة،
// أول مستخدم «مدير بوابة الشركة»، ثم شاشة النتيجة (تشابه الأسماء، والدعوة أو رابطها الذي يظهر مرة واحدة).
// الخادم هو المرجع في الصلاحيات (A)؛ الزر لا يظهر لمدير الحالات.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { relative, dateTime, label, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  badge,
  codeTag,
  table,
  filterBar,
  searchInput,
  selectInput,
  loading,
  errorState,
  button,
  modal,
  form,
  icon,
  alertBox,
  copyButton,
  toast,
  errorMessage,
  discardGuard,
  emptyState,
} from '../../../lib/ui.js';
import { termsEditor, termsView } from '../../components/company-plan-terms.js';

export const STATUS = [
  { value: 'trial', label: 'تجريبية' },
  { value: 'active', label: 'نشطة' },
  { value: 'past_due', label: 'متأخرة السداد' },
  { value: 'suspended', label: 'موقوفة' },
  { value: 'ended', label: 'منتهية' },
];
export const STATUS_TONE = { trial: 'info', active: 'success', past_due: 'warning', suspended: 'danger', ended: 'neutral' };
const SIZE_BANDS = [
  { value: '1-10', label: '1–10 موظفين' },
  { value: '11-50', label: '11–50 موظفًا' },
  { value: '51-200', label: '51–200 موظف' },
  { value: '201-500', label: '201–500 موظف' },
  { value: '500+', label: 'أكثر من 500 موظف' },
];
const LEGAL_FORMS = ['llc', 'jsc', 'sole', 'branch', 'partnership', 'other'];
const PREFIX_RE = /^[A-Z]{2,5}$/;
/** نص نتيجة فحص البادئة (U10-S20) */
export const PREFIX_COPY = {
  ok: 'متاحة ✓',
  taken: 'مستخدمة لشركة أخرى',
  reserved: 'محجوزة للنظام',
  invalid: 'حروف لاتينية كبيرة من 2 إلى 5',
  locked: 'لا تتغير البادئة بعد أول طلب للشركة.',
};

/** شرائح «صحة الخدمة» */
export function healthChips(c) {
  const out = [];
  if (c.late) out.push(badge(`متأخرة ${c.late}`, 'danger', { icon: 'alert' }));
  if (c.at_risk) out.push(badge(`يقترب موعدها ${c.at_risk}`, 'warning', { icon: 'clock' }));
  if (c.awaiting_company) out.push(badge(`بانتظار الشركة ${c.awaiting_company}`, 'info'));
  if (!out.length) out.push(badge('سليمة', 'neutral'));
  return h('span.cq-health', out);
}

/** ترتيب «من يحتاج انتباهًا أولًا»: المتأخرة ثم القريبة من موعدها ثم بانتظار الشركة (T16) */
export function byHealth(a, b) {
  return (b.late || 0) - (a.late || 0) || (b.at_risk || 0) - (a.at_risk || 0) || (b.awaiting_company || 0) - (a.awaiting_company || 0) || String(a.name).localeCompare(String(b.name), 'ar');
}

/**
 * v11 gate fix (J-20/K13b): «إضافة كشركة عميلة» من طلب عرض شركة يفتح هذه الصفحة بـ ?new=1&name=…&phone=… —
 * نقرأها لتعبئة ورقة «إضافة شركة» مسبقًا (تعبئة فقط؛ لا يُنشأ شيء دون «إنشاء الشركة»). null حين لا يُطلب فتح الورقة.
 */
export function companyPrefill(query = {}) {
  if (!query || String(query.new) !== '1') return null;
  const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return { name: clean(query.name, 150), phone: clean(query.phone, 20).replace(/[^0-9+\u0660-\u0669\u06f0-\u06f9 -]/g, '') };
}

export function statusBadgeOf(c) {
  return badge(c.status_label || label('company_status', c.status), STATUS_TONE[c.status] || 'neutral', { dot: true });
}

export default async function render(ctx) {
  const user = ctx.user || {};
  const isAdmin = user.role === 'admin';
  const state = { status: STATUS.some((s) => s.value === ctx.query.status) ? ctx.query.status : '', q: ctx.query.q || '' };
  let data = await api.get('/admin/companies', { status: state.status, q: state.q });
  // v11 gate fix (J-20/K13b): ?new=1 يفتح ورقة الإضافة معبأة؛ ثم يُزال من الرابط حتى لا تعود الورقة عند التحديث
  const prefill = companyPrefill(ctx.query);
  if (prefill) {
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/companies`);
    } catch {
      /* لا شيء: الرابط يبقى كما هو */
    }
    setTimeout(() => {
      if (isAdmin) openCreateCompany(ctx, { onCreated: load, prefill });
      else toast('إضافة شركة عميلة متاحة لمدير النظام فقط — أرسلوا له اسم الشركة ورقمها.', 'info');
    }, 0);
  }
  const host = h('div');
  let seq = 0;

  function draw() {
    const rows = [...(data.items || [])].sort(byHealth);
    if (!rows.length && !state.status && !state.q) {
      mount(
        host,
        card({
          body: emptyState(
            'أضيفوا أول شركة لتبدأ طلباتها في الوصول إلى «طلبات الشركات».',
            isAdmin ? button('إضافة شركة', { variant: 'primary', icon: 'plus', onClick: () => openCreateCompany(ctx, { onCreated: load }) }) : null,
            { icon: 'building', title: 'لا توجد شركات بعد' },
          ),
        }),
      );
      return;
    }
    mount(
      host,
      card({
        flush: true,
        body: table({
          caption: 'الشركات العميلة',
          stack: true,
          rows,
          empty: 'لا توجد شركات تطابق البحث.',
          onRowClick: (c) => ctx.navigate(`/companies/${c.id}`),
          rowClass: (c) => (c.late ? 'is-late' : c.at_risk ? 'is-at-risk' : null),
          columns: [
            { key: 'name', label: 'الشركة', render: (c) => h('div.cq-cell-req.cq-cell-co', h('a', { href: `#/companies/${c.id}` }, c.name), codeTag(c.prefix)) },
            // review: نهاية الفترة التجريبية تحت الحالة (عمود أقل؛ كان الجدول يتجاوز عرض 1366 ويُخفي آخر عمود)
            {
              key: 'status',
              label: 'الحالة',
              render: (c) =>
                h(
                  'div.cq-cell-req',
                  statusBadgeOf(c),
                  c.trial_ends_at ? h('time.muted.cq-trial', { datetime: c.trial_ends_at, title: dateTime(c.trial_ends_at) }, `${new Date(c.trial_ends_at) < new Date() ? 'انتهت التجربة' : 'تنتهي التجربة'} ${relative(c.trial_ends_at)}`) : null,
                ),
            },
            { key: 'plan', label: 'الباقة', render: (c) => c.plan_name || '—' },
            { key: 'am', label: 'مدير العلاقة', render: (c) => c.account_manager?.name || '—' },
            { key: 'users', label: 'المستخدمون', render: (c) => h('span.num', String(c.users ?? 0)) },
            { key: 'open', label: 'الطلبات المفتوحة', render: (c) => h('span.num', String(c.open_requests ?? 0)) },
            { key: 'health', label: 'صحة الخدمة', render: healthChips },
            { key: 'renewals', label: 'تجديدات خلال 30 يومًا', className: 'cq-col-num', render: (c) => h('span.num', String(c.renewals_30d ?? 0)) },
          ],
        }),
      }),
    );
  }

  async function load() {
    const my = ++seq;
    mount(host, loading());
    try {
      const res = await api.get('/admin/companies', { status: state.status, q: state.q });
      if (my !== seq) return;
      data = res;
      draw();
    } catch (err) {
      if (my === seq) mount(host, errorState(err, load));
    }
  }

  draw();
  return h(
    'div.cq-page',
    pageHeader({
      title: 'الشركات العميلة',
      subtitle: 'الشركات التي نعمل إدارةً قانونية خارجية لها، مرتبة بالأحوج للانتباه أولًا.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'الشركات العميلة' }],
      actions: isAdmin ? button('إضافة شركة', { variant: 'primary', icon: 'plus', onClick: () => openCreateCompany(ctx, { onCreated: load }) }) : null,
    }),
    filterBar([
      searchInput({ placeholder: 'اسم الشركة أو البادئة', label: 'بحث في الشركات', value: state.q, onSearch: (v) => ((state.q = v), load()) }),
      selectInput({ label: 'الحالة', allLabel: 'كل الحالات', options: STATUS, value: state.status, onChange: (v) => ((state.status = v), load()) }),
    ]),
    host,
  );
}

// ───────────────────────── فحص البادئة ─────────────────────────

/**
 * حقل البادئة مع فحص فوري (U10-S20؛ KR وأكواد النظام محجوزة؛ CS-34).
 * @returns {{status: HTMLElement, attach: (input: HTMLInputElement) => void, ok: () => boolean, check: () => Promise<boolean>}}
 */
export function prefixChecker({ companyId = null, current = null } = {}) {
  const status = h('p.cs-prefix', { 'aria-live': 'polite' });
  let last = { value: '', available: false };
  let timer = 0;
  let seq = 0;
  let input = null;
  const show = (tone, text, preview) =>
    mount(status, text ? h('span', { class: `cs-prefix-${tone}` }, tone === 'ok' ? icon('check', { size: 16 }) : icon(tone === 'bad' ? 'alert' : 'info', { size: 16 }), text) : null, preview ? h('span.cs-prefix-preview', 'أول طلب: ', h('bdi.num', { dir: 'ltr' }, `${preview}-0001`)) : null);
  async function check() {
    const value = String(input?.value || '').trim().toUpperCase();
    if (!value) {
      last = { value, available: false };
      show('muted', '', null);
      return false;
    }
    if (current && value === current) {
      last = { value, available: true };
      show('ok', PREFIX_COPY.ok, value);
      return true;
    }
    if (!PREFIX_RE.test(value)) {
      last = { value, available: false, reason: 'invalid' };
      show('bad', PREFIX_COPY.invalid, null);
      return false;
    }
    const my = ++seq;
    try {
      const r = await api.get('/admin/companies/prefix-check', { prefix: value, company_id: companyId || undefined }, { background: true });
      if (my !== seq) return last.available;
      last = { value, available: !!r.available, reason: r.reason };
      if (r.available) show('ok', PREFIX_COPY.ok, value);
      else show('bad', PREFIX_COPY[r.reason] || PREFIX_COPY.invalid, null);
      return !!r.available;
    } catch {
      if (my === seq) show('muted', '', value);
      return true; // الخادم يتحقق عند الحفظ
    }
  }
  return {
    status,
    attach(el) {
      input = el;
      el.setAttribute('dir', 'ltr');
      el.setAttribute('autocapitalize', 'characters');
      el.setAttribute('maxlength', '5');
      el.addEventListener('input', () => {
        const up = el.value.toUpperCase().replace(/[^A-Z]/g, '');
        if (up !== el.value) el.value = up;
        clearTimeout(timer);
        timer = setTimeout(check, 250);
      });
      if (el.value) check();
    },
    ok: () => last.available && last.value === String(input?.value || '').trim().toUpperCase(),
    reason: () => last.reason || null,
    check,
  };
}

// ───────────────────────── «إضافة شركة» (U10-S20، A) ─────────────────────────

/** يفتح ورقة «إضافة شركة»؛ بعد الإنشاء تظهر شاشة النتيجة ثم يُفتح ملف الشركة */
export async function openCreateCompany(ctx, { onCreated, prefill = null } = {}) {
  let plans = [];
  let staff = [];
  let trialDays = 14;
  try {
    const [p, s, b] = await Promise.all([
      api.get('/admin/company-plans'),
      api.get('/admin/staff'),
      api.get('/admin/b2b/settings').catch(() => null),
    ]);
    plans = (p.items || []).filter((x) => x.active);
    staff = (s || []).filter((x) => x.role === 'admin' || x.role === 'case_manager');
    trialDays = Number(b?.values?.b2b_trial_days) || 14;
  } catch (err) {
    toast(errorMessage(err), 'danger');
    return null;
  }
  const me = ctx.user || {};
  const CUSTOM = 'custom';
  let planChoice = plans[0] ? String(plans[0].id) : CUSTOM;
  let created = null;

  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });
  const sec = (title, ...children) => h('section.cs-section', h('h3.cs-section-title', title), ...children);

  // «الشركة»
  const fCompany = form(
    [
      { name: 'name', label: 'الاسم المعروض', required: true, maxLength: 150, dir: 'auto', hint: 'يظهر لفريقنا وفي بوابة الشركة.' },
      { name: 'prefix', label: 'البادئة', required: true, ltr: true, placeholder: 'NFD', hint: 'حروف لاتينية كبيرة من 2 إلى 5، تظهر في أكواد الطلبات مثل NFD-0001' },
    ],
    { values: { name: prefill?.name || '' }, footer: false },
  );
  const prefix = prefixChecker();
  prefix.attach(fCompany.control('prefix').input);
  fCompany.control('prefix').wrap.append(prefix.status);

  // «البيانات القانونية»
  const fLegal = form(
    [
      { name: 'legal_name', label: 'الاسم القانوني', maxLength: 200, dir: 'auto' },
      { name: 'commercial_registry', label: 'السجل التجاري', maxLength: 60, ltr: true },
      { name: 'tax_id', label: 'البطاقة الضريبية', maxLength: 60, ltr: true },
      { name: 'industry', label: 'النشاط', maxLength: 120 },
      { name: 'size_band', label: 'الحجم', type: 'select', options: SIZE_BANDS },
      { name: 'address', label: 'العنوان', maxLength: 300, full: true },
    ],
    { footer: false },
  );

  // «الاشتراك»
  const planOptions = [...plans.map((p) => ({ value: String(p.id), label: p.name })), { value: CUSTOM, label: 'شروط مخصصة' }];
  const fSub = form(
    [
      {
        name: 'status',
        label: 'الحالة',
        type: 'select',
        required: true,
        placeholder: false,
        options: [
          { value: 'trial', label: `تجريبية (${trialDays} يومًا)` },
          { value: 'active', label: 'نشطة' },
        ],
        onChange: () => syncTrial(),
      },
      { name: 'trial_days', label: 'مدة التجربة (يومًا)', type: 'number', integer: true, min: 1, max: 120 },
      { name: 'plan', label: 'الباقة', type: 'select', required: true, placeholder: false, options: planOptions, onChange: (v) => ((planChoice = v || CUSTOM), drawPlan()) },
      { name: 'starts_on', label: 'تاريخ البدء', type: 'date', required: true },
      {
        name: 'renews',
        label: 'التجديد',
        type: 'select',
        required: true,
        placeholder: false,
        options: [
          { value: 'auto', label: 'تلقائي' },
          { value: 'manual', label: 'يدوي' },
        ],
      },
    ],
    { values: { status: 'trial', trial_days: trialDays, plan: planChoice, starts_on: cairoToday(), renews: 'auto' }, footer: false },
  );
  function syncTrial() {
    const trial = fSub.control('status').get() === 'trial';
    fSub.control('trial_days').wrap.hidden = !trial;
  }
  const planHost = h('div.cs-plan-terms');
  let editor = null;
  function drawPlan() {
    if (planChoice === CUSTOM) {
      const base = plans[0]?.terms || {};
      if (!editor) editor = termsEditor({ ...base, tier: 'custom' }, { money: true });
      mount(planHost, h('p.cs-note', icon('info', { size: 16 }), 'شروط هذه الشركة وحدها؛ تُحفظ لقطة منها في الاشتراك.'), editor.el);
    } else {
      const p = plans.find((x) => String(x.id) === planChoice);
      mount(planHost, p ? termsView(p.terms, { money: true }) : null);
    }
  }

  // «الكيان الرئيسي»
  const fEntity = form(
    [
      { name: 'entity_name', label: 'الاسم القانوني للكيان', maxLength: 200, dir: 'auto', hint: 'فارغ = الاسم القانوني للشركة.' },
      { name: 'legal_form', label: 'الشكل القانوني', type: 'select', options: LEGAL_FORMS.map((k) => ({ value: k, label: label('legal_form', k) })) },
    ],
    { footer: false },
  );

  // «مدير العلاقة (من فريقنا)»
  const fManager = form(
    [
      {
        name: 'account_manager_id',
        label: 'مدير العلاقة (من فريقنا)',
        type: 'select',
        required: true,
        options: staff.map((s) => ({ value: s.id, label: `${s.name} — ${label('user_role', s.role)}` })),
        hint: 'يراه مديرو البوابة باسمه: «مدير علاقتكم لدينا».',
      },
    ],
    { values: { account_manager_id: staff.some((s) => s.id === me.id) ? me.id : staff[0]?.id }, footer: false, columns: 1 },
  );

  // «أول مستخدم — مدير بوابة الشركة»
  const fAdmin = form(
    [
      { name: 'fa_name', label: 'الاسم', required: true, minLength: 2, maxLength: 120, dir: 'auto' },
      { name: 'fa_email', label: 'البريد الإلكتروني', type: 'email', required: true },
      { name: 'fa_job_title', label: 'الوظيفة', maxLength: 120 },
      { name: 'fa_phone', label: 'الهاتف', type: 'phone' },
      { name: 'fa_billing', type: 'checkbox', text: 'يتلقى إشعارات التكاليف الإضافية (جهة الفواتير)' },
    ],
    { values: { fa_billing: true, fa_phone: prefill?.phone || '' }, footer: false },
  );

  const forms = [fCompany, fLegal, fSub, fEntity, fManager, fAdmin];
  const startPhone = fAdmin.getValues().fa_phone || '';
  const fieldMap = {
    name: [fCompany, 'name'],
    prefix: [fCompany, 'prefix'],
    legal_name: [fLegal, 'legal_name'],
    commercial_registry: [fLegal, 'commercial_registry'],
    tax_id: [fLegal, 'tax_id'],
    industry: [fLegal, 'industry'],
    size_band: [fLegal, 'size_band'],
    address: [fLegal, 'address'],
    status: [fSub, 'status'],
    trial_days: [fSub, 'trial_days'],
    plan_id: [fSub, 'plan'],
    starts_on: [fSub, 'starts_on'],
    'entity.name': [fEntity, 'entity_name'],
    account_manager_id: [fManager, 'account_manager_id'],
    'first_admin.name': [fAdmin, 'fa_name'],
    'first_admin.email': [fAdmin, 'fa_email'],
    'first_admin.job_title': [fAdmin, 'fa_job_title'],
    first_admin: [fAdmin, 'fa_name'],
  };

  function showServerError(err) {
    mount(alertHost, alertBox(errorMessage(err), 'danger'));
    const fields = err?.details?.fields || {};
    let any = false;
    for (const [k, msg] of Object.entries(fields)) {
      const m = fieldMap[k];
      if (m) {
        m[0].setErrors({ [m[1]]: String(msg) });
        any = true;
      }
    }
    if (editor && planChoice === CUSTOM) any = editor.showError(err) || any;
    if (err?.code === 'email_taken') fAdmin.setErrors({ fa_email: 'البريد مسجل بالفعل في بوابة الشركات' });
    alertHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return any;
  }

  async function submit() {
    mount(alertHost, null);
    let ok = true;
    for (const f of forms) ok = f.validate() && ok;
    if (editor && planChoice === CUSTOM) ok = editor.validate() && ok;
    if (ok && !(await prefix.check())) {
      fCompany.setErrors({ prefix: PREFIX_COPY[prefix.reason()] || PREFIX_COPY.invalid });
      ok = false;
    }
    if (!ok) return false;
    const c = fCompany.getValues();
    const l = fLegal.getValues();
    const s = fSub.getValues();
    const e = fEntity.getValues();
    const a = fAdmin.getValues();
    const body = {
      name: c.name,
      prefix: String(c.prefix || '').toUpperCase(),
      legal_name: l.legal_name || undefined,
      commercial_registry: l.commercial_registry || undefined,
      tax_id: l.tax_id || undefined,
      industry: l.industry || undefined,
      size_band: l.size_band || undefined,
      address: l.address || undefined,
      status: s.status,
      trial_days: s.status === 'trial' ? s.trial_days || trialDays : undefined,
      renews: s.renews,
      account_manager_id: fManager.getValues().account_manager_id,
      entity: { name: e.entity_name || undefined, legal_form: e.legal_form || undefined },
      first_admin: { name: a.fa_name, email: a.fa_email, job_title: a.fa_job_title || undefined, phone: a.fa_phone || undefined, billing_contact: !!a.fa_billing },
    };
    if (s.starts_on) body.starts_on = new Date(s.starts_on).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // YYYY-MM-DD بتوقيت القاهرة
    if (planChoice === CUSTOM) body.terms = editor.getTerms();
    else body.plan_id = Number(planChoice);
    try {
      created = await api.post('/admin/companies', body);
      created.first_admin_email = body.first_admin.email;
      return true;
    } catch (err) {
      showServerError(err);
      return false;
    }
  }

  const isDirty = () => {
    const c = fCompany.getValues();
    const a = fAdmin.getValues();
    const l = fLegal.getValues();
    // (v11 gate fix J-20) القيم المعبأة مسبقًا من طلب العرض لا تُعدّ تعديلًا
    const changedName = c.name && c.name !== (prefill?.name || '');
    const changedPhone = a.fa_phone && a.fa_phone !== startPhone;
    return Boolean(changedName || changedPhone || c.prefix || a.fa_name || a.fa_email || a.fa_job_title || l.legal_name || l.address || (editor && editor.isDirty()));
  };

  const handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-create-company',
    title: 'إضافة شركة',
    subtitle: 'تُنشأ الشركة ويُدعى أول مستخدم ليكون «مدير البوابة».',
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body',
      alertHost,
      sec('الشركة', fCompany.el),
      sec('البيانات القانونية', fLegal.el),
      sec('الاشتراك', fSub.el, planHost),
      sec('الكيان الرئيسي', fEntity.el),
      sec('مدير العلاقة', fManager.el),
      sec('أول مستخدم — مدير بوابة الشركة', h('p.cs-note', icon('info', { size: 16 }), 'يصله رابط دعوة ليختار كلمة مروره ويقبل شروط الخدمة، ثم يدعو زملاءه.'), fAdmin.el),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      { label: 'إنشاء الشركة وإرسال الدعوة', variant: 'primary', icon: 'check', onClick: async () => ((await submit()) ? undefined : false) },
    ],
    onClose: () => {
      if (!created) return;
      if (onCreated) onCreated(created);
      showCreated(ctx, created);
    },
  });
  syncTrial();
  drawPlan();
  return handle;
}

/** شاشة النتيجة بعد الإنشاء (U10-S20): الشركة، تشابه الأسماء (لا يمنع)، والدعوة أو رابطها لمرة واحدة */
export function showCreated(ctx, res) {
  const co = res.company || {};
  const inv = res.invite || {};
  const email = res.first_admin_email || null;
  const conflicts = Array.isArray(res.conflicts) ? res.conflicts : [];
  const matchText = conflicts
    .slice(0, 5)
    .map((m) => {
      const who = m.client?.name || m.party?.name || m.name;
      const where = m.client?.code || m.party?.case_code || m.party?.matter_code;
      return who ? `${who}${where ? ` (${where})` : ''}` : null;
    })
    .filter(Boolean)
    .join('، ');
  const inviteBlock = inv.emailed
    ? alertBox(email ? ['أرسلنا الدعوة إلى ', h('bdi', { dir: 'ltr' }, email), '.'] : 'أرسلنا الدعوة إلى البريد المسجل.', 'success', { icon: 'mail' })
    : inv.url
      ? h(
          'div.cs-invite',
          alertBox('البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط.', 'warning'),
          h('div.cs-invite-link', h('input.input', { type: 'text', readonly: true, dir: 'ltr', value: inv.url, 'aria-label': 'رابط الدعوة', onFocus: (e) => e.target.select() }), copyButton(inv.url, 'نسخ', { variant: 'secondary', size: 'md' })),
        )
      : null;
  return modal({
    title: `أُنشئت ${co.name || 'الشركة'}.`,
    size: 'md',
    className: 'cs-created',
    body: h(
      'div.cs-body',
      h('p.cs-created-line', codeTag(co.prefix), ' ', co.status_label || '', ' · ', `مدير العلاقة: ${co.account_manager?.name || '—'}`),
      conflicts.length ? alertBox(`تشابه أسماء محتمل: ${matchText || conflicts.length} — راجعها قبل بدء العمل.`, 'warning', { icon: 'alert' }) : null,
      inviteBlock,
    ),
    actions: [
      { label: 'إغلاق', variant: 'ghost' },
      { label: 'فتح صفحة الشركة', variant: 'primary', onClick: () => ctx.navigate(`/companies/${co.id}`) },
    ],
  });
}
