// الإصدار 9.1 — مسار l-home: «اليوم» للمحامي (L-01)، تنبيهات واتساب (L-06)، السرعة وصفحة /app (L-07)، هيكل الهاتف
// والشريط السفلي (L-08/L-16)، أول استخدام (L-10)، الإشعارات (L-12)، «تذكّرني» (L-17)، تنبيهات الجهاز (L-20)،
// ورابط إعادة التعيين على واتساب (L-21).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, createLawyer, newCase, assign, notificationsOf, allKeys, samplePdf } from './lane-b-kit.test.js';
import { totp, base32Decode } from '../src/totp.js';
import { countNotes } from '../src/services/lawyer-today.js';
import { ALERT_TEXT, quietUntil, dayMonth, TEST_TEXT } from '../src/services/lawyer-alerts.js';
import { grantsNotification, deadlineText } from '../src/services/lawyer-copy.js';
import { encryptPayload, decryptPayload } from '../src/services/web-push.js';
import { cairoLocalToIso } from '../src/util.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** ينتظر ما جُدول بعد الرد (setImmediate) */
const settle = () => new Promise((r) => setTimeout(r, 30));
const FORBIDDEN_TODAY_KEYS = ['client_name', 'phone', 'national_id', 'client_id', 'client_phone', 'facts', 'facts_internal', 'question', 'conversation'];

// ───────────────────────── «اليوم» (L-01) ─────────────────────────
describe('l-home: GET /api/lawyer/today (demo: hany)', () => {
  let t;
  let hany;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    hany = await t.login('hany');
  });
  after(() => t.close());

  test('staff roles are refused; a lawyer gets only own actions, ordered, with no beneficiary data', async () => {
    for (const u of ['admin', 'manager']) {
      const c = await t.login(u);
      assert.equal((await c.get('/api/lawyer/today')).status, 403, `${u} must not read /api/lawyer/today`);
    }
    assert.equal((await t.client().get('/api/lawyer/today')).status, 401);
    const d = ok(await hany.get('/api/lawyer/today'));
    assert.equal(d.user_id, hany.user.id);
    const keys = allKeys(d);
    for (const k of FORBIDDEN_TODAY_KEYS) assert.equal(keys.has(k), false, `today payload must not contain «${k}»`);
    const kinds = d.actions.map((a) => a.kind);
    // السيناريو المزروع: جلسة اليوم بلا نتيجة، رأي متأخر، إسناد جديد، مهمة بعد يومين
    for (const k of ['hearing_outcome', 'assignment_overdue', 'assignment_new', 'task_due']) assert.ok(kinds.includes(k), `seeded scenario has ${k}: ${kinds}`);
    assert.equal(kinds[0], 'hearing_outcome', 'a past hearing with no outcome is the first row');
    const order = ['hearing_outcome', 'assignment_overdue', 'assignment_returned', 'task_overdue', 'hearing_today', 'assignment_due_soon', 'assignment_new', 'info_shared', 'task_due'];
    const ranks = kinds.map((k) => order.indexOf(k));
    assert.deepEqual([...ranks].sort((a, b) => a - b), ranks, 'rows follow the spec order');
    // كل الملفات/الإسنادات المذكورة لهاني نفسه
    for (const a of d.actions.filter((x) => x.assignment_id)) {
      assert.equal(t.app.db.value('SELECT lawyer_id FROM assignments WHERE id = ?', a.assignment_id), hany.user.id);
    }
    for (const a of d.actions.filter((x) => x.matter_id)) {
      assert.equal(t.app.db.value('SELECT responsible_lawyer_id FROM matters WHERE id = ?', a.matter_id), hany.user.id);
    }
    assert.equal(d.pay.volunteer, false);
    assert.equal(d.pay.amount, 8000, 'monthly agreement: the month amount is expected');
    assert.ok(JSON.stringify(d).length < 12000, 'compact payload');
  });

  test('an older unrecorded hearing stays listed (no lower bound); other lawyers never see it', async () => {
    const m = t.app.db.get('SELECT id FROM matters WHERE responsible_lawyer_id = ? AND status != ? LIMIT 1', hany.user.id, 'closed');
    const old = t.app.matters.addEvent(m.id, { kind: 'hearing', title: 'جلسة قديمة', starts_at: new Date(Date.now() - 20 * 86400000).toISOString() }, { id: 1, role: 'admin' });
    const d = ok(await hany.get('/api/lawyer/today'));
    assert.ok(d.actions.some((a) => a.kind === 'hearing_outcome' && a.event_id === old.id));
    const ahmed = await t.login('ahmed');
    const da = ok(await ahmed.get('/api/lawyer/today'));
    assert.equal(da.actions.some((a) => a.event_id === old.id), false);
    t.app.db.run('DELETE FROM matter_events WHERE id = ?', old.id);
  });

  test('«تمّت» is one PATCH and «تراجع» reopens the task; the row leaves and comes back', async () => {
    const d = ok(await hany.get('/api/lawyer/today'));
    const task = d.actions.find((a) => a.kind === 'task_due' || a.kind === 'task_overdue');
    const done = ok(await hany.patch(`/api/lawyer/matter-tasks/${task.task_id}`, { status: 'done' }));
    assert.equal(done.status, 'done');
    assert.equal(ok(await hany.get('/api/lawyer/today')).actions.some((a) => a.task_id === task.task_id), false);
    ok(await hany.patch(`/api/lawyer/matter-tasks/${task.task_id}`, { status: 'open' }));
    assert.equal(ok(await hany.get('/api/lawyer/today')).actions.some((a) => a.task_id === task.task_id), true);
  });

  test('returned opinion row carries the number of numbered notes', () => {
    assert.equal(countNotes('1. أضف أجر المسكن\n2. راجع المادة 18\n3. صحح الحساب'), 3);
    assert.equal(countNotes('ملاحظة واحدة طويلة بلا ترقيم'), 1);
    assert.equal(countNotes('مقدمة\n- البند الأول\n- البند الثاني'), 2);
    assert.equal(countNotes(''), 0);
  });

  test('the old dashboard endpoint stays for compatibility', async () => {
    const d = ok(await hany.get('/api/lawyer/dashboard'));
    assert.ok(Array.isArray(d.assignments));
  });
});

