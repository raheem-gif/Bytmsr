// Lane B — Requirement 8 (+3): lawyer "Submit" never reaches the client; admin reviews (return with notes / approve),
// prepares the client-facing version and sends it through the org channel; only staff close cases; closing with a
// pending submitted opinion is blocked unless forced; a consultation converts into an ongoing Matter linked to the
// same client and original case, where the responsible lawyer's hearing triggers a client reminder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';
import {
  ok, createLawyer, newCase, assign, uniquePhone, phoneCore, notificationsOf, outbox, caseDetail, portalFor, postWebhook,
  runAutomations, plusDays, assertNoLeak,
} from './lane-b-kit.test.js';

let t;
let admin;
let L;
let M;
let other;
let cL;
let cM;
let cOther;

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
  L = await createLawyer(admin, { name: 'لمياء الدسوقي', specialties: ['FAM'], agreement: { type: 'per_case', rate: 500 } });
  M = await createLawyer(admin, { name: 'ماجد الحسيني', specialties: ['FAM', 'CIV'], agreement: { type: 'per_case', rate: 300 } });
  other = await createLawyer(admin, { name: 'محامٍ آخر', specialties: ['FAM'] });
  cL = await t.login(L.username);
  cM = await t.login(M.username);
  cOther = await t.login(other.username);
});

after(async () => {
  await t?.close();
});

async function caseOutbound(code) {
  return (await outbox(admin)).filter((m) => m.case_code === code);
}

const V1 = 'الرأي المبدئي V1MARK: للحاضنة الحق في مسكن الحضانة، ويجب رفع دعوى نفقة صغيرة فورًا مع طلب نفقة مؤقتة.';
const V2 = 'الرأي المعدل V2MARK: للحاضنة الحق في مسكن الحضانة أو أجر مسكن، ونوصي برفع دعوى نفقة صغيرة مع طلب نفقة مؤقتة وتحرير محضر عند أي محاولة طرد.';
const CLIENT_TEXT = 'أستاذتنا الفاضلة، بعد دراسة ملفكم: من حقكم البقاء في الشقة مع ابنتكم، ونقترح رفع دعوى نفقة. نحن معكم في كل خطوة.';

let main; // case used for the full review cycle
let mainAsg;
let v2Id;
let v1Id;

test('lawyer submit stays inside the organization: nothing reaches the client, the case goes to staff review', async () => {
  main = await newCase(admin, { legal_area: 'FAM', title: 'نفقة صغيرة ومسكن حضانة', issues: ['نفقة الصغيرة', 'مسكن الحضانة'] });
  mainAsg = await assign(admin, main.id, { lawyer_id: L.id, role: 'lead' });
  ok(await cL.post(`/api/lawyer/assignments/${mainAsg.id}/open`));
  ok(await cL.put(`/api/lawyer/assignments/${mainAsg.id}/draft`, { body: V1 }));
  const s = ok(await cL.post(`/api/lawyer/assignments/${mainAsg.id}/submit`, { hours_spent: 2 }));
  assert.equal(s.status, 'submitted');
  assert.equal(s.version, 1);
  v1Id = s.id;
  assert.deepEqual(await caseOutbound(main.code), [], 'submit must not send anything to the client');
  const token = await portalFor(admin, main.clientId);
  const portal = ok(await t.client().get(`/api/portal/${token}`));
  assert.deepEqual(portal.answers, []);
  assert.equal(JSON.stringify(portal).includes('V1MARK'), false, 'the internal opinion must never be shown in the client portal');
  const d = await caseDetail(admin, main.id);
  assert.equal(d.case.status, 'under_review');
  const q = ok(await admin.get('/api/admin/queue'));
  assert.ok(q.opinions.some((o) => o.id === v1Id));
  assert.ok((await notificationsOf(admin)).some((n) => n.type === 'opinion.submitted' && n.title.includes(main.code)));
  // a submitted opinion is frozen for the lawyer
  assert.equal((await cL.put(`/api/lawyer/assignments/${mainAsg.id}/draft`, { body: 'تعديل غير مسموح أثناء المراجعة' })).status, 409);
  assert.equal((await cL.post(`/api/lawyer/assignments/${mainAsg.id}/submit`, { body: 'تقديم مكرر للرأي أثناء المراجعة' })).status, 409);
});

