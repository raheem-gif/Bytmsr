// v9.1 l-work — صفحة الإسناد ووضع الكتابة وطلبات المحامي (L-03، L-04، L-05، L-13، L-14، L-19، L-23، وجانب المحامي من B91-16).
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { ok, assertNoLeak, LAWYER_FORBIDDEN_KEYS } from './lane-b-kit.test.js';
import { migrateInfoRequestKinds, suggestedDocuments } from '../src/services/v91-l-work.js';
import { diffParagraphs, wordDiff, splitParagraphs } from '../public/assets/js/app/components/text-diff.js';
import {
  decideRestore,
  parseReviewNotes,
  classifySaveError,
  createDraftStore,
  listUserDrafts,
  clearUserDrafts,
  syncPendingDrafts,
} from '../public/assets/js/app/components/draft-store.js';
import { similarity, normTokens } from '../public/assets/js/app/components/request-sheet.js';
import { opinionSkeleton } from '../public/assets/js/app/pages/lawyer/write.js';
import { addDays } from '../src/util.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let t;
let admin;
let ahmed;
let hany;
let mohamed;
let rania;
let caseId;
let ahmedAsg;
let hanyAsg;
let mohamedAsg;
let ir3; // «صورة إعلام الوراثة» — طلبته الإدارة وأُرسل للمستفيدة

before(async () => {
  t = await startTestApp({ seed: 'demo' });
  admin = await t.login('admin');
  ahmed = await t.login('ahmed');
  hany = await t.login('hany');
  mohamed = await t.login('mohamed');
  rania = await t.login('rania');
  const list = ok(await admin.get('/api/admin/cases?q=INH-2026-00482'));
  caseId = list.items[0].id;
  const detail = ok(await admin.get(`/api/admin/cases/${caseId}`));
  const by = (re) => detail.assignments.find((a) => re.test(a.lawyer_name) && a.status !== 'withdrawn');
  ahmedAsg = by(/أحمد/).id;
  hanyAsg = by(/هاني/)?.id;
  mohamedAsg = by(/محمد فؤاد/).id;
  ir3 = detail.info_requests.find((r) => r.question === 'صورة إعلام الوراثة إن كان قد صدر، وإن لم يصدر نرجو إفادتنا بذلك.' && r.status === 'sent_to_client');
});

after(async () => {
  await t?.close();
});

describe('schema: info_requests accepts the new lawyer kinds', () => {
  test('the kind CHECK constraint is widened once; indexes survive; migration is idempotent', () => {
    const sql = t.app.db.get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'info_requests'").sql;
    assert.match(sql, /'extension'/);
    assert.match(sql, /'admin_question'/);
    assert.equal(migrateInfoRequestKinds(t.app.db), false);
    const idx = t.app.db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'info_requests'").map((r) => r.name);
    assert.ok(idx.includes('idx_info_requests_case'));
    assert.ok(idx.includes('idx_info_requests_status'));
    for (const col of ['requested_due_at', 'duplicate_of_id', 'items', 'client_ref', 'extension_applied_at']) {
      assert.ok(t.app.db.all('PRAGMA table_info(info_requests)').some((c) => c.name === col), col);
    }
    assert.ok(t.app.db.all('PRAGMA table_info(opinions)').some((c) => c.name === 'client_steps'));
  });
});

describe('L-04 assignment view', () => {
  test('client_label is null unless the name is granted; documents carry a view kind; ai.claude is false locally', async () => {
    const v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    assert.equal(v.client_label, null);
    assert.ok(v.documents.length >= 3);
    assert.ok(v.documents.every((d) => ['pdf', 'image', 'doc'].includes(d.kind)));
    assert.equal(v.documents.find((d) => /الوفاة/.test(d.filename)).kind, 'pdf');
    assert.deepEqual(v.ai, { claude: false });
    const meta = ok(await ahmed.get('/api/meta'));
    assert.deepEqual(meta.ai, { claude: false });
  });

  test('case_open_requests lists what was already asked of the beneficiary — client_message only', async () => {
    assert.ok(ir3, 'seed: the «إعلام الوراثة» request was sent to the beneficiary by staff');
    const v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    const row = v.case_open_requests.find((r) => r.id === ir3.id);
    assert.ok(row);
    assert.deepEqual(Object.keys(row).sort(), ['client_message', 'id', 'items', 'joined', 'kind', 'sent_at', 'status']);
    assert.match([row.client_message, ...row.items].join(' '), /إعلام الوراثة/);
    assertNoLeak(v.case_open_requests, { keys: [...LAWYER_FORBIDDEN_KEYS, 'question', 'client_reply', 'requested_by', 'requested_by_name'], values: ['سامية', '1012345678'] }, 'open requests');
  });

  test('a lawyer without the facts grant gets case_open_requests = [] and cannot join', async () => {
    const before = ok(await admin.get(`/api/admin/cases/${caseId}`)).assignments.find((a) => a.id === mohamedAsg).grants;
    ok(await admin.put(`/api/admin/assignments/${mohamedAsg}/grants`, { ...before, facts: false }));
    const v = ok(await mohamed.get(`/api/lawyer/assignments/${mohamedAsg}`));
    assert.deepEqual(v.case_open_requests, []);
    ok(await admin.put(`/api/admin/assignments/${mohamedAsg}/grants`, before));
  });

  test('another lawyer’s assignment is 404 for every new endpoint', async () => {
    assert.equal((await hany.get(`/api/lawyer/assignments/${ahmedAsg}/suggested-documents`)).status, 404);
    assert.equal((await hany.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'admin_question', question: 'سؤال من محامٍ آخر' })).status, 404);
    assert.equal((await hany.put(`/api/lawyer/assignments/${ahmedAsg}/draft`, { body: 'نص' })).status, 404);
    assert.equal((await admin.get(`/api/lawyer/assignments/${ahmedAsg}/suggested-documents`)).status, 403);
  });
});

