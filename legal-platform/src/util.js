// أدوات مساعدة عامة: الوقت، الأموال، الهواتف، النصوص العربية، الأخطاء، التحقق من المدخلات.
import crypto from 'node:crypto';

// ===== الوقت =====
// ساعة قابلة للاستبدال في الاختبارات (للتحكم في الأتمتة المعتمدة على التاريخ)
let clockFn = () => new Date();
export function setClock(fn) {
  clockFn = fn || (() => new Date());
}
export function now() {
  return clockFn();
}
export function nowIso() {
  return now().toISOString();
}
export function addDays(iso, days) {
  const d = new Date(iso);
  d.setTime(d.getTime() + days * 86400000);
  return d.toISOString();
}
export function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}
export function daysBetween(aIso, bIso) {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000;
}

export const TZ = 'Africa/Cairo';

/** أجزاء التاريخ بتوقيت القاهرة */
export function cairoParts(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}
/** الفترة المحاسبية YYYY-MM بتوقيت القاهرة */
export function periodOf(iso) {
  const p = cairoParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}
export function cairoYear(iso) {
  return cairoParts(iso).year;
}
/** مفتاح اليوم YYYY-MM-DD بتوقيت القاهرة */
export function cairoDayKey(iso) {
  const p = cairoParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
/** تحويل وقت القاهرة المحلي (سنة، شهر، يوم، ساعة، دقيقة) إلى ISO بتوقيت UTC مع مراعاة التوقيت الصيفي */
export function cairoLocalToIso(year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // نحسب الإزاحة الفعلية للقاهرة عند هذه اللحظة ثم نصحح (تكرار مرتين يكفي عند حدود التوقيت الصيفي)
  let ts = guess;
  for (let i = 0; i < 3; i++) {
    const p = cairoParts(new Date(ts));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const offset = asUtc - ts;
    const next = guess - offset;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts).toISOString();
}
/** نطاق شهر محاسبي [بداية، نهاية) كـ ISO */
export function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  const start = cairoLocalToIso(y, m, 1, 0, 0);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = cairoLocalToIso(ny, nm, 1, 0, 0);
  return { start, end };
}
export function isValidPeriod(p) {
  return typeof p === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** فترة محاسبية 'YYYY-MM' بالعربية: «سبتمبر 2026» */
export function arabicPeriod(period) {
  const m = String(period || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${AR_MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(period ?? '');
}
/** تاريخ عربي للرسائل: «الأحد 15 نوفمبر 2026» */
export function arabicDate(iso, { weekday = true } = {}) {
  const p = cairoParts(iso);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${weekday ? AR_DAYS[dow] + ' ' : ''}${p.day} ${AR_MONTHS[p.month - 1]} ${p.year}`;
}
/** وقت عربي للرسائل: «10:30 صباحًا» */
export function arabicTime(iso) {
  const p = cairoParts(iso);
  const suffix = p.hour < 12 ? 'صباحًا' : 'مساءً';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, '0')} ${suffix}`;
}

// ===== الأموال (تخزين بالقرش) =====
export function toMinor(egp) {
  if (egp === null || egp === undefined || egp === '') return null;
  const n = Number(egp);
  if (!Number.isFinite(n)) throw badRequest('قيمة مالية غير صالحة');
  return Math.round(n * 100);
}
export function fromMinor(minor) {
  if (minor === null || minor === undefined) return null;
  return Math.round(Number(minor)) / 100;
}
export function formatEgp(minor) {
  const v = fromMinor(minor) ?? 0;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;
}

// ===== الأرقام والهواتف =====
/** تحويل الأرقام العربية-الهندية والفارسية إلى أرقام لاتينية */
export function latinDigits(s) {
  if (s === null || s === undefined) return s;
  return String(s)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/**
 * توحيد رقم الهاتف إلى صيغة E.164.
 * يقبل: 01012345678، 1012345678، 201012345678 (صيغة واتساب)، +201012345678، 00201012345678، بأرقام عربية أو لاتينية.
 * الأرقام الدولية غير المصرية تُقبل إذا بدأت بـ + أو 00.
 */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  let s = latinDigits(String(input)).trim();
  const hadPlus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) {
    s = s.slice(2);
    return finalizeIntl(s);
  }
  if (hadPlus) return finalizeIntl(s);
  // صيغ مصرية محلية
  if (/^01[0125]\d{8}$/.test(s)) return '+20' + s.slice(1);
  if (/^1[0125]\d{8}$/.test(s)) return '+20' + s;
  if (/^201[0125]\d{8}$/.test(s)) return '+' + s;
  // خط أرضي مصري مثل 0223456789
  if (/^0[2-9]\d{7,9}$/.test(s)) return '+20' + s.slice(1);
  // رقم دولي بدون + (مثل معرف واتساب لدولة أخرى)
  if (s.length >= 10 && s.length <= 15) return finalizeIntl(s);
  return null;
}
function finalizeIntl(digits) {
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('20')) {
    // رقم مصري دولي: يجب ألا يحتوي على الصفر بعد كود الدولة
    let rest = digits.slice(2);
    if (rest.startsWith('0')) rest = rest.slice(1);
    return '+20' + rest;
  }
  return '+' + digits;
}
export function isEgyptianMobile(e164) {
  return typeof e164 === 'string' && /^\+201[0125]\d{8}$/.test(e164);
}
/** إخفاء جزئي للهاتف للعرض: +20 10•• ••• 5678 */
export function maskPhone(e164) {
  if (!e164) return '';
  return e164.slice(0, 5) + '•••••' + e164.slice(-4);
}

// ===== النصوص العربية =====
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
/** توحيد النص العربي للبحث والمقارنة */
export function normalizeArabic(text) {
  if (!text) return '';
  return latinDigits(String(text))
    .replace(TASHKEEL, '')
    .replace(/ـ/g, '') // التطويل
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

export function truncate(text, n) {
  if (!text) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// ===== التشفير والمعرفات =====
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}
export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ===== JSON =====
export function parseJson(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ===== الأخطاء =====
export class ApiError extends Error {
  constructor(status, message, code = 'error', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new ApiError(400, msg, 'bad_request', details);
export const unauthorized = (msg = 'يجب تسجيل الدخول أولًا') => new ApiError(401, msg, 'unauthorized');
export const forbidden = (msg = 'غير مصرح لك بتنفيذ هذا الإجراء') => new ApiError(403, msg, 'forbidden');
export const notFound = (msg = 'العنصر المطلوب غير موجود') => new ApiError(404, msg, 'not_found');
export const conflict = (msg, details) => new ApiError(409, msg, 'conflict', details);
export const tooMany = (msg = 'محاولات كثيرة، يرجى الانتظار قليلًا ثم المحاولة مرة أخرى') =>
  new ApiError(429, msg, 'rate_limited');

/**
 * العدد مع معدوده بصيغة عربية سليمة (مطابقة لـ count() في الواجهة):
 * arabicCount(1, F) ← «ملف»، arabicCount(2, F) ← «ملفين»، arabicCount(5, F) ← «5 ملفات»، arabicCount(15, F) ← «15 ملفًا»
 * حيث F = ['ملف', 'ملفين', 'ملفات', 'ملفًا'] (مفرد، مثنى، جمع 3–10، تمييز 11–99).
 * صيغة المفرد تُعاد كما هي، فمرّر «استشارة واحدة» أو «ملف واحد» إن أردت ذكر العدد صراحة مع مراعاة التذكير والتأنيث.
 */
export function arabicCount(n, [one, two, few, many]) {
  const k = Math.abs(Math.round(Number(n) || 0));
  if (k === 1) return one;
  if (k === 2) return two;
  const r = k % 100;
  if (r >= 3 && r <= 10) return `${k} ${few}`;
  if (r >= 11 && r <= 99) return `${k} ${many}`;
  return `${k} ${String(one).replace(/\s+واحد[ةه]?(?=\s|$)/, '')}`;
}

/** نسبة مئوية معزولة الاتجاه (LRI…PDI) مثل percent() في الواجهة: تظهر «36%» لا «%36» بعد النص العربي */
export function arabicPercent(ratio) {
  return `${String.fromCharCode(0x2066)}${Math.round(Number(ratio) * 100)}%${String.fromCharCode(0x2069)}`;
}

/** صيغ عدّ شائعة في نصوص الخادم (للاستخدام مع arabicCount) */
export const AR_UNITS = {
  file: ['ملف', 'ملفين', 'ملفات', 'ملفًا'],
  assignment: ['إسناد', 'إسنادين', 'إسنادات', 'إسنادًا'],
  consultation: ['استشارة', 'استشارتين', 'استشارات', 'استشارة'],
  document: ['مستند', 'مستندين', 'مستندات', 'مستندًا'],
  request: ['طلب', 'طلبين', 'طلبات', 'طلبًا'],
  hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  similar: ['حالة', 'حالتين', 'حالات', 'حالة'],
};
const LETTERS = ['حرف', 'حرفين', 'أحرف', 'حرفًا'];

// ===== التحقق من المدخلات =====
// كل دالة تُرجع القيمة المنظفة أو ترمي خطأ 400 برسالة عربية واضحة تذكر اسم الحقل.
export const v = {
  str(value, label, { required = false, max = 5000, min = 0, trim = true } = {}) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`قيمة «${label}» غير صالحة`);
    let s = String(value);
    if (trim) s = s.trim();
    if (s.length > max) throw badRequest(`«${label}» أطول من المسموح (${arabicCount(max, LETTERS)} كحد أقصى)`);
    if (s.length < min) throw badRequest(`«${label}» أقصر من المطلوب (${arabicCount(min, LETTERS)} على الأقل)`);
    return s;
  },
  oneOf(value, allowed, label, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    if (!allowed.includes(value)) throw badRequest(`قيمة «${label}» غير مسموح بها`);
    return value;
  },
  int(value, label, { required = false, min = -Infinity, max = Infinity } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    const n = Number(latinDigits(value));
    if (!Number.isInteger(n)) throw badRequest(`«${label}» يجب أن يكون عددًا صحيحًا`);
    if (n < min || n > max) throw badRequest(`«${label}» خارج النطاق المسموح`);
    return n;
  },
  num(value, label, { required = false, min = -Infinity, max = Infinity } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    const n = Number(latinDigits(value));
    if (!Number.isFinite(n)) throw badRequest(`«${label}» يجب أن يكون رقمًا`);
    if (n < min || n > max) throw badRequest(`«${label}» خارج النطاق المسموح`);
    return n;
  },
  /** مبلغ بالجنيه → قرش */
  money(value, label, { required = false, min = 0, max = 100000000 } = {}) {
    const n = v.num(value, label, { required, min, max });
    if (n === null) return null;
    if (Math.round(n * 100) !== Math.round(n * 100 * 1000) / 1000) throw badRequest(`«${label}» يقبل منزلتين عشريتين على الأكثر`);
    return Math.round(n * 100);
  },
  bool(value) {
    return value === true || value === 1 || value === '1' || value === 'true' || value === 'on';
  },
  iso(value, label, { required = false } = {}) {
    if (value === undefined || value === null || value === '') {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw badRequest(`«${label}» ليس تاريخًا صالحًا`);
    return d.toISOString();
  },
  ids(value, label) {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw badRequest(`«${label}» يجب أن يكون قائمة`);
    const out = [];
    for (const x of value) {
      const n = Number(x);
      if (!Number.isInteger(n) || n <= 0) throw badRequest(`«${label}» يحتوي على معرف غير صالح`);
      if (!out.includes(n)) out.push(n);
    }
    return out;
  },
  phone(value, label, { required = false, egyptianMobile = false } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') {
      if (required) throw badRequest(`الحقل «${label}» مطلوب`);
      return null;
    }
    const p = normalizePhone(value);
    if (!p) throw badRequest(`رقم «${label}» غير صالح`);
    if (egyptianMobile && !isEgyptianMobile(p)) throw badRequest(`«${label}» يجب أن يكون رقم موبايل مصريًا صحيحًا مثل 01012345678`);
    return p;
  },
  email(value, label, { required = false } = {}) {
    const s = v.str(value, label, { required, max: 200 });
    if (s === null) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw badRequest(`«${label}» غير صالح`);
    return s.toLowerCase();
  },
};

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}
