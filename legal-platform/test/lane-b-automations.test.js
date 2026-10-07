// Lane B — Requirement 9: automations tied to file events, driven by a frozen clock.
// hearing (client attendance) → one WhatsApp reminder N days before (no duplicates); overdue invoice → reminder;
// unanswered document/info request → reminder; procedural deadline approaching without the task done → alert;
// lawyer overdue → alert. Without WhatsApp credentials outbound messages are recorded as 'simulated'.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import {
  ok, createLawyer, newCase, assign, uniquePhone, phoneCore, notificationsOf, outbox, runAutomations, plusDays, plusHours,
  portalFor,
} from './lane-b-kit.test.js';

const T0 = '2026-11-02T08:00:00.000Z';
const LONG_SESSIONS = { sessionTtlHours: 24 * 365 };

afterEach(() => resetClock());

async function boot() {
  freezeClock(T0);
  const t = await startTestApp({ seed: 'none', config: LONG_SESSIONS });
  const admin = await t.login('admin');
  return { t, admin };
}

async function matterFixture(admin, t, { phone = uniquePhone() } = {}) {
  const M = await createLawyer(admin, { name: 'محامي الجلسات', specialties: ['CIV'] });
  const cM = await t.login(M.username);
  const c = await newCase(admin, { phone, legal_area: 'CIV', title: 'دعوى تعويض' });
  const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, {
    kind: 'litigation', responsible_lawyer_id: M.id, court: 'محكمة شمال القاهرة', lawsuit_number: '77',
  }), 201);
  return { M, cM, kase: c, matter: m, phone };
}

function remindersFor(list, rule, pred = () => true) {
  return list.filter((m) => m.automation_rule === rule && m.automated && pred(m));
}

test('hearing with client attendance → exactly one WhatsApp reminder within the 3-day window, never duplicated', async () => {
  const { t, admin } = await boot();
  try {
    const { cM, matter, phone } = await matterFixture(admin, t);
    const hearingAt = plusDays(T0, 5);
    const ev = ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', title: 'جلسة المرافعة', starts_at: hearingAt, client_attendance_required: true }));
    ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', title: 'جلسة بدون حضور', starts_at: plusDays(T0, 4) }));
    const cancelled = ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'expert', title: 'جلسة خبير ملغاة', starts_at: plusDays(T0, 4), client_attendance_required: true }));
    ok(await cM.patch(`/api/lawyer/matter-events/${cancelled.id}`, { status: 'cancelled' }));

    const forMatter = async () => remindersFor(await outbox(admin), 'hearing_reminder', (m) => m.matter_id === matter.id);
    await runAutomations(admin);
    assert.equal((await forMatter()).length, 0, 'T0: 5 days before — too early');
    freezeClock(plusDays(T0, 1.5));
    await runAutomations(admin);
    assert.equal((await forMatter()).length, 0, '3.5 days before — still outside the 3-day window');

    freezeClock(plusDays(T0, 2.5));
    // the lawyer typed this event: nothing reaches the client before staff approve its text; staff are told once
    assert.equal((await runAutomations(admin)).hearing_reminder, 0);
    await runAutomations(admin);
    const held = (await admin.get('/api/notifications')).body.items.filter((n) => n.type === 'event.reminder_held');
    assert.equal(held.length, 1, 'staff get exactly one "reminder held" notice');
    ok(await admin.post(`/api/admin/matter-events/${ev.id}/approve-reminder`, {}));
    const r = await runAutomations(admin);
    assert.equal(r.hearing_reminder, 1);
    let rem = await forMatter();
    assert.equal(rem.length, 1);
    assert.equal(rem[0].channel, 'whatsapp');
    assert.equal(rem[0].status, 'simulated');
    assert.ok(rem[0].to_address.endsWith(phoneCore(phone)));
    // v9.1 b-site (B91-10): كلام بسيط باسمها والساعة كما تُقال ورابط صفحتها، بلا كود الملف الداخلي
    assert.ok(!rem[0].body.includes(matter.code), 'no internal MTR- code in the client message');
    assert.match(rem[0].body, /^أهلًا /);
    assert.match(rem[0].body, /الصبح|الضهر|العصر|بالليل/);
    // v9.1 fixes: رابط صفحتها لا يُحفظ في النص؛ {portal_link} في نص واتساب ويُصدر عند الإرسال الفعلي
    assert.ok(!/\/p\//.test(rem[0].body));
    assert.match(rem[0].meta.wa_text, /\{portal_link\}/);
    assert.ok(rem[0].body.includes('محكمة شمال القاهرة'));

    await runAutomations(admin);
    freezeClock(plusDays(T0, 3));
    await runAutomations(admin);
    freezeClock(plusDays(T0, 4.9));
    await runAutomations(admin);
    freezeClock(plusDays(T0, 6));
    await runAutomations(admin);
    rem = await forMatter();
    // v9.1 b-portal (B91-13): تذكير ثانٍ قبل الموعد بيوم (days_before [3, 1])، مرة واحدة، ولا يتكرر أي منهما
    assert.equal(rem.length, 2, 'the 3-day reminder plus one day-before reminder, never duplicated after repeated runs');
    assert.ok(rem.some((m) => m.body.includes('فكّرناك: بكرة')), 'the day-before text');
    const sim = ok(await admin.get('/api/admin/outbox?status=simulated'));
    assert.ok(sim.some((m) => m.id === rem[0].id));
    const rules = ok(await admin.get('/api/admin/automations'));
    assert.equal(rules.whatsapp_configured, false);
    const hr = rules.rules.find((x) => x.key === 'hearing_reminder');
    assert.equal(hr.total_runs, 2);
    assert.equal(hr.recent_runs[0].entity_id, ev.id);
  } finally {
    await t.close();
  }
});

