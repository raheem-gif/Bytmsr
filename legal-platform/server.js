// نقطة التشغيل: node server.js
// • يطبع روابط المنصة وحالة التكاملات عند البدء.
// • في «وضع الإعداد الأول» يطبع رابط /setup برمز عشوائي صالح لمرة واحدة.
// • إيقاف آمن عند SIGTERM/SIGINT (Docker / Render / systemd): يتوقف عن استقبال الطلبات ثم يغلق قاعدة البيانات.
import { loadConfig } from './src/config.js';
import { createApp } from './src/app.js';
import { bootstrap } from './src/bootstrap.js';
import { restrictUmask } from './src/secure-fs.js';

// الملفات التي تنشئها المنصة (قاعدة البيانات وWAL، المرفقات، النسخ الاحتياطية، مفتاح التشفير) لمالك العملية فقط
restrictUmask();

const config = loadConfig();
const app = createApp(config);

let boot;
try {
  boot = await bootstrap(app);
} catch (e) {
  console.error(`تعذر بدء المنصة: ${e.message}`);
  await app.close().catch(() => {});
  process.exit(1);
}

const KEY_LABEL = {
  env: 'من متغير البيئة APP_SECRET',
  file: 'ملف data/.secret-key (احفظه مع النسخ الاحتياطية)',
  ephemeral: 'مؤقت — ستضيع الأسرار المحفوظة عند إعادة التشغيل! اضبط APP_SECRET',
};
const SOURCE_LABEL = { env: 'متغيرات البيئة', db: 'لوحة الإدارة', default: 'افتراضي' };

function printSetupBanner(url, expiresAt) {
  const line = '═'.repeat(72);
  console.log('');
  console.log(`  ${line}`);
  console.log('  المنصة في «وضع الإعداد الأول»: لا يوجد حساب مدير نظام بعد.');
  console.log('  افتح الرابط التالي في المتصفح لإعداد ملف المؤسسة وحساب مدير النظام:');
  console.log('');
  console.log(`    ${url}`);
  console.log('');
  console.log(`  الرابط صالح لمرة واحدة حتى ${new Date(expiresAt).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })} (بتوقيت القاهرة).`);
  console.log('  لا تشاركه مع أحد. إعادة تشغيل الخادم تُصدر رابطًا جديدًا وتلغي القديم.');
  console.log('  First-run setup: open the URL above to create the first administrator.');
  console.log(`  ${line}`);
  console.log('');
}

app.server.listen(config.port, config.host, () => {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  console.log('');
  console.log(`  منصة بيوت مصر للتشغيل القانوني تعمل الآن — الإصدار ${app.version}`);
  console.log(`  • الموقع العام (للمواطنين):      ${base}/`);
  console.log(`  • نموذج الطلب على الموقع:        ${base}/intake`);
  console.log(`  • منصة الإدارة والمحامين:         ${base}/app`);
  console.log(`  • Webhook واتساب:                ${base}/webhooks/whatsapp`);
  console.log(`  • فحص الصحة:                     ${base}/healthz`);
  let s = null;
  try {
    s = app.system.startupSummary();
  } catch (e) {
    app.log('startup summary failed', e);
  }
  if (s) {
    console.log(`  • واتساب: ${s.whatsapp}${s.whatsapp_source ? ` (المصدر: ${SOURCE_LABEL[s.whatsapp_source] || s.whatsapp_source})` : ''}`);
    console.log(`  • الذكاء الاصطناعي: ${s.ai}${s.ai_source ? ` (المفتاح من: ${SOURCE_LABEL[s.ai_source] || s.ai_source})` : ''}`);
    console.log(`  • مفتاح تشفير الأسرار: ${s.key_source === 'file' && s.key_file ? `الملف ${s.key_file} (احفظه مع النسخ الاحتياطية)` : KEY_LABEL[s.key_source] || s.key_source}`);
    console.log(`  • النسخ الاحتياطي اليومي: ${s.backups ? 'مفعّل' : 'متوقف'}`);
    if (s.undecryptable) console.warn('  ⚠ تعذر فك تشفير أسرار تكاملات محفوظة (تغيّر مفتاح التشفير). أعد إدخالها من صفحة «التكاملات».');
    if (s.key_source === 'ephemeral') console.warn('  ⚠ مفتاح التشفير مؤقت: اضبط APP_SECRET (32 حرفًا على الأقل) حتى لا تضيع الأسرار المحفوظة.');
  } else {
    console.log(`  • واتساب: ${app.whatsapp.configured ? 'متصل بـ WhatsApp Business Platform' : 'وضع المحاكاة (لم تُضبط بيانات الاعتماد)'}`);
    console.log(`  • الذكاء الاصطناعي: ${app.ai.status().label}`);
  }
  if (config.demo) console.log('  • الوضع التجريبي مفعّل: حسابات الدخول التجريبية تظهر في صفحة الدخول.');
  if (config.demo && config.production) console.warn('  ⚠ الوضع التجريبي مفعّل في بيئة الإنتاج! اضبط DEMO=0 قبل الإطلاق.');
  if (!config.whatsapp.appSecret && (config.production || app.whatsapp.configured) && !(s && s.whatsapp_app_secret)) {
    console.warn('  ⚠ WHATSAPP_APP_SECRET غير مضبوط: سيرفض النظام كل رسائل Webhook واتساب حتى يُضبط سر التطبيق.');
  }
  for (const w of boot?.warnings || []) console.warn(`  ⚠ ${w}`);
  console.log('');
  if (boot?.setup_required) printSetupBanner(boot.setup_url, boot.setup_expires_at);
  app.startScheduler();
});

app.server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `المنفذ ${config.port} مستخدم بالفعل. أوقف العملية الأخرى أو غيّر PORT.` : `خطأ في خادم HTTP: ${e.message}`);
  process.exit(1);
});

// ── الإيقاف الآمن ──
let stopping = false;
async function shutdown(signal, code = 0) {
  if (stopping) {
    // إشارة ثانية أثناء الإيقاف: خروج فوري
    console.warn('  إيقاف فوري.');
    process.exit(code || 1);
  }
  stopping = true;
  console.log(`  تم استلام ${signal}: جارٍ إيقاف المنصة بأمان…`);
  const force = setTimeout(() => {
    console.error('  تجاوز الإيقاف 10 ثوانٍ؛ خروج إجباري.');
    process.exit(code || 1);
  }, 10000);
  force.unref();
  try {
    await app.close();
  } catch (e) {
    console.error('  خطأ أثناء الإيقاف:', e?.message || e);
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (e) => app.log('unhandledRejection', e));
process.on('uncaughtException', (e) => {
  app.log('uncaughtException', e);
  shutdown('uncaughtException', 1);
});
