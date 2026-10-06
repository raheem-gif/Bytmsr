// نقطة الدخول لتطبيق الإدارة والمحامين: تحميل meta، التحقق من الجلسة، ثم الهيكل والموجّه.

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { setMeta, getMeta } from '../lib/fmt.js';
import { errorState, toast, closeAllModals } from '../lib/ui.js';
import { startRouter, stopRouter, parseHash, matchRoute } from './router.js';
import { defaultPath } from './routes.js';
import { createShell } from './shell.js';

const root = document.getElementById('app');
let shell = null;
let currentUser = null;

function splash(text) {
  return h('div.boot-splash', { role: 'status' }, h('span.spinner.spinner-lg', { 'aria-hidden': 'true' }), h('span', text));
}

function orgName() {
  return getMeta().settings?.org_name || 'بيوت مصر';
}

async function boot() {
  mount(root, splash('جارٍ تحميل المنصة…'));
  try {
    setMeta(await api.get('/meta'));
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, boot)));
    return;
  }
  try {
    const res = await api.get('/auth/session');
    currentUser = res && res.user ? res.user : null;
  } catch (err) {
    if (err.status !== 401) {
      mount(root, h('div.boot-splash', errorState(err, boot)));
      return;
    }
    currentUser = null;
  }
  if (currentUser) enterApp(currentUser);
  else showLogin();
}

async function showLogin({ expired = false } = {}) {
  currentUser = null;
  stopRouter();
  closeAllModals();
  if (shell) {
    shell.destroy();
    shell = null;
  }
  document.title = `تسجيل الدخول — منصة ${orgName()} القانونية`;
  try {
    const { default: renderLogin } = await import('./pages/login.js');
    mount(root, renderLogin({ meta: getMeta(), expired, onLogin: (user) => enterApp(user, { fromLogin: true }) }));
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, () => showLogin({ expired }))));
  }
}

function enterApp(user, { fromLogin = false } = {}) {
  currentUser = user;
  if (shell) shell.destroy();
  shell = createShell({ user, meta: getMeta(), onLogout: logout });
  mount(root, shell.el);

  // بعد الدخول: إن كان الرابط الحالي لا يناسب الدور ننتقل للصفحة الافتراضية
  if (fromLogin) {
    const { path } = parseHash();
    const found = matchRoute(path);
    if (found && found.route.roles && !found.route.roles.includes(user.role)) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${defaultPath(user)}`);
    }
  }

  startRouter({
    outlet: shell.outlet,
    focusTarget: shell.main,
    getUser: () => currentUser,
    getMeta,
    defaultPath: () => defaultPath(currentUser),
    setTitle: (t) => shell && shell.setTitle(t),
    refreshShell: () => shell && shell.refresh(),
    onRoute: (ctx) => shell && shell.setActive(ctx.path),
  });
}

async function logout() {
  currentUser = null; // حتى لا يُعامل رد 401 أثناء الخروج كجلسة منتهية
  try {
    await api.post('/auth/logout');
  } catch {
    /* حتى لو فشل الطلب نعود لشاشة الدخول */
  }
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  await showLogin();
  toast('تم تسجيل الخروج بنجاح', 'success');
}

window.addEventListener('auth:expired', () => {
  if (currentUser) showLogin({ expired: true });
});

boot();
