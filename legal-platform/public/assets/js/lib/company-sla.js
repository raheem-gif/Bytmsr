// الإصدار 10 — مواعيد الرد والتسليم لخدمة الشركات (L-28): وحدة نقية مشتركة بين الخادم والمتصفح، بلا DOM ولا استيرادات.
// الخادم يحسب بها موعد الرد الأول وموعد التسليم وإيقافهما واستئنافهما، والبوابة تحسب بها «الوعد» قبل الإرسال من مدخلات
// /api/company/plan نفسها — فيتطابق ما تراه الشركة قبل الإرسال مع ما يسجله الخادم (CO-10).
//
// التقويم الواحد للمكتب: b2b_business_hours = null يرث مواعيد العمل العامة office_hours_schedule (اليوم: السبت–الخميس
// 10:00–16:00 بتوقيت القاهرة)، مع العطلات b2b_holidays. الساعة «calendar» (للعاجل) تعمل داخل نافذة b2b_urgent_hours فقط
// (افتراضيًا كل يوم 08:00–22:00؛ ونافذة 00:00–24:00 = 24 ساعة فعلية). كل الحسابات بالتوقيت المحلي للقاهرة (صيفي/شتوي).

export const TZ = 'Africa/Cairo';
export const DEFAULT_BUSINESS_HOURS = Object.freeze({ days: Object.freeze([6, 0, 1, 2, 3, 4]), from: '10:00', to: '16:00' });
export const DEFAULT_URGENT_HOURS = Object.freeze({ days: Object.freeze([0, 1, 2, 3, 4, 5, 6]), from: '08:00', to: '22:00' });
/** «يقترب موعده» عندما يتبقى ≤ max(25% من المدة، 120 دقيقة عمل) — B10 §11 */
export const AT_RISK_SHARE = 0.25;
export const AT_RISK_MIN_MINUTES = 120;
const MAX_DAYS_WALK = 3700;

// ───────────────────────── وقت القاهرة ─────────────────────────
let FMT = null;
function fmt() {
  if (!FMT) {
    FMT = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    });
  }
  return FMT;
}
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** أجزاء الوقت بتوقيت القاهرة { year, month, day, hour, minute, second, weekday (0 = الأحد) } */
export function cairoParts(at) {
  const d = at instanceof Date ? at : new Date(at);
  const parts = fmt().formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(g('hour'));
  return {
    year: Number(g('year')),
    month: Number(g('month')),
    day: Number(g('day')),
    hour: hour === 24 ? 0 : hour,
    minute: Number(g('minute')),
    second: Number(g('second')),
    weekday: WEEKDAY[g('weekday')],
  };
}

/** وقت محلي في القاهرة → ISO (UTC)، مع مراعاة التوقيت الصيفي */
export function cairoLocalToIso(year, month, day, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess;
  for (let i = 0; i < 4; i++) {
    const p = cairoParts(new Date(ts));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const next = guess - (asUtc - ts);
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts).toISOString();
}

const pad = (n) => String(n).padStart(2, '0');
const dayKeyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
/** تاريخ اليوم بتوقيت القاهرة YYYY-MM-DD */
export function cairoDayKey(at) {
  const p = cairoParts(at);
  return dayKeyOf(p.year, p.month, p.day);
}
function nextDay(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
function weekdayOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ───────────────────────── التقويمات ─────────────────────────
function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** هل الشكل { days:[0..6], from:'HH:MM', to:'HH:MM' } صالح (يوم واحد على الأقل، والبداية قبل النهاية)؟ */
export function validHours(h) {
  if (!h || typeof h !== 'object' || !Array.isArray(h.days) || !h.days.length) return false;
  if (!h.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  const from = parseHHMM(h.from);
  const to = parseHHMM(h.to);
  return from !== null && to !== null && from < to;
}

function makeCalendar(hours, holidays = []) {
  const h = validHours(hours) ? hours : null;
  const src = h || DEFAULT_BUSINESS_HOURS;
  const days = [...new Set(src.days.map(Number))].sort((a, b) => a - b);
  return Object.freeze({
    days: Object.freeze(days),
    daySet: new Set(days),
    fromMin: parseHHMM(src.from),
    toMin: parseHHMM(src.to),
    from: hhmm(parseHHMM(src.from)),
    to: hhmm(parseHHMM(src.to)),
    holidays: new Set((Array.isArray(holidays) ? holidays : []).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x)))),
  });
}

