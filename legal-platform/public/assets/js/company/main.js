// الإصدار 10 — إقلاع بوابة الشركات /company (L-13، §8.1): نظافة التخزين أولًا، نصوص الأخطاء بصيغة الجمع، ثم
// meta ∥ الجلسة (ومعهما بيانات «المتابعة» مبكرًا إن كانت هي الوجهة) → شاشات الدخول، أو شاشة الإلزام، أو الإطار والموجّه.
// auth:expired ← الدخول مع ملاحظة الانتهاء وحفظ صفحة العودة؛ auth:restricted ← شاشة الإلزام. الإشعارات كل 60 ثانية
// (طلب خلفية لا يمدد الجلسة)، وعنوان التبويب «(n) » مع غير المقروء، وتحديث الصفحة مرة عند العودة إليها أو عودة الاتصال.
// لا Service Worker على /company (L-40)، ولا JavaScript مضمّن في الصفحة (CSP).
import './early.js'; // أولًا: طلبات الإقلاع قبل تقييم بقية الوحدات
import { h, mount } from '../lib/h.js';
import { api, setErrorCopy, prefetchGet, clearPrefetched } from '../lib/api.js';
import { setMeta, getMeta } from '../lib/fmt.js';
import { button, closeAllModals, confirmDialog, wordmark } from '../lib/ui.js';
import { defineRoutes, startRouter, stopRouter, parseHash, reload, ensureStyles } from '../app/router.js';
import { COMPANY_ROUTES } from './routes.js';
import { mountShell } from './shell.js';
import { W, ERROR_COPY } from './words.js';
import { S, setSession, clearSession, storageHygiene, rememberReturn, takeReturn, readDraft, readOnly, isViewer, getItem, setItem, removeItem, typingInProgress } from './state.js';
import { notFoundView } from './common.js';

const root = document.getElementById('company-app');
// X10-P3: iOS Safari لا يطبّق :active (الضغط الفوري على الأزرار والصفوف والمربعات) إلا بمستمع touchstart في الصفحة
document.addEventListener('touchstart', () => {}, { passive: true });
setErrorCopy(ERROR_COPY);
storageHygiene();

let shell = null;
let pollTimer = 0;
let lastLoad = Date.now();
let currentRoute = null;
const brandShort = () => getMeta()?.brand?.short || 'Emam Legal';
// تلميح «على هذا الجهاز جلسة» (تفضيل عرض، لا بيانات شركة؛ L-47): يسمح بطلب «المتابعة» مع الإقلاع دون 401 لزائر لم يدخل
const SIGNED_HINT = 'ek.co.view:signed';

function setTitle(t) {
  const base = t ? `${t} — ${brandShort()}` : brandShort();
  document.title = `${S.unread ? `(${S.unread > 99 ? '99+' : S.unread}) ` : ''}${base}`;
  shell?.setPageTitle?.(t);
  setTitle.last = t;
}

/** شاشة بلا إطار: الشعار الكبير + المحتوى */
function bare(...children) {
  mount(root, h('div.co-bare', h('div.co-bare-card', h('div.co-bare-brand', wordmark({ size: 'lg', tone: 'light', descriptor: W.brand.tagline_ar })), ...children)));
}

