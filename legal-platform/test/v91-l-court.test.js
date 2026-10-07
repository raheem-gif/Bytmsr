// اختبارات الإصدار 9.1 — مسار l-court: نتيجة الجلسة من ممر المحكمة (L-02)، ميعاد الطعن (L-22)، تقويم المحامي (L-15)،
// صندوق الصادر دون اتصال (L-18: الأمان عند التكرار بـ client_ref) و«مستحقاتي» (L-09)، والصلاحيات والخصوصية ونصوص الواجهة.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, assertNoLeak, LAWYER_FORBIDDEN_KEYS } from './lane-b-kit.test.js';
import { cairoDayKey, cairoParts, cairoLocalToIso, nowIso } from '../src/util.js';
import { outcomeText } from '../src/services/matters-court.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const addDaysKey = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
let refN = 0;
const ref = () => `test-ref-${Date.now().toString(36)}-${++refN}`;

describe('v9.1 l-court — outcome text (pure)', () => {
  test('composes the Arabic outcome lines server-side', () => {
    const iso = cairoLocalToIso(2026, 10, 28, 9, 30);
    assert.equal(outcomeText({ result: 'adjourned', reason: 'review', nextIso: iso }), 'تأجّلت لجلسة الأربعاء 28 أكتوبر 2026 — للاطلاع.');
    assert.equal(outcomeText({ result: 'adjourned', nextIso: iso, decision: 'قدّمنا حافظة.' }), 'تأجّلت لجلسة الأربعاء 28 أكتوبر 2026. قدّمنا حافظة.');
    assert.equal(outcomeText({ result: 'reserved', nextIso: iso }), 'حُجزت للحكم لجلسة الأربعاء 28 أكتوبر 2026.');
    assert.equal(outcomeText({ result: 'judgment', decision: 'حكمت المحكمة بالبراءة.' }), 'صدر الحكم: حكمت المحكمة بالبراءة.');
    assert.equal(outcomeText({ result: 'not_held', reason: 'struck' }), 'لم تُنظر — شُطبت.');
  });
});

