// الإصدار 12.0 — مسار look (§8.4 من مواصفة 12.0، K12-67): «ورق المكتب» — الخطوط، الرموز، وجه العناوين في مواضعه وحدها،
// الكتل الحرجة والميزانيات، طبقة المكونات (v12-look.css)، شاشات «خيري» كما هي، وأزواج التباين للون الافتراضي و8 أزواج معادية.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { setPublicRoot, transformAsset } from '../src/site-assets.js';
import { CRITICAL_RE } from '../src/site.js';
import { buildTheme, contrast, over } from '../public/assets/js/lib/brand-color.js';
import { DEFAULT_SETTINGS } from '../src/constants.js';
import { startTestApp } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const CSS_DIR = path.join(PUB, 'assets/css');
const FONTS = path.join(PUB, 'assets/fonts');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = (f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
setPublicRoot(PUB);
const served = (rel) => br(transformAsset(path.join(PUB, rel)));
const linkedSheets = (page) => [...read(`public/${page}`).matchAll(/<link rel="stylesheet" href="\/(assets\/css\/[\w.-]+\.css)"/g)].map((m) => m[1]);

/** القواعد مع سياقها: [{ sel, body, at: ['@media …'] }] (تسطيح @media/@supports، وتجاهل @font-face/@keyframes) */
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
      else if (!sel.startsWith('@')) out.push({ sel: sel.replace(/\s+/g, ' '), body, at });
      i = j;
    }
  };
  walk(stripComments(text), []);
  return out;
}
const fontFaces = (text) => [...stripComments(text).matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);

/** كتلة حرجة مسماة ('' = العامة) كما يضمّنها site.js تقريبًا (مضغوطة المسافات) — CRITICAL_RE هو المصدر الواحد */
function critical(name = '') {
  let out = '';
  for (const m of css('public-site.css').matchAll(CRITICAL_RE)) if ((m[1] || '') === name) out += m[2];
  return out.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();
}

/** "U+0020, U+0621-063A" → مجموعة نقاط الترميز */
function codePoints(range) {
  const set = new Set();
  for (const part of range.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i.exec(part);
    assert.ok(m, `bad unicode-range part ${part}`);
    const a = parseInt(m[1], 16);
    const b = m[2] ? parseInt(m[2], 16) : a;
    for (let c = a; c <= b; c += 1) set.add(c);
  }
  return set;
}
const rangeOf = (face) => (/unicode-range:\s*([^;]+);?/.exec(face) || [])[1]?.trim() || '';
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// ───────────────────────── الخطوط (K12-11/12، L12-13 أ/ج) ─────────────────────────
describe('v12 look — fonts (K12-11, K12-12, L12-13)', () => {
  const README = fs.readFileSync(path.join(FONTS, 'README.txt'), 'utf8');
  const AMIRI_LIST = (/amiri-code-points:\s*([^\n]+)/.exec(README) || [])[1]?.trim();
  const amiriFaces = () => [...fontFaces(css('app.css')), ...fontFaces(critical(''))].filter((f) => /Emam Display/.test(f) && /amiri-arabic-400-sub/.test(f));
  const cormorantFaces = () => [...fontFaces(css('app.css')), ...fontFaces(critical(''))].filter((f) => /Emam Display/.test(f) && /cormorant-latin-500-sub/.test(f));

  test('(b) both subsets are vendored with the K12-11 sizes recorded in fonts/README.txt (± 0) and within budget', () => {
    const amiri = fs.statSync(path.join(FONTS, 'amiri-arabic-400-sub.woff2')).size;
    const corm = fs.statSync(path.join(FONTS, 'cormorant-latin-500-sub.woff2')).size;
    assert.ok(amiri <= 42000, `Amiri ${amiri} B > 42,000 (L12-13 a)`);
    assert.ok(corm <= 13000, `Cormorant ${corm} B > 13,000`);
    assert.match(README, new RegExp(`amiri-arabic-400-sub\\.woff2\\s+${amiri.toLocaleString('en-US')} B`));
    assert.match(README, new RegExp(`cormorant-latin-500-sub\\.woff2\\s+${corm.toLocaleString('en-US')} B`));
    for (const f of ['amiri-arabic-400-sub.woff2', 'cormorant-latin-500-sub.woff2']) assert.equal(fs.readFileSync(path.join(FONTS, f)).subarray(0, 4).toString('latin1'), 'wOF2', f);
  });

  test('(b) OFL.txt carries both copyrights (Amiri, Cormorant) next to Plex', () => {
    const ofl = fs.readFileSync(path.join(FONTS, 'OFL.txt'), 'utf8');
    assert.match(ofl, /Copyright 2010-2022 The Amiri Project Authors/);
    assert.match(ofl, /Copyright 2015 The Cormorant Project Authors/);
    assert.match(ofl, /IBM Corp\. with Reserved Font Name "Plex"/);
  });

  test('L12-13 (a): every Amiri @font-face unicode-range equals the subset code points in fonts/README.txt — no wider range', () => {
    assert.ok(AMIRI_LIST, 'README has the amiri-code-points line');
    const want = codePoints(AMIRI_LIST);
    assert.ok(want.has(0x067e) && want.has(0x0686) && want.has(0x06a4) && want.has(0x06af) && want.has(0x06cc), 'r2 letters پ چ ڤ گ ی');
    for (let c = 0x0653; c <= 0x0655; c += 1) assert.ok(want.has(c), `U+${c.toString(16)} (r2 maddah/hamza marks)`);
    for (let c = 0x0660; c <= 0x066d; c += 1) assert.ok(want.has(c), `U+${c.toString(16)} (r2 Arabic-Indic digits)`);
    const faces = amiriFaces();
    assert.equal(faces.length, 2, 'one Amiri face in app.css and one in the public general critical block');
    for (const f of faces) {
      const r = rangeOf(f);
      assert.doesNotMatch(r, /U\+0600-06FF/i, 'never the whole Arabic block (missing letters would fall back one glyph at a time)');
      assert.ok(sameSet(codePoints(r), want), `range ${r} ≠ README list`);
    }
  });

  test('(c) the space belongs to the Amiri range, not to the Cormorant range; both faces are font-display: optional', () => {
    for (const f of amiriFaces()) {
      assert.ok(codePoints(rangeOf(f)).has(0x20));
      assert.match(f, /font-display:\s*optional/);
    }
    const corm = cormorantFaces();
    assert.equal(corm.length, 2);
    for (const f of corm) {
      const set = codePoints(rangeOf(f));
      assert.ok(!set.has(0x20) && !set.has(0xa0), 'no space in the Latin range (a display line must not pull the Latin file)');
      assert.ok(set.has(0x30) && set.has(0x41), 'digits and Latin letters');
      assert.match(f, /font-display:\s*optional/);
    }
  });
});

