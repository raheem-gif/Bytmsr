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
// v9.1 (B91-11): رسم الوحدات بأرقام إصدار ثابتة وروابط modulepreload
import { setPublicRoot, preloadClosure } from './site-assets.js';
// v9.2 public: مصدر واحد للمواضيع (الشاشة الأولى، «بنساعد في إيه؟»، النموذج، الإدارة) وصورها
import { TOPICS } from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';

// قيم احتياطية للحقول الإلزامية فقط (الاسم الرسمي واسم البرنامج) إن أُفرغت.
// أما الحقول الاختيارية (الإشهار، العنوان، الهاتف، فيسبوك، المواعيد) فإفراغها من الإعدادات يخفيها من الموقع،
// ولا تُستعاد قيمتها الافتراضية رغمًا عن الإدارة.
const FALLBACK = {
  org_legal_name: 'مؤسسة بيوت مصر لدعم الأرامل والأيتام',
  site_program_name: 'الدعم القانوني',
};

/** v9.1 (B91-12): رسالة واتساب الجاهزة في الموقع، بسيطة ومحايدة (تصلح للأم والأب) */
const SITE_GREETING = 'السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.';

/** أجزاء HTML يولّدها الخادم نفسه؛ وحدها تُدرج دون تهريب بصيغة {{{key}}} (أي مفتاح آخر يُهرَّب دائمًا) */
const RAW_KEYS = new Set(['header', 'footer', 'contact_list', 'socials', 'services', 'faq', 'programs', 'brand_mark', 'audience', 'contact_buttons', 'icon_check', 'icon_lock', 'icon_wallet', 'icon_whatsapp', 'icon_phone', 'start_tiles', 'ways_tiles', 'header_contact']);

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

// ───────────── «بنساعد في إيه؟» (الإصدار 9.1 — B91-07؛ v9.2: من topics.js) ─────────────
// كلام يومي ومثال من كلام المستفيدة نفسها. key: معرّف المربع القديم (id="service-…")، topic: مفتاح الموضوع لرابط
// /intake?topic=… (حضانة ورؤية تفتح الحضانة لا النفقة رغم أن المجال واحد). seo: الاسم القانوني لوسوم البحث.
const SERVICE_ICONS = { inheritance: 'scroll', pensions: 'landmark', guardianship: 'shieldCheck', alimony: 'wallet', custody: 'heart', housing: 'home', documents: 'fileText', other: 'message' };
export const SERVICES = TOPICS.map((t) => ({
  key: t.service_key,
  topic: t.key,
  icon: SERVICE_ICONS[t.service_key] || 'message',
  title: t.label,
  example: t.example,
  areas: t.area ? [t.area] : [],
  seo: t.seo,
}));

/** أسماء المجالات بكلام يومي (لنموذج الطلب عبر بيانات الصفحة bm-public) */
export const PLAIN_AREAS = {
  INH: 'ورث',
  FAM: 'نفقة وحضانة وجواز وطلاق',
  GRD: 'فلوس الأيتام',
  PEN: 'معاش وتكافل وكرامة',
  PRP: 'سكن وإيجار وملكية',
  CIV: 'عقود وفلوس وتعويضات',
  LAB: 'شغل ومرتب',
  CRM: 'قضية جنائية',
  COM: 'تجارة وشركات',
  TAX: 'ضرائب',
  ADM: 'ورق رسمي ومصالح حكومية',
  GEN: 'حاجة تانية',
};

