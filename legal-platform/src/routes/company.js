// الإصدار 10 — مسارات بوابة الشركات /api/company/* وصفحة /company (L-13، L-14، L-34، L-39، L-41، §4.5).
// كل مسار بعد الدخول يمر بالغلاف C() ← app.companyAuth.require(): كعكة bm_csid وحدها مصدر ctx.company، ولا يُقرأ مستخدم فريق المكتب هنا
// أبدًا (كعكة فريق المكتب في المتصفح نفسه لا أثر لها). المسارات بلا جلسة: meta وauth/*.
// b2b_enabled = false ← كل المسارات 404 (بنفس جسم «المسار غير موجود») عدا meta التي تعيد { enabled: false }.
// كل مسارات §4.5 منفَّذة خلف غلاف الصلاحية (لا 501 بعد SRV-12).
import fs from 'node:fs';
import path from 'node:path';
import { idParam, assetVersion, sendBody } from '../http.js';
import { ApiError, sha256 } from '../util.js';
import { LABELS } from '../constants.js';
import { REQUEST_TYPES } from '../../public/assets/js/lib/company-catalog.js';
import { calendars, businessHoursText, urgentHoursText } from '../../public/assets/js/lib/company-sla.js';
import * as siteAssets from '../site-assets.js';

const ADMIN = ['company_admin'];
const WRITERS = ['company_admin', 'member'];

/** مجموعات التسميات الآمنة للشركة في meta (L-41) */
const COMPANY_LABEL_GROUPS = [
  'company_status',
  'company_user_role',
  'company_user_state',
  'company_request_type',
  'company_waiting_on',
  'company_stage',
  'company_quote_status',
  'company_quote_basis',
  'company_deliverable_kind',
  'company_memory_kind',
  'company_memory_status',
  'company_memory_access',
  'company_entity_relation',
  'company_counterparty_kind',
  'company_plan_period',
  'company_quota_kind',
  'company_charge_kind',
  'company_risk_level',
  'company_visibility',
  'company_senior_review',
  'legal_form',
];
/** أنواع الملفات المقبولة في البوابة (لا صوت ولا فيديو؛ L-27) */
export const COMPANY_UPLOAD_MIME = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'text/plain',
]);
export const COMPANY_UPLOAD_LIMIT_BYTES = 12 * 1024 * 1024;

const notFoundError = () => new ApiError(404, 'المسار غير موجود', 'not_found');

