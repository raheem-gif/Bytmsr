// الإصدار 9.1 — مسار l-home: «اليوم» للمحامي، تنبيهات واتساب والجهاز، ورابط إعادة التعيين الذاتي على واتساب.
// كل مسار هنا يتحقق من الدور على الخادم: «اليوم» والتنبيهات للمحامين فقط، ولا يعيد أي بيانات عن المستفيدين.
import fs from 'node:fs';
import path from 'node:path';
import { requireLawyer, requireUser, RateLimiter } from '../auth.js';
import { nowIso, addHours, sha256 } from '../util.js';
import { SESSION_COOKIE } from '../auth.js';
import { assetVersion, sendBody } from '../http.js';
import { CSS_LAZY } from '../app-page-assets.js';

/** الرد الموحد لطلب رابط إعادة التعيين (لا يكشف وجود الحساب ولا ربطه بواتساب) */
export const RESET_REQUEST_REPLY = 'إن كان الحساب مسجلًا برقم واتساب فسيصله رابط خلال دقيقة.';
export const SELF_RESET_MINUTES = 30;

export function registerLawyerHomeRoutes(router, app) {
  const L = (fn) => (ctx) => fn(ctx, requireLawyer(ctx));
  const U = (fn) => (ctx) => fn(ctx, requireUser(ctx));
  const sessionHash = (ctx) => (ctx.cookies?.[SESSION_COOKIE] ? sha256(ctx.cookies[SESSION_COOKIE]) : null);
  const resetIpLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const resetAccountLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
  registerAppPage(app);

  // ── «اليوم» (L-01) ──
  router.get('/api/lawyer/today', L((ctx, u) => {
    app.lawyerAlerts?.noteRequest(ctx);
    return app.lawyerToday.forLawyer(u);
  }));

  // ── تنبيهات واتساب (L-06) ──
  router.post('/api/account/alerts/test', L((ctx, u) => app.lawyerAlerts.sendTest(u)));

  // ── تنبيهات الجهاز (L-20) ──
  router.get('/api/account/push-subscription', U((ctx, u) => app.webPush.status(u, sessionHash(ctx))));
  router.post('/api/account/push-subscription', L((ctx, u) => app.webPush.subscribe(u, sessionHash(ctx), ctx.body, ctx.req.headers['user-agent'])));
  router.delete('/api/account/push-subscription', U((ctx, u) => app.webPush.unsubscribe(u, sessionHash(ctx), ctx.body)));

  // ── «نسيت كلمة المرور؟» ← رابط على واتساب (L-21) ──
  // للمحامين المشتركين في تنبيهات واتساب فقط، وبنفس الرد دائمًا. الرابط صالح 30 دقيقة ويُنهي كل الجلسات عند استخدامه
  // (سلوك رابط إعادة التعيين الحالي). الرابط سر: لا يُحفظ في صندوق الصادر (يُمرَّر للإرسال فقط).
  router.post('/api/auth/reset-request', (ctx) => {
    resetIpLimiter.hit(`ip:${ctx.ip}`);
    const username = String(ctx.body?.username || '').trim().slice(0, 100);
    if (!username) return { ok: true, message: RESET_REQUEST_REPLY };
    try {
      resetAccountLimiter.hit(`u:${username.toLowerCase()}`);
    } catch {
      return { ok: true, message: RESET_REQUEST_REPLY };
    }
    try {
      sendSelfReset(ctx, username);
    } catch (e) {
      if (!(e && e.status)) app.log('self reset failed', e);
    }
    return { ok: true, message: RESET_REQUEST_REPLY };
  });

  function sendSelfReset(ctx, username) {
    const { db, config } = app;
    const u = db.get("SELECT * FROM users WHERE username = ? AND role = 'lawyer' AND active = 1 AND invite_pending = 0 AND alert_whatsapp = 1", username);
    if (!u || !u.phone) return;
    if (!app.lawyerAlerts.available()) return;
    // الرابط المطلق من PUBLIC_BASE_URL فقط (لا من ترويسة Host التي يتحكم فيها الطالب)؛ في النسخة التجريبية من Host
    const host = String(ctx.req?.headers?.host || '');
    const base = config.publicBaseUrl || (config.demo && /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host) ? `http://${host}` : '');
    if (!base) return;
    const payload = app.accounts.issueResetLink(u.id, null, ctx);
    const expires = addHours(nowIso(), SELF_RESET_MINUTES / 60);
    db.run("UPDATE account_tokens SET expires_at = ? WHERE id = (SELECT MAX(id) FROM account_tokens WHERE user_id = ? AND kind = 'reset')", expires, u.id);
    const token = String(payload.url).split('#/reset/')[1] || '';
    const url = `${base}/app#/reset/${token}`;
    const text = `رابط تعيين كلمة مرور جديدة لحسابك على منصة الدعم القانوني، صالح 30 دقيقة: ${url} — إن لم تطلبه فتجاهل هذه الرسالة.`;
    const stored = 'رابط تعيين كلمة مرور جديدة لحسابك على منصة الدعم القانوني، صالح 30 دقيقة. (الرابط لا يُحفظ في صندوق الصادر)';
    app.engine.record({
      client_id: null,
      channel: 'whatsapp',
      to: u.phone,
      body: stored,
      automated: true,
      rule: 'lawyer_alert',
      meta: { wa: { purpose: 'lawyer_alert', force_template: true }, vars: { body: stored }, lawyer_alert: { type: 'password_reset' } },
      secret: { text, vars: { body: text } },
    });
    app.audit?.log({ actor: u, ctx, type: 'account.password_reset_link', severity: 'warning', summary: `طلب رابط إعادة تعيين كلمة المرور ذاتيًا عبر واتساب لحساب «${u.username}» (صالح 30 دقيقة)`, data: { target_user_id: u.id, self_service: true, expires_at: expires } });
  }
}

