// الإصدار 9 — وحدة platform: الإعداد الأول، أمر استرداد مدير النظام، التكاملات، النسخ الاحتياطي، التصدير الكامل، صحة النظام.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startTestApp } from './helpers.js';
import { ok } from './lane-b-kit.test.js';
import { readTarBuffer, tarChunks } from '../src/services/system-tar.js';
import { loadConfig } from '../src/config.js';
import { strongPasswordProblem, BACKUP_FILE_RE } from '../src/services/system.js';
import { verifyPassword } from '../src/auth.js';
import { sha256 } from '../src/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRONG = 'Nile#Delta-Garden7';

function runScript(script, args, { dataDir, input } = {}) {
  const env = { ...process.env, DATA_DIR: dataDir, NODE_ENV: 'development', PORT: '9' };
  delete env.DB_PATH;
  delete env.ADMIN_USERNAME;
  delete env.ADMIN_PASSWORD;
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env,
    input: input ?? '',
    encoding: 'utf8',
    timeout: 60000,
  });
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ───────────────────────── سياسة كلمة المرور ─────────────────────────
test('platform: strong password policy for administrator accounts', () => {
  assert.ok(strongPasswordProblem('short1!'), 'too short');
  assert.ok(strongPasswordProblem('alllowercaseletters'), 'single class');
  assert.ok(strongPasswordProblem('Admin@2026'), 'common word + year');
  assert.ok(strongPasswordProblem('Password#123'), 'password variant');
  assert.ok(strongPasswordProblem('Director#2026x', { username: 'director' }), 'contains username');
  assert.ok(strongPasswordProblem('12345678!@#$Ab'), 'mostly digits');
  assert.equal(strongPasswordProblem(STRONG, { username: 'director' }), null);
  assert.equal(strongPasswordProblem('حقوق-الأيتام-2026', { username: 'director' }), null, 'Arabic passphrase with digits and symbols');
});

