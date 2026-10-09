// الإصدار 10 — بوابة الشركات (gate K8/J-09، §8.4، CO-12): طلبات الإقلاع قبل وصول شجرة الوحدات.
// سكربت عادي صغير بخاصية async في رأس /company (لا JavaScript مضمّن؛ CSP script-src 'self') — ليس وحدة من حزمة البوابة
// (لا يستورد state.js؛ يقرأ تلميح الجلسة فقط ولا يكتب شيئًا، وأي خطأ يُتجاهل). يبدأ فورًا
// /api/company/meta و/api/company/auth/session — ومعهما /api/company/home إن كانت الوجهة «المتابعة» وعلى الجهاز تلميح جلسة —
// بدل انتظار تحميل الوحدات كلها (كانت تبدأ بعد نحو 4 ثوانٍ على شبكة 3G بطيئة).
// الرد يُحفظ في window.__bmEarlyGets بالرابط نفسه الذي يبنيه lib/api.js، ويأخذه api.get مرة واحدة خلال 15 ثانية
// (early.js يتخطى ما بدأ هنا). لا شيء هنا يقرر الصلاحيات ولا يُكتب في التخزين.
(function () {
  'use strict';
  try {
    var w = window;
    var gets = w.__bmEarlyGets || (w.__bmEarlyGets = {});
    var get = function (url) {
      if (gets[url]) return;
      var p = fetch(url, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      p.catch(function () {});
      gets[url] = { promise: p, at: Date.now() };
    };
    get('/api/company/meta');
    get('/api/company/auth/session');
    var hash = String(w.location.hash || '').replace(/^#/, '');
    var path = hash.split('?')[0] || '/';
    var signed = null;
    try {
      signed = w.localStorage.getItem('ek.co.view:signed');
    } catch (e) {
      signed = null;
    }
    if ((path === '/' || path === '/overview') && signed) get('/api/company/home');
  } catch (e) {
    /* تحسين أداء فقط: أي خطأ هنا لا يمنع الإقلاع العادي (early.js يطلق الطلبات نفسها) */
  }
})();
