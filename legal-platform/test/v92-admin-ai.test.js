// v9.2 (admin-ai) — القصص الواردة: قصة واتساب/الموقع ← «جاهزة» ← ملخص ومسار مقترح ← طلب بنقرة.
// المحلل المحلي ما لم يُذكر غير ذلك؛ وضع Claude بنسخة وهمية من الحزمة (لا يُستدعى Anthropic API الحقيقي أبدًا)،
// وواتساب «المتصل» بمحاكاة Graph API (globalThis.fetch).
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, waPayload, freezeClock } from './helpers.js';
import { ok, createLawyer, assign, waText } from './lane-b-kit.test.js';
import { setSdkLoader, ANALYSIS_SCHEMA } from '../src/ai/anthropic.js';
import * as H from '../src/ai/heuristic.js';
import { normalizeStory } from '../src/ai/index.js';
import { isCannedCallback, factsText } from '../src/channels/engine.js';
import { STORY_VIEW_SQL } from '../src/services/stories.js';
import { TOPICS, STAFF_LINES_TITLE } from '../public/assets/js/public/topics.js';
import { LABELS, CLIENT_TEXTS, DEFAULT_SETTINGS } from '../src/constants.js';
import { hashPassword } from '../src/auth.js';
import { setClock } from '../src/util.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VOICE_B64 = fs.readFileSync(path.join(ROOT, 'src/seed-assets/v91-voice-note.webm')).toString('base64');
const PHOTO_B64 = fs.readFileSync(path.join(ROOT, 'src/seed-assets/v91-death-certificate.jpg')).toString('base64');
const DESC = 'زوجي توفي منذ عام وترك شقة باسمه، وأهل زوجي يطالبون ببيعها، وأريد معرفة حقي وحق أولادي في الميراث.';
const PEN_STORY = 'جوزي اتوفى من 4 شهور وكان شغال في مصنع ومتأمن عليه، ومكتب التأمينات رفض يصرف المعاش عشان اسمه غلط في شهادة الوفاة';
const INFO_STORY = 'عايزة أعرف إزاي أطلع إعلام وراثة لجوزي الله يرحمه وإيه الورق المطلوب';

// ───────────── نسخة وهمية من @anthropic-ai/sdk (كما في v9-ai.test.js) ─────────────
const USAGE = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
function featureOf(params) {
  const props = params.output_config?.format?.schema?.properties || {};
  if (props.suggestions) return 'reply';
  if (props.doc_type) return 'document_analysis';
  if (props.used_sources) return 'draft';
  if (props.issues) return 'issues';
  if (props.legal_area) return 'intake_analysis';
  if (props.text) return 'client_version';
  return 'ping';
}
// شكل الإصدار 9.1 (بلا المسار والمسودات): يجب أن يُكمَّل من المحلل المحلي
const OLD_SHAPE = {
  title: 'صرف معاش الزوج المتوفى',
  summary: 'أرملة تسأل عن صرف معاش زوجها.',
  legal_area: 'PEN',
  confidence: 0.9,
  secondary_areas: [],
  facts: ['توفي الزوج'],
  missing_info: [{ item: 'رقم المعاش', kind: 'information' }],
  information_sufficient: false,
  suggested_issues: [{ title: 'تحديد المستحقين في المعاش', details: null, legal_area: 'PEN' }],
  urgency: 'normal',
  specialist_hint: null,
};
const fake = (() => {
  const state = { calls: [], output: null };
  class FakeAnthropic {
    constructor() {
      this.beta = {
        messages: {
          create: async (params) => {
            const feature = featureOf(params);
            state.calls.push({ params, feature });
            const out = feature === 'intake_analysis' ? state.output || OLD_SHAPE : { text: 'تم' };
            return { id: `msg_${state.calls.length}`, model: params.model, stop_reason: 'end_turn', content: [{ type: 'text', text: feature === 'ping' ? 'تم' : JSON.stringify(out) }], usage: { ...USAGE } };
          },
        },
      };
    }
  }
  setSdkLoader(() => FakeAnthropic);
  state.reset = () => {
    state.calls.length = 0;
    state.output = null;
  };
  state.analysisCalls = () => state.calls.filter((c) => c.feature === 'intake_analysis').length;
  return state;
})();
after(() => setSdkLoader(null));
const enableClaude = (t) => t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000' }, null);

// ───────────── أدوات ─────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < end) {
    await sleep(25);
    v = await fn();
  }
  return v;
}
let seq = 0;
const newPhone = () => `0101${String(5100000 + (++seq) * 7919).slice(-7)}`;
const e164 = (local) => `+20${String(local).slice(1)}`;
const intl = (local) => `20${String(local).slice(1)}`;

async function withApp(fn, { seed = 'none', config = {} } = {}) {
  fake.reset();
  const t = await startTestApp({ seed, config: { ai: { provider: 'auto', anthropicApiKey: '' }, ...config } });
  try {
    return await fn(t);
  } finally {
    setClock(null);
    await t.close();
  }
}
/** رسالة واتساب واردة (Webhook كامل عبر المحرك) */
function wa(t, phone, text, extra = {}) {
  return t.app.engine.handleWhatsAppWebhook(waText(phone, text, extra));
}
function waList(t, phone, id, title) {
  return t.app.engine.handleWhatsAppWebhook(waPayload({ from: intl(phone), type: 'interactive', extra: { interactive: { type: 'list_reply', list_reply: { id, title } } } }));
}
function waVoice(t, phone, mediaId = `VOICE-${++seq}`) {
  return t.app.engine.handleWhatsAppWebhook(waPayload({ from: intl(phone), type: 'audio', extra: { audio: { id: mediaId, mime_type: 'audio/ogg' } } }));
}
const intakeOf = (t, phone) =>
  t.app.db.get(
    `SELECT i.*, (${STORY_VIEW_SQL}) AS story_view FROM intakes i JOIN client_identities ci ON ci.client_id = i.client_id AND ci.kind = 'phone' WHERE ci.value = ? ORDER BY i.id DESC LIMIT 1`,
    e164(phone),
  );
const rowOf = (t, id) => t.app.db.get(`SELECT i.*, (${STORY_VIEW_SQL}) AS story_view FROM intakes i WHERE i.id = ?`, id);
const outOf = (t, intakeId) => t.app.db.all("SELECT * FROM messages WHERE intake_id = ? AND direction = 'out' ORDER BY id", intakeId);
const rule = (t, r, intakeId = null) =>
  t.app.db.all(`SELECT * FROM messages WHERE automation_rule = ? ${intakeId ? 'AND intake_id = ?' : ''} ORDER BY id`, ...(intakeId ? [r, intakeId] : [r]));
/** قصة واتساب «جاهزة» ومحلَّلة محليًا */
async function readyStory(t, text = PEN_STORY, phone = newPhone()) {
  wa(t, phone, text);
  wa(t, phone, 'خلاص');
  const i = intakeOf(t, phone);
  t.app.ai.cancelTimers(i.id);
  await t.app.ai.runAuto(i.id);
  return { phone, id: i.id };
}
/** طلب من الموقع (عميلة جديدة: رقم غير مؤكد) */
async function webIntake(t, { phone = newPhone(), name = 'سعاد محمود', description = DESC } = {}) {
  const r = ok(await t.client().post('/api/public/intake', { name, phone, description, consent: true }), 201, 'public intake');
  const i = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
  t.app.ai.cancelTimers(i.id);
  return { ...r, id: i.id, phone };
}
/** طلب «إحنا نكلمك» من الموقع بلا حكاية (نفس عقد §3.3: الجملة الجاهزة + form_answers.story = none) */
function callbackIntake(t, { phone = newPhone(), when = 'morning' } = {}) {
  const label = { morning: 'الصبح', noon: 'الضهر', any: 'أي وقت' }[when];
  const r = t.app.engine.receive({
    channel: 'website',
    from_phone: e164(phone),
    text: `محتاجين حد يكلمنا — ${label}`,
    force_new_intake: true,
    intake_kind: 'consultation',
    extra_meta: { callback: when, callback_canned: true },
  });
  t.app.db.run('UPDATE intakes SET form_answers = ? WHERE id = ?', JSON.stringify({ v: 1, topic: 'inh', answers: { 'inh.deceased': 'husband' }, callback: when, story: 'none', entry: 'home_callback', inferred: {} }), r.intake.id);
  return { id: r.intake.id, phone, client_id: r.client.id };
}
let mgrSeq = 0;
async function managerLogin(t) {
  mgrSeq += 1;
  const username = `storymgr${mgrSeq}`;
  t.app.db.insert('users', { role: 'case_manager', username, name: 'منى الاختبار', password_hash: hashPassword('Manager@2026'), active: 1, created_at: new Date().toISOString() });
  return t.login(username, 'Manager@2026');
}
/** محاكاة Graph API (واتساب «متصل») */
function mockGraph(handler = () => null) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('https://graph.facebook.com/')) return realFetch(url, init);
    let json = null;
    try {
      json = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    } catch {
      json = null;
    }
    const call = { url: u, method: init.method || 'GET', json };
    calls.push(call);
    const r = (await handler(call)) || { status: 200, body: { messages: [{ id: `wamid.OUT.${calls.length}` }] } };
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, restore: () => (globalThis.fetch = realFetch) };
}
const configureWhatsApp = (t) => t.app.integrations.set('whatsapp', { token: 'tok', phone_number_id: 'PNID', app_secret: 'sec', verify_token: 'vt', number: '201000000009' }, null);

// ═════════════════════════ 1–4: حالة القصة ═════════════════════════
describe('v9.2 stories — state, quiet period, «خلاص», revisions', () => {
  test('T1 new WhatsApp intake → collecting; website → ready/website; manual → ready/staff_entry; story_rev = 1', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const p = newPhone();
      wa(t, p, PEN_STORY);
      let i = intakeOf(t, p);
      assert.equal(i.story_state, 'collecting');
      assert.equal(i.story_rev, 1);
      assert.equal(i.story_ready_at, null);
      assert.equal(i.story_view, 'collecting');
      const w = await webIntake(t);
      i = rowOf(t, w.id);
      assert.equal(i.story_state, 'ready');
      assert.equal(i.story_ready_via, 'website');
      assert.equal(i.story_rev, 1);
      const m = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: newPhone(), name: 'أم علي', text: DESC }), 201);
      i = rowOf(t, m.id);
      assert.equal(i.story_state, 'ready');
      assert.equal(i.story_ready_via, 'staff_entry');
      assert.equal(i.story_rev, 1);
      assert.ok(i.story_ready_at);
    });
  });

  test('T2 quiet period: +11 min → ready/quiet, one «وصلتنا حكايتك» with «طلب رقم» (no REQ-/CL-); never twice; nothing when the ack is off', async () => {
    await withApp(async (t) => {
      t.app.settings.set('story_ack_enabled', true);
      const p = newPhone();
      wa(t, p, PEN_STORY);
      const i0 = intakeOf(t, p);
      t.app.ai.cancelTimers(i0.id);
      freezeClock(new Date(Date.now() + 11 * 60 * 1000).toISOString());
      const r = t.app.stories.checkReady();
      assert.equal(r.marked, 1);
      const i = rowOf(t, i0.id);
      assert.equal(i.story_state, 'ready');
      assert.equal(i.story_ready_via, 'quiet');
      let acks = rule(t, 'story_ack', i.id);
      assert.equal(acks.length, 1);
      assert.match(acks[0].body, /طلب رقم \d+/);
      assert.doesNotMatch(acks[0].body, /REQ-|CL-/);
      assert.equal(acks[0].channel, 'whatsapp');
      assert.equal(JSON.parse(acks[0].meta).wa.session_only, true);
      assert.equal(t.app.stories.checkReady().marked, 0);
      acks = rule(t, 'story_ack', i.id);
      assert.equal(acks.length, 1, 'never a second ack');
      t.app.ai.cancelTimers();
    });
    await withApp(async (t) => {
      const p = newPhone();
      wa(t, p, PEN_STORY);
      t.app.ai.cancelTimers();
      freezeClock(new Date(Date.now() + 11 * 60 * 1000).toISOString());
      assert.equal(t.app.stories.checkReady().marked, 1);
      assert.equal(outOf(t, intakeOf(t, p).id).length, 0, 'ack off by default: nothing is sent');
      t.app.ai.cancelTimers();
    });
  });

  test('T3 «خلاص» → ready/client_done at once, meta.story_done, excluded from clientText; «خلاص جوزي طلقني» is not; a 2nd «خلاص» changes nothing', async () => {
    await withApp(async (t) => {
      const p = newPhone();
      wa(t, p, PEN_STORY);
      wa(t, p, 'خلاص');
      const i = intakeOf(t, p);
      assert.equal(i.story_state, 'ready');
      assert.equal(i.story_ready_via, 'client_done');
      const done = t.app.db.get("SELECT meta FROM messages WHERE intake_id = ? AND body = 'خلاص'", i.id);
      assert.equal(JSON.parse(done.meta).story_done, true);
      assert.equal(i.story_rev, 1, '«خلاص» is not a fact');
      const st = t.app.stories.storyText(i.id);
      assert.doesNotMatch(st.clientText, /خلاص/);
      assert.ok(t.app.ai.hasTimer(i.id), 'the summary is scheduled');
      t.app.ai.cancelTimers();
      wa(t, p, 'خلاص');
      assert.equal(t.app.db.value("SELECT COUNT(*) FROM activity WHERE intake_id = ? AND type = 'story.ready'", i.id), 1, 'no second story.ready');
      assert.equal(t.app.ai.hasTimer(i.id), false, 'nothing scheduled by a second «خلاص»');
      const p2 = newPhone();
      wa(t, p2, 'خلاص جوزي طلقني');
      const i2 = intakeOf(t, p2);
      assert.equal(i2.story_state, 'collecting');
      assert.equal(i2.story_rev, 1);
      assert.equal(JSON.parse(t.app.db.get('SELECT meta FROM messages WHERE intake_id = ?', i2.id).meta).story_done, undefined);
      t.app.ai.cancelTimers();
    });
  });

  test('T4 a message after ready → collecting, rev+1; Claude mode: stale between ready and the summary', async () => {
    await withApp(async (t) => {
      const s = await readyStory(t);
      assert.equal(rowOf(t, s.id).story_view, 'ready');
      wa(t, s.phone, 'ونسيت أقول إن عندي تلات عيال');
      const i = rowOf(t, s.id);
      assert.equal(i.story_state, 'collecting');
      assert.equal(i.story_rev, 2);
      t.app.ai.cancelTimers();
      enableClaude(t);
      t.app.stories.markReady(s.id, 'quiet');
      assert.equal(rowOf(t, s.id).story_view, 'stale', 'ready but not summarised yet');
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(s.id);
      assert.equal(rowOf(t, s.id).story_view, 'ready');
      assert.equal(fake.analysisCalls(), 1);
    });
  });
});

