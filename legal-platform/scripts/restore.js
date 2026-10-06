// استعادة المنصة من نسخة احتياطية (.db) أو من تصدير كامل (.tar.gz) — يُشغَّل والخادم متوقف.
//
//   npm run restore -- data/backups/platform-20261006-0300.db            ← معاينة ما سيحدث فقط
//   npm run restore -- data/backups/platform-20261006-0300.db --yes      ← تنفيذ الاستعادة
//   npm run restore -- /tmp/beyoot-legal-export-20261006-1200.tar.gz --yes
//
// الخطوات: التحقق من سلامة المصدر (فحص SQLite + تجزئات manifest.json للتصدير الكامل) ← نسخة «قبل الاستعادة»
// من قاعدة البيانات الحالية في DATA_DIR/backups ← استبدال قاعدة البيانات (والمرفقات ومفتاح التشفير من التصدير الكامل،
// مع الاحتفاظ بالقديم بجوارها) ← تسجيل العملية في سجل الأمان.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.js';
import { parseTar } from '../src/services/system-tar.js';
import { quickCheck, fileStamp } from '../src/services/system.js';
import { arabicCount } from '../src/util.js';

const HELP = `استعادة المنصة — Restore

  npm run restore -- <ملف.db | ملف.tar.gz> [--yes] [--force]

  --yes     تنفيذ الاستعادة (بدونه تُعرض المعاينة فقط)
  --force   التنفيذ حتى لو بدا أن الخادم يعمل (غير مستحسن)
أوقف الخادم أولًا: docker compose stop app  أو  systemctl stop beyoot-legal
`;

function fail(msg, code = 1) {
  console.error(`خطأ: ${msg}`);
  process.exit(code);
}

let parsed;
try {
  parsed = parseArgs({
    options: { yes: { type: 'boolean', default: false }, force: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } },
    allowPositionals: true,
  });
} catch (e) {
  console.error(HELP);
  fail(e.message, 2);
}
const { values: args, positionals } = parsed;
if (args.help || !positionals.length) {
  console.log(HELP);
  process.exit(args.help ? 0 : 2);
}
const source = path.resolve(positionals[0]);
if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`الملف غير موجود: ${source}`);

const config = loadConfig();
if (config.dbPath === ':memory:') fail('قاعدة البيانات مضبوطة في الذاكرة؛ لا يوجد ما يُستعاد إليه.');
// الاستعادة من ملف قاعدة البيانات الحالية نفسه تحذفه قبل نسخه
if (path.resolve(config.dbPath) === source || [`${config.dbPath}-wal`, `${config.dbPath}-shm`].map((f) => path.resolve(f)).includes(source)) {
  fail('المصدر هو قاعدة البيانات الحالية نفسها. اختر ملف نسخة احتياطية من مجلد backups أو أرشيف تصدير كامل.');
}
const dataDir = config.dataDir || path.dirname(config.dbPath);
const backupsDir = path.join(dataDir, 'backups');
const stamp = fileStamp();

