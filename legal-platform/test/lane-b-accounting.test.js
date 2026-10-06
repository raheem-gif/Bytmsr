// Lane B — Requirement 10: accounting per lawyer agreement, created through POST /api/admin/lawyers.
// per_case, monthly (fee issued on month close, idempotent), monthly_quota (N included then overage), package (credits
// then overage), 100% pro bono (contribution, no obligation), CSR, the on_close trigger, payouts, voids, case cost,
// and who is allowed to touch money (admin only).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import {
  ok, createLawyer, newCase, assign, lawyerSubmits, approveOpinion, notificationsOf, caseDetail, allKeys, LAWYER_PASSWORD,
} from './lane-b-kit.test.js';

const NOV = '2026-11-10T10:00:00.000Z';
const LONG = { sessionTtlHours: 24 * 365 };

afterEach(() => resetClock());

async function boot(at = NOV) {
  freezeClock(at);
  const t = await startTestApp({ seed: 'none', config: LONG });
  return { t, admin: await t.login('admin') };
}

/** One consultation for this lawyer, approved by admin. Returns { caseId, assignmentId, opinionId }. */
async function approvedConsult(admin, lawyerClient, lawyerId, assignExtra = {}) {
  const k = await newCase(admin, { title: 'استشارة للمحاسبة' });
  const a = await assign(admin, k.id, { lawyer_id: lawyerId, role: 'lead', ...assignExtra });
  const op = await lawyerSubmits(lawyerClient, a.id);
  await approveOpinion(admin, op);
  return { caseId: k.id, code: k.code, assignmentId: a.id, opinionId: op };
}
async function ledgerOf(admin, lawyerId) {
  return ok(await admin.get(`/api/admin/accounting/ledger?lawyer_id=${lawyerId}`));
}
async function summaryRow(admin, lawyerId, period = '2026-11') {
  const s = ok(await admin.get(`/api/admin/accounting/summary?period=${period}`));
  return { row: s.lawyers.find((l) => l.lawyer_id === lawyerId), summary: s };
}
async function billingOf(admin, caseId, lawyerId) {
  const d = await caseDetail(admin, caseId);
  return d.assignments.find((a) => a.lawyer_id === lawyerId).billing;
}

test('creating lawyers: every agreement type is validated, and no password material is ever returned', async () => {
  const { t, admin } = await boot();
  try {
    const bad = [
      { type: 'per_case' },
      { type: 'monthly' },
      { type: 'monthly_quota', monthly_fee: 2000, overage_rate: 300 },
      { type: 'package', package_size: 5 },
      { type: 'csr', csr_firm: 'مكتب بلا التزام' },
      { type: 'hourly', rate: 100 },
      { type: 'per_case', rate: 500, billable_event: 'whenever' },
    ];
    for (const agreement of bad) {
      const r = await admin.post('/api/admin/lawyers', { username: `bad${Math.random().toString(36).slice(2, 7)}`, password: LAWYER_PASSWORD, name: 'x', specialties: ['GEN'], agreement });
      assert.equal(r.status, 400, `agreement ${JSON.stringify(agreement)} must be rejected`);
    }
    const lw = await createLawyer(admin, { username: 'percase', agreement: { type: 'per_case', rate: 500 } });
    assert.equal(lw.agreement.type, 'per_case');
    assert.equal(lw.agreement.rate, 500);
    assert.equal(lw.agreement.billable_event, 'on_approval', 'default trigger is on_approval');
    for (const payload of [lw, ok(await admin.get(`/api/admin/lawyers/${lw.id}`)), ok(await admin.get('/api/admin/lawyers')), ok(await admin.get('/api/admin/users'))]) {
      const keys = allKeys(payload);
      assert.equal(keys.has('password_hash') || keys.has('password'), false, 'password material must never be returned');
    }
    assert.equal(JSON.stringify(lw).includes(LAWYER_PASSWORD), false);
    assert.equal((await admin.post('/api/admin/lawyers', { username: 'percase', password: LAWYER_PASSWORD, name: 'dup', specialties: ['GEN'], agreement: { type: 'per_case', rate: 1 } })).status, 409);
    const login = await t.login('percase');
    assert.equal(login.user.role, 'lawyer');
  } finally {
    await t.close();
  }
});

