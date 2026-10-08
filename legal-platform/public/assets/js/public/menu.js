// قائمة الرأس على الهاتف ومعاملات الحملة (الإصدار 9.1 — B91-20): وحدة صغيرة بلا أي import،
// تكفي الصفحة الرئيسية والسياسات فلا تُحمّل مكتبة المكونات (ui.js) ولا مكتبة المنصة.

const KEY = 'bm_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CAMPAIGN_KEYS = [...UTM_KEYS, 'ref', 'fbclid', 'gclid'];

/** يلتقط مصدر الزيارة (UTM وref والمُحيل) عند أول صفحة في الجلسة ولا يستبدله بعد ذلك. */
export function captureAttribution() {
  try {
    if (window.sessionStorage.getItem(KEY)) return;
    const p = new URLSearchParams(window.location.search);
    const data = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', ref: '', referrer: '', landing_path: window.location.pathname };
    for (const k of [...UTM_KEYS, 'ref']) {
      const v = p.get(k);
      if (v) data[k] = v.trim().slice(0, 200);
    }
    const r = document.referrer || '';
    try {
      if (r && new URL(r).origin !== window.location.origin) data.referrer = r.slice(0, 500);
    } catch {
      /* مُحيل غير صالح */
    }
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلًا) */
  }
}

/** يضيف معاملات الحملة من الرابط الحالي إلى رابط داخلي دون أن يستبدل معاملاته (/intake?area=INH&utm_source=…). */
export function withCampaignParams(href) {
  let url;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return href;
  }
  if (url.origin !== window.location.origin) return href;
  const current = new URLSearchParams(window.location.search);
  for (const k of CAMPAIGN_KEYS) {
    const v = current.get(k);
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v.slice(0, 200));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** قائمة الرأس على الهاتف: فتح وإغلاق باللمس ولوحة المفاتيح (Esc). */
export function initMenu() {
  const toggle = document.querySelector('[data-pub-menu]');
  const nav = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!toggle || !nav || toggle.dataset.ready) return;
  toggle.dataset.ready = '1';
  const label = toggle.querySelector('.pub-sr');
  const setOpen = (open, focusToggle) => {
    toggle.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'إغلاق القائمة' : 'القائمة';
    nav.classList.toggle('is-open', open);
    if (!open && focusToggle) toggle.focus();
  };
  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
  toggle.addEventListener('click', () => {
    setOpen(!isOpen());
    if (isOpen()) nav.querySelector('a')?.focus();
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !e.target.closest('[data-pub-header]')) setOpen(false);
  });
  window.matchMedia?.('(min-width: 1081px)').addEventListener?.('change', (m) => {
    if (m.matches) setOpen(false);
  });
}

/** سلوك الرأس والتذييل المشترك: القائمة، وروابط البدء تحتفظ بمعاملات الحملة حتى صفحة الطلب. */
export function initSiteChrome() {
  initMenu();
  // v10 (X10-P3): iOS Safari لا يطبّق :active (ضغط المربعات والأزرار) إلا بمستمع touchstart في الصفحة
  document.addEventListener('touchstart', () => {}, { passive: true });
  document.querySelectorAll('a[data-cta="intake"]').forEach((a) => {
    a.setAttribute('href', withCampaignParams(a.getAttribute('href') || '/intake'));
  });
}