test('days_before is configurable by admin only (case manager 403) and drives the reminder window', async () => {
  const { t, admin } = await boot();
  try {
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mona', name: 'منى', password: 'Manager@2026' }), 201);
    const manager = await t.login('mona', 'Manager@2026');
    assert.equal((await manager.patch('/api/admin/automations/hearing_reminder', { params: { days_before: 7 } })).status, 403);
    const upd = ok(await admin.patch('/api/admin/automations/hearing_reminder', { params: { days_before: 7 } }));
    assert.equal(upd.params.days_before, 7);
    const { cM, matter } = await matterFixture(admin, t);
    const ev6 = ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', starts_at: plusDays(T0, 6), client_attendance_required: true }));
    ok(await manager.post(`/api/admin/matter-events/${ev6.id}/approve-reminder`, {}));
    const r = await runAutomations(admin);
    assert.equal(r.hearing_reminder, 1, '6 days ahead is inside a 7-day window');
    // the manager may trigger a run (staff) but nothing new is sent
    assert.equal(ok(await manager.post('/api/admin/automations/run')).hearing_reminder, 0);
    // disabling the rule stops it
    ok(await admin.patch('/api/admin/automations/hearing_reminder', { enabled: false }));
    ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', starts_at: plusDays(T0, 2), client_attendance_required: true }));
    assert.equal((await runAutomations(admin)).hearing_reminder, 'disabled');
    assert.equal(remindersFor(await outbox(admin), 'hearing_reminder').length, 1);
  } finally {
    await t.close();
  }
});

// v9.1 b-site (B91-01): رقم كُتب في نموذج الموقع لا يصله شيء حتى يتأكد؛ بعد «تأكيد الهوية» يصل التذكير على واتساب
test('website-form client: no hearing reminder to an unconfirmed number (staff told once); after identity confirmation it goes out on WhatsApp', async () => {
  const { t, admin } = await boot();
  try {
    const phone = uniquePhone();
    const pub = t.client();
    const r = ok(await pub.post('/api/public/intake', {
      name: 'عميلة الموقع', phone, consent: true, description: 'أريد رفع دعوى تعويض عن أضرار لحقت بشقتي بسبب الجيران', attribution: { utm_source: 'google' },
    }), 201);
    const intake = ok(await admin.get(`/api/admin/intakes?q=${r.reference}`)).items[0];
    const c = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'CIV', title: 'تعويض أضرار' }), 201).case;
    const M = await createLawyer(admin, { specialties: ['CIV'] });
    const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', responsible_lawyer_id: M.id, court: 'محكمة الجيزة' }), 201);
    ok(await admin.post(`/api/admin/matters/${m.id}/events`, { kind: 'hearing', starts_at: plusDays(T0, 2), client_attendance_required: true }));
    await runAutomations(admin);
    await runAutomations(admin);
    assert.equal(remindersFor(await outbox(admin), 'hearing_reminder', (x) => x.matter_id === m.id).length, 0, 'nothing reaches an unconfirmed number');
    const held = (await admin.get('/api/notifications')).body.items.filter((n) => n.type === 'automation.unconfirmed');
    assert.equal(held.length, 1, 'staff are told once per story');
    assert.ok(held[0].title.includes(r.reference));
    ok(await admin.post(`/api/admin/intakes/${intake.id}/confirm-identity`, {}));
    await runAutomations(admin);
    const rem = remindersFor(await outbox(admin), 'hearing_reminder', (x) => x.matter_id === m.id);
    assert.equal(rem.length, 1);
    assert.equal(rem[0].channel, 'whatsapp', `hearing reminders must go out on WhatsApp (got ${rem[0].channel})`);
    assert.ok((rem[0].to_address || '').endsWith(phoneCore(phone)));
  } finally {
    await t.close();
  }
});

