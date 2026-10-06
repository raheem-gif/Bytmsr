// الموقع العام (الإصدار 9 — وحدة site): صفحات الموقع المولّدة على الخادم من إعدادات المؤسسة،
// وسوم SEO والمشاركة وJSON-LD، robots.txt وsitemap.xml، وعامل الخدمة (PWA) بإصدار يتغير مع كل نشر.
//
// قوالب الصفحات في public/*.html وتدعم:
//   {{key}}  قيمة نصية مُهرّبة          {{{key}}}  HTML مولّد على الخادم (رأس، تذييل، أقسام)
//   <!--#if key-->…<!--/if key-->  يظهر المحتوى إذا كانت القيمة غير فارغة
//   <!--site:head-->  تُستبدل بوسوم canonical وOpen Graph وTwitter والأيقونات وJSON-LD
// العنوان والوصف تؤخذ من <title> و<meta name="description"> في الصفحة نفسها (مصدر واحد).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LEGAL_AREAS, DEFAULT_SETTINGS, GOVERNORATES } from './constants.js';
import { normalizePhone, v, badRequest } from './util.js';
import { publicWhatsAppDigits, isPlaceholderWhatsApp } from './channels/whatsapp.js';
import { assetVersion, sendBody } from './http.js';

// قيم احتياطية للحقول الإلزامية فقط (الاسم الرسمي واسم البرنامج) إن أُفرغت.
// أما الحقول الاختيارية (الإشهار، العنوان، الهاتف، فيسبوك، المواعيد) فإفراغها من الإعدادات يخفيها من الموقع،
// ولا تُستعاد قيمتها الافتراضية رغمًا عن الإدارة.
const FALLBACK = {
  org_legal_name: 'مؤسسة بيوت مصر لدعم الأرامل والأيتام',
  site_program_name: 'الدعم القانوني',
};

/** أجزاء HTML يولّدها الخادم نفسه؛ وحدها تُدرج دون تهريب بصيغة {{{key}}} (أي مفتاح آخر يُهرَّب دائمًا) */
const RAW_KEYS = new Set(['header', 'footer', 'contact_list', 'socials', 'services', 'faq', 'programs', 'brand_mark']);

/** الحد الأقصى لأطوال حقول الموقع (نفس حدود بطاقة الإعدادات في الواجهة) */
const SITE_TEXT_FIELDS = [
  ['site_program_name', 'اسم البرنامج على الموقع', 60, true],
  ['org_legal_name', 'الاسم الرسمي الكامل للمؤسسة', 200, true],
  ['org_registration', 'بيانات الإشهار', 200, false],
  ['org_address', 'عنوان المقر', 300, false],
  ['office_hours', 'مواعيد العمل', 200, false],
];

function hostMatches(hostname, domains) {
  const h = String(hostname || '').toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

function socialUrl(value, label, domains) {
  const s = v.str(value, label, { max: 300 });
  if (s === null) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    throw badRequest(`أدخل رابط «${label}» كاملًا يبدأ بـ https://`);
  }
  if (u.protocol !== 'https:') throw badRequest(`يجب أن يبدأ رابط «${label}» بـ https://`);
  if (!hostMatches(u.hostname, domains)) throw badRequest(`يجب أن يكون رابط «${label}» من ${domains[0]}`);
  return u.href;
}

/**
 * التحقق في الخادم من إعدادات الموقع العام وبيانات التواصل (PATCH /api/admin/settings).
 * يعيد القيم المعتمدة للمفاتيح المرسلة فقط، ويرمي 400 بتفاصيل كل حقل غير صالح (details.fields).
 */
export function validateSiteSettings(body = {}) {
  const out = {};
  const fields = {};
  const take = (key, fn) => {
    if (body[key] === undefined) return;
    try {
      out[key] = fn(body[key]);
    } catch (e) {
      fields[key] = e.message;
    }
  };
  for (const [key, label, max, required] of SITE_TEXT_FIELDS) take(key, (x) => v.str(x, label, { required, max }) ?? '');
  take('org_phone', (x) => {
    const s = v.str(x, 'هاتف المؤسسة', { max: 30 });
    if (s === null) return '';
    if (!normalizePhone(s)) throw badRequest('أدخل رقم هاتف صحيحًا مثل 01211114662');
    return s;
  });
  take('org_email', (x) => v.email(x, 'البريد الإلكتروني') ?? '');
  take('org_facebook_url', (x) => socialUrl(x, 'صفحة فيسبوك', ['facebook.com', 'fb.com']));
  take('org_instagram_url', (x) => socialUrl(x, 'حساب إنستجرام', ['instagram.com']));
  const bad = Object.keys(fields);
  if (bad.length) throw badRequest(fields[bad[0]], { fields });
  return out;
}

/** صفحات الموقع العام: المسار ← ملف القالب وأولوية خريطة الموقع */
export const SITE_PAGES = [
  { path: '/', file: 'index.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/intake', file: 'intake.html', priority: '0.9', changefreq: 'monthly' },
  { path: '/about', file: 'about.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/privacy', file: 'privacy.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/terms', file: 'terms.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/data-deletion', file: 'data-deletion.html', priority: '0.4', changefreq: 'yearly' },
];

