// v11 gate-public — شاشة الاختيار، صفحتا «خيري» والأفراد والشركات، الكعكة والتخزين، الرأس والتذييل حسب الجانب (GP-0…GP-4)
// المواصفة: scratchpad/v11-spec.md §9.4 (G11 §15.1 مع تعديلات r2). GP-5…GP-7: النموذج بنصوص كل جانب، طلب عرض الشركات،
// صفحة المتابعة والدخول بنبرة الطلب، والصفحات القانونية (39 وما بعدها).
// v12 entry: intended (E12 §12.2، L12-46، L12-90): لا شاشة اختيار في 12.0، و«خيري» متوقف على الموقع افتراضيًا (charity_public).
// حُذفت اختبارات الشاشة وحدها (1–4، 9، 13–19، 35 بحالة الشاشة، 38، 57، 61) وما يقابلها في v12 مذكور عند موضعها وفي
// scratchpad/v12-progress-entry.md؛ وأعيدت كتابة الباقي لحالتي «خيري» (متوقف / معاد) و/services الجديدة.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestApp } from './helpers.js';
import { sendBody } from '../src/http.js';
import { CRITICAL_RE, SITE_PAGES } from '../src/site.js';
import { preloadClosure, transformAsset, setPublicRoot, stripJsCommentLines as stripJs } from '../src/site-assets.js';
import { PAID_TOPICS, paidWaPrefill, PAID_GENERIC } from '../public/assets/js/public/segment.js';
import { TOPICS } from '../public/assets/js/public/topics.js';
import crypto from 'node:crypto';
import { QUESTIONS } from '../public/assets/js/public/topics.js';
import { genderize } from '../public/assets/js/public/words.js';
import { LINES } from '../public/assets/js/public/entry-tree.js';
// v12 entry: intended (E12-42, E12-71 #9) — INTAKE_CROSS and waFrom are gone (no way back to «خيري», the WhatsApp sentence of a leaf is in bm-path)
import { INTAKE_COPY, INTAKE_MSG, INTAKE_SUCCESS, INTAKE_ABOUT, INTAKE_QUESTIONS, INTAKE_ERR, PORTAL_PAID, PORTAL_LOGIN_PAID } from '../src/site-copy-paid.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
const BRAND = 'Emam Legal and Consultancy';
const CHARITY_TITLE = `الدعم القانوني للأرامل والأيتام وأسرهم — ${BRAND}`;
const PAID_TITLE = `استشارات وقضايا وتأسيس شركات | ${BRAND}`; // v12 entry: intended (E12-13)
const FEMININE = /اكتبي|ابعتي|صوّري|اختاري|سجّلي|اضغطي|قولي|تقدري|حاولي|ارجعي|تابعي/;
const ORDER = TOPICS.map((t) => t.key);
/** v12 entry: ورقة من الشجرة لنموذج الأفراد والشركات (/intake?seg=paid بلا مسار صار 302 «/») */
const PAID_INTAKE = '/intake?path=consultation/family/divorce';

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
const headerOf = (h) => (/<header class="pub-header"[\s\S]*?<\/header>/.exec(h) || [''])[0];
const footerOf = (h) => (/<footer class="pub-footer"[\s\S]*?<\/footer>/.exec(h) || [''])[0];
/** جسم الصفحة بلا الأنماط الحرجة (تذكر أسماء أصناف قديمة) */
const bodyOf = (h) => h.slice(h.indexOf('<body'));
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
/** v12 entry: «خيري» معاد على الموقع أثناء fn (charity_public = true) */
const restored = async (fn) => {
  t.app.settings.set('charity_public', true);
  try {
    return await fn();
  } finally {
    t.app.settings.set('charity_public', false);
  }
};
before(async () => {
  t = await startTestApp({ seed: 'none' });
  setPublicRoot(PUB);
});
after(async () => t && t.close());

// ───────────────────────── 1–12: المسارات والكعكة والتخزين ─────────────────────────

