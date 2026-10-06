// v9 — وحدة الرسائل: إعدادات واتساب من مخزن التكاملات، اختبار الاتصال، Webhook بأسرار التكاملات، مزامنة القوالب وربطها،
// إعلام القراءة، إرسال المستندات للعميل، الردود الجاهزة، دخول بوابة العملاء برمز واتساب، واستبيان رضا العملاء.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, waPayload, freezeClock, resetClock, samplePdf } from './helpers.js';
import { ok, createLawyer, outbox, runAutomations, plusHours, plusDays, portalToken, notificationsOf } from './lane-b-kit.test.js';

const T0 = '2026-11-02T08:00:00.000Z';
const NO_WA = { whatsapp: { token: '', phoneNumberId: '', wabaId: '', verifyToken: '', appSecret: '', numberDigits: '' } };
const LIVE_WA = { whatsapp: { token: 'test-token', phoneNumberId: 'PN123', wabaId: 'WABA9', verifyToken: 'verify-me', appSecret: 's3cret', numberDigits: '201000000000' } };

afterEach(() => resetClock());

const sign = (body, secret = 's3cret') => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
async function raw(t, method, url, { body, headers = {} } = {}) {
  const res = await fetch(t.base + url, { method, headers, body, redirect: 'manual' });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}
const signedPost = (t, payload, secret = 's3cret') => {
  const body = JSON.stringify(payload);
  return raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body, secret) } });
};
const wa = (phone, text, extra = {}) => waPayload({ from: phone, name: extra.name || 'مستفيدة', text, ...extra });
const buttonReply = (phone, id, title) =>
  waPayload({ from: phone, type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id, title } } } });

/** محاكاة Graph API: تسجيل الطلبات والرد حسب المسار */
function mockGraph(handler) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://graph.facebook.com/')) return realFetch(url, init);
    let json = null;
    if (typeof init.body === 'string') {
      try {
        json = JSON.parse(init.body);
      } catch {
        json = null;
      }
    }
    const call = { url: u, method: init.method || 'GET', init, json };
    calls.push(call);
    const r = (await handler(call)) || { status: 200, body: { messages: [{ id: `wamid.OUT.${calls.length}` }] } };
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 20));
    v = await fn();
  }
  return v;
}

/** عميل عبر واتساب ← ملف ← محامٍ يقدّم ← اعتماد ← إرسال الرد للعميل */
async function answeredCase(t, admin, { phone, lawyer, area = 'FAM', title = 'نفقة صغار متجمدة', post = (p) => t.client().post('/webhooks/whatsapp', p) }) {
  ok(await post(wa(phone, 'طليقي ممتنع عن دفع نفقة الأولاد من 5 شهور وعايزة أعرف أعمل إيه')), 200);
  const intake = t.app.db.get('SELECT id, code FROM intakes WHERE contact_phone = ? ORDER BY id DESC LIMIT 1', `+${phone}`);
  assert.ok(intake, 'intake created from webhook');
  const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: area, title, facts_shared: 'وقائع مختصرة للمحامي.', issues: [{ title: 'المسألة' }] }), 201).case;
  const asg = ok(await admin.post(`/api/admin/cases/${kase.id}/assignments`, { lawyer_id: lawyer.id, role: 'lead' }), 201).assignment;
  const lc = await t.login(lawyer.username);
  ok(await lc.post(`/api/lawyer/assignments/${asg.id}/open`));
  const op = ok(await lc.post(`/api/lawyer/assignments/${asg.id}/submit`, { body: 'الرأي القانوني: يحق للحاضنة المطالبة بالمتجمد ورفع دعوى نفقة.' }));
  ok(await admin.post(`/api/admin/opinions/${op.id}/approve`, { quality_score: 4 }));
  const ans = ok(await admin.post(`/api/admin/cases/${kase.id}/client-answers`, { body: 'الرد القانوني: يحق لحضرتك المطالبة بالمتجمد.' }));
  ok(await admin.post(`/api/admin/client-answers/${ans.id}/send`, {}));
  return { kase, intake, asg };
}

// ═════════════════════════ 1) إعدادات واتساب الحقيقية ═════════════════════════
describe('WhatsApp configuration from the integrations store', () => {
  test('reconfigure(): integrations values drive configured/webhook; env/config values win; clearing returns to simulation', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      const { app } = t;
      const admin = app.db.get("SELECT * FROM users WHERE username = 'admin'");
      assert.equal(app.whatsapp.configured, false, 'starts in simulation');
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=vt2&hub.challenge=7')).status, 403);
      app.integrations.set('whatsapp', { token: 'tok-db', phone_number_id: '555', app_secret: 'sec2', verify_token: 'vt2', number: '201234567890' }, admin);
      assert.equal(app.whatsapp.configured, true, 'integrations.changed reconfigures immediately');
      const eff = app.whatsapp.effective();
      assert.equal(eff.token, 'tok-db');
      assert.equal(eff.phoneNumberId, '555');
      assert.equal(eff.appSecret, 'sec2');
      // GET verification with the stored verify token
      const v = await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=vt2&hub.challenge=777');
      assert.equal(v.status, 200);
      assert.equal(v.body, '777');
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1')).status, 403);
      // POST: fail-closed without a valid signature from the stored app secret
      const body = JSON.stringify(wa('201011100031', 'رسالة'));
      assert.equal((await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json' } })).status, 403);
      assert.equal((await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body, 's3cret') } })).status, 403);
      assert.equal((await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body, 'sec2') } })).status, 200);
      // the public number comes from the effective settings
      assert.equal((await t.client().get('/api/meta')).body.settings.whatsapp_number_digits, '201234567890');
      // removing the token → simulation again (secret still enforced because one is set)
      app.integrations.set('whatsapp', { token: '' }, admin);
      assert.equal(app.whatsapp.configured, false);
      assert.equal((await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json' } })).status, 403, 'a configured app secret is always enforced');
    } finally {
      await t.close();
    }
  });

  test('config/env values take precedence over stored values', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      t.app.integrations.set('whatsapp', { verify_token: 'stored-token' }, admin);
      assert.equal(t.app.whatsapp.effective().verifyToken, 'verify-me');
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=stored-token&hub.challenge=1')).status, 403);
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1')).status, 200);
    } finally {
      await t.close();
    }
  });

  test('without an app secret, a live (configured) number refuses unsigned webhooks; simulation outside production accepts them', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      assert.equal((await t.client().post('/webhooks/whatsapp', wa('201011100032', 'محاكاة'))).status, 200);
      t.app.integrations.set('whatsapp', { token: 'tok', phone_number_id: '9' }, admin);
      assert.equal((await t.client().post('/webhooks/whatsapp', wa('201011100033', 'بدون سر'))).status, 403);
    } finally {
      await t.close();
    }
  });

  test('test(): reads the number from Graph; Graph errors and missing credentials are reported in Arabic; admin-only route', async () => {
    const g = mockGraph((c) => {
      if (c.url.includes('/PN123?fields=')) return { body: { display_phone_number: '+20 121 111 4662', verified_name: 'Beyoot Misr', quality_rating: 'GREEN', code_verification_status: 'VERIFIED', id: 'PN123' } };
      return { status: 401, body: { error: { message: 'Error validating access token', code: 190 } } };
    });
    const t = await startTestApp({ seed: 'none', config: LIVE_WA });
    try {
      const r = await t.app.whatsapp.test();
      assert.equal(r.ok, true);
      assert.equal(r.display_phone_number, '+20 121 111 4662');
      assert.equal(r.verified_name, 'Beyoot Misr');
      assert.equal(r.quality_rating, 'GREEN');
      assert.match(g.calls[0].url, /\/v\d+\.\d+\/PN123\?fields=display_phone_number,verified_name,quality_rating,code_verification_status$/);
      assert.equal(g.calls[0].init.headers.Authorization, 'Bearer test-token');
      const admin = await t.login('admin');
      assert.equal(ok(await admin.post('/api/admin/whatsapp/test', {})).ok, true);
      t.app.integrations.set('whatsapp', { phone_number_id: 'BAD' }, t.app.db.get("SELECT * FROM users WHERE username = 'admin'"));
      // config (env) wins for phone_number_id; switch config itself to simulate a bad id
      t.app.config.whatsapp.phoneNumberId = 'BAD';
      t.app.whatsapp.reconfigure();
      const bad = await t.app.whatsapp.test();
      assert.equal(bad.ok, false);
      assert.match(bad.error, /رمز الوصول/);
      t.app.config.whatsapp.token = '';
      t.app.whatsapp.reconfigure();
      const none = await t.app.whatsapp.test();
      assert.equal(none.ok, false);
      assert.match(none.error, /لم تُضبط/);
      const lawyer = await createLawyer(admin);
      assert.equal((await (await t.login(lawyer.username)).post('/api/admin/whatsapp/test', {})).status, 403);
    } finally {
      g.restore();
      await t.close();
    }
  });
});