// ───────────── الأسئلة الشائعة (B91-07): خمسة أسئلة بكلام بسيط، نفس المصدر للصفحة ولـ JSON-LD ─────────────
// a(ctx): الإجابة حسب إعدادات المؤسسة الحالية — ctx = { wa: يوجد رقم واتساب، otp: الدخول بالكود متاح، review, min, max }
// عدد الأيام بمعدوده الصحيح بالعامية: «يوم» / «يومين» / «3 أيام» … «10 أيام» / «11 يوم» / «14 يوم»
export function daysWord(n) {
  const k = Math.max(0, Math.round(Number(n) || 0));
  if (k === 1) return 'يوم';
  if (k === 2) return 'يومين';
  const r = k % 100;
  return r >= 3 && r <= 10 ? `${k} أيام` : `${k} يوم`;
}
const workDays = (n) => `${daysWord(n)} شغل`;
export const FAQ = [
  {
    q: 'الخدمة بفلوس؟',
    a: () => 'لأ. الاستشارة مجانية، ومحدش من المحامين يطلب منك فلوس. لو قضيتك محتاجة رسوم حكومية أو مصاريف محكمة، هنقولك عليها الأول، ومش هنعمل حاجة غير بموافقتك.',
  },
  {
    q: 'مين هيشوف بياناتي؟',
    a: () => 'فريق المؤسسة بس. المحامي مش بيشوف رقمك ولا رسايلك، بيشوف الحكاية والورق اللي محتاجه عشان يدرس مشكلتك. ومش بنبيع ولا بنشارك بياناتك مع حد.',
    more: { href: '/privacy#summary', label: 'اقري سياسة الخصوصية' },
  },
  {
    q: 'الرد بياخد قد إيه؟',
    a: (c) => `فريقنا بيقرا طلبك غالبًا خلال ${workDays(c.review)}. المحامي بيدرس المشكلة غالبًا ${c.min < c.max ? `من ${c.min} لحد ${daysWord(c.max)}` : `في ${daysWord(c.max)}`}، حسب المشكلة والورق. وهنقولك على كل خطوة ${c.wa ? 'على واتساب وعلى صفحة طلبك' : 'على صفحة طلبك'}.`,
  },
  {
    q: 'محتاجة ورق إيه؟',
    a: () => 'مش لازم أي ورق عشان تبعتي طلبك، احكيلنا مشكلتك بس. لو عندك ورق زي شهادة الوفاة أو عقد الإيجار، صوّريه وابعتيه، وهنقولك لو محتاجين حاجة تانية.',
  },
  {
    q: 'ضيّعت رابط طلبي، أعمل إيه؟',
    a: (c) =>
      c.otp
        ? 'ادخلي على «تابعي طلبك» واكتبي رقمك اللي عليه واتساب، هيوصلك كود. أو كلمينا وقولي رقم طلبك، وهنبعتلك الرابط بعد ما نتأكد إنك صاحبة الطلب.'
        : 'كلمينا وقولي رقم طلبك، وهنبعتلك الرابط بعد ما نتأكد إنك صاحبة الطلب.',
    more: { href: '/portal', label: 'تابعي طلبك' },
  },
];

