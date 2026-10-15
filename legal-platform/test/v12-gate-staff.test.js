// v12 integration gate — staff fixer (K-S1…K-S8): document viewer on the request/file/matter pages (clean copy + «الأصل»
// + «نظّف المستند»), staff uploads through the scanner (H-M14), /audit group names, one-row inbox filters, «نوع الطلب: …؟»,
// request-page copy without «—», the firm's name on /app sign-in and /setup, and the «الرموز» tab out of the way.
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
const FIX = path.join(ROOT, 'test/fixtures/v12-media');
const b64 = (buf) => Buffer.from(buf).toString('base64');
const fixture = (name) => fs.readFileSync(path.join(FIX, name));
const ok = (r) => {
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  return r.body;
};

// ───────────────────────── DOM مصغّر (نسخة test/v11-gate-staff.test.js) ─────────────────────────
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
    before(...cs) {
      const p = this.parentNode;
      if (!p) return;
      const nodes = cs.map((c) => (typeof c === 'string' ? globalThis.document.createTextNode(c) : c));
      for (const n of nodes) {
        if (n.parentNode) n.parentNode.removeChild(n);
        n.parentNode = p;
      }
      p.childNodes.splice(p.childNodes.indexOf(this), 0, ...nodes);
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

const realFetch = globalThis.fetch;
let DV;
let PU;
before(async () => {
  installDom();
  globalThis.window = globalThis.window || { localStorage: memoryStorage(), location: { hash: '#/cases/1', pathname: '/app', search: '' }, addEventListener() {}, removeEventListener() {}, history: { replaceState() {}, pushState() {} } };
  setMeta({
    constants: { LABELS, ENUMS: {}, LEGAL_AREAS: [], GOVERNORATES: [] },
    settings: { org_name: 'مؤسسة بيوت مصر' },
    brand: { name: 'Emam Legal and Consultancy', short: 'Emam Legal', staff_chrome: { name: 'Emam Legal and Consultancy', short: 'Emam Legal' } },
  });
  DV = await import('../public/assets/js/app/components/doc-viewer.js');
  PU = await import('../public/assets/js/app/components/pathway-ui.js');
});
after(() => {
  globalThis.fetch = realFetch;
});

const scanned = (extra = {}) => ({
  id: 7,
  title: 'شهادة الوفاة',
  filename: 'image-1.jpg',
  mime: 'image/jpeg',
  kind: 'image',
  size: 2048,
  uploaded_by_kind: 'client',
  scan: { state: 'server', clean: true, originals: 0, pages: 1, display: 'clean', reason: null, ...extra },
});
const scanFile = () => ({
  filename: 'ورقة-1.jpg',
  mime: 'image/jpeg',
  data_base64: b64(fixture('orient-3.jpg')),
  scan: {
    v: 1,
    algo: 'scan-core@1',
    mode: 'color',
    turns: 0,
    pages: 1,
    quad: [[0.05, 0.05], [0.95, 0.04], [0.96, 0.95], [0.04, 0.96]],
    score: 0.91,
    partial: false,
    adjusted: false,
    originals: [{ filename: 'ورقة-الأصل-1.jpg', mime: 'image/jpeg', data_base64: b64(fixture('orient-6.jpg')) }],
  },
});
const firstDoc = (body) => (Array.isArray(body) ? body[0] : (body.documents || [])[0]);

// ───────────────────────── K-S1: المستند المحسّن في ملف القضية والأصل بضغطة ─────────────────────────
describe('v12 gate (staff) K-S1 — the request, file and matter pages show the clean copy with the original one tap away', () => {
  test('staffDocParts: DOC-16 under the name while the clean copy is displayed, «عرض» opens the viewer', () => {
    const { note, view } = DV.staffDocParts(scanned());
    assert.equal(note.hidden, false);
    assert.equal(text(note), 'نسخة محسّنة آليًا · الأصل محفوظ');
    assert.equal(note.querySelector('.doc-variant__note').getAttribute('data-tag'), 'DOC-16');
    assert.ok(view, '«عرض» for an image');
    assert.equal(text(view), 'عرض');
    // the original displayed first (L12-59): no DOC-16 line, the clean copy is one tap away in the viewer
    assert.equal(DV.staffDocParts(scanned({ display: 'original' })).note.hidden, true);
    // HEIC skipped: the staff note DOC-17; Word and voice files: «تنزيل» only (no «عرض»)
    const heic = DV.staffDocParts({ id: 8, title: 'صورة', mime: 'image/heic', kind: 'doc', scan: { state: 'skipped', clean: false, originals: 0, pages: 1, display: 'original', reason: 'heic' } });
    assert.equal(text(heic.note), 'صيغة HEIC لا تُعرض هنا. اطلب صورة JPG.');
    assert.equal(DV.staffDocParts({ id: 9, title: 'مذكرة', mime: 'application/msword', kind: 'doc' }).view, null);
    assert.equal(DV.staffDocParts({ id: 10, title: 'رسالة صوتية', mime: 'audio/ogg', kind: 'doc' }).view, null);
  });

  test('the three staff pages wire the parts into every document list (tagged with their own page codes), not only «تنزيل»', () => {
    const intake = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(intake, /import \{ staffDocParts \} from '\.\.\/\.\.\/components\/doc-viewer\.js';/);
    assert.match(intake, /const parts = staffDocParts\(doc\);/);
    assert.match(intake, /parts\.note,\n\s+player,/);
    assert.match(intake, /'div\.pc-doc-actions',\n\s+tagged\('RQT-\d+', parts\.view\),/);
    const kase = read(`${APP}pages/admin/case-detail.js`);
    assert.match(kase, /import \{ staffDocParts, openDocument, docKind \} from '\.\.\/\.\.\/components\/doc-viewer\.js';/);
    assert.match(kase, /partsOf\(d\)\.note,/);
    assert.match(kase, /'div\.btn-group\.pb-table-actions',\n\s+tagged\('CSF-\d+', partsOf\(d\)\.view\),/);
    // info-request attachments (client replies) open in the viewer too
    assert.match(kase, /onClick: viewable \? \(e\) => \(e\.preventDefault\(\), openDocument\(d\)\) : null,/);
    const matter = read(`${APP}pages/admin/matter-detail.js`);
    assert.match(matter, /partsOf\(x\)\.note,/);
    assert.match(matter, /tagged\('MTF-\d+', partsOf\(x\)\.view\),/);
    assert.match(matter, /tagged\('MTF-\d+', staffDocParts\(doc\)\.view\),/, 'client attachments in the matter conversation');
    for (const src of [intake, kase, matter]) assert.doesNotMatch(src, /tagged\('[A-Z]+-00'/, 'placeholders numbered (npm run tags)');
  });

  test('a scanned PDF opens in the viewer (DOC-16 + «الأصل» + staff tools), and the tools keep focus after a clean', () => {
    const src = read(`${APP}components/doc-viewer.js`);
    assert.match(src, /const open = \(\) => \(k === 'pdf' && variantOf\(d\) \? openImageViewer\(d, \{ onChange \}\) : openDocument\(d, \{ onChange \}\)\);/);
    assert.match(src, /if \(refocus\) tools\.querySelector\('button'\)\?\.focus\(\{ preventScroll: true \}\);/);
    // v12 gate r2 (intended): staff-only rules moved from v12-look.css to v10-desk.css (/app only; the /company CSS budget)
    assert.match(read('public/assets/css/v10-desk.css'), /\.doc-variant-slot \{ display: block;[^}]*\}\s*\.doc-variant-slot\[hidden\] \{ display: none; \}/);
  });

  test('server: the request page data carries the scan summary of a WhatsApp photo cleaned on the server (display = clean)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const doc = t.app.db.get("SELECT id, intake_id FROM documents WHERE scan_state = 'server' ORDER BY id LIMIT 1");
      assert.ok(doc, 'demo seed: a WhatsApp photo with a server clean copy');
      const det = ok(await admin.get(`/api/admin/intakes/${doc.intake_id}`));
      const row = det.documents.find((x) => x.id === doc.id);
      assert.equal(row.scan.display, 'clean');
      assert.equal(row.scan.clean, true);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── K-S2: رفع الفريق يمر بالماسح (H-M14) ─────────────────────────
describe('v12 gate (staff) K-S2 — staff uploads carry the scanner block, so the original is stored next to the clean copy', () => {
  test('api.js: UPLOAD_SCAN is on and fileToUpload adds file.bmScan as scan (nothing for a plain file)', async () => {
    const api = await import('../public/assets/js/lib/api.js');
    assert.equal(api.UPLOAD_SCAN, true);
    const prev = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/jpeg;base64,QUJD';
        setTimeout(() => this.onload(), 0);
      }
    };
    try {
      const scan = { v: 1, pages: 1, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: 'WFla' }] };
      const up = await api.fileToUpload({ name: 'ورقة.jpg', type: 'image/jpeg', size: 3, bmScan: scan });
      assert.deepEqual(up, { filename: 'ورقة.jpg', mime: 'image/jpeg', data_base64: 'QUJD', scan });
      const plain = await api.fileToUpload({ name: 'عقد.pdf', type: 'application/pdf', size: 3 });
      assert.ok(!('scan' in plain));
    } finally {
      globalThis.FileReader = prev;
    }
  });

  test('server: a staff case/matter upload with a scan block keeps the original (scan_state staff, one original row)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const caseId = t.app.db.value('SELECT id FROM cases ORDER BY id LIMIT 1');
      const d = firstDoc(ok(await admin.post(`/api/admin/cases/${caseId}/documents`, { files: [scanFile()] })));
      assert.equal(d.scan.state, 'staff');
      assert.equal(d.scan.originals, 1);
      assert.deepEqual(t.app.db.all('SELECT role FROM document_files WHERE document_id = ?', d.id).map((f) => f.role), ['original']);
      const matterId = t.app.db.value('SELECT id FROM matters ORDER BY id LIMIT 1');
      const m = firstDoc(ok(await admin.post(`/api/admin/matters/${matterId}/documents`, { files: [scanFile()] })));
      assert.equal(m.scan.state, 'staff');
      assert.equal(m.scan.originals, 1);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── K-S3: أسماء مجموعات سجل الأمان ─────────────────────────
describe('v12 gate (staff) K-S3 — /audit names every v12 event group', () => {
  test('GROUP_LABELS has intake, client, analytics, voice, media and tags in Arabic', () => {
    const block = /const GROUP_LABELS = \{([\s\S]*?)\};/.exec(read(`${APP}pages/admin/audit.js`))[1];
    // v12 gate (V-08, intended): «أصحاب الطلبات» كعنوان القائمة الجانبية
    const want = { intake: 'الطلبات', client: 'أصحاب الطلبات', analytics: 'التحليلات', voice: 'الرسائل الصوتية', media: 'المستندات والصوت', tags: 'رموز العناصر' };
    for (const [k, v] of Object.entries(want)) assert.ok(block.includes(`\n  ${k}: '${v}'`), k);
  });
});

// ───────────────────────── K-S4: صف التصفية في صندوق الوارد ─────────────────────────
describe('v12 gate (staff) K-S4 — the inbox filter row is one row from 1200 px', () => {
  test('v10-desk.css: nowrap row, flexible search, selects sized to their words', () => {
    // v12 gate r2 (intended): staff-only rules moved from v12-look.css to v10-desk.css (/app only; the /company CSS budget)
    const css = read('public/assets/css/v10-desk.css');
    const m = /@media \(min-width: 1200px\) \{(\s*\.pa-filters-desk[\s\S]*?)\n {2}\}/.exec(css);
    assert.ok(m, 'the ≥ 1200 px block');
    assert.match(m[1], /\.pa-filters-desk \.filter-bar \{ flex-wrap: nowrap; \}/);
    assert.match(m[1], /\.pa-filters-desk \.filter-bar \.search-input \{ flex: 1 1 220px; min-width: 200px; \}/);
    assert.match(m[1], /\.pa-filters-desk \.filter-bar \.select-wrap \{ flex: 0 1 136px; min-width: 118px; \}/);
    // at 1366 the content column is 1046 px and at 1280 960 px: five selects + gaps + the search's minimum fit both
    assert.ok(5 * 136 + 5 * 8 + 200 <= 960);
  });
});

// ───────────────────────── K-S5: نوع الطلب لا يشبه مسار الذكاء الاصطناعي ─────────────────────────
describe('v12 gate (staff) K-S5 — the line suggestion reads as the request TYPE, not the AI track', () => {
  test('suggestRow: «نوع الطلب: استشارة؟» + «تأكيد النوع» (no «مقترح» beside the AI pill «المقترح: …»)', () => {
    const row = { id: 3, pathway: null, suggested_line: 'consultation', suggested_line_label: 'استشارة' };
    const el = PU.suggestRow(row);
    assert.equal(text(el.querySelector('.line-path--suggest')), 'نوع الطلب: استشارة؟');
    assert.equal(text(el.querySelector('button')), 'تأكيد النوع');
    assert.equal(el.querySelector('button').getAttribute('aria-label'), 'تأكيد نوع الطلب: استشارة');
    assert.doesNotMatch(text(el), /مقترح/);
    assert.equal(text(PU.suggestRow(row, { withButton: false })), 'نوع الطلب: استشارة؟');
  });
});

// ───────────────────────── K-S6: صفحة الطلب بلا «—» ─────────────────────────
describe('v12 gate (staff) K-S6 — request-page copy without the em-dash cadence', () => {
  test('the named lines and their neighbours are rewritten with «.» or «،», same meaning', () => {
    const src = read(`${APP}pages/admin/intake-detail.js`);
    const gone = ['مساعد فقط —', 'لم تحكِ مشكلتها بعد —', 'اقتراح الذكاء الاصطناعي —', 'لا تتحول تلقائيًا إلى ملف —', 'عدد المستندات: ${allDocs.length} —', 'ومصدره —', 'مكتوبة —', 'التهديد بالطرد —', 'مكالمة — كتبتها'];
    for (const s of gone) assert.ok(!src.includes(s), s);
    const now = ["'مساعد فقط، والقرار للإدارة. تقييمك يُسجَّل لتحسينه.'", '`لم تحكِ مشكلتها بعد. الوقت المناسب: ${', "'لم تحكِ مشكلتها بعد. اسمعها في المكالمة.'", "'اقتراح الذكاء الاصطناعي، والقرار لك'"];
    for (const s of now) assert.ok(src.includes(s), s);
    assert.ok(read(`${APP}pages/admin/inbox.js`).includes('`لم تحكِ مشكلتها بعد. الوقت المناسب: ${'));
  });
});

// ───────────────────────── K-S7: اسم المكتب على صفحة الدخول ─────────────────────────
describe('v12 gate (staff) K-S7 — /app sign-in and /setup name the firm, not the archived foundation', () => {
  test('login.js / auth-flows.js / setup: «منصة المكتب», © from meta.site.firm_name', () => {
    for (const f of [`${APP}pages/login.js`, `${APP}pages/auth-flows.js`, 'public/assets/js/public/setup.js', 'public/setup.html']) assert.ok(!read(f).includes('منصة الدعم القانوني'), f);
    const login = read(`${APP}pages/login.js`);
    assert.match(login, /const firm = String\(\(meta && meta\.site && meta\.site\.firm_name\) \|\| ''\)\.trim\(\) \|\| \(chrome\.on \? chrome\.name : org\);/);
    assert.ok(!/المستفيد\/ة/.test(login), 'the sign-in pitch speaks of the firm’s clients, not beneficiaries');
  });

  test('the sign-in page renders «© {year} {firm}» and «منصة المكتب»', async () => {
    const { default: renderLogin } = await import('../public/assets/js/app/pages/login.js');
    const el = renderLogin({ meta: { settings: { org_name: 'مؤسسة بيوت مصر' }, site: { firm_name: 'إمام وشركاه' } }, onLogin() {} });
    assert.equal(text(el.querySelector('.login-foot')), `© ${new Date().getFullYear()} إمام وشركاه. جميع الحقوق محفوظة.`);
    assert.equal(text(el.querySelector('.brand-sub')), 'منصة المكتب');
    assert.doesNotMatch(text(el), /بيوت مصر|منصة الدعم القانوني/);
  });

  test('server: /api/meta?part=login gives site.firm_name = firm_legal_name › brand_name (same as the public footer)', async () => {
    const t = await startTestApp();
    try {
      const c = t.client();
      assert.equal(ok(await c.get('/api/meta?part=login')).site.firm_name, 'Emam Legal and Consultancy');
      t.app.settings.set('firm_legal_name', 'إمام وشركاه');
      assert.equal(ok(await c.get('/api/meta?part=login')).site.firm_name, 'إمام وشركاه');
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── K-S8: لسان «الرموز» ─────────────────────────
describe('v12 gate (staff) K-S8 — the «الرموز» tab sits bottom-left above the safe area and climbs off any control', () => {
  test('tags.js: no mid-edge «top:42%»; bottom + env(safe-area-inset-bottom); placeFab() runs in the full pass before fabRect', () => {
    const src = read('public/assets/js/lib/tags.js');
    assert.ok(!src.includes('top:42%'));
    assert.match(src, /\.bmt-fab\{position:fixed;left:0;bottom:calc\(12px \+ env\(safe-area-inset-bottom,0px\)\);/);
    assert.match(src, /function placeFab\(\) \{/);
    assert.match(src, /placeFab\(\);\n\s+\/\/ لسان «الرموز» عند الحافة[^\n]*\n\s+const fr = fab\.getBoundingClientRect\(\);/);
    assert.match(src, /document\.elementsFromPoint\(x, yy\)\.find\(\(e\) => !ours\(e\)\)/);
  });
});

// ═════════════════════════ v12 gate — round 2 (staff fixer: JR-04, JR-06, JR-13, V-08…V-27, TA-02…TA-07) ═════════════════════════
const UI_PATH = '../public/assets/js/lib/ui.js';
const SEG_PATH = '../public/assets/js/app/components/segment-ui.js';
const css = (f) => read(`public/assets/css/${f}`);
/** كائن حرفي باسمه في المصدر ← أزواج [مفتاح، رمز] (خرائط الرموز *_TAGS) */
const tagMap = (src, name) => {
  const m = new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`).exec(src);
  assert.ok(m, name);
  return [...m[1].matchAll(/(\w+): (?:\{ tag: )?'([A-Z]+-\d+)'/g)].map((x) => [x[1], x[2]]);
};
const distinct = (pairs, n, label) => {
  assert.equal(pairs.length, n, `${label}: ${pairs.length} entries`);
  assert.equal(new Set(pairs.map((p) => p[1])).size, n, `${label}: one code per item ${JSON.stringify(pairs)}`);
  for (const [, c] of pairs) assert.doesNotMatch(c, /-00$/, `${label}: numbered by npm run tags`);
};

describe('v12 gate r2 (staff) JR-04 — the staff company-request page shows a scanned contract like the request page', () => {
  test('docItem: staffDocParts → DOC-16 line under the name, «عرض» (viewer: «الأصل», «النص», clean tools), the name opens the same viewer', () => {
    const src = read(`${APP}pages/admin/company-request.js`);
    assert.match(src, /import \{ staffDocParts \} from '\.\.\/\.\.\/components\/doc-viewer\.js';/);
    const fn = /function docItem\(d, \{ analyze = true \} = \{\}\) \{([\s\S]*?)\n\}/.exec(src)[1];
    assert.match(fn, /const parts = staffDocParts\(d\);/);
    assert.match(fn, /onClick: \(e\) => \(e\.preventDefault\(\), parts\.open\(\)\)/);
    assert.match(fn, /parts\.note,/);
    assert.match(fn, /tagged\('CRF-\d+', parts\.view\),/);
    assert.doesNotMatch(fn, /CRF-00/);
    assert.doesNotMatch(src, /openDocument\(d\)/, 'no bare download/PDF tab from the name link');
  });

  test('staffDocParts().open: a scanned multi-page PDF opens the in-app viewer (not a browser tab); a Word file still downloads', () => {
    const pdf = { id: 35, title: 'صورة مستند، 3 صفحات.pdf', mime: 'application/pdf', kind: 'pdf', scan: { state: 'client', clean: true, originals: 3, pages: 3, display: 'clean', reason: null } };
    const parts = DV.staffDocParts(pdf);
    assert.equal(typeof parts.open, 'function');
    assert.equal(text(parts.note), 'نسخة محسّنة آليًا · الأصل محفوظ');
    assert.equal(text(parts.view), 'عرض');
    const src = read(`${APP}components/doc-viewer.js`);
    assert.match(src, /export function openStaffDocument\(d, \{ onChange \} = \{\}\) \{\n\s+return docKind\(d\) === 'pdf' && variantOf\(d\) \? openImageViewer\(d, \{ onChange \}\) : openDocument\(d, \{ onChange \}\);/);
    assert.match(src, /const open = \(\) => openStaffDocument\(d, \{ onChange: changed \}\);\n\s+return \{ note, view, open \};/);
  });

  test('server: a company scanned upload reaches the staff request API with its scan summary; the company view never shows it', async () => {
    const t = await startTestApp();
    try {
      const { seedB2bDemo, COMPANY_DEMO_PASSWORD } = await import('../src/seed-v10-b2b.js');
      await seedB2bDemo(t.app);
      let cookie = '';
      const co = async (method, url, body) => {
        const res = await fetch(t.base + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        const m = /bm_csid=([^;]*)/.exec(res.headers.get('set-cookie') || '');
        if (m) cookie = `bm_csid=${m[1]}`;
        return { status: res.status, body: await res.json().catch(() => null) };
      };
      assert.equal((await co('POST', '/api/company/auth/login', { email: 'mariam@nilefoods.example', password: COMPANY_DEMO_PASSWORD })).status, 200);
      const scan = { v: 1, algo: 'scan-core@1', mode: 'color', turns: 0, pages: 1, quad: [[0.05, 0.05], [0.95, 0.04], [0.96, 0.95], [0.04, 0.96]], score: 0.91, partial: false, adjusted: false, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: b64(fixture('orient-6.jpg')) }] };
      const up = await co('POST', '/api/company/uploads', { file: { name: 'الميراث-1.jpg', mime: 'image/jpeg', data_base64: b64(fixture('orient-3.jpg')), scan } });
      assert.equal(up.status, 201, JSON.stringify(up.body));
      const companyId = t.app.db.value("SELECT company_id FROM company_users WHERE email = 'mariam@nilefoods.example'");
      const entityId = t.app.db.value('SELECT id FROM company_entities WHERE company_id = ? ORDER BY id LIMIT 1', companyId);
      const made = await co('POST', '/api/company/requests', { type: 'other', entity_id: entityId, description: 'مراجعة عقد الميراث المصوَّر بالهاتف قبل التوقيع', fields: {}, upload_ids: [up.body.upload_id] });
      assert.equal(made.status, 201, JSON.stringify(made.body));
      const req = made.body.request || made.body;
      assert.ok(req.code, JSON.stringify(made.body).slice(0, 200));
      const admin = await t.login('admin');
      const id = t.app.db.value('SELECT id FROM company_requests WHERE code = ?', req.code);
      const det = ok(await admin.get(`/api/admin/company-requests/${id}`));
      const doc = det.documents.find((d) => d.filename === 'الميراث-1.jpg');
      assert.ok(doc, 'the scanned upload is listed');
      assert.equal(doc.scan.clean, true);
      assert.equal(doc.scan.originals, 1);
      const mine = (await co('GET', `/api/company/requests/${encodeURIComponent(req.code)}`)).body;
      const cdoc = JSON.stringify(mine);
      assert.ok(cdoc.includes('الميراث-1.jpg'));
      assert.ok(!/"scan"|"originals"|"ocr"/.test(cdoc), 'the company view carries no scan/OCR block');
    } finally {
      await t.close();
    }
  });
});

describe('v12 gate r2 (staff) V-10 — file names keep their reading order («الميراث-1.jpg», never «1-الميراث.jpg»)', () => {
  test('ui.fileName: an Arabic name is an RTL isolate with the Latin extension in its own LTR isolate; Latin and bare names stay whole', async () => {
    const UI = await import(UI_PATH);
    const ar = UI.fileName('الميراث-1.jpg');
    assert.equal(ar.tagName, 'BDI');
    assert.ok(ar.classList.contains('fname'));
    assert.equal(ar.getAttribute('dir'), 'rtl');
    assert.equal(ar.childNodes[0].textContent, 'الميراث-1');
    const ext = ar.querySelector('.fname__ext');
    assert.equal(ext.getAttribute('dir'), 'ltr');
    assert.equal(text(ext), '.jpg');
    assert.equal(text(ar), 'الميراث-1.jpg', 'the text itself is unchanged (copy, search)');
    assert.equal(text(UI.fileName('صورة مستند، 3 صفحات.pdf').querySelector('.fname__ext')), '.pdf');
    for (const plain of ['image-1.jpg', 'ورقة', 'IMG_2041.JPG']) {
      const el = UI.fileName(plain);
      assert.equal(el.getAttribute('dir'), 'auto', plain);
      assert.equal(el.querySelector('.fname__ext'), null, plain);
    }
  });

  test('the conversation chips (KIT-20/21) and every staff/company/portal document list use the isolate', async () => {
    const UI = await import(UI_PATH);
    const thread = UI.chatThread([{ direction: 'in', channel: 'website', body: 'الأوراق', created_at: '2026-10-15T10:00:00.000Z', documents: [{ id: 1, filename: 'الميراث-1.jpg' }] }]);
    const chip = thread.querySelector('.doc-chip');
    assert.equal(chip.getAttribute('data-tag'), 'KIT-21');
    assert.equal(text(chip.querySelector('.fname__ext')), '.jpg');
    for (const f of [`${APP}pages/admin/intake-detail.js`, `${APP}pages/admin/case-detail.js`, `${APP}pages/admin/matter-detail.js`, `${APP}pages/admin/company-request.js`, 'public/assets/js/company/pages/request.js', 'public/assets/js/lib/company-ui.js']) {
      assert.match(read(f), /fileName\(/, f);
    }
    assert.doesNotMatch(read(`${APP}pages/admin/intake-detail.js`), /dir: \/\\\.\[A-Za-z0-9\]\{2,5\}\$\/\.test\(name\) \? 'ltr'/, 'the whole-name LTR isolate is gone');
    const portal = read('public/assets/js/public/portal.js');
    assert.equal((portal.match(/fileName\(d\.filename\)/g) || []).length, 2);
    assert.ok(!portal.includes("h('bdi.bp-fname', { dir: 'ltr' }, d.filename)"));
    assert.match(css('v12-look.css'), /\.fname__ext \{ margin-right: 0\.15em; \}/);
  });
});

describe('v12 gate r2 (staff) V-08 / JR-06 — paid requests, files and matters speak of «صاحب الطلب» and «المكتب»', () => {
  test('segment-ui: clientNoun / firmNoun / trackWord per segment (charity keeps its words)', async () => {
    const SEG = await import(SEG_PATH);
    assert.equal(SEG.clientNoun('paid').def, 'صاحب الطلب');
    assert.equal(SEG.clientNoun('paid').li, 'لصاحب الطلب');
    assert.equal(SEG.clientNoun('charity').def, 'المستفيد/ة');
    assert.equal(SEG.firmNoun('paid'), 'المكتب');
    assert.equal(SEG.firmNoun('charity'), 'المؤسسة');
    assert.equal(SEG.firmNoun(null, { company: true }), 'المكتب');
    for (const [g, want] of [['story_track', 'نسأل أولًا'], ['story_track_long', 'نحتاج سؤالًا قبل القرار'], ['story_track_action', 'اسأل أولًا']]) {
      assert.equal(SEG.trackWord(g, 'need_info', { paid: true }), want, g);
      assert.equal(SEG.trackWord(g, 'need_info', { form: 'f' }), LABELS[g].need_info, `${g} charity`);
    }
    assert.equal(SEG.trackWord('story_track_action', 'need_info', { form: 'm', paid: true }), 'اسأله');
    assert.equal(SEG.trackWord('story_track', 'need_info', { company: true }), 'نسألهم الأول');
    assert.equal(SEG.trackWord('story_track', 'consultation', { paid: true }), LABELS.story_track.consultation);
  });

  test('server labels and shared staff labels carry no «/ة»; the nav says «أصحاب الطلبات»', async () => {
    assert.equal(LABELS.intake_status.awaiting_client, 'بانتظار صاحب الطلب');
    assert.equal(LABELS.source.returning, 'صاحب طلب سابق');
    const { QUEUE_LABELS } = await import('../public/assets/js/app/labels.js');
    for (const k of ['client_replies', 'approved_unanswered', 'awaiting_client']) assert.doesNotMatch(QUEUE_LABELS[k], /\/ة|المستفيد/, k);
    const { routeTitle } = await import('../public/assets/js/app/routes.js');
    assert.equal(routeTitle('/clients'), 'أصحاب الطلبات');
    assert.equal(routeTitle('/clients/:id'), 'ملف صاحب الطلب');
    assert.match(read('src/ai/index.js'), /تعاملنا معها من قبل`/);
    assert.ok(!read('src/ai/index.js').includes('تعاملت معها المؤسسة'));
  });

  test('request page: the firm noun in the composer hint, history and conversation; the paid pathway-answers card; neutral verbs', () => {
    const src = read(`${APP}pages/admin/intake-detail.js`);
    for (const s of ['outLabel: FIRM,', 'يُرسل من قناة ${FIRM} الرسمية', '`تاريخ ${N.def} مع ${FIRM}`', '`هذا أول تواصل ${N.li} مع ${FIRM}.`', "a.actor_kind === 'client' ? N.def : label('actor_kind', a.actor_kind)", "male ? 'اتصل به' : isPaid || requester ? 'اتصل' : 'اتصل بها'", "TW('story_track_action', rec)", 'rows ? PAID_FORM_TITLE :', 'rows ? PAID_FORM_HINT :']) assert.ok(src.includes(s), s);
    for (const s of ["outLabel: 'المؤسسة'", 'يُرسل من قناة المؤسسة الرسمية', 'مع المؤسسة`', 'هذا أول تواصل لهذا']) assert.ok(!src.includes(s), s);
    assert.match(src, /export const PAID_FORM_TITLE = 'إجابات صاحب الطلب في الموقع';/);
    assert.doesNotMatch(/export const PAID_FORM_HINT = '([^']*)'/.exec(src)[1], /صور|ها\b|ضغطت/);
  });

  test('inbox rows: neutral verbs for paid/company rows, «طلب مكالمة» / «بانتظار الرد» filters, the track word by row', () => {
    const src = read(`${APP}pages/admin/inbox.js`);
    assert.match(src, /const paidRow = \(parseSeg\(it\.segment\) === 'paid' \|\| lead\) && it\.address_form !== 'm';/);
    for (const s of ["paidRow ? 'لا رد' : 'لم ترد'", "paidRow ? 'اتصل' : 'اتصل بها'", "{ key: 'callback', label: 'طلب مكالمة' }", "{ key: 'awaiting', label: 'بانتظار الرد' }", "rowTrack(it, 'story_track_action', track)", "label: 'مصدر الطلب'", "label: 'اسم صاحب الطلب'", "badge('صاحب طلب سابق'"]) assert.ok(src.includes(s), s);
    assert.ok(!src.includes("badge('عميل/ة سابق/ة'"));
  });

  test('case and matter pages: the uploader, the send button, the outcome card and the matter copy follow the noun', async () => {
    const cd = read(`${APP}pages/admin/case-detail.js`);
    assert.match(cd, /d\.uploaded_by_kind === 'client' \? badge\(N\.def, 'neutral', \{ dot: true \}\)/);
    assert.match(cd, /activityTimeline\(data\.activity, \{ clientLabel: N\.def \}\)/);
    assert.ok(cd.includes("title: 'حالات مشابهة تعاملنا معها'"));
    assert.ok(!cd.includes('تتابعه المؤسسة'));
    const md = read(`${APP}pages/admin/matter-detail.js`);
    assert.match(md, /const N = clientNoun\(segValue, \{ company: Boolean\(seg\.company\) \}\);/);
    assert.match(md, /outcomeCard\(\{ kind: 'matter', id: m\.id, paid: !isCharity \}\)/);
    assert.match(md, /دون بيانات تواصل \$\{N\.def\} أو الفواتير/);
    // no hard-coded beneficiary words left in the matter page code (comments aside)
    const code = md.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.doesNotMatch(code, /'[^'\n]*(المستفيد\/ة|للمستفيد\/ة)[^'\n]*'/);
    const SD = await import('../public/assets/js/app/components/send-document.js');
    const paidBtn = SD.sendDocumentButton({ id: 1, title: 'عقد' }, { sendInfo: { segment: 'paid' } });
    assert.equal(text(paidBtn), 'إرسال لصاحب الطلب');
    assert.equal(text(SD.sendDocumentButton({ id: 1, title: 'عقد' }, { sendInfo: { segment: 'charity' } })), 'إرسال للمستفيد/ة');
    const O = await import('../public/assets/js/app/components/outcome.js');
    assert.equal(O.outcomeFields({ paid: true })[0].label, 'الأثر المتحقق لصاحب الطلب');
  });
});

describe('v12 gate r2 (staff) V-09 — every source_detail value the v12 website intake writes reads in Arabic', () => {
  test('server + UI: pathway, tiles, callback and an unknown pathway → Arabic key and value (no Latin)', async () => {
    const D = await import('../public/assets/js/app/pages/admin/intake-detail.js');
    const t = await startTestApp();
    try {
      let n = 0;
      const post = (body) => t.client().post('/api/public/intake', { consent: true, consent_v: 1, description: 'وصف كاف للموضوع هنا للاختبار من الموقع.', submission_id: `wv12gates${String(++n).padStart(14, '0')}`, ...body });
      const bodies = [
        { phone: '01011223301', pathway: 'litigation/defend/family', answers: { 'case.next': 'soon' }, mode: 'tiles' },
        { phone: '01011223302', pathway: 'consultation/family/divorce', mode: 'guided' },
        { phone: '01011223303', pathway: 'nowhere/at-all', mode: 'tiles' },
        { phone: '01011223304', mode: 'callback', callback: 'morning', description: '' },
        { phone: '01011223305', segment: 'paid', mode: 'form' },
      ];
      let seen = 0;
      for (const b of bodies) {
        const r = await post(b);
        assert.ok(r.status === 200 || r.status === 201, `${JSON.stringify(b)} → ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
        const row = t.app.db.get("SELECT source_detail FROM intakes WHERE first_channel = 'website' ORDER BY updated_at DESC, id DESC LIMIT 1");
        const detail = JSON.parse(row.source_detail || '{}');
        for (const [k, v] of Object.entries(detail)) {
          if (D.isInternalSourceKey(k)) continue;
          const keyLabel = D.SOURCE_DETAIL_LABELS[k];
          assert.ok(keyLabel, `label for ${k}`);
          const val = D.sourceDetailValue(k, v);
          assert.ok(val != null, `value of ${k}=${v} is mapped`);
          assert.doesNotMatch(String(val), /[A-Za-z]/, `${k}=${v} → ${val}`);
          seen++;
        }
      }
      assert.ok(seen >= 12, `${seen} rows checked`);
      assert.equal(D.sourceDetailValue('intake_mode', 'tiles'), 'سؤال في كل شاشة');
      assert.equal(D.sourceDetailValue('gate_via', 'pathway'), 'من أسئلة الصفحة الأولى');
    } finally {
      await t.close();
    }
  });
});

describe('v12 gate r2 (staff) V-11 — one title rule: static titles in the display face, record titles (user data) in the UI face', () => {
  test('pageHeader({ record }) → .is-record; every record page passes it; the CSS keys on it, not on «has breadcrumbs»', async () => {
    const UI = await import(UI_PATH);
    assert.ok(UI.pageHeader({ title: 'أم يوسف', record: true }).classList.contains('is-record'));
    assert.ok(!UI.pageHeader({ title: 'الإعدادات' }).classList.contains('is-record'));
    for (const f of ['intake-detail', 'case-detail', 'client-detail', 'matter-detail', 'company-detail', 'lawyer-detail', 'programs', 'company-request', 'knowledge-detail']) assert.match(read(`${APP}pages/admin/${f}.js`), /record: true/, f);
    const desk = css('v10-desk.css');
    assert.match(desk, /\.page-header\.is-record \.page-title,\s*\.lc-head\.is-record \.page-title,\s*\.pa-page-dashboard \.page-title \{ font: 600 26px\/1\.4 var\(--f-ui\); \}/);
    assert.ok(!desk.includes(':has(.breadcrumbs) .page-title'));
    assert.match(read(`${APP}pages/lawyer/matter.js`), /'header\.lc-head\.is-record'/);
    assert.match(read(`${APP}pages/lawyer/assignments.js`), /h1\.lh-h1\.lh-page-h1\.page-title/);
  });

  test('/company: pageHead gives a static title .page-title (display face, v10-company.css); greeting and item titles pass record', () => {
    const common = read('public/assets/js/company/common.js');
    assert.match(common, /h\('h1\.co-h1', \{ class: !record && 'page-title', tabindex: '-1', tag: 'CC-37' \}, title\)/);
    for (const f of ['overview', 'memory-item', 'memory-edit']) assert.match(read(`public/assets/js/company/pages/${f}.js`), /record: true/, f);
    assert.match(css('v10-company.css'), /@media screen \{\n {2}\.page-title \{\n {4}font: var\(--d2\);/);
  });
});

describe('v12 gate r2 (staff) V-12 / JR-13 — the phone top bar never squeezes the title to «الـ…»', () => {
  test('below 600 px the staff bar drops its title (the page h1 shows it) and keeps the actions at the end', () => {
    const look = css('v10-desk.css'); // staff-only rules: /app sheet (the /company CSS budget)
    assert.match(look, /@media \(max-width: 599px\) \{\n\s+\.app-shell:not\(\.is-lawyer\) \.topbar-title \{ display: none; \}\n\s+\.app-shell:not\(\.is-lawyer\) \.topbar-actions \{ margin-inline-start: auto; \}/);
  });
});

describe('v12 gate r2 (staff) V-15 — phone inbox rows: one bordered action, words, 44-px name and chips, fading scrollers, one topic line', () => {
  test('inbox.js + v12-look.css', () => {
    const src = read(`${APP}pages/admin/inbox.js`);
    assert.match(src, /b\.classList\.toggle\('btn--line', on && b === main\);/);
    assert.match(src, /b\.classList\.toggle\('is-phone-dup', on && b !== main\)/);
    assert.match(src, /!\(summary\.classList\.contains\('is-form'\) && summary\.textContent\.includes\(st\.topic_label\)\)/);
    const desk = css('v10-desk.css');
    assert.match(desk, /\.pa-story-actions \.btn\.is-phone-dup \{ display: none; \}/);
    assert.match(desk, /\.pa-story-name \{ min-height: 44px; \}/);
    assert.match(desk, /\.pa-story-filters \{ padding-block: 4px; \}/);
    // end padding on both scrollers (the scope row needs v11-ui's :has() to out-rank its padding: 0); no gradient fade (K12 d)
    assert.match(desk, /\.pa-story-filters, \.scope-tabs, \.segmented\.pa-tabs:has\(> \.seg:nth-child\(5\)\) \{ padding-inline-end: 28px; \}/);
    assert.doesNotMatch(desk.replace(/\/\*[\s\S]*?\*\//g, ''), /mask-image/);
    // the «اقتراح» word rule must follow v11-segment.css's pill rule of equal specificity → v12-look.css (linked last)
    assert.match(css('v12-look.css'), /\.pa-ai-tag, :is\(\.pa-story, \.pa-irow, #pa-proposal\) \.pa-ai-tag \{ padding: 0; border-radius: 0; background: none;/);
  });
});

describe('v12 gate r2 (staff) V-24 / V-25 / V-26 / V-27 — contrast, no icon circles, one filled action, readable key/value rows', () => {
  test('V-24: chart colours from the palette, value labels in ink; the version line at full opacity, 13 px, ink-2', () => {
    const d = css('pages-d.css').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(d, /--pd-c1: var\(--primary-700\);/);
    assert.match(d, /--pd-c3: var\(--primary-300\);/);
    assert.ok(!d.includes('#00809d') && !d.includes('#5d55b8'));
    assert.match(/\.pd-chart-val \{[^}]*\}/.exec(d)[0], /color: var\(--ink\);/);
    assert.match(css('v10-desk.css'), /\.sidebar-version \{ opacity: 1; color: var\(--ink-2\); font-size: 13px; \}/);
  });

  test('V-25: health checks are state dot + word; simulator steps a plain list; tags page ruled groups with mono codes; no flag in «المطلوب منك»', () => {
    const sys = read(`${APP}pages/admin/system.js`);
    assert.match(sys, /h\('span\.state\.pf-check-state', \{ class: `state--\$\{STATE_OF\[c\.level\] \|\| 'info'\}` \}, st\.text\)/);
    assert.ok(!sys.includes("h('span.pf-check-icon'"));
    assert.match(read(`${APP}pages/admin/simulator.js`), /h\('span\.pa-step-n', `\$\{i \+ 1\}\.`\)/);
    const tg = read(`${APP}pages/admin/tags.js`);
    assert.match(tg, /\.tgs-group\{[^}]*border-radius:2px;background:none/);
    assert.match(tg, /\.tgs-row>\.btn\{[^}]*border:0;border-radius:0;background:none;[^}]*font-family:var\(--font-mono/);
    assert.ok(!/border-radius:12px/.test(tg));
    assert.match(read(`${APP}pages/lawyer/assignment.js`), /h\('h2\.lw-sec-title', \{ tag: 'ASG-19' \}, 'المطلوب منك'\)/);
    const look = css('v10-desk.css');
    assert.match(look, /\.pa-step-n \{ width: auto; height: auto;[^}]*border-radius: 0; background: none;/);
    assert.match(look, /\.pc-doc-icon \{ width: auto; height: auto; border-radius: 0; background: none;/);
  });

  test('V-26: lawyer «اليوم» — one filled action in the list; the meta line wraps without a stranded «·»', () => {
    const src = read(`${APP}pages/lawyer/home.js`);
    assert.match(src, /const variant = c\.button\.kind === 'primary' && primaryOk \? 'primary' : 'secondary';/);
    assert.match(src, /actionRow\(a, \{ primaryOk: !visible\.slice\(0, i\)\.some\(\(b\) => actionCopy\(b\)\.button\?\.kind === 'primary'\) \}\)/);
    assert.match(src, /if \(wrap\) return h\('span\.lh-sub-in', parts\.map\(\(p\) => h\('span\.lh-sub-part', h\('span\.lh-sep', \{ 'aria-hidden': 'true' \}, '·'\), subPart\(p\)\)\)\);/);
    const lh = css('v91-l-home.css');
    assert.match(lh, /\.lh-sub-in \{[^}]*margin-inline-start: -1\.1em;/);
    assert.match(lh, /\.lh-sub-part > \.lh-sep \{\n\s+width: 1\.1em;/);
    assert.match(lh, /\.lh-row-sub\.is-wrap \{\n\s+display: block;/);
  });

  test('V-27: integrations rows keep a 160-px label column and let long values wrap', () => {
    const look = css('v10-desk.css');
    assert.match(look, /\.pf-field \{ grid-template-columns: minmax\(160px, 40%\) minmax\(0, 1fr\); \}/);
    assert.match(look, /\.pf-page \.pf-field-value \.code-tag, \.pf-page \.pf-field-value \.code-tag\.pf-nowrap, \.pf-page \.pf-field-meta \.code-tag \{ max-width: 100%; white-space: normal; overflow-wrap: anywhere; \}/);
  });
});

describe('v12 gate r2 (staff) TA-02 / TA-06 / TA-07 — the overlay keeps its own font, skips covered elements, and never parks on a fixed bar', () => {
  // (0,1,2) = body.pub button — the public reset that used to win over .bmt-badge (0,1,0)
  const spec = (sel) => {
    const s = sel.replace(/::?[\w-]+(\([^)]*\))?/g, (m) => (m.startsWith('::') ? '' : ' .x'));
    return [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length, (s.match(/(^|[\s>+~])[a-z]+/gi) || []).length];
  };
  const beats = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  test('TA-02: badge, ghost and tab font rules out-rank body.pub button and carry !important on font', () => {
    const src = read('public/assets/js/lib/tags.js');
    const m = /\.bmt-layer \.bmt-badge\.bmt-badge,\.bmt-layer \.bmt-ghost\.bmt-ghost\{font:700 11px\/1 ui-monospace[^}]*!important;/.exec(src);
    assert.ok(m, 'badge/ghost rule');
    assert.ok(beats(spec('.bmt-layer .bmt-badge.bmt-badge'), spec('body.pub button')) > 0);
    assert.ok(beats(spec('button.bmt-fab.bmt-fab'), spec('body.pub button')) > 0);
    assert.match(src, /button\.bmt-fab\.bmt-fab\{font:600 13px\/1 "IBM Plex Sans Arabic",system-ui,sans-serif!important;/);
  });

  test('TA-06: the miss loop skips what the crawl counts as covered (field units, summary of tagged details, dialog/empty-state titles)', () => {
    const src = read('public/assets/js/lib/tags.js');
    assert.match(src, /if \(covered\(n\)\) continue;/);
    assert.match(src, /function covered\(n\) \{/);
    assert.match(src, /if \(n\.tagName === 'SUMMARY' && n\.parentElement && n\.parentElement\.hasAttribute\('data-tag'\)\) return true;/);
    assert.match(src, /\[role=radio\],\[role=checkbox\],\[role=option\]/);
  });

  test('TA-07: with no free spot the tab prefers a spot that covers only scrolling content (never a fixed or sticky control)', () => {
    const src = read('public/assets/js/lib/tags.js');
    assert.match(src, /if \(p === 'fixed' \|\| p === 'sticky'\) return true;/);
    assert.match(src, /if \(c === 1 && fallback === null\) fallback = y;/);
    assert.match(src, /if \(fallback !== null && fallback !== r0\.top\) fab\.style\.top = `\$\{Math\.round\(fallback\)\}px`;/);
  });
});

describe('v12 gate r2 (staff) TA-03 / TA-05 — one code per item in menus, sheets, tiles and choice options', () => {
  test('TA-03: every company team action has its own literal code, on the desktop menu and in the phone sheet', () => {
    const src = read('public/assets/js/company/pages/team.js');
    const fn = /function actionsOf\(u, ctx\) \{([\s\S]*?)\n\}/.exec(src)[1];
    const codes = [...fn.matchAll(/tag: '(CT-\d+)'/g)].map((m) => m[1]);
    assert.ok(codes.length >= 8, `${codes.length} action codes`);
    assert.equal(new Set(codes).size, codes.length, 'distinct');
    assert.match(src, /tag: it\.tag \|\| 'CT-21' \}\)\)\),/);
    distinct(tagMap(src, 'ROLE_OPTION_TAGS'), 3, 'roles');
  });

  test('TA-05: dashboard, settings, company sidebar/memory/overview, story sheet and the month picker', () => {
    const dash = read(`${APP}pages/admin/dashboard.js`);
    distinct([...(/const DECISIONS = \[([\s\S]*?)\]\.map/.exec(dash)[1]).matchAll(/key: '(\w+)'[^}]*tag: '([A-Z]+-\d+)'/g)].map((m) => [m[1], m[2]]), 7, 'DECISIONS');
    distinct(tagMap(dash, 'CASE_ROW_TAGS'), 7, 'CASE_ROW_TAGS');
    distinct(tagMap(dash, 'LINE_ROW_TAGS'), 4, 'LINE_ROW_TAGS');
    const segRows = [...dash.matchAll(/row\(\{[\s\S]*?tag: '(DSH-\d+)'/g)].map((m) => m[1]);
    assert.equal(new Set(segRows).size, 4, `segment strip rows ${segRows}`);
    const brand = read(`${APP}components/brand-settings.js`);
    const pick = /const PICKER_TAGS = \{ primary: \{ color: '(SET-\d+)', hex: '(SET-\d+)' \}, accent: \{ color: '(SET-\d+)', hex: '(SET-\d+)' \} \};/.exec(brand);
    assert.ok(pick);
    assert.equal(new Set(pick.slice(1)).size, 4);
    distinct(tagMap(read('public/assets/js/company/shell.js'), 'MEMORY_NAV_TAGS'), 9, 'MEMORY_NAV_TAGS');
    distinct(tagMap(read('public/assets/js/company/pages/memory.js'), 'MEMORY_TILE_TAGS'), 11, 'MEMORY_TILE_TAGS');
    distinct(tagMap(read('public/assets/js/company/pages/memory-list.js'), 'SELECT_TAGS'), 3, 'SELECT_TAGS');
    distinct(tagMap(read('public/assets/js/company/pages/overview.js'), 'QUICK_TAGS'), 4, 'QUICK_TAGS');
    distinct(tagMap(read(`${APP}components/story-sheet.js`), 'TRACK_OPTION_TAGS'), 5, 'TRACK_OPTION_TAGS');
    assert.match(read(`${APP}pages/admin/accounting.js`), /periodSelect\(\{\n\s+label: 'الفترة المحاسبية',\n\s+tag: 'ACC-\d+',/);
    assert.match(read(`${APP}pages/admin/lawyers.js`), /export function periodSelect\(\{ value, onChange, label: aria = 'الشهر', allLabel = null, months = 18, tag \} = \{\}\) \{/);
  });

  test('the story sheet passes each track its own code (choiceTiles keeps option tags)', async () => {
    const S = await import('../public/assets/js/app/components/story-sheet.js');
    assert.equal(S.trackLabel('need_info', 'f', { paid: true }), 'نسأل أولًا');
    assert.equal(S.trackLabel('need_info', 'f'), LABELS.story_track.need_info);
    assert.match(read(`${APP}components/story-sheet.js`), /tag: TRACK_OPTION_TAGS\[t\]\?\.tag,/);
  });
});

describe('v12 gate r2 (staff) — staff-only CSS stays out of the /company download', () => {
  test('the moved staff rules are in v10-desk.css (linked by /app only), not in v12-look.css; company.html does not link v10-desk.css', () => {
    const look = css('v12-look.css');
    for (const sel of ['.pf-check', '.pf-field', '.pa-step-n', '.sidebar-version', '.topbar-title', '.pa-story-actions', '.line-suggest', '.pa-filters-desk', '.doc-variant-slot']) {
      assert.ok(!look.replace(/\/\*[\s\S]*?\*\//g, '').includes(sel), `${sel} not in v12-look.css`);
      assert.ok(css('v10-desk.css').includes(sel), `${sel} in v10-desk.css`);
    }
    assert.ok(read('public/app.html').includes('/assets/css/v10-desk.css'));
    assert.ok(!read('public/company.html').includes('v10-desk.css'));
    assert.doesNotMatch(look, /gradient\(/);
  });
});
