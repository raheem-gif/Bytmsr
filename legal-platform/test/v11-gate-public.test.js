// v11 gate-public — شاشة الاختيار، صفحتا «خيري» والأفراد والشركات، الكعكة والتخزين، الرأس والتذييل حسب الجانب (GP-0…GP-4)
// المواصفة: scratchpad/v11-spec.md §9.4 (G11 §15.1 مع تعديلات r2). GP-5…GP-7: النموذج بنصوص كل جانب، طلب عرض الشركات،
// صفحة المتابعة والدخول بنبرة الطلب، والصفحات القانونية (39 وما بعدها).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestApp } from './helpers.js';
import { sendBody } from '../src/http.js';
import { GATE_ORDER, GATE_COPY, GATE_PICTOS, PAID_TOPIC_ICONS, CRITICAL_RE, CAMPAIGN_KEYS, SITE_PAGES } from '../src/site.js';
import { preloadClosure, transformAsset, setPublicRoot, stripJsCommentLines as stripJs } from '../src/site-assets.js';
import { PAID_TOPICS, paidWaPrefill } from '../public/assets/js/public/segment.js';
import { TOPICS } from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';
import crypto from 'node:crypto';
import { QUESTIONS } from '../public/assets/js/public/topics.js';
import { genderize } from '../public/assets/js/public/words.js';
import { INTAKE_COPY, INTAKE_MSG, INTAKE_SUCCESS, INTAKE_ABOUT, INTAKE_QUESTIONS, INTAKE_ERR, INTAKE_CROSS, PORTAL_PAID, PORTAL_LOGIN_PAID, intakePaidCopy, waFrom } from '../src/site-copy-paid.js';

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

// ───────────────────────── 39–52: /intake بنصوص كل جانب (GP-5) ─────────────────────────

/** جدولا COPY وMSG في intake.js كما هما (كائنان حرفيان بلا متغيرات) */
function intakeTables() {
  const src = read('public/assets/js/public/intake.js');
  const tbl = (name) => {
    const i = src.indexOf(`const ${name} = {`);
    const j = src.indexOf('\n};', i);
    return Function(`return {${src.slice(src.indexOf('{', i) + 1, j)}}`)();
  };
  return { src, COPY: tbl('COPY'), MSG: tbl('MSG') };
}
/** نفس fill في intake.js */
const fill = (s, o) => String(s).replace(/\{([a-z]+)\}/g, (m, k) => (k in o ? o[k] : m));
const bmCopyOf = (h) => {
  const m = /<script type="application\/json" id="bm-copy">([\s\S]*?)<\/script>/.exec(h);
  return m ? { raw: m[1], data: JSON.parse(m[1]) } : null;
};
/** نصوص شاشة «وصلنا طلبك» و«كمان سؤالين» الحرفية في intake.js 10.0 (6caa6d7) — تبقى كما هي في جداول COPY */
const SUCCESS_10 = ["وصلنا رسالتك. شكرًا!","الصفحة الرئيسية","وصلنا طلبك","ولو بعت{ي}لنا على واتساب، هنبعتلك هناك كمان.","اسمع{ي} الرقم","هنكلمك","لو عندك واتساب على الرقم ده، ابعت{ي}لنا الرسالة دي عشان نبعتلك كمان هناك","ابعت{ي}لنا رقم طلبك على واتساب، عشان نقدر نرد عليك{ي} هناك.","بعت{ي}ها؟ هيوصلك رد مننا على واتساب.","لسه ما بعت{ي}هاش؟ ابعت{ي}ها تاني","خطوة أخيرة مهمة","ابعت{ي} رقم الطلب على واتساب","تأكيد الرقم على واتساب","نسخ الرابط","اتنسخ","اتنسخ الرابط","ابعت{ي} الرابط لنفسك","اتحفظت كمان على الموبايل ده. ","اتمسحت من الموبايل ده.","مش موبايلك؟ امسح{ي}ها","صفحة طلبك","احفظ{ي} صفحة طلبك","من الصفحة دي هتعرف{ي} كل جديد، وتبعت{ي} الورق.","افتح{ي} صفحة طلبك","ابعت{ي}ه لنفسك بس، مش لحد تاني.","هيحصل إيه بعد كده؟","هنكلمك ونسمع مشكلتك.","ممكن نطلب منك ورقة أو معلومة.","رقم طلبك: "," — قول{ي}ه لو كلمت{ي}نا.","لو حد طلب منك فلوس باسمنا، بلغ{ي}نا فورًا: ","شكرًا.","الخدمة مجانية، ومحدش هيطلب منك فلوس.","وصلنا طلبك.","كمان سؤالين — لو تحبي","سؤال كمان — لو تحب{ي}","تخطي","اختار{ي} المحافظة","إنت{ي} من أنهي محافظة؟","إنتي…؟","لحظة…","ما اتسجلش. مش مشكلة، تقدر{ي} تقول{ي}لنا بعدين.","شكرًا، كده تمام."];
const BANNED = /مجان|ببلاش|المؤسسة/;
const FEM_ALL = /اكتبي|ابعتي|صوّري|اختاري|سجّلي|اضغطي|قولي|تقدري|حاولي|ارجعي|تابعي|كمّلي|ابدئي|اتصلي|افتحي|كلمينا|تحبي|إنتي|كنتي|اسمعي|وقّفي|جربي|اتأكدي|بيكي|سيبي|اطلبي|\{ي\}|\{ة\}/;

