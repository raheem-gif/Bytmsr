// v9 — وحدة الموقع العام: صفحات الموقع المولدة على الخادم، SEO والمشاركة وJSON-LD، robots/sitemap،
// إعدادات المؤسسة في /api/meta، بيانات الأسرة في نموذج الطلب، وPWA للمنصة (manifest وعامل الخدمة).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, LAWYER_PASSWORD } from './lane-b-kit.test.js';
import { DEFAULT_SETTINGS, LEGAL_AREAS } from '../src/constants.js';
import { SERVICES, FAQ, ROBOTS_DISALLOW, SITE_PAGES, esc, safeUrl, renderTemplate } from '../src/site.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');

const PAGES = [
  ['/', /الدعم القانوني للأرامل والأيتام وأسرهم — مؤسسة بيوت مصر/],
  ['/intake', /احكيلنا مشكلتك — الدعم القانوني — مؤسسة بيوت مصر/], // v9.1 b-forms: عنوان صفحة الطلب الجديد
  ['/about', /عن برنامج الدعم القانوني — مؤسسة بيوت مصر/],
  ['/privacy', /سياسة الخصوصية — الدعم القانوني — مؤسسة بيوت مصر/],
  ['/terms', /شروط الاستخدام — الدعم القانوني — مؤسسة بيوت مصر/],
  ['/data-deletion', /طلب حذف البيانات — الدعم القانوني — مؤسسة بيوت مصر/],
];

