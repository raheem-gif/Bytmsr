// Lane B — Requirement 12: knowledge pipeline. Closing a case creates a knowledge record with personal data redacted
// (no client name / phone / national id / email), status pending_review; only staff approval with a confirmed
// redaction review makes it usable; lawyer AI help and similar-case retrieval use ONLY approved anonymized knowledge.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, newCase, assign, lawyerSubmits, approveOpinion, allKeys } from './lane-b-kit.test.js';

const NAME = 'سامية محمود عبد الحميد';
const PHONE = '01012345678';
const NID = '29001011234567';
const EMAIL = 'samia.k@example.com';
const PII = [NAME, 'سامية محمود', 'سامية', '1012345678', '101 234 5678', NID, EMAIL];

let t;
let admin;
let lead;
let cLead;
let other;
let cOther;
let k1;
let rec;
let probeAsg; // a new, similar case assigned to another lawyer

const FACTS = `العميلة ${NAME} (موبايل ${PHONE}، رقم قومي ${NID}، بريد ${EMAIL}) توفي والدها وترك شقة بالمعادي ومحلًا تجاريًا، والأخ الأكبر يرفض قسمة التركة ويضع يده على المحل التجاري.`;
const OPINION = 'الرأي: يحق للسيدة سامية ولباقي الورثة رفع دعوى فرز وتجنيب للمحل التجاري والشقة، مع المطالبة بريع المحل عن مدة وضع اليد، KNOWLEDGEMARK';
const ANSWER = `تحية طيبة أستاذة سامية، بخصوص ملفكم: يمكنكم رفع دعوى فرز وتجنيب. للتواصل معنا على نفس الرقم 0101 234 5678.`;

before(async () => {
  t = await startTestApp({ seed: 'none' });
  admin = await t.login('admin');
  lead = await createLawyer(admin, { name: 'أحمد عبد العظيم', specialties: ['INH'] });
  other = await createLawyer(admin, { name: 'نبيل الجديد', specialties: ['INH'] });
  cLead = await t.login(lead.username);
  cOther = await t.login(other.username);
  k1 = await newCase(admin, {
    phone: PHONE,
    clientName: NAME,
    national_id: NID,
    email: EMAIL,
    legal_area: 'INH',
    title: `تركة ${NAME}: شقة ومحل تجاري ورفض القسمة`,
    facts_shared: FACTS,
    issues: ['قسمة التركة بين الورثة: شقة ومحل تجاري', 'امتناع أحد الورثة عن القسمة ووضع يده على المحل'],
  });
  const a = await assign(admin, k1.id, { lawyer_id: lead.id, role: 'lead' });
  await approveOpinion(admin, await lawyerSubmits(cLead, a.id, OPINION));
  const ans = ok(await admin.post(`/api/admin/cases/${k1.id}/client-answers`, { body: ANSWER }));
  ok(await admin.post(`/api/admin/client-answers/${ans.id}/send`, {}));

  // a later, similar case handled by another lawyer — used to probe what lawyers can retrieve
  const k2 = await newCase(admin, {
    legal_area: 'INH',
    title: 'نزاع على قسمة تركة: شقة ومحل تجاري وأحد الورثة يرفض القسمة',
    facts_shared: 'توفي المورث وترك شقة ومحلًا تجاريًا، وأحد الورثة يضع يده على المحل ويرفض قسمة التركة.',
    issues: ['قسمة التركة بين الورثة'],
  });
  probeAsg = await assign(admin, k2.id, { lawyer_id: other.id, role: 'lead' });
});

after(async () => {
  await t?.close();
});

async function lawyerSimilar() {
  return ok(await cOther.get(`/api/lawyer/assignments/${probeAsg.id}/similar`));
}