// ───────────────────────── تنبيهات واتساب (L-06) ─────────────────────────
describe('l-home: lawyer WhatsApp alerts', () => {
  let t;
  let admin;
  let lw;
  let lawyer;
  /** بعد تحريك الساعة تنتهي الجلسات القديمة (مهلة عدم النشاط): دخول جديد بنفس الساعة المجمدة */
  async function at(iso) {
    freezeClock(iso);
    admin = await t.login('admin');
    if (lw) lawyer = await t.login(lw.username);
  }
  before(async () => {
    t = await startTestApp();
    t.app.config.demo = true; // وضع المحاكاة في النسخة التجريبية: التنبيهات متاحة دون إرسال فعلي
    t.app.config.publicBaseUrl = 'https://legal.example.org';
    admin = await t.login('admin');
    lw = await createLawyer(admin, { name: 'هاني الاختبار' });
    lawyer = await t.login(lw.username);
  });
  after(() => {
    resetClock();
    return t.close();
  });

  test('off by default; GET /api/account exposes the flags; enabling needs a valid mobile; staff cannot enable', async () => {
    const acc = ok(await lawyer.get('/api/account'));
    assert.equal(acc.alert_whatsapp, false);
    assert.equal(acc.alerts_available, true);
    assert.equal(acc.calendar_feed_active, false);
    const bad = await lawyer.patch('/api/account', { alert_whatsapp: true });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'أدخل رقم الموبايل لتصلك التنبيهات.');
    assert.equal(bad.body.details.fields.phone, 'أدخل رقم الموبايل لتصلك التنبيهات.');
    const okRes = ok(await lawyer.patch('/api/account', { alert_whatsapp: true, phone: '01001234567' }));
    assert.equal(okRes.alert_whatsapp, true);
    assert.equal((await admin.patch('/api/account', { alert_whatsapp: true })).status, 400);
    assert.equal((await admin.post('/api/account/alerts/test')).status, 403);
  });

  test('a new assignment creates exactly one outbox WhatsApp entry with the exact text and no beneficiary data', async () => {
    await at(cairoLocalToIso(2026, 10, 7, 11, 0));
    const before = Number(t.app.db.value('SELECT COALESCE(MAX(id), 0) FROM messages'));
    const kase = await newCase(admin, { clientName: 'سعاد عبد الرحمن', title: 'قضية نفقة سرية', facts_shared: 'وقائع حساسة جدًا عن المستفيدة', docs: ['شهادة.pdf'] });
    const due = cairoLocalToIso(2026, 10, 9, 18, 0);
    const a = await assign(admin, kase.id, { lawyer_id: lw.id, role: 'lead', due_at: due, brief: 'سؤال سري عن النفقة' });
    const rows = t.app.db.all('SELECT * FROM messages WHERE id > (SELECT ?) ORDER BY id', before);
    const alerts = rows.filter((m) => m.automation_rule === 'lawyer_alert');
    assert.equal(alerts.length, 1, 'exactly one WhatsApp alert');
    const m = alerts[0];
    assert.equal(m.channel, 'whatsapp');
    assert.equal(m.to_address, '+201001234567');
    assert.equal(m.status, 'simulated');
    assert.equal(m.client_id, null);
    assert.equal(m.case_id, null, 'never attached to the beneficiary thread');
    assert.ok(m.body.startsWith(`أُسند إليك ملف جديد ${kase.code}. سلّم رأيك قبل الجمعة 9 أكتوبر.`), m.body);
    assert.match(m.body, /^.* https:\/\/legal\.example\.org\/app#\/my\/assignments\/\d+$/);
    for (const secret of ['سعاد', 'قضية نفقة سرية', 'وقائع حساسة', 'سؤال سري', kase.phone, kase.phone.replace(/^0/, '')]) {
      assert.equal(m.body.includes(secret), false, `alert must not contain «${secret}»`);
    }
    // في صندوق الصادر المعتاد
    const out = ok(await admin.get('/api/admin/outbox?limit=50'));
    const list = Array.isArray(out) ? out : out.items || [];
    assert.ok(list.some((x) => x.id === m.id));
    // تكرار نفس الحدث لا يرسل مرة ثانية
    t.app.lawyerAlerts.onNotify([lw.id], { type: 'assignment.new', title: 'x', link: `#/my/assignments/${a.id}` });
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'lawyer_alert' AND id > ?", before)), 1, 'one alert per (type, entity)');
  });

  test('alert texts use codes, dates and links only', () => {
    assert.equal(ALERT_TEXT['opinion.returned']({ code: 'INH-2026-00482' }), 'أعادت الإدارة رأيك في INH-2026-00482 بملاحظات.');
    assert.equal(ALERT_TEXT['assignment.due_soon']({ code: 'INH-2026-00482' }), 'يتبقى يوم على موعد تسليم رأيك في INH-2026-00482.');
    assert.equal(ALERT_TEXT['assignment.overdue']({ code: 'INH-2026-00482' }), 'تأخر رأيك في INH-2026-00482. قدّمه أو اطلب مهلة.');
    assert.equal(ALERT_TEXT['hearing.outcome_missing']({ code: 'MTR-2026-00002' }), 'لم تُسجَّل نتيجة جلسة اليوم في MTR-2026-00002.');
    assert.equal(ALERT_TEXT.admin_reply({ code: 'INH-2026-00482' }), 'وصلك رد من الإدارة في INH-2026-00482.');
    assert.equal(ALERT_TEXT.digest({ n: 1 }), 'اليوم مطلوب منك أمر واحد.');
    assert.equal(ALERT_TEXT.digest({ n: 2 }), 'اليوم مطلوب منك أمران.');
    assert.equal(ALERT_TEXT.digest({ n: 5 }), 'اليوم مطلوب منك 5 أمور.');
    assert.equal(ALERT_TEXT.digest({ n: 12 }), 'اليوم مطلوب منك 12 أمرًا.');
    assert.equal(dayMonth(cairoLocalToIso(2026, 10, 9, 18, 0)), 'الجمعة 9 أكتوبر');
  });

  test('quiet hours: an alert triggered at 23:00 Cairo is queued and sent at 08:00', async () => {
    const at23 = cairoLocalToIso(2026, 10, 7, 23, 0);
    assert.equal(quietUntil(at23), cairoLocalToIso(2026, 10, 8, 8, 0));
    assert.equal(quietUntil(cairoLocalToIso(2026, 10, 8, 6, 0)), cairoLocalToIso(2026, 10, 8, 8, 0));
    assert.equal(quietUntil(cairoLocalToIso(2026, 10, 8, 12, 0)), null);
    await at(at23);
    const kase = await newCase(admin, { title: 'ملف ليلي' });
    const a = await assign(admin, kase.id, { lawyer_id: lw.id, role: 'lead', due_at: cairoLocalToIso(2026, 10, 12, 18, 0) });
    const row = t.app.db.get("SELECT * FROM lawyer_alerts WHERE user_id = ? AND entity = ?", lw.id, `assignment:${a.id}`);
    assert.equal(row.status, 'queued');
    assert.equal(row.send_after, cairoLocalToIso(2026, 10, 8, 8, 0));
    assert.equal(row.message_id, null, 'nothing sent at night');
    freezeClock(cairoLocalToIso(2026, 10, 8, 7, 59));
    t.app.lawyerAlerts.flush();
    assert.equal(t.app.db.get('SELECT status FROM lawyer_alerts WHERE id = ?', row.id).status, 'queued');
    freezeClock(cairoLocalToIso(2026, 10, 8, 8, 5));
    t.app.lawyerAlerts.flush();
    const sent = t.app.db.get('SELECT * FROM lawyer_alerts WHERE id = ?', row.id);
    assert.equal(sent.status, 'simulated');
    assert.ok(sent.message_id);
  });

  test('at most 6 alerts per lawyer per day; the morning digest is skipped when nothing is due', async () => {
    await at(cairoLocalToIso(2026, 10, 14, 10, 0));
    const lw2 = await createLawyer(admin, { name: 'محامي الحد اليومي' });
    const c2 = await t.login(lw2.username);
    ok(await c2.patch('/api/account', { alert_whatsapp: true, phone: '01101234567' }));
    // لا مطلوب الآن → لا ملخص صباحي
    freezeClock(cairoLocalToIso(2026, 10, 14, 8, 10));
    t.app.lawyerAlerts.runDigest();
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM lawyer_alerts WHERE user_id = ? AND type = 'digest'", lw2.id)), 0);
    await at(cairoLocalToIso(2026, 10, 14, 10, 0));
    for (let i = 0; i < 8; i++) {
      const k = await newCase(admin, { title: `ملف الحد ${i}` });
      await assign(admin, k.id, { lawyer_id: lw2.id, role: 'lead', due_at: cairoLocalToIso(2026, 10, 20, 18, 0) });
    }
    const sent = Number(t.app.db.value("SELECT COUNT(*) FROM lawyer_alerts WHERE user_id = ? AND status IN ('sent','simulated')", lw2.id));
    const capped = Number(t.app.db.value("SELECT COUNT(*) FROM lawyer_alerts WHERE user_id = ? AND error = 'daily_cap'", lw2.id));
    assert.equal(sent, 6);
    assert.equal(capped, 2);
    // اليوم التالي في الثامنة: ملخص واحد بعدد المطلوب
    freezeClock(cairoLocalToIso(2026, 10, 15, 8, 10));
    t.app.lawyerAlerts.runDigest();
    t.app.lawyerAlerts.runDigest();
    const digests = t.app.db.all("SELECT * FROM lawyer_alerts WHERE user_id = ? AND type = 'digest'", lw2.id);
    assert.equal(digests.length, 1);
    assert.match(digests[0].body, /^اليوم مطلوب منك 8 أمور\.$/);
  });

  test('24 h before the due time: one in-app notification and (opted-in) one alert', async () => {
    await at(cairoLocalToIso(2026, 11, 2, 10, 0));
    const k = await newCase(admin, { title: 'ملف قبل الموعد' });
    const a = await assign(admin, k.id, { lawyer_id: lw.id, role: 'lead', due_at: cairoLocalToIso(2026, 11, 3, 9, 0) });
    t.app.lawyerAlerts.runDueSoon();
    t.app.lawyerAlerts.runDueSoon();
    const notes = (await notificationsOf(lawyer)).filter((n) => n.type === 'assignment.due_soon' && n.link === `#/my/assignments/${a.id}`);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, `يتبقى يوم على موعد تسليم رأيك في ${k.code}`);
    const al = t.app.db.all("SELECT * FROM lawyer_alerts WHERE user_id = ? AND type = 'assignment.due_soon'", lw.id);
    assert.equal(al.length, 1);
    assert.ok(al[0].body.startsWith(`يتبقى يوم على موعد تسليم رأيك في ${k.code}.`));
  });

  test('test alert: lawyer only, exact text, rate-limited to 3 per hour', async () => {
    await at(cairoLocalToIso(2026, 11, 2, 12, 0));
    for (let i = 0; i < 3; i++) {
      const r = ok(await lawyer.post('/api/account/alerts/test'));
      assert.equal(r.simulated, true);
    }
    assert.equal((await lawyer.post('/api/account/alerts/test')).status, 429);
    const last = t.app.db.get("SELECT body FROM lawyer_alerts WHERE user_id = ? AND type = 'test' ORDER BY id DESC LIMIT 1", lw.id);
    assert.ok(last.body.startsWith(TEST_TEXT));
  });

  test('turning alerts off stops further alerts; unavailable in production simulation', async () => {
    ok(await lawyer.patch('/api/account', { alert_whatsapp: false }));
    const before = Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'lawyer_alert'"));
    const k = await newCase(admin, { title: 'بعد الإيقاف' });
    await assign(admin, k.id, { lawyer_id: lw.id, role: 'lead' });
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'lawyer_alert'")), before);
    t.app.config.demo = false;
    assert.equal(ok(await lawyer.get('/api/account')).alerts_available, false, 'no WhatsApp keys outside the demo: switch disabled');
    assert.equal((await lawyer.patch('/api/account', { alert_whatsapp: true, phone: '01001234567' })).status, 409);
    t.app.config.demo = true;
  });

  test('the lawyer_alert purpose appears on the template-mapping page and never falls back to the beneficiary template', async () => {
    const mappings = t.app.messaging.mappings();
    const m = mappings.find((x) => x.purpose === 'lawyer_alert');
    assert.ok(m, 'listed automatically');
    assert.equal(m.label, 'تنبيهات المحامين (بلا بيانات مستفيدين)');
    const plan = t.app.messaging.templatePlan({ id: 1, body: 'x', automation_rule: 'lawyer_alert', client_id: null }, { wa: { purpose: 'lawyer_alert', force_template: true } });
    assert.equal(plan, null, 'no lawyer_alert template mapped → no template at all (not case_update)');
  });
});