describe('v11 gate-public — routing, cookie and caching (GP-0/GP-1)', () => {
  // v12 entry: intended — 1–4 (شاشة الاختيار على «/») حُذفت: «/» الشجرة؛ ثوابتها (CSP، Vary، private no-cache، بلا Set-Cookie،
  // canonical، HEAD) في test/v12-entry.test.js E12-T10، ومسح الكعكة القديمة E12-T11.

  test('5. /khayri: archived → the KH notice (no cookie); restored → the «خيري» home, self-canonical, charity FAQPage, persistent charity cookie; /services: no cookie, canonical /services', async () => {
    const kh = await get('/khayri');
    assert.equal(kh.status, 200);
    assert.match(kh.body, /class="site pub pub-charity kh-paused"/);
    assert.equal(kh.headers.get('set-cookie'), null);
    await restored(async () => {
      const k = await get('/khayri');
      assert.equal(k.status, 200);
      assert.ok(!k.body.includes('id="gate"'));
      assert.equal(canonicalOf(k.body), `${t.base}/khayri`);
      assert.equal(titleOf(k.body), CHARITY_TITLE);
      assert.equal(k.headers.get('set-cookie'), 'bm_seg=charity; Path=/; Max-Age=15552000; SameSite=Lax');
      assert.ok(ldOf(k.body).some((n) => n['@type'] === 'FAQPage' && n.mainEntity.length === 5));
    });
    const s = await get('/services');
    assert.equal(s.status, 200);
    assert.equal(s.headers.get('set-cookie'), null, 'v12 entry: intended (E12-12) — /services writes no cookie');
    assert.equal(canonicalOf(s.body), `${t.base}/services`);
    assert.equal(titleOf(s.body), PAID_TITLE);
  });

  test('6. (restored) no cookie is ever written for HEAD, prefetch/prerender, link previews (X-Purpose: preview) or X-Moz: prefetch', async () => {
    await restored(async () => {
      for (const p of ['/khayri', '/intake?seg=charity']) {
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
  });

  test('7. (restored) on https (TRUST_PROXY=1 + X-Forwarded-Proto: https) the cookie carries Secure', async () => {
    const prev = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    try {
      await restored(async () => {
        const r = await get('/khayri', { 'x-forwarded-proto': 'https' });
        assert.equal(r.headers.get('set-cookie'), 'bm_seg=charity; Path=/; Max-Age=15552000; SameSite=Lax; Secure');
        const plain = await get('/khayri');
        assert.ok(!/Secure/.test(plain.headers.get('set-cookie')));
      });
    } finally {
      if (prev === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = prev;
    }
  });

  test('8. invalid cookie values are never reflected (archived: cleared on «/»); restored: they behave as no cookie and the first bm_seg decides (r2 S25)', async () => {
    for (const cookie of ['bm_seg=PAID', 'bm_seg=x', 'bm_seg=<script>alert(1)</script>', 'bm_seg=khayri', 'bm_seg=']) {
      const r = await get('/', { cookie });
      assert.equal(r.status, 200, cookie);
      assert.equal(r.headers.get('set-cookie'), 'bm_seg=; Path=/; Max-Age=0; SameSite=Lax', `${cookie}: cleared (E12-12)`);
      assert.ok(!r.body.includes('<script>alert') && !r.body.includes('PAID') && !r.body.includes('bm_seg'), cookie);
    }
    assert.equal((await get('/', { cookie: 'xbm_seg=charity' })).headers.get('set-cookie'), null);
    await restored(async () => {
      for (const cookie of ['bm_seg=PAID', 'bm_seg=x', 'bm_seg=khayri']) assert.match((await get('/privacy', { cookie })).body, /data-side="charity"/, cookie);
      assert.match((await get('/privacy', { cookie: 'bm_seg=charity; other=1; bm_seg=paid' })).body, /data-side="charity"/);
      assert.match((await get('/privacy', { cookie: 'bm_seg=paid; bm_seg=charity' })).body, /data-side="paid"/);
    });
  });

  // v12 entry: intended — 9 (مفتاح إيقاف الشاشة) حُذف: site_gate_enabled متقاعد ولا أثر له (test/v12-entry.test.js E12-T35).

  test('10. /intake: archived → seg=charity shows the KH notice (no cookie) unless via=p, seg=paid → 302 «/»; restored → a charity seg that differs from the cookie writes a session-only cookie (r2 S25)', async () => {
    const kh = await get('/intake?seg=charity');
    assert.equal(kh.status, 200);
    assert.match(kh.body, /kh-paused/);
    assert.equal(kh.headers.get('set-cookie'), null);
    const vp = await get('/intake?seg=charity&via=p', { cookie: 'bm_seg=paid' });
    assert.match(vp.body, /data-side="charity"/);
    assert.equal(vp.headers.get('set-cookie'), null, 'archived: never written');
    const paid = await get('/intake?seg=paid');
    assert.equal(paid.status, 302);
    assert.equal(paid.headers.get('location'), '/');
    const leaf = await get(PAID_INTAKE, { cookie: 'bm_seg=charity' });
    assert.match(leaf.body, /data-side="paid"/);
    assert.equal(leaf.headers.get('set-cookie'), null);
    assert.equal(canonicalOf(leaf.body), `${t.base}${PAID_INTAKE}`);
    // bm-public carries the side (§5.7)
    assert.equal(JSON.parse(/<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(leaf.body)[1]).segment, 'paid');
    await restored(async () => {
      const back = await get('/intake?seg=charity', { cookie: 'bm_seg=paid' });
      assert.equal(back.headers.get('set-cookie'), 'bm_seg=charity; Path=/; SameSite=Lax');
      assert.match(back.body, /data-side="charity"/);
      const same = await get('/intake?seg=charity', { cookie: 'bm_seg=charity' });
      assert.equal(same.headers.get('set-cookie'), null, 'same side keeps the persistent cookie');
      assert.equal(canonicalOf(same.body), `${t.base}/intake?seg=charity`);
    });
  });

  test('11. (L11-51, r2 S11) every renderPage page sends Vary: Accept-Encoding, Cookie and private, no-cache — GET and HEAD; /p/ stays no-store; 404 no-store + Vary; short uncompressed bodies too', async () => {
    const pages = ['/', '/start/consultation', '/khayri', '/services', PAID_INTAKE, '/privacy', '/terms', '/data-deletion', '/portal'];
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
    await restored(async () => {
      const r = await fetch(`${t.base}/about`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('vary'), 'Accept-Encoding, Cookie');
    });
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

  test('12. sitemap: archived = /, /services and the legal pages (E12-13); restored adds /khayri and /about; robots unchanged; the service worker scope stays /app; raster logo crops are never precached', async () => {
    assert.deepEqual(SITE_PAGES.slice(0, 3).map((p) => p.path), ['/', '/khayri', '/services']);
    const sm = Buffer.from((await get('/sitemap.xml')).body).toString('utf8');
    for (const p of ['/', '/services', '/privacy']) assert.ok(sm.includes(`<loc>${t.base}${p}</loc>`), p);
    for (const p of ['/khayri', '/about', '/intake']) assert.ok(!sm.includes(`<loc>${t.base}${p}</loc>`), p);
    await restored(async () => {
      const sm2 = (await get('/sitemap.xml')).body;
      for (const p of ['/khayri', '/about']) assert.ok(sm2.includes(`<loc>${t.base}${p}</loc>`), p);
      assert.ok(!sm2.includes(`<loc>${t.base}/intake</loc>`));
    });
    const robots = (await get('/robots.txt')).body;
    assert.ok(!/Disallow: \/(?:khayri|services|start)/.test(robots));
    assert.match(read('public/assets/js/lib/pwa.js'), /scope: '\/app'/);
    assert.ok(read('src/site.js').includes('/^\\/assets\\/img\\/emam-(?:full|mark)-.*\\.(?:png|webp)$/'), 'PRECACHE_SKIP (L11-58)');
    const sw = (await get('/sw.js')).body;
    assert.ok(!/emam-(?:full|mark)-[^"]*\.(?:png|webp)/.test(sw));
  });

  // v12 entry: intended — 13 (معاملات الحملة على بطاقتي الشاشة) حُذف: نفس القاعدة على كل رابط في الشجرة (E12-T15).
});

// ───────────────────────── 13–22: محتوى الشاشة وإمكانية الوصول ─────────────────────────

// v12 entry: intended — 14–20 (نصوص الشاشة وصورها وأنماطها) حُذفت مع الشاشة؛ بقي من 20 شرط «الرموز فقط» في ذيل CSS.
describe('v11 gate-public — CSS tail (GP-1)', () => {
  test('20. the gate-public CSS tail uses tokens only (no hex or rgb literal)', () => {
    const tail = tailCss().replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(tail), 'no hex literal');
    assert.ok(!/rgba?\(\s*\d/.test(tail), 'no rgb literal');
  });
});

// ───────────────────────── 23–28: الرأس والتذييل حسب الجانب ─────────────────────────

describe('v11 gate-public — header and footer per side (GP-2)', () => {
  test('21. (restored) charity header: the green mark image → /khayri, no pill and no «تغيير نوع الخدمة» (E12-71 #6), CTA /intake?seg=charity; bare fragments on the home, /khayri#… elsewhere', async () => {
    await restored(async () => {
      const hd = headerOf((await get('/khayri')).body);
      // v12 entry review: intended (R2, §5.9 / T12-22): charity chrome carries no H- codes
      assert.match(hd, /<a class="pub-brand" href="\/khayri" aria-label="Emam Legal and Consultancy — الصفحة الرئيسية">\s*<img class="pub-mark" src="\/assets\/img\/emam-mark-green\.svg\?v=[^"]+" width="99" height="19" alt="" decoding="async" \/>\s*<bdi class="pub-wordmark"/);
      assert.ok(!/pub-seg-pill|pub-nav-gate|تغيير نوع الخدمة/.test(hd));
      assert.match(hd, /<a class="pub-btn pub-btn-gold pub-nav-cta" href="\/intake\?seg=charity" data-cta="intake">[\s\S]*?<span>احكيلنا مشكلتك<\/span><\/a>/);
      assert.ok(!/data-tag="H-\d+"/.test(hd), 'no H- codes on the charity header');
      assert.match(hd, /<a class="pub-nav-link" href="#faq">أسئلة<\/a>/, 'bare fragments on the side home');
      assert.match(headerOf((await get('/privacy')).body), /<a class="pub-nav-link" href="\/khayri#faq">أسئلة<\/a>/, 'elsewhere /khayri#…');
    });
  });

  test('22. (E12-71 #6) no service-type pill and no «تغيير نوع الخدمة» anywhere, archived or restored', async () => {
    const pages = ['/', '/services', '/privacy', '/terms', '/data-deletion', '/portal', PAID_INTAKE, '/p/abcdefghijklmnopqrstuvwxyz012345', '/no-such-v11'];
    for (const p of pages) assert.ok(!/pub-seg-pill|pub-nav-gate|\?gate=1/.test(bodyOf((await get(p)).body)), p);
    await restored(async () => {
      for (const p of ['/khayri', '/about', '/privacy', '/intake?seg=charity', '/no-such-v11']) assert.ok(!/pub-seg-pill|pub-nav-gate|\?gate=1|اختيار نوع الخدمة/.test(bodyOf((await get(p)).body)), p);
    });
  });

  test('23. paid header on /services (L12-11): brand → «/», nav الخدمات · كيف نعمل · للشركات · أسئلة · متابعة طلب, CTA «ابدأوا طلبكم» → «/», the word «القائمة»; contact = main digits + PAID_GENERIC', async () => {
    const h = (await get('/services')).body;
    const hd = headerOf(h);
    assert.match(hd, /<a class="pub-brand" href="\/" aria-label="Emam Legal and Consultancy: الصفحة الأولى" data-tag="H-01">/);
    assert.ok(!hd.includes('pub-seg-pill'));
    const nav = [...hd.matchAll(/<a class="pub-nav-link" href="([^"]+)" data-tag="H-0\d">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(nav, [['#services', 'الخدمات'], ['#how', 'كيف نعمل'], ['#companies', 'للشركات'], ['#faq', 'أسئلة']]);
    assert.match(hd, /<span>متابعة طلب<\/span>/);
    assert.match(hd, /<a class="pub-btn pub-btn-gold pub-nav-cta" href="\/" data-cta="intake" data-tag="H-07"><span>ابدأوا طلبكم<\/span><\/a>/);
    assert.match(hd, /<button class="pub-menu-toggle pub-menu-toggle--word"[^>]*data-tag="H-09"><span class="pub-menu-word">القائمة<\/span><\/button>/);
    const wa = decode(/<a class="pub-head-contact pub-head-contact--wa" href="([^"]+)"/.exec(hd)[1]);
    assert.equal(wa, `https://wa.me/201000000001?text=${encodeURIComponent(PAID_GENERIC)}`);
    assert.ok(!FEMININE.test(visible(hd)));
    assert.match(headerOf((await get('/privacy')).body), /<a class="pub-nav-link" href="\/services#faq" data-tag="H-05">أسئلة<\/a>/);
    t.app.settings.set('b2b_enabled', false);
    try {
      assert.ok(!headerOf((await get('/services')).body).includes('#companies'));
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
  });

  test('24. archived: legal pages and 404 are paid whatever the cookie (E12-71 #10); restored: they follow the cookie (charity without one), /about is charity; /p/ is never the cookie side', async () => {
    for (const cookie of ['', 'bm_seg=charity']) {
      assert.match((await get('/privacy', cookie ? { cookie } : {})).body, /data-side="paid"/, cookie);
      const nf = await fetch(`${t.base}/no-such-v11`, { headers: cookie ? { cookie } : {} }).then((r) => r.text());
      assert.match(nf, /data-side="paid"/, cookie);
    }
    assert.equal((await get('/about')).status, 302);
    await restored(async () => {
      assert.match((await get('/privacy', { cookie: 'bm_seg=paid' })).body, /data-side="paid"/);
      assert.match((await get('/privacy')).body, /data-side="charity"/);
      assert.match((await get('/about', { cookie: 'bm_seg=paid' })).body, /data-side="charity"/);
      const nf = await fetch(`${t.base}/no-such-v11`, { headers: { cookie: 'bm_seg=paid' } }).then((r) => r.text());
      assert.match(nf, /data-side="paid"/);
    });
  });

  test('25. footers: charity (restored) logo, «خدمات الأفراد والشركات», registration, no «اختيار نوع الخدمة»; paid (E12-66): «الصفحة الأولى · عن المكتب · متابعة طلب · للشركات», «خيري» only when restored, © = the firm in <bdi>, no registration or programme name', async () => {
    const reg = t.app.settings.get('org_registration');
    await restored(async () => {
      const fc = footerOf((await get('/khayri')).body);
      assert.match(fc, /<img class="pub-footer-logo" src="\/assets\/img\/emam-logo-gold\.svg\?v=[^"]+" width="200" height="84" alt="" loading="lazy" decoding="async" \/>/);
      for (const [href, label] of [['/services', 'خدمات الأفراد والشركات'], ['/intake?seg=charity', 'احكيلنا مشكلتك'], ['/privacy?side=charity', 'سياسة الخصوصية']]) assert.ok(fc.includes(`href="${href}"`) && fc.includes(label), href);
      assert.ok(!fc.includes('اختيار نوع الخدمة') && !fc.includes('?gate=1'));
      assert.ok(reg && fc.includes(reg), 'charity footer keeps the registration');
      assert.match(footerOf((await get('/services')).body), /<a href="\/khayri" data-tag="F-16">خيري<\/a>/);
    });
    const fp = footerOf((await get('/services')).body);
    assert.ok(fp.includes('pub-footer-logo'));
    for (const href of ['/', '/services', '/portal', '/services#companies', '/company', '/privacy', '/terms', '/data-deletion']) assert.ok(fp.includes(`href="${href}"`), href);
    assert.ok(!fp.includes('href="/khayri"') && !fp.includes('?gate=1') && !fp.includes('/intake?seg=paid'), 'archived: no «خيري», no gate, no old CTA');
    assert.ok(fp.includes('محاماة واستشارات قانونية للأفراد والشركات.'));
    assert.ok(!fp.includes(reg), 'no NGO registration on the paid footer');
    assert.ok(!fp.includes('pub-brand-desc') && !fp.includes(t.app.site.publicSettings().program_name), 'no programme name');
    assert.match(fp, /© \d{4} <bdi>Emam Legal and Consultancy<\/bdi>\. جميع الحقوق محفوظة\./, 'v12 entry: intended (L12-12) — © names the firm, not the foundation');
    assert.ok(fp.includes('للتواصل:'));
  });

  test('26. (L11-52, restored) every intake link on the charity home carries seg=charity; body[data-side] on every public page', async () => {
    await restored(async () => {
      const h = (await get('/khayri')).body;
      const intake = [...h.matchAll(/href="(\/intake[^"]*)"/g)].map((m) => decode(m[1]));
      assert.ok(intake.length >= 20, intake.length);
      for (const href of intake) assert.equal(new URL(href, 'http://x').searchParams.get('seg'), 'charity', href);
      for (const p of ['/khayri', '/about', '/intake?seg=charity']) assert.match((await get(p)).body, /<body [^>]*data-side="charity"/, p);
    });
    for (const p of ['/', '/start/litigation', '/services', PAID_INTAKE, '/privacy', '/terms', '/data-deletion', '/portal', '/p/abcdefghijklmnopqrstuvwxyz012345']) {
      assert.match((await get(p)).body, /<body [^>]*data-side="(?:charity|paid)"/, p);
    }
  });
});

// ───────────────────────── 29–35: صفحة الأفراد والشركات ─────────────────────────

describe('v11 gate-public — /services (GP-3, v12 E12-60…66)', () => {
  let h;
  before(async () => {
    h = (await get('/services')).body;
  });

  test('27. (E12-62) order: H1 «كيف نساعدكم؟» › the fee sub-line › three line rows › ways › hours; no #pub-cross, no «للشركات» row, no hero lockup, no listen button', () => {
    const main = h.slice(h.indexOf('<main'), h.indexOf('</main>'));
    assert.match(main, /<h1 id="start-title" data-tag="S-10">كيف نساعدكم؟<\/h1>\s*<p class="pub-paid-sub" data-tag="S-11">اختاروا ما تحتاجونه\. نتفق معكم على الأتعاب كتابةً قبل أن نبدأ\.<\/p>/);
    assert.ok(main.indexOf('class="svc-list"') < main.indexOf('class="pub-paid-ways"') && main.indexOf('class="pub-paid-ways"') < main.indexOf('مواعيد العمل'));
    assert.ok(!/pub-cross|pub-co-row|pub-topic-list|emam-logo-gold|pub-listen/.test(main));
    assert.match(main, /<section id="services"[^>]*>\s*<span id="topics"><\/span>/, 'old #topics links still land');
  });

  test('28. (E12-62, L12-82) three line rows (S-12…S-14) from LINES to /start/<line> with their one-line descriptions', () => {
    const rows = [...h.matchAll(/<li><a class="svc" href="([^"]+)" data-tag="(S-1\d)"><span class="svc__t">([^<]+)<\/span><span class="svc__d">([^<]+)<\/span>/g)];
    assert.deepEqual(rows.map((m) => [m[1], m[2], m[3]]), [
      ['/start/consultation', 'S-12', LINES.consultation.label],
      ['/start/litigation', 'S-13', LINES.litigation.label],
      ['/start/company', 'S-14', LINES.company.label],
    ]);
    assert.deepEqual(rows.map((m) => m[4]), ['في الأسرة والميراث، والعقارات والإيجار، والعمل، والعقود، والمعاشات.', 'نرفع الدعوى أو نرد عليها، ونتابع القضية حتى الحكم وتنفيذه.', 'تأسيس الشركات وتعديلها، والعقود والتراخيص، ومستشار قانوني للشركة.']);
  });

  test('29. (INV-12, E12-71 #8) no «مجان|ببلاش|خيري», «المؤسسة» never, no feminine imperatives', () => {
    const text = visible(h);
    assert.ok(!/مجان|ببلاش|خيري/.test(text), text.match(/.{40}(?:مجان|ببلاش|خيري).{40}/)?.[0]);
    assert.ok(!text.includes('المؤسسة'));
    assert.ok(!FEMININE.test(text), text.match(new RegExp(`.{30}(?:${FEMININE.source}).{30}`))?.[0]);
  });

  test('30. (E12-13, E12-65) JSON-LD: paid LegalService (#paid-services, knowsAbout E12-13), WebPage and the 5 visible FAQ questions; no NGO node', () => {
    const ld = ldOf(h);
    assert.deepEqual(ld.map((n) => n['@type']), ['LegalService', 'WebPage', 'FAQPage']);
    assert.equal(ld[0]['@id'], `${t.base}/services#paid-services`);
    assert.ok(ld[0].knowsAbout.includes('الأحوال الشخصية') && ld[0].knowsAbout.includes('مستشار قانوني للشركات'));
    assert.equal(ld[2].mainEntity.length, 5);
    assert.ok(!/مجان|ببلاش|المؤسسة/.test(JSON.stringify(ld)));
    assert.deepEqual(ld[2].mainEntity.map((q) => q.name), ['كم أتعاب الاستشارة؟', 'من يطّلع على بياناتي؟', 'متى يصلني الرد؟', 'هل تعملون مع الشركات؟', 'فقدت رابط صفحة طلبي، ماذا أفعل؟']);
    for (const q of ld[2].mainEntity) assert.ok(h.includes(`<span>${q.name}</span>`), q.name);
  });

  test('31. (E12-64) companies band iff b2b_enabled: «مستشار قانوني لشركتكم», primary /intake?path=company/counsel/proposal&entry=company_band, «دخول بوابة الشركات» iff the portal is open, «تأسيس شركة جديدة»; FAQ 4 follows the switch', async () => {
    assert.match(h, /<section id="companies"[\s\S]*?<h2 id="companies-title" class="pub-band-title" data-tag="S-30">مستشار قانوني لشركتكم<\/h2>/);
    assert.ok(!/pub-band-eyebrow/.test(h), 'no eyebrow');
    assert.match(h, /<a class="pub-btn pub-btn-band-gold" href="\/intake\?path=company\/counsel\/proposal&amp;entry=company_band" data-cta="intake" data-tag="S-34">اطلبوا عرضًا<\/a>/);
    assert.match(h, /<a class="pub-btn pub-btn-on-dark" href="\/company" data-tag="S-35">دخول بوابة الشركات<\/a>/);
    assert.match(h, /<a href="\/start\/company\/new" data-tag="S-36">تأسيس شركة جديدة<\/a>/);
    t.app.settings.set('b2b_enabled', false);
    try {
      const off = (await get('/services')).body;
      assert.ok(!off.includes('id="companies"') && !off.includes('href="/company"'));
      assert.ok(off.includes('هل يمكن أن تتصلوا بي؟'));
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
  });

  test('32. paid WhatsApp follows app.segments.publicDigits: default = main digits + PAID_GENERIC (company band: the company sentence); wa_paid_on_main=false → no wa.me on /services while the restored charity home keeps the main number + SITE_GREETING', async () => {
    const waHrefs = (html) => [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decode(m[1]));
    const on = waHrefs(h);
    assert.ok(on.length >= 3);
    for (const u of on) assert.ok(u.startsWith('https://wa.me/201000000001?text='), u);
    assert.ok(on.some((u) => u.endsWith(encodeURIComponent(PAID_GENERIC))));
    assert.ok(on.some((u) => u.includes(encodeURIComponent('مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.'))), 'company sentence in the band');
    t.app.settings.set('wa_paid_on_main', false);
    try {
      const off = (await get('/services')).body;
      assert.equal(waHrefs(off).length, 0);
      await restored(async () => {
        const ch = waHrefs((await get('/khayri')).body);
        assert.ok(ch.length && ch.every((u) => u.startsWith('https://wa.me/201000000001?text=')));
        assert.ok(ch.some((u) => u.endsWith(encodeURIComponent('السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.'))));
      });
    } finally {
      t.app.settings.set('wa_paid_on_main', true);
    }
  });

  test('33. ways «نتصل بكم» (/intake?mode=callback&entry=home_callback) · «واتساب» · «متابعة طلب»; hours line; «كيف نعمل؟» step 3 mentions WhatsApp only with paid digits; written-fee wording (E12-63)', () => {
    assert.match(h, /<p class="pub-paid-ways" data-tag="S-15"><a href="\/intake\?mode=callback&amp;entry=home_callback" data-cta="intake">نتصل بكم<\/a>/);
    assert.match(h, /<a href="\/portal" data-follow>متابعة طلب<\/a><\/p>/);
    assert.match(h, /مواعيد العمل: /);
    assert.match(h, /يتولى الموضوع محامٍ متخصص، وتتابعون كل خطوة من صفحة طلبكم وعلى واتساب\./);
    assert.match(h, /يراجع محامٍ الموضوع، ونرسل لكم الأتعاب مكتوبة\. لا نبدأ قبل موافقتكم\./);
  });

  test('34. /services first <style> ≤ 12,288 B, ≤ 16 KB br; the paid critical block is inlined', async () => {
    const paid = critical('paid');
    assert.ok(paid.length > 0);
    assert.ok(Buffer.byteLength(firstStyle(h)) <= 12288, `style ${Buffer.byteLength(firstStyle(h))}`);
    assert.ok(firstStyle(h).includes(paid.slice(0, 40)) && !firstStyle(h).includes('.gate-choices{'));
    assert.ok(br(Buffer.from(h)) <= 16384, `br ${br(Buffer.from(h))}`);
  });
});

// ───────────────────────── 36–40: الميزانيات وCSP وlanding.js ─────────────────────────

describe('v11 gate-public — budgets, CSP and landing.js (GP-1/GP-4)', () => {
  test('35. (INV-09) «/», a tree page and the restored /khayri: ≤ 14,336 B br, ≤ 71,680 B raw, first <style> ≤ 12,288 B', async () => {
    const pages = [['/', false], ['/start/consultation', false], ['/khayri', true]];
    for (const [p, on] of pages) {
      const html = on ? await restored(async () => (await get(p)).body) : (await get(p)).body;
      assert.ok(Buffer.byteLength(html) <= 71680, `${p} raw ${Buffer.byteLength(html)}`);
      assert.ok(br(Buffer.from(html)) <= 14336, `${p} br ${br(Buffer.from(html))}`);
      assert.ok(Buffer.byteLength(firstStyle(html)) <= 12288, `${p} style ${Buffer.byteLength(firstStyle(html))}`);
    }
  });

  test('36. (INV-06) no inline executable script on /, /start/…, /services and the KH notice; JSON blocks only; CSP script-src self', async () => {
    for (const p of ['/', '/start/litigation/defend', '/khayri', '/services']) {
      const r = await get(p);
      const inline = [...r.body.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/type="application\/(?:ld\+)?json"/.test(m[1]));
      assert.equal(inline.length, 0, p);
      assert.ok(!/\son[a-z]+="/i.test(r.body), `${p} inline handler`);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    }
  });

  test('37. landing closure ≤ 4,096 B br, listen.js stays lazy; /services loads the same landing module', async () => {
    const served = (url) => br(transformAsset(path.join(PUB, url.split('?')[0])));
    const closure = ['/assets/js/public/landing.js', ...preloadClosure(path.join(PUB, 'assets/js/public/landing.js'), PUB)];
    assert.ok(!closure.some((u) => /listen\.js|intake\.js|ui\.js|segment\.js/.test(u)), closure.join(' '));
    const size = closure.reduce((s, u) => s + served(u), 0);
    assert.ok(size <= 4096, `landing ${size}`);
    assert.match((await get('/services')).body, /<script type="module" src="\/assets\/js\/public\/landing\.js\?v=/);
  });

  test('38. landing.js (v12): no gate logic left; pageshow re-syncs the cookie only where the server writes it (data-seg-sync); listen.js stays a dynamic import', () => {
    const src = read('public/assets/js/public/landing.js');
    assert.ok(!/initGate|getElementById\('gate'\)|gate-card|has-gate/.test(src));
    assert.match(src, /const syncSide = \(\) => body\.dataset\.segSync === '1' && setSide\(body\.dataset\.side\);/);
    assert.match(src, /addEventListener\('pageshow', \(\) => document\.prerendering \|\| syncSide\(\)\);/);
    assert.match(src, /document\.addEventListener\('prerenderingchange', syncSide\);/);
    assert.match(src, /bm_seg=\$\{side\}; Path=\/; Max-Age=15552000; SameSite=Lax\$\{location\.protocol === 'https:' \? '; Secure' : ''\}/);
    assert.match(src, /import\('\.\/listen\.js'\)/);
    assert.ok(!/^import[^\n]*listen\.js/m.test(src));
    assert.match(src, /a\[data-follow\]/, 'saved follow-up page on paid pages (E12-25)');
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
  test('39. (INV-10, G11 test 26) charity /intake (v12 entry: intended — «خيري» restored, or via=p while archived): no bm-copy, bm-public.segment charity, the 10.0 <main> subtree byte for byte apart from seg=charity and the icon stroke', async () => {
    const vp = await get('/intake?seg=charity&via=p');
    assert.equal(bmCopyOf(vp.body), null);
    assert.match(vp.body, /data-side="charity"/);
    const r = await restored(() => get('/intake?seg=charity'));
    const h = r.body;
    assert.equal(bmCopyOf(h), null);
    assert.equal(JSON.parse(/<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(h)[1]).segment, 'charity');
    assert.equal(titleOf(h), `احكيلنا مشكلتك — ${BRAND}`);
    const main = /<main[\s\S]*?<\/main>/.exec(h)[0].replace(/ stroke-width="[\d.]+"/g, '').replace(/seg=charity&(?:amp;)?/g, '').replace(/\?seg=charity"/g, '"');
    // sha256 of the same normalisation of GET /intake on the 10.0 tree (6caa6d7, test helpers, seed none)
    assert.equal(crypto.createHash('sha256').update(main).digest('hex'), 'f08eadf8ae629749291d151f3d0e25a0a3c99d7fb9ce6af30bc942de8c66ba31');
    assert.ok(Buffer.byteLength(h) <= 31002 + 4096, 'charity /intake HTML stays close to 10.0 (chrome only)');
  });

  test('40. paid /intake (v12 entry: intended — a tree leaf, E12-10): bm-copy (application/json, escaped) holds every G11-39 table + textFirst and ERR, no CROSS (E12-71 #9); ≤ 12,288 B raw and ≤ 4,096 B br (deviation from 6,144: G11-39 verbatim + r2 S16); paid title, description, canonical, no cookie, paid LegalService without NGO', async () => {
    const r = await get('/intake?path=consultation/family/inheritance');
    const h = r.body;
    const bm = bmCopyOf(h);
    assert.ok(bm, 'bm-copy present');
    assert.ok(!bm.raw.includes('<') && !bm.raw.includes('>'), 'jsonForScript escaping');
    assert.ok(Buffer.byteLength(bm.raw) <= 12288, `raw ${Buffer.byteLength(bm.raw)}`);
    assert.ok(br(Buffer.from(bm.raw)) <= 4096, `br ${br(Buffer.from(bm.raw))}`);
    const x = bm.data;
    // v12 entry: intended (E12-33/E12-42, L12-22, E12-71 #9) — the leaf's questions and WhatsApp sentence travel in bm-path, so
    // QUESTIONS, UNKNOWN, TOPICS, WA and ABOUT («سؤال أخير», gone from the paid success) leave bm-copy; PH/DOCS/LINES/GEN join it;
    // web voice is archived by default, so the recording words are not sent and the «too short» line is text-only
    assert.deepEqual(Object.keys(x).sort(), ['CALLBACK_WHEN', 'COPY', 'DOCS', 'ERR', 'GEN', 'LINES', 'MSG', 'PH', 'SUCCESS', 'company', 'textFirst'].sort());
    assert.ok(!('CROSS' in x), 'v12 entry: intended (E12-71 #9) — no way to «خيري» on the paid form');
    assert.equal(x.textFirst, true);
    const VOICE_KEYS = ['storySubMic', 'micHint', 'writeInstead', 'moreVoice', 'inAppWa', 'inAppOr', 'orVoice', 'v1', 'v2', 'vn', 'vText'];
    assert.deepEqual(x.COPY, { ...Object.fromEntries(Object.entries(INTAKE_COPY).filter(([k]) => !VOICE_KEYS.includes(k))), draftLost: 'الصور تحتاج إلى إعادة.' });
    assert.deepEqual(x.MSG, { ...INTAKE_MSG, problem: 'اكتبوا الموضوع في جملة أو اثنتين.' });
    assert.deepEqual(x.SUCCESS, INTAKE_SUCCESS);
    assert.deepEqual(x.CALLBACK_WHEN, { morning: 'صباحًا', noon: 'ظهرًا', any: 'أي وقت' });
    assert.deepEqual(x.LINES, Object.entries(LINES).map(([id, l]) => [id, l.label]));
    assert.equal(x.GEN, PAID_GENERIC);
    // G11-39 COPY verbatim (a sample of every group) and MSG
    assert.equal(x.COPY.topicH1, 'كيف نساعدكم؟');
    assert.equal(x.COPY.storySubText, 'اكتبوا الموضوع بكلماتكم في جملة أو اثنتين. اذكروا كل ما يهمكم، ولو كان أكثر من موضوع.');
    assert.equal(x.COPY.callbackBtn, 'تفضّلون أن نتصل بكم؟', 'v12 entry: intended (E12-34, I-33)');
    assert.equal(x.COPY.consent, 'بالضغط على «إرسال الطلب» توافقون على استخدام كلامكم ورقمكم للتواصل معكم بخصوص طلبكم فقط.');
    assert.equal(x.MSG.phoneBad, 'الرقم غير صحيح. اكتبوه هكذا: 01012345678');
    assert.equal(x.SUCCESS.reassure, 'لن نبدأ أي عمل ولن نطلب أي أتعاب قبل موافقتكم.');
    assert.equal(x.SUCCESS.aText, 'أرسلوا رقم الطلب برسالة واحدة على واتساب، وسنرسل لكم كل جديد هناك.');
    assert.equal(fill(x.SUCCESS.s3, { w: x.SUCCESS.s3wa }), 'يصلكم الرد على صفحة طلبكم، وعلى واتساب إن أرسلتم لنا رقم الطلب.');
    assert.equal(titleOf(h), `الميراث | ${BRAND}`, 'v12 entry: intended (E12-13) — the leaf label');
    // v12 entry: intended (L12-22) — no recording in the description while web voice is archived
    assert.match(h, /<meta name="description" content="اكتبوا موضوعكم القانوني باختصار، وأرفقوا صور المستندات\. نتفق معكم على الأتعاب قبل أي عمل، وبياناتكم سرية\." \/>/);
    assert.equal(canonicalOf(h), `${t.base}/intake?path=consultation/family/inheritance`);
    assert.match(h, /<meta name="robots" content="noindex, follow" \/>/);
    assert.equal(r.headers.get('set-cookie'), null, 'v12 entry: intended (E12-12) — no cookie');
    const types = ldOf(h).map((n) => n['@type']);
    assert.ok(types.includes('LegalService') && !types.includes('NGO') && !types.includes('FAQPage'), types.join());
    assert.match(h, /<body class="site pub v91 bmf-page" data-side="paid">/);
    const company = await get('/intake?path=company/counsel/proposal');
    assert.equal(titleOf(company.body), `طلب عرض لخدمات الشركات | ${BRAND}`);
    assert.ok(bmCopyOf(company.body).data.company.css.startsWith('/assets/css/v11-lead.css?v='));
  });

  test('41. (r2 P16) paid QUESTIONS cover every topics.js question with the same answer count and the r2 wording', () => {
    assert.deepEqual(Object.keys(INTAKE_QUESTIONS).sort(), Object.keys(QUESTIONS).sort());
    for (const id of Object.keys(QUESTIONS)) assert.equal(INTAKE_QUESTIONS[id].a.length, QUESTIONS[id].answers.length, id);
    assert.equal(INTAKE_QUESTIONS['inh.deceased'].a[0], 'الزوج أو الزوجة');
    assert.equal(INTAKE_QUESTIONS['pen.whose'].a[0], 'معاش الزوج أو الزوجة');
    assert.equal(INTAKE_QUESTIONS['alimony.father'].h1, 'النفقة: ما الوضع الآن؟', 'v12 entry: intended (E12-41) — neutral wording');
    assert.equal(INTAKE_QUESTIONS['inh.certificate'].sub, 'حكم من المحكمة يحدد الورثة');
  });

  test('42. (INV-12) no paid text says «مجان|ببلاش|المؤسسة» or speaks feminine — except the .pub-cross row; paid /intake visible HTML is clean', async () => {
    const all = { ...INTAKE_COPY, ...INTAKE_MSG, ...INTAKE_SUCCESS, ...INTAKE_ABOUT, ...INTAKE_ERR };
    for (const [k, v] of Object.entries(all)) {
      assert.ok(!BANNED.test(v), `${k}: ${v}`);
      assert.ok(!FEM_ALL.test(v), `${k}: ${v}`);
    }
    for (const q of Object.values(INTAKE_QUESTIONS)) for (const v of [q.h1, q.sub || '', ...q.a]) assert.ok(!BANNED.test(v) && !FEM_ALL.test(v), v);
    // v12 entry: intended (E12-71 #9) — INTAKE_CROSS (the one «مجاني» exception) is deleted with the way back to «خيري»
    const h = (await get(PAID_INTAKE)).body;
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

  test('45. (L11-37) paid story screen is text-first (v12 entry: intended — the .pub-cross part deleted with CROSS, E12-71 #9; covered by test/v12-entry.test.js EN-3)', () => {
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /let micOn = !X\?\.textFirst \|\| voices\(\)\.length > 0;/);
    assert.match(src, /let typing = !mic \|\| !micOn \|\| nonSpace\(state\.description\) > 0;/);
    assert.ok(!read('src/site.js').includes('pub-cross'), 'no cross row on /services');
  });

  test('46. (L11-53, r2 S23) drafts: one key per side (charity keeps the 10.0 key), the draft stores seg; explicit seg › draft seg › cookie; a draft of the other side is never offered under an explicit seg', () => {
    const src = read('public/assets/js/public/intake.js');
    assert.match(src, /const keyOf = \(s\) => \(s === 'paid' \? `\$\{DRAFT_KEY\}-paid` : DRAFT_KEY\);\s*const store = draftStore\(keyOf\(SEG\)\);/);
    assert.match(src, /v: 2,\s*seg: SEG,/);
    // v12 entry: intended (E12-40) — the other-side redirect runs only while «خيري» is public and never on a tree leaf (its
    // /intake?path= URL always opens the paid form, so ?seg=charity would loop)
    assert.match(src, /if \(PUB\.charity && !P && !params\.get\('seg'\) && !\(await store\.load\(\)\)\) \{\s*const other = SEG === 'paid' \? 'charity' : 'paid';\s*if \(await draftStore\(keyOf\(other\)\)\.load\(\)\) \{\s*params\.set\('seg', other\);\s*window\.location\.replace/);
    // the banner still never names the side or the topic (9.2 tests 15–17)
    const banner = src.slice(src.indexOf("banner = h(\n    'section.bmf-banner'"), src.indexOf('COPY.draftNew,'));
    assert.ok(!/SEG|seg|خيري|أفراد/.test(banner));
  });

  test('47. (§4) /intake closure ≤ 32,768 B br without segment.js, site-copy-paid.js or intake-company.js; intake.js ≤ 11.0 + 2,048 B br (v12 §4; 11.0 = 19,101 B served); drafts.js +0; intake-company.js ≤ 4,096 B br and v11-lead.css ≤ 1,536 B br, both lazy', () => {
    const served = (url) => br(transformAsset(path.join(PUB, url.split('?')[0])));
    const closure = ['/assets/js/public/intake.js', ...preloadClosure(path.join(PUB, 'assets/js/public/intake.js'), PUB)];
    // v12 entry: intended (§4, E12-42) — entry-tree.js never in it either; pictos.js is imported by the charity form only
    assert.ok(!closure.some((u) => /segment\.js|site-copy-paid|intake-company|recorder\.js|upload\.js|entry-tree\.js|pictos\.js/.test(u)), closure.join(' '));
    assert.ok(closure.reduce((s, u) => s + served(u), 0) <= 32768);
    // v12 entry: intended (§4) — the 11.0 budget line (+1,800 over 10.0) becomes «≤ 11.0 size + 2,048 B br»
    const grow = served('/assets/js/public/intake.js') - 19101;
    assert.ok(grow <= 2048, `intake.js +${grow}`);
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
    // v12 entry: intended (E12-43) — the tree's path rides between segment and requester; the IC-16 line links WhatsApp for
    // numbers outside Egypt (a link given by intake.js, not the confirm card)
    assert.match(co, /segment: 'paid',\s*pathway: ctx\.path,\s*requester,/);
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
      assert.equal(titleOf(h), `متابعة طلبكم | ${BRAND}`, 'v12 entry: intended (§5.11) — « | » on the paid side');
      assert.ok(headerOf(h).includes('class="pub-brand" href="/"'), 'v12 entry: intended (L12-11) — brand → «/»');
      assert.ok(!headerOf(h).includes('pub-seg-pill'), 'no pill on /p/');
      assert.match(headerOf(h), /<a class="pub-head-contact pub-head-contact--wa" href="https:\/\/wa\.me\/201000000001\?text=[^"]+"/, 'paid side: main digits + the paid sentence (default)');
      assert.ok(decode(headerOf(h)).includes(encodeURIComponent(PAID_GENERIC)), 'v12 entry: intended (E12-61) — the generic paid sentence');
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
      newHref: '/', // v12 entry: intended (E12-71، H-E2)
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

  test('52. (G11-47, P1) /portal: archived → always paid «متابعة طلبكم» + bm-copy PORTAL_LOGIN_PAID (E12-71 #15); restored → the cookie side (charity «تابعي طلبك» without bm-copy)', async () => {
    for (const cookie of ['', 'bm_seg=charity']) {
      const p = (await get('/portal', cookie ? { cookie } : {})).body;
      assert.equal(titleOf(p), `متابعة طلبكم | ${BRAND}`, cookie);
      assert.match(p, /<h1 id="page-title" class="bp-login-title"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>متابعة طلبكم<\/h1>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
      assert.deepEqual(bmCopyOf(p).data, PORTAL_LOGIN_PAID);
    }
    for (const [k, v] of Object.entries({ h1: 'متابعة طلبكم', sub: 'اكتبوا رقم الموبايل الذي أرسلتم منه الطلب، وسيصلكم كود على واتساب.', send: 'إرسال الكود', code: 'الكود', confirm: 'تأكيد' })) assert.equal(PORTAL_LOGIN_PAID[k], v, k);
    for (const v of Object.values(PORTAL_LOGIN_PAID)) assert.ok(!BANNED.test(v) && !FEM_ALL.test(v), v);
    await restored(async () => {
      const c = (await get('/portal')).body;
      assert.match(c, /<h1 id="page-title" class="bp-login-title"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>تابعي طلبك<\/h1>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
      assert.equal(bmCopyOf(c), null);
      assert.equal(titleOf(c), `متابعة طلبك — ${BRAND}`);
      assert.equal(titleOf((await get('/portal', { cookie: 'bm_seg=paid' })).body), `متابعة طلبكم | ${BRAND}`);
    });
  });

  test('53. (G11-49, P0) privacy §12: the bm_seg line verbatim, no Google Fonts; the company-lead bullet; (G11-50, P1) terms: the paid section before «تعديل الشروط»', async () => {
    // v12 entry: intended (E12-69) — while «خيري» is archived the bm_seg line says the old cookie is no longer used and is
    // deleted; the v11 line returns when «خيري» is restored (the «خيري» terms bullet the same way)
    const pv = (await get('/privacy')).body;
    assert.ok(pv.includes('قد يكون في متصفحكم ملف ارتباط قديم اسمه bm_seg من زيارة سابقة. لم نعد نستخدمه، ونحذفه عند زيارتكم التالية.'));
    const pvOn = (await restored(() => get('/privacy'))).body;
    assert.ok(pvOn.includes('نحفظ اختيارك لنوع الخدمة («خيري» أو «خدمات الأفراد والشركات») في ملف ارتباط ضروري اسمه bm_seg لمدة ستة أشهر، لنفتح لك الصفحة نفسها في زيارتك التالية. لا يحتوي على أي بيانات شخصية، ويمكنك تغييره في أي وقت من زر نوع الخدمة أعلى الصفحة.'));
    assert.ok(pv.includes('يُحمّل الموقع خطوطه العربية من خادمنا نفسه، ولا يتصل بأي خدمة خارجية لعرض الصفحات.'));
    assert.ok(!pv.includes('Google Fonts'));
    assert.ok(pv.includes('تستخدم منصة فريق العمل وبوابة الشركات ملفات ارتباط ضرورية لتسجيل الدخول فقط.'));
    assert.ok(pv.includes('في خدمات الأفراد والشركات قد نطلب أيضًا اسم الشركة والمسمى الوظيفي والبريد الإلكتروني للتواصل بخصوص العرض.'));
    const tm = (await get('/terms')).body;
    const i = tm.indexOf('12. الخدمات بأتعاب للأفراد والشركات');
    assert.ok(i > 0 && i < tm.indexOf('13. تعديل الشروط والتواصل'));
    for (const s of ['تُقدَّم خدمات الأفراد والشركات بأتعاب تُتفق عليها كتابةً قبل بدء أي عمل، وتظهر على صفحة الطلب للموافقة عليها.', 'لا يُطلب أي مبلغ إلا من خلال صفحة الطلب أو باتفاق مكتوب، ولا يبدأ العمل قبل موافقتكم.', 'خدمات الشركات بالاشتراك الشهري تحكمها شروط الباقة والعرض المكتوب المتفق عليه.']) assert.ok(tm.includes(s), s);
    const khayriBullet = 'المساعدة القانونية المجانية («خيري») مخصصة للأرامل والأيتام وأسرهم. قد نتحقق من الاستحقاق، وإن كان الطلب خارج البرنامج المجاني أبلغناكم وعرضنا تقديمه بأتعاب، ولا نبدأ إلا بموافقتكم.';
    assert.ok(!tm.includes(khayriBullet), 'v12 entry: intended (E12-69) — archived');
    assert.ok((await restored(() => get('/terms'))).body.includes(khayriBullet), 'restored');
    assert.match(tm, /<li><a href="#paid"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>الخدمات بأتعاب للأفراد والشركات<\/a><\/li>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
  });

  test('54. (G11-51/52, P1) /data-deletion and 404: archived → paid prefill and paid links («طلب جديد» and «الصفحة الأولى» → «/», E12-71 #14); restored without a cookie → the charity text unchanged', async () => {
    const d = (await get('/data-deletion', { cookie: 'bm_seg=charity' })).body;
    assert.ok(d.includes(`https://wa.me/201000000001?text=${encodeURIComponent('مرحبًا، أرغب في حذف بياناتي لديكم. الاسم: ')}`));
    const n = await get('/no-such-page-v11', { cookie: 'bm_seg=charity' });
    assert.equal(n.status, 404);
    assert.match(n.body, /<h1 id="page-title"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>الصفحة غير موجودة<\/h1>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
    assert.match(n.body, /href="\/" data-cta="intake"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>طلب جديد<\/a>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
    assert.match(n.body, /href="\/portal"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>متابعة طلب<\/a>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
    assert.ok(!FEMININE.test(visible(n.body.replace(/<footer[\s\S]*?<\/footer>/, ''))));
    await restored(async () => {
      const dc = (await get('/data-deletion')).body;
      assert.ok(dc.includes(encodeURIComponent('السلام عليكم، ده «طلب حذف بياناتي» من عندكم. اسمي: ')));
      const nc = await get('/no-such-page-v11');
      assert.match(nc.body, /<h1 id="page-title"(?: data-tag="[A-Z]{1,3}-\d{2,3}")?>الصفحة دي مش موجودة<\/h1>/); // v12 tags: intended (TG-6, T12-14: data-tag is the last attribute)
      assert.ok(nc.body.includes('href="/intake?seg=charity" data-cta="intake">احكيلنا مشكلتك</a>'), 'v12 entry: intended — bare /intake redirects to «/»');
    });
  });

  test('55. (INV-06) paid /intake, /p/<paid> and /portal (paid): no inline executable script; bm-copy is application/json', async () => {
    const paid = await portalPath('paid', '01055550003', 'wportalpaidtest000003');
    for (const [u, headers] of [[PAID_INTAKE, {}], ['/intake?path=company/counsel/proposal', {}], ['/intake?mode=callback', {}], [paid, {}], ['/portal', { cookie: 'bm_seg=paid' }]]) {
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
    const wanted = { '/khayri/': '/khayri', '/services/': '/services', '/charity': '/khayri', '/khairy': '/khayri', '/khayry': '/khayri', '/khairi': '/khayri', '/kheiri': '/khayri', [`/${encodeURIComponent('خيري')}`]: '/khayri', '/khadamat': '/services', '/afrad': '/services', [`/${encodeURIComponent('خدمات')}`]: '/services', '/companies': '/services#companies', '/sharikat': '/services#companies', [`/${encodeURIComponent('شركات')}`]: '/services#companies',
      // v12 entry: intended (E12-10 آخر صف، P1): أسماء قصيرة للشجرة
      '/istishara': '/start/consultation', [`/${encodeURIComponent('استشارة')}`]: '/start/consultation', '/daawa': '/start/litigation', [`/${encodeURIComponent('دعوى')}`]: '/start/litigation', [`/${encodeURIComponent('قضية')}`]: '/start/litigation', '/tasis': '/start/company/new', [`/${encodeURIComponent('تأسيس')}`]: '/start/company/new', [`/${encodeURIComponent('تاسيس')}`]: '/start/company/new' };
    assert.deepEqual(ALIASES, wanted);
    for (const [from, to] of Object.entries(ALIASES)) {
      const forms = new Set([from, from.toLowerCase(), from.endsWith('/') ? from : `${from}/`]);
      for (const f of forms) {
        for (const method of ['GET', 'HEAD']) {
          const r = await t.client().request(method, `${f}?utm_source=fb&utm_campaign=v11&evil=1&next=https://x.example`);
          assert.equal(r.status, 301, `${method} ${f}`);
          if (to === '/khayri') assert.equal((await get(to)).status, 200, 'v12 entry: intended (L12-49) — then the KH notice, never a paid page');
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
    // v12 entry: intended (E12-10): /?topic= (حملات 10.0) ← مكانها في الشجرة، بلا جانب كعكة؛ /?gate=1 ← 301 «/»
    const tp = await get('/?topic=inh&utm_source=fb&x=1');
    assert.equal(tp.status, 302);
    assert.equal(tp.headers.get('location'), '/intake?path=consultation/family/inheritance&utm_source=fb');
    assert.equal((await get('/?topic=pen', { cookie: 'bm_seg=paid' })).headers.get('location'), '/intake?path=consultation/government/pension');
    for (const u of ['/?topic=evil', '/?topic=%3Cscript%3E']) {
      const r = await get(u);
      assert.equal(r.status, 200, u);
      assert.match(r.body, /<h1 class="q__title" id="q" data-tag="T-01">كيف نساعدكم؟<\/h1>/, `${u} → the tree`);
    }
    assert.equal((await get('/?gate=1&topic=inh')).status, 301);
  });

  // v12 entry: intended — 57 (مفتاح إيقاف الشاشة والشارة) حُذف: لا شارة ولا شاشة ولا site_gate_enabled (E12-T35، الاختبار 22 أعلاه).

  test('58. /services «التزامنا معكم»: trust lines wrap in full (v12 entry: intended — the eight topic rows are gone, E12-62)', () => {
    const css = tailCss().replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/nowrap|ellipsis/.test(m[2])) assert.ok(!/\.g-sub/.test(m[1]) && !/pub-trust/.test(m[1]), `one-line rule on ${m[1].trim()}`);
    }
  });

  // v12 entry: intended (E12-71 #9) — 59 (the paid way back to «خيري» on a stuck draft store) deleted with crossRow(); the
  // remaining invariant (no way to «خيري» from the paid form) is test/v12-entry.test.js «E12-T22: intake.js … no way back to «خيري»».

  test('60. (PW-G14) one filled button per viewport on /services: above 1080 px the header «طلب استشارة» is tinted on the homes (gate fix J-06/K12), so the in-page actions are the filled ones (the page-end CTA filled again); paid callback and contact WhatsApp tinted; grouped lists keep an edge in forced colours (V11-53); trust rows go two columns on desktop', () => {
    const css = tailCss();
    assert.ok(!/\.pub-final-cta \.pub-btn-primary[^{]*\{\s*background: var\(--tint-weak\)/.test(css), 'page-end CTA stays filled');
    assert.match(read('public/assets/css/public-site.css'), /\nbody\.pub-landing \.pub-nav-cta \{\s*background: var\(--tint-weak\);\s*color: var\(--tint\);/);
    assert.match(css, /body\.pub-paid \.pub-pick-way--callback \{[^}]*background: var\(--gold-wash\);/);
    assert.match(css, /body\.pub-paid #contact \.pub-btn-whatsapp \{\s*background: var\(--ok-weak\);/);
    assert.match(read('public/assets/css/public-site.css'), /@media \(max-width: 1080px\) \{\s*\.pub-nav \{\s*display: none;/, 'the header CTA shows from 1081 px');
    assert.match(read('public/services.html'), /<body class="site pub v91 pub-landing pub-paid"/);
    assert.match(css, /@media \(forced-colors: active\) \{\s*\.pub-topic-list,\s*\.pub-trust-list,\s*body\.pub \.pub-co-row \{\s*outline: 1px solid CanvasText;/);
    assert.match(css, /\.pub-trust-list \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });

  // v12 entry: intended — 61 (رابط مكسور في كشف «خيري» من الشاشة) حُذف مع منطق الشاشة في landing.js (الاختبار 38 أعلاه).
});