test('overdue unpaid invoice → reminder, repeated only every 7 days, using the remaining balance; paid/cancelled invoices are left alone', async () => {
  const { t, admin } = await boot();
  try {
    const { matter, phone } = await matterFixture(admin, t);
    const inv = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'أتعاب الدعوى', amount: 2000, due_at: plusDays(T0, 1) }));
    const paid = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'رسوم مسددة', amount: 500, due_at: plusDays(T0, 1) }));
    ok(await admin.post(`/api/admin/invoices/${paid.id}/payments`, { amount: 500 }));
    const cancelled = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'فاتورة ملغاة', amount: 900, due_at: plusDays(T0, 1) }));
    ok(await admin.post(`/api/admin/invoices/${cancelled.id}/cancel`));
    ok(await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 500 }));

    const mine = async () => remindersFor(await outbox(admin), 'invoice_reminder');
    await runAutomations(admin);
    assert.equal((await mine()).length, 0, 'not yet due');
    freezeClock(plusDays(T0, 2));
    await runAutomations(admin);
    let rem = await mine();
    assert.equal(rem.length, 1, 'only the unpaid overdue invoice is reminded');
    // v9.1 b-site (B91-10): المبلغ وسببه بكلام بسيط، و«ردّي علينا قبل ما تدفعي» — رقم الفاتورة يبقى في بطاقتها في صفحة المتابعة
    assert.ok(rem[0].body.includes('أتعاب الدعوى'), `reminder states the reason: ${rem[0].body}`);
    assert.ok(rem[0].body.includes('قبل ما تدفع'));
    assert.ok(rem[0].body.includes('1,500'), `reminder states the remaining balance: ${rem[0].body}`);
    assert.equal(rem[0].channel, 'whatsapp');
    assert.ok(rem[0].to_address.endsWith(phoneCore(phone)));
    await runAutomations(admin);
    freezeClock(plusDays(T0, 6));
    await runAutomations(admin);
    assert.equal((await mine()).length, 1, 'no repeat before 7 days');
    freezeClock(plusDays(T0, 9.5));
    await runAutomations(admin);
    rem = await mine();
    assert.equal(rem.length, 2, 'second reminder after 7 days');
    ok(await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 1500 }));
    freezeClock(plusDays(T0, 20));
    await runAutomations(admin);
    assert.equal((await mine()).length, 2, 'a fully paid invoice is no longer reminded');
  } finally {
    await t.close();
  }
});

