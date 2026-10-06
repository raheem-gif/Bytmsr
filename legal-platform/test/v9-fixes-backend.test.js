// v9 — إصلاحات ما قبل الإطلاق (الخلفية): حالة واتساب الفعلية بعد اختبار الاتصال، نطاق بوابة الدخول برمز واتساب،
// الإيقاف المؤقت للدخول، روابط التقويم بعد إنهاء الجلسات، رسائل المستفيدين قبل الإعداد الأول، تسميات الذكاء الاصطناعي،
// صفحة 404 وروابط /p/ المقطوعة، الضغط والتخزين المؤقت، وفتح الطلب دون إسناده تلقائيًا.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { startTestApp, waPayload, samplePdf, resetClock, freezeClock } from './helpers.js';
import { createLawyer, newCase, plusDays } from './lane-b-kit.test.js';
import { totp, base32Decode } from '../src/totp.js';

afterEach(() => resetClock());

const ok = (r, status = 200) => {
  assert.equal(r.status, status, `${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
};
const tokenOf = (url) => String(url).split('/p/')[1];

/** محاكاة Graph API لاختبار اتصال واتساب */
function mockGraph(handler) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://graph.facebook.com/')) return realFetch(url, init);
    const r = await handler(u, init);
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return () => (globalThis.fetch = realFetch);
}

// ═════════════════════════ 1) واتساب «متصل» فقط بعد اختبار ناجح ═════════════════════════
describe('WhatsApp health follows the last connection test', () => {
  test('failed test → danger check, «فشل آخر اختبار» label and dashboard state; success → ok; changing credentials → untested', async () => {
    const t = await startTestApp({ seed: 'none' });
    let graphOk = false;
    const restore = mockGraph(async () =>
      graphOk
        ? { status: 200, body: { display_phone_number: '+20 121 111 4662', verified_name: 'بيوت مصر', quality_rating: 'GREEN' } }
        : { status: 401, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } },
    );
    try {
      const admin = await t.login('admin');
      ok(
        await admin.put('/api/admin/integrations/whatsapp', {
          values: { token: 'EAAFAKE1234567890abcdefghij7890', phone_number_id: '123456789012345', waba_id: '987654321098765', app_secret: 'abcdef0123456789abcdef0123456789', verify_token: 'verify-token-123' },
        }),
      );
      // قبل أي اختبار: مضبوط لكن غير مختبر
      let health = ok(await admin.get('/api/admin/system/health'));
      let check = health.checks.find((c) => c.key === 'whatsapp');
      assert.equal(check.level, 'warning');
      assert.match(check.title, /لم يُختبر الاتصال/);
      assert.equal(health.integrations.whatsapp.state, 'untested');
      assert.equal(ok(await admin.get('/api/admin/dashboard')).whatsapp.state, 'untested');

      // اختبار فاشل (رمز غير صالح)
      const failed = ok(await admin.post('/api/admin/integrations/whatsapp/test'));
      assert.equal(failed.ok, false);
      health = ok(await admin.get('/api/admin/system/health'));
      check = health.checks.find((c) => c.key === 'whatsapp');
      assert.equal(check.level, 'danger', 'a failed test must never show as a green «واتساب مضبوط»');
      assert.equal(check.title, 'آخر اختبار اتصال لواتساب فشل');
      assert.ok(check.detail.includes(failed.message.replace(/[.،\s]+$/, '')), 'the failure message is shown');
      const ov = ok(await admin.get('/api/admin/integrations'));
      const waItem = ov.items.find((x) => x.name === 'whatsapp');
      assert.equal(waItem.runtime.state, 'failed');
      assert.doesNotMatch(waItem.runtime.label, /^متصل/);
      assert.equal(waItem.last_test.details?.cred_fp, undefined, 'the credential fingerprint is never returned');
      const dash = ok(await admin.get('/api/admin/dashboard'));
      assert.equal(dash.whatsapp.state, 'failed');
      assert.equal(ok(await admin.get('/api/admin/settings')).integrations.whatsapp_status.state, 'failed');

      // اختبار ناجح
      graphOk = true;
      ok(await admin.post('/api/admin/integrations/whatsapp/test'));
      health = ok(await admin.get('/api/admin/system/health'));
      check = health.checks.find((c) => c.key === 'whatsapp');
      assert.equal(check.level, 'ok');
      assert.equal(health.integrations.whatsapp.state, 'connected');
      assert.equal(ok(await admin.get('/api/admin/dashboard')).whatsapp.state, 'connected');

      // تغيير بيانات الاعتماد بعد الاختبار: النتيجة القديمة لا تُحسب
      ok(await admin.put('/api/admin/integrations/whatsapp', { values: { token: 'EAANEWTOKEN0987654321zyxwvu1234' } }));
      health = ok(await admin.get('/api/admin/system/health'));
      check = health.checks.find((c) => c.key === 'whatsapp');
      assert.equal(check.level, 'warning');
      assert.match(check.detail, /تغيّرت بيانات الاعتماد/);
      assert.equal(ok(await admin.get('/api/admin/dashboard')).whatsapp.state, 'untested');
    } finally {
      restore();
      await t.close();
    }
  });
});

// ═════════════════════════ 2) نطاق بوابة رمز واتساب ═════════════════════════
describe('Portal OTP login never exposes a website request typed with someone else\'s number', () => {
  const SECRET = 'SECRET-A: نزاع على تركة زوجي المتوفى، وأخو الزوج يرفض تسليم نصيب أبنائي القصر من الشقة.';

  async function otpLogin(t, admin, phone) {
    const anon = t.client();
    const r = ok(await anon.post('/api/public/portal-login/request', { phone }));
    await new Promise((res) => setTimeout(res, 30));
    const e164 = `+2${phone}`;
    const msg = t.app.db.get("SELECT body FROM messages WHERE automation_rule = 'portal_otp' AND to_address = ? ORDER BY id DESC LIMIT 1", e164);
    assert.ok(msg, 'a code is sent to the (WhatsApp-verified) number');
    const code = /(\d{6})/.exec(msg.body)[1];
    const v = ok(await anon.post('/api/public/portal-login/verify', { challenge: r.challenge, code }));
    return { anon, token: tokenOf(v.redirect) };
  }

  test('website intake (new number) → WhatsApp from the real owner → OTP: the website request, its documents and the owner\'s portal messages stay apart', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      // (1) مقدمة الطلب «أ» تكتب رقمًا ليس رقمها (رقم جديد على المنصة)
      const sub = ok(
        await t.client().post('/api/public/intake', { consent: true, name: 'سارة أ.', phone: '01099990001', legal_area: 'INH', description: SECRET, documents: [samplePdf('a-secret.pdf')] }),
        201,
      );
      const aToken = tokenOf(sub.portal_url);
      const aIntake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', sub.reference);
      const aDoc = t.app.db.get('SELECT id FROM documents WHERE intake_id = ?', aIntake.id);
      assert.ok(aDoc, 'the website attachment is stored');
      // الإدارة ترى أن الرقم غير مثبت
      const d0 = ok(await admin.get(`/api/admin/intakes/${aIntake.id}`));
      assert.equal(d0.intake.identity.phone_unverified, true);
      assert.equal(d0.intake.identity.phone_match_unverified, false);

      // (2) صاحب الرقم الحقيقي «ب» يراسل المؤسسة على واتساب
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: '201099990001', name: 'ب', text: 'مين معايا؟' })));
      // (3+4) «ب» يدخل البوابة برمز واتساب
      const { anon, token } = await otpLogin(t, admin, '01099990001');
      const view = ok(await anon.get(`/api/portal/${token}`));
      const dump = JSON.stringify(view);
      assert.equal(view.scope, 'client');
      assert.ok(!dump.includes('SECRET-A'), 'the website request text must not be shown to the number owner');
      assert.ok(!view.intakes.some((i) => i.code === sub.reference), 'the website request is not listed');
      assert.equal((await anon.get(`/api/portal/${token}/documents/${aDoc.id}`)).status, 404, 'the website attachment cannot be downloaded');
      // رابط رمز واتساب أقصر عمرًا ومقيد بالرقم
      const row = t.app.db.get('SELECT * FROM portal_tokens WHERE phone IS NOT NULL ORDER BY rowid DESC LIMIT 1');
      assert.equal(row.phone, '+201099990001');
      const days = (Date.parse(row.expires_at) - Date.parse(row.created_at)) / 86400000;
      assert.ok(days <= 31, `OTP links live ~30 days, got ${days}`);
      // سجل العميل يذكر الرقم الذي دخل
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE type = 'portal.otp_login' AND summary LIKE '%•%'") || t.app.db.get("SELECT 1 FROM activity WHERE type = 'portal.otp_login' AND data LIKE '%phone%'"));

      // (5) رسالة «ب» من البوابة لا تُلحق بطلب «أ»، و«أ» لا ترى رسائل «ب» على واتساب في رابط طلبها
      ok(await anon.post(`/api/portal/${token}/messages`, { body: 'رسالة ب من البوابة' }));
      const bMsg = t.app.db.get("SELECT * FROM messages WHERE body = 'رسالة ب من البوابة'");
      assert.notEqual(bMsg.intake_id, aIntake.id);
      const aView = ok(await t.client().get(`/api/portal/${aToken}`));
      const aDump = JSON.stringify(aView);
      assert.equal(aView.scope, 'request');
      assert.ok(aDump.includes('SECRET-A'), 'the submitter still follows her own request');
      assert.ok(!aDump.includes('مين معايا'), "the number owner's WhatsApp text is not mirrored into the website link");
      assert.ok(!aDump.includes('رسالة ب من البوابة'));
      const bView = ok(await anon.get(`/api/portal/${token}`));
      assert.ok(JSON.stringify(bView).includes('رسالة ب من البوابة'), 'the owner sees his own portal message');

      // (6) بعد أن تؤكد الإدارة الهوية يظهر الطلب في بوابة صاحب الرقم
      ok(await admin.post(`/api/admin/intakes/${aIntake.id}/confirm-identity`));
      assert.equal(ok(await admin.get(`/api/admin/intakes/${aIntake.id}`)).intake.identity.phone_unverified, false);
      assert.ok(JSON.stringify(ok(await anon.get(`/api/portal/${token}`))).includes('SECRET-A'));
    } finally {
      await t.close();
    }
  });

  test('a staff phone log on the identity, or a staff full link, still does not expose an unconfirmed website request', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      ok(await t.client().post('/api/public/intake', { consent: true, name: 'سارة أ.', phone: '01099990002', description: SECRET }), 201);
      // مكالمة سجلتها الإدارة لنفس الرقم (تجعل الرقم موثّقًا للدخول برمز)
      ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01099990002', name: 'متصل', text: 'اتصل يسأل عن موعد' }), 201);
      const { anon, token } = await otpLogin(t, admin, '01099990002');
      const view = ok(await anon.get(`/api/portal/${token}`));
      assert.ok(!JSON.stringify(view).includes('SECRET-A'));
      assert.ok(JSON.stringify(view).includes('REQ-'), 'the staff-recorded request is visible');
      const clientId = t.app.db.value("SELECT client_id FROM client_identities WHERE value = '+201099990002'");
      const link = ok(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}));
      assert.ok(!JSON.stringify(ok(await t.client().get(`/api/portal/${tokenOf(link.url)}`))).includes('SECRET-A'));
    } finally {
      await t.close();
    }
  });

  test('after a merge, an OTP link for the merged-in number shows only what came from that number', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      // ملف «أ» الحقيقي عبر واتساب من رقمها
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: '201088880001', name: 'سارة', text: 'A-PRIVATE: عندي مشكلة في نفقة الأولاد' })));
      // طلب من الموقع برقم «ب» (خطأ في الكتابة)، ثم يراسل «ب» على واتساب
      ok(await t.client().post('/api/public/intake', { consent: true, name: 'سارة أ.', phone: '01099990003', description: SECRET }), 201);
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: '201099990003', name: 'ب', text: 'B-OWN: سؤال عن عقد إيجار' })));
      const aId = t.app.db.value("SELECT client_id FROM client_identities WHERE value = '+201088880001'");
      const cId = t.app.db.value("SELECT client_id FROM client_identities WHERE value = '+201099990003'");
      // الإدارة تدمج ملف الموقع في ملف «أ» الحقيقي
      ok(await admin.post(`/api/admin/clients/${aId}/merge`, { other_client_id: cId }));
      const { anon, token } = await otpLogin(t, admin, '01099990003');
      const dump = JSON.stringify(ok(await anon.get(`/api/portal/${token}`)));
      assert.ok(!dump.includes('A-PRIVATE'), "the merged client's own WhatsApp history is not exposed to the other number");
      assert.ok(!dump.includes('SECRET-A'));
      assert.ok(!dump.includes('سارة'), "the merged client's name is not shown");
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 3) الإيقاف المؤقت لكل مصدر لا للحساب كله ═════════════════════════
describe('Login lockout cannot be used to lock the owner out', () => {
  const login = (t, body, { ip, device } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (ip) headers['x-forwarded-for'] = ip;
    if (device) headers.cookie = `bm_dev=${device}`;
    return fetch(`${t.base}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify(body) }).then(async (r) => ({
      status: r.status,
      body: await r.json(),
      cookies: r.headers.getSetCookie(),
    }));
  };

  test('5 wrong passwords lock only the guessing address; the owner logs in from another address or a known device; escalation is capped; admin unlock clears it', async () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const created = ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'salwa2', name: 'سلوى عبد الله', password: 'Salwa#2026x' }), 201);
      // المالكة تدخل مرة من هاتفها فيُتذكر الجهاز
      const first = await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '203.0.113.10' });
      assert.equal(first.status, 200);
      const devCookie = first.cookies.find((c) => c.startsWith('bm_dev='));
      assert.ok(devCookie, 'a known-device cookie is set after a successful login');
      assert.match(devCookie, /HttpOnly/);
      assert.match(devCookie, /Path=\/api\/auth/);
      assert.match(devCookie, /SameSite=Strict/);
      const device = /bm_dev=([^;]+)/.exec(devCookie)[1];

      // المهاجم: 5 كلمات مرور خاطئة من عنوانه
      for (let i = 0; i < 5; i++) assert.equal((await login(t, { username: 'salwa2', password: `wrong-guess-${i}` }, { ip: '198.51.100.7' })).status, 401);
      const blocked = await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '198.51.100.7' });
      assert.equal(blocked.status, 429, 'the guessing address is paused, even with the right password');
      assert.match(blocked.body.error, /جهاز سبق أن دخلت منه/);
      const row = t.app.db.get("SELECT * FROM login_locks WHERE user_id = ? AND source = 'ip:198.51.100.7'", created.id);
      assert.equal(row.failures, 5);
      // محاولات أثناء الإيقاف لا تطيله ولا تُحسب
      await login(t, { username: 'salwa2', password: 'again' }, { ip: '198.51.100.7' });
      assert.equal(t.app.db.get("SELECT failures, locked_until FROM login_locks WHERE user_id = ? AND source = 'ip:198.51.100.7'", created.id).locked_until, row.locked_until);

      // المالكة: من شبكة أخرى، ومن نفس عنوان المهاجم لكن بجهازها المعروف
      assert.equal((await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '203.0.113.99' })).status, 200);
      assert.equal((await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '198.51.100.7', device })).status, 200);
      // كعكة جهاز لا نعرفها لا تُعامل كجهاز معروف
      assert.equal((await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '198.51.100.7', device: 'A'.repeat(43) })).status, 429);

      // سقف التصاعد: 4 ساعات كحد أقصى
      assert.equal((await login(t, { username: 'salwa2', password: 'nope' }, { ip: '10.8.0.1' })).status, 401);
      t.app.db.run("UPDATE login_locks SET failures = 99, locked_until = NULL WHERE user_id = ? AND source = 'ip:10.8.0.1'", created.id);
      assert.equal((await login(t, { username: 'salwa2', password: 'nope' }, { ip: '10.8.0.1' })).status, 401);
      const capped = t.app.db.get("SELECT locked_until FROM login_locks WHERE user_id = ? AND source = 'ip:10.8.0.1'", created.id);
      const mins = (Date.parse(capped.locked_until) - Date.now()) / 60000;
      assert.ok(mins > 200 && mins <= 241, `lock is capped at 4 hours (got ${mins.toFixed(1)} min)`);

      // هجوم موزّع على عناوين كثيرة: يتوقف الدخول من الأجهزة غير المعروفة مؤقتًا، ويبقى جهاز المالكة يعمل
      let last;
      for (let i = 0; i < 31; i++) last = await login(t, { username: 'salwa2', password: 'nope' }, { ip: `10.9.0.${i}` });
      assert.equal(last.status, 429);
      assert.equal((await login(t, { username: 'salwa2', password: 'Salwa#2026x' }, { ip: '10.9.9.9', device })).status, 200, 'known device is unaffected');

      // الإدارة ترى المصادر الموقوفة وترفع الإيقاف
      const acc = ok(await admin.get(`/api/admin/accounts/${created.id}`));
      assert.equal(acc.state, 'locked');
      assert.ok(acc.login_locks.some((l) => l.ip === '198.51.100.7'));
      assert.ok(acc.known_devices >= 1);
      ok(await admin.post(`/api/admin/accounts/${created.id}/unlock`));
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM login_locks WHERE user_id = ?', created.id)), 0);
      const lockouts = ok(await admin.get('/api/admin/audit?type=auth.lockout')).items;
      assert.ok(lockouts.some((e) => e.summary.includes('198.51.100.7')), 'the lockout names the paused source');
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
      await t.close();
    }
  });
});

