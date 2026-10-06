// Lane B — Requirement 11: lawyer network capacity & performance must reflect what really happened:
// open files, overdue, average response time, completed this month, pro bono count (and utilization vs capacity).
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, createLawyer, newCase, assign, plusDays, plusHours } from './lane-b-kit.test.js';

const T0 = '2026-11-02T08:00:00.000Z';
let t;
let admin;
let P; // busy lawyer
let Q; // idle lawyer
let cP;
const asg = {};
const cases = {};

before(async () => {
  freezeClock(T0);
  t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 365 } });
  admin = await t.login('admin');
  P = await createLawyer(admin, { name: 'بهاء المحامي', specialties: ['CIV'], capacity: 4, agreement: { type: 'per_case', rate: 500 } });
  Q = await createLawyer(admin, { name: 'قدري الخامل', specialties: ['CIV'], capacity: 5 });
  cP = await t.login(P.username);
  for (const k of ['a1', 'a2', 'a3', 'a4', 'a5']) cases[k] = await newCase(admin, { title: `ملف ${k}` });
  asg.a1 = await assign(admin, cases.a1.id, { lawyer_id: P.id, role: 'lead', due_at: plusDays(T0, 1) });
  asg.a2 = await assign(admin, cases.a2.id, { lawyer_id: P.id, role: 'lead', due_at: plusDays(T0, 3), fee_mode: 'pro_bono' });
  asg.a3 = await assign(admin, cases.a3.id, { lawyer_id: P.id, role: 'lead', due_at: plusDays(T0, 10) });
  asg.a4 = await assign(admin, cases.a4.id, { lawyer_id: P.id, role: 'lead', due_at: plusDays(T0, 2) });
  asg.a5 = await assign(admin, cases.a5.id, { lawyer_id: P.id, role: 'lead', due_at: plusDays(T0, 2) });

  const body = 'رأي قانوني مفصل يغطي المسألة المطروحة بالكامل مع التوصيات العملية';
  // a1: submitted after 4h, returned once, resubmitted and approved (quality 4)
  freezeClock(plusHours(T0, 4));
  const o1 = ok(await cP.post(`/api/lawyer/assignments/${asg.a1.id}/submit`, { body })).id;
  freezeClock(plusHours(T0, 5));
  ok(await admin.post(`/api/admin/opinions/${o1}/return`, { note: 'أضف المراجع' }));
  freezeClock(plusHours(T0, 6));
  const o1b = ok(await cP.post(`/api/lawyer/assignments/${asg.a1.id}/submit`, { body: `${body} مع المراجع` })).id;
  ok(await admin.post(`/api/admin/opinions/${o1b}/approve`, { quality_score: 4 }));
  // a2 (pro bono): submitted after 20h, approved (quality 5)
  freezeClock(plusHours(T0, 20));
  const o2 = ok(await cP.post(`/api/lawyer/assignments/${asg.a2.id}/submit`, { body })).id;
  ok(await admin.post(`/api/admin/opinions/${o2}/approve`, { quality_score: 5 }));
  // a4: opened, never submitted (will be overdue)
  ok(await cP.post(`/api/lawyer/assignments/${asg.a4.id}/open`));
  // a5: submitted late after 72h, still awaiting review
  freezeClock(plusHours(T0, 72));
  ok(await cP.post(`/api/lawyer/assignments/${asg.a5.id}/submit`, { body }));
  freezeClock(plusHours(T0, 84)); // T0 + 3.5 days
});

after(async () => {
  resetClock();
  await t?.close();
});

async function metricsOf(lawyerId, query = '') {
  const list = ok(await admin.get(`/api/admin/lawyers${query}`));
  const item = list.items.find((x) => x.id === lawyerId);
  return { item, list };
}

test('open files, overdue, utilization and response time reflect the real assignments', async () => {
  const { item } = await metricsOf(P.id);
  const m = item.metrics;
  assert.equal(m.open_assignments, 3, 'a3 (assigned) + a4 (in progress) + a5 (submitted, awaiting review)');
  assert.equal(m.overdue, 1, 'only a4 is past due and not yet submitted');
  assert.equal(m.late_submissions, 1, 'a5 was submitted after its due date');
  assert.equal(m.avg_response_hours, 32, 'average of first submissions: (4 + 20 + 72) / 3');
  assert.equal(item.capacity, 4);
  assert.equal(item.utilization, 0.75);
  const detail = ok(await admin.get(`/api/admin/lawyers/${P.id}`));
  assert.deepEqual(detail.lawyer.metrics, m, 'list and detail agree');
  assert.equal(detail.assignments.length, 5);
});

