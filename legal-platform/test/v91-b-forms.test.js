// v9.1 b-forms — نموذج الطلب بثلاث خطوات: الرسالة الصوتية (audio/webm)، حدود المرفقات والوصف، كود التأكيد،
// إعادة الإرسال دون تكرار الطلب، صلاحيات الميكروفون وCSP لصفحتي الطلب والمتابعة فقط، وعدم إتاحة الرسائل الصوتية
// للمحامي ضمن «كل المستندات»؛ ثم فحوص ثابتة لنصوص الواجهة ومكوّنات التسجيل والتصوير والمسودات.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startTestApp, samplePdf } from './helpers.js';
import { ok, createLawyer, uniquePhone } from './lane-b-kit.test.js';
import { isCapturePage, securityHeaders } from '../src/http.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** تسجيل WebM صغير يبدأ بترويسة EBML (كما يسجّله Chrome على أندرويد) */
function sampleWebm(name = 'رسالة-صوتية.webm') {
  const buf = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), Buffer.from('webm opus fake payload for tests')]);
  return { filename: name, mime: 'audio/webm;codecs=opus', data_base64: buf.toString('base64') };
}
function sampleOgg(name = 'voice.ogg') {
  return { filename: name, mime: 'audio/ogg', data_base64: Buffer.from('OggS\x00\x02fake opus').toString('base64') };
}
function sampleM4a(name = 'voice.m4a') {
  const buf = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypM4A \x00\x00\x00\x00isomM4A ')]);
  return { filename: name, mime: 'audio/mp4', data_base64: buf.toString('base64') };
}
function sampleJpeg(name = 'شهادة-وفاة-1.jpg') {
  return { filename: name, mime: 'image/jpeg', data_base64: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64') };
}

const form = (extra = {}) => ({ name: 'أم محمد', phone: uniquePhone(), description: 'جوزي اتوفى من 8 شهور وعايزة أطلّع معاشه.', consent: true, ...extra });

describe('v9.1 b-forms — microphone and media-src only on /intake and /p/', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  test('the intake page and the follow-up page allow the microphone and blob: playback', async () => {
    for (const p of ['/intake', '/p/abcdefghijklmnop']) {
      const r = await t.client().get(p);
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get('permissions-policy'), /microphone=\(self\)/, p);
      assert.match(r.headers.get('permissions-policy'), /camera=\(\)/, `${p}: <input capture> needs no camera permission`);
      assert.match(r.headers.get('content-security-policy'), /media-src 'self' blob:/, p);
      assert.match(r.headers.get('content-security-policy'), /script-src 'self'(;|$)/, `${p}: scripts stay strict`);
    }
  });

  test('every other page and the API keep the microphone off and no media-src blob:', async () => {
    for (const p of ['/', '/portal', '/app', '/privacy', '/api/meta', '/intakes', '/pp/x', '/intake/x']) {
      const r = await t.client().get(p);
      assert.match(r.headers.get('permissions-policy'), /microphone=\(\)/, p);
      assert.doesNotMatch(r.headers.get('content-security-policy'), /media-src/, p);
    }
    assert.equal(isCapturePage('/intake'), true);
    assert.equal(isCapturePage('/intake/'), true);
    assert.equal(isCapturePage('/p/tok'), true);
    assert.equal(isCapturePage('/intakex'), false);
    assert.equal(isCapturePage('/api/public/intake'), false);
  });
});