describe('v11 gate-public — /intake per side (GP-5)', () => {
  test('39. (INV-10, G11 test 26) charity /intake: no bm-copy, bm-public.segment charity, the 10.0 <main> subtree byte for byte apart from seg=charity and the icon stroke', async () => {
    const r = await get('/intake');
    const h = r.body;
    assert.equal(bmCopyOf(h), null);
    assert.equal(JSON.parse(/<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(h)[1]).segment, 'charity');
    assert.equal(titleOf(h), `احكيلنا مشكلتك — ${BRAND}`);
    const main = /<main[\s\S]*?<\/main>/.exec(h)[0].replace(/ stroke-width="[\d.]+"/g, '').replace(/seg=charity&(?:amp;)?/g, '').replace(/\?seg=charity"/g, '"');
    // sha256 of the same normalisation of GET /intake on the 10.0 tree (6caa6d7, test helpers, seed none)
    assert.equal(crypto.createHash('sha256').update(main).digest('hex'), 'f08eadf8ae629749291d151f3d0e25a0a3c99d7fb9ce6af30bc942de8c66ba31');
    assert.ok(Buffer.byteLength(h) <= 31002 + 4096, 'charity /intake HTML stays close to 10.0 (chrome only)');
  });

  test('40. paid /intake: bm-copy (application/json, escaped) holds every G11-39 table + textFirst, CROSS and ERR; ≤ 12,288 B raw and ≤ 4,096 B br (deviation from 6,144: G11-39 verbatim + r2 S16); paid title, description, canonical, session cookie, paid LegalService without NGO', async () => {
    const r = await get('/intake?seg=paid&topic=inh');
    const h = r.body;
    const bm = bmCopyOf(h);
    assert.ok(bm, 'bm-copy present');
    assert.ok(!bm.raw.includes('<') && !bm.raw.includes('>'), 'jsonForScript escaping');
    assert.ok(Buffer.byteLength(bm.raw) <= 12288, `raw ${Buffer.byteLength(bm.raw)}`);
    assert.ok(br(Buffer.from(bm.raw)) <= 4096, `br ${br(Buffer.from(bm.raw))}`);
    const x = bm.data;
    for (const k of ['COPY', 'MSG', 'QUESTIONS', 'UNKNOWN', 'CALLBACK_WHEN', 'TOPICS', 'WA', 'SUCCESS', 'ABOUT', 'ERR', 'CROSS']) assert.ok(x[k], k);
    assert.equal(x.textFirst, true);
    assert.deepEqual(x.COPY, INTAKE_COPY);
    assert.deepEqual(x.MSG, INTAKE_MSG);
    assert.deepEqual(x.SUCCESS, INTAKE_SUCCESS);
    assert.equal(x.UNKNOWN, 'لا أعرف');
    assert.deepEqual(x.CALLBACK_WHEN, { morning: 'صباحًا', noon: 'ظهرًا', any: 'أي وقت' });
    assert.deepEqual(Object.keys(x.TOPICS), ORDER);
    for (const k of ORDER) assert.equal(x.TOPICS[k].label, PAID_TOPICS[k].label, k);
    assert.equal(x.TOPICS.other.sub, 'الطلاق والخلع، العقود، العمل، الشركات، وغيرها');
    for (const k of [null, ...ORDER]) assert.equal(waFrom(x.WA, k), paidWaPrefill(k), `WA ${k}`);
    // G11-39 COPY verbatim (a sample of every group) and MSG
    assert.equal(x.COPY.topicH1, 'كيف نساعدكم؟');
    assert.equal(x.COPY.storySubText, 'اكتبوا الموضوع بكلماتكم في جملة أو اثنتين. اذكروا كل ما يهمكم، ولو كان أكثر من موضوع.');
    assert.equal(x.COPY.callbackBtn, 'تفضّلون مكالمة؟ اتركوا رقمكم ونتصل بكم');
    assert.equal(x.COPY.consent, 'بالضغط على «إرسال الطلب» توافقون على استخدام كلامكم ورقمكم للتواصل معكم بخصوص طلبكم فقط.');
    assert.equal(x.MSG.phoneBad, 'الرقم غير صحيح. اكتبوه هكذا: 01012345678');
    assert.equal(x.SUCCESS.reassure, 'لن نبدأ أي عمل ولن نطلب أي أتعاب قبل موافقتكم.');
    assert.equal(x.SUCCESS.aText, 'أرسلوا رقم الطلب برسالة واحدة على واتساب، وسنرسل لكم كل جديد هناك.');
    assert.equal(fill(x.SUCCESS.s3, { w: x.SUCCESS.s3wa }), 'يصلكم الرد على صفحة طلبكم، وعلى واتساب إن أرسلتم لنا رقم الطلب.');
    assert.equal(x.ABOUT.abGov, 'في أي محافظة تقيمون؟');
    assert.equal(titleOf(h), `طلب استشارة — ${BRAND}`);
    assert.match(h, /<meta name="description" content="اكتبوا موضوعكم القانوني أو سجّلوه برسالة صوتية، وأرفقوا صور المستندات\. نتفق معكم على الأتعاب قبل أي عمل، وبياناتكم سرية\." \/>/);
    assert.equal(canonicalOf(h), `${t.base}/intake?seg=paid`);
    assert.equal(r.headers.get('set-cookie'), 'bm_seg=paid; Path=/; SameSite=Lax', 'session-only');
    const types = ldOf(h).map((n) => n['@type']);
    assert.ok(types.includes('LegalService') && !types.includes('NGO') && !types.includes('FAQPage'), types.join());
    assert.match(h, /<body class="site pub v91 bmf-page" data-side="paid">/);
    const company = await get('/intake?seg=paid&mode=company');
    assert.equal(titleOf(company.body), `طلب عرض لخدمات الشركات — ${BRAND}`);
    assert.ok(bmCopyOf(company.body).data.company.css.startsWith('/assets/css/v11-lead.css?v='));
  });

  test('41. (r2 P16) paid QUESTIONS cover every topics.js question with the same answer count and the r2 wording', () => {
    assert.deepEqual(Object.keys(INTAKE_QUESTIONS).sort(), Object.keys(QUESTIONS).sort());
    for (const id of Object.keys(QUESTIONS)) assert.equal(INTAKE_QUESTIONS[id].a.length, QUESTIONS[id].answers.length, id);
    assert.equal(INTAKE_QUESTIONS['inh.deceased'].a[0], 'الزوج أو الزوجة');
    assert.equal(INTAKE_QUESTIONS['pen.whose'].a[0], 'معاش الزوج أو الزوجة');
    assert.equal(INTAKE_QUESTIONS['alimony.father'].h1, 'ما وضع الأب؟');
    assert.equal(INTAKE_QUESTIONS['inh.certificate'].sub, 'حكم من المحكمة يحدد الورثة');
  });

  test('42. (INV-12) no paid text says «مجان|ببلاش|المؤسسة» or speaks feminine — except the .pub-cross row; paid /intake visible HTML is clean', async () => {
    const all = { ...INTAKE_COPY, ...INTAKE_MSG, ...INTAKE_SUCCESS, ...INTAKE_ABOUT, ...INTAKE_ERR };
    for (const [k, v] of Object.entries(all)) {
      assert.ok(!BANNED.test(v), `${k}: ${v}`);
      assert.ok(!FEM_ALL.test(v), `${k}: ${v}`);
    }
    for (const q of Object.values(INTAKE_QUESTIONS)) for (const v of [q.h1, q.sub || '', ...q.a]) assert.ok(!BANNED.test(v) && !FEM_ALL.test(v), v);
    assert.ok(/مجان/.test(INTAKE_CROSS.kicker + INTAKE_CROSS.text), 'the way back is the only exception');
    const h = (await get('/intake?seg=paid')).body;
    const text = visible(h.replace(/<footer[\s\S]*?<\/footer>/, ''));
    assert.ok(!BANNED.test(text), 'visible paid /intake');
    assert.ok(!FEMININE.test(text));
  });

  test('43. (r2 S16) every user-visible Arabic literal of intake.js is in MSG/COPY; charity values unchanged; every charity key is either overridden for paid or neutral', () => {
    const { src, COPY, MSG } = intakeTables();
    const tables = [src.indexOf('const MSG = {'), src.indexOf('\n};', src.indexOf('const COPY = {'))];
    const outside = src.slice(0, tables[0]) + src.slice(tables[1]);
    const bad = [];
    for (const line of stripJs(outside).split('\n')) {
      const code = line.replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '');
      for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|"((?:[^"\\\n]|\\.)*)"/g)) if (/[\u0600-\u06FF]/.test(m[1] ?? m[2] ?? m[3])) bad.push(line.trim());
    }
    assert.deepEqual(bad, [], 'Arabic literals outside MSG/COPY');
    // charity strings of 10.0 are still the values (success + about screens)
    for (const s of SUCCESS_10) assert.ok(src.includes(`'${s}'`) || Object.values(COPY).flat().includes(s), s);
    assert.equal(fill(COPY.thanksName, { name: 'سامية' }), 'شكرًا يا سامية.');
    assert.equal(fill(COPY.s3, { w: genderize(COPY.s3wa, 'f') }), 'محامي هيدرس مشكلتك، وهنبعتلك الرد على صفحتك، وعلى واتساب لو بعتيلنا رقم الطلب.');
    assert.equal(fill(COPY.s1, { d: 'يومين' }), 'فريقنا هيقرا طلبك — غالبًا خلال يومين شغل.');
    assert.equal(genderize(fill(COPY.cbRest, { n: 29 }), 'f'), 'أول ما تردي هنقولك "طلب رقم 29" عشان تعرفي إنه إحنا. لو ما رديتيش هنكلمك تاني.');
    assert.equal(fill(COPY.cbLead, { eta: COPY.eta2, when: ' الصبح' }), 'هنكلمك خلال يومين شغل الصبح');
    assert.equal(fill(COPY.spokenRef, { n: 'تسعة وعشرين' }), 'وصلنا طلبك. رقم طلبك تسعة وعشرين.');
    assert.equal(MSG.problem, 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.');
    // keys the paid side shares on purpose (neutral words, file names, or charity-only steps)
    const paid = new Set([...Object.keys(INTAKE_COPY), ...Object.keys(INTAKE_SUCCESS), ...Object.keys(INTAKE_ABOUT)]);
    assert.deepEqual(Object.keys(COPY).filter((k) => !paid.has(k)).sort(), ['ab2', 'abRel', 'back', 'bCopy', 'days', 'docName', 'home', 'hp', 'of', 'rel', 'share', 'shareB', 'topicAria', 'voiceName', 'wait'].sort());
    assert.deepEqual(Object.keys(MSG).sort(), Object.keys(INTAKE_MSG).sort());
    assert.match(src, /if \(!X && !infer\(answers\)\.relation && form !== 'm'\) steps\.push\('rel'\);/, 'paid: governorate only (ab2/abRel/rel never shown)');
  });

  test('44. (r2 S16) every server error code of POST /api/public/intake has a paid ERR text; intake.js maps it on the paid side and keeps the server text for charity', () => {
    const route = read('src/routes/public.js');
    const codes = new Set([...route.matchAll(/withCode\([^;]*?'([a-z_]+)'\)/g)].map((m) => m[1]).concat(['rate_limited', 'invalid']));
    for (const c of ['too_many_files', 'too_many_audio', 'too_short', 'bad_phone', 'bad_name']) assert.ok(codes.has(c), c);
    for (const c of codes) assert.ok(INTAKE_ERR[c], `ERR.${c}`);
    assert.ok(INTAKE_ERR.big);
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /const msg = network \? MSG\.net : X\?\.ERR \? X\.ERR\[e\.code\] \|\| X\.ERR\[e\.status === 413 \? 'big' : 'invalid'\] : U\.friendlyError\(e\);/);
  });

  test('45. (L11-37, r2 P17/P2) paid story screen is text-first; the .pub-cross row is on the paid topic and phone steps only, links to /intake?seg=charity&topic=…, and re-tags the draft first', () => {
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /let micOn = !X\?\.textFirst \|\| voices\(\)\.length > 0;/);
    assert.match(src, /let typing = !mic \|\| !micOn \|\| nonSpace\(state\.description\) > 0;/);
    assert.match(src, /X\?\.textFirst && mic\s*\? h\(\s*'button\.bmf-btn\.bmf-btn-text\.bmf-or-voice'/);
    const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\nfunction ', src.indexOf(`function ${name}(`) + 10));
    assert.ok(fn('topicScreen').includes('crossRow()'));
    assert.ok(fn('phoneScreen').includes('crossRow()'));
    for (const other of ['questionScreen', 'storyScreen', 'showSuccess', 'aboutCard']) assert.ok(!fn(other).includes('crossRow()'), other);
    const cross = fn('crossRow');
    assert.match(cross, /const c = X\?\.CROSS;\s*if \(!c\) return null;/, 'charity pages never show it');
    assert.match(cross, /`\/intake\?seg=charity\$\{state\.topic \? `&topic=\$\{state\.topic\}` : ''\}`/);
    assert.match(cross, /await draftStore\(keyOf\('charity'\)\)\.save\(\{ \.\.\.draftObject\(\), seg: 'charity' \}\);\s*await store\.clear\(\);/);
    assert.deepEqual([INTAKE_CROSS.kicker, INTAKE_CROSS.text, INTAKE_CROSS.go], ['مجاني', 'تبحثون عن مساعدة قانونية مجانية؟', 'خيري ‹']);
    assert.ok(read('src/site.js').includes('<span class="gate-kicker">مجاني</span><span class="pub-cross-text">تبحثون عن مساعدة قانونية مجانية؟</span> <b class="pub-cross-go">خيري ‹</b>'), 'same row as /services');
  });

  test('46. (L11-53, r2 S23) drafts: one key per side (charity keeps the 10.0 key), the draft stores seg; explicit seg › draft seg › cookie; a draft of the other side is never offered under an explicit seg', () => {
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /const keyOf = \(s\) => \(s === 'paid' \? `\$\{DRAFT_KEY\}-paid` : DRAFT_KEY\);\s*const store = draftStore\(keyOf\(SEG\)\);/);
    assert.match(src, /v: 2,\s*seg: SEG,/);
    assert.match(src, /if \(!params\.get\('seg'\) && !\(await store\.load\(\)\)\) \{\s*const other = SEG === 'paid' \? 'charity' : 'paid';\s*if \(await draftStore\(keyOf\(other\)\)\.load\(\)\) \{\s*params\.set\('seg', other\);\s*window\.location\.replace/);
    // the banner still never names the side or the topic (9.2 tests 15–17)
    const banner = src.slice(src.indexOf("banner = h(\n    'section.bmf-banner'"), src.indexOf('COPY.draftNew,'));
    assert.ok(!/SEG|seg|خيري|أفراد/.test(banner));
  });

  test('47. (§4) /intake closure ≤ 32,768 B br without segment.js, site-copy-paid.js or intake-company.js; intake.js grows ≤ 1,800 B br over 10.0 (17,345 B served); drafts.js +0; intake-company.js ≤ 4,096 B br and v11-lead.css ≤ 1,536 B br, both lazy', () => {
    const served = (url) => br(transformAsset(path.join(PUB, url.split('?')[0])));
    const closure = ['/assets/js/public/intake.js', ...preloadClosure(path.join(PUB, 'assets/js/public/intake.js'), PUB)];
    assert.ok(!closure.some((u) => /segment\.js|site-copy-paid|intake-company|recorder\.js|upload\.js/.test(u)), closure.join(' '));
    assert.ok(closure.reduce((s, u) => s + served(u), 0) <= 32768);
    const grow = served('/assets/js/public/intake.js') - 17345;
    assert.ok(grow <= 1800, `intake.js +${grow}`);
    assert.ok(served('/assets/js/public/drafts.js') <= 2034 + 200);
    assert.ok(served('/assets/js/public/intake-company.js') <= 4096);
    assert.ok(br(fs.readFileSync(path.join(PUB, 'assets/css/v11-lead.css'))) <= 1536);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(read('public/assets/css/v11-lead.css').replace(/\/\*[\s\S]*?\*\//g, '')), 'tokens only');
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /\(await import\('\.\/intake-company\.js'\)\)\.companyLead\(/);
    assert.ok(!/^import[^\n]*(intake-company|segment|site-copy-paid)/m.test(src));
    assert.match(src, /\['\/', '\/khayri', '\/services'\]\.includes\(r\.pathname\)\) return 'home_tile'/, 'entry: both homes count as home_tile');
    assert.match(src, /segment: SEG,/, 'segment in the payload');
  });

  test('48. company lead (G11-45): copy verbatim, requester payload, no WhatsApp card; POST round trip — 201 paid with requester, canned body, entry company_band; bad e-mail → 400 fields.email; requester on charity → 400', async () => {
    const co = read('public/assets/js/public/intake-company.js');
    for (const s of ['اطلبوا عرضًا لشركتكم', 'املأوا البيانات، ويتواصل معكم فريقنا خلال يوم عمل لترتيب مكالمة تعريفية وعرض مناسب.', 'اسم الشركة', 'اسم المسؤول عن التواصل', 'المسمى الوظيفي (اختياري)', 'البريد الإلكتروني (اختياري)', 'عدد الموظفين (اختياري)', 'ما الذي يهمكم؟ (اختياري)', 'تفاصيل إضافية (اختياري)', 'مثال: نحتاج مراجعة عقود الموردين وشؤون الموظفين، ولدينا 40 موظفًا.', 'بالضغط على «إرسال الطلب» توافقون على استخدام هذه البيانات للتواصل معكم بخصوص العرض فقط.', 'سيتواصل معكم فريقنا خلال يوم عمل.', 'لديكم حساب في بوابة الشركات؟ ', 'صفحة الطلب', 'أكثر من 200', 'مراجعة العقود وصياغتها', 'اشتراك شهري متكامل']) assert.ok(co.includes(s), s);
    assert.ok(!/wa\.me|confirm_url|whatsapp/i.test(co), 'no WhatsApp confirm card for companies');
    assert.ok(!BANNED.test(co) && !FEMININE.test(co));
    assert.match(co, /segment: 'paid',\s*requester,/);
    const c = t.client();
    const ok = await c.post('/api/public/intake', { name: 'منى عادل', phone: '01012340001', email: 'mona@co.example', segment: 'paid', requester: { kind: 'company', company_name: 'شركة النيل', job_title: 'مديرة', email: 'mona@co.example', employees: '11-50', needs: ['contracts', 'employees'] }, entry: 'company_band', mode: 'form', consent: true, consent_v: 1, submission_id: 'wcompanyleadtest00001' });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.segment, 'paid');
    const admin = await t.login('admin');
    const list = (await admin.get('/api/admin/intakes?segment=paid')).body.items;
    const it = list.find((x) => x.code === ok.body.reference);
    assert.equal(it.requester_kind, 'company');
    const detail = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
    assert.equal(detail.segment.requester.company_name, 'شركة النيل');
    const row = t.app.db.get('SELECT form_answers, source_detail FROM intakes WHERE id = ?', it.id);
    assert.match(row.form_answers, /"entry":"company_band"/);
    assert.match(String(row.source_detail || ''), /"requester"/);
    const bad = await c.post('/api/public/intake', { phone: '01012340002', segment: 'paid', requester: { kind: 'company', company_name: 'شركة', email: 'not-an-email' }, consent: true, submission_id: 'wcompanyleadtest00002' });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details?.fields?.email);
    const charity = await c.post('/api/public/intake', { phone: '01012340003', segment: 'charity', requester: { kind: 'company', company_name: 'شركة' }, description: 'وصف كافٍ للطلب هنا', consent: true, submission_id: 'wcompanyleadtest00003' });
    assert.equal(charity.status, 400);
  });
});

