// الإصدار 9.1 — مسار l-home: «اليوم» للمحامي (L-01): قائمة واحدة مرتبة بما يجب فعله الآن.
// تُبنى من بيانات المحامي نفسه فقط (إسناداته، ملفاته المستمرة التي هو مسؤول عنها، ومهامها) دون أي بيانات عن المستفيد/ة:
// لا اسم ولا هاتف ولا رقم قومي ولا محادثات. النصوص العربية تُبنى في الواجهة من app/words.js.
import { nowIso, addHours, addDays, periodOf, periodRange, cairoDayKey, fromMinor, parseJson } from '../util.js';

/** ترتيب أنواع الصفوف (مطابق لـ ACTION_ORDER في public/assets/js/app/words.js) */
export const ACTION_ORDER = [
  'hearing_outcome',
  'assignment_overdue',
  'assignment_returned',
  'task_overdue',
  'hearing_today',
  'assignment_due_soon',
  'assignment_new',
  'info_shared',
  'task_due',
];
const RANK = Object.fromEntries(ACTION_ORDER.map((k, i) => [k, i]));

/** عدد ملاحظات الإدارة في نص الإعادة: البنود المرقمة إن وُجدت، وإلا الأسطر غير الفارغة */
export function countNotes(note) {
  const text = String(note || '').trim();
  if (!text) return 0;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = lines.filter((l) => /^(?:[0-9٠-٩]+\s*[-.)٫:،]|[-•*–]\s)/.test(l));
  return numbered.length || lines.length;
}