test('no knowledge record exists before closure; closing creates one pending review with usage none', async () => {
  assert.equal(ok(await admin.get('/api/admin/knowledge')).items.length, 0);
  ok(await admin.post(`/api/admin/cases/${k1.id}/close`, { outcome: 'answered' }));
  const list = ok(await admin.get('/api/admin/knowledge'));
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].status, 'pending_review');
  assert.equal(list.items[0].usage, 'none');
  assert.equal(list.stats.pending_review, 1);
  rec = ok(await admin.get(`/api/admin/knowledge/${list.items[0].id}`));
  assert.equal(rec.case_id, k1.id);
  assert.equal(rec.redaction_report.reviewed, false);
  assert.ok((ok(await admin.get('/api/notifications?limit=100')).items).some((n) => n.type === 'knowledge.pending'));
  const d = ok(await admin.get(`/api/admin/cases/${k1.id}`));
  assert.equal(d.knowledge.status, 'pending_review');
});

test('the knowledge record is redacted: no client name, phone (any format), national id or email anywhere', async () => {
  const { case_code: _cc, ...content } = rec; // the admin-only link back to the source file is metadata, not content
  const s = JSON.stringify(content);
  for (const v of PII) assert.equal(s.includes(v), false, `knowledge record leaks «${v}»`);
  assert.ok(rec.facts.includes('[اسم]'));
  assert.ok(rec.facts.includes('[رقم هاتف]'));
  assert.ok(rec.facts.includes('[رقم قومي]'));
  assert.ok(rec.facts.includes('[بريد إلكتروني]'));
  assert.ok(rec.final_answer.includes('KNOWLEDGEMARK'), 'the approved opinion is kept (redacted)');
  assert.ok(rec.client_answer && !rec.client_answer.includes('سامية'));
  assert.ok(rec.title.includes('[اسم]'));
  assert.equal(rec.title.includes(k1.code), false);
  assert.ok(rec.redaction_report.counts.names >= 1);
  assert.ok(rec.redaction_report.counts.phones >= 1);
  assert.ok(Array.isArray(rec.journey) && rec.journey.length > 0, 'the case journey is kept for learning');
});

test('before approval lawyers retrieve nothing from it (similar cases + AI draft)', async () => {
  const sim = await lawyerSimilar();
  assert.equal(sim.items.some((x) => x.id === rec.id), false);
  assert.equal(sim.total, 0);
  const draft = ok(await cOther.post(`/api/lawyer/assignments/${probeAsg.id}/ai/draft`));
  assert.equal(draft.text.includes('KNOWLEDGEMARK'), false, 'unapproved knowledge must not feed lawyer AI drafts');
  assert.equal(draft.text.includes('دعوى فرز وتجنيب'), false);
});

test('approval requires a usage scope and an explicit redaction confirmation; lawyers cannot approve', async () => {
  assert.equal((await cLead.post(`/api/admin/knowledge/${rec.id}/approve`, { usage: 'knowledge', confirm_redaction: true })).status, 403);
  assert.equal((await cLead.get(`/api/admin/knowledge/${rec.id}`)).status, 403);
  assert.equal((await admin.post(`/api/admin/knowledge/${rec.id}/approve`, { usage: 'knowledge' })).status, 400);
  assert.equal((await admin.post(`/api/admin/knowledge/${rec.id}/approve`, { confirm_redaction: true })).status, 400);
  assert.equal((await admin.post(`/api/admin/knowledge/${rec.id}/approve`, { usage: 'none', confirm_redaction: true })).status, 400);
  assert.equal(ok(await admin.get(`/api/admin/knowledge/${rec.id}`)).status, 'pending_review');
  const a = ok(await admin.post(`/api/admin/knowledge/${rec.id}/approve`, { usage: 'knowledge', confirm_redaction: true, note: 'راجعت الإخفاء' }));
  assert.equal(a.status, 'approved');
  assert.equal(a.usage, 'knowledge');
  assert.equal(a.redaction_report.reviewed, true);
});