// ───────────────────────── شاشات الدخول والروابط (بلا جلسة) ─────────────────────────
let authNotice = null;
let authEmail = '';
async function renderAuth() {
  stopPolling();
  const { path } = parseHash();
  const m = /^\/(invite|reset)\/([^/]+)$/.exec(path);
  // C-09: العنوان قبل أي تحميل (شاشة الدعوة/التعيين كانت تعود قبل ضبطه فيبقى العنوان العام أو عنوان الشاشة السابقة)
  const title = m ? (m[1] === 'invite' ? W.titles.invite : W.titles.reset) : path === '/forgot' ? W.titles.forgot : W.titles.login;
  setTitle(title);
  try {
    // أنماط شاشات الدخول تُحمَّل معها (خارج أوراق أول رسم لـ«المتابعة»؛ §8.4)
    const css = ensureStyles(['v10-company-pages']);
    if (m) {
      const [{ renderLink }] = await Promise.all([import('./pages/link.js'), css]);
      renderLink(root, { kind: m[1], token: m[2], onSignedIn, onLogin: showLogin });
      return;
    }
    const [mod] = await Promise.all([import('./pages/login.js'), css]);
    if (path === '/forgot') mod.renderForgot(root, { email: authEmail, onBack: () => showLogin(null) });
    else mod.renderLogin(root, { notice: authNotice, email: authEmail, onSignedIn });
  } catch (err) {
    bare(h('p', { role: 'alert' }, W.state.network), button(W.state.retry, { variant: 'primary', onClick: renderAuth }));
  }
  setTitle(title);
}
/** شاشة الدخول (مع ملاحظة: انتهاء الجلسة أو تغيير كلمة المرور، والبريد معبأ) */
function showLogin(notice = null, email = '') {
  authNotice = notice;
  authEmail = email || authEmail;
  if (window.location.hash !== '#/login') window.history.replaceState(null, '', '#/login');
  renderAuth();
}
function onAuthHash() {
  if (!S.user) renderAuth();
}

async function onSignedIn() {
  clearPrefetched();
  let s;
  try {
    s = await api.get('/company/auth/session');
  } catch {
    s = null;
  }
  if (!s?.user) return showLogin(W.state.expired);
  authNotice = null;
  enter(s);
}

// ───────────────────────── الجلسة والإطار ─────────────────────────
function enter(session) {
  setSession(session);
  setItem('localStorage', SIGNED_HINT, '1');
  storageHygiene(S.user.id);
  window.removeEventListener('hashchange', onAuthHash);
  if (S.user.restricted) return showGate();
  startApp();
}

async function showGate() {
  stopRouter();
  shell?.destroy?.();
  shell = null;
  // معالج التحقق بخطوتين المشترك يأخذ أنماطه من v9-accounts.css (‎.acc-steps، رمز QR، رموز الاسترداد)
  const [{ renderGate }] = await Promise.all([import('./pages/gate.js'), ensureStyles(['v10-company-pages', 'v9-accounts'])]);
  renderGate(root, { onDone: onSignedIn, onLogout: logout });
  setTitle(W.titles.gate);
}

/** الصفحات الممنوعة لدور المستخدم أو لشركة للاطلاع فقط تعرض حالتها (U10-82/83/85) لا صفحة فارغة */
function withAccess(r) {
  return {
    ...r,
    roles: undefined,
    load: async () => {
      if (r.roles && !r.roles.includes(S.user?.role)) {
        const text = r.write && isViewer() ? W.state.viewer_no_send : W.state.admins_route;
        return { default: () => notFoundView(r.parent || { label: W.nav.overview, href: '#/overview' }, { title: W.state.not_found, text }) };
      }
      if (r.write && readOnly()) {
        const name = S.home?.account_manager?.name;
        return { default: () => notFoundView(r.parent || { label: W.nav.overview, href: '#/overview' }, { title: W.state.read_only_title, text: name ? W.state.read_only_text.replace('{name}', name) : W.state.read_only_text_team }) };
      }
      return r.load();
    },
  };
}

function startApp() {
  shell = mountShell(root, { onLogout: logout });
  defineRoutes(COMPANY_ROUTES.map(withAccess));
  const ret = takeReturn();
  if (ret && ret !== window.location.hash) window.history.replaceState(null, '', ret);
  else if (!window.location.hash || /^#\/(login|forgot|invite|reset)/.test(window.location.hash)) window.history.replaceState(null, '', '#/overview');
  startRouter({
    outlet: shell.outlet,
    getUser: () => S.user,
    getMeta,
    defaultPath: () => '/overview',
    setTitle,
    refreshShell: () => shell?.refresh(),
    onRoute: (ctx) => {
      lastLoad = Date.now();
      currentRoute = ctx.route || null;
      shell?.onRoute(ctx);
    },
    focusTarget: shell.focusTarget,
  });
  startPolling();
  // شارة «المتابعة» ومدير العلاقة في التنقل الجانبي حين تبدأ الجلسة من صفحة أخرى
  if (parseHash().path !== '/overview') api.get('/company/home', undefined, { background: true }).then((home) => shell?.setHome(home)).catch(() => {});
}

// ───────────────────────── الإشعارات (U10-13) ─────────────────────────
async function pollNotifications() {
  if (!S.user) return;
  try {
    const r = await api.get('/company/notifications', { limit: 1 }, { background: true });
    S.unread = Number(r?.unread) || 0;
    shell?.setUnread(S.unread);
    setTitle(setTitle.last);
  } catch {
    /* المحاولة التالية بعد دقيقة */
  }
}
function startPolling() {
  stopPolling();
  pollNotifications();
  pollTimer = setInterval(pollNotifications, 60000);
}
function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = 0;
}