export function registerCompanyRoutes(router, app) {
  const enabled = () => app.settings.get('b2b_enabled') !== false;
  const gate = () => {
    if (!enabled()) throw notFoundError();
  };
  /** بلا جلسة (الدخول والروابط) */
  const P = (fn) => (ctx) => {
    gate();
    return fn(ctx);
  };
  /** بعد الدخول: الحارس ثم المعالج (cu = مستخدم الشركة، company = شركته من الجلسة) */
  const C = (fn, opts = {}) => (ctx) => {
    gate();
    const { cu, company } = app.companyAuth.require(ctx, opts);
    return fn(ctx, cu, company);
  };
  const id = (ctx, k = 'id') => idParam(ctx.params, k);
  const co = app.companies;
  const auth = app.companyAuth;
  const reqs = app.companyRequests;

  // ───────────────────────── meta (L-41) ─────────────────────────
  function buildMeta() {
    const brand = { name: co.brandName(), short: co.brandShort(), tagline_ar: 'إدارتكم القانونية', tagline_en: 'Your Virtual Legal Department' };
    if (!enabled()) return { enabled: false, version: app.version, brand };
    const groups = {};
    for (const g of COMPANY_LABEL_GROUPS) if (LABELS[g]) groups[g] = { ...LABELS[g] };
    // نوع الطلب بصياغة البوابة (لا تسمية فريق المكتب)
    groups.company_request_type = Object.fromEntries(REQUEST_TYPES.map((t) => [t.key, t.company_label]));
    const cals = calendars(app.settings.all());
    return {
      enabled: true,
      version: app.version,
      brand,
      constants: { LABELS: groups },
      limits: {
        max_upload_mb: Number(app.config.maxUploadMb) || 8,
        files_per_call: 5,
        files_per_request: 30,
        files_per_memory_item: 10,
        mime: COMPANY_UPLOAD_MIME,
      },
      business_hours_text: businessHoursText(cals.business),
      urgent_hours_text: urgentHoursText(cals.urgent),
      email_enabled: !!app.email?.enabled?.(),
      terms_url: String(app.settings.get('b2b_terms_url') || '') || null,
    };
  }
  router.get('/api/company/meta', (ctx) => {
    const meta = buildMeta();
    const etag = `"cm-${sha256(JSON.stringify(meta)).slice(0, 20)}"`;
    ctx.res.setHeader('ETag', etag);
    const inm = String(ctx.req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some((x) => x.trim().replace(/^W\//, '') === etag)) {
      ctx.res.statusCode = 304;
      ctx.res.setHeader('Cache-Control', 'no-cache');
      ctx.res.end();
      ctx.streamed = true;
      return undefined;
    }
    return meta;
  });

  // ───────────────────────── الدخول والروابط (بلا جلسة) ─────────────────────────
  router.post('/api/company/auth/login', P((ctx) => auth.login(ctx, ctx.body)));
  router.post('/api/company/auth/login/2fa', P((ctx) => auth.loginSecondFactor(ctx, ctx.body)));
  router.post('/api/company/auth/logout', P((ctx) => auth.logout(ctx)));
  router.get('/api/company/auth/session', P((ctx) => auth.session(ctx)));
  router.post('/api/company/auth/link', P((ctx) => auth.inspectLink(ctx, ctx.body.token)));
  router.post('/api/company/auth/invite/accept', P((ctx) => auth.acceptInvite(ctx, ctx.body)));
  router.post('/api/company/auth/forgot', P((ctx) => auth.forgot(ctx, ctx.body)));
  router.post('/api/company/auth/reset', P((ctx) => auth.resetPassword(ctx, ctx.body)));

  // ───────────────────────── حسابي (L-16) ─────────────────────────
  const R = { allowRestricted: true };
  router.get('/api/company/me', C((ctx, cu, c) => auth.me(ctx, cu, c), R));
  router.patch('/api/company/me', C((ctx, cu, c) => auth.updateMe(ctx, cu, c, ctx.body)));
  router.post('/api/company/me/password', C((ctx, cu, c) => auth.changePassword(ctx, cu, c, ctx.body), R));
  router.post('/api/company/me/2fa/setup', C((ctx, cu, c) => auth.setupTwoFactor(ctx, cu, c, ctx.body), R));
  router.post('/api/company/me/2fa/enable', C((ctx, cu, c) => auth.enableTwoFactor(ctx, cu, c, ctx.body), R));
  router.post('/api/company/me/2fa/disable', C((ctx, cu, c) => auth.disableTwoFactor(ctx, cu, c, ctx.body)));
  router.post('/api/company/me/2fa/recovery-codes', C((ctx, cu, c) => auth.regenerateRecoveryCodes(ctx, cu, c, ctx.body)));
  router.get('/api/company/me/sessions', C((ctx, cu) => auth.mySessions(ctx, cu), R));
  router.post('/api/company/me/sessions/revoke-others', C((ctx, cu, c) => auth.revokeMyOtherSessions(ctx, cu, c), R));
  router.delete('/api/company/me/sessions/:sid', C((ctx, cu, c) => auth.revokeMySession(ctx, cu, c, ctx.params.sid), R));

  // ───────────────────────── المتابعة والباقة والاستخدام ─────────────────────────
  router.get('/api/company/home', C((ctx, cu, c) => reqs.home(cu, c)));
  router.get('/api/company/plan', C((ctx, cu, c) => app.companyBilling.planFor(cu, c)));
  router.get('/api/company/usage', C((ctx, cu, c) => app.companyBilling.usageFor(cu, c, { cycle: ctx.query.cycle || null })));
  router.get('/api/company/charges', C((ctx, cu, c) => app.companyBilling.chargesFor(cu, c, { cycle: ctx.query.cycle || null })));
  router.get('/api/company/colleagues', C((ctx, cu) => co.colleagues(cu)));
  router.get('/api/company/search', C((ctx, cu, c) => reqs.search(cu, c, ctx.query.q)));
  // الرفع على مراحل (L-27): ملف واحد في كل طلب؛ الصلاحية وحد «4 أجسام في الوقت نفسه» قبل قراءة الجسم (12 ميجابايت)
  router.post(
    '/api/company/uploads',
    C((ctx, cu, c) => {
      ctx.status = 201;
      return reqs.stageUpload(cu, c, ctx.body);
    }, { roles: WRITERS, write: true }),
    {
      limit: COMPANY_UPLOAD_LIMIT_BYTES,
      gate: (ctx) => {
        gate();
        const { cu, company } = app.companyAuth.require(ctx, { roles: WRITERS, write: true });
        // G7-03: حد لكل مستخدم ولكل شركة + مراقبة تقدم قراءة الجسم (لا يحتجز جسم بطيء مكانًا بلا نهاية)
        return reqs.acquireUploadSlot({ cu, company, req: ctx.req });
      },
    },
  );

  // ───────────────────────── الطلبات (SRV-6 …) ─────────────────────────
  router.get('/api/company/requests', C((ctx, cu, c) => reqs.list(cu, c, ctx.query)));
  router.post('/api/company/requests', C((ctx, cu, c) => reqs.create(cu, c, ctx.body, ctx), { roles: WRITERS, write: true }));
  router.get('/api/company/requests/:code', C((ctx, cu, c) => reqs.view(cu, c, ctx.params.code)));
  router.post('/api/company/requests/:code/messages', C((ctx, cu, c) => {
    ctx.status = 201;
    return reqs.addMessage(cu, c, ctx.params.code, ctx.body);
  }, { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/documents', C((ctx, cu, c) => {
    ctx.status = 201;
    return reqs.addDocuments(cu, c, ctx.params.code, ctx.body);
  }, { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/clarifications/:messageId/reply', C((ctx, cu, c) => reqs.replyClarification(cu, c, ctx.params.code, ctx.params.messageId, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/cancel', C((ctx, cu, c) => reqs.cancel(cu, c, ctx.params.code, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/quotes/:number/approve', C((ctx, cu, c) => reqs.approveQuote(cu, c, ctx.params.code, ctx.params.number, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/quotes/:number/reject', C((ctx, cu, c) => reqs.rejectQuote(cu, c, ctx.params.code, ctx.params.number, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/deliverables/:id/accept', C((ctx, cu, c) => reqs.acceptDeliverable(cu, c, ctx.params.code, ctx.params.id, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/deliverables/:id/request-changes', C((ctx, cu, c) => reqs.requestChanges(cu, c, ctx.params.code, ctx.params.id, ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/requests/:code/escalate', C((ctx, cu, c) => reqs.escalate(cu, c, ctx.params.code, ctx.body), { roles: WRITERS, write: true }));
  router.put('/api/company/requests/:code/watchers', C((ctx, cu, c) => reqs.setWatchers(cu, c, ctx.params.code, ctx.body), { roles: WRITERS, write: true }));
  router.get('/api/company/documents/:id/download', C((ctx, cu, c) => reqs.download(ctx, cu, c, id(ctx)))); // L-52

  // ───────────────────────── الذاكرة القانونية (SRV-12) ─────────────────────────
  const mem = app.companyMemory;
  router.get('/api/company/memory', C((ctx, cu, c) => mem.list(cu, c, ctx.query)));
  router.get('/api/company/memory/:id', C((ctx, cu, c) => mem.get(cu, c, id(ctx))));
  router.post('/api/company/memory', C((ctx, cu, c) => {
    ctx.status = 201;
    return mem.create(cu, c, ctx.body);
  }, { roles: WRITERS, write: true }));
  router.patch('/api/company/memory/:id', C((ctx, cu, c) => mem.update(cu, c, id(ctx), ctx.body), { roles: WRITERS, write: true }));
  router.post('/api/company/memory/:id/documents', C((ctx, cu, c) => {
    ctx.status = 201;
    return mem.addDocuments(cu, c, id(ctx), ctx.body);
  }, { roles: WRITERS, write: true }));
  router.post('/api/company/memory/:id/archive', C((ctx, cu, c) => mem.archive(cu, c, id(ctx)), { roles: WRITERS, write: true }));
  router.get('/api/company/key-dates', C((ctx, cu, c) => mem.keyDates(cu, c, ctx.query)));
  router.get('/api/company/counterparties', C((ctx, cu, c) => mem.counterparties(cu, c, ctx.query)));

  // ───────────────────────── الكيانات وبيانات الشركة ─────────────────────────
  router.get('/api/company/entities', C((ctx, cu, c) => ({ items: co.entities(c.id), max_entities: co.maxEntitiesOf(c.id) })));
  router.post('/api/company/entities', C((ctx, cu, c) => {
    ctx.status = 201;
    return { entity: co.createEntity(c.id, ctx.body, { cu, ctx }) };
  }, { roles: ADMIN, write: true }));
  router.patch('/api/company/entities/:id', C((ctx, cu, c) => ({ entity: co.updateEntity(id(ctx), ctx.body, { cu, companyId: c.id }) }), { roles: ADMIN, write: true }));
  router.get('/api/company/profile', C((ctx, cu, c) => co.profile(cu, c)));
  router.patch('/api/company/profile', C((ctx, cu, c) => co.updateProfile(cu, c, ctx.body, ctx), { roles: ADMIN, write: true }));

  // ───────────────────────── الفريق (مدير البوابة؛ L-60) ─────────────────────────
  router.get('/api/company/team', C((ctx, cu) => co.team(cu), { roles: ADMIN }));
  router.post('/api/company/team/invite', C((ctx, cu, c) => {
    ctx.status = 201;
    return co.inviteUser(c.id, ctx.body, { cu, ctx });
  }, { roles: ADMIN, write: true }));
  router.patch('/api/company/team/:uid', C((ctx, cu) => co.updateUserByCompany(cu, idParam(ctx.params, 'uid'), ctx.body, ctx), { roles: ADMIN, write: true }));
  router.post('/api/company/team/:uid/invite', C((ctx, cu) => co.resendInvite(idParam(ctx.params, 'uid'), { cu, ctx }), { roles: ADMIN, write: true }));
  router.post('/api/company/team/:uid/reset-link', C((ctx, cu) => co.resetLink(idParam(ctx.params, 'uid'), { cu, ctx }), { roles: ADMIN, write: true }));
  router.post('/api/company/team/:uid/sessions/revoke', C((ctx, cu) => co.revokeSessions(idParam(ctx.params, 'uid'), { cu, ctx }), { roles: ADMIN, write: true }));

  // ───────────────────────── الإشعارات ─────────────────────────
  router.get('/api/company/notifications', C((ctx, cu) => app.companyNotify.list(cu, { limit: ctx.query.limit })));
  router.post('/api/company/notifications/read-all', C((ctx, cu) => app.companyNotify.markAllRead(cu)));
  router.post('/api/company/notifications/:id/read', C((ctx, cu) => {
    const r = app.companyNotify.markRead(cu, id(ctx));
    if (!r) throw new ApiError(404, 'الإشعار غير موجود', 'not_found');
    return r;
  }));

  registerCompanyPage(app);
}

/** المسارات المسموحة بلا جلسة (B10-12، §7.3-1) — يستخدمها اختبار مسح المسارات */
export const COMPANY_PUBLIC_ROUTES = Object.freeze([
  'GET /api/company/meta',
  'POST /api/company/auth/login',
  'POST /api/company/auth/login/2fa',
  'POST /api/company/auth/logout',
  'GET /api/company/auth/session',
  'POST /api/company/auth/link',
  'POST /api/company/auth/invite/accept',
  'POST /api/company/auth/forgot',
  'POST /api/company/auth/reset',
]);

// ───────────────────────── صفحة /company (L-39) ─────────────────────────
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * يقرأ public/company.html (ملك مسار b2b-portal) قالبًا: {{brand_short}} ← الاسم المختصر، لون شريط المتصفح ← لون المؤسسة،
 * <!--bm:head--> ← كتلة الألوان المحفوظة + modulepreload لما تستورده company/main.js، وكل رابط /assets/(js|css|fonts) برقم إصداره.
 * لا JavaScript مضمّن (CSP كما هي).
 */
export function renderCompanyHtml(app) {
  const pub = app.config.publicDir;
  let html;
  try {
    html = fs.readFileSync(path.join(pub, 'company.html'), 'utf8');
  } catch {
    return null;
  }
  siteAssets.setPublicRoot?.(pub);
  const short = escAttr(app.companies?.brandShort?.() || '');
  html = html.split('{{brand_short}}').join(short);
  html = html.replace(/<meta name="theme-color" content="#[0-9a-fA-F]{3,8}" \/>/, () => `<meta name="theme-color" content="${escAttr(app.brand?.themeColor?.() || '#0b5a3c')}" />`);
  const present = new Set();
  html = html.replace(/\b(href|src)="(\/assets\/(?:js|css|fonts)\/[^"?#]+\.(?:js|css|woff2))"/g, (m, attr, url) => {
    const v = assetVersion(path.join(pub, url));
    const u = v ? `${url}?v=${v}` : url;
    present.add(u);
    return `${attr}="${u}"`;
  });
  const extra = [];
  const entry = path.join(pub, 'assets/js/company/main.js');
  if (siteAssets.preloadClosure && fs.existsSync(entry)) {
    try {
      for (const u of siteAssets.preloadClosure(entry, pub)) {
        if (present.has(u)) continue;
        present.add(u);
        extra.push(`<link rel="modulepreload" href="${u}" />`);
      }
    } catch {
      /* بلا روابط إضافية */
    }
  }
  const head = [app.brand?.headStyle?.() || '', ...extra].filter(Boolean).join('\n    ');
  return html.replace('<!--bm:head-->', head);
}

function registerCompanyPage(app) {
  const handler = (req, res) => {
    const html = renderCompanyHtml(app);
    if (html == null) return false;
    const etag = `W/"co-${sha256(html).slice(0, 16)}"`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const inm = String(req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some((x) => x.trim() === etag)) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    sendBody(res, 200, html, { req });
    return true;
  };
  app.pageHandlers.set('/company', handler);
  app.pageHandlers.set('/company/', handler);
}

