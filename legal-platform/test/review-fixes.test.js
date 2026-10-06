// Regression tests for the business-logic findings of the adversarial review.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, resetClock } from './helpers.js';
import { ok, createLawyer, newCase, assign, lawyerSubmits, approveOpinion, submitAndApprove, notificationsOf, runAutomations, plusDays, samplePdf } from './lane-b-kit.test.js';
import { periodOf, nowIso } from '../src/util.js';

let t;
let admin;

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
});

after(async () => {
  resetClock();
  await t?.close();
});

test('withdrawing the requester does not orphan an info request already sent to the client', async () => {
  const A = await createLawyer(admin, { name: 'محامٍ أول' });
  const B = await createLawyer(admin, { name: 'محامٍ بديل' });
  const cA = await t.login(A.username);
  const c = await newCase(admin, {});
  const a = await assign(admin, c.id, { lawyer_id: A.id, role: 'lead' });
  ok(await cA.post(`/api/lawyer/assignments/${a.id}/open`));
  const ir = ok(await cA.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', question: 'صورة عقد الإيجار' }), 201);
  ok(await admin.post(`/api/admin/info-requests/${ir.id}/approve`, { client_message: 'برجاء إرسال صورة عقد الإيجار' }));
  ok(await admin.post(`/api/admin/assignments/${a.id}/withdraw`, { note: 'استبدال' }));
  const b = await assign(admin, c.id, { lawyer_id: B.id, role: 'lead' });
  ok(await admin.post(`/api/admin/info-requests/${ir.id}/record-reply`, { reply_text: 'أرسل العميل العقد' }));
  // with no target picked the staff get a clear message instead of a silent success
  const none = await admin.post(`/api/admin/info-requests/${ir.id}/share`, { response_text: 'العقد مرفق' });
  assert.equal(none.status, 400);
  const shared = ok(await admin.post(`/api/admin/info-requests/${ir.id}/share`, { response_text: 'العقد مرفق', share_with_assignment_ids: [b.id] }));
  assert.equal(shared.status, 'shared');
  const cB = await t.login(B.username);
  const view = ok(await cB.get(`/api/lawyer/assignments/${b.id}`));
  assert.ok(JSON.stringify(view).includes('العقد مرفق'), 'the replacement lawyer sees the shared reply');
});

test('queue client replies carry their attachments; a staff request with a team needs a chosen member', async () => {
  const L = await createLawyer(admin, {});
  const c = await newCase(admin, {});
  await assign(admin, c.id, { lawyer_id: L.id, role: 'lead' });
  const ir = ok(await admin.post(`/api/admin/cases/${c.id}/info-requests`, { kind: 'document', question: 'صورة البطاقة' }));
  ok(await admin.post(`/api/admin/info-requests/${ir.id}/record-reply`, { reply_text: 'وصلت الصورة', document_ids: [] }));
  const doc = ok(await admin.post(`/api/admin/cases/${c.id}/documents`, { files: [samplePdf('بطاقة.pdf')] }))[0];
  t.app.db.run('UPDATE documents SET info_request_id = ? WHERE id = ?', ir.id, doc.id);
  const q = ok(await admin.get('/api/admin/queue'));
  const row = q.client_replies.find((r) => r.id === ir.id);
  assert.deepEqual(row.document_ids, [doc.id]);
  assert.equal(row.documents[0].filename, 'بطاقة.pdf');
  assert.equal((await admin.post(`/api/admin/info-requests/${ir.id}/share`, { response_text: 'الصورة مرفقة', document_ids: row.document_ids })).status, 400);
});

test('reopened case: an approved member can be re-engaged and the status leaves "answered" while work is in flight', async () => {
  const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 500 } });
  const cL = await t.login(L.username);
  const c = await newCase(admin, {});
  const a = await assign(admin, c.id, { lawyer_id: L.id, role: 'lead' });
  await submitAndApprove(admin, cL, a.id);
  const ans = ok(await admin.post(`/api/admin/cases/${c.id}/client-answers`, { body: 'الرد على العميل' }));
  ok(await admin.post(`/api/admin/client-answers/${ans.id}/send`, {}));
  ok(await admin.post(`/api/admin/cases/${c.id}/close`, { outcome: 'answered' }));
  ok(await admin.post(`/api/admin/cases/${c.id}/reopen`, {}));
  assert.equal((await admin.post(`/api/admin/assignments/${a.id}/reengage`, { brief: 'متابعة سؤال العميل الجديد' })).status, 200);
  let d = ok(await admin.get(`/api/admin/cases/${c.id}`));
  assert.equal(d.case.status, 'in_progress');
  const v = ok(await cL.get(`/api/lawyer/assignments/${a.id}`));
  assert.equal(v.assignment.status, 'returned');
  ok(await cL.put(`/api/lawyer/assignments/${a.id}/draft`, { body: 'رأي المتابعة بعد إعادة فتح الملف: يجوز للعميل ...' }));
  const s = ok(await cL.post(`/api/lawyer/assignments/${a.id}/submit`, {}));
  d = ok(await admin.get(`/api/admin/cases/${c.id}`));
  assert.equal(d.case.status, 'under_review');
  await approveOpinion(admin, s.id);
  // billed once per assignment
  assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM billable_events WHERE assignment_id = ?', a.id)), 1);
  assert.equal((await admin.post(`/api/admin/assignments/${a.id}/reengage`, {})).status, 200);
});