/** «من نخدم» (انتقلت من الصفحة الرئيسية إلى «عن البرنامج») */
export const AUDIENCE = [
  { icon: 'user', title: 'الأرامل', text: 'في الورث والمعاش والنفقة والسكن، وكل الورق اللي بيحتاجه وفاة الزوج.' },
  { icon: 'users', title: 'أولياء أمور الأيتام والأوصياء', text: 'الأم الحاضنة أو الوصي، في فلوس الأيتام وحقوقهم في الورث والمعاش والنفقة.' },
  { icon: 'home', title: 'أسر المؤسسة', text: 'الأسر المستفيدة من برامج المؤسسة التانية، لما تواجه مشكلة قانونية.' },
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
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
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
  setPublicRoot(pub); // v9.1: أرقام إصدار CSS/JS تُحسب بمسارات نسبية ثابتة
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

  /**
   * v9.1 (B91-11): بيانات الصفحة العامة المضمّنة في <script type="application/json" id="bm-public"> (لا تُنفَّذ، ولا تحتاج CSP)
   * فتقرأها صفحات الطلب والمتابعة فورًا (words.js → publicData()) بدل انتظار /api/meta. ≤ 3 كيلوبايت.
   */
  function publicBlock(ps) {
    return {
      org_name: ps.org_name,
      site_name: ps.site_name,
      phone: ps.org_phone,
      phone_e164: ps.org_phone_e164,
      whatsapp_digits: ps.whatsapp_digits,
      office_hours: ps.office_hours,
      portal_otp_enabled: !!app.messaging?.portalOtpAvailable?.(),
      governorates: GOVERNORATES,
      areas: LEGAL_AREAS.map((a) => ({ code: a.code, label: PLAIN_AREAS[a.code] || a.label })),
      setup_required: !!app.system?.isSetupMode?.(),
      demo: !!config.demo,
    };
  }

  // ───────────── الأجزاء المشتركة ─────────────

  // v9.1 (B91-07): كلام بسيط في القائمة؛ «عن البرنامج» والسياسات في «روابط مهمة» بالتذييل
  const NAV = [
    { href: '/#services', label: 'بنساعد في إيه' },
    { href: '/#how', label: 'إزاي بنشتغل' },
    { href: '/#faq', label: 'أسئلة' },
  ];

  /**
   * v9.2 [R2-B1]: زر تواصل 44×44 في رأس كل صفحة عامة على الموبايل (≤ 600px) قبل زر القائمة:
   * واتساب إن وُجد رقم فعلي، وإلا الاتصال إن وُجد تليفون، وإلا لا شيء. يختفي على الشاشات الأكبر (القائمة فيها التواصل).
   */
  function headerContactHtml(ps, wa) {
    if (wa) {
      return `<a class="pub-head-contact pub-head-contact--wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" aria-label="واتساب (يفتح في نافذة جديدة)">${iconSvg('whatsapp', 22)}</a>`;
    }
    if (ps.org_phone) {
      return `<a class="pub-head-contact" href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" aria-label="اتصال بالتليفون">${iconSvg('phone', 22)}</a>`;
    }
    return '';
  }

  /** v9.2: صورة موضوع/إجابة (SVG داخلي من pictos.js، زخرفية: الكلمة بجانبها هي الاسم) */
  function pictoHtml(id, cls = 'pub-pic') {
    return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${PICTOS[id] || ''}</svg>`;
  }

  /** v9.2 (P3): الشاشة الأولى — 8 مربعات بصورة وكلمة، كل واحد رابط مباشر لأول سؤال في موضوعه */
  function startTilesHtml() {
    return `<ul class="pub-pick" id="start-tiles">${TOPICS.map(
      (t) =>
        `<li><a class="pub-pick-tile" id="tile-${t.key}" href="/intake?topic=${t.key}" data-cta="intake" data-topic="${t.key}" data-say="${esc(t.say)}">${pictoHtml(t.picto)}<b>${esc(t.label)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</a></li>`,
    ).join('')}</ul>`;
  }

  // v9.2 [R2-B2]: صف «طرق تانية» بكلام محايد (أسماء لا أفعال): «إحنا نكلمك» دائمًا، «واتساب» برقم فعلي فقط، «طلبك فين؟»
  const WAY_SAY = {
    callback: 'إحنا نكلمكم ببلاش: اضغطوا هنا، واكتبوا الرقم.',
    whatsapp: 'ابعتولنا على واتساب، كتابة أو رسالة صوتية.',
    follow: 'طلبك فين: لو بعتولنا طلب قبل كده.',
  };
  function waysTilesHtml(ps, wa) {
    const items = [
      `<li><a class="pub-pick-way pub-pick-way--callback" href="/intake?mode=callback&amp;entry=home_callback" data-cta="intake" data-say="${esc(WAY_SAY.callback)}">${pictoHtml('callme')}<b>إحنا نكلمك</b></a></li>`,
    ];
    if (wa) {
      items.push(
        `<li><a class="pub-pick-way pub-pick-way--wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" data-say="${esc(WAY_SAY.whatsapp)}">${pictoHtml('whatsapp')}<b>واتساب</b><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></li>`,
      );
    }
    items.push(`<li data-follow><a class="pub-pick-way pub-pick-way--follow" href="/portal" data-say="${esc(WAY_SAY.follow)}">${pictoHtml('follow')}<b>طلبك فين؟</b></a></li>`);
    return `<ul class="pub-pick-ways" data-n="${items.length}">${items.join('')}</ul>`;
  }

  /** ما يُقال بعد المربعات حين يُضغط «بالصوت» (الأجزاء الموجودة فقط، بصيغة الجمع المحايدة) */
  function startOutro(wa) {
    return ['ولو عايزين إحنا نكلمكم ببلاش، اضغطوا "إحنا نكلمك".', wa ? 'أو ابعتولنا على واتساب.' : '', 'أو اعرفوا طلبكم وصل لفين.'].filter(Boolean).join(' ');
  }

  /** روابط ملفات نموذج الطلب (نفس أرقام الإصدار في صفحة /intake) لتحميلها مسبقًا وهي تختار */
  function prefetchUrls() {
    const urls = [];
    const add = (rel) => {
      const v = assetVersion(path.join(pub, rel));
      if (v) urls.push(`${rel}?v=${v}`);
    };
    add('/assets/js/public/intake.js');
    try {
      urls.push(...preloadClosure(path.join(pub, '/assets/js/public/intake.js'), pub));
    } catch {
      /* بلا تحميل مسبق */
    }
    add('/assets/css/v91-b-forms.css');
    return urls.join(' ');
  }

  function headerHtml(ps, current) {
    const wa = waLink(ps.whatsapp_digits, SITE_GREETING);
    const links = NAV.map(
      (n) => `<a class="pub-nav-link" href="${n.href}"${n.path && n.path === current ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`,
    ).join('');
    return `<header class="pub-header" data-pub-header>
  <div class="pub-container pub-header-inner">
    <a class="pub-brand" href="/" aria-label="${esc(ps.site_name)} — الصفحة الرئيسية">
      <span class="pub-logo">${brandSvg({ size: 26 })}</span>
      <span class="pub-brand-text"><strong>${esc(ps.program_name || ps.org_name)}</strong><span>${esc(ps.org_legal_name || ps.org_name)}</span></span>
    </a>
    ${headerContactHtml(ps, wa)}<button class="pub-menu-toggle" type="button" aria-expanded="false" aria-controls="pub-nav" data-pub-menu>
      ${iconSvg('menu', 22, 'pub-menu-open')}${iconSvg('x', 22, 'pub-menu-close')}<span class="pub-sr">القائمة</span>
    </button>
    <nav id="pub-nav" class="pub-nav" aria-label="القائمة الرئيسية">
      ${links}
      <a class="pub-nav-link pub-nav-portal" href="/portal"${current === '/portal' ? ' aria-current="page"' : ''}>${iconSvg('search', 18)}<span>تابعي طلبك</span></a>
      <a class="pub-btn pub-btn-gold pub-nav-cta" href="/intake" data-cta="intake"${current === '/intake' ? ' aria-current="page"' : ''}>${iconSvg('message', 18)}<span>احكيلنا مشكلتك</span></a>
    </nav>
  </div>
</header>`;
  }

  /** زرا الاتصال في البطل والتواصل: [واتساب] (إن وُجد رقم) و[اتصال]؛ بلا واتساب يأخذ «اتصال» العرض كله */
  function contactButtonsHtml(ps, wa) {
    const out = [];
    if (wa) {
      out.push(
        `<a class="pub-btn pub-btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">${iconSvg('whatsapp', 20)}<span>واتساب</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`,
      );
    }
    if (ps.org_phone) {
      out.push(`<a class="pub-btn pub-btn-call" href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}">${iconSvg('phone', 20)}<span>اتصال</span></a>`);
    }
    return out.length ? `<div class="pub-contact-buttons${out.length === 1 ? ' is-single' : ''}">${out.join('')}</div>` : '';
  }

  function contactListHtml(ps, wa) {
    const items = [];
    if (ps.org_address) {
      items.push(
        `<li>${iconSvg('mapPin', 20)}<span><span class="pub-contact-label">العنوان</span>${esc(ps.org_address)}` +
          (ps.map_url ? ` <a href="${esc(ps.map_url)}" target="_blank" rel="noopener noreferrer">افتحي الخريطة<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>` : '') +
          '</span></li>',
      );
    }
    if (ps.org_phone) {
      items.push(
        `<li>${iconSvg('phone', 20)}<span><span class="pub-contact-label">التليفون</span><a href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></span></li>`,
      );
    }
    if (wa) {
      items.push(
        `<li>${iconSvg('whatsapp', 20)}<span><span class="pub-contact-label">واتساب</span><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">ابعتيلنا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></span></li>`,
      );
    }
    if (ps.org_email) {
      items.push(`<li>${iconSvg('mail', 20)}<span><span class="pub-contact-label">البريد الإلكتروني</span><a href="mailto:${esc(ps.org_email)}" dir="ltr" class="pub-ltr">${esc(ps.org_email)}</a></span></li>`);
    }
    if (ps.office_hours) {
      items.push(`<li>${iconSvg('clock', 20)}<span><span class="pub-contact-label">مواعيدنا</span>${esc(ps.office_hours)}</span></li>`);
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
      <p class="pub-footer-desktop">بنساعد الأرامل وأسر الأيتام في مشاكلهم القانونية مجانًا، مع محامين متطوعين ومتعاونين، وفريق المؤسسة بيراجع كل حاجة.</p>
      ${socialHtml(ps)}
    </div>
    <nav class="pub-footer-col pub-footer-desktop" aria-label="روابط الموقع">
      <h2>روابط</h2>
      <ul>
        <li><a href="/">الصفحة الرئيسية</a></li>
        <li><a href="/about">عن البرنامج</a></li>
        <li><a href="/intake" data-cta="intake">احكيلنا مشكلتك</a></li>
        <li><a href="/portal">تابعي طلبك</a></li>
        <li><a href="/#faq">أسئلة</a></li>
      </ul>
    </nav>
    <nav class="pub-footer-col pub-footer-desktop" aria-label="السياسات">
      <h2>السياسات</h2>
      <ul>
        <li><a href="/privacy">سياسة الخصوصية</a></li>
        <li><a href="/terms">شروط الاستخدام</a></li>
        <li><a href="/data-deletion">حذف البيانات</a></li>
      </ul>
    </nav>
    <div class="pub-footer-col pub-footer-contact pub-footer-desktop">
      <h2>تواصل معنا</h2>
      ${contactListHtml(ps, wa)}
    </div>
  </div>
  <!-- الموبايل (B91-07): «روابط مهمة» مطوية في سطر واحد -->
  <details class="pub-footer-more">
    <summary><span>روابط مهمة</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
    <ul>
      <li><a href="/about">عن البرنامج</a></li>
      <li><a href="/privacy">سياسة الخصوصية</a></li>
      <li><a href="/terms">شروط الاستخدام</a></li>
      <li><a href="/data-deletion">حذف البيانات</a></li>
      <li><a href="/app">دخول فريق العمل والمحامين</a></li>
    </ul>
  </details>
  ${ps.org_phone ? `<p class="pub-footer-call">للمساعدة: <a href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></p>` : ''}
  <div class="pub-footer-bottom">
    <div class="pub-container pub-footer-bottom-inner">
      <span>© ${year} ${esc(ps.org_legal_name || ps.org_name)}. جميع الحقوق محفوظة.</span>
      <a href="/app" class="pub-staff-link">دخول فريق العمل والمحامين</a>
    </div>
  </div>
</footer>`;
  }

  // v9.1 (B91-07): كل مربع رابط كامل (≥ 56px). v9.2: إلى /intake?topic=… (نفس مفاتيح مربعات الشاشة الأولى)
  function servicesHtml() {
    return SERVICES.map((s) => {
      const href = `/intake?topic=${encodeURIComponent(s.topic)}`;
      return `<li class="pub-service" id="service-${s.key}">
  <a class="pub-tile-link" href="${href}" data-cta="intake">
    <span class="pub-service-icon">${iconSvg(s.icon, 24)}</span>
    <span class="pub-tile-text"><strong>${esc(s.title)}</strong><span>${esc(s.example)}</span></span>
  </a>
</li>`;
    }).join('\n');
  }

  /** سياق إجابات الأسئلة من إعدادات المؤسسة الحالية (واتساب، الدخول بالكود، المدد التقريبية) */
  function faqContext(ps) {
    const s = app.settings.all();
    const n = (k, d) => (Number.isFinite(Number(s[k])) && Number(s[k]) > 0 ? Math.round(Number(s[k])) : d);
    return {
      wa: !!ps.whatsapp_digits,
      otp: !!app.messaging?.portalOtpAvailable?.(),
      review: n('portal_eta_review_days', 2),
      min: n('portal_eta_study_min_days', 7),
      max: n('portal_eta_study_max_days', 14),
    };
  }

  /** الأسئلة الخمسة بإجاباتها الحالية (نفس المصدر للصفحة ولـ JSON-LD) */
  function faqItems(ps) {
    const ctx = faqContext(ps);
    return FAQ.map((f) => ({ q: f.q, a: typeof f.a === 'function' ? f.a(ctx) : String(f.a), more: f.more || null }));
  }

  function faqHtml(ps) {
    return faqItems(ps)
      .map(
        (f) => `<details class="pub-faq-item">
  <summary><span>${esc(f.q)}</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
  <div class="pub-faq-body"><p>${esc(f.a)}</p>${f.more ? `<p><a href="${f.more.href}">${esc(f.more.label)}</a></p>` : ''}</div>
</details>`,
      )
      .join('\n');
  }

  function audienceHtml() {
    return AUDIENCE.map((a) => `<li><span class="pub-tile">${iconSvg(a.icon, 24)}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join('');
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
      knowsAbout: SERVICES.filter((s) => s.seo).map((s) => s.seo),
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
        mainEntity: faqItems(ps).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
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
      `<meta name="theme-color" content="${app.brand?.themeColor?.() || '#0f4c5c'}" />${app.brand?.headStyle?.() || ''}`,
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
      // v9.1 (B91-11): خط عربي مستضاف محليًا (الوزن العادي يُحمّل مبكرًا) وبيانات الصفحة دون طلب /api/meta
      '<link rel="preload" href="/assets/fonts/plex-arabic-400.woff2" as="font" type="font/woff2" crossorigin />',
      `<script type="application/json" id="bm-public">${jsonForScript(publicBlock(ps))}</script>`,
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

  /**
   * v9.1 (B91-11): أنماط الشاشة الأولى (بين @critical-start و@critical-end في public-site.css) مضغوطة بأرقام إصدار الخطوط،
   * تُضمَّن في <head> الصفحات التي تضع <!--site:critical-css--> فتُرسم الشاشة الأولى دون انتظار ملف الأنماط.
   */
  // كتل مسماة (/* @critical-start:legal */) تُضاف للكتل العامة في الصفحات التي تطلبها (<!--site:critical-css:legal-->):
  // الصفحات القانونية وصفحة 404 (تُفتح غالبًا لأول مرة من رابط واتساب مقطوع) ترسم عنوانها و«بالمختصر» دون انتظار الملف.
  const criticalCache = new Map(); // الاسم ← { key, css }
  function criticalCss(name = '') {
    const file = path.join(pub, 'assets/css/public-site.css');
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return '';
    }
    const key = `${st.size}-${st.mtimeMs}`;
    const hit = criticalCache.get(name);
    if (hit && hit.key === key) return hit.css;
    const text = fs.readFileSync(file, 'utf8');
    let css = '';
    for (const m of text.matchAll(/@critical-start(?::([a-z0-9-]+))?[^*]*\*\/([\s\S]*?)\/\*\s*@critical-end\s*\*\//g)) {
      if (!m[1] || m[1] === name) css += m[2];
    }
    css = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};,>])\s*/g, '$1')
      .replace(/:\s+/g, ':')
      .replace(/;}/g, '}')
      .replace(/url\("?(\/assets\/[^")?#]+)"?\)/g, (m, url) => {
        const v = assetVersion(path.join(pub, url));
        return v ? `url("${url}?v=${v}")` : m;
      })
      .replace(/<\/?style/gi, '')
      .trim();
    criticalCache.set(name, { key, css });
    return css;
  }

  /** يبني الصفحة كاملة من القالب: القيم، الرأس، التذييل، ووسوم SEO. */
  function renderPage(file, req, pagePath, extra = {}) {
    const ps = publicSettings();
    const base = baseUrl(req);
    // v9.1 (B91-12): الرسالة الجاهزة بكلامها هي، بسيطة ومحايدة (تصلح للأم والأب)
    const wa = waLink(ps.whatsapp_digits, SITE_GREETING);
    // v9.2: المؤسسة مقفولة الآن؟ (null = لا جدول مضبوط: لا نقول «مقفولين» بلا معلومة)
    const open = app.portal?.officeOpen ? app.portal.officeOpen(app.settings.get('office_hours_schedule')) : null;
    const view = {
      ...ps,
      base_url: base,
      year: String(new Date().getFullYear()),
      whatsapp_url: wa,
      // للنصوص البديلة في القوالب (<!--#if no_whatsapp-->) حين لا يوجد رقم واتساب فعلي بعد
      no_whatsapp: wa ? '' : '1',
      whatsapp_deletion_url: waLink(ps.whatsapp_digits, 'السلام عليكم، ده «طلب حذف بياناتي» من عندكم. اسمي: '),
      org_phone_href: ps.org_phone_e164 || ps.org_phone,
      header: headerHtml(ps, pagePath),
      footer: footerHtml(ps, wa),
      contact_list: contactListHtml(ps, wa),
      socials: socialHtml(ps),
      services: servicesHtml(),
      faq: faqHtml(ps),
      programs: programsHtml(),
      brand_mark: brandSvg({ size: 120 }),
      // v9.1 (B91-07/B91-15): أجزاء الصفحة الرئيسية الجديدة
      audience: audienceHtml(),
      contact_buttons: contactButtonsHtml(ps, wa),
      icon_check: iconSvg('check', 20),
      icon_lock: iconSvg('lock', 20),
      icon_wallet: iconSvg('wallet', 20),
      icon_whatsapp: iconSvg('whatsapp', 20),
      icon_phone: iconSvg('phone', 20),
      office_hours_line: ps.office_hours ? `بنرد ${ps.office_hours}` : '',
      // v9.2 public (P3): الشاشة الأولى بالمربعات، وزر التواصل في الرأس، والتحميل المسبق لنموذج الطلب
      start_tiles: startTilesHtml(),
      ways_tiles: waysTilesHtml(ps, wa),
      header_contact: headerContactHtml(ps, wa),
      start_say_outro: startOutro(wa),
      prefetch_urls: file === 'index.html' ? prefetchUrls() : '',
      office_closed: open === false ? '1' : '',
      ...extra,
    };
    let html = renderTemplate(readTemplate(file), view);
    // v9.1 (B91-11): لا طلبات لخطوط جوجل من صفحات المستفيدين (الخط مستضاف في /assets/fonts) — يحمي من أي قالب قديم
    html = html.replace(/[ \t]*<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\s*\n?/g, '');
    const title = decodeEntities((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || ps.site_name).trim();
    const description = decodeEntities((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || ps.org_tagline).trim();
    // إن عرّف القالب وسم robots بنفسه لا نضيف وسمًا ثانيًا
    const noindex = extra.noindex && !/<meta name="robots"/.test(html);
    const head = headTags(ps, base, pagePath, { title, description, noindex, faq: pagePath === '/' });
    html = html.replace('<!--site:head-->', () => head);
    // v9.1 (B91-11): تعليقات القوالب للمطورين لا تُرسل لهاتف المستفيدة (بايتات بلا فائدة على باقة محدودة)
    html = html.replace(/<!--(?!site:)[\s\S]*?-->\s*/g, '');
    // <!--site:critical-css--> (الكتل العامة) أو <!--site:critical-css:legal--> (العامة + كتل «legal»)
    html = html.replace(/<!--site:critical-css(?::([a-z0-9-]+))?-->/, (m, name) => {
      const css = criticalCss(name || '');
      return css ? `<style>${css}</style>` : '';
    });
    return versionAssets(html);
  }

  /**
   * يضيف رقم إصدار الملف (?v=…) لروابط ملفات CSS وJS المحلية في الصفحة (أكبر ما يُنزَّل)،
   * فيخزّنها المتصفح سنة كاملة ويعيد تنزيلها فقط عند تغيّر محتواها (src/http.js).
   * الأيقونات وصور المشاركة تبقى بروابطها الثابتة (وسوم SEO).
   */
  function versionAssets(html) {
    // v9.1 (B91-11): الخطوط أيضًا، وروابط modulepreload لكل ما تستورده وحدة الصفحة فتُنزَّل كلها معًا من أول رحلة للخادم
    const entries = [];
    let out = html.replace(/<script type="module" src="(\/assets\/js\/[^"?#]+\.js)"/g, (m, url) => {
      entries.push(url);
      return m;
    });
    if (entries.length) {
      const seen = new Set(entries);
      const links = [];
      for (const url of entries) {
        for (const dep of preloadClosure(path.join(pub, url), pub)) {
          const bare = dep.split('?')[0];
          if (seen.has(bare)) continue;
          seen.add(bare);
          links.push(`<link rel="modulepreload" href="${dep}" />`);
        }
      }
      if (links.length) out = out.replace(/(\s*)<script type="module" src="/, (m, ws) => `${ws}${links.join(ws)}${m}`);
    }
    return out.replace(/\b(href|src)="(\/assets\/[^"?#]+\.(?:css|js|woff2))"/g, (m, attr, url) => {
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
  function servePage(req, res, file, pagePath, { optIn = false, noindex = false, noStore = false, headExtra = '' } = {}) {
    let html;
    try {
      if (optIn && !readTemplate(file).includes('{{{header}}}')) return false;
      html = renderPage(file, req, pagePath, { noindex });
    } catch (e) {
      if (e && e.code === 'ENOENT') return false; // يعود للمعالجة الافتراضية (404)
      throw e;
    }
    // (إصلاح 9.1) وسوم إضافية في <head> لهذا الطلب وحده (مثل preload لبيانات صفحة المتابعة)
    if (headExtra) html = html.replace('</head>', `${headExtra}\n  </head>`);
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
  const PRECACHE_SKIP = [/^\/assets\/js\/public\//, /^\/assets\/css\/public-(?:site|ui)\.css$/, /^\/assets\/img\/og-image\.png$/, /^\/assets\/fonts\/[^/]+\.txt$/];

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
      // v9.1 l-home (L-07): بنفس أرقام الإصدار التي تطلبها صفحة /app (?v=…) حتى تُخدم من المخزن دون الشبكة
      precache: assets
        .filter((a) => !PRECACHE_SKIP.some((re) => re.test(a.url)))
        .map((a) => {
          if (!/\.(?:css|js|woff2)$/.test(a.url)) return a.url;
          const ver = assetVersion(path.join(pub, a.url));
          return ver ? `${a.url}?v=${ver}` : a.url;
        }),
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

  app.site = { baseUrl, publicSettings, publicBlock, faqItems, renderPage, registerPage, servePage, validateSettings: validateSiteSettings, SERVICES, FAQ, PROGRAMS };
  return app.site;
}
