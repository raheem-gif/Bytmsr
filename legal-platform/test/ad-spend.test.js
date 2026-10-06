// الإنفاق الإعلاني: تكلفة اكتساب الطلب والملف لكل مصدر وحملة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';
import { periodOf, nowIso } from '../src/util.js';

test('ad spend is recorded per period/source/campaign and drives acquisition cost in the funnel', async () => {
  const t = await startTestApp();
  try {
    const admin = await t.login('admin');
    const ref = { source_url: 'https://fb.me/x', source_type: 'ad', source_id: '1', headline: 'حملة المواريث' };
    for (const [i, from] of ['201011110001', '201011110002'].entries()) {
      await t.client().post('/webhooks/whatsapp', waPayload({ from, text: `والدي توفي وعايز أعرف الميراث ${i}`, referral: ref }));
    }
    const inbox = await admin.get('/api/admin/intakes');
    const first = inbox.body.items[0];
    const conv = await admin.post(`/api/admin/intakes/${first.id}/convert`, { legal_area: 'INH', title: 'ميراث' });
    assert.equal(conv.status, 201);

    const period = periodOf(nowIso());
    const bad = await admin.post('/api/admin/analytics/spend', { period: '2026-13', source: 'facebook_ad', amount: 10 });
    assert.equal(bad.status, 400);
    const saved = await admin.post('/api/admin/analytics/spend', { period, source: 'facebook_ad', campaign: 'حملة المواريث', amount: 3000 });
    assert.equal(saved.status, 200);
    // نفس الشهر والمصدر والحملة: لا يُستبدل السجل بصمت من «تسجيل إنفاق»
    const dup = await admin.post('/api/admin/analytics/spend', { period, source: 'facebook_ad', campaign: 'حملة المواريث', amount: 4000 });
    assert.equal(dup.status, 409);
    // التعديل يكون على السجل نفسه
    const upd = await admin.patch(`/api/admin/analytics/spend/${saved.body.id}`, { amount: 4000 });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    // تغيير اسم الحملة في التعديل لا ينشئ سجلًا ثانيًا ثم يعاد
    assert.equal((await admin.patch(`/api/admin/analytics/spend/${saved.body.id}`, { campaign: 'حملة مواريث (خطأ)' })).body.campaign, 'حملة مواريث (خطأ)');
    await admin.patch(`/api/admin/analytics/spend/${saved.body.id}`, { campaign: 'حملة المواريث' });
    const other = await admin.post('/api/admin/analytics/spend', { period, source: 'google', campaign: 'بحث', amount: 0 });
    assert.equal((await admin.patch(`/api/admin/analytics/spend/${other.body.id}`, { source: 'facebook_ad', campaign: 'حملة المواريث' })).status, 409);
    await admin.del(`/api/admin/analytics/spend/${other.body.id}`);
    const list = await admin.get('/api/admin/analytics/spend');
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].amount, 4000);
    assert.ok(list.body.campaigns.some((c) => c.campaign === 'حملة المواريث'));

    const bySource = await admin.get('/api/admin/analytics/funnel?group=source');
    const fb = bySource.body.items.find((x) => x.key === 'facebook_ad');
    assert.equal(fb.intakes, 2);
    assert.equal(fb.cases, 1);
    assert.equal(fb.ad_spend, 4000);
    assert.equal(fb.ad_cost_per_intake, 2000);
    assert.equal(fb.ad_cost_per_case, 4000);
    assert.equal(bySource.body.totals.ad_spend, 4000);

    const byCampaign = await admin.get('/api/admin/analytics/funnel?group=campaign');
    assert.equal(byCampaign.body.items.find((x) => x.key === 'حملة المواريث').ad_spend, 4000);
    const byChannel = await admin.get('/api/admin/analytics/funnel?group=channel');
    assert.equal(byChannel.body.items[0].ad_spend, null);

    // مدير الحالات يرى ولا يعدّل
    await t.login('admin');
    t.app.db.insert('users', { role: 'case_manager', username: 'cm', name: 'مدير حالات', password_hash: (await import('../src/auth.js')).hashPassword('Manager@2026'), active: 1, created_at: nowIso() });
    const cm = await t.client();
    await cm.post('/api/auth/login', { username: 'cm', password: 'Manager@2026' });
    assert.equal((await cm.get('/api/admin/analytics/spend')).status, 200);
    assert.equal((await cm.post('/api/admin/analytics/spend', { period, source: 'google', amount: 5 })).status, 403);
    assert.equal((await cm.del(`/api/admin/analytics/spend/${list.body.items[0].id}`)).status, 403);
    assert.equal((await admin.del(`/api/admin/analytics/spend/${list.body.items[0].id}`)).status, 200);
  } finally {
    await t.close();
  }
});
