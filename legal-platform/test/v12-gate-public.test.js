// v12 gate — fixer-public: K-P1…K-P7 (scratchpad/v12-gate-progress.md). K-P1 lives in test/v11-gate-public.test.js 39 (the clock is
// pinned there: the 10.0 hash was taken while the office was closed); K-P6 is the budget in test/v10-b2b-portal.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startTestApp } from './helpers.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let t;
const get = (p, headers = {}) => t.client().get(p, headers);
const jsonOf = (h, id) => JSON.parse(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(h)[1]);
const mainOf = (h) => /<main[\s\S]*?<\/main>/.exec(h)[0];
const firstStyle = (h) => (/<style>([\s\S]*?)<\/style>/.exec(h) || [])[1] || '';
/** النص الظاهر من الجسم (بلا سكربتات وأنماط ورسوم وتعليقات ووسوم) */
const visible = (h) =>
  h
    .slice(h.indexOf('<body'))
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
/** كلام «خيري» والمؤسسة، والشرطة الطويلة (§5.11) — ممنوعة في نص صفحات الأفراد والشركات */
const CHARITY_WORDS = /بيوت مصر|المؤسسة|مؤسسة|الأرامل|أرامل|الأيتام|أيتام|مجان|ببلاش|البرنامج|برنامج|[—–]/;
/** مخاطبة المفرد في صفحة الأفراد والشركات (الجمع «كم» هو صوت المكتب) */
const SINGULAR = /(?:بيانات|طلب|حقوق|موافقت|ملف|هاتف|رقم|ظروف|علم|غير|حالت|مسألت|مشكلت)ك(?![؀-ۿ])|تواصل معنا عبر|أرسل كلمة|اتبع خطوات|فاذكر ذلك/;

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

