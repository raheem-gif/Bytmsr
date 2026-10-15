// بطاقة «الموقع العام وبيانات التواصل» في صفحة الإعدادات (وحدة الموقع): اسم المكتب (v10)، اسم البرنامج والاسم الرسمي والإشهار
// والعنوان والهاتف والبريد وروابط التواصل ومواعيد العمل. تظهر في الموقع العام وسياسة الخصوصية وبيانات SEO.

import { h, tagged, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toLatinDigits } from '../../lib/fmt.js';
import { card, form, toast, button, field, confirmDialog, errorMessage } from '../../lib/ui.js';

export const SITE_SETTING_KEYS = [
  'brand_name',
  'brand_short_name',
  'site_program_name',
  'org_legal_name',
  'org_registration',
  'org_address',
  'org_phone',
  'org_email',
  'org_facebook_url',
  'org_instagram_url',
  'office_hours',
];

// v10 experience (§4.1): نفس فحص الخادم (isPlainName في src/brand.js): لا رموز تحكم ولا محارف تنسيق غير مرئية ولا أقواس
const NOT_PLAIN_RE = /[\p{Cc}\p{Cf}<>]/u;
const PLAIN_NAME_ERROR = 'اكتب الاسم بحروف عادية بلا رموز تحكم أو أقواس';

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

// نفس قواعد الخادم (validateSiteSettings في src/site.js): النطاق نفسه أو نطاق فرعي منه فقط،
// فلا يُقبل مثلًا evilfacebook.com على أنه فيسبوك
function checkUrl(name, value, domains) {
  if (!value) return;
  let u;
  try {
    u = new URL(String(value).trim());
  } catch {
    throw fieldError(name, 'أدخل رابطًا كاملًا يبدأ بـ https://');
  }
  if (u.protocol !== 'https:') throw fieldError(name, 'يجب أن يبدأ الرابط بـ https://');
  const host = u.hostname.toLowerCase();
  if (!domains.some((d) => host === d || host.endsWith(`.${d}`))) throw fieldError(name, `يجب أن يكون الرابط من ${domains[0]}`);
}

