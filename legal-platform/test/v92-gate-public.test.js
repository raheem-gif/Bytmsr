// v9.2 — بوابة الدمج، مسار public: اختبارات انحدار لملاحظات المراجعة (K1، K2، K3، G3/N16، N1، N2، N4، N5، N8، N9، N13، N14).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { ok, uniquePhone } from './lane-b-kit.test.js';
import { genderize } from '../src/util.js';
import { isCannedCallback } from '../src/channels/engine.js';
import { STORY_VIEW_SQL } from '../src/services/stories.js';
import { answerMessageText } from '../src/services/portal-v91.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';
import * as B from '../public/assets/js/lib/brand-color.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OWNER = 'رامي فوزي';
const tokenOf = (url) => /\/p\/([A-Za-z0-9_-]{20,100})/.exec(String(url || ''))?.[1];

// ───────────────────────── K1: طلب بلا اسم برقم شخص آخر لا يكشف اسمه ─────────────────────────

describe('v9.2 gate (K1) — a no-name website request on someone else\'s number never shows that person\'s name', () => {
  let t;
  let phone;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    phone = uniquePhone();
    // صاحب الرقم: ملف مسجّل باسمه (أدخله الموظفون) وبخطاب المذكر
    const { client } = t.app.clients.resolveOrCreate({ phone, name: OWNER, channel: 'staff', verified: true });
    t.app.db.run("UPDATE clients SET address_form = 'm' WHERE id = ?", client.id);
  });
  after(async () => t && t.close());

  const submit = (body) => t.client().post('/api/public/intake', { consent: true, phone, ...body });
  const intakeOf = (ref) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', ref);

  test('no name: the intake keeps no name, /api/portal and /p/<token> greet neutrally, and the owner\'s name or gender appears nowhere', async () => {
    const r = ok(await submit({ description: 'محتاجة أعرف حقي في معاش جوزي الله يرحمه.', topic: 'pen' }), 201);
    const row = intakeOf(r.reference);
    assert.equal(row.contact_name, null, 'the request inherits no name from the client file');
    assert.ok(JSON.parse(row.source_detail).phone_match_unverified, 'the number belongs to an existing client (unverified match)');
    const token = tokenOf(r.portal_url);
    assert.ok(token, 'a website-only follow-up link is issued');
    const view = ok(await t.client().get(`/api/portal/${token}`));
    assert.equal(view.client.name, null);
    assert.ok(!view.home.name, `home.name = ${view.home.name}`);
    assert.equal(view.home.address, 'f', 'the owner\'s masculine address form does not leak either');
    assert.ok(!JSON.stringify(view).includes('رامي'), 'no part of the owner\'s name in the portal JSON');
    const page = await t.client().get(`/p/${token}`);
    assert.equal(page.status, 200);
    assert.ok(!String(page.body).includes('رامي'), 'no part of the owner\'s name in the /p page (embedded data included)');
    // الردود الجاهزة لها (اقتراح المسار، الرسائل) تستخدم نفس الاسم: «أهلًا بيكي»
    const w = t.app.stories.words(row.id);
    assert.equal(w.first_name, '');
    assert.equal(w.hello, 'أهلًا بيكي');
  });

  test('with a name: only the name written in this submission is used', async () => {
    const r = ok(await submit({ name: 'أم سعاد', description: 'جوزي اتوفى وعايزة اعرف نصيبي في الشقة' }), 201);
    const row = intakeOf(r.reference);
    assert.equal(row.contact_name, 'أم سعاد');
    const view = ok(await t.client().get(`/api/portal/${tokenOf(r.portal_url)}`));
    assert.equal(view.client.name, 'أم سعاد');
    assert.match(String(view.home.name), /سعاد/);
    assert.ok(!JSON.stringify(view).includes('رامي'));
  });

  test('the answer message of an unverified website request greets with the submitter\'s own name (never the file owner\'s)', async () => {
    const r = ok(await submit({ description: 'عايزة أطلّع معاش جوزي وتكافل وكرامة.' }), 201);
    const row = intakeOf(r.reference);
    const text = answerMessageText(t.app, { summary: 'ليكي حق في المعاش.', steps: [] }, { id: null, client_id: row.client_id, intake_id: row.id });
    assert.ok(text.startsWith('أهلًا بيكي، ردّنا على مشكلتك جاهز.'), text);
    assert.ok(!text.includes('رامي'));
    const named = ok(await submit({ name: 'أم سعاد', description: 'عايزة أطلّع معاش جوزي وتكافل وكرامة.' }), 201);
    const nrow = intakeOf(named.reference);
    const ntext = answerMessageText(t.app, { summary: 'ليكي حق في المعاش.', steps: [] }, { id: null, client_id: nrow.client_id, intake_id: nrow.id });
    assert.ok(ntext.startsWith('أهلًا يا أم سعاد'), ntext);
  });

  test('a verified client file still greets its owner by name (WhatsApp-first story)', async () => {
    const p2 = uniquePhone();
    const res = t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.GATE.K1.${p2}`, from_phone: p2, contact_name: 'سلمى', text: 'جوزي اتوفى ومحتاجة أطلّع إعلام الوراثة' });
    t.app.db.run("UPDATE clients SET name = 'سلمى عادل', name_source = 'staff' WHERE id = ?", res.client.id);
    const text = answerMessageText(t.app, { summary: 'ممكن نطلّع الإعلام.', steps: [] }, { id: null, client_id: res.client.id, intake_id: res.intake.id });
    assert.ok(text.startsWith('أهلًا يا سلمى'), text);
  });
});

// ───────────────────────── K3: كلمتين ثم «سيبي رقمك» = طلب مكالمة بلا حكاية ─────────────────────────

describe('v9.2 gate (K3) — fewer than 10 typed letters plus a call-back is a call-back-only request', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());
  const submit = (body) => t.client().post('/api/public/intake', { consent: true, phone: uniquePhone(), consent_v: 1, ...body });
  const rowOf = (ref) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', ref);
  const firstIn = (id) => t.app.db.get("SELECT * FROM messages WHERE intake_id = ? AND direction = 'in' ORDER BY id LIMIT 1", id);
  const viewOf = (id) => t.app.db.get(`SELECT (${STORY_VIEW_SQL}) AS v FROM intakes i WHERE i.id = ?`, id).v;

  for (const [label, body, line] of [
    ['«ورث» (no name, mode callback)', { description: 'ورث', callback: 'any', mode: 'callback' }, 'محتاجين حد يكلمنا — أي وقت'],
    ['«جوزي مات» from the story screen', { description: 'جوزي مات', callback: 'any', mode: 'callback', topic: 'other' }, 'محتاجين حد يكلمنا — أي وقت'],
    ['«جوزي مات» with a name', { name: 'أم يوسف', description: 'جوزي مات', callback: 'morning', mode: 'callback', topic: 'inh' }, 'عايزة حد يكلمني — الصبح'],
  ]) {
    test(`${label}: story none, canned body (the typed words kept after it for staff), callback view first in triage`, async () => {
      const r = ok(await submit(body), 201);
      const row = rowOf(r.reference);
      const fa = JSON.parse(row.form_answers);
      assert.equal(fa.story, 'none');
      assert.equal(fa.callback, body.callback);
      const m = firstIn(row.id);
      assert.equal(m.body, `${line}\n${body.description}`);
      const meta = JSON.parse(m.meta);
      assert.equal(meta.callback_canned, true);
      assert.equal(isCannedCallback(meta, m.body), true);
      assert.equal(row.story_rev, 0, 'the canned call-back is not a fact');
      assert.equal(viewOf(row.id), 'callback');
      const n = t.app.db.get("SELECT body FROM notifications WHERE type = 'client.callback' AND title LIKE ?", `%${r.reference}%`);
      assert.match(n.body, /بدون حكاية/);
    });
  }

  test('10+ letters with a call-back stay a written story (unchanged), and so does a voice note with a short caption', async () => {
    const r = ok(await submit({ description: 'جوزي اتوفى وعايزة أطلّع معاشه', callback: 'noon', mode: 'callback' }), 201);
    const row = rowOf(r.reference);
    assert.equal(JSON.parse(row.form_answers).story, 'text');
    assert.equal(firstIn(row.id).body, 'جوزي اتوفى وعايزة أطلّع معاشه');
    assert.equal(JSON.parse(firstIn(row.id).meta).callback_canned, false);
    assert.notEqual(viewOf(row.id), 'callback');
    // بلا مكالمة القاعدة كما هي: أقل من 10 حروف = 400
    const bad = await submit({ description: 'ورث' });
    assert.equal(bad.status, 400);
  });

  test('client: the phone-screen summary says «هنسمعها منك في المكالمة» for fewer than 10 typed letters without a voice note', () => {
    const src = read('public/assets/js/public/intake.js');
    const fn = src.slice(src.indexOf('function problemSummary()'), src.indexOf('function field('));
    assert.match(fn, /typed >= MIN_CHARS/);
    assert.match(fn, /COPY\.sumCb/);
  });
});

// ───────────────────────── G3/N16: الشاشة الأولى كلها في 360×512 ─────────────────────────

describe('v9.2 gate (G3/N16) — the home first screen fits 360×512 (tiles, ways row, header button, badge)', () => {
  const css = read('public/assets/css/public-site.css');
  const crit = css.slice(css.indexOf('/* @critical-start'), css.indexOf('/* @critical-end */'));
  const px = (re, src = crit) => Number(re.exec(src)?.[1]);

  test('tile height = (100svh − 236px)/4 with a 72px floor, and the small-tile rule (40px picture, 18px/20px label) below 596px', () => {
    assert.match(crit, /--tile-h: clamp\(72px, calc\(\(100svh - 236px\) \/ 4\), 140px\);/);
    assert.match(crit, /\.pub-pick \{[^}]*--tile-h: 72px;/);
    const small = /@media \(max-height: 595px\) and \(max-width: 699px\) \{([\s\S]*?)\n\}/.exec(crit);
    assert.ok(small, 'small-tile media rule');
    const s = small[1];
    assert.match(s, /body\.pub \.pub-pick-tile \{\s*--pic: 40px;\s*padding-block: 3px;/);
    assert.match(s, /body\.pub \.pub-pick-tile:has\(small\) \{\s*--pic: 30px;\s*padding-block: 3px;/);
    assert.match(s, /\.pub-pick-tile b \{\s*font-size: 18px;\s*line-height: 20px;/);
    assert.match(s, /\.pub-pick-tile small \{\s*line-height: 16px;/);
  });

  test('the budget adds up: header 52 + 10 + head 64 + 3 tiles of 72 + the «حاجة تانية» row + 3 gaps + 6 + ways 56 ≤ 512', () => {
    const border = 2 * 2;
    const pad = 2 * 3;
    const tile = Math.max(72, (512 - 236) / 4);
    const normal = Math.max(tile, border + pad + 40 + 2 + 20);
    const smallFont = px(/\.pub-pick-tile small \{[^}]*line-height: (\d+)px/, /@media \(max-height: 595px\)[\s\S]*?\n\}/.exec(crit)[0]);
    const other = Math.max(tile, border + pad + 30 + 2 + 20 + 2 + smallFont);
    const header = 52;
    const sectionTop = px(/\.pub-start \{[^}]*padding-block: (\d+)px/);
    const head = px(/\.pub-start-head \{[^}]*min-height: (\d+)px/);
    const gap = px(/\.pub-pick \{[^}]*gap: (\d+)px/);
    const waysTop = px(/\.pub-pick-ways \{[^}]*margin: (\d+)px 0 0/);
    const ways = px(/@media \(max-width: 600px\)[\s\S]*?body\.pub \.pub-pick-way \{\s*min-height: (\d+)px/);
    assert.deepEqual([sectionTop, head, gap, waysTop, ways], [10, 64, 8, 6, 56]);
    const bottom = header + sectionTop + head + 3 * normal + other + 3 * gap + waysTop + ways;
    assert.ok(normal === 72 && other <= 80, `tiles ${normal}/${other}`);
    assert.ok(bottom <= 512, `ways row bottom ${bottom}`);
  });
});

// ───────────────────────── K2: «آخر تحديث» على بطل الصفحات القانونية ─────────────────────────

describe('v9.2 gate (K2) — text on the legal-page hero is a contract pair for any foundation colours', () => {
  const css = read('public/assets/css/public-site.css');
  const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    return css.slice(i, css.indexOf('}', i));
  };

  test('.pub-updated is white (T1 on p700, darker below), the breadcrumb text is ≥ 90% white', () => {
    // v11 visual (intended, L11-48 stronger value): the legal-page hero is a large title on the white canvas now, so «آخر تحديث»
    // and the breadcrumb are secondary text (--label-2 #5a625e on #fff = 6.0:1, independent of the foundation colours) — never gold
    assert.match(rule('.pub-updated'), /color: var\(--label-2\) !important;/);
    assert.doesNotMatch(rule('.pub-updated'), /gold|accent/);
    assert.match(rule('.pub-crumbs'), /color: var\(--label-2\);/);
    assert.doesNotMatch(rule('.pub-page-hero'), /background/);
    assert.ok(B.contrast('#5a625e', '#ffffff') >= 4.5);
  });

  test('hostile and common brand pairs: white and 90% white stay ≥ 4.5:1 on p700…p900; the old accent-300 did not', () => {
    const pairs = [['#ffeb3b', '#ffffff'], ['#e91e63', '#ffc107'], ['#ff0000', '#000000'], ['#ff0000', '#ffffff'], ['#000000', '#000000'], ['#fafafa', '#000000'], ['#6a1b9a', '#f9a825'], [B.DEFAULT_PRIMARY, B.DEFAULT_ACCENT]];
    const v = ['00', '55', 'aa', 'ff'];
    for (const r of v) for (const g of v) for (const b of v) pairs.push([`#${r}${g}${b}`, '#ffffff'], [`#${r}${g}${b}`, '#000000']);
    let oldWorst = 99;
    for (const [p, a] of pairs) {
      const th = B.buildTheme(p, a);
      assert.ok(th, `${p}/${a}`);
      for (const bg of [th.primary[700], th.primary[800], th.primary[900]]) {
        assert.ok(B.contrast('#ffffff', bg) >= 4.5, `${p}/${a} white on ${bg}`);
        assert.ok(B.contrast(B.over('#ffffff', 0.9, bg), bg) >= 4.5, `${p}/${a} 90% white on ${bg}`);
      }
      oldWorst = Math.min(oldWorst, B.contrast(th.accent[300], th.primary[700]));
    }
    assert.ok(oldWorst < 4.5, 'the scan reaches the failing case of the old rule');
  });
});

