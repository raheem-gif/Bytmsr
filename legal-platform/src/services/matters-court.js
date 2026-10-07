// الإصدار 9.1 — مسار l-court: نتيجة الجلسة من ممر المحكمة (L-02)، ميعاد الطعن بعد الحكم (L-22)،
// الجلسات التي انعقدت دون نتيجة (للتقويم و«اليوم» والتنبيه الآلي hearing_outcome_missing).
//
// تُدمج دوالها في خدمة app.matters (Object.assign في matters.js):
//   lawyerEventView(row)                      ما يراه المحامي من موعد (بلا client_text_approved ولا بيانات المستفيد/ة)
//   recordOutcome(eventId, body, lawyer)      POST /api/lawyer/matter-events/:id/outcome — معاملة واحدة، آمنة للتكرار بـ client_ref
//   pendingOutcomesForLawyer(lawyer, {days})  جلسات انعقدت (آخر 30 يومًا افتراضيًا) وما زالت «مجدولة» بلا نتيجة
//   runOutcomeMissing(params, {once})         منفذ قاعدة الأتمتة hearing_outcome_missing (من automations.js)
//   outcomeText({...})                        نص النتيجة العربي كما يُخزَّن في matter_events.outcome
//
// الخصوصية: لا يتغير شيء — الجلسة القادمة التي يسجلها المحامي client_text_approved = 0، فلا يصل تذكير
// المستفيد/ة قبل اعتماد الإدارة (hearing_reminder يتحقق من ذلك)، والمحامي لا يصل إلا لملفاته (requireForLawyer).
import { nowIso, addDays, badRequest, notFound, conflict, v, truncate, arabicDate, cairoParts, cairoDayKey, cairoLocalToIso } from '../util.js';
import { LABELS, ENUMS } from '../constants.js';

/** أنواع المواعيد التي تُسجَّل لها «نتيجة جلسة» (ما يقرره قاضٍ أو خبير) */
export const COURT_EVENT_KINDS = ['hearing', 'expert'];

const ADJOURN_REASONS = ['review', 'documents', 'notice', 'pleading', 'expert', 'administrative'];
const NOT_HELD_REASONS = ['struck', 'no_session', 'other'];
const STATUS_FOR = { adjourned: 'postponed', reserved: 'done', judgment: 'done', not_held: 'cancelled' };

const fieldError = (field, message) => badRequest(message, { fields: { [field]: message } });

/** 'YYYY-MM-DD' صالح فعلًا (لا 2026-02-30) */
function parseDay(value, field, label) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw fieldError(field, `«${label}» ليس تاريخًا صالحًا`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw fieldError(field, `«${label}» ليس تاريخًا صالحًا`);
  return { y, m: mo, d, key: s };
}

/** 'HH:MM' (24 ساعة) */
function parseTime(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw fieldError(field, 'الساعة غير صالحة');
  return { h: Number(m[1]), min: Number(m[2]) };
}

const addYears = (key, n) => `${Number(key.slice(0, 4)) + n}${key.slice(4)}`;

/**
 * النص العربي للنتيجة: «تأجّلت لجلسة الأربعاء 28 أكتوبر 2026 — للاطلاع. ملاحظة»، «حُجزت للحكم لجلسة …»،
 * «صدر الحكم: …»، «لم تُنظر — شُطبت.» (مع «الجلسة القادمة …» إن حُددت).
 */
export function outcomeText({ result, reason, decision, nextIso }) {
  const r = reason ? LABELS.event_outcome_reason[reason] : null;
  const d = decision ? String(decision).trim() : '';
  const dateText = nextIso ? arabicDate(nextIso) : null;
  let s;
  switch (result) {
    case 'adjourned':
      s = `تأجّلت لجلسة ${dateText}${r ? ` — ${r}` : ''}.`;
      break;
    case 'reserved':
      s = `حُجزت للحكم لجلسة ${dateText}.`;
      break;
    case 'judgment':
      return `صدر الحكم: ${d}`;
    case 'not_held':
      s = `لم تُنظر${r ? ` — ${r}` : ''}.${dateText ? ` الجلسة القادمة ${dateText}.` : ''}`;
      break;
    default:
      s = '';
  }
  return d ? `${s} ${d}` : s;
}

