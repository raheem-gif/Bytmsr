// v9.1 — مسار b-site: قاعدة القناة الواحدة وتأكيد الرقم بنقرة واحدة (B91-01)، الصفحة الرئيسية (B91-07)،
// صياغة رسائل المستفيد/ة (B91-10)، ميزانية الشبكة البطيئة (B91-11)، نظام الكلمات والأحجام (B91-12)،
// «بالمختصر» في السياسات (B91-15)، وحزمة الموقع الخفيفة (B91-20).
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, waPayload, freezeClock, resetClock } from './helpers.js';
import { ok, createLawyer, newCase, uniquePhone, phoneCore, outbox, runAutomations, plusDays, notificationsOf } from './lane-b-kit.test.js';
import { addressName, addressForm, genderize, spokenTime, spokenDate, dayWord } from '../src/util.js';
import * as words from '../public/assets/js/public/words.js';
import { DEFAULT_AUTOMATION_RULES, LEGACY_AUTOMATION_TEMPLATES, CLIENT_TEXTS } from '../src/constants.js';
import { ratingFromWords, TEMPLATE_PURPOSES } from '../src/services/messaging.js';
import { FAQ, SERVICES, daysWord } from '../src/site.js';
import { assetVersion } from '../src/http.js';
import { preloadClosure } from '../src/site-assets.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const T0 = '2026-11-02T08:00:00.000Z';
const NO_WA = { whatsapp: { token: '', phoneNumberId: '', verifyToken: 'verify-me', appSecret: '', numberDigits: '' } };
const INTERNAL_CODE_RE = /\b(?:CL-\d|INH-|FAM-|GRD-|PEN-|PRP-|CIV-|LAB-|CRM-|COM-|TAX-|ADM-|GEN-|MTR-|INV-)/;

afterEach(() => resetClock());

const desc = 'جوزي اتوفى من 4 شهور ومش عارفة أطلّع معاشه أنا والعيال، ومحدش راضي يقولي محتاجة ورق إيه.';
const waFrom = (local) => `20${local.slice(1)}`;
const codeOf = (confirmUrl) => /كود التأكيد (\d{6})/.exec(decodeURIComponent(confirmUrl.split('?text=')[1]))[1];
const wordsIn = (s) => String(s).split(/\s+/).filter(Boolean).length;

async function websiteIntake(t, phone = uniquePhone(), name = 'أم محمد عبد الله') {
  const r = ok(await t.client().post('/api/public/intake', { name, phone, consent: true, description: desc, attribution: {} }), 201);
  const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
  return { r, intake, phone };
}

// ───────────────────────── B91-12: كلمات المستفيد/ة (الخادم والواجهة نفس القواعد) ─────────────────────────

describe('v9.1 b-site — words: address, gender, spoken time (server util.js = public words.js)', () => {
  test('addressName keeps the kunya, never «أم» alone; handles «عبد …»', () => {
    for (const fn of [addressName, words.addressName]) {
      assert.equal(fn('أم محمد عبد الله'), 'أم محمد');
      assert.equal(fn('ابو أحمد'), 'ابو أحمد');
      assert.equal(fn('سامية محمود'), 'سامية');
      assert.equal(fn(''), '');
      assert.equal(fn('أم'), '');
      assert.equal(fn('عبد الله محمد'), 'عبد الله');
    }
  });

  test('address form: staff choice first, «أبو …» is masculine, otherwise feminine; {ي}/{ة} tokens', () => {
    assert.equal(addressForm({ name: 'ابو أحمد' }), 'm');
    assert.equal(addressForm({ name: 'سامية' }), 'f');
    assert.equal(addressForm({ name: 'سامية', address_form: 'm' }), 'm');
    assert.equal(words.addressForm('أبو يوسف'), 'm');
    assert.equal(genderize('صوّر{ي} الورقة وابعت{ي}ها، ولو مش لاقي{ة}', 'm'), 'صوّر الورقة وابعتها، ولو مش لاقي');
    assert.equal(words.genderize('صوّر{ي} الورقة وابعت{ي}ها، ولو مش لاقي{ة}', 'f'), 'صوّري الورقة وابعتيها، ولو مش لاقية');
    assert.equal(words.say('صوّري', 'm'), 'صوّر');
    assert.equal(words.say('اقري', 'm'), 'اقرا');
    assert.equal(words.say('هات'), 'هاتي');
    assert.equal(words.say('كلمة غير معروفة', 'm'), 'كلمة غير معروفة');
  });

  test('spokenTime in Cairo time: 10 الصبح, 1 الضهر, 4 العصر, 8 بالليل; dayWord and spokenDate', () => {
    for (const fn of [spokenTime, words.spokenTime]) {
      assert.equal(fn('2026-10-09T07:00:00Z'), '10 الصبح');
      assert.equal(fn('2026-10-09T10:00:00Z'), '1 الضهر');
      assert.equal(fn('2026-10-09T13:00:00Z'), '4 العصر');
      assert.equal(fn('2026-10-09T17:00:00Z'), '8 بالليل');
      assert.equal(fn('2026-10-09T07:30:00Z'), '10 ونص الصبح');
    }
    const now = '2026-10-07T08:00:00Z';
    const d = (n) => new Date(Date.parse(now) + n * 86400000).toISOString();
    for (const fn of [dayWord, words.dayWord]) {
      assert.equal(fn(d(0), now), 'النهارده');
      assert.equal(fn(d(1), now), 'بكرة');
      assert.equal(fn(d(2), now), 'بعد يومين');
      assert.equal(fn(d(3), now), 'بعد 3 أيام');
      assert.equal(fn('2026-10-23T08:00:00Z', now), 'يوم الجمعة 23 أكتوبر');
    }
    assert.equal(spokenDate('2026-10-09T08:00:00Z'), 'الجمعة 9 أكتوبر');
    assert.equal(words.when('2026-10-08T07:00:00Z', Date.parse(now)), 'بكرة الساعة 10 الصبح');
  });

  test('glossary: plain explanation on first use per screen only', () => {
    assert.equal(words.gloss('إعلام الوراثة'), 'إعلام الوراثة (ورقة من المحكمة بتقول مين الورثة)');
    const seen = new Set();
    const a = words.glossText('عندك جلسة يوم الجمعة', seen);
    assert.equal(a, 'عندك جلسة (ميعاد في المحكمة) يوم الجمعة');
    assert.equal(words.glossText('والجلسة الجاية كمان', seen), 'والجلسة الجاية كمان', 'second use on the same screen is not glossed again');
    assert.match(words.glossText('محتاجين القيد العائلي والنفقة'), /القيد العائلي \(ورقة فيها أفراد الأسرة\).*والنفقة \(مصاريف العيال الشهرية\)/);
  });

  test('survey words: «مش راضية» / «مش راضي» = 1, «راضية» = 4', () => {
    assert.equal(ratingFromWords('مش راضية'), 1);
    assert.equal(ratingFromWords('مش راضي'), 1);
    assert.equal(ratingFromWords('راضية'), 4);
    assert.equal(ratingFromWords('ممتاز'), 5);
  });
});