describe('v9.1 b-forms — POST /api/public/intake', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  const submit = (body) => t.client().post('/api/public/intake', body);
  const intakeOf = async (ref) => {
    const list = ok(await admin.get(`/api/admin/intakes?q=${encodeURIComponent(ref)}`));
    const row = list.items.find((i) => i.code === ref);
    return ok(await admin.get(`/api/admin/intakes/${row.id}`));
  };

  test('a voice note with an empty description is accepted; stored as audio/webm and shown in the staff conversation', async () => {
    const res = ok(await submit(form({ description: '', documents: [sampleWebm()] })), 201);
    assert.match(res.reference, /^REQ-\d{4}-\d{5}$/);
    const d = await intakeOf(res.reference);
    assert.equal(d.documents.length, 1);
    assert.equal(d.documents[0].mime, 'audio/webm');
    assert.match(d.documents[0].filename, /\.webm$/);
    const first = d.messages.find((m) => m.direction === 'in');
    assert.equal(first.body, '[رسالة صوتية]');
    assert.equal(first.documents[0].mime, 'audio/webm', 'the staff conversation gets the mime to render an <audio> player');
    // ogg (Firefox) and mp4/m4a (iPhone) recordings are accepted too
    ok(await submit(form({ description: '', documents: [sampleOgg()] })), 201);
    ok(await submit(form({ description: '', documents: [sampleM4a()] })), 201);
  });

  test('a WebM file that is not EBML is rejected (content sniffing)', async () => {
    const fake = { filename: 'x.webm', mime: 'audio/webm', data_base64: Buffer.from('<html>not audio</html>').toString('base64') };
    const r = await submit(form({ description: '', documents: [fake] }));
    assert.equal(r.status, 400);
  });

  test('a short everyday description is enough; 4 letters without a voice note is refused in Arabic', async () => {
    ok(await submit(form({ description: 'جوزي مات ومعاش' })), 201);
    const bad = await submit(form({ description: 'معاش' }));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.');
    assert.equal((await submit(form({ description: '   ' }))).status, 400);
    assert.equal((await submit(form({ description: undefined }))).status, 400);
    // a voice note plus text keeps the text
    const both = ok(await submit(form({ description: 'ورث الشقة', documents: [sampleWebm()] })), 201);
    const d = await intakeOf(both.reference);
    assert.equal(d.messages.find((m) => m.direction === 'in').body, 'ورث الشقة');
  });

  test('attachment caps: 5 photos/documents + 3 voice notes', async () => {
    const five = Array.from({ length: 5 }, (_, i) => sampleJpeg(`صورة-${i + 1}.jpg`));
    const three = [sampleWebm('a.webm'), sampleWebm('b.webm'), sampleWebm('c.webm')];
    const r = ok(await submit(form({ documents: [...five, ...three] })), 201);
    assert.equal((await intakeOf(r.reference)).documents.length, 8);
    const six = await submit(form({ documents: [...five, samplePdf('6.pdf')] }));
    assert.equal(six.status, 400);
    assert.match(six.body.error, /لحد 5 صور/);
    const four = await submit(form({ documents: [...three, sampleWebm('d.webm')] }));
    assert.equal(four.status, 400);
    assert.match(four.body.error, /لحد 3 رسايل صوتية/);
    assert.equal((await submit(form({ documents: 'nope' }))).status, 400);
  });

  test('consent is required with a plain message', async () => {
    const r = await submit(form({ consent: false }));
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'لازم توافقي عشان نقدر نساعدك.');
  });

  test('confirm_url carries the request number and a 6-digit code; only its hash is stored and never sent to staff', async () => {
    const res = ok(await submit(form()), 201);
    assert.match(res.confirm_url, /^https:\/\/wa\.me\/201000000001\?text=/);
    const text = decodeURIComponent(res.confirm_url.split('?text=')[1]);
    const m = /^السلام عليكم، ده رقم طلبي (REQ-\d{4}-\d{5}) وكود التأكيد (\d{6})$/.exec(text);
    assert.ok(m, text);
    assert.equal(m[1], res.reference);
    const row = t.app.db.get('SELECT source_detail FROM intakes WHERE code = ?', res.reference);
    const sd = JSON.parse(row.source_detail);
    assert.equal(sd.confirm_hash, t.app.integrations.hmac('intake-confirm', m[2]));
    assert.notEqual(sd.confirm_hash, crypto.createHash('sha256').update(m[2]).digest('hex'), 'keyed hash, not a plain sha256 of 6 digits');
    assert.equal(sd.confirm_failures, 0);
    const days = (Date.parse(sd.confirm_expires_at) - Date.now()) / 86400000;
    assert.ok(days > 29.9 && days <= 30.01, String(days));
    assert.ok(!JSON.stringify(row.source_detail).includes(m[2]), 'the plain code is never stored');
    const d = await intakeOf(res.reference);
    assert.equal(d.intake.source_detail.confirm_hash, undefined, 'the hash of a 6-digit code would be guessable: not sent to the browser');
    assert.ok(res.portal_url.includes('/p/'));
  });

  test('no WhatsApp number configured → confirm_url and whatsapp_url are null', async () => {
    const t2 = await startTestApp({ seed: 'none', config: { whatsapp: { token: '', phoneNumberId: '', verifyToken: 'v', appSecret: '', numberDigits: '' } } });
    try {
      const res = ok(await t2.client().post('/api/public/intake', form()), 201);
      assert.equal(res.confirm_url, null);
      assert.equal(res.whatsapp_url, null);
      assert.ok(res.portal_url);
    } finally {
      await t2.close();
    }
  });

  test('resending the same submission (network dropped after the server answered) creates exactly one request', async () => {
    const before = ok(await admin.get('/api/admin/intakes')).total;
    const body = form({ submission_id: 'sub_' + crypto.randomBytes(12).toString('hex'), documents: [sampleWebm(), sampleJpeg()] });
    const a = ok(await submit(body), 201);
    const b = ok(await submit(body), 201);
    assert.equal(a.reference, b.reference);
    assert.notEqual(a.portal_url, b.portal_url, 'a fresh link for the same request');
    assert.equal(ok(await admin.get('/api/admin/intakes')).total, before + 1);
    assert.equal((await intakeOf(a.reference)).documents.length, 2, 'files are not saved twice');
    // the new link opens the same request
    const portal = ok(await t.client().get(`/api/portal/${b.portal_url.split('/p/')[1]}`));
    assert.ok(JSON.stringify(portal).includes(a.reference));
    // the old code no longer matches (a new one was issued)
    const codeA = decodeURIComponent(a.confirm_url).slice(-6);
    const codeB = decodeURIComponent(b.confirm_url).slice(-6);
    const sd = JSON.parse(t.app.db.get('SELECT source_detail FROM intakes WHERE code = ?', a.reference).source_detail);
    assert.equal(sd.confirm_hash, t.app.integrations.hmac('intake-confirm', codeB));
    if (codeA !== codeB) assert.notEqual(sd.confirm_hash, t.app.integrations.hmac('intake-confirm', codeA));
  });

  test('the same submission id from a different phone never returns someone else\'s request', async () => {
    const sid = 'sub_' + crypto.randomBytes(12).toString('hex');
    const a = ok(await submit(form({ submission_id: sid })), 201);
    const b = ok(await submit(form({ submission_id: sid })), 201); // form() picks a new phone
    assert.notEqual(a.reference, b.reference);
    const portal = ok(await t.client().get(`/api/portal/${b.portal_url.split('/p/')[1]}`));
    assert.ok(!JSON.stringify(portal).includes(a.reference));
  });
});