// ───────────────────────── الإعداد الأول ─────────────────────────
test('platform: first-run setup mode end to end (token, 503 elsewhere, single use, 404 after)', async () => {
  const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
  try {
    const { app } = t;
    const anon = t.client();
    assert.equal(Number(app.db.value('SELECT COUNT(*) FROM users')), 0);
    assert.equal(app.system.isSetupMode(), true);

    // رمز جديد (يلغي رمز التشغيل) — لا يُخزن إلا مُجزّأً
    const { token, url } = app.system.beginSetup();
    assert.match(url, /\/setup#token=/);
    const row = app.db.get('SELECT * FROM system_setup WHERE id = 1');
    assert.equal(row.token_hash, sha256(token));
    assert.ok(!JSON.stringify(row).includes(token), 'raw token must never be stored');

    // الصحة والبيانات الوصفية متاحة؛ بقية /api تعيد 503
    let r = await anon.get('/healthz');
    assert.equal(ok(r).status, 'setup_required');
    r = await anon.get('/api/meta');
    assert.equal(ok(r).setup_required, true);
    for (const [method, url2] of [
      ['GET', '/api/admin/cases'],
      ['POST', '/api/auth/login'],
      ['GET', '/api/auth/session'],
      ['GET', '/webhooks/whatsapp'],
    ]) {
      r = await anon.request(method, url2, method === 'POST' ? { username: 'x', password: 'y' } : undefined);
      assert.equal(r.status, 503, `${method} ${url2}`);
      assert.equal(r.body.code, 'setup_required');
      assert.match(r.body.error, /وضع الإعداد/);
    }
    r = await anon.get('/app');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/setup');
    r = await anon.get('/setup');
    assert.equal(r.status, 200);
    assert.match(r.body, /setup\.js/);

    // بيانات المعالج: القيم الافتراضية لمؤسسة بيوت مصر، دون الرمز
    r = await anon.get('/api/setup/status');
    const st = ok(r);
    assert.equal(st.defaults.org_legal_name, 'مؤسسة بيوت مصر لدعم الأرامل والأيتام');
    assert.equal(st.defaults.org_phone, '01211114662');
    assert.match(st.defaults.org_facebook_url, /facebook\.com\/Beyootmisr/);
    assert.ok(st.integrations.whatsapp.fields.some((f) => f.key === 'token' && f.secret));
    assert.ok(!JSON.stringify(st).includes(token));

    // رمز خاطئ / صحيح
    r = await anon.post('/api/setup/verify', { token: 'x'.repeat(32) });
    assert.equal(r.status, 403);
    r = await anon.post('/api/setup/verify', { token });
    assert.equal(ok(r).ok, true);

    const org = { ...st.defaults, org_phone: '01211114662', org_address: '44 شارع المحكمة العسكرية، مدينة نصر، القاهرة' };
    const admin = { name: 'هالة عبد الرحمن', username: 'director', password: STRONG, password_confirm: STRONG };

    // بدون رمز / كلمة مرور ضعيفة / تأكيد غير مطابق / رابط فيسبوك غير صالح — لا يُنشأ أي حساب
    r = await anon.post('/api/setup/complete', { org, admin });
    assert.equal(r.status, 403);
    r = await anon.post('/api/setup/complete', { token, org, admin: { ...admin, password: 'Admin@2026', password_confirm: 'Admin@2026' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.fields.password);
    r = await anon.post('/api/setup/complete', { token, org, admin: { ...admin, password_confirm: 'Different#Pass99' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.fields.password_confirm);
    r = await anon.post('/api/setup/complete', { token, org: { ...org, org_facebook_url: 'http://evil.example.com' }, admin });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.fields.org_facebook_url);
    r = await anon.post('/api/setup/complete', { token, org, admin, integrations: { whatsapp: { phone_number_id: 'abc' } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.details.step, 'integrations');
    assert.equal(Number(app.db.value('SELECT COUNT(*) FROM users')), 0);

    // الإتمام الناجح: حساب + ملف المؤسسة + مفاتيح التكاملات + تسجيل دخول مباشر
    const waToken = 'EAAGm0PX4ZCpsBAKZB' + 'z'.repeat(40);
    r = await anon.post('/api/setup/complete', {
      token,
      org,
      admin: { ...admin, email: 'director@beyootmisr.org' },
      integrations: { whatsapp: { token: waToken, phone_number_id: '109876543210987', waba_id: '' }, anthropic: { api_key: '' } },
    });
    const done = ok(r, 201);
    assert.equal(done.ok, true);
    assert.equal(done.user.role, 'admin');
    r = await anon.get('/api/auth/me');
    assert.equal(ok(r).user.username, 'director');

    const user = app.db.get("SELECT * FROM users WHERE username = 'director'");
    assert.equal(user.role, 'admin');
    assert.ok(verifyPassword(STRONG, user.password_hash));
    assert.equal(app.settings.get('org_address'), org.org_address);
    assert.equal(app.integrations.get('whatsapp').token, waToken);
    assert.equal(app.integrations.get('whatsapp').phone_number_id, '109876543210987');
    const setupRow = app.db.get('SELECT * FROM system_setup WHERE id = 1');
    assert.equal(setupRow.token_hash, null);
    assert.equal(setupRow.method, 'wizard');
    assert.equal(setupRow.completed_by, user.id);
    assert.ok(app.db.get("SELECT 1 FROM security_events WHERE type = 'system.setup_completed'"));
    assert.equal(app.system.isSetupMode(), false);

    // بعد الإتمام: 404 دائمًا، والرمز لا يعمل مرة ثانية
    r = await anon.get('/setup');
    assert.equal(r.status, 404);
    r = await anon.get('/api/setup/status');
    assert.equal(r.status, 404);
    r = await t.client().post('/api/setup/complete', { token, org, admin: { ...admin, username: 'second' } });
    assert.equal(r.status, 404);
    assert.equal(Number(app.db.value('SELECT COUNT(*) FROM users')), 1);
    r = await anon.get('/api/admin/cases');
    assert.equal(r.status, 200);
    r = await anon.get('/healthz');
    assert.equal(ok(r).status, 'ok');
    r = await t.client().get('/app');
    assert.equal(r.status, 200);
  } finally {
    await t.close();
  }
});

test('platform: setup token expiry; wrong guesses never lock the owner out (per-IP rate limit instead)', async () => {
  const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
  try {
    const { app } = t;
    const c = t.client();
    let { token } = app.system.beginSetup();
    app.db.run("UPDATE system_setup SET token_expires_at = '2000-01-01T00:00:00.000Z'");
    let r = await c.post('/api/setup/verify', { token });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /انتهت صلاحية/);

    ({ token } = app.system.beginSetup());
    r = await c.post('/api/setup/verify', { token: 'wrong-token-wrong-token' });
    assert.equal(r.status, 403);
    assert.ok(app.db.get("SELECT 1 FROM security_events WHERE type = 'system.setup_token_failed'"), 'early failures are audited');

    // سابقًا: 25 محاولة خاطئة من أي زائر مجهول كانت تُلغي الرمز وتعطّل الإعداد (حجب خدمة). الآن تبقى صالحة للمالك.
    app.db.run('UPDATE system_setup SET failed_attempts = 500');
    r = await c.post('/api/setup/verify', { token: 'wrong-token-wrong-token' });
    assert.equal(r.status, 403);
    assert.ok(app.db.value('SELECT token_hash FROM system_setup WHERE id = 1'), 'token is NOT invalidated by anonymous failures');
    assert.equal(Number(app.db.value('SELECT failed_attempts FROM system_setup WHERE id = 1')), 501);
    const audited = Number(app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'system.setup_token_failed'"));
    r = await c.post('/api/setup/verify', { token });
    assert.equal(ok(r).ok, true, 'owner can still verify after many failed guesses by others');

    // حد المعدل لكل عنوان IP: 20 محاولة كل 15 دقيقة ثم 429 (حتى للرمز الصحيح من نفس العنوان)
    let limited = null;
    for (let i = 0; i < 25 && !limited; i++) {
      r = await c.post('/api/setup/verify', { token: `guess-${i}-xxxxxxxxxxxxxxxx` });
      if (r.status === 429) limited = r;
    }
    assert.ok(limited, 'per-IP rate limit kicks in');
    assert.equal((await c.post('/api/setup/verify', { token })).status, 429);
    assert.ok(app.db.value('SELECT token_hash FROM system_setup WHERE id = 1'), 'rate limiting does not invalidate the token');
    // سجل الأمان لا يمتلئ بكل محاولة: بعد العاشرة تُسجل كل خمسين فقط
    assert.ok(Number(app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'system.setup_token_failed'")) - audited <= 1);
  } finally {
    await t.close();
  }
});

test('platform: env-var admin path still works and marks setup completed', async () => {
  const t = await startTestApp();
  try {
    assert.equal(t.app.system.isSetupMode(), false);
    const admin = await t.login('admin');
    assert.equal(admin.user.role, 'admin');
    assert.equal(t.app.db.value('SELECT method FROM system_setup WHERE id = 1'), 'env');
    const r = await t.client().get('/setup');
    assert.equal(r.status, 404);
  } finally {
    await t.close();
  }
});

// ───────────────────────── أمر استرداد مدير النظام ─────────────────────────
test('platform: admin CLI creates, resets (revoking sessions) and refuses weak passwords', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-cli-'));
  try {
    let r = runScript('admin.js', ['--username', 'director', '--password', 'Admin@2026'], { dataDir: dir });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /كلمة المرور مرفوضة/);

    r = runScript('admin.js', ['--password', STRONG], { dataDir: dir });
    assert.equal(r.status, 2);

    r = runScript('admin.js', ['--username', 'director', '--password', STRONG, '--name', 'هالة عبد الرحمن'], { dataDir: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /تم إنشاء حساب/);

    const dbFile = path.join(dir, 'platform.db');
    let db = new DatabaseSync(dbFile);
    const u = db.prepare("SELECT * FROM users WHERE username = 'director'").get();
    assert.equal(u.role, 'admin');
    assert.equal(u.name, 'هالة عبد الرحمن');
    assert.ok(verifyPassword(STRONG, u.password_hash));
    assert.equal(db.prepare('SELECT method FROM system_setup WHERE id = 1').get().method, 'cli');
    // جلسات مفتوحة + حساب موقوف + محامٍ بنفس منطق الأسماء
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('h1', ?, '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')").run(u.id);
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES ('h2', ?, '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')").run(u.id);
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(u.id);
    db.prepare("INSERT INTO users (role, username, name, password_hash, created_at) VALUES ('lawyer', 'lawyer1', 'محامٍ', 'x', '2026-01-01T00:00:00Z')").run();
    // رابط إعادة تعيين معلق (ربما أنشأه من استولى على حساب آخر) وتحقق بخطوتين مفعّل على هاتف مفقود
    db.prepare("INSERT INTO account_tokens (kind, token_hash, user_id, created_at, expires_at) VALUES ('reset', 'pending-reset-hash', ?, '2026-01-01T00:00:00Z', '2099-01-01T00:00:00Z')").run(u.id);
    db.prepare("INSERT INTO user_2fa (user_id, secret_enc, enabled_at, updated_at) VALUES (?, 'v1:x:y:z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')").run(u.id);
    db.close();

    const NEW = 'Cairo$Orphans-Rights9';
    r = runScript('admin.js', ['--username', 'director', '--password-stdin', '--reset-2fa'], { dataDir: dir, input: `${NEW}\n` });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /إعادة تعيين/);
    db = new DatabaseSync(dbFile);
    const u2 = db.prepare("SELECT * FROM users WHERE username = 'director'").get();
    assert.equal(u2.active, 1);
    assert.ok(verifyPassword(NEW, u2.password_hash));
    assert.ok(!verifyPassword(STRONG, u2.password_hash));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(u2.id).n, 0, 'sessions revoked');
    assert.ok(db.prepare("SELECT revoked_at FROM account_tokens WHERE token_hash = 'pending-reset-hash'").get().revoked_at, 'pending reset link revoked');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_2fa WHERE user_id = ?').get(u2.id).n, 0, '2FA cleared with --reset-2fa');
    assert.match(r.stdout, /أُلغي التحقق بخطوتين/);
    const ev = db.prepare("SELECT * FROM security_events WHERE type = 'system.admin_cli_reset'").get();
    assert.equal(ev.severity, 'critical');
    assert.equal(JSON.parse(ev.data).links_revoked, 1);
    db.close();

    r = runScript('admin.js', ['--username', 'lawyer1', '--password', NEW], { dataDir: dir });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /لا يمكن تحويله/);
    db = new DatabaseSync(dbFile);
    assert.equal(db.prepare("SELECT role FROM users WHERE username = 'lawyer1'").get().role, 'lawyer');
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ───────────────────────── التكاملات ─────────────────────────
test('platform: integrations API — admin only, secrets never returned, env source wins, test endpoint', async () => {
  const t = await startTestApp({ seed: 'demo' });
  try {
    const { app } = t;
    const admin = await t.login('admin');
    const manager = await t.login('manager');
    const lawyer = await t.login('ahmed');

    assert.equal((await t.client().get('/api/admin/integrations')).status, 401);
    assert.equal((await manager.get('/api/admin/integrations')).status, 403);
    assert.equal((await lawyer.get('/api/admin/integrations')).status, 403);
    assert.equal((await lawyer.put('/api/admin/integrations/whatsapp', { values: { phone_number_id: '123456' } })).status, 403);
    assert.equal((await manager.post('/api/admin/integrations/whatsapp/test')).status, 403);

    let data = ok(await admin.get('/api/admin/integrations'));
    assert.deepEqual(data.items.map((i) => i.name).sort(), ['anthropic', 'email', 'whatsapp']); // v10: +1 company e-mail integration (intended, SRV-13)
    assert.match(data.webhook_url, /\/webhooks\/whatsapp$/);
    assert.ok(['env', 'file', 'ephemeral'].includes(data.key_source));

    const secretToken = 'EAAGsecretTOKEN' + 'q'.repeat(50);
    const secretApp = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const secretKey = 'sk-ant-api03-' + 'K'.repeat(60);
    let r = await admin.put('/api/admin/integrations/whatsapp', { values: { token: secretToken, phone_number_id: '1098765432', app_secret: secretApp, verify_token: 'another-verify-token' } });
    const saved = ok(r);
    const tok = saved.fields.find((f) => f.key === 'token');
    assert.equal(tok.source, 'db');
    assert.equal(tok.value, null);
    assert.equal(tok.hint, `••••${secretToken.slice(-4)}`);
    // متغير البيئة يتقدم: رمز التحقق مضبوط في إعدادات الاختبار (verify-me)
    assert.equal(saved.fields.find((f) => f.key === 'verify_token').source, 'env');
    assert.ok(saved.warnings.some((w) => /WHATSAPP_VERIFY_TOKEN/.test(w)));
    assert.equal(app.integrations.get('whatsapp').verify_token, 'verify-me');
    assert.equal(app.integrations.get('whatsapp').token, secretToken);
    ok(await admin.put('/api/admin/integrations/anthropic', { values: { api_key: secretKey, monthly_budget_usd: '25' } }));

    data = ok(await admin.get('/api/admin/integrations'));
    const raw = JSON.stringify(data);
    for (const s of [secretToken, secretApp, secretKey, 'another-verify-token', 'verify-me']) assert.ok(!raw.includes(s), `secret leaked: ${s.slice(0, 12)}`);
    const wa = data.items.find((i) => i.name === 'whatsapp');
    assert.equal(wa.configured, true);
    assert.equal(wa.fields.find((f) => f.key === 'phone_number_id').value, '1098765432');
    assert.equal(wa.updated_by_name ? true : false, true);

    // التحقق من الصيغ وحقول غير معروفة وتكامل غير معروف
    r = await admin.put('/api/admin/integrations/whatsapp', { values: { phone_number_id: 'abc' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.fields.phone_number_id);
    r = await admin.put('/api/admin/integrations/anthropic', { values: { api_key: 'not-a-key' } });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/integrations/whatsapp', { values: { nope: '1' } });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/integrations/telegram', { values: { token: 'x' } });
    assert.equal(r.status, 404);

    // الحذف بقيمة فارغة
    r = await admin.put('/api/admin/integrations/whatsapp', { values: { phone_number_id: '' } });
    assert.equal(ok(r).fields.find((f) => f.key === 'phone_number_id').source, null);

    // سجل الأمان مع عنوان IP
    const ev = app.db.get("SELECT * FROM security_events WHERE type = 'integration.updated' ORDER BY id DESC LIMIT 1");
    assert.ok(ev && ev.ip, 'audit event carries request context');
    assert.ok(!String(ev.data).includes(secretToken));

    // اختبار الاتصال: 501 إن لم تتوفر الدالة، ثم نتيجة ناجحة/فاشلة مع حذف الحقول السرية من التفاصيل
    const origWa = app.whatsapp.test;
    const origAi = app.ai.test;
    try {
      app.whatsapp.test = undefined;
      r = await admin.post('/api/admin/integrations/whatsapp/test');
      assert.equal(r.status, 501);
      assert.match(r.body.error, /غير متاح/);

      app.whatsapp.test = async () => ({ ok: true, message: 'تم الاتصال برقم المؤسسة', details: { display_phone_number: '+20 121 111 4662', access_token: 'leak-me' } });
      r = await admin.post('/api/admin/integrations/whatsapp/test');
      const res = ok(r);
      assert.equal(res.ok, true);
      assert.equal(res.details.display_phone_number, '+20 121 111 4662');
      assert.ok(!JSON.stringify(res).includes('leak-me'));

      app.ai.test = async () => {
        throw new Error('401 invalid x-api-key');
      };
      r = await admin.post('/api/admin/integrations/anthropic/test');
      const bad = ok(r);
      assert.equal(bad.ok, false);
      assert.match(bad.message, /تعذر الاتصال/);

      data = ok(await admin.get('/api/admin/integrations'));
      assert.equal(data.items.find((i) => i.name === 'whatsapp').last_test.ok, true);
      assert.equal(data.items.find((i) => i.name === 'anthropic').last_test.ok, false);
      assert.ok(app.db.get("SELECT 1 FROM security_events WHERE type = 'integration.tested'"));
    } finally {
      app.whatsapp.test = origWa;
      app.ai.test = origAi;
    }
  } finally {
    await t.close();
  }
});

// ───────────────────────── النسخ الاحتياطي ─────────────────────────
test('platform: backups — manual, job, retention, download permissions and audit', async () => {
  const t = await startTestApp();
  try {
    const { app, dir } = t;
    const admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr2', name: 'منى', password: 'Manager@2026' }), 201);
    const manager = await t.login('mgr2', 'Manager@2026');

    assert.equal((await manager.post('/api/admin/system/backups')).status, 403);
    assert.equal((await manager.get('/api/admin/system/backups')).status, 403);

    const b = ok(await admin.post('/api/admin/system/backups'), 201);
    assert.match(b.file, BACKUP_FILE_RE);
    assert.equal(b.integrity, 'ok');
    assert.ok(fs.existsSync(path.join(dir, 'backups', b.file)));
    assert.ok(!fs.readdirSync(path.join(dir, 'backups')).some((f) => f.endsWith('.partial')));

    let list = ok(await admin.get('/api/admin/system/backups'));
    assert.equal(list.items[0].file, b.file);
    assert.equal(list.items[0].kind, 'manual');
    assert.equal(list.retention, 14);
    assert.equal(list.stale, false);

    // التنزيل: مدير النظام فقط، متدفق، ومسجل بدرجة «تحذير»
    assert.equal((await manager.download(`/api/admin/system/backups/${b.file}/download`)).status, 403);
    let r = await admin.download(`/api/admin/system/backups/${b.file}/download`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/vnd.sqlite3');
    assert.match(r.headers.get('content-disposition'), /attachment/);
    assert.equal(r.body.subarray(0, 15).toString('latin1'), 'SQLite format 3');
    const ev = app.db.get("SELECT * FROM security_events WHERE type = 'backup.downloaded' ORDER BY id DESC LIMIT 1");
    assert.equal(ev.severity, 'warning');
    r = await admin.download('/api/admin/system/backups/..%2Ftest.db/download');
    assert.equal(r.status, 404);
    r = await admin.download('/api/admin/system/backups/platform-20990101-0000.db/download');
    assert.equal(r.status, 404);

    // المهمة الدورية
    const jobRun = ok(await admin.post('/api/admin/system/jobs/backup/run'));
    assert.equal(jobRun.ok, true);
    assert.match(jobRun.result.file, BACKUP_FILE_RE);
    assert.equal(app.db.value('SELECT kind FROM system_backups WHERE file = ?', jobRun.result.file), 'auto');
    assert.equal((await admin.post('/api/admin/system/jobs/nope/run')).status, 404);

    // الاحتفاظ بآخر N
    assert.equal((await admin.put('/api/admin/system/backup-settings', { retention: 0 })).status, 400);
    ok(await admin.put('/api/admin/system/backup-settings', { retention: 2 }));
    for (let i = 0; i < 3; i++) app.system.backupNow({ kind: 'manual' });
    list = ok(await admin.get('/api/admin/system/backups'));
    assert.equal(list.items.length, 2);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => BACKUP_FILE_RE.test(f)).length, 2);
    assert.ok(Number(app.db.value("SELECT COUNT(*) FROM system_backups WHERE deleted_reason = 'retention'")) >= 3);

    // الإيقاف
    ok(await admin.put('/api/admin/system/backup-settings', { enabled: false }));
    const out = await app.jobs.runDue({ force: true, only: 'backup' });
    assert.deepEqual(out[0].result, { skipped: 'disabled' });

    // الحذف
    const victim = list.items[1].file;
    assert.equal((await manager.del(`/api/admin/system/backups/${victim}`)).status, 403);
    ok(await admin.del(`/api/admin/system/backups/${victim}`));
    assert.ok(!fs.existsSync(path.join(dir, 'backups', victim)));
  } finally {
    await t.close();
  }
});

// ───────────────────────── التصدير الكامل ─────────────────────────
test('platform: full .tar.gz export is valid (parse back, sha256 manifest, DB snapshot opens) and restores', async () => {
  const t = await startTestApp();
  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-restore-'));
  try {
    const { app, dir } = t;
    const admin = await t.login('admin');
    // مرفقات: مسار متداخل واسم عربي طويل (ترويسة PAX)
    const uploads = app.config.uploadsDir;
    fs.mkdirSync(path.join(uploads, '2026', '10'), { recursive: true });
    const f1 = Buffer.from('%PDF-1.4 test document\n');
    const longName = `${'إعلام-وراثة-'.repeat(10)}.pdf`;
    const f2 = crypto.randomBytes(70000);
    fs.writeFileSync(path.join(uploads, '2026', '10', 'a1.pdf'), f1);
    fs.writeFileSync(path.join(uploads, '2026', '10', longName), f2);

    const lawyerless = await t.client().download('/api/admin/system/export');
    assert.equal(lawyerless.status, 401);

    let r = await admin.download('/api/admin/system/export');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/gzip');
    assert.match(r.headers.get('content-disposition'), /beyoot-legal-export-\d{8}-\d{4}\.tar\.gz/);
    const archive = r.body;
    const entries = await readTarBuffer(zlib.gunzipSync(archive));
    const root = entries[0].name.split('/')[0];
    assert.match(root, /^beyoot-legal-export-/);
    const byRel = Object.fromEntries(entries.map((e) => [e.name.slice(root.length + 1), e]));
    assert.ok(byRel['README.txt']);
    assert.ok(byRel['data/platform.db']);
    assert.deepEqual(byRel['data/uploads/2026/10/a1.pdf'].data, f1);
    assert.deepEqual(byRel[`data/uploads/2026/10/${longName}`].data, f2);
    assert.equal(entries.at(-1).name, `${root}/manifest.json`);
    assert.ok(!byRel['data/.secret-key'], 'key excluded by default');

    const manifest = JSON.parse(byRel['manifest.json'].data.toString('utf8'));
    assert.equal(manifest.format, 'beyoot-legal-export');
    assert.equal(manifest.app_version, app.version);
    assert.equal(manifest.uploads.files, 2);
    assert.equal(manifest.secret_key, 'not_included');
    assert.equal(manifest.database.integrity, 'ok');
    for (const f of manifest.files) {
      const e = byRel[f.path];
      assert.ok(e, `manifest entry ${f.path} present`);
      assert.equal(e.data.length, f.size);
      assert.equal(sha(e.data), f.sha256);
    }

    // لقطة قاعدة البيانات تُفتح وتحتوي على المستخدمين
    const snap = path.join(dir, 'snap-check.db');
    fs.writeFileSync(snap, byRel['data/platform.db'].data);
    const d = new DatabaseSync(snap, { readOnly: true });
    assert.equal(d.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.ok(d.prepare("SELECT 1 FROM users WHERE username = 'admin'").get());
    d.close();
    assert.ok(app.db.get("SELECT 1 FROM security_events WHERE type = 'system.export' AND severity = 'warning'"));

    // مع مفتاح التشفير
    if (app.integrations.keySource === 'file') {
      r = await admin.download('/api/admin/system/export', { include_key: true });
      const withKey = await readTarBuffer(zlib.gunzipSync(r.body));
      assert.ok(withKey.some((e) => e.name.endsWith('/data/.secret-key')));
      assert.ok(app.db.get("SELECT 1 FROM security_events WHERE type = 'system.export' AND severity = 'critical'"));
      // مفاتيح تنبيهات الأجهزة (9.1) تُنقل مع المفاتيح فقط
      app.webPush?.publicKey?.();
      const vapidFile = path.join(app.config.dataDir, 'vapid.json');
      if (fs.existsSync(vapidFile)) {
        assert.ok(withKey.some((e) => e.name.endsWith('/data/vapid.json')) || (await readTarBuffer(zlib.gunzipSync((await admin.download('/api/admin/system/export', { include_key: true })).body))).some((e) => e.name.endsWith('/data/vapid.json')));
        assert.ok(!(await readTarBuffer(zlib.gunzipSync(archive))).some((e) => e.name.endsWith('/data/vapid.json')), 'vapid keys excluded by default');
      }
    }

    // الاستعادة على «خادم جديد» من الأرشيف
    const archivePath = path.join(restoreDir, 'export.tar.gz');
    fs.writeFileSync(archivePath, archive);
    let s = runScript('restore.js', [archivePath], { dataDir: path.join(restoreDir, 'data') });
    assert.equal(s.status, 1, 'preview only without --yes');
    assert.match(s.stdout, /معاينة/);
    s = runScript('restore.js', [archivePath, '--yes', '--force'], { dataDir: path.join(restoreDir, 'data') });
    assert.equal(s.status, 0, s.stderr + s.stdout);
    assert.deepEqual(fs.readFileSync(path.join(restoreDir, 'data', 'uploads', '2026', '10', longName)), f2);
    const restored = new DatabaseSync(path.join(restoreDir, 'data', 'platform.db'), { readOnly: true });
    assert.ok(restored.prepare("SELECT 1 FROM users WHERE username = 'admin'").get());
    assert.ok(restored.prepare("SELECT 1 FROM security_events WHERE type = 'system.restore'").get());
    restored.close();

    // أرشيف معدّل يُرفض (تجزئة لا تطابق)
    const tampered = Buffer.from(zlib.gunzipSync(archive));
    const idx = tampered.indexOf(Buffer.from('%PDF-1.4 test document'));
    tampered[idx + 2] = 0x58;
    fs.writeFileSync(path.join(restoreDir, 'bad.tar.gz'), zlib.gzipSync(tampered));
    s = runScript('restore.js', [path.join(restoreDir, 'bad.tar.gz'), '--yes', '--force'], { dataDir: path.join(restoreDir, 'data2') });
    assert.equal(s.status, 1);
    assert.match(s.stderr, /فشل التحقق/);

    // أرشيف أضيف إليه ملف غير مذكور في manifest.json (مثل مستند مزروع) يُرفض كاملًا
    const injected = entries.flatMap((e) =>
      e.name === `${root}/manifest.json`
        ? [{ name: `${root}/data/uploads/planted.pdf`, data: Buffer.from('%PDF planted') }, { name: e.name, data: e.data }]
        : [{ name: e.name, data: e.data }],
    );
    const parts = [];
    for await (const chunk of tarChunks(injected)) parts.push(chunk);
    fs.writeFileSync(path.join(restoreDir, 'extra.tar.gz'), zlib.gzipSync(Buffer.concat(parts)));
    s = runScript('restore.js', [path.join(restoreDir, 'extra.tar.gz'), '--yes', '--force'], { dataDir: path.join(restoreDir, 'data3') });
    assert.equal(s.status, 1, s.stdout);
    assert.match(s.stderr, /غير مذكورة في manifest/);
    assert.ok(!fs.existsSync(path.join(restoreDir, 'data3', 'platform.db')), 'nothing restored');

    // المصدر هو قاعدة البيانات الحالية نفسها: يُرفض قبل أي حذف
    s = runScript('restore.js', [path.join(restoreDir, 'data', 'platform.db'), '--yes', '--force'], { dataDir: path.join(restoreDir, 'data') });
    assert.equal(s.status, 1);
    assert.match(s.stderr, /قاعدة البيانات الحالية نفسها/);
    assert.ok(fs.existsSync(path.join(restoreDir, 'data', 'platform.db')), 'live database untouched');
  } finally {
    fs.rmSync(restoreDir, { recursive: true, force: true });
    await t.close();
  }
});

// ───────────────────────── صحة النظام ─────────────────────────
test('platform: system health endpoint (admin only) with readiness checks', async () => {
  const t = await startTestApp({ seed: 'demo' });
  try {
    const admin = await t.login('admin');
    const manager = await t.login('manager');
    const lawyer = await t.login('ahmed');
    assert.equal((await manager.get('/api/admin/system/health')).status, 403);
    assert.equal((await lawyer.get('/api/admin/system/health')).status, 403);

    const h = ok(await admin.get('/api/admin/system/health'));
    assert.equal(h.version, t.app.version);
    assert.equal(h.environment, 'demo');
    assert.match(h.node, /^v\d+/);
    assert.ok(h.uptime_seconds >= 0);
    assert.ok(h.db.size_bytes > 0);
    assert.ok(h.counts.find((c) => c.table === 'users').count >= 5);
    assert.ok(h.jobs.some((j) => j.name === 'backup'));
    assert.ok(typeof h.outbox.failed === 'number' && typeof h.outbox.queued === 'number');
    assert.ok(h.disk === null || h.disk.free_bytes > 0);
    assert.ok(Array.isArray(h.checks) && h.checks.length >= 4);
    assert.ok(h.checks.some((c) => c.key === 'environment' && c.level !== 'ok'), 'demo mode is flagged');
    assert.ok(h.checks.some((c) => c.key === 'whatsapp'));
    assert.ok(['env', 'file', 'ephemeral'].includes(h.integrations.key_source));
    // البيانات التجريبية تتضمن نسخة احتياطية حديثة — مأخوذة بعد اكتمال كل البيانات التجريبية (لا في منتصفها)
    assert.ok(h.backups.last, 'demo seed creates a backup');
    assert.equal(h.backups.stale, false);
    const demoSnap = new DatabaseSync(path.join(t.dir, 'backups', h.backups.last.file), { readOnly: true });
    try {
      const liveUsers = Number(t.app.db.value('SELECT COUNT(*) FROM users'));
      assert.equal(Number(demoSnap.prepare('SELECT COUNT(*) AS n FROM users').get().n), liveUsers, 'demo backup matches the fully seeded data');
      assert.equal(Number(demoSnap.prepare('SELECT COUNT(*) AS n FROM clients').get().n), Number(t.app.db.value('SELECT COUNT(*) FROM clients')));
    } finally {
      demoSnap.close();
    }
    assert.equal(t.app.db.value("SELECT last_error FROM job_runs WHERE name = 'backup'"), null);

    // جاهزية الإطلاق: حسابات «إدارة النظام» بلا تحقق بخطوتين (admin في البيانات التجريبية بلا تحقق، وheba به)
    const twoFa = h.checks.find((c) => c.key === 'admin_2fa');
    assert.ok(twoFa, 'admin 2FA readiness check present');
    const without = Number(
      t.app.db.value(
        "SELECT COUNT(*) FROM users u WHERE u.role = 'admin' AND u.active = 1 AND NOT EXISTS (SELECT 1 FROM user_2fa f WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL AND f.secret_enc IS NOT NULL)",
      ),
    );
    assert.equal(twoFa.level, without ? 'warning' : 'ok');
    if (without === 1) assert.match(twoFa.title, /^حساب واحد لـ«إدارة النظام»/);
    assert.ok(!h.checks.some((c) => c.key === 'admin_env'), 'not flagged outside production');
    const sessions = h.counts.find((c) => c.table === 'sessions');
    assert.equal(sessions.count, Number(t.app.db.value('SELECT COUNT(*) FROM sessions WHERE expires_at > ?', new Date().toISOString())), 'only active sessions counted');

    const meta = ok(await t.client().get('/api/meta'));
    assert.equal(meta.version, t.app.version);
    assert.ok(!meta.setup_required);
  } finally {
    await t.close();
  }
});

// ───────────────────────── تنبيهات الإنتاج والرابط العام على Render ─────────────────────────
test('platform: production readiness flags leftover ADMIN_PASSWORD; Render URL fallback for PUBLIC_BASE_URL', async () => {
  const t = await startTestApp({ config: { production: true } });
  try {
    const admin = await t.login('admin');
    const h = ok(await admin.get('/api/admin/system/health'));
    const envCheck = h.checks.find((c) => c.key === 'admin_env');
    assert.ok(envCheck && envCheck.level === 'warning', 'ADMIN_PASSWORD left in env is flagged in production');
    assert.equal(h.checks.find((c) => c.key === 'admin_2fa').level, 'warning');
    // تفاصيل البنود عربية الاتجاه ولا تحتوي على مسار ثابت خاطئ لمفتاح التشفير
    const key = h.checks.find((c) => c.key === 'key');
    if (t.app.integrations.keySource === 'file') assert.ok(key.detail.includes('.secret-key'));
  } finally {
    await t.close();
  }

  const saved = { p: process.env.PUBLIC_BASE_URL, r: process.env.RENDER_EXTERNAL_URL };
  try {
    delete process.env.PUBLIC_BASE_URL;
    process.env.RENDER_EXTERNAL_URL = 'https://beyoot-legal-x1y2.onrender.com/';
    let cfg = loadConfig();
    assert.equal(cfg.publicBaseUrl, 'https://beyoot-legal-x1y2.onrender.com');
    assert.equal(cfg.cookieSecure, true);
    process.env.PUBLIC_BASE_URL = 'https://legal.beyootmisr.org';
    cfg = loadConfig();
    assert.equal(cfg.publicBaseUrl, 'https://legal.beyootmisr.org', 'explicit PUBLIC_BASE_URL wins');
  } finally {
    if (saved.p === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = saved.p;
    if (saved.r === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = saved.r;
  }
});
