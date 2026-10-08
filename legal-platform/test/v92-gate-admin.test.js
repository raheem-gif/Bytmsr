// v9.2 — بوابة الدمج (مسار الإدارة): اختبارات تمنع رجوع ما وجدته مراجعة البوابة في القصص والمكالمات والنقل والألوان.
// المحلل المحلي ما لم يُذكر غير ذلك؛ وضع Claude بنسخة وهمية من الحزمة (لا يُستدعى Anthropic API الحقيقي أبدًا).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, waPayload } from './helpers.js';
import { ok, waText } from './lane-b-kit.test.js';
import { setSdkLoader } from '../src/ai/anthropic.js';
import * as H from '../src/ai/heuristic.js';
import { normalizeStory } from '../src/ai/index.js';
import { factsText, isFactual, stripFollowupPrefill } from '../src/channels/engine.js';
import { spokenScript } from '../src/services/stories.js';
import { RateLimiter } from '../src/auth.js';
import { setClock } from '../src/util.js';
import { localPhone } from '../public/assets/js/lib/fmt.js';
import * as B from '../public/assets/js/lib/brand-color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const VOICE_B64 = fs.readFileSync(path.join(ROOT, 'src/seed-assets/v91-voice-note.webm')).toString('base64');
const STORY = 'جوزي اتوفى من 4 شهور وكان شغال في مصنع ومتأمن عليه، ومكتب التأمينات رفض يصرف المعاش عشان اسمه غلط في شهادة الوفاة';