// ═════════════════════════ 4) رابط التقويم بعد إنهاء الجلسات ═════════════════════════
describe('Calendar feed is revoked with sessions and visible to admins', () => {
  test('revoke-all, own revoke-others, 2FA reset (lost phone), role change and the admin button all stop the .ics link', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const created = ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'karim2', name: 'كريم منصور', password: 'Karim#2026x' }), 201);
      const icsPath = (feed) => new URL(feed.url).pathname;
      const issue = async () => {
        const mgr = await t.login('karim2', 'Karim#2026x');
        const feed = ok(await mgr.post('/api/calendar/feed'));
        assert.equal((await t.client().get(icsPath(feed))).status, 200);
        return { mgr, path: icsPath(feed), token: icsPath(feed).split('/').pop().replace('.ics', '') };
      };

      // (أ) إنهاء كل الجلسات من الإدارة
      let f = await issue();
      let acc = ok(await admin.get(`/api/admin/accounts/${created.id}`));
      assert.equal(acc.calendar_feed.active, true);
      assert.ok(!JSON.stringify(acc).includes(f.token), 'the feed token is never shown to admins');
      const r = ok(await admin.post(`/api/admin/accounts/${created.id}/sessions/revoke`));
      assert.equal(r.calendar_feed_revoked, true);
      assert.equal((await t.client().get(f.path)).status, 404);
      assert.equal(ok(await admin.get(`/api/admin/accounts/${created.id}`)).calendar_feed.active, false);
      const ev = ok(await admin.get('/api/admin/audit?type=calendar.feed_revoked')).items;
      assert.ok(ev.some((e) => e.summary.includes('إنهاء كل الجلسات')));

      // (ب) زر الإدارة
      f = await issue();
      ok(await admin.post(`/api/admin/accounts/${created.id}/calendar-feed/revoke`));
      assert.equal((await t.client().get(f.path)).status, 404);
      assert.equal((await admin.post(`/api/admin/accounts/${created.id}/calendar-feed/revoke`)).status, 409);

      // (ج) المستخدم نفسه: تسجيل الخروج من الأجهزة الأخرى
      f = await issue();
      const own = ok(await f.mgr.post('/api/account/sessions/revoke-others'));
      assert.equal(own.calendar_feed_revoked, true);
      assert.equal((await t.client().get(f.path)).status, 404);

      // (د) إلغاء التحقق بخطوتين بسبب فقدان الهاتف
      f = await issue();
      const setup = ok(await f.mgr.post('/api/account/2fa/setup', { password: 'Karim#2026x' }));
      ok(await f.mgr.post('/api/account/2fa/enable', { code: totp(base32Decode(setup.secret), Date.now()) }));
      assert.equal((await t.client().get(f.path)).status, 200);
      ok(await admin.post(`/api/admin/accounts/${created.id}/2fa/reset`));
      assert.equal((await t.client().get(f.path)).status, 404);

      // (هـ) تغيير الدور
      f = await issue();
      ok(await admin.patch(`/api/admin/users/${created.id}`, { role: 'admin' }));
      assert.equal((await t.client().get(f.path)).status, 404);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 5) قبل الإعداد الأول: رسالة مفهومة للمستفيد ═════════════════════════
