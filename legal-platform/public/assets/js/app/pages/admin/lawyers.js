// شبكة المحامين: كل محامٍ وحدة خبرة يمكن إدارتها — التخصص، التكلفة، الطاقة، الجودة، والسرعة.
// يصدّر أيضًا محرر اتفاق المحاسبة ونافذة إضافة/تعديل المحامي وأدوات الفترات الشهرية لصفحات المسار نفسه.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { showLinkDialog } from '../../components/account-admin.js';
import { label, areaLabel, areaOptions, options, num, count, money, percent, cairoToday, hours as fmtHours } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  filterBar,
  selectInput,
  searchInput,
  chips,
  badge,
  progressBar,
  button,
  emptyState,
  errorState,
  loading,
  modal,
  form,
  toast,
  icon,
  avatar,
  alertBox,
} from '../../../lib/ui.js';

// ───────────── الفترات الشهرية (YYYY-MM بتوقيت القاهرة) ─────────────

const MONTH_FMT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** هل القيمة فترة صحيحة بصيغة YYYY-MM؟ */
export function isPeriod(p) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ''));
}

/** الشهر الحالي بتوقيت القاهرة. */
export function currentPeriod() {
  return cairoToday().slice(0, 7);
}

/** إزاحة فترة بعدد من الأشهر. */
export function shiftPeriod(p, delta) {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** «أكتوبر 2026» */
export function periodLabel(p) {
  if (!isPeriod(p)) return '—';
  const [y, m] = p.split('-').map(Number);
  return MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 15)));
}

/** آخر n شهرًا (الأحدث أولًا) مع ضمان وجود الفترة المختارة. */
export function recentPeriods(n = 18, include) {
  const cur = currentPeriod();
  const list = Array.from({ length: n }, (_, i) => shiftPeriod(cur, -i));
  if (include && isPeriod(include) && !list.includes(include)) list.push(include);
  return list.sort().reverse();
}

/** قائمة اختيار الشهر. */
export function periodSelect({ value, onChange, label: aria = 'الشهر', allLabel = null, months = 18 } = {}) {
  return selectInput({
    label: aria,
    value: value || '',
    allLabel,
    options: recentPeriods(months, value).map((p) => ({ value: p, label: periodLabel(p) })),
    onChange,
  });
}

