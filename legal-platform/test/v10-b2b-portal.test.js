// v10 b2b-portal — بوابة الشركات /company (المرجع: scratchpad/v10-spec.md §8 و§8.5). اختبارات بلا متصفح: الصفحة والرؤوس،
// جدول المسارات، فحص النصوص (الفصحى، L-50، CO-21، الأزرار مصادر)، قاعدة التخزين (L-47)، الألوان والذهبي (L-63)، الميزانيات
// (§8.4)، مكونات company-ui.js الخالصة بـ DOM مصغّر، الخصوصية، نصوص البريد (CO-2)، تطابق الوعد (CO-10)، الأوراق (L-64).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestApp, Client, freezeClock, resetClock } from './helpers.js';
import { CSP_APP } from '../src/http.js';
import { setPublicRoot, transformAsset, preloadClosure } from '../src/site-assets.js';
import { COMPANY_DEMO_PASSWORD } from '../src/seed-v10-b2b.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const JS = path.join(PUB, 'assets/js');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
const served = (abs) => br(transformAsset(abs));
const rel = (abs) => path.relative(ROOT, abs);

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
/** وحدات البوابة: company/** ومكونات company-*.js التي تخصها */
const COMPANY_DIR = path.join(JS, 'company');
const PORTAL_LIBS = ['company-ui.js', 'company-ui-core.js', 'company-forms.js'].map((f) => path.join(JS, 'lib', f));
const portalFiles = () => [...walk(COMPANY_DIR), ...PORTAL_LIBS];
/** النص بلا تعليقات (الشروح الداخلية تذكر «الفواتير» المؤجلة مثلًا؛ الفحص على ما يُعرض) */
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/\s.*$/, ''))
    .join('\n');