function titleOf(html) {
  return (/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '';
}
function metaContent(html, attr, name) {
  const re = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`);
  return (re.exec(html) || [])[1];
}
function jsonLd(html) {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'JSON-LD block missing');
  return JSON.parse(m[1]);
}
const DESC = 'توفي زوجي منذ ستة أشهر ولم يُصرف معاش الأبناء حتى الآن رغم تقديم الأوراق للتأمينات الاجتماعية.';

describe('v9 site — public pages rendered on the server', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  test('every public page is served (200, HTML) with its Arabic title and no unrendered template tokens', async () => {
    const c = t.client();
    for (const [p, title] of PAGES) {
      const r = await c.get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get('content-type'), /text\/html/);
      assert.match(titleOf(r.body), title, `${p} title`);
      assert.match(r.body, /<html lang="ar" dir="rtl">/);
      // v9.1 b-site: بيانات JSON-LD وbm-public والأنماط المضمّنة ليست قوالب (قد تحتوي «}}»)
      const withoutLd = r.body.replace(/<script type="application\/(?:ld\+)?json"[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
      assert.ok(!/\{\{|\}\}|<!--#if|<!--\/if|<!--site:head-->/.test(withoutLd), `${p} has unrendered tokens`);
      // الرأس والتذييل المشتركان + روابط السياسات والمتابعة
      assert.match(r.body, /class="pub-header"/);
      assert.match(r.body, /class="pub-footer"/);
      for (const href of ['/privacy', '/terms', '/data-deletion', '/portal', '/intake', '/about']) assert.ok(r.body.includes(`href="${href}"`), `${p} links ${href}`);
      // CSP صارمة: لا سكربتات مضمّنة تنفيذية
      const inline = [...r.body.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/application\/(?:ld\+)?json/.test(m[1]));
      assert.equal(inline.length, 0, `${p} must not have inline executable scripts`);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    }
  });

  test('HEAD works and /index.html redirects permanently to /', async () => {
    const head = await fetch(`${t.base}/privacy`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    const r = await fetch(`${t.base}/index.html`, { redirect: 'manual' });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/');
  });

  test('SEO and sharing tags: description, canonical, Open Graph, Twitter, icons — absolute URLs from the Host header', async () => {
    for (const [p] of PAGES) {
      const r = await t.client().get(p);
      const html = r.body;
      const desc = metaContent(html, 'name', 'description');
      assert.ok(desc && desc.length > 60, `${p} description`);
      assert.ok(html.includes(`<link rel="canonical" href="${t.base}${p}" />`), `${p} canonical`);
      assert.equal(metaContent(html, 'property', 'og:url'), `${t.base}${p}`);
      assert.equal(metaContent(html, 'property', 'og:title'), titleOf(html).replace(/&amp;/g, '&'));
      assert.equal(metaContent(html, 'property', 'og:image'), `${t.base}/assets/img/og-image.png`);
      assert.equal(metaContent(html, 'property', 'og:locale'), 'ar_EG');
      assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
      assert.match(html, /<link rel="icon" href="\/assets\/img\/favicon.svg" type="image\/svg\+xml" \/>/);
      assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/img\/apple-touch-icon.png" \/>/);
    }
  });

  test('JSON-LD describes the NGO and its LegalService (address, phone, Facebook) and the home page FAQ', async () => {
    const home = jsonLd((await t.client().get('/')).body);
    assert.equal(home['@context'], 'https://schema.org');
    const graph = home['@graph'];
    const ngo = graph.find((n) => n['@type'] === 'NGO');
    const svc = graph.find((n) => n['@type'] === 'LegalService');
    assert.equal(ngo.name, DEFAULT_SETTINGS.org_legal_name);
    assert.equal(ngo.telephone, '+201211114662');
    assert.match(ngo.address.streetAddress, /44 شارع المحكمة العسكرية/);
    assert.equal(ngo.address.addressCountry, 'EG');
    assert.deepEqual(ngo.sameAs, ['https://www.facebook.com/Beyootmisr/']);
    assert.equal(svc.parentOrganization['@id'], ngo['@id']);
    // v9.1 b-site (B91-07): ثمانية مربعات بكلام يومي، و«حاجة تانية» بلا مجال قانوني؛ خمسة أسئلة فقط
    assert.equal(svc.knowsAbout.length, SERVICES.filter((s) => s.seo).length);
    const faq = graph.find((n) => n['@type'] === 'FAQPage');
    assert.equal(FAQ.length, 5);
    assert.equal(faq.mainEntity.length, FAQ.length);
    // صفحات أخرى لا تحمل FAQPage
    const about = jsonLd((await t.client().get('/about')).body)['@graph'];
    assert.ok(!about.some((n) => n['@type'] === 'FAQPage'));
  });

  test('landing page content: services by area link to defined legal-area codes, FAQ rendered, contact block from settings, foundation programmes', async () => {
    const html = (await t.client().get('/')).body;
    const codes = new Set(LEGAL_AREAS.map((a) => a.code));
    for (const s of SERVICES) {
      const m = new RegExp(`id="service-${s.key}"[\\s\\S]*?href="([^"]+)"`).exec(html);
      assert.ok(m, `service ${s.key} rendered`);
      const area = new URL(m[1], 'http://x').searchParams.get('area');
      if (!s.areas.length) {
        assert.equal(m[1], '/intake', 'v9.1: «حاجة تانية» opens the form without an area');
        continue;
      }
      assert.ok(area && codes.has(area), `service ${s.key} links to a defined area (${area})`);
      assert.equal(area, s.areas.find((c) => codes.has(c)));
    }
    assert.equal((html.match(/class="pub-faq-item"/g) || []).length, FAQ.length);
    assert.match(html, /01211114662/);
    assert.match(html, /href="tel:\+201211114662"/);
    assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=44%20/);
    assert.match(html, /https:\/\/wa\.me\/201000000001\?text=/);
    // v9.1 b-site (B91-07): برامج المؤسسة انتقلت إلى «عن البرنامج»
    const about = (await t.client().get('/about')).body;
    for (const p of ['نجاح', 'المائدة', 'سلامة', 'الكسوة', 'أفراح', 'صك الإيواء', 'نماء']) assert.ok(about.includes(`«${p}»`), p);
    // لا محتوى مختلق: لا شهادات ولا إحصاءات
    assert.ok(!/شهادات المستفيدين|testimonial/i.test(html));
  });

  test('legal pages carry the required disclosures (AI under human supervision, WhatsApp, rights, deletion channels)', async () => {
    const privacy = (await t.client().get('/privacy')).body;
    assert.ok(privacy.includes('قد نستعين بأدوات ذكاء اصطناعي لتنظيم الطلبات تحت إشراف بشري'));
    assert.match(privacy, /WhatsApp Business Platform/);
    assert.match(privacy, /151 لسنة 2020/);
    assert.match(privacy, /لا يطّلع أبدًا على رقم\s+هاتفك/);
    const terms = (await t.client().get('/terms')).body;
    assert.match(terms, /لا ضمان للنتائج/);
    assert.match(terms, /حدود العلاقة مع المحامي/);
    const del = (await t.client().get('/data-deletion')).body;
    assert.match(del, /https:\/\/wa\.me\/201000000001\?text=/);
    assert.match(del, /href="tel:\+201211114662"/);
    assert.match(del, /ثلاثين يومًا/);
    // البريد غير مضبوط افتراضيًا فلا يظهر سطره
    assert.ok(!del.includes('mailto:'));
  });

  test('robots.txt disallows private areas and points to the sitemap; sitemap lists every public page with absolute URLs', async () => {
    const robots = await t.client().get('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers.get('content-type'), /text\/plain/);
    for (const p of ['/app', '/p/', '/api/', '/setup']) assert.ok(robots.body.includes(`Disallow: ${p}\n`), `robots disallows ${p}`);
    assert.deepEqual(ROBOTS_DISALLOW.slice(0, 4), ['/app', '/p/', '/api/', '/setup']);
    assert.ok(robots.body.includes(`Sitemap: ${t.base}/sitemap.xml`));
    const sm = await t.client().get('/sitemap.xml');
    assert.equal(sm.status, 200);
    assert.match(sm.headers.get('content-type'), /application\/xml/);
    sm.body = Buffer.from(sm.body).toString('utf8');
    assert.match(sm.body, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(locs, SITE_PAGES.map((p) => `${t.base}${p.path}`));
    assert.ok(!/\/app|\/p\/|\/api\//.test(locs.join(' ')));
    assert.match(sm.body, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  test('a forged Host header cannot inject markup into canonical/sitemap URLs', async () => {
    const http = await import('node:http');
    const u = new URL(t.base);
    const body = await new Promise((resolve, reject) => {
      const req = http.request({ host: u.hostname, port: u.port, path: '/sitemap.xml', headers: { Host: 'evil.com"><script>x</script>' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(d));
      });
      req.on('error', reject);
      req.end();
    });
    assert.ok(!body.includes('<script>'));
    assert.ok(!body.includes('evil.com"'));
  });

  test('icons, favicon, OG image and manifest are real files of the right type and size', async () => {
    const png = (buf) => buf[0] === 0x89 && buf.slice(1, 4).toString() === 'PNG';
    const size = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    for (const [file, w, h] of [
      ['icon-192.png', 192, 192],
      ['icon-512.png', 512, 512],
      ['icon-maskable-512.png', 512, 512],
      ['apple-touch-icon.png', 180, 180],
      ['favicon-32.png', 32, 32],
      ['og-image.png', 1200, 630],
    ]) {
      const r = await t.client().get(`/assets/img/${file}`);
      assert.equal(r.status, 200, file);
      assert.equal(r.headers.get('content-type'), 'image/png');
      assert.ok(png(r.body), `${file} is PNG`);
      assert.deepEqual(size(r.body), [w, h], `${file} size`);
    }
    // واتساب (القناة الرئيسية للمؤسسة) لا يعرض صورة المعاينة إن تجاوزت نحو 300 كيلوبايت
    assert.ok(fs.statSync(path.join(PUB, 'assets/img/og-image.png')).size < 300 * 1024, 'og-image small enough for WhatsApp link previews');
    const ico = await t.client().get('/favicon.ico');
    assert.equal(ico.status, 200);
    assert.equal(ico.body.readUInt16LE(2), 1, 'ICO type');
    assert.ok(ico.body.readUInt16LE(4) >= 2, 'ICO has several sizes');
    const svg = await t.client().get('/assets/img/favicon.svg');
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
  });
});

describe('v9 site — /api/meta and admin-controlled settings', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('meta exposes the organisation profile under site (without overriding core settings)', async () => {
    const meta = ok(await t.client().get('/api/meta'));
    assert.equal(meta.settings.org_name, 'مؤسسة بيوت مصر');
    assert.equal(DEFAULT_SETTINGS.org_name, 'مؤسسة بيوت مصر');
    assert.ok(meta.settings.privacy_notice);
    const s = meta.site;
    assert.equal(s.site_name, 'الدعم القانوني — مؤسسة بيوت مصر');
    assert.equal(s.org_full_name, 'مؤسسة بيوت مصر لدعم الأرامل والأيتام');
    assert.match(s.org_registration, /11108 لسنة 2020/);
    assert.match(s.org_address, /مدينة نصر/);
    assert.equal(s.org_phone, '01211114662');
    assert.equal(s.org_phone_e164, '+201211114662');
    assert.equal(s.org_facebook_url, 'https://www.facebook.com/Beyootmisr/');
    assert.equal(s.org_instagram_url, '');
    assert.equal(s.org_email, '');
    assert.ok(s.office_hours);
    assert.match(s.map_url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  });

  test('only admins may change site settings (case manager and lawyer get 403, nothing changes)', async () => {
    await admin.post('/api/admin/users', { role: 'case_manager', username: 'sitemgr', name: 'مدير حالات', password: 'Manager@2026' });
    const manager = await t.login('sitemgr', 'Manager@2026');
    const law = await createLawyer(admin);
    const lawyer = await t.login(law.username, LAWYER_PASSWORD);
    for (const c of [manager, lawyer]) {
      const r = await c.patch('/api/admin/settings', { org_email: 'x@example.org', office_hours: 'مغلق' });
      assert.equal(r.status, 403);
    }
    const meta = ok(await t.client().get('/api/meta'));
    assert.equal(meta.site.org_email, '');
    assert.equal(meta.site.office_hours, DEFAULT_SETTINGS.office_hours);
  });

  test('admin edits flow to the pages and meta; unsafe URLs are dropped and text is escaped', async () => {
    ok(
      await admin.patch('/api/admin/settings', {
        org_email: 'legal@beyootmisr.org',
        office_hours: 'الأحد إلى الخميس <b>9–5</b>',
        org_instagram_url: 'https://www.instagram.com/beyootmisr/',
        org_facebook_url: 'https://www.facebook.com/Beyootmisr/',
        site_program_name: 'برنامج الدعم القانوني',
      }),
    );
    const meta = ok(await t.client().get('/api/meta'));
    assert.equal(meta.site.org_email, 'legal@beyootmisr.org');
    assert.equal(meta.site.org_instagram_url, 'https://www.instagram.com/beyootmisr/');
    assert.equal(meta.site.program_name, 'برنامج الدعم القانوني');
    const del = (await t.client().get('/data-deletion')).body;
    assert.match(del, /href="mailto:legal@beyootmisr\.org\?subject=/);
    assert.ok(del.includes('الأحد إلى الخميس &lt;b&gt;9–5&lt;/b&gt;'));
    assert.ok(!del.includes('<b>9–5</b>'));
    assert.match(titleOf((await t.client().get('/privacy')).body), /برنامج الدعم القانوني — مؤسسة بيوت مصر/);
    // دفاع إضافي: قيمة غير آمنة وصلت للقاعدة بطريق آخر (استيراد/استعادة) لا تُعرض أبدًا
    t.app.settings.set('org_instagram_url', 'javascript:alert(1)');
    assert.equal(ok(await t.client().get('/api/meta')).site.org_instagram_url, '', 'javascript: URL must never be exposed');
    assert.ok(!(await t.client().get('/')).body.includes('javascript:'));
    t.app.settings.set('org_instagram_url', '');
    // اسم البرنامج إلزامي: إن أُفرغ في القاعدة يعود الافتراضي
    t.app.settings.set('site_program_name', '');
    assert.equal(ok(await t.client().get('/api/meta')).site.program_name, 'الدعم القانوني');
    t.app.settings.set('site_program_name', DEFAULT_SETTINGS.site_program_name);
  });

  test('server-side validation of site settings: lookalike/insecure social links, bad email or phone, empty required names → 400 per field', async () => {
    const cases = [
      [{ org_facebook_url: 'https://evilfacebook.com/Beyootmisr' }, 'org_facebook_url'],
      [{ org_facebook_url: 'http://www.facebook.com/Beyootmisr/' }, 'org_facebook_url'],
      [{ org_facebook_url: 'javascript:alert(1)' }, 'org_facebook_url'],
      [{ org_instagram_url: 'https://instagram.com.evil.org/x' }, 'org_instagram_url'],
      [{ org_email: 'not-an-email' }, 'org_email'],
      [{ org_phone: 'اتصل بنا' }, 'org_phone'],
      [{ site_program_name: '' }, 'site_program_name'],
      [{ org_legal_name: '   ' }, 'org_legal_name'],
      [{ office_hours: 'x'.repeat(201) }, 'office_hours'],
    ];
    for (const [body, field] of cases) {
      const r = await admin.patch('/api/admin/settings', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.body.error, /[؀-ۿ]/, 'Arabic error message');
      assert.ok(r.body.details?.fields?.[field], `field error for ${field}`);
    }
    const s = ok(await admin.get('/api/admin/settings')).settings;
    assert.equal(s.org_facebook_url, 'https://www.facebook.com/Beyootmisr/', 'nothing saved by rejected requests');
    // صيغ صحيحة: نطاق فرعي لفيسبوك، fb.com، هاتف أرضي، بريد بحروف كبيرة يُحفظ بحروف صغيرة
    const saved = ok(
      await admin.patch('/api/admin/settings', { org_facebook_url: 'https://m.facebook.com/Beyootmisr', org_phone: '0224567890', org_email: 'Legal@BeyootMisr.org' }),
    );
    assert.equal(saved.org_facebook_url, 'https://m.facebook.com/Beyootmisr');
    assert.equal(saved.org_email, 'legal@beyootmisr.org');
    ok(await admin.patch('/api/admin/settings', { org_facebook_url: 'https://www.facebook.com/Beyootmisr/', org_phone: '01211114662', org_email: '' }));
  });

  test('clearing an optional contact detail hides it from the site (no silent fallback to the default)', async () => {
    ok(await admin.patch('/api/admin/settings', { org_facebook_url: '', org_address: '', org_registration: '', office_hours: '', org_phone: '' }));
    const meta = ok(await t.client().get('/api/meta'));
    for (const k of ['org_facebook_url', 'org_address', 'org_registration', 'office_hours', 'org_phone', 'map_url']) assert.equal(meta.site[k], '', k);
    const home = (await t.client().get('/')).body;
    assert.ok(!home.includes('facebook.com/Beyootmisr'), 'Facebook link removed');
    assert.ok(!home.includes('tel:'), 'phone link removed');
    assert.ok(!home.includes('google.com/maps'), 'map link removed');
    assert.ok(!home.includes('11108'), 'registration removed');
    const ld = jsonLd(home)['@graph'].find((n) => n['@type'] === 'NGO');
    assert.equal(ld.address, undefined);
    assert.equal(ld.sameAs, undefined);
    // الإعادة تُظهرها من جديد، والمحافظة في JSON-LD تُستنتج من العنوان
    ok(
      await admin.patch('/api/admin/settings', {
        org_facebook_url: DEFAULT_SETTINGS.org_facebook_url,
        org_address: 'شارع الهرم، الجيزة',
        org_registration: DEFAULT_SETTINGS.org_registration,
        office_hours: DEFAULT_SETTINGS.office_hours,
        org_phone: DEFAULT_SETTINGS.org_phone,
      }),
    );
    const ngo = jsonLd((await t.client().get('/')).body)['@graph'].find((n) => n['@type'] === 'NGO');
    assert.equal(ngo.address.addressLocality, 'الجيزة');
    ok(await admin.patch('/api/admin/settings', { org_address: 'عنوان بلا محافظة' }));
    assert.equal(jsonLd((await t.client().get('/')).body)['@graph'].find((n) => n['@type'] === 'NGO').address.addressLocality, undefined);
    ok(await admin.patch('/api/admin/settings', { org_address: DEFAULT_SETTINGS.org_address }));
  });

  test('template engine: {{{raw}}} only for server-built HTML parts; any settings value is escaped even with triple braces', () => {
    const view = { header: '<header>ok</header>', org_name: '<img src=x onerror=alert(1)>', flag: '' };
    const out = renderTemplate('{{{header}}}|{{{org_name}}}|{{org_name}}|<!--#if flag-->hidden<!--/if flag-->', view);
    assert.equal(out.split('|')[0], '<header>ok</header>');
    assert.ok(!out.includes('<img'), 'settings values never injected raw');
    assert.equal(out.split('|')[1], '&lt;img src=x onerror=alert(1)&gt;');
    assert.ok(!out.includes('hidden'));
    // قيمة تحتوي على رموز القوالب لا تُعالج مرة ثانية
    assert.equal(renderTemplate('{{a}}', { a: '{{{header}}}', header: '<b>' }), '{{{header}}}');
  });

  test('helpers: esc() and safeUrl()', () => {
    assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
    assert.equal(safeUrl('https://www.facebook.com/Beyootmisr/'), 'https://www.facebook.com/Beyootmisr/');
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl('data:text/html,x'), '');
    assert.equal(safeUrl('not a url'), '');
  });

  test('registerPage(optIn) renders only templates that opt in with {{{header}}}', async () => {
    t.app.site.registerPage('/__site-optin-yes', 'about.html', { optIn: true, noindex: true });
    t.app.site.registerPage('/__site-optin-no', 'app.html', { optIn: true });
    const yes = await t.client().get('/__site-optin-yes');
    assert.equal(yes.status, 200);
    assert.match(yes.body, /<meta name="robots" content="noindex, follow" \/>/);
    const no = await t.client().get('/__site-optin-no');
    assert.equal(no.status, 404, 'falls through to the default handler');
  });
});

describe('v9 site — website intake with the optional family (beneficiary) section', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  const base = (extra = {}) => ({ name: 'أم يوسف', phone: '01011112222', description: DESC, consent: true, legal_area: 'INH', ...extra });

  test('intake accepts the beneficiary contract shape and still works without it', async () => {
    const withB = await t.client().post(
      '/api/public/intake',
      base({ beneficiary: { relation: 'widow', children_count: 3, foundation_file_number: 'BM/2024/55', monthly_income_band: 'lt_2000', housing: 'rented_old' } }),
    );
    assert.equal(withB.status, 201, JSON.stringify(withB.body));
    assert.match(withB.body.reference, /^REQ-\d{4}-\d+$/);
    assert.match(withB.body.portal_url, /\/p\/[A-Za-z0-9_-]{20,}/);
    const without = await t.client().post('/api/public/intake', base({ phone: '01022223333' }));
    assert.equal(without.status, 201);
  });

  test('when the practice backend validates beneficiary data, invalid values are rejected with an Arabic message', async (ctx) => {
    if (!t.app.practice || !t.app.practice.beneficiary || typeof t.app.practice.beneficiary.validatePublic !== 'function') {
      ctx.skip('practice backend for beneficiary data is not present');
      return;
    }
    const r = await t.client().post('/api/public/intake', base({ phone: '01233334444', beneficiary: { relation: 'king', children_count: 99 } }));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /[؀-ۿ]/);
  });

  // v9.1 b-forms (تغيير مقصود): النموذج صار 3 خطوات؛ الموضوع بكلام الناس يُترجم لمجال يُقبل فقط إن عرّفته بيانات المنصة،
  // وبيانات الأسرة في النموذج سؤالان فقط (الصفة وعدد الأطفال). الخادم ما زال يقبل الحقول الأخرى (اختبار validatePublic أعلاه).
  test('the intake page maps plain-language topics to areas known by the platform and sends the contract keys', () => {
    const src = fs.readFileSync(path.join(PUB, 'assets/js/public/intake.js'), 'utf8');
    assert.match(src, /areaCodes\.has\(/, 'a topic sends its area only when the platform defines it');
    assert.match(src, /areaCodes = new Set\(\(meta\.areas \|\| \[\]\)\.map/);
    for (const k of ['relation', 'children_count']) assert.ok(src.includes(k), k);
    for (const v of ['widow', 'orphan_guardian', 'divorced', 'other']) assert.ok(src.includes(`'${v}'`), v);
    for (const gone of ['foundation_file_number', 'monthly_income_band', 'email', "'rented_old'", 'beneficiary.housing']) assert.ok(!src.includes(gone), `${gone} is no longer asked on the public form`);
    // شاشة النجاح تحل محل النموذج وعنوانه، فعنوانها h1 (عنوان رئيسي واحد للصفحة)
    assert.match(src, /h\('h1#success-title/);
  });

  test('terms list the emergency numbers (police, child helpline, women\'s complaints office)', async () => {
    const terms = (await t.client().get('/terms')).body;
    for (const n of ['122', '16000', '15115']) assert.ok(terms.includes(`dir="ltr">${n}</span>`), n);
  });
});

describe('v9 site — PWA for staff and lawyers', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  test('manifest is valid JSON: Arabic, RTL, standalone, start_url and scope /app, icons that exist', async () => {
    const r = await t.client().get('/manifest.webmanifest');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /application\/manifest\+json/);
    const m = typeof r.body === 'string' ? JSON.parse(r.body) : JSON.parse(Buffer.from(r.body).toString('utf8'));
    assert.equal(m.lang, 'ar');
    assert.equal(m.dir, 'rtl');
    assert.equal(m.start_url, '/app');
    assert.equal(m.scope, '/app');
    assert.equal(m.display, 'standalone');
    assert.match(m.name, /[؀-ۿ]/);
    assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
    assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
    assert.ok(m.icons.some((i) => i.sizes === '192x192'));
    assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
    for (const i of m.icons) assert.equal((await t.client().get(i.src)).status, 200, i.src);
    for (const s of m.shortcuts || []) assert.ok(s.url.startsWith('/app'), s.url);
  });

  test('the app shell links the manifest and icons and registers the worker scoped to /app', () => {
    const html = fs.readFileSync(path.join(PUB, 'app.html'), 'utf8');
    assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest" \/>/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/img\/apple-touch-icon.png" \/>/);
    assert.match(html, /<meta name="theme-color"/);
    const main = fs.readFileSync(path.join(PUB, 'assets/js/app/main.js'), 'utf8');
    assert.match(main, /import\('\.\.\/lib\/pwa\.js'\)/);
    const pwa = fs.readFileSync(path.join(PUB, 'assets/js/lib/pwa.js'), 'utf8');
    assert.match(pwa, /register\('\/sw\.js', \{ scope: '\/app' \}\)/);
    // الموقع العام لا يسجل عامل الخدمة ولا يربط manifest
    for (const f of ['index.html', 'intake.html', 'privacy.html']) assert.ok(!fs.readFileSync(path.join(PUB, f), 'utf8').includes('manifest'), f);
    for (const f of ['landing.js', 'intake.js', 'common.js']) assert.ok(!fs.readFileSync(path.join(PUB, 'assets/js/public', f), 'utf8').includes('serviceWorker'), f);
  });

  test('sw.js is served with an injected version and an /assets-only precache list (never /api, /p/, /portal)', async () => {
    const r = await t.client().get('/sw.js');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.match(r.headers.get('cache-control'), /no-cache/);
    const src = r.body;
    assert.ok(!src.includes('__SW_VERSION__') && !src.includes('__PRECACHE__') && !src.includes('__ORG_NAME__'), 'placeholders replaced');
    const version = /const VERSION = "([^"]+)";/.exec(src)[1];
    assert.match(version, /^9\.\d+\.\d+-[0-9a-f]{12}$/);
    const precache = JSON.parse(/const PRECACHE = (\[[^\n]*\]);/.exec(src)[1]);
    assert.ok(precache.length > 10);
    assert.ok(precache.every((p) => p.startsWith('/assets/')), 'only static assets are precached');
    // v9.1 l-home (L-07): الروابط برقم إصدارها (?v=…) — نفس ما تطلبه الصفحة فيُخدم من المخزن مباشرة
    assert.ok(precache.some((p) => p.split('?')[0] === '/assets/js/app/main.js'));
    assert.ok(!precache.some((p) => p.startsWith('/assets/js/public/')), 'public-site scripts are not precached');
    // الإصدار ثابت ما لم تتغير الملفات
    const again = /const VERSION = "([^"]+)";/.exec((await t.client().get('/sw.js')).body)[1];
    assert.equal(again, version);
  });

  test('static analysis: the worker never caches /api, /p/, /portal or authenticated responses', () => {
    const src = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
    for (const re of ['/^\\/api(\\/|$)/', '/^\\/p\\//', '/^\\/portal(\\/|$)/']) assert.ok(src.includes(re), `NEVER list contains ${re}`);
    // كل استدعاءات التخزين تمر عبر cacheable() وتخص /assets فقط
    // v9.1 l-home (L-07): + صفحة المنصة /app نفسها (SHELL_KEY، بلا بيانات شخصية) عبر cacheable() أيضًا
    const puts = [...src.matchAll(/cache\.put\(/g)].length;
    assert.equal(puts, 4, 'cache.put only in precache, cacheFirst and the /app shell (refreshShell + first fetch)');
    assert.equal([...src.matchAll(/cache\.put\(SHELL_KEY, res\.clone\(\)\)/g)].length, 2);
    assert.equal([...src.matchAll(/if \(cacheable\(res\) && !res\.redirected\) (?:await )?cache\.put\(SHELL_KEY/g)].length, 2);
    assert.match(src, /const SHELL_KEY = '\/app';/);
    assert.match(src, /if \(cacheable\(res\)\) await cache\.put\(path, res\)/);
    assert.match(src, /if \(cacheable\(res\)\) cache\.put\(request, res\.clone\(\)\)/);
    assert.match(src, /if \(url\.origin !== self\.location\.origin \|\| isNever\(url\)\) return;/);
    assert.match(src, /if \(isStaticAsset\(url\)\) event\.respondWith\(cacheFirst\(request\)\)/);
    assert.match(src, /url\.pathname\.startsWith\('\/assets\/'\)/);
    assert.match(src, /cc\.includes\('no-store'\) \|\| cc\.includes\('private'\)/);
    assert.match(src, /res\.headers\.get\('Set-Cookie'\)/);
    // v9.1 l-home (L-07): صفحة المنصة /app وحدها (بلا بيانات شخصية) من المخزن أولًا ثم تُحدَّث في الخلفية
    // (كان: الشبكة دائمًا)، وصفحة عدم الاتصال عند الانقطاع إن لم تُخزَّن بعد
    assert.match(src, /async function networkFirstShell\(request, event\) \{\s*const cache = await caches\.open\(CACHE\);\s*const hit = await cache\.match\(SHELL_KEY\);/);
    assert.match(src, /return offlineResponse\(\);/);
    assert.ok(!/onclick=|<script/i.test(src.slice(src.indexOf('function offlineResponse'))), 'offline page has no script');
    assert.match(src, /لا يوجد اتصال بالإنترنت/);
  });

  test('updates never take over an open page by themselves (no mixed old/new lazy modules): the new worker waits for «تحديث الآن»', () => {
    const src = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
    const install = src.slice(src.indexOf("addEventListener('install'"), src.indexOf("addEventListener('activate'"));
    assert.ok(install.length > 0);
    assert.ok(!/skipWaiting\(\)/.test(install.replace(/\/\/[^\n]*/g, '')), 'install handler must not call skipWaiting()');
    assert.match(src, /if \(event\.data === 'SKIP_WAITING'\) self\.skipWaiting\(\);/);
    const pwa = fs.readFileSync(path.join(PUB, 'assets/js/lib/pwa.js'), 'utf8');
    assert.match(pwa, /postMessage\('SKIP_WAITING'\)/, 'the update button activates the waiting worker');
    assert.match(pwa, /reg\.waiting/, 'a worker already waiting is offered on load');
    assert.match(pwa, /if \(accepted\)/, 'reload only after the user accepted the update');
    assert.match(pwa, /reg\.update\(\)/, 'periodic update checks for the long-lived single-page app');
  });
});
