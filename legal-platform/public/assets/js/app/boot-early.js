// v9.1 l-home (L-07): طلبات الإقلاع قبل وصول وحدات التطبيق (سكربت عادي صغير بخاصية async — لا ينتظر شجرة الوحدات).
// يُضاف لصفحة /app لمن يحمل كعكة جلسة فقط (رابط إشعار أو فتح يومي). يبدأ فورًا:
//   - /api/auth/session (مع meta إن لم تكن محفوظة على الجهاز) — بنفس الرابط الذي يطلبه main.js،
//   - بيانات صفحة المحامي المطلوبة في الرابط (مثل /api/lawyer/matters/2) أو «اليوم»،
//   - وحدة تلك الصفحة وكل ما تستورده (روابط modulepreload من قائمة يكتبها الخادم في #bm-assets).
// الردود تُحفظ في window.__bmEarlyGets ويأخذها api.get بنفس الرابط مرة واحدة خلال 15 ثانية (lib/api.js).
// لا شيء هنا يقرر الصلاحيات: الخادم يتحقق من الجلسة في كل طلب، والرد يُعالج عند أخذه كأي رد.
(function () {
  'use strict';
  try {
    var w = window;
    var hash = String(w.location.hash || '');
    if (/^#\/(invite|reset)(\/|$)/.test(hash)) return; // روابط الاستخدام الواحد لها مسارها
    var gets = w.__bmEarlyGets || (w.__bmEarlyGets = {});
    var get = function (url, background) {
      if (gets[url]) return;
      var headers = { Accept: 'application/json' };
      if (background) headers['X-Background-Request'] = '1';
      var p = fetch(url, { method: 'GET', credentials: 'same-origin', headers: headers });
      p.catch(function () {});
      gets[url] = { promise: p, at: Date.now() };
    };
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
    // نفس منطق main.js (boot): meta كاملة لمن سبق دخوله أو يحمل جلسة، وصغيرة لشاشة الدخول
    get('/api/auth/session' + (cached ? '' : '?meta=' + (known ? 'full' : 'login')));
    if (!known || role === 'staff') return;

    var raw = hash.replace(/^#!?/, '');
    var qi = raw.indexOf('?');
    var path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, '') || '/';
    if (path === '/' || path === '/my') {
      if (role === 'lawyer') get('/api/lawyer/today', true);
      return;
    }
    var id = function (s) {
      try {
        return encodeURIComponent(decodeURIComponent(s));
      } catch (e) {
        return encodeURIComponent(s);
      }
    };
    // يطابق LAWYER_DATA في routes.js (اختبار في test/v91-l-home.test.js يتحقق من التطابق)
    var table = [
      [/^\/my\/assignments\/([^/]+)\/write$/, 'app/pages/lawyer/write.js', function (x) { return '/api/lawyer/assignments/' + id(x[1]); }],
      [/^\/my\/assignments\/([^/]+)$/, 'app/pages/lawyer/assignment.js', function (x) { return '/api/lawyer/assignments/' + id(x[1]); }],
      [/^\/my\/assignments$/, 'app/pages/lawyer/assignments.js', null],
      [/^\/my\/matters\/([^/]+)$/, 'app/pages/lawyer/matter.js', function (x) { return '/api/lawyer/matters/' + id(x[1]); }],
      [/^\/my\/matters$/, 'app/pages/lawyer/matters.js', function () { return '/api/lawyer/matters'; }],
      [/^\/my\/statement$/, 'app/pages/lawyer/statement.js', function () { return '/api/lawyer/statement'; }],
      [/^\/my\/calendar$/, 'app/pages/lawyer/calendar.js', null],
      [/^\/notifications$/, 'app/pages/notifications.js', null],
      [/^\/account$/, 'app/pages/account.js', null],
    ];
    for (var i = 0; i < table.length; i++) {
      var hit = table[i][0].exec(path);
      if (!hit) continue;
      if (table[i][2]) get(table[i][2](hit));
      var urls = (info.graph && info.graph[table[i][1]]) || [];
      for (var j = 0; j < urls.length; j++) {
        var u = urls[j];
        if (typeof u !== 'string' || u.indexOf('/assets/js/') !== 0) continue;
        var link = document.createElement('link');
        link.rel = 'modulepreload';
        link.href = u;
        document.head.appendChild(link);
      }
      break;
    }
  } catch (e) {
    /* تحسين أداء فقط: أي خطأ هنا لا يمنع الإقلاع العادي */
  }
})();