// ═════════════════════════ 5: التكلفة في وضع Claude ═════════════════════════
describe('v9.2 stories — Claude cost rules', () => {
  test('T5 5 messages → 0 Claude calls + one upserted preview; ready → exactly 1 call; cap → local with reason; /analyze still Claude; old shape normalised', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      enableClaude(t);
      const p = newPhone();
      const texts = ['السلام عليكم', 'جوزي اتوفى من 4 شهور', 'وكان شغال في مصنع ومتأمن عليه', 'روحت التأمينات رفضوا يصرفوا المعاش', 'عشان اسمه غلط في شهادة الوفاة'];
      for (const x of texts) wa(t, p, x);
      const id = intakeOf(t, p).id;
      await until(() => t.app.db.get("SELECT 1 FROM ai_suggestions WHERE entity_id = ? AND kind = 'intake_preview'", id), 3000);
      await sleep(350);
      assert.equal(fake.analysisCalls(), 0, 'no Claude call while collecting');
      assert.equal(t.app.db.value("SELECT COUNT(*) FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_preview'", id), 1, 'one preview row (upsert)');
      assert.equal(t.app.db.value("SELECT COUNT(*) FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_analysis'", id), 0);
      assert.equal(t.app.db.value("SELECT COUNT(*) FROM ai_usage WHERE entity_type = 'intake' AND entity_id = ?", id), 0, 'no usage row for previews');
      assert.equal(rowOf(t, id).analyzed_rev, 0, 'previews never advance analyzed_rev');
      wa(t, p, 'خلاص');
      assert.ok(t.app.ai.hasTimer(id), 'full analysis scheduled (4 s debounce)');
      await until(() => fake.analysisCalls() === 1, 7000);
      await until(() => rowOf(t, id).analyzed_rev === rowOf(t, id).story_rev, 3000);
      assert.equal(fake.analysisCalls(), 1, 'exactly one Claude call for the finished story');
      const a = t.app.ai.latest('intake', id, 'intake_analysis');
      assert.equal(a.provider, 'anthropic');
      assert.ok(['consultation', 'internal', 'matter', 'refer', 'need_info'].includes(a.output.recommended_track), 'old-shape output gets the heuristic track');
      assert.ok(a.output.request_draft && typeof a.output.request_draft.facts_for_lawyer === 'string');
      // الحد اليومي
      t.app.settings.set('story_auto_ai_max_per_day', 1);
      wa(t, p, 'وعندي تلات عيال في المدارس');
      wa(t, p, 'خلاص');
      t.app.ai.cancelTimers(id);
      await t.app.ai.runAuto(id);
      const capped = t.app.ai.latest('intake', id, 'intake_analysis');
      assert.equal(capped.provider, 'heuristic');
      assert.match(capped.output._fallback_reason, /حد التحليل التلقائي/);
      assert.equal(fake.analysisCalls(), 1);
      const manual = ok(await admin.post(`/api/admin/intakes/${id}/analyze`, {}));
      assert.equal(manual.provider, 'anthropic', '«حلّل الآن» bypasses the cap');
      assert.equal(fake.analysisCalls(), 2);
      const call = fake.calls.find((c) => c.feature === 'intake_analysis');
      assert.match(call.params.messages[0].content, /الموضوع الذي اختارته: /);
      assert.match(call.params.messages[0].content, /الرسائل الصوتية: 0 \(مكتوبة 0، لم تُكتب 0\)/);
    });
  });
});

// ═════════════════════════ 6–9: واتساب: الترحيب والموضوع والقوائم والنافذة ═════════════════════════
describe('v9.2 stories — WhatsApp welcome, topics, list dispatch, portal', () => {
  test('T6 welcome (setting on): one list with the 8 topics; never on 2nd message, website, confirm code, warm client, prefill or by default; unread stays 1', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const p = newPhone();
      wa(t, p, 'السلام عليكم');
      assert.equal(rule(t, 'story_welcome').length, 0, 'off by default in code');
      t.app.settings.set('story_welcome_enabled', true);
      const p1 = newPhone();
      wa(t, p1, 'السلام عليكم');
      const i1 = intakeOf(t, p1);
      let w = rule(t, 'story_welcome', i1.id);
      assert.equal(w.length, 1);
      const meta = JSON.parse(w[0].meta);
      assert.equal(meta.wa.type, 'list');
      assert.equal(meta.wa.session_only, true);
      assert.equal(meta.portal_hidden, true);
      const rows = meta.wa.sections[0].rows;
      assert.deepEqual(rows.map((r) => r.id), TOPICS.map((x) => `topic:${x.key}`));
      assert.equal(rows.length, 8);
      assert.equal(rowOf(t, i1.id).unread_count, 1, 'the welcome does not mark her message read');
      assert.ok(rowOf(t, i1.id).welcome_sent_at);
      for (const form of ['f', 'm']) {
        t.app.db.run('UPDATE clients SET address_form = ? WHERE id = ?', form, i1.client_id);
        const l = t.app.stories.welcomeList(rowOf(t, i1.id));
        assert.ok(l.header.length <= 60 && l.footer.length <= 60 && l.button.length <= 20 && l.text.length <= 1024, `limits (${form})`);
        assert.ok(l.sections[0].title.length <= 24);
        for (const r of l.sections[0].rows) assert.ok(r.title.length <= 24 && r.description.length <= 72, `${r.id} (${form})`);
        assert.doesNotMatch(JSON.stringify(l), /\{[يةا-ي]\}/, 'gender tokens filled');
      }
      wa(t, p1, 'جوزي اتوفى');
      assert.equal(rule(t, 'story_welcome', i1.id).length, 1, 'not on the 2nd message');
      await webIntake(t);
      const p2 = newPhone();
      wa(t, p2, 'السلام عليكم، ده رقم طلبي REQ-2026-99999 وكود التأكيد 123456');
      assert.equal(rule(t, 'story_welcome', intakeOf(t, p2).id).length, 0, 'not on a confirm-code message');
      // عميلة «دافئة»: وصلتها رسالة منا خلال 24 ساعة
      const p3 = newPhone();
      const m = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: p3, name: 'أم علي', text: DESC }), 201);
      ok(await admin.post(`/api/admin/intakes/${m.id}/reply`, { body: 'أهلًا، اتصلنا بيكي.' }));
      ok(await admin.post(`/api/admin/intakes/${m.id}/archive`, { reason: 'تجربة' }));
      wa(t, p3, 'السلام عليكم');
      const i3 = intakeOf(t, p3);
      assert.notEqual(i3.id, m.id);
      assert.equal(rule(t, 'story_welcome', i3.id).length, 0, 'not to a warm client');
      const p4 = newPhone();
      wa(t, p4, 'السلام عليكم، عندي مشكلة في الورث.');
      assert.equal(rule(t, 'story_welcome', intakeOf(t, p4).id).length, 0, 'not when the website prefill already chose the topic');
      t.app.ai.cancelTimers();
    });
  });

  test('T7 list reply topic:pen → topic + area + context marker + one nudge; unknown ids ignored; evt:/svy: untouched; website prefill = topic, not factual, no welcome', async () => {
    await withApp(async (t) => {
      t.app.settings.set('story_welcome_enabled', true);
      const p = newPhone();
      wa(t, p, 'السلام عليكم');
      waList(t, p, 'topic:pen', 'معاش');
      const i = intakeOf(t, p);
      assert.equal(i.topic, 'pen');
      assert.equal(i.legal_area, 'PEN');
      assert.equal(i.story_rev, 0, 'a tile is not a fact');
      assert.match(t.app.stories.storyText(i.id).contextText, /\[اختارت الموضوع من القائمة: معاش\]/);
      assert.equal(rule(t, 'story_topic_nudge', i.id).length, 1);
      waList(t, p, 'topic:inh', 'ورث');
      assert.equal(rule(t, 'story_topic_nudge', i.id).length, 1, 'nudge once per intake');
      waList(t, p, 'topic:zzz', 'غريب');
      assert.equal(intakeOf(t, p).topic, 'inh', 'unknown topic ids are ignored');
      const unk = t.app.db.get("SELECT meta FROM messages WHERE intake_id = ? AND body = 'غريب'", i.id);
      assert.equal(JSON.parse(unk.meta).topic, undefined);
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: intl(p), type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id: 'evt:999:yes', title: 'هحضر' } } } }));
      assert.equal(intakeOf(t, p).story_rev, 0, 'evt: replies are not facts');
      const p2 = newPhone();
      wa(t, p2, 'السلام عليكم، عندي مشكلة في الورث.');
      const i2 = intakeOf(t, p2);
      assert.equal(i2.topic, 'inh');
      assert.equal(i2.story_rev, 0);
      assert.equal(JSON.parse(t.app.db.get('SELECT meta FROM messages WHERE intake_id = ?', i2.id).meta).topic_prefill, true);
      assert.equal(rule(t, 'story_welcome', i2.id).length, 0);
      t.app.ai.cancelTimers();
    });
  });

  test('T8 sendList payload; list inside the window; session_only outside → failed silently, not in failed KPI, retry 409, preview keeps her message', async () => {
    const g = mockGraph();
    try {
      await withApp(async (t) => {
        const admin = await t.login('admin');
        configureWhatsApp(t);
        t.app.settings.set('story_welcome_enabled', true);
        const p = newPhone();
        wa(t, p, 'السلام عليكم يا جماعة');
        const i = intakeOf(t, p);
        const w = rule(t, 'story_welcome', i.id)[0];
        await until(() => t.app.db.get('SELECT status FROM messages WHERE id = ?', w.id).status === 'sent');
        const call = g.calls.find((c) => c.json?.type === 'interactive');
        assert.ok(call, 'list sent through Graph');
        assert.equal(call.json.interactive.type, 'list');
        assert.equal(call.json.interactive.action.sections[0].rows.length, 8);
        assert.ok(call.json.interactive.action.button.length <= 20);
        assert.equal(JSON.parse(t.app.db.get('SELECT meta FROM messages WHERE id = ?', w.id).meta).via, 'interactive');
        // خارج النافذة: رسالة آلية مرتبطة بالنافذة تفشل بهدوء
        const notesBefore = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'message.failed'"));
        t.app.db.run("UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z' WHERE intake_id = ? AND direction = 'in'", i.id);
        const before = g.calls.length;
        const row = t.app.engine.sendToClient({ client_id: i.client_id, intake_id: i.id, body: 'تجربة', channel: 'whatsapp', automated: true, rule: 'story_ack', keep_unread: true, meta: { wa: { session_only: true } } });
        await until(() => t.app.db.get('SELECT status FROM messages WHERE id = ?', row.id).status === 'failed');
        const failed = t.app.db.get('SELECT * FROM messages WHERE id = ?', row.id);
        assert.equal(failed.status, 'failed');
        assert.match(failed.error, /انتهت نافذة الـ 24 ساعة/);
        assert.equal(g.calls.length, before, 'never falls back to a template');
        assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'message.failed'")), notesBefore, 'no staff notification');
        const dash = ok(await admin.get('/api/admin/dashboard'));
        assert.equal(dash.failed_messages, 0, 'story automation failures are not in the failed KPI');
        const retry = await admin.post(`/api/admin/messages/${row.id}/retry`, {});
        assert.equal(retry.status, 409);
        const list = ok(await admin.get('/api/admin/intakes'));
        const item = list.items.find((x) => x.id === i.id);
        assert.equal(item.last_direction, 'in', 'the inbox preview still shows her last message');
      });
    } finally {
      g.restore();
    }
  });

  test('T9 the portal hides the welcome, the nudge and call notes; the ack is visible', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      t.app.settings.set('story_welcome_enabled', true);
      t.app.settings.set('story_ack_enabled', true);
      const p = newPhone();
      wa(t, p, 'السلام عليكم');
      waList(t, p, 'topic:pen', 'معاش');
      wa(t, p, PEN_STORY);
      wa(t, p, 'خلاص');
      const i = intakeOf(t, p);
      t.app.ai.cancelTimers();
      assert.equal(rule(t, 'story_ack', i.id).length, 1);
      ok(await admin.post(`/api/admin/intakes/${i.id}/call-note`, { text: 'قالت في التليفون إن المعاش متوقف من شهرين', client_ref: 'cn-portal-1' }), 201);
      const token = t.app.clients.issuePortalToken(i.client_id);
      const view = ok(await t.client().get(`/api/portal/${token}`));
      const bodies = view.messages.map((m) => m.body).join('\n');
      assert.doesNotMatch(bodies, /ده الدعم القانوني في/, 'welcome hidden');
      assert.doesNotMatch(bodies, /احك.? لنا حصل إيه/, 'nudge hidden');
      assert.doesNotMatch(bodies, /المعاش متوقف من شهرين/, 'call note hidden');
      assert.match(bodies, /وصلتنا حكايتك/, 'ack visible');
    });
  });

  test('T10 migration defaults: legacy rows are ready 0/0 and checkReady() schedules nothing', async () => {
    await withApp(async (t) => {
      const c = t.app.clients.create({ name: 'قديمة' });
      const now = new Date().toISOString();
      const id = t.app.db.insert('intakes', { code: 'REQ-2025-00001', client_id: c.id, status: 'new', first_channel: 'whatsapp', created_at: now, updated_at: now });
      const r = rowOf(t, id);
      assert.equal(r.story_state, 'ready');
      assert.equal(r.story_rev, 0);
      assert.equal(r.analyzed_rev, 0);
      freezeClock(new Date(Date.now() + 60 * 60 * 1000).toISOString());
      assert.deepEqual(t.app.stories.checkReady(), { marked: 0, scheduled: 0, media_retried: 0, notices: 0 });
      assert.equal(t.app.ai.hasTimer(id), false);
    });
  });
});