test('per_case (on_approval): 500 EGP accrued per approved consultation — nothing for submitted or returned work; fee frozen once billed', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 500 } });
    const cL = await t.login(L.username);
    const c1 = await approvedConsult(admin, cL, L.id);
    const c2 = await approvedConsult(admin, cL, L.id);
    // a third one is returned, a fourth only submitted
    const k3 = await newCase(admin);
    const a3 = await assign(admin, k3.id, { lawyer_id: L.id, role: 'lead' });
    const op3 = await lawyerSubmits(cL, a3.id);
    ok(await admin.post(`/api/admin/opinions/${op3}/return`, { note: 'أكمل التحليل' }));
    const k4 = await newCase(admin);
    const a4 = await assign(admin, k4.id, { lawyer_id: L.id, role: 'lead' });
    await lawyerSubmits(cL, a4.id);

    const led = await ledgerOf(admin, L.id);
    assert.equal(led.length, 2);
    assert.ok(led.every((e) => e.kind === 'fee' && e.amount === 500 && e.status === 'accrued' && e.period === '2026-11'));
    assert.deepEqual(led.map((e) => e.case_id).sort(), [c1.caseId, c2.caseId].sort());
    assert.deepEqual(await billingOf(admin, c1.caseId, L.id), { treatment: 'payable', amount: 500, notional: 0, period: '2026-11', trigger: 'on_approval' });
    assert.equal(await billingOf(admin, k3.id, L.id), null);
    assert.equal(await billingOf(admin, k4.id, L.id), null);
    const st = ok(await cL.get('/api/lawyer/statement'));
    assert.equal(st.unpaid_balance, 1000);
    assert.equal(st.events.length, 2);
    const { row } = await summaryRow(admin, L.id);
    assert.equal(row.events, 2);
    assert.equal(row.period_amount, 1000);
    assert.equal((await admin.patch(`/api/admin/assignments/${c1.assignmentId}`, { fee_mode: 'custom', fee_amount: 900 })).status, 409, 'fee cannot change after the billable event');
    assert.equal((await admin.post(`/api/admin/assignments/${c1.assignmentId}/withdraw`, {})).status, 409);
    const cost = ok(await admin.get(`/api/admin/accounting/case-cost/${c1.caseId}`));
    assert.equal(cost.direct, 500);
    assert.equal(cost.total, 500);
  } finally {
    await t.close();
  }
});

test('billable trigger on_close: approval alone bills nothing; closing the case bills once (re-close after reopen does not double-bill)', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 500, billable_event: 'on_close' } });
    const cL = await t.login(L.username);
    const c = await approvedConsult(admin, cL, L.id);
    assert.equal((await ledgerOf(admin, L.id)).length, 0);
    assert.equal(await billingOf(admin, c.caseId, L.id), null);
    ok(await admin.post(`/api/admin/cases/${c.caseId}/close`, { outcome: 'answered' }));
    let led = await ledgerOf(admin, L.id);
    assert.equal(led.length, 1);
    assert.equal(led[0].amount, 500);
    assert.equal((await billingOf(admin, c.caseId, L.id)).trigger, 'on_close');
    ok(await admin.post(`/api/admin/cases/${c.caseId}/reopen`, { note: 'سؤال إضافي' }));
    ok(await admin.post(`/api/admin/cases/${c.caseId}/close`, { outcome: 'answered' }));
    led = await ledgerOf(admin, L.id);
    assert.equal(led.length, 1, 'the same assignment is billed only once');
    // an on_approval lawyer on the same kind of flow is billed at approval, not again at close
    const P = await createLawyer(admin, { agreement: { type: 'per_case', rate: 300 } });
    const cP = await t.login(P.username);
    const c2 = await approvedConsult(admin, cP, P.id);
    ok(await admin.post(`/api/admin/cases/${c2.caseId}/close`, { outcome: 'answered' }));
    assert.equal((await ledgerOf(admin, P.id)).length, 1);
  } finally {
    await t.close();
  }
});

