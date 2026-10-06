// التنسيق: المسميات العربية، المبالغ، التواريخ بتوقيت القاهرة، وتحويلات حقول الإدخال.
// كل الأرقام تُعرض بالأرقام اللاتينية لتتسق مع الأكواد مثل INH-2026-00482.

export const TZ = 'Africa/Cairo';
const LOCALE = 'ar-EG-u-nu-latn';

let META = { constants: { LEGAL_AREAS: [], GOVERNORATES: [], LABELS: {}, ENUMS: {} }, settings: {}, demo: false };

/** يحفظ استجابة /api/meta لاستخدامها في كل المسميات. */
export function setMeta(meta) {
  META = meta || META;
  META.constants = META.constants || { LEGAL_AREAS: [], GOVERNORATES: [], LABELS: {}, ENUMS: {} };
  META.settings = META.settings || {};
  return META;
}

/** يعيد آخر meta محفوظة. */
export function getMeta() {
  return META;
}

/** إعدادات المؤسسة (org_name ...). */
export function settings() {
  return META.settings || {};
}

/** اسم المؤسسة كما في الإعدادات (يُستخدم بدل كتابة الاسم نصًا ثابتًا في الواجهة). */
export function orgName() {
  return META.settings?.org_name || 'بيوت مصر';
}

/** المسمى العربي من LABELS[group][key]، وإلا المفتاح نفسه أو «—». */
export function label(group, key) {
  if (key == null || key === '') return '—';
  const g = META.constants?.LABELS?.[group];
  return (g && g[key]) || String(key);
}

/** اسم المجال القانوني من كوده (INH → مواريث وتركات). */
export function areaLabel(code) {
  if (!code) return '—';
  const a = (META.constants?.LEGAL_AREAS || []).find((x) => x.code === code);
  return a ? a.label : String(code);
}

/** خيارات المجالات القانونية [{value,label}]. */
export function areaOptions() {
  return (META.constants?.LEGAL_AREAS || []).map((a) => ({ value: a.code, label: a.label }));
}

/** خيارات المحافظات [{value,label}]. */
export function governorateOptions() {
  return (META.constants?.GOVERNORATES || []).map((g) => ({ value: g, label: g }));
}

/** خيارات أي مجموعة مسميات [{value,label}]. */
export function options(group) {
  const g = META.constants?.LABELS?.[group] || {};
  return Object.entries(g).map(([value, lbl]) => ({ value, label: lbl }));
}

// ───────────── الأرقام والمبالغ ─────────────

const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });

/** رقم بفواصل الآلاف (1,500). */
export function num(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return NUM.format(Number(n));
}

/** مبلغ بالجنيه المصري: «1,500 ج.م». */
export function money(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  return `${NUM.format(Number(n))} ج.م`;
}

// عزل الاتجاه (LRI … PDI): بدونه تنقلب علامة % بعد نص عربي فتظهر «%73» في موضع و«73%» في آخر.
const LRI = '⁦';
const PDI = '⁩';

/** نص لاتيني الاتجاه معزول داخل جملة عربية (أرقام بعلامات، رموز). */
export function ltr(s) {
  return `${LRI}${s}${PDI}`;
}

/**
 * نسبة مئوية من كسر: 0.734 → «73%» معزولة الاتجاه، فتظهر دائمًا «73%» أيًا كان النص المحيط بها.
 * استخدمها لكل نسبة معروضة بدل بناء `${n}%` يدويًا.
 */
export function percent(ratio, digits = 0) {
  if (ratio == null || Number.isNaN(Number(ratio))) return '—';
  const v = Number(ratio) * 100;
  return ltr(`${digits ? v.toFixed(digits) : Math.round(v)}%`);
}

/** يحوّل الأرقام العربية الهندية (٠-٩ و ۰-۹) إلى لاتينية. */
export function toLatinDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * يطبّع رقم موبايل مصري إلى الصيغة 01XXXXXXXXX أو يعيد null إن لم يكن صحيحًا.
 * يقبل البادئات +20 و 0020 و 20 والأرقام العربية الهندية.
 */
