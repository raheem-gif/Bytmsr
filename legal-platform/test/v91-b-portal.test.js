// v9.1 b-portal — صفحة متابعة المستفيد/ة: الشاشة الرئيسية (B91-02)، الورق بندًا بندًا (B91-03)، «تابعي طلبك» (B91-06)،
// الرد بخلاصة وخطوات (B91-08)، المصاريف بموافقتها (B91-09/18)، الجلسة (B91-13)، المكالمة ومواعيد العمل (B91-14)،
// ورقم الطلب القصير (B91-21). كل مسار جديد يُختبر داخل نطاق الرابط نفسه (404 لما هو خارجه).
import { describe, test, before, after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, freezeClock, resetClock, waPayload } from './helpers.js';
import { ok, createLawyer, newCase, assign, submitAndApprove, uniquePhone, portalFor, postWebhook, notificationsOf, outbox, runAutomations, plusDays, caseDetail } from './lane-b-kit.test.js';
import { shortRefCodes, parseItems, itemsInput, clientAnswerFields, DAY_BEFORE_TEMPLATE } from '../src/services/portal-v91.js';
import { clientSummary, clientVersion } from '../src/ai/heuristic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const LONG = { sessionTtlHours: 24 * 365 };
const CODE_RE = /\b(CL|INH|FAM|GRD|PEN|PRP|CIV|LAB|CRM|COM|TAX|ADM|GEN|MTR)-\d/;

/** صورة JPEG صغيرة صالحة الترويسة (الخادم يتحقق من محتوى الملف) */
function jpeg(name = 'صورة.jpg') {
  const buf = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
  return { filename: name, mime: 'image/jpeg', data_base64: buf.toString('base64') };
}
function webm(name = 'رسالة-صوتية.webm') {
  const buf = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 2)]);
  return { filename: name, mime: 'audio/webm', data_base64: buf.toString('base64') };
}

afterEach(() => resetClock());

// ─────────────────────────────── وحدات صغيرة ───────────────────────────────

describe('v9.1 b-portal — helpers', () => {
  test('short request number «29» / «٢٩» / «29/2026» → REQ codes (current year first, then the previous)', () => {
    assert.deepEqual(shortRefCodes('29', '2026-10-07T10:00:00Z'), ['REQ-2026-00029', 'REQ-2025-00029']);
    assert.deepEqual(shortRefCodes('٢٩', '2026-10-07T10:00:00Z'), ['REQ-2026-00029', 'REQ-2025-00029']);
    assert.deepEqual(shortRefCodes('29/2025'), ['REQ-2025-00029']);
    assert.deepEqual(shortRefCodes('سامية'), []);
    assert.deepEqual(shortRefCodes('123456'), []);
    assert.deepEqual(shortRefCodes('0'), []);
  });

  test('items: lawyer/staff formats, limits (≤ 5, ≤ 80 chars), steps (≤ 8 × ≤ 160)', () => {
    assert.deepEqual(parseItems(['شهادة وفاة الزوج', { label: 'عقد الشقة' }]), [{ label: 'شهادة وفاة الزوج' }, { label: 'عقد الشقة' }]);
    assert.equal(itemsInput('1. شهادة وفاة الزوج\n- عقد الشقة\n'), JSON.stringify([{ label: 'شهادة وفاة الزوج' }, { label: 'عقد الشقة' }]));
    assert.equal(itemsInput(''), null);
    assert.throws(() => itemsInput('أ\nب\nج\nد\nه\nو'), /5 على الأكثر/);
    assert.throws(() => itemsInput('ب'.repeat(81)), /80 حرفًا/);
    assert.throws(() => clientAnswerFields({ db: null }, 1, { steps: Array.from({ length: 9 }, (_, i) => `خطوة ${i}`) }), /8 على الأكثر/);
    assert.deepEqual(clientAnswerFields({ db: null }, 1, { summary: 'خلاصة', steps: 'أ\n\nب' }), { summary: 'خلاصة', steps: JSON.stringify(['أ', 'ب']) });
  });

  test('heuristic client version greets by kunya name, never «الأستاذ/ة» or a case code; summary/steps suggestion', () => {
    const cv = clientVersion({ clientName: 'أم يوسف محمود', caseCode: 'FAM-2026-00001', opinion: 'أولًا: الحضانة للأم.\nالتوصية: نرفع دعوى نفقة فورًا.', orgName: 'مؤسسة بيوت مصر' });
    assert.match(cv, /^أهلًا يا أم يوسف،/);
    assert.doesNotMatch(cv, /الأستاذ\/ة|تحية طيبة وبعد|FAM-2026/);
    const s = clientSummary({ opinion: 'أولًا: كذا.\nالتوصية: نرفع دعوى نفقة فورًا.', clientSteps: JSON.stringify(['هاتي البطاقة']) });
    assert.equal(s.summary, 'نرفع دعوى نفقة فورًا.');
    assert.deepEqual(s.steps, ['هاتي البطاقة']);
    assert.match(DAY_BEFORE_TEMPLATE, /بكرة \{event_kind\} الساعة \{time_spoken\}/);
  });
});

