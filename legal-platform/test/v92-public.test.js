// v9.2 — مسار public: الشاشة الأولى بالمربعات، النموذج بالصور، طلب المكالمة بلا حكاية، «كمان سؤالين»، «اسمعي»،
// وميزانية الشبكة البطيئة (§5.4 من مواصفة 9.2، الاختبارات 1–17).
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, uniquePhone } from './lane-b-kit.test.js';
import { LEGAL_AREAS, GOVERNORATES } from '../src/constants.js';
import { SERVICES } from '../src/site.js';
import { genderize } from '../src/util.js';
import { preloadClosure, transformAsset, setPublicRoot } from '../src/site-assets.js';
import * as T from '../public/assets/js/public/topics.js';
import { PICTOS } from '../public/assets/js/public/pictos.js';
import { LEGACY, hexToRgb } from '../public/assets/js/lib/brand-color.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NO_WA = { whatsapp: { token: '', phoneNumberId: '', verifyToken: 'verify-me', appSecret: '', numberDigits: '' } };
const ORDER = ['inh', 'pen', 'guardianship', 'alimony', 'custody', 'rent', 'papers', 'other'];
const INTERNAL_CODE_RE = /\b(?:CL-\d|INH-|FAM-|GRD-|PEN-|PRP-|CIV-|LAB-|CRM-|COM-|TAX-|ADM-|GEN-|MTR-|INV-)/;
const DESC = 'جوزي اتوفى من 4 شهور ومش عارفة أطلّع معاشه أنا والعيال.';
// نفس إعدادات الخادم للملفات الثابتة (src/http.js BR_STATIC)
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;

