// v10 b2b-server — مواعيد الرد والتسليم لخدمة الشركات (SRV-5، L-28، L-53، L-54، CO-10، CO-25): وحدة company-sla.js النقية
// المشتركة بين الخادم والبوابة، وتطابق «الوعد قبل الإرسال» مع ما يحسبه الخادم.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarFrom,
  urgentCalendar,
  calendars,
  calendarJson,
  calendarsFromJson,
  isOpen,
  addBusinessMinutes,
  businessMinutesBetween,
  dueAt,
  slaState,
  pauseRemaining,
  resumeDue,
  remainingMinutes,
  durationText,
  hoursText,
  businessHoursText,
  urgentHoursText,
  usageCycle,
  cycleBounds,
  nextPeriodStart,
  promisePreview,
  validHours,
  cairoLocalToIso,
  cairoParts,
  deliveryHours,
} from '../public/assets/js/lib/company-sla.js';
import { DEFAULT_SETTINGS } from '../src/constants.js';
import { startTestApp, freezeClock } from './helpers.js';
import { seedB2bDemo, COMPANY_DEMO_PASSWORD } from '../src/seed-v10-b2b.js';

async function companyLogin(base, email, password = COMPANY_DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const m = /bm_csid=([^;]+)/.exec(res.headers.get('set-cookie') || '');
  if (res.status !== 200 || !m) throw new Error(`company login failed for ${email}: ${res.status}`);
  return `bm_csid=${m[1]}`;
}

const local = (y, m, d, h = 0, mi = 0) => cairoLocalToIso(y, m, d, h, mi);
/** «2026-10-10 11:00» بتوقيت القاهرة */
const show = (iso) => {
  const p = cairoParts(iso);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};
// إعدادات المنصة الافتراضية: مواعيد العمل العامة السبت–الخميس 10–4، ونافذة العاجل يوميًا 8–10 م
const SETTINGS = { office_hours_schedule: DEFAULT_SETTINGS.office_hours_schedule, b2b_business_hours: DEFAULT_SETTINGS.b2b_business_hours, b2b_urgent_hours: DEFAULT_SETTINGS.b2b_urgent_hours, b2b_holidays: [] };
const CALS = calendars(SETTINGS);
const BIZ = CALS.business;
// الخميس 8 أكتوبر 2026 (مثال UX)، والجمعة 9، والسبت 10، والأحد 11

describe('v10 SLA — calendars', () => {
  test('b2b_business_hours = null inherits the public office hours (Sat–Thu 10:00–16:00); the text matches', () => {
    assert.equal(DEFAULT_SETTINGS.b2b_business_hours, null);
    assert.deepEqual([...BIZ.days], [0, 1, 2, 3, 4, 6]);
    assert.equal(BIZ.from, '10:00');
    assert.equal(BIZ.to, '16:00');
    assert.equal(businessHoursText(BIZ), 'السبت – الخميس، 10 ص – 4 م بتوقيت القاهرة');
    assert.equal(urgentHoursText(CALS.urgent), 'بين 8 ص و10 م يوميًا');
    assert.equal(isOpen(local(2026, 10, 9, 11), BIZ), false, 'Friday is closed');
    assert.equal(isOpen(local(2026, 10, 10, 10), BIZ), true, 'Saturday 10:00 opens');
    assert.equal(isOpen(local(2026, 10, 10, 16), BIZ), false, '16:00 is closing time');
  });

  test('a company-only override (Sun–Thu 09:00–17:00) replaces the inherited week', () => {
    const cal = calendarFrom({ ...SETTINGS, b2b_business_hours: { days: [0, 1, 2, 3, 4], from: '09:00', to: '17:00' } });
    assert.equal(businessHoursText(cal), 'الأحد – الخميس، 9 ص – 5 م بتوقيت القاهرة');
    assert.equal(isOpen(local(2026, 10, 10, 11), cal), false, 'Saturday closed under the override');
    // الخميس 16:00 + ساعتان ← الأحد 10:00 (عطلة الجمعة والسبت)
    assert.equal(show(dueAt(local(2026, 10, 8, 16), 2, 'business', { business: cal, urgent: CALS.urgent })), '2026-10-11 10:00');
  });

  test('invalid hour shapes fall back safely; the urgent window can be a true 24-hour clock', () => {
    assert.equal(validHours({ days: [], from: '10:00', to: '16:00' }), false);
    assert.equal(validHours({ days: [1], from: '16:00', to: '10:00' }), false);
    assert.equal(validHours({ days: [8], from: '10:00', to: '16:00' }), false);
    assert.deepEqual([...calendarFrom({ b2b_business_hours: { days: 'x' }, office_hours_schedule: null }).days], [0, 1, 2, 3, 4, 6]);
    const all = urgentCalendar({ b2b_urgent_hours: { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '24:00' } });
    assert.equal(urgentHoursText(all), 'على مدار الساعة يوميًا');
    assert.equal(show(dueAt(local(2026, 10, 8, 23), 2, 'calendar', { business: BIZ, urgent: all })), '2026-10-09 01:00');
  });

  test('calendarJson round-trips through the /plan payload (the portal rebuilds the same calendars)', () => {
    const cals = calendars({ ...SETTINGS, b2b_holidays: ['2026-10-10'] });
    const back = calendarsFromJson(JSON.parse(JSON.stringify(calendarJson(cals))));
    const start = local(2026, 10, 8, 15, 20);
    assert.equal(dueAt(start, 6, 'business', back), dueAt(start, 6, 'business', cals));
    assert.equal(dueAt(start, 2, 'calendar', back), dueAt(start, 2, 'calendar', cals));
  });
});

