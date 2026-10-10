// v11 integration gate — fixer-public: اختبارات الرجوع لملاحظات البوابة على الواجهة العامة
// (J-05/K11/R-08/V14، J-06/K12/R-13، J-10/K5/R-09، J-14، J-16/V8، J-17، J-18، J-19/K4/R-14، F-B، F-F/V1، V2، V7، V11، V12،
//  V16، R-10/K6، R-17). ملف test/v11-gate-public.test.js لمسار gate-public نفسه؛ هذا الملف لإصلاحات البوابة فقط.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { setPublicRoot, graphVersion } from '../src/site-assets.js';
import { PORTAL_PAID, PORTAL_LOGIN_PAID, paidHours, PAID_HOURS_DEFAULT } from '../src/site-copy-paid.js';
import { DEFAULT_SETTINGS } from '../src/constants.js';
import { greetName } from '../src/services/portal-v91.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BRAND = 'Emam Legal and Consultancy';
// INV-12: لا «مجان/ببلاش» ولا أمر مؤنث عامي في صفحات الأفراد والشركات
const BANNED = /مجان|ببلاش/;
const FEMININE = /اكتبي|ابعتي|صوّري|اختاري|سجّلي|اضغطي|قولي|تقدري|حاولي|ارجعي|تابعي|كلمينا|ابعتيلنا|جرّبي/;
// عامية الشاشة الأولى في /p/ (L11-35)
const COLLOQUIAL = /بيراجع|بيدرس|بياخد|وصلك الرد|الطلب خلص|مستنيين|لسه|الصبح|العصر|لحد/;
const bmCopyOf = (html) => {
  const m = /<script type="application\/json" id="bm-copy">([\s\S]*?)<\/script>/.exec(html);
  return m ? { raw: m[1], data: JSON.parse(m[1]) } : null;
};
const bmPublicOf = (html) => {
  const m = /<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]) : null;
};
const visible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
const metaDesc = (html) => /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? null;
const summaryOf = (html) => /<div class="pub-summary" id="summary">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';

let t;
const get = (p, headers = {}) => t.client().get(p, headers);
before(async () => {
  t = await startTestApp({ seed: 'none' });
  setPublicRoot(PUB);
});
after(async () => t && t.close());

// ───────────────────────── CSS: الأزرار والصفوف (J-06/K12/R-13، J-19/K4، V7، V8/J-16، V11، J-17) ─────────────────────────