test('admin returns the opinion with notes: the lawyer is notified, sees the notes and continues from a new draft version', async () => {
  assert.equal((await admin.post(`/api/admin/opinions/${v1Id}/return`, {})).status, 400, 'return requires notes');
  const r = ok(await admin.post(`/api/admin/opinions/${v1Id}/return`, { note: 'برجاء إضافة البديل: أجر مسكن الحضانة' }));
  assert.equal(r.status, 'returned');
  const v = ok(await cL.get(`/api/lawyer/assignments/${mainAsg.id}`));
  assert.equal(v.assignment.status, 'returned');
  const v1 = v.my_opinions.find((o) => o.version === 1);
  assert.equal(v1.status, 'returned');
  assert.equal(v1.review_note, 'برجاء إضافة البديل: أجر مسكن الحضانة');
  assert.equal(v.current_draft.version, 2);
  assert.equal(v.current_draft.body, V1, 'the new draft starts from the returned text');
  assert.equal(v.permissions.can_submit, true);
  const n = (await notificationsOf(cL)).find((x) => x.type === 'opinion.returned');
  assert.ok(n && n.body.includes('أجر مسكن الحضانة'));
  assert.equal((await caseDetail(admin, main.id)).case.status, 'in_progress');
  assert.deepEqual(await caseOutbound(main.code), []);
});

test('resubmit → approve: versions are kept, the case becomes "approved" and the lawyer is notified', async () => {
  ok(await cL.put(`/api/lawyer/assignments/${mainAsg.id}/draft`, { body: V2 }));
  const s = ok(await cL.post(`/api/lawyer/assignments/${mainAsg.id}/submit`));
  assert.equal(s.version, 2);
  v2Id = s.id;
  assert.equal((await admin.post(`/api/admin/opinions/${v1Id}/approve`, {})).status, 409, 'a returned version cannot be approved');
  const a = ok(await admin.post(`/api/admin/opinions/${v2Id}/approve`, { quality_score: 5, note: 'ممتاز' }));
  assert.equal(a.status, 'approved');
  const v = ok(await cL.get(`/api/lawyer/assignments/${mainAsg.id}`));
  assert.equal(v.assignment.status, 'approved');
  assert.deepEqual(v.my_opinions.map((o) => [o.version, o.status]), [[1, 'returned'], [2, 'approved']]);
  assert.equal(v.permissions.can_submit, false);
  assert.ok((await notificationsOf(cL)).some((x) => x.type === 'opinion.approved'));
  assert.equal((await caseDetail(admin, main.id)).case.status, 'approved');
  assert.equal((await cL.put(`/api/lawyer/assignments/${mainAsg.id}/draft`, { body: 'تعديل بعد الاعتماد غير مسموح' })).status, 409);
  assert.deepEqual(await caseOutbound(main.code), [], 'approval alone still sends nothing to the client');
});

