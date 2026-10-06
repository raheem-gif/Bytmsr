// تقوية الخصوصية بعد المراجعة: رقم الهاتف المُدخل في الموقع لا يمنح أي وصول لبيانات صاحب الرقم الحقيقي،
// لا بتحويل رسائل واتساب اللاحقة، ولا بذكر رقم طلبه، ولا برابط بوابة لا يمكن إلغاؤه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';

const VICTIM_WA = '201011111111';
const VICTIM_LOCAL = '01011111111';

async function victimWithCase(t) {
  const admin = await t.login('admin');
  await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, name: 'صاحب الرقم', text: 'والدي توفي وعايز أعرف نصيبي في الميراث والشقة' }));
  const intake = t.app.db.get("SELECT * FROM intakes WHERE contact_name = 'صاحب الرقم'");
  const conv = await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ميراث', facts_shared: 'وقائع' });
  assert.equal(conv.status, 201, JSON.stringify(conv.body));
  return { admin, intake, caseId: conv.body.case.id };
}

async function attackerSubmits(t, description = 'أريد معرفة حالة ملفي من فضلكم، هذا وصف كافٍ للطلب.') {
  const attacker = t.client();
  const sub = await attacker.post('/api/public/intake', { name: 'منتحل', phone: VICTIM_LOCAL, description, consent: true, attribution: {} });
  assert.equal(sub.status, 201, JSON.stringify(sub.body));
  const token = sub.body.portal_url.split('/p/')[1];
  const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', sub.body.reference);
  return { attacker, sub, token, intake };
}

test('later WhatsApp messages from the real phone owner stay out of an unverified website intake', async () => {
  const t = await startTestApp();
  try {
    const { admin, caseId } = await victimWithCase(t);
    const { attacker, token, intake } = await attackerSubmits(t);

    await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, name: 'صاحب الرقم', text: 'رقمي القومي 29001011234567 وعنواني في شبرا' }));
    const msg = t.app.db.get("SELECT * FROM messages WHERE body LIKE 'رقمي القومي%'");
    assert.equal(msg.case_id, caseId, 'the owner\'s message goes to the owner\'s own open case');
    assert.notEqual(msg.intake_id, intake.id);

    // a staff reply on the owner's case is not visible through the website link either
    await admin.post(`/api/admin/cases/${caseId}/messages`, { body: 'رد سري على صاحب الرقم' });
    const portal = await attacker.get(`/api/portal/${token}`);
    const dump = JSON.stringify(portal.body);
    assert.ok(!dump.includes('رقمي القومي'), 'owner WhatsApp text must not reach the website portal');
    assert.ok(!dump.includes('رد سري'), 'staff replies to the owner must not reach the website portal');
  } finally {
    await t.close();
  }
});

test('with no other open file, the owner\'s WhatsApp opens a new intake instead of joining the unverified one', async () => {
  const t = await startTestApp();
  try {
    await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, name: 'صاحب الرقم', text: 'استفسار قديم' }));
    const admin = await t.login('admin');
    const old = t.app.db.get("SELECT * FROM intakes WHERE contact_name = 'صاحب الرقم'");
    await admin.post(`/api/admin/intakes/${old.id}/handle-internally`, { resolution_note: 'تم الرد' });

    const { token, intake } = await attackerSubmits(t);
    await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, name: 'صاحب الرقم', text: 'عندي مشكلة جديدة في الإيجار' }));
    const msg = t.app.db.get("SELECT * FROM messages WHERE body = 'عندي مشكلة جديدة في الإيجار'");
    assert.notEqual(msg.intake_id, intake.id);
    const portal = await t.client().get(`/api/portal/${token}`);
    assert.ok(!JSON.stringify(portal.body).includes('مشكلة جديدة في الإيجار'));

    // the website intake carries a structured identity warning for staff
    const d = await admin.get(`/api/admin/intakes/${intake.id}`);
    assert.equal(d.body.intake.identity.phone_match_unverified, true);
    assert.equal(d.body.intake.active_portal_links, 1);
  } finally {
    await t.close();
  }
});

test('a website submission quoting the victim\'s request code gets a fresh request and sees nothing of the victim', async () => {
  const t = await startTestApp();
  try {
    const { admin, intake: victimIntake, caseId } = await victimWithCase(t);
    const ans = await admin.post(`/api/admin/cases/${caseId}/client-answers`, { body: 'رد قانوني سري' });
    await admin.post(`/api/admin/client-answers/${ans.body.id}/send`, {});
    const ir = await admin.post(`/api/admin/cases/${caseId}/info-requests`, { kind: 'information', question: 'سؤال خاص' });
    assert.equal(ir.status, 200);

    const { sub, token } = await attackerSubmits(t, `رقم طلبي ${victimIntake.code} وأريد متابعة ملفي من فضلكم.`);
    assert.notEqual(sub.body.reference, victimIntake.code, 'the reference in the text must not be followed');
    const portal = await t.client().get(`/api/portal/${token}`);
    assert.equal(portal.body.scope, 'request');
    assert.deepEqual(portal.body.cases, []);
    assert.deepEqual(portal.body.answers, []);
    assert.deepEqual(portal.body.requests, []);
    assert.ok(!JSON.stringify(portal.body).includes('رد قانوني سري'));
    const own = t.app.db.get('SELECT * FROM intakes WHERE code = ?', sub.body.reference);
    assert.equal(own.case_id, null);
    // the mentioned code is kept only as a hint for staff
    const m = t.app.db.get('SELECT meta FROM messages WHERE intake_id = ? ORDER BY id LIMIT 1', own.id);
    assert.equal(JSON.parse(m.meta).mentioned_ref, victimIntake.code);
  } finally {
    await t.close();
  }
});

