// إعادة إنشاء البيانات التجريبية: يحذف قاعدة البيانات والمرفقات والنسخ الاحتياطية المحلية ثم يعيد التهيئة.
// الاستخدام: npm run seed -- --yes
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/bootstrap.js';
import { restrictUmask } from '../src/secure-fs.js';

restrictUmask();

const config = loadConfig();
if (config.production && !process.argv.includes('--force')) {
  console.error('رفض التنفيذ: هذا الأمر يحذف كل البيانات ولا يُستخدم في وضع الإنتاج.');
  process.exit(1);
}
const backupsDir = path.join(config.dataDir, 'backups');
if (!process.argv.includes('--yes')) {
  console.error(`سيُحذف: ${config.dbPath} والمجلد ${config.uploadsDir} والمجلد ${backupsDir}\nأعد التشغيل مع --yes للتأكيد:  npm run seed -- --yes`);
  process.exit(1);
}
for (const f of [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]) fs.rmSync(f, { force: true });
fs.rmSync(config.uploadsDir, { recursive: true, force: true });
// نسخ البيانات التجريبية السابقة لم تعد مطابقة لأي قاعدة بيانات
fs.rmSync(backupsDir, { recursive: true, force: true });
const app = createApp({ ...config, demo: true, schedulerIntervalSeconds: 0 });
await bootstrap(app);
await app.close();
console.log('تمت إعادة إنشاء البيانات التجريبية بنجاح.');
