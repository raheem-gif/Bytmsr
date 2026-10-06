// Lane B — Requirement 7 (+ the billing part of 10): the INH-2026-00482 story end to end through the API,
// built from scratch: Facebook-ad WhatsApp message → case INH-YYYY-NNNNN → lead counsel → "Request Counsel
// Assistance" (tax specialist on issue #3) → admin picks the specialist and grants ONLY facts + issue #3 + two
// documents → the specialist sees exactly that → submits → the lead (and admin) see the specialist opinion →
// a pro-bono senior reviewer → everyone billed independently.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';
import {
  ok, createLawyer, assign, postWebhook, notificationsOf, caseDetail, assertNoLeak, LAWYER_FORBIDDEN_KEYS,
} from './lane-b-kit.test.js';

const CLIENT = 'سامية محمود عبد الحميد';
const PHONE_WA = '201012345678';
const NATIONAL_ID = '28505051234567';
const ISSUES = [
  'تحديد الورثة وأنصبتهم ومدى استحقاق ابني الابن المتوفى للوصية الواجبة',
  'حماية حقوق القاصرين والولاية على أموالهم عند القسمة أو البيع',
  'الأثر الضريبي لانتقال الشقة بالميراث ثم بيعها',
  'امتناع الأخ الأكبر عن القسمة ووضع يده على المحل',
];
const SPECIALIST_OPINION = 'بشأن المسألة رقم 3: انتقال الملكية بالميراث لا يخضع لضريبة التصرفات العقارية، وعند البيع تستحق ضريبة 2.5% من قيمة التصرف.';

let t;
let admin;
let ahmed;
let mohamed;
let salwa;
let hany;
let cAhmed;
let cMohamed;
let cSalwa;
let cHany;
let kase;
let issueByNo;
let docs; // { death, flat, shop }
let leadAsg;
let specAsg;
let counselId;

function cairoYear() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(new Date());
}

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
  ahmed = await createLawyer(admin, { username: 'ahmed', name: 'أحمد عبد العظيم', specialties: ['INH', 'FAM'], agreement: { type: 'per_case', rate: 500, billable_event: 'on_approval' } });
  mohamed = await createLawyer(admin, { username: 'mohamed', name: 'محمد فؤاد', specialties: ['TAX', 'COM'], agreement: { type: 'per_case', rate: 500 } });
  salwa = await createLawyer(admin, { username: 'salwa', name: 'سلوى الشريف', title: 'د.', specialties: ['INH'], agreement: { type: 'pro_bono', notional_value: 600 } });
  hany = await createLawyer(admin, { username: 'hany', name: 'هاني رمزي', specialties: ['TAX'], agreement: { type: 'per_case', rate: 400 } });
  cAhmed = await t.login('ahmed');
  cMohamed = await t.login('mohamed');
  cSalwa = await t.login('salwa');
  cHany = await t.login('hany');

  // Door 1: a Click-to-WhatsApp Facebook ad
  ok(await postWebhook(t, waPayload({
    from: PHONE_WA,
    name: CLIENT,
    text: 'السلام عليكم، والدي اتوفى وساب شقة في المعادي ومحل، وأخويا الكبير رافض القسمة، وفي ضريبة لو بعنا الشقة؟',
    referral: { source_type: 'ad', source_url: 'https://fb.me/inheritance-ad', source_id: 'AD-77', headline: 'هل لك حق في ميراث؟' },
  })));
  const inbox = ok(await admin.get('/api/admin/intakes?q=1012345678'));
  assert.equal(inbox.items.length, 1);
  const intake = inbox.items[0];
  assert.equal(intake.source, 'facebook_ad');
  assert.equal(intake.first_channel, 'whatsapp');

  const conv = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, {
    legal_area: 'INH',
    title: 'نزاع بشأن تركة تتضمن عقارًا ومحلًا وحقوق قاصرين',
    facts_shared: 'توفي المورث منذ عام ونصف وترك شقة بالمعادي ومحلًا تجاريًا. الورثة ثلاثة أبناء وابنا ابن متوفى قاصران. يفكر الورثة في بيع الشقة.',
    facts_internal: 'جاءت العميلة من إعلان فيسبوك عن المواريث.',
    issues: ISSUES.map((title) => ({ title })),
    priority: 'high',
    client: { name: CLIENT, national_id: NATIONAL_ID },
  }), 201).case;
  const up = ok(await admin.post(`/api/admin/cases/${conv.id}/documents`, {
    files: [
      { filename: 'شهادة_الوفاة.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF death certificate').toString('base64') },
      { filename: 'عقد_شراء_شقة_المعادي.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF flat contract').toString('base64') },
      { filename: 'عقد_إيجار_المحل.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF shop lease').toString('base64') },
    ],
  }));
  docs = { death: up[0], flat: up[1], shop: up[2] };
  const d = await caseDetail(admin, conv.id);
  kase = { id: conv.id, code: conv.code, clientCode: d.client.code };
  issueByNo = Object.fromEntries(d.issues.map((i) => [i.number, i]));
});