// ── هل الخادم يعمل؟ ──
async function serverRunning() {
  try {
    const r = await fetch(`http://127.0.0.1:${config.port}/healthz`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
if (!args.force && (await serverRunning())) {
  fail(`يبدو أن المنصة تعمل الآن على المنفذ ${config.port}. أوقف الخادم أولًا ثم أعد الأمر (أو استخدم --force على مسؤوليتك).`);
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function dbSummary(file) {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    const count = (t) => {
      try {
        return Number(Object.values(d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get())[0]);
      } catch {
        return null;
      }
    };
    return { users: count('users'), clients: count('clients'), cases: count('cases'), intakes: count('intakes'), documents: count('documents') };
  } finally {
    d.close();
  }
}

// ── 1) تجهيز المصدر والتحقق منه ──
const isArchive = /\.(tar\.gz|tgz)$/i.test(source);
let staged = null; // { dir, db, uploads, key, manifest }
let restoreDb = source;

if (isArchive) {
  const dir = path.join(dataDir, `.restore-${stamp}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const hashes = {};
  let manifest = null;
  try {
    const stream = fs.createReadStream(source).pipe(zlib.createGunzip());
    for await (const e of parseTar(stream)) {
      const rel = e.name.split('/').slice(1).join('/'); // حذف المجلد الجذري beyoot-legal-export-…
      if (e.type === '5' || !rel) continue;
      if (e.type !== '0') continue;
      const parts = rel.split('/');
      if (parts.includes('..') || parts.some((p) => p === '' || p === '.')) throw new Error(`مسار غير آمن داخل الأرشيف: ${e.name}`);
      const allowed = rel === 'manifest.json' || rel === 'README.txt' || rel === 'data/platform.db' || rel === 'data/.secret-key' || rel.startsWith('data/uploads/');
      if (!allowed) throw new Error(`ملف غير متوقع داخل الأرشيف: ${rel}`);
      if (rel === 'manifest.json' || rel === 'README.txt') {
        const chunks = [];
        for await (const c of e.body) chunks.push(c);
        if (rel === 'manifest.json') manifest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        continue;
      }
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const h = crypto.createHash('sha256');
      const fd = fs.openSync(target, 'w', 0o600);
      try {
        for await (const c of e.body) {
          h.update(c);
          fs.writeSync(fd, c);
        }
      } finally {
        fs.closeSync(fd);
      }
      hashes[rel] = { sha256: h.digest('hex'), size: fs.statSync(target).size };
    }
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    fail(`تعذر قراءة الأرشيف: ${e.message}`);
  }
  if (!manifest || manifest.format !== 'beyoot-legal-export') {
    fs.rmSync(dir, { recursive: true, force: true });
    fail('الأرشيف لا يحتوي على manifest.json صالح لتصدير منصة بيوت مصر.');
  }
  for (const f of manifest.files || []) {
    const got = hashes[f.path];
    if (!got || got.sha256 !== f.sha256 || got.size !== f.size) {
      fs.rmSync(dir, { recursive: true, force: true });
      fail(`فشل التحقق من سلامة الملف ${f.path} (التجزئة أو الحجم لا يطابق manifest.json). الأرشيف تالف أو معدّل.`);
    }
  }
  // كل ملف مستخرج يجب أن يكون مذكورًا في manifest.json (لا تُقبل ملفات أضيفت إلى الأرشيف بعد إنشائه)
  const listed = new Set((manifest.files || []).map((f) => f.path));
  const extra = Object.keys(hashes).filter((rel) => !listed.has(rel));
  if (extra.length) {
    fs.rmSync(dir, { recursive: true, force: true });
    fail(`الأرشيف يحتوي على ملفات غير مذكورة في manifest.json (مثل ${extra[0]}). الأرشيف معدّل؛ لم تُنفذ الاستعادة.`);
  }
  if (!hashes['data/platform.db']) {
    fs.rmSync(dir, { recursive: true, force: true });
    fail('الأرشيف لا يحتوي على قاعدة البيانات data/platform.db');
  }
  staged = {
    dir,
    db: path.join(dir, 'data/platform.db'),
    uploads: fs.existsSync(path.join(dir, 'data/uploads')) ? path.join(dir, 'data/uploads') : null,
    key: hashes['data/.secret-key'] ? path.join(dir, 'data/.secret-key') : null,
    manifest,
  };
  restoreDb = staged.db;
}

const integrity = quickCheck(restoreDb);
if (integrity !== 'ok') {
  if (staged) fs.rmSync(staged.dir, { recursive: true, force: true });
  fail(`فحص سلامة قاعدة البيانات المصدر فشل: ${integrity}`);
}
const summary = dbSummary(restoreDb);
if (!summary.users) {
  if (staged) fs.rmSync(staged.dir, { recursive: true, force: true });
  fail('قاعدة البيانات المصدر لا تحتوي على أي مستخدمين؛ لا تبدو نسخة صالحة من المنصة.');
}

console.log('');
console.log(`المصدر: ${source}`);
console.log(`النوع: ${isArchive ? 'تصدير كامل (قاعدة البيانات + المرفقات)' : 'نسخة احتياطية لقاعدة البيانات فقط'}`);
if (staged?.manifest) {
  console.log(`أُنشئ: ${staged.manifest.created_at} — إصدار المنصة ${staged.manifest.app_version}${staged.manifest.org_name ? ` — ${staged.manifest.org_name}` : ''}`);
  const n = Number(staged.manifest.uploads?.files) || 0;
  console.log(`المرفقات: ${n ? arabicCount(n, ['ملف واحد', 'ملفان', 'ملفات', 'ملفًا']) : 'لا توجد'} — مفتاح التشفير: ${staged.key ? 'مضمّن' : 'غير مضمّن'}`);
}
console.log(`فحص السلامة: سليمة — المستخدمون ${summary.users}، المستفيدون ${summary.clients ?? '—'}، ملفات الاستشارات ${summary.cases ?? '—'}، المستندات ${summary.documents ?? '—'}`);
console.log(`الهدف: ${config.dbPath}${isArchive ? ` و ${config.uploadsDir}` : ''}`);
console.log('');

if (!args.yes) {
  if (staged) fs.rmSync(staged.dir, { recursive: true, force: true });
  console.log('هذه معاينة فقط. لتنفيذ الاستعادة أعد الأمر مع --yes (ستُحفظ نسخة من البيانات الحالية قبل الاستبدال).');
  process.exit(1);
}

// ── 2) نسخة «قبل الاستعادة» من قاعدة البيانات الحالية ──
let preRestore = null;
if (fs.existsSync(config.dbPath)) {
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
  let file = `platform-${stamp}.db`;
  for (let i = 2; fs.existsSync(path.join(backupsDir, file)); i++) file = `platform-${stamp}-${i}.db`;
  const cur = new DatabaseSync(config.dbPath);
  try {
    cur.prepare('VACUUM INTO ?').run(path.join(backupsDir, file));
  } finally {
    cur.close();
  }
  preRestore = { file, size: fs.statSync(path.join(backupsDir, file)).size, integrity: quickCheck(path.join(backupsDir, file)) };
  console.log(`حُفظت نسخة من البيانات الحالية قبل الاستعادة: ${path.join(backupsDir, file)}`);
}

// ── 3) الاستبدال ──
for (const f of [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]) fs.rmSync(f, { force: true });
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.copyFileSync(restoreDb, config.dbPath);
try {
  fs.chmodSync(config.dbPath, 0o600);
} catch {
  // نظام ملفات بلا صلاحيات
}

let uploadsMoved = null;
let keyMoved = null;
if (staged) {
  if (staged.uploads) {
    if (fs.existsSync(config.uploadsDir) && fs.readdirSync(config.uploadsDir).length) {
      uploadsMoved = `${config.uploadsDir}.before-restore-${stamp}`;
      fs.renameSync(config.uploadsDir, uploadsMoved);
    } else fs.rmSync(config.uploadsDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(config.uploadsDir), { recursive: true });
    fs.renameSync(staged.uploads, config.uploadsDir);
  }
  if (staged.key) {
    const keyFile = path.join(dataDir, '.secret-key');
    if (fs.existsSync(keyFile) && sha256File(keyFile) !== sha256File(staged.key)) {
      keyMoved = `${keyFile}.before-restore-${stamp}`;
      fs.renameSync(keyFile, keyMoved);
    }
    fs.copyFileSync(staged.key, keyFile);
    fs.chmodSync(keyFile, 0o600);
  }
  fs.rmSync(staged.dir, { recursive: true, force: true });
}

// ── 4) سجل الأمان وسجل النسخ داخل قاعدة البيانات المستعادة ──
try {
  const d = new DatabaseSync(config.dbPath);
  try {
    const now = new Date().toISOString();
    const hasTable = (t) => !!d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
    if (preRestore && hasTable('system_backups')) {
      d.prepare(
        `INSERT INTO system_backups (file, kind, size_bytes, integrity, created_at) VALUES (?, 'pre_restore', ?, ?, ?)
         ON CONFLICT(file) DO UPDATE SET kind = 'pre_restore', deleted_at = NULL`,
      ).run(preRestore.file, preRestore.size, preRestore.integrity, now);
    }
    if (hasTable('security_events')) {
      d.prepare(
        `INSERT INTO security_events (type, severity, actor_name, user_agent, summary, data, created_at) VALUES ('system.restore', 'critical', ?, ?, ?, ?, ?)`,
      ).run(
        'سطر أوامر الخادم',
        `cli (${process.env.USER || process.env.USERNAME || 'unknown'})`,
        `استعادة المنصة من ${path.basename(source)}`,
        JSON.stringify({ source: path.basename(source), archive: isArchive, pre_restore: preRestore?.file || null, uploads_replaced: !!staged?.uploads, key_replaced: !!staged?.key }),
        now,
      );
    }
  } finally {
    d.close();
  }
} catch (e) {
  console.warn(`تنبيه: تمت الاستعادة لكن تعذر التسجيل في سجل الأمان: ${e.message}`);
}

console.log('');
console.log('تمت الاستعادة بنجاح.');
if (uploadsMoved) console.log(`المرفقات السابقة نُقلت إلى: ${uploadsMoved} (احذفها بعد التأكد).`);
if (keyMoved) console.log(`مفتاح التشفير السابق نُقل إلى: ${keyMoved}`);
if (!isArchive) console.log('ملاحظة: نسخة قاعدة البيانات لا تتضمن المرفقات؛ بقي مجلد المرفقات الحالي كما هو.');
if (staged && !staged.key && staged.manifest?.secret_key === 'not_included') {
  console.log('ملاحظة: مفتاح التشفير لم يكن ضمن الأرشيف؛ إن اختلف عن مفتاح هذا الخادم فأعد إدخال أسرار التكاملات من صفحة «التكاملات».');
}
if (staged?.manifest?.secret_key === 'env') console.log('ملاحظة: الخادم الأصلي يستخدم APP_SECRET؛ اضبط القيمة نفسها هنا حتى تبقى أسرار التكاملات صالحة.');
console.log('شغّل الخادم الآن (npm start أو docker compose up -d) وتحقق من صفحة «صحة النظام».');