// ───────── صفحة المنصة /app (L-07): أرقام إصدار الملفات وروابط modulepreload وقابلة للتخزين في عامل الخدمة ─────────
// كل رابط CSS/JS/خط في app.html يُضاف له رقم إصداره (?v=…) فيُخزَّن في المتصفح سنة كاملة، ومع رقم الإصدار يعيد الخادم
// كتابة استيرادات الوحدات بأرقامها (src/site-assets.js — مسار b-site) فتتطابق روابط modulepreload مع الاستيرادات.
// الصفحة نفسها بلا أي بيانات شخصية: «no-cache» (لا no-store) حتى يخزّنها عامل الخدمة ويعيد التحقق منها.
let siteAssets = null;
import('../site-assets.js')
  .then((m) => {
    siteAssets = m;
  })
  .catch(() => {});

// أوراق الأنماط الأساسية في app.html تُجمع في ملفين (قبل أوراق الإدارة المؤجلة وبعدها في ترتيبها الأصلي) فتصل
// بطلبين بدل عشرة على شبكة HTTP/1.1 بطيئة (6 اتصالات فقط لكل خادم)، وكل ملف برقم إصدار من محتواه (immutable).
const BUNDLE_A = new Set(['v9-site', 'app']);
const bundles = new Map(); // الاسم ← { key, version, body }

/**
 * يحذف تعليقات CSS (/* … *\/) والمسافات في بدايات الأسطر ونهاياتها، دون لمس النصوص المقتبسة.
 * التعليقات العربية تشغل نحو خُمس الملفات المضغوطة؛ ولا يتغير أي قاعدة (السطر الجديد يبقى فاصلًا).
 */
export function stripCss(src) {
  const out = [];
  let i = 0;
  let from = 0;
  const n = src.length;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c === 47 /* / */ && src.charCodeAt(i + 1) === 42 /* * */) {
      out.push(src.slice(from, i));
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      from = i;
      continue;
    }
    if (c === 34 || c === 39) {
      // نص مقتبس: يُنسخ كما هو حتى علامة الإغلاق (مع تخطي المحارف المهربة) أو نهاية السطر
      let j = i + 1;
      while (j < n) {
        const d = src.charCodeAt(j);
        if (d === 92) j += 2;
        else if (d === c || d === 10) break;
        else j += 1;
      }
      i = j + 1;
      continue;
    }
    i += 1;
  }
  out.push(src.slice(from));
  return out
    .join('')
    .replace(/[ \t]*\r?\n[ \t\r\n]*/g, '\n')
    .trim();
}

function cssSource(pub, name) {
  const file = path.join(pub, 'assets/css', `${name}.css`);
  try {
    const t = siteAssets?.transformAsset ? siteAssets.transformAsset(file) : null;
    return stripCss((t ? t.toString('utf8') : fs.readFileSync(file, 'utf8')).replace(/@charset[^;]*;/gi, ''));
  } catch {
    return null;
  }
}