// ═════════════════════════ 2) الردود الجاهزة ═════════════════════════
describe('Quick replies', () => {
  test('CRUD by staff, validation, permissions, variable filling from case context and usage counter', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr', name: 'منى السيد', password: 'Manager@2026' }), 201);
      const mgr = await t.login('mgr', 'Manager@2026');
      const lawyer = await createLawyer(admin);
      const lc = await t.login(lawyer.username);

      assert.equal((await lc.get('/api/admin/quick-replies')).status, 403);
      assert.equal((await lc.post('/api/admin/quick-replies', { title: 'x', body: 'y' })).status, 403);
      assert.equal((await t.client().get('/api/admin/quick-replies')).status, 401);

      const body = 'أهلًا {client_name}، لاستخراج إعلام الوراثة في ملفكم {case_code} (طلب {request_code}) نرجو إرسال شهادة الوفاة. — {org_name}';
      const created = ok(await mgr.post('/api/admin/quick-replies', { title: 'مستندات إعلام الوراثة', shortcut: 'وثائق', category: 'documents', body }), 201);
      assert.equal(created.shortcut, '/وثائق', 'shortcut normalized with a leading slash');
      assert.deepEqual(created.variables.sort(), ['case_code', 'client_name', 'org_name', 'request_code']);

      assert.equal((await mgr.post('/api/admin/quick-replies', { title: 'مكرر', shortcut: '/وثائق', body: 'نص' })).status, 409);
      const badVar = await mgr.post('/api/admin/quick-replies', { title: 'متغير', body: 'رقمك {phone}' });
      assert.equal(badVar.status, 400);
      assert.match(badVar.body.error, /\{phone\}/);
      assert.equal((await mgr.post('/api/admin/quick-replies', { title: 'قصير', shortcut: '/x', body: 'نص' })).status, 400);
      assert.equal((await mgr.post('/api/admin/quick-replies', { title: 'تصنيف', category: 'nope', body: 'نص' })).status, 400);
      assert.equal((await mgr.post('/api/admin/quick-replies', { body: 'بدون عنوان' })).status, 400);
      const other = ok(await admin.post('/api/admin/quick-replies', { title: 'العنوان', shortcut: '/عنوان', category: 'appointments', body: 'مقر {org_name}: مدينة نصر.' }), 201);

      // search is Arabic-normalized (اعلام ≈ إعلام) and filters by category
      assert.deepEqual(ok(await mgr.get('/api/admin/quick-replies?q=اعلام')).items.map((r) => r.id), [created.id]);
      assert.deepEqual(ok(await mgr.get('/api/admin/quick-replies?category=appointments')).items.map((r) => r.id), [other.id]);

      // fill from a real case context
      ok(await t.client().post('/webhooks/whatsapp', wa('201011100040', 'والدي توفي وعايزة أطلع إعلام وراثة', { name: 'سعاد' })));
      const intake = (await admin.get('/api/admin/intakes')).body.items[0];
      const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'إعلام وراثة', client: { name: 'سعاد محمود' } }), 201).case;
      const used = ok(await mgr.post(`/api/admin/quick-replies/${created.id}/use`, { case_id: kase.id }));
      assert.equal(used.missing.length, 0);
      assert.ok(used.text.includes('سعاد محمود'));
      assert.ok(used.text.includes(kase.code));
      assert.ok(used.text.includes(intake.code));
      assert.ok(!used.text.includes('{org_name}'));
      assert.equal(used.usage_count, 1);
      // explicit context from the composer, missing variables are reported (and left visible)
      const partial = ok(await mgr.post(`/api/admin/quick-replies/${created.id}/use`, { context: { client_name: 'أم يوسف' } }));
      assert.ok(partial.text.startsWith('أهلًا أم يوسف'));
      assert.deepEqual(partial.missing.sort(), ['case_code', 'request_code']);
      assert.ok(partial.text.includes('{case_code}'));
      const list = ok(await mgr.get('/api/admin/quick-replies')).items;
      assert.equal(list[0].id, created.id, 'most used first');
      assert.equal(list[0].usage_count, 2);

      const upd = ok(await mgr.patch(`/api/admin/quick-replies/${other.id}`, { title: 'العنوان والحضور', shortcut: '' }));
      assert.equal(upd.title, 'العنوان والحضور');
      assert.equal(upd.shortcut, null);
      assert.equal((await lc.del(`/api/admin/quick-replies/${other.id}`)).status, 403);
      ok(await mgr.del(`/api/admin/quick-replies/${other.id}`));
      assert.equal((await mgr.patch(`/api/admin/quick-replies/${other.id}`, { title: 'x' })).status, 404);
      assert.equal((await mgr.post(`/api/admin/quick-replies/${other.id}/use`, {})).status, 404);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 3) دخول بوابة العملاء برمز واتساب ═════════════════════════
