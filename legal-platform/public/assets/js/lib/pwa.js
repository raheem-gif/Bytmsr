// تثبيت المنصة على الهاتف (PWA) لفريق العمل والمحامين: تسجيل عامل الخدمة، تلميح «تثبيت التطبيق على هاتفك»،
// وتنبيه عند توفر إصدار أحدث. يُستدعى من المنصة فقط (/app) ولا يظهر في الموقع العام.

import { h } from './h.js';
import { icon, button } from './ui.js';

const DISMISS_KEY = 'bm_pwa_install_dismissed_at';
const DISMISS_DAYS = 30;

function store(action, key, value) {
  try {
    if (action === 'get') return window.localStorage.getItem(key);
    window.localStorage.setItem(key, value);
  } catch {
    /* التخزين غير متاح (وضع التصفح الخاص مثلًا) */
  }
  return null;
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function recentlyDismissed() {
  const at = Number(store('get', DISMISS_KEY) || 0);
  return at && Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000;
}

function isPhoneLike() {
  return window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(max-width: 900px)').matches;
}

function isIos() {
  const ua = window.navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1);
}

let current = null;

function closeBanner() {
  if (current) {
    current.remove();
    current = null;
  }
}

/** شريط سفلي صغير قابل للإغلاق. */
function showBanner({ kind, title, text, actions = [], onDismiss }) {
  // تنبيه التحديث أهم من تلميح التثبيت: لا يُستبدل به
  if (kind === 'install' && current && current.classList.contains('pwa-banner-update')) return null;
  closeBanner();
  const close = button('', {
    variant: 'ghost',
    size: 'sm',
    icon: 'x',
    ariaLabel: 'إغلاق',
    className: 'pwa-banner-close',
    onClick: () => {
      closeBanner();
      if (onDismiss) onDismiss();
    },
  });
  current = h(
    'section.pwa-banner',
    { class: `pwa-banner-${kind}`, role: 'region', 'aria-label': title },
    h('span.pwa-banner-icon', { 'aria-hidden': 'true' }, icon(kind === 'update' ? 'refresh' : 'download', { size: 22 })),
    h('div.pwa-banner-text', h('strong', title), text && h('span', text)),
    actions.length ? h('div.pwa-banner-actions', actions) : null,
    close,
  );
  document.body.append(current);
  return current;
}

// ───────── v9.1 l-home (L-10): «أضف المنصة إلى شاشتك الرئيسية» من بطاقة «جهّز هاتفك» ─────────
// آخر حدث beforeinstallprompt (يحفظه setupInstallHint). الوحدة تُحمَّل بعد أول شاشة (L-07)، فالحدث إن سبقها
// تلتقطه main.js في window.__bmInstallPrompt
let installPrompt = (typeof window !== 'undefined' && window.__bmInstallPrompt) || null;

/** هل تعمل المنصة مثبتة على الشاشة الرئيسية؟ */
export function standalone() {
  return isStandalone();
}

/**
 * يعرض نافذة التثبيت (أندرويد/كروم). يعيد 'accepted' | 'dismissed' | 'installed' | 'unavailable'
 * (unavailable: المتصفح لم يعرض التثبيت — مثل سفاري على iOS — فتعرض الصفحة خطوات «المشاركة ← إضافة إلى الشاشة الرئيسية»).
 */
export async function promptInstall() {
  if (isStandalone()) return 'installed';
  if (!installPrompt) return 'unavailable';
  const ev = installPrompt;
  installPrompt = null;
  closeBanner();
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

// ───────── v9.1 l-home (L-20): تنبيهات الجهاز (Web Push) ─────────
/** هل يدعم هذا المتصفح تنبيهات الجهاز؟ */
export function pushSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(b64u) {
  const s = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * تسجيل عامل الخدمة الحالي. create=true: يُسجَّل الآن إن لم يكن (بعد أول فتح يُسجَّل بعد ثوانٍ من main.js) وينتظر
 * تفعيله 15 ثانية على الأكثر — لا انتظار بلا نهاية لـ serviceWorker.ready (كانت بطاقة «تنبيهات على هذا الجهاز» تبقى فارغة).
 */
async function pushRegistration({ create = false } = {}) {
  let reg = await navigator.serviceWorker.getRegistration('/app');
  if (!reg && !create) return null;
  if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/app' });
  if (reg.active) return reg;
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 15000));
  return (await Promise.race([ready, timeout])) || (reg.active ? reg : null);
}

/** الاشتراك الحالي لهذا المتصفح (أو null) — لا ينتظر تسجيل عامل الخدمة */
export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await pushRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/**
 * يطلب الإذن ويشترك ويرسل الاشتراك للخادم. يعيد 'subscribed' | 'denied' | 'unsupported'.
 * @param {(path:string, body?:object)=>Promise<any>} post دالة الطلب (api.post)
 * @param {(path:string)=>Promise<any>} get (api.get)
 */
export async function subscribePush({ get, post }) {
  if (!pushSupported()) return 'unsupported';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const status = await get('/account/push-subscription');
  const reg = await pushRegistration({ create: true });
  if (!reg) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.public_key) });
  await post('/account/push-subscription', { subscription: sub.toJSON() });
  return 'subscribed';
}

