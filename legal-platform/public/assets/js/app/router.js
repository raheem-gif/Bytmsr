// موجّه يعتمد على hash: #/cases/12?tab=docs

import { h, mount } from '../lib/h.js';
import { loading, errorState, pageHeader, emptyState, button, closeAllModals } from '../lib/ui.js';

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

  config.setTitle(route.title || '');
  if (!keepScroll) mount(outlet, loading());

  try {
    const mod = await route.load();
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