test('after approval the lawyer similar endpoint returns the anonymized record only (no PII, no link to the source file)', async () => {
  const sim = await lawyerSimilar();
  const hit = sim.items.find((x) => x.id === rec.id);
  assert.ok(hit, 'approved knowledge is retrievable by lawyers');
  assert.equal(hit.type, 'knowledge');
  const keys = allKeys(sim);
  for (const k of ['case_id', 'case_code', 'code', 'client_id', 'phone', 'national_id']) assert.equal(keys.has(k), false, `similar result exposes ${k}`);
  const s = JSON.stringify(sim);
  for (const v of [...PII, k1.code]) assert.equal(s.includes(v), false, `similar result leaks «${v}»`);
  assert.ok(sim.items.every((x) => x.type === 'knowledge'), 'lawyers never get raw case files as similar cases');
  const draft = ok(await cOther.post(`/api/lawyer/assignments/${probeAsg.id}/ai/draft`));
  assert.ok(draft.text.includes('[اسم]') || draft.text.includes('دعوى فرز وتجنيب'), 'approved knowledge now informs the AI draft');
  for (const v of PII) assert.equal(draft.text.includes(v), false, `AI draft leaks «${v}»`);
  const search = ok(await admin.get(`/api/admin/knowledge/search?q=${encodeURIComponent('قسمة تركة شقة ومحل')}`));
  assert.ok(search.items.some((x) => x.id === rec.id));
});

test('editing an approved record sends it back to review and removes it from lawyer retrieval; rebuild of approved is refused', async () => {
  assert.equal((await admin.post(`/api/admin/knowledge/${rec.id}/rebuild`)).status, 409);
  const e = ok(await admin.patch(`/api/admin/knowledge/${rec.id}`, { facts: `${rec.facts} (تعديل بعد المراجعة)` }));
  assert.equal(e.status, 'pending_review');
  assert.equal(e.usage, 'none');
  assert.equal((await lawyerSimilar()).items.some((x) => x.id === rec.id), false);
  ok(await admin.post(`/api/admin/knowledge/${rec.id}/approve`, { usage: 'knowledge_training', confirm_redaction: true }));
  assert.ok((await lawyerSimilar()).items.some((x) => x.id === rec.id));
  const exp = ok(await admin.get('/api/admin/knowledge/export'));
  assert.deepEqual(exp.records.map((r) => r.id), [rec.id]);
  for (const v of PII) assert.equal(JSON.stringify(exp).includes(v), false);
  // reopening the source case pulls the approved record out of retrieval and export until it is re-reviewed
  ok(await admin.post(`/api/admin/cases/${k1.id}/reopen`, {}));
  const reopened = ok(await admin.get(`/api/admin/knowledge/${rec.id}`));
  assert.equal(reopened.status, 'pending_review');
  assert.equal(reopened.usage, 'none');
  assert.equal((await lawyerSimilar()).items.some((x) => x.id === rec.id), false);
  assert.deepEqual(ok(await admin.get('/api/admin/knowledge/export')).records, []);
  ok(await admin.patch(`/api/admin/cases/${k1.id}`, { facts_shared: `${FACTS} وقائع جديدة لم تُراجع بعد NEWUNREVIEWED` }));
  ok(await admin.post(`/api/admin/cases/${k1.id}/close`, { outcome: 'answered' }));
  // re-closing rebuilds it from the corrected case, still unapproved, and asks staff to re-review
  const again = ok(await admin.get(`/api/admin/knowledge/${rec.id}`));
  assert.equal(again.status, 'pending_review');
  assert.equal(again.facts.includes('NEWUNREVIEWED'), true);
  assert.equal((await lawyerSimilar()).items.some((x) => x.id === rec.id), false);
  assert.deepEqual(ok(await admin.get('/api/admin/knowledge/export')).records, []);
  const notes = ok(await admin.get('/api/notifications')).items;
  assert.ok(notes.some((n) => n.type === 'knowledge.pending' && n.title.includes('إعادة مراجعة')));
});

