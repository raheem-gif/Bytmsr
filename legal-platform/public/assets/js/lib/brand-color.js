// ألوان المؤسسة (v9.2، C92): توليد درجات الألوان من لونين مع ضمان تباين WCAG AA لكل زوج نص/خلفية تستخدمه أوراق الأنماط.
// وحدة نقية بلا استيراد ولا DOM: يستوردها الخادم (src/brand.js) وصفحة الإعدادات (المعاينة الحية) فتتطابق النتيجة حرفيًا.

export const DEFAULT_PRIMARY = '#0f4c5c';
export const DEFAULT_ACCENT = '#b8862e';
export const PRIMARY_STEPS = [50, 100, 200, 300, 500, 600, 700, 800, 900];
export const ACCENT_STEPS = [50, 100, 300, 400, 500, 600, 700, 800];
export const RGB_TOKENS = [['primary', 300], ['primary', 500], ['primary', 700], ['primary', 900], ['accent', 500]];

/** الدرجات الحالية كما هي (الافتراضي = نفس شكل 9.1 بالضبط) */
export const LEGACY = Object.freeze({
  primary: Object.freeze({ 50: '#eef6f7', 100: '#dcecef', 200: '#b9d7de', 300: '#7fb3c0', 500: '#1b7187', 600: '#145d6f', 700: '#0f4c5c', 800: '#0b3a46', 900: '#082a33' }),
  accent: Object.freeze({ 50: '#fbf7ee', 100: '#f6ecd8', 300: '#dcbd84', 400: '#c99a45', 500: '#b8862e', 600: '#9a6e22', 700: '#7a5518', 800: '#634510' }),
});

