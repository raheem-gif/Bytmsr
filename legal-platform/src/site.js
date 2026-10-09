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
// v10 experience: اسم المكتب (تحقق الحروف العادية وسطرا الشعار النصي)
import { isPlainName, collapseSpaces, PLAIN_NAME_ERROR, wordmarkParts } from './brand.js';
import { DEFAULT_PRIMARY } from '../public/assets/js/lib/brand-color.js';
// v9.2 public: مصدر واحد للمواضيع (الشاشة الأولى، «بنساعد في إيه؟»، النموذج، الإدارة) وصورها
import { TOPICS } from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';
// v11 gate-public: مفردات نوع الخدمة (charity | paid) وكعكة bm_seg ومواضيع الأفراد والشركات — نفس الوحدة في الخادم والمتصفح
import { parseSegment, segmentFromCookie, SEG_COOKIE, SEG_COOKIE_MAX_AGE, PAID_TOPICS, paidWaPrefill, COMPANY_PREFILL } from '../public/assets/js/public/segment.js';
// v11 gate-public (L11-13): نصوص الأفراد والشركات (تُضمَّن في صفحاتهم فقط داخل bm-copy)
import { intakePaidCopy, INTAKE_TITLES, INTAKE_PAGE, PORTAL_PAID, PORTAL_LOGIN_PAID, DELETION_PAID_PREFILL } from './site-copy-paid.js';

// قيم احتياطية للحقول الإلزامية فقط (الاسم الرسمي واسم البرنامج) إن أُفرغت.
// أما الحقول الاختيارية (الإشهار، العنوان، الهاتف، فيسبوك، المواعيد) فإفراغها من الإعدادات يخفيها من الموقع،
// ولا تُستعاد قيمتها الافتراضية رغمًا عن الإدارة.
const FALLBACK = {
  org_legal_name: 'مؤسسة بيوت مصر لدعم الأرامل والأيتام',
  site_program_name: 'الدعم القانوني',
  // v10 experience (L-02): اسم المكتب كما يراه العملاء — قيمة مفرغة تعرض الافتراضي
  brand_name: DEFAULT_SETTINGS.brand_name,
  brand_short_name: DEFAULT_SETTINGS.brand_short_name,
};

/** v9.1 (B91-12): رسالة واتساب الجاهزة في الموقع، بسيطة ومحايدة (تصلح للأم والأب) */
const SITE_GREETING = 'السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.';

/** أجزاء HTML يولّدها الخادم نفسه؛ وحدها تُدرج دون تهريب بصيغة {{{key}}} (أي مفتاح آخر يُهرَّب دائمًا) */
const RAW_KEYS = new Set(['brand_inline', 'header', 'footer', 'contact_list', 'socials', 'services', 'faq', 'programs', 'brand_mark', 'audience', 'contact_buttons', 'icon_check', 'icon_lock', 'icon_wallet', 'icon_whatsapp', 'icon_phone', 'start_tiles', 'ways_tiles', 'header_contact',
  // v11 gate-public: شاشة الاختيار وصفحة الأفراد والشركات
  'gate_layer', 'gate_preload', 'paid_cross', 'paid_co_row', 'paid_topics', 'paid_ways', 'paid_how', 'companies_band', 'paid_trust', 'paid_faq', 'paid_contact_list', 'paid_contact_buttons']);

// ───────────── v11 gate-public: نوع الخدمة في الموقع العام (L11-02…08، L11-51/52) ─────────────
/** ترتيب بطاقتي شاشة الاختيار (L11-09، O-20): «خدمات الأفراد والشركات» أولًا كما كتب صاحب الطلب — سطر واحد للتبديل */
export const GATE_ORDER = ['paid', 'charity'];
/** معاملات الحملة المسموح بنقلها لروابط البطاقتين (G11-19)، كل قيمة ≤ 200 حرف وتُرمَّز من جديد */
export const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'fbclid', 'gclid'];
// v11 gate-public (G11-02، L11-42): أسماء يكتبها الناس أو تُلصق من واتساب (بالشرطة الأخيرة وبدونها، والعربية مرمّزة
// بالحروف الكبيرة والصغيرة) ← الصفحة الرسمية. /company (بوابة الشركات) لا يتغير.
export const ALIASES = {
  '/khayri/': '/khayri',
  '/services/': '/services',
  '/charity': '/khayri',
  '/khairy': '/khayri',
  '/khayry': '/khayri',
  '/khairi': '/khayri',
  '/kheiri': '/khayri',
  '/%D8%AE%D9%8A%D8%B1%D9%8A': '/khayri', // /خيري
  '/khadamat': '/services',
  '/afrad': '/services',
  '/%D8%AE%D8%AF%D9%85%D8%A7%D8%AA': '/services', // /خدمات
  '/companies': '/services#companies',
  '/sharikat': '/services#companies',
  '/%D8%B4%D8%B1%D9%83%D8%A7%D8%AA': '/services#companies', // /شركات
};
/** العناوين والأوصاف (G11-05) */
export const TITLES = {
  charity: (b) => `الدعم القانوني للأرامل والأيتام وأسرهم — ${b}`,
  charityDesc: (legal) => `مساعدة قانونية مجانية وسرية للأرامل وأسر الأيتام من ${legal}: الورث والمعاش والنفقة والحضانة والسكن وفلوس الأيتام والورق الرسمي. احكيلنا مشكلتك برسالة صوتية أو كتابة.`,
  gate: (b) => `مساعدة قانونية مجانية وخدمات قانونية للأفراد والشركات — ${b}`,
  gateDesc: 'مساعدة قانونية مجانية وسرية للأرامل والأيتام وأسرهم، وخدمات قانونية بأتعاب واضحة للأفراد والشركات: استشارات وقضايا وعقود وإدارة قانونية للشركات.',
};
/** نصوص شاشة الاختيار (G11-12/13 + r2 P11: الكلام المسموع ينتهي بوصف الصورة) — لغة محايدة، لا أفعال مؤنثة */
export const GATE_COPY = {
  desc: 'اختاروا نوع الخدمة',
  intro: 'أهلًا بيكم. عندنا اختيارين، اضغطوا على اللي يناسبكم.',
  listen: 'بالصوت',
  listenAria: 'اسمعوا الكلام اللي في الصفحة',
  paid: {
    title: 'خدمات الأفراد والشركات',
    line: 'استشارات وقضايا وعقود بأتعاب واضحة، وإدارة قانونية للشركات',
    lineNoB2b: 'استشارات وقضايا وعقود بأتعاب واضحة',
    say: 'خدمات الأفراد والشركات: استشارات وقضايا وعقود، بأتعاب بنتفق عليها قبل أي شغل. دي الصورة اللي فيها الشنطة.',
  },
  charity: {
    title: 'خيري',
    kicker: 'مجاني',
    line: 'مساعدة قانونية مجانية للأرامل والأيتام وأسرهم',
    say: 'خيري: مساعدة قانونية ببلاش للأرامل والأيتام وأسرهم. دي الصورة اللي فيها الأم وابنها.',
  },
  links: { privacy: 'الخصوصية', terms: 'الشروط', company: 'دخول الشركات' },
};
/**
 * صورتا البطاقتين (L11-11، r2 P3): للخادم فقط (ليستا في pictos.js ولا في حزمة /intake)، بنفس أصناف الألوان pa/pb/pw.
 * gate_paid = شنطة كبيرة (pa) وشخص (pb) — بلا مبنى ولا مفتاح ولا شبابيك (المبنى كان يُقرأ «سكن وإيجار»).
 * gate_charity = أم بطرحة واسعة (pa) وطفل صغير وقلب صغير (pb).
 */
export const GATE_PICTOS = {
  gate_paid:
    '<g transform="translate(22 1) scale(0.6)" stroke="#fff" stroke-width="2.5"><circle class="pb" cx="24" cy="12" r="7.5"/><path class="pb" d="M8 45v-9a16 16 0 0 1 32 0v9Z"/></g>' +
    '<path class="pa" d="M13 20v-4.5a3.5 3.5 0 0 1 3.5-3.5h7a3.5 3.5 0 0 1 3.5 3.5V20h-3.6v-4.4h-6.8V20Z"/>' +
    '<rect class="pa" x="1.5" y="19" width="37" height="27" rx="4" stroke="#fff" stroke-width="2"/>' +
    '<rect class="pw" x="2.5" y="29" width="35" height="2.4"/><rect class="pb" x="16.5" y="26.5" width="7" height="7.5" rx="1.6" stroke="#fff" stroke-width="1.6"/>',
  gate_charity:
    '<g transform="translate(-4 5) scale(0.84)"><path class="pa" d="M24 3c-7 0-12 5.6-12 13 0 3.5 1 6.5 2.4 8.5L8 27.5c-3 2-4.5 5-4.5 9V45h41v-8.5c0-4-1.5-7-4.5-9l-6.4-3c1.4-2 2.4-5 2.4-8.5 0-7.4-5-13-12-13Z"/><ellipse class="pw" cx="24" cy="16" rx="6.2" ry="7.4"/></g>' +
    '<g transform="translate(21 17) scale(0.6)" stroke="#fff" stroke-width="2.5"><circle class="pb" cx="24" cy="17" r="7"/><path class="pb" d="M11 45v-6a13 13 0 0 1 26 0v6Z"/></g>' +
    '<g transform="translate(27 -1) scale(0.82)"><path class="pb" d="M12 21.3c-.5 0-1-.2-1.4-.5C5.1 16.5 1.5 13.3 1.5 9 1.5 5.9 3.9 3.5 6.9 3.5c2.1 0 3.9 1.1 5.1 2.8 1.2-1.7 3-2.8 5.1-2.8 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.5-9.1 11.8-.4.3-.9.5-1.4.5Z" stroke="#fff" stroke-width="2.5"/></g>',
};
/** أيقونات خطية لمواضيع الأفراد والشركات (L11-55، للخادم فقط) — نفس المفاتيح والترتيب */
export const PAID_TOPIC_ICONS = { inh: 'scroll', pen: 'landmark', guardianship: 'shieldCheck', alimony: 'wallet', custody: 'users', rent: 'home', papers: 'fileText', other: 'message' };

/** كتلة أنماط حرجة في public-site.css: تعليق يبدأ بـ @critical-start[:name] ثم الأنماط ثم تعليق @critical-end[:name] (الاسم m[1]، المحتوى m[2]) */
export const CRITICAL_RE = /\/\*\s*@critical-start(?::([a-z0-9-]+))?[^*]*\*\/([\s\S]*?)\/\*\s*@critical-end(?::[a-z0-9-]+)?\s*\*\//g;

