// إصلاحات الملاحظات منخفضة الخطورة (الإصدار 9): روابط التنزيل لمرة واحدة للملفات الحساسة، جدولة النسخ الاحتياطي بعد
// وضع الإعداد، صلاحيات ملفات البيانات، مخرجات أوامر سطر الأوامر، وصف جهاز «سطر أوامر الخادم»، عنوان الموعد في
// التقويم، صياغة الطباعة، «في اليوم نفسه» في تقرير الأثر، وصفحتا الطلب والمتابعة أثناء التجهيز.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok } from './lane-b-kit.test.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/bootstrap.js';
import { describeUserAgent } from '../src/auth.js';
import { arabicBytes } from '../src/util.js';
import { readTarBuffer } from '../src/services/system-tar.js';
import { BACKUP_FILE_RE } from '../src/services/system.js';
import { answerSubject } from '../public/assets/js/app/pages/print.js';
import { days } from '../public/assets/js/app/pages/admin/impact.js';
import { jobStatusInfo } from '../public/assets/js/app/pages/admin/system.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const STRONG = 'Nile#Delta-Garden7';
const mode = (f) => fs.statSync(f).mode & 0o777;
const posix = process.platform !== 'win32';

function runScript(script, args, { dataDir, input = '' } = {}) {
  const env = { ...process.env, DATA_DIR: dataDir, NODE_ENV: 'development', PORT: '9' };
  for (const k of ['DB_PATH', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'PUBLIC_BASE_URL', 'RENDER_EXTERNAL_URL', 'APP_SECRET']) delete env[k];
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env,
    input,
    encoding: 'utf8',
    timeout: 60000,
  });
}

