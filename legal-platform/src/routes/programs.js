// مسارات البرامج والتمويل والمستندات المطبوعة
// (الإصدار 9 — وحدة programs)
//
// البرامج: العرض وربط الملفات للإدارة (مدير النظام ومديرو الحالات)، والإنشاء والتعديل والإغلاق والحذف لمدير النظام فقط.
// الطباعة: GET /api/print/:kind/:id يعيد بيانات المستند فقط وبنفس صلاحيات البيانات الأصلية (انظر services/programs.js).
import { requireUser, requireStaff, requireAdmin } from '../auth.js';
import { idParam } from '../http.js';
import { v } from '../util.js';
import { LABELS } from '../constants.js';

export function registerProgramsRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const P = () => app.programs;

  // ===== البرامج ومصادر التمويل =====
  // المسارات الثابتة قبل /:id حتى لا تُفسَّر «options» أو «case» كمعرف
  router.get('/api/programs', S((ctx) => P().list(ctx.query)));
  router.get('/api/programs/options', S(() => P().options()));
  // عتبات تنبيه الميزانية ونصوص الطباعة: يقرؤها ويعدلها مدير النظام (تحقق صارم من القيم هنا لا في الإعدادات العامة)
  router.get('/api/programs/settings', A(() => P().settings()));
  router.put('/api/programs/settings', A((ctx, u) => P().updateSettings(ctx.body || {}, u, ctx)));
  router.post('/api/programs', A((ctx, u) => {
    ctx.status = 201;
    return P().create(ctx.body, u, ctx);
  }));
  router.get('/api/programs/case/:id', S((ctx) => P().forCase(id(ctx))));
  router.put('/api/programs/case/:id', S((ctx, u) => P().setCaseProgram(id(ctx), ctx.body, u)));
  router.get('/api/programs/:id', S((ctx) => P().detail(id(ctx))));
  router.patch('/api/programs/:id', A((ctx, u) => P().update(id(ctx), ctx.body, u, ctx)));
  router.delete('/api/programs/:id', A((ctx, u) => P().remove(id(ctx), u, ctx)));
  router.post('/api/programs/:id/close', A((ctx, u) => P().close(id(ctx), ctx.body, u, ctx)));
  router.post('/api/programs/:id/reopen', A((ctx, u) => P().reopen(id(ctx), u, ctx)));
  router.post('/api/programs/:id/cases', S((ctx, u) => {
    const caseId = v.int(ctx.body.case_id, 'الملف', { required: true, min: 1 });
    const res = P().linkCase(caseId, id(ctx), u, { confirm: v.bool(ctx.body.confirm_ineligible), move: v.bool(ctx.body.move) });
    ctx.status = res.unchanged ? 200 : 201;
    return res;
  }));
  router.delete('/api/programs/:id/cases/:caseId', S((ctx, u) => P().unlinkCase(id(ctx, 'caseId'), u, { programId: id(ctx) })));

  // ===== المستندات المطبوعة =====
  router.get('/api/print/:kind/:id', (ctx) => {
    const u = requireUser(ctx);
    const doc = P().print(String(ctx.params.kind || ''), id(ctx), u, ctx.query, ctx);
    // طباعة نسخة ورقية من بيانات داخلية أو مالية تُسجَّل في سجل الأمان (من طبع ماذا ومتى)
    app.audit.log({
      actor: u,
      ctx,
      type: 'print.document',
      summary: `طباعة ${LABELS.print_kind[doc.kind] || doc.kind} رقم ${doc.number}`,
      data: { kind: doc.kind, id: id(ctx), number: doc.number },
    });
    return doc;
  });
}