// ─────────────────────────────── السيناريو الكامل ───────────────────────────────

describe('v9.1 b-portal — portal home, papers by item, answer, hearing, money, callback', () => {
  const T0 = '2026-10-04T08:00:00.000Z'; // الأحد 11 الصبح بتوقيت القاهرة
  let t;
  let admin;
  let lawyer;
  let cL;
  let kase;
  let token;
  let other; // مستفيدة أخرى
  let otherToken;
  let ir;
  let matter;
  let event;
  let answerId;

  // الساعة مجمّدة في كل اختبار (afterEach العام يعيدها للساعة الحقيقية)
  beforeEach(() => freezeClock(T0));
  before(async () => {
    freezeClock(T0);
    t = await startTestApp({ seed: 'none', config: LONG });
    admin = await t.login('admin');
    lawyer = await createLawyer(admin, { name: 'أ. محامي الملف', specialties: ['FAM'] });
    cL = await t.login(lawyer.username);
    kase = await newCase(admin, { clientName: 'أم يوسف محمود', legal_area: 'FAM', title: 'نفقة صغار متجمدة' });
    token = await portalFor(admin, kase.clientId);
    other = await newCase(admin, { clientName: 'نادية', legal_area: 'FAM', title: 'ملف آخر' });
    otherToken = await portalFor(admin, other.clientId);
  });
  after(async () => t && t.close());

  test('home: kunya greeting, plain stage words, one REQ number, no internal codes, contact and office hours', async () => {
    const v = ok(await t.client().get(`/api/portal/${token}`));
    assert.equal(v.home.name, 'أم يوسف');
    assert.equal(v.home.address, 'f');
    assert.match(v.home.ref, /^REQ-\d{4}-\d{5}$/);
    assert.equal(v.home.spoken_ref, String(Number(v.home.ref.slice(-5))));
    const st = v.home.stories[0];
    assert.equal(st.stage.key, 'review');
    assert.deepEqual(st.stage.steps.map((x) => x.title), ['استلمنا طلبك', 'فريقنا بيراجع طلبك', 'المحامي بيدرس مشكلتك', 'وصلك الرد']);
    assert.match(st.stage.hint, /غالبًا خلال يومين شغل/);
    assert.equal(v.home.contact.open_now, true, 'Sunday 11:00 Cairo is inside office hours');
    assert.ok(v.home.contact.phone);
    assert.deepEqual(v.home.next, []);
    const text = JSON.stringify({ home: v.home, requests: v.requests, answers: v.answers, events: v.events, messages: v.messages });
    assert.doesNotMatch(text, CODE_RE);
    assert.doesNotMatch(JSON.stringify(v), /محامي الملف/, 'no lawyer name');
  });

  test('office hours: 20:00 Cairo → closed; Friday → closed', async () => {
    freezeClock('2026-10-04T17:00:00.000Z'); // الأحد 8 مساءً
    assert.equal(ok(await t.client().get(`/api/portal/${token}`)).home.contact.open_now, false);
    freezeClock('2026-10-09T08:00:00.000Z'); // الجمعة 11 صباحًا
    assert.equal(t.app.portal.officeOpen(t.app.settings.get('office_hours_schedule')), false);
    freezeClock(T0);
  });

  test('document request with 2 items: one row per paper, photo for item 0, later «مش لاقية» for item 1', async () => {
    ir = ok(await admin.post(`/api/admin/cases/${kase.id}/info-requests`, { kind: 'document', question: 'شهادة الوفاة وعقد الشقة', client_message: 'محتاجين صورة الورقتين دول.', items: 'شهادة وفاة الزوج\nعقد الشقة' }));
    assert.equal(ir.status, 'sent_to_client');
    let v = ok(await t.client().get(`/api/portal/${token}`));
    let r = v.requests.find((x) => x.id === ir.id);
    assert.deepEqual(r.items.map((i) => [i.label, i.status]), [['شهادة وفاة الزوج', 'needed'], ['عقد الشقة', 'needed']]);
    assert.equal(r.can_reply, true);
    assert.equal(r.case_code, undefined, 'no internal case code in the portal payload');
    assert.match(r.story_ref, /^REQ-/);
    assert.equal(r.message, 'محتاجين صورة الورقتين دول.', 'the clean client message, no «(بخصوص ملفكم…)» suffix');
    assert.equal(v.home.next[0].kind, 'request');
    assert.equal(v.home.stories[0].stage.key, 'waiting_you');
    assert.equal(v.home.stories[0].stage.hint, 'مستنيين منك الورق عشان نكمّل');

    // البند خارج القائمة ← 400، والطلب خارج نطاق الرابط ← 404
    assert.equal((await t.client().post(`/api/portal/${token}/requests/${ir.id}/reply`, { documents: [{ ...jpeg(), item: 5 }] })).status, 400);
    assert.equal((await t.client().post(`/api/portal/${otherToken}/requests/${ir.id}/reply`, { documents: [jpeg()] })).status, 404);
    assert.equal((await t.client().post(`/api/portal/${token}/requests/${ir.id}/reply`, {})).status, 400);

    ok(await t.client().post(`/api/portal/${token}/requests/${ir.id}/reply`, { documents: [{ ...jpeg('شهادة-وفاة-الزوج-1.jpg'), item: 0 }] }));
    v = ok(await t.client().get(`/api/portal/${token}`));
    r = v.requests.find((x) => x.id === ir.id);
    assert.deepEqual(r.items.map((i) => i.status), ['received', 'needed']);
    assert.equal(r.items[0].files[0].filename, 'شهادة-وفاة-الزوج-1.jpg');
    assert.equal(r.can_reply, true, 'the request stays open while a paper is still needed');
    const n1 = await notificationsOf(admin);
    assert.ok(n1.some((n) => n.title.startsWith('وصلت ورقة جديدة للطلب REQ-')), 'staff notified with the REQ number');

    ok(await t.client().post(`/api/portal/${token}/requests/${ir.id}/reply`, { missing_items: [1] }));
    v = ok(await t.client().get(`/api/portal/${token}`));
    r = v.requests.find((x) => x.id === ir.id);
    assert.deepEqual(r.items.map((i) => i.status), ['received', 'missing']);
    assert.equal(r.can_reply, false);
    assert.equal(r.all_done, true);
    const detail = await caseDetail(admin, kase.id);
    const msgs = JSON.stringify(detail.messages || detail);
    assert.match(msgs, /مش لاقية: عقد الشقة/, 'staff see the structured reply');
    const stored = t.app.db.get('SELECT info_request_item FROM documents WHERE info_request_id = ? ORDER BY id DESC LIMIT 1', ir.id);
    assert.equal(stored.info_request_item, 0);
  });

  test('answer with summary and steps: portal fields, WhatsApp text short and plain, question tied to the answer', async () => {
    const a = await assign(admin, kase.id, { lawyer_id: lawyer.id, role: 'lead' });
    const op = await submitAndApprove(admin, cL, a.id, 'أولًا: من حقك نفقة الصغار عن المدة الماضية.\nالتوصية: رفع دعوى نفقة أمام محكمة الأسرة.');
    // اقتراح الخلاصة والخطوات (المحلل المحلي)
    const sug = ok(await admin.post(`/api/admin/cases/${kase.id}/ai/client-version`, { opinion_id: op.id }));
    assert.ok(sug.output.summary, 'a summary suggestion');
    assert.ok(sug.output.steps.length >= 1, 'steps suggestion');
    assert.doesNotMatch(sug.output.text, /الأستاذ\/ة|تحية طيبة وبعد/);
    const draft = ok(await admin.post(`/api/admin/cases/${kase.id}/client-answers`, {
      opinion_id: op.id,
      body: 'الأستاذة الفاضلة، بعد دراسة الملف رقم ' + kase.code + ' نفيدكم بأن من حقكم نفقة الصغار.\n\nالتوصية: رفع دعوى نفقة.',
      summary: 'من حقك نفقة للعيال عن الشهور اللي فاتت. هنرفع دعوى في محكمة الأسرة.',
      steps: 'جهّزي شهادات ميلاد العيال\nهاتي صورة بطاقتك',
    }));
    answerId = draft.id;
    assert.equal((await admin.post(`/api/admin/cases/${kase.id}/client-answers`, { id: draft.id, opinion_id: op.id, body: 'x'.repeat(30), summary: 'س'.repeat(401) })).status, 400);
    ok(await admin.post(`/api/admin/client-answers/${draft.id}/send`, { channel: 'whatsapp' }));
    const sent = (await outbox(admin)).find((m) => m.case_id === kase.id && m.body.includes('ردّنا على مشكلتك جاهز'));
    assert.ok(sent, 'the WhatsApp message uses the short format');
    assert.match(sent.body, /^أهلًا يا أم يوسف، ردّنا على مشكلتك جاهز\./);
    assert.match(sent.body, /1\. جهّزي شهادات ميلاد العيال\n2\. هاتي صورة بطاقتك/);
    // v9.1 fixes: النص المحفوظ بلا رابط («الرد كامل على صفحتك.»)؛ نص واتساب يحمل {portal_link} ويُصدر الرابط عند الإرسال
    assert.ok(!/\/p\//.test(sent.body));
    assert.match(sent.body, /الرد كامل على صفحتك\./);
    assert.match(sent.meta.wa_text, /الرد كامل على صفحتك: \{portal_link\}/);
    assert.ok(sent.body.length <= 1000);
    assert.doesNotMatch(sent.body, /الأستاذ\/ة|تحية طيبة وبعد/);

    const v = ok(await t.client().get(`/api/portal/${token}`));
    const ans = v.answers.find((x) => x.id === draft.id);
    assert.equal(ans.summary, 'من حقك نفقة للعيال عن الشهور اللي فاتت. هنرفع دعوى في محكمة الأسرة.');
    assert.deepEqual(ans.steps, ['جهّزي شهادات ميلاد العيال', 'هاتي صورة بطاقتك']);
    assert.doesNotMatch(ans.body, CODE_RE, 'internal codes in an old text are replaced by the REQ number');
    assert.ok(v.home.next.some((n) => n.kind === 'answer' && n.id === draft.id));

    // «مش فاهمة حاجة؟ اسألينا»: سؤال مربوط بالرد، ورد مستفيدة أخرى ← 400
    ok(await t.client().post(`/api/portal/${token}/messages`, { body: 'عندي سؤال على الرد: يعني إيه متجمد؟', answer_id: draft.id }));
    const q = t.app.db.get("SELECT meta FROM messages WHERE client_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1", kase.clientId);
    assert.equal(JSON.parse(q.meta).answer_id, draft.id);
    assert.ok((await notificationsOf(admin)).some((n) => n.type === 'answer.client_question' && /سؤال من المستفيد\/ة على الرد في الطلب REQ-/.test(n.title)));
    assert.equal((await t.client().post(`/api/portal/${otherToken}/messages`, { body: 'سؤال', answer_id: draft.id })).status, 400);
    // رسالة صوتية في المحادثة
    ok(await t.client().post(`/api/portal/${token}/messages`, { body: '', documents: [webm()] }));
    const audio = t.app.db.get("SELECT mime FROM documents WHERE client_id = ? AND mime LIKE 'audio/%' ORDER BY id DESC LIMIT 1", kase.clientId);
    assert.equal(audio.mime, 'audio/webm');
  });

  test('hearing: approved «هاتي معاكي» only, map link, «مش هقدر أحضر» recorded and staff told; lawyer text held until approval', async () => {
    // ملف مستمر من الاستشارة (الاستشارة تُغلق)
    matter = ok(await admin.post(`/api/admin/cases/${kase.id}/matter`, { kind: 'litigation', responsible_lawyer_id: lawyer.id, court: 'محكمة الأسرة ببنها', close_case: true }), 201);
    event = ok(await admin.post(`/api/admin/matters/${matter.id}/events`, { kind: 'hearing', starts_at: plusDays(T0, 2), location: 'محكمة الأسرة ببنها — الدائرة التالتة', client_attendance_required: true, client_note: 'بطاقتك الشخصية\nشهادات ميلاد العيال' }));
    // موعد سجله المحامي بملاحظة لم تعتمدها الإدارة
    const lev = ok(await cL.post(`/api/lawyer/matters/${matter.id}/events`, { kind: 'hearing', title: 'نص المحامي', starts_at: plusDays(T0, 10), client_attendance_required: true, client_note: 'نص المحامي الخاص' }));
    let v = ok(await t.client().get(`/api/portal/${token}`));
    const e = v.events.find((x) => x.id === event.id);
    assert.deepEqual(e.client_note, ['بطاقتك الشخصية', 'شهادات ميلاد العيال']);
    assert.match(e.map_url, /^https:\/\/www\.google\.com\/maps\/search\//);
    assert.equal(e.spoken.time, '11 الصبح', '08:00Z = 11 الصبح بتوقيت القاهرة الصيفي');
    assert.equal(e.spoken.day, 'بعد يومين');
    assert.equal(e.matter_code, undefined);
    const le = v.events.find((x) => x.id === lev.id);
    assert.deepEqual(le.client_note, [], 'a lawyer-typed note never reaches her before staff approval');
    assert.notEqual(le.title, 'نص المحامي');
    // الشاشة الرئيسية: الجلسة خلال 3 أيام أولًا، والمرحلة «قضيتك في المحكمة»
    assert.equal(v.home.next[0].kind, 'hearing');
    assert.equal(v.home.stories[0].stage.key, 'court');
    assert.match(v.home.stories[0].stage.hint, /^الجلسة الجاية: /);
    assert.doesNotMatch(JSON.stringify(v.home), /مغلق/);

    assert.equal((await t.client().post(`/api/portal/${otherToken}/events/${event.id}/response`, { answer: 'no' })).status, 404);
    assert.equal((await t.client().post(`/api/portal/${token}/events/${event.id}/response`, { answer: 'maybe' })).status, 400);
    ok(await t.client().post(`/api/portal/${token}/events/${event.id}/response`, { answer: 'no' }));
    v = ok(await t.client().get(`/api/portal/${token}`));
    assert.equal(v.events.find((x) => x.id === event.id).client_response, 'no');
    const md = ok(await admin.get(`/api/admin/matters/${matter.id}`));
    assert.ok(JSON.stringify(md).includes('مش هقدر أحضر'), 'the matter conversation shows her answer');
    assert.ok((await notificationsOf(admin)).some((n) => n.type === 'event.client_response' && n.title.startsWith('مهم:')));
    // الرد قابل للتغيير
    ok(await t.client().post(`/api/portal/${token}/events/${event.id}/response`, { answer: 'yes' }));
    assert.equal(t.app.db.value('SELECT client_response FROM matter_events WHERE id = ?', event.id), 'yes');
    // المحامي لا يرى ردها ولا ملاحظتها في واجهته
    const lv = ok(await cL.get(`/api/lawyer/matters/${matter.id}`));
    assert.ok(!JSON.stringify(lv).includes('client_response'));
  });

  test('hearing reminder: at most two sends per event (≤ 3 days and ≤ 1 day), never duplicated, day-before text is plain', async () => {
    t.app.db.run("DELETE FROM automation_runs WHERE rule_key = 'hearing_reminder'");
    t.app.db.run("DELETE FROM messages WHERE automation_rule = 'hearing_reminder'");
    freezeClock(T0);
    await runAutomations(admin);
    await runAutomations(admin);
    const forEvent = async () => (await outbox(admin)).filter((m) => m.automation_rule === 'hearing_reminder' && m.matter_id === matter.id);
    assert.equal((await forEvent()).length, 1, 'first reminder (≤ 3 days)');
    freezeClock(plusDays(T0, 1.5));
    await runAutomations(admin);
    await runAutomations(admin);
    freezeClock(plusDays(T0, 1.9));
    await runAutomations(admin);
    const rem = await forEvent();
    assert.equal(rem.length, 2, 'second reminder the day before, once');
    const last = rem.find((m) => m.body.includes('فكّرناك'));
    assert.ok(last, 'day-before text');
    assert.match(last.body, /بكرة جلسة الساعة 11 الصبح/);
    // v9.1 fixes: قائمة «هاتي معاكي» التي اعتمدتها الإدارة في ملاحظة الموعد بدل «هاتي بطاقتك» وحدها
    assert.match(last.body, /هاتي معاكي: بطاقتك الشخصية، شهادات ميلاد العيال\./);
    assert.doesNotMatch(last.body, /\{ي\}|MTR-/);
    freezeClock(T0);
  });

  test('money: invoice needs her agreement before any reminder; «موافقة» then reminder; «مش قادرة أدفع» alerts staff with REQ', async () => {
    const inv = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'رسوم إدارية للقضية', amount: 300, due_at: plusDays(T0, 1) }));
    let v = ok(await t.client().get(`/api/portal/${token}`));
    const pi = v.invoices.find((x) => x.number === inv.number);
    assert.equal(pi.needs_agreement, true);
    assert.equal(v.home.money.needs_agreement, 1);
    assert.ok(!v.home.next.some((n) => n.kind === 'invoice'), 'the «Now» card is never an invoice');
    freezeClock(plusDays(T0, 3));
    await runAutomations(admin);
    const reminders = async () => (await outbox(admin)).filter((m) => m.automation_rule === 'invoice_reminder');
    assert.equal((await reminders()).length, 0, 'no reminder for an amount she did not agree to');
    v = ok(await t.client().get(`/api/portal/${token}`));
    assert.equal(v.invoices.find((x) => x.number === inv.number).days_overdue, 2);
    assert.equal((await t.client().post(`/api/portal/${otherToken}/invoices/${inv.number}/response`, { answer: 'agree' })).status, 404);
    const agreed = ok(await t.client().post(`/api/portal/${token}/invoices/${inv.number}/response`, { answer: 'agree' }));
    assert.ok(agreed.client_agreed_at);
    await runAutomations(admin);
    assert.equal((await reminders()).length, 1, 'one reminder after her agreement');
    const inv2 = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'مصاريف إعلان', amount: 150, due_at: plusDays(T0, 10) }));
    ok(await t.client().post(`/api/portal/${token}/invoices/${inv2.number}/response`, { answer: 'cannot_pay' }));
    const n = (await notificationsOf(admin)).find((x) => x.type === 'invoice.client_response' && x.title.includes('مش قادرة أدفع'));
    assert.ok(n, 'staff alert');
    assert.match(n.title, /REQ-\d{4}-\d{5}/);
    // الإدارة ترى الرد في قائمة الفواتير
    const md = ok(await admin.get(`/api/admin/matters/${matter.id}`));
    assert.equal(md.invoices.find((x) => x.number === inv2.number).client_response, 'cannot_pay');
    freezeClock(T0);
  });

  test('callback: twice a day → 200, third → 429 with Arabic message; staff see «طلبت المستفيدة مكالمة»', async () => {
    ok(await t.client().post(`/api/portal/${token}/callback`, { when: 'morning' }));
    ok(await t.client().post(`/api/portal/${token}/callback`, { when: 'any' }));
    const third = await t.client().post(`/api/portal/${token}/callback`, { when: 'noon' });
    assert.equal(third.status, 429);
    assert.match(third.body.error, /مكالمة/);
    const notes = await notificationsOf(admin);
    assert.ok(notes.some((n) => n.type === 'client.callback' && n.title.startsWith('طلبت المستفيدة مكالمة (الصبح)')));
  });

  test('WhatsApp «مش هقدر» button on the day-before reminder maps to the same event response', async () => {
    const phone = t.app.clients.primaryPhone(kase.clientId).replace(/^\+/, '');
    const payload = waPayload({ from: phone, type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id: `evt:${event.id}:no`, title: 'مش هقدر' } } } });
    ok(await postWebhook(t, payload));
    assert.equal(t.app.db.value('SELECT client_response FROM matter_events WHERE id = ?', event.id), 'no');
    // زر لموعد مستفيدة أخرى لا يُسجل شيئًا
    const otherPhone = t.app.clients.primaryPhone(other.clientId).replace(/^\+/, '');
    ok(await postWebhook(t, waPayload({ from: otherPhone, type: 'interactive', extra: { interactive: { type: 'button_reply', button_reply: { id: `evt:${event.id}:yes`, title: 'هحضر' } } } })));
    assert.equal(t.app.db.value('SELECT client_response FROM matter_events WHERE id = ?', event.id), 'no');
  });

  test('staff search by the short request number («29») returns the REQ first; the inbox accepts it too', async () => {
    const code = t.app.db.value('SELECT code FROM intakes WHERE id = ?', kase.intakeId);
    const n = String(Number(code.slice(-5)));
    const s = ok(await admin.get(`/api/admin/search?q=${n}`));
    const g = s.groups.find((x) => x.key === 'intakes');
    assert.equal(g.items[0].code, code);
    const inbox = ok(await admin.get(`/api/admin/intakes?scope=all&q=${encodeURIComponent(`${n}/${code.slice(4, 8)}`)}`));
    assert.ok(inbox.items.some((i) => i.code === code));
  });

  test('address form: staff set «مذكر» → home.address = m (and a website request link ignores it)', async () => {
    ok(await admin.patch(`/api/admin/clients/${kase.clientId}`, { address_form: 'm' }));
    assert.equal(ok(await t.client().get(`/api/portal/${token}`)).home.address, 'm');
    assert.equal((await admin.patch(`/api/admin/clients/${kase.clientId}`, { address_form: 'x' })).status, 400);
    ok(await admin.patch(`/api/admin/clients/${kase.clientId}`, { address_form: null }));
    assert.equal(ok(await t.client().get(`/api/portal/${token}`)).home.address, 'f');
  });
});