// ───── تحويلات sRGB ↔ OKLab/OKLCH ─────
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** '#ABC' · 'abc' · ' #AbCdEf ' → '#aabbcc'؛ غير ذلك null */
export function normHex(s) {
  let h = String(s ?? '').trim().toLowerCase();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/.test(h)) h = `#${h.slice(1).split('').map((c) => c + c).join('')}`;
  return /^#[0-9a-f]{6}$/.test(h) ? h : null;
}
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (rgb01) => `#${rgb01.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;
function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function hexToOklch(hex) {
  const [L, a, b] = linToOklab(hexToRgb(hex).map((c) => toLin(c / 255)));
  const C = Math.hypot(a, b);
  return { L, C, h: C < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
const lab = (L, C, h) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const inGamut = (lin) => lin.every((c) => c >= -1e-6 && c <= 1 + 1e-6);
/** OKLCH → hex داخل sRGB: يُخفَّض التشبع (C) بالبحث الثنائي حتى يدخل اللون النطاق، مع ثبات L وh */
export function oklchToHex(L, C, h) {
  let lin = oklabToLin(lab(L, C, h));
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLin(lab(L, mid, h)))) lo = mid;
      else hi = mid;
    }
    lin = oklabToLin(lab(L, lo, h));
  }
  return rgbHex(lin.map((c) => toGam(Math.min(1, Math.max(0, c)))));
}

// ───── التباين (WCAG 2.x) ─────
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => toLin(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** لون fg بشفافية alpha فوق bg (مزج في sRGB كما يرسم المتصفح) */
export function over(fg, alpha, bg) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbHex(f.map((c, i) => (c * alpha + b[i] * (1 - alpha)) / 255));
}

// ───── عقد التباين: كل زوج نص/خلفية (أو أيقونة/خلفية) تستخدمه أوراق الأنماط ─────
// [id, fg, bg, min, الاستخدام]. الرموز: pNNN/aNNN درجة، '#hex' لون ثابت، 'ink' = حبر النص فوق اللون الثاني (= p900)،
// 'w75' = أبيض بشفافية 75% فوق الخلفية، 'ov12(p700)' = p700 تحت طبقة بيضاء 12%.
export const CONTRACT = Object.freeze([
  ['T1', '#ffffff', 'p700', 4.5, 'نص أبيض على الأزرار الرئيسية ورأس الصفحات والبطل'],
  ['T2', '#ffffff', 'p800', 4.5, 'نص أبيض على تمرير الأزرار والقائمة الجانبية'],
  ['T3', '#ffffff', 'p900', 4.5, 'نص أبيض أسفل القائمة الجانبية والتذييل'],
  ['T3b', 'w75', 'p900', 4.5, 'نص التذييل (أبيض 75%)'],
  ['T4', 'p700', 'p50', 4.5, 'شارات وأزرار شبحية'],
  ['T5', 'p700', 'p100', 4.5, 'أيقونات ونصوص على خلفية فاتحة'],
  ['T6', 'p800', 'p100', 4.5, 'الصور الرمزية'],
  ['T7', 'p900', 'p50', 4.5, 'المربع المختار في نموذج الطلب'],
  ['T7b', '#16202a', 'p50', 4.5, 'صفوف القوائم عند التمرير'],
  ['T8', 'p600', '#ffffff', 4.5, 'الروابط'],
  ['T9', 'p600', '#f3f5f7', 4.5, 'الروابط على خلفية المنصة'],
  ['T10', 'p600', '#fbf8f2', 4.5, 'الروابط على خلفية الموقع الكريمية'],
  ['T11', 'p600', 'p50', 4.5, 'الروابط داخل الصناديق الملونة'],
  ['T12', 'p700', '#fbf8f2', 4.5, 'عناوين وأزرار ثانوية على خلفية الموقع'],
  ['T12b', 'p700', '#edf1f4', 4.5, 'أيقونة البحث'],
  ['T13', 'a700', 'a100', 4.5, 'شارات اللون الثاني'],
  ['T13b', '#16202a', 'a100', 4.5, 'تحديد النص'],
  ['T14', 'a700', 'a50', 4.5, 'مربعات الخدمات'],
  ['T15', 'a800', 'a100', 4.5, 'الصور الرمزية'],
  ['T16', 'a800', 'a50', 4.5, 'التواريخ والنصائح'],
  ['T17', 'a600', '#ffffff', 4.5, 'نص/أيقونة باللون الثاني على أبيض، وحافة أزرار اللون الثاني'],
  ['T18', '#ffffff', 'a600', 4.5, 'تمرير زر اللون الثاني في المنصة'],
  ['T19', 'ink', 'a500', 4.5, 'زر «احكيلنا مشكلتك» وعدادات القائمة'],
  ['T20', 'ink', 'a400', 4.5, 'تمرير زر «احكيلنا مشكلتك»'],
  ['T21', 'ink', 'a300', 4.5, 'أرقام «إزاي بنشتغل»'],
  ['N1', 'a500', 'p800', 3, 'زر اللون الثاني فوق البطل الغامق (حدود المكوّن)'],
  ['N2', 'a300', 'p900', 3, 'أيقونات القائمة الجانبية'],
  ['N3', 'p500', '#ffffff', 3, 'حدود الحقل عند التركيز وأشرطة التقدم'],
  ['N4', 'a300', 'ov12(p700)', 3, 'أيقونات فوق طبقة بيضاء على الخلفية الغامقة'],
]);
const PRIMARY_ONLY = new Set(['T1', 'T2', 'T3', 'T3b', 'T4', 'T5', 'T6', 'T7', 'T7b', 'T8', 'T9', 'T10', 'T11', 'T12', 'T12b', 'N3']);

function resolveTok(tok, P, A) {
  if (tok.startsWith('#')) return tok;
  if (tok === 'ink') return P[900];
  const m = /^ov12\(([pa])(\d+)\)$/.exec(tok);
  if (m) return over('#ffffff', 0.12, (m[1] === 'p' ? P : A)[m[2]]);
  return (tok[0] === 'p' ? P : A)[tok.slice(1)];
}
/** نتيجة كل زوج في العقد لدرجات معطاة { primary: {50:'#..'}, accent: {...} } */
export function checkContract(theme) {
  const P = theme.primary;
  const A = theme.accent;
  return CONTRACT.map(([id, fg, bg, min, use]) => {
    const bgHex = resolveTok(bg, P, A);
    const fgHex = fg === 'w75' ? over('#ffffff', 0.75, bgHex) : resolveTok(fg, P, A);
    const ratio = contrast(fgHex, bgHex);
    return { id, fg: fgHex, bg: bgHex, ratio: Math.round(ratio * 100) / 100, min, ok: ratio >= min, use };
  });
}

// ───── السلالم ─────
// [L ثابتة في OKLab، معامل التشبع نسبةً إلى تشبع اللون المُدخل، أقصى تشبع]
const P_TINT = { 50: [0.967, 0.134, 0.015], 100: [0.932, 0.273, 0.03], 200: [0.859, 0.519, 0.06], 300: [0.735, 0.899, 0.1] };
const P_CF = { 500: 1.311, 600: 1.142, 700: 1, 800: 0.816, 900: 0.643 };
const A_FIXED = { 50: [0.977, 0.106, 0.015], 100: [0.946, 0.242, 0.035], 300: [0.812, 0.693, 0.1], 600: [0.57, 0.889], 700: [0.478, 0.753], 800: [0.414, 0.658] };
const A_CF_400 = 0.982;
const STEP = 0.005;

function step(L, C, h) {
  return { L, C, h, hex: oklchToHex(L, C, h) };
}
function primaryScale(a, inp) {
  const { C, h } = inp;
  const L300 = P_TINT[300][0];
  const S = {};
  for (const k of [50, 100, 200, 300]) S[k] = step(P_TINT[k][0], Math.min(C * P_TINT[k][1], P_TINT[k][2]), h);
  S[500] = step(L300 + 0.646 * (a - L300), C * P_CF[500], h);
  S[600] = step(L300 + 0.836 * (a - L300), C * P_CF[600], h);
  S[700] = step(a, C, h);
  S[800] = step(Math.min(0.837 * a, 0.36), C * P_CF[800], h);
  S[900] = step(Math.min(0.686 * a, 0.29), C * P_CF[900], h);
  return S;
}
function accentScale(b, inp) {
  const { C, h } = inp;
  const L300 = Math.max(A_FIXED[300][0], b + 0.04);
  const S = {};
  for (const k of [50, 100]) S[k] = step(A_FIXED[k][0], Math.min(C * A_FIXED[k][1], A_FIXED[k][2]), h);
  S[300] = step(L300, Math.min(C * A_FIXED[300][1], A_FIXED[300][2]), h);
  S[400] = step(b + 0.38 * (L300 - b), C * A_CF_400, h);
  S[500] = step(b, C, h);
  for (const k of [600, 700, 800]) S[k] = step(A_FIXED[k][0], C * A_FIXED[k][1], h);
  return S;
}
const hexes = (S) => Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.hex]));
const ok = (fg, bg, min) => contrast(fg, bg) >= min;
/** يحرّك L لدرجة واحدة من قيمتها نحو bound حتى ينجح test (بحث ثنائي على أول قيمة ناجحة). false إن لم ينجح حتى عند bound. */
function nudge(S, k, test, bound) {
  if (test()) return true;
  const s = S[k];
  const start = s.L;
  const set = (L) => Object.assign(s, { L, hex: oklchToHex(L, s.C, s.h) });
  set(bound);
  if (!test()) {
    set(start);
    return false;
  }
  let pass = bound;
  let fail = start;
  for (let i = 0; i < 14; i += 1) {
    const mid = (pass + fail) / 2;
    set(mid);
    if (test()) pass = mid;
    else fail = mid;
  }
  set(pass);
  return true;
}
function primaryFor(a, inp, inputHex) {
  const P = primaryScale(a, inp);
  if (a === inp.L) P[700].hex = inputHex; // بلا تعديل: لون الإدارة نفسه حرفيًا
  const H = () => hexes(P);
  nudge(P, 600, () => { const x = H(); return ok(x[600], '#ffffff', 4.5) && ok(x[600], '#f3f5f7', 4.5) && ok(x[600], '#fbf8f2', 4.5) && ok(x[600], x[50], 4.5); }, P[700].L + 0.01);
  nudge(P, 500, () => ok(P[500].hex, '#ffffff', 3), P[600].L + 0.01);
  return P;
}
function accentFor(b, inp, inputHex, P) {
  const A = accentScale(b, inp);
  if (b === inp.L) A[500].hex = inputHex;
  const ink = P[900].hex;
  nudge(A, 700, () => ok(A[700].hex, A[100].hex, 4.5) && ok(A[700].hex, A[50].hex, 4.5), 0.3);
  nudge(A, 800, () => ok(A[800].hex, A[100].hex, 4.5) && ok(A[800].hex, A[50].hex, 4.5), Math.min(0.25, A[700].L - 0.01));
  nudge(A, 600, () => ok('#ffffff', A[600].hex, 4.5), A[700].L + 0.01);
  nudge(A, 300, () => ok(A[300].hex, over('#ffffff', 0.12, P[700].hex), 3) && ok(ink, A[300].hex, 4.5), A[100].L - 0.01);
  nudge(A, 400, () => ok(ink, A[400].hex, 4.5), A[300].L - 0.01);
  return A;
}
const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const dist = (x, y) => { const p = hexToOklch(x); const q = hexToOklch(y); const [a1, b1] = [p.C * Math.cos((p.h * Math.PI) / 180), p.C * Math.sin((p.h * Math.PI) / 180)]; const [a2, b2] = [q.C * Math.cos((q.h * Math.PI) / 180), q.C * Math.sin((q.h * Math.PI) / 180)]; return Math.hypot(p.L - q.L, a1 - a2, b1 - b2); };

/**
 * يبني ألوان المؤسسة من لونين. يعيد { primary, accent, adjustments, legacy } أو null (لا يحدث عمليًا؛ الاختبار يتحقق).
 * adjustments: [{ role: 'primary'|'accent', from, to, reason: 'darkened'|'lightened', minor }]
 */
export function buildTheme(primaryIn, accentIn) {
  const p = normHex(primaryIn);
  const a = normHex(accentIn);
  if (!p || !a) throw new TypeError('brand: invalid hex');
  if (p === DEFAULT_PRIMARY && a === DEFAULT_ACCENT) return { primary: { ...LEGACY.primary }, accent: { ...LEGACY.accent }, adjustments: [], legacy: true };
  const pi = hexToOklch(p);
  const ai = hexToOklch(a);
  // 1) اللون الأساسي = الدرجة 700: أقرب L للمُدخل (داخل [0.22, 0.62]) تنجح فيها كل أزواج الأساسي؛ التغميق ينجح دائمًا
  let aL = clamp(pi.L, 0.22, 0.62);
  const probeA = hexes(accentScale(0.65, { C: 0, h: 0 }));
  const primaryFails = (P) => checkContract({ primary: hexes(P), accent: probeA }).some((r) => !r.ok && PRIMARY_ONLY.has(r.id));
  let P = primaryFor(aL, pi, p);
  while (primaryFails(P) && aL > 0.18) {
    aL -= STEP;
    P = primaryFor(aL, pi, p);
  }
  // 2) اللون الثاني = الدرجة 500: المرشحون بالبعد عن المُدخل (داخل [0.5, 0.85]) والأفتح أولًا عند التساوي؛
  //    إن لم ينجح أي مرشح يُغمَّق الأساسي 0.02 ويُعاد (حبر النص فوق اللون الثاني = p900)
  for (let guard = 0; guard < 12; guard += 1) {
    const b0 = clamp(ai.L, 0.5, 0.85);
    const cands = [b0];
    for (let d = 0.01; d <= 0.35 + 1e-9; d += 0.01) for (const v of [b0 + d, b0 - d]) if (v >= 0.5 - 1e-9 && v <= 0.85 + 1e-9) cands.push(v);
    for (const bL of cands) {
      const A = accentFor(bL, ai, a, P);
      const theme = { primary: hexes(P), accent: hexes(A) };
      if (checkContract(theme).every((r) => r.ok)) {
        const adjustments = [];
        if (theme.primary[700] !== p) adjustments.push({ role: 'primary', from: p, to: theme.primary[700], reason: aL < pi.L ? 'darkened' : 'lightened', minor: dist(p, theme.primary[700]) < 0.03 });
        if (theme.accent[500] !== a) adjustments.push({ role: 'accent', from: a, to: theme.accent[500], reason: bL > ai.L ? 'lightened' : 'darkened', minor: dist(a, theme.accent[500]) < 0.03 });
        return { ...theme, adjustments, legacy: false };
      }
    }
    aL -= 0.02;
    P = primaryFor(aL, pi, p);
  }
  return null;
}

/** المتغيرات المولّدة (22): الدرجات + ثلاثيات RGB لاستخدام rgb(var(--x-rgb) / a) */
export function themeVars(theme) {
  const out = [];
  for (const k of PRIMARY_STEPS) out.push([`--primary-${k}`, theme.primary[k]]);
  for (const k of ACCENT_STEPS) out.push([`--accent-${k}`, theme.accent[k]]);
  for (const [role, k] of RGB_TOKENS) out.push([`--${role}-${k}-rgb`, hexToRgb(theme[role][k]).join(' ')]);
  return out;
}
/** كتلة CSS المضمّنة (html:root أعلى أولوية من :root في أي ملف، فلا يهم ترتيبها في الصفحة) */
export function themeCss(theme) {
  return `html:root{${themeVars(theme).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}
/** للمعاينة داخل عنصر واحد: المتغيرات + المشتقة (المشتقة على :root تُحسب هناك ولا تتبع متغيرات العنصر) */
export function previewVars(theme) {
  return [...themeVars(theme), ['--on-accent', theme.primary[900]], ['--link', theme.primary[600]]];
}

/**
 * اقتراح ألوان من صورة الشعار: rgba من getImageData. يتجاهل الشفاف والأبيض تقريبًا، ويجمع الألوان في صناديق 4 بت،
 * ثم يختار الأكثر تكرارًا بشرط تباعدها (مسافة OKLab ≥ 0.08). حتى max لون، مرتبة بالتكرار.
 */
export function dominantColors(rgba, { max = 4, sample = 12000 } = {}) {
  const n = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(n / sample));
  const buckets = new Map();
  for (let i = 0; i < n; i += stride) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    if (r > 240 && g > 240 && b > 240) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n += 1; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const picked = [];
  for (const e of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const hex = rgbHex([e.r / e.n / 255, e.g / e.n / 255, e.b / e.n / 255]);
    if (picked.every((p) => dist(p, hex) >= 0.08)) picked.push(hex);
    if (picked.length >= max) break;
  }
  return picked;
}