describe('Client portal login by WhatsApp OTP', () => {
  const otpOf = async (admin, phoneE164) => {
    const msgs = (await outbox(admin)).filter((m) => m.automation_rule === 'portal_otp' && m.to_address === phoneE164);
    const m = /(\d{6})/.exec(msgs[0]?.body || '');
    return { count: msgs.length, code: m ? m[1] : null, message: msgs[0] };
  };

  test('same answer for verified, website-only and unknown numbers; code only to a verified identity; success issues a full portal link', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      // verified via WhatsApp
      ok(await t.client().post('/webhooks/whatsapp', wa('201011223344', 'عندي مشكلة في معاش زوجي المتوفى', { name: 'أم محمد' })));
      // website-only (unverified)
      ok(await t.client().post('/api/public/intake', { consent: true, name: 'زائرة الموقع', phone: '01055566677', description: 'أريد استشارة بخصوص حضانة الأطفال بعد الطلاق ونفقتهم الشهرية.' }), 201);
      // staff-recorded phone call → staff-confirmed identity
      ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01277700011', name: 'عميلة بالهاتف', text: 'اتصلت تسأل عن إعلام الوراثة' }), 201);

      const anon = t.client();
      const rA = await anon.post('/api/public/portal-login/request', { phone: '01011223344' });
      const rWeb = await anon.post('/api/public/portal-login/request', { phone: '01055566677' });
      const rUnknown = await anon.post('/api/public/portal-login/request', { phone: '01099988877' });
      const rStaff = await anon.post('/api/public/portal-login/request', { phone: '01277700011' });
      for (const r of [rA, rWeb, rUnknown, rStaff]) {
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(Object.keys(r.body).sort(), ['challenge', 'expires_in', 'message', 'ok', 'resend_after']);
        assert.equal(r.body.message, rA.body.message, 'no enumeration: identical message');
        assert.equal(r.body.expires_in, 600);
        assert.equal(r.body.resend_after, 60);
      }
      assert.equal((await otpOf(admin, '+201011223344')).count, 1, 'verified WhatsApp identity gets a code');
      assert.equal((await otpOf(admin, '+201277700011')).count, 1, 'staff-recorded identity gets a code');
      assert.equal((await otpOf(admin, '+201055566677')).count, 0, 'website-only number is never sent a code');
      assert.equal((await otpOf(admin, '+201099988877')).count, 0);
      const { code, message } = await otpOf(admin, '+201011223344');
      assert.ok(code, 'simulation records the code in the outbox');
      assert.equal(message.status, 'simulated');
      assert.equal(message.case_id, null);

      // the OTP message never shows in the client's portal conversation
      // wrong code / unknown number → the same kind of failure
      const wrong = await anon.post('/api/public/portal-login/verify', { challenge: rA.body.challenge, code: code === '000000' ? '111111' : '000000' });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.details.attempts_left, 4);
      const unknown = await anon.post('/api/public/portal-login/verify', { challenge: rUnknown.body.challenge, code });
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error, wrong.body.error, 'unknown numbers fail exactly like a wrong code');
      assert.equal((await anon.post('/api/public/portal-login/verify', { challenge: rA.body.challenge, code: '12a' })).status, 400);

      const good = ok(await anon.post('/api/public/portal-login/verify', { challenge: rA.body.challenge, code: code.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) }));
      assert.match(good.redirect, /^\/p\/[A-Za-z0-9_-]{20,}$/);
      const token = portalToken(good.redirect);
      const view = ok(await anon.get(`/api/portal/${token}`));
      assert.equal(view.scope, 'client', 'full-scope portal token');
      assert.ok(!view.messages.some((m) => /رمز الدخول/.test(m.body)), 'OTP messages are hidden from the portal chat');
      assert.equal((await anon.post('/api/public/portal-login/verify', { challenge: rA.body.challenge, code })).status, 400, 'a code is single-use');

      const types = t.app.db.all('SELECT type, data FROM security_events WHERE type LIKE ?', 'portal.%').map((r) => r.type);
      assert.ok(types.includes('portal.otp_requested'));
      assert.ok(types.includes('portal.otp_failed'));
      assert.ok(types.includes('portal.otp_login'));
    } finally {
      await t.close();
    }
  });

  test('cooldown, expiry after 10 minutes, lock after 5 attempts, new code invalidates the previous one', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      ok(await t.client().post('/webhooks/whatsapp', wa('201011223355', 'استفسار عن الولاية على مال القاصر')));
      const anon = t.client();
      const req = () => anon.post('/api/public/portal-login/request', { phone: '+201011223355' });
      const r1 = ok(await req());
      const cool = await req();
      assert.equal(cool.status, 429, 'resend cooldown 60s');
      assert.equal(cool.body.code, 'otp_cooldown');
      assert.ok(cool.body.details.retry_after > 0 && cool.body.details.retry_after <= 60);
      const coolUnknown1 = ok(await anon.post('/api/public/portal-login/request', { phone: '01099911122' }));
      assert.ok(coolUnknown1.challenge);
      assert.equal((await anon.post('/api/public/portal-login/request', { phone: '01099911122' })).status, 429, 'cooldown applies to unknown numbers too');

      // expiry
      const code1 = /(\d{6})/.exec((await outbox(admin)).find((m) => m.automation_rule === 'portal_otp').body)[1];
      freezeClock(plusHours(T0, 11 / 60));
      assert.equal((await anon.post('/api/public/portal-login/verify', { challenge: r1.challenge, code: code1 })).status, 400, 'expired after 10 minutes');

      // a new code invalidates the previous one; 5 wrong attempts lock it
      const r2 = ok(await req());
      const admin2 = await t.login('admin');
      const code2 = /(\d{6})/.exec((await outbox(admin2)).find((m) => m.automation_rule === 'portal_otp').body)[1];
      freezeClock(plusHours(T0, 13 / 60));
      const r3 = ok(await req());
      assert.equal((await anon.post('/api/public/portal-login/verify', { challenge: r2.challenge, code: code2 })).status, 400, 'superseded code no longer works');
      const code3 = /(\d{6})/.exec((await outbox(await t.login('admin'))).find((m) => m.automation_rule === 'portal_otp').body)[1];
      const wrongCode = code3 === '999999' ? '888888' : '999999';
      for (let i = 1; i <= 4; i++) {
        const w = await anon.post('/api/public/portal-login/verify', { challenge: r3.challenge, code: wrongCode });
        assert.equal(w.status, 400);
        assert.equal(w.body.details.attempts_left, 5 - i);
      }
      const fifth = await anon.post('/api/public/portal-login/verify', { challenge: r3.challenge, code: wrongCode });
      assert.equal(fifth.status, 400);
      assert.match(fifth.body.error, /تجاوزت عدد المحاولات/);
      assert.equal((await anon.post('/api/public/portal-login/verify', { challenge: r3.challenge, code: code3 })).status, 400, 'locked even with the right code');
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'portal.otp_locked'"));
    } finally {
      await t.close();
    }
  });

  test('rate limits per phone (5/hour) and per IP (10/hour); feature can be disabled from settings', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none' });
    try {
      const anon = t.client();
      for (let i = 0; i < 5; i++) {
        freezeClock(plusHours(T0, (i * 61) / 3600));
        ok(await anon.post('/api/public/portal-login/request', { phone: '01011100099' }));
      }
      freezeClock(plusHours(T0, (6 * 61) / 3600));
      const limited = await anon.post('/api/public/portal-login/request', { phone: '01011100099' });
      assert.equal(limited.status, 429);
      assert.equal(limited.body.code, 'rate_limited');
      // per IP: the 11th request from the same address in an hour is refused whatever the number
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push((await anon.post('/api/public/portal-login/request', { phone: `0101110010${i}` })).status);
      assert.deepEqual(statuses.slice(0, 4), [200, 200, 200, 200]);
      assert.equal(statuses[4], 429);
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'portal.otp_rate_limited'"));

      const admin = await t.login('admin');
      ok(await admin.patch('/api/admin/settings', { portal_otp_enabled: false }));
      assert.equal((await anon.post('/api/public/portal-login/request', { phone: '01011100055' })).status, 404);
      assert.equal((await t.client().get('/api/meta')).body.messaging.portal_otp_enabled, false);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 4) قوالب واتساب والإرسال الحقيقي (Graph مُحاكى) ═════════════════════════
describe('WhatsApp Cloud API features (mocked Graph)', () => {
  const TEMPLATES_P1 = [
    { id: '11', name: 'case_update_v2', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'مرحبًا {{1}}، {{2}}' }, { type: 'FOOTER', text: 'بيوت مصر' }] },
    { id: '12', name: 'portal_login_code', language: 'ar', status: 'APPROVED', category: 'AUTHENTICATION', components: [{ type: 'BODY', text: '*{{1}}* هو رمز التحقق الخاص بك.' }, { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'نسخ الرمز' }] }] },
  ];
  const TEMPLATES_P2 = [
    { id: '13', name: 'promo', language: 'ar', status: 'REJECTED', category: 'MARKETING', rejected_reason: 'INVALID_FORMAT', components: [{ type: 'BODY', text: 'عرض {{1}}' }] },
    { id: '14', name: 'old_notice', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'إشعار' }] },
  ];
  function handler({ tplPages = [TEMPLATES_P1, TEMPLATES_P2] } = {}) {
    return (c) => {
      if (c.url.includes('/WABA9/message_templates')) {
        const second = c.url.includes('after=PAGE2');
        return { body: { data: second ? tplPages[1] : tplPages[0], paging: second ? {} : { next: 'https://graph.facebook.com/v21.0/WABA9/message_templates?after=PAGE2' } } };
      }
      if (c.url.endsWith('/PN123/media')) return { body: { id: 'MEDIA-1' } };
      return null;
    };
  }

  test('template sync (paged) stores templates; mapping validation; out-of-window sends use the mapped template with ordered params', async () => {
    freezeClock(T0);
    let pages = [TEMPLATES_P1, TEMPLATES_P2];
    const g = mockGraph((c) => handler({ tplPages: pages })(c));
    const t = await startTestApp({ seed: 'none', config: { ...LIVE_WA, sessionTtlHours: 24 * 30 } });
    try {
      const admin = await t.login('admin');
      ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr', name: 'منى', password: 'Manager@2026' }), 201);
      const mgr = await t.login('mgr', 'Manager@2026');
      assert.equal((await mgr.post('/api/admin/whatsapp/templates/sync', {})).status, 403, 'sync is admin-only');
      const sync = ok(await admin.post('/api/admin/whatsapp/templates/sync', {}));
      assert.equal(sync.total, 4);
      assert.equal(sync.approved, 3);
      const byName = Object.fromEntries(sync.templates.map((x) => [x.name, x]));
      assert.equal(byName.case_update_v2.param_count, 2);
      assert.equal(byName.case_update_v2.footer_text, 'بيوت مصر');
      assert.equal(byName.portal_login_code.buttons[0].type, 'OTP');
      assert.equal(byName.promo.status, 'REJECTED');
      assert.equal(byName.promo.rejected_reason, 'INVALID_FORMAT');
      assert.ok(g.calls.some((c) => c.url.includes('after=PAGE2')), 'follows paging.next');
      // re-sync without one template marks it removed
      pages = [TEMPLATES_P1, [TEMPLATES_P2[0]]];
      const sync2 = ok(await admin.post('/api/admin/whatsapp/templates/sync', {}));
      assert.equal(sync2.removed, 1);
      assert.equal(sync2.templates.find((x) => x.name === 'old_notice').removed, true);

      // mapping validation
      const put = (purpose, b) => admin.put(`/api/admin/whatsapp/template-mappings/${encodeURIComponent(purpose)}`, b);
      assert.equal((await mgr.put('/api/admin/whatsapp/template-mappings/case_update', { template_name: 'case_update_v2', language: 'ar', params: ['client_name', 'body'] })).status, 403);
      assert.equal((await put('case_update', { template_name: 'case_update_v2', language: 'ar', params: ['body'] })).status, 400, 'param count must match');
      assert.equal((await put('case_update', { template_name: 'promo', language: 'ar', params: ['body'] })).status, 400, 'rejected template');
      assert.equal((await put('case_update', { template_name: 'old_notice', language: 'ar', params: [] })).status, 400, 'removed template');
      assert.equal((await put('case_update', { template_name: 'case_update_v2', language: 'ar', params: ['client_name', 'code'] })).status, 400, 'variable not allowed for purpose');
      assert.equal((await put('otp', { template_name: 'case_update_v2', language: 'ar', params: ['code', 'org_name'] })).status, 400, 'otp needs an AUTHENTICATION template');
      assert.equal((await put('nope', { template_name: 'case_update_v2', language: 'ar', params: [] })).status, 404);
      const m1 = ok(await put('case_update', { template_name: 'case_update_v2', language: 'ar', params: ['client_name', 'body'] }));
      assert.equal(m1.state, 'ok');
      ok(await put('otp', { template_name: 'portal_login_code', language: 'ar', params: ['code'] }));
      const overview = ok(await mgr.get('/api/admin/whatsapp/templates'));
      assert.equal(overview.configured, true);
      assert.equal(overview.mappings.find((m) => m.purpose === 'case_update').mapping.template_name, 'case_update_v2');

      // inbound (signed) → case; 25h later the reply goes out with the mapped template
      ok(await signedPost(t, wa('201033300011', 'محتاجة أعرف حقي في معاش زوجي', { name: 'هالة' })));
      const intake = (await admin.get('/api/admin/intakes')).body.items[0];
      const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'LAB', title: 'معاش', client: { name: 'هالة عبد الرحمن' } }), 201).case;
      freezeClock(plusHours(T0, 25));
      const admin2 = await t.login('admin');
      const sent = ok(await admin2.post(`/api/admin/cases/${kase.id}/messages`, { body: 'نرجو إرسال\nصورة شهادة الوفاة' }));
      const row = await until(async () => (await outbox(admin2)).find((m) => m.id === sent.id && m.status !== 'queued'));
      assert.equal(row.status, 'sent', JSON.stringify(row));
      assert.equal(row.meta.via, 'template');
      assert.equal(row.meta.template, 'case_update_v2');
      const call = g.calls.find((c) => c.json?.type === 'template' && c.json.template.name === 'case_update_v2');
      assert.ok(call);
      assert.deepEqual(call.json.template.components[0].parameters.map((p) => p.text), ['هالة عبد الرحمن', 'نرجو إرسال — صورة شهادة الوفاة']);

      // OTP with the authentication template: code in body and copy-code button; never stored in the DB
      const before = g.calls.length;
      ok(await t.client().post('/api/public/portal-login/request', { phone: '01033300011' }));
      const otpCall = await until(() => g.calls.slice(before).find((c) => c.json?.template?.name === 'portal_login_code'));
      assert.ok(otpCall, 'OTP sent with the mapped authentication template');
      const code = otpCall.json.template.components[0].parameters[0].text;
      assert.match(code, /^\d{6}$/);
      assert.deepEqual(otpCall.json.template.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });
      const stored = t.app.db.get("SELECT body FROM messages WHERE automation_rule = 'portal_otp'");
      assert.ok(!stored.body.includes(code), 'the real code is never persisted');
      const challenge = t.app.db.get('SELECT 1 FROM portal_otps');
      assert.ok(challenge);
    } finally {
      g.restore();
      await t.close();
    }
  });

  test('read receipts when staff open the conversation; document upload + send inside the window; interactive survey buttons', async () => {
    freezeClock(T0);
    const g = mockGraph(handler());
    const t = await startTestApp({ seed: 'none', config: { ...LIVE_WA, sessionTtlHours: 24 * 30 } });
    try {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['FAM'] });
      const post = (p) => signedPost(t, p);
      const inbound = wa('201044400011', 'طليقي مش بيدفع النفقة', { id: 'wamid.IN.READ.1' });
      ok(await post(inbound));
      const intake = (await admin.get('/api/admin/intakes')).body.items[0];
      ok(await admin.get(`/api/admin/intakes/${intake.id}`));
      const readCall = await until(() => g.calls.find((c) => c.json?.status === 'read'));
      assert.ok(readCall, 'mark-as-read sent');
      assert.deepEqual(readCall.json, { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.IN.READ.1' });
      await until(() => t.app.db.value('SELECT read_receipt_at FROM messages WHERE external_id = ?', 'wamid.IN.READ.1'));
      ok(await admin.get(`/api/admin/intakes/${intake.id}`));
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(g.calls.filter((c) => c.json?.status === 'read').length, 1, 'already-read messages are not re-sent');

      // document inside the 24h window: multipart upload then a document message
      const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'FAM', title: 'نفقة' }), 201).case;
      const [doc] = ok(await admin.post(`/api/admin/cases/${kase.id}/documents`, { files: [samplePdf('نموذج_صحيفة_دعوى.pdf')] }));
      const r = ok(await admin.post(`/api/admin/documents/${doc.id}/send-to-client`, { channel: 'whatsapp', caption: 'مرفق نموذج الصحيفة' }));
      assert.equal(r.channel, 'whatsapp');
      const docCall = await until(() => g.calls.find((c) => c.json?.type === 'document'));
      assert.ok(docCall);
      assert.deepEqual(docCall.json.document, { id: 'MEDIA-1', filename: 'نموذج_صحيفة_دعوى.pdf', caption: 'مرفق نموذج الصحيفة' });
      const upload = g.calls.find((c) => c.url.endsWith('/PN123/media'));
      assert.ok(upload.init.body instanceof FormData, 'media uploaded as multipart form data');
      assert.equal(upload.init.body.get('messaging_product'), 'whatsapp');
      assert.equal(upload.init.body.get('type'), 'application/pdf');
      assert.ok(upload.init.body.get('file') instanceof Blob);
      const st = await until(async () => (await outbox(admin)).find((m) => m.id === r.message.id && m.status === 'sent'));
      assert.equal(st.meta.via, 'document');

      // survey inside the window → interactive reply buttons
      const { kase: k2 } = await answeredCase(t, admin, { phone: '201044400022', lawyer, post });
      freezeClock(plusHours(T0, 20));
      ok(await post(wa('201044400022', 'شكرًا جزيلًا')));
      freezeClock(plusHours(T0, 25));
      const a2 = await t.login('admin');
      await runAutomations(a2);
      const btnCall = await until(() => g.calls.find((c) => c.json?.type === 'interactive'));
      assert.ok(btnCall, 'interactive survey sent');
      const survey = t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', k2.id);
      assert.deepEqual(btnCall.json.interactive.action.buttons.map((b) => b.reply.id), [`svy:${survey.id}:5`, `svy:${survey.id}:3`, `svy:${survey.id}:1`]);
      assert.deepEqual(btnCall.json.interactive.action.buttons.map((b) => b.reply.title), ['ممتاز', 'جيد', 'غير راضٍ']);
    } finally {
      g.restore();
      await t.close();
    }
  });
});