/** مسارات لا تُفهرس */
export const ROBOTS_DISALLOW = ['/app', '/p/', '/api/', '/setup', '/webhooks/'];

// ───────────── مجالات الخدمة ─────────────
// areas: أكواد المجالات القانونية بالترتيب المفضل؛ يُستخدم أول كود معرّف في LEGAL_AREAS لرابط «قدّم طلبًا».
export const SERVICES = [
  {
    key: 'inheritance',
    icon: 'scroll',
    title: 'المواريث وإعلام الوراثة',
    text: 'استخراج إعلام الوراثة وحصر التركة، وقسمة الميراث بالتراضي أو أمام المحكمة، وحماية أنصبة الأبناء القُصّر.',
    areas: ['INH'],
  },
  {
    key: 'alimony',
    icon: 'wallet',
    title: 'النفقة',
    text: 'نفقة الزوجة والأبناء ونفقة العدة والمتعة، وطلب زيادة النفقة، وتنفيذ الأحكام عن طريق بنك ناصر الاجتماعي.',
    areas: ['FAM'],
  },
  {
    key: 'custody',
    icon: 'heart',
    title: 'الحضانة والرؤية',
    text: 'إثبات الحضانة ومسكن الحضانة وأجرها، وتنظيم الرؤية بما يحقق مصلحة الطفل الفضلى.',
    areas: ['FAM'],
  },
  {
    key: 'guardianship',
    icon: 'shieldCheck',
    title: 'الولاية على المال والنيابة الحسبية',
    text: 'إجراءات الوصاية على أموال القُصّر، وصرف مستحقاتهم، واستئذان النيابة الحسبية في التصرفات اللازمة.',
    areas: ['GRD', 'FAM'],
  },
  {
    key: 'pensions',
    icon: 'landmark',
    title: 'المعاشات و«تكافل وكرامة»',
    text: 'معاش الأرملة والأبناء من التأمينات الاجتماعية، والتظلم من رفض دعم «تكافل وكرامة» أو إيقافه.',
    areas: ['PEN', 'LAB', 'ADM'],
  },
  {
    key: 'housing',
    icon: 'home',
    title: 'السكن والإيجار',
    text: 'نزاعات الإيجار القديم والجديد، ودعاوى الإخلاء، وحق الأسرة في مسكن الزوجية أو مسكن الحضانة.',
    areas: ['PRP'],
  },
  {
    key: 'labour',
    icon: 'briefcase',
    title: 'العمل',
    text: 'الأجور والمستحقات المتأخرة، والفصل التعسفي، ومكافأة نهاية الخدمة، والتأمين على العاملين.',
    areas: ['LAB'],
  },
  {
    key: 'documents',
    icon: 'fileText',
    title: 'استخراج المستندات',
    text: 'التوجيه في استخراج شهادات الوفاة والميلاد والقيد العائلي وبطاقات الرقم القومي والمستندات اللازمة لملفك.',
    areas: ['ADM', 'GEN'],
  },
];