// ───────────────────────── 49–56: المتابعة والدخول والصفحات القانونية (GP-6/GP-7) ─────────────────────────

describe('v11 gate-public — follow-up page, sign-in and legal pages (GP-6/GP-7)', () => {
  const portalPath = async (segment, phone, sid) => {
    const r = await t.client().post('/api/public/intake', { phone, segment, description: 'نزاع على عقد إيجار محل تجاري مع المالك', consent: true, consent_v: 1, submission_id: sid });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return new URL(r.body.portal_url, t.base).pathname;
  };

  test('49. (H-G1, r2 S2) /p/<paid>: bm-copy PORTAL_PAID (≤ 3,072 B raw), paid chrome and the paid contact with no cookie and with bm_seg=charity; /p/<charity>: no bm-copy, charity chrome even with bm_seg=paid; no-store kept', async () => {
    const paid = await portalPath('paid', '01055550001', 'wportalpaidtest000001');
    const charity = await portalPath('charity', '01055550002', 'wportalcharitytest0001');
    for (const cookie of ['', 'bm_seg=charity']) {
      const r = await get(paid, cookie ? { cookie } : {});
      const h = r.body;
      const bm = bmCopyOf(h);
      assert.ok(bm, `bm-copy ${cookie}`);
      assert.deepEqual(bm.data, PORTAL_PAID);
      assert.ok(Buffer.byteLength(bm.raw) <= 3072, `${Buffer.byteLength(bm.raw)}`);
      assert.match(h, /data-side="paid"/);
      assert.equal(titleOf(h), `متابعة طلبكم — ${BRAND}`);
      assert.ok(headerOf(h).includes('href="/services"'), 'brand → /services');
      assert.ok(!headerOf(h).includes('pub-seg-pill'), 'no pill on /p/');
      assert.match(headerOf(h), /<a class="pub-head-contact pub-head-contact--wa" href="https:\/\/wa\.me\/201000000001\?text=[^"]+"/, 'paid side: main digits + the paid sentence (default)');
      assert.ok(decode(headerOf(h)).includes(encodeURIComponent('مرحبًا، أرغب في حجز استشارة قانونية.')));
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const data = JSON.parse(/<script type="application\/json" id="bm-portal-data">([\s\S]*?)<\/script>/.exec(h)[1]);
      assert.equal(data.tone, 'paid');
      assert.ok(!BANNED.test(visible(h.replace(/<footer[\s\S]*?<\/footer>/, ''))));
    }
    const c = await get(charity, { cookie: 'bm_seg=paid' });
    assert.equal(bmCopyOf(c.body), null);
    assert.match(c.body, /data-side="charity"/);
    assert.equal(titleOf(c.body), `متابعة طلبك — ${BRAND}`);
  });

  test('50. (G11-46, r2 P18) PORTAL_PAID: the MUST and chrome tables verbatim; no banned word, no feminine form, no colloquial first-screen word; portal.js reads each key through P() and keeps the charity text as the fallback', () => {
    const must = {
      moneyInfo: 'هذه الأتعاب والمصاريف المتفق عليها لطلبكم.',
      agreeNote: 'هذا المبلغ خاص بطلبكم، ولا يُطلب منكم قبل موافقتكم.',
      payUs: 'ادفعوا لنا مباشرة فقط، واحتفظوا بالإيصال دائمًا.',
      cantPay: 'لأي استفسار عن المبلغ، راسلونا من هنا.',
      howPay: 'طريقة الدفع',
      voiceFrom: 'رسالة صوتية من فريقنا',
      org: 'فريقنا',
      walkIn: 'في مكتبنا',
      newReq: 'لديكم موضوع جديد؟ أرسلوه من هنا',
      newHref: '/intake?seg=paid',
      hi: 'مرحبًا {name}',
      hi0: 'مرحبًا بكم',
      mine: 'هذه صفحة طلبكم الخاصة، ولا يطّلع عليها غيركم.',
      answerReady: 'الرد على طلبكم جاهز',
      whatNow: 'الخطوات التالية',
      track: 'حالة طلبكم',
      loading: 'جارٍ تحميل صفحتكم…',
      loadFail: 'تعذّر فتح الصفحة. تأكدوا من الاتصال وحاولوا مرة أخرى.',
    };
    for (const [k, v] of Object.entries(must)) assert.equal(PORTAL_PAID[k], v, k);
    for (const [k, v] of Object.entries(PORTAL_PAID)) {
      assert.ok(!/مجان|ببلاش|للمؤسسة|المؤسسة/.test(v), k);
      assert.ok(!FEM_ALL.test(v), k);
      assert.ok(!/دلوقتي|إزاي|عايز|محدش|اعمل|ابعت/.test(v), k);
    }
    const src = read('public/assets/js/public/portal.js');
    for (const [k, charity] of [['moneyInfo', 'الاستشارة نفسها مجانية. المبالغ دي مصاريف خاصة بالقضية في المحكمة.'], ['agreeNote', 'الاستشارة نفسها مجانية. المبلغ ده مصاريف المحكمة.'], ['payUs', 'ادفع{ي} للمؤسسة بس، وخد{ي} إيصال دايمًا.'], ['howPay', 'إزاي أدفع؟'], ['voiceFrom', 'رسالة صوتية من المؤسسة'], ['walkIn', 'في المؤسسة'], ['mine', 'دي صفحتك. محدش غيرك يقدر يشوفها.'], ['answerReady', 'ردّنا على مشكلتك جاهز'], ['whatNow', 'تعمل{ي} إيه دلوقتي؟'], ['track', 'طلبك وصل لفين؟'], ['loading', 'بنجهّز صفحتك…'], ['newReq', 'عندك مشكلة جديدة؟ احكيلنا من هنا']]) {
      assert.ok(src.includes(`P('${k}', '${charity}')`), k);
    }
    assert.match(src, /const P = \(k, f\) => \(PC && typeof PC\[k\] === 'string' \? PC\[k\] : f\);/);
    assert.match(src, /document\.querySelector\('\[data-pub-contact\], \.pub-head-contact'\)/, 'the header contact follows data.home.contact');
  });

  test('51. (L11-35) /p/ static closure unchanged: exactly h.js, portal-ui.js, portal.js, words.js, ≤ 30 KB gzip; no paid copy module imported', () => {
    const entry = path.join(PUB, 'assets/js/public/portal.js');
    const files = [entry, ...preloadClosure(entry, PUB).map((u) => path.join(PUB, u.split('?')[0]))];
    assert.deepEqual(files.map((f) => path.basename(f)).sort(), ['h.js', 'portal-ui.js', 'portal.js', 'words.js']);
    assert.ok(files.reduce((n, f) => n + zlib.gzipSync(transformAsset(f)).length, 0) <= 30 * 1024);
    for (const f of ['portal.js', 'portal-login.js', 'intake.js']) assert.ok(!/site-copy-paid|segment\.js/.test(read(`public/assets/js/public/${f}`)), f);
  });

  test('52. (G11-47, P1) /portal follows the cookie side: paid «متابعة طلبكم» + bm-copy PORTAL_LOGIN_PAID; charity «تابعي طلبك» without bm-copy', async () => {
    const p = (await get('/portal', { cookie: 'bm_seg=paid' })).body;
    assert.equal(titleOf(p), `متابعة طلبكم — ${BRAND}`);
    assert.match(p, /<h1 id="page-title" class="bp-login-title">متابعة طلبكم<\/h1>/);
    assert.deepEqual(bmCopyOf(p).data, PORTAL_LOGIN_PAID);
    for (const [k, v] of Object.entries({ h1: 'متابعة طلبكم', sub: 'اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.', send: 'إرسال الكود', code: 'الكود', confirm: 'تأكيد' })) assert.equal(PORTAL_LOGIN_PAID[k], v, k);
    for (const v of Object.values(PORTAL_LOGIN_PAID)) assert.ok(!BANNED.test(v) && !FEM_ALL.test(v), v);
    const c = (await get('/portal')).body;
    assert.match(c, /<h1 id="page-title" class="bp-login-title">تابعي طلبك<\/h1>/);
    assert.equal(bmCopyOf(c), null);
    assert.equal(titleOf(c), `متابعة طلبك — ${BRAND}`);
  });

  test('53. (G11-49, P0) privacy §12: the bm_seg line verbatim, no Google Fonts; the company-lead bullet; (G11-50, P1) terms: the paid section before «تعديل الشروط»', async () => {
    const pv = (await get('/privacy')).body;
    assert.ok(pv.includes('نحفظ اختيارك لنوع الخدمة («خيري» أو «خدمات الأفراد والشركات») في ملف ارتباط ضروري اسمه bm_seg لمدة ستة أشهر، لنفتح لك الصفحة نفسها في زيارتك التالية. لا يحتوي على أي بيانات شخصية، ويمكنك تغييره في أي وقت من زر نوع الخدمة أعلى الصفحة.'));
    assert.ok(pv.includes('يُحمّل الموقع خطوطه العربية من خادمنا نفسه، ولا يتصل بأي خدمة خارجية لعرض الصفحات.'));
    assert.ok(!pv.includes('Google Fonts'));
    assert.ok(pv.includes('تستخدم منصة فريق العمل وبوابة الشركات ملفات ارتباط ضرورية لتسجيل الدخول فقط.'));
    assert.ok(pv.includes('في خدمات الأفراد والشركات قد نطلب أيضًا اسم الشركة والمسمى الوظيفي والبريد الإلكتروني للتواصل بخصوص العرض.'));
    const tm = (await get('/terms')).body;
    const i = tm.indexOf('12. الخدمات بأتعاب للأفراد والشركات');
    assert.ok(i > 0 && i < tm.indexOf('13. تعديل الشروط والتواصل'));
    for (const s of ['تُقدَّم خدمات الأفراد والشركات بأتعاب تُتفق عليها كتابةً قبل بدء أي عمل، وتظهر على صفحة الطلب للموافقة عليها.', 'لا يُطلب أي مبلغ إلا من خلال صفحة الطلب أو باتفاق مكتوب، ولا يبدأ العمل قبل موافقتكم.', 'خدمات الشركات بالاشتراك الشهري تحكمها شروط الباقة والعرض المكتوب المتفق عليه.', 'المساعدة القانونية المجانية («خيري») مخصصة للأرامل والأيتام وأسرهم. قد نتحقق من الاستحقاق، وإن كان الطلب خارج البرنامج المجاني أبلغناكم وعرضنا تقديمه بأتعاب، ولا نبدأ إلا بموافقتكم.']) assert.ok(tm.includes(s), s);
    assert.match(tm, /<li><a href="#paid">الخدمات بأتعاب للأفراد والشركات<\/a><\/li>/);
  });

  test('54. (G11-51/52, P1) /data-deletion and 404 follow the cookie side: paid prefill and paid links; charity text unchanged', async () => {
    const d = (await get('/data-deletion', { cookie: 'bm_seg=paid' })).body;
    assert.ok(d.includes(`https://wa.me/201000000001?text=${encodeURIComponent('مرحبًا، أرغب في حذف بياناتي لديكم. الاسم: ')}`));
    const dc = (await get('/data-deletion')).body;
    assert.ok(dc.includes(encodeURIComponent('السلام عليكم، ده «طلب حذف بياناتي» من عندكم. اسمي: ')));
    const n = await get('/no-such-page-v11', { cookie: 'bm_seg=paid' });
    assert.equal(n.status, 404);
    assert.match(n.body, /<h1 id="page-title">الصفحة غير موجودة<\/h1>/);
    assert.ok(n.body.includes('href="/intake?seg=paid" data-cta="intake">طلب استشارة</a>'));
    assert.ok(n.body.includes('href="/portal">متابعة طلب</a>'));
    assert.ok(!FEMININE.test(visible(n.body.replace(/<footer[\s\S]*?<\/footer>/, ''))));
    const nc = await get('/no-such-page-v11');
    assert.match(nc.body, /<h1 id="page-title">الصفحة دي مش موجودة<\/h1>/);
    assert.ok(nc.body.includes('href="/intake" data-cta="intake">احكيلنا مشكلتك</a>'));
  });

  test('55. (INV-06) paid /intake, /p/<paid> and /portal (paid): no inline executable script; bm-copy is application/json', async () => {
    const paid = await portalPath('paid', '01055550003', 'wportalpaidtest000003');
    for (const [u, headers] of [['/intake?seg=paid', {}], ['/intake?seg=paid&mode=company', {}], [paid, {}], ['/portal', { cookie: 'bm_seg=paid' }]]) {
      const h = (await get(u, headers)).body;
      for (const m of h.matchAll(/<script\b([^>]*)>/g)) assert.ok(/type="module" src=|type="application\/(?:ld\+)?json"|nomodule src=/.test(m[1]), `${u}: ${m[0]}`);
      assert.match(h, /<script type="application\/json" id="bm-copy">/, u);
    }
  });
});