/** يحدّث الرابط الحالي بدون إعادة عرض الصفحة (حتى يحتفظ التحديث بالتصفية). */
export function replaceQuery(path, query) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}${qs ? `?${qs}` : ''}`);
}

/** «4.5 من 5» */
export function qualityText(q) {
  return q == null ? '—' : `${num(q)} من 5`;
}

/** «31.3 ساعة» أو «5 ساعات» (الأعداد الصحيحة بصيغة العدد العربية) */
export function hoursText(hrs) {
  return fmtHours(hrs);
}

// ───────────── اتفاق المحاسبة ─────────────

export const PAID_TYPES = ['per_case', 'monthly', 'monthly_quota', 'package'];
const AGREEMENT_KEYS = [
  'rate',
  'monthly_fee',
  'quota',
  'overage_rate',
  'package_size',
  'package_price',
  'notional_value',
  'csr_firm',
  'csr_cases_commitment',
  'csr_hours_commitment',
  'csr_period',
  'billable_event',
];

const egp = (x) => money(Number(x) || 0);
const consultations = (n) => count(Number(n) || 0, 'consultation');

/** وصف عربي للاتفاق (يطابق وصف الخادم) مع موعد الاستحقاق. */
export function describeAgreement(a, { withTrigger = false } = {}) {
  if (!a || !a.type) return '—';
  let text;
  switch (a.type) {
    case 'per_case':
      text = `${egp(a.rate)} لكل استشارة معتمدة`;
      break;
    case 'monthly':
      text = `${egp(a.monthly_fee)} شهريًا مهما كان عدد الاستشارات`;
      break;
    case 'monthly_quota':
      text = `${egp(a.monthly_fee)} شهريًا تشمل ${consultations(a.quota)}، والزيادة ${egp(a.overage_rate)} للاستشارة`;
      break;
    case 'package':
      text = `باقة ${consultations(a.package_size)} بقيمة ${egp(a.package_price)}${Number(a.overage_rate) ? `، وبعد نفادها ${egp(a.overage_rate)} للاستشارة` : ''}`;
      break;
    case 'pro_bono':
      text = `تطوعي بالكامل دون مقابل${Number(a.notional_value) ? ` — القيمة التقديرية ${egp(a.notional_value)} للاستشارة` : ''}`;
      break;
    case 'csr': {
      const parts = [a.csr_cases_commitment ? consultations(a.csr_cases_commitment) : null, a.csr_hours_commitment ? fmtHours(a.csr_hours_commitment) : null].filter(Boolean);
      text = `برنامج مسؤولية مجتمعية — ${a.csr_firm || 'مكتب المحاماة'}: ${parts.length ? parts.join(' و') : 'لم يُحدد الالتزام بعد'} ${a.csr_period === 'month' ? 'شهريًا' : 'سنويًا'}`;
      break;
    }
    default:
      text = label('agreement_type', a.type);
  }
  if (withTrigger && PAID_TYPES.includes(a.type)) {
    text += a.billable_event === 'on_close' ? ' — تُستحق عند إغلاق الملف' : ' — تُستحق عند اعتماد الإدارة للرأي';
  }
  return text;
}

function agreementFields(type) {
  const moneyF = (name, lbl, { required = true, hint } = {}) => ({ name, label: lbl, type: 'money', required, min: 0, hint });
  const intF = (name, lbl, { required = true, min = 1, hint, suffix } = {}) => ({ name, label: lbl, type: 'number', integer: true, required, min, max: 100000, hint, suffix });
  const trigger = {
    name: 'billable_event',
    label: 'متى تُستحق الأتعاب؟',
    type: 'select',
    required: true,
    placeholder: false,
    options: options('billable_trigger'),
    hint: 'واقعة الاستحقاق التي يُسجَّل عندها الأثر المالي تلقائيًا',
  };
  switch (type) {
    case 'per_case':
      return [moneyF('rate', 'أجر الاستشارة المعتمدة', { hint: 'يُستحق مرة واحدة لكل استشارة تعتمدها الإدارة' }), trigger];
    case 'monthly':
      return [moneyF('monthly_fee', 'المبلغ الشهري الثابت', { hint: 'يُصدر شهريًا من صفحة المحاسبة' }), trigger];
    case 'monthly_quota':
      return [
        moneyF('monthly_fee', 'المبلغ الشهري'),
        intF('quota', 'عدد الاستشارات المشمولة شهريًا', { suffix: 'استشارة' }),
        moneyF('overage_rate', 'سعر الاستشارة الزائدة على الحصة'),
        trigger,
      ];
    case 'package':
      return [
        intF('package_size', 'عدد استشارات الباقة', { suffix: 'استشارة' }),
        moneyF('package_price', 'قيمة الباقة'),
        moneyF('overage_rate', 'سعر الاستشارة بعد نفاد الباقة', { required: false, hint: 'اتركه فارغًا إن لم يُتفق على سعر بعد نفاد الباقة' }),
        trigger,
      ];
    case 'pro_bono':
      return [moneyF('notional_value', 'القيمة التقديرية للاستشارة', { required: false, hint: 'لقياس قيمة المساهمة التطوعية فقط؛ لا تُصرف أي مبالغ' })];
    case 'csr':
      return [
        { name: 'csr_firm', label: 'اسم مكتب المحاماة', type: 'text', required: true, maxLength: 150 },
        {
          name: 'csr_period',
          label: 'فترة الالتزام',
          type: 'select',
          required: true,
          placeholder: false,
          options: [
            { value: 'year', label: 'سنويًا' },
            { value: 'month', label: 'شهريًا' },
          ],
        },
        intF('csr_cases_commitment', 'عدد الاستشارات الملتزم بها', { required: false, min: 0, suffix: 'استشارة' }),
        { name: 'csr_hours_commitment', label: 'عدد الساعات الملتزم بها', type: 'number', min: 0, max: 100000, suffix: 'ساعة' },
        moneyF('notional_value', 'القيمة التقديرية للاستشارة', { required: false, hint: 'لقياس قيمة مساهمة المكتب فقط' }),
      ];
    default:
      return [];
  }
}

/**
 * محرر اتفاق المحاسبة بحقول تتغير حسب النوع ومعاينة حية للصياغة.
 * @param {object} [initial] الاتفاق الحالي
 * @param {{originalType?:string, packageRemaining?:number|null, isNew?:boolean}} [opts]
 * @returns {{el:HTMLElement, validate:()=>boolean, getValue:()=>object}}
 */
export function agreementEditor(initial = {}, { originalType = null, packageRemaining = null, isNew = true } = {}) {
  const values = { billable_event: 'on_approval', csr_period: 'year', ...(initial || {}) };
  let type = values.type || 'per_case';
  let sub = null;
  const subHost = h('div.pd-ag-fields');
  const previewText = h('span.pd-ag-preview-text');
  const notice = h('div.pd-ag-notice');

  const typeForm = form(
    [
      {
        name: 'type',
        label: 'نوع الاتفاق',
        type: 'select',
        required: true,
        placeholder: false,
        options: options('agreement_type'),
        full: true,
        onChange: (v) => {
          capture();
          type = v || 'per_case';
          buildSub();
        },
      },
    ],
    { footer: false, columns: 1, values: { type } },
  );

  function capture() {
    if (!sub) return;
    const vals = sub.getValues();
    for (const [k, v] of Object.entries(vals)) if (v != null && v !== '') values[k] = v;
  }

  function buildSub() {
    const fields = agreementFields(type);
    sub = form(fields, { footer: false, values: Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? null])) });
    mount(subHost, fields.length ? sub.el : null);
    updatePreview();
  }

  function current() {
    const vals = sub ? sub.getValues() : {};
    const out = { type };
    for (const k of AGREEMENT_KEYS) if (vals[k] != null && vals[k] !== '') out[k] = vals[k];
    if (!PAID_TYPES.includes(type)) out.billable_event = values.billable_event || 'on_approval';
    return out;
  }

  function updatePreview() {
    previewText.textContent = describeAgreement(current(), { withTrigger: true });
    let msg = null;
    let tone = 'info';
    if (type === 'package' && originalType !== 'package') {
      msg = isNew
        ? 'عند الحفظ يُضاف رصيد الباقة للمحامي وتُسجَّل قيمتها كمستحق له في دفتر المحاسبة.'
        : 'عند الحفظ يتحول الاتفاق إلى باقة: يُضاف رصيدها وتُسجَّل قيمتها كمستحق للمحامي.';
    } else if (type === 'package' && originalType === 'package') {
      msg = 'تعديل بيانات الباقة هنا لا يضيف رصيدًا جديدًا؛ استخدم «تجديد الباقة» لإضافة استشارات.';
    } else if (originalType === 'package' && type !== 'package') {
      msg = `تغيير نوع الاتفاق يلغي رصيد الباقة المتبقي${packageRemaining ? ` (${consultations(packageRemaining)})` : ''}.`;
      tone = 'warning';
    } else if (type === 'pro_bono' || type === 'csr') {
      msg = 'لا تُسجَّل مستحقات مالية لهذا الاتفاق؛ تُحتسب كل استشارة معتمدة مساهمةً تطوعية وتظهر قيمتها في تقارير المحاسبة.';
      tone = 'success';
    }
    mount(notice, msg ? alertBox(msg, tone) : null);
  }

  const el = h(
    'div.pd-ag',
    typeForm.el,
    subHost,
    h('div.pd-ag-preview', { 'aria-live': 'polite' }, icon('fileText', { size: 18 }), h('div', h('span.pd-ag-preview-label', 'صياغة الاتفاق: '), previewText)),
    notice,
  );
  el.addEventListener('input', updatePreview);
  el.addEventListener('change', updatePreview);
  buildSub();

  return {
    el,
    validate() {
      const a = typeForm.validate();
      const b = sub ? sub.validate() : true;
      if (!a || !b) return false;
      if (type === 'csr') {
        const v = sub.getValues();
        if (!v.csr_cases_commitment && !v.csr_hours_commitment) {
          sub.setErrors({ csr_cases_commitment: 'حدد عدد الاستشارات أو عدد الساعات التي يلتزم بها المكتب' });
          return false;
        }
      }
      return true;
    },
    getValue: current,
  };
}

const BAR_LEVELS = ['جدول عام', 'ابتدائي', 'استئناف', 'نقض'];

/**
 * نافذة إضافة محامٍ جديد أو تعديل بياناته واتفاقه.
 * @param {{lawyer?:object, onSaved:(lawyer:object)=>void}} opts
 */
export function openLawyerDialog({ lawyer = null, onSaved } = {}) {
  const isNew = !lawyer;
  const levels = [...BAR_LEVELS];
  if (lawyer?.bar_level && !levels.includes(lawyer.bar_level)) levels.push(lawyer.bar_level);
  const titles = [
    { value: 'أ.', label: 'أ. (الأستاذ/ة)' },
    { value: 'د.', label: 'د. (الدكتور/ة)' },
  ];
  if (lawyer?.title && !titles.some((t) => t.value === lawyer.title)) titles.push({ value: lawyer.title, label: lawyer.title });

  const profile = form(
    [
      { name: 'name', label: 'اسم المحامي', required: true, maxLength: 120, placeholder: 'الاسم كما يظهر في كارنيه النقابة' },
      { name: 'title', label: 'اللقب', type: 'select', required: true, placeholder: false, options: titles },
      isNew && {
        name: 'username',
        label: 'اسم المستخدم للدخول',
        required: true,
        ltr: true,
        minLength: 3,
        maxLength: 40,
        autocomplete: 'off',
        hint: 'حروف لاتينية وأرقام فقط، مثل: m.salem',
      },
      // وحدة الحسابات: الدعوة برابط للاستخدام مرة واحدة هي الافتراض؛ أو كلمة مرور مؤقتة يلزم تغييرها عند أول دخول
      isNew && {
        name: 'activation',
        label: 'طريقة تفعيل الحساب',
        type: 'select',
        required: true,
        placeholder: false,
        options: [
          { value: 'invite', label: 'رابط دعوة يختار به المحامي كلمة المرور (موصى به)' },
          { value: 'password', label: 'كلمة مرور مؤقتة أسلّمها له بنفسي' },
        ],
        hint: 'رابط الدعوة صالح 72 ساعة ويمكن إرساله عبر واتساب إلى رقم المحامي',
        onChange: (val, f) => {
          const c = f.control('password');
          if (c && c.wrap) c.wrap.hidden = val !== 'password';
        },
      },
      isNew && { name: 'password', label: 'كلمة المرور المؤقتة', type: 'password', minLength: 8, autocomplete: 'new-password', hint: 'ثمانية أحرف على الأقل تجمع بين الحروف والأرقام، ويُطلب من المحامي تغييرها عند أول دخول' },
      { name: 'phone', label: 'رقم الموبايل', type: 'phone', hint: 'للتواصل الداخلي فقط — لا يظهر للعملاء' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
      { name: 'bar_number', label: 'رقم القيد بالنقابة', ltr: true, maxLength: 40 },
      { name: 'bar_level', label: 'درجة القيد', type: 'select', placeholder: '— غير محدد —', options: levels.map((x) => ({ value: x, label: x })) },
      { name: 'firm', label: 'مكتب المحاماة (إن وُجد)', maxLength: 150 },
      {
        name: 'capacity',
        label: 'الطاقة الاستيعابية',
        type: 'number',
        integer: true,
        required: true,
        min: 1,
        max: 1000,
        suffix: 'إسناد',
        hint: 'أقصى عدد من الإسنادات المفتوحة في الوقت نفسه',
      },
      { name: 'specialties', label: 'التخصصات', type: 'checkboxes', required: true, options: areaOptions() },
      { name: 'notes', label: 'ملاحظات داخلية', type: 'textarea', rows: 3, maxLength: 3000 },
    ],
    {
      footer: false,
      values: lawyer
        ? {
            name: lawyer.name,
            title: lawyer.title || 'أ.',
            phone: lawyer.phone,
            email: lawyer.email,
            bar_number: lawyer.bar_number,
            bar_level: lawyer.bar_level,
            firm: lawyer.firm,
            capacity: lawyer.capacity,
            specialties: lawyer.specialties,
            notes: lawyer.notes,
          }
        : { title: 'أ.', capacity: 10, activation: 'invite' },
    },
  );
  if (isNew) {
    const pw = profile.control('password');
    if (pw && pw.wrap) pw.wrap.hidden = true;
  }

  const editor = agreementEditor(lawyer ? lawyer.agreement : { type: 'per_case' }, {
    originalType: lawyer ? lawyer.agreement?.type : null,
    packageRemaining: lawyer ? lawyer.package_remaining : null,
    isNew,
  });

  const body = frag(
    h('p.modal-intro', isNew ? 'أنشئ حسابًا للمحامي في الشبكة وحدد تخصصاته وطاقته واتفاق المحاسبة الخاص به.' : 'عدّل بيانات المحامي وتخصصاته واتفاق المحاسبة. تسري التعديلات على الوقائع الجديدة فقط.'),
    h('h3.pd-dialog-heading', icon('user', { size: 18 }), 'البيانات الأساسية'),
    profile.el,
    h('h3.pd-dialog-heading', icon('wallet', { size: 18 }), 'اتفاق المحاسبة'),
    h('p.pd-dialog-note', 'يحدد الاتفاق ما يحدث ماليًا تلقائيًا عند تحقق واقعة الاستحقاق، وتلتزم به المحاسبة دون إدخال يدوي.'),
    editor.el,
  );

  modal({
    title: isNew ? 'إضافة محامٍ إلى الشبكة' : `تعديل بيانات ${lawyer.display_name}`,
    size: 'lg',
    body,
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: isNew ? 'إضافة المحامي' : 'حفظ التعديلات',
        variant: 'primary',
        icon: isNew ? 'userPlus' : 'check',
        onClick: async () => {
          const okProfile = profile.validate();
          const okAgreement = editor.validate();
          if (!okProfile || !okAgreement) return false;
          const v = profile.getValues();
          if (isNew && !/^[a-zA-Z0-9._-]+$/.test(v.username)) {
            profile.setErrors({ username: 'اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط' });
            return false;
          }
          const payload = {
            name: v.name,
            title: v.title,
            phone: v.phone || null,
            email: v.email || null,
            bar_number: v.bar_number || null,
            bar_level: v.bar_level || null,
            firm: v.firm || null,
            capacity: v.capacity,
            specialties: v.specialties,
            notes: v.notes || null,
            agreement: editor.getValue(),
          };
          if (isNew) {
            payload.username = v.username;
            if (v.activation === 'password') {
              if (!v.password || v.password.length < 8 || !/\p{L}/u.test(v.password) || !/\p{N}/u.test(v.password)) {
                profile.setErrors({ password: 'كلمة المرور المؤقتة يجب ألا تقل عن 8 أحرف وتجمع بين الحروف والأرقام' });
                return false;
              }
              payload.password = v.password;
              payload.temporary_password = true;
            }
          }
          try {
            const saved = isNew ? await api.post('/admin/lawyers', payload) : await api.patch(`/admin/lawyers/${encodeURIComponent(lawyer.id)}`, payload);
            if (onSaved) onSaved(saved);
            return undefined;
          } catch (err) {
            profile.showError(err);
            return false;
          }
        },
      },
    ],
  });
}

// ───────────── عناصر العرض ─────────────

/** الحمل الحالي مقابل الطاقة الاستيعابية. */
export function loadMeter(open, capacity, name) {
  const cap = Number(capacity) || 0;
  const ratio = cap ? open / cap : 0;
  const tone = ratio > 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'primary';
  return h(
    'div.pd-load',
    progressBar(Math.min(open, cap || open), cap || 1, tone, { label: `الحمل الحالي${name ? ` لـ ${name}` : ''}: ${open} من ${cap}`, visibleLabel: false }),
    h(
      'div.pd-load-meta',
      h('span.pd-load-num', `${num(open)} من ${num(cap)}`),
      h('span.muted', percent(ratio)),
      open > cap ? badge('تجاوز الطاقة', 'danger', { icon: 'alert' }) : cap && open === cap ? badge('بلغ الحد الأقصى', 'warning') : null,
    ),
  );
}

function activeBadge(active) {
  return active ? badge('نشط', 'success', { dot: true }) : badge('موقوف', 'muted', { dot: true });
}

function overdueCell(n) {
  return n ? badge(`${num(n)} متأخرة`, 'danger', { icon: 'clock' }) : h('span.muted', '0');
}

function nameCell(l) {
  return h(
    'div.pd-person',
    avatar(l.display_name, { size: 'sm' }),
    h(
      'div.pd-person-text',
      h('a.cell-title', { href: `#/lawyers/${l.id}` }, l.display_name),
      h('div.cell-sub', l.firm || (l.bar_level ? `قيد ${l.bar_level}` : 'محامٍ مستقل')),
      chips(l.specialties_labels || l.specialties.map(areaLabel), { className: 'pd-spec-chips' }),
      h('div.pd-person-badges', activeBadge(l.active), l.invite_pending ? badge('بانتظار قبول الدعوة', 'info', { dot: true }) : null),
    ),
  );
}