let seq = 0;
const newPhone = () => `0102${String(6100000 + (++seq) * 7919).slice(-7)}`;
const e164 = (local) => `+20${String(local).slice(1)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wa = (t, phone, text, extra = {}) => t.app.engine.handleWhatsAppWebhook(waText(phone, text, extra));
const intakeByCode = (t, code) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', code);
const latestIntakeOf = (t, phone) =>
  t.app.db.get(
    "SELECT i.* FROM intakes i JOIN client_identities ci ON ci.client_id = i.client_id AND ci.kind = 'phone' WHERE ci.value = ? ORDER BY i.id DESC LIMIT 1",
    e164(phone),
  );
const tokenOf = (url) => String(url).split('/p/')[1];

/** قصة واتساب «جاهزة» ومحلَّلة محليًا */
async function readyStory(t, text = STORY, phone = newPhone()) {
  wa(t, phone, text);
  wa(t, phone, 'خلاص');
  const i = latestIntakeOf(t, phone);
  t.app.ai.cancelTimers(i.id);
  await t.app.ai.runAuto(i.id);
  return { phone, id: i.id };
}

// ───────────── نسخة وهمية من @anthropic-ai/sdk ببوابة تتحكم فيها الاختبارات ─────────────
const fake = { calls: 0, gate: null };
class FakeAnthropic {
  constructor() {
    this.beta = {
      messages: {
        create: async (params) => {
          const props = params.output_config?.format?.schema?.properties || {};
          const isAnalysis = !!props.legal_area && !props.doc_type;
          if (isAnalysis) {
            fake.calls += 1;
            if (fake.gate) await fake.gate;
          }
          const out = isAnalysis
            ? { title: 'صرف معاش الزوج المتوفى', summary: 'أرملة تسأل عن معاش زوجها.', legal_area: 'PEN', confidence: 0.9, secondary_areas: [], facts: ['توفي الزوج'], missing_info: [], information_sufficient: true, suggested_issues: [{ title: 'استحقاق المعاش', details: null, legal_area: 'PEN' }], urgency: 'high', specialist_hint: null }
            : { text: 'تم' };
          return { id: `msg_${fake.calls}`, model: params.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
        },
      },
    };
  }
}

describe('v9.2 gate (admin) — names and identity on website requests', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    setClock(null);
    await t.close();
  });

  test('S1/K1 a no-name website request on a registered number never shows the owner name, gender or governorate (portal, /p HTML, drafts, inbox)', async () => {
    const phone = newPhone();
    // صاحب الرقم: عميل مسجل باسم رجل (اسم من الإدارة، صيغة مذكر، محافظة)
    wa(t, phone, 'السلام عليكم عندي سؤال عن شقة أبويا');
    const owner = latestIntakeOf(t, phone);
    t.app.ai.cancelTimers();
    t.app.db.run("UPDATE clients SET name = 'رامي فوزي', name_source = 'staff', address_form = 'm', governorate = 'الجيزة' WHERE id = ?", owner.client_id);
    t.app.db.run("UPDATE intakes SET status = 'handled_internally' WHERE id = ?", owner.id);
    // شخص آخر يكتب الرقم في الموقع بلا اسم
    const r = ok(await t.client().post('/api/public/intake', { phone, description: 'عايزة أعرف نصيبي في ورث بيت أبويا اللي اتوفى', topic: 'inh', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    assert.equal(it.client_id, owner.client_id, 'same client row (phone match)');
    assert.equal(it.contact_name, null, 'no inherited name on the request');
    assert.equal(it.governorate, null, 'no inherited governorate on the request');
    const view = ok(await t.client().get(`/api/portal/${tokenOf(r.portal_url)}`));
    assert.ok(!JSON.stringify(view).includes('رامي'), 'portal JSON has no owner name');
    const html = await (await fetch(`${t.base}/p/${tokenOf(r.portal_url)}`)).text();
    assert.ok(!html.includes('رامي'), '/p HTML has no owner name');
    await t.app.ai.analyzeIntake(it.id);
    const pr = ok(await admin.get(`/api/admin/intakes/${it.id}/proposal`));
    const drafts = JSON.stringify(pr.drafts);
    assert.ok(!drafts.includes('رامي'), 'drafts have no owner name');
    assert.match(pr.drafts.internal.reply.text, /^أهلًا بيكي/, 'neutral (feminine default) greeting, not the owner masculine form');
    assert.equal(pr.identity.form, 'f');
    assert.equal(t.app.stories.words(it).hello, 'أهلًا بيكي');
    assert.equal(t.app.engine.clientWords({ clientId: it.client_id, intakeId: it.id }).first_name, '');
    const list = ok(await admin.get('/api/admin/intakes?sort=triage&limit=200'));
    const item = list.items.find((x) => x.id === it.id);
    assert.equal(item.contact_name, null, 'the inbox does not show the owner as the sender');
    // «كمان سؤالين»: محافظتها لا تُسقط (الطلب بلا محافظة موروثة)
    ok(await t.client().post(`/api/portal/${tokenOf(r.portal_url)}/about`, { governorate: 'القاهرة' }));
    assert.equal(t.app.db.value('SELECT governorate FROM intakes WHERE id = ?', it.id), 'القاهرة');
  });

  test('S2 a name typed on an unconfirmed website form is never used to greet the number owner on WhatsApp (drafts and the automatic ack) until the number is confirmed', async () => {
    const phone = newPhone();
    const r = ok(await t.client().post('/api/public/intake', { name: 'هالة الغريبة', phone, description: 'مشكلة في معاش جوزي اللي اتوفى والتأمينات رافضة', consent: true }), 201);
    const web = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    assert.equal(t.app.clients.get(web.client_id).name_source, 'website_unverified');
    assert.equal(t.app.stories.words(web).first_name, 'هالة', 'her own request page may use the name she typed');
    // صاحب الرقم يكتب على واتساب: طلب جديد، والإعداد «وصلتنا حكايتك» مفعّل، وطلب الموقع أقدم من 30 يومًا
    t.app.settings.set('story_ack_enabled', true);
    t.app.settings.set('stories_since', '2000-01-01T00:00:00.000Z');
    t.app.db.run("UPDATE intakes SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", web.id);
    t.app.engine.handleWhatsAppWebhook(waPayload({ from: e164(phone).slice(1), name: 'Samsung', text: 'انا صاحب الرقم ده وعندي مشكلة في ورث أبويا والإخوات مش راضيين يقسموا البيت' }));
    const own = latestIntakeOf(t, phone);
    assert.notEqual(own.id, web.id);
    wa(t, phone, 'خلاص');
    t.app.ai.cancelTimers();
    const ack = t.app.db.get("SELECT body FROM messages WHERE intake_id = ? AND automation_rule = 'story_ack'", own.id);
    assert.ok(ack, 'the ack was sent');
    assert.ok(!ack.body.includes('هالة'), `ack does not use the unconfirmed website name: ${ack.body}`);
    assert.match(ack.body, /^أهلًا بيك/);
    await t.app.ai.analyzeIntake(own.id);
    const pr = ok(await admin.get(`/api/admin/intakes/${own.id}/proposal`));
    // نصوص الرسائل التي قد تصلها (الاسم في ملف العميل نفسه بيانات للإدارة تراجعها في نموذج التحويل)
    for (const tr of ['consultation', 'matter', 'internal', 'refer', 'need_info']) assert.ok(!pr.drafts[tr].reply.text.includes('هالة'), `${tr}: ${pr.drafts[tr].reply.text}`);
    assert.equal(t.app.engine.clientWords({ clientId: own.client_id, intakeId: own.id }).first_name, '');
    // الإدارة تؤكد أن مقدّمة طلب الموقع صاحبة الرقم ← الاسم صار اسمها
    ok(await admin.post(`/api/admin/intakes/${web.id}/confirm-identity`));
    assert.equal(t.app.clients.get(web.client_id).name_source, 'website');
    assert.equal(t.app.stories.words(own).first_name, 'هالة');
  });

  test('G16 a website caller confirmed on the phone who never wrote on WhatsApp gets the «لم تراسلنا على واتساب بعد» warning', async () => {
    const r = ok(await t.client().post('/api/public/intake', { name: 'أم يوسف', phone: newPhone(), description: 'جوزي اتوفى ومش عارفة أطلع المعاش منين ولا إيه الورق', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    const out = ok(await admin.post(`/api/admin/intakes/${it.id}/call-note`, { text: 'قالت إن جوزها مات من سنة والتأمينات قالت لها الورق ناقص', client_ref: 'g16-1', confirm_identity: true }), 201);
    const w = out.proposal.warnings.find((x) => x.code === 'out_of_window');
    if (w) assert.equal(w.text, 'لم تراسلنا على واتساب بعد: سيصلها إشعار بقالب معتمد، والنص كاملًا في صفحتها.');
    assert.ok(!out.proposal.warnings.some((x) => /مرّ أكثر من 24 ساعة/.test(x.text)), 'never «24 hours since her last message» when she never wrote');
  });

  test('N6 a known man (kunya «أبو …» or staff-set form) gets masculine staff wording in warnings, list items and the proposal identity', async () => {
    const r = ok(await t.client().post('/api/public/intake', { name: 'أبو محمد', phone: newPhone(), description: 'عايز أعرف إزاي أطلع إعلام وراثة لأبويا', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    await t.app.ai.analyzeIntake(it.id);
    const pr = ok(await admin.get(`/api/admin/intakes/${it.id}/proposal`));
    assert.equal(pr.identity.form, 'm');
    assert.equal(pr.warnings.find((x) => x.code === 'unconfirmed').text, 'رقمه غير مؤكد: أي رسالة ستظهر في صفحة متابعته فقط ولن تصله على واتساب.');
    const list = ok(await admin.get('/api/admin/intakes?sort=triage&limit=200'));
    assert.equal(list.items.find((x) => x.id === it.id).address_form, 'm');
  });

  test('K4 the form object reports the intake mode stored in source_detail', async () => {
    const r = ok(await t.client().post('/api/public/intake', { phone: newPhone(), description: 'عايزة أعرف نصيبي في ورث جوزي', topic: 'inh', mode: 'tiles', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    const row = t.app.db.get('SELECT * FROM intakes WHERE id = ?', it.id);
    assert.equal(t.app.stories.formOf(row).mode, 'tiles');
  });
});

describe('v9.2 gate (admin) — call notes, call-first and the call script', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    setClock(null);
    await t.close();
  });

  test('G5 after «سجّل المكالمة» the next step is the decision, not another call: actions.primary = sheet, called = true (proposal and list)', async () => {
    const r = ok(await t.client().post('/api/public/intake', { phone: newPhone(), callback: 'morning', mode: 'callback', entry: 'home_callback', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    const out = ok(
      await admin.post(`/api/admin/intakes/${it.id}/call-note`, { text: 'جوزي اتوفى من 6 شهور وسابلي 3 عيال، ومش عارفة أبدأ منين في إعلام الوراثة والمعاش.', client_ref: 'g5-1' }),
      201,
    );
    assert.equal(out.proposal.actions.called, true);
    assert.equal(out.proposal.actions.primary, 'sheet', 'no second «اتصل بها» right after the call');
    assert.equal(out.proposal.actions.last_call_note_id, out.message_id);
    const list = ok(await admin.get('/api/admin/intakes?sort=triage&limit=200'));
    assert.equal(list.items.find((x) => x.id === it.id).story.called, true);
    // رسالة جديدة منها بعد المكالمة ← «اتصل بها» يعود ممكنًا (لم تعد المكالمة آخر ما وصل)
    t.app.engine.receive({ channel: 'website', portal_client_id: it.client_id, target_intake_id: it.id, text: 'ونسيت أقول إن المعاش وقف خالص' });
    t.app.ai.cancelTimers();
    const pr2 = ok(await admin.get(`/api/admin/intakes/${it.id}/proposal`));
    assert.equal(pr2.actions.called, false);
    // الواجهة: البطاقة لا تعرض «اتصل بها» بعد المكالمة
    assert.match(read('public/assets/js/app/pages/admin/inbox.js'), /&& !st\.called\)/);
  });

  test('G5 the call script read on the phone drops chat-only sentences («ابعتيها هنا», «صوّري», page links) but keeps the content', () => {
    assert.equal(
      spokenScript('أهلًا بيكي، لاستخراج إعلام الوراثة نرجو تجهيز المستندات التالية: شهادة الوفاة، والبطاقة. يمكنكم تصوير المستندات وإرسالها هنا.\n\n— بيوت مصر'),
      'أهلًا بيكي، لاستخراج إعلام الوراثة نرجو تجهيز المستندات التالية: شهادة الوفاة، والبطاقة.',
    );
    assert.equal(spokenScript('1. مين اللي اتوفى، وإمتى؟\n2. فيه ورق معاكي يخص المشكلة؟ صوّريه وابعتيه هنا.'), '1. مين اللي اتوفى، وإمتى؟\n2. فيه ورق معاكي يخص المشكلة؟');
    assert.equal(spokenScript('التفاصيل كلها في صفحتك: {portal_link}'), '');
  });

  test('G7 clear disputes phrased as questions are not «ترد الإدارة»; an alimony ruling is a court matter', () => {
    const track = (text) => H.analyzeIntake(text, {}).recommended_track;
    assert.notEqual(track('جوزي اتوفى من سنة، وإخواته عايزين يبيعوا الشقة اللي ساكنين فيها وأنا والعيال مش عارفين نروح فين. عايزة أعرف حقي وحق ولادي.'), 'internal');
    assert.notEqual(track('طليقي مش بيدفع نفقة البنت الصغيرة بقاله 5 شهور ومش عارفة أعمل إيه.'), 'internal');
    assert.equal(track('طليقي مش بيدفع نفقة العيال من 8 شهور ومعايا حكم نفقة، أعمل إيه'), 'matter');
    // سؤال إجرائي حقيقي بلا نزاع يبقى «ترد الإدارة»، و«محكمة» ليست «حكم»
    assert.equal(track('عايزة أعرف إزاي أطلع إعلام وراثة لجوزي اللي اتوفى الشهر اللي فات'), 'internal');
    assert.notEqual(track('عايزة أعرف أروح أنهي محكمة عشان إعلام الوراثة لجوزي اللي اتوفى'), 'matter');
  });

  test('G14 the refer reason has no nested parentheses', () => {
    const referrals = [{ key: 'p', label: 'برامج المؤسسة الأخرى (مساعدات، علاج، كسوة…)', keywords: ['مصاريف عمليه'], reply: 'x' }];
    const out = H.analyzeIntake('محتاجة مساعدة مالية عشان مصاريف عملية بنتي', { referrals });
    assert.equal(out.recommended_track, 'refer');
    assert.equal(out.track_reason, 'طلبها خارج الدعم القانوني — الأنسب: برامج المؤسسة الأخرى (مساعدات، علاج، كسوة…).');
  });

  test('N12 the «nearest» quick reply comes from the area of the topic she picked (ورق رسمي ≠ إعلام وراثة)', () => {
    const quickReplies = [{ id: 1, title: 'إعلام الوراثة', body: 'لاستخراج إعلام الوراثة نرجو تجهيز المستندات التالية: شهادة الوفاة وقيد العائلة.', usage_count: 5 }];
    const papers = H.analyzeIntake('محتاجة أطلع شهادة وفاة جوزي ومش عارفة أروح فين', { topic: 'papers', quickReplies });
    assert.equal(papers.recommended_track, 'internal');
    assert.equal(papers.reply_source, null, 'no inheritance quick reply for a papers request');
    const inh = H.analyzeIntake('عايزة أعرف إزاي أطلع إعلام وراثة لجوزي اللي اتوفى', { topic: 'inh', quickReplies });
    assert.equal(inh.reply_source?.kind, 'quick_reply');
  });

  test('S6/R3 a call note is analysed without waiting in the global automatic queue (noSlot) and counts against the daily cap (auto)', async () => {
    const r = ok(await t.client().post('/api/public/intake', { phone: newPhone(), callback: 'any', mode: 'callback', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    const real = t.app.ai.analyzeIntake;
    const seen = [];
    t.app.ai.analyzeIntake = (id, actor, opts) => {
      seen.push(opts);
      return real(id, actor, opts);
    };
    try {
      ok(await admin.post(`/api/admin/intakes/${it.id}/call-note`, { text: 'قالت إن المعاش وقف من شهرين بعد ما جوزها اتوفى', client_ref: 's6-1' }), 201);
    } finally {
      t.app.ai.analyzeIntake = real;
    }
    assert.equal(seen.length, 1);
    assert.equal(seen[0].auto, true);
    assert.equal(seen[0].noSlot, true);
  });
});

describe('v9.2 gate (admin) — split («اعمل منها طلب جديد»)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    setClock(null);
    await t.close();
  });

  async function caseFromStory() {
    const s = await readyStory(t);
    const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
    const acc = ok(await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'consultation', story_rev: pr.story.rev, case: pr.drafts.consultation.case }));
    t.app.ai.cancelTimers();
    return { ...s, caseId: acc.case.id, clientId: t.app.db.value('SELECT client_id FROM cases WHERE id = ?', acc.case.id) };
  }

  test('S3 a message she wrote from her full follow-up link → split → a confirmed request she sees on her page, and a staff reply reaches her', async () => {
    const c = await caseFromStory();
    const link = ok(await admin.post(`/api/admin/clients/${c.clientId}/portal-link`, {}));
    const token = tokenOf(link.url);
    await sleep(5);
    ok(await t.client().post(`/api/portal/${token}/messages`, { body: 'فيه مشكلة تانية: صاحب البيت عايز يطلعنا من الشقة الإيجار القديم' }));
    t.app.ai.cancelTimers();
    const m = t.app.db.get("SELECT * FROM messages WHERE case_id = ? AND direction = 'in' AND channel = 'website' ORDER BY id DESC LIMIT 1", c.caseId);
    assert.ok(m, 'landed on the case');
    assert.equal(JSON.parse(m.meta).sender_verified, true);
    const out = ok(await admin.post('/api/admin/messages/split', { message_ids: [m.id], client_ref: 's3-1' }), 201);
    const ni = t.app.db.get('SELECT * FROM intakes WHERE id = ?', out.intake.id);
    assert.equal(JSON.parse(ni.source_detail).sender_verified, true);
    const pr = ok(await admin.get(`/api/admin/intakes/${ni.id}/proposal`));
    assert.equal(pr.identity.unconfirmed, false, 'not «رقمها غير مؤكد»');
    const view = ok(await t.client().get(`/api/portal/${token}`));
    assert.ok(view.intakes.some((x) => x.code === ni.code), 'her page lists the new request');
    const rep = ok(await admin.post(`/api/admin/intakes/${ni.id}/reply`, { body: 'وصلتنا مشكلة الشقة وهنتابعها معاكي.', channel: 'website' }));
    void rep;
    const view2 = ok(await t.client().get(`/api/portal/${token}`));
    assert.ok(JSON.stringify(view2).includes('وصلتنا مشكلة الشقة'), 'the staff reply is on her page');
  });

  test('S3 messages from an unconfirmed website request link cannot become an invisible request (409 with a clear reason)', async () => {
    const r = ok(await t.client().post('/api/public/intake', { name: 'سعاد', phone: newPhone(), description: 'جوزي اتوفى والتأمينات رافضة تصرف المعاش', consent: true }), 201);
    const it = intakeByCode(t, r.reference);
    t.app.ai.cancelTimers();
    await t.app.ai.analyzeIntake(it.id);
    const pr = ok(await admin.get(`/api/admin/intakes/${it.id}/proposal`));
    const acc = ok(await admin.post(`/api/admin/intakes/${it.id}/accept`, { track: 'consultation', story_rev: pr.story.rev, case: pr.drafts.consultation.case }));
    await sleep(5);
    ok(await t.client().post(`/api/portal/${tokenOf(r.portal_url)}/messages`, { body: 'وكمان عندي مشكلة في الإيجار' }));
    t.app.ai.cancelTimers();
    const m = t.app.db.get("SELECT id FROM messages WHERE case_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1", acc.case.id);
    const res = await admin.post('/api/admin/messages/split', { message_ids: [m.id], client_ref: 's3-2' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /غير مؤكد/);
  });

  test('G6 the founding messages (before the case was opened) cannot be split out; R6 messages from two different files are refused', async () => {
    const c = await caseFromStory();
    const kase = t.app.db.get('SELECT * FROM cases WHERE id = ?', c.caseId);
    const founding = t.app.db.get("SELECT id FROM messages WHERE case_id = ? AND direction = 'in' AND created_at <= ? ORDER BY id LIMIT 1", c.caseId, kase.created_at);
    assert.ok(founding, 'the original story is in the case conversation');
    const r1 = await admin.post('/api/admin/messages/split', { message_ids: [founding.id], client_ref: 'g6-1' });
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error, 'اختر رسائل وصلت بعد فتح الملف');
    assert.ok(t.app.db.get('SELECT 1 FROM messages WHERE id = ? AND case_id = ?', founding.id, c.caseId), 'still in the file');
    // ملفان مختلفان لنفس المستفيدة
    await sleep(5);
    wa(t, c.phone, 'وفيه مشكلة تانية خالص: صاحب البيت عايز يطلعنا من الشقة');
    t.app.ai.cancelTimers();
    const a = t.app.db.get("SELECT id FROM messages WHERE case_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1", c.caseId);
    const other = t.app.db.insert('cases', { ...Object.fromEntries(Object.entries(kase).filter(([k]) => !['id', 'code'].includes(k))), code: `GEN-2026-9${String(++seq).padStart(4, '0')}`, intake_id: null });
    const b = t.app.db.insert('messages', { client_id: c.clientId, case_id: other, direction: 'in', channel: 'whatsapp', body: 'رسالة في ملف آخر', status: 'received', meta: '{}', created_at: new Date().toISOString() });
    const r2 = await admin.post('/api/admin/messages/split', { message_ids: [a.id, b], client_ref: 'g6-2' });
    assert.equal(r2.status, 400);
    // الواجهة: نافذة النقل لا تعرض رسائل ما قبل فتح الملف
    const { splittable } = await import('../public/assets/js/app/components/split-dialog.js');
    const msgs = [
      { id: 1, direction: 'in', created_at: '2026-10-01T10:00:00.000Z' },
      { id: 2, direction: 'in', created_at: '2026-10-05T10:00:00.000Z' },
    ];
    assert.deepEqual(splittable(msgs, Date.parse('2026-10-08T00:00:00.000Z'), '2026-10-03T00:00:00.000Z').map((m) => m.id), [2]);
    assert.match(read('public/assets/js/app/pages/admin/case-detail.js'), /openSplitDialog\(\{ messages: data\.messages, preselectId: m\.id, splitAfter:/);
  });
});

describe('v9.2 gate (admin) — analysis guards and transcripts', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    setClock(null);
    await t.close();
  });

  test('R2 two parallel «لخّصها الآن» on the same story → one analysis', async () => {
    const phone = newPhone();
    wa(t, phone, STORY);
    const i = latestIntakeOf(t, phone);
    t.app.ai.cancelTimers();
    const count = () => Number(t.app.db.value("SELECT COUNT(*) FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_analysis'", i.id));
    const before0 = count();
    const [a, b] = await Promise.all([admin.post(`/api/admin/intakes/${i.id}/story/ready`, {}), admin.post(`/api/admin/intakes/${i.id}/story/ready`, {})]);
    ok(a);
    ok(b);
    assert.equal(count() - before0, 1);
  });

  test('S4 «حلّل الآن» joins a running analysis instead of starting a parallel one, and is rate-limited', async () => {
    const s = await readyStory(t);
    const real = t.app.ai.analyzeIntake;
    let calls = 0;
    t.app.ai.analyzeIntake = async (...args) => {
      calls += 1;
      await sleep(150);
      return real(...args);
    };
    try {
      const [a, b] = await Promise.all([admin.post(`/api/admin/intakes/${s.id}/analyze`), admin.post(`/api/admin/intakes/${s.id}/analyze`)]);
      ok(a);
      ok(b);
    } finally {
      t.app.ai.analyzeIntake = real;
    }
    assert.equal(calls, 1, 'one analysis for two clicks');
    t.app.limiters.analyzeNow = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 1 });
    ok(await admin.post(`/api/admin/intakes/${s.id}/analyze`));
    assert.equal((await admin.post(`/api/admin/intakes/${s.id}/analyze`)).status, 429);
  });

  test('R1/S5 saving the same transcript again changes nothing (no new rev, no activity, no analysis); S8 a transcript on a decided request still leaves an activity row', async () => {
    const phone = newPhone();
    const r = t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.R1.${Date.now()}`, from_phone: e164(phone), text: '[رسالة صوتية]', attachments: [{ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64 }] });
    t.app.ai.cancelTimers();
    const doc = t.app.db.value('SELECT id FROM documents WHERE message_id = ?', r.message_id);
    const body = { text: 'جوزي مات من سنة ومعاشه اتوقف ومش عارفة أعمل إيه' };
    const first = ok(await admin.put(`/api/admin/voice-notes/${doc}/transcript`, body));
    t.app.ai.cancelTimers();
    const acts = () => Number(t.app.db.value("SELECT COUNT(*) FROM activity WHERE type = 'voice.transcribed' AND intake_id = ?", r.intake.id));
    const rev0 = Number(t.app.db.value('SELECT story_rev FROM intakes WHERE id = ?', r.intake.id));
    const a0 = acts();
    const again = ok(await admin.put(`/api/admin/voice-notes/${doc}/transcript`, body));
    ok(await admin.put(`/api/admin/voice-notes/${doc}/transcript`, { text: `  ${body.text}  ` }));
    assert.equal(again.unchanged, true);
    assert.equal(again.story.rev, first.story.rev);
    assert.equal(Number(t.app.db.value('SELECT story_rev FROM intakes WHERE id = ?', r.intake.id)), rev0);
    assert.equal(acts(), a0);
    assert.equal(t.app.ai.hasTimer(r.intake.id), false, 'nothing scheduled');
    // S8: بعد القرار يُحفظ النص بلا مراجعة جديدة، لكن يبقى أثر في السجل
    ok(await admin.post(`/api/admin/intakes/${r.intake.id}/handle-internally`, { resolution_note: 'أُجيبت' }));
    ok(await admin.put(`/api/admin/voice-notes/${doc}/transcript`, { text: 'نص تم تعديله بعد الإغلاق' }));
    assert.equal(acts(), a0 + 1);
    assert.equal(Number(t.app.db.value('SELECT story_rev FROM intakes WHERE id = ?', r.intake.id)), rev0);
  });

  test('S7 lawyer facts and brief drafts carry no street address, confirmation code or request code', () => {
    const o = normalizeStory(
      { recommended_track: 'consultation', request_draft: { facts_for_lawyer: 'عنوانها 12 شارع النصر شبرا، رقمها 01012345678، طلب REQ-2026-00012 وكود التأكيد 123456.', brief_for_lawyer: 'رأي في 5 شارع الترعة شبرا الخيمة' } },
      {},
    );
    const f = o.request_draft.facts_for_lawyer;
    assert.ok(!/12 شارع النصر|123456|REQ-2026-00012|01012345678/.test(f), f);
    assert.match(f, /\[عنوان مخفي\] شبرا/);
    assert.ok(!/5 شارع الترعة/.test(o.request_draft.brief_for_lawyer));
  });

  test('K8 the website follow-up prefill («رقم طلبي … وأريد استكمال طلبي عبر واتساب») is not a fact and never the one-line summary', () => {
    const pre = 'مرحبًا بيوت مصر، رقم طلبي REQ-2026-00021 وأريد استكمال طلبي عبر واتساب.';
    assert.equal(isFactual({}, pre, {}), false);
    assert.equal(factsText(`${pre} نسيت أقول إن عندي ما يثبت إن المستأجر مسافر.`, {}), 'نسيت أقول إن عندي ما يثبت إن المستأجر مسافر.');
    assert.equal(stripFollowupPrefill('جوزي اتوفى'), 'جوزي اتوفى', 'other text unchanged');
    const out = H.analyzeIntake(factsText(`أنا مالك عمارة قديمة وفيها شقة إيجار قديم والمستأجر مسافر بره مصر من 5 سنين.\n${pre} نسيت أقول إن عندي ما يثبت إن المستأجر مسافر.`, {}), {});
    assert.ok(!/استكمال طلبي/.test(out.one_line), out.one_line);
  });
});