// ═════════════════════════ 11–14: القائمة والمحلل المحلي والمخطط والبيانات التجريبية ═════════════════════════
describe('v9.2 stories — inbox triage, heuristic, schema, seed', () => {
  test('T11 inbox: story/form fields, story= filters, track=, triage order (callback first, blocked tied with ready), story_counts = filter totals', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const cb = callbackIntake(t);
      const a = await readyStory(t, PEN_STORY);
      const v = t.app.engine.receive({ channel: 'website', from_phone: e164(newPhone()), contact_name: 'أم ياسين', text: '[رسالة صوتية]', attachments: [{ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64 }], force_new_intake: true });
      const blockedId = v.intake.id;
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(blockedId);
      const c = await readyStory(t, INFO_STORY);
      const collecting = newPhone();
      wa(t, collecting, 'جوزي اتوفى وأهله واخدين الشقة');
      const stale = await readyStory(t, 'أبو العيال مش بيصرف عليهم من سنة ومش عارفة أعمل إيه في النفقة والمدارس');
      t.app.db.run('UPDATE intakes SET story_rev = story_rev + 1 WHERE id = ?', stale.id);
      const aw = await readyStory(t, 'الشقة إيجار قديم وصاحب البيت بعتلنا إنذار وعايز يطلعنا منها بعد ما جوزي اتوفى');
      t.app.db.run("UPDATE intakes SET status = 'awaiting_client' WHERE id = ?", aw.id);
      // ترتيب الجاهزة والمحجوبة بوقت الاكتمال (المحجوبة بين جاهزتين)
      t.app.db.run("UPDATE intakes SET story_ready_at = '2026-01-01T08:00:00.000Z' WHERE id = ?", a.id);
      t.app.db.run("UPDATE intakes SET story_ready_at = '2026-01-01T09:00:00.000Z' WHERE id = ?", blockedId);
      t.app.db.run("UPDATE intakes SET story_ready_at = NULL, last_inbound_at = '2026-01-01T10:00:00.000Z' WHERE id = ?", c.id);
      t.app.ai.cancelTimers();
      const res = ok(await admin.get('/api/admin/intakes?sort=triage'));
      const order = res.items.map((x) => x.id);
      const pos = (id) => order.indexOf(id);
      assert.equal(order[0], cb.id, 'call-back requests first');
      assert.ok(pos(a.id) < pos(blockedId) && pos(blockedId) < pos(c.id), 'blocked ranks with ready by story_ready_at; legacy NULL ready_at by last_inbound_at');
      assert.ok(pos(c.id) < pos(stale.id), 'stale after ready');
      assert.ok(pos(stale.id) < pos(intakeOf(t, collecting).id), 'collecting after stale');
      assert.ok(pos(intakeOf(t, collecting).id) < pos(aw.id), 'awaiting last');
      const item = res.items.find((x) => x.id === cb.id);
      assert.equal(item.story.view, 'callback');
      assert.equal(item.form.callback, 'morning');
      assert.equal(item.form.callback_label, 'صباحًا');
      assert.equal(item.form.title, STAFF_LINES_TITLE);
      assert.ok(item.form.lines.includes('الموضوع: ورث'));
      const bl = res.items.find((x) => x.id === blockedId);
      assert.equal(bl.story.view, 'blocked');
      assert.equal(bl.story.voice.missing, 1);
      assert.ok(!('contact_phone' in item), 'the inbox list stays phone-free');
      for (const view of ['callback', 'collecting', 'ready', 'stale', 'awaiting', 'blocked', 'voice']) {
        const f = ok(await admin.get(`/api/admin/intakes?story=${view}`));
        assert.equal(f.total, res.story_counts[view], `story_counts.${view} = filter total`);
        if (view !== 'voice') for (const x of f.items) assert.equal(x.story.view, view);
      }
      const tr = ok(await admin.get('/api/admin/intakes?track=internal'));
      assert.ok(tr.items.length >= 1);
      for (const x of tr.items) assert.equal(x.ai.track, 'internal');
      const ready = res.items.find((x) => x.id === a.id);
      assert.ok(ready.ai.one_line);
      assert.equal(ready.ai.track, 'consultation');
      assert.equal(ready.ai.track_label, LABELS.story_track.consultation);
    });
  });

  test('T12 heuristic tracks: the 5 seed texts; voice-only blocked; call-back-only no_story; «أبو العيال مش بيدفع مصاريف علاج البنت» is not refer', () => {
    const refs = DEFAULT_SETTINGS.story_referrals;
    const qrs = [{ id: 1, title: 'المستندات المطلوبة لإعلام الوراثة', body: 'أهلًا {client_name}، لاستخراج إعلام الوراثة…', usage_count: 3 }];
    const ctx = { referrals: refs, quickReplies: qrs };
    const s1 = H.analyzeIntake(
      'جوزي اتوفى من 4 شهور\nروحت التأمينات قالولي في مشكلة في الورق\nهو كان شغال في مصنع وكان متأمن عليه، ولما روحت مكتب التأمينات قالولي اسمه مكتوب غلط في شهادة الوفاة ولازم يتصلح قبل ما يصرفوا المعاش، وأنا معايا تلات عيال',
      { ...ctx, topic: 'pen' },
    );
    assert.equal(s1.recommended_track, 'consultation');
    assert.equal(s1.legal_area, 'PEN');
    const s2 = H.analyzeIntake('جالي إعلان من المحكمة\nأبو العيال رافع عليا قضية ضم حضانة\nالجلسة يوم 20 الشهر ده في محكمة الأسرة بالمطرية', ctx);
    assert.equal(s2.recommended_track, 'matter');
    assert.equal(s2.legal_area, 'FAM');
    assert.equal(s2.request_draft.matter.kind, 'litigation');
    assert.equal(s2.request_draft.matter.court, 'محكمة الأسرة بالمطرية');
    assert.ok(['high', 'urgent'].includes(s2.urgency));
    const s3 = H.analyzeIntake(INFO_STORY, ctx);
    assert.equal(s3.recommended_track, 'internal');
    assert.equal(s3.reply_source.title, 'المستندات المطلوبة لإعلام الوراثة');
    const s4 = H.analyzeIntake('محتاجة مساعدة في مصاريف عملية لبنتي', ctx);
    assert.equal(s4.recommended_track, 'refer');
    assert.equal(s4.request_draft.referral_target, refs[0].label);
    const s5 = H.analyzeIntake('السلام عليكم\nعايزة أسأل على حاجة', { ...ctx, topic: 'other' });
    assert.equal(s5.recommended_track, 'need_info');
    assert.equal(s5.request_draft.questions_for_her[0], 'احكيلنا في جملتين: حصل إيه، ومع مين؟');
    const voice = H.analyzeIntake('[رسالة صوتية]', { ...ctx, voice: { total: 1, done: 0, missing: 1 }, meaningfulLetters: 0 });
    assert.equal(voice.recommended_track, null);
    assert.equal(voice.blocked, 'voice_untranscribed');
    const cb = H.analyzeIntake('', { ...ctx, blocked: 'no_story', meaningfulLetters: 0 });
    assert.equal(cb.recommended_track, null);
    assert.equal(cb.blocked, 'no_story');
    assert.equal(cb.missing_info[0].item, 'حكاية المستفيدة (تُسمع في المكالمة)');
    assert.notEqual(H.analyzeIntake('أبو العيال مش بيدفع مصاريف علاج البنت', ctx).recommended_track, 'refer');
    assert.notEqual(H.analyzeIntake('محتاجة فلوس لمصاريف العيال من أبوهم', { ...ctx, topic: 'alimony' }).recommended_track, 'refer');
  });

  test('T13 ANALYSIS_SCHEMA: new keys strict & required; drafts masked, codes/foreign phones/URLs stripped, ≤ 3 questions; prompt has the form-answers sentence and no STT wording', async () => {
    const props = ANALYSIS_SCHEMA.properties;
    for (const k of ['one_line', 'recommended_track', 'track_reason', 'track_confidence', 'request_draft']) {
      assert.ok(props[k], k);
      assert.ok(ANALYSIS_SCHEMA.required.includes(k), `${k} required`);
    }
    assert.deepEqual(props.recommended_track.enum, ['consultation', 'matter', 'internal', 'refer', 'need_info']);
    for (const bad of ['suggestions', 'doc_type', 'used_sources', 'issues', 'text']) assert.ok(!(bad in props), `no top-level ${bad}`);
    const strict = (s, where) => {
      if (!s || typeof s !== 'object') return;
      if (s.type === 'object') {
        assert.equal(s.additionalProperties, false, `${where} strict`);
        assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${where} all required`);
        for (const [k, x] of Object.entries(s.properties)) strict(x, `${where}.${k}`);
      }
      if (s.items) strict(s.items, `${where}[]`);
      for (const x of s.anyOf || []) strict(x, where);
    };
    strict(ANALYSIS_SCHEMA, 'analysis');
    const raw = {
      ...OLD_SHAPE,
      one_line: 'أرملة يرفض أهل زوجها',
      recommended_track: 'internal',
      track_reason: 'سؤال إجرائي',
      track_confidence: 0.8,
      request_draft: {
        title: 'عنوان',
        facts_for_lawyer: 'رقمها 01012345678 والقومي 29001011234567 https://evil.example/x',
        internal_note: null,
        brief_for_lawyer: 'شوف wa.me/201011112222 و https://evil.example',
        matter: null,
        questions_for_her: ['س1', 'س2', 'س3', 'س4'],
        reply_to_her: '{hello}، ملفك INH-2026-00482 كلمي 01099998888 أو {org_phone} أو 01211114662 أو https://evil.example و wa.me/2010 — {org_name}',
        referral_target: null,
        resolution_note: 'تم',
      },
    };
    const o = normalizeStory(raw, { orgPhone: '01211114662' });
    assert.equal(o.recommended_track, 'internal');
    assert.doesNotMatch(o.request_draft.facts_for_lawyer, /01012345678|29001011234567|https?:/);
    assert.doesNotMatch(o.request_draft.reply_to_her, /INH-2026|01099998888|https?:|wa\.me/);
    assert.match(o.request_draft.reply_to_her, /01211114662/, 'the org phone stays');
    assert.equal(o.request_draft.brief_for_lawyer, null, 'brief only for consultation/matter');
    const o2 = normalizeStory({ ...raw, recommended_track: 'consultation' }, {});
    assert.doesNotMatch(o2.request_draft.brief_for_lawyer, /wa\.me|https?:|201011112222/);
    assert.equal(o2.request_draft.reply_to_her, null);
    const o3 = normalizeStory({ ...raw, recommended_track: 'need_info' }, {});
    assert.equal(o3.request_draft.questions_for_her.length, 3);
    // عبر Claude فعليًا (نسخة وهمية): الروابط تُحذف من المسودات المحفوظة
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t, INFO_STORY);
      enableClaude(t);
      fake.output = raw;
      ok(await admin.post(`/api/admin/intakes/${s.id}/analyze`, {}));
      const a = t.app.ai.latest('intake', s.id, 'intake_analysis');
      assert.equal(a.provider, 'anthropic');
      assert.doesNotMatch(JSON.stringify(a.output.request_draft), /evil\.example|wa\.me/);
      const sys = fake.calls.find((c) => c.feature === 'intake_analysis').params.system[1].text;
      assert.match(sys, /اختيارات النموذج ضغطات على صور وقد تكون خاطئة؛ كلامها هو المعتمد، ولا تُنقل للمحامي كوقائع\./);
      assert.doesNotMatch(sys, /تحويل آلي/);
    });
  });

  test('T14 seed: the 6 stories with their views/tracks; story 6 collecting; story 1 transcript confirmed; call-back seed; ack on; +11 min → exactly story 6 marked and one analysis scheduled', async () => {
    await withApp(
      async (t) => {
        const byPhone = (p) => intakeOf(t, p);
        const s = ['01092000201', '01092000202', '01092000203', '01092000204', '01092000205', '01092000206'].map(byPhone);
        assert.deepEqual(s.map((x) => x.story_view), ['ready', 'ready', 'ready', 'ready', 'ready', 'collecting']);
        assert.deepEqual(s.slice(0, 5).map((x) => x.ai_track), ['consultation', 'matter', 'internal', 'refer', 'need_info']);
        assert.equal(s[0].story_ready_via, 'client_done');
        assert.ok(s[0].story_ack_sent_at, 'story 1 got «وصلتنا حكايتك»');
        assert.equal(s[1].voice_missing, 1, 'story 2 keeps an untyped voice note');
        const m2 = t.app.ai.latest('intake', s[1].id, 'intake_analysis').output;
        assert.equal(m2.request_draft.matter.court, 'محكمة الأسرة بالمطرية');
        const tr = t.app.db.get(
          "SELECT t.status, u.name FROM voice_transcripts t JOIN documents d ON d.id = t.document_id LEFT JOIN users u ON u.id = t.updated_by WHERE d.intake_id = ?",
          s[0].id,
        );
        assert.equal(tr.status, 'confirmed');
        assert.equal(tr.name, 'منى السيد');
        assert.equal(t.app.settings.get('story_ack_enabled'), true);
        assert.equal(t.app.settings.get('story_welcome_enabled'), false);
        const callbacks = t.app.db.all(`SELECT i.id FROM intakes i WHERE (${STORY_VIEW_SQL}) = 'callback'`);
        assert.ok(callbacks.length >= 1, 'the public call-back seed shows as «طلبت مكالمة»');
        assert.ok(t.app.db.get(`SELECT 1 FROM intakes i WHERE (${STORY_VIEW_SQL}) = 'blocked'`), 'a blocked (voice-only) story');
        freezeClock(new Date(Date.now() + 11 * 60 * 1000).toISOString());
        const r = t.app.stories.checkReady();
        assert.equal(r.marked, 1);
        assert.equal(r.scheduled, 1);
        assert.equal(rowOf(t, s[5].id).story_state, 'ready');
        t.app.ai.cancelTimers();
      },
      { seed: 'demo' },
    );
  });
});

// ═════════════════════════ 15–21: الاعتماد بنقرة ═════════════════════════
describe('v9.2 stories — accept (one click)', () => {
  test('T15 consultation: case + brief_draft + track feedback + activity; 409 story_changed and force; lawyer view has no brief_draft; unverified website intake never overwrites the client name', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      assert.equal(pr.track.recommended, 'consultation');
      assert.ok(pr.drafts.consultation.case.brief_draft);
      assert.match(pr.drafts.consultation.reply.text, /اتسجّل/);
      assert.doesNotMatch(pr.drafts.consultation.reply.text, /\{[a-z_]+\}/);
      const brief = 'المطلوب: رأي في صرف المعاش BRIEF-MARK-1';
      const r = ok(
        await admin.post(`/api/admin/intakes/${s.id}/accept`, {
          track: 'consultation',
          suggestion_id: pr.suggestion_id,
          story_rev: pr.story.rev,
          case: { ...pr.drafts.consultation.case, brief_draft: brief },
          reply: pr.drafts.consultation.reply,
        }),
      );
      assert.ok(r.case.id);
      assert.equal(r.next, `#/cases/${r.case.id}`);
      assert.equal(r.intake.status, 'converted');
      assert.equal(r.feedback.track, 'accepted');
      assert.equal(r.message.channel, 'whatsapp');
      assert.equal(t.app.db.value('SELECT brief_draft FROM cases WHERE id = ?', r.case.id), brief);
      const fb = t.app.db.get("SELECT verdict FROM ai_feedback WHERE entity_id = ? AND field = 'track'", s.id);
      assert.equal(fb.verdict, 'accepted');
      const act = t.app.db.get("SELECT data FROM activity WHERE intake_id = ? AND type = 'story.accepted'", s.id);
      const data = JSON.parse(act.data);
      assert.equal(data.rev_seen, pr.story.rev);
      assert.equal(data.rev_now, pr.story.rev);
      assert.equal(data.forced, false);
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'ai.story_accepted'"), 'audited');
      // المحامي: لا brief_draft في عرض الإسناد
      const lawyer = await createLawyer(admin, {});
      const asg = await assign(admin, r.case.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'رأي مبدئي في المعاش', grants: { facts: true } });
      const lc = await t.login(lawyer.username);
      const view = await lc.get(`/api/lawyer/assignments/${asg.id}`);
      assert.equal(view.status, 200);
      assert.doesNotMatch(JSON.stringify(view.body), /BRIEF-MARK-1|brief_draft/);
      // 409 ثم «متابعة رغم ذلك»
      const s2 = await readyStory(t);
      const pr2 = ok(await admin.get(`/api/admin/intakes/${s2.id}/proposal`));
      wa(t, s2.phone, 'وكمان عايزة أعرف مين يصرف المعاش للعيال');
      t.app.ai.cancelTimers();
      const body = { track: 'consultation', story_rev: pr2.story.rev, case: pr2.drafts.consultation.case };
      const c409 = await admin.post(`/api/admin/intakes/${s2.id}/accept`, body);
      assert.equal(c409.status, 409);
      assert.equal(c409.body.code, 'story_changed');
      assert.equal(c409.body.details.current_rev, pr2.story.rev + 1);
      assert.equal(rowOf(t, s2.id).status !== 'converted', true);
      const forced = ok(await admin.post(`/api/admin/intakes/${s2.id}/accept`, { ...body, force: true }));
      assert.ok(forced.case.id);
      assert.equal(JSON.parse(t.app.db.get("SELECT data FROM activity WHERE intake_id = ? AND type = 'story.accepted'", s2.id).data).forced, true);
      // [R2-A22] طلب موقع برقم عميلة موثّقة: لا يُكتب فوق اسمها
      const p = newPhone();
      wa(t, p, PEN_STORY);
      const verified = intakeOf(t, p);
      t.app.ai.cancelTimers();
      ok(await admin.patch(`/api/admin/clients/${verified.client_id}`, { name: 'سعاد محمود الأصلية' }));
      ok(await admin.post(`/api/admin/intakes/${verified.id}/archive`, { reason: 'تجربة' }));
      const w = await webIntake(t, { phone: p, name: 'شخص آخر', description: DESC });
      await t.app.ai.runAuto(w.id);
      const wi = rowOf(t, w.id);
      assert.equal(JSON.parse(wi.source_detail).phone_match_unverified, true);
      const prw = ok(await admin.get(`/api/admin/intakes/${w.id}/proposal`));
      assert.equal(prw.drafts.consultation.case.client, undefined, 'no client draft for an unverified website request');
      ok(await admin.post(`/api/admin/intakes/${w.id}/accept`, { track: 'consultation', story_rev: prw.story.rev, case: { ...prw.drafts.consultation.case, client: { name: 'شخص آخر' } } }));
      assert.equal(t.app.clients.get(verified.client_id).name, 'سعاد محمود الأصلية');
    });
  });

  test('T16 matter: case + matter with kind/court/opponent, conflict check; invalid lawyer → 400 and nothing created', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t, 'جالي إعلان من المحكمة، أبو العيال رافع عليا قضية ضم حضانة، والجلسة يوم 20 الشهر ده في محكمة الأسرة بالمطرية');
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      assert.equal(pr.track.recommended, 'matter');
      assert.equal(pr.drafts.matter.matter.court, 'محكمة الأسرة بالمطرية');
      const casesBefore = Number(t.app.db.value('SELECT COUNT(*) FROM cases'));
      const bad = await admin.post(`/api/admin/intakes/${s.id}/accept`, {
        track: 'matter', story_rev: pr.story.rev, case: pr.drafts.matter.case, matter: { ...pr.drafts.matter.matter, responsible_lawyer_id: 99999 },
      });
      assert.equal(bad.status, 400);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM cases')), casesBefore, 'nothing created');
      assert.equal(rowOf(t, s.id).decided_track, null);
      const r = ok(
        await admin.post(`/api/admin/intakes/${s.id}/accept`, {
          track: 'matter', story_rev: pr.story.rev, case: pr.drafts.matter.case, matter: { ...pr.drafts.matter.matter, opponent: 'كريم عبد الحميد' },
        }),
      );
      assert.ok(r.case.id && r.matter.id);
      assert.equal(r.next, `#/matters/${r.matter.id}`);
      const m = t.app.db.get('SELECT * FROM matters WHERE id = ?', r.matter.id);
      assert.equal(m.kind, 'litigation');
      assert.equal(m.court, 'محكمة الأسرة بالمطرية');
      assert.equal(m.opponent, 'كريم عبد الحميد');
      assert.ok(t.app.db.get("SELECT 1 FROM case_parties WHERE matter_id = ? AND origin = 'matter_opponent'", m.id), 'conflict check ran on the opponent');
    });
  });

  test('T17 internal: handled_internally + answered, WhatsApp reply (simulated), corrected feedback; deliver:phone needs a call note', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      assert.equal(pr.track.recommended, 'consultation');
      const r = ok(
        await admin.post(`/api/admin/intakes/${s.id}/accept`, {
          track: 'internal', story_rev: pr.story.rev, resolution_note: 'أرشدناها لمكتب التأمينات', reply: { send: true, text: 'أهلًا بيكي، روحي مكتب التأمينات بشهادة الوفاة المصححة. — مؤسسة بيوت مصر' },
        }),
      );
      assert.equal(r.intake.status, 'handled_internally');
      assert.equal(r.intake.resolution_kind, 'answered');
      assert.equal(r.message.channel, 'whatsapp');
      assert.equal(r.message.status, 'simulated');
      assert.equal(r.feedback.track, 'corrected');
      const s2 = await readyStory(t, INFO_STORY);
      const pr2 = ok(await admin.get(`/api/admin/intakes/${s2.id}/proposal`));
      const noNote = await admin.post(`/api/admin/intakes/${s2.id}/accept`, { track: 'internal', story_rev: pr2.story.rev, deliver: 'phone', resolution_note: 'بلّغناها' });
      assert.equal(noNote.status, 400);
      assert.match(noNote.body.error, /سجّل المكالمة أولًا/);
      const cn = ok(await admin.post(`/api/admin/intakes/${s2.id}/call-note`, { text: 'اتكلمت معاها وفهمت إنها عايزة الورق بس', client_ref: 'cn-17' }), 201);
      const before = outOf(t, s2.id).length;
      const rev = rowOf(t, s2.id).story_rev;
      const done = ok(await admin.post(`/api/admin/intakes/${s2.id}/accept`, { track: 'internal', story_rev: rev, deliver: 'phone', call_note_id: cn.message_id, resolution_note: 'بلّغناها بالتليفون' }));
      assert.equal(done.intake.status, 'handled_internally');
      assert.equal(done.message, null);
      assert.equal(outOf(t, s2.id).length, before, 'no outbound message');
    });
  });

  test('T18 refer: referral + referral_to; unverified website story keeps its link and sees the message; unfilled {org_phone} → 400; {portal_link} accepted', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const w = await webIntake(t, { description: 'محتاجة مساعدة في مصاريف عملية لبنتي ضروري جدا' });
      await t.app.ai.runAuto(w.id);
      const pr = ok(await admin.get(`/api/admin/intakes/${w.id}/proposal`));
      assert.equal(pr.track.recommended, 'refer');
      assert.equal(pr.identity.unconfirmed, true);
      t.app.settings.set('org_phone', '');
      const pr2 = ok(await admin.get(`/api/admin/intakes/${w.id}/proposal`));
      assert.ok(pr2.warnings.some((x) => x.code === 'no_org_phone'));
      const bad = await admin.post(`/api/admin/intakes/${w.id}/accept`, { track: 'refer', story_rev: pr2.story.rev, referral_target: 'برامج المؤسسة', reply: { send: true, text: pr2.drafts.refer.reply.text } });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /\{org_phone\}/);
      const r = ok(
        await admin.post(`/api/admin/intakes/${w.id}/accept`, {
          track: 'refer', story_rev: pr2.story.rev, referral_target: 'برامج المؤسسة', reply: { send: true, text: 'أهلًا بيكي، كلمي المؤسسة واسألي عن برامج المساعدات.\nصفحة طلبك: {portal_link}\n— مؤسسة بيوت مصر' },
        }),
      );
      assert.equal(r.intake.status, 'handled_internally');
      assert.equal(r.intake.resolution_kind, 'referral');
      assert.equal(rowOf(t, w.id).referral_to, 'برامج المؤسسة');
      assert.equal(r.message.channel, 'website');
      const token = w.portal_url.split('/p/')[1];
      const view = ok(await t.client().get(`/api/portal/${token}`), 200, 'the follow-up link is still valid');
      assert.ok(view.messages.some((m) => /برامج المساعدات/.test(m.body)));
      assert.doesNotMatch(JSON.stringify(view.messages), /\{portal_link\}/);
    });
  });

  test('T19 need_info: questions sent, awaiting; second need_info → 409; her reply → in_review + collecting; context has «— رسالة من المؤسسة:», clientText does not; no AI text without accept', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t, 'السلام عليكم، عايزة أسأل على حاجة');
      assert.equal(outOf(t, s.id).length, 0, 'the analysis alone sends nothing');
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      assert.equal(pr.track.recommended, 'need_info');
      assert.ok(pr.drafts.need_info.questions.length >= 1);
      const r = ok(await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'need_info', story_rev: pr.story.rev, questions: pr.drafts.need_info.questions }));
      assert.equal(r.intake.status, 'awaiting_client');
      const q = outOf(t, s.id)[0];
      assert.deepEqual(JSON.parse(q.meta).story_questions, pr.drafts.need_info.questions);
      assert.match(q.body, /محتاجين نعرف/);
      const again = await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'need_info', story_rev: pr.story.rev, questions: ['سؤال؟'] });
      assert.equal(again.status, 409);
      assert.match(again.body.error, /سبق إرسال أسئلة لم تُجب بعد/);
      wa(t, s.phone, 'جوزي اتوفى وأهله واخدين الشقة ومش راضيين يدوني نصيبي');
      const i = rowOf(t, s.id);
      assert.equal(i.status, 'in_review');
      assert.equal(i.story_state, 'collecting');
      const st = t.app.stories.storyText(s.id);
      assert.match(st.contextText, /— رسالة من المؤسسة:/);
      assert.doesNotMatch(st.clientText, /رسالة من المؤسسة|محتاجين نعرف/);
      t.app.ai.cancelTimers();
    });
  });

  test('T20 B91-01: need_info/internal on an unconfirmed website story go to her page only; explicit whatsapp → 400 with zero rows; proposal says «call her»', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const w = await webIntake(t, { description: INFO_STORY });
      await t.app.ai.runAuto(w.id);
      const pr = ok(await admin.get(`/api/admin/intakes/${w.id}/proposal`));
      assert.equal(pr.track.recommended, 'internal');
      assert.equal(pr.actions.primary, 'call');
      assert.match(pr.actions.call_intro, /اتأكد إنك بتكلمها هي/);
      // [مراجعة 9.2] بلا رد جاهز في هذه القاعدة: المسودة تحية وتوقيع فقط فلا تُقرأ لها كنص مكالمة (انظر R2 للرد الجاهز)
      assert.equal(pr.actions.call_script, null);
      assert.ok(pr.warnings.some((x) => x.code === 'unconfirmed'));
      const msgsBefore = Number(t.app.db.value('SELECT COUNT(*) FROM messages'));
      const bad = await admin.post(`/api/admin/intakes/${w.id}/accept`, { track: 'internal', story_rev: pr.story.rev, resolution_note: 'رد', reply: { send: true, text: pr.drafts.internal.reply.text.replace('\n\n', '\nجهزي الورق.\n'), channel: 'whatsapp' } });
      assert.equal(bad.status, 400);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM messages')), msgsBefore, 'no message row');
      assert.equal(rowOf(t, w.id).status, 'new', 'intake untouched');
      assert.equal(rowOf(t, w.id).decided_track, null);
      const r = ok(await admin.post(`/api/admin/intakes/${w.id}/accept`, { track: 'need_info', story_rev: pr.story.rev, questions: ['مين اللي اتوفى؟'] }));
      assert.equal(r.message.channel, 'website');
      const w2 = await webIntake(t, { description: INFO_STORY });
      await t.app.ai.runAuto(w2.id);
      const pr2 = ok(await admin.get(`/api/admin/intakes/${w2.id}/proposal`));
      const r2 = ok(await admin.post(`/api/admin/intakes/${w2.id}/accept`, { track: 'internal', story_rev: pr2.story.rev, resolution_note: 'رد', reply: { send: true, text: 'أهلًا بيكي، جهزي شهادة الوفاة. — مؤسسة بيوت مصر' } }));
      assert.equal(r2.message.channel, 'website');
    });
  });

  test('T21 permissions: lawyers get 403 on every new admin route; a case manager is allowed; settings stay admin-only', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const lawyer = await createLawyer(admin, {});
      const lc = await t.login(lawyer.username);
      const doc = t.app.db.value("SELECT id FROM documents LIMIT 1") || 1;
      const routes = [
        ['get', `/api/admin/intakes/${s.id}/proposal`],
        ['post', `/api/admin/intakes/${s.id}/story/ready`],
        ['post', `/api/admin/intakes/${s.id}/accept`],
        ['post', `/api/admin/intakes/${s.id}/call-note`],
        ['post', `/api/admin/intakes/${s.id}/call-attempt`],
        ['post', `/api/admin/intakes/${s.id}/close-unreachable`],
        ['post', '/api/admin/messages/split'],
        ['put', `/api/admin/voice-notes/${doc}/transcript`],
        ['patch', '/api/admin/settings'],
      ];
      for (const [m, u] of routes) assert.equal((await lc[m](u, {})).status, 403, `${m} ${u}`);
      for (const [m, u] of routes) assert.equal((await t.client()[m](u, {})).status, 401, `anonymous ${m} ${u}`);
      const mgr = await managerLogin(t);
      ok(await mgr.get(`/api/admin/intakes/${s.id}/proposal`));
      ok(await mgr.post(`/api/admin/intakes/${s.id}/call-attempt`, { outcome: 'busy', client_ref: 'mgr-1' }), 201);
      assert.equal((await mgr.patch('/api/admin/settings', { story_quiet_minutes: 15 })).status, 403);
      const bad = await admin.patch('/api/admin/settings', { story_quiet_minutes: 500 });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /اكتب مدة بين 2 و120 دقيقة/);
      assert.equal((await admin.patch('/api/admin/settings', { callback_from_number: '12345' })).status, 400);
      assert.equal((await admin.patch('/api/admin/settings', { callback_eta_days: 9 })).status, 400);
      const okS = ok(await admin.patch('/api/admin/settings', { story_quiet_minutes: 15, callback_from_number: '01011112222', callback_eta_days: 2, story_ack_enabled: true }));
      assert.equal(okS.story_quiet_minutes, 15);
      assert.equal(okS.callback_eta_days, 2);
      assert.equal(okS.story_ack_enabled, true);
    });
  });
});

