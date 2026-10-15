// v12 tags (TG-1، TG-3…TG-7؛ spec §11.2، T12-73…T12-84، L12-43، L12-88): طبقة «رموز العناصر» ومحمّلها، خيارات tag في
// المكوّنات، رموز الرسائل والبريد والمطبوعات، والسجل للقراءة GET /api/admin/tags مع صفحته ومفتاح «حسابي» وأمر Ctrl/⌘+K.
// TG-7: التغطية مفروضة (T12-75…T12-78) مع تزامن TAGS.md والدفتر (T12-73، T12-74) والميزانيات (T12-84). المفتاح الواحد
// TAGS_ENFORCE في src/tags/registry.js ('1' منذ TG-7، ودائم بعد التجميد)؛ TAGS_ENFORCE=0 في البيئة يعيدها تقريرًا قبل التجميد.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startTestApp, waPayload } from './helpers.js';
import {
  TEXT_TAGS, WA_BUTTON_TEXTS, CLIENT_TEXTS, CLIENT_TEXTS_PAID, SEGMENT_CHOICE_TEXTS, CLIENT_TEXTS_CHARITY_EXTRA, SEGMENT_CHANGE_TEXTS,
  LINES_MENU_TEXTS, DEFAULT_AUTOMATION_RULES, LABELS,
} from '../src/constants.js';
import { EMAIL_TAGS } from '../src/services/email.js';
import { ALERT_TAGS, ALERT_TEXT } from '../src/services/lawyer-alerts.js';
import { messageTag, ruleTag } from '../src/tags/messages.js';
import { sampleFill } from '../src/routes/tags.js';
import { scanSources, coverageReport, tokenize } from '../src/tags/scan.js';
import {
  loadLedger, enforceCoverage, coverageGaps, UNTAGGED_BY_DESIGN, buildRegistry, renderMarkdown, stripLines, loadModuleData, readVersion, updateLedger, ledgerText,
  lastTextFrom, expandNums, codeOf,
} from '../src/tags/registry.js';
import { allTags, TREE, QUESTION_TAGS, ANSWER_TAGS, PAID_QUESTIONS, TREE_QUESTIONS } from '../public/assets/js/public/entry-tree.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OVERLAY = path.join(ROOT, 'public/assets/js/lib/tags.js');
const OVERLAY_APP = path.join(ROOT, 'public/assets/js/lib/tags-pages-app.js');
const CODE_IN_TEXT = /\b[A-Z]{1,3}-\d{2,3}\b/;
const range = (p, a, b) => Array.from({ length: b - a + 1 }, (_, i) => `${p}-${String(a + i).padStart(2, '0')}`);