describe('v9.1 l-court — hearing outcome, calendar, outbox idempotency, statement', () => {
  let t;
  let admin;
  let manager;
  let hany;
  let ahmed;
  let salwa;
  let matterId;
  let pendingId;

  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    manager = await t.login('manager');
    hany = await t.login('hany');
    ahmed = await t.login('ahmed');
    salwa = await t.login('salwa');
    const list = ok(await hany.get('/api/lawyer/matters'), 200, 'matters');
    matterId = list.find((m) => m.code.endsWith('00002')).id;
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  test('demo seed: a held hearing waits for its outcome, after an earlier adjourned one (chain)', async () => {
    const v = ok(await hany.get(`/api/lawyer/matters/${matterId}`));
    const pending = v.events.filter((e) => e.needs_outcome);
    assert.equal(pending.length, 1, 'exactly one pending hearing in the demo');
    pendingId = pending[0].id;
    const prev = v.events.find((e) => e.outcome_kind === 'adjourned');
    assert.ok(prev, 'earlier hearing recorded as adjourned');
    assert.equal(prev.next_event_id, pendingId);
    assert.match(prev.outcome, /^تأجّلت لجلسة .+ — للاطلاع\./);
    assert.equal(cairoParts(pending[0].starts_at).hour, 9);
    assert.equal(cairoParts(pending[0].starts_at).minute, 30);
    const list = ok(await hany.get('/api/lawyer/matters'));
    assert.equal(Number(list.find((m) => m.id === matterId).pending_outcomes), 1, 'list shows «جلسة بلا نتيجة»');
    // لا «العميل» في أي نص يراه المحامي (اسم المستفيد/ة الافتراضي، ملاحظات العرض)
    assert.ok(!JSON.stringify(v).includes('العميل'), 'lawyerView contains no «العميل»');
  });

  test('lawyer view hides approval flags and beneficiary contact data', async () => {
    const v = ok(await hany.get(`/api/lawyer/matters/${matterId}`));
    assertNoLeak(v, { keys: [...LAWYER_FORBIDDEN_KEYS, 'client_text_approved', 'client_response', 'client_ref', 'outcome_by'] }, 'lawyer matter view');
    const pend = ok(await hany.get('/api/lawyer/pending-outcomes'));
    assert.deepEqual(pend.map((e) => e.id), [pendingId]);
    assertNoLeak(pend, { keys: [...LAWYER_FORBIDDEN_KEYS, 'client_text_approved'] }, 'pending outcomes');
  });

  test('hearing_outcome_missing: 15:00 on the day, once more 10:00 next day, one notification each', async () => {
    const ev = t.app.db.get('SELECT * FROM matter_events WHERE id = ?', pendingId);
    const day = cairoDayKey(ev.starts_at);
    const [y, m, d] = day.split('-').map(Number);
    const hanyId = hany.user.id;
    const count = () => Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'hearing.outcome_missing'", hanyId));
    const before0 = count();
    try {
      freezeClock(cairoLocalToIso(y, m, d, 14, 0));
      t.app.automations.runAll();
      assert.equal(count(), before0, 'nothing before 15:00');
      freezeClock(cairoLocalToIso(y, m, d, 15, 30));
      t.app.automations.runAll();
      t.app.automations.runAll();
      assert.equal(count(), before0 + 1, 'one alert on the hearing day');
      const n = t.app.db.get("SELECT * FROM notifications WHERE user_id = ? AND type = 'hearing.outcome_missing' ORDER BY id DESC LIMIT 1", hanyId);
      assert.match(n.title, /^لم تُسجَّل نتيجة جلسة اليوم في الملف MTR-/);
      assert.equal(n.body, 'سجّلها الآن حتى تُضاف الجلسة القادمة لتقويمك.');
      assert.equal(n.link, `#/my/matters/${matterId}?outcome=${pendingId}`);
      const next = addDaysKey(day, 1).split('-').map(Number);
      freezeClock(cairoLocalToIso(next[0], next[1], next[2], 10, 5));
      t.app.automations.runAll();
      t.app.automations.runAll();
      assert.equal(count(), before0 + 2, 'one more alert at 10:00 the next day');
      const staffAlerts = Number(t.app.db.value("SELECT COUNT(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.type = 'hearing.outcome_missing' AND u.role != 'lawyer'"));
      assert.equal(staffAlerts, 0, 'lawyer-only alert');
    } finally {
      resetClock();
    }
  });

  test('validation: next date required, after the hearing, judgment text ≥ 5 chars; future hearing refused', async () => {
    const url = `/api/lawyer/matter-events/${pendingId}/outcome`;
    let r = await hany.post(url, { result: 'adjourned', client_ref: ref() });
    assert.equal(r.status, 400);
    assert.equal(r.body.details.fields.next_date, 'حدد تاريخ الجلسة القادمة');
    r = await hany.post(url, { result: 'reserved', client_ref: ref() });
    assert.equal(r.status, 400);
    assert.equal(r.body.details.fields.next_date, 'حدد تاريخ الجلسة القادمة');
    const ev = t.app.db.get('SELECT starts_at FROM matter_events WHERE id = ?', pendingId);
    r = await hany.post(url, { result: 'adjourned', next_date: cairoDayKey(ev.starts_at), client_ref: ref() });
    assert.equal(r.status, 400);
    assert.equal(r.body.details.fields.next_date, 'تاريخ الجلسة القادمة يجب أن يكون بعد هذه الجلسة');
    r = await hany.post(url, { result: 'judgment', decision: 'لا', client_ref: ref() });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.fields.decision);
    r = await hany.post(url, { result: 'maybe', client_ref: ref() });
    assert.equal(r.status, 400);
    r = await hany.post(url, { result: 'adjourned', next_date: '2026-02-30', client_ref: ref() });
    assert.equal(r.status, 400, 'impossible date');
    // جلسة لم يحن موعدها بعد (15 من الشهر القادم في البيانات التجريبية)
    const future = t.app.db.get("SELECT id FROM matter_events WHERE matter_id = ? AND status = 'scheduled' AND starts_at > ? ORDER BY starts_at LIMIT 1", matterId, nowIso());
    r = await hany.post(`/api/lawyer/matter-events/${future.id}/outcome`, { result: 'judgment', decision: 'حكمت المحكمة بالبراءة.', client_ref: ref() });
    assert.equal(r.status, 400, 'cannot record the outcome of a future hearing');
    // لم يتغير شيء
    assert.equal(t.app.db.get('SELECT status FROM matter_events WHERE id = ?', pendingId).status, 'scheduled');
  });

  test('permissions: other lawyers get 404, staff cannot use the lawyer endpoint, client_ref cannot be borrowed', async () => {
    const url = `/api/lawyer/matter-events/${pendingId}/outcome`;
    const body = { result: 'adjourned', next_date: addDaysKey(cairoDayKey(nowIso()), 21), client_ref: ref() };
    let r = await ahmed.post(url, body);
    assert.equal(r.status, 404, 'not the responsible lawyer');
    r = await manager.post(url, body);
    assert.equal(r.status, 403, 'staff use their own pages');
    r = await t.client().post(url, body);
    assert.equal(r.status, 401);
    r = await hany.get('/api/lawyer/pending-outcomes');
    assert.equal(r.status, 200);
    r = await ahmed.get('/api/lawyer/pending-outcomes');
    assert.deepEqual(r.body, [], 'another lawyer sees none of hany’s hearings');
  });

  test('«تأجّلت» to 28 days later: one request creates exactly one next hearing at the same time, held for admin approval, one staff notification', async () => {
    const nextKey = addDaysKey(cairoDayKey(nowIso()), 21);
    const before = Number(t.app.db.value('SELECT COUNT(*) FROM matter_events WHERE matter_id = ?', matterId));
    const staffBefore = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'event.outcome'"));
    const clientRef = ref();
    const r = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'adjourned', reason: 'review', next_date: nextKey, client_ref: clientRef }));
    assert.equal(r.event.status, 'postponed');
    assert.equal(r.event.outcome_kind, 'adjourned');
    assert.match(r.event.outcome, new RegExp(`^تأجّلت لجلسة .+ ${nextKey.slice(0, 4)} — للاطلاع\\.$`));
    assert.ok(r.next_event);
    assert.equal(cairoDayKey(r.next_event.starts_at), nextKey);
    assert.equal(cairoParts(r.next_event.starts_at).hour, 9, 'same time of day as this hearing');
    assert.equal(cairoParts(r.next_event.starts_at).minute, 30);
    assert.equal(r.next_event.parent_event_id, pendingId);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM matter_events WHERE matter_id = ?', matterId)), before + 1);
    const row = t.app.db.get('SELECT * FROM matter_events WHERE id = ?', r.next_event.id);
    assert.equal(row.client_text_approved, 0, 'lawyer-created hearing waits for admin approval');
    assert.equal(row.created_by, hany.user.id);
    const staffNotes = t.app.db.all("SELECT * FROM notifications WHERE type = 'event.outcome' ORDER BY id DESC");
    const staffUsers = Number(t.app.db.value("SELECT COUNT(*) FROM users WHERE role IN ('admin','case_manager') AND active = 1"));
    assert.equal(staffNotes.length - staffBefore, staffUsers, 'one notification per staff member (a single notifyStaff)');
    assert.match(staffNotes[0].title, /^سجّل المحامي نتيجة جلسة في الملف MTR-/);
    assert.equal(staffNotes[0].body, 'يحتاج تذكير المستفيد/ة بالجلسة القادمة إلى اعتماد.');

    // replay with the same client_ref (outbox after reconnect): same answer, no duplicate
    for (let i = 0; i < 3; i++) {
      const again = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'adjourned', reason: 'review', next_date: nextKey, client_ref: clientRef }));
      assert.equal(again.next_event.id, r.next_event.id);
    }
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM matter_events WHERE matter_id = ?', matterId)), before + 1, 'no duplicate hearing after replays');
    // another lawyer replaying the ref, or the same ref on another event, is refused
    const other = t.app.db.get("SELECT id FROM matter_events WHERE matter_id = ? AND id != ? AND outcome_kind IS NOT NULL LIMIT 1", matterId, pendingId);
    const borrowed = await hany.post(`/api/lawyer/matter-events/${other.id}/outcome`, { result: 'adjourned', next_date: nextKey, client_ref: clientRef });
    assert.equal(borrowed.status, 409);

    // calendar + ICS show the new hearing
    const from = cairoLocalToIso(...nextKey.split('-').map(Number), 0, 0);
    const cal = ok(await hany.get(`/api/lawyer/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date(Date.parse(from) + 86400000).toISOString())}`));
    assert.ok(cal.items.some((it) => it.type === 'event' && it.event_id === r.next_event.id));
    const feed = ok(await hany.post('/api/calendar/feed'));
    const ics = await fetch(t.base + new URL(feed.url).pathname).then((x) => x.text());
    assert.ok(ics.includes(`event-${r.next_event.id}@beyoot-legal`), 'ICS feed includes the next hearing');

    // no reminder reaches the beneficiary until staff approve the lawyer's text
    const ev = t.app.db.get('SELECT * FROM matter_events WHERE id = ?', r.next_event.id);
    const sent = () => Number(t.app.db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key = 'hearing_reminder' AND entity_id = ?", ev.id));
    try {
      freezeClock(new Date(Date.parse(ev.starts_at) - 2 * 86400000).toISOString());
      t.app.automations.runAll();
      assert.equal(sent(), 0, 'reminder held before approval');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key = 'hearing_reminder_held' AND entity_id = ?", ev.id)), 1);
    } finally {
      resetClock();
    }
  });

  test('editing the outcome moves the generated hearing instead of duplicating it; judgment cancels it', async () => {
    const v1 = ok(await hany.get(`/api/lawyer/matters/${matterId}`));
    const rec = v1.events.find((e) => e.id === pendingId);
    const childId = rec.next_event_id;
    const newKey = addDaysKey(cairoDayKey(nowIso()), 30);
    const r = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'adjourned', reason: 'documents', next_date: newKey, next_time: '11:00', client_ref: ref() }));
    assert.equal(r.next_event.id, childId, 'same generated hearing, moved');
    assert.equal(cairoDayKey(r.next_event.starts_at), newKey);
    assert.equal(cairoParts(r.next_event.starts_at).hour, 11);
    assert.match(r.event.outcome, /— لتقديم مستندات\.$/);
    // صدر الحكم مع ميعاد الطعن (L-22)
    const appealKey = addDaysKey(cairoDayKey(nowIso()), 2);
    const tasksBefore = Number(t.app.db.value('SELECT COUNT(*) FROM matter_tasks WHERE matter_id = ?', matterId));
    const j = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'judgment', decision: 'حكمت المحكمة بالبراءة.', appeal_due_date: appealKey, client_ref: ref() }));
    assert.equal(j.event.status, 'done');
    assert.equal(j.event.outcome, 'صدر الحكم: حكمت المحكمة بالبراءة.');
    assert.equal(j.next_event, null);
    assert.equal(t.app.db.get('SELECT status FROM matter_events WHERE id = ?', childId).status, 'cancelled', 'the generated hearing no longer applies');
    // (مراجعة) الرد يحمل الجلسة الملغاة حتى تختفي من «القادمة» في الصفحة دون إعادة تحميل
    assert.equal(j.cancelled_event?.id, childId);
    assert.equal(j.cancelled_event.status, 'cancelled');
    assertNoLeak(j, { keys: [...LAWYER_FORBIDDEN_KEYS, 'client_text_approved', 'client_response', 'client_note'] }, 'outcome response');
    assert.ok(j.task);
    assert.equal(j.task.title, 'ميعاد الطعن على الحكم');
    assert.equal(j.task.procedural, 1);
    assert.equal(j.task.status, 'open');
    assert.equal(cairoDayKey(j.task.due_at), appealKey);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM matter_tasks WHERE matter_id = ?', matterId)), tasksBefore + 1, 'exactly one task');
    // يظهر في «اليوم» لأنه خلال 72 ساعة (إن كانت صفحة «اليوم» موجودة — مسار l-home)
    const today = await hany.get('/api/lawyer/today');
    if (today.status === 200) {
      const s = JSON.stringify(today.body);
      assert.ok(s.includes(`"task_id":${j.task.id}`), 'appeal task appears on home within 72 h');
    }
    // التعديل بنفس التاريخ لا يكرر المهمة، وحذف التاريخ يلغيها
    const j2 = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'judgment', decision: 'حكمت المحكمة بالبراءة.', appeal_due_date: appealKey, client_ref: ref() }));
    assert.equal(j2.task.id, j.task.id);
    // (مراجعة) ورقة «تعديل النتيجة» تعرض ميعاد الطعن المسجل: يصل في عرض المحامي للجلسة حتى لا يُلغى بالخطأ عند التعديل
    assert.equal(cairoDayKey(j2.event.appeal_due_at), appealKey, 'outcome response carries the appeal date');
    const vj = ok(await hany.get(`/api/lawyer/matters/${matterId}`));
    assert.equal(cairoDayKey(vj.events.find((e) => e.id === pendingId).appeal_due_at), appealKey, 'lawyer view carries the appeal date for the edit sheet');
    const sheet = read('public/assets/js/app/components/outcome-sheet.js');
    assert.ok(sheet.includes('event.appeal_due_at'), 'the edit sheet pre-fills the recorded appeal date');
    const j3 = ok(await hany.post(`/api/lawyer/matter-events/${pendingId}/outcome`, { result: 'judgment', decision: 'حكمت المحكمة بالبراءة.', client_ref: ref() }));
    assert.equal(t.app.db.get('SELECT status FROM matter_tasks WHERE id = ?', j.task.id).status, 'cancelled');
    assert.equal(j3.cancelled_task?.id, j.task.id, 'the cancelled appeal task comes back for the page to update');
    assert.equal(j3.event.appeal_due_at, null);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM matter_tasks WHERE matter_id = ? AND source_event_id = ? AND status = 'open'", matterId, pendingId)), 0, 'without the date, no open appeal task');
  });

  test('«لم تُنظر» with an optional next date; closed matter refuses outcomes', async () => {
    // جلسة جديدة اليوم في الماضي (أضافها المحامي بعد انعقادها)
    const now = cairoParts(nowIso());
    const startIso = cairoLocalToIso(now.year, now.month, now.day, 0, 5);
    const ev = ok(await hany.post(`/api/lawyer/matters/${matterId}/events`, { kind: 'hearing', starts_at: startIso, title: 'جلسة إضافية' }));
    const r1 = ok(await hany.post(`/api/lawyer/matter-events/${ev.id}/outcome`, { result: 'not_held', reason: 'no_session', client_ref: ref() }));
    assert.equal(r1.event.status, 'cancelled');
    assert.equal(r1.event.outcome, 'لم تُنظر — لم تنعقد.');
    assert.equal(r1.next_event, null);
    const nk = addDaysKey(cairoDayKey(nowIso()), 14);
    const r2 = ok(await hany.post(`/api/lawyer/matter-events/${ev.id}/outcome`, { result: 'not_held', reason: 'struck', next_date: nk, next_attendance_required: true, client_ref: ref() }));
    assert.ok(r2.next_event);
    assert.equal(r2.next_event.client_attendance_required, 1);
    assert.match(r2.event.outcome, /^لم تُنظر — شُطبت\. الجلسة القادمة /);
    // ملف مغلق
    ok(await admin.patch(`/api/admin/matters/${matterId}`, { status: 'closed' }));
    const closed = await hany.post(`/api/lawyer/matter-events/${ev.id}/outcome`, { result: 'not_held', client_ref: ref() });
    assert.equal(closed.status, 409);
    ok(await admin.patch(`/api/admin/matters/${matterId}`, { status: 'open' }));
  });

  test('(review) lawyer add/edit event endpoints answer with the lawyer view only — no approval flag, beneficiary reply or note', async () => {
    const startsAt = new Date(Date.now() + 20 * 86400000).toISOString();
    const forbidden = [...LAWYER_FORBIDDEN_KEYS, 'client_text_approved', 'client_response', 'client_response_at', 'client_note', 'client_ref', 'outcome_by', 'created_by'];
    const ev = ok(await hany.post(`/api/lawyer/matters/${matterId}/events`, { kind: 'hearing', starts_at: startsAt, title: 'جلسة اختبار الرد', client_attendance_required: true, client_note: 'بطاقة الرقم القومي' }));
    assertNoLeak(ev, { keys: forbidden }, 'POST lawyer event');
    assert.equal(ev.client_attendance_required, 1);
    assert.equal(ev.status, 'scheduled');
    // ردّ المستفيد/ة على الموعد (وحدة b-portal) لا يصل للمحامي
    t.app.db.run("UPDATE matter_events SET client_response = 'no', client_response_at = ? WHERE id = ?", nowIso(), ev.id);
    const up = ok(await hany.patch(`/api/lawyer/matter-events/${ev.id}`, { location: 'محكمة جنح مدينة نصر — قاعة 3' }));
    assertNoLeak(up, { keys: forbidden }, 'PATCH lawyer event');
    assert.equal(up.location, 'محكمة جنح مدينة نصر — قاعة 3');
    const cancelled = ok(await hany.patch(`/api/lawyer/matter-events/${ev.id}`, { status: 'cancelled' }));
    assert.equal(cancelled.status, 'cancelled');
    assertNoLeak(cancelled, { keys: forbidden }, 'PATCH lawyer event (cancel)');
  });

  test('(review) hearing_outcome_missing waits 2 hours after an afternoon hearing before the same-day alert', async () => {
    const day = addDaysKey(cairoDayKey(nowIso()), 3);
    const [y, m, d] = day.split('-').map(Number);
    const ev = ok(await hany.post(`/api/lawyer/matters/${matterId}/events`, { kind: 'hearing', starts_at: cairoLocalToIso(y, m, d, 16, 0), title: 'جلسة مسائية' }));
    const alerts = () => Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'hearing.outcome_missing' AND link = ?", `#/my/matters/${matterId}?outcome=${ev.id}`));
    try {
      freezeClock(cairoLocalToIso(y, m, d, 16, 30));
      t.app.automations.runAll();
      assert.equal(alerts(), 0, 'no alert while the afternoon hearing may still be in session');
      freezeClock(cairoLocalToIso(y, m, d, 18, 5));
      t.app.automations.runAll();
      t.app.automations.runAll();
      assert.equal(alerts(), 1, 'one alert two hours after it started');
      const next = addDaysKey(day, 1).split('-').map(Number);
      freezeClock(cairoLocalToIso(next[0], next[1], next[2], 10, 5));
      t.app.automations.runAll();
      assert.equal(alerts(), 2, 'and the last one at 10:00 the next day');
    } finally {
      resetClock();
    }
    ok(await hany.patch(`/api/lawyer/matter-events/${ev.id}`, { status: 'cancelled' }));
  });

  test('lawyer calendar: past unrecorded hearings within 30 days are flagged needs_outcome', async () => {
    const now = cairoParts(nowIso());
    const startIso = cairoLocalToIso(now.year, now.month, now.day, 0, 10);
    const ev = ok(await hany.post(`/api/lawyer/matters/${matterId}/events`, { kind: 'hearing', starts_at: startIso, title: 'جلسة اختبار التقويم' }));
    const old = ok(await hany.post(`/api/lawyer/matters/${matterId}/events`, { kind: 'hearing', starts_at: new Date(Date.now() - 40 * 86400000).toISOString(), title: 'جلسة قديمة' }));
    const cal = ok(await hany.get('/api/lawyer/calendar'));
    const ids = cal.pending_outcomes.map((x) => x.event_id);
    assert.ok(ids.includes(ev.id), 'held today, no outcome');
    assert.ok(!ids.includes(old.id), 'older than 30 days are not listed');
    assert.ok(cal.pending_outcomes.every((x) => x.needs_outcome && x.link.includes('?outcome=')));
    const item = cal.items.find((x) => x.event_id === ev.id);
    if (item) assert.equal(item.needs_outcome, true);
    const other = ok(await ahmed.get('/api/lawyer/calendar'));
    assert.deepEqual(other.pending_outcomes, [], 'only the responsible lawyer sees them');
    assertNoLeak(cal.pending_outcomes, { keys: LAWYER_FORBIDDEN_KEYS }, 'calendar pending');
  });

  test('«مستحقاتي»: hany (monthly) sees 8,000 expected this month and the unpaid previous month; payout note setting', async () => {
    let s = ok(await hany.get('/api/lawyer/statement'));
    const period = cairoDayKey(nowIso()).slice(0, 7);
    assert.equal(s.this_month.period, period);
    assert.equal(s.this_month.expected_total, 8000);
    const monthly = s.this_month.lines.find((l) => l.key === 'monthly');
    assert.equal(monthly.state, 'expected');
    assert.equal(monthly.note, 'يُسجَّل عند إقفال الشهر');
    assert.ok(s.this_month.lines.some((l) => l.key === 'extra' && l.label === 'أتعاب إضافية مسجلة'));
    const prev = s.months.find((m) => m.period < period);
    assert.ok(prev, 'previous month row');
    assert.equal(prev.total, 10500);
    assert.equal(prev.status, 'unpaid');
    assert.deepEqual(prev.lines.map((l) => [l.label, l.amount]).sort(), [['أتعاب ملف مستمر', 2500], ['المبلغ الشهري', 8000]]);
    assert.ok(prev.lines.find((l) => l.label === 'أتعاب ملف مستمر').matter_code.startsWith('MTR-'));
    assert.equal(s.unpaid.total, 10500);
    assert.deepEqual(s.unpaid.periods, [prev.period]);
    assert.equal(s.last_payout, null);
    assert.equal(s.payout_note, 'من 5 إلى 10 من الشهر التالي، بتحويل بنكي', 'demo payout note');
    assert.ok(s.performance && 'avg_response_hours' in s.performance && 'returned_rate' in s.performance);
    // admin edits the note (one settings field) — empty hides it
    ok(await admin.patch('/api/admin/settings', { lawyer_payout_note: '' }));
    s = ok(await hany.get('/api/lawyer/statement'));
    assert.equal(s.payout_note, '');
    ok(await admin.patch('/api/admin/settings', { lawyer_payout_note: 'يوم 5 من كل شهر' }));
    s = ok(await hany.get('/api/lawyer/statement'));
    assert.equal(s.payout_note, 'يوم 5 من كل شهر');
    const lawyerTry = await hany.patch('/api/admin/settings', { lawyer_payout_note: 'x' });
    assert.equal(lawyerTry.status, 403);
    // after closing the month the expected line becomes recorded (no double counting)
    ok(await admin.post('/api/admin/accounting/close-month', { period }));
    s = ok(await hany.get('/api/lawyer/statement'));
    const m2 = s.this_month.lines.find((l) => l.key === 'monthly');
    assert.equal(m2.state, 'recorded');
    assert.equal(s.this_month.expected_total, 8000);
  });

  test('«مستحقاتي»: volunteer sees contributions, per-case lawyer sees approved consultations; payouts give status «paid»', async () => {
    const s = ok(await salwa.get('/api/lawyer/statement'));
    assert.equal(s.this_month.agreement_type, 'pro_bono');
    assert.ok(s.this_month.volunteer);
    assert.equal(s.this_month.lines.filter((l) => l.state === 'expected').length, 0, 'no money hero for volunteers');
    const a = ok(await ahmed.get('/api/lawyer/statement'));
    if (a.agreement.type === 'per_case') assert.ok(a.this_month.lines.some((l) => l.key === 'consultations' && typeof l.count === 'number'));
    // ahmed had a payout in the demo → last_payout set and that month «paid» or «partial»
    if (a.payouts.length) {
      assert.ok(a.last_payout && a.last_payout.amount > 0);
      assert.ok(a.months.some((m) => m.status === 'paid' || m.status === 'partial'));
    }
    // statement is per-lawyer only
    assert.ok(!JSON.stringify(s).includes('هاني رمزي'));
  });
});

