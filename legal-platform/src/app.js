// تجميع التطبيق: قاعدة البيانات، الخدمات، المسارات، خادم HTTP، والمجدول.
import http from 'node:http';
import path from 'node:path';
import { Db } from './db.js';
import { Router, sendJson, sendError, readBody, parseCookies, securityHeaders, serveStatic, sendFile } from './http.js';
import { sendBody } from './http.js'; // v9.1 b-site: صفحة 404 مضغوطة (تُفتح غالبًا من رابط واتساب مقطوع على باقة بطيئة)
import { ApiError, badRequest, forbidden } from './util.js';
import { createAuth, RateLimiter } from './auth.js';
import { createEvents, createActivity, createNotifications, createSettings } from './services/core.js';
import { createDocuments } from './services/documents.js';
import { createClients } from './services/clients.js';
import { createWhatsApp } from './channels/whatsapp.js';
import { createEngine } from './channels/engine.js';
import { createAi } from './ai/index.js';
import { createVisibility } from './services/visibility.js';
import { createCases } from './services/cases.js';
import { createIntakes } from './services/intakes.js';
import { createRequests } from './services/requests.js';
import { createOpinions } from './services/opinions.js';
import { createAccounting } from './services/accounting.js';
import { createLawyers } from './services/lawyers.js';
import { createMatters } from './services/matters.js';
import { createAutomations } from './services/automations.js';
import { createKnowledge } from './services/knowledge.js';
import { createAnalytics, createPortal } from './services/analytics.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerLawyerRoutes } from './routes/lawyer.js';
// ── الإصدار 9 ──
import fs from 'node:fs';
import { createIntegrations } from './services/integrations.js';
import { createAudit, createJobs } from './services/platform.js';
import { createSystem } from './services/system.js';
import { createAccounts } from './services/accounts.js';
import { createMessaging } from './services/messaging.js';
import { createPractice } from './services/practice.js';
import { createPrograms } from './services/programs.js';
import { createDownloads } from './services/downloads.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerAccountsRoutes } from './routes/accounts.js';
import { registerMessagingRoutes } from './routes/messaging.js';
import { registerPracticeRoutes } from './routes/practice.js';
import { registerAiRoutes } from './routes/ai.js';
import { registerProgramsRoutes } from './routes/programs.js';
import { registerSite } from './site.js';
import { secureDataDir } from './secure-fs.js';
// v9.1 l-home: «اليوم» للمحامي وتنبيهاته على واتساب وتنبيهات الجهاز
import { createLawyerToday } from './services/lawyer-today.js';
import { createLawyerAlerts } from './services/lawyer-alerts.js';
import { createWebPush } from './services/web-push.js';
import { registerLawyerHomeRoutes } from './routes/lawyer-home.js';
// v9.2 (admin-ai): القصص الواردة ونصوص الرسائل الصوتية
import { createStories } from './services/stories.js';
import { createVoice } from './services/voice.js';
import { createBrand } from './brand.js';
import { registerBrandRoutes } from './routes/brand.js';
// v10 b2b-server: خدمة الشركات (حسابات منفصلة، بوابة /company، مسارات فريق المكتب)
import { createEmail } from './services/email.js';
import { createCompanies } from './services/companies.js';
import { createCompanyBilling } from './services/company-billing.js';
import { createCompanyNotify } from './services/company-notify.js';
import { createCompanyAuth } from './company-auth.js';
import { registerCompanyRoutes } from './routes/company.js';
import { registerAdminCompanyRoutes } from './routes/admin-companies.js';
import { createCompanyDocGate } from './services/company-doc-gate.js'; // v10 b2b-server (L-56)
import { createCompanyMemory } from './services/company-memory.js';
import { createCompanyRequests } from './services/company-requests.js';

const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const DEFAULT_LIMIT = 1024 * 1024; // 1MB لطلبات JSON العادية