// ───────────────────────── الإشعارات تقول ماذا تغيّر (L-12) ─────────────────────────
describe('l-home: lawyer notification copy', () => {
  let t;
  let admin;
  let lw;
  let lawyer;
  let kase;
  let asg;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    lw = await createLawyer(admin);
    lawyer = await t.login(lw.username);
    kase = await newCase(admin, { docs: ['أ.pdf', 'ب.pdf', 'ج.pdf'], issues: ['الأولى', 'الثانية'] });
    asg = await assign(admin, kase.id, { lawyer_id: lw.id, role: 'lead', due_at: cairoLocalToIso(2026, 10, 9, 18, 0), brief: 'المطلوب تحديدًا' });
  });
  after(() => t.close());

  test('new assignment: weekday, date and time of the deadline, then the brief', async () => {
    const n = (await notificationsOf(lawyer)).find((x) => x.type === 'assignment.new');
    assert.equal(n.body, 'سلّم رأيك قبل الجمعة 9 أكتوبر، 6:00 م. المطلوب تحديدًا');
    assert.equal(deadlineText(cairoLocalToIso(2026, 10, 9, 9, 30)), 'الجمعة 9 أكتوبر، 9:30 ص');
  });

  test('granting 2 documents says so with the right count form; no vague «تم تحديث المحتوى المتاح لك»', async () => {
    const current = t.app.visibility.grantsPublic(asg.id);
    const docIds = t.app.db.all('SELECT id FROM documents WHERE case_id = ? ORDER BY id', kase.id).map((d) => d.id);
    const base = { ...current, document_ids: current.document_ids.filter((x) => !docIds.slice(0, 2).includes(x)) };
    ok(await admin.put(`/api/admin/assignments/${asg.id}/grants`, base));
    ok(await admin.put(`/api/admin/assignments/${asg.id}/grants`, { ...base, document_ids: [...base.document_ids, ...docIds.slice(0, 2)] }));
    const notes = (await notificationsOf(lawyer)).filter((x) => x.type === 'grants.updated');
    assert.equal(notes[0].title, `أتاحت لك الإدارة مستندين جديدين في ${kase.code}`);
    assert.equal(notes.some((x) => x.title.includes('تم تحديث المحتوى المتاح لك')), false);
    assert.ok(notes.some((x) => x.title === `تغيّر ما يمكنك الاطلاع عليه في ${kase.code}`), 'removal-only change has its own title');
  });

  test('grant diff titles (unit)', () => {
    const b = { facts: true, issue_ids: [1], document_ids: [1], opinion_assignment_ids: [], info_request_ids: [] };
    const tt = (after) => grantsNotification(b, { ...b, ...after }, 'INH-2026-00482', () => ['عقد البيع'])?.title;
    assert.equal(tt({ document_ids: [1, 2] }), 'أتاحت لك الإدارة مستندًا جديدًا في INH-2026-00482');
    assert.equal(tt({ document_ids: [1, 2, 3, 4] }), 'أتاحت لك الإدارة 3 مستندات جديدة في INH-2026-00482');
    assert.equal(tt({ document_ids: [1, ...Array.from({ length: 11 }, (_, i) => i + 10)] }), 'أتاحت لك الإدارة 11 مستندًا جديدًا في INH-2026-00482');
    assert.equal(tt({ issue_ids: [1, 2, 3] }), 'أتاحت لك الإدارة مسألتين جديدتين في INH-2026-00482');
    assert.equal(tt({ opinion_assignment_ids: [7] }), 'أتاحت لك الإدارة رأي زميل في INH-2026-00482');
    assert.equal(tt({ document_ids: [1, 2], issue_ids: [1, 2] }), 'أتاحت لك الإدارة إضافات جديدة في INH-2026-00482');
    assert.equal(tt({ document_ids: [] }), 'تغيّر ما يمكنك الاطلاع عليه في INH-2026-00482');
    assert.equal(grantsNotification(b, { ...b }, 'X'), null, 'no change → no notification');
  });

  test('due date / brief changes say what changed; returned opinion opens the editor', async () => {
    ok(await admin.patch(`/api/admin/assignments/${asg.id}`, { due_at: cairoLocalToIso(2026, 10, 11, 12, 0) }));
    ok(await admin.patch(`/api/admin/assignments/${asg.id}`, { brief: 'مطلوب جديد' }));
    const notes = (await notificationsOf(lawyer)).filter((x) => x.type === 'assignment.updated');
    assert.ok(notes.some((x) => x.title === `تغيّر موعد تسليم رأيك في ${kase.code} إلى الأحد 11 أكتوبر، 12:00 م`));
    assert.ok(notes.some((x) => x.title === `عدّلت الإدارة المطلوب منك في ${kase.code}`));
    ok(await lawyer.put(`/api/lawyer/assignments/${asg.id}/draft`, { body: 'الرأي القانوني الأول بنص كافٍ للتقديم والمراجعة.' }));
    ok(await lawyer.post(`/api/lawyer/assignments/${asg.id}/submit`, {}));
    const op = t.app.db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", asg.id);
    ok(await admin.post(`/api/admin/opinions/${op.id}/return`, { note: '1. أضف المادة\n2. صحح الحساب' }));
    const ret = (await notificationsOf(lawyer)).find((x) => x.type === 'opinion.returned');
    assert.equal(ret.link, `#/my/assignments/${asg.id}/write`);
    const today = ok(await lawyer.get('/api/lawyer/today'));
    const row = today.actions.find((a) => a.kind === 'assignment_returned');
    assert.equal(row.notes_count, 2);
  });
});

