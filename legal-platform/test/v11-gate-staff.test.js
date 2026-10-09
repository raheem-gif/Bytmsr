// v11 integration gate — staff fixer: regression tests for the staff-area findings
// (K1/J-07/R-06 status tones, V4 focus ring, J-02 source card, J-04/K13 drafts per tone, J-12 inbox/request header,
// J-13/V13 client noun, J-15 company lead, J-20/K13 prefill + unknown line, J-22 override note, K9 rate label,
// R-07 priority labels, V9 table, V15 contrast, K13(d) portal header contact).
// بلا متصفح: DOM مصغّر (نسخة من v11-segment-staff)، فحص ثابت للمصادر، وتكامل HTTP على بيانات العرض.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { LABELS } from '../src/constants.js';
import { setMeta } from '../public/assets/js/lib/fmt.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const APP = 'public/assets/js/app/';
const CSS = 'public/assets/css/';

// ───────────────────────── DOM مصغّر (يكفي h() وui.js للمكوّنات) ─────────────────────────
function installDom() {
  class FakeNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get isConnected() {
      let n = this;
      while (n) {
        if (n === globalThis.document.body) return true;
        n = n.parentNode;
      }
      return false;
    }
    appendChild(c) {
      if (c.tagName === '#FRAGMENT') {
        for (const x of [...c.childNodes]) this.appendChild(x);
        return c;
      }
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    }
    append(...cs) {
      for (const c of cs) this.appendChild(typeof c === 'string' ? globalThis.document.createTextNode(c) : c);
    }
    prepend(...cs) {
      const nodes = cs.map((c) => (typeof c === 'string' ? globalThis.document.createTextNode(c) : c));
      for (const n of nodes) if (n.parentNode) n.parentNode.removeChild(n);
      for (const n of nodes) n.parentNode = this;
      this.childNodes = [...nodes, ...this.childNodes];
    }
    after(...cs) {
      const p = this.parentNode;
      if (!p) return;
      const i = p.childNodes.indexOf(this);
      const nodes = cs.map((c) => (typeof c === 'string' ? globalThis.document.createTextNode(c) : c));
      for (const n of nodes) {
        if (n.parentNode) n.parentNode.removeChild(n);
        n.parentNode = p;
      }
      p.childNodes.splice(i + 1, 0, ...nodes);
    }
    replaceWith(n) {
      const p = this.parentNode;
      if (!p) return;
      p.childNodes[p.childNodes.indexOf(this)] = n;
      n.parentNode = p;
      this.parentNode = null;
    }
    removeChild(c) {
      this.childNodes = this.childNodes.filter((x) => x !== c);
      c.parentNode = null;
      return c;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(globalThis.document.createTextNode(v));
    }
  }
  class FakeText extends FakeNode {
    constructor(t) {
      super();
      this.data = String(t);
      this.tagName = '#TEXT';
    }
    get textContent() {
      return this.data;
    }
  }
  const parseSel = (sel) =>
    sel
      .split(',')
      .map((s) => s.trim().replace(/:not\([^)]*\)/g, '').replace(/:[\w-]+(\([^)]*\))?/g, ''))
      .filter(Boolean)
      .map((s) => {
        const tag = (/^[a-z]+/i.exec(s) || [''])[0];
        const classes = [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
        const attrs = [...s.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].map((m) => [m[1], m[2]]);
        return { tag, classes, attrs };
      });
  class FakeEl extends FakeNode {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName)) this.value = '';
      this.attrs = {};
      this.listeners = {};
      this.dataset = {};
      this.style = { setProperty() {} };
      const set = new Set();
      this.classList = {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        contains: (c) => set.has(c),
        toggle: (c, f) => ((f ?? !set.has(c)) ? set.add(c) : set.delete(c)),
        values: () => [...set],
      };
    }
    get children() {
      return this.childNodes.filter((c) => c instanceof FakeEl);
    }
    get className() {
      return this.classList.values().join(' ');
    }
    set className(v) {
      for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = v;
    }
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    }
    hasAttribute(k) {
      return k in this.attrs;
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }
    dispatch(type, extra = {}) {
      const ev = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const fn of this.listeners[type] || []) fn(ev);
      return ev;
    }
    click() {
      if (this.tagName === 'INPUT' && (this.type === 'radio' || this.type === 'checkbox')) {
        this.checked = this.type === 'radio' ? true : !this.checked;
        this.dispatch('change');
      }
      return this.dispatch('click');
    }
    focus() {}
    blur() {}
    scrollIntoView() {}
    get type() {
      return this.attrs.type || '';
    }
    all() {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
    matchesOne(sel) {
      return parseSel(sel).some(
        (p) =>
          (!p.tag || this.tagName === p.tag.toUpperCase()) &&
          p.classes.every((c) => this.classList.contains(c)) &&
          p.attrs.every(([k, v]) => {
            const val = k.startsWith('data-') ? this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] : this.attrs[k];
            return v === undefined ? val != null : String(val) === v;
          }),
      );
    }
    matches(sel) {
      // مجموعات بفواصل، وكل مجموعة سلسلة أسلاف بمسافات ('.a .b')
      return sel.split(',').some((group) => {
        const parts = group.trim().split(/\s+(?![^[]*\])/);
        if (!this.matchesOne(parts[parts.length - 1])) return false;
        let i = parts.length - 2;
        let n = this.parentNode;
        while (i >= 0 && n && n instanceof FakeEl) {
          if (n.matchesOne(parts[i])) i--;
          n = n.parentNode;
        }
        return i < 0;
      });
    }
    closest(sel) {
      let n = this;
      while (n && n instanceof FakeEl) {
        if (n.matches(sel)) return n;
        n = n.parentNode;
      }
      return null;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      return this.all().filter((e) => e.matches(sel));
    }
  }
  const body = new FakeEl('body');
  globalThis.document = {
    body,
    activeElement: body,
    documentElement: new FakeEl('html'),
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
    createDocumentFragment: () => new FakeEl('#fragment'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    getElementById: (id) => body.all().find((e) => e.id === id) || null,
  };
  globalThis.Node = FakeNode;
  for (const k of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) globalThis[k] = class {};
  return { body, FakeEl };
}
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const svgNames = (el) => el.all().filter((e) => e.tagName === 'SVG').map((e) => e.classList.values().find((c) => c.startsWith('icon-') && c !== 'icon-dir')?.slice(5));