// ───────────────────────── وجه العناوين: قائمة سماح (L12-13 ب) ─────────────────────────
describe('v12 look — the display face only on static headings (L12-13 b)', () => {
  const ALLOW = [
    /(^|\s)\.q__title$/,
    /\.pub-page-hero h1$/,
    /\.pub-paid-head h1$/,
    /\.pub-band-title$/,
    /body\.pub-paid \.pub-section h2$/,
    /\.closing h2$/,
    /\.bmf-title$/,
    /\.bmf-success h1\)?$/,
    /\.bp-login-title$/,
    /^\.page-title$/,
    /^\.empty-title$/,
  ];
  const FORBIDDEN = /\b(input|select|textarea)\b|\.opt__t|\.opt\b(?!s)|\.bp-greet|\.portal-greet|\.co-h1|\.co-overview|\.lh-h1|\.svc__t|\.stat-value/;
  const displayUses = () => {
    const out = [];
    for (const f of fs.readdirSync(CSS_DIR).filter((x) => x.endsWith('.css'))) {
      for (const r of cssRules(css(f))) {
        if (r.sel === ':root' || r.sel.startsWith(':root')) continue;
        if (/font(-family)?\s*:[^;]*(var\(--d[1-4]\)|var\(--f-display\)|Emam Display)/.test(r.body)) out.push({ f, sel: r.sel });
      }
    }
    return out;
  };

  test('every selector that sets the display face is in the allow-list and none is a form control, an option row or user data', () => {
    const uses = displayUses();
    assert.ok(uses.length >= 8, `found ${uses.length}`);
    for (const { f, sel } of uses) {
      const parts = sel.replace(/^body\[data-side="paid"\] :is\((.*)\)$/, '$1').split(/,\s*/);
      for (const p of parts) {
        assert.ok(ALLOW.some((re) => re.test(p.trim())), `${f}: «${p.trim()}» uses the display face but is not on the allow-list`);
        assert.doesNotMatch(p, FORBIDDEN, `${f}: «${p.trim()}»`);
      }
    }
  });

  test('option rows are Plex 400 20px ink (entry block); names and record titles use the UI face (/p/ greeting, company titles, staff records)', () => {
    const entry = critical('entry');
    assert.match(entry, /\.opt__t\{[^}]*font:400 20px\/[\d.]+ var\(--f-ui\)[^}]*color:var\(--ink\)|\.opt__t\{[^}]*color:var\(--ink\)[^}]*font:400 20px\/[\d.]+ var\(--f-ui\)/);
    assert.match(css('v91-portal.css'), /body\[data-side="paid"\] \.bp-greet h1 \{[^}]*font: 600 [^;]*var\(--f-ui\)/);
    assert.match(css('v10-desk.css'), /\.page-header:has\(\.breadcrumbs\) \.page-title,\s*\.pa-page-dashboard \.page-title \{ font: 600 26px\/1\.4 var\(--f-ui\); \}/);
    const coH1 = cssRules(css('v10-company.css')).filter((r) => r.sel === '.co-h1');
    assert.equal(coH1.length, 1);
    assert.doesNotMatch(coH1[0].body, /--d[1-4]|--f-display|Emam/);
  });

  test('Arabic is never letter-spaced in the v12 layer (v12-look.css, entry and paid critical blocks)', () => {
    for (const [name, text] of [['v12-look.css', stripComments(css('v12-look.css'))], ['entry', critical('entry')], ['paid', critical('paid')]]) {
      for (const m of text.matchAll(/letter-spacing\s*:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^(0|normal|0em|0px)$/, `${name}: letter-spacing ${m[1]}`);
    }
  });
});

