// الإصدار 9.2 — مسار «ألوان المؤسسة»: مولّد الدرجات (G1–G9)، فحص أوراق الأنماط (L1–L6)، والتكامل مع الخادم (I1–I13).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, uniquePhone } from './lane-b-kit.test.js';
import * as B from '../public/assets/js/lib/brand-color.js';
import { LABELS } from '../src/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_DIR = path.join(ROOT, 'public/assets/css');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const THEME_CSS_RE = /^html:root\{(--[a-z0-9-]+:[#0-9a-f ]+;?)+\}$/;

// ───────────────────────── أزواج الاختبار (G3): 500 عشوائية ببذرة ثابتة + 144 زوجًا حديًا ─────────────────────────
const EDGE = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#f5c400', '#fff3c4', '#1a1a1a'];
function propertyPairs() {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed;
  };
  const hex = () => `#${(rnd() % 0x1000000).toString(16).padStart(6, '0')}`;
  const pairs = [];
  for (let i = 0; i < 500; i += 1) pairs.push([hex(), hex()]);
  for (const x of EDGE) for (const y of EDGE) pairs.push([x, y]);
  return pairs;
}
let PROPERTY_RESULTS = null; // [{ p, a, t, ms }] — تُحسب مرة واحدة لـ G3 وI13
function propertyResults() {
  if (!PROPERTY_RESULTS) {
    PROPERTY_RESULTS = propertyPairs().map(([p, a]) => {
      const t0 = performance.now();
      const t = B.buildTheme(p, a);
      return { p, a, t, ms: performance.now() - t0 };
    });
  }
  return PROPERTY_RESULTS;
}
const rgbDist = (x, y) => Math.max(...B.hexToRgb(x).map((c, i) => Math.abs(c - B.hexToRgb(y)[i])));

