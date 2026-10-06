// أدوات نقية لوحدة الممارسة (بدون قاعدة بيانات): توحيد الأسماء ومطابقتها، درجة الاحتياج، CSV، وتقويم ICS.
// (الإصدار 9 — وحدة practice) — مستقلة حتى تُختبر مباشرة.
import { normalizeArabic, latinDigits, cairoDayKey, arabicCount } from '../util.js';

// ───────────────────────── الأسماء ─────────────────────────

// ألقاب تُحذف قبل المقارنة (بعد التوحيد: أ→ا، ة→ه، ى→ي)
const TITLES = new Set([
  'السيد', 'السيده', 'الحاج', 'الحاجه', 'الاستاذ', 'الاستاذه', 'استاذ', 'استاذه', 'الدكتور', 'الدكتوره',
  'دكتور', 'دكتوره', 'المهندس', 'المهندسه', 'الشيخ', 'المستشار', 'المحامي', 'المحاميه', 'السيدة', 'مدام', 'د', 'ا', 'م',
]);
// أوصاف عامة لا تصلح وحدها لمطابقة الأسماء («المطلق»، «التاجر الشاكي» ...)
const GENERIC = new Set([
  'المطلق', 'الطليق', 'الزوج', 'الزوجه', 'الخصم', 'التاجر', 'الشاكي', 'المشكو', 'المالك', 'الجار', 'الشركه', 'صاحب',
  'العمل', 'المستاجر', 'المؤجر', 'الموجر', 'البائع', 'المشتري', 'الورثه', 'الاخ', 'الاخت', 'الاب', 'الام', 'العم', 'الخال',
  'غير', 'معروف', 'مجهول', 'الطرف', 'الاخر', 'الثاني', 'ضد', 'و', 'ال', 'المدعي', 'المدعى', 'عليه', 'الجهه', 'الاداريه',
]);