// ───────────────────────── نصوص وصوت وصورة «مش عارفة» ─────────────────────────

describe('v9.2 gate — copy, listening and the «مش عارفة» picture (N1, N2, N4, N5, N8, N9, N13, N14)', () => {
  const intake = read('public/assets/js/public/intake.js');
  const landing = read('public/assets/js/public/landing.js');
  const about = intake.slice(intake.indexOf('function aboutCard('), intake.indexOf('// ───────── الموقع قيد التجهيز'));
  const success = intake.slice(intake.indexOf('function showSuccess('), intake.indexOf('function aboutCard('));

  test('N1: the about card title counts its questions and follows the address form', () => {
    assert.match(about, /const title = steps\.length > 1 \? 'كمان سؤالين — لو تحبي' : g\('سؤال كمان — لو تحب\{ي\}'\);/);
    assert.equal(genderize('سؤال كمان — لو تحب{ي}', 'm'), 'سؤال كمان — لو تحب');
    assert.equal(genderize('سؤال كمان — لو تحب{ي}', 'f'), 'سؤال كمان — لو تحبي');
    // سؤالين فقط لما الصفة غير معروفة والكلام لست (السؤال الثاني «إنتي…؟» مؤنث دائمًا)
    assert.match(about, /if \(!infer\(answers\)\.relation && form !== 'm'\) steps\.push\('rel'\);/);
  });

  test('N2: the spoken call-back text spells the number digit by digit; the visible text keeps it as written', () => {
    assert.match(success, /cbSay = \(\) => `\$\{lead\}\$\{from \? `، من الرقم ده: \$\{L \? L\.spellPhone\(from\) : from\}` : ''\}\. \$\{rest\}`;/);
    assert.match(success, /cbText && \{ text: cbSay\(\), el: cbCard \}/);
    assert.match(success, /cbText = `\$\{lead\}\$\{from \? `، من الرقم ده: \$\{from\}` : ''\}\. \$\{rest\}`;/);
  });

  test('N8: the «كمان سؤالين» card is read aloud (title, question, every answer, «تخطي»), the listen button repaints when it appears, the next question reads itself after a tap', () => {
    assert.match(about, /card\.sayItems = \(\) => \{/);
    assert.match(about, /querySelectorAll\('\.bmf-about-q, \.bmf-about-tile, \.bmf-skip, \.bmf-sent'\)/);
    assert.match(about, /const readNext = \(\) => \{\s*if \(L && L\.listenOn\(\) && !card\.hidden\) speakItems\(card\.sayItems\(\)\.slice\(1\)\);/);
    assert.match(about, /if \(i && step\) readNext\(\);/);
    assert.match(success, /about\.hidden = false;\s*if \(L && L\.listenOn\(\)\) \{\s*aboutFresh = true;\s*firstAfterLoad = true;\s*\}\s*paintListen\(\);/);
    assert.match(success, /\.\.\.aboutItems\]/);
  });

  test('N9: «إنتي…؟» with a hamza, like «إنتي من أنهي محافظة؟»', () => {
    assert.ok(about.includes("'إنتي…؟'"));
    assert.ok(!intake.includes('انتي…؟'));
  });

  test('N13: inside Facebook/Instagram the WhatsApp line is not repeated under the big WhatsApp button', () => {
    assert.match(intake, /if \(waLine\) waLine\.hidden = told \|\| inApp;/);
  });

  test('N5a: the home listen button reads as a noun while speaking («إيقاف الصوت»), not a masculine imperative', () => {
    assert.ok(landing.includes("'إيقاف الصوت'"));
    assert.ok(!landing.includes("'وقّف الصوت'"));
    assert.ok(landing.includes("'وقّفوا الصوت'"), 'the aria label stays the neutral plural');
  });

  test('N14: «مش عارفة» is a shrug (person + two open palms up), not two raised hands; one picture ≤ 600 B, brand classes only', () => {
    const svg = PICTOS.dontknow;
    assert.ok(Buffer.byteLength(svg) <= 600, `${Buffer.byteLength(svg)} B`);
    assert.match(svg, /<circle class="pa" cx="24" cy="12" r="6\.5"\/>/, 'a head in the middle');
    assert.equal((svg.match(/<path class="pb"/g) || []).length, 1, 'both palms in one accent path');
    assert.doesNotMatch(svg, /rotate\(/, 'no tilted upright hands');
    for (const m of svg.matchAll(/class="([^"]*)"/g)) assert.ok(['pa', 'pb'].includes(m[1]), m[1]);
  });

  test('N4 + N5b: neutral skip link on /intake, /portal, /p; the home nav says «طلبك فين؟» like its tile, other pages keep «تابعي طلبك»', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      for (const p of ['/intake', '/portal', '/p/abcdefghijklmnopqrstuvwxyz012345', '/']) {
        const r = await t.client().get(p);
        assert.equal(r.status, 200, p);
        assert.match(r.body, /<a class="skip-link" href="#main">انتقال إلى المحتوى<\/a>/, p);
        assert.ok(!r.body.includes('تخطَّ'), p);
      }
      const home = (await t.client().get('/')).body;
      const header = /<header class="pub-header"[\s\S]*?<\/header>/.exec(home)[0];
      assert.match(header, /<a class="pub-nav-link pub-nav-portal" href="\/portal"><svg[\s\S]*?<\/svg><span>طلبك فين؟<\/span><\/a>/);
      assert.ok(!header.includes('تابعي'), 'no feminine verb in the home header');
      const privacy = (await t.client().get('/privacy')).body;
      assert.match(/<header class="pub-header"[\s\S]*?<\/header>/.exec(privacy)[0], /<span>تابعي طلبك<\/span>/);
      // v11 gate-public (intended, L11-14): the side pill is on the homes and legal pages, never on the task pages
      assert.ok(header.includes('class="pub-seg-pill pub-seg-pill--charity"'), 'pill on the home');
      for (const p of ['/intake', '/intake?seg=paid', '/portal', '/p/abcdefghijklmnopqrstuvwxyz012345']) assert.ok(!(await t.client().get(p)).body.includes('pub-seg-pill'), `no pill on ${p}`);
    } finally {
      await t.close();
    }
  });
});