// ───────────────────────── الخروج وانتهاء الجلسة ─────────────────────────
async function logout() {
  if (readDraft()) {
    const ok = await confirmDialog({ title: W.nav.logout, message: W.nav.logout_draft, confirmLabel: W.nav.logout_confirm, cancelLabel: W.state.cancel, danger: true });
    if (!ok) return;
  }
  try {
    await api.post('/company/auth/logout', {});
  } catch {
    /* تُحذف البيانات من الجهاز على أي حال */
  }
  leave();
  clearSession();
  removeItem('localStorage', SIGNED_HINT);
  showLogin(null);
}
function leave() {
  stopPolling();
  stopRouter();
  closeAllModals();
  clearPrefetched();
  shell?.destroy?.();
  shell = null;
  currentRoute = null;
  document.body.classList.remove('co-shell', 'co-detail');
  window.addEventListener('hashchange', onAuthHash);
}

window.addEventListener('auth:expired', () => {
  if (!S.user) return;
  rememberReturn(window.location.hash);
  removeItem('localStorage', SIGNED_HINT);
  leave();
  // المسودة تبقى (تعود بعد الدخول بالحساب نفسه)؛ بيانات الذاكرة تُمسح
  S.user = null;
  S.company = null;
  S.home = null;
  showLogin(W.state.expired);
});
window.addEventListener('auth:restricted', () => {
  if (S.user) onSignedIn();
});
window.addEventListener('co:home', (e) => shell?.setHome(e.detail));
window.addEventListener('co:notifications', pollNotifications);
window.addEventListener('co:logout', () => S.user && logout());
window.addEventListener('co:reload', () => shell && reload());
/** العودة إلى التبويب بعد أكثر من دقيقة، أو عودة الاتصال: تحديث بيانات الصفحة مرة واحدة — إلا أثناء الكتابة */
function autoReload() {
  if (!shell || typingInProgress(document, currentRoute)) return;
  lastLoad = Date.now();
  reload();
}
window.addEventListener('focus', () => {
  if (shell && Date.now() - lastLoad > 60000) {
    autoReload();
    pollNotifications();
  }
});
window.addEventListener('online', autoReload);

// ───────────────────────── الإقلاع ─────────────────────────
async function boot() {
  const target = parseHash();
  if ((target.path === '/' || target.path === '/overview') && getItem('localStorage', SIGNED_HINT)) prefetchGet('/company/home');
  let meta;
  let session;
  try {
    [meta, session] = await Promise.all([api.get('/company/meta'), api.get('/company/auth/session').catch(() => ({ user: null }))]);
  } catch {
    bare(h('p', { role: 'alert' }, W.state.network), button(W.state.retry, { variant: 'primary', onClick: boot }));
    return;
  }
  setMeta(meta);
  if (meta?.enabled === false) {
    setTitle(W.titles.disabled);
    bare(h('p.co-bare-text', W.state.disabled));
    return;
  }
  if (session?.user) return enter(session);
  removeItem('localStorage', SIGNED_HINT);
  window.addEventListener('hashchange', onAuthHash);
  if (!/^\/(login|login\/2fa|forgot|invite\/[^/]+|reset\/[^/]+)$/.test(target.path)) {
    rememberReturn(window.location.hash);
    window.history.replaceState(null, '', '#/login');
  }
  renderAuth();
}

boot();