/** عميل البوابة: يحفظ كعكة bm_csid */
class CompanyClient extends Client {
  async request(method, url, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    } else if (method !== 'GET' && method !== 'HEAD') {
      payload = '{}';
      h['content-type'] = 'application/json';
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const m = /bm_csid=([^;]*)/.exec(res.headers.get('set-cookie') || '');
    if (m) this.cookie = m[1] ? `bm_csid=${m[1]}` : '';
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  }
  async login(email, password = COMPANY_DEMO_PASSWORD) {
    const r = await this.post('/api/company/auth/login', { email, password });
    assert.equal(r.status, 200, `login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  }
}

// ───────────────────────── DOM مصغّر (يكفي h() وbadge/icon/kRow) ─────────────────────────
function installDom() {
  class FakeNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
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
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    }
    append(...cs) {
      for (const c of cs) this.appendChild(typeof c === 'string' ? globalThis.document.createTextNode(c) : c);
    }
    replaceChildren(...cs) {
      this.childNodes = [];
      this.append(...cs);
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
    removeAttribute(k) {
      delete this.attrs[k];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }
    all() {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(sel.trim());
      if (!m) return [];
      const cls = m[2].split('.').filter(Boolean);
      return this.all().filter((e) => (!m[1] || e.tagName === m[1].toUpperCase()) && cls.every((c) => e.classList.contains(c)));
    }
  }
  const body = new FakeEl('body');
  globalThis.document = {
    body,
    activeElement: body,
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
    createDocumentFragment: () => new FakeEl('#fragment'),
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.Node = FakeNode;
  return { body };
}
function memoryStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    keys: () => [...m.keys()],
  };
}

// ───────────────────────── §8.5-1 الصفحة /company ─────────────────────────

describe('v10 b2b-portal — the /company page (§8.1, §8.5-1)', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
  });
  after(async () => {
    await t?.close();
  });

  test('200 with the platform CSP, no inline script, manifest, title «بوابة الشركات — Emam Legal», noindex, versioned assets, ETag/304; /company/ the same', async () => {
    let first = null;
    for (const p of ['/company', '/company/']) {
      const r = await fetch(`${t.base}${p}`);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('content-security-policy'), CSP_APP, `${p}: the platform CSP`);
      assert.match(CSP_APP, /script-src 'self'(;|$)/);
      assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
      const html = await r.text();
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
      assert.ok(scripts.length >= 1);
      for (const [, attrs, inner] of scripts) {
        const isData = /type="application\/json"/.test(attrs);
        assert.ok(/\bsrc="/.test(attrs) || isData, `${p}: inline <script ${attrs.trim()}>`);
        if (!isData) assert.equal(inner.trim(), '', `${p}: a src script carries no body`);
      }
      assert.match(html, /<link rel="manifest" href="\/company\.webmanifest"/);
      assert.equal((/<title>([^<]*)<\/title>/.exec(html) || [])[1], 'بوابة الشركات — Emam Legal');
      assert.match(html, /<html lang="ar" dir="rtl">/);
      assert.match(html, /<script type="module" src="\/assets\/js\/company\/main\.js\?v=[\w-]+"><\/script>/, 'versioned entry');
      for (const css of ['app', 'v10-experience', 'v10-company']) assert.match(html, new RegExp(`href="/assets/css/${css}\\.css\\?v=[\\w-]+"`), css);
      assert.doesNotMatch(html, /\{\{|<!--bm:head-->/, 'template placeholders replaced');
      assert.doesNotMatch(html, /\b(?:src|href)="(?:https?:)?\/\//, 'no third-party origin');
      assert.match(html, /<link rel="modulepreload" href="\/assets\/js\/[^"]+\?v=/, 'the static closure is preloaded');
      const etag = r.headers.get('etag');
      assert.ok(etag, 'ETag');
      const again = await fetch(`${t.base}${p}`, { headers: { 'if-none-match': etag } });
      assert.equal(again.status, 304, `${p}: 304 on a matching ETag`);
      if (first == null) first = html;
      else assert.equal(html, first, '/company/ serves the same page');
    }
    const man = await fetch(`${t.base}/company.webmanifest`);
    assert.equal(man.status, 200);
    const mj = await man.json();
    assert.equal(mj.scope, '/company');
  });

  test('a saved custom colour pair puts exactly one bm-theme block in <head> and the theme-color follows; none before', async () => {
    const before = await (await fetch(`${t.base}/company`)).text();
    assert.doesNotMatch(before, /id="bm-theme"/);
    const admin = await t.login('admin');
    const put = await admin.put('/api/admin/brand/colors', { primary: '#6a1b9a', accent: '#f9a825' });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const html = await (await fetch(`${t.base}/company`)).text();
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal([...html.matchAll(/<style id="bm-theme"/g)].length, 1);
    assert.ok(head.includes('id="bm-theme"'), 'first paint');
    assert.match(html, /<meta name="theme-color" content="#6a1b9a"/);
    await admin.post('/api/admin/brand/colors/reset', {}).catch(() => {});
  });

  test('no service-worker registration anywhere in company/** (U10-A12)', () => {
    for (const f of portalFiles()) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /serviceWorker|navigator\.serviceWorker|\.register\(/, rel(f));
    assert.doesNotMatch(read('public/company.html'), /serviceWorker|sw\.js/);
  });
});

// ───────────────────────── §8.5-2 جدول المسارات ─────────────────────────

describe('v10 b2b-portal — route table (U10-08, §8.5-2)', () => {
  let R;
  before(async () => {
    R = await import('../public/assets/js/company/routes.js');
  });

  test('covers U10-08 minus the deferred /billing, /billing/:id and /activity; every route has a title; role-gated routes declare roles', () => {
    const paths = R.COMPANY_ROUTES.map((r) => r.path);
    for (const p of ['/overview', '/requests', '/requests/new', '/requests/new/:type', '/requests/:code', '/memory', '/team', '/plan', '/company', '/notifications', '/account', '/more']) assert.ok(paths.includes(p), `missing ${p}`);
    for (const p of paths) assert.doesNotMatch(p, /^\/(billing|activity|invoices)/, `deferred route present: ${p}`);
    assert.equal(new Set(paths).size, paths.length, 'no duplicate path');
    // رابط غير معروف ← شاشة U10-82 نفسها: المسارات العامة في آخر الجدول فلا تحجب مسارًا حقيقيًا
    const firstCatchAll = paths.findIndex((p) => /^(\/:[a-z])+$/.test(p));
    assert.ok(firstCatchAll > 0, 'catch-all routes present');
    assert.ok(paths.slice(firstCatchAll).every((p) => /^(\/:[a-z])+$/.test(p)), 'catch-all routes come last');
    for (const r of R.COMPANY_ROUTES) {
      assert.equal(typeof r.title, 'string', r.path);
      assert.ok(r.title.trim().length > 0, `${r.path} has a title`);
      assert.equal(typeof r.load, 'function', `${r.path} loads a page`);
      if (r.roles) assert.ok(Array.isArray(r.roles) && r.roles.length > 0 && r.roles.every((x) => ['company_admin', 'member', 'viewer'].includes(x)), r.path);
    }
    const by = Object.fromEntries(R.COMPANY_ROUTES.map((r) => [r.path, r]));
    assert.equal(by['/overview'].title, 'المتابعة');
    assert.equal(by['/requests'].title, 'الطلبات');
    assert.equal(by['/plan'].title, 'الباقة والاستخدام');
    assert.equal(by['/account'].title, 'حسابي والأمان');
    assert.deepEqual([...by['/requests/new'].roles].sort(), ['company_admin', 'member']);
    assert.deepEqual([...by['/requests/new/:type'].roles].sort(), ['company_admin', 'member']);
    assert.deepEqual(by['/team'].roles, ['company_admin']);
    assert.equal(by['/requests'].roles, undefined, 'all roles');
    assert.equal(by['/overview'].prefetchGet(), '/company/home', 'home data fired with the route');
    for (const p of ['/requests/new', '/requests/new/:type']) assert.equal(by[p].pill, false, `${p}: no second «طلب جديد» on its own screen`);
  });

  test('the auth screens are outside the routed shell', () => {
    assert.deepEqual([...R.AUTH_SCREENS], ['/login', '/login/2fa', '/forgot', '/invite/:token', '/reset/:token']);
  });
});

// ───────────────────────── §8.5-3 النصوص ─────────────────────────

describe('v10 b2b-portal — copy lint (U10-A19, L-50, CO-21, §8.5-3)', () => {
  const COLLOQUIAL = ['مش', 'عايز', 'عايزين', 'دلوقتي', 'إزاي', 'ازاي', 'حضرتك', 'فين'];
  const AR = '\\u0600-\\u06FF';
  const word = (w) => new RegExp(`(^|[^${AR}])${w}(?=[^${AR}]|$)`);
  const OLD_ROLE = /مسؤول حساب|مسؤول الحساب|مسؤولو الحساب/;

  test('no colloquial word in any module of the portal closure, the catalogue and the two-factor copy', async () => {
    const files = [...portalFiles(), path.join(JS, 'lib/company-catalog.js'), path.join(JS, 'lib/company-catalog-fields.js')];
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const w of COLLOQUIAL) assert.doesNotMatch(s, word(w), `${rel(f)}: «${w}»`);
    }
    const { W } = await import('../public/assets/js/company/words-flows.js');
    const tf = JSON.stringify(W.twoFactor);
    assert.ok(tf.length > 100, 'the two-factor copy set exists');
    for (const w of COLLOQUIAL) assert.doesNotMatch(tf, word(w), `twoFactor: «${w}»`);
  });

  test('L-50: no «مسؤول حساب/الحساب» in the portal, the catalogue, company notifications and e-mail templates; «مدير علاقتكم لدينا» and «مدير البوابة» are used', async () => {
    for (const f of [...portalFiles(), path.join(JS, 'lib/company-catalog.js'), path.join(JS, 'lib/company-catalog-fields.js'), path.join(ROOT, 'src/services/company-notify.js'), path.join(ROOT, 'src/services/email.js')]) {
      assert.doesNotMatch(fs.readFileSync(f, 'utf8'), OLD_ROLE, rel(f));
    }
    const { W } = await import('../public/assets/js/company/words-flows.js');
    assert.equal(W.nav.manager, 'مدير علاقتكم لدينا: {name}');
    assert.match(W.state.admins_route, /مديري البوابة/);
  });

  test('CO-21: no «الفواتير» or «مطالبة الشهر» shown anywhere in the portal', () => {
    for (const f of portalFiles()) {
      const s = stripComments(fs.readFileSync(f, 'utf8'));
      assert.doesNotMatch(s, /الفواتير|مطالبة الشهر/, rel(f));
    }
  });

  test('every button label starts with a verbal noun from the allow-list (or is a listed exception)', async () => {
    const { W } = await import('../public/assets/js/company/words-pages.js');
    const VERBAL = new Set(
      'إعادة العودة عودة تسجيل حفظ تفعيل تأكيد استخدام إرسال إخفاء إظهار عرض مسح تطبيق تعليم إرفاق تراجع الموافقة موافقة رفض مناقشة اعتماد طلب فتح مراجعة الرد رد إضافة تعديل حذف إلغاء إغلاق تنزيل نسخ دعوة متابعة المتابعة اختيار تغيير إنهاء بدء تحميل تصعيد الخروج خروج تحديث بحث انتقال الانتقال إكمال استكمال متابعة رفع رجوع إيقاف إنشاء أرشفة الذهاب'.split(
        ' ',
      ),
    );
    // اختيارات بند الاستيضاح كما في UX §5.7، و«فهمت» لإغلاق ورقة المعلومة
    // وأزرار الترحيب بنصها في UX §5.3 («لاحقًا»، «البيانات صحيحة»، «لا توجد كيانات أخرى»)
    const EXCEPTIONS = new Set(['state.understood', 'clarification.unavailable', 'clarification.yes_missing', 'clarification.will_attach', 'welcome.later', 'welcome.correct', 'welcome.no_entities']);
    const get = (k) => k.split('.').reduce((v, p) => v?.[p], W);
    const RE = /(?:button\(\s*|\{\s*label:\s*(?=W\.[\w.]+,\s*variant)|(?:confirmLabel|cancelLabel|submitLabel|doneLabel):\s*)(?:W\.([\w.]+)|copy\('([\w.]+)')/g;
    const seen = new Map();
    for (const f of portalFiles()) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(RE)) {
        let k = m[1] || m[2];
        if (/^N\./.test(k)) continue;
        if (typeof get(k) !== 'string') continue;
        seen.set(k, rel(f));
      }
      // الاختصارات: N = W.newRequest في new-request.js، و«const T = W.team;» وأمثالها في صفحات build-2
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:button\(\s*|(?:confirmLabel|cancelLabel):\s*)N\.([\w]+)/g)) seen.set(`newRequest.${m[1]}`, rel(f));
      const src = fs.readFileSync(f, 'utf8');
      for (const [, alias, group] of src.matchAll(/const\s+([A-Z][A-Z0-9]?)\s*=\s*W\.(\w+);/g)) {
        if (alias === 'N') continue;
        const re = new RegExp(`(?:button\\(\\s*|(?:confirmLabel|cancelLabel|submitLabel):\\s*)${alias}\\.(\\w+)|\\{\\s*label:\\s*${alias}\\.(\\w+),\\s*variant`, 'g');
        for (const m of src.matchAll(re)) {
          const k = `${group}.${m[1] || m[2]}`;
          if (typeof get(k) === 'string') seen.set(k, rel(f));
        }
      }
    }
    assert.ok(seen.size >= 25, `scanned ${seen.size} button labels`);
    for (const [k, f] of seen) {
      if (EXCEPTIONS.has(k)) continue;
      const v = get(k);
      assert.equal(typeof v, 'string', `${f}: ${k} resolves to a string`);
      const first = v.trim().split(/[\s،]+/)[0];
      assert.ok(VERBAL.has(first), `${f}: «${v}» (${k}) does not start with a verbal noun`);
    }
  });
});

// ───────────────────────── §8.5-4 التخزين ─────────────────────────

describe('v10 b2b-portal — storage rule (L-47, §8.5-4)', () => {
  let St;
  let ls;
  let ss;
  before(async () => {
    ls = memoryStorage();
    ss = memoryStorage();
    globalThis.window = { localStorage: ls, sessionStorage: ss, location: { hash: '#/overview' } };
    St = await import('../public/assets/js/company/state.js');
  });
  after(() => {
    delete globalThis.window;
  });

  test('static scan: only ek.co.draft:, ek.co.return, ek.co.setup:, ek.co.intro:, ek.co.view: keys; storage touched through state.js only', () => {
    const ALLOWED = /^ek\.co\.(draft:|return$|setup:|intro:|view:)/;
    let n = 0;
    for (const f of [...portalFiles(), path.join(JS, 'lib/company-catalog.js'), path.join(JS, 'lib/company-catalog-fields.js')]) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/['"`](ek\.[^'"`$]*)/g)) {
        n++;
        assert.match(m[1], ALLOWED, `${rel(f)}: storage key ${m[1]}`);
      }
      for (const m of s.matchAll(/['"`]((?:bm|bayout|co)[.:_-][\w.:-]*)['"`]\s*[,)]/g)) {
        assert.ok(!/(?:get|set|remove)Item\(\s*['"`]/.test(s.slice(Math.max(0, m.index - 40), m.index + 1)), `${rel(f)}: foreign storage key ${m[1]}`);
      }
      if (!f.endsWith(`${path.sep}state.js`)) {
        const code = stripComments(s);
        assert.doesNotMatch(code, /\b(?:window\.)?(?:localStorage|sessionStorage)\s*[.[]/, `${rel(f)}: storage is reached through state.js`);
        assert.doesNotMatch(code, /indexedDB|document\.cookie|caches\./, rel(f));
      }
    }
    assert.ok(n >= 5);
  });

  test('ek.co.return is accepted only when it starts with #/ (and never a sign-in or link screen)', () => {
    for (const ok of ['#/requests', '#/requests/NFD-0001', '#/memory/calendar']) assert.equal(St.safeReturn(ok), true, ok);
    for (const bad of ['https://evil.example/#/x', '/company#/x', 'javascript:alert(1)', '#requests', '', null, '#/login', '#/invite/abc', '#/reset/abc', '#/forgot', `#/${'x'.repeat(400)}`]) assert.equal(St.safeReturn(bad), false, String(bad));
    ss.setItem(St.RETURN_KEY, 'https://evil.example');
    St.storageHygiene();
    assert.equal(ss.getItem(St.RETURN_KEY), null, 'a foreign return value is dropped at boot');
    globalThis.window.location.hash = '#/requests/TSL-0001';
    St.rememberReturn();
    assert.equal(ss.getItem(St.RETURN_KEY), '#/requests/TSL-0001');
    assert.equal(St.takeReturn(), '#/requests/TSL-0001');
    assert.equal(ss.getItem(St.RETURN_KEY), null, 'taken once');
    St.rememberReturn('#/login');
    assert.equal(ss.getItem(St.RETURN_KEY), null);
  });

  test('the draft keeps text and upload ids only — never data_base64, a File or a Blob', () => {
    St.setSession({ user: { id: 7, role: 'member' }, company: { id: 1 } });
    const blob = new Blob(['x'.repeat(10)]);
    St.writeDraft({ step: 2, type: 'nda', title: 'اتفاقية', fields: { counterparty: 'شركة الدلتا' }, uploads: [{ upload_id: 'u1', filename: 'a.pdf', data_base64: 'QUJD', file: blob }], blob });
    const raw = ls.getItem('ek.co.draft:7');
    assert.ok(raw);
    assert.doesNotMatch(raw, /data_base64|QUJD/);
    const d = JSON.parse(raw);
    assert.equal(d.uploads[0].upload_id, 'u1');
    assert.equal('file' in d.uploads[0], false);
    assert.equal('blob' in d, false);
    assert.equal(St.readDraft().type, 'nda');
    // ثابت: new-request.js لا يحفظ إلا معرّفات المرفقات
    const nr = stripComments(read('public/assets/js/company/pages/new-request.js'));
    assert.doesNotMatch(nr, /writeDraft\([^)]*data_base64/);
  });

  test('boot (after the session is known) removes other users’ drafts and an expired own draft; logout removes the user’s draft', () => {
    const old = Date.now() - 8 * 86400000;
    ls.setItem('ek.co.draft:8', JSON.stringify({ type: 'nda', saved_at: Date.now() }));
    ls.setItem('ek.co.draft:7', JSON.stringify({ type: 'nda', saved_at: Date.now() }));
    ls.setItem('ek.co.view:7:scope', 'mine');
    St.storageHygiene(7);
    assert.equal(ls.getItem('ek.co.draft:8'), null, 'another user’s draft is removed');
    assert.ok(ls.getItem('ek.co.draft:7'), 'own valid draft kept');
    assert.equal(ls.getItem('ek.co.view:7:scope'), 'mine', 'view preferences untouched');
    ls.setItem('ek.co.draft:7', JSON.stringify({ type: 'nda', saved_at: old }));
    St.storageHygiene(7);
    assert.equal(ls.getItem('ek.co.draft:7'), null, 'expired own draft removed');
    St.writeDraft({ step: 1, type: 'nda' });
    St.clearSession();
    assert.equal(ls.getItem('ek.co.draft:7'), null, 'logout removes the draft');
    assert.equal(St.S.user, null);
    // main.js: الإقلاع ينظف قبل الجلسة وبعدها، والخروج يمر بـ clearSession
    const main = read('public/assets/js/company/main.js');
    assert.match(main, /storageHygiene\(\);/);
    assert.match(main, /storageHygiene\(S\.user\.id\)/);
    const logout = /async function logout\(\) \{([\s\S]*?)\n\}/.exec(main)[1];
    assert.match(logout, /clearSession\(\)/);
    // انتهاء الجلسة يحتفظ بالمسودة ويحفظ صفحة العودة (U10-80)
    const expired = /addEventListener\('auth:expired'[\s\S]*?\n\}\);/.exec(main)[0];
    assert.match(expired, /rememberReturn\(/);
    assert.doesNotMatch(expired, /clearDraft|clearSession/);
  });

  test('a blocked storage (private window) never throws', () => {
    const throwing = { get length() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); }, key() { throw new Error('blocked'); } };
    const saved = globalThis.window;
    globalThis.window = { get localStorage() { throw new Error('denied'); }, sessionStorage: throwing, location: { hash: '#/x' } };
    try {
      St.setSession({ user: { id: 9 } });
      assert.doesNotThrow(() => St.writeDraft({ type: 'nda' }));
      assert.equal(St.readDraft(), null);
      assert.doesNotThrow(() => St.storageHygiene(9));
      assert.doesNotThrow(() => St.rememberReturn('#/requests'));
      assert.equal(St.takeReturn(), null);
      assert.doesNotThrow(() => St.clearSession());
    } finally {
      globalThis.window = saved;
    }
  });
});

// ───────────────────────── §8.5-5 الألوان والذهبي ─────────────────────────

describe('v10 b2b-portal — colours and gold discipline (L-63, §8.5-5)', () => {
  const SHEETS = ['public/assets/css/v10-company.css', 'public/assets/css/v10-company-pages.css'];

  test('no colour literal in the portal stylesheets (tokens only)', () => {
    for (const f of SHEETS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${f}: hex colour`);
      assert.doesNotMatch(css, /\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch|color-mix)\(/, `${f}: colour function`);
      assert.doesNotMatch(css, /:\s*(?:white|black|red|green|gold|yellow|orange|blue|gray|grey)\b/i, `${f}: named colour`);
      assert.match(css, /var\(--/, `${f}: uses tokens`);
    }
  });

  test('no light-gold tints, no gold text; the only gold fill is the .btn-accent «طلب جديد» control', () => {
    for (const f of SHEETS) {
      const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(css, /--accent-(?:50|100)\b/, `${f}: light gold tint`);
      for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const [, sel, body] = m;
        assert.doesNotMatch(body, /(?:^|[;\s])color:\s*var\(--accent-(?:500|600)\)/, `${f}: gold text in ${sel.trim()}`);
        if (/background(?:-color)?:[^;]*var\(--accent/.test(body)) assert.match(sel, /new-request|co-new/, `${f}: gold background outside the new-request control (${sel.trim()})`);
      }
    }
    // JS: «accent» يُستعمل لزر «طلب جديد» وحده
    for (const f of portalFiles()) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/variant:\s*'accent'/g)) {
        const line = s.slice(s.lastIndexOf('\n', m.index) + 1, s.indexOf('\n', m.index));
        assert.match(line, /W\.nav\.new_request/, `${rel(f)}: gold button other than «طلب جديد»: ${line.trim()}`);
      }
    }
  });
});

// ───────────────────────── §8.5-6 الميزانيات ─────────────────────────

describe('v10 b2b-portal — budgets as served (§8.4, §8.5-6)', () => {
  before(() => setPublicRoot(PUB));
  const closureOf = (entry) => {
    const set = new Set([path.join(PUB, entry)]);
    for (const u of preloadClosure(path.join(PUB, entry), PUB)) set.add(path.join(PUB, u.split('?')[0]));
    return set;
  };

  test('entry closure (company/main.js + static imports + pages/overview.js) ≤ 60 KB br; lazy modules stay out of it', () => {
    const files = new Set([...closureOf('assets/js/company/main.js'), ...closureOf('assets/js/company/pages/overview.js')]);
    let total = 0;
    for (const f of files) total += served(f);
    assert.ok(total <= 60 * 1024, `entry closure ${total} B br > 60 KB`);
    const names = [...files].map((f) => path.relative(PUB, f).split(path.sep).join('/'));
    for (const lazy of ['assets/js/lib/company-forms.js', 'assets/js/lib/company-catalog-fields.js', 'assets/js/lib/company-sla.js', 'assets/js/app/components/doc-viewer.js', 'assets/js/app/components/two-factor.js', 'assets/js/lib/qr.js', 'assets/js/public/upload.js']) {
      assert.ok(!names.includes(lazy), `${lazy} is in the entry closure`);
    }
    // «المتابعة» نفسها في الحزمة الثابتة لـ main.js (تُحمَّل مسبقًا مع الصفحة)، وطلبات الإقلاع من أول وحدة تُقيَّم
    const mainOnly = [...closureOf('assets/js/company/main.js')].map((f) => path.relative(PUB, f).split(path.sep).join('/'));
    assert.ok(mainOnly.includes('assets/js/company/pages/overview.js'), 'overview.js is modulepreloaded with the page');
    assert.match(read('public/assets/js/company/main.js'), /^import '\.\/early\.js';/m);
    // البحث والبطاقات (lib/company-ui.js) وكلمات الشاشات الأخرى تُحمَّل عند الحاجة أيضًا
    assert.ok(!names.includes('assets/js/lib/company-ui.js'));
    assert.ok(!names.includes('assets/js/company/words-flows.js'));
    console.log(`  entry closure: ${total} B br in ${files.size} files`);
  });

  test('entry CSS (app.css + v10-experience.css + v10-company.css) ≤ 25 KB br', () => {
    const total = ['app.css', 'v10-experience.css', 'v10-company.css'].reduce((n, f) => n + served(path.join(PUB, 'assets/css', f)), 0);
    assert.ok(total <= 25 * 1024, `entry CSS ${total} B br > 25 KB`);
    console.log(`  entry CSS: ${total} B br`);
  });

  test('no third-party request: no absolute URL fetched or imported by the portal', () => {
    for (const f of portalFiles()) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      assert.doesNotMatch(code, /(?:import\(|from\s+|fetch\(|src:\s*|href:\s*)['"`]https?:\/\//, rel(f));
    }
  });
});

// ───────────────────────── §8.5-7 مكونات company-ui.js الخالصة ─────────────────────────

describe('v10 b2b-portal — company-ui.js pure helpers (§8.5-7)', () => {
  let UI;
  let CAT;
  let fmt;
  before(async () => {
    installDom();
    fmt = await import('../public/assets/js/lib/fmt.js');
    fmt.setMeta({ brand: { name: 'Emam Legal and Consultancy', short: 'Emam Legal' }, email_enabled: true, constants: { LABELS: {} } });
    UI = await import('../public/assets/js/lib/company-ui.js');
    CAT = await import('../public/assets/js/lib/company-catalog.js');
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.Node;
  });
  const inDays = (d, h = 0) => new Date(Date.now() + d * 86400000 + h * 3600000).toISOString();
  const long = (iso) => `${fmt.weekday(iso)} ${fmt.shortDate(iso)}، ${fmt.time(iso)}`;

  test('promiseText: every U10-44 state, incl. the confirm phase, paused with/without remaining hours, late, delivered met/missed', () => {
    const fr = inDays(1);
    const r1 = UI.promiseText({ first_response_by: fr, state: 'on_track' }, { stage: 'received' });
    assert.equal(r1.text, `نؤكد لكم موعد التسليم أو نطلب ما ينقص قبل ${long(fr)}.`);
    assert.equal(r1.tone, 'neutral');
    const cb = inDays(2);
    const r2 = UI.promiseText({ first_response_by: fr, confirm_by: cb, state: 'on_track' }, { stage: 'received' });
    assert.equal(r2.text, `نؤكد لكم موعد التسليم قبل ${long(cb)}.`, 'confirm phase (L-28)');
    const db = inDays(3);
    const r3 = UI.promiseText({ delivery_by: db, state: 'on_track' }, { stage: 'working' });
    assert.equal(r3.text, `التسليم المتوقع: ${long(db)} · في الموعد`);
    assert.equal(r3.tone, 'info');
    assert.match(r3.text, /(السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة) \d+ \S+، \d{1,2}:\d{2} (ص|م)/, 'weekday + time (CO-3)');
    const r4 = UI.promiseText({ delivery_by: db, state: 'paused', paused: true }, { stage: 'needs_you' });
    assert.equal(r4.text, 'موعد التسليم متوقف حتى يصلنا ردكم.');
    assert.equal(r4.tone, 'warning');
    assert.equal(r4.icon, 'clock');
    const r5 = UI.promiseText({ delivery_by: db, state: 'paused', paused: true }, { stage: 'needs_you', remainingHours: 5 });
    assert.equal(r5.text, 'موعد التسليم متوقف حتى يصلنا ردكم. المتبقي بعد ردكم: 5 ساعات عمل.');
    const r5b = UI.promiseText({ delivery_by: db, state: 'paused', paused: true }, { stage: 'needs_you', remainingHours: 11 });
    assert.match(r5b.text, /11 ساعة عمل/, 'number–noun agreement');
    const past = inDays(-1);
    const r6 = UI.promiseText({ delivery_by: past, state: 'late' }, { stage: 'working' });
    assert.equal(r6.text, `تأخرنا عن الموعد المتوقع (${UI.whenLong(past)}). نعتذر — للطلب أولوية الآن.`);
    assert.equal(r6.tone, 'danger');
    const r7 = UI.promiseText({ first_response_by: past, state: 'late' }, { stage: 'received' });
    assert.equal(r7.text, 'تأخرنا في تأكيد الموعد — نعتذر. نؤكده لكم في أقرب وقت.');
    const dAt = inDays(-3);
    const r8 = UI.promiseText({ delivery_by: inDays(-2), delivered_at: dAt, state: 'met' }, { stage: 'delivered' });
    assert.equal(r8.text, `سُلِّم في الموعد (${UI.whenLong(dAt)}).`);
    assert.equal(r8.tone, 'success');
    assert.equal(r8.icon, 'checkCircle');
    const r9 = UI.promiseText({ delivery_by: inDays(-3), delivered_at: inDays(-2), state: 'missed' }, { stage: 'delivered' });
    assert.match(r9.text, /^سُلِّم بعد الموعد المتوقع \(/);
    assert.equal(r9.tone, 'neutral', 'missed is stated, not alarmed');
    const r10 = UI.promiseText({ state: 'on_track' }, { stage: 'received' });
    assert.equal(r10.text, 'ندرس الطلب الآن. نبلغكم بموعد التسليم عند بدء العمل.');
    for (const st of ['closed', 'declined', 'cancelled']) assert.equal(UI.promiseText({ delivery_by: db, state: 'on_track' }, { stage: st }).text, '', st);
    assert.equal(UI.promiseText(null).text, '');
    // الصيغ القصيرة للصفوف
    assert.equal(UI.promiseText({ delivery_by: past, state: 'late' }, { stage: 'working', short: true }).text, 'تأخرنا — نعتذر');
    assert.equal(UI.promiseText({ delivery_by: db, state: 'paused', paused: true }, { stage: 'needs_you', short: true }).text, 'متوقف حتى يصلنا ردكم');
    assert.match(UI.promiseText({ delivery_by: db, state: 'on_track' }, { stage: 'working', short: true }).text, /^التسليم /);
  });

  test('coStepper: current step from stage only; «جارٍ العمل» after «طلب تعديلات» despite an older delivered date; waiting on needs_you/approval; never backwards in a cycle', () => {
    const tl = (o) => Object.entries(o).map(([stage, at]) => ({ stage, at }));
    const t0 = inDays(-5);
    assert.equal(UI.coStepper('received', tl({ received: t0 })).current, 1);
    assert.equal(UI.coStepper('working', tl({ received: t0, working: inDays(-4) })).current, 2);
    const afterChanges = UI.coStepper('working', tl({ received: t0, working: inDays(-1), delivered: inDays(-2) }));
    assert.equal(afterChanges.current, 2, 'stage wins over an older delivered date (CS-21)');
    assert.equal(afterChanges.state, 'normal');
    assert.equal(UI.coStepper('final_review', tl({ received: t0, working: inDays(-3), final_review: inDays(-1) })).current, 3);
    assert.equal(UI.coStepper('delivered', tl({ received: t0, working: inDays(-3), final_review: inDays(-2), delivered: inDays(-1) })).current, 4);
    assert.equal(UI.coStepper('closed', tl({ received: t0 })).current, 5);
    const w1 = UI.coStepper('needs_you', tl({ received: t0 }));
    assert.deepEqual([w1.current, w1.state, w1.note], [1, 'waiting', 'بانتظار ردكم']);
    const w2 = UI.coStepper('approval', tl({ received: t0, working: inDays(-2) }));
    assert.deepEqual([w2.current, w2.state, w2.note], [2, 'waiting', 'بانتظار موافقتكم']);
    const w3 = UI.coStepper('needs_you', tl({ received: t0, working: inDays(-3), final_review: inDays(-1) }));
    assert.equal(w3.current, 3, 'a question during final review does not move the tracker back');
    assert.equal(UI.coStepper('declined').hidden, true);
    assert.equal(UI.coStepper('cancelled').hidden, true);
    const s = UI.coStepper('working', tl({ received: t0, working: inDays(-1) }));
    assert.deepEqual(s.steps.map((x) => x.title), ['تم الاستلام', 'دراسة الطلب', 'العمل القانوني', 'المراجعة النهائية', 'التسليم']);
    assert.equal(s.steps[0].at, t0);
    assert.equal(s.steps[4].at, null);
  });

  test('stageBadge texts/tones/icons equal the catalogue (delivered = warning + checkCircle); every warning badge carries its icon; late adds a clock badge', () => {
    for (const st of CAT.STAGES) {
      const el = UI.stageBadge(st.key);
      const b = el.querySelector('span.badge');
      assert.ok(b, st.key);
      assert.ok(b.classList.contains(`badge-${st.tone}`), `${st.key}: tone ${st.tone}`);
      assert.equal(b.textContent, st.company_label, st.key);
      const svg = b.querySelector('svg') || b.children.find((c) => c.classList.contains('icon'));
      if (st.tone === 'warning' || st.tone === 'success') {
        assert.ok(svg && svg.classList.contains(`icon-${st.icon}`), `${st.key}: icon ${st.icon}`);
      }
      if (st.company_short) assert.equal(UI.stageBadge(st.key, { short: true }).querySelector('span.badge').textContent, st.company_short);
    }
    const d = CAT.STAGES.find((s) => s.key === 'delivered');
    assert.deepEqual([d.tone, d.icon], ['warning', 'checkCircle']);
    const late = UI.stageBadge('working', { late: true }).querySelectorAll('span.badge');
    assert.equal(late.length, 2);
    assert.ok(late[1].classList.contains('badge-danger'));
    assert.equal(late[1].textContent, 'متأخر');
    assert.ok(late[1].children.some((c) => c.classList.contains('icon-clock')));
  });

  test('a request row waiting on the company shows its warning badge with an icon and does not repeat the stage in the sub-line', () => {
    const row = UI.coRequestRow({ code: 'NFD-0001', type: 'contract_review', title: 'مراجعة عقد توريد', stage: 'needs_you', needs_you: true, promise: { delivery_by: inDays(2), state: 'paused', paused: true } });
    const b = row.querySelector('span.badge');
    assert.ok(b && b.classList.contains('badge-warning'));
    assert.ok(b.children.some((c) => c.classList.contains('icon')), 'warning badge carries an icon (L-63)');
    const text = row.textContent;
    assert.equal(text.split('بانتظار ردكم').length - 1, 1, 'the stage appears once');
    assert.match(text, /NFD-0001/);
    assert.equal(row.getAttribute('href') ?? row.href, '#/requests/NFD-0001');
  });

  test('countOf and the units agree in number and gender (count())', () => {
    assert.equal(UI.countOf(1, 'request'), 'طلب واحد');
    assert.equal(UI.countOf(2, 'request'), 'طلبان');
    assert.equal(UI.countOf(3, 'request'), '3 طلبات');
    assert.equal(UI.countOf(11, 'request'), '11 طلبًا');
    assert.equal(UI.countOf(2, 'document'), 'مستندان');
  });
});

// ───────────────────────── §8.5-8 الخصوصية ─────────────────────────

describe('v10 b2b-portal — privacy scan of portal sources (§8.5-8)', () => {
  test('no portal module reads case, assignment, lawyer, handler, ai or notes keys from an API payload', () => {
    const KEYS = 'case|cases|case_id|case_code|assignment|assignments|assignment_id|lawyer|lawyers|lawyer_id|lawyer_name|handler|handlers|handler_id|ai|ai_summary|notes|internal_notes|staff_notes';
    const dot = new RegExp(`\\??\\.(${KEYS})\\b(?!\\s*\\()`);
    const idx = new RegExp(`\\[\\s*['"\`](${KEYS})['"\`]\\s*\\]`);
    const destr = new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b(${KEYS})\\b[^}]*\\}\\s*=`);
    for (const f of portalFiles()) {
      const code = stripComments(fs.readFileSync(f, 'utf8'));
      for (const re of [dot, idx, destr]) {
        const m = re.exec(code);
        assert.equal(m, null, `${rel(f)}: reads «${m?.[1]}»`);
      }
      assert.doesNotMatch(code, /الذكاء الاصطناعي|المحامي\b|REQ-/, `${rel(f)}: staff-only wording`);
    }
  });
});

// ───────────────────────── §8.5-9 نصوص البريد ─────────────────────────

describe('v10 b2b-portal — e-mail wording follows meta.email_enabled (CO-2, §8.5-9)', () => {
  let UI;
  let fmt;
  let W;
  let ADDRESS_KEYS;
  before(async () => {
    installDom();
    fmt = await import('../public/assets/js/lib/fmt.js');
    UI = await import('../public/assets/js/lib/company-ui-core.js');
    // build-2: نصوص الصفحات (words-pages.js) تُضاف إلى W نفسه
    ({ W } = await import('../public/assets/js/company/words-pages.js'));
    ({ ADDRESS_KEYS } = await import('../public/assets/js/company/words.js'));
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.Node;
  });
  const keysOf = (o, p = '') =>
    Object.entries(o).flatMap(([k, v]) => {
      const kk = p ? `${p}.${k}` : k;
      if (typeof v === 'string') return [kk];
      if (v && typeof v === 'object' && !Array.isArray(v)) return keysOf(v, kk);
      return [];
    });

  test('with email_enabled=false no copy() output promises e-mail; with true the e-mail clauses are present', () => {
    const keys = keysOf(W);
    assert.ok(keys.length > 300, `${keys.length} keys`);
    const raw = (k) => k.split('.').reduce((v, p) => v?.[p], W);
    fmt.setMeta({ email_enabled: false });
    for (const k of keys) {
      if (ADDRESS_KEYS.includes(k)) continue; // حقل العنوان نفسه («البريد الإلكتروني») لا وعد فيه
      const out = UI.copy(k);
      assert.doesNotMatch(out, /البريد الإلكتروني|بالبريد/, `${k}: «${out}»`);
      assert.doesNotMatch(out, /[⟦⟧]/, k);
    }
    assert.equal(UI.copy('home.empty_text'), 'سننبهكم هنا عند أي جديد.');
    fmt.setMeta({ email_enabled: true });
    const withClause = keys.filter((k) => /⟦/.test(raw(k)));
    assert.ok(withClause.length >= 1);
    for (const k of withClause) assert.match(UI.copy(k), /البريد|بالبريد/, k);
    assert.equal(UI.copy('home.empty_text'), 'سننبهكم هنا وبالبريد الإلكتروني عند أي جديد.');
    for (const k of ADDRESS_KEYS) assert.equal(typeof raw(k), 'string', `${k} exists`);
  });
});

// ───────────────────────── §8.5-10 تطابق الوعد ─────────────────────────

describe('v10 b2b-portal — promise parity with the server (CO-10, §8.5-10)', () => {
  let t;
  let NR;
  before(async () => {
    installDom();
    t = await startTestApp({ seed: 'demo' });
    NR = await import('../public/assets/js/company/pages/new-request.js');
  });
  after(async () => {
    resetClock();
    await t?.close();
    delete globalThis.document;
    delete globalThis.Node;
  });

  test('the portal imports the same company-sla.js file the server imports', () => {
    const server = read('src/services/company-requests.js');
    const sImp = /from '([^']*company-sla\.js)'/.exec(server)[1];
    const sAbs = path.resolve(ROOT, 'src/services', sImp);
    const nrPath = path.join(JS, 'company/pages/new-request.js');
    const cImp = /from '([^']*company-sla\.js)'/.exec(fs.readFileSync(nrPath, 'utf8'))[1];
    const cAbs = path.resolve(path.dirname(nrPath), cImp);
    assert.equal(cAbs, sAbs);
    assert.equal(cAbs, path.join(JS, 'lib/company-sla.js'));
  });

  test('the preview for the fixed server_now equals /plan promise_preview — Thursday 15:59 and 16:01 Cairo, and now', async () => {
    for (const at of ['2026-10-08T12:59:00Z', '2026-10-08T13:01:00Z', null]) {
      if (at) freezeClock(at);
      else resetClock();
      const c = new CompanyClient(t.base);
      await c.login('sherif@techsol.example');
      const r = await c.get('/api/company/plan');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const plan = r.body;
      assert.ok(plan.promise_preview && plan.server_now, 'plan carries the preview inputs');
      if (at) assert.equal(plan.server_now, new Date(at).toISOString());
      const mine = NR.previewFromPlan(plan, plan.server_now);
      for (const p of ['normal', 'high', 'urgent']) {
        assert.equal(mine[p].first_response_by, plan.promise_preview[p].first_response_by, `${at || 'now'} ${p}`);
        assert.equal(mine[p].clock, plan.promise_preview[p].clock);
      }
    }
    // 15:59 والخميس: الموعد يختلف عن 16:01 (بعد نهاية يوم العمل) في الدرجة العادية على الأقل لساعات العمل
    freezeClock('2026-10-08T12:59:00Z');
    const c1 = new CompanyClient(t.base);
    await c1.login('sherif@techsol.example');
    const a = NR.previewFromPlan((await c1.get('/api/company/plan')).body, '2026-10-08T12:59:00.000Z');
    const b = NR.previewFromPlan((await c1.get('/api/company/plan')).body, '2026-10-08T13:01:00.000Z');
    assert.ok(Date.parse(b.normal.first_response_by) >= Date.parse(a.normal.first_response_by));
    resetClock();
  });
});

// ───────────────────────── §8.5-11 الأوراق ─────────────────────────

describe('v10 b2b-portal — sheets with typing pass beforeClose (L-64, §8.5-11)', () => {
  // أوراق للاطلاع أو الاختيار فقط (بلا حقل كتابة)
  const READ_ONLY_SHEETS = new Set(['company/shell.js:notifications', 'company/common.js:read_only_title', 'company/pages/requests.js:type_sheet']);

  test('every modal({ sheet: true }) in the portal whose body has a text field passes beforeClose', () => {
    let sheets = 0;
    for (const f of portalFiles()) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\bmodal\(\s*\{/g)) {
        let depth = 0;
        let i = m.index + m[0].length - 1;
        const start = i;
        for (; i < s.length; i++) {
          if (s[i] === '{') depth++;
          else if (s[i] === '}' && --depth === 0) break;
        }
        const call = s.slice(start, i + 1);
        if (!/sheet:\s*true/.test(call)) continue;
        sheets++;
        const title = (/title:\s*W\.\w+\.(\w+)/.exec(call) || [])[1] || '?';
        const id = `${path.relative(JS, f).split(path.sep).join('/')}:${title}`;
        // نص الدالة المحيطة (الجسم قد يُبنى قبل الاستدعاء)
        // الجسم: داخل الاستدعاء، أو متغير يُبنى قبله (body: chips ← const chips = …)
        const bodyId = (/body:\s*([A-Za-z_$][\w$]*)\s*[,}]/.exec(call) || [])[1];
        const decl = bodyId ? s.lastIndexOf(`const ${bodyId} =`, m.index) : -1;
        const scope = decl >= 0 ? s.slice(decl, i) : call;
        const typing = /textarea|type:\s*'(?:text|email|search|tel|number)'|h\('input\.input/.test(scope);
        if (READ_ONLY_SHEETS.has(id)) {
          assert.equal(typing, false, `${id} is listed read-only but has a text field`);
          continue;
        }
        if (typing) assert.match(call, /beforeClose/, `${id}: a sheet with typing must pass beforeClose (L-64)`);
      }
    }
    assert.ok(sheets >= 2, `${sheets} sheets scanned`);
  });
});

// ───────────────────────── build-2: صفحات POR-6…POR-8 ─────────────────────────

describe('v10 b2b-portal — build-2 pages: every routed page exists, text sheets ask before discarding (POR-6…POR-9)', () => {
  test('every lazy route loads a page module that exists and exports a default page function', async () => {
    const src = read('public/assets/js/company/routes.js');
    const mods = [...src.matchAll(/import\('\.\/(pages\/[\w-]+\.js)'\)/g)].map((m) => m[1]);
    assert.ok(mods.length >= 18, `${mods.length} lazy pages`);
    for (const m of new Set(mods)) {
      const f = path.join(JS, 'company', m);
      assert.ok(fs.existsSync(f), `${m} exists`);
      assert.match(fs.readFileSync(f, 'utf8'), /export default (?:async )?function/, `${m} has a default page`);
    }
    // صفحات build-2 تأخذ أنماطها المؤجلة وهيكلًا بشكل الصفحة أثناء التحميل (U10-79)
    const R = await import('../public/assets/js/company/routes.js');
    for (const r of R.COMPANY_ROUTES.filter((x) => /^\/(requests\/:code|memory|team|plan|company|notifications|account)/.test(x.path))) {
      assert.ok(r.css?.includes('v10-company-pages'), `${r.path} loads v10-company-pages.css`);
      assert.equal(typeof r.skeleton, 'function', `${r.path} has a page-shaped skeleton`);
    }
  });

  test('textSheet() always passes the L-64 dirty check, and every textSheet() call says what counts as typed', () => {
    const kit = read('public/assets/js/company/page-kit.js');
    assert.match(kit, /modal\(\{[^}]*sheet:\s*true[^}]*beforeClose:\s*discardGuard\(dirty,\s*W\.discard\)/);
    let calls = 0;
    for (const f of walk(path.join(JS, 'company'))) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\btextSheet\(\{/g)) {
        if (/function\s+$/.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;
        calls++;
        assert.match(s.slice(m.index, m.index + 400), /dirty:\s*\(\)\s*=>/, `${rel(f)}: textSheet without dirty()`);
      }
    }
    assert.ok(calls >= 10, `${calls} text sheets`);
  });

  test('the request page offers exactly the role-allowed actions and keeps one voice (no staff names, no internal keys)', () => {
    const s = stripComments(read('public/assets/js/company/pages/request.js'));
    // كل إجراء من can.* في الخادم، لا من الدور في المتصفح وحده
    for (const k of ['can?.edit_watchers', 'can?.cancel', 'can.approve_quote', 'can.decide_deliverable', 'can.answer', 'can.message', 'can?.upload']) assert.ok(s.includes(k), k);
    assert.match(s, /haptic\('commit'\)/);
    assert.match(s, /haptic\('success'\)/);
    assert.equal((s.match(/haptic\('commit'\)/g) || []).length, 1, 'commit haptic only on the quote approval');
    assert.doesNotMatch(s, /staff_name|author_user_id|info_request_id/);
  });
});

describe('v10 b2b-portal — build-2 copy and components (§8.3, L-50, L-63)', () => {
  let UI;
  let fmt;
  let W;
  let ML;
  before(async () => {
    installDom();
    globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, location: { hash: '#/memory/contracts' } };
    fmt = await import('../public/assets/js/lib/fmt.js');
    fmt.setMeta({ brand: { name: 'Emam Legal and Consultancy', short: 'Emam Legal' }, email_enabled: true, constants: { LABELS: {} } });
    UI = await import('../public/assets/js/lib/company-ui.js');
    ({ W } = await import('../public/assets/js/company/words-pages.js'));
    ML = await import('../public/assets/js/company/pages/memory-list.js');
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.window;
  });
  const dayKey = (n) => new Date(Date.parse(`${fmt.cairoToday()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

  test('§8.3 rows are exact: L-50 role names, escalation and read-only wording, plan lines, save-to-memory, discard', () => {
    assert.equal(W.team.role_company_admin, 'يرسل الطلبات ويرى كل طلبات الشركة، ويوافق على عروض الأسعار، ويدير الفريق والتكاليف الإضافية والذاكرة القانونية.');
    assert.equal(W.team.billing, 'يطّلع على التكاليف الإضافية والمطالبات المالية');
    assert.equal(W.team.pending_review, 'أرسلنا الدعوة لفريقكم القانوني للمراجعة؛ سنبلغكم عند تفعيلها.');
    assert.equal(W.escalateSheet.text, 'يصل طلبكم فورًا إلى مدير علاقتكم لدينا وإدارة المكتب.');
    assert.match(W.req.escalated, /سيتواصل معكم مدير علاقتكم لدينا\.$/);
    assert.equal(W.plan.next, 'بداية الفترة القادمة: {next_period_starts}'.replace('{next_period_starts}', '{date}'));
    assert.equal(W.plan.contracting, 'الجهة المتعاقدة: {legal_name} · السجل: {registration}');
    assert.equal(W.plan.urgent, 'الطلبات العاجلة: {m} في كل دورة');
    assert.equal(W.plan.charges, 'التكاليف الإضافية المعتمدة');
    assert.equal(W.plan.charges_foot, 'تصلكم المطالبات المالية من فريقكم القانوني.');
    assert.equal(W.plan.charges_empty, 'لا توجد تكاليف إضافية.');
    assert.equal(W.acceptSheet.save_memory, 'حفظ العقد في الذاكرة القانونية');
    assert.equal(W.acceptSheet.save_memory_hint, 'يراجعه فريقكم القانوني ويكمل تواريخه.');
    assert.equal(W.account.email_hint, 'لتغيير البريد تواصلوا مع فريقكم القانوني.');
    assert.equal(W.memory.at_max, 'وصلتم للحد الأقصى من الكيانات في باقتكم. تواصلوا مع مدير علاقتكم لدينا للزيادة.');
    assert.equal(W.team.last_admin, 'يجب أن يبقى للشركة مدير بوابة واحد نشط على الأقل. عيّنوا مديرًا آخر أولًا.');
    assert.equal(W.thread.closed, 'أُغلق الطلب. إن احتجتم متابعة أرسلوا طلبًا جديدًا، أو اكتبوا لفريقكم القانوني خلال 30 يومًا لإعادة فتحه.');
  });

  test('counted copy agrees in number: revision rounds, entities, users, near dates', () => {
    assert.equal(UI.copy('changesSheet.left', { left: UI.countOf(2, 'round_left'), max: 2, date: '5 نوفمبر' }), 'تبقّى لكم جولتا تعديل (من 2) حتى 5 نوفمبر.');
    assert.equal(UI.countOf(1, 'round_left'), 'جولة تعديل واحدة');
    assert.equal(UI.countOf(3, 'entity'), '3 كيانات');
    assert.equal(UI.countOf(10, 'user'), '10 مستخدمين');
    assert.equal(UI.countOf(15, 'user'), '15 مستخدمًا');
    assert.equal(UI.countOf(2, 'soon_date'), 'موعدان قريبان');
    assert.equal(UI.countOf(1, 'business_day'), 'يوم عمل واحد');
  });

  test('contract badge priority (U10-60): notice ≤ 60 days (warning + clock) → ends ≤ 90 days → renews automatically → expired', () => {
    const notice = ML.contractBadge({ status: 'active', notice_deadline: dayKey(25), end_date: dayKey(85), renewal_type: 'auto' });
    assert.ok(notice.classList.contains('badge-warning'));
    assert.match(notice.textContent, /^آخر موعد لإيقاف التجديد بعد 25 يومًا$/);
    assert.ok(notice.children.some((c) => c.classList.contains('icon-clock')), 'warning badge carries its icon (L-63)');
    const ends = ML.contractBadge({ status: 'active', notice_deadline: dayKey(-5), end_date: dayKey(75), renewal_type: 'manual' });
    assert.ok(ends.classList.contains('badge-info'));
    assert.equal(ends.textContent, 'ينتهي بعد 75 يومًا');
    const auto = ML.contractBadge({ status: 'active', end_date: dayKey(200), renewal_type: 'auto' });
    assert.equal(auto.textContent, 'يتجدد تلقائيًا');
    const expired = ML.contractBadge({ status: 'expired', end_date: dayKey(-3) });
    assert.equal(expired.textContent, 'منتهٍ');
    assert.equal(ML.contractBadge({ status: 'active', end_date: dayKey(400), renewal_type: 'none' }), null);
  });

  test('deliverable card: decision buttons for a final release, the revision-limit note replaces «طلب تعديلات»; the clarification card says «فريقكم القانوني» once', () => {
    const d = { id: 1, version: 1, final: true, decision: null, kind_label: 'مذكرة رأي قانوني', title: 'رأي', risk_level: 'medium', documents: [] };
    const open = UI.coDeliverableCard(d, { canDecide: true, onAccept: () => {}, onRequestChanges: () => {} });
    assert.match(open.textContent, /اعتماد التسليم/);
    assert.match(open.textContent, /طلب تعديلات/);
    assert.match(open.textContent, /درجة المخاطر:متوسطة/);
    const limited = UI.coDeliverableCard(d, { canDecide: true, onAccept: () => {}, onRequestChanges: () => {}, changesNote: W.changesSheet.limit });
    assert.doesNotMatch(limited.textContent, /طلب تعديلات/);
    assert.match(limited.textContent, /استُخدمت جولات التعديل المشمولة/);
    const clar = UI.coClarificationCard({ id: 7, body: 'نحتاج التصميم', items: [{ label: 'التصميم' }], answered_at: null }, { canAnswer: false });
    assert.equal(clar.querySelector('header').textContent.split('فريقكم القانوني').length - 1, 1);
  });
});

describe('v10 b2b-portal — the server shapes the build-2 pages read (demo seed)', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
  });
  after(async () => {
    await t?.close();
  });

  test('request, memory, plan, team and account payloads carry the fields the pages render — and nothing staff-only', async () => {
    const m = new CompanyClient(t.base);
    await m.login('mariam@nilefoods.example');
    const clar = (await m.get('/api/company/requests/NFD-0004')).body;
    const q = clar.messages.find((x) => x.kind === 'clarification' && !x.answered_at);
    assert.ok(q && q.items.length === 2 && clar.request.can.answer, 'open clarification with items');
    const quote = (await m.get('/api/company/requests/NFD-0005')).body;
    assert.equal(quote.quote.status, 'sent');
    assert.ok(quote.request.can.approve_quote && quote.quote.approver_names.length);
    const closed = (await m.get('/api/company/requests/NFD-0001')).body;
    assert.equal(closed.request.stage, 'closed');
    assert.ok(closed.memory_refs.length >= 1 && closed.timeline.some((x) => x.stage === 'closed'));
    for (const v of [clar, quote, closed]) {
      const json = JSON.stringify(v);
      for (const k of ['"case_id"', '"assignment', '"lawyer', '"handler', '"staff_name"', '"ai"', '"internal']) assert.ok(!json.includes(k), `company view leaks ${k}`);
    }
    const item = (await m.get('/api/company/memory/1')).body.item;
    assert.ok(item.dates.notice_deadline && item.reminder_text && item.can.start_request);
    const plan = (await m.get('/api/company/plan')).body;
    assert.ok(plan.contracting_entity?.legal_name && plan.sla_table.length === 3 && plan.quota && plan.plan.next_period_starts);
    assert.ok(plan.excluded_work.includes('litigation'));
    const team = (await m.get('/api/company/team')).body;
    assert.ok(team.items.some((u) => u.me) && team.max_users);
    const me = (await m.get('/api/company/me')).body;
    assert.ok(me.two_factor && me.policy && 'email_enabled' in me);
    // عضو: لا فريق ولا تكاليف، ولا أقسام مديري البوابة في الذاكرة
    const h = new CompanyClient(t.base);
    await h.login('hossam@nilefoods.example');
    assert.equal((await h.get('/api/company/team')).status, 403);
    assert.equal((await h.get('/api/company/charges')).status, 403);
    const mem = (await h.get('/api/company/memory')).body;
    assert.ok(!mem.items.some((x) => ['position', 'person', 'dispute'].includes(x.kind)), 'admins-only kinds absent for a member');
    const s = new CompanyClient(t.base);
    await s.login('sherif@techsol.example');
    const tsl = (await s.get('/api/company/requests/TSL-0001')).body;
    assert.ok(tsl.request.can.decide_deliverable && tsl.request.can.save_to_memory && tsl.request.auto_close_at);
  });
});

// ───────────────────────── review fixes (b2b-portal review step) ─────────────────────────
describe('v10 b2b-portal — review fixes: typing is never lost, keyboard focus is visible, menus are not clipped', () => {
  let St;
  let PK;
  let CF;
  let UI;
  before(async () => {
    installDom();
    const listeners = {};
    globalThis.window = {
      matchMedia: () => ({ matches: false }),
      addEventListener: (t, fn) => (listeners[t] ||= []).push(fn),
      removeEventListener: (t, fn) => (listeners[t] = (listeners[t] || []).filter((f) => f !== fn)),
      location: { hash: '#/team' },
      innerWidth: 1366,
      innerHeight: 768,
      __listeners: listeners,
    };
    globalThis.document.documentElement = { clientWidth: 1366 };
    const fmt = await import('../public/assets/js/lib/fmt.js');
    fmt.setMeta({ brand: { name: 'Emam Legal and Consultancy', short: 'Emam Legal' }, email_enabled: true, constants: { LABELS: {} }, limits: { max_upload_mb: 8 } });
    St = await import('../public/assets/js/company/state.js');
    PK = await import('../public/assets/js/company/page-kit.js');
    CF = await import('../public/assets/js/lib/company-forms.js');
    UI = await import('../public/assets/js/lib/company-ui.js');
  });
  after(() => {
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.window;
  });

  /** مستند صغير بما يقرؤه typingInProgress وحده */
  const fakeDoc = ({ modal = false, active = null, texts = [], uploads = 0 } = {}) => {
    const outlet = { contains: (el) => !!el?.inOutlet, querySelectorAll: (s) => (s === 'textarea' ? texts.map((value) => ({ value })) : []), querySelector: (s) => (s === '.co-up-item' && uploads ? {} : null) };
    return { activeElement: active, querySelector: (s) => (s === '.modal-backdrop:not(.is-leaving)' ? (modal ? {} : null) : s === '.co-outlet' ? outlet : null) };
  };

  test('U10-81/L-64: the automatic refresh skips an open sheet, a form route, a focused field, typed text and staged files', () => {
    assert.equal(St.typingInProgress(fakeDoc(), { path: '/requests/:code' }), false, 'an idle page refreshes');
    assert.equal(St.typingInProgress(fakeDoc({ modal: true }), null), true, 'an open sheet («طلب تعديلات») keeps its text');
    assert.equal(St.typingInProgress(fakeDoc(), { keep: true }), true, 'form routes are never redrawn');
    assert.equal(St.typingInProgress(fakeDoc({ active: { tagName: 'INPUT', type: 'text', inOutlet: true } }), null), true);
    assert.equal(St.typingInProgress(fakeDoc({ active: { tagName: 'BUTTON', inOutlet: true } }), null), false);
    assert.equal(St.typingInProgress(fakeDoc({ texts: ['', '  رسالة لم تُرسل '] }), null), true, 'composer / clarification text');
    assert.equal(St.typingInProgress(fakeDoc({ uploads: 1 }), null), true, 'a staged file in an open form');
    assert.equal(St.typingInProgress(null, null), false);
    // main.js: focus-after-a-minute and online both go through the guard
    const main = stripComments(read('public/assets/js/company/main.js'));
    assert.match(main, /function autoReload\(\) \{\s*if \(!shell \|\| typingInProgress\(document, currentRoute\)\) return;/);
    assert.match(main, /window\.addEventListener\('online', autoReload\)/);
    assert.match(main, /addEventListener\('focus', \(\) => \{[\s\S]*?autoReload\(\);/);
    assert.doesNotMatch(main.replace(/function autoReload\(\) \{[\s\S]*?\n\}/, ''), /\breload\(\);/, 'no unguarded reload() outside autoReload and co:reload');
    // every route that holds a form is flagged keep
    const routes = read('public/assets/js/company/routes.js');
    for (const p of ['/requests/new', '/requests/new/:type', '/memory/new/:slug', '/memory/item/:id/edit', '/account', '/welcome']) {
      const line = routes.split('\n').find((l) => l.includes(`path: '${p}'`));
      assert.ok(line && /keep: true/.test(line), `${p} keeps typed text`);
    }
  });

  test('WCAG 2.4.7: the hidden file input shows its focus ring on the visible button; no invisible camera stop on desktop', () => {
    const up = CF.coUploader({ max: 5 });
    const inputs = up.el.all().filter((e) => e.tagName === 'INPUT');
    const file = inputs.find((e) => String(e.id || e.attrs.id || '').endsWith('-file'));
    const cam = inputs.find((e) => String(e.id || e.attrs.id || '').endsWith('-cam'));
    assert.ok(file && cam);
    assert.equal(cam.tabIndex, -1, 'camera input is out of the Tab order when no camera button is shown');
    const label = up.el.all().find((e) => e.tagName === 'LABEL' && e.classList.contains('co-up-btn'));
    assert.ok(label, 'visible «اختيار ملفات» button');
    file.matches = () => true; // :focus-visible
    file.listeners.focus.forEach((f) => f());
    assert.ok(label.classList.contains('is-focus'));
    file.listeners.blur.forEach((f) => f());
    assert.ok(!label.classList.contains('is-focus'));
    assert.match(read('public/assets/css/v10-company-pages.css'), /\.co-up-btn\.is-focus \{\s*outline: 2px solid var\(--accent-500\);/);
  });

  test('row menus are placed in viewport coordinates (a scrolling table cannot clip them) and open upwards near the bottom', () => {
    const el = PK.menuButton('إجراءات', [{ label: 'تغيير الدور' }, { label: 'إيقاف الحساب', danger: true }]);
    const [btn, pop] = el.children;
    btn.focus = () => {};
    const open = (rect) => {
      btn.getBoundingClientRect = () => rect;
      Object.defineProperty(pop, 'offsetHeight', { value: 230, configurable: true });
      Object.defineProperty(pop, 'offsetWidth', { value: 260, configurable: true });
      btn.listeners.click.forEach((f) => f());
    };
    open({ top: 100, bottom: 144, left: 120, right: 164 });
    assert.ok(pop.classList.contains('is-fixed'));
    assert.equal(pop.style.top, '152px');
    assert.equal(pop.style.left, '120px');
    btn.listeners.click.forEach((f) => f()); // close
    open({ top: 640, bottom: 684, left: 1300, right: 1344 });
    assert.equal(pop.style.top, '');
    assert.equal(pop.style.bottom, `${768 - 640 + 8}px`, 'opens upwards');
    assert.equal(pop.style.left, `${1366 - 260 - 8}px`, 'clamped inside the viewport');
    assert.match(read('public/assets/css/v10-company-pages.css'), /\.co-pop-menu\.is-fixed \{\s*position: fixed;/);
  });

  test('U10-84: a message refused with 401 goes back into the composer; the bell count refreshes after a read; shell listeners end at logout', () => {
    const req = stripComments(read('public/assets/js/company/pages/request.js'));
    assert.match(req, /if \(err\?\.status === 401\) \{\s*if \(payload\.body && !composerText\.get\(code\)\) composerText\.set\(code, payload\.body\);\s*return;/);
    const shell = stripComments(read('public/assets/js/company/shell.js'));
    assert.match(shell, /\/read`, \{\}\)\.then\(\(\) => window\.dispatchEvent\(new CustomEvent\('co:notifications'\)\)\)/);
    assert.match(shell, /const life = new AbortController\(\);/);
    for (const ev of ['co:back', 'offline', 'online']) assert.ok(new RegExp(`addEventListener\\(\\s*'${ev}',[\\s\\S]*?on,?\\s*\\)`).test(shell), `${ev} listener is tied to the shell's life`);
    assert.match(stripComments(read('public/assets/js/company/main.js')), /shell\?\.destroy\?\.\(\);\s*shell = null;\s*currentRoute = null;/);
  });

  test('X10-P2/P3: the portal registers the iOS touchstart listener and its own tiles, segments and chips press on pointer-down', () => {
    assert.match(stripComments(read('public/assets/js/company/main.js')), /document\.addEventListener\('touchstart', \(\) => \{\}, \{ passive: true \}\);/);
    const css = read('public/assets/css/v10-company.css');
    for (const sel of ['.co-type-tile:active', '.co-quick-tile:active', '.co-mem-kind:active', '.co-seg-btn:active', '.chip-toggle:active']) assert.ok(css.includes(sel), sel);
    assert.match(css, /\.chip-toggle:active:not\(:disabled\) \{\s*transform: scale\(var\(--press-scale\)\);/);
  });

  test('the charge table\'s request links are full tap targets on phones (≥ 44px)', () => {
    assert.match(read('public/assets/css/v10-company-pages.css'), /@media \(max-width: 1023px\) \{\s*\.co-plan \.table td a \{\s*display: inline-flex;\s*align-items: center;\s*min-height: 44px;\s*min-width: 44px;/);
  });

  test('plan tables stack into cards on phones (no sideways scroll hiding the delivery time or the amount)', () => {
    const plan = stripComments(read('public/assets/js/company/pages/plan.js'));
    assert.match(plan, /caption: P\.sla,\s*stack: true,/);
    assert.match(plan, /caption: P\.charges,\s*stack: true,/);
    const css = read('public/assets/css/v10-company-pages.css');
    assert.match(css, /@media \(max-width: 640px\) \{\s*\.co-page \.table-wrap\.table-stack \{\s*overflow: visible;/);
    assert.match(css, /\.co-page \.table-stack td\[data-label\]:first-child::before \{\s*content: none;/);
  });

  test('the search box announces the number of results with its counted noun', () => {
    assert.equal(UI.countOf(1, 'result'), 'نتيجة واحدة');
    assert.equal(UI.countOf(2, 'result'), 'نتيجتان');
    assert.equal(UI.countOf(4, 'result'), '4 نتائج');
    assert.equal(UI.countOf(12, 'result'), '12 نتيجة');
    assert.match(stripComments(read('public/assets/js/lib/company-ui.js')), /status\.textContent = nodes\.length \? countOf\(opts\.length, 'result'\)/);
  });
});
