// مسارات الحسابات والأمان وسجل التدقيق
// (الإصدار 9 — وحدة accounts)
//  - بدون دخول: الخطوة الثانية للدخول، فحص روابط الدعوة/إعادة التعيين واستخدامها.
//  - حسابي (لكل المستخدمين): البيانات، كلمة المرور، التحقق بخطوتين، الجلسات، النشاط الأخير.
//    مسارات كلمة المرور والتحقق بخطوتين متاحة أيضًا للحسابات المقيدة (كلمة مرور مؤقتة / إلزام بالتحقق بخطوتين).
//  - الإدارة (مدير النظام فقط): حالة الحسابات، الدعوات، روابط إعادة التعيين، كلمات المرور المؤقتة، رفع الإيقاف،
//    إلغاء التحقق بخطوتين، إنهاء الجلسات، سياسة الأمان، وسجل الأمان مع التصدير.
import { requireUser, requireAdmin } from '../auth.js';
import { idParam } from '../http.js';

export function registerAccountsRoutes(router, app) {
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  /** مستخدم مسجل (الحسابات المقيدة مسموحة) */
  const R = (fn) => (ctx) => fn(ctx, requireUser(ctx, { allowRestricted: true }));
  /** مستخدم مسجل غير مقيد */
  const U = (fn) => (ctx) => fn(ctx, requireUser(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const acc = app.accounts;

  // ===== الدخول والروابط (بدون جلسة) =====
  router.post('/api/auth/login/2fa', (ctx) => app.auth.loginSecondFactor(ctx, ctx.body));
  router.post('/api/auth/link', (ctx) => acc.inspectLink(ctx, ctx.body.token));
  router.post('/api/auth/invite/accept', (ctx) => acc.acceptInvite(ctx, ctx.body));
  router.post('/api/auth/reset', (ctx) => acc.resetPassword(ctx, ctx.body));

  // ===== حسابي =====
  router.get('/api/account', R((ctx) => acc.myAccount(ctx)));
  router.patch('/api/account', U((ctx) => acc.updateProfile(ctx, ctx.body)));
  router.post('/api/account/password', R((ctx) => acc.changePassword(ctx, ctx.body)));
  router.post('/api/account/2fa/setup', R((ctx) => acc.setupTwoFactor(ctx, ctx.body)));
  router.post('/api/account/2fa/enable', R((ctx) => acc.enableTwoFactor(ctx, ctx.body)));
  router.post('/api/account/2fa/disable', U((ctx) => acc.disableTwoFactor(ctx, ctx.body)));
  router.post('/api/account/2fa/recovery-codes', U((ctx) => acc.regenerateRecoveryCodes(ctx, ctx.body)));
  router.get('/api/account/sessions', R((ctx) => acc.mySessions(ctx)));
  router.post('/api/account/sessions/revoke-others', R((ctx) => acc.revokeMyOtherSessions(ctx)));
  router.delete('/api/account/sessions/:sid', R((ctx) => acc.revokeMySession(ctx, ctx.params.sid)));
  router.get('/api/account/activity', U((ctx) => ({ items: acc.myActivity(ctx) })));

  // ===== إدارة الحسابات (مدير النظام) =====
  router.get('/api/admin/accounts', A((ctx) => acc.listAccounts({ role: ['staff', 'lawyer', 'admin', 'case_manager'].includes(ctx.query.role) ? ctx.query.role : null, state: ctx.query.state || null })));
  router.get('/api/admin/accounts/invites', A(() => ({ items: acc.pendingInvites() })));
  router.get('/api/admin/accounts/:id', A((ctx) => acc.accountDetail(id(ctx))));
  router.post('/api/admin/accounts/:id/invite', A((ctx, u) => acc.resendInvite(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/invite/revoke', A((ctx, u) => acc.revokeInvite(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/reset-link', A((ctx, u) => acc.issueResetLink(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/reset-link/revoke', A((ctx, u) => acc.revokeResetLinks(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/temp-password', A((ctx, u) => acc.setTemporaryPassword(id(ctx), ctx.body.password, u, ctx)));
  router.post('/api/admin/accounts/:id/unlock', A((ctx, u) => acc.unlock(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/2fa/reset', A((ctx, u) => acc.resetTwoFactorByAdmin(id(ctx), u, ctx)));
  router.post('/api/admin/accounts/:id/sessions/revoke', A((ctx, u) => acc.revokeAllSessionsByAdmin(id(ctx), u, ctx)));

  // ===== سياسة الأمان =====
  router.get('/api/admin/security/policy', A(() => acc.policy()));
  router.patch('/api/admin/security/policy', A((ctx, u) => acc.updatePolicy(ctx.body, u, ctx)));

  // ===== سجل الأمان =====
  router.get('/api/admin/audit', A((ctx) => acc.auditList(ctx.query)));
  router.get('/api/admin/audit/facets', A(() => acc.auditFacets()));
  router.get('/api/admin/audit/summary', A(() => acc.auditSummary()));
  router.get('/api/admin/audit/export.csv', A((ctx, u) => {
    const { csv } = acc.auditCsv(ctx.query, u, ctx);
    const stamp = new Date().toISOString().slice(0, 10);
    const res = ctx.res;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="security-audit-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(csv);
    ctx.streamed = true;
  }));
}