describe('v10 SLA — business-time arithmetic', () => {
  test('Friday-only weekend: Thursday 15:00 + 2 business hours → Saturday 11:00', () => {
    assert.equal(show(addBusinessMinutes(local(2026, 10, 8, 15), 120, BIZ)), '2026-10-10 11:00');
  });

  test('holidays are skipped (Saturday a holiday → Sunday)', () => {
    const cal = calendarFrom({ ...SETTINGS, b2b_holidays: ['2026-10-10'] });
    assert.equal(show(addBusinessMinutes(local(2026, 10, 8, 15), 120, cal)), '2026-10-11 11:00');
  });

  test('a start after hours or before opening begins at the next opening', () => {
    assert.equal(show(addBusinessMinutes(local(2026, 10, 8, 17), 60, BIZ)), '2026-10-10 11:00', 'Thursday 17:00 → Saturday');
    assert.equal(show(addBusinessMinutes(local(2026, 10, 10, 8), 60, BIZ)), '2026-10-10 11:00', 'Saturday 08:00 → 11:00');
  });

  test('multi-day windows: 18 business hours from Sunday 10:00 end Tuesday 16:00; the inverse measures the same minutes', () => {
    const start = local(2026, 10, 11, 10);
    const due = addBusinessMinutes(start, 18 * 60, BIZ);
    assert.equal(show(due), '2026-10-13 16:00');
    assert.equal(businessMinutesBetween(start, due, BIZ), 18 * 60);
    // عبر عطلة الجمعة
    assert.equal(businessMinutesBetween(local(2026, 10, 8, 15), local(2026, 10, 10, 11), BIZ), 120);
    assert.equal(businessMinutesBetween(local(2026, 10, 10, 11), local(2026, 10, 8, 15), BIZ), 0, 'never negative');
  });

  test('Cairo DST start (last Friday of April) and end (last Thursday of October) keep local business hours', () => {
    // 2026-04-24 الجمعة: الساعة تتقدم؛ الخميس 23 أبريل 15:00 + ساعتان ← السبت 25 أبريل 11:00 بالتوقيت الصيفي (+3)
    const spring = addBusinessMinutes(local(2026, 4, 23, 15), 120, BIZ);
    assert.equal(show(spring), '2026-04-25 11:00');
    assert.equal(spring, '2026-04-25T08:00:00.000Z');
    // نهاية التوقيت الصيفي ليلة الخميس 29 أكتوبر: السبت 31 أكتوبر 11:00 بالتوقيت الشتوي (+2)
    const autumn = addBusinessMinutes(local(2026, 10, 29, 15), 120, BIZ);
    assert.equal(show(autumn), '2026-10-31 11:00');
    assert.equal(autumn, '2026-10-31T09:00:00.000Z');
  });

  test('urgent clock runs only inside the urgent window: Thursday 23:00 → Friday 10:00; 21:00 → Friday 09:00', () => {
    assert.equal(show(dueAt(local(2026, 10, 8, 23), 2, 'calendar', CALS)), '2026-10-09 10:00');
    assert.equal(show(dueAt(local(2026, 10, 8, 21), 2, 'calendar', CALS)), '2026-10-09 09:00');
    assert.equal(show(dueAt(local(2026, 10, 9, 12), 2, 'calendar', CALS)), '2026-10-09 14:00', 'Friday counts for urgent work');
  });
});