export function createApp(config, { logger = console } = {}) {
  const app = { config, version: PKG.version };
  app.log = (msg, err) => {
    if (config.silent) return;
    logger.error(`[${new Date().toISOString()}] ${msg}`, err && err.stack ? err.stack : err ?? '');
  };
  // مجلد البيانات (قاعدة البيانات، المرفقات، النسخ الاحتياطية، مفتاح التشفير) لمالك العملية فقط: 0700
  if (config.dbPath !== ':memory:') secureDataDir(config.dataDir || path.dirname(config.dbPath));
  app.db = new Db(config.dbPath);
  app.events = createEvents(app.log);
  app.settings = createSettings(app);
  app.brand = createBrand(app); // v9.2 ألوان المؤسسة
  // ── البنية المشتركة (الإصدار 9) ──
  app.audit = createAudit(app);
  app.jobs = createJobs(app);
  app.integrations = createIntegrations(app);
  // كل وحدة تضيف حقولها إلى /api/meta: app.metaProviders.push(() => ({ ... }))
  app.metaProviders = [];
  // صفحات عامة ديناميكية: app.pageHandlers.set('/sitemap.xml', (req, res, url) => true)
  app.pageHandlers = new Map();
  app.activity = createActivity(app);
  app.notifications = createNotifications(app);
  app.auth = createAuth(app);
  app.documents = createDocuments(app);
  app.voice = createVoice(app); // v9.2: نصوص الرسائل الصوتية (تكتبها الإدارة)
  app.clients = createClients(app);
  app.whatsapp = createWhatsApp(config, app.log, app);
  app.engine = createEngine(app);
  app.ai = createAi(app);
  app.visibility = createVisibility(app);
  app.cases = createCases(app);
  app.intakes = createIntakes(app);
  app.requests = createRequests(app);
  app.opinions = createOpinions(app);
  app.accounting = createAccounting(app);
  app.lawyers = createLawyers(app);
  app.matters = createMatters(app);
  app.automations = createAutomations(app);
  app.knowledge = createKnowledge(app);
  app.analytics = createAnalytics(app);
  app.portal = createPortal(app);
  app.system = createSystem(app);
  app.accounts = createAccounts(app);
  app.messaging = createMessaging(app);
  app.practice = createPractice(app);
  app.programs = createPrograms(app);
  app.stories = createStories(app); // v9.2: القصص الواردة ← ملخص ومسار مقترح ← طلب بنقرة
  // v10 b2b-server: البريد، الشركات، الباقات والاستخدام، إشعارات البوابة، ودخول مستخدمي الشركات (جهة منفصلة عن users)
  app.email = createEmail(app);
  app.companies = createCompanies(app);
  app.companyBilling = createCompanyBilling(app);
  app.companyNotify = createCompanyNotify(app);
  app.companyAuth = createCompanyAuth(app);
  app.companyDocGate = createCompanyDocGate(app); // v10 b2b-server: بوابة المستندات، الذاكرة، طلبات الشركات
  app.companyMemory = createCompanyMemory(app);
  app.companyRequests = createCompanyRequests(app);
  // v9.1 l-home
  app.lawyerToday = createLawyerToday(app);
  app.webPush = createWebPush(app);
  app.lawyerAlerts = createLawyerAlerts(app);
  app.limiters = {
    publicIntake: new RateLimiter({ windowMs: 60 * 60 * 1000, max: config.publicIntakePerHour || 20 }),
    // حد لكل رقم هاتف أيًا كان عنوان IP: يمنع إغراق رقم عميل بطلبات (وتكلفة التحليل الآلي لها)
    publicIntakePhone: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 10 }),
    portal: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 }),
    // v9.2 [R2-A15]: «لخّصها الآن» وتسجيل المكالمة ومحاولاتها والإغلاق ونقل الرسائل (60 في الساعة لكل موظف)، ونصوص الرسائل الصوتية (120)
    storyNow: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 }),
    transcript: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 120 }),
    // [بوابة 9.2 S4] «حلّل الآن» (يتجاوز الحد اليومي للقصة): 60 في الساعة لكل موظف
    analyzeNow: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 }),
  };

  // ربط الأحداث بين الوحدات (داخل نفس المعاملة)
  app.events.on('assignment.approved', (p) => app.accounting.onAssignmentApproved(p));
  app.events.on('case.closed', (p) => app.accounting.onCaseClosed(p));
  app.events.on('case.closed', (p) => app.knowledge.buildFromCase(p.caseId));

  app.automations.ensureRules();

  const router = new Router();
  // روابط تنزيل لمرة واحدة للملفات الحساسة (POST يصدر الرابط، GET /api/download يرسل الملف)
  app.downloads = createDownloads(app);
  app.downloads.mount(router);
  registerPublicRoutes(router, app);
  registerAdminRoutes(router, app);
  registerLawyerRoutes(router, app);
  registerSystemRoutes(router, app);
  registerAccountsRoutes(router, app);
  registerMessagingRoutes(router, app);
  registerPracticeRoutes(router, app);
  registerAiRoutes(router, app);
  registerProgramsRoutes(router, app);
  registerLawyerHomeRoutes(router, app); // v9.1 l-home
  registerBrandRoutes(router, app); // v9.2
  registerCompanyRoutes(router, app); // v10 b2b-server: /api/company/* وصفحة /company
  registerAdminCompanyRoutes(router, app); // v10 b2b-server: مسارات فريق المكتب لخدمة الشركات
  registerSite(app);
  app.router = router;

  const pub = config.publicDir;
  const pages = {
    '/': path.join(pub, 'index.html'),
    '/intake': path.join(pub, 'intake.html'),
    '/app': path.join(pub, 'app.html'),
    // صفحات الإصدار 9 العامة (تُنشئها وحداتها)
    '/privacy': path.join(pub, 'privacy.html'),
    '/terms': path.join(pub, 'terms.html'),
    '/data-deletion': path.join(pub, 'data-deletion.html'),
    '/about': path.join(pub, 'about.html'),
    '/portal': path.join(pub, 'portal-login.html'),
    '/setup': path.join(pub, 'setup.html'),
  };

  function clientIp(req) {
    // خلف وكيل عكسي موثوق يمكن ضبط TRUST_PROXY لاستخدام X-Forwarded-For.
    // نأخذ العنوان الذي أضافه وكيلنا (من اليمين) لا أول عنوان، فالعميل يستطيع كتابة ما يشاء في بداية الترويسة.
    // TRUST_PROXY_HOPS = عدد الوكلاء الموثوقين المتتابعين (مثل CDN ثم nginx = 2).
    if (process.env.TRUST_PROXY === '1') {
      const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      const hops = Math.max(1, Number(process.env.TRUST_PROXY_HOPS) || 1);
      const xf = parts.length >= hops ? parts[parts.length - hops] : '';
      if (xf) return xf;
    }
    return req.socket.remoteAddress || 'unknown';
  }

  function checkCsrf(req, pathname) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (pathname.startsWith('/webhooks/')) return;
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().startsWith('application/json')) {
      throw new ApiError(415, 'يجب إرسال البيانات بصيغة JSON', 'unsupported_media_type');
    }
    const origin = req.headers.origin;
    // Origin: null (iframe معزول أو data:) يُعامل كمصدر خارجي
    if (origin === 'null') throw forbidden('مصدر الطلب غير مسموح');
    if (origin) {
      let host;
      try {
        host = new URL(origin).host;
      } catch {
        throw forbidden('مصدر الطلب غير صالح');
      }
      const expected = req.headers['x-forwarded-host'] && process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-host'] : req.headers.host;
      if (host !== expected) throw forbidden('مصدر الطلب غير مسموح');
    }
  }

  async function handleApi(req, res, url) {
    const pathname = url.pathname;
    const m = router.match(req.method, pathname);
    if (!m) return sendJson(res, 404, { error: 'المسار غير موجود', code: 'not_found' });
    if (m.methodNotAllowed) return sendJson(res, 405, { error: 'الطريقة غير مسموح بها', code: 'method_not_allowed' });
    const ctx = {
      req,
      res,
      app,
      params: m.params,
      query: Object.fromEntries(url.searchParams),
      cookies: parseCookies(req.headers.cookie),
      ip: clientIp(req),
      user: null,
      status: 200,
    };
    let releaseGate = null; // v10 b2b-server (L-27): حارس قبل قراءة الجسم (≤ 4 أجسام رفع في الوقت نفسه)
    try {
      checkCsrf(req, pathname);
      ctx.user = app.auth.userFromRequest(ctx);
      if (m.route.opts.gate) releaseGate = m.route.opts.gate(ctx);
      if (!['GET', 'HEAD'].includes(req.method)) {
        const raw = await readBody(req, m.route.opts.limit || DEFAULT_LIMIT);
        ctx.rawBody = raw;
        if (m.route.opts.raw) ctx.body = null;
        else if (raw.length) {
          try {
            ctx.body = JSON.parse(raw.toString('utf8'));
          } catch {
            throw badRequest('صيغة JSON غير صالحة');
          }
          if (ctx.body === null || typeof ctx.body !== 'object' || Array.isArray(ctx.body)) throw badRequest('جسم الطلب يجب أن يكون كائن JSON');
        } else ctx.body = {};
      } else ctx.body = {};
      const result = await m.route.handler(ctx);
      // المعالجات التي ترسل الرد بنفسها (تنزيل الملفات) تضبط ctx.streamed
      if (ctx.streamed || res.writableEnded || res.headersSent) return;
      if (ctx.text !== undefined) {
        res.statusCode = ctx.status;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(String(ctx.text));
        return;
      }
      sendJson(res, ctx.status || 200, result === undefined ? { ok: true } : result);
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendError(res, err, app.log);
    } finally {
      if (typeof releaseGate === 'function') releaseGate();
    }
  }

  async function handle(req, res) {
    securityHeaders(res);
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'رابط غير صالح', code: 'bad_request' });
    }
    const pathname = url.pathname;
    // وضع الإعداد الأول (وحدة platform): 503 لكل /api عدا مسارات الإعداد و/api/meta، وتحويل /app إلى /setup
    if (app.system?.gate?.(req, res, url)) return;
    if (pathname.startsWith('/api/') || pathname.startsWith('/webhooks/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'الطريقة غير مسموح بها', code: 'method_not_allowed' });
    if (app.pageHandlers.has(pathname)) {
      const handled = await app.pageHandlers.get(pathname)(req, res, url);
      if (handled !== false) return;
    }
    if (pages[pathname]) return sendFile(req, res, pages[pathname]) || notFoundPage(res);
    // كل روابط /p/… (حتى المقطوعة عند نسخها من واتساب) تفتح صفحة المتابعة، وهي تعرض «تعذر فتح صفحة المتابعة»
    // مع رقم المؤسسة و«الدخول برقم الموبايل» بدل صفحة 404 عامة
    if (/^\/p\/[^/]{0,200}\/?$/.test(pathname)) {
      // الرمز في الرابط سر: لا يُرسل في Referer لأي موقع آخر، ولا تُفهرس الصفحة ولا تُخزَّن
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      // (v9 site) نفس رأس الموقع العام وتذييله إن استخدمهما القالب؛ المسار الظاهر في الوسوم /portal بلا الرمز
      // (إصلاح 9.1، B91-11) بيانات صفحتها (نفس رد GET /api/portal/<رمز>) داخل الصفحة نفسها ككتلة JSON لا تُنفَّذ:
      // رحلة كاملة أقل على شبكة بطيئة (لا انتظار للوحدات ثم طلب ثانٍ). الصفحة no-store وبلا Referer، والرمز في الرابط أصلًا.
      // رمز غير صالح: لا بيانات، فتطلبها الصفحة وتعرض «تعذر فتح صفحة المتابعة» كما كانت.
      const tok = req.method === 'GET' ? /^\/p\/([A-Za-z0-9_-]{20,100})\/?$/.exec(pathname) : null;
      let headExtra = '';
      if (tok && app.portal?.view) {
        try {
          const access = app.clients.portalAccess(tok[1]);
          // رابط منتهٍ أو ملغى: علامة فقط فتعرض الصفحة «تعذر فتح صفحة المتابعة» دون طلب يرد 404
          const data = access ? app.portal.view(access.client, access.intakeId, { phone: access.phone }) : { invalid: true };
          if (data) headExtra = `<script type="application/json" id="bm-portal-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
        } catch {
          headExtra = '';
        }
      }
      if (app.site?.servePage?.(req, res, 'portal.html', '/portal', { optIn: true, noindex: true, noStore: true, headExtra })) return;
      return sendFile(req, res, path.join(pub, 'portal.html')) || notFoundPage(res);
    }
    if (pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (pathname.endsWith('.html') && pathname !== '/index.html') {
      // الصفحات تُخدم بمساراتها النظيفة فقط
      return notFoundPage(res);
    }
    if (serveStatic(req, res, pub, pathname)) return;
    notFoundPage(res);
  }

  function notFoundPage(res) {
    // صفحة 404 بهوية الموقع العام (الرأس والتذييل ورقم المؤسسة وروابط «متابعة طلبك» و«قدّم طلبًا») من القالب public/404.html
    const req = res.req;
    if (app.site?.renderPage && req) {
      try {
        const html = app.site.renderPage('404.html', req, '/404', { noindex: true });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        sendBody(res, 404, html, { req });
        return true;
      } catch (e) {
        if (e?.code !== 'ENOENT') app.log('404 page render failed', e);
      }
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة غير موجودة</title>' +
        '<style>body{font-family:Tahoma,sans-serif;background:#f6f7f8;color:#1d2a30;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}a{color:#0b5a3c}</style></head>' + // v10 experience: H-E4
        '<body><main><h1>الصفحة غير موجودة</h1><p>تأكد من الرابط أو عد إلى <a href="/">الصفحة الرئيسية</a>.</p></main></body></html>',
    );
    return true;
  }

  // صفحة 404 الموحدة (تستخدمها الوحدات الأخرى، مثل /setup بعد انتهاء الإعداد)
  app.notFoundPage = notFoundPage;

  app.server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      app.log('unhandled', e);
      if (!res.headersSent) sendJson(res, 500, { error: 'حدث خطأ غير متوقع', code: 'server_error' });
    });
  });

  // المجدول: الأتمتة + إرسال الرسائل العالقة + تنظيف الجلسات
  let timer = null;
  app.startScheduler = () => {
    if (timer || !config.schedulerIntervalSeconds) return;
    const tick = async () => {
      try {
        app.automations.runAll();
        app.auth.purgeExpired();
        await app.engine.flushQueue();
        await app.jobs.runDue();
      } catch (e) {
        app.log('scheduler', e);
      }
    };
    timer = setInterval(tick, config.schedulerIntervalSeconds * 1000);
    timer.unref?.();
    setTimeout(tick, 2000).unref?.();
  };

  app.close = () =>
    new Promise((resolve) => {
      if (timer) clearInterval(timer);
      app.ai.cancelTimers();
      app.stories?.cancelTimers(); // v9.2: مؤقتات «السكوت» للقصص
      const done = () => {
        try {
          app.db.close();
        } catch {
          // مغلقة بالفعل
        }
        resolve();
      };
      if (app.server.listening) app.server.close(done);
      else done();
      app.server.closeAllConnections?.();
    });

  return app;
}
