// Lane B — Requirement 5: "What admin sees is NOT what the lawyer sees".
// Exhaustive negative tests for the lawyer portal: assignment isolation, explicit grants,
// document download gating and leak scanning of every lawyer-facing JSON response.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import {
  ok, createLawyer, newCase, assign, uniquePhone, phoneCore, assertNoLeak, LAWYER_FORBIDDEN_KEYS, OPINION_TEXT,
} from './lane-b-kit.test.js';

const CLIENT_NAME = 'نادية فاروق الشناوي';
const NATIONAL_ID = '29001011234567';
const CLIENT_EMAIL = 'nadia.private@example.com';
const CONVO = 'CONVOMARK7731';
const CAMPAIGN = 'CAMPAIGNMARK4410';
const NOTES = 'NOTESMARK9912';
const INTERNAL = 'INTERNALMARK5521';

let t;
let admin;
let A; // lead
let B; // co-counsel on the same case
let C; // network lawyer with no assignment on this case
let lawyerA;
let lawyerB;
let lawyerC;
let kase;
let otherCase;
let aAsg;
let bAsg;
const phone = uniquePhone();

function forbiddenValues({ allowName = false } = {}) {
  return [
    allowName ? null : CLIENT_NAME,
    allowName ? null : 'نادية',
    phoneCore(phone),
    NATIONAL_ID,
    CLIENT_EMAIL,
    CONVO,
    CAMPAIGN,
    NOTES,
    INTERNAL,
  ];
}

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
  A = await createLawyer(admin, { name: 'أحمد مختبر', specialties: ['INH'] });
  B = await createLawyer(admin, { name: 'بسمة مختبرة', specialties: ['INH', 'TAX'] });
  C = await createLawyer(admin, { name: 'كريم غير مسند', specialties: ['INH'] });
  lawyerA = await t.login(A.username);
  lawyerB = await t.login(B.username);
  lawyerC = await t.login(C.username);

  // Website door: the original conversation, marketing source/campaign and contact data live on the intake.
  const pub = t.client();
  const r = ok(
    await pub.post('/api/public/intake', {
      name: CLIENT_NAME,
      phone,
      email: CLIENT_EMAIL,
      consent: true,
      legal_area: 'INH',
      description: `رسالتي الأصلية ${CONVO}: والدي توفي وترك شقة وإخوتي يرفضون القسمة وأريد معرفة حقوقي.`,
      attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: CAMPAIGN },
    }),
    201,
    'website intake',
  );
  const list = ok(await admin.get(`/api/admin/intakes?q=${encodeURIComponent(r.reference)}`));
  const intakeId = list.items[0].id;
  ok(await admin.patch(`/api/admin/intakes/${intakeId}`, { internal_notes: `ملاحظة داخلية ${NOTES}` }));
  const conv = ok(
    await admin.post(`/api/admin/intakes/${intakeId}/convert`, {
      legal_area: 'INH',
      title: 'نزاع على قسمة تركة',
      facts_shared: 'توفي المورث وترك شقة، ويرفض بعض الورثة القسمة الرضائية.',
      facts_internal: `ملاحظات داخلية ${INTERNAL} — العميلة حساسة للتواصل الهاتفي.`,
      issues: [{ title: 'تحديد الورثة والأنصبة' }, { title: 'دعوى الفرز والتجنيب' }, { title: 'الأثر الضريبي لبيع الشقة' }],
      client: { name: CLIENT_NAME, national_id: NATIONAL_ID, email: CLIENT_EMAIL },
    }),
    201,
    'convert',
  ).case;
  ok(await admin.post(`/api/admin/cases/${conv.id}/documents`, {
    files: [
      { filename: 'death.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4 death').toString('base64') },
      { filename: 'contract.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4 contract').toString('base64') },
      { filename: 'id-card.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4 id card').toString('base64') },
    ],
  }));
  const d = ok(await admin.get(`/api/admin/cases/${conv.id}`));
  kase = {
    id: conv.id,
    code: conv.code,
    issues: [...d.issues].sort((a, b) => a.number - b.number),
    docs: d.documents,
  };
  const [i1, i2, i3] = kase.issues;
  const [d1, d2] = kase.docs;
  aAsg = await assign(admin, kase.id, {
    lawyer_id: A.id,
    role: 'lead',
    brief: 'ادرس المسألتين 1 و2',
    grants: { facts: true, issue_ids: [i1.id, i2.id], document_ids: [d1.id] },
  });
  bAsg = await assign(admin, kase.id, {
    lawyer_id: B.id,
    role: 'co_counsel',
    brief: 'المسألة الضريبية فقط',
    grants: { facts: false, issue_ids: [i3.id], document_ids: [d2.id] },
  });
  otherCase = await newCase(admin, { legal_area: 'CIV', title: 'ملف آخر لا علاقة له', docs: ['other.pdf'], issues: ['مسألة في ملف آخر'] });
});

