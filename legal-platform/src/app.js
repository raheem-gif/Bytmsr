// تجميع التطبيق: قاعدة البيانات، الخدمات، المسارات، خادم HTTP، والمجدول.
import http from 'node:http';
import path from 'node:path';
import { Db } from './db.js';
import { Router, sendJson, sendError, readBody, parseCookies, securityHeaders, serveStatic, sendFile } from './http.js';
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

const DEFAULT_LIMIT = 1024 * 1024; // 1MB لطلبات JSON العادية

export function createApp(config, { logger = console } = {}) {
  const app = { config };
  app.log = (msg, err) => {
    if (config.silent) return;
    logger.error(`[${new Date().toISOString()}] ${msg}`, err && err.stack ? err.stack : err ?? '');
  };
  app.db = new Db(config.dbPath);
  app.events = createEvents(app.log);
  app.settings = createSettings(app);
  app.activity = createActivity(app);
  app.notifications = createNotifications(app);
  app.auth = createAuth(app);
  app.documents = createDocuments(app);
  app.clients = createClients(app);
  app.whatsapp = createWhatsApp(config, app.log);
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
  app.limiters = {
    publicIntake: new RateLimiter({ windowMs: 60 * 60 * 1000, max: config.publicIntakePerHour || 20 }),
    portal: new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 }),
  };

  // ربط الأحداث بين الوحدات (داخل نفس المعاملة)
  app.events.on('assignment.approved', (p) => app.accounting.onAssignmentApproved(p));
  app.events.on('case.closed', (p) => app.accounting.onCaseClosed(p));
  app.events.on('case.closed', (p) => app.knowledge.buildFromCase(p.caseId));

  app.automations.ensureRules();

  const router = new Router();
  registerPublicRoutes(router, app);
  registerAdminRoutes(router, app);
  registerLawyerRoutes(router, app);
  app.router = router;

  const pub = config.publicDir;
  const pages = {
    '/': path.join(pub, 'index.html'),
    '/intake': path.join(pub, 'intake.html'),
    '/app': path.join(pub, 'app.html'),
  };

  function clientIp(req) {
    // خلف وكيل عكسي موثوق يمكن ضبط TRUST_PROXY لاستخدام X-Forwarded-For
    if (process.env.TRUST_PROXY === '1') {
      const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
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
    try {
      checkCsrf(req, pathname);
      ctx.user = app.auth.userFromRequest(ctx);
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
    if (pathname.startsWith('/api/') || pathname.startsWith('/webhooks/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'الطريقة غير مسموح بها', code: 'method_not_allowed' });
    if (pages[pathname]) return sendFile(req, res, pages[pathname]) || notFoundPage(res);
    if (/^\/p\/[A-Za-z0-9_-]{20,100}\/?$/.test(pathname)) {
      res.setHeader('Referrer-Policy', 'no-referrer');
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
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة غير موجودة</title>' +
        '<style>body{font-family:Tahoma,sans-serif;background:#f6f7f8;color:#1d2a30;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}a{color:#0f4c5c}</style></head>' +
        '<body><main><h1>الصفحة غير موجودة</h1><p>تأكد من الرابط أو عد إلى <a href="/">الصفحة الرئيسية</a>.</p></main></body></html>',
    );
    return true;
  }

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