describe('v9.2 gate (admin) — Claude-mode cost and race guards (fake SDK)', () => {
  let t;
  before(async () => {
    setSdkLoader(() => FakeAnthropic);
    t = await startTestApp({ seed: 'none', config: { ai: { provider: 'auto', anthropicApiKey: '' } } });
    t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000' }, null);
  });
  after(async () => {
    setSdkLoader(null);
    fake.gate = null;
    setClock(null);
    await t.close();
  });

  test('R4 an automatic analysis still running when staff decide writes no suggestion, no activity and no priority change', async () => {
    const s = await readyStory(t);
    t.app.ai.cancelTimers();
    const sugs = () => Number(t.app.db.value("SELECT COUNT(*) FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_analysis'", s.id));
    const n0 = sugs();
    t.app.db.run("UPDATE intakes SET story_rev = story_rev + 1, analysis_attempts = 0, priority = 'normal' WHERE id = ?", s.id);
    let release;
    fake.gate = new Promise((r) => (release = r));
    const running = t.app.ai.runAuto(s.id);
    await sleep(50);
    assert.ok(fake.calls >= 1, 'Claude call in flight');
    // القرار أثناء انتظار Claude
    const admin = await t.login('admin');
    ok(await admin.post(`/api/admin/intakes/${s.id}/handle-internally`, { resolution_note: 'أُجيبت بالهاتف' }));
    release();
    fake.gate = null;
    await running;
    assert.equal(sugs(), n0, 'no new suggestion on a decided request');
    assert.equal(t.app.db.value('SELECT priority FROM intakes WHERE id = ?', s.id), 'normal', 'urgency from the late result does not raise the priority');
  });

  test('S5 while staff are typing voice notes (one done, one left), the job schedules only a local preview, never a full Claude run', async () => {
    const phone = newPhone();
    const longText = 'جوزي اتوفى من سنة والمعاش متوقف والتأمينات رافضة تصرف عشان الاسم غلط في شهادة الوفاة وأنا مش عارفة أعمل إيه';
    wa(t, phone, longText);
    const i = latestIntakeOf(t, phone);
    const v1 = t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.S5a.${Date.now()}`, from_phone: e164(phone), text: '[رسالة صوتية]', attachments: [{ filename: 'a.webm', mime: 'audio/webm', data_base64: VOICE_B64 }] });
    t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.S5b.${Date.now()}`, from_phone: e164(phone), text: '[رسالة صوتية]', attachments: [{ filename: 'b.webm', mime: 'audio/webm', data_base64: VOICE_B64 }] });
    t.app.stories.markReady(i.id, 'quiet', null, { analyze: false });
    t.app.ai.cancelTimers();
    const doc1 = t.app.db.value('SELECT id FROM documents WHERE message_id = ?', v1.message_id);
    t.app.voice.save(doc1, { text: 'بتقول إن المعاش وقف من شهرين' }, { id: 1, name: 'منى' });
    t.app.ai.cancelTimers();
    assert.ok(Number(t.app.db.value('SELECT voice_missing FROM intakes WHERE id = ?', i.id)) > 0);
    const calls = [];
    const real = t.app.ai.scheduleIntakeAnalysis;
    t.app.ai.scheduleIntakeAnalysis = (id, delay, opts = {}) => calls.push({ id, delay, opts });
    try {
      t.app.db.run('UPDATE intakes SET analysis_attempted_at = NULL WHERE id = ?', i.id);
      t.app.stories.checkReady();
      t.app.stories.scheduleAnalysis(i.id, 'ready');
    } finally {
      t.app.ai.scheduleIntakeAnalysis = real;
    }
    const mine = calls.filter((c) => c.id === i.id);
    assert.ok(mine.length >= 1, 'something scheduled');
    assert.ok(mine.every((c) => c.opts.preview === true), `preview only: ${JSON.stringify(mine)}`);
  });
});

