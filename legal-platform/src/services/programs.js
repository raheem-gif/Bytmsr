// البرامج والتمويل والمستندات المطبوعة (الإصدار 9 — وحدة programs)
//
// البرنامج = مصدر تمويل لبرنامج الدعم القانوني (منحة، زكاة «نماء»، شراكة مسؤولية مجتمعية، تبرعات، موارد ذاتية)
// له ميزانية ومدة ونطاق أهلية. يرتبط الملف (case) ببرنامج واحد على الأكثر، والملف المستمر يتبع برنامج ملفه.
// الإنفاق الفعلي على البرنامج = قيود مستحقات المحامين (أتعاب واستردادات وتسويات، دون المبالغ الشهرية وقيم الباقات
// غير المرتبطة بملف) + المصروفات التي دفعتها المؤسسة مباشرة، على ملفات البرنامج وملفاتها المستمرة وخلال مدته.
//
// المستندات المطبوعة: كل نوع يُبنى هنا بالبيانات اللازمة فقط، وبنفس صلاحيات البيانات الأصلية:
// الفاتورة والإيصال والإفادة وملخص الملف وتقرير البرنامج للإدارة فقط (المحامي يحصل على 404)،
// وكشف حساب المحامي لمدير النظام أو للمحامي نفسه فقط.
import {
  nowIso,
  cairoYear,
  cairoLocalToIso,
  periodOf,
  periodRange,
  isValidPeriod,
  arabicPeriod,
  arabicDate,
  arabicPercent,
  arabicCount,
  parseJson,
  badRequest,
  notFound,
  forbidden,
  unauthorized,
  conflict,
  v,
  fromMinor,
  formatEgp,
  truncate,
} from '../util.js';
import { LABELS, ENUMS, AREA_CODES, GOVERNORATES, LEGAL_AREAS } from '../constants.js';
import { describeAgreement } from './accounting.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const FAR_FUTURE = '9999-12-31T23:59:59.999Z';
const DAY = 86400000;
const MONTH_DAYS = 30.4375;
const DEFAULT_THRESHOLDS = [80, 100];
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 200;
const MAX_THRESHOLDS = 5;
const SETTING_LABELS = {
  program_alert_thresholds: 'عتبات تنبيه الميزانية',
  print_invoice_note: 'ملاحظة الفواتير المطبوعة',
  print_answer_disclaimer: 'تنبيه الإفادات المطبوعة',
};
/** نص بحث آمن داخل LIKE (لا تُفسَّر % و_ كأنماط) */
const likeArg = (q) => `%${String(q).trim().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
// قيود لا ترتبط بملف بعينه (تُحمَّل على البرامج تقديريًا فقط في تكلفة الملف، لا في إنفاق البرنامج)
const NON_CASE_LEDGER = ['monthly_fee', 'package_purchase'];
export const STAFF_PRINT_KINDS = ['invoice', 'receipt', 'answer', 'case-summary', 'programme'];
export const PRINT_KINDS = [...STAFF_PRINT_KINDS, 'statement'];

// ───────────────────────── التفقيط (المبلغ بالحروف) ─────────────────────────

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
// [مفرد، مثنى (مرفوع)، مثنى مضاف، جمع 3–10، تمييز 11–99 (منون)، تمييز مضاف]
const SCALES = [
  null,
  { one: 'ألف', two: 'ألفان', twoC: 'ألفا', few: 'آلاف', many: 'ألفًا', manyC: 'ألف' },
  { one: 'مليون', two: 'مليونان', twoC: 'مليونا', few: 'ملايين', many: 'مليونًا', manyC: 'مليون' },
  { one: 'مليار', two: 'ملياران', twoC: 'مليارا', few: 'مليارات', many: 'مليارًا', manyC: 'مليار' },
];

function below100(n) {
  if (n < 10) return ONES[n];
  if (n === 10) return 'عشرة';
  if (n === 11) return 'أحد عشر';
  if (n === 12) return 'اثنا عشر';
  if (n < 20) return `${ONES[n - 10]} عشر`;
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${ONES[o]} و${TENS[t]}` : TENS[t];
}

/** 1..999؛ construct: العدد مضاف مباشرة إلى المعدود (مائتا جنيه) */
function below1000(n, construct) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h) parts.push(h === 2 && construct && !r ? 'مائتا' : HUNDREDS[h]);
  if (r) parts.push(below100(r));
  return parts.join(' و');
}

function scaled(k, s, construct) {
  if (k === 1) return s.one;
  if (k === 2) return construct ? s.twoC : s.two;
  const r = k % 100;
  const words = below1000(k, r === 0);
  if (r >= 3 && r <= 10) return `${words} ${s.few}`;
  if (r >= 11 && r <= 99) return `${words} ${construct ? s.manyC : s.many}`;
  return `${words} ${s.one}`;
}

/** عدد صحيح بالحروف العربية: 1500 ← «ألف وخمسمائة». beforeNoun: يليه المعدود مباشرة (ألفا جنيه، اثنا عشر ألف جنيه) */
export function numberToArabicWords(value, { beforeNoun = false } = {}) {
  let n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'صفر';
  const groups = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  if (groups.length > SCALES.length) return String(value);
  const lowest = groups.findIndex((g) => g > 0);
  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    const construct = beforeNoun && i === lowest;
    parts.push(i === 0 ? below1000(g, construct) : scaled(g, SCALES[i], construct));
  }
  return parts.join(' و');
}

function countedPhrase(n, [one, two, few, many]) {
  if (n === 1) return `${one} واحد`;
  if (n === 2) return two;
  const r = n % 100;
  const words = numberToArabicWords(n, { beforeNoun: true });
  if (r >= 3 && r <= 10) return `${words} ${few}`;
  if (r >= 11 && r <= 99) return `${words} ${many}`;
  return `${words} ${one}`;
}

/** المبلغ بالحروف للفواتير والإيصالات: 150000 قرش ← «فقط ألف وخمسمائة جنيه مصري لا غير» */
export function amountInWords(minor) {
  const total = Math.round(Math.abs(Number(minor) || 0));
  const pounds = Math.floor(total / 100);
  const piastres = total % 100;
  const parts = [];
  if (pounds) parts.push(countedPhrase(pounds, ['جنيه مصري', 'جنيهان مصريان', 'جنيهات مصرية', 'جنيهًا مصريًا']));
  if (piastres) parts.push(countedPhrase(piastres, ['قرش', 'قرشان', 'قروش', 'قرشًا']));
  if (!parts.length) return 'صفر جنيه';
  return `فقط ${parts.join(' و')} لا غير`;
}

// ───────────────────────── أدوات ─────────────────────────

/** تاريخ من حقل «يوم» (YYYY-MM-DD بتوقيت القاهرة) أو ISO كامل */
function dateValue(value, label, { required = false, endOfDay = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`الحقل «${label}» مطلوب`);
    return null;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) throw badRequest(`«${label}» ليس تاريخًا صالحًا`);
    if (!endOfDay) return cairoLocalToIso(y, mo, d, 0, 0);
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    return new Date(Date.parse(cairoLocalToIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0)) - 1).toISOString();
  }
  return v.iso(s, label, { required });
}

function listValue(value, allowed, label) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest(`«${label}» يجب أن يكون قائمة`);
  const out = [];
  for (const x of value) {
    if (!allowed.includes(x)) throw badRequest(`«${label}» تحتوي على قيمة غير مسموح بها`);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

function periodsBetween(from, to, max = 36) {
  if (!isValidPeriod(from) || !isValidPeriod(to) || from > to) return [];
  const out = [];
  let [y, m] = from.split('-').map(Number);
  for (let i = 0; i < 600; i++) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    out.push(p);
    if (p >= to) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-max);
}

const sum = (rows, key = 'amount_minor') => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