// ───────────────────────── الكتل الحرجة والميزانيات (§4، §8.4، K12-67 ز) ─────────────────────────
describe('v12 look — critical blocks and budgets (§4, K12-67 g)', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => t && t.close());
  const get = (u, headers = {}) => fetch(t.base + u, { headers, redirect: 'manual' });
  const firstStyle = (html) => (/<style[^>]*>([\s\S]*?)<\/style>/.exec(html) || [])[1] || '';

  test(':entry block ≤ 3,072 B and the general block ≤ 8,500 B (CRITICAL_RE is the parser)', () => {
    const entry = Buffer.byteLength(critical('entry'));
    const general = Buffer.byteLength(critical(''));
    assert.ok(entry > 500 && entry <= 3072, `entry ${entry} B`);
    assert.ok(general > 2000 && general <= 8500, `general ${general} B`);
  });

  test('every first <style> ≤ 12,288 B on /, /start/consultation, /services, /privacy and the paid intake', async () => {
    for (const u of ['/', '/start/consultation', '/services', '/privacy', '/intake?path=consultation/family/inheritance']) {
      const r = await get(u);
      assert.equal(r.status, 200, u);
      const s = firstStyle(await r.text());
      // the paid intake links its sheets in <head> and inlines nothing (EN-5); every other page inlines the critical blocks
      if (!u.startsWith('/intake')) assert.ok(s.length > 1000, `${u}: inline critical CSS present`);
      assert.ok(Buffer.byteLength(s) <= 12288, `${u}: first <style> ${Buffer.byteLength(s)} B`);
    }
  });

  test('H-L1: the Amiri preload is on /services only, and not with Save-Data: on', async () => {
    const PRE = /<link rel="preload" href="\/assets\/fonts\/amiri-arabic-400-sub\.woff2(\?v=[^"]*)?" as="font" type="font\/woff2" crossorigin/;
    assert.match(await (await get('/services')).text(), PRE);
    assert.doesNotMatch(await (await get('/services', { 'save-data': 'on' })).text(), PRE);
    for (const u of ['/', '/start/consultation', '/privacy', '/intake?path=consultation/family/inheritance']) assert.doesNotMatch(await (await get(u)).text(), PRE, u);
  });

  test('/app stylesheets ≤ 60,000 B br and v12-look.css ≤ 6,144 B br (linked last); /company ≤ 30,000 B br with its page sheet', () => {
    const app = linkedSheets('app.html');
    assert.equal(app.at(-1), 'assets/css/v12-look.css', 'v12-look.css is the last sheet in app.html');
    const appTotal = app.reduce((n, f) => n + served(f), 0);
    assert.ok(appTotal <= 60000, `/app CSS ${appTotal} B br`);
    assert.ok(served('assets/css/v12-look.css') <= 6144, `v12-look.css ${served('assets/css/v12-look.css')} B br`);
    const co = linkedSheets('company.html');
    assert.equal(co.at(-1), 'assets/css/v12-look.css', 'v12-look.css is the last sheet in company.html');
    const coTotal = co.reduce((n, f) => n + served(f), 0) + served('assets/css/v10-company-pages.css');
    assert.ok(coTotal <= 30000, `/company CSS ${coTotal} B br`);
    console.log(`  /app ${appTotal} B br · /company ${coTotal} B br · v12-look ${served('assets/css/v12-look.css')} B br`);
  });

  test('(f) the paid footer copyright names the firm (brand_name), never the foundation (org_legal_name)', async () => {
    const html = await (await get('/services')).text();
    const foot = (/<footer[\s\S]*?<\/footer>/.exec(html) || [])[0] || '';
    assert.ok(foot.includes(DEFAULT_SETTINGS.brand_name), 'brand_name in the footer');
    assert.ok(!foot.includes(DEFAULT_SETTINGS.org_legal_name), 'no org_legal_name in the paid footer');
    assert.match(foot, /©/);
  });
});