function agreementCell(l) {
  return h(
    'div.pd-agreement-cell',
    h('div', l.agreement_text || '—'),
    l.package_remaining != null &&
      badge(`المتبقي في الباقة: ${num(l.package_remaining)}`, l.package_remaining > 0 ? 'primary' : 'danger', { title: 'عدد الاستشارات المتبقية في الباقة المدفوعة' }),
  );
}

function lawyerCard(l) {
  const m = l.metrics;
  const metric = (k, v) => h('div.pd-mini', h('span.pd-mini-k', k), h('span.pd-mini-v', v));
  return h(
    'a.pd-lcard',
    { href: `#/lawyers/${l.id}`, class: !l.active && 'is-inactive', 'aria-label': `ملف ${l.display_name}` },
    h('div.pd-lcard-head', avatar(l.display_name), h('div.pd-person-text', h('div.cell-title', l.display_name), h('div.cell-sub', l.firm || (l.bar_level ? `قيد ${l.bar_level}` : 'محامٍ مستقل'))), activeBadge(l.active)),
    chips(l.specialties_labels || l.specialties.map(areaLabel)),
    h('div.pd-lcard-agreement', icon('wallet', { size: 15 }), h('span', l.agreement_text)),
    loadMeter(m.open_assignments, l.capacity, l.display_name),
    h(
      'div.pd-mini-grid',
      metric('متأخرة', m.overdue ? h('strong.pd-text-danger', num(m.overdue)) : '0'),
      metric('زمن الرد', hoursText(m.avg_response_hours)),
      metric('منجز الشهر', num(m.completed_in_period)),
      metric('الجودة', qualityText(m.avg_quality)),
      metric('الإعادة', percent(m.returned_rate)),
      metric('تطوعي', num(m.pro_bono_in_period)),
    ),
  );
}