describe('v9.1 b-forms — voice notes are never part of «all documents» for a lawyer', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  test('a lead lawyer with default grants downloads the photo but gets 404 for the voice note until staff check it', async () => {
    const admin = await t.login('admin');
    const res = ok(await t.client().post('/api/public/intake', form({ description: 'ورث شقة في شبرا وإخوات جوزي رافضين', documents: [sampleJpeg(), sampleWebm()] })), 201);
    const intake = ok(await admin.get('/api/admin/intakes')).items.find((i) => i.code === res.reference);
    const conv = ok(
      await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ورث شقة', facts_shared: 'وقائع مختصرة', issues: [{ title: 'نصيب الأرملة' }] }),
      201,
    ).case;
    const detail = ok(await admin.get(`/api/admin/cases/${conv.id}`));
    const photo = detail.documents.find((d) => d.mime === 'image/jpeg');
    const voice = detail.documents.find((d) => d.mime === 'audio/webm');
    assert.ok(photo && voice);
    const defaults = ok(await admin.get(`/api/admin/cases/${conv.id}/default-grants?role=lead`));
    assert.ok(defaults.document_ids.includes(photo.id));
    assert.ok(!defaults.document_ids.includes(voice.id), 'voice notes are not in the default «all documents»');

    const lw = await createLawyer(admin, { specialties: ['INH'] });
    const a = ok(await admin.post(`/api/admin/cases/${conv.id}/assignments`, { lawyer_id: lw.id, role: 'lead', question: 'ما نصيب الأرملة؟' }), 201).assignment;
    const lawyer = await t.login(lw.username);
    assert.equal((await lawyer.get(`/api/documents/${photo.id}/download`)).status, 200);
    assert.equal((await lawyer.get(`/api/documents/${voice.id}/download`)).status, 404);

    // explicit staff choice
    const g = ok(await admin.get(`/api/admin/cases/${conv.id}`)).assignments.find((x) => x.id === a.id).grants;
    ok(await admin.put(`/api/admin/assignments/${a.id}/grants`, { ...g, document_ids: [...g.document_ids, voice.id] }));
    assert.equal((await lawyer.get(`/api/documents/${voice.id}/download`)).status, 200);
  });
});

