// Lane B — Requirement 6: the lawyer requests information/documents through the platform.
// The request goes to admin first (pending) → admin approves (sent to the client via the org channel) or rejects →
// the client replies (portal or WhatsApp) → admin reviews and shares with the lawyer, who is notified.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, samplePdf, waPayload } from './helpers.js';
import {
  ok, createLawyer, newCase, assign, uniquePhone, phoneCore, notificationsOf, outbox, caseDetail, portalFor, postWebhook,
} from './lane-b-kit.test.js';

let t;
let admin;
let L; // lead
let M; // co-counsel on the same case
let lead;
let co;
let kase;
let leadAsg;
let coAsg;
let token;
const phone = uniquePhone();

function irOf(detail, id) {
  return detail.info_requests.find((r) => r.id === id);
}
async function lawyerIr(c, asgId, id) {
  const v = ok(await c.get(`/api/lawyer/assignments/${asgId}`));
  return v.info_requests.find((r) => r.id === id);
}
async function outboundFor(caseCode) {
  return (await outbox(admin)).filter((m) => m.case_code === caseCode);
}

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
  L = await createLawyer(admin, { name: 'ليلى المحامية', specialties: ['PRP'] });
  M = await createLawyer(admin, { name: 'مروان المشارك', specialties: ['PRP'] });
  lead = await t.login(L.username);
  co = await t.login(M.username);
  kase = await newCase(admin, {
    phone,
    clientName: 'حسن عبد الرازق',
    legal_area: 'PRP',
    title: 'نزاع إيجار محل تجاري',
    issues: ['مدى امتداد عقد الإيجار للورثة'],
    docs: ['old-lease.pdf'],
  });
  leadAsg = await assign(admin, kase.id, { lawyer_id: L.id, role: 'lead' });
  coAsg = await assign(admin, kase.id, { lawyer_id: M.id, role: 'co_counsel', grants: { facts: true, issue_ids: [], document_ids: [] } });
  token = await portalFor(admin, kase.clientId);
});

after(async () => {
  await t?.close();
});

let irDoc; // the document request that goes all the way through the portal
let irRejected;

test('a lawyer request goes to admin first: pending, staff notified, nothing is sent to the client', async () => {
  const before = (await outboundFor(kase.code)).length;
  const r = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, {
    kind: 'document',
    question: 'نحتاج صورة عقد الإيجار الأصلي الموقع من المورث LAWYERWORDING',
  }), 201);
  assert.equal(r.status, 'pending_admin');
  irDoc = r.id;

  const q = ok(await admin.get('/api/admin/queue'));
  assert.ok(q.info_requests.some((x) => x.id === irDoc && x.case_code === kase.code));
  const staffNotes = await notificationsOf(admin);
  assert.ok(staffNotes.some((n) => n.type === 'info_request.pending' && n.title.includes(kase.code)));
  assert.equal((await outboundFor(kase.code)).length, before, 'no message may reach the client before admin approval');

  const mine = await lawyerIr(lead, leadAsg.id, irDoc);
  assert.equal(mine.status, 'pending_admin');
  assert.equal(mine.own, true);
  assert.equal(mine.response_text, null);
  // the other team member does not see someone else's pending request
  const coView = ok(await co.get(`/api/lawyer/assignments/${coAsg.id}`));
  assert.equal(coView.info_requests.some((x) => x.id === irDoc), false);
  const list = ok(await admin.get(`/api/admin/cases?q=${kase.code}`));
  assert.ok(list.items[0].pending_actions >= 1);
});

test('admin rejects a request with a reason: the lawyer sees the reason and is notified; the client is never contacted', async () => {
  const before = (await outboundFor(kase.code)).length;
  irRejected = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, {
    kind: 'information', question: 'ما هو دخل العميل الشهري بالتفصيل؟',
  }), 201).id;
  const rej = ok(await admin.post(`/api/admin/info-requests/${irRejected}/reject`, { note: 'السؤال غير لازم للرأي القانوني' }));
  assert.equal(rej.status, 'rejected');
  const mine = await lawyerIr(lead, leadAsg.id, irRejected);
  assert.equal(mine.status, 'rejected');
  assert.equal(mine.admin_note, 'السؤال غير لازم للرأي القانوني');
  const notes = await notificationsOf(lead);
  assert.ok(notes.some((n) => n.type === 'info_request.rejected'));
  assert.equal((await outboundFor(kase.code)).length, before);
  // a decided request cannot be approved afterwards
  assert.equal((await admin.post(`/api/admin/info-requests/${irRejected}/approve`, { client_message: 'رسالة متأخرة' })).status, 409);
});

