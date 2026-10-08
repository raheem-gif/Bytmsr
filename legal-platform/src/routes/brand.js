// الإصدار 9.2 — «ألوان المؤسسة»: مسارات الإدارة (مدير النظام وحده؛ JSON مع فحص CSRF العام كبقية مسارات الإدارة).
// كل تعديل يُسجَّل في سجل الأمان (brand.colors_updated / brand.colors_reset). لا رفع ملفات: اقتراح الألوان من صورة
// الشعار يحدث على جهاز المدير وحده.
import { requireAdmin } from '../auth.js';

export function registerBrandRoutes(router, app) {
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  router.get('/api/admin/brand', A(() => app.brand.payload()));
  router.put('/api/admin/brand/colors', A((ctx, u) => app.brand.setColors(ctx.body, u, ctx)));
  router.delete('/api/admin/brand/colors', A((ctx, u) => app.brand.resetColors(u, ctx)));
}
