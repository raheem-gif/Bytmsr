// الإصدار 10 — مسارات فريق المكتب لخدمة الشركات (§4.6، B10 §8): الشركات والمستخدمون والباقات والاشتراكات والفريق المفضل،
// وطلبات الشركات والتسليمات والعروض والتكاليف والذاكرة. S = مدير نظام أو مدير حالات، A = مدير نظام فقط (B10 §8.3.1، L-60).
// الصلاحية تُفحص على الخادم قبل أي شيء (كل المسارات منفَّذة؛ لا 501).
// تعمل هذه المسارات حتى مع b2b_enabled = false (تعطيل البوابة لا يعطل عمل الفريق).
import { requireStaff, requireAdmin, requireLawyer } from '../auth.js';
import { idParam } from '../http.js';
import { ApiError, nowIso, cairoDayKey } from '../util.js';
import { toCsv } from '../services/practice-lib.js';


export function registerAdminCompanyRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const co = app.companies;
  const billing = app.companyBilling;
  const reqs = app.companyRequests;

  // ───────────────────────── الشركات (8.1) ─────────────────────────
  router.get('/api/admin/companies', S((ctx) => co.staffList({ status: ctx.query.status || null, q: ctx.query.q || null })));
  // قبل /:id حتى لا يلتقطها المسار العام
  router.get('/api/admin/companies/prefix-check', A((ctx) => co.prefixCheck(ctx.query.prefix, { companyId: ctx.query.company_id ? Number(ctx.query.company_id) : null })));
  router.post('/api/admin/companies', A((ctx, u) => {
    ctx.status = 201;
    return co.create(ctx.body, u, ctx);
  }));
  router.get('/api/admin/companies/:id', S((ctx, u) => co.staffView(id(ctx), u)));
  router.patch('/api/admin/companies/:id', A((ctx, u) => co.update(id(ctx), ctx.body, u, ctx)));
  router.post('/api/admin/companies/:id/status', A((ctx, u) => co.setStatus(id(ctx), ctx.body, u, ctx)));
  router.get('/api/admin/companies/:id/usage', S((ctx) => {
    const c = co.require(id(ctx));
    // نظرة الشركة كلها (كمدير البوابة)؛ مبالغ الربحية في 10.1
    return { quota: billing.quota(c, { prices: true }), usage: billing.usageFor({ role: 'company_admin', company_id: c.id, id: 0 }, c, { cycle: ctx.query.cycle || ctx.query.period || null }) };
  }));

  // الكيانات
  router.post('/api/admin/companies/:id/entities', S((ctx, u) => {
    ctx.status = 201;
    return { entity: co.createEntity(id(ctx), ctx.body, { actor: u, ctx }) };
  }));
  router.patch('/api/admin/company-entities/:id', S((ctx, u) => ({ entity: co.updateEntity(id(ctx), ctx.body, { actor: u }) })));

  // المستخدمون (8.1.7–8.1.8؛ L-60: البريد والترقية إلى مدير البوابة وأمان الحساب لمدير النظام)
  router.get('/api/admin/companies/:id/users', S((ctx) => co.staffUsers(id(ctx))));
  router.post('/api/admin/companies/:id/users', S((ctx, u) => {
    ctx.status = 201;
    return co.inviteUser(id(ctx), ctx.body, { actor: u, ctx });
  }));
  router.patch('/api/admin/company-users/:uid', S((ctx, u) => co.updateUserByStaff(idParam(ctx.params, 'uid'), ctx.body, u, ctx)));
  router.post('/api/admin/company-users/:uid/invite', S((ctx, u) => co.resendInvite(idParam(ctx.params, 'uid'), { actor: u, ctx })));
  router.post('/api/admin/company-users/:uid/reset-link', A((ctx, u) => co.resetLink(idParam(ctx.params, 'uid'), { actor: u, ctx })));
  router.post('/api/admin/company-users/:uid/2fa/reset', A((ctx, u) => co.resetTwoFactor(idParam(ctx.params, 'uid'), u, ctx)));
  router.post('/api/admin/company-users/:uid/unlock', A((ctx, u) => co.unlock(idParam(ctx.params, 'uid'), u, ctx)));
  router.post('/api/admin/company-users/:uid/sessions/revoke', A((ctx, u) => co.revokeSessions(idParam(ctx.params, 'uid'), { actor: u, ctx })));

  // الباقات والاشتراكات (8.1.10–8.1.11)
  router.get('/api/admin/company-plans', S(() => billing.plans()));
  router.post('/api/admin/company-plans', A((ctx, u) => {
    ctx.status = 201;
    return billing.createPlan(ctx.body, u, ctx);
  }));
  router.patch('/api/admin/company-plans/:id', A((ctx, u) => billing.updatePlan(id(ctx), ctx.body, u, ctx)));
  router.put('/api/admin/companies/:id/subscription', A((ctx, u) => billing.setSubscription(id(ctx), ctx.body, u, ctx)));

  // الفريق المفضل (8.1.12) — للإدارة فقط ولا تراه الشركة
  router.get('/api/admin/companies/:id/team', S((ctx) => {
    co.require(id(ctx));
    return { items: co.pod(id(ctx)) };
  }));
  router.put('/api/admin/companies/:id/team', S((ctx, u) => co.setPod(id(ctx), ctx.body.items, u)));

  // التكاليف الإضافية (§4.6؛ SRV-10)
  router.get('/api/admin/companies/:id/charges', S((ctx) => billing.staffCharges(id(ctx), { cycle: ctx.query.cycle || null })));
  router.post('/api/admin/companies/:id/charges', A((ctx, u) => {
    ctx.status = 201;
    return billing.staffAddCharge(id(ctx), ctx.body, u, ctx);
  }));
  router.post('/api/admin/company-charges/:id/void', A((ctx, u) => billing.voidCharge(id(ctx), ctx.body, u, ctx)));
  // ملف CSV للتكاليف (CO-28، P0): POST يصدر رابط تنزيل لمرة واحدة ← GET /api/download?token=… (app.downloads)
  app.downloads.route(router, '/api/admin/company-charges.csv', {
    guard: requireAdmin,
    prepare: (ctx) => {
      const cycle = ctx.body.cycle && /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.body.cycle)) ? String(ctx.body.cycle) : null;
      const companyId = ctx.body.company_id ? Number(ctx.body.company_id) || null : null;
      if (companyId) co.require(companyId);
      return { params: { cycle, company_id: companyId }, filename: 'company-charges.csv' };
    },
    send: (ctx, u, p) => {
      const rows = billing.chargesCsvRows(p);
      const csv = toCsv(rows, [
        { key: 'company', label: 'الشركة' },
        { key: 'prefix', label: 'البادئة' },
        { key: 'cycle', label: 'الدورة' },
        { key: 'kind', label: 'النوع' },
        { key: 'description', label: 'الوصف' },
        { key: 'request_code', label: 'الطلب' },
        { key: 'amount', label: 'المبلغ' },
        { key: 'currency', label: 'العملة' },
        { key: 'created_at', label: 'التاريخ' },
        { key: 'voided', label: 'ملغاة' },
      ]);
      app.audit.log({ actor: u, ctx, type: 'company.charges_exported', company_id: p.company_id || null, summary: `تصدير تكاليف الشركات (${rows.length} سطرًا)${p.cycle ? ` — دورة ${p.cycle}` : ''}`, data: p });
      const res = ctx.res;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="company-charges-${p.cycle || cairoDayKey(nowIso())}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(csv);
    },
  });

  // نظرة عامة وصادر البريد والإعدادات (SRV-6 / SRV-13)
  router.get('/api/admin/b2b/overview', S((ctx, u) => co.overview(u)));
  router.get('/api/admin/email-outbox', A((ctx) => app.email.outboxList({ status: ctx.query.status || null, limit: ctx.query.limit })));
  router.get('/api/admin/b2b/settings', A(() => co.b2bSettings()));
  router.put('/api/admin/b2b/settings', A((ctx, u) => co.saveB2bSettings(ctx.body, u, ctx)));

  // الذاكرة القانونية والأطراف (8.2.15؛ SRV-12)
  const mem = app.companyMemory;
  router.get('/api/admin/companies/:id/memory', S((ctx) => mem.staffList(id(ctx), ctx.query)));
  router.post('/api/admin/companies/:id/memory', S((ctx, u) => {
    ctx.status = 201;
    return mem.staffCreate(id(ctx), ctx.body, u);
  }), { limit: 60 * 1024 * 1024 });
  router.get('/api/admin/company-memory/:mid', S((ctx) => mem.staffGet(idParam(ctx.params, 'mid'))));
  router.patch('/api/admin/company-memory/:mid', S((ctx, u) => mem.staffUpdate(idParam(ctx.params, 'mid'), ctx.body, u)));
  router.post('/api/admin/company-memory/:mid/documents', S((ctx, u) => {
    ctx.status = 201;
    return mem.staffAddDocuments(idParam(ctx.params, 'mid'), ctx.body, u);
  }), { limit: 60 * 1024 * 1024 });
  router.post('/api/admin/company-memory/:mid/archive', S((ctx, u) => mem.staffArchive(idParam(ctx.params, 'mid'), ctx.body, u)));
  // الحذف النهائي لمدير النظام فقط (CS-18): ?purge=1 مطلوب صراحة؛ وإلا 400
  router.delete('/api/admin/company-memory/:mid', A((ctx, u) => {
    if (ctx.query.purge !== '1') throw new ApiError(400, 'الحذف النهائي يحتاج purge=1؛ للإخفاء استخدم الأرشفة.', 'purge_required');
    return mem.purge(idParam(ctx.params, 'mid'), u, ctx);
  }));
  router.get('/api/admin/companies/:id/counterparties', S((ctx) => mem.staffCounterparties(id(ctx), ctx.query)));
  router.post('/api/admin/companies/:id/counterparties', S((ctx, u) => {
    ctx.status = 201;
    return mem.staffCreateCounterparty(id(ctx), ctx.body, u);
  }));
  router.patch('/api/admin/company-counterparties/:cid', S((ctx, u) => mem.staffUpdateCounterparty(idParam(ctx.params, 'cid'), ctx.body, u)));

  // ───────────────────────── طلبات الشركات (8.2؛ SRV-6 …) ─────────────────────────
  router.get('/api/admin/company-requests', S((ctx) => reqs.staffList(ctx.query)));
  router.get('/api/admin/company-requests/:id', S((ctx, u) => reqs.staffMarkRead(id(ctx), u)));
  router.patch('/api/admin/company-requests/:id', S((ctx, u) => reqs.staffPatch(id(ctx), ctx.body, u)));
  router.get('/api/admin/company-requests/:id/triage', S((ctx) => reqs.staffTriageGet(id(ctx))));
  router.post('/api/admin/company-requests/:id/triage', S((ctx, u) => reqs.staffTriageRun(id(ctx), u)));
  router.post('/api/admin/company-requests/:id/accept', S((ctx, u) => {
    ctx.status = 201;
    return reqs.accept(id(ctx), ctx.body, u, ctx);
  }));
  router.post('/api/admin/company-requests/:id/clarify', S((ctx, u) => reqs.clarify(id(ctx), ctx.body, u)));
  // رسائل للشركة ومرفقاتها بنفس نمط مسارات الإدارة (ملفات base64 حتى 60 ميجابايت)؛ الخارجية تمر ببوابة المستندات (CS-12)
  router.post('/api/admin/company-requests/:id/messages', S((ctx, u) => reqs.staffMessage(id(ctx), ctx.body, u, ctx)), { limit: 60 * 1024 * 1024 });
  router.post('/api/admin/company-requests/:id/quote', A((ctx, u) => {
    ctx.status = 201;
    return reqs.sendQuote(id(ctx), ctx.body, u, ctx);
  }));
  router.post('/api/admin/company-quotes/:id/withdraw', A((ctx, u) => reqs.withdrawQuote(id(ctx), ctx.body, u, ctx)));
  // التسليمات: ملفات الفريق بنفس نمط مسارات الإدارة (base64 حتى 60 ميجابايت)
  router.post('/api/admin/company-requests/:id/deliverables', S((ctx, u) => {
    ctx.status = 201;
    return reqs.createDeliverable(id(ctx), ctx.body, u);
  }), { limit: 60 * 1024 * 1024 });
  router.post('/api/admin/company-requests/:id/deliverables/prefill', S((ctx) => reqs.prefill(id(ctx), ctx.body)));
  // ملخص التسليم بالذكاء الاصطناعي (B10 §10.2، P1): اقتراح للفريق فقط، ينسخه إلى المسودة؛ لا يُرسل للشركة تلقائيًا
  router.post('/api/admin/company-requests/:id/ai/deliverable', S((ctx, u) => reqs.staffAiDeliverable(id(ctx), ctx.body, u)));
  router.patch('/api/admin/company-deliverables/:id', S((ctx, u) => reqs.updateDeliverable(id(ctx), ctx.body, u)), { limit: 60 * 1024 * 1024 });
  router.get('/api/admin/company-deliverables/:id/precheck', S((ctx) => reqs.precheck(id(ctx))));
  router.post('/api/admin/company-deliverables/:id/release', S((ctx, u) => reqs.releaseDeliverable(id(ctx), ctx.body, u, ctx)));
  router.post('/api/admin/company-deliverables/:id/withdraw', A((ctx, u) => reqs.withdrawDeliverable(id(ctx), ctx.body, u, ctx)));
  router.post('/api/admin/company-requests/:id/decline', S((ctx, u) => reqs.decline(id(ctx), ctx.body, u, ctx)));
  router.post('/api/admin/company-requests/:id/close', S((ctx, u) => reqs.close(id(ctx), ctx.body, u)));
  router.post('/api/admin/company-requests/:id/reopen', S((ctx, u) => reqs.reopen(id(ctx), ctx.body, u)));
  router.post('/api/admin/company-requests/:id/escalation/ack', S((ctx, u) => reqs.escalationAck(id(ctx), ctx.body, u)));
  router.get('/api/admin/company-requests/:id/suggest-lawyers', S((ctx) => reqs.suggestLawyers(id(ctx), ctx.query.role === 'reviewer' ? 'reviewer' : 'lead')));
  router.put('/api/admin/company-requests/:id/memory-links', S((ctx, u) => reqs.setMemoryLinks(id(ctx), ctx.body, u)));
  // عنصر ذاكرة من الطلب (8.2.13): يُربط بالطلب، ووصوله لمديري البوابة إن كان الطلب خاصًا
  router.post('/api/admin/company-requests/:id/memory', S((ctx, u) => {
    const r = app.db.get('SELECT * FROM company_requests WHERE id = ?', id(ctx));
    if (!r) throw new ApiError(404, 'طلب الشركة غير موجود', 'not_found');
    ctx.status = 201;
    return mem.staffCreate(r.company_id, ctx.body, u, { sourceRequest: r });
  }), { limit: 60 * 1024 * 1024 });
  router.put('/api/admin/assignments/:id/memory-grants', S((ctx, u) => {
    const r = reqs.setMemoryGrants(id(ctx), Array.isArray(ctx.body.memory_ids) ? ctx.body.memory_ids : [], u);
    const a = app.db.get('SELECT case_id FROM assignments WHERE id = ?', id(ctx));
    app.activity.log({ actor: u, case_id: a?.case_id ?? null, type: 'company.memory_grants', summary: `تحديث عناصر الذاكرة المتاحة للمحامي (${r.memory_ids.length})` });
    return r;
  }));

  // ───────────────────────── المحامون: ملفات العمل في ملفات الشركات (§4.7، P1) ─────────────────────────
  // ملفات شركات فقط (404 لغيرها)، PDF/Word/Excel/صور، ≤ 5 لكل إسناد؛ الحذف حتى اعتماد الرأي. لا تصل للشركة أبدًا (L-52)
  router.post('/api/lawyer/assignments/:id/work-files', (ctx) => {
    const u = requireLawyer(ctx);
    ctx.status = 201;
    return reqs.addWorkFiles(id(ctx), ctx.body, u);
  }, { limit: 60 * 1024 * 1024 });
  router.delete('/api/lawyer/work-files/:docId', (ctx) => reqs.deleteWorkFile(idParam(ctx.params, 'docId'), requireLawyer(ctx)));
}