test('admin prepares the client-facing version (linked to an approved opinion only) and sends it through the org channel', async () => {
  assert.equal((await admin.post(`/api/admin/cases/${main.id}/client-answers`, { body: CLIENT_TEXT, opinion_id: v1Id })).status, 400,
    'cannot link the client answer to a non-approved opinion');
  const ai = ok(await admin.post(`/api/admin/cases/${main.id}/ai/client-version`, { opinion_id: v2Id }));
  assert.ok(ai.output.text.length > 0, 'AI drafts a simplified client version for staff to edit');
  const draft = ok(await admin.post(`/api/admin/cases/${main.id}/client-answers`, { body: 'مسودة أولى للرد', opinion_id: v2Id }));
  assert.equal(draft.status, 'draft');
  const edited = ok(await admin.post(`/api/admin/cases/${main.id}/client-answers`, { id: draft.id, body: CLIENT_TEXT, opinion_id: v2Id }));
  assert.equal(edited.id, draft.id);
  assert.deepEqual(await caseOutbound(main.code), [], 'a draft answer is not sent');
  const sent = ok(await admin.post(`/api/admin/client-answers/${draft.id}/send`, {}));
  assert.equal(sent.status, 'sent');
  assert.equal(sent.channel, 'whatsapp');
  const out = await caseOutbound(main.code);
  assert.equal(out.length, 1);
  assert.equal(out[0].body, CLIENT_TEXT);
  assert.equal(out[0].status, 'simulated');
  assert.ok(out[0].to_address.endsWith(phoneCore(main.phone)));
  assert.equal(out[0].body.includes('V2MARK'), false, 'the professional internal wording is not what the client receives');
  assert.equal((await caseDetail(admin, main.id)).case.status, 'answered');
  const token = await portalFor(admin, main.clientId);
  const portal = ok(await t.client().get(`/api/portal/${token}`));
  assert.equal(portal.answers.length, 1);
  assert.equal(portal.answers[0].body, CLIENT_TEXT);
  assert.equal((await admin.post(`/api/admin/client-answers/${draft.id}/send`, {})).status, 409, 'cannot send twice');
});

test('lawyers cannot close cases; staff close with an outcome', async () => {
  assert.equal((await cL.post(`/api/admin/cases/${main.id}/close`, { outcome: 'answered' })).status, 403);
  const viaLawyerApi = await cL.post(`/api/lawyer/assignments/${mainAsg.id}/close`, { outcome: 'answered' });
  assert.equal(viaLawyerApi.status, 404, 'there is no lawyer endpoint that closes a case');
  assert.notEqual((await caseDetail(admin, main.id)).case.status, 'closed');
  assert.equal((await admin.post(`/api/admin/cases/${main.id}/close`, { outcome: 'banana' })).status, 400);
  const closed = ok(await admin.post(`/api/admin/cases/${main.id}/close`, { outcome: 'answered', note: 'تم الرد على العميلة' }));
  assert.equal(closed.status, 'closed');
  assert.equal(closed.outcome, 'answered');
  assert.ok(closed.closed_at);
  assert.ok((await notificationsOf(cL)).some((n) => n.type === 'case.closed' && n.title.includes(main.code)));
  assert.equal((await admin.post(`/api/admin/cases/${main.id}/close`, { outcome: 'answered' })).status, 409);
  // closed file: no new work can be pushed into it
  assert.equal((await admin.post(`/api/admin/cases/${main.id}/assignments`, { lawyer_id: M.id, role: 'co_counsel' })).status, 409);
  assert.equal((await cL.post(`/api/lawyer/assignments/${mainAsg.id}/info-requests`, { kind: 'information', question: 'سؤال بعد الإغلاق للعميلة' })).status, 409);
  assert.equal((await cL.post(`/api/lawyer/assignments/${mainAsg.id}/issues`, { title: 'مسألة بعد الإغلاق' })).status, 409);
  const hist = ok(await cL.get('/api/lawyer/assignments?scope=history'));
  assert.ok(hist.some((a) => a.id === mainAsg.id && a.case_state === 'closed'));
  assert.equal(ok(await cL.get('/api/lawyer/assignments')).some((a) => a.id === mainAsg.id), false);
});

