// صفحة تقديم الطلب من الموقع: نموذج منظم أو محادثة خطوة بخطوة، والطريقتان تكتبان في نفس المسودة.
// المجالات القانونية والمحافظات تأتي من /api/meta (لا تُكتب هنا)، وبيانات الأسرة اختيارية لترتيب الأولويات.

import { h, mount } from '../lib/h.js';
import { api, filesToUploads } from '../lib/api.js';
import { setMeta, getMeta, areaOptions, areaLabel, governorateOptions, normalizeEgPhone, toLatinDigits, count, money, ltr } from '../lib/fmt.js';
import {
  form,
  tabs,
  button,
  icon,
  codeTag,
  copyButton,
  alertBox,
  errorState,
  fileInput,
  progressBar,
  kv,
  errorMessage,
  loading,
  setBusy,
} from '../lib/ui.js';
import { captureAttribution, getAttribution, whatsappUrl, initSiteChrome } from './common.js';

const UNSURE = 'unsure';
const MIN_DESC = 20;
const MAX_DESC = 5000;
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_FILE_NO = 40;
const QUICK_GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية'];
const PHONE_ERROR = 'أدخل رقم موبايل مصري صحيح مثل 01012345678';

// ───────────── بيانات الأسرة (اختيارية) — نفس قيم واجهة الخادم ─────────────
// المسميات من /api/meta (LABELS) إن وُجدت حتى يتطابق المصطلح مع واجهة الإدارة، وهذه القوائم ترتيبها واحتياطيها
const RELATIONS_FALLBACK = [
  { value: 'widow', label: 'أرملة' },
  { value: 'orphan_guardian', label: 'ولي أمر أو وصي على أيتام' },
  { value: 'divorced', label: 'مطلقة' },
  { value: 'wife', label: 'زوجة' },
  { value: 'other', label: 'غير ذلك' },
];
const INCOME_FALLBACK = [
  { value: 'none', label: 'لا يوجد دخل ثابت' },
  { value: 'lt_2000', label: `أقل من ${money(2000)} شهريًا` },
  { value: '2000_4000', label: `من ${money(2000)} إلى ${money(4000)}` },
  { value: '4000_7000', label: `من ${money(4000)} إلى ${money(7000)}` },
  { value: 'gt_7000', label: `أكثر من ${money(7000)}` },
];
const HOUSING_FALLBACK = [
  { value: 'owned', label: 'سكن تمليك' },
  { value: 'rented_old', label: 'إيجار قديم' },
  { value: 'rented_new', label: 'إيجار جديد' },
  { value: 'family', label: 'أقيم مع الأهل أو الأقارب' },
  { value: 'none', label: 'لا يوجد سكن مستقر' },
];
const CHILD_FORMS = ['طفل واحد', 'طفلان', 'أطفال', 'طفلًا'];
const CHILDREN = [{ value: 0, label: 'لا يوجد أطفال' }, ...Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: count(i + 1, CHILD_FORMS) }))];
const FILE_NO_RE = /^[\p{L}\p{N}][\p{L}\p{N} /._-]*$/u;
const FILE_NO_ERROR = 'رقم الملف يقبل الحروف والأرقام والشرطة والشرطة المائلة فقط';

function withMetaLabels(group, fallback) {
  const g = getMeta().constants?.LABELS?.[group] || {};
  return fallback.map((o) => ({ value: o.value, label: g[o.value] || o.label }));
}
const RELATIONS = () => withMetaLabels('beneficiary_relation', RELATIONS_FALLBACK);
const INCOME_BANDS = () => withMetaLabels('income_band', INCOME_FALLBACK);
const HOUSING = () => withMetaLabels('housing', HOUSING_FALLBACK);

const BENEF_NOTE = 'تساعدنا هذه البيانات على ترتيب الأولويات وتحديد الاستحقاق، ويطّلع عليها فريق المؤسسة المختص فقط. كل الحقول اختيارية.';

const optLabel = (list, v) => (list.find((o) => String(o.value) === String(v)) || {}).label || '';

const root = document.getElementById('intake-root');
let settings = {};
let site = {};

// مسودة مشتركة بين الطريقتين حتى لا تضيع البيانات عند التبديل
const draft = {
  name: '',
  phone: '',
  email: '',
  governorate: null,
  legal_area: null,
  description: '',
  documents: [],
  beneficiary: {},
  consent: false,
};

