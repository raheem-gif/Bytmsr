// بطاقة «الموقع العام وبيانات التواصل» في صفحة الإعدادات (وحدة الموقع): اسم البرنامج والاسم الرسمي والإشهار
// والعنوان والهاتف والبريد وروابط التواصل ومواعيد العمل. تظهر في الموقع العام وسياسة الخصوصية وبيانات SEO.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toLatinDigits } from '../../lib/fmt.js';
import { card, form, toast, button } from '../../lib/ui.js';

export const SITE_SETTING_KEYS = [
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
      values: settings,
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
        const body = {};
        for (const k of SITE_SETTING_KEYS) body[k] = v[k] == null ? '' : String(v[k]).trim();
        body.org_phone = phone;
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
