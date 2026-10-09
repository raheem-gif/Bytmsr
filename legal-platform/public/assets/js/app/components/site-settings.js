// بطاقة «الموقع العام وبيانات التواصل» في صفحة الإعدادات (وحدة الموقع): اسم المكتب (v10)، اسم البرنامج والاسم الرسمي والإشهار
// والعنوان والهاتف والبريد وروابط التواصل ومواعيد العمل. تظهر في الموقع العام وسياسة الخصوصية وبيانات SEO.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toLatinDigits } from '../../lib/fmt.js';
import { card, form, toast, button } from '../../lib/ui.js';

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
      },
      { name: 'brand_short_name', label: 'الاسم المختصر', required: true, maxLength: 24, ltr: true, placeholder: 'Emam Legal', hint: 'للمساحات الضيقة: أيقونة الهاتف وعنوان التبويب.' },
      {
        name: 'brand_in_staff_app',
        type: 'checkbox',
        label: 'إظهار اسم المكتب في منصة فريق العمل والمحامين',
        full: true,
        hint: 'عند إيقافه تبقى صفحة الدخول والقائمة الجانبية باسم المؤسسة كما كانت.',
      },
      { name: 'site_program_name', label: 'اسم البرنامج على الموقع', required: true, maxLength: 60, hint: 'يظهر في رأس الموقع وعناوين الصفحات، مثل «الدعم القانوني»' },
      { name: 'org_legal_name', label: 'الاسم الرسمي الكامل للمؤسسة', required: true, maxLength: 200 },
      { name: 'org_registration', label: 'بيانات الإشهار', maxLength: 200, full: true, hint: 'مثل: مشهرة برقم 11108 لسنة 2020 — وزارة التضامن الاجتماعي' },
      { name: 'org_address', label: 'عنوان المقر', type: 'textarea', rows: 2, maxLength: 300, hint: 'يُستخدم أيضًا لرابط الخريطة في الموقع' },
      { name: 'office_hours', label: 'مواعيد العمل', maxLength: 200, hint: 'مثل: من السبت إلى الخميس، من العاشرة صباحًا حتى الرابعة عصرًا' },
      { name: 'org_phone', label: 'هاتف المؤسسة', ltr: true, maxLength: 30, placeholder: '01211114662', hint: 'الحقول الاختيارية التي تُترك فارغة لا تظهر في الموقع' },
      { name: 'org_email', label: 'البريد الإلكتروني', type: 'email', maxLength: 120, hint: 'اختياري — يظهر في صفحات التواصل والخصوصية وحذف البيانات' },
      { name: 'org_facebook_url', label: 'صفحة فيسبوك', ltr: true, maxLength: 300, placeholder: 'https://www.facebook.com/…', hint: 'اختياري' },
      { name: 'org_instagram_url', label: 'حساب إنستجرام', ltr: true, maxLength: 300, placeholder: 'https://www.instagram.com/…', hint: 'اختياري' },
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
    },
  );
  return card({
    title: 'الموقع العام وبيانات التواصل',
    subtitle: 'تظهر في صفحات الموقع وسياسة الخصوصية وحذف البيانات وبيانات محركات البحث والمشاركة',
    icon: 'globe',
    actions: button('عرض الموقع', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: '/', target: '_blank' }),
    body: h('div', f.el),
  });
}

// ───────────── v11 segment-staff (ST-6، L11-27): شاشة الاختيار «خيري / خدمات الأفراد والشركات» ─────────────

export const GATE_SETTING_KEYS = ['site_gate_enabled', 'org_phone_paid'];
export const GATE_TOGGLE_TEXT = 'إظهار شاشة الاختيار (خيري / خدمات الأفراد والشركات) لأول زيارة';

/**
 * بطاقة «شاشة الاختيار» (‎#/settings?section=gate‎): مفتاح الإيقاف site_gate_enabled (P0) وهاتف الأفراد والشركات
 * org_phone_paid (P1). الإيقاف = الصفحة الرئيسية تفتح على «خيري» دائمًا ولا تُجدَّد كعكة الزائر (r2 S20)؛ /services و/khayri تعملان.
 * @param {object} settings قيم GET /api/admin/settings
 */
export function gateSettingsCard(settings = {}) {
  const f = form(
    [
      {
        name: 'site_gate_enabled',
        type: 'checkbox',
        full: true,
        text: GATE_TOGGLE_TEXT,
        hint: 'عند الإيقاف تفتح الصفحة الرئيسية على «خيري» مباشرة لكل الزوار، وتبقى صفحة الأفراد والشركات على ‎/services‎.',
      },
      { name: 'org_phone_paid', label: 'هاتف خدمات الأفراد والشركات (اختياري)', ltr: true, maxLength: 30, placeholder: '01211114662', hint: 'فارغ = نفس هاتف المؤسسة' },
    ],
    {
      values: { site_gate_enabled: settings.site_gate_enabled !== false, org_phone_paid: settings.org_phone_paid || '' },
      submitLabel: 'حفظ',
      submitIcon: 'check',
      onSubmit: async (v, fapi) => {
        const raw = toLatinDigits(v.org_phone_paid || '').trim();
        const phone = raw.replace(/[^\d+]/g, '');
        const digits = phone.replace(/\D/g, '');
        if (raw && (digits.length < 8 || digits.length > 15)) throw fieldError('org_phone_paid', 'أدخل رقم هاتف صحيحًا مثل 01211114662');
        const saved = await api.patch('/admin/settings', { site_gate_enabled: v.site_gate_enabled !== false, org_phone_paid: phone });
        if (saved && typeof saved === 'object') {
          const next = {};
          for (const k of GATE_SETTING_KEYS) if (k in saved) next[k] = k === 'site_gate_enabled' ? saved[k] !== false : saved[k] || '';
          fapi.setValues(next);
        }
        toast(v.site_gate_enabled !== false ? 'شاشة الاختيار تظهر لأول زيارة' : 'أُوقفت شاشة الاختيار — الصفحة الرئيسية تفتح على «خيري»', 'success', 5000);
      },
    },
  );
  const el = card({
    title: 'شاشة الاختيار',
    subtitle: 'أول ما يراه الزائر على الصفحة الرئيسية: «خدمات الأفراد والشركات» أو «خيري».',
    icon: 'swap',
    className: 'pa-gateset',
    actions: button('معاينة', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: '/?gate=1', target: '_blank' }),
    body: h('div', f.el),
  });
  el.id = 'gate';
  return el;
}

