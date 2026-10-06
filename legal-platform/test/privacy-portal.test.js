// خصوصية بوابة العميل: رقم الهاتف في نموذج الموقع غير موثّق، فلا يجوز أن يكشف رابط الموقع ملفات صاحب الرقم الحقيقي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';

async function setupVictim(t) {
  const admin = await t.login('admin');
  // العميل الحقيقي يتواصل عبر واتساب (رقم موثّق) ويحصل على رد قانوني
  const wa = waPayload({ from: '201011111111', name: 'صاحب الرقم الحقيقي', text: 'والدي توفي وعايز أعرف نصيبي في الميراث والشقة' });
  const r = await t.client().post('/webhooks/whatsapp', wa);
  assert.equal(r.status, 200);
  const inbox = await admin.get('/api/admin/intakes');
  const intake = inbox.body.items.find((i) => i.contact_name === 'صاحب الرقم الحقيقي');
  const conv = await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ميراث سري', facts_shared: 'وقائع خاصة جدًا' });
  assert.equal(conv.status, 201);
  const caseId = conv.body.case.id;
  const ans = await admin.post(`/api/admin/cases/${caseId}/client-answers`, { body: 'رد قانوني سري خاص بصاحب الرقم' });
  const sent = await admin.post(`/api/admin/client-answers/${ans.body.id}/send`, {});
  assert.equal(sent.status, 200);
  assert.equal(sent.body.channel, 'whatsapp');
  return { admin, caseId, intakeId: intake.id };
}

test('website submission with someone else\'s phone gets a portal scoped to that submission only', async () => {
  const t = await startTestApp();
  try {
    const { admin, caseId } = await setupVictim(t);
    const attacker = t.client();
    const sub = await attacker.post('/api/public/intake', {
      name: 'منتحل',
      phone: '01011111111',
      description: 'أريد معرفة حالة ملفي من فضلكم، هذا وصف كافٍ للطلب.',
      consent: true,
      attribution: {},
    });
    assert.equal(sub.status, 201);
    const token = sub.body.portal_url.split('/p/')[1];
    const portal = await attacker.get(`/api/portal/${token}`);
    assert.equal(portal.status, 200);
    const dump = JSON.stringify(portal.body);
    assert.equal(portal.body.scope, 'request');
    assert.equal(portal.body.cases.length, 0, 'no cases of the real phone owner');
    assert.equal(portal.body.answers.length, 0, 'no legal answers of the real phone owner');
    assert.ok(!dump.includes('رد قانوني سري'), 'answer text must not leak');
    assert.ok(!dump.includes('صاحب الرقم الحقيقي'), 'real owner name must not leak');
    assert.ok(!dump.includes('والدي توفي'), 'original WhatsApp conversation must not leak');
    assert.equal(portal.body.client.name, 'منتحل');
    assert.equal(portal.body.client.code, null);

    // رسالة من البوابة تبقى ضمن الطلب المقصور ولا تُلحق بملف صاحب الرقم
    const m = await attacker.post(`/api/portal/${token}/messages`, { body: 'رسالة من البوابة' });
    assert.equal(m.status, 200);
    const msg = t.app.db.get("SELECT * FROM messages WHERE body = 'رسالة من البوابة'");
    assert.notEqual(msg.case_id, caseId);
    assert.equal(msg.intake_id, t.app.db.get('SELECT id FROM intakes WHERE code = ?', sub.body.reference).id);

    // الإدارة ترى أن الربط بالرقم غير موثّق
    const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', sub.body.reference);
    assert.equal(JSON.parse(intake.source_detail).phone_match_unverified, true);

    // رد الإدارة على طلب الموقع يذهب للموقع (حيث كتب المرسل) وليس لواتساب صاحب الرقم
    const reply = await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'استلمنا طلبك' });
    assert.equal(reply.body.channel, 'website');

    // ورد الإدارة على الملف الأصلي يظل عبر واتساب صاحب الرقم
    const caseMsg = await admin.post(`/api/admin/cases/${caseId}/messages`, { body: 'متابعة لملفك' });
    assert.equal(caseMsg.body.channel, 'whatsapp');

    // الرد على طلب معلومات خارج النطاق ممنوع
    const ir = await admin.post(`/api/admin/cases/${caseId}/info-requests`, { kind: 'information', question: 'سؤال خاص بالملف الأصلي' });
    assert.equal(ir.status, 200);
    const rr = await attacker.post(`/api/portal/${token}/requests/${ir.body.id}/reply`, { body: 'محاولة' });
    assert.equal(rr.status, 404);

    // رابط ترسله الإدارة للعميل (نطاق كامل) يعرض كل ملفاته
    const client = t.app.db.get('SELECT client_id FROM cases WHERE id = ?', caseId);
    const link = await admin.post(`/api/admin/clients/${client.client_id}/portal-link`, {});
    const full = await t.client().get(`/api/portal/${link.body.url.split('/p/')[1]}`);
    assert.equal(full.body.scope, 'client');
    assert.ok(full.body.answers.length >= 1);
  } finally {
    await t.close();
  }
});

test('website email of an existing client does not link to that client', async () => {
  const t = await startTestApp();
  try {
    const first = await t.client().post('/api/public/intake', { name: 'أمل', phone: '01022222222', email: 'owner@example.com', description: 'وصف مشكلة قانونية كافٍ للطلب الأول.', consent: true });
    const second = await t.client().post('/api/public/intake', { name: 'بسمة', phone: '01033333333', email: 'owner@example.com', description: 'وصف مشكلة قانونية كافٍ للطلب الثاني.', consent: true });
    const a = t.app.db.get('SELECT client_id FROM intakes WHERE code = ?', first.body.reference);
    const b = t.app.db.get('SELECT client_id FROM intakes WHERE code = ?', second.body.reference);
    assert.notEqual(a.client_id, b.client_id);
  } finally {
    await t.close();
  }
});

test('website first, then WhatsApp from the same phone continues the same intake', async () => {
  const t = await startTestApp();
  try {
    const sub = await t.client().post('/api/public/intake', { name: 'سارة', phone: '01044444444', description: 'لدي مشكلة في الإيجار القديم وصاحب البيت يريد طردي.', consent: true });
    await t.client().post('/webhooks/whatsapp', waPayload({ from: '201044444444', name: 'سارة', text: `رقم طلبي ${sub.body.reference} وأريد الإكمال هنا` }));
    const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', sub.body.reference);
    assert.deepEqual(JSON.parse(intake.channels).sort(), ['website', 'whatsapp']);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM intakes')), 1);
    // الرد بعد رسالة واتساب يذهب لواتساب
    const admin = await t.login('admin');
    const reply = await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'أهلًا بك' });
    assert.equal(reply.body.channel, 'whatsapp');
    assert.equal(reply.body.status, 'simulated');
  } finally {
    await t.close();
  }
});