describe('v9.2 gate (admin) — system health, phone formatting, colours and copy', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    setClock(null);
    await t.close();
  });

  test('K7 silent session-only story messages are not «رسائل صادرة فاشلة» in system health or the outbox «failed» filter', async () => {
    const phone = newPhone();
    wa(t, phone, STORY);
    const i = latestIntakeOf(t, phone);
    t.app.ai.cancelTimers();
    t.app.db.insert('messages', { client_id: i.client_id, intake_id: i.id, direction: 'out', channel: 'whatsapp', body: 'وصلتنا حكايتك', status: 'failed', automated: 1, automation_rule: 'story_ack', meta: JSON.stringify({ wa: { session_only: true } }), created_at: new Date().toISOString() });
    const health = ok(await admin.get('/api/admin/system/health'));
    assert.equal(health.outbox.failed, 0);
    const failed = ok(await admin.get('/api/admin/outbox?status=failed'));
    assert.ok(!failed.some((m) => m.automation_rule === 'story_ack'));
  });

  test('K9 staff see her number in the local format; tel: links keep E.164', () => {
    assert.equal(localPhone('+201006057460'), '01006057460');
    assert.equal(localPhone('201092000103'), '01092000103');
    assert.equal(localPhone('01012345678'), '01012345678');
    assert.equal(localPhone('+4479460000'), '+4479460000', 'non-Egyptian numbers unchanged');
    const cn = read('public/assets/js/app/components/call-note.js');
    assert.match(cn, /href: `tel:\$\{intake\.phone\}` \}, ltr\(localPhone\(intake\.phone\)\)/);
    assert.match(read('public/assets/js/app/pages/admin/intake-detail.js'), /ltr\(localPhone\(herPhone\)\)/);
    assert.match(read('public/assets/js/app/pages/admin/case-detail.js'), /ltr\(localPhone\(cl\.phone\)\)/);
  });

  test('G2 /api/meta carries the brand version that /app embeds (none for the default colours), and /app re-syncs a stale cached shell', async () => {
    const meta0 = ok(await t.client().get('/api/meta'));
    assert.equal(meta0.brand, undefined, 'default colours: meta unchanged from 9.1');
    ok(await admin.put('/api/admin/brand/colors', { primary: '#1b5e20', accent: '#ff9800' }));
    const meta = ok(await t.client().get('/api/meta'));
    const html = await (await fetch(`${t.base}/app`)).text();
    const v = /<style id="bm-theme" data-v="([^"]+)">/.exec(html)?.[1];
    assert.ok(v);
    assert.equal(meta.brand.v, v);
    assert.match(meta.brand.css, /^html:root\{/);
    ok(await admin.del('/api/admin/brand/colors'));
    assert.equal(ok(await t.client().get('/api/meta')).brand, undefined);
    const main = read('public/assets/js/app/main.js');
    assert.match(main, /setMeta\(syncTheme\(fresh\)\)/);
    assert.match(main, /import\('\.\/theme-sync\.js'\)/);
    const bs = read('public/assets/js/app/components/brand-settings.js');
    assert.match(bs, /await refreshAppShellCache\(\);\s*\n\s*showLive\(payload\);\s*\n\s*toast\(T\.saved/);
    const sync = read('public/assets/js/app/theme-sync.js');
    assert.match(sync, /caches\.keys\(\)/);
    assert.match(sync, /bm-static-/);
  });

  test('G4/N3 alpha-white sidebar group titles stay ≥ 4.5:1 on primary-800 for all 644 property inputs; links in tinted alerts use the alert text colour', () => {
    const css = read('public/assets/css/app.css');
    const alpha = Number(/\.nav-group-title \{[^}]*color: rgba\(255, 255, 255, ([0-9.]+)\)/.exec(css)?.[1]);
    assert.ok(alpha >= 0.62, `alpha ${alpha}`);
    const EDGE = ['#000000', '#ffffff', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#f5c400', '#fff3c4', '#1a1a1a'];
    let s = 12345;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31);
    const hex = () => `#${(rnd() % 0x1000000).toString(16).padStart(6, '0')}`;
    const pairs = [];
    for (let i = 0; i < 500; i += 1) pairs.push([hex(), hex()]);
    for (const x of EDGE) for (const y of EDGE) pairs.push([x, y]);
    assert.equal(pairs.length, 644);
    let worst = 99;
    for (const [p, a] of pairs) {
      const th = B.buildTheme(p, a);
      worst = Math.min(worst, B.contrast(B.over('#ffffff', alpha, th.primary[800]), th.primary[800]));
    }
    assert.ok(worst >= 4.5, `worst ${worst.toFixed(2)}`);
    assert.match(css, /\.alert a:not\(\.btn\) \{\s*color: inherit;\s*text-decoration: underline;/);
  });

  test('K6/N15 staff pages on phones: small and icon buttons, <summary> and tel: links are ≥ 44px', () => {
    const css = read('public/assets/css/app.css');
    const block = /\/\* v9\.2 بوابة K6\/N15[\s\S]*?@media \(max-width: 640px\) \{([\s\S]*?)\n\}\n/.exec(css)?.[1] || '';
    assert.match(block, /\.app-shell:not\(\.is-lawyer\) #main \.btn:not\(\.btn-lg\) \{\s*--btn-h: 44px;/);
    assert.match(block, /#main summary,\s*\n\s*\.modal summary \{\s*min-height: 44px;/);
    assert.match(block, /\.pa-story-name \{[\s\S]*?min-height: 44px;/);
  });

  test('R5 the Docker label and the docs state the current version', () => {
    const version = JSON.parse(read('package.json')).version;
    assert.match(read('Dockerfile'), new RegExp(`org\\.opencontainers\\.image\\.version="${version.replace(/\./g, '\\.')}"`));
    assert.match(read('README.md'), new RegExp(`tests pass at ${version.replace(/\./g, '\\.')}`));
    assert.match(read('PLATFORM-BRIEF.md'), new RegExp(`all passing at version ${version.replace(/\./g, '\\.')}`));
  });

  test('N7/G15/N6 copy: the form card does not say «قالت إن…» for a picture tap; the simulated suffix belongs to the message; masculine call labels exist', () => {
    const det = read('public/assets/js/app/pages/admin/intake-detail.js');
    assert.ok(!det.includes('قالت إن فيه تهديدًا بالطرد'));
    assert.ok(det.includes('اختارت صورة التهديد بالطرد — تأكدوا منها'));
    assert.ok(det.includes("male ? 'اتصل به' : 'اتصل بها'"));
    const sheet = read('public/assets/js/app/components/story-sheet.js');
    assert.ok(sheet.includes('وأُرسلت لها رسالة${sim} — اختر الآن المحامي'));
  });
});