export function normalizeEgPhone(input) {
  let d = toLatinDigits(input).replace(/[\s\-().‎‏‪-‮]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (/^1[0125]\d{8}$/.test(d)) d = `0${d}`;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
}

/** هل النص رقم موبايل مصري صحيح؟ */
export function isEgyptianMobile(input) {
  return normalizeEgPhone(input) !== null;
}

// ───────────── صيغ العدد العربية (مفرد/مثنى/جمع) ─────────────

const UNIT_FORMS = {
  second: ['ثانية', 'ثانيتين', 'ثوانٍ', 'ثانية'],
  minute: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'],
  hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  day: ['يوم', 'يومين', 'أيام', 'يومًا'],
  week: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
  month: ['شهر', 'شهرين', 'أشهر', 'شهرًا'],
  year: ['سنة', 'سنتين', 'سنوات', 'سنة'],
  char: ['حرف', 'حرفين', 'أحرف', 'حرفًا'],
  word: ['كلمة', 'كلمتين', 'كلمات', 'كلمة'],
  file: ['ملف', 'ملفين', 'ملفات', 'ملفًا'],
  item: ['عنصر', 'عنصرين', 'عناصر', 'عنصرًا'],
  case: ['ملف', 'ملفين', 'ملفات', 'ملفًا'],
  request: ['طلب', 'طلبين', 'طلبات', 'طلبًا'],
  notification: ['إشعار', 'إشعارين', 'إشعارات', 'إشعارًا'],
  // الإسناد: ما تكلّف به الإدارة محاميًا في ملف (وحدة العمل في شبكة المحامين)
  assignment: ['إسناد', 'إسنادين', 'إسنادات', 'إسنادًا'],
  // المهمة: مهام الملفات المستمرة (matter tasks) فقط
  task: ['مهمة', 'مهمتين', 'مهام', 'مهمة'],
  // وحدة المحاسبة في الاتفاقات: الاستشارة المعتمدة
  consultation: ['استشارة', 'استشارتين', 'استشارات', 'استشارة'],
  message: ['رسالة', 'رسالتين', 'رسائل', 'رسالة'],
  document: ['مستند', 'مستندين', 'مستندات', 'مستندًا'],
  correction: ['تصحيح', 'تصحيحين', 'تصحيحات', 'تصحيحًا'],
  review: ['مراجعة', 'مراجعتين', 'مراجعات', 'مراجعة'],
  event: ['واقعة', 'واقعتين', 'وقائع', 'واقعة'],
  entry: ['قيد', 'قيدين', 'قيود', 'قيدًا'],
  similar: ['حالة', 'حالتين', 'حالات', 'حالة'],
};

/**
 * عدد مع معدوده بصيغة عربية سليمة: count(1,'day') → «يوم»، count(2,'day') → «يومين»،
 * count(5,'day') → «5 أيام»، count(15,'day') → «15 يومًا».
 * @param {number} n
 * @param {string|string[]} unit مفتاح من UNIT_FORMS أو [مفرد، مثنى، جمع، تمييز]
 */
export function count(n, unit) {
  const forms = Array.isArray(unit) ? unit : UNIT_FORMS[unit];
  const v = Math.abs(Math.round(Number(n) || 0));
  const shown = NUM.format(v); // بفواصل الآلاف مثل num()
  if (!forms) return `${shown} ${unit}`;
  const [one, two, few, many] = forms;
  if (v === 1) return one;
  if (v === 2) return two;
  const r = v % 100;
  if (r >= 3 && r <= 10) return `${shown} ${few}`;
  if (r >= 11 && r <= 99) return `${shown} ${many}`;
  // 0 و100 فأكثر: الرقم ثم المفرد («0 ملف»، «100 ملف»)؛ تُحذف «واحد/واحدة» إن مُرّرت في صيغة المفرد
  return `${shown} ${String(one).replace(/\s+واحد[ةه]?$/, '')}`;
}

/**
 * عدد ساعات قد يكون كسريًا: الأعداد الصحيحة بصيغة العدد العربية («3 ساعات»، «ساعتين»)،
 * والكسرية بالمفرد بعد الرقم («2.5 ساعة»). لا تمرّر الكسور إلى count() لأنه يقرّبها.
 */
export function hours(h) {
  if (h == null || h === '' || Number.isNaN(Number(h))) return '—';
  const n = Number(h);
  return Number.isInteger(n) ? count(n, 'hour') : `${num(n)} ساعة`;
}

// ───────────── التواريخ بتوقيت القاهرة ─────────────

const DTF_DATE = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const DTF_SHORT = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'long' });
const DTF_TIME = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const DTF_WEEKDAY = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, weekday: 'long' });
const DTF_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function toDate(iso) {
  if (iso == null || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** مكونات التاريخ بتوقيت القاهرة لِلَّحظة المعطاة. */
export function cairoParts(date) {
  const parts = {};
  for (const p of DTF_PARTS.formatToParts(date)) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

/** فرق توقيت القاهرة عن UTC (بالمللي ثانية) في لحظة معينة — يراعي التوقيت الصيفي. */
export function cairoOffsetMs(date) {
  const d = date instanceof Date ? date : new Date(date);
  const p = cairoParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** «15 نوفمبر 2026» */
export function date(iso) {
  const d = toDate(iso);
  return d ? DTF_DATE.format(d) : '—';
}

/** «15 نوفمبر» بدون السنة */
export function shortDate(iso) {
  const d = toDate(iso);
  return d ? DTF_SHORT.format(d) : '—';
}

/** «10:30 ص» */
export function time(iso) {
  const d = toDate(iso);
  return d ? DTF_TIME.format(d) : '—';
}

/** «15 نوفمبر 2026، 10:30 ص» */
export function dateTime(iso) {
  const d = toDate(iso);
  return d ? `${DTF_DATE.format(d)}، ${DTF_TIME.format(d)}` : '—';
}

const DTF_DAY = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric' });
const DTF_MONTH = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: 'long' });

/** أجزاء التاريخ للعرض في بطاقات التقويم: { day: '15', month: 'نوفمبر', weekday: 'الأحد', year: 2026 } */
export function calendarParts(iso) {
  const d = toDate(iso);
  if (!d) return { day: '—', month: '', weekday: '', year: null };
  return { day: DTF_DAY.format(d), month: DTF_MONTH.format(d), weekday: DTF_WEEKDAY.format(d), year: cairoParts(d).year };
}

/** اسم اليوم: «الأحد» */
export function weekday(iso) {
  const d = toDate(iso);
  return d ? DTF_WEEKDAY.format(d) : '—';
}

function splitDuration(ms) {
  const s = Math.abs(ms) / 1000;
  if (s < 45) return null;
  const min = Math.round(s / 60);
  if (min < 60) return [Math.max(1, min), 'minute'];
  const hr = Math.round(s / 3600);
  if (hr < 24) return [hr, 'hour'];
  const day = Math.round(s / 86400);
  if (day < 30) return [day, 'day'];
  const month = Math.round(s / (86400 * 30.44));
  if (month < 12) return [month, 'month'];
  return [Math.max(1, Math.round(s / (86400 * 365.25))), 'year'];
}

/** مدة بصيغة عربية: «3 ساعات»، «يومين». */
export function duration(ms) {
  const parts = splitDuration(ms);
  return parts ? count(parts[0], parts[1]) : 'أقل من دقيقة';
}

/** «منذ 3 ساعات» / «بعد يومين» / «الآن». */
export function relative(iso, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return '—';
  const diff = d.getTime() - now;
  const parts = splitDuration(diff);
  if (!parts) return 'الآن';
  const phrase = count(parts[0], parts[1]);
  return diff < 0 ? `منذ ${phrase}` : `بعد ${phrase}`;
}

/**
 * حالة موعد الاستحقاق: متأخر → danger، خلال 24 ساعة → warning، غير ذلك → neutral.
 * @returns {{text:string, tone:'danger'|'warning'|'neutral'|'muted', overdue:boolean}}
 */
export function dueInfo(iso, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return { text: 'بدون موعد', tone: 'muted', overdue: false };
  const diff = d.getTime() - now;
  if (diff < 0) return { text: `متأخر منذ ${duration(diff)}`, tone: 'danger', overdue: true };
  if (diff <= 24 * 3600 * 1000) return { text: `خلال ${duration(diff)}`, tone: 'warning', overdue: false };
  return { text: `بعد ${duration(diff)}`, tone: 'neutral', overdue: false };
}

// ───────────── تحويلات حقول date / datetime-local ─────────────

/** ISO (UTC) → 'YYYY-MM-DDTHH:mm' بتوقيت القاهرة لحقل datetime-local. */
export function isoToCairoInput(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const p = cairoParts(d);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** ISO (UTC) → 'YYYY-MM-DD' بتوقيت القاهرة لحقل date. */
export function isoToCairoDate(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const p = cairoParts(d);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * قيمة 'YYYY-MM-DDTHH:mm[:ss[.sss]]' على أنها وقت القاهرة → ISO UTC.
 * يحسب فرق التوقيت لتلك اللحظة نفسها (التوقيت الصيفي محسوب).
 */
export function cairoInputToIso(value) {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!m) return null;
  const [, y, mo, da, hh = '0', mi = '0', ss = '0', ms = '0'] = m;
  const wall = Date.UTC(+y, +mo - 1, +da, +hh, +mi, +ss, Number(ms.padEnd(3, '0')));
  // تخمين أول بفرق التوقيت عند نفس الرقم كـ UTC، ثم تصحيح إن عبرنا حدّ تغيير التوقيت
  const off1 = cairoOffsetMs(new Date(wall));
  let t = wall - off1;
  const off2 = cairoOffsetMs(new Date(t));
  if (off2 !== off1) t = wall - off2;
  return new Date(t).toISOString();
}

/** 'YYYY-MM-DD' بتوقيت القاهرة → ISO UTC لبداية اليوم (أو نهايته). */
export function cairoDateToIso(value, endOfDay = false) {
  const v = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return cairoInputToIso(`${v}T${endOfDay ? '23:59:59.999' : '00:00'}`);
}

/** تاريخ اليوم بتوقيت القاهرة 'YYYY-MM-DD'. */
export function cairoToday() {
  return isoToCairoDate(new Date());
}

/** «اليوم» / «أمس» / «غدًا» أو التاريخ الكامل. */
export function dayLabel(iso) {
  const d = toDate(iso);
  if (!d) return '—';
  const key = isoToCairoDate(d);
  const today = cairoToday();
  const dayMs = 86400000;
  if (key === today) return 'اليوم';
  if (key === isoToCairoDate(new Date(Date.now() - dayMs))) return 'أمس';
  if (key === isoToCairoDate(new Date(Date.now() + dayMs))) return 'غدًا';
  return `${weekday(d)}، ${date(d)}`;
}
