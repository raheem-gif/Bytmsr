// نسخة احتياطية من سطر الأوامر (للجدولة من خارج المنصة أو قبل التحديث). يعمل والخادم يعمل.
//
//   npm run backup                                  ← نسخة قاعدة البيانات في DATA_DIR/backups (مع فحص السلامة والاحتفاظ بآخر N)
//   npm run backup -- --full /path/export.tar.gz    ← تصدير كامل (قاعدة البيانات + المرفقات + manifest.json)
//   npm run backup -- --full /path/export.tar.gz --include-key   ← مع مفتاح التشفير data/.secret-key
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

let args;
try {
  args = parseArgs({
    options: {
      full: { type: 'string' },
      'include-key': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
} catch (e) {
  console.error(`خيار غير معروف: ${e.message}`);
  process.exit(2);
}
if (args.help) {
  console.log('الاستخدام: npm run backup [-- --full <ملف.tar.gz> [--include-key]]');
  process.exit(0);
}

const config = loadConfig();
if (!fs.existsSync(config.dbPath)) {
  console.error(`لا توجد قاعدة بيانات في ${config.dbPath}`);
  process.exit(1);
}
const app = createApp({ ...config, schedulerIntervalSeconds: 0, silent: true });
const actor = { id: null, name: 'سطر أوامر الخادم', username: 'cli' };
try {
  if (args.full) {
    const target = path.resolve(args.full);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const out = fs.createWriteStream(target, { mode: 0o600 });
    // واجهة رد HTTP مبسطة فوق ملف (exportArchive يضبط الترويسات ثم يبث الأرشيف)
    out.setHeader = () => {};
    out.statusCode = 200;
    await app.system.exportArchive({ res: out, ip: null, req: { headers: { 'user-agent': 'cli' } } }, actor, { includeKey: args['include-key'] });
    console.log(`تم إنشاء التصدير الكامل: ${target} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} ميجابايت)`);
    console.log('تحذير: الملف يحتوي على بيانات المستفيدين. احفظه مشفرًا خارج الخادم.');
  } else {
    const b = app.system.backupNow({ kind: 'manual', actor: null });
    console.log(`تم إنشاء النسخة الاحتياطية: ${path.join(app.system.backupsDir, b.file)} (${(b.size_bytes / 1024 / 1024).toFixed(2)} ميجابايت، فحص السلامة: ${b.integrity})`);
    if (b.pruned.length) console.log(`حُذفت نسخ أقدم حسب سياسة الاحتفاظ: ${b.pruned.join('، ')}`);
  }
} catch (e) {
  console.error(`فشل النسخ الاحتياطي: ${e.message}`);
  process.exitCode = 1;
} finally {
  await app.close();
}