test('monthly fixed fee: approvals are included in the monthly report; the fee is issued on month close exactly once', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'monthly', monthly_fee: 3000 } });
    const cL = await t.login(L.username);
    const c1 = await approvedConsult(admin, cL, L.id);
    const c2 = await approvedConsult(admin, cL, L.id);
    assert.equal((await ledgerOf(admin, L.id)).length, 0, 'no per-consultation ledger entry');
    assert.equal((await billingOf(admin, c1.caseId, L.id)).treatment, 'included_monthly');
    let { row } = await summaryRow(admin, L.id);
    assert.equal(row.events, 2);
    assert.equal(row.by_treatment.included_monthly, 2);
    assert.equal(row.needs_month_closing, true);
    assert.equal(row.period_amount, 0);

    assert.equal((await admin.post('/api/admin/accounting/close-month', { period: '2026-12' })).status, 400, 'future period');
    assert.equal((await admin.post('/api/admin/accounting/close-month', { period: '11-2026' })).status, 400);
    const first = ok(await admin.post('/api/admin/accounting/close-month', { period: '2026-11' }));
    const mine = first.created.filter((x) => x.lawyer_id === L.id);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].amount, 3000);
    const again = ok(await admin.post('/api/admin/accounting/close-month', { period: '2026-11' }));
    assert.deepEqual(again.created, [], 'closing the same month twice issues nothing new');
    const led = await ledgerOf(admin, L.id);
    assert.equal(led.length, 1);
    assert.equal(led[0].kind, 'monthly_fee');
    assert.equal(led[0].amount, 3000);
    assert.ok(led[0].description.includes('2'), 'monthly entry reports the number of consultations');
    ({ row } = await summaryRow(admin, L.id));
    assert.equal(row.needs_month_closing, false);
    assert.equal(row.period_amount, 3000);
    const cost = ok(await admin.get(`/api/admin/accounting/case-cost/${c2.caseId}`));
    assert.equal(cost.allocated, 1500, 'the real cost of each case carries its share of the monthly fee');
    assert.equal(cost.direct, 0);
  } finally {
    await t.close();
  }
});

test('monthly quota: N consultations included, overage rate beyond N, quota resets the next month', async () => {
  const { t, admin } = await boot('2026-10-15T10:00:00.000Z');
  try {
    const L = await createLawyer(admin, { agreement: { type: 'monthly_quota', monthly_fee: 2000, quota: 2, overage_rate: 300 } });
    const cL = await t.login(L.username);
    const cs = [];
    for (let i = 0; i < 3; i++) cs.push(await approvedConsult(admin, cL, L.id));
    const treatments = [];
    for (const c of cs) treatments.push((await billingOf(admin, c.caseId, L.id)).treatment);
    assert.deepEqual(treatments, ['included_quota', 'included_quota', 'overage']);
    let led = await ledgerOf(admin, L.id);
    assert.equal(led.length, 1);
    assert.equal(led[0].kind, 'overage');
    assert.equal(led[0].amount, 300);
    assert.equal(led[0].case_id, cs[2].caseId);
    const { row } = await summaryRow(admin, L.id, '2026-10');
    assert.deepEqual(row.quota, { used: 3, included: 2 });

    freezeClock(NOV);
    const nov = await approvedConsult(admin, cL, L.id);
    assert.equal((await billingOf(admin, nov.caseId, L.id)).treatment, 'included_quota', 'a new month starts a fresh quota');
    const oct = ok(await admin.post('/api/admin/accounting/close-month', { period: '2026-10' }));
    assert.equal(oct.created.find((x) => x.lawyer_id === L.id).amount, 2000);
    led = await ledgerOf(admin, L.id);
    assert.deepEqual(led.map((e) => [e.kind, e.amount, e.period]).sort(), [['monthly_fee', 2000, '2026-10'], ['overage', 300, '2026-10']].sort());
  } finally {
    await t.close();
  }
});