// ═════════════════════════ 1) التنزيلات الحساسة: POST يصدر رابطًا لمرة واحدة ═════════════════════════
describe('Sensitive downloads need a one-time link minted by POST', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => t.close());

  const events = (type) => Number(t.app.db.value('SELECT COUNT(*) FROM security_events WHERE type = ?', type));

  test('a cross-site GET with the admin cookie no longer downloads anything or writes audit entries', async () => {
    const before = { data: events('data.exported'), export: events('system.export'), audit: events('audit.exported'), backup: events('backup.downloaded') };
    const backup = t.app.system.listBackups()[0];
    assert.ok(backup, 'the demo seed creates a backup');
    for (const url of [
      '/api/admin/data/export/clients',
      '/api/admin/system/export?include_key=1',
      '/api/admin/audit/export.csv',
      '/api/admin/impact/export',
      `/api/admin/system/backups/${backup.file}/download`,
    ]) {
      // ما يرسله المتصفح عند تنقل علوي من موقع آخر: GET بالكعكة (SameSite=Lax)، بلا رمز
      const r = await admin.get(url, { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' });
      assert.equal(r.status, 405, url);
      assert.equal(r.headers.get('content-disposition'), null, `${url} sends no file`);
    }
    // POST من موقع آخر يرفضه فحص Origin، وPOST بنموذج HTML (غير JSON) يرفضه فحص نوع المحتوى
    let r = await admin.post('/api/admin/data/export/clients', {}, { origin: 'http://evil.example' });
    assert.equal(r.status, 403);
    r = await admin.post('/api/admin/system/export', 'include_key=1', { 'content-type': 'application/x-www-form-urlencoded' });
    assert.equal(r.status, 415);
    // رابط التنزيل نفسه بلا رمز صالح
    for (const q of ['', '?token=', '?token=forged-token-value-1234567890']) {
      r = await admin.get(`/api/download${q}`);
      assert.equal(r.status, 403, q);
      assert.equal(r.body.code, 'download_link_invalid');
    }
    assert.deepEqual(
      { data: events('data.exported'), export: events('system.export'), audit: events('audit.exported'), backup: events('backup.downloaded') },
      before,
      'nothing exported, nothing logged in the admin’s name',
    );
  });

  test('the link works once, only for the same user and session, within 60 seconds', async () => {
    const tk = ok(await admin.post('/api/admin/data/export/clients'));
    assert.match(tk.url, /^\/api\/download\?token=[\w-]{20,}$/);
    assert.equal(tk.expires_in, 60);
    assert.equal(tk.filename, 'clients.csv');

    // بلا جلسة، أو من جلسة أخرى لنفس المستخدم: مرفوض ولا يستهلك الرابط
    assert.equal((await t.client().get(tk.url)).status, 403, 'anonymous');
    const otherSession = await t.login('admin');
    assert.equal((await otherSession.get(tk.url)).status, 403, 'another session of the same admin');
    const manager = await t.login('manager');
    assert.equal((await manager.get(tk.url)).status, 403, 'another user');

    const r = await admin.get(tk.url);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/csv/);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="beyoot-clients-/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(r.body.includes('صفة المستفيد'));
    // مرة واحدة فقط
    const again = await admin.get(tk.url);
    assert.equal(again.status, 403);
    assert.equal(again.body.code, 'download_link_invalid');

    // تنتهي صلاحيته بعد 60 ثانية
    const late = ok(await admin.post('/api/admin/data/export/lawyers'));
    freezeClock(new Date(Date.now() + 61 * 1000).toISOString());
    try {
      assert.equal((await admin.get(late.url)).status, 403, 'expired');
    } finally {
      resetClock();
    }
    assert.equal(t.app.downloads.pendingCount(), 0, 'used and expired links are gone');
  });

  test('permissions and validation happen before a link is issued; parameters are bound to the link', async () => {
    const manager = await t.login('manager');
    assert.equal((await manager.post('/api/admin/data/export/clients')).status, 403);
    assert.equal((await manager.post('/api/admin/system/export')).status, 403);
    assert.equal((await manager.post('/api/admin/audit/export.csv')).status, 403);
    assert.equal((await t.client().post('/api/admin/impact/export')).status, 401);
    assert.equal((await admin.post('/api/admin/data/export/passwords')).status, 404);
    assert.equal((await admin.post('/api/admin/system/backups/platform-20990101-0000.db/download')).status, 404);
    assert.equal((await admin.post('/api/admin/audit/export.csv', { from: 'not-a-date' })).status, 400);
    assert.equal((await admin.post('/api/admin/impact/export', { area: 'XXX' })).status, 400);

    // تقرير الأثر متاح لمدير الحالات (بيانات مجمعة)
    const impact = await manager.download('/api/admin/impact/export', { area: 'INH' });
    assert.equal(impact.status, 200);
    assert.ok(impact.body.includes('المجال القانوني'));

    // الفلاتر محفوظة مع الرابط: معاملات تضاف إلى رابط GET لا تغيّر شيئًا
    const tk = ok(await admin.post('/api/admin/audit/export.csv', { type: 'auth' }));
    const csv = await admin.get(`${tk.url}&type=system&severity=critical`);
    assert.equal(csv.status, 200);
    const ev = t.app.db.get("SELECT data FROM security_events WHERE type = 'audit.exported' ORDER BY id DESC LIMIT 1");
    assert.deepEqual(JSON.parse(ev.data).filters, { type: 'auth' });

    // التصدير الكامل: لا يُضاف مفتاح التشفير بتعديل رابط GET
    const ex = ok(await admin.post('/api/admin/system/export', { include_key: false }));
    const r = await admin.get(`${ex.url}&include_key=1`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/gzip');
    const entries = await readTarBuffer(zlib.gunzipSync(r.body));
    assert.ok(!entries.some((e) => e.name.endsWith('/data/.secret-key')), 'key not included');
    const manifest = JSON.parse(entries.at(-1).data.toString('utf8'));
    assert.notEqual(manifest.secret_key, 'included');
  });
});