/** @param {object} settings قيم الإعدادات الحالية من GET /api/admin/settings */
export function siteSettingsCard(settings = {}) {
  const f = form(
    [
      // v10 experience (EXP-1, L-02/L-03): اسم المكتب في واجهات العملاء فقط؛ الاسم القانوني يبقى في «ملف المؤسسة»
      {
        name: 'brand_name',
        label: 'اسم المكتب كما يراه العملاء',
        required: true,
        maxLength: 60,
        ltr: true,
        placeholder: 'Emam Legal and Consultancy',
        hint: 'يظهر في رأس الموقع وعناوين الصفحات وتوقيع الرسائل وبوابة الشركات. الاسم القانوني للجهة في «ملف المؤسسة».',
        tag: 'SET-230',
      },
      { name: 'brand_short_name', label: 'الاسم المختصر', required: true, maxLength: 24, ltr: true, placeholder: 'Emam Legal', hint: 'للمساحات الضيقة: أيقونة الهاتف وعنوان التبويب.', tag: 'SET-231' },
      {
        name: 'brand_in_staff_app',
        type: 'checkbox',
        label: 'إظهار اسم المكتب في منصة فريق العمل والمحامين',
        full: true,
        hint: 'عند إيقافه تبقى صفحة الدخول والقائمة الجانبية باسم المؤسسة كما كانت.',
        tag: 'SET-232',
      },
      { name: 'site_program_name', label: 'اسم البرنامج على الموقع', required: true, maxLength: 60, hint: 'يظهر في رأس الموقع وعناوين الصفحات، مثل «الدعم القانوني»', tag: 'SET-233' },
      { name: 'org_legal_name', label: 'الاسم الرسمي الكامل للمؤسسة', required: true, maxLength: 200, tag: 'SET-234' },
      { name: 'org_registration', label: 'بيانات الإشهار', maxLength: 200, full: true, hint: 'مثل: مشهرة برقم 11108 لسنة 2020 — وزارة التضامن الاجتماعي', tag: 'SET-235' },
      { name: 'org_address', label: 'عنوان المقر', type: 'textarea', rows: 2, maxLength: 300, hint: 'يُستخدم أيضًا لرابط الخريطة في الموقع', tag: 'SET-236' },
      { name: 'office_hours', label: 'مواعيد العمل', maxLength: 200, hint: 'مثل: من السبت إلى الخميس، من العاشرة صباحًا حتى الرابعة عصرًا', tag: 'SET-237' },
      { name: 'org_phone', label: 'هاتف المؤسسة', ltr: true, maxLength: 30, placeholder: '01211114662', hint: 'الحقول الاختيارية التي تُترك فارغة لا تظهر في الموقع', tag: 'SET-238' },
      { name: 'org_email', label: 'البريد الإلكتروني', type: 'email', maxLength: 120, hint: 'اختياري — يظهر في صفحات التواصل والخصوصية وحذف البيانات', tag: 'SET-239' },
      { name: 'org_facebook_url', label: 'صفحة فيسبوك', ltr: true, maxLength: 300, placeholder: 'https://www.facebook.com/…', hint: 'اختياري', tag: 'SET-240' },
      { name: 'org_instagram_url', label: 'حساب إنستجرام', ltr: true, maxLength: 300, placeholder: 'https://www.instagram.com/…', hint: 'اختياري', tag: 'SET-241' },
    ],
    {
      values: { ...settings, brand_in_staff_app: settings.brand_in_staff_app !== false },
      submitLabel: 'حفظ بيانات الموقع',
      submitIcon: 'check',
      onSubmit: async (v, api2) => {
        // يُفحص النص المدخل نفسه: إدخال بلا أرقام (مثل «اتصل بنا») خطأ، ولا يُحفظ فارغًا بصمت
        const rawPhone = toLatinDigits(v.org_phone || '').trim();
        const phone = rawPhone.replace(/[^\d+]/g, '');
        const digits = phone.replace(/\D/g, '');
        if (rawPhone && (digits.length < 8 || digits.length > 15)) throw fieldError('org_phone', 'أدخل رقم هاتف صحيحًا مثل 01211114662');
        checkUrl('org_facebook_url', v.org_facebook_url, ['facebook.com', 'fb.com']);
        checkUrl('org_instagram_url', v.org_instagram_url, ['instagram.com']);
        for (const k of ['brand_name', 'brand_short_name']) if (NOT_PLAIN_RE.test(String(v[k] ?? ''))) throw fieldError(k, PLAIN_NAME_ERROR);
        const body = {};
        for (const k of SITE_SETTING_KEYS) body[k] = v[k] == null ? '' : String(v[k]).trim();
        body.org_phone = phone;
        body.brand_in_staff_app = v.brand_in_staff_app !== false;
        const saved = await api.patch('/admin/settings', body);
        if (saved) api2.setValues(saved);
        toast('تم حفظ بيانات الموقع العام — تظهر للزوار فورًا', 'success', 4000);
      },
      submitTag: 'SET-242',
      tag: 'SET-243',
    },
  );
  return card({
    title: 'الموقع العام وبيانات التواصل',
    subtitle: 'تظهر في صفحات الموقع وسياسة الخصوصية وحذف البيانات وبيانات محركات البحث والمشاركة',
    icon: 'globe',
    actions: button('عرض الموقع', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: '/', target: '_blank', tag: 'SET-49' }),
    body: h('div', f.el),
    titleTag: 'SET-50',
    tag: 'SET-51',
  });
}

// ───────────── v12 staff-lines (SL-7، E12-70، L12-49، L12-56): بطاقة «الصفحة الأولى» (تحل محل «شاشة الاختيار») ─────────────
// site_gate_enabled متقاعد ومخفي من كل واجهة (L12-09). مفتاح «خيري» يُحفظ فور التأكيد، وكذلك ما تفتحه روابطه القديمة؛
// الاسم القانوني وهاتف الأفراد والشركات و«عن المكتب» تُحفظ بزر «حفظ». الخادم يتحقق من كل قيمة (site.validateSettings)
// ويسجّل تغيّر charity_public وcharity_archived_landing وfirm_partners في سجل الأمان (SETTINGS_AUDIT في admin.js).

