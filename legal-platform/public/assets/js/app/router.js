// موجّه يعتمد على hash: #/cases/12?tab=docs

import { h, mount } from '../lib/h.js';
import { loading, errorState, pageHeader, emptyState, button, closeAllModals } from '../lib/ui.js';
import { prefetchGet } from '../lib/api.js'; // v9.1 l-home (L-07)

let routes = [];
let config = null;
let renderSeq = 0;
let started = false;

function compile(def) {
  const keys = [];
  const pattern = def.path
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => {
      keys.push(k);
      return '/([^/]+)';
    });
  return { ...def, keys, re: new RegExp(`^${pattern}/?$`) };
}

/**
 * يسجل المسارات. كل مسار: { path: '/cases/:id', load: () => import(...), roles?: [...], title?, guard?(ctx) }
 * v9.1 l-home (اختيارية): css: [...] أوراق تُحمَّل قبل العرض، prefetch(ctx) → Promise في ctx.prefetched،
 * prefetchGet(ctx) → مسار GET يُطلب مبكرًا، skeleton(ctx) → عنصر يُعرض أثناء التحميل، lawyerTitle.
 */
export function defineRoutes(defs) {
  routes = defs.map(compile);
  return routes;
}

/** يعيد المسارات المسجلة. */
export function getRoutes() {
  return routes;
}

/** يحلل hash إلى { path, query }. */
export function parseHash(hash = window.location.hash) {
  let raw = String(hash || '').replace(/^#!?/, '');
  if (!raw.startsWith('/')) raw = `/${raw}`;
  const qi = raw.indexOf('?');
  const path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : ''));
  return { path, query };
}

/** يطابق مسارًا ويعيد { route, params } أو null. */
export function matchRoute(path) {
  for (const route of routes) {
    const m = route.re.exec(path);
    if (m) {
      const params = {};
      route.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { route, params };
    }
  }
  return null;
}

/** يبني hash من مسار واستعلام. */
export function href(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/**
 * ينتقل إلى مسار ('/cases/5' أو '#/cases/5'). مع replace لا يُضاف للسجل.
 */
export function navigate(path, { replace = false } = {}) {
  const target = String(path || '/').startsWith('#') ? String(path) : `#${path.startsWith('/') ? '' : '/'}${path}`;
  if (window.location.hash === target) {
    render();
    return;
  }
  if (replace) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${target}`);
    render();
  } else {
    window.location.hash = target;
  }
}

/** يعيد عرض المسار الحالي. */
export function reload() {
  return render({ keepScroll: true });
}

// ───────── v9.1 l-home (L-07): أوراق الأنماط الخاصة بصفحات الإدارة تُحمّل عند الحاجة ─────────
// الترتيب الأصلي في app.html يحفظ تتابع القواعد (cascade): تُدرج الورقة قبل أول ورقة تليها في هذا الترتيب.
export const CSS_ORDER = [
  'v9-site', 'app', 'pages-a', 'pages-b', 'pages-c', 'pages-d', 'v9-practice', 'v9-platform', 'v9-accounts',
  'v9-programs', 'v9-ai', 'v9-messaging', 'v9-fixes',
];
const cssLoads = new Map(); // الاسم ← Promise
let versionsCache = null;
/** أرقام إصدار الأوراق المؤجلة يكتبها الخادم في كتلة بيانات JSON (لا تُنفَّذ؛ متوافقة مع CSP) داخل صفحة /app */
function assetVersions() {
  if (versionsCache) return versionsCache;
  try {
    versionsCache = JSON.parse(document.getElementById('bm-assets')?.textContent || '{}') || {};
  } catch {
    versionsCache = {};
  }
  return versionsCache;
}

function sheetName(link) {
  const m = /\/assets\/css\/([\w.-]+?)\.css(?:\?|$)/.exec(link.getAttribute('href') || '');
  return m ? m[1] : null;
}
// الملفان المجمّعان اللذان يرسلهما الخادم بدل أوراق app.html: الأول (v9-site وapp) قبل أوراق الإدارة، والثاني بعدها
const BUNDLE_ORDER = { 'bundle-a': 1.5, 'bundle-b': 1000 };
function orderOf(name) {
  if (name in BUNDLE_ORDER) return BUNDLE_ORDER[name];
  const i = CSS_ORDER.indexOf(name);
  return i < 0 ? CSS_ORDER.length : i; // أوراق الإصدار 9.1 وغيرها تأتي بعد الأصلية
}

/**
 * يضمن تحميل أوراق أنماط بأسمائها (مثل 'pages-a') ويعيد Promise يُحل بعد تحميلها (أو فشلها، فلا تتعطل الصفحة).
 * الورقة الموجودة بالفعل في الصفحة لا تُطلب مرة أخرى.
 */
export function ensureStyles(names = []) {
  const list = [...new Set((names || []).filter(Boolean))];
  if (!list.length) return Promise.resolve();
  const links = () => [...document.querySelectorAll('link[rel="stylesheet"][href*="/assets/css/"]')];
  return Promise.all(
    list.map((name) => {
      if (cssLoads.has(name)) return cssLoads.get(name);
      const existing = links().find((l) => sheetName(l) === name || String(l.dataset.sheets || '').split(' ').includes(name));
      if (existing) {
        const p = Promise.resolve();
        cssLoads.set(name, p);
        return p;
      }
      // نفس رقم الإصدار الذي يضيفه الخادم لروابط الصفحة (إن وُجد) ليبقى الملف مخزّنًا للأبد
      const version = assetVersions().css?.[name] || null;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/assets/css/${name}.css${version ? `?v=${version}` : ''}`;
      const p = new Promise((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
      });
      const next = links().find((l) => orderOf(sheetName(l)) > orderOf(name));
      if (next) next.before(link);
      else document.head.appendChild(link);
      cssLoads.set(name, p);
      return p;
    }),
  ).then(() => undefined);
}