describe('L-19 suggested documents', () => {
  test('INH-2026-00482: «إعلام الوراثة» (already requested) and «شهادة الوفاة» (granted) are not offered; «قسيمة الزواج» is', async () => {
    const res = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}/suggested-documents`));
    const labels = res.items.map((x) => x.label);
    assert.ok(labels.length <= 5 && labels.length > 0);
    assert.ok(!labels.includes('إعلام الوراثة'), labels.join('|'));
    assert.ok(!labels.includes('شهادة الوفاة'), labels.join('|'));
    assert.ok(labels.includes('قسيمة الزواج'), labels.join('|'));
    assert.ok(res.items.every((x) => x.text === `صورة ${x.label}`));
    assertNoLeak(res, { keys: LAWYER_FORBIDDEN_KEYS, values: ['سامية', '1012345678', 'CL-00881'] }, 'suggestions');
  });

  test('the service works with only what the lawyer can see', () => {
    const lawyer = t.app.db.get("SELECT * FROM users WHERE username = 'ahmed'");
    const res = suggestedDocuments(t.app, ahmedAsg, lawyer);
    assert.ok(Array.isArray(res.items));
  });
});

describe('L-04 «أحتاج هذا أيضًا» (duplicates)', () => {
  let dup;
  test('joining an open request creates a linked request with no new text; joining twice is 409', async () => {
    assert.ok(hanyAsg, 'seed: hany is co-counsel on INH-2026-00482');
    const r = ok(await hany.post(`/api/lawyer/assignments/${hanyAsg}/info-requests`, { duplicate_of_id: ir3.id }), 201);
    dup = t.app.db.get('SELECT * FROM info_requests WHERE id = ?', r.id);
    assert.equal(dup.duplicate_of_id, ir3.id);
    assert.equal(dup.kind, 'document');
    assert.match(dup.question, /^أحتاج هذا أيضًا: /);
    assert.equal((await hany.post(`/api/lawyer/assignments/${hanyAsg}/info-requests`, { duplicate_of_id: ir3.id })).status, 409);
    const v = ok(await hany.get(`/api/lawyer/assignments/${hanyAsg}`));
    assert.equal(v.case_open_requests.find((x) => x.id === ir3.id).joined, true);
    assert.equal(v.info_requests.find((x) => x.id === dup.id).duplicate_of_id, ir3.id);
  });

  test('a request that is not open on the same case cannot be joined', async () => {
    const other = t.app.db.get("SELECT id FROM info_requests WHERE case_id != ? AND status IN ('sent_to_client','client_replied')", caseId);
    if (other) assert.equal((await hany.post(`/api/lawyer/assignments/${hanyAsg}/info-requests`, { duplicate_of_id: other.id })).status, 400);
    assert.equal((await hany.post(`/api/lawyer/assignments/${hanyAsg}/info-requests`, { duplicate_of_id: 999999 })).status, 400);
  });

  test('approving a duplicate for the beneficiary is refused (409)', async () => {
    assert.equal((await admin.post(`/api/admin/info-requests/${dup.id}/approve`, { client_message: 'لا يجب أن يُرسل' })).status, 409);
  });

  test('sharing the original also shares the duplicate, grants the documents and notifies its lawyer', async () => {
    const doc = ok(await admin.get(`/api/admin/cases/${caseId}`)).documents[0];
    ok(await admin.post(`/api/admin/info-requests/${ir3.id}/share`, { response_text: 'أفادت المستفيدة بأن إعلام الوراثة لم يصدر بعد.', document_ids: [doc.id] }));
    const d = t.app.db.get('SELECT * FROM info_requests WHERE id = ?', dup.id);
    assert.equal(d.status, 'shared');
    assert.equal(d.response_text, 'أفادت المستفيدة بأن إعلام الوراثة لم يصدر بعد.');
    const v = ok(await hany.get(`/api/lawyer/assignments/${hanyAsg}`));
    const mine = v.info_requests.find((x) => x.id === dup.id);
    assert.equal(mine.status, 'shared');
    assert.ok(v.documents.some((x) => x.id === doc.id));
    const notes = ok(await hany.get('/api/notifications'));
    const list = notes.items || notes;
    assert.ok(list.some((n) => /أصبحت المعلومة المطلوبة متاحة/.test(n.title) && /tab=requests/.test(n.link || '')));
  });
});

describe('L-04 extension and question to the administration', () => {
  test('extension: date must be after the current due date and within 60 days', async () => {
    const a = t.app.db.get('SELECT * FROM assignments WHERE id = ?', ahmedAsg);
    const dayOf = (iso) => new Date(iso).toISOString().slice(0, 10);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'extension', requested_due_at: a.due_at })).status, 400);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'extension', requested_due_at: addDays(a.due_at, 61) })).status, 400);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'extension', requested_due_date: 'غدًا' })).status, 400);
    void dayOf;
  });

  test('extension request → admin approves with approve_extension → due date moves and the lawyer is told', async () => {
    const a = t.app.db.get('SELECT * FROM assignments WHERE id = ?', ahmedAsg);
    const target = addDays(a.due_at, 3);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(target));
    const r = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'extension', requested_due_date: day, reason: 'بانتظار مستند' }), 201);
    const row = t.app.db.get('SELECT * FROM info_requests WHERE id = ?', r.id);
    assert.equal(row.kind, 'extension');
    // نفس ساعة الموعد الحالي ودقيقته بتوقيت القاهرة، بعد 3 أيام
    assert.ok(Math.abs(new Date(row.requested_due_at).getTime() - new Date(target).getTime()) < 60000);
    assert.match(row.question, /بانتظار مستند/);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'extension', requested_due_date: day })).status, 409, 'one pending extension at a time');
    assert.equal((await admin.post(`/api/admin/info-requests/${r.id}/approve`, { client_message: 'x' })).status, 409);
    ok(await admin.post(`/api/admin/info-requests/${r.id}/share`, { response_text: 'وافقنا على المهلة.', approve_extension: true }));
    assert.equal(t.app.db.get('SELECT due_at FROM assignments WHERE id = ?', ahmedAsg).due_at, row.requested_due_at);
    const v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    assert.equal(v.assignment.due_at, row.requested_due_at);
    const mine = v.info_requests.find((x) => x.id === r.id);
    assert.equal(mine.extension_applied, true);
    assert.equal(mine.requested_due_at, row.requested_due_at);
    const notes = ok(await ahmed.get('/api/notifications'));
    assert.ok((notes.items || notes).some((n) => /مُدّد موعد تسليم رأيك في الملف INH-2026-00482 إلى/.test(n.title)));
  });

  test('question to the administration is answered without the beneficiary', async () => {
    const r = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'admin_question', question: 'هل يمكن إسناد الشق الضريبي لمحامٍ آخر؟' }), 201);
    assert.equal((await admin.post(`/api/admin/info-requests/${r.id}/approve`, { client_message: 'x' })).status, 409);
    ok(await admin.post(`/api/admin/info-requests/${r.id}/share`, { response_text: 'نعم، اطلب ذلك من «مساعدة محامٍ آخر».' }));
    const v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    const mine = v.info_requests.find((x) => x.id === r.id);
    assert.equal(mine.status, 'shared');
    assert.equal(mine.response_text, 'نعم، اطلب ذلك من «مساعدة محامٍ آخر».');
  });

  test('staff cannot create the lawyer-only kinds for the beneficiary', async () => {
    assert.equal((await admin.post(`/api/admin/cases/${caseId}/info-requests`, { kind: 'extension', question: 'مهلة؟ للاختبار' })).status, 400);
    assert.equal((await admin.post(`/api/admin/cases/${caseId}/info-requests`, { kind: 'admin_question', question: 'سؤال؟ للاختبار' })).status, 400);
  });

  test('client_ref makes a request safe to resend', async () => {
    const body = { kind: 'information', question: 'هل يوجد عقد قسمة سابق بين الورثة؟', client_ref: 'test-ref-1' };
    const a = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, body), 201);
    const b = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, body), 201);
    assert.equal(a.id, b.id);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM info_requests WHERE client_ref = 'test-ref-1'")), 1);
  });
});

describe('B91-16 document items in the lawyer request', () => {
  test('items: 1–5 lines, each ≤ 80 characters; question is built from them; reason stays for the admin', async () => {
    const r = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'document', items: ['شهادة وفاة الزوج', 'عقد الشقة إن وُجد'], reason: 'لإثبات الملكية' }), 201);
    const row = t.app.db.get('SELECT * FROM info_requests WHERE id = ?', r.id);
    assert.deepEqual(JSON.parse(row.items), [{ label: 'شهادة وفاة الزوج' }, { label: 'عقد الشقة إن وُجد' }]);
    assert.equal(row.question, 'مطلوب: شهادة وفاة الزوج، عقد الشقة إن وُجد\nلإثبات الملكية');
    const v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    assert.deepEqual(v.info_requests.find((x) => x.id === r.id).items, [{ label: 'شهادة وفاة الزوج', status: null }, { label: 'عقد الشقة إن وُجد', status: null }]);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'document', items: ['1', '2', '3', '4', '5', '6'] })).status, 400);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'document', items: ['م'.repeat(81)] })).status, 400);
    assert.equal((await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'document', items: [] })).status, 400);
  });

  test('per-item status reaches the lawyer only after the reply is shared («وصل» / «ناقص»)', async () => {
    const r = ok(await ahmed.post(`/api/lawyer/assignments/${ahmedAsg}/info-requests`, { kind: 'document', items: ['عقد القسمة', 'إيصال الكهرباء'] }), 201);
    ok(await admin.post(`/api/admin/info-requests/${r.id}/approve`, { client_message: 'محتاجين صورة من الورقتين دول.' }));
    const clientId = ok(await admin.get(`/api/admin/cases/${caseId}`)).client.id;
    const link = ok(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}));
    const token = link.url.split('/p/')[1];
    const portal = t.client();
    const pdf = { filename: 'عقد_القسمة.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') };
    const reply = await portal.post(`/api/portal/${token}/requests/${r.id}/reply`, { documents: [{ ...pdf, item: 0 }], missing_items: [1] });
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    let v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    assert.deepEqual(v.info_requests.find((x) => x.id === r.id).items.map((x) => x.status), [null, null], 'nothing before the admin shares');
    const docs = t.app.db.all('SELECT id FROM documents WHERE info_request_id = ?', r.id).map((d) => d.id);
    ok(await admin.post(`/api/admin/info-requests/${r.id}/share`, { response_text: 'وصل عقد القسمة، ولا يوجد إيصال.', document_ids: docs }));
    v = ok(await ahmed.get(`/api/lawyer/assignments/${ahmedAsg}`));
    assert.deepEqual(v.info_requests.find((x) => x.id === r.id).items, [{ label: 'عقد القسمة', status: 'received' }, { label: 'إيصال الكهرباء', status: 'missing' }]);
    assertNoLeak(v.info_requests.find((x) => x.id === r.id), { keys: [...LAWYER_FORBIDDEN_KEYS, 'client_reply'], values: ['1012345678'] }, 'shared items');
  });
});

describe('L-03 drafts never overwrite newer text silently', () => {
  test('stale base_updated_at with a different body → 409 draft_conflict with the server text; force overrides', async () => {
    const v = ok(await rania.get('/api/lawyer/assignments'));
    const asg = v.find((a) => a.status === 'returned' || a.status === 'in_progress' || a.status === 'assigned');
    assert.ok(asg, 'rania has an editable assignment in the demo');
    const view = ok(await rania.get(`/api/lawyer/assignments/${asg.id}`));
    const base = view.current_draft ? view.current_draft.updated_at : null;
    const first = ok(await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص من الحاسوب للاختبار.', base_updated_at: base || undefined }));
    assert.equal(first.length, 'نص من الحاسوب للاختبار.'.length);
    assert.ok(first.words >= 3);
    // جهاز آخر ما زال على الأساس القديم
    const c = await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص من الهاتف دون اتصال.', base_updated_at: base || '2000-01-01T00:00:00.000Z' });
    assert.equal(c.status, 409);
    assert.equal(c.body.code, 'draft_conflict');
    assert.equal(c.body.details.server_body, 'نص من الحاسوب للاختبار.');
    assert.equal(c.body.details.server_updated_at, first.updated_at);
    // نفس النص بأساس قديم ليس تعارضًا
    ok(await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص من الحاسوب للاختبار.', base_updated_at: '2000-01-01T00:00:00.000Z' }));
    const forced = ok(await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص من الهاتف دون اتصال.', base_updated_at: base || '2000-01-01T00:00:00.000Z', force: true }));
    assert.equal(forced.length, 'نص من الهاتف دون اتصال.'.length);
    const after = ok(await rania.get(`/api/lawyer/assignments/${asg.id}`));
    assert.equal(after.current_draft.body, 'نص من الهاتف دون اتصال.');
  });

  test('client steps (B91-16) are saved with the draft (≤ 8) and returned to the lawyer only', async () => {
    const asg = ok(await rania.get('/api/lawyer/assignments')).find((a) => ['returned', 'in_progress', 'assigned'].includes(a.status));
    ok(await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص الرأي مع خطوات عملية للمستفيدة.', client_steps: ['احتفظي بإيصالات المصروفات', 'اذهبي لمحكمة الأسرة', ''] }));
    const v = ok(await rania.get(`/api/lawyer/assignments/${asg.id}`));
    assert.deepEqual(v.current_draft.client_steps, ['احتفظي بإيصالات المصروفات', 'اذهبي لمحكمة الأسرة']);
    assert.equal((await rania.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص', client_steps: Array.from({ length: 9 }, (_, i) => `خطوة ${i}`) })).status, 400);
  });

  test('demo: rania’s opinion was returned with 3 numbered notes', async () => {
    const asg = ok(await rania.get('/api/lawyer/assignments')).find((a) => a.case_code.startsWith('FAM-'));
    const v = ok(await rania.get(`/api/lawyer/assignments/${asg.id}`));
    const ret = v.my_opinions.find((o) => o.status === 'returned');
    assert.ok(ret);
    assert.equal(parseReviewNotes(ret.review_note).length, 3);
  });
});

describe('client-side pure modules', () => {
  test('text-diff: changing 2 of 10 paragraphs highlights exactly those 2', () => {
    const paras = Array.from({ length: 10 }, (_, i) => `الفقرة ${i + 1}: نص قانوني عن المسألة ${i + 1} والتكييف والرأي فيها.`);
    const next = paras.map((p, i) => (i === 2 ? p.replace('والتكييف', 'والتكييف القانوني الدقيق') : i === 7 ? `${p} مع توصية عملية.` : p));
    const d = diffParagraphs(paras.join('\n\n'), next.join('\n\n'));
    assert.equal(d.changed, 2);
    assert.deepEqual(d.blocks.filter((b) => b.type !== 'same').map((b) => b.type), ['changed', 'changed']);
    assert.ok(d.blocks.find((b) => b.type === 'changed').words.some((w) => w.op === 'add'));
    assert.deepEqual(splitParagraphs('أ\n\n\nب\n'), ['أ', 'ب']);
    assert.deepEqual(wordDiff('أ ب ج', 'أ د ج'), [{ op: 'same', text: 'أ' }, { op: 'del', text: 'ب' }, { op: 'add', text: 'د' }, { op: 'same', text: 'ج' }]);
    const r = diffParagraphs('أ\nب\nج', 'أ\nج\nفقرة جديدة تمامًا');
    assert.deepEqual(r.blocks.map((b) => b.type), ['same', 'removed', 'same', 'added']);
  });

  test('draft-store: restore rules', () => {
    const S = { body: 'نص المنصة', updated_at: '2026-10-07T10:00:00.000Z' };
    assert.equal(decideRestore(S, null).action, 'server');
    assert.equal(decideRestore(S, { body: 'نص المنصة', base_updated_at: 'x' }).action, 'server');
    assert.equal(decideRestore(S, { body: 'نص المنصة وزيادة', base_updated_at: S.updated_at }).action, 'restore');
    assert.equal(decideRestore(S, { body: 'نص آخر', base_updated_at: '2026-10-06T10:00:00.000Z' }).action, 'conflict');
    assert.equal(decideRestore(null, { body: 'نص كُتب قبل أول حفظ', base_updated_at: null }).action, 'restore');
    assert.equal(classifySaveError({ status: 0, code: 'network_error' }), 'offline');
    assert.equal(classifySaveError({ status: 401 }), 'expired');
    assert.equal(classifySaveError({ status: 409, code: 'draft_conflict' }), 'conflict');
    assert.equal(classifySaveError({ status: 409, code: 'conflict' }), 'gone');
    assert.deepEqual(parseReviewNotes('1. أولى\n2. ثانية\nتكملة الثانية\n3. ثالثة'), ['أولى', 'ثانية تكملة الثانية', 'ثالثة']);
    assert.deepEqual(parseReviewNotes('سطر واحد فقط'), ['سطر واحد فقط']);
  });

  test('request-sheet: duplicate detection by normalised token overlap', () => {
    const existing = 'برجاء إرسال صورة إعلام الوراثة إن كان قد صدر، وإن لم يصدر بعد نرجو إفادتنا بذلك.';
    assert.ok(similarity('صورة إعلام الوراثة', existing) >= 0.6);
    assert.ok(similarity('اعلام وراثة', existing) >= 0.6);
    assert.ok(similarity('صورة عقد القسمة الرضائية', existing) < 0.6);
    assert.equal(similarity('عقد', existing), 0, 'single words never warn');
    assert.ok(normTokens('الوراثة').includes('وراثه'));
  });

  test('L-14 skeleton: every granted active issue with its number, no «[يُستكمل»', () => {
    const sk = opinionSkeleton([
      { number: 2, title: 'حماية حقوق القاصرين', status: 'active' },
      { number: 4, title: 'امتناع الأخ الأكبر عن القسمة', status: 'active' },
      { number: 5, title: 'مسألة مقترحة', status: 'proposed' },
    ]);
    assert.match(sk, /^أولًا: الوقائع المؤثرة/);
    assert.match(sk, /المسألة 2: حماية حقوق القاصرين/);
    assert.match(sk, /المسألة 4: امتناع الأخ الأكبر عن القسمة/);
    assert.doesNotMatch(sk, /مسألة مقترحة/);
    assert.doesNotMatch(sk, /\[يُستكمل/);
    assert.match(sk, /خامسًا: المستندات المطلوبة$/);
  });
});

describe('review fixes (l-work)', () => {
  test('privacy: what was asked of the beneficiary reaches a lawyer without her name (not granted), phone or link — also in the joined request', async () => {
    const r = ok(
      await admin.post(`/api/admin/cases/${caseId}/info-requests`, {
        kind: 'information',
        question: 'هل يوجد عقد قسمة رضائية موقّع من الورثة؟',
        client_message: 'أستاذة سامية، هل عندكم عقد قسمة رضائية موقّع؟ ممكن تردي على 01012345678 أو من الرابط https://example.org/p/abc123',
      }),
    );
    assert.equal(r.status, 'sent_to_client');
    const v = ok(await hany.get(`/api/lawyer/assignments/${hanyAsg}`));
    assert.equal(v.client_label, null, 'hany has no name grant in the demo');
    const row = v.case_open_requests.find((x) => x.id === r.id);
    assert.ok(row);
    assert.doesNotMatch(row.client_message, /سامية|01012345678|https?:|abc123/);
    assert.match(row.client_message, /عقد قسمة رضائية/);
    const dup = ok(await hany.post(`/api/lawyer/assignments/${hanyAsg}/info-requests`, { duplicate_of_id: r.id }), 201);
    const stored = t.app.db.get('SELECT question FROM info_requests WHERE id = ?', dup.id).question;
    assert.doesNotMatch(stored, /سامية|01012345678|abc123/);
    const again = ok(await hany.get(`/api/lawyer/assignments/${hanyAsg}`));
    assertNoLeak(again.info_requests, { keys: LAWYER_FORBIDDEN_KEYS, values: ['سامية', '01012345678', 'abc123'] }, 'own requests');
    assertNoLeak(again.case_open_requests, { keys: LAWYER_FORBIDDEN_KEYS, values: ['سامية', '01012345678', 'abc123'] }, 'open requests');
  });

  test('a joined request shows the original’s granted documents and paper items in the lawyer’s own row once shared', async () => {
    const v = ok(await hany.get(`/api/lawyer/assignments/${hanyAsg}`));
    const mine = v.info_requests.find((x) => x.own && x.duplicate_of_id === ir3.id);
    assert.ok(mine, 'hany joined «إعلام الوراثة» earlier in this file');
    assert.equal(mine.status, 'shared');
    assert.ok(mine.documents.length >= 1, 'the documents shared with the original appear in his row');
    assert.ok(mine.documents.every((d) => v.documents.some((g) => g.id === d.id)), 'only documents granted to him');
    const origItems = JSON.parse(t.app.db.get('SELECT items FROM info_requests WHERE id = ?', ir3.id).items || '[]');
    assert.equal(mine.items.length, origItems.length);
    assert.ok(mine.items.every((it) => ['received', 'missing', 'needed'].includes(it.status)));
  });

  test('a stale window cannot submit over newer text from another device (409 draft_conflict); with the current base it submits', async () => {
    const asg = ok(await hany.get('/api/lawyer/assignments')).find((a) => a.case_code.startsWith('CRM-'));
    assert.ok(asg, 'hany has the overdue CRM assignment in the demo');
    const view = ok(await hany.get(`/api/lawyer/assignments/${asg.id}`));
    const base0 = view.current_draft ? view.current_draft.updated_at : 'none';
    const laptop = ok(await hany.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص الحاسوب الأحدث للرأي في محضر السب والقذف.', base_updated_at: base0 }));
    const stale = await hany.post(`/api/lawyer/assignments/${asg.id}/submit`, { body: 'نص الهاتف القديم للرأي في محضر السب والقذف.', base_updated_at: base0 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'draft_conflict');
    assert.equal(stale.body.details.server_body, 'نص الحاسوب الأحدث للرأي في محضر السب والقذف.');
    assert.equal(t.app.db.get('SELECT status FROM assignments WHERE id = ?', asg.id).status, 'in_progress');
    // «none»: بدأ الجهاز قبل وجود مسودة — وجود مسودة مختلفة الآن تعارض، لا كتابة فوقها
    assert.equal((await hany.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'نص ثالث مختلف تمامًا.', base_updated_at: 'none' })).body.code, 'draft_conflict');
    const done = ok(await hany.post(`/api/lawyer/assignments/${asg.id}/submit`, { body: 'نص الحاسوب الأحدث للرأي في محضر السب والقذف.', base_updated_at: laptop.updated_at }));
    assert.equal(done.status, 'submitted');
  });

  test('draft-store: offline text is sent on app entry with its base (never over newer text); logout revokes stores created before it', async () => {
    const mem = () => {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, val) => m.set(k, String(val)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
    };
    const prev = { window: globalThis.window, document: globalThis.document };
    globalThis.window = { localStorage: mem(), sessionStorage: mem(), location: { hash: '#/my' }, addEventListener() {}, removeEventListener() {} };
    globalThis.document = { visibilityState: 'visible' };
    try {
      const u = { id: 77 };
      const s1 = createDraftStore({ userId: 77, assignmentId: 5, code: 'INH-1' });
      s1.write({ body: 'نص كُتب دون اتصال', base_updated_at: 'T1' });
      const s2 = createDraftStore({ userId: 77, assignmentId: 6, code: 'FAM-2' });
      s2.write({ body: 'نص على أساس قديم', base_updated_at: null });
      const calls = [];
      const request = async (p, body) => {
        calls.push([p, body]);
        if (p.includes('/6/')) throw Object.assign(new Error('conflict'), { status: 409, code: 'draft_conflict' });
        return { length: body.body.length };
      };
      const notes = [];
      const res = await syncPendingDrafts(u, { request, notify: (x) => notes.push(x) });
      assert.deepEqual(res.saved, ['INH-1']);
      assert.equal(res.pending, 1, 'the conflicting text stays on the device for the editor');
      assert.equal(calls.find((c) => c[0].includes('/5/'))[1].base_updated_at, 'T1');
      assert.equal(calls.find((c) => c[0].includes('/6/'))[1].base_updated_at, 'none');
      assert.match(notes[0], /حُفظ نص رأيك في INH-1 على المنصة/);
      // صفحة الكتابة المفتوحة تتولى نسختها بنفسها
      window.location.hash = '#/my/assignments/6/write';
      calls.length = 0;
      await syncPendingDrafts(u, { request, notify: null });
      assert.equal(calls.length, 0);
      // الخروج: لا يعيد مخزن قديم كتابة ما حُذف
      clearUserDrafts(77);
      s2.write({ body: 'كتابة متأخرة بعد الخروج' });
      assert.equal(listUserDrafts(77).length, 0);
      createDraftStore({ userId: 77, assignmentId: 6 }).write({ body: 'دخول جديد' });
      assert.equal(listUserDrafts(77).length, 1);
    } finally {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
    }
  });

  test('static: expiry backup runs before the login screen; stale submit is guarded; inline join; pending extension under the deadline', () => {
    const write = read('public/assets/js/app/pages/lawyer/write.js');
    const asg = read('public/assets/js/app/pages/lawyer/assignment.js');
    const sheet = read('public/assets/js/app/components/request-sheet.js');
    assert.match(write, /addEventListener\('auth:expired', onExpired, \{ capture: true \}\)/);
    assert.match(write, /submit`, \{[\s\S]*?base_updated_at: baseAt \|\| 'none'/);
    assert.match(write, /'aria-label': 'المطلوب والمسائل'/);
    assert.match(sheet, /lw-dup-join/);
    assert.match(sheet, /suggestCache\.delete\(base\)/);
    assert.ok(asg.includes('طلبت مهلة حتى'));
    assert.ok(asg.includes('سيصلك الرد نفسه عند وصوله'));
    assert.match(read('public/assets/js/app/main.js'), /syncPendingDrafts\(user\)/);
  });
});