/**
 * تقويم العمل الفعلي لخدمة الشركات من الإعدادات: b2b_business_hours (أو مواعيد العمل العامة office_hours_schedule
 * إن كان null) والعطلات b2b_holidays. settings كائن عادي (app.settings.all() أو مدخلات /plan).
 */
export function calendarFrom(settings = {}) {
  const own = settings?.b2b_business_hours;
  const hours = own && validHours(own) ? own : validHours(settings?.office_hours_schedule) ? settings.office_hours_schedule : DEFAULT_BUSINESS_HOURS;
  return makeCalendar(hours, settings?.b2b_holidays || []);
}

/** نافذة الطلبات العاجلة (b2b_urgent_hours) — لا عطلات فيها */
export function urgentCalendar(settings = {}) {
  const u = settings?.b2b_urgent_hours;
  return makeCalendar(validHours(u) ? u : DEFAULT_URGENT_HOURS, []);
}

/** التقويمان معًا { business, urgent } */
export function calendars(settings = {}) {
  return { business: calendarFrom(settings), urgent: urgentCalendar(settings) };
}

/** شكل قابل للإرسال في /api/company/plan: { business:{days,from,to}, urgent:{days,from,to}, holidays:[…] } */
export function calendarJson(cals) {
  return {
    business: { days: [...cals.business.days], from: cals.business.from, to: cals.business.to },
    urgent: { days: [...cals.urgent.days], from: cals.urgent.from, to: cals.urgent.to },
    holidays: [...cals.business.holidays].sort(),
  };
}

/** عكس calendarJson: البوابة تعيد بناء التقويمين من رد /plan */
export function calendarsFromJson(json = {}) {
  return {
    business: makeCalendar(json.business, json.holidays || []),
    urgent: makeCalendar(validHours(json.urgent) ? json.urgent : DEFAULT_URGENT_HOURS, []),
  };
}

function pickCal(clock, cals) {
  if (cals && cals.business && cals.urgent) return clock === 'calendar' ? cals.urgent : cals.business;
  return cals;
}

const isOpenDay = (cal, y, m, d) => cal.daySet.has(weekdayOf(y, m, d)) && !cal.holidays.has(dayKeyOf(y, m, d));

/** هل اللحظة داخل ساعات التقويم (يوم عمل غير عطلة)؟ */
export function isOpen(iso, cal) {
  const p = cairoParts(iso);
  if (!isOpenDay(cal, p.year, p.month, p.day)) return false;
  const min = p.hour * 60 + p.minute;
  return min >= cal.fromMin && min < cal.toMin;
}

/** إضافة دقائق عمل: بداية خارج الساعات ← من أول افتتاح تالٍ */
export function addBusinessMinutes(startIso, minutes, cal) {
  let remaining = Math.max(0, Math.round(Number(minutes) || 0));
  const start = new Date(startIso);
  if (!remaining) return start.toISOString();
  const p = cairoParts(start);
  let [y, m, d] = [p.year, p.month, p.day];
  let cursor = p.hour * 60 + p.minute + p.second / 60;
  for (let i = 0; i < MAX_DAYS_WALK; i++) {
    if (isOpenDay(cal, y, m, d)) {
      const from = Math.max(cursor, cal.fromMin);
      if (from < cal.toMin) {
        const avail = cal.toMin - from;
        if (remaining <= avail) {
          const at = from + remaining;
          const whole = Math.floor(at);
          const iso = cairoLocalToIso(y, m, d, Math.floor(whole / 60), whole % 60);
          // الثواني الكسرية (بداية في منتصف دقيقة) تُضاف كما هي
          return new Date(Date.parse(iso) + Math.round((at - whole) * 60000)).toISOString();
        }
        remaining -= avail;
      }
    }
    [y, m, d] = nextDay(y, m, d);
    cursor = 0;
  }
  return null;
}