/** يلغي الاشتراك من المتصفح (والخادم إن مُرّرت del) */
export async function unsubscribePush({ del = null, silent = false } = {}) {
  const sub = await currentPushSubscription();
  if (!sub) return false;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* تجاهل */
  }
  if (del) {
    try {
      await del('/account/push-subscription', { endpoint });
    } catch (err) {
      if (!silent) throw err;
    }
  }
  return true;
}

function setupInstallHint() {
  window.addEventListener('beforeinstallprompt', (e) => {
    installPrompt = e;
  });
  if (isStandalone()) return;
  let deferred = null;

  const onPrompt = (e) => {
    e.preventDefault();
    deferred = e;
    if (recentlyDismissed() || !isPhoneLike()) return;
    showBanner({
      kind: 'install',
      title: 'تثبيت التطبيق على هاتفك',
      text: 'افتح المنصة بلمسة واحدة من الشاشة الرئيسية، دون حفظ بيانات الملفات على الجهاز.',
      actions: [
        button('تثبيت', {
          variant: 'primary',
          size: 'sm',
          icon: 'download',
          onClick: async () => {
            if (!deferred) return;
            const ev = deferred;
            deferred = null;
            closeBanner();
            try {
              await ev.prompt();
              const choice = await ev.userChoice;
              if (choice && choice.outcome === 'dismissed') store('set', DISMISS_KEY, String(Date.now()));
            } catch {
              /* المتصفح رفض العرض */
            }
          },
        }),
      ],
      onDismiss: () => store('set', DISMISS_KEY, String(Date.now())),
    });
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  if (window.__bmInstallPrompt) {
    const early = window.__bmInstallPrompt;
    window.__bmInstallPrompt = null;
    onPrompt(early);
  }

  window.addEventListener('appinstalled', () => {
    closeBanner();
    store('set', DISMISS_KEY, String(Date.now()));
  });

  // سفاري على iOS لا يدعم نافذة التثبيت: نعرض الخطوات مرة كل 30 يومًا
  if (isIos() && isPhoneLike() && !recentlyDismissed()) {
    window.setTimeout(() => {
      if (current || isStandalone()) return;
      showBanner({
        kind: 'install',
        title: 'تثبيت التطبيق على هاتفك',
        text: 'اضغط زر المشاركة في المتصفح ثم اختر «إضافة إلى الشاشة الرئيسية».',
        onDismiss: () => store('set', DISMISS_KEY, String(Date.now())),
      });
    }, 4000);
  }
}

const UPDATE_CHECK_MIN_MS = 5 * 60 * 1000;
const UPDATE_CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * يسجل عامل الخدمة بنطاق /app فقط، فلا يتحكم في الموقع العام ولا في بوابة العميل.
 * التحديث: الإصدار الجديد ينتظر (لا يتولى الصفحة المفتوحة تلقائيًا حتى لا تختلط ملفات إصدارين)، ويظهر تنبيه
 * «يتوفر إصدار أحدث»؛ وعند الضغط على «تحديث الآن» يُفعَّل الإصدار الجديد ثم تُعاد تحميل الصفحة.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const sw = navigator.serviceWorker;
  let controlled = Boolean(sw.controller);
  let accepted = false;
  let reloading = false;

  sw.addEventListener('controllerchange', () => {
    if (accepted) {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
      return;
    }
    // التفعيل الأول (clients.claim) لا يحتاج تنبيهًا
    if (!controlled) {
      controlled = true;
      return;
    }
    // فُعّل إصدار أحدث من نافذة أخرى للمنصة: هذه الصفحة ما زالت بملفات الإصدار السابق
    showBanner({
      kind: 'update',
      title: 'حُدّثت المنصة',
      text: 'أعد تحميل هذه الصفحة لاستخدام الإصدار الجديد بعد حفظ أي عمل مفتوح.',
      actions: [button('إعادة التحميل', { variant: 'primary', size: 'sm', icon: 'refresh', onClick: () => window.location.reload() })],
    });
  });

  const offerUpdate = (worker) => {
    // التثبيت الأول (لا عامل يتحكم في الصفحة بعد) لا يحتاج تنبيهًا
    if (!worker || !sw.controller) return;
    showBanner({
      kind: 'update',
      title: 'يتوفر إصدار أحدث من المنصة',
      text: 'احفظ أي عمل مفتوح ثم اضغط «تحديث الآن» لاستخدام آخر التحديثات.',
      actions: [
        button('تحديث الآن', {
          variant: 'primary',
          size: 'sm',
          icon: 'refresh',
          onClick: () => {
            accepted = true;
            closeBanner();
            worker.postMessage('SKIP_WAITING');
          },
        }),
      ],
    });
  };

  sw.register('/sw.js', { scope: '/app' })
    .then((reg) => {
      if (reg.waiting) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed') offerUpdate(next);
        });
      });
      // المنصة تطبيق صفحة واحدة يبقى مفتوحًا طويلًا (خاصة بعد تثبيته): نفحص وجود إصدار جديد دوريًا وعند العودة إليها
      let lastCheck = Date.now();
      const check = () => {
        if (Date.now() - lastCheck < UPDATE_CHECK_MIN_MS) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, UPDATE_CHECK_EVERY_MS);
    })
    .catch(() => {
      /* المتصفح لا يسمح (وضع خاص مثلًا) — المنصة تعمل كالمعتاد */
    });
  setupInstallHint();
}