// ───────────── الأسئلة الشائعة (تُعرض في الصفحة وفي JSON-LD من نفس المصدر) ─────────────
export const FAQ = [
  {
    q: 'من يمكنه التقدم بطلب إلى برنامج الدعم القانوني؟',
    a: 'يخدم البرنامج في المقام الأول الأرامل، وأولياء أمور الأيتام والأوصياء عليهم، والأسر المستفيدة من برامج المؤسسة. ويمكن لغيرهم من الأسر الأولى بالرعاية التقدم كذلك، ويُنظر في كل طلب بحسب ظروفه وأولوية الحالة.',
  },
  {
    q: 'هل الخدمة مجانية؟',
    a: 'تقدّم المؤسسة الاستشارة والمتابعة القانونية دون مقابل لمستفيديها وللأسر التي تنطبق عليها شروط البرنامج، ويتحدد الاستحقاق النهائي بعد مراجعة الطلب. أما الرسوم الحكومية أو القضائية التي قد تلزم لبعض الإجراءات فنوضحها لك مسبقًا قبل اتخاذ أي خطوة.',
  },
  {
    q: 'ما المستندات التي أحتاج إليها لتقديم الطلب؟',
    a: 'لا يلزمك أي مستند لتقديم الطلب؛ يكفي أن تشرح مشكلتك. وإن كانت لديك صور مستندات متعلقة بالمسألة، مثل شهادة الوفاة أو عقد الإيجار أو حكم سابق، فإرفاقها يساعدنا على دراسة حالتك أسرع، وسنخبرك بما قد ينقص بعد المراجعة.',
  },
  {
    q: 'متى يصلني الرد؟',
    a: 'يراجع فريقنا الطلبات بحسب ترتيب ورودها وأولوية كل حالة، ونتواصل معك بعد المراجعة الأولى لإبلاغك بالخطوة التالية. ويختلف وقت إعداد الرأي القانوني بحسب طبيعة المسألة واكتمال المعلومات والمستندات.',
  },
  {
    q: 'هل سيعرف المحامي رقم هاتفي أو يقرأ محادثاتي؟',
    a: 'لا. لا يطّلع المحامي على رقم هاتفك ولا على محادثاتك مع المؤسسة، وإنما يرى فقط ما يتيحه له فريق المؤسسة من وقائع ومستندات لازمة لدراسة حالتك، ويمر كل تواصل معك عبر قنوات المؤسسة الرسمية.',
  },
  {
    q: 'هل تتولون رفع الدعاوى والحضور أمام المحاكم؟',
    a: 'نبدأ بالاستشارة ودراسة الحالة. فإذا احتاجت المسألة إلى إجراء أمام محكمة أو جهة حكومية، تقرر المؤسسة إمكانية متابعتها من خلال محامي البرنامج بحسب طبيعة الحالة والإمكانات المتاحة، ونوضح لك ذلك قبل اتخاذ أي خطوة.',
  },
  {
    q: 'لا أعرف نوع مشكلتي القانونية، فماذا أفعل؟',
    a: 'لا بأس. اختر «لست متأكدًا» في نموذج الطلب، أو اكتب لنا عبر واتساب بكلماتك، وسيتولى فريقنا تصنيف المسألة وتوجيهها إلى المختص.',
  },
  {
    q: 'كيف أتابع طلبي بعد إرساله؟',
    a: 'تحصل فور الإرسال على رقم طلب ورابط متابعة خاص بك، تتابع من خلاله الردود وترفع المستندات الإضافية. ويمكنك كذلك المتابعة عبر واتساب بذكر رقم الطلب. وإن فقدت الرابط فراسلنا أو اتصل بنا واذكر رقم طلبك لنرسل لك رابطًا جديدًا.',
    more: { href: '/portal', label: 'متابعة طلبك' },
  },
  {
    q: 'هل يمكنني التقدم بطلب نيابةً عن قريبة أو جارة؟',
    a: 'نعم، بشرط موافقة صاحبة الشأن على مشاركة بياناتها معنا، ويُفضَّل أن يكون رقم التواصل رقمها أو رقمًا تستطيع الرد عليه. وقد نطلب التحدث إليها مباشرة قبل اتخاذ أي إجراء.',
  },
  {
    q: 'كيف أطلب حذف بياناتي؟',
    a: 'يمكنك طلب حذف بياناتك في أي وقت عبر واتساب أو الهاتف أو بزيارة مقر المؤسسة، وتجد الخطوات وما يترتب على الطلب في صفحة «حذف البيانات».',
    more: { href: '/data-deletion', label: 'خطوات حذف البيانات' },
  },
];

// ───────────── برامج المؤسسة الأخرى ─────────────
export const PROGRAMS = [
  { name: 'نجاح', text: 'دعم تعليم الأبناء' },
  { name: 'المائدة', text: 'الدعم الغذائي للأسر' },
  { name: 'سلامة', text: 'الرعاية الصحية' },
  { name: 'الكسوة', text: 'كسوة الأسر والأطفال' },
  { name: 'أفراح', text: 'تجهيز العرائس من اليتيمات' },
  { name: 'صك الإيواء', text: 'ترميم المساكن وتأهيلها' },
  { name: 'نماء', text: 'الزكاة وتنمية دخل الأسر' },
];