/** دقائق العمل بين لحظتين (≥ 0؛ عكس addBusinessMinutes حين a ≤ b) */
export function businessMinutesBetween(aIso, bIso, cal) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!(b > a)) return 0;
  const pa = cairoParts(new Date(a));
  const pb = cairoParts(new Date(b));
  const endKey = dayKeyOf(pb.year, pb.month, pb.day);
  let [y, m, d] = [pa.year, pa.month, pa.day];
  let total = 0;
  for (let i = 0; i < MAX_DAYS_WALK; i++) {
    const key = dayKeyOf(y, m, d);
    const lo = i === 0 ? pa.hour * 60 + pa.minute + pa.second / 60 : 0;
    const hi = key === endKey ? pb.hour * 60 + pb.minute + pb.second / 60 : 1440;
    if (isOpenDay(cal, y, m, d)) total += Math.max(0, Math.min(hi, cal.toMin) - Math.max(lo, cal.fromMin));
    if (key === endKey) break;
    [y, m, d] = nextDay(y, m, d);
  }
  return Math.round(total);
}

/**
 * الموعد بعد عدد ساعات: clock 'business' على تقويم العمل، و'calendar' (العاجل) داخل نافذة العاجل.
 * cals = { business, urgent } (أو تقويم واحد يُستخدم كما هو).
 */
export function dueAt(startIso, hours, clock, cals) {
  return addBusinessMinutes(startIso, Math.round(Number(hours) * 60), pickCal(clock, cals));
}

/** الدقائق المتبقية حتى الموعد على الساعة المختارة (سالبة إذا تأخر: بالدقائق الفعلية) */
export function remainingMinutes(nowIso, dueIso, clock, cals) {
  const cal = pickCal(clock, cals);
  if (Date.parse(dueIso) >= Date.parse(nowIso)) return businessMinutesBetween(nowIso, dueIso, cal);
  return -Math.round((Date.parse(nowIso) - Date.parse(dueIso)) / 60000);
}

/** الإيقاف (انتظار الشركة): الدقائق المتبقية تُحفظ (0 إن كان متأخرًا بالفعل فيبقى «متأخر» بعد الاستئناف) */
export function pauseRemaining(nowIso, dueIso, clock, cals) {
  return Math.max(0, remainingMinutes(nowIso, dueIso, clock, cals));
}

/** الاستئناف: الموعد الجديد = الآن + الدقائق المتبقية على الساعة نفسها */
export function resumeDue(nowIso, remaining, clock, cals) {
  return addBusinessMinutes(nowIso, Math.max(0, Number(remaining) || 0), pickCal(clock, cals));
}

/**
 * حالة الموعد: 'paused' | 'met' | 'missed' | 'late' | 'at_risk' | 'on_track'.
 * at_risk حين يتبقى ≤ max(25% من المدة، 120 دقيقة) على الساعة نفسها.
 */
export function slaState({ startIso, dueIso, doneIso = null, pausedAt = null, clock = 'business', cals, now }) {
  if (doneIso) return Date.parse(doneIso) <= Date.parse(dueIso) ? 'met' : 'missed';
  if (pausedAt) return 'paused';
  if (!dueIso) return 'on_track';
  const nowIso = now instanceof Date ? now.toISOString() : now || new Date().toISOString();
  if (Date.parse(nowIso) > Date.parse(dueIso)) return 'late';
  const cal = pickCal(clock, cals);
  const window = startIso ? businessMinutesBetween(startIso, dueIso, cal) : 0;
  const left = businessMinutesBetween(nowIso, dueIso, cal);
  return left <= Math.max(window * AT_RISK_SHARE, AT_RISK_MIN_MINUTES) ? 'at_risk' : 'on_track';
}

// ───────────────────────── الباقة: الوعد قبل الإرسال ─────────────────────────
export const SLA_PRIORITIES = Object.freeze(['urgent', 'high', 'normal', 'low']);

/** شروط الموعد لدرجة استعجال من شروط الباقة (مع قيم احتياطية معقولة) */
export function slaFor(terms, priority) {
  const s = terms?.sla?.[priority] || terms?.sla?.normal || { first_response_hours: 6, delivery_hours: 18, clock: 'business' };
  return { first_response_hours: Number(s.first_response_hours), delivery_hours: Number(s.delivery_hours), clock: s.clock === 'calendar' ? 'calendar' : 'business' };
}

