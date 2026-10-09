// v11 gate-public — شاشة الاختيار، صفحتا «خيري» والأفراد والشركات، الكعكة والتخزين، الرأس والتذييل حسب الجانب (GP-0…GP-4)
// المواصفة: scratchpad/v11-spec.md §9.4 (G11 §15.1 مع تعديلات r2). اختبارات GP-5 وما بعدها تُضاف في الخطوة التالية.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestApp } from './helpers.js';
import { sendBody } from '../src/http.js';
import { GATE_ORDER, GATE_COPY, GATE_PICTOS, PAID_TOPIC_ICONS, CRITICAL_RE, CAMPAIGN_KEYS, SITE_PAGES } from '../src/site.js';
import { preloadClosure, transformAsset, setPublicRoot } from '../src/site-assets.js';
import { PAID_TOPICS, paidWaPrefill } from '../public/assets/js/public/segment.js';
import { TOPICS } from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
const BRAND = 'Emam Legal and Consultancy';
const GATE_TITLE = `مساعدة قانونية مجانية وخدمات قانونية للأفراد والشركات — ${BRAND}`;
const CHARITY_TITLE = `الدعم القانوني للأرامل والأيتام وأسرهم — ${BRAND}`;
const PAID_TITLE = `استشارات قانونية للأفراد والشركات — ${BRAND}`;
const FEMININE = /اكتبي|ابعتي|صوّري|اختاري|سجّلي|اضغطي|قولي|تقدري|حاولي|ارجعي|تابعي/;
const ORDER = TOPICS.map((t) => t.key);

const titleOf = (h) => (/<title>([\s\S]*?)<\/title>/.exec(h) || [])[1] || '';
const canonicalOf = (h) => (/<link rel="canonical" href="([^"]+)"/.exec(h) || [])[1] || '';
const ldOf = (h) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1])['@graph'];
const firstStyle = (h) => (/<style>([\s\S]*?)<\/style>/.exec(h) || [])[1] || '';
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
/** النص الظاهر: بلا سكربتات وأنماط ووسوم */
const visible = (h) =>
  h
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
const gateOf = (h) => {
  const i = h.indexOf('<div class="gate" id="gate"');
  return i < 0 ? '' : h.slice(i, h.indexOf('<div id="site"', i));
};
const headerOf = (h) => (/<header class="pub-header"[\s\S]*?<\/header>/.exec(h) || [''])[0];
const footerOf = (h) => (/<footer class="pub-footer"[\s\S]*?<\/footer>/.exec(h) || [''])[0];
/** كتل الأنماط الحرجة مضغوطة كما يضمّنها site.js */
function critical(name) {
  const text = read('public/assets/css/public-site.css');
  let out = '';
  for (const m of text.matchAll(CRITICAL_RE)) if ((m[1] || '') === name) out += m[2];
  return out
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/:\s+/g, ':')
    .replace(/;}/g, '}')
    .trim();
}
/** قسم gate-public في public-site.css (بعد علامة H-G2) */
const tailCss = () => {
  const css = read('public/assets/css/public-site.css');
  return css.slice(css.indexOf('/* ===== v11 gate-public (owner: gate-public; visual never edits below this line) ===== */'));
};

let t;
const get = (p, headers = {}) => t.client().get(p, headers);
before(async () => {
  t = await startTestApp({ seed: 'none' });
  setPublicRoot(PUB);
});
after(async () => t && t.close());

// ───────────────────────── 1–12: المسارات والكعكة والتخزين ─────────────────────────