// ═════════════════════════ 22–25: الصوت والمكالمات والمحاكي ═════════════════════════
describe('v9.2 stories — voice notes, call notes, simulator', () => {
  test('T22 voice: pending row for client audio only; confirm → rev+1 and the text reaches the analysis; unclear lifts blocked; 404s; seconds; pre-9.2 upsert; decided intake saves text only; unknown status rejected', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const r = t.app.engine.receive({ channel: 'website', from_phone: e164(newPhone()), contact_name: 'أم ياسين', text: '[رسالة صوتية]', attachments: [{ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64, seconds: 42 }], force_new_intake: true });
      t.app.ai.cancelTimers();
      const doc = t.app.db.get("SELECT * FROM documents WHERE intake_id = ? AND mime = 'audio/webm'", r.intake.id);
      const row = t.app.voice.get(doc.id);
      assert.equal(row.status, 'pending');
      assert.equal(row.duration_seconds, 42);
      assert.equal(rowOf(t, r.intake.id).story_view, 'blocked');
      const rev0 = rowOf(t, r.intake.id).story_rev;
      const saved = ok(await admin.put(`/api/admin/voice-notes/${doc.id}/transcript`, { text: 'جوزي اتوفى من سنة وأهله مش راضيين يدوني ورث العيال من الشقة' }));
      assert.equal(saved.transcript.status, 'confirmed');
      assert.equal(saved.story.rev, rev0 + 1);
      assert.equal(rowOf(t, r.intake.id).story_rev, rev0 + 1);
      assert.notEqual(rowOf(t, r.intake.id).story_view, 'blocked');
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(r.intake.id);
      assert.match(t.app.stories.storyText(r.intake.id).clientText, /ورث العيال من الشقة/);
      assert.match(t.app.stories.storyText(r.intake.id).contextText, /\(رسالة صوتية — نص كتبته الإدارة\): /);
      assert.equal(t.app.ai.latest('intake', r.intake.id, 'intake_analysis').output.legal_area, 'INH');
      // «مش مفهومة» ترفع الحجب أيضًا
      const r2 = t.app.engine.receive({ channel: 'website', from_phone: e164(newPhone()), contact_name: 'سماح', text: '[رسالة صوتية]', attachments: [{ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64 }], force_new_intake: true });
      t.app.ai.cancelTimers();
      const d2 = t.app.db.get("SELECT id FROM documents WHERE intake_id = ? AND mime = 'audio/webm'", r2.intake.id);
      assert.equal(rowOf(t, r2.intake.id).story_view, 'blocked');
      ok(await admin.put(`/api/admin/voice-notes/${d2.id}/transcript`, { unclear: true }));
      t.app.ai.cancelTimers();
      assert.notEqual(rowOf(t, r2.intake.id).story_view, 'blocked');
      assert.equal((await admin.put(`/api/admin/voice-notes/${d2.id}/transcript`, { status: 'auto_draft' })).status, 400, 'statuses validated in voice.js');
      // صوت رفعته الإدارة: لا صف؛ ومستند غير صوتي: 404
      const caseRow = t.app.db.get("SELECT id FROM documents WHERE mime LIKE 'image/%' LIMIT 1");
      void caseRow;
      const photo = t.app.engine.receive({ channel: 'website', from_phone: e164(newPhone()), contact_name: 'هبة', text: DESC, attachments: [{ filename: 'p.jpg', mime: 'image/jpeg', data_base64: PHOTO_B64 }], force_new_intake: true });
      t.app.ai.cancelTimers();
      const pd = t.app.db.get('SELECT id FROM documents WHERE intake_id = ?', photo.intake.id);
      assert.equal((await admin.put(`/api/admin/voice-notes/${pd.id}/transcript`, { text: 'x' })).status, 404);
      const staffAudio = t.app.documents.save({ filename: 's.webm', mime: 'audio/webm', data_base64: VOICE_B64 }, { client_id: photo.client.id, intake_id: photo.intake.id }, { id: 1, role: 'admin' });
      assert.equal(t.app.voice.get(staffAudio), null, 'staff audio gets no transcript row');
      assert.equal((await admin.put(`/api/admin/voice-notes/${staffAudio}/transcript`, { text: 'x' })).status, 404);
      // رسالة صوتية من قبل 9.2 (بلا صف) ← أول حفظ ينشئ الصف؛ وطلب منتهٍ ← النص فقط
      t.app.db.run('DELETE FROM voice_transcripts WHERE document_id = ?', d2.id);
      ok(await admin.post(`/api/admin/intakes/${r2.intake.id}/archive`, { reason: 'تجربة' }));
      const revBefore = rowOf(t, r2.intake.id).story_rev;
      const legacy = ok(await admin.put(`/api/admin/voice-notes/${d2.id}/transcript`, { text: 'كلام قديم' }));
      assert.equal(legacy.transcript.status, 'confirmed');
      assert.equal(t.app.voice.get(d2.id).status, 'confirmed');
      assert.equal(rowOf(t, r2.intake.id).story_rev, revBefore, 'decided intake: text only');
      assert.equal(t.app.ai.hasTimer(r2.intake.id), false, 'no analysis for a decided intake');
    });
  });

  test('T23 call note on a call-back request: phone message with meta.call_note → ready + summarised; stays unconfirmed unless «تأكيد الهوية»; hidden from her page; client_ref dedupes', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const cb = callbackIntake(t);
      assert.equal(rowOf(t, cb.id).story_view, 'callback');
      const pr0 = ok(await admin.get(`/api/admin/intakes/${cb.id}/proposal`));
      assert.ok(pr0.warnings.some((x) => x.code === 'callback_only'));
      const text = 'قالت إن جوزها اتوفى من سنة وأهله واخدين الشقة ومش راضيين يدوها نصيبها ونصيب العيال';
      const r = ok(await admin.post(`/api/admin/intakes/${cb.id}/call-note`, { text, client_ref: 'call-23' }), 201);
      const m = t.app.db.get('SELECT * FROM messages WHERE id = ?', r.message_id);
      assert.equal(m.direction, 'in');
      assert.equal(m.channel, 'phone');
      assert.equal(JSON.parse(m.meta).call_note, true);
      assert.equal(r.story.view, 'ready');
      assert.equal(rowOf(t, cb.id).story_ready_via, 'staff_entry');
      assert.ok(r.proposal.one_line);
      assert.match(t.app.stories.storyText(cb.id).contextText, /\(مكالمة — كتبتها الإدارة\): قالت إن جوزها/);
      const again = ok(await admin.post(`/api/admin/intakes/${cb.id}/call-note`, { text, client_ref: 'call-23' }));
      assert.equal(again.duplicate, true);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE intake_id = ? AND json_extract(meta, '$.call_note') = 1", cb.id)), 1);
      // B91-01: المكالمة لا تؤكد الرقم
      const rep = ok(await admin.post(`/api/admin/intakes/${cb.id}/reply`, { body: 'أهلًا بيكي، استلمنا كلامك.' }));
      assert.equal(rep.channel, 'website');
      const tok = t.app.clients.issuePortalToken(cb.client_id, { intakeId: cb.id });
      const view = ok(await t.client().get(`/api/portal/${tok}`));
      assert.doesNotMatch(JSON.stringify(view.messages), /أهله واخدين الشقة/, 'call note hidden from her page');
      // «تأكيد الهوية» أثناء المكالمة
      const cb2 = callbackIntake(t);
      ok(await admin.post(`/api/admin/intakes/${cb2.id}/call-note`, { text, client_ref: 'call-23b', confirm_identity: true }), 201);
      const rep2 = ok(await admin.post(`/api/admin/intakes/${cb2.id}/reply`, { body: 'أهلًا بيكي.' }));
      assert.equal(rep2.channel, 'whatsapp');
      // طلب مغلق: 409
      ok(await admin.post(`/api/admin/intakes/${cb2.id}/archive`, { reason: 'تم' }));
      assert.equal((await admin.post(`/api/admin/intakes/${cb2.id}/call-note`, { text, client_ref: 'call-23c' })).status, 409);
    });
  });

  test('T24 factsText/isCannedCallback: canned website lines and the portal call-back line → ""; the portal call-back schedules no analysis', async () => {
    for (const body of ['عايزة حد يكلمني — الصبح', 'عايز حد يكلمني — الضهر', 'محتاجين حد يكلمنا — أي وقت']) {
      assert.equal(isCannedCallback({ callback: 'any' }, body), true, body);
      assert.equal(factsText(body, { callback: 'any' }), '');
    }
    assert.equal(isCannedCallback({ callback_canned: true }, 'أي نص'), true);
    assert.equal(isCannedCallback({ callback: 'any' }, 'جوزي اتوفى وعايزة حد يكلمني'), false);
    assert.equal(factsText('جوزي اتوفى', {}), 'جوزي اتوفى');
    await withApp(async (t) => {
      const w = await webIntake(t);
      await t.app.ai.runAuto(w.id);
      const token = w.portal_url.split('/p/')[1];
      const before = rowOf(t, w.id).story_rev;
      ok(await t.client().post(`/api/portal/${token}/callback`, { when: 'morning' }));
      assert.equal(rowOf(t, w.id).story_rev, before, 'not a fact');
      assert.equal(t.app.ai.hasTimer(w.id), false, 'no analysis scheduled');
    });
  });

  test('T25 simulator (demo): voice/photo samples, list_reply topic, replies[]; 404 outside demo; configured WhatsApp + ack → simulated, no Graph call', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      assert.equal((await admin.post('/api/admin/simulate/whatsapp', { from: newPhone(), text: 'x' })).status, 404);
    });
    const g = mockGraph();
    try {
      await withApp(
        async (t) => {
          const admin = await t.login('admin');
          const p = newPhone();
          const r1 = ok(await admin.post('/api/admin/simulate/whatsapp', { from: p, name: 'تجربة', text: 'السلام عليكم' }));
          assert.ok(Array.isArray(r1.replies));
          const r2 = ok(await admin.post('/api/admin/simulate/whatsapp', { from: p, kind: 'list_reply', reply_id: 'topic:pen' }));
          assert.equal(rowOf(t, r2.intake_id).topic, 'pen');
          ok(await admin.post('/api/admin/simulate/whatsapp', { from: p, kind: 'voice' }));
          const audio = t.app.db.get("SELECT * FROM documents WHERE intake_id = ? AND mime = 'audio/webm'", r2.intake_id);
          assert.ok(audio, 'the voice sample is saved as her audio document');
          assert.equal(t.app.voice.get(audio.id).status, 'pending');
          ok(await admin.post('/api/admin/simulate/whatsapp', { from: p, kind: 'photo' }));
          assert.ok(t.app.db.get("SELECT 1 FROM documents WHERE intake_id = ? AND mime = 'image/jpeg'", r2.intake_id));
          assert.equal((await admin.post('/api/admin/simulate/whatsapp', { from: p, kind: 'list_reply', reply_id: 'topic:nope' })).status, 400);
          // واتساب «متصل» + التأكيد مفعّل: قصة المحاكي لا تصل ميتا أبدًا
          configureWhatsApp(t);
          t.app.settings.set('story_ack_enabled', true);
          const p2 = newPhone();
          ok(await admin.post('/api/admin/simulate/whatsapp', { from: p2, text: PEN_STORY }));
          const fin = ok(await admin.post('/api/admin/simulate/whatsapp', { from: p2, text: 'خلاص' }));
          const ack = fin.replies.find((x) => x.rule === 'story_ack');
          assert.ok(ack, 'the ack is returned in replies[]');
          assert.equal(ack.status, 'simulated');
          assert.equal(fin.story_view, 'stale');
          await sleep(100);
          assert.equal(g.calls.filter((c) => c.method === 'POST').length, 0, 'no Graph send');
          t.app.ai.cancelTimers();
        },
        { seed: 'demo' },
      );
    } finally {
      g.restore();
    }
  });
});