after(async () => {
  await t?.close();
});

test('the case gets an independent code AREA-YEAR-NNNNN and the client an independent CL-NNNNN id', async () => {
  assert.match(kase.code, new RegExp(`^INH-${cairoYear()}-\\d{5}$`));
  assert.match(kase.clientCode, /^CL-\d{5}$/);
  assert.deepEqual(Object.keys(issueByNo).map(Number), [1, 2, 3, 4]);
  assert.equal(issueByNo[3].title, ISSUES[2]);
});

test('lead counsel is assigned and requests a tax specialist for issue #3 only — the request goes to admin, nobody else gets access', async () => {
  leadAsg = await assign(admin, kase.id, { lawyer_id: ahmed.id, role: 'lead', brief: 'دراسة المسائل الأربع' });
  const lv = ok(await cAhmed.post(`/api/lawyer/assignments/${leadAsg.id}/open`));
  assert.equal(lv.issues.length, 4, 'lead gets all issues by default');
  assert.equal(lv.documents.length, 3);

  const r = ok(await cAhmed.post(`/api/lawyer/assignments/${leadAsg.id}/counsel-requests`, {
    kind: 'specialist_input',
    specialty: 'TAX',
    issue_ids: [issueByNo[3].id],
    document_ids: [docs.death.id, docs.flat.id],
    description: 'أطلب رأي متخصص في الأثر الضريبي لانتقال الشقة، وبالأخص المسألة رقم 3.',
  }), 201);
  assert.equal(r.status, 'pending_admin');
  counselId = r.id;

  // nothing was opened automatically
  const d = await caseDetail(admin, kase.id);
  assert.equal(d.assignments.length, 1, 'no assignment is created until admin decides');
  for (const c of [cMohamed, cHany, cSalwa]) {
    assert.deepEqual(ok(await c.get('/api/lawyer/assignments')), []);
    assert.equal((await c.get(`/api/documents/${docs.death.id}/download`)).status, 404);
  }
  const q = ok(await admin.get('/api/admin/queue'));
  const item = q.counsel_requests.find((x) => x.id === counselId);
  assert.ok(item);
  assert.equal(item.specialty, 'TAX');
  assert.deepEqual(item.issue_ids, [issueByNo[3].id]);
  assert.deepEqual(item.document_ids, [docs.death.id, docs.flat.id]);
  assert.ok((await notificationsOf(admin)).some((n) => n.type === 'counsel_request.pending' && n.title.includes(kase.code)));
  const mine = ok(await cAhmed.get(`/api/lawyer/assignments/${leadAsg.id}`)).counsel_requests;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, 'pending_admin');
  assert.equal(mine[0].assigned_lawyer, null);
});

test('the lead cannot pick the specialist or open the file to a colleague by himself (403)', async () => {
  const r = await cAhmed.post(`/api/admin/counsel-requests/${counselId}/assign`, { lawyer_id: hany.id, grants: { facts: true } });
  assert.equal(r.status, 403);
  const r2 = await cAhmed.post(`/api/admin/cases/${kase.id}/assignments`, { lawyer_id: hany.id, role: 'co_counsel' });
  assert.equal(r2.status, 403);
  assert.deepEqual(ok(await cHany.get('/api/lawyer/assignments')), []);
});