describe('v11 gate-public — routing, cookie and caching (GP-0/GP-1)', () => {
  test('1. GET / with no cookie: the gate is the first child of <body>, the «خيري» home under it inert; one <h1>; cards paid → charity; no Set-Cookie; private + Vary: Cookie; gate title, canonical /, Organization-only JSON-LD', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    const h = r.body;
    assert.match(h, /<body class="site pub v91 pub-landing has-gate" data-side="charity" data-seg-sync="">\s*<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-desc"/);
    assert.match(h, /<\/div>\s*<div id="site" inert>\s*<a class="skip-link"/);
    assert.equal((h.match(/<h1\b/g) || []).length, 1);
    assert.match(h, /<h1 id="start-title">/);
    const cards = [...gateOf(h).matchAll(/<a class="gate-card gate-card--(paid|charity)" href="([^"]+)" data-seg="(\w+)"/g)];
    assert.deepEqual(GATE_ORDER, ['paid', 'charity']);
    assert.deepEqual(cards.map((m) => [m[1], m[2], m[3]]), [['paid', '/services', 'paid'], ['charity', '/khayri', 'charity']]);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.equal(r.headers.get('cache-control'), 'private, no-cache');
    assert.equal(r.headers.get('vary'), 'Accept-Encoding, Cookie');
    assert.equal(titleOf(h), GATE_TITLE);
    assert.match(h, /<meta name="description" content="مساعدة قانونية مجانية وسرية للأرامل والأيتام وأسرهم، وخدمات قانونية بأتعاب واضحة للأفراد والشركات: استشارات وقضايا وعقود وإدارة قانونية للشركات\." \/>/);
    assert.equal(canonicalOf(h), `${t.base}/`);
    const ld = ldOf(h);
    assert.deepEqual(ld.map((n) => n['@type']), ['Organization'], 'gate state = Organization only (r2 P28/S24)');
    assert.equal(ld[0].alternateName, BRAND);
    assert.ok(!h.includes('"@type":"FAQPage"') && !h.includes('"LegalService"'));
    assert.ok(!/<meta name="robots"/.test(h), '/ is indexed');
    assert.match(h, /<link rel="preload" as="image" href="\/assets\/img\/emam-logo-gold-deep\.svg\?v=[^"]+" fetchpriority="high" \/>/);
    assert.ok(firstStyle(h).includes('.gate-choices{'), 'the gate block is inlined in the gate state');
  });

  test('2. GET / with bm_seg=charity: the «خيري» home with no gate, canonical /khayri, the charity graph, and a refreshed persistent cookie (not HttpOnly)', async () => {
    const r = await get('/', { cookie: 'bm_seg=charity' });
    const h = r.body;
    assert.ok(!h.includes('id="gate"') && !h.includes(' inert') && !h.includes('has-gate'));
    assert.match(h, /<body class="site pub v91 pub-landing" data-side="charity" data-seg-sync="1">/);
    assert.equal(titleOf(h), CHARITY_TITLE);
    assert.equal(canonicalOf(h), `${t.base}/khayri`);
    assert.equal(r.headers.get('set-cookie'), 'bm_seg=charity; Path=/; Max-Age=15552000; SameSite=Lax');
    const types = ldOf(h).map((n) => n['@type']);
    assert.ok(types.includes('NGO') && types.includes('LegalService') && types.includes('FAQPage'));
    assert.ok(!firstStyle(h).includes('.gate-choices{'), 'no gate CSS without the gate');
    assert.ok(!h.includes('rel="preload" as="image"'));
  });

  test('3. (r2 P1) GET / with bm_seg=paid shows the gate again: one 200, no redirect, no Set-Cookie; only «خيري» skips the gate', async () => {
    const r = await get('/', { cookie: 'bm_seg=paid' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('location'), null);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.ok(gateOf(r.body), 'gate');
    assert.equal(titleOf(r.body), GATE_TITLE);
  });

  test('4. /?gate=1 shows the gate whatever the cookie, is noindex, writes no cookie; canonical /', async () => {
    for (const cookie of ['bm_seg=charity', 'bm_seg=paid', '']) {
      const r = await get('/?gate=1', cookie ? { cookie } : {});
      assert.ok(gateOf(r.body), cookie);
      assert.equal(r.headers.get('set-cookie'), null, cookie);
      assert.match(r.body, /<meta name="robots" content="noindex, follow" \/>/);
      assert.equal(canonicalOf(r.body), `${t.base}/`);
    }
  });

  test('5. /khayri: the «خيري» home, self-canonical, charity FAQPage, persistent charity cookie; /services: persistent paid cookie, canonical /services', async () => {
    const k = await get('/khayri');
    assert.equal(k.status, 200);
    assert.ok(!k.body.includes('id="gate"'));
    assert.equal(canonicalOf(k.body), `${t.base}/khayri`);
    assert.equal(titleOf(k.body), CHARITY_TITLE);
    assert.equal(k.headers.get('set-cookie'), 'bm_seg=charity; Path=/; Max-Age=15552000; SameSite=Lax');
    assert.ok(ldOf(k.body).some((n) => n['@type'] === 'FAQPage' && n.mainEntity.length === 5));
    const s = await get('/services');
    assert.equal(s.status, 200);
    assert.equal(s.headers.get('set-cookie'), 'bm_seg=paid; Path=/; Max-Age=15552000; SameSite=Lax');
    assert.equal(canonicalOf(s.body), `${t.base}/services`);
    assert.equal(titleOf(s.body), PAID_TITLE);
  });

  test('6. no cookie is ever written for HEAD, prefetch/prerender, link previews (X-Purpose: preview) or X-Moz: prefetch', async () => {
    for (const p of ['/khayri', '/services', '/intake?seg=paid']) {
      const head = await fetch(`${t.base}${p}`, { method: 'HEAD' });
      assert.equal(head.status, 200, p);
      assert.equal(head.headers.get('set-cookie'), null, `HEAD ${p}`);
      assert.match(head.headers.get('vary'), /Cookie/, `HEAD ${p} vary`);
      for (const headers of [{ 'sec-purpose': 'prefetch' }, { 'sec-purpose': 'prefetch;prerender' }, { purpose: 'prefetch' }, { 'x-purpose': 'preview' }, { 'x-moz': 'prefetch' }]) {
        const r = await get(p, headers);
        assert.equal(r.headers.get('set-cookie'), null, `${p} ${JSON.stringify(headers)}`);
      }
    }
  });

  test('7. on https (TRUST_PROXY=1 + X-Forwarded-Proto: https) the cookie carries Secure', async () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    try {
      const r = await get('/khayri', { 'x-forwarded-proto': 'https' });
      assert.equal(r.headers.get('set-cookie'), 'bm_seg=charity; Path=/; Max-Age=15552000; SameSite=Lax; Secure');
      const plain = await get('/khayri');
      assert.ok(!/Secure/.test(plain.headers.get('set-cookie')));
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  test('8. invalid cookie values behave as no cookie and are never reflected; with duplicates the first bm_seg decides (r2 S25)', async () => {
    for (const cookie of ['bm_seg=PAID', 'bm_seg=x', 'bm_seg=<script>alert(1)</script>', 'bm_seg=khayri', 'bm_seg=', 'xbm_seg=charity']) {
      const r = await get('/', { cookie });
      assert.ok(gateOf(r.body), cookie);
      assert.equal(r.headers.get('set-cookie'), null, cookie);
      assert.ok(!r.body.includes('<script>alert') && !r.body.includes('PAID') && !r.body.includes('bm_seg'), cookie);
    }
    const first = await get('/', { cookie: 'bm_seg=charity; other=1; bm_seg=paid' });
    assert.ok(!gateOf(first.body), 'first = charity → home');
    const second = await get('/', { cookie: 'bm_seg=paid; bm_seg=charity' });
    assert.ok(gateOf(second.body), 'first = paid → gate');
  });

  test('9. kill switch site_gate_enabled=false: / is always the «خيري» home and never refreshes the cookie (also with the paid cookie); /services still works', async () => {
    t.app.settings.set('site_gate_enabled', false);
    try {
      for (const cookie of ['', 'bm_seg=paid', 'bm_seg=charity']) {
        const r = await get('/', cookie ? { cookie } : {});
        assert.ok(!gateOf(r.body), cookie);
        assert.equal(titleOf(r.body), CHARITY_TITLE, cookie);
        assert.equal(r.headers.get('set-cookie'), null, cookie);
      }
      assert.ok(!gateOf((await get('/?gate=1')).body), 'the switch wins over ?gate=1');
      const s = await get('/services');
      assert.equal(s.status, 200);
      assert.match(s.headers.get('set-cookie'), /^bm_seg=paid;/);
    } finally {
      t.app.settings.set('site_gate_enabled', true);
    }
    assert.ok(gateOf((await get('/')).body), 'on again → gate');
  });

  test('10. /intake: seg param › cookie › segment_website_default; a valid seg that differs from the cookie writes a session-only cookie (r2 S25)', async () => {
    const paid = await get('/intake?seg=paid');
    assert.equal(paid.headers.get('set-cookie'), 'bm_seg=paid; Path=/; SameSite=Lax');
    assert.match(paid.body, /data-side="paid"/);
    assert.equal(canonicalOf(paid.body), `${t.base}/intake?seg=paid`);
    const same = await get('/intake?seg=paid', { cookie: 'bm_seg=paid' });
    assert.equal(same.headers.get('set-cookie'), null, 'same side keeps the persistent cookie');
    const back = await get('/intake?seg=charity', { cookie: 'bm_seg=paid' });
    assert.equal(back.headers.get('set-cookie'), 'bm_seg=charity; Path=/; SameSite=Lax');
    assert.match(back.body, /data-side="charity"/);
    const byCookie = await get('/intake', { cookie: 'bm_seg=paid' });
    assert.match(byCookie.body, /data-side="paid"/);
    assert.equal(byCookie.headers.get('set-cookie'), null);
    const none = await get('/intake?seg=bogus');
    assert.match(none.body, /data-side="charity"/);
    assert.equal(none.headers.get('set-cookie'), null);
    assert.equal(canonicalOf(none.body), `${t.base}/intake`);
    t.app.settings.set('segment_website_default', 'paid');
    try {
      assert.match((await get('/intake')).body, /data-side="paid"/);
    } finally {
      t.app.settings.set('segment_website_default', 'charity');
    }
    // bm-public carries the side (§5.7)
    const bm = JSON.parse(/<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(paid.body)[1]);
    assert.equal(bm.segment, 'paid');
  });

  test('11. (L11-51, r2 S11) every renderPage page sends Vary: Accept-Encoding, Cookie and private, no-cache — GET and HEAD; /p/ stays no-store; 404 no-store + Vary; short uncompressed bodies too', async () => {
    const pages = ['/', '/khayri', '/services', '/intake', '/about', '/privacy', '/terms', '/data-deletion', '/portal'];
    for (const p of pages) {
      for (const method of ['GET', 'HEAD']) {
        for (const enc of ['br', 'identity']) {
          const r = await fetch(`${t.base}${p}`, { method, headers: { 'accept-encoding': enc } });
          assert.equal(r.status, 200, `${method} ${p}`);
          assert.equal(r.headers.get('vary'), 'Accept-Encoding, Cookie', `${method} ${p} ${enc}`);
          assert.equal(r.headers.get('cache-control'), 'private, no-cache', `${method} ${p}`);
        }
      }
    }
    const pTok = await fetch(`${t.base}/p/abcdefghijklmnopqrstuvwxyz012345`);
    assert.equal(pTok.headers.get('cache-control'), 'no-store');
    const nf = await fetch(`${t.base}/no-such-page-v11`);
    assert.equal(nf.status, 404);
    assert.equal(nf.headers.get('vary'), 'Accept-Encoding, Cookie');
    assert.equal(nf.headers.get('cache-control'), 'no-store');
    // sendBody: the vary option holds for a body under 1 KB (never compressed)
    const headers = {};
    const res = { setHeader: (k, v) => (headers[k.toLowerCase()] = v), end: () => {}, statusCode: 0 };
    sendBody(res, 200, 'short', { req: { method: 'GET', headers: { 'accept-encoding': 'br' } }, vary: 'Cookie' });
    assert.equal(headers.vary, 'Accept-Encoding, Cookie');
    assert.equal(headers['content-encoding'], undefined);
    const h2 = {};
    sendBody({ setHeader: (k, v) => (h2[k.toLowerCase()] = v), end: () => {} }, 200, 'x'.repeat(2000), { req: { method: 'GET', headers: {} } });
    assert.equal(h2.vary, 'Accept-Encoding', 'API/default callers unchanged');
  });

  test('12. sitemap lists /khayri and /services; robots unchanged; the service worker scope stays /app; raster logo crops are never precached', async () => {
    assert.deepEqual(SITE_PAGES.slice(0, 3).map((p) => p.path), ['/', '/khayri', '/services']);
    const sm = Buffer.from((await get('/sitemap.xml')).body).toString('utf8');
    for (const p of ['/', '/khayri', '/services', '/intake']) assert.ok(sm.includes(`<loc>${t.base}${p}</loc>`), p);
    const robots = (await get('/robots.txt')).body;
    assert.ok(!/Disallow: \/(?:khayri|services)/.test(robots));
    assert.match(read('public/assets/js/lib/pwa.js'), /scope: '\/app'/);
    assert.ok(read('src/site.js').includes('/^\\/assets\\/img\\/emam-(?:full|mark)-.*\\.(?:png|webp)$/'), 'PRECACHE_SKIP (L11-58)');
    const sw = (await get('/sw.js')).body;
    assert.ok(!/emam-(?:full|mark)-[^"]*\.(?:png|webp)/.test(sw));
  });

  test('13. campaign parameters (whitelist only, ≤ 200 chars, re-encoded) ride on both card hrefs', async () => {
    const long = 'a'.repeat(300);
    const r = await get(`/?utm_source=fb&utm_campaign=x&evil=1&gclid=${long}&utm_content=%3C%22q`);
    const hrefs = [...gateOf(r.body).matchAll(/<a class="gate-card[^"]*" href="([^"]+)"/g)].map((m) => decode(m[1]));
    assert.equal(hrefs.length, 2);
    for (const href of hrefs) {
      const u = new URL(href, 'http://x');
      assert.ok(['/services', '/khayri'].includes(u.pathname));
      assert.equal(u.searchParams.get('utm_source'), 'fb');
      assert.equal(u.searchParams.get('utm_campaign'), 'x');
      assert.equal(u.searchParams.get('evil'), null);
      assert.equal(u.searchParams.get('gclid').length, 200);
      assert.equal(u.searchParams.get('utm_content'), '<"q');
      for (const k of u.searchParams.keys()) assert.ok(CAMPAIGN_KEYS.includes(k), k);
    }
    assert.ok(!gateOf(r.body).includes('<"q') && !gateOf(r.body).includes('evil'));
  });
});

// ───────────────────────── 13–22: محتوى الشاشة وإمكانية الوصول ─────────────────────────

describe('v11 gate-public — the gate content and accessibility (GP-1)', () => {
  test('14. card copy is G11-12 exactly; card 1 says «بأتعاب»; card 2 has the «مجاني» kicker; links الخصوصية · الشروط · دخول الشركات; b2b off → short line, no /company', async () => {
    const g = gateOf((await get('/')).body);
    assert.ok(g.includes(`<b class="gate-title">${GATE_COPY.paid.title}</b> <span class="gate-line">استشارات وقضايا وعقود بأتعاب واضحة، وإدارة قانونية للشركات</span>`));
    assert.ok(g.includes('<b class="gate-title">خيري <span class="gate-kicker">مجاني</span></b> <span class="gate-line">مساعدة قانونية مجانية للأرامل والأيتام وأسرهم</span>'));
    assert.match(g, /<p id="gate-desc" class="pub-sr">اختاروا نوع الخدمة<\/p>/);
    assert.match(g, /<nav class="gate-links" aria-label="روابط"><a href="\/privacy">الخصوصية<\/a><a href="\/terms">الشروط<\/a><a href="\/company">دخول الشركات<\/a><\/nav>/);
    t.app.settings.set('b2b_enabled', false);
    try {
      const g2 = gateOf((await get('/')).body);
      assert.ok(g2.includes('<span class="gate-line">استشارات وقضايا وعقود بأتعاب واضحة</span>'));
      assert.ok(!g2.includes('/company'));
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
  });

  test('15. the gate never speaks feminine, never shows WhatsApp, a phone or a tile; accessible card names are the visible text (no aria-label on cards)', async () => {
    const g = gateOf((await get('/')).body);
    assert.ok(!FEMININE.test(visible(g)), visible(g));
    assert.ok(!/wa\.me|tel:|pub-pick-tile|pub-pick-way/.test(g));
    assert.ok(!/<a class="gate-card[^>]*aria-label/.test(g));
  });

  test('16. (L11-04, r2 S19/S29) logo = h2#gate-title > img of the deep-gold lockup (300×125, alt = brand_name with lang/dir); alt follows brand_name; the artwork words never reach the HTML', async () => {
    const h = (await get('/')).body;
    assert.match(h, /<h2 id="gate-title" class="gate-logo"><img src="\/assets\/img\/emam-logo-gold-deep\.svg\?v=[^"]+" width="300" height="125" alt="Emam Legal and Consultancy" dir="ltr" lang="en" fetchpriority="high" decoding="async" \/><\/h2>/);
    t.app.settings.set('brand_name', 'إمام وشركاه');
    try {
      const h2 = (await get('/')).body;
      assert.match(h2, /<h2 id="gate-title" class="gate-logo"><img [^>]*alt="إمام وشركاه" dir="rtl" lang="ar"/);
    } finally {
      t.app.settings.set('brand_name', BRAND);
    }
    for (const word of ['Partners', 'PROFESSIONAL', 'SERVICES FIRM']) assert.ok(!h.includes(word), word);
    // preload of the lockup only in the gate state
    assert.ok(!(await get('/khayri')).body.includes('emam-logo-gold-deep'));
  });

  test('17. spoken copy (G11-13 + r2 P11 picture cues) in visual order; intro on #gate', async () => {
    const g = gateOf((await get('/')).body);
    assert.match(g, /data-say-intro="أهلًا بيكم\. عندنا اختيارين، اضغطوا على اللي يناسبكم\."/);
    const says = [...g.matchAll(/class="gate-card[^"]*"[^>]*data-say="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(says, [
      'خدمات الأفراد والشركات: استشارات وقضايا وعقود، بأتعاب بنتفق عليها قبل أي شغل. دي الصورة اللي فيها الشنطة.',
      'خيري: مساعدة قانونية ببلاش للأرامل والأيتام وأسرهم. دي الصورة اللي فيها الأم وابنها.',
    ]);
  });

  test('18. (r2 P11) DOM order logo → listen (hidden) → cards → links; no positive tabindex; #gate[data-title-site] = the /khayri title', async () => {
    const g = gateOf((await get('/')).body);
    const at = (s) => g.indexOf(s);
    assert.ok(at('id="gate-title"') < at('class="gate-listen"') && at('class="gate-listen"') < at('class="gate-choices"') && at('class="gate-choices"') < at('class="gate-links"'));
    assert.match(g, /<button class="gate-listen" type="button" hidden aria-pressed="false" aria-label="اسمعوا الكلام اللي في الصفحة">[\s\S]*?<span>بالصوت<\/span><\/button>/);
    assert.ok(!/tabindex="[1-9]/.test(g));
    const siteTitle = decode(/data-title-site="([^"]+)"/.exec(g)[1]);
    assert.equal(siteTitle, titleOf((await get('/khayri')).body));
  });

  test('19. (r2 P3) pictograms are server-only: gate_paid = briefcase + person with no path of the rent or papers pictograms; gate_charity = mother + child + heart; brand classes only', () => {
    const sub = (svg) => new Set([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]));
    const paid = sub(GATE_PICTOS.gate_paid);
    for (const k of ['rent', 'papers']) for (const d of sub(PICTOS[k] || '')) assert.ok(!paid.has(d), `${k}: ${d}`);
    assert.ok(!/<rect class="pw" x="7\.5"|window/.test(GATE_PICTOS.gate_paid), 'no windows');
    for (const svg of Object.values(GATE_PICTOS)) for (const m of svg.matchAll(/class="([^"]*)"/g)) assert.ok(['pa', 'pb', 'pw'].includes(m[1]), m[1]);
    assert.ok(GATE_PICTOS.gate_charity.includes('M24 3c-7 0-12 5.6-12 13'), 'the 9.2 woman in a wide headscarf');
    assert.ok(!read('public/assets/js/public/pictos.js').includes('gate_'), 'not in the /intake closure');
  });

  test('20. gate CSS (critical block «gate» ≤ 3,300 B): equal-height cards ≥ 112 px, title clamp(20px,5.6vw,23px), kicker 17/700 × 30 px, discs 84/72 (charity gold wash, paid tint-weak), visibility fallback, tokens only', () => {
    const gate = critical('gate');
    assert.ok(gate.length > 0 && Buffer.byteLength(gate) <= 3300, `gate ${Buffer.byteLength(gate)}`);
    assert.match(gate, /\.gate-choices\{display:grid;grid-auto-rows:1fr;/);
    assert.match(gate, /body\.has-gate>#site\{visibility:hidden\}/);
    assert.match(gate, /body\.has-gate\{overflow:hidden\}/);
    assert.match(gate, /\.gate\{position:fixed;inset:0;[^}]*overflow-y:auto/);
    assert.match(gate, /\.gate-card\{[^}]*min-height:112px/);
    assert.match(gate, /\.gate-title\{font-size:clamp\(20px,5\.6vw,23px\)/);
    assert.match(gate, /\.gate-kicker\{[^}]*height:30px;[^}]*padding-inline:12px;[^}]*font-size:17px;font-weight:700/);
    assert.match(gate, /\.gate-pic\{[^}]*width:84px;height:84px;[^}]*background:var\(--tint-weak\)\}/);
    assert.match(gate, /\.gate-card--charity \.gate-pic\{background:var\(--gold-wash\)\}/);
    assert.match(gate, /@media \(max-width:400px\)\{\.gate-pic\{width:72px;height:72px\}/);
    assert.match(gate, /grid-template-columns:repeat\(2,280px\)/);
    assert.match(gate, /\.gate-logo img\{display:block;width:min\(70vw,300px\)/);
    assert.match(gate, /transform:scale\(var\(--press-scale\)\)/, 'press .97 (1 with reduced motion)');
    // the whole gate-public tail: tokens only — no hex colour literal and no rgb() of a literal
    const tail = tailCss().replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(tail), 'no hex literal');
    assert.ok(!/rgba?\(\s*\d/.test(tail), 'no rgb literal');
    assert.ok(!/@critical/.test(gate));
    const general = critical('');
    assert.ok(Buffer.byteLength(general) + Buffer.byteLength(gate) <= 12288 - 64);
  });
});

// ───────────────────────── 23–28: الرأس والتذييل حسب الجانب ─────────────────────────

describe('v11 gate-public — header and footer per side (GP-2)', () => {
  test('21. charity header: the green mark image, the «خيري» pill to /?gate=1, «تغيير نوع الخدمة» in the phone menu, CTA /intake?seg=charity; the wordmark stays for screen readers', async () => {
    const hd = headerOf((await get('/khayri')).body);
    assert.match(hd, /<a class="pub-brand" href="\/" aria-label="Emam Legal and Consultancy — الصفحة الرئيسية">\s*<img class="pub-mark" src="\/assets\/img\/emam-mark-green\.svg\?v=[^"]+" width="99" height="19" alt="" decoding="async" \/>\s*<bdi class="pub-wordmark"/);
    assert.match(hd, /<a class="pub-seg-pill pub-seg-pill--charity" href="\/\?gate=1" aria-label="أنتم في: خيري\. تغيير نوع الخدمة">[\s\S]*?<span>خيري<\/span>[\s\S]*?<span class="pub-seg-pill-change">تغيير<\/span><\/a>/);
    assert.match(hd, /<a class="pub-nav-link pub-nav-gate" href="\/\?gate=1">تغيير نوع الخدمة<\/a>/);
    assert.match(hd, /<a class="pub-btn pub-btn-gold pub-nav-cta" href="\/intake\?seg=charity" data-cta="intake">[\s\S]*?<span>احكيلنا مشكلتك<\/span><\/a>/);
    assert.match(hd, /<a class="pub-nav-link" href="#faq">أسئلة<\/a>/, 'bare fragments on the side home');
    assert.match(headerOf((await get('/privacy')).body), /<a class="pub-nav-link" href="\/khayri#faq">أسئلة<\/a>/, 'elsewhere /khayri#…');
  });

  test('22. the pill is on the homes, legal pages, about and 404 only — never on /intake, /portal or /p/', async () => {
    for (const p of ['/', '/khayri', '/services', '/privacy', '/terms', '/data-deletion', '/about']) assert.ok(headerOf((await get(p)).body).includes('class="pub-seg-pill '), p);
    assert.ok(headerOf((await fetch(`${t.base}/no-such-v11`).then((r) => r.text()))).includes('pub-seg-pill'), '404');
    for (const p of ['/intake', '/intake?seg=paid', '/portal', '/p/abcdefghijklmnopqrstuvwxyz012345']) {
      const h = (await get(p)).body;
      assert.ok(!h.includes('pub-seg-pill') && !h.includes('pub-nav-gate'), p);
    }
  });

  test('23. paid header on /services: brand → /services, briefcase pill, paid nav (+ «للشركات» iff b2b) and CTA «طلب استشارة» → /intake?seg=paid; contact = main digits + the paid sentence by default', async () => {
    const h = (await get('/services')).body;
    const hd = headerOf(h);
    assert.match(hd, /<a class="pub-brand" href="\/services"/);
    assert.match(hd, /<a class="pub-seg-pill pub-seg-pill--paid" href="\/\?gate=1" aria-label="أنتم في: خدمات الأفراد والشركات\. تغيير نوع الخدمة"><svg[^>]*>(?:<path d="[^"]+"\/>)+<\/svg><span>أفراد وشركات<\/span>/);
    assert.ok(hd.includes('M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'), 'briefcase glyph');
    const nav = [...hd.matchAll(/<a class="pub-nav-link" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(nav, [['#topics', 'مجالات الاستشارة'], ['#how', 'كيف نعمل'], ['#companies', 'للشركات'], ['#faq', 'أسئلة']]);
    assert.match(hd, /<a class="pub-nav-link pub-nav-gate" href="\/\?gate=1">تغيير نوع الخدمة<\/a>/);
    assert.match(hd, /<span>متابعة طلب<\/span>/);
    assert.match(hd, /<a class="pub-btn pub-btn-gold pub-nav-cta" href="\/intake\?seg=paid" data-cta="intake">[\s\S]*?<span>طلب استشارة<\/span><\/a>/);
    const wa = decode(/<a class="pub-head-contact pub-head-contact--wa" href="([^"]+)"/.exec(hd)[1]);
    assert.equal(wa, `https://wa.me/201000000001?text=${encodeURIComponent(paidWaPrefill(null))}`);
    assert.ok(!FEMININE.test(visible(hd)));
    t.app.settings.set('b2b_enabled', false);
    try {
      assert.ok(!headerOf((await get('/services')).body).includes('#companies'));
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
  });

  test('24. legal pages and 404 follow the cookie side (charity without a cookie); /about is always charity; /p/ is never the cookie side', async () => {
    assert.match((await get('/privacy', { cookie: 'bm_seg=paid' })).body, /data-side="paid"[\s\S]*pub-seg-pill--paid/);
    assert.match((await get('/privacy')).body, /data-side="charity"[\s\S]*pub-seg-pill--charity/);
    assert.match((await get('/about', { cookie: 'bm_seg=paid' })).body, /data-side="charity"[\s\S]*pub-seg-pill--charity/);
    const nf = await fetch(`${t.base}/no-such-v11`, { headers: { cookie: 'bm_seg=paid' } }).then((r) => r.text());
    assert.match(nf, /data-side="paid"/);
  });

  test('25. footers: charity + logo, «خدمات الأفراد والشركات» and «اختيار نوع الخدمة»; paid (G11-23) links /khayri and /?gate=1, keeps ©, omits the registration and the programme name (r2 P19/S27)', async () => {
    const legal = t.app.settings.get('org_legal_name');
    const reg = t.app.settings.get('org_registration');
    const fc = footerOf((await get('/khayri')).body);
    assert.match(fc, /<img class="pub-footer-logo" src="\/assets\/img\/emam-logo-gold\.svg\?v=[^"]+" width="200" height="84" alt="" loading="lazy" decoding="async" \/>/);
    for (const [href, label] of [['/services', 'خدمات الأفراد والشركات'], ['/?gate=1', 'اختيار نوع الخدمة'], ['/intake?seg=charity', 'احكيلنا مشكلتك']]) assert.ok(fc.includes(`href="${href}"`) && fc.includes(label), href);
    assert.ok(reg && fc.includes(reg), 'charity footer keeps the registration');
    const fp = footerOf((await get('/services')).body);
    assert.ok(fp.includes('pub-footer-logo'));
    for (const href of ['/services', '/intake?seg=paid', '/portal', '/services#companies', '/khayri', '/?gate=1', '/privacy', '/terms', '/data-deletion']) assert.ok(fp.includes(`href="${href}"`), href);
    assert.match(fp, /<a href="\/khayri">خيري<\/a>/, 'the way to «خيري» without «مجاني» (INV-12: only #pub-cross may say it)');
    assert.ok(fp.includes('خدمات قانونية للأفراد والشركات، بأتعاب نتفق عليها معكم قبل أي عمل.'));
    assert.ok(!fp.includes(reg), 'no NGO registration on the paid footer');
    assert.ok(!fp.includes('pub-brand-desc') && !fp.includes(t.app.site.publicSettings().program_name), 'no programme name');
    assert.match(fp, new RegExp(`© \\d{4} ${legal}\\. جميع الحقوق محفوظة\\.`), '© stays (O-25)');
    assert.ok(fp.includes('للتواصل:'));
  });

  test('26. (L11-52) every intake link on the charity home carries seg=charity; body[data-side] on every public page', async () => {
    const h = (await get('/khayri')).body;
    const intake = [...h.matchAll(/href="(\/intake[^"]*)"/g)].map((m) => decode(m[1]));
    assert.ok(intake.length >= 20, intake.length);
    for (const href of intake) assert.equal(new URL(href, 'http://x').searchParams.get('seg'), 'charity', href);
    for (const p of ['/', '/khayri', '/services', '/intake', '/about', '/privacy', '/terms', '/data-deletion', '/portal', '/p/abcdefghijklmnopqrstuvwxyz012345']) {
      assert.match((await get(p)).body, /<body [^>]*data-side="(?:charity|paid)"/, p);
    }
  });
});

// ───────────────────────── 29–35: صفحة الأفراد والشركات ─────────────────────────

describe('v11 gate-public — /services (GP-3)', () => {
  let h;
  before(async () => {
    h = (await get('/services')).body;
  });

  test('27. (r2 P2/P15/P26) order: H1 «كيف نساعدكم؟» › sub-line › #pub-cross (first element after it) › «للشركات» row › the topic list; no hero lockup', () => {
    const main = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
    assert.match(main, /<h1 id="start-title">كيف نساعدكم؟<\/h1>\s*<p class="pub-paid-sub">اختاروا الموضوع — ونتفق معكم على الأتعاب قبل أي عمل\.<\/p>\s*<a class="pub-cross" id="pub-cross" href="\/khayri">/);
    assert.match(main, /<span class="gate-kicker">مجاني<\/span><span class="pub-cross-text">تبحثون عن مساعدة قانونية مجانية؟<\/span> <b class="pub-cross-go">خيري ‹<\/b><\/a>\s*<a class="pub-co-row" href="#companies">[\s\S]*?للشركات: إدارتكم القانونية الافتراضية/);
    assert.ok(main.indexOf('pub-co-row') < main.indexOf('pub-topic-list'));
    assert.ok(!main.includes('emam-logo-gold'), 'no hero lockup (the header mark is enough)');
    assert.ok(!main.includes('pub-listen'), 'no «بالصوت» on the paid side');
  });

  test('28. (L11-55) 8 grouped rows: same keys and order as the charity tiles, PAID_TOPICS labels, wa_desc sub (other: «الطلاق والخلع…»), line icons, /intake?topic={key}&seg=paid', () => {
    const rows = [...h.matchAll(/<li id="service-([a-z]+)"><a class="g-row" href="([^"]+)" data-cta="intake" data-topic="\1"><span class="g-ico">(<svg[\s\S]*?<\/svg>)<\/span><span class="g-main"><span class="g-title">([^<]+)<\/span><span class="g-sub">([^<]+)<\/span><\/span>/g)];
    assert.deepEqual(rows.map((m) => m[1]), ORDER);
    rows.forEach((m) => {
      const k = m[1];
      assert.equal(decode(m[2]), `/intake?topic=${k}&seg=paid`);
      assert.equal(m[4], PAID_TOPICS[k].label);
      assert.equal(m[5], PAID_TOPICS[k].sub || PAID_TOPICS[k].wa_desc);
      assert.match(m[3], /stroke-width="1\.75"/);
    });
    assert.ok(PAID_TOPICS.other.sub.includes('الطلاق والخلع'));
    assert.deepEqual(Object.keys(PAID_TOPIC_ICONS), ORDER);
    assert.ok(!Object.values(PAID_TOPIC_ICONS).includes('heart'), 'the heart belongs to «خيري»');
  });

  test('29. (INV-12) no «مجان|ببلاش» outside #pub-cross, «المؤسسة» never (© names the entity), no feminine imperatives', () => {
    const text = visible(h.replace(/<a class="pub-cross"[\s\S]*?<\/a>/, ''));
    assert.ok(!/مجان|ببلاش/.test(text), text.match(/.{40}(?:مجان|ببلاش).{40}/)?.[0]);
    assert.ok(!text.includes('المؤسسة'));
    assert.ok(!FEMININE.test(text), text.match(new RegExp(`.{30}(?:${FEMININE.source}).{30}`))?.[0]);
    assert.ok(visible(h).includes('مجاني'), 'the way back says «مجاني»');
  });

  test('30. (G11-04 r2) JSON-LD: paid LegalService (#paid-services, knowsAbout incl. «الطلاق والخلع»), WebPage and a 5-question paid FAQPage without «مجان»; no NGO node until O-25', () => {
    const ld = ldOf(h);
    assert.deepEqual(ld.map((n) => n['@type']), ['LegalService', 'WebPage', 'FAQPage']);
    assert.equal(ld[0]['@id'], `${t.base}/services#paid-services`);
    assert.ok(ld[0].knowsAbout.includes('الطلاق والخلع') && ld[0].knowsAbout.includes('إدارة قانونية للشركات'));
    assert.equal(ld[2].mainEntity.length, 5);
    assert.ok(!/مجان|ببلاش|المؤسسة/.test(JSON.stringify(ld)));
    assert.deepEqual(ld[2].mainEntity.map((q) => q.name), ['كم تكلّف الاستشارة؟', 'من يطّلع على بياناتي؟', 'متى يصلني الرد؟', 'هل تقدمون خدماتكم للشركات؟', 'أضعت رابط طلبي، ماذا أفعل؟']);
    // the same questions are on the page
    for (const q of ld[2].mainEntity) assert.ok(h.includes(`<span>${q.name}</span>`), q.name);
  });

  test('31. (G11-29) companies band iff b2b_enabled: primary /intake?seg=paid&mode=company&entry=company_band, «دخول بوابة الشركات» iff the portal is open; the «للشركات» row and FAQ 4 follow the switch', async () => {
    assert.match(h, /<section id="companies"[\s\S]*?<h2 id="companies-title" class="pub-band-title">إدارتكم القانونية الافتراضية<\/h2>/);
    assert.match(h, /<a class="pub-btn pub-btn-band-gold" href="\/intake\?seg=paid&amp;mode=company&amp;entry=company_band" data-cta="intake">اطلبوا عرضًا لشركتكم<\/a>/);
    assert.match(h, /<a class="pub-btn pub-btn-on-dark" href="\/company">دخول بوابة الشركات<\/a>/);
    t.app.settings.set('b2b_enabled', false);
    try {
      const off = (await get('/services')).body;
      assert.ok(!off.includes('id="companies"') && !off.includes('class="pub-co-row"') && !off.includes('/company"'));
      assert.ok(off.includes('هل يمكن أن تتصلوا بي بدلًا من الكتابة؟'));
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
  });

  test('32. paid WhatsApp follows app.segments.publicDigits: default = main digits + the paid sentence; wa_paid_on_main=false → no wa.me on /services while the charity side keeps the main number + SITE_GREETING', async () => {
    const waHrefs = (html) => [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decode(m[1]));
    const on = waHrefs(h);
    assert.ok(on.length >= 3);
    for (const u of on) assert.ok(u.startsWith('https://wa.me/201000000001?text='), u);
    assert.ok(on.some((u) => u.endsWith(encodeURIComponent(paidWaPrefill(null)))));
    assert.ok(on.some((u) => u.includes(encodeURIComponent('مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.'))), 'company sentence in the band');
    t.app.settings.set('wa_paid_on_main', false);
    try {
      const off = (await get('/services')).body;
      assert.equal(waHrefs(off).length, 0);
      assert.match(off, /<ul class="pub-pick-ways" data-n="2">/);
      const ch = waHrefs((await get('/khayri')).body);
      assert.ok(ch.length && ch.every((u) => u.startsWith('https://wa.me/201000000001?text=')));
      assert.ok(ch.some((u) => u.endsWith(encodeURIComponent('السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.'))));
    } finally {
      t.app.settings.set('wa_paid_on_main', true);
    }
  });

  test('33. ways «نتصل بكم» (/intake?seg=paid&mode=callback&entry=home_callback) · «واتساب» · «متابعة طلب»; hours line; #how step 3 mentions WhatsApp only with paid digits; written-fee wording (§0)', () => {
    assert.match(h, /<a class="pub-pick-way pub-pick-way--callback" href="\/intake\?seg=paid&amp;mode=callback&amp;entry=home_callback" data-cta="intake">[\s\S]*?<b>نتصل بكم<\/b><\/a>/);
    assert.match(h, /<li data-follow><a class="pub-pick-way pub-pick-way--follow" href="\/portal">[\s\S]*?<b>متابعة طلب<\/b><\/a><\/li>/);
    assert.match(h, /مواعيد العمل: /);
    assert.match(h, /ويصلكم الرأي القانوني مكتوبًا على صفحة طلبكم وعلى واتساب، ونتابع معكم الخطوات\./);
    assert.match(h, /يراجع فريقنا طلبكم ويرسل لكم الأتعاب المقترحة كتابةً قبل أي عمل\./);
    assert.match(h, /data-saved-label="صفحة طلبكم" data-saved-forget="ليس هاتفكم؟ احذفوا الرابط"/);
  });

  test('34. paid critical block ≤ 3,500 B; /services first <style> ≤ 12,288 B, ≤ 16 KB br; the list rows sit in the paid block', async () => {
    const paid = critical('paid');
    assert.ok(paid.length > 0 && Buffer.byteLength(paid) <= 3500, `paid ${Buffer.byteLength(paid)}`);
    assert.match(paid, /\.pub-topic-list\{/);
    assert.match(paid, /body\.pub \.pub-cross\{display:flex;align-items:center;gap:8px;min-height:44px/);
    assert.ok(Buffer.byteLength(firstStyle(h)) <= 12288, `style ${Buffer.byteLength(firstStyle(h))}`);
    assert.ok(firstStyle(h).includes('.pub-topic-list{') && !firstStyle(h).includes('.gate-choices{'));
    assert.ok(br(Buffer.from(h)) <= 16384, `br ${br(Buffer.from(h))}`);
  });
});

// ───────────────────────── 36–40: الميزانيات وCSP وlanding.js ─────────────────────────

describe('v11 gate-public — budgets, CSP and landing.js (GP-1/GP-4)', () => {
  test('35. (INV-09) / gate state, / charity state and /khayri: ≤ 14,336 B br, ≤ 71,680 B raw, first <style> ≤ 12,288 B', async () => {
    for (const [p, headers] of [['/', {}], ['/', { cookie: 'bm_seg=charity' }], ['/khayri', {}]]) {
      const html = (await get(p, headers)).body;
      const tag = `${p} ${headers.cookie || ''}`;
      assert.ok(Buffer.byteLength(html) <= 71680, `${tag} raw ${Buffer.byteLength(html)}`);
      assert.ok(br(Buffer.from(html)) <= 14336, `${tag} br ${br(Buffer.from(html))}`);
      assert.ok(Buffer.byteLength(firstStyle(html)) <= 12288, `${tag} style ${Buffer.byteLength(firstStyle(html))}`);
    }
  });

  test('36. (INV-06) no inline executable script on /, /khayri, /services; JSON blocks only; CSP script-src self', async () => {
    for (const p of ['/', '/khayri', '/services', '/?gate=1']) {
      const r = await get(p);
      const inline = [...r.body.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="application\/(?:ld\+)?json"/.test(m[1]));
      assert.equal(inline.length, 0, p);
      assert.ok(!/\son[a-z]+="/i.test(r.body), `${p} inline handler`);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    }
  });

  test('37. landing closure ≤ 4,096 B br (gate logic included), listen.js stays lazy; /services loads the same landing module', async () => {
    const served = (url) => br(transformAsset(path.join(PUB, url.split('?')[0])));
    const closure = ['/assets/js/public/landing.js', ...preloadClosure(path.join(PUB, 'assets/js/public/landing.js'), PUB)];
    assert.ok(!closure.some((u) => /listen\.js|intake\.js|ui\.js|segment\.js/.test(u)), closure.join(' '));
    const size = closure.reduce((s, u) => s + served(u), 0);
    assert.ok(size <= 4096, `landing ${size}`);
    assert.match((await get('/services')).body, /<script type="module" src="\/assets\/js\/public\/landing\.js\?v=/);
  });

  test('38. (G11-17 + r2 S12/S19) landing.js: «خيري» reveals in place (cookie, title from data-title-site, pushState /khayri, focus #start-title), popstate re-shows the gate on /, pageshow re-syncs the cookie on bfcache restores; the paid card is not intercepted', () => {
    const src = read('public/assets/js/public/landing.js');
    assert.match(src, /gate\.querySelector\('\.gate-card--charity'\)\?\.addEventListener\('click'/);
    assert.ok(!/gate-card--paid/.test(src), 'paid card = ordinary link');
    assert.match(src, /e\.preventDefault\(\);\s*setSide\('charity'\);\s*show\(false\);/);
    assert.match(src, /history\.pushState\(\{ gate: false \}, '', `\/khayri\$\{qs \? `\?\$\{qs\}` : ''\}\$\{location\.hash\}`\)/);
    assert.match(src, /gate\.dataset\.titleSite/);
    assert.match(src, /addEventListener\('popstate'/);
    assert.match(src, /location\.pathname === '\/'/);
    assert.match(src, /const syncSide = \(\) => body\.dataset\.segSync === '1' && !body\.classList\.contains\('has-gate'\) && setSide\(body\.dataset\.side\);/);
    assert.match(src, /addEventListener\('pageshow', \(\) => document\.prerendering \|\| syncSide\(\)\);/);
    assert.match(src, /document\.addEventListener\('prerenderingchange', syncSide\);/);
    assert.match(src, /bm_seg=\$\{side\}; Path=\/; Max-Age=15552000; SameSite=Lax\$\{location\.protocol === 'https:' \? '; Secure' : ''\}/);
    assert.match(src, /toggleAttribute\('inert', on\)/);
    assert.match(src, /import\('\.\/listen\.js'\)/);
    assert.ok(!/^import[^\n]*listen\.js/m.test(src));
  });
});