after(async () => {
  await t?.close();
});

test('lead sees exactly the granted facts, issues and documents — nothing else from the case', async () => {
  const v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.equal(v.case.code, kase.code);
  assert.equal(v.facts_granted, true);
  assert.equal(v.facts, 'توفي المورث وترك شقة، ويرفض بعض الورثة القسمة الرضائية.');
  assert.deepEqual(v.issues.map((i) => i.number), [1, 2]);
  assert.deepEqual(v.documents.map((d) => d.id), [kase.docs[0].id]);
  assert.equal(JSON.stringify(v).includes('الأثر الضريبي لبيع الشقة'), false, 'ungranted issue #3 title leaked');
  assert.notEqual(v.client_label, CLIENT_NAME);
  assert.deepEqual(v.team, []);

  const vb = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.equal(vb.facts, null, 'facts not granted to B must be null');
  assert.equal(vb.facts_granted, false);
  assert.deepEqual(vb.issues.map((i) => i.number), [3]);
  assert.deepEqual(vb.documents.map((d) => d.id), [kase.docs[1].id]);
  assert.equal(JSON.stringify(vb).includes('ويرفض بعض الورثة'), false, 'ungranted facts leaked to B');
});

test("lawyer A cannot read or act on lawyer B's assignment on the same case (404 everywhere)", async () => {
  const id = bAsg.id;
  const attempts = [
    ['GET', `/api/lawyer/assignments/${id}`],
    ['POST', `/api/lawyer/assignments/${id}/open`],
    ['PUT', `/api/lawyer/assignments/${id}/draft`, { body: 'محاولة كتابة في ملف زميل لا يخصني إطلاقًا' }],
    ['POST', `/api/lawyer/assignments/${id}/submit`, { body: 'محاولة تقديم رأي في ملف زميل لا يخصني إطلاقًا' }],
    ['POST', `/api/lawyer/assignments/${id}/info-requests`, { kind: 'information', question: 'سؤال من محامٍ غير مسند' }],
    ['POST', `/api/lawyer/assignments/${id}/counsel-requests`, { kind: 'second_opinion', description: 'طلب رأي من محامٍ غير مسند للملف' }],
    ['POST', `/api/lawyer/assignments/${id}/issues`, { title: 'مسألة مقترحة من محامٍ غير مسند' }],
    ['GET', `/api/lawyer/assignments/${id}/similar`],
    ['POST', `/api/lawyer/assignments/${id}/ai/draft`],
  ];
  for (const [method, url, body] of attempts) {
    const r = await lawyerA.request(method, url, body);
    assert.equal(r.status, 404, `${method} ${url} should be 404 for a lawyer who does not own the assignment (got ${r.status})`);
    assert.equal(typeof r.body.error, 'string');
  }
  // B's assignment is untouched by A's attempts
  const vb = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.equal(vb.assignment.status, 'assigned');
  assert.deepEqual(vb.my_opinions, []);
  assert.deepEqual(vb.info_requests, []);
  // A's own list contains only A's assignment
  const listA = ok(await lawyerA.get('/api/lawyer/assignments'));
  assert.deepEqual(listA.map((x) => x.id), [aAsg.id]);
});

test('a network lawyer with no assignment gets an empty list and 404 for every assignment and document', async () => {
  assert.deepEqual(ok(await lawyerC.get('/api/lawyer/assignments')), []);
  assert.deepEqual(ok(await lawyerC.get('/api/lawyer/assignments?scope=history')), []);
  const dash = ok(await lawyerC.get('/api/lawyer/dashboard'));
  assert.equal(dash.counts.active, 0);
  for (const id of [aAsg.id, bAsg.id, 999999]) {
    assert.equal((await lawyerC.get(`/api/lawyer/assignments/${id}`)).status, 404);
  }
  for (const d of [...kase.docs, ...otherCase.docs]) {
    assert.equal((await lawyerC.get(`/api/documents/${d.id}/download`)).status, 404);
  }
});