export function createLawyerToday(app) {
  const { db } = app;

  function payFor(lawyerId, t) {
    const period = periodOf(t);
    const row = db.get('SELECT agreement FROM lawyers WHERE user_id = ?', lawyerId);
    const agreement = parseJson(row?.agreement, {}) || {};
    const type = agreement.type || null;
    const volunteer = type === 'pro_bono' || type === 'csr';
    if (volunteer) {
      const { start, end } = periodRange(period);
      const n = Number(
        db.value(
          "SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND treatment IN ('pro_bono','csr') AND created_at >= ? AND created_at < ?",
          lawyerId,
          start,
          end,
        ),
      );
      return { period, type, volunteer: true, contributions: n, amount: null };
    }
    const accruedMinor = Number(
      db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND period = ? AND status != 'void'", lawyerId, period),
    );
    let amount = fromMinor(accruedMinor) || 0;
    if (type === 'monthly' || type === 'monthly_quota') {
      // المبلغ الشهري الثابت متوقع للشهر الحالي حتى لو لم يُقفل الشهر بعد (لا يُحتسب مرتين إن سُجّل قيده)
      const monthlyRecorded = Number(
        db.value("SELECT COUNT(*) FROM ledger_entries WHERE lawyer_id = ? AND period = ? AND kind = 'monthly_fee' AND status != 'void'", lawyerId, period),
      );
      if (!monthlyRecorded) amount += Number(agreement.monthly_fee) || 0;
    }
    return { period, type, volunteer: false, contributions: null, amount };
  }

  const svc = {
    /**
     * @param {object} lawyer المستخدم (دور lawyer — يتحقق المسار من الدور)
     * @returns {{now, user_id, actions, upcoming, work, pay, setup}}
     */
    forLawyer(lawyer) {
      const t = nowIso();
      const in48 = addHours(t, 48);
      const in72 = addHours(t, 72);
      const in14d = addDays(t, 14);
      const today = cairoDayKey(t);
      const tomorrow = cairoDayKey(addDays(t, 1));
      const actions = [];
      const listed = { events: new Set(), assignments: new Set(), tasks: new Set() };

      // ── الجلسات التي مضى موعدها بلا نتيجة (بلا حد أدنى للتاريخ) ──
      const pendingEvents = db.all(
        `SELECT e.id, e.title, e.kind, e.starts_at, e.location, e.client_attendance_required, m.id AS matter_id, m.code AS matter_code
         FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' AND e.status = 'scheduled' AND e.starts_at < ?
         ORDER BY e.starts_at`,
        lawyer.id,
        t,
      );
      for (const e of pendingEvents) {
        listed.events.add(e.id);
        actions.push({
          kind: 'hearing_outcome',
          at: e.starts_at,
          event_id: e.id,
          event_kind: e.kind,
          matter_id: e.matter_id,
          matter_code: e.matter_code,
          title: e.title,
          location: e.location || null,
          attendance: !!e.client_attendance_required,
        });
      }

      // ── الجلسات القادمة اليوم أو غدًا (للعلم) ──
      const soonEvents = db.all(
        `SELECT e.id, e.title, e.kind, e.starts_at, e.location, e.client_attendance_required, m.id AS matter_id, m.code AS matter_code
         FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' AND e.status = 'scheduled' AND e.starts_at >= ? AND e.starts_at <= ?
         ORDER BY e.starts_at`,
        lawyer.id,
        t,
        in14d,
      );
      for (const e of soonEvents) {
        const day = cairoDayKey(e.starts_at);
        if (day !== today && day !== tomorrow) continue;
        listed.events.add(e.id);
        actions.push({
          kind: 'hearing_today',
          at: e.starts_at,
          event_id: e.id,
          matter_id: e.matter_id,
          matter_code: e.matter_code,
          title: e.title,
          location: e.location || null,
          attendance: !!e.client_attendance_required,
        });
      }

      // ── الإسنادات ──
      const assignments = app.visibility.listForLawyer(lawyer, { scope: 'active' });
      const returnedNotes = new Map();
      const returnedIds = assignments.filter((a) => a.status === 'returned').map((a) => a.id);
      for (const id of returnedIds) {
        const o = db.get("SELECT review_note, reviewed_at FROM opinions WHERE assignment_id = ? AND status = 'returned' ORDER BY version DESC LIMIT 1", id);
        returnedNotes.set(id, o || null);
      }
      for (const a of assignments) {
        const base = { assignment_id: a.id, case_code: a.case_code, case_title: a.case_title, due_at: a.due_at || null };
        if (a.status === 'returned') {
          const o = returnedNotes.get(a.id);
          actions.push({ kind: 'assignment_returned', at: o?.reviewed_at || a.due_at || t, ...base, notes_count: countNotes(o?.review_note) });
          listed.assignments.add(a.id);
        } else if (a.overdue) {
          actions.push({ kind: 'assignment_overdue', at: a.due_at, ...base });
          listed.assignments.add(a.id);
        } else if (a.status === 'assigned') {
          actions.push({ kind: 'assignment_new', at: a.due_at || a.assigned_at, ...base });
          listed.assignments.add(a.id);
        } else if (a.status === 'in_progress' && a.due_at && a.due_at <= in48) {
          actions.push({ kind: 'assignment_due_soon', at: a.due_at, ...base });
          listed.assignments.add(a.id);
        }
        // v9.1 fixes: رد وصل بعد تقديم الرأي يبقى صفًا للعلم («وصلك رد بعد تقديم رأيك») — قد يغيّر الرأي قبل اعتماده
        if (Number(a.unseen_shared_info_requests) > 0) {
          actions.push({ kind: 'info_shared', at: a.due_at || t, assignment_id: a.id, case_code: a.case_code, count: Number(a.unseen_shared_info_requests), ...(a.status === 'submitted' ? { after_submit: true } : {}) });
        }
      }

      // ── مهام الملفات المستمرة المسؤول عنها (متأخرة أو خلال 72 ساعة) ──
      const tasks = db.all(
        `SELECT k.id, k.title, k.due_at, k.procedural, m.id AS matter_id, m.code AS matter_code
         FROM matter_tasks k JOIN matters m ON m.id = k.matter_id
         WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' AND k.status = 'open' AND k.due_at IS NOT NULL AND k.due_at <= ?
         ORDER BY k.due_at`,
        lawyer.id,
        in14d,
      );
      for (const k of tasks) {
        if (k.due_at > in72) continue;
        listed.tasks.add(k.id);
        actions.push({ kind: k.due_at < t ? 'task_overdue' : 'task_due', at: k.due_at, due_at: k.due_at, task_id: k.id, matter_id: k.matter_id, matter_code: k.matter_code, title: k.title, procedural: !!k.procedural });
      }

      actions.sort((x, y) => RANK[x.kind] - RANK[y.kind] || String(x.at || '').localeCompare(String(y.at || '')));

      // ── «قادم»: أقرب 3 مواعيد خلال 14 يومًا غير مذكورة أعلاه ──
      // + الجلسة القادمة لكل ملف مستمر حتى 30 يومًا (الجلسات متباعدة: التأجيل 3 أسابيع — مثل 28 أكتوبر في مهمة الاختبار T9 —
      //   يظهر هنا فور تسجيل النتيجة؛ وما بعد الشهر في «تقويمي» فلا تطول صفحة «اليوم»)
      const upcoming = [];
      for (const e of soonEvents) {
        if (listed.events.has(e.id)) continue;
        upcoming.push({ kind: 'hearing', at: e.starts_at, event_id: e.id, matter_id: e.matter_id, matter_code: e.matter_code, title: e.title, location: e.location || null });
      }
      const laterHearings = db.all(
        `SELECT e.id, e.title, e.starts_at, e.location, m.id AS matter_id, m.code AS matter_code
         FROM matter_events e JOIN matters m ON m.id = e.matter_id
         WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' AND e.status = 'scheduled' AND e.starts_at > ? AND e.starts_at <= ?
           AND e.starts_at = (SELECT MIN(x.starts_at) FROM matter_events x WHERE x.matter_id = m.id AND x.status = 'scheduled' AND x.starts_at >= ?)
         ORDER BY e.starts_at`,
        lawyer.id,
        in14d,
        addDays(t, 30),
        t,
      );
      for (const e of laterHearings) {
        if (listed.events.has(e.id) || upcoming.some((u) => u.event_id === e.id)) continue;
        upcoming.push({ kind: 'hearing', at: e.starts_at, event_id: e.id, matter_id: e.matter_id, matter_code: e.matter_code, title: e.title, location: e.location || null });
      }
      for (const a of assignments) {
        if (listed.assignments.has(a.id) || !a.due_at || a.due_at > in14d || a.status === 'submitted') continue;
        upcoming.push({ kind: 'assignment_due', at: a.due_at, assignment_id: a.id, case_code: a.case_code, case_title: a.case_title });
      }
      for (const k of tasks) {
        if (listed.tasks.has(k.id)) continue;
        upcoming.push({ kind: 'task', at: k.due_at, task_id: k.id, matter_id: k.matter_id, matter_code: k.matter_code, title: k.title });
      }
      upcoming.sort((x, y) => String(x.at).localeCompare(String(y.at)));

      // ── «عملي الجاري» ──
      const matters = db.all(
        `SELECT m.id, m.code, m.title, m.status,
           (SELECT MIN(starts_at) FROM matter_events e WHERE e.matter_id = m.id AND e.status = 'scheduled' AND e.starts_at >= ?) AS next_event_at
         FROM matters m WHERE m.responsible_lawyer_id = ? AND m.status != 'closed' ORDER BY m.id DESC LIMIT 20`,
        t,
        lawyer.id,
      );

      const u = db.get('SELECT alert_whatsapp, created_at FROM users WHERE id = ?', lawyer.id) || {};
      const history = Number(db.value("SELECT COUNT(*) FROM assignments WHERE lawyer_id = ? AND status IN ('submitted','approved')", lawyer.id));
      return {
        now: t,
        user_id: lawyer.id,
        actions: actions.slice(0, 50),
        upcoming: upcoming.slice(0, 3),
        work: {
          assignments: assignments.map((a) => ({ id: a.id, case_code: a.case_code, case_title: a.case_title, status: a.status, due_at: a.due_at || null })),
          matters: matters.map((m) => ({ id: m.id, code: m.code, title: m.title, status: m.status, next_event_at: m.next_event_at || null })),
        },
        pay: payFor(lawyer.id, t),
        setup: {
          alert_whatsapp: !!u.alert_whatsapp,
          alerts_available: app.lawyerAlerts ? app.lawyerAlerts.available() : false,
          calendar_feed_active: !!db.get('SELECT 1 FROM calendar_feeds WHERE user_id = ?', lawyer.id),
          two_factor: app.auth.twoFactorEnabled(lawyer.id),
          // حساب جديد بلا عمل سابق: تظهر بطاقة «جهّز هاتفك» حتى مع وجود إسنادات
          new_account: history === 0 && (!u.created_at || u.created_at >= addDays(t, -30)),
        },
      };
    },

    /** عدد صفوف «مطلوب الآن» (شارة «اليوم» في الشريط السفلي والملخص الصباحي) */
    actionCount(lawyer) {
      return svc.forLawyer(lawyer).actions.length;
    },
  };
  return svc;
}