function staticPage(title, text, iconName) {
  const home = config ? config.defaultPath() : '/';
  return h(
    'div.page',
    pageHeader({ title }),
    h('div.card', emptyState(text, button('العودة إلى الصفحة الرئيسية', { variant: 'primary', icon: 'home', href: `#${home}` }), { icon: iconName })),
  );
}

async function render({ keepScroll = false } = {}) {
  if (!config) return;
  const seq = ++renderSeq;
  const { outlet } = config;
  const { path, query } = parseHash();

  if (path === '/') {
    navigate(config.defaultPath(), { replace: true });
    return;
  }

  closeAllModals();
  const found = matchRoute(path);
  const ctx = {
    params: found ? found.params : {},
    query,
    path,
    route: found ? found.route : null,
    user: config.getUser(),
    meta: config.getMeta(),
    navigate,
    reload,
    setTitle: (t) => config.setTitle(t),
    refreshShell: () => config.refreshShell(),
  };

  if (config.onRoute) config.onRoute(ctx);

  const finish = (node) => {
    if (seq !== renderSeq) return;
    mount(outlet, node);
    if (!keepScroll) window.scrollTo(0, 0);
    if (config.focusTarget && !keepScroll) config.focusTarget.focus({ preventScroll: true });
  };

  if (!found) {
    config.setTitle('الصفحة غير موجودة');
    finish(staticPage('الصفحة غير موجودة', 'لم نعثر على الصفحة المطلوبة. ربما تغيّر الرابط أو حُذفت الصفحة.', 'search'));
    return;
  }

  const { route } = found;
  const allowed = (!route.roles || route.roles.includes(ctx.user?.role)) && (!route.guard || route.guard(ctx));
  if (!allowed) {
    config.setTitle('غير مصرح');
    finish(staticPage('غير مصرح', 'غير مصرح لك بالوصول إلى هذه الصفحة', 'lock'));
    return;
  }

  // v9.1 l-home: عنوان خاص بالمحامي إن وُجد (مثل «حسابي» بدل «حسابي والأمان»)
  config.setTitle((ctx.user?.role === 'lawyer' && route.lawyerTitle) || route.title || '');
  if (!keepScroll) mount(outlet, (route.skeleton && route.skeleton(ctx)) || loading());

  try {
    // v9.1 l-home (L-07): بيانات الصفحة تُطلب بالتوازي مع تحميل وحدتها (prefetch)، وأوراق الأنماط المؤجلة قبل العرض
    if (route.prefetch) {
      try {
        ctx.prefetched = route.prefetch(ctx) || null;
        if (ctx.prefetched && ctx.prefetched.catch) ctx.prefetched.catch(() => {});
      } catch {
        ctx.prefetched = null;
      }
    }
    // prefetchGet(ctx) → مسار GET تطلبه الصفحة نفسها: يبدأ الآن ويأخذه أول api.get بنفس الرابط
    if (route.prefetchGet) {
      try {
        const p = route.prefetchGet(ctx);
        if (p) prefetchGet(p);
      } catch {
        /* بلا طلب مبكر */
      }
    }
    const css = [...(route.css || []), ...((config.extraCss && config.extraCss(ctx)) || [])];
    const [mod] = await Promise.all([route.load(), ensureStyles(css)]);
    if (seq !== renderSeq) return;
    const node = await mod.default(ctx);
    finish(node || h('div'));
  } catch (err) {
    if (seq !== renderSeq) return;
    // خطأ تحميل الوحدة نفسها (ملف مفقود) يظهر برسالة عامة
    finish(h('div.page', errorState(err, () => render())));
  }
}

/**
 * يبدأ الاستماع لتغييرات hash.
 * @param {{outlet:HTMLElement, getUser:()=>object, getMeta:()=>object, defaultPath:()=>string,
 *          setTitle:(t:string)=>void, refreshShell:()=>void, onRoute?:(ctx:object)=>void, focusTarget?:HTMLElement}} cfg
 */
export function startRouter(cfg) {
  config = cfg;
  if (!started) {
    window.addEventListener('hashchange', onHashChange);
    started = true;
  }
  render();
}

/** يوقف الموجّه (عند تسجيل الخروج). */
export function stopRouter() {
  window.removeEventListener('hashchange', onHashChange);
  started = false;
  config = null;
  renderSeq += 1;
}

function onHashChange() {
  render();
}