test('after the lead is withdrawn the case needs a new lead, even if a specialist was approved', async () => {
  const L = await createLawyer(admin, {});
  const S = await createLawyer(admin, { specialties: ['TAX'] });
  const cL = await t.login(L.username);
  const cS = await t.login(S.username);
  const c = await newCase(admin, {});
  const a = await assign(admin, c.id, { lawyer_id: L.id, role: 'lead' });
  ok(await cL.post(`/api/lawyer/assignments/${a.id}/open`));
  const cr = ok(await cL.post(`/api/lawyer/assignments/${a.id}/counsel-requests`, { kind: 'specialist_input', specialty: 'TAX', description: 'رأي ضريبي في التصرف' }), 201);
  const sa = ok(await admin.post(`/api/admin/counsel-requests/${cr.id}/assign`, { lawyer_id: S.id }));
  const sId = sa.assignment?.id ?? sa.id;
  await submitAndApprove(admin, cS, sId);
  ok(await admin.post(`/api/admin/assignments/${a.id}/withdraw`, {}));
  const d = ok(await admin.get(`/api/admin/cases/${c.id}`));
  assert.equal(d.case.status, 'new');
  const q = ok(await admin.get('/api/admin/queue'));
  assert.equal((q.approved_unanswered || []).some((x) => x.id === c.id), false);
});

test('closing a case notifies members still working and cancels the counsel request they were serving', async () => {
  const L = await createLawyer(admin, {});
  const S = await createLawyer(admin, { specialties: ['TAX'] });
  const cL = await t.login(L.username);
  const cS = await t.login(S.username);
  const c = await newCase(admin, {});
  const a = await assign(admin, c.id, { lawyer_id: L.id, role: 'lead' });
  ok(await cL.post(`/api/lawyer/assignments/${a.id}/open`));
  const cr = ok(await cL.post(`/api/lawyer/assignments/${a.id}/counsel-requests`, { kind: 'specialist_input', specialty: 'TAX', description: 'رأي ضريبي في التصرف' }), 201);
  ok(await admin.post(`/api/admin/counsel-requests/${cr.id}/assign`, { lawyer_id: S.id }));
  ok(await admin.post(`/api/admin/cases/${c.id}/close`, { outcome: 'answered' }));
  assert.equal(t.app.db.get('SELECT status FROM counsel_requests WHERE id = ?', cr.id).status, 'cancelled');
  assert.ok((await notificationsOf(cS)).some((n) => n.type === 'assignment.withdrawn' && n.title.includes(c.code)));
  assert.ok((await notificationsOf(cL)).some((n) => n.type === 'assignment.withdrawn' && n.title.includes(c.code)));
});

