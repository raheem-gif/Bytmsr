// v9.2 (بوابة الدمج G2) — «ألوان المؤسسة» في المنصة بعد تغييرها، من أول إعادة تحميل.
// صفحة /app يقدّمها عامل الخدمة من مخزنه أولًا (ثم يحدّثها في الخلفية)، فكانت أول إعادة تحميل بعد الحفظ تُظهر الألوان
// القديمة. الحل: (1) بعد الحفظ أو الإرجاع تُحدَّث نسخة /app المخزنة فورًا، و(2) عند فتح المنصة تُقارن كتلة الألوان في الصفحة
// (bm-theme data-v) بما يقوله الخادم في /api/meta (brand.v)، وتُستبدل الكتلة عند الاختلاف (لبقية الموظفين والأجهزة).

/** نفس فحص الخادم (src/brand.js): لا يُطبَّق على الصفحة إلا متغيرات ألوان بهذا الشكل */
const THEME_CSS_RE = /^html:root\{(--[a-z0-9-]+:[#0-9a-f ]+;?)+\}$/;
const CACHE_PREFIX = 'bm-static-';

/**
 * يحدّث نسخة صفحة /app في مخزن عامل الخدمة (كل مخازن bm-static-*) من الشبكة الآن، فتفتح المنصة بعدها بالألوان الجديدة.
 * لا يفعل شيئًا بلا عامل خدمة أو مخزن. لا يرمي أبدًا.
 * @returns {Promise<boolean>}
 */
export async function refreshAppShellCache() {
  try {
    if (typeof caches === 'undefined') return false;
    const keys = (await caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (!keys.length) return false;
    const res = await fetch('/app', { cache: 'no-cache', credentials: 'same-origin' });
    if (!res.ok || res.status !== 200 || res.redirected || res.type !== 'basic') return false;
    await Promise.all(keys.map(async (k) => (await caches.open(k)).put('/app', res.clone())));
    return true;
  } catch {
    return false;
  }
}

/** يطبّق كتلة الألوان (أو يزيلها للألوان الأصلية) على الصفحة الحالية. brand: { v, css, theme_color } أو null */
export function applyBrandTheme(brand) {
  if (typeof document === 'undefined') return false;
  const old = document.getElementById('bm-theme');
  const css = brand && typeof brand.css === 'string' ? brand.css : '';
  if (!css) {
    if (old) old.remove();
  } else {
    if (!THEME_CSS_RE.test(css)) return false;
    const el = document.createElement('style');
    el.id = 'bm-theme';
    el.dataset.v = String(brand.v || '');
    el.textContent = css;
    if (old) old.replaceWith(el);
    else document.head.appendChild(el);
  }
  const color = brand && /^#[0-9a-f]{6}$/.test(String(brand.theme_color || '')) ? brand.theme_color : '#0f4c5c';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color);
  return true;
}

/**
 * meta جديدة من الخادم: إن اختلفت ألوان الصفحة عما يقوله الخادم (صفحة قديمة من مخزن عامل الخدمة) تُستبدل الكتلة الآن
 * وتُحدَّث النسخة المخزنة. لا تُستدعى بنسخة meta المحفوظة على الجهاز (قد تكون أقدم من الصفحة).
 * @returns {boolean} هل تغيّرت ألوان الصفحة
 */
export function syncBrandTheme(meta) {
  if (!meta || typeof document === 'undefined') return false;
  const want = meta.brand && meta.brand.v && meta.brand.css ? meta.brand : null;
  const el = document.getElementById('bm-theme');
  const have = el ? el.dataset.v || '' : '';
  if ((want ? String(want.v) : '') === have) return false;
  const changed = applyBrandTheme(want);
  if (changed) refreshAppShellCache();
  return changed;
}
