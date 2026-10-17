// v12 staff-lines — نوع الطلب ومساره عند الفريق، قائمة الخدمات على واتساب (W-01…W-06)، أرشفة «خيري» على واتساب،
// كلمات الإيقاف، و«سبق التعامل مع خيري». (SL-0…SL-6 في build-1؛ الإعدادات والتحليلات والمحاكي والبيانات التجريبية بعدها)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, waPayload, freezeClock, resetClock } from './helpers.js';
import {
  LABELS,
  DEFAULT_SETTINGS,
  LINES_MENU_TEXTS,
  TEXT_TAGS,
  OPT_OUT_RULES,
  OPT_OUT_WORDS,
  STORY_AUTO_RULES,
} from '../src/constants.js';
import { LINES, TREE, PATHWAY_SOURCES, prefillFor, pageOf } from '../public/assets/js/public/entry-tree.js';
import { PAID_GENERIC } from '../public/assets/js/public/segment.js';
import { paidSentenceOf, isStopWord, PAID_BANNED_RE } from '../src/services/segments.js';
import { isFactual, stripSegmentPrefill } from '../src/channels/engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DASH = /[—–]/;

const LIVE = { whatsapp: { token: 'test-token-123456789012345', phoneNumberId: 'PN123', wabaId: 'WABA9', verifyToken: 'verify-me', appSecret: '', numberDigits: '201000000001' } };
const admin0 = (t) => t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
const intakeRow = (t, id) => t.app.db.get('SELECT * FROM intakes WHERE id = ?', id);
const lastIntake = (t) => t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');
const outbox = (t, intakeId) =>
  t.app.db
    .all("SELECT * FROM messages WHERE intake_id = ? AND direction = 'out' ORDER BY id", intakeId)
    .map((m) => ({ ...m, meta: JSON.parse(m.meta || '{}') }));
const rules = (t, intakeId) => outbox(t, intakeId).map((m) => m.automation_rule);

/** رسالة واتساب نصية على رقم بعينه (SIM-PAID = رقم الأفراد والشركات في وضع المحاكاة) */
function wa(t, pid, { from = '201012345678', text = 'مرحبا' } = {}) {
  const p = waPayload({ from, text });
  p.entry[0].changes[0].value.metadata.phone_number_id = pid;
  return t.app.engine.handleWhatsAppWebhook(p);
}
/** رد تفاعلي (زر أو صف قائمة) */
function waReply(t, pid, { from = '201012345678', id, title = 'اختيار', list = false } = {}) {
  const interactive = list ? { type: 'list_reply', list_reply: { id, title } } : { type: 'button_reply', button_reply: { id, title } };
  const p = waPayload({ from, type: 'interactive', extra: { interactive } });
  p.entry[0].changes[0].value.metadata.phone_number_id = pid;
  return t.app.engine.handleWhatsAppWebhook(p);
}
const PAID = 'PAIDID';
const menuOn = (t) => t.app.settings.set('wa_lines_menu_enabled', true);
/** رقم الأفراد والشركات PAIDID مضبوط ومُتحقق منه (واتساب نفسه في وضع المحاكاة: الرسائل «simulated») */
function paidOn(t) {
  t.app.integrations.set('whatsapp', { paid_phone_number_id: 'PAIDID', paid_number: '201000000002' }, admin0(t));
  t.app.segments.markPaidVerified('PAIDID', '201000000002');
}

// ═════════════════════════ SL-0: العقد ═════════════════════════
describe('v12 staff-lines SL-0: contract (constants, schema 89, texts, tags)', () => {
  test('settings block, OPT_OUT_RULES, story auto rules, labels from one source of words', () => {
    const src = read('src/constants.js');
    const entry = src.indexOf('// <settings:v12-entry>');
    const lines = src.indexOf('// <settings:v12-lines>');
    const media = src.indexOf('// <settings:v12-media>');
    assert.ok(entry > 0 && lines > entry && media > lines, 'blocks in the order entry → lines → media (§6.3)');
    assert.equal(DEFAULT_SETTINGS.wa_lines_menu_enabled, false, 'default off (O-37)');
    for (const r of ['lines_menu', 'lines_list', 'lines_next']) {
      assert.ok(STORY_AUTO_RULES.includes(r), r);
      assert.ok(OPT_OUT_RULES.includes(r), r);
      assert.match(LABELS.automation_rule[r], /[؀-ۿ]/);
    }
    for (const r of ['story_welcome', 'story_topic_nudge', 'story_ack', 'segment_choice', 'segment_chosen', 'satisfaction_survey']) assert.ok(OPT_OUT_RULES.includes(r), r);
    for (const r of ['hearing_reminder', 'invoice_reminder', 'portal_otp', 'identity_confirm']) assert.ok(!OPT_OUT_RULES.includes(r), `${r} is never suppressed`);
    assert.deepEqual(LABELS.pathway_source, { ...PATHWAY_SOURCES }, 'LABELS.pathway_source = PATHWAY_SOURCES');
    for (const k of ['consultation', 'litigation', 'company']) assert.equal(LABELS.service_line[k], LINES[k].staff);
    assert.equal(LABELS.service_line.none, 'لم يُحدَّد النوع');
    for (const k of ['intake.pathway_changed', 'client.auto_opt_out_cleared', 'settings.charity_public_changed', 'settings.wa_lines_menu_changed']) assert.match(LABELS.security_event[k], /[؀-ۿ]/, k);
  });

  test('§5.10 texts verbatim, TEXT_TAGS W-01…W-06, list bodies are the tree questions, firm voice', () => {
    assert.equal(LINES_MENU_TEXTS.lines_menu, 'أهلًا بكم في {firm_name}. اختاروا نوع الخدمة، أو اكتبوا موضوعكم مباشرة.');
    assert.equal(LINES_MENU_TEXTS.lines_menu_footer, 'ويمكنكم إرسال صور المستندات هنا.');
    assert.equal(LINES_MENU_TEXTS.lines_list_button, 'عرض الاختيارات');
    assert.equal(LINES_MENU_TEXTS.lines_next, 'شكرًا لكم. اكتبوا الموضوع باختصار، ويمكنكم إرسال صور المستندات أو رسالة صوتية، وعند الانتهاء أرسلوا «خلاص». نتفق معكم على الأتعاب قبل بدء أي عمل.');
    assert.equal(
      `${LINES_MENU_TEXTS.lines_counsel} ${LINES_MENU_TEXTS.lines_counsel_account}`,
      'شكرًا لكم. سيتواصل معكم فريقنا لترتيب عرض يناسب شركتكم. وإن كان لشركتكم حساب لدينا، فادخلوا من: {base_url}/company',
    );
    assert.equal(LINES_MENU_TEXTS.lines_list_litigation, 'ما وضع القضية؟', 'W-03 body (L12-54)');
    for (const n of TREE.children) assert.equal(LINES_MENU_TEXTS[`lines_list_${n.id}`], n.q, `list body = tree question (${n.id})`);
    // v12 tags: intended (TG-4، T12-20): TEXT_TAGS أُكمل لكل رسائل واتساب؛ رموز قائمة الخدمات W-01…W-06 كما هي ومفاتيحها في LINES_MENU_TEXTS
    const LINES_TAGS = { lines_menu: 'W-01', lines_list_consultation: 'W-02', lines_list_litigation: 'W-03', lines_list_company: 'W-04', lines_next: 'W-05', lines_counsel: 'W-06' };
    for (const [k, c] of Object.entries(LINES_TAGS)) assert.equal(TEXT_TAGS[k], c, k);
    for (const [k, c] of Object.entries(TEXT_TAGS)) if (/^W-0[1-6]$/.test(c)) assert.ok(k in LINES_MENU_TEXTS, k);
    for (const [k, s] of Object.entries(LINES_MENU_TEXTS)) {
      assert.ok(!DASH.test(s), `dash in ${k}`);
      assert.ok(!/!/.test(s), `«!» in ${k}`);
      assert.ok(!PAID_BANNED_RE.test(s), `banned word in ${k}`);
      assert.ok(!/\b[A-Z]{1,3}-\d{2,3}\b/.test(s), `no tag code inside a message (L12-88): ${k}`);
    }
    // أزرار W-01 من LINES (≤ 20 حرفًا)، وصفوف القوائم من pageOf (العنوان ≤ 24، الوصف ≤ 72)
    for (const k of ['consultation', 'litigation', 'company']) assert.ok(LINES[k].label.length <= 20);
    for (const k of ['consultation', 'litigation', 'company']) {
      for (const o of pageOf(k).options) {
        assert.ok(String(o.wa || o.label).length <= 24, o.label);
        assert.ok(!o.wa_desc || o.wa_desc.length <= 72, o.wa_desc);
      }
    }
  });

  test('schema 89: clients.wa_auto_opt_out_at on a fresh database; the new staff routes answer 401 to anonymous visitors', async () => {
    assert.deepEqual(JSON.parse(read('src/schema.d/89-v12-lines.columns.json')), [['clients', 'wa_auto_opt_out_at', 'TEXT']]);
    const t = await startTestApp({ seed: 'none' });
    try {
      assert.ok(t.app.db.all('PRAGMA table_info(clients)').some((c) => c.name === 'wa_auto_opt_out_at'));
      const admin = await t.login('admin');
      assert.equal((await admin.get('/api/admin/analytics/entry-tree')).status, 200, 'SL-8 landed (was a 501 stub in SL-0)');
      assert.ok(!/not_implemented|notYet/.test(read('src/routes/admin.js')), 'no 501 stub left');
      assert.equal((await t.client().get('/api/admin/analytics/entry-tree')).status, 401);
      assert.equal((await t.client().put('/api/admin/intakes/1/pathway', { path: 'litigation' })).status, 401);
      assert.equal((await t.client().del('/api/admin/clients/1/auto-opt-out')).status, 401);
    } finally {
      await t.close();
    }
  });

  test('sentences: tree › v11 topic › company › generic; isStopWord matches whole messages only', () => {
    const tree = paidSentenceOf(`${prefillFor('litigation/defend/family')}\nالقصة هنا`);
    assert.deepEqual([tree.kind, tree.path, tree.rest], ['tree', 'litigation/defend/family', 'القصة هنا']);
    assert.equal(paidSentenceOf(prefillFor('consultation/family/alimony')).kind, 'tree', 'tree first even when byte-equal to v11');
    assert.equal(paidSentenceOf(prefillFor('consultation/family/alimony')).topic, 'alimony');
    assert.deepEqual([paidSentenceOf('مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.').kind, paidSentenceOf('مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.').path], ['company', 'company/counsel']);
    assert.equal(paidSentenceOf('مرحبًا، أرغب في حجز استشارة قانونية بخصوص المعاشات والتأمينات.').kind, 'paid');
    const g = paidSentenceOf(`${PAID_GENERIC} عندي مشكلة`);
    assert.deepEqual([g.kind, g.path, g.rest], ['generic', null, 'عندي مشكلة']);
    assert.equal(paidSentenceOf('السلام عليكم'), null);
    assert.equal(stripSegmentPrefill(prefillFor('company/new/llc')), '', 'tree sentence is not a fact');
    assert.equal(stripSegmentPrefill(PAID_GENERIC), '');
    for (const w of OPT_OUT_WORDS) assert.ok(isStopWord(w), w);
    for (const w of ['توقف.', ' STOP ', 'ايقاف!', 'Unsubscribe']) assert.ok(isStopWord(w), w);
    for (const w of ['توقف المعاش', 'عايزة أوقف القضية', 'stop it', '']) assert.ok(!isStopWord(w), w);
    assert.equal(isFactual({}, 'توقف', { meta: { opt_out: true } }), false);
    assert.equal(isFactual({ reply: { id: 'line:litigation' } }, 'رفع دعوى قضائية', { meta: { lines_reply: { kind: 'line' } } }), false);
  });
});

