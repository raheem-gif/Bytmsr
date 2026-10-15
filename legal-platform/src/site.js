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
import { TOPICS, topicByKey } from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';
// v11 gate-public: مفردات نوع الخدمة (charity | paid) وكعكة bm_seg ومواضيع الأفراد والشركات — نفس الوحدة في الخادم والمتصفح
import { parseSegment, segmentFromCookie, SEG_COOKIE, SEG_COOKIE_MAX_AGE, COMPANY_PREFILL, PAID_GENERIC } from '../public/assets/js/public/segment.js';
// v12 entry (§5.1): الشجرة مصدر واحد لصفحات «/» و/start/… ولكلمات الخطوط الثلاث في /services (L12-82)
import { TREE, LINES, pageOf, bmPathFor, TOPIC_TO_PATH, AREA_TO_PATH } from '../public/assets/js/public/entry-tree.js';
// v11 gate-public (L11-13): نصوص الأفراد والشركات (تُضمَّن في صفحاتهم فقط داخل bm-copy)
import { intakePaidCopy, INTAKE_TITLES, INTAKE_PAGE, PORTAL_PAID, PORTAL_LOGIN_PAID, DELETION_PAID_PREFILL, paidHours } from './site-copy-paid.js';

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
  // v11 gate-public / v12 entry: صفحة /services (E12-60…66)
  'svc_rows', 'paid_ways', 'paid_how', 'companies_band', 'paid_trust', 'paid_partners', 'paid_faq', 'paid_contact_list', 'paid_contact_buttons',
  // v12 entry: صفحات الشجرة (E12-20) وصفحة «خيري» المتوقفة (L12-49)
  'tree_main', 'tree_preload',
  // v12 entry: إطار طلب الأفراد والشركات (E12-31): العلامة، و«رجوع» والمسار، وتذييل الشجرة
  'lh_head', 'lh_trail', 'lh_foot',
  // v12 gate (R-01): خط الخطوة «1 من N» من الخادم فوق #intake-root، فلا يدفع intake.js الشاشة الأولى لأسفل عند ظهورها
  'lh_step',
  // v12 gate (JR-15): نص زر التواصل في صفحة «خيري» المتوقفة (ثابت أو رقم مُهرَّب)
  'charity_contact_label',
  // v12 entry (L12-29، §5.5): فقرات media الثابتة في الخصوصية وحذف البيانات (لا مدخلات مستخدم)
  'media_privacy', 'media_deletion',
  // v11 fixer-public (K5، GP-6 P1): شعار شاشة الدخول /portal
  'signin_logo']);

// ───────────── v11 gate-public / v12 entry: نوع الخدمة في الموقع العام (L11-02…08، E12-70…75) ─────────────
// v12 entry (E12-71 #1): لا شاشة اختيار في 12.0 بأي حالة؛ «/» هي الشجرة، و«خيري» يظهر أو يختفي بمفتاح واحد (charity_public).
/** معاملات الحملة المسموح بنقلها لروابط الصفحات (G11-19، E12-11)، كل قيمة ≤ 200 حرف وتُرمَّز من جديد */
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
  // v12 entry (E12-10 آخر صف، P1): أسماء قصيرة للمطبوعات والإعلانات ← صفحات الشجرة
  '/istishara': '/start/consultation',
  '/%D8%A7%D8%B3%D8%AA%D8%B4%D8%A7%D8%B1%D8%A9': '/start/consultation', // /استشارة
  '/daawa': '/start/litigation',
  '/%D8%AF%D8%B9%D9%88%D9%89': '/start/litigation', // /دعوى
  '/%D9%82%D8%B6%D9%8A%D8%A9': '/start/litigation', // /قضية
  '/tasis': '/start/company/new',
  '/%D8%AA%D8%A3%D8%B3%D9%8A%D8%B3': '/start/company/new', // /تأسيس
  '/%D8%AA%D8%A7%D8%B3%D9%8A%D8%B3': '/start/company/new', // /تاسيس
};
/** العناوين والأوصاف (G11-05، E12-13): «خيري» كما في 10.0؛ صفحات الأفراد والشركات بالفاصل « | » بدل «—» */
export const TITLES = {
  charity: (b) => `الدعم القانوني للأرامل والأيتام وأسرهم — ${b}`,
  charityDesc: (legal) => `مساعدة قانونية مجانية وسرية للأرامل وأسر الأيتام من ${legal}: الورث والمعاش والنفقة والحضانة والسكن وفلوس الأيتام والورق الرسمي. احكيلنا مشكلتك برسالة صوتية أو كتابة.`,
  home: (b) => `${b} | محاماة واستشارات قانونية`,
  homeDesc: 'اختاروا ما تحتاجونه: استشارة قانونية، أو رفع دعوى قضائية، أو تأسيس شركة. نتفق معكم على الأتعاب كتابةً قبل أي عمل.',
  tree: (labels, q, b) => `${labels.join(' · ')}: ${q} | ${b}`,
};

// ───────────── v12 entry: نصوص /services (E12-62…66، L12-82، L12-86) — كل عنصر برمزه (§5.9) ─────────────
/**
 * «كيف نساعدكم؟»: الخطوط الثلاث؛ العنوان المعروض يُقرأ من LINES[line].label وقت العرض (مصدر واحد للكلمات، L12-82).
 * label هنا لسجل الرموز وحده (TAGS.md و`npm run tags find`)، واختبار v12-entry يفرض أنه يساوي LINES حرفيًا.
 * d = السطر تحت العنوان (E12-62).
 */
export const SVC_ROWS = [
  { line: 'consultation', tag: 'S-12', label: 'استشارة', d: 'في الأسرة والميراث، والعقارات والإيجار، والعمل، والعقود، والمعاشات.' },
  { line: 'litigation', tag: 'S-13', label: 'رفع دعوى قضائية', d: 'نرفع الدعوى أو نرد عليها، ونتابع القضية حتى الحكم وتنفيذه.' },
  { line: 'company', tag: 'S-14', label: 'تأسيس شركات', d: 'تأسيس الشركات وتعديلها، والعقود والتراخيص، ومستشار قانوني للشركة.', d_b2b_off: 'تأسيس الشركات وتعديلها، والعقود والتراخيص.' },
];
/** «كيف نعمل؟» (E12-63): العنوان ثم السطر؛ «وعلى واتساب» فقط مع رقم واتساب للأفراد والشركات */
export const PAID_STEPS = [
  { tag: 'S-21', t: 'تخبروننا بالموضوع', s: () => 'من الموقع أو على واتساب أو بالهاتف، مع صور المستندات إن وُجدت.' },
  { tag: 'S-22', t: 'نتفق على الأتعاب', s: () => 'يراجع محامٍ الموضوع، ونرسل لكم الأتعاب مكتوبة. لا نبدأ قبل موافقتكم.' },
  { tag: 'S-23', t: 'نبدأ العمل', s: (wa) => `يتولى الموضوع محامٍ متخصص، وتتابعون كل خطوة من صفحة طلبكم${wa ? ' وعلى واتساب' : ''}.` },
];
/** «التزامنا معكم» (E12-65) */
export const PAID_TRUST = [
  { tag: 'S-41', t: 'السرية', s: 'لا يطّلع على ملفكم إلا المحامي المختص وفريق المتابعة، بقدر ما يحتاجه العمل. والمحامي لا يرى رقم هاتفكم.' },
  { tag: 'S-42', t: 'الأتعاب مكتوبة', s: 'تصلكم الأتعاب مكتوبة على صفحة طلبكم، ولا نبدأ أي عمل قبل موافقتكم.' },
  { tag: 'S-43', t: 'محامون مقيدون بالنقابة', s: 'يعمل على طلبكم محامٍ مقيد بنقابة المحامين ومتخصص في موضوعه، ويراجع فريقنا كل رد قبل أن يصلكم.' },
  { tag: 'S-44', t: 'صفحة لكل طلب', s: 'تتابعون منها الجديد، وترسلون المستندات، وتقرؤون الرد.' },
];
/** شريط «مستشار قانوني لشركتكم» (E12-64، S-32): أربعة أسطر بلا أيقونات */
export const BAND_LIST = ['مراجعة العقود وصياغتها', 'شؤون العاملين والإنذارات', 'التراخيص والسجل التجاري، مع تذكير قبل مواعيد التجديد', 'مواعيد رد وتسليم مكتوبة في كل باقة'];
/** knowsAbout في LegalService (E12-13)؛ الأخير فقط مع خدمة الشركات */
export const PAID_KNOWS_ABOUT = ['استشارات قانونية', 'رفع الدعاوى ومتابعتها', 'الأحوال الشخصية', 'الميراث', 'الإيجار والعقارات', 'قانون العمل', 'العقود', 'تأسيس الشركات', 'مستشار قانوني للشركات'];
/** سهم الصفوف (يشير لنهاية السطر في RTL)؛ زخرفي */
const ARROW = '<svg class="arrow" viewBox="0 0 22 12" width="22" height="12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" focusable="false"><path d="M21 6H1M6 1 1 6l5 5"/></svg>';

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

// v12 entry: إعدادات «الصفحة الأولى» و«عن المكتب» (§5.4)
const FIRM_ERR = {
  name: 'اكتب اسم المكتب بحروف عادية، 80 حرفًا على الأكثر، بلا روابط.',
  city: 'اكتب اسم المدينة بحروف عادية، 40 حرفًا على الأكثر، بلا روابط.',
  year: 'اكتب سنة التأسيس بأربعة أرقام من 1900 حتى السنة الحالية، أو اتركها فارغة.',
  partners: 'الشركاء 8 على الأكثر: لكل شريك اسم من 2 إلى 60 حرفًا وصفة حتى 60 حرفًا، بحروف عادية بلا روابط.',
  landing: 'اختر ما يظهر عند فتح روابط «خيري» القديمة.',
  registration: 'اكتب قيد المكتب (نقابة المحامين أو السجل التجاري) بحروف عادية، 120 حرفًا على الأكثر، بلا روابط.',
};
const URLISH_RE = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|\/\/|[a-z0-9-]+\.[a-z]{2,}(?:[/:?#]|$|\s))/i;
const DIGITS_ONLY_RE = /^[\d٠-٩\s.,،-]+$/;

/** نص عادي قصير بلا رموز تحكم ولا روابط، وليس أرقامًا فقط ← '' أو النص بمسافات موحدة */
function firmText(x, { max, min = 0, msg }) {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'string' || !isPlainName(x)) throw badRequest(msg);
  const s = collapseSpaces(x);
  if (!s) {
    if (min) throw badRequest(msg);
    return '';
  }
  if ([...s].length > max || [...s].length < min || URLISH_RE.test(s) || DIGITS_ONLY_RE.test(s)) throw badRequest(msg);
  return s;
}
function firmRegistration(x) {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'string' || !isPlainName(x)) throw badRequest(FIRM_ERR.registration);
  const s = collapseSpaces(x);
  if ([...s].length > 120 || URLISH_RE.test(s)) throw badRequest(FIRM_ERR.registration);
  return s;
}
function firmYear(x) {
  if (x === null || x === undefined) return '';
  const s = String(x).trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!s) return '';
  const y = Number(s);
  if (!/^\d{4}$/.test(s) || y < 1900 || y > new Date().getFullYear()) throw badRequest(FIRM_ERR.year);
  return s;
}
function firmPartners(x) {
  if (!Array.isArray(x) || x.length > 8) throw badRequest(FIRM_ERR.partners);
  return x.map((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw badRequest(FIRM_ERR.partners);
    return { name: firmText(p.name, { max: 60, min: 2, msg: FIRM_ERR.partners }), title: firmText(p.title ?? '', { max: 60, msg: FIRM_ERR.partners }) };
  });
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
  // v12 entry (§5.4، L12-12، L12-49، L12-56): الصفحة الأولى و«عن المكتب» — نص عادي بلا روابط، وبلا قيم كلها أرقام
  take('firm_legal_name', (x) => firmText(x, { max: 80, msg: FIRM_ERR.name }));
  // v12 gate fixer-server (V-01): قيد المكتب للجهة المتعاقدة — نص عادي بلا روابط، والأرقام مسموحة («سجل تجاري 12345»)
  take('firm_registration', (x) => firmRegistration(x));
  // المدينة قد تحمل رقمًا («مدينة 6 أكتوبر»): الممنوع الروابط والأرقام وحدها
  take('firm_city', (x) => firmText(x, { max: 40, msg: FIRM_ERR.city }));
  take('firm_founded', (x) => firmYear(x));
  take('firm_partners', (x) => firmPartners(x));
  take('charity_archived_landing', (x) => {
    if (x !== 'notice' && x !== 'redirect') throw badRequest(FIRM_ERR.landing);
    return x;
  });
  const bad = Object.keys(fields);
  if (bad.length) throw badRequest(fields[bad[0]], { fields });
  return out;
}

