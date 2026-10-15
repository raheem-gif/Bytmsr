// v12 gate round 2 — fixer-public: R-01, R-02, V-02…V-07, V-16…V-23, JR-07, JR-08, JR-10, JR-14, JR-15
// (scratchpad/v12-gate-progress.md «fixer-public-r2»). One regression test per finding; the browser measurements (CLS sweep of
// every leaf at Fast 3G / CPU×4, focus rings by keyboard, screenshots at 360/390/1366) are recorded in the progress file.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { transformAsset } from '../src/site-assets.js';
import { wordClip } from '../src/services/portal-v91.js';
import { allLeaves } from '../public/assets/js/public/entry-tree.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const CSS = read('public/assets/css/public-site.css');
const FORMS = read('public/assets/css/v91-b-forms.css');
const INTAKE = read('public/assets/js/public/intake.js');

let t;
const get = (p, headers = {}) => t.client().get(p, headers);
const mainOf = (h) => /<main[\s\S]*?<\/main>/.exec(h)[0];
const headerOf = (h) => /<header class="pub-header[\s\S]*?<\/header>/.exec(h)?.[0] || '';
const footerOf = (h) => /<footer class="pub-footer[\s\S]*?<\/footer>/.exec(h)?.[0] || '';
const firstStyle = (h) => (/<style>([\s\S]*?)<\/style>/.exec(h) || [])[1] || '';
const stepOf = (h) => /<p class="step" aria-live="polite" data-tag="I-02"( hidden)?><span class="step__n">([^<]*)<\/span><span class="step__bar" aria-hidden="true"><i><\/i><\/span><\/p>/.exec(h);
/** مخاطبة المفرد (نفس قائمة test/v12-gate-public.test.js) */
const SINGULAR = /(?:بيانات|طلب|حقوق|موافقت|ملف|هاتف|رقم|ظروف|علم|غير|حالت|مسألت|مشكلت)ك(?![؀-ۿ])|تواصل معنا عبر|أرسل كلمة|اتبع خطوات|فاذكر ذلك/;
/** نص القاعدة كاملًا (من المحدِّد حتى أول «}») */
const ruleOf = (css, selector) => {
  const i = css.indexOf(`${selector} {`);
  assert.ok(i >= 0, `rule ${selector}`);
  return css.slice(i, css.indexOf('}', i) + 1);
};

before(async () => {
  t = await startTestApp();
});
after(async () => {
  await t.close();
});

