// مسارات الردود الجاهزة وبوابة العميل واستبيان الرضا وقوالب واتساب
// (الإصدار 9 — وحدة messaging)
import { requireUser, requireStaff, requireAdmin, requireLawyer } from '../auth.js';
import { idParam } from '../http.js';

export function registerMessagingRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  void S; void A; void id; void requireUser; void requireLawyer;
}