// ───────────────────────── B91-01: قاعدة القناة الواحدة وتأكيد الرقم ─────────────────────────

describe('v9.1 b-site — one channel rule and one-tap WhatsApp confirmation (B91-01)', () => {
  test('unconfirmed website number: replies stay on the portal, explicit WhatsApp is refused, nothing is ever recorded on WhatsApp', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const { intake } = await websiteIntake(t);
      const reply = ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'وصلنا طلبك، هنراجعه ونرد عليكي.' }));
      assert.equal(reply.channel, 'website');
      const wa = await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'رسالة على واتساب', channel: 'whatsapp' });
      assert.equal(wa.status, 400);
      assert.match(wa.body.error, /^رقم هذا الطلب غير مؤكد/);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE client_id = ? AND channel = 'whatsapp'", intake.client_id)), 0);
      const detail = ok(await admin.get(`/api/admin/intakes/${intake.id}`));
      assert.equal(detail.intake.identity.reply_channel.text, 'صفحة المتابعة فقط — الرقم غير مؤكد');
      assert.equal(detail.intake.source_detail.confirm_hash, undefined, 'the code hash never leaves the server');
    } finally {
      await t.close();
    }
  });

  test('document reminder for an unconfirmed story: no WhatsApp, one staff notice per staff member with the REQ code, not repeated', async () => {
    freezeClock(T0);
    const t = await startTestApp({ config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const { r, intake } = await websiteIntake(t);
      const c = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'PEN', title: 'معاش الزوج' }), 201).case;
      const ir = ok(await admin.post(`/api/admin/cases/${c.id}/info-requests`, { kind: 'document', question: 'صورة شهادة الوفاة' }));
      assert.equal(ir.sent_channel, 'website');
      freezeClock(plusDays(T0, 2.2));
      await runAutomations(admin);
      await runAutomations(admin);
      const wa = (await outbox(admin)).filter((m) => m.client_id === intake.client_id && m.channel === 'whatsapp');
      assert.equal(wa.length, 0, 'no WhatsApp message to an unconfirmed number');
      const notes = (await notificationsOf(admin)).filter((n) => n.title.includes(r.reference) && n.type === 'automation.unconfirmed');
      assert.equal(notes.length, 1);
      assert.match(notes[0].body, /اضغطوا «تأكيد الهوية»/);
    } finally {
      await t.close();
    }
  });

  test('WhatsApp message with the REQ code and the confirmation code from the same number confirms the story; replies then go to WhatsApp and show in the portal', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const { r, intake, phone } = await websiteIntake(t);
      assert.match(r.confirm_url, /^https:\/\/wa\.me\/201000000001\?text=/);
      const text = decodeURIComponent(r.confirm_url.split('?text=')[1]);
      assert.equal(text, `السلام عليكم، ده رقم طلبي ${r.reference} وكود التأكيد ${codeOf(r.confirm_url)}`);
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(phone), name: 'أم محمد', text })));
      const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
      assert.equal(sd.identity_confirmed_via, 'whatsapp_ref');
      assert.equal(sd.confirm_hash, undefined, 'the code is single-use');
      const autoReply = t.app.db.all("SELECT * FROM messages WHERE client_id = ? AND direction = 'out' AND channel = 'whatsapp'", intake.client_id);
      assert.equal(autoReply.length, 1);
      assert.equal(autoReply[0].status, 'simulated');
      assert.ok(autoReply[0].body.includes('/p/') && autoReply[0].body.includes('رقم طلبك') && autoReply[0].body.includes(r.reference));
      assert.match(autoReply[0].body, /^أهلًا يا أم محمد،/);
      assert.equal(autoReply[0].to_address.slice(-10), phoneCore(phone));
      // الرابط في الرد بنطاق الرقم نفسه ويعرض الطلب الآن
      const link = /\/p\/([A-Za-z0-9_-]+)/.exec(autoReply[0].body)[1];
      const scoped = ok(await t.client().get(`/api/portal/${link}`));
      assert.ok(JSON.stringify(scoped).includes(r.reference));
      const activity = t.app.db.value("SELECT summary FROM activity WHERE intake_id = ? AND type = 'identity.confirmed'", intake.id);
      assert.match(activity, /أكّدت المستفيدة رقمها برسالة واتساب/);

      const reply = ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'أهلًا يا أم محمد، محتاجين شهادة الوفاة.' }));
      assert.equal(reply.channel, 'whatsapp');
      const token = r.portal_url.split('/p/')[1];
      const portal = ok(await t.client().get(`/api/portal/${token}`));
      assert.ok(JSON.stringify(portal).includes('محتاجين شهادة الوفاة'), 'the website-request link now shows WhatsApp replies too');
      const detail = ok(await admin.get(`/api/admin/intakes/${intake.id}`));
      assert.equal(detail.intake.identity.reply_channel.text, 'واتساب + صفحة المتابعة');
      for (const m of t.app.db.all("SELECT body FROM messages WHERE direction = 'out' AND channel = 'whatsapp'")) assert.ok(!INTERNAL_CODE_RE.test(m.body), m.body);
    } finally {
      await t.close();
    }
  });

  test('wrong codes do not confirm; after 5 wrong codes the right code no longer confirms and staff are notified', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const { r, intake, phone } = await websiteIntake(t);
      const right = codeOf(r.confirm_url);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(phone), text: `ده رقم طلبي ${r.reference} وكود التأكيد ${wrong}` })));
        const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
        assert.equal(sd.identity_confirmed_at, undefined);
      }
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(phone), text: `ده رقم طلبي ${r.reference} وكود التأكيد ${right}` })));
      const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
      assert.equal(sd.identity_confirmed_at, undefined, 'locked after 5 failures');
      assert.ok(sd.confirm_locked_at);
      const notes = (await notificationsOf(admin)).filter((n) => n.type === 'identity.confirm_locked');
      assert.equal(notes.length, 1);
      assert.ok(notes[0].title.includes(r.reference));
      assert.equal(ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'تمام' })).channel, 'website');
    } finally {
      await t.close();
    }
  });

  test('the right REQ and code from a DIFFERENT number never confirm (the identity-conflict warning still fires)', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const { r, intake } = await websiteIntake(t);
      const other = uniquePhone();
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(other), text: `ده رقم طلبي ${r.reference} وكود التأكيد ${codeOf(r.confirm_url)}` })));
      const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
      assert.equal(sd.identity_confirmed_at, undefined);
      assert.ok((await notificationsOf(admin)).some((n) => n.type === 'identity_conflict'));
      assert.equal(ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'تمام' })).channel, 'website');
    } finally {
      await t.close();
    }
  });

  test('confirm_url is null when no WhatsApp number is configured', async () => {
    const t = await startTestApp({ config: NO_WA });
    try {
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone: uniquePhone(), consent: true, description: desc }), 201);
      assert.equal(r.confirm_url, null);
    } finally {
      await t.close();
    }
  });

  test('staff «تأكيد الهوية» uses the same rule: the next reply goes to WhatsApp', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const { intake } = await websiteIntake(t);
      ok(await admin.post(`/api/admin/intakes/${intake.id}/confirm-identity`, {}));
      const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
      assert.equal(sd.identity_confirmed_via, 'staff');
      assert.ok(sd.identity_confirmed_by_name);
      assert.equal(ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'أهلًا' })).channel, 'whatsapp');
    } finally {
      await t.close();
    }
  });

  test('portal_update is a template purpose with first_name, org_name, portal_link and ref; every client purpose accepts the new variables', () => {
    assert.deepEqual([...TEMPLATE_PURPOSES.portal_update].sort(), ['first_name', 'org_name', 'portal_link', 'ref']);
    for (const p of ['case_update', 'survey', 'rule:hearing_reminder', 'rule:invoice_reminder', 'rule:document_reminder']) {
      for (const k of ['first_name', 'ref', 'portal_link', 'time_spoken']) assert.ok(TEMPLATE_PURPOSES[p].includes(k), `${p} ${k}`);
    }
    assert.ok(!TEMPLATE_PURPOSES.otp.includes('portal_link'));
  });
});