// ───────────────────────── «تذكّرني على هذا الجهاز» (L-17) ─────────────────────────
describe('l-home: remembered device sessions', () => {
  let t;
  let admin;
  let lw;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    lw = await createLawyer(admin);
  });
  after(() => {
    resetClock();
    return t.close();
  });
  const maxAge = (r) => Number(/Max-Age=(\d+)/.exec(r.headers.get('set-cookie') || '')?.[1]);

  test('lawyer without 2FA + remember: 7 days (idle 3 days); unchecked: the usual 72 h; staff ignore remember', async () => {
    const c = t.client();
    const r = await c.post('/api/auth/login', { username: lw.username, password: 'Lawyer@2026', remember: true });
    assert.equal(r.status, 200);
    assert.equal(maxAge(r), 7 * 86400);
    const s = t.app.db.get('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', lw.id);
    assert.equal(s.remember, 1);
    assert.equal(s.idle_hours, 72);
    assert.equal(Date.parse(s.expires_at) - Date.parse(s.created_at), 7 * 86400000);
    const ev = t.app.db.get("SELECT data FROM security_events WHERE type = 'auth.login' AND user_id = ? ORDER BY id DESC LIMIT 1", lw.id);
    assert.deepEqual(JSON.parse(ev.data), { method: 'password_only', remember: true, remember_applied: true });
    const plain = await t.client().post('/api/auth/login', { username: lw.username, password: 'Lawyer@2026' });
    assert.equal(maxAge(plain), 72 * 3600);
    const adm = await t.client().post('/api/auth/login', { username: 'admin', password: 'Admin@2026', remember: true });
    assert.equal(maxAge(adm), 72 * 3600, 'admin ignores remember');
    const acc = ok(await c.get('/api/account'));
    assert.equal(acc.remember.this_device, true);
    assert.equal(acc.remember.days_with_2fa, 30);
  });

  test('remembered session survives 2 idle days (beyond the 12 h staff idle limit), ends after its own idle limit', async () => {
    const c = t.client();
    ok(await c.post('/api/auth/login', { username: lw.username, password: 'Lawyer@2026', remember: true }));
    freezeClock(new Date(Date.now() + 2 * 86400000).toISOString());
    assert.equal((await c.get('/api/lawyer/today')).status, 200);
    t.app.auth.purgeExpired();
    assert.equal((await c.get('/api/lawyer/today')).status, 200, 'purge keeps the remembered session');
    freezeClock(new Date(Date.now() + 6 * 86400000).toISOString());
    assert.equal((await c.get('/api/lawyer/today')).status, 401);
    resetClock();
  });

  test('lawyer with 2FA + remember: 30 days; revoke-others, password change and admin 2FA reset still end it', async () => {
    const c = await t.login(lw.username);
    const setup = ok(await c.post('/api/account/2fa/setup', { password: 'Lawyer@2026' }));
    ok(await c.post('/api/account/2fa/enable', { code: totp(base32Decode(setup.secret)) }));
    const phone = t.client();
    const s1 = ok(await phone.post('/api/auth/login', { username: lw.username, password: 'Lawyer@2026', remember: true }));
    assert.equal(s1.two_factor_required, true);
    freezeClock(new Date(Date.now() + 31000).toISOString());
    const s2 = await phone.post('/api/auth/login/2fa', { challenge: s1.challenge, code: totp(base32Decode(setup.secret), Date.now() + 31000), remember: true });
    assert.equal(s2.status, 200, JSON.stringify(s2.body));
    assert.equal(maxAge(s2), 30 * 86400);
    const row = t.app.db.get('SELECT * FROM sessions WHERE user_id = ? AND remember = 1 ORDER BY created_at DESC LIMIT 1', lw.id);
    assert.equal(row.idle_hours, 14 * 24);
    assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 30 * 86400000);
    // «تسجيل الخروج من كل الأجهزة الأخرى» من جهاز آخر ينهي الجلسة المتذكَّرة
    ok(await c.post('/api/account/sessions/revoke-others'));
    assert.equal((await phone.get('/api/lawyer/today')).status, 401);
    resetClock();
  });
});