// ═════════════════════════ 2) النسخ الاحتياطي بعد وضع الإعداد ═════════════════════════
describe('Backup job and first-run setup', () => {
  test('a skip during setup mode is not a run: the job stays due, and setup completion backs up at once', async () => {
    const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
    try {
      const { app } = t;
      assert.equal(app.system.isSetupMode(), true);
      let out = await app.jobs.runDue({ only: 'backup' });
      assert.deepEqual(out[0].result, { skipped: 'setup' });
      assert.equal(out[0].deferred, true);
      let row = app.db.get("SELECT * FROM job_runs WHERE name = 'backup'");
      assert.equal(row.last_started_at, null, 'schedule not advanced');
      assert.equal(row.last_ok_at, null, 'not counted as a success');
      assert.equal(Number(row.runs), 0);
      assert.deepEqual(JSON.parse(row.last_result), { skipped: 'setup' });
      // صحة النظام تعرضها «تُخطّي (وضع الإعداد)» لا «ناجح»
      assert.equal(jobStatusInfo({ ...row, last_result: JSON.parse(row.last_result) }).text, 'تُخطّي (وضع الإعداد)');
      // ما زالت مستحقة في الدورة التالية
      out = await app.jobs.runDue({ only: 'backup' });
      assert.equal(out.length, 1);

      // إتمام الإعداد من المعالج: نسخة احتياطية فورية تبدأ منها الدورة اليومية
      const { token } = app.system.beginSetup();
      const anon = t.client();
      const st = ok(await anon.get('/api/setup/status'));
      ok(await anon.post('/api/setup/complete', { token, org: st.defaults, admin: { name: 'هالة عبد الرحمن', username: 'director', password: STRONG, password_confirm: STRONG } }), 201);
      const backups = app.system.listBackups();
      assert.equal(backups.length, 1);
      assert.equal(backups[0].kind, 'auto');
      row = app.db.get("SELECT * FROM job_runs WHERE name = 'backup'");
      assert.ok(row.last_ok_at, 'counted as the first daily run');
      assert.equal(JSON.parse(row.last_result).file, backups[0].file);
      assert.equal(jobStatusInfo({ ...row, last_result: JSON.parse(row.last_result) }).text, 'ناجح');
      assert.deepEqual(await app.jobs.runDue({ only: 'backup' }), [], 'not due again right away');
    } finally {
      await t.close();
    }
  });

  test('an administrator created outside the wizard (command line) gets the backup on the next scheduler cycle', async () => {
    const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
    try {
      const { app } = t;
      await app.jobs.runDue({ only: 'backup' });
      // ما يفعله npm run admin في عملية أخرى
      app.db.insert('users', { role: 'admin', username: 'director', name: 'مدير النظام', password_hash: 'x', active: 1, created_at: new Date().toISOString() });
      const out = await app.jobs.runDue({ only: 'backup' });
      assert.equal(out.length, 1);
      assert.match(out[0].result.file, BACKUP_FILE_RE);
      assert.equal(Number(app.db.value("SELECT runs FROM job_runs WHERE name = 'backup'")), 1);
    } finally {
      await t.close();
    }
  });

  test('other skips (backups disabled) still count as a run and show as skipped, not successful', () => {
    const j = { last_started_at: '2026-10-06T10:00:00Z', last_finished_at: '2026-10-06T10:00:01Z', last_ok_at: '2026-10-06T10:00:01Z', last_result: { skipped: 'disabled' } };
    assert.equal(jobStatusInfo(j).text, 'تُخطّي (النسخ التلقائي متوقف)');
    assert.equal(jobStatusInfo({ ...j, last_result: { file: 'platform-20261006-1000.db' } }).text, 'ناجح');
    assert.equal(jobStatusInfo({ ...j, last_finished_at: null }).text, 'قيد التشغيل');
    assert.equal(jobStatusInfo({}).text, 'لم تُشغَّل بعد');
  });
});