describe('v12 gate r2 — R-01: the paid intake takes its final height on the first paint (CLS)', () => {
  test('the step line (I-02) is server markup with the first question\'s «1 من N» on every leaf; hidden on the company lead and on «نتصل بكم»', async () => {
    const leaves = allLeaves().filter((l) => !l.exit && !l.href);
    assert.ok(leaves.length > 40, `${leaves.length} leaves`);
    for (const l of leaves) {
      const html = (await get(`/intake?path=${l.path}`)).body;
      const m = stepOf(html);
      assert.ok(m, `${l.path}: step line in the server HTML`);
      assert.equal((html.match(/<p class="step"/g) || []).length, 1, `${l.path}: one step line`);
      if (l.lead) {
        assert.equal(m[1], ' hidden', `${l.path}: lead form has no steps`);
        assert.match(html, /<div id="intake-root" class="lh-long"/, `${l.path}: the long lead form reserves the screen`);
      } else {
        // ask + «احكوا» + المستندات + الرقم (intake.js: total = ask.length + 3، والشاشة الأولى 1)
        assert.equal(m[1], undefined, l.path);
        assert.equal(m[2], `1 من ${l.ask.length + 3}`, l.path);
        assert.match(html, /<div id="intake-root" data-org-phone=/, `${l.path}: no reserved height on a short first question`);
      }
    }
    const cb = (await get('/intake?mode=callback')).body;
    assert.equal(stepOf(cb)?.[1], ' hidden');
    assert.match(cb, /<div id="intake-root" class="lh-long"/);
  });

  test('intake.js updates the server step line and never creates one; the company lead stylesheet is in <head>; the slow-page card takes no height before its 8 s', async () => {
    assert.match(INTAKE, /stepEl \|\|= document\.querySelector\('p\.step'\);\s*stepEl\.hidden = !total;/);
    assert.ok(!/h\('p\.step'/.test(INTAKE));
    const lead = (await get('/intake?path=company/counsel/proposal')).body;
    const head = lead.slice(0, lead.indexOf('</head>'));
    assert.match(head, /<link rel="stylesheet" href="\/assets\/css\/v11-lead\.css\?v=[^"]+" data-lead-css \/>/);
    assert.ok(!(await get('/intake?path=consultation/family/inheritance')).body.includes('data-lead-css'), 'only the company forms');
    const paid = (await get('/intake?path=consultation/family/inheritance')).body;
    assert.match(paid, /<div class="bmf-slow-box" data-slow><div class="bmf-card bmf-slow">/);
    assert.match(ruleOf(CSS, '.lh .bmf-slow-box'), /max-height: 0;\s*overflow: hidden;\s*animation: bmf-slow-box 0s 8s forwards;/);
    assert.match(CSS, /@keyframes bmf-slow-box \{\s*to \{\s*max-height: 4000px;/);
    assert.match(ruleOf(CSS, '.lh #intake-root.lh-long'), /min-height: 100svh;/);
  });
});

describe('v12 gate r2 — R-02: unversioned module URLs are served transformed', () => {
  test('a module fetched without ?v= (dynamic imports, tags.js) gets the same comment-free body as the versioned URL, no-cache', async () => {
    for (const rel of ['assets/js/public/menu.js', 'assets/js/public/saved.js', 'assets/js/lib/tags.js']) {
      const r = await get(`/${rel}`);
      assert.equal(r.status, 200, rel);
      const expected = transformAsset(path.join(PUB, rel));
      assert.equal(r.body, Buffer.isBuffer(expected) ? expected.toString('utf8') : String(expected), rel);
      assert.ok(!/^\s*\/\/ /m.test(r.body), `${rel}: no comment lines`);
      assert.match(r.headers.get('cache-control') || '', /no-cache/, rel);
    }
  });
});

describe('v12 gate r2 — V-02/V-03: every paid button and company row action shows a focus ring', () => {
  test('paid .pub-btn and #contact buttons get box-shadow: var(--focus) after the rules that reset it', () => {
    const at = CSS.indexOf('body.pub[data-side="paid"] .pub-btn:focus-visible,');
    assert.ok(at > 0);
    assert.match(CSS.slice(at, at + 200), /body\.pub-paid #contact \.pub-btn:focus-visible \{\s*outline: none;\s*box-shadow: var\(--focus\);/);
    // after the WhatsApp/on-dark resets (box-shadow: none) of the same specificity
    assert.ok(at > CSS.lastIndexOf('body.pub[data-side="paid"] .pub-btn-on-dark:hover'), 'declared after the reset');
  });

  test('company: the attention-row action has its own ring; the skip link casts no shadow until focused', () => {
    const co = read('public/assets/css/v10-company.css');
    assert.match(co, /\.co-attn-row \.k-row-trailing \.btn:focus-visible \{\s*box-shadow: 0 0 0 2px var\(--paper\), 0 0 0 4px var\(--act\);/);
    assert.ok(!/box-shadow/.test(ruleOf(co, '.co-skip')), '.co-skip at rest: no shadow (V-23)');
    assert.match(ruleOf(co, '.co-skip:focus'), /box-shadow: var\(--shadow-lg\);/);
  });
});

describe('v12 gate r2 — V-04: no filled saved-request card above the paid intake questions', () => {
  test('topCards() keeps the saved card for «خيري» only; the footer «متابعة طلب» becomes «صفحة طلبكم» for a saved /p/ page', async () => {
    assert.match(INTAKE, /function topCards\(\) \{[\s\S]*?if \(X\) return \[banner\];[\s\S]*?savedCard\(\{\s*headingLevel: 2,/);
    assert.match(INTAKE, /followSaved\(document\.querySelector\('\.lh__foot \[data-follow\]'\)\);/);
    const saved = read('public/assets/js/public/saved.js');
    assert.match(saved, /export function followSaved\(a\) \{\s*const s = readSaved\(\);\s*if \(a && s\) Object\.assign\(a, \{ href: s\.url, textContent: 'صفحة طلبكم' \}\);/);
    // readSaved() returns only a same-site /p/<token> path (PATH_RE on the pathname)
    assert.match(saved, /return PATH_RE\.test\(u\.pathname\) \? u\.pathname : null;/);
    const html = (await get('/intake?path=consultation/other')).body;
    assert.match(html, /<footer class="lh__foot" data-tag="L-04">[\s\S]*?<a href="\/portal" data-follow data-tag="L-06">متابعة طلب<\/a>/);
    assert.ok(!/lh-saved|bmf-saved|لديكم طلب لدينا/.test(mainOf(html)));
  });
});

describe('v12 gate r2 — V-05: the documents step has one filled button and a count that is not a step', () => {
  test('after the first photo the camera button is a line button; scanner buttons use the button face; counts read «صورة واحدة / صورتان / 3 صور، والحد 5»', async () => {
    assert.match(FORMS, /body\[data-side="paid"\] \.bmf-docs \.bmf-pick:not\(\[data-count="0"\]\) \.bmf-pick-camera,[\s\S]*?\{\s*border-color: var\(--ink\);\s*background: none;\s*color: var\(--ink\);\s*font-size: 16px;/);
    assert.match(FORMS, /body\[data-side="paid"\] \.bmf-pick \.scn-btn \{\s*font: 600 16px\/1\.2 var\(--f-ui\);/);
    assert.match(INTAKE, /h\('section\.bmf-step\.bmf-docs'/);
    assert.match(INTAKE, /count\.textContent = k \? fill\(COPY\[k < 3 \? `photos\$\{k\}` : 'photosN'\], \{ n: k, max: MAX_PHOTOS \}\) : '';/);
    assert.ok(!/\$\{k\} \$\{COPY\.of\} \$\{MAX_PHOTOS\}/.test(INTAKE), 'no «2 من 5» under «4 من 5»');
    const { COPY: copy } = JSON.parse(/<script type="application\/json" id="bm-copy">([\s\S]*?)<\/script>/.exec((await get('/intake?path=consultation/family/inheritance')).body)[1]);
    assert.equal(copy.photos1, 'صورة واحدة');
    assert.equal(copy.photos2, 'صورتان');
    assert.equal(copy.photosN, '{n} صور، والحد {max}');
  });
});

describe('v12 gate r2 — V-06: /data-deletion speaks in the plural on the paid side and is unchanged for «خيري»', () => {
  test('paid /data-deletion: no singular address in <main>; the charity copy still has its singular sentences', async () => {
    const paid = mainOf((await get('/data-deletion')).body);
    assert.ok(!SINGULAR.test(paid), `singular «${SINGULAR.exec(paid)?.[0]}»`);
    assert.match(paid, /طلب حذف بياناتكم/);
    assert.match(paid, /<bdi dir="ltr">Meta<\/bdi>/);
    const charity = mainOf((await get('/data-deletion?side=charity')).body);
    assert.ok(SINGULAR.test(charity), 'the charity page keeps its own voice (byte-identical hash: test/v12-gate-public.test.js K-P3)');
  });
});

describe('v12 gate r2 — V-07/V-18: one quiet header CTA, WhatsApp as a word in the menu, the footer columns on phones', () => {
  test('/services header: «ابدأوا طلبكم» is a line button (not filled), «واتساب» is a nav word (H-08) hidden on the wide nav; /p/ has the letterhead only', async () => {
    const svc = (await get('/services')).body;
    const hd = headerOf(svc);
    assert.match(hd, /class="pub-nav-link pub-nav-wa"[^>]*data-tag="H-08">واتساب<span class="pub-sr">/);
    assert.ok(!hd.includes('pub-head-contact'), 'no glyph circle beside «القائمة»');
    assert.match(firstStyle(svc), /body\.pub\[data-side="paid"\] \.pub-nav-cta\{[^}]*background:none[^}]*box-shadow:inset 0 0 0 1px var\(--ink\)/);
    assert.match(firstStyle(svc), /\.pub-nav-wa/, 'hidden on the wide nav from the first paint');
    assert.match(CSS, /body\.pub \.pub-nav-wa \{\s*display: inline-flex;/);
    const r = await t.client().post('/api/public/intake', { phone: '01055572001', segment: 'paid', description: 'مراجعة عقد شراكة قبل التوقيع مع الشريك الجديد', consent: true, consent_v: 1, submission_id: 'wgatepubr2hdr00000001' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const ph = headerOf((await get(new URL(r.body.portal_url, t.base).pathname)).body);
    assert.ok(ph.includes('class="pub-brand"'));
    assert.ok(!/pub-nav|pub-head-contact|pub-menu-toggle/.test(ph), 'letterhead only on /p/');
  });

  test('paid footer: the firm line (F-02) and the columns on every width; no «روابط مهمة» accordion and no duplicate «للتواصل:» line', async () => {
    const f = footerOf((await get('/services')).body);
    assert.match(f, /<p class="pub-footer-statement" data-tag="F-02">/);
    assert.ok(!/pub-footer-more|pub-footer-call|pub-footer-desktop|data-tag="F-15"|data-tag="F-30"/.test(f));
  });
});

describe('v12 gate r2 — V-16/V-17: one face for Latin and digits in paid text; no 700 on paid pages', () => {
  test('«Emam Latin» (Plex Latin 400, optional, digits/letters/© only) follows Plex Arabic in the paid stacks; charity stacks unchanged', async () => {
    const style = firstStyle((await get('/services')).body);
    assert.match(style, /@font-face\{font-family:"Emam Latin";font-display:optional;src:url\("\/assets\/fonts\/plex-latin-400\.woff2(?:\?v=[^"]+)?"\) format\("woff2"\);unicode-range:U\+0030-0039,U\+0041-005A,U\+0061-007A,U\+00A9\}/);
    assert.match(style, /:root:has\(>body\[data-side="paid"\]\)\{--pub-font:"IBM Plex Sans Arabic","Emam Latin","Noto Sans Arabic",Tahoma,sans-serif;--f-ui:"IBM Plex Sans Arabic","Emam Latin","Segoe UI",Tahoma,sans-serif\}/);
    assert.ok(!/U\+0021-007E[^}]*Emam Latin|Emam Latin[^}]*U\+0021-007E/.test(style), 'no punctuation in the range (a «(…)» on / fetches nothing)');
    assert.match(read('public/assets/css/v91-portal.css'), /body\[data-side="paid"\] \.bp-code \{\s*font-family: var\(--f-ui\);/);
  });

  test('paid summary links and the success reference render 600, not 700', () => {
    assert.match(FORMS, /body\[data-side="paid"\] \.bmf-ref \{\s*color: var\(--ink\);\s*font-weight: 600;/);
    // in the :legal critical block (the only pages with «بالمختصر»), so '/' and /services do not inline legal selectors
    const legal = CSS.slice(CSS.indexOf('/* @critical-start:legal'), CSS.indexOf('/* @critical-end */', CSS.indexOf('/* @critical-start:legal')));
    assert.match(legal, /body\.pub\[data-side="paid"\] \.pub-summary a \{\s*font-weight: 600;/);
    assert.ok(!CSS.slice(0, CSS.indexOf('/* @critical-end:general */')).includes('.pub-summary'), 'not in the general block');
  });

  test('paid /data-deletion: the «بالمختصر» links are 600 in the inlined CSS (no Plex 700 request)', async () => {
    const style = firstStyle((await get('/data-deletion')).body);
    assert.match(style, /body\.pub\[data-side="paid"\] \.pub-summary a\{font-weight:600\}/);
  });
});

describe('v12 gate r2 — V-19: the paid 404 has one filled button and a plain heading', () => {
  test('paid: «متابعة طلب» filled, «طلب جديد» and «الصفحة الأولى» text links, «اختاروا ما تريدون:»; charity keeps its outline buttons', async () => {
    const nf = mainOf((await get('/no-such-page-r2')).body);
    assert.equal((nf.match(/class="pub-btn[ "]/g) || []).length, 1, 'one button');
    assert.equal((nf.match(/class="pub-nf-link"/g) || []).length, 2, 'two text links');
    assert.ok(nf.includes('اختاروا ما تريدون:'));
    assert.ok(!/ماذا تريد|تريد أن/.test(nf), 'no rhetorical question');
    assert.match(ruleOf(CSS, 'body.pub[data-side="paid"] .pub-nf-link'), /min-height: 44px;/);
    t.app.settings.set('charity_public', true);
    try {
      const html = (await get('/no-such-page-r2', { cookie: 'bm_seg=charity' })).body;
      assert.match(html, /<body[^>]*data-side="charity"/);
      const ch = mainOf(html);
      assert.ok(!ch.includes('pub-nf-link'), 'charity 404 unchanged');
      assert.match(ch, /class="pub-btn pub-btn-outline"/);
    } finally {
      t.app.settings.set('charity_public', false);
    }
  });
});

describe('v12 gate r2 — V-20/JR-15: the archived «خيري» notice', () => {
  test('blocks inside .pub-container are spaced 20 px', () => {
    assert.match(ruleOf(CSS, '.kh-paused main .pub-container > * + *'), /margin-block-start: 20px;/);
  });

  test('without a «خيري» WhatsApp number the notice still offers a way to reach «خيري» (a call button with the organisation phone)', async () => {
    const withWa = (await get('/khayri')).body;
    assert.match(withWa, /<a class="pub-btn pub-btn-whatsapp" href="https:\/\/wa\.me\/\d+\?text=[^"]+" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" data-tag="KH-02">واتساب «خيري»/);
    const wa = t.app.whatsapp;
    const orig = wa.publicDigits;
    wa.publicDigits = () => '';
    try {
      const kh = (await get('/khayri')).body;
      const a = /<a class="pub-btn pub-btn-teal" href="tel:[^"]+" data-tag="KH-02">اتصال بـ«خيري» <bdi dir="ltr">[^<]+<\/bdi><\/a>/.exec(kh);
      assert.ok(a, 'a tel: button');
      assert.ok(!kh.includes('wa.me/'), 'no WhatsApp link without a number');
      assert.equal((kh.match(/data-tag="KH-02"/g) || []).length, 1);
    } finally {
      wa.publicDigits = orig;
    }
  });
});

describe('v12 gate r2 — V-21/JR-10: the success screen', () => {
  test('I-66 is the single «الصفحة الأولى» link (the footer already has «عن المكتب»); text actions start-aligned', () => {
    assert.match(INTAKE, /h\('p\.lh__links', \{ tag: 'I-66' \}, h\('a', \{ href: '\/' \}, COPY\.home1\)\)/);
    assert.ok(!/COPY\.aboutUs/.test(INTAKE));
    assert.match(ruleOf(CSS, '.lh .bmf-actions > .btn--text'), /justify-self: start;/);
  });
});

describe('v12 gate r2 — V-22: /p/ and /portal copy details', () => {
  test('wordClip cuts at a word boundary and drops trailing punctuation', () => {
    const s = 'نراجع العقد وفق ما اتفقنا عليه في الاجتماع السابق، ونرسل لكم ملاحظاتنا على البنود الخاصة بالتجديد والإنهاء والغرامات';
    const c = wordClip(s, 80);
    assert.ok(c.endsWith('…'));
    const body = c.slice(0, -1);
    assert.ok(s.startsWith(body));
    assert.ok(s[body.length] === ' ' || s[body.length] === '،', `cut at a word end: «${body.slice(-12)}»`);
    assert.equal(wordClip('قصير', 80), 'قصير');
    assert.equal(wordClip('كلمة، أخرى طويلة جدًا', 7), 'كلمة…');
  });

  test('the messages count agrees in number; one phone placeholder format', () => {
    const portal = read('public/assets/js/public/portal.js');
    assert.match(portal, /const freshWords = \(n\) => \(!PC \? `\$\{n\} جديدة` : \[, 'رسالة جديدة', 'رسالتان جديدتان'\]\[n\] \|\| `\$\{n\} \$\{n < 11 \? 'رسائل' : 'رسالة'\} جديدة`\);/);
    assert.match(portal, /pill\(freshWords\(fresh\), 'ok'\)/);
    assert.match(read('public/assets/js/public/portal-login.js'), /placeholder: '01xxxxxxxxx'/);
    assert.ok(!/01XXXXXXXXX/.test(read('public/assets/js/public/portal-login.js')));
  });
});

describe('v12 gate r2 — V-23: no dashes in company portal copy', () => {
  test('meta business hours read «من السبت إلى الخميس، من 10 ص إلى 4 م»; the new-request title and the select placeholders have no dash', async () => {
    const meta = await (await fetch(`${t.base}/api/company/meta`)).json();
    assert.ok(!/[—–]/.test(meta.business_hours_text), meta.business_hours_text);
    assert.match(meta.business_hours_text, /^من .+ إلى .+، من .+ إلى .+ بتوقيت القاهرة$/);
    assert.match(read('public/assets/js/company/pages/new-request.js'), /ctx\.setTitle\(`\$\{N\.title\}: \$\{t\.company_label\}`\)/);
    for (const f of ['public/assets/js/company/pages/new-request.js', 'public/assets/js/lib/company-forms.js']) assert.ok(!/— اختاروا —/.test(read(f)), f);
    assert.match(read('public/assets/js/lib/company-forms.js'), /PLACEHOLDER = 'اختاروا'/);
  });
});

describe('v12 gate r2 — JR-07/JR-08/JR-14: hover on pointers only, specific document hints, one tag per field', () => {
  test('option rows highlight on hover only where hover exists', () => {
    const i = CSS.indexOf('  .opt:hover {');
    assert.ok(i > 0);
    const before = CSS.slice(0, i);
    assert.ok(before.lastIndexOf('@media (hover: hover) {') > before.lastIndexOf('\n}\n'), '.opt:hover inside @media (hover: hover)');
    assert.ok(!/^\.opt:hover/m.test(CSS), 'no top-level .opt:hover');
  });

  test('inheritance and new-company leaves name their own documents on the documents step', () => {
    const leaves = allLeaves();
    const inh = leaves.find((l) => l.path === 'consultation/family/inheritance');
    assert.equal(inh.docs_sub, 'إعلام الوراثة أو شهادة الوفاة أو أي ورقة تخص التركة.');
    for (const l of leaves.filter((x) => x.path.startsWith('company/new/'))) assert.equal(l.docs_sub, 'بطاقات الشركاء أو أي ورقة تخص الشركة.', l.path);
  });

  test('company lead: five distinct field tags and separate chip tags for size and needs', () => {
    const src = read('public/assets/js/public/intake-company.js');
    const fieldTags = [...src.matchAll(/input\(\{[^}]*\}, '(IC-\d+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(fieldTags, ['IC-18', 'IC-26', 'IC-27', 'IC-28', 'IC-29']);
    assert.match(src, /const size = chips\(SIZES, false, 'IC-17'\);/);
    assert.match(src, /const needs = chips\(NEEDS, true, 'IC-30'\);/);
  });
});
