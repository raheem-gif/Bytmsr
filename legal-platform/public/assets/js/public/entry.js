// v12 entry (E12-25، L12-87): صفحات «/» و/start/… تعمل كلها بروابط عادية بلا JavaScript. هذه الوحدة صغيرة بلا import:
// (1) مصدر الزيارة من أول صفحة في الجلسة (نفس مفتاح menu.js)، (2) «متابعة طلب» تصبح «صفحة طلبكم» إن حُفظت على هذا الجهاز،
// (3) في المستوى الثالث تُحمَّل ملفات نموذج الطلب مسبقًا بعد التحميل، (4) ضغطة ثانية على صف خلال 3 ثوانٍ تُتجاهل.
const d = document;
const b = d.body;
try {
  const ss = sessionStorage;
  if (!ss.getItem('bm_attribution')) {
    const p = new URLSearchParams(location.search);
    const a = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', ref: '', referrer: '', landing_path: location.pathname };
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref']) a[k] = (p.get(k) || '').trim().slice(0, 200);
    const r = d.referrer;
    if (r && new URL(r).origin !== location.origin) a.referrer = r.slice(0, 500);
    ss.setItem('bm_attribution', JSON.stringify(a));
  }
} catch {
  /* التخزين غير متاح */
}
try {
  const s = JSON.parse(localStorage.getItem('bm_portal') || 'null');
  const u = s && new URL(String(s.url), location.origin);
  const f = d.querySelector('[data-follow]');
  if (f && u && u.origin === location.origin && /^\/p\/[A-Za-z0-9_-]{20,100}$/.test(u.pathname)) {
    f.href = u.pathname;
    f.textContent = 'صفحة طلبكم';
  }
} catch {
  /* لا صفحة محفوظة */
}
if (b.dataset.depth === '3' && b.dataset.prefetch) {
  const run = () => {
    const c = navigator.connection;
    if (c?.saveData || /2g$/.test(String(c?.effectiveType || ''))) return;
    for (const h of b.dataset.prefetch.split(/\s+/).filter(Boolean)) {
      const l = d.createElement('link');
      l.rel = 'prefetch';
      l.href = h;
      d.head.append(l);
    }
  };
  addEventListener('load', () => (window.requestIdleCallback ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1500)), { once: true });
}
let going = null;
d.addEventListener('click', (e) => {
  const o = e.target.closest?.('a.opt');
  if (!o || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  if (going && Date.now() - going.t < 3000) return e.preventDefault();
  going = { t: Date.now(), o };
  o.classList.add('opt--going');
  o.setAttribute('aria-busy', 'true');
});
addEventListener('pageshow', () => {
  if (!going) return;
  going.o.classList.remove('opt--going');
  going.o.removeAttribute('aria-busy');
  going = null;
});
// v12 tags (TG-1، T12-30، انحراف موثَّق: «/» وصفحات الأسئلة لا تحمّل menu.js): رموز العناصر للمالك فقط. tags-boot.js يُحمَّل
// بمسار غير حرفي مع ?tags= أو ?tag= أو تفضيل محفوظ أو أول Alt+Shift+T، ولا شيء غير ذلك للزائر.
let tb = 0;
const tags = (t) => tb++ || import('/assets/js/lib/' + 'tags-boot.js').then((m) => (m.tagsBoot(), t && m.tagsToggle()), () => {});
try {
  if (/[?&]tags?=/.test(location.search + location.hash) || sessionStorage.bm_tags || localStorage.bm_tags) tags();
} catch {
  /* التخزين غير متاح */
}
addEventListener('keydown', (e) => !tb && e.altKey && e.shiftKey && e.code === 'KeyT' && tags(1));
