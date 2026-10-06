// مسارات الردود الجاهزة وبوابة العميل واستبيان الرضا وقوالب واتساب
// (الإصدار 9 — وحدة messaging)
import { requireStaff, requireAdmin } from '../auth.js';
import { idParam } from '../http.js';
import { notFound } from '../util.js';

export function registerMessagingRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const M = () => app.messaging;

  // ===== الردود الجاهزة (الإدارة) =====
  router.get('/api/admin/quick-replies', S((ctx) => M().listQuickReplies(ctx.query)));
  router.post('/api/admin/quick-replies', S((ctx, u) => {
    ctx.status = 201;
    return M().createQuickReply(ctx.body, u);
  }));
  router.patch('/api/admin/quick-replies/:id', S((ctx, u) => M().updateQuickReply(id(ctx), ctx.body, u)));
  router.delete('/api/admin/quick-replies/:id', S((ctx) => M().deleteQuickReply(id(ctx))));
  // إدراج رد في رسالة: يملأ المتغيرات من سياق الملف/الطلب ويزيد عداد الاستخدام
  router.post('/api/admin/quick-replies/:id/use', S((ctx) => M().useQuickReply(id(ctx), ctx.body)));

  // ===== قوالب واتساب =====
  router.get('/api/admin/whatsapp/templates', S(() => M().templatesOverview()));
  router.post('/api/admin/whatsapp/templates/sync', A(async (ctx, u) => M().syncTemplates(u, ctx)));
  router.put('/api/admin/whatsapp/template-mappings/:purpose', A((ctx, u) => M().setMapping(String(ctx.params.purpose), ctx.body, u, ctx)));
  router.delete('/api/admin/whatsapp/template-mappings/:purpose', A((ctx, u) => M().deleteMapping(String(ctx.params.purpose), u, ctx)));
  // اختبار الاتصال بواتساب (بيانات الرقم كما تراها ميتا)
  router.post('/api/admin/whatsapp/test', A(async () => app.whatsapp.test()));

  // ===== إرسال مستند للعميل =====
  router.post('/api/admin/documents/:id/send-to-client', S((ctx, u) => M().sendDocument(id(ctx), ctx.body, u, ctx)));

  // ===== استبيان الرضا =====
  router.get('/api/admin/surveys/summary', S((ctx) => M().surveySummary(ctx.query)));
  router.get('/api/admin/cases/:id/satisfaction', S((ctx) => M().caseSatisfaction(app.cases.require(id(ctx)).id)));

  // ===== دخول بوابة العملاء برمز واتساب (عام) =====
  router.post('/api/public/portal-login/request', (ctx) => M().requestPortalCode(ctx, ctx.body));
  router.post('/api/public/portal-login/verify', (ctx) => M().verifyPortalCode(ctx, ctx.body));

  // ===== تنزيل مستند من بوابة العميل =====
  router.get('/api/portal/:token/documents/:id', (ctx) => {
    const access = app.clients.portalAccess(ctx.params.token);
    if (!access) throw notFound('الرابط غير صالح أو انتهت صلاحيته. تواصل معنا لإرسال رابط جديد.');
    const doc = M().portalDocument(access.client, access.intakeId, id(ctx));
    if (!doc) throw notFound('المستند غير موجود');
    app.documents.send(ctx.res, doc, { inline: ctx.query.inline === '1' });
    ctx.streamed = true;
  });
}