test('admin sees TAX specialists suggested (the lead excluded) and assigns the specialist with only facts + issue #3 + two documents', async () => {
  const s = ok(await admin.get(`/api/admin/cases/${kase.id}/suggest-lawyers?area=TAX`));
  const ids = s.items.map((x) => x.id);
  assert.ok(ids.includes(mohamed.id));
  assert.equal(ids.includes(ahmed.id), false, 'current team members are not suggested again');
  assert.equal(s.items.find((x) => x.id === mohamed.id).specialty_match, true);

  const res = ok(await admin.post(`/api/admin/counsel-requests/${counselId}/assign`, {
    lawyer_id: mohamed.id,
    fee_mode: 'custom',
    fee_amount: 250,
    brief: 'رأي متخصص في الأثر الضريبي (المسألة رقم 3 فقط).',
    grants: { facts: true, issue_ids: [issueByNo[3].id], document_ids: [docs.death.id, docs.flat.id] },
  }));
  assert.equal(res.request.status, 'assigned');
  assert.equal(res.assignment.role, 'specialist');
  assert.equal(res.assignment.lawyer_id, mohamed.id);
  specAsg = res.assignment;
  assert.ok((await notificationsOf(cMohamed)).some((n) => n.type === 'assignment.new' && n.title.includes(kase.code)));
  assert.ok((await notificationsOf(cAhmed)).some((n) => n.type === 'counsel_request.assigned'));
  assert.equal((await admin.post(`/api/admin/counsel-requests/${counselId}/assign`, { lawyer_id: hany.id })).status, 409, 'cannot be assigned twice');
});

test('the specialist sees exactly facts + issue #3 + the two documents, and nothing identifying the client', async () => {
  const v = ok(await cMohamed.get(`/api/lawyer/assignments/${specAsg.id}`));
  assert.equal(v.assignment.role, 'specialist');
  assert.ok(v.facts.includes('توفي المورث'));
  assert.deepEqual(v.issues.map((i) => i.number), [3]);
  assert.equal(v.issues[0].title, ISSUES[2]);
  assert.deepEqual(v.documents.map((d) => d.id).sort(), [docs.death.id, docs.flat.id].sort());
  assert.deepEqual(v.team, [], 'specialist does not see the lead draft/opinion');
  assert.equal(v.requested_by.lawyer_name.includes('أحمد عبد العظيم'), true);
  assert.equal(v.requested_by.kind, 'specialist_input');
  assert.deepEqual(v.info_requests, []);
  const s = JSON.stringify(v);
  for (const n of [1, 2, 4]) assert.equal(s.includes(ISSUES[n - 1]), false, `issue #${n} leaked to the specialist`);
  assertNoLeak(v, { keys: LAWYER_FORBIDDEN_KEYS, values: [CLIENT, 'سامية', '1012345678', NATIONAL_ID, 'إعلان فيسبوك'] }, 'specialist view');
  assert.equal((await cMohamed.get(`/api/documents/${docs.death.id}/download`)).status, 200);
  assert.equal((await cMohamed.get(`/api/documents/${docs.flat.id}/download`)).status, 200);
  assert.equal((await cMohamed.get(`/api/documents/${docs.shop.id}/download`)).status, 404);
  assert.equal((await cMohamed.get(`/api/lawyer/assignments/${leadAsg.id}`)).status, 404);
  // the specialist can only reference what was granted to them
  const bad = await cMohamed.post(`/api/lawyer/assignments/${specAsg.id}/counsel-requests`, {
    kind: 'second_opinion', issue_ids: [issueByNo[1].id], description: 'أريد رأيًا ثانيًا في مسألة الورثة',
  });
  assert.equal(bad.status, 400);
});

test("the specialist's draft stays private; once submitted it becomes visible to the lead (notified) and to admin", async () => {
  ok(await cMohamed.put(`/api/lawyer/assignments/${specAsg.id}/draft`, { body: 'مسودة أولية لم تكتمل بعد' }));
  let lv = ok(await cAhmed.get(`/api/lawyer/assignments/${leadAsg.id}`));
  assert.equal(lv.team.length, 1);
  assert.equal(lv.team[0].assignment_id, specAsg.id);
  assert.equal(lv.team[0].opinion, null);
  assert.equal(JSON.stringify(lv).includes('مسودة أولية لم تكتمل'), false);

  ok(await cMohamed.post(`/api/lawyer/assignments/${specAsg.id}/submit`, { body: SPECIALIST_OPINION, hours_spent: 2.5 }));
  lv = ok(await cAhmed.get(`/api/lawyer/assignments/${leadAsg.id}`));
  assert.equal(lv.team[0].opinion.body, SPECIALIST_OPINION);
  assert.equal(lv.team[0].opinion.status, 'submitted');
  assert.equal(lv.team[0].role, 'specialist');
  assert.equal(lv.counsel_requests[0].status, 'completed');
  assert.ok(lv.counsel_requests[0].assigned_lawyer.includes('محمد فؤاد'));
  assert.ok((await notificationsOf(cAhmed)).some((n) => n.type === 'team.opinion' && n.title.includes(kase.code)));

  const d = await caseDetail(admin, kase.id);
  const op = d.opinions.find((o) => o.assignment_id === specAsg.id);
  assert.equal(op.body, SPECIALIST_OPINION);
  assert.equal(op.status, 'submitted');
  assert.equal(d.counsel_requests[0].status, 'completed');
  // other lawyers still see nothing
  assert.deepEqual(ok(await cHany.get('/api/lawyer/assignments')), []);
  // the specialist cannot edit a submitted opinion
  assert.equal((await cMohamed.put(`/api/lawyer/assignments/${specAsg.id}/draft`, { body: 'تعديل بعد التقديم' })).status, 409);
});