// ═════════════════════════ 27–32: الحماية من التكرار والحلقات ═════════════════════════
describe('v9.2 stories — loops, media, empty stories, upgrade, restart, duplicates', () => {
  test('T27 no re-run loop: blocked story ×6 ticks → ≤ 1 suggestion, no ai.analyzed, no usage; a throwing analysis is tried ≤ 3 times per rev; a new fact resets', async () => {
    await withApp(async (t) => {
      const p = newPhone();
      wa(t, p, 'السلام');
      waVoice(t, p);
      const i = intakeOf(t, p);
      t.app.ai.cancelTimers();
      t.app.stories.markReady(i.id, 'quiet');
      await sleep(400);
      const base = Date.now() + 60 * 60 * 1000;
      for (let k = 0; k < 6; k++) {
        freezeClock(new Date(base + k * 11 * 60 * 1000).toISOString());
        t.app.stories.checkReady();
        await sleep(350);
      }
      assert.ok(Number(t.app.db.value("SELECT COUNT(*) FROM ai_suggestions WHERE entity_id = ? AND kind = 'intake_analysis'", i.id)) <= 1);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM activity WHERE intake_id = ? AND type = 'ai.analyzed'", i.id)), 0);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM ai_usage WHERE entity_id = ? AND entity_type = ?', i.id, 'intake')), 0);
      assert.equal(rowOf(t, i.id).analyzed_rev, rowOf(t, i.id).story_rev);
      setClock(null);
      // تحليل يفشل: 3 محاولات على الأكثر لكل مراجعة
      const s = await readyStory(t);
      t.app.db.run('UPDATE intakes SET story_rev = story_rev + 1, analysis_attempts = 0, analysis_attempted_at = NULL WHERE id = ?', s.id);
      const real = t.app.ai.analyzeIntake;
      let tries = 0;
      t.app.ai.analyzeIntake = async () => {
        tries += 1;
        throw new Error('boom');
      };
      try {
        for (let k = 0; k < 6; k++) {
          freezeClock(new Date(Date.now() + (k + 1) * 11 * 60 * 1000).toISOString());
          t.app.stories.checkReady();
          await sleep(400);
          setClock(null);
        }
        assert.equal(tries, 3, 'at most 3 attempts for one rev');
        wa(t, s.phone, 'وفيه حاجة جديدة كمان عن الشقة');
        assert.equal(rowOf(t, s.id).analysis_attempts, 0, 'a new fact resets the count');
      } finally {
        t.app.ai.analyzeIntake = real;
        t.app.ai.cancelTimers();
      }
    });
  });

  test('T28 media in flight: failed download → blocked/media_failed, no Claude, warning; pending download is blocked too; the job retries and clears the flag', async () => {
    const g = mockGraph();
    try {
      await withApp(async (t) => {
        const admin = await t.login('admin');
        configureWhatsApp(t);
        enableClaude(t);
        const realDl = t.app.whatsapp.downloadMedia;
        t.app.whatsapp.downloadMedia = async () => {
          throw new Error('network');
        };
        const p = newPhone();
        waVoice(t, p, 'VOICE-FAIL');
        const i = intakeOf(t, p);
        await until(() => rowOf(t, i.id).media_failed === 1);
        t.app.ai.cancelTimers();
        t.app.stories.markReady(i.id, 'quiet');
        t.app.ai.cancelTimers();
        assert.equal(rowOf(t, i.id).story_view, 'blocked');
        await t.app.ai.runAuto(i.id);
        const a = t.app.ai.latest('intake', i.id, 'intake_analysis');
        assert.equal(a.output.blocked, 'media_failed');
        assert.equal(a.output.recommended_track, null);
        assert.equal(fake.analysisCalls(), 0, 'no Claude call');
        const pr = ok(await admin.get(`/api/admin/intakes/${i.id}/proposal`));
        assert.ok(pr.warnings.some((x) => x.code === 'media_failed'));
        // تنزيل لم ينتهِ بعد: محجوبة أيضًا
        t.app.whatsapp.downloadMedia = () => new Promise(() => {});
        const p2 = newPhone();
        wa(t, p2, 'السلام');
        waVoice(t, p2, 'VOICE-PENDING');
        const i2 = intakeOf(t, p2);
        t.app.ai.cancelTimers();
        t.app.stories.markReady(i2.id, 'quiet');
        t.app.ai.cancelTimers();
        assert.equal(rowOf(t, i2.id).story_view, 'blocked');
        // المهمة تعيد التنزيل وتزيل العلامة عند النجاح
        t.app.whatsapp.downloadMedia = async () => ({ buffer: Buffer.concat([Buffer.from('OggS'), Buffer.alloc(80)]), mime: 'audio/ogg' });
        const msg = t.app.db.get("SELECT id FROM messages WHERE intake_id = ? AND direction = 'in'", i.id);
        const tick = t.app.stories.checkReady();
        assert.ok(tick.media_retried >= 1);
        await until(() => !JSON.parse(t.app.db.get('SELECT meta FROM messages WHERE id = ?', msg.id).meta).media_failed);
        assert.equal(rowOf(t, i.id).media_failed, 0);
        assert.ok(t.app.db.get('SELECT 1 FROM documents WHERE message_id = ?', msg.id));
        t.app.whatsapp.downloadMedia = realDl;
        t.app.ai.cancelTimers();
      });
    } finally {
      g.restore();
    }
  });

  test('T29 empty stories: wrong code, «خلاص», «السلام عليكم», «[ملصق]», evt: reply → story_rev 0; quiet ready = state only; a 15-letter story gets no ack and no Claude call', async () => {
    await withApp(async (t) => {
      enableClaude(t);
      t.app.settings.set('story_ack_enabled', true);
      const cases = [
        (p) => wa(t, p, 'ده رقم طلبي REQ-2026-99998 وكود التأكيد 654321'),
        (p) => wa(t, p, 'خلاص'),
        (p) => wa(t, p, 'السلام عليكم'),
        (p) => t.app.engine.handleWhatsAppWebhook(waPayload({ from: intl(p), type: 'sticker', extra: { sticker: { id: 'STK1', mime_type: 'image/webp' } } })),
        (p) => t.app.engine.handleWhatsAppWebhook(waPayload({ from: intl(p), type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id: 'evt:1:yes', title: 'هحضر' } } } })),
      ];
      for (const send of cases) {
        const p = newPhone();
        send(p);
        const i = intakeOf(t, p);
        assert.equal(i.story_rev, 0, `not a fact: ${t.app.db.value('SELECT body FROM messages WHERE intake_id = ?', i.id)}`);
        t.app.ai.cancelTimers();
        t.app.db.run('UPDATE intakes SET story_state = ? WHERE id = ?', 'collecting', i.id);
        const m = t.app.stories.markReady(i.id, 'quiet');
        assert.equal(m.marked, true);
        assert.equal(m.scheduled, false);
        assert.equal(rule(t, 'story_ack', i.id).length, 0);
      }
      const p = newPhone();
      wa(t, p, 'عندي سؤال صغير بس');
      const i = intakeOf(t, p);
      t.app.ai.cancelTimers();
      assert.equal(i.story_rev, 1);
      t.app.stories.markReady(i.id, 'quiet');
      t.app.ai.cancelTimers();
      assert.equal(rule(t, 'story_ack', i.id).length, 0, 'no ack for a 15-letter story');
      await t.app.ai.runAuto(i.id);
      assert.equal(fake.analysisCalls(), 0, 'no Claude call');
      assert.equal(t.app.ai.latest('intake', i.id, 'intake_analysis').output.recommended_track, 'need_info');
    });
  });

  test('T30 upgrade: a 9.1 database gets the columns/tables/index, stories_since once, no analyses and no ack on legacy conversations', async () => {
    const t = await startTestApp({ seed: 'none' });
    const dir = t.dir;
    const dbFile = path.join(dir, 'test.db');
    // قاعدة بيانات 9.1: بلا أعمدة 78/79 وجداولها
    const db = t.app.db;
    db.raw.exec('DROP INDEX IF EXISTS idx_intakes_story; DROP TABLE IF EXISTS voice_transcripts; DROP TABLE IF EXISTS call_attempts;');
    for (const c of ['story_state', 'story_rev', 'analyzed_rev', 'story_ready_at', 'story_ready_via', 'topic', 'welcome_sent_at', 'story_ack_sent_at', 'ai_track', 'decided_track', 'resolution_kind', 'referral_to', 'analysis_attempted_at', 'analysis_attempts', 'decided_at', 'voice_missing', 'story_letters', 'media_failed', 'notices_sent', 'form_answers']) {
      db.raw.exec(`ALTER TABLE intakes DROP COLUMN ${c}`);
    }
    db.raw.exec('ALTER TABLE clients DROP COLUMN name_source; ALTER TABLE cases DROP COLUMN brief_draft;');
    db.raw.exec("DELETE FROM settings WHERE key = 'stories_since'");
    // محادثة قديمة مفتوحة: رسالة صوتية ورد من الموظفين
    const old = '2026-01-10T10:00:00.000Z';
    const cl = db.insert('clients', { code: 'CL-2026-09001', name: 'قديمة', created_at: old, updated_at: old });
    db.insert('client_identities', { client_id: cl, kind: 'phone', value: '+201015550001', channels: '["whatsapp"]', created_at: old });
    const iid = db.insert('intakes', { code: 'REQ-2026-09001', client_id: cl, status: 'in_review', first_channel: 'whatsapp', last_channel: 'whatsapp', channels: '["whatsapp"]', contact_phone: '+201015550001', last_inbound_at: old, created_at: old, updated_at: old });
    const mid = db.insert('messages', { client_id: cl, intake_id: iid, direction: 'in', channel: 'whatsapp', external_id: 'wamid.OLD.1', body: '[رسالة صوتية]', status: 'received', meta: '{}', created_at: old });
    db.insert('messages', { client_id: cl, intake_id: iid, direction: 'out', channel: 'whatsapp', body: 'أهلًا، سمعنا رسالتك', author_user_id: 1, status: 'sent', meta: '{}', created_at: old });
    db.insert('documents', { client_id: cl, intake_id: iid, message_id: mid, title: 'v', filename: 'v.ogg', mime: 'audio/ogg', size: 10, sha256: 'x', storage_key: 'x/v.ogg', uploaded_by_kind: 'client', created_at: old });
    await t.app.close();
    const { loadConfig } = await import('../src/config.js');
    const { createApp } = await import('../src/app.js');
    const cfg = loadConfig({ dataDir: dir, dbPath: dbFile, uploadsDir: path.join(dir, 'uploads'), demo: false, schedulerIntervalSeconds: 0, silent: true, ai: { provider: 'heuristic', anthropicApiKey: '' }, whatsapp: { token: '', phoneNumberId: '', verifyToken: 'v', appSecret: '', numberDigits: '' } });
    let app = createApp(cfg);
    try {
      const cols = app.db.all('PRAGMA table_info(intakes)').map((r) => r.name);
      for (const c of ['story_state', 'story_rev', 'analyzed_rev', 'voice_missing', 'notices_sent']) assert.ok(cols.includes(c), c);
      assert.ok(app.db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'call_attempts'"));
      assert.ok(app.db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'voice_transcripts'"));
      assert.ok(app.db.get("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_intakes_story'"));
      const since = app.settings.get('stories_since');
      assert.match(since, /^\d{4}-\d{2}-\d{2}T/);
      const legacy = app.db.get('SELECT * FROM intakes WHERE id = ?', iid);
      assert.equal(legacy.story_state, 'ready');
      assert.equal(legacy.story_rev, 0);
      assert.deepEqual(app.stories.checkReady(), { marked: 0, scheduled: 0, media_retried: 0, notices: 0 });
      app.settings.set('story_ack_enabled', true);
      app.engine.handleWhatsAppWebhook(waText('01015550001', 'وكمان عايزة أقول إن أهل جوزي واخدين الشقة'));
      app.ai.cancelTimers();
      assert.equal(app.db.get('SELECT story_state FROM intakes WHERE id = ?', iid).story_state, 'collecting');
      app.stories.markReady(iid, 'quiet');
      app.ai.cancelTimers();
      assert.equal(Number(app.db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'story_ack'")), 0, 'no ack on a legacy conversation');
      await app.close();
      await sleep(1100);
      app = createApp(cfg);
      assert.equal(app.settings.get('stories_since'), since, 'stories_since keeps its first value');
    } finally {
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T31 restart: a second app on the same DB marks an overdue collecting story ready, re-queues a stale one once, retries a throwing analysis ≤ 3 times', async () => {
    const t = await startTestApp({ seed: 'none' });
    const dir = t.dir;
    const p1 = newPhone();
    wa(t, p1, PEN_STORY);
    const s1 = intakeOf(t, p1).id;
    const s2 = (await readyStory(t)).id;
    t.app.db.run('UPDATE intakes SET story_rev = story_rev + 1 WHERE id = ?', s2);
    t.app.ai.cancelTimers();
    await t.app.close();
    const { loadConfig } = await import('../src/config.js');
    const { createApp } = await import('../src/app.js');
    const cfg = loadConfig({ dataDir: dir, dbPath: path.join(dir, 'test.db'), uploadsDir: path.join(dir, 'uploads'), demo: false, schedulerIntervalSeconds: 0, silent: true, ai: { provider: 'heuristic', anthropicApiKey: '' }, whatsapp: { token: '', phoneNumberId: '', verifyToken: 'v', appSecret: '', numberDigits: '' } });
    const app = createApp(cfg);
    try {
      freezeClock(new Date(Date.now() + 11 * 60 * 1000).toISOString());
      const r = app.stories.checkReady();
      assert.equal(r.marked, 1);
      assert.equal(app.db.get('SELECT story_state FROM intakes WHERE id = ?', s1).story_state, 'ready');
      assert.ok(app.ai.hasTimer(s2), 'the stale story is re-queued');
      assert.equal(r.scheduled, 2);
      app.ai.cancelTimers();
      setClock(null);
      let tries = 0;
      app.ai.analyzeIntake = async () => {
        tries += 1;
        throw new Error('down');
      };
      for (let k = 1; k <= 5; k++) {
        freezeClock(new Date(Date.now() + k * 11 * 60 * 1000).toISOString());
        app.stories.checkReady();
        await sleep(400);
        setClock(null);
      }
      assert.ok(tries <= 6 && tries >= 3, `bounded retries (${tries})`);
      assert.equal(app.db.get('SELECT analysis_attempts FROM intakes WHERE id = ?', s2).analysis_attempts, 3);
    } finally {
      setClock(null);
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('T32 duplicate webhook: the same payload twice → story_rev +1 once, one welcome', async () => {
    await withApp(async (t) => {
      t.app.settings.set('story_welcome_enabled', true);
      const p = newPhone();
      const payload = waText(p, 'جوزي اتوفى وعايزة أعرف حقي في المعاش', { id: 'wamid.DUP.1' });
      const a = t.app.engine.handleWhatsAppWebhook(payload);
      const b = t.app.engine.handleWhatsAppWebhook(payload);
      assert.equal(a.received, 1);
      assert.equal(b.duplicates, 1);
      const i = intakeOf(t, p);
      assert.equal(i.story_rev, 1);
      assert.equal(rule(t, 'story_welcome', i.id).length, 1);
      t.app.ai.cancelTimers();
    });
  });
});

// ═════════════════════════ 33–43: الخصوصية والآثار الجانبية والاعتماد الآمن ═════════════════════════
describe('v9.2 stories — privacy, side effects, safety', () => {
  test('T33 lawyer deep scan: no /api/lawyer/* GET returns a brief_draft, call note, transcript, form_answers or phone marker', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const phone = '01097531642';
      wa(t, phone, PEN_STORY);
      wa(t, phone, '[رسالة صوتية]');
      const i = intakeOf(t, phone);
      t.app.ai.cancelTimers();
      // صوت ونص
      const docId = t.app.documents.save({ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64 }, { client_id: i.client_id, intake_id: i.id, message_id: t.app.db.value("SELECT MAX(id) FROM messages WHERE intake_id = ?", i.id) }, { kind: 'client' });
      ok(await admin.put(`/api/admin/voice-notes/${docId}/transcript`, { text: 'كلام صوتي XQVOICEMARK' }));
      ok(await admin.post(`/api/admin/intakes/${i.id}/call-note`, { text: 'قالت في المكالمة XQCALLMARK', client_ref: 'scan-1' }), 201);
      t.app.db.run('UPDATE intakes SET form_answers = ? WHERE id = ?', JSON.stringify({ v: 1, topic: 'pen', answers: { XQFORMMARK: 'x' } }), i.id);
      const pr = ok(await admin.get(`/api/admin/intakes/${i.id}/proposal`));
      const r = ok(
        await admin.post(`/api/admin/intakes/${i.id}/accept`, {
          track: 'matter', story_rev: pr.story.rev, case: { ...pr.drafts.consultation.case, facts_shared: 'وقائع للمحامي بلا علامات', facts_internal: 'داخلي', brief_draft: 'XQBRIEFMARK' }, matter: { kind: 'litigation', court: 'محكمة الأسرة' },
        }),
      );
      const lawyer = await createLawyer(admin, {});
      ok(await admin.patch(`/api/admin/matters/${r.matter.id}`, { responsible_lawyer_id: lawyer.id }));
      const docs = t.app.db.all('SELECT id FROM documents WHERE case_id = ?', r.case.id).map((x) => x.id);
      const asg = await assign(admin, r.case.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'رأي مبدئي', grants: { facts: true, document_ids: docs } });
      const lc = await t.login(lawyer.username);
      const ids = new Set([asg.id, r.case.id, r.matter.id, ...docs]);
      const routes = t.app.router.routes.filter((x) => x.method === 'GET' && x.pattern.startsWith('/api/lawyer/'));
      assert.ok(routes.length >= 5, 'lawyer GET routes enumerated');
      const markers = ['XQBRIEFMARK', 'XQCALLMARK', 'XQVOICEMARK', 'XQFORMMARK', '97531642', 'brief_draft'];
      let checked = 0;
      for (const route of routes) {
        const urls = route.keys.length ? [...ids].map((id) => route.pattern.replace(/:(\w+)/g, String(id))) : [route.pattern];
        for (const u of urls) {
          const res = await lc.get(u);
          const text = Buffer.isBuffer(res.body) ? res.body.toString('latin1') : typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
          for (const m of markers) assert.ok(!text.includes(m), `${u} leaks ${m}`);
          checked += 1;
        }
      }
      assert.ok(checked >= routes.length);
    });
  });

  test('T34 call note side effects: no reopen by REQ mention, no survey reply, unread/channels/last_channel unchanged, no message.received; it counts as the SLA first response', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const other = await readyStory(t);
      ok(await admin.post(`/api/admin/intakes/${other.id}/archive`, { reason: 'تم' }));
      const otherCode = rowOf(t, other.id).code;
      const p = newPhone();
      wa(t, p, PEN_STORY);
      const i = intakeOf(t, p);
      t.app.ai.cancelTimers();
      const before = rowOf(t, i.id);
      // مكالمة تذكر رقم طلب آخر وكلمة «مقبول»
      ok(await admin.post(`/api/admin/intakes/${i.id}/call-note`, { text: `قالت مقبول وإن عندها طلب قديم ${otherCode}`, client_ref: 'se-1' }), 201);
      assert.equal(rowOf(t, other.id).status, 'archived', 'the REQ mention does not reopen it');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'identity.ref_from_owner'")), 0);
      const after = rowOf(t, i.id);
      assert.equal(after.unread_count, before.unread_count);
      assert.equal(after.channels, before.channels);
      assert.equal(after.last_channel, before.last_channel);
      assert.equal(after.last_inbound_at, before.last_inbound_at);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM activity WHERE intake_id = ? AND type = 'message.received'", i.id)), 0);
      // مهلة أول رد: طلب عمره 5 ساعات وعليه مكالمة فقط ← لا تنبيه
      const p2 = newPhone();
      wa(t, p2, PEN_STORY);
      const i2 = intakeOf(t, p2);
      t.app.ai.cancelTimers();
      ok(await admin.post(`/api/admin/intakes/${i2.id}/call-note`, { text: 'اتكلمنا معاها وفهمنا الموضوع', client_ref: 'sla-1' }), 201);
      const fiveH = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
      t.app.db.run('UPDATE intakes SET created_at = ? WHERE id = ?', fiveH, i2.id);
      assert.ok(t.app.practice.sla.firstResponseAt ? t.app.practice.sla.firstResponseAt(i2.id) : true);
      await t.app.jobs.runDue({ force: true, only: 'practice.sla' });
      const n = t.app.db.all("SELECT title FROM notifications WHERE title LIKE '%تجاوز%' AND title LIKE ?", `%${rowOf(t, i2.id).code}%`);
      assert.equal(n.length, 0, 'no «تجاوز الطلب مهلة أول رد» for a called story');
    });
  });

  test('T35 accept safety: double POST per track → one outcome and one message; a throw after convert → nothing written, no Graph call; a send failure → 200 with message.error', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      for (const [track, extra, text] of [
        ['consultation', (pr) => ({ case: pr.drafts.consultation.case, reply: pr.drafts.consultation.reply }), PEN_STORY],
        ['internal', () => ({ resolution_note: 'رد', reply: { send: true, text: 'أهلًا بيكي، جهزي الورق. — مؤسسة بيوت مصر' } }), INFO_STORY],
        ['need_info', () => ({ questions: ['مين اللي اتوفى؟'] }), PEN_STORY],
      ]) {
        const s = await readyStory(t, text);
        const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
        const body = { track, story_rev: pr.story.rev, ...extra(pr) };
        const [a, b] = await Promise.all([admin.post(`/api/admin/intakes/${s.id}/accept`, body), admin.post(`/api/admin/intakes/${s.id}/accept`, body)]);
        assert.deepEqual([a.status, b.status].sort(), [200, 409], track);
        assert.equal(outOf(t, s.id).length + Number(t.app.db.value("SELECT COUNT(*) FROM messages m JOIN cases c ON c.id = m.case_id WHERE c.intake_id = ? AND m.direction = 'out' AND m.intake_id IS NULL", s.id)), 1, `${track}: one message`);
        assert.ok(Number(t.app.db.value('SELECT COUNT(*) FROM cases WHERE intake_id = ?', s.id)) <= 1);
      }
    });
    const g = mockGraph();
    try {
      await withApp(async (t) => {
        const admin = await t.login('admin');
        configureWhatsApp(t);
        const s = await readyStory(t, 'جالي إعلان من المحكمة وأبو العيال رافع عليا قضية حضانة والجلسة الشهر الجاي');
        const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
        const real = t.app.matters.createFromCase;
        t.app.matters.createFromCase = () => {
          throw new Error('boom after convert');
        };
        const before = g.calls.length;
        const r = await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'matter', story_rev: pr.story.rev, case: pr.drafts.matter.case, matter: pr.drafts.matter.matter, reply: { send: true, text: pr.drafts.matter.reply.text } });
        t.app.matters.createFromCase = real;
        assert.equal(r.status, 500);
        assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM cases WHERE intake_id = ?', s.id)), 0, 'convert rolled back');
        assert.equal(rowOf(t, s.id).status, 'new');
        assert.equal(rowOf(t, s.id).decided_track, null);
        assert.equal(outOf(t, s.id).length, 0, 'no outbound row');
        await sleep(50);
        assert.equal(g.calls.length, before, 'no Graph call');
        const realSend = t.app.engine.sendToClient;
        t.app.engine.sendToClient = () => {
          throw new Error('send boom');
        };
        const ok2 = await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'consultation', story_rev: pr.story.rev, case: pr.drafts.consultation.case, reply: { send: true, text: pr.drafts.consultation.reply.text } });
        t.app.engine.sendToClient = realSend;
        assert.equal(ok2.status, 200);
        assert.ok(ok2.body.message.error);
        assert.ok(ok2.body.warnings.some((x) => x.code === 'send_failed'));
        assert.ok(ok2.body.case.id);
      });
    } finally {
      g.restore();
    }
  });

  test('T36 POST /reply ignores body.meta (no document send, no hidden message)', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const doc = t.app.documents.save({ filename: 'x.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') }, { client_id: rowOf(t, s.id).client_id }, { id: 1, role: 'admin' });
      const m = ok(await admin.post(`/api/admin/intakes/${s.id}/reply`, { body: 'أهلًا بيكي', meta: { wa: { type: 'document', document_id: doc }, portal_hidden: true } }));
      const meta = JSON.parse(t.app.db.get('SELECT meta FROM messages WHERE id = ?', m.id).meta);
      assert.equal(meta.wa?.document_id, undefined);
      assert.equal(meta.portal_hidden, undefined);
    });
  });

  test('T37 a throwing afterInbound never breaks intake: webhook 200 + stored; public intake 201', async () => {
    await withApp(async (t) => {
      t.app.stories.afterInbound = () => {
        throw new Error('stories down');
      };
      const p = newPhone();
      const r = await t.client().post('/webhooks/whatsapp', waText(p, 'جوزي اتوفى'));
      assert.equal(r.status, 200);
      assert.ok(intakeOf(t, p), 'stored');
      ok(await t.client().post('/api/public/intake', { name: 'سعاد محمود', phone: newPhone(), description: DESC, consent: true }), 201);
    });
  });

  test('T38 urgent: one story.urgent_ready notice when an urgent story becomes ready, none on re-analysis; a quiet timer after accept sends no ack', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      t.app.settings.set('story_ack_enabled', true);
      const p = newPhone();
      wa(t, p, 'ابني محبوس في القسم من امبارح وعايزين محامي ضروري');
      const i = intakeOf(t, p);
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(i.id);
      const count = () => Number(t.app.db.value("SELECT COUNT(DISTINCT n.title) FROM notifications n WHERE n.type = 'story.urgent_ready' AND n.link = ?", `#/inbox/${i.id}`));
      assert.equal(count(), 0, 'not while collecting');
      t.app.stories.markReady(i.id, 'quiet');
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(i.id);
      assert.equal(count(), 1);
      ok(await admin.post(`/api/admin/intakes/${i.id}/analyze`, {}));
      assert.equal(count(), 1, 'never twice');
      // مؤقت «السكوت» بعد اعتماد القرار: لا تأكيد
      const p2 = newPhone();
      wa(t, p2, PEN_STORY);
      const i2 = intakeOf(t, p2);
      t.app.ai.cancelTimers();
      const pr = ok(await admin.get(`/api/admin/intakes/${i2.id}/proposal`));
      ok(await admin.post(`/api/admin/intakes/${i2.id}/accept`, { track: 'consultation', story_rev: pr.story.rev, case: { ...pr.drafts.consultation.case, legal_area: 'PEN', title: 'صرف معاش الزوج' } }));
      const m = t.app.stories.markReady(i2.id, 'quiet');
      assert.equal(m.marked, false);
      assert.equal(rule(t, 'story_ack', i2.id).length, 0);
    });
  });

  test('T39 a client with an unconfirmed website request writing on WhatsApp: no welcome, no ack, warning other_open_request', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      t.app.settings.set('story_welcome_enabled', true);
      t.app.settings.set('story_ack_enabled', true);
      const w = await webIntake(t);
      wa(t, w.phone, PEN_STORY);
      const i = intakeOf(t, w.phone);
      assert.notEqual(i.id, w.id, 'a separate WhatsApp story');
      assert.equal(rule(t, 'story_welcome', i.id).length, 0);
      wa(t, w.phone, 'خلاص');
      t.app.ai.cancelTimers();
      assert.equal(rule(t, 'story_ack', i.id).length, 0);
      const pr = ok(await admin.get(`/api/admin/intakes/${i.id}/proposal`));
      const warn = pr.warnings.find((x) => x.code === 'other_open_request');
      assert.ok(warn);
      assert.ok(warn.text.includes(w.reference));
    });
  });

  test('T40 call attempts: 2 on one day → cannot close (409); a 3rd the next day → closed unreachable, her link still works', async () => {
    await withApp(async (t) => {
      let admin = await t.login('admin');
      const w = await webIntake(t);
      const r1 = ok(await admin.post(`/api/admin/intakes/${w.id}/call-attempt`, { outcome: 'no_answer', client_ref: 'a1' }), 201);
      assert.equal(r1.attempts.count, 1);
      const dup = ok(await admin.post(`/api/admin/intakes/${w.id}/call-attempt`, { outcome: 'no_answer', client_ref: 'a1' }));
      assert.equal(dup.duplicate, true);
      const r2 = ok(await admin.post(`/api/admin/intakes/${w.id}/call-attempt`, { outcome: 'busy', client_ref: 'a2' }), 201);
      assert.equal(r2.attempts.count, 2);
      assert.equal(r2.attempts.can_close_unreachable, false);
      assert.equal((await admin.post(`/api/admin/intakes/${w.id}/close-unreachable`, {})).status, 409);
      assert.equal((await admin.post(`/api/admin/intakes/${w.id}/call-attempt`, { outcome: 'bad' })).status, 400);
      freezeClock(new Date(Date.now() + 26 * 3600 * 1000).toISOString());
      admin = await t.login('admin'); // (انتهت الجلسة القديمة بعد يوم)
      const r3 = ok(await admin.post(`/api/admin/intakes/${w.id}/call-attempt`, { outcome: 'no_answer', client_ref: 'a3' }), 201);
      assert.equal(r3.attempts.count, 3);
      assert.equal(r3.attempts.days, 2);
      assert.equal(r3.attempts.can_close_unreachable, true);
      const c = ok(await admin.post(`/api/admin/intakes/${w.id}/close-unreachable`, {}));
      assert.equal(c.intake.status, 'handled_internally');
      assert.equal(c.intake.resolution_kind, 'unreachable');
      assert.match(c.intake.resolution_note, /تعذّر الوصول إليها بعد 3 محاولات اتصال \(يومين\)/);
      ok(await t.client().get(`/api/portal/${w.portal_url.split('/p/')[1]}`), 200, 'never archived: her link stays valid');
      const pr = ok(await admin.get(`/api/admin/intakes/${w.id}`));
      assert.equal(pr.call_attempts.length, 3);
      assert.equal(pr.call_attempts[0].outcome_label, 'لم ترد');
    });
  });

  test('T41 split: two inbound messages on an open case → a new ready request with both messages and documents; lawyer-granted document → 409; outbound/other client → 400; same client_ref → one request', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      const acc = ok(await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'consultation', story_rev: pr.story.rev, case: pr.drafts.consultation.case }));
      wa(t, s.phone, 'وفيه مشكلة تانية خالص: صاحب البيت عايز يطلعنا من الشقة الإيجار القديم');
      const realSave = t.app.engine.fetchWhatsAppMedia;
      void realSave;
      const m1 = t.app.db.get("SELECT id FROM messages WHERE case_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1", acc.case.id).id;
      const r2 = t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.T41.${Date.now()}`, from_phone: e164(s.phone), text: '[صورة]', attachments: [{ filename: 'i.jpg', mime: 'image/jpeg', data_base64: PHOTO_B64, kind: 'image' }] });
      const m2 = r2.message_id;
      assert.equal(t.app.db.value('SELECT case_id FROM messages WHERE id = ?', m2), acc.case.id);
      t.app.ai.cancelTimers();
      const out = ok(await admin.post('/api/admin/messages/split', { message_ids: [m1, m2], client_ref: 'split-1' }), 201);
      const ni = rowOf(t, out.intake.id);
      assert.equal(ni.story_state, 'ready');
      assert.equal(ni.story_ready_via, 'staff_entry');
      assert.equal(ni.story_rev, 2);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM messages WHERE intake_id = ? AND id IN (?, ?)', ni.id, m1, m2)), 2);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM messages WHERE case_id = ? AND id IN (?, ?)', acc.case.id, m1, m2)), 0, 'gone from the case conversation');
      assert.ok(t.app.db.get('SELECT 1 FROM documents WHERE message_id = ? AND intake_id = ? AND case_id IS NULL', m2, ni.id));
      assert.ok(t.app.ai.latest('intake', ni.id, 'intake_analysis'), 'summarised');
      ok(await admin.get(`/api/admin/intakes/${ni.id}/proposal`));
      const again = ok(await admin.post('/api/admin/messages/split', { message_ids: [m1, m2], client_ref: 'split-1' }));
      assert.equal(again.duplicate, true);
      assert.equal(again.intake.id, ni.id);
      // مستند متاح لمحامٍ ← 409
      const s2 = await readyStory(t);
      const pr2 = ok(await admin.get(`/api/admin/intakes/${s2.id}/proposal`));
      const acc2 = ok(await admin.post(`/api/admin/intakes/${s2.id}/accept`, { track: 'consultation', story_rev: pr2.story.rev, case: pr2.drafts.consultation.case }));
      const r3 = t.app.engine.receive({ channel: 'whatsapp', external_id: `wamid.T41b.${Date.now()}`, from_phone: e164(s2.phone), text: '[صورة]', attachments: [{ filename: 'i.jpg', mime: 'image/jpeg', data_base64: PHOTO_B64, kind: 'image' }] });
      t.app.ai.cancelTimers();
      const d3 = t.app.db.value('SELECT id FROM documents WHERE message_id = ?', r3.message_id);
      const lawyer = await createLawyer(admin, {});
      await assign(admin, acc2.case.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'رأي', grants: { facts: true, document_ids: [d3] } });
      const c409 = await admin.post('/api/admin/messages/split', { message_ids: [r3.message_id], client_ref: 'split-2' });
      assert.equal(c409.status, 409);
      assert.match(c409.body.error, /ظاهر للمحامي/);
      // صادرة، أو من عميلتين ← 400
      const outMsg = ok(await admin.post(`/api/admin/cases/${acc2.case.id}/messages`, { body: 'أهلًا' }));
      assert.equal((await admin.post('/api/admin/messages/split', { message_ids: [outMsg.id], client_ref: 'split-3' })).status, 400);
      assert.equal((await admin.post('/api/admin/messages/split', { message_ids: [m1, r3.message_id], client_ref: 'split-4' })).status, 400);
      assert.equal((await admin.post('/api/admin/messages/split', { message_ids: [], client_ref: 'split-5' })).status, 400);
    });
  });

  test('T42 notices: blocked 4 h after ready (office open) → one story.voice_waiting; unconfirmed website story awaiting 48 h unseen → one story.portal_unseen; neither repeats', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      t.app.settings.set('office_hours_schedule', { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' });
      const v = t.app.engine.receive({ channel: 'website', from_phone: e164(newPhone()), contact_name: 'أم ياسين', text: '[رسالة صوتية]', attachments: [{ filename: 'v.webm', mime: 'audio/webm', data_base64: VOICE_B64 }], force_new_intake: true });
      t.app.ai.cancelTimers();
      await t.app.ai.runAuto(v.intake.id);
      t.app.db.run('UPDATE intakes SET story_ready_at = ? WHERE id = ?', new Date(Date.now() - 5 * 3600 * 1000).toISOString(), v.intake.id);
      const w = await webIntake(t);
      await t.app.ai.runAuto(w.id);
      ok(await admin.post(`/api/admin/intakes/${w.id}/reply`, { body: 'أهلًا بيكي، محتاجين صورة شهادة الوفاة.', await_client: true }));
      assert.equal(rowOf(t, w.id).status, 'awaiting_client');
      t.app.db.run("UPDATE messages SET created_at = ? WHERE intake_id = ? AND direction = 'out'", new Date(Date.now() - 49 * 3600 * 1000).toISOString(), w.id);
      const r = t.app.stories.checkReady();
      assert.equal(r.notices, 2);
      const voice = t.app.db.all("SELECT DISTINCT title FROM notifications WHERE type = 'story.voice_waiting'");
      assert.equal(voice.length, 1);
      assert.match(voice[0].title, /رسالة صوتية لم تُسمع منذ 5 ساعات — REQ-/);
      const unseen = t.app.db.all("SELECT DISTINCT title FROM notifications WHERE type = 'story.portal_unseen'");
      assert.equal(unseen.length, 1);
      assert.match(unseen[0].title, /لم تفتح صفحتها — اتصل بها \(REQ-/);
      assert.equal(t.app.stories.checkReady().notices, 0, 'never twice');
    });
  });

  test('T43 names: «Samsung» profile → «أهلًا بيكي»; website «أم ريم» → «أهلًا يا أم ريم»; readiness story_ack warning only with WhatsApp configured and the ack off', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      t.app.settings.set('story_ack_enabled', true);
      const p = newPhone();
      wa(t, p, PEN_STORY, { name: 'Samsung' });
      wa(t, p, 'خلاص');
      t.app.ai.cancelTimers();
      const i = intakeOf(t, p);
      assert.equal(t.app.clients.get(i.client_id).name_source, 'whatsapp_profile');
      const ack = rule(t, 'story_ack', i.id)[0];
      assert.match(ack.body, /^أهلًا بيكي\./);
      assert.doesNotMatch(ack.body, /Samsung/);
      const w = await webIntake(t, { name: 'أم ريم' });
      assert.match(t.app.stories.fill(CLIENT_TEXTS.story_ack, rowOf(t, w.id)), /^أهلًا يا أم ريم\./);
      ok(await admin.patch(`/api/admin/clients/${i.client_id}`, { name: 'أم مروان' }));
      assert.equal(t.app.clients.get(i.client_id).name_source, 'staff');
      assert.match(t.app.stories.fill(CLIENT_TEXTS.story_ack, rowOf(t, i.id)), /^أهلًا يا أم مروان\./);
      let h = ok(await admin.get('/api/admin/system/health'));
      let item = h.checks.find((x) => x.key === 'story_ack');
      assert.equal(item.level, 'ok');
      t.app.settings.set('story_ack_enabled', false);
      h = ok(await admin.get('/api/admin/system/health'));
      item = h.checks.find((x) => x.key === 'story_ack');
      assert.equal(item.level, 'ok', 'simulation mode: no warning');
      assert.equal(item.href, '#/settings?section=stories');
      configureWhatsApp(t);
      h = ok(await admin.get('/api/admin/system/health'));
      item = h.checks.find((x) => x.key === 'story_ack');
      assert.equal(item.level, 'warning');
      assert.equal(item.title, 'المستفيدات على واتساب لا يصلهن تأكيد وصول حكايتهن');
    });
  });
});

// ───────────── T26 — واجهة الإدارة (فحوص ثابتة بلا متصفح) ─────────────
describe('v9.2 stories — staff UI (static checks)', () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const COMPONENTS = ['story-sheet.js', 'voice-transcript.js', 'call-note.js', 'story-settings.js', 'split-dialog.js'];

  test('T26 the five components exist with no inline script/eval/innerHTML; intake-detail keeps the asserted strings; icons defined; the v9.2 CSS section has no hex colours', () => {
    for (const f of COMPONENTS) {
      const src = read(`public/assets/js/app/components/${f}`);
      assert.ok(src.length > 1000, f);
      assert.doesNotMatch(src, /<script|innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(/, f);
    }
    for (const f of ['public/app.html']) assert.doesNotMatch(read(f), /<script(?![^>]*\bsrc=)[^>]*>/, `${f}: CSP script-src 'self' — no inline script`);
    const detail = read('public/assets/js/app/pages/admin/intake-detail.js');
    for (const s of [
      "h('audio.doc-audio-player', { controls: true, preload: 'metadata'",
      'button(MERGE_LABEL',
      'title: `الطلب ${it.code}`',
      'api.patch(`/admin/documents/${doc.id}`, { title: v.title })',
      "button('تسمية'",
      'export const GENERIC_DOC_NAME',
    ]) assert.ok(detail.includes(s), s);
    const ui = read('public/assets/js/lib/ui.js');
    const block = /const ICONS = \{([\s\S]*?)\n\};/.exec(ui)[1];
    for (const n of ['mic', 'grid', 'list', 'phone-off', 'split']) assert.match(block, new RegExp(`^ {2}'?${n}'?: \\[`, 'm'), n);
    const css = read('public/assets/css/v9-messaging.css');
    const at = css.indexOf('v9.2 القصص (admin-ai)');
    assert.ok(at > 0, 'the «v9.2 القصص» section is appended to v9-messaging.css');
    const sec = css.slice(css.lastIndexOf('/*', at));
    assert.ok(sec.length > 2000);
    assert.doesNotMatch(sec, /#[0-9a-fA-F]{3,8}\b/, 'tokens only — no hex colours');
    assert.doesNotMatch(sec, /rgba?\(\s*\d/, 'tokens only — no literal rgb()');
  });

  test('T26 staff copy (§6.4) is wired: inbox cards, proposal, sheet, call note, transcript, split, settings, simulator', () => {
    const has = (f, list) => {
      const src = read(f);
      for (const s of list) assert.ok(src.includes(s), `${f}: «${s}»`);
    };
    has('public/assets/js/app/pages/admin/inbox.js', [
      "'aria-label': 'طريقة العرض'", "'بطاقات'", "'قائمة'", "'aria-label': 'حالة القصة'", "VIEW_KEY = 'bm.inbox.view'", "q.sort = 'triage'",
      'طلبت مكالمة', 'جاهزة للقرار', 'القصة لسه بتتكتب', 'وصل جديد بعد الملخص', 'بانتظار ردها', 'رسائل صوتية لم تُكتب',
      'لا توجد قصص جاهزة للقرار الآن.', 'لا توجد قصص تُكتب الآن.', 'لا توجد طلبات مكالمة الآن.',
      'لم تحكِ مشكلتها بعد — الوقت المناسب: ', 'تُلخَّص تلقائيًا بعد', 'اتلخّصت ', 'سألناها ', 'فيها رسالة صوتية لم تُكتب', 'تعذّر تنزيل رسالة صوتية',
      'المقترح: ', ' لم تُكتب', 'الموضوع: ', 'رقم غير مؤكد', 'محاولات الاتصال: ', 'ملخص مبدئي', "'اقتراح'",
      "'سجّل المكالمة'", "'لم ترد'", "'اسمع الرسالة الصوتية'", "'لخّصها الآن'", "'حلّل الآن'", "'اتصل بها'", "label('story_track_action', track)", "'فتح الطلب'",
      // القائمة القديمة باقية
      'لم يُحدَّد موضوع الطلب بعد', 'عرض المزيد', 'تسجيل طلب يدوي',
    ]);
    has('public/assets/js/app/pages/admin/intake-detail.js', [
      "'تحويل القصة إلى طلب'", "'اقتراح الذكاء الاصطناعي — القرار لك'", "'المقترح: '", "'ليه؟ '", '`اعمله طلب: ${', "'إرسال لصفحتها فقط'", "'اختيار مسار آخر'",
      "'حدّث الملخص الآن'", "'قرار يدوي'", "title: 'طلبت مكالمة'", ' واسمع مشكلتها، ثم سجّل ما قالته هنا ليُلخَّص الطلب.', "'إغلاق: تعذّر الوصول إليها'",
      'يُغلق الطلب بعد 3 محاولات في يومين مختلفين على الأقل.', 'أضافت بعد الإرسال: ', "'اختارت من القائمة'", "'اختارت الموضوع من الموقع'", "'أنهت حكايتها'",
      "'مكالمة — كتبتها الإدارة'", '`القائمة: ${', "'كل الرسائل الصوتية مكتوبة — سيُحدَّث الملخص خلال دقيقة'", "'حدّث الآن'", "'كل الرسائل الصوتية مكتوبة — حُدِّث الملخص'",
      "['voice', 'call', 'chat'].includes(ctx.query.focus)",
    ]);
    has('public/assets/js/app/components/story-sheet.js', [
      "title: 'اعمله طلب'", "'تحويل وإصدار كود الملف'", "'فتح الملف والملف المستمر'", "'إرسال الرد وإغلاق الطلب'", "'إغلاق الطلب دون رسالة'", "'إرسال التوجيه وإغلاق الطلب'",
      "'إرسال الأسئلة'", "'بلّغتها في مكالمة — أغلق بدون رسالة'", "'مقترح'", "'ليه؟ '", 'وصلت رسائل جديدة من المستفيدة بعد فتح الاقتراح. راجعها ثم حاول مرة أخرى، أو تابع رغم ذلك.',
      "'مراجعة الرسائل'", "'متابعة رغم ذلك'", "'سبق إرسال أسئلة لم تُجب بعد'", "' (إرسال تجريبي)'", 'اختر الآن المحامي', 'أُرسلت الأسئلة — الطلب بانتظار ردها',
      "'سؤال المحامي المقترح'", "'ملخص الوقائع للمحامين'", "'الملف المستمر'", "'يُفحص تعارض المصالح تلقائيًا'", 'سيُفتح ملف استشارة وملف مستمر مرتبط به في خطوة واحدة.',
      "'رجّعها للنص التلقائي'", "'الرسالة كما ستصلها'", "'مسودة من الذكاء الاصطناعي — راجعها قبل الإرسال'", '`من الردود الجاهزة: ${', 'force: true', 'story_rev: rev.value',
    ]);
    has('public/assets/js/app/components/call-note.js', [
      "title: 'تسجيل المكالمة'", 'قل: معاكي ${orgName()} بخصوص طلب رقم ${refNumber(code)}. اتأكد إنك بتكلمها هي قبل أي تفاصيل، ولا تذكر الموضوع لغيرها.', "'قل لها:'",
      "'ما قالته المستفيدة في المكالمة'", "'اكتب كلامها كما قالته قدر الإمكان، بلا تحليل. لا تكتب أرقامًا لا تحتاجها.'",
      "'اسألها: الرقم ده عليه واتساب؟ لو أكدت أنها صاحبته علّم تأكيد الهوية.'", "'تأكدت أثناء المكالمة أنها صاحبة الرقم المسجل (تأكيد الهوية)'", "'حفظ وتلخيص'",
      "'حُفظت المكالمة — جارٍ تلخيص الطلب'", 'client_ref: clientRef', "'no_answer', 'busy', 'wrong_number', 'someone_else'",
    ]);
    has('public/assets/js/app/components/voice-transcript.js', [
      "'اكتب ما قالته المستفيدة بكلامها'", "'حفظ النص'", "'الرسالة مش مفهومة'", '`كتبتها ${by} `', '`غير مفهومة — ${by}`', "'تعديل'", "'السرعة:'", "'1.25×'", "'1.5×'", "'حُفظ النص'",
      'e.ctrlKey || e.metaKey', 'api.put(`/admin/voice-notes/',
    ]);
    has('public/assets/js/app/components/split-dialog.js', [
      "'طلب جديد من رسائل هذا الملف'", "'اختر الرسائل التي تخص المشكلة الجديدة. ستُنقل من محادثة الملف إلى الطلب الجديد ويُلخَّص.'", "'اعمل طلب جديد'", '`أُنشئ الطلب ${',
      "api.post('/admin/messages/split'",
    ]);
    has('public/assets/js/app/components/story-settings.js', [
      "title: 'القصص الواردة على واتساب'", "'متى يلخّص الذكاء الاصطناعي القصة، والرسائل الآلية التي تصل المستفيدة.'", "'مدة السكوت قبل التلخيص (بالدقائق)'",
      "'إرسال ترحيب بقائمة المواضيع لأول رسالة على واتساب'", "'إرسال «وصلتنا حكايتك» ورقم الطلب عندما تكتمل القصة'", 'قرار مفتوح 11', "'الرقم الذي نتصل منه بالمستفيدات'",
      "'يظهر لها بعد طلب المكالمة حتى ترد عليه. اتركه فارغًا لاستخدام رقم المؤسسة.'", "'نتصل خلال (أيام عمل)'", "toast('تم الحفظ'", "el.id = 'stories'",
    ]);
    has('public/assets/js/app/pages/admin/settings.js', ["import { storySettingsCard } from '../../components/story-settings.js';", 'siteSettingsCard(settings),\n    storySettingsCard(settings),']);
    has('public/assets/js/app/pages/admin/simulator.js', ["'إرسال رسالة صوتية تجريبية'", "'إرسال صورة ورقة'", "'خلاص'", "'ترحيب واتساب متوقف من الإعدادات، فلن تظهر قائمة المواضيع.'", "sendQuick('list_reply'"]);
    has('public/assets/js/app/pages/admin/case-detail.js', ["'اعمل منها طلب جديد'", 'onSplit', 'c.brief_draft']);
    has('public/assets/js/app/pages/admin/matter-detail.js', ['onSplit: (msg) => openSplitDialog(']);
  });

  test('T26 helpers: unfilled variables and greeting-only drafts are caught before sending; the split list keeps her recent inbound messages only', async () => {
    const { unfilledVar } = await import('../public/assets/js/app/components/story-sheet.js');
    const { isSkeletonReply, refNumber } = await import('../public/assets/js/app/components/call-note.js');
    const { splittable } = await import('../public/assets/js/app/components/split-dialog.js');
    assert.equal(unfilledVar('أهلًا {client_name}، …'), '{client_name}');
    assert.equal(unfilledVar('شوفي صفحتك: {portal_link}'), null, '{portal_link} is filled at send time');
    assert.equal(isSkeletonReply('أهلًا يا عادل،\n\n— مؤسسة بيوت مصر'), true);
    assert.equal(isSkeletonReply('أهلًا بيكي،\n\n— مؤسسة بيوت مصر'), true);
    assert.equal(isSkeletonReply('أهلًا بيكي، لاستخراج إعلام الوراثة نرجو تجهيز شهادة الوفاة.\n— مؤسسة بيوت مصر'), false);
    assert.equal(refNumber('REQ-2026-00029'), '29');
    const now = Date.parse('2026-10-08T10:00:00Z');
    const msgs = [
      { id: 1, direction: 'in', created_at: '2026-10-07T10:00:00Z', meta: {} },
      { id: 2, direction: 'out', created_at: '2026-10-07T11:00:00Z', meta: {} },
      { id: 3, direction: 'in', created_at: '2026-08-01T10:00:00Z', meta: {} },
      { id: 4, direction: 'in', created_at: '2026-10-07T12:00:00Z', meta: { call_note: true } },
    ];
    assert.deepEqual(splittable(msgs, now).map((m) => m.id), [1]);
  });

  test('T26 drafts never carry {client_name} when her name may not be used (WhatsApp profile name) — «أهلًا بيكي» instead', async () => {
    await withApp(async (t) => {
      const p = newPhone();
      wa(t, p, INFO_STORY, { name: 'Samsung' });
      t.app.ai.cancelTimers();
      const i = intakeOf(t, p);
      const filled = t.app.stories.fill('أهلًا {client_name}، نرجو تجهيز شهادة الوفاة. — {org_name}', rowOf(t, i.id));
      assert.doesNotMatch(filled, /\{client_name\}|Samsung/);
      assert.match(filled, /^أهلًا بيكي، نرجو تجهيز شهادة الوفاة/);
      const w = await webIntake(t, { name: 'أم ريم' });
      assert.match(t.app.stories.fill('أهلًا {client_name}، تمام.', rowOf(t, w.id)), /^أهلًا أم ريم، تمام\.$/);
    });
  });
});