test('documents: only explicitly granted ones download for lawyers; others are 404 (not 403)', async () => {
  const [d1, d2, d3] = kase.docs;
  assert.equal((await lawyerA.get(`/api/documents/${d1.id}/download`)).status, 200);
  for (const d of [d2, d3, otherCase.docs[0]]) {
    const r = await lawyerA.get(`/api/documents/${d.id}/download`);
    assert.equal(r.status, 404, `doc ${d.id} must not be downloadable by lawyer A`);
  }
  assert.equal((await lawyerB.get(`/api/documents/${d2.id}/download`)).status, 200);
  for (const d of [d1, d3]) assert.equal((await lawyerB.get(`/api/documents/${d.id}/download`)).status, 404);
  // admin can download everything; anonymous cannot
  for (const d of kase.docs) assert.equal((await admin.get(`/api/documents/${d.id}/download`)).status, 200);
  assert.equal((await t.client().get(`/api/documents/${d1.id}/download`)).status, 401);
});

test('a granted document download returns the actual file bytes (not a JSON placeholder)', async () => {
  const [d1, d2] = kase.docs;
  for (const [c, d, marker, who] of [[lawyerA, d1, 'death', 'lawyer A'], [lawyerB, d2, 'contract', 'lawyer B'], [admin, d2, 'contract', 'admin']]) {
    const r = await c.get(`/api/documents/${d.id}/download`);
    assert.equal(r.status, 200, who);
    assert.equal(r.headers.get('content-type'), 'application/pdf', `${who}: download must be served as the stored PDF, got ${r.headers.get('content-type')} body=${JSON.stringify(r.body)}`);
    assert.ok(Buffer.isBuffer(r.body) && r.body.toString().includes(marker), `${who}: downloaded bytes must be the uploaded file`);
    assert.match(r.headers.get('content-disposition') || '', /attachment/);
  }
});

test('no phone, national id, email, client name, conversation, source, internal notes or cost in ANY lawyer response', async () => {
  // put some activity on the file so every lawyer endpoint has data to render
  ok(await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/open`));
  ok(await lawyerA.put(`/api/lawyer/assignments/${aAsg.id}/draft`, { body: 'مسودة أولى للرأي القانوني في المسألتين' }));
  ok(await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/info-requests`, { kind: 'document', question: 'برجاء طلب صورة إعلام الوراثة من العميلة' }), 201);

  const endpoints = {
    A: [
      '/api/lawyer/dashboard',
      '/api/lawyer/assignments',
      '/api/lawyer/assignments?scope=history',
      `/api/lawyer/assignments/${aAsg.id}`,
      `/api/lawyer/assignments/${aAsg.id}/similar`,
      '/api/lawyer/matters',
      '/api/lawyer/statement',
      '/api/notifications?limit=200',
    ],
    B: ['/api/lawyer/dashboard', '/api/lawyer/assignments', `/api/lawyer/assignments/${bAsg.id}`, '/api/notifications?limit=200'],
  };
  for (const [who, urls] of Object.entries(endpoints)) {
    const c = who === 'A' ? lawyerA : lawyerB;
    for (const url of urls) {
      const body = ok(await c.get(url), 200, `${who} ${url}`);
      const keys = url.startsWith('/api/notifications') || url === '/api/lawyer/statement' ? LAWYER_FORBIDDEN_KEYS.filter((k) => k !== 'ledger') : LAWYER_FORBIDDEN_KEYS;
      assertNoLeak(body, { keys, values: forbiddenValues() }, `${who} GET ${url}`);
    }
  }
  const opened = ok(await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/open`));
  assertNoLeak(opened, { keys: LAWYER_FORBIDDEN_KEYS, values: forbiddenValues() }, 'A POST open');
  const draft = ok(await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/ai/draft`));
  assertNoLeak(draft, { keys: LAWYER_FORBIDDEN_KEYS, values: forbiddenValues() }, 'A POST ai/draft');
  const me = ok(await lawyerA.get('/api/auth/me'));
  assert.equal(me.user.password_hash, undefined);
  assertNoLeak(me, { keys: ['password_hash', 'password'], values: forbiddenValues() }, 'A GET me');
});