test('monthly fees stop after deactivation and are prorated when leaving a monthly agreement', async () => {
  const current = periodOf(nowIso());
  const M = await createLawyer(admin, { agreement: { type: 'monthly', monthly_fee: 3000 } });
  t.app.db.run("UPDATE users SET created_at = '2025-01-01T00:00:00.000Z' WHERE id = ?", M.id);
  ok(await admin.patch(`/api/admin/lawyers/${M.id}`, { active: false }));
  const u = t.app.db.get('SELECT deactivated_at FROM users WHERE id = ?', M.id);
  assert.ok(u.deactivated_at, 'deactivation is time-stamped');
  // the month the lawyer actually worked can still be closed after deactivation
  const r1 = ok(await admin.post('/api/admin/accounting/close-month', { period: current }));
  assert.equal(r1.created.some((x) => x.lawyer_id === M.id), true);
  // a period that starts after the deactivation accrues nothing and is not flagged as needing closing
  t.app.db.run("UPDATE users SET deactivated_at = '2025-06-10T00:00:00.000Z' WHERE id = ?", M.id);
  const r2 = ok(await admin.post('/api/admin/accounting/close-month', { period: '2025-08' }));
  assert.equal(r2.created.some((x) => x.lawyer_id === M.id), false);
  const sum = ok(await admin.get('/api/admin/accounting/summary?period=2025-09'));
  const row = (sum.lawyers || sum.rows).find((x) => x.lawyer_id === M.id);
  assert.equal(row.needs_month_closing, false);
  // reactivation clears the stamp
  ok(await admin.patch(`/api/admin/lawyers/${M.id}`, { active: true }));
  assert.equal(t.app.db.get('SELECT deactivated_at FROM users WHERE id = ?', M.id).deactivated_at, null);

  const N = await createLawyer(admin, { agreement: { type: 'monthly', monthly_fee: 3000 } });
  t.app.db.run("UPDATE users SET created_at = '2025-01-01T00:00:00.000Z' WHERE id = ?", N.id);
  ok(await admin.patch(`/api/admin/lawyers/${N.id}`, { agreement: { type: 'per_case', rate: 400 } }));
  const partial = t.app.db.get("SELECT * FROM ledger_entries WHERE lawyer_id = ? AND kind = 'monthly_fee'", N.id);
  assert.ok(partial, 'a partial monthly fee is issued when leaving the monthly agreement');
  assert.equal(partial.dedupe_key, `monthly:${N.id}:${current}`);
  assert.ok(partial.amount_minor > 0 && partial.amount_minor <= 300000);
  // closing the month later does not add a second fee
  const r3 = ok(await admin.post('/api/admin/accounting/close-month', { period: current }));
  assert.equal(r3.created.some((x) => x.lawyer_id === N.id), false);
});

test('on-close work is billed at closing even if the agreement trigger changed meanwhile', async () => {
  const L = await createLawyer(admin, { agreement: { type: 'per_case', rate: 450, billable_event: 'on_close' } });
  const cL = await t.login(L.username);
  const c = await newCase(admin, {});
  const a = await assign(admin, c.id, { lawyer_id: L.id, role: 'lead' });
  await submitAndApprove(admin, cL, a.id);
  assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM billable_events WHERE assignment_id = ?', a.id)), 0);
  ok(await admin.patch(`/api/admin/lawyers/${L.id}`, { agreement: { type: 'per_case', rate: 450, billable_event: 'on_approval' } }));
  ok(await admin.post(`/api/admin/cases/${c.id}/close`, { outcome: 'answered' }));
  assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM billable_events WHERE assignment_id = ?', a.id)), 1);
});