describe('v9.1 l-court — static checks of lawyer-facing copy and markup', () => {
  const lawyerFiles = [
    'public/assets/js/app/pages/lawyer/matter.js',
    'public/assets/js/app/pages/lawyer/matters.js',
    'public/assets/js/app/pages/lawyer/statement.js',
    'public/assets/js/app/pages/lawyer/calendar.js',
    'public/assets/js/app/components/outcome-sheet.js',
    'public/assets/js/app/components/outbox.js',
  ];

  test('no «العميل» and no masculine «يُرسل له» in lawyer pages', () => {
    for (const f of lawyerFiles) {
      const src = read(f);
      assert.ok(!src.includes('العميل'), `${f} contains «العميل»`);
      assert.ok(!src.includes('يُرسل له'), `${f} contains «يُرسل له»`);
    }
    const cal = read('public/assets/js/app/pages/admin/calendar.js');
    assert.ok(!cal.includes('صاحب الشأن'), 'lawyer calendar badge says «يلزم حضور المستفيد/ة»');
  });

  test('the old status select and «تسجيل ما تم / تحديث الحالة» are gone from the lawyer matter page', () => {
    const src = read('public/assets/js/app/pages/lawyer/matter.js');
    assert.ok(!src.includes('تسجيل ما تم'));
    assert.ok(!src.includes("options('event_status')"));
    assert.ok(!src.includes('ما يتولاه النظام آليًا'), 'automation card removed');
    for (const s of ['جلسة بلا نتيجة', 'بانتظار النتيجة', 'القادمة', 'السابقة', 'سجّل النتيجة', 'بيانات الدعوى', 'تذكير آلي قبلها بثلاثة أيام بعد مراجعة الإدارة']) assert.ok(src.includes(s), `matter page has «${s}»`);
  });

  test('outcome sheet copy matches the spec', () => {
    const src = read('public/assets/js/app/components/outcome-sheet.js');
    for (const s of ['نتيجة جلسة اليوم', 'نتيجة الجلسة', 'ماذا قررت المحكمة؟', 'تأجّلت', 'حُجزت للحكم', 'صدر الحكم', 'لم تُنظر', 'تاريخ الجلسة القادمة', 'تاريخ النطق بالحكم', 'منطوق الحكم أو القرار', 'مثال: حكمت المحكمة بالبراءة.', 'سبب التأجيل (اختياري)', 'للاطلاع', 'لتقديم مستندات', 'للإعلان', 'للمرافعة', 'للخبير', 'إداريًا', 'شُطبت', 'لم تنعقد', 'سبب آخر', '+ أضف ملاحظة', '+ أضف ميعاد الطعن', 'حفظ النتيجة', 'جارٍ الحفظ…', 'تجاهل ما أدخلته؟', 'تغيير الساعة', 'مثل هذه الجلسة', 'تُضاف الجلسة القادمة لتقويمك، وتراجعها الإدارة قبل تذكير', 'هذا التاريخ مضى. لتسجيل جلسة انعقدت أضفها ثم سجّل نتيجتها.', 'إضافة الجلسة', 'موعد من نوع آخر']) {
      assert.ok(src.includes(s), `sheet has «${s}»`);
    }
    assert.ok(src.includes("type: 'date'"), 'date-only pickers');
    assert.ok(!src.includes("'datetime'"), 'no datetime-local in the corridor sheets');
    assert.ok(src.includes('client_ref'), 'idempotent saves');
  });

  test('«مستحقاتي» has no accounting jargon and no wide tables', () => {
    const src = read('public/assets/js/app/pages/lawyer/statement.js');
    for (const s of ['وقائع الاستحقاق', 'القيود المالية', 'المعاملة', 'قيود بحالة']) assert.ok(!src.includes(s), `no «${s}»`);
    assert.ok(!/\btable\(/.test(src), 'no table() on the statement');
    for (const s of ['المتوقع لك هذا الشهر', 'لم يُصرف بعد', 'موعد الصرف المعتاد: ', 'تحدد الإدارة موعد الصرف. للاستفسار تواصل معها.', 'لم تُصرف لك دفعات بعد.', 'الأشهر السابقة', 'صُرف جزئيًا', 'اتفاقك', 'أدائي', 'طباعة الكشف', 'مساهماتك التطوعية هذا الشهر', 'لقياس الأثر فقط.']) {
      assert.ok(src.includes(s), `statement has «${s}»`);
    }
  });

  test('outbox stores per user, clears on logout, and is wired into the app shell', () => {
    const ob = read('public/assets/js/app/components/outbox.js');
    assert.ok(ob.includes('bm-outbox:'));
    assert.ok(ob.includes('بانتظار الاتصال — سيُرسل تلقائيًا'));
    assert.ok(ob.includes("addEventListener('online'"));
    assert.ok(ob.includes('visibilitychange'));
    assert.ok(ob.includes('لم يُرسل بعد.'));
    const main = read('public/assets/js/app/main.js');
    assert.ok(main.includes('components/outbox.js'), 'initialised for lawyers from main.js');
    const html = read('public/app.html');
    assert.ok(html.includes('/assets/css/v91-l-court.css'));
  });

  test('(review) phone layout: the matter bottom bar really sticks, the lawyer calendar has ≥ 44px targets and the list before the filters', () => {
    const css = read('public/assets/css/v91-l-court.css');
    // العنصر الملتصق لا يتجاوز أباه: الالتصاق على .lc-bar-host (آخر أبناء الصفحة) لا على الشريط داخله
    assert.match(css, /\.lc-bar-host \{\s*position: sticky;/);
    assert.ok(!/\.lc-bottom-bar \{\s*position: sticky/.test(css));
    assert.match(css, /\.lc-cal-lawyer \.v9p-seg-btn,[\s\S]*?min-height: 44px/);
    assert.match(css, /\.lc-cal-lawyer \.v9p-cal-card \.stack > \.v9p-type-toggles \{\s*order: 3;/);
    const cal = read('public/assets/js/app/pages/admin/calendar.js');
    assert.ok(cal.includes("{ class: isLawyer && 'lc-cal-lawyer' }"), 'lawyer-only class; the staff calendar is unchanged');
  });

  test('ui.js keeps backwards-compatible modal() and adds the sheet variant + choiceTiles', () => {
    const ui = read('public/assets/js/lib/ui.js');
    assert.ok(/export function modal\(\{[^}]*sheet = false[^}]*beforeClose[^}]*\}/.test(ui));
    assert.ok(ui.includes('export function choiceTiles('));
    assert.ok(ui.includes("role: 'radiogroup'"));
  });
});

// (مراجعة) سلوك صندوق الصادر نفسه في Node: localStorage وfetch وwindow بدائل بسيطة (تُعاد بعد الاختبار)
describe('v9.1 l-court — offline outbox behaviour (stubbed browser)', () => {
  const saved = {};
  const store = new Map();
  let ob;
  let net = 'down';
  const calls = [];
  before(async () => {
    for (const k of ['window', 'document', 'localStorage', 'fetch']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    const win = new EventTarget();
    Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: { visibilityState: 'visible', addEventListener() {} }, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: async (url, init) => {
        calls.push({ url, method: init.method, body: init.body });
        if (net === 'down') throw new TypeError('Failed to fetch');
        const status = net === '401' ? 401 : net === '409' ? 409 : 200;
        const body = status === 200 ? { ok: true, echo: JSON.parse(init.body || '{}') } : { error: status === 409 ? 'أُلغيت الجلسة من الإدارة' : 'انتهت الجلسة' };
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      },
    });
    ob = await import('../public/assets/js/app/components/outbox.js');
  });
  after(() => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });

  test('queues on a network error, stores per user, sends once in order when back online', async () => {
    ob.initOutbox({ id: 7 });
    const r1 = await ob.outboxSend({ kind: 'outcome', method: 'POST', path: '/lawyer/matter-events/4/outcome', body: { result: 'adjourned', client_ref: 'ref-aaaaaaaa' }, ref: 'event:4', label: 'نتيجة' });
    assert.equal(r1.status, 'queued');
    const r2 = await ob.outboxSend({ kind: 'task', method: 'PATCH', path: '/lawyer/matter-tasks/2', body: { status: 'done' }, ref: 'task:2', label: 'مهمة' });
    assert.equal(r2.status, 'queued');
    assert.equal(ob.outboxCount(), 2);
    assert.ok(store.has('bm-outbox:7'), 'kept on this device under the user key');
    assert.equal(ob.outboxStateFor('event:4').state, 'queued');
    assert.equal(ob.outboxLogoutWarning(), 'لديك إجراءان لم يُرسلا بعد.');
    net = 'up';
    calls.length = 0;
    await ob.outboxFlush();
    assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ['POST /api/lawyer/matter-events/4/outcome', 'PATCH /api/lawyer/matter-tasks/2'], 'sent in order, once each');
    assert.equal(JSON.parse(calls[0].body).client_ref, 'ref-aaaaaaaa', 'the same client_ref is replayed');
    assert.equal(ob.outboxCount(), 0);
    assert.equal(ob.outboxLogoutWarning(), null);
    assert.ok(!store.has('bm-outbox:7'), 'nothing left on the device');
  });

  test('a 401 pauses sending until the user signs in again (no sending with someone else’s session)', async () => {
    net = 'down';
    await ob.outboxSend({ kind: 'outcome', method: 'POST', path: '/lawyer/matter-events/5/outcome', body: { result: 'not_held', client_ref: 'ref-bbbbbbbb' }, ref: 'event:5' });
    net = '401';
    calls.length = 0;
    await ob.outboxFlush();
    assert.equal(calls.length, 1);
    assert.equal(ob.outboxCount(), 1, 'kept');
    await ob.outboxFlush();
    await ob.outboxFlush();
    assert.equal(calls.length, 1, 'paused: no more requests after the session expired');
    net = 'up';
    ob.initOutbox({ id: 7 }); // دخل من جديد
    await ob.outboxFlush();
    assert.equal(calls.length, 2);
    assert.equal(ob.outboxCount(), 0);
  });

  test('a 4xx leaves the queue as «لم يُحفظ: …»; logout warning agrees with the number; clearOutbox wipes the device copy', async () => {
    net = 'down';
    await ob.outboxSend({ kind: 'outcome', method: 'POST', path: '/lawyer/matter-events/6/outcome', body: { result: 'judgment', decision: 'نص الحكم', client_ref: 'ref-cccccccc' }, ref: 'event:6' });
    assert.equal(ob.outboxLogoutWarning(), 'لديك إجراء واحد لم يُرسل بعد.');
    for (let i = 7; i < 9; i++) await ob.outboxSend({ kind: 'task', method: 'PATCH', path: `/lawyer/matter-tasks/${i}`, body: { status: 'done' }, ref: `task:${i}` });
    assert.equal(ob.outboxLogoutWarning(), 'لديك 3 إجراءات لم تُرسل بعد.');
    net = '409';
    await ob.outboxFlush();
    assert.equal(ob.outboxCount(), 0);
    const f = ob.outboxStateFor('event:6');
    assert.equal(f.state, 'failed');
    assert.equal(f.item.error, 'أُلغيت الجلسة من الإدارة');
    assert.ok(store.has('bm-outbox:7'), 'the failure note is kept until dismissed or logout');
    ob.clearOutbox();
    assert.ok(!store.has('bm-outbox:7'), 'logout leaves nothing (not even failed bodies) on a shared phone');
    assert.equal(ob.outboxStateFor('event:6'), null);
  });

  test('main.js clears the outbox only after every logout confirmation', () => {
    const main = read('public/assets/js/app/main.js');
    const confirmFn = main.slice(main.indexOf('async function confirmOutboxLogout'), main.indexOf('async function logout'));
    assert.ok(!confirmFn.includes('clearOutbox()'), 'not cleared before the drafts confirmation (the user may still cancel)');
    const logoutFn = main.slice(main.indexOf('async function logout'), main.indexOf("window.addEventListener('auth:expired'"));
    assert.ok(logoutFn.indexOf('clearOutbox()') > logoutFn.indexOf('confirmLogoutWithDrafts'), 'cleared after the last confirmation');
    const src = read('public/assets/js/app/components/outbox.js');
    assert.ok(src.includes("addEventListener('storage'"), 'tabs of the same user stay in sync');
  });
});