// ───────────────────────── مراجعة gate-public: اختبار لكل خلل وُجد ─────────────────────────
describe('v11 gate-public — review regressions', () => {
  test('56. (G11-02, P1) alias matrix: every alias (upper/lower percent-encoding, with and without the slash) → 301 to a fixed internal path; whitelisted campaign params only; HEAD the same; /?topic= → 302 to the form by the cookie side', async () => {
    const { ALIASES } = await import('../src/site.js');
    const wanted = { '/khayri/': '/khayri', '/services/': '/services', '/charity': '/khayri', '/khairy': '/khayri', '/khayry': '/khayri', '/khairi': '/khayri', '/kheiri': '/khayri', [`/${encodeURIComponent('خيري')}`]: '/khayri', '/khadamat': '/services', '/afrad': '/services', [`/${encodeURIComponent('خدمات')}`]: '/services', '/companies': '/services#companies', '/sharikat': '/services#companies', [`/${encodeURIComponent('شركات')}`]: '/services#companies' };
    assert.deepEqual(ALIASES, wanted);
    for (const [from, to] of Object.entries(ALIASES)) {
      const forms = new Set([from, from.toLowerCase(), from.endsWith('/') ? from : `${from}/`]);
      for (const f of forms) {
        for (const method of ['GET', 'HEAD']) {
          const r = await t.client().request(method, `${f}?utm_source=fb&utm_campaign=v11&evil=1&next=https://x.example`);
          assert.equal(r.status, 301, `${method} ${f}`);
          const [p, hash] = to.split('#');
          assert.equal(r.headers.get('location'), `${p}?utm_source=fb&utm_campaign=v11${hash ? `#${hash}` : ''}`, `${method} ${f}`);
          assert.equal(r.headers.get('cache-control'), 'no-cache');
          assert.equal(r.headers.get('set-cookie'), null);
        }
      }
    }
    const ix = await get('/index.html?utm_source=a&evil=1');
    assert.equal(ix.status, 301);
    assert.equal(ix.headers.get('location'), '/?utm_source=a');
    const tp = await get('/?topic=inh&utm_source=fb&x=1');
    assert.equal(tp.status, 302);
    assert.equal(tp.headers.get('location'), '/intake?topic=inh&utm_source=fb');
    assert.match(tp.headers.get('vary') || '', /Cookie/);
    assert.equal((await get('/?topic=pen', { cookie: 'bm_seg=paid' })).headers.get('location'), '/intake?topic=pen&seg=paid');
    assert.equal((await get('/?topic=pen', { cookie: 'bm_seg=evil' })).headers.get('location'), '/intake?topic=pen');
    for (const u of ['/?topic=evil', '/?topic=%3Cscript%3E', '/?gate=1&topic=inh']) {
      const r = await get(u);
      assert.equal(r.status, 200, u);
      assert.ok(gateOf(r.body), `${u} → the gate`);
    }
  });

  test('57. kill switch off: the pill, the phone-menu «تغيير نوع الخدمة» and the footers never send to /?gate=1 (it would reopen the same «خيري» home); they open the other side', async () => {
    t.app.settings.set('site_gate_enabled', false);
    try {
      for (const [u, cookie, other] of [['/khayri', '', '/services'], ['/', '', '/services'], ['/privacy', 'bm_seg=charity', '/services'], ['/services', '', '/khayri'], ['/privacy', 'bm_seg=paid', '/khayri']]) {
        const h = (await get(u, cookie ? { cookie } : {})).body;
        assert.ok(!h.includes('href="/?gate=1"'), `${u} ${cookie}`);
        assert.match(headerOf(h), new RegExp(`<a class="pub-seg-pill pub-seg-pill--(?:charity|paid)" href="${other}"`), `${u} pill`);
        assert.ok(headerOf(h).includes(`<a class="pub-nav-link pub-nav-gate" href="${other}">تغيير نوع الخدمة</a>`), `${u} menu`);
        assert.ok(footerOf(h).includes(`href="${other}"`), `${u} footer keeps the other side`);
      }
    } finally {
      t.app.settings.set('site_gate_enabled', true);
    }
    const on = (await get('/khayri')).body;
    assert.ok(headerOf(on).includes('href="/?gate=1"') && footerOf(on).includes('href="/?gate=1">اختيار نوع الخدمة</a>'), 'on again → the gate');
  });

  test('58. /services «التزامنا معكم»: trust lines wrap in full; only the topic rows keep the one-line sub (L11-55)', () => {
    const paid = critical('paid');
    assert.match(paid, /\.pub-topic-list \.g-sub\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
    const css = tailCss().replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/nowrap|ellipsis/.test(m[2])) assert.ok(!/(^|,)\s*\.g-sub\s*(,|$)/.test(m[1].trim()) && !/pub-trust/.test(m[1]), `one-line rule on ${m[1].trim()}`);
    }
  });

  test('59. the paid /intake way back to «خيري» cannot hang on a stuck draft store and ignores double taps', () => {
    const src = read('public/assets/js/public/intake.js');
    const cross = src.slice(src.indexOf('function crossRow('), src.indexOf('\nfunction ', src.indexOf('function crossRow(') + 10));
    assert.match(cross, /if \(crossing\) return;\s*crossing = true;/);
    assert.match(cross, /await Promise\.race\(\[move\(\)\.catch\(\(\) => \{\}\), new Promise\(\(r\) => setTimeout\(r, 2000\)\)\]\);\s*window\.location\.href = href;/);
  });
  test('60. (PW-G14) one filled button per viewport on /services: above 1080 px the sticky header keeps the filled «طلب استشارة», so the same action at the page end is tinted; grouped lists keep an edge in forced colours (V11-53); trust rows go two columns on desktop', () => {
    const css = tailCss();
    assert.match(css, /@media \(min-width: 1081px\) \{\s*body\.pub-paid \.pub-final-cta \.pub-btn-primary,\s*body\.pub-paid \.pub-final-cta \.pub-btn-primary:hover \{\s*background: var\(--tint-weak\);\s*color: var\(--tint\);/);
    assert.match(read('public/assets/css/public-site.css'), /@media \(max-width: 1080px\) \{\s*\.pub-nav \{\s*display: none;/, 'the header CTA shows from 1081 px');
    assert.match(read('public/services.html'), /<body class="site pub v91 pub-landing pub-paid"/);
    assert.match(css, /@media \(forced-colors: active\) \{\s*\.pub-topic-list,\s*\.pub-trust-list,\s*body\.pub \.pub-co-row \{\s*outline: 1px solid CanvasText;/);
    assert.match(css, /\.pub-trust-list \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  test('61. landing.js: a malformed hash (/#%E0%A4) never breaks the «خيري» reveal or the listen sequence', () => {
    const src = read('public/assets/js/public/landing.js');
    assert.match(src, /try \{\s*if \(location\.hash\) document\.getElementById\(decodeURIComponent\(location\.hash\.slice\(1\)\)\)\?\.scrollIntoView\(\);\s*\} catch \{/);
    assert.ok(src.indexOf('} catch {') < src.indexOf('if (sayHome && L?.listenOn()) sayHome();'));
  });
});