describe('static checks of key copy and markup', () => {
  const asg = read('public/assets/js/app/pages/lawyer/assignment.js');
  const write = read('public/assets/js/app/pages/lawyer/write.js');
  const viewer = read('public/assets/js/app/components/doc-viewer.js');
  const sheet = read('public/assets/js/app/components/request-sheet.js');
  test('writing mode route and copy', () => {
    assert.match(read('public/assets/js/app/routes.js'), /'\/my\/assignments\/:id\/write'/);
    for (const s of ['بلا اتصال — نصك محفوظ على هذا الجهاز', 'بلا اتصال — نصك محفوظ في هذه النافذة فقط', 'تعذر الحفظ — نعيد المحاولة', 'انتهت الجلسة — نصك محفوظ على هذا الجهاز', 'ادخل للمتابعة', 'اكتب رأيك هنا…', 'تقديم الرأي للإدارة؟', 'لن تستطيع التعديل أثناء المراجعة. ستصلك النتيجة هنا.', 'قدّم الآن', 'ليس الآن', '+ عدد الساعات (اختياري)', 'احذف أو أكمل أجزاء «[يُستكمل…]» قبل التقديم.', 'يوجد نصّان مختلفان', 'استخدم نص هذا الجهاز', 'استخدم نص المنصة', 'انسخ النص الآخر', 'قارن بالإصدار المعاد', 'رجوع للكتابة', 'هيكل الرأي', 'مسودة أولية آلية', 'مسودة للمساعدة فقط — راجعها قبل التقديم.', 'Ctrl+S للحفظ الفوري', 'خطوات عملية للمستفيد/ة (اختياري)', 'بلغة بسيطة؛ تراجعها الإدارة قبل الإرسال ولا تظهر باسمك.']) {
      assert.ok(write.includes(s), s);
    }
    assert.ok(!write.includes('تُسجَّل تعديلاتك عليها لتحسين جودة المساعد'), 'monitoring sentence removed');
    assert.ok(!asg.includes('تُسجَّل تعديلاتك عليها لتحسين جودة المساعد'));
    assert.ok(!/sessionStorage[^\n]*pc-draft-backup/.test(write + asg), 'session-only backup is gone');
  });
  test('assignment page copy: one privacy reminder, removed banners, beneficiary line', () => {
    assert.equal(asg.split('تصل طلباتك للإدارة، وهي التي تتواصل مع المستفيد/ة.').length - 1, 1);
    assert.ok(!asg.includes('سُجّل فتحك للملف'));
    assert.ok(!asg.includes('هذا الملف مُسند إليك'));
    assert.ok(!asg.includes('ملخص الإسناد'));
    assert.ok(!asg.includes('بيانات الهوية غير متاحة'));
    for (const s of ['اسم المستفيد/ة محجوب للخصوصية.', 'سلّم رأيك قبل', 'اطلب مهلة', 'أعادت الإدارة رأيك — ', 'ابدأ التعديل', 'اقرأ الباقي', 'اقترح مسألة', 'لم تُتح لك الإدارة مستندات بعد. اطلب ما تحتاجه من «اطلب».', 'مطلوب بالفعل من المستفيد/ة', 'ردود متاحة لك', 'أكمل الكتابة', 'الإصدارات السابقة', 'أُعيد بملاحظات', 'اكتب رأيك', 'عدّل رأيك']) {
      assert.ok(asg.includes(s), s);
    }
  });
  test('documents open in-app; download is an explicit menu choice without the download attribute', () => {
    assert.ok(viewer.includes('?inline=1'));
    assert.ok(viewer.includes("window.open(viewUrl(d.id), '_blank', 'noopener')"));
    assert.ok(viewer.includes('touch-action') || read('public/assets/css/v91-lawyer-work.css').includes('touch-action: pan-x pan-y pinch-zoom'));
    assert.ok(!/setAttribute\('download'/.test(viewer + asg));
    assert.ok(viewer.includes('تنزيل على الهاتف') && viewer.includes('يبقى الملف في التنزيلات؛ احذفه بعد الانتهاء.'));
    assert.ok(viewer.includes("claude && onAnalyze ? item('تحليل المستند'"), 'analysis only with Claude');
  });
  test('request sheet copy', () => {
    for (const s of ['ماذا تحتاج؟', 'مستند من المستفيد/ة', 'معلومة من المستفيد/ة', 'مهلة إضافية', 'سؤال للإدارة', 'مساعدة محامٍ آخر', 'مطلوب بالفعل من المستفيد/ة:', 'أحتاج هذا أيضًا', 'سيصلك الرد نفسه عند وصوله، دون سؤال المستفيد/ة مرة أخرى.', 'يشبه طلبًا قائمًا', 'أرسل للإدارة', 'حتى أي يوم؟', 'بانتظار مستند', 'ضغط جلسات', 'أحتاج وقتًا للبحث', '+ ملاحظة', 'اطلب المهلة', 'سؤالك', 'اقتراحات:', 'المستندات المطلوبة (مستند في كل سطر)', 'تظهر للمستفيد/ة قائمةً تصوّر كل بند منها على حدة، بعد موافقة الإدارة.', 'سبب الطلب (للإدارة فقط، اختياري)', 'مثال: هل للمتوفى أبناء من زواج آخر؟']) {
      assert.ok(sheet.includes(s), s);
    }
  });
  test('the CSS for the lawyer work lane is loaded by the app page', () => {
    assert.match(read('public/app.html'), /v91-lawyer-work\.css/);
  });
});