test('matter: client attachments and case uploads need explicit sharing; reassignment moves open tasks', async () => {
  const L = await createLawyer(admin, {});
  const L2 = await createLawyer(admin, {});
  const cL = await t.login(L.username);
  const cL2 = await t.login(L2.username);
  const c = await newCase(admin, {});
  const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', responsible_lawyer_id: L.id, court: 'محكمة الجيزة', lawsuit_number: '1874', lawsuit_year: '2026' }), 201);
  // a staff upload on the consultation case does not reach the matter lawyer
  const caseDoc = ok(await admin.post(`/api/admin/cases/${c.id}/documents`, { files: [samplePdf('داخلي.pdf')] }))[0];
  let lv = ok(await cL.get(`/api/lawyer/matters/${m.id}`));
  assert.equal(lv.documents.some((d) => d.id === caseDoc.id), false);
  assert.equal((await cL.get(`/api/documents/${caseDoc.id}/download`)).status, 404);
  // explicit share, then unshare
  ok(await admin.patch(`/api/admin/documents/${caseDoc.id}`, { matter_id: m.id }));
  lv = ok(await cL.get(`/api/lawyer/matters/${m.id}`));
  assert.equal(lv.documents.some((d) => d.id === caseDoc.id), true);
  ok(await admin.patch(`/api/admin/documents/${caseDoc.id}`, { matter_id: null }));
  assert.equal((await cL.get(`/api/documents/${caseDoc.id}/download`)).status, 404);
  // a matter upload is visible to the responsible lawyer
  const md = ok(await admin.post(`/api/admin/matters/${m.id}/documents`, { files: [samplePdf('صحيفة.pdf')] }))[0];
  assert.equal((await cL.get(`/api/documents/${md.id}/download`)).status, 200);
  // lawsuit year is in the lawyer's list
  const list = ok(await cL.get('/api/lawyer/matters'));
  const items = Array.isArray(list) ? list : list.items;
  assert.equal(items.find((x) => x.id === m.id).lawsuit_year, '2026');
  // reassigning moves the old lawyer's open tasks and stops their deadline notices
  const task = ok(await cL.post(`/api/lawyer/matters/${m.id}/tasks`, { title: 'تقديم مذكرة', due_at: plusDays(nowIso(), 1), procedural: true }));
  ok(await admin.patch(`/api/admin/matters/${m.id}`, { responsible_lawyer_id: L2.id }));
  assert.equal(t.app.db.get('SELECT assignee_user_id FROM matter_tasks WHERE id = ?', task.id).assignee_user_id, L2.id);
  await runAutomations(admin);
  assert.equal((await notificationsOf(cL)).some((n) => n.type === 'deadline'), false);
  assert.ok((await notificationsOf(cL2)).some((n) => n.type === 'deadline'));
  assert.equal((await admin.patch(`/api/admin/matter-tasks/${task.id}`, { assignee_user_id: L.id })).status, 400);
});

test('matter fees tab is not capped by the global ledger window', async () => {
  const L = await createLawyer(admin, {});
  const c = await newCase(admin, {});
  const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', responsible_lawyer_id: L.id }), 201);
  ok(await admin.post(`/api/admin/matters/${m.id}/lawyer-fees`, { lawyer_id: L.id, amount: 100, description: 'أتعاب أول جلسة' }).catch(() => null));
  const other = await createLawyer(admin, {});
  for (let i = 0; i < 320; i++) {
    t.app.db.insert('ledger_entries', { lawyer_id: other.id, kind: 'adjustment', amount_minor: 100, period: periodOf(nowIso()), description: `قيد ${i}`, status: 'accrued', created_at: nowIso() });
  }
  t.app.db.insert('ledger_entries', { lawyer_id: L.id, kind: 'matter_fee', amount_minor: 5000, matter_id: m.id, case_id: c.id, period: '2020-01', description: 'قيد قديم للملف', status: 'accrued', created_at: '2020-01-05T10:00:00.000Z' });
  for (let i = 0; i < 320; i++) {
    t.app.db.insert('ledger_entries', { lawyer_id: other.id, kind: 'adjustment', amount_minor: 100, period: periodOf(nowIso()), description: `قيد لاحق ${i}`, status: 'accrued', created_at: nowIso() });
  }
  const d = ok(await admin.get(`/api/admin/matters/${m.id}`));
  assert.ok(d.lawyer_fees.some((e) => e.description === 'قيد قديم للملف'));
  const one = ok(await admin.get(`/api/admin/accounting/ledger?lawyer_id=${other.id}`));
  assert.equal(one.length, 640, 'a single lawyer ledger is complete');
});