test('admin approves: the client receives the admin wording over the org WhatsApp channel (simulated); the lawyer is notified', async () => {
  const before = (await outboundFor(kase.code)).length;
  const approved = ok(await admin.post(`/api/admin/info-requests/${irDoc}/approve`, {
    client_message: 'برجاء إرسال صورة عقد إيجار المحل الأصلي',
  }));
  assert.equal(approved.status, 'sent_to_client');
  assert.equal(approved.sent_channel, 'whatsapp');
  const out = await outboundFor(kase.code);
  assert.equal(out.length, before + 1);
  const msg = out[0];
  assert.equal(msg.channel, 'whatsapp');
  assert.equal(msg.status, 'simulated', 'without WhatsApp credentials outbound messages are recorded as simulated');
  assert.ok(msg.to_address.endsWith(phoneCore(phone)));
  assert.ok(msg.body.includes('برجاء إرسال صورة عقد إيجار المحل الأصلي'));
  // v9.1 b-site (B91-10): صفحة المتابعة تعرض الطلب نظيفًا؛ نص واتساب وحده يضيف «صوّري الورقة وابعتيها هنا» ورابط صفحتها، بلا كود الملف
  assert.ok(!msg.body.includes(kase.code));
  // v9.1 fixes: الرابط لا يُحفظ أبدًا؛ {portal_link} يُستبدل برابط جديد عند الإرسال الفعلي فقط
  assert.match(msg.meta.wa_text, /صوّري الورقة وابعتيها هنا، أو من صفحتك: \{portal_link\}/);
  assert.ok(!JSON.stringify(msg).includes('/p/'), 'no bearer portal link stored in the message');
  assert.equal(msg.body.includes('LAWYERWORDING'), false, "the lawyer's internal wording is not sent verbatim");
  assert.equal(msg.meta.info_request_id, irDoc);
  const notes = await notificationsOf(lead);
  assert.ok(notes.some((n) => n.type === 'info_request.sent' && n.title.includes(kase.code)));
  assert.equal((await admin.post(`/api/admin/info-requests/${irDoc}/approve`, { client_message: 'مرة ثانية' })).status, 409);
  const mine = await lawyerIr(lead, leadAsg.id, irDoc);
  assert.equal(mine.status, 'sent_to_client');
  assert.equal(mine.response_text, null);
});

let replyDocId;
test('client replies on the portal with a document: admin reviews first, the lawyer sees nothing yet and cannot download it', async () => {
  const pub = t.client();
  const view = ok(await pub.get(`/api/portal/${token}`));
  const req = view.requests.find((r) => r.id === irDoc);
  assert.ok(req, 'the request is listed in the client portal');
  assert.equal(req.message, 'برجاء إرسال صورة عقد إيجار المحل الأصلي');
  assert.equal(req.can_reply, true);
  ok(await pub.post(`/api/portal/${token}/requests/${irDoc}/reply`, {
    body: 'مرفق صورة العقد، والعقد باسم والدي منذ 1998',
    documents: [samplePdf('lease-scan.pdf')],
  }));
  const d = await caseDetail(admin, kase.id);
  const ir = irOf(d, irDoc);
  assert.equal(ir.status, 'client_replied');
  assert.ok(ir.client_reply.includes('منذ 1998'));
  assert.equal(ir.documents.length, 1);
  replyDocId = ir.documents[0].id;
  assert.equal(ir.documents[0].uploaded_by_kind, 'client');
  const staffNotes = await notificationsOf(admin);
  assert.ok(staffNotes.some((n) => n.type === 'info_request.replied'));
  const q = ok(await admin.get('/api/admin/queue'));
  assert.ok(q.client_replies.some((x) => x.id === irDoc));

  const mine = await lawyerIr(lead, leadAsg.id, irDoc);
  assert.equal(mine.status, 'client_replied');
  assert.equal(mine.response_text, null, 'raw client reply must not reach the lawyer before admin review');
  assert.deepEqual(mine.documents, []);
  const v = ok(await lead.get(`/api/lawyer/assignments/${leadAsg.id}`));
  assert.equal(JSON.stringify(v).includes('منذ 1998'), false);
  assert.equal((await lead.get(`/api/documents/${replyDocId}/download`)).status, 404);
});