describe('v9.1 b-portal — website request links and «تابعي طلبك»', () => {
  test('a website request link: one story, unconfirmed number, no phone owner data; OTP copy is honest and identical', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const r = ok(await t.client().post('/api/public/intake', { name: 'أبو أحمد', phone: '01012345678', description: 'جوزي مات وعايزة أعرف حقي في المعاش', consent: true }), 201);
      const tok = r.portal_url.split('/p/')[1];
      const v = ok(await t.client().get(`/api/portal/${tok}`));
      assert.equal(v.scope, 'request');
      assert.equal(v.home.name, 'أبو أحمد');
      assert.equal(v.home.address, 'm', '«أبو …» → masculine');
      assert.equal(v.home.ref, r.reference);
      assert.equal(v.home.stories.length, 1);
      assert.equal(v.home.stories[0].stage.key, 'received');
      assert.equal(v.home.whatsapp_confirmed, false);
      // رمز الدخول: نفس الرد حرفيًا للمسجل وغير المسجل، وبلا «خلال لحظات»
      const a = ok(await t.client().post('/api/public/portal-login/request', { phone: '01099990000' }));
      assert.equal(a.message, 'لو رقمك متسجل عندنا، هيوصلك كود من 6 أرقام على واتساب خلال دقيقة.');
      const bad = await t.client().post('/api/public/portal-login/verify', { challenge: a.challenge, code: '000000' });
      assert.equal(bad.status, 400);
      assert.match(bad.body.error, /^الكود ده مش صح\./);
    } finally {
      await t.close();
    }
  });

  test('static: portal pages use plain words, camera-first pickers, saved page, no banned staff jargon', () => {
    const portal = read('public/assets/js/public/portal.js');
    const login = read('public/assets/js/public/portal-login.js');
    for (const banned of ['فريق الإدارة', 'اسحبها', 'ميجابايت', 'عدد الأحرف', 'مرحبًا أم', 'رقمك لدى المؤسسة', 'المواعيد المميزة', 'الرأي القانوني المعتمد من الإدارة', 'متأخر منذ']) {
      assert.ok(!portal.includes(banned), `portal.js: ${banned}`);
      assert.ok(!login.includes(banned), `portal-login.js: ${banned}`);
    }
    assert.ok(!login.includes('إذا كان هذا الرقم مسجلًا لدينا فسيصلك خلال لحظات'));
    for (const s of ['ما وصلكيش الكود؟', 'قدّمتي من الموقع ومش لاقية الرابط؟', 'بتكلمينا من رقم عليه واتساب؟', 'افتحي صفحة طلبك', 'مش موبايلك؟ امسحي', 'محدش من عندنا هيطلب منك الكود ده أبدًا.']) assert.ok(login.includes(s), s);
    for (const s of ['طلبك وصل لفين؟', 'مفيش حاجة مطلوبة منك دلوقتي.', 'الرابط ده مش شغال', 'افتحي آخر صفحة محفوظة', 'مفيش إنترنت دلوقتي', 'حصلت مشكلة عندنا، مش منك', 'إمتى يناسبك نكلمك؟', 'هحضر إن شاء الله', 'مش هقدر أحضر', 'الاستشارة نفسها مجانية. المبالغ دي مصاريف خاصة بالقضية في المحكمة.', 'الميعاد عدّى']) {
      assert.ok(portal.includes(s), s);
    }
    assert.match(portal, /photoPicker\(/, 'camera-first picker from upload.js');
    assert.match(portal, /sendWithProgress\(/, 'upload with visible progress');
    assert.match(portal, /draftStore\(`request-\$\{r\.id\}`\)/, 'request drafts survive a killed tab');
    assert.match(portal, /capture: mode === 'camera' \? 'environment'/);
    assert.ok(!/from '\.\.\/lib\/ui\.js'/.test(portal), 'no heavy component library on the beneficiary page');
    const html = read('public/portal.html');
    assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('app.css'), 'no Google Fonts and no admin CSS');
    // المصاريف بلا أحمر
    const css = read('public/assets/css/v91-portal.css');
    const money = css.slice(css.indexOf('المصاريف (بلا أحمر)'), css.indexOf('───────────── الرسائل'));
    assert.ok(money.length > 100);
    assert.doesNotMatch(money, /#b42318|var\(--bp-err\)|\bred\b/);
  });

  test('/portal and /p/<token> render with the site header, noindex and no inline scripts', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const r = await t.client().get('/portal');
      assert.equal(r.status, 200);
      assert.match(r.body, /<h1 id="page-title" class="bp-login-title">تابعي طلبك<\/h1>/);
      assert.match(r.body, /noindex/);
      const p = await t.client().get('/p/short');
      assert.match(p.body, /id="portal-root"/);
      assert.match(p.body, /v91-portal\.css/);
    } finally {
      await t.close();
    }
  });
});

