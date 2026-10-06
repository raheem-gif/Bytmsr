// المحاسبة داخل نفس المنظومة: اتفاق كل محامٍ يحدد ما يحدث ماليًا عند تحقق واقعة الاستحقاق.
// بالقطعة → مستحق، شهري → ضمن التقرير الشهري، حصة شهرية → ضمنها ثم سعر الزيادة، باقة → خصم من الرصيد،
// تطوعي → مساهمة مجانية بلا التزام مالي، CSR → استهلاك من التزام مكتب المحاماة.
import { nowIso, periodOf, periodRange, isValidPeriod, parseJson, badRequest, notFound, conflict, v, toMinor, fromMinor } from '../util.js';
import { LABELS, ENUMS } from '../constants.js';

const INCLUDED = ['included_monthly', 'included_quota', 'package_credit'];

/** التحقق من اتفاق المحامي وتوحيده (المبالغ بالجنيه) */
export function validateAgreement(input) {
  if (!input || typeof input !== 'object') throw badRequest('اتفاق المحاسبة مطلوب');
  const type = v.oneOf(input.type, ENUMS.agreement_type, 'نوع الاتفاق', { required: true });
  const money = (k, label, required) => {
    const m = v.money(input[k], label, { required });
    return m === null ? null : fromMinor(m);
  };
  const a = {
    type,
    billable_event: v.oneOf(input.billable_event, ENUMS.billable_trigger, 'واقعة الاستحقاق') || 'on_approval',
  };
  switch (type) {
    case 'per_case':
      a.rate = money('rate', 'أجر الاستشارة', true);
      break;
    case 'monthly':
      a.monthly_fee = money('monthly_fee', 'المبلغ الشهري', true);
      break;
    case 'monthly_quota':
      a.monthly_fee = money('monthly_fee', 'المبلغ الشهري', true);
      a.quota = v.int(input.quota, 'عدد الحالات المشمولة شهريًا', { required: true, min: 1, max: 10000 });
      a.overage_rate = money('overage_rate', 'سعر الحالة الزائدة', true);
      break;
    case 'package':
      a.package_size = v.int(input.package_size, 'عدد حالات الباقة', { required: true, min: 1, max: 100000 });
      a.package_price = money('package_price', 'قيمة الباقة', true);
      a.overage_rate = money('overage_rate', 'سعر الحالة بعد نفاد الباقة', false) ?? 0;
      break;
    case 'pro_bono':
      a.notional_value = money('notional_value', 'القيمة التقديرية للاستشارة', false) ?? 0;
      break;
    case 'csr':
      a.csr_firm = v.str(input.csr_firm, 'اسم مكتب المحاماة', { required: true, max: 150 });
      a.csr_cases_commitment = v.int(input.csr_cases_commitment, 'عدد القضايا الملتزم بها', { min: 0, max: 100000 });
      a.csr_hours_commitment = v.num(input.csr_hours_commitment, 'عدد الساعات الملتزم بها', { min: 0, max: 100000 });
      a.csr_period = v.oneOf(input.csr_period, ['month', 'year'], 'فترة الالتزام') || 'year';
      a.notional_value = money('notional_value', 'القيمة التقديرية للاستشارة', false) ?? 0;
      if (!a.csr_cases_commitment && !a.csr_hours_commitment) throw badRequest('حدد عدد القضايا أو الساعات التي يلتزم بها المكتب');
      break;
  }
  return a;
}

export function describeAgreement(a) {
  if (!a) return '—';
  const m = (x) => `${Number(x || 0).toLocaleString('en-US')} جنيه`;
  switch (a.type) {
    case 'per_case': return `${m(a.rate)} لكل استشارة معتمدة`;
    case 'monthly': return `${m(a.monthly_fee)} شهريًا`;
    case 'monthly_quota': return `${m(a.monthly_fee)} شهريًا تشمل ${a.quota} حالة، والزيادة ${m(a.overage_rate)} للحالة`;
    case 'package': return `باقة ${a.package_size} حالة بقيمة ${m(a.package_price)}${a.overage_rate ? `، وبعد نفادها ${m(a.overage_rate)} للحالة` : ''}`;
    case 'pro_bono': return 'تطوعي بالكامل (Pro Bono)';
    case 'csr': return `برنامج CSR — ${a.csr_firm}: ${[a.csr_cases_commitment ? `${a.csr_cases_commitment} قضية` : null, a.csr_hours_commitment ? `${a.csr_hours_commitment} ساعة` : null].filter(Boolean).join(' و')} ${a.csr_period === 'month' ? 'شهريًا' : 'سنويًا'}`;
    default: return LABELS.agreement_type[a.type] || a.type;
  }
}