// ═════════════════════════ 3) صلاحيات الملفات وأوامر سطر الأوامر ═════════════════════════
describe('Private file permissions and command-line output', () => {
  let base;
  let dataDir;
  before(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-lows-'));
    dataDir = path.join(base, 'data');
  });
  after(() => fs.rmSync(base, { recursive: true, force: true }));

  test('the data directory becomes 0700 and the database files 0600, even if created looser', { skip: !posix }, async () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.chmodSync(dataDir, 0o755);
    const dbPath = path.join(dataDir, 'platform.db');
    fs.writeFileSync(dbPath, '');
    fs.chmodSync(dbPath, 0o644);
    const cfg = loadConfig({
      dataDir,
      dbPath,
      uploadsDir: path.join(dataDir, 'uploads'),
      demo: false,
      adminUsername: 'admin',
      adminPassword: 'Admin@2026',
      schedulerIntervalSeconds: 0,
      silent: true,
      ai: { provider: 'heuristic', anthropicApiKey: '' },
    });
    const app = createApp(cfg);
    try {
      await bootstrap(app);
      assert.equal(mode(dataDir), 0o700);
      assert.equal(mode(dbPath), 0o600);
      if (fs.existsSync(`${dbPath}-wal`)) assert.equal(mode(`${dbPath}-wal`), 0o600);
      const b = app.system.backupNow({ kind: 'manual' });
      assert.equal(mode(path.join(dataDir, 'backups', b.file)), 0o600);
    } finally {
      await app.close();
    }
  });

  test('backup CLI prints a real size; its files are private', { skip: !posix }, () => {
    let s = runScript('backup.js', [], { dataDir });
    assert.equal(s.status, 0, s.stderr);
    assert.match(s.stdout, /\((\d+(\.\d)?) (بايت|كيلوبايت|ميجابايت)، فحص السلامة: سليمة\)/);
    assert.doesNotMatch(s.stdout, /\b0\.0+ ميجابايت/);
    const target = path.join(base, 'out', 'export.tar.gz');
    s = runScript('backup.js', ['--full', target], { dataDir });
    assert.equal(s.status, 0, s.stderr);
    assert.ok(s.stdout.includes(`(${arabicBytes(fs.statSync(target).size)})`), s.stdout);
    assert.doesNotMatch(s.stdout, /0\.0 ميجابايت/);
    assert.equal(mode(target), 0o600);
    for (const f of fs.readdirSync(path.join(dataDir, 'backups')).filter((n) => BACKUP_FILE_RE.test(n))) {
      assert.equal(mode(path.join(dataDir, 'backups', f)), 0o600, f);
    }
  });

  test('admin CLI never prints a guessed localhost URL; its audit entries read «سطر أوامر الخادم»', async () => {
    const s = runScript('admin.js', ['--username', 'director', '--password-stdin'], { dataDir, input: `${STRONG}\n` });
    assert.equal(s.status, 0, s.stderr);
    assert.doesNotMatch(s.stdout, /localhost/);
    assert.match(s.stdout, /المسار \/app/);
    assert.match(s.stdout, /PUBLIC_BASE_URL/);

    const cfg = loadConfig({ dataDir, dbPath: path.join(dataDir, 'platform.db'), uploadsDir: path.join(dataDir, 'uploads'), schedulerIntervalSeconds: 0, silent: true, demo: false });
    const app = createApp(cfg);
    try {
      const { csv } = app.accounts.auditCsv({ type: 'system.admin_cli_created' }, null, null);
      const line = csv.split('\r\n')[1];
      assert.ok(line.includes(',سطر أوامر الخادم,'), line);
      assert.ok(!csv.includes(',متصفح,'));
    } finally {
      await app.close();
    }
  });

  test('restore keeps the pre-restore copy and the restored database private (0600)', { skip: !posix }, () => {
    const backupsDir = path.join(dataDir, 'backups');
    const source = fs.readdirSync(backupsDir).filter((n) => BACKUP_FILE_RE.test(n)).sort()[0];
    const copy = path.join(base, 'source.db');
    fs.copyFileSync(path.join(backupsDir, source), copy);
    fs.chmodSync(copy, 0o644);
    const beforeFiles = new Set(fs.readdirSync(backupsDir));
    const s = runScript('restore.js', [copy, '--yes', '--force'], { dataDir });
    assert.equal(s.status, 0, s.stderr + s.stdout);
    const pre = fs.readdirSync(backupsDir).filter((n) => !beforeFiles.has(n) && BACKUP_FILE_RE.test(n));
    assert.equal(pre.length, 1, 'one pre-restore copy');
    assert.equal(mode(path.join(backupsDir, pre[0])), 0o600);
    assert.equal(mode(path.join(dataDir, 'platform.db')), 0o600);
    assert.equal(mode(dataDir), 0o700);
  });
});

