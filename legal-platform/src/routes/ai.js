// مسارات الذكاء الاصطناعي: الحالة والاستهلاك والتكلفة، اختبار الاتصال، الردود المقترحة، وتحليل المستندات
// (الإصدار 9 — وحدة ai). الصلاحيات تُفرض هنا في الخادم: الإدارة لكل شيء، والمحامي لتحليل المستندات المتاحة له فقط.
import { requireStaff, requireAdmin, requireLawyer, RateLimiter } from '../auth.js';
import { idParam } from '../http.js';

export function registerAiRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const L = (fn) => (ctx) => fn(ctx, requireLawyer(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  // حدود استخدام لكل مستخدم (حماية الرصيد من الإغراق؛ سقف الإنفاق الشهري يبقى خط الدفاع الأخير)
  const limits = {
    reply: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 120 }),
    document: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 }),
    test: new RateLimiter({ windowMs: 10 * 60 * 1000, max: 10 }),
  };

  // ===== الحالة والاستهلاك =====
  router.get('/api/admin/ai/status', S(() => app.ai.status()));
  router.get('/api/admin/ai/usage', S((ctx) => app.ai.usage({ period: ctx.query.period })));
  // طلب صغير حقيقي للتحقق من المفتاح والنموذج (مدير النظام فقط لأنه يستهلك رصيدًا)
  router.post('/api/admin/ai/test', A(async (ctx, u) => {
    limits.test.hit(`u:${u.id}`);
    return app.ai.test(u, ctx);
  }));

  // ===== الردود المقترحة =====
  router.post('/api/admin/ai/suggest-reply', S(async (ctx, u) => {
    limits.reply.hit(`u:${u.id}`);
    return app.ai.suggestReply(ctx.body, u);
  }));
  router.post('/api/admin/ai/suggestions/:id/feedback', S((ctx, u) => app.ai.replyFeedback(id(ctx), ctx.body, u)));

  // ===== تحليل المستندات (الإدارة) =====
  router.get('/api/admin/ai/documents', S((ctx) => app.ai.documentAnalyses(ctx.query)));
  router.get('/api/admin/ai/documents/:id', S((ctx, u) => app.ai.documentAnalysis(id(ctx), u)));
  router.post('/api/admin/ai/documents/:id/analyze', S(async (ctx, u) => {
    limits.document.hit(`u:${u.id}`);
    ctx.status = 201;
    return app.ai.analyzeDocument(id(ctx), u);
  }));

  // ===== تحليل المستندات (المحامي: المستندات المتاحة له فقط، وإلا 404) =====
  router.get('/api/lawyer/ai/documents/:id', L((ctx, u) => app.ai.documentAnalysis(id(ctx), u)));
  router.post('/api/lawyer/ai/documents/:id/analyze', L(async (ctx, u) => {
    limits.document.hit(`u:${u.id}`);
    ctx.status = 201;
    return app.ai.analyzeDocument(id(ctx), u);
  }));
}