test('completed this month, pro bono count, return rate and quality reflect reviewed work', async () => {
  const { item } = await metricsOf(P.id);
  const m = item.metrics;
  assert.equal(m.completed_in_period, 2);
  assert.equal(m.completed_total, 2);
  assert.equal(m.pro_bono_in_period, 1);
  assert.equal(m.pro_bono_total, 1);
  assert.equal(m.returned_rate, 0.333, 'one returned version out of three reviewed');
  assert.equal(m.avg_quality, 4.5);
  assert.equal(m.earned_in_period, 500, 'only the paid (non pro bono) approval earns money');
  assert.equal(m.unpaid_balance, 500);
});

test('an idle lawyer shows zeros and no response time', async () => {
  const { item } = await metricsOf(Q.id);
  assert.deepEqual(
    { open: item.metrics.open_assignments, overdue: item.metrics.overdue, done: item.metrics.completed_in_period, pb: item.metrics.pro_bono_in_period, resp: item.metrics.avg_response_hours, util: item.utilization },
    { open: 0, overdue: 0, done: 0, pb: 0, resp: null, util: 0 },
  );
});

test('network totals add up and the lawyer dashboard shows the same personal metrics', async () => {
  const { list } = await metricsOf(P.id);
  assert.equal(list.totals.lawyers, 2);
  assert.equal(list.totals.capacity, 9);
  assert.equal(list.totals.open_assignments, 3);
  assert.equal(list.totals.overdue, 1);
  assert.equal(list.totals.completed_in_period, 2);
  assert.equal(list.totals.pro_bono_in_period, 1);
  const dash = ok(await cP.get('/api/lawyer/dashboard'));
  assert.equal(dash.metrics.open_assignments, 3);
  assert.equal(dash.metrics.overdue, 1);
  assert.equal(dash.counts.overdue, 1);
  assert.equal(dash.counts.awaiting_review, 1);
  assert.equal(dash.metrics.completed_in_period, 2);
});

test('closing a case removes it from open files; a new month resets "completed this month" but keeps history', async () => {
  ok(await admin.post(`/api/admin/cases/${cases.a3.id}/close`, { outcome: 'client_withdrew' }));
  let { item } = await metricsOf(P.id);
  assert.equal(item.metrics.open_assignments, 2);
  assert.equal(item.utilization, 0.5);
  freezeClock('2026-12-05T10:00:00.000Z');
  ({ item } = await metricsOf(P.id));
  assert.equal(item.metrics.completed_in_period, 0, 'nothing completed in December');
  assert.equal(item.metrics.pro_bono_in_period, 0);
  assert.equal(item.metrics.completed_total, 2);
  const nov = await metricsOf(P.id, '?period=2026-11');
  assert.equal(nov.item.metrics.completed_in_period, 2);
  assert.equal(nov.item.metrics.pro_bono_in_period, 1);
});

test('suggestions rank by specialty and current load, flagging lawyers at capacity', async () => {
  const fresh = await newCase(admin, { legal_area: 'CIV', title: 'ملف جديد للاقتراح' });
  // load P up to capacity
  for (const title of ['ملف إضافي', 'ملف إضافي آخر']) {
    const extra = await newCase(admin, { title });
    const r = ok(await admin.post(`/api/admin/cases/${extra.id}/assignments`, { lawyer_id: P.id, role: 'lead', due_at: plusDays('2026-12-05T10:00:00.000Z', 5) }), 201);
    assert.deepEqual(r.warnings, [], 'below capacity → no warning');
  }
  assert.equal((await metricsOf(P.id)).item.metrics.open_assignments, 4);
  const extra2 = await newCase(admin, { title: 'ملف إضافي 2' });
  const w = ok(await admin.post(`/api/admin/cases/${extra2.id}/assignments`, { lawyer_id: P.id, role: 'lead' }), 201);
  assert.equal(w.warnings.length, 1, 'staff are warned when assigning beyond capacity');
  const s = ok(await admin.get(`/api/admin/cases/${fresh.id}/suggest-lawyers?area=CIV`));
  const byId = Object.fromEntries(s.items.map((x) => [x.id, x]));
  assert.equal(byId[P.id].over_capacity, true);
  assert.equal(byId[Q.id].over_capacity, false);
  assert.equal(s.items[0].id, Q.id, 'the idle specialist is suggested first');
});