describe('v10 SLA — states, pauses and the confirm phase', () => {
  const start = local(2026, 10, 11, 10); // الأحد
  const due = dueAt(start, 18, 'business', CALS); // الثلاثاء 16:00

  test('pause then resume shifts the due date by the paused business minutes', () => {
    const pausedAt = local(2026, 10, 12, 12); // الاثنين 12:00 — تبقى 10 ساعات عمل
    const left = pauseRemaining(pausedAt, due, 'business', CALS);
    assert.equal(left, 600);
    const resumed = local(2026, 10, 14, 11); // الأربعاء 11:00
    assert.equal(show(resumeDue(resumed, left, 'business', CALS)), '2026-10-15 15:00');
    assert.equal(slaState({ startIso: start, dueIso: due, pausedAt, clock: 'business', cals: CALS, now: resumed }), 'paused');
  });

  test('an already-late request stays late after a pause (remaining stored as 0)', () => {
    const late = local(2026, 10, 14, 11);
    assert.ok(remainingMinutes(late, due, 'business', CALS) < 0);
    assert.equal(pauseRemaining(late, due, 'business', CALS), 0);
    const resumedDue = resumeDue(local(2026, 10, 15, 11), 0, 'business', CALS);
    assert.equal(slaState({ startIso: start, dueIso: resumedDue, clock: 'business', cals: CALS, now: local(2026, 10, 15, 11, 1) }), 'late');
  });

  test('at-risk threshold = max(25% of the window, 120 business minutes)', () => {
    // نافذة 18 ساعة = 1080 دقيقة ← «يقترب» عند ≤ 270 دقيقة
    const at = (iso) => slaState({ startIso: start, dueIso: due, clock: 'business', cals: CALS, now: iso });
    assert.equal(at(local(2026, 10, 13, 11, 29)), 'on_track', '271 minutes left');
    assert.equal(at(local(2026, 10, 13, 11, 30)), 'at_risk', '270 minutes left');
    assert.equal(at(local(2026, 10, 13, 16, 1)), 'late');
    // نافذة ساعتين: 120 دقيقة كحد أدنى ← «يقترب» من البداية
    const s2 = local(2026, 10, 11, 10);
    assert.equal(slaState({ startIso: s2, dueIso: dueAt(s2, 2, 'business', CALS), clock: 'business', cals: CALS, now: s2 }), 'at_risk');
  });

  test('met / missed on delivery', () => {
    assert.equal(slaState({ startIso: start, dueIso: due, doneIso: local(2026, 10, 13, 15), cals: CALS }), 'met');
    assert.equal(slaState({ startIso: start, dueIso: due, doneIso: local(2026, 10, 13, 16, 30), cals: CALS }), 'missed');
  });

  test('the confirm phase after a pre-acceptance answer uses the first-response hours of the priority from the answer time', () => {
    const terms = { sla: { normal: { first_response_hours: 6, delivery_hours: 18, clock: 'business' } } };
    const answeredAt = local(2026, 10, 8, 15, 59); // الخميس 15:59
    const confirm = dueAt(answeredAt, terms.sla.normal.first_response_hours, terms.sla.normal.clock, CALS);
    assert.equal(show(confirm), '2026-10-10 15:59');
    assert.equal(promisePreview(answeredAt, terms, CALS).normal.first_response_by, confirm);
  });

  test('typical delivery = delivery hours × the size factor of the type (L-54)', () => {
    const terms = { sla: { normal: { first_response_hours: 6, delivery_hours: 18, clock: 'business' } }, size_factor: { S: 0.5, M: 1, L: 2 } };
    assert.equal(deliveryHours(terms, 'normal', 'S'), 9);
    assert.equal(deliveryHours(terms, 'normal', 'L'), 36);
    assert.equal(durationText(deliveryHours(terms, 'normal', 'S'), BIZ), 'يومي عمل');
  });
});