export function createPrograms(app) {
  const { db } = app;

  function nextProgramCode(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`program:${y}`, 1);
    return `PRG-${y}-${String(n).padStart(3, '0')}`;
  }

  /** رقم إيصال الاستلام التالي RCPT-YYYY-NNNNN (عداد ذري لكل سنة) */
  function nextReceiptNumber(iso = nowIso()) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`receipt:${y}`, 1);
    return `RCPT-${y}-${String(n).padStart(5, '0')}`;
  }

  /** ترقيم المدفوعات القديمة (أو المستوردة) التي لم يصدر لها رقم إيصال */
  function backfillReceipts() {
    const rows = db.all('SELECT id, created_at FROM payments WHERE receipt_number IS NULL ORDER BY id');
    if (!rows.length) return 0;
    db.tx(() => {
      for (const r of rows) db.run('UPDATE payments SET receipt_number = ? WHERE id = ? AND receipt_number IS NULL', nextReceiptNumber(r.created_at || nowIso()), r.id);
    });
    return rows.length;
  }

  function thresholds() {
    const raw = app.settings.get('program_alert_thresholds');
    const list = (Array.isArray(raw) ? raw : DEFAULT_THRESHOLDS).map(Number).filter((n) => Number.isInteger(n) && n >= MIN_THRESHOLD && n <= MAX_THRESHOLD);
    return [...new Set(list.length ? list : DEFAULT_THRESHOLDS)].sort((a, b) => a - b);
  }

  /** إعدادات الوحدة القابلة للتعديل من صفحة البرامج (مدير النظام فقط) */
  function readSettings() {
    return {
      program_alert_thresholds: thresholds(),
      print_invoice_note: app.settings.get('print_invoice_note') || '',
      print_answer_disclaimer: app.settings.get('print_answer_disclaimer') || '',
    };
  }

  function writeSettings(body, actor, ctx = null) {
    const out = {};
    if (body.program_alert_thresholds !== undefined) {
      const raw = body.program_alert_thresholds;
      if (!Array.isArray(raw) || !raw.length) throw badRequest('حدد عتبة تنبيه واحدة على الأقل');
      if (raw.length > MAX_THRESHOLDS) throw badRequest(`أقصى عدد لعتبات التنبيه ${arabicCount(MAX_THRESHOLDS, ['عتبة واحدة', 'عتبتان', 'عتبات', 'عتبة'])}`);
      const list = raw.map((x) => v.int(x, 'عتبة التنبيه', { required: true, min: MIN_THRESHOLD, max: MAX_THRESHOLD }));
      if (new Set(list).size !== list.length) throw badRequest('عتبات التنبيه مكررة');
      out.program_alert_thresholds = [...list].sort((a, b) => a - b);
    }
    if (body.print_invoice_note !== undefined) out.print_invoice_note = v.str(body.print_invoice_note, 'ملاحظة الفواتير المطبوعة', { max: 500 }) || '';
    if (body.print_answer_disclaimer !== undefined) out.print_answer_disclaimer = v.str(body.print_answer_disclaimer, 'تنبيه الإفادات المطبوعة', { max: 1000 }) || '';
    const changed = Object.keys(out).filter((k) => JSON.stringify(out[k]) !== JSON.stringify(readSettings()[k]));
    for (const k of changed) app.settings.set(k, out[k]);
    if (changed.length) {
      app.audit.log({
        actor,
        ctx,
        type: 'settings.updated',
        summary: `تعديل إعدادات البرامج والطباعة: ${changed.map((k) => SETTING_LABELS[k]).join('، ')}`,
        data: { keys: changed },
      });
      // العتبات الجديدة تسري فورًا على البرامج التي تجاوزتها بالفعل
      if (changed.includes('program_alert_thresholds')) svc.checkBudget();
    }
    return readSettings();
  }

  function letterhead() {
    const s = app.settings.all();
    return {
      org_name: s.org_name || 'بيوت مصر',
      org_legal_name: s.org_legal_name || s.org_name || 'بيوت مصر',
      registration: s.org_registration || '',
      address: s.org_address || '',
      phone: s.org_phone || '',
      email: s.org_email || '',
      website: s.org_website || s.public_base_url || '',
      facebook: s.org_facebook_url || '',
      tagline: s.org_tagline || '',
      // اسم البرنامج من إعدادات الموقع («الدعم القانوني» افتراضيًا) دون تكرار كلمة «برنامج»
      program_name: (() => {
        const name = String(s.site_program_name || '').trim() || 'الدعم القانوني';
        return /^برنامج\s/.test(name) ? name : `برنامج ${name}`;
      })(),
    };
  }

  // ───────────────────────── الإنفاق والمؤشرات ─────────────────────────

  function spanOf(p) {
    return { from: p.start_date, to: p.end_date || FAR_FUTURE };
  }

  /** بنود الإنفاق الفعلي على البرنامج (قيود المحامين + مصروفات المؤسسة) خلال مدته */
  function spendLines(p) {
    const { from, to } = spanOf(p);
    const ledger = db.all(
      `SELECT e.id, e.kind, e.amount_minor, e.created_at AS at, e.description, e.status, e.matter_id,
         c.id AS case_id, c.code AS case_code, mm.code AS matter_code, u.name AS lawyer_name
       FROM ledger_entries e
       JOIN users u ON u.id = e.lawyer_id
       LEFT JOIN matters mm ON mm.id = e.matter_id
       JOIN cases c ON c.id = COALESCE(e.case_id, mm.case_id)
       WHERE c.program_id = ? AND e.status != 'void' AND e.kind NOT IN (${NON_CASE_LEDGER.map(() => '?').join(',')})
         AND COALESCE(e.segment, 'charity') != 'paid'
         AND e.created_at >= ? AND e.created_at <= ?`, // v11 gate fixer-server (F-D, r2 S6): قيود عمل الأفراد والشركات (بلقطتها) لا تُحسب على البرنامج
      p.id,
      ...NON_CASE_LEDGER,
      from,
      to,
    );
    const expenses = db.all(
      `SELECT x.id, x.amount_minor, x.incurred_at AS at, x.description, x.matter_id,
         c.id AS case_id, c.code AS case_code, mm.code AS matter_code
       FROM expenses x
       LEFT JOIN matters mm ON mm.id = x.matter_id
       JOIN cases c ON c.id = COALESCE(x.case_id, mm.case_id)
       WHERE c.program_id = ? AND x.paid_by = 'organization' AND x.incurred_at >= ? AND x.incurred_at <= ?`,
      p.id,
      from,
      to,
    );
    return [
      ...ledger.map((e) => ({
        source: 'ledger',
        id: e.id,
        category: e.kind === 'reimbursement' ? 'reimbursements' : 'lawyer_fees',
        kind: e.kind,
        kind_label: LABELS.ledger_kind[e.kind] || e.kind,
        amount_minor: e.amount_minor,
        amount: fromMinor(e.amount_minor),
        at: e.at,
        description: e.description,
        status: e.status,
        case_id: e.case_id,
        case_code: e.case_code,
        matter_id: e.matter_id,
        matter_code: e.matter_code,
        lawyer_name: e.lawyer_name,
      })),
      ...expenses.map((x) => ({
        source: 'expense',
        id: x.id,
        category: 'expenses',
        kind: 'expense',
        kind_label: 'مصروفات دفعتها المؤسسة',
        amount_minor: x.amount_minor,
        amount: fromMinor(x.amount_minor),
        at: x.at,
        description: x.description,
        status: null,
        case_id: x.case_id,
        case_code: x.case_code,
        matter_id: x.matter_id,
        matter_code: x.matter_code,
        lawyer_name: null,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
  }

  function spendMinor(p) {
    return sum(spendLines(p));
  }

  function caseCounts(p) {
    const r = db.get(
      `SELECT COUNT(*) AS cases, COUNT(DISTINCT client_id) AS families,
         SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
         SUM(CASE WHEN matter_id IS NOT NULL THEN 1 ELSE 0 END) AS matters
       FROM cases WHERE program_id = ?`,
      p.id,
    );
    const answered = Number(
      db.value("SELECT COUNT(DISTINCT a.case_id) FROM client_answers a JOIN cases c ON c.id = a.case_id WHERE c.program_id = ? AND a.status = 'sent'", p.id),
    );
    const { from, to } = spanOf(p);
    const inKind = db.get(
      `SELECT COUNT(*) AS n, COALESCE(SUM(b.notional_minor), 0) AS v FROM billable_events b JOIN cases c ON c.id = b.case_id
       WHERE c.program_id = ? AND b.treatment IN ('pro_bono','csr') AND COALESCE(b.segment, 'charity') != 'paid' AND b.created_at >= ? AND b.created_at <= ?`,
      p.id,
      from,
      to,
    );
    return {
      cases: Number(r.cases || 0),
      families: Number(r.families || 0),
      closed_cases: Number(r.closed || 0),
      open_cases: Number(r.cases || 0) - Number(r.closed || 0),
      matters: Number(r.matters || 0),
      answered,
      in_kind_count: Number(inKind.n || 0),
      in_kind_value: fromMinor(Number(inKind.v || 0)),
    };
  }

  function computeStats(p, lines = spendLines(p)) {
    const spend = sum(lines);
    const byCat = { lawyer_fees: 0, reimbursements: 0, expenses: 0 };
    for (const l of lines) byCat[l.category] += l.amount_minor;
    const t = Date.parse(nowIso());
    const start = Date.parse(p.start_date);
    const end = p.end_date ? Date.parse(p.end_date) : null;
    const started = t >= start;
    const effectiveEnd = end ? Math.min(t, end) : t;
    const daysElapsed = started ? Math.max(0, (effectiveEnd - start) / DAY) : 0;
    const daysTotal = end ? Math.max(1, (end - start) / DAY) : null;
    const monthsElapsed = Math.max(1, daysElapsed / MONTH_DAYS);
    // معدل الإنفاق والتوقع بالجنيه الصحيح (لا معنى للقروش في التوقعات)
    const burn = started ? Math.round(spend / monthsElapsed / 100) * 100 : 0;
    const monthsLeft = end ? Math.max(0, (end - Math.max(t, start)) / (DAY * MONTH_DAYS)) : null;
    const projected = end ? spend + Math.round((burn * monthsLeft) / 100) * 100 : null;
    const remaining = p.budget_minor - spend;
    const utilization = p.budget_minor > 0 ? spend / p.budget_minor : null;
    const elapsedRatio = daysTotal ? Math.min(1, daysElapsed / daysTotal) : null;
    let forecast = 'no_budget';
    if (p.budget_minor > 0) {
      if (!started) forecast = 'not_started';
      else if (spend >= p.budget_minor) forecast = 'exhausted';
      else if (projected !== null && projected > p.budget_minor) forecast = 'overspend_risk';
      else if (elapsedRatio !== null && elapsedRatio >= 0.25 && utilization < elapsedRatio * 0.5) forecast = 'underspend';
      else forecast = 'on_track';
    }
    const lastAlert = db.get('SELECT threshold, created_at FROM program_alerts WHERE program_id = ? AND budget_minor = ? ORDER BY threshold DESC LIMIT 1', p.id, p.budget_minor);
    return {
      budget: fromMinor(p.budget_minor),
      spend: fromMinor(spend),
      remaining: fromMinor(remaining),
      utilization,
      by_category: Object.fromEntries(Object.entries(byCat).map(([k, val]) => [k, fromMinor(val)])),
      started,
      ended: end !== null && t > end,
      days_elapsed: Math.round(daysElapsed),
      days_total: daysTotal !== null ? Math.round(daysTotal) : null,
      elapsed_ratio: elapsedRatio,
      burn_rate_monthly: fromMinor(burn),
      months_left: monthsLeft !== null ? Math.round(monthsLeft * 10) / 10 : null,
      projected_total: projected !== null ? fromMinor(projected) : null,
      runway_months: burn > 0 && remaining > 0 ? Math.round((remaining / burn) * 10) / 10 : null,
      forecast,
      forecast_label: LABELS.program_forecast?.[forecast] || forecast,
      cost_per_case: null,
      last_alert: lastAlert ? { threshold: lastAlert.threshold, created_at: lastAlert.created_at } : null,
      ...caseCounts(p),
    };
  }

  function monthlySeries(p, lines) {
    const t = nowIso();
    if (t < p.start_date) return [];
    const endIso = p.end_date && p.end_date < t ? p.end_date : t;
    const periods = periodsBetween(periodOf(p.start_date), periodOf(endIso));
    const byPeriod = new Map(periods.map((x) => [x, 0]));
    for (const l of lines) {
      const k = periodOf(l.at);
      if (byPeriod.has(k)) byPeriod.set(k, byPeriod.get(k) + l.amount_minor);
    }
    let cumulative = 0;
    return periods.map((k) => {
      cumulative += byPeriod.get(k);
      return { period: k, label: arabicPeriod(k), amount: fromMinor(byPeriod.get(k)), cumulative: fromMinor(cumulative) };
    });
  }

  /** مؤشرات تقرير الأثر من وحدة أخرى إن وُجدت (اختيارية — لا تُفشل التقرير أبدًا) */
  function externalImpact(caseIds) {
    if (!caseIds.length) return null;
    const candidates = [app.practice, app.impact, app.analytics];
    for (const svcObj of candidates) {
      const fn = svcObj && (svcObj.impactForCases || svcObj.programImpact);
      if (typeof fn !== 'function') continue;
      try {
        const r = fn.call(svcObj, caseIds);
        if (r && typeof r === 'object' && !(typeof r.then === 'function')) return r;
      } catch (e) {
        app.log('programs: impact provider failed', e);
      }
    }
    return null;
  }

  /**
   * الأثر المالي المتحقق للمستفيدين إن سجلته وحدة «الممارسة» (أعمدة outcome_kind وrecovered_* على الملفات والملفات المستمرة).
   * محمي بالكامل: إن لم توجد الأعمدة أو تغير شكلها يُتجاهل دون إفشال التقرير.
   */
  function recoveredImpact(p) {
    try {
      const has = (table, cols) => {
        const names = db.all(`PRAGMA table_info(${table})`).map((r) => r.name);
        return cols.every((c) => names.includes(c));
      };
      const COLS = ['outcome_kind', 'recovered_one_time_minor', 'recovered_monthly_minor'];
      if (!has('cases', COLS)) return null;
      const rows = db.raw
        .prepare('SELECT outcome_kind, recovered_one_time_minor AS one, recovered_monthly_minor AS monthly FROM cases WHERE program_id = ? AND outcome_kind IS NOT NULL')
        .all(p.id);
      if (has('matters', COLS)) {
        rows.push(
          ...db.raw
            .prepare('SELECT m.outcome_kind, m.recovered_one_time_minor AS one, m.recovered_monthly_minor AS monthly FROM matters m JOIN cases c ON c.id = m.case_id WHERE c.program_id = ? AND m.outcome_kind IS NOT NULL')
            .all(p.id),
        );
      }
      if (!rows.length) return null;
      const one = rows.reduce((s, r) => s + Number(r.one || 0), 0);
      const monthly = rows.reduce((s, r) => s + Number(r.monthly || 0), 0);
      const byKind = new Map();
      for (const r of rows) byKind.set(r.outcome_kind, (byKind.get(r.outcome_kind) || 0) + 1);
      const kindLabel = (k) => (LABELS.outcome_kind && LABELS.outcome_kind[k]) || k;
      return {
        title: 'الأثر المتحقق للمستفيدين',
        items: [
          { label: 'ملفات سُجّل لها أثر متحقق', value: rows.length },
          { label: 'مبالغ مستردة أو مستحقة لمرة واحدة', value: formatEgp(one) },
          { label: 'مبالغ شهرية متحققة (نفقة أو معاش)', value: formatEgp(monthly) },
          { label: 'القيمة السنوية التقديرية للأثر', value: formatEgp(one + monthly * 12) },
          ...[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: kindLabel(k), value: n })),
        ],
        totals: { one_time: fromMinor(one), monthly: fromMinor(monthly), annualized: fromMinor(one + monthly * 12), records: rows.length },
      };
    } catch (e) {
      app.log('programs: recovered impact unavailable', e);
      return null;
    }
  }

  function impact(p) {
    const outcomes = db
      .all("SELECT outcome, COUNT(*) AS n FROM cases WHERE program_id = ? AND status = 'closed' GROUP BY outcome ORDER BY n DESC", p.id)
      .map((r) => ({ outcome: r.outcome, label: r.outcome ? LABELS.case_outcome[r.outcome] || r.outcome : 'دون تحديد', count: Number(r.n) }));
    const byStatus = db
      .all('SELECT status, COUNT(*) AS n FROM cases WHERE program_id = ? GROUP BY status ORDER BY n DESC', p.id)
      .map((r) => ({ status: r.status, label: LABELS.case_status[r.status] || r.status, count: Number(r.n) }));
    const byArea = db
      .all('SELECT legal_area, COUNT(*) AS n, COUNT(DISTINCT client_id) AS f FROM cases WHERE program_id = ? GROUP BY legal_area ORDER BY n DESC', p.id)
      .map((r) => ({ legal_area: r.legal_area, label: AREA[r.legal_area] || r.legal_area, cases: Number(r.n), families: Number(r.f) }));
    const byGov = db
      .all(
        `SELECT COALESCE(NULLIF(cl.governorate, ''), '') AS gov, COUNT(*) AS n, COUNT(DISTINCT c.client_id) AS f
         FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.program_id = ? GROUP BY gov ORDER BY f DESC, n DESC`,
        p.id,
      )
      .map((r) => ({ governorate: r.gov || null, label: r.gov || 'غير مسجلة', cases: Number(r.n), families: Number(r.f) }));
    const matters = db
      .all('SELECT m.status, COUNT(*) AS n FROM matters m JOIN cases c ON c.id = m.case_id WHERE c.program_id = ? GROUP BY m.status', p.id)
      .map((r) => ({ status: r.status, label: LABELS.matter_status[r.status] || r.status, count: Number(r.n) }));
    const hearings = Number(
      db.value(
        "SELECT COUNT(*) FROM matter_events e JOIN matters m ON m.id = e.matter_id JOIN cases c ON c.id = m.case_id WHERE c.program_id = ? AND e.kind = 'hearing' AND e.status = 'done'",
        p.id,
      ),
    );
    const caseIds = db.all('SELECT id FROM cases WHERE program_id = ?', p.id).map((r) => r.id);
    return { outcomes, by_status: byStatus, by_area: byArea, by_governorate: byGov, matters, hearings_attended: hearings, external: recoveredImpact(p) || externalImpact(caseIds) };
  }

  function linkedCases(p, lines) {
    const spendByCase = new Map();
    for (const l of lines) spendByCase.set(l.case_id, (spendByCase.get(l.case_id) || 0) + l.amount_minor);
    return db
      .all(
        `SELECT c.id, c.code, c.title, c.legal_area, c.status, c.outcome, c.created_at, c.closed_at, c.matter_id,
           cl.id AS client_id, cl.code AS client_code, cl.name AS client_name, cl.governorate, m.code AS matter_code
         FROM cases c JOIN clients cl ON cl.id = c.client_id LEFT JOIN matters m ON m.id = c.matter_id
         WHERE c.program_id = ? ORDER BY c.id DESC`,
        p.id,
      )
      .map((c) => ({
        ...c,
        legal_area_label: AREA[c.legal_area] || c.legal_area,
        status_label: LABELS.case_status[c.status] || c.status,
        outcome_label: c.outcome ? LABELS.case_outcome[c.outcome] || c.outcome : null,
        spend: fromMinor(spendByCase.get(c.id) || 0),
        eligibility: eligibility(p, c),
      }));
  }

  function eligibility(p, c) {
    const reasons = [];
    const areas = parseJson(p.eligible_areas, []);
    const govs = parseJson(p.eligible_governorates, []);
    if (areas.length && !areas.includes(c.legal_area)) reasons.push(`مجال الملف «${AREA[c.legal_area] || c.legal_area}» ليس من المجالات المشمولة بالبرنامج`);
    if (govs.length) {
      const gov = c.governorate !== undefined ? c.governorate : db.value('SELECT governorate FROM clients WHERE id = ?', c.client_id);
      if (!gov) reasons.push('محافظة المستفيد غير مسجلة، والبرنامج مقصور على محافظات محددة');
      else if (!govs.includes(gov)) reasons.push(`محافظة المستفيد «${gov}» خارج النطاق الجغرافي للبرنامج`);
    }
    return reasons;
  }

  /** ملاحظات على حالة البرنامج نفسه عند ربط ملف جديد به */
  function programWarnings(p) {
    const out = [];
    const t = nowIso();
    if (p.status === 'suspended') out.push('البرنامج موقوف مؤقتًا');
    if (t < p.start_date) out.push(`البرنامج لم يبدأ بعد (يبدأ في ${arabicDate(p.start_date, { weekday: false })})`);
    if (p.end_date && t > p.end_date) out.push(`انتهت مدة البرنامج في ${arabicDate(p.end_date, { weekday: false })}`);
    return out;
  }

  function baseView(p) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      funder_name: p.funder_name,
      funder_type: p.funder_type,
      funder_type_label: LABELS.funder_type[p.funder_type] || p.funder_type,
      funder_contact: p.funder_contact,
      agreement_ref: p.agreement_ref,
      description: p.description,
      restrictions: p.restrictions,
      start_date: p.start_date,
      end_date: p.end_date,
      budget: fromMinor(p.budget_minor),
      eligible_governorates: parseJson(p.eligible_governorates, []),
      eligible_areas: parseJson(p.eligible_areas, []),
      status: p.status,
      status_label: LABELS.program_status[p.status] || p.status,
      closed_at: p.closed_at,
      close_note: p.close_note,
      closed_by_name: p.closed_by ? db.value('SELECT name FROM users WHERE id = ?', p.closed_by) ?? null : null,
      created_by_name: p.created_by ? db.value('SELECT name FROM users WHERE id = ?', p.created_by) ?? null : null,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }

  function summaryView(p) {
    const spend = spendMinor(p);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      funder_name: p.funder_name,
      funder_type: p.funder_type,
      funder_type_label: LABELS.funder_type[p.funder_type] || p.funder_type,
      status: p.status,
      status_label: LABELS.program_status[p.status] || p.status,
      start_date: p.start_date,
      end_date: p.end_date,
      budget: fromMinor(p.budget_minor),
      spend: fromMinor(spend),
      utilization: p.budget_minor > 0 ? spend / p.budget_minor : null,
      eligible_governorates: parseJson(p.eligible_governorates, []),
      eligible_areas: parseJson(p.eligible_areas, []),
      warnings: programWarnings(p),
    };
  }

  function closedProgramConflict(c, prev) {
    return conflict(`الملف ${c.code} مرتبط بالبرنامج المغلق ${prev.code}؛ أعد فتح البرنامج أولًا لتغيير ملفاته`, {
      reason: 'current_program_closed',
      current_program: { id: prev.id, code: prev.code, name: prev.name },
    });
  }

  function readInput(body, current = null) {
    const out = {};
    const has = (k) => body[k] !== undefined;
    const isNew = !current;
    if (isNew || has('name')) out.name = v.str(body.name, 'اسم البرنامج', { required: true, min: 3, max: 200 });
    if (isNew || has('funder_name')) out.funder_name = v.str(body.funder_name, 'الجهة الممولة', { required: true, min: 2, max: 200 });
    if (isNew || has('funder_type')) out.funder_type = v.oneOf(body.funder_type, ENUMS.funder_type, 'نوع التمويل', { required: true });
    if (has('funder_contact')) out.funder_contact = v.str(body.funder_contact, 'بيانات التواصل مع الجهة الممولة', { max: 500 });
    if (has('agreement_ref')) out.agreement_ref = v.str(body.agreement_ref, 'رقم الاتفاقية أو المرجع', { max: 100 });
    if (has('description')) out.description = v.str(body.description, 'وصف البرنامج', { max: 5000 });
    if (has('restrictions')) out.restrictions = v.str(body.restrictions, 'قيود الصرف وشروط الجهة الممولة', { max: 5000 });
    if (isNew || has('start_date')) out.start_date = dateValue(body.start_date, 'تاريخ البدء', { required: true });
    if (has('end_date')) out.end_date = dateValue(body.end_date, 'تاريخ الانتهاء', { endOfDay: true });
    if (isNew || has('budget')) out.budget_minor = v.money(body.budget, 'الميزانية', { required: true, min: 0, max: 1000000000 });
    if (has('eligible_governorates')) out.eligible_governorates = JSON.stringify(listValue(body.eligible_governorates, GOVERNORATES, 'المحافظات المشمولة'));
    if (has('eligible_areas')) out.eligible_areas = JSON.stringify(listValue(body.eligible_areas, AREA_CODES, 'المجالات القانونية المشمولة'));
    if (has('status')) {
      if (body.status === 'closed') throw badRequest('لإغلاق البرنامج استخدم إجراء «إغلاق البرنامج»');
      out.status = v.oneOf(body.status, ['planned', 'active', 'suspended'], 'حالة البرنامج', { required: true });
    }
    const start = out.start_date ?? current?.start_date;
    const end = out.end_date !== undefined ? out.end_date : current?.end_date;
    if (start && end && end < start) throw badRequest('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء');
    return out;
  }

  const FIELD_LABELS = {
    name: 'الاسم',
    funder_name: 'الجهة الممولة',
    funder_type: 'نوع التمويل',
    funder_contact: 'بيانات التواصل',
    agreement_ref: 'رقم الاتفاقية',
    description: 'الوصف',
    restrictions: 'قيود الصرف',
    start_date: 'تاريخ البدء',
    end_date: 'تاريخ الانتهاء',
    budget_minor: 'الميزانية',
    eligible_governorates: 'المحافظات المشمولة',
    eligible_areas: 'المجالات المشمولة',
    status: 'الحالة',
  };

  const svc = {
    nextReceiptNumber,
    backfillReceipts,
    letterhead,
    amountInWords,
    thresholds,
    settings: readSettings,
    updateSettings: writeSettings,

    require(id) {
      const p = db.get('SELECT * FROM programs WHERE id = ?', id);
      if (!p) throw notFound('البرنامج غير موجود');
      return p;
    },

    list({ status, funder_type, q } = {}) {
      const where = ['1=1'];
      const params = [];
      if (status && ENUMS.program_status.includes(status)) {
        where.push('status = ?');
        params.push(status);
      } else if (status === 'open') where.push("status != 'closed'");
      if (funder_type && ENUMS.funder_type.includes(funder_type)) {
        where.push('funder_type = ?');
        params.push(funder_type);
      }
      if (q && String(q).trim()) {
        const like = likeArg(q);
        where.push("(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR funder_name LIKE ? ESCAPE '\\' OR agreement_ref LIKE ? ESCAPE '\\')");
        params.push(like, like, like, like);
      }
      const rows = db.all(
        `SELECT * FROM programs WHERE ${where.join(' AND ')}
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'suspended' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END, start_date DESC, id DESC`,
        ...params,
      );
      const items = rows.map((p) => ({ ...baseView(p), stats: computeStats(p) }));
      // المجاميع للبرامج المعروضة فعلًا (حسب التصفية)، والأسر بلا تكرار عبر هذه البرامج
      const ids = items.map((x) => x.id);
      const families = ids.length
        ? Number(db.value(`SELECT COUNT(DISTINCT client_id) FROM cases WHERE program_id IN (${ids.map(() => '?').join(',')})`, ...ids)) || 0
        : 0;
      const minorSum = (key) => items.reduce((s, x) => s + Math.round(x.stats[key] * 100), 0) / 100;
      return {
        items,
        totals: {
          programs: items.length,
          active: items.filter((x) => x.status === 'active').length,
          budget: minorSum('budget'),
          spend: minorSum('spend'),
          remaining: minorSum('remaining'),
          cases: items.reduce((s, x) => s + x.stats.cases, 0),
          families,
          // v11 gate fixer-server (J-01/R-16, INV-13): ملفات الشركات والأفراد والشركات لا تُربط ببرامج التمويل، فلا تُعد «دون برنامج»
          unlinked_open_cases: Number(db.value("SELECT COUNT(*) FROM cases WHERE program_id IS NULL AND status != 'closed' AND company_id IS NULL AND segment = 'charity'")) || 0,
        },
      };
    },

    /** خيارات مختصرة لاختيار البرنامج (في الملف وعند التحويل) — البرامج غير المغلقة فقط */
    options() {
      return db
        .all("SELECT * FROM programs WHERE status != 'closed' ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name")
        .map(summaryView);
    },

    detail(id) {
      const p = svc.require(id);
      const lines = spendLines(p);
      const stats = computeStats(p, lines);
      stats.cost_per_case = stats.cases ? Math.round((stats.spend / stats.cases) * 100) / 100 : null;
      return {
        program: baseView(p),
        stats,
        warnings: programWarnings(p),
        cases: linkedCases(p, lines),
        spend: {
          lines: lines.slice(0, 500),
          total_lines: lines.length,
          monthly: monthlySeries(p, lines),
        },
        impact: impact(p),
        alerts: db.all('SELECT threshold, budget_minor, spend_minor, created_at FROM program_alerts WHERE program_id = ? ORDER BY created_at DESC', p.id).map((a) => ({
          threshold: a.threshold,
          budget: fromMinor(a.budget_minor),
          spend: fromMinor(a.spend_minor),
          created_at: a.created_at,
          current: a.budget_minor === p.budget_minor,
        })),
        thresholds: thresholds(),
      };
    },

    create(body, actor, ctx = null) {
      const data = readInput(body);
      const t = nowIso();
      const id = db.tx(() =>
        db.insert('programs', {
          code: nextProgramCode(data.start_date || t),
          eligible_governorates: '[]',
          eligible_areas: '[]',
          status: 'active',
          ...data,
          created_by: actor.id,
          created_at: t,
          updated_at: t,
        }),
      );
      const p = svc.require(id);
      app.audit.log({ actor, ctx, type: 'program.created', summary: `إنشاء البرنامج ${p.code} «${truncate(p.name, 80)}» بميزانية ${formatEgp(p.budget_minor)}`, data: { program_id: p.id } });
      svc.checkBudget(p.id);
      return svc.detail(p.id);
    },

    update(id, body, actor, ctx = null) {
      const p = svc.require(id);
      if (p.status === 'closed') throw conflict('البرنامج مغلق؛ أعد فتحه أولًا لتعديل بياناته');
      const data = readInput(body, p);
      const changed = Object.keys(data).filter((k) => String(data[k] ?? '') !== String(p[k] ?? ''));
      if (changed.length) {
        db.update('programs', p.id, { ...data, updated_at: nowIso() });
        const budgetNote = changed.includes('budget_minor') ? ` (الميزانية من ${formatEgp(p.budget_minor)} إلى ${formatEgp(data.budget_minor)})` : '';
        app.audit.log({
          actor,
          ctx,
          type: 'program.updated',
          summary: `تعديل البرنامج ${p.code}: ${changed.map((k) => FIELD_LABELS[k] || k).join('، ')}${budgetNote}`,
          data: { program_id: p.id, fields: changed },
        });
        svc.checkBudget(p.id);
      }
      return svc.detail(p.id);
    },

    close(id, body, actor, ctx = null) {
      const p = svc.require(id);
      if (p.status === 'closed') throw conflict('البرنامج مغلق بالفعل');
      const note = v.str(body?.note, 'ملاحظة الإغلاق', { max: 1000 });
      const t = nowIso();
      db.update('programs', p.id, { status: 'closed', closed_at: t, closed_by: actor.id, close_note: note, updated_at: t });
      app.audit.log({ actor, ctx, type: 'program.closed', summary: `إغلاق البرنامج ${p.code} «${truncate(p.name, 80)}»`, data: { program_id: p.id } });
      return svc.detail(p.id);
    },

    reopen(id, actor, ctx = null) {
      const p = svc.require(id);
      if (p.status !== 'closed') throw conflict('البرنامج ليس مغلقًا');
      db.update('programs', p.id, { status: 'active', closed_at: null, closed_by: null, close_note: null, updated_at: nowIso() });
      app.audit.log({ actor, ctx, type: 'program.reopened', summary: `إعادة فتح البرنامج ${p.code}`, data: { program_id: p.id } });
      return svc.detail(p.id);
    },

    remove(id, actor, ctx = null) {
      const p = svc.require(id);
      const n = Number(db.value('SELECT COUNT(*) FROM cases WHERE program_id = ?', p.id));
      if (n) throw conflict(`لا يمكن حذف برنامج مرتبط بملفات (${n}). أغلق البرنامج بدلًا من حذفه، أو ألغِ ربط الملفات أولًا.`);
      db.tx(() => {
        db.run('DELETE FROM program_alerts WHERE program_id = ?', p.id);
        db.run('DELETE FROM programs WHERE id = ?', p.id);
      });
      app.audit.log({ actor, ctx, type: 'program.deleted', severity: 'warning', summary: `حذف البرنامج ${p.code} «${truncate(p.name, 80)}» (لم يكن مرتبطًا بأي ملف)`, data: { program_id: p.id } });
      return { ok: true };
    },

    /** برنامج الملف (للبطاقة في صفحة الملف) */
    forCase(caseId) {
      const c = app.cases.require(caseId);
      if (!c.program_id) return { case_id: c.id, program: null, eligibility: [] };
      const p = svc.require(c.program_id);
      return { case_id: c.id, program: summaryView(p), eligibility: eligibility(p, c) };
    },

    /**
     * ربط ملف ببرنامج (الملف ينتمي لبرنامج واحد على الأكثر).
     * opts: confirm — تجاوز ملاحظات الأهلية بعد تأكيد الموظف، move — نقل الملف من برنامج آخر، force — كلاهما (التحويل من الطلب).
     */
    linkCase(caseId, programId, actor, { confirm = false, move = false, force = false } = {}) {
      const c = app.cases.require(caseId);
      if (c.company_id) throw Object.assign(conflict('ملفات الشركات عمل مدفوع لا يُربط ببرامج التمويل.'), { code: 'company_case_no_program' }); // v10 b2b-server (حارس #18)
      // v11 segment-server (L11-24): ملف الأفراد والشركات عمل مدفوع لا يُربط ببرنامج تمويل (ولا تدخل أرقامه تقارير البرامج)
      if (c.segment === 'paid') throw Object.assign(conflict('ملف مدفوع لا يُربط ببرنامج تمويل.'), { code: 'paid_case_program' });
      const p = svc.require(v.int(programId, 'البرنامج', { required: true, min: 1 }));
      if (c.program_id === p.id) return { ...svc.forCase(c.id), unchanged: true, warnings: [] };
      if (p.status === 'closed') throw conflict(`البرنامج ${p.code} مغلق ولا يقبل ربط ملفات جديدة`, { reason: 'program_closed' });
      const prev = c.program_id ? db.get('SELECT id, code, name, status FROM programs WHERE id = ?', c.program_id) : null;
      // البرنامج المغلق سجل نهائي قُدمت تقاريره للجهة الممولة: لا تُنقل ملفاته منه حتى يُعاد فتحه
      if (prev && prev.status === 'closed') throw closedProgramConflict(c, prev);
      if (prev && !move && !force) {
        throw conflict(`الملف ${c.code} مرتبط بالفعل ببرنامج ${prev.code} «${prev.name}»`, { reason: 'already_linked', current_program: { id: prev.id, code: prev.code, name: prev.name } });
      }
      const reasons = [...eligibility(p, c), ...programWarnings(p)];
      if (reasons.length && !confirm && !force) {
        throw conflict('الملف خارج نطاق أهلية البرنامج أو مدته', { reason: 'ineligible', reasons });
      }
      db.tx(() => {
        db.update('cases', c.id, { program_id: p.id, updated_at: nowIso() });
        app.activity.log({
          case_id: c.id,
          client_id: c.client_id,
          actor,
          type: 'program.linked',
          summary: `رُبط الملف ببرنامج ${p.code} «${truncate(p.name, 80)}» (${LABELS.funder_type[p.funder_type]} — ${truncate(p.funder_name, 60)})${prev ? ` بدلًا من البرنامج ${prev.code}` : ''}${reasons.length ? ' مع تجاوز ملاحظات الأهلية بقرار الإدارة' : ''}`,
          data: { program_id: p.id, previous_program_id: prev?.id ?? null, overridden: reasons },
        });
      });
      try {
        svc.checkBudget(p.id);
      } catch (e) {
        app.log('programs: budget check failed', e);
      }
      return { ...svc.forCase(c.id), warnings: reasons };
    },

    unlinkCase(caseId, actor, { programId = null } = {}) {
      const c = app.cases.require(caseId);
      if (!c.program_id) {
        if (programId) throw notFound('الملف غير مرتبط بهذا البرنامج');
        return svc.forCase(c.id);
      }
      if (programId && c.program_id !== programId) throw notFound('الملف غير مرتبط بهذا البرنامج');
      const prev = db.get('SELECT id, code, name, status FROM programs WHERE id = ?', c.program_id);
      if (prev && prev.status === 'closed') throw closedProgramConflict(c, prev);
      db.tx(() => {
        db.update('cases', c.id, { program_id: null, updated_at: nowIso() });
        app.activity.log({
          case_id: c.id,
          client_id: c.client_id,
          actor,
          type: 'program.unlinked',
          summary: `أُلغي ربط الملف ببرنامج ${prev?.code || ''} «${truncate(prev?.name || '', 80)}»`,
          data: { program_id: prev?.id ?? null },
        });
      });
      return svc.forCase(c.id);
    },

    /** PUT /api/programs/case/:id — من صفحة الملف: { program_id | null, confirm_ineligible } */
    setCaseProgram(caseId, body, actor) {
      if (body.program_id === null || body.program_id === '' || body.program_id === undefined) return svc.unlinkCase(caseId, actor);
      return svc.linkCase(caseId, body.program_id, actor, { confirm: v.bool(body.confirm_ineligible), move: true });
    },

    /**
     * تنبيهات استهلاك الميزانية (80% و100% افتراضيًا): مرة واحدة لكل عتبة لكل قيمة ميزانية.
     * إن قفز الإنفاق فوق أكثر من عتبة دفعة واحدة يصل إشعار واحد بأعلاها.
     */
    checkBudget(programId = null) {
      const list = programId
        ? [svc.require(programId)].filter((p) => p.status !== 'closed' && p.budget_minor > 0)
        : db.all("SELECT * FROM programs WHERE status != 'closed' AND budget_minor > 0");
      const ths = thresholds();
      const created = [];
      for (const p of list) {
        const spend = spendMinor(p);
        const pct = (spend / p.budget_minor) * 100;
        const t = nowIso();
        const fresh = [];
        for (const th of ths) {
          if (pct + 1e-9 < th) continue;
          const r = db.run(
            'INSERT OR IGNORE INTO program_alerts (program_id, threshold, budget_minor, spend_minor, created_at) VALUES (?, ?, ?, ?, ?)',
            p.id,
            th,
            p.budget_minor,
            spend,
            t,
          );
          if (r.changes) fresh.push(th);
        }
        if (!fresh.length) continue;
        const top = Math.max(...fresh);
        const remaining = p.budget_minor - spend;
        const ratio = arabicPercent(spend / p.budget_minor);
        app.notifications.notifyStaff({
          type: 'program.budget',
          title:
            top >= 100
              ? `استُنفدت ميزانية البرنامج ${p.code} «${truncate(p.name, 60)}»`
              : `بلغ إنفاق البرنامج ${p.code} «${truncate(p.name, 60)}» ${arabicPercent(top / 100)} من ميزانيته`,
          body:
            top >= 100
              ? `الإنفاق ${formatEgp(spend)} من ميزانية ${formatEgp(p.budget_minor)} (${ratio})${remaining < 0 ? `، بتجاوز ${formatEgp(-remaining)}` : ''}. راجع ربط ملفات جديدة بالبرنامج أو زيادة الميزانية بالاتفاق مع ${truncate(p.funder_name, 60)}.`
              : `الإنفاق ${formatEgp(spend)} من ${formatEgp(p.budget_minor)} (${ratio})، والمتبقي ${formatEgp(remaining)}.`,
          link: `#/programs/${p.id}`,
        });
        created.push({ program_id: p.id, code: p.code, thresholds: fresh, spend: fromMinor(spend), budget: fromMinor(p.budget_minor) });
      }
      return created;
    },

    // ───────────────────────── المستندات المطبوعة ─────────────────────────

    /**
     * بيانات مستند للطباعة بنفس صلاحيات البيانات الأصلية.
     * @returns {{kind, number, title, date, letterhead, printed_at, printed_by, document}}
     */
    print(kind, id, user, query = {}, ctx = null) {
      if (!user) throw unauthorized();
      if (!PRINT_KINDS.includes(kind)) throw notFound('نوع المستند غير معروف');
      const staff = user.role === 'admin' || user.role === 'case_manager';
      // المحامي لا يعرف حتى بوجود الفواتير والإفادات والملفات غير المسندة إليه (404)، وتُسجل المحاولة في سجل الأمان
      if (STAFF_PRINT_KINDS.includes(kind) && !staff) throw denyPrint(user, ctx, kind, id, notFound('المستند غير موجود'));
      let doc;
      switch (kind) {
        case 'invoice':
          doc = invoiceDoc(id);
          break;
        case 'receipt':
          doc = receiptDoc(id);
          break;
        case 'answer':
          doc = answerDoc(id);
          break;
        case 'case-summary':
          doc = caseSummaryDoc(id);
          break;
        case 'programme':
          doc = programmeDoc(id);
          break;
        case 'statement':
          doc = statementDoc(id, user, query, ctx);
          break;
        default:
          throw notFound('نوع المستند غير معروف');
      }
      return {
        kind,
        kind_label: LABELS.print_kind[kind],
        number: doc.number,
        title: doc.title,
        date: doc.date,
        letterhead: letterhead(),
        printed_at: nowIso(),
        printed_by: user.name,
        document: doc,
      };
    },
  };

  // ───────────────────────── أنواع المستندات ─────────────────────────

  function clientBrief(clientId) {
    const cl = clientId ? db.get('SELECT id, code, name, governorate FROM clients WHERE id = ?', clientId) : null;
    return cl ? { code: cl.code, name: cl.name || null, governorate: cl.governorate || null } : null;
  }

  function invoiceDoc(id) {
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', id);
    if (!inv) throw notFound('الفاتورة غير موجودة');
    const payments = db.all('SELECT id, receipt_number, amount_minor, paid_at, method, reference FROM payments WHERE invoice_id = ? ORDER BY paid_at, id', inv.id);
    const paid = sum(payments);
    const matter = inv.matter_id ? db.get('SELECT code, title, court, circuit, lawsuit_number, lawsuit_year FROM matters WHERE id = ?', inv.matter_id) : null;
    const caseRow = inv.case_id ? db.get('SELECT code, title FROM cases WHERE id = ?', inv.case_id) : null;
    const balance = inv.status === 'cancelled' ? 0 : inv.amount_minor - paid;
    return {
      number: inv.number,
      title: 'فاتورة',
      date: inv.created_at,
      invoice: {
        number: inv.number,
        description: inv.description,
        issued_at: inv.created_at,
        due_at: inv.due_at,
        status: inv.status,
        status_label: LABELS.invoice_status[inv.status] || inv.status,
        amount: fromMinor(inv.amount_minor),
        amount_words: amountInWords(inv.amount_minor),
        paid: fromMinor(paid),
        balance: fromMinor(balance),
        balance_words: balance > 0 ? amountInWords(balance) : null,
      },
      client: clientBrief(inv.client_id),
      matter,
      case: caseRow,
      payments: payments.map((p) => ({ receipt_number: p.receipt_number, amount: fromMinor(p.amount_minor), paid_at: p.paid_at, method: p.method, reference: p.reference })),
      note: app.settings.get('print_invoice_note') || '',
    };
  }

  function receiptDoc(id) {
    let p = db.get('SELECT * FROM payments WHERE id = ?', id);
    if (!p) throw notFound('الدفعة غير موجودة');
    if (!p.receipt_number) {
      // دفعة قديمة لم يصدر لها رقم: يُمنح رقمها الآن مرة واحدة ويبقى ثابتًا (بسنة تسجيلها، كالترقيم الاستدراكي)
      db.tx(() => db.run('UPDATE payments SET receipt_number = ? WHERE id = ? AND receipt_number IS NULL', nextReceiptNumber(p.created_at || nowIso()), p.id));
      p = db.get('SELECT * FROM payments WHERE id = ?', id);
    }
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', p.invoice_id);
    if (!inv) throw notFound('الدفعة غير موجودة');
    // المسدد حتى هذا الإيصال بترتيب تاريخ الدفع (نفس ترتيب جدول المدفوعات في الفاتورة)
    const paidUpTo = Number(
      db.value(
        'SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ? AND (paid_at < ? OR (paid_at = ? AND id <= ?))',
        inv.id,
        p.paid_at,
        p.paid_at,
        p.id,
      ),
    );
    const matter = inv.matter_id ? db.get('SELECT code, title FROM matters WHERE id = ?', inv.matter_id) : null;
    const caseCode = inv.case_id ? db.value('SELECT code FROM cases WHERE id = ?', inv.case_id) ?? null : null;
    return {
      number: p.receipt_number,
      // «نقدية» لا تصح لكل طرق الدفع (تحويل بنكي، محفظة إلكترونية)
      title: 'إيصال استلام',
      date: p.paid_at,
      receipt: {
        number: p.receipt_number,
        amount: fromMinor(p.amount_minor),
        amount_words: amountInWords(p.amount_minor),
        paid_at: p.paid_at,
        method: p.method,
        reference: p.reference,
        recorded_at: p.created_at,
        recorded_by: p.recorded_by ? db.value('SELECT name FROM users WHERE id = ?', p.recorded_by) ?? null : null,
      },
      invoice: {
        number: inv.number,
        description: inv.description,
        amount: fromMinor(inv.amount_minor),
        paid_to_date: fromMinor(paidUpTo),
        balance_after: fromMinor(Math.max(0, inv.amount_minor - paidUpTo)),
      },
      client: clientBrief(inv.client_id),
      matter,
      case_code: caseCode,
    };
  }

  function answerDoc(id) {
    const ans = db.get('SELECT * FROM client_answers WHERE id = ?', id);
    if (!ans) throw notFound('الإفادة غير موجودة');
    const c = db.get('SELECT id, code, title, legal_area, client_id, segment, company_id FROM cases WHERE id = ?', ans.case_id);
    const sent = db.all("SELECT id FROM client_answers WHERE case_id = ? AND status = 'sent' ORDER BY COALESCE(sent_at, created_at), id", c.id).map((r) => r.id);
    // v11 segment-server (S11 §4، P1): تنبيه الإفادة المطبوعة لملف الأفراد والشركات (بلا «برنامج الدعم» ولا «المؤسسة»)
    const paidCase = !c.company_id && c.segment === 'paid';
    const seq = sent.indexOf(ans.id) + 1;
    const number = ans.status === 'sent' ? `${c.code}/${seq || 1}` : `${c.code}/مسودة`;
    const client = clientBrief(c.client_id);
    // الإفادة تصدر باسم المؤسسة وحدها: لا يظهر فيها اسم أي محامٍ ولا رقم هاتف العميل
    return {
      number,
      title: 'إفادة قانونية',
      date: ans.sent_at || ans.updated_at,
      is_draft: ans.status !== 'sent',
      status: ans.status,
      status_label: LABELS.client_answer_status[ans.status] || ans.status,
      case: { code: c.code, title: c.title, legal_area_label: AREA[c.legal_area] || c.legal_area },
      recipient: client ? { name: client.name, code: client.code } : null,
      body: ans.body,
      channel_label: ans.channel ? LABELS.channel[ans.channel] || ans.channel : null,
      disclaimer: (paidCase ? app.settings.get('print_answer_disclaimer_paid') : null) || app.settings.get('print_answer_disclaimer') || '',
    };
  }

  function caseSummaryDoc(id) {
    const c = app.cases.require(id);
    const program = c.program_id ? db.get('SELECT code, name, funder_name, funder_type FROM programs WHERE id = ?', c.program_id) : null;
    const matter = c.matter_id ? db.get('SELECT code, title, court, circuit, lawsuit_number, lawsuit_year, status FROM matters WHERE id = ?', c.matter_id) : null;
    const team = db
      .all(
        `SELECT a.role, a.status, a.assigned_at, a.due_at, a.submitted_at, a.approved_at, a.withdrawn_at, a.fee_mode, a.hours_spent, u.name, l.title
         FROM assignments a JOIN users u ON u.id = a.lawyer_id LEFT JOIN lawyers l ON l.user_id = a.lawyer_id WHERE a.case_id = ? ORDER BY a.id`,
        c.id,
      )
      .map((a) => ({
        lawyer_name: `${a.title || ''} ${a.name}`.trim(),
        role_label: LABELS.assignment_role[a.role] || a.role,
        status: a.status,
        status_label: LABELS.assignment_status[a.status] || a.status,
        assigned_at: a.assigned_at,
        due_at: a.due_at,
        submitted_at: a.submitted_at,
        approved_at: a.approved_at,
        withdrawn_at: a.withdrawn_at,
        fee_mode_label: LABELS.fee_mode[a.fee_mode] || a.fee_mode,
        hours_spent: a.hours_spent,
      }));
    const issues = db
      .all('SELECT number, title, details, legal_area, status FROM case_issues WHERE case_id = ? ORDER BY number', c.id)
      .map((i) => ({ ...i, legal_area_label: i.legal_area ? AREA[i.legal_area] || i.legal_area : null, status_label: { proposed: 'مقترحة', active: 'قيد الدراسة', dropped: 'مستبعدة' }[i.status] || i.status }));
    const requests = db
      .all('SELECT kind, question, status, created_at, replied_at FROM info_requests WHERE case_id = ? ORDER BY id', c.id)
      .map((r) => ({ kind_label: LABELS.info_request_kind[r.kind] || r.kind, question: truncate(r.question, 400), status_label: LABELS.info_request_status[r.status] || r.status, created_at: r.created_at, replied_at: r.replied_at }));
    const answers = db
      .all('SELECT id, status, sent_at, channel, updated_at FROM client_answers WHERE case_id = ? ORDER BY id', c.id)
      .map((a) => ({ status_label: LABELS.client_answer_status[a.status] || a.status, sent_at: a.sent_at, channel_label: a.channel ? LABELS.channel[a.channel] || a.channel : null, updated_at: a.updated_at }));
    const documents = db
      .all('SELECT title, filename, uploaded_by_kind, created_at FROM documents WHERE case_id = ? ORDER BY id', c.id)
      .map((d) => ({ title: d.title || d.filename, by: LABELS.actor_kind[d.uploaded_by_kind] || d.uploaded_by_kind, created_at: d.created_at }));
    const activity = app.activity.forCase(c.id, c.intake_id);
    const timeline = activity.slice(-80).map((a) => ({
      at: a.created_at,
      summary: a.summary,
      actor: `${LABELS.actor_kind[a.actor_kind] || a.actor_kind}${a.actor_name ? ` — ${a.actor_name}` : ''}`,
    }));
    const cost = app.accounting.caseCost(c.id);
    return {
      number: c.code,
      title: 'ملخص ملف — للاستخدام الداخلي',
      date: nowIso(),
      case: {
        code: c.code,
        title: c.title,
        legal_area_label: AREA[c.legal_area] || c.legal_area,
        status_label: LABELS.case_status[c.status] || c.status,
        priority_label: LABELS.priority[c.priority] || c.priority,
        outcome_label: c.outcome ? LABELS.case_outcome[c.outcome] || c.outcome : null,
        closure_note: c.closure_note,
        created_at: c.created_at,
        due_at: c.due_at,
        closed_at: c.closed_at,
        facts_shared: c.facts_shared,
        facts_internal: c.facts_internal,
        source_label: c.source ? LABELS.source[c.source] || c.source : null,
        channel_label: c.channel ? LABELS.channel[c.channel] || c.channel : null,
        case_manager: c.case_manager_id ? db.value('SELECT name FROM users WHERE id = ?', c.case_manager_id) ?? null : null,
      },
      client: clientBrief(c.client_id),
      program,
      matter: matter ? { ...matter, status_label: LABELS.matter_status[matter.status] || matter.status } : null,
      issues,
      team,
      requests,
      answers,
      documents,
      timeline,
      timeline_total: activity.length,
      cost: cost ? { direct: cost.direct, expenses: cost.expenses, allocated: cost.allocated, total: cost.total, pro_bono_value: cost.pro_bono_value } : null,
    };
  }

  function programmeDoc(id) {
    const d = svc.detail(id);
    const p = d.program;
    // تقرير للجهة الممولة: أرقام وأكواد ملفات فقط — بلا أسماء مستفيدين أو بيانات تواصل
    return {
      number: `${p.code}-RPT`,
      title: 'تقرير البرنامج للجهة الممولة',
      date: nowIso(),
      program: {
        code: p.code,
        name: p.name,
        funder_name: p.funder_name,
        funder_type_label: p.funder_type_label,
        agreement_ref: p.agreement_ref,
        description: p.description,
        restrictions: p.restrictions,
        start_date: p.start_date,
        end_date: p.end_date,
        status_label: p.status_label,
        eligible_governorates: p.eligible_governorates,
        eligible_areas: p.eligible_areas.map((a) => AREA[a] || a),
      },
      stats: d.stats,
      monthly: d.spend.monthly,
      by_category: Object.entries(d.stats.by_category).map(([k, amount]) => ({ key: k, label: LABELS.program_spend_kind[k] || k, amount })),
      impact: d.impact,
      cases: d.cases.map((c) => ({
        code: c.code,
        legal_area_label: c.legal_area_label,
        governorate: c.governorate || null,
        status_label: c.status_label,
        outcome_label: c.outcome_label,
        opened_at: c.created_at,
        closed_at: c.closed_at,
        matter_code: c.matter_code,
        spend: c.spend,
      })),
      alerts: d.alerts.filter((a) => a.current),
    };
  }

  /** محاولة طباعة مستند غير مسموح به: تُسجل تحذيرًا في سجل الأمان ثم يُعاد الخطأ نفسه (404 أو 403) */
  function denyPrint(user, ctx, kind, id, err) {
    try {
      app.audit.log({
        actor: user,
        ctx,
        type: 'print.denied',
        severity: 'warning',
        summary: `محاولة طباعة ${LABELS.print_kind[kind] || kind} غير مسموح بها (المعرف ${id}) — رُفضت`,
        data: { kind, id, status: err.status },
      });
    } catch (e) {
      app.log('programs: audit of denied print failed', e);
    }
    return err;
  }

  function statementDoc(lawyerId, user, query, ctx = null) {
    if (user.role === 'lawyer') {
      if (lawyerId !== user.id) throw denyPrint(user, ctx, 'statement', lawyerId, notFound('المستند غير موجود'));
    } else if (user.role !== 'admin') {
      throw denyPrint(user, ctx, 'statement', lawyerId, forbidden('كشوف حساب المحامين متاحة لمدير النظام وللمحامي نفسه فقط'));
    }
    const lw = db.get(
      "SELECT u.id, u.name, u.active, l.title, l.bar_number, l.agreement, l.package_remaining FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ? AND u.role = 'lawyer'",
      lawyerId,
    );
    if (!lw) throw notFound('المحامي غير موجود');
    const current = periodOf(nowIso());
    // الافتراضي: من بداية السنة الجارية (أو من أول قيد إن كان أحدث) حتى الشهر الجاري؛ وما قبلها يظهر رصيدًا افتتاحيًا
    const first = db.value("SELECT MIN(period) FROM ledger_entries WHERE lawyer_id = ? AND status != 'void'", lw.id) || current;
    const yearStart = `${current.slice(0, 4)}-01`;
    const defaultFrom = first > yearStart ? (first > current ? current : first) : yearStart;
    const from = query.from ? (isValidPeriod(query.from) ? query.from : null) : defaultFrom;
    const to = query.to ? (isValidPeriod(query.to) ? query.to : null) : current;
    if (!from || !to) throw badRequest('الفترة يجب أن تكون بصيغة YYYY-MM');
    if (from > to) throw badRequest('بداية الفترة يجب أن تسبق نهايتها');
    if (periodsBetween(from, to, 1000).length > 60) throw badRequest('أقصى مدة لكشف الحساب 60 شهرًا');
    const start = periodRange(from).start;
    const end = periodRange(to).end;
    const openingAccrued = Number(db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND status != 'void' AND period < ?", lw.id, from));
    const openingPaid = Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payouts WHERE lawyer_id = ? AND paid_at < ?', lw.id, start));
    const entries = db.all(
      `SELECT e.id, e.kind, e.amount_minor, e.period, e.created_at, e.description, e.status, c.code AS case_code, m.code AS matter_code
       FROM ledger_entries e LEFT JOIN cases c ON c.id = e.case_id LEFT JOIN matters m ON m.id = e.matter_id
       WHERE e.lawyer_id = ? AND e.status != 'void' AND e.period >= ? AND e.period <= ? ORDER BY e.period, e.created_at, e.id`,
      lw.id,
      from,
      to,
    );
    const payouts = db.all('SELECT id, amount_minor, paid_at, method, reference FROM payouts WHERE lawyer_id = ? AND paid_at >= ? AND paid_at < ? ORDER BY paid_at, id', lw.id, start, end);
    const accrued = sum(entries);
    const paid = sum(payouts);
    const opening = openingAccrued - openingPaid;
    const events = db.get(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN treatment IN ('pro_bono','csr') THEN 1 ELSE 0 END) AS vol,
         COALESCE(SUM(CASE WHEN treatment IN ('pro_bono','csr') THEN notional_minor ELSE 0 END), 0) AS vv
       FROM billable_events WHERE lawyer_id = ? AND period >= ? AND period <= ?`,
      lw.id,
      from,
      to,
    );
    const ag = parseJson(lw.agreement, {});
    return {
      number: `STM-${lw.id}-${from.replace('-', '')}${to !== from ? `-${to.replace('-', '')}` : ''}`,
      title: 'كشف حساب',
      date: nowIso(),
      lawyer: { name: `${lw.title || ''} ${lw.name}`.trim(), bar_number: lw.bar_number || null, active: !!lw.active },
      agreement_type_label: LABELS.agreement_type[ag.type] || ag.type || null,
      agreement_text: describeAgreement(ag),
      package_remaining: ag.type === 'package' ? lw.package_remaining : null,
      from,
      to,
      period_label: from === to ? arabicPeriod(from) : `من ${arabicPeriod(from)} إلى ${arabicPeriod(to)}`,
      entries: entries.map((e) => ({
        period: e.period,
        period_label: arabicPeriod(e.period),
        date: e.created_at,
        description: e.description,
        kind_label: LABELS.ledger_kind[e.kind] || e.kind,
        case_code: e.case_code,
        matter_code: e.matter_code,
        amount: fromMinor(e.amount_minor),
        status_label: LABELS.ledger_status[e.status] || e.status,
      })),
      payouts: payouts.map((p) => ({ paid_at: p.paid_at, amount: fromMinor(p.amount_minor), method: p.method, reference: p.reference })),
      totals: {
        opening: fromMinor(opening),
        accrued: fromMinor(accrued),
        paid: fromMinor(paid),
        closing: fromMinor(opening + accrued - paid),
        closing_words: opening + accrued - paid > 0 ? amountInWords(opening + accrued - paid) : null,
      },
      approved_consultations: Number(events.n || 0),
      contributions: { count: Number(events.vol || 0), value: fromMinor(Number(events.vv || 0)) },
    };
  }

  // ───────────────────────── المهام الدورية ─────────────────────────
  try {
    backfillReceipts();
  } catch (e) {
    app.log('programs: receipt backfill failed', e);
  }
  // أكثر وقائع الإنفاق شيوعًا (اعتماد رأي محامٍ أو إغلاق ملف ← قيد أتعاب): يُفحص برنامج الملف فورًا
  // بعد اكتمال المعاملة وتسجيل القيد (setImmediate)، دون انتظار المهمة الدورية. لا يُفشل أي إجراء أبدًا.
  const checkCaseProgramSoon = ({ caseId, assignmentId } = {}) => {
    setImmediate(() => {
      try {
        const cid = caseId ?? (assignmentId ? db.value('SELECT case_id FROM assignments WHERE id = ?', assignmentId) : null);
        const pid = cid ? db.value('SELECT program_id FROM cases WHERE id = ?', cid) : null;
        if (pid) svc.checkBudget(pid);
      } catch (e) {
        app.log('programs: budget check after spend event failed', e);
      }
    });
  };
  app.events.on('assignment.approved', checkCaseProgramSoon);
  app.events.on('case.closed', checkCaseProgramSoon);

  app.jobs.register('programs.budget_alerts', {
    everyMinutes: 60,
    label: 'تنبيهات ميزانيات البرامج (80% و100%) وترقيم الإيصالات',
    run: async () => {
      const receipts = backfillReceipts();
      const alerts = svc.checkBudget();
      return { alerts: alerts.length, receipts_numbered: receipts };
    },
  });

  return svc;
}