// ───────────── مراجعة 9.2 (admin-ai): أخطاء وجدتها المراجعة واختبارات الاستخدام ─────────────
describe('v9.2 stories — review fixes', () => {
  const QR_PEN = { id: 901, title: 'مستندات صرف معاش الأرملة والأيتام', body: 'أهلًا {client_name}، لصرف المعاش نرجو تجهيز: شهادة الوفاة، وقسيمة الزواج، وشهادات ميلاد الأبناء، وبطاقة الرقم القومي، ثم التوجه لمكتب التأمينات التابع لجهة عمل المتوفى.', usage_count: 3 };
  const QR_INH = { id: 902, title: 'المستندات المطلوبة لإعلام الوراثة', body: 'لاستخراج إعلام الوراثة: شهادة وفاة المورث، وبطاقات الورثة، واسما شاهدين.', usage_count: 9 };
  const PEN_INFO = 'زوجي الله يرحمه توفى من 8 شهور وكان شغال في شركة خاصة ومأمن عليه، ولحد دلوقتي معرفتش أصرف المعاش ليا وللعيال. التأمينات بتطلب ورق كتير ومش فاهمة أعمل إيه.';

  test('R1 the card one-liner skips greetings and request codes («مرحبًا بيوت مصر», «السلام عليكم بخصوص الطلب REQ-…»)', () => {
    const a = H.analyzeIntake('مرحبًا بيوت مصر\nجوزي اتوفى من سنة ومش عارفة أصرف المعاش بتاعه', {});
    assert.doesNotMatch(a.one_line, /^مرحب/);
    assert.match(a.one_line, /جوزي اتوفى/);
    const b = H.analyzeIntake('السلام عليكم بخصوص الطلب REQ-2026-00020\nعايزة أعرف وصلتوا لإيه في موضوع ورث جدي', {});
    assert.doesNotMatch(b.one_line, /REQ-|السلام عليكم/);
    assert.match(b.one_line, /ورث جدي/);
    const c = H.analyzeIntake('السلام عليكم، جوزي اتوفى وأهله واخدين الشقة', {});
    assert.match(c.one_line, /^جوزي اتوفى/, 'the greeting at the start of a real sentence is dropped');
  });

  test('R2 «ترد الإدارة» gets a drafted reply from a same-topic quick reply (not a greeting-only skeleton); none from another topic', () => {
    const a = H.analyzeIntake(PEN_INFO, { quickReplies: [QR_INH, QR_PEN] });
    assert.equal(a.recommended_track, 'internal');
    assert.equal(a.reply_source?.id, QR_PEN.id, 'pension question → pension documents reply');
    assert.match(a.request_draft.reply_to_her, /لصرف المعاش/);
    const b = H.analyzeIntake(PEN_INFO, { quickReplies: [QR_INH] });
    assert.equal(b.recommended_track, 'internal');
    assert.equal(b.reply_source, null, 'an inheritance reply is never drafted for a pension question');
  });

  test('R3 unconfirmed website story on «ترد الإدارة»: call script = the drafted reply; a greeting-only draft is never a script; her number is in the staff proposal (not in the inbox list)', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const at = new Date().toISOString();
      for (const q of [QR_PEN, QR_INH]) t.app.db.insert('quick_replies', { title: q.title, body: q.body, category: 'general', usage_count: q.usage_count, created_at: at, updated_at: at });
      const w = await webIntake(t, { name: 'وفاء عبد الستار', description: PEN_INFO });
      await t.app.ai.runAuto(w.id);
      const pr = ok(await admin.get(`/api/admin/intakes/${w.id}/proposal`));
      assert.equal(pr.track.recommended, 'internal');
      assert.equal(pr.actions.primary, 'call');
      assert.match(pr.actions.call_script, /لصرف المعاش/, 'the script carries the drafted reply');
      assert.doesNotMatch(pr.actions.call_script, /\{client_name\}/);
      assert.equal(pr.identity.phone, e164(w.phone), 'staff can call her from the triage card');
      const list = ok(await admin.get('/api/admin/intakes?scope=open&sort=triage'));
      const digits = w.phone.slice(1);
      assert.ok(list.items.some((x) => x.id === w.id));
      assert.doesNotMatch(JSON.stringify(list), new RegExp(digits), 'the inbox list stays phone-free (S-22)');
      // the drafted reply can go to her page as is (one click from «إرسال لصفحتها فقط»)
      const r = ok(await admin.post(`/api/admin/intakes/${w.id}/accept`, { track: 'internal', story_rev: pr.story.rev, resolution_note: pr.drafts.internal.resolution_note, reply: { send: true, text: pr.drafts.internal.reply.text, channel: 'website' } }));
      assert.equal(r.message.channel, 'website');
      // greeting-only: no script
      const w2 = await webIntake(t, { description: 'عايزة أعرف ينفع أعمل توكيل لأخويا وأنا برة مصر وإيه المطلوب' });
      await t.app.ai.runAuto(w2.id);
      const pr2 = ok(await admin.get(`/api/admin/intakes/${w2.id}/proposal`));
      if (pr2.track.recommended === 'internal' && !pr2.drafts.internal.reply.source) assert.equal(pr2.actions.call_script, null);
    });
  });

  test('R4 accept without story_rev is refused (the «new messages since you opened it» check needs it) unless forced', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const s = await readyStory(t);
      const pr = ok(await admin.get(`/api/admin/intakes/${s.id}/proposal`));
      const bad = await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'consultation', case: pr.drafts.consultation.case });
      assert.equal(bad.status, 400);
      assert.equal(rowOf(t, s.id).decided_track, null, 'nothing decided');
      assert.equal(rowOf(t, s.id).status, 'new');
      const forced = ok(await admin.post(`/api/admin/intakes/${s.id}/accept`, { track: 'consultation', force: true, case: pr.drafts.consultation.case }));
      assert.ok(forced.case && forced.case.id);
    });
  });

  test('R5 «الرقم الذي نتصل منه» is stored in the local format she sees on the site', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      ok(await admin.patch('/api/admin/settings', { callback_from_number: ' +20 121 111-4662 ' }));
      assert.equal(t.app.settings.get('callback_from_number'), '01211114662');
      ok(await admin.patch('/api/admin/settings', { callback_from_number: '٠١٠٠١٢٣٤٥٦٧' }));
      assert.equal(t.app.settings.get('callback_from_number'), '01001234567');
      assert.equal((await admin.patch('/api/admin/settings', { callback_from_number: '<b>123</b>' })).status, 400);
      ok(await admin.patch('/api/admin/settings', { callback_from_number: '' }));
      assert.equal(t.app.settings.get('callback_from_number'), '');
    });
  });

  test('R6 UI: the call dialog from a triage card gets her number from the proposal; no «واتساب» reply option for an unconfirmed number; phone-size tap targets', () => {
    const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const inbox = read('public/assets/js/app/pages/admin/inbox.js');
    assert.match(inbox, /phone: p && p\.identity \? p\.identity\.phone : null/);
    const sheet = read('public/assets/js/app/components/story-sheet.js');
    assert.match(sheet, /unconfirmed \? REPLY_CHANNELS\.filter\(\(c\) => c\.value !== 'whatsapp'\)/);
    assert.match(sheet, /const herPhone = opts\.phone \|\| \(p\.identity && p\.identity\.phone\)/);
    const css = read('public/assets/css/v9-messaging.css');
    const v92 = css.slice(css.indexOf('v9.2 القصص'));
    assert.match(v92, /\.pa-story-sheet \.input,[\s\S]*?min-height: 44px/);
    assert.match(v92, /\.pa-prop-card \.pa-prop-primary,[\s\S]*?--btn-h: 48px/);
    assert.match(v92, /\.pa-sheet-phone \{[^}]*min-height: 44px/, '«بلّغتها في مكالمة» link button ≥ 44px');
    assert.match(v92, /\.pa-page-inbox \.btn,[\s\S]*?\.pa-page-intake \.input \{\s*min-height: 44px/);
    // «اعمل منها طلب جديد» only on messages that arrived after the case was opened (not on the story the case came from)
    const caseDetail = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.match(caseDetail, /splitAfter: data\.case && data\.case\.created_at/);
    assert.match(caseDetail, /!\(splitAfter && String\(m\.created_at \|\| ''\) <= String\(splitAfter\)\)/);
  });
});