test('team billed independently: lead 500 (per case), specialist 250 (custom), senior reviewer pro bono (no ledger)', async () => {
  let d = await caseDetail(admin, kase.id);
  const specOp = d.opinions.find((o) => o.assignment_id === specAsg.id && o.status === 'submitted');
  ok(await admin.post(`/api/admin/opinions/${specOp.id}/approve`, { quality_score: 5 }));
  const leadOpId = ok(await cAhmed.post(`/api/lawyer/assignments/${leadAsg.id}/submit`, {
    body: 'الرأي في المسائل الأربع: الورثة الأبناء تعصيبًا مع وصية واجبة لابني الابن، وإذن محكمة الأسرة لازم لبيع نصيب القاصرين، ويُستفاد من رأي الزميل المتخصص في الضريبة.',
  })).id;
  ok(await admin.post(`/api/admin/opinions/${leadOpId}/approve`, { quality_score: 4 }));

  const rev = await assign(admin, kase.id, {
    lawyer_id: salwa.id,
    role: 'reviewer',
    brief: 'مراجعة أخيرة للرأيين',
    grants: { facts: true, issue_ids: Object.values(issueByNo).map((i) => i.id), opinion_assignment_ids: [leadAsg.id, specAsg.id] },
  });
  const sv = ok(await cSalwa.get(`/api/lawyer/assignments/${rev.id}`));
  assert.equal(sv.team.length, 2);
  assert.ok(sv.team.every((m) => m.opinion && m.opinion.status === 'approved'));
  const revOp = ok(await cSalwa.post(`/api/lawyer/assignments/${rev.id}/submit`, { body: 'راجعت الرأيين وأوافق عليهما مع التأكيد على ضرورة إذن محكمة الأسرة قبل البيع.' })).id;
  ok(await admin.post(`/api/admin/opinions/${revOp}/approve`, { quality_score: 5 }));

  d = await caseDetail(admin, kase.id);
  const billing = Object.fromEntries(d.assignments.map((a) => [a.lawyer_id, a.billing]));
  assert.deepEqual({ treatment: billing[ahmed.id].treatment, amount: billing[ahmed.id].amount }, { treatment: 'payable', amount: 500 });
  assert.deepEqual({ treatment: billing[mohamed.id].treatment, amount: billing[mohamed.id].amount }, { treatment: 'payable', amount: 250 });
  assert.deepEqual({ treatment: billing[salwa.id].treatment, amount: billing[salwa.id].amount }, { treatment: 'pro_bono', amount: 0 });

  const ledger = ok(await admin.get('/api/admin/accounting/ledger'));
  const forCase = ledger.filter((e) => e.case_id === kase.id);
  assert.deepEqual(forCase.map((e) => [e.lawyer_id, e.amount, e.status]).sort((a, b) => a[0] - b[0]), [[ahmed.id, 500, 'accrued'], [mohamed.id, 250, 'accrued']].sort((a, b) => a[0] - b[0]));
  assert.equal(ledger.some((e) => e.lawyer_id === salwa.id), false, 'pro bono creates no financial obligation');

  const cost = ok(await admin.get(`/api/admin/accounting/case-cost/${kase.id}`));
  assert.equal(cost.direct, 750);
  assert.equal(cost.total, 750);
  assert.equal(cost.pro_bono_value, 600);
  assert.equal(cost.lawyers_involved, 3);
  assert.deepEqual(d.cost, cost, 'case detail shows the same real cost');
  // the lawyers see their own statement only
  const st = ok(await cMohamed.get('/api/lawyer/statement'));
  assert.equal(st.unpaid_balance, 250);
  assert.ok(st.entries.every((e) => e.lawyer_id === mohamed.id));
  const sst = ok(await cSalwa.get('/api/lawyer/statement'));
  assert.equal(sst.pro_bono_count, 1);
  assert.equal(sst.entries.length, 0);
});