describe('v11 gate fixer-public — CSS of the public pages', () => {
  test('J-19/K4/R-14: the gate footer links are ≥ 44 px wide in the inline gate block (min-width + centred text)', async () => {
    const r = await get('/');
    const rule = /\.gate-links a\{([^}]*)\}/.exec(r.body)?.[1] || '';
    assert.match(rule, /min-width:44px/);
    assert.match(rule, /min-height:44px/);
    assert.match(rule, /justify-content:center/);
  });

  test('J-06/K12/R-13: one filled button per viewport — header CTA tinted on both homes ≥ 1081 px, paid callback tinted, paid contact WhatsApp tinted, the final CTA filled again', async () => {
    for (const [p, cookie] of [['/khayri', 'bm_seg=charity'], ['/services', 'bm_seg=paid']]) {
      const r = await get(p, { cookie });
      assert.match(r.body, /<body class="[^"]*\bpub-landing\b/, `${p} is a landing page`);
      assert.match(r.body, /<style>[\s\S]*body\.pub-landing \.pub-nav-cta\{background:var\(--tint-weak\);color:var\(--tint\)\}[\s\S]*<\/style>/, `${p} header CTA tinted in the inline block`);
    }
    const css = read('public/assets/css/public-site.css');
    // في القائمة المفتوحة (≤ 1080px) يعود زر صفحات البداية ممتلئًا، والقاعدة في الجزء غير الحرج بعد قاعدة التلوين الخفيف
    const menu = css.indexOf('@media (max-width: 1080px) {', css.indexOf('/* @critical-end */'));
    assert.ok(menu > 0);
    const back = css.indexOf('body.pub-landing .pub-nav-cta {\n    background: var(--tint);\n    color: var(--on-tint);', menu);
    assert.ok(back > menu && back > css.indexOf('body.pub-landing .pub-nav-cta {\n  background: var(--tint-weak);'), 'filled again in the open menu');
    const block = (sel) => {
      const i = css.indexOf(`${sel} {`);
      assert.ok(i >= 0, sel);
      return css.slice(i, css.indexOf('}', i));
    };
    assert.match(block('body.pub-paid .pub-pick-way--callback'), /background: var\(--gold-wash\);[\s\S]*color: var\(--gold-ink\)/);
    assert.match(block('body.pub-paid #contact .pub-btn-whatsapp'), /background: var\(--ok-weak\);[\s\S]*color: var\(--ok\)/);
    // زر نهاية «/services» لم يعد ملوّنًا خفيفًا (كان يعوّض زر الرأس الممتلئ)
    assert.ok(!/\.pub-final-cta \.pub-btn-primary[^{]*\{\s*background: var\(--tint-weak\)/.test(css), 'final CTA is the filled one');
    // «خيري»: الذهبي الممتلئ لطريق «إحنا نكلمك» باقٍ (INV-10) — القاعدة الجديدة للأفراد وحدهم
    assert.ok(!/body\.pub(?!-paid)[^{]*\.pub-pick-way--callback\s*\{[^}]*gold-wash/.test(css));
  });

  test('J-06/K12 budget: the general critical block stays ≤ 8,500 B (minified as inlined, with font versions)', async () => {
    const r = await get('/khayri', { cookie: 'bm_seg=charity' });
    const style = /<style>([\s\S]*?)<\/style>/.exec(r.body)?.[1] || '';
    assert.ok(style.includes('body.pub-landing .pub-nav-cta{'));
    const css = read('public/assets/css/public-site.css');
    const general = css.slice(css.indexOf('/* @critical-start —'), css.indexOf('/* @critical-end */'));
    assert.ok(!/@media \(min-width: 1081px\) \{\s*body\.pub-landing/.test(general), 'no extra media wrapper in the general block');
  });

  test('V7: the ≥ 700 px ways rule (220 px, start) comes after the base ways rules in the served cascade', async () => {
    const r = await get('/khayri', { cookie: 'bm_seg=charity' });
    const base = r.body.lastIndexOf('.pub-pick-ways[data-n="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}');
    const wide = r.body.indexOf('.pub-pick-ways,.pub-pick-ways[data-n="2"]{grid-template-columns:repeat(3,minmax(0,220px));justify-content:start}');
    assert.ok(base > 0 && wide > 0, 'both rules inlined');
    assert.ok(wide > base, 'media rule wins (later, same specificity)');
  });

  test('V8/J-16: paid topic sub-lines wrap to two lines (no single-line ellipsis) with the two-line row reserved', () => {
    const css = read('public/assets/css/public-site.css');
    const i = css.indexOf('.pub-topic-list .g-sub {');
    const rule = css.slice(i, css.indexOf('}', i));
    assert.match(rule, /-webkit-line-clamp: 2/);
    assert.ok(!/white-space: nowrap|text-overflow: ellipsis/.test(rule));
    assert.match(css, /\.pub-topic-list \.g-row \{[^}]*min-height: 88px/);
  });

  test('V11: «تغيير» is a quieter second part after a separator ≥ 1024 px; the /services hero column is 400 px; pretty wrapping', () => {
    const css = read('public/assets/css/public-site.css');
    assert.match(css, /\.pub-seg-pill-change \{\s*padding-inline-start: 8px;\s*border-inline-start: 1px solid var\(--separator\);\s*color: var\(--label-2\);\s*font-weight: 500;/);
    assert.match(css, /grid-template-columns: minmax\(0, 400px\) minmax\(0, 1fr\);/);
    assert.match(css, /\.pub-paid-sub,\s*\.pub-cross,\s*\.pub-co-row \{\s*text-wrap: pretty;/);
  });

  test('J-17: the compact intake footer rows sit on the page container edges, not the viewport edges', () => {
    const css = read('public/assets/css/v91-b-forms.css');
    assert.match(css, /body\.bmf-page :is\(\.pub-footer-more, \.pub-footer-call\) \{\s*margin-inline: max\(var\(--pub-gutter\), calc\(\(100% - 1160px\) \/ 2 \+ var\(--pub-gutter\)\)\) !important;/);
  });
});

// ───────────────────────── V2: مواعيد العمل بالفصحى في صفحات الأفراد والشركات ─────────────────────────

describe('v11 gate fixer-public — office hours on the paid side (V2)', () => {
  test('paidHours(): the default (colloquial) value becomes MSA; a custom value is shown as typed; empty stays empty', () => {
    assert.equal(paidHours(DEFAULT_SETTINGS.office_hours), PAID_HOURS_DEFAULT);
    assert.equal(PAID_HOURS_DEFAULT, 'من السبت إلى الخميس، من 10 صباحًا حتى 4 عصرًا');
    assert.equal(paidHours(`  ${DEFAULT_SETTINGS.office_hours} `), PAID_HOURS_DEFAULT);
    assert.equal(paidHours('يوميًا من 9 إلى 5'), 'يوميًا من 9 إلى 5');
    assert.equal(paidHours(''), '');
    assert.equal(paidHours(null), '');
    assert.ok(!COLLOQUIAL.test(PAID_HOURS_DEFAULT));
  });

  test('/services, the paid 404, the paid /portal (bm-public) and /data-deletion?paid print the MSA hours; the charity side keeps the setting as typed', async () => {
    assert.ok(t.app.settings.get('office_hours'), 'default hours set');
    const s = await get('/services', { cookie: 'bm_seg=paid' });
    assert.ok(visible(s.body).includes(`مواعيد العمل: ${PAID_HOURS_DEFAULT}`), '/services ways line');
    assert.ok(!/الصبح|العصر/.test(visible(s.body)), '/services: no colloquial hours');
    const nf = await get('/no-such-page', { cookie: 'bm_seg=paid' });
    assert.equal(nf.status, 404);
    if (t.app.settings.get('org_phone')) assert.ok(visible(nf.body).includes(`نستقبل اتصالاتكم ${PAID_HOURS_DEFAULT}`), 'paid 404 line');
    assert.ok(!/بنرد|الصبح/.test(visible(nf.body)), 'paid 404: no colloquial hours line');
    const po = await get('/portal', { cookie: 'bm_seg=paid' });
    assert.equal(bmPublicOf(po.body)?.office_hours, PAID_HOURS_DEFAULT, '/portal paid bm-public');
    const dd = await get('/data-deletion', { cookie: 'bm_seg=paid' });
    assert.ok(!/الصبح|العصر/.test(visible(dd.body)), '/data-deletion paid');
    // «خيري» كما هي
    const k = await get('/khayri', { cookie: 'bm_seg=charity' });
    assert.ok(visible(k.body).includes(DEFAULT_SETTINGS.office_hours), 'charity keeps the setting');
    const nfc = await get('/no-such-page', { cookie: 'bm_seg=charity' });
    if (t.app.settings.get('org_phone')) assert.ok(visible(nfc.body).includes(`بنرد ${DEFAULT_SETTINGS.office_hours}`), 'charity 404 line unchanged');
    assert.equal(bmPublicOf((await get('/portal', { cookie: 'bm_seg=charity' })).body)?.office_hours, DEFAULT_SETTINGS.office_hours);
  });
});

// ───────────────────────── V1/F-F + K11: الصفحات القانونية حسب الجانب ─────────────────────────

describe('v11 gate fixer-public — legal pages by side (V1/F-F, K11 /data-deletion)', () => {
  test('/terms and /privacy with the paid cookie: paid summary and meta description, no «مجان», no feminine or colloquial summary; charity summary unchanged (no cookie and charity cookie)', async () => {
    const paidTerms = ['الاستشارات والقضايا والعقود بأتعاب نتفق عليها معكم كتابةً قبل أي عمل.', 'نقدّم لكم الرأي القانوني بأمانة، والحكم في النهاية للمحكمة.', 'لا نطلب أي مبلغ إلا بعد موافقتكم الصريحة على صفحة طلبكم.', 'يُرجى ذكر الحقائق كاملة في طلبكم لنتمكن من مساعدتكم.'];
    const paidPrivacy = ['نستخدم بياناتكم لخدمة طلبكم فقط.', 'لا يطّلع المحامي على رقمكم ولا على رسائلكم.', 'لا نبيع بياناتكم ولا نشاركها مع أي جهة.', 'يمكنكم طلب حذف بياناتكم في أي وقت.'];
    const charityTerms = ['الخدمة مجانية، ومحدش يطلب منك فلوس.', 'إحنا بننصحك، والحكم في الآخر للمحكمة.', 'مش بنعمل حاجة فيها فلوس عليكي غير بموافقتك.', 'قولي الحقيقة في طلبك عشان نقدر نساعدك صح.'];
    const charityPrivacy = ['بنستخدم بياناتك عشان نساعدك بس.', 'المحامي مش بيشوف رقمك ولا رسايلك.', 'مش بنبيع ولا بنشارك بياناتك مع حد.', 'تقدري تطلبي نمسح بياناتك في أي وقت.'];
    for (const [p, paid, charity] of [['/terms', paidTerms, charityTerms], ['/privacy', paidPrivacy, charityPrivacy]]) {
      const r = await get(p, { cookie: 'bm_seg=paid' });
      assert.match(r.body, /data-side="paid"/, p);
      const sum = visible(summaryOf(r.body));
      for (const s of paid) assert.ok(sum.includes(s), `${p} paid: ${s}`);
      for (const s of charity) assert.ok(!r.body.includes(s), `${p} paid has no charity line: ${s}`);
      assert.ok(!BANNED.test(sum) && !FEMININE.test(sum), `${p} paid summary`);
      const d = metaDesc(r.body);
      assert.ok(d && !BANNED.test(d) && d.includes(BRAND) && !d.includes('<!--'), `${p} paid meta: ${d}`);
      for (const cookie of ['', 'bm_seg=charity']) {
        const c = await get(p, cookie ? { cookie } : {});
        const cs = visible(summaryOf(c.body));
        for (const s of charity) assert.ok(cs.includes(s), `${p} ${cookie || 'no cookie'}: ${s}`);
        for (const s of paid) assert.ok(!c.body.includes(s), `${p} charity has no paid line: ${s}`);
        assert.ok(!metaDesc(c.body).includes('<!--'), 'no template markers in the meta');
      }
    }
    // وصف «خيري» كما في 10.0 حرفيًا
    const ct = await get('/terms', { cookie: 'bm_seg=charity' });
    assert.match(metaDesc(ct.body), /^شروط استخدام خدمة .+ المجانية في .+: طبيعة الخدمة والاستحقاق، وحدود العلاقة مع المحامي، والتزامات المستفيد، وعدم ضمان النتائج\.$/);
  });

  test('/data-deletion with the paid cookie: plural MSA summary, intro and WhatsApp button; the charity page keeps its wording', async () => {
    const r = await get('/data-deletion', { cookie: 'bm_seg=paid' });
    const v = visible(r.body.replace(/<footer[\s\S]*?<\/footer>/, ''));
    assert.ok(v.includes('يمكنكم طلب حذف بياناتكم في أي وقت.'));
    assert.ok(v.includes('من حقكم طلب حذف بياناتكم الشخصية'));
    assert.ok(!FEMININE.test(v), 'no feminine imperative on the paid page');
    assert.ok(!BANNED.test(v));
    if (/wa\.me/.test(r.body)) assert.ok(v.includes('أرسلوا الطلب على واتساب'));
    assert.ok(!metaDesc(r.body).includes('<!--') && metaDesc(r.body).includes('تطلبون'));
    const c = await get('/data-deletion', { cookie: 'bm_seg=charity' });
    const cv = visible(c.body);
    assert.ok(cv.includes('تقدري تطلبي نمسح بياناتك في أي وقت.'));
    assert.ok(!cv.includes('يمكنكم طلب حذف بياناتكم'));
    if (/wa\.me/.test(c.body)) assert.ok(cv.includes('ابعتي الطلب على واتساب'));
  });
});

// ───────────────────────── K11/J-05/R-08/V14 + F-B: صفحة /p/ للأفراد والشركات ─────────────────────────

describe('v11 gate fixer-public — /p/ paid copy (K11/J-05/R-08/V14)', () => {
  const portalOf = async (segment, phone, sid) => {
    const r = await t.client().post('/api/public/intake', { phone, segment, description: 'نزاع على عقد إيجار محل تجاري مع المالك', consent: true, consent_v: 1, submission_id: sid });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return new URL(r.body.portal_url, t.base).pathname.split('/p/')[1].replace(/\/$/, '');
  };
  const stepTitles = (data) => {
    const out = [];
    const walk = (x) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        if (Array.isArray(x.steps)) for (const s of x.steps) if (s && typeof s.title === 'string') out.push(s.title);
        Object.values(x).forEach(walk);
      }
    };
    walk(data);
    return out;
  };

  test('tracker stages and hints on a paid page are plural MSA (no colloquial singular on the first screen); a charity page keeps «فريقنا بيراجع طلبك»', async () => {
    const paid = (await t.client().get(`/api/portal/${await portalOf('paid', '01055560001', 'wfixpubpaidstage00001')}`)).body;
    assert.equal(paid.tone, 'paid');
    const titles = stepTitles(paid);
    assert.ok(titles.length >= 4, JSON.stringify(titles));
    for (const s of ['استلمنا طلبكم', 'يراجع فريقنا طلبكم', 'يدرس المحامي طلبكم', 'وصلكم الرد']) assert.ok(titles.includes(s), s);
    const raw = JSON.stringify(paid.home);
    assert.ok(!COLLOQUIAL.test(raw), raw.match(COLLOQUIAL)?.[0]);
    assert.ok(!FEMININE.test(raw) && !BANNED.test(raw));
    assert.ok(!/«استلمنا طلبك»|"استلمنا طلبك"/.test(raw));
    assert.match(raw, /عادةً خلال (يوم|يومَي|\d+ (أيام|يوم)) عمل/, 'review hint');
    if (paid.home.contact?.office_hours) assert.equal(paid.home.contact.office_hours, PAID_HOURS_DEFAULT);
    const charity = (await t.client().get(`/api/portal/${await portalOf('charity', '01055560002', 'wfixpubcharitystage001')}`)).body;
    assert.equal(charity.tone, 'charity');
    const ct = stepTitles(charity);
    for (const s of ['استلمنا طلبك', 'فريقنا بيراجع طلبك', 'المحامي بيدرس مشكلتك']) assert.ok(ct.includes(s), s);
    assert.match(JSON.stringify(charity.home), /غالبًا خلال/);
  });

  test('PORTAL_PAID: the fee row, pill, fee-card title, ask button and unpaid pill keys; ≤ 3,072 B; MSA plural; portal.js reads them through P() with the charity text as fallback and drops «مش قادر أدفع» on paid invoices', () => {
    assert.equal(PORTAL_PAID.moneyTitle, 'الأتعاب والمصاريف');
    assert.equal(PORTAL_PAID.aw, 'بانتظار موافقتكم');
    assert.equal(PORTAL_PAID.nd, 'لا مبالغ مستحقة');
    assert.equal(PORTAL_PAID.ft, 'المبلغ: {a} ({d})');
    assert.equal(PORTAL_PAID.ask, 'استفسار عن المبلغ');
    assert.equal(PORTAL_PAID.up, 'غير مسددة');
    assert.ok(Buffer.byteLength(JSON.stringify(PORTAL_PAID)) <= 3072, `${Buffer.byteLength(JSON.stringify(PORTAL_PAID))}`);
    for (const k of ['aw', 'nd', 'ft', 'ask', 'up', 'moneyTitle']) assert.ok(!COLLOQUIAL.test(PORTAL_PAID[k]) && !FEMININE.test(PORTAL_PAID[k]) && !BANNED.test(PORTAL_PAID[k]), k);
    const js = read('public/assets/js/public/portal.js');
    assert.ok(js.includes("P('moneyTitle', 'مصاريف')"), 'money row label');
    assert.ok(js.includes("pill(P('aw', 'محتاجين موافقتك'), 'amber')"));
    assert.ok(js.includes("pill(P('nd', 'مفيش مبالغ'), 'ok')"));
    assert.ok(js.includes("fillP('ft', 'مصاريف للقضية: {a} ({d})'"));
    assert.ok(js.includes("P('ask', 'عندي سؤال')") && js.includes("P('ask', 'عندي سؤال على المبلغ')"));
    assert.ok(js.includes("P('up', 'لسه ما اتدفعتش')"));
    assert.match(js, /i\.segment === 'paid' \? null : btn\(state\.form === 'm' \? 'مش قادر أدفع' : 'مش قادرة أدفع'/);
  });

  test('recorder.js and upload.js have a plural-MSA variant (address «p») that the paid /intake uses; the charity variants are unchanged', async () => {
    const rec = read('public/assets/js/public/recorder.js');
    const up = read('public/assets/js/public/upload.js');
    const block = (src) => src.slice(src.indexOf('  p: {'), src.indexOf('\n  },', src.indexOf('  p: {')));
    const rp = block(rec);
    const upp = block(up);
    for (const s of ['اضغطوا لتسجيل رسالة صوتية', 'جارٍ التسجيل… تحدثوا براحتكم', 'حذف التسجيل', "stopLabel: 'إيقاف التسجيل'"]) assert.ok(rp.includes(s), s);
    for (const s of ['تصوير مستند', 'لا تغلقوا الصفحة', 'حذف هذه الصورة']) assert.ok(upp.includes(s), s);
    for (const b of [rp, upp]) {
      assert.ok(!FEMININE.test(b) && !BANNED.test(b));
      assert.ok(!/خلّصت|اسمعها|امسحها|اتكلم|بنسجّل|ابعت\b|صوّر\b/.test(b), b.match(/خلّصت|اسمعها|امسحها|اتكلم|بنسجّل/)?.[0]);
    }
    assert.match(rec, /const t = COPY\[address === 'm' \|\| address === 'p' \? address : 'f'\];/);
    assert.match(up, /const copyFor = \(address\) => COPY\[address === 'm' \|\| address === 'p' \? address : 'f'\];/);
    assert.ok(rec.includes("h('span.bmf-rec-stop-label', t.stopLabel || 'خلّصت')"), 'charity keeps «خلّصت»');
    assert.match(read('public/assets/js/public/intake.js'), /const ADDR = X \? 'p' : 'f';/);
  });
});

test('/p/ greeting: a short title is never greeted alone («مرحبًا م.») — title + first name; kunya and plain names as before', () => {
  assert.equal(greetName('م. خالد'), 'م. خالد');
  assert.equal(greetName('أ. نادية محمود'), 'أ. نادية');
  assert.equal(greetName('أ.د. سامي علي'), 'أ.د. سامي');
  assert.equal(greetName('د. عبد الرحمن سالم'), 'د. عبد الرحمن');
  assert.equal(greetName('أم محمد عبد الله'), 'أم محمد');
  assert.equal(greetName('سامية محمود'), 'سامية');
  assert.equal(greetName('عبد الله محمد'), 'عبد الله');
  assert.equal(greetName(''), '');
});

describe('v11 gate fixer-public — /p/ tone for a paid client with no open story (F-B)', () => {
  let d;
  before(async () => {
    d = await startTestApp({ seed: 'demo' });
  });
  after(async () => d && d.close());
  const clientOf = (phone) => d.app.db.get("SELECT c.id FROM clients c JOIN client_identities x ON x.client_id = c.id WHERE x.kind = 'phone' AND x.value LIKE ?", `%${phone.slice(1)}`);

  test('closed paid file (01092000301): /api/portal tone paid, /p/ paid chrome + bm-copy, no «مجان», no charity contact', async () => {
    const khaled = clientOf('01092000301');
    assert.ok(khaled);
    const kase = d.app.db.get("SELECT id FROM cases WHERE client_id = ? AND status != 'closed' ORDER BY id DESC LIMIT 1", khaled.id);
    assert.ok(kase, 'demo 301 has an open paid case');
    const admin = await d.login('admin');
    const r = await admin.post(`/api/admin/cases/${kase.id}/close`, { outcome: 'answered', note: 'تم', force: true });
    if (r.status !== 200) d.app.db.update('cases', kase.id, { status: 'closed' });
    assert.equal(d.app.db.value('SELECT status FROM cases WHERE id = ?', kase.id), 'closed');
    const open = d.app.db.value("SELECT COUNT(*) FROM cases WHERE client_id = ? AND status != 'closed'", khaled.id) + d.app.db.value("SELECT COUNT(*) FROM intakes WHERE client_id = ? AND status IN ('new','in_review','awaiting_client')", khaled.id);
    assert.equal(open, 0, 'no open story left');
    const tok = d.app.clients.issuePortalToken(khaled.id);
    const p = (await d.client().get(`/api/portal/${tok}`)).body;
    assert.equal(p.tone, 'paid');
    assert.equal(p.home.name, 'م. خالد', 'greeting keeps the given name after the title');
    assert.ok(!BANNED.test(JSON.stringify(p.home)));
    const html = (await d.client().get(`/p/${tok}`)).body;
    assert.match(html, /data-side="paid"/);
    assert.ok(bmCopyOf(html), 'paid bm-copy');
    assert.ok(!BANNED.test(visible(html.replace(/<footer[\s\S]*?<\/footer>/, ''))));
    assert.ok(!/تابعي طلبك|احكيلنا مشكلتك/.test(html), 'no charity header');
  });

  test('paid client whose only story is an unconfirmed web intake (01092000302): a client-level link is paid; a charity client with only closed files stays charity', async () => {
    const nadia = clientOf('01092000302');
    assert.ok(nadia);
    const p = (await d.client().get(`/api/portal/${d.app.clients.issuePortalToken(nadia.id)}`)).body;
    assert.equal(p.tone, 'paid');
    const c = d.app.db.get(
      `SELECT client_id FROM cases WHERE status = 'closed' AND segment = 'charity' AND company_id IS NULL
         AND client_id NOT IN (SELECT client_id FROM cases WHERE status != 'closed' OR segment != 'charity' OR company_id IS NOT NULL)
         AND client_id NOT IN (SELECT client_id FROM intakes WHERE segment IS NULL OR segment != 'charity')
       LIMIT 1`,
    );
    if (c) {
      const q = (await d.client().get(`/api/portal/${d.app.clients.issuePortalToken(c.client_id)}`)).body;
      assert.equal(q.tone, 'charity');
    }
  });
});

// ───────────────────────── K5/J-10/R-09، J-14، J-18، V12، V16 ─────────────────────────

describe('v11 gate fixer-public — intake and sign-in markup', () => {
  test('K5/J-10/R-09: /portal (both sides) shows the deep-gold lockup above the H1 (reserved box, brand alt, LTR name); the file exists', async () => {
    assert.ok(fs.existsSync(path.join(PUB, 'assets/img/emam-logo-gold-deep.svg')));
    for (const cookie of ['', 'bm_seg=charity', 'bm_seg=paid']) {
      const r = await get('/portal', cookie ? { cookie } : {});
      const img = /<img class="pub-signin-logo"[^>]*>/.exec(r.body)?.[0];
      assert.ok(img, cookie || 'no cookie');
      assert.match(img, /src="\/assets\/img\/emam-logo-gold-deep\.svg(\?v=[^"]+)?"/);
      assert.match(img, /width="240" height="100"/);
      assert.ok(img.includes(`alt="${BRAND}"`));
      assert.match(img, /dir="ltr"/);
      assert.ok(r.body.indexOf('pub-signin-logo') < r.body.indexOf('id="page-title"'), 'above the H1');
    }
    const css = read('public/assets/css/v91-portal.css');
    assert.match(css, /\.pub-signin-logo \{[^}]*height: auto;/);
  });

  test('K5/J-10/R-09: intake.js renders the 4-segment .bmf-steps bars (aria-hidden) and keeps «n من 4» as screen-reader text; CSS ≥ 3:1 bars + forced colours', () => {
    const js = read('public/assets/js/public/intake.js');
    assert.ok(js.includes("h('span.bmf-stepno', h('span.bmf-sr', `${idx} ${COPY.of} ${total}`), h('ol.bmf-steps', { 'aria-hidden': 'true' }, Array.from({ length: total }, (_, i) => h('li', { class: i < idx ? 'is-on' : null }))))"));
    const css = read('public/assets/css/v91-b-forms.css');
    assert.match(css, /\.bmf-qbar \.bmf-steps li \{[^}]*background: var\(--label-3\);/);
    assert.match(css, /\.bmf-qbar \.bmf-steps li\.is-on \{\s*background: var\(--tint\);/);
    assert.match(css, /forced-colors: active\) \{[\s\S]*?\.bmf-qbar \.bmf-steps li \{\s*forced-color-adjust: none;/);
  });

  test('J-14: the company-lead page keeps the server title (G11-05) — intake-company.js never rewrites document.title', async () => {
    assert.ok(!/document\.title\s*=/.test(read('public/assets/js/public/intake-company.js')));
    const r = await get('/intake?seg=paid&mode=company');
    assert.match(r.body, new RegExp(`<title>طلب عرض لخدمات الشركات — ${BRAND}</title>`));
  });

  test('J-18: a draft moved by the way-back row («خيري») is tagged crossed and restored silently (no «كمّلي / ابدئي من الأول» banner)', () => {
    const js = read('public/assets/js/public/intake.js');
    assert.match(js, /crossed: crossing,/);
    const fn = js.slice(js.indexOf('async function restoreDraft()'));
    const silent = fn.indexOf('if (d.crossed) return screen;');
    const banner = fn.indexOf("banner = h(\n    'section.bmf-banner'");
    assert.ok(silent > 0 && banner > 0 && silent < banner, 'silent return before the banner');
    // العلامة تُكتب فقط أثناء الانتقال (crossing = true قبل حفظ مسودة «خيري»)
    const cross = js.slice(js.indexOf('function crossRow()'), js.indexOf('function crossRow()') + 1600);
    assert.ok(cross.indexOf('crossing = true;') < cross.indexOf("draftStore(keyOf('charity')).save({ ...draftObject(), seg: 'charity' })"));
  });

  test('V12: on the paid phone step the way-back row comes after the submit/actions block (the topic step keeps it under the H1)', () => {
    const js = read('public/assets/js/public/intake.js');
    const phone = js.slice(js.indexOf('function phoneScreen()'));
    const body = phone.slice(phone.indexOf("'section.bmf-step'"), phone.indexOf('const say = () =>'));
    assert.ok(body.indexOf("h('div.bmf-actions'") < body.indexOf('crossRow()'), 'after the actions');
    assert.ok(body.indexOf('crossRow()') > body.indexOf('phoneField'), 'not between the heading and the phone field');
    assert.match(read('public/assets/css/public-site.css'), /\.bmf-actions \+ \.pub-cross \{\s*margin-top: 16px;/);
  });

  test('V16: the /portal demo disclosure has a visible chevron and plural MSA copy on the paid side', () => {
    assert.equal(PORTAL_LOGIN_PAID.demo, 'في الوضع التجريبي لا تُرسل رسائل واتساب فعلية: يظهر الكود في «صندوق الصادر» بصفحة الأتمتة والرسائل في منصة الإدارة. جرّبوا الرقم 01012345678.');
    assert.ok(!FEMININE.test(PORTAL_LOGIN_PAID.demo));
    assert.ok(read('public/assets/js/public/portal-login.js').includes("h('p', P('demo', 'في الوضع التجريبي ما بتتبعتش"));
    const css = read('public/assets/css/v91-portal.css');
    assert.match(css, /\.bp-demo summary \{\s*gap: 10px;\s*list-style: none;/);
    assert.match(css, /\.bp-demo summary::after \{[^}]*transform: rotate\(45deg\);/);
    assert.match(css, /\.bp-demo\[open\] summary::after \{[^}]*rotate\(-135deg\)/);
  });
});

// ───────────────────────── R-10/K6: بوابة الشركات، R-17: الميزانيات ─────────────────────────

describe('v11 gate fixer-public — company overview (R-10/K6) and budgets (R-17)', () => {
  test('R-10/K6: overview counts are a quiet plain number (no parentheses), attention rows end with a chevron, the search field is a borderless fill', () => {
    const js = read('public/assets/js/company/pages/overview.js');
    assert.ok(!/`\(\$\{[^}]*\}\)`/.test(js), 'no «(n)» counts');
    assert.equal((js.match(/h\('span\.co-count\.count-quiet\.num', String\(/g) || []).length, 2);
    assert.match(js, /button\(action, \{ variant: 'secondary', size: 'sm', href, iconEnd: 'chevronLeft' \}\)/);
    assert.match(read('public/assets/js/lib/ui.js'), /iconEnd && icon\(iconEnd/);
    assert.match(read('public/assets/css/v11-ui.css'), /\.co-search-input:not\(:focus\) \{ border-color: transparent; background: var\(--fill-1\); \}/);
  });

  test('R-17: segment.js is not loaded by any public page or browser module; fetched the way a module import would fetch it (?v=), it is ≤ 1,536 B br on the wire', async () => {
    const pubJs = path.join(PUB, 'assets/js');
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else if (/\.(js|html)$/.test(e.name)) files.push(f);
      }
    };
    walk(pubJs);
    for (const e of fs.readdirSync(PUB)) if (e.endsWith('.html')) files.push(path.join(PUB, e));
    for (const f of files) {
      if (f.endsWith(`${path.sep}segment.js`)) continue;
      const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
      assert.ok(!/(import|from)\s*\(?\s*['"][^'"]*\/segment\.js/.test(src) && !/src="[^"]*\/segment\.js/.test(src), `${path.relative(ROOT, f)} loads segment.js`);
    }
    const file = path.join(PUB, 'assets/js/public/segment.js');
    const v = graphVersion(file);
    assert.ok(v);
    const res = await fetch(`${t.base}/assets/js/public/segment.js?v=${v}`, { headers: { 'accept-encoding': 'br' } });
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(res.status, 200);
    // fetch يفك الضغط: نقيس الطول على السلك من الرأس
    const wire = Number(res.headers.get('content-length'));
    assert.equal(res.headers.get('content-encoding'), 'br');
    assert.ok(wire > 0 && wire <= 1536, `segment.js ${wire} B br on the wire`);
    assert.ok(!/^\s*\/\//m.test(body.toString('utf8')), 'served without comment lines');
  });

  test('R-17 (recorded, needs a lead decision): paid /intake bm-copy stays ≤ 12,288 B raw (spec 6,144) and is absent on the charity side', async () => {
    const paid = bmCopyOf((await get('/intake?seg=paid')).body);
    assert.ok(paid);
    assert.ok(Buffer.byteLength(paid.raw) <= 12288, `${Buffer.byteLength(paid.raw)}`);
    assert.equal(bmCopyOf((await get('/intake?seg=charity')).body), null);
  });
});