// ═════════════════════════ 5) إرسال مستند للعميل (محاكاة) ═════════════════════════
describe('Send a case document to the client (simulation)', () => {
  test('inside the window → WhatsApp (simulated) + portal; outside → 409 for WhatsApp, auto falls back to the portal; scoped portal download; permissions', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 30 } });
    try {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin);
      ok(await t.client().post('/webhooks/whatsapp', wa('201055500011', 'محتاجة نموذج طلب إعلام وراثة')));
      const intake = (await admin.get('/api/admin/intakes')).body.items[0];
      const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'إعلام وراثة' }), 201).case;
      const docs = ok(await admin.post(`/api/admin/cases/${kase.id}/documents`, { files: [samplePdf('نموذج_الطلب.pdf'), samplePdf('مذكرة_داخلية.pdf')] }));
      const [doc, internal] = docs;

      assert.equal((await (await t.login(lawyer.username)).post(`/api/admin/documents/${doc.id}/send-to-client`, {})).status, 403);
      assert.equal((await admin.post('/api/admin/documents/99999/send-to-client', {})).status, 404);
      assert.equal((await admin.post(`/api/admin/documents/${doc.id}/send-to-client`, { channel: 'fax' })).status, 400);

      const r = ok(await admin.post(`/api/admin/documents/${doc.id}/send-to-client`, { channel: 'auto' }));
      assert.equal(r.channel, 'whatsapp');
      assert.equal(r.message.status, 'simulated');
      assert.equal(r.message.documents[0].id, doc.id);
      const detail = ok(await admin.get(`/api/admin/cases/${kase.id}`));
      const m = detail.messages.find((x) => x.id === r.message.id);
      assert.deepEqual(m.documents.map((d) => d.id), [doc.id], 'shown as an attachment in the staff conversation');
      assert.equal(m.meta.wa.type, 'document');
      assert.equal(detail.documents.length, 2, 'the document is not duplicated in the case');

      const token = portalToken(ok(await admin.post(`/api/admin/clients/${kase.client_id}/portal-link`, {})).url);
      const view = ok(await t.client().get(`/api/portal/${token}`));
      const pm = view.messages.find((x) => x.direction === 'out' && x.documents.length);
      assert.equal(pm.documents[0].id, doc.id, 'the sent document appears in the portal');
      const dl = await t.client().get(`/api/portal/${token}/documents/${doc.id}`);
      assert.equal(dl.status, 200);
      assert.equal(dl.headers.get('content-type'), 'application/pdf');
      assert.equal((await t.client().get(`/api/portal/${token}/documents/${internal.id}`)).status, 404, 'unsent documents stay private');
      assert.equal((await t.client().get(`/api/portal/${'x'.repeat(30)}/documents/${doc.id}`)).status, 404);

      // another client's portal cannot download it
      ok(await t.client().post('/webhooks/whatsapp', wa('201055500099', 'عميل آخر')));
      const other = (await admin.get('/api/admin/clients')).body.items.find((c) => c.phone === '+201055500099');
      const otherToken = portalToken(ok(await admin.post(`/api/admin/clients/${other.id}/portal-link`, {})).url);
      assert.equal((await t.client().get(`/api/portal/${otherToken}/documents/${doc.id}`)).status, 404);

      // 25h later: WhatsApp refuses documents outside the window
      freezeClock(plusHours(T0, 25));
      const admin2 = await t.login('admin');
      const refused = await admin2.post(`/api/admin/documents/${internal.id}/send-to-client`, { channel: 'whatsapp' });
      assert.equal(refused.status, 409);
      assert.match(refused.body.error, /24 ساعة/);
      const auto = ok(await admin2.post(`/api/admin/documents/${internal.id}/send-to-client`, { channel: 'auto', caption: 'مرفق لكم المذكرة' }));
      assert.equal(auto.channel, 'website');
      assert.match(auto.note, /بوابة العملاء/);
      assert.equal((await t.client().get(`/api/portal/${token}/documents/${internal.id}`)).status, 200);
      const activity = ok(await admin2.get(`/api/admin/cases/${kase.id}`)).activity;
      assert.ok(activity.some((a) => a.type === 'document.sent_to_client'));
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 6) استبيان رضا العملاء ═════════════════════════
describe('Satisfaction survey', () => {
  test('sent once N hours after the answer; button + digit replies captured without new intakes; low rating alerts the case manager; comment captured', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 60 } });
    try {
      let admin = await t.login('admin');
      ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr', name: 'منى السيد', password: 'Manager@2026' }), 201);
      const lawyer = await createLawyer(admin, { name: 'رانيا عبد الله', specialties: ['FAM'] });
      const A = await answeredCase(t, admin, { phone: '201066600011', lawyer });
      const B = await answeredCase(t, admin, { phone: '201066600022', lawyer, area: 'INH', title: 'ميراث' });
      const C = await answeredCase(t, admin, { phone: '201066600033', lawyer, area: 'INH', title: 'ولاية على مال قاصر' });
      const mgrId = t.app.db.value("SELECT id FROM users WHERE username = 'mgr'");
      t.app.db.run('UPDATE cases SET case_manager_id = ? WHERE id = ?', mgrId, B.kase.id);

      freezeClock(plusHours(T0, 2));
      admin = await t.login('admin');
      assert.equal((await runAutomations(admin)).satisfaction_survey, 0, 'too early');
      freezeClock(plusHours(T0, 25));
      admin = await t.login('admin');
      assert.equal((await runAutomations(admin)).satisfaction_survey, 3);
      assert.equal((await runAutomations(admin)).satisfaction_survey, 0, 'one survey per case');
      const surveys = (await outbox(admin)).filter((m) => m.automation_rule === 'satisfaction_survey');
      assert.equal(surveys.length, 3);
      for (const s of surveys) {
        assert.equal(s.channel, 'whatsapp');
        assert.equal(s.status, 'simulated');
        assert.match(s.body, /من 1 إلى 5/);
        assert.equal(s.meta.wa.buttons.length, 3);
      }
      const sv = (k) => t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', k.kase.id);
      const intakesBefore = (await admin.get('/api/admin/intakes?scope=all')).body.total;

      // A: interactive button «ممتاز»
      ok(await t.client().post('/webhooks/whatsapp', buttonReply('201066600011', `svy:${sv(A).id}:5`, 'ممتاز')));
      // B: digit reply «٢» → low rating
      ok(await t.client().post('/webhooks/whatsapp', wa('201066600022', '٢')));
      assert.equal((await admin.get('/api/admin/intakes?scope=all')).body.total, intakesBefore, 'survey replies never open new intakes');

      const fb = (k) => t.app.db.get('SELECT * FROM case_feedback WHERE case_id = ?', k.kase.id);
      assert.equal(fb(A).rating, 5);
      assert.equal(fb(A).channel, 'whatsapp');
      assert.equal(sv(A).status, 'answered');
      assert.equal(fb(B).rating, 2);
      assert.equal(sv(B).status, 'awaiting_comment');
      const mgr = await t.login('mgr', 'Manager@2026');
      const low = (await notificationsOf(mgr)).find((n) => n.type === 'survey.low_rating');
      assert.ok(low, 'case manager alerted on a low rating');
      assert.match(low.title, new RegExp(B.kase.code));
      const thanks = (await outbox(admin)).filter((m) => m.automation_rule === 'satisfaction_survey' && m.meta.survey_followup);
      assert.deepEqual(thanks.map((m) => m.meta.survey_followup).sort(), ['ask_comment', 'thanks']);

      // B's next message within 24h is recorded as the comment, still no new intake
      ok(await t.client().post('/webhooks/whatsapp', wa('201066600022', 'الرد اتأخر ومحدش رد على التليفون')));
      assert.equal(fb(B).comment, 'الرد اتأخر ومحدش رد على التليفون');
      assert.equal(sv(B).status, 'answered');
      assert.ok((await notificationsOf(mgr)).some((n) => n.type === 'survey.comment'));
      assert.equal((await admin.get('/api/admin/intakes?scope=all')).body.total, intakesBefore);
      // after the comment, messages flow normally again
      ok(await t.client().post('/webhooks/whatsapp', wa('201066600022', 'عندي سؤال تاني عن الشقة')));
      const cdB = ok(await admin.get(`/api/admin/cases/${B.kase.id}`));
      assert.ok(cdB.messages.some((m) => m.body === 'عندي سؤال تاني عن الشقة' && !m.meta.survey_id));

      // C: staff wrote after the survey → a bare digit is a normal message, not a rating
      ok(await admin.post(`/api/admin/cases/${C.kase.id}/messages`, { body: 'كم عدد الورثة؟' }));
      ok(await t.client().post('/webhooks/whatsapp', wa('201066600033', '3')));
      assert.equal(fb(C), undefined);
      assert.equal(sv(C).status, 'sent');
      // the survey expires after 7 days
      freezeClock(plusDays(plusHours(T0, 25), 8));
      admin = await t.login('admin');
      await runAutomations(admin);
      assert.equal(sv(C).status, 'expired');

      // case detail, lawyer metrics and analytics
      const cdA = ok(await admin.get(`/api/admin/cases/${A.kase.id}`));
      assert.equal(cdA.satisfaction.rating, 5);
      assert.equal(cdA.satisfaction.rating_label, 'ممتاز');
      assert.equal(ok(await admin.get(`/api/admin/cases/${C.kase.id}`)).satisfaction.survey.status, 'expired');
      const ld = ok(await admin.get(`/api/admin/lawyers/${lawyer.id}`));
      assert.equal(ld.lawyer.metrics.avg_client_satisfaction, 3.5);
      assert.equal(ld.lawyer.metrics.client_ratings, 2);

      const sum = ok(await (await t.login('mgr', 'Manager@2026')).get('/api/admin/surveys/summary'));
      assert.equal(sum.totals.surveys_sent, 3);
      assert.equal(sum.totals.responses, 2);
      assert.equal(sum.totals.avg_rating, 3.5);
      assert.equal(sum.totals.low_ratings, 1);
      assert.deepEqual(sum.distribution, { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 });
      assert.deepEqual(sum.by_area.map((a) => [a.area, a.responses]).sort(), [['FAM', 1], ['INH', 1]]);
      assert.equal(sum.by_lawyer[0].lawyer_id, lawyer.id);
      assert.equal(sum.by_lawyer[0].avg_rating, 3.5);
      assert.equal(sum.by_month.length, 1);
      assert.equal(sum.recent.find((r) => r.case_id === B.kase.id).comment, 'الرد اتأخر ومحدش رد على التليفون');
      assert.equal((await (await t.login(lawyer.username)).get('/api/admin/surveys/summary')).status, 403);
    } finally {
      await t.close();
    }
  });

  test('survey replies through the portal (digits + comment) and in words are captured; late button replies land on the right case; forged ids are ignored', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 60 } });
    try {
      let admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['FAM'] });
      const A = await answeredCase(t, admin, { phone: '201077700011', lawyer });
      const B = await answeredCase(t, admin, { phone: '201077700022', lawyer });
      const C = await answeredCase(t, admin, { phone: '201077700033', lawyer });
      freezeClock(plusHours(T0, 25));
      admin = await t.login('admin');
      assert.equal((await runAutomations(admin)).satisfaction_survey, 3);
      const fb = (k) => t.app.db.get('SELECT * FROM case_feedback WHERE case_id = ?', k.kase.id);
      // A answers in the full-scope portal: «4 الرد كان مفيد» → rating 4 with a comment, thanked in the portal
      const token = portalToken(ok(await admin.post(`/api/admin/clients/${A.kase.client_id}/portal-link`, {})).url);
      ok(await t.client().post(`/api/portal/${token}/messages`, { body: '4 الرد كان مفيد' }));
      assert.equal(fb(A).rating, 4);
      assert.equal(fb(A).comment, 'الرد كان مفيد');
      assert.equal(fb(A).channel, 'website');
      const view = ok(await t.client().get(`/api/portal/${token}`));
      assert.match(view.messages[view.messages.length - 1].body, /شكرًا جزيلًا على تقييمكم/);
      // B answers with a word right after the survey
      ok(await t.client().post('/webhooks/whatsapp', wa('201077700022', 'ممتاز')));
      assert.equal(fb(B).rating, 5);
      // C never answers → the survey expires; a late button tap still records the rating without opening an intake
      freezeClock(plusDays(plusHours(T0, 25), 9));
      admin = await t.login('admin');
      await runAutomations(admin);
      const sC = t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', C.kase.id);
      assert.equal(sC.status, 'expired');
      ok(await t.client().post('/webhooks/whatsapp', wa('201077700033', '5')));
      assert.equal(fb(C), undefined, 'digits after expiry are ordinary messages');
      const before = (await admin.get('/api/admin/intakes?scope=all')).body.total;
      ok(await t.client().post('/webhooks/whatsapp', buttonReply('201077700033', `svy:${sC.id}:3`, 'جيد')));
      assert.equal(fb(C).rating, 3);
      assert.equal((await admin.get('/api/admin/intakes?scope=all')).body.total, before);
      // a forged button id for another client's survey is ignored (normal message flow)
      const sB = t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', B.kase.id);
      ok(await t.client().post('/webhooks/whatsapp', buttonReply('201077700011', `svy:${sB.id}:1`, 'غير راضٍ')));
      assert.equal(fb(B).rating, 5);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 7) إصلاحات المراجعة ═════════════════════════