/** طلب تخميني (تحميل مسبق أو معاينة رابط) لا يغيّر اختيار الزائر أبدًا (L11-07) */
export function isSpeculative(req) {
  const h = req?.headers || {};
  return /prefetch|prerender/i.test(String(h['sec-purpose'] || '')) || /prefetch|prerender/i.test(String(h.purpose || '')) || /preview/i.test(String(h['x-purpose'] || '')) || /prefetch/i.test(String(h['x-moz'] || ''));
}

/** الطلب عبر https (اتصال مشفّر مباشر، أو خلف وكيل موثوق TRUST_PROXY=1 يرسل X-Forwarded-Proto: https) */
export function isHttps(req) {
  if (req?.socket?.encrypted) return true;
  return process.env.TRUST_PROXY === '1' && String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
}

/** نوع الخدمة من كعكة bm_seg (أول ظهور يحسم، قيمة غير معروفة = لا شيء) */
export function cookieSide(req) {
  return segmentFromCookie(req?.headers?.cookie);
}

/**
 * جانب الصفحة (§5.7): side صريح (صفحة المتابعة بنبرة الطلب) › معامل seg صالح › الكعكة › fallback.
 */
export function sideOf(req, { param, side, fallback = 'charity' } = {}) {
  return parseSegment(side) || parseSegment(param) || cookieSide(req) || parseSegment(fallback) || 'charity';
}

/** معاملات الحملة المسموح بها من رابط الطلب، مرمّزة من جديد (≤ 200 حرف للقيمة) — '' أو '?utm_source=…' */
export function campaignQuery(url) {
  const out = new URLSearchParams();
  for (const k of CAMPAIGN_KEYS) {
    const val = url?.searchParams?.get(k);
    if (val) out.set(k, val.slice(0, 200));
  }
  const s = out.toString();
  return s ? `?${s}` : '';
}