// ═════════════════════════ SL-1 / SL-3: واجهات الفريق ═════════════════════════
describe('v12 staff-lines SL-1/SL-3: staff list, detail, PUT pathway, DELETE auto-opt-out', () => {
  test('SL-T01/SL-T16: ?line= + line_counts, rows carry pathway_labels and a suggested line, detail pathway block; PUT pathway 200 + audit; ?line=none', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const c = t.client();
      const post = (o) => c.post('/api/public/intake', { consent: true, phone: '01012340001', description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', segment: 'paid', ...o });
      const r1 = await post({ phone: '01012340001' });
      const r2 = await post({ phone: '01012340002' });
      const r3 = await post({ phone: '01012340003', segment: 'charity' });
      const id = (r) => t.app.db.value('SELECT id FROM intakes WHERE code = ?', r.body.reference);
      const [a, b, ch] = [id(r1), id(r2), id(r3)];
      t.app.pathways.set(a, 'consultation/family/divorce', { source: 'website' });
      t.app.db.run("UPDATE intakes SET legal_area = 'FAM' WHERE id IN (?, ?)", b, ch);
      let list = (await admin.get('/api/admin/intakes')).body;
      // review (F1): «لم يُحدَّد النوع» = أفراد وشركات بلا نوع فقط (طلب «خيري» ch لا يُعد فيه)
      assert.deepEqual(list.line_counts, { consultation: 1, litigation: 0, company: 0, none: 1 });
      const row = (i) => list.items.find((x) => x.id === i);
      assert.deepEqual(row(a).pathway_labels, ['استشارة', 'الأسرة والميراث', 'الطلاق أو الخلع']);
      assert.equal(row(a).service_line, 'consultation');
      assert.equal(row(a).suggested_line, null);
      assert.deepEqual([row(b).pathway, row(b).suggested_line, row(b).suggested_line_label], [null, 'consultation', 'استشارة'], 'null paid row with an area → «مقترح: استشارة»');
      assert.equal(row(ch).suggested_line, null, 'charity requests get no suggestion');
      list = (await admin.get('/api/admin/intakes?line=consultation')).body;
      assert.deepEqual(list.items.map((x) => x.id), [a]);
      assert.equal(list.line_counts.none, 1, 'counts are computed before the line filter');
      list = (await admin.get('/api/admin/intakes?line=none')).body;
      assert.deepEqual(list.items.map((x) => x.id), [b], 'review (F1): ?line=none = paid requests without a type, never charity');
      list = (await admin.get('/api/admin/intakes?line=bogus')).body;
      assert.equal(list.items.length, 3, 'unknown line = no filter');
      list = (await admin.get('/api/admin/intakes?segment=paid')).body;
      assert.deepEqual(list.line_counts, { consultation: 1, litigation: 0, company: 0, none: 1 }, 'under the other filters');
      // التفاصيل
      const d = (await admin.get(`/api/admin/intakes/${a}`)).body;
      assert.deepEqual(
        { path: d.pathway.path, line: d.pathway.line, staff: d.pathway.staff_labels, src: d.pathway.source, label: d.pathway.source_label },
        { path: 'consultation/family/divorce', line: 'consultation', staff: ['استشارة', 'الأسرة والميراث', 'الطلاق أو الخلع'], src: 'website', label: 'من الموقع' },
      );
      assert.deepEqual((await admin.get(`/api/admin/intakes/${b}`)).body.pathway_suggest, { line: 'consultation', label: 'استشارة' });
      // «تأكيد» بضغطة: PUT { path: <line>, reason: 'suggested' }
      const before = intakeRow(t, b);
      const put = await admin.put(`/api/admin/intakes/${b}/pathway`, { path: 'consultation', reason: 'suggested' });
      assert.equal(put.status, 200);
      assert.deepEqual([put.body.pathway.path, put.body.pathway.source, put.body.pathway_labels[0]], ['consultation', 'staff', 'استشارة']);
      const after = intakeRow(t, b);
      assert.deepEqual([after.topic, after.legal_area, after.segment], [before.topic, before.legal_area, before.segment], 'topic/area/segment untouched');
      const audit = t.app.db.get("SELECT * FROM security_events WHERE type = 'intake.pathway_changed' ORDER BY id DESC LIMIT 1");
      assert.ok(audit);
      // review (F2): reason 'suggested' يُكتب بالعربية في سجل الأمان وسجل الطلب (كان «: suggested» في سطر النشاط)
      assert.deepEqual([JSON.parse(audit.data).to, JSON.parse(audit.data).reason, JSON.parse(audit.data).from], ['consultation', 'تأكيد النوع المقترح', null]);
      const act = t.app.db.get("SELECT summary FROM activity WHERE intake_id = ? AND type = 'intake.pathway_changed'", b);
      assert.ok(act);
      assert.match(act.summary, /: تأكيد النوع المقترح$/);
      assert.ok(!/suggested/.test(act.summary), `no English reason in the activity line: ${act.summary}`);
      // تعديل إلى ورقة، ثم مسح، ثم أخطاء
      assert.equal((await admin.put(`/api/admin/intakes/${b}/pathway`, { path: 'litigation/defend/family' })).body.pathway.staff_labels.join(' › '), 'دعوى › الرد على دعوى مرفوعة › أسرة وميراث');
      const cleared = await admin.put(`/api/admin/intakes/${b}/pathway`, { path: null });
      assert.deepEqual([cleared.status, cleared.body.pathway, intakeRow(t, b).pathway, intakeRow(t, b).pathway_source], [200, null, null, 'staff']);
      for (const bad of ['company/counsel/account', 'nope/x', 'litigation/../x', 42]) {
        const r = await admin.put(`/api/admin/intakes/${b}/pathway`, { path: bad });
        assert.equal(r.status, 400, String(bad));
        assert.equal(r.body.details.fields.path, 'اختاروا مسارًا صحيحًا أو اتركوه دون تحديد.');
      }
      assert.equal((await admin.put(`/api/admin/intakes/${b}/pathway`, { path: 'consultation', reason: 'x'.repeat(301) })).status, 400);
      assert.equal((await admin.put('/api/admin/intakes/99999/pathway', { path: 'consultation' })).status, 404);
      // staff value wins over automatic sources
      assert.equal(t.app.pathways.set(b, 'company', { source: 'wa_menu' }), null);
    } finally {
      await t.close();
    }
  });

  test('permissions: case manager 200, lawyer 403, company session 401 on the new staff routes', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const i = t.app.db.get("SELECT id FROM intakes WHERE status IN ('new','in_review','awaiting_client') ORDER BY id LIMIT 1");
      const cl = t.app.db.get('SELECT id FROM clients ORDER BY id LIMIT 1');
      const mgr = await t.login('manager');
      assert.equal((await mgr.put(`/api/admin/intakes/${i.id}/pathway`, { path: 'consultation' })).status, 200);
      assert.equal((await mgr.del(`/api/admin/clients/${cl.id}/auto-opt-out`)).status, 200);
      const lawyer = await t.login('ahmed');
      assert.equal((await lawyer.put(`/api/admin/intakes/${i.id}/pathway`, { path: 'consultation' })).status, 403);
      assert.equal((await lawyer.del(`/api/admin/clients/${cl.id}/auto-opt-out`)).status, 403);
      assert.equal((await lawyer.get('/api/admin/analytics/entry-tree')).status, 403);
      const co = t.client();
      const login = await co.post('/api/company/auth/login', { email: 'mariam@nilefoods.example', password: 'Company@2026' });
      if (login.status === 200) {
        const set = login.headers.get('set-cookie') || '';
        const m = /(bm_csid=[^;]*)/.exec(set);
        if (m) co.cookie = m[1];
        assert.equal((await co.put(`/api/admin/intakes/${i.id}/pathway`, { path: 'consultation' })).status, 401);
        assert.equal((await co.del(`/api/admin/clients/${cl.id}/auto-opt-out`)).status, 401);
      }
    } finally {
      await t.close();
    }
  });

  test('SL-T10 (part): lawyer and company payloads never carry service_line, pathway or pathway_labels', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      t.app.db.run("UPDATE intakes SET service_line = 'litigation', pathway = 'litigation/defend/family', pathway_source = 'staff'");
      const lawyer = await t.login('ahmed');
      const bad = /"(service_line|pathway|pathway_labels|pathway_source|lines_menu_sent_at|wa_auto_opt_out_at)"/;
      const paths = ['/api/lawyer/assignments', '/api/lawyer/today', '/api/lawyer/calendar', '/api/lawyer/matters'];
      const asg = t.app.db.all("SELECT a.id FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE u.username = 'ahmed' LIMIT 5");
      for (const a of asg) paths.push(`/api/lawyer/assignments/${a.id}`);
      for (const p of paths) {
        const r = await lawyer.get(p);
        if (r.status !== 200) continue;
        assert.ok(!bad.test(JSON.stringify(r.body)), `${p} leaks a pathway field`);
      }
    } finally {
      await t.close();
    }
  });

  test('DELETE /api/admin/clients/:id/auto-opt-out clears the stop with an audit row (L12-77)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      paidOn(t);
      wa(t, PAID, { from: '201012340010', text: 'إيقاف' });
      const i = lastIntake(t);
      assert.ok(t.app.db.value('SELECT wa_auto_opt_out_at FROM clients WHERE id = ?', i.client_id));
      const admin = await t.login('admin');
      const d = (await admin.get(`/api/admin/intakes/${i.id}`)).body;
      assert.ok(d.auto_opt_out_at);
      assert.equal((await admin.get('/api/admin/intakes')).body.items.find((x) => x.id === i.id).auto_opt_out, true);
      const r = await admin.del(`/api/admin/clients/${i.client_id}/auto-opt-out`);
      assert.deepEqual([r.status, r.body.cleared], [200, true]);
      assert.equal(t.app.db.value('SELECT wa_auto_opt_out_at FROM clients WHERE id = ?', i.client_id), null);
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'client.auto_opt_out_cleared'"));
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE client_id = ? AND type = 'client.auto_opt_out_cleared'", i.client_id));
      assert.equal((await admin.del(`/api/admin/clients/${i.client_id}/auto-opt-out`)).body.cleared, false, 'second call is a no-op');
      assert.equal((await admin.del('/api/admin/clients/99999/auto-opt-out')).status, 404);
    } finally {
      await t.close();
    }
  });

  test('dashboard «حسب نوع الطلب»: new today and open per line plus «لم يُحدَّد النوع»', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const r = await c.post('/api/public/intake', { consent: true, phone: '01012340021', description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', segment: 'paid' });
      const id = t.app.db.value('SELECT id FROM intakes WHERE code = ?', r.body.reference);
      t.app.pathways.set(id, 'litigation/new/family', { source: 'website' });
      await c.post('/api/public/intake', { consent: true, phone: '01012340022', description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', segment: 'paid' });
      // review (F1): طلب «خيري» لا نوع له ولا يُعد في «لم يُحدَّد النوع» (كان 29 في البيانات التجريبية بدل 4)
      await c.post('/api/public/intake', { consent: true, phone: '01012340023', description: 'جوزي اتوفى من سنة وسايب شقة باسمه وأهله عايزين يبيعوها', segment: 'charity' });
      const admin = await t.login('admin');
      const d = (await admin.get('/api/admin/dashboard')).body;
      assert.deepEqual(
        d.lines.map((l) => [l.line, l.label, l.new_today, l.open]),
        [
          ['consultation', 'استشارة', 0, 0],
          ['litigation', 'دعوى قضائية', 1, 1],
          ['company', 'شركات', 0, 0],
          ['none', 'لم يُحدَّد النوع', 1, 1],
        ],
      );
      // الأربعة معًا = «أفراد وشركات» المفتوحة في «حسب نوع الخدمة»، وأعداد صندوق الوارد على النطاق نفسه (?segment=paid) مطابقة
      assert.equal(d.lines.reduce((n, l) => n + l.open, 0), d.segments.paid.open);
      const inbox = (await admin.get('/api/admin/intakes?segment=paid')).body.line_counts;
      for (const l of d.lines) assert.equal(inbox[l.line], l.open, l.line);
      assert.equal((await admin.get('/api/admin/intakes')).body.line_counts.none, 1, 'even with every segment, none counts paid requests only');
      // الروابط تفتح صندوق الوارد على «أفراد وشركات» (لا على آخر نوع خدمة محفوظ في المتصفح)
      assert.match(read('public/assets/js/app/pages/admin/dashboard.js'), /href: `#\/inbox\?segment=paid&line=\$\{encodeURIComponent\(l\.line\)\}`/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-4: الإشارات والأرشفة ═════════════════════════
describe('v12 staff-lines SL-4: WhatsApp tagging, archive guards, website default, returning charity', () => {
  test('SL-T12: a tree sentence on WhatsApp → paid, pathway set (wa_tag), not a fact, no menu; PAID_GENERIC → paid, no pathway, menu', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      menuOn(t);
      t.app.settings.set('story_welcome_enabled', true);
      wa(t, 'PNMAIN', { from: '201012340031', text: prefillFor('litigation/defend/family') });
      let i = lastIntake(t);
      assert.deepEqual([i.segment, i.segment_source, i.pathway, i.service_line, i.pathway_source], ['paid', 'wa_tag', 'litigation/defend/family', 'litigation', 'wa_tag']);
      assert.equal(Number(i.story_rev), 0, 'the sentence alone is not a fact');
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'intake.pathway_set'", i.id));
      assert.deepEqual(rules(t, i.id), [], 'no menu, no welcome after a tree sentence');
      // الجملة العامة: أفراد وشركات بلا مسار، ثم القائمة (W-01)
      wa(t, 'PNMAIN', { from: '201012340032', text: PAID_GENERIC });
      i = lastIntake(t);
      assert.deepEqual([i.segment, i.pathway], ['paid', null]);
      const out = outbox(t, i.id);
      assert.deepEqual(out.map((m) => m.automation_rule), ['lines_menu']);
      assert.deepEqual(out[0].meta.wa.buttons.map((b) => [b.id, b.title]), [['line:consultation', 'استشارة'], ['line:litigation', 'رفع دعوى قضائية'], ['line:company', 'تأسيس شركات']]);
      // الجملة العامة + قصة طويلة: لا قائمة (الفريق والتحليل يصنّفان)
      wa(t, 'PNMAIN', { from: '201012340033', text: `${PAID_GENERIC} عندي مشكلة مع صاحب العمل لأنه فصلني من الشغل بدون إنذار ولا مستحقات` });
      assert.ok(!rules(t, lastIntake(t).id).includes('lines_menu'));
      // جملة الشركات ← company/counsel
      wa(t, 'PNMAIN', { from: '201012340034', text: 'مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.' });
      assert.deepEqual([lastIntake(t).segment, lastIntake(t).pathway], ['paid', 'company/counsel']);
      // خدمة الشركات متوقفة: جملة الشركات ← «شركات» وحدها
      t.app.settings.set('b2b_enabled', false);
      wa(t, 'PNMAIN', { from: '201012340035', text: 'مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.' });
      assert.equal(lastIntake(t).pathway, 'company');
    } finally {
      await t.close();
    }
  });

  test('review F6: a tree sentence and a leaf row of the menu store topic/area like the website (paid only, never over a value)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      menuOn(t);
      // جملة ورقة على واتساب ← المجال كما يحفظه الموقع لنفس الورقة
      wa(t, 'PNMAIN', { from: '201012349001', text: prefillFor('litigation/defend/family') });
      let i = lastIntake(t);
      assert.deepEqual([i.segment, i.pathway, i.legal_area], ['paid', 'litigation/defend/family', 'FAM']);
      const web = await t.client().post('/api/public/intake', { consent: true, phone: '01012349003', description: 'وصلني إعلان بدعوى نفقة من طليقتي والجلسة بعد أسبوعين', segment: 'paid', pathway: 'litigation/defend/family' });
      assert.equal(web.status, 201, JSON.stringify(web.body));
      assert.equal(t.app.db.value('SELECT legal_area FROM intakes WHERE code = ?', web.body.reference), 'FAM', 'the website stores the same area for the same leaf');
      // جملة «خيري» لا مجال من الشجرة
      wa(t, 'PNMAIN', { from: '201012349004', text: 'مرحبا' });
      assert.equal(lastIntake(t).legal_area, null);
      // صف ورقة من القائمة (company/other، المجال COM) بعد الأزرار
      wa(t, 'PNMAIN', { from: '201012349002', text: PAID_GENERIC });
      i = lastIntake(t);
      assert.deepEqual(rules(t, i.id), ['lines_menu']);
      waReply(t, 'PNMAIN', { from: '201012349002', id: 'line:company', title: 'تأسيس شركات' });
      waReply(t, 'PNMAIN', { from: '201012349002', id: 'path:company/other', title: 'موضوع آخر للشركة', list: true });
      i = intakeRow(t, i.id);
      assert.deepEqual([i.pathway, i.pathway_source, i.legal_area], ['company/other', 'wa_menu', 'COM']);
      // لا يغلب مجالًا موجودًا
      wa(t, 'PNMAIN', { from: '201012349005', text: PAID_GENERIC });
      const j = lastIntake(t);
      t.app.db.run("UPDATE intakes SET legal_area = 'LAB' WHERE id = ?", j.id);
      waReply(t, 'PNMAIN', { from: '201012349005', id: 'line:company', title: 'تأسيس شركات' });
      waReply(t, 'PNMAIN', { from: '201012349005', id: 'path:company/other', title: 'موضوع آخر للشركة', list: true });
      assert.deepEqual([intakeRow(t, j.id).pathway, intakeRow(t, j.id).legal_area], ['company/other', 'LAB']);
    } finally {
      await t.close();
    }
  });

  test('SL-T07 (changed): archived → v11 choice buttons never sent even when enabled; rule g → NULL + hint; readiness wa_main_charity_archived; restored → v11', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => (String(url).startsWith('https://graph.facebook.com/') ? new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 }) : orig(url, init));
    try {
      const keys = () => t.app.segments.readiness().map((x) => x.key);
      assert.ok(keys().includes('wa_main_charity_archived'), 'main in charity mode while archived');
      assert.match(t.app.segments.readiness().find((x) => x.key === 'wa_main_charity_archived').title, /الخدمة الخيرية متوقفة على الموقع، لكن الرقم الأساسي في وضع «خيري»/);
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('segment_returning_days', 0);
      t.app.settings.set('wa_segment_choice_enabled', true);
      assert.ok(!keys().includes('wa_main_charity_archived'), 'shared mode: no warning');
      assert.ok(!keys().includes('wa_shared_choice') && !keys().includes('wa_choice_privacy'), 'choice readiness suppressed while archived');
      wa(t, 'PN123', { from: '201012340041', text: 'السلام عليكم عندي سؤال' });
      let i = lastIntake(t);
      assert.equal(i.segment, null, 'rule g unchanged (L12-07)');
      assert.equal(i.segment_choice_sent_at, null);
      assert.ok(!rules(t, i.id).includes('segment_choice'));
      // إعادة «خيري» ← سلوك 11.0
      t.app.settings.set('charity_public', true);
      wa(t, 'PN123', { from: '201012340042', text: 'السلام عليكم عندي سؤال' });
      i = lastIntake(t);
      assert.ok(rules(t, i.id).includes('segment_choice'), 'restored: v11 buttons');
    } finally {
      globalThis.fetch = orig;
      await t.close();
    }
  });

  test('SL-T17: website POST without segment → paid while archived, the stored default when restored; returning charity flagged for staff only', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const body = (o = {}) => ({ consent: true, phone: '01012340051', description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', ...o });
      let r = await c.post('/api/public/intake', body(), { cookie: 'bm_seg=charity' });
      let i = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.body.reference);
      assert.deepEqual([i.segment, i.segment_source], ['paid', 'website_default'], 'archived: cookie ignored, paid');
      assert.equal(t.app.segments.intakeBlock(i).source_label, 'الموقع بدون اختيار، أفراد وشركات افتراضيًا');
      t.app.settings.set('charity_public', true);
      r = await c.post('/api/public/intake', body({ phone: '01012340052' }));
      i = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.body.reference);
      assert.deepEqual([i.segment, i.segment_source], ['charity', 'website_default'], 'restored: segment_website_default');
      r = await c.post('/api/public/intake', body({ phone: '01012340053' }), { cookie: 'bm_seg=paid' });
      assert.equal(t.app.db.value('SELECT segment FROM intakes WHERE code = ?', r.body.reference), 'paid', 'restored: cookie read');
      t.app.settings.set('charity_public', false);
      // «سبق التعامل مع خيري»: طلب خيري قبل 100 يوم لنفس الرقم
      freezeClock(new Date(Date.now() - 100 * 86400000).toISOString());
      await c.post('/api/public/intake', body({ phone: '01012340054', segment: 'charity' }));
      resetClock();
      const fresh = await c.post('/api/public/intake', body({ phone: '01012340055', segment: 'paid' }));
      const back = await c.post('/api/public/intake', body({ phone: '01012340054', segment: 'paid' }));
      const id = (x) => t.app.db.value('SELECT id FROM intakes WHERE code = ?', x.body.reference);
      assert.equal(t.app.segments.markReturningCharity(id(fresh)), false);
      assert.equal(t.app.segments.markReturningCharity(id(back)), true);
      assert.equal(JSON.parse(intakeRow(t, id(back)).segment_hint).returning_charity, true);
      assert.equal(intakeRow(t, id(back)).segment, 'paid', 'no automatic segment change');
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'segment.returning_charity'", id(back)));
      const admin = await t.login('admin');
      assert.equal((await admin.get(`/api/admin/intakes/${id(back)}`)).body.returning_charity, true);
      assert.equal((await admin.get('/api/admin/intakes')).body.items.find((x) => x.id === id(back)).returning_charity, true);
      // لا فرق يراه صاحب الطلب: نفس شكل رد 201 لرقم جديد ولرقم عائد
      const strip = (b) => JSON.stringify(b, (k, v) => (['reference', 'portal_url', 'portal_link', 'wa_link', 'confirm_code', 'code', 'ref'].includes(k) ? undefined : v)).replace(/REQ-\d{4}-\d{5}/g, 'REQ').replace(/%20\d{6}/g, '%20CODE');
      assert.equal(strip(back.body), strip(fresh.body));
    } finally {
      resetClock();
      await t.close();
    }
  });
});