test('a counsel request on a fresh case can be rejected (lead notified with the reason) or cancelled by the lead', async () => {
  const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01255550001', name: 'عميل آخر', text: 'نزاع على ميراث وأحتاج استشارة' }), 201);
  const c2 = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ملف ميراث آخر', issues: [{ title: 'مسألة 1' }] }), 201).case;
  const a2 = await assign(admin, c2.id, { lawyer_id: ahmed.id, role: 'lead' });
  const r = ok(await cAhmed.post(`/api/lawyer/assignments/${a2.id}/counsel-requests`, { kind: 'second_opinion', description: 'أريد رأيًا ثانيًا في المسألة الأولى' }), 201);
  ok(await admin.post(`/api/admin/counsel-requests/${r.id}/reject`, { note: 'المسألة واضحة ولا تحتاج رأيًا ثانيًا' }));
  const v = ok(await cAhmed.get(`/api/lawyer/assignments/${a2.id}`));
  assert.equal(v.counsel_requests[0].status, 'rejected');
  assert.equal(v.counsel_requests[0].admin_note, 'المسألة واضحة ولا تحتاج رأيًا ثانيًا');
  assert.ok((await notificationsOf(cAhmed)).some((n) => n.type === 'counsel_request.rejected'));
  assert.equal((await caseDetail(admin, c2.id)).assignments.length, 1);

  const r2 = ok(await cAhmed.post(`/api/lawyer/assignments/${a2.id}/counsel-requests`, { kind: 'co_counsel', description: 'أطلب مشاركة محامٍ آخر في دراسة المسألة' }), 201);
  assert.equal((await cMohamed.post(`/api/lawyer/counsel-requests/${r2.id}/cancel`)).status, 409, 'only the requester may cancel');
  ok(await cAhmed.post(`/api/lawyer/counsel-requests/${r2.id}/cancel`));
  assert.equal((await admin.post(`/api/admin/counsel-requests/${r2.id}/assign`, { lawyer_id: hany.id })).status, 409);
  assert.deepEqual(ok(await cHany.get('/api/lawyer/assignments')), []);
});

test('once the lead opinion is approved the lead can no longer raise new counsel requests on that file', async () => {
  const r = await cAhmed.post(`/api/lawyer/assignments/${leadAsg.id}/counsel-requests`, {
    kind: 'second_opinion', description: 'أريد رأيًا ثانيًا في مسألة الوصية الواجبة',
  });
  assert.equal(r.status, 409);
});

test('atomicity: assigning a counsel request to someone already on the team fails cleanly and the request stays pending', async () => {
  const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01255550002', name: 'عميل ثالث', text: 'استشارة ميراث وضرائب' }), 201);
  const c3 = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ملف ميراث ثالث', issues: [{ title: 'مسألة ضريبية' }] }), 201).case;
  const a3 = await assign(admin, c3.id, { lawyer_id: ahmed.id, role: 'lead' });
  const r = ok(await cAhmed.post(`/api/lawyer/assignments/${a3.id}/counsel-requests`, { kind: 'specialist_input', specialty: 'TAX', description: 'أحتاج رأي متخصص ضرائب في هذا الملف' }), 201);
  const bad = await admin.post(`/api/admin/counsel-requests/${r.id}/assign`, { lawyer_id: ahmed.id, grants: { facts: true } });
  assert.equal(bad.status, 409, 'the requester is already on the team');
  let d = await caseDetail(admin, c3.id);
  assert.equal(d.counsel_requests[0].status, 'pending_admin');
  assert.equal(d.assignments.length, 1);
  const good = ok(await admin.post(`/api/admin/counsel-requests/${r.id}/assign`, { lawyer_id: hany.id, grants: { facts: true } }));
  assert.equal(good.request.status, 'assigned');
  d = await caseDetail(admin, c3.id);
  assert.equal(d.assignments.length, 2);
});
