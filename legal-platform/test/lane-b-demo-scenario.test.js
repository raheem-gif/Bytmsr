// Lane B — scenario checks against the demo seed (INH-2026-00482 and friends).
// ahmed = lead counsel; mohamed = tax specialist granted ONLY issue #3 + 2 documents; client CL-00881.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { ok, assertNoLeak, LAWYER_FORBIDDEN_KEYS, runAutomations, outbox } from './lane-b-kit.test.js';

let t;
let admin;
let ahmed;
let mohamed;
let hany;
let caseId;
let detail;

before(async () => {
  t = await startTestApp({ seed: 'demo' });
  admin = await t.login('admin');
  ahmed = await t.login('ahmed');
  mohamed = await t.login('mohamed');
  hany = await t.login('hany');
  const list = ok(await admin.get('/api/admin/cases?q=INH-2026-00482'));
  caseId = list.items[0].id;
  detail = ok(await admin.get(`/api/admin/cases/${caseId}`));
});

after(async () => {
  await t?.close();
});

function asgOf(username) {
  const lw = { ahmed: 'أحمد', mohamed: 'محمد فؤاد' }[username];
  return detail.assignments.find((a) => a.lawyer_name.includes(lw));
}

test('admin sees the full picture of INH-2026-00482: client CL-00881, phone, source and the whole team', async () => {
  assert.equal(detail.case.code, 'INH-2026-00482');
  assert.equal(detail.client.code, 'CL-00881');
  assert.equal(detail.client.name, 'سامية محمود عبد الحميد');
  assert.equal(detail.client.phone, '+201012345678');
  assert.equal(detail.intake.source, 'facebook_ad');
  assert.equal(detail.intake.first_channel, 'whatsapp');
  const spec = asgOf('mohamed');
  assert.equal(spec.role, 'specialist');
  const issue3 = detail.issues.find((i) => i.number === 3);
  assert.deepEqual(spec.grants.issue_ids, [issue3.id]);
  assert.equal(spec.grants.document_ids.length, 2);
  assert.equal(spec.grants.client_name, false);
  assert.deepEqual({ treatment: spec.billing.treatment, amount: spec.billing.amount }, { treatment: 'payable', amount: 250 });
});

test('mohamed (tax specialist) sees only issue #3 and the two granted documents — no identity, no conversation', async () => {
  const spec = asgOf('mohamed');
  const v = ok(await mohamed.get(`/api/lawyer/assignments/${spec.id}`));
  assert.equal(v.case.code, 'INH-2026-00482');
  assert.deepEqual(v.issues.map((i) => i.number), [3]);
  assert.equal(v.documents.length, 2);
  assert.deepEqual(v.documents.map((d) => d.id).sort(), [...spec.grants.document_ids].sort());
  assertNoLeak(v, { keys: LAWYER_FORBIDDEN_KEYS, values: ['سامية', '1012345678', 'CL-00881', 'إعلان فيسبوك', 'المعادي ومحل في السيدة زينب. احنا 3'] }, 'mohamed view');
  const ungranted = detail.documents.filter((d) => !spec.grants.document_ids.includes(d.id));
  assert.ok(ungranted.length >= 1);
  for (const d of ungranted) assert.equal((await mohamed.get(`/api/documents/${d.id}/download`)).status, 404);
  assert.equal((await mohamed.get(`/api/lawyer/assignments/${asgOf('ahmed').id}`)).status, 404);
});

test("ahmed (lead) sees mohamed's approved specialist opinion and the completed counsel request; hany sees nothing", async () => {
  const lead = asgOf('ahmed');
  const v = ok(await ahmed.get(`/api/lawyer/assignments/${lead.id}`));
  const spec = v.team.find((m) => m.role === 'specialist');
  assert.ok(spec && spec.opinion, 'specialist opinion visible to the requesting lead');
  assert.ok(spec.opinion.body.includes('المسألة رقم 3'));
  assert.equal(v.counsel_requests[0].status, 'completed');
  assert.equal(v.issues.length, 4);
  assertNoLeak(v, { keys: LAWYER_FORBIDDEN_KEYS, values: ['1012345678', 'سامية محمود'] }, 'ahmed view');
  assert.equal((await hany.get(`/api/lawyer/assignments/${lead.id}`)).status, 404);
  assert.equal((await hany.get(`/api/lawyer/assignments/${asgOf('mohamed').id}`)).status, 404);
  for (const d of detail.documents) assert.equal((await hany.get(`/api/documents/${d.id}/download`)).status, 404);
});

test('demo automations: running twice never duplicates a hearing reminder', async () => {
  await runAutomations(admin);
  const second = await runAutomations(admin);
  assert.equal(second.hearing_reminder, 0);
  assert.equal(second.invoice_reminder, 0);
  const reminders = (await outbox(admin)).filter((m) => m.automation_rule === 'hearing_reminder');
  const perEvent = new Map();
  for (const m of reminders) perEvent.set(m.matter_id, (perEvent.get(m.matter_id) || 0) + 1);
  assert.ok(reminders.length >= 1, 'the seeded hearing in 2 days with required attendance was reminded');
  for (const [, n] of perEvent) assert.equal(n, 1);
  assert.ok(reminders.every((m) => m.status === 'simulated'));
});