// ───────────── الأيقونات (رسومات خطية 24×24 مستوحاة من Lucide — رخصة ISC) ─────────────
const ICONS = {
  scroll: ['M15 12h-5', 'M15 8h-5', 'M19 17V5a2 2 0 0 0-2-2H4', 'M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  shieldCheck: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  landmark: ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2l8 5H4z'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  briefcase: ['M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  fileText: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21', 'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 6l-10 7L2 6'],
  mapPin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  facebook: ['M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z'],
  instagram: ['M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z', 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z', 'M17.5 6.5h.01'],
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  eyeOff: ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24', 'M1 1l22 22'],
  checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4L12 14.01l-3-3'],
  check: ['M20 6L9 17l-5-5'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  menu: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
  chevronDown: ['M6 9l6 6 6-6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  externalLink: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  clipboard: ['M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  gavel: ['M14.5 12.5l-8 8a2.12 2.12 0 1 1-3-3l8-8', 'M16 16l6-6', 'M8 8l6-6', 'M9 7l8 8', 'M21 11l-8-8'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  sparkle: ['M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z'],
};

/** أيقونة SVG خطية كنص HTML (زخرفية: مخفية عن قارئات الشاشة). */
export function iconSvg(name, size = 22, cls = '') {
  const paths = ICONS[name] || ICONS.info;
  return (
    `<svg class="pub-icon${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    paths.map((d) => `<path d="${d}"/>`).join('') +
    '</svg>'
  );
}

/** شعار المؤسسة: بيت يحتضن ميزان العدالة (نفس رسم public/assets/img/favicon.svg). */
export function brandSvg({ size = 40, stroke = 'currentColor', label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return (
    `<svg class="pub-mark-svg" width="${size}" height="${size}" viewBox="0 0 64 64" ${a11y}>` +
    `<g fill="none" stroke="${stroke}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M8 30 32 10.5 56 30"/><path d="M14.5 25.5V53h35V25.5"/><path d="M32 19.5v27.5"/><path d="M26 47h12"/>' +
    '<path d="M22 27.5c3.5.8 6.8-.2 10-2 3.2 1.8 6.5 2.8 10 2"/>' +
    '<path d="M22 27.5l-3.8 8.5c1 .9 2.3 1.4 3.8 1.4s2.8-.5 3.8-1.4z"/><path d="M42 27.5l-3.8 8.5c1 .9 2.3 1.4 3.8 1.4s2.8-.5 3.8-1.4z"/>' +
    '</g></svg>'
  );
}

// ───────────── أدوات ─────────────

/** تهريب HTML للنصوص والسمات */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** رابط خارجي آمن فقط (http/https) — يمنع javascript: وما شابه من إعدادات الإدارة */
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function safeEmail(e) {
  const s = String(e || '').trim();
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(s) ? s : '';
}

/** JSON داخل <script type="application/ld+json"> دون إمكانية إغلاق الوسم */
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i;

/** محرك القوالب: الكتل الشرطية ثم القيم في تمريرة واحدة (القيم المُدرجة لا تُعالج مرة أخرى كقوالب). */
export function renderTemplate(text, view) {
  let out = text;
  // كتل شرطية (تتكرر حتى تُحل المتداخلة)
  const IF_RE = /<!--#if ([a-z0-9_]+)-->([\s\S]*?)<!--\/if \1-->/g;
  for (let i = 0; i < 5 && IF_RE.test(out); i += 1) {
    IF_RE.lastIndex = 0;
    out = out.replace(IF_RE, (_, key, body) => (view[key] ? body : ''));
  }
  // {{{key}}} يُدرج دون تهريب لأجزاء HTML المولّدة على الخادم فقط (RAW_KEYS)؛ أي قيمة من الإعدادات تُهرَّب دائمًا
  return out.replace(/\{\{\{([a-z0-9_]+)\}\}\}|\{\{([a-z0-9_]+)\}\}/g, (_, raw, key) => {
    if (raw) return RAW_KEYS.has(raw) ? (view[raw] == null ? '' : String(view[raw])) : esc(view[raw]);
    return esc(view[key]);
  });
}

// ───────────── الوحدة ─────────────

export function registerSite(app) {
  const { config } = app;
  const pub = config.publicDir;
  const templateCache = new Map(); // file → { mtimeMs, text }

  function readTemplate(file) {
    const full = path.join(pub, file);
    const st = fs.statSync(full);
    const hit = templateCache.get(full);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.text;
    const text = fs.readFileSync(full, 'utf8');
    templateCache.set(full, { mtimeMs: st.mtimeMs, size: st.size, text });
    return text;
  }

  /** الرابط الأساسي المطلق: PUBLIC_BASE_URL، وإلا من ترويسة Host (بعد التحقق من صيغتها). */
  function baseUrl(req) {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    const trust = process.env.TRUST_PROXY === '1';
    const fwdHost = trust ? String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim() : '';
    let host = fwdHost || String(req?.headers?.host || '');
    if (!HOST_RE.test(host)) host = `localhost:${config.port || 3000}`;
    const fwdProto = trust ? String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() : '';
    const proto = fwdProto === 'https' || req?.socket?.encrypted ? 'https' : 'http';
    return `${proto}://${host}`;
  }

  function waDigits(s) {
    // (v9 messaging) الرقم الفعلي من التكاملات (البيئة أولًا ثم المحفوظ من معالج الإعداد أو صفحة التكاملات) ثم الإعدادات العامة.
    // الرقم التوضيحي +20 100 000 0000 أو الفارغ = «واتساب غير مضبوط»: لا أزرار ولا روابط wa.me في الموقع
    if (app.whatsapp?.publicDigits) return app.whatsapp.publicDigits();
    return publicWhatsAppDigits(config.whatsapp?.numberDigits) || publicWhatsAppDigits(s.whatsapp_display_number);
  }

  /** إعدادات الموقع العامة (آمنة للعرض) — تُستخدم في القوالب و/api/meta */
  function publicSettings() {
    const s = app.settings.all();
    const pick = (k) => {
      const val = s[k];
      return typeof val === 'string' && val.trim() ? val.trim() : FALLBACK[k] || '';
    };
    const orgName = pick('org_name') || DEFAULT_SETTINGS.org_name;
    const programName = pick('site_program_name');
    const address = pick('org_address');
    const phone = pick('org_phone');
    const phoneE164 = normalizePhone(phone) || '';
    const digits = waDigits(s);
    return {
      org_name: orgName,
      org_tagline: pick('org_tagline'),
      program_name: programName,
      site_name: programName ? `${programName} — ${orgName}` : orgName,
      org_legal_name: pick('org_legal_name'),
      org_registration: pick('org_registration'),
      org_address: address,
      org_phone: phone,
      org_phone_e164: phoneE164,
      org_email: safeEmail(s.org_email),
      org_facebook_url: safeUrl(pick('org_facebook_url')),
      org_instagram_url: safeUrl(s.org_instagram_url),
      office_hours: pick('office_hours'),
      map_url: address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '',
      whatsapp_digits: digits,
      whatsapp_display_number: digits && typeof s.whatsapp_display_number === 'string' && !isPlaceholderWhatsApp(s.whatsapp_display_number) ? s.whatsapp_display_number : '',
      privacy_notice: pick('privacy_notice'),
    };
  }

  function waLink(digits, text) {
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : '';
  }

  function areaCodeFor(service) {
    const codes = new Set(LEGAL_AREAS.map((a) => a.code));
    return service.areas.find((c) => codes.has(c)) || '';
  }

  // ───────────── الأجزاء المشتركة ─────────────

  const NAV = [
    { href: '/#services', label: 'خدماتنا' },
    { href: '/#how', label: 'كيف نعمل' },
    { href: '/#faq', label: 'أسئلة شائعة' },
    { href: '/about', label: 'عن البرنامج', path: '/about' },
    { href: '/#contact', label: 'تواصل معنا' },
  ];

  function headerHtml(ps, current) {
    const links = NAV.map(
      (n) => `<a class="pub-nav-link" href="${n.href}"${n.path && n.path === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`,
    ).join('');
    return `<header class="pub-header" data-pub-header>
  <div class="pub-container pub-header-inner">
    <a class="pub-brand" href="/" aria-label="${esc(ps.site_name)} — الصفحة الرئيسية">
      <span class="pub-logo">${brandSvg({ size: 30 })}</span>
      <span class="pub-brand-text"><strong>${esc(ps.program_name || ps.org_name)}</strong><span>${esc(ps.org_legal_name || ps.org_name)}</span></span>
    </a>
    <button class="pub-menu-toggle" type="button" aria-expanded="false" aria-controls="pub-nav" data-pub-menu>
      ${iconSvg('menu', 22, 'pub-menu-open')}${iconSvg('x', 22, 'pub-menu-close')}<span class="pub-sr">القائمة</span>
    </button>
    <nav id="pub-nav" class="pub-nav" aria-label="القائمة الرئيسية">
      ${links}
      <a class="pub-nav-link pub-nav-portal" href="/portal"${current === '/portal' ? ' aria-current="page"' : ''}>${iconSvg('search', 18)}<span>متابعة طلبك</span></a>
      <a class="pub-btn pub-btn-gold pub-nav-cta" href="/intake" data-cta="intake"${current === '/intake' ? ' aria-current="page"' : ''}>${iconSvg('send', 18, 'pub-flip')}<span>قدّم طلبك</span></a>
    </nav>
  </div>
</header>`;
  }

  function contactListHtml(ps, wa) {
    const items = [];
    if (ps.org_address) {
      items.push(
        `<li>${iconSvg('mapPin', 20)}<span><span class="pub-contact-label">العنوان</span>${esc(ps.org_address)}` +
          (ps.map_url ? ` <a href="${esc(ps.map_url)}" target="_blank" rel="noopener noreferrer">عرض على الخريطة<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>` : '') +
          '</span></li>',
      );
    }
    if (ps.org_phone) {
      items.push(
        `<li>${iconSvg('phone', 20)}<span><span class="pub-contact-label">الهاتف</span><a href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></span></li>`,
      );
    }
    if (wa) {
      items.push(
        `<li>${iconSvg('whatsapp', 20)}<span><span class="pub-contact-label">واتساب</span><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">راسلنا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></span></li>`,
      );
    }
    if (ps.org_email) {
      items.push(`<li>${iconSvg('mail', 20)}<span><span class="pub-contact-label">البريد الإلكتروني</span><a href="mailto:${esc(ps.org_email)}" dir="ltr" class="pub-ltr">${esc(ps.org_email)}</a></span></li>`);
    }
    if (ps.office_hours) {
      items.push(`<li>${iconSvg('clock', 20)}<span><span class="pub-contact-label">مواعيد العمل</span>${esc(ps.office_hours)}</span></li>`);
    }
    return `<ul class="pub-contact-list">${items.join('')}</ul>`;
  }

  function socialHtml(ps) {
    const out = [];
    if (ps.org_facebook_url) {
      out.push(`<a class="pub-social" href="${esc(ps.org_facebook_url)}" target="_blank" rel="noopener noreferrer">${iconSvg('facebook', 18)}<span>فيسبوك</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    }
    if (ps.org_instagram_url) {
      out.push(`<a class="pub-social" href="${esc(ps.org_instagram_url)}" target="_blank" rel="noopener noreferrer">${iconSvg('instagram', 18)}<span>إنستجرام</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    }
    return out.length ? `<div class="pub-socials">${out.join('')}</div>` : '';
  }

  function footerHtml(ps, wa) {
    const year = new Date().getFullYear();
    return `<footer class="pub-footer">
  <div class="pub-container pub-footer-grid">
    <div class="pub-footer-about">
      <a class="pub-brand pub-brand-light" href="/">
        <span class="pub-logo">${brandSvg({ size: 30 })}</span>
        <span class="pub-brand-text"><strong>${esc(ps.program_name || ps.org_name)}</strong><span>${esc(ps.org_legal_name || ps.org_name)}</span></span>
      </a>
      ${ps.org_registration ? `<p class="pub-footer-reg">${esc(ps.org_registration)}</p>` : ''}
      <p>برنامج يقدّم المشورة والمتابعة القانونية للأرامل والأيتام وأسرهم، بإشراف فريق المؤسسة وبمشاركة محامين مختصين.</p>
      ${socialHtml(ps)}
    </div>
    <nav class="pub-footer-col" aria-label="روابط الموقع">
      <h2>روابط</h2>
      <ul>
        <li><a href="/">الصفحة الرئيسية</a></li>
        <li><a href="/about">عن البرنامج</a></li>
        <li><a href="/intake" data-cta="intake">قدّم طلبك</a></li>
        <li><a href="/portal">متابعة طلبك</a></li>
        <li><a href="/#faq">أسئلة شائعة</a></li>
      </ul>
    </nav>
    <nav class="pub-footer-col" aria-label="السياسات">
      <h2>السياسات</h2>
      <ul>
        <li><a href="/privacy">سياسة الخصوصية</a></li>
        <li><a href="/terms">شروط الاستخدام</a></li>
        <li><a href="/data-deletion">حذف البيانات</a></li>
      </ul>
    </nav>
    <div class="pub-footer-col pub-footer-contact">
      <h2>تواصل معنا</h2>
      ${contactListHtml(ps, wa)}
    </div>
  </div>
  <div class="pub-footer-bottom">
    <div class="pub-container pub-footer-bottom-inner">
      <span>© ${year} ${esc(ps.org_legal_name || ps.org_name)}. جميع الحقوق محفوظة.</span>
      <a href="/app" class="pub-staff-link">دخول فريق العمل والمحامين</a>
    </div>
  </div>
</footer>`;
  }

  function servicesHtml() {
    return SERVICES.map((s) => {
      const code = areaCodeFor(s);
      const href = code ? `/intake?area=${encodeURIComponent(code)}` : '/intake';
      return `<li class="pub-service" id="service-${s.key}">
  <span class="pub-service-icon">${iconSvg(s.icon, 26)}</span>
  <h3>${esc(s.title)}</h3>
  <p>${esc(s.text)}</p>
  <a class="pub-service-link" href="${href}" data-cta="intake">قدّم طلبًا في هذا المجال<span class="pub-sr">: ${esc(s.title)}</span>${iconSvg('arrowLeft', 16)}</a>
</li>`;
    }).join('\n');
  }

  function faqHtml() {
    return FAQ.map(
      (f, i) => `<details class="pub-faq-item"${i === 0 ? ' open' : ''}>
  <summary><span>${esc(f.q)}</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
  <div class="pub-faq-body"><p>${esc(f.a)}</p>${f.more ? `<p><a href="${f.more.href}">${esc(f.more.label)}</a></p>` : ''}</div>
</details>`,
    ).join('\n');
  }

  function programsHtml() {
    return PROGRAMS.map((p) => `<li><strong>«${esc(p.name)}»</strong><span>${esc(p.text)}</span></li>`).join('');
  }

  // ───────────── JSON-LD ─────────────

  function jsonLd(ps, base, pagePath, { title, description, faq }) {
    const orgId = `${base}/#organization`;
    // المحافظة تُستنتج من نص العنوان القابل للتعديل (لا تُكتب ثابتة)
    const region = ps.org_address ? GOVERNORATES.find((g) => ps.org_address.includes(g)) : undefined;
    const address = ps.org_address
      ? { '@type': 'PostalAddress', streetAddress: ps.org_address, addressLocality: region, addressRegion: region, addressCountry: 'EG' }
      : undefined;
    const sameAs = [ps.org_facebook_url, ps.org_instagram_url].filter(Boolean);
    const org = {
      '@type': 'NGO',
      '@id': orgId,
      name: ps.org_legal_name || ps.org_name,
      alternateName: ps.org_name,
      url: `${base}/`,
      logo: `${base}/assets/img/icon-512.png`,
      description: ps.org_registration || undefined,
      telephone: ps.org_phone_e164 || undefined,
      email: ps.org_email || undefined,
      address,
      sameAs: sameAs.length ? sameAs : undefined,
    };
    const service = {
      '@type': 'LegalService',
      '@id': `${base}/#legal-support`,
      name: ps.site_name,
      description: ps.org_tagline || undefined,
      url: `${base}/`,
      image: `${base}/assets/img/og-image.png`,
      logo: `${base}/assets/img/icon-512.png`,
      telephone: ps.org_phone_e164 || undefined,
      email: ps.org_email || undefined,
      address,
      areaServed: { '@type': 'Country', name: 'مصر' },
      availableLanguage: 'ar',
      parentOrganization: { '@id': orgId },
      knowsAbout: SERVICES.map((s) => s.title),
    };
    const page = {
      '@type': 'WebPage',
      '@id': `${base}${pagePath}#webpage`,
      url: `${base}${pagePath}`,
      name: title,
      description,
      inLanguage: 'ar-EG',
      isPartOf: { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: ps.site_name, inLanguage: 'ar-EG', publisher: { '@id': orgId } },
      about: { '@id': `${base}/#legal-support` },
    };
    const graph = [org, service, page];
    if (faq) {
      graph.push({
        '@type': 'FAQPage',
        '@id': `${base}${pagePath}#faq`,
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      });
    }
    return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
  }

  function headTags(ps, base, pagePath, { title, description, noindex, faq }) {
    const canonical = `${base}${pagePath}`;
    const image = `${base}/assets/img/og-image.png`;
    const imageAlt = `${ps.site_name}: ${ps.org_tagline || 'دعم قانوني للأرامل والأيتام وأسرهم'}`;
    return [
      `<link rel="canonical" href="${esc(canonical)}" />`,
      noindex ? '<meta name="robots" content="noindex, follow" />' : '',
      '<meta name="theme-color" content="#0f4c5c" />',
      '<meta name="format-detection" content="telephone=no" />',
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(ps.site_name)}" />`,
      `<meta property="og:locale" content="ar_EG" />`,
      `<meta property="og:title" content="${esc(title)}" />`,
      `<meta property="og:description" content="${esc(description)}" />`,
      `<meta property="og:url" content="${esc(canonical)}" />`,
      `<meta property="og:image" content="${esc(image)}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${esc(imageAlt)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(title)}" />`,
      `<meta name="twitter:description" content="${esc(description)}" />`,
      `<meta name="twitter:image" content="${esc(image)}" />`,
      `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`,
      '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
      '<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />',
      '<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" />',
      `<script type="application/ld+json">${jsonLd(ps, base, pagePath, { title, description, faq })}</script>`,
    ]
      .filter(Boolean)
      .join('\n    ');
  }

  // ───────────── محرك القوالب ─────────────

  function decodeEntities(s) {
    return String(s)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /** يبني الصفحة كاملة من القالب: القيم، الرأس، التذييل، ووسوم SEO. */
  function renderPage(file, req, pagePath, extra = {}) {
    const ps = publicSettings();
    const base = baseUrl(req);
    const greeting = `مرحبًا ${ps.org_name}، أود الحصول على استشارة قانونية.`;
    const wa = waLink(ps.whatsapp_digits, greeting);
    const view = {
      ...ps,
      base_url: base,
      year: String(new Date().getFullYear()),
      whatsapp_url: wa,
      // للنصوص البديلة في القوالب (<!--#if no_whatsapp-->) حين لا يوجد رقم واتساب فعلي بعد
      no_whatsapp: wa ? '' : '1',
      whatsapp_deletion_url: waLink(ps.whatsapp_digits, `مرحبًا ${ps.org_name}، أطلب حذف بياناتي الشخصية المسجلة لديكم.`),
      org_phone_href: ps.org_phone_e164 || ps.org_phone,
      header: headerHtml(ps, pagePath),
      footer: footerHtml(ps, wa),
      contact_list: contactListHtml(ps, wa),
      socials: socialHtml(ps),
      services: servicesHtml(),
      faq: faqHtml(),
      programs: programsHtml(),
      brand_mark: brandSvg({ size: 120 }),
      ...extra,
    };
    let html = renderTemplate(readTemplate(file), view);
    const title = decodeEntities((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || ps.site_name).trim();
    const description = decodeEntities((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || ps.org_tagline).trim();
    // إن عرّف القالب وسم robots بنفسه لا نضيف وسمًا ثانيًا
    const noindex = extra.noindex && !/<meta name="robots"/.test(html);
    const head = headTags(ps, base, pagePath, { title, description, noindex, faq: pagePath === '/' });
    return versionAssets(html.replace('<!--site:head-->', () => head));
  }

  /**
   * يضيف رقم إصدار الملف (?v=…) لروابط ملفات CSS وJS المحلية في الصفحة (أكبر ما يُنزَّل)،
   * فيخزّنها المتصفح سنة كاملة ويعيد تنزيلها فقط عند تغيّر محتواها (src/http.js).
   * الأيقونات وصور المشاركة تبقى بروابطها الثابتة (وسوم SEO).
   */
  function versionAssets(html) {
    return html.replace(/\b(href|src)="(\/assets\/[^"?#]+\.(?:css|js))"/g, (m, attr, url) => {
      const v = assetVersion(path.join(pub, url));
      return v ? `${attr}="${url}?v=${v}"` : m;
    });
  }

  function sendHtml(req, res, html, { noStore = false } = {}) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // لا بيانات شخصية في هذه الصفحات؛ إعادة التحقق في كل زيارة حتى تظهر تعديلات الإعدادات فورًا.
    // صفحات الروابط الخاصة (noStore) لا تُحفظ في ذاكرة المتصفح أو الوسطاء إطلاقًا.
    res.setHeader('Cache-Control', noStore ? 'no-store' : 'no-cache');
    // مضغوطة (gzip) لمن يقبلها: الموقع العام يُفتح غالبًا من هواتف بباقات بيانات محدودة
    sendBody(res, 200, html, { req });
  }

  /**
   * يسجل صفحة عامة تُبنى من قالب بنفس الرأس والتذييل ووسوم SEO.
   * optIn: لا تُعالج الصفحة إلا إذا احتوى ملفها على {{{header}}} (لصفحات الوحدات الأخرى مثل /portal).
   */
  function registerPage(pagePath, file, { optIn = false, noindex = false } = {}) {
    app.pageHandlers.set(pagePath, (req, res) => servePage(req, res, file, pagePath, { optIn, noindex }));
  }

  /**
   * يخدم قالب صفحة بالرأس والتذييل المشتركين. يعيد false (ليتولى المسار المعالجة الافتراضية) إن لم يوجد الملف،
   * أو إن كان optIn ولم يحتوِ القالب على {{{header}}}. pagePath هو المسار الظاهر في canonical والقائمة،
   * ولصفحات الروابط الخاصة (/p/<رمز>) يُمرَّر مسار عام بلا الرمز حتى لا يُكتب الرمز في وسوم الصفحة.
   */
  function servePage(req, res, file, pagePath, { optIn = false, noindex = false, noStore = false } = {}) {
    let html;
    try {
      if (optIn && !readTemplate(file).includes('{{{header}}}')) return false;
      html = renderPage(file, req, pagePath, { noindex });
    } catch (e) {
      if (e && e.code === 'ENOENT') return false; // يعود للمعالجة الافتراضية (404)
      throw e;
    }
    sendHtml(req, res, html, { noStore });
    return true;
  }

  for (const page of SITE_PAGES) registerPage(page.path, page.file);
  // صفحة «متابعة طلب» (وحدة المراسلة) تستخدم الرأس والتذييل المشتركين إن وضعت {{{header}}} و{{{footer}}} في قالبها
  if (!app.pageHandlers.has('/portal')) registerPage('/portal', 'portal-login.html', { optIn: true, noindex: true });

  // /index.html ← / (مسار واحد لكل صفحة)
  app.pageHandlers.set('/index.html', (req, res) => {
    res.statusCode = 301;
    res.setHeader('Location', '/');
    res.end();
    return true;
  });

  // ───────────── robots.txt وsitemap.xml ─────────────

  app.pageHandlers.set('/robots.txt', (req, res) => {
    const base = baseUrl(req);
    const body = ['User-agent: *', 'Allow: /', ...ROBOTS_DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  });

  app.pageHandlers.set('/sitemap.xml', (req, res) => {
    const base = baseUrl(req);
    const urls = SITE_PAGES.map((p) => {
      let lastmod = '';
      try {
        lastmod = fs.statSync(path.join(pub, p.file)).mtime.toISOString().slice(0, 10);
      } catch {
        return '';
      }
      return `  <url>\n    <loc>${esc(base + p.path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`;
    }).filter(Boolean);
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  });

  // ───────────── عامل الخدمة (PWA للمنصة) ─────────────
  // يُخدم من public/sw.js بعد حقن رقم إصدار يتغير مع أي تعديل في الملفات الثابتة وقائمة الملفات المطلوب تخزينها مسبقًا.
  const PRECACHE_EXT = new Set(['.js', '.css', '.svg', '.png', '.woff2', '.ico']);
  // ملفات الموقع العام وصورة المشاركة لا تحتاجها المنصة
  const PRECACHE_SKIP = [/^\/assets\/js\/public\//, /^\/assets\/css\/public-site\.css$/, /^\/assets\/img\/og-image\.png$/];

  function listAssets() {
    const root = path.join(pub, 'assets');
    const out = [];
    const walk = (dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && PRECACHE_EXT.has(path.extname(e.name).toLowerCase())) {
          const st = fs.statSync(full);
          out.push({ url: '/' + path.relative(pub, full).split(path.sep).join('/'), size: st.size, mtime: st.mtimeMs });
        }
      }
    };
    walk(root);
    return out.sort((a, b) => a.url.localeCompare(b.url));
  }

  function swBuild() {
    const assets = listAssets();
    const hash = crypto.createHash('sha256');
    hash.update(String(app.version || ''));
    for (const a of assets) hash.update(`${a.url}:${a.size}:${a.mtime}\n`);
    try {
      const st = fs.statSync(path.join(pub, 'sw.js'));
      hash.update(`sw:${st.size}:${st.mtimeMs}`);
    } catch {
      /* سيُرفض الطلب لاحقًا */
    }
    return {
      version: `${app.version || '0'}-${hash.digest('hex').slice(0, 12)}`,
      precache: assets.filter((a) => !PRECACHE_SKIP.some((re) => re.test(a.url))).map((a) => a.url),
    };
  }

  app.pageHandlers.set('/sw.js', (req, res) => {
    let src;
    try {
      src = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
    } catch {
      return false;
    }
    const { version, precache } = swBuild();
    const ps = publicSettings();
    const body = src
      .replace("'__SW_VERSION__'", () => JSON.stringify(version))
      .replace('[/*__PRECACHE__*/]', () => JSON.stringify(precache))
      .replace("'__ORG_NAME__'", () => jsonForScript(ps.org_name));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    // يجب أن يتحقق المتصفح من وجود إصدار جديد في كل مرة
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  });

  // ───────────── /api/meta ─────────────
  // تُضاف تحت المفتاح site حتى لا تتعارض مع settings الأساسية
  app.metaProviders.push(() => {
    const ps = publicSettings();
    return {
      site: {
        site_name: ps.site_name,
        program_name: ps.program_name,
        org_name: ps.org_name,
        org_full_name: ps.org_legal_name,
        org_legal_name: ps.org_legal_name,
        org_registration: ps.org_registration,
        org_address: ps.org_address,
        org_phone: ps.org_phone,
        org_phone_e164: ps.org_phone_e164,
        org_email: ps.org_email,
        org_facebook_url: ps.org_facebook_url,
        org_instagram_url: ps.org_instagram_url,
        office_hours: ps.office_hours,
        map_url: ps.map_url,
      },
    };
  });

  app.site = { baseUrl, publicSettings, renderPage, registerPage, servePage, validateSettings: validateSiteSettings, SERVICES, FAQ, PROGRAMS };
  return app.site;
}
