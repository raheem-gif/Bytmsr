// الإصدار 11.0 — مسار visual: لغة بصرية واحدة (ألوان الشعار، سلّم الخط، القوائم المجمّعة، زر ممتلئ واحد، حواف ≥ 3:1)
// على الموقع العام وبوابة الشركات ومنصة الفريق — بلا تغيير في منطق الصفحات. §7.4 من مواصفة 11.0 (r2).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { setPublicRoot, transformAsset } from '../src/site-assets.js';
import { assetVersion } from '../src/http.js';
import * as B from '../public/assets/js/lib/brand-color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const CSS_DIR = path.join(PUB, 'assets/css');
const IMG_DIR = path.join(PUB, 'assets/img');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = (f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
setPublicRoot(PUB);
const served = (rel) => br(transformAsset(path.join(PUB, rel)));
const MARKER = '/* ===== v11 gate-public (owner: gate-public; visual never edits below this line) ===== */';

/** القواعد مع سياقها: [{ sel, body, at: ['@media screen', …] }] (تسطيح @media/@supports، وتجاهل @keyframes/@font-face) */
function cssRules(text) {
  const out = [];
  const walk = (src, at) => {
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
      if (/^@(media|supports)/.test(sel)) walk(body, [...at, sel]);
      else if (!sel.startsWith('@')) out.push({ sel, body, at });
      i = j;
    }
  };
  walk(stripComments(text), []);
  return out;
}

