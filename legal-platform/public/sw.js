/* عامل خدمة منصة الدعم القانوني (للفريق والمحامين): تثبيت المنصة على الهاتف وتسريع فتحها.
 *
 * القواعد:
 *  - الملفات الثابتة تحت /assets: من التخزين المؤقت أولًا (cache-first). اسم المخزن مرتبط برقم إصدار
 *    يحقنه الخادم ويتغير مع أي تعديل في الملفات، فتُحذف النسخ القديمة عند التفعيل.
 *  - صفحة المنصة /app (بلا أي بيانات شخصية): من المخزن أولًا ثم تُحدَّث في الخلفية (v9.1 l-home)؛ وإن لم تُخزَّن بعد
 *    وانقطع الاتصال تظهر صفحة «لا يوجد اتصال» عربية.
 *  - لا يُخزَّن أبدًا: /api و/p/ و/portal و/webhooks وأي استجابة غير ملف ثابت عام (كل ما يتطلب جلسة).
 *
 * يُخدم هذا الملف عبر src/site.js الذي يحقن رقم الإصدار وقائمة الملفات واسم المؤسسة في الثوابت أدناه.
 */
/* eslint-env serviceworker */

const VERSION = '__SW_VERSION__';
const PRECACHE = [/*__PRECACHE__*/];
const ORG_NAME = '__ORG_NAME__';
const CACHE_PREFIX = 'bm-static-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

// مسارات محظور تخزينها أو اعتراضها مهما كانت
const NEVER = [/^\/api(\/|$)/, /^\/p\//, /^\/portal(\/|$)/, /^\/webhooks(\/|$)/, /^\/setup(\/|$)/, /^\/sw\.js$/];

function isNever(url) {
  return NEVER.some((re) => re.test(url.pathname));
}

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/') && !isNever(url);
}