test('document request awaiting the client → reminder after 2 days, then every 3 days, max 2; stops once the client replies', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { specialties: ['CIV'] });
    const cL = await t.login(L.username);
    const k = await newCase(admin, { legal_area: 'CIV', title: 'مطالبة مالية' });
    const a = await assign(admin, k.id, { lawyer_id: L.id, role: 'lead' });
    const ir = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', question: 'صورة إيصال الأمانة' }), 201);
    const ir2 = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'information', question: 'تاريخ تحرير الإيصال؟' }), 201);
    await runAutomations(admin);
    assert.equal(remindersFor(await outbox(admin), 'document_reminder').length, 0, 'pending_admin requests are never reminded');
    ok(await admin.post(`/api/admin/info-requests/${ir.id}/approve`, { client_message: 'برجاء إرسال صورة إيصال الأمانة' }));
    ok(await admin.post(`/api/admin/info-requests/${ir2.id}/approve`, { client_message: 'ما تاريخ تحرير الإيصال؟' }));
    const token = await portalFor(admin, k.clientId);
    freezeClock(plusDays(T0, 1));
    ok(await t.client().post(`/api/portal/${token}/requests/${ir2.id}/reply`, { body: 'حُرر الإيصال في يناير 2025' }));

    const forIr = async (id) => remindersFor(await outbox(admin), 'document_reminder', (m) => m.meta.info_request_id === id);
    await runAutomations(admin);
    assert.equal((await forIr(ir.id)).length, 0, 'only 1 day without reply');
    freezeClock(plusDays(T0, 2.1));
    await runAutomations(admin);
    await runAutomations(admin);
    let rem = await forIr(ir.id);
    assert.equal(rem.length, 1);
    // v9.1 b-site (B91-10): بلا كود الملف الداخلي، ومعه رابط صفحتها و«صوّري الورقة وابعتيها»
    assert.ok(!rem[0].body.includes(k.code), 'no internal case code in the client message');
    // v9.1 fixes: رابط صفحتها يُصدر عند الإرسال الفعلي فقط
    assert.ok(!/\/p\//.test(rem[0].body));
    assert.match(rem[0].meta.wa_text, /\{portal_link\}/);
    assert.ok(rem[0].body.includes('صوّري الورقة وابعتيها'));
    assert.ok(rem[0].body.includes('برجاء إرسال صورة إيصال الأمانة'));
    assert.equal((await forIr(ir2.id)).length, 0, 'a request the client already answered is not reminded');
    freezeClock(plusDays(T0, 4));
    await runAutomations(admin);
    assert.equal((await forIr(ir.id)).length, 1, 'repeat only every 3 days');
    freezeClock(plusDays(T0, 5.2));
    await runAutomations(admin);
    assert.equal((await forIr(ir.id)).length, 2);
    freezeClock(plusDays(T0, 12));
    await runAutomations(admin);
    rem = await forIr(ir.id);
    assert.equal(rem.length, 2, 'max 2 reminders');
    const d = ok(await admin.get(`/api/admin/cases/${k.id}`));
    assert.equal(d.info_requests.find((x) => x.id === ir.id).reminder_count, 2);
  } finally {
    await t.close();
  }
});

test('no "still waiting for your reply" reminder when the client already replied on WhatsApp (before staff recorded it)', async () => {
  const { t, admin } = await boot();
  try {
    const L = await createLawyer(admin, { specialties: ['CIV'] });
    const cL = await t.login(L.username);
    const phone = uniquePhone();
    const k = await newCase(admin, { phone, legal_area: 'CIV', title: 'مطالبة بقيمة شيك' });
    const a = await assign(admin, k.id, { lawyer_id: L.id, role: 'lead' });
    const ir = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', question: 'صورة الشيك المرتد' }), 201);
    ok(await admin.post(`/api/admin/info-requests/${ir.id}/approve`, { client_message: 'برجاء إرسال صورة الشيك المرتد' }));
    freezeClock(plusDays(T0, 1));
    const { waPayload } = await import('./helpers.js');
    ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: `20${phone.slice(1)}`, text: 'تمام، ده صورة الشيك والإفادة من البنك' })));
    const d = ok(await admin.get(`/api/admin/cases/${k.id}`));
    assert.ok(d.messages.some((m) => m.direction === 'in' && m.body.includes('صورة الشيك')), 'the reply reached the case');
    freezeClock(plusDays(T0, 2.5));
    await runAutomations(admin);
    const rem = remindersFor(await outbox(admin), 'document_reminder', (m) => m.meta.info_request_id === ir.id);
    assert.equal(rem.length, 0, 'the client already replied on WhatsApp — a "we are still waiting" reminder is wrong');
  } finally {
    await t.close();
  }
});

