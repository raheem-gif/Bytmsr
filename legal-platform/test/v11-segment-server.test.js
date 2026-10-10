// v11 segment-server — نوع الخدمة «خيري» / «أفراد وشركات»: المخطط 86، segment.js، موقع الطلب، أرقام واتساب
// (الأساسي، الأفراد والشركات، غير المضبوط)، الجمل الجاهزة، العميل العائد، الوراثة والتغيير بسبب وسجل، وواجهات الإدارة.
// واتساب «المتصل» بمحاكاة Graph API (globalThis.fetch)؛ لا اتصال حقيقي بميتا أبدًا.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { startTestApp, waPayload, freezeClock, resetClock } from './helpers.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/bootstrap.js';
import * as SEG from '../public/assets/js/public/segment.js';
import { TOPICS, waPrefill } from '../public/assets/js/public/topics.js';
import { LABELS, ENUMS, CLIENT_TEXTS, CLIENT_TEXTS_PAID, DEFAULT_SETTINGS, STORY_AUTO_RULES, DEFAULT_AUTOMATION_RULES } from '../src/constants.js';
import { TEMPLATE_PURPOSES } from '../src/services/messaging.js';
import { INTEGRATION_SPEC } from '../src/services/integrations.js';
import { segmentHint, analyzeIntake } from '../src/ai/heuristic.js';
import { factsText, isFactual } from '../src/channels/engine.js';
import { parseWebhook } from '../src/channels/whatsapp.js';
import { transformAsset } from '../src/site-assets.js';
import { SITE_GREETING, paidStaffLines, PAID_BANNED_RE } from '../src/services/segments.js';
import crypto from 'node:crypto';
import { setSdkLoader, createAnthropicProvider, PAID_AUDIENCE_LINE, UNSET_AUDIENCE_LINE } from '../src/ai/anthropic.js';
import { SEGMENT_DEMO_PHONES } from '../src/seed-v11-segment.js';
import { DAY_BEFORE_TEMPLATE_PAID } from '../src/services/portal-v91.js';
import { periodOf } from '../src/util.js'; // v11 gate fixer-server (R-03)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const STORY = 'جوزي اتوفى من سنة وسايب شقة باسمه، وأهله عايزين يبيعوها، وعايزة أعرف حقي وحق ولادي في الورث.';
const PAID_STORY = 'شركتي عندها عقد توريد مع مورد ومش ملتزم بالمواعيد، ومحتاجين نعرف حقنا القانوني في فسخ العقد.';

const form = (o = {}) => ({ consent: true, phone: '01012345678', description: STORY, ...o });
const intakeRow = (t, id) => t.app.db.get('SELECT * FROM intakes WHERE id = ?', id);
const lastIntake = (t) => t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');
const intakeByCode = (t, code) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', code);

/** رسالة واتساب واردة على رقم بعينه (metadata.phone_number_id) — بلا pid = حمولة قديمة بلا metadata */
function waOn(pid, { from = '201012345678', text = 'مرحبا', name = 'عميل', id } = {}) {
  const p = waPayload({ from, text, name, id });
  if (pid === undefined) delete p.entry[0].changes[0].value.metadata;
  else p.entry[0].changes[0].value.metadata.phone_number_id = pid;
  return p;
}