/** مدة التسليم المعتادة بالساعات لدرجة استعجال وحجم (size_factor من الشروط؛ XL بلا معامل = null) */
export function deliveryHours(terms, priority, size = 'M') {
  const s = slaFor(terms, priority);
  const factor = Number(terms?.size_factor?.[size] ?? (size === 'M' ? 1 : NaN));
  if (!Number.isFinite(factor)) return null;
  return Math.round(s.delivery_hours * factor * 100) / 100;
}

/**
 * «نؤكد لكم موعد التسليم أو نطلب ما ينقص قبل …» لكل درجة (U10-D2، L-54): { normal|high|urgent: { first_response_by, hours, clock, delivery_hours } }.
 * الخادم يسجل first_response_due_at بالدالة نفسها لحظة الإرسال.
 */
export function promisePreview(nowIso, terms, cals) {
  const out = {};
  for (const p of ['normal', 'high', 'urgent']) {
    const s = slaFor(terms, p);
    out[p] = { first_response_by: dueAt(nowIso, s.first_response_hours, s.clock, cals), hours: s.first_response_hours, clock: s.clock, delivery_hours: s.delivery_hours };
  }
  return out;
}

// ───────────────────────── دورات الاستخدام الشهرية (L-28، CS-19) ─────────────────────────
function parseKey(k) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function anchoredStart(y0, m0, anchor, k) {
  const mo = m0 - 1 + k;
  const y = y0 + Math.floor(mo / 12);
  const m = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return dayKeyOf(y, m + 1, Math.min(anchor, last));
}
/**
 * دورة الاستخدام الشهرية التي تقع فيها اللحظة at، مثبتة على يوم بداية الاشتراك startsOn (YYYY-MM-DD):
 * { start, end } بتواريخ القاهرة، end غير مشمول (بداية الدورة التالية). اليوم 31 يُقصّ على آخر الشهر القصير.
 */
export function usageCycle(startsOn, at = new Date()) {
  const s = parseKey(startsOn);
  if (!s) return null;
  const [y0, m0, anchor] = s;
  const atKey = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : cairoDayKey(at);
  if (atKey < startsOn) return { start: startsOn, end: anchoredStart(y0, m0, anchor, 1), index: 0 };
  const [y, m] = parseKey(atKey);
  let k = (y - y0) * 12 + (m - m0);
  if (atKey < anchoredStart(y0, m0, anchor, k)) k -= 1;
  return { start: anchoredStart(y0, m0, anchor, k), end: anchoredStart(y0, m0, anchor, k + 1), index: k };
}
/** حدود الدورة كلحظات ISO (منتصف ليل القاهرة) للمقارنة مع created_at وغيرها */
export function cycleBounds(cycle) {
  const a = parseKey(cycle.start);
  const b = parseKey(cycle.end);
  return { start: cairoLocalToIso(a[0], a[1], a[2], 0, 0), end: cairoLocalToIso(b[0], b[1], b[2], 0, 0) };
}
/** بداية الفترة القادمة من الاشتراك (شهرية/ربع سنوية/سنوية) — محسوبة دائمًا من starts_on (CO-20) */
export function nextPeriodStart(startsOn, period = 'monthly', at = new Date()) {
  const s = parseKey(startsOn);
  if (!s) return null;
  const step = period === 'annual' ? 12 : period === 'quarterly' ? 3 : 1;
  const atKey = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : cairoDayKey(at);
  let k = step;
  for (let i = 0; i < 2400; i++, k += step) {
    const d = anchoredStart(s[0], s[1], s[2], k);
    if (d > atKey) return d;
  }
  return null;
}

