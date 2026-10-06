// مسارات الذكاء الاصطناعي: الردود المقترحة، تحليل المستندات، الاستهلاك والتكلفة
// (الإصدار 9 — وحدة ai)
import { requireUser, requireStaff, requireAdmin, requireLawyer } from '../auth.js';
import { idParam } from '../http.js';

export function registerAiRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  void S; void A; void id; void requireUser; void requireLawyer;
}