test('client name appears only after an explicit client_name grant, and disappears when revoked', async () => {
  const [i1, i2] = kase.issues;
  const base = { facts: true, issue_ids: [i1.id, i2.id], document_ids: [kase.docs[0].id] };
  let v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.notEqual(v.client_label, CLIENT_NAME);
  ok(await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { ...base, client_name: true }));
  v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.equal(v.client_label, CLIENT_NAME);
  // even with the name granted, contact data and identity numbers stay hidden
  assertNoLeak(v, { keys: LAWYER_FORBIDDEN_KEYS, values: forbiddenValues({ allowName: true }) }, 'A view with client_name grant');
  // B (no client_name grant) still cannot see it
  const vb = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.equal(JSON.stringify(vb).includes(CLIENT_NAME), false);
  ok(await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, base));
  v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.notEqual(v.client_label, CLIENT_NAME);
  const notes = ok(await lawyerA.get('/api/notifications?limit=200')).items;
  assert.ok(notes.some((n) => n.type === 'grants.updated'), 'lawyer is notified when grants change');
});

test('revoking a document grant removes download access immediately; granting opens it', async () => {
  const [i1, i2] = kase.issues;
  const [d1, , d3] = kase.docs;
  ok(await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { facts: true, issue_ids: [i1.id, i2.id], document_ids: [d3.id] }));
  assert.equal((await lawyerA.get(`/api/documents/${d1.id}/download`)).status, 404);
  assert.equal((await lawyerA.get(`/api/documents/${d3.id}/download`)).status, 200);
  const v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.deepEqual(v.documents.map((d) => d.id), [d3.id]);
  ok(await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { facts: true, issue_ids: [i1.id, i2.id], document_ids: [d1.id] }));
  assert.equal((await lawyerA.get(`/api/documents/${d3.id}/download`)).status, 404);
});

test('grants that reference another case are rejected and leave the existing grants intact', async () => {
  const [i1, i2] = kase.issues;
  const r1 = await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { facts: true, issue_ids: [i1.id, otherCase.issues[0].id], document_ids: [] });
  assert.equal(r1.status, 400);
  const r2 = await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { facts: true, issue_ids: [i1.id], document_ids: [otherCase.docs[0].id] });
  assert.equal(r2.status, 400);
  const d = ok(await admin.get(`/api/admin/cases/${kase.id}`));
  const g = d.assignments.find((a) => a.id === aAsg.id).grants;
  assert.deepEqual([...g.issue_ids].sort(), [i1.id, i2.id].sort());
  assert.deepEqual(g.document_ids, [kase.docs[0].id]);
  assert.equal((await lawyerA.get(`/api/documents/${otherCase.docs[0].id}/download`)).status, 404);
});

test('a lawyer cannot point a counsel request at issues or documents that were not granted to them', async () => {
  const [, , i3] = kase.issues;
  const r1 = await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/counsel-requests`, {
    kind: 'specialist_input', specialty: 'TAX', issue_ids: [i3.id], description: 'أحتاج رأي متخصص في المسألة الضريبية رقم 3',
  });
  assert.equal(r1.status, 400);
  const r2 = await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/counsel-requests`, {
    kind: 'document_review', document_ids: [kase.docs[2].id], description: 'أحتاج مراجعة مستند بطاقة الهوية المرفقة بالملف',
  });
  assert.equal(r2.status, 400);
  const q = ok(await admin.get('/api/admin/queue'));
  assert.equal(q.counsel_requests.length, 0, 'rejected attempts must not create counsel requests');
});

test('team opinions are visible only when granted, and drafts are never shown to teammates', async () => {
  const [i1, i2] = kase.issues;
  const base = { facts: true, issue_ids: [i1.id, i2.id], document_ids: [kase.docs[0].id] };
  ok(await lawyerB.put(`/api/lawyer/assignments/${bAsg.id}/draft`, { body: 'مسودة سرية لم تُقدَّم بعد DRAFTSECRET' }));
  let v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.deepEqual(v.team, [], 'no opinion grant → no team section');
  ok(await admin.put(`/api/admin/assignments/${aAsg.id}/grants`, { ...base, opinion_assignment_ids: [bAsg.id] }));
  v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.equal(v.team.length, 1);
  assert.equal(v.team[0].assignment_id, bAsg.id);
  assert.equal(v.team[0].opinion, null, 'draft opinions must not be visible to teammates');
  assert.equal(JSON.stringify(v).includes('DRAFTSECRET'), false);
  ok(await lawyerB.post(`/api/lawyer/assignments/${bAsg.id}/submit`, { body: `${OPINION_TEXT} TEAMVISIBLE` }));
  v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.ok(v.team[0].opinion?.body.includes('TEAMVISIBLE'));
  // B was not granted A's opinion
  const vb = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.deepEqual(vb.team, []);
});

