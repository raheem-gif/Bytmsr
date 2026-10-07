// الإصدار 9.1 — مسار l-court: «مستحقاتي» (L-09). يضيف إلى كشف حساب المحامي (accounting.statement) إجابة
// «كم لي هذا الشهر، ومتى»: this_month وmonths وunpaid وlast_payout وpayout_note وperformance.
// للقراءة فقط وللمحامي نفسه فقط (المسار /api/lawyer/statement يمرر u.id). لا تغيير في قواعد الأتعاب.
import { nowIso, periodOf, fromMinor } from '../util.js';

const MONTHLY = ['monthly', 'monthly_quota'];
const VOLUNTEER = ['pro_bono', 'csr'];

/** تسمية سطر في «الأشهر السابقة» بلا مصطلحات محاسبية */
function lineLabel(e, agreementType) {
  switch (e.kind) {
    case 'monthly_fee':
      return 'المبلغ الشهري';
    case 'fee':
      return 'أتعاب استشارة معتمدة';
    case 'overage':
      return agreementType === 'package' ? 'استشارة بعد نفاد الباقة' : 'استشارة زائدة على الحصة';
    case 'matter_fee':
      return 'أتعاب ملف مستمر';
    case 'reimbursement':
      return 'استرداد مصروفات';
    case 'package_purchase':
      return 'قيمة الباقة';
    default:
      return 'تسوية';
  }
}

function statusOf(list) {
  const paid = list.filter((e) => e.status === 'paid').length;
  if (!paid) return 'unpaid';
  return paid === list.length ? 'paid' : 'partial';
}

/**
 * @param {object} app
 * @param {{ lw: object, entries: Array, payouts: Array }} input lw = صف المحامي مع agreement محللًا،
 *   entries = قيود الدفتر (من accounting.ledger، بما فيها الملغاة)، payouts = الدفعات (الأحدث أولًا)
 */
export function lawyerPayView(app, { lw, entries, payouts }) {
  const { db } = app;
  const t = nowIso();
  const period = periodOf(t);
  const ag = lw.agreement || {};
  const userId = lw.user_id ?? lw.id;
  const live = entries.filter((e) => e.status !== 'void');
  const amountOf = (list) => list.reduce((s, e) => s + Number(e.amount_minor || 0), 0);
  const userRow = db.get('SELECT active FROM users WHERE id = ?', userId);
  const active = !!userRow?.active;

  // ── هذا الشهر ──
  const thisPeriod = live.filter((e) => e.period === period);
  const lines = [];
  let volunteer = null;
  let quota = null;
  if (MONTHLY.includes(ag.type)) {
    const monthly = thisPeriod.filter((e) => e.kind === 'monthly_fee');
    if (monthly.length) lines.push({ key: 'monthly', label: 'المبلغ الشهري', amount: fromMinor(amountOf(monthly)), state: 'recorded' });
    else if (active) lines.push({ key: 'monthly', label: 'المبلغ الشهري الثابت', amount: Number(ag.monthly_fee) || 0, state: 'expected', note: 'يُسجَّل عند إقفال الشهر' });
    lines.push({ key: 'extra', label: 'أتعاب إضافية مسجلة', amount: fromMinor(amountOf(thisPeriod.filter((e) => e.kind !== 'monthly_fee'))), state: 'recorded' });
    if (ag.type === 'monthly_quota') {
      const used = Number(db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment IN ('included_quota','overage')", userId, period));
      quota = { used, included: Number(ag.quota) || 0 };
    }
  } else if (VOLUNTEER.includes(ag.type)) {
    const r = db.get("SELECT COUNT(*) AS n, COALESCE(SUM(notional_minor), 0) AS nv FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment IN ('pro_bono','csr')", userId, period);
    volunteer = { count: Number(r?.n || 0), notional: fromMinor(Number(r?.nv || 0)) };
    const extra = amountOf(thisPeriod);
    if (extra) lines.push({ key: 'extra', label: 'مبالغ مسجلة لك (مثل استرداد مصروفات)', amount: fromMinor(extra), state: 'recorded' });
  } else {
    // بالقطعة أو باقة: الاستشارات المعتمدة هذا الشهر وما سُجّل عنها، ثم ما عداها
    const approved = Number(db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment NOT IN ('pro_bono','csr')", userId, period));
    const feeKinds = ['fee', 'overage'];
    lines.push({ key: 'consultations', count: approved, label: 'استشارات معتمدة هذا الشهر', amount: fromMinor(amountOf(thisPeriod.filter((e) => feeKinds.includes(e.kind)))), state: 'recorded' });
    const extra = amountOf(thisPeriod.filter((e) => !feeKinds.includes(e.kind)));
    if (extra) lines.push({ key: 'extra', label: ag.type === 'package' ? 'مبالغ أخرى مسجلة (منها قيمة الباقة)' : 'أتعاب إضافية مسجلة', amount: fromMinor(extra), state: 'recorded' });
  }
  const this_month = {
    period,
    agreement_type: ag.type || null,
    expected_total: Math.round(lines.reduce((s, l) => s + Number(l.amount || 0), 0) * 100) / 100,
    lines,
    volunteer,
    quota,
    package: ag.type === 'package' ? { remaining: lw.package_remaining ?? null, size: Number(ag.package_size) || null } : null,
  };

  // ── الأشهر (الأحدث أولًا، دون القيود الملغاة) ──
  const byPeriod = new Map();
  for (const e of live) {
    if (!byPeriod.has(e.period)) byPeriod.set(e.period, []);
    byPeriod.get(e.period).push(e);
  }
  const months = [...byPeriod.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([p, list]) => ({
      period: p,
      total: fromMinor(amountOf(list)),
      unpaid: fromMinor(amountOf(list.filter((e) => e.status === 'accrued'))),
      status: statusOf(list),
      lines: list
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((e) => ({
          kind: e.kind,
          label: lineLabel(e, ag.type),
          amount: fromMinor(e.amount_minor),
          status: e.status,
          case_code: e.case_code || null,
          matter_code: e.matter_code || null,
          // التسوية وحدها نصها حر من الإدارة؛ بقية القيود تكفيها التسمية والكود
          note: e.kind === 'adjustment' ? e.description || null : null,
        })),
    }));

  const accrued = live.filter((e) => e.status === 'accrued');
  const unpaid = {
    total: fromMinor(amountOf(accrued)),
    periods: [...new Set(accrued.map((e) => e.period))].sort(),
  };
  const lp = payouts && payouts.length ? payouts[0] : null;

  // ── أدائي (انتقل من الصفحة الرئيسية) ──
  let performance = null;
  try {
    const m = app.lawyers.metricsFor(userId, period);
    performance = { avg_response_hours: m.avg_response_hours, approved_this_month: m.completed_in_period, returned_rate: m.returned_rate };
  } catch {
    performance = null;
  }

  return {
    this_month,
    months,
    unpaid,
    last_payout: lp ? { paid_at: lp.paid_at, amount: lp.amount ?? fromMinor(lp.amount_minor) } : null,
    payout_note: String(app.settings.get('lawyer_payout_note') || '').trim(),
    performance,
  };
}