// ───────────────────────── طبقة المكونات والقواعد (K12-P1…P8، §5.7) ─────────────────────────
describe('v12 look — component layer and rules (§5.7, K12-P1…P8)', () => {
  const look = () => cssRules(css('v12-look.css'));

  test('§5.7 classes exist: .state (dot + word) with its tones, .line-chip, .line-path(--suggest), .path-line(__k/__src), .btn-link with a ≥ 44 px hit area, .vt-warn', () => {
    const sels = look().map((r) => r.sel);
    for (const s of ['.state', '.state::before', '.state--ok', '.state--warn', '.state--bad', '.state--muted', '.line-chip', '.line-path', '.line-path--suggest', '.path-line', '.path-line__k', '.path-line__src', '.btn-link', '.btn-link::after', '.vt-warn']) {
      assert.ok(sels.some((x) => x.split(/,\s*/).includes(s)), s);
    }
    assert.match(look().find((r) => r.sel === '.btn-link::after').body, /inset: -12px -6px/);
    assert.match(look().find((r) => r.sel === '.state::before').body, /border-radius: 50%/);
  });

  test('(d) no gradient( in v12-look.css nor in the general, entry and paid critical blocks', () => {
    for (const [n, text] of [['v12-look.css', stripComments(css('v12-look.css'))], ['general', critical('')], ['entry', critical('entry')], ['paid', critical('paid')]]) {
      assert.doesNotMatch(text, /gradient\(/, n);
    }
  });

  test('(e) box-shadow in v12-look.css: only inset start bars, rings on focus, or sheets/dialogs — never an elevation shadow on a row or card', () => {
    for (const r of look()) {
      for (const m of r.body.matchAll(/box-shadow\s*:\s*([^;]+)/g)) {
        const v = m[1].trim();
        const ok = v === 'none' || /^inset\b/.test(v) || /focus|sheet|dialog|modal/.test(r.sel);
        assert.ok(ok, `${r.sel}: box-shadow ${v}`);
      }
    }
  });

  test('gold is the logo\'s (K12-P4): never text, fill or border in the v12 layer and the paid/entry blocks', () => {
    for (const [n, text] of [['v12-look.css', stripComments(css('v12-look.css'))], ['entry', critical('entry')], ['paid', critical('paid')]]) {
      assert.doesNotMatch(text, /(color|background|border(-[a-z-]+)?)\s*:\s*var\(--gold\)/, n);
    }
  });

  test('L12-57: .sec-label is display:none outside @media (min-width: 900px) and only shown inside it (no eyebrow on phones)', () => {
    const rules = cssRules(css('public-site.css')).filter((r) => r.sel.split(/,\s*/).some((s) => /\.sec-label$/.test(s.trim()) && !/:not\(\.sec-label\)/.test(s)));
    const wide = (r) => r.at.some((a) => /min-width:\s*900px/.test(a));
    const base = rules.filter((r) => !wide(r));
    assert.ok(base.some((r) => /display:\s*none/.test(r.body)), 'a base rule hides it');
    for (const r of base) assert.ok(!/display:\s*(?!none)[a-z]/.test(r.body), `${r.sel} shows the label below 900 px`);
    assert.ok(rules.some((r) => wide(r) && /display:\s*block/.test(r.body)), 'shown in the margin column from 900 px');
  });

  test('K12-37/K12-38 on the work shells: no leading row icons, chips are hairlines (not pills, not filled), red only on the bell', () => {
    assert.match(css('v10-desk.css'), /\.nav-link \.icon \{ display: none; \}/);
    const co = cssRules(css('v10-company.css'));
    assert.ok(co.some((r) => r.sel.split(/,\s*/).includes('.k-body .k-row-icon:not(:has(.co-date-chip))') && /display: none/.test(r.body)));
    assert.ok(co.some((r) => r.sel.split(/,\s*/).includes('.co-side-link .icon') && /display: none/.test(r.body)));
    const chip = cssRules(css('app.css')).find((r) => r.sel === '.chip-toggle');
    assert.match(chip.body, /border-radius: var\(--r-1\)/);
    const on = cssRules(css('app.css')).find((r) => r.sel === '.chip-toggle.is-on, .chip-toggle[aria-pressed="true"]');
    assert.doesNotMatch(on.body, /background: var\(--primary-700\)/);
    assert.match(cssRules(css('v10-experience.css')).find((r) => r.sel === '.k-tab-badge').body, /background: var\(--act\)/);
    assert.match(cssRules(css('v91-l-home.css')).find((r) => r.sel === '.lh-tab-badge').body, /background: var\(--act\)/);
  });

  test('K12-35 meter and K12-28 steps: progress is a 2-px track with an act fill; the step tracker draws diamonds, never numbered circles', () => {
    const app = cssRules(css('app.css'));
    assert.match(app.find((r) => r.sel === '.progress').body, /height: 2px/);
    assert.doesNotMatch(stripComments(css('app.css')), /\.progress\.tone-accent \.progress-bar \{ background: var\(--accent/);
    const ex = cssRules(css('v10-experience.css'));
    assert.match(ex.find((r) => r.sel === '.step-tracker-dot > *').body, /display: none/);
    assert.match(ex.find((r) => r.sel === '.step-tracker-dot::before').body, /transform: rotate\(45deg\)/);
    assert.doesNotMatch(ex.find((r) => r.sel === '.step-tracker-dot').body, /border-radius: 50%/);
  });

  test('K12-20: one filled action per screen: secondary, tinted and accent buttons are 1-px ink outlines (except the company «طلب جديد»)', () => {
    const r = look().find((x) => x.sel.startsWith('.btn-secondary, .btn-accent:not(.co-new-side, .co-pill), .btn-tinted, .btn.btn--line'));
    assert.ok(r, 'outline rule');
    assert.match(r.body, /background: none;[^}]*border-color: var\(--ink\);[^}]*color: var\(--ink\)/);
    assert.ok(look().some((x) => x.sel === '.btn.btn--primary' && /background: var\(--act\)/.test(x.body)));
    assert.ok(look().every((x) => x.at.length === 0 || x.at.some((a) => /screen|forced-colors/.test(a))), 'screen only (printed letterheads unchanged)');
  });

  test('K12-33: the current sidebar row is white with a 2-px act start bar on /app and /company', () => {
    const r = look().find((x) => x.sel === '.nav-link.is-active, .co-side-link.is-active');
    assert.match(r.body, /background: var\(--paper\);[^}]*box-shadow: inset -2px 0 0 var\(--act\)/);
    assert.match(cssRules(css('v10-company.css')).find((x) => x.sel === '.co-side-badge').body, /background: none;[^}]*color: var\(--act\)/);
  });

  test('L12-87: segment markers are diamonds drawn by CSS (charity outline --gold-ink, paid --act, company filled), glyphs hidden', () => {
    const seg = cssRules(css('v11-segment.css'));
    assert.match(seg.find((x) => x.sel === '.seg-chip::before').body, /border: 1\.5px solid var\(--act\);[^}]*transform: rotate\(45deg\)/);
    assert.match(seg.find((x) => x.sel === '.seg-chip--charity::before').body, /border-color: var\(--gold-ink\)/);
    assert.match(seg.find((x) => x.sel === '.seg-chip--company::before').body, /background: var\(--act\)/);
    assert.match(seg.find((x) => x.sel === ':is(.seg-chip, .seg-switch) .seg-glyph').body, /display: none/);
  });

  test('L12-83: inbox row actions on phones are line buttons; .btn--sm keeps a ≥ 44 px hit area (38 + 2 × 4 extender + borders)', () => {
    assert.match(stripComments(css('v9-messaging.css')), /\.pa-story-actions \.btn\.btn--line \{[^}]*border-color: var\(--ink\)/);
    const sm = look().find((x) => x.sel === '.btn.btn--sm:not(.is-loading)::after');
    assert.match(sm.body, /inset: -4px 0/);
    assert.match(look().find((x) => x.sel === '.btn.btn--sm').body, /--btn-h: 38px/);
  });

  test('L12-32: the company «طلب جديد» catalog is ruled option rows by CSS alone (no tile card, no icon, a forward arrow)', () => {
    const p = cssRules(css('v10-company-pages.css'));
    const tile = p.find((r) => r.sel === '.co-type-tile');
    assert.doesNotMatch(tile.body, /box-shadow|border-radius|background/);
    assert.match(tile.body, /border-block-end: 1px solid var\(--rule\)/);
    assert.match(p.find((r) => r.sel === '.co-type-tile .icon').body, /display: none/);
    assert.match(p.find((r) => r.sel === '.co-type-tile::after').body, /mask: url\("data:image\/svg\+xml/);
    assert.match(p.find((r) => r.sel === '.co-type-tile-label').body, /font: 400 19px \/ 1\.45 var\(--f-ui\)/);
  });
});