/** توحيد اسم شخص للمقارنة: توحيد الحروف العربية، حذف الألقاب وعلامات الترقيم، ودمج «عبد ال…» */
export function normalizeName(name) {
  let s = normalizeArabic(String(name || ''))
    .replace(/[.\-_,،؛;:/\\()[\]{}"'«»`~!?؟*+=|<>@#$%^&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // «عبد الله» = «عبدالله»، «أبو بكر» = «أبوبكر»
  s = s.replace(/(^|\s)(عبد|ابو)\s+(?=\S)/g, '$1$2');
  const tokens = s.split(' ').filter((t) => t && !TITLES.has(t));
  return tokens.join(' ');
}

export function nameTokens(norm) {
  return String(norm || '').split(' ').filter(Boolean);
}

/** هل الاسم وصف عام لا يُعتمد عليه في المطابقة؟ */
export function isGenericName(norm) {
  const t = nameTokens(norm);
  return !t.length || t.every((x) => GENERIC.has(x));
}

/**
 * مطابقة اسمين موحَّدين: exact (تطابق تام) أو partial (أحدهما بداية الآخر بكلمتين على الأقل،
 * كما في «محمد أحمد» و«محمد أحمد علي») أو null.
 */
export function compareNames(a, b) {
  if (!a || !b) return null;
  if (isGenericName(a) || isGenericName(b)) return null;
  if (a === b) return 'exact';
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length >= 2 && short.every((t, i) => long[i] === t)) return 'partial';
  return null;
}

/** الرقم القومي المصري بعد توحيد الأرقام، أو null إن لم يكن 14 رقمًا */
export function normalizeNationalId(value) {
  if (value === null || value === undefined) return null;
  const s = latinDigits(String(value)).replace(/\s|-/g, '');
  return /^[23]\d{13}$/.test(s) ? s : null;
}

// ───────────────────────── درجة الاحتياج (بطاقة المستفيد) ─────────────────────────

const RELATION_POINTS = { widow: 25, orphan_guardian: 25, divorced: 20, wife: 8, other: 4 };
const INCOME_POINTS = { none: 25, lt_2000: 20, '2000_4000': 12, '4000_7000': 5, gt_7000: 0 };
const HOUSING_POINTS = { none: 15, rented_new: 8, family: 6, rented_old: 4, owned: 0 };
const EMPLOYMENT_POINTS = { none: 8, irregular: 5, pension: 4, other: 2, employed: 0 };
// «الأسرة تعول طفلًا واحدًا / طفلين / 3 أطفال / 11 طفلًا» (مفعول به منصوب، ومحايد لجنس العائل)
const CHILD_FORMS = ['طفلًا واحدًا', 'طفلين', 'أطفال', 'طفلًا'];

/** عدد الأبناء القصّر (أقل من 18 سنة) من سنوات الميلاد، أو من العدد المسجل إن لم تُسجل السنوات */
export function minorsOf(profile, year) {
  const kids = Array.isArray(profile.children) ? profile.children : [];
  if (kids.length) return kids.filter((k) => k.birth_year && year - Number(k.birth_year) < 18).length;
  return Number(profile.children_count) || 0;
}

/**
 * درجة احتياج شفافة (0–100) مع أسبابها، والأولوية المقترحة للطلب.
 * لا تُستخدم وحدها لاتخاذ القرار: الإدارة تراها وتقرر.
 */
export function vulnerabilityScore(profile, { year = new Date().getUTCFullYear() } = {}) {
  if (!profile) return null;
  const reasons = [];
  const add = (points, text) => {
    if (points > 0) reasons.push({ points, text });
  };
  const RL = { widow: 'أرملة', orphan_guardian: 'وصي أو كافل أيتام', divorced: 'مطلقة معيلة', wife: 'زوجة', other: 'صلة أخرى' };
  if (profile.relation) add(RELATION_POINTS[profile.relation] || 0, `صفة المستفيد: ${RL[profile.relation] || profile.relation}`);
  const kids = Array.isArray(profile.children) ? profile.children : [];
  const minors = minorsOf(profile, year);
  if (minors > 0) add(Math.min(30, minors * 6), `الأسرة تعول ${arabicCount(minors, CHILD_FORMS)} دون 18 سنة`);
  const young = kids.filter((k) => k.birth_year && year - Number(k.birth_year) < 6).length;
  if (young > 0) add(5, 'بين الأبناء طفل دون سن المدرسة');
  if (profile.monthly_income_band) {
    const IL = { none: 'بلا دخل ثابت', lt_2000: 'دخل شهري أقل من 2,000 ج.م', '2000_4000': 'دخل شهري من 2,000 إلى 4,000 ج.م', '4000_7000': 'دخل شهري من 4,000 إلى 7,000 ج.م' };
    add(INCOME_POINTS[profile.monthly_income_band] || 0, IL[profile.monthly_income_band] || 'الدخل الشهري');
  }
  if (profile.housing) {
    const HL = { none: 'بلا سكن مستقر', rented_new: 'سكن بإيجار جديد', family: 'إقامة لدى الأسرة', rented_old: 'سكن بإيجار قديم' };
    add(HOUSING_POINTS[profile.housing] || 0, HL[profile.housing] || 'السكن');
  }
  if (profile.employment) {
    const EL = { none: 'بلا عمل', irregular: 'عمل غير منتظم', pension: 'يعتمد على معاش أو دعم نقدي', other: 'وضع عمل آخر' };
    add(EMPLOYMENT_POINTS[profile.employment] || 0, EL[profile.employment] || 'العمل');
  }
  if (profile.has_disability) add(10, 'إعاقة أو مرض مزمن في الأسرة');
  const raw = reasons.reduce((s, r) => s + r.points, 0);
  const score = Math.min(100, raw);
  const level = score >= 70 ? 'severe' : score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low';
  const suggested_priority = score >= 80 ? 'urgent' : score >= 55 ? 'high' : 'normal';
  const known = ['relation', 'monthly_income_band', 'housing', 'employment'].filter((k) => profile[k]).length + (profile.children_count != null || kids.length ? 1 : 0);
  return {
    score,
    level,
    suggested_priority,
    reasons: reasons.sort((a, b) => b.points - a.points),
    completeness: Math.round((known / 5) * 100) / 100,
    minors,
  };
}

const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };
/** هل الأولوية المقترحة أعلى من الحالية؟ (لا نقترح أبدًا خفض الأولوية) */
export function priorityRaises(current, suggested) {
  return (PRIORITY_RANK[suggested] ?? 0) > (PRIORITY_RANK[current] ?? 1);
}

// ───────────────────────── CSV ─────────────────────────

const BOM = '﻿';

// بدايات تجعل Excel/LibreOffice/Google Sheets يفسّر الخلية صيغة: = + - @ (وصيغها كاملة العرض ＝ ＋ － ＠)،
// ولو سبقتها مسافات أو محارف تحكم أو علامات اتجاه غير مرئية؛ وكذلك Tab وCR في البداية
const FORMULA_START = /^[\s\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]*[=+\-@\uff1d\uff0b\uff0d\uff20]|^[\t\r\n]/;

