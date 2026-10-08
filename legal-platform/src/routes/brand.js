// الإصدار 9.2 — «ألوان المؤسسة»: مسارات الإدارة (مدير النظام وحده؛ JSON مع فحص CSRF العام كبقية مسارات الإدارة).
// كل تعديل يُسجَّل في سجل الأمان (brand.colors_updated / brand.colors_reset). لا رفع ملفات: اقتراح الألوان من صورة
// الشعار يحدث على جهاز المدير وحده.
import { requireAdmin } from '../auth.js';

export function registerBrandRoutes(router, app) {
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  // v9.2 (بوابة G2): ألوان المؤسسة الحالية في /api/meta (لا شيء للألوان الأصلية: meta كما في 9.1 حرفيًا). تتغير بها
  // نسخة meta (ETag)، فتجلبها المنصة عند الفتح وتقارنها بكتلة الألوان في صفحة /app المخزنة (app/theme-sync.js).
  // v10 experience (§4.1): brand يحمل دائمًا اسم المكتب { name, short, staff_chrome:{name, short} } (L-03)، وتُضاف إليه
  // { v, css, theme_color } للألوان المخصصة وحدها (كما في 9.2: لا كتلة ألوان للافتراضية).
  app.metaProviders?.push(() => {
    const brand = {};
    try {
      brand.name = app.brand.displayName();
      brand.short = app.brand.shortName();
      brand.staff_chrome = app.brand.staffChromeName();
    } catch {
      /* بلا اسم: الواجهة تعود لاسم المؤسسة */
    }
    try {
      const t = app.brand.theme();
      if (!t.legacy && t.css) Object.assign(brand, { v: t.v, css: t.css, theme_color: t.primary[700] });
    } catch {
      /* الألوان الأصلية */
    }
    return Object.keys(brand).length ? { brand } : {};
  });
  router.get('/api/admin/brand', A(() => app.brand.payload()));
  router.put('/api/admin/brand/colors', A((ctx, u) => app.brand.setColors(ctx.body, u, ctx)));
  router.delete('/api/admin/brand/colors', A((ctx, u) => app.brand.resetColors(u, ctx)));
}