export const FIRST_PAGE_KEYS = ['charity_public', 'charity_archived_landing', 'firm_legal_name', 'org_phone_paid', 'firm_city', 'firm_founded', 'firm_partners'];
export const FIRST_PAGE_TITLE = 'الصفحة الأولى';
export const CHARITY_TOGGLE_TEXT = 'إظهار الخدمة الخيرية («خيري») على الموقع';
export const CHARITY_CONFIRM = Object.freeze({ title: 'تغيير ظهور «خيري» على الموقع؟', confirm: 'تغيير', cancel: 'إلغاء' });
export const LANDING_LEGEND = 'عند فتح روابط «خيري» القديمة';
export const LANDING_OPTIONS = Object.freeze([
  Object.freeze({ value: 'notice', label: 'صفحة تقول إن الخدمة متوقفة', tag: 'SET-05' }),
  Object.freeze({ value: 'redirect', label: 'تحويل إلى الصفحة الأولى', tag: 'SET-06' }),
]);
export const ABOUT_TITLE = 'عن المكتب';
export const PARTNERS_HINT = 'يظهر قسم «الشركاء» في صفحة «عن المكتب» فقط عند إضافة شريك أو سنة التأسيس.';
export const PARTNERS_MAX = 8;
export const PARTNER_TITLE_EXAMPLE = 'محامٍ بالنقض';

/**
 * شرح المفتاح (E12-70). r2 (L12-49): روابط «خيري» القديمة تفتح صفحة التوقف افتراضيًا، فجملة الروابط تتبع الاختيار.
 * @param {boolean} on charity_public
 * @param {'notice'|'redirect'} landing charity_archived_landing
 */
export function charityHelp(on, landing = 'notice') {
  if (on) return 'يظهر سطر «تبحثون عن مساعدة قانونية مجانية؟ خيري» تحت الاختيارات الثلاثة، وتعمل صفحة /khayri ونموذجها.';
  const links = landing === 'redirect' ? 'وروابطه القديمة تفتح الصفحة الأولى' : 'وروابطه القديمة تفتح صفحة تقول إن الخدمة متوقفة';
  return `متوقفة: الصفحة الأولى تعرض ثلاثة اختيارات فقط، ولا يظهر «خيري» في أي صفحة عامة، ${links}. الطلبات والملفات الخيرية ورقم واتساب الخيري تعمل كما هي.`;
}

// المسار اللاتيني داخل الجملة العربية في <bdi> حتى لا تنقلب الشرطة المائلة
const withBdi = (text) => String(text).split(/(\/khayri)/).map((part) => (part === '/khayri' ? h('bdi', { dir: 'ltr' }, part) : part));

/** صفوف الشركاء كما تُرسل للخادم: الفارغة تمامًا تُسقط، والمسافات تُقص */
export function cleanPartners(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((p) => ({ name: String(p?.name ?? '').trim(), title: String(p?.title ?? '').trim() }))
    .filter((p) => p.name || p.title);
}

/**
 * محرر «الشركاء»: صف لكل شريك («الاسم» + «الصفة»)، «أعلى» / «أسفل» / «حذف»، و«إضافة شريك» حتى 8.
 * @returns {{ el: HTMLElement, get: () => Array<{name:string,title:string}>, set: (rows) => void }}
 */