/** خلية CSV آمنة: علامات الاقتباس، ومنع حقن الصيغ في برامج الجداول (OWASP CSV Injection) */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * ملف CSV بترميز UTF-8 مع BOM (حتى يفتحه Excel بالعربية مباشرة)، وأسطر CRLF.
 * columns: [{ key, label, value?(row) }]
 */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(c.value ? c.value(r) : r[c.key])).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

function detectDelimiter(text) {
  const firstLine = [];
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    else if (!q && (ch === '\n' || ch === '\r')) break;
    firstLine.push(ch);
  }
  const count = (d) => firstLine.filter((c) => c === d).length;
  const candidates = [[',', count(',')], [';', count(';')], ['\t', count('\t')]].sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ',';
}

/**
 * قراءة CSV (RFC 4180): علامات اقتباس، فواصل وأسطر داخل الخلايا، BOM، وفاصل «,» أو «;» أو Tab.
 * @returns {{ header: string[], rows: { line: number, cells: string[] }[] }}
 */
export function parseCsv(input, { maxRows = 5000 } = {}) {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = detectDelimiter(text);
  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      records.push({ line: rowLine, cells: row });
      if (records.length > maxRows + 1) throw new Error(`عدد الصفوف أكبر من الحد المسموح (${maxRows})`);
      row = [];
      cell = '';
      line++;
      rowLine = line;
    } else cell += ch;
  }
  if (inQuotes) throw new Error('صيغة CSV غير صالحة: علامة اقتباس لم تُغلق');
  if (cell !== '' || row.length) {
    row.push(cell);
    records.push({ line: rowLine, cells: row });
  }
  const nonEmpty = records.filter((r) => r.cells.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return { header: [], rows: [] };
  const [head, ...rest] = nonEmpty;
  // إزالة الحماية من حقن الصيغ إن عاد الملف من تصديرنا («'=…» ← «=…» لا تُستعاد عمدًا؛ نحذف الفاصلة العليا فقط)
  const clean = (c) => String(c).trim().replace(/^'(?=[=+\-@])/, '');
  return {
    header: head.cells.map((c) => clean(c)),
    rows: rest.map((r) => ({ line: r.line, cells: r.cells.map(clean) })),
  };
}

// ───────────────────────── تقويم ICS (RFC 5545) ─────────────────────────

/**
 * تهريب نص ICS: الشرطة المائلة والفاصلة والفاصلة المنقوطة والأسطر (CRLF أو LF أو CR منفردة)،
 * وحذف محارف التحكم الأخرى — حتى لا يحقن نص يكتبه مستخدم (عنوان جلسة مثلًا) خصائص جديدة في التقويم.
 */
export function icsEscape(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n|\u2028|\u2029/g, '\\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

/** طي السطر عند 75 بايتًا (UTF-8) دون قطع حرف متعدد البايتات */
export function icsFold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) {
      out.push(cur);
      cur = ' ';
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** ISO → 20261006T080000Z */
export function icsUtc(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
/** ISO → تاريخ القاهرة 20261006 (لأحداث اليوم الكامل) */
export function icsDate(iso, plusDays = 0) {
  const key = cairoDayKey(new Date(new Date(iso).getTime() + plusDays * 86400000));
  return key.replace(/-/g, '');
}

/**
 * بناء ملف تقويم كامل.
 * events: [{ uid, summary, description, location, start, end?, allDay?, url?, status?, categories?, alarmMinutes? }]
 */
export function buildIcs({ name, events, now = new Date().toISOString() }) {
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beyoot Misr Foundation//Legal Platform//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    'X-WR-TIMEZONE:Africa/Cairo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    L.push('BEGIN:VEVENT');
    L.push(`UID:${e.uid}`);
    L.push(`DTSTAMP:${icsUtc(now)}`);
    if (e.allDay) {
      L.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`);
      L.push(`DTEND;VALUE=DATE:${icsDate(e.start, 1)}`);
      L.push('TRANSP:TRANSPARENT');
    } else {
      L.push(`DTSTART:${icsUtc(e.start)}`);
      L.push(`DTEND:${icsUtc(e.end || new Date(new Date(e.start).getTime() + 3600000).toISOString())}`);
    }
    L.push(`SUMMARY:${icsEscape(e.summary)}`);
    if (e.description) L.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) L.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) L.push(`URL:${e.url}`);
    if (e.categories) L.push(`CATEGORIES:${icsEscape(e.categories)}`);
    if (e.status) L.push(`STATUS:${e.status}`);
    if (e.alarmMinutes) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.summary)}`, `TRIGGER:-PT${Math.round(e.alarmMinutes)}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