let forced;
test('closing with a submitted opinion still awaiting review is blocked (409) unless forced', async () => {
  forced = await newCase(admin, { legal_area: 'FAM', title: 'ملف به رأي معلق' });
  const a = await assign(admin, forced.id, { lawyer_id: M.id, role: 'lead' });
  const opId = ok(await cM.post(`/api/lawyer/assignments/${a.id}/submit`, { body: 'رأي مقدم ينتظر المراجعة ولم يُعتمد بعد من الإدارة' })).id;
  const r = await admin.post(`/api/admin/cases/${forced.id}/close`, { outcome: 'client_withdrew' });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'conflict');
  assert.deepEqual(r.body.details.pending_opinions, [opId]);
  assert.equal((await caseDetail(admin, forced.id)).case.status, 'under_review');
  const c = ok(await admin.post(`/api/admin/cases/${forced.id}/close`, { outcome: 'client_withdrew', force: true }));
  assert.equal(c.status, 'closed');
  const d = await caseDetail(admin, forced.id);
  assert.equal(d.opinions.find((o) => o.id === opId).status, 'superseded');
  assert.equal(d.assignments[0].billing, null, 'an opinion never approved creates no billable event');
  assert.equal(ok(await admin.get(`/api/admin/accounting/ledger?lawyer_id=${M.id}`)).length, 0);
});

test('a returning client (same phone, later) keeps the same client id and gets a new, independent case code', async () => {
  const wa = `20${forced.phone.slice(1)}`;
  ok(await postWebhook(t, waPayload({ from: wa, name: 'نفس العميل', text: 'مرحبًا، عندي مشكلة جديدة مع صاحب العمل بخصوص مستحقاتي' })));
  const d0 = await caseDetail(admin, forced.id);
  const intakes = ok(await admin.get(`/api/admin/intakes?q=${phoneCore(forced.phone)}`)).items;
  const fresh = intakes.find((i) => i.status === 'new');
  assert.ok(fresh, 'a new intake is opened for the returning client');
  assert.equal(fresh.client_id, forced.clientId);
  assert.equal(fresh.client_code, d0.client.code);
  assert.equal(fresh.returning_client, true);
  assert.equal(fresh.source, 'returning');
  const c2 = ok(await admin.post(`/api/admin/intakes/${fresh.id}/convert`, { legal_area: 'LAB', title: 'مستحقات عمالية' }), 201).case;
  assert.notEqual(c2.code, forced.code);
  assert.match(c2.code, /^LAB-\d{4}-\d{5}$/);
  assert.equal(c2.client_id, forced.clientId);
  const client = ok(await admin.get(`/api/admin/clients/${forced.clientId}`));
  const codes = JSON.stringify(client);
  assert.ok(codes.includes(forced.code) && codes.includes(c2.code), 'both cases are listed under the same client');
});

let matter;
test('a consultation converts into an ongoing litigation matter linked to the same client and original case', async () => {
  const src = await newCase(admin, { legal_area: 'FAM', title: 'نفقة وحضانة — تحويل لقضية', phone: uniquePhone() });
  const a = await assign(admin, src.id, { lawyer_id: L.id, role: 'lead' });
  const op = ok(await cL.post(`/api/lawyer/assignments/${a.id}/submit`, { body: 'ننصح برفع دعوى نفقة صغيرة أمام محكمة الأسرة المختصة مع طلب نفقة مؤقتة' })).id;
  ok(await admin.post(`/api/admin/opinions/${op}/approve`, {}));
  assert.equal((await cL.post(`/api/admin/cases/${src.id}/matter`, { kind: 'litigation' })).status, 403);
  const m = ok(await admin.post(`/api/admin/cases/${src.id}/matter`, {
    kind: 'litigation',
    responsible_lawyer_id: M.id,
    court: 'محكمة الأسرة بالمعادي',
    circuit: 'الدائرة 5',
    lawsuit_number: '1234',
    lawsuit_year: '2026',
    opponent: 'المطلق',
    agreed_fee: 5000,
    notes: 'تمثيل العميلة في دعوى النفقة',
    close_case: true,
  }), 201);
  matter = { ...m, caseId: src.id, caseCode: src.code, clientId: src.clientId, phone: src.phone };
  assert.match(m.code, /^MTR-\d{4}-\d{5}$/);
  assert.equal(m.case_id, src.id);
  assert.equal(m.client_id, src.clientId);
  assert.equal(m.responsible_lawyer_id, M.id);
  const d = await caseDetail(admin, src.id);
  assert.equal(d.case.status, 'closed');
  assert.equal(d.case.outcome, 'referred_matter');
  assert.equal(d.matter.id, m.id);
  assert.equal((await admin.post(`/api/admin/cases/${src.id}/matter`, { kind: 'litigation' })).status, 409, 'one matter per case');
  const md = ok(await admin.get(`/api/admin/matters/${m.id}`));
  assert.equal(md.case.code, src.code);
  assert.equal(md.client.id, src.clientId);
  assert.ok((await notificationsOf(cM)).some((n) => n.type === 'matter.assigned' && n.title.includes(m.code)));
});