export function createAccounting(app) {
  const { db } = app;

  function lawyerRow(id) {
    const r = db.get('SELECT u.id, u.name, l.* FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ?', id);
    if (!r) throw notFound('المحامي غير موجود');
    return { ...r, agreement: parseJson(r.agreement, {}) };
  }

  function insertLedger(e) {
    return db.insert('ledger_entries', {
      lawyer_id: e.lawyer_id,
      kind: e.kind,
      amount_minor: e.amount_minor,
      case_id: e.case_id ?? null,
      matter_id: e.matter_id ?? null,
      billable_event_id: e.billable_event_id ?? null,
      expense_id: e.expense_id ?? null,
      period: e.period,
      description: e.description,
      status: 'accrued',
      dedupe_key: e.dedupe_key ?? null,
      created_by: e.created_by ?? null,
      created_at: nowIso(),
    });
  }

  const svc = {
    validateAgreement,
    describeAgreement,

    /**
     * تسجيل واقعة استحقاق لإسناد (مرة واحدة فقط لكل إسناد).
     * @returns صف الواقعة أو null إن كانت مسجلة من قبل
     */
    recordBillableEvent(assignmentId, trigger) {
      return db.tx(() => {
        if (db.get('SELECT 1 FROM billable_events WHERE assignment_id = ?', assignmentId)) return null;
        const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
        if (!a || a.status !== 'approved') return null;
        const lw = lawyerRow(a.lawyer_id);
        const ag = lw.agreement;
        const c = db.get('SELECT code FROM cases WHERE id = ?', a.case_id);
        const t = nowIso();
        const period = periodOf(t);
        let treatment;
        let amount = 0;
        let notional = 0;
        let ledgerKind = 'fee';
        if (a.fee_mode === 'pro_bono') {
          treatment = 'pro_bono';
          notional = toMinor(ag.notional_value ?? ag.rate ?? 0) || 0;
        } else if (a.fee_mode === 'custom') {
          treatment = 'payable';
          amount = a.fee_amount_minor || 0;
        } else {
          switch (ag.type) {
            case 'per_case':
              treatment = 'payable';
              amount = toMinor(ag.rate) || 0;
              break;
            case 'monthly':
              treatment = 'included_monthly';
              break;
            case 'monthly_quota': {
              const used = Number(
                db.value(
                  "SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment IN ('included_quota','overage')",
                  lw.user_id,
                  period,
                ),
              );
              if (used < ag.quota) treatment = 'included_quota';
              else {
                treatment = 'overage';
                amount = toMinor(ag.overage_rate) || 0;
                ledgerKind = 'overage';
              }
              break;
            }
            case 'package': {
              const remaining = Number(lw.package_remaining ?? 0);
              if (remaining > 0) {
                treatment = 'package_credit';
                db.run('UPDATE lawyers SET package_remaining = package_remaining - 1 WHERE user_id = ?', lw.user_id);
                if (remaining - 1 === 0) {
                  app.notifications.notifyStaff({
                    type: 'package.exhausted',
                    title: `نفدت باقة المحامي ${lw.name}`,
                    body: ag.overage_rate ? `الحالات التالية تُحاسب بسعر ${ag.overage_rate} جنيه حتى تجديد الباقة.` : 'يُنصح بتجديد الباقة.',
                    link: `#/lawyers/${lw.user_id}`,
                  });
                }
              } else {
                treatment = 'package_overage';
                amount = toMinor(ag.overage_rate) || 0;
                ledgerKind = 'overage';
              }
              break;
            }
            case 'pro_bono':
              treatment = 'pro_bono';
              notional = toMinor(ag.notional_value) || 0;
              break;
            case 'csr':
              treatment = 'csr';
              notional = toMinor(ag.notional_value) || 0;
              break;
            default:
              treatment = 'payable';
          }
        }
        const beId = db.insert('billable_events', {
          lawyer_id: lw.user_id,
          assignment_id: a.id,
          case_id: a.case_id,
          trigger,
          agreement_type: a.fee_mode === 'agreement' ? ag.type : a.fee_mode,
          treatment,
          amount_minor: amount,
          notional_minor: notional,
          period,
          created_at: t,
        });
        if (amount > 0) {
          insertLedger({
            lawyer_id: lw.user_id,
            kind: ledgerKind,
            amount_minor: amount,
            case_id: a.case_id,
            billable_event_id: beId,
            period,
            description: `${LABELS.ledger_kind[ledgerKind]} — الملف ${c.code} (${LABELS.assignment_role[a.role]})`,
            dedupe_key: `be:${beId}`,
          });
        }
        app.activity.log({
          case_id: a.case_id,
          actor: { kind: 'system' },
          type: 'billing.event',
          summary: `سُجلت واقعة استحقاق لـ ${lw.name}: ${LABELS.treatment[treatment]}${amount ? ` (${fromMinor(amount)} جنيه)` : ''}`,
          data: { billable_event_id: beId, treatment, amount: fromMinor(amount) },
        });
        return db.get('SELECT * FROM billable_events WHERE id = ?', beId);
      });
    },

    onAssignmentApproved({ assignmentId }) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) return;
      const ag = lawyerRow(a.lawyer_id).agreement;
      if ((ag.billable_event || 'on_approval') === 'on_approval') svc.recordBillableEvent(a.id, 'on_approval');
    },

    onCaseClosed({ caseId }) {
      const list = db.all("SELECT a.* FROM assignments a WHERE a.case_id = ? AND a.status = 'approved'", caseId);
      for (const a of list) {
        const ag = lawyerRow(a.lawyer_id).agreement;
        if (ag.billable_event === 'on_close') svc.recordBillableEvent(a.id, 'on_close');
      }
    },

    /** شراء/تجديد باقة: يضيف رصيدًا ويسجل قيمة الباقة كمستحق */
    addPackage(lawyerId, { size, price }, actor) {
      const lw = lawyerRow(lawyerId);
      if (lw.agreement.type !== 'package') throw badRequest('اتفاق هذا المحامي ليس باقة');
      const n = v.int(size, 'عدد حالات الباقة', { required: true, min: 1, max: 100000 });
      const p = v.money(price, 'قيمة الباقة', { required: true });
      db.tx(() => {
        db.run('UPDATE lawyers SET package_remaining = COALESCE(package_remaining, 0) + ? WHERE user_id = ?', n, lw.user_id);
        if (p > 0) {
          insertLedger({
            lawyer_id: lw.user_id,
            kind: 'package_purchase',
            amount_minor: p,
            period: periodOf(nowIso()),
            description: `قيمة باقة ${n} حالة`,
            created_by: actor?.id,
          });
        }
      });
      return lawyerRow(lw.user_id);
    },

    /** إصدار المبالغ الشهرية الثابتة لفترة (قابل للتكرار دون ازدواج) */
    closeMonth(period, actor) {
      if (!isValidPeriod(period)) throw badRequest('الفترة يجب أن تكون بصيغة YYYY-MM');
      if (period > periodOf(nowIso())) throw badRequest('لا يمكن إصدار مستحقات فترة مستقبلية');
      const created = [];
      const lawyers = db.all("SELECT u.id, u.name, u.created_at, l.agreement FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer'");
      const { end } = periodRange(period);
      for (const lw of lawyers) {
        const ag = parseJson(lw.agreement, {});
        if (!['monthly', 'monthly_quota'].includes(ag.type)) continue;
        if (lw.created_at >= end) continue; // لم يكن متعاقدًا في هذه الفترة
        const key = `monthly:${lw.id}:${period}`;
        if (db.get('SELECT 1 FROM ledger_entries WHERE dedupe_key = ?', key)) continue;
        const events = Number(db.value('SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ?', lw.id, period));
        const id = insertLedger({
          lawyer_id: lw.id,
          kind: 'monthly_fee',
          amount_minor: toMinor(ag.monthly_fee) || 0,
          period,
          description: `المبلغ الشهري عن ${period} (${events} استشارة معتمدة خلال الشهر)`,
          dedupe_key: key,
          created_by: actor?.id,
        });
        created.push({ lawyer_id: lw.id, name: lw.name, entry_id: id, amount: ag.monthly_fee });
      }
      return { period, created };
    },

    addAdjustment(body, actor) {
      const lawyerId = v.int(body.lawyer_id, 'المحامي', { required: true, min: 1 });
      lawyerRow(lawyerId);
      const amount = v.money(body.amount, 'المبلغ', { required: true, min: -100000000 });
      if (amount === 0) throw badRequest('المبلغ لا يمكن أن يكون صفرًا');
      const kind = v.oneOf(body.kind, ['adjustment', 'matter_fee'], 'نوع القيد') || 'adjustment';
      const caseId = v.int(body.case_id, 'الملف', { min: 1 });
      const matterId = v.int(body.matter_id, 'الملف المستمر', { min: 1 });
      let resolvedCase = caseId;
      if (matterId) {
        const m = db.get('SELECT case_id FROM matters WHERE id = ?', matterId);
        if (!m) throw badRequest('الملف المستمر غير موجود');
        resolvedCase = resolvedCase ?? m.case_id;
      }
      if (resolvedCase && !db.get('SELECT 1 FROM cases WHERE id = ?', resolvedCase)) throw badRequest('الملف غير موجود');
      const id = insertLedger({
        lawyer_id: lawyerId,
        kind,
        amount_minor: amount,
        case_id: resolvedCase,
        matter_id: matterId,
        period: periodOf(nowIso()),
        description: v.str(body.description, 'البيان', { required: true, max: 300 }),
        created_by: actor.id,
      });
      if (resolvedCase) {
        app.activity.log({ case_id: resolvedCase, matter_id: matterId, actor, type: 'billing.manual', summary: `قيد يدوي للمحامي ${lawyerRow(lawyerId).name}: ${fromMinor(amount)} جنيه` });
      }
      return db.get('SELECT * FROM ledger_entries WHERE id = ?', id);
    },

    reimburseExpense(expense, actor) {
      if (expense.paid_by !== 'lawyer' || !expense.lawyer_id) return null;
      return insertLedger({
        lawyer_id: expense.lawyer_id,
        kind: 'reimbursement',
        amount_minor: expense.amount_minor,
        case_id: expense.case_id,
        matter_id: expense.matter_id,
        expense_id: expense.id,
        period: periodOf(nowIso()),
        description: `استرداد مصروفات: ${expense.description}`,
        dedupe_key: `expense:${expense.id}`,
        created_by: actor?.id,
      });
    },

    voidEntry(entryId, actor, note) {
      const e = db.get('SELECT * FROM ledger_entries WHERE id = ?', entryId);
      if (!e) throw notFound('القيد غير موجود');
      if (e.status !== 'accrued') throw conflict('يمكن إلغاء القيود غير المصروفة فقط');
      db.update('ledger_entries', e.id, { status: 'void', description: `${e.description} — ملغي${note ? `: ${note}` : ''}` });
      return db.get('SELECT * FROM ledger_entries WHERE id = ?', e.id);
    },

    /** صرف مستحقات محامٍ */
    payout(body, actor) {
      const lawyerId = v.int(body.lawyer_id, 'المحامي', { required: true, min: 1 });
      const lw = lawyerRow(lawyerId);
      const ids = v.ids(body.entry_ids, 'القيود');
      if (!ids.length) throw badRequest('اختر القيود المراد صرفها');
      return db.tx(() => {
        let total = 0;
        for (const id of ids) {
          const e = db.get('SELECT * FROM ledger_entries WHERE id = ?', id);
          if (!e || e.lawyer_id !== lw.user_id) throw badRequest(`القيد ${id} لا يخص هذا المحامي`);
          if (e.status !== 'accrued') throw conflict(`القيد ${id} مصروف أو ملغي بالفعل`);
          total += e.amount_minor;
        }
        if (total <= 0) throw badRequest('إجمالي المبلغ المختار يجب أن يكون أكبر من صفر');
        const t = nowIso();
        const pid = db.insert('payouts', {
          lawyer_id: lw.user_id,
          amount_minor: total,
          paid_at: v.iso(body.paid_at, 'تاريخ الصرف') || t,
          method: v.str(body.method, 'طريقة الصرف', { max: 60 }),
          reference: v.str(body.reference, 'المرجع', { max: 120 }),
          note: v.str(body.note, 'ملاحظة', { max: 500 }),
          created_by: actor.id,
          created_at: t,
        });
        for (const id of ids) db.update('ledger_entries', id, { status: 'paid', payout_id: pid });
        app.notifications.notify(lw.user_id, {
          type: 'payout',
          title: `تم صرف ${fromMinor(total).toLocaleString('en-US')} جنيه من مستحقاتك`,
          link: '#/my/statement',
        });
        return { ...db.get('SELECT * FROM payouts WHERE id = ?', pid), amount: fromMinor(total) };
      });
    },

    ledger({ lawyer_id, status, period, limit = 300 } = {}) {
      const where = ['1=1'];
      const params = [];
      if (lawyer_id) {
        where.push('e.lawyer_id = ?');
        params.push(Number(lawyer_id));
      }
      if (status && ENUMS.ledger_status.includes(status)) {
        where.push('e.status = ?');
        params.push(status);
      }
      if (period && isValidPeriod(period)) {
        where.push('e.period = ?');
        params.push(period);
      }
      return db
        .all(
          `SELECT e.*, u.name AS lawyer_name, c.code AS case_code, m.code AS matter_code FROM ledger_entries e
           JOIN users u ON u.id = e.lawyer_id LEFT JOIN cases c ON c.id = e.case_id LEFT JOIN matters m ON m.id = e.matter_id
           WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT ?`,
          ...params,
          Math.min(Number(limit) || 300, 2000),
        )
        .map((e) => ({ ...e, amount: fromMinor(e.amount_minor) }));
    },

    /** تكلفة الملف الفعلية: مباشرة + مصروفات + تكلفة محمّلة تقديرية + قيمة المساهمات التطوعية */
    caseCost(caseId) {
      const c = db.get('SELECT id, matter_id FROM cases WHERE id = ?', caseId);
      if (!c) return null;
      const lines = [];
      const direct = db.all(
        `SELECT e.*, u.name AS lawyer_name FROM ledger_entries e JOIN users u ON u.id = e.lawyer_id
         WHERE e.status != 'void' AND (e.case_id = ? OR (? IS NOT NULL AND e.matter_id = ?)) AND e.kind != 'monthly_fee' AND e.kind != 'package_purchase'`,
        c.id,
        c.matter_id,
        c.matter_id,
      );
      let directSum = 0;
      for (const e of direct) {
        directSum += e.amount_minor;
        lines.push({ kind: 'direct', label: `${LABELS.ledger_kind[e.kind]} — ${e.lawyer_name}`, amount: fromMinor(e.amount_minor), status: e.status });
      }
      const expenses = db.all(
        "SELECT * FROM expenses WHERE paid_by = 'organization' AND (case_id = ? OR (? IS NOT NULL AND matter_id = ?))",
        c.id,
        c.matter_id,
        c.matter_id,
      );
      let expSum = 0;
      for (const x of expenses) {
        expSum += x.amount_minor;
        lines.push({ kind: 'expense', label: `مصروفات: ${x.description}`, amount: fromMinor(x.amount_minor) });
      }
      let allocated = 0;
      let notional = 0;
      const events = db.all(
        `SELECT b.*, u.name AS lawyer_name, l.agreement FROM billable_events b JOIN users u ON u.id = b.lawyer_id
         JOIN lawyers l ON l.user_id = b.lawyer_id WHERE b.case_id = ?`,
        c.id,
      );
      for (const b of events) {
        const ag = parseJson(b.agreement, {});
        if (b.treatment === 'included_monthly' || b.treatment === 'included_quota') {
          const count = Number(
            db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment IN ('included_monthly','included_quota')", b.lawyer_id, b.period),
          );
          const share = Math.round((toMinor(ag.monthly_fee) || 0) / Math.max(count, 1));
          allocated += share;
          lines.push({ kind: 'allocated', label: `حصة تقديرية من المبلغ الشهري — ${b.lawyer_name}`, amount: fromMinor(share) });
        } else if (b.treatment === 'package_credit') {
          const share = ag.package_size ? Math.round((toMinor(ag.package_price) || 0) / ag.package_size) : 0;
          allocated += share;
          lines.push({ kind: 'allocated', label: `حصة من قيمة الباقة — ${b.lawyer_name}`, amount: fromMinor(share) });
        } else if (b.treatment === 'pro_bono' || b.treatment === 'csr') {
          notional += b.notional_minor;
          lines.push({ kind: 'contribution', label: `${LABELS.treatment[b.treatment]} — ${b.lawyer_name}`, amount: fromMinor(b.notional_minor) });
        }
      }
      return {
        direct: fromMinor(directSum),
        expenses: fromMinor(expSum),
        allocated: fromMinor(allocated),
        total: fromMinor(directSum + expSum + allocated),
        pro_bono_value: fromMinor(notional),
        lawyers_involved: new Set(events.map((e) => e.lawyer_id)).size,
        lines,
      };
    },

    /** ملخص فترة محاسبية */
    summary(period) {
      const p = isValidPeriod(period) ? period : periodOf(nowIso());
      const lawyers = db.all(
        "SELECT u.id, u.name, u.active, l.title, l.agreement, l.package_remaining FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer' ORDER BY u.name",
      );
      const rows = lawyers.map((lw) => {
        const ag = parseJson(lw.agreement, {});
        const ev = db.all('SELECT treatment, COUNT(*) AS n, SUM(amount_minor) AS amt, SUM(notional_minor) AS nv FROM billable_events WHERE lawyer_id = ? AND period = ? GROUP BY treatment', lw.id, p);
        const byTreatment = Object.fromEntries(ev.map((r) => [r.treatment, Number(r.n)]));
        const events = ev.reduce((s, r) => s + Number(r.n), 0);
        const periodAmount = Number(db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND period = ? AND status != 'void'", lw.id, p));
        const unpaid = Number(db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND status = 'accrued'", lw.id));
        const notional = ev.reduce((s, r) => s + Number(r.nv || 0), 0);
        const needsClosing = ['monthly', 'monthly_quota'].includes(ag.type) && !db.get('SELECT 1 FROM ledger_entries WHERE dedupe_key = ?', `monthly:${lw.id}:${p}`);
        let csr = null;
        if (ag.type === 'csr') {
          const range = ag.csr_period === 'month' ? [p, p] : [`${p.slice(0, 4)}-01`, `${p.slice(0, 4)}-12`];
          const used = Number(db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND treatment = 'csr' AND period BETWEEN ? AND ?", lw.id, range[0], range[1]));
          const hours = Number(
            db.value(
              "SELECT COALESCE(SUM(a.hours_spent), 0) FROM billable_events b JOIN assignments a ON a.id = b.assignment_id WHERE b.lawyer_id = ? AND b.treatment = 'csr' AND b.period BETWEEN ? AND ?",
              lw.id,
              range[0],
              range[1],
            ),
          );
          csr = { cases_used: used, cases_commitment: ag.csr_cases_commitment || null, hours_used: hours, hours_commitment: ag.csr_hours_commitment || null, period: ag.csr_period };
        }
        let quota = null;
        if (ag.type === 'monthly_quota') quota = { used: (byTreatment.included_quota || 0) + (byTreatment.overage || 0), included: ag.quota };
        return {
          lawyer_id: lw.id,
          name: `${lw.title || ''} ${lw.name}`.trim(),
          active: !!lw.active,
          agreement_type: ag.type,
          agreement_text: describeAgreement(ag),
          events,
          by_treatment: byTreatment,
          period_amount: fromMinor(periodAmount),
          unpaid_balance: fromMinor(unpaid),
          contribution_value: fromMinor(notional),
          package_remaining: ag.type === 'package' ? lw.package_remaining : null,
          quota,
          csr,
          needs_month_closing: needsClosing,
        };
      });
      const totals = {
        period_amount: rows.reduce((s, r) => s + r.period_amount, 0),
        unpaid_balance: rows.reduce((s, r) => s + r.unpaid_balance, 0),
        events: rows.reduce((s, r) => s + r.events, 0),
        pro_bono_events: Number(db.value("SELECT COUNT(*) FROM billable_events WHERE period = ? AND treatment IN ('pro_bono','csr')", p)),
        contribution_value: rows.reduce((s, r) => s + r.contribution_value, 0),
        paid_in_period: fromMinor(
          Number(
            db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payouts WHERE paid_at >= ? AND paid_at < ?', periodRange(p).start, periodRange(p).end),
          ),
        ),
      };
      // تكلفة الملفات المغلقة خلال الفترة وأنواع الملفات الأكثر استهلاكًا للموارد
      const { start, end } = periodRange(p);
      const closed = db.all('SELECT id, code, title, legal_area FROM cases WHERE closed_at >= ? AND closed_at < ?', start, end);
      const caseCosts = closed.map((c) => ({ ...c, ...svc.caseCost(c.id), team_size: Number(db.value('SELECT COUNT(*) FROM billable_events WHERE case_id = ?', c.id)) }));
      const byArea = {};
      for (const c of caseCosts) {
        byArea[c.legal_area] = byArea[c.legal_area] || { legal_area: c.legal_area, cases: 0, total: 0, multi_specialty: 0 };
        byArea[c.legal_area].cases++;
        byArea[c.legal_area].total += c.total;
        if (c.team_size > 1) byArea[c.legal_area].multi_specialty++;
      }
      return {
        period: p,
        totals,
        lawyers: rows,
        closed_cases: caseCosts.map(({ lines, ...rest }) => rest),
        by_area: Object.values(byArea).map((x) => ({ ...x, average: x.cases ? Math.round((x.total / x.cases) * 100) / 100 : 0 })),
      };
    },

    /** كشف حساب المحامي (يراه المحامي لنفسه فقط) */
    statement(lawyerId) {
      const lw = lawyerRow(lawyerId);
      const entries = svc.ledger({ lawyer_id: lw.user_id, limit: 500 });
      const events = db
        .all(
          `SELECT b.*, c.code AS case_code, a.role FROM billable_events b JOIN cases c ON c.id = b.case_id
           JOIN assignments a ON a.id = b.assignment_id WHERE b.lawyer_id = ? ORDER BY b.id DESC LIMIT 500`,
          lw.user_id,
        )
        .map((b) => ({
          id: b.id,
          case_id: b.case_id,
          case_code: b.case_code,
          role: b.role,
          role_label: LABELS.assignment_role[b.role],
          treatment: b.treatment,
          treatment_label: LABELS.treatment[b.treatment],
          amount: fromMinor(b.amount_minor),
          notional: fromMinor(b.notional_minor),
          period: b.period,
          created_at: b.created_at,
        }));
      const payouts = db
        .all(
          `SELECT p.id, p.amount_minor, p.paid_at, p.method, p.reference, p.note,
             (SELECT COUNT(*) FROM ledger_entries e WHERE e.payout_id = p.id) AS entries_count
           FROM payouts p WHERE p.lawyer_id = ? ORDER BY p.id DESC`,
          lw.user_id,
        )
        .map((p) => ({ ...p, amount: fromMinor(p.amount_minor), entries_count: Number(p.entries_count) }));
      return {
        agreement: lw.agreement,
        agreement_text: describeAgreement(lw.agreement),
        package_remaining: lw.agreement.type === 'package' ? lw.package_remaining : null,
        unpaid_balance: fromMinor(entries.filter((e) => e.status === 'accrued').reduce((s, e) => s + e.amount_minor, 0)),
        paid_total: fromMinor(payouts.reduce((s, p) => s + p.amount_minor, 0)),
        pro_bono_count: events.filter((e) => e.treatment === 'pro_bono' || e.treatment === 'csr').length,
        entries: entries.map(({ dedupe_key, created_by, ...e }) => ({ ...e, kind_label: LABELS.ledger_kind[e.kind], status_label: LABELS.ledger_status[e.status] })),
        events,
        payouts,
      };
    },

    INCLUDED,
  };
  return svc;
}