function isAppShell(url) {
  return url.origin === self.location.origin && (url.pathname === '/app' || url.pathname === '/app/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // v9.1 l-home: صفحة المنصة نفسها تُخزَّن مع الإصدار (الخادم يرسلها no-cache بلا بيانات شخصية)
      await refreshShell(cache);
      // كل ملف على حدة: فشل ملف واحد لا يُفشل التثبيت كله
      await Promise.all(
        PRECACHE.map(async (path) => {
          try {
            const res = await fetch(path, { cache: 'no-cache', credentials: 'same-origin' });
            if (cacheable(res)) await cache.put(path, res);
          } catch {
            /* يُجلب لاحقًا عند الطلب */
          }
        }),
      );
      // لا تفعيل فوري للإصدار الجديد (لا skipWaiting هنا): صفحات المنصة تُحمّل وحداتها عند الطلب، فلو تولى الإصدار
      // الجديد صفحةً محمّلة بملفات الإصدار القديم لاختلطت الوحدات وتعطلت الصفحات. ينتظر الإصدار الجديد حتى يضغط
      // المستخدم «تحديث الآن» (رسالة SKIP_WAITING ثم إعادة تحميل) أو تُغلق كل نوافذ المنصة. التثبيت الأول يُفعَّل مباشرة.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

/** استجابة قابلة للتخزين: ملف ثابت ناجح من نفس المصدر وغير ممنوع تخزينه */
function cacheable(res) {
  if (!res || !res.ok || res.status !== 200 || res.type !== 'basic') return false;
  const cc = (res.headers.get('Cache-Control') || '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('private')) return false;
  if (res.headers.get('Set-Cookie')) return false;
  return true;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) cache.put(request, res.clone()).catch(() => {});
  return res;
}

// v9.1 l-home (L-07): صفحة المنصة /app (بلا أي بيانات شخصية) من المخزن أولًا ثم تُحدَّث في الخلفية،
// فيبدأ فتح المنصة من أيقونة الهاتف دون انتظار الشبكة. تنبيه «يتوفر إصدار أحدث» يبقى كما هو للإصدارات الجديدة.
const SHELL_KEY = '/app';

async function refreshShell(cache) {
  try {
    const res = await fetch(SHELL_KEY, { cache: 'no-cache', credentials: 'same-origin' });
    if (cacheable(res) && !res.redirected) await cache.put(SHELL_KEY, res.clone());
    return res;
  } catch {
    return null;
  }
}

async function networkFirstShell(request, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(SHELL_KEY);
  if (hit) {
    const update = refreshShell(cache);
    if (event && event.waitUntil) event.waitUntil(update);
    return hit;
  }
  try {
    const res = await fetch(request);
    if (cacheable(res) && !res.redirected) cache.put(SHELL_KEY, res.clone()).catch(() => {});
    return res;
  } catch {
    return offlineResponse();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || isNever(url)) return; // يمر للشبكة دون تدخل
  if (request.mode === 'navigate') {
    // صفحة المنصة بلا استعلام فقط (روابط الدعوة وإعادة التعيين في الجزء بعد # لا تصل للخادم أصلًا)
    if (isAppShell(url) && !url.search) event.respondWith(networkFirstShell(request, event));
    return;
  }
  if (isStaticAsset(url)) event.respondWith(cacheFirst(request));
});

// ───────── v9.1 l-home (L-20): تنبيهات الجهاز (Web Push) ─────────
// الحمولة لا تحمل إلا {type, link}؛ ونص شاشة القفل عام دائمًا بلا أكواد ولا بيانات مستفيدين.
const PUSH_TEXT = 'لديك تحديث في منصة الدعم القانوني';

function safeLink(link) {
  const s = String(link || '');
  return /^#\/[A-Za-z0-9/_?=&-]*$/.test(s) ? s : '#/my';
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const link = safeLink(payload.link);
  event.waitUntil(
    self.registration.showNotification(PUSH_TEXT, {
      body: '',
      lang: 'ar',
      dir: 'rtl',
      tag: 'bm-update',
      renotify: true,
      icon: '/assets/img/apple-touch-icon.png',
      badge: '/assets/img/favicon.svg',
      data: { link },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = safeLink(event.notification.data && event.notification.data.link);
  const target = `/app${link}`;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        const u = new URL(c.url);
        if (u.origin === self.location.origin && (u.pathname === '/app' || u.pathname === '/app/')) {
          await c.focus();
          // التنقل داخل المنصة المفتوحة (تعرض صفحة الدخول أولًا إن انتهت الجلسة)
          if ('navigate' in c) await c.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function offlineResponse() {
  const org = escapeHtml(ORG_NAME || 'مؤسسة بيوت مصر');
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b3d29">
<title>لا يوجد اتصال — ${org}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#032516;color:#fff;
    font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;line-height:1.7;font-size:17px}
  main{max-width:440px;width:100%;padding:24px 8px;text-align:center}
  .logo{display:block;width:220px;max-width:70vw;height:auto;margin:0 auto 28px}
  h1{font-size:22px;margin:0 0 8px}
  p{margin:0 0 12px;color:rgba(255,255,255,.82)}
  .retry{display:inline-flex;align-items:center;justify-content:center;font-weight:600;margin-top:8px;min-height:50px;padding:10px 28px;border-radius:14px;background:#cca454;color:#052015;text-decoration:none}
  .retry:focus-visible{outline:3px solid #fff;outline-offset:3px}
  small{display:block;margin-top:16px;color:rgba(255,255,255,.75);font-size:14px}
</style>
</head>
<body>
<main>
  <!-- v11 visual (V11-04 rule 2): the bright gold lockup on the logo ground (served from the precache) -->
  <img class="logo" src="/assets/img/emam-logo-gold.svg" width="220" height="92" alt="${org}">
  <h1>لا يوجد اتصال بالإنترنت</h1>
  <p>تعذر فتح منصة ${org} لأن جهازك غير متصل بالشبكة الآن.</p>
  <p>تحقق من اتصال الإنترنت ثم أعد المحاولة. لا يُحفظ على الجهاز من بيانات الملفات إلا القليل اللازم للعمل دون اتصال، ويُمسح عند تسجيل الخروج.</p>
  <a class="retry" href="/app">إعادة المحاولة</a>
  <small>ستعود المنصة للعمل تلقائيًا فور عودة الاتصال.</small>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // صفحة مولدة محليًا بلا أي سكربت
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
    },
  });
}