test('the responsible lawyer sees the matter (court data, no client contact data) and adds a hearing; others get 404', async () => {
  const list = ok(await cM.get('/api/lawyer/matters'));
  assert.deepEqual(list.map((x) => x.id), [matter.id]);
  const v = ok(await cM.get(`/api/lawyer/matters/${matter.id}`));
  assert.equal(v.matter.court, 'محكمة الأسرة بالمعادي');
  assert.equal(v.matter.lawsuit_number, '1234');
  assertNoLeak(v, { keys: ['phone', 'national_id', 'email', 'invoices', 'payments', 'agreed_fee', 'agreed_fee_minor', 'messages', 'source', 'campaign'], values: [phoneCore(matter.phone)] }, 'lawyer matter view');
  for (const c of [cL, cOther]) {
    assert.equal((await c.get(`/api/lawyer/matters/${matter.id}`)).status, 404);
    assert.equal((await c.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', starts_at: plusDays(new Date().toISOString(), 2) })).status, 404);
  }
  const before = (await outbox(admin)).filter((x) => x.matter_id === matter.id && x.automated).length;
  assert.equal(before, 0);
  const startsAt = plusDays(new Date().toISOString(), 2);
  const ev = ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, {
    kind: 'hearing', title: 'الجلسة الأولى', starts_at: startsAt, client_attendance_required: true,
  }));
  assert.equal(ev.client_attendance_required, 1);
  assert.equal(ev.location, 'محكمة الأسرة بالمعادي', 'defaults to the court of the matter');
  assert.ok((await notificationsOf(admin)).some((n) => n.type === 'event.added' && n.title.includes(matter.code)));
  // a hearing without required attendance must not trigger a client reminder
  ok(await cM.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', title: 'جلسة إدارية', starts_at: plusDays(new Date().toISOString(), 1) }));

  // the lawyer's event text needs staff approval before any client reminder; the admin view flags it
  assert.equal((await runAutomations(admin)).hearing_reminder, 0);
  const md = ok(await admin.get(`/api/admin/matters/${matter.id}`));
  assert.equal(md.events.find((x) => x.id === ev.id).reminder_pending_approval, true);
  // the client portal never shows lawyer-typed text before approval
  ok(await admin.post(`/api/admin/matter-events/${ev.id}/approve-reminder`, {}));
  assert.equal(ok(await admin.get(`/api/admin/matters/${matter.id}`)).events.find((x) => x.id === ev.id).reminder_pending_approval, false);
  const run1 = await runAutomations(admin);
  assert.equal(run1.hearing_reminder, 1);
  const run2 = await runAutomations(admin);
  assert.equal(run2.hearing_reminder, 0);
  const reminders = (await outbox(admin)).filter((x) => x.matter_id === matter.id && x.automation_rule === 'hearing_reminder');
  assert.equal(reminders.length, 1, 'exactly one reminder per event');
  assert.equal(reminders[0].channel, 'whatsapp');
  assert.equal(reminders[0].status, 'simulated');
  assert.equal(reminders[0].automated, true);
  assert.ok(reminders[0].body.includes(matter.code));
  assert.ok(reminders[0].to_address.endsWith(phoneCore(matter.phone)));
});

test('matter money stays with staff: invoices, payments and expenses; lawyers cannot touch them', async () => {
  assert.equal((await cM.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'أتعاب', amount: 100, due_at: plusDays(new Date().toISOString(), 5) })).status, 403);
  const inv = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'الدفعة الأولى من الأتعاب', amount: 3000, due_at: plusDays(new Date().toISOString(), 10) }));
  assert.match(inv.number, /^INV-\d{4}-\d{5}$/);
  const p = ok(await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 1000, method: 'cash' }));
  assert.equal(p.status, 'partially_paid');
  assert.equal(p.balance, 2000);
  assert.equal((await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 2500 })).status, 400, 'cannot overpay');
  ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'رسوم قيد الدعوى', amount: 150, paid_by: 'organization' }));
  ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'انتقالات المحامي', amount: 200, paid_by: 'lawyer', lawyer_id: M.id }));
  const task = ok(await cM.post(`/api/lawyer/matters/${matter.id}/tasks`, { title: 'إعلان صحيفة الدعوى', due_at: plusDays(new Date().toISOString(), 6), procedural: true }));
  assert.equal(task.assignee_user_id, M.id);
  const md = ok(await admin.get(`/api/admin/matters/${matter.id}`));
  assert.equal(md.totals.invoiced, 3000);
  assert.equal(md.totals.paid, 1000);
  assert.equal(md.totals.expenses, 350);
  const reimb = ok(await admin.get(`/api/admin/accounting/ledger?lawyer_id=${M.id}`)).filter((e) => e.kind === 'reimbursement');
  assert.equal(reimb.length, 1);
  assert.equal(reimb[0].amount, 200);
  const cost = ok(await admin.get(`/api/admin/accounting/case-cost/${matter.caseId}`));
  assert.equal(cost.expenses, 150, 'organization-paid expenses count toward the real cost of the case');
  assert.ok(cost.direct >= 500 + 200, 'lawyer fee + reimbursed expense are direct costs');
  const v = ok(await cM.get(`/api/lawyer/matters/${matter.id}`));
  assert.equal(JSON.stringify(v).includes('الدفعة الأولى من الأتعاب'), false, 'invoices are not shown to the lawyer');
});