// ───────────── الصفحة ─────────────

export default async function render(ctx) {
  const isAdmin = ctx.user?.role === 'admin';
  const validAreas = areaOptions().map((a) => a.value);
  const state = {
    period: isPeriod(ctx.query.period) ? ctx.query.period : currentPeriod(),
    area: validAreas.includes(ctx.query.area) ? ctx.query.area : '',
    q: '',
    status: ['active', 'inactive'].includes(ctx.query.status) ? ctx.query.status : '',
  };
  let data = await api.get('/admin/lawyers', { period: state.period, area: state.area });

  const statsHost = h('div.stats-grid.pd-stats-5');
  const resultsHost = h('div.pd-results');
  let seq = 0;

  function syncUrl() {
    replaceQuery('/lawyers', { period: state.period === currentPeriod() ? '' : state.period, area: state.area, status: state.status });
  }

  async function refetch() {
    const my = ++seq;
    syncUrl();
    mount(resultsHost, loading());
    try {
      const d = await api.get('/admin/lawyers', { period: state.period, area: state.area });
      if (my !== seq) return;
      data = d;
      draw();
    } catch (err) {
      if (my !== seq) return;
      mount(resultsHost, errorState(err, refetch));
    }
  }

  function drawStats() {
    const t = data.totals || {};
    const pl = periodLabel(data.period || state.period);
    const loadRatio = t.capacity ? t.open_assignments / t.capacity : 0;
    mount(
      statsHost,
      statCard({ label: 'المحامون النشطون', value: num(t.active), hint: `من إجمالي ${num(t.lawyers)} في الشبكة`, icon: 'users', tone: 'primary' }),
      statCard({
        label: 'الإسنادات المفتوحة مقابل الطاقة',
        value: h('span.nowrap', `${num(t.open_assignments)} من ${num(t.capacity)}`),
        hint: progressBar(t.open_assignments, t.capacity || 1, loadRatio > 0.85 ? 'warning' : 'primary', { label: 'نسبة استخدام الطاقة الإجمالية', visibleLabel: false }),
        icon: 'briefcase',
        tone: 'info',
      }),
      statCard({
        label: 'إسنادات متأخرة',
        value: num(t.overdue),
        hint: t.overdue ? 'تجاوزت الموعد المطلوب للرد' : 'لا توجد إسنادات متأخرة',
        icon: 'clock',
        tone: t.overdue ? 'danger' : 'success',
      }),
      statCard({ label: 'إسنادات مُنجزة ومعتمدة', value: num(t.completed_in_period), hint: `خلال ${pl}`, icon: 'checkCircle', tone: 'success' }),
      statCard({ label: 'استشارات تطوعية', value: num(t.pro_bono_in_period), hint: `خلال ${pl}`, icon: 'star', tone: 'accent' }),
    );
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return (data.items || []).filter((l) => {
      if (state.status === 'active' && !l.active) return false;
      if (state.status === 'inactive' && l.active) return false;
      if (!q) return true;
      return [l.display_name, l.username, l.firm, l.bar_number].filter(Boolean).some((x) => String(x).toLowerCase().includes(q));
    });
  }

  function drawResults() {
    const items = filtered();
    if (!items.length) {
      const hasFilter = state.area || state.q || state.status;
      mount(
        resultsHost,
        card({
          body: emptyState(
            hasFilter ? 'لا يوجد محامون مطابقون للتصفية الحالية' : 'لم يُضف أي محامٍ إلى الشبكة بعد',
            hasFilter
              ? button('مسح التصفية', { icon: 'x', onClick: clearFilters })
              : isAdmin && button('إضافة محامٍ', { variant: 'primary', icon: 'userPlus', onClick: openAdd }),
            { icon: 'scale' },
          ),
        }),
      );
      return;
    }
    const pl = periodLabel(data.period || state.period);
    const tbl = table({
      className: 'pd-table-tight',
      caption: 'قائمة محامي الشبكة ومؤشرات أدائهم',
      rows: items,
      rowClass: (l) => !l.active && 'is-muted',
      onRowClick: (l) => ctx.navigate(`/lawyers/${l.id}`),
      columns: [
        { key: 'name', label: 'المحامي والتخصصات', render: nameCell, className: 'pd-col-name' },
        { key: 'agreement', label: 'الاتفاق', render: agreementCell, className: 'pd-col-agreement' },
        { key: 'load', label: 'الحمل الحالي', render: (l) => loadMeter(l.metrics.open_assignments, l.capacity, l.display_name), className: 'pd-col-load' },
        {
          key: 'speed',
          label: 'السرعة والتأخير',
          render: (l) =>
            h(
              'div.pd-cell-stack',
              h('span.nowrap', { title: 'متوسط الزمن من الإسناد حتى أول تقديم' }, hoursText(l.metrics.avg_response_hours)),
              l.metrics.overdue ? overdueCell(l.metrics.overdue) : h('span.cell-sub', 'لا تأخير'),
            ),
        },
        {
          key: 'done',
          label: 'المنجز في الشهر',
          render: (l) =>
            h(
              'div.pd-cell-stack',
              h('span.nowrap', `${num(l.metrics.completed_in_period)} معتمدة`),
              h('span.cell-sub.nowrap', `${num(l.metrics.pro_bono_in_period)} تطوعية`),
            ),
        },
        {
          key: 'quality',
          label: 'الجودة',
          render: (l) =>
            h(
              'div.pd-cell-stack',
              l.metrics.avg_quality == null ? h('span.muted', 'لا تقييم بعد') : h('span.pd-quality.nowrap', icon('star', { size: 14 }), qualityText(l.metrics.avg_quality)),
              l.metrics.returned_rate == null
                ? null
                : h('span.cell-sub.nowrap', { class: l.metrics.returned_rate >= 0.3 ? 'pd-text-warning' : null }, 'الإعادة للتعديل ', h('bdi.ltr', { dir: 'ltr' }, percent(l.metrics.returned_rate))),
            ),
        },
      ],
    });
    mount(
      resultsHost,
      h('div.pd-only-desktop', card({ body: tbl, flush: true })),
      h('div.pd-only-mobile.pd-lcards', items.map(lawyerCard)),
      h('p.pd-footnote', `عدد المحامين المعروضين: ${num(items.length)} — المؤشرات الشهرية عن ${pl}. الجودة متوسط تقييم الإدارة للآراء المعتمدة، ونسبة الإعادة نسبة الآراء التي أُعيدت للتعديل.`),
    );
  }

  function draw() {
    drawStats();
    drawResults();
  }

  const areaSel = selectInput({
    label: 'التخصص',
    allLabel: 'كل التخصصات',
    value: state.area,
    options: areaOptions(),
    onChange: (v) => {
      state.area = v;
      refetch();
    },
  });
  const periodSel = periodSelect({
    label: 'شهر المؤشرات',
    value: state.period,
    onChange: (v) => {
      state.period = v;
      refetch();
    },
  });
  const statusSel = selectInput({
    label: 'حالة الحساب',
    allLabel: 'كل الحسابات',
    value: state.status,
    options: [
      { value: 'active', label: 'النشطون فقط' },
      { value: 'inactive', label: 'الموقوفون فقط' },
    ],
    onChange: (v) => {
      state.status = v;
      syncUrl();
      drawResults();
    },
  });
  const search = searchInput({
    placeholder: 'ابحث بالاسم أو اسم المستخدم أو المكتب…',
    label: 'بحث في المحامين',
    onSearch: (q) => {
      state.q = q;
      drawResults();
    },
  });

  function clearFilters() {
    state.area = '';
    state.q = '';
    state.status = '';
    areaSel.querySelector('select').value = '';
    statusSel.querySelector('select').value = '';
    search.querySelector('input').value = '';
    refetch();
  }

  function openAdd() {
    openLawyerDialog({
      onSaved: (l) => {
        toast(`تمت إضافة ${l.display_name || l.name} إلى شبكة المحامين`, 'success');
        // حساب بدعوة: نعرض رابط الدعوة (نسخ / إرسال عبر واتساب) ثم ننتقل إلى ملف المحامي
        if (l.invite) showLinkDialog(l.invite, { onClose: () => ctx.navigate(`/lawyers/${l.id}`) });
        else ctx.navigate(`/lawyers/${l.id}`);
      },
    });
  }

  draw();

  return frag(
    pageHeader({
      title: 'شبكة المحامين',
      subtitle: 'كل محامٍ وحدة خبرة يمكن إدارتها: نعرف تخصصه وتكلفته وطاقته وجودة عمله وسرعته.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'شبكة المحامين' }],
      actions: isAdmin ? button('إضافة محامٍ', { variant: 'primary', icon: 'userPlus', onClick: openAdd }) : null,
    }),
    statsHost,
    filterBar([search, areaSel, statusSel, periodSel]),
    resultsHost,
  );
}

export { activeBadge };