// ───────────────────────── «خيري» كما هي (K12-15، L12-33) ─────────────────────────
describe('v12 look — the archived charity screens keep their picture-tile design (K12-15, L12-33)', () => {
  test('charity-only selectors are still present and never scoped under the paid side', () => {
    const all = cssRules(css('public-site.css')).concat(cssRules(css('v91-b-forms.css')));
    for (const s of ['.pub-pick-tile', '.pub-pick-ways', '.pub-pick-way', '.bmf-tile', '.bmf-tiles']) {
      const rs = all.filter((r) => r.sel.split(/,\s*/).some((x) => x.includes(s)));
      assert.ok(rs.length, `${s} rules exist`);
      assert.ok(rs.some((r) => r.sel.split(/,\s*/).some((x) => x.includes(s) && !/pub-paid|data-side="paid"/.test(x))), `${s} has unscoped (charity) rules`);
    }
    assert.ok(critical('charity').length > 1500, 'the charity first-screen block is still inlined for the charity home');
  });

  test('the v12 role re-point moves every public page except the charity screens', () => {
    const g = critical('');
    assert.match(g, /:root:has\(>body:not\(\[data-side="charity"\],\.pub-charity\)\)\{/);
  });
});

// ───────────────────────── النص (K12-41، L12-34) ─────────────────────────
describe('v12 look — chrome and company copy without the em-dash cadence (K12-41, L12-34)', () => {
  const values = (file) => stripComments(read(file)).replace(/^\s*\/\/.*$/gm, '');

  test('company words files: no «—» or «–» in any value; placeholders kept', () => {
    for (const f of ['public/assets/js/company/words.js', 'public/assets/js/company/words-pages.js', 'public/assets/js/company/words-flows.js']) {
      const v = values(f);
      assert.doesNotMatch(v, /[—–]/, f);
    }
    const w = read('public/assets/js/company/words.js');
    assert.match(w, /used: 'استخدمتم \{used\} من \{included\}، وتتجدد يوم \{date\}'/);
    assert.match(read('public/assets/js/company/words-pages.js'), /cycle_label: 'من \{from\} إلى \{to\}'/);
  });

  test('staff shell chrome: «منصة المكتب», groups «اليوم · الشركات · المكتب», the demo line without «—»', () => {
    const s = read('public/assets/js/app/shell.js');
    assert.match(s, /'منصة المكتب'/);
    for (const g of ["title: 'اليوم'", "title: 'الشركات'", "title: 'المكتب'"]) assert.ok(s.includes(g), g);
    assert.match(s, /'نسخة تجريبية، البيانات وهمية'/);
    assert.doesNotMatch(s, /'نسخة تجريبية —/);
  });
});

// ───────────────────────── التباين (K12-67 أ، K12-80) ─────────────────────────
describe('v12 look — contrast contract A1–A11 for the default and 8 hostile brand pairs (K12-67 a, K12-80)', () => {
  const PAIRS = [['#0b3d29', '#cca454'], ['#0b5a3c', '#c9a14a'], ['#f2e600', '#00e5ff'], ['#d0021b', '#1f4fff'], ['#000000', '#ffffff'], ['#ffffff', '#000000'], ['#6a1b9a', '#d4af37'], ['#00897b', '#ff7043'], ['#ff4fa3', '#b6ff00']];
  const NEU = { paper: '#ffffff', paper2: '#f8f6f1', paper3: '#f1eee6', ink: '#13201a', ink2: '#4a524d', ink3: '#686f6b', field: '#8a8f8a' };
  const A = [
    ['A1 white on act (filled button)', (T) => contrast('#ffffff', T.p[700]), 4.5],
    ['A2 act on paper', (T) => contrast(T.p[700], NEU.paper), 4.5],
    ['A3 act on paper-2', (T) => contrast(T.p[700], NEU.paper2), 4.5],
    ['A4 act on paper-3', (T) => contrast(T.p[700], NEU.paper3), 4.5],
    ['A5 white on act-hover', (T) => contrast('#ffffff', T.p[800]), 4.5],
    ['A6 focus ring vs paper', (T) => contrast(T.p[700], NEU.paper), 3],
    ['A7 selected / progress vs paper-2', (T) => contrast(T.p[700], NEU.paper2), 3],
    ['A8 footer text white 78 % on p900', (T) => contrast(over('#ffffff', 0.78, T.p[900]), T.p[900]), 4.5],
    ['A9 footer heading on p900', (T) => contrast('#ffffff', T.p[900]), 4.5],
    ['A10 charity diamond a700 vs paper', (T) => contrast(T.a[700], NEU.paper), 3],
  ];

  test('0 failures over 9 themes × A1–A10 (A11 gold ornament is decoration only)', () => {
    const fails = [];
    for (const [p, a] of PAIRS) {
      const th = buildTheme(p, a);
      const T = { p: th.primary, a: th.accent };
      for (const [id, f, min] of A) {
        const v = f(T);
        if (!(v >= min)) fails.push(`${p}/${a} ${id}: ${v.toFixed(2)} < ${min}`);
      }
    }
    assert.deepEqual(fails, []);
  });

  test('fixed neutrals: ink, ink-2, ink-3 ≥ 4.5:1 on paper and ivory; field boundary ≥ 3:1; status words ≥ 4.5:1 on ivory; tokens match app.css', () => {
    for (const [fg, bg, min] of [[NEU.ink, NEU.paper, 4.5], [NEU.ink2, NEU.paper, 4.5], [NEU.ink2, NEU.paper2, 4.5], [NEU.ink3, NEU.paper, 4.5], [NEU.ink3, NEU.paper2, 4.5], [NEU.field, NEU.paper, 3], ['#1d6b3a', NEU.paper2, 4.5], ['#8a5300', NEU.paper2, 4.5], ['#a8261b', NEU.paper2, 4.5], ['#1b5a99', NEU.paper2, 4.5]]) {
      assert.ok(contrast(fg, bg) >= min, `${fg} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
    }
    const app = stripComments(css('app.css'));
    for (const [k, v] of [['--paper-2', NEU.paper2], ['--paper-3', NEU.paper3], ['--ink-2', NEU.ink2], ['--ink-3', NEU.ink3], ['--field', NEU.field]]) assert.match(app, new RegExp(`${k}: ${v};`, 'i'), k);
  });
});

// ───────────────────────── مراجعة المسار (review): انحدارات وجدها المراجع على الشاشات العميقة ─────────────────────────
describe('v12 look — review regressions (A02/A04/A06/A17/A19/A20/A21, K12-21/29/P4/P8)', () => {
  const R = (file) => cssRules(css(file));
  const one = (file, sel) => {
    const r = R(file).filter((x) => x.sel === sel);
    assert.ok(r.length, `${file}: ${sel}`);
    return r.map((x) => x.body).join(';');
  };

  test('R1 K12-21: the paid .pub-btn reset never reaches the header CTA (38 px; line button on /services)', () => {
    const pub = R('public-site.css');
    assert.ok(pub.some((r) => r.sel === 'body.pub[data-side="paid"] .pub-btn:where(:not(.pub-nav-cta))' && /min-height: 48px/.test(r.body)));
    assert.ok(!pub.some((r) => r.sel === 'body.pub[data-side="paid"] .pub-btn'), 'an unscoped paid .pub-btn reset (same specificity as the CTA) overrides the critical header button');
    assert.match(critical(''), /body\.pub-landing\[data-side="paid"\] \.pub-nav-cta\{[^}]*box-shadow:inset 0 0 0 1px var\(--ink\)/);
    assert.match(critical(''), /body\.pub\[data-side="paid"\] \.pub-nav-cta\{[^}]*min-height:38px/);
  });

  test('R2 P8: the staff chat thread has no WhatsApp dot wash, no bubble shadow and 2-px corners', () => {
    const chat = one('app.css', '.chat');
    assert.doesNotMatch(chat, /gradient\(|#efeae2/);
    const bubble = one('app.css', '.msg-bubble');
    assert.doesNotMatch(bubble, /box-shadow/);
    assert.match(bubble, /border-radius: var\(--r-1\)/);
    assert.doesNotMatch(one('app.css', '.chat-day span'), /box-shadow|background/);
    assert.doesNotMatch(one('app.css', '.msg-auto .msg-bubble'), /accent|box-shadow/);
  });

  test('R3 A19/A20: no initials-in-pastel avatars and no AI sparkles on screen (/app and /company)', () => {
    const r = cssRules(css('v12-look.css')).find((x) => x.sel === '.avatar, .icon-sparkle');
    assert.ok(r && /display: none/.test(r.body) && r.at.includes('@media screen'));
  });

  test('R4 A04/K12-37: no tinted icon tiles in front of rows (dashboard, request, knowledge, queue, account, notifications, simulator)', () => {
    for (const [f, s] of [['pages-a.css', '.pa-missing-icon'], ['pages-a.css', '.pa-dlist-icon'], ['pages-a.css', '.pa-qempty-icon'], ['pages-a.css', '.pa-preset-icon'], ['pages-d.css', '.pd-step-icon'], ['v9-accounts.css', '.acc-session-icon'], ['app.css', '.notif-icon'], ['app.css', '.tl-dot > svg']]) {
      assert.match(one(f, s), /display: none/, `${f} ${s}`);
    }
    assert.doesNotMatch(one('app.css', '.tl-dot'), /--tone-bg|box-shadow/);
  });

  test('R5 A06/A21/A05: counts, channels and step numbers are words or figures, never tinted pills or circles', () => {
    for (const [f, s] of [['pages-a.css', '.pa-dlist-n'], ['pages-a.css', '.pa-dlist-row.is-pending .pa-dlist-n'], ['v10-desk.css', '.cq-group-count'], ['pages-b.css', '.pb-issue-num'], ['pages-d.css', '.pd-step-num'], ['app.css', '.chan-tag'], ['app.css', '.auto-tag'], ['pages-a.css', '.pa-chan'], ['v91-lawyer-work.css', '.lw-savechip'], ['app.css', '.seg[aria-pressed="true"] .tab-count']]) {
      const b = one(f, s);
      assert.doesNotMatch(b, /background|border-radius: (50%|999px)/, `${f} ${s}`);
    }
    for (const s of ['.chan-whatsapp', '.chan-website, .chan-portal']) assert.ok(!R('app.css').some((r) => r.sel === s), `${s} tinted chip rule is gone`);
    assert.match(one('pages-a.css', '.pa-qnav-item'), /border-radius: var\(--r-1\)/);
    assert.doesNotMatch(R('pages-a.css').filter((r) => r.sel === '.pa-qnav-item.is-pending').map((r) => r.body).join(''), /warning-100/);
  });

  test('R6 K12-04: fields with an action or an addon keep the 2-px corner (password fields on both sign-in pages)', () => {
    for (const s of ['.input-group-action .input', 'html[dir="rtl"] .input-group-action .input[dir="ltr"]', 'html[dir="rtl"] .input-group .input[dir="ltr"]', '.input-addon']) {
      assert.doesNotMatch(one('app.css', s), /9px/, s);
    }
  });

  test('R7 K12-P4: gold is never text in the staff layer or the paid intake (demo panel, accent badges, date columns, scan tip)', () => {
    for (const s of ['.demo-panel h2', '.demo-panel > p', '.badge-accent', '.tone-accent', '.event-date']) assert.doesNotMatch(one('app.css', s), /accent-[5-9]00|gold-ink/, s);
    assert.doesNotMatch(one('pages-a.css', '.pa-event-date'), /accent/);
    for (const s of ['.lc-ev.is-pending .event-date', '.lc-ev.is-past .event-date']) assert.doesNotMatch(one('v91-l-court.css', s), /background/);
    const paid = cssRules(css('v91-b-forms.css')).find((r) => r.sel === 'body[data-side="paid"]' && /--bmf-gold-soft/.test(r.body));
    assert.match(paid.body, /--bmf-gold: var\(--act\)/);
    assert.match(paid.body, /--bmf-gold-ink: var\(--ink\)/);
  });

  test('R8 K12-29: notices are ivory with a 2-px start rule (request notes, overdue sessions, required attendance); danger buttons are outlines', () => {
    for (const [f, s] of [['pages-a.css', '.pa-note.is-info, .pa-note.is-warning'], ['v9-practice.css', '.v9p-overdue'], ['app.css', '.event-item.is-required']]) {
      const b = one(f, s);
      assert.match(b, /border-inline-start: 2px solid/, s);
      assert.match(b, /var\(--paper-2\)/, s);
      assert.doesNotMatch(b, /(info|warning|danger|accent)-(50|100)/, s);
    }
    assert.match(one('v11-ui.css', '.btn-danger'), /background: none; color: var\(--bad\); border-color: var\(--bad\)/);
  });

  test('R9 P8/A17: no gradient panels (company sign-in, impact report, brand preview); dashboard figures, alerts and events are ruled rows', () => {
    assert.doesNotMatch(one('v10-company-pages.css', '.co-auth-panel'), /gradient\(/);
    assert.doesNotMatch(one('v9-practice.css', '.v9p-report-head'), /gradient\(/);
    assert.doesNotMatch(one('v9-practice.css', '.v9p-value-totals .is-main'), /success-100/);
    assert.doesNotMatch(one('pages-d.css', '.brp-side'), /gradient\(/);
    for (const s of ['.pa-mini-stats > div', '.pa-month > div', '.pa-alert-link', '.pa-event']) {
      const b = one('pages-a.css', s);
      assert.match(b, /border-top: 1px solid var\(--rule\)/, s);
      assert.doesNotMatch(b, /background|border-radius/, s);
    }
  });

  test('R10 P8: the lawyer writing toolbar has no elevation shadow; its tools and team rows keep 2-px corners', () => {
    assert.doesNotMatch(stripComments(css('v91-lawyer-work.css')), /\.lw-write \.lw-write-toolbar \{\s*box-shadow/);
    for (const s of ['.lw-tool', '.lw-ref-tab', '.lw-team-item, .lw-version, .lw-versions']) assert.match(one('v91-lawyer-work.css', s), /border-radius: var\(--r-1\)/, s);
  });

  test('R2 contrast: the outgoing bubble time (gray-600) on primary-50 ≥ 4.5:1 for the default and 8 hostile brand pairs', () => {
    const gray600 = (/--gray-600:\s*(#[0-9a-f]{6})/i.exec(css('app.css')) || [])[1];
    assert.ok(gray600);
    for (const [p, a] of [['#0b3d29', '#cca454'], ['#0b5a3c', '#c9a14a'], ['#f2e600', '#00e5ff'], ['#d0021b', '#1f4fff'], ['#000000', '#ffffff'], ['#ffffff', '#000000'], ['#6a1b9a', '#d4af37'], ['#00897b', '#ff7043'], ['#ff4fa3', '#b6ff00']]) {
      const v = contrast(gray600, buildTheme(p, a).primary[50]);
      assert.ok(v >= 4.5, `${p}/${a}: ${v.toFixed(2)}`);
    }
  });
});