test('admin shares the reviewed reply: the lawyer is notified, sees the response and can download the shared document', async () => {
  const shared = ok(await admin.post(`/api/admin/info-requests/${irDoc}/share`, {
    response_text: 'أرسل العميل صورة عقد الإيجار المحرر عام 1998 باسم المورث.',
    document_ids: [replyDocId],
  }));
  assert.equal(shared.status, 'shared');
  const mine = await lawyerIr(lead, leadAsg.id, irDoc);
  assert.equal(mine.status, 'shared');
  assert.equal(mine.response_text, 'أرسل العميل صورة عقد الإيجار المحرر عام 1998 باسم المورث.');
  assert.deepEqual(mine.documents.map((x) => x.id), [replyDocId]);
  const v = ok(await lead.get(`/api/lawyer/assignments/${leadAsg.id}`));
  assert.ok(v.documents.some((x) => x.id === replyDocId), 'shared document joins the lawyer documents');
  assert.equal((await lead.get(`/api/documents/${replyDocId}/download`)).status, 200);
  const notes = await notificationsOf(lead);
  // v9.1 l-work (L-12): الإشعار يفتح قسم «الطلبات» في صفحة الإسناد مباشرة
  assert.ok(notes.some((n) => n.type === 'info_request.shared' && n.link === `#/my/assignments/${leadAsg.id}?tab=requests`));
  // co-counsel was not part of this share
  const coView = ok(await co.get(`/api/lawyer/assignments/${coAsg.id}`));
  assert.equal(coView.info_requests.some((x) => x.id === irDoc), false);
  assert.equal((await co.get(`/api/documents/${replyDocId}/download`)).status, 404);
  // a shared request no longer accepts portal replies
  const late = await t.client().post(`/api/portal/${token}/requests/${irDoc}/reply`, { body: 'رد متأخر بعد الإتاحة' });
  assert.equal(late.status, 409);
});

test("another client's portal token cannot see or answer this request (404)", async () => {
  const other = await newCase(admin, { clientName: 'عميل آخر', title: 'ملف عميل آخر' });
  const otherToken = await portalFor(admin, other.clientId);
  const ir = ok(await admin.post(`/api/admin/cases/${kase.id}/info-requests`, {
    kind: 'information', question: 'هل يوجد ورثة آخرون غير المذكورين؟', client_message: 'هل يوجد ورثة آخرون؟',
  }));
  assert.equal(ir.status, 'sent_to_client', 'staff-created requests are sent immediately');
  const otherView = ok(await t.client().get(`/api/portal/${otherToken}`));
  assert.equal(otherView.requests.some((r) => r.id === ir.id), false);
  const r = await t.client().post(`/api/portal/${otherToken}/requests/${ir.id}/reply`, { body: 'محاولة رد من عميل آخر' });
  assert.equal(r.status, 404);
  assert.equal(irOf(await caseDetail(admin, kase.id), ir.id).status, 'sent_to_client');
  assert.equal((await t.client().get('/api/portal/not-a-real-token-but-long-enough')).status, 404);
});