// ───────────── فحوص ثابتة لصفحة الطلب ومكوّنات التسجيل والتصوير والمسودات ─────────────

/** النصوص الظاهرة: ما بين علامات الاقتباس فقط (لا التعليقات) */
function visibleStrings(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const m of line.matchAll(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g)) out.push({ line: i + 1, text: m[0] });
  });
  return out;
}

describe('v9.1 b-forms — intake page and capture modules (static)', () => {
  const intake = read('public/assets/js/public/intake.js');
  const recorder = read('public/assets/js/public/recorder.js');
  const upload = read('public/assets/js/public/upload.js');
  const drafts = read('public/assets/js/public/drafts.js');
  const html = read('public/intake.html');

  test('the page is light: no Google Fonts, no component library CSS, own stylesheet', () => {
    assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html));
    assert.ok(!html.includes('/assets/css/app.css'));
    // v11 gate-public (intended: G11-05 + r2 S16): العنوان مفتاح {{intake_title}}، ونص «خيري» نفسه في site.js (intakeView)
    assert.match(html, /<title>\{\{intake_title\}\}<\/title>/);
    assert.ok(read('src/site.js').includes('`احكيلنا مشكلتك — ${ps.site_name}`'));
    assert.match(html, /href="\/assets\/css\/v91-b-forms\.css"/);
    for (const src of [intake, recorder, upload, drafts]) assert.ok(!/from '\.\.\/lib\/ui\.js'|from '\.\.\/lib\/api\.js'/.test(src), 'no ui.js/api.js on the public form');
  });

  // v9.2 (تغيير مقصود): النموذج صار بالصور (سؤال في كل شاشة) بدل 3 خطوات؛ الورق زر في «احكيلنا»، والاسم اختياري،
  // والمحافظة والصفة بعد الإرسال («كمان سؤالين»)، والموافقة سطر فوق زر الإرسال بلا مربع (S-26)
  test('tile flow with the exact copy; removed fields and jargon are gone', () => {
    for (const s of [
      'احكيلنا مشكلتك',
      'مجاني وسرّي. المحامي مش بيشوف رقمك.',
      'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.',
      'الرقم ده مش مظبوط. اكتبيه كده: 01012345678',
      'كنتي بدأتي طلب قبل كده.',
      'الصور والتسجيل محتاجين يتعملوا تاني.',
      'النت رجع. تحبي تبعتي دلوقتي؟',
      'سجّلي رسالة كمان',
      // v9.2 (تغيير مقصود): نصوص §5.2
      'اضغطي على الميكروفون واتكلمي بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
      'اكتبي جملة أو اتنين بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
      'اكتبي بدل الصوت',
      'كده تمام — كمّلي',
      'مش عارفة تحكي؟ سيبي رقمك وإحنا نكلمك',
      'رقم موبايلك',
      'إحنا نكلمك',
      'اكتبي رقمك، وإحنا نتصل بيكي ببلاش.',
      'اسمك (لو تحبي)',
      'لما تضغطي "ابعتي طلبك"، بتوافقي إن المؤسسة تستخدم كلامك ورقمك عشان تساعدك بس.',
      'لما تضغطي "اطلبي مكالمة"، بتوافقي إن المؤسسة تستخدم رقمك وكلامك عشان تساعدك بس.',
      'ابعتي طلبك',
      'اطلبي مكالمة',
    ]) {
      assert.ok(intake.includes(s), s);
    }
    // v9.2 (تغيير مقصود): نصوص 9.1 التي حلت محلها الشاشات الجديدة
    for (const gone of ['عندك ورق يخص المشكلة؟', 'مفيش ورق دلوقتي — التالي', 'إزاي نوصلّك؟', 'سؤالين اختياريين يساعدونا نفهم ظروفك', 'الموضوع عن إيه؟ (لو تعرفي)', 'موافقة إن المؤسسة تستخدم بياناتي عشان تساعدني بس.', 'لازم توافقي عشان نقدر نساعدك.']) {
      assert.ok(!intake.includes(gone), gone);
    }
    const shown = [intake, recorder, upload].flatMap((src) => visibleStrings(src).map((x) => x.text)).join('\n');
    for (const banned of ['لست متأكد', 'عدد الأحرف', 'اسحبها', 'ميجابايت', 'فريق الإدارة', 'تحديد الاستحقاق', 'نموذج منظم', 'البريد الإلكتروني', 'صفة مقدّم الطلب']) {
      assert.ok(!shown.includes(banned), banned);
    }
    assert.match(intake, /const MIN_CHARS = 10;/);
    assert.match(intake, /submission_id: state\.sid/, 'retries reuse one submission id');
    // v11 gate-public (intended: L11-53): مسودة لكل جانب؛ مسودة «خيري» بنفس مفتاح 10.0
    assert.match(intake, /draftStore\(keyOf\(SEG\)\)/);
    assert.match(intake, /const keyOf = \(s\) => \(s === 'paid' \? `\$\{DRAFT_KEY\}-paid` : DRAFT_KEY\);/);
    assert.match(intake, /const DRAFT_KEY = 'intake';/);
    // v9.2 (تغيير مقصود): المسجّل يُحمَّل عند الحاجة (import ديناميكي) ولا يدخل حزمة أول شاشة
    assert.ok(!/^import[^\n]*recorder\.js/m.test(intake), 'no static import of recorder.js');
    assert.match(intake, /import\('\.\/recorder\.js'\)/);
  });

  test('success screen: one-tap WhatsApp confirmation only with confirm_url, save the page to herself, honest steps', () => {
    for (const s of ['وصلنا طلبك', 'الخدمة مجانية، ومحدش هيطلب منك فلوس.', 'خطوة أخيرة مهمة', 'ابعت{ي} رقم الطلب على واتساب', 'بعت{ي}ها؟ هيوصلك رد مننا على واتساب.', 'احفظ{ي} صفحة طلبك', 'افتح{ي} صفحة طلبك', 'نسخ الرابط', 'اتنسخ', 'ابعت{ي}ه لنفسك بس، مش لحد تاني.', 'اتحفظت كمان على الموبايل ده.', 'هيحصل إيه بعد كده؟', 'ممكن نطلب منك ورقة أو معلومة.', "s3page: 'على صفحتك'", "s3sent: 'على واتساب وعلى صفحتك'", "s3wa: 'على صفحتك، وعلى واتساب لو بعت{ي}لنا رقم الطلب'", '!confirmUrl ? COPY.s3page : sent ? COPY.s3sent : g(COPY.s3wa)', 'https://wa.me/?text=']) {
      // v11 gate-public (intended: r2 S16): النصوص في جدول COPY والشاشة تقرؤها بالمفتاح
      assert.ok(intake.includes(s), s);
    }
    assert.match(intake, /\^https:\\\/\\\/wa\\\.me\\\/\\d\+\\\?text=/, 'only a wa.me/<digits> confirm_url is used');
    assert.match(intake, /rememberPortal\(\{ url: portal, ref \}, \{ force: true \}\)/, 'the page is saved on this phone (bm_portal via saved.js)');
    assert.match(intake, /forgetSaved\(\)/);
    assert.ok(!/icon\('upload'|ic\('upload'/.test(intake), 'the open-page button does not use the upload icon');
  });

  test('recorder: MediaRecorder settings, Arabic labels, permission note and denied fallback', () => {
    assert.match(recorder, /\['audio\/mp4', 'audio\/webm;codecs=opus', 'audio\/webm'/);
    assert.match(recorder, /const BITRATE = 24000;/);
    assert.match(recorder, /export function voiceRecorder\(\{ maxSeconds = 180, onChange/);
    assert.match(recorder, /export async function blobToUpload\(blob, filename/);
    for (const s of ['اضغطي وسجّلي رسالة صوتية', 'الموبايل هيسألك: تسمحي بالميكروفون؟ اختاري «سماح».', 'بنسجّل… اتكلمي براحتك', 'خلّصت', 'اسمعيها', 'امسحيها', 'الموبايل مش سامح بالميكروفون. اكتبي هنا بدل كده', 'تحبي تبعتي رسالة صوتية؟', 'رسالتك الصوتية ']) {
      assert.ok(recorder.includes(s), s);
    }
  });

  test('upload: camera first, compression to 1600px JPEG, XHR progress, plain errors', () => {
    assert.match(upload, /accept: 'image\/\*', capture: 'environment'/);
    assert.match(upload, /accept: 'image\/\*,application\/pdf'/);
    assert.match(upload, /export function photoPicker\(\{/);
    assert.match(upload, /export async function compressImage\(file, \{ maxSide = 1600, quality = 0\.75 \} = \{\}\)/);
    assert.match(upload, /export function sendWithProgress\(url, body, \{ onProgress/);
    assert.match(upload, /xhr\.upload\.addEventListener\('progress'/);
    assert.match(upload, /canvas\.toBlob\(resolve, 'image\/jpeg', quality\)/);
    for (const s of ['صوّري ورقة', 'اختاري صورة أو ملف من الموبايل', 'شيلي الصورة دي', 'بنجهّز الصور…', 'الملف ده مش هينفع. جربي صورة بدل منه.', 'ما تقفليش الصفحة', 'حطي الورقة على ترابيزة في مكان منوّر، وخلي الأربع أركان باينين.']) {
      assert.ok(upload.includes(s), s);
    }
  });

  test('drafts: IndexedDB bm-drafts with a localStorage text mirror, 7-day expiry, size cap, everything guarded', () => {
    assert.match(drafts, /const DB_NAME = 'bm-drafts';/);
    assert.match(drafts, /const lsKey = \(key\) => `bm_\$\{key\}_draft`;/);
    assert.match(drafts, /7 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(drafts, /const MAX_BLOB_BYTES = /);
    assert.match(drafts, /export function draftStore\(key\)/);
    assert.match(drafts, /export async function clearAllDrafts\(\)/);
  });

  test('pure helpers: clock() and photosText() agree with Arabic counting', async () => {
    const { clock } = await import('../public/assets/js/public/recorder.js');
    const { photosText } = await import('../public/assets/js/public/upload.js');
    assert.equal(clock(45), '0:45');
    assert.equal(clock(180), '3:00');
    assert.equal(clock(12.4), '0:12');
    assert.equal(photosText(1), 'صورة واحدة');
    assert.equal(photosText(2), 'صورتين');
    assert.equal(photosText(5), '5 صور');
    assert.equal(photosText(12), '12 صورة');
  });
});

describe('v9.1 b-forms — demo data', () => {
  test('the demo has website requests sent by voice note (one with a photographed paper)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const list = ok(await admin.get('/api/admin/intakes?limit=100'));
      const it = list.items.find((i) => i.contact_name === 'أم ياسين');
      assert.ok(it, 'أم ياسين');
      const d = ok(await admin.get(`/api/admin/intakes/${it.id}`));
      assert.deepEqual(d.documents.map((x) => x.mime).sort(), ['audio/webm', 'image/jpeg']);
      assert.equal(d.intake.first_channel, 'website');
      const audio = d.documents.find((x) => x.mime === 'audio/webm');
      const dl = await admin.get(`/api/documents/${audio.id}/download`);
      assert.equal(dl.status, 200);
      assert.equal(dl.headers.get('content-type'), 'audio/webm');
      assert.ok(list.items.some((i) => i.contact_name === 'سماح عبد الرحمن'));
    } finally {
      await t.close();
    }
  });
});

// ───────────── مراجعة b-forms: إصلاحات المراجِع ─────────────

describe('v9.1 b-forms review — headers follow the path the router actually serves', () => {
  const fakeRes = (url) => {
    const headers = {};
    return { req: { url }, setHeader: (k, v) => (headers[k.toLowerCase()] = v), headers };
  };
  test('a dot-segment path that resolves to /app never gets the microphone or media-src blob:', () => {
    for (const url of ['/p/../app', '/p/%2e%2e/app', '/intake/../app', '/p/x/../../app?y=1']) {
      const r = fakeRes(url);
      securityHeaders(r);
      assert.match(r.headers['permissions-policy'], /microphone=\(\)/, url);
      assert.doesNotMatch(r.headers['content-security-policy'], /media-src/, url);
    }
  });
  test('the real capture pages (with a query string) still get them', () => {
    for (const url of ['/intake', '/intake?area=INH&topic=custody', '/p/abcdefghijklmnop', '/p/abc?x=1']) {
      const r = fakeRes(url);
      securityHeaders(r);
      assert.match(r.headers['permissions-policy'], /microphone=\(self\)/, url);
      assert.match(r.headers['content-security-policy'], /media-src 'self' blob:/, url);
    }
  });
});

describe('v9.1 b-forms review — drafts never freeze the page when IndexedDB hangs', () => {
  test('load() and clear() give up on a hung indexedDB.open and fall back to the text copy', async () => {
    const saved = { indexedDB: globalThis.indexedDB, localStorage: globalThis.localStorage };
    const mem = new Map();
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
    // WebKit bug: open() returns a request whose callbacks never fire
    globalThis.indexedDB = { open: () => ({}) };
    try {
      const { draftStore } = await import(`../public/assets/js/public/drafts.js?hung=${Date.now()}`);
      mem.set('bm_intake_draft', JSON.stringify({ v: 1, saved_at: Date.now(), had_blobs: true, data: { name: 'أم محمد', step: 2 } }));
      const store = draftStore('intake');
      const t0 = Date.now();
      const [d] = await Promise.all([store.load(), store.clear()]);
      const ms = Date.now() - t0;
      assert.ok(ms < 6000, `gave up in ${ms}ms`);
      assert.equal(d.name, 'أم محمد', 'the text copy still restores');
      assert.equal(d._blobsLost, true, 'and says the photos/recordings must be redone');
      assert.equal(mem.has('bm_intake_draft'), false, 'clear() removed the text copy');
    } finally {
      globalThis.indexedDB = saved.indexedDB;
      globalThis.localStorage = saved.localStorage;
    }
  });
});

describe('v9.1 b-forms review — form, success screen and staff dialog details (static)', () => {
  const intake = read('public/assets/js/public/intake.js');
  const recorder = read('public/assets/js/public/recorder.js');
  const css = read('public/assets/css/v91-b-forms.css');
  const caseDetail = read('public/assets/js/app/pages/admin/case-detail.js');

  test('success never waits on a slow draft store, and the phone back button leaves the page', () => {
    assert.match(intake, /Promise\.race\(\[store\.clear\(\)/);
    assert.match(intake, /history\.go\(-\(depth - 1\)\)/);
    assert.match(intake, /history\.scrollRestoration = 'manual'/);
  });

  test('one spoken number on the success screen: «طلب رقم 29» replaces «قوليه لو كلمتينا» when it exists', () => {
    // v11 gate-public (intended: r2 S16): نفس النص في COPY.refSay، والشاشة تقرؤه بالمفتاح
    assert.match(intake, /num \? '' : g\(COPY\.refSay\)/);
    assert.ok(intake.includes("refSay: ' — قول{ي}ه لو كلمت{ي}نا.'"));
  });

  test('a finished voice note clears the step-1 error; focus follows the recorder (خلّصت → اسمعيها)', () => {
    assert.match(intake, /if \(el\.getBlob\(\)\) clearProblemError\?\.\(\)/);
    assert.match(recorder, /recording: '\.bmf-rec-stop', recorded: '\.bmf-rec-play'/);
  });

  test('nothing below 15px and the small links are 48px tap targets', () => {
    for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 15, `font-size ${m[1]}px`);
    for (const sel of ['.bmf-tip-ok', '.bmf-small-link']) {
      const block = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
      assert.match(block, /min-height: 48px/, sel);
    }
  });

  test('staff «share the reply with the lawyer» never pre-ticks her voice notes', () => {
    assert.match(caseDetail, /document_ids: docs\.filter\(\(d\) => d\.info_request_id === r\.id && !String\(d\.mime \|\| ''\)\.startsWith\('audio\/'\)\)/);
  });
});

describe('v9.1 b-forms review — an edit after an uncertain failed send is never silently dropped', () => {
  const intake = read('public/assets/js/public/intake.js');
  test('same content → same submission id (one request); changed content → a new submission id', () => {
    // the fingerprint ignores the submission id itself and survives a killed tab (saved in the draft)
    assert.match(intake, /fingerprint\(JSON\.stringify\(\{ \.\.\.payload, submission_id: undefined \}\)\)/);
    assert.match(intake, /if \(state\.sentFp && fp !== state\.sentFp\) \{\s*state\.sid = newSubmissionId\(\);/);
    assert.match(intake, /if \(network && lastFp\) \{\s*state\.sentFp = lastFp;/);
    assert.match(intake, /sentFp: state\.sentFp,/);
  });
  test('server side: the same id + same phone returns the first request even when the content differs (why the client must rotate)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const sid = 'sub_' + crypto.randomBytes(12).toString('hex');
      const phone = uniquePhone();
      const a = ok(await t.client().post('/api/public/intake', form({ phone, submission_id: sid })), 201);
      const b = ok(await t.client().post('/api/public/intake', form({ phone, submission_id: sid, documents: [sampleJpeg()] })), 201);
      assert.equal(a.reference, b.reference);
      const c = ok(await t.client().post('/api/public/intake', form({ phone, submission_id: 'sub_' + crypto.randomBytes(12).toString('hex'), documents: [sampleJpeg()] })), 201);
      assert.notEqual(c.reference, a.reference, 'a rotated id sends the edited request');
    } finally {
      await t.close();
    }
  });
});
