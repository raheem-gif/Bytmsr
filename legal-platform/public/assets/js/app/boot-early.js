// v9.1 l-home (L-07): طلب الإقلاع قبل وصول وحدات التطبيق (سكربت عادي صغير بخاصية async — لا ينتظر شجرة الوحدات).
// يُضاف لصفحة /app لمن يحمل كعكة جلسة فقط (رابط إشعار أو فتح يومي)، ويبدأ فورًا:
//   - /api/auth/session بنفس الرابط الذي يطلبه main.js (boot): مع meta إن لم تكن محفوظة على الجهاز، ومع page=…
//     لبيانات صفحة المحامي المطلوبة في الرابط (يرسلها الخادم لمحامٍ بجلسة صالحة فقط — app.sessionPageData)،
//   - وحدة تلك الصفحة وكل ما تستورده (روابط modulepreload من قائمة يكتبها الخادم في #bm-assets).
// الرد يُحفظ في window.__bmEarlyGets ويأخذه api.get بالرابط نفسه مرة واحدة خلال 15 ثانية (lib/api.js).
// لا شيء هنا يقرر الصلاحيات: الخادم يتحقق من الجلسة، والرد يُعالج عند أخذه كأي رد.
(function () {
  'use strict';
  try {
    var w = window;
    var hash = String(w.location.hash || '');
    if (/^#\/(invite|reset)(\/|$)/.test(hash)) return; // روابط الاستخدام الواحد لها مسارها
    var gets = w.__bmEarlyGets || (w.__bmEarlyGets = {});
    var read = function (k) {
      try {
        return w.localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    };
    var info = {};
    try {
      info = JSON.parse((document.getElementById('bm-assets') || {}).textContent || '{}') || {};
    } catch (e) {
      info = {};
    }
    var cached = false;
    try {
      var m = JSON.parse(read('bm-meta') || 'null');
      cached = !!(m && m.meta && typeof m.etag === 'string');
    } catch (e) {
      cached = false;
    }
    var role = read('bm-last-role');
    var known = !!role || info.sid === 1;
    if (!known) return;
    // تسجيل خروج لم يصل للخادم بعد (بلا شبكة): main.js يرسله أولًا — لا طلب لبيانات الجلسة قبله
    if (read('bm-logout-pending')) return;

    var raw = hash.replace(/^#!?/, '');
    var qi = raw.indexOf('?');
    var path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, '') || '/';
    var id = function (s) {
      try {
        return encodeURIComponent(decodeURIComponent(s));
      } catch (e) {
        return encodeURIComponent(s);
      }
    };
    // يطابق LAWYER_DATA في routes.js و«اليوم» في main.js (اختبار في test/v91-l-home.test.js يتحقق من التطابق)
    var table = [
      [/^\/my\/assignments\/([^/]+)\/write$/, 'app/pages/lawyer/write.js', function (x) { return '/lawyer/assignments/' + id(x[1]); }],
      [/^\/my\/assignments\/([^/]+)$/, 'app/pages/lawyer/assignment.js', function (x) { return '/lawyer/assignments/' + id(x[1]); }],
      [/^\/my\/assignments$/, 'app/pages/lawyer/assignments.js', null],
      [/^\/my\/matters\/([^/]+)$/, 'app/pages/lawyer/matter.js', function (x) { return '/lawyer/matters/' + id(x[1]); }],
      [/^\/my\/matters$/, 'app/pages/lawyer/matters.js', function () { return '/lawyer/matters'; }],
      [/^\/my\/statement$/, 'app/pages/lawyer/statement.js', function () { return '/lawyer/statement'; }],
      [/^\/my\/calendar$/, 'app/pages/lawyer/calendar.js', null],
      [/^\/notifications$/, 'app/pages/notifications.js', null],
      [/^\/account$/, 'app/pages/account.js', null],
    ];
    var page = null;
    var module = null;
    if (role !== 'staff') {
      if (path === '/' || path === '/my') page = role === 'lawyer' ? '/lawyer/today' : null;
      else {
        for (var i = 0; i < table.length; i++) {
          var hit = table[i][0].exec(path);
          if (!hit) continue;
          page = table[i][2] ? table[i][2](hit) : null;
          module = table[i][1];
          break;
        }
      }
    }
    // نفس ترتيب المعاملات وترميزها في api.js (buildUrl): meta ثم page
    var qs = new URLSearchParams();
    if (!cached) qs.set('meta', 'full');
    if (page) qs.set('page', page);
    var q = qs.toString();
    var url = '/api/auth/session' + (q ? '?' + q : '');
    if (!gets[url]) {
      var p = fetch(url, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      p.catch(function () {});
      gets[url] = { promise: p, at: Date.now() };
    }
    var urls = (module && info.graph && info.graph[module]) || [];
    for (var j = 0; j < urls.length; j++) {
      var u = urls[j];
      if (typeof u !== 'string' || u.indexOf('/assets/js/') !== 0) continue;
      var link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = u;
      document.head.appendChild(link);
    }
  } catch (e) {
    /* تحسين أداء فقط: أي خطأ هنا لا يمنع الإقلاع العادي */
  }
})();