test('an issue proposed by a lawyer is visible only to the proposer until staff accept it', async () => {
  const p = ok(await lawyerA.post(`/api/lawyer/assignments/${aAsg.id}/issues`, { title: 'مسألة مقترحة: مدى صحة عقد البيع الابتدائي' }), 201);
  assert.equal(p.status, 'proposed');
  let va = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.ok(va.issues.some((i) => i.id === p.id && i.status === 'proposed'));
  const vb = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.equal(vb.issues.some((i) => i.id === p.id), false);
  ok(await admin.patch(`/api/admin/cases/${kase.id}/issues/${p.id}`, { status: 'active' }));
  va = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.ok(va.issues.some((i) => i.id === p.id && i.status === 'active'));
  const vb2 = ok(await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`));
  assert.equal(vb2.issues.some((i) => i.id === p.id), false);
});

test('a dropped issue disappears from the lawyer view', async () => {
  const [i1] = kase.issues;
  ok(await admin.patch(`/api/admin/cases/${kase.id}/issues/${i1.id}`, { status: 'dropped' }));
  const v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.equal(v.issues.some((i) => i.id === i1.id), false);
});

test('lawyers get 403 on every admin API and anonymous callers get 401', async () => {
  const adminCalls = [
    ['GET', '/api/admin/cases'],
    ['GET', `/api/admin/cases/${kase.id}`],
    ['GET', '/api/admin/intakes'],
    ['GET', `/api/admin/clients/${otherCase.clientId}`],
    ['GET', `/api/admin/accounting/case-cost/${kase.id}`],
    ['GET', '/api/admin/outbox'],
    ['GET', '/api/admin/queue'],
    ['PUT', `/api/admin/assignments/${aAsg.id}/grants`, { facts: true, client_name: true, issue_ids: kase.issues.map((i) => i.id), document_ids: kase.docs.map((d) => d.id) }],
    ['POST', `/api/admin/cases/${kase.id}/close`, { outcome: 'answered' }],
  ];
  for (const [m, url, body] of adminCalls) {
    const r = await lawyerA.request(m, url, body);
    assert.equal(r.status, 403, `${m} ${url} must be 403 for a lawyer (got ${r.status})`);
  }
  // the self-escalation attempt above changed nothing
  const v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.notEqual(v.client_label, CLIENT_NAME);
  assert.equal((await lawyerA.get(`/api/documents/${kase.docs[2].id}/download`)).status, 404);
  const anon = t.client();
  for (const url of ['/api/lawyer/assignments', `/api/lawyer/assignments/${aAsg.id}`, '/api/admin/cases', '/api/notifications']) {
    assert.equal((await anon.get(url)).status, 401, `anonymous GET ${url}`);
  }
});

test('withdrawn assignment: 404 for view and actions, removed from lists, documents no longer downloadable', async () => {
  const d2 = kase.docs[1];
  assert.equal((await lawyerB.get(`/api/documents/${d2.id}/download`)).status, 200);
  ok(await admin.post(`/api/admin/assignments/${bAsg.id}/withdraw`, { note: 'إعادة توزيع' }));
  assert.equal((await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}`)).status, 404);
  assert.equal((await lawyerB.post(`/api/lawyer/assignments/${bAsg.id}/open`)).status, 404);
  assert.equal((await lawyerB.put(`/api/lawyer/assignments/${bAsg.id}/draft`, { body: 'محاولة تعديل بعد السحب من الملف' })).status, 404);
  assert.equal((await lawyerB.get(`/api/lawyer/assignments/${bAsg.id}/similar`)).status, 404);
  assert.deepEqual(ok(await lawyerB.get('/api/lawyer/assignments')), []);
  assert.deepEqual(ok(await lawyerB.get('/api/lawyer/assignments?scope=history')), []);
  assert.equal((await lawyerB.get(`/api/documents/${d2.id}/download`)).status, 404);
  const notes = ok(await lawyerB.get('/api/notifications?limit=200')).items;
  assert.ok(notes.some((n) => n.type === 'assignment.withdrawn'));
  // the withdrawn member's opinion is no longer shown to the lead either
  const v = ok(await lawyerA.get(`/api/lawyer/assignments/${aAsg.id}`));
  assert.deepEqual(v.team, []);
});
