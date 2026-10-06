// نقطة الدخول لتطبيق الإدارة والمحامين: تحميل meta، روابط الدعوة وإعادة التعيين، التحقق من الجلسة،
// الدخول على خطوتين، شاشات الإلزام (كلمة مرور مؤقتة / تفعيل التحقق بخطوتين)، ثم الهيكل والموجّه.

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { setMeta, getMeta } from '../lib/fmt.js';
import { errorState, toast, closeAllModals, alertBox } from '../lib/ui.js';
import { startRouter, stopRouter, parseHash, matchRoute } from './router.js';
import { defaultPath } from './routes.js';
import { createShell } from './shell.js';

const root = document.getElementById('app');
let shell = null;
let currentUser = null;

// روابط الاستخدام الواحد: #/invite/<رمز> و #/reset/<رمز>
const LINK_RE = /^#\/(invite|reset)\/([A-Za-z0-9_-]{20,200})\/?$/;
const LINK_STORE = 'bm_account_link';

function splash(text) {
  return h('div.boot-splash', { role: 'status' }, h('span.spinner.spinner-lg', { 'aria-hidden': 'true' }), h('span', text));
}

function orgName() {
  return getMeta().settings?.org_name || 'بيوت مصر';
}

function cleanUrl(hash = '') {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

/** يلتقط رابط الدعوة/إعادة التعيين من العنوان ويزيل الرمز منه (يبقى محفوظًا لهذا التبويب فقط لإعادة التحميل) */
function takeLink() {
  const m = LINK_RE.exec(window.location.hash);
  if (m) {
    const link = { kind: m[1], token: m[2] };
    try {
      sessionStorage.setItem(LINK_STORE, JSON.stringify(link));
    } catch {
      /* التخزين غير متاح: نكمل من الذاكرة */
    }
    cleanUrl(`#/${link.kind}`);
    return link;
  }
  const bare = /^#\/(invite|reset)\/?$/.exec(window.location.hash);
  if (bare) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LINK_STORE) || 'null');
      if (saved && saved.kind === bare[1] && typeof saved.token === 'string') return saved;
    } catch {
      /* تجاهل */
    }
  }
  return null;
}
function forgetLink() {
  try {
    sessionStorage.removeItem(LINK_STORE);
  } catch {
    /* تجاهل */
  }
}

function teardownApp() {
  stopRouter();
  closeAllModals();
  if (shell) {
    shell.destroy();
    shell = null;
  }
}

async function boot() {
  mount(root, splash('جارٍ تحميل المنصة…'));
  try {
    setMeta(await api.get('/meta'));
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, boot)));
    return;
  }
  const link = takeLink();
  if (link) {
    showLinkFlow(link);
    return;
  }
  if (/^#\/(invite|reset)\/?$/.test(window.location.hash)) {
    cleanUrl();
    showLogin({ message: 'افتح الرابط المرسل إليك كاملًا كما هو لتفعيل الحساب أو تعيين كلمة المرور.' });
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
  if (currentUser) proceed(currentUser);
  else showLogin();
}

/** بعد التحقق من الهوية: شاشة الإلزام إن وُجد قيد، وإلا التطبيق */
function proceed(user, { fromLogin = false } = {}) {
  if (user && user.restricted) {
    showRestricted(user);
    return;
  }
  enterApp(user, { fromLogin });
}

async function showLogin({ expired = false, message = null, username = null } = {}) {
  currentUser = null;
  teardownApp();
  document.title = `تسجيل الدخول — منصة ${orgName()} القانونية`;
  try {
    const { default: renderLogin } = await import('./pages/login.js');
    const el = renderLogin({
      meta: getMeta(),
      expired,
      onLogin: (user, res) => {
        if (res && res.two_factor_required) {
          showTwoFactor(res);
          return;
        }
        proceed(user, { fromLogin: true });
      },
    });
    mount(root, el);
    const formEl = el.querySelector('.login-card form');
    if (message && formEl) formEl.before(h('div.mb-3', alertBox(message, 'warning')));
    if (username) {
      const u = el.querySelector('input[name=username]');
      const p = el.querySelector('input[name=password]');
      if (u) u.value = username;
      if (p) requestAnimationFrame(() => p.focus());
    }
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, () => showLogin({ expired }))));
  }
}

async function showTwoFactor(res) {
  teardownApp();
  const { renderTwoFactorStep } = await import('./pages/auth-flows.js');
  mount(
    root,
    renderTwoFactorStep({
      meta: getMeta(),
      challenge: res.challenge,
      expiresAt: res.expires_at,
      onSuccess: (user) => proceed(user, { fromLogin: true }),
      onCancel: (opts = {}) => showLogin({ message: opts.message || null }),
    }),
  );
}

async function showLinkFlow(link) {
  currentUser = null;
  teardownApp();
  const { renderLinkFlow } = await import('./pages/auth-flows.js');
  mount(
    root,
    renderLinkFlow({
      kind: link.kind,
      token: link.token,
      meta: getMeta(),
      onLoggedIn: (user) => {
        forgetLink();
        cleanUrl();
        proceed(user, { fromLogin: true });
      },
      onGoLogin: (opts = {}) => {
        forgetLink();
        cleanUrl();
        showLogin({ username: opts.username || null });
      },
    }),
  );
}

async function showRestricted(user) {
  currentUser = user;
  teardownApp();
  const { renderRestricted } = await import('./pages/auth-flows.js');
  mount(
    root,
    renderRestricted({
      user,
      meta: getMeta(),
      onDone: (u) => proceed(u, { fromLogin: true }),
      onLogout: logout,
    }),
  );
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

// فتح رابط دعوة/إعادة تعيين في نفس التبويب بعد تحميل المنصة
window.addEventListener('hashchange', () => {
  if (!LINK_RE.test(window.location.hash)) return;
  const link = takeLink();
  if (link) showLinkFlow(link);
});

// عند العودة إلى التبويب: إن فرضت الإدارة قيدًا جديدًا (مثل إلزام التحقق بخطوتين) نعرض شاشة الإلزام
let lastCheck = 0;
window.addEventListener('focus', async () => {
  if (!currentUser || currentUser.restricted || Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try {
    const res = await api.get('/auth/session', undefined, { background: true });
    if (res && res.user && res.user.restricted && currentUser) showRestricted(res.user);
  } catch {
    /* تجاهل */
  }
});

// رفض الخادم طلبًا لأن قيدًا فُرض على الحساب أثناء الجلسة (مثل تفعيل إلزام التحقق بخطوتين): نعرض شاشة الإلزام فورًا
let restrictedCheck = null;
window.addEventListener('auth:restricted', () => {
  if (!currentUser || currentUser.restricted || restrictedCheck) return;
  restrictedCheck = api
    .get('/auth/session', undefined, { background: true })
    .then((res) => {
      if (res && res.user && res.user.restricted && currentUser) showRestricted(res.user);
    })
    .catch(() => {})
    .finally(() => {
      restrictedCheck = null;
    });
});

boot();

// تثبيت المنصة على الهاتف (PWA): عامل الخدمة بنطاق /app وتلميح التثبيت — وحدة الموقع
import('../lib/pwa.js').then((m) => m.registerServiceWorker()).catch(() => {});
