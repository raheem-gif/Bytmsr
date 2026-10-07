// بوابة المحامي (Lawyer Portal): كل البيانات هنا تُبنى من خدمة الصلاحيات فقط.
// المحامي لا يرى إلا ما أتاحته الإدارة، ولا يستطيع إغلاق الملف أو التواصل مع العميل مباشرة.
import { requireLawyer } from '../auth.js';
import { idParam } from '../http.js';
import { nowIso, periodOf } from '../util.js';
import { suggestedDocuments } from '../services/v91-l-work.js'; // v9.1 l-work

export function registerLawyerRoutes(router, app) {
  const L = (fn) => (ctx) => fn(ctx, requireLawyer(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  // v9.1 l-work: هل يعمل Claude الآن (مفتاح مضبوط ولم يُتجاوز السقف)؟ — يظهر للمحامي في /api/meta كـ ai.claude فقط
  const claudeActive = () => {
    try {
      return app.ai?.status?.().provider === 'anthropic';
    } catch {
      return false;
    }
  };
  app.metaProviders?.push((ctx) => (ctx?.user?.role === 'lawyer' ? { ai: { claude: claudeActive() } } : {}));

  router.get('/api/lawyer/dashboard', L((ctx, u) => {
    const active = app.visibility.listForLawyer(u, { scope: 'active' });
    const t = nowIso();
    const m = app.lawyers.metricsFor(u.id, periodOf(t));
    return {
      assignments: active,
      counts: {
        active: active.length,
        overdue: active.filter((a) => a.overdue).length,
        returned: active.filter((a) => a.status === 'returned').length,
        awaiting_review: active.filter((a) => a.status === 'submitted').length,
        new: active.filter((a) => a.status === 'assigned').length,
      },
      metrics: m,
      matters: app.matters.listForLawyer(u).filter((x) => x.status !== 'closed'),
      upcoming_events: app.db.all(
        `SELECT e.id, e.kind, e.title, e.starts_at, e.location, m.id AS matter_id, m.code AS matter_code
         FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE m.responsible_lawyer_id = ? AND e.status = 'scheduled' AND e.starts_at >= ? ORDER BY e.starts_at LIMIT 10`,
        u.id,
        t,
      ),
    };
  }));
  router.get('/api/lawyer/assignments', L((ctx, u) => app.visibility.listForLawyer(u, { scope: ctx.query.scope === 'history' ? 'history' : 'active' })));
  router.get('/api/lawyer/assignments/:id', L((ctx, u) => {
    // نبني العرض أولًا (حتى تظهر علامة «جديد» على ما أُتيح منذ آخر اطلاع) ثم نسجل الاطلاع
    const view = app.visibility.assignmentView(id(ctx), u);
    app.visibility.markViewed(id(ctx), u);
    // v9.1 l-work: أدوات Claude (تحليل المستند، المسودة الآلية) تظهر فقط حين يعمل Claude فعلًا — لا مفاتيح ولا تكلفة
    return { ...view, ai: { claude: claudeActive() } };
  }));
  router.post('/api/lawyer/assignments/:id/open', L((ctx, u) => ({ ...app.visibility.markOpened(id(ctx), u), ai: { claude: claudeActive() } })));
  router.put('/api/lawyer/assignments/:id/draft', L((ctx, u) => {
    const o = app.opinions.saveDraft(id(ctx), u, ctx.body);
    // v9.1 l-work: length/words ليتحقق الجهاز أن ما حُفظ هو نصه نفسه قبل حذف نسخته الاحتياطية
    return { id: o.id, version: o.version, status: o.status, updated_at: o.updated_at, length: o.body.length, words: o.body.trim() ? o.body.trim().split(/\s+/).length : 0 };
  }));
  // v9.1 l-work (L-19): مستندات مقترحة عند طلب مستند — بلا أي بيانات للمستفيد/ة، و404 لإسناد ليس له
  router.get('/api/lawyer/assignments/:id/suggested-documents', L((ctx, u) => suggestedDocuments(app, id(ctx), u)));
  router.post('/api/lawyer/assignments/:id/submit', L((ctx, u) => {
    const o = app.opinions.submit(id(ctx), u, ctx.body);
    return { id: o.id, version: o.version, status: o.status, submitted_at: o.submitted_at };
  }));
  router.post('/api/lawyer/assignments/:id/info-requests', L((ctx, u) => {
    ctx.status = 201;
    const r = app.requests.createInfoByLawyer(id(ctx), u, ctx.body);
    return { id: r.id, status: r.status };
  }));
  router.post('/api/lawyer/info-requests/:id/cancel', L((ctx, u) => {
    const r = app.requests.cancelInfo(id(ctx), u);
    return { id: r.id, status: r.status };
  }));
  router.post('/api/lawyer/assignments/:id/counsel-requests', L((ctx, u) => {
    ctx.status = 201;
    const r = app.requests.createCounsel(id(ctx), u, ctx.body);
    return { id: r.id, status: r.status };
  }));
  router.post('/api/lawyer/counsel-requests/:id/cancel', L((ctx, u) => {
    const r = app.requests.cancelCounsel(id(ctx), u);
    return { id: r.id, status: r.status };
  }));
  router.post('/api/lawyer/assignments/:id/issues', L((ctx, u) => {
    ctx.status = 201;
    const i = app.cases.proposeIssue(id(ctx), u, ctx.body);
    return { id: i.id, number: i.number, status: i.status };
  }));
  // مساعدة الذكاء الاصطناعي: مسودة أولية + حالات مشابهة من المعرفة المعتمدة المجهّلة فقط
  router.post('/api/lawyer/assignments/:id/ai/draft', L(async (ctx, u) => {
    const s = await app.ai.draftForAssignment(id(ctx), u);
    return { id: s.id, text: s.output.text, provider: s.provider, fallback_reason: s.output._fallback_reason || null, sources: s.output.sources || [] };
  }));
  router.get('/api/lawyer/assignments/:id/similar', L((ctx, u) => {
    const view = app.visibility.assignmentView(id(ctx), u);
    return app.ai.similar(`${view.case.title}\n${view.facts || ''}\n${view.issues.map((i) => i.title).join('\n')}`, { scope: 'lawyer', limit: 5, area: view.case.legal_area });
  }));

  // الملفات المستمرة المسندة للمحامي
  router.get('/api/lawyer/matters', L((ctx, u) => app.matters.listForLawyer(u)));
  router.get('/api/lawyer/matters/:id', L((ctx, u) => app.matters.lawyerView(id(ctx), u)));
  // v9.1 l-court: الرد بما يراه المحامي من الموعد فقط (بلا علم الاعتماد ولا رد المستفيد/ة على الموعد ولا ملاحظتها)
  router.post('/api/lawyer/matters/:id/events', L((ctx, u) => app.matters.lawyerEventView(app.matters.addEvent(id(ctx), ctx.body, u))));
  router.patch('/api/lawyer/matter-events/:id', L((ctx, u) => app.matters.lawyerEventView(app.matters.updateEvent(id(ctx), ctx.body, u))));
  // v9.1 l-court (L-02/L-22): نتيجة الجلسة + الجلسة القادمة + ميعاد الطعن في طلب واحد آمن للتكرار (client_ref)
  router.post('/api/lawyer/matter-events/:id/outcome', L((ctx, u) => app.matters.recordOutcome(id(ctx), ctx.body, u)));
  router.get('/api/lawyer/pending-outcomes', L((ctx, u) => app.matters.pendingOutcomesForLawyer(u)));
  router.post('/api/lawyer/matters/:id/tasks', L((ctx, u) => app.matters.addTask(id(ctx), ctx.body, u)));
  router.patch('/api/lawyer/matter-tasks/:id', L((ctx, u) => app.matters.updateTask(id(ctx), ctx.body, u)));

  // كشف الحساب الشخصي
  router.get('/api/lawyer/statement', L((ctx, u) => app.accounting.statement(u.id)));
}