test('WhatsApp reply path: client answers on WhatsApp, admin records it from the conversation and shares it with two team members', async () => {
  const id = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, {
    kind: 'information', question: 'هل سدد المورث الأجرة حتى الوفاة؟',
  }), 201).id;
  ok(await admin.post(`/api/admin/info-requests/${id}/approve`, { client_message: 'هل كان والدكم يسدد الأجرة بانتظام حتى الوفاة؟' }));
  const wamid = `wamid.LANEB.${Date.now()}`;
  const payload = waPayload({ from: `20${phone.slice(1)}`, name: 'حسن', text: 'نعم كان يسدد الأجرة بانتظام وعندي الإيصالات', id: wamid });
  ok(await postWebhook(t, payload));
  ok(await postWebhook(t, payload)); // Meta redelivery of the same message id
  let d = await caseDetail(admin, kase.id);
  const inbound = d.messages.filter((m) => m.direction === 'in' && m.body.includes('عندي الإيصالات'));
  assert.equal(inbound.length, 1, 'the WhatsApp reply is attached to the open case exactly once');
  assert.ok((await notificationsOf(admin)).some((n) => n.type === 'case.client_message' && n.title.includes(kase.code)));
  // the lawyer still cannot see the raw reply
  assert.equal(JSON.stringify(ok(await lead.get(`/api/lawyer/assignments/${leadAsg.id}`))).includes('عندي الإيصالات'), false);

  const rec = ok(await admin.post(`/api/admin/info-requests/${id}/record-reply`, { message_ids: [inbound[0].id] }));
  assert.equal(rec.status, 'client_replied');
  assert.ok(rec.client_reply.includes('عندي الإيصالات'));
  ok(await admin.post(`/api/admin/info-requests/${id}/share`, {
    response_text: 'أفاد العميل بانتظام سداد الأجرة حتى الوفاة وبحوزته الإيصالات.',
    share_with_assignment_ids: [coAsg.id],
  }));
  const mine = await lawyerIr(lead, leadAsg.id, id);
  assert.equal(mine.status, 'shared');
  const theirs = await lawyerIr(co, coAsg.id, id);
  assert.ok(theirs, 'explicitly shared with the co-counsel');
  assert.equal(theirs.own, false);
  assert.equal(theirs.response_text, 'أفاد العميل بانتظام سداد الأجرة حتى الوفاة وبحوزته الإيصالات.');
  assert.ok((await notificationsOf(co)).some((n) => n.type === 'info_request.shared'));
  // recording a message that belongs to a different client is refused
  const other = await newCase(admin, { clientName: 'عميل ثالث', title: 'ملف ثالث' });
  const otherDetail = await caseDetail(admin, other.id);
  const otherMsg = otherDetail.messages.find((m) => m.direction === 'in');
  const id2 = ok(await admin.post(`/api/admin/cases/${kase.id}/info-requests`, { kind: 'information', question: 'سؤال إضافي للعميل', client_message: 'سؤال إضافي' })).id;
  assert.equal((await admin.post(`/api/admin/info-requests/${id2}/record-reply`, { message_ids: [otherMsg.id] })).status, 400);
  d = await caseDetail(admin, kase.id);
  assert.equal(irOf(d, id2).status, 'sent_to_client');
});

test('a lawyer can cancel only their own still-pending request', async () => {
  const id = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, { kind: 'information', question: 'سؤال سألغيه قبل البت فيه' }), 201).id;
  const byOther = await co.post(`/api/lawyer/info-requests/${id}/cancel`);
  assert.ok(byOther.status >= 400 && byOther.status < 500, 'another lawyer cannot cancel it');
  assert.equal(irOf(await caseDetail(admin, kase.id), id).status, 'pending_admin');
  const c = ok(await lead.post(`/api/lawyer/info-requests/${id}/cancel`));
  assert.equal(c.status, 'cancelled');
  const q = ok(await admin.get('/api/admin/queue'));
  assert.equal(q.info_requests.some((x) => x.id === id), false);
  // after admin approval the lawyer can no longer cancel
  const id2 = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, { kind: 'information', question: 'سؤال سيوافق عليه المدير' }), 201).id;
  ok(await admin.post(`/api/admin/info-requests/${id2}/approve`, { client_message: 'سؤال للعميل' }));
  assert.equal((await lead.post(`/api/lawyer/info-requests/${id2}/cancel`)).status, 409);
  // validation: too-short questions and unknown kinds are rejected
  assert.equal((await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, { kind: 'information', question: 'قصير' })).status, 400);
  assert.equal((await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, { kind: 'gossip', question: 'سؤال بنوع غير معروف' })).status, 400);
});

test('lawyers cannot approve, reject or share requests themselves (403)', async () => {
  const id = ok(await lead.post(`/api/lawyer/assignments/${leadAsg.id}/info-requests`, { kind: 'document', question: 'صورة بطاقة الرقم القومي للورثة' }), 201).id;
  assert.equal((await lead.post(`/api/admin/info-requests/${id}/approve`, { client_message: 'أرسل البطاقة' })).status, 403);
  assert.equal((await lead.post(`/api/admin/info-requests/${id}/share`, { response_text: 'تم' })).status, 403);
  assert.equal((await lead.post(`/api/admin/info-requests/${id}/reject`, { note: 'لا' })).status, 403);
  assert.equal((await lead.post(`/api/admin/cases/${kase.id}/messages`, { body: 'رسالة مباشرة للعميل' })).status, 403);
  assert.equal(irOf(await caseDetail(admin, kase.id), id).status, 'pending_admin');
});
