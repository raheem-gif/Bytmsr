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

function setupInstallHint() {
  if (isStandalone()) return;
  let deferred = null;

  window.addEventListener('beforeinstallprompt', (e) => {
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
  });

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