describe('Review fixes (messaging)', () => {
  test('portal OTP is unavailable in production without live WhatsApp (no promise of a code, nothing stored); demo and live keep it', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      ok(await t.client().post('/webhooks/whatsapp', wa('201088800011', 'استفسار عن معاش تكافل وكرامة')));
      t.app.config.production = true;
      t.app.config.demo = false;
      const r = await t.client().post('/api/public/portal-login/request', { phone: '01088800011' });
      assert.equal(r.status, 404, 'no fake promise of a code that cannot arrive');
      assert.match(r.body.error, /غير متاح/);
      assert.equal((await t.client().get('/api/meta')).body.messaging.portal_otp_enabled, false, 'the page shows the «unavailable» view');
      assert.equal(t.app.db.value('SELECT COUNT(*) FROM portal_otps'), 0);
      // the admin page explains why (enabled in settings but not available)
      const overview = ok(await (await t.login('admin')).get('/api/admin/whatsapp/templates'));
      assert.deepEqual(overview.portal_otp, { enabled: true, available: false, simulation: true });
      // a demo deployment keeps the simulated flow
      t.app.config.demo = true;
      assert.equal((await t.client().get('/api/meta')).body.messaging.portal_otp_enabled, true);
      ok(await t.client().post('/api/public/portal-login/request', { phone: '01088800011' }));
      // live WhatsApp in production → available again
      t.app.config.demo = false;
      const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      t.app.integrations.set('whatsapp', { token: 'tok', phone_number_id: '77', app_secret: 'sec' }, admin);
      assert.equal(t.app.messaging.portalOtpAvailable(), true);
    } finally {
      await t.close();
    }
  });

  test('the OTP message is recorded after the response (same synchronous path for known and unknown numbers); attempts-left copy uses the nominative dual', async () => {
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none' });
    try {
      ok(await t.client().post('/webhooks/whatsapp', wa('201088800022', 'محتاجة أتابع طلبي')));
      const count = () => Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'portal_otp'"));
      const before = count();
      const res = t.app.messaging.requestPortalCode({ ip: '10.9.8.7' }, { phone: '01088800022' });
      assert.ok(res.challenge);
      assert.equal(count(), before, 'nothing extra happens before the response for a verified number');
      await new Promise((r) => setImmediate(r));
      assert.equal(count(), before + 1, 'the code message is recorded right after');
      assert.ok(t.app.db.value('SELECT message_id FROM portal_otps ORDER BY id DESC LIMIT 1'), 'linked to its challenge');

      const anon = t.client();
      const wrong = (n) => anon.post('/api/public/portal-login/verify', { challenge: res.challenge, code: n });
      const code = /(\d{6})/.exec(t.app.db.value("SELECT body FROM messages WHERE automation_rule = 'portal_otp' ORDER BY id DESC LIMIT 1"))[1];
      const bad = code === '111111' ? '222222' : '111111';
      await wrong(bad);
      await wrong(bad);
      const third = await wrong(bad);
      assert.equal(third.body.details.attempts_left, 2);
      assert.match(third.body.error, /يتبقى لك محاولتان\./);
      const fourth = await wrong(bad);
      assert.match(fourth.body.error, /يتبقى لك محاولة واحدة\./);
    } finally {
      await t.close();
    }
  });

  test('a document that WhatsApp refuses stays available to the client in the portal (once), with an honest error for staff', async () => {
    freezeClock(T0);
    let mediaFails = true;
    const g = mockGraph((c) => {
      if (c.url.endsWith('/PN123/media')) {
        return mediaFails ? { status: 400, body: { error: { message: 'Media upload error', code: 131053 } } } : { body: { id: 'MEDIA-OK' } };
      }
      return null;
    });
    const t = await startTestApp({ seed: 'none', config: { ...LIVE_WA, sessionTtlHours: 24 * 30 } });
    try {
      const admin = await t.login('admin');
      ok(await signedPost(t, wa('201088800033', 'محتاجة صيغة إنذار للمالك')));
      const intake = (await admin.get('/api/admin/intakes')).body.items[0];
      const kase = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'FAM', title: 'إنذار' }), 201).case;
      const [doc] = ok(await admin.post(`/api/admin/cases/${kase.id}/documents`, { files: [samplePdf('صيغة_إنذار.pdf')] }));
      const r = ok(await admin.post(`/api/admin/documents/${doc.id}/send-to-client`, { channel: 'whatsapp' }));
      assert.equal(r.channel, 'whatsapp');
      const failed = await until(async () => (await outbox(admin)).find((m) => m.id === r.message.id && m.status === 'failed'));
      assert.ok(failed, 'the WhatsApp document message failed');
      assert.match(failed.error, /تعذر رفع المستند/);
      assert.match(failed.error, /أُتيح المستند للعميل في بوابة العملاء بدلًا من ذلك/);
      const fallback = t.app.db.get("SELECT * FROM messages WHERE json_extract(meta, '$.portal_fallback_for') = ?", r.message.id);
      assert.ok(fallback, 'a portal copy was recorded');
      assert.equal(fallback.channel, 'website');
      assert.equal(fallback.case_id, kase.id);
      const token = portalToken(ok(await admin.post(`/api/admin/clients/${kase.client_id}/portal-link`, {})).url);
      const view = ok(await t.client().get(`/api/portal/${token}`));
      assert.ok(view.messages.some((m) => m.direction === 'out' && (m.documents || []).some((d) => d.id === doc.id)), 'shown in the portal');
      assert.equal((await t.client().get(`/api/portal/${token}/documents/${doc.id}`)).status, 200, 'downloadable from the portal');
      const notif = (await notificationsOf(admin)).find((n) => n.type === 'message.failed');
      assert.match(notif.title, /المستند/);
      // a failing retry does not duplicate the portal copy; a successful one sends the document
      ok(await admin.post(`/api/admin/messages/${r.message.id}/retry`, {}));
      await until(async () => (await outbox(admin)).find((m) => m.id === r.message.id && m.status === 'failed'));
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE json_extract(meta, '$.portal_fallback_for') = ?", r.message.id)), 1);
      mediaFails = false;
      ok(await admin.post(`/api/admin/messages/${r.message.id}/retry`, {}));
      assert.ok(await until(async () => (await outbox(admin)).find((m) => m.id === r.message.id && m.status === 'sent')));
    } finally {
      g.restore();
      await t.close();
    }
  });

  test('a survey that could not be delivered is not counted as sent; the case shows why', async () => {
    freezeClock(T0);
    const g = mockGraph((c) => (c.json?.type === 'template' ? { status: 404, body: { error: { message: 'Template name does not exist in the translation', code: 132001 } } } : null));
    const t = await startTestApp({ seed: 'none', config: { ...LIVE_WA, sessionTtlHours: 24 * 30 } });
    try {
      let admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['FAM'] });
      const { kase } = await answeredCase(t, admin, { phone: '201088800044', lawyer, post: (p) => signedPost(t, p) });
      freezeClock(plusHours(T0, 26));
      admin = await t.login('admin');
      assert.equal((await runAutomations(admin)).satisfaction_survey, 1);
      const survey = t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', kase.id);
      assert.ok(await until(() => t.app.db.value('SELECT status FROM messages WHERE id = ?', survey.message_id) === 'failed'), 'outside the window without a valid template the survey fails');
      const sum = ok(await admin.get('/api/admin/surveys/summary'));
      assert.equal(sum.totals.surveys_sent, 0);
      assert.equal(sum.totals.undelivered, 1);
      assert.equal(sum.totals.awaiting, 0);
      assert.equal(sum.totals.response_rate, null);
      assert.match(ok(await admin.get(`/api/admin/cases/${kase.id}`)).satisfaction.text, /تعذر إرسال الاستبيان/);
    } finally {
      g.restore();
      await t.close();
    }
  });

  test('low-rating threshold from settings is clamped to 1–4; Arabic agreement in sync audit and mapping errors', async () => {
    freezeClock(T0);
    const g = mockGraph((c) => {
      if (c.url.includes('/WABA9/message_templates')) {
        return {
          body: {
            data: [
              { id: '1', name: 'case_update_v2', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'مرحبًا {{1}}، {{2}}' }] },
              { id: '2', name: 'plain_notice', language: 'ar', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'لديكم تحديث جديد في ملفكم.' }] },
              { id: '3', name: 'third', language: 'ar', status: 'PENDING', category: 'UTILITY', components: [{ type: 'BODY', text: 'نص' }] },
            ],
            paging: {},
          },
        };
      }
      return null;
    });
    const t = await startTestApp({ seed: 'none', config: { ...LIVE_WA, sessionTtlHours: 24 * 30 } });
    try {
      const admin = await t.login('admin');
      ok(await admin.post('/api/admin/whatsapp/templates/sync', {}));
      const audit = t.app.db.get("SELECT summary FROM security_events WHERE type = 'whatsapp.templates_synced' ORDER BY id DESC LIMIT 1");
      assert.match(audit.summary, /3 قوالب/);
      const zero = await admin.put('/api/admin/whatsapp/template-mappings/case_update', { template_name: 'plain_notice', language: 'ar', params: ['body'] });
      assert.equal(zero.status, 400);
      assert.match(zero.body.error, /لا يحتوي متغيرات/);
      ok(await admin.put('/api/admin/whatsapp/template-mappings/case_update', { template_name: 'plain_notice', language: 'ar', params: [] }));

      ok(await admin.patch('/api/admin/settings', { survey_low_rating_threshold: 5 }));
      assert.equal(ok(await admin.get('/api/admin/surveys/summary')).threshold, 4, 'a threshold of 5 would flag every rating as low');
      ok(await admin.patch('/api/admin/settings', { survey_low_rating_threshold: 0 }));
      assert.equal(ok(await admin.get('/api/admin/surveys/summary')).threshold, 2);
      ok(await admin.patch('/api/admin/settings', { survey_low_rating_threshold: 1 }));
      assert.equal(ok(await admin.get('/api/admin/surveys/summary')).threshold, 1);
    } finally {
      g.restore();
      await t.close();
    }
  });
});
