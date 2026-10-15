// v12 tags-core (TG-0، T12-01…T12-04، T12-13، L12-43): جدول بادئات رموز العناصر للصفحات العامة.
// يقرؤه المتصفح (لوحة «رموز العناصر» على الموقع وصفحة المتابعة) والخادم وأداة الرموز والاختبارات.
// عمدًا: لا مسارات ملفات هنا (تبقى في سجل الخادم وحده)، ولا بادئات المنصة وبوابة الشركات والرسائل
// (جدولها الآخر لا يُحمَّل إلا في /app و/company). وحدة نقية بلا استيراد ولا أثر عند التحميل.

/** أسطح المنتج بالترتيب الذي تُعرض به في السجل وفي اللوحة */
export const SURFACES = Object.freeze({
  site: 'الموقع',
  request: 'الطلب والمتابعة',
  company: 'بوابة الشركات',
  app: 'المنصة',
  msg: 'الرسائل والمطبوعات',
});

/**
 * البادئات العامة: البادئة ← { surface، name (الاسم العربي في اللوحة)، url }.
 * بادئة واحدة لكل شاشة أو مكوّن مشترك (T12-03). الترتيب هنا هو ترتيب السجل داخل كل سطح.
 */
export const PAGES = Object.freeze({
  L: { surface: 'site', name: 'الصفحة الأولى وقالب صفحات الأسئلة', url: '/' },
  T: { surface: 'site', name: 'مسار الاختيار: الأسئلة والخيارات', url: '/start' },
  S: { surface: 'site', name: 'صفحة المكتب «الخدمات»', url: '/services' },
  H: { surface: 'site', name: 'رأس الموقع', url: '' },
  F: { surface: 'site', name: 'تذييل الموقع', url: '' },
  KH: { surface: 'site', name: 'إشعار «خيري» (مؤرشف)', url: '/khayri' },
  AB: { surface: 'site', name: 'عن المكتب', url: '/about' },
  PV: { surface: 'site', name: 'سياسة الخصوصية', url: '/privacy' },
  TM: { surface: 'site', name: 'شروط الاستخدام', url: '/terms' },
  DD: { surface: 'site', name: 'حذف البيانات', url: '/data-deletion' },
  NF: { surface: 'site', name: 'صفحة غير موجودة أو بلا اتصال', url: '' },
  SU: { surface: 'site', name: 'معالج الإعداد الأول', url: '/setup' },
  I: { surface: 'request', name: 'نموذج الطلب', url: '/intake' },
  IC: { surface: 'request', name: 'طلب عرض لشركة', url: '/intake?mode=company' },
  UP: { surface: 'request', name: 'إرفاق المستندات', url: '' },
  SC: { surface: 'request', name: 'تصوير المستندات وتحسينها', url: '' },
  RV: { surface: 'request', name: 'التسجيل الصوتي (مؤرشف)', url: '' },
  P: { surface: 'request', name: 'صفحة متابعة الطلب', url: '/p/' },
  PL: { surface: 'request', name: 'دخول صفحة المتابعة', url: '/portal' },
});

/** بادئات السجلات ومجالات العمل: لا تصلح بادئة رمز أبدًا (T12-04) */
export const FORBIDDEN_PREFIXES = Object.freeze(['CL', 'REQ', 'MTR', 'INV', 'CO', 'Q', 'RCPT', 'KR', 'INH', 'FAM', 'GRD', 'PEN', 'PRP', 'CIV', 'LAB', 'CRM', 'COM', 'TAX', 'ADM', 'GEN']);

/** الرمز: 1–3 حروف لاتينية كبيرة، شرطة، رقمان (01–99) أو ثلاثة (100–999). لا أربعة أبدًا (T12-01). */
export const CODE_RE = /^[A-Z]{1,3}-(0[1-9]|[1-9]\d|[1-9]\d\d)$/;
/** «يحتاج رقمًا»: يرقّمه npm run tags (T12-10) */
export const PLACEHOLDER_RE = /^[A-Z]{1,3}-00$/;

const toLatin = (s) => String(s).replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));
const clean = (input) =>
  toLatin(String(input == null ? '' : input))
    .replace(/[‎‏؜‪-‮⁦-⁩﻿]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s_.\-‐-―−]+/g, '-');

/**
 * T12-02: 's14' · 'S 14' · 'S-١٤' · 'S 014' · 'inb-٠٤' · 's4' ← 'S-14' · 'S-14' · 'S-14' · 'S-14' · 'INB-04' · 'S-04'.
 * يعيد null لما ليس رمزًا كاملًا ('xx' · 'S-0' · 'S-1000' · 'س١٤').
 */
export function normalizeCode(input) {
  const m = /^([A-Z]{1,3})-?(\d{1,3})$/.exec(clean(input));
  if (!m) return null;
  const n = Number(m[2]);
  return n ? `${m[1]}-${String(n).padStart(2, '0')}` : null;
}

/** جزء رمز أثناء الكتابة: 'inb0' ← { prefix: 'INB', digits: '0' } · 's' ← { prefix: 'S', digits: '' } · غير ذلك null */
export function partialCode(input) {
  const m = /^([A-Z]{1,3})(?:-?(\d{0,3}))?$/.exec(clean(input));
  return m ? { prefix: m[1], digits: m[2] || '' } : null;
}

/** ترتيب طبيعي: البادئة ثم الرقم (S-9 قبل S-10) */
export function compareCodes(a, b) {
  const [pa, na] = String(a).split('-');
  const [pb, nb] = String(b).split('-');
  return pa === pb ? Number(na) - Number(nb) : pa < pb ? -1 : 1;
}

/** 'INB-04' ← 'INB' (أو null) */
export function prefixOf(code) {
  const m = /^([A-Z]{1,3})-\d{2,3}$/.exec(String(code || ''));
  return m ? m[1] : null;
}