/** يشغّل tagsBoot() في Node بكائنات متصفح مزيفة (نسخة جديدة من الوحدة في كل مرة) */
async function bootWith({ pathname = '/', search = '', hash = '', session = {}, local = {}, then } = {}) {
  const calls = [];
  const on = {};
  const loc = { pathname, search, hash };
  const keys = ['location', 'history', 'sessionStorage', 'localStorage', 'addEventListener'];
  const saved = Object.fromEntries(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  def('location', loc);
  def('history', { state: null, replaceState: (s, t, u) => calls.push(u) });
  def('sessionStorage', session);
  def('localStorage', local);
  def('addEventListener', (type, fn) => (on[type] = fn));
  try {
    const url = `${pathToFileURL(path.join(ROOT, 'public/assets/js/lib/tags-boot.js')).href}?n=${Math.random()}`;
    const m = await import(url);
    m.tagsBoot();
    if (then) {
      Object.assign(loc, then);
      on.hashchange?.();
    }
    await new Promise((r) => setTimeout(r, 10));
    return { calls, session, local, on };
  } finally {
    for (const k of keys) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  }
}

describe('v12 tags TG-1 — loader and overlay (T12-30…T12-34، T12-80، T12-81، L12-43)', () => {
  test('T12-80 (d): tags-boot.js served ≤ 450 B br, no imports, the overlay specifier is not a string literal and has no window global', async () => {
    const { transformAsset, setPublicRoot } = await import('../src/site-assets.js');
    setPublicRoot(path.join(ROOT, 'public'));
    const served = transformAsset(path.join(ROOT, 'public/assets/js/lib/tags-boot.js')) || fs.readFileSync(path.join(ROOT, 'public/assets/js/lib/tags-boot.js'));
    const br = zlib.brotliCompressSync(served, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    assert.ok(br <= 450, `tags-boot.js ${br} B br`);
    const src = read('public/assets/js/lib/tags-boot.js');
    assert.doesNotMatch(src, /^\s*import\s/m, 'no static import');
    assert.doesNotMatch(src, /import\(\s*['"`]/, 'the dynamic import takes a variable');
    assert.doesNotMatch(src, /__bmTagsUrl|window\.\w+Url/, 'no window global for the URL (L12-43)');
    assert.match(src, /'\/assets\/js\/lib\/' \+ 'tags\.js'/, 'the URL is a module constant built by concatenation');
    assert.match(src, /history\.replaceState/);
  });

  test('T12-80 (a, e): nothing imports tags.js statically; menu.js, portal-ui.js, app/main.js and company/main.js call tagsBoot()', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
    for (const f of walk(path.join(ROOT, 'public/assets/js'))) {
      const src = fs.readFileSync(f, 'utf8');
      // كل محدِّد حرفي (ثابت أو import()) يُحل نسبة إلى ملفه: لا شيء يصل إلى lib/tags.js، وجدول بادئات المنصة من الطبقة وحدها
      for (const [, spec] of src.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const target = spec.startsWith('.') ? path.resolve(path.dirname(f), spec) : path.join(ROOT, 'public', spec);
        assert.notEqual(target, OVERLAY, `${path.relative(ROOT, f)} → ${spec}`);
        if (f !== OVERLAY) assert.notEqual(target, OVERLAY_APP, `${path.relative(ROOT, f)} → ${spec}`);
      }
    }
    assert.match(read('public/assets/js/public/menu.js'), /^\s*tagsBoot\(\);/m);
    assert.match(read('public/assets/js/app/main.js'), /^tagsBoot\(\{ app: 1 \}\);/m);
    assert.match(read('public/assets/js/company/main.js'), /^tagsBoot\(\{ app: 1 \}\);/m);
    // `/` و/start/* تحمّل entry.js وحده، و/p/ (TG-7، T12-84: ميزانية 30 KB gzip) لا تحمّل المحمّل مقدمًا: يُستورد عند الطلب
    // فقط (?tags= أو ?tag= أو تفضيل محفوظ أو أول Alt+Shift+T خارج حقول الكتابة)، ثم يُستدعى tagsBoot()
    const entry = read('public/assets/js/public/entry.js');
    assert.doesNotMatch(entry, /^import\s/m);
    assert.match(entry, /'\/assets\/js\/lib\/' \+ 'tags-boot\.js'/);
    const pui = read('public/assets/js/public/portal-ui.js');
    assert.doesNotMatch(pui, /^import [^\n]*tags-boot/m, 'no static import on /p/');
    assert.match(pui, /import\('\/assets\/js\/lib\/' \+ 'tags-boot\.js'\)\.then\(\(m\) => \(m\.tagsBoot\(\), t && m\.tagsToggle\(\)\)/);
    assert.match(pui, /if \(\/\[\?&\]tags\?=\/\.test\(location\.search \+ location\.hash\) \|\| sessionStorage\.bm_tags \|\| localStorage\.bm_tags\) tags\(\);/);
    assert.match(pui, /e\.altKey && e\.shiftKey && e\.code === 'KeyT' && !e\.target\.matches\?\.\(':read-write'\) && tags\(1\)/);
  });

  test('L12-43: ?tags=1 and ?tag= are stripped with replaceState; boot never writes localStorage; the hash route keeps its other params', async () => {
    let r = await bootWith({ pathname: '/p/abc', search: '?tags=1&x=2' });
    assert.deepEqual(r.calls, ['/p/abc?x=2']);
    assert.deepEqual(Object.keys(r.local), [], 'no localStorage write from a link');
    r = await bootWith({ pathname: '/services', search: '?tags=1&tag=S-14' });
    assert.deepEqual(r.calls, ['/services']);
    r = await bootWith({ pathname: '/app', hash: '#/inbox?tags=1&tag=INB-04' });
    assert.deepEqual(r.calls, ['/app#/inbox']);
    r = await bootWith({ pathname: '/app', hash: '#/cases?tags=1&status=open' });
    assert.deepEqual(r.calls, ['/app#/cases?status=open']);
    r = await bootWith({ pathname: '/about', search: '?a=1' });
    assert.deepEqual(r.calls, [], 'an URL without the parameter is left alone');
    r = await bootWith({ pathname: '/app', search: '?a=1&tags=1', hash: '#/x?tags=1&b=2' });
    assert.deepEqual(r.calls, ['/app?a=1#/x?b=2']);
    // تبويب مفتوح: تغيّر الوسم إلى /app#/inbox?tags=1 يُقرأ أيضًا
    r = await bootWith({ pathname: '/app', hash: '#/account', then: { hash: '#/inbox?tags=1' } });
    assert.deepEqual(r.calls, ['/app#/inbox']);
    assert.equal(typeof r.on.keydown, 'function', 'Alt+Shift+T listener');
    // التذكّر: sessionStorage عند ?tags=1، وlocalStorage من مفتاح «حسابي» وحده (tagsToggle(on, true))
    const overlay = read('public/assets/js/lib/tags.js');
    assert.match(overlay, /if \(on\) \(device \? localStorage : sessionStorage\)\.setItem\(LS_KEY, '1'\)/);
    assert.match(overlay, /else if \(String\(o\.set\) === '1'\) remember\(true\);/);
    const devices = ['public/assets/js/app/pages/account.js', 'public/assets/js/app/pages/admin/tags.js'];
    for (const f of devices) assert.match(read(f), /tagsToggle\(sw\.checked, true\)/, f);
    assert.doesNotMatch(read('public/assets/js/app/components/search.js'), /tagsToggle\([^)]*,\s*true\)/, 'Ctrl+K stays per session');
  });

  test('T12-81: overlay helpers are pure; start() is a no-op without document; no eval/new Function/innerHTML', async () => {
    const m = await import('../public/assets/js/lib/tags.js');
    assert.equal(m.normalizeCode('s14'), 'S-14');
    assert.equal(m.normalizeCode('S 014'), 'S-14');
    assert.equal(m.normalizeCode('inb-٠٤'), 'INB-04');
    assert.equal(m.normalizeCode('S-0'), null);
    assert.equal(m.normalizeCode('xx'), null);
    assert.deepEqual(m.partialCode('s1'), { prefix: 'S', digits: '1' });
    assert.ok(m.compareCodes('S-2', 'S-10') < 0);
    assert.ok(m.compareCodes('KIT-01', 'S-01') !== 0);
    const spot = m.pickSpot([{ x: 10, y: 10 }, { x: 60, y: 10 }], 30, 18, [{ x: 0, y: 0, w: 50, h: 40 }]);
    assert.deepEqual(spot, { x: 60, y: 10, w: 30, h: 18 });
    assert.equal(m.start({ set: '1' }), false);
    assert.equal(m.isOn(), false);
    const code = read('public/assets/js/lib/tags.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    assert.doesNotMatch(code, /\beval\(|new Function|innerHTML/);
  });

  test('T12-80 (b, c): no tags.js / tags-pages*.js in pages or modulepreload; sw.js precache skips them and keeps tags-boot.js', async () => {
    const t = await startTestApp();
    try {
      for (const url of ['/', '/services', '/intake', '/portal', '/app', '/company']) {
        const html = await (await fetch(t.base + url)).text();
        assert.doesNotMatch(html, /lib\/tags(?:-pages(?:-app)?)?\.js/, url);
      }
      const sw = await (await fetch(`${t.base}/sw.js`)).text();
      assert.ok(sw.includes('/assets/js/lib/ui.js'), 'the precache list is there');
      assert.doesNotMatch(sw, /lib\/tags(?:-pages(?:-app)?)?\.js/);
      assert.ok(sw.includes('/assets/js/lib/tags-boot.js'), 'the loader stays precached (it boots /app)');
    } finally {
      await t.close();
    }
  });
});

describe('v12 tags TG-3 — tag options in shared components (T12-16…T12-18، T12-82)', () => {
  test('ui.js passes `tag` to the root of every listed component; KIT internals carry their own codes', () => {
    const src = read('public/assets/js/lib/ui.js');
    const body = (name) => {
      const i = src.indexOf(`export function ${name}(`);
      assert.ok(i >= 0, name);
      const j = src.indexOf('\nexport ', i + 10);
      return src.slice(i, j < 0 ? undefined : j);
    };
    const LIST = ['button', 'badge', 'modal', 'confirmDialog', 'formDialog', 'field', 'fileInput', 'form', 'table', 'tabs', 'card', 'statCard', 'kv', 'timeline', 'emptyState', 'alertBox', 'pageHeader', 'filterBar', 'searchInput', 'selectInput', 'chips', 'choiceTiles', 'progressBar', 'copyButton', 'stepTracker', 'kRow'];
    for (const n of LIST) assert.match(body(n), /\btag\b/, `${n} takes a tag`);
    assert.match(body('table'), /typeof rowTag === 'function' \? rowTag\(row\) : rowTag/, 'dynamic row codes (outbox)');
    assert.match(body('card'), /titleTag/);
    assert.match(body('form'), /submitTag/);
    const defs = new Set(scanSources({ root: ROOT }).defs.map((d) => d.code));
    const want = [...range('KIT', 6, 19), ...range('CU', 1, 28), ...range('CU', 31, 46), 'P-10', ...range('D', 1, 64), ...range('E', 1, 15), ...range('W', 7, 54), ...range('TGS', 1, 12), ...range('PRF', 1, 3), 'SRC-05'];
    const missing = want.filter((c) => !defs.has(c));
    assert.deepEqual(missing, []);
  });
});

describe('v12 tags TG-4 — messages, e-mails and print (T12-19…T12-21، T12-79، L12-88)', () => {
  test('T12-79: every client text key and every templated automation rule has a W code; every TEXT_TAGS key exists', () => {
    const keys = new Set([CLIENT_TEXTS, CLIENT_TEXTS_PAID, SEGMENT_CHOICE_TEXTS, CLIENT_TEXTS_CHARITY_EXTRA, SEGMENT_CHANGE_TEXTS].flatMap((o) => Object.keys(o)));
    for (const k of keys) assert.ok(TEXT_TAGS[k], `TEXT_TAGS.${k}`);
    for (const [k, r] of Object.entries(DEFAULT_AUTOMATION_RULES)) if (r.params?.template) assert.ok(TEXT_TAGS[`rule:${k}`], `rule:${k}`);
    const src = fs.readdirSync(path.join(ROOT, 'src/services')).map((f) => read(`src/services/${f}`)).join('\n') + read('src/constants.js');
    const known = new Set([...keys, ...Object.keys(LINES_MENU_TEXTS), ...Object.keys(WA_BUTTON_TEXTS), ...Object.keys(DEFAULT_AUTOMATION_RULES).map((k) => `rule:${k}`)]);
    for (const k of Object.keys(TEXT_TAGS)) assert.ok(known.has(k) || src.includes(`${k}:`) || src.includes(`'${k}'`), `TEXT_TAGS key ${k} exists`);
    // الأزرار التفاعلية انتقلت إلى الثوابت بنصها نفسه (T12-19)
    assert.equal(WA_BUTTON_TEXTS.segment_choice_buttons.charity, 'خيري — مجاني');
    assert.equal(WA_BUTTON_TEXTS.hearing_reply_buttons.yes, 'هحضر');
    for (const f of ['src/services/segments.js', 'src/services/messaging.js', 'src/services/portal-v91.js']) assert.match(read(f), /WA_BUTTON_TEXTS/, f);
    assert.deepEqual(Object.keys(ALERT_TAGS).sort(), Object.keys(ALERT_TEXT).sort(), 'every lawyer alert has a W code');
  });

  test('T12-79: every EMAIL_TAGS template renders; every template of the render switch has an EMAIL_TAGS entry', async () => {
    const t = await startTestApp();
    try {
      for (const k of Object.keys(EMAIL_TAGS)) {
        if (k === 'hello' || k === 'footer') continue;
        const m = t.app.email.render(k, { name: 'مريم', company: { name: 'شركة النيل' }, vars: { subject: 'تنبيه', ref: 'REQ-2026-00001', title: 'عقد', amount: '1000', link: 'https://x.example/r' } });
        assert.ok(m && m.subject && m.text, `render(${k})`);
      }
      const cases = [...read('src/services/email.js').matchAll(/^\s+case '([a-z_]+)':/gm)].map((x) => x[1]);
      assert.ok(cases.length >= 12);
      for (const c of cases) assert.ok(EMAIL_TAGS[c], `EMAIL_TAGS.${c}`);
    } finally {
      await t.close();
    }
  });

  test('messageTag / ruleTag resolve rules, lawyer alerts and segment variants; sampleFill uses the tone', () => {
    assert.equal(ruleTag('hearing_reminder'), 'W-40');
    assert.equal(messageTag('lawyer_alert', { meta: { lawyer_alert: { type: 'assignment.new' } } }), 'W-48');
    assert.equal(messageTag('lines_menu', {}), 'W-01');
    assert.equal(messageTag('no_such_rule', {}), null);
    assert.equal(sampleFill('أهلًا يا {first_name}، تحضر{ي}', 'charity'), 'أهلًا يا أم محمد، تحضري');
    assert.equal(sampleFill('مرحبًا {first_name}', 'paid'), 'مرحبًا أ. نادية');
  });

  // TG-7 (L12-88، S40): كل ما يصل إلى العميل أو الشركة — نص الرسالة، وأجزاء واتساب التفاعلية (الأزرار والقوائم وتذييلها)،
  // ونص القالب ومتغيراته، وعنوان البريد ونصه — بعد تشغيل بالبيانات التجريبية مع قائمة الخطوط، ورسالة صوتية بمسودة آلية
  // يؤكدها الفريق (STT)، وصورة ورقة على واتساب تُصف للتنظيف والقراءة (scan + OCR)، وطلب من الموقع، وبريد الشركات.
  test('L12-88: no outbound WhatsApp text, interactive part or e-mail carries a tag code (seeded run, lines menu, STT and scan flows)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      if (!t.app.db.get("SELECT 1 FROM company_users WHERE email = 'mariam@nilefoods.example'")) {
        const { seedB2bDemo } = await import('../src/seed-v10-b2b.js');
        await seedB2bDemo(t.app);
      }
      t.app.settings.set('wa_lines_menu_enabled', true);
      const { PAID_GENERIC } = await import('../public/assets/js/public/segment.js');
      const p = waPayload({ from: '201012349981', text: PAID_GENERIC });
      p.entry[0].changes[0].value.metadata.phone_number_id = 'PNMAIN';
      await t.app.engine.handleWhatsAppWebhook(p);
      // قائمة الخطوط كاملة على رقم الأفراد والشركات، ثم رسالة صوتية وصورة ورقة (المحاكي يمر بمسار Webhook نفسه)
      const admin = await t.login('admin');
      const sim = (b) => admin.post('/api/admin/simulate/whatsapp', { from: '01092000777', name: 'تجربة', line: 'paid', ...b });
      for (const b of [{ text: 'مرحبا' }, { kind: 'button_reply', reply_id: 'line:litigation' }, { kind: 'list_reply', reply_id: 'path:litigation/defend' }, { kind: 'voice' }, { kind: 'photo', text: 'صورة العقد' }]) {
        const r = await sim(b);
        assert.equal(r.status, 200, JSON.stringify(r.body));
      }
      // STT: مسودة آلية ثم «تأكيد النص» من الفريق؛ الصورة: مهمتا التنظيف والقراءة في الطابور ثم تشغيل الوسائط
      const voice = t.app.db.get("SELECT id FROM documents WHERE mime LIKE 'audio/%' ORDER BY id DESC LIMIT 1");
      t.app.stt.saveDraft(voice.id, { state: 'done', text: 'نص آلي للمراجعة', provider: 'openai_compatible', confidence: 0.8, seconds: 5 });
      const ok = await admin.put(`/api/admin/voice-notes/${voice.id}/transcript`, { text: 'نص آلي للمراجعة', from_auto: true, listened: true, played_ratio: 0.9 });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      const photo = t.app.db.get("SELECT id FROM documents WHERE mime LIKE 'image/%' ORDER BY id DESC LIMIT 1");
      assert.deepEqual(t.app.db.all('SELECT kind FROM media_jobs WHERE document_id = ? ORDER BY kind', photo.id).map((j) => j.kind), ['clean', 'ocr']);
      await t.app.media.processDue({ budgetMs: 5000 });
      // طلب من الموقع (رسالة التأكيد)
      assert.equal((await t.client().post('/api/public/intake', { name: 'سامية عبد الله', phone: '01012345670', description: 'زوجي توفي وأريد معرفة نصيبي من الميراث والمعاش.', consent: true, segment: 'paid' })).status, 201);
      const out = t.app.db.all("SELECT body, automation_rule, meta FROM messages WHERE direction = 'out'");
      assert.ok(out.length > 5, `${out.length} outbound messages`);
      for (const rule of ['lines_menu', 'lines_list', 'lines_next']) assert.ok(out.some((m) => m.automation_rule === rule), `${rule} went out`);
      let interactive = 0;
      for (const m of out) {
        assert.doesNotMatch(m.body, CODE_IN_TEXT, `${m.automation_rule}: ${m.body.slice(0, 80)}`);
        const meta = JSON.parse(m.meta || '{}');
        // ما يُرسل فعلًا غير النص: أجزاء الرسالة التفاعلية، ونص القالب، ومتغيراته
        const sent = JSON.stringify([meta.wa ?? null, meta.wa_text ?? null, meta.vars ?? null]);
        if (meta.wa) interactive++;
        assert.doesNotMatch(sent, CODE_IN_TEXT, `${m.automation_rule}: ${sent.slice(0, 120)}`);
      }
      assert.ok(interactive >= 2, 'buttons and list were scanned');
      const mails = t.app.db.all('SELECT subject, body_text FROM email_outbox');
      assert.ok(mails.length > 0, 'company e-mails were queued');
      for (const e of mails) assert.doesNotMatch(`${e.subject}\n${e.body_text}`, CODE_IN_TEXT, e.subject);
    } finally {
      await t.close();
    }
  });
});

describe('v12 tags TG-5 — GET /api/admin/tags, the page, the switch and the command (T12-26…T12-29، T12-62…T12-64، T12-83)', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    if (!t.app.db.get("SELECT 1 FROM company_users WHERE email = 'mariam@nilefoods.example'")) {
      const { seedB2bDemo } = await import('../src/seed-v10-b2b.js');
      await seedB2bDemo(t.app);
    }
  });
  after(async () => t && t.close());
  const audits = () => Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'tags.registry_viewed'"));

  test('T12-83: 401 anonymous, 403 lawyer, 401 company session (INV-B2); 200 admin with file paths; 200 case manager without; one audit row per call', async () => {
    assert.equal((await t.client().get('/api/admin/tags')).status, 401);
    const lawyer = await t.login('ahmed');
    assert.equal((await lawyer.get('/api/admin/tags')).status, 403);
    const { COMPANY_DEMO_PASSWORD } = await import('../src/seed-v10-b2b.js');
    const login = await fetch(`${t.base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mariam@nilefoods.example', password: COMPANY_DEMO_PASSWORD }) });
    const cookie = /bm_csid=[^;]+/.exec(login.headers.get('set-cookie') || '')?.[0];
    assert.ok(cookie, 'company login');
    // جلسة بوابة الشركات وحدها ← 401 مثل كل مسارات الإدارة (INV-B2 في v10-b2b-server-isolation؛ PW-T5)، لا 403 كما في نص T12-83
    assert.equal((await fetch(`${t.base}/api/admin/tags`, { headers: { cookie } })).status, 401);
    const before0 = audits();
    const admin = await t.login('admin');
    const a = await admin.get('/api/admin/tags');
    assert.equal(a.status, 200);
    assert.ok(a.body.total > 400 && a.body.items.length === a.body.total, `${a.body.items.length} / ${a.body.total}`);
    assert.ok(a.body.items.every((it) => it.file), 'admin sees where each code lives');
    for (const k of ['code', 'prefix', 'surface', 'screen', 'kind', 'text']) assert.ok(k in a.body.items[0], k);
    assert.deepEqual(Object.keys(a.body.surfaces), ['site', 'request', 'company', 'app', 'msg']);
    const cm = await t.login('manager');
    const c = await cm.get('/api/admin/tags');
    assert.equal(c.status, 200);
    assert.ok(c.body.items.every((it) => it.file === undefined && it.line === undefined && it.where === undefined), 'no file paths for the case manager');
    assert.equal(audits(), before0 + 2);
    const row = t.app.db.get("SELECT * FROM security_events WHERE type = 'tags.registry_viewed' ORDER BY id DESC LIMIT 1");
    assert.equal(row.severity, 'info');
    assert.equal(LABELS.security_event['tags.registry_viewed'], 'عرض سجل رموز العناصر');
  });

  test('T12-83: q=s14 returns S-14 first (also «S-١٤»); W and E items carry sample-filled variants; filters by surface and prefix', async () => {
    const admin = await t.login('admin');
    for (const q of ['s14', 'S%2014', encodeURIComponent('S-١٤')]) {
      const r = await admin.get(`/api/admin/tags?q=${q}`);
      assert.equal(r.body.items[0].code, 'S-14', q);
    }
    const w = await admin.get('/api/admin/tags?prefix=W');
    assert.ok(w.body.items.length >= 54);
    assert.deepEqual(w.body.items.slice(0, 6).map((x) => x.code), range('W', 1, 6));
    const w40 = w.body.items.find((x) => x.code === 'W-40');
    assert.deepEqual(w40.variants.map((v) => v.label), ['خيري', 'أفراد وشركات']);
    assert.match(w40.variants[0].text, /أم محمد/);
    assert.match(w40.variants[1].text, /أ\. نادية/);
    assert.doesNotMatch(w40.variants[0].text, /\{[a-z_]+\}/, 'every placeholder filled');
    const e = await admin.get('/api/admin/tags?prefix=E');
    assert.equal(e.body.items.length, 15);
    assert.ok(e.body.items.every((x) => x.variants?.length), 'every e-mail code shows its text');
    const msg = await admin.get('/api/admin/tags?surface=msg');
    assert.ok(msg.body.items.every((x) => x.surface === 'msg'));
    assert.ok(msg.body.items.some((x) => x.prefix === 'D'), 'print codes are listed');
    const words = await admin.get(`/api/admin/tags?q=${encodeURIComponent('تأسيس شركات')}`);
    assert.ok(words.body.items.some((x) => x.code === 'S-14'));
  });

  test('T12-83: automations list items have `tag`; outbox rows carry `tag` when the rule is known; e-mail outbox rows too', async () => {
    const admin = await t.login('admin');
    const rules = (await admin.get('/api/admin/automations')).body.rules;
    const hr = rules.find((r) => r.key === 'hearing_reminder');
    assert.equal(hr.tag, 'W-40');
    const out = (await admin.get('/api/admin/outbox')).body;
    const rows = out.items || out.messages || out.rows || out;
    assert.ok(Array.isArray(rows) && rows.length, 'outbox rows');
    assert.ok(rows.every((m) => 'tag' in m));
    assert.ok(rows.some((m) => /^W-\d+$/.test(m.tag || '')), 'a known rule maps to its W code');
    t.app.email.queue({ to: 'x@example.com', subject: 'تجربة', text: 'نص', purpose: 'test' });
    const em = (await admin.get('/api/admin/email-outbox')).body;
    const erows = em.items || em.rows || em;
    assert.ok(Array.isArray(erows) && erows.length, 'e-mail outbox rows');
    assert.ok(erows.every((r) => 'tag' in r));
    assert.ok(erows.some((r) => r.tag === 'E-13'), 'purpose test → E-13');
  });

  test('T12-63/T12-27: /tags route for staff, nav item for admin, account card, Ctrl+K command; the page reads the endpoint and never writes', () => {
    const routes = read('public/assets/js/app/routes.js');
    assert.match(routes, /path: '\/tags', load: \(\) => import\('\.\/pages\/admin\/tags\.js'\), roles: STAFF, title: 'رموز العناصر'/);
    assert.match(read('public/assets/js/app/shell.js'), /isAdmin && navItem\('\/tags', 'grid', \{ tag: 'NAV-\d+' \}\)/); // TG-6: nav items carry their own codes (T12-91)
    const page = read('public/assets/js/app/pages/admin/tags.js');
    assert.match(page, /api\.get\('\/admin\/tags'\)/);
    assert.doesNotMatch(page, /api\.(?:post|put|patch|del)\(/, 'read-only (T12-64)');
    for (const s of ['الكل', 'رموز العناصر', 'إظهار رموز العناصر على هذا الجهاز']) assert.ok(page.includes(s), s);
    const account = read('public/assets/js/app/pages/account.js');
    assert.match(account, /if \(data\.user\.role !== 'admin' && data\.user\.role !== 'case_manager'\) return null;/);
    for (const s of ['رموز العناصر', 'إظهار رموز العناصر على هذا الجهاز', 'قائمة كل الرموز', "href: '#/tags'"]) assert.ok(account.includes(s), s);
    const search = read('public/assets/js/app/components/search.js');
    assert.match(search, /if \(isLawyer\) return null;/);
    assert.ok(search.includes('إظهار رموز العناصر') && search.includes('إخفاء رموز العناصر'));
    assert.match(read('public/assets/js/lib/tags-boot.js'), /e\.altKey && e\.shiftKey && e\.code == 'KeyT' && !e\.target\.matches\?\.\(':read-write'\)/, 'Alt+Shift+T ignored in text fields only (T12-28)');
  });

  test('the page search ranks like the server: exact code, then partial code, then words', async () => {
    const { searchItems } = await import('../public/assets/js/app/pages/admin/tags.js');
    const items = [
      { code: 'S-14', prefix: 'S', text: 'تأسيس شركات', screen: 'الخدمات' },
      { code: 'S-140', prefix: 'S', text: 'x', screen: 'y' },
      { code: 'T-53', prefix: 'T', text: 'تأسيس شركات', screen: 'الشجرة' },
      { code: 'KIT-06', prefix: 'KIT', text: 'إغلاق', screen: 'مكتبة' },
    ];
    assert.deepEqual(searchItems(items, 's14').map((x) => x.code), ['S-14', 'S-140']);
    assert.deepEqual(searchItems(items, 'تأسيس').map((x) => x.code), ['S-14', 'T-53']);
    assert.deepEqual(searchItems(items, 'kit').map((x) => x.code), ['KIT-06']);
    assert.deepEqual(searchItems(items, 'KIT-0').map((x) => x.code), ['KIT-06'], 'a half-typed number still matches');
    assert.equal(searchItems(items, '').length, 4);
  });

  // review (regression): «تاسيس» (بلا همزة) لم تجد شيئًا في الصفحة ولا في الخادم ولا في npm run tags -- find
  test('review: Arabic words match without hamza/diacritics — the page, the endpoint and the CLI search fold the letters', async () => {
    const { searchItems } = await import('../public/assets/js/app/pages/admin/tags.js');
    const items = [{ code: 'S-14', prefix: 'S', text: 'تأسيس شركات', screen: 'الخدمات' }, { code: 'D-07', prefix: 'D', text: 'إعلام الوراثة', screen: 'المطبوعات' }];
    assert.deepEqual(searchItems(items, 'تاسيس شركات').map((x) => x.code), ['S-14']);
    assert.deepEqual(searchItems(items, 'اعلام الوراثه').map((x) => x.code), ['D-07']);
    const admin = await t.login('admin');
    for (const q of ['تاسيس شركات', 'تَأْسِيس']) {
      const r = await admin.get(`/api/admin/tags?q=${encodeURIComponent(q)}`);
      assert.ok(r.body.items.some((x) => x.code === 'S-14'), q);
    }
    const { searchRegistry } = await import('../src/tags/registry.js');
    assert.deepEqual(searchRegistry({ items }, 'تاسيس').map((x) => x.code), ['S-14']);
  });
});

describe('v12 tags — tree pages render exactly the codes of entry-tree.js allTags() (spec §11.2)', () => {
  test('the T- codes on / and every /start/* page (plus the restored «خيري» line) equal allTags()', async () => {
    const t = await startTestApp();
    try {
      const all = allTags();
      const seen = new Set();
      const collect = async (url) => {
        const r = await fetch(t.base + url);
        assert.equal(r.status, 200, url);
        for (const m of (await r.text()).matchAll(/data-tag="(T-\d+)"/g)) seen.add(m[1]);
      };
      for (const q of all.filter((x) => x.kind === 'question')) await collect(q.path ? `/start/${q.path}` : '/');
      t.app.settings.set('charity_public', true);
      await collect('/');
      const want = new Set(all.map((x) => x.tag).filter((c) => c.startsWith('T-')));
      assert.deepEqual([...seen].sort(), [...want].sort());
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── TG-7: الفرض (T12-73…T12-78، T12-84، T12-94) ─────────────────────────

const LEDGER = loadLedger(ROOT);
// TG-7 (T12-94): التغطية مفروضة. المفتاح في src/tags/registry.js (TAGS_ENFORCE = '1')، والدفتر المجمَّد يجعله دائمًا.
const ENFORCE_COVERAGE = enforceCoverage(LEDGER);
/** يفشل الاختبار على المشكلات ما دام الفرض قائمًا، وإلا يطبعها ويتخطاها (TAGS_ENFORCE=0 قبل التجميد) */
function enforce(t, problems, label) {
  if (!problems.length) return;
  if (ENFORCE_COVERAGE) assert.deepEqual(problems, [], label);
  process.stdout.write(`# tags ${label} (report only, TAGS_ENFORCE=0): ${problems.length}\n#   ${problems.slice(0, 20).join('\n#   ')}\n`);
  t.skip(`${label}: ${problems.length} (report only)`);
}

const KEY_RENDERED = new Set(['section', 'header', 'footer', 'nav', 'h1', 'h2', 'h3', 'button', 'details', 'form', 'input', 'select', 'textarea', 'a']);
const VOID_EL = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/**
 * T12-75: مُجزِّئ وسوم متسامح بلا تبعيات يمشي في HTML المعروض بمكدس عناصر (التعليقات وscript/style/template تُتخطى).
 * يعيد العناصر الأساسية بلا data-tag: كل section/header/footer/nav/h1–h3/button/details/form/select/textarea، وinput غير المخفي،
 * وكل a ليس داخل <p>. data-notag="سبب" وحده يستثني (يُطبع).
 */
function untaggedIn(html) {
  const missing = [];
  const notag = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[3]) continue;
    const el = m[3].toLowerCase();
    if (m[2]) {
      const i = stack.lastIndexOf(el);
      if (i >= 0) stack.length = i;
      continue;
    }
    const attrs = m[4] || '';
    if (KEY_RENDERED.has(el) && !/\sdata-tag\s*=/.test(attrs)) {
      const why = /\sdata-notag\s*=\s*"([^"]*)"/.exec(attrs);
      const hidden = el === 'input' && /\stype\s*=\s*["']?hidden\b/i.test(attrs);
      const inlineLink = el === 'a' && stack.includes('p');
      if (why) notag.push(`${el}: ${why[1]}`);
      else if (!hidden && !inlineLink) missing.push(`<${el}${attrs.replace(/\s+/g, ' ').slice(0, 80)}>`);
    }
    if (!VOID_EL.has(el) && !m[5]) stack.push(el);
  }
  return { missing, notag };
}