// حقل المصيدة: يبقى فارغًا عند البشر، مخفي بصريًا وعن قارئات الشاشة
const honeypotInput = h('input', { type: 'text', id: 'hp-website', name: 'website', tabindex: '-1', autocomplete: 'off' });
const honeypot = h('div.honeypot', { 'aria-hidden': 'true' }, h('label', { htmlFor: 'hp-website' }, 'الموقع الإلكتروني'), honeypotInput);

const orgName = () => settings.org_name || 'مؤسسة بيوت مصر';
// الاسم الذي نخاطب به: الكلمة الأولى، أو الكنية كاملة («أم يوسف»، «أبو أحمد»)
const KUNYA = new Set(['أم', 'ام', 'أبو', 'ابو']);
const firstName = (name) => {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  return KUNYA.has(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
};

function areaText(v) {
  if (!v) return 'لم يُحدد';
  return v === UNSURE ? 'لست متأكدًا' : areaLabel(v);
}

function filesText(files) {
  const n = files.length;
  if (!n) return 'لا توجد مستندات حاليًا';
  const names = files.map((f) => f.name).join('، ');
  if (n === 1) return `أرفقت ملفًا واحدًا: ${names}`;
  if (n === 2) return `أرفقت ملفين: ${names}`;
  return `أرفقت ${count(n, 'file')}: ${names}`;
}

/** بيانات الأسرة بصيغة واجهة الخادم، أو null إن لم يُملأ شيء. */
function beneficiaryPayload(b = {}) {
  const out = {};
  if (RELATIONS_FALLBACK.some((o) => o.value === b.relation)) out.relation = b.relation;
  const kids = b.children_count === '' || b.children_count == null ? null : Number(b.children_count);
  if (Number.isInteger(kids) && kids >= 0 && kids <= 20) out.children_count = kids;
  const fileNo = toLatinDigits(String(b.foundation_file_number || '')).trim().slice(0, MAX_FILE_NO);
  if (fileNo) out.foundation_file_number = fileNo;
  if (INCOME_FALLBACK.some((o) => o.value === b.monthly_income_band)) out.monthly_income_band = b.monthly_income_band;
  if (HOUSING_FALLBACK.some((o) => o.value === b.housing)) out.housing = b.housing;
  return Object.keys(out).length ? out : null;
}

function beneficiaryText(b) {
  const p = beneficiaryPayload(b);
  if (!p) return '';
  return [
    p.relation && optLabel(RELATIONS(), p.relation),
    p.children_count != null && optLabel(CHILDREN, p.children_count),
    p.housing && optLabel(HOUSING(), p.housing),
    p.monthly_income_band && `الدخل: ${optLabel(INCOME_BANDS(), p.monthly_income_band)}`,
    p.foundation_file_number && `رقم الملف بالمؤسسة: ${p.foundation_file_number}`,
  ]
    .filter(Boolean)
    .join('، ');
}

/** حقول بيانات الأسرة بمواصفات form() — prefix يميزها داخل النموذج الكامل */
function beneficiaryFields(prefix = 'b_') {
  return [
    { name: `${prefix}relation`, label: 'صفة مقدّم الطلب', type: 'select', options: RELATIONS(), placeholder: '— اختر —' },
    { name: `${prefix}children_count`, label: 'عدد الأطفال المعالين', type: 'select', options: CHILDREN, placeholder: '— اختر —' },
    { name: `${prefix}housing`, label: 'السكن الحالي', type: 'select', options: HOUSING(), placeholder: '— اختر —' },
    { name: `${prefix}monthly_income_band`, label: 'دخل الأسرة الشهري تقريبًا', type: 'select', options: INCOME_BANDS(), placeholder: '— اختر —' },
    {
      name: `${prefix}foundation_file_number`,
      label: 'رقم ملفك لدى المؤسسة',
      maxLength: MAX_FILE_NO,
      ltr: true,
      placeholder: 'إن كنت من مستفيدي برامج المؤسسة',
      hint: 'اختياري — تجده في بطاقة المستفيد أو لدى الباحثة الاجتماعية',
    },
  ];
}

const B_KEYS = ['relation', 'children_count', 'housing', 'monthly_income_band', 'foundation_file_number'];

function beneficiaryFromValues(values, prefix = 'b_') {
  const b = {};
  for (const k of B_KEYS) b[k] = values[`${prefix}${k}`] ?? null;
  return b;
}

function beneficiaryToValues(b = {}, prefix = 'b_') {
  const out = {};
  for (const k of B_KEYS) out[`${prefix}${k}`] = b[k] ?? null;
  return out;
}

// ───────────── الإرسال ─────────────

async function submitIntake(values, mode) {
  const files = values.documents || [];
  if (files.length > MAX_FILES) throw new Error(`يمكنك إرفاق ${count(MAX_FILES, 'file')} كحد أقصى`);
  const documents = await filesToUploads(files, { maxBytes: MAX_BYTES });
  const payload = {
    name: String(values.name || '').trim(),
    phone: normalizeEgPhone(values.phone) || toLatinDigits(values.phone || '').trim(),
    governorate: values.governorate || '',
    legal_area: values.legal_area && values.legal_area !== UNSURE ? values.legal_area : '',
    description: String(values.description || '').trim(),
    documents,
    attribution: getAttribution(),
    mode,
    consent: true,
    website: honeypotInput.value,
  };
  const email = String(values.email || '').trim();
  if (email) payload.email = email;
  const beneficiary = beneficiaryPayload(values.beneficiary);
  if (beneficiary) payload.beneficiary = beneficiary;
  const res = await api.post('/public/intake', payload);
  showSuccess(res, payload.name);
}

function successStep(n, title, text, done = false) {
  return h(
    'li',
    { class: done && 'is-done' },
    h('span.success-step-num', { 'aria-hidden': 'true' }, done ? icon('check', { size: 18 }) : String(n)),
    h('div', h('strong', title), h('span', text)),
  );
}

function showSuccess(res, name) {
  const ref = res && res.reference;
  // عنوان الصفحة الرئيسي بعد الإرسال (يحل محل عنوان النموذج، فتبقى للصفحة h1 واحدة)
  const heading = h('h1#success-title.success-title', { tabindex: '-1' }, 'تم استلام طلبك بنجاح');
  const portal = res && res.portal_url ? new URL(res.portal_url, window.location.origin).href : null;
  document.title = `تم استلام طلبك — ${orgName()}`;
  mount(
    root,
    h(
      'section.intake-card.success-card',
      { 'aria-labelledby': 'success-title' },
      h('span.success-icon', icon('check', { size: 36 })),
      heading,
      h(
        'p.muted',
        `شكرًا لك${firstName(name) ? ` يا ${firstName(name)}` : ''}. سيراجع فريق ${orgName()} طلبك ويتواصل معك عبر واتساب أو الهاتف بعد المراجعة.`,
      ),
      ref &&
        h(
          'div.ref-box',
          h('span.ref-label', 'رقم طلبك'),
          codeTag(ref, { className: 'code-lg' }),
          copyButton(ref, 'نسخ الرقم', { variant: 'secondary' }),
        ),
      ref && h('p', h('strong', 'احتفظ برقم طلبك؛ '), res && res.whatsapp_url ? 'ستحتاج إليه عند التواصل معنا عبر واتساب أو الهاتف.' : 'ستحتاج إليه عند التواصل معنا عبر الهاتف.'),
      (portal || (res && res.whatsapp_url)) &&
        h(
          'div.success-portal',
          portal && h('strong', 'تابع طلبك وأرسل مستنداتك من رابطك الخاص'),
          portal && h('div.success-portal-link', h('code', { title: portal }, portal), copyButton(portal, 'نسخ الرابط', { variant: 'secondary' })),
          h(
            'div.cta-row',
            portal && button('فتح صفحة المتابعة', { variant: 'primary', size: 'lg', icon: 'upload', href: portal }),
            res && res.whatsapp_url && button('أكمل عبر واتساب', { variant: 'whatsapp', size: 'lg', icon: 'whatsapp', href: res.whatsapp_url, target: '_blank' }),
          ),
          portal &&
            h(
              'p.success-warning',
              icon('lock', { size: 16 }),
              // لا وعد بالمتابعة «برقم الطلب» من /portal: الصفحة لا تقبل رقم الطلب، ولا يصل رمز واتساب لرقم جاء من الموقع فقط
              // قبل أن يتحقق الفريق منه. طريق استعادة الرابط الوحيد هو التواصل مع المؤسسة بذكر رقم الطلب.
              h(
                'span',
                `هذا الرابط خاص بك وحدك؛ احفظه ولا تشاركه مع أحد. إن فقدته فراسلنا أو اتصل بنا واذكر رقم طلبك${ref ? ` ${ltr(ref)}` : ''} لنرسل لك رابطًا جديدًا.`,
              ),
            ),
        ),
      h('h3', 'ماذا يحدث الآن؟'),
      h(
        'ol.success-steps',
        successStep(1, 'استلمنا طلبك', ref ? `سُجّل طلبك برقم ${ref}.` : 'سُجّل طلبك لدينا.', true),
        successStep(2, 'يراجع فريقنا طلبك', 'نحدد نوع المسألة وأولويتها، وقد نطلب منك معلومة أو مستندًا ناقصًا.'),
        successStep(3, 'محامٍ مختص يدرس حالتك', 'يطّلع المحامي على ما يلزم فقط، ولا يرى رقم هاتفك.'),
        successStep(4, 'يصلك الرد من المؤسسة', `يُراجَع الرد ويُعتمد من ${orgName()} قبل إرساله إليك.`),
      ),
      h('div.cta-row', button('العودة إلى الصفحة الرئيسية', { variant: 'ghost', icon: 'home', href: '/' })),
    ),
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
  heading.focus({ preventScroll: true });
}

// ───────────── النموذج المنظم ─────────────

function areaChoices() {
  return [...areaOptions(), { value: UNSURE, label: 'لست متأكدًا' }];
}

function buildForm() {
  const f = form(
    [
      { name: 'name', label: 'الاسم', required: true, autocomplete: 'name', maxLength: 120, placeholder: 'الاسم الذي تحب أن نناديك به' },
      { name: 'phone', label: 'رقم الموبايل', type: 'phone', required: true, hint: 'يُفضَّل أن يكون عليه واتساب لنتواصل معك بسهولة' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email', hint: 'اختياري' },
      { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions(), placeholder: '— اختر المحافظة —' },
      {
        name: 'legal_area',
        label: 'نوع المسألة القانونية',
        type: 'select',
        options: areaChoices(),
        placeholder: '— اختر نوع المسألة —',
        hint: 'إن لم تكن متأكدًا اختر «لست متأكدًا» وسنصنفها نحن',
        full: true,
      },
      {
        name: 'description',
        label: 'اشرح مشكلتك',
        type: 'textarea',
        required: true,
        rows: 7,
        minLength: MIN_DESC,
        maxLength: MAX_DESC,
        placeholder: 'ماذا حدث؟ ومتى؟ ومن الأطراف؟ وما الذي تريد الوصول إليه؟ وهل هناك موعد جلسة أو إنذار قريب؟',
        hint: 'كلما كانت التفاصيل أوضح، كان الرد أدق وأسرع.',
      },
      {
        name: 'documents',
        label: 'المستندات',
        type: 'file',
        multiple: true,
        maxFiles: MAX_FILES,
        maxBytes: MAX_BYTES,
        hint: 'اختياري: صور العقود أو الإيصالات أو الأحكام أو شهادات الوفاة أو أي مستند متعلق بالمسألة.',
      },
      ...beneficiaryFields(),
      {
        name: 'consent',
        type: 'checkbox',
        required: true,
        label: 'أوافق على استخدام بياناتي لتقديم الخدمة القانونية المطلوبة وفق سياسة الخصوصية',
        hint: settings.privacy_notice,
      },
    ],
    {
      values: { ...draft, ...beneficiaryToValues(draft.beneficiary) },
      submitLabel: 'إرسال الطلب',
      submitIcon: 'send',
      onSubmit: async (values) => {
        const fileNo = toLatinDigits(String(values.b_foundation_file_number || '')).trim();
        if (fileNo && !FILE_NO_RE.test(fileNo)) {
          f.el.querySelector('.benef-section')?.setAttribute('open', '');
          const e = new Error(FILE_NO_ERROR);
          e.details = { fields: { b_foundation_file_number: FILE_NO_ERROR } };
          throw e;
        }
        syncFromForm(values);
        await submitIntake(draft, 'form');
      },
    },
  );
  f.el.querySelector('button[type=submit]')?.classList.add('btn-lg');

  // بيانات الأسرة في قسم قابل للطي قبل الموافقة
  const wraps = B_KEYS.map((k) => f.control(`b_${k}`)?.wrap).filter(Boolean);
  const consentWrap = f.control('consent')?.wrap;
  const filled = Boolean(beneficiaryPayload(draft.beneficiary));
  const section = h(
    'details.benef-section',
    { open: filled },
    h(
      'summary',
      h('span.benef-icon', { 'aria-hidden': 'true' }, icon('users', { size: 22 })),
      h('span.benef-summary-text', h('strong', 'بيانات الأسرة (اختيارية)'), h('span', 'للأرامل وأولياء أمور الأيتام ومستفيدي برامج المؤسسة')),
      h('span.benef-chevron', { 'aria-hidden': 'true' }, icon('chevronDown', { size: 20 })),
    ),
    h('div.benef-body', h('p.benef-note', icon('info', { size: 16 }), h('span', BENEF_NOTE)), h('div.form-grid', wraps)),
  );
  if (consentWrap) consentWrap.before(section);
  else f.el.querySelector('.form-grid')?.append(section);

  // رابط سياسة الخصوصية بجوار الموافقة
  consentWrap?.querySelector('.field-hint')?.append(' ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'اقرأ سياسة الخصوصية'));
  return f;
}

function syncFromForm(values) {
  for (const [k, v] of Object.entries(values)) if (!k.startsWith('b_')) draft[k] = v;
  draft.beneficiary = beneficiaryFromValues(values);
}

// ───────────── المحادثة خطوة بخطوة ─────────────

function createWizard() {
  let step = 0;
  const el = h('div.wizard');
  const live = h('p.sr-only', { 'aria-live': 'polite' });

  const navButtons = ({ onNext, nextLabel = 'التالي', skip, nextIcon = 'arrowLeft' } = {}) => {
    const next = onNext ? button(nextLabel, { variant: 'primary', iconEnd: nextIcon, onClick: onNext }) : null;
    return {
      next,
      row: h(
        'div.wizard-actions',
        step > 0 ? button('رجوع', { variant: 'ghost', icon: 'arrowRight', onClick: back }) : h('span'),
        h('div.btn-group', skip && button(skip.label, { variant: 'secondary', onClick: skip.onClick }), next),
      ),
    };
  };

  const errorLine = () => {
    const e = h('p.field-error', { hidden: true, role: 'alert' }, icon('alert', { size: 14 }), h('span'));
    e.show = (msg) => {
      e.lastChild.textContent = msg || '';
      e.hidden = !msg;
    };
    return e;
  };

  function advance() {
    step = Math.min(step + 1, STEPS.length - 1);
    render(true);
  }

  function back() {
    step = Math.max(step - 1, 0);
    render(true);
  }

  // سؤال بإجابة نصية قصيرة
  function textComposer({ key, type = 'text', label, placeholder, autocomplete, validate, normalize }) {
    const input = h('input.input', {
      type,
      id: `wz-${key}`,
      value: draft[key] || '',
      placeholder,
      autocomplete,
      dir: type === 'tel' ? 'ltr' : null,
      inputmode: type === 'tel' ? 'tel' : null,
    });
    const err = errorLine();
    const submit = () => {
      const v = input.value.trim();
      const msg = validate(v);
      if (msg) {
        err.show(msg);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      draft[key] = normalize ? normalize(v) : v;
      advance();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    const { row } = navButtons({ onNext: submit });
    return { node: [h('label.field-label', { htmlFor: input.id }, label), input, err, row], focus: input };
  }

  const STEPS = [
    {
      key: 'name',
      ask: () => `أهلًا بك في ${orgName()}. سنطرح عليك بعض الأسئلة القصيرة لنفهم مشكلتك جيدًا. ما اسمك؟`,
      answer: () => draft.name,
      composer: () =>
        textComposer({
          key: 'name',
          label: 'اسمك',
          placeholder: 'الاسم الذي تحب أن نناديك به',
          autocomplete: 'name',
          validate: (v) => (v.length < 2 ? 'اكتب اسمك من فضلك' : null),
        }),
    },
    {
      key: 'phone',
      ask: () => `تشرّفنا بك${firstName(draft.name) ? ` يا ${firstName(draft.name)}` : ''}. ما رقم موبايلك؟ يُفضَّل أن يكون عليه واتساب لنتواصل معك بسهولة.`,
      answer: () => draft.phone,
      composer: () =>
        textComposer({
          key: 'phone',
          type: 'tel',
          label: 'رقم الموبايل',
          placeholder: '01XXXXXXXXX',
          autocomplete: 'tel',
          validate: (v) => (normalizeEgPhone(v) ? null : PHONE_ERROR),
          normalize: (v) => normalizeEgPhone(v),
        }),
    },
    {
      key: 'governorate',
      ask: () => 'في أي محافظة تقيم؟',
      answer: () => draft.governorate || 'أفضّل عدم التحديد',
      composer: () => {
        const pick = (g) => {
          draft.governorate = g;
          advance();
        };
        const quick = h(
          'div.chip-select',
          { role: 'group', 'aria-label': 'محافظات شائعة' },
          QUICK_GOVS.filter((g) => governorateOptions().some((o) => o.value === g)).map((g) =>
            h('button.chip-toggle', { type: 'button', 'aria-pressed': String(draft.governorate === g), onClick: () => pick(g) }, icon('check', { size: 14 }), h('span', g)),
          ),
        );
        const select = h(
          'select.input',
          { id: 'wz-gov', value: draft.governorate || '' },
          h('option', { value: '' }, '— محافظة أخرى —'),
          governorateOptions().map((o) => h('option', { value: o.value }, o.label)),
        );
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            if (!select.value) {
              err.show('اختر محافظتك من القائمة أو اضغط «تخطَّ»');
              return;
            }
            pick(select.value);
          },
          skip: { label: 'تخطَّ', onClick: () => pick(null) },
        });
        return {
          node: [quick, h('label.field-label', { htmlFor: 'wz-gov' }, 'أو اختر من كل المحافظات'), h('div.select-wrap', select), err, row],
          focus: quick.querySelector('button'),
        };
      },
    },
    {
      key: 'legal_area',
      ask: () => 'ما نوع المسألة القانونية؟ اختر الأقرب لمشكلتك، وإن لم تكن متأكدًا فلا بأس.',
      answer: () => areaText(draft.legal_area),
      composer: () => {
        const group = h(
          'div.chip-select',
          { role: 'group', 'aria-label': 'نوع المسألة القانونية' },
          areaChoices().map((o) =>
            h(
              'button.chip-toggle',
              {
                type: 'button',
                'aria-pressed': String(draft.legal_area === o.value),
                onClick: () => {
                  draft.legal_area = o.value;
                  advance();
                },
              },
              icon('check', { size: 14 }),
              h('span', o.label),
            ),
          ),
        );
        const { row } = navButtons();
        return { node: [group, row], focus: group.querySelector('[aria-pressed="true"]') || group.querySelector('button') };
      },
    },
    {
      key: 'description',
      ask: () => 'احكِ لنا المشكلة بالتفصيل: ماذا حدث؟ ومتى؟ ومن الأطراف؟ وما الذي تريد الوصول إليه؟ وهل هناك موعد جلسة أو إنذار قريب؟',
      answer: () => draft.description,
      composer: () => {
        const ta = h('textarea.input', { id: 'wz-desc', rows: 6, maxlength: MAX_DESC, value: draft.description || '', placeholder: 'اكتب التفاصيل هنا…' });
        const counter = h('span.char-count', { 'aria-live': 'polite' });
        const update = () => {
          const n = ta.value.trim().length;
          counter.textContent = n < MIN_DESC ? `عدد الأحرف: ${n} — الحد الأدنى ${count(MIN_DESC, 'char')}` : `عدد الأحرف: ${n}`;
          counter.classList.toggle('is-ok', n >= MIN_DESC);
        };
        ta.addEventListener('input', update);
        update();
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            const v = ta.value.trim();
            if (v.length < MIN_DESC) {
              err.show(`اكتب ${count(MIN_DESC, 'char')} على الأقل حتى نفهم مشكلتك`);
              ta.focus();
              return;
            }
            draft.description = v;
            advance();
          },
        });
        return { node: [h('label.field-label', { htmlFor: 'wz-desc' }, 'تفاصيل المشكلة'), h('div.textarea-wrap', ta, counter), err, row], focus: ta };
      },
    },
    {
      key: 'documents',
      ask: () => 'هل لديك مستندات تريد إرفاقها؟ مثل عقد أو إيصال أو حكم أو شهادة وفاة. هذه الخطوة اختيارية ويمكنك إرسالها لاحقًا.',
      answer: () => filesText(draft.documents || []),
      composer: () => {
        let nav = null;
        const fi = fileInput({
          maxFiles: MAX_FILES,
          maxBytes: MAX_BYTES,
          onChange: (files) => {
            draft.documents = files;
            mount(nav.next, h('span.btn-label', files.length ? 'التالي' : 'تخطَّ، لا توجد مستندات'), icon('arrowLeft', { size: 18 }));
          },
        });
        fi.setFiles(draft.documents || []);
        nav = navButtons({
          onNext: () => {
            draft.documents = fi.getFiles();
            advance();
          },
          nextLabel: (draft.documents || []).length ? 'التالي' : 'تخطَّ، لا توجد مستندات',
        });
        return { node: [fi.el, nav.row], focus: fi.input };
      },
    },
    {
      key: 'beneficiary',
      ask: () => 'سؤال اختياري: هل تحب أن تخبرنا ببعض البيانات عن أسرتك؟ تساعدنا على ترتيب الأولويات وتحديد الاستحقاق، ويمكنك تخطي هذه الخطوة.',
      answer: () => beneficiaryText(draft.beneficiary) || 'تخطّيت هذه الخطوة',
      composer: () => {
        const mini = form(beneficiaryFields('w_'), { values: beneficiaryToValues(draft.beneficiary, 'w_'), footer: false, className: 'benef-body' });
        const save = () => {
          draft.beneficiary = beneficiaryFromValues(mini.getValues(), 'w_');
        };
        const { row } = navButtons({
          onNext: () => {
            const fileNo = toLatinDigits(String(mini.getValues().w_foundation_file_number || '')).trim();
            if (fileNo && !FILE_NO_RE.test(fileNo)) {
              mini.setErrors({ w_foundation_file_number: FILE_NO_ERROR });
              return;
            }
            save();
            advance();
          },
          skip: {
            label: 'تخطَّ',
            onClick: () => {
              draft.beneficiary = {};
              advance();
            },
          },
        });
        return { node: [h('p.benef-note', icon('info', { size: 16 }), h('span', BENEF_NOTE)), mini.el, row], focus: mini.el.querySelector('select') };
      },
    },
    {
      key: 'consent',
      ask: () => `قبل الإرسال، نطمئنك: ${settings.privacy_notice || 'بياناتك تُستخدم فقط لتقديم الخدمة القانونية المطلوبة.'}`,
      answer: () => 'أوافق على استخدام بياناتي لتقديم الخدمة',
      composer: () => {
        const cb = h('input', { type: 'checkbox', id: 'wz-consent', checked: Boolean(draft.consent) });
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            if (!cb.checked) {
              err.show('يجب الموافقة للمتابعة');
              cb.focus();
              return;
            }
            draft.consent = true;
            advance();
          },
        });
        cb.addEventListener('change', () => (draft.consent = cb.checked));
        return {
          node: [
            h('label.check.check-single', { htmlFor: 'wz-consent' }, cb, h('span', 'أوافق على استخدام بياناتي لتقديم الخدمة القانونية المطلوبة وفق سياسة الخصوصية')),
            h('p.field-hint', h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'اقرأ سياسة الخصوصية')),
            err,
            row,
          ],
          focus: cb,
        };
      },
    },
    {
      key: 'review',
      ask: () => 'راجع بياناتك قبل الإرسال. يمكنك الضغط على «رجوع» لتعديل أي إجابة.',
      answer: () => '',
      composer: () => {
        const alertHost = h('div');
        const docs = draft.documents || [];
        const family = beneficiaryText(draft.beneficiary);
        const summary = kv(
          [
            ['الاسم', draft.name],
            ['رقم الموبايل', h('span.ltr', draft.phone)],
            ['المحافظة', draft.governorate || '—'],
            ['نوع المسألة', areaText(draft.legal_area)],
            ['المستندات', docs.length ? filesText(docs) : 'لا توجد'],
            ['بيانات الأسرة', family || 'لم تُذكر'],
            ['التفاصيل', h('span.pre', draft.description)],
          ],
          { className: 'review-list' },
        );
        const sendBtn = button('إرسال الطلب', { variant: 'primary', icon: 'send', size: 'lg' });
        sendBtn.addEventListener('click', async () => {
          if (sendBtn.classList.contains('is-loading')) return;
          mount(alertHost);
          setBusy(sendBtn, true);
          try {
            await submitIntake(draft, 'guided');
          } catch (err) {
            mount(alertHost, alertBox(errorMessage(err), 'danger'));
          } finally {
            setBusy(sendBtn, false);
          }
        });
        const row = h(
          'div.wizard-actions',
          button('رجوع', { variant: 'ghost', icon: 'arrowRight', onClick: back }),
          h('div.btn-group', sendBtn),
        );
        return { node: [summary, alertHost, row], focus: sendBtn };
      },
    },
  ];

  const bot = (text) =>
    h('div.msg.msg-start', h('div.msg-bubble', h('div.msg-meta', h('span.msg-author', orgName())), h('div.msg-body', text)));
  const mine = (text) => h('div.msg.msg-end', h('div.msg-bubble', h('div.msg-body', { dir: 'auto' }, text)));

  function render(focus = false) {
    const thread = h('div.chat', { role: 'log', 'aria-label': 'المحادثة' });
    for (let i = 0; i < step; i += 1) {
      thread.append(bot(STEPS[i].ask()));
      const a = STEPS[i].answer();
      if (a) thread.append(mine(a));
    }
    const current = STEPS[step];
    thread.append(bot(current.ask()));
    const { node, focus: focusEl } = current.composer();
    mount(
      el,
      h(
        'div.wizard-progress',
        h('span.nowrap', `الخطوة ${step + 1} من ${STEPS.length}`),
        progressBar(step + 1, STEPS.length, 'primary', { label: 'تقدم الإجابة على الأسئلة', visibleLabel: false }),
      ),
      thread,
      h('div.wizard-composer', node),
      live,
    );
    live.textContent = current.ask();
    thread.scrollTop = thread.scrollHeight;
    if (focus && focusEl) focusEl.focus({ preventScroll: true });
    if (focus) el.querySelector('.wizard-composer').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { el, render };
}