/** الحد الأقصى لأطوال حقول الموقع (نفس حدود بطاقة الإعدادات في الواجهة) */
const SITE_TEXT_FIELDS = [
  // v10 experience (§4.1): اسم المكتب والاسم المختصر — حروف عادية فقط (isPlainName)
  ['brand_name', 'اسم المكتب كما يراه العملاء', 60, true, 'plain'],
  ['brand_short_name', 'الاسم المختصر', 24, true, 'plain'],
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
  for (const [key, label, max, required, kind] of SITE_TEXT_FIELDS) {
    take(key, (x) => {
      // v10 (CS-26): رموز التحكم ومحارف التنسيق غير المرئية تُرفض قبل القص (trim يزيل بعضها بصمت)
      if (kind === 'plain' && typeof x === 'string' && !isPlainName(x)) throw badRequest(PLAIN_NAME_ERROR);
      const s = v.str(x, label, { required, max }) ?? '';
      return kind === 'plain' ? collapseSpaces(s) : s;
    });
  }
  take('org_phone', (x) => {
    const s = v.str(x, 'هاتف المؤسسة', { max: 30 });
    if (s === null) return '';
    if (!normalizePhone(s)) throw badRequest('أدخل رقم هاتف صحيحًا مثل 01211114662');
    return s;
  });
  // v11 gate-public (L11-27، G11-33): هاتف خدمات الأفراد والشركات (اختياري؛ فارغ = هاتف المؤسسة) بنفس قواعد org_phone
  take('org_phone_paid', (x) => {
    const s = v.str(x, 'هاتف خدمات الأفراد والشركات', { max: 30 });
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
  // v11 gate-public (G11-04، r2 P28/S24): صفحة «خيري» بلا شاشة الاختيار (رابط الحملات وQR، canonical لنفسها) وصفحة الأفراد والشركات
  { path: '/khayri', file: 'index.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/services', file: 'services.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/intake', file: 'intake.html', priority: '0.9', changefreq: 'monthly' },
  { path: '/about', file: 'about.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/privacy', file: 'privacy.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/terms', file: 'terms.html', priority: '0.5', changefreq: 'yearly' },
  { path: '/data-deletion', file: 'data-deletion.html', priority: '0.4', changefreq: 'yearly' },
];

/** مسارات لا تُفهرس */
export const ROBOTS_DISALLOW = ['/app', '/p/', '/api/', '/setup', '/webhooks/', '/company']; // v10: + بوابة الشركات

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
  // v11 gate-public: شارة نوع الخدمة (⇄)، الشركات، السهم إلى الأمام (يشير لليسار في RTL)، الصوت
  swap: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  building: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  speaker: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
};

/** أيقونة SVG خطية كنص HTML (زخرفية: مخفية عن قارئات الشاشة). */
export function iconSvg(name, size = 22, cls = '') {
  const paths = ICONS[name] || ICONS.info;
  return (
    `<svg class="pub-icon${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    // v11 gate-public (V11-20): خط 1.75 مثل أيقونات المنصة
    `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    paths.map((d) => `<path d="${d}"/>`).join('') +
    '</svg>'
  );
}

/** v10 experience (X10-C5): العلامة = ميزان العدالة (نفس رسم ICONS.scale في المنصة وpublic/assets/img/favicon.svg). */
export function brandSvg({ size = 40, stroke = 'currentColor', label = '' } = {}) {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return (
    `<svg class="pub-mark-svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${a11y}>` +
    `<g fill="none" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/>' +
    '<path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>' +
    '</g></svg>'
  );
}

/**
 * v10 experience (X10-B2): اسم المكتب على سطرين دائمًا (المختصر ثم بقية الاسم) بخط النظام، معزول الاتجاه وبلغته
 * (<bdi class="pub-wordmark" dir="ltr" lang="en">)؛ اسم عربي تكتبه الإدارة يبقى معزولًا بلغته واتجاهه.
 */
export function wordmarkHtml(name, short, cls = 'pub-wordmark') {
  const { lead, rest } = wordmarkParts(name, short);
  return `<bdi class="${cls}" ${nameDirAttrs(`${lead}${rest}`)}><b>${esc(lead)}</b>${rest ? ` <span>${esc(rest)}</span>` : ''}</bdi>`;
}

/** v10 (مراجعة): اتجاه الاسم ولغته لقارئ الشاشة — لاتيني ltr/en، واسم عربي تكتبه الإدارة rtl/ar */
export function nameDirAttrs(name) {
  return /[\u0600-\u06FF]/.test(String(name || '')) ? 'dir="rtl" lang="ar"' : 'dir="ltr" lang="en"';
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

  // ───────────── v11 gate-public: الجانب والكعكة والصور (GP-0) ─────────────

  /** رابط صورة/ملف ثابت برقم إصداره (?v=…) فيُخزَّن في المتصفح دون إعادة تحقق (§5.10) */
  function imgUrl(rel) {
    const ver = assetVersion(path.join(pub, rel));
    return ver ? `${rel}?v=${ver}` : rel;
  }

  /**
   * يضع كعكة bm_seg (L11-07 r2): دائمة 180 يومًا (persist) من اختيار «خيري» و/khayri و/services وتحديث «/» لكعكة «خيري»،
   * ومؤقتة للجلسة من /intake?seg=… (رابط مُعاد إرساله لا يغيّر جانب الزائر لستة أشهر). لا تُكتب أبدًا لطلب HEAD
   * أو تحميل مسبق أو معاينة رابط. ليست HttpOnly (يكتبها landing.js في طريق «خيري» بلا شبكة) ولا تحمل أي بيانات شخصية.
   */
  function setSegCookie(req, res, side, { persist = false } = {}) {
    const seg = parseSegment(side);
    if (!seg || req?.method === 'HEAD' || isSpeculative(req)) return false;
    const parts = [`${SEG_COOKIE}=${seg}`, 'Path=/'];
    if (persist) parts.push(`Max-Age=${SEG_COOKIE_MAX_AGE}`);
    parts.push('SameSite=Lax');
    if (isHttps(req)) parts.push('Secure');
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
    res.setHeader('Set-Cookie', [...list.filter((c) => !c.startsWith(`${SEG_COOKIE}=`)), parts.join('; ')]);
    return true;
  }

  /** هل شاشة الاختيار مفعّلة؟ (site_gate_enabled، الافتراضي نعم — L11-27) */
  function gateEnabled() {
    return app.settings.get('site_gate_enabled') !== false;
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
    // v10 experience (L-02/L-08): اسم المكتب من مصدر واحد (app.brand) لكل العناوين ووسوم المشاركة
    const brandName = app.brand?.displayName ? app.brand.displayName() : pick('brand_name');
    const brandShort = app.brand?.shortName ? app.brand.shortName() : pick('brand_short_name');
    const address = pick('org_address');
    const phone = pick('org_phone');
    const phoneE164 = normalizePhone(phone) || '';
    const digits = waDigits(s);
    return {
      org_name: orgName,
      org_tagline: pick('org_tagline'),
      program_name: programName,
      // v10: عنوان الموقع = اسم المكتب (كان «الدعم القانوني — مؤسسة بيوت مصر»)
      site_name: brandName,
      brand_name: brandName,
      brand_short: brandShort,
      // مفتاح خام (RAW_KEYS): الاسم معزول الاتجاه ومعلَّم بالإنجليزية داخل الجمل العربية (X10-B2)
      brand_inline: `<bdi class="wordmark" ${nameDirAttrs(brandName)}>${esc(brandName)}</bdi>`,
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
   * v11 gate-public (§5.7): إعدادات الصفحة حسب جانبها — «خيري» = الرقم الأساسي كما في 10.0؛ الأفراد والشركات =
   * app.segments.publicDigits('paid') (رقمهم المُتحقق منه، أو الأساسي مع جملة الحجز، أو '' بلا واتساب) وهاتف
   * org_phone_paid ثم org_phone. greeting = جملة واتساب الجاهزة لأزرار الرأس والتواصل.
   */
  function sideSettings(ps, side) {
    if (side !== 'paid') return { ...ps, side: 'charity', greeting: SITE_GREETING };
    const s = app.settings.all();
    const own = typeof s.org_phone_paid === 'string' ? s.org_phone_paid.trim() : '';
    const phone = own || ps.org_phone;
    let digits = '';
    try {
      digits = app.segments?.publicDigits ? app.segments.publicDigits('paid') || '' : '';
    } catch {
      digits = '';
    }
    let greeting = paidWaPrefill(null);
    try {
      greeting = app.segments?.publicPrefill ? app.segments.publicPrefill('paid') || greeting : greeting;
    } catch {
      /* الجملة الافتراضية */
    }
    return { ...ps, side: 'paid', org_phone: phone, org_phone_e164: normalizePhone(phone) || '', whatsapp_digits: digits, whatsapp_display_number: '', greeting };
  }

  /**
   * v9.1 (B91-11): بيانات الصفحة العامة المضمّنة في <script type="application/json" id="bm-public"> (لا تُنفَّذ، ولا تحتاج CSP)
   * فتقرأها صفحات الطلب والمتابعة فورًا (words.js → publicData()) بدل انتظار /api/meta. ≤ 3 كيلوبايت.
   */
  function publicBlock(ps) {
    return {
      org_name: ps.org_name,
      site_name: ps.site_name,
      brand: { name: ps.brand_name, short: ps.brand_short },
      phone: ps.org_phone,
      phone_e164: ps.org_phone_e164,
      whatsapp_digits: ps.whatsapp_digits,
      office_hours: ps.office_hours,
      portal_otp_enabled: !!app.messaging?.portalOtpAvailable?.(),
      governorates: GOVERNORATES,
      areas: LEGAL_AREAS.map((a) => ({ code: a.code, label: PLAIN_AREAS[a.code] || a.label })),
      setup_required: !!app.system?.isSetupMode?.(),
      demo: !!config.demo,
      // v11 gate-public (§5.7): جانب الصفحة (أرقام واتساب والهاتف أعلاه لهذا الجانب)
      segment: ps.side === 'paid' ? 'paid' : 'charity',
    };
  }

  // ───────────── الأجزاء المشتركة ─────────────

  // v9.1 (B91-07): كلام بسيط في القائمة؛ «عن البرنامج» والسياسات في «روابط مهمة» بالتذييل
  // v11 gate-public (G11-21): القائمة حسب الجانب؛ روابط الأقسام مجردة (#faq) في صفحة الجانب نفسها، وإلا /khayri#faq أو /services#faq
  const NAV = [
    { hash: '#services', label: 'بنساعد في إيه' },
    { hash: '#how', label: 'إزاي بنشتغل' },
    { hash: '#faq', label: 'أسئلة' },
  ];
  const NAV_PAID = [
    { hash: '#topics', label: 'مجالات الاستشارة' },
    { hash: '#how', label: 'كيف نعمل' },
    { hash: '#companies', label: 'للشركات', b2b: true },
    { hash: '#faq', label: 'أسئلة' },
  ];
  /** صفحات «خيري» الرئيسية (الشاشة الأولى بالمربعات) */
  const CHARITY_HOMES = new Set(['/', '/khayri']);
  /** صفحات بلا شارة نوع الخدمة (L11-14: التركيز على المهمة) */
  const NO_PILL = new Set(['/intake', '/portal']);

  /**
   * v9.2 [R2-B1]: زر تواصل 44×44 في رأس كل صفحة عامة على الموبايل (≤ 600px) قبل زر القائمة:
   * واتساب إن وُجد رقم فعلي، وإلا الاتصال إن وُجد تليفون، وإلا لا شيء. يختفي على الشاشات الأكبر (القائمة فيها التواصل).
   * v11: بأرقام جانب الصفحة وجملته الجاهزة (ps = sideSettings).
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

  /**
   * v11 gate-public (مراجعة): رابط «تغيير نوع الخدمة» — شاشة الاختيار (/?gate=1)، أو صفحة الجانب الآخر مباشرة حين تُوقف
   * الشاشة (site_gate_enabled=false يعرض «/» صفحة «خيري» دائمًا، فكان الرابط يعيد الزائر لنفس الصفحة بلا اختيار).
   */
  function switchHref(side) {
    if (gateEnabled()) return '/?gate=1';
    return side === 'paid' ? '/khayri' : '/services';
  }

  /** v11 (§5.9): شارة «خيري» / «أفراد وشركات» ← /?gate=1 (شاشة الاختيار من جديد؛ الكعكة لا تُمسح) */
  function segPillHtml(side) {
    const paid = side === 'paid';
    const aria = paid ? 'أنتم في: خدمات الأفراد والشركات. تغيير نوع الخدمة' : 'أنتم في: خيري. تغيير نوع الخدمة';
    return (
      `<a class="pub-seg-pill pub-seg-pill--${paid ? 'paid' : 'charity'}" href="${switchHref(side)}" aria-label="${aria}">` +
      `${iconSvg(paid ? 'briefcase' : 'heart', 16)}<span>${paid ? 'أفراد وشركات' : 'خيري'}</span>${iconSvg('swap', 16, 'pub-seg-pill-swap')}<span class="pub-seg-pill-change">تغيير</span></a>`
    );
  }

  /** v9.2: صورة موضوع/إجابة (SVG داخلي من pictos.js، زخرفية: الكلمة بجانبها هي الاسم) */
  function pictoHtml(id, cls = 'pub-pic') {
    return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${PICTOS[id] || ''}</svg>`;
  }

  /** v9.2 (P3): الشاشة الأولى — 8 مربعات بصورة وكلمة، كل واحد رابط مباشر لأول سؤال في موضوعه */
  function startTilesHtml() {
    return `<ul class="pub-pick" id="start-tiles">${TOPICS.map(
      (t) =>
        // v11 gate-public (L11-52): روابط «خيري» تحمل seg=charity (رجوع مرتين بعد تبديل الجانب لا يعطي الأرملة نموذج الأفراد)
        `<li><a class="pub-pick-tile" id="tile-${t.key}" href="/intake?seg=charity&topic=${t.key}" data-cta="intake" data-topic="${t.key}" data-say="${esc(t.say)}">${pictoHtml(t.picto)}<b>${esc(t.label)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</a></li>`,
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
      `<li><a class="pub-pick-way pub-pick-way--callback" href="/intake?seg=charity&amp;mode=callback&amp;entry=home_callback" data-cta="intake" data-say="${esc(WAY_SAY.callback)}">${pictoHtml('callme')}<b>إحنا نكلمك</b></a></li>`,
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

  /**
   * v11 gate-public (§5.9، G11-21): رأس الصفحة حسب جانبها (ps = sideSettings): علامة «EMAM إمام» الخضراء صورةً مخزّنة
   * (L11-05؛ الاسم النصي يبقى للقارئ الصوتي)، شارة نوع الخدمة (الرئيسيتان والسياسات و«عن البرنامج» و404 فقط)،
   * زر التواصل بأرقام الجانب، القائمة والزر الأساسي للجانب، و«تغيير نوع الخدمة» في قائمة الموبايل.
   */
  function headerHtml(ps, current, { pill = true } = {}) {
    const paid = ps.side === 'paid';
    const wa = waLink(ps.whatsapp_digits, ps.greeting || SITE_GREETING);
    const home = paid ? '/services' : '/';
    const onHome = paid ? current === '/services' : CHARITY_HOMES.has(current);
    const base = onHome ? '' : paid ? '/services' : '/khayri';
    const b2b = app.settings.get('b2b_enabled') !== false;
    const links = (paid ? NAV_PAID.filter((n) => !n.b2b || b2b) : NAV).map((n) => `<a class="pub-nav-link" href="${base}${n.hash}">${esc(n.label)}</a>`).join('');
    // v9.2 (S-25): الشاشة الأولى للصفحة الرئيسية بلا أفعال مؤنثة، ونفس اسم مربع «طلبك فين؟» تحت (مكان واحد = اسم واحد)
    const followLabel = paid ? 'متابعة طلب' : onHome ? 'طلبك فين؟' : 'تابعي طلبك';
    const cta = paid
      ? `<a class="pub-btn pub-btn-gold pub-nav-cta" href="/intake?seg=paid" data-cta="intake"${current === '/intake' ? ' aria-current="page"' : ''}>${iconSvg('message', 18)}<span>طلب استشارة</span></a>`
      : `<a class="pub-btn pub-btn-gold pub-nav-cta" href="/intake?seg=charity" data-cta="intake"${current === '/intake' ? ' aria-current="page"' : ''}>${iconSvg('message', 18)}<span>احكيلنا مشكلتك</span></a>`;
    return `<header class="pub-header" data-pub-header>
  <div class="pub-container pub-header-inner">
    <a class="pub-brand" href="${home}" aria-label="${esc(ps.brand_name)} — الصفحة الرئيسية">
      <img class="pub-mark" src="${imgUrl('/assets/img/emam-mark-green.svg')}" width="99" height="19" alt="" decoding="async" />
      ${wordmarkHtml(ps.brand_name, ps.brand_short)}
    </a>
    ${pill ? segPillHtml(ps.side) : ''}${headerContactHtml(ps, wa)}<button class="pub-menu-toggle" type="button" aria-expanded="false" aria-controls="pub-nav" data-pub-menu>
      ${iconSvg('menu', 22, 'pub-menu-open')}${iconSvg('x', 22, 'pub-menu-close')}<span class="pub-sr">القائمة</span>
    </button>
    <nav id="pub-nav" class="pub-nav" aria-label="القائمة الرئيسية">
      ${links}
      <a class="pub-nav-link pub-nav-portal" href="/portal"${current === '/portal' ? ' aria-current="page"' : ''}>${iconSvg('search', 18)}<span>${followLabel}</span></a>
      ${cta}${pill ? `\n      <a class="pub-nav-link pub-nav-gate" href="${switchHref(ps.side)}">تغيير نوع الخدمة</a>` : ''}
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

  /** v10 (مراجعة): رابط «دخول الشركات» فقط حين تكون خدمة الشركات مفعّلة وصفحة البوابة موجودة (لا رابط إلى 404) */
  function companyPortalOpen() {
    try {
      return app.settings.get('b2b_enabled') !== false && app.pageHandlers.has('/company') && fs.existsSync(path.join(pub, 'company.html'));
    } catch {
      return false;
    }
  }

  /** v11 (§5.9، V11-04 القاعدة 2): شعار المكتب الذهبي كاملًا على أرضية التذييل الغامقة — مؤجل التحميل، والاسم النصي للقارئ */
  function footerLogoHtml() {
    return `<img class="pub-footer-logo" src="${imgUrl('/assets/img/emam-logo-gold.svg')}" width="200" height="84" alt="" loading="lazy" decoding="async" />`;
  }

  function footerHtml(ps, wa) {
    if (ps.side === 'paid') return paidFooterHtml(ps, wa);
    const year = new Date().getFullYear();
    const company = companyPortalOpen();
    // مراجعة: «اختيار نوع الخدمة» يفتح الشاشة؛ حين تُوقف الشاشة يكفي رابط الجانب الآخر في القائمة نفسها
    const gateOn = gateEnabled();
    return `<footer class="pub-footer">
  <div class="pub-container pub-footer-grid">
    <div class="pub-footer-about">
      <a class="pub-brand pub-brand-light" href="/">
        ${footerLogoHtml()}
        <span class="pub-brand-lockup">${wordmarkHtml(ps.brand_name, ps.brand_short)}${ps.program_name ? `<span class="pub-brand-desc">${esc(ps.program_name)}</span>` : ''}</span>
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
        <li><a href="/intake?seg=charity" data-cta="intake">احكيلنا مشكلتك</a></li>
        <li><a href="/portal">تابعي طلبك</a></li>
        <li><a href="/khayri#faq">أسئلة</a></li>
        <li><a href="/services">خدمات الأفراد والشركات</a></li>
        ${gateOn ? '<li><a href="/?gate=1">اختيار نوع الخدمة</a></li>' : ''}
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
      <li><a href="/services">خدمات الأفراد والشركات</a></li>
      ${gateOn ? '<li><a href="/?gate=1">اختيار نوع الخدمة</a></li>' : ''}
      <li><a href="/app">دخول فريق العمل والمحامين</a></li>
      ${company ? '<li><a href="/company">دخول الشركات</a></li>' : ''}
    </ul>
  </details>
  ${ps.org_phone ? `<p class="pub-footer-call">للمساعدة: <a href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></p>` : ''}
  <div class="pub-footer-bottom">
    <div class="pub-container pub-footer-bottom-inner">
      <span>© ${year} ${esc(ps.org_legal_name || ps.org_name)}. جميع الحقوق محفوظة.</span>
      <span class="pub-footer-logins"><a href="/app" class="pub-staff-link">دخول فريق العمل والمحامين</a>${company ? '<a href="/company" class="pub-staff-link">دخول الشركات</a>' : ''}</span>
    </div>
  </div>
</footer>`;
  }

  /**
   * v11 gate-public (G11-23، r2 P19/S27): تذييل الأفراد والشركات — بلا بيانات الإشهار ولا اسم البرنامج الخيري؛
   * سطر © يبقى باسم الكيان القانوني (O-25 سؤال قبل الإطلاق). كلام بالجمع المهذب، وطريق «خيري» مجاني في الروابط.
   */
  function paidFooterHtml(ps, wa) {
    const year = new Date().getFullYear();
    const company = companyPortalOpen();
    const b2b = app.settings.get('b2b_enabled') !== false;
    const tel = ps.org_phone_e164 || ps.org_phone;
    return `<footer class="pub-footer">
  <div class="pub-container pub-footer-grid">
    <div class="pub-footer-about">
      <a class="pub-brand pub-brand-light" href="/services">
        ${footerLogoHtml()}
        <span class="pub-brand-lockup">${wordmarkHtml(ps.brand_name, ps.brand_short)}</span>
      </a>
      <p class="pub-footer-desktop">خدمات قانونية للأفراد والشركات، بأتعاب نتفق عليها معكم قبل أي عمل.</p>
      ${socialHtml(ps)}
    </div>
    <nav class="pub-footer-col pub-footer-desktop" aria-label="روابط الموقع">
      <h2>روابط</h2>
      <ul>
        <li><a href="/services">الصفحة الرئيسية</a></li>
        <li><a href="/intake?seg=paid" data-cta="intake">طلب استشارة</a></li>
        <li><a href="/portal">متابعة طلب</a></li>
        ${b2b ? '<li><a href="/services#companies">للشركات</a></li>' : ''}
        <li><a href="/khayri">خيري</a></li>
        ${gateEnabled() ? '<li><a href="/?gate=1">اختيار نوع الخدمة</a></li>' : ''}
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
      <h2>تواصلوا معنا</h2>
      ${paidContactListHtml(ps, wa)}
    </div>
  </div>
  <details class="pub-footer-more">
    <summary><span>روابط مهمة</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
    <ul>
      <li><a href="/privacy">الخصوصية</a></li>
      <li><a href="/terms">الشروط</a></li>
      <li><a href="/data-deletion">حذف البيانات</a></li>
      ${company ? '<li><a href="/company">دخول الشركات</a></li>' : ''}
      <li><a href="/app">دخول فريق العمل والمحامين</a></li>
    </ul>
  </details>
  ${ps.org_phone ? `<p class="pub-footer-call">للتواصل: <a href="tel:${esc(tel)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></p>` : ''}
  <div class="pub-footer-bottom">
    <div class="pub-container pub-footer-bottom-inner">
      <span>© ${year} ${esc(ps.org_legal_name || ps.org_name)}. جميع الحقوق محفوظة.</span>
      <span class="pub-footer-logins"><a href="/app" class="pub-staff-link">دخول فريق العمل والمحامين</a>${company ? '<a href="/company" class="pub-staff-link">دخول الشركات</a>' : ''}</span>
    </div>
  </div>
</footer>`;
  }

  /** v11 (G11-32): «تواصلوا معنا» للأفراد والشركات — نفس عناصر «كلمينا» بالجمع المهذب، وهاتف/واتساب هذا الجانب */
  function paidContactListHtml(ps, wa) {
    const items = [];
    const tel = ps.org_phone_e164 || ps.org_phone;
    if (ps.org_address) {
      items.push(
        `<li>${iconSvg('mapPin', 20)}<span><span class="pub-contact-label">العنوان</span>${esc(ps.org_address)}` +
          (ps.map_url ? ` <a href="${esc(ps.map_url)}" target="_blank" rel="noopener noreferrer">افتحوا الخريطة<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>` : '') +
          '</span></li>',
      );
    }
    if (ps.org_phone) items.push(`<li>${iconSvg('phone', 20)}<span><span class="pub-contact-label">الهاتف</span><a href="tel:${esc(tel)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></span></li>`);
    if (wa) items.push(`<li>${iconSvg('whatsapp', 20)}<span><span class="pub-contact-label">واتساب</span><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer">راسلونا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></span></li>`);
    if (ps.org_email) items.push(`<li>${iconSvg('mail', 20)}<span><span class="pub-contact-label">البريد الإلكتروني</span><a href="mailto:${esc(ps.org_email)}" dir="ltr" class="pub-ltr">${esc(ps.org_email)}</a></span></li>`);
    if (ps.office_hours) items.push(`<li>${iconSvg('clock', 20)}<span><span class="pub-contact-label">مواعيد العمل</span>${esc(ps.office_hours)}</span></li>`);
    return `<ul class="pub-contact-list">${items.join('')}</ul>`;
  }

  // v9.1 (B91-07): كل مربع رابط كامل (≥ 56px). v9.2: إلى /intake?topic=… (نفس مفاتيح مربعات الشاشة الأولى)
  // v11 gate-public (L11-52): + seg=charity
  function servicesHtml() {
    return SERVICES.map((s) => {
      const href = `/intake?seg=charity&topic=${encodeURIComponent(s.topic)}`;
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

  // ───────────── v11 gate-public: شاشة الاختيار (GP-1، G11-10…18 + r2) ─────────────

  /**
   * طبقة بيضاء معتمة فوق صفحة «خيري» (L11-03): أول عنصر في <body>، والصفحة تحتها <div id="site" inert>.
   * الشعار <img> من ملف مخزّن (L11-04، الذهبي الداكن للأرضية البيضاء)، ثم «بالصوت» (مخفي حتى يجد listen.js صوتًا عربيًا)،
   * ثم البطاقتان بترتيب GATE_ORDER، ثم ثلاثة روابط صغيرة. لا رقم ولا واتساب ولا مربعات.
   * query = معاملات الحملة المسموح بها ('' أو '?utm_…') تُضاف لرابطي البطاقتين فتعمل بلا JS.
   */
  function gateLayerHtml(ps, { query = '', siteTitle = '' } = {}) {
    const b2b = app.settings.get('b2b_enabled') !== false;
    const chev = iconSvg('chevronLeft', 20, 'gate-chev');
    const card = (seg) => {
      const c = GATE_COPY[seg];
      const href = seg === 'paid' ? `/services${query}` : `/khayri${query}`;
      const title = seg === 'charity' ? `<b class="gate-title">${c.title} <span class="gate-kicker">${c.kicker}</span></b>` : `<b class="gate-title">${c.title}</b>`;
      const line = seg === 'paid' && !b2b ? c.lineNoB2b : c.line;
      return (
        `<li><a class="gate-card gate-card--${seg}" href="${esc(href)}" data-seg="${seg}" data-say="${esc(c.say)}">` +
        `<span class="gate-pic"><svg class="pub-pic" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${GATE_PICTOS[`gate_${seg}`]}</svg></span>` +
        `<span class="gate-text">${title} <span class="gate-line">${line}</span></span>${chev}</a></li>`
      );
    };
    const links = [`<a href="/privacy">${GATE_COPY.links.privacy}</a>`, `<a href="/terms">${GATE_COPY.links.terms}</a>`];
    if (companyPortalOpen()) links.push(`<a href="/company">${GATE_COPY.links.company}</a>`);
    return `<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-desc" data-say-intro="${esc(GATE_COPY.intro)}" data-title-site="${esc(siteTitle)}">
      <div class="gate-inner">
        <h2 id="gate-title" class="gate-logo"><img src="${imgUrl('/assets/img/emam-logo-gold-deep.svg')}" width="300" height="125" alt="${esc(ps.brand_name)}" ${nameDirAttrs(ps.brand_name)} fetchpriority="high" decoding="async" /></h2>
        <p id="gate-desc" class="pub-sr">${GATE_COPY.desc}</p>
        <button class="gate-listen" type="button" hidden aria-pressed="false" aria-label="${GATE_COPY.listenAria}">${iconSvg('speaker', 20)}<span>${GATE_COPY.listen}</span></button>
        <ul class="gate-choices">${GATE_ORDER.map(card).join('')}</ul>
        <div class="gate-foot"><nav class="gate-links" aria-label="روابط">${links.join('')}</nav></div>
      </div>
    </div>`;
  }

  // ───────────── v11 gate-public: صفحة الأفراد والشركات /services (GP-3، G11-25…32) ─────────────

  /** «{review}» بالفصحى (G11-31): 1 «يوم عمل» · 2 «يومَي عمل» · 3–10 «n أيام عمل» · ≥ 11 «n يوم عمل» */
  function daysMsa(n) {
    const k = Math.max(1, Math.round(Number(n) || 0));
    if (k === 1) return 'يوم عمل';
    if (k === 2) return 'يومَي عمل';
    const r = k % 100;
    return r >= 3 && r <= 10 ? `${k} أيام عمل` : `${k} يوم عمل`;
  }

  /** الأسئلة الخمسة للأفراد والشركات (نفس المصدر للصفحة ولـ JSON-LD)؛ بلا «مجان» */
  function paidFaqItems(ps) {
    const ctx = faqContext(ps);
    const b2b = app.settings.get('b2b_enabled') !== false;
    return [
      {
        q: 'كم تكلّف الاستشارة؟',
        a: 'تختلف الأتعاب حسب الموضوع والمستندات. بعد مراجعة طلبكم نرسل لكم الأتعاب المقترحة مكتوبة على صفحة طلبكم، ولا نبدأ أي عمل قبل موافقتكم.',
      },
      {
        q: 'من يطّلع على بياناتي؟',
        a: 'فريقنا فقط. المحامي المختص يطّلع على وقائع الموضوع والمستندات اللازمة لدراسته، ولا يطّلع على رقم هاتفكم. ولا نبيع بياناتكم ولا نشاركها مع أي جهة.',
        more: { href: '/privacy#summary', label: 'سياسة الخصوصية' },
      },
      {
        q: 'متى يصلني الرد؟',
        a: `يراجع فريقنا طلبكم ويتواصل معكم غالبًا خلال ${daysMsa(ctx.review)}. ونحدد معكم موعد الرد بعد الاتفاق على الأتعاب، ونبلغكم بكل جديد ${ctx.wa ? 'على واتساب و' : ''}على صفحة طلبكم.`,
      },
      b2b
        ? {
            q: 'هل تقدمون خدماتكم للشركات؟',
            a: 'نعم. نقدم للشركات إدارة قانونية افتراضية باشتراك شهري، تشمل مراجعة العقود وشؤون الموظفين والامتثال، مع بوابة خاصة لمتابعة الطلبات.',
            more: { href: '/intake?seg=paid&mode=company&entry=company_band', label: 'اطلبوا عرضًا' },
          }
        : {
            q: 'هل يمكن أن تتصلوا بي بدلًا من الكتابة؟',
            a: 'نعم. اضغطوا «نتصل بكم» واكتبوا رقم الموبايل، وسنتصل بكم في الوقت الذي تختارونه.',
          },
      {
        q: 'أضعت رابط طلبي، ماذا أفعل؟',
        a: ctx.otp
          ? 'ادخلوا على «متابعة طلب» واكتبوا رقم الموبايل المسجّل على واتساب، وسيصلكم كود. أو اتصلوا بنا واذكروا رقم الطلب، وسنرسل لكم الرابط بعد التأكد من هويتكم.'
          : 'اتصلوا بنا واذكروا رقم الطلب، وسنرسل لكم الرابط بعد التأكد من هويتكم.',
        more: { href: '/portal', label: 'متابعة طلب' },
      },
    ];
  }

  function paidFaqHtml(ps) {
    return paidFaqItems(ps)
      .map(
        (f) => `<details class="pub-faq-item">
  <summary><span>${esc(f.q)}</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
  <div class="pub-faq-body"><p>${esc(f.a)}</p>${f.more ? `<p><a href="${esc(f.more.href)}"${f.more.href.startsWith('/intake') ? ' data-cta="intake"' : ''}>${esc(f.more.label)}</a></p>` : ''}</div>
</details>`,
      )
      .join('\n');
  }

  /** طريق «خيري» للعودة (r2 P2): صف 44px أول عنصر بعد السطر الفرعي — الاستثناء الوحيد لكلمة «مجاني» في صفحات الأفراد */
  function paidCrossHtml() {
    return (
      '<a class="pub-cross" id="pub-cross" href="/khayri">' +
      `<svg class="pub-cross-heart" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path class="pb" d="M12 21.3c-.5 0-1-.2-1.4-.5C5.1 16.5 1.5 13.3 1.5 9 1.5 5.9 3.9 3.5 6.9 3.5c2.1 0 3.9 1.1 5.1 2.8 1.2-1.7 3-2.8 5.1-2.8 3 0 5.4 2.4 5.4 5.5 0 4.3-3.6 7.5-9.1 11.8-.4.3-.9.5-1.4.5Z"/></svg>` +
      '<span class="gate-kicker">مجاني</span><span class="pub-cross-text">تبحثون عن مساعدة قانونية مجانية؟</span> <b class="pub-cross-go">خيري ‹</b></a>'
    );
  }

  /** صف «للشركات» (r2 P15) — فقط حين تكون خدمة الشركات مفعّلة */
  function paidCoRowHtml() {
    if (app.settings.get('b2b_enabled') === false) return '';
    return `<a class="pub-co-row" href="#companies"><span class="g-ico">${iconSvg('building', 18)}</span><span class="pub-co-text">للشركات: إدارتكم القانونية الافتراضية</span>${iconSvg('chevronLeft', 18, 'g-chev')}</a>`;
  }

  /** المواضيع الثمانية قائمة مجمّعة (L11-55): أيقونة خطية، العنوان من PAID_TOPICS، سطر واحد تحته، وسهم — نفس المفاتيح والترتيب */
  function paidTopicsHtml() {
    return `<ul class="g-list on-white pub-topic-list" id="topic-list">${TOPICS.map((t) => {
      const p = PAID_TOPICS[t.key] || { label: t.label, wa_desc: '' };
      const sub = p.sub || p.wa_desc;
      return `<li id="service-${t.key}"><a class="g-row" href="/intake?topic=${t.key}&seg=paid" data-cta="intake" data-topic="${t.key}"><span class="g-ico">${iconSvg(PAID_TOPIC_ICONS[t.key] || 'message', 18)}</span><span class="g-main"><span class="g-title">${esc(p.label)}</span>${sub ? `<span class="g-sub">${esc(sub)}</span>` : ''}</span>${iconSvg('chevronLeft', 18, 'g-chev')}</a></li>`;
    }).join('')}</ul>`;
  }

  /** «نتصل بكم» · «واتساب» (أرقام هذا الجانب فقط؛ يختفي بلا رقم) · «متابعة طلب» — نفس مربعات «خيري» بكلام الجمع */
  function paidWaysHtml(ps, wa) {
    const items = [
      `<li><a class="pub-pick-way pub-pick-way--callback" href="/intake?seg=paid&amp;mode=callback&amp;entry=home_callback" data-cta="intake">${pictoHtml('callme')}<b>نتصل بكم</b></a></li>`,
    ];
    if (wa) {
      items.push(
        `<li><a class="pub-pick-way pub-pick-way--wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">${pictoHtml('whatsapp')}<b>واتساب</b><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></li>`,
      );
    }
    items.push(`<li data-follow><a class="pub-pick-way pub-pick-way--follow" href="/portal">${pictoHtml('follow')}<b>متابعة طلب</b></a></li>`);
    return `<ul class="pub-pick-ways" data-n="${items.length}">${items.join('')}</ul>`;
  }

  /** «كيف نعمل؟» (G11-28): ثلاث خطوات؛ «وعلى واتساب» فقط مع رقم واتساب لهذا الجانب */
  function paidHowHtml(wa) {
    const steps = [
      ['أرسلوا موضوعكم', 'كتابةً أو برسالة صوتية، مع صور المستندات إن وُجدت.'],
      ['نتفق على الأتعاب', 'يراجع فريقنا طلبكم ويرسل لكم الأتعاب المقترحة كتابةً قبل أي عمل.'],
      ['يعمل محامٍ متخصص على طلبكم', `ويصلكم الرأي القانوني مكتوبًا على صفحة طلبكم${wa ? ' وعلى واتساب' : ''}، ونتابع معكم الخطوات.`],
    ];
    return steps.map(([b, s], i) => `<li><span class="pub-how-num" aria-hidden="true">${i + 1}</span><div><strong>${b}</strong><span>${s}</span></div></li>`).join('');
  }

  /** شريط الشركات «إدارتكم القانونية الافتراضية» (G11-29) — يختفي كله حين تُوقف خدمة الشركات */
  function companiesBandHtml(ps) {
    if (app.settings.get('b2b_enabled') === false) return '';
    const digits = ps.whatsapp_digits;
    const tel = ps.org_phone_e164 || ps.org_phone;
    const rows = [
      ['fileText', 'مراجعة العقود وصياغتها واتفاقيات السرية'],
      ['users', 'شؤون الموظفين والإنذارات والامتثال'],
      ['shieldCheck', 'ذاكرة قانونية لعقودكم وتراخيصكم، مع تذكير قبل كل موعد'],
      ['clock', 'مواعيد رد وتسليم محددة في كل باقة'],
    ];
    const more = digits
      ? `<a class="pub-band-more" href="${esc(waLink(digits, COMPANY_PREFILL))}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">أو راسلونا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`
      : ps.org_phone
        ? `<span class="pub-band-more">أو اتصلوا بنا: <a href="tel:${esc(tel)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a></span>`
        : '';
    return `<section id="companies" class="pub-section pub-band-wrap" aria-labelledby="companies-title">
        <div class="pub-container">
          <div class="pub-band">
            <p class="pub-band-eyebrow">للشركات</p>
            <h2 id="companies-title" class="pub-band-title">إدارتكم القانونية الافتراضية</h2>
            <p class="pub-band-text">فريق قانوني متكامل لشركتكم باشتراك شهري. ترسلون الطلب من بوابة واحدة، وتعرفون موعد الرد والتسليم قبل الإرسال.</p>
            <ul class="pub-band-list">${rows.map(([i, s]) => `<li>${iconSvg(i, 20)}<span>${s}</span></li>`).join('')}</ul>
            <p class="pub-band-plans">الباقات شهرية حسب حجم شركتكم واحتياجها، ونرسل لكم العرض كتابةً.</p>
            <div class="pub-band-actions">
              <a class="pub-btn pub-btn-band-gold" href="/intake?seg=paid&amp;mode=company&amp;entry=company_band" data-cta="intake">اطلبوا عرضًا لشركتكم</a>
              ${companyPortalOpen() ? '<a class="pub-btn pub-btn-on-dark" href="/company">دخول بوابة الشركات</a>' : ''}
            </div>
            ${more}
          </div>
        </div>
      </section>`;
  }

  /** «التزامنا معكم» (G11-30): قائمة مجمّعة واحدة بأربعة صفوف */
  function paidTrustHtml() {
    const rows = [
      ['lock', 'سرية تامة', 'لا يطّلع على بياناتكم ومستنداتكم إلا فريقنا والمحامي المختص بقدر ما يحتاجه، ولا نشاركها مع أي جهة.'],
      ['wallet', 'أتعاب واضحة قبل البدء', 'نرسل لكم الأتعاب المقترحة كتابةً على صفحة طلبكم، ولا نبدأ أي عمل قبل موافقتكم.'],
      ['gavel', 'محامون متخصصون', 'محامون مقيّدون بنقابة المحامين، متخصصون في مجال طلبكم، ويراجع فريقنا كل رد قبل أن يصلكم.'],
      ['fileText', 'متابعة من صفحة واحدة', 'صفحة خاصة بطلبكم تتابعون منها كل جديد وترسلون المستندات.'],
    ];
    return `<ul class="g-list on-white pub-trust-list">${rows.map(([i, t, s]) => `<li class="pub-trust-row"><span class="g-ico">${iconSvg(i, 18)}</span><span class="g-main"><span class="g-title">${t}</span><span class="g-sub">${s}</span></span></li>`).join('')}</ul>`;
  }

  /** زرا التواصل في «تواصلوا معنا»: واتساب (بأرقام هذا الجانب) واتصال */
  function paidContactButtonsHtml(ps, wa) {
    const out = [];
    if (wa) out.push(`<a class="pub-btn pub-btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">${iconSvg('whatsapp', 20)}<span>واتساب</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    if (ps.org_phone) out.push(`<a class="pub-btn pub-btn-call" href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}">${iconSvg('phone', 20)}<span>اتصال</span></a>`);
    return out.length ? `<div class="pub-contact-buttons${out.length === 1 ? ' is-single' : ''}">${out.join('')}</div>` : '';
  }

  function audienceHtml() {
    return AUDIENCE.map((a) => `<li><span class="pub-tile">${iconSvg(a.icon, 24)}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join('');
  }

  function programsHtml() {
    return PROGRAMS.map((p) => `<li><strong>«${esc(p.name)}»</strong><span>${esc(p.text)}</span></li>`).join('');
  }

  // ───────────── JSON-LD ─────────────

  function jsonLd(ps, base, pagePath, { title, description, faq, ld = 'charity' }) {
    if (ld === 'org') return jsonForScript({ '@context': 'https://schema.org', '@graph': [gateOrgNode(ps, base)] });
    if (ld === 'paid') return paidJsonLd(ps, base, pagePath, { title, description, faq });
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
      // v10 (L-08): الكيان القانوني باسمه الرسمي، واسم المكتب الذي يراه الناس اسمًا بديلًا
      name: ps.org_legal_name || ps.org_name,
      alternateName: ps.brand_name || ps.org_name,
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
      name: ps.brand_name,
      brand: { '@type': 'Brand', name: ps.brand_name },
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
      isPartOf: { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: ps.brand_name, inLanguage: 'ar-EG', publisher: { '@id': orgId } },
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

  function postalAddress(ps) {
    const region = ps.org_address ? GOVERNORATES.find((g) => ps.org_address.includes(g)) : undefined;
    return ps.org_address ? { '@type': 'PostalAddress', streetAddress: ps.org_address, addressLocality: region, addressRegion: region, addressCountry: 'EG' } : undefined;
  }

  /**
   * v11 gate-public (L11-06، r2 P28/S24): «/» في حالة شاشة الاختيار = عقدة Organization وحدها (محتوى «خيري» الكامل
   * وأسئلته في /khayri؛ شاشة فوق المحتوى لا تكون صفحته الرسمية).
   */
  function gateOrgNode(ps, base) {
    const sameAs = [ps.org_facebook_url, ps.org_instagram_url].filter(Boolean);
    return {
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: ps.org_legal_name || ps.org_name,
      alternateName: ps.brand_name || ps.org_name,
      url: `${base}/`,
      logo: `${base}/assets/img/icon-512.png`,
      telephone: ps.org_phone_e164 || undefined,
      email: ps.org_email || undefined,
      address: postalAddress(ps),
      sameAs: sameAs.length ? sameAs : undefined,
    };
  }

  /**
   * v11 gate-public (G11-04 r2): /services = LegalService للأفراد والشركات (#paid-services) + WebPage + أسئلتها؛
   * بلا عقدة NGO حتى تحدد المؤسسة الكيان الذي يتعاقد مع العملاء (r2 P19، O-25).
   */
  function paidJsonLd(ps, base, pagePath, { title, description, faq }) {
    const svcId = `${base}/services#paid-services`;
    const knows = [...Object.values(PAID_TOPICS).map((t) => t.seo).filter(Boolean), 'الطلاق والخلع'];
    if (app.settings.get('b2b_enabled') !== false) knows.push('إدارة قانونية للشركات');
    const service = {
      '@type': 'LegalService',
      '@id': svcId,
      name: ps.brand_name,
      brand: { '@type': 'Brand', name: ps.brand_name },
      url: `${base}/services`,
      image: `${base}/assets/img/og-image.png`,
      logo: `${base}/assets/img/icon-512.png`,
      telephone: ps.org_phone_e164 || undefined,
      email: ps.org_email || undefined,
      address: postalAddress(ps),
      areaServed: { '@type': 'Country', name: 'مصر' },
      availableLanguage: 'ar',
      knowsAbout: knows,
    };
    const page = {
      '@type': 'WebPage',
      '@id': `${base}${pagePath}#webpage`,
      url: `${base}${pagePath}`,
      name: title,
      description,
      inLanguage: 'ar-EG',
      isPartOf: { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: ps.brand_name, inLanguage: 'ar-EG' },
      about: { '@id': svcId },
    };
    const graph = [service, page];
    if (faq) {
      graph.push({
        '@type': 'FAQPage',
        '@id': `${base}${pagePath}#faq`,
        mainEntity: paidFaqItems(ps).map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      });
    }
    return jsonForScript({ '@context': 'https://schema.org', '@graph': graph });
  }

  function headTags(ps, base, pagePath, { title, description, noindex, faq, ld, canonicalPath }) {
    const canonical = `${base}${canonicalPath || pagePath}`;
    const image = `${base}/assets/img/og-image.png`;
    const imageAlt = `${ps.brand_name}: ${ps.org_tagline || 'دعم قانوني للأرامل والأيتام وأسرهم'}`;
    return [
      `<link rel="canonical" href="${esc(canonical)}" />`,
      noindex ? '<meta name="robots" content="noindex, follow" />' : '',
      `<meta name="theme-color" content="${app.brand?.themeColor?.() || DEFAULT_PRIMARY}" />${app.brand?.headStyle?.() || ''}`,
      '<meta name="format-detection" content="telephone=no" />',
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="${esc(ps.brand_name)}" />`,
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
      `<script type="application/ld+json">${jsonLd(ps, base, canonicalPath || pagePath, { title, description, faq, ld })}</script>`,
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
    // v11 gate-public: العلامة تبدأ التعليق نفسه (/* @critical-start…)، فتعليق يذكر «@critical-start:legal» وسط الملف لا يفتح كتلة؛
    // والكتل المسماة بعد علامة H-G2 تُغلق بـ /* @critical-end:<name> */ (CRITICAL_RE مصدر واحد للخادم والاختبارات)
    for (const m of text.matchAll(CRITICAL_RE)) {
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

  const RENDER_CONTROL_KEYS = new Set(['side', 'gate', 'canonical', 'ld', 'faq', 'campaign', 'company']);

  /**
   * v11 gate-public (GP-5، G11-05): عنوان /intake ووصفه ونصوصه الثابتة (تحميل بطيء، متصفح قديم، بلا JavaScript) حسب الجانب؛
   * «خيري» = نصوص 10.0 حرفيًا. company = شاشة طلب عرض الشركات (?mode=company في صفحة الأفراد والشركات).
   */
  function intakeView(ps, side, company) {
    const paid = side === 'paid';
    const t = INTAKE_PAGE[paid ? 'paid' : 'charity'];
    return {
      intake_title: !paid ? `احكيلنا مشكلتك — ${ps.site_name}` : company ? INTAKE_TITLES.company(ps.brand_name) : INTAKE_TITLES.paid(ps.brand_name),
      intake_description: !paid
        ? `احكيلنا مشكلتك القانونية برسالة صوتية أو بالكتابة، وصوّري الورق من الموبايل. الخدمة من ${ps.org_legal_name} مجانية وسرّية، والمحامي مش بيشوف رقمك.`
        : company
          ? INTAKE_TITLES.companyDesc
          : INTAKE_TITLES.paidDesc,
      intake_slow: t.slow,
      intake_old: t.old,
      intake_nojs_h1: t.nojsH1,
      intake_nojs: t.nojs,
      intake_call: t.call,
    };
  }

  /** v11 gate-public (G11-52، P1): صفحة 404 حسب جانب الزائر — «خيري» = نص 10.0 حرفيًا */
  function notFoundView(side) {
    if (side !== 'paid') {
      return { nf_h1: 'الصفحة دي مش موجودة', nf_text: 'ممكن الرابط يكون ناقص أو اتقطع منه حتة وهو بيتنسخ من واتساب.', nf_h2: 'تحبي تعملي إيه؟', nf_follow: 'تابعي طلبك', nf_new: 'احكيلنا مشكلتك', nf_new_href: '/intake', nf_home_href: '/', nf_call: 'للمساعدة كلمينا:' };
    }
    return { nf_h1: 'الصفحة غير موجودة', nf_text: 'قد يكون الرابط ناقصًا، أو انقطع جزء منه عند نسخه.', nf_h2: 'ماذا تريدون أن تفعلوا؟', nf_follow: 'متابعة طلب', nf_new: 'طلب استشارة', nf_new_href: '/intake?seg=paid', nf_home_href: '/services', nf_call: 'للمساعدة اتصلوا بنا:' };
  }

  /** v11 gate-public (G11-47، P1): نصوص /portal الثابتة حسب جانب الزائر (والباقي في bm-copy لـ portal-login.js) */
  function portalLoginView(ps, side) {
    if (side !== 'paid') {
      return {
        pl_title: `متابعة طلبك — ${ps.brand_name}`,
        pl_desc: `ارجعي لصفحة طلبك عند ${ps.brand_name}: افتحيها من الموبايل ده، أو كلمينا وهنبعتلك الرابط.`,
        pl_h1: 'تابعي طلبك',
        pl_loading: 'بنجهّز الصفحة…',
        pl_nojs: 'الصفحة دي محتاجة تشغيل JavaScript. ممكن تكلمنا على طول وهنبعتلك رابط صفحتك:',
      };
    }
    return {
      pl_title: `متابعة طلبكم — ${ps.brand_name}`,
      pl_desc: `تابعوا طلبكم لدى ${ps.brand_name}: افتحوا صفحة الطلب بكود يصلكم على واتساب، أو تواصلوا معنا لنرسل لكم الرابط.`,
      pl_h1: PORTAL_LOGIN_PAID.h1,
      pl_loading: 'جارٍ تحميل الصفحة…',
      pl_nojs: 'تحتاج هذه الصفحة إلى تشغيل JavaScript. يمكنكم التواصل معنا مباشرة لنرسل لكم رابط صفحتكم:',
    };
  }

  /** v11 gate-public (G11-46): عنوان صفحة المتابعة ونصوصها الثابتة بنبرة الطلب (side من H-G1) — «خيري» = نص 10.0 حرفيًا */
  function portalView(ps, side) {
    if (side !== 'paid') {
      return {
        pv_title: `متابعة طلبك — ${ps.brand_name}`,
        pv_desc: `صفحتك الخاصة لمتابعة طلبك لدى ${ps.brand_name}: المطلوب منك، وصل طلبك لفين، الرد، المواعيد، والرسائل.`,
        pv_loading: 'بنجهّز صفحتك…',
        pv_nojs: 'الصفحة دي محتاجة تشغيل JavaScript في المتصفح. ممكن تكلمنا على طول:',
      };
    }
    return {
      pv_title: `متابعة طلبكم — ${ps.brand_name}`,
      pv_desc: `صفحة طلبكم الخاصة لدى ${ps.brand_name}: المطلوب منكم، وحالة الطلب، والرد، والمواعيد، والرسائل.`,
      pv_loading: PORTAL_PAID.loading,
      pv_nojs: 'تحتاج هذه الصفحة إلى تشغيل JavaScript في المتصفح. يمكنكم التواصل معنا مباشرة:',
    };
  }

  /** v11 gate-public (L11-13، H-G1): bm-copy لصفحة /p/<رمز> بنبرة الأفراد والشركات أو المحايدة (app.js يضيفها بعد bm-portal-data) */
  function portalCopyBlock() {
    return `<script type="application/json" id="bm-copy">${jsonForScript(PORTAL_PAID)}</script>`;
  }

  /** v11 gate-public (L11-13): <script type="application/json" id="bm-copy"> لصفحة /intake للأفراد والشركات (لا تُنفَّذ؛ CSP كما هي) */
  function intakeCopyBlock() {
    return `<script type="application/json" id="bm-copy">${jsonForScript(intakePaidCopy({ companyPortal: companyPortalOpen(), leadCss: imgUrl('/assets/css/v11-lead.css') }))}</script>`;
  }

  /** v11 gate-public: أجزاء /services (G11-25…32) */
  function paidView(ps, wa) {
    return {
      paid_cross: paidCrossHtml(),
      paid_co_row: paidCoRowHtml(),
      paid_topics: paidTopicsHtml(),
      paid_ways: paidWaysHtml(ps, wa),
      paid_hours: ps.office_hours ? `مواعيد العمل: ${ps.office_hours}` : '',
      paid_how: paidHowHtml(wa),
      companies_band: companiesBandHtml(ps),
      paid_trust: paidTrustHtml(),
      paid_faq: paidFaqHtml(ps),
      paid_contact_list: paidContactListHtml(ps, wa),
      paid_contact_buttons: paidContactButtonsHtml(ps, wa),
      prefetch_urls: prefetchUrls(),
    };
  }

  /**
   * يبني الصفحة كاملة من القالب: القيم، الرأس، التذييل، ووسوم SEO.
   * v11 gate-public: extra.side ('charity'|'paid') صريح وإلا جانب الكعكة (ثم «خيري»)؛ extra.gate = حالة شاشة الاختيار في «/»؛
   * extra.canonical = مسار canonical إن اختلف عن pagePath؛ extra.ld = 'org'|'paid'|'charity'؛ extra.faq = أسئلة JSON-LD؛
   * extra.campaign = معاملات الحملة لبطاقتي الشاشة. الصفحة تعتمد على الكعكة: ردها يحمل Vary: Cookie (req.bmVary).
   */
  function renderPage(file, req, pagePath, extra = {}) {
    if (req) req.bmVary = 'Cookie';
    const side = sideOf(req, { side: extra.side });
    const ps = sideSettings(publicSettings(), side);
    const base = baseUrl(req);
    // v9.1 (B91-12): الرسالة الجاهزة بكلامها هي، بسيطة ومحايدة (تصلح للأم والأب)؛ v11: جملة الحجز للأفراد والشركات
    const wa = waLink(ps.whatsapp_digits, ps.greeting);
    // v9.2: المؤسسة مقفولة الآن؟ (null = لا جدول مضبوط: لا نقول «مقفولين» بلا معلومة)
    const open = app.portal?.officeOpen ? app.portal.officeOpen(app.settings.get('office_hours_schedule')) : null;
    const gate = !!extra.gate;
    const charityTitle = TITLES.charity(ps.brand_name);
    const pill = !NO_PILL.has(pagePath);
    const view = {
      ...ps,
      base_url: base,
      year: String(new Date().getFullYear()),
      whatsapp_url: wa,
      // للنصوص البديلة في القوالب (<!--#if no_whatsapp-->) حين لا يوجد رقم واتساب فعلي بعد
      no_whatsapp: wa ? '' : '1',
      whatsapp_deletion_url: waLink(ps.whatsapp_digits, side === 'paid' ? DELETION_PAID_PREFILL : 'السلام عليكم، ده «طلب حذف بياناتي» من عندكم. اسمي: '),
      org_phone_href: ps.org_phone_e164 || ps.org_phone,
      // v11 gate-public: الجانب، شاشة الاختيار، العنوان
      side,
      home_title: gate ? TITLES.gate(ps.brand_name) : charityTitle,
      home_description: gate ? TITLES.gateDesc : TITLES.charityDesc(ps.org_legal_name),
      gate_layer: gate ? gateLayerHtml(ps, { query: extra.campaign || '', siteTitle: charityTitle }) : '',
      gate_class: gate ? ' has-gate' : '',
      site_inert: gate ? ' inert' : '',
      gate_preload: gate ? `<link rel="preload" as="image" href="${imgUrl('/assets/img/emam-logo-gold-deep.svg')}" fetchpriority="high" />` : '',
      critical_suffix: gate ? ':gate' : '',
      header: headerHtml(ps, pagePath, { pill }),
      footer: footerHtml(ps, wa),
      // v11 gate-public: قائمة التواصل بكلام الجانب (نماذج /intake الاحتياطية والصفحات القانونية)
      contact_list: side === 'paid' ? paidContactListHtml(ps, wa) : contactListHtml(ps, wa),
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
      prefetch_urls: file === 'index.html' || file === 'services.html' ? prefetchUrls() : '',
      office_closed: open === false ? '1' : '',
      ...(file === 'services.html' ? paidView(ps, wa) : {}),
      ...(file === 'intake.html' ? intakeView(ps, side, !!extra.company) : {}),
      ...(file === '404.html' ? notFoundView(side) : {}),
      ...(file === 'portal-login.html' ? portalLoginView(ps, side) : {}),
      ...(file === 'portal.html' ? portalView(ps, side) : {}),
    };
    // قيم إضافية من المستدعي (noindex…)؛ مفاتيح التحكم أعلاه لا تُكتب فوق قيمها المحسوبة
    for (const [k, val] of Object.entries(extra)) if (val !== undefined && !RENDER_CONTROL_KEYS.has(k)) view[k] = val;
    let html = renderTemplate(readTemplate(file), view);
    // v9.1 (B91-11): لا طلبات لخطوط جوجل من صفحات المستفيدين (الخط مستضاف في /assets/fonts) — يحمي من أي قالب قديم
    html = html.replace(/[ \t]*<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\s*\n?/g, '');
    const title = decodeEntities((/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || ps.site_name).trim();
    const description = decodeEntities((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || ps.org_tagline).trim();
    // إن عرّف القالب وسم robots بنفسه لا نضيف وسمًا ثانيًا
    const noindex = extra.noindex && !/<meta name="robots"/.test(html);
    // v11: أسئلة «خيري» في JSON-LD على صفحة «خيري» الرئيسية فقط (/khayri و«/» لكعكة «خيري»)، وأسئلة الأفراد على /services
    const faq = extra.faq ?? (file === 'services.html' || (CHARITY_HOMES.has(pagePath) && !gate));
    const ld = extra.ld || (gate ? 'org' : file === 'services.html' ? 'paid' : 'charity');
    const head = headTags(ps, base, pagePath, { title, description, noindex, faq, ld, canonicalPath: extra.canonical });
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
    // v11 gate-public (L11-51، r2 S11): الرأس والشارة والقائمة والتذييل تتبع كعكة bm_seg، فالصفحة خاصة بالمتصفح (private)
    // ويتغير ردها بالكعكة (Vary: Accept-Encoding, Cookie) حتى لا يخدم وسيط تخزين جانبًا لزائر من الجانب الآخر.
    res.setHeader('Cache-Control', noStore ? 'no-store' : 'private, no-cache');
    // مضغوطة (gzip) لمن يقبلها: الموقع العام يُفتح غالبًا من هواتف بباقات بيانات محدودة
    sendBody(res, 200, html, { req, vary: 'Cookie' });
  }

  /**
   * يسجل صفحة عامة تُبنى من قالب بنفس الرأس والتذييل ووسوم SEO.
   * optIn: لا تُعالج الصفحة إلا إذا احتوى ملفها على {{{header}}} (لصفحات الوحدات الأخرى مثل /portal).
   */
  function registerPage(pagePath, file, { optIn = false, noindex = false } = {}) {
    app.pageHandlers.set(pagePath, (req, res) => servePage(req, res, file, pagePath, { optIn, noindex }));
  }

  // ───────────── v11 gate-public: مسارات الجانبين (GP-0/GP-1، L11-06…08) ─────────────

  /**
   * «/»: شاشة الاختيار فوق صفحة «خيري» إلا لكعكة «خيري» (r2 P1: «خيري» وحدها تتخطى الشاشة؛ كعكة الأفراد أو لا كعكة
   * أو قيمة غريبة = الشاشة من جديد، رد 200 واحد بلا تحويل ولا Set-Cookie). /?gate=1 = الشاشة دائمًا (noindex).
   * مفتاح الإيقاف (site_gate_enabled=false) = صفحة «خيري» دائمًا ولا تُجدَّد الكعكة (r2 S20).
   */
  function serveHome(req, res, url) {
    const askGate = url?.searchParams?.get('gate') === '1';
    // (G11-02، P1) صيغة الحملات القديمة /?topic=<مفتاح صالح> ← النموذج مباشرة (302) بجانب الكعكة إن وُجدت؛ مفتاح غير
    // معروف = «/» كالعادة. الهدف ثابت: المفتاح من TOPICS نفسها، والجانب كلمة من القائمة البيضاء، والحملة مرمّزة من جديد
    const topic = askGate ? null : TOPICS.find((t) => t.key === url?.searchParams?.get('topic'));
    if (topic) {
      const seg = cookieSide(req);
      res.setHeader('Vary', 'Cookie');
      return redirectTo(res, url, `/intake?topic=${topic.key}${seg ? `&seg=${seg}` : ''}`, 302);
    }
    const on = gateEnabled();
    const cookie = cookieSide(req);
    const gate = on && (askGate || cookie !== 'charity');
    const refresh = !gate && on && cookie === 'charity';
    if (refresh) setSegCookie(req, res, 'charity', { persist: true });
    const html = renderPage('index.html', req, '/', {
      side: 'charity',
      gate,
      campaign: gate ? campaignQuery(url) : '',
      canonical: gate ? '/' : '/khayri',
      noindex: askGate,
      // landing.js يعيد الكعكة لجانب الصفحة بعد الرجوع من ذاكرة bfcache فقط في الصفحات التي يكتب الخادم كعكتها
      seg_sync: refresh ? '1' : '',
    });
    sendHtml(req, res, html);
    return true;
  }

  /** /khayri: صفحة «خيري» بلا شاشة (رابط الحملات وQR)، canonical لنفسها، وكعكة «خيري» دائمة */
  function serveKhayri(req, res) {
    setSegCookie(req, res, 'charity', { persist: true });
    sendHtml(req, res, renderPage('index.html', req, '/khayri', { side: 'charity', seg_sync: '1' }));
    return true;
  }

  /** /services: صفحة الأفراد والشركات، وكعكة الأفراد دائمة (تختار رأس الصفحات القانونية و/intake فقط؛ «/» يعرض الشاشة) */
  function serveServices(req, res) {
    setSegCookie(req, res, 'paid', { persist: true });
    sendHtml(req, res, renderPage('services.html', req, '/services', { side: 'paid' }));
    return true;
  }

  /**
   * /intake: الجانب = seg في الرابط › الكعكة › segment_website_default (§5.7). seg صالح يختلف عن الكعكة يكتب كعكة جلسة فقط
   * (L11-07 r2 S25: رابط مُعاد إرساله لا يقلب جانب الزائر لستة أشهر)، ونفس القيمة لا تكتب شيئًا فتبقى الكعكة الدائمة.
   */
  function serveIntake(req, res, url) {
    const param = parseSegment(url?.searchParams?.get('seg'));
    const cookie = cookieSide(req);
    const side = sideOf(req, { param, fallback: app.settings.get('segment_website_default') });
    if (param && param !== cookie) setSegCookie(req, res, param, { persist: false });
    const paid = side === 'paid';
    const company = paid && url?.searchParams?.get('mode') === 'company';
    let html;
    try {
      html = renderPage('intake.html', req, '/intake', {
        side,
        company,
        canonical: paid ? '/intake?seg=paid' : '/intake',
        // الأفراد والشركات: بيانات LegalService الخاصة بهم (بلا عقدة NGO، r2 P19) وبلا أسئلة «خيري»
        ...(paid ? { ld: 'paid', faq: false } : {}),
      });
    } catch (e) {
      if (e && e.code === 'ENOENT') return false;
      throw e;
    }
    // v11 gate-public (GP-5): نصوص الأفراد والشركات للنموذج — في صفحتهم فقط، فصفحة «خيري» كما في 10.0 بايتًا ببايت
    if (paid) html = html.replace('</head>', () => `${intakeCopyBlock()}
  </head>`);
    sendHtml(req, res, html);
    return true;
  }

  /**
   * يخدم قالب صفحة بالرأس والتذييل المشتركين. يعيد false (ليتولى المسار المعالجة الافتراضية) إن لم يوجد الملف،
   * أو إن كان optIn ولم يحتوِ القالب على {{{header}}}. pagePath هو المسار الظاهر في canonical والقائمة،
   * ولصفحات الروابط الخاصة (/p/<رمز>) يُمرَّر مسار عام بلا الرمز حتى لا يُكتب الرمز في وسوم الصفحة.
   */
  function servePage(req, res, file, pagePath, { optIn = false, noindex = false, noStore = false, headExtra = '', side } = {}) {
    let html;
    try {
      if (optIn && !readTemplate(file).includes('{{{header}}}')) return false;
      // v11 gate-public (r2 S2): side صريح (صفحة المتابعة بنبرة طلبها، H-G1) وإلا جانب الكعكة
      html = renderPage(file, req, pagePath, { noindex, side });
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
  // v11 gate-public (GP-0): معالجات خاصة بدل العامة لصفحات الجانبين (مسارات مطابقة تمامًا، L11-42)
  app.pageHandlers.set('/', serveHome);
  app.pageHandlers.set('/khayri', serveKhayri);
  app.pageHandlers.set('/services', serveServices);
  app.pageHandlers.set('/intake', serveIntake);
  // «عن البرنامج» صفحة البرنامج الخيري: برأس «خيري» دائمًا (G11-24)
  app.pageHandlers.set('/about', (req, res) => servePage(req, res, 'about.html', '/about', { side: 'charity' }));
  // صفحة «متابعة طلب» (وحدة المراسلة) تستخدم الرأس والتذييل المشتركين إن وضعت {{{header}}} و{{{footer}}} في قالبها
  // v11 gate-public (G11-47، P1): بجانب الكعكة، ونصوص الأفراد والشركات في bm-copy لصفحتهم فقط
  if (!app.pageHandlers.has('/portal')) {
    app.pageHandlers.set('/portal', (req, res) => {
      const side = sideOf(req);
      const headExtra = side === 'paid' ? `<script type="application/json" id="bm-copy">${jsonForScript(PORTAL_LOGIN_PAID)}</script>` : '';
      return servePage(req, res, 'portal-login.html', '/portal', { optIn: true, noindex: true, side, headExtra });
    });
  }

  /**
   * v11 gate-public (G11-02، P1): تحويل لمسار داخلي ثابت (لا مضيف ولا مسار من الطلب) ومعاملات الحملة المسموح بها فقط،
   * مرمّزة من جديد. HEAD مثل GET. no-cache: الهدف لا يتغير لكن لا نريد تحويلًا قديمًا محفوظًا في وسيط.
   */
  function redirectTo(res, url, target, code = 301) {
    const [p, hash] = target.split('#');
    const q = campaignQuery(url);
    res.statusCode = code;
    res.setHeader('Location', `${p}${q && p.includes('?') ? `&${q.slice(1)}` : q}${hash ? `#${hash}` : ''}`);
    res.setHeader('Cache-Control', 'no-cache');
    res.end();
    return true;
  }

  // /index.html ← / (مسار واحد لكل صفحة)؛ v11: معاملات الحملة لا تضيع
  app.pageHandlers.set('/index.html', (req, res, url) => redirectTo(res, url, '/'));

  for (const [from, to] of Object.entries(ALIASES)) {
    const forms = new Set([from, from.toLowerCase()]);
    if (!from.endsWith('/')) for (const f of [...forms]) forms.add(`${f}/`);
    for (const f of forms) if (!app.pageHandlers.has(f)) app.pageHandlers.set(f, (req, res, url) => redirectTo(res, url, to));
  }

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
  // v11 gate-public (L11-58، دفاعي): قصاصات الشعار النقطية لا تُخزَّن في هواتف الفريق أبدًا
  const PRECACHE_SKIP = [/^\/assets\/js\/public\//, /^\/assets\/css\/public-(?:site|ui)\.css$/, /^\/assets\/img\/og-image\.png$/, /^\/assets\/fonts\/[^/]+\.txt$/, /^\/assets\/img\/emam-(?:full|mark)-.*\.(?:png|webp)$/];

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
      // v10 experience (L-03): صفحة «لا يوجد اتصال» باسم واجهة المنصة (المكتب، أو المؤسسة حين يُوقف)
      .replace("'__ORG_NAME__'", () => jsonForScript(app.brand?.staffChromeName ? app.brand.staffChromeName().short : ps.org_name));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    // يجب أن يتحقق المتصفح من وجود إصدار جديد في كل مرة
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  });

  // ───────────── v10 experience (L-40, X10-B5): ملفا PWA ديناميكيان ─────────────
  // /manifest.webmanifest (فريق العمل والمحامون، نطاق /app) و/company.webmanifest (بوابة الشركات، نطاق /company).
  // القالب = public/manifest.webmanifest (أسماء 9.2 تبقى حين يُوقف brand_in_staff_app)، ولون الشريط = الدرجة 700 الحالية.
  function manifestFor(kind) {
    let tpl;
    try {
      tpl = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
    } catch {
      return null;
    }
    const theme = app.brand?.themeColor?.() || DEFAULT_PRIMARY;
    if (kind === 'company') {
      const short = app.brand.shortName();
      const { shortcuts, ...rest } = tpl; // eslint-disable-line no-unused-vars
      return {
        ...rest,
        id: '/company',
        name: `${short} — إدارتكم القانونية`,
        short_name: short,
        description: 'Your Virtual Legal Department — بوابة الشركات',
        start_url: '/company#/',
        scope: '/company',
        theme_color: theme,
      };
    }
    const out = { ...tpl, theme_color: theme };
    if (app.brand?.staffChromeOn?.() !== false) {
      const short = app.brand.staffChromeName().short;
      out.name = `${short} — منصة فريق العمل والمحامين`;
      out.short_name = short;
      out.description = 'منصة فريق العمل والمحامين لمتابعة الطلبات والملفات.';
    }
    return out;
  }
  for (const [route, kind] of [['/manifest.webmanifest', 'app'], ['/company.webmanifest', 'company']]) {
    app.pageHandlers.set(route, (req, res) => {
      const m = manifestFor(kind);
      if (!m) return false;
      const body = `${JSON.stringify(m, null, 2)}\n`;
      const etag = `W/"mf-${crypto.createHash('sha256').update(body).digest('base64url').slice(0, 16)}"`;
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', etag);
      if (String(req.headers['if-none-match'] || '').split(',').some((x) => x.trim() === etag)) {
        res.statusCode = 304;
        res.end();
        return true;
      }
      sendBody(res, 200, body, { req });
      return true;
    });
  }

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

  app.site = {
    baseUrl,
    publicSettings,
    publicBlock,
    faqItems,
    renderPage,
    registerPage,
    servePage,
    validateSettings: validateSiteSettings,
    SERVICES,
    FAQ,
    PROGRAMS,
    // v11 gate-public
    sideOf,
    sideSettings,
    setSegCookie,
    imgUrl,
    gateEnabled,
    paidFaqItems,
    criticalCss,
    portalCopyBlock,
  };
  return app.site;
}