test('package: purchase is recorded, each approval deducts a credit, after exhaustion the overage rate applies; top-ups add credit', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'package', package_size: 2, package_price: 800, overage_rate: 350 } });
    assert.equal(L.package_remaining, 2);
    let led = await ledgerOf(admin, L.id);
    assert.deepEqual(led.map((e) => [e.kind, e.amount]), [['package_purchase', 800]]);
    const cL = await t.login(L.username);
    const c1 = await approvedConsult(admin, cL, L.id);
    assert.equal(ok(await admin.get(`/api/admin/lawyers/${L.id}`)).lawyer.package_remaining, 1);
    const c2 = await approvedConsult(admin, cL, L.id);
    assert.equal(ok(await admin.get(`/api/admin/lawyers/${L.id}`)).lawyer.package_remaining, 0);
    assert.ok((await notificationsOf(admin)).some((n) => n.type === 'package.exhausted'), 'staff are told the package ran out');
    const c3 = await approvedConsult(admin, cL, L.id);
    assert.deepEqual(
      [(await billingOf(admin, c1.caseId, L.id)).treatment, (await billingOf(admin, c2.caseId, L.id)).treatment, (await billingOf(admin, c3.caseId, L.id)).treatment],
      ['package_credit', 'package_credit', 'package_overage'],
    );
    led = await ledgerOf(admin, L.id);
    const overage = led.filter((e) => e.kind === 'overage');
    assert.equal(overage.length, 1);
    assert.equal(overage[0].amount, 350);
    assert.equal(overage[0].case_id, c3.caseId);
    const cost1 = ok(await admin.get(`/api/admin/accounting/case-cost/${c1.caseId}`));
    assert.equal(cost1.allocated, 400, 'package credit carries price / size as its real cost');

    const topped = ok(await admin.post(`/api/admin/lawyers/${L.id}/package`, { size: 5, price: 1500 }));
    assert.equal(topped.package_remaining, 5);
    const c4 = await approvedConsult(admin, cL, L.id);
    assert.equal((await billingOf(admin, c4.caseId, L.id)).treatment, 'package_credit');
    assert.equal(ok(await admin.get(`/api/admin/lawyers/${L.id}`)).lawyer.package_remaining, 4);
    led = await ledgerOf(admin, L.id);
    assert.equal(led.filter((e) => e.kind === 'package_purchase').length, 2);
    const st = ok(await cL.get('/api/lawyer/statement'));
    assert.equal(st.package_remaining, 4);
    // a non-package lawyer cannot receive a package
    const P = await createLawyer(admin, { agreement: { type: 'per_case', rate: 100 } });
    assert.equal((await admin.post(`/api/admin/lawyers/${P.id}/package`, { size: 1, price: 10 })).status, 400);
  } finally {
    await t.close();
  }
});

