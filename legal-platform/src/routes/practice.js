// مسارات بطاقة المستفيد والأثر وتعارض المصالح والتقويم والاستيراد والتصدير
// (الإصدار 9 — وحدة practice)
import { requireUser, requireStaff, requireAdmin, requireLawyer } from '../auth.js';
import { idParam } from '../http.js';
import { notFound, v } from '../util.js';
import { RateLimiter } from '../auth.js';

/** إرسال ملف نصي للتنزيل (CSV) بترويسات آمنة */
function sendDownload(ctx, { filename, body, type = 'text/csv; charset=utf-8' }) {
  const res = ctx.res;
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
  ctx.streamed = true;
}

/** قيم نصية فقط من جسم الطلب للمفاتيح المسموحة (فلاتر التصدير) */
function stringFilters(body, keys) {
  const out = {};
  for (const k of keys) {
    const val = body?.[k];
    if (typeof val === 'string' && val.trim()) out[k] = val.trim().slice(0, 100);
  }
  return out;
}

export function registerPracticeRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const L = (fn) => (ctx) => fn(ctx, requireLawyer(ctx));
  const U = (fn) => (ctx) => fn(ctx, requireUser(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const P = () => app.practice;
  // روابط التقويم عامة (بلا جلسة): حد لكل عنوان IP يمنع التخمين والإغراق
  const feedLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 240 });
  const IMPORT_LIMIT = { limit: 4 * 1024 * 1024 };

  // ===== 1) بطاقة المستفيد (الإدارة فقط) =====
  router.get('/api/admin/clients/:id/beneficiary', S((ctx) => P().beneficiary.view(id(ctx), { intakeId: ctx.query.intake_id ? v.int(ctx.query.intake_id, 'الطلب', { min: 1 }) : null })));
  router.put('/api/admin/clients/:id/beneficiary', S((ctx, u) => P().beneficiary.save(id(ctx), ctx.body, u)));
  router.post('/api/admin/clients/:id/beneficiary/verify', S((ctx, u) => P().beneficiary.verify(id(ctx), u)));
  router.post('/api/admin/beneficiary-submissions/:id/apply', S((ctx, u) => P().beneficiary.applySubmission(id(ctx), u)));

  // ===== 2) قيمة الأثر المتحقق =====
  router.get('/api/admin/cases/:id/outcome-value', S((ctx) => P().outcome.get('case', id(ctx))));
  router.put('/api/admin/cases/:id/outcome-value', S((ctx, u) => P().outcome.save('case', id(ctx), P().outcome.parse(ctx.body), u)));
  router.get('/api/admin/matters/:id/outcome-value', S((ctx) => P().outcome.get('matter', id(ctx))));
  router.put('/api/admin/matters/:id/outcome-value', S((ctx, u) => P().outcome.save('matter', id(ctx), P().outcome.parse(ctx.body), u)));

  // ===== تقرير الأثر وزمن الاستجابة =====
  router.get('/api/admin/impact', S((ctx) => P().impact.report(ctx.query)));
  // التصدير: POST بالفلاتر يصدر رابط تنزيل لمرة واحدة ← GET /api/download?token=… (src/services/downloads.js)
  app.downloads.route(router, '/api/admin/impact/export', {
    guard: requireStaff,
    prepare: (ctx) => {
      const filters = stringFilters(ctx.body, ['from', 'to', 'area', 'governorate']);
      P().impact.range(filters); // 400 للفترة أو المجال غير الصالح قبل إصدار الرابط
      return { params: { filters }, filename: 'impact.csv' };
    },
    send: (ctx, u, p) => {
      const r = P().impact.csv(p.filters);
      app.audit.log({ actor: u, ctx, type: 'impact.exported', summary: 'تصدير تقرير الأثر بصيغة CSV (بيانات مجمعة دون بيانات شخصية)', data: { from: r.report.from, to: r.report.to, ...r.report.filters } });
      sendDownload(ctx, { filename: r.filename, body: r.csv });
    },
  });
  router.get('/api/admin/sla', S(() => P().sla.summary()));

  // ===== 3) أطراف الملفات وتعارض المصالح =====
  router.get('/api/admin/cases/:id/parties', S((ctx) => P().parties.list({ caseId: id(ctx) })));
  router.post('/api/admin/cases/:id/parties', S((ctx, u) => {
    ctx.status = 201;
    return P().parties.add({ caseId: id(ctx) }, ctx.body, u);
  }));
  router.get('/api/admin/matters/:id/parties', S((ctx) => P().parties.list({ matterId: id(ctx) })));
  router.post('/api/admin/matters/:id/parties', S((ctx, u) => {
    ctx.status = 201;
    return P().parties.add({ matterId: id(ctx) }, ctx.body, u);
  }));
  router.patch('/api/admin/parties/:id', S((ctx, u) => P().parties.update(id(ctx), ctx.body, u)));
  router.delete('/api/admin/parties/:id', S((ctx, u) => P().parties.remove(id(ctx), u)));
  router.post('/api/admin/conflicts/check', S((ctx, u) => P().conflicts.search(ctx.body, u)));
  router.get('/api/admin/conflicts/recent', S((ctx) => ({ items: P().conflicts.recent({ limit: ctx.query.limit }) })));

  // ===== 4) التقويم =====
  router.get('/api/admin/calendar', S((ctx, u) => P().calendar.forStaff(ctx.query, u)));
  router.get('/api/lawyer/calendar', L((ctx, u) => P().calendar.forLawyer(ctx.query, u)));
  router.get('/api/calendar/feed', U((ctx, u) => P().calendar.feedStatus(u, ctx)));
  router.post('/api/calendar/feed', U((ctx, u) => P().calendar.issueFeed(u, ctx)));
  router.delete('/api/calendar/feed', U((ctx, u) => P().calendar.revokeFeed(u, ctx)));
  // اشتراك تقويم الهاتف (iPhone / Google Calendar): الرمز السري في الرابط هو الصلاحية الوحيدة
  const icsFeed = (ctx) => {
    feedLimiter.hit(`ics:${ctx.ip}`);
    const ics = P().calendar.renderFeed(ctx.params.token, ctx);
    if (!ics) throw notFound('رابط التقويم غير صالح أو أُلغي');
    const res = ctx.res;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="beyoot-calendar.ics"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Content-Length', Buffer.byteLength(ics));
    res.end(ctx.req.method === 'HEAD' ? undefined : ics);
    ctx.streamed = true;
  };
  router.get('/api/calendar/:token.ics', icsFeed);
  // بعض تطبيقات التقويم تتحقق من الرابط بطلب HEAD قبل الاشتراك
  router.add('HEAD', '/api/calendar/:token.ics', icsFeed);

  // ===== 5) البحث الشامل =====
  router.get('/api/admin/search', S((ctx) => P().search.staff(ctx.query.q)));
  router.get('/api/lawyer/search', L((ctx, u) => P().search.lawyer(ctx.query.q, u)));

  // ===== 6) الاستيراد والتصدير (مدير النظام فقط) =====
  router.get('/api/admin/data/summary', A(() => ({ ...P().data.summary(), entities: P().data.entities, importable: P().data.importable })));
  // تصدير بيانات المستفيدين والملفات: POST يصدر رابط تنزيل لمرة واحدة ← GET /api/download?token=…
  app.downloads.route(router, '/api/admin/data/export/:entity', {
    guard: requireAdmin,
    prepare: (ctx) => {
      const entity = String(ctx.params.entity || '');
      if (!P().data.entities.includes(entity)) throw notFound('نوع التصدير غير مدعوم');
      return { params: { entity }, filename: `${entity}.csv` };
    },
    send: (ctx, u, p) => {
      const r = P().data.export(p.entity, u, ctx);
      sendDownload(ctx, { filename: r.filename, body: r.csv });
    },
  });
  router.get('/api/admin/data/template/:entity', A((ctx) => {
    const r = P().data.template(ctx.params.entity);
    sendDownload(ctx, { filename: r.filename, body: r.csv });
  }));
  router.post('/api/admin/data/import/:entity/preview', A((ctx) => P().data.preview(ctx.params.entity, ctx.body)), IMPORT_LIMIT);
  router.post('/api/admin/data/import/:entity/commit', A((ctx, u) => P().data.commit(ctx.params.entity, ctx.body, u, ctx)), IMPORT_LIMIT);
}