describe('v10 SLA — copy and usage cycles', () => {
  test('durationText (CO-25): hours under a working day, one day, then days — with correct number–noun agreement', () => {
    assert.equal(durationText(1, BIZ), 'ساعة عمل');
    assert.equal(durationText(2, BIZ), 'ساعتي عمل');
    assert.equal(durationText(3, BIZ), '3 ساعات عمل');
    assert.equal(durationText(6, BIZ), 'يوم عمل');
    assert.equal(durationText(9, BIZ), 'يومي عمل');
    assert.equal(durationText(18, BIZ), '3 أيام عمل');
    assert.equal(durationText(72, BIZ), '12 يوم عمل');
    const eight = calendarFrom({ b2b_business_hours: { days: [0, 1, 2, 3, 4], from: '09:00', to: '17:00' } });
    assert.equal(durationText(8, eight), 'يوم عمل');
    assert.equal(hoursText(2), 'ساعتين');
    assert.equal(hoursText(8), '8 ساعات');
    assert.equal(hoursText(11), '11 ساعة');
  });

  test('usage cycles are monthly from the subscription start day, clamped on short months (the 31st)', () => {
    assert.deepEqual(usageCycle('2026-01-31', '2026-02-28'), { start: '2026-02-28', end: '2026-03-31', index: 1 });
    assert.deepEqual(usageCycle('2026-01-31', '2026-03-30'), { start: '2026-02-28', end: '2026-03-31', index: 1 });
    assert.deepEqual(usageCycle('2026-01-31', '2026-03-31'), { start: '2026-03-31', end: '2026-04-30', index: 2 });
    assert.deepEqual(usageCycle('2026-08-05', '2026-10-04'), { start: '2026-09-05', end: '2026-10-05', index: 1 });
    assert.deepEqual(usageCycle('2026-08-05', '2026-10-05'), { start: '2026-10-05', end: '2026-11-05', index: 2 });
    const b = cycleBounds({ start: '2026-10-05', end: '2026-11-05' });
    assert.equal(show(b.start), '2026-10-05 00:00');
    assert.equal(show(b.end), '2026-11-05 00:00');
  });

  test('next period start is computed from starts_on and the billing period (CO-20)', () => {
    assert.equal(nextPeriodStart('2026-08-05', 'monthly', '2026-10-08'), '2026-11-05');
    assert.equal(nextPeriodStart('2026-01-31', 'quarterly', '2026-10-08'), '2026-10-31');
    assert.equal(nextPeriodStart('2026-01-31', 'annual', '2026-10-08'), '2027-01-31');
  });
});

describe('v10 SLA — preview parity with the server (CO-10, L-54)', () => {
  test('/plan.promise_preview equals the server computation at T — Thursday 15:59 and 16:01 and a holiday eve — and the portal recomputes the same', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await seedB2bDemo(t.app);
      const cookie = await companyLogin(t.base, 'mariam@nilefoods.example');
      const plan = async () => (await (await fetch(`${t.base}/api/company/plan`, { headers: { cookie } })).json());
      const terms = t.app.companyBilling.activeSubscription(t.app.db.get("SELECT id FROM companies WHERE prefix='NFD'").id).terms;
      for (const [label, iso, holidays, expectNormal] of [
        ['Thursday 15:59', local(2026, 10, 8, 15, 59), [], '2026-10-10 15:59'],
        ['Thursday 16:01', local(2026, 10, 8, 16, 1), [], '2026-10-10 16:00'],
        ['holiday eve (Saturday a holiday)', local(2026, 10, 8, 15, 59), ['2026-10-10'], '2026-10-11 15:59'],
      ]) {
        t.app.settings.set('b2b_holidays', holidays);
        freezeClock(iso);
        const p = await plan();
        assert.equal(p.server_now, iso, label);
        const serverCals = calendars(t.app.settings.all());
        for (const pr of ['normal', 'high', 'urgent']) {
          const s = terms.sla[pr];
          // ما سيسجله الخادم عند الإرسال في اللحظة نفسها (first_response_due_at = dueAt(created_at, …))
          assert.equal(p.promise_preview[pr].first_response_by, dueAt(iso, s.first_response_hours, s.clock, serverCals), `${label} ${pr}`);
          // وما تحسبه البوابة من مدخلات /plan نفسها
          assert.equal(promisePreview(p.server_now, { sla: Object.fromEntries(p.sla_table.map((x) => [x.priority, x])) }, calendarsFromJson(p.calendar))[pr].first_response_by, p.promise_preview[pr].first_response_by, `${label} ${pr} (portal)`);
        }
        assert.equal(show(p.promise_preview.normal.first_response_by), expectNormal, label);
      }
    } finally {
      await t.close();
    }
  });
});