// ─────────────────────────────── مراجعة 9.1 (اختبار المراجِع) ───────────────────────────────

describe('v9.1 b-portal — review fixes', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none', config: LONG });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('staff asked her in a message (intake awaiting her reply) → the Now card says «محتاجين ردّك» until she replies', async () => {
    const r = ok(await t.client().post('/api/public/intake', { name: 'أم يوسف حسن', phone: uniquePhone(), description: 'جوزي اتوفى ومش عارفة أطلّع معاشه', consent: true }), 201);
    const tok = r.portal_url.split('/p/')[1];
    const intake = t.app.db.get('SELECT id FROM intakes WHERE code = ?', r.reference);
    ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'أهلًا يا أم يوسف، محتاجين صورة شهادة الوفاة وبطاقتك.', channel: 'website', await_client: true }));
    let v = ok(await t.client().get(`/api/portal/${tok}`));
    assert.equal(v.home.stories[0].stage.key, 'waiting_you');
    const reply = v.home.next.find((n) => n.kind === 'reply');
    assert.ok(reply, 'a «محتاجين ردّك» item while the tracker says «مستنيين منك ردّك»');
    assert.match(reply.text, /محتاجين صورة شهادة الوفاة/);
    assert.ok(!v.home.next.some((n) => n.kind === 'message' && n.id === reply.message_id), 'the same message is not listed twice');
    ok(await t.client().post(`/api/portal/${tok}/messages`, { body: 'حاضر، هبعتها النهارده' }));
    v = ok(await t.client().get(`/api/portal/${tok}`));
    assert.ok(!v.home.next.some((n) => n.kind === 'reply'), 'gone once she replied');
    assert.notEqual(v.home.stories[0].stage.key, 'waiting_you');
  });

  test('a resend after a lost connection (same client_ref) is recorded once: one message, one paper, one staff notice', async () => {
    const kase = await newCase(admin, { clientName: 'سامية محمود', legal_area: 'INH', title: 'ورث' });
    const tok = await portalFor(admin, kase.clientId);
    const ir = ok(await admin.post(`/api/admin/cases/${kase.id}/info-requests`, { kind: 'document', question: 'الورقتين', client_message: 'محتاجين الورقتين.', items: 'إعلام الوراثة\nشهادة الوفاة' }));
    const before = (await notificationsOf(admin)).filter((n) => n.title.startsWith('وصلت ورقة جديدة')).length;
    const body = { documents: [{ ...jpeg('إعلام-الوراثة-1.jpg'), item: 0 }], client_ref: 'a1b2c3d4e5f6a7b8c9d0e1f2' };
    const first = ok(await t.client().post(`/api/portal/${tok}/requests/${ir.id}/reply`, body));
    const again = ok(await t.client().post(`/api/portal/${tok}/requests/${ir.id}/reply`, body));
    assert.equal(again.duplicate, true);
    assert.equal(again.message_id, first.message_id);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM documents WHERE info_request_id = ? AND uploaded_by_kind = 'client'", ir.id)), 1);
    assert.deepEqual(again.request.items.map((i) => i.status), ['received', 'needed']);
    const after = (await notificationsOf(admin)).filter((n) => n.title.startsWith('وصلت ورقة جديدة')).length;
    assert.equal(after - before, 1);
    // رسالة: نفس المفتاح مرتين ← رسالة واحدة؛ مفتاح بصيغة غير صالحة ← 400
    const m = { body: 'سؤال واحد بس', client_ref: 'ffeeddccbbaa99887766' };
    const m1 = ok(await t.client().post(`/api/portal/${tok}/messages`, m));
    const m2 = ok(await t.client().post(`/api/portal/${tok}/messages`, m));
    assert.equal(m2.message_id, m1.message_id);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE client_id = ? AND body = 'سؤال واحد بس'", kase.clientId)), 1);
    assert.equal((await t.client().post(`/api/portal/${tok}/messages`, { body: 'x', client_ref: 'قصير' })).status, 400);
    // مفتاح شخص تاني لا يتصادم: نفس المفتاح من رابط مستفيدة أخرى رسالة جديدة لها
    const other = await newCase(admin, { clientName: 'نادية', legal_area: 'FAM', title: 'ملف آخر' });
    const otherTok = await portalFor(admin, other.clientId);
    const o = ok(await t.client().post(`/api/portal/${otherTok}/messages`, m));
    assert.notEqual(o.message_id, m1.message_id);
    assert.ok(!o.duplicate);
  });

  test('hearing note: «المحامي هيقابلك …» is a meeting line of its own, not a paper to bring', async () => {
    const kase = await newCase(admin, { clientName: 'نهى سمير', legal_area: 'FAM', title: 'نفقة' });
    const tok = await portalFor(admin, kase.clientId);
    const lawyer = await createLawyer(admin, { name: 'أ. محامي الجلسة', specialties: ['FAM'] });
    const matter = ok(await admin.post(`/api/admin/cases/${kase.id}/matter`, { kind: 'litigation', responsible_lawyer_id: lawyer.id, court: 'محكمة الأسرة', close_case: true }), 201);
    const ev = ok(await admin.post(`/api/admin/matters/${matter.id}/events`, { kind: 'hearing', starts_at: plusDays(new Date().toISOString(), 2), location: 'محكمة الأسرة', client_attendance_required: true, client_note: 'بطاقتك الشخصية\nالمحامي هيقابلك قدام باب القاعة الساعة 9 ونص' }));
    const v = ok(await t.client().get(`/api/portal/${tok}`));
    const e = v.events.find((x) => x.id === ev.id);
    assert.deepEqual(e.client_note, ['بطاقتك الشخصية']);
    assert.equal(e.meet_note, 'المحامي هيقابلك قدام باب القاعة الساعة 9 ونص');
    assert.doesNotMatch(JSON.stringify(v), /محامي الجلسة/, 'never the lawyer name');
  });

  test('static: per-link seen state and message draft (shared phones), resend keys, gender-aware money copy, one filled button per row', () => {
    const portal = read('public/assets/js/public/portal.js');
    assert.match(portal, /const LINK_KEY = /);
    assert.match(portal, /seenAll\(\)\[LINK_KEY\]/, 'bm_seen is kept per link');
    assert.match(portal, /draftStore\(`portal-message-\$\{LINK_KEY\}`\)/, 'the message draft is kept per link');
    assert.ok(!portal.includes("draftStore('portal-message')"));
    assert.equal((portal.match(/client_ref: newClientRef\(\)/g) || []).length, 2, 'request replies and messages carry a resend key');
    assert.ok(portal.includes("g('وصلنا إنك مش قادر{ة} تدفع{ي}. هنكلمك ونشوف إزاي نساعدك.')"));
    assert.ok(portal.includes("item.kind === 'reply'"), 'the «محتاجين ردّك» card');
    assert.ok(portal.includes('المحامي هيقابلك فين؟'));
    const css = read('public/assets/css/v91-portal.css');
    assert.match(css, /\.bp-item \.bmf-pick-camera\.bmf-btn-primary \{[^}]*background: var\(--bp-teal-bg\)/);
  });
});