/** fetch مزيّف يسجّل الطلبات ويرد JSON */
function stubFetch(reply = () => ({ status: 200, body: {} })) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}


const realFetch = globalThis.fetch;
let UI;
let SEG;
before(async () => {
  installDom();
  globalThis.window = globalThis.window || { localStorage: memoryStorage(), location: { hash: '#/inbox', pathname: '/app', search: '' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {} } };
  setMeta({ constants: { LABELS, ENUMS: {}, LEGAL_AREAS: [], GOVERNORATES: [] }, settings: {} });
  UI = await import('../public/assets/js/lib/ui.js');
  SEG = await import('../public/assets/js/app/components/segment-ui.js');
});
after(() => {
  globalThis.fetch = realFetch;
});

// ───────────────────────── K1 / J-07 / R-06: لون واحد لكل معنى ─────────────────────────
describe('v11 gate (staff) — status pills never wear the segment colours', () => {
  test('K1: no STATUS_TONES value is «primary» (green tint) or «accent» (gold) — those fills belong to the segment chips', () => {
    const bad = [];
    for (const [group, map] of Object.entries(UI.STATUS_TONES)) for (const [k, v] of Object.entries(map)) if (v === 'primary' || v === 'accent') bad.push(`${group}.${k}=${v}`);
    assert.deepEqual(bad, []);
    // the measured cases from the finding
    assert.equal(UI.statusTone('case_status', 'assigned'), 'neutral');
    assert.equal(UI.statusTone('case_status', 'in_progress'), 'info');
    assert.equal(UI.statusTone('intake_status', 'awaiting_client'), 'neutral');
    assert.equal(UI.statusTone('user_role', 'admin'), 'neutral');
    assert.equal(UI.statusTone('actor_kind', 'staff'), 'neutral');
    assert.equal(UI.statusTone('actor_kind', 'ai'), 'info');
  });

  test('K1: the staff pages that show a segment chip use no primary/accent badge, chip or actor tone', () => {
    const files = [
      'components/ai-reply.js', 'components/story-sheet.js', 'components/send-document.js', 'pages/admin/case-detail.js', 'pages/admin/cases.js',
      'pages/admin/inbox.js', 'pages/admin/intake-detail.js', 'pages/admin/matter-detail.js', 'pages/admin/matters.js', 'pages/admin/simulator.js',
    ];
    for (const f of files) {
      const src = read(`${APP}${f}`);
      assert.doesNotMatch(src, /badge\([^;\n]*?'(primary|accent)'/, `${f}: badge in a segment colour`);
      assert.doesNotMatch(src, /chips\([^;\n]*tone: '(primary|accent)'/, `${f}: chip in a segment colour`);
      const lines = src.split('\n').filter((l) => !/variant:/.test(l));
      assert.deepEqual(lines.filter((l) => /\? '(primary|accent)' :|: '(primary|accent)'\)/.test(l)), [], `${f}: conditional segment colour`);
    }
    assert.match(read(`${APP}pages/admin/intake-detail.js`), /const ACTOR_TONES = \{ ai: 'info', client: 'neutral', staff: 'neutral', lawyer: 'info', system: 'muted' \};/);
    assert.match(read(`${APP}components/story-sheet.js`), /export const TRACK_TONES = \{ consultation: 'info', matter: 'neutral',/);
    // the triage-card unread count is a quiet pill, not a filled green circle
    assert.match(read(`${CSS}v9-messaging.css`), /\.pa-story \.pa-unread \{\s*background: var\(--fill-2\);\s*color: var\(--label\);/);
  });

  test('a status badge rendered for an assigned case is neutral, never the «أفراد» tint', () => {
    const b = UI.statusBadge('case_status', 'assigned');
    assert.ok(b.classList.contains('badge-neutral'), b.className);
    assert.ok(!b.classList.contains('badge-primary') && !b.classList.contains('badge-accent'));
  });
});

// ───────────────────────── V4: حلقة التركيز على الجزء المضغوط ─────────────────────────
describe('v11 gate (staff) — V4 the pressed segment keeps its focus ring', () => {
  test('every «.seg[aria-pressed=true]» box-shadow rule in v11-ui.css is followed by a focus-visible ring for the pressed segment', () => {
    const css = read(`${CSS}v11-ui.css`);
    const pressed = [...css.matchAll(/\.seg\[aria-pressed="true"\]\s*\{[^}]*box-shadow/g)].map((m) => m.index);
    assert.ok(pressed.length >= 1);
    const ring = /\.seg\[aria-pressed="true"\]:focus-visible[^{]*\{[^}]*box-shadow:\s*var\(--focus-ring\)/g;
    const rings = [...css.matchAll(ring)].map((m) => m.index);
    for (const p of pressed) assert.ok(rings.some((r) => r > p), `no focus ring after the pressed rule at ${p}`);
    assert.match(read(`${CSS}app.css`), /--focus-ring:/);
  });
});

// ───────────────────────── J-02: بطاقة «المصدر والقناة» ─────────────────────────
describe('v11 gate (staff) — J-02 the source card speaks Arabic', () => {
  test('gate / gate_via are labelled and translated; requester is internal (its own card shows it)', async () => {
    const D = await import('../public/assets/js/app/pages/admin/intake-detail.js');
    assert.equal(D.isInternalSourceKey('requester'), true);
    assert.equal(D.isInternalSourceKey('identity_x'), true);
    assert.equal(D.isInternalSourceKey('gate'), false);
    assert.equal(D.sourceDetailValue('gate', 'paid'), 'أفراد وشركات');
    assert.equal(D.sourceDetailValue('gate', 'charity'), 'خيري');
    assert.equal(D.sourceDetailValue('gate_via', 'param'), 'من رابط الصفحة');
    assert.equal(D.sourceDetailValue('gate_via', 'cookie'), 'اختيار سابق محفوظ في المتصفح');
    assert.equal(D.sourceDetailValue('gate_via', 'default'), 'الإعداد الافتراضي للموقع');
    assert.equal(D.sourceDetailValue('campaign', 'x'), null, 'unknown keys fall back to the raw value');
    const src = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(src, /gate: 'اختيار الزائر',\n\s*gate_via: 'طريقة التحديد',/);
  });
});

// ───────────────────────── J-22: ملاحظة «لن يُطلب أي مبلغ…» ─────────────────────────
describe('v11 gate (staff) — J-22 the paid-only note follows the target', () => {
  test('changing paid → charity hides «لن يُطلب أي مبلغ…»; choosing paid shows it', () => {
    const b = SEG.segmentSheetBody({ kind: 'intake', current: 'paid' });
    const note = b.controls.amountNote;
    assert.equal(note.hidden, false, 'current paid: the note is about the paid side');
    b.controls.radios[0].querySelector('input').click(); // خيري
    assert.equal(note.hidden, true);
    b.controls.radios[1].querySelector('input').click(); // أفراد وشركات
    assert.equal(note.hidden, false);
    const c = SEG.segmentSheetBody({ kind: 'intake', current: 'charity' });
    assert.equal(c.controls.amountNote.hidden, true, 'charity → (nothing chosen yet): hidden');
    c.controls.radios[1].querySelector('input').click();
    assert.equal(c.controls.amountNote.hidden, false);
  });
});

// ───────────────────────── K13(c) / J-20: الرقم غير المضبوط ─────────────────────────
describe('v11 gate (staff) — K13(c) unknown line shows digits only', () => {
  test('«(…1234)» for a numeric id; no «(…NOWN)» for a demo id', () => {
    assert.equal(SEG.unknownLineText('1234'), 'وصلت على رقم غير مضبوط (…1234)');
    assert.equal(SEG.unknownLineText('NOWN'), 'وصلت على رقم غير مضبوط');
    assert.equal(SEG.unknownLineText(null), 'وصلت على رقم غير مضبوط');
    assert.equal(SEG.unknownLineText(''), 'وصلت على رقم غير مضبوط');
    assert.equal(text(SEG.unknownLineChip('KNOWN')), 'وصلت على رقم غير مضبوط');
  });
});

// ───────────────────────── J-20 / K13(b): «إضافة كشركة عميلة» ─────────────────────────
describe('v11 gate (staff) — J-20 ?new=1&name=&phone= opens a prefilled «إضافة شركة»', () => {
  test('companyPrefill reads only new=1, keeps name and phone, strips control characters', async () => {
    const C = await import('../public/assets/js/app/pages/admin/companies.js');
    assert.equal(C.companyPrefill({}), null);
    assert.equal(C.companyPrefill({ new: '0', name: 'x' }), null);
    assert.deepEqual(C.companyPrefill({ new: '1', name: ' شركة الأمل للتجارة ', phone: '01092000303' }), { name: 'شركة الأمل للتجارة', phone: '01092000303' });
    assert.deepEqual(C.companyPrefill({ new: '1', name: 'a\u0000b', phone: '01<script>2' }), { name: 'a b', phone: '012' });
    assert.equal(C.companyPrefill({ new: '1', name: 'x'.repeat(400) }).name.length, 150);
  });

  test('the page opens the create sheet for admins (prefilled name + first-admin phone) and drops the query; case managers get a note', () => {
    const src = read(`${APP}pages/admin/companies.js`);
    assert.match(src, /const prefill = companyPrefill\(ctx\.query\);/);
    assert.match(src, /if \(isAdmin\) openCreateCompany\(ctx, \{ onCreated: load, prefill \}\);/);
    assert.match(src, /#\/companies`\);/);
    assert.match(src, /\{ values: \{ name: prefill\?\.name \|\| '' \}, footer: false \}/);
    assert.match(src, /fa_phone: prefill\?\.phone \|\| ''/);
    // the request page link carries exactly these keys
    assert.match(read(`${APP}pages/admin/intake-detail.js`), /new URLSearchParams\(\{ new: '1', name: requester\.company_name \|\| '', phone:/);
  });
});

// ───────────────────────── R-07: مسميات الأولوية ─────────────────────────
describe('v11 gate (staff) — R-07 priority filter labels are read at render time', () => {
  test('PRIORITY_FILTERS labels follow the meta loaded after the module (no raw urgent/high/normal/low)', async () => {
    setMeta({ constants: { LABELS: {}, ENUMS: {}, LEGAL_AREAS: [], GOVERNORATES: [] }, settings: {} });
    const I = await import('../public/assets/js/app/pages/admin/inbox.js');
    setMeta({ constants: { LABELS, ENUMS: {}, LEGAL_AREAS: [], GOVERNORATES: [] }, settings: {} });
    const labels = I.PRIORITY_FILTERS.map((p) => p.label);
    assert.deepEqual(labels, ['عاجلة أو عالية', ...['urgent', 'high', 'normal', 'low'].map((k) => LABELS.priority[k])]);
    for (const l of labels) assert.doesNotMatch(l, /^(urgent|high|normal|low)$/);
  });
});

// ───────────────────────── J-13 / V13: «العميل/ة» للأفراد ─────────────────────────
describe('v11 gate (staff) — J-13/V13 the client noun follows the segment (staff only)', () => {
  test('clientNoun / pronounOf', () => {
    assert.deepEqual(SEG.clientNoun('charity'), { def: 'المستفيد/ة', li: 'للمستفيد/ة', bi: 'بالمستفيد/ة', bare: 'مستفيد/ة', acc: 'مستفيدًا' });
    assert.equal(SEG.clientNoun(null).def, 'المستفيد/ة', '«غير محدد» keeps the pre-11 wording');
    assert.deepEqual(SEG.clientNoun('paid'), { def: 'العميل/ة', li: 'للعميل/ة', bi: 'بالعميل/ة', bare: 'عميل/ة', acc: 'عميلًا' });
    assert.equal(SEG.clientNoun('paid', { company: true }).def, 'الشركة');
    assert.equal(SEG.pronounOf('f'), 'ها');
    assert.equal(SEG.pronounOf('m'), 'ه');
    assert.equal(SEG.pronounOf('f', { company: true }), 'هم');
  });

  test('story sheet: «نسأله الأول» / «نسألهم الأول», the toast pronoun, no programme for paid', async () => {
    const S = await import('../public/assets/js/app/components/story-sheet.js');
    assert.equal(S.trackLabel('need_info', 'f'), LABELS.story_track.need_info);
    assert.equal(S.trackLabel('need_info', 'm'), 'نسأله الأول');
    assert.equal(S.trackLabel('need_info', 'f', { company: true }), 'نسألهم الأول');
    assert.equal(S.trackLabel('consultation', 'm'), LABELS.story_track.consultation);
    const src = read(`${APP}components/story-sheet.js`);
    assert.ok(src.includes('وأُرسلت لها رسالة${sim} — اختر الآن المحامي'), 'the 9.2 feminine string stays for women');
    assert.ok(src.includes('وأُرسلت ل${pr} رسالة${sim} — اختر الآن المحامي'));
    assert.match(src, /acceptToast\(finished, \{ form: addrForm, company: isCompanyLead \}\)/);
    assert.match(src, /if \(segPick !== 'paid'\) \{\s*program = programSelect/);
    assert.match(src, /kase\.program_id = segPick !== 'paid' && program/);
  });

  test('request page, case page, inbox rows and the cases column use the noun; lawyer-facing text never does', () => {
    const det = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(det, /const N = clientNoun\(segValue, \{ company: Boolean\(requester\) \}\);/);
    for (const s of ['`الرد على ${N.def}`', '`اكتب ردك على ${N.def}…`', '`بانتظار رد ${N.def}`', '`مصدر ${N.def}`', 'replyChannelsFor(N.def)', 'mergeLabel(N.bare)']) assert.ok(det.includes(s), s);
    // the facts shared with lawyers keep one neutral wording whatever the segment (segment never shown to lawyers)
    assert.ok(det.includes('الوقائع كما وردت من المستفيد/ة:'));
    const cd = read(`${APP}pages/admin/case-detail.js`);
    assert.match(cd, /const N = clientNoun\(segValue, \{ company: Boolean\(company\) \}\);/);
    for (const s of ['button(`رسالة ${N.li}`', 'title: `${N.def} ومصدره`', '`رضا ${N.def}`', 'noun: N, // v11 gate fix (J-13)']) assert.ok(cd.includes(s), s);
    assert.match(read(`${APP}pages/admin/cases.js`), /label: 'المستفيد\/ة أو العميل',/);
    assert.match(read(`${APP}pages/admin/inbox.js`), /clientNoun\(it\.segment, \{ company: it\.requester_kind === 'company' \}\)\.def/);
    for (const f of fs.readdirSync(path.join(ROOT, `${APP}pages/lawyer`))) assert.doesNotMatch(read(`${APP}pages/lawyer/${f}`), /clientNoun|العميل\/ة/, f);
  });

  test('the case composer label and auto channel follow the noun', async () => {
    const CD = await import('../public/assets/js/app/pages/admin/case-detail.js');
    const paid = CD.messageComposer({ onSend() {}, noun: SEG.clientNoun('paid') });
    assert.match(text(paid), /رسالة جديدة للعميل\/ة/);
    assert.equal(paid.querySelector('textarea').attrs.placeholder ?? paid.querySelector('textarea').placeholder, 'اكتب رسالة للعميل/ة…');
    assert.ok(paid.querySelectorAll('option').map(text).includes('تلقائي — آخر قناة تواصل منها العميل/ة'));
    const charity = CD.messageComposer({ onSend() {} });
    assert.match(text(charity), /رسالة جديدة للمستفيد\/ة/);
  });

  test('lawyers.js validator names the paid rate as the UI does (K9)', () => {
    const src = read('src/services/lawyers.js');
    assert.ok(src.includes("v.money(body.b2b_rate, 'سعر العمل المدفوع (أفراد وشركات)',"));
    assert.ok(!src.includes('سعر طلبات الشركات'));
  });
});

// ───────────────────────── J-15: طلب عرض من شركة ─────────────────────────
describe('v11 gate (staff) — J-15 a company lead is a commercial contact, not a legal analysis', () => {
  test('inbox: the lead card has the commercial line and no AI track/title; request page: the commercial card first, no proposal, no legal AI card', async () => {
    const I = await import('../public/assets/js/app/pages/admin/inbox.js');
    assert.equal(I.COMPANY_LEAD_LINE, 'طلب عرض — تواصل تجاري، لا تحليل قانوني');
    const inbox = read(`${APP}pages/admin/inbox.js`);
    assert.equal((inbox.match(/const ai = lead \? null : it\.ai \|\| null;/g) || []).length, 2, 'list rows and triage cards');
    const det = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(det, /requester \? withId\(requesterCard\(\), 'pa-requester'\) : null,\n\s*prop && !requester \? withId\(proposalCard\(\), 'pa-proposal'\) : withId\(decisionCard\(\), 'pa-decision'\),/);
    assert.match(det, /title: 'طلب عرض — تواصل تجاري',/);
    assert.match(det, /aiTitle && !requester \?/);
    assert.match(det, /function aiCard\(\) \{\n[^\n]*\n\s*if \(requester\) \{/);
  });
});

// ───────────────────────── J-12 / V6: الوارد وترويسة الطلب ─────────────────────────
describe('v11 gate (staff) — J-12/V6 inbox and request header', () => {
  test('«صندوق الوارد»; «تسجيل طلب يدوي» tinted; the phone «+» lives in the nav bar', async () => {
    assert.match(read(`${APP}routes.js`), /path: '\/inbox', [^\n]*title: 'صندوق الوارد' \}/);
    const inbox = read(`${APP}pages/admin/inbox.js`);
    assert.match(inbox, /button\('تسجيل طلب يدوي', \{ variant: 'tinted', icon: 'plus', onClick: manualIntake, className: 'pa-manual-btn'/);
    assert.match(inbox, /title: 'صندوق الوارد',/);
    const css = read(`${CSS}pages-a.css`);
    assert.match(css, /\.pa-nav-plus \{\s*display: none;/);
    assert.match(css, /@media \(max-width: 599px\) \{\s*\.pa-nav-plus \{\s*display: inline-flex;[\s\S]*?\.pa-page-inbox \.pa-manual-btn \{\s*display: none;/);
    // navPlus puts one «+» (named for screen readers) into the top bar and replaces an old one
    const I = await import('../public/assets/js/app/pages/admin/inbox.js');
    const bar = document.createElement('div');
    bar.classList.add('topbar-actions');
    const top = document.createElement('header');
    top.classList.add('topbar');
    top.appendChild(bar);
    document.body.appendChild(top);
    let clicked = 0;
    I.navPlus(() => clicked++);
    const b = I.navPlus(() => clicked++);
    assert.equal(bar.querySelectorAll('.pa-nav-plus').length, 1);
    assert.equal(b.getAttribute('aria-label'), 'تسجيل طلب يدوي');
    b.click();
    assert.equal(clicked, 1);
    top.remove();
    assert.equal(I.navPlus(() => {}), null, 'no top bar → nothing');
  });

  test('request header: «تغيير» right after the chip; no duplicate code chip, kind/area or «رجوع» row; the 9.2 title stays', () => {
    const det = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(det, /size: 'label' \}\),\n\s*\/\/[^\n]*\n\s*change,\n\s*sourceText\(seg\)/);
    const hdr = det.slice(det.indexOf('const header = pageHeader({'), det.indexOf('return h(\n    \'div.pa-page.pa-page-intake\''));
    assert.match(hdr, /title: `الطلب \$\{it\.code\}`/);
    assert.match(hdr, /meta: \[\n\s*segHead\(\),\n\s*statusBadge\('intake_status', it\.status\),/);
    assert.doesNotMatch(hdr, /codeTag\(it\.code\)/);
    assert.doesNotMatch(hdr, /label\('intake_kind', it\.kind\)|areaLabel\(it\.legal_area\)/);
    assert.doesNotMatch(hdr, /button\('رجوع'/);
    assert.match(hdr, /\{ label: 'صندوق الوارد', href: '#\/inbox' \}/);
  });

  test('a nav group that shows a count is never auto-collapsed (sidebar «طلبات الشركات 2»)', () => {
    const shell = read(`${APP}shell.js`);
    assert.match(shell, /const hasCount = \(c\) => c\.links\.some/);
    assert.match(shell, /c !== groupCtl\[0\] && !hasCount\(c\)\)\.reverse\(\)/);
    assert.match(shell, /if \(wasHidden && n > 0\) syncNavGroups\(activeLink\);/);
  });
});

// ───────────────────────── V9 / V15: الجدول والتباين ─────────────────────────
describe('v11 gate (staff) — V9 table fit, V15 contrast', () => {
  test('V9: a long status badge wraps inside its table cell', () => {
    assert.match(read(`${CSS}v11-ui.css`), /\.table td \.badge \{ white-space: normal; text-align: start; \}/);
  });

  test('V15: stars ≥ 3:1, outgoing bubble time ≥ 4.5:1, primary decide sub-text opaque', () => {
    const lum = (hex) => {
      const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const app = read(`${CSS}app.css`);
    const tok = (n) => new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, 'i').exec(app)[1];
    assert.match(read(`${CSS}pages-b.css`), /\.pb-stars \.is-on \{\s*\/\*[^*]*\*\/\s*color: var\(--accent-700\);/);
    assert.ok(ratio(tok('accent-700'), '#ffffff') >= 3, 'stars');
    assert.match(app, /\.msg-end \.msg-foot \{\s*color: var\(--gray-600\);/);
    assert.ok(ratio(tok('gray-600'), '#d9f2e4') >= 4.5, 'bubble time');
    const a = read(`${CSS}pages-a.css`);
    const rule = /\.pa-decide-opt\.is-primary \.pa-decide-text span \{([^}]*)\}/.exec(a)[1];
    assert.doesNotMatch(rule, /rgba\(/);
    assert.match(rule, /color: var\(--on-tint\);/);
  });
});

// ───────────────────────── K13(d): زر التواصل في رأس /p/ ─────────────────────────
describe('v11 gate (staff) — K13(d) the /p/ header contact icon follows its link', () => {
  test('switching to tel: swaps the icon, the name and drops target=_blank', () => {
    const src = read('public/assets/js/public/portal.js');
    assert.match(src, /hc\.classList\.toggle\('pub-head-contact--wa', Boolean\(wa\)\);/);
    assert.match(src, /hc\.setAttribute\('aria-label', wa \? 'واتساب \(يفتح في نافذة جديدة\)' : 'اتصال بالتليفون'\);/);
    assert.match(src, /hc\.removeAttribute\('target'\);/);
    assert.match(src, /mount\(hc, ic\(wa \? 'whatsapp' : 'phone', 22\)\);/);
  });
});

// ───────────────────────── HTTP: المسودات بالنبرتين (J-04/K13a) والتحقق (K9) ─────────────────────────
describe('v11 gate (staff) — HTTP on demo data', () => {
  let t;
  let admin;
  before(async () => {
    globalThis.fetch = realFetch;
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => {
    await t?.close();
  });

  test('J-04/K13(a): a charity or paid request’s proposal carries drafts in both tones, so an in-sheet change swaps the reply', async () => {
    const list = (await admin.get('/api/admin/intakes?scope=open&limit=200')).body.items;
    for (const seg of ['charity', 'paid']) {
      const candidates = list.filter((i) => i.segment === seg && !i.requester_kind);
      let checked = false;
      for (const it of candidates) {
        const p = (await admin.get(`/api/admin/intakes/${it.id}/proposal`)).body;
        if (!p || !p.drafts_by_tone) continue;
        assert.ok(p.drafts_by_tone.charity && p.drafts_by_tone.paid, `${seg} ${it.code}: both tones`);
        assert.deepEqual(p.drafts_by_tone[seg], p.drafts, 'the current tone is the drafts shown');
        const pick = (d) => JSON.stringify(d.consultation || d);
        assert.notEqual(pick(p.drafts_by_tone.charity), pick(p.drafts_by_tone.paid), `${it.code}: the tones differ`);
        assert.doesNotMatch(pick(p.drafts_by_tone.paid), /اتسجّل|هيدرس|مشكلتك/, 'no colloquial charity text in the paid drafts');
        checked = true;
        break;
      }
      assert.ok(checked, `a ${seg} request with a proposal on demo data`);
    }
  });

  test('K9: an invalid paid rate names «سعر العمل المدفوع (أفراد وشركات)»', async () => {
    const lawyers = (await admin.get('/api/admin/lawyers')).body;
    const l = (Array.isArray(lawyers) ? lawyers : lawyers.items)[0];
    const r = await admin.patch(`/api/admin/lawyers/${l.id}`, { b2b_rate: -5 });
    assert.ok([400, 422].includes(r.status), String(r.status));
    assert.match(JSON.stringify(r.body), /سعر العمل المدفوع \(أفراد وشركات\)/);
    assert.doesNotMatch(JSON.stringify(r.body), /سعر طلبات الشركات/);
  });
});