describe('v12 gate fixer-public — K-P2: scan_client_enabled reaches the intake, /p/ and the company portal', () => {
  test('bm-public.scan follows the setting on the paid intake and on /p/ (default on, off after the switch)', async () => {
    const r = await t.client().post('/api/public/intake', { phone: '01055571001', segment: 'paid', description: 'مراجعة عقد إيجار محل تجاري قبل التوقيع مع المالك', consent: true, consent_v: 1, submission_id: 'wgatepubscan000000001' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const portal = new URL(r.body.portal_url, t.base).pathname;
    const pages = ['/intake?path=consultation/contracts/review', portal, '/intake?seg=charity&via=p'];
    for (const p of pages) assert.equal(jsonOf((await get(p)).body, 'bm-public').scan, true, `${p} default`);
    t.app.settings.set('scan_client_enabled', false);
    try {
      for (const p of pages) assert.equal(jsonOf((await get(p)).body, 'bm-public').scan, false, `${p} switched off`);
    } finally {
      t.app.settings.set('scan_client_enabled', true);
    }
    assert.equal(jsonOf((await get(pages[0])).body, 'bm-public').scan, true, 'back on');
  });

  test('company meta carries scan (and its ETag changes with it); company-forms skips the scanner when meta.scan is false; upload.js reads bm-public.scan', async () => {
    const m1 = await fetch(`${t.base}/api/company/meta`);
    const on = await m1.json();
    assert.equal(on.enabled, true);
    assert.equal(on.scan, true);
    t.app.settings.set('scan_client_enabled', false);
    try {
      const m2 = await fetch(`${t.base}/api/company/meta`);
      assert.equal((await m2.json()).scan, false);
      assert.notEqual(m2.headers.get('etag'), m1.headers.get('etag'), 'a cached meta is not reused after the switch');
    } finally {
      t.app.settings.set('scan_client_enabled', true);
    }
    const forms = read('public/assets/js/lib/company-forms.js');
    assert.match(forms, /const scanned = meta\.scan === false \? null : await scanImage\(f, \{ name, register: 'company'/);
    assert.match(forms, /const meta = getMeta\(\) \|\| \{\};/);
    const upload = read('public/assets/js/public/upload.js');
    assert.match(upload, /getElementById\('bm-public'\)/);
    assert.match(upload, /\.scan === false\) return false;/);
    assert.match(upload, /if \(!SCANNABLE\.has\(typeOf\(file\)\) \|\| !scanSwitchOn\(\)\) return null;/);
  });
});

describe('v12 gate fixer-public — K-P3: the paid legal pages name the firm, never the foundation', () => {
  test('paid /privacy and /terms: no foundation, widows, free-service or programme wording and no long dash anywhere in the visible page; plural address; the firm named in <bdi>', async () => {
    for (const p of ['/privacy', '/terms', '/data-deletion', '/no-such-page-v12-gate']) {
      const h = (await get(p)).body;
      assert.match(h, /data-side="paid"/, p);
      const v = visible(h);
      assert.ok(!CHARITY_WORDS.test(v), `${p}: «${CHARITY_WORDS.exec(v)?.[0]}» near «${v.slice(Math.max(0, v.search(CHARITY_WORDS) - 40), v.search(CHARITY_WORDS) + 20)}»`);
      const m = visible(mainOf(h));
      assert.ok(!SINGULAR.test(m), `${p}: singular «${SINGULAR.exec(m)?.[0]}»`);
    }
    const pv = (await get('/privacy')).body;
    assert.match(mainOf(pv), /<bdi>Emam Legal and Consultancy<\/bdi> مكتب للمحاماة والاستشارات القانونية/);
    assert.ok(pv.includes('والمكتب هو المسؤول عن بياناتكم الشخصية'));
    assert.ok(pv.includes('ولا على بيانات التواصل مع موظفي الشركات'), 'company employees’ contacts are not shown to lawyers');
    const tm = (await get('/terms')).body;
    assert.match(mainOf(tm), /تنظّم هذه الشروط استخدامكم لخدمات <bdi>Emam Legal and Consultancy<\/bdi> للأفراد والشركات/);
    assert.match(tm, /<h2 id="fees-title" data-tag="TM-27">4\. الأتعاب والرسوم<\/h2>/);
    // الاسم القانوني حين يُضبط (firm_legal_name › brand_name)
    t.app.settings.set('firm_legal_name', 'إمام وشركاه');
    try {
      assert.match(mainOf((await get('/privacy')).body), /<bdi>إمام وشركاه<\/bdi> مكتب للمحاماة/);
      assert.match(mainOf((await get('/terms')).body), /يقدّم <bdi>إمام وشركاه<\/bdi> للأفراد والشركات/);
    } finally {
      t.app.settings.set('firm_legal_name', '');
    }
  });

  test('the charity legal pages are byte-identical to the build before K-P3 (archived via ?side=charity, and restored)', async () => {
    const hash = (h) => crypto.createHash('sha256').update(mainOf(h).replace(/http:\/\/127\.0\.0\.1:\d+/g, '').replace(/\?v=[A-Za-z0-9_-]+/g, '?v=X')).digest('hex');
    // sha256 of <main> rendered by the tree just before this change (scratchpad/gfp/legal-before, test helpers, seed none; host and ?v= normalised)
    assert.equal(hash((await get('/privacy?side=charity')).body), '20ce4f4c2fbda2e40d9124caf860990b1bf48a3e6ea6ceeac266fe36025780ab');
    assert.equal(hash((await get('/terms?side=charity')).body), '2b7bb61768b6da75db489f0788d11c272944e8e7f4da8e6692fb51c3317acdad');
    assert.equal(hash((await get('/data-deletion?side=charity')).body), 'c556e266f66d6464fe4e25e0979eb7b894fe7c8d7a86c3ff48311a449e4d2ba3');
    t.app.settings.set('charity_public', true);
    try {
      assert.equal(hash((await get('/privacy')).body), '62e54dd51c0dc21cbf0b8131c2bb7d4cea1390d1d5b3b5d12bf549e81c184678');
      assert.equal(hash((await get('/terms')).body), '1829aecd9e2c4de0d37396d1765084aee561e98f3308d8059069063a91ed3818');
    } finally {
      t.app.settings.set('charity_public', false);
    }
    // the charity wording is still there
    const ch = (await get('/privacy?side=charity')).body;
    assert.ok(ch.includes('برنامج الدعم القانوني أحد برامج'));
    assert.ok(ch.includes('ولإيقاف الرسائل الآلية وحدها أرسل كلمة «توقف».'));
  });

  test('the template keeps one primary per tag code (the paid copies of PV-42 and PV-49 are marked tags:variant)', () => {
    const src = read('public/privacy.html');
    for (const code of ['PV-42', 'PV-49']) {
      const lines = src.split('\n');
      const at = lines.flatMap((l, i) => (l.includes(`data-tag="${code}"`) ? [i] : []));
      assert.equal(at.length, 2, code);
      assert.match(lines[at[1] - 1], /<!-- tags:variant -->/, `${code}: the paid copy is a variant`);
    }
  });

  test('a paid /p/ page and its API carry no foundation wording', async () => {
    const r = await t.client().post('/api/public/intake', { phone: '01055571002', segment: 'paid', description: 'نزاع على عقد توريد مع شركة أخرى ونحتاج رأيًا قانونيًا', consent: true, consent_v: 1, submission_id: 'wgatepubpaidp00000001' });
    assert.equal(r.status, 201);
    const tok = new URL(r.body.portal_url, t.base).pathname.split('/p/')[1].replace(/\/$/, '');
    const html = (await get(`/p/${tok}`)).body;
    assert.match(html, /data-side="paid"/);
    assert.ok(!CHARITY_WORDS.test(visible(html)), CHARITY_WORDS.exec(visible(html))?.[0]);
    const api = (await get(`/api/portal/${tok}`)).body;
    assert.equal(api.tone, 'paid');
    assert.ok(!/بيوت مصر|المؤسسة|الأرامل|الأيتام|مجان/.test(JSON.stringify(api)));
  });
});

describe('v12 gate fixer-public — K-P4: Vary names Save-Data where the response depends on it', () => {
  test('/services varies by Save-Data (Amiri preload dropped with «Save-Data: on»); other pages do not claim it', async () => {
    const plain = await fetch(`${t.base}/services`);
    const lite = await fetch(`${t.base}/services`, { headers: { 'save-data': 'on' } });
    assert.equal(plain.headers.get('vary'), 'Accept-Encoding, Cookie, Save-Data');
    assert.equal(lite.headers.get('vary'), 'Accept-Encoding, Cookie, Save-Data');
    assert.match(await plain.text(), /<link rel="preload" href="\/assets\/fonts\/amiri-arabic-400-sub\.woff2/);
    assert.doesNotMatch(await lite.text(), /amiri-arabic-400-sub\.woff2\?v=[^"]*" as="font"/);
    for (const p of ['/', '/privacy', '/intake?path=consultation/contracts/review']) {
      const r = await fetch(`${t.base}${p}`);
      assert.equal(r.headers.get('vary'), 'Accept-Encoding, Cookie', p);
      // the page really does not change with Save-Data
      const a = (await r.text()).replace(/http:\/\/127\.0\.0\.1:\d+/g, '');
      const b = (await (await fetch(`${t.base}${p}`, { headers: { 'save-data': 'on' } })).text()).replace(/http:\/\/127\.0\.0\.1:\d+/g, '');
      assert.equal(a.replace(/name="bm-csrf"[^>]*>/, ''), b.replace(/name="bm-csrf"[^>]*>/, ''), `${p} differs by Save-Data`);
    }
  });
});

describe('v12 gate fixer-public — K-P5: tap sizes and polish', () => {
  const css = read('public/assets/css/public-site.css');
  test('legal breadcrumbs and the KH notice legal links get a ≥ 44 px hit area without moving the line', async () => {
    assert.match(css, /body\.pub \.pub-crumbs a \{\s*color: var\(--label-2\);[^}]*display: inline-block;\s*padding-block: 14px;\s*margin-block: -14px;/);
    // inlined in the legal critical block (the crumbs are above the fold)
    assert.match(firstStyle((await get('/privacy')).body), /body\.pub \.pub-crumbs a\{color:var\(--label-2\);display:inline-block;padding-block:14px;margin-block:-14px\}/);
    assert.match(css, /\.kh-paused \.pub-legal-links a \{\s*display: inline-block;\s*padding-block: 13px;\s*margin-block: -13px;/);
  });

  test('the success links (I-66) underline on pointer hover only, so a sticky touch hover never marks one of the two', () => {
    const i = css.indexOf('.lh .lh__links a:hover');
    assert.ok(i > 0);
    const before = css.slice(0, i);
    assert.ok(before.lastIndexOf('@media (hover: hover) {') > before.lastIndexOf('}\n\n'), 'the hover rule sits inside @media (hover: hover)');
    assert.match(css, /@media \(hover: hover\) \{\s*\.lh \.lh__links a:hover,\s*\.lh__alt a:hover,\s*\.lh \.trail__back:hover \{/);
  });

  test('the company lead draws one rule between the two field groups', () => {
    const lead = read('public/assets/css/v11-lead.css');
    assert.match(lead, /\.lead-group:has\(\+ \.lead-group\) > \.lead-row:last-child \{\s*border-bottom: 0;/);
    assert.match(lead, /\.lead-group \{\s*padding: 0;\s*border-top: 1px solid var\(--rule-2\);/);
    // the markup still has two consecutive groups (the rule depends on it)
    assert.match(read('public/assets/js/public/intake-company.js'), /h\('div\.lead-group', company, contact, job\),\s*h\('div\.lead-group', phone, email\),/);
  });
});

describe('v12 gate fixer-public — K-P7: no layout shift from the text font on the paid legal pages', () => {
  test('paid legal pages and 404 add «Emam Text» (the same Plex files, font-display: optional) and point the text stacks at it; charity and other pages do not', async () => {
    const general = firstStyle((await get('/services')).body);
    const plex = general.match(/@font-face\{font-family:"IBM Plex Sans Arabic";[^}]*\}/g);
    assert.equal(plex.length, 3);
    for (const p of ['/privacy', '/terms', '/data-deletion', '/no-such-page-v12-gate']) {
      const style = firstStyle((await get(p)).body);
      for (const face of plex) assert.ok(style.includes(face.replace('"IBM Plex Sans Arabic"', '"Emam Text"').replace('font-display:swap', 'font-display:optional')), `${p}: ${face.slice(0, 80)}`);
      // v12 gate r2 (V-16, intended edit): + «Emam Latin» (Plex Latin 400, optional) and :root:root:root over the paid :root:has() stacks
      assert.match(style, /:root:root:root\{--f-ui:"Emam Text","Emam Latin","Segoe UI",Tahoma,sans-serif;--pub-font:"Emam Text","Emam Latin","Segoe UI",Tahoma,sans-serif;--f-display:"Emam Display","Emam Text","Times New Roman",serif\}/);
      assert.ok(Buffer.byteLength(style) <= 12288, `${p} style ${Buffer.byteLength(style)}`);
    }
    for (const p of ['/privacy?side=charity', '/terms?side=charity', '/services', '/', '/intake?path=consultation/contracts/review']) assert.ok(!(await get(p)).body.includes('Emam Text'), p);
    // the preload still matches the 400 file the page uses
    const pv = (await get('/privacy')).body;
    const pre = /<link rel="preload" href="(\/assets\/fonts\/plex-arabic-400\.woff2\?v=[^"]+)"/.exec(pv)[1];
    assert.ok(firstStyle(pv).includes(`font-family:"Emam Text";font-weight:400;font-display:optional;src:url("${pre}")`));
  });
});