/** محتوى ملف مجمّع ورقم إصداره (يُعاد بناؤه عند تغيّر أي ملف فيه) */
function bundleOf(app, bundleName, names) {
  const pub = app.config.publicDir;
  const key = names
    .map((n) => {
      try {
        const st = fs.statSync(path.join(pub, 'assets/css', `${n}.css`));
        return `${n}:${st.size}:${Math.floor(st.mtimeMs)}`;
      } catch {
        return `${n}:-`;
      }
    })
    .join('|');
  const hit = bundles.get(bundleName);
  if (hit && hit.key === key) return hit;
  if (siteAssets?.setPublicRoot) siteAssets.setPublicRoot(pub);
  const body = names
    .map((n) => {
      const src = cssSource(pub, n);
      return src == null ? '' : `/* ${n}.css */\n${src}\n`;
    })
    .join('\n');
  const out = { key, names, body, version: sha256(body).slice(0, 10) };
  bundles.set(bundleName, out);
  return out;
}

// صفحات يفتحها المحامي غالبًا من رابط مباشر (إشعار أو تنبيه واتساب)
const LAWYER_PAGE_MODULES = ['app/pages/lawyer', 'app/pages/account.js', 'app/pages/notifications.js'];
function lawyerPageGraph(pub, present) {
  const graph = {};
  if (!siteAssets?.preloadClosure) return graph;
  const jsRoot = path.join(pub, 'assets/js');
  const files = [];
  for (const entry of LAWYER_PAGE_MODULES) {
    const full = path.join(jsRoot, entry);
    try {
      if (entry.endsWith('.js')) files.push(full);
      else for (const f of fs.readdirSync(full)) if (f.endsWith('.js')) files.push(path.join(full, f));
    } catch {
      /* مجلد أو ملف غير موجود */
    }
  }
  for (const file of files) {
    try {
      const v = assetVersion(file);
      if (!v) continue;
      const rel = path.relative(jsRoot, file).split(path.sep).join('/');
      const urls = [`/assets/js/${rel}?v=${v}`, ...siteAssets.preloadClosure(file, pub)].filter((u) => !present.has(u));
      if (urls.length) graph[rel] = urls;
    } catch {
      /* بلا قائمة لهذه الصفحة */
    }
  }
  return graph;
}