test('AI assists but does not decide: a raw AI draft with «[يُستكمل» placeholders cannot be submitted until the lawyer completes it', async () => {
  const k = await newCase(admin, { legal_area: 'FAM', title: 'رؤية الصغير', issues: ['تنظيم حق الرؤية'] });
  const a = await assign(admin, k.id, { lawyer_id: L.id, role: 'lead' });
  const ai = ok(await cL.post(`/api/lawyer/assignments/${a.id}/ai/draft`));
  assert.ok(ai.text.includes('[يُستكمل'), 'the heuristic draft marks the parts the lawyer must complete');
  ok(await cL.put(`/api/lawyer/assignments/${a.id}/draft`, { body: ai.text, ai_suggestion_id: ai.id }));
  const r = await cL.post(`/api/lawyer/assignments/${a.id}/submit`);
  assert.equal(r.status, 400);
  assert.equal(ok(await cL.get(`/api/lawyer/assignments/${a.id}`)).assignment.status, 'in_progress');
  const finished = ai.text.replace(/\[يُستكمل[^\]]*\]/g, 'يحق للأب غير الحاضن رؤية الصغير أسبوعيًا في مكان مناسب يحدده القاضي.');
  const s = ok(await cL.post(`/api/lawyer/assignments/${a.id}/submit`, { body: finished, ai_suggestion_id: ai.id }));
  assert.equal(s.status, 'submitted');
  // a suggestion that belongs to another assignment cannot be attached
  const other = await assign(admin, (await newCase(admin, { legal_area: 'FAM', title: 'ملف آخر' })).id, { lawyer_id: L.id, role: 'lead' });
  assert.equal((await cL.put(`/api/lawyer/assignments/${other.id}/draft`, { body: 'نص', ai_suggestion_id: ai.id })).status, 400);
});

