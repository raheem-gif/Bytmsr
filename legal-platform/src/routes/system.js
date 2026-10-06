// مسارات صحة النظام والنسخ الاحتياطي والتكاملات والإعداد الأول
// (الإصدار 9 — وحدة platform)
//
// الإعداد الأول (عام، يعمل في وضع الإعداد فقط ويعيد 404 بعده):
//   GET  /api/setup/status            بيانات المعالج (القيم الافتراضية، سياسة كلمة المرور، حقول التكاملات)
//   POST /api/setup/verify            { token } → التحقق من رمز الإعداد
//   POST /api/setup/complete          { token, org, admin, integrations } → إنشاء مدير النظام الأول وإنهاء وضع الإعداد
// مدير النظام فقط:
//   GET  /api/admin/system/health                 صحة النظام وقائمة جاهزية الإطلاق
//   POST /api/admin/system/jobs/:name/run         تشغيل مهمة دورية الآن
//   GET  /api/admin/system/backups                النسخ الاحتياطية وإعداداتها
//   POST /api/admin/system/backups                نسخة احتياطية الآن
//   PUT  /api/admin/system/backup-settings        { enabled, retention }
//   POST /api/admin/system/backups/:file/download رابط تنزيل نسخة لمرة واحدة ← GET /api/download?token=… (متدفق، مسجل في سجل الأمان)
//   DELETE /api/admin/system/backups/:file        حذف نسخة
//   POST /api/admin/system/export { include_key } رابط تنزيل لمرة واحدة ← GET /api/download?token=…
//                                                 تصدير كامل .tar.gz (قاعدة البيانات + المرفقات + manifest.json)
//   (التنزيلات الحساسة لا تُرسل لطلب GET بالكعكة وحدها — انظر src/services/downloads.js)
//   GET  /api/admin/integrations                  حالة التكاملات (الأسرار لا تُعاد أبدًا)
//   PUT  /api/admin/integrations/:name            { values: {...} } حفظ (القيمة "" تحذف المحفوظ)
//   POST /api/admin/integrations/:name/test       اختبار الاتصال (501 إن لم يتوفر بعد)
import { requireAdmin } from '../auth.js';

export function registerSystemRoutes(router, app) {
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const sys = () => app.system;

  // ===== الإعداد الأول =====
  router.get('/api/setup/status', (ctx) => sys().setupStatus(ctx));
  router.post('/api/setup/verify', (ctx) => sys().verifySetupToken(ctx.body.token, ctx));
  router.post('/api/setup/complete', (ctx) => {
    const out = sys().completeSetup(ctx.body, ctx);
    ctx.status = 201;
    return out;
  });

  // ===== صحة النظام =====
  router.get('/api/admin/system/health', A((ctx) => sys().health(ctx)));
  router.post('/api/admin/system/jobs/:name/run', A((ctx, u) => sys().runJob(String(ctx.params.name || '').slice(0, 100), u, ctx)));

  // ===== النسخ الاحتياطي =====
  router.get('/api/admin/system/backups', A(() => sys().backupsOverview()));
  router.post('/api/admin/system/backups', A((ctx, u) => {
    const out = sys().backupNow({ kind: 'manual', actor: u, ctx });
    ctx.status = 201;
    return out;
  }));
  router.put('/api/admin/system/backup-settings', A((ctx, u) => sys().saveBackupSettings(ctx.body, u, ctx)));
  app.downloads.route(router, '/api/admin/system/backups/:file/download', {
    guard: requireAdmin,
    // التحقق من الاسم ووجود الملف قبل إصدار الرابط (404 هنا لا عند التنزيل)
    prepare: (ctx) => ({ params: { file: sys().checkBackupFile(ctx.params.file) }, filename: ctx.params.file }),
    send: (ctx, u, p) => sys().sendBackup(ctx, p.file, u),
  });
  router.delete('/api/admin/system/backups/:file', A((ctx, u) => sys().deleteBackup(ctx.params.file, u, ctx)));
  app.downloads.route(router, '/api/admin/system/export', {
    guard: requireAdmin,
    prepare: (ctx) => {
      sys().checkExportAvailable();
      const includeKey = ctx.body.include_key === true || ctx.body.include_key === 1 || ctx.body.include_key === '1';
      return { params: { includeKey }, filename: 'beyoot-legal-export.tar.gz' };
    },
    send: (ctx, u, p) => sys().exportArchive(ctx, u, { includeKey: p.includeKey }),
  });

  // ===== التكاملات =====
  router.get('/api/admin/integrations', A((ctx) => sys().integrationsOverview(ctx)));
  router.put('/api/admin/integrations/:name', A((ctx, u) => sys().saveIntegration(ctx.params.name, ctx.body, u, ctx)));
  router.post('/api/admin/integrations/:name/test', A((ctx, u) => sys().testIntegration(ctx.params.name, u, ctx)));
}