export function createCourtOutcomes(app, svc) {
  const { db } = app;

  /** ما يراه المحامي من موعد في ملفه المستمر */
  function lawyerEventView(e) {
    if (!e) return null;
    const t = nowIso();
    const next = db.get("SELECT id, starts_at, status FROM matter_events WHERE parent_event_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1", e.id);
    // ميعاد الطعن المسجل مع «صدر الحكم» (L-22): تعرضه ورقة «تعديل النتيجة» كما هو حتى لا يُلغى بالخطأ عند التعديل
    const appeal = e.outcome_kind === 'judgment' ? db.get("SELECT due_at FROM matter_tasks WHERE source_event_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1", e.id) : null;
    return {
      id: e.id,
      matter_id: e.matter_id,
      kind: e.kind,
      title: e.title,
      starts_at: e.starts_at,
      location: e.location,
      client_attendance_required: e.client_attendance_required,
      status: e.status,
      notes: e.notes,
      outcome: e.outcome,
      outcome_kind: e.outcome_kind || null,
      outcome_reason: e.outcome_reason || null,
      outcome_decision: e.outcome_decision || null,
      outcome_at: e.outcome_at || null,
      parent_event_id: e.parent_event_id || null,
      next_event_id: next ? next.id : null,
      next_event_at: next ? next.starts_at : null,
      appeal_due_at: appeal ? appeal.due_at : null,
      needs_outcome: e.status === 'scheduled' && COURT_EVENT_KINDS.includes(e.kind) && e.starts_at <= t,
    };
  }

  function taskView(k) {
    return k ? { id: k.id, title: k.title, details: k.details, due_at: k.due_at, procedural: k.procedural, status: k.status, done_at: k.done_at, source_event_id: k.source_event_id } : null;
  }

  function responseFor(eventId, nextId, taskId) {
    return {
      event: lawyerEventView(db.get('SELECT * FROM matter_events WHERE id = ?', eventId)),
      next_event: nextId ? lawyerEventView(db.get('SELECT * FROM matter_events WHERE id = ?', nextId)) : null,
      task: taskId ? taskView(db.get('SELECT * FROM matter_tasks WHERE id = ?', taskId)) : null,
    };
  }

  /**
   * POST /api/lawyer/matter-events/:id/outcome
   * body: { result, reason?, decision?, next_date?, next_time?, next_attendance_required?, appeal_due_date?, client_ref }
   */
  function recordOutcome(eventId, body = {}, lawyer) {
    const ref = v.str(body.client_ref, 'مرجع العملية', { required: true, max: 64 });
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) throw badRequest('مرجع العملية غير صالح');
    return db.tx(() => {
      const e = db.get('SELECT * FROM matter_events WHERE id = ?', eventId);
      if (!e) throw notFound('الموعد غير موجود');
      // المحامي المسؤول فقط (غير ذلك «غير موجود» حتى لا يُكشف وجود الملف)
      const m = svc.requireForLawyer(e.matter_id, lawyer);

      // إعادة الإرسال بنفس المرجع (صندوق الصادر بعد عودة الشبكة): نفس الرد دون أي تكرار
      const prior = db.get('SELECT * FROM matter_event_outcomes WHERE client_ref = ?', ref);
      if (prior) {
        if (prior.user_id !== lawyer.id || prior.event_id !== e.id) throw conflict('مرجع العملية مستخدم من قبل');
        return { ...responseFor(e.id, prior.next_event_id, prior.task_id), replayed: true };
      }

      if (m.status === 'closed') throw conflict('الملف المستمر مغلق');
      if (!COURT_EVENT_KINDS.includes(e.kind)) throw badRequest('تُسجَّل النتيجة للجلسات فقط');
      // تعديل النتيجة مسموح؛ أما موعد أُلغي دون نتيجة (من «أُلغيت الجلسة») فلا نتيجة له
      const editing = e.status !== 'scheduled';
      if (e.status === 'cancelled' && !e.outcome_kind && !e.outcome) throw conflict('لا يمكن تسجيل نتيجة لموعد أُلغي');
      const today = cairoDayKey(nowIso());
      const eventDay = cairoDayKey(e.starts_at);
      if (eventDay > today) throw badRequest('لم يحن موعد هذه الجلسة بعد؛ سجّل نتيجتها بعد انعقادها');

      const result = v.oneOf(body.result, ENUMS.event_outcome, 'ماذا قررت المحكمة؟', { required: true });
      const allowedReasons = result === 'adjourned' ? ADJOURN_REASONS : result === 'not_held' ? NOT_HELD_REASONS : [];
      const reason = allowedReasons.length ? v.oneOf(body.reason || null, allowedReasons, 'السبب') : null;
      let decision = v.str(body.decision, result === 'judgment' ? 'منطوق الحكم أو القرار' : 'ملاحظة', { max: 5000 });
      if (result === 'judgment') {
        if (!decision) throw fieldError('decision', 'اكتب منطوق الحكم أو القرار');
        if (decision.length < 5) throw fieldError('decision', 'اكتب منطوق الحكم أو القرار (5 أحرف على الأقل)');
      }

      // تاريخ الجلسة القادمة: إلزامي للتأجيل وحجز الحكم، واختياري لـ«لم تُنظر»، ولا يُقبل مع «صدر الحكم»
      const needsNext = result === 'adjourned' || result === 'reserved';
      const next = result === 'judgment' ? null : parseDay(body.next_date, 'next_date', 'تاريخ الجلسة القادمة');
      if (needsNext && !next) throw fieldError('next_date', 'حدد تاريخ الجلسة القادمة');
      let nextIso = null;
      if (next) {
        if (next.key <= eventDay) throw fieldError('next_date', 'تاريخ الجلسة القادمة يجب أن يكون بعد هذه الجلسة');
        if (next.key > addYears(eventDay, 2)) throw fieldError('next_date', 'تاريخ الجلسة القادمة بعيد جدًا (أكثر من سنتين)');
        const cur = cairoParts(e.starts_at);
        const tm = parseTime(body.next_time, 'next_time') || { h: cur.hour ?? 9, min: cur.minute ?? 0 };
        nextIso = cairoLocalToIso(next.y, next.m, next.d, tm.h, tm.min);
      }
      const attendance = body.next_attendance_required === undefined || body.next_attendance_required === null ? !!e.client_attendance_required : v.bool(body.next_attendance_required);

      // ميعاد الطعن (L-22): مع «صدر الحكم» فقط، يدخله المحامي (لا حساب آلي للمواعيد القانونية)
      const appeal = result === 'judgment' ? parseDay(body.appeal_due_date, 'appeal_due_date', 'ميعاد الطعن') : null;
      if (appeal && appeal.key < eventDay) throw fieldError('appeal_due_date', 'ميعاد الطعن يجب ألا يسبق تاريخ الحكم');
      if (appeal && appeal.key > addYears(eventDay, 2)) throw fieldError('appeal_due_date', 'ميعاد الطعن بعيد جدًا');

      const t = nowIso();
      const text = outcomeText({ result, reason, decision, nextIso });

      // 1) الجلسة الحالية
      db.update('matter_events', e.id, {
        status: STATUS_FOR[result],
        outcome: text,
        outcome_kind: result,
        outcome_reason: reason,
        outcome_decision: decision,
        outcome_at: t,
        outcome_by: lawyer.id,
        client_ref: ref,
        updated_at: t,
      });

      // 2) الجلسة القادمة (جديدة، أو تعديل جلسة أُنشئت من تسجيل سابق لنفس الجلسة ولم تُنظر بعد)
      const child = db.get("SELECT * FROM matter_events WHERE parent_event_id = ? AND status != 'cancelled' ORDER BY id DESC LIMIT 1", e.id);
      const nextTitle = result === 'reserved' ? 'جلسة النطق بالحكم' : e.title;
      let nextId = null;
      // ما ألغاه هذا التعديل (الجلسة المولّدة سابقًا / مهمة ميعاد الطعن) يعود في الرد لتحديث الصفوف دون إعادة تحميل
      let cancelledEventId = null;
      let cancelledTaskId = null;
      if (nextIso) {
        if (child && child.status === 'scheduled' && !child.outcome_kind) {
          const patch = { starts_at: nextIso, title: nextTitle, client_attendance_required: attendance ? 1 : 0, updated_at: t };
          const changed = patch.starts_at !== child.starts_at || patch.title !== child.title || patch.client_attendance_required !== child.client_attendance_required;
          if (changed) patch.client_text_approved = 0; // ما يغيره المحامي يعود لاعتماد الإدارة قبل أي تذكير
          // رد المستفيد/ة على الموعد القديم («هحضر / مش هقدر» — وحدة b-portal) لا يسري على موعد جديد
          if (patch.starts_at !== child.starts_at && 'client_response' in child) Object.assign(patch, { client_response: null, client_response_at: null });
          db.update('matter_events', child.id, patch);
          nextId = child.id;
        } else if (child) {
          if (cairoDayKey(child.starts_at) !== next.key) throw conflict('سُجّلت نتيجة الجلسة القادمة بالفعل؛ لا يمكن تغيير موعدها من هنا');
          nextId = child.id;
        } else {
          nextId = db.insert('matter_events', {
            matter_id: m.id,
            kind: 'hearing',
            title: nextTitle,
            starts_at: nextIso,
            location: e.location || m.court || null,
            client_attendance_required: attendance ? 1 : 0,
            status: 'scheduled',
            client_text_approved: 0,
            parent_event_id: e.id,
            created_by: lawyer.id,
            created_at: t,
            updated_at: t,
          });
        }
      } else if (child && child.status === 'scheduled' && !child.outcome_kind) {
        // عُدّلت النتيجة إلى ما لا جلسة بعده: تُلغى الجلسة التي أُنشئت من التسجيل السابق
        db.update('matter_events', child.id, { status: 'cancelled', notes: [child.notes, 'أُلغيت بعد تعديل نتيجة الجلسة السابقة.'].filter(Boolean).join('\n'), updated_at: t });
        cancelledEventId = child.id;
      }

      // 3) ميعاد الطعن كموعد إجرائي
      const priorTask = db.get('SELECT * FROM matter_tasks WHERE source_event_id = ? ORDER BY id DESC LIMIT 1', e.id);
      let taskId = null;
      if (appeal) {
        const dueAt = cairoLocalToIso(appeal.y, appeal.m, appeal.d, 23, 59);
        if (priorTask && priorTask.status === 'open') {
          db.update('matter_tasks', priorTask.id, { due_at: dueAt, details: truncate(`الحكم: ${decision}`, 300), updated_at: t });
          taskId = priorTask.id;
        } else if (priorTask && priorTask.status === 'done') {
          taskId = priorTask.id;
        } else {
          taskId = db.insert('matter_tasks', {
            matter_id: m.id,
            title: 'ميعاد الطعن على الحكم',
            details: truncate(`الحكم: ${decision}`, 300),
            assignee_user_id: lawyer.id,
            due_at: dueAt,
            procedural: 1,
            status: 'open',
            source_event_id: e.id,
            created_by: lawyer.id,
            created_at: t,
            updated_at: t,
          });
        }
      } else if (priorTask && priorTask.status === 'open') {
        db.update('matter_tasks', priorTask.id, { status: 'cancelled', updated_at: t });
        cancelledTaskId = priorTask.id;
      }

      db.insert('matter_event_outcomes', { client_ref: ref, event_id: e.id, user_id: lawyer.id, result, next_event_id: nextId, task_id: taskId, created_at: t });

      app.activity.log({
        matter_id: m.id,
        case_id: m.case_id,
        actor: lawyer,
        type: 'event.outcome',
        summary: `${editing ? 'عدّل المحامي نتيجة' : 'سجّل المحامي نتيجة'} «${truncate(e.title, 60)}»: ${truncate(text, 160)}`,
      });
      // إشعار واحد للإدارة
      const nextRow = nextId ? db.get('SELECT * FROM matter_events WHERE id = ?', nextId) : null;
      app.notifications.notifyStaff({
        type: 'event.outcome',
        title: `سجّل المحامي نتيجة جلسة في الملف ${m.code}`,
        body: nextRow && nextRow.client_attendance_required && !nextRow.client_text_approved ? 'يحتاج تذكير المستفيد/ة بالجلسة القادمة إلى اعتماد.' : truncate(text, 140),
        link: `#/matters/${m.id}`,
      });
      return {
        ...responseFor(e.id, nextId, taskId),
        cancelled_event: cancelledEventId ? lawyerEventView(db.get('SELECT * FROM matter_events WHERE id = ?', cancelledEventId)) : null,
        cancelled_task: cancelledTaskId ? taskView(db.get('SELECT * FROM matter_tasks WHERE id = ?', cancelledTaskId)) : null,
      };
    });
  }

  /** جلسات انعقدت (حتى الآن) خلال آخر `days` يومًا وما زالت «مجدولة» بلا نتيجة — للمحامي المسؤول فقط */
  function pendingOutcomesForLawyer(lawyer, { days = 30 } = {}) {
    const t = nowIso();
    return db
      .all(
        `SELECT e.*, m.code AS matter_code, m.title AS matter_title FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' AND e.status = 'scheduled'
           AND e.kind IN (${COURT_EVENT_KINDS.map(() => '?').join(',')}) AND e.starts_at <= ? AND e.starts_at >= ?
         ORDER BY e.starts_at`,
        lawyer.id,
        ...COURT_EVENT_KINDS,
        t,
        addDays(t, -days),
      )
      .map((e) => ({ ...lawyerEventView(e), matter_code: e.matter_code, matter_title: e.matter_title }));
  }

  /**
   * قاعدة hearing_outcome_missing: الساعة 15:00 بتوقيت القاهرة يوم الجلسة (أو بعد بدئها بساعتين إن كانت مسائية)، ثم مرة أخيرة 10:00 صباح اليوم التالي،
   * إشعار واحد للمحامي المسؤول لكل جلسة في كل مرة (نص بلا بيانات المستفيد/ة: كود الملف ورابط فقط).
   */
  function runOutcomeMissing(params, { once }) {
    const t = nowIso();
    const now = cairoParts(t);
    const today = cairoDayKey(t);
    const yesterday = cairoDayKey(addDays(t, -1));
    const rows = db.all(
      `SELECT e.id, e.starts_at, e.matter_id, m.code AS matter_code, m.responsible_lawyer_id FROM matter_events e JOIN matters m ON m.id = e.matter_id
       WHERE e.status = 'scheduled' AND e.kind IN (${COURT_EVENT_KINDS.map(() => '?').join(',')}) AND e.starts_at <= ? AND e.starts_at >= ?
         AND m.status != 'closed' AND m.responsible_lawyer_id IS NOT NULL`,
      ...COURT_EVENT_KINDS,
      t,
      addDays(t, -3),
    );
    let n = 0;
    for (const e of rows) {
      const day = cairoDayKey(e.starts_at);
      let stage = null;
      // يوم الجلسة: من الساعة 15:00، وبعد بدء الجلسة بساعتين على الأقل (جلسة مسائية لا يُنبَّه عنها لحظة بدئها)
      if (day === today && now.hour >= 15 && Date.parse(e.starts_at) <= Date.parse(t) - 2 * 3600 * 1000) stage = 'd0';
      else if (day === yesterday && now.hour >= 10) stage = 'd1';
      if (!stage) continue;
      const u = db.get("SELECT id, active, invite_pending FROM users WHERE id = ? AND role = 'lawyer'", e.responsible_lawyer_id);
      if (!u || !u.active || u.invite_pending) continue;
      const did = once('hearing_outcome_missing', `event:${e.id}:${stage}`, 'matter_event', e.id, () => {
        app.notifications.notify(u.id, {
          type: 'hearing.outcome_missing',
          title: `لم تُسجَّل نتيجة جلسة ${stage === 'd0' ? 'اليوم' : 'أمس'} في الملف ${e.matter_code}`,
          body: 'سجّلها الآن حتى تُضاف الجلسة القادمة لتقويمك.',
          link: `#/my/matters/${e.matter_id}?outcome=${e.id}`,
        });
        return 'notified';
      });
      if (did) n++;
    }
    return n;
  }

  return { lawyerEventView, recordOutcome, pendingOutcomesForLawyer, runOutcomeMissing, outcomeText };
}