test('100% pro bono: counted as a contribution with its notional value — never a financial obligation', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'pro_bono', notional_value: 400 } });
    const cL = await t.login(L.username);
    const c1 = await approvedConsult(admin, cL, L.id);
    await approvedConsult(admin, cL, L.id);
    ok(await admin.post(`/api/admin/cases/${c1.caseId}/close`, { outcome: 'answered' }));
    assert.deepEqual(await ledgerOf(admin, L.id), [], 'no ledger entries at all');
    assert.deepEqual(await billingOf(admin, c1.caseId, L.id), { treatment: 'pro_bono', amount: 0, notional: 400, period: '2026-11', trigger: 'on_approval' });
    ok(await admin.post('/api/admin/accounting/close-month', { period: '2026-11' }));
    assert.deepEqual(await ledgerOf(admin, L.id), [], 'month close issues nothing for pro bono lawyers');
    const st = ok(await cL.get('/api/lawyer/statement'));
    assert.equal(st.unpaid_balance, 0);
    assert.equal(st.pro_bono_count, 2);
    const { row, summary } = await summaryRow(admin, L.id);
    assert.equal(row.period_amount, 0);
    assert.equal(row.contribution_value, 800);
    assert.ok(summary.totals.pro_bono_events >= 2);
    const cost = ok(await admin.get(`/api/admin/accounting/case-cost/${c1.caseId}`));
    assert.equal(cost.total, 0);
    assert.equal(cost.pro_bono_value, 400);
    const lw = ok(await admin.get(`/api/admin/lawyers/${L.id}`)).lawyer;
    assert.equal(lw.metrics.pro_bono_in_period, 2);
    assert.equal(lw.metrics.unpaid_balance, 0);
  } finally {
    await t.close();
  }
});

test('CSR law-firm program: consumption tracked against the firm commitment, no ledger', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'csr', csr_firm: 'مكتب النيل للمحاماة', csr_cases_commitment: 10, csr_period: 'year', notional_value: 300 } });
    const cL = await t.login(L.username);
    const c = await approvedConsult(admin, cL, L.id);
    assert.equal((await billingOf(admin, c.caseId, L.id)).treatment, 'csr');
    assert.deepEqual(await ledgerOf(admin, L.id), []);
    const { row } = await summaryRow(admin, L.id);
    assert.equal(row.csr.cases_used, 1);
    assert.equal(row.csr.cases_commitment, 10);
    assert.ok(row.agreement_text.includes('مكتب النيل للمحاماة'));
    assert.equal(ok(await admin.get(`/api/admin/accounting/case-cost/${c.caseId}`)).pro_bono_value, 300);
  } finally {
    await t.close();
  }
});

test('payout marks exactly the selected entries paid; paid entries cannot be paid again or voided', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 500 } });
    const O = await createLawyer(admin, { agreement: { type: 'per_case', rate: 200 } });
    const cL = await t.login(L.username);
    const cO = await t.login(O.username);
    for (let i = 0; i < 3; i++) await approvedConsult(admin, cL, L.id);
    await approvedConsult(admin, cO, O.id);
    const entries = await ledgerOf(admin, L.id);
    const [e1, e2, e3] = entries.map((e) => e.id).sort((a, b) => a - b);
    const otherEntry = (await ledgerOf(admin, O.id))[0];
    assert.equal((await admin.post('/api/admin/accounting/payouts', { lawyer_id: L.id, entry_ids: [e1, otherEntry.id] })).status, 400, "another lawyer's entry");
    assert.equal((await admin.post('/api/admin/accounting/payouts', { lawyer_id: L.id, entry_ids: [] })).status, 400);
    const p = ok(await admin.post('/api/admin/accounting/payouts', { lawyer_id: L.id, entry_ids: [e1, e2], method: 'تحويل بنكي', reference: 'TRX-1' }));
    assert.equal(p.amount, 1000);
    const after = Object.fromEntries((await ledgerOf(admin, L.id)).map((e) => [e.id, e]));
    assert.equal(after[e1].status, 'paid');
    assert.equal(after[e2].status, 'paid');
    assert.equal(after[e1].payout_id, p.id);
    assert.equal(after[e3].status, 'accrued');
    assert.equal((await admin.post('/api/admin/accounting/payouts', { lawyer_id: L.id, entry_ids: [e2, e3] })).status, 409, 'already paid');
    assert.equal(ok(await admin.get(`/api/admin/accounting/ledger?lawyer_id=${L.id}&status=accrued`)).length, 1, 'a failed payout changes nothing');
    assert.equal((await admin.post(`/api/admin/accounting/entries/${e1}/void`, { note: 'خطأ' })).status, 409);
    const v = ok(await admin.post(`/api/admin/accounting/entries/${e3}/void`, { note: 'قيد مكرر' }));
    assert.equal(v.status, 'void');
    const st = ok(await cL.get('/api/lawyer/statement'));
    assert.equal(st.unpaid_balance, 0);
    assert.equal(st.paid_total, 1000);
    assert.equal(st.payouts.length, 1);
    assert.ok((await notificationsOf(cL)).some((n) => n.type === 'payout'));
    const { row } = await summaryRow(admin, L.id);
    assert.equal(row.unpaid_balance, 0);
    assert.equal(row.period_amount, 1000, 'voided entries do not count');
    // manual adjustment (admin only) shows on the statement
    const adj = ok(await admin.post('/api/admin/accounting/adjustments', { lawyer_id: L.id, amount: 150, description: 'بدل انتقال' }));
    assert.equal(adj.kind, 'adjustment');
    assert.equal(ok(await cL.get('/api/lawyer/statement')).unpaid_balance, 150);
    // each lawyer sees only their own statement
    const so = ok(await cO.get('/api/lawyer/statement'));
    assert.ok(so.entries.every((e) => e.lawyer_id === O.id));
  } finally {
    await t.close();
  }
});

