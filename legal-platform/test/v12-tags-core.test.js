// v12 tags-core (TG-0، TG-2؛ spec §11.2): رموز العناصر — h() وtagged()، جدولا البادئات، الدفتر بنطاقات §5.9،
// الماسح، التحقق (الصيغة T12-70، التفرّد T12-71، المكان T12-72) على المصدر الحي، السجل وTAGS.md (L12-82)، وأداة scripts/tags.js.
// التغطية هنا للتقرير فقط؛ يفرضها مسار tags في test/v12-tags.test.js (TG-7، TAGS_ENFORCE).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { h, tagged } from '../public/assets/js/lib/h.js';
import * as PUBLIC from '../public/assets/js/lib/tags-pages.js';
import * as APPT from '../public/assets/js/lib/tags-pages-app.js';
import { CODE_PREFIX, AREA_CODES } from '../src/constants.js';
import { RESERVED_PREFIXES } from '../src/services/companies.js';
import { scanSources, scanFile, autotagSource, coverageReport, builderCalls } from '../src/tags/scan.js';
import {
  FILES, LANE_FILES, PLANNED_FILES, SHARED_TEXT, SETTINGS_SOURCES, validate, loadLedger, nextFree, planAssignments, buildRegistry, renderMarkdown, stripLines,
  loadModuleData, reservationOf, countAr, AR, updateLedger, freezeLedger, ledgerText,
} from '../src/tags/registry.js';
import { startTestApp } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EXTRA_FORBIDDEN = [...Object.values(CODE_PREFIX), ...AREA_CODES, ...RESERVED_PREFIXES];
const CLI = path.join(ROOT, 'scripts/tags.js');
const cli = (args, opts = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], { cwd: ROOT, encoding: 'utf8', ...opts });

// ───────────── DOM صغير بما يكفي لـ h() ─────────────
class FakeNode {}
class FakeText extends FakeNode {
  constructor(t) {
    super();
    this.textContent = String(t);
  }
}
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.attrs = {};
    this.children = [];
    this.style = { setProperty() {} };
    this.dataset = {};
    const cls = new Set();
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), contains: (c) => cls.has(c) };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return k in this.attrs ? this.attrs[k] : null;
  }
  hasAttribute(k) {
    return k in this.attrs;
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  addEventListener() {}
}
function withDom(fn) {
  const saved = { document: globalThis.document, Node: globalThis.Node };
  globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), createDocumentFragment: () => new FakeEl('#f') };
  globalThis.Node = FakeNode;
  try {
    return fn();
  } finally {
    globalThis.document = saved.document;
    globalThis.Node = saved.Node;
  }
}

describe('v12 tags-core — TG-0 h() tag prop and tagged() (T12-15, T12-82)', () => {
  test('tag → data-tag; null/undefined/false/empty → no attribute and never a literal «tag» attribute; tagged() sets the code and returns the same node', () => {
    withDom(() => {
      const a = h('h2.section-title', { tag: 'CSF-12' }, 'المستندات');
      assert.equal(a.getAttribute('data-tag'), 'CSF-12');
      assert.equal(a.hasAttribute('tag'), false);
      for (const v of [null, undefined, false, '']) {
        const el = h('button', { tag: v, type: 'button' }, 'حفظ');
        assert.equal(el.hasAttribute('data-tag'), false, String(v));
        assert.equal(el.hasAttribute('tag'), false, String(v));
        assert.equal(el.getAttribute('type'), 'button');
      }
      // 'data-tag' مباشرة كان يعمل قبل TG-0 ويبقى
      assert.equal(h('a', { href: '/', 'data-tag': 'H-01' }).getAttribute('data-tag'), 'H-01');
      const node = h('section', null, 'x');
      assert.equal(tagged('CSF-13', node), node);
      assert.equal(node.getAttribute('data-tag'), 'CSF-13');
      assert.equal(tagged(null, node).getAttribute('data-tag'), 'CSF-13', 'no code: unchanged');
      const plain = { notAnElement: true };
      assert.equal(tagged('X-01', plain), plain, 'a non-element is returned untouched');
      assert.equal(tagged('X-01', null), null);
    });
    const src = read('public/assets/js/lib/h.js');
    assert.match(src, /export function tagged\(code, node\)/);
  });
});