/** كائنات حرفية في المصدر لها كل المفاتيح keys (بالمُجزِّئ نفسه في scan.js): [{ line, props: Map(key → نص حرفي أو null) }] */
function objectsWith(src, keys) {
  const { toks } = tokenize(src);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t !== 'p' || toks[i].v !== '{' || toks[i].close == null) continue;
    const props = new Map();
    for (let k = i + 1; k < toks[i].close; k++) {
      const tk = toks[k];
      if (tk.parent !== i || !(tk.t === 'id' || tk.t === 'str')) continue;
      const prev = toks[k - 1];
      const colon = toks[k + 1];
      if (!(prev.v === '{' || prev.v === ',') || colon?.v !== ':') continue;
      const name = tk.t === 'id' ? tk.v : src.slice(tk.s + 1, tk.e - 1);
      const val = toks[k + 2];
      props.set(name, val?.t === 'str' ? src.slice(val.s + 1, val.e - 1) : null);
    }
    if (keys.every((x) => props.has(x))) out.push({ line: src.slice(0, toks[i].s).split('\n').length, props });
  }
  return out;
}
const codeRe = (prefix) => new RegExp(`^${prefix}-(?:0[1-9]|[1-9]\\d|[1-9]\\d\\d)$`);

describe('v12 tags TG-7 — coverage enforced, registry in sync, budgets (T12-73…T12-78، T12-84، T12-94)', () => {
  test('the switch: TAGS_ENFORCE is on from TG-7 (TAGS_ENFORCE=0 only reports before the freeze); the CLI check fails on a gap', () => {
    assert.equal(enforceCoverage({ frozen: false }, {}), true, 'TG-7 default');
    assert.equal(enforceCoverage({ frozen: false }, { TAGS_ENFORCE: '0' }), false);
    assert.equal(enforceCoverage({ frozen: true }, { TAGS_ENFORCE: '0' }), true, 'the freeze makes it permanent');
    const gaps = coverageGaps({ rows: [{ file: 'public/intake.html', keys: 6, untagged: 3, sample: [] }, { file: 'public/intake.html', keys: 7, untagged: 4, sample: [] }, { file: 'public/x.html', keys: 1, untagged: 1, sample: [] }, { file: 'public/about.html', keys: 40, untagged: 40, sample: [] }] });
    assert.deepEqual(gaps.map((g) => `${g.file}:${g.untagged}`), ['public/intake.html:4', 'public/x.html:1'], 'only what is not untagged by design');
    for (const [f, v] of Object.entries(UNTAGGED_BY_DESIGN)) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), f);
      assert.match(v.why, /[؀-ۿ]/, `${f}: an Arabic reason for the gate report`);
    }
    // أدوات الاختبارات التالية نفسها: المُجزِّئ يرى ما بلا رمز ويستثني الرابط داخل <p> والحقل المخفي وdata-notag فقط
    const u = untaggedIn('<!-- <a href="/c"> --><header data-tag="H-12"><p>نص <a href="/x">رابط</a></p><a href="/y">زر</a><input type="hidden" name="h"><input name="q"></header><section data-notag="زخرفة"><h2>ع</h2></section><script>"<button>"</script><br/><details><summary>س</summary></details>');
    assert.deepEqual(u.missing, ['<a href="/y">', '<input name="q">', '<h2>', '<details>']);
    assert.deepEqual(u.notag, ['section: زخرفة']);
    const o = objectsWith("const A = [{ title: 'x', items: [], tag: 'NAV-01' }, { title: 'y', items: [{ title: 'z', items: [] }] }];", ['title', 'items']);
    assert.deepEqual(o.map((x) => [x.props.get('title'), x.props.get('tag') ?? null]), [['x', 'NAV-01'], ['y', null], ['z', null]]);
  });

  test('T12-73: ledger — no retired code is defined; next > every defined number; no X-00 left; once frozen, every known number is defined or retired', (t) => {
    const scan = scanSources({ root: ROOT });
    const problems = [];
    const defined = new Set(scan.defs.map((d) => d.code));
    for (const d of scan.defs) {
      const e = LEDGER.prefixes[d.prefix];
      if (!e) problems.push(`${d.code}: ${d.prefix} has no ledger entry (npm run tags)`);
      else {
        if (e.retired?.[String(Number(d.num))]) problems.push(`${d.code} (${d.file}:${d.line}) reuses a retired code`);
        if (!(e.next > Number(d.num))) problems.push(`${d.code}: ${d.prefix}.next = ${e.next}`);
      }
    }
    for (const p of scan.placeholders) problems.push(`${p.code} ${p.file}:${p.line} not numbered (npm run tags)`);
    if (LEDGER.frozen) {
      for (const [prefix, e] of Object.entries(LEDGER.prefixes)) {
        for (const n of expandNums(e.known)) if (!defined.has(codeOf(prefix, n)) && !e.retired?.[String(n)]) problems.push(`${codeOf(prefix, n)} vanished without a retired record`);
      }
    }
    enforce(t, problems, 'T12-73 ledger');
  });

  test('T12-74: TAGS.md and ledger.json equal what `npm run tags` writes from the live source (line numbers aside)', async (t) => {
    const scan = scanSources({ root: ROOT });
    const version = readVersion(ROOT);
    const md = read('TAGS.md');
    const want = stripLines(renderMarkdown(buildRegistry(scan, { ledger: LEDGER, moduleData: await loadModuleData(ROOT), version })));
    const have = stripLines(md);
    const problems = [];
    if (want !== have) {
      const a = want.split('\n');
      const b = have.split('\n');
      const i = a.findIndex((l, k) => l !== b[k]);
      problems.push(`TAGS.md is stale at line ${i + 1}: want «${(a[i] ?? '').slice(0, 120)}», have «${(b[i] ?? '').slice(0, 120)}» (npm run tags)`);
    }
    if (ledgerText(updateLedger(LEDGER, scan, { version, lastText: lastTextFrom(md) })) !== ledgerText(LEDGER)) problems.push('src/tags/ledger.json is stale (npm run tags)');
    enforce(t, problems, 'T12-74 registry sync');
  });

  test('T12-75: every key element of the rendered public pages carries data-tag (archived and restored «خيري», a real /p/, intake shells, legal pages, 404)', async (t) => {
    const app = await startTestApp();
    try {
      const r = await app.client().post('/api/public/intake', { name: 'سامية عبد الله', phone: '01012345670', description: 'زوجي توفي وأريد معرفة نصيبي من الميراث والمعاش.', consent: true, segment: 'paid' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const portal = r.body.portal_url;
      assert.match(portal, /^\/p\/[\w-]{20,}$/);
      const tree = allTags().filter((x) => x.kind === 'question' && x.path).map((x) => `/start/${x.path}`);
      const pages = ['/', ...tree, '/services', '/intake?seg=paid', '/intake?seg=paid&mode=company', '/intake?path=consultation/family/divorce', '/portal', portal, '/about', '/privacy', '/terms', '/data-deletion', '/no-such-page-v12'];
      const problems = [];
      const exempt = [];
      let seen = 0;
      const check = async (url, label = url, headers = {}) => {
        const res = await fetch(app.base + url, { headers });
        assert.ok([200, 404].includes(res.status), `${url} → ${res.status}`);
        const html = await res.text();
        seen += (html.match(/\sdata-tag="/g) || []).length;
        const { missing, notag } = untaggedIn(html);
        for (const x of missing) problems.push(`${label}: ${x}`);
        for (const x of notag) exempt.push(`${label}: ${x}`);
      };
      for (const u of pages) await check(u);
      // «خيري» معاد: صفحات الأفراد والشركات تبقى مرمَّزة كاملة (صف T-81 على «/»، رابط F-16 في التذييل)؛ جانب «خيري» (رأسه
      // وتذييله وصفحاته) بلا رموز عن قصد، ويفحصه T12-76
      app.app.settings.set('charity_public', true);
      for (const u of ['/', '/services', '/privacy', '/terms', portal]) await check(u, `${u} (restored)`, { cookie: 'bm_seg=paid' });
      if (exempt.length) process.stdout.write(`# tags data-notag on public pages: ${exempt.join(' · ')}\n`);
      assert.ok(seen > 900, `${seen} data-tag attributes seen`);
      enforce(t, problems, 'T12-75 rendered public coverage');
    } finally {
      await app.close();
    }
  });

  test('T12-76: charity markup stays untagged (11.0 hashes) except the r2 KH notice, which carries exactly KH-01…KH-04', async () => {
    for (const f of ['public/about.html', 'public/index.html']) assert.doesNotMatch(read(f), /data-tag=/, f);
    const defs = scanSources({ root: ROOT }).defs;
    assert.deepEqual(defs.filter((d) => d.file === 'public/assets/js/public/recorder.js').map((d) => d.code), [], 'the archived recorder (RV) defines no code');
    assert.deepEqual(defs.filter((d) => d.file === 'public/khayri-paused.html').map((d) => d.code).sort(), range('KH', 1, 4));
    assert.equal(defs.filter((d) => d.prefix === 'KH').length, 4, 'KH-05… stay reserved for 12.1');
    const app = await startTestApp();
    try {
      const codes = async (u) => [...(await (await fetch(app.base + u)).text()).matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual((await codes('/khayri')).sort(), range('KH', 1, 4), 'archived: the notice alone');
      app.app.settings.set('charity_public', true);
      for (const u of ['/khayri', '/about', '/intake?seg=charity']) assert.deepEqual(await codes(u), [], `${u} (restored): no codes on charity screens`);
    } finally {
      await app.close();
    }
  });

  test('T12-77: data lists carry a literal tag of their prefix (tree, intake questions and answers, paid nav/how/trust/FAQ, company catalog, nav groups and items)', async (t) => {
    const problems = [];
    const need = (where, tag, prefix) => {
      if (!codeRe(prefix).test(String(tag || ''))) problems.push(`${where}: ${tag ?? 'no tag'} (want ${prefix}-NN)`);
    };
    // الشجرة: كل عقدة برمز T وكل سؤال (عقدة لها فروع) برمز T، والمشترك والمعاد
    const walk = (node, at) => {
      if (node.children?.length) need(`${at} (question)`, node.qtag, 'T');
      for (const c of node.children || []) {
        need(`${at}/${c.id}`, c.tag, 'T');
        walk(c, `${at}/${c.id}`);
      }
    };
    need('TREE (question)', TREE.qtag, 'T');
    walk(TREE, '');
    for (const [k, g] of Object.entries(TREE.shared || {})) walk(g, `shared:${k}`);
    need('TREE.restored', TREE.restored?.tag, 'T');
    for (const x of allTags()) need(`allTags ${x.kind} ${x.path ?? x.question ?? ''}${x.value ? `:${x.value}` : ''}`, x.tag, x.kind.startsWith('intake') ? 'I' : 'T');
    // أسئلة الطلب: كل سؤال يُعرض في طلب الأفراد والشركات له رمز، وكل صف إجابة كذلك (allTags يمر بها كلها)
    for (const id of [...Object.keys(PAID_QUESTIONS), ...Object.keys(TREE_QUESTIONS)]) need(`QUESTION_TAGS.${id}`, QUESTION_TAGS[id], 'I');
    for (const [k, v] of Object.entries(ANSWER_TAGS)) need(`ANSWER_TAGS.${k}`, v, 'I');
    // الموقع: الخطوط، «كيف نعمل»، «التزامنا معكم»، قائمة الرأس، والأسئلة الشائعة
    const site = await import('../src/site.js');
    for (const [name, list] of Object.entries({ SVC_ROWS: site.SVC_ROWS, PAID_STEPS: site.PAID_STEPS, PAID_TRUST: site.PAID_TRUST })) list.forEach((x, i) => need(`${name}[${i}]`, x.tag, 'S'));
    const siteSrc = read('src/site.js');
    const navPaid = /const NAV_PAID = \[[\s\S]*?\n {2}\];/.exec(siteSrc)?.[0] || '';
    const navItems = objectsWith(navPaid, ['hash', 'label']);
    assert.ok(navItems.length >= 4, 'NAV_PAID found');
    for (const o of navItems) need(`NAV_PAID ${o.props.get('label')}`, o.props.get('tag'), 'H');
    const faq = /function paidFaqItems\(ps\) \{[\s\S]*?\n {2}\}\n/.exec(siteSrc)?.[0] || '';
    const faqItems = objectsWith(faq, ['q', 'a']);
    assert.ok(faqItems.length >= 5, 'paid FAQ found');
    for (const o of faqItems) need(`paid FAQ «${o.props.get('q')}»`, o.props.get('tag'), 'S');
    // كتالوج الشركات: الأنواع والحقول والقوائم الظاهرة
    const cat = await import('../public/assets/js/lib/company-catalog-fields.js');
    for (const ty of cat.REQUEST_TYPES) need(`REQUEST_TYPES.${ty.key}`, ty.tag, 'CK');
    for (const [k, list] of Object.entries(cat.TYPE_FIELDS)) for (const f of list) need(`TYPE_FIELDS.${k}.${f.key}`, f.tag, 'CK');
    for (const [k, list] of Object.entries(cat.MEMORY_FIELDS)) for (const f of list) need(`MEMORY_FIELDS.${k}.${f.key}`, f.tag, 'CK');
    for (const f of [...cat.COMMON_FIELDS, ...cat.MEMORY_COMMON_FIELDS]) need(`common field ${f.key}`, f.tag, 'CK');
    for (const x of [...cat.VISIBILITIES, ...cat.OUTPUT_LANGUAGES]) need(`option ${x.key}`, x.tag, 'CK');
    // القوائم: مجموعات الفريق وعناصرها، قائمة المحامي وشريطه، وتبويبات بوابة الشركات وروابطها الجانبية
    const shell = read('public/assets/js/app/shell.js');
    for (const o of objectsWith(shell, ['title', 'items'])) need(`shell.js group «${o.props.get('title')}» (line ${o.line})`, o.props.get('tag'), 'NAV');
    const navCalls = [...shell.matchAll(/(?<!const )\bnavItem\('([^']+)'[^\n]*/g)];
    assert.ok(navCalls.length >= 20, 'staff nav items found');
    for (const [line, href] of navCalls) need(`navItem ${href}`, /tag: '([A-Z]+-\d+)'/.exec(line)?.[1], 'NAV');
    const lshell = objectsWith(read('public/assets/js/app/lawyer-shell.js'), ['label', 'icon']);
    assert.ok(lshell.length >= 10, 'lawyer nav items found');
    for (const o of lshell) need(`lawyer-shell.js item (line ${o.line})`, o.props.get('tag'), 'NAV');
    const cshell = read('public/assets/js/company/shell.js');
    const tuples = [...cshell.matchAll(/^\s*\['\w+', '#\/[^\n]*/gm)].map((m) => m[0]);
    const sides = [...cshell.matchAll(/\bsideItem\('[^\n]*/g)].map((m) => m[0]);
    assert.ok(tuples.length >= 4 && sides.length >= 2, 'company tabs and side links found');
    for (const line of [...tuples, ...sides]) need(`company/shell.js ${line.trim().slice(0, 40)}`, /tag: '([A-Z]+-\d+)'/.exec(line)?.[1], 'CC');
    enforce(t, problems, 'T12-77 data coverage');
  });

  test('T12-78: every key builder call in the SPA and public modules is tagged (or tags:skip); page modules define ≥ 5 codes and components ≥ 2 unless they have fewer key elements', (t) => {
    const report = coverageReport({ root: ROOT });
    const problems = coverageGaps(report).map((g) => `${g.file}: ${g.untagged} untagged (${g.sample.join(' ')}); npm run tags -- autotag ${g.file}`);
    assert.ok(report.total > 3000, `${report.total} key elements`);
    const defs = new Map();
    for (const d of scanSources({ root: ROOT }).defs) defs.set(d.file, (defs.get(d.file) || 0) + 1);
    const keys = new Map(report.rows.map((r) => [r.file, r.keys]));
    const small = [];
    for (const [re, min] of [[/^public\/assets\/js\/(?:app|company)\/pages\/.+\.js$/, 5], [/^public\/assets\/js\/app\/components\/.+\.js$/, 2]]) {
      for (const f of report.rows.map((r) => r.file).concat([...defs.keys()]).filter((x, i, a) => re.test(x) && a.indexOf(x) === i)) {
        const n = defs.get(f) || 0;
        const k = keys.get(f) || 0;
        if (n < Math.min(min, k)) problems.push(`${f}: ${n} codes for ${k} key elements (want ≥ ${Math.min(min, k)})`);
        else if (n < min && k) small.push(`${f} ${n}/${k}`);
      }
    }
    if (small.length) process.stdout.write(`# tags small modules (all their key elements tagged): ${small.join(', ')}\n`);
    enforce(t, problems, 'T12-78 SPA builder coverage');
  });

  test('T12-84: budgets after tagging — tags.js ≤ 9,216 B br as served and never preloaded; tagging grows /services by ≤ 1,228 B br; /p/ loads no tags module up front', async () => {
    const { transformAsset, setPublicRoot, preloadClosure } = await import('../src/site-assets.js');
    const PUB = path.join(ROOT, 'public');
    setPublicRoot(PUB);
    const br = (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
    const overlay = br(transformAsset(OVERLAY));
    assert.ok(overlay <= 9216, `tags.js ${overlay} B br`);
    const pc = preloadClosure(path.join(PUB, 'assets/js/public/portal.js'), PUB).map((u) => path.basename(u.split('?')[0]));
    assert.ok(!pc.some((f) => /^tags/.test(f)), `/p/ closure: ${pc.join(', ')}`);
    const app = await startTestApp();
    try {
      const html = await (await fetch(`${app.base}/services`)).text();
      const n = (html.match(/ data-tag="[A-Z]{1,3}-\d{2,3}"/g) || []).length;
      const growth = br(Buffer.from(html)) - br(Buffer.from(html.replace(/ data-tag="[A-Z]{1,3}-\d{2,3}"/g, '')));
      assert.ok(n >= 80, `${n} codes on /services`);
      assert.ok(growth <= 1228, `/services grows by ${growth} B br for ${n} codes`);
    } finally {
      await app.close();
    }
  });

  test('privacy: the storage list names bm_tags (session storage; the staff switch on the device) and says it holds no personal data', async () => {
    const app = await startTestApp();
    try {
      const html = await (await fetch(`${app.base}/privacy`)).text();
      const li = /<li>[^<]*\(bm_tags\)[^<]*<\/li>/.exec(html)?.[0] || '';
      assert.ok(li, 'the bm_tags line is rendered');
      for (const s of ['رموز العناصر', 'ذاكرة الجلسة', 'من حسابه', 'لا يحتوي على أي بيانات شخصية']) assert.ok(li.includes(s), s);
    } finally {
      await app.close();
    }
  });
});

// ───────────────────────── review (regressions for the bugs found in the lane review) ─────────────────────────
describe('v12 tags review — overlay panel, jump, frame cost, search folding, registry text', () => {
  const overlaySrc = () => read('public/assets/js/lib/tags.js');
  const fnBody = (src, name) => {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at >= 0, name);
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
    }
    return src.slice(at);
  };

  test('foldAr folds hamza forms, alef maqsura, taa marbuta and strips diacritics/tatweel', async () => {
    const { foldAr } = await import('../public/assets/js/lib/tags-pages.js');
    assert.equal(foldAr('تأسيس'), 'تاسيس');
    assert.equal(foldAr('إعلام الوراثة'), 'اعلام الوراثه');
    assert.equal(foldAr('آخر مستشفى'), 'اخر مستشفي');
    assert.equal(foldAr('مؤسسة شئون'), 'موسسه شيون');
    assert.equal(foldAr('تَأْسِيـــس'), 'تاسيس');
    assert.equal(foldAr('S-14'), 's-14');
  });

  // bug: the panel list was replaced every second (1-s timer → full pass → renderList), so keyboard focus fell to <body>
  // and a press held across a tick (or a tap at the wrong moment) never became a click
  test('panel list: rows filter by code part or folded Arabic words; the list is rebuilt only when its rows change', async () => {
    const { panelRows } = await import('../public/assets/js/lib/tags.js');
    const entries = [['S-12', 'استشارة', 1], ['S-14', 'تأسيس شركات', 1], ['F-07', 'للشركات', 2], ['INB-04', 'كل الأنواع', 3]];
    const codes = (q) => panelRows(entries, q).rows.map((r) => r[0]);
    assert.deepEqual(codes('s14'), ['S-14']);
    assert.deepEqual(codes('S 14'), ['S-14']);
    assert.deepEqual(codes('S-١٤'), ['S-14']);
    assert.deepEqual(codes('تاسيس'), ['S-14'], 'no hamza');
    assert.deepEqual(codes('شركات'), ['S-14', 'F-07']);
    assert.deepEqual(codes('inb'), ['INB-04']);
    assert.equal(codes('').length, 4);
    const a = panelRows(entries, '').sig;
    assert.equal(panelRows(entries.map((e) => [...e]), '').sig, a, 'same rows → same key (no rebuild)');
    assert.notEqual(panelRows([...entries.slice(0, 3), ['INB-04', 'كل الأنواع', 4]], '').sig, a, 'a count change rebuilds');
    assert.notEqual(panelRows(entries, 's').sig, a, 'a new query rebuilds');
    const body = fnBody(overlaySrc(), 'renderList');
    const guard = body.indexOf('if (sig === s.listSig) return;');
    assert.ok(guard > 0 && guard < body.indexOf('list.replaceChildren('), 'the guard runs before the rows are replaced');
    assert.match(body, /focus\(\{ preventScroll: true \}\)/, 'focus returns to the same row after a real rebuild');
    assert.match(body, /jumpTo\(code, s\.codes\.get\(code\)\)/, 'a row looks its element up when clicked');
  });

  // bug: the jump showed its box/flash 350 ms after scrollIntoView while the smooth scroll was still running, and the scroll
  // listener hid it at once — «s14» + Enter from the bottom of /services scrolled but never flashed
  test('jump: the flash waits until the element stops moving (whenStill), with a cap and a cancel', async () => {
    const { whenStill } = await import('../public/assets/js/lib/tags.js');
    const run = (positions, opts = {}) => {
      const queue = [];
      let i = 0;
      let doneAt = -1;
      whenStill(() => positions[Math.min(i++, positions.length - 1)], () => (doneAt = i), { raf: (f) => queue.push(f), ...opts });
      for (let k = 0; k < 500 && queue.length; k++) queue.shift()();
      return doneAt;
    };
    // a smooth scroll: moving for 6 frames, then still
    const scroll = ['900,0', '700,0', '500,0', '350,0', '300,0', '290,0', '288,0', '288,0', '288,0', '288,0', '288,0'];
    assert.equal(run(scroll), 10, 'done on the 3rd frame after the element stopped (not while it moves)');
    assert.equal(run(['1,0', '1,0', '1,0', '1,0']), 4, 'already in place: done after 3 still frames');
    assert.equal(run(Array.from({ length: 300 }, (_, k) => `${k},0`), { max: 50 }), 50, 'never still: the cap ends it');
    assert.equal(run(scroll, { alive: () => false }), -1, 'a newer jump or stop() cancels it');
    const jump = fnBody(overlaySrc(), 'jumpTo');
    assert.match(jump, /whenStill\(read, flash/);
    assert.doesNotMatch(jump, /\}, 350\)/, 'no fixed 350 ms flash');
  });

  // bug: every new badge read offsetWidth right after being appended — one forced layout per badge; the first pass on /services
  // took 20–41 ms (> 16 ms, PW-T1). Badges are now created first and measured in one read; badges also avoid the «الرموز» tab
  test('frame: badge widths are measured once per frame (no layout per new badge); badges keep clear of the «الرموز» tab', async () => {
    const src = overlaySrc();
    const badgeFor = fnBody(src, 'badgeFor');
    assert.doesNotMatch(badgeFor, /offsetWidth/, 'creating a badge does not force a layout');
    const frame = fnBody(src, 'frame');
    const m = frame.indexOf('measure(shown.map(');
    assert.ok(m > 0 && m < frame.indexOf('pickSpot('), 'one batched measure before placing');
    assert.match(frame, /const placed = s\.fabRect \? \[s\.fabRect\] : \[\];/);
    const { pickSpot } = await import('../public/assets/js/lib/tags.js');
    const fab = { x: 0, y: 320, w: 74, h: 48 };
    assert.deepEqual(pickSpot([{ x: 10, y: 330 }, { x: 120, y: 330 }], 44, 20, [fab], { vw: 1366, vh: 768 }), { x: 120, y: 330, w: 44, h: 20 });
  });

  test('/app#/tags: «لا نتائج» instead of «0 رمز»; the device switches follow other tabs (storage event)', () => {
    const page = read('public/assets/js/app/pages/admin/tags.js');
    assert.match(page, /found\.length \? count\(found\.length, CODES\) : 'لا نتائج'/);
    for (const f of ['public/assets/js/app/pages/admin/tags.js', 'public/assets/js/app/pages/account.js']) assert.match(read(f), /addEventListener\('storage', /, f);
  });

  // bug: 1,198 of 5,320 TAGS.md rows (22 %) read «(نص متغير)» — every company-portal text comes from W.… (words.js) and the
  // intake's from COPY.…, the sidebar's from routes.js; the registry now resolves those references
  test('registry: texts from W.… / aliases / COPY.… / navItem routes are resolved; few rows stay «(نص متغير)»', async () => {
    const { firstRef, refAliases, tokenize: tk } = await import('../src/tags/scan.js');
    const src = "const A = W.account;\nfield(A.name, x, { tag: 'CA-02' }); button(W.thread.retry, { tag: 'CQ-05' }); h('p', W.addressForm(n));";
    const { toks } = tk(src);
    const roots = refAliases(src);
    assert.equal(firstRef(toks, toks.findIndex((x) => x.v === 'field'), toks.length, roots), 'W.account.name', 'A = W.account in this file');
    const at = toks.findIndex((x) => x.v === 'button');
    assert.equal(firstRef(toks, at, toks.length, roots), 'W.thread.retry');
    const fnAt = toks.findIndex((x) => x.v === 'addressForm') - 2;
    assert.equal(firstRef(toks, fnAt, toks.length, roots), '', 'a function call is not text');
    const { resolveRef } = await import('../src/tags/registry.js');
    const words = { W: { account: { name: 'الاسم' }, req: { item: ['عنصر واحد', 'عنصران'] } }, COPY: { done: 'وصلنا طلبكم' }, ROUTE: { '/inbox': 'صندوق الوارد' } };
    assert.equal(resolveRef(words, 'public/assets/js/company/pages/account.js', 'W.account.name'), 'الاسم');
    assert.equal(resolveRef(words, 'public/assets/js/lib/company-ui.js', 'W.req.item'), 'عنصر واحد');
    assert.equal(resolveRef(words, 'public/assets/js/app/pages/admin/inbox.js', 'W.account.name'), '', 'W is the company words only');
    assert.equal(resolveRef(words, 'public/assets/js/public/intake.js', 'COPY.done'), 'وصلنا طلبكم');
    assert.equal(resolveRef(words, 'public/assets/js/app/shell.js', 'ROUTE:/inbox'), 'صندوق الوارد');
    const md = read('TAGS.md');
    const row = (code) => md.split('\n').find((l) => l.startsWith(`| ${code} |`)) || '';
    assert.match(row('CA-02'), /\| الاسم \|/);
    assert.match(row('CQ-05'), /إعادة المحاولة/);
    assert.match(row('NAV-07'), /صندوق الوارد/);
    assert.match(row('I-60'), /وصلنا طلبكم/);
    const rows = md.split('\n').filter((l) => /^\| [A-Z]{1,3}-\d{2,3} \|/.test(l));
    const variable = rows.filter((l) => l.includes('(نص متغير)')).length;
    assert.ok(variable / rows.length <= 0.15, `${variable} of ${rows.length} rows still read «(نص متغير)»`);
  });

  // bug: `npm run tags -- --check` printed 5,334 (definition sites) while TAGS.md, the page and the endpoint say 5,320 codes
  test('the CLI check counts codes, not definition sites (same number as TAGS.md)', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/tags.js', '--check'], { cwd: ROOT, encoding: 'utf8' });
    const n = /\((\d+) رمز/.exec(out)?.[1];
    const total = /الإصدار [^·]+· (\d+) رمز/.exec(read('TAGS.md'))?.[1];
    assert.ok(n && total, out);
    assert.equal(n, total);
  });
});
