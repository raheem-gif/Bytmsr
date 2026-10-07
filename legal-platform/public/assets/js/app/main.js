// نقطة الدخول لتطبيق الإدارة والمحامين: تحميل meta، روابط الدعوة وإعادة التعيين، التحقق من الجلسة،
// الدخول على خطوتين، شاشات الإلزام (كلمة مرور مؤقتة / تفعيل التحقق بخطوتين)، ثم الهيكل والموجّه.

import { h, mount } from '../lib/h.js';
import { api, putEarlyResult, clearPrefetched } from '../lib/api.js';
import { setMeta, getMeta } from '../lib/fmt.js';
import { errorState, toast, closeAllModals, alertBox } from '../lib/ui.js';
import { startRouter, stopRouter, parseHash, matchRoute } from './router.js';
import { defaultPath, roleCss, todaySkeleton } from './routes.js';
// v9.1 l-home (L-07): هيكل التطبيق (shell.js وما يستورده) يُحمَّل بعد التحقق من الجلسة لا قبل عرض شاشة الدخول
const loadShell = () => import('./shell.js');

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

// ───────── v9.1 l-home (L-07): إقلاع متوازٍ ─────────
// meta محفوظة في هذا الجهاز ('bm-meta' مع ETag) تُستخدم فورًا، و/api/auth/session يعيد meta_version فلا تُطلب meta
// إلا إن تغيّرت. وللمحامي (آخر دور دخل من هذا الجهاز) يُطلب «اليوم» بالتوازي مع التحقق من الجلسة.
const META_KEY = 'bm-meta';
const ROLE_KEY = 'bm-last-role';
const LAST_USER_KEY = 'bm-last-user'; // آخر محامٍ دخل من هذا الجهاز (للفتح دون اتصال فقط)
const LOGOUT_PENDING_KEY = 'bm-logout-pending'; // تسجيل خروج لم يصل للخادم (بلا شبكة): يُرسل قبل أي تحقق من الجلسة
function lastLawyer() {
  try {
    const u = JSON.parse(window.localStorage.getItem(LAST_USER_KEY) || 'null');
    return u && u.role === 'lawyer' && u.id ? u : null;
  } catch {
    return null;
  }
}
const store = {
  get(k) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* التخزين غير متاح: نكمل بلا تخزين */
    }
  },
  remove(k) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* تجاهل */
    }
  },
};
function cachedMeta() {
  try {
    const v = JSON.parse(store.get(META_KEY) || 'null');
    return v && v.meta && typeof v.etag === 'string' ? v : null;
  } catch {
    return null;
  }
}
/** يطلب /api/meta (مع If-None-Match لنسخة الجهاز) ويحفظها. يعيد meta أو null إن لم تتغير. */
async function fetchMeta(etag, { part = null } = {}) {
  const headers = { Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  let res;
  try {
    res = await fetch(part ? `/api/meta?part=${part}` : '/api/meta', { credentials: 'same-origin', headers });
  } catch {
    const { ApiError, GENERIC_ERROR } = await import('../lib/api.js');
    throw new ApiError(GENERIC_ERROR, { status: 0, code: 'network_error' });
  }
  if (res.status === 304) return null;
  if (!res.ok) {
    const { ApiError } = await import('../lib/api.js');
    throw new ApiError('تعذر تحميل إعدادات المنصة، حاول مرة أخرى', { status: res.status, code: `http_${res.status}` });
  }
  const meta = await res.json();
  const tag = res.headers.get('ETag');
  if (tag && !meta.partial) store.set(META_KEY, JSON.stringify({ etag: tag, meta }));
  return meta;
}

/** meta التي جاءت مع /api/auth/session?meta=… (تُحفظ على الجهاز إن كانت كاملة) */
function metaFromSession(res) {
  const meta = res && res.meta;
  if (!meta) return fetchMeta(null);
  if (!meta.partial && res.meta_etag) store.set(META_KEY, JSON.stringify({ etag: res.meta_etag, meta }));
  return meta;
}

// v9.1 l-home (L-07): أول زيارة من الجهاز تكتفي بنسخة meta الصغيرة لشاشة الدخول، والكاملة تُجلب في الخلفية بعد ظهورها
// (ويُنتظر وصولها قبل فتح التطبيق إن لم تصل بعد)
let fullMetaReq = null;
function loadFullMeta() {
  if (!getMeta()?.partial) return Promise.resolve(getMeta());
  if (!fullMetaReq) {
    fullMetaReq = fetchMeta(null).then(
      (meta) => {
        if (meta) setMeta(meta);
        return getMeta();
      },
      (err) => {
        fullMetaReq = null;
        throw err;
      },
    );
  }
  return fullMetaReq;
}
let assetsInfo = null;
/** بيانات يكتبها الخادم في صفحة /app (كتلة JSON لا تُنفَّذ): أرقام الإصدار، تلميح الجلسة، وما تستورده صفحات المحامي */
function pageAssets() {
  if (assetsInfo) return assetsInfo;
  try {
    assetsInfo = JSON.parse(document.getElementById('bm-assets')?.textContent || '{}') || {};
  } catch {
    assetsInfo = {};
  }
  return assetsInfo;
}
function sessionHint() {
  return pageAssets().sid === 1;
}
/**
 * رابط مباشر لصفحة (من إشعار): وحدة الصفحة وكل ما تستورده تُطلب معًا بدل سلسلة استيرادات متتالية.
 * اسم الوحدة من نص دالة التحميل نفسها (() => import('./pages/…js?v=…')) وقائمة ملفاتها من الخادم.
 */
function preloadRouteModules(route) {
  const m = /import\(\s*['"]\.\/([^'"?]+)/.exec(String(route.load || ''));
  const urls = m ? pageAssets().graph?.[`app/${m[1]}`] : null;
  if (!Array.isArray(urls)) return;
  for (const u of urls) {
    if (typeof u !== 'string' || !u.startsWith('/assets/js/') || document.querySelector(`link[rel="modulepreload"][href="${u}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = u;
    document.head.appendChild(link);
  }
}
function loadFullMetaSoon() {
  if (getMeta()?.partial) window.setTimeout(() => loadFullMeta().catch(() => {}), 300);
}
/** شاشة الإقلاع: هيكل «اليوم» للمحامي، ومؤشر التحميل لغيره */
function bootSplash() {
  if (store.get(ROLE_KEY) === 'lawyer' && /^#?\/?(my)?\/?$/.test(window.location.hash.replace(/^#/, '') || '/')) {
    return h('div.lh-boot', h('div.lh-boot-bar', { 'aria-hidden': 'true' }), h('main.content', todaySkeleton()));
  }
  return splash('جارٍ تحميل المنصة…');
}

/**
 * v9.1 l-work (L-03): الإقلاع دون اتصال يُعاد وحده عند عودة الشبكة (حدث online، أو فحص خفيف كل 5 ثوانٍ
 * لأن بعض المتصفحات لا تطلق online لصفحة فُتحت دون اتصال) — دون أي ضغطة من المستخدم.
 */
function retryBootWhenOnline() {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('online', go);
    clearInterval(timer);
    boot();
  };
  window.addEventListener('online', go);
  const timer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    fetch('/healthz', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.ok && go())
      .catch(() => {});
  }, 5000);
}

async function boot() {
  mount(root, bootSplash());
  // v9.1 l-home: تسجيل خروج سابق لم يصل للخادم (بلا شبكة) يُرسل أولًا، ولا يُستخدم أي رد طُلب قبله (app/boot-early.js)
  if (store.get(LOGOUT_PENDING_KEY)) {
    try {
      await api.post('/auth/logout');
      store.remove(LOGOUT_PENDING_KEY);
    } catch (err) {
      if (err && err.status === 0) {
        mount(root, h('div.boot-splash', errorState(err, boot)));
        retryBootWhenOnline();
        return;
      }
      store.remove(LOGOUT_PENDING_KEY);
    }
    clearPrefetched();
    store.remove(LAST_USER_KEY);
  }
  const cached = cachedMeta();
  if (cached) setMeta(cached.meta);
  const hasLink = LINK_RE.test(window.location.hash) || /^#\/(invite|reset)\/?$/.test(window.location.hash);
  const role = store.get(ROLE_KEY);
  const known = !hasLink && Boolean(role || sessionHint());
  const { path: hashPath, query: hashQuery } = parseHash();
  const target = known ? matchRoute(hashPath) : null;
  // بيانات الصفحة المطلوبة (رابط إشعار، أو «اليوم») تأتي مع الجلسة في الطلب نفسه — الخادم يرسلها لمحامٍ بجلسة صالحة فقط
  let page = null;
  if (known && role !== 'staff') {
    if (hashPath === '/' || hashPath === '/my') page = role === 'lawyer' ? '/lawyer/today' : null;
    else if (target && target.route.prefetchGet) {
      try {
        page = target.route.prefetchGet({ params: target.params, query: hashQuery, path: hashPath }) || null;
      } catch {
        page = null;
      }
    }
  }
  // بلا نسخة meta على الجهاز: تأتي مع /api/auth/session أيضًا — كاملة لمن سبق دخوله (أو يحمل كعكة جلسة)،
  // وصغيرة لشاشة الدخول (والخادم يرسل الكاملة إن وجد جلسة صالحة). رابط الدعوة: النسخة الصغيرة وحدها.
  // (الرابط نفسه يطلبه app/boot-early.js أول الصفحة لمن يحمل جلسة، فيأخذ api.get رده بدل طلب جديد)
  const sessionQuery = {};
  if (!cached) sessionQuery.meta = known ? 'full' : 'login';
  if (page) sessionQuery.page = page;
  const sessionReq = hasLink
    ? null
    : api.get('/auth/session', Object.keys(sessionQuery).length ? sessionQuery : undefined).then((res) => {
        if (res && res.page && res.page.path === page) putEarlyResult(res.page.path, res.page.status, res.page.body);
        return res;
      });
  if (sessionReq) sessionReq.catch(() => {});
  const metaReq = cached ? null : sessionReq ? sessionReq.then(metaFromSession) : fetchMeta(null, { part: 'login' });
  if (metaReq) metaReq.catch(() => {});
  // سبق الدخول من هذا الجهاز: هيكل التطبيق ووحدة الصفحة المطلوبة (وكل ما تستورده) تُطلب بالتوازي مع التحقق من الجلسة
  if (known) {
    loadShell().catch(() => {});
    if (target && target.route.load) {
      preloadRouteModules(target.route);
      target.route.load().catch(() => {});
    }
  }
  try {
    if (metaReq) setMeta(await metaReq);
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, boot)));
    if (err.status === 0) retryBootWhenOnline(); // v9.1 l-work (L-03)
    return;
  }
  const link = takeLink();
  if (link) {
    showLinkFlow(link).then(loadFullMetaSoon, () => {});
    return;
  }
  if (/^#\/(invite|reset)\/?$/.test(window.location.hash)) {
    cleanUrl();
    showLogin({ message: 'افتح الرابط المرسل إليك كاملًا كما هو لتفعيل الحساب أو تعيين كلمة المرور.' });
    return;
  }
  try {
    const res = await (sessionReq || api.get('/auth/session'));
    currentUser = res && res.user ? res.user : null;
    // نسخة meta على الجهاز قديمة: نجلب الجديدة قبل العرض (رحلة إضافية فقط عند تغيّر الإعدادات أو الإصدار)
    if (cached && res && res.meta_version && res.meta_version !== cached.etag) {
      const fresh = await fetchMeta(cached.etag);
      if (fresh) setMeta(fresh);
    }
  } catch (err) {
    // v9.1 l-home (L-01): المحامي بلا اتصال يفتح «اليوم» من آخر نسخة على جهازه (تُمسح عند تسجيل الخروج)؛
    // أول طلب بعد عودة الشبكة يتحقق من الجلسة (401 ← شاشة الدخول)
    if (err.status === 0) {
      const last = lastLawyer();
      if (last) {
        proceed(last);
        return;
      }
    }
    if (err.status !== 401) {
      mount(root, h('div.boot-splash', errorState(err, boot)));
      // v9.1 l-work (L-03): فُتحت المنصة دون اتصال ← تُكمل وحدها فور عودة الشبكة (ونص الرأي على الجهاز يُستعاد)
      if (err.status === 0) retryBootWhenOnline();
      return;
    }
    currentUser = null;
  }
  if (currentUser) proceed(currentUser);
  else showLogin().then(loadFullMetaSoon); // showLogin يمسح الطلبات المبكرة
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
  clearPrefetched(); // v9.1 l-home: لا يأخذ من يدخل بعدها ردًا طُلب قبل جلسته
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
      remember: !!res.remember, // v9.1 l-home (L-17)
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

async function enterApp(user, { fromLogin = false } = {}) {
  currentUser = user;
  store.set(ROLE_KEY, user.role === 'lawyer' ? 'lawyer' : 'staff'); // v9.1 l-home: شاشة الإقلاع التالية
  if (user.role === 'lawyer') store.set(LAST_USER_KEY, JSON.stringify({ id: user.id, role: 'lawyer', name: user.name, username: user.username }));
  else store.remove(LAST_USER_KEY);
  let createShell;
  try {
    // v9.1 l-home (L-07): نسخة meta الكاملة (إن بدأ الجهاز بالصغيرة) مع هيكل التطبيق بالتوازي
    [{ createShell }] = await Promise.all([loadShell(), loadFullMeta()]);
  } catch (err) {
    mount(root, h('div.boot-splash', errorState(err, () => enterApp(user, { fromLogin }))));
    return;
  }
  if (currentUser !== user) return; // خرج المستخدم أو تغيّر أثناء التحميل
  // v9.1 l-home: meta تختلف قليلًا حسب الدور (مثل ai.claude للمحامي): بعد دخول جديد تُراجع نسخة الجهاز في الخلفية (304 غالبًا)
  if (fromLogin && !getMeta()?.partial) {
    const c = cachedMeta();
    if (c) fetchMeta(c.etag).then((fresh) => fresh && currentUser === user && setMeta(fresh)).catch(() => {});
  }
  if (shell) shell.destroy();
  shell = createShell({ user, meta: getMeta(), onLogout: logout });
  mount(root, shell.el);
  // v9.1 l-court (L-18): صندوق صادر المحامي يُرسل ما انتظر من إجراءات عند عودة الشبكة أيًا كانت الصفحة المفتوحة
  if (user.role === 'lawyer') import('./components/outbox.js').then((m) => m.initOutbox(user)).catch(() => {});
  // v9.1 l-work (L-03): حذف نسخ الرأي على الجهاز الأقدم من 30 يومًا
  // ونص الرأي الذي كُتب دون اتصال يُرسل للمنصة دون فتح المحرر (بنفس أساسه: لا كتابة فوق نص أحدث)
  if (user.role === 'lawyer') {
    import('./components/draft-store.js')
      .then((m) => {
        m.purgeOldDrafts(30);
        if (m.syncPendingDrafts && currentUser === user) m.syncPendingDrafts(user);
      })
      .catch(() => {});
  }

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
    // v9.1 l-home (L-07): أوراق أنماط الإدارة تُحمَّل لمستخدمي الإدارة فقط
    extraCss: (ctx) => roleCss(ctx.user),
  });
}

/** v9.1 l-home: ما يُحفظ على الجهاز من بيانات المستخدم يُمسح عند تسجيل الخروج (نسخة «اليوم» تحمل عناوين الملفات) */
function clearUserCaches(user) {
  clearPrefetched();
  store.remove(LAST_USER_KEY);
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('bm-today:') || k === 'bm-today-count')) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* تجاهل */
  }
  if (user && user.role === 'lawyer') {
    // اشتراك تنبيهات الجهاز يُلغى مع تسجيل الخروج (يحذفه الخادم أيضًا مع الجلسة)
    import('../lib/pwa.js').then((m) => m.unsubscribePush && m.unsubscribePush({ silent: true })).catch(() => {});
  }
}

/** v9.1 l-court (L-18): تحذير قبل الخروج إن بقيت إجراءات ممر المحكمة في صندوق الصادر دون إرسال */
async function confirmOutboxLogout() {
  try {
    const m = await import('./components/outbox.js');
    const warn = m.outboxLogoutWarning();
    if (!warn) return true;
    const { confirmDialog } = await import('../lib/ui.js');
    const ok = await confirmDialog({
      title: 'تسجيل الخروج',
      message: `${warn} إن خرجت الآن يُحذف من هذا الجهاز ولن يصل للإدارة.`,
      confirmLabel: 'خروج على أي حال',
      cancelLabel: 'البقاء',
      danger: true,
    });
    // لا يُمسح الصندوق هنا: قد يتراجع المستخدم في تأكيد المسودات التالي فيبقى داخلًا — يُمسح في logout() بعد كل التأكيدات
    return ok;
  } catch {
    return true;
  }
}

async function logout() {
  if (currentUser && currentUser.role === 'lawyer' && !(await confirmOutboxLogout())) return; // v9.1 l-court
  // v9.1 l-work (L-03): نص رأي لم يُحفظ على المنصة بعد ← [«ارجع واحفظ»] [«سجّل الخروج»]، والخروج يحذف نسخ المستخدم من الجهاز
  if (currentUser && currentUser.role === 'lawyer') {
    const { confirmLogoutWithDrafts } = await import('./components/draft-store.js');
    if (!(await confirmLogoutWithDrafts(currentUser, { navigate: (p) => (window.location.hash = `#${p}`) }))) return;
    // v9.1 l-court (L-18): بعد تأكيد الخروج يُمسح صندوق الصادر من الجهاز (المنتظر وإشعارات الرفض بنصوصها)
    try {
      (await import('./components/outbox.js')).clearOutbox();
    } catch {
      /* تجاهل */
    }
  }
  clearUserCaches(currentUser);
  currentUser = null; // حتى لا يُعامل رد 401 أثناء الخروج كجلسة منتهية
  try {
    await api.post('/auth/logout');
    store.remove(LOGOUT_PENDING_KEY);
  } catch {
    // حتى لو فشل الطلب نعود لشاشة الدخول؛ v9.1 l-home: والجلسة تُنهى على الخادم عند أول اتصال (هاتف مشترك بلا شبكة
    // في ممر المحكمة: لا يعود «تذكّرني» فيُدخل الشخص التالي إلى الحساب)
    store.set(LOGOUT_PENDING_KEY, '1');
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

// تثبيت المنصة على الهاتف (PWA): عامل الخدمة بنطاق /app وتلميح التثبيت — وحدة الموقع
// v9.1 l-home (L-07): في أول زيارة تُحمَّل الوحدة بعد ظهور أول شاشة فلا تزاحم شاشة الدخول على شبكة بطيئة
// (وحدث التثبيت إن سبقها يُحفظ لها)؛ ومع عامل خدمة مثبت تُحمَّل فورًا من ذاكرته لتفحص التحديثات.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__bmInstallPrompt = e;
});
const startPwa = () => import('../lib/pwa.js').then((m) => m.registerServiceWorker()).catch(() => {});
const booted = boot();
if (navigator.serviceWorker?.controller) startPwa();
else {
  const later = () => window.setTimeout(startPwa, 5000); // بعد أن تكتمل الصفحة الأولى (ووحداتها) على شبكة بطيئة
  booted.then(later, later);
}