test('automation params reject 0 instead of silently using the default', async () => {
  assert.equal((await admin.patch('/api/admin/automations/invoice_reminder', { params: { max_reminders: 0 } })).status, 400);
  assert.equal(ok(await admin.patch('/api/admin/automations/invoice_reminder', { params: { max_reminders: 1 } })).params.max_reminders, 1);
});

test('AI feedback from automatic decisions is not double counted; archived intakes must be reopened before converting', async () => {
  const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01099988877', name: 'عميل', text: 'والدي توفي وعايز أعرف نصيبي في الميراث والشقة والأرض' }), 201);
  await admin.post(`/api/admin/intakes/${intake.id}/analyze`, {});
  ok(await admin.post(`/api/admin/intakes/${intake.id}/handle-internally`, { resolution_note: 'تم الرد', legal_area: 'INH' }));
  assert.equal((await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ميراث' })).status, 409, 'must reopen first');
  assert.equal((await admin.patch(`/api/admin/intakes/${intake.id}`, { status: 'in_review' })).status, 409, 'no silent reopen by PATCH');
  ok(await admin.post(`/api/admin/intakes/${intake.id}/reopen`, {}));
  ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'FAM', title: 'ميراث' }), 201);
  const n = Number(t.app.db.value("SELECT COUNT(*) FROM ai_feedback WHERE entity_type = 'intake' AND entity_id = ? AND field = 'legal_area'", intake.id));
  assert.equal(n, 1);
  assert.equal(t.app.db.get("SELECT final_value FROM ai_feedback WHERE entity_type = 'intake' AND entity_id = ? AND field = 'legal_area'", intake.id).final_value, 'FAM');
});

test('portal: a replied request is no longer awaiting a reply', async () => {
  const c = await newCase(admin, {});
  const ir = ok(await admin.post(`/api/admin/cases/${c.id}/info-requests`, { kind: 'information', question: 'ما تاريخ الوفاة؟' }));
  const link = ok(await admin.post(`/api/admin/clients/${c.clientId}/portal-link`, {}));
  const token = link.url.split('/p/')[1];
  let p = ok(await t.client().get(`/api/portal/${token}`));
  assert.equal(p.requests.find((r) => r.id === ir.id).can_reply, true);
  ok(await t.client().post(`/api/portal/${token}/requests/${ir.id}/reply`, { body: 'توفي في مارس الماضي' }));
  p = ok(await t.client().get(`/api/portal/${token}`));
  const r = p.requests.find((x) => x.id === ir.id);
  assert.equal(r.status, 'client_replied');
  assert.equal(r.can_reply, false);
});

test('uploads: the stored extension always matches the verified type and disguised content is refused', async () => {
  const c = await newCase(admin, {});
  const fakePdf = { filename: 'invoice.pdf', mime: 'application/pdf', data_base64: Buffer.from('<html><script>alert(1)</script></html>').toString('base64') };
  assert.equal((await admin.post(`/api/admin/cases/${c.id}/documents`, { files: [fakePdf] })).status, 400);
  const exeAsPng = { filename: 'scan.pdf.exe', mime: 'image/png', data_base64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64') };
  const saved = ok(await admin.post(`/api/admin/cases/${c.id}/documents`, { files: [exeAsPng] }))[0];
  assert.equal(saved.filename, 'scan.pdf.png');
  assert.equal(saved.mime, 'image/png');
  const dl = await admin.get(`/api/documents/${saved.id}/download`);
  assert.match(dl.headers.get('content-disposition'), /filename="document\.png"/);
});