/** كلمات النص (لفحص صيغ المؤنث ككلمات كاملة: «نصيبكم» ليست «نصيبك») */
const wordsOf = (s) => String(s).split(/[\s،,.:؛!؟?"«»()]+/u).filter(Boolean);

afterEach(() => resetClock());

// ───────────────────────── 1–3: الشاشة الأولى والطرق التانية وروابط الخدمات ─────────────────────────

describe('v9.2 public — the tile-first home page', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());
  const get = async (p, c = t) => {
    const r = await c.client().get(p);
    assert.equal(r.status, 200, p);
    return r.body;
  };
  const startOf = (html) => /<section id="start"[\s\S]*?<\/section>/.exec(html)[0];

  test('1. #start is the first section of <main>: the question, «مجاني وسرّي», 8 picture tiles in order, trust line, hidden listen button', async () => {
    const html = await get('/');
    const main = html.slice(html.indexOf('<main'));
    assert.ok(main.indexOf('<section id="start"') >= 0 && main.indexOf('<section id="start"') === main.indexOf('<section'), '#start is the first section');
    const start = startOf(html);
    // v10 experience (intended, X10-B3 #5): the brand inside the SR prefix is a <bdi lang="en">
    assert.match(start, /<h1 id="start-title"><span class="pub-sr">مساعدة قانونية مجانية من <bdi class="wordmark" dir="ltr" lang="en">[^<]+<\/bdi>\. <\/span>مشكلتك في إيه؟<\/h1>/);
    assert.match(start, /<p class="pub-start-badge"><svg[\s\S]*?<\/svg><b>مجاني وسرّي<\/b><\/p>/);
    const tiles = [...start.matchAll(/<a class="pub-pick-tile" id="tile-([a-z]+)" href="([^"]+)" data-cta="intake" data-topic="([a-z]+)" data-say="([^"]+)">(<svg class="pub-pic" viewBox="0 0 48 48" aria-hidden="true" focusable="false">[\s\S]*?<\/svg>)<b>([^<]+)<\/b>(<small>[^<]*<\/small>)?<\/a>/g)];
    assert.equal(tiles.length, 8);
    assert.equal((start.match(/class="pub-pick-tile"/g) || []).length, 8);
    tiles.forEach((m, i) => {
      assert.equal(m[1], ORDER[i]);
      assert.equal(m[2], `/intake?seg=charity&topic=${ORDER[i]}`); // v11 gate-public (intended, L11-52)
      assert.equal(m[3], ORDER[i]);
      assert.equal(m[4], T.topicByKey(ORDER[i]).say);
      assert.equal(m[6], T.topicByKey(ORDER[i]).label);
      assert.equal(m[7] || '', ORDER[i] === 'other' ? '<small>أو مش عارفين</small>' : '');
    });
    // لا فقرة قبل المربعات إلا «مجاني وسرّي»
    const before = start.slice(0, start.indexOf('<ul class="pub-pick"'));
    const ps = before.match(/<p\b[^>]*>/g) || [];
    assert.deepEqual(ps, ['<p class="pub-start-badge">']);
    assert.match(start, /<b>مجاني وسرّي\.<\/b> المحامي مش بيشوف رقمك\./);
    assert.ok(!html.includes('pub-hero'));
    assert.match(start, /<button type="button" class="pub-listen" id="start-listen" hidden aria-pressed="false" aria-label="اسمعوا الكلام اللي في الصفحة">[\s\S]*?<span>بالصوت<\/span><\/button>/);
  });

  test('2. ways row: «إحنا نكلمك», WhatsApp (real number only), «طلبك فين؟», no tel: tile; header contact button; office-closed flag on /intake', async () => {
    const html = await get('/');
    const ways = /<ul class="pub-pick-ways" data-n="(\d)">([\s\S]*?)<\/ul>/.exec(html);
    assert.equal(ways[1], '3');
    const hrefs = [...ways[2].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(hrefs.length, 3);
    assert.equal(hrefs[0], '/intake?seg=charity&amp;mode=callback&amp;entry=home_callback'); // v11 gate-public (intended, L11-52)
    assert.match(hrefs[1], /^https:\/\/wa\.me\/201000000001\?text=/);
    assert.equal(hrefs[2], '/portal');
    assert.ok(!ways[2].includes('tel:'));
    for (const label of ['إحنا نكلمك', 'واتساب', 'طلبك فين؟']) assert.ok(ways[2].includes(`<b>${label}</b>`), label);
    assert.match(ways[2], /pub-pick-way--wa" href="[^"]+" target="_blank" rel="noopener noreferrer"[\s\S]*?<span class="pub-sr"> \(يفتح في نافذة جديدة\)<\/span>/);
    // زر الرأس: واتساب
    assert.match(html, /<a class="pub-head-contact pub-head-contact--wa" href="https:\/\/wa\.me\/201000000001\?text=[^"]+" target="_blank" rel="noopener noreferrer" data-cta="whatsapp" aria-label="واتساب \(يفتح في نافذة جديدة\)">/);

    const noWa = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      const h2 = await get('/', noWa);
      const w2 = /<ul class="pub-pick-ways" data-n="(\d)">([\s\S]*?)<\/ul>/.exec(h2);
      assert.equal(w2[1], '2');
      assert.ok(!w2[2].includes('wa.me'));
      assert.match(h2, /<a class="pub-head-contact" href="tel:\+201211114662" aria-label="اتصال بالتليفون">/);
      noWa.app.settings.set('org_phone', '');
      const h3 = await get('/', noWa);
      assert.ok(!h3.includes('pub-head-contact"') && !/class="pub-head-contact[ "]/.test(h3), 'no header contact without WhatsApp or phone');
      assert.ok(!/<a class="pub-head-contact/.test(h3));
    } finally {
      await noWa.close();
    }

    // المؤسسة مقفولة (الجدول الافتراضي: السبت–الخميس 10–4 بتوقيت القاهرة)
    freezeClock('2026-11-02T18:00:00.000Z'); // الاثنين 8 بالليل
    assert.match(await get('/intake'), /id="intake-root"[^>]*data-office-closed="1"/);
    freezeClock('2026-11-02T09:00:00.000Z'); // الاثنين 11 الصبح
    assert.ok(!(await get('/intake')).includes('data-office-closed'));
    t.app.settings.set('office_hours_schedule', null);
    freezeClock('2026-11-02T18:00:00.000Z');
    assert.ok(!(await get('/intake')).includes('data-office-closed'), 'no schedule → never «closed»');
    t.app.settings.set('office_hours_schedule', { days: [6, 0, 1, 2, 3, 4], from: '10:00', to: '16:00' });
    resetClock();
    const intake = await get('/intake');
    assert.match(intake, /id="intake-root" data-org-phone="01211114662" data-org-phone-href="\+201211114662" data-wa="201000000001"/);
  });

  test('3. «بنساعد في إيه؟» links by topic (?topic=), so «حضانة ورؤية» opens custody; ?area= is still understood by the form', async () => {
    const html = await get('/');
    assert.equal(SERVICES.length, 8);
    for (const s of SERVICES) {
      const m = new RegExp(`id="service-${s.key}">\\s*<a class="pub-tile-link" href="([^"]+)"`).exec(html);
      assert.ok(m, s.key);
      assert.equal(m[1], `/intake?seg=charity&topic=${s.topic}`); // v11 gate-public (intended, L11-52)
    }
    assert.ok(html.includes('id="service-custody">\n  <a class="pub-tile-link" href="/intake?seg=charity&topic=custody"')); // v11 gate-public (intended)
    const intake = read('public/assets/js/public/intake.js');
    assert.match(intake, /params\.get\('area'\)/);
    assert.match(intake, /TOPICS\.find\(\(x\) => x\.area === area\)/);
    // روابط 9.1 القديمة (?topic=inheritance…) ما زالت تُفهم
    assert.equal(T.topicByKey('inheritance').key, 'inh');
    assert.equal(T.topicByKey('housing').key, 'rent');
  });
});

// ───────────────────────── 4: topics.js وpictos.js ─────────────────────────

describe('v9.2 public — the topic catalogue and the pictograms', () => {
  const codes = new Set(LEGAL_AREAS.map((a) => a.code));
  const pictoOk = (id) => !!PICTOS[id] || /^kids_[1-4]$/.test(id);

  test('4a. topics: areas, flows ≤ 2, 2–4 answers each with label/staff/picto, «مش عارفة» picture, inh.deceased values, no «…» titles', () => {
    assert.deepEqual(T.TOPICS.map((x) => x.key), ORDER);
    for (const t of T.TOPICS) {
      assert.ok(t.area === null || codes.has(t.area), t.key);
      assert.ok(t.questions.length <= 2, t.key);
      assert.deepEqual(T.flowFor(t.key), t.questions);
      assert.ok(PICTOS[t.picto], `topic picto ${t.picto}`);
      for (const qid of t.questions) assert.ok(T.QUESTIONS[qid], qid);
    }
    for (const [id, q] of Object.entries(T.QUESTIONS)) {
      assert.ok(q.answers.length >= 2 && q.answers.length <= 4, id);
      assert.ok(!/…$/.test(q.h1), `${id}: no «…» title`);
      for (const a of q.answers) {
        assert.ok(a.label && a.staff && a.value, `${id}.${a.value}`);
        assert.ok(pictoOk(a.picto), `${id}: ${a.picto}`);
      }
    }
    assert.equal(T.UNKNOWN.picto, 'dontknow');
    assert.ok(PICTOS.dontknow);
    assert.deepEqual(T.UNKNOWN, { value: 'unknown', label: 'مش عارفة', picto: 'dontknow', staff: 'لا تعرف' });
    assert.deepEqual(
      T.QUESTIONS['inh.deceased'].answers.map((a) => a.value),
      ['husband', 'parent', 'child', 'other'],
    );
    assert.equal(T.topicByKey('other').sub, 'أو مش عارفين');
    assert.equal(T.topicByKey('other').staff, 'أخرى');
    assert.deepEqual(T.ALIASES, { inheritance: 'inh', pensions: 'pen', housing: 'rent', documents: 'papers' });
    assert.deepEqual(T.CALLBACK_WHEN, { morning: { label: 'الصبح', staff: 'صباحًا' }, noon: { label: 'الضهر', staff: 'ظهرًا' }, any: { label: 'أي وقت', staff: 'أي وقت' } });
  });

  test('4b. [S-25] the spoken lines of the first screen are gender-neutral; WhatsApp list titles and descriptions fit', () => {
    const feminine = ['تعرفي', 'اختاري', 'عايزة', 'نصيبك', 'منك', 'يطلّعوكي', 'أبوكي', 'تصرفي', 'احكيلنا'];
    for (const t of T.TOPICS) {
      const w = wordsOf(t.say);
      for (const f of feminine) assert.ok(!w.includes(f), `${t.key}: «${f}» in «${t.say}»`);
      assert.ok([...t.wa_title].length <= 24, t.key);
      for (const form of ['f', 'm']) assert.ok([...genderize(t.wa_desc, form)].length <= 72, `${t.key} (${form})`);
    }
  });

  test('4c. sanitizeAnswers, infer, staffLines and the WhatsApp prefill round trip', () => {
    assert.deepEqual(T.sanitizeAnswers('inh', { 'inh.deceased': 'husband', 'inh.certificate': 'unknown', 'pen.whose': 'husband', bogus: 1, 'inh.x': 'y' }), { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' });
    assert.deepEqual(T.sanitizeAnswers('inh', { 'inh.deceased': 'king' }), {});
    assert.deepEqual(T.sanitizeAnswers('alimony', { children: 3 }), { children: '3' });
    assert.deepEqual(T.sanitizeAnswers(null, { children: '3' }), {});
    assert.deepEqual(T.sanitizeAnswers('inh', 'x'), {});
    // infer
    assert.deepEqual(T.infer({ 'inh.deceased': 'husband' }), { relation: 'widow' });
    assert.deepEqual(T.infer({ 'pen.whose': 'husband' }), { relation: 'widow' });
    assert.deepEqual(T.infer({ 'alimony.father': 'deceased', children: '4' }), { relation: 'widow', children_count: 4 });
    assert.deepEqual(T.infer({ 'alimony.father': 'divorced' }), { relation: 'divorced' });
    assert.deepEqual(T.infer({ 'rent.home': 'rented_old', 'rent.evict': 'yes' }), { housing: 'rented_old', urgent_hint: true });
    assert.deepEqual(T.infer({ 'rent.home': 'unknown', children: 'unknown' }), {});
    // staffLines
    assert.deepEqual(T.staffLines({ topic: 'inh', answers: { 'inh.certificate': 'unknown', 'inh.deceased': 'husband', junk: 'x' }, callback: 'morning' }), [
      'الموضوع: ورث',
      'المتوفى: الزوج',
      'إعلام الوراثة: لا تعرف',
      'طلبت مكالمة: صباحًا',
    ]);
    assert.deepEqual(T.staffLines(JSON.stringify({ topic: 'other', answers: {}, callback: null })), ['الموضوع: أخرى']);
    assert.deepEqual(T.staffLines(null), []);
    assert.equal(T.STAFF_LINES_TITLE, 'اختيارات ضغطت عليها في الموقع (قد تكون غير دقيقة)');
    // [R2-B15] الرسالة الجاهزة لواتساب ترجع لموضوعها، وأي كلام زيادة = لا موضوع
    assert.equal(T.WA_PREFILL, 'السلام عليكم، عندي مشكلة ');
    for (const t of T.TOPICS.filter((x) => x.key !== 'other')) {
      assert.equal(T.waPrefill(t.key), `السلام عليكم، عندي مشكلة ${t.wa_phrase}.`);
      assert.equal(T.topicFromWaPrefill(T.waPrefill(t.key)), t.key);
    }
    // v10 experience (intended, X10-B3 #7): the generic greeting carries no name (like the server SITE_GREETING)
    assert.equal(T.waPrefill('other', 'مؤسسة بيوت مصر'), 'السلام عليكم، عايزة أحكيلكم مشكلتي.');
    assert.equal(T.waPrefill(null), 'السلام عليكم، عايزة أحكيلكم مشكلتي.');
    assert.equal(T.topicFromWaPrefill(T.waPrefill('other')), null);
    assert.equal(T.topicFromWaPrefill('السلام عليكم'), null);
    assert.equal(T.topicFromWaPrefill(`${T.waPrefill('inh')} وجوزي اتوفى`), null);
  });

  test('4d. pure modules (no import, document or window) and one shape = one meaning in the pictures', () => {
    for (const f of ['topics.js', 'pictos.js', 'listen.js']) {
      const src = read(`public/assets/js/public/${f}`);
      assert.ok(!/^\s*import\b/m.test(src) && !/\bimport\s*\(/.test(src), `${f}: no import`);
      assert.ok(!/\bdocument\b/.test(src) && !/\bwindow\b/.test(src), `${f}: no document/window`);
    }
    // nomodule.js يحتاج الصفحة نفسها (يشيل «لحظة…» ويُظهر بطاقة التواصل) لكن بلا استيراد
    assert.ok(!/\bimport\b/.test(read('public/assets/js/public/nomodule.js')));
    // [R2-B11] العملة (عنصر من صورة «معاش») لا تتكرر حرفيًا في صور أخرى
    const elements = (s) => s.match(/<(?:circle|rect|path|ellipse)\b[^>]*\/>/g) || [];
    const coin = new Set(elements(PICTOS.pen));
    for (const id of ['husband', 'papers', 'inh', 'alimony', 'guardianship']) {
      for (const el of elements(PICTOS[id])) assert.ok(!coin.has(el), `${id} shares ${el} with pen`);
    }
    // [R2-B12] المتوفى و«حد تاني» خط (po) لا تعبئة باهتة (pl)
    for (const id of ['father_gone', 'someone', 'child_gone']) {
      assert.ok(PICTOS[id].includes('class="po"'), id);
      assert.ok(!PICTOS[id].includes('class="pl"'), id);
    }
    const ids = 'husband father mother someone parents child_gone dontknow takaful hourglass stopped less bank post father_gone father_away split_couple take_child no_see visit old_rent new_rent owned family_home door_out home_in doc_death doc_family doc_id doc_other check cross sunrise sun clock follow callme whatsapp phone'.split(' ');
    for (const id of [...ORDER, ...ids, 'kids_1', 'kids_2', 'kids_3', 'kids_4']) {
      assert.ok(PICTOS[id], id);
      assert.ok(Buffer.byteLength(PICTOS[id]) <= 600, `${id}: ${Buffer.byteLength(PICTOS[id])} B`);
      assert.ok(!/<script|on\w+=/i.test(PICTOS[id]), id);
    }
    assert.ok(fs.statSync(path.join(PUB, 'assets/js/public/pictos.js')).size <= 16 * 1024);
  });
});

// ───────────────────────── 5–7: طلب الموقع ومكالمة بلا حكاية و«كمان سؤالين» ─────────────────────────

describe('v9.2 public — POST /api/public/intake (§3.3)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());
  const submit = (body) => t.client().post('/api/public/intake', { consent: true, phone: uniquePhone(), ...body });
  const intakeOf = (ref) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', ref);
  const firstIn = (id) => t.app.db.get("SELECT * FROM messages WHERE intake_id = ? AND direction = 'in' ORDER BY id LIMIT 1", id);
  const formOf = (row) => JSON.parse(row.form_answers);

  test('5a. a call-back with no story is a request: canned body, meta.callback(_canned), form_answers.story = none, activity and staff notification', async () => {
    const r = ok(await submit({ name: 'أم سعيد', callback: 'morning', topic: 'inh', answers: { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' }, entry: 'home_tile', mode: 'callback', consent_v: 1 }), 201);
    const row = intakeOf(r.reference);
    const m = firstIn(row.id);
    assert.equal(m.body, 'عايزة حد يكلمني — الصبح');
    const meta = JSON.parse(m.meta);
    assert.equal(meta.callback, 'morning');
    assert.equal(meta.callback_canned, true);
    const fa = formOf(row);
    assert.equal(fa.story, 'none');
    assert.equal(fa.callback, 'morning');
    assert.equal(fa.topic, 'inh');
    assert.equal(fa.entry, 'home_tile');
    assert.equal(fa.consent_v, 1);
    assert.deepEqual(fa.answers, { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' });
    assert.deepEqual(fa.inferred, { relation: 'widow' });
    assert.equal(row.legal_area, 'INH');
    const act = t.app.db.get("SELECT * FROM activity WHERE intake_id = ? AND type = 'client.callback'", row.id);
    assert.equal(act.summary, 'طلبت المستفيدة مكالمة (الصبح) من نموذج الموقع');
    const n = t.app.db.get("SELECT * FROM notifications WHERE type = 'client.callback' AND title LIKE ?", `%${r.reference}%`);
    assert.equal(n.title, `طلب مكالمة (الصبح) — الطلب ${r.reference}`);
    assert.match(n.body, /بدون حكاية/);
    assert.equal(n.link, `#/inbox/${row.id}`);
    assert.equal(r.callback, 'morning');
  });

  test('5b. [S-25] no name and no topic from «إحنا نكلمك»: neutral body, entry home_callback, canned', async () => {
    const r = ok(await submit({ callback: 'morning', mode: 'callback', entry: 'home_callback', consent_v: 1 }), 201);
    const row = intakeOf(r.reference);
    const m = firstIn(row.id);
    assert.equal(m.body, 'محتاجين حد يكلمنا — الصبح');
    const fa = formOf(row);
    assert.equal(fa.topic, null);
    assert.equal(fa.entry, 'home_callback');
    assert.equal(row.contact_name, null);
    let canned;
    try {
      ({ isCannedCallback: canned } = await import('../src/channels/engine.js'));
    } catch {
      canned = null;
    }
    if (typeof canned !== 'function') canned = (meta, body) => meta?.callback_canned === true || (!!meta?.callback && /^(عايزة? حد يكلمني|محتاجين حد يكلمنا) — /.test(String(body)));
    assert.equal(canned(JSON.parse(m.meta), m.body), true);
    assert.equal(t.app.db.get("SELECT summary FROM activity WHERE intake_id = ? AND type = 'client.callback'", row.id).summary, 'طُلبت مكالمة (الصبح) من نموذج الموقع');
  });

  test('5c. without a call-back the story rule is unchanged; «أبو أحمد» → «عايز…»; the name is optional but never one letter', async () => {
    const bad = await submit({ name: 'أم سعيد' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.');
    assert.equal(bad.body.details.fields.description, 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.');
    const m = ok(await submit({ name: 'أبو أحمد', callback: 'noon' }), 201);
    assert.equal(firstIn(intakeOf(m.reference).id).body, 'عايز حد يكلمني — الضهر');
    assert.equal(t.app.db.get("SELECT summary FROM activity WHERE intake_id = ? AND type = 'client.callback'", intakeOf(m.reference).id).summary, 'طلب المستفيد مكالمة (الضهر) من نموذج الموقع');
    const noName = ok(await submit({ description: DESC }), 201);
    assert.equal(intakeOf(noName.reference).contact_name, null);
    const one = await submit({ name: 'م', description: DESC });
    assert.equal(one.status, 400);
    assert.equal(one.body.error, 'اكتبي اسمك كامل، أو سيبيه فاضي.');
  });

  test('5d. consent: the server rule is unchanged and consent_v is recorded; topic gives the area; answers are sanitised', async () => {
    const no = await submit({ description: DESC, consent: false });
    assert.equal(no.status, 400);
    assert.equal(no.body.error, 'لازم توافقي عشان نقدر نساعدك.');
    const c = ok(await submit({ description: DESC, topic: 'custody', answers: { 'custody.issue': 'take', children: '2', 'inh.deceased': 'husband', evil: '<x>' }, consent_v: 1, mode: 'tiles' }), 201);
    const row = intakeOf(c.reference);
    assert.equal(row.legal_area, 'FAM');
    const fa = formOf(row);
    assert.equal(fa.consent_v, 1);
    assert.equal(fa.story, 'text');
    assert.equal(fa.callback, null);
    assert.equal(fa.entry, 'direct');
    assert.deepEqual(fa.answers, { 'custody.issue': 'take', children: '2' });
    assert.equal(c.callback, null);
    const x = await submit({ description: DESC, answers: 'x' });
    assert.equal(x.status, 400);
    assert.equal(x.body.error, 'اختيارات غير صالحة.');
    assert.equal((await submit({ description: DESC, answers: ['a'] })).status, 400);
    // موضوع غير معروف: بلا موضوع بصمت؛ ووقت مكالمة غير معروف: 400
    const unk = ok(await submit({ description: DESC, topic: 'pizza' }), 201);
    assert.equal(formOf(intakeOf(unk.reference)).topic, null);
    assert.equal((await submit({ callback: 'midnight' })).status, 400);
  });

  test('5e. inferred family data is a self-reported submission; an explicit beneficiary field wins over the inference', async () => {
    const a = ok(await submit({ description: DESC, topic: 'alimony', answers: { 'alimony.father': 'deceased', children: '3' } }), 201);
    const sa = t.app.db.get('SELECT data FROM beneficiary_submissions WHERE intake_id = ?', intakeOf(a.reference).id);
    assert.deepEqual(JSON.parse(sa.data), { relation: 'widow', children_count: 3 });
    const b = ok(await submit({ description: DESC, topic: 'inh', answers: { 'inh.deceased': 'husband' }, beneficiary: { relation: 'orphan_guardian' } }), 201);
    const sb = t.app.db.get('SELECT data FROM beneficiary_submissions WHERE intake_id = ?', intakeOf(b.reference).id);
    assert.equal(JSON.parse(sb.data).relation, 'orphan_guardian');
  });

  test('5f. [R2-B9/B28] the response carries the call-back number, the working-day promise and the governorates to ask about', async () => {
    const r = ok(await submit({ callback: 'any' }), 201);
    assert.equal(r.callback, 'any');
    assert.equal(r.callback_from, '01211114662');
    assert.equal(r.callback_eta_days, 1);
    assert.equal(r.about_governorates.length, 7);
    assert.equal(r.about_governorates[6], 'محافظة تانية');
    for (const g of r.about_governorates.slice(0, 6)) assert.ok(GOVERNORATES.includes(g), g);
    t.app.settings.set('callback_from_number', '01000000777');
    t.app.settings.set('callback_eta_days', 3);
    for (let i = 0; i < 3; i += 1) ok(await submit({ description: DESC, governorate: 'أسوان' }), 201);
    const r2 = ok(await submit({ callback: 'noon' }), 201);
    assert.equal(r2.callback_from, '01000000777');
    assert.equal(r2.callback_eta_days, 3);
    assert.equal(r2.about_governorates[0], 'أسوان');
    assert.equal(r2.about_governorates.length, 7);
    t.app.settings.set('callback_from_number', '');
    t.app.settings.set('callback_eta_days', 1);
  });

  test('6. B91-01 with a call-back-only request: confirm link offered, staff replies stay on her page, nothing on WhatsApp', async () => {
    const r = ok(await submit({ name: 'أم سعيد', callback: 'any' }), 201);
    assert.match(r.confirm_url, /^https:\/\/wa\.me\/201000000001\?text=/);
    const row = intakeOf(r.reference);
    const reply = ok(await admin.post(`/api/admin/intakes/${row.id}/reply`, { body: 'هنكلمك النهارده إن شاء الله.' }));
    assert.equal(reply.channel, 'website');
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE client_id = ? AND channel = 'whatsapp'", row.client_id)), 0);
  });

  test('7. /api/portal/:token/about: intake governorate only when empty, never the client row; relation → pending submission; 404/400 rules', async () => {
    const r = ok(await submit({ description: DESC, topic: 'pen', answers: { 'pen.whose': 'takaful' } }), 201);
    const token = r.portal_url.split('/p/')[1];
    const row = intakeOf(r.reference);
    const c = t.client();
    ok(await c.post(`/api/portal/${token}/about`, { governorate: 'أسوان' }));
    assert.equal(intakeOf(r.reference).governorate, 'أسوان');
    assert.equal(t.app.db.get('SELECT governorate FROM clients WHERE id = ?', row.client_id).governorate, null, 'the client row is untouched');
    ok(await c.post(`/api/portal/${token}/about`, { governorate: 'الجيزة', relation: 'orphan_guardian' }));
    assert.equal(intakeOf(r.reference).governorate, 'أسوان', 'never overwritten');
    const sub = t.app.db.get('SELECT data, applied_at FROM beneficiary_submissions WHERE intake_id = ?', row.id);
    assert.equal(JSON.parse(sub.data).relation, 'orphan_guardian');
    assert.equal(sub.applied_at, null, 'pending until staff apply it');
    const fa = formOf(intakeOf(r.reference));
    assert.equal(fa.about.relation, 'orphan_guardian');
    assert.equal(fa.about.governorate, 'الجيزة');
    assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'client.about'", row.id));
    // رابط كامل (ليس رابط طلب واحد) أو رابط غير صالح → 404
    const full = t.app.clients.issuePortalToken(row.client_id);
    const fullToken = /\/p\/([A-Za-z0-9_-]+)/.exec(t.app.clients.portalUrl(full))[1];
    assert.equal((await c.post(`/api/portal/${fullToken}/about`, { governorate: 'أسوان' })).status, 404);
    assert.equal((await c.post('/api/portal/not-a-real-token-at-all-xx/about', { governorate: 'أسوان' })).status, 404);
    const empty = await c.post(`/api/portal/${token}/about`, {});
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, 'مفيش حاجة تتسجل.');
    assert.equal((await c.post(`/api/portal/${token}/about`, { governorate: 'باريس' })).status, 400);
    assert.equal((await c.post(`/api/portal/${token}/about`, { relation: 'queen' })).status, 400);
  });
});

// ───────────────────────── 8: ميزانية الشبكة البطيئة ─────────────────────────

describe('v9.2 public — the slow-network budget (§5.3)', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    setPublicRoot(PUB);
  });
  after(async () => t && t.close());
  // حجم كل ملف كما يُخدم (برقم إصداره: بلا أسطر التعليقات) مضغوطًا بـ brotli
  const served = (url) => br(transformAsset(path.join(PUB, url.split('?')[0])));
  const closure = (entry) => [entry, ...preloadClosure(path.join(PUB, entry), PUB)];

  test('8. / HTML ≤ 14 KB br and ≤ 70 KB raw; critical CSS ≤ 12 KB; landing ≤ 4 KB br; listen.js ≤ 3.5 KB br; /intake closure ≤ 32 KB br without recorder.js', async () => {
    // v11 gate-public (intended): the same limits on the gate state (no cookie) and the «خيري» cookie state of /
    for (const headers of [{}, { cookie: 'bm_seg=charity' }]) {
      const h = (await t.client().get('/', headers)).body;
      assert.ok(Buffer.byteLength(h) <= 70 * 1024, `raw ${Buffer.byteLength(h)} ${headers.cookie || 'gate'}`);
      assert.ok(br(Buffer.from(h)) <= 14 * 1024, `br ${br(Buffer.from(h))} ${headers.cookie || 'gate'}`);
      const c = /<style>([\s\S]*?)<\/style>/.exec(h)[1];
      assert.ok(Buffer.byteLength(c) <= 12 * 1024, `critical ${Buffer.byteLength(c)} ${headers.cookie || 'gate'}`);
    }
    const html = (await t.client().get('/')).body;
    const bm = /<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(html)[1];
    assert.ok(Buffer.byteLength(bm) <= 3072);
    const landing = closure('/assets/js/public/landing.js');
    assert.ok(!landing.some((u) => /listen\.js|intake\.js|ui\.js/.test(u)), landing.join(' '));
    const lsize = landing.reduce((s, u) => s + served(u), 0);
    assert.ok(lsize <= 4 * 1024, `landing ${lsize}`);
    assert.ok(served('/assets/js/public/listen.js') <= 3.5 * 1024);
    const intake = closure('/assets/js/public/intake.js');
    assert.ok(!intake.some((u) => /recorder\.js|upload\.js|listen\.js/.test(u)), intake.join(' '));
    const isize = intake.reduce((s, u) => s + served(u), 0);
    assert.ok(isize <= 32 * 1024, `intake closure ${isize}`);
    for (const f of ['listen.js', 'topics.js', 'pictos.js', 'nomodule.js']) assert.ok(!/^\s*import\s/m.test(read(`public/assets/js/public/${f}`)), f);
    assert.ok(fs.statSync(path.join(PUB, 'assets/js/public/nomodule.js')).size <= 300);
    // الشاشة الأولى ترسم من الصفحة نفسها: لا سكربت ولا ورقة أنماط قبل المربعات
    const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
    assert.ok(!/<link rel="stylesheet"/.test(head), 'no render-blocking stylesheet');
    assert.ok(!/<script(?![^>]*type="(?:module|application\/(?:ld\+)?json)")[^>]*>/.test(head), 'only module (deferred) scripts and JSON data in <head>');
    // التحميل المسبق: intake.js وكل ما يستورده ثابتًا وأنماط النموذج، بنفس أرقام الإصدار في /intake
    const prefetch = /data-prefetch="([^"]+)"/.exec(html)[1].split(' ');
    assert.ok(prefetch.some((u) => /^\/assets\/js\/public\/intake\.js\?v=/.test(u)));
    assert.ok(prefetch.some((u) => /^\/assets\/css\/v91-b-forms\.css\?v=/.test(u)));
    assert.ok(!prefetch.some((u) => /recorder\.js|upload\.js/.test(u)));
    const intakeHtml = (await t.client().get('/intake')).body;
    for (const u of prefetch) assert.ok(intakeHtml.includes(u), `${u} is the URL /intake asks for`);
  });
});

// ───────────────────────── 9–17: فحوص ثابتة ─────────────────────────

describe('v9.2 public — listening, copy, CSP, tokens and safety (static)', () => {
  const intake = read('public/assets/js/public/intake.js');
  const landing = read('public/assets/js/public/landing.js');
  const listen = read('public/assets/js/public/listen.js');
  const index = read('public/index.html');
  const intakeHtml = read('public/intake.html');
  const site = read('src/site.js');
  const route = read('src/routes/public.js');
  const portal = read('src/services/portal-v91.js');
  const pubCss = read('public/assets/css/public-site.css');
  const formsCss = read('public/assets/css/v91-b-forms.css');

  test('9. listen.js: Arabic voice only, waits for voiceschanged, never speaks at load, bm.listen in try/catch, start/error with a 2 s limit', async () => {
    assert.match(listen, /\/\^ar\/i/);
    assert.match(listen, /voiceschanged/);
    assert.ok(!/^(?:speak|L\.speak|G\.speechSynthesis\.speak)\(/m.test(listen), 'no top-level speak(');
    assert.match(listen, /const KEY = 'bm\.listen';/);
    assert.match(listen, /try \{\s*return G\.sessionStorage\?\.getItem\(KEY\) === '1';/);
    assert.match(listen, /try \{\s*if \(on\) G\.sessionStorage\.setItem\(KEY, '1'\);/);
    assert.match(listen, /const START_TIMEOUT_MS = 2000;/);
    assert.match(listen, /u\.onstart = /);
    assert.match(listen, /u\.onerror = /);
    assert.match(listen, /err === 'interrupted' \|\| err === 'canceled'/);
    assert.match(listen, /'not-allowed'/);
    const L = await import('../public/assets/js/public/listen.js');
    assert.equal(L.spellPhone('01012345678'), 'صفر، واحد، صفر. واحد، اتنين، تلاتة، أربعة. خمسة، ستة، سبعة، تمانية');
    assert.equal(L.numberWords(29), 'تسعة وعشرين');
    assert.equal(L.numberWords(100), 'مية');
    assert.equal(L.numberWords(1205), 'ألف وميتين وخمسة');
    assert.equal(L.numberWords(13), 'تلتاشر');
    assert.equal(await L.canListen(), false, 'no speechSynthesis in node → no button');
    // زر «بالصوت» في الصفحة الرئيسية: listen.js يُحمَّل عند الحاجة فقط، والزر مخفي حتى يوجد صوت عربي
    assert.match(landing, /import\('\.\/listen\.js'\)/);
    assert.ok(!/^import[^\n]*listen\.js/m.test(landing));
    assert.match(intake, /import\('\.\/listen\.js'\)/);
  });

  test('10. copy: the §5.2 strings are where they belong; banned words are absent; the first screen addresses nobody as a woman only', async () => {
    const has = (src, list, where) => list.forEach((s) => assert.ok(src.includes(s), `${where}: ${s}`));
    has(index, ['مشكلتك في إيه؟', 'مساعدة قانونية مجانية من {{{brand_inline}}}. ' /* v10 experience (intended): X10-B3 #5 */, 'مجاني وسرّي', '<b>مجاني وسرّي.</b> المحامي مش بيشوف رقمك.', 'سيبي رقمك وإحنا نكلمك', 'بالصوت', 'اسمعوا الكلام اللي في الصفحة', 'أهلًا بيكم. مشكلتكم في إيه؟ اضغطوا على الصورة.'], 'index.html');
    // v9.2 بوابة الدمج (تغيير مقصود، N5): «وقّف الصوت» أمر لراجل على الشاشة الأولى (S-25) ← الاسم «إيقاف الصوت»
    has(landing, ['بالصوت', 'إيقاف الصوت', 'اسمعوا الكلام اللي في الصفحة', 'وقّفوا الصوت', 'صفحة طلبك', 'مش موبايلك؟ امسحي'], 'landing.js');
    has(site, ['إحنا نكلمك', 'واتساب', 'طلبك فين؟', 'واتساب (يفتح في نافذة جديدة)', 'اتصال بالتليفون', 'إحنا نكلمكم ببلاش: اضغطوا هنا، واكتبوا الرقم.', 'ابعتولنا على واتساب، كتابة أو رسالة صوتية.', 'طلبك فين: لو بعتولنا طلب قبل كده.', 'ولو عايزين إحنا نكلمكم ببلاش، اضغطوا "إحنا نكلمك".', 'أو ابعتولنا على واتساب.', 'أو اعرفوا طلبكم وصل لفين.'], 'site.js');
    // v11 gate-public (intended: G11-05/r2 S16): نصوص قالب /intake مفاتيح؛ نص «خيري» نفسه في site-copy-paid.js (INTAKE_PAGE.charity)
    has(intakeHtml, ['{{intake_slow}}', '{{intake_old}}'], 'intake.html');
    has(read('src/site-copy-paid.js'), ["slow: 'الصفحة بتحمّل ببطء. تقدري تكلمينا على طول:'", "old: 'الصفحة دي مش شغالة على الموبايل ده. كلمينا على طول:'"], 'site-copy-paid.js');
    has(route + portal, ['اختيارات غير صالحة.', 'مفيش حاجة تتسجل.', 'اكتبي اسمك كامل، أو سيبيه فاضي.'], 'server');
    has(intake, [
      'مشكلتك في إيه؟',
      'تحبي تحكيلنا على واتساب؟ ',
      'افتحي واتساب',
      'ابعتي رسالة صوتية على واتساب',
      'أو سجّلي هنا',
      // v11 gate-public (intended: r2 S16): «2 من 4» بالمفتاح COPY.of
      "of: 'من'",
      '${COPY.of} ${total}',
      'مجاني وسرّي. المحامي مش بيشوف رقمك.',
      'احكيلنا مشكلتك',
      'اضغطي على الميكروفون واتكلمي بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
      'اكتبي جملة أو اتنين بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
      'أي مشكلة، وإحنا نوجّهك.',
      'اختاري أول اختيار: "السماح…" (Allow)',
      'كده تمام — كمّلي',
      'سجّلي رسالة كمان',
      'صوّري ورقة',
      'صوّري ورقة (لو عندك)',
      'زي شهادة الوفاة أو عقد. ممكن تبعتيه بعدين.',
      'اكتبي بدل الصوت',
      'مش عارفة تحكي؟ سيبي رقمك وإحنا نكلمك',
      'التالي',
      'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.',
      'رقم موبايلك',
      'عشان نكلمك ونبعتلك الرد.',
      'إحنا نكلمك',
      'اكتبي رقمك، وإحنا نتصل بيكي ببلاش.',
      'الموضوع (لو تحبي)',
      'أو اتصلي إنتي: ',
      'مقفولين دلوقتي',
      "placeholder: '01xxxxxxxxx'",
      // v11 gate-public (intended: r2 S16): نفس الاسم «رقم موبايلك» من COPY.phoneH1
      "'aria-label': COPY.phoneH1",
      'الرقم مظبوط',
      'اسمعي رقمك',
      'مش فاكرة رقمك؟',
      'ابعتيلنا على واتساب من موبايلك، وإحنا ناخد الرقم منها',
      'اكتبي رقم موبايلك.',
      'الرقم ده مش مظبوط. اكتبيه كده: 01012345678',
      'إمتى يناسبك نكلمك؟',
      'اسمك (لو تحبي)',
      'زي: أم محمد أو أبو محمد',
      'اكتبي اسمك كامل، أو سيبيه فاضي.',
      'لما تضغطي "ابعتي طلبك"، بتوافقي إن المؤسسة تستخدم كلامك ورقمك عشان تساعدك بس.',
      'لما تضغطي "اطلبي مكالمة"، بتوافقي إن المؤسسة تستخدم رقمك وكلامك عشان تساعدك بس.',
      'اعرفي أكتر',
      'ابعتي طلبك',
      'اطلبي مكالمة',
      'مشكلتك: ',
      'رسالة صوتية (',
      'كتابة',
      'هنسمعها منك في المكالمة',
      'تعديل',
      'خلال يوم شغل',
      'خلال يومين شغل',
      'أيام شغل',
      'من الرقم ده',
      'بنرد ',
      'هنكلمك ونسمع مشكلتك.',
      'صفحة طلبك',
      'وصلنا طلبك. رقم طلبك ',
      'كمان سؤالين — لو تحبي',
      'إنتي…؟', // v9.2 بوابة الدمج (تغيير مقصود، N9): بهمزة مثل «إنتي من أنهي محافظة؟»
      'تخطي',
      'شكرًا، كده تمام.',
      'محافظة تانية',
      'اسمعي',
      'وقّفي',
      'اسمعي السؤال',
    ]);
    // نصوص بصيغة المخاطَب ({ي}): تطابق نص المواصفة بالمؤنث
    for (const [tpl, want] of [
      // v11 gate-public (intended: r2 S16): الرقم {n} يُملأ عند العرض (COPY.cbRest) بدل ${num} داخل القالب
      ['أول ما ترد{ي} هنقولك "طلب رقم {n}" عشان تعرف{ي} إنه إحنا. لو ما رديت{ي}ش هنكلمك تاني.', 'أول ما تردي هنقولك "طلب رقم {n}" عشان تعرفي إنه إحنا. لو ما رديتيش هنكلمك تاني.'],
      ['اسمع{ي} الرقم', 'اسمعي الرقم'],
      ['لو عندك واتساب على الرقم ده، ابعت{ي}لنا الرسالة دي عشان نبعتلك كمان هناك', 'لو عندك واتساب على الرقم ده، ابعتيلنا الرسالة دي عشان نبعتلك كمان هناك'],
      ['ولو بعت{ي}لنا على واتساب، هنبعتلك هناك كمان.', 'ولو بعتيلنا على واتساب، هنبعتلك هناك كمان.'],
      ['إنت{ي} من أنهي محافظة؟', 'إنتي من أنهي محافظة؟'],
      ['ما اتسجلش. مش مشكلة، تقدر{ي} تقول{ي}لنا بعدين.', 'ما اتسجلش. مش مشكلة، تقدري تقوليلنا بعدين.'],
    ]) {
      assert.ok(intake.includes(tpl), tpl);
      assert.equal(genderize(tpl, 'f'), want);
    }
    for (const r of ['أرملة', 'وصية على أيتام', 'مطلقة', 'غير كده']) assert.ok(intake.includes(`'${r}'`), r);
    // ممنوع في النصوص الجديدة
    for (const src of [intake, landing, index, site, listen]) {
      for (const banned of ['لست متأكد', 'حضرتك']) assert.ok(!src.includes(banned), banned);
    }
    for (const gone of ['موافقة إن المؤسسة تستخدم', 'لازم توافقي', 'مش عارفة — كمّلي', 'اختاري الموضوع، أو اضغطي', 'ساكنة فين؟']) assert.ok(!intake.includes(gone), gone);
    // [S-25] أول شاشة (#start وزر الرأس) بلا أفعال مؤنثة
    const t = await startTestApp({ seed: 'none' });
    try {
      const html = (await t.client().get('/')).body;
      const first = /<section id="start"[\s\S]*?<\/section>/.exec(html)[0] + (/<a class="pub-head-contact[^>]*>/.exec(html) || [''])[0];
      for (const w of ['اختاري', 'اضغطي', 'تابعي', 'اتصلي', 'ابعتيلنا', 'اسمعي']) assert.ok(!first.includes(w), w);
    } finally {
      await t.close();
    }
  });

  test('11. CSP: no inline executable script on /, /intake and /portal; /intake loads nomodule.js', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      for (const p of ['/', '/intake', '/portal']) {
        const html = (await t.client().get(p)).body;
        const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/application\/(?:ld\+)?json/.test(m[1]));
        assert.equal(inline.length, 0, p);
      }
      const intakeHtml2 = (await t.client().get('/intake')).body;
      assert.match(intakeHtml2, /<script nomodule src="\/assets\/js\/public\/nomodule\.js\?v=[\w-]+"><\/script>/);
      assert.match(intakeHtml2, /<div class="bmf-card" data-fallback hidden>/);
    } finally {
      await t.close();
    }
  });

  test('12. CSS: one @brand-defaults block equal to LEGACY in public-site.css; picture classes and tile edges use the contract tokens', () => {
    const blocks = [...pubCss.matchAll(/\/\*\s*@brand-defaults-start\s*\*\/([\s\S]*?)\/\*\s*@brand-defaults-end\s*\*\//g)];
    assert.equal(blocks.length, 1);
    const decl = Object.fromEntries([...blocks[0][1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
    for (const [k, v] of Object.entries(LEGACY.primary)) assert.equal(decl[`--primary-${k}`], v, k);
    for (const [k, v] of Object.entries(LEGACY.accent)) assert.equal(decl[`--accent-${k}`], v, k);
    assert.equal(decl['--primary-700-rgb'], hexToRgb(LEGACY.primary[700]).join(' ')); // v10 experience (intended): follows the default scale
    assert.match(pubCss, /--on-accent: var\(--primary-900\);/);
    assert.match(pubCss, /\.pa \{\s*fill: var\(--primary-700\);/);
    assert.match(pubCss, /\.pb \{\s*fill: var\(--accent-600\);/);
    assert.match(pubCss, /\.pl \{\s*fill: var\(--primary-300\);/);
    assert.match(pubCss, /\.po \{\s*fill: none;\s*stroke: var\(--primary-700\);\s*stroke-width: 2\.5;/);
    // v11 visual (intended, L11-54/L11-48): the tile and answer edge is the --edge-strong ring — the same 2px of p500 (N3 ≥ 3:1)
    assert.match(pubCss, /--edge-strong: 0 0 0 2px var\(--primary-500\);/);
    assert.match(pubCss, /\.pub-pick-tile \{[^}]*box-shadow: var\(--edge-strong\)/);
    assert.match(formsCss, /\.bmf-answer \{[^}]*box-shadow: var\(--edge-strong\)/);
    assert.match(formsCss, /--bmf-teal: var\(--primary-700\);/);
    assert.match(formsCss, /\.bmf-btn\.bmf-btn-gold \{\s*background: var\(--bmf-gold\);\s*color: var\(--on-accent\);\s*border-color: var\(--accent-600\);/);
    for (const css of [pubCss, formsCss]) {
      for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 15, `font-size ${m[1]}px`);
    }
  });

  test('13. no internal file code in the success templates of intake.js', () => {
    const literals = intake.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [];
    for (const s of literals) assert.ok(!INTERNAL_CODE_RE.test(s), s);
    // v11 gate-public (intended: r2 S16): «طلب رقم …» في COPY.refNum، والرقم يُملأ عند العرض
    assert.match(intake, /طلب رقم \{n\}/);
    assert.match(intake, /fill\(COPY\.refNum, \{ n: num \}\)/);
  });

  test('14. [R2-B23] slow network: a server-rendered block with a tel: link, revealed by CSS after 8 s, removed by intake.js before anything waits', () => {
    const slow = /<div class="bmf-card bmf-slow" data-slow>([\s\S]*?)<\/div>/.exec(intakeHtml);
    assert.ok(slow && slow[1].includes('href="tel:{{org_phone_href}}"'));
    assert.match(formsCss, /\.bmf-slow \{[^}]*visibility: hidden;[^}]*opacity: 0;[^}]*animation: bmf-slow-in 0s 8s forwards;/);
    assert.match(formsCss, /@keyframes bmf-slow-in \{\s*to \{\s*visibility: visible;\s*opacity: 1;/);
    const removeAt = intake.indexOf("document.querySelector('[data-slow]')?.remove();");
    assert.ok(removeAt > 0);
    for (const first of [intake.search(/\bawait\b/), intake.indexOf('import(')]) assert.ok(removeAt < first, 'removed before the first await/import(');
  });

  test('15–17. tap guard constants, the in-app browser branch, and a draft banner that never names the topic', () => {
    assert.match(intake, /const TAP_GUARD_MS = 450;/);
    assert.match(intake, /const PRESS_MS = 150;/);
    assert.match(intake, /performance\.now\(\) - screenShownAt >= TAP_GUARD_MS/);
    assert.match(intake, /setTimeout\(fn, PRESS_MS\)/);
    assert.ok(intake.includes('/FBAN|FBAV|FB_IAB|Instagram|; wv\\)/'));
    // v11 gate-public (intended: r2 S16): أزرار البانر ونصه من COPY (draft/draftNew) بنفس الكلام
    const banner = intake.slice(intake.indexOf("banner = h(\n    'section.bmf-banner'"), intake.indexOf('COPY.draftNew,'));
    assert.ok(banner.includes('COPY.draft') && intake.includes("draft: 'كنتي بدأتي طلب قبل كده.'"));
    assert.ok(!/label|topicByKey|state\.topic\b(?!: null)/.test(banner.replace(/topic: null/g, '')), 'the banner does not show the topic');
    // «ابدئي من الأول» يمسح الإجابات ووقت المكالمة والتسجيلات
    assert.match(banner, /await store\.clear\(\);\s*voiceEls\.forEach\(\(v\) => v\.destroy\(\)\);/);
    assert.match(banner, /answers: \{\}, callback: null/);
  });
});

// ───────────────────────── مراجعة 9.2: أخطاء وُجدت في المراجعة (اختبار لكل إصلاح) ─────────────────────────

describe('v9.2 public — review fixes', () => {
  const intake = read('public/assets/js/public/intake.js');
  const formsCss = read('public/assets/css/v91-b-forms.css');

  test('R1. cold /intake from the home page needs ≤ 6 new files (one round on HTTP/1.1): words.js and common.js load after the first screen and before sending', () => {
    setPublicRoot(PUB);
    const bare = (u) => u.split('?')[0];
    const intakeAll = ['/assets/js/public/intake.js', ...preloadClosure(path.join(PUB, 'assets/js/public/intake.js'), PUB).map(bare)];
    const landingAll = new Set(['/assets/js/public/landing.js', ...preloadClosure(path.join(PUB, 'assets/js/public/landing.js'), PUB).map(bare)]);
    assert.ok(!intakeAll.some((u) => /\/(words|common)\.js$/.test(u)), intakeAll.join(' '));
    // ملفات لم تحمّلها الصفحة الرئيسية + v91-b-forms.css (public-site.css والخطوط محمّلة منها)
    const fresh = intakeAll.filter((u) => !landingAll.has(u)).length + 1;
    assert.ok(fresh <= 6, `${fresh} new requests before the first question`);
    assert.ok(!/^import [^\n]*'\.\/(?:words|common)\.js'/m.test(intake));
    // شاشة النجاح تحتاج words.js: الإرسال ينتظره (مع upload.js) قبل POST، وفشله = «ما اتبعتش… جربي تاني»
    const send = intake.indexOf('await Promise.all([loadUpload(), loadExtras()]);');
    assert.ok(send > 0 && send < intake.indexOf("U.sendWithProgress('/api/public/intake'"));
    assert.match(intake, /loadExtras\(\)\.catch\(\(\) => \{\}\);/, 'loaded in the background after the first screen');
    // تحميل فشل على نت متقطع لا يُحفظ: «حاولي تاني» تحمّل من جديد
    assert.match(intake, /\(e\) => \{\s*uploadLoading = null;\s*throw e;/);
    assert.match(intake, /\(e\) => \{\s*extrasLoading = null;\s*throw e;/);
    assert.match(intake, /attribution: C\.getAttribution\(\),/);
    // نسخة whatsappUrl المحلية ترفض الرقم التوضيحي زي common.js
    assert.match(intake, /d === '201000000000' \? null/);
  });

  test('R2. a draft on the phone never overrides a new tap on the home page (another topic, or «إحنا نكلمك»)', () => {
    assert.match(intake, /const first = restored \? tappedOverDraft\(restored\) : entryScreen\(\);/);
    const fn = intake.slice(intake.indexOf('function tappedOverDraft('), intake.indexOf('// ───────── التهيئة'));
    assert.match(fn, /params\.get\('mode'\) === 'callback'\) return state\.cbDirect \? screen : entryScreen\(\);/);
    assert.match(fn, /answers: t\.key === state\.topic \? state\.answers : \{\}/, 'answers of the old topic are dropped');
    assert.ok(!/description|voiceEls|phone/.test(fn), 'her words, recordings and number stay');
  });

  test('R3. «كمان سؤالين»: after each answer the focus moves to the next question (not back to the top of the page)', () => {
    const card = intake.slice(intake.indexOf('function aboutCard('), intake.indexOf('// ───────── الموقع قيد التجهيز'));
    assert.match(card, /h\('p\.bmf-about-q', \{ tabindex: '-1' \}/);
    assert.match(card, /if \(i\) body\.firstChild\.focus\(\{ preventScroll: true \}\);/);
  });

  test('R4. the in-flow listen button is named by its visible words («اسمعي السؤال» included); R5. the call-back time choices are read aloud', () => {
    assert.ok(!intake.includes('اسمعي الكلام اللي في الصفحة'));
    // v11 gate-public (intended: r2 S16): الاسم «وقّفي الصوت» من COPY.stopAria
    assert.match(intake, /if \(speakingNow\) btn\.setAttribute\('aria-label', COPY\.stopAria\);\s*else btn\.removeAttribute\('aria-label'\);/);
    assert.ok(intake.includes("stopAria: 'وقّفي الصوت'"));
    assert.match(intake, /\.\.\.whenChips\.map\(\(c\) => \(\{ text: c\.textContent, el: c \}\)\),/);
  });

  test('R6. answer tiles stay ≥ 112px tall on every width (spec P8); only «مش عارفة» is 64px', () => {
    const css = formsCss.replace(/\/\*[\s\S]*?\*\//g, '');
    let alone = 0;
    for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sels = m[1].split(',').map((s) => s.trim());
      const h = /min-height:\s*(\d+)px/.exec(m[2]);
      if (!h || !sels.includes('.bmf-answer')) continue;
      // قاعدة .bmf-answer وحدها (في أي عرض شاشة، حتى داخل @media) لا تنزل عن 112px
      if (sels.length === 1) {
        alone += 1;
        assert.ok(Number(h[1]) >= 112, `.bmf-answer min-height ${h[1]}px`);
      }
    }
    assert.ok(alone >= 1);
    assert.match(css, /\.bmf-answer\.bmf-dontknow \{[^}]*min-height: 64px;/);
    // R7. صف «الرقم مظبوط / اسمعي رقمك» يختفي لما كل أولاده مخفيين (الأبناء المباشرين، مش أيقونة جوه سطر مخفي)
    assert.match(css, /\.bmf-phone-row:not\(:has\(> :not\(\[hidden\]\)\)\) \{\s*display: none;/);
  });
});

// ───────────────────────── بيانات العرض ─────────────────────────

describe('v9.2 public — demo data', () => {
  test('the demo has the three new website requests (call-back ورث, سكن وإيجار story, no-name call-back from «إحنا نكلمك»)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const row = (phone) => t.app.db.get("SELECT * FROM intakes WHERE contact_phone LIKE ? ORDER BY id DESC LIMIT 1", `%${phone.slice(1)}`);
      const first = (id) => t.app.db.get("SELECT body FROM messages WHERE intake_id = ? AND direction = 'in' ORDER BY id LIMIT 1", id).body;
      const a = row('01092000101');
      assert.equal(a.contact_name, 'أم يوسف');
      assert.deepEqual(JSON.parse(a.form_answers).answers, { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' });
      assert.equal(JSON.parse(a.form_answers).callback, 'morning');
      assert.equal(first(a.id), 'عايزة حد يكلمني — الصبح');
      const b = row('01092000102');
      assert.equal(b.contact_name, 'أم ريم');
      assert.deepEqual(JSON.parse(b.form_answers).answers, { 'rent.home': 'rented_old', 'rent.evict': 'yes' });
      assert.match(first(b.id), /صاحب البيت بعتلنا إنذار/);
      const c = row('01092000103');
      assert.equal(c.contact_name, null);
      assert.equal(first(c.id), 'محتاجين حد يكلمنا — أي وقت');
      assert.equal(JSON.parse(c.form_answers).entry, 'home_callback');
    } finally {
      await t.close();
    }
  });
});
