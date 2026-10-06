// نقطة التشغيل: node server.js
import { loadConfig } from './src/config.js';
import { createApp } from './src/app.js';
import { bootstrap } from './src/bootstrap.js';

const config = loadConfig();
const app = createApp(config);

try {
  await bootstrap(app);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

app.server.listen(config.port, config.host, () => {
  const base = config.publicBaseUrl || `http://localhost:${config.port}`;
  console.log('');
  console.log('  منصة بيوت مصر للتشغيل القانوني تعمل الآن');
  console.log(`  • الموقع العام (للمواطنين):      ${base}/`);
  console.log(`  • نموذج الطلب على الموقع:        ${base}/intake`);
  console.log(`  • منصة الإدارة والمحامين:         ${base}/app`);
  console.log(`  • Webhook واتساب:                ${base}/webhooks/whatsapp`);
  console.log(`  • واتساب: ${app.whatsapp.configured ? 'متصل بـ WhatsApp Business Platform' : 'وضع المحاكاة (لم تُضبط بيانات الاعتماد)'}`);
  console.log(`  • الذكاء الاصطناعي: ${app.ai.status().label}`);
  if (config.demo) console.log('  • الوضع التجريبي مفعّل: حسابات الدخول التجريبية تظهر في صفحة الدخول.');
  if (!config.whatsapp.appSecret && (config.production || app.whatsapp.configured)) {
    console.warn('  ⚠ WHATSAPP_APP_SECRET غير مضبوط: سيرفض النظام كل رسائل Webhook واتساب حتى يُضبط سر التطبيق.');
  }
  console.log('');
  app.startScheduler();
});

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