export function partnersEditor(initial = []) {
  let rows = cleanPartners(initial).slice(0, PARTNERS_MAX);
  const list = h('div.stack.pa-partners', { role: 'list', 'aria-label': 'الشركاء' });
  // review-2 (T12-78): الرموز ملفوفة في موضع إنشاء الزر نفسه (tagged('SET-NN', button(…)))، فيراها فحص التغطية
  const addBtn = tagged('SET-14', button('إضافة شريك', { variant: 'ghost', size: 'sm', icon: 'plus' }));
  const count = h('p.field-hint', { 'aria-live': 'polite' });
  const focusRow = (i, sel = 'input') => list.children[i]?.querySelector(sel)?.focus();
  const render = () => {
    mount(
      list,
      ...rows.map((p, i) => {
        const n = i + 1;
        const name = h('input.input', { type: 'text', value: p.name, maxlength: 60, 'aria-label': `اسم الشريك ${n}`, autocomplete: 'off', tag: 'SET-52' });
        const title = h('input.input', { type: 'text', value: p.title, maxlength: 60, placeholder: `مثال: ${PARTNER_TITLE_EXAMPLE}`, 'aria-label': `صفة الشريك ${n}`, autocomplete: 'off', tag: 'SET-53' });
        name.addEventListener('input', () => (rows[i].name = name.value));
        title.addEventListener('input', () => (rows[i].title = title.value));
        const move = (d) => {
          const j = i + d;
          if (j < 0 || j >= rows.length) return;
          [rows[i], rows[j]] = [rows[j], rows[i]];
          render();
          focusRow(j, d < 0 ? '.pa-partner-up' : '.pa-partner-down');
        };
        const up = tagged('SET-17', button('أعلى', { variant: 'ghost', size: 'sm', icon: 'chevronUp', disabled: i === 0, className: 'pa-partner-up', ariaLabel: `نقل الشريك ${n} لأعلى` }));
        const down = tagged('SET-18', button('أسفل', { variant: 'ghost', size: 'sm', icon: 'chevronDown', disabled: i === rows.length - 1, className: 'pa-partner-down', ariaLabel: `نقل الشريك ${n} لأسفل` }));
        const del = tagged('SET-19', button('حذف', { variant: 'ghost', size: 'sm', icon: 'trash', ariaLabel: `حذف الشريك ${n}` }));
        up.addEventListener('click', () => move(-1));
        down.addEventListener('click', () => move(1));
        del.addEventListener('click', () => {
          rows.splice(i, 1);
          render();
          if (rows.length) focusRow(Math.min(i, rows.length - 1));
          else addBtn.focus();
        });
        return h(
          'div.stack-sm.pa-partner',
          { role: 'listitem' },
          h('p.small.muted', `الشريك ${n}`),
          h('div.form-grid', field('الاسم', name, { tag: 'SET-54' }), field('الصفة', title, { tag: 'SET-55' })),
          h('div.row', up, down, del),
        );
      }),
    );
    addBtn.disabled = rows.length >= PARTNERS_MAX;
    count.textContent = rows.length >= PARTNERS_MAX ? `وصلتم إلى الحد الأقصى: ${PARTNERS_MAX} شركاء.` : '';
    list.hidden = !rows.length;
  };
  addBtn.addEventListener('click', () => {
    if (rows.length >= PARTNERS_MAX) return;
    rows.push({ name: '', title: '' });
    render();
    focusRow(rows.length - 1);
  });
  render();
  const el = h('div.stack-sm', { tag: 'SET-13' }, list, h('div.row', addBtn), count);
  return {
    el,
    get: () => cleanPartners(rows),
    set: (next) => {
      rows = cleanPartners(next).slice(0, PARTNERS_MAX);
      render();
    },
  };
}

/**
 * بطاقة «الصفحة الأولى» (‎#/settings?section=first-page‎؛ لمدير النظام، PATCH /api/admin/settings).
 * @param {object} settings قيم GET /api/admin/settings
 */