test('procedural deadline approaching without the task done → one alert to the lawyer and staff; done tasks and ordinary tasks are ignored', async () => {
  const { t, admin } = await boot();
  try {
    const { cM, M, matter } = await matterFixture(admin, t);
    const proc = ok(await cM.post(`/api/lawyer/matters/${matter.id}/tasks`, { title: 'إيداع مذكرة الدفاع', due_at: plusDays(T0, 5), procedural: true }));
    ok(await cM.post(`/api/lawyer/matters/${matter.id}/tasks`, { title: 'مهمة عادية غير إجرائية', due_at: plusDays(T0, 5) }));
    const done = ok(await admin.post(`/api/admin/matters/${matter.id}/tasks`, { title: 'استئناف الحكم (أُنجز)', due_at: plusDays(T0, 4), procedural: true, assignee_user_id: M.id }));
    ok(await admin.patch(`/api/admin/matter-tasks/${done.id}`, { status: 'done' }));

    const deadlineNotes = async (c) => (await notificationsOf(c)).filter((n) => n.type === 'deadline');
    await runAutomations(admin);
    assert.equal((await deadlineNotes(cM)).length, 0, '5 days ahead — outside the 3-day window');
    freezeClock(plusDays(T0, 2.5));
    await runAutomations(admin);
    await runAutomations(admin);
    let ln = await deadlineNotes(cM);
    assert.equal(ln.length, 1, 'exactly one alert to the lawyer');
    assert.ok(ln[0].title.includes('إيداع مذكرة الدفاع'));
    assert.ok(ln[0].body.includes(matter.code));
    const sn = await deadlineNotes(admin);
    assert.equal(sn.length, 1, 'and one to staff');
    assert.equal(JSON.stringify(ln).includes('استئناف الحكم'), false, 'completed tasks are not alerted');
    assert.equal(JSON.stringify(ln).includes('مهمة عادية'), false, 'non-procedural tasks are not alerted');
    ok(await cM.patch(`/api/lawyer/matter-tasks/${proc.id}`, { status: 'done' }));
    freezeClock(plusDays(T0, 6));
    await runAutomations(admin);
    ln = await deadlineNotes(cM);
    assert.equal(ln.length, 1, 'no more alerts once the task is done');
  } finally {
    await t.close();
  }
});

test('lawyer overdue on an assignment → one alert to the lawyer and the case manager; on-time and submitted work is not alerted', async () => {
  const { t, admin } = await boot();
  try {
    const late = await createLawyer(admin, { name: 'محامٍ متأخر', specialties: ['CIV'] });
    const fast = await createLawyer(admin, { name: 'محامٍ ملتزم', specialties: ['CIV'] });
    const cLate = await t.login(late.username);
    const cFast = await t.login(fast.username);
    const k1 = await newCase(admin, { title: 'ملف متأخر' });
    const k2 = await newCase(admin, { title: 'ملف مقدَّم في موعده' });
    const a1 = await assign(admin, k1.id, { lawyer_id: late.id, role: 'lead', due_at: plusDays(T0, 1) });
    const a2 = await assign(admin, k2.id, { lawyer_id: fast.id, role: 'lead', due_at: plusDays(T0, 1) });
    freezeClock(plusHours(T0, 5));
    ok(await cFast.post(`/api/lawyer/assignments/${a2.id}/submit`, { body: 'رأي مقدم قبل الموعد المحدد بوقت كافٍ ومكتمل' }));
    freezeClock(plusDays(T0, 2));
    await runAutomations(admin);
    await runAutomations(admin);
    const lateNotes = (await notificationsOf(cLate)).filter((n) => n.type === 'assignment.overdue');
    assert.equal(lateNotes.length, 1);
    assert.ok(lateNotes[0].title.includes(k1.code));
    assert.equal(lateNotes[0].link, `#/my/assignments/${a1.id}`);
    assert.equal((await notificationsOf(cFast)).filter((n) => n.type === 'assignment.overdue').length, 0);
    const staff = (await notificationsOf(admin)).filter((n) => n.type === 'assignment.overdue');
    assert.equal(staff.length, 1);
    assert.ok(staff[0].title.includes(k1.code));
    const q = ok(await admin.get('/api/admin/queue'));
    assert.deepEqual(q.overdue_assignments.map((x) => x.id), [a1.id]);
    const dash = ok(await cLate.get('/api/lawyer/dashboard'));
    assert.equal(dash.counts.overdue, 1);
    // extending the deadline and missing it again is a new event → a new alert
    ok(await admin.patch(`/api/admin/assignments/${a1.id}`, { due_at: plusDays(T0, 3) }));
    freezeClock(plusDays(T0, 4));
    await runAutomations(admin);
    assert.equal((await notificationsOf(cLate)).filter((n) => n.type === 'assignment.overdue').length, 2);
  } finally {
    await t.close();
  }
});