export function renderAppHtml(app, { withShell = true } = {}) {
  const pub = app.config.publicDir;
  const file = path.join(pub, 'app.html');
  let html;
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  if (siteAssets?.setPublicRoot) siteAssets.setPublicRoot(pub);
  // بلا جلسة: لا تحميل مسبق لهيكل التطبيق (data-session-only) يزاحم شاشة الدخول على شبكة بطيئة؛
  // ومع كعكة جلسة: الهيكل مطلوب لأي صفحة فيُحمَّل بأولوية عادية، وشاشة الدخول غالبًا لن تظهر (تُحمَّل عند الحاجة)
  // فلا تأخذ اتصالًا من ستة على HTTP/1.1
  if (!withShell) html = html.replace(/^[ \t]*<link rel="modulepreload"[^>]*data-session-only="1"[^>]*>\r?\n/gm, '');
  else {
    html = html.replace(/ data-session-only="1"/g, '');
    html = html.replace(/^[ \t]*<link rel="modulepreload" href="\/assets\/js\/app\/pages\/login\.js" \/>\r?\n/m, '');
  }
  // 1) أوراق الأنماط المحلية بترتيبها ← ملفان مجمّعان
  const sheetRe = /^[ \t]*<link rel="stylesheet" href="\/assets\/css\/([\w.-]+)\.css" \/>[ \t]*\r?\n/gm;
  const names = [];
  for (const m of html.matchAll(sheetRe)) {
    if (fs.existsSync(path.join(pub, 'assets/css', `${m[1]}.css`))) names.push(m[1]);
  }
  const groupA = names.filter((n) => BUNDLE_A.has(n));
  const groupB = names.filter((n) => !BUNDLE_A.has(n));
  let firstSheet = true;
  html = html.replace(sheetRe, (m, name) => {
    if (!names.includes(name)) return ''; // ملف غير موجود (ورقة مسار آخر لم تُنشأ بعد): لا رابط مكسور
    if (!firstSheet) return '';
    firstSheet = false;
    const links = [];
    for (const [bn, list] of [['bundle-a', groupA], ['bundle-b', groupB]]) {
      if (!list.length) continue;
      const b = bundleOf(app, bn, list);
      links.push(`    <link rel="stylesheet" href="/assets/css/${bn}.css?v=${b.version}" data-sheets="${list.join(' ')}" />\n`);
    }
    return links.join('');
  });
  // 2) أرقام إصدار JS والخط
  const versioned = (url) => {
    const v = assetVersion(path.join(pub, url));
    return v ? `${url}?v=${v}` : url;
  };
  const present = new Set();
  html = html.replace(/\b(href|src)="(\/assets\/(?:js|fonts)\/[^"?#]+\.(?:js|woff2))"/g, (m, attr, url) => {
    const u = versioned(url);
    present.add(u);
    return `${attr}="${u}"`;
  });
  // 3) بقية الوحدات: ما تستورده main.js ثم — لمن يحمل كعكة جلسة فقط (شاشة الدخول لا تحتاجه) — هيكل التطبيق
  const extra = [];
  if (siteAssets?.preloadClosure) {
    for (const entry of ['assets/js/app/main.js', withShell && 'assets/js/app/shell.js'].filter(Boolean)) {
      try {
        for (const u of siteAssets.preloadClosure(path.join(pub, entry), pub)) {
          if (present.has(u)) continue;
          present.add(u);
          extra.push(`<link rel="modulepreload" href="${u}" />`);
        }
      } catch {
        /* بلا روابط إضافية */
      }
    }
  }
  const css = {};
  for (const name of CSS_LAZY) {
    const v = assetVersion(path.join(pub, 'assets/css', `${name}.css`));
    if (v) css[name] = v;
  }
  // sid: الطلب يحمل كعكة جلسة (تلميح أداء فقط: تطلب الواجهة نسخة meta الكاملة مباشرة بدل نسخة شاشة الدخول)
  // graph: لمن يحمل جلسة، ما تستورده كل صفحة من صفحات المحامي (عدا ما حُمّل مسبقًا) فيطلبه رابط إشعار دفعة واحدة
  const info = { css };
  if (withShell) {
    info.sid = 1;
    const graph = lawyerPageGraph(pub, present);
    if (Object.keys(graph).length) info.graph = graph;
  }
  const data = JSON.stringify(info).replace(/</g, '\\u003c');
  // كتلة البيانات أول الرأس (يقرؤها boot-early.js فور تنفيذه)، ثم — لمن يحمل جلسة — سكربت صغير (async) يبدأ طلب الجلسة
  // وبيانات الصفحة ووحداتها قبل وصول شجرة وحدات التطبيق؛ أول الرأس حتى يأخذ اتصالًا قبل بقية الملفات (ستة فقط على HTTP/1.1)
  const top = [`<script type="application/json" id="bm-assets">${data}</script>`];
  if (withShell && fs.existsSync(path.join(pub, 'assets/js/app/boot-early.js'))) {
    top.push(`<script src="${versioned('/assets/js/app/boot-early.js')}" async fetchpriority="high"></script>`);
  }
  const head = /<meta name="viewport"[^>]*>\r?\n/;
  html = head.test(html) ? html.replace(head, (m) => `${m}    ${top.join('\n    ')}\n`) : html.replace('<!--bm:preload-->', `${top.join('\n    ')}\n    <!--bm:preload-->`);
  return html.replace('<!--bm:preload-->', extra.join('\n    '));
}

function registerAppPage(app) {
  const handler = (req, res) => {
    const html = renderAppHtml(app, { withShell: /(?:^|;\s*)bm_sid=/.test(String(req.headers.cookie || '')) });
    if (html == null) return false;
    const etag = `W/"app-${sha256(html).slice(0, 16)}"`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    const inm = String(req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some((x) => x.trim() === etag)) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    sendBody(res, 200, html, { req });
    return true;
  };
  app.pageHandlers.set('/app', handler);
  app.pageHandlers.set('/app/', handler);
  // الملفان المجمّعان: بنفس ترتيب app.html (يُبنيان عند أول طلب للصفحة أو الملف)
  for (const bn of ['bundle-a', 'bundle-b']) {
    app.pageHandlers.set(`/assets/css/${bn}.css`, (req, res, url) => {
      if (!bundles.has(bn)) renderAppHtml(app);
      const b = bundles.get(bn);
      if (!b) return false;
      const fresh = bundleOf(app, bn, b.names);
      const v = url?.searchParams?.get('v');
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
      res.setHeader('Cache-Control', v && v === fresh.version ? 'public, max-age=31536000, immutable' : 'no-cache');
      const etag = `W/"css-${fresh.version}"`;
      res.setHeader('ETag', etag);
      if (String(req.headers['if-none-match'] || '').split(',').some((x) => x.trim() === etag)) {
        res.statusCode = 304;
        res.end();
        return true;
      }
      sendBody(res, 200, fresh.body, { req, cacheKey: `${bn}:${fresh.version}` });
      return true;
    });
  }
}