test('a closed matter accepts no new hearings and stops sending hearing reminders', async () => {
  const k = await newCase(admin, { legal_area: 'CIV', title: 'قضية ستُغلق', phone: uniquePhone() });
  const m = ok(await admin.post(`/api/admin/cases/${k.id}/matter`, { kind: 'litigation', responsible_lawyer_id: M.id, court: 'محكمة الإسكندرية' }), 201);
  ok(await cM.post(`/api/lawyer/matters/${m.id}/events`, { kind: 'hearing', starts_at: plusDays(new Date().toISOString(), 2), client_attendance_required: true }));
  ok(await admin.patch(`/api/admin/matters/${m.id}`, { status: 'closed' }));
  assert.equal((await cM.post(`/api/lawyer/matters/${m.id}/events`, { kind: 'hearing', starts_at: plusDays(new Date().toISOString(), 3) })).status, 409);
  await runAutomations(admin);
  const rem = (await outbox(admin)).filter((x) => x.matter_id === m.id && x.automation_rule === 'hearing_reminder');
  assert.equal(rem.length, 0);
});

test('atomicity: a matter conversion that cannot close the case (opinion awaiting review) leaves no orphan matter', async () => {
  const k = await newCase(admin, { legal_area: 'FAM', title: 'تحويل فاشل' });
  const a = await assign(admin, k.id, { lawyer_id: L.id, role: 'lead' });
  ok(await cL.post(`/api/lawyer/assignments/${a.id}/submit`, { body: 'رأي مقدم ينتظر مراجعة الإدارة قبل أي تحويل للملف' }));
  const before = ok(await admin.get('/api/admin/matters')).length;
  const r = await admin.post(`/api/admin/cases/${k.id}/matter`, { kind: 'litigation', responsible_lawyer_id: M.id, close_case: true });
  assert.equal(r.status, 409);
  assert.equal(ok(await admin.get('/api/admin/matters')).length, before, 'no matter row may survive the failed conversion');
  const d = await caseDetail(admin, k.id);
  assert.equal(d.matter, null);
  assert.equal(d.case.matter_id, null);
  assert.notEqual(d.case.status, 'closed');
  assert.equal(ok(await cM.get('/api/lawyer/matters')).some((x) => x.case_id === k.id || x.title === 'تحويل فاشل'), false);
});

test('atomicity: converting an intake with an invalid national id creates no case and leaves the intake open', async () => {
  const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: uniquePhone(), name: 'عميل بيانات خاطئة', text: 'أحتاج استشارة بخصوص عقد عمل' }), 201);
  const casesBefore = ok(await admin.get('/api/admin/cases')).total;
  const labBefore = ok(await admin.get('/api/admin/cases?area=LAB')).total;
  const r = await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'LAB', title: 'عقد عمل', client: { national_id: '12345' } });
  assert.equal(r.status, 400);
  assert.equal(ok(await admin.get('/api/admin/cases')).total, casesBefore);
  const d = ok(await admin.get(`/api/admin/intakes/${intake.id}`));
  assert.notEqual(d.intake.status, 'converted');
  assert.equal(d.intake.case_id, null);
  const ok2 = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'LAB', title: 'عقد عمل', client: { national_id: '29001011234567' } }), 201);
  assert.match(ok2.case.code, new RegExp(`^LAB-\\d{4}-${String(labBefore + 1).padStart(5, '0')}$`), 'the failed attempt does not burn a case number');
});