// ───────────────────────── السرعة: meta وصفحة /app وعامل الخدمة (L-07) ─────────────────────────
describe('l-home: fast boot (/api/meta ETag, /app page, CSP, service worker)', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(() => t.close());

  test('/api/meta sends an ETag and answers If-None-Match with 304; /api/auth/session carries meta_version', async () => {
    const c = t.client();
    const r = await c.get('/api/meta');
    const etag = r.headers.get('etag');
    assert.match(etag, /^"m-[A-Za-z0-9_-]{20}"$/);
    const again = await fetch(`${t.base}/api/meta`, { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);
    const s = ok(await c.get('/api/auth/session'));
    assert.equal(s.meta_version, etag);
    t.app.settings.set('org_tagline', 'سطر جديد');
    const changed = await fetch(`${t.base}/api/meta`, { headers: { 'If-None-Match': etag } });
    assert.equal(changed.status, 200, 'a settings change gives a new version');
  });

  test('/app: versioned assets, modulepreload, lazy staff CSS versions, self-hosted font, no Google, cacheable by the SW', async () => {
    const r = await fetch(`${t.base}/app`);
    const html = await r.text();
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.ok(r.headers.get('etag'));
    assert.equal(/fonts\.(googleapis|gstatic)\.com/.test(html), false);
    assert.match(html, /<link rel="preload" href="\/assets\/fonts\/plex-arabic-400\.woff2\?v=[\w-]+" as="font"/);
    const preload = (src, f) => new RegExp(`<link rel="modulepreload" href="/assets/js/${f.replace('.', '\\.')}\\?v=[\\w-]+"`).test(src);
    for (const f of ['app/main.js', 'app/router.js', 'app/routes.js', 'app/pages/login.js', 'lib/h.js', 'lib/api.js', 'lib/fmt.js', 'lib/ui.js']) {
      assert.ok(preload(html, f), f);
    }
    // بلا جلسة سابقة: لا تُحمَّل وحدات الهيكل مسبقًا (شاشة الدخول أولًا)؛ مع كعكة الجلسة تُحمَّل بأولوية منخفضة
    assert.equal(preload(html, 'app/shell.js'), false, 'no shell preload before login');
    const withSid = await (await fetch(`${t.base}/app`, { headers: { cookie: 'bm_sid=x' } })).text();
    for (const f of ['app/shell.js', 'app/lawyer-shell.js']) assert.ok(preload(withSid, f), `${f} with a session cookie`);
    assert.equal(withSid.includes('data-session-only'), false);
    // سكربت الإقلاع المبكر (عادي، async) لمن يحمل جلسة فقط، بعد كتلة البيانات التي يقرؤها
    assert.match(withSid, /<script type="application\/json" id="bm-assets">[^<]+<\/script>\s*<script src="\/assets\/js\/app\/boot-early\.js\?v=[\w-]+" async fetchpriority="high"><\/script>/);
    assert.equal(html.includes('boot-early.js'), false, 'no early boot script before login');
    assert.equal(/rel="preload" href="\/assets\/fonts\//.test(withSid), false, 'with a session the font is not preloaded (the page waits for modules and data, not the font)');
    // جدول boot-early.js (سكربت عادي) يطابق LAWYER_DATA في routes.js: نفس المسارات ونفس روابط البيانات
    const early = read('public/assets/js/app/boot-early.js');
    const routesSrc = read('public/assets/js/app/routes.js');
    for (const [route, api] of [
      ['/my/assignments/:id', '/lawyer/assignments/'],
      ['/my/assignments/:id/write', '/lawyer/assignments/'],
      ['/my/matters', '/lawyer/matters'],
      ['/my/matters/:id', '/lawyer/matters/'],
      ['/my/statement', '/lawyer/statement'],
    ]) {
      assert.ok(routesSrc.includes(`'${route}': (`) && routesSrc.includes(api), `routes.js LAWYER_DATA has ${route}`);
      assert.ok(early.includes(`'${api}`), `boot-early.js asks the session for ${api}`);
    }
    assert.match(early, /page = role === 'lawyer' \? '\/lawyer\/today' : null/);
    assert.match(read('public/assets/js/app/main.js'), /page = role === 'lawyer' \? '\/lawyer\/today' : null/);
    assert.equal(/\bimport\b|\bexport\b/.test(early.replace(/\/\/[^\n]*/g, '')), false, 'boot-early.js is a classic script');
    assert.equal(preload(withSid, 'app/pages/login.js'), false, 'with a session the login screen is not preloaded');
    assert.equal(preload(withSid, 'lib/pwa.js'), false, 'pwa.js loads after the first screen');
    // تلميح الجلسة وما تستورده صفحات المحامي (لرابط إشعار مباشر)
    const info = JSON.parse(/<script type="application\/json" id="bm-assets">([^<]+)<\/script>/.exec(withSid)[1]);
    assert.equal(info.sid, 1);
    assert.match(info.graph['app/pages/lawyer/matter.js'][0], /^\/assets\/js\/app\/pages\/lawyer\/matter\.js\?v=[\w-]+$/);
    assert.ok(info.graph['app/pages/lawyer/matter.js'].every((u) => !withSid.includes(`href="${u}"`)), 'graph lists only modules not already preloaded');
    for (const sheet of ['pages-a', 'pages-b', 'pages-d', 'v9-programs', 'v9-messaging', 'v9-platform']) {
      assert.equal(html.includes(`/assets/css/${sheet}.css`), false, `${sheet} is lazy`);
    }
    // أوراق التطبيق مجمّعة في ملفين بإصدار ثابت
    const bundle = /href="\/assets\/css\/bundle-a\.css\?v=([\w-]+)"/.exec(html);
    assert.ok(bundle, 'bundle-a is linked');
    const css = await fetch(`${t.base}/assets/css/bundle-a.css?v=${bundle[1]}`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('cache-control') || '', /immutable/);
    assert.match(await css.text(), /@font-face/);
    const data = JSON.parse(/<script type="application\/json" id="bm-assets">([^<]+)<\/script>/.exec(html)[1]);
    assert.ok(data.css['pages-a'] && data.css['v9-programs']);
    const csp = r.headers.get('content-security-policy');
    assert.equal(/googleapis|gstatic/.test(csp), false, 'the /app CSP has no Google font origins');
    // ولا أي صفحة أخرى (الموقع العام و/setup صارا على الخط المستضاف ذاتيًا)
    for (const p of ['/', '/api/meta', '/portal']) {
      assert.equal(/googleapis|gstatic/.test((await fetch(`${t.base}${p}`)).headers.get('content-security-policy')), false, p);
    }
    assert.equal(/fonts\.(googleapis|gstatic)\.com/.test(read('public/setup.html')), false, '/setup has no Google Fonts');
    assert.match(csp, /font-src 'self' data:/);
    assert.match(csp, /script-src 'self'(;|$)/);
    const etag = r.headers.get('etag');
    assert.equal((await fetch(`${t.base}/app`, { headers: { 'If-None-Match': etag } })).status, 304);
  });

  test('cold login stays light: /api/meta?part=login, Brotli for text assets, stripped CSS bundles, Arabic-only screens skip the Latin font', async () => {
    const full = await (await fetch(`${t.base}/api/meta`)).json();
    const r = await fetch(`${t.base}/api/meta?part=login`);
    const slim = await r.json();
    assert.equal(slim.partial, true);
    assert.equal(slim.settings.org_name, full.settings.org_name);
    assert.deepEqual(Object.keys(slim.constants), ['LABELS']);
    assert.deepEqual(Object.keys(slim.constants.LABELS), ['user_role']);
    assert.ok(JSON.stringify(slim).length * 4 < JSON.stringify(full).length, 'well under a quarter of the full payload');
    assert.notEqual(r.headers.get('etag'), (await fetch(`${t.base}/api/meta`)).headers.get('etag'));
    // meta مع /api/auth/session في طلب واحد: الصغيرة للزائر، والكاملة لمن يحمل جلسة صالحة حتى لو طلب الصغيرة
    const anon = await (await fetch(`${t.base}/api/auth/session?meta=login`)).json();
    assert.equal(anon.user, null);
    assert.equal(anon.meta.partial, true);
    assert.equal(anon.meta_etag, r.headers.get('etag'));
    const c = await t.login('admin');
    const withUser = ok(await c.get('/api/auth/session?meta=login'));
    assert.equal(withUser.user.username, 'admin');
    assert.equal(withUser.meta.partial, undefined);
    assert.ok(withUser.meta.constants.LEGAL_AREAS);
    assert.equal(withUser.meta_etag, withUser.meta_version);
    assert.equal(ok(await c.get('/api/auth/session')).meta, undefined, 'no payload unless asked');
    // page=…: بيانات صفحة المحامي مع الجلسة — لمحامٍ بجلسة صالحة ولمسارات GET محددة فقط
    assert.equal(ok(await c.get('/api/auth/session?page=%2Flawyer%2Ftoday')).page, undefined, 'staff get no lawyer page data');
    assert.equal((await (await fetch(`${t.base}/api/auth/session?page=%2Flawyer%2Ftoday`)).json()).page, undefined, 'no session, no page data (and no 401)');
    // Brotli لمن يقبله (Node fetch يفك الضغط تلقائيًا؛ نطلب بـ http الخام لنرى الترويسة)
    const http = await import('node:http');
    const zlib = await import('node:zlib');
    const raw = (p, headers) =>
      new Promise((resolve, reject) => {
        http.get(`${t.base}${p}`, { headers }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        }).on('error', reject);
      });
    const js = await raw('/assets/js/lib/ui.js', { 'accept-encoding': 'gzip, deflate, br' });
    assert.equal(js.headers['content-encoding'], 'br');
    assert.ok(zlib.brotliDecompressSync(js.body).toString('utf8').includes('export function'));
    assert.equal((await raw('/assets/js/lib/ui.js', { 'accept-encoding': 'gzip, br;q=0' })).headers['content-encoding'], 'gzip');
    const meta = await raw('/api/meta', { 'accept-encoding': 'br' });
    assert.equal(meta.headers['content-encoding'], 'br');
    assert.ok(JSON.parse(zlib.brotliDecompressSync(meta.body).toString('utf8')).constants.LABELS);
    // الملفان المجمّعان بلا تعليقات (التعليقات العربية تثقل الملف)
    const html = await (await fetch(`${t.base}/app`)).text();
    const href = /href="(\/assets\/css\/bundle-b\.css\?v=[\w-]+)"/.exec(html)[1];
    const css = await raw(href, { 'accept-encoding': 'br' });
    assert.equal(css.headers['content-encoding'], 'br');
    const text = zlib.brotliDecompressSync(css.body).toString('utf8');
    assert.equal(/\/\*(?! [\w.-]+\.css \*\/)/.test(text), false, 'only the per-file markers remain');
    assert.match(text, /\.lh-/);
    // المسافة ضمن ملف العربية؛ والنجمة و«…» خارج الملف اللاتيني
    const appCss = read('public/assets/css/app.css');
    const ranges = [...appCss.matchAll(/src: url\("\/assets\/fonts\/plex-(arabic|latin)-\d+\.woff2"\) format\("woff2"\);\s*unicode-range: ([^;]+);/g)];
    assert.equal(ranges.length, 6);
    for (const [, subset, range] of ranges) {
      if (subset === 'arabic') assert.match(range, /^U\+0020, U\+00A0, U\+0600-06FF/);
      else assert.match(range, /^U\+0000-001F, U\+0021-0029, U\+002B-009F, U\+00A1-00FF,.* U\+2000-2025, U\+2027-206F/);
    }
  });

  test('/api/auth/session?page=…: the lawyer page data comes with the session, same answer and same permissions as the direct request', async () => {
    const admin = await t.login('admin');
    const a = await createLawyer(admin, { name: 'محامي الإقلاع' });
    const b = await createLawyer(admin, { name: 'محامٍ آخر' });
    const kase = await newCase(admin, { title: 'ملف رابط الإشعار' });
    const asg = await assign(admin, kase.id, { lawyer_id: a.id, role: 'lead', due_at: new Date(Date.now() + 3 * 864e5).toISOString() });
    const la = await t.login(a.username);
    const lb = await t.login(b.username);
    const s = ok(await la.get(`/api/auth/session?page=${encodeURIComponent(`/lawyer/assignments/${asg.id}`)}`));
    assert.equal(s.user.username, a.username);
    assert.equal(s.page.path, `/lawyer/assignments/${asg.id}`);
    assert.equal(s.page.status, 200);
    assert.equal(s.page.body.assignment.id, asg.id);
    assert.deepEqual(Object.keys(s.page.body).sort(), Object.keys(ok(await la.get(`/api/lawyer/assignments/${asg.id}`))).sort());
    const today = ok(await la.get('/api/auth/session?page=%2Flawyer%2Ftoday')).page;
    assert.equal(today.status, 200);
    assert.ok(Array.isArray(today.body.actions));
    // محامٍ آخر: نفس رفض الطلب المباشر (لا تسريب عبر الجلسة)
    const other = ok(await lb.get(`/api/auth/session?page=${encodeURIComponent(`/lawyer/assignments/${asg.id}`)}`)).page;
    const direct = await lb.get(`/api/lawyer/assignments/${asg.id}`);
    assert.equal(other.status, direct.status);
    assert.ok(other.status >= 400 && other.body.error && !other.body.assignment);
    // مسارات خارج القائمة لا تُنفَّذ
    for (const p of ['/admin/cases', '/lawyer/assignments', `/lawyer/assignments/${asg.id}/open`, '/lawyer/../admin/cases', 'lawyer/today']) {
      assert.equal(ok(await la.get(`/api/auth/session?page=${encodeURIComponent(p)}`)).page, undefined, p);
    }
  });

  test('the service worker precaches /app shell, versioned assets and the fonts; push handlers are generic', async () => {
    const sw = await (await fetch(`${t.base}/sw.js`)).text();
    assert.match(sw, /\/assets\/fonts\/plex-arabic-400\.woff2\?v=/);
    assert.match(sw, /\/assets\/js\/app\/main\.js\?v=/);
    assert.match(sw, /refreshShell\(cache\)/);
    assert.match(sw, /لديك تحديث في منصة الدعم القانوني/);
    assert.match(sw, /addEventListener\('notificationclick'/);
  });

  test('admin route definitions declare the lazy staff sheets; /print declares v9-programs', () => {
    const routes = read('public/assets/js/app/routes.js');
    assert.match(routes, /STAFF_CSS = \['pages-a', 'pages-b', 'pages-d', 'v9-platform', 'v9-programs', 'v9-messaging'\]/);
    assert.match(routes, /path: '\/print\/:kind\/:id'.*css: \['v9-programs'\]/);
    const lazy = read('src/app-page-assets.js');
    assert.match(lazy, /'pages-a', 'pages-b', 'pages-d', 'v9-platform', 'v9-programs', 'v9-messaging'/);
  });
});

// ───────────────────────── تنبيهات الجهاز (L-20) ─────────────────────────
describe('l-home: Web Push', () => {
  let t;
  let admin;
  let lw;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    lw = await createLawyer(admin);
  });
  after(() => t.close());

  function uaKeys() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { ecdh, p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
  }

  test('RFC 8291 payload round-trips and carries only {type, link}', () => {
    const k = uaKeys();
    const payload = t.app.webPush.payloadFor({ type: 'assignment.new', title: 'أُسند إليك الملف INH-2026-00482', body: 'سؤال سري', link: '#/my/assignments/5' });
    assert.deepEqual(Object.keys(payload).sort(), ['link', 'type']);
    const body = encryptPayload(JSON.stringify(payload), { p256dh: k.p256dh, auth: k.auth });
    const out = JSON.parse(decryptPayload(body, k.ecdh, k.auth));
    assert.deepEqual(out, { type: 'assignment.new', link: '#/my/assignments/5' });
    assert.equal(t.app.webPush.payloadFor({ type: 'x', link: 'https://evil.example/' }).link, '#/my', 'only in-app links');
  });

  test('subscribe: lawyer only, known push services only; signed VAPID request; removed on logout and revoke-others', async () => {
    const k = uaKeys();
    const c = await t.login(lw.username);
    assert.equal((await admin.post('/api/account/push-subscription', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: k.p256dh, auth: k.auth } } })).status, 403, 'lawyers only');
    assert.equal((await c.post('/api/account/push-subscription', { subscription: { endpoint: 'http://127.0.0.1:9/internal', keys: { p256dh: k.p256dh, auth: k.auth } } })).status, 400, 'no SSRF to arbitrary hosts');
    // خادم محلي يمثل خدمة الدفع
    const got = [];
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (d) => chunks.push(d));
      req.on('end', () => {
        got.push({ headers: req.headers, body: Buffer.concat(chunks) });
        res.statusCode = 201;
        res.end();
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const host = `127.0.0.1:${srv.address().port}`;
    t.app.webPush.allowHostForTests(host);
    const st = ok(await c.post('/api/account/push-subscription', { subscription: { endpoint: `http://${host}/push/abc`, keys: { p256dh: k.p256dh, auth: k.auth } } }));
    assert.equal(st.this_device, true);
    const results = await t.app.webPush.sendToUser(lw.id, { type: 'opinion.returned', link: '#/my/assignments/9/write' });
    assert.deepEqual(results, [{ ok: true }]);
    assert.equal(got.length, 1);
    assert.equal(got[0].headers['content-encoding'], 'aes128gcm');
    assert.match(got[0].headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    // توقيع ES256 صحيح بمفتاح VAPID العام
    const [, jwt] = /t=([^,]+)/.exec(got[0].headers.authorization);
    const [h64, p64, s64] = jwt.split('.');
    const pub = Buffer.from(t.app.webPush.publicKey(), 'base64url');
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.equal(crypto.verify('sha256', Buffer.from(`${h64}.${p64}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url')), true);
    assert.equal(JSON.parse(Buffer.from(p64, 'base64url')).aud, `http://${host}`);
    assert.deepEqual(JSON.parse(decryptPayload(got[0].body, k.ecdh, k.auth)), { type: 'opinion.returned', link: '#/my/assignments/9/write' });
    srv.close();
    // تسجيل الخروج يحذف اشتراك الجلسة
    ok(await c.post('/api/auth/logout'));
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', lw.id)), 0);
    // «تسجيل الخروج من الأجهزة الأخرى» يحذف اشتراكات الجلسات الأخرى
    const other = await t.login(lw.username);
    ok(await other.post('/api/account/push-subscription', { subscription: { endpoint: `http://${host}/push/def`, keys: { p256dh: k.p256dh, auth: k.auth } } }));
    const me = await t.login(lw.username);
    ok(await me.post('/api/account/sessions/revoke-others'));
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', lw.id)), 0);
  });
});

// ───────────────────────── رابط إعادة التعيين على واتساب (L-21) ─────────────────────────
describe('l-home: self-service reset by WhatsApp', () => {
  let t;
  let admin;
  let lw;
  before(async () => {
    t = await startTestApp();
    t.app.config.demo = true;
    admin = await t.login('admin');
    lw = await createLawyer(admin);
    const c = await t.login(lw.username);
    ok(await c.patch('/api/account', { alert_whatsapp: true, phone: '01201234567' }));
  });
  after(() => t.close());

  test('same reply for existing and unknown usernames; sends only to opted-in lawyers; 30-minute link; token never stored', async () => {
    const c = t.client();
    const before = Number(t.app.db.value('SELECT COALESCE(MAX(id), 0) FROM messages'));
    const a = ok(await c.post('/api/auth/reset-request', { username: lw.username }));
    const b = ok(await c.post('/api/auth/reset-request', { username: 'no-such-user' }));
    const s = ok(await c.post('/api/auth/reset-request', { username: 'admin' }));
    assert.deepEqual(a, b);
    assert.deepEqual(a, s);
    assert.equal(a.message, 'إن كان الحساب مسجلًا برقم واتساب فسيصله رابط خلال دقيقة.');
    await settle(); // مراجعة l-home: الإرسال بعد الرد (لا فرق في زمن الرد بين الحسابات)
    const msgs = t.app.db.all('SELECT * FROM messages WHERE id > ?', before);
    assert.equal(msgs.length, 1, 'only the opted-in lawyer gets a message');
    assert.equal(msgs[0].to_address, '+201201234567');
    const tok = t.app.db.get("SELECT * FROM account_tokens WHERE user_id = ? AND kind = 'reset' ORDER BY id DESC LIMIT 1", lw.id);
    const ttl = Date.parse(tok.expires_at) - Date.parse(tok.created_at);
    assert.ok(ttl <= 30 * 60000 + 2000 && ttl >= 29 * 60000, `expires in 30 minutes (got ${ttl})`);
    assert.equal(/#\/reset\//.test(msgs[0].body), false, 'the reset token is never written to the outbox');
  });

  test('rate-limited per account and per IP (same reply when the account limit is reached)', async () => {
    const c = t.client();
    const before = Number(t.app.db.value("SELECT COUNT(*) FROM account_tokens WHERE kind = 'reset'"));
    for (let i = 0; i < 4; i++) ok(await c.post('/api/auth/reset-request', { username: lw.username }));
    await settle();
    const after1 = Number(t.app.db.value("SELECT COUNT(*) FROM account_tokens WHERE kind = 'reset'"));
    assert.ok(after1 - before <= 2, 'at most 3 per hour per account (1 already used above)');
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const r = await c.post('/api/auth/reset-request', { username: `ghost${i}` });
      if (r.status === 429) limited = true;
    }
    assert.equal(limited, true, 'per-IP limit');
  });
});

// ───────────────────────── مراجعة l-home: إصلاحات ─────────────────────────
describe('l-home review: phone change, alert edge cases, «قادم», push orphans', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    t.app.config.demo = true;
    admin = await t.login('admin');
  });
  after(() => {
    resetClock();
    return t.close();
  });

  test('a lawyer changing the mobile (the WhatsApp reset channel) from an old session must confirm the current password', async () => {
    const t0 = cairoLocalToIso(2026, 10, 7, 11, 0);
    freezeClock(t0);
    const lw = await createLawyer(admin, { name: 'محامي تغيير الرقم' });
    const c = await t.login(lw.username);
    // دخول حديث (أقل من 10 دقائق): بلا سؤال — مثل بطاقة «جهّز هاتفك» بعد التفعيل
    ok(await c.patch('/api/account', { phone: '01001230001', alert_whatsapp: true }));
    freezeClock(new Date(Date.parse(t0) + 11 * 60000).toISOString());
    const r = await c.patch('/api/account', { phone: '01001239999' });
    assert.equal(r.status, 400);
    assert.equal(r.body.details.fields.current_password, 'أدخل كلمة المرور الحالية لتغيير رقم الموبايل.');
    assert.equal(t.app.db.value('SELECT phone FROM users WHERE id = ?', lw.id), '+201001230001', 'unchanged');
    const wrong = await c.patch('/api/account', { phone: '01001239999', current_password: 'خطأ-Wrong1' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.details.fields.current_password, 'كلمة المرور الحالية غير صحيحة');
    ok(await c.patch('/api/account', { phone: '01001239999', current_password: 'Lawyer@2026' }));
    assert.equal(t.app.db.value('SELECT phone FROM users WHERE id = ?', lw.id), '+201001239999');
    // نفس الرقم (حفظ بطاقة البيانات دون تغييره) وإيقاف التنبيهات: بلا كلمة مرور
    ok(await c.patch('/api/account', { phone: '01001239999', email: null }));
    ok(await c.patch('/api/account', { alert_whatsapp: false }));
    // الإدارة لا تتأثر
    const m = await t.login('manager');
    freezeClock(new Date(Date.parse(t0) + 30 * 60000).toISOString());
    ok(await m.patch('/api/account', { phone: '01001238888' }));
    resetClock();
  });

  test('an extension refused (info_request.rejected) is «وصلك رد من الإدارة»', async () => {
    freezeClock(cairoLocalToIso(2026, 10, 7, 12, 0));
    const lw = await createLawyer(admin, { name: 'محامي المهلة' });
    const c = await t.login(lw.username);
    ok(await c.patch('/api/account', { phone: '01001230002', alert_whatsapp: true }));
    const kase = await newCase(admin, { title: 'ملف المهلة' });
    const a = await assign(admin, kase.id, { lawyer_id: lw.id, role: 'lead', due_at: cairoLocalToIso(2026, 10, 12, 18, 0) });
    t.app.lawyerAlerts.onNotify([lw.id], { type: 'info_request.rejected', title: 'لم توافق الإدارة على طلبك', link: `#/my/assignments/${a.id}` });
    const row = t.app.db.get("SELECT * FROM lawyer_alerts WHERE user_id = ? AND type = 'admin_reply'", lw.id);
    assert.ok(row, 'admin reply alert recorded');
    assert.equal(row.body, `وصلك رد من الإدارة في ${kase.code}.`);
    resetClock();
  });

  test('outcome-missing text says «اليوم» only on the hearing day; a night alert queued to 08:00 names the date', async () => {
    const at = cairoLocalToIso(2026, 10, 6, 9, 30);
    assert.equal(ALERT_TEXT['hearing.outcome_missing']({ code: 'MTR-2026-00002', at, sendAt: cairoLocalToIso(2026, 10, 6, 15, 0) }), 'لم تُسجَّل نتيجة جلسة اليوم في MTR-2026-00002.');
    assert.equal(ALERT_TEXT['hearing.outcome_missing']({ code: 'MTR-2026-00002', at, sendAt: cairoLocalToIso(2026, 10, 7, 8, 0) }), 'لم تُسجَّل نتيجة جلسة الثلاثاء 6 أكتوبر في MTR-2026-00002.');
    const hany = t.app.db.get("SELECT id FROM users WHERE username = 'hany'");
    const m = t.app.db.get("SELECT id, code FROM matters WHERE responsible_lawyer_id = ? AND status != 'closed' LIMIT 1", hany.id);
    const ev = t.app.matters.addEvent(m.id, { kind: 'hearing', title: 'جلسة مسائية', starts_at: cairoLocalToIso(2026, 10, 20, 19, 0) }, { id: 1, role: 'admin' });
    freezeClock(cairoLocalToIso(2026, 10, 20, 22, 30));
    t.app.lawyerAlerts.onNotify([hany.id], { type: 'hearing.outcome_missing', title: 'x', link: `#/my/matters/${m.id}?outcome=${ev.id}` });
    const row = t.app.db.get("SELECT * FROM lawyer_alerts WHERE user_id = ? AND entity = ?", hany.id, `event:${ev.id}`);
    assert.equal(row.status, 'queued');
    assert.equal(row.body, `لم تُسجَّل نتيجة جلسة الثلاثاء 20 أكتوبر في ${m.code}.`);
    // سُجّلت النتيجة ليلًا ← لا يُرسل التنبيه في الثامنة
    t.app.db.run("UPDATE matter_events SET status = 'held' WHERE id = ?", ev.id);
    freezeClock(cairoLocalToIso(2026, 10, 21, 8, 5));
    t.app.lawyerAlerts.flush();
    const after = t.app.db.get('SELECT status, error, message_id FROM lawyer_alerts WHERE id = ?', row.id);
    assert.deepEqual({ status: after.status, error: after.error, message_id: after.message_id }, { status: 'skipped', error: 'resolved', message_id: null });
    t.app.db.run('DELETE FROM matter_events WHERE id = ?', ev.id);
    resetClock();
  });

  test('a queued new-assignment alert is dropped if the assignment was withdrawn overnight', async () => {
    freezeClock(cairoLocalToIso(2026, 10, 22, 23, 0));
    admin = await t.login('admin'); // الجلسة السابقة انتهت بتحريك الساعة
    const lw = await createLawyer(admin, { name: 'محامي السحب' });
    const c = await t.login(lw.username);
    ok(await c.patch('/api/account', { phone: '01001230003', alert_whatsapp: true }));
    const kase = await newCase(admin, { title: 'ملف يُسحب' });
    const a = await assign(admin, kase.id, { lawyer_id: lw.id, role: 'lead', due_at: cairoLocalToIso(2026, 10, 26, 18, 0) });
    const row = t.app.db.get('SELECT * FROM lawyer_alerts WHERE user_id = ? AND entity = ?', lw.id, `assignment:${a.id}`);
    assert.equal(row.status, 'queued');
    t.app.db.run("UPDATE assignments SET status = 'withdrawn' WHERE id = ?", a.id);
    freezeClock(cairoLocalToIso(2026, 10, 23, 8, 5));
    t.app.lawyerAlerts.flush();
    assert.equal(t.app.db.get('SELECT error FROM lawyer_alerts WHERE id = ?', row.id).error, 'resolved');
    resetClock();
  });

  test('«قادم» shows the next hearing of each matter even beyond 14 days (adjourned to three weeks later)', async () => {
    const hany = await t.login('hany');
    const m = t.app.db.get("SELECT id FROM matters WHERE responsible_lawyer_id = ? AND status != 'closed' ORDER BY id LIMIT 1", hany.user.id);
    const ev = t.app.matters.addEvent(m.id, { kind: 'hearing', title: 'جلسة بعد التأجيل', starts_at: new Date(Date.now() + 21 * 86400000).toISOString() }, { id: 1, role: 'admin' });
    const nearer = t.app.db.value("SELECT COUNT(*) FROM matter_events WHERE matter_id = ? AND status = 'scheduled' AND starts_at >= ? AND starts_at < ?", m.id, new Date().toISOString(), ev.starts_at);
    const d = ok(await hany.get('/api/lawyer/today'));
    assert.equal(Number(nearer), 0, 'demo matter: no other hearing before the new one');
    assert.ok(d.upcoming.some((u) => u.kind === 'hearing' && u.event_id === ev.id), JSON.stringify(d.upcoming));
    assert.ok(d.upcoming.length <= 3);
    // محامٍ آخر لا يراها
    const ahmed = await t.login('ahmed');
    assert.equal(ok(await ahmed.get('/api/lawyer/today')).upcoming.some((u) => u.event_id === ev.id), false);
    t.app.db.run('DELETE FROM matter_events WHERE id = ?', ev.id);
  });

  test('push subscriptions of sessions that ended without logout are pruned and never notified', async () => {
    resetClock();
    admin = await t.login('admin');
    const lw = await createLawyer(admin, { name: 'محامي الجهاز' });
    const c = await t.login(lw.username);
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    t.app.webPush.allowHostForTests('127.0.0.1:9');
    ok(await c.post('/api/account/push-subscription', { subscription: { endpoint: 'http://127.0.0.1:9/push/orphan', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } } }));
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', lw.id)), 1);
    // الجلسة انتهت (خمول) دون تسجيل خروج
    t.app.db.run('DELETE FROM sessions WHERE user_id = ?', lw.id);
    t.app.engine.dryRun = false;
    assert.equal(t.app.webPush.onNotify(lw.id, { type: 'assignment.new', link: '#/my' }), 0, 'no push to a device whose session ended');
    assert.equal(t.app.webPush.pruneOrphans() >= 1, true);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', lw.id)), 0);
  });

  test('UI wiring: phone re-auth sheet, test alert after enabling in the checklist, spec order on phones, panel above the bottom nav', () => {
    const home = read('public/assets/js/app/pages/lawyer/home.js');
    const acc = read('public/assets/js/app/pages/account.js');
    const reauth = read('public/assets/js/app/lh-reauth.js');
    const css = read('public/assets/css/v91-l-home.css');
    const main = read('public/assets/js/app/main.js');
    assert.match(reauth, /current_password/);
    assert.match(home, /withPasswordConfirm\(/);
    assert.ok((acc.match(/withPasswordConfirm\(/g) || []).length >= 3, 'profile card, alerts switch and alerts phone field');
    assert.match(home, /'جرّب التنبيه'/);
    assert.match(home, /section\.lh-section\.lh-upcoming/);
    assert.match(home, /section\.lh-section\.lh-work/);
    assert.match(css, /\.lh-cols \.lh-upcoming \{\s*order: 2;/);
    assert.match(css, /\.lh-cols \.lh-work \{\s*order: 3;/);
    assert.match(css, /\.is-lawyer:not\(\.lh-detail\) \.dropdown\.lh-notif-panel \{\s*max-height: calc\(100dvh - 64px - 56px/);
    // تسجيل خروج بلا شبكة يُكمل على الخادم عند أول اتصال
    assert.match(main, /LOGOUT_PENDING_KEY = 'bm-logout-pending'/);
    assert.match(main, /store\.set\(LOGOUT_PENDING_KEY, '1'\)/);
    assert.match(read('public/assets/js/app/boot-early.js'), /read\('bm-logout-pending'\)/);
  });
});

// ───────────────────────── الواجهة: الكلمات والصفحات (فحص ثابت) ─────────────────────────
describe('l-home: lawyer UI (static)', () => {
  test('words.js: count forms, status words and today copy', async () => {
    const w = await import('../public/assets/js/app/words.js').catch(() => null);
    if (!w) return; // يحتاج fmt.js (Intl) — متاح في Node
    assert.equal(w.todayHeading(0), 'لا شيء مطلوب منك الآن');
    assert.equal(w.todayHeading(1), 'مطلوب منك أمر واحد');
    assert.equal(w.todayHeading(2), 'مطلوب منك أمران');
    assert.equal(w.todayHeading(4), 'مطلوب منك 4 أمور');
    assert.equal(w.todayHeading(11), 'مطلوب منك 11 أمرًا');
    assert.equal(w.assignmentStatus('assigned'), 'جديد');
    assert.equal(w.assignmentStatus('submitted'), 'عند الإدارة للمراجعة');
    assert.equal(w.assignmentStatus('returned'), 'مطلوب تعديله');
    assert.equal(w.requestStatus('rejected', 'مكرر'), 'لم توافق الإدارة: مكرر');
    assert.equal(w.count(3, 'note'), '3 ملاحظات');
    const now = Date.parse(cairoLocalToIso(2026, 10, 7, 12, 0));
    const hearing = w.actionCopy({ kind: 'hearing_outcome', at: cairoLocalToIso(2026, 10, 7, 9, 30), title: 'جلسة', matter_code: 'MTR-2026-00002' }, now);
    assert.equal(hearing.title, 'سجّل نتيجة جلسة اليوم');
    assert.deepEqual(hearing.button, { label: 'سجّل', kind: 'primary' });
    const older = w.actionCopy({ kind: 'hearing_outcome', at: cairoLocalToIso(2026, 10, 6, 9, 30), matter_code: 'MTR-2026-00002' }, now);
    assert.equal(older.title, 'سجّل نتيجة جلسة الثلاثاء 6 أكتوبر');
    assert.equal(w.actionCopy({ kind: 'assignment_returned', case_code: 'X', notes_count: 3 }, now).button.label, 'عدّل');
    assert.equal(w.actionCopy({ kind: 'task_due', title: 'حافظة', at: cairoLocalToIso(2026, 10, 9, 9, 0), matter_code: 'M' }, now).button.label, 'تمّت');
  });

  test('home: no stat cards, breadcrumb or privacy boilerplate; uses /api/lawyer/today; never says «العميل»', () => {
    const home = read('public/assets/js/app/pages/lawyer/home.js');
    for (const gone of ['statCard', 'breadcrumbs', 'هذه مساحة عملك', 'افتحها ليبدأ احتساب العمل', 'مؤشرات أدائي', 'لا تتواصل مع المستفيد']) assert.equal(home.includes(gone), false, gone);
    assert.match(home, /\/lawyer\/today/);
    for (const f of ['home.js', 'assignments.js']) assert.equal(read(`public/assets/js/app/pages/lawyer/${f}`).includes('العميل'), false, f);
    assert.equal(read('public/assets/js/app/words.js').includes('العميل'), false);
    assert.match(home, /لا يوجد اتصال — آخر تحديث/);
    assert.match(home, /تعذر تحميل مهامك\. تحقق من الاتصال ثم أعد المحاولة\./);
    assert.match(home, /سنرسل لك تنبيهًا على واتساب عند وصول إسناد جديد\./);
    assert.match(home, /فعّل تنبيهات واتساب لتعرف بالإسناد الجديد فور وصوله\./);
  });

  test('shell: lawyer nav labels, back button on detail routes, bottom nav, logout confirm, brand line', () => {
    const shell = read('public/assets/js/app/lawyer-shell.js');
    assert.match(shell, /تسجيل الخروج من هذا الجهاز؟/);
    assert.match(shell, /'سجّل الخروج'/);
    const words = read('public/assets/js/app/words.js');
    for (const l of ['اليوم', 'إسناداتي', 'الملفات المستمرة', 'تقويمي', 'مستحقاتي', 'الإشعارات', 'حسابي', 'المزيد']) assert.ok(words.includes(`'${l}'`), l);
    const routes = read('public/assets/js/app/routes.js');
    assert.match(routes, /path: '\/my\/assignments', load/);
    assert.match(routes, /title: 'اليوم'/);
    assert.equal(read('public/assets/js/app/shell.js').includes('منصة التشغيل القانوني'), false);
    assert.equal(read('public/assets/js/app/pages/login.js').includes('منصة التشغيل القانوني'), false);
  });

  test('invite pledge message, remember checkbox, phone 2FA', () => {
    const flows = read('public/assets/js/app/pages/auth-flows.js');
    assert.match(flows, /يلزم الإقرار بسرية بيانات المستفيدين لتفعيل الحساب\./);
    assert.match(flows, /'تفعيل والدخول'/);
    assert.equal(/toast\('فُعّل حسابك/.test(flows), false, 'no toast after activation');
    assert.match(read('public/assets/js/app/pages/login.js'), /تذكّرني على هذا الجهاز/);
    const tfa = read('public/assets/js/app/components/two-factor.js');
    assert.match(tfa, /افتح تطبيق المصادقة/);
    assert.match(tfa, /انسخ المفتاح/);
    assert.match(tfa, /لديك جهاز آخر؟ امسح الرمز/);
  });
});