// ───────────── التهيئة ─────────────

function renderIntake() {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('mode') === 'guided' ? 'guided' : 'form';
  // ?area=INH من بطاقات المجالات في الصفحة الرئيسية (يُقبل فقط إن كان مجالًا معرّفًا)
  const area = String(params.get('area') || '').toUpperCase();
  if (area && !draft.legal_area && areaOptions().some((o) => o.value === area)) draft.legal_area = area;

  const formApi = buildForm();
  const wizard = createWizard();

  const t = tabs(
    [
      { key: 'form', label: 'نموذج منظم', icon: 'fileText', render: () => formApi.el },
      {
        key: 'guided',
        label: 'احكِ مشكلتك خطوة بخطوة',
        icon: 'message',
        render: () => {
          wizard.render(false);
          return wizard.el;
        },
      },
    ],
    {
      active: initial,
      className: 'tabs-pills',
      onChange: (key, prev) => {
        if (prev === 'form') syncFromForm(formApi.getValues());
        if (key === 'form') {
          formApi.setValues({ ...draft, ...beneficiaryToValues(draft.beneficiary) });
          const sec = formApi.el.querySelector('.benef-section');
          if (sec && beneficiaryPayload(draft.beneficiary)) sec.open = true;
        }
        if (key === 'guided') wizard.render(true);
      },
    },
  );

  const wa = whatsappUrl(settings.whatsapp_number_digits, `مرحبًا ${orgName()}، أود الحصول على استشارة قانونية.`);
  mount(
    root,
    h(
      'div.intake-head',
      h('h1', 'قدّم طلب دعم قانوني'),
      h(
        'p',
        `اكتب لنا مشكلتك بالطريقة التي تناسبك، وسيراجعها فريق ${orgName()} ثم يحيلها إلى محامٍ مختص. ويمكنك المتابعة لاحقًا ${wa ? 'من الموقع أو من واتساب' : 'من الموقع برابط المتابعة الخاص بك'} على نفس الطلب.`,
      ),
      h(
        'ul.intake-trust',
        h('li', icon('checkCircle', { size: 16 }), 'دون مقابل للمستحقين'),
        h('li', icon('lock', { size: 16 }), 'المحامي لا يرى رقم هاتفك'),
        h('li', icon('link', { size: 16 }), 'رقم طلب ورابط متابعة فور الإرسال'),
      ),
      wa &&
        h(
          'p.wa-alt',
          icon('whatsapp', { size: 18 }),
          h('span', 'تفضّل واتساب؟'),
          h('a', { href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'راسلنا مباشرة'),
        ),
      // بلا رقم واتساب مضبوط: الهاتف بديلًا (لا يظهر أي رابط واتساب)
      !wa &&
        site.org_phone &&
        h(
          'p.wa-alt',
          icon('phone', { size: 18 }),
          h('span', 'تفضّل الاتصال الهاتفي؟'),
          h('a', { href: `tel:${site.org_phone_e164 || site.org_phone}`, dir: 'ltr' }, site.org_phone),
        ),
    ),
    h('section.intake-card', { 'aria-label': 'نموذج الطلب' }, t, honeypot),
  );
}

async function init() {
  captureAttribution();
  initSiteChrome();
  mount(root, loading('جارٍ تحميل النموذج…'));
  try {
    const meta = setMeta(await api.get('/meta'));
    settings = meta.settings || {};
    site = meta.site || {};
    if (site.site_name) document.title = `قدّم طلب دعم قانوني — ${site.site_name}`;
  } catch (err) {
    mount(root, errorState(err, init));
    return;
  }
  renderIntake();
}

init();