/** صفحات الموقع العام: المسار ← ملف القالب وأولوية خريطة الموقع */
// v12 entry (E12-13، E12-71 #12): «/» = الشجرة (entry.html)؛ charity: صفحتا «خيري» في خريطة الموقع فقط حين يُعاد «خيري»؛
// /intake لا تظهر في الخريطة (بلا مسار تحوّل إلى «/»)
export const SITE_PAGES = [
  { path: '/', file: 'entry.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/khayri', file: 'index.html', priority: '1.0', changefreq: 'weekly', charity: true },
  { path: '/services', file: 'services.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/intake', file: 'intake.html', priority: '0.9', changefreq: 'monthly', sitemap: false },
  { path: '/about', file: 'about.html', priority: '0.8', changefreq: 'monthly', charity: true },
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
/** v12 gate (K-P4، H-L1): الصفحات التي يتغير رأسها بترويسة «Save-Data» (تحميل وجه العناوين المسبق)، فيحمل ردها «Vary: …, Save-Data» */
const SAVE_DATA_PAGES = new Set(['/services']);

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
    // v12 entry (E12-12): و«خيري» متوقف لا تُكتب الكعكة أبدًا
    if (!seg || !charityPublic() || req?.method === 'HEAD' || isSpeculative(req)) return false;
    const parts = [`${SEG_COOKIE}=${seg}`, 'Path=/'];
    if (persist) parts.push(`Max-Age=${SEG_COOKIE_MAX_AGE}`);
    parts.push('SameSite=Lax');
    if (isHttps(req)) parts.push('Secure');
    putSegCookie(res, parts.join('; '));
    return true;
  }

  function putSegCookie(res, cookie) {
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev : [String(prev)]) : [];
    res.setHeader('Set-Cookie', [...list.filter((c) => !c.startsWith(`${SEG_COOKIE}=`)), cookie]);
  }

  /**
   * v12 entry (E12-12): «خيري» متوقف ← كعكة bm_seg قديمة على «/» و/services تُمسح (GET فقط، لا HEAD ولا تحميل مسبق
   * ولا معاينة، والجسم نفسه). حين يُعاد «خيري» تبقى قواعد v11 في /khayri و/intake?seg=… والصفحات القانونية.
   */
  function clearStaleSeg(req, res) {
    if (charityPublic() || String(req?.method || 'GET').toUpperCase() !== 'GET' || isSpeculative(req)) return false;
    if (!/(?:^|;)\s*bm_seg=/.test(String(req?.headers?.cookie || ''))) return false;
    putSegCookie(res, [`${SEG_COOKIE}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax', ...(isHttps(req) ? ['Secure'] : [])].join('; '));
    return true;
  }

  /** v12 entry (E12-70، L12-09): «خيري» ظاهر على الموقع؟ (charity_public، الافتراضي لا). site_gate_enabled متقاعد ولا يُقرأ */
  function charityPublic() {
    return app.settings.get('charity_public') === true;
  }

  /** جانب الصفحة (E12-71 #10): side صريح (نبرة صفحة المتابعة أو ?side= في الصفحات القانونية) › «خيري» متوقف = الأفراد والشركات › كعكة v11 */
  function pageSide(req, side) {
    return parseSegment(side) || (charityPublic() ? sideOf(req) : 'paid');
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
    // v12 entry (L12-12، L12-56، L12-85): الاسم القانوني للمكتب (سطر © وbm-public ووسوم المشاركة)، والمدينة وسنة التأسيس والشركاء
    const firmLegal = typeof s.firm_legal_name === 'string' ? s.firm_legal_name.trim() : '';
    return {
      firm_legal_name: firmLegal,
      firm_name: firmLegal || brandName,
      firm_city: typeof s.firm_city === 'string' ? s.firm_city.trim() : '',
      firm_founded: /^\d{4}$/.test(String(s.firm_founded ?? '').trim()) ? String(s.firm_founded).trim() : '',
      firm_partners: Array.isArray(s.firm_partners) ? s.firm_partners.filter((p) => p && typeof p.name === 'string' && p.name.trim()).slice(0, 8) : [],
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
    // v12 entry (E12-23، E12-61/62): أزرار واتساب العامة في صفحات الأفراد والشركات تحمل الجملة العامة PAID_GENERIC
    // (تُوسم «أفراد وشركات» بلا مسار، فتسأل قائمة واتساب عن الخط)
    const greeting = PAID_GENERIC;
    // v11 fixer-public (V2): المواعيد بالفصحى في كل ما يُبنى من إعدادات هذا الجانب (/services، التواصل، bm-public، 404، حذف البيانات)
    // v12 entry (L12-85): اسم المكتب (firm_name) مكان اسم المؤسسة في bm-public وكل ما يُبنى لهذا الجانب، ولا شعار المؤسسة
    return { ...ps, side: 'paid', org_name: ps.firm_name, org_tagline: '', org_phone: phone, org_phone_e164: normalizePhone(phone) || '', whatsapp_digits: digits, whatsapp_display_number: '', greeting, office_hours: paidHours(ps.office_hours) };
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
      // v12 entry (L12-85، §5.11): صفحات الأفراد والشركات بأسماء المجالات الرسمية (لا «فلوس الأيتام» في bm-public)
      areas: LEGAL_AREAS.map((a) => ({ code: a.code, label: ps.side === 'paid' ? a.label : PLAIN_AREAS[a.code] || a.label })),
      setup_required: !!app.system?.isSetupMode?.(),
      demo: !!config.demo,
      // v11 gate-public (§5.7): جانب الصفحة (أرقام واتساب والهاتف أعلاه لهذا الجانب)
      segment: ps.side === 'paid' ? 'paid' : 'charity',
      // v12 entry (L12-45): «خيري» ظاهر على الموقع؟ (charity_public)، والرسائل الصوتية من الموقع مفعّلة؟ (web_voice_enabled، media)
      charity: app.settings.get('charity_public') === true,
      voice: app.settings.get('web_voice_enabled') === true,
      // v12 gate (K-P2): «تحسين صور المستندات على جهاز المرسل» (scan_client_enabled، media)؛ upload.js يقرأ scan === false
      scan: app.settings.get('scan_client_enabled') !== false,
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
  // v12 entry (L12-11، E12-61، §5.9): قائمة الأفراد والشركات، كل رابط برمزه
  const NAV_PAID = [
    { hash: '#services', label: 'الخدمات', tag: 'H-02' },
    { hash: '#how', label: 'كيف نعمل', tag: 'H-03' },
    { hash: '#companies', label: 'للشركات', b2b: true, tag: 'H-04' },
    { hash: '#faq', label: 'أسئلة', tag: 'H-05' },
  ];
  /** صفحة «خيري» الرئيسية بالمربعات (حين يُعاد «خيري»): /khayri وحدها؛ «/» صارت الشجرة (E12-71 #1) */
  const CHARITY_HOMES = new Set(['/khayri']);

  /**
   * v9.2 [R2-B1]: زر تواصل 44×44 في رأس كل صفحة عامة على الموبايل (≤ 600px) قبل زر القائمة:
   * واتساب إن وُجد رقم فعلي، وإلا الاتصال إن وُجد تليفون، وإلا لا شيء. يختفي على الشاشات الأكبر (القائمة فيها التواصل).
   * v11: بأرقام جانب الصفحة وجملته الجاهزة (ps = sideSettings). v12 (H-08): عنصر واحد برمز واحد بصيغتيه.
   */
  function headerContactHtml(ps, wa) {
    const tel = ps.org_phone ? ps.org_phone_e164 || ps.org_phone : '';
    if (!wa && !tel) return '';
    const attrs = wa
      ? `class="pub-head-contact pub-head-contact--wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" aria-label="واتساب (يفتح في نافذة جديدة)"`
      : `class="pub-head-contact" href="tel:${esc(tel)}" aria-label="${ps.side === 'paid' ? 'اتصال بالهاتف' : 'اتصال بالتليفون'}"`;
    // v12 gate (V-18): دائرة الأيقونة لرأس «خيري» وحده (بلا رموز H-)؛ الأفراد والشركات: كلمة «واتساب» داخل القائمة (H-08)
    return `<a ${attrs}>${iconSvg(wa ? 'whatsapp' : 'phone', 22)}</a>`;
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

  /**
   * روابط ملفات نموذج الطلب (نفس أرقام الإصدار في صفحة /intake) لتحميلها مسبقًا وهي تختار.
   * v12 entry review (R3): charity=false لصفحات الشجرة — نموذج الأفراد والشركات بلا صور، فلا تُنزَّل pictos.js مسبقًا
   */
  function prefetchUrls({ charity = true } = {}) {
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
    // v12 entry: صور نموذج «خيري» تُحمَّل بعد فتحه (import())، فتُحمَّل مسبقًا هنا كما كانت (صفحة «خيري» وحدها)
    if (charity) add('/assets/js/public/pictos.js');
    return urls.join(' ');
  }

  /**
   * v11 gate-public (§5.9، G11-21) + v12 entry (L12-11، E12-61، E12-71 #6، E12-73): رأس الصفحة حسب جانبها (ps = sideSettings).
   * الأفراد والشركات: الشعار ← «/»، القائمة «الخدمات · كيف نعمل · للشركات · أسئلة · متابعة طلب» والزر «ابدأوا طلبكم» ← «/»،
   * وكلمة «القائمة» على الهاتف بلا أيقونة (K12-21). «خيري»: كلامه كما هو بلا شارة ولا «تغيير نوع الخدمة»؛ وما دام «خيري»
   * متوقفًا (صفحة متابعة طلب خيري فقط) تُحذف الروابط التي ترتد: الأقسام و«احكيلنا مشكلتك»، والشعار بلا رابط.
   * nav=false: الشعار وحده (صفحة «خيري» المتوقفة، L12-49). رابط التخطي جزء من الرأس (H-10).
   */
  function headerHtml(ps, current, { nav = true, home } = {}) {
    const paid = ps.side === 'paid';
    const open = charityPublic();
    const wa = waLink(ps.whatsapp_digits, ps.greeting || SITE_GREETING);
    const homeHref = home !== undefined ? home : paid ? '/' : open ? '/khayri' : null;
    const onHome = paid ? current === '/services' : CHARITY_HOMES.has(current);
    const base = onHome ? '' : paid ? '/services' : '/khayri';
    const b2b = app.settings.get('b2b_enabled') !== false;
    const items = paid ? NAV_PAID.filter((n) => !n.b2b || b2b) : open ? NAV : [];
    const links = items.map((n) => `<a class="pub-nav-link" href="${base}${n.hash}"${n.tag ? ` data-tag="${esc(n.tag)}"` : ''}>${esc(n.label)}</a>`).join('');
    // v9.2 (S-25): الشاشة الأولى للصفحة الرئيسية بلا أفعال مؤنثة، ونفس اسم مربع «طلبك فين؟» تحت (مكان واحد = اسم واحد)
    const followLabel = paid ? 'متابعة طلب' : onHome ? 'طلبك فين؟' : 'تابعي طلبك';
    const cta = paid
      ? { href: '/', inner: '<span>ابدأوا طلبكم</span>', cur: '' }
      : open
        ? { href: '/intake?seg=charity', inner: `${iconSvg('message', 18)}<span>احكيلنا مشكلتك</span>`, cur: current === '/intake' ? ' aria-current="page"' : '' }
        : null;
    const ctaHtml = cta ? `\n      <a class="pub-btn pub-btn-gold pub-nav-cta" href="${cta.href}" data-cta="intake"${cta.cur} data-tag="H-07">${cta.inner}</a>` : '';
    const brandTag = homeHref ? 'a' : 'span';
    const brandAttrs = homeHref ? ` href="${homeHref}" aria-label="${esc(paid ? `${ps.brand_name}: الصفحة الأولى` : `${ps.brand_name} — الصفحة الرئيسية`)}"` : '';
    const toggle = paid
      ? '<span class="pub-menu-word">القائمة</span>'
      : `${iconSvg('menu', 22, 'pub-menu-open')}${iconSvg('x', 22, 'pub-menu-close')}<span class="pub-sr">القائمة</span>`;
    // v12 gate (V-18، K12-21): على الهاتف «القائمة» كلمة وحدها في رأس الأفراد والشركات؛ واتساب كلمة داخل القائمة (تُخفى على الشاشة الكبيرة)
    const waWord = paid && wa ? `\n      <a class="pub-nav-link pub-nav-wa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" data-tag="H-08">واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>` : '';
    const menu = nav
      ? `${paid ? '' : headerContactHtml(ps, wa)}<button class="pub-menu-toggle${paid ? ' pub-menu-toggle--word' : ''}" type="button" aria-expanded="false" aria-controls="pub-nav" data-pub-menu data-tag="H-09">${toggle}</button>
    <nav id="pub-nav" class="pub-nav" aria-label="القائمة الرئيسية" data-tag="H-11">
      ${links}
      <a class="pub-nav-link pub-nav-portal" href="/portal"${current === '/portal' ? ' aria-current="page"' : ''} data-tag="H-06">${paid ? '' : iconSvg('search', 18)}<span>${followLabel}</span></a>${waWord}${ctaHtml}
    </nav>`
      : '';
    const out = `<a class="skip-link" href="#main" data-tag="H-10">انتقال إلى المحتوى</a>
    <header class="pub-header" data-pub-header data-tag="H-12">
  <div class="pub-container pub-header-inner">
    <${brandTag} class="pub-brand"${brandAttrs} data-tag="H-01">
      <img class="pub-mark" src="${imgUrl('/assets/img/emam-mark-green.svg')}" width="99" height="19" alt="" decoding="async" />
      ${wordmarkHtml(ps.brand_name, ps.brand_short)}
    </${brandTag}>
    ${menu}
  </div>
</header>`;
    // v12 entry review (R2, §5.9، T12-22): رموز H- للرأس في صفحات الأفراد والشركات وحدها؛ رأس «خيري» (صفحاته حين يُعاد، صفحات
    // متابعة الطلبات الخيرية، وصفحة «خيري» المتوقفة) بلا رموز. الرموز تبقى مكتوبة حرفيًا أعلاه حتى يجدها سجل الرموز.
    return paid ? out : out.replace(/ data-tag="H-\d{2}"/g, '');
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

  // v12 tags (TG-6): fbTag/igTag لتذييل الأفراد والشركات وحده (تذييل «خيري» بلا رموز، T12-22)
  function socialHtml(ps, { fbTag = '', igTag = '' } = {}) {
    const out = [];
    if (ps.org_facebook_url) {
      out.push(`<a class="pub-social" href="${esc(ps.org_facebook_url)}" target="_blank" rel="noopener noreferrer"${fbTag ? ` data-tag="${esc(fbTag)}"` : ''}>${iconSvg('facebook', 18)}<span>فيسبوك</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    }
    if (ps.org_instagram_url) {
      out.push(`<a class="pub-social" href="${esc(ps.org_instagram_url)}" target="_blank" rel="noopener noreferrer"${igTag ? ` data-tag="${esc(igTag)}"` : ''}>${iconSvg('instagram', 18)}<span>إنستجرام</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
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

  /**
   * تذييل «خيري» (صفحات «خيري» حين يُعاد، وصفحات متابعة الطلبات الخيرية دائمًا). v12 entry (E12-71 #7، E12-73، L12-74):
   * بلا «اختيار نوع الخدمة»؛ الروابط القانونية بـ ?side=charity؛ وما دام «خيري» متوقفًا تُحذف الروابط التي ترتد
   * (عن البرنامج، احكيلنا مشكلتك، أسئلة، خدمات الأفراد والشركات) ويبقى «تابعي طلبك» والسياسات، والشعار بلا رابط.
   */
  function footerHtml(ps, wa) {
    if (ps.side === 'paid') return paidFooterHtml(ps, wa);
    const year = new Date().getFullYear();
    const company = companyPortalOpen();
    const open = charityPublic();
    const brandOpen = open ? '<a class="pub-brand pub-brand-light" href="/khayri">' : '<span class="pub-brand pub-brand-light">';
    const brandClose = open ? '</a>' : '</span>';
    const siteLinks = open
      ? `<li><a href="/khayri">الصفحة الرئيسية</a></li>
        <li><a href="/about">عن البرنامج</a></li>
        <li><a href="/intake?seg=charity" data-cta="intake">احكيلنا مشكلتك</a></li>
        <li><a href="/portal">تابعي طلبك</a></li>
        <li><a href="/khayri#faq">أسئلة</a></li>
        <li><a href="/services">خدمات الأفراد والشركات</a></li>`
      : '<li><a href="/portal">تابعي طلبك</a></li>';
    return `<footer class="pub-footer">
  <div class="pub-container pub-footer-grid">
    <div class="pub-footer-about">
      ${brandOpen}
        ${footerLogoHtml()}
        <span class="pub-brand-lockup">${wordmarkHtml(ps.brand_name, ps.brand_short)}${ps.program_name ? `<span class="pub-brand-desc">${esc(ps.program_name)}</span>` : ''}</span>
      ${brandClose}
      ${ps.org_registration ? `<p class="pub-footer-reg">${esc(ps.org_registration)}</p>` : ''}
      <p class="pub-footer-desktop">بنساعد الأرامل وأسر الأيتام في مشاكلهم القانونية مجانًا، مع محامين متطوعين ومتعاونين، وفريق المؤسسة بيراجع كل حاجة.</p>
      ${socialHtml(ps)}
    </div>
    <nav class="pub-footer-col pub-footer-desktop" aria-label="روابط الموقع">
      <h2>روابط</h2>
      <ul>
        ${siteLinks}
      </ul>
    </nav>
    <nav class="pub-footer-col pub-footer-desktop" aria-label="السياسات">
      <h2>السياسات</h2>
      <ul>
        <li><a href="/privacy?side=charity">سياسة الخصوصية</a></li>
        <li><a href="/terms?side=charity">شروط الاستخدام</a></li>
        <li><a href="/data-deletion?side=charity">حذف البيانات</a></li>
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
      ${open ? '<li><a href="/about">عن البرنامج</a></li>' : '<li><a href="/portal">تابعي طلبك</a></li>'}
      <li><a href="/privacy?side=charity">سياسة الخصوصية</a></li>
      <li><a href="/terms?side=charity">شروط الاستخدام</a></li>
      <li><a href="/data-deletion?side=charity">حذف البيانات</a></li>
      ${open ? '<li><a href="/services">خدمات الأفراد والشركات</a></li>' : ''}
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
   * v11 gate-public (G11-23) + v12 entry (E12-66، L12-12، L12-56، §5.9 F-01…F-20): تذييل الأفراد والشركات — سطر
   * «محاماة واستشارات قانونية…» (+ « في {المدينة}» حين تُكتب)، «روابط» (الصفحة الأولى، عن المكتب، متابعة طلب، للشركات،
   * دخول الشركات، و«خيري» حين يُعاد)، السياسات، التواصل، وسطر © باسم المكتب (firm_legal_name › brand_name) في <bdi>.
   * v12 gate (V-18، A23): الأعمدة نفسها على الهاتف قوائم بخطوط رفيعة (بلا «روابط مهمة» المطوية ولا سطر «للتواصل» المكرر)،
   * وسطر المكتب (F-02) ظاهر على كل الشاشات.
   */
  function paidFooterHtml(ps, wa) {
    const year = new Date().getFullYear();
    const company = companyPortalOpen();
    const b2b = app.settings.get('b2b_enabled') !== false;
    const tel = ps.org_phone_e164 || ps.org_phone;
    return `<footer class="pub-footer" data-tag="F-21">
  <div class="pub-container pub-footer-grid">
    <div class="pub-footer-about">
      <a class="pub-brand pub-brand-light" href="/" data-tag="F-01">
        ${footerLogoHtml()}
        <span class="pub-brand-lockup">${wordmarkHtml(ps.brand_name, ps.brand_short)}</span>
      </a>
      <p class="pub-footer-statement" data-tag="F-02">محاماة واستشارات قانونية للأفراد والشركات${ps.firm_city ? ` في ${esc(ps.firm_city)}` : ''}.</p>
      ${socialHtml(ps, { fbTag: 'F-22', igTag: 'F-23' })}
    </div>
    <nav class="pub-footer-col" aria-label="روابط الموقع" data-tag="F-24">
      <h2 data-tag="F-03">روابط</h2>
      <ul>
        <li><a href="/" data-tag="F-04">الصفحة الأولى</a></li>
        <li><a href="/services" data-tag="F-05">عن المكتب</a></li>
        <li><a href="/portal" data-tag="F-06">متابعة طلب</a></li>
        ${b2b ? '<li><a href="/services#companies" data-tag="F-07">للشركات</a></li>' : ''}
        ${company ? '<li><a href="/company" data-tag="F-08">دخول الشركات</a></li>' : ''}
        ${charityPublic() ? '<li><a href="/khayri" data-tag="F-16">خيري</a></li>' : ''}
      </ul>
    </nav>
    <nav class="pub-footer-col" aria-label="السياسات" data-tag="F-25">
      <h2 data-tag="F-09">السياسات</h2>
      <ul>
        <li><a href="/privacy" data-tag="F-10">سياسة الخصوصية</a></li>
        <li><a href="/terms" data-tag="F-11">شروط الاستخدام</a></li>
        <li><a href="/data-deletion" data-tag="F-12">حذف البيانات</a></li>
      </ul>
    </nav>
    <div class="pub-footer-col pub-footer-contact">
      <h2 data-tag="F-13">تواصلوا معنا</h2>
      ${paidContactListHtml(ps, wa, { tag: 'F-14', mapTag: 'F-26', telTag: 'F-27', waTag: 'F-28', mailTag: 'F-29' })}
    </div>
  </div>
  <div class="pub-footer-bottom">
    <div class="pub-container pub-footer-bottom-inner">
      <p class="pub-legal" data-tag="F-20">© ${year} <bdi>${esc(ps.firm_name)}</bdi>. جميع الحقوق محفوظة.</p>
      <span class="pub-footer-logins"><a href="/app" class="pub-staff-link" data-tag="F-31">دخول فريق العمل والمحامين</a>${company ? '<a href="/company" class="pub-staff-link" data-tag="F-32">دخول الشركات</a>' : ''}</span>
    </div>
  </div>
</footer>`;
  }

  /** v11 (G11-32): «تواصلوا معنا» للأفراد والشركات — نفس عناصر «كلمينا» بالجمع المهذب، وهاتف/واتساب هذا الجانب؛ tag = رمز القائمة في موضعها */
  // v12 tags (TG-6): mapTag/telTag/waTag/mailTag = رمز كل رابط في موضع القائمة (التذييل، «تواصلوا معنا»، الصفحات القانونية)
  function paidContactListHtml(ps, wa, { tag = '', mapTag = '', telTag = '', waTag = '', mailTag = '' } = {}) {
    const items = [];
    const tel = ps.org_phone_e164 || ps.org_phone;
    const dt = (code) => (code ? ` data-tag="${esc(code)}"` : '');
    if (ps.org_address) {
      items.push(
        `<li>${iconSvg('mapPin', 20)}<span><span class="pub-contact-label">العنوان</span>${esc(ps.org_address)}` +
          (ps.map_url ? ` <a href="${esc(ps.map_url)}" target="_blank" rel="noopener noreferrer"${dt(mapTag)}>افتحوا الخريطة<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>` : '') +
          '</span></li>',
      );
    }
    if (ps.org_phone) items.push(`<li>${iconSvg('phone', 20)}<span><span class="pub-contact-label">الهاتف</span><a href="tel:${esc(tel)}" dir="ltr" class="pub-ltr"${dt(telTag)}>${esc(ps.org_phone)}</a></span></li>`);
    if (wa) items.push(`<li>${iconSvg('whatsapp', 20)}<span><span class="pub-contact-label">واتساب</span><a href="${esc(wa)}" target="_blank" rel="noopener noreferrer"${dt(waTag)}>راسلونا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a></span></li>`);
    if (ps.org_email) items.push(`<li>${iconSvg('mail', 20)}<span><span class="pub-contact-label">البريد الإلكتروني</span><a href="mailto:${esc(ps.org_email)}" dir="ltr" class="pub-ltr"${dt(mailTag)}>${esc(ps.org_email)}</a></span></li>`);
    if (ps.office_hours) items.push(`<li>${iconSvg('clock', 20)}<span><span class="pub-contact-label">مواعيد العمل</span>${esc(ps.office_hours)}</span></li>`);
    return `<ul class="pub-contact-list"${tag ? ` data-tag="${esc(tag)}"` : ''}>${items.join('')}</ul>`;
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

  // ───────────── v12 entry: صفحة المكتب /services (EN-4، E12-60…66، L12-10، L12-56، L12-82) ─────────────

  /** «{review}» بالفصحى (G11-31): 1 «يوم عمل» · 2 «يومَي عمل» · 3–10 «n أيام عمل» · ≥ 11 «n يوم عمل» */
  function daysMsa(n) {
    const k = Math.max(1, Math.round(Number(n) || 0));
    if (k === 1) return 'يوم عمل';
    if (k === 2) return 'يومَي عمل';
    const r = k % 100;
    return r >= 3 && r <= 10 ? `${k} أيام عمل` : `${k} يوم عمل`;
  }

  /** الأسئلة الخمسة (E12-65؛ نفس المصدر للصفحة ولـ FAQPage في JSON-LD)، كل سؤال برمزه؛ بلا «مجان» */
  function paidFaqItems(ps) {
    const ctx = faqContext(ps);
    const b2b = app.settings.get('b2b_enabled') !== false;
    return [
      {
        tag: 'S-51',
        q: 'كم أتعاب الاستشارة؟',
        a: 'تختلف بحسب الموضوع والمستندات. بعد مراجعة طلبكم نرسل لكم المبلغ مكتوبًا على صفحة طلبكم، ولا تدفعون شيئًا قبل موافقتكم.',
      },
      {
        tag: 'S-52',
        q: 'من يطّلع على بياناتي؟',
        a: 'فريق المتابعة والمحامي المختص فقط، بقدر ما يحتاجه العمل. المحامي لا يرى رقم هاتفكم، ولا نبيع بياناتكم ولا نشاركها مع أي جهة.',
        more: { href: '/privacy#summary', label: 'سياسة الخصوصية' },
      },
      {
        tag: 'S-53',
        q: 'متى يصلني الرد؟',
        a: `نتواصل معكم غالبًا خلال ${daysMsa(ctx.review)}. ونحدد موعد الرد النهائي معكم عند الاتفاق على الأتعاب، ونبلغكم بكل جديد على صفحة طلبكم${ctx.wa ? ' وعلى واتساب' : ''}.`,
      },
      b2b
        ? {
            tag: 'S-54',
            q: 'هل تعملون مع الشركات؟',
            a: 'نعم. نؤسس الشركات ونعدّلها، ونعمل مستشارًا قانونيًا للشركات باشتراك شهري، ولكل شركة بوابة لمتابعة طلباتها.',
            more: { href: '/intake?path=company/counsel/proposal&entry=company_band', label: 'اطلبوا عرضًا' },
          }
        : {
            // tags:variant (السؤال نفسه حين تتوقف خدمة الشركات)
            tag: 'S-54',
            q: 'هل يمكن أن تتصلوا بي؟',
            a: 'نعم. اضغطوا «نتصل بكم» واكتبوا رقم الموبايل والوقت المناسب.',
          },
      {
        tag: 'S-55',
        q: 'فقدت رابط صفحة طلبي، ماذا أفعل؟',
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
        (f) => `<details class="pub-faq-item faq__item" data-tag="${esc(f.tag)}">
  <summary><span>${esc(f.q)}</span>${iconSvg('chevronDown', 20, 'pub-faq-chevron')}</summary>
  <div class="pub-faq-body"><p>${esc(f.a)}</p>${f.more ? `<p><a href="${esc(f.more.href)}"${f.more.href.startsWith('/intake') ? ' data-cta="intake"' : ''}>${esc(f.more.label)}</a></p>` : ''}</div>
</details>`,
      )
      .join('\n');
  }

  /** الخطوط الثلاث (S-12…S-14): صف بعنوان وسطر وسهم، كل صف إلى صفحته في الشجرة؛ العناوين من LINES (L12-82) */
  function svcRowsHtml() {
    const b2b = app.settings.get('b2b_enabled') !== false;
    const rows = SVC_ROWS.map(
      (r) =>
        `<li><a class="svc" href="/start/${r.line}" data-tag="${esc(r.tag)}"><span class="svc__t">${esc(LINES[r.line].label)}</span><span class="svc__d">${esc(!b2b && r.d_b2b_off ? r.d_b2b_off : r.d)}</span>${ARROW}</a></li>`,
    );
    return `<ul class="svc-list">${rows.join('')}</ul>`;
  }

  /** «نتصل بكم · واتساب · متابعة طلب» (S-15): روابط نصية؛ واتساب بأرقام هذا الجانب فقط ويختفي بلا رقم */
  function paidWaysHtml(ps, wa) {
    const items = ['<a href="/intake?mode=callback&amp;entry=home_callback" data-cta="intake">نتصل بكم</a>'];
    if (wa) items.push(`<a href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    items.push('<a href="/portal" data-follow>متابعة طلب</a>');
    return `<p class="pub-paid-ways" data-tag="S-15">${items.join('<span aria-hidden="true"> · </span>')}</p>`;
  }

  /** «كيف نعمل؟» (E12-63، S-21…S-23): ثلاث خطوات؛ الرقم للعين فقط (القائمة مرتبة) */
  function paidHowHtml(wa) {
    return PAID_STEPS.map((st, i) => `<li data-tag="${esc(st.tag)}"><span class="pub-how-num" aria-hidden="true">${i + 1}</span><div><strong>${esc(st.t)}</strong><span>${esc(st.s(wa))}</span></div></li>`).join('');
  }

  /** «مستشار قانوني لشركتكم» (E12-64، S-30…S-37) — يختفي كله حين تُوقف خدمة الشركات؛ بلا سطر علوي ولا أيقونات */
  function companiesBandHtml(ps) {
    if (app.settings.get('b2b_enabled') === false) return '';
    const digits = ps.whatsapp_digits;
    const tel = ps.org_phone_e164 || ps.org_phone;
    const moreInner = digits
      ? `<a href="${esc(waLink(digits, COMPANY_PREFILL))}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp">أو راسلونا على واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`
      : ps.org_phone
        ? `أو اتصلوا بنا: <a href="tel:${esc(tel)}" dir="ltr" class="pub-ltr">${esc(ps.org_phone)}</a>`
        : '';
    return `<section id="companies" class="pub-section band pub-band-wrap" aria-labelledby="companies-title" data-tag="S-75">
        <div class="pub-container">
          <span class="sec-label" aria-hidden="true">للشركات</span>
          <div class="pub-band">
            <h2 id="companies-title" class="pub-band-title" data-tag="S-30">مستشار قانوني لشركتكم</h2>
            <p class="pub-band-text" data-tag="S-31">إدارة قانونية خارجية باشتراك شهري. ترسلون الطلبات من بوابة الشركات، وتعرفون موعد الرد قبل الإرسال.</p>
            <ul class="pub-band-list" data-tag="S-32">${BAND_LIST.map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ul>
            <p class="pub-band-plans" data-tag="S-33">الباقة الشهرية حسب حجم الشركة واحتياجها، ونرسل العرض مكتوبًا.</p>
            <div class="pub-band-actions">
              <a class="pub-btn pub-btn-band-gold" href="/intake?path=company/counsel/proposal&amp;entry=company_band" data-cta="intake" data-tag="S-34">اطلبوا عرضًا</a>
              ${companyPortalOpen() ? '<a class="pub-btn pub-btn-on-dark" href="/company" data-tag="S-35">دخول بوابة الشركات</a>' : ''}
            </div>
            <p class="pub-band-new"><a href="/start/company/new" data-tag="S-36">تأسيس شركة جديدة</a></p>
            ${moreInner ? `<p class="pub-band-more" data-tag="S-37">${moreInner}</p>` : ''}
          </div>
        </div>
      </section>`;
  }

  /** «التزامنا معكم» (E12-65، S-41…S-44): أربعة صفوف بعنوان وسطر، بلا أيقونات */
  function paidTrustHtml() {
    return `<ul class="terms g-list on-white pub-trust-list">${PAID_TRUST.map((r) => `<li class="pub-trust-row" data-tag="${esc(r.tag)}"><span class="g-main"><span class="g-title">${esc(r.t)}</span><span class="g-sub">${esc(r.s)}</span></span></li>`).join('')}</ul>`;
  }

  /**
   * «الشركاء» (L12-56، S-45…S-47): بعد «التزامنا معكم»، فقط حين تكتب الإدارة شريكًا أو سنة التأسيس (لا تُزرع أبدًا).
   * «{الاسم}، {الصفة}» لكل شريك، و«تأسس المكتب عام {السنة}[ في {المدينة}].»؛ كل نص مُهرّب.
   */
  function partnersHtml(ps) {
    const partners = ps.firm_partners || [];
    if (!partners.length && !ps.firm_founded) return '';
    const list = partners.length
      ? `<ul class="partners__list" data-tag="S-46">${partners
          .map((p) => `<li><span class="partners__name" dir="auto">${esc(String(p.name).trim())}</span>${p.title && String(p.title).trim() ? `، <span class="partners__title">${esc(String(p.title).trim())}</span>` : ''}</li>`)
          .join('')}</ul>`
      : '';
    const since = ps.firm_founded ? `<p class="partners__since" data-tag="S-47">تأسس المكتب عام ${esc(ps.firm_founded)}${ps.firm_city ? ` في ${esc(ps.firm_city)}` : ''}.</p>` : '';
    return `<section class="pub-section partners" id="partners" aria-labelledby="partners-title" data-tag="S-76">
        <div class="pub-container">
          <span class="sec-label" aria-hidden="true">المكتب</span>
          <h2 id="partners-title" data-tag="S-45">الشركاء</h2>
          ${list}${since}
        </div>
      </section>`;
  }

  /** زرا التواصل في «تواصلوا معنا» (S-62): واتساب (بأرقام هذا الجانب) واتصال */
  function paidContactButtonsHtml(ps, wa) {
    const out = [];
    if (wa) out.push(`<a class="pub-btn pub-btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" data-tag="S-77">${iconSvg('whatsapp', 20)}<span>واتساب</span><span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    if (ps.org_phone) out.push(`<a class="pub-btn pub-btn-call" href="tel:${esc(ps.org_phone_e164 || ps.org_phone)}" data-tag="S-78">${iconSvg('phone', 20)}<span>اتصال</span></a>`);
    return out.length ? `<div class="pub-contact-buttons${out.length === 1 ? ' is-single' : ''}" data-tag="S-62">${out.join('')}</div>` : '';
  }

  function audienceHtml() {
    return AUDIENCE.map((a) => `<li><span class="pub-tile">${iconSvg(a.icon, 24)}</span><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></li>`).join('');
  }

  function programsHtml() {
    return PROGRAMS.map((p) => `<li><strong>«${esc(p.name)}»</strong><span>${esc(p.text)}</span></li>`).join('');
  }

  // ───────────── JSON-LD ─────────────

  function jsonLd(ps, base, pagePath, { title, description, faq, ld = 'charity' }) {
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
   * v11 gate-public (G11-04 r2) + v12 entry (E12-13، L12-56، L12-85): LegalService للأفراد والشركات (#paid-services) +
   * WebPage + أسئلة /services (نفس الأسئلة الظاهرة)؛ legalName = firm_legal_name حين يُكتب، وaddressLocality = firm_city.
   * بلا عقدة NGO ولا اسم المؤسسة في صفحات الأفراد والشركات.
   */
  function paidJsonLd(ps, base, pagePath, { title, description, faq }) {
    const svcId = `${base}/services#paid-services`;
    const b2b = app.settings.get('b2b_enabled') !== false;
    let address = postalAddress(ps);
    if (ps.firm_city) address = { ...(address || { '@type': 'PostalAddress', addressCountry: 'EG' }), addressLocality: ps.firm_city };
    const service = {
      '@type': 'LegalService',
      '@id': svcId,
      name: ps.brand_name,
      legalName: ps.firm_legal_name || undefined,
      brand: { '@type': 'Brand', name: ps.brand_name },
      url: `${base}/services`,
      image: `${base}/assets/img/og-image.png`,
      logo: `${base}/assets/img/icon-512.png`,
      telephone: ps.org_phone_e164 || undefined,
      email: ps.org_email || undefined,
      address,
      foundingDate: ps.firm_founded || undefined,
      areaServed: { '@type': 'Country', name: 'مصر' },
      availableLanguage: 'ar',
      knowsAbout: PAID_KNOWS_ABOUT.filter((k) => b2b || k !== 'مستشار قانوني للشركات'),
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

  function headTags(ps, base, pagePath, { title, description, noindex, faq, ld, canonicalPath, saveData, publicData = true }) { // v12 look (H-L1): saveData
    const canonical = `${base}${canonicalPath || pagePath}`;
    const image = `${base}/assets/img/og-image.png`;
    // v12 entry (L12-85): صفحات الأفراد والشركات «{اسم المكتب}: محاماة واستشارات قانونية»؛ «خيري» كما في v11
    const imageAlt = ps.side === 'paid' ? `${ps.firm_name}: محاماة واستشارات قانونية` : `${ps.brand_name}: ${ps.org_tagline || 'دعم قانوني للأرامل والأيتام وأسرهم'}`;
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
      // v12 entry: ld='none' في صفحات الخطوات (/start/…، noindex) وصفحة «خيري» المتوقفة
      ld === 'none' ? '' : `<script type="application/ld+json">${jsonLd(ps, base, canonicalPath || pagePath, { title, description, faq, ld })}</script>`,
      // v9.1 (B91-11): خط عربي مستضاف محليًا (الوزن العادي يُحمّل مبكرًا) وبيانات الصفحة دون طلب /api/meta
      '<link rel="preload" href="/assets/fonts/plex-arabic-400.woff2" as="font" type="font/woff2" crossorigin />',
      // v12 look (H-L1, L12-13): وجه العناوين (Amiri) يُحمَّل مبكرًا في /services وحدها، ولا يُحمَّل مع «Save-Data: on»
      SAVE_DATA_PAGES.has(pagePath) && !saveData ? '<link rel="preload" href="/assets/fonts/amiri-arabic-400-sub.woff2" as="font" type="font/woff2" crossorigin />' : '',
      // v12 entry: صفحات الشجرة لا تقرأ bm-public (entry.js بلا بيانات) فلا تحمله
      publicData ? `<script type="application/json" id="bm-public">${jsonForScript(publicBlock(ps))}</script>` : '',
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
  // v12 gate (K-P7): only = الكتلة المسماة وحدها (بلا الكتل العامة) لإلحاقها بكتلة أخرى (legal-paid بعد legal)
  function criticalCss(name = '', { only = false } = {}) {
    const file = path.join(pub, 'assets/css/public-site.css');
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return '';
    }
    const key = `${st.size}-${st.mtimeMs}`;
    const ck = only ? `only:${name}` : name;
    const hit = criticalCache.get(ck);
    if (hit && hit.key === key) return hit.css;
    const text = fs.readFileSync(file, 'utf8');
    let css = '';
    // v11 gate-public: العلامة تبدأ التعليق نفسه (/* @critical-start…)، فتعليق يذكر «@critical-start:legal» وسط الملف لا يفتح كتلة؛
    // والكتل المسماة بعد علامة H-G2 تُغلق بـ /* @critical-end:<name> */ (CRITICAL_RE مصدر واحد للخادم والاختبارات)
    for (const m of text.matchAll(CRITICAL_RE)) {
      if (only ? m[1] === name : !m[1] || m[1] === name) css += m[2];
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
    criticalCache.set(ck, { key, css });
    return css;
  }

  /**
   * v12 gate (K-P7): نص الصفحات القانونية للأفراد والشركات (و404) طويل، فوصول IBM Plex بعد أول رسم على 3G يعيد لف الفقرات
   * ويزيح ما تحتها (CLS ‎0.012–0.023 على /privacy بـ Fast 3G + 4× CPU). هنا الأوجه نفسها (الملف والمدى نفسيهما من الكتلة
   * العامة، فلا نسخة ثانية تُحمَّل) باسم «Emam Text» و font-display: optional، و--f-ui/--f-display/--pub-font تشير إليه
   * (:root:root تغلب :root في public-site.css الذي يُحمَّل بعد الرأس). زيارة أولى بطيئة تقرأ الصفحة بخط النظام دون إزاحة، والصفحة
   * التالية تجد الخط في الذاكرة فتعرضه. «خيري» لا يمسه شيء (الجانب paid وحده).
   */
  function legalTextFontCss(css) {
    const faces = (css.match(/@font-face\{font-family:"IBM Plex Sans Arabic";[^}]*\}/g) || []).map((r) =>
      r.replace('font-family:"IBM Plex Sans Arabic"', 'font-family:"Emam Text"').replace('font-display:swap', 'font-display:optional'),
    );
    if (!faces.length) return '';
    // v12 gate (V-16): + «Emam Latin» (Plex اللاتيني 400، optional) للأرقام؛ :root:root:root يغلب :root:has(> body[data-side=paid])
    const stack = '"Emam Text","Emam Latin","Segoe UI",Tahoma,sans-serif';
    return `${faces.join('')}:root:root:root{--f-ui:${stack};--pub-font:${stack};--f-display:"Emam Display","Emam Text","Times New Roman",serif}`;
  }

  const RENDER_CONTROL_KEYS = new Set(['side', 'canonical', 'ld', 'faq', 'company', 'view', 'publicData']);

  /**
   * v11 gate-public (GP-5، G11-05): عنوان /intake ووصفه ونصوصه الثابتة (تحميل بطيء، متصفح قديم، بلا JavaScript) حسب الجانب؛
   * «خيري» = نصوص 10.0 حرفيًا. company = شاشة طلب عرض الشركات (company/counsel/proposal في الشجرة).
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

  /**
   * v12 gate (V-19): للأفراد والشركات زر ممتلئ واحد («متابعة طلب») ورابطان نصيان (nf_alt)، وعنوان عادي لا سؤال بلاغي (§5.11).
   * v11 gate-public (G11-52، P1) + v12 entry (E12-71 #14): صفحة 404 — «خيري» = نص 10.0 حرفيًا (يظهر فقط حين يُعاد «خيري»
   * وكعكة الزائر «خيري»)؛ الأفراد والشركات: «الصفحة الأولى» و«طلب جديد» ← «/».
   */
  function notFoundView(ps, side) {
    if (side !== 'paid') {
      return { nf_title: `الصفحة غير موجودة — ${ps.site_name}`, nf_h1: 'الصفحة دي مش موجودة', nf_text: 'ممكن الرابط يكون ناقص أو اتقطع منه حتة وهو بيتنسخ من واتساب.', nf_h2: 'تحبي تعملي إيه؟', nf_follow: 'تابعي طلبك', nf_new: 'احكيلنا مشكلتك', nf_new_href: '/intake?seg=charity', nf_home_href: '/khayri', nf_home: 'الصفحة الرئيسية', nf_crumb: 'الرئيسية', nf_call: 'للمساعدة كلمينا:', nf_sep: ' — ', nf_alt: 'pub-btn pub-btn-outline' };
    }
    return { nf_title: `الصفحة غير موجودة | ${ps.brand_name}`, nf_h1: 'الصفحة غير موجودة', nf_text: 'قد يكون الرابط ناقصًا، أو انقطع جزء منه عند نسخه.', nf_h2: 'اختاروا ما تريدون:', nf_follow: 'متابعة طلب', nf_new: 'طلب جديد', nf_new_href: '/', nf_home_href: '/', nf_home: 'الصفحة الأولى', nf_crumb: 'الصفحة الأولى', nf_call: 'للمساعدة اتصلوا بنا:', nf_sep: '، ', nf_alt: 'pub-nf-link' };
  }

  /** v11 gate-public (G11-47، P1): نصوص /portal الثابتة حسب جانب الزائر (والباقي في bm-copy لـ portal-login.js) */
  function portalLoginView(ps, side) {
    // v11 fixer-public (K5، GP-6 P1، r2 S29): الشعار الذهبي الداكن (أرضية بيضاء) فوق العنوان؛ نصه البديل اسم المكتب من الإعداد
    const signin_logo = `<img class="pub-signin-logo" src="${imgUrl('/assets/img/emam-logo-gold-deep.svg')}" width="240" height="100" alt="${esc(ps.brand_name)}" ${nameDirAttrs(ps.brand_name)} decoding="async" />`;
    if (side !== 'paid') {
      return {
        signin_logo,
        pl_title: `متابعة طلبك — ${ps.brand_name}`,
        pl_desc: `ارجعي لصفحة طلبك عند ${ps.brand_name}: افتحيها من الموبايل ده، أو كلمينا وهنبعتلك الرابط.`,
        pl_h1: 'تابعي طلبك',
        pl_loading: 'بنجهّز الصفحة…',
        pl_nojs: 'الصفحة دي محتاجة تشغيل JavaScript. ممكن تكلمنا على طول وهنبعتلك رابط صفحتك:',
      };
    }
    return {
      signin_logo,
      pl_title: `متابعة طلبكم | ${ps.brand_name}`,
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
      // v12 gate (V-07، K12-54): صفحة الطلب الخاصة برأس الورقة وحده (العلامة → «/»)، بلا قائمة الموقع ولا «ابدأوا طلبكم»،
      // فيبقى «قراءة الرسالة» الزر الممتلئ الوحيد
      header: headerHtml(ps, '/p/', { nav: false }),
      pv_title: `متابعة طلبكم | ${ps.brand_name}`,
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
    return `<script type="application/json" id="bm-copy">${jsonForScript(intakePaidCopy({ companyPortal: companyPortalOpen(), leadCss: imgUrl('/assets/css/v11-lead.css'), voice: app.settings.get('web_voice_enabled') === true }))}</script>`;
  }

  /** v12 entry: أجزاء /services (E12-60…66) */
  function paidView(ps, wa) {
    return {
      svc_rows: svcRowsHtml(),
      paid_ways: paidWaysHtml(ps, wa),
      paid_hours: ps.office_hours ? `مواعيد العمل: ${ps.office_hours}` : '',
      paid_how: paidHowHtml(wa),
      companies_band: companiesBandHtml(ps),
      paid_trust: paidTrustHtml(),
      paid_partners: partnersHtml(ps),
      paid_faq: paidFaqHtml(ps),
      paid_contact_list: paidContactListHtml(ps, wa, { tag: 'S-61', mapTag: 'S-79', telTag: 'S-80', waTag: 'S-81', mailTag: 'S-82' }),
      paid_contact_buttons: paidContactButtonsHtml(ps, wa),
    };
  }

  /**
   * يبني الصفحة كاملة من القالب: القيم، الرأس، التذييل، ووسوم SEO.
   * extra.side ('charity'|'paid') صريح، وإلا الأفراد والشركات ما دام «خيري» متوقفًا، وإلا جانب الكعكة (v11)؛
   * extra.canonical = مسار canonical إن اختلف عن pagePath؛ extra.ld = 'paid'|'charity'|'none'؛ extra.faq = أسئلة JSON-LD؛
   * extra.view(ps, wa) = قيم إضافية تُبنى بإعدادات جانب الصفحة؛ extra.publicData=false = بلا bm-public.
   * الصفحة تعتمد على الكعكة حين يُعاد «خيري»: ردها يحمل Vary: Cookie دائمًا (req.bmVary، E12-12).
   */
  function renderPage(file, req, pagePath, extra = {}) {
    // v12 gate (K-P4): الصفحة التي يتغير رأسها بـ«Save-Data» (تحميل Amiri المسبق في /services) تقول ذلك في Vary أيضًا
    if (req) req.bmVary = SAVE_DATA_PAGES.has(pagePath) ? 'Cookie, Save-Data' : 'Cookie';
    const side = pageSide(req, extra.side);
    const ps = sideSettings(publicSettings(), side);
    const base = baseUrl(req);
    // v9.1 (B91-12): الرسالة الجاهزة بكلامها هي، بسيطة ومحايدة (تصلح للأم والأب)؛ v12: الجملة العامة للأفراد والشركات
    const wa = waLink(ps.whatsapp_digits, ps.greeting);
    // v9.2: المؤسسة مقفولة الآن؟ (null = لا جدول مضبوط: لا نقول «مقفولين» بلا معلومة)
    const open = app.portal?.officeOpen ? app.portal.officeOpen(app.settings.get('office_hours_schedule')) : null;
    const view = {
      ...ps,
      base_url: base,
      year: String(new Date().getFullYear()),
      whatsapp_url: wa,
      // للنصوص البديلة في القوالب (<!--#if no_whatsapp-->) حين لا يوجد رقم واتساب فعلي بعد
      no_whatsapp: wa ? '' : '1',
      whatsapp_deletion_url: waLink(ps.whatsapp_digits, side === 'paid' ? DELETION_PAID_PREFILL : 'السلام عليكم، ده «طلب حذف بياناتي» من عندكم. اسمي: '),
      org_phone_href: ps.org_phone_e164 || ps.org_phone,
      side,
      // صفحة «خيري» الرئيسية (/khayri حين يُعاد «خيري»): عنوانها ووصفها كما في 10.0
      home_title: TITLES.charity(ps.brand_name),
      home_description: TITLES.charityDesc(ps.org_legal_name),
      header: headerHtml(ps, pagePath),
      footer: footerHtml(ps, wa),
      // v11 gate-public: قائمة التواصل بكلام الجانب (نماذج /intake الاحتياطية والصفحات القانونية)
      contact_list: side === 'paid' ? paidContactListHtml(ps, wa, { tag: 'F-33', mapTag: 'F-34', telTag: 'F-35', waTag: 'F-36', mailTag: 'F-37' }) : contactListHtml(ps, wa),
      socials: socialHtml(ps),
      services: servicesHtml(),
      faq: faqHtml(ps),
      programs: programsHtml(),
      brand_mark: brandSvg({ size: 120 }),
      // v9.1 (B91-07/B91-15): أجزاء الصفحة الرئيسية
      audience: audienceHtml(),
      contact_buttons: contactButtonsHtml(ps, wa),
      icon_check: iconSvg('check', 20),
      icon_lock: iconSvg('lock', 20),
      icon_wallet: iconSvg('wallet', 20),
      icon_whatsapp: iconSvg('whatsapp', 20),
      icon_phone: iconSvg('phone', 20),
      // v11 fixer-public (V2): سطر المواعيد بصيغة الجانب (404 للأفراد والشركات: «نستقبل اتصالاتكم …»)
      office_hours_line: ps.office_hours ? (side === 'paid' ? `نستقبل اتصالاتكم ${ps.office_hours}` : `بنرد ${ps.office_hours}`) : '',
      // v11 fixer-public (V1/F-F): مفاتيح الجانب للقوالب (<!--#if side_paid--> في «بالمختصر» بالصفحات القانونية)
      side_paid: side === 'paid' ? '1' : '',
      side_charity: side === 'paid' ? '' : '1',
      // v12 entry (E12-13): فاصل العنوان « | » على صفحات الأفراد والشركات بدل «—» (صفحات «خيري» تبقى كما هي)
      title_sep: side === 'paid' ? '|' : '—',
      // v12 entry review (R4): أول «مسار التصفح» في الصفحات القانونية مثل 404 — الأفراد والشركات «الصفحة الأولى» ← «/»؛ «خيري» «الرئيسية»
      // ← /khayri (صفحة «خيري» أو صفحتها المتوقفة، لا صفحة الأتعاب)
      crumb_home_href: side === 'paid' ? '/' : '/khayri',
      crumb_home: side === 'paid' ? 'الصفحة الأولى' : 'الرئيسية',
      // v12 entry (E12-69): «خيري» معروض أم متوقف (بند bm_seg في الخصوصية وبند «خيري» في الشروط)
      charity_on: charityPublic() ? '1' : '',
      charity_off: charityPublic() ? '' : '1',
      // v12 entry (L12-29): فقرات media (نص ثابت حسب الإعدادات) في الصفحتين القانونيتين
      media_privacy: file === 'privacy.html' ? (app.media?.privacyHtml?.(side) ?? '') : '',
      media_deletion: file === 'data-deletion.html' ? (app.media?.deletionHtml?.(side) ?? '') : '',
      // v9.2 public (P3): مربعات صفحة «خيري» الرئيسية، والتحميل المسبق لنموذج الطلب
      start_tiles: startTilesHtml(),
      ways_tiles: waysTilesHtml(ps, wa),
      start_say_outro: startOutro(wa),
      prefetch_urls: file === 'index.html' ? prefetchUrls() : '',
      office_closed: open === false ? '1' : '',
      ...(file === 'services.html' ? paidView(ps, wa) : {}),
      ...(file === 'intake.html' ? intakeView(ps, side, !!extra.company) : {}),
      ...(file === '404.html' ? notFoundView(ps, side) : {}),
      ...(file === 'portal-login.html' ? portalLoginView(ps, side) : {}),
      ...(file === 'portal.html' ? portalView(ps, side) : {}),
      ...(typeof extra.view === 'function' ? extra.view(ps, wa) : {}),
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
    // أسئلة «خيري» في JSON-LD على صفحة «خيري» الرئيسية فقط، وأسئلة الأفراد على /services؛ v12: صفحات الأفراد كلها LegalService
    const faq = extra.faq ?? (file === 'services.html' || (file === 'index.html' && CHARITY_HOMES.has(pagePath)));
    const ld = extra.ld || (side === 'paid' ? 'paid' : 'charity');
    const head = headTags(ps, base, pagePath, { title, description, noindex, faq, ld, canonicalPath: extra.canonical, saveData: /^on$/i.test(String(req?.headers?.['save-data'] || '').trim()), publicData: extra.publicData !== false }); // v12 look (H-L1)
    html = html.replace('<!--site:head-->', () => head);
    // v9.1 (B91-11): تعليقات القوالب للمطورين لا تُرسل لهاتف المستفيدة (بايتات بلا فائدة على باقة محدودة)
    html = html.replace(/<!--(?!site:)[\s\S]*?-->\s*/g, '');
    // <!--site:critical-css--> (الكتل العامة) أو <!--site:critical-css:legal--> (العامة + كتل «legal»)
    html = html.replace(/<!--site:critical-css(?::([a-z0-9-]+))?-->/, (m, name) => {
      let css = criticalCss(name || '');
      // v12 gate (K-P7): صفحات الأفراد والشركات القانونية و404 بلا إزاحة عند وصول الخط (انظر legalTextFontCss)
      if (css && name === 'legal' && side === 'paid') css += legalTextFontCss(css);
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
    sendBody(res, 200, html, { req, vary: req?.bmVary || 'Cookie' }); // v12 gate (K-P4): «Cookie, Save-Data» على /services
  }

  /**
   * يسجل صفحة عامة تُبنى من قالب بنفس الرأس والتذييل ووسوم SEO.
   * optIn: لا تُعالج الصفحة إلا إذا احتوى ملفها على {{{header}}} (لصفحات الوحدات الأخرى مثل /portal).
   */
  function registerPage(pagePath, file, { optIn = false, noindex = false } = {}) {
    app.pageHandlers.set(pagePath, (req, res) => servePage(req, res, file, pagePath, { optIn, noindex }));
  }

  // ───────────── v12 entry: الشجرة «/» و/start/… (EN-1/EN-2، E12-10…14، E12-20…27، L12-76) ─────────────

  const LOGO_DEEP = '/assets/img/emam-logo-gold-deep.svg';
  const MARK_GREEN = '/assets/img/emam-mark-green.svg';

  /** رابط داخلي + معاملات الحملة ('' أو '?utm_…') */
  function withQuery(href, q) {
    return q ? `${href}${href.includes('?') ? '&' : '?'}${q.slice(1)}` : href;
  }

  /** الشعار (L-01): الكبير في «/» ← /services (عن المكتب)، والعلامة الصغيرة في المستويين الثاني والثالث ← «/» (وفي الطلب I-04) */
  function treeLogoHtml(ps, depth, q, tag = 'L-01') {
    const big = depth === 1;
    const href = big ? withQuery('/services', q) : `/${q}`;
    const img = big
      ? `<img src="${imgUrl(LOGO_DEEP)}" width="260" height="109" alt="${esc(ps.brand_name)}" fetchpriority="high" decoding="async" />`
      : `<img src="${imgUrl(MARK_GREEN)}" width="104" height="20" alt="${esc(ps.brand_name)}" decoding="async" />`;
    return `<header class="lh__head${big ? '' : ' lh__head--small'}" data-tag="L-12"><a class="${big ? 'lh__logo' : 'lh__mark'}" href="${esc(href)}" aria-label="${esc(ps.brand_name)}: ${big ? 'عن المكتب' : 'الصفحة الأولى'}" data-tag="${tag}">${img}</a></header>`;
  }

  /** «رجوع» (L-02) إلى الصفحة الأب (لا history.back، فيصح للرابط المشارَك) والمسار (L-03) بكلمات الاختيارات « · »؛ بلا نقاط (L12-03) */
  function treeTrailHtml(page, q) {
    const up = page.back === '/' ? 0 : page.back.split('/').length - 2;
    const to = up ? ` إلى «${esc(page.trail[up - 1].label)}»` : ' إلى الصفحة الأولى';
    return (
      `<nav class="trail" aria-label="المسار" data-tag="L-13"><a class="trail__back" href="${esc(withQuery(page.back, q))}" data-tag="L-02">رجوع<span class="pub-sr">${to}</span></a>` +
      `<span class="trail__sep" aria-hidden="true"></span><span class="trail__path" data-tag="L-03"><span class="pub-sr">اخترتم: </span>${page.trail.map((t) => esc(t.label)).join(' · ')}</span></nav>`
    );
  }

  /** صفوف الاختيار: رابط كامل لكل صف (يعمل بلا JS)، الاسم ثم سطر الإيضاح إن وُجد ثم السهم؛ الرمز من الشجرة */
  function treeOptionsHtml(page, q) {
    const rows = page.options.map(
      (o) => `<li><a class="opt" href="${esc(withQuery(o.href, q))}" data-tag="${esc(o.tag)}"><span class="opt__main"><span class="opt__t">${esc(o.label)}</span>${o.hint ? `<span class="opt__s">${esc(o.hint)}</span>` : ''}</span>${ARROW}</a></li>`,
    );
    return `<ul class="opts${page.options.length > 4 ? ' opts--compact' : ''}" aria-labelledby="q">${rows.join('')}</ul>`;
  }

  /**
   * تذييل الشجرة وإطار الطلب (E12-23 + L12-64، L-04…L-11): «عن المكتب · متابعة طلب · نتصل بكم · واتساب»، وفي «/» وحدها
   * سطر أصغر «الخصوصية · الشروط · دخول الشركات». واتساب بأرقام الأفراد والشركات والجملة العامة PAID_GENERIC.
   */
  function treeFootHtml(ps, q, { small = false } = {}) {
    const wa = waLink(ps.whatsapp_digits, PAID_GENERIC);
    const links = [
      `<a href="${esc(withQuery('/services', q))}" data-tag="L-05">عن المكتب</a>`,
      '<a href="/portal" data-follow data-tag="L-06">متابعة طلب</a>',
      `<a href="${esc(withQuery('/intake?mode=callback', q))}" data-tag="L-07">نتصل بكم</a>`,
    ];
    if (wa) links.push(`<a href="${esc(wa)}" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" data-tag="L-08">واتساب<span class="pub-sr"> (يفتح في نافذة جديدة)</span></a>`);
    let more = '';
    if (small) {
      const s = ['<a href="/privacy" data-tag="L-09">الخصوصية</a>', '<a href="/terms" data-tag="L-10">الشروط</a>'];
      if (companyPortalOpen()) s.push('<a href="/company" data-tag="L-11">دخول الشركات</a>');
      more = `<p class="lh__links lh__links--small">${s.join('')}</p>`;
    }
    return `<footer class="lh__foot" data-tag="L-04"><p class="lh__links">${links.join('')}</p>${more}</footer>`;
  }

  /** الصفحة كلها (§5.6): الشعار، [المسار]، السؤال (رمزه qtag)، الصفوف، [سطر «خيري» حين يُعاد، T-81]، التذييل */
  function treeMainHtml(page, ps, q) {
    const r = TREE.restored;
    const alt = !page.path && charityPublic() ? `<p class="lh__alt" data-tag="${esc(r.tag)}">${esc(r.text)} <a href="${esc(withQuery(r.href, q))}">${esc(r.go)}</a></p>` : '';
    return (
      `<main class="lh">${treeLogoHtml(ps, page.depth, q)}<div class="lh__body">${page.path ? treeTrailHtml(page, q) : ''}` +
      `<h1 class="q__title" id="q" data-tag="${esc(page.qtag)}">${esc(page.q)}</h1>${treeOptionsHtml(page, q)}${alt}</div>${treeFootHtml(ps, q, { small: !page.path })}</main>`
    );
  }

  /** صفحة من الشجرة (200): «/» مفهرسة بـ LegalService؛ /start/… noindex, follow وcanonical لنفسها، بلا JSON-LD ولا bm-public */
  function renderTree(req, res, url, treePath, ctx) {
    const page = pageOf(treePath, ctx);
    if (!page) return redirectTo(res, url, '/', 302);
    const q = campaignQuery(url);
    const html = renderPage('entry.html', req, treePath ? `/start/${treePath}` : '/', {
      side: 'paid',
      noindex: !!treePath,
      ld: treePath ? 'none' : 'paid',
      faq: false,
      publicData: false,
      view: (ps) => ({
        tree_title: treePath ? TITLES.tree(page.trail.map((t) => t.label), page.q, ps.brand_name) : TITLES.home(ps.brand_name),
        tree_description: TITLES.homeDesc,
        tree_depth: String(page.depth),
        // E12-25: المستوى الثالث يحمّل ملفات نموذج الطلب مسبقًا (entry.js بعد التحميل)
        tree_prefetch: page.depth === 3 ? prefetchUrls({ charity: false }) : '',
        // E12-24: الشعار الكبير يُحمَّل مبكرًا في «/» وحدها
        tree_preload: treePath ? '' : `<link rel="preload" as="image" href="${imgUrl(LOGO_DEEP)}" fetchpriority="high" />`,
        tree_main: treeMainHtml(page, ps, q),
      }),
    });
    if (!treePath) clearStaleSeg(req, res);
    app.pathways?.countView?.(treePath, req);
    sendHtml(req, res, html);
    return true;
  }

  /**
   * «/» و/start/… (E12-10، L12-63، L12-76): pathways.classify هو المحلل الوحيد، وكل Location = canonical + معاملات الحملة.
   * /?gate=1 ← 301 «/» (لا شاشة اختيار)؛ /?topic=<مفتاح> (حملات 10.0) ← 302 إلى مكانه في الشجرة. /start و/start/ ← 301 «/»؛
   * شرطة أخيرة ← 301 بدونها؛ ورقة ← 302 /intake?path=…؛ مخرج ← 302 /company؛ معرّف متقاعد ← 301 إلى بديله؛ غير ذلك ← 302
   * إلى أعمق صفحة صالحة قبله (أو «/»). سياق الشجرة: خدمة الشركات متوقفة تخفي «مستشار قانوني للشركة»، والبوابة المغلقة تتخطى سؤالها.
   */
  /**
   * مسار الشجرة لمفتاح موضوع قديم (E12-06): المفاتيح وأسماؤها القديمة في 9.1 (inheritance، pensions، housing، documents)
   * تمر أولًا على topicByKey كما في 11.0 — v12 entry review (R1): كانت الأسماء القديمة تسقط إلى «/».
   */
  function topicPathOf(raw) {
    const t = raw ? topicByKey(String(raw)) : null;
    return t && Object.hasOwn(TOPIC_TO_PATH, t.key) ? TOPIC_TO_PATH[t.key] : null;
  }

  function serveTree(req, res, url) {
    const ctx = app.pathways?.treeCtx?.() ?? { b2b: true, portal: true };
    const p = url.pathname;
    if (p === '/') {
      const sp = url.searchParams;
      if (sp.get('gate') === '1') return redirectTo(res, url, '/', 301);
      const topicPath = topicPathOf(sp.get('topic'));
      if (topicPath) return redirectTo(res, url, app.pathways.classify(topicPath, ctx).canonical, 302);
      return renderTree(req, res, url, '', ctx);
    }
    const slash = p.length > 7 && p.endsWith('/');
    const raw = slash ? p.replace(/\/+$/, '') : p;
    const c = app.pathways.classify(raw, ctx);
    if (c.kind === 'page' && c.canonical === raw) return slash ? redirectTo(res, url, raw, 301) : renderTree(req, res, url, c.path, ctx);
    return redirectTo(res, url, c.canonical, c.kind === 'root' || c.kind === 'retired' ? 301 : 302);
  }

  // ───────────── v12 entry: «خيري» متوقف على الموقع (EN-3، E12-70…75، L12-49) ─────────────

  /** رقم واتساب «خيري» (L12-49): الرقم الأساسي ما لم يكن مخصصًا للأفراد والشركات وحدهم؛ '' = بلا زر */
  function charityDigits() {
    try {
      const main = app.segments?.lines?.()?.[0];
      if (main) return main.mode === 'paid' ? '' : main.digits || '';
    } catch {
      /* الرقم من الإعدادات */
    }
    return waDigits(app.settings.all());
  }

  /**
   * روابط «خيري» القديمة و/intake?seg=charity بلا via=p ما دام «خيري» متوقفًا (L12-49، O-44): صفحة واحدة بنبرة «خيري»
   * (200، noindex، KH-01…KH-04، زر واتساب «خيري» فقط إن ضُبط رقمه، ومعاملات الحملة على روابطها، وتُعد زيارتها)، أو
   * 302 «/» حين تختار الإدارة charity_archived_landing='redirect' (سلوك D2). 302 دائمًا (المفتاح قابل للعكس).
   */
  function serveCharityArchived(req, res, url) {
    if (app.settings.get('charity_archived_landing') === 'redirect') return redirectTo(res, url, '/', 302);
    const q = campaignQuery(url);
    const waHref = waLink(charityDigits(), SITE_GREETING);
    const html = renderPage('khayri-paused.html', req, '/khayri', {
      side: 'charity',
      noindex: true,
      ld: 'none',
      faq: false,
      publicData: false,
      view: (ps) => {
        // v12 gate (JR-15): بلا رقم واتساب لـ«خيري» يبقى طريق للتواصل: زر اتصال بهاتف «خيري» (رقم المؤسسة في الإعدادات)
        const tel = !waHref && ps.org_phone ? ps.org_phone_e164 || ps.org_phone : '';
        return {
          header: headerHtml(ps, '/khayri', { nav: false, home: null }),
          charity_contact_href: waHref || (tel ? `tel:${tel}` : ''),
          charity_contact_class: waHref ? 'pub-btn-whatsapp' : 'pub-btn-teal',
          charity_contact_label: waHref
            ? 'واتساب «خيري»<span class="pub-sr"> (يفتح في نافذة جديدة)</span>'
            : `اتصال بـ«خيري» <bdi dir="ltr">${esc(ps.org_phone || '')}</bdi>`,
        };
      },
      charity_wa_href: waHref,
      campaign_q: q,
      campaign_amp: q ? `&${q.slice(1)}` : '',
    });
    app.pathways?.countView?.('khayri', req);
    sendHtml(req, res, html);
    return true;
  }

  /** /khayri: صفحة «متوقف» (أعلاه) ما دام «خيري» متوقفًا؛ حين يُعاد: صفحة «خيري» الرئيسية بلا شاشة (v11) وكعكتها الدائمة */
  function serveKhayri(req, res, url) {
    if (!charityPublic()) return serveCharityArchived(req, res, url);
    setSegCookie(req, res, 'charity', { persist: true });
    sendHtml(req, res, renderPage('index.html', req, '/khayri', { side: 'charity', seg_sync: '1' }));
    return true;
  }

  /** /services: صفحة المكتب (E12-60)، دائمًا بجانب الأفراد والشركات؛ لا تكتب كعكة، وتمسح كعكة قديمة ما دام «خيري» متوقفًا */
  function serveServices(req, res) {
    clearStaleSeg(req, res);
    sendHtml(req, res, renderPage('services.html', req, '/services', { side: 'paid' }));
    return true;
  }

  // ───────────── v12 entry: /intake (E12-10، E12-71 #4، E12-74) ─────────────

  const ENTRY_RE = /^[a-z_]{1,30}$/;
  /** يضيف entry (مصدر الدخول، كلمة من [a-z_]) من الرابط إلى هدف /intake داخلي */
  function withEntry(url, target) {
    const e = url?.searchParams?.get('entry');
    return e && ENTRY_RE.test(e) && !/[?&]entry=/.test(target) ? `${target}${target.includes('?') ? '&' : '?'}entry=${e}` : target;
  }

  /**
   * صفحة النموذج: الأفراد والشركات (ورقة من الشجرة، أو «نتصل بكم») أو نموذج «خيري» (حين يُعاد، أو من صفحة متابعة خيرية via=p).
   * الورقة: bm-path من الشجرة (E12-33) وعنوانها «{اسم الورقة} | {المكتب}» (E12-13)؛ صفحات الأفراد noindex.
   */
  function renderIntake(req, res, { side, leaf = null, ctx = null, url = null }) {
    const paid = side === 'paid';
    const company = leaf === 'company/counsel/proposal';
    const bm = leaf ? bmPathFor(leaf, ctx) : null;
    const q = url ? campaignQuery(url) : '';
    let html;
    try {
      html = renderPage('intake.html', req, '/intake', {
        side,
        company,
        canonical: leaf ? `/intake?path=${leaf}` : paid ? '/intake?mode=callback' : '/intake?seg=charity',
        noindex: paid,
        ...(paid ? { ld: 'paid', faq: false } : {}),
        view: (ps) => ({
          ...(bm ? { intake_title: company ? `طلب عرض لخدمات الشركات | ${ps.brand_name}` : `${bm.name_prefix} | ${ps.brand_name}` } : {}),
          ...(paid ? intakeChromeView(ps, bm, q, ctx) : { v11_main: '1' }),
        }),
      });
    } catch (e) {
      if (e && e.code === 'ENOENT') return false;
      throw e;
    }
    // v11 gate-public (GP-5): نصوص الأفراد والشركات للنموذج — في صفحتهم فقط، فصفحة «خيري» كما في 10.0 بايتًا ببايت (<main>)
    // v12 entry: وصور «خيري» (pictos.js) تُحمَّل مسبقًا في صفحته وحدها (intake.js يستوردها عند الحاجة)
    // v12 gate (R-01): طلب عرض الشركات يحمّل v11-lead.css في <head> (كان intake-company.js يضيفه بعد رسم الحقول فتتحرك)
    const leadCss = company ? `\n    <link rel="stylesheet" href="${imgUrl('/assets/css/v11-lead.css')}" data-lead-css />` : '';
    const extraHead = paid
      ? intakeCopyBlock() + leadCss + (bm ? `\n    <script type="application/json" id="bm-path">${jsonForScript(bm)}</script>` : '')
      : `<link rel="modulepreload" href="${imgUrl('/assets/js/public/pictos.js')}" />`;
    html = html.replace('</head>', () => `${extraHead}
  </head>`);
    sendHtml(req, res, html);
    return true;
  }

  /**
   * v12 entry (E12-31، E12-43، §5.6): إطار طلب الأفراد والشركات — بلا رأس الموقع وتذييله. العلامة الخضراء ← «/» (I-04)، و«رجوع»
   * إلى صفحة الورقة في الشجرة (I-03؛ intake.js يجعله «الشاشة السابقة» بعد أول شاشة)، والمسار بكلمات الشجرة (I-01؛ في طلب عرض
   * الشركات «تأسيس شركات · مستشار قانوني للشركة»، وفي «نتصل بكم» كلمتها)، وتذييل الشجرة (L-04…L-08). معاملات الحملة على الروابط.
   */
  function intakeChromeView(ps, bm, q, ctx) {
    const back = bm ? bm.back : '/';
    const parent = back === '/' ? null : pageOf(back.slice(7), ctx || undefined);
    const to = parent ? ` إلى «${esc(parent.trail[parent.trail.length - 1].label)}»` : ' إلى الصفحة الأولى';
    const words = bm ? (bm.lead ? bm.trail.slice(0, -1) : bm.trail) : ['نتصل بكم'];
    return {
      lh: '1',
      header: '',
      footer: '',
      lh_head: treeLogoHtml(ps, 2, q, 'I-04'),
      lh_trail:
        `<nav class="trail" aria-label="المسار" data-tag="I-196"><a class="trail__back" href="${esc(withQuery(back, q))}" data-tag="I-03">رجوع<span class="pub-sr">${to}</span></a>` +
        `<span class="trail__sep" aria-hidden="true"></span><span class="trail__path" data-tag="I-01"><span class="pub-sr">اخترتم: </span>${words.map(esc).join(' · ')}</span></nav>`,
      lh_foot: treeFootHtml(ps, q),
      // v12 gate (R-01): خط الخطوة (I-02) من الخادم دائمًا، ويملؤه intake.js (stepLine) — أول شاشة في الورقة «1 من (أسئلتها + 3)»
      // (السؤال الأول، أو «احكوا لنا» بلا أسئلة) فمكانها ثابت من أول رسم؛ طلب عرض الشركات و«نتصل بكم» يبدآن بلا خط (hidden)
      lh_step: `<p class="step" aria-live="polite" data-tag="I-02"${bm && !bm.lead ? '' : ' hidden'}><span class="step__n">${bm && !bm.lead ? `1 من ${bm.ask.length + 3}` : ''}</span><span class="step__bar" aria-hidden="true"><i></i></span></p>`,
      // شاشة أولى أطول من الشاشة (طلب عرض الشركات، ورقم «نتصل بكم»): #intake-root يحجز طول الشاشة من أول رسم (lh-long)
      lh_long: !bm || bm.lead ? '1' : '',
    };
  }

  /**
   * /intake: ?path=<ورقة> النموذج (غير ذلك 302 حسب classify: صفحة ← /start/…، مخرج ← /company، غير صالح ← أعمق صفحة)؛
   * ?seg=charity: نموذج «خيري» حين يُعاد أو مع via=p (صفحة متابعة خيرية، L12-08)، وإلا صفحة «متوقف» (L12-49)؛
   * ?mode=company ← 302 ورقة طلب عرض الشركات؛ ?mode=callback «نتصل بكم»؛ ?topic= / ?area= ← 302 إلى الشجرة؛ وإلا 302 «/».
   */
  function serveIntake(req, res, url) {
    const sp = url.searchParams;
    const ctx = app.pathways?.treeCtx?.() ?? { b2b: true, portal: true };
    const rawPath = sp.get('path');
    if (rawPath !== null) {
      const c = app.pathways.classify(rawPath, ctx);
      if (c.kind === 'leaf' && c.path === rawPath) return renderIntake(req, res, { side: 'paid', leaf: c.path, ctx, url });
      return redirectTo(res, url, c.kind === 'leaf' ? withEntry(url, c.canonical) : c.canonical, c.kind === 'retired' ? 301 : 302);
    }
    if (parseSegment(sp.get('seg')) === 'charity') {
      if (charityPublic()) {
        if (cookieSide(req) !== 'charity') setSegCookie(req, res, 'charity', { persist: false });
        return renderIntake(req, res, { side: 'charity' });
      }
      if (sp.get('via') === 'p') return renderIntake(req, res, { side: 'charity' });
      return serveCharityArchived(req, res, url);
    }
    const mode = sp.get('mode');
    if (mode === 'company') return redirectTo(res, url, withEntry(url, '/intake?path=company/counsel/proposal'), 302);
    if (mode === 'callback') return renderIntake(req, res, { side: 'paid', ctx, url });
    const topicPath = topicPathOf(sp.get('topic'));
    if (topicPath) return redirectTo(res, url, app.pathways.classify(topicPath, ctx).canonical, 302);
    // ?area= كما قبلها 11.0 (intake.js كان يقبلها بأي حالة أحرف: inh = INH)
    const area = String(sp.get('area') || '').toUpperCase();
    if (area && Object.hasOwn(AREA_TO_PATH, area)) return redirectTo(res, url, app.pathways.classify(AREA_TO_PATH[area], ctx).canonical, 302);
    return redirectTo(res, url, '/', 302);
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
      // side صريح (صفحة المتابعة بنبرة طلبها، H-G1؛ أو ?side= في الصفحات القانونية)، وإلا pageSide
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
  // معالجات خاصة بدل العامة (مسارات مطابقة تمامًا، L11-42)
  app.pageHandlers.set('/', serveTree);
  app.pageHandlers.set('/khayri', serveKhayri);
  app.pageHandlers.set('/services', serveServices);
  app.pageHandlers.set('/intake', serveIntake);
  // «عن البرنامج» صفحة البرنامج الخيري (G11-24): حين يُعاد «خيري» فقط؛ وهو متوقف ← 302 /services (E12-71 #3)
  app.pageHandlers.set('/about', (req, res, url) => (charityPublic() ? servePage(req, res, 'about.html', '/about', { side: 'charity' }) : redirectTo(res, url, '/services', 302)));
  // v12 entry (L12-74، E12-69): الصفحات القانونية تحترم ?side=charity|paid صريحًا (روابط صفحات المتابعة الخيرية)، وصفحتها noindex
  for (const [p, file] of [['/privacy', 'privacy.html'], ['/terms', 'terms.html'], ['/data-deletion', 'data-deletion.html']]) {
    app.pageHandlers.set(p, (req, res, url) => {
      const side = parseSegment(url?.searchParams?.get('side'));
      return servePage(req, res, file, p, side ? { side, noindex: true } : {});
    });
  }
  // v12 entry (L12-76): /start وكل ما تحته يمر بـ serveTree. موجّه app.js يطابق المسار تمامًا (app.pageHandlers.has/get)،
  // فتُضاف مطابقة البادئة على الخريطة نفسها (بلا تعديل app.js): has/get تجد serveTree لأي /start أو /start/…
  {
    const handlers = app.pageHandlers;
    const exactHas = Map.prototype.has.bind(handlers);
    const exactGet = Map.prototype.get.bind(handlers);
    const isTreeUrl = (k) => typeof k === 'string' && (k === '/start' || k.startsWith('/start/'));
    handlers.has = (k) => exactHas(k) || isTreeUrl(k);
    handlers.get = (k) => (exactHas(k) ? exactGet(k) : isTreeUrl(k) ? serveTree : undefined);
  }
  // صفحة «متابعة طلب» (وحدة المراسلة) تستخدم الرأس والتذييل المشتركين إن وضعت {{{header}}} و{{{footer}}} في قالبها
  // v11 gate-public (G11-47، P1): نصوص الأفراد والشركات في bm-copy لصفحتهم فقط؛ v12: بجانب الأفراد والشركات ما دام «خيري» متوقفًا
  if (!app.pageHandlers.has('/portal')) {
    app.pageHandlers.set('/portal', (req, res) => {
      const side = pageSide(req);
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
    // v12 entry (E12-13، E12-71 #12): بلا /intake، وصفحتا «خيري» فقط حين يُعاد «خيري»
    const urls = SITE_PAGES.filter((p) => p.sitemap !== false && (!p.charity || charityPublic())).map((p) => {
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
  PRECACHE_SKIP.push(/^\/assets\/js\/lib\/scan(?:-core|-worker|-sheet|ner)\.js$/); // v12 media (H-M11، L12-89): الماسح يُنزَّل عند أول صورة فقط
  PRECACHE_SKIP.push(/^\/assets\/js\/lib\/tags(?:-pages(?:-app)?)?\.js$/); // v12 tags (H-T، T12-32): طبقة الرموز وجدولاها عند الطلب فقط (tags-boot.js يبقى: في إقلاع /app)

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
        // v12 gate (K-S7): اسم المكتب في سطر © لصفحة دخول المنصة كما في تذييل الموقع (firm_legal_name › brand_name)
        firm_name: ps.firm_name,
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
    paidFaqItems,
    criticalCss,
    portalCopyBlock,
    // v12 entry: سياق الشجرة (app.pathways.treeCtx) يسأل هل بوابة الشركات مفتوحة (L12-63)
    companyPortalOpen,
    // v12 entry: «خيري» ظاهر؟ (charity_public)، وجانب الصفحة، وتذييل الشجرة (إطار الطلب، EN-5)
    charityPublic,
    pageSide,
    treeFootHtml,
  };
  return app.site;
}