/** كتل الأنماط الحرجة من public-site.css: name '' = العامة (بلا اسم)، وإلا الكتلة المسماة — مضغوطة كما يضمّنها site.js */
function critical(name = '') {
  const text = css('public-site.css');
  let out = '';
  for (const m of text.matchAll(/@critical-start(?::([a-z0-9-]+))?[^*]*\*\/([\s\S]*?)\/\*\s*@critical-end\s*\*\//g)) {
    if ((m[1] || '') === name) out += m[2];
  }
  return out
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .replace(/url\("?(\/assets\/[^")?#]+)"?\)/g, (m, url) => {
      const v = assetVersion(path.join(PUB, url));
      return v ? `url("${url}?v=${v}")` : m;
    })
    .trim();
}
const rootVars = (text) => {
  const vars = {};
  for (const r of cssRules(text)) {
    if (r.sel !== ':root' || r.at.length) continue;
    for (const m of r.body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
};

// الألوان: V11-01 حرفيًا، والأزواج الثمانية «المعادية» (§7.4-3)
const V11_01 = {
  primary: { 50: '#eff6f2', 100: '#dfece5', 200: '#bfd8ca', 300: '#8ab59e', 500: '#26684c', 600: '#175139', 700: '#0b3d29', 800: '#082e1e', 900: '#052015' },
  accent: { 50: '#fbf7ef', 100: '#f6ecda', 300: '#dabe89', 400: '#d4ad5f', 500: '#cca454', 600: '#93712b', 700: '#74581f', 800: '#5e4716' },
  rgb: { 'primary-300': '138 181 158', 'primary-500': '38 104 76', 'primary-700': '11 61 41', 'primary-900': '5 32 21', 'accent-500': '204 164 84' },
};
const THEMES = [
  ['default', '#0b3d29', '#cca454'],
  ['v10 default', '#0b5a3c', '#c9a14a'],
  ['yellow/cyan', '#ffff00', '#00ffff'],
  ['red/blue', '#ff0000', '#0000ff'],
  ['black/white', '#000000', '#ffffff'],
  ['white/black', '#ffffff', '#000000'],
  ['purple/gold', '#7a1fa2', '#ffd400'],
  ['teal/orange', '#0f4c5c', '#b8862e'],
  ['pink/lime', '#ff5fa2', '#9cff00'],
];
// المحايدة الثابتة (V11-05)
const N = { label: '#141f1a', label2: '#5a625e', canvas: '#ffffff', grouped: '#f6f6f3', fieldLine: '#767d79' };
const fill = (a, bg) => B.over('#141f1a', a, bg);
// V1–V25 (منقولة من v11-proto/tools/v11-contract.mjs): [id, fg(P, A), bg(P, A), min]
const PAIRS = [
  ['V1 filled button text', () => '#ffffff', (P) => P[700], 4.5],
  ['V2 filled button hover', () => '#ffffff', (P) => P[800], 4.5],
  ['V3 tinted button / selected row', (P) => P[700], (P) => P[50], 4.5],
  ['V4 tinted pressed', (P) => P[700], (P) => P[100], 4.5],
  ['V5 plain button on white', (P) => P[600], () => '#ffffff', 4.5],
  ['V6 plain button on grouped canvas', (P) => P[600], () => N.grouped, 4.5],
  ['V7 tab bar / scope tab active', (P) => P[700], () => '#ffffff', 4.5],
  ['V8 focus ring vs grouped canvas', (P) => P[700], () => N.grouped, 3],
  ['V9 gate card title on p50', () => N.label, (P) => P[50], 4.5],
  ['V10 gate secondary text on p50', () => N.label2, (P) => P[50], 4.5],
  ['V11 «مجاني» kicker', (P, A) => A[700], (P, A) => A[50], 4.5],
  ['V12 «خيري» pill', (P, A) => A[700], (P, A) => A[50], 4.5],
  ['V13 callback way text on a50', (P, A) => A[700], (P, A) => A[50], 4.5],
  ['V14 band body white 75 % on p900', () => 'w75', (P) => P[900], 4.5],
  ['V15 band title on p900', () => '#ffffff', (P) => P[900], 4.5],
  ['V16 gold button text on band', (P) => P[900], (P, A) => A[500], 4.5],
  ['V17 band icons a300 on p900', (P, A) => A[300], (P) => P[900], 3],
  ['V18 pictogram gold part on white', (P, A) => A[600], () => '#ffffff', 3],
  ['V19 pictogram green part on white', (P) => P[700], () => '#ffffff', 3],
  ['V20 pictogram green on pressed tile', (P) => P[700], (P) => P[50], 3],
  ['V21 count badge', () => '#ffffff', (P) => P[700], 4.5],
  ['V22 secondary label on fill-1 over grouped', () => N.label2, () => fill(0.05, N.grouped), 4.5],
  ['V23 secondary label on white', () => N.label2, () => '#ffffff', 4.5],
  ['V24 label on a50 gold wash', () => N.label, (P, A) => A[50], 4.5],
  ['V25 nav icon p600 on the light sidebar', (P) => P[600], () => '#fafaf8', 3],
];

// ───────────────────────── 1–3 الألوان ─────────────────────────

describe('v11 visual — brand defaults and the contrast contract (V-0, V11-01/06)', () => {
  test('1. defaults #0b3d29/#cca454 → LEGACY with 0 adjustments; 29/29 contract rows; LEGACY = the V11-01 literal', () => {
    assert.equal(B.DEFAULT_PRIMARY, '#0b3d29');
    assert.equal(B.DEFAULT_ACCENT, '#cca454');
    const t = B.buildTheme(B.DEFAULT_PRIMARY, B.DEFAULT_ACCENT);
    assert.deepEqual(t.adjustments, []);
    assert.deepEqual({ ...t.primary }, V11_01.primary);
    assert.deepEqual({ ...t.accent }, V11_01.accent);
    assert.deepEqual({ ...B.LEGACY.primary }, V11_01.primary);
    assert.deepEqual({ ...B.LEGACY.accent }, V11_01.accent);
    assert.equal(B.CONTRACT.length, 29);
    assert.deepEqual(B.checkContract(B.LEGACY).filter((r) => !r.ok).map((r) => r.id), []);
  });

  test('2. both @brand-defaults blocks (app.css, public-site.css) equal LEGACY: 17 steps + 5 rgb triplets', () => {
    for (const f of ['app.css', 'public-site.css']) {
      const blocks = [...css(f).matchAll(/\/\*\s*@brand-defaults-start\s*\*\/([\s\S]*?)\/\*\s*@brand-defaults-end\s*\*\//g)].map((m) => m[1]);
      assert.equal(blocks.length, 1, `${f}: one defaults block`);
      const vars = Object.fromEntries([...blocks[0].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
      let n = 0;
      for (const [k, v] of Object.entries(V11_01.primary)) assert.equal(vars[`--primary-${k}`], v, `${f} --primary-${k}`), (n += 1);
      for (const [k, v] of Object.entries(V11_01.accent)) assert.equal(vars[`--accent-${k}`], v, `${f} --accent-${k}`), (n += 1);
      for (const [k, v] of Object.entries(V11_01.rgb)) assert.equal(vars[`--${k}-rgb`], v, `${f} --${k}-rgb`);
      assert.equal(n, 17);
    }
  });

  test('3. V1–V25 pass for the default and the 8 hostile pairs (no generator change), and the 29-row contract holds for each', () => {
    const fails = [];
    for (const [name, p, a] of THEMES) {
      const t = B.buildTheme(p, a);
      assert.deepEqual(B.checkContract(t).filter((r) => !r.ok).map((r) => r.id), [], `${name}: contract`);
      for (const [id, f, b, min] of PAIRS) {
        const bg = b(t.primary, t.accent);
        const fg0 = f(t.primary, t.accent);
        const fg = fg0 === 'w75' ? B.over('#ffffff', 0.75, bg) : fg0;
        const r = B.contrast(fg, bg);
        if (r < min) fails.push(`${name} ${id} ${r.toFixed(2)} < ${min}`);
      }
    }
    assert.deepEqual(fails, []);
    assert.equal(PAIRS.length, 25);
  });
});

// ───────────────────────── 4–8 الرموز والميزانيات ─────────────────────────

const TOKENS = ['--canvas', '--canvas-grouped', '--surface', '--surface-tint', '--label', '--label-2', '--label-3', '--separator', '--fill-1', '--fill-2', '--fill-3', '--tint', '--tint-weak', '--tint-weak-2', '--gold-line', '--gold-ink', '--gold-wash', '--ok', '--ok-weak', '--warn', '--warn-weak', '--bad', '--bad-weak', '--info', '--info-weak', '--scrim', '--e-1', '--e-2', '--e-3', '--r-6', '--r-10', '--r-14', '--r-20', '--r-28', '--focus', '--edge-strong', '--field-line', '--on-tint'];
const TYPE = ['--t-large', '--t-title1', '--t-title2', '--t-title3', '--t-headline', '--t-body', '--t-callout', '--t-subhead', '--t-footnote', '--t-caption'];

describe('v11 visual — tokens, literals and budgets (§5.8, §4)', () => {
  test('4. every §5.8 token is in app.css :root and in the critical :root of public-site.css (type tokens in v10-experience.css for /app); old names re-pointed', () => {
    const app = rootVars(css('app.css'));
    const crit = critical('');
    const exp = rootVars(css('v10-experience.css'));
    for (const t of TOKENS) {
      assert.ok(app[t], `app.css ${t}`);
      assert.ok(new RegExp(`${t}:`).test(crit), `critical ${t}`);
    }
    for (const t of TYPE) {
      assert.ok(exp[t], `v10-experience.css ${t}`);
      assert.ok(new RegExp(`${t}:`).test(crit), `critical ${t}`);
    }
    // V11-61: الأسماء القديمة تتبع الأدوار الجديدة
    assert.equal(app['--bg'], 'var(--canvas-grouped)');
    assert.equal(app['--text'], 'var(--label)');
    assert.equal(app['--text-muted'], 'var(--label-2)');
    assert.equal(app['--border'], 'var(--separator)');
    assert.equal(app['--radius'], '14px');
    assert.equal(app['--shadow-sm'], 'var(--e-1)');
    assert.equal(app['--shadow'], 'var(--e-1)');
    assert.equal(app['--shadow-lg'], 'var(--e-3)');
    const pub = rootVars(css('public-site.css').split(MARKER)[0]);
    assert.equal(pub['--pub-cream'], '#fff');
    assert.equal(pub['--pub-line'], 'var(--separator)');
    assert.equal(pub['--pub-ink'], 'var(--label)');
    assert.equal(pub['--pub-ink-soft'], 'var(--label-2)');
    assert.match(app['--edge-strong'], /^0 0 0 (1\.5|2)px var\(--primary-500\)$/);
    assert.equal(app['--field-line'], N.fieldLine);
  });

  test('5. no v11 scale literal outside the defaults blocks in any stylesheet; v11-ui.css has hex only in neutral :root definitions', () => {
    const scale = [...Object.values(V11_01.primary), ...Object.values(V11_01.accent)];
    const re = new RegExp(`(?:${scale.join('|')})(?![0-9a-f])`, 'i');
    for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
      const outside = stripComments(css(f).replace(/\/\*\s*@brand-defaults-start\s*\*\/[\s\S]*?\/\*\s*@brand-defaults-end\s*\*\//g, ''));
      assert.ok(!re.test(outside), `${f}: ${re.exec(outside)?.[0]}`);
    }
    for (const r of cssRules(css('v11-ui.css'))) {
      if (r.sel === ':root') continue;
      assert.doesNotMatch(r.body, /#[0-9a-f]{3,8}\b|\brgba?\(/i, `v11-ui.css ${r.sel}`);
    }
  });

  test('6. v11-ui.css is the last visual stylesheet in app.html and company.html; /app ≤ 60,000 B br, /company ≤ 30,000 B br, v11-ui.css ≤ 6 KB br (as served)', () => {
    for (const [page, limit] of [['app.html', 60000], ['company.html', 30000]]) {
      const links = [...read(`public/${page}`).matchAll(/<link rel="stylesheet" href="\/(assets\/css\/[\w.-]+\.css)"/g)].map((m) => m[1]);
      const i = links.indexOf('assets/css/v11-ui.css');
      assert.ok(i >= 0, `${page} links v11-ui.css`);
      // H-T1: v11-segment.css (segment-staff) may follow it; nothing else
      assert.deepEqual(links.slice(i + 1).filter((l) => l !== 'assets/css/v11-segment.css'), [], `${page}: v11-ui.css last`);
      const total = links.reduce((s, l) => s + served(l), 0);
      assert.ok(total <= limit, `${page}: ${total} B br > ${limit}`);
    }
    assert.ok(served('assets/css/v11-ui.css') <= 6 * 1024, `v11-ui.css ${served('assets/css/v11-ui.css')}`);
  });

  test('7. the general critical block (minified as inlined) ≤ 8,500 B; the named legal block still parses', () => {
    const general = critical('');
    assert.ok(Buffer.byteLength(general) <= 8500, `general ${Buffer.byteLength(general)}`);
    const legal = critical('legal');
    assert.ok(legal.length > 0, 'legal block present');
    assert.equal((legal.match(/\{/g) || []).length, (legal.match(/\}/g) || []).length, 'legal braces balance');
    assert.ok(!/@critical/.test(general + legal));
    // H-G2: the gate-public marker exists once, at the end of visual's part
    assert.equal(css('public-site.css').split(MARKER).length, 2);
  });

  test('8. Arabic is never letter-spaced: v11-ui.css and the public critical blocks use only 0/normal', () => {
    const scan = (label, text) => {
      for (const m of stripComments(text).matchAll(/letter-spacing\s*:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^(0|normal)$/, `${label}: ${m[1]}`);
    };
    scan('v11-ui.css', css('v11-ui.css'));
    scan('critical', critical('') + critical('legal'));
  });

  test('9. targets ≥ 44 px: buttons (44, small 32 + ::after), header CTA, menu/contact 44, tiles ≥ 72, ways ≥ 52, header pill 32 + ::after', () => {
    const ui = css('v11-ui.css');
    assert.match(ui, /\.btn \{[^}]*--btn-h: 44px/);
    assert.match(ui, /\.btn-sm \{[^}]*--btn-h: 32px/);
    // review fix: inset is measured from the padding box; the 32-px button has a 1-px border → -7px for a 44-px area
    assert.match(ui, /\.btn-sm:not\(\.is-loading\)::after \{[^}]*inset: -7px 0/);
    assert.match(ui, /\.seg::after \{[^}]*inset: -6px 0/);
    assert.match(ui, /\.scope-tabs > a, \.scope-tabs > button \{[^}]*min-height: 44px/);
    const pub = css('public-site.css').split(MARKER)[0];
    assert.match(pub, /\.pub-nav-link,\s*\.pub-nav-cta \{[^}]*min-height: 44px/);
    assert.match(pub, /body\.pub \.pub-head-contact \{[^}]*width: 44px;[^}]*height: 44px/);
    assert.match(pub, /\.pub-menu-toggle \{[^}]*width: 44px;[^}]*height: 44px/);
    assert.match(pub, /\.pub-seg-pill::after \{[^}]*inset: -6px 0/);
    assert.match(pub, /--tile-h: clamp\(72px,/);
    assert.match(pub, /\.pub-pick-way \{[^}]*min-height: (5[2-9]|6\d)px/);
    // V-5/V-6: nav rows and side rows stay ≥ 44 px
    assert.match(css('v10-company.css'), /\.co-side-link \{[^}]*min-height: 44px/);
    assert.match(css('v9-messaging.css'), /\.pa-sf::after \{[^}]*inset: -4px 0/);
  });
});

// ───────────────────────── 10–14 الشعار والأيقونات ─────────────────────────

/** قارئ PNG صغير (8-bit، RGB/RGBA، بلا تشابك) */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  let o = 8;
  let w = 0;
  let h = 0;
  let ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'bit depth 8');
      ct = data[9];
      assert.equal(data[12], 0, 'not interlaced');
    } else if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  assert.ok(bpp, `colour type ${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = cur;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px };
}

describe('v11 visual — logo, icons and chrome (§5.10, V-1, V-4)', () => {
  test('10. icons: stroke-width 1.75 in the renderer; heart and swap exist', () => {
    const ui = read('public/assets/js/lib/ui.js');
    assert.match(ui, /'stroke-width': 1\.75,/);
    assert.doesNotMatch(ui, /'stroke-width': 2\b/);
    assert.match(ui, /\bheart: \[/);
    assert.match(ui, /\bswap: \[/);
  });

  test('11. assets: §5.10 files exist within budget; favicon ornament on #032516 without letters; favicon.ico = 16/32/48 PNG; og-image 1200×630 ≤ 300 KB; maskable ornament inside the central 60 %', () => {
    const svg = (f) => fs.readFileSync(path.join(IMG_DIR, f));
    for (const f of ['emam-logo-gold.svg', 'emam-logo-gold-deep.svg']) assert.ok(br(svg(f)) <= 6.5 * 1024, `${f} ${br(svg(f))}`);
    for (const f of ['emam-mark-green.svg', 'emam-mark-gold.svg', 'emam-mark-white.svg']) assert.ok(br(svg(f)) <= 2 * 1024, `${f} ${br(svg(f))}`);
    assert.ok(fs.existsSync(path.join(IMG_DIR, 'emam-logo-green.svg')) && fs.existsSync(path.join(IMG_DIR, 'app-icon.svg')));
    const fav = svg('favicon.svg');
    assert.ok(fav.length <= 1024, `favicon.svg ${fav.length}`);
    assert.match(fav.toString(), /<rect[^>]*fill="#032516"/);
    assert.ok(!/<text/i.test(fav.toString()), 'no letters in the favicon');
    const ico = fs.readFileSync(path.join(PUB, 'favicon.ico'));
    assert.equal(ico.readUInt16LE(2), 1);
    const n = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < n; i += 1) {
      const e = 6 + 16 * i;
      sizes.push(ico[e] || 256);
      const off = ico.readUInt32LE(e + 12);
      assert.equal(ico.toString('hex', off, off + 8), '89504e470d0a1a0a', 'PNG inside the ico');
    }
    assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
    const og = decodePng(path.join(IMG_DIR, 'og-image.png'));
    assert.deepEqual([og.w, og.h], [1200, 630]);
    assert.ok(fs.statSync(path.join(IMG_DIR, 'og-image.png')).size <= 300 * 1024);
    const m = decodePng(path.join(IMG_DIR, 'icon-maskable-512.png'));
    const bg = [...m.px.subarray(0, 3)];
    let [x0, y0, x1, y1] = [m.w, m.h, -1, -1];
    for (let y = 0; y < m.h; y += 1) {
      for (let x = 0; x < m.w; x += 1) {
        const i = (y * m.w + x) * m.bpp;
        if (Math.abs(m.px[i] - bg[0]) + Math.abs(m.px[i + 1] - bg[1]) + Math.abs(m.px[i + 2] - bg[2]) > 60) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    assert.ok(x1 > x0 && y1 > y0, 'ornament found');
    const lo = m.w * 0.2;
    const hi = m.w * 0.8;
    assert.ok(x0 >= lo && y0 >= lo && x1 <= hi && y1 <= hi, `ornament bbox ${x0},${y0}–${x1},${y1}`);
    for (const [f, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
      const b = fs.readFileSync(path.join(IMG_DIR, f));
      assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [s, s], f);
    }
  });

  test('12. theme literal: no #0b5a3c left in public/*.html, sw.js, the manifest, src/routes/*.js, src/brand.js', () => {
    const files = [
      ...fs.readdirSync(PUB).filter((f) => f.endsWith('.html')).map((f) => `public/${f}`),
      'public/sw.js',
      'public/manifest.webmanifest',
      ...fs.readdirSync(path.join(ROOT, 'src/routes')).filter((f) => f.endsWith('.js')).map((f) => `src/routes/${f}`),
      'src/brand.js',
    ];
    for (const f of files) assert.ok(!/#0b5a3c/i.test(read(f)), f);
    assert.match(read('public/app.html'), /<meta name="theme-color" content="#0b3d29" \/>/);
    assert.match(read('public/manifest.webmanifest'), /"theme_color": "#0b3d29"/);
  });

  test('13. reduced-motion / reduced-transparency / more-contrast / forced-colours blocks cover bars, cards, tiles and gate cards', () => {
    const exp = css('v10-experience.css');
    for (const q of ['prefers-reduced-motion: reduce', 'prefers-reduced-transparency: reduce', 'prefers-contrast: more', 'forced-colors: active']) assert.ok(exp.includes(`@media (${q})`), `v10-experience ${q}`);
    const ui = cssRules(css('v11-ui.css'));
    const inQ = (q, sel) => ui.some((r) => r.at.some((a) => a.includes(q)) && r.sel.includes(sel));
    for (const sel of ['.card', '.pa-story', '.co-section', '.lh-list', '.k-list']) assert.ok(inQ('prefers-contrast: more', sel), `contrast ${sel}`);
    for (const sel of ['.card', '.pa-story', '.co-section', '.pill', '.seg[aria-pressed="true"]', ':focus-visible']) assert.ok(inQ('forced-colors: active', sel), `forced ${sel}`);
    assert.ok(inQ('prefers-reduced-motion: reduce', '.topbar-title'), 'nav title static');
    assert.ok(inQ('prefers-reduced-transparency: reduce', '.sidebar'), 'solid sidebars');
    const pub = cssRules(css('public-site.css').split(MARKER)[0]);
    const pubIn = (q, sel) => pub.some((r) => r.at.some((a) => a.includes(q)) && r.sel.includes(sel));
    for (const sel of ['.pub-pick-tile', '.pub-pick-way', '.gate-card', '.pub-seg-pill']) assert.ok(pubIn('forced-colors: active', sel), `public forced ${sel}`);
    assert.ok(pubIn('prefers-contrast: more', '.gate-card'), 'gate cards in more contrast');
    assert.ok(pubIn('prefers-reduced-transparency: reduce', '.pub-header'));
    const forms = cssRules(css('v91-b-forms.css'));
    assert.ok(forms.some((r) => r.at.some((a) => a.includes('forced-colors')) && r.sel.includes('.bmf-answer')), 'intake tiles forced colours');
  });
});

// ───────────────────────── 14 J6 (DOM مصغّر) ─────────────────────────

function installDom() {
  class FakeNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
    }
    appendChild(c) {
      if (c.parentNode) c.parentNode.childNodes = c.parentNode.childNodes.filter((x) => x !== c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    }
    append(...cs) {
      for (const c of cs) this.appendChild(typeof c === 'string' ? globalThis.document.createTextNode(c) : c);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
  }
  class FakeText extends FakeNode {
    constructor(t) {
      super();
      this.data = String(t);
    }
    get textContent() {
      return this.data;
    }
  }
  class FakeEl extends FakeNode {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      this.attrs = {};
      this.dataset = {};
      this.style = { setProperty() {} };
      const set = new Set();
      this.classList = { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), contains: (c) => set.has(c), toggle: (c, f) => ((f ?? !set.has(c)) ? set.add(c) : set.delete(c)), values: () => [...set] };
    }
    get children() {
      return this.childNodes.filter((c) => c instanceof FakeEl);
    }
    get className() {
      return this.classList.values().join(' ');
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    }
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    addEventListener() {}
    all() {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
  }
  globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), addEventListener() {}, removeEventListener() {} };
  globalThis.Node = FakeNode;
}

describe('v11 visual — chrome mark and sign-in lockup (V-4, J6)', () => {
  let ui;
  let fmt;
  const BRAND = 'Emam Legal and Consultancy';
  before(async () => {
    installDom();
    ui = await import('../public/assets/js/lib/ui.js');
    fmt = await import('../public/assets/js/lib/fmt.js');
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.Node;
  });

  test('14. brand chrome on → the green mark image (alt "") and the deep-gold lockup (alt = brand_name, ≥ 200 px); brand_in_staff_app=false → the 9.2 scales tile and no lockup (J6)', () => {
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' }, brand: { name: BRAND, short: 'Emam Legal', staff_chrome: { name: BRAND, short: 'Emam Legal' } } });
    const mark = ui.brandMark({ size: 24 });
    assert.equal(mark.tagName, 'IMG');
    assert.equal(mark.getAttribute('src'), '/assets/img/emam-mark-green.svg');
    assert.equal(mark.getAttribute('alt'), '');
    const lock = ui.brandLockup({ width: 120 });
    assert.equal(lock.getAttribute('alt'), BRAND);
    assert.equal(lock.getAttribute('src'), '/assets/img/emam-logo-gold-deep.svg');
    assert.ok(Number(lock.getAttribute('width')) >= 200);
    assert.equal(lock.getAttribute('lang'), 'en');
    assert.equal(ui.brandLockup({ tone: 'bright', width: 280 }).getAttribute('src'), '/assets/img/emam-logo-gold.svg');
    // J6: /app يعود إلى اسم المؤسسة ورمز الميزان
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' }, brand: { name: BRAND, short: 'Emam Legal', staff_chrome: { name: 'مؤسسة بيوت مصر', short: 'مؤسسة بيوت مصر' } } });
    const off = ui.brandMark({ size: 24 });
    assert.equal(off.tagName, 'SPAN');
    assert.ok(off.classList.contains('brand-mark'));
    assert.equal(off.all().some((e) => e.tagName === 'IMG'), false);
    assert.equal(ui.brandLockup(), null);
    // the shell keeps the 9.2 text name when the chrome is off, and the sign-in screens use the lockup
    assert.match(read('public/assets/js/app/shell.js'), /chrome\.on\s*\?[\s\S]*?:\s*h\('span\.brand-text', h\('span\.brand-name', orgName\)/);
    assert.match(read('public/assets/js/app/pages/login.js'), /brandLockup\(\{ width: 260 \}\)/);
    assert.match(read('public/assets/js/app/pages/auth-flows.js'), /brandLockup\(\{ width: 220 \}\)/);
    assert.match(read('public/assets/js/company/pages/login.js'), /brandLockup\(\{ tone: 'bright', width: 280 \}\)/);
    assert.match(read('public/assets/js/company/shell.js'), /h\('span\.co-brand-desk', brandMark\(\{ size: 22 \}\), wordmark\(/);
    // the text brand next to the mark stays for screen readers (visually hidden only when the image is there)
    assert.match(css('v11-ui.css'), /:is\(\.brand, \.co-brand-phone, \.co-brand-desk\):has\(\.brand-logo\) \.wordmark \{[^}]*clip-path: inset\(50%\)/);
  });
});

// ───────────────────────── 15–20 ─────────────────────────

describe('v11 visual — cascade, boundaries, print, SVG safety, deep gold (r2 S1/S17/S18/S29/S30, P6/P23/P24)', () => {
  test('15. type cascade: in app.html and company.html link order the computed --t-title1 is 700 28px and --t-body 400 17px/1.6 (no later sheet overrides them)', () => {
    for (const page of ['app.html', 'company.html']) {
      const links = [...read(`public/${page}`).matchAll(/<link rel="stylesheet" href="\/assets\/css\/([\w.-]+\.css)"/g)].map((m) => m[1]);
      const vars = {};
      const at = {};
      for (const f of links) {
        if (!fs.existsSync(path.join(CSS_DIR, f))) continue;
        for (const [k, v] of Object.entries(rootVars(css(f)))) {
          vars[k] = v;
          at[k] = f;
        }
      }
      assert.match(vars['--t-title1'], /^700 28px \/ 1\.3 var\(--font\)$/, `${page}: ${vars['--t-title1']} (${at['--t-title1']})`);
      assert.match(vars['--t-body'], /^400 17px \/ 1\.6 var\(--font\)$/, `${page}: ${vars['--t-body']}`);
      assert.match(vars['--t-large'], /^700 34px/, page);
      assert.equal(at['--t-title1'], 'v10-experience.css', `${page}: defined where EXP-2 pins it`);
    }
  });

  test('16. boundaries ≥ 3:1: charity tiles, ways, intake answers and «مش عارفة» use --edge-strong; field borders use --field-line (or a state colour); p500 and the field line pass for all 9 themes', () => {
    const crit = critical('');
    assert.match(crit, /\.pub-pick-tile\{[^}]*box-shadow:var\(--edge-strong\)/);
    assert.match(crit, /\.pub-pick-way--follow\{[^}]*box-shadow:var\(--edge-strong\)/);
    const forms = css('v91-b-forms.css');
    assert.match(forms, /\.bmf-answer \{[^}]*box-shadow: var\(--edge-strong\)/);
    assert.match(forms, /\.bmf-answer\.bmf-dontknow \{[^}]*background: var\(--tint-weak\);[^}]*box-shadow: var\(--edge-strong\)/);
    const FIELD = /(^|[\s,>+~(])(input|select|textarea)\b|\.input\b|\.bp-input\b|\.bmf-input\b|\.bmf-textarea\b|\.bmf-select\b/;
    const OK = /var\(--(field-line|bmf-red|primary-500|primary-700|bad)\)|^0$|^none$/;
    for (const f of ['v91-b-forms.css', 'v91-portal.css', 'v11-ui.css']) {
      let base = 0;
      for (const r of cssRules(css(f))) {
        if (!FIELD.test(r.sel) || /:focus|:hover|:disabled/.test(r.sel)) continue;
        for (const m of r.body.matchAll(/(?:^|;)\s*(border(?:-block-end|-bottom|-color)?)\s*:\s*([^;]+)/g)) {
          const v = m[2].trim();
          assert.ok(OK.test(v) || /var\(--(field-line|bmf-red|primary-500|primary-700|bad)\)/.test(v), `${f} ${r.sel}: ${m[1]}: ${v}`);
          if (/--field-line/.test(v)) base += 1;
        }
      }
      assert.ok(base >= 1, `${f}: a field rule draws the --field-line border`);
    }
    for (const [name, p, a] of THEMES) {
      const t = B.buildTheme(p, a);
      assert.ok(B.contrast(t.primary[500], N.canvas) >= 3, `${name}: p500 vs canvas ${B.contrast(t.primary[500], N.canvas).toFixed(2)}`);
      assert.ok(B.contrast(t.primary[500], N.grouped) >= 3, `${name}: p500 vs grouped`);
    }
    assert.ok(B.contrast(N.fieldLine, '#ffffff') >= 3);
    assert.ok(B.contrast(N.fieldLine, '#f9f8f4') >= 3);
    assert.ok(B.contrast(N.fieldLine, fill(0.05, '#ffffff')) >= 3, 'field line on a fill-1 field');
  });

  test('17. print isolation: every rule in v11-ui.css sits inside @media screen; staff/lawyer restyles of print-adjacent cards are screen-only', () => {
    const rules = cssRules(css('v11-ui.css'));
    assert.ok(rules.length > 100);
    for (const r of rules) assert.equal(r.at[0], '@media screen', `${r.sel} outside @media screen`);
    const scr = (f, sel) => cssRules(css(f)).some((r) => r.at.includes('@media screen') && r.sel.includes(sel));
    assert.ok(scr('v91-l-court.css', '.lc-hero'), 'statement cards');
    assert.ok(scr('v9-fixes.css', '.table-wrap.table-stack') || /@media screen and \(max-width: 640px\)/.test(css('v9-fixes.css')), 'stacked tables');
    assert.ok(scr('v9-messaging.css', '.btn-primary.pa-story-primary'), 'triage action');
    assert.ok(scr('pages-a.css', '.pa-fb .btn.pa-fb-btn'), 'AI feedback control');
    // the print stylesheet blocks are untouched by v11 (they still win in print)
    assert.match(css('app.css'), /@media print/);
  });

  test('18. SVG safety: no role/aria-label/<title>/<desc>/<script>/on*=/foreignObject/external href; no raster logo crops under public/assets', () => {
    for (const f of fs.readdirSync(IMG_DIR).filter((x) => x.endsWith('.svg'))) {
      const s = fs.readFileSync(path.join(IMG_DIR, f), 'utf8');
      for (const re of [/\brole=/i, /aria-label/i, /<title/i, /<desc/i, /<script/i, /\son[a-z]+=/i, /foreignObject/i]) assert.ok(!re.test(s), `${f}: ${re}`);
      for (const m of s.matchAll(/(?:xlink:)?href="([^"]*)"/g)) assert.ok(m[1].startsWith('#'), `${f}: href ${m[1]}`);
    }
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [e.name]));
    for (const f of walk(path.join(PUB, 'assets'))) assert.ok(!/^emam-full-|^emam-mark-.*\.(png|webp)$|-preview\./i.test(f), f);
  });

  test('19. deep-gold lockup: darkest stop ≥ 4.5:1 and mean ≥ 3:1 on #fff; same viewBox and path count as the bright lockup', () => {
    const deep = fs.readFileSync(path.join(IMG_DIR, 'emam-logo-gold-deep.svg'), 'utf8');
    const bright = fs.readFileSync(path.join(IMG_DIR, 'emam-logo-gold.svg'), 'utf8');
    const stops = [...deep.matchAll(/stop-color="(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
    assert.ok(stops.length >= 2);
    const rs = stops.map((c) => B.contrast(c, '#ffffff'));
    assert.ok(Math.max(...rs) >= 4.5, `darkest ${Math.max(...rs).toFixed(2)}`);
    assert.ok(rs.reduce((s, r) => s + r, 0) / rs.length >= 3, `mean ${(rs.reduce((s, r) => s + r, 0) / rs.length).toFixed(2)}`);
    const vb = (s) => /viewBox="([^"]+)"/.exec(s)?.[1];
    assert.equal(vb(deep), vb(bright));
    assert.equal((deep.match(/<path/g) || []).length, (bright.match(/<path/g) || []).length);
    assert.equal(deep.replace(/stop-color="[^"]+"/g, ''), bright.replace(/stop-color="[^"]+"/g, ''), 'same artwork, only the stops differ');
  });

  test('20. the call-back way keeps the 10.0 filled pair (r2 P24); scope-tab and status-tab counts use --label-2 (r2 P23)', () => {
    assert.match(critical(''), /body\.pub \.pub-pick-way--callback\{[^}]*background:var\(--accent-500\);[^}]*color:var\(--on-accent\)/);
    const ui = css('v11-ui.css');
    assert.match(ui, /\.tab-count, \.scope-tabs \.n \{[^}]*color: var\(--label-2\)/);
    assert.match(ui, /\.scope-tabs \.n \{[^}]*color: var\(--label-2\)/);
    assert.match(ui, /\.segmented:has\(> \.seg:nth-child\(5\)\) > \[aria-pressed="true"\]::after \{[^}]*background: var\(--tint\)/);
    assert.doesNotMatch(ui, /\.(tab-count|n)\b[^{]*\{[^}]*color: var\(--label-3\)/);
  });
});

// ───────────────────────── V-5/V-6 لغة السطوح ─────────────────────────

describe('v11 visual — surfaces (V-5 staff/lawyer, V-6 company)', () => {
  test('21. triage cards: white on paper, no border or coloured edge; one tinted action; warn/AI pills neutral (r2 P12)', () => {
    const r = cssRules(css('v9-messaging.css'));
    const story = r.find((x) => x.sel === '.pa-story');
    assert.match(story.body, /border: 0/);
    assert.match(story.body, /box-shadow: var\(--e-1\)/);
    assert.ok(!r.some((x) => /^\.pa-story\.is-/.test(x.sel) && /border-inline-start/.test(x.body)), 'no state edge colours');
    assert.ok(r.some((x) => x.sel === '.pa-story-actions .btn-primary.pa-story-primary' && /background: var\(--tint-weak\)/.test(x.body)));
    assert.ok(r.some((x) => /\.pa-story-chips \.badge-warning/.test(x.sel) && /--tone-bg: var\(--fill-1\)/.test(x.body)));
    const cq = cssRules(css('v10-desk.css')).find((x) => x.sel === '.cq-card');
    assert.match(cq.body, /border: 0/);
    assert.ok(!/border-inline-start/.test(cq.body));
  });

  test('22. light sidebars: /app sidebar and /company side on surface-tint with a hairline; selected row p50/p700; the only filled count is «طلبات الشركات» / «المتابعة»', () => {
    const ui = css('v11-ui.css');
    assert.match(ui, /\.sidebar \{[^}]*background: var\(--surface-tint\)/);
    assert.match(ui, /\.nav-link\.is-active \{[^}]*background: var\(--tint-weak\);[^}]*color: var\(--tint\)/);
    assert.match(ui, /\.nav-count \{[^}]*background: none;[^}]*color: var\(--label-2\)/);
    assert.match(ui, /\.nav-link\[data-path="\/company-requests"\] \.nav-count \{[^}]*background: var\(--tint\)/);
    assert.match(ui, /\.brand::after \{[^}]*var\(--gold-line\)/);
    const co = css('v10-company.css');
    assert.match(co, /\.co-side \{[^}]*background: var\(--surface-tint\);[^}]*border-inline-end: 1px solid var\(--separator\)/);
    assert.match(co, /\.co-side-link\.is-active \{[^}]*background: var\(--tint-weak\)/);
    assert.match(co, /\.co-side-badge \{[^}]*background: var\(--tint\)/);
  });

  test('23. company «طلب جديد» is the one filled button (screen only); attention rows end in a tinted action word whose link covers the row', () => {
    const rules = cssRules(css('v10-company.css'));
    assert.ok(rules.some((r) => r.at.includes('@media screen') && r.sel.startsWith('.btn-accent:is(.co-new-side, .co-pill)') && /background: var\(--tint\)/.test(r.body)));
    assert.ok(rules.some((r) => r.sel === '.co-attn-row .k-row-trailing .btn' && /background: none/.test(r.body) && /color: var\(--tint\)/.test(r.body)));
    assert.ok(rules.some((r) => r.sel === '.co-attn-row .k-row-trailing .btn::after' && /inset: 0/.test(r.body)));
    assert.match(read('public/assets/js/company/pages/overview.js'), /btn\.setAttribute\('aria-describedby'/, 'C-10 description kept');
    // plan card: same words, the used count large
    const core = read('public/assets/js/lib/company-ui-core.js');
    assert.match(core, /copyParts\('usage\.used', \{ used: h\('b\.co-meter-big', String\(used\)\), included, date: dayText\(quota\.cycle_end\) \}\)/);
    assert.match(read('public/assets/js/company/words.js'), /used: 'استخدمتم \{used\} من \{included\} — تتجدد يوم \{date\}'/);
  });

  test('24. many-scope status filters are underline scope tabs (≥ 5 segments); ≤ 4 stay segmented controls', () => {
    const ui = css('v11-ui.css');
    assert.match(ui, /\.segmented:has\(> \.seg:nth-child\(5\)\) \{[^}]*background: none;[^}]*box-shadow: inset 0 -1px 0 var\(--separator\)/);
    assert.match(ui, /\.segmented:has\(> \.seg:nth-child\(5\)\) > \.seg \{[^}]*min-height: 44px/);
    assert.match(ui, /\.segmented \{[^}]*background: var\(--fill-2\)/);
  });

  test('25. lawyer shell: large title, grouped lists without borders, status dots from the status tokens, V11-16 tab bar (54 px, 25-px icons, active = tint)', () => {
    const lh = css('v91-l-home.css');
    assert.match(lh, /\.lh-h1 \{[^}]*font: var\(--t-large\)/);
    assert.match(lh, /\.lh-list \{[^}]*border-radius: var\(--r-20\);[^}]*box-shadow: var\(--e-1\)/);
    assert.doesNotMatch(/\.lh-list \{([^}]*)\}/.exec(lh)[1], /border:/);
    assert.match(lh, /\.lh-dot-red \{ background: var\(--bad\); \}/);
    assert.match(lh, /height: calc\(54px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    assert.match(lh, /\.is-lawyer \.lh-tab \.icon \{[^}]*width: 25px;[^}]*height: 25px/);
    assert.match(lh, /\.is-lawyer \.lh-tab\.is-active \{[^}]*color: var\(--tint\)/);
    assert.match(lh, /font-size: 11\.5px/);
    // the active tab is still announced (aria-current) now that the underline is gone
    assert.match(read('public/assets/js/app/lawyer-shell.js'), /setAttribute\('aria-current', 'page'\)/);
  });

  test('26. no coloured side edge on screen cards (V11-13): the v10/9.x edges are overridden or removed', () => {
    const screenOverride = (f, sel) => cssRules(css(f)).some((r) => r.at.includes('@media screen') && r.sel.split(',').map((s) => s.trim()).includes(sel) && /border(-inline-start)?: 0/.test(r.body));
    for (const [f, sel] of [['pages-b.css', '.pb-attention'], ['pages-b.css', '.pb-client-card'], ['pages-b.css', '.pb-facts-internal'], ['pages-b.css', '.pb-member.is-overdue'], ['v91-l-court.css', '.lc-pending-card'], ['v91-l-court.css', '.lc-cal-pending'], ['v91-lawyer-work.css', '.lw-brief'], ['v9-messaging.css', '.pa-call-say'], ['v9-ai.css', '.ai-error'], ['v10-company-pages.css', '.co-msg-clar .co-msg-bubble']]) {
      assert.ok(screenOverride(f, sel), `${f} ${sel}`);
    }
    assert.ok(!/border-inline-start/.test(cssRules(css('v10-company.css')).find((r) => r.sel === '.co-card-attention').body));
  });

  test('27. no grid forces a horizontal scroll at 180 CSS px: auto-fill/auto-fit minimums are capped at 100 % in the visual-owned sheets', () => {
    for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
      const text = f === 'public-site.css' ? css(f).split(MARKER)[0] : css(f);
      assert.ok(!/repeat\(auto-(?:fill|fit), minmax\(\d+px, 1fr\)\)/.test(stripComments(text)), `${f}: ${/repeat\(auto-(?:fill|fit), minmax\(\d+px, 1fr\)\)/.exec(text)?.[0]}`);
    }
  });

  test('28. offline page and manifest: gold lockup on the logo ground, paper background; v11-ui.css has no transition: all', () => {
    const sw = read('public/sw.js');
    assert.match(sw, /background:#032516/);
    assert.match(sw, /src="\/assets\/img\/emam-logo-gold\.svg"/);
    assert.match(read('public/manifest.webmanifest'), /"background_color": "#f6f6f3"/);
    assert.doesNotMatch(css('v11-ui.css'), /transition:\s*all\b/);
  });

  test('29. the light chrome reaches the topbar: search is a fill-1 field with a key cap; the inline title appears only after the large title scrolls away (static otherwise)', () => {
    assert.match(css('v9-practice.css'), /\.icon-btn\.v9p-search-trigger \{[^}]*background: var\(--fill-1\)/);
    const ui = css('v11-ui.css');
    assert.match(ui, /@supports \(animation-timeline: scroll\(\)\) \{\s*\.app-shell:not\(\.is-lawyer\):has\(\.page-header\) \.topbar-title \{[^}]*animation-timeline: scroll\(root\)/);
    // review fix: a short page has no scroll range, the timeline is inactive and the animation does not apply — the base
    // value must be the hidden one (the large title is on screen), and the keyframes must end visible
    assert.match(ui, /\.app-shell:not\(\.is-lawyer\):has\(\.page-header\) \.topbar-title \{ opacity: 0; animation: v11-bar-title/);
    assert.match(ui, /@keyframes v11-bar-title \{ from \{ opacity: 0; \} to \{ opacity: 1; \} \}/);
    // reduced motion / more contrast: the inline title is shown statically and must win over the higher-specificity base
    assert.equal((ui.match(/\.topbar-title \{ animation: none !important; opacity: 1 !important; \}/g) || []).length, 2);
  });

  test('30. grouped list component (§5.8): .g-list surface r20, inset separators, 30-px tinted icons, title 17/600, sub 15 label-2, trailing action in tint', () => {
    const ui = css('v11-ui.css');
    assert.match(ui, /\.g-list \{[^}]*border-radius: var\(--r-20\)/);
    assert.match(ui, /inset-inline: var\(--sep-inset, 16px\) 0/);
    assert.match(ui, /\.g-list\.has-icons \{ --sep-inset: 58px; \}/);
    assert.match(ui, /\.g-ico \{[^}]*flex: 0 0 30px;[^}]*background: var\(--tint-weak\)/);
    assert.match(ui, /\.g-title \{[^}]*font: var\(--t-headline\)/);
    assert.match(ui, /\.g-sub \{[^}]*font: var\(--t-subhead\);[^}]*color: var\(--label-2\)/);
    assert.match(ui, /\.g-trail\.is-action \{[^}]*color: var\(--tint\)/);
    for (const cls of ['.btn-filled', '.btn-tinted', '.btn-gray', '.btn-plain', '.btn-gold', '.pill-tint', '.pill-gold', '.pill-ok', '.pill-warn', '.pill-bad', '.pill-info', '.pill-neutral', '.count-quiet', '.large-title', '.meta-line', '.notice-warn']) assert.ok(ui.includes(`${cls} {`) || ui.includes(`${cls},`), cls);
  });
});

// ───────────────────────── مراجعة المسار (review): انحدار لكل خلل وُجد ─────────────────────────
describe('v11 visual — review fixes (one regression test per bug)', () => {
  const rule = (file, sel, text = css(file)) => cssRules(text).filter((r) => r.sel === sel);
  const onScreen = (file, sel) => rule(file, sel).find((r) => r.at.includes('@media screen'));
  const borderless = (body) => !/(^|;|\s)border(-color|-width|-style)?\s*:(?!\s*0\b)/.test(body);

  test('R1 company page titles use the large title (V11-44), like /app — not title1', () => {
    const r = rule('v10-company.css', '.co-h1');
    assert.equal(r.length, 1);
    assert.match(r[0].body, /font: var\(--t-large\)/);
  });

  test('R3 one filled button per screen: list/filter/card-header/2FA buttons are tinted on screen; the 404 header CTA steps back when the page has its own primary', () => {
    for (const [file, sel] of [
      ['v9-practice.css', ':is(.v9p-export-item, .v9p-impact-filters) .btn-primary'],
      ['v9-platform.css', '.pf-card-actions .btn-primary'],
      ['v9-accounts.css', '.acc-lead ~ .acc-actions-row > .btn-primary:not(.acc-2fa-wizard *)'],
      ['v10-company-pages.css', '.co-2fa > .btn-primary'],
    ]) {
      const r = onScreen(file, sel);
      assert.ok(r, `${file}: ${sel} inside @media screen`);
      assert.match(r.body, /background: var\(--tint-weak\)/, sel);
      assert.match(r.body, /color: var\(--tint\)/, sel);
    }
    // the 2FA wizard's own step buttons keep the filled primary
    assert.ok(!cssRules(css('v9-accounts.css')).some((r) => r.sel.startsWith('.acc-2fa-wizard') && /tint-weak/.test(r.body)));
    // hover of a tinted list button must not fall back to the filled hover
    assert.ok(onScreen('v9-practice.css', ':is(.v9p-export-item, .v9p-impact-filters) .btn-primary:hover:not(:disabled)'));
    assert.ok(onScreen('v9-platform.css', '.pf-card-actions .btn-primary:hover:not(:disabled)'));
    assert.match(critical('legal'), /body\.pub:has\(\.pub-doc \.pub-btn-primary\) \.pub-nav-cta\{background:var\(--tint-weak\);color:var\(--tint\)\}/);
    // the triage card keeps one tinted action: «لم ترد» is gray (V11-47)
    const na = onScreen('v9-messaging.css', '.pa-story-actions .pa-story-noanswer');
    assert.ok(na);
    assert.match(na.body, /background: var\(--fill-1\)/);
  });

  test('R4 public header: the 44-px contact and menu buttons never shrink (were 38/40 px at 360 with the longer paid pill)', () => {
    const g = critical('');
    assert.match(g, /\.pub-menu-toggle\{display:inline-grid;flex:none;/);
    assert.match(g, /body\.pub \.pub-head-contact\{display:inline-grid;flex:none;/);
    assert.ok(Buffer.byteLength(g) <= 8500);
  });

  test('R5/R8 hit areas ≥ 44 px measured from the padding box (bordered 32-px .btn-sm, 36-px chips, segments, switches, day numbers, crumbs, queue chips)', () => {
    const ui = stripComments(css('v11-ui.css'));
    assert.match(ui, /\.btn-sm:not\(\.is-loading\)::after \{[^}]*inset: -7px 0/); // 30 + 14 (1-px border)
    assert.match(ui, /\.seg \{[^}]*min-width: 44px/);
    assert.match(ui, /\.btn-sm\.btn-icon:not\(\.is-loading\)::after \{ inset: -7px; \}/); // icon-only 32×32 → 44×44 (matter parties: copy/edit/delete)
    assert.match(ui, /:is\(\.breadcrumbs, \.co-crumbs\) a::after \{[^}]*inset: -12px -7px/);
    const app = rule('app.css', '.chip-toggle::after')[0];
    assert.match(app.body, /inset: -5px 0/); // 34 + 10 (1-px border)
    assert.match(rule('app.css', '.chip-toggle')[0].body, /position: relative/);
    const pr = stripComments(css('v9-practice.css'));
    assert.match(pr, /\.v9p-seg-btn::after, \.v9p-day-num::after \{[^}]*inset: -4px 0/); // 36 + 8 (no border)
    assert.match(pr, /\.v9p-day-num::after \{ inset: -7px; \}/); // 30 + 14
    // wrapped chip rows: a 10-px row gap keeps neighbouring 44-px areas from overlapping (the lower chip used to win the tap)
    assert.match(pr, /\.v9p-type-toggles \{[^}]*gap: 10px 6px/);
    assert.match(rule('pages-d.css', '.pd-switch::after')[0].body, /inset: -7px 0/);
    assert.match(rule('pages-a.css', '.pa-qnav-item')[0].body, /min-height: 44px/);
    assert.match(css('public-site.css'), /body\.pub \.pub-toc a \{[^}]*min-width: 48px/);
  });

  test('R6/R7 no border + shadow, no bordered notice boxes (V11-13, V11-P3): fills or the soft elevation only', () => {
    for (const [file, sels] of [
      ['v9-messaging.css', ['.qr-card']],
      ['pages-d.css', ['.pd-lcard', '.pd-template', '.pd-redact', '.pd-redact.has-value', '.pd-sem']],
      ['v10-desk.css', ['.cr-banner', '.cs-preview-card .co-card,\n.cs-preview-card .co-deliverable']],
      ['v10-company.css', ['.co-promise', '.co-promise.tone-warning']],
      ['v9-platform.css', ['.pf-check', '.pf-check.is-danger', '.pf-check.is-warning', '.pf-webhook']],
      ['v91-lawyer-work.css', ['.lw-steps']],
    ]) {
      for (const sel of sels) {
        const rs = rule(file, sel.replace(/\s+/g, ' ').replace(/, /g, ', '));
        const r = rs.length ? rs : cssRules(css(file)).filter((x) => x.sel.replace(/\s+/g, ' ') === sel.replace(/\s+/g, ' '));
        assert.ok(r.length, `${file}: ${sel}`);
        for (const x of r) assert.ok(borderless(x.body), `${file}: ${sel} → ${x.body.trim().slice(0, 120)}`);
      }
    }
    const ds = stripComments(css('v10-desk.css'));
    for (const tone of ['danger', 'warning', 'info', 'success']) assert.match(ds, new RegExp(`\\.cr-banner\\.is-${tone} \\{ box-shadow: none; background:`));
    const pr = stripComments(css('v9-practice.css'));
    assert.match(pr, /\.v9p-overdue \{ background: var\(--danger-100\);/);
    assert.match(pr, /\.v9p-export-item \{ border-radius: var\(--r-14\);[^}]*background: var\(--surface-tint\)/);
    // cards: soft elevation without a border
    assert.match(rule('v9-messaging.css', '.qr-card')[0].body, /box-shadow: var\(--e-1\)/);
    assert.match(rule('pages-d.css', '.pd-lcard')[0].body, /box-shadow: var\(--e-1\)/);
  });

  test('R9 print isolation (INV-22, PW-V1 strict pairs): paper keeps the 10.0 neutrals, radii, shadows and the 2-px icon stroke', () => {
    const app = css('app.css');
    const pr = cssRules(app).filter((r) => r.at.includes('@media print'));
    const root = pr.find((r) => r.sel === ':root');
    assert.ok(root, '@media print :root');
    for (const [k, v] of [['--gray-900', '#16202a'], ['--gray-50', '#f6f8f9'], ['--text', '#16202a'], ['--text-muted', '#4f5d6b'], ['--border', '#dfe5ea'], ['--label', '#16202a'], ['--label-2', '#4f5d6b'], ['--separator', '#dfe5ea'], ['--surface-tint', '#f8fafb'], ['--surface-2', '#f8fafb'], ['--radius', '10px'], ['--radius-lg', '14px']]) {
      assert.match(root.body, new RegExp(`${k}: ${v};`), k);
    }
    assert.match(pr.find((r) => r.sel === 'svg.icon').body, /stroke-width: 2/);
    // no brand step is frozen in print (paper follows the brand settings)
    assert.ok(!/--(primary|accent)-/.test(root.body));
  });

  test('R10 PW-V8 /company cold CSS: linked sheets + v10-company-pages.css (loaded on every company route, sign-in included) ≤ 30,000 B br as served', () => {
    const html = read('public/company.html');
    const links = [...html.matchAll(/<link rel="stylesheet" href="\/(assets\/css\/[^"?]+)/g)].map((m) => m[1]);
    const cold = links.reduce((s, l) => s + served(l), 0) + served('assets/css/v10-company-pages.css');
    assert.ok(cold <= 30000, `cold /company CSS ${cold}`);
    assert.match(read('public/assets/js/company/main.js'), /ensureStyles\(\['v10-company-pages'\]\)/);
    // the comment strip kept the two markers the colour tests read
    assert.equal((css('app.css').match(/@brand-defaults-(start|end)/g) || []).length, 2);
    // …and the comment anchor the v9.2 44-px phone-target test slices on (v92-gate-admin K6/N15)
    assert.match(css('app.css'), /\/\* v9\.2 بوابة K6\/N15[^*]*\*\/\n@media \(max-width: 640px\) \{\n {2}\.app-shell:not\(\.is-lawyer\) #main \.btn:not\(\.btn-lg\) \{/);
  });

  test('R12 200 % zoom (180 CSS px, INV-19): pills/badges/codes wrap, flex rows wrap and their children shrink — beats the later nowrap .seg-chip', () => {
    const narrow = cssRules(css('v11-ui.css')).filter((r) => r.at.includes('@media (max-width: 340px)'));
    const find = (sel) => narrow.find((r) => r.sel === sel);
    assert.match(find('#main :is(.pill, .badge)').body, /white-space: normal;/); // (1,1,0) > .seg-chip (0,1,0) in v11-segment.css
    assert.match(find('#main :is(.nowrap, code, time, .pd-period-label)').body, /overflow-wrap: anywhere/);
    assert.match(find('#main :is(.card-heading, .alert, .tl-item, .v9p-cal-nav, .pd-period-pick, .v9p-hbar, .pd-rules, .notif-list li) > *').body, /min-width: 0/);
    assert.match(find('#main :is(.v9p-cal-nav, .pd-period-pick, .page-actions, .acc-pager, .pd-rule-head, .acc-session, .v9p-seg)').body, /flex-wrap: wrap/);
    assert.match(find('#main .v9p-hbar').body, /minmax\(0, 34%\)/);
    assert.match(find('.v9p-cal-month, .v9p-lawyer-filter .select-wrap, .cr-handler').body, /min-width: 0/);
    assert.match(css('v11-segment.css'), /\.seg-chip \{[^}]*white-space: nowrap/); // the rule the override must beat
  });

  test('R11 the strong charity edge stays charity-only: the paid ways row keeps the soft ring (L11-54)', () => {
    const r = rule('public-site.css', 'body.pub[data-side="paid"] .pub-pick-way--follow');
    assert.equal(r.length, 1);
    assert.match(r[0].body, /box-shadow: 0 0 0 1px rgb\(var\(--primary-700-rgb\) \/ 0\.12\)/);
    assert.ok(css('public-site.css').indexOf('body.pub[data-side="paid"] .pub-pick-way--follow') < css('public-site.css').indexOf(MARKER));
  });
});