describe('v12 tags-core — prefix tables and normalizeCode (T12-01…T12-04, T12-13, L12-43)', () => {
  test('normalizeCode accepts the owner\'s spellings (T12-02) and rejects what is not a whole code', () => {
    const ok = { s14: 'S-14', 'S 14': 'S-14', 'S-١٤': 'S-14', s4: 'S-04', 'S 014': 'S-14', 'inb-٠٤': 'INB-04', 'S_14': 'S-14', 'S.14': 'S-14', 'S–14': 'S-14', '  s - 14 ': 'S-14', '‏S-14‏': 'S-14', 'csf-104': 'CSF-104', 'W۰۳': 'W-03' };
    for (const [input, want] of Object.entries(ok)) assert.equal(PUBLIC.normalizeCode(input), want, input);
    for (const bad of ['S-0', 'xx', '', null, undefined, 'S-1000', 'س١٤', 'S-', 'ABCD-01', '14']) assert.equal(PUBLIC.normalizeCode(bad), null, String(bad));
    assert.deepEqual(PUBLIC.partialCode('inb0'), { prefix: 'INB', digits: '0' });
    assert.deepEqual(PUBLIC.partialCode('s'), { prefix: 'S', digits: '' });
    assert.equal(PUBLIC.partialCode('صندوق'), null);
    assert.deepEqual(['S-10', 'S-9', 'I-80', 'S-100'].sort(PUBLIC.compareCodes), ['I-80', 'S-9', 'S-10', 'S-100']);
    assert.equal(PUBLIC.prefixOf('INB-04'), 'INB');
    for (const c of ['S-14', 'INB-04', 'CSF-104', 'W-01']) assert.ok(PUBLIC.CODE_RE.test(c), c);
    for (const c of ['S-00', 'S-4', 'S-0123', 'S-1000', 'ABCD-01', 's-14', 'REQ-2026-00024']) assert.equal(PUBLIC.CODE_RE.test(c), false, c);
    assert.ok(PUBLIC.PLACEHOLDER_RE.test('INB-00'));
    assert.equal(APPT.normalizeCode, PUBLIC.normalizeCode, 'one shared normalizeCode');
  });

  test('tags-pages.js: public prefixes only, no file path, no import; the app table adds staff/company/message prefixes; every prefix valid and allowed', async () => {
    const src = read('public/assets/js/lib/tags-pages.js');
    assert.doesNotMatch(src, /\b(?:src|public|scripts|test|assets)\//, 'no repository path');
    assert.doesNotMatch(src, /\b[\w-]+\.(?:js|mjs|html|json|css)\b/, 'no file name');
    assert.doesNotMatch(src, /^\s*import\b|\bimport\(/m, 'no import');
    const pub = Object.keys(PUBLIC.PAGES);
    const app = Object.keys(APPT.APP_PAGES);
    for (const p of app) {
      assert.equal(pub.includes(p), false, `${p} is not public`);
      assert.doesNotMatch(src, new RegExp(`\\b${p}\\s*:`), `${p} must not appear in the public table`);
    }
    for (const p of ['NAV', 'INB', 'CSF', 'SET', 'PTH', 'CQ', 'CU', 'W', 'E', 'D', 'B', 'TGS']) assert.ok(app.includes(p), p);
    for (const p of ['L', 'T', 'S', 'H', 'F', 'I', 'IC', 'P', 'PL', 'UP', 'SC', 'KH', 'PV', 'DD']) assert.ok(pub.includes(p), p);
    const appSrc = read('public/assets/js/lib/tags-pages-app.js');
    assert.deepEqual([...appSrc.matchAll(/['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]), ['./tags-pages.js', './tags-pages.js'], 'only the module specifier');
    assert.doesNotMatch(appSrc, /\b(?:src|public|scripts)\//);
    assert.deepEqual(Object.keys(APPT.PAGES), [...pub, ...app], 'merged table = public then app');
    const forbidden = new Set([...PUBLIC.FORBIDDEN_PREFIXES, ...EXTRA_FORBIDDEN]);
    for (const [p, pg] of Object.entries(APPT.PAGES)) {
      assert.match(p, /^[A-Z]{1,3}$/, p);
      assert.equal(forbidden.has(p), false, `${p} is a record/area prefix (T12-04)`);
      assert.ok(PUBLIC.SURFACES[pg.surface], `${p} surface`);
      assert.match(pg.name, /[؀-ۿ]/, `${p} Arabic name`);
      assert.doesNotMatch(pg.name, /[—–]|عميل|عملاء/, `${p} name: no dash cadence, no «عميل»`);
      assert.equal(typeof pg.url, 'string');
    }
    for (const p of [...Object.values(CODE_PREFIX), 'RCPT', ...AREA_CODES]) assert.ok(PUBLIC.FORBIDDEN_PREFIXES.includes(p), `${p} listed as forbidden`);
    // no public page or public module loads the app table or the server registry
    const offenders = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'public')).filter((x) => x.endsWith('.html'))) if (/tags-pages-app|src\/tags/.test(read(`public/${f}`))) offenders.push(f);
    for (const f of fs.readdirSync(path.join(ROOT, 'public/assets/js/public')).filter((x) => x.endsWith('.js'))) if (/tags-pages-app|src\/tags|tags\/registry/.test(read(`public/assets/js/public/${f}`))) offenders.push(f);
    assert.deepEqual(offenders, []);
    // as served to a browser
    const t = await startTestApp();
    try {
      const r = await fetch(`${t.base}/assets/js/lib/tags-pages.js`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type') || '', /javascript/);
      const body = await r.text();
      assert.doesNotMatch(body, /\b(?:src|scripts)\/|registry/);
      for (const p of ['INB', 'CSF', 'NAV', 'PTH']) assert.doesNotMatch(body, new RegExp(`\\b${p}:`), p);
    } finally {
      await t.close();
    }
  });
});

describe('v12 tags-core — ledger reservations of spec §5.9', () => {
  const EXPECTED = {
    T: [[1, 83, 'entry']], L: [[1, 11, 'entry']], KH: [[1, 4, 'entry'], [5, 99, '12.1']], H: [[1, 11, 'entry']], F: [[1, 16, 'entry'], [20, 20, 'entry']],
    S: [[10, 16, 'entry'], [20, 23, 'entry'], [30, 37, 'entry'], [40, 44, 'entry'], [45, 47, 'entry'], [50, 55, 'entry'], [60, 62, 'entry'], [65, 69, 'entry']],
    I: [[1, 4, 'entry'], [11, 25, 'entry'], [30, 34, 'entry'], [40, 43, 'entry'], [50, 58, 'entry'], [60, 68, 'entry'], [80, 149, 'entry']],
    IC: [[1, 16, 'entry']], W: [[1, 6, 'staff-lines']], INB: [[1, 8, 'staff-lines']], PTH: [[1, 15, 'staff-lines']], DSH: [[1, 4, 'staff-lines']],
    ANL: [[1, 6, 'staff-lines']], SIM: [[1, 4, 'staff-lines']], SET: [[1, 19, 'staff-lines'], [20, 39, 'media']], SC: [[1, 20, 'media']], UP: [[1, 10, 'media']],
    P: [[1, 9, 'media']], CK: [[1, 5, 'media']], DOC: [[1, 17, 'media']], VTR: [[1, 10, 'media']], INT: [[1, 17, 'media']], SYS: [[1, 10, 'media']],
    SRC: [[1, 4, 'media']], KIT: [[1, 5, 'media']], PV: [[1, 4, 'media']], DD: [[1, 1, 'media']],
  };

  test('ledger.json holds exactly the reservations, next = end + 1, unfrozen; the tool never hands out a reserved number', () => {
    const ledger = loadLedger(ROOT);
    assert.equal(ledger.version, 1);
    const got = Object.fromEntries(Object.entries(ledger.prefixes).filter(([, e]) => e.reserved?.length).map(([p, e]) => [p, e.reserved.map((r) => [r.from, r.to, r.lane])]));
    assert.deepEqual(got, EXPECTED);
    const empty = { root: ROOT, defs: [], placeholders: [] };
    for (const [p, ranges] of Object.entries(EXPECTED)) {
      assert.ok(APPT.PAGES[p], `${p} is a known prefix`);
      assert.equal(ledger.prefixes[p].next, Math.max(...ranges.map((r) => r[1])) + 1, `${p}.next`);
      const n = nextFree(p, empty, ledger);
      assert.equal(reservationOf(ledger, p, n), null, `${p}-${n} is outside every reservation`);
      for (const [, , lane] of ranges) assert.ok(lane === '12.1' || LANE_FILES[lane], `${p}: lane ${lane}`);
    }
    // S-01…S-09 are not reserved, but the tool still numbers after the hero block (next = 70)
    assert.equal(nextFree('S', empty, ledger), 70);
    assert.equal(nextFree('INB', empty, ledger), 9);
    assert.equal(nextFree('CSF', empty, ledger), 1, 'unreserved prefix starts at 01');
    if (!ledger.frozen) assert.equal(ledger.frozen, false);
  });

  test('every code the lanes define inside a reserved range lives in the reserving lane\'s files (live source)', () => {
    const scan = scanSources({ root: ROOT });
    const ledger = loadLedger(ROOT);
    const bad = [];
    for (const d of scan.defs) {
      const res = reservationOf(ledger, d.prefix, d.num);
      if (res && !(LANE_FILES[res.lane] || []).includes(d.file)) bad.push(`${d.code} ${d.file}:${d.line} (reserved for ${res.lane})`);
    }
    assert.deepEqual(bad, []);
  });
});

describe('v12 tags-core — scanner and validation (T12-50…T12-55, T12-70…T12-72)', () => {
  test('format, prefix, uniqueness and placement hold on the live source (enforced from TG-0)', () => {
    const scan = scanSources({ root: ROOT });
    const v = validate(scan, { ledger: loadLedger(ROOT), extraForbidden: EXTRA_FORBIDDEN, root: ROOT });
    for (const w of v.warnings) process.stdout.write(`# tags warning: ${w}\n`);
    assert.deepEqual(v.errors, [], v.errors.join('\n'));
    // FILES covers exactly the prefix table; every non-planned listed file exists
    assert.deepEqual(Object.keys(FILES).sort(), Object.keys(APPT.PAGES).sort());
    const missing = Object.values(FILES).flat().filter((f) => !PLANNED_FILES.has(f) && !fs.existsSync(path.join(ROOT, f)));
    if (missing.length) process.stdout.write(`# tags: listed files missing (report only until the freeze): ${[...new Set(missing)].join(', ')}\n`);
    // nothing under src/tags or scripts is scanned as a definition (they hold example codes)
    assert.equal(scan.files.some((f) => f.startsWith('src/tags/') || f.startsWith('scripts/') || f.startsWith('test/')), false);
  });

  test('every definition form is found with kind, text and line; comments, regex literals and CSS selectors are not definitions; non-literals are uses', () => {
    const js = [
      "import { h, tagged } from '../../lib/h.js';", // 1
      "// tag: 'INB-77' in a comment", // 2
      "const re = /tag: 'INB-78'/g;", // 3
      "const NAV = [{ label: 'صندوق الوارد', tag: 'INB-01' }];", // 4
      "export const TEXT_TAGS = Object.freeze({ lines_menu: 'W-01', 'rule:x': 'W-02' });", // 5
      "export const QUESTION_TAGS = deepFreeze({ 'case.next': 'I-22' });", // 6
      "const html = `<section class=\"x\"><h2 data-tag=\"INB-02\">كل الأنواع ${n}</h2></section>`;", // 7
      "h('h1.page', { tag: 'INB-03' }, 'صندوق الوارد');", // 8
      "h('button', { 'data-tag': 'INB-04' }, 'تأكيد');", // 9
      "tagged('INB-05', section('مقترح'));", // 10
      "const q = { q: 'ما وضع القضية؟', qtag: 'T-41' };", // 11
      "h('a', { tag: n.tag }, 'x'); document.querySelector('[data-tag=\"INB-06\"]');", // 12
      "button('حفظ', { tag: 'INB-00' });", // 13
      '/* tags:variant */ h(\'h1\', { tag: \'INB-03\' }, \'الوارد\');', // 14
    ].join('\n');
    const r = scanFile('public/assets/js/app/pages/admin/inbox.js', js);
    const by = Object.fromEntries(r.defs.filter((d) => !d.variant).map((d) => [d.code, d]));
    assert.deepEqual(Object.keys(by).sort(), ['I-22', 'INB-00', 'INB-01', 'INB-02', 'INB-03', 'INB-04', 'INB-05', 'T-41', 'W-01', 'W-02'].sort());
    assert.equal(by['INB-01'].line, 4);
    assert.equal(by['INB-01'].text, 'صندوق الوارد');
    assert.equal(by['INB-02'].kind, 'عنوان');
    assert.equal(by['INB-02'].text, 'كل الأنواع …');
    assert.equal(by['INB-03'].kind, 'عنوان');
    assert.equal(by['INB-04'].kind, 'زر');
    assert.equal(by['INB-04'].text, 'تأكيد');
    assert.equal(by['INB-05'].kind, 'قسم/بطاقة');
    assert.equal(by['INB-05'].text, 'مقترح');
    assert.equal(by['T-41'].kind, 'سؤال');
    assert.equal(by['T-41'].text, 'ما وضع القضية؟');
    assert.equal(by['W-01'].kind, 'رسالة واتساب');
    assert.equal(by['W-02'].key, 'rule:x');
    assert.equal(by['I-22'].key, 'case.next');
    assert.equal(by['INB-00'].placeholder, true);
    assert.equal(r.defs.filter((d) => d.code === 'INB-03' && d.variant).length, 1, 'tags:variant marks the second form');
    assert.ok(r.uses.some((u) => u.expr === 'n.tag'));
    assert.ok(r.uses.some((u) => u.expr === 'INB-06'), 'a [data-tag="…"] selector is a use');
    const html = '<!-- <a data-tag="S-99">old</a> -->\n<section id="how" data-tag="S-20">\n  <h2 data-tag="S-21">كيف نعمل؟</h2>\n</section>\n<a class="x" href="/" aria-label="الصفحة الأولى" data-tag="H-01"><img alt=""></a>';
    const hr = scanFile('public/services.html', html);
    assert.deepEqual(hr.defs.map((d) => [d.code, d.line, d.kind, d.text]), [['S-20', 2, 'قسم/بطاقة', 'كيف نعمل؟'], ['S-21', 3, 'عنوان', 'كيف نعمل؟'], ['H-01', 5, 'رابط', 'الصفحة الأولى']]);
  });

  test('validate names each problem: bad format, unknown and forbidden prefixes, duplicates with both locations, wrong file, another lane\'s or 12.1\'s reserved range, retired reuse, placeholder after the freeze', () => {
    const files = {
      'public/assets/js/app/pages/admin/inbox.js': "h('a', { tag: 'INB-1' });\nh('a', { tag: 'ZZQ-01' });\nh('a', { tag: 'REQ-12' });\nh('a', { tag: 'INB-40' });\nh('b', { tag: 'INB-40' });\nh('a', { tag: 'CSF-02' });\nh('a', { tag: 'INB-41' });\nh('a', { tag: 'INB-00' });",
      'public/assets/js/app/components/site-settings.js': "h('a', { tag: 'SET-25' });",
      'public/khayri-paused.html': '<a data-tag="KH-05">x</a>',
    };
    const scan = scanSources({ root: ROOT, files: Object.keys(files), read: (rel) => files[rel] });
    const ledger = { version: 1, frozen: true, prefixes: { ...loadLedger(ROOT).prefixes, INB: { next: 50, reserved: [{ from: 1, to: 8, lane: 'staff-lines' }], retired: { 41: { in: '12.0.0', was: 'x' } } } } };
    const { errors } = validate(scan, { ledger, extraForbidden: EXTRA_FORBIDDEN, root: ROOT });
    const has = (re) => assert.ok(errors.some((e) => re.test(e)), `${re}\n${errors.join('\n')}`);
    has(/INB-1 .*bad format/);
    has(/ZZQ-01 .*unknown prefix ZZQ/);
    has(/REQ-12 .*forbidden/);
    has(/INB-40 defined twice: public\/assets\/js\/app\/pages\/admin\/inbox\.js:4 and public\/assets\/js\/app\/pages\/admin\/inbox\.js:5/);
    has(/CSF-02 .*may not define CSF codes/);
    has(/SET-25 .*reserved for the media lane/);
    has(/KH-05 .*reserved for the 12\.1 lane/);
    has(/INB-41 .*retired code reused/);
    has(/INB-00 .*placeholder after the freeze/);
  });
});

describe('v12 tags-core — registry, TAGS.md and numbering (TG-2, T12-56…T12-61, L12-82)', () => {
  test('«يظهر النص نفسه أيضًا في» groups S-14 with T-53, W-01\'s third button, I-57\'s third chip and PTH-01; settings-sourced text says where to edit it; output is deterministic', async () => {
    const md = await loadModuleData(ROOT);
    assert.deepEqual(md.errors, []);
    assert.equal(md.lines.company?.label, 'تأسيس شركات', 'LINES from entry-tree.js');
    const real = scanSources({ root: ROOT });
    const extra = scanFile('src/site.js', 'const a = `<a class="svc" href="/start/company" data-tag="S-14"><span class="svc__t">${LINES.company.label}</span></a>`;\nconst c = `<p class="pub-legal" data-tag="F-20">© ${y}</p>`;');
    const scan = { ...real, defs: [...real.defs.filter((d) => d.code !== 'S-14' && d.code !== 'F-20'), ...extra.defs] };
    const reg = buildRegistry(scan, { ledger: loadLedger(ROOT), moduleData: md, version: '12.0.0' });
    const s14 = reg.items.find((x) => x.code === 'S-14');
    assert.deepEqual(s14.shared, [{ code: 'T-53', where: '' }, { code: 'W-01', where: 'الزر الثالث' }, { code: 'I-57', where: 'الخيار الثالث' }, { code: 'PTH-01', where: '' }]);
    assert.equal(s14.sharedText, 'LINES.company «تأسيس شركات»');
    const t53 = reg.items.find((x) => x.code === 'T-53');
    assert.equal(t53.text, 'تأسيس شركات');
    assert.ok(t53.shared.some((s) => s.code === 'S-14'));
    assert.equal(SHARED_TEXT.length, 3);
    const text = renderMarkdown(reg);
    assert.match(text, /\| S-14 \| رابط \| [^|]*<br>يظهر النص نفسه أيضًا في: T-53، W-01 \(الزر الثالث\)، I-57 \(الخيار الثالث\)، PTH-01 \| src\/site\.js:1 \|/);
    assert.match(text, /\| F-20 \| [^|]* \| [^|]*<br>يُعدَّل من الإعدادات ← الصفحة الأولى ← الاسم القانوني للمكتب \| src\/site\.js:2 \|/);
    assert.ok(SETTINGS_SOURCES['W-01']);
    assert.match(text, /^# رموز العناصر/);
    assert.match(text, /\| T-01…T-83 \| entry \|/, 'reserved ranges listed');
    assert.equal(renderMarkdown(buildRegistry(scan, { ledger: loadLedger(ROOT), moduleData: md, version: '12.0.0' })), text, 'deterministic');
    assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T/, 'no timestamp');
    assert.equal(stripLines('| x | y | src/site.js:120 · public/a.html:3 |'), '| x | y | src/site.js · public/a.html |');
    // I-codes from entry-tree.js maps carry their screen words
    assert.equal(reg.items.find((x) => x.code === 'I-22')?.text, 'هل هناك جلسة أو موعد قريب؟');
    // Arabic number agreement in the header
    assert.equal(countAr(1, AR.code), 'رمز واحد');
    assert.equal(countAr(2, AR.screen), 'شاشتان');
    assert.equal(countAr(7, AR.code), '7 رموز');
    assert.equal(countAr(165, AR.code), '165 رمزًا');
    assert.equal(countAr(101, AR.code), '101 رمز');
  });

  test('planAssignments numbers X-00 in file then line order from ledger.next, skipping used, retired and reserved numbers; updateLedger raises next; freeze records the known numbers', () => {
    const files = {
      'public/assets/js/app/pages/admin/inbox.js': "h('a', { tag: 'INB-00' });\nh('a', { tag: 'INB-09' });\nh('a', { tag: 'INB-00' });",
      'public/assets/js/app/pages/admin/case-detail.js': "button('x', { tag: 'CSF-00' });",
    };
    const scan = scanSources({ root: ROOT, files: Object.keys(files), read: (rel) => files[rel] });
    const ledger = { version: 1, frozen: false, prefixes: { INB: { next: 9, reserved: [{ from: 1, to: 8, lane: 'staff-lines', what: '' }], retired: { 10: { in: '12.0.0', was: 'x' } } } } };
    const plan = planAssignments(scan, ledger);
    assert.deepEqual(plan.map((a) => `${a.line}:${a.from}→${a.to}`), ['1:INB-00→INB-11', '3:INB-00→INB-12', '1:CSF-00→CSF-01']);
    const after = { ...scan, defs: [...scan.defs, ...plan.map((a) => ({ code: a.to, prefix: a.prefix, num: String(a.num), file: a.file, line: a.line }))], placeholders: [] };
    const next = updateLedger(ledger, after);
    assert.equal(next.prefixes.INB.next, 13);
    assert.equal(next.prefixes.CSF.next, 2);
    assert.deepEqual(next.prefixes.INB.reserved, ledger.prefixes.INB.reserved, 'reservations kept');
    const frozen = freezeLedger(next, after, '12.0.0');
    assert.equal(frozen.frozen, true);
    assert.equal(frozen.prefixes.INB.known, '9,11-12');
    // after the freeze a vanished code is retired with its last text
    const gone = { ...after, defs: after.defs.filter((d) => d.code !== 'INB-11') };
    const r = updateLedger(frozen, gone, { version: '12.0.1', lastText: (c) => (c === 'INB-11' ? 'زر قديم' : '') });
    assert.deepEqual(r.prefixes.INB.retired['11'], { in: '12.0.1', was: 'زر قديم' });
    assert.match(ledgerText(r), /"frozen": true/);
  });

  test('scripts/tags.js end to end on a copy: next, find (s14 / S-١٤ / words), autotag, assign, --check, freeze', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-tags-'));
    try {
      const put = (rel, text) => {
        fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
        fs.writeFileSync(path.join(tmp, rel), text);
      };
      put('package.json', JSON.stringify({ name: 'x', version: '12.0.0', type: 'module' }));
      put('src/tags/ledger.json', read('src/tags/ledger.json'));
      put('src/constants.js', 'export const TEXT_TAGS = {};\n');
      put('public/assets/js/public/entry-tree.js', read('public/assets/js/public/entry-tree.js'));
      put('public/assets/js/public/topics.js', read('public/assets/js/public/topics.js'));
      const inbox = "import { h } from '../../../lib/h.js';\nimport { emptyState } from '../../../lib/ui.js';\nexport function view() {\n  return [h('h1', { tag: 'INB-01' }, 'صندوق الوارد'), h('h2', 'كل الطلبات'), emptyState('لا طلبات')];\n}\n";
      put('public/assets/js/app/pages/admin/inbox.js', inbox);
      const run = (...args) => cli(['--root', tmp, ...args]);
      let r = run('next', 'inb');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout.trim(), 'INB-09');
      for (const q of ['s14', 'S-١٤', 'S 14']) {
        r = run('find', q);
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /^S-14: /);
        assert.match(r.stdout, /«تأسيس شركات»/);
        assert.match(r.stdout, /T-53، W-01 \(الزر الثالث\)، I-57 \(الخيار الثالث\)، PTH-01/);
      }
      r = run('find', 'T-53');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /public\/assets\/js\/public\/entry-tree\.js:\d+/);
      assert.match(r.stdout, /«تأسيس شركات»/);
      r = run('find', 'تأسيس');
      assert.match(r.stdout, /T-53 /);
      r = run('autotag', 'public/assets/js/app/pages/admin/inbox.js', '--dry');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(fs.readFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), 'utf8'), inbox, '--dry writes nothing');
      r = run('autotag', 'public/assets/js/app/pages/admin/inbox.js');
      assert.equal(r.status, 0, r.stderr);
      const tagged1 = fs.readFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), 'utf8');
      assert.match(tagged1, /import \{ h, tagged \} from '\.\.\/\.\.\/\.\.\/lib\/h\.js';/);
      assert.match(tagged1, /h\('h2', \{ tag: 'INB-00' \}, 'كل الطلبات'\)/);
      assert.match(tagged1, /tagged\('INB-00', emptyState\('لا طلبات'\)\)/);
      r = run('--check');
      assert.equal(r.status, 2, 'placeholders and no TAGS.md yet: stale, not an error');
      r = run('assign');
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const numbered = fs.readFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), 'utf8');
      assert.match(numbered, /h\('h2', \{ tag: 'INB-09' \}/);
      assert.match(numbered, /tagged\('INB-10', emptyState/);
      assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'src/tags/ledger.json'), 'utf8')).prefixes.INB.next, 11);
      const md = fs.readFileSync(path.join(tmp, 'TAGS.md'), 'utf8');
      assert.match(md, /\| INB-09 \| عنوان \| كل الطلبات \| public\/assets\/js\/app\/pages\/admin\/inbox\.js:4 \|/);
      r = run('--check');
      assert.equal(r.status, 0, r.stdout + r.stderr);
      r = run('find', 'inb9');
      assert.match(r.stdout, /INB-09 · عنوان · صندوق الوارد/);
      assert.match(r.stdout, /inbox\.js:4/);
      // a duplicate makes --check fail and assign write nothing
      fs.appendFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), "export const again = () => h('h3', { tag: 'INB-09' }, 'مكرر');\n");
      r = run('--check');
      assert.equal(r.status, 1);
      assert.match(r.stderr, /INB-09 defined twice/);
      fs.writeFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), numbered);
      r = run('freeze');
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, 'src/tags/ledger.json'), 'utf8')).frozen, true);
      fs.appendFileSync(path.join(tmp, 'public/assets/js/app/pages/admin/inbox.js'), "export const late = () => h('h3', { tag: 'INB-00' }, 'جديد');\n");
      r = run('--check');
      assert.equal(r.status, 1, 'a placeholder after the freeze is an error');
      assert.match(r.stderr, /INB-00 \(public\/assets\/js\/app\/pages\/admin\/inbox\.js:\d+\): placeholder after the freeze/);
      r = run('next', 'XYZ');
      assert.equal(r.status, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('live source: `find S-14` prints «تأسيس شركات» (defined → file:line, still reserved → the entry lane); `next INB` is outside the reserved range', () => {
    let r = cli(['find', 'S-14']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /تأسيس شركات/);
    assert.match(r.stdout, /(?:src\/site\.js|public\/services\.html):\d+|محجوز لمسار entry/);
    r = cli(['next', 'INB']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.trim(), /^INB-(?:09|[1-9]\d)$/);
  });
});