describe('v10 SLA — quota per usage cycle (L-28, CS-19)', () => {
  test('requests count on the cycle they were accepted in; past the allowance they are overage; a firm decline releases the slot (free + audit)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await seedB2bDemo(t.app);
      const db = t.app.db;
      const nfd = db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
      const billing = t.app.companyBilling;
      const sub = billing.activeSubscription(nfd.id);
      const cycle = billing.cycleOf(sub);
      const included = sub.terms.included_requests;
      assert.ok(included > 0);
      const by = db.get("SELECT id FROM company_users WHERE email = 'mariam@nilefoods.example'").id;
      const add = (n, kind, period) => {
        const at = new Date().toISOString();
        return db.insert('company_requests', { company_id: nfd.id, number: n, code: `NFD-${String(n).padStart(4, '0')}`, type: 'other', title: `طلب ${n}`, description: 'وصف الطلب للاختبار', submitted_by: by, status: 'in_progress', quota_kind: kind, quota_period: period, created_at: at, updated_at: at });
      };
      // طلب من الدورة السابقة لا يُحتسب على الدورة الحالية
      add(1, 'included', '2000-01-05');
      for (let i = 0; i < included - 1; i++) add(i + 2, 'included', cycle.start);
      let c = billing.classify(nfd);
      assert.deepEqual(c, { quota_kind: 'included', quota_period: cycle.start, remaining: 1 });
      const last = add(included + 1, c.quota_kind, c.quota_period);
      assert.equal(billing.classify(nfd).quota_kind, 'overage');
      assert.equal(billing.quota(nfd).used, included);
      assert.equal(billing.classify(nfd, { free: true }).quota_kind, 'free');
      assert.equal(billing.classify(nfd, { outOfScope: true }).quota_kind, 'out_of_scope');
      // اعتذار المكتب بعد القبول: يعود الرصيد
      assert.equal(billing.releaseQuota(last, { actor: { kind: 'system' }, reason: 'firm_declined' }), true);
      assert.equal(db.get('SELECT quota_kind FROM company_requests WHERE id = ?', last).quota_kind, 'free');
      assert.equal(billing.quota(nfd).used, included - 1);
      assert.equal(billing.classify(nfd).quota_kind, 'included');
      const ev = db.get("SELECT * FROM security_events WHERE type = 'company.quota_released'");
      assert.equal(ev.company_id, nfd.id);
      assert.equal(billing.releaseQuota(last, { actor: { kind: 'system' } }), false, 'idempotent');
      // الدورة التالية تبدأ من الصفر
      const next = billing.classify(nfd, { at: new Date(Date.parse(cycle.end + 'T12:00:00Z') + 86400000) });
      assert.equal(next.quota_kind, 'included');
      assert.equal(next.remaining, included);
    } finally {
      await t.close();
    }
  });
});

describe('v10 SLA — preview parity with a real submit (review, usability task 4)', () => {
  test('for submits at Thursday 15:59 and 16:01 and on a holiday eve, /plan.promise_preview equals the stored first_response_due_at to the minute (normal, high, urgent)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await seedB2bDemo(t.app);
      const db = t.app.db;
      const nfd = db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
      // بلا حد للعاجل في هذا الاختبار، حتى يبقى «عاجل» عاجلًا في كل لحظة
      const sub = t.app.companyBilling.activeSubscription(nfd.id);
      db.run('UPDATE company_subscriptions SET terms = ? WHERE id = ?', JSON.stringify({ ...sub.terms, urgent_per_month: null }), sub.id);
      const cookie = await companyLogin(t.base, 'mariam@nilefoods.example');
      const entity = db.value('SELECT id FROM company_entities WHERE company_id = ? ORDER BY id LIMIT 1', nfd.id);
      const call = async (method, url, body) => {
        const res = await fetch(`${t.base}${url}`, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
      };
      const minute = (iso) => String(iso).slice(0, 16);
      for (const [label, iso, holidays] of [
        ['Thursday 15:59', local(2026, 10, 8, 15, 59), []],
        ['Thursday 16:01', local(2026, 10, 8, 16, 1), []],
        ['holiday eve (Saturday a holiday)', local(2026, 10, 8, 15, 59), ['2026-10-10']],
      ]) {
        t.app.settings.set('b2b_holidays', holidays);
        freezeClock(iso);
        const plan = await call('GET', '/api/company/plan');
        assert.equal(plan.status, 200);
        for (const pr of ['normal', 'high', 'urgent']) {
          const r = await call('POST', '/api/company/requests', { type: 'other', entity_id: entity, priority: pr, urgent_reason: pr === 'urgent' ? 'موعد توقيع غدًا' : undefined, description: `اختبار تطابق الوعد ${label} ${pr}`, fields: {} });
          assert.equal(r.status, 201, JSON.stringify(r.body));
          const stored = db.get('SELECT priority, first_response_due_at FROM company_requests WHERE code = ?', r.body.request.code);
          assert.equal(stored.priority, pr, `${label} ${pr} kept its priority`);
          assert.equal(minute(stored.first_response_due_at), minute(plan.body.promise_preview[pr].first_response_by), `${label} ${pr}: preview ${show(plan.body.promise_preview[pr].first_response_by)} vs stored ${show(stored.first_response_due_at)}`);
          assert.equal(r.body.request.promise.first_response_by, stored.first_response_due_at, `${label} ${pr}: the company view shows the stored date`);
        }
      }
    } finally {
      await t.close();
    }
  });
});