describe('Public endpoints before first-run setup', () => {
  test('intake and portal login answer with a beneficiary-safe message and the org phone; admin APIs keep the technical one', async () => {
    const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
    try {
      assert.equal(t.app.system.isSetupMode(), true);
      const anon = t.client();
      for (const [url, body] of [
        ['/api/public/intake', { consent: true, name: 'مستفيدة', phone: '01011112222', description: 'وصف كافٍ لمشكلة قانونية تخص الميراث والنفقة.' }],
        ['/api/public/portal-login/request', { phone: '01011112222' }],
      ]) {
        const r = await anon.post(url, body);
        assert.equal(r.status, 503, url);
        assert.match(r.body.error, /قيد التجهيز/);
        assert.ok(r.body.error.includes('01211114662'), 'the org phone is given');
        assert.doesNotMatch(r.body.error, /مدير النظام|سجل تشغيل الخادم/);
      }
      const adminApi = await anon.get('/api/admin/cases');
      assert.equal(adminApi.status, 503);
      assert.equal(adminApi.body.code, 'setup_required');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 6) تسميات الذكاء الاصطناعي في صفحة التكاملات ═════════════════════════
describe('AI integration values are labelled in Arabic', () => {
  test('effort and provider carry an Arabic value_label and options; the model is a code value', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const ai = ok(await admin.get('/api/admin/integrations')).items.find((x) => x.name === 'anthropic');
      const f = Object.fromEntries(ai.fields.map((x) => [x.key, x]));
      assert.equal(f.effort.value, 'medium');
      assert.equal(f.effort.value_label, 'متوسط (موصى به)');
      assert.ok(f.effort.options.some((o) => o.value === 'high' && o.label === 'مرتفع'));
      assert.equal(f.provider.value, 'auto');
      assert.match(f.provider.value_label, /^تلقائي/);
      assert.doesNotMatch(f.provider.label, /auto|anthropic|heuristic/);
      assert.equal(f.model.code, true);
      assert.match(f.model.label, /عند تفعيل Claude/);
      const bad = await admin.put('/api/admin/integrations/anthropic', { values: { effort: 'turbo' } });
      assert.equal(bad.status, 400);
      assert.match(JSON.stringify(bad.body), /منخفض أو متوسط/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 7) صفحة 404 وروابط /p/ المقطوعة ═════════════════════════
describe('Branded 404 and truncated /p/ links', () => {
  test('any /p/… opens the follow-up page; unknown paths get the branded 404 with phone and links', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      for (const p of ['/p/', '/p/abc123', '/p/Fp_short-token']) {
        const r = await c.get(p);
        assert.equal(r.status, 200, p);
        assert.match(r.body, /portal\.js/, `${p} serves the follow-up page (it shows «تعذر فتح صفحة المتابعة»)`);
        assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
      }
      assert.equal((await c.get('/api/portal/abc123')).status, 404);
      for (const p of ['/no-such-page', '/setup', '/privacy.html']) {
        const r = await c.get(p);
        assert.equal(r.status, 404, p);
        assert.match(r.body, /الصفحة غير موجودة/);
        assert.match(r.body, /public-site\.css/, 'styled like the public site');
        assert.match(r.body, /href="\/portal"[^>]*>متابعة طلبك/);
        assert.match(r.body, /href="\/intake"[^>]*>قدّم طلبًا/);
        assert.ok(r.body.includes('01211114662'), 'the org phone is shown');
        assert.doesNotMatch(r.body, /Tahoma/);
      }
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 8) الضغط والتخزين المؤقت ═════════════════════════
describe('Compression and caching of public assets', () => {
  const raw = (base, pathname, headers = {}) =>
    new Promise((resolve, reject) => {
      const u = new URL(base + pathname);
      http
        .get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        })
        .on('error', reject);
    });

  test('static CSS/JS and JSON are gzipped, revalidate with ETag/304, and versioned URLs are immutable', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const css = await raw(t.base, '/assets/css/app.css', { 'accept-encoding': 'gzip, br' });
      assert.equal(css.status, 200);
      assert.equal(css.headers['content-encoding'], 'gzip');
      assert.match(css.headers.vary || '', /Accept-Encoding/i);
      const plain = zlib.gunzipSync(css.body).toString('utf8');
      assert.ok(plain.length > css.body.length * 2, 'compressed to well under half');
      assert.equal(css.headers['cache-control'], 'no-cache');
      const etag = css.headers.etag;
      assert.ok(etag);
      const again = await raw(t.base, '/assets/css/app.css', { 'accept-encoding': 'gzip', 'if-none-match': etag });
      assert.equal(again.status, 304);
      assert.equal(again.body.length, 0);
      const identity = await raw(t.base, '/assets/css/app.css');
      assert.equal(identity.headers['content-encoding'], undefined, 'clients without gzip get the plain file');
      assert.equal(identity.body.toString('utf8'), plain);

      const meta = await raw(t.base, '/api/meta', { 'accept-encoding': 'gzip' });
      assert.equal(meta.headers['content-encoding'], 'gzip');
      assert.ok(JSON.parse(zlib.gunzipSync(meta.body).toString('utf8')).constants);

      // الصفحات العامة تشير إلى CSS/JS برقم الإصدار، وهذا الرابط يُخزَّن سنة
      const home = await raw(t.base, '/', { 'accept-encoding': 'gzip' });
      assert.equal(home.headers['content-encoding'], 'gzip');
      const html = zlib.gunzipSync(home.body).toString('utf8');
      const m = /href="(\/assets\/css\/public-site\.css\?v=[A-Za-z0-9_-]+)"/.exec(html);
      assert.ok(m, 'versioned stylesheet link');
      const versioned = await raw(t.base, m[1]);
      assert.match(versioned.headers['cache-control'], /max-age=31536000/);
      assert.match(versioned.headers['cache-control'], /immutable/);
      const stale = await raw(t.base, '/assets/css/public-site.css?v=old');
      assert.equal(stale.headers['cache-control'], 'no-cache', 'a wrong version is never cached for long');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 9) فتح الطلب لا يُسنده، ومعاينة قبل تشغيل القواعد ═════════════════════════
describe('Viewing a request does not claim it; running rules is previewed first', () => {
  test('opening a new request keeps it «جديد» and unassigned; the first reply starts triage', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: '201077700011', text: 'عايزة أسأل عن النفقة' })));
      const admin = await t.login('admin');
      const it = ok(await admin.get('/api/admin/intakes')).items[0];
      const d = ok(await admin.get(`/api/admin/intakes/${it.id}`));
      assert.equal(d.intake.status, 'new');
      assert.equal(d.intake.assigned_staff_id, null);
      let row = t.app.db.get('SELECT status, assigned_staff_id, unread_count FROM intakes WHERE id = ?', it.id);
      assert.equal(row.status, 'new');
      assert.equal(row.unread_count, 0, 'still marked as read');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM activity WHERE intake_id = ? AND type = 'intake.triage_started'", it.id)), 0);
      ok(await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'أهلًا بحضرتك، برجاء إرسال تاريخ الطلاق.' }));
      row = t.app.db.get('SELECT status, assigned_staff_id FROM intakes WHERE id = ?', it.id);
      assert.equal(row.status, 'in_review');
      assert.equal(row.assigned_staff_id, admin.user.id);
    } finally {
      await t.close();
    }
  });

  test('automation preview counts the WhatsApp reminders without sending or recording anything', async () => {
    const T0 = '2026-11-02T08:00:00.000Z';
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const M = await createLawyer(admin, { name: 'محامي الجلسات', specialties: ['CIV'] });
      const c = await newCase(admin, { phone: '01055500011', legal_area: 'CIV', title: 'دعوى تعويض' });
      const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', responsible_lawyer_id: M.id, court: 'محكمة شمال القاهرة' }), 201);
      ok(await admin.post(`/api/admin/matters/${m.id}/invoices`, { description: 'أتعاب الدعوى', amount: 2000, due_at: plusDays(T0, 1) }));
      freezeClock(plusDays(T0, 2));
      const count = () => Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE direction = 'out' AND automation_rule = 'invoice_reminder'"));
      const runs = () => Number(t.app.db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key = 'invoice_reminder'"));
      const pv = ok(await admin.get('/api/admin/automations/preview'));
      assert.equal(pv.whatsapp, 1);
      assert.equal(pv.by_rule.invoice_reminder, 1);
      assert.equal(count(), 0, 'preview records no message');
      assert.equal(runs(), 0, 'preview marks nothing as done');
      ok(await admin.post('/api/admin/automations/run'));
      assert.equal(count(), 1);
      assert.equal(ok(await admin.get('/api/admin/automations/preview')).messages, 0, 'nothing left to send');
    } finally {
      await t.close();
    }
  });
});