describe('v12 tags-core — coverage report (report mode; enforced by the tags lane at TG-7)', () => {
  test('autotag and the coverage report see the key builders; the report never fails here', () => {
    const src = "h('h2', 'a');\nbutton('حفظ', { tag: 'SET-01' });\ntagged('SET-02', section('x'));\n// tags:skip decorative\nh('a', { href: '/' });\nconfirmDialog({ title: 'x' });\nfunction button(label, opts = {}) { return 1; }";
    const calls = builderCalls(src);
    assert.deepEqual(calls.map((c) => [c.name, c.tagged, c.skip]), [['h', false, false], ['button', true, false], ['section', true, false], ['h', false, true], ['confirmDialog', false, false]]);
    const at = autotagSource('public/assets/js/app/components/site-settings.js', src, 'SET');
    assert.match(at.out, /h\('h2', \{ tag: 'SET-00' \}, 'a'\)/);
    assert.match(at.out, /confirmDialog\(\{ title: 'x', tag: 'SET-00' \}\)/);
    assert.match(at.out, /h\('a', \{ href: '\/' \}\)/, 'tags:skip respected');
    const html = autotagSource('public/terms.html', '<p>نص <a href="/x">رابط</a></p>\n<section class="a">\n<h2>الشروط</h2>\n<input type="hidden" name="x">\n<input name="q" />', 'TM');
    assert.match(html.out, /<section class="a" data-tag="TM-00">/);
    assert.match(html.out, /<h2 data-tag="TM-00">/);
    assert.match(html.out, /<input name="q" data-tag="TM-00" \/>/);
    assert.match(html.out, /<a href="\/x">رابط<\/a>/, 'inline link inside <p> untouched');
    assert.match(html.out, /<input type="hidden" name="x">/);
    const report = coverageReport({ root: ROOT });
    assert.ok(report.total > 1000, `${report.total} key elements found`);
    process.stdout.write(`# tags coverage (report only): ${report.tagged}/${report.total} key elements tagged; most untagged: ${report.rows.slice(0, 5).map((r) => `${r.file} ${r.untagged}`).join(', ')}\n`);
  });
});