/** محاكاة Graph API: كل طلب يُسجل، والرد ناجح برقم رسالة */
function stubFetch(display = {}) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://graph.facebook.com/')) return orig(url, init); // عميل الاختبار نفسه
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    const m = /\/v\d+\.\d+\/([^/?]+)\?fields=display_phone_number/.exec(String(url));
    if (m) return new Response(JSON.stringify({ display_phone_number: display[m[1]] || '+20 100 000 0009', verified_name: 'Test' }), { status: 200 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT.${calls.length}` }] }), { status: 200 });
  };
  return { calls, restore: () => (globalThis.fetch = orig) };
}
const until = async (fn, ms = 2000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};

const LIVE = { whatsapp: { token: 'test-token-123456789012345', phoneNumberId: 'PN123', wabaId: 'WABA9', verifyToken: 'verify-me', appSecret: '', numberDigits: '201000000001' } };
const admin0 = (t) => t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
/** رقم الأفراد والشركات PAIDID (201000000002)، والتحقق منه اختياري */
function configurePaid(t, { verified = true, pid = 'PAIDID', number = '201000000002' } = {}) {
  t.app.integrations.set('whatsapp', { paid_phone_number_id: pid, paid_number: number }, admin0(t));
  if (verified) t.app.segments.markPaidVerified(pid, number);
}

// ═════════════════════════ المخطط 86 والترحيل ═════════════════════════
describe('v11 segment-server — schema 86 and migration (INV-08)', () => {
  test('columns, indexes and snapshot triggers exist; company cases and their matters are paid on a demo database', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const cols = (tbl) => db.all(`PRAGMA table_info(${tbl})`).map((r) => r.name);
      for (const c of ['segment', 'segment_source', 'segment_set_at', 'segment_set_by', 'segment_hint', 'wa_line', 'segment_choice_sent_at']) assert.ok(cols('intakes').includes(c), c);
      for (const [tbl, c] of [['cases', 'segment'], ['matters', 'segment'], ['messages', 'wa_line'], ['messages', 'wa_pid'], ['billable_events', 'segment'], ['ledger_entries', 'segment']]) assert.ok(cols(tbl).includes(c), `${tbl}.${c}`);
      assert.ok(!cols('quick_replies').includes('segment'), 'L11-39: no quick_replies.segment in 11.0');
      const trg = db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'").map((r) => r.name);
      assert.ok(trg.includes('trg_v11_be_segment') && trg.includes('trg_v11_le_segment'));
      const idx = db.all("SELECT name FROM sqlite_master WHERE type = 'index'").map((r) => r.name);
      for (const i of ['idx_intakes_segment', 'idx_cases_segment', 'idx_matters_segment']) assert.ok(idx.includes(i), i);
      assert.equal(Number(db.value("SELECT COUNT(*) FROM cases WHERE company_id IS NOT NULL AND segment != 'paid'")), 0);
      assert.ok(Number(db.value('SELECT COUNT(*) FROM cases WHERE company_id IS NOT NULL')) > 0, 'demo has company cases');
      assert.equal(Number(db.value("SELECT COUNT(*) FROM matters m JOIN cases c ON c.id = m.case_id WHERE c.company_id IS NOT NULL AND m.segment != 'paid'")), 0);
      assert.equal(Number(db.value('SELECT COUNT(*) FROM billable_events WHERE segment IS NULL')), 0, 'snapshot written at insert');
      assert.equal(Number(db.value('SELECT COUNT(*) FROM ledger_entries WHERE segment IS NULL')), 0);
      assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
    } finally {
      await t.close();
    }
  });

  test('a pre-11 database migrates: everything charity, company cases/matters paid, snapshots backfilled; two restarts keep a NULL intake NULL', async () => {
    const t = await startTestApp({ seed: 'demo' });
    const dbPath = t.app.config.dbPath;
    const dir = t.dir;
    t.app.db.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const copy = path.join(dir, 'pre11.db');
    t.app.db.raw.exec(`VACUUM INTO '${copy}'`);
    await t.app.close();
    try {
      // نزع أعمدة 11.0 وفهارسها ومحفزاتها = قاعدة بيانات 10.0 بنفس البيانات
      const raw = new DatabaseSync(copy);
      raw.exec('DROP TRIGGER IF EXISTS trg_v11_be_segment; DROP TRIGGER IF EXISTS trg_v11_le_segment; DROP INDEX IF EXISTS idx_intakes_segment; DROP INDEX IF EXISTS idx_cases_segment; DROP INDEX IF EXISTS idx_matters_segment;');
      const cols = JSON.parse(read('src/schema.d/86-v11-segment.columns.json'));
      for (const [tbl, col] of cols) raw.exec(`ALTER TABLE ${tbl} DROP COLUMN ${col}`);
      raw.close();
      const cfg = loadConfig({ dataDir: dir, dbPath: copy, uploadsDir: path.join(dir, 'uploads'), demo: false, schedulerIntervalSeconds: 0, silent: true, ai: { provider: 'heuristic', anthropicApiKey: '' }, whatsapp: { token: '', phoneNumberId: '', verifyToken: 'v', appSecret: '', numberDigits: '' } });
      let app = createApp(cfg);
      await bootstrap(app);
      const db = app.db;
      assert.equal(Number(db.value("SELECT COUNT(*) FROM intakes WHERE segment IS NOT 'charity'")), 0, 'every pre-11 intake reads charity');
      assert.equal(Number(db.value('SELECT COUNT(*) FROM intakes WHERE segment_source IS NOT NULL')), 0, 'legacy = segment_source IS NULL');
      assert.equal(Number(db.value("SELECT COUNT(*) FROM cases WHERE company_id IS NULL AND segment != 'charity'")), 0);
      assert.equal(Number(db.value("SELECT COUNT(*) FROM cases WHERE company_id IS NOT NULL AND segment != 'paid'")), 0);
      assert.equal(Number(db.value("SELECT COUNT(*) FROM matters m JOIN cases c ON c.id = m.case_id WHERE c.company_id IS NOT NULL AND m.segment != 'paid'")), 0);
      assert.equal(Number(db.value('SELECT COUNT(*) FROM billable_events WHERE segment IS NULL')), 0);
      assert.equal(Number(db.value('SELECT COUNT(*) FROM ledger_entries WHERE segment IS NULL')), 0);
      assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
      const nullId = db.value('SELECT id FROM intakes ORDER BY id LIMIT 1');
      db.run('UPDATE intakes SET segment = NULL WHERE id = ?', nullId);
      const snap = JSON.stringify(db.all('SELECT id, segment FROM intakes ORDER BY id'));
      const snapCases = JSON.stringify(db.all('SELECT id, segment FROM cases ORDER BY id'));
      await app.close();
      for (let k = 0; k < 2; k++) {
        app = createApp(cfg);
        await bootstrap(app);
        assert.equal(app.db.value('SELECT segment FROM intakes WHERE id = ?', nullId), null, 'restart never fills a NULL intake');
        assert.equal(JSON.stringify(app.db.all('SELECT id, segment FROM intakes ORDER BY id')), snap);
        assert.equal(JSON.stringify(app.db.all('SELECT id, segment FROM cases ORDER BY id')), snapCases);
        await app.close();
      }
      void dbPath;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the billable/ledger snapshot is written once at insert and never follows a later case change', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const ev = db.get('SELECT b.id, b.case_id, b.segment FROM billable_events b JOIN cases c ON c.id = b.case_id WHERE c.company_id IS NULL LIMIT 1');
      assert.ok(ev, 'demo has an individual billable event');
      assert.equal(ev.segment, 'charity');
      db.run("UPDATE cases SET segment = 'paid' WHERE id = ?", ev.case_id);
      assert.equal(db.value('SELECT segment FROM billable_events WHERE id = ?', ev.id), 'charity', 'snapshot unchanged');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ segment.js والمفردات ═════════════════════════
describe('v11 segment-server — segment.js contract and labels (§5.1)', () => {
  test('segment.js is pure (no imports), ≤ 1.5 KB br as served, and in no public HTML closure', () => {
    const src = read('public/assets/js/public/segment.js');
    assert.ok(!/^\s*import\s/m.test(src) && !/\bimport\(/.test(src), 'imports nothing');
    assert.ok(!/document\.|window\./.test(src), 'no DOM');
    const served = transformAsset(path.join(ROOT, 'public/assets/js/public/segment.js'));
    const br = zlib.brotliCompressSync(served, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
    assert.ok(br <= 1536, `segment.js ${br} B br > 1536`);
    for (const f of ['landing.js', 'intake.js', 'portal.js']) {
      const p = path.join(ROOT, 'public/assets/js/public', f);
      if (fs.existsSync(p)) assert.ok(!/from\s+['"][^'"]*segment\.js['"]/.test(fs.readFileSync(p, 'utf8')), `${f} must not import segment.js`);
    }
  });

  test('vocabulary: parseSegment, cookie first-occurrence rule, PAID_TOPICS = topics.js keys in order with the r2 wording', () => {
    assert.deepEqual(SEG.SEGMENTS, ['charity', 'paid']);
    assert.equal(SEG.SEG_PARAM, 'seg');
    assert.equal(SEG.SEG_COOKIE, 'bm_seg');
    assert.equal(SEG.SEG_COOKIE_MAX_AGE, 15552000);
    assert.equal(SEG.parseSegment('paid'), 'paid');
    for (const x of ['Paid', 'khayri', 'biz', '', null, undefined, 1, ['paid']]) assert.equal(SEG.parseSegment(x), null);
    assert.equal(SEG.segmentFromCookie('a=1; bm_seg=paid; bm_seg=charity'), 'paid');
    assert.equal(SEG.segmentFromCookie('bm_seg=evil; bm_seg=paid'), null, 'the first occurrence decides even when invalid');
    assert.equal(SEG.segmentFromCookie('xbm_seg=paid'), null);
    assert.equal(SEG.segmentFromCookie(undefined), null);
    assert.deepEqual(Object.keys(SEG.PAID_TOPICS), TOPICS.map((x) => x.key));
    assert.equal(SEG.PAID_TOPICS.rent.label, 'العقارات والإيجار');
    assert.equal(SEG.PAID_TOPICS.other.sub, 'الطلاق والخلع، العقود، العمل، الشركات، وغيرها');
    for (const [k, v] of Object.entries(SEG.PAID_TOPICS)) {
      assert.ok(v.wa_title.length <= 24 && v.wa_desc.length <= 72, k);
      assert.ok(!PAID_BANNED_RE.test(JSON.stringify(v)), `${k} has no charity words`);
    }
    assert.equal(SEG.paidWaPrefill('inh'), 'مرحبًا، أرغب في حجز استشارة قانونية بخصوص الميراث.');
    assert.equal(SEG.paidWaPrefill('other'), 'مرحبًا، أرغب في حجز استشارة قانونية.');
    assert.equal(SEG.paidWaPrefill('__proto__'), 'مرحبًا، أرغب في حجز استشارة قانونية.');
    assert.equal(SEG.COMPANY_PREFILL, 'مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.');
    assert.deepEqual(SEG.CHOICE_IDS, { charity: 'seg:charity', paid: 'seg:paid' });
    assert.deepEqual(SEG.REQUESTER_EMPLOYEES, ['1-10', '11-50', '51-200', '200+']);
    assert.deepEqual(SEG.REQUESTER_NEEDS, ['contracts', 'employees', 'compliance', 'disputes', 'subscription']);
  });

  test('paidPrefillOf: normalised prefix, topic only on an exact phrase, company sentence, the rest is the story', () => {
    for (const k of Object.keys(SEG.PAID_TOPICS)) {
      const r = SEG.paidPrefillOf(SEG.paidWaPrefill(k));
      assert.deepEqual([r.topic, r.requester, r.rest], [k === 'other' ? null : k, null, ''], k);
    }
    assert.deepEqual(SEG.paidPrefillOf('مرحبا، ارغب في حجز استشارة قانونيه بخصوص النفقة.\nابني عنده 8 سنين'), { topic: 'alimony', requester: null, rest: 'ابني عنده 8 سنين' });
    assert.deepEqual(SEG.paidPrefillOf(`${SEG.COMPANY_PREFILL} عندنا 40 موظفًا`), { topic: null, requester: 'company', rest: 'عندنا 40 موظفًا' });
    const own = 'مرحبًا، أرغب في حجز استشارة قانونية بخصوص عقد شراكة. التفاصيل';
    assert.deepEqual(SEG.paidPrefillOf(own), { topic: null, requester: null, rest: own }, 'an unknown phrase is the story itself');
    assert.equal(SEG.paidPrefillOf(waPrefill('inh')), null);
    assert.equal(SEG.paidPrefillOf('السلام عليكم'), null);
    assert.equal(SEG.choiceFromText('خيري — مجاني'), 'charity');
    assert.equal(SEG.choiceFromText('  أفراد وشركات '), 'paid');
    assert.equal(SEG.choiceFromText('خدمة مدفوعة'), 'paid');
    assert.equal(SEG.choiceFromText('خيري يا جماعة عندي مشكلة'), null);
  });

  test('labels (L11-16, §5.1), settings (§5.3), automation rules, template purposes and integration fields', () => {
    assert.deepEqual(LABELS.segment, { charity: 'خيري', paid: 'أفراد وشركات' });
    assert.deepEqual(LABELS.segment_short, { charity: 'خيري', paid: 'أفراد' });
    assert.deepEqual(LABELS.segment_long, { charity: 'خيري — مساعدة مجانية', paid: 'أفراد وشركات — خدمة بأتعاب' });
    assert.deepEqual(ENUMS.segment, ['charity', 'paid']);
    assert.equal(LABELS.segment_source.company_lead, 'نموذج طلب عرض للشركات');
    for (const k of ['website', 'website_default', 'wa_line', 'wa_tag', 'wa_choice', 'returning', 'reference', 'manual', 'staff', 'company']) assert.match(LABELS.segment_source[k], /[؀-ۿ]/, k);
    assert.deepEqual(LABELS.wa_line, { main: 'الرقم الأساسي', paid: 'رقم الأفراد والشركات', unknown: 'رقم غير مضبوط' });
    assert.deepEqual(LABELS.segment_reason_codes, { not_eligible: 'غير مستحق للخيري', wrong_choice: 'اختار النوع الخطأ', company: 'طلب شركة' });
    assert.deepEqual(LABELS.segment_tone, { charity: 'بأسلوب الخيري', paid: 'بأسلوب الأفراد والشركات', neutral: 'بأسلوب محايد' });
    assert.equal(LABELS.requester_needs.subscription, 'اشتراك شهري متكامل');
    assert.equal(LABELS.requester_employees['200+'], 'أكثر من 200');
    assert.equal(LABELS.security_event['segment.changed'], 'تغيير نوع الخدمة');
    assert.equal(LABELS.security_event['integration.wa_mode_changed'], 'تغيير وضع رقم واتساب');
    assert.ok(ENUMS.ai_field.includes('segment'));
    assert.ok(STORY_AUTO_RULES.includes('segment_choice') && STORY_AUTO_RULES.includes('segment_chosen'));
    const S = DEFAULT_SETTINGS;
    assert.deepEqual([S.site_gate_enabled, S.org_phone_paid, S.segment_website_default, S.wa_paid_on_main, S.wa_segment_choice_enabled, S.segment_returning_days, S.callback_from_number_paid], [true, '', 'charity', true, false, 365, '']);
    assert.ok(!('segments_since' in S), 'L11-19');
    assert.ok(!/دون مقابل/.test(S.print_answer_disclaimer_paid));
    for (const k of ['hearing_reminder', 'invoice_reminder', 'document_reminder', 'satisfaction_survey']) {
      const tp = DEFAULT_AUTOMATION_RULES[k].params.template_paid;
      assert.ok(tp && tp.length <= 600 && !PAID_BANNED_RE.test(tp), k);
    }
    for (const p of ['case_update', 'portal_update', 'survey', 'rule:hearing_reminder', 'rule:document_reminder', 'rule:invoice_reminder']) {
      assert.deepEqual(TEMPLATE_PURPOSES[`${p}@paid`], TEMPLATE_PURPOSES[p], p);
      assert.match(LABELS.wa_template_purpose[`${p}@paid`], /— الأفراد والشركات$/);
    }
    const f = INTEGRATION_SPEC.whatsapp.fields;
    assert.deepEqual(Object.keys(f.segment.options), ['charity', 'shared'], 'r2 S3: no main mode paid');
    assert.equal(f.segment.env, 'WHATSAPP_SEGMENT');
    assert.equal(f.paid_phone_number_id.env, 'WHATSAPP_PAID_PHONE_NUMBER_ID');
    assert.equal(f.paid_number.env, 'WHATSAPP_PAID_NUMBER');
  });

  test('CLIENT_TEXTS_PAID: a paid variant for every client key (otp shared), no charity words, no gender marks', () => {
    for (const k of Object.keys(CLIENT_TEXTS)) {
      if (k === 'otp') continue;
      assert.ok(typeof CLIENT_TEXTS_PAID[k] === 'string' && CLIENT_TEXTS_PAID[k].length, `paid ${k}`);
    }
    for (const [k, v] of Object.entries(CLIENT_TEXTS_PAID)) assert.ok(!PAID_BANNED_RE.test(v), `${k}: ${v}`);
    assert.equal(CLIENT_TEXTS_PAID.story_ack_neutral, '{hello}، وصلتنا رسالتكم، وهذا {ref_no}.\nسيراجعها فريقنا ويرد عليكم هنا.\n— {org_name}');
  });
});

// ═════════════════════════ ثوابت ثابتة (L11-41) ═════════════════════════
describe('v11 segment-server — static invariants (r2 S5)', () => {
  test("every db.insert('intakes' site in src/ passes segment explicitly", () => {
    const files = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else if (e.name.endsWith('.js')) files.push(path.join(d, e.name));
      }
    };
    walk(path.join(ROOT, 'src'));
    let sites = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      let at = src.indexOf("db.insert('intakes'");
      while (at >= 0) {
        sites++;
        const end = src.indexOf('});', at);
        assert.match(src.slice(at, end), /\bsegment:/, `${path.relative(ROOT, f)}: db.insert('intakes' without segment`);
        at = src.indexOf("db.insert('intakes'", at + 1);
      }
    }
    assert.ok(sites >= 2, 'engine + split');
  });

  test('resolveInbound never returns undefined (every field null or a value)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const s = t.app.segments;
      const main = s.lineFor('SIM');
      const shared = { ...main, mode: 'shared' };
      const cases = [
        {},
        { msg: { channel: 'whatsapp', text: 'مرحبا' }, line: main },
        { msg: { channel: 'whatsapp', text: 'مرحبا' }, line: shared },
        { msg: { channel: 'whatsapp', text: SEG.paidWaPrefill('inh') }, line: shared },
        { msg: { channel: 'website', text: 'x', segment: 'paid', segment_source: 'website' } },
        { msg: { channel: 'phone', text: 'x' } },
        { msg: { channel: 'whatsapp', text: 'x' }, line: { key: 'unknown', pid: '99' } },
      ];
      for (const c of cases) {
        const r = s.resolveInbound(c);
        for (const k of ['segment', 'source', 'tag', 'requester']) assert.notEqual(r[k], undefined, `${k} in ${JSON.stringify(c)}`);
      }
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ طلب الموقع (SS-1) ═════════════════════════
describe('v11 segment-server — website path (SS-1, §5.7)', () => {
  test('segment param › cookie › default; invalid never blocks; source and gate_via recorded; same submission keeps its first segment', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const sub = (o, headers) => c.post('/api/public/intake', form(o), headers);
      let r = await sub({ segment: 'paid', phone: '01011111111', submission_id: 'sub-aaaaaaaaaaaaaaaa1' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.segment, 'paid');
      let i = intakeByCode(t, r.body.reference);
      assert.deepEqual([i.segment, i.segment_source], ['paid', 'website']);
      assert.deepEqual([JSON.parse(i.source_detail).gate, JSON.parse(i.source_detail).gate_via], ['paid', 'param']);
      // نفس submission_id بقيمة أخرى ← نفس الطلب ونفس النوع
      r = await sub({ segment: 'charity', phone: '01011111111', submission_id: 'sub-aaaaaaaaaaaaaaaa1' });
      assert.equal(r.body.reference, i.code);
      assert.equal(intakeRow(t, i.id).segment, 'paid');
      r = await sub({ segment: 'khayri', phone: '01022222222' }, { cookie: 'bm_seg=paid' });
      assert.equal(r.status, 201, 'an invalid segment is ignored, never 400');
      i = intakeByCode(t, r.body.reference);
      assert.deepEqual([i.segment, i.segment_source, JSON.parse(i.source_detail).gate_via], ['paid', 'website', 'cookie']);
      r = await sub({ phone: '01033333333' }, { cookie: 'bm_seg=charity; bm_seg=paid' });
      i = intakeByCode(t, r.body.reference);
      assert.deepEqual([i.segment, JSON.parse(i.source_detail).gate_via], ['charity', 'cookie']);
      r = await sub({ phone: '01044444444' });
      i = intakeByCode(t, r.body.reference);
      assert.deepEqual([i.segment, i.segment_source, JSON.parse(i.source_detail).gate_via], ['charity', 'website_default', 'default']);
      // الافتراضي من الإعدادات
      t.app.settings.set('segment_website_default', 'paid');
      r = await sub({ phone: '01055555555' });
      assert.deepEqual([intakeByCode(t, r.body.reference).segment, intakeByCode(t, r.body.reference).segment_source], ['paid', 'website_default']);
    } finally {
      await t.close();
    }
  });

  test('paid: no beneficiary profile; confirm sentence unchanged and on the main number in the default configuration', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const r = await c.post('/api/public/intake', form({ segment: 'paid', answers: { 'inh.deceased': 'husband' }, topic: 'inh' }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const i = intakeByCode(t, r.body.reference);
      assert.equal(t.app.db.get('SELECT 1 FROM beneficiary_submissions WHERE intake_id = ?', i.id), undefined, 'paid skips the beneficiary profile');
      assert.match(r.body.confirm_url, /^https:\/\/wa\.me\/201000000001\?text=/, 'r2 P4: main number');
      const text = decodeURIComponent(r.body.confirm_url.split('text=')[1]);
      assert.match(text, /^السلام عليكم، ده رقم طلبي REQ-\d{4}-\d{5} وكود التأكيد \d{6}$/, 'the B91-01 sentence is unchanged');
      // charity: الصفة تُحفظ كما في 10.0
      const r2 = await c.post('/api/public/intake', form({ phone: '01099999999', answers: { 'inh.deceased': 'husband' }, topic: 'inh' }));
      assert.ok(t.app.db.get('SELECT 1 FROM beneficiary_submissions WHERE intake_id = ?', intakeByCode(t, r2.body.reference).id));
      // «كمان سؤالين» لطلب أفراد: المحافظة فقط
      const token = r.body.portal_url.split('/p/')[1];
      const ab = await c.post(`/api/portal/${token}/about`, { governorate: 'الجيزة', relation: 'widow' });
      assert.equal(ab.status, 200, JSON.stringify(ab.body));
      assert.equal(intakeRow(t, i.id).governorate, 'الجيزة');
      assert.equal(t.app.db.get('SELECT 1 FROM beneficiary_submissions WHERE intake_id = ?', i.id), undefined);
      assert.equal(JSON.parse(intakeRow(t, i.id).form_answers).about.relation, undefined);
    } finally {
      await t.close();
    }
  });

  test('publicDigits table (r2 P4/S4): verified paid number, unverified, wa_paid_on_main off, shared mode', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const s = t.app.segments;
      assert.equal(s.publicDigits(), '201000000001');
      assert.equal(s.publicDigits('charity'), '201000000001');
      assert.equal(s.publicDigits('paid'), '201000000001', 'default: main + paid prefill');
      assert.equal(s.publicPrefill('paid', 'alimony'), SEG.paidWaPrefill('alimony'));
      assert.equal(s.publicPrefill('charity'), SITE_GREETING);
      configurePaid(t, { verified: false });
      assert.equal(s.publicDigits('paid'), '201000000001', 'an unverified paid number is never shown');
      t.app.segments.markPaidVerified('PAIDID', '201000000002');
      assert.equal(s.publicDigits('paid'), '201000000002');
      assert.equal(s.publicDigits('charity'), '201000000001');
      // تغيير الرقم يمسح التحقق
      t.app.integrations.set('whatsapp', { paid_number: '201000000003' }, admin0(t));
      assert.equal(s.paidVerifiedAt(), null);
      assert.equal(s.publicDigits('paid'), '201000000001');
      t.app.integrations.set('whatsapp', { paid_phone_number_id: '', paid_number: '' }, admin0(t));
      t.app.settings.set('wa_paid_on_main', false);
      assert.equal(s.publicDigits('paid'), '', 'S9: paid side without WhatsApp');
      assert.ok(s.readiness().some((x) => x.key === 'wa_paid_side' && x.level === 'warning'));
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      assert.equal(s.publicDigits('paid'), '201000000001', 'shared: main + paid prefill');
    } finally {
      await t.close();
    }
  });

  test('company lead (G11-44): validation, canned non-factual body, requester stored, company_lead notification', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const admin = await t.login('admin');
      const lead = (o) => c.post('/api/public/intake', { consent: true, phone: '01012340000', segment: 'paid', entry: 'company_band', requester: { kind: 'company', company_name: 'شركة الأمل للتجارة', job_title: 'مدير الشؤون الإدارية', email: 'Info@Alamal.example', employees: '11-50', needs: ['employees', 'contracts'], extra: 'dropped' }, ...o });
      let r = await lead({ segment: 'charity' });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'بيانات غير صالحة.');
      r = await lead({ requester: { kind: 'company', company_name: 'x' } });
      assert.equal(r.status, 400);
      assert.equal(r.body.details.fields.company_name, 'اكتبوا اسم الشركة.');
      r = await lead({ requester: { kind: 'company', company_name: 'شركة', email: 'bad' } });
      assert.equal(r.body.details.fields.email, 'البريد الإلكتروني غير صحيح.');
      r = await lead({ requester: { kind: 'company', company_name: 'شركة', needs: ['x'] } });
      assert.equal(r.status, 400);
      r = await lead({});
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const i = intakeByCode(t, r.body.reference);
      assert.deepEqual([i.segment, i.segment_source], ['paid', 'company_lead']);
      const fa = JSON.parse(i.form_answers);
      assert.deepEqual(fa.requester, { kind: 'company', company_name: 'شركة الأمل للتجارة', job_title: 'مدير الشؤون الإدارية', email: 'info@alamal.example', employees: '11-50', needs: ['contracts', 'employees'] });
      assert.equal(fa.entry, 'company_band');
      assert.equal(JSON.parse(i.source_detail).requester.company_name, 'شركة الأمل للتجارة');
      const msg = t.app.db.get('SELECT body, meta FROM messages WHERE intake_id = ?', i.id);
      assert.equal(msg.body, 'طلب عرض لخدمات الشركات — شركة الأمل للتجارة');
      assert.equal(JSON.parse(msg.meta).company_lead_canned, true);
      assert.equal(factsText(msg.body, msg.meta), '', 'the canned body is not a fact');
      assert.equal(Number(i.story_rev), 0);
      const n = await admin.get('/api/notifications');
      assert.ok(n.body.items.some((x) => x.type === 'intake.company_lead' && x.title === `طلب عرض من شركة: شركة الأمل للتجارة — ${i.code}`), JSON.stringify(n.body.items.map((x) => x.title)));
      const list = await admin.get('/api/admin/intakes');
      assert.equal(list.body.items.find((x) => x.id === i.id).requester_kind, 'company');
      const det = await admin.get(`/api/admin/intakes/${i.id}`);
      assert.equal(det.body.segment.requester.company_name, 'شركة الأمل للتجارة');
      assert.deepEqual(det.body.segment.requester.needs_labels, ['مراجعة العقود وصياغتها', 'شؤون الموظفين']);
    } finally {
      await t.close();
    }
  });

  test('r2 S16: every 400/429 from /api/public/intake carries a stable code next to the unchanged Arabic error', async () => {
    const t = await startTestApp({ seed: 'none', config: { publicIntakePerHour: 8 } });
    try {
      const c = t.client();
      const audio = { filename: 'v.webm', mime: 'audio/webm', data_base64: Buffer.from('x').toString('base64') };
      const img = { filename: 'a.jpg', mime: 'image/jpeg', data_base64: Buffer.from('x').toString('base64') };
      const expect = async (body, code, re) => {
        const r = await c.post('/api/public/intake', body);
        assert.equal(r.status, 400, JSON.stringify(r.body));
        assert.equal(r.body.code, code, JSON.stringify(r.body));
        assert.match(r.body.error, re || /[؀-ۿ]/);
      };
      await expect(form({ phone: '0101' }), 'bad_phone');
      await expect(form({ name: 'x' }), 'bad_name', /^اكتبي اسمك كامل، أو سيبيه فاضي\.$/);
      await expect(form({ description: 'قصير' }), 'too_short', /^سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك\.$/);
      await expect(form({ documents: [img, img, img, img, img, img] }), 'too_many_files');
      await expect(form({ documents: [audio, audio, audio, audio] }), 'too_many_audio');
      await expect(form({ consent: false }), 'invalid');
      let r;
      for (let k = 0; k < 10; k++) r = await c.post('/api/public/intake', form({ phone: '0101' }));
      assert.equal(r.status, 429);
      assert.equal(r.body.code, 'rate_limited');
    } finally {
      await t.close();
    }
  });

  test('r2 S14: a local hint is stored for every new intake and never applied (INV-04)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const r = await c.post('/api/public/intake', form({ description: PAID_STORY, phone: '01066666666' }));
      const i = intakeByCode(t, r.body.reference);
      assert.equal(i.segment, 'charity', 'the hint never writes segment');
      assert.equal(JSON.parse(i.segment_hint).segment, 'paid');
      const r2 = await c.post('/api/public/intake', form({ phone: '01077777777' }));
      assert.equal(intakeByCode(t, r2.body.reference).segment_hint, null, 'no evidence → NULL');
      const h = segmentHint(PAID_STORY);
      assert.equal(h.segment, 'paid');
      assert.deepEqual(h.reasons, ['ذكر «شركتي» و«عقد توريد»']);
      assert.equal(segmentHint('أنا أرملة والعيال أيتام ومش قادرة أدفع').segment, 'charity');
      assert.equal(segmentHint('عندي شركة').segment, null, 'one hit is not enough');
      const admin = await t.login('admin');
      const det = await admin.get(`/api/admin/intakes/${i.id}`);
      assert.deepEqual(det.body.segment.mismatch_hint, { reasons: ['ذكر «شركتي» و«عقد توريد»'] });
      assert.equal((await admin.get('/api/admin/intakes')).body.items.find((x) => x.id === i.id).segment_hint.segment, 'paid');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ أرقام واتساب (SS-2) ═════════════════════════
describe('v11 segment-server — WhatsApp lines, window per number, unknown ids (SS-2, INV-05/16)', () => {
  test('parseWebhook carries business_phone_number_id; legacy payloads without metadata go to the main line', () => {
    const p = parseWebhook(waOn('PAIDID', { text: 'x' }));
    assert.equal(p.messages[0].business_phone_number_id, 'PAIDID');
    assert.equal(parseWebhook(waOn(undefined, { text: 'x' })).messages[0].business_phone_number_id, null);
  });

  test('paid number: paid/wa_line, reply from /PAIDID/messages, main reply from /PN123/messages, window per line', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const f = stubFetch();
    try {
      configurePaid(t);
      const admin = await t.login('admin');
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110001', text: 'محتاج استشارة في عقد إيجار محل' }));
      const pi = lastIntake(t);
      assert.deepEqual([pi.segment, pi.segment_source, pi.wa_line], ['paid', 'wa_line', 'paid']);
      const m = t.app.db.get("SELECT wa_line, wa_pid FROM messages WHERE intake_id = ? AND direction = 'in'", pi.id);
      assert.deepEqual([m.wa_line, m.wa_pid], ['paid', 'PAIDID']);
      assert.equal(t.app.engine.inWindow(pi.client_id, 'paid'), true);
      assert.equal(t.app.engine.inWindow(pi.client_id, 'main'), false, 'a message on the paid number opens only its window');
      assert.equal(t.app.segments.lineForStory({ clientId: pi.client_id, intakeId: pi.id }), 'paid');
      const det = await admin.get(`/api/admin/intakes/${pi.id}`);
      assert.deepEqual(det.body.send_line, { key: 'paid', label: 'رقم الأفراد والشركات' });
      assert.equal(det.body.tone, 'paid');
      assert.equal(det.body.intake.identity.reply_channel.text, 'واتساب (رقم الأفراد والشركات) + صفحة المتابعة');
      let r = await admin.post(`/api/admin/intakes/${pi.id}/reply`, { body: 'مرحبًا، نحتاج صورة العقد.' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      await until(() => f.calls.some((c) => c.url.endsWith('/v21.0/PAIDID/messages')));
      assert.ok(f.calls.some((c) => c.url.endsWith('/v21.0/PAIDID/messages')), JSON.stringify(f.calls.map((c) => c.url)));
      assert.equal(t.app.db.value("SELECT wa_line FROM messages WHERE intake_id = ? AND direction = 'out' ORDER BY id DESC LIMIT 1", pi.id), 'paid');
      // الأساسي
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110002', text: 'جوزي اتوفى وعايزة أعرف الورث' }));
      const ci = lastIntake(t);
      assert.deepEqual([ci.segment, ci.segment_source, ci.wa_line], ['charity', 'wa_line', 'main']);
      const before = f.calls.length;
      r = await admin.post(`/api/admin/intakes/${ci.id}/reply`, { body: 'أهلًا، بنراجع طلبك.' });
      assert.equal(r.status, 200);
      await until(() => f.calls.length > before);
      assert.ok(f.calls.slice(before).some((c) => c.url.endsWith('/v21.0/PN123/messages')));
      // حمولة قديمة بلا metadata ← الأساسي
      t.app.engine.handleWhatsAppWebhook(waOn(undefined, { from: '201011110003', text: 'السلام عليكم عندي سؤال في المعاش' }));
      assert.equal(lastIntake(t).wa_line, 'main');
    } finally {
      f.restore();
      await t.close();
    }
  });

  test('r2 S8: an unknown phone_number_id is stored (wa_line unknown), never auto-answered, logged, and flagged', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const f = stubFetch();
    try {
      t.app.settings.set('story_welcome_enabled', true);
      const admin = await t.login('admin');
      const res = t.app.engine.handleWhatsAppWebhook(waOn('77700001234', { from: '201011110009', text: 'مرحبا عندي مشكلة في الميراث' }));
      assert.equal(res.received, 1);
      const i = lastIntake(t);
      assert.equal(i.wa_line, 'unknown');
      assert.equal(t.app.db.value("SELECT wa_pid FROM messages WHERE intake_id = ? AND direction = 'in'", i.id), '77700001234');
      await new Promise((r) => setTimeout(r, 30));
      assert.equal(f.calls.length, 0, 'no automated message, no read receipt');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE intake_id = ? AND direction = 'out'", i.id)), 0);
      assert.equal(t.app.segments.lineForStory({ clientId: i.client_id, intakeId: i.id }), null);
      const det = await admin.get(`/api/admin/intakes/${i.id}`);
      assert.equal(det.body.segment.wa_line, 'unknown');
      assert.equal(det.body.segment.wa_pid_last4, '1234');
      assert.equal(det.body.send_line.key, 'unknown');
      const r = await admin.post(`/api/admin/intakes/${i.id}/reply`, { body: 'أهلًا' });
      assert.equal(r.status, 200);
      assert.equal(r.body.channel, 'website', 'staff reply goes to the follow-up page only');
      assert.equal((await admin.post(`/api/admin/intakes/${i.id}/reply`, { body: 'أهلًا', channel: 'whatsapp' })).status, 400);
      await new Promise((r2) => setTimeout(r2, 30));
      assert.equal(f.calls.length, 0);
      assert.ok(t.app.segments.readiness().some((x) => x.key === 'wa_unknown_number' && /…1234/.test(x.title)));
    } finally {
      f.restore();
      await t.close();
    }
  });

  test('r2 S8 (L11-50): a replaced paid number id starts with a closed window (the same side\'s current number, templates only — gate K8)', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      configurePaid(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110010', text: 'استشارة في عقد عمل' }));
      const i = lastIntake(t);
      assert.equal(t.app.engine.inWindow(i.client_id, 'paid'), true);
      configurePaid(t, { pid: 'PAIDID2', number: '201000000002' });
      assert.equal(t.app.engine.inWindow(i.client_id, 'paid'), false);
      // v11 gate fixer-server (K8, intended): كان null (صفحة المتابعة فقط حتى يكتب العميل من جديد)؛ الآن نفس الجانب برقمه الحالي
      assert.equal(t.app.segments.lineForStory({ clientId: i.client_id, intakeId: i.id }), 'paid');
      assert.equal(t.app.segments.storyLineReplaced({ clientId: i.client_id, intakeId: i.id }), true);
    } finally {
      await t.close();
    }
  });

  test('r2 S4: test() verifies the paid number against Meta; a mismatch names both numbers and stays unverified', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const f = stubFetch({ PN123: '+20 100 000 0001', PAIDID: '+20 100 000 0002' });
    try {
      configurePaid(t, { verified: false });
      let r = await t.app.whatsapp.test();
      assert.equal(r.ok, true);
      assert.equal(r.paid.verified, true);
      assert.ok(t.app.segments.paidVerifiedAt());
      assert.ok(f.calls.some((c) => /\/PAIDID\?fields=display_phone_number/.test(c.url)));
      configurePaid(t, { verified: false, number: '201000000005' });
      r = await t.app.whatsapp.test();
      assert.equal(r.paid.verified, false);
      assert.match(r.message, /201000000002/);
      assert.match(r.message, /201000000005/);
      assert.equal(t.app.segments.paidVerifiedAt(), null);
      assert.ok(t.app.segments.readiness().some((x) => x.key === 'wa_paid_unverified'));
    } finally {
      f.restore();
      await t.close();
    }
  });

  test('§5.4 validation: ids differ, numbers differ, paid id needs main = charity; r2 S3 mode change confirm + audit; env paid → charity', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const admin = await t.login('admin');
      const put = (values, extra = {}) => admin.put('/api/admin/integrations/whatsapp', { values, ...extra });
      let r = await put({ paid_phone_number_id: 'PN123' });
      assert.equal(r.status, 400);
      r = await put({ paid_phone_number_id: '5551234', paid_number: '201000000001' });
      assert.equal(r.status, 400);
      assert.equal(r.body.details.fields.paid_number, 'رقم الأفراد والشركات لازم يختلف عن الرقم الأساسي');
      r = await put({ segment: 'paid' });
      assert.equal(r.status, 400, 'paid is not offered for the main number');
      r = await put({ paid_phone_number_id: '5551234', paid_number: '201000000002', segment: 'shared' });
      assert.equal(r.status, 400);
      assert.equal(r.body.details.fields.segment, 'مع وجود رقم للأفراد والشركات يبقى الرقم الأساسي للخيري');
      // مع محادثة واتساب مفتوحة: 409 ثم confirm
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110020', text: 'عندي مشكلة في الإيجار' }));
      r = await put({ segment: 'shared' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'mode_change_confirm');
      assert.deepEqual(r.body.details, { open: 1 });
      assert.equal(r.body.error, 'فيه محادثة واتساب مفتوحة؛ تغيير الوضع يغيّر طريقة تصنيف رسائلهم الجديدة. أكّدوا للمتابعة.');
      assert.equal(t.app.segments.lines()[0].mode, 'charity');
      r = await put({ segment: 'shared' }, { confirm: true });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(t.app.segments.lines()[0].mode, 'shared');
      const ev = t.app.db.get("SELECT * FROM security_events WHERE type = 'integration.wa_mode_changed'");
      assert.ok(ev);
      assert.deepEqual(JSON.parse(ev.data), { from: 'charity', to: 'shared', open: 1 });
      const lawyer = await t.login('admin');
      void lawyer;
    } finally {
      await t.close();
    }
    const prev = process.env.WHATSAPP_SEGMENT;
    process.env.WHATSAPP_SEGMENT = 'paid';
    const t2 = await startTestApp({ seed: 'none' });
    try {
      assert.equal(t2.app.segments.lines()[0].mode, 'charity', 'an env value paid is read as charity');
    } finally {
      if (prev === undefined) delete process.env.WHATSAPP_SEGMENT;
      else process.env.WHATSAPP_SEGMENT = prev;
      await t2.close();
    }
  });
});

// ═════════════════════════ الجمل الجاهزة والاستهداف (SS-2/SS-3) ═════════════════════════
describe('v11 segment-server — prefill tags, targeting and returning clients (SS-3, S11 §3.3/§3.4, L11-49)', () => {
  test('default configuration (r2 P4): paid prefill on the charity-mode main line → paid/wa_tag; untagged → charity; the confirm code keeps paid', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const f = stubFetch();
    try {
      const admin = await t.login('admin');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110030', text: `${SEG.paidWaPrefill('custody')} ابني عنده 8 سنين ومحتاج أعرف الحضانة` }));
      const p = lastIntake(t);
      assert.deepEqual([p.segment, p.segment_source, p.wa_line, p.topic], ['paid', 'wa_tag', 'main', 'custody']);
      const pm = t.app.db.get("SELECT body, meta FROM messages WHERE intake_id = ? AND direction = 'in'", p.id);
      assert.equal(JSON.parse(pm.meta).segment_tag, 'paid');
      assert.equal(factsText(pm.body, pm.meta), 'ابني عنده 8 سنين ومحتاج أعرف الحضانة', 'the prefill sentence is not a fact');
      assert.equal(Number(p.story_rev), 1, 'the text after it is factual');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110031', text: SEG.paidWaPrefill('inh') }));
      const only = lastIntake(t);
      assert.equal(Number(only.story_rev), 0, 'the prefill alone is not a story');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110032', text: 'جوزي اتوفى وعايزة أعرف حقي' }));
      assert.deepEqual([lastIntake(t).segment, lastIntake(t).segment_source], ['charity', 'wa_line']);
      // ردّ الإدارة على طلب الأفراد يخرج من الرقم الأساسي
      const before = f.calls.length;
      await admin.post(`/api/admin/intakes/${p.id}/reply`, { body: 'مرحبًا، سنتواصل معكم.' });
      await until(() => f.calls.length > before);
      assert.ok(f.calls.slice(before).some((c) => c.url.endsWith('/v21.0/PN123/messages')));
      // طلب موقع «أفراد وشركات» ثم رسالة الكود على الرقم الأساسي ← يبقى «أفراد وشركات» (قاعدة b)
      const web = await t.client().post('/api/public/intake', form({ segment: 'paid', phone: '01011110033' }));
      const code = decodeURIComponent(web.body.confirm_url.split('text=')[1]);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110033', text: code }));
      const wi = intakeByCode(t, web.body.reference);
      assert.equal(wi.segment, 'paid');
      assert.ok(JSON.parse(wi.source_detail).identity_confirmed_at, 'confirmed by code');
      // الرد الفوري بعد التأكيد بنبرة الأفراد والشركات
      const confirmReply = t.app.db.get("SELECT body FROM messages WHERE intake_id = ? AND automation_rule = 'identity_confirm'", wi.id);
      assert.ok(confirmReply && /وصلتنا رسالتكم/.test(confirmReply.body), confirmReply?.body);
      assert.ok(!PAID_BANNED_RE.test(confirmReply.body));
    } finally {
      f.restore();
      await t.close();
    }
  });

  test('shared number: tags decide; charity prefill and SITE_GREETING → charity; untagged → NULL; company sentence → paid + requester', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      const send = (from, text) => {
        t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from, text }));
        return lastIntake(t);
      };
      let i = send('201011110040', `${SEG.paidWaPrefill('rent')} المالك رافض يجدد العقد`);
      assert.deepEqual([i.segment, i.segment_source, i.topic], ['paid', 'wa_tag', 'rent']);
      i = send('201011110041', SEG.COMPANY_PREFILL);
      assert.deepEqual([i.segment, i.segment_source], ['paid', 'wa_tag']);
      i = send('201011110042', waPrefill('pen'));
      assert.deepEqual([i.segment, i.segment_source], ['charity', 'wa_tag']);
      i = send('201011110043', SITE_GREETING);
      assert.deepEqual([i.segment, i.segment_source], ['charity', 'wa_tag']);
      i = send('201011110044', 'عندي مشكلة ومحتاج حد يساعدني');
      assert.deepEqual([i.segment, i.segment_source], [null, null], 'rule g: NULL');
      // رسالة لاحقة بلا جملة من نفس العميل تُلحق بطلبه المفتوح
      const again = t.app.engine.receive({ channel: 'whatsapp', external_id: 'wamid.T.again', from_phone: '+201011110044', text: 'وكمان عندي ورق', line: t.app.segments.lineFor('PN123') });
      assert.equal(again.intake.id, i.id);
      // جملة الحجز على طلب «غير محدد» مفتوح تملؤه
      const tag = t.app.engine.receive({ channel: 'whatsapp', external_id: 'wamid.T.tag', from_phone: '+201011110044', text: SEG.paidWaPrefill('other'), line: t.app.segments.lineFor('PN123') });
      assert.equal(tag.intake.id, i.id);
      assert.deepEqual([intakeRow(t, i.id).segment, intakeRow(t, i.id).segment_source], ['paid', 'wa_tag']);
      // جملة الحجز من عميلة لها طلب خيري مفتوح ← طلب جديد «أفراد وشركات» + تنبيه «لها طلب آخر مفتوح»
      const c = send('201011110045', waPrefill('inh'));
      assert.equal(c.segment, 'charity');
      const n = send('201011110045', `${SEG.paidWaPrefill('custody')} عايزة استشارة`);
      assert.notEqual(n.id, c.id);
      assert.equal(n.segment, 'paid');
      const admin = await t.login('admin');
      const prop = await admin.get(`/api/admin/intakes/${n.id}/proposal`);
      assert.ok(prop.body.warnings.some((w) => w.code === 'other_open_request'));
    } finally {
      await t.close();
    }
  });

  test('a charity prefill on the dedicated paid number stays paid (the line wins)', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      configurePaid(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110050', text: waPrefill('inh') }));
      const i = lastIntake(t);
      assert.deepEqual([i.segment, i.segment_source], ['paid', 'wa_line']);
    } finally {
      await t.close();
    }
  });

  test('r2 S7 (L11-49): open charity item + paid-line message → attached with line_mismatch; no open item → new paid intake; REQ reference attaches', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      configurePaid(t);
      const admin = await t.login('admin');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110060', text: 'جوزي اتوفى وعايزة أعرف الورث' }));
      const c = lastIntake(t);
      const total = () => Number(t.app.db.value('SELECT COUNT(*) FROM intakes'));
      const n0 = total();
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110060', text: 'وعايزة كمان أسأل عن عقد إيجار محل' }));
      assert.equal(total(), n0, 'no stray intake');
      const m = t.app.db.get("SELECT intake_id, meta FROM messages WHERE direction = 'in' ORDER BY id DESC LIMIT 1");
      assert.equal(m.intake_id, c.id);
      assert.deepEqual(JSON.parse(m.meta).line_mismatch, { line: 'paid', item_segment: 'charity' });
      assert.equal(intakeRow(t, c.id).segment, 'charity', 'a dedicated line never overwrites a set segment');
      const det = await admin.get(`/api/admin/intakes/${c.id}`);
      assert.deepEqual(det.body.segment.line_mismatch, { line: 'paid', line_label: 'كتب على رقم الأفراد والشركات', item_segment: 'charity' });
      assert.deepEqual((await admin.get('/api/admin/intakes')).body.items.find((x) => x.id === c.id).line_mismatch, { line: 'paid' });
      // بلا عنصر مفتوح ← طلب جديد «أفراد وشركات»
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110061', text: 'استشارة في عقد عمل' }));
      assert.deepEqual([lastIntake(t).segment, total()], ['paid', n0 + 1]);
      // رقم الطلب في الرسالة على رقم الأفراد ← الطلب المذكور
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011110060', text: `بخصوص ${c.code} عندي سؤال` }));
      assert.equal(t.app.db.value("SELECT intake_id FROM messages WHERE direction = 'in' ORDER BY id DESC LIMIT 1"), c.id);
    } finally {
      await t.close();
    }
  });

  test('r2 S3 rule f: a returning client on a shared number keeps their side (100 days) but not after the window (400 days)', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      const old = (days, phone, seg) => {
        t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: phone, text: seg === 'paid' ? SEG.paidWaPrefill('inh') : waPrefill('inh') }));
        const i = lastIntake(t);
        const at = new Date(Date.now() - days * 86400000).toISOString();
        t.app.db.run("UPDATE intakes SET created_at = ?, status = 'archived' WHERE id = ?", at, i.id);
        return i;
      };
      old(100, '201011110070', 'paid');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110070', text: 'رجعت تاني عندي سؤال جديد' }));
      assert.deepEqual([lastIntake(t).segment, lastIntake(t).segment_source], ['paid', 'returning']);
      old(400, '201011110071', 'charity');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110071', text: 'رجعت تاني عندي سؤال جديد' }));
      assert.equal(lastIntake(t).segment, null);
    } finally {
      await t.close();
    }
  });

  test('isFactual ignores seg: buttons; storyWords strips the paid sentence', () => {
    assert.equal(isFactual({ reply: { id: 'seg:paid' } }, 'أفراد وشركات', {}), false);
    assert.equal(isFactual({}, SEG.paidWaPrefill('inh'), {}), false);
    assert.equal(isFactual({}, `${SEG.paidWaPrefill('inh')} أبويا اتوفى`, {}), true);
  });
});

// ═════════════════════════ الوراثة والتغيير (SS-4) ═════════════════════════
describe('v11 segment-server — inheritance and staff override (SS-4, §5.6, INV-15/17)', () => {
  async function nullIntake(t, phone = '201011110080') {
    // (العرض فيه رقم أفراد وشركات SIM-PAID: الرقم المشترك يتطلب إزالته أولًا)
    t.app.integrations.set('whatsapp', { segment: 'shared', paid_phone_number_id: '', paid_number: '' }, admin0(t), null, { confirm: true });
    t.app.settings.set('segment_returning_days', 0);
    t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: phone, text: PAID_STORY }));
    const i = lastIntake(t);
    assert.equal(i.segment, null);
    return i;
  }

  test('convert/accept: NULL without segment → 409 segment_required with the hint; a choice from NULL needs no reason; case and matter copy it', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const admin = await t.login('admin');
      const i = await nullIntake(t);
      let r = await admin.post(`/api/admin/intakes/${i.id}/convert`, { legal_area: 'COM', title: 'عقد توريد' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'segment_required');
      assert.equal(r.body.error, 'اختاروا نوع الخدمة أولًا.');
      assert.equal(r.body.details.hint.segment, 'paid');
      r = await admin.post(`/api/admin/intakes/${i.id}/accept`, { track: 'consultation', force: true, case: { legal_area: 'COM', title: 'عقد توريد' }, reply: { send: false } });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'segment_required');
      r = await admin.post(`/api/admin/intakes/${i.id}/accept`, { track: 'matter', force: true, segment: 'paid', case: { legal_area: 'COM', title: 'عقد توريد' }, matter: { kind: 'litigation' }, reply: { send: false } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const row = intakeRow(t, i.id);
      assert.deepEqual([row.segment, row.segment_source], ['paid', 'staff']);
      assert.equal(t.app.db.value('SELECT segment FROM cases WHERE id = ?', row.case_id), 'paid');
      assert.equal(t.app.db.value('SELECT segment FROM matters WHERE case_id = ?', row.case_id), 'paid');
      const act = t.app.db.get("SELECT * FROM activity WHERE type = 'segment.changed' AND intake_id = ?", i.id);
      assert.equal(JSON.parse(act.data).reason, 'تحديد نوع الخدمة');
      assert.equal(JSON.parse(act.data).hint_used, true);
      // اختيار مختلف عن قيمة محددة = تغيير مسجل «عند اعتماد القرار»
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110081', text: waPrefill('inh') }));
      const c = lastIntake(t);
      assert.equal(c.segment, 'charity');
      r = await admin.post(`/api/admin/intakes/${c.id}/convert`, { legal_area: 'INH', title: 'ميراث', segment: 'paid' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.case.segment, 'paid');
      const a2 = t.app.db.get("SELECT * FROM activity WHERE type = 'segment.changed' AND intake_id = ?", c.id);
      assert.equal(JSON.parse(a2.data).reason, 'عند اعتماد القرار');
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'segment.changed'"));
    } finally {
      await t.close();
    }
  });

  test('PUT /intakes/:id/segment: one tap from NULL, reason 3–300 from a set value, no-op, audit + activity, segment_on_case, permissions', async () => {
    const t = await startTestApp({ seed: 'demo', config: LIVE });
    try {
      const admin = await t.login('admin');
      const manager = await t.login('manager');
      const lawyer = await t.login('ahmed');
      const i = await nullIntake(t, '201011110090');
      const auditBefore = Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'segment.changed'")); // العرض فيه تغيير 306
      assert.equal((await lawyer.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'paid' })).status, 403);
      assert.equal((await t.client().put(`/api/admin/intakes/${i.id}/segment`, { segment: 'paid' })).status, 401);
      let r = await manager.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'bogus' });
      assert.equal(r.status, 400);
      r = await manager.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'paid' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual([r.body.value, r.body.source, r.body.unchanged], ['paid', 'staff', false]);
      assert.equal(r.body.set_by_name, manager.user.name);
      r = await manager.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'paid' });
      assert.equal(r.body.unchanged, true);
      r = await manager.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'charity' });
      assert.equal(r.status, 400);
      assert.equal(r.body.code, 'segment_reason_required');
      assert.equal(r.body.error, 'اكتبوا سبب التغيير.');
      r = await manager.put(`/api/admin/intakes/${i.id}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي', reason_code: 'not_eligible' });
      assert.equal(r.status, 200);
      const acts = t.app.db.all("SELECT summary, data FROM activity WHERE type = 'segment.changed' AND intake_id = ? ORDER BY id", i.id);
      assert.equal(acts.length, 2);
      assert.equal(acts[1].summary, `غيّر ${manager.user.name} نوع الخدمة من «أفراد وشركات» إلى «خيري»: أرملة ودخلها لا يكفي`);
      assert.equal(JSON.parse(acts[1].data).reason_code, 'not_eligible');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'segment.changed'")), auditBefore + 2);
      // لا إشارة تلقائية تغيّر ما حددته الإدارة (INV-15)
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011110090', text: SEG.paidWaPrefill('inh') }));
      assert.equal(intakeRow(t, i.id).segment, 'charity');
      // طلب صار ملفًا ← من صفحة الملف
      const conv = t.app.db.get("SELECT id, case_id FROM intakes WHERE case_id IS NOT NULL LIMIT 1");
      r = await admin.put(`/api/admin/intakes/${conv.id}/segment`, { segment: 'paid', reason: 'سبب كافٍ' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'segment_on_case');
      assert.deepEqual(r.body.details, { case_id: conv.case_id });
      // رسالة اختيارية للعميل تتبع قاعدة القناة (رقم موقع غير مؤكد ← صفحة المتابعة فقط)
      const web = await t.client().post('/api/public/intake', form({ phone: '01011110091' }));
      const wi = intakeByCode(t, web.body.reference);
      r = await admin.put(`/api/admin/intakes/${wi.id}/segment`, { segment: 'paid', reason: 'طلب استشارة بأتعاب', message: { send: true, text: t.app.segments.changeText('paid') } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(t.app.db.value('SELECT channel FROM messages WHERE id = ?', r.body.message_id), 'website');
    } finally {
      await t.close();
    }
  });

  test('PUT /cases/:id/segment: propagation, company_always_paid, segment_program_linked, fees_recorded (case manager 403, admin ok + affected_periods, snapshots untouched)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const manager = await t.login('manager');
      const db = t.app.db;
      const company = db.get('SELECT id FROM cases WHERE company_id IS NOT NULL LIMIT 1');
      let r = await admin.put(`/api/admin/cases/${company.id}/segment`, { segment: 'charity', reason: 'تجربة السبب' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'company_always_paid');
      const free = db.get("SELECT c.id, c.intake_id FROM cases c WHERE c.company_id IS NULL AND c.program_id IS NULL AND c.status != 'closed' AND NOT EXISTS (SELECT 1 FROM billable_events b WHERE b.case_id = c.id) AND NOT EXISTS (SELECT 1 FROM invoices i JOIN payments p ON p.invoice_id = i.id WHERE i.case_id = c.id OR i.matter_id IN (SELECT id FROM matters WHERE case_id = c.id)) AND c.intake_id IS NOT NULL LIMIT 1");
      r = await manager.put(`/api/admin/cases/${free.id}/segment`, { segment: 'paid' });
      assert.equal(r.status, 400, 'a case is never NULL: reason required');
      r = await manager.put(`/api/admin/cases/${free.id}/segment`, { segment: 'paid', reason: 'خارج برنامج الدعم' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.affected_periods, []);
      assert.equal(db.value('SELECT segment FROM intakes WHERE id = ?', free.intake_id), 'paid');
      assert.equal(db.value('SELECT segment_source FROM intakes WHERE id = ?', free.intake_id), 'staff');
      for (const m of db.all('SELECT segment FROM matters WHERE case_id = ?', free.id)) assert.equal(m.segment, 'paid');
      const prog = db.get("SELECT id FROM cases WHERE program_id IS NOT NULL AND company_id IS NULL AND segment = 'charity' LIMIT 1");
      if (prog) {
        r = await admin.put(`/api/admin/cases/${prog.id}/segment`, { segment: 'paid', reason: 'خارج برنامج الدعم' });
        assert.equal(r.status, 409);
        assert.equal(r.body.code, 'segment_program_linked');
      }
      const ev = db.get("SELECT b.case_id, b.period FROM billable_events b JOIN cases c ON c.id = b.case_id WHERE c.company_id IS NULL AND c.program_id IS NULL AND c.segment = 'charity' LIMIT 1");
      assert.ok(ev, 'demo has charity billable events');
      const snapBefore = JSON.stringify(db.all('SELECT id, segment FROM billable_events ORDER BY id'));
      const summaryBefore = JSON.stringify((await admin.get(`/api/admin/accounting/summary?period=${ev.period}`)).body);
      r = await manager.put(`/api/admin/cases/${ev.case_id}/segment`, { segment: 'paid', reason: 'خارج برنامج الدعم' });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'fees_recorded');
      assert.equal(r.body.error, 'سُجّلت أتعاب على هذا الملف؛ تغيير نوع الخدمة لمدير النظام فقط.');
      r = await admin.put(`/api/admin/cases/${ev.case_id}/segment`, { segment: 'paid', reason: 'خارج برنامج الدعم' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.affected_periods.includes(ev.period));
      assert.equal(JSON.stringify(db.all('SELECT id, segment FROM billable_events ORDER BY id')), snapBefore, 'snapshots untouched');
      assert.equal(JSON.stringify((await admin.get(`/api/admin/accounting/summary?period=${ev.period}`)).body), summaryBefore, 'closed periods identical');
      assert.equal((await (await t.login('ahmed')).put(`/api/admin/cases/${free.id}/segment`, { segment: 'charity', reason: 'سبب كافٍ' })).status, 403);
    } finally {
      await t.close();
    }
  });

  test('manual entry: segment from the staff form (default charity), source manual; split keeps the source segment (reference)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      let r = await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011110100', text: 'مكالمة بخصوص عقد شركة', segment: 'paid' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.deepEqual([r.body.segment, r.body.segment_source], ['paid', 'manual']);
      r = await admin.post('/api/admin/intakes', { channel: 'walk_in', phone: '01011110101', text: 'حضرت بخصوص معاش' });
      assert.deepEqual([r.body.segment, r.body.segment_source], ['charity', 'manual']);
      assert.equal((await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011110102', text: 'x y z', segment: 'x' })).status, 400);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ واجهات الإدارة (SS-5) ═════════════════════════
describe('v11 segment-server — staff read APIs (SS-5, §5.6)', () => {
  test('inbox: segment filter composes, segment_counts = open intakes under the other filters, item fields', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const c = t.client();
      const paidWebBefore = (await admin.get('/api/admin/intakes?segment=paid&channel=website')).body.total; // العرض فيه طلبات 302/303
      await c.post('/api/public/intake', form({ segment: 'paid', phone: '01011110110' }));
      await c.post('/api/public/intake', form({ segment: 'paid', phone: '01011110111', description: PAID_STORY }));
      t.app.db.run("UPDATE intakes SET segment = NULL WHERE id = (SELECT MAX(id) FROM intakes WHERE segment = 'charity' AND status IN ('new','in_review','awaiting_client'))");
      const all = await admin.get('/api/admin/intakes');
      const sc = all.body.segment_counts;
      assert.equal(sc.charity + sc.paid + sc.unset, all.body.total, 'counts add up to the open list');
      for (const seg of ['charity', 'paid', 'unset']) {
        const r = await admin.get(`/api/admin/intakes?segment=${seg}`);
        assert.equal(r.body.total, sc[seg], seg);
        assert.deepEqual(r.body.segment_counts, sc, 'counts ignore the segment filter itself');
        for (const it of r.body.items) assert.equal(it.segment, seg === 'unset' ? null : seg);
      }
      const it = all.body.items[0];
      for (const k of ['segment', 'segment_source', 'segment_hint', 'wa_line', 'line_mismatch', 'requester_kind']) assert.ok(k in it, k);
      const ch = await admin.get('/api/admin/intakes?segment=paid&channel=website');
      assert.equal(ch.body.total, paidWebBefore + 2);
    } finally {
      await t.close();
    }
  });

  test('detail and proposal: segment block, tone, send_line, segment_required, eligibility_warning', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const c = t.client();
      const r = await c.post('/api/public/intake', form({ phone: '01011110120', description: 'عندي سؤال عن إعلام الوراثة وإيه الورق المطلوب' }));
      const i = intakeByCode(t, r.body.reference);
      const det = await admin.get(`/api/admin/intakes/${i.id}`);
      const b = det.body.segment;
      assert.deepEqual([b.value, b.label, b.source, b.source_label, b.can_change, b.block], ['charity', 'خيري', 'website_default', 'الموقع بدون اختيار — خيري افتراضيًا', true, null]);
      assert.equal(det.body.tone, 'charity');
      assert.deepEqual(det.body.send_line, { key: 'portal', label: 'صفحة المتابعة فقط — الرقم غير مؤكد' });
      const p = await admin.get(`/api/admin/intakes/${i.id}/proposal`);
      assert.deepEqual([p.body.segment, p.body.tone, p.body.segment_required, p.body.eligibility_warning], ['charity', 'charity', false, true]);
      assert.equal(p.body.eligibility_text, 'لم تُسجَّل بيانات الأسرة — تأكدوا من الاستحقاق');
      assert.ok(p.body.send_line);
      const pr = await c.post('/api/public/intake', form({ phone: '01011110121', segment: 'paid' }));
      const pp = await admin.get(`/api/admin/intakes/${intakeByCode(t, pr.body.reference).id}/proposal`);
      assert.deepEqual([pp.body.tone, pp.body.eligibility_warning], ['paid', false]);
    } finally {
      await t.close();
    }
  });

  test('cases/matters: segment filter (خيري/أفراد/شركات mapping), item field, detail block, paid fees, fees_not_agreed warning', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      const all = (await admin.get('/api/admin/cases?limit=500')).body;
      const charity = (await admin.get('/api/admin/cases?segment=charity&limit=500')).body;
      const paidB2c = (await admin.get('/api/admin/cases?segment=paid&line=b2c&limit=500')).body;
      const b2b = (await admin.get('/api/admin/cases?line=b2b&limit=500')).body;
      assert.equal(charity.total + paidB2c.total + b2b.total, all.total);
      for (const x of b2b.items) assert.equal(x.segment, 'paid');
      for (const x of charity.items) assert.equal(x.segment, 'charity');
      const co = await admin.get(`/api/admin/cases/${b2b.items[0].id}`);
      assert.deepEqual([co.body.segment.value, co.body.segment.label, co.body.segment.can_change, co.body.segment.block], ['paid', 'شركة', false, 'company_always_paid']);
      // ملف أفراد بلا أتعاب متفق عليها: تنبيه لا يمنع الإسناد
      const cid = db.value("SELECT id FROM cases WHERE company_id IS NULL AND status != 'closed' AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.case_id = cases.id AND a.role = 'lead' AND a.status != 'withdrawn') LIMIT 1");
      db.run("UPDATE cases SET segment = 'paid' WHERE id = ?", cid);
      const d = await admin.get(`/api/admin/cases/${cid}`);
      assert.deepEqual(d.body.fees, { invoices: 0, agreed: false });
      assert.equal(d.body.tone, 'paid');
      const lawyerId = db.value("SELECT id FROM users WHERE username = 'tarek'");
      const r = await admin.post(`/api/admin/cases/${cid}/assignments`, { lawyer_id: lawyerId, role: 'lead', brief: 'دراسة العقد وإبداء الرأي' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.ok(r.body.warning_codes.includes('fees_not_agreed'));
      assert.ok(r.body.warnings.includes('لم يوافق العميل على الأتعاب بعد'));
      const ms = (await admin.get('/api/admin/matters?segment=paid')).body;
      for (const m of ms) assert.equal(m.segment, 'paid');
      const mid = db.value('SELECT id FROM matters LIMIT 1');
      const md = await admin.get(`/api/admin/matters/${mid}`);
      assert.equal(md.body.segment.can_change, false);
      // SS-7b: الأتعاب على الملف نفسه (التحقق كما في فواتير الملف المستمر)
      assert.equal((await admin.post(`/api/admin/cases/${cid}/invoices`, {})).status, 400);
    } finally {
      await t.close();
    }
  });

  test('dashboard: segments block + charity-only month + month.paid (r2 S9/S10); analytics segment param; accounting paid_individuals', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const before = (await admin.get('/api/admin/dashboard')).body;
      const c = t.client();
      await c.post('/api/public/intake', form({ segment: 'paid', phone: '01011110130' }));
      const after = (await admin.get('/api/admin/dashboard')).body;
      assert.equal(after.segments.paid.open, before.segments.paid.open + 1);
      assert.equal(after.segments.paid.unconfirmed_wa, before.segments.paid.unconfirmed_wa + 1);
      const list = (await admin.get('/api/admin/intakes')).body.segment_counts;
      assert.deepEqual([after.segments.charity.open, after.segments.paid.open, after.segments.unset_open], [list.charity, list.paid, list.unset]);
      // ملف أفراد هذا الشهر لا يدخل ملخص الخيري
      const cid = t.app.db.value("SELECT id FROM cases WHERE company_id IS NULL AND substr(created_at, 1, 7) = ? LIMIT 1", after.month.period);
      if (cid) {
        t.app.db.run("UPDATE cases SET segment = 'paid' WHERE id = ?", cid);
        const m2 = (await admin.get('/api/admin/dashboard')).body.month;
        assert.equal(m2.cases_opened, after.month.cases_opened - 1);
        assert.equal(m2.paid.cases_opened, after.month.paid.cases_opened + 1);
      }
      assert.equal(after.cases_scope_label, 'يشمل الخيري والأفراد');
      const fAll = (await admin.get('/api/admin/analytics/funnel')).body;
      const fCh = (await admin.get('/api/admin/analytics/funnel?segment=charity')).body;
      const fPd = (await admin.get('/api/admin/analytics/funnel?segment=paid')).body;
      assert.equal(fAll.scope_label, 'يشمل الخيري والأفراد');
      assert.equal(fCh.scope_label, undefined);
      assert.ok(fCh.totals.intakes + fPd.totals.intakes <= fAll.totals.intakes);
      const areas = (await admin.get('/api/admin/analytics/areas?segment=paid')).body;
      assert.equal(areas.segment, 'paid');
      const acc = (await admin.get('/api/admin/accounting/summary')).body;
      assert.ok(acc.totals.paid_individuals && 'events' in acc.totals.paid_individuals);
      assert.ok(acc.lawyers.every((l) => l.paid_individuals));
    } finally {
      await t.close();
    }
  });

  test('notifications carry the segment; /api/meta exposes labels only', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const r = await t.client().post('/api/public/intake', form({ segment: 'paid', phone: '01011110140', callback: 'morning' }));
      const n = (await admin.get('/api/notifications')).body.items;
      assert.ok(n.some((x) => x.type === 'intake.new' && x.title === `طلب وارد جديد ${r.body.reference} · أفراد وشركات · عبر الموقع الإلكتروني`), JSON.stringify(n.map((x) => x.title)));
      assert.ok(n.some((x) => x.type === 'client.callback' && x.title.endsWith(' · أفراد وشركات')));
      const meta = (await t.client().get('/api/meta')).body;
      assert.deepEqual(meta.constants.LABELS.segment, LABELS.segment);
      assert.ok(!('segments' in meta) && !('wa_lines' in meta));
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ الخصوصية (INV-02/03) ═════════════════════════
describe('v11 segment-server — privacy: lawyers and companies see no segment (INV-02, INV-03)', () => {
  test('every lawyer GET on demo data (all requests, files and matters set to paid): no segment key and no segment words', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      db.run("UPDATE cases SET segment = 'paid'");
      db.run("UPDATE matters SET segment = 'paid'");
      db.run("UPDATE intakes SET segment = 'paid', segment_source = 'staff'");
      const routes = t.app.router.routes.filter((r) => r.method === 'GET' && r.pattern.startsWith('/api/lawyer/'));
      assert.ok(routes.length > 5);
      const words = /خيري|مدفوع|أفراد وشركات|غير محدد/;
      const bad = [];
      let seen = 0;
      for (const username of ['ahmed', 'hany', 'tarek']) {
        const lawyer = await t.login(username);
        const uid = db.value('SELECT id FROM users WHERE username = ?', username);
        const ids = {
          assignments: db.all('SELECT id FROM assignments WHERE lawyer_id = ?', uid).map((x) => x.id),
          matters: db.all('SELECT id FROM matters WHERE responsible_lawyer_id = ?', uid).map((x) => x.id),
        };
        for (const r of routes) {
          const list = /matters/.test(r.pattern) ? ids.matters : /assignments/.test(r.pattern) ? ids.assignments : [1];
          for (const id of (list.length ? list : [1]).slice(0, 4)) {
            const url = r.pattern.replace(/:(\w+)/g, String(id));
            const res = await lawyer.get(url);
            if (res.status !== 200) continue;
            seen++;
            const str = JSON.stringify(res.body);
            if (/"segment(_[a-z]+)?"\s*:|"wa_line"|"wa_pid"/.test(str)) bad.push(`${username} ${url} key`);
            if (words.test(str)) bad.push(`${username} ${url} words`);
          }
        }
      }
      assert.ok(seen > 15, `lawyer endpoints reached (${seen})`);
      assert.deepEqual(bad, []);
    } finally {
      await t.close();
    }
  });

  test('company portal GETs gain nothing (no segment / wa_line keys) for a signed-in company user', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const login = await fetch(`${t.base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mariam@nilefoods.example', password: 'Company@2026' }) });
      const cookie = `bm_csid=${/bm_csid=([^;]+)/.exec(login.headers.get('set-cookie') || '')?.[1]}`;
      assert.equal(login.status, 200);
      const companyId = t.app.db.value("SELECT company_id FROM company_users WHERE email = 'mariam@nilefoods.example'");
      const codes = t.app.db.all('SELECT code FROM company_requests WHERE company_id = ? LIMIT 3', companyId).map((r) => r.code);
      const routes = t.app.router.routes.filter((r) => r.method === 'GET' && r.pattern.startsWith('/api/company/'));
      let seen = 0;
      const bad = [];
      for (const r of routes) {
        for (const code of codes.length ? codes : ['NFD-9999']) {
          const url = r.pattern.replace(':code', code).replace(/:(\w+)/g, '1');
          const res = await fetch(`${t.base}${url}`, { headers: { cookie } });
          if (res.status === 200) seen++;
          const s = await res.text();
          if (/"segment(_[a-z]+)?"\s*:|"wa_line"|"wa_pid"/.test(s)) bad.push(url);
        }
      }
      assert.ok(seen > 5, 'signed in');
      assert.deepEqual(bad, []);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ نصوص بالنبرة (أساس SS-7) ═════════════════════════
describe('v11 segment-server — tone, text and template purpose helpers', () => {
  test('tone/text/templatePurpose/paidStaffLines', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const s = t.app.segments;
      assert.equal(s.tone({ segment: 'charity' }), 'charity');
      assert.equal(s.tone({ segment: 'paid' }), 'paid');
      assert.equal(s.tone({ segment: null }), 'neutral');
      assert.equal(s.tone({ segment: 'charity', company_id: 3 }), 'paid');
      assert.equal(s.text('story_ack', 'charity'), CLIENT_TEXTS.story_ack);
      assert.equal(s.text('story_ack', 'paid'), CLIENT_TEXTS_PAID.story_ack);
      assert.equal(s.text('story_ack', 'neutral'), CLIENT_TEXTS_PAID.story_ack_neutral);
      assert.equal(s.text('story_welcome', 'neutral'), null, 'the welcome list never goes out in neutral tone');
      assert.equal(s.text('otp', 'paid'), CLIENT_TEXTS.otp);
      assert.equal(s.text('no_such_key', 'paid'), null, 'paid never falls back to charity');
      assert.equal(s.templatePurpose('case_update', 'charity'), 'case_update');
      assert.equal(s.templatePurpose('case_update', 'paid'), 'portal_update');
      assert.equal(s.templatePurpose('survey', 'paid'), null, 'the charity survey is never sent to a paid client');
      t.app.db.run("INSERT INTO wa_template_mappings (purpose, template_name, language, params, updated_at) VALUES ('case_update@paid', 'paid_update', 'ar', '[]', ?)", new Date().toISOString());
      assert.equal(s.templatePurpose('case_update', 'paid'), 'case_update@paid');
      assert.deepEqual(paidStaffLines(['الموضوع: ورث', 'المتوفى: الزوج', 'المتوفى: الأب']), ['الموضوع: ورث', 'المتوفى: الزوج أو الزوجة', 'المتوفى: الأب']);
      // نفس التصنيف المحلي للجانبين (لا يعتمد على نوع الخدمة أصلًا)
      assert.deepEqual(analyzeIntake(STORY), analyzeIntake(STORY));
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ build-2: نفس التحليل (SS-6) ═════════════════════════
/** بصمة طلب تحليل Claude في 10.0 لنفس المدخل (من شجرة git HEAD = 10.0: scratchpad/v11-pw-server/hash-analysis.mjs) */
const V10_ANALYSIS_HASH = '0826342c730672dc327aa59b751d776fa718bd2a2d38e583d9d83bdbe2a02dbf';
const HASH_INPUT = { text: 'جوزي اتوفى من 4 شهور وكان شغال في مصنع ومتأمن عليه، ومكتب التأمينات رفض يصرف المعاش', governorate: 'القاهرة', channel: 'واتساب', topic: 'المعاش', form: 'f', voice: { total: 1, done: 1, missing: 0 } };
/** نسخة وهمية من @anthropic-ai/sdk تسجل كل طلب؛ out(params) = مخرجات النموذج (JSON) */
function fakeClaude(out = () => ({})) {
  const calls = [];
  class Fake {
    constructor() {
      this.beta = { messages: { create: async (p) => { calls.push(p); return { model: p.model, stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(out(p)) }] }; } } };
    }
  }
  setSdkLoader(() => Fake);
  return calls;
}
const reqHash = (c) => crypto.createHash('sha256').update(JSON.stringify({ system: c.system, messages: c.messages, schema: c.output_config.format.schema })).digest('hex');
const userText = (c) => (typeof c.messages[0].content === 'string' ? c.messages[0].content : JSON.stringify(c.messages[0].content));
const isAnalysis = (c) => !!c.output_config?.format?.schema?.properties?.legal_area;
const CLASS_KEYS = ['legal_area', 'confidence', 'secondary_areas', 'urgency', 'missing_info', 'information_sufficient', 'suggested_issues', 'recommended_track', 'track_reason', 'facts', 'title', 'summary'];
const pickClass = (o) => Object.fromEntries(CLASS_KEYS.map((k) => [k, o[k]]));

describe('v11 segment-server — same analysis (SS-6, INV-14, L11-23)', () => {
  test('the local analysis classifies one story identically as «خيري», «أفراد وشركات» and «غير محدد»; the hint never writes segment', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112001', text: STORY }));
      const a = lastIntake(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112002', text: `${SEG.paidWaPrefill()} ${STORY}` }));
      const b = lastIntake(t);
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112003', text: STORY }));
      const c = lastIntake(t);
      assert.deepEqual([a.segment, b.segment, c.segment], ['charity', 'paid', null]);
      const outs = [];
      for (const i of [a, b, c]) outs.push((await t.app.ai.analyzeIntake(i.id)).output);
      assert.deepEqual(pickClass(outs[1]), pickClass(outs[0]), 'paid = charity classification');
      assert.deepEqual(pickClass(outs[2]), pickClass(outs[0]), 'NULL = charity classification');
      for (const i of [a, b, c]) assert.equal(intakeRow(t, i.id).segment, i.segment, 'analysis never writes segment');
      // اقتراح «غير محدد» (محليًا هنا) في segment_hint وفي مخرجات التحليل — ولا يُطبَّق
      const stored = intakeRow(t, c.id).segment_hint;
      assert.deepEqual(stored ? { segment: JSON.parse(stored).segment, reasons: JSON.parse(stored).reasons, source: 'local' } : null, outs[2].segment_hint);
      assert.ok(!('segment_hint' in outs[0]), 'no hint field for a set segment');
    } finally {
      await t.close();
    }
  });

  test('Claude request: charity is byte-identical to 10.0 (hash); paid adds exactly one header line at the same form; NULL adds the hint line and schema', async () => {
    const calls = fakeClaude();
    try {
      const p = createAnthropicProvider({ apiKey: 'sk-ant-test', model: 'claude-opus-4-6', orgName: () => 'إمام' });
      await p.analyzeIntake({ ...HASH_INPUT });
      await p.analyzeIntake({ ...HASH_INPUT, audience: 'charity' });
      await p.analyzeIntake({ ...HASH_INPUT, audience: 'paid' });
      await p.analyzeIntake({ ...HASH_INPUT, audience: null });
      assert.equal(reqHash(calls[0]), V10_ANALYSIS_HASH, 'no audience = the 10.0 request');
      assert.equal(reqHash(calls[1]), V10_ANALYSIS_HASH, 'charity = the 10.0 request');
      const [charity, paid, unset] = [userText(calls[1]), userText(calls[2]), userText(calls[3])];
      assert.equal(paid, charity.replace('\n\nرسائل المستفيد', `\n${PAID_AUDIENCE_LINE}\n\nرسائل المستفيد`), 'exactly one extra header line');
      assert.match(paid, /صيغة مخاطبتها: مؤنث/, 'same address form');
      assert.deepEqual(calls[2].system, calls[1].system);
      assert.deepEqual(calls[2].output_config.format.schema, calls[1].output_config.format.schema);
      assert.equal(unset, charity.replace('\n\nرسائل المستفيد', `\n${UNSET_AUDIENCE_LINE}\n\nرسائل المستفيد`));
      assert.ok(calls[3].output_config.format.schema.properties.segment_hint, 'NULL: hint schema');
      assert.ok(!calls[1].output_config.format.schema.properties.segment_hint);
      // اقتراح الرد والنسخة الموجهة للعميل: سطر الأسلوب للأفراد والشركات فقط
      await p.suggestReplies({ intent: 'answer', reference: 'REQ-1' });
      await p.suggestReplies({ intent: 'answer', reference: 'REQ-1', audience: 'paid' });
      assert.ok(!/حضرتكم»\)، بلا «ببلاش/.test(userText(calls[4])));
      assert.match(userText(calls[5]), /أسلوب الخطاب: عميل خدمات الأفراد والشركات/);
    } finally {
      setSdkLoader(null);
    }
  });

  test('app path with Claude: charity intakes keep the 10.0 header; paid intakes add the line once; paid staff wording never reaches the request; a Claude NULL hint is stored, never applied, and staff choice is fed back', async () => {
    const calls = fakeClaude((p) => (p.output_config?.format?.schema?.properties?.segment_hint ? { segment_hint: { segment: 'paid', reasons: ['ذكر شركة وعقد توريد'] } } : {}));
    const t = await startTestApp({ seed: 'none', config: { ...LIVE, ai: { provider: 'auto', anthropicApiKey: '' } } });
    try {
      t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000' }, null);
      const c = t.client();
      // طلبان من الموقع بنفس الاختيارات (المتوفى: الزوج) — خيري وأفراد وشركات
      const answers = { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' };
      let r = await c.post('/api/public/intake', form({ phone: '01011112011', topic: 'inh', answers, segment: 'charity' }));
      const ch = intakeByCode(t, r.body.reference);
      r = await c.post('/api/public/intake', form({ phone: '01011112012', topic: 'inh', answers, segment: 'paid' }));
      const pd = intakeByCode(t, r.body.reference);
      calls.length = 0;
      await t.app.ai.analyzeIntake(ch.id, null, { noSlot: true });
      await t.app.ai.analyzeIntake(pd.id, null, { noSlot: true });
      const [cReq, pReq] = calls.filter(isAnalysis).map(userText);
      assert.ok(cReq && pReq, 'two Claude analysis requests');
      assert.ok(!cReq.includes('نوع الخدمة'), 'charity: no audience line');
      assert.equal(pReq.split(PAID_AUDIENCE_LINE).length, 2, 'paid: the line exactly once');
      assert.ok(!pReq.includes('الزوج أو الزوجة'), 'paidStaffLines never in the request');
      // العرض للإدارة فقط: «الزوج أو الزوجة» لطلب الأفراد والشركات
      assert.ok(t.app.stories.formOf(intakeRow(t, pd.id)).lines.includes('المتوفى: الزوج أو الزوجة'));
      assert.ok(t.app.stories.formOf(intakeRow(t, ch.id)).lines.includes('المتوفى: الزوج'));
      // «غير محدد»: اقتراح Claude يُحفظ ولا يُطبَّق، واختيار الإدارة يُسجَّل في أداء الذكاء الاصطناعي
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112013', text: PAID_STORY }));
      const n = lastIntake(t);
      assert.equal(n.segment, null);
      await t.app.ai.analyzeIntake(n.id, null, { noSlot: true });
      const row = intakeRow(t, n.id);
      assert.equal(row.segment, null, 'INV-04: never applied');
      assert.deepEqual(JSON.parse(row.segment_hint), { segment: 'paid', reasons: ['ذكر شركة وعقد توريد'], source: 'ai' });
      const admin = await t.login('admin');
      r = await admin.put(`/api/admin/intakes/${n.id}/segment`, { segment: 'paid' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const fb = t.app.db.get("SELECT * FROM ai_feedback WHERE field = 'segment' AND entity_id = ?", n.id);
      assert.deepEqual([fb.verdict, fb.ai_value, fb.final_value], ['accepted', 'paid', 'paid']);
    } finally {
      setSdkLoader(null);
      await t.close();
    }
  });

  test('paid «refer» never names a charity programme; the paid drafts speak in polite plural (story_accepted, questions, refer)', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const REFER = 'محتاجه فلوس لمصاريف عمليه ابني ومش لاقيه حد يساعدني';
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112021', text: REFER }));
      const ch = lastIntake(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011112022', text: `${SEG.paidWaPrefill()} ${REFER}` }));
      const pd = lastIntake(t);
      assert.equal(pd.segment, 'paid');
      const co = (await t.app.ai.analyzeIntake(ch.id)).output;
      const po = (await t.app.ai.analyzeIntake(pd.id)).output;
      assert.equal(co.recommended_track, 'refer');
      assert.equal(po.recommended_track, 'refer', 'same track');
      const label = DEFAULT_SETTINGS.story_referrals[0].label;
      assert.equal(co.request_draft.referral_target, label);
      assert.equal(po.request_draft.referral_target, null, 'no charity programme for paid');
      assert.equal(po.request_draft.reply_to_her, CLIENT_TEXTS_PAID.story_refer_generic);
      const prop = t.app.stories.proposal(pd.id);
      assert.equal(prop.tone, 'paid');
      for (const k of ['consultation', 'matter', 'refer', 'need_info']) {
        const txt = prop.drafts[k].reply.text;
        assert.ok(!PAID_BANNED_RE.test(txt), `${k}: ${txt}`);
        assert.ok(!txt.includes(label), k);
      }
      assert.match(prop.drafts.consultation.reply.text, /^مرحبًا بكم، تم تسجيل الطلب رقم \d+/);
      assert.match(prop.drafts.need_info.reply.text, /نحتاج إلى معرفة ما يلي/);
      const cp = t.app.stories.proposal(ch.id);
      assert.match(cp.drafts.consultation.reply.text, /^أهلًا بيكي/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ build-2: المال والتقارير (SS-7، SS-7b) ═════════════════════════
async function paidCase(admin, phone, { area = 'CIV', title = 'نزاع مع مقاول على تشطيب شقة' } = {}) {
  let r = await admin.post('/api/admin/intakes', { channel: 'phone', phone, text: 'عميل يطلب استشارة بأتعاب في نزاع مع مقاول على تشطيب شقة', segment: 'paid' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const intakeId = r.body.id;
  r = await admin.post(`/api/admin/intakes/${intakeId}/convert`, { legal_area: area, title });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.case.segment, 'paid');
  return { intakeId, caseId: r.body.case.id };
}
const userRow = (t, u) => t.app.db.get('SELECT * FROM users WHERE username = ?', u);
/** إسناد معتمد مباشرة (اختبار فقط) ثم واقعة الاستحقاق كما يسجلها اعتماد الرأي */
function approveAndBill(t, assignmentId) {
  t.app.db.run("UPDATE assignments SET status = 'approved', approved_at = ? WHERE id = ?", new Date().toISOString(), assignmentId);
  return t.app.accounting.recordBillableEvent(assignmentId, 'on_approval');
}

describe('v11 segment-server — money, reports and case fees (SS-7, SS-7b, L11-24, INV-13)', () => {
  test('paid work is payable at «سعر العمل المدفوع» (never pro bono/CSR/package); fee_mode pro_bono → 409; programme link → 409; zero rate warns', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const { caseId } = await paidCase(admin, '01011113001');
      const tarek = userRow(t, 'tarek'); // csr agreement, b2b_rate 1500
      const salwa = userRow(t, 'salwa'); // pro bono, no paid rate
      let r = await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: salwa.id, role: 'lead', fee_mode: 'pro_bono', brief: 'رأي في النزاع' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'paid_case_pro_bono');
      assert.equal(r.body.error, 'العمل المدفوع لا يُسجَّل تطوعيًا.');
      r = await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: tarek.id, role: 'lead', brief: 'رأي في النزاع' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const lead = r.body.assignment;
      r = await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: salwa.id, role: 'specialist', brief: 'مراجعة' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.ok(r.body.warning_codes.includes('paid_rate_missing'));
      assert.ok(r.body.warnings.some((w) => w.startsWith(`ملف مدفوع: المحامي ${salwa.name} متطوع وليس له سعر للعمل المدفوع`)));
      const spec = r.body.assignment;
      r = await admin.patch(`/api/admin/assignments/${spec.id}`, { fee_mode: 'pro_bono' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'paid_case_pro_bono');
      const ev = approveAndBill(t, lead.id);
      assert.deepEqual([ev.treatment, ev.amount_minor, ev.segment], ['payable', 150000, 'paid']);
      assert.equal(t.app.db.value('SELECT segment FROM ledger_entries WHERE billable_event_id = ?', ev.id), 'paid');
      const ev2 = approveAndBill(t, spec.id);
      assert.deepEqual([ev2.treatment, ev2.amount_minor, ev2.notional_minor], ['payable', 0, 0], 'never notional pro bono');
      assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'billing.paid_rate_missing'"));
      const prog = t.app.db.get("SELECT id FROM programs WHERE status != 'closed' LIMIT 1");
      r = await admin.put(`/api/programs/case/${caseId}`, { program_id: prog.id });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'paid_case_program');
      assert.equal(r.body.error, 'ملف مدفوع لا يُربط ببرنامج تمويل.');
    } finally {
      await t.close();
    }
  });

  test('INV-S1: charity reports are identical before and after paid individual work (accepted, approved, invoiced, paid, closed)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      const period = periodOf(new Date().toISOString()); // v11 gate fixer-server (R-03, intended): فترات القيود بتوقيت القاهرة
      const snap = async () => {
        const acc = (await admin.get(`/api/admin/accounting/summary?period=${period}`)).body;
        const dash = (await admin.get('/api/admin/dashboard')).body;
        const { paid: _paid, ...month } = dash.month;
        const programmes = [];
        for (const p of db.all('SELECT id FROM programs ORDER BY id')) {
          const doc = (await admin.get(`/api/print/programme/${p.id}`)).body;
          delete doc.generated_at;
          delete doc.date;
          programmes.push(doc);
        }
        const impact = (await admin.get('/api/admin/impact?from=2020-01-01&to=2030-12-31')).body;
        delete impact.generated_at;
        return JSON.stringify({
          impact,
          programmes,
          csr: acc.lawyers.map((l) => [l.lawyer_id, l.csr, l.contribution_value]),
          pro_bono_events: acc.totals.pro_bono_events,
          contribution_value: acc.totals.contribution_value,
          closed: acc.closed_cases,
          by_area: acc.by_area,
          export: (await admin.download('/api/admin/data/export/clients')).body,
          funnel: (await admin.get('/api/admin/analytics/funnel?segment=charity')).body,
          month,
          programmes_totals: (await admin.get('/api/programs')).body.totals, // v11 gate fixer-server (J-01, intended): «ملفات مفتوحة دون برنامج»
        });
      };
      freezeClock(new Date().toISOString());
      const before = await snap();
      const monthPaidBefore = (await admin.get('/api/admin/dashboard')).body.month.paid;
      // عمل أفراد وشركات كامل: قبول، إسناد معتمد، أتعاب مقبولة ومدفوعة، إغلاق
      const { caseId } = await paidCase(admin, '01011113011');
      const tarek = userRow(t, 'tarek');
      const lead = (await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: tarek.id, role: 'lead', brief: 'رأي' })).body.assignment;
      approveAndBill(t, lead.id);
      const inv = (await admin.post(`/api/admin/cases/${caseId}/invoices`, { amount: 2000, due_at: '2030-01-01T00:00:00.000Z' })).body.invoice;
      t.app.matters.addPayment(inv.id, { amount: 2000 }, userRow(t, 'admin'));
      db.run("UPDATE cases SET status = 'closed', closed_at = ? WHERE id = ?", new Date().toISOString(), caseId);
      // وطلب أفراد وشركات من الموقع (عميل جديد)
      await t.client().post('/api/public/intake', form({ segment: 'paid', phone: '01011113012', description: PAID_STORY }));
      const after = await snap();
      assert.equal(after, before, 'charity reports byte-identical');
      const monthPaid = (await admin.get('/api/admin/dashboard')).body.month.paid;
      assert.equal(monthPaid.cases_opened, monthPaidBefore.cases_opened + 1);
      assert.equal(monthPaid.cases_closed, monthPaidBefore.cases_closed + 1);
      assert.equal(monthPaid.lawyer_cost, monthPaidBefore.lawyer_cost + 1500);
      const acc = (await admin.get(`/api/admin/accounting/summary?period=${period}`)).body;
      const row = acc.lawyers.find((l) => l.lawyer_id === tarek.id);
      assert.equal(row.paid_individuals.events, 1);
      assert.equal(row.paid_individuals.period_amount, 1500);
      assert.equal(acc.totals.paid_individuals.events, 1);
      const dash = (await admin.get('/api/admin/dashboard')).body;
      assert.ok(dash.segments.paid.revenue_month >= 2000, 'admin sees the paid revenue of the month');
      const mdash = (await (await t.login('manager')).get('/api/admin/dashboard')).body;
      assert.ok(!('revenue_month' in mdash.segments.paid), 'revenue is admin-only');
      assert.ok(Number.isInteger(dash.segments.ineligible_overrides));
    } finally {
      resetClock();
      await t.close();
    }
  });

  test('case fee invoice (r2 P5): charity 409, company 409, paid → row on /p/ with the agreement flow; agreed → no fees warning; payments make overrides admin-only', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const manager = await t.login('manager');
      const db = t.app.db;
      const charity = db.get("SELECT id FROM cases WHERE company_id IS NULL AND segment = 'charity' AND status != 'closed' LIMIT 1");
      let r = await admin.post(`/api/admin/cases/${charity.id}/invoices`, { amount: 500, due_at: '2030-01-01T00:00:00.000Z' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'charity_case_fee');
      assert.equal(r.body.error, 'ملف خيري؛ الأتعاب للأفراد والشركات فقط.');
      const company = db.get('SELECT id FROM cases WHERE company_id IS NOT NULL LIMIT 1');
      r = await admin.post(`/api/admin/cases/${company.id}/invoices`, { amount: 500, due_at: '2030-01-01T00:00:00.000Z' });
      assert.equal(r.status, 409);
      assert.equal(r.body.code, 'company_case_use_billing');
      assert.equal((await (await t.login('ahmed')).post(`/api/admin/cases/${charity.id}/invoices`, { amount: 1 })).status, 403);
      const { caseId } = await paidCase(admin, '01011113021');
      r = await manager.post(`/api/admin/cases/${caseId}/invoices`, { amount: 1800, due_at: '2030-01-01T00:00:00.000Z' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const inv = r.body.invoice;
      assert.deepEqual([inv.description, inv.amount, inv.matter_id, inv.case_id], ['أتعاب استشارة قانونية', 1800, null, caseId]);
      assert.deepEqual(r.body.invoice.fees, { invoices: 1, agreed: false });
      assert.ok(db.get("SELECT 1 FROM security_events WHERE type = 'segment.case_fee'"));
      // صفحة المتابعة: الفاتورة بزر الموافقة، ونوع خدمتها ونبرة الصفحة
      const cid = db.value('SELECT client_id FROM cases WHERE id = ?', caseId);
      const token = t.app.clients.issuePortalToken(cid);
      let p = (await t.client().get(`/api/portal/${token}`)).body;
      const pinv = p.invoices.find((x) => x.number === inv.number);
      assert.equal(pinv.needs_agreement, true);
      assert.equal(pinv.segment, 'paid');
      assert.equal(p.tone, 'paid');
      r = await t.client().post(`/api/portal/${token}/invoices/${inv.number}/response`, { answer: 'agree' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual((await admin.get(`/api/admin/cases/${caseId}`)).body.fees, { invoices: 1, agreed: true });
      r = await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: userRow(t, 'tarek').id, role: 'lead', brief: 'رأي' });
      assert.ok(!r.body.warning_codes.includes('fees_not_agreed'));
      t.app.matters.addPayment(inv.id, { amount: 500 }, userRow(t, 'admin'));
      r = await manager.put(`/api/admin/cases/${caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' });
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'fees_recorded');
    } finally {
      await t.close();
    }
  });

  test('exports carry «الخدمة»; the printed «إفادة قانونية» of a paid case uses the paid disclaimer', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      for (const entity of ['intakes', 'cases', 'matters']) {
        const r = await admin.download(`/api/admin/data/export/${entity}`);
        assert.equal(r.status, 200);
        const head = r.body.split('\r\n')[0];
        assert.ok(head.endsWith('الخدمة'), `${entity}: ${head.slice(-40)}`);
      }
      const cases = await admin.download('/api/admin/data/export/cases');
      assert.ok(cases.body.includes('أفراد وشركات') && cases.body.includes('خيري') && cases.body.includes('شركة'));
      t.app.settings.set('print_answer_disclaimer', 'تنبيه الخيري');
      t.app.settings.set('print_answer_disclaimer_paid', 'تنبيه الأفراد والشركات');
      const { caseId } = await paidCase(admin, '01011113031');
      const t0 = new Date().toISOString();
      const ans = t.app.db.insert('client_answers', { case_id: caseId, body: 'نص الإفادة', status: 'draft', created_at: t0, updated_at: t0 });
      const doc = (await admin.get(`/api/print/answer/${ans}`)).body.document;
      assert.equal(doc.disclaimer, 'تنبيه الأفراد والشركات');
      const ch = t.app.db.get("SELECT a.id FROM client_answers a JOIN cases c ON c.id = a.case_id WHERE c.segment = 'charity' AND c.company_id IS NULL LIMIT 1");
      assert.ok(ch);
      assert.equal((await admin.get(`/api/print/answer/${ch.id}`)).body.document.disclaimer, 'تنبيه الخيري');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ build-2: نصوص العميل والقوالب بالنبرة (L11-25، r2 S15) ═════════════════════════
describe('v11 segment-server — client texts, templates and portal by tone (SS-7, INV-12)', () => {
  test('a paid client never receives charity wording: welcome list (PAID_TOPICS, same topic ids), neutral ack, accept reply, questions, info suffix, answer message, day-before reminder', async () => {
    const stub = stubFetch();
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const db = t.app.db;
      t.app.settings.set('story_welcome_enabled', true);
      t.app.settings.set('story_ack_enabled', true);
      t.app.settings.set('stories_since', '2020-01-01T00:00:00.000Z');
      configurePaid(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011114001', text: 'مساء الخير' }));
      const i = lastIntake(t);
      assert.equal(i.segment, 'paid');
      const welcome = db.get("SELECT * FROM messages WHERE intake_id = ? AND automation_rule = 'story_welcome'", i.id);
      assert.ok(welcome, 'paid welcome is sent in the paid tone');
      assert.equal(welcome.wa_line, 'paid');
      const wa = JSON.parse(welcome.meta).wa;
      assert.deepEqual(wa.sections[0].rows.map((r) => r.id), TOPICS.map((x) => `topic:${x.key}`));
      assert.deepEqual(wa.sections[0].rows.map((r) => r.title), TOPICS.map((x) => SEG.PAID_TOPICS[x.key].wa_title.slice(0, 24)));
      assert.equal(wa.button, CLIENT_TEXTS_PAID.story_welcome_button);
      for (const m of db.all("SELECT body FROM messages WHERE client_id = ? AND direction = 'out'", i.client_id)) assert.ok(!PAID_BANNED_RE.test(m.body), m.body);
      // نص اليوم السابق للجلسة ورسالة الرد بصيغة الجمع
      assert.ok(!PAID_BANNED_RE.test(DAY_BEFORE_TEMPLATE_PAID));
      const admin = await t.login('admin');
      let r = await admin.post(`/api/admin/intakes/${i.id}/accept`, { track: 'consultation', force: true, case: { legal_area: 'FAM', title: 'حضانة' }, reply: { send: true, text: t.app.stories.proposal(i.id).drafts.consultation.reply.text } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const caseId = intakeRow(t, i.id).case_id;
      const accepted = db.get("SELECT * FROM messages WHERE case_id = ? AND direction = 'out' AND automated = 0 ORDER BY id DESC LIMIT 1", caseId) || db.get("SELECT * FROM messages WHERE intake_id = ? AND direction = 'out' AND automated = 0 ORDER BY id DESC LIMIT 1", i.id);
      assert.match(accepted.body, /^مرحبًا بكم، تم تسجيل الطلب رقم/);
      assert.equal(accepted.wa_line, 'paid', 'reply leaves from the paid number');
      // سطر طلب المستند على واتساب
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      const t0 = new Date().toISOString();
      const ir = db.insert('info_requests', { case_id: caseId, kind: 'document', question: 'صورة شهادة الميلاد', status: 'pending_admin', requested_by: userRow(t, 'admin').id, created_at: t0, updated_at: t0 });
      r = await admin.post(`/api/admin/info-requests/${ir}/approve`, { client_message: 'صورة شهادة ميلاد الابن.' });
      assert.ok([200, 201].includes(r.status), JSON.stringify(r.body));
      const m = db.get("SELECT meta FROM messages WHERE json_extract(meta, '$.info_request_id') = ? ORDER BY id DESC LIMIT 1", ir);
      const waText = JSON.parse(m.meta).wa_text || '';
      assert.ok(waText.startsWith('مرحبًا'), waText);
      assert.ok(waText.includes('بخصوص طلبكم') && waText.includes('يمكنكم تصوير المستند'), waText);
      assert.ok(!PAID_BANNED_RE.test(waText), waText);
      void c;
      // «غير محدد» على رقم مشترك: لا ترحيب، و«وصلتنا» بالنص المحايد
      t.app.integrations.set('whatsapp', { segment: 'shared', paid_phone_number_id: '', paid_number: '' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011114002', text: PAID_STORY }));
      const n = lastIntake(t);
      assert.equal(n.segment, null);
      assert.ok(!db.get("SELECT 1 FROM messages WHERE intake_id = ? AND automation_rule = 'story_welcome'", n.id), 'the welcome list never goes out in neutral tone');
      t.app.stories.markReady(n.id, 'client_done');
      const ack = db.get("SELECT body FROM messages WHERE intake_id = ? AND automation_rule = 'story_ack'", n.id);
      assert.ok(ack, 'neutral ack');
      assert.match(ack.body, /^مرحبًا بكم، وصلتنا رسالتكم، وهذا الطلب رقم \d+\.\nسيراجعها فريقنا ويرد عليكم هنا\./);
    } finally {
      stub.restore();
      await t.close();
    }
  });

  test('r2 S15: outside the window a paid story uses <purpose>@paid, else the neutral portal_update; the charity survey template never reaches paid; automations use template_paid; readiness flags charity words', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const admin = await t.login('admin');
      const t0 = new Date().toISOString();
      const tpl = (name, body, n) => db.run('INSERT INTO wa_templates (name, language, category, status, body_text, param_count, buttons, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', name, 'ar', 'UTILITY', 'APPROVED', body, n, '[]', t0);
      tpl('charity_update', 'في جديد في طلبك يا {{1}}، الاستشارة ببلاش', 1);
      tpl('neutral_update', 'يوجد جديد في طلبكم {{1}}', 1);
      tpl('paid_update', 'مرحبًا {{1}}، يوجد جديد في طلبكم', 1);
      tpl('charity_survey', 'قيّمي خدمتنا يا {{1}}', 1);
      const map = (purpose, name) => db.run('INSERT OR REPLACE INTO wa_template_mappings (purpose, template_name, language, params, updated_at) VALUES (?, ?, ?, ?, ?)', purpose, name, 'ar', '["first_name"]', t0);
      map('case_update', 'charity_update');
      map('portal_update', 'neutral_update');
      map('survey', 'charity_survey');
      const { caseId } = await paidCase(admin, '01011114011');
      const cid = db.value('SELECT client_id FROM cases WHERE id = ?', caseId);
      const msgOf = (extra = {}) => ({ id: 0, client_id: cid, case_id: caseId, intake_id: null, matter_id: null, body: 'نص', to_address: '+201011114011', automation_rule: null, ...extra });
      assert.equal(t.app.messaging.templatePlan(msgOf(), {}).purpose, 'portal_update', 'unmapped paid → neutral portal_update (never charity case_update)');
      assert.equal(t.app.messaging.templatePlan(msgOf({ automation_rule: 'satisfaction_survey' }), { wa: { purpose: 'survey' } }).purpose, 'portal_update', 'charity survey never to paid');
      map('case_update@paid', 'paid_update');
      assert.equal(t.app.messaging.templatePlan(msgOf(), {}).purpose, 'case_update@paid');
      const charityCase = db.get("SELECT id, client_id FROM cases WHERE company_id IS NULL AND segment = 'charity' LIMIT 1");
      assert.equal(t.app.messaging.templatePlan({ ...msgOf(), client_id: charityCase.client_id, case_id: charityCase.id }, {}).purpose, 'case_update', 'charity unchanged');
      // الجاهزية: قالب محايد بكلام الخيري مع وجود عملاء أفراد وشركات
      db.run("UPDATE wa_templates SET body_text = 'في جديد يا {{1}} — المؤسسة' WHERE name = 'neutral_update'");
      const items = t.app.segments.readiness();
      assert.ok(items.some((x) => x.key === 'wa_paid_templates'), JSON.stringify(items.map((x) => x.key)));
      // الأتمتة: نص template_paid لملف أفراد وشركات (تذكير المستند)
      const rule = { key: 'document_reminder', params: { ...DEFAULT_AUTOMATION_RULES.document_reminder.params } };
      assert.ok(rule.params.template_paid && !PAID_BANNED_RE.test(rule.params.template_paid));
      const surveyPaid = DEFAULT_AUTOMATION_RULES.satisfaction_survey.params.template_paid;
      assert.ok(surveyPaid && !PAID_BANNED_RE.test(surveyPaid));
    } finally {
      await t.close();
    }
  });

  test('portal (S11-16, r2 S2): stories[].segment, invoices[].segment and page tone; contact by tone (paid digits and prefill for a paid page)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const find = (phone) => db.get("SELECT c.id FROM clients c JOIN client_identities x ON x.client_id = c.id WHERE x.kind = 'phone' AND x.value LIKE ?", `%${phone.slice(1)}`);
      const khaled = find('01092000301');
      let p = (await t.client().get(`/api/portal/${t.app.clients.issuePortalToken(khaled.id)}`)).body;
      assert.equal(p.tone, 'paid');
      assert.ok(p.home.stories.every((s) => s.segment === 'paid'));
      assert.ok(p.invoices.some((i) => i.segment === 'paid'));
      assert.equal(p.home.contact.whatsapp_digits, '201000000002', 'verified paid number');
      assert.equal(p.home.contact.whatsapp_prefill, SEG.paidWaPrefill());
      const charity = db.get("SELECT client_id FROM intakes WHERE segment = 'charity' AND status IN ('new','in_review') AND client_id NOT IN (SELECT client_id FROM intakes WHERE segment != 'charity' OR segment IS NULL) LIMIT 1");
      p = (await t.client().get(`/api/portal/${t.app.clients.issuePortalToken(charity.client_id)}`)).body;
      assert.equal(p.tone, 'charity');
      assert.notEqual(p.home.contact.whatsapp_prefill, SEG.paidWaPrefill());
      // صفحة الطلب «غير المحدد» = نبرة محايدة (صيغة الأفراد بلا أتعاب)
      const unset = find('01092000305');
      p = (await t.client().get(`/api/portal/${t.app.clients.issuePortalToken(unset.id)}`)).body;
      assert.equal(p.tone, 'neutral');
      // /p/<token> يضمّن نفس البيانات (tone) لصفحة المتابعة
      const html = await (await fetch(`${t.base}/p/${t.app.clients.issuePortalToken(khaled.id)}`)).text();
      assert.match(html, /"tone":"paid"/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ build-2: المحاكي والبيانات التجريبية وأزرار الاختيار (SS-8، SS-9) ═════════════════════════
describe('v11 segment-server — simulator, demo seed and choice buttons (SS-8, SS-9, S11-20)', () => {
  test('demo seed (S11-53): the six phones end in their expected segment / source / line; paid number verified; dashboard alerts', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const of = (phone) => db.get("SELECT i.* FROM intakes i JOIN client_identities x ON x.client_id = i.client_id WHERE x.kind = 'phone' AND x.value LIKE ? ORDER BY i.id DESC LIMIT 1", `%${phone.slice(1)}`);
      const got = Object.fromEntries(SEGMENT_DEMO_PHONES.map((p) => { const i = of(p); return [p, [i.segment, i.segment_source, i.wa_line]]; }));
      assert.deepEqual(got, {
        '01092000301': ['paid', 'wa_line', 'paid'],
        '01092000302': ['paid', 'website', null],
        '01092000303': ['paid', 'company_lead', null],
        '01092000304': ['charity', 'wa_choice', 'main'],
        '01092000305': [null, null, 'main'],
        '01092000306': ['charity', 'staff', null],
      });
      assert.equal(JSON.parse(of('01092000305').segment_hint).segment, 'paid');
      const c301 = db.get('SELECT * FROM cases WHERE id = ?', of('01092000301').case_id);
      assert.equal(c301.segment, 'paid');
      assert.deepEqual(t.app.segments.caseFees(c301), { invoices: 1, agreed: true });
      assert.ok(db.get("SELECT 1 FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ? AND u.username = 'tarek' AND a.role = 'lead'", c301.id));
      assert.ok(t.app.segments.paidVerifiedAt());
      assert.equal(t.app.segments.publicDigits('paid'), '201000000002');
      assert.ok(db.get("SELECT 1 FROM security_events WHERE type = 'segment.changed' AND summary LIKE ?", `%${of('01092000306').code}%`));
      const admin = await t.login('admin');
      const dash = (await admin.get('/api/admin/dashboard')).body;
      assert.ok(dash.segments.paid.unconfirmed_wa >= 1, 'one paid web story stays unconfirmed');
      assert.ok(dash.segments.unset_open >= 1);
      const unset = (await admin.get('/api/admin/intakes?segment=unset')).body;
      assert.ok(unset.items.some((x) => x.id === of('01092000305').id));
      // سجل واتساب: رسائل الأفراد والشركات بنصوصهم ومن رقمهم
      for (const m of db.all("SELECT m.body FROM messages m JOIN intakes i ON i.id = m.intake_id WHERE m.direction = 'out' AND i.segment = 'paid'")) assert.ok(!PAID_BANNED_RE.test(m.body), m.body);
    } finally {
      await t.close();
    }
  });

  test('simulator (S11-23): line main|paid|shared|unknown and kind seg_reply; the response carries segment, source and line', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      let r = await admin.post('/api/admin/simulate/whatsapp', { from: '01011115001', text: 'عندي سؤال عن عقد إيجار', line: 'paid' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual([r.body.segment, r.body.segment_source, r.body.wa_line, r.body.line], ['paid', 'wa_line', 'paid', 'paid']);
      r = await admin.post('/api/admin/simulate/whatsapp', { from: '01011115002', text: 'السلام عليكم', line: 'shared' });
      assert.deepEqual([r.body.segment, r.body.segment_source, r.body.wa_line], [null, null, 'main']);
      assert.ok(r.body.replies.some((m) => m.rule === 'segment_choice' && m.wa?.type === 'buttons' && m.wa.buttons.map((b) => b.id).join() === 'seg:charity,seg:paid'));
      r = await admin.post('/api/admin/simulate/whatsapp', { from: '01011115002', kind: 'seg_reply', reply_id: 'seg:paid', line: 'shared' });
      assert.deepEqual([r.body.segment, r.body.segment_source], ['paid', 'wa_choice']);
      r = await admin.post('/api/admin/simulate/whatsapp', { from: '01011115003', text: 'مرحبا', line: 'unknown' });
      assert.deepEqual([r.body.wa_line, r.body.replies.length], ['unknown', 0]);
      assert.equal((await admin.post('/api/admin/simulate/whatsapp', { from: '01011115004', text: 'x', line: 'other' })).status, 400);
      assert.equal((await (await t.login('ahmed')).post('/api/admin/simulate/whatsapp', { from: '01011115005', text: 'x' })).status, 403);
    } finally {
      await t.close();
    }
  });

  test('choice buttons (S11-20): once per new NULL intake on the shared number; never when disabled, on a dedicated/charity line, after a tag, or twice in 30 days; the answer is not a fact; typed answers work; staff wins; welcome waits for the answer', async () => {
    const stub = stubFetch();
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const db = t.app.db;
      t.app.settings.set('stories_since', '2020-01-01T00:00:00.000Z');
      t.app.settings.set('segment_returning_days', 0);
      const choices = (id) => db.all("SELECT * FROM messages WHERE intake_id = ? AND automation_rule = 'segment_choice'", id);
      // متوقفة ← لا أزرار
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116001', text: 'السلام عليكم' }));
      assert.equal(choices(lastIntake(t).id).length, 0, 'disabled by default');
      t.app.settings.set('wa_segment_choice_enabled', true);
      // رقم مشترك + «غير محدد» ← مرة واحدة
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116002', text: 'السلام عليكم' }));
      const i = lastIntake(t);
      const sent = choices(i.id);
      assert.equal(sent.length, 1);
      const meta = JSON.parse(sent[0].meta);
      assert.deepEqual([meta.wa.type, meta.wa.session_only, meta.portal_hidden, sent[0].automated, sent[0].wa_line], ['buttons', true, true, 1, 'main']);
      assert.deepEqual(meta.wa.buttons, [{ id: 'seg:charity', title: 'خيري — مجاني' }, { id: 'seg:paid', title: 'أفراد وشركات' }]);
      assert.equal(meta.wa.footer, 'كلامكم سر عندنا');
      assert.ok(intakeRow(t, i.id).segment_choice_sent_at);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116002', text: 'كمان سؤال' }));
      assert.equal(choices(i.id).length, 1, 'never twice');
      const rev = intakeRow(t, i.id).story_rev;
      // الجواب بالكتابة «أفراد وشركات» ← paid / wa_choice، ولا يحرك القصة
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116002', text: 'أفراد وشركات' }));
      let row = intakeRow(t, i.id);
      assert.deepEqual([row.segment, row.segment_source, row.story_rev], ['paid', 'wa_choice', rev]);
      assert.ok(db.get("SELECT 1 FROM messages WHERE intake_id = ? AND automation_rule = 'segment_chosen'", i.id), 'short confirmation in the chosen tone');
      assert.equal(db.value("SELECT body FROM messages WHERE intake_id = ? AND automation_rule = 'segment_chosen'", i.id).startsWith('شكرًا لاختياركم'), true);
      // جملة جاهزة ← لا أزرار؛ نفس العميل خلال 30 يومًا ← لا أزرار
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116003', text: SEG.paidWaPrefill('inh') }));
      assert.equal(choices(lastIntake(t).id).length, 0, 'a tag decides');
      db.run("UPDATE intakes SET status = 'archived' WHERE id = ?", i.id);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116002', text: 'طلب جديد تمامًا' }));
      const again = lastIntake(t);
      assert.notEqual(again.id, i.id);
      assert.equal(choices(again.id).length, 0, 'once per client per 30 days');
      // الإدارة تغلب: زر بعد تحديد الإدارة لا يغيّر شيئًا
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116004', text: 'مساء الخير' }));
      const s = lastIntake(t);
      assert.equal(choices(s.id).length, 1);
      const admin = await t.login('admin');
      assert.equal((await admin.put(`/api/admin/intakes/${s.id}/segment`, { segment: 'charity' })).status, 200);
      const p = waOn('PN123', { from: '201011116004', text: 'أفراد وشركات' });
      t.app.engine.handleWhatsAppWebhook(p);
      row = intakeRow(t, s.id);
      assert.deepEqual([row.segment, row.segment_source], ['charity', 'staff']);
      // الرقم الأساسي «الخيري» ← لا أزرار أبدًا
      t.app.integrations.set('whatsapp', { segment: 'charity' }, admin0(t), null, { confirm: true });
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116005', text: 'السلام عليكم' }));
      assert.equal(choices(lastIntake(t).id).length, 0);
      // الترحيب ينتظر الجواب ثم يُرسل بنبرة الاختيار
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('story_welcome_enabled', true);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011116006', text: 'السلام عليكم' }));
      const w = lastIntake(t);
      assert.equal(choices(w.id).length, 1);
      assert.ok(!db.get("SELECT 1 FROM messages WHERE intake_id = ? AND automation_rule = 'story_welcome'", w.id), 'no welcome before the answer');
      const btn = waPayload({ from: '201011116006', type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id: 'seg:charity', title: 'خيري — مجاني' } } } });
      btn.entry[0].changes[0].value.metadata.phone_number_id = 'PN123';
      t.app.engine.handleWhatsAppWebhook(btn);
      assert.deepEqual([intakeRow(t, w.id).segment, intakeRow(t, w.id).segment_source], ['charity', 'wa_choice']);
      const wel = db.get("SELECT * FROM messages WHERE intake_id = ? AND automation_rule = 'story_welcome'", w.id);
      assert.ok(wel, 'welcome after the answer');
      assert.equal(wel.body, t.app.stories.fill(CLIENT_TEXTS.story_welcome, intakeRow(t, w.id)));
    } finally {
      stub.restore();
      await t.close();
    }
  });

  test('P1: /portal OTP leaves from the client\'s line (lineForPhone); NULL proposals carry drafts in both tones', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      configurePaid(t);
      t.app.engine.handleWhatsAppWebhook(waOn('PAIDID', { from: '201011117001', text: 'مساء الخير' }));
      const i = lastIntake(t);
      assert.equal(t.app.segments.lineForPhone(i.client_id), 'paid');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011117002', text: 'مرحبا' }));
      assert.equal(t.app.segments.lineForPhone(lastIntake(t).client_id), 'main');
      t.app.integrations.set('whatsapp', { paid_phone_number_id: 'NEWPAID' }, admin0(t));
      assert.equal(t.app.segments.lineForPhone(i.client_id), 'main', 'a replaced paid id falls back to main');
      t.app.integrations.set('whatsapp', { segment: 'shared', paid_phone_number_id: '', paid_number: '' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011117003', text: PAID_STORY }));
      const n = lastIntake(t);
      await t.app.ai.analyzeIntake(n.id);
      const prop = t.app.stories.proposal(n.id);
      assert.equal(prop.segment_required, true);
      assert.ok(prop.drafts_by_tone);
      assert.match(prop.drafts_by_tone.charity.consultation.reply.text, /^أهلًا/);
      assert.match(prop.drafts_by_tone.paid.consultation.reply.text, /^مرحبًا/);
      assert.ok(!PAID_BANNED_RE.test(prop.drafts_by_tone.paid.consultation.reply.text));
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ build-2: نصوص ثابتة (S11-28، §10) ═════════════════════════
describe('v11 segment-server — fixed copy of the paid side (S11-28, S11 §10, L11-25)', () => {
  test('the paid analysis header line is S11-28 verbatim; the tone note and the NULL line say what they change', () => {
    assert.equal(
      PAID_AUDIENCE_LINE,
      'نوع الخدمة: أفراد وشركات (بأتعاب). هذا لا يغيّر الفرز: المجال والمسار والاستعجال والمسائل والناقص كما هي. يتغير أسلوب questions_for_her وreply_to_her فقط: عربية مهذبة بصيغة الجمع («حضرتكم»)، بلا «ببلاش» أو «مجاني»، وبلا توجيه لبرامج المؤسسة الخيرية؛ وفي refer اذكر أن الموضوع خارج نطاق خدماتنا القانونية.',
    );
    assert.equal(UNSET_AUDIENCE_LINE, 'نوع الخدمة: غير محدد — اقترح segment_hint ولا تغيّر الفرز.');
  });

  test('local paid wording: questions, client version and default steps have no gender marks and no charity words', async () => {
    const H = await import('../src/ai/heuristic.js');
    for (const area of ['GEN', 'INH', 'PEN', 'FAM', 'GRD', 'PRP', 'ADM', 'CIV', 'LAB']) {
      for (const q of H.paidQuestionsFor(area)) {
        assert.ok(!/\{[ية]\}/.test(q) && !PAID_BANNED_RE.test(q), `${area}: ${q}`);
      }
    }
    const v = H.clientVersionPaid({ clientName: 'هشام علي', caseCode: 'X', opinion: 'الرأي: يحق لكم الاعتراض.', orgName: 'إمام' });
    assert.match(v, /^مرحبًا هشام،/);
    assert.ok(!PAID_BANNED_RE.test(v) && !v.includes('برنامج الدعم'), v);
    assert.ok(H.clientVersionPaid({ opinion: 'x', orgName: 'إمام' }).startsWith('مرحبًا بكم،'));
    const steps = H.clientSummary({ opinion: 'لا خلاصة', tone: 'paid' }).steps;
    for (const s of steps) assert.ok(!PAID_BANNED_RE.test(s) && !/\{[ية]\}/.test(s), s);
    assert.deepEqual(H.clientSummary({ opinion: 'لا خلاصة' }).steps, H.clientSummary({ opinion: 'لا خلاصة', tone: 'charity' }).steps, 'charity default unchanged');
  });

  test('paid day-before reminder and «هاتي معاكي» note speak in polite plural; the charity ones are unchanged', async () => {
    const { withClientNote, DAY_BEFORE_TEMPLATE } = await import('../src/services/portal-v91.js');
    assert.ok(!PAID_BANNED_RE.test(DAY_BEFORE_TEMPLATE_PAID) && !/\{[ية]\}/.test(DAY_BEFORE_TEMPLATE_PAID));
    assert.ok(DAY_BEFORE_TEMPLATE.includes('هات{ي} بطاقتك'), 'charity text as in 9.1');
    const e = { client_text_approved: 1, client_note: 'صورة الحكم\nالمحامي هيقابلك عند باب المحكمة' };
    const paid = withClientNote('مرحبًا، نذكّركم بموعد.\nيرجى إحضار بطاقة الرقم القومي.\n— إمام', e, 'm', 'paid');
    assert.match(paid, /يرجى إحضار: بطاقة الرقم القومي، صورة الحكم/);
    const charity = withClientNote('أهلًا، فكّرناك.\nهاتي بطاقتك.\n— إمام', e, 'f');
    assert.match(charity, /هاتي معاكي: بطاقتك، صورة الحكم/);
  });

  test('the paid answer message (B91-08 shape) and the info-request suffix use the paid wording', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const { answerMessageText } = await import('../src/services/portal-v91.js');
      const admin = await t.login('admin');
      const { caseId } = await paidCase(admin, '01011118001');
      const c = t.app.db.get('SELECT * FROM cases WHERE id = ?', caseId);
      const msg = answerMessageText(t.app, { summary: 'يحق لكم فسخ العقد بعد إنذار المقاول.', steps: JSON.stringify(['أرسلوا الإنذار', 'احتفظوا بالإيصال']) }, c);
      assert.match(msg, /^مرحبًا [^،]*،? ?الرد على طلبكم جاهز\.|^مرحبًا بكم، الرد على طلبكم جاهز\./);
      assert.match(msg, /الخطوات التالية:\n1\. أرسلوا الإنذار/);
      assert.ok(!PAID_BANNED_RE.test(msg) && !/\{[ية]\}/.test(msg), msg);
      assert.equal(t.app.segments.text('info_suffix_document', 'paid'), CLIENT_TEXTS_PAID.info_suffix_document);
      assert.equal(t.app.accounting.paidRateMinor(999999), 0, 'unknown lawyer → no paid rate');
    } finally {
      await t.close();
    }
  });

  test('accepting a «غير محدد» request as paid writes the questions in the chosen tone, in the same decision', async () => {
    const stub = stubFetch();
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011118011', text: PAID_STORY }));
      const i = lastIntake(t);
      assert.equal(i.segment, null);
      const admin = await t.login('admin');
      const r = await admin.post(`/api/admin/intakes/${i.id}/accept`, { track: 'need_info', force: true, segment: 'paid', questions: ['ما تاريخ العقد؟'] });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const out = t.app.db.get("SELECT body FROM messages WHERE intake_id = ? AND direction = 'out' AND automated = 0 ORDER BY id DESC LIMIT 1", i.id);
      assert.match(out.body, /^مرحبًا بكم، بخصوص الطلب رقم \d+: نحتاج إلى معرفة ما يلي:\n1\. ما تاريخ العقد؟/);
      assert.deepEqual([intakeRow(t, i.id).segment, intakeRow(t, i.id).segment_source], ['paid', 'staff']);
    } finally {
      stub.restore();
      await t.close();
    }
  });
});

// ═════════════════════════ مراجعة 11.0: إصلاحات المراجعة (اختبار انحدار لكل خلل) ═════════════════════════
describe('v11 segment-server — review fixes (regressions)', () => {
  const tokenOf = (url) => /\/p\/([^/?#]+)/.exec(String(url || ''))?.[1] || null;

  test('R1: a paid case switched to «خيري» cancels its proposed fees without payments (agreed or not): no fee request on /p/ and no reminder; paid invoices stay', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const manager = await t.login('manager');
      const db = t.app.db;
      const { caseId } = await paidCase(admin, '01011119001');
      const a = (await manager.post(`/api/admin/cases/${caseId}/invoices`, { amount: 2500, due_at: '2020-01-01T00:00:00.000Z' })).body.invoice;
      const b = (await manager.post(`/api/admin/cases/${caseId}/invoices`, { amount: 300, due_at: '2030-01-01T00:00:00.000Z', description: 'مصاريف انتقال' })).body.invoice;
      const clientId = db.value('SELECT client_id FROM cases WHERE id = ?', caseId);
      const token = t.app.clients.issuePortalToken(clientId);
      assert.equal((await t.client().post(`/api/portal/${token}/invoices/${a.number}/response`, { answer: 'agree' })).status, 200);
      const r = await manager.put(`/api/admin/cases/${caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي', reason_code: 'not_eligible' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.cancelled_invoices, [a.number, b.number]);
      assert.deepEqual(db.all('SELECT status FROM invoices WHERE id IN (?, ?) ORDER BY id', a.id, b.id).map((x) => x.status), ['cancelled', 'cancelled']);
      assert.equal(Number(db.value("SELECT COUNT(*) FROM activity WHERE case_id = ? AND type = 'invoice.cancelled'", caseId)), 2);
      const audit = db.get("SELECT data FROM security_events WHERE type = 'segment.changed' ORDER BY id DESC LIMIT 1");
      assert.deepEqual(JSON.parse(audit.data).cancelled_invoices, [a.number, b.number]);
      // صفحة المتابعة: لا مبلغ ولا زر موافقة؛ ولا تذكير بمبلغ (المتفق عليه كان مستحقًا منذ 2020)
      const p = (await t.client().get(`/api/portal/${token}`)).body;
      assert.ok(!p.invoices.some((x) => [a.number, b.number].includes(x.number)), 'cancelled fees are not on /p/');
      assert.equal(Number(db.value("SELECT COUNT(*) FROM invoices WHERE id = ? AND status IN ('unpaid','partially_paid')", a.id)), 0, 'the invoice reminder (unpaid/partially_paid only) never picks it');
      // ملف عليه دفعة: لمدير النظام فقط، والمدفوع يبقى، وغير المدفوع يُلغى
      const second = await paidCase(admin, '01011119002');
      const paidInv = (await admin.post(`/api/admin/cases/${second.caseId}/invoices`, { amount: 1000, due_at: '2030-01-01T00:00:00.000Z' })).body.invoice;
      const openInv = (await admin.post(`/api/admin/cases/${second.caseId}/invoices`, { amount: 400, due_at: '2030-01-01T00:00:00.000Z' })).body.invoice;
      t.app.matters.addPayment(paidInv.id, { amount: 1000 }, userRow(t, 'admin'));
      assert.equal((await manager.put(`/api/admin/cases/${second.caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' })).status, 403);
      const r2 = await admin.put(`/api/admin/cases/${second.caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' });
      assert.equal(r2.status, 200, JSON.stringify(r2.body));
      assert.deepEqual(r2.body.cancelled_invoices, [openInv.number]);
      assert.equal(db.value('SELECT status FROM invoices WHERE id = ?', paidInv.id), 'paid');
      // والعكس (خيري ← أفراد وشركات) لا يلمس أي فاتورة؛ وبلا تغيير = قائمة فارغة
      const r3 = await admin.put(`/api/admin/cases/${second.caseId}/segment`, { segment: 'paid', reason: 'رجع خدمة بأتعاب' });
      assert.deepEqual(r3.body.cancelled_invoices, []);
      assert.equal(db.value('SELECT status FROM invoices WHERE id = ?', paidInv.id), 'paid');
      assert.deepEqual((await admin.put(`/api/admin/cases/${second.caseId}/segment`, { segment: 'paid' })).body.cancelled_invoices, []);
    } finally {
      await t.close();
    }
  });

  test('R2: the S11 §10.4 change message is offered filled (name, request number, gender) and is filled server-side; a leftover variable is refused and nothing changes', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      // خيري ← أفراد وشركات: بنبرة الخيري («أهلًا يا أم محمد»، «طلب رقم N»، {ة}/{ي} بصيغة المؤنث)
      const web = await t.client().post('/api/public/intake', form({ phone: '01011119011', name: 'أم محمد', segment: 'charity' }));
      const ci = intakeByCode(t, web.body.reference);
      const num = String(Number(ci.code.slice(-5)));
      let d = (await admin.get(`/api/admin/intakes/${ci.id}`)).body.segment;
      assert.equal(d.change_message.charity, null);
      const toPaid = d.change_message.paid;
      assert.ok(toPaid.startsWith(`أهلًا يا أم محمد، بعد مراجعة طلبك (طلب رقم ${num})`), toPaid);
      assert.match(toPaid, /لو حاببة نكمّل، ردي علينا هنا\./); // S11 §10.4 «لو حابب{ة}» بصيغة المؤنث
      assert.ok(!/\{/.test(toPaid), toPaid);
      // الإرسال بالنص الخام (كما في الإعدادات) يُملأ على الخادم
      let r = await admin.put(`/api/admin/intakes/${ci.id}/segment`, { segment: 'paid', reason: 'خارج برنامج الدعم', message: { send: true, text: t.app.segments.changeText('paid') } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(db.value('SELECT body FROM messages WHERE id = ?', r.body.message_id), toPaid);
      // أفراد وشركات ← خيري: بنبرة الأفراد والشركات («مرحبًا …»، «الطلب رقم N»)
      d = (await admin.get(`/api/admin/intakes/${ci.id}`)).body.segment;
      assert.ok(d.change_message.charity.startsWith(`مرحبًا أم محمد، بعد مراجعة طلبكم (الطلب رقم ${num})`), d.change_message.charity);
      assert.equal(d.change_message.paid, null);
      // متغير غير معروف ← 400 ولا يتغير شيء (المعاملة كلها تُلغى)
      const msgsBefore = Number(db.value('SELECT COUNT(*) FROM messages WHERE intake_id = ?', ci.id));
      r = await admin.put(`/api/admin/intakes/${ci.id}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي', message: { send: true, text: 'مرحبًا {first_name}، {مبلغ} …' } });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'الرسالة فيها متغير لم يُملأ: {مبلغ}');
      assert.equal(intakeRow(t, ci.id).segment, 'paid', 'rolled back');
      assert.equal(Number(db.value('SELECT COUNT(*) FROM messages WHERE intake_id = ?', ci.id)), msgsBefore);
      // ملف: الرسالة المقترحة في كتلة الملف؛ الملف المستمر يتبع ملفه (بلا رسالة)
      const { caseId } = await paidCase(admin, '01011119012');
      const cd = (await admin.get(`/api/admin/cases/${caseId}`)).body.segment;
      assert.ok(cd.change_message.charity.startsWith('مرحبًا') && !/\{/.test(cd.change_message.charity), cd.change_message.charity);
      const m = db.get('SELECT id FROM matters LIMIT 1');
      if (m) assert.equal((await admin.get(`/api/admin/matters/${m.id}`)).body.segment.change_message, null);
      // «غير محدد»: لا رسالة مقترحة
      t.app.integrations.set('whatsapp', { segment: 'shared', paid_phone_number_id: '', paid_number: '' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.engine.handleWhatsAppWebhook(waOn('', { from: '201011119013', text: PAID_STORY }));
      const ni = lastIntake(t);
      assert.equal(ni.segment, null);
      assert.equal((await admin.get(`/api/admin/intakes/${ni.id}`)).body.segment.change_message, null);
      // المحامي لا يرى شيئًا من هذا (مسارات الإدارة فقط)
      assert.equal((await (await t.login('ahmed')).get(`/api/admin/intakes/${ci.id}`)).status, 403);
    } finally {
      await t.close();
    }
  });

  test('R3/R4/R5: readiness says an unverified paid number still answers who wrote to it; a paid portal call-back is marked for staff; the paid «about» card error is polite plural', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.integrations.set('whatsapp', { paid_phone_number_id: 'PAIDID', paid_number: '201000000002' }, admin0(t));
      const item = t.app.segments.readiness().find((x) => x.key === 'wa_paid_unverified');
      assert.ok(item && /من يكتب عليه مباشرة يُرد عليه منه/.test(item.detail) && !/ولا تُرسل منه الردود/.test(item.detail), item?.detail);
      // طلب مكالمة من صفحة متابعة طلب «أفراد وشركات» ← « · أفراد وشركات» في عنوان التنبيه؛ الخيري كما في 10.0
      const paid = await t.client().post('/api/public/intake', form({ phone: '01011119021', segment: 'paid', description: PAID_STORY }));
      const charity = await t.client().post('/api/public/intake', form({ phone: '01011119022', segment: 'charity' }));
      for (const res of [paid, charity]) assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal((await t.client().post(`/api/portal/${tokenOf(paid.body.portal_url)}/callback`, { when: 'morning' })).status, 200);
      assert.equal((await t.client().post(`/api/portal/${tokenOf(charity.body.portal_url)}/callback`, { when: 'morning' })).status, 200);
      const titles = t.app.db.all("SELECT DISTINCT title FROM notifications WHERE type = 'client.callback' ORDER BY id").map((x) => x.title);
      assert.ok(titles.some((x) => x.includes(paid.body.reference) && x.endsWith(' · أفراد وشركات')), JSON.stringify(titles));
      assert.ok(titles.some((x) => x.includes(charity.body.reference) && !x.includes('·')), JSON.stringify(titles));
      // «كمان سؤال» بعد إرسال طلب الأفراد والشركات: المحافظة فقط، والخطأ بصيغة الجمع المهذبة
      let r = await t.client().post(`/api/portal/${tokenOf(paid.body.portal_url)}/about`, { relation: 'widow' });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'اختاروا المحافظة أولًا.');
      r = await t.client().post(`/api/portal/${tokenOf(paid.body.portal_url)}/about`, {});
      assert.equal(r.body.error, 'اختاروا المحافظة أولًا.');
      r = await t.client().post(`/api/portal/${tokenOf(charity.body.portal_url)}/about`, {});
      assert.equal(r.body.error, 'مفيش حاجة تتسجل.', 'charity unchanged');
      // رسالة على «رقم الأفراد والشركات» بعد إزالته لا تخرج من الرقم الأساسي بصمت (INV-16)
      t.app.integrations.set('whatsapp', { paid_phone_number_id: '', paid_number: '' }, admin0(t));
      await assert.rejects(t.app.whatsapp.sendText('+201011119099', 'نص', { line: 'paid' }), (e) => /لم يعد مضبوطًا/.test(e.arabic));
    } finally {
      await t.close();
    }
  });
});
