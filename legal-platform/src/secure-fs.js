// صلاحيات ملفات البيانات خارج Docker أيضًا: مجلد البيانات 0700، وملفات قاعدة البيانات والنسخ 0600.
// قاعدة البيانات والمرفقات والنسخ الاحتياطية ومفتاح التشفير بيانات شخصية للمستفيدين: لا يقرؤها أي مستخدم آخر على الخادم.
import fs from 'node:fs';

/** قناع إنشاء الملفات لعمليات المنصة (الخادم وأوامر سطر الأوامر): الملفات الجديدة 0600 والمجلدات 0700 */
export const PRIVATE_UMASK = 0o077;

/** يضبط قناع الإنشاء للعملية الحالية (لا يعمل داخل Worker؛ يُتجاهل حينها) */
export function restrictUmask() {
  try {
    process.umask(PRIVATE_UMASK);
  } catch {
    // process.umask غير متاح في Worker threads
  }
}

/** chmod دون رمي خطأ (أنظمة ملفات بلا صلاحيات POSIX، أو ملف لا تملكه العملية) */
export function chmodQuiet(file, mode) {
  try {
    fs.chmodSync(file, mode);
    return true;
  } catch {
    return false;
  }
}

/** ينشئ مجلد البيانات إن لم يوجد ويقصر صلاحياته على مالكه (0700) */
export function secureDataDir(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    return;
  }
  chmodQuiet(dir, 0o700);
}

/** ملف قاعدة البيانات وملفات WAL/SHM المرافقة له: 0600 */
export function secureDbFiles(dbPath) {
  if (!dbPath || dbPath === ':memory:') return;
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
    if (fs.existsSync(f)) chmodQuiet(f, 0o600);
  }
}