// ───────────────────────── نصوص المدد والمواعيد ─────────────────────────
function countForm(n, [one, two, few, many]) {
  const k = Math.abs(Math.round(Number(n) || 0));
  if (k === 1) return one;
  if (k === 2) return two;
  const r = k % 100;
  if (r >= 3 && r <= 10) return `${k} ${few}`;
  return `${k} ${many}`;
}
const BUSINESS_HOURS_FORMS = ['ساعة عمل', 'ساعتي عمل', 'ساعات عمل', 'ساعة عمل'];
const BUSINESS_DAYS_FORMS = ['يوم عمل', 'يومي عمل', 'أيام عمل', 'يوم عمل'];
const HOURS_FORMS = ['ساعة', 'ساعتين', 'ساعات', 'ساعة'];
/** C-03: صيغ الرفع لقيمة قائمة بذاتها (خلية جدول): «ساعتان»، «يوما عمل» */
const BUSINESS_HOURS_NOM = ['ساعة عمل', 'ساعتا عمل', 'ساعات عمل', 'ساعة عمل'];
const BUSINESS_DAYS_NOM = ['يوم عمل', 'يوما عمل', 'أيام عمل', 'يوم عمل'];
const HOURS_NOM = ['ساعة', 'ساعتان', 'ساعات', 'ساعة'];

/** طول يوم العمل بالساعات في التقويم */
export function dayLength(cal) {
  return (cal.toMin - cal.fromMin) / 60;
}

/**
 * المدة كما تُقرأ بعد «خلال» (CO-25): أقل من يوم عمل ← «{n} ساعات عمل»، يوم واحد ← «يوم عمل»، أكثر ← «{⌈الساعات ÷ طول اليوم⌉} أيام عمل».
 */
export function durationText(hours, cal, { standalone = false } = {}) {
  const h = Math.max(0, Number(hours) || 0);
  const len = dayLength(cal || calendarFrom({}));
  const hf = standalone ? BUSINESS_HOURS_NOM : BUSINESS_HOURS_FORMS;
  const df = standalone ? BUSINESS_DAYS_NOM : BUSINESS_DAYS_FORMS;
  if (h < len) return countForm(Math.max(1, Math.ceil(h)), hf);
  if (h === len) return df[0];
  return countForm(Math.ceil(h / len), df);
}

/** ساعات فعلية بعد «خلال»: «ساعة»، «ساعتين»، «8 ساعات» */
export function hoursText(hours, { standalone = false } = {}) {
  return countForm(Math.max(1, Math.ceil(Number(hours) || 0)), standalone ? HOURS_NOM : HOURS_FORMS);
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5]; // الأسبوع يبدأ السبت

/** «10 ص»، «4 م»، «1:30 م» */
export function timeText(min) {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${m ? `${h12}:${pad(m)}` : h12} ${h24 < 12 ? 'ص' : 'م'}`;
}

/** «السبت – الخميس»، «يوميًا»، أو قائمة بالأيام */
export function daysText(days) {
  const set = new Set(days);
  if (set.size === 7) return 'يوميًا';
  if (set.size === 1) return DAY_NAMES[[...set][0]];
  // أطول سلسلة متصلة في ترتيب الأسبوع (بدءًا من السبت، مع الدوران)
  for (let s = 0; s < 7; s++) {
    const run = [];
    for (let i = 0; i < 7; i++) {
      const d = WEEK_ORDER[(s + i) % 7];
      if (!set.has(d)) break;
      run.push(d);
    }
    if (run.length === set.size && !set.has(WEEK_ORDER[(s + 6) % 7])) return `${DAY_NAMES[run[0]]} – ${DAY_NAMES[run[run.length - 1]]}`;
  }
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_NAMES[d]).join('، ');
}

/** «السبت – الخميس، 10 ص – 4 م بتوقيت القاهرة» */
export function businessHoursText(cal) {
  return `${daysText(cal.days)}، ${timeText(cal.fromMin)} – ${timeText(cal.toMin)} بتوقيت القاهرة`;
}

/** «بين 8 ص و10 م يوميًا» (أو «على مدار الساعة يوميًا») */
export function urgentHoursText(cal) {
  const all = cal.days.length === 7;
  if (cal.fromMin === 0 && cal.toMin === 1440) return all ? 'على مدار الساعة يوميًا' : `على مدار الساعة، ${daysText(cal.days)}`;
  return `بين ${timeText(cal.fromMin)} و${timeText(cal.toMin)} ${all ? 'يوميًا' : `، ${daysText(cal.days)}`}`.replace(' ، ', '، ');
}