test('money is admin-only: case managers and lawyers get 403 on accounting, lawyer creation, users and settings', async () => {
  const { t, admin } = await boot();
  try {
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'cm1', name: 'مديرة حالات', password: 'Manager@2026' }), 201);
    const cm = await t.login('cm1', 'Manager@2026');
    const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 500 } });
    const cL = await t.login(L.username);
    const c = await approvedConsult(admin, cL, L.id);
    const entry = (await ledgerOf(admin, L.id))[0];
    const calls = [
      ['GET', '/api/admin/accounting/summary'],
      ['GET', '/api/admin/accounting/ledger'],
      ['POST', '/api/admin/accounting/close-month', { period: '2026-11' }],
      ['POST', '/api/admin/accounting/payouts', { lawyer_id: L.id, entry_ids: [entry.id] }],
      ['POST', '/api/admin/accounting/adjustments', { lawyer_id: L.id, amount: 100, description: 'x' }],
      ['POST', `/api/admin/accounting/entries/${entry.id}/void`, {}],
      ['POST', '/api/admin/lawyers', { username: 'sneaky', password: LAWYER_PASSWORD, name: 'x', specialties: ['GEN'], agreement: { type: 'per_case', rate: 1 } }],
      ['PATCH', `/api/admin/lawyers/${L.id}`, { agreement: { type: 'per_case', rate: 99999 } }],
      ['POST', `/api/admin/lawyers/${L.id}/password`, { password: 'NewPass@2026' }],
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users', { role: 'admin', username: 'evil', name: 'x', password: 'Evil@20266' }],
      ['GET', '/api/admin/settings'],
      ['PATCH', '/api/admin/settings', { org_name: 'اختراق' }],
      ['GET', '/api/admin/knowledge/export'],
    ];
    for (const [m, url, body] of calls) {
      assert.equal((await cm.request(m, url, body)).status, 403, `case manager ${m} ${url}`);
      assert.equal((await cL.request(m, url, body)).status, 403, `lawyer ${m} ${url}`);
    }
    // nothing changed
    assert.equal((await ledgerOf(admin, L.id))[0].status, 'accrued');
    assert.equal(ok(await admin.get(`/api/admin/lawyers/${L.id}`)).lawyer.agreement.rate, 500);
    // staff (including case managers) can see the real cost of a case; lawyers cannot
    assert.equal(ok(await cm.get(`/api/admin/accounting/case-cost/${c.caseId}`)).direct, 500);
    assert.equal(ok(await admin.get(`/api/admin/accounting/case-cost/${c.caseId}`)).direct, 500);
    assert.equal((await cL.get(`/api/admin/accounting/case-cost/${c.caseId}`)).status, 403);
  } finally {
    await t.close();
  }
});