test('excluded records are never used for lawyer retrieval or training export', async () => {
  ok(await admin.post(`/api/admin/knowledge/${rec.id}/exclude`, { note: 'حالة حساسة' }));
  assert.equal((await lawyerSimilar()).items.some((x) => x.id === rec.id), false);
  assert.deepEqual(ok(await admin.get('/api/admin/knowledge/export')).records, []);
  assert.equal((await admin.post(`/api/admin/knowledge/${rec.id}/exclude`, {})).status, 400, 'a reason is required');
});

test('a client name written with the common ه/ة spelling variant is also redacted', async () => {
  const k = await newCase(admin, {
    clientName: 'نادية فاروق الشناوي',
    legal_area: 'INH',
    title: 'تركة وقسمة أرض زراعية',
    facts_shared: 'تقدمت ناديه فاروق الشناوي بطلب بشأن قسمة أرض زراعية موروثة عن والدها مع إخوتها.',
  });
  ok(await admin.post(`/api/admin/cases/${k.id}/close`, { outcome: 'resolved' }));
  const items = ok(await admin.get('/api/admin/knowledge')).items;
  const r = ok(await admin.get(`/api/admin/knowledge/${items.find((x) => x.case_id === k.id).id}`));
  assert.equal(r.facts.includes('ناديه فاروق'), false, `client name leaked into knowledge facts: ${r.facts}`);
});

test('redaction keeps ordinary legal wording: a word ending in «د.» or «م.» does not turn the next words into [اسم]', async () => {
  const L2 = await createLawyer(admin, { name: 'رامي الصاوي', specialties: ['INH'] });
  const c2 = await t.login(L2.username);
  const k = await newCase(admin, { clientName: 'عميل المعرفة الثاني', legal_area: 'INH', title: 'ريع المحل الموروث', facts_shared: 'أحد الورثة يستغل المحل الموروث منفردًا منذ وفاة المورث ويرفض أداء الريع.' });
  const a = await assign(admin, k.id, { lawyer_id: L2.id, role: 'lead' });
  const text = 'صدر الحكم. وبالتالي يجوز رفع دعوى الريع عن مدة وضع اليد. ويستحق الورثة الريع كاملًا من تاريخ الوفاة.';
  await approveOpinion(admin, await lawyerSubmits(c2, a.id, text));
  ok(await admin.post(`/api/admin/cases/${k.id}/close`, { outcome: 'answered' }));
  const items = ok(await admin.get('/api/admin/knowledge')).items;
  const r = ok(await admin.get(`/api/admin/knowledge/${items.find((x) => x.case_id === k.id).id}`));
  for (const w of ['وبالتالي يجوز', 'ويستحق الورثة']) {
    assert.ok(r.final_answer.includes(w), `non-personal legal text «${w}» was destroyed by redaction: ${r.final_answer}`);
  }
});

test('redaction keeps legal kinship wording and Cairo place names, but still hides names after kin words and titles', async () => {
  const { redact } = await import('../src/ai/redact.js');
  const keep = [
    'استحقاق ابني الابن المتوفى قبل أبيه للوصية الواجبة',
    'أحفاد الابن المتوفى قبل أبيه',
    'ترك المتوفى أبناءً ذكورًا وإناثًا',
    'معاش زوجها المتوفى وكيفية صرفه',
    'ومحل في السيدة زينب. نحن ثلاثة إخوة',
    'شقة في السيدة نفيسة وشقة أخرى',
  ];
  for (const s of keep) assert.equal(redact(s).text, s, `legal wording was mangled by redaction: ${redact(s).text}`);
  assert.equal(redact('المرحوم محمود عبد الحميد ترك شقة').text, 'المرحوم [اسم] ترك شقة');
  assert.equal(redact('أخويا محمود رافض القسمة').text, 'أخويا [اسم] رافض القسمة');
  assert.equal(redact('السيدة زينب محمد تطلب').text.includes('محمد'), false, 'a person named after a saint place is still redacted');
});