// ═════════════════════════ SL-5: قائمة الخدمات ═════════════════════════
describe('v12 staff-lines SL-5: the WhatsApp lines menu (E12-80…85, L12-77…79)', () => {
  test('SL-T04: «مرحبا» on the paid line → one W-01; second message none; setting off none; long story none; unknown number none; outgoing in 24 h none', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      paidOn(t);
      menuOn(t);
      t.app.settings.set('story_welcome_enabled', true);
      wa(t, PAID, { from: '201012340061', text: 'مرحبا' });
      let i = lastIntake(t);
      assert.equal(i.segment, 'paid');
      assert.ok(i.lines_menu_sent_at);
      const out = outbox(t, i.id);
      assert.deepEqual(out.map((m) => m.automation_rule), ['lines_menu'], 'the menu replaces the paid welcome');
      assert.equal(out[0].body, `أهلًا بكم في ${t.app.brand.displayName()}. اختاروا نوع الخدمة، أو اكتبوا موضوعكم مباشرة.`);
      assert.deepEqual([out[0].meta.wa.type, out[0].meta.wa.session_only, out[0].meta.portal_hidden, out[0].automated], ['buttons', true, true, 1]);
      assert.equal(out[0].meta.wa.footer, 'ويمكنكم إرسال صور المستندات هنا.');
      // firm_legal_name يغلب brand_name (L12-85)
      t.app.settings.set('firm_legal_name', 'إمام وشركاه');
      wa(t, PAID, { from: '201012340062', text: 'مرحبا' });
      assert.equal(outbox(t, lastIntake(t).id)[0].body, 'أهلًا بكم في إمام وشركاه. اختاروا نوع الخدمة، أو اكتبوا موضوعكم مباشرة.');
      // رسالة ثانية في نفس الطلب: لا قائمة ثانية
      wa(t, PAID, { from: '201012340061', text: 'مساء الخير' });
      assert.equal(rules(t, i.id).filter((r) => r === 'lines_menu').length, 1);
      // قصة طويلة في أول رسالة: لا قائمة
      wa(t, PAID, { from: '201012340063', text: 'جوزي اتوفى من سنة وسايب شقة باسمه وأهله عايزين يبيعوها وعايزة أعرف حقي' });
      assert.ok(!rules(t, lastIntake(t).id).includes('lines_menu'));
      // الإعداد متوقف: لا قائمة
      t.app.settings.set('wa_lines_menu_enabled', false);
      wa(t, PAID, { from: '201012340064', text: 'مرحبا' });
      assert.ok(!rules(t, lastIntake(t).id).includes('lines_menu'));
      menuOn(t);
      // رقم غير مضبوط: لا رد آلي
      const pu = waPayload({ from: '201012340065', text: 'مرحبا' });
      t.app.engine.handleWhatsAppWebhook(pu, { line: { key: 'unknown', pid: 'SIM-UNKNOWN', digits: '', mode: null } });
      i = lastIntake(t);
      assert.equal(i.wa_line, 'unknown');
      assert.deepEqual(rules(t, i.id), []);
      // رسالة صادرة لنفس الشخص خلال 24 ساعة (القائمة الأولى) ومرة لكل شخص في 30 يومًا: طلب جديد لا تصله قائمة ثانية
      wa(t, PAID, { from: '201012340066', text: 'مرحبا' });
      const j = lastIntake(t);
      assert.ok(rules(t, j.id).includes('lines_menu'));
      t.app.db.run("UPDATE intakes SET status = 'archived' WHERE id = ?", j.id);
      wa(t, PAID, { from: '201012340066', text: 'مرحبا' });
      const k = lastIntake(t);
      assert.notEqual(k.id, j.id);
      assert.ok(!rules(t, k.id).includes('lines_menu'));
    } finally {
      await t.close();
    }
  });

  test('SL-T05: button line:litigation → pathway + one list of 5 rows; row path:litigation/defend → W-05 once; company/counsel → W-06 with /company; replies are not facts', async () => {
    const t = await startTestApp({ seed: 'none', config: { publicBaseUrl: 'https://emam.example' } });
    try {
      paidOn(t);
      menuOn(t);
      wa(t, PAID, { from: '201012340071', text: 'مرحبا' });
      const i = lastIntake(t);
      const rev0 = Number(intakeRow(t, i.id).story_rev);
      waReply(t, PAID, { from: '201012340071', id: 'line:litigation', title: 'رفع دعوى قضائية' });
      let row = intakeRow(t, i.id);
      assert.deepEqual([row.service_line, row.pathway, row.pathway_source], ['litigation', 'litigation', 'wa_menu']);
      let out = outbox(t, i.id);
      const list = out.find((m) => m.automation_rule === 'lines_list');
      assert.ok(list);
      assert.deepEqual([list.body, list.meta.wa.type, list.meta.wa.header, list.meta.wa.button, list.meta.wa.session_only], ['ما وضع القضية؟', 'list', 'رفع دعوى قضائية', 'عرض الاختيارات', true]);
      assert.deepEqual(
        list.meta.wa.sections[0].rows.map((r) => [r.id, r.title, r.description || null]),
        [
          ['path:litigation/new', 'رفع دعوى جديدة', null],
          ['path:litigation/defend', 'الرد على دعوى مرفوعة', 'وصلكم إعلان أو رُفعت عليكم دعوى'],
          ['path:litigation/ongoing', 'قضية أمام المحكمة الآن', null],
          ['path:litigation/judgment', 'صدر حكم', 'تنفيذه أو الطعن عليه'],
          ['path:litigation/paper', 'ورقة من المحكمة أو القسم', 'ولا تعرفون ما المطلوب'],
        ],
      );
      // نفس الزر مرة أخرى: لا قائمة ثانية
      waReply(t, PAID, { from: '201012340071', id: 'line:litigation', title: 'رفع دعوى قضائية' });
      assert.equal(rules(t, i.id).filter((r) => r === 'lines_list').length, 1);
      waReply(t, PAID, { from: '201012340071', id: 'path:litigation/defend', title: 'الرد على دعوى مرفوعة', list: true });
      row = intakeRow(t, i.id);
      assert.deepEqual([row.pathway, row.pathway_source], ['litigation/defend', 'wa_menu']);
      out = outbox(t, i.id);
      const next = out.filter((m) => m.automation_rule === 'lines_next');
      assert.equal(next.length, 1);
      assert.equal(next[0].body, LINES_MENU_TEXTS.lines_next);
      assert.match(next[0].body, /خلاص/);
      assert.match(next[0].body, /الأتعاب/);
      waReply(t, PAID, { from: '201012340071', id: 'path:litigation/ongoing', title: 'قضية أمام المحكمة الآن', list: true });
      assert.equal(rules(t, i.id).filter((r) => r === 'lines_next').length, 1, 'W-05 once');
      assert.equal(Number(intakeRow(t, i.id).story_rev), rev0, 'menu replies never move story_rev');
      assert.match(t.app.db.value("SELECT summary FROM activity WHERE intake_id = ? AND type = 'intake.pathway_set' ORDER BY id DESC LIMIT 1", i.id), /من قائمة واتساب/);
      // الشركات: مستشار قانوني ← W-06 برابط /company
      wa(t, PAID, { from: '201012340072', text: 'مرحبا' });
      const c = lastIntake(t);
      waReply(t, PAID, { from: '201012340072', id: 'line:company', title: 'تأسيس شركات' });
      const clist = outbox(t, c.id).find((m) => m.automation_rule === 'lines_list');
      assert.deepEqual(clist.meta.wa.sections[0].rows.map((r) => r.id), ['path:company/new', 'path:company/counsel', 'path:company/change', 'path:company/contracts', 'path:company/other']);
      waReply(t, PAID, { from: '201012340072', id: 'path:company/counsel', title: 'مستشار قانوني للشركة', list: true });
      const w6 = outbox(t, c.id).find((m) => m.automation_rule === 'lines_next');
      assert.equal(w6.body, 'شكرًا لكم. سيتواصل معكم فريقنا لترتيب عرض يناسب شركتكم. وإن كان لشركتكم حساب لدينا، فادخلوا من: https://emam.example/company');
      // صف مخرج أو مسار غير صالح: نص عادي، بلا مسار
      wa(t, PAID, { from: '201012340073', text: 'مرحبا' });
      const e = lastIntake(t);
      waReply(t, PAID, { from: '201012340073', id: 'path:company/counsel/account', title: 'x', list: true });
      waReply(t, PAID, { from: '201012340073', id: 'path:../../etc', title: 'x', list: true });
      assert.equal(intakeRow(t, e.id).pathway, null);
    } finally {
      await t.close();
    }
  });

  test('SL-T18: W-03 has 5 rows (incl. litigation/paper); W-04 5 rows (incl. company/other) and 4 with B2B off', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const ids = (line) => t.app.segments.linesList(line).wa.sections[0].rows.map((r) => r.id);
      assert.equal(ids('litigation').length, 5);
      assert.ok(ids('litigation').includes('path:litigation/paper'));
      assert.equal(ids('company').length, 5);
      assert.ok(ids('company').includes('path:company/other'));
      assert.equal(ids('consultation').length, 6);
      assert.equal(t.app.segments.linesList('company').body, 'ما الذي تحتاجونه؟');
      t.app.settings.set('b2b_enabled', false);
      assert.equal(ids('company').length, 4);
      assert.ok(!ids('company').includes('path:company/counsel'));
      // W-06 بلا رابط عام: الجملة الأولى وحدها
      t.app.settings.set('b2b_enabled', true);
      assert.equal(t.app.segments.linesNextText('company/counsel'), LINES_MENU_TEXTS.lines_counsel);
      assert.equal(t.app.segments.linesNextText('consultation/family'), LINES_MENU_TEXTS.lines_next);
    } finally {
      await t.close();
    }
  });

  test('SL-T06: typed «2», «قضية», «٣» map while the menu is open; long text after W-01 is story and stops the menu; staff value never overwritten', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      paidOn(t);
      menuOn(t);
      const flow = (from, typed) => {
        wa(t, PAID, { from, text: 'مرحبا' });
        const i = lastIntake(t);
        wa(t, PAID, { from, text: typed });
        return intakeRow(t, i.id);
      };
      const first = flow('201012340081', '2');
      assert.equal(first.pathway, 'litigation');
      assert.equal(flow('201012340082', 'قضية').pathway, 'litigation');
      assert.equal(flow('201012340083', '٣').pathway, 'company');
      assert.equal(flow('201012340084', 'استشارة').pathway, 'consultation');
      // صف مكتوب برقمه بعد الخط
      wa(t, PAID, { from: '201012340081', text: '2' });
      assert.equal(intakeRow(t, first.id).pathway, 'litigation/defend');
      assert.deepEqual(rules(t, first.id), ['lines_menu', 'lines_list', 'lines_next']);
      // نص طويل بعد W-01 = قصة: لا رد، والأرقام بعده لا تُفهم اختيارًا
      wa(t, PAID, { from: '201012340085', text: 'مرحبا' });
      const s = lastIntake(t);
      wa(t, PAID, { from: '201012340085', text: 'عندي مشكلة مع المالك عايز يطردني من الشقة' });
      wa(t, PAID, { from: '201012340085', text: '1' });
      assert.equal(intakeRow(t, s.id).pathway, null);
      assert.deepEqual(rules(t, s.id), ['lines_menu']);
      // قيمة الفريق تغلب القائمة
      wa(t, PAID, { from: '201012340086', text: 'مرحبا' });
      const st = lastIntake(t);
      t.app.pathways.set(st.id, 'consultation/work', { source: 'staff' });
      waReply(t, PAID, { from: '201012340086', id: 'line:company', title: 'تأسيس شركات' });
      assert.deepEqual([intakeRow(t, st.id).pathway, intakeRow(t, st.id).pathway_source], ['consultation/work', 'staff']);
      assert.ok(!rules(t, st.id).includes('lines_list'));
    } finally {
      await t.close();
    }
  });

  test('SL-T15: line:* on the charity line or on a charity intake is stored as text; an interactive reply is never a short first message', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => (String(url).startsWith('https://graph.facebook.com/') ? new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), { status: 200 }) : orig(url, init));
    try {
      menuOn(t);
      t.app.settings.set('story_welcome_enabled', true);
      t.app.integrations.set('whatsapp', { paid_phone_number_id: 'PAIDID', paid_number: '201000000002' }, admin0(t));
      t.app.segments.markPaidVerified('PAIDID', '201000000002');
      // الرقم الأساسي «خيري» بوجود رقم مخصص: رد line:litigation = نص، ولا مسار
      waReply(t, 'PN123', { from: '201012340091', id: 'line:litigation', title: 'رفع دعوى قضائية' });
      let i = lastIntake(t);
      assert.equal(i.segment, 'charity');
      assert.equal(i.pathway, null);
      assert.equal(JSON.parse(t.app.db.value("SELECT meta FROM messages WHERE intake_id = ? AND direction = 'in'", i.id)).lines_reply, undefined);
      assert.deepEqual(rules(t, i.id).filter((r) => /^lines_|story_welcome/.test(r)), [], 'interactive reply: no menu, no welcome');
      // الجملة العامة على الرقم الأساسي «خيري» بوجود رقم مخصص: أفراد وشركات لكن بلا قائمة (ليس رقمهم)
      wa(t, 'PN123', { from: '201012340092', text: PAID_GENERIC });
      i = lastIntake(t);
      assert.equal(i.segment, 'paid');
      assert.ok(!rules(t, i.id).includes('lines_menu'));
      // رد line:* على رقم الأفراد والشركات لطلب «خيري»: نص
      wa(t, 'PAIDID', { from: '201012340093', text: 'مرحبا' });
      i = lastIntake(t);
      t.app.db.run("UPDATE intakes SET segment = 'charity' WHERE id = ?", i.id);
      waReply(t, 'PAIDID', { from: '201012340093', id: 'line:company', title: 'تأسيس شركات' });
      assert.equal(intakeRow(t, i.id).pathway, null);
      // على رقم الأفراد والشركات لطلبهم: يُقبل
      wa(t, 'PAIDID', { from: '201012340094', text: 'مرحبا' });
      i = lastIntake(t);
      assert.ok(rules(t, i.id).includes('lines_menu'));
      waReply(t, 'PAIDID', { from: '201012340094', id: 'line:company', title: 'تأسيس شركات' });
      assert.equal(intakeRow(t, i.id).pathway, 'company');
    } finally {
      globalThis.fetch = orig;
      await t.close();
    }
  });

  test('SL-T11: the menu is session-only (outside 24 h it fails quietly, never a template); a website request sends zero WhatsApp rows', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const orig = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      if (!String(url).startsWith('https://graph.facebook.com/')) return orig(url, init);
      calls.push({ url: String(url), body: init.body });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT.${calls.length}` }] }), { status: 200 });
    };
    try {
      menuOn(t);
      t.app.integrations.set('whatsapp', { paid_phone_number_id: 'PAIDID', paid_number: '201000000002' }, admin0(t));
      t.app.segments.markPaidVerified('PAIDID', '201000000002');
      // نافذة مغلقة عند الإرسال الفعلي: الرسالة تفشل بهدوء ولا يخرج قالب
      wa(t, 'PAIDID', { from: '201012340101', text: 'مرحبا' });
      const i = lastIntake(t);
      const menu = outbox(t, i.id).find((m) => m.automation_rule === 'lines_menu');
      assert.ok(menu);
      t.app.db.run("UPDATE messages SET status = 'queued' WHERE id = ?", menu.id);
      t.app.db.run("UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z' WHERE intake_id = ? AND direction = 'in'", i.id);
      const before = calls.length;
      await t.app.engine.dispatch(menu.id);
      const m = t.app.db.get('SELECT status, error FROM messages WHERE id = ?', menu.id);
      assert.equal(m.status, 'failed');
      assert.equal(calls.length, before, 'no template, no call');
      // طلب من الموقع: لا رسالة واتساب أبدًا (B91-01)
      const c = t.client();
      const r = await c.post('/api/public/intake', { consent: true, phone: '01012340102', description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', segment: 'paid' });
      const w = t.app.db.value("SELECT id FROM intakes WHERE code = ?", r.body.reference);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE intake_id = ? AND direction = 'out' AND channel = 'whatsapp'", w)), 0);
    } finally {
      globalThis.fetch = orig;
      await t.close();
    }
  });

  test('SL-T14: stop word «إيقاف» → opted out; next first message gets no W-01/welcome; a staff reply still goes; «توقف المعاش» does nothing', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      paidOn(t);
      menuOn(t);
      t.app.settings.set('story_welcome_enabled', true);
      wa(t, PAID, { from: '201012340111', text: 'توقف المعاش' });
      let i = lastIntake(t);
      assert.equal(t.app.db.value('SELECT wa_auto_opt_out_at FROM clients WHERE id = ?', i.client_id), null);
      wa(t, PAID, { from: '201012340112', text: 'إيقاف' });
      i = lastIntake(t);
      const cid = i.client_id;
      assert.ok(t.app.db.value('SELECT wa_auto_opt_out_at FROM clients WHERE id = ?', cid));
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE client_id = ? AND type = 'client.auto_opt_out'", cid));
      assert.deepEqual(rules(t, i.id), [], 'no automatic acknowledgement, no menu');
      assert.equal(Number(i.story_rev), 0, 'the stop word is not a fact');
      t.app.db.run("UPDATE intakes SET status = 'archived' WHERE id = ?", i.id);
      t.app.db.run("UPDATE messages SET created_at = '2020-01-01T00:00:00.000Z' WHERE client_id = ?", cid);
      wa(t, PAID, { from: '201012340112', text: 'مرحبا' });
      const j = lastIntake(t);
      assert.notEqual(j.id, i.id);
      assert.deepEqual(rules(t, j.id), [], 'no W-01, no welcome for an opted-out person');
      // رسالة آلية من قاعدة في OPT_OUT_RULES تُسقط؛ رد الفريق يصل
      const skipped = t.app.engine.sendToClient({ client_id: cid, intake_id: j.id, body: 'x', channel: 'whatsapp', automated: true, rule: 'story_ack' });
      assert.equal(skipped.skipped, 'opted_out');
      const admin = await t.login('admin');
      const reply = await admin.post(`/api/admin/intakes/${j.id}/reply`, { body: 'مرحبًا، نحن معكم.', channel: 'whatsapp' });
      assert.ok([200, 201].includes(reply.status), JSON.stringify(reply.body));
      assert.ok(t.app.db.get("SELECT 1 FROM messages WHERE intake_id = ? AND direction = 'out' AND automated = 0", j.id), 'staff reply recorded');
      const hearing = t.app.engine.sendToClient({ client_id: cid, intake_id: j.id, body: 'تذكير', channel: 'whatsapp', automated: true, rule: 'hearing_reminder' });
      assert.ok(hearing.id, 'hearing reminders are unaffected');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-6: سطر السياق ═════════════════════════
describe('v12 staff-lines SL-6: AI context line (E12-54, L12-28)', () => {
  test('SL-T08: a paid request with a pathway adds exactly one context line; a charity request never changes, even with a staff pathway', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const body = (o) => ({ consent: true, phone: '01012340121', description: 'جوزي اتوفى من سنة وسايب شقة باسمه وأهله عايزين يبيعوها', ...o });
      const p = await c.post('/api/public/intake', body({ segment: 'paid' }));
      const ch = await c.post('/api/public/intake', body({ segment: 'charity', phone: '01012340122' }));
      const pid = t.app.db.value('SELECT id FROM intakes WHERE code = ?', p.body.reference);
      const cid = t.app.db.value('SELECT id FROM intakes WHERE code = ?', ch.body.reference);
      const pBefore = t.app.stories.storyText(pid);
      const cBefore = t.app.stories.storyText(cid);
      t.app.pathways.set(pid, 'consultation/family/inheritance', { source: 'website' });
      t.app.pathways.set(cid, 'consultation/family/inheritance', { source: 'staff' });
      const pAfter = t.app.stories.storyText(pid);
      const cAfter = t.app.stories.storyText(cid);
      assert.equal(pAfter.contextText, `[المسار الذي اختاره: استشارة › الأسرة والميراث › الميراث]\n${pBefore.contextText}`);
      assert.equal(pAfter.clientText, pBefore.clientText, 'never in the client text');
      assert.equal(cAfter.contextText, cBefore.contextText, 'charity context byte-identical');
      assert.equal(t.app.pathways.storyLine(intakeRow(t, cid)), null);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-7: الإعدادات وسجل الأمان (build-2) ═════════════════════════
describe('v12 staff-lines SL-7: «الصفحة الأولى», lines-menu toggle, SETTINGS_AUDIT, H-M3', () => {
  const rowsOf = (t, type) => t.app.db.all('SELECT * FROM security_events WHERE type = ? ORDER BY id', type).map((r) => ({ ...r, data: JSON.parse(r.data || '{}') }));

  test('SL-T09: charity_public and wa_lines_menu_enabled write one {from,to} row each; unchanged values write none; case manager 403', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      t.app.settings.set('wa_lines_menu_enabled', false);
      let r = await admin.patch('/api/admin/settings', { charity_public: true });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      let rows = rowsOf(t, 'settings.charity_public_changed');
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0].data.from, rows[0].data.to, rows[0].severity], [false, true, 'warning']);
      assert.match(rows[0].summary, /تغيير ظهور «خيري» على الموقع: متوقف ← مفعّل/);
      r = await admin.patch('/api/admin/settings', { wa_lines_menu_enabled: true, charity_public: true });
      assert.equal(r.status, 200);
      assert.equal(rowsOf(t, 'settings.charity_public_changed').length, 1, 'unchanged value → no extra row');
      rows = rowsOf(t, 'settings.wa_lines_menu_changed');
      assert.deepEqual(rows.map((x) => [x.data.from, x.data.to]), [[false, true]]);
      assert.ok(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'settings.updated'") >= 2, 'the summary row stays');
      await admin.patch('/api/admin/settings', { wa_lines_menu_enabled: true });
      assert.equal(rowsOf(t, 'settings.wa_lines_menu_changed').length, 1);
      const mgr = await t.login('manager');
      assert.equal((await mgr.patch('/api/admin/settings', { charity_public: false })).status, 403);
      assert.equal((await mgr.patch('/api/admin/settings', { wa_lines_menu_enabled: false })).status, 403);
      assert.equal(t.app.settings.get('charity_public'), true);
      assert.equal((await t.client().patch('/api/admin/settings', { charity_public: false })).status, 401);
    } finally {
      await t.close();
    }
  });

  test('SL-T19: rows for charity_archived_landing, firm_partners (count only), stt_charity_third_party and ocr_claude_companies (warning); afterSettings once per save with (changedKeys, before)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const calls = [];
      const real = t.app.media?.afterSettings;
      if (t.app.media) t.app.media.afterSettings = (keys, before) => (calls.push({ keys: [...keys], before: { ...before } }), real?.call(t.app.media, keys, before));
      let r = await admin.patch('/api/admin/settings', { charity_archived_landing: 'redirect' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(rowsOf(t, 'settings.charity_landing_changed').map((x) => [x.data.from, x.data.to, x.severity]), [['notice', 'redirect', 'info']]);
      // review (F3): الملخص بكلمات البطاقة نفسها، لا notice/redirect بالإنجليزية في «سجل الأمان»
      assert.equal(rowsOf(t, 'settings.charity_landing_changed')[0].summary, 'تغيير ما تفتحه روابط «خيري» القديمة: صفحة تقول إن الخدمة متوقفة ← تحويل إلى الصفحة الأولى');
      const { LANDING_OPTIONS } = await import('../public/assets/js/app/components/site-settings.js').catch(() => ({}));
      if (LANDING_OPTIONS) for (const o of LANDING_OPTIONS) assert.equal(LABELS.charity_archived_landing[o.value], o.label, 'one source of words with the card');
      const partners = [{ name: 'أ. أحمد إمام', title: 'محامٍ بالنقض' }, { name: 'أ. سارة', title: '' }];
      r = await admin.patch('/api/admin/settings', { firm_partners: partners, firm_city: 'القاهرة', firm_founded: '2008' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const pr = rowsOf(t, 'settings.firm_partners_changed');
      assert.deepEqual(pr.map((x) => [x.data.from, x.data.to]), [[0, 2]], 'count only');
      assert.ok(!/أحمد إمام|سارة/.test(JSON.stringify(pr)), 'names are never copied into the security log');
      if (t.app.media?.validateSettings) {
        r = await admin.patch('/api/admin/settings', { stt_charity_third_party: true, ocr_claude_companies: true });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(rowsOf(t, 'settings.stt_charity_changed').map((x) => [x.data.from, x.data.to, x.severity]), [[false, true, 'warning']]);
        assert.deepEqual(rowsOf(t, 'settings.ocr_claude_companies_changed').map((x) => [x.data.from, x.data.to, x.severity]), [[false, true, 'warning']]);
      }
      if (t.app.media) {
        const saves = t.app.media.validateSettings ? 3 : 2;
        assert.equal(calls.length, saves, 'afterSettings is called once per save');
        assert.deepEqual(calls[0], { keys: ['charity_archived_landing'], before: { charity_archived_landing: 'notice' } });
        assert.deepEqual(calls[1].keys.sort(), ['firm_city', 'firm_founded', 'firm_partners']);
        await admin.patch('/api/admin/settings', { firm_city: 'القاهرة' });
        assert.deepEqual(calls.at(-1).keys, [], 'nothing changed → empty changedKeys, still one call');
      }
      for (const k of Object.keys((await import('../src/routes/admin.js')).SETTINGS_AUDIT)) assert.ok(k in DEFAULT_SETTINGS, `${k} is a known setting`);
      const { SETTINGS_AUDIT } = await import('../src/routes/admin.js');
      for (const { type } of Object.values(SETTINGS_AUDIT)) assert.match(LABELS.security_event[type] || '', /[؀-ۿ]/, `${type} has an Arabic label`);
      assert.match(read('src/routes/admin.js'), /app\.media\?\.afterSettings\?\.\(changedKeys, before\); \/\/ v12 media/);
    } finally {
      await t.close();
    }
  });

  test('SL-T13: site_gate_enabled is absent from GET/PATCH /api/admin/settings and from every settings UI; toggling it changes nothing', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const g = (await admin.get('/api/admin/settings')).body;
      assert.ok(!('site_gate_enabled' in g.settings));
      const home = (await t.client().get('/')).body;
      const r = await admin.patch('/api/admin/settings', { site_gate_enabled: false });
      assert.equal(r.status, 200);
      assert.ok(!('site_gate_enabled' in r.body));
      assert.equal((await t.client().get('/')).body, home, '«/» unchanged');
      for (const f of ['public/assets/js/app/components/site-settings.js', 'public/assets/js/app/components/story-settings.js', 'public/assets/js/app/pages/admin/settings.js']) {
        assert.ok(!/site_gate_enabled|شاشة الاختيار|gateSettingsCard/.test(read(f).replace(/^\s*\/\/.*$/gm, '')), f);
      }
    } finally {
      await t.close();
    }
  });

  test('review F4/F5: the «خيري» confirm keeps /khayri in <bdi>; partner names with < > get a precise message before saving', () => {
    const src = read('public/assets/js/app/components/site-settings.js');
    assert.match(src, /confirmDialog\(\{ title: CHARITY_CONFIRM\.title, message: withBdi\(charityHelp\(next, state\.landing\)\)/, 'confirm body = the help text with /khayri isolated (was «khayri/»)');
    assert.match(src, /NOT_PLAIN_RE\.test\(p\.name\) \|\| NOT_PLAIN_RE\.test\(p\.title\)/);
    assert.match(src, /`الشريك \$\{badAt \+ 1\}: \$\{PLAIN_NAME_ERROR\}\.`/);
  });

  test('SL-7 card and toggle copy (E12-70, E12-86, L12-49, L12-56): exact strings, partners cleaning, tags SET-01…SET-19', async () => {
    const S = await import('../public/assets/js/app/components/site-settings.js');
    assert.equal(S.FIRST_PAGE_TITLE, 'الصفحة الأولى');
    assert.equal(S.CHARITY_TOGGLE_TEXT, 'إظهار الخدمة الخيرية («خيري») على الموقع');
    assert.deepEqual({ ...S.CHARITY_CONFIRM }, { title: 'تغيير ظهور «خيري» على الموقع؟', confirm: 'تغيير', cancel: 'إلغاء' });
    assert.equal(S.LANDING_LEGEND, 'عند فتح روابط «خيري» القديمة');
    assert.deepEqual(S.LANDING_OPTIONS.map((o) => [o.value, o.label]), [['notice', 'صفحة تقول إن الخدمة متوقفة'], ['redirect', 'تحويل إلى الصفحة الأولى']]);
    assert.equal(S.PARTNERS_HINT, 'يظهر قسم «الشركاء» في صفحة «عن المكتب» فقط عند إضافة شريك أو سنة التأسيس.');
    assert.equal(S.PARTNERS_MAX, 8);
    assert.equal(S.charityHelp(true), 'يظهر سطر «تبحثون عن مساعدة قانونية مجانية؟ خيري» تحت الاختيارات الثلاثة، وتعمل صفحة /khayri ونموذجها.');
    assert.equal(
      S.charityHelp(false, 'redirect'),
      'متوقفة: الصفحة الأولى تعرض ثلاثة اختيارات فقط، ولا يظهر «خيري» في أي صفحة عامة، وروابطه القديمة تفتح الصفحة الأولى. الطلبات والملفات الخيرية ورقم واتساب الخيري تعمل كما هي.',
      'E12-70 verbatim for the redirect landing',
    );
    assert.match(S.charityHelp(false, 'notice'), /وروابطه القديمة تفتح صفحة تقول إن الخدمة متوقفة\./, 'r2 (L12-49): the notice is the default');
    assert.equal(TREE.restored.text, 'تبحثون عن مساعدة قانونية مجانية؟', 'the help quotes the restored row');
    assert.deepEqual(S.cleanPartners([{ name: '  أ. أحمد ', title: ' محامٍ بالنقض ' }, { name: '', title: '' }, null, { name: 'x', extra: 1 }]), [
      { name: 'أ. أحمد', title: 'محامٍ بالنقض' },
      { name: 'x', title: '' },
    ]);
    const St = await import('../public/assets/js/app/components/story-settings.js');
    assert.equal(St.LINES_MENU_TOGGLE_TEXT, 'قائمة الخدمات على واتساب');
    assert.equal(
      St.LINES_MENU_HINT,
      'أول رسالة قصيرة من شخص جديد على خط الأفراد والشركات تصلها ثلاثة أزرار: استشارة، رفع دعوى قضائية، تأسيس شركات، ثم قائمة قصيرة بالتفاصيل. الرسائل ثابتة لا يكتبها الذكاء الاصطناعي، وتُرسل داخل نافذة 24 ساعة فقط، ومرة واحدة لكل شخص.',
    );
    assert.ok(St.STORY_SETTING_KEYS.includes('wa_lines_menu_enabled'));
    const story = read('public/assets/js/app/components/story-settings.js');
    assert.match(story, /wa_lines_menu_enabled: Boolean\(v\.wa_lines_menu_enabled\)/, 'saved with the story settings');
    const files = read('public/assets/js/app/components/site-settings.js') + story;
    for (let n = 1; n <= 19; n++) assert.ok(files.includes(`'SET-${String(n).padStart(2, '0')}'`), `SET-${n}`);
    assert.match(read('public/assets/js/app/pages/admin/settings.js'), /firstPageSettingsCard\(settings\)/);
    for (const s of [S.CHARITY_TOGGLE_TEXT, S.charityHelp(false), S.charityHelp(true), S.PARTNERS_HINT, St.LINES_MENU_HINT]) assert.ok(!DASH.test(s), s);
  });
});

// ═════════════════════════ SL-8: التحليلات (P1) ═════════════════════════
describe('v12 staff-lines SL-8: GET /api/admin/analytics/entry-tree + funnel line (E12-56/57)', () => {
  test('SL-T03 (E12-T42): staff only, one audit row per read, view counts and shares, requests per path, totals per line; funnel ?line=', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const req = { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' } };
      for (let i = 0; i < 4; i++) t.app.pathways.countView('', req);
      for (let i = 0; i < 2; i++) t.app.pathways.countView('litigation', req);
      t.app.pathways.countView('litigation/defend', req);
      t.app.pathways.countView('khayri', req);
      t.app.pathways.countView('', { method: 'GET', headers: { 'user-agent': 'Googlebot/2.1' } });
      const c = t.client();
      const post = (o) => c.post('/api/public/intake', { consent: true, description: 'عندي مشكلة في عقد الإيجار مع المالك والموضوع محتاج محامي', segment: 'paid', ...o });
      const id = (r) => t.app.db.value('SELECT id FROM intakes WHERE code = ?', r.body.reference);
      const a = id(await post({ phone: '01012349001' }));
      const b = id(await post({ phone: '01012349002' }));
      const d = id(await post({ phone: '01012349003' }));
      id(await post({ phone: '01012349004' }));
      t.app.pathways.set(a, 'litigation/defend/family', { source: 'website' });
      t.app.pathways.set(b, 'litigation/defend/family', { source: 'website' });
      t.app.pathways.set(d, 'company/counsel', { source: 'wa_menu' });
      const admin = await t.login('admin');
      const r = await admin.get('/api/admin/analytics/entry-tree');
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const page = (n) => r.body.pages.find((p) => p.node === n);
      assert.deepEqual([page('').views, page('').share_of_parent, page('').label], [4, null, 'الصفحة الأولى'], 'bots are not counted');
      assert.deepEqual([page('litigation').views, page('litigation').share_of_parent], [2, 0.5]);
      assert.deepEqual([page('litigation/defend').views, page('litigation/defend').share_of_parent, page('litigation/defend').label], [1, 0.5, 'دعوى › الرد على دعوى مرفوعة']);
      assert.deepEqual([page('khayri').views, page('khayri').parent], [1, null]);
      assert.equal(page('consultation').views, 0);
      assert.equal(r.body.pages.length, 18, '17 tree pages + the old «خيري» links');
      assert.deepEqual(r.body.paths.map((p) => [p.path, p.requests, p.label]), [
        ['litigation/defend/family', 2, 'دعوى › الرد على دعوى مرفوعة › أسرة وميراث'],
        ['company/counsel', 1, 'شركات › مستشار قانوني'],
      ]);
      assert.deepEqual(Object.fromEntries(r.body.totals.map((x) => [x.line, x.requests])), { consultation: 0, litigation: 2, company: 1, none: 1 });
      assert.equal(r.body.views_total, 7);
      const ev = t.app.db.all("SELECT * FROM security_events WHERE type = 'analytics.viewed'");
      assert.equal(ev.length, 1);
      assert.equal(JSON.parse(ev[0].data).report, 'entry_tree');
      assert.equal(ev[0].severity, 'info');
      // نطاق التاريخ: فترة قديمة بلا شيء
      const old = (await admin.get('/api/admin/analytics/entry-tree?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z')).body;
      assert.deepEqual([old.pages.find((p) => p.node === '').views, old.paths.length], [0, 0]);
      assert.equal(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'analytics.viewed'"), 2, 'every read is audited');
      // الأدوار
      assert.equal((await t.client().get('/api/admin/analytics/entry-tree')).status, 401);
      // القمع حسب نوع الطلب
      const all = (await admin.get('/api/admin/analytics/funnel')).body;
      const lit = (await admin.get('/api/admin/analytics/funnel?line=litigation')).body;
      const none = (await admin.get('/api/admin/analytics/funnel?line=none')).body;
      assert.deepEqual([all.line, all.totals.intakes, lit.line, lit.totals.intakes, none.totals.intakes], ['all', 4, 'litigation', 2, 1]);
      assert.equal(lit.totals.ad_spend, null, 'ad spend only for all lines');
      assert.equal((await admin.get('/api/admin/analytics/funnel?line=bogus')).body.line, 'all');
      const ui = read('public/assets/js/app/pages/admin/analytics.js');
      for (const s of ["'من الصفحة الأولى إلى الطلب'", "'الصفحة'", "'الزيارات'", "'من الصفحة السابقة'", "'المسار'", "'الطلبات'", "'كل الأنواع'", "'ANL-01'", "'ANL-02'", "'ANL-03'", "'ANL-04'", "'ANL-05'", "'ANL-06'"]) assert.ok(ui.includes(s), s);
    } finally {
      await t.close();
    }
  });

  test('SL-T02 (E12-T41): entry-tree for lawyers 403, company session 401; LABELS has analytics.viewed', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      assert.match(LABELS.security_event['analytics.viewed'], /[؀-ۿ]/);
      const lawyer = await t.login('ahmed');
      assert.equal((await lawyer.get('/api/admin/analytics/entry-tree')).status, 403);
      const mgr = await t.login('manager');
      assert.equal((await mgr.get('/api/admin/analytics/entry-tree')).status, 200);
      const login = await fetch(`${t.base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mariam@nilefoods.example', password: 'Company@2026' }) });
      const cookie = `bm_csid=${/bm_csid=([^;]+)/.exec(login.headers.get('set-cookie') || '')?.[1]}`;
      assert.equal((await fetch(`${t.base}/api/admin/analytics/entry-tree`, { headers: { cookie } })).status, 401);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-9: المحاكي ═════════════════════════
describe('v12 staff-lines SL-9: simulator buttons and list rows (E12-53, PW-S4 in HTTP)', () => {
  test('«مرحبا» on the paid line → buttons → line:litigation → list (5 rows) → path:litigation/defend → W-05; exactly one of each; path block in the response', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      assert.equal(t.app.settings.get('wa_lines_menu_enabled'), true, 'demo seed turns the menu on');
      const from = '01092000499';
      const sim = (b) => admin.post('/api/admin/simulate/whatsapp', { from, name: 'تجربة', line: 'paid', ...b });
      let r = await sim({ text: 'مرحبا' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const w1 = r.body.replies.find((x) => x.rule === 'lines_menu');
      assert.ok(w1, JSON.stringify(r.body.replies));
      assert.deepEqual(w1.wa.buttons.map((b) => b.id), ['line:consultation', 'line:litigation', 'line:company']);
      assert.equal(r.body.lines_menu_enabled, true);
      r = await sim({ kind: 'button_reply', reply_id: 'line:litigation' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      const w3 = r.body.replies.find((x) => x.rule === 'lines_list');
      const rows = w3.wa.sections.flatMap((s) => s.rows);
      assert.equal(rows.length, 5);
      assert.ok(rows.every((x) => x.id.startsWith('path:litigation/')));
      assert.deepEqual([r.body.pathway.path, r.body.pathway.source_label], ['litigation', 'من قائمة واتساب']);
      r = await sim({ kind: 'list_reply', reply_id: 'path:litigation/defend' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.match(r.body.replies.find((x) => x.rule === 'lines_next').body, /خلاص/);
      assert.deepEqual([r.body.pathway.staff_labels.join(' › '), r.body.pathway.source_label], ['دعوى › الرد على دعوى مرفوعة', 'من قائمة واتساب']);
      const iid = r.body.intake_id;
      assert.deepEqual(rules(t, iid).filter((x) => /^lines_/.test(x || '')), ['lines_menu', 'lines_list', 'lines_next']);
      // معرّفات غير صالحة
      assert.equal((await sim({ kind: 'button_reply', reply_id: 'line:charity' })).status, 400);
      assert.equal((await sim({ kind: 'list_reply', reply_id: 'path:company/counsel/account' })).status, 400, 'an exit is not a row');
      assert.equal((await sim({ kind: 'list_reply', reply_id: 'path:../x' })).status, 400);
      assert.equal((await sim({ kind: 'list_reply', reply_id: 'topic:inh' })).status, 200, 'v9.2 topic rows still work');
      const ui = read('public/assets/js/app/pages/admin/simulator.js');
      for (const s of ["'button_reply'", "'SIM-01'", "'SIM-02'", "'SIM-03'", "'SIM-04'", 'pathLine(res.pathway)']) assert.ok(ui.includes(s), s);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-10: البيانات التجريبية ═════════════════════════
describe('v12 staff-lines SL-10: seed-v12-lines (E12-59)', () => {
  test('demo: menu on; two menu requests (litigation/defend accepted and assigned to a lawyer, company/counsel with W-06); a «مقترح» row; an opted-out client; no firm partners', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const { LINES_DEMO_PHONES } = await import('../src/seed-v12-lines.js');
      const db = t.app.db;
      assert.equal(t.app.settings.get('wa_lines_menu_enabled'), true);
      assert.deepEqual([t.app.settings.get('firm_partners'), t.app.settings.get('firm_founded'), t.app.settings.get('firm_city')], [[], '', ''], 'L12-41: never seeded');
      const byPhone = (p) => db.get("SELECT i.* FROM intakes i JOIN clients c ON c.id = i.client_id JOIN client_identities ci ON ci.client_id = c.id AND ci.kind = 'phone' WHERE ci.value = ? ORDER BY i.id LIMIT 1", `+2${p}`);
      const [i1, i2, i3, i4] = LINES_DEMO_PHONES.map(byPhone);
      assert.ok(i1 && i2 && i3 && i4, 'all four seeded');
      assert.deepEqual([i1.pathway, i1.pathway_source, i1.service_line, i1.segment], ['litigation/defend', 'wa_menu', 'litigation', 'paid']);
      assert.ok(i1.case_id, 'accepted into a case');
      assert.ok(db.get("SELECT 1 FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ? AND u.username = 'ahmed'", i1.case_id), 'assigned to ahmed');
      assert.deepEqual(rules(t, i1.id).filter((x) => /^lines_/.test(x || '')), ['lines_menu', 'lines_list', 'lines_next']);
      assert.deepEqual([i2.pathway, i2.pathway_source], ['company/counsel', 'wa_menu']);
      assert.match(outbox(t, i2.id).find((m) => m.automation_rule === 'lines_next').body, /عرض يناسب شركتكم/);
      assert.deepEqual([i3.pathway, i3.legal_area, i3.segment], [null, 'FAM', 'paid']);
      const admin = await t.login('admin');
      const row3 = (await admin.get('/api/admin/intakes?scope=all&limit=200')).body.items.find((x) => x.id === i3.id);
      assert.equal(row3.suggested_line, 'consultation', '«مقترح: استشارة»');
      assert.ok(db.value('SELECT wa_auto_opt_out_at FROM clients WHERE id = ?', i4.client_id), 'opted out');
      assert.deepEqual(rules(t, i4.id), ['lines_menu'], 'nothing automated after «إيقاف»');
      assert.equal((await admin.get(`/api/admin/intakes/${i4.id}`)).body.auto_opt_out_at != null, true);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SL-T10: فحص كل مسارات المحامين والشركات ═════════════════════════
describe('v12 staff-lines SL-T10: route scan for lawyers and companies (invariants)', () => {
  test('every lawyer GET (ahmed, hany, tarek) and every company GET (mariam, sherif) carry no pathway keys, no «المسار:» and no seeded label marker', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const MARK = 'SLT10MARKER';
      // نصف الطلبات بمسار حالي، والنصف بمسار متقاعد لقطته تحمل العلامة (تظهر للفريق فقط)
      db.run("UPDATE intakes SET service_line = 'litigation', pathway = 'litigation/defend/family', pathway_source = 'staff' WHERE id % 2 = 0");
      db.run(
        `UPDATE intakes SET service_line = 'litigation', pathway = 'litigation/zz-retired', pathway_source = 'website',
           form_answers = json_set(COALESCE(form_answers, '{}'), '$.pathway', json('{"v":1,"path":"litigation/zz-retired","labels":["دعوى","${MARK}"]}')) WHERE id % 2 = 1`,
      );
      const someId = db.value('SELECT id FROM intakes WHERE id % 2 = 1 LIMIT 1');
      const admin = await t.login('admin');
      assert.ok(JSON.stringify((await admin.get(`/api/admin/intakes/${someId}`)).body).includes(MARK), 'staff see the snapshot (the marker works)');
      const keyRe = /"(service_line|pathway|pathway_labels|pathway_source|pathway_set_at|suggested_line|lines_menu_sent_at|wa_auto_opt_out_at|auto_opt_out|returning_charity)"\s*:/;
      const bad = [];
      let seen = 0;
      const routes = t.app.router.routes.filter((r) => r.method === 'GET' && r.pattern.startsWith('/api/lawyer/'));
      assert.ok(routes.length > 5);
      for (const username of ['ahmed', 'hany', 'tarek']) {
        const lawyer = await t.login(username);
        const uid = db.value('SELECT id FROM users WHERE username = ?', username);
        const ids = {
          assignments: db.all('SELECT id FROM assignments WHERE lawyer_id = ?', uid).map((x) => x.id),
          matters: db.all('SELECT id FROM matters WHERE responsible_lawyer_id = ?', uid).map((x) => x.id),
        };
        for (const r of routes) {
          const list = /matters/.test(r.pattern) ? ids.matters : /assignments/.test(r.pattern) ? ids.assignments : [1];
          for (const i of (list.length ? list : [1]).slice(0, 4)) {
            const url = r.pattern.replace(/:(\w+)/g, String(i));
            const res = await lawyer.get(url);
            if (res.status !== 200) continue;
            seen++;
            const str = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
            if (keyRe.test(str)) bad.push(`${username} ${url} key`);
            if (str.includes(MARK) || str.includes('المسار:') || str.includes('لم يُحدَّد النوع')) bad.push(`${username} ${url} words`);
          }
        }
      }
      assert.ok(seen > 15, `lawyer endpoints reached (${seen})`);
      const coRoutes = t.app.router.routes.filter((r) => r.method === 'GET' && r.pattern.startsWith('/api/company/'));
      let coSeen = 0;
      for (const email of ['mariam@nilefoods.example', 'sherif@techsol.example']) {
        const login = await fetch(`${t.base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Company@2026' }) });
        assert.equal(login.status, 200, email);
        const cookie = `bm_csid=${/bm_csid=([^;]+)/.exec(login.headers.get('set-cookie') || '')?.[1]}`;
        const companyId = db.value('SELECT company_id FROM company_users WHERE email = ?', email);
        const codes = db.all('SELECT code FROM company_requests WHERE company_id = ? LIMIT 3', companyId).map((r) => r.code);
        for (const r of coRoutes) {
          for (const code of codes.length ? codes : ['XXX-9999']) {
            const url = r.pattern.replace(':code', code).replace(/:(\w+)/g, '1');
            const res = await fetch(`${t.base}${url}`, { headers: { cookie } });
            if (res.status === 200) coSeen++;
            const s = await res.text();
            if (keyRe.test(s)) bad.push(`${email} ${url} key`);
            if (s.includes(MARK) || s.includes('المسار:')) bad.push(`${email} ${url} words`);
          }
        }
      }
      assert.ok(coSeen > 5, 'company endpoints reached');
      assert.deepEqual(bad, []);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ نصوص الفريق وعقد الترميز (§9.2، §5.7، §5.9) ═════════════════════════
describe('v12 staff-lines: staff copy, markup contract and tags', () => {
  test('§9.2 copy exact in pathway-ui.js; filter options mirror LABELS.service_line; LINES[*].chip feeds the chip', async () => {
    const P = await import('../public/assets/js/app/components/pathway-ui.js');
    assert.equal(P.NO_PATHWAY_LABEL, 'لم يُحدَّد النوع');
    assert.equal(P.PATH_KEY, 'المسار:');
    assert.equal(P.PATH_SEP, ' › ');
    assert.equal(P.SHEET_TITLE, 'مسار الطلب');
    assert.equal(P.SHEET_ERROR, 'اختاروا مسارًا صحيحًا أو اتركوه دون تحديد.');
    assert.equal(P.LINE_FILTER_ALL, 'كل الأنواع');
    assert.deepEqual(P.LINE_FILTER_OPTIONS.map((o) => o.label), ['استشارة', 'دعوى قضائية', 'شركات', 'لم يُحدَّد النوع']);
    for (const o of P.LINE_FILTER_OPTIONS) assert.equal(o.label, LABELS.service_line[o.value]);
    assert.deepEqual(['consultation', 'litigation', 'company'].map((k) => LINES[k].chip), ['استشارة', 'دعوى', 'شركات']);
    const src = read('public/assets/js/app/components/pathway-ui.js');
    for (const s of ["'السبب (اختياري)'", "'نوع الطلب'", "'المجال أو الوضع'", "'الموضوع'", "'تعديل'", "'تحديد'", "'تأكيد النوع'", 'نوع الطلب: ']) assert.ok(src.includes(s), s); // gate K-S5: «نوع الطلب: …؟» + «تأكيد النوع» (كان «مقترح: …» + «تأكيد»)
  });

  test('§5.7 classes and §5.9 codes: line-chip/line-path/path-line, PTH-01…15, INB-01…08, DSH-01/02; no inline styles, no segment hues in the new markup', () => {
    const pu = read('public/assets/js/app/components/pathway-ui.js');
    for (const c of ['span.line-chip', 'span.line-path', 'line-path--suggest', 'p.path-line', 'span.path-line__k', 'span.path-line__src', 'button.btn-link']) assert.ok(pu.includes(c), c);
    for (let n = 1; n <= 15; n++) {
      const code = `PTH-${String(n).padStart(2, '0')}`;
      assert.ok(pu.includes(`'${code}'`) || read('public/assets/js/app/pages/admin/intake-detail.js').includes(`'${code}'`), code);
    }
    const inbox = read('public/assets/js/app/pages/admin/inbox.js');
    for (let n = 1; n <= 8; n++) assert.ok(inbox.includes(`INB-0${n}`), `INB-0${n}`);
    const dash = read('public/assets/js/app/pages/admin/dashboard.js');
    assert.ok(dash.includes("'DSH-01'") && dash.includes("'DSH-02'"));
    assert.ok(!/style\s*:/.test(pu), 'no inline style in pathway-ui.js (L12-14)');
    const fp = read('public/assets/js/app/components/site-settings.js');
    assert.ok(!/style\s*:/.test(fp.slice(fp.indexOf('v12 staff-lines (SL-7'))), 'no inline style in the «الصفحة الأولى» card');
    assert.ok(!/--seg-|charity-hue|paid-hue|gold/.test(pu), 'line chips are neutral (never the segment hues)');
    for (const f of ['public/assets/js/app/components/pathway-ui.js', 'src/seed-v12-lines.js']) assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(read(f)), `${f}: no emoji`);
  });

  test('review-2 (T12-55/T12-78): every staff-lines code is defined in source with its words; the lane\'s sheet, strip and card call sites carry their code statically', async () => {
    const { scanSources, builderCalls } = await import('../src/tags/scan.js');
    const P = await import('../public/assets/js/app/components/pathway-ui.js');
    const files = [
      'public/assets/js/app/components/pathway-ui.js',
      'public/assets/js/app/pages/admin/inbox.js',
      'public/assets/js/app/pages/admin/intake-detail.js',
      'public/assets/js/app/pages/admin/dashboard.js',
      'public/assets/js/app/pages/admin/analytics.js',
      'public/assets/js/app/pages/admin/simulator.js',
      'public/assets/js/app/components/site-settings.js',
      'public/assets/js/app/components/story-settings.js',
    ];
    const scan = scanSources({ root: ROOT, files });
    const defs = new Map(scan.defs.filter((d) => !d.variant).map((d) => [d.code, d]));
    const range = (p, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${p}-${String(from + i).padStart(2, '0')}`);
    const expected = [...range('PTH', 1, 15), ...range('INB', 1, 8), ...range('DSH', 1, 3), ...range('ANL', 1, 6), ...range('SIM', 1, 4), ...range('SET', 1, 19)];
    // كان PTH-08/09/10 (قوائم ورقة المسار) وSIM-02 (صفوف القائمة في المحاكي) «غير معرَّفة في المصدر» لأن الرمز مرّ وسيطًا أو تعبيرًا شرطيًا
    assert.deepEqual(expected.filter((c) => !defs.has(c)), [], 'every reserved staff-lines code in use is visible to npm run tags');
    // كانت خيارات «كل الأنواع» خريطة { all: 'INB-02', … } فظهرت في TAGS.md بكلمات «all» و«consultation»
    const words = [P.LINE_FILTER_ALL, ...P.LINE_FILTER_OPTIONS.map((o) => o.label)];
    assert.deepEqual(range('INB', 2, 6).map((c) => defs.get(c).text), words, 'INB-02…06 carry the option words');
    for (const c of ['PTH-08', 'PTH-09', 'PTH-10']) assert.equal(defs.get(c).file, 'public/assets/js/app/components/pathway-ui.js', c);
    // لا رمز ثانٍ يُضاف لعنصر مرمَّز: كل استدعاء أساسي في ورقة المسار مرمَّز أو مستثنى بسبب (tags:skip)
    const untagged = (rel, from = 0, to = Infinity) => builderCalls(read(rel)).filter((c) => !c.skip && !c.tagged && c.line >= from && c.line <= to).map((c) => `${rel.split('/').pop()}:${c.name}:${c.line}`);
    assert.deepEqual(untagged('public/assets/js/app/components/pathway-ui.js'), []);
    const dash = read('public/assets/js/app/pages/admin/dashboard.js');
    const strip = [dash.slice(0, dash.indexOf('export function lineStrip')).split('\n').length, dash.slice(0, dash.indexOf('export default async function render')).split('\n').length];
    assert.deepEqual(untagged('public/assets/js/app/pages/admin/dashboard.js', ...strip), [], '«حسب نوع الطلب» strip');
    const an = read('public/assets/js/app/pages/admin/analytics.js');
    const sec = [an.slice(0, an.indexOf('export function entryTreeSection')).split('\n').length, an.slice(0, an.indexOf('// v11 segment-staff (ST-5، r2 S10')).split('\n').length];
    assert.deepEqual(untagged('public/assets/js/app/pages/admin/analytics.js', ...sec), [], 'entry-tree section card');
    // أزرار المحرر والمعاينة مرمَّزة في موضع إنشائها (لا tagged لاحقًا على متغير)
    const fp = read('public/assets/js/app/components/site-settings.js');
    for (const c of ['SET-09', 'SET-14', 'SET-17', 'SET-18', 'SET-19']) assert.match(fp, new RegExp(`tagged\\('${c}', button\\(`), c);
  });

  test('E12-86 readiness wa_lines_privacy follows the privacy sentence (L12-77); never while the menu is off', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const html = fs.readFileSync(path.join(ROOT, 'public/privacy.html'), 'utf8');
      const promises = !/الرسائل الثابتة مثل الترحيب وقائمة الخدمات تُرسل آليًا/.test(html) && /يراجعه شخص مختص/.test(html);
      const keys = () => t.app.segments.readiness().map((x) => x.key);
      t.app.settings.set('wa_lines_menu_enabled', false);
      assert.ok(!keys().includes('wa_lines_privacy'));
      t.app.settings.set('wa_lines_menu_enabled', true);
      assert.equal(keys().includes('wa_lines_privacy'), promises, promises ? 'old promise → warning' : 'L12-77 sentence present → no warning');
      const item = t.app.segments.readiness().find((x) => x.key === 'wa_lines_privacy');
      if (item) assert.deepEqual([item.level, item.href], ['warning', '#/settings?section=stories']);
    } finally {
      await t.close();
    }
  });
});