test('the genuine website user continuing on WhatsApp with the code still reaches their own request', async () => {
  const t = await startTestApp();
  try {
    await victimWithCase(t);
    const { intake, token } = await attackerSubmits(t, 'لدي مشكلة في الإيجار القديم وصاحب البيت يريد طردي.');
    await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, text: `رقم طلبي ${intake.code} وأريد الإكمال هنا` }));
    const msg = t.app.db.get("SELECT * FROM messages WHERE body LIKE 'رقم طلبي%'");
    assert.equal(msg.intake_id, intake.id);
    const admin = await t.login('admin');
    const notes = (await admin.get('/api/notifications')).body.items;
    assert.ok(notes.some((n) => n.type === 'identity.ref_from_owner'), 'staff are asked to confirm the identity');
    assert.equal((await t.client().get(`/api/portal/${token}`)).status, 200);
  } finally {
    await t.close();
  }
});

test('staff can confirm identity, revoke portal links, and archiving an unverified intake revokes its link', async () => {
  const t = await startTestApp();
  try {
    const { admin, caseId } = await victimWithCase(t);
    const a = await attackerSubmits(t);

    // revoke the single request link
    const rv = await admin.post(`/api/admin/intakes/${a.intake.id}/revoke-portal`, {});
    assert.equal(rv.status, 200);
    assert.equal(rv.body.revoked, 1);
    assert.equal((await t.client().get(`/api/portal/${a.token}`)).status, 404);

    // archiving an unverified intake revokes its link automatically
    const b = await attackerSubmits(t, 'طلب ثانٍ بنفس الرقم ووصف كافٍ للطلب المقدم.');
    const ar = await admin.post(`/api/admin/intakes/${b.intake.id}/archive`, { reason: 'انتحال محتمل' });
    assert.equal(ar.status, 200);
    assert.equal((await t.client().get(`/api/portal/${b.token}`)).status, 404);
    // archived requests must be reopened before converting
    const conv = await admin.post(`/api/admin/intakes/${b.intake.id}/convert`, { legal_area: 'GEN', title: 'x' });
    assert.equal(conv.status, 409);

    // a handled unverified intake is not reopened by a portal message
    const c = await attackerSubmits(t, 'طلب ثالث بنفس الرقم ووصف كافٍ للطلب المقدم.');
    await admin.post(`/api/admin/intakes/${c.intake.id}/handle-internally`, { resolution_note: 'تم' });
    await c.attacker.post(`/api/portal/${c.token}/messages`, { body: 'أعيدوا فتح طلبي' });
    assert.equal(t.app.db.get('SELECT status FROM intakes WHERE id = ?', c.intake.id).status, 'handled_internally');

    // confirming identity clears the flag; then WhatsApp from the owner may join that intake
    const d = await attackerSubmits(t, 'طلب رابع من صاحب الرقم نفسه ووصف كافٍ.');
    const ok = await admin.post(`/api/admin/intakes/${d.intake.id}/confirm-identity`, {});
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const det = await admin.get(`/api/admin/intakes/${d.intake.id}`);
    assert.equal(det.body.intake.identity.phone_match_unverified, false);
    assert.ok(det.body.intake.identity.confirmed_at);
    assert.equal((await admin.post(`/api/admin/intakes/${d.intake.id}/confirm-identity`, {})).status, 409);
    await t.client().post('/webhooks/whatsapp', waPayload({ from: VICTIM_WA, text: 'متابعة بعد التأكيد' }));
    assert.equal(t.app.db.get("SELECT intake_id FROM messages WHERE body = 'متابعة بعد التأكيد'").intake_id, d.intake.id);

    // client-wide revoke
    const clientId = t.app.db.get('SELECT client_id FROM cases WHERE id = ?', caseId).client_id;
    const link = await admin.post(`/api/admin/clients/${clientId}/portal-link`, {});
    const fullToken = link.body.url.split('/p/')[1];
    assert.equal((await admin.get(`/api/admin/clients/${clientId}`)).body.active_portal_links >= 1, true);
    const all = await admin.post(`/api/admin/clients/${clientId}/revoke-portal`, {});
    assert.ok(all.body.revoked >= 1);
    assert.equal((await t.client().get(`/api/portal/${fullToken}`)).status, 404);
    assert.equal((await admin.get(`/api/admin/clients/${clientId}`)).body.active_portal_links, 0);
  } finally {
    await t.close();
  }
});

test('X-Forwarded-For: only the address added by the trusted proxy counts for rate limits', async () => {
  const prev = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  const t = await startTestApp();
  try {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const r = await t.client().post('/api/auth/login', { username: 'admin', password: 'wrong' }, { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` });
      statuses.push(r.status);
    }
    assert.equal(statuses.at(-1), 429, 'rotating the left-most address must not bypass the limiter');
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
    await t.close();
  }
});

test('login attempts per account are capped even across many addresses', async () => {
  const prev = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = '1';
  const t = await startTestApp();
  try {
    let last;
    for (let i = 0; i < 31; i++) {
      last = await t.client().post('/api/auth/login', { username: 'admin', password: 'wrong' }, { 'x-forwarded-for': `198.51.100.${i}` });
    }
    assert.equal(last.status, 429);
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
    await t.close();
  }
});