// ───────────────────────── B91-10: رسائل المستفيد/ة ─────────────────────────

describe('v9.1 b-site — every message she receives in plain words (B91-10)', () => {
  test('hearing reminder for a confirmed matter: her name, spoken time, link — no internal code, no «حضرتكم»', async () => {
    freezeClock(T0);
    const t = await startTestApp({ config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const M = await createLawyer(admin, { specialties: ['FAM'] });
      const k = await newCase(admin, { clientName: 'أم محمد عبد الله', legal_area: 'FAM', title: 'نفقة صغار' });
      const m = ok(await admin.post(`/api/admin/cases/${k.id}/matter`, { kind: 'litigation', responsible_lawyer_id: M.id, court: 'محكمة الأسرة بمدينة نصر' }), 201);
      ok(await admin.post(`/api/admin/matters/${m.id}/events`, { kind: 'hearing', starts_at: plusDays(T0, 2), client_attendance_required: true, location: 'محكمة الأسرة بمدينة نصر — الدور التاني' }));
      await runAutomations(admin);
      const rem = (await outbox(admin)).filter((x) => x.automation_rule === 'hearing_reminder' && x.matter_id === m.id);
      assert.equal(rem.length, 1);
      const body = rem[0].body;
      assert.match(body, /^أهلًا يا أم محمد، عندك جلسة يوم /);
      assert.match(body, /الصبح|الضهر|العصر|بالليل/);
      assert.match(body, /\/p\//);
      assert.ok(!/MTR-|حضرتكم/.test(body), body);
      assert.ok(body.includes('لازم تحضري بنفسك'));
      assert.ok(!/\{ي\}|\{ة\}|\{\w+\}/.test(body));
      assert.ok(body.length <= 600);
    } finally {
      await t.close();
    }
  });

  test('document reminder follows the address form: «أبو أحمد» → صوّر/ابعتها/قول لنا; a woman → صوّري/ابعتيها/قولي لنا', async () => {
    freezeClock(T0);
    const t = await startTestApp({ config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const male = await newCase(admin, { clientName: 'أبو أحمد السيد', legal_area: 'GRD', title: 'فلوس الأيتام' });
      const female = await newCase(admin, { clientName: 'سامية محمود', legal_area: 'PEN', title: 'معاش' });
      for (const k of [male, female]) ok(await admin.post(`/api/admin/cases/${k.id}/info-requests`, { kind: 'document', question: 'صورة إعلام الوراثة', client_message: 'محتاجين صورة إعلام الوراثة' }));
      freezeClock(plusDays(T0, 2.2));
      await runAutomations(admin);
      const rem = (await outbox(admin)).filter((x) => x.automation_rule === 'document_reminder');
      const forCase = (k) => rem.find((x) => x.case_id === k.id).body;
      assert.ok(forCase(male).includes('صوّر الورقة وابعتها'), forCase(male));
      assert.ok(forCase(male).includes('قول لنا'));
      assert.match(forCase(male), /^أهلًا يا أبو أحمد،/);
      assert.ok(forCase(female).includes('صوّري الورقة وابعتيها'), forCase(female));
      assert.ok(forCase(female).includes('قولي لنا'));
      for (const x of rem) {
        assert.ok(!/\{ي\}|\{ة\}/.test(x.body));
        assert.ok(!INTERNAL_CODE_RE.test(x.body), x.body);
        assert.match(x.body, /\/p\//);
      }
    } finally {
      await t.close();
    }
  });

  test('approving a document request: WhatsApp text carries «صوّري الورقة وابعتيها هنا» and a link; the portal shows only the clean request', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const k = await newCase(admin, { clientName: 'نادية فتحي', legal_area: 'INH', title: 'ورث' });
      const ir = ok(await admin.post(`/api/admin/cases/${k.id}/info-requests`, { kind: 'document', question: 'صورة شهادة الوفاة', client_message: 'محتاجين صورة شهادة الوفاة' }));
      const msg = t.app.db.get('SELECT * FROM messages WHERE id = ?', ir.outbound_message_id);
      assert.equal(msg.channel, 'whatsapp');
      assert.equal(msg.body, 'محتاجين صورة شهادة الوفاة');
      const meta = JSON.parse(msg.meta);
      assert.match(meta.wa_text, /^محتاجين صورة شهادة الوفاة\n\nصوّري الورقة وابعتيها هنا، أو من صفحتك: \S*\/p\//);
      const token = (await admin.post(`/api/admin/clients/${k.clientId}/portal-link`, {})).body.url.split('/p/')[1];
      const portal = JSON.stringify(ok(await t.client().get(`/api/portal/${token}`)));
      assert.ok(portal.includes('محتاجين صورة شهادة الوفاة'));
      assert.ok(!portal.includes('يمكنكم الرد على هذه الرسالة'));
      assert.ok(!portal.includes('بخصوص ملفكم'));
    } finally {
      await t.close();
    }
  });

  test('new defaults: exact copy, ≤ 600 characters; the v9 defaults are upgraded automatically, an admin-edited text is kept', async () => {
    assert.equal(DEFAULT_AUTOMATION_RULES.hearing_reminder.params.template.split('\n')[0], 'أهلًا يا {first_name}، عندك {event_kind} يوم {date} الساعة {time_spoken}.');
    for (const k of ['hearing_reminder', 'invoice_reminder', 'document_reminder', 'satisfaction_survey']) {
      assert.ok(DEFAULT_AUTOMATION_RULES[k].params.template.length <= 600, k);
      assert.ok(LEGACY_AUTOMATION_TEMPLATES[k].length >= 1, k);
      assert.ok(!/حضرتكم|ملفكم/.test(DEFAULT_AUTOMATION_RULES[k].params.template), k);
    }
    assert.equal(CLIENT_TEXTS.otp, 'كود دخول صفحتك عند {org_name}: {code}\nمحدش من عندنا هيطلبه منك أبدًا.');
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      // قاعدة بيانات قائمة بقوالب الإصدار 9 كما هي
      const v9 = LEGACY_AUTOMATION_TEMPLATES.hearing_reminder[1];
      t.app.automations.ensureRules();
      t.app.db.run("UPDATE automation_rules SET params = json_set(params, '$.template', ?) WHERE key = 'hearing_reminder'", v9);
      t.app.db.run("UPDATE automation_rules SET params = json_set(params, '$.template', ?) WHERE key = 'satisfaction_survey'", LEGACY_AUTOMATION_TEMPLATES.satisfaction_survey[0]);
      const custom = 'نص عدّلته الإدارة يدويًا: {date}';
      ok(await admin.patch('/api/admin/automations/document_reminder', { params: { template: custom } }));
      const list = ok(await admin.get('/api/admin/automations')).rules;
      assert.equal(list.find((r) => r.key === 'hearing_reminder').params.template, DEFAULT_AUTOMATION_RULES.hearing_reminder.params.template);
      assert.equal(list.find((r) => r.key === 'satisfaction_survey').params.template, DEFAULT_AUTOMATION_RULES.satisfaction_survey.params.template);
      assert.equal(list.find((r) => r.key === 'document_reminder').params.template, custom);
      assert.equal((await admin.patch('/api/admin/automations/document_reminder', { params: { template: 'x'.repeat(601) } })).status, 400);
    } finally {
      await t.close();
    }
  });

  test('a survey answered with «مش راضية» on WhatsApp is recorded as rating 1', async () => {
    freezeClock(T0);
    const t = await startTestApp({ config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const phone = uniquePhone();
      const k = await newCase(admin, { phone, clientName: 'هالة', legal_area: 'FAM', title: 'نفقة' });
      const ans = ok(await admin.post(`/api/admin/cases/${k.id}/client-answers`, { body: 'ردنا على مشكلتك: تقدري ترفعي دعوى نفقة، ومش محتاجة محامي في الأول.' }));
      ok(await admin.post(`/api/admin/client-answers/${ans.id}/send`, {}));
      freezeClock(plusDays(T0, 1.1));
      await runAutomations(admin);
      const survey = t.app.db.get('SELECT * FROM case_surveys WHERE case_id = ?', k.id);
      assert.ok(survey, 'survey sent');
      const sm = t.app.db.get('SELECT body FROM messages WHERE id = ?', survey.message_id);
      assert.match(sm.body, /^أهلًا يا هالة، يا ترى ردّنا فادك؟/);
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(phone), text: 'مش راضية' })));
      assert.equal(Number(t.app.db.value('SELECT rating FROM case_feedback WHERE survey_id = ?', survey.id)), 1);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── B91-07 / B91-11 / B91-15 / B91-20: الصفحات العامة ─────────────────────────

describe('v9.1 b-site — landing, legal pages and the slow-3G budget', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => t && t.close());

  const get = async (p) => {
    const r = await t.client().get(p);
    assert.equal(r.status, 200, p);
    return r.body;
  };
  const jsonBlock = (html) => {
    const m = /<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'bm-public block');
    return m[1];
  };

  test('landing: free and private on the first screen, one CTA «احكيلنا مشكلتك», no conditional «للمستحقين», plain-word tiles to /intake?area=', async () => {
    const html = await get('/');
    const hero = /<section class="pub-hero"[\s\S]*?<\/section>/.exec(html)[0];
    assert.ok(hero.includes('مجانًا.') && hero.includes('المحامي مش بيشوف رقمك'));
    assert.match(hero, /class="pub-btn pub-btn-gold pub-btn-primary" href="\/intake" data-cta="intake" data-hero-cta>احكيلنا مشكلتك</);
    assert.ok(!html.includes('للمستحقين'));
    assert.equal(SERVICES.length, 8);
    for (const s of SERVICES) {
      const m = new RegExp(`id="service-${s.key}">\\s*<a class="pub-tile-link" href="([^"]+)"`).exec(html);
      assert.ok(m, s.key);
      assert.equal(m[1], s.areas.length ? `/intake?area=${s.areas[0]}` : '/intake');
      assert.ok(html.includes(s.example), s.key);
    }
    // لا شيء غير تفاعلي بشكل زر أو شريحة
    for (const m of html.matchAll(/<(\w+)[^>]*class="[^"]*\bpub-(?:btn|chip)\b[^"]*"/g)) assert.ok(['a', 'button'].includes(m[1]), m[0]);
    assert.ok(!/class="pub-chip/.test(html));
    // البنود المنقولة إلى «عن البرنامج»
    assert.ok(!html.includes('pub-audience') && !html.includes('«المائدة»'));
    const about = await get('/about');
    assert.ok(about.includes('pub-audience') && about.includes('«المائدة»') && about.includes('إزاي بنراجع الطلبات؟'));
    for (const banned of ['فريق الإدارة', 'اسحبها', 'ميجابايت', 'هذا الحقل مطلوب', 'لست متأكدًا', 'قدّم طلبك']) assert.ok(!html.includes(banned), banned);
  });

  test('FAQ: exactly the 5 visible questions in JSON-LD, answers ≤ 40 words; WhatsApp words only when a number exists', async () => {
    const html = await get('/');
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
    const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage');
    assert.equal(FAQ.length, 5);
    assert.deepEqual(faq.mainEntity.map((q) => q.name), FAQ.map((f) => f.q));
    for (const q of faq.mainEntity) {
      assert.ok(wordsIn(q.acceptedAnswer.text) <= 40, q.name);
      assert.ok(html.includes(`<span>${q.name}</span>`), q.name);
    }
    assert.ok(/<ol class="pub-how">[\s\S]*?أو على واتساب/.test(html), 'how-it-works mentions WhatsApp when configured');

    const noWa = await startTestApp({ config: NO_WA });
    try {
      const h2 = (await noWa.client().get('/')).body;
      assert.ok(!h2.includes('wa.me'));
      const how = /<ol class="pub-how">[\s\S]*?<\/ol>/.exec(h2)[0];
      const contact = /<section id="contact"[\s\S]*?<\/section>/.exec(h2)[0];
      assert.ok(!how.includes('واتساب') && !contact.includes('واتساب'));
      const ld2 = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h2)[1])['@graph'].find((n) => n['@type'] === 'FAQPage');
      assert.ok(!JSON.stringify(ld2).includes('واتساب وعلى صفحة طلبك'));
    } finally {
      await noWa.close();
    }
  });

  test('«بالمختصر» on privacy, terms and about: right under the H1, ≤ 60 words; the table of contents starts closed', async () => {
    for (const [p, must] of [['/privacy', 'المحامي مش بيشوف رقمك'], ['/terms', 'والحكم في الآخر للمحكمة'], ['/about', 'بيساعد الأرامل وأسر الأيتام']]) {
      const html = await get(p);
      const m = /<h1 id="page-title">[\s\S]*?<\/h1>\s*<div class="pub-summary" id="summary">([\s\S]*?)<\/div>/.exec(html);
      assert.ok(m, `${p} summary right under the H1`);
      assert.ok(m[1].includes(must), p);
      const text = m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
      assert.ok(wordsIn(text) <= 60, `${p}: ${wordsIn(text)} words`);
      assert.match(html, /<details class="pub-toc">\s*<summary>/);
      assert.ok(!/<details class="pub-toc" open/.test(html));
    }
  });

  test('no third-party requests: no Google Fonts on any public page; self-hosted font preloaded; strict CSP kept (application/json is data)', async () => {
    for (const p of ['/', '/about', '/privacy', '/terms', '/data-deletion', '/intake', '/portal']) {
      const html = await get(p);
      assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), p);
      assert.ok(!/<(?:script|link)[^>]+(?:src|href)="https?:\/\//.test(html.replace(/<link rel="canonical"[^>]+>/, '')), `${p} loads nothing from another origin`);
      assert.match(html, /<link rel="preload" href="\/assets\/fonts\/plex-arabic-400\.woff2\?v=[\w-]+" as="font" type="font\/woff2" crossorigin \/>/);
    }
    for (const f of ['plex-arabic-400.woff2', 'plex-arabic-700.woff2', 'OFL.txt']) assert.ok(fs.existsSync(path.join(PUB, 'assets/fonts', f)), f);
    assert.match(fs.readFileSync(path.join(PUB, 'assets/fonts/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
    const font = await fetch(`${t.base}/assets/fonts/plex-arabic-400.woff2?v=${assetVersion(path.join(PUB, 'assets/fonts/plex-arabic-400.woff2'))}`);
    assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(font.headers.get('content-type'), 'font/woff2');
  });

  test('bm-public: a non-executable JSON block ≤ 3 KB with the organisation data, so pages never wait for /api/meta', async () => {
    for (const p of ['/intake', '/', '/portal']) {
      const raw = jsonBlock(await get(p));
      assert.ok(Buffer.byteLength(raw) <= 3072, `${p}: ${Buffer.byteLength(raw)} bytes`);
      const data = JSON.parse(raw);
      for (const k of ['org_name', 'site_name', 'phone', 'phone_e164', 'whatsapp_digits', 'office_hours', 'portal_otp_enabled', 'governorates', 'areas', 'setup_required', 'demo']) assert.ok(k in data, k);
      assert.equal(data.phone_e164, '+201211114662');
      assert.equal(data.whatsapp_digits, '201000000001');
      assert.ok(data.areas.find((a) => a.code === 'INH').label === 'ورث');
      assert.ok(!raw.includes('<'), 'no raw < inside the block');
    }
  });

  test('immutable module graph: versioned JS gets its relative imports rewritten to ?v=, CSS gets versioned url(); modulepreload covers the entry closure', async () => {
    const file = path.join(PUB, 'assets/js/public/portal.js');
    const v = assetVersion(file);
    const r = await fetch(`${t.base}/assets/js/public/portal.js?v=${v}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const body = await r.text();
    const specs = [...body.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(specs.length >= 2, 'portal.js has relative imports');
    for (const s of specs) assert.match(s, /\?v=[\w-]{10}$/, s);
    // نسخة بلا ?v (منصة /app) تُخدم كما هي دون إعادة كتابة
    const plain = await (await fetch(`${t.base}/assets/js/public/portal.js`)).text();
    assert.ok(!/\.js\?v=/.test(plain));
    // تعديل ملف مستورَد يغيّر رقم كل من يستورده
    const deps = preloadClosure(path.join(PUB, 'assets/js/public/landing.js'), PUB);
    assert.ok(deps.some((d) => d.startsWith('/assets/js/public/menu.js?v=')));
    assert.ok(!deps.some((d) => /lib\/ui\.js/.test(d)), 'the landing page never loads the component library');
    const html = await get('/');
    for (const d of deps) assert.ok(html.includes(`<link rel="modulepreload" href="${d}" />`), d);
    const css = await (await fetch(`${t.base}/assets/css/public-site.css?v=${assetVersion(path.join(PUB, 'assets/css/public-site.css'))}`)).text();
    assert.match(css, /url\("\/assets\/fonts\/plex-arabic-400\.woff2\?v=[\w-]{10}"\)/);
  });

  test('lighter bundle: landing and static pages load neither ui.js nor app.css; common.js has no static import of the component library', async () => {
    for (const p of ['/', '/about', '/privacy', '/terms', '/data-deletion']) {
      const html = await get(p);
      assert.ok(!html.includes('/assets/css/app.css'), p);
      assert.ok(!/lib\/ui\.js/.test(html), p);
      assert.match(html, /<body class="site pub v91/);
    }
    const common = fs.readFileSync(path.join(PUB, 'assets/js/public/common.js'), 'utf8');
    assert.ok(!/^import[^\n]*lib\/ui\.js/m.test(common));
    const menu = fs.readFileSync(path.join(PUB, 'assets/js/public/menu.js'), 'utf8');
    assert.ok(!/^import /m.test(menu), 'menu.js has no imports');
    assert.ok(Buffer.byteLength(menu) < 4096);
    const words = fs.readFileSync(path.join(PUB, 'assets/js/public/words.js'), 'utf8');
    assert.ok(!/^import /m.test(words), 'words.js has no imports');
  });

  test('size tokens: 18px text, 48/56px targets, nothing below 15px in the beneficiary stylesheet', () => {
    const css = fs.readFileSync(path.join(PUB, 'assets/css/public-site.css'), 'utf8');
    assert.match(css, /--text: 18px;/);
    assert.match(css, /--tap-primary: 56px;/);
    assert.match(css, /--tap: 48px;/);
    const small = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 15);
    assert.deepEqual(small, []);
    assert.match(css, /prefers-reduced-motion/);
  });
});

// ───────────────────────── مراجعة b-site: إصلاحات ما بعد البناء ─────────────────────────

describe('v9.1 b-site review — copy agreement, one number, Arabic digits, cold legal pages', () => {
  test('FAQ day counts agree with the number in everyday Arabic (يوم / يومين / 3–10 أيام / 11+ يوم)', () => {
    assert.equal(daysWord(1), 'يوم');
    assert.equal(daysWord(2), 'يومين');
    assert.equal(daysWord(3), '3 أيام');
    assert.equal(daysWord(10), '10 أيام');
    assert.equal(daysWord(11), '11 يوم');
    assert.equal(daysWord(14), '14 يوم');
    assert.equal(daysWord(103), '103 أيام');
    const eta = FAQ.find((f) => f.q === 'الرد بياخد قد إيه؟');
    const std = eta.a({ wa: false, review: 2, min: 7, max: 14 });
    assert.ok(std.includes('خلال يومين شغل') && std.includes('من 7 لحد 14 يوم'), std);
    const custom = eta.a({ wa: true, review: 11, min: 3, max: 10 });
    assert.ok(custom.includes('خلال 11 يوم شغل') && custom.includes('من 3 لحد 10 أيام') && custom.includes('على واتساب'), custom);
    assert.ok(!/\d+ أيام شغل/.test(eta.a({ wa: false, review: 12, min: 7, max: 14 })), 'no «12 أيام»');
    assert.ok(eta.a({ wa: false, review: 1, min: 5, max: 5 }).includes('في 5 أيام'));
  });

  test('every fixed beneficiary text is gender-aware: «ما عجبكش» for a man, «ما عجبكيش» for a woman; no stray space without a name', async () => {
    assert.ok(genderize(CLIENT_TEXTS.survey_ask_comment, 'm').includes('ما عجبكش'));
    assert.ok(genderize(CLIENT_TEXTS.survey_ask_comment, 'f').includes('ما عجبكيش'));
    // نص ثابت للمستفيد/ة لا يحمل صيغة مؤنثة صريحة خارج رموز {ي}/{ة} (تصل الرجل كما هي)
    for (const [k, txt] of Object.entries(CLIENT_TEXTS)) {
      const male = genderize(txt, 'm');
      assert.ok(!/(?:كيش|يكي|معاكي|عليكي|تقدري|ابعتي|صوّري|قولي)(?=[\s،.]|$)/.test(male), `${k}: ${male}`);
    }
    const t = await startTestApp({ seed: 'none' });
    try {
      assert.equal(t.app.engine.fillClientText('شكرًا على رأيك يا {first_name}. — {org_name}', { org_name: 'بيوت مصر' }, 'm'), 'شكرًا على رأيك. — بيوت مصر');
      assert.equal(t.app.engine.fillClientText('أهلًا يا {first_name}، رأيك يهمنا', {}, 'f'), 'أهلًا بيكي، رأيك يهمنا');
      assert.equal(t.app.engine.fillClientText(CLIENT_TEXTS.survey_thanks, { first_name: 'أبو أحمد', org_name: 'بيوت مصر' }, 'm'), 'شكرًا على رأيك يا أبو أحمد. إحنا معاك في أي وقت. — بيوت مصر');
    } finally {
      await t.close();
    }
  });

  test('one number: an admin-edited reminder or a mapped template asking for {case_code}/{matter_code} gets the REQ code, never INH-/MTR-', async () => {
    freezeClock(T0);
    const t = await startTestApp({ config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const { r, intake } = await websiteIntake(t, uniquePhone(), 'سامية محمود');
      ok(await admin.post(`/api/admin/intakes/${intake.id}/confirm-identity`, {}));
      const c = ok(await admin.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'PEN', title: 'معاش الزوج' }), 201).case;
      assert.match(c.code, /^[A-Z]{3}-/);
      ok(await admin.patch('/api/admin/automations/document_reminder', { params: { template: 'لسه مستنيين منك {request} في الملف {case_code}. — {org_name}' } }));
      ok(await admin.post(`/api/admin/cases/${c.id}/info-requests`, { kind: 'document', question: 'صورة شهادة الوفاة', client_message: 'محتاجين صورة شهادة الوفاة' }));
      freezeClock(plusDays(T0, 2.2));
      await runAutomations(admin);
      const rem = (await outbox(admin)).filter((m) => m.automation_rule === 'document_reminder' && m.case_id === c.id);
      assert.equal(rem.length, 1);
      assert.ok(rem[0].body.includes(`في الملف ${r.reference}`), rem[0].body);
      assert.ok(!INTERNAL_CODE_RE.test(rem[0].body), rem[0].body);
      const vars = JSON.parse(t.app.db.value('SELECT meta FROM messages WHERE id = ?', rem[0].id)).vars;
      assert.equal(vars.case_code, r.reference, 'template variables carry the REQ code too');

      // قالب ميتا مربوط يطلب كود الملف وكود الملف المستمر ← رقم الطلب في كل المتغيرات
      t.app.db.run(
        "INSERT INTO wa_templates (name, language, category, status, body_text, param_count, synced_at) VALUES ('case_codes_test', 'ar', 'UTILITY', 'APPROVED', 'ملفك {{1}} / {{2}} / {{3}}', 3, ?)",
        T0,
      );
      t.app.db.run("INSERT INTO wa_template_mappings (purpose, template_name, language, params, updated_at) VALUES ('case_update', 'case_codes_test', 'ar', '[\"case_code\",\"matter_code\",\"ref\"]', ?)", T0);
      const msg = t.app.db.get('SELECT * FROM messages WHERE id = ?', rem[0].id);
      const plan = t.app.messaging.templatePlan({ ...msg, automation_rule: null, matter_id: null }, { vars: { case_code: c.code, matter_code: 'MTR-2026-00009' } });
      assert.deepEqual(plan.params, [r.reference, r.reference, r.reference]);
    } finally {
      await t.close();
    }
  });

  test('a REQ code written with Arabic-Indic digits plus the confirmation code still confirms the number', async () => {
    const t = await startTestApp();
    try {
      const { r, intake, phone } = await websiteIntake(t);
      const ar = (s) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
      ok(await t.client().post('/webhooks/whatsapp', waPayload({ from: waFrom(phone), text: `ده رقم طلبي ${ar(r.reference)} وكود التأكيد ${ar(codeOf(r.confirm_url))}` })));
      const sd = JSON.parse(t.app.db.value('SELECT source_detail FROM intakes WHERE id = ?', intake.id));
      assert.equal(sd.identity_confirmed_via, 'whatsapp_ref');
    } finally {
      await t.close();
    }
  });

  test('legal pages and 404 paint from inline critical CSS (title + «بالمختصر»), load the full stylesheet after the hero, and 404 is compressed', async () => {
    const t = await startTestApp();
    try {
      for (const p of ['/privacy', '/terms', '/about', '/data-deletion', '/no-such-page']) {
        const r = await t.client().get(p);
        assert.equal(r.status, p === '/no-such-page' ? 404 : 200, p);
        const head = /<head>([\s\S]*?)<\/head>/.exec(r.body)[1];
        const style = /<style>([\s\S]*?)<\/style>/.exec(head);
        assert.ok(style, `${p}: inline critical CSS`);
        assert.ok(style[1].includes('.pub-page-hero') && style[1].includes('.pub-summary') && style[1].includes('.pub-header'), p);
        assert.ok(!head.includes('public-site.css'), `${p}: no render-blocking stylesheet in <head>`);
        const hero = r.body.indexOf('class="pub-page-hero"');
        const link = r.body.search(/<link rel="stylesheet" href="\/assets\/css\/public-site\.css\?v=[\w-]+" \/>/);
        assert.ok(hero > 0 && link > hero, `${p}: full stylesheet after the hero`);
        assert.ok(!r.body.includes('<!--site:critical-css'), p);
      }
      const home = (await t.client().get('/')).body;
      const homeCss = /<style>([\s\S]*?)<\/style>/.exec(home)[1];
      assert.ok(!homeCss.includes('.pub-summary'), 'the landing page does not inline the legal-page block');
      const gz = await fetch(`${t.base}/no-such-page`, { headers: { 'Accept-Encoding': 'gzip' } });
      assert.equal(gz.status, 404);
      assert.equal(gz.headers.get('content-encoding'), 'gzip');
      assert.equal(gz.headers.get('cache-control'), 'no-store');
      assert.match(await gz.text(), /الصفحة دي مش موجودة/);
    } finally {
      await t.close();
    }
  });

  test('phone links inside sentences have a 48px touch area; WhatsApp prefills and deletion button use simple, neutral words', async () => {
    const css = fs.readFileSync(path.join(PUB, 'assets/css/public-site.css'), 'utf8');
    assert.match(css, /body\.pub\.v91 \.pub-summary a,[\s\S]*?padding-block: 10px;\s*margin-block: -10px;/);
    const t = await startTestApp();
    try {
      const home = (await t.client().get('/')).body;
      const wa = /href="https:\/\/wa\.me\/\d+\?text=([^"]+)"/.exec(home);
      assert.equal(decodeURIComponent(wa[1]), 'السلام عليكم، عندي مشكلة قانونية ومحتاجين مساعدتكم.');
      const del = (await t.client().get('/data-deletion')).body;
      assert.ok(del.includes('ابعتي الطلب على واتساب') && !del.includes('أرسل الطلب عبر واتساب'));
      assert.ok(decodeURIComponent(/wa\.me\/\d+\?text=([^"]+)"/.exec(del)[1]).startsWith('السلام عليكم، ده «طلب حذف بياناتي»'), 'the prefill carries the phrase the page tells her to send');
      assert.ok(!home.includes('أود الحصول'));
    } finally {
      await t.close();
    }
  });
});