// ═════════════════════════ 4) نصوص عربية ═════════════════════════
describe('Arabic wording fixes', () => {
  test('device descriptions: command line and unknown agents are not called «متصفح»', () => {
    assert.equal(describeUserAgent('cli (root)').label, 'سطر أوامر الخادم');
    assert.equal(describeUserAgent('cli').label, 'سطر أوامر الخادم');
    assert.equal(describeUserAgent('SomeAgent/1.0').label, 'غير معروف');
    assert.equal(describeUserAgent('').label, 'جهاز غير معروف');
    assert.equal(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36').label, 'Chrome على Windows');
    assert.equal(describeUserAgent('curl/8.5.0').label, 'برنامج آلي');
  });

  test('answer letter subject never repeats «بشأن»; the print status agrees with every document kind', () => {
    assert.equal(answerSubject('نزاع بشأن تركة تتضمن عقارًا وأرضًا وحقوق قاصرين'), 'إفادة قانونية — نزاع بشأن تركة تتضمن عقارًا وأرضًا وحقوق قاصرين');
    assert.equal(answerSubject('بشأن نفقة الأبناء'), 'إفادة قانونية — بشأن نفقة الأبناء');
    assert.equal(answerSubject('نفقة الأبناء'), 'إفادة قانونية بشأن نفقة الأبناء');
    assert.equal(answerSubject(''), 'إفادة قانونية');
    const src = read('public/assets/js/app/pages/print.js');
    assert.ok(!src.includes('} جاهز للطباعة'), 'no «${kind_label} جاهز» (wrong for «فاتورة» and «إفادة قانونية»)');
    assert.match(src, /المستند جاهز للطباعة: \$\{data\.kind_label\}/);
  });

  test('average time to an answer under one day reads «في اليوم نفسه», never «0 يوم»', () => {
    assert.equal(days(0), 'في اليوم نفسه');
    assert.equal(days(0.4), 'في اليوم نفسه');
    assert.equal(days(1), 'يوم واحد');
    assert.equal(days(2), 'يومان');
    assert.equal(days(3), '3 أيام');
    assert.equal(days(null), '—');
  });

  test('an event without its own title is «جلسة (MTR-…)» in the calendar feed, not «جلسة: جلسة»', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const m = t.app.db.get("SELECT id, code FROM matters WHERE status != 'closed' ORDER BY id LIMIT 1");
      const soon = new Date(Date.now() + 3 * 86400000).toISOString();
      ok(await admin.post(`/api/admin/matters/${m.id}/events`, { kind: 'hearing', starts_at: soon }), 200, 'event without title');
      ok(await admin.post(`/api/admin/matters/${m.id}/events`, { kind: 'meeting', title: 'مراجعة حافظة المستندات', starts_at: soon }), 200, 'event with title');
      const feed = ok(await admin.post('/api/calendar/feed'));
      const ics = (await t.client().get(new URL(feed.url).pathname)).body.replace(/\r\n /g, '');
      assert.ok(!ics.includes('جلسة: جلسة'), 'no «جلسة: جلسة…» even for titles that start with the kind');
      assert.ok(ics.includes(`SUMMARY:جلسة (${m.code})`), 'kind label once');
      assert.ok(ics.includes('SUMMARY:جلسة نظر جنحة التبديد'), 'a title that starts with the kind is used as is');
      assert.ok(ics.includes(`SUMMARY:اجتماع: مراجعة حافظة المستندات (${m.code})`), 'custom titles keep the kind prefix');
      // صفحة المتابعة: لا تكرر النوع في الشارة إذا كان العنوان هو اسم النوع
      const portal = read('public/assets/js/public/portal.js');
      // v9.1 b-portal (تغيير مقصود، B91-13): الموعد جملة واحدة «عندك جلسة يوم …» فيها النوع مرة واحدة، بلا عنوان داخلي ولا شارة
      assert.match(portal, /`عندك \$\{e\.kind_label \|\| 'موعد'\} يوم /);
      assert.ok(!/\be\.title\b/.test(portal), 'the internal event title never reaches the follow-up page');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 5) الموقع العام أثناء وضع الإعداد ═════════════════════════
describe('Public pages while the platform is being set up', () => {
  test('the intake and follow-up pages show «الموقع قيد التجهيز» instead of a form that cannot be received', async () => {
    const t = await startTestApp({ config: { adminUsername: '', adminPassword: '' } });
    try {
      const meta = ok(await t.client().get('/api/meta'));
      assert.equal(meta.setup_required, true, 'the pages learn about setup mode from /api/meta');
      assert.equal(meta.site.org_phone, '01211114662');
      for (const p of ['/intake', '/portal']) assert.equal((await t.client().get(p)).status, 200, p);
    } finally {
      await t.close();
    }
    for (const f of ['public/assets/js/public/intake.js', 'public/assets/js/public/portal-login.js']) {
      const src = read(f);
      assert.match(src, /if \(meta\.setup_required\) \{\s*preparingView\(\);/, f);
      assert.match(src, /'الموقع قيد التجهيز'/, f);
    }
  });

  test('the follow-up login page does not promise a WhatsApp code before knowing it is available', () => {
    const html = read('public/portal-login.html');
    // v9.1 b-portal (تغيير مقصود، B91-06): لا قسم hero؛ العنوان وحده («تابعي طلبك») والكروت تُبنى بعد معرفة توفّر الكود
    const hero = /<h1 id="page-title"[\s\S]*?<\/h1>/.exec(html)[0];
    assert.doesNotMatch(hero, /رمز|واتساب|كود/);
    assert.doesNotMatch(/<div id="portal-login-root"[\s\S]*?<\/div>/.exec(html)[0], /رمز|واتساب|كود/);
    assert.doesNotMatch(/<meta name="description"[^>]*>/.exec(html)[0], /واتساب/);
  });
});