describe('v9.2 colours — generator (brand-color.js)', () => {
  test('G1 normHex accepts #abc / abcdef / spaced uppercase and rejects everything else', () => {
    assert.equal(B.normHex('#ABC'), '#aabbcc');
    assert.equal(B.normHex('abcdef'), '#abcdef');
    assert.equal(B.normHex(' #AbCdEf '), '#abcdef');
    for (const bad of ['red', '#12345', 'url(x)', '#12345g', '', null, undefined, '</style>', '#12']) assert.equal(B.normHex(bad), null, String(bad));
  });

  test('G2 the default pair returns LEGACY exactly (no adjustments) and LEGACY passes all 29 contract rows', () => {
    const t = B.buildTheme(B.DEFAULT_PRIMARY, B.DEFAULT_ACCENT);
    assert.deepEqual(t.primary, { ...B.LEGACY.primary });
    assert.deepEqual(t.accent, { ...B.LEGACY.accent });
    assert.equal(t.legacy, true);
    assert.deepEqual(t.adjustments, []);
    assert.equal(B.CONTRACT.length, 29);
    const rows = B.checkContract(B.LEGACY);
    assert.deepEqual(rows.filter((r) => !r.ok).map((r) => r.id), []);
  });

  test('G3 property run (500 seeded + 144 edge pairs): non-null, every contract row ok, valid hex, luminance strictly decreasing, < 200 ms each', () => {
    const results = propertyResults();
    assert.equal(results.length, 644);
    for (const { p, a, t, ms } of results) {
      assert.ok(t, `null theme for ${p}/${a}`);
      const bad = B.checkContract(t).filter((r) => !r.ok);
      assert.deepEqual(bad.map((r) => `${r.id} ${r.ratio}`), [], `${p}/${a}`);
      for (const [S, steps] of [[t.primary, B.PRIMARY_STEPS], [t.accent, B.ACCENT_STEPS]]) {
        for (const k of steps) assert.match(S[k], /^#[0-9a-f]{6}$/, `${p}/${a} step ${k}`);
        for (let i = 1; i < steps.length; i += 1) assert.ok(B.luminance(S[steps[i]]) < B.luminance(S[steps[i - 1]]), `${p}/${a} luminance ${steps[i - 1]}→${steps[i]}`);
      }
      assert.ok(ms < 200, `${p}/${a} took ${ms.toFixed(1)} ms`);
    }
  });

  test('G4 anchor fidelity: no adjustment ⇒ anchor = input; adjustment ⇒ from = input and to = anchor', () => {
    for (const { p, a, t } of propertyResults()) {
      for (const role of ['primary', 'accent']) {
        const input = B.normHex(role === 'primary' ? p : a);
        const anchor = role === 'primary' ? t.primary[700] : t.accent[500];
        const adj = t.adjustments.find((x) => x.role === role);
        if (!adj) assert.equal(anchor, input, `${p}/${a} ${role}`);
        else {
          assert.equal(adj.from, input, `${p}/${a} ${role} from`);
          assert.equal(adj.to, anchor, `${p}/${a} ${role} to`);
          assert.ok(['darkened', 'lightened'].includes(adj.reason));
        }
      }
    }
  });

  test('G5 a pair one step off the default is within 5/255 of LEGACY on every step, with no adjustments', () => {
    const t = B.buildTheme('#0f4c5d', '#b8862f');
    assert.deepEqual(t.adjustments, []);
    for (const k of B.PRIMARY_STEPS) assert.ok(rgbDist(t.primary[k], B.LEGACY.primary[k]) <= 5, `primary ${k}: ${t.primary[k]} vs ${B.LEGACY.primary[k]}`);
    for (const k of B.ACCENT_STEPS) assert.ok(rgbDist(t.accent[k], B.LEGACY.accent[k]) <= 5, `accent ${k}: ${t.accent[k]} vs ${B.LEGACY.accent[k]}`);
  });

  test('G6 known adjustment cases', () => {
    const yellow = B.buildTheme('#ffeb3b', B.DEFAULT_ACCENT).adjustments.find((x) => x.role === 'primary');
    assert.equal(yellow.reason, 'darkened');
    assert.equal(yellow.minor, false);
    assert.equal(B.buildTheme('#000000', B.DEFAULT_ACCENT).adjustments.find((x) => x.role === 'primary').reason, 'lightened');
    assert.equal(B.buildTheme(B.DEFAULT_PRIMARY, '#37474f').adjustments.find((x) => x.role === 'accent').reason, 'lightened');
    assert.deepEqual(B.buildTheme('#1a237e', '#c9a227').adjustments, []);
  });

  test('G7 themeCss: the allowed shape, exactly 22 declarations, < 700 bytes', () => {
    for (const [p, a] of [['#6a1b9a', '#f9a825'], ['#ffeb3b', '#ffffff'], ['#000000', '#000000'], ['#1a237e', '#c9a227']]) {
      const css = B.themeCss(B.buildTheme(p, a));
      assert.match(css, THEME_CSS_RE, `${p}/${a}`);
      assert.equal(css.slice('html:root{'.length, -1).split(';').length, 22, `${p}/${a}`);
      assert.ok(Buffer.byteLength(css) < 700, `${p}/${a} ${Buffer.byteLength(css)} bytes`);
    }
    const vars = B.previewVars(B.buildTheme('#6a1b9a', '#f9a825'));
    assert.equal(vars.length, 24);
    assert.deepEqual(vars.slice(-2).map(([k]) => k), ['--on-accent', '--link']);
  });

  test('G8 dominantColors on a synthetic logo buffer returns the two brand colours, ignoring white and transparent', () => {
    const px = new Uint8ClampedArray(100 * 100 * 4);
    for (let i = 0; i < 10000; i += 1) {
      const o = i * 4;
      const [r, g, b, al] = i < 5000 ? [15, 76, 92, 255] : i < 8000 ? [184, 134, 46, 255] : i < 9000 ? [255, 255, 255, 255] : [0, 0, 0, 0];
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = al;
    }
    assert.deepEqual(B.dominantColors(px), ['#0f4c5c', '#b8862e']);
  });

  test('G9 module purity: no imports, no DOM, and the file is the verbatim port the server and the browser both use', () => {
    const src = read('public/assets/js/lib/brand-color.js');
    assert.doesNotMatch(src, /^\s*import\b/m);
    assert.doesNotMatch(src, /^\s*export\b[^\n]*\bfrom\s*['"]/m);
    assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
    assert.match(read('src/brand.js'), /from '\.\.\/public\/assets\/js\/lib\/brand-color\.js'/);
    assert.match(read('public/assets/js/app/components/brand-settings.js'), /from '\.\.\/\.\.\/lib\/brand-color\.js'/);
  });
});

// ───────────────────────── فحص أوراق الأنماط ─────────────────────────
// 25 لونًا للعلامة (درجات 9.1 وما شابهها) و5 ثلاثيات RGB: لا تظهر إلا داخل كتلتي @brand-defaults.
const BRAND_HEX = ['#0f4c5c', '#145d6f', '#1b7187', '#0b3a46', '#082a33', '#7fb3c0', '#b9d7de', '#dcecef', '#eef6f7', '#e4f0f2', '#e7f1f3', '#d6e8ec', '#cfe1e5', '#5d8591', '#b8862e', '#c99a45', '#9a6e22', '#7a5518', '#634510', '#6b4a10', '#dcbd84', '#f6ecd8', '#f3e2bf', '#fbf7ee', '#fdf6e7'];
const BRAND_RGB = ['15, ?76, ?92', '184, ?134, ?46', '27, ?113, ?135', '127, ?179, ?192', '8, ?42, ?51'];
const HEX_RE = new RegExp(`(?:${BRAND_HEX.join('|')})(?![0-9a-f])`, 'i');
const RGB_RE = new RegExp(`rgba?\\(\\s*(?:${BRAND_RGB.map((s) => s.replace(/, \?/g, '\\s*,?\\s*')).join('|')})\\b`, 'i');
const BRAND_VAR_DECL = /(?:^|[\s;{])(--(?:primary|accent)-\d+(?:-rgb)?)\s*:/g;

const cssFiles = () => fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort();
const cssText = (f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8');

/** أسطر الملف مع علامة: داخل كتلة @brand-defaults أم لا */
function linesWithBlocks(text) {
  let inside = false;
  return text.split('\n').map((line, i) => {
    const start = line.includes('@brand-defaults-start');
    const end = line.includes('@brand-defaults-end');
    if (start) inside = true;
    const row = { n: i + 1, line, inside: inside || start || end };
    if (end) inside = false;
    return row;
  });
}
function defaultsBlocks(text) {
  return [...text.matchAll(/\/\*\s*@brand-defaults-start\s*\*\/([\s\S]*?)\/\*\s*@brand-defaults-end\s*\*\//g)].map((m) => m[1]);
}

// محلل CSS بسيط: القواعد (المحدد + التصريحات) مع تسطيح @media/@supports وتجاهل @font-face/@keyframes
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
function cssRules(text) {
  const out = [];
  const walk = (src) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const sel = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') depth -= 1;
        j += 1;
      }
      const body = src.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(sel)) walk(body);
      else if (!sel.startsWith('@')) out.push({ sel: sel.replace(/\s+/g, ' '), body });
      i = j;
    }
  };
  walk(stripComments(text));
  return out;
}
function declarations(body) {
  const out = [];
  for (const part of body.split(';')) {
    const k = part.indexOf(':');
    if (k > 0) out.push([part.slice(0, k).trim().toLowerCase(), part.slice(k + 1).trim().replace(/\s*!important$/, '')]);
  }
  return out;
}

/** كل الخصائص المخصصة المعرّفة في كل الملفات (الأسماء المستعارة --pub-* و--bmf-* و--bp-* و--link و--on-accent والمحايدة) */
function customProps() {
  const vars = new Map();
  for (const f of cssFiles()) for (const r of cssRules(cssText(f))) for (const [k, v] of declarations(r.body)) if (k.startsWith('--') && !vars.has(k)) vars.set(k, v);
  return vars;
}

/**
 * يحوّل قيمة color/background إلى رموز ألوان: { tok:'p700' } للدرجات، { hex } للألوان الثابتة، { white: alpha } للأبيض الشفاف؛
 * وما لا يمكن تحديده ثابتًا (طبقة شفافة من لون العلامة، currentColor، inherit…) يُتجاهل.
 */
function colourTerms(value, vars, depth = 0) {
  const out = [];
  if (value == null || depth > 10) return out;
  const re = /var\(\s*(--[\w-]+)\s*(?:,(?:[^()]|\([^()]*\))*)?\)|rgba?\((?:[^()]|\([^()]*\))*\)|#[0-9a-fA-F]{3,8}\b|\b(?:white|black)\b/g;
  for (const m of String(value).matchAll(re)) {
    const t = m[0];
    if (t.startsWith('var(')) {
      const name = m[1];
      const brand = /^--(primary|accent)-(\d+)$/.exec(name);
      if (brand) out.push({ tok: `${brand[1] === 'primary' ? 'p' : 'a'}${brand[2]}` });
      else if (!/-rgb$/.test(name) && vars.has(name)) out.push(...colourTerms(vars.get(name), vars, depth + 1));
    } else if (t.startsWith('rgb')) {
      const w = /^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(t);
      if (w) out.push(w[1] == null || Number(w[1]) >= 1 ? { hex: '#ffffff' } : { white: Number(w[1]) });
    } else if (t === 'white') out.push({ hex: '#ffffff' });
    else if (t === 'black') out.push({ hex: '#000000' });
    else {
      let hx = t.toLowerCase();
      if (hx.length === 4) hx = `#${[...hx.slice(1)].map((c) => c + c).join('')}`;
      if (hx.length === 7) out.push({ hex: hx });
    }
  }
  return out;
}
const termName = (x) => x.tok || x.hex || (x.white != null ? `w${Math.round(x.white * 100)}` : '?');

// عقد التباين بأسماء الرموز: ink = p900، والجانب الأغمق من كل صف كما في LEGACY (لا يتبدل لأي لونين: كل صف ≥ 3:1)
const CONTRACT_PAIRS = B.CONTRACT.map(([id, fg, bg, min]) => {
  const norm = (x) => (x === 'ink' ? 'p900' : x === '#ffffff' ? '#ffffff' : x);
  const f = norm(fg);
  const b = norm(bg);
  const hexOf = (x) => {
    if (x === 'w75') return '#ffffff';
    const m = /^ov12\((p|a)(\d+)\)$/.exec(x);
    if (m) return B.over('#ffffff', 0.12, B.LEGACY[m[1] === 'p' ? 'primary' : 'accent'][m[2]]);
    if (x.startsWith('#')) return x;
    return B.LEGACY[x[0] === 'p' ? 'primary' : 'accent'][x.slice(1)];
  };
  const [dark, light] = B.luminance(hexOf(f)) <= B.luminance(hexOf(b)) ? [f, b] : [b, f];
  return { id, fg: f, bg: b, min, dark, light };
});
const stepOf = (x) => {
  const m = /^(p|a)(\d+)$/.exec(x);
  return m ? { s: m[1], n: Number(m[2]) } : null;
};
/** x أغمق من y أو يساويه لأي لونين تختارهما المؤسسة (السلّم متناقص الإضاءة دائمًا — G3) */
function darkerEq(x, y) {
  if (x === y) return true;
  if (y === '#ffffff' || x === '#000000') return true;
  const sx = stepOf(x);
  const sy = stepOf(y);
  if (sx && sy) return sx.s === sy.s && sx.n >= sy.n;
  const ov = /^ov12\((p|a)(\d+)\)$/.exec(y);
  if (sx && ov) return sx.s === ov[1] && sx.n >= Number(ov[2]);
  if (x.startsWith('#') && y.startsWith('#')) return B.luminance(x) <= B.luminance(y);
  return false;
}
/**
 * هل الزوج (غير المرتب) صف في العقد، أو يلزم منه بالإضاءة (نص أغمق على خلفية أفتح من صف ناجح)؟
 * مراجعة 9.2: صفوف N (3:1 للحواف والأيقونات) لا تغطي إلا قاعدة لأيقونة أو شعار (nonText)؛ النص يحتاج صفًا ≥ 4.5.
 * (بدون هذا كان «الذهبي الفاتح a300 على p700» يمر عبر N4 وهو 4.03:1 فقط لزوج #ffeb3b/#ffffff — حالة ‎.pub-updated‎)
 */
function covered(a, b, { nonText = false } = {}) {
  for (const row of CONTRACT_PAIRS) {
    if (row.min < 4.5 && !nonText) continue;
    if ((row.fg === a && row.bg === b) || (row.fg === b && row.bg === a)) return row.id;
    if (row.light === 'w75' || row.dark === 'w75') continue;
    for (const [x, y] of [[a, b], [b, a]]) if (darkerEq(x, row.dark) && darkerEq(row.light, y)) return row.id;
  }
  // الأبيض الشفاف ≥ 75% على p900 (نص التذييل)
  for (const [x, y] of [[a, b], [b, a]]) {
    const w = /^w(\d+)$/.exec(x);
    if (w && Number(w[1]) >= 75 && y === 'p900') return 'T3b';
  }
  return null;
}

/** قاعدة لأيقونة أو شعار أو علامة (لا نص فيها): آخر جزء من كل محدد فيها صنف ينتهي بـ icon/logo/mark/dot/pic/swatch */
const NON_TEXT_CLASS = /(?:^|-)(?:icon|logo|mark|dot|pic|swatch)$/;
function nonTextSelector(sel) {
  return sel.split(',').every((part) => {
    const last = part.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '';
    return [...last.matchAll(/\.([\w-]+)/g)].some((m) => NON_TEXT_CLASS.test(m[1]));
  });
}

/** كل أزواج color/background في قاعدة واحدة تمس درجة من درجات العلامة */
function brandPairs() {
  const vars = customProps();
  const out = [];
  for (const f of cssFiles()) {
    for (const r of cssRules(cssText(f))) {
      const d = declarations(r.body);
      const color = d.filter(([k]) => k === 'color').pop();
      const bg = d.filter(([k]) => k === 'background' || k === 'background-color').pop();
      if (!color || !bg) continue;
      const cs = colourTerms(color[1], vars);
      const bs = colourTerms(bg[1], vars);
      for (const c of cs) {
        for (const b of bs) {
          if (!c.tok && !b.tok) continue;
          // طبقة بيضاء خفيفة (10–14%) فوق السطح الغامق = ov12(p700) في العقد (N4: أيقونات اللون الثاني فوق الشريط الغامق)
          const bgName = b.white != null && b.white <= 0.14 ? 'ov12(p700)' : termName(b);
          out.push({ f, sel: r.sel, fg: termName(c), bg: bgName, nonText: nonTextSelector(r.sel) });
        }
      }
    }
  }
  return out;
}

describe('v9.2 colours — stylesheet lint (all public/assets/css/*.css)', () => {
  test('L1 no brand hex outside the @brand-defaults blocks (var() fallbacks included), except lines marked @brand-exempt', () => {
    const bad = [];
    for (const f of cssFiles()) {
      for (const { n, line, inside } of linesWithBlocks(cssText(f))) {
        if (inside || line.includes('@brand-exempt')) continue;
        const m = HEX_RE.exec(line);
        if (m) bad.push(`${f}:${n} ${m[0]}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('L2 no brand rgb triplet outside the blocks (use rgb(var(--x-rgb) / a))', () => {
    const bad = [];
    for (const f of cssFiles()) {
      for (const { n, line, inside } of linesWithBlocks(cssText(f))) {
        if (inside || line.includes('@brand-exempt')) continue;
        if (RGB_RE.test(line)) bad.push(`${f}:${n} ${line.trim()}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('L3 exactly one defaults block in app.css and one in public-site.css, none elsewhere; each equals LEGACY (17 steps + 5 rgb triplets)', () => {
    for (const f of cssFiles()) {
      const blocks = defaultsBlocks(cssText(f));
      const expected = f === 'app.css' || f === 'public-site.css' ? 1 : 0;
      assert.equal(blocks.length, expected, `${f}: ${blocks.length} @brand-defaults blocks`);
      if (!blocks.length) continue;
      const decl = Object.fromEntries(declarations(stripComments(blocks[0])).filter(([k]) => k.startsWith('--')));
      const want = {};
      for (const k of B.PRIMARY_STEPS) want[`--primary-${k}`] = B.LEGACY.primary[k];
      for (const k of B.ACCENT_STEPS) want[`--accent-${k}`] = B.LEGACY.accent[k];
      for (const [role, k] of B.RGB_TOKENS) want[`--${role}-${k}-rgb`] = B.hexToRgb(B.LEGACY[role][k]).join(' ');
      assert.equal(Object.keys(want).length, 22);
      assert.deepEqual(Object.fromEntries(Object.entries(decl).map(([k, v]) => [k, v.toLowerCase()])), want, f);
    }
  });

  test('L4 brand variables (--primary-*, --accent-*, their -rgb) are declared only inside the blocks', () => {
    const bad = [];
    for (const f of cssFiles()) {
      const outside = linesWithBlocks(cssText(f)).filter((r) => !r.inside).map((r) => r.line).join('\n');
      for (const m of stripComments(outside).matchAll(BRAND_VAR_DECL)) bad.push(`${f} ${m[1]}`);
    }
    assert.deepEqual(bad, []);
  });

  test('L5 every color/background pair that uses a brand token is a contract row (or implied by one through the monotone scale)', () => {
    const pairs = brandPairs();
    assert.ok(pairs.length >= 80, `the scanner found only ${pairs.length} brand pairs — the parser is probably broken`);
    const bad = pairs.filter((p) => !covered(p.fg, p.bg, { nonText: p.nonText })).map((p) => `${p.f} ${p.sel}: ${p.fg} on ${p.bg}`);
    assert.deepEqual(bad, []);
    // الأزواج المعروفة تُطابق صفوفها
    assert.equal(covered('#ffffff', 'p700'), 'T1');
    assert.equal(covered('p900', 'a500'), 'T19');
    assert.equal(covered('p800', 'p50'), 'T4'); // أغمق من p700 على p50
    assert.equal(covered('w75', 'p900'), 'T3b');
    assert.equal(covered('#ffffff', 'a500'), null);
    assert.equal(covered('p300', '#ffffff'), null);
  });

  test('L5 (review) a 3:1 row (N1–N4) never covers text: a300 text on p700 fails, the same pair on an icon or logo passes', () => {
    // a300 على p700 مضمون 3:1 فقط (يلزم من N4)؛ نص ‎.pub-updated‎ بهذا الزوج كان 4.03:1 مع #ffeb3b/#ffffff
    assert.equal(covered('a300', 'p700'), null);
    assert.equal(covered('a300', 'ov12(p700)'), null);
    assert.equal(covered('p500', '#ffffff'), null, 'p500 text on white is only N3 (3:1)');
    assert.equal(covered('a300', 'p700', { nonText: true }), 'N4');
    assert.equal(covered('p500', '#ffffff', { nonText: true }), 'N3');
    assert.equal(nonTextSelector('.pub-logo'), true);
    assert.equal(nonTextSelector('.pa-decide-opt.is-primary .pa-decide-icon'), true);
    assert.equal(nonTextSelector('.login-points .pt-icon, .door-icon'), true);
    assert.equal(nonTextSelector('.hero-eyebrow'), false);
    assert.equal(nonTextSelector('.pub-updated'), false);
    assert.equal(nonTextSelector('.pub-logo, .pub-updated'), false);
    // زر «ابعتي ردّك» الخافت في صفحة المتابعة (زر يعمل، نصه أبيض): p600 لا طبقة شفافة من p700 (كانت 2.75:1 لأساسي فاتح)
    const portal = cssText('v91-portal.css');
    const soft = portal.slice(portal.indexOf('.bp-btn--primary.is-soft {'), portal.indexOf('}', portal.indexOf('.bp-btn--primary.is-soft {')));
    assert.match(soft, /background: var\(--primary-600\);/);
    assert.doesNotMatch(soft, /rgb\(var/);
    assert.match(portal, /\.bp-btn--primary \{[^}]*color: #fff;/);
    for (const { p, a, t } of propertyResults()) assert.ok(B.contrast('#ffffff', t.primary[600]) >= 4.5, `${p}/${a} white on p600`);
    // ‎.hero-eyebrow‎ (نص): أبيض بلا طبقة بيضاء، لا ذهبي فاتح
    const app = cssText('app.css');
    const i = app.indexOf('.hero-eyebrow {');
    const rule = app.slice(i, app.indexOf('}', i));
    assert.match(rule, /color: #fff;/);
    assert.doesNotMatch(rule, /accent-300|background:/);
  });

  test('L6 no white text on accent-300/400/500 (the 9.1 portal step dot was 3.24:1)', () => {
    const bad = brandPairs().filter((p) => ['a300', 'a400', 'a500'].includes(p.bg) && (p.fg === '#ffffff' || /^w\d+$/.test(p.fg)));
    assert.deepEqual(bad.map((p) => `${p.f} ${p.sel}`), []);
    const portal = cssText('v91-portal.css');
    assert.match(portal, /\.bp-step\.is-current \.bp-step-dot \{[^}]*color: var\(--on-accent\)/);
  });

  test('derived tokens: --on-accent = p900 and --link = p600 in app.css; accent buttons carry the accent-600 edge; the brand mark gradient is 400 → 500', () => {
    const app = cssText('app.css');
    assert.match(app, /--on-accent: var\(--primary-900\);/);
    assert.match(app, /--link: var\(--primary-600\);/);
    assert.match(app, /\.btn-accent \{[^}]*color: var\(--on-accent\);[^}]*border-color: var\(--accent-600\);/);
    assert.match(app, /\.brand-mark \{[^}]*linear-gradient\(135deg, var\(--accent-400\), var\(--accent-500\)\)[^}]*color: var\(--on-accent\)/);
    for (const sel of ['.skip-link', '.nav-count', '.hero .btn-accent:hover:not(:disabled)']) {
      const i = app.indexOf(`${sel} {`);
      assert.ok(i >= 0, sel);
      assert.match(app.slice(i, app.indexOf('}', i)), /color: var\(--on-accent\)/, sel);
    }
    assert.match(cssText('pages-d.css'), /--pd-c2: #b8862e; \/\* @brand-exempt/);
  });

  test('the settings preview (.brp-*) uses only scale tokens, --on-accent and --link for brand colours', () => {
    const css = cssRules(cssText('pages-d.css')).filter((r) => r.sel.includes('.brp'));
    assert.ok(css.length >= 20);
    // مراجعة 9.2: الشريط الجانبي في المعاينة في بداية السطر (يمين الصفحة) كما في المنصة، لا في نهايته
    const frame = css.find((r) => r.sel === '.brp-frame');
    assert.match(frame.body, /grid-template-columns: 132px minmax\(0, 1fr\);/);
    assert.match(frame.body, /grid-template-areas: "head head" "side main";/);
    for (const r of css) {
      for (const m of r.body.matchAll(/var\((--[\w-]+)/g)) {
        if (/^--(primary|accent|pub|bmf|bp)-/.test(m[1])) assert.match(m[1], /^--(primary|accent)-\d+$/, `${r.sel} uses ${m[1]}`);
      }
    }
  });
});

// ───────────────────────── التكامل مع الخادم ─────────────────────────

const THEME_TAG = /<style id="bm-theme" data-v="([\w-]+)">(html:root\{[^<]*\})<\/style>/g;
const themeColorOf = (html) => /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];

describe('v9.2 colours — server delivery, API, audit and readiness', () => {
  let t;
  let admin;
  let anon;
  let portalPath;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    anon = t.client();
    const r = await t.client().post('/api/public/intake', { name: 'أم أحمد', phone: uniquePhone(), consent: true, description: 'جوزي اتوفى وعايزة أعرف نصيبي في الورث' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    portalPath = new URL(r.body.portal_url, t.base).pathname;
    assert.match(portalPath, /^\/p\/[\w-]+$/);
  });
  after(async () => {
    await t.close();
  });

  const pages = () => ['/', '/intake', '/portal', portalPath, '/privacy', '/no-such-page-v92'];

  test('I1 default colours: no theme block on any public page or /app, theme-color stays #0f4c5c', async () => {
    for (const p of pages()) {
      const r = await anon.get(p);
      assert.ok([200, 404].includes(r.status), `${p} ${r.status}`);
      assert.doesNotMatch(r.body, /id="bm-theme"/, p);
      assert.equal(themeColorOf(r.body), '#0f4c5c', p);
    }
    const app = await admin.get('/app');
    assert.equal(app.status, 200);
    assert.doesNotMatch(app.body, /id="bm-theme"/);
    assert.equal(themeColorOf(app.body), '#0f4c5c');
    const g = ok(await admin.get('/api/admin/brand'));
    assert.equal(g.inputs.source, 'default');
    assert.equal(g.theme.v, 'default');
    assert.equal(g.theme.css, '');
    assert.equal(g.contract.length, 29);
  });

  test('I2 + I3 saving #6a1b9a/#f9a825 puts exactly one theme block in every page and /app, theme-color follows, /app ETag changes, /sw.js does not', async () => {
    const sw1 = await anon.get('/sw.js');
    const app1 = await admin.get('/app');
    const etag1 = app1.headers.get('etag');
    const put = ok(await admin.put('/api/admin/brand/colors', { primary: '#6a1b9a', accent: '#f9a825' }));
    assert.equal(put.inputs.source, 'setting');
    assert.equal(put.theme.primary[700], '#6a1b9a');
    // تعديل مقصود عن نص المواصفة: المولّد (المنقول حرفيًا) يقبل #f9a825 كما هو (كل أزواج العقد تنجح)، فلا تعديل للون الثاني هنا؛
    // الإبلاغ عن التعديل يُختبر بزوج يحتاجه فعلًا (#ffeb3b) أدناه.
    assert.equal(put.theme.accent[500], '#f9a825');
    assert.ok(put.contract.every((r) => r.ok));
    assert.match(put.theme.css, THEME_CSS_RE);
    const v = put.theme.v;
    assert.match(v, /^[\w-]{10}$/);
    for (const p of [...pages(), '/app']) {
      const r = p === '/app' ? await admin.get(p) : await anon.get(p);
      const tags = [...r.body.matchAll(THEME_TAG)];
      assert.equal(tags.length, 1, `${p}: ${tags.length} theme blocks`);
      assert.equal(tags[0][1], v, p);
      assert.match(tags[0][2], /--primary-700:#6a1b9a/, p);
      assert.equal(themeColorOf(r.body), '#6a1b9a', p);
      const head = r.body.slice(0, r.body.indexOf('</head>'));
      assert.ok(head.includes('id="bm-theme"'), `${p}: the block is in <head> (first paint)`);
    }
    // شاشة دخول المنصة (بلا جلسة) أيضًا بألوان المؤسسة من أول رسم
    const appAnon = await anon.get('/app');
    assert.equal([...appAnon.body.matchAll(THEME_TAG)].length, 1, '/app login screen has the block');
    assert.equal(themeColorOf(appAnon.body), '#6a1b9a');
    const app2 = await admin.get('/app');
    assert.notEqual(app2.headers.get('etag'), etag1, '/app ETag follows the theme');
    const sw2 = await anon.get('/sw.js');
    assert.equal(sw2.body, sw1.body, '/sw.js is byte-identical (no «update available» prompt for staff)');
    // لون ثانٍ يحتاج تعديلًا: يُبلَّغ عنه (والمدخل يُحفظ كما هو)
    const adj = ok(await admin.put('/api/admin/brand/colors', { primary: '#6a1b9a', accent: '#ffeb3b' }));
    const a = adj.theme.adjustments.find((x) => x.role === 'accent');
    assert.ok(a, 'accent adjustment reported');
    assert.equal(a.from, '#ffeb3b');
    assert.equal(a.to, adj.theme.accent[500]);
    assert.equal(adj.inputs.accent, '#ffeb3b');
    ok(await admin.put('/api/admin/brand/colors', { primary: '#6a1b9a', accent: '#f9a825' }));
  });

  test('I4 anonymous → 401; lawyer and case manager → 403 on every brand route', async () => {
    const lawyer = await createLawyer(admin);
    const lc = await t.login(lawyer.username);
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'v92mgr', name: 'مديرة حالات', password: 'Manager@2026' }), 201);
    const mc = await t.login('v92mgr', 'Manager@2026');
    const calls = [['get', '/api/admin/brand'], ['put', '/api/admin/brand/colors', { primary: '#000000', accent: '#000000' }], ['del', '/api/admin/brand/colors']];
    for (const [m, url, body] of calls) {
      assert.equal((await anon[m](url, body)).status, 401, `anon ${m} ${url}`);
      assert.equal((await lc[m](url, body)).status, 403, `lawyer ${m} ${url}`);
      assert.equal((await mc[m](url, body)).status, 403, `manager ${m} ${url}`);
    }
    assert.equal(ok(await admin.get('/api/admin/brand')).inputs.primary, '#6a1b9a', 'nothing changed');
  });

  test('I5 the generic settings PATCH cannot change the colours', async () => {
    const before1 = ok(await admin.get('/api/admin/brand'));
    await admin.patch('/api/admin/settings', { brand_colors: { primary: '#000000', accent: '#000000' } });
    const after1 = ok(await admin.get('/api/admin/brand'));
    assert.deepEqual(after1.inputs, before1.inputs);
    assert.equal(after1.theme.v, before1.theme.v);
  });

  test('I6 invalid colours → 400 with the Arabic message per field', async () => {
    for (const body of [{ primary: 'red', accent: '#f9a825' }, { primary: '#12', accent: '#f9a825' }, { primary: '#6a1b9a', accent: '</style><script>' }, { primary: 'red' }]) {
      const r = await admin.put('/api/admin/brand/colors', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.body.details && r.body.details.fields, 'fields');
      for (const k of Object.keys(r.body.details.fields)) assert.match(r.body.details.fields[k], /اكتب اللون بصيغة/);
    }
    assert.equal(ok(await admin.get('/api/admin/brand')).inputs.primary, '#6a1b9a');
  });

  test('I7 + I8 audit rows with Arabic labels; saving the default pair deletes the row; DELETE returns to the defaults', async () => {
    assert.equal(LABELS.security_event['brand.colors_updated'], 'تعديل ألوان المؤسسة');
    assert.equal(LABELS.security_event['brand.colors_reset'], 'إرجاع ألوان المؤسسة الأصلية');
    const upd = ok(await admin.get('/api/admin/audit?type=brand.colors_updated'));
    assert.ok(upd.items.length >= 1);
    assert.equal(upd.items[0].type_label, 'تعديل ألوان المؤسسة');
    assert.match(upd.items[0].summary, /^تعديل ألوان المؤسسة: الأساسي/);
    const rowData = JSON.parse(t.app.db.get("SELECT data FROM security_events WHERE type = 'brand.colors_updated' ORDER BY id DESC LIMIT 1").data);
    assert.deepEqual(rowData.to, { primary: '#6a1b9a', accent: '#f9a825' });
    // اللون الأصلي = حذف الصف
    const def = ok(await admin.put('/api/admin/brand/colors', { primary: '#0F4C5C', accent: 'b8862e' }));
    assert.equal(def.inputs.source, 'default');
    assert.equal(t.app.db.get("SELECT COUNT(*) AS n FROM settings WHERE key = 'brand_colors'").n, 0);
    assert.doesNotMatch((await anon.get('/')).body, /id="bm-theme"/);
    ok(await admin.put('/api/admin/brand/colors', { primary: '#1a237e', accent: '#c9a227' }));
    const del = ok(await admin.del('/api/admin/brand/colors'));
    assert.equal(del.inputs.source, 'default');
    assert.equal(del.theme.css, '');
    assert.doesNotMatch((await anon.get('/')).body, /id="bm-theme"/);
    const reset = ok(await admin.get('/api/admin/audit?type=brand.colors_reset'));
    assert.equal(reset.items[0].type_label, 'إرجاع ألوان المؤسسة الأصلية');
    assert.equal(reset.items[0].summary, 'إرجاع ألوان المؤسسة الأصلية');
  });

  test('I9 readiness item «brand» (level ok in both states) with the default and the set titles', async () => {
    let c = ok(await admin.get('/api/admin/system/health')).checks.find((x) => x.key === 'brand');
    assert.ok(c, 'brand check present');
    assert.equal(c.level, 'ok');
    assert.equal(c.title, 'ألوان المؤسسة: الألوان الأصلية للمنصة');
    assert.equal(c.href, '#/settings?section=brand');
    assert.match(c.detail, /«الإعدادات ← ألوان المؤسسة»/);
    ok(await admin.put('/api/admin/brand/colors', { primary: '#1a237e', accent: '#c9a227' }));
    c = ok(await admin.get('/api/admin/system/health')).checks.find((x) => x.key === 'brand');
    assert.equal(c.level, 'ok');
    assert.equal(c.title, 'ألوان المؤسسة مضبوطة');
    assert.match(c.detail, /^اللون الأساسي .*#1a237e.* والثاني .*#c9a227.*\.$/);
    ok(await admin.del('/api/admin/brand/colors'));
  });

  test('I10 hostile pairs still pass every contract row', async () => {
    for (const [primary, accent] of [['#ffeb3b', '#ffffff'], ['#000000', '#000000'], ['#fafafa', '#000000']]) {
      const p = ok(await admin.put('/api/admin/brand/colors', { primary, accent }));
      assert.equal(p.contract.length, 29);
      assert.deepEqual(p.contract.filter((r) => !r.ok).map((r) => r.id), [], `${primary}/${accent}`);
    }
    ok(await admin.del('/api/admin/brand/colors'));
  });

  test('I11 a corrupted brand_colors row never breaks a page: 200 and no theme block', async () => {
    for (const raw of ['{bad json', JSON.stringify({ primary: '</style>', accent: '#f9a825' }), JSON.stringify('#6a1b9a'), 'null']) {
      t.app.db.run("INSERT INTO settings (key, value) VALUES ('brand_colors', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", raw);
      for (const p of ['/', '/intake', '/portal']) {
        const r = await anon.get(p);
        assert.equal(r.status, 200, `${p} with ${raw}`);
        assert.doesNotMatch(r.body, /id="bm-theme"/, `${p} with ${raw}`);
        assert.equal(themeColorOf(r.body), '#0f4c5c');
      }
      const app = await admin.get('/app');
      assert.equal(app.status, 200);
      assert.doesNotMatch(app.body, /id="bm-theme"/);
      assert.equal(ok(await admin.get('/api/admin/brand')).inputs.source, 'default');
    }
    ok(await admin.del('/api/admin/brand/colors'));
  });
});

describe('v9.2 colours — settings card (static)', () => {
  const src = read('public/assets/js/app/components/brand-settings.js');
  test('I12 the live restyle uses textContent after the shape check (never innerHTML), big files are refused, createImageBitmap is asked for 200×200', () => {
    assert.doesNotMatch(src, /\.(?:innerHTML|outerHTML)\b|insertAdjacentHTML/);
    assert.match(src, /el\.textContent = css;/);
    assert.match(src, /if \(!THEME_CSS_RE\.test\(css\)\) return false;/);
    assert.match(src, /MAX_IMAGE_BYTES = 15 \* 1024 \* 1024/);
    assert.match(src, /file\.size > MAX_IMAGE_BYTES\) return \[\]/);
    assert.match(src, /createImageBitmap\(file, \{ resizeWidth: SAMPLE, resizeHeight: SAMPLE/);
    assert.match(src, /const SAMPLE = 200;/);
    assert.match(src, /getImageData\(0, 0, SAMPLE, SAMPLE\)/);
    // لا رفع للصورة: لا طلب شبكة بالملف
    assert.doesNotMatch(src, /data_base64|FormData|fileToUpload/);
  });

  test('copy: the staff wording of §7.2', () => {
    for (const s of [
      'ألوان المؤسسة',
      'تظهر في الموقع وصفحة متابعة المستفيدين والمنصة. اختر لونين، وتُضبط بقية الدرجات تلقائيًا بحيث تبقى الكتابة واضحة.',
      'لا تعرف ألوان المؤسسة بالضبط؟ اختر صورة الشعار (مثل صورة صفحة المؤسسة على فيسبوك) واضغط على لون من الألوان المقترحة منها.',
      'اختر صورة الشعار لاقتراح الألوان',
      'الصورة لا تُرفع ولا تُحفظ؛ تُستخدم على جهازك لاقتراح الألوان فقط.',
      'من الصورة:',
      'لم نجد ألوانًا واضحة في هذه الصورة. جرّب صورة أخرى أو اكتب كود اللون.',
      'للأزرار الرئيسية ورأس الصفحات والقائمة الجانبية.',
      'لأهم زر في الموقع («احكيلنا مشكلتك») والمربعات المميزة.',
      'هكذا ستظهر الألوان للمستفيدات وفريق العمل.',
      'عدّلنا الدرجة حتى تبقى الكتابة واضحة',
      'اختر لونًا آخر إن أردت، أو احفظ بهذه الدرجة.',
      'الألوان الحالية: الألوان الأصلية للمنصة؛ لم تُضبط ألوان المؤسسة بعد.',
      'تغييرات غير محفوظة',
      'حفظ الألوان',
      'تم حفظ ألوان المؤسسة، وظهرت في الموقع والمنصة.',
      'رجوع للألوان الأصلية',
      'الرجوع للألوان الأصلية؟',
      'ستعود ألوان الموقع والمنصة إلى الأزرق المخضر والذهبي.',
      'عادت الألوان الأصلية.',
      'تعذّر تجهيز ألوان مقروءة من هذا الاختيار. جرّب لونًا آخر.',
    ]) assert.ok(src.includes(s), s);
  });

  test('settings page: the card comes right after «إعدادات المؤسسة», admins only, and ?section=<id> scrolls to any card', () => {
    const page = read('public/assets/js/app/pages/admin/settings.js');
    const org = page.indexOf("card({ title: 'إعدادات المؤسسة'");
    const brand = page.indexOf('brandSettingsCard({ user: me })');
    const site = page.indexOf('siteSettingsCard(settings),');
    assert.ok(org > 0 && brand > org && site > brand, 'order: org → brand → site');
    assert.match(page, /me\.role === 'admin' \? brandSettingsCard/);
    assert.match(page, /focusSection\(ctx\.query && ctx\.query\.section\)/);
    assert.match(page, /document\.getElementById\(section\)/);
    assert.match(src, /el\.id = 'brand';/);
  });
});

describe('v9.2 colours — N3 tile-border guarantee', () => {
  test('I13 for all 644 property pairs, contract row N3 (p500 on #fff ≥ 3:1) holds — the tile edge never vanishes', () => {
    for (const { p, a, t } of propertyResults()) {
      const n3 = B.checkContract(t).find((r) => r.id === 'N3');
      assert.ok(n3.ok && n3.ratio >= 3, `${p}/${a} N3 ${n3.ratio}`);
      assert.ok(B.contrast(t.primary[500], '#ffffff') >= 3);
    }
  });
});