export function firstPageSettingsCard(settings = {}) {
  const state = { on: settings.charity_public === true, landing: settings.charity_archived_landing === 'redirect' ? 'redirect' : 'notice' };

  // ── «خيري» على الموقع: مفتاح يُحفظ فور التأكيد ──
  // tags:skip المربع داخل سطره المرمَّز SET-02 (العنصر نفسه، لا رمز ثانٍ)
  const toggle = h('input', { type: 'checkbox', checked: state.on });
  const toggleLabel = h('label.check.check-single', { tag: 'SET-02' }, toggle, h('span', CHARITY_TOGGLE_TEXT));
  const help = h('p.field-hint', { tag: 'SET-03', 'aria-live': 'polite' });
  const legendId = `fp-landing-${Math.random().toString(36).slice(2, 8)}`;
  const radios = LANDING_OPTIONS.map((o) => {
    // tags:skip الزر داخل سطره المرمَّز SET-05 / SET-06 (من LANDING_OPTIONS)
    const input = h('input', { type: 'radio', name: legendId, value: o.value, checked: state.landing === o.value });
    return { o, input, el: h('label.check.check-single', { tag: o.tag }, input, h('span', o.label)) }; // صف كامل ≥ 44 px على الهاتف
  });
  const landingBox = h(
    'div.field',
    { tag: 'SET-04' },
    h('span.field-label', { id: legendId }, LANDING_LEGEND),
    h('div.check-list', { role: 'radiogroup', 'aria-labelledby': legendId }, radios.map((r) => r.el)),
  );
  const sync = () => {
    toggle.checked = state.on;
    mount(help, ...withBdi(charityHelp(state.on, state.landing)));
    landingBox.hidden = state.on; // r2 (L12-49): يظهر الاختيار ما دام «خيري» متوقفًا
    for (const r of radios) r.input.checked = r.o.value === state.landing;
  };
  toggle.addEventListener('change', async () => {
    const next = toggle.checked;
    toggle.checked = state.on; // لا يتغير شيء قبل التأكيد
    // review (F5): «/khayri» داخل <bdi> في نافذة التأكيد أيضًا (كان يظهر «khayri/»)
    const ok = await confirmDialog({ title: CHARITY_CONFIRM.title, message: withBdi(charityHelp(next, state.landing)), confirmLabel: CHARITY_CONFIRM.confirm, cancelLabel: CHARITY_CONFIRM.cancel, tag: 'SET-56' });
    if (!ok) return;
    toggle.disabled = true;
    try {
      const saved = await api.patch('/admin/settings', { charity_public: next });
      state.on = saved && typeof saved === 'object' && 'charity_public' in saved ? saved.charity_public === true : next;
      sync();
      toast(state.on ? 'يظهر «خيري» على الموقع الآن.' : 'توقف ظهور «خيري» على الموقع.', 'success', 5000);
    } catch (e) {
      toast(errorMessage(e), 'danger', 6000);
    } finally {
      toggle.disabled = false;
    }
  });
  for (const r of radios) {
    r.input.addEventListener('change', async () => {
      if (!r.input.checked || r.o.value === state.landing) return;
      const prev = state.landing;
      for (const x of radios) x.input.disabled = true;
      try {
        const saved = await api.patch('/admin/settings', { charity_archived_landing: r.o.value });
        state.landing = saved && saved.charity_archived_landing === 'redirect' ? 'redirect' : saved && saved.charity_archived_landing === 'notice' ? 'notice' : r.o.value;
        toast('تم الحفظ', 'success');
      } catch (e) {
        state.landing = prev;
        toast(errorMessage(e), 'danger', 6000);
      } finally {
        for (const x of radios) x.input.disabled = false;
        sync();
      }
    });
  }
  sync();

  // ── الاسم القانوني وهاتف الأفراد والشركات و«عن المكتب»: تُحفظ بزر «حفظ» ──
  const partners = partnersEditor(settings.firm_partners);
  const f = form(
    [
      {
        name: 'firm_legal_name',
        label: 'اسم المكتب القانوني',
        maxLength: 80,
        placeholder: 'مثال: إمام وشركاه',
        hint: 'يظهر في سطر الحقوق أسفل صفحات الموقع وفي أول رسالة على واتساب. فارغ = اسم المكتب كما يراه العملاء.',
      },
      { name: 'org_phone_paid', label: 'هاتف خدمات الأفراد والشركات (اختياري)', ltr: true, maxLength: 30, placeholder: '01211114662', hint: 'فارغ = نفس هاتف المؤسسة' },
      // tags:skip العنوان داخل غلافه المرمَّز SET-10 (العنوان وتلميحه معًا)
      { name: 'about_heading', type: 'static', full: true, render: () => h('div', h('h3.pa-mini-h', ABOUT_TITLE), h('p.field-hint', PARTNERS_HINT)) },
      { name: 'firm_city', label: 'المدينة', maxLength: 40, placeholder: 'مثال: القاهرة', hint: 'اختياري. تظهر أسفل صفحات الموقع وفي سطر سنة التأسيس.' },
      { name: 'firm_founded', label: 'سنة التأسيس', ltr: true, maxLength: 4, hint: 'اختياري. أربعة أرقام، مثل 2008.' },
      { name: 'partners_box', type: 'static', full: true, render: () => h('div.stack-sm', h('span.field-label', 'الشركاء'), partners.el), tag: 'SET-249' },
    ],
    {
      values: { firm_legal_name: settings.firm_legal_name || '', org_phone_paid: settings.org_phone_paid || '', firm_city: settings.firm_city || '', firm_founded: settings.firm_founded || '' },
      submitLabel: 'حفظ',
      submitIcon: 'check',
      onSubmit: async (v, fapi) => {
        const raw = toLatinDigits(v.org_phone_paid || '').trim();
        const phone = raw.replace(/[^\d+]/g, '');
        const digits = phone.replace(/\D/g, '');
        if (raw && (digits.length < 8 || digits.length > 15)) throw fieldError('org_phone_paid', 'أدخل رقم هاتف صحيحًا مثل 01211114662');
        const year = toLatinDigits(v.firm_founded || '').trim();
        if (year && !/^\d{4}$/.test(year)) throw fieldError('firm_founded', 'اكتب سنة التأسيس بأربعة أرقام، أو اتركها فارغة.');
        for (const k of ['firm_legal_name', 'firm_city']) if (NOT_PLAIN_RE.test(String(v[k] ?? ''))) throw fieldError(k, PLAIN_NAME_ERROR);
        const list = partners.get();
        if (list.some((p) => [...p.name].length < 2)) throw new Error('اكتبوا اسم كل شريك (حرفان على الأقل) أو احذفوا صفه.');
        // review (F4): رسالة محددة قبل الإرسال بدل رسالة الخادم العامة («8 على الأكثر…») حين يحوي اسم أو صفة رموزًا مثل < >
        const badAt = list.findIndex((p) => NOT_PLAIN_RE.test(p.name) || NOT_PLAIN_RE.test(p.title));
        if (badAt >= 0) throw new Error(`الشريك ${badAt + 1}: ${PLAIN_NAME_ERROR}.`);
        const saved = await api.patch('/admin/settings', {
          firm_legal_name: String(v.firm_legal_name || '').trim(),
          org_phone_paid: phone,
          firm_city: String(v.firm_city || '').trim(),
          firm_founded: year,
          firm_partners: list,
        });
        if (saved && typeof saved === 'object') {
          fapi.setValues({ firm_legal_name: saved.firm_legal_name ?? '', org_phone_paid: saved.org_phone_paid ?? '', firm_city: saved.firm_city ?? '', firm_founded: saved.firm_founded ?? '' });
          if (Array.isArray(saved.firm_partners)) partners.set(saved.firm_partners);
        }
        toast('تم حفظ بيانات الصفحة الأولى و«عن المكتب». تظهر للزوار فورًا.', 'success', 5000);
      },
      tag: 'SET-251',
    },
  );
  tagged('SET-07', f.control('firm_legal_name').wrap);
  tagged('SET-08', f.control('org_phone_paid').wrap);
  tagged('SET-10', f.control('about_heading').wrap);
  tagged('SET-11', f.control('firm_city').wrap);
  tagged('SET-12', f.control('firm_founded').wrap);
  tagged('SET-15', f.el.querySelector('button[type="submit"]'));

  const preview = tagged('SET-09', button('معاينة', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: '/', target: '_blank' }));
  const el = card({
    title: FIRST_PAGE_TITLE,
    subtitle: 'أول ما يراه الزائر: ثلاثة اختيارات (استشارة، رفع دعوى قضائية، تأسيس شركات). وهنا يظهر «خيري» أو يتوقف.',
    icon: 'globe',
    className: 'pa-firstpage',
    actions: preview,
    body: h('div.stack', h('div.stack-sm', toggleLabel, help, landingBox), f.el),
    titleTag: 'SET-57',
    tag: 'SET-58',
  });
  el.id = 'first-page';
  tagged('SET-01', el);
  return el;
}
