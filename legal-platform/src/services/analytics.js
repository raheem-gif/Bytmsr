// التحليلات: مصدر العميل ≠ قناة التواصل. نعرف ليس فقط عدد الرسائل التي أنتجها كل إعلان،
// بل ماذا حدث لها فعليًا: كم تحول لاستشارة، كم احتاج محاميًا، كم صار قضية، كم كلّف، وما النتائج.
import { nowIso, addDays, periodOf, fromMinor } from '../util.js';
import { LABELS, LEGAL_AREAS } from '../constants.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

export function createAnalytics(app) {
  const { db } = app;

  function caseCostMinor(caseId) {
    const c = app.accounting.caseCost(caseId);
    return c ? Math.round(c.total * 100) : 0;
  }

  const svc = {
    /** قمع التحويل حسب المصدر أو القناة أو الحملة */
    funnel({ from, to, group = 'source' } = {}) {
      const start = from ? new Date(from).toISOString() : addDays(nowIso(), -90);
      const end = to ? new Date(to).toISOString() : addDays(nowIso(), 1);
      const keyExpr = group === 'channel' ? 'i.first_channel' : group === 'campaign' ? "COALESCE(i.campaign, '—')" : 'i.source';
      const rows = db.all(
        `SELECT ${keyExpr} AS k, i.id, i.status, i.kind, i.case_id, c.status AS case_status, c.outcome, c.matter_id,
           (SELECT COUNT(*) FROM assignments a WHERE a.case_id = c.id AND a.status != 'withdrawn') AS team,
           (SELECT COUNT(*) FROM messages m WHERE m.intake_id = i.id AND m.direction = 'in') AS inbound
         FROM intakes i LEFT JOIN cases c ON c.id = i.case_id
         WHERE i.created_at >= ? AND i.created_at < ?`,
        start,
        end,
      );
      const groups = new Map();
      for (const r of rows) {
        const g = groups.get(r.k) || {
          key: r.k,
          label: group === 'source' ? LABELS.source[r.k] || r.k : group === 'channel' ? LABELS.channel[r.k] || r.k : r.k,
          messages: 0,
          intakes: 0,
          consultations: 0,
          handled_internally: 0,
          archived: 0,
          cases: 0,
          needed_lawyer: 0,
          multi_lawyer: 0,
          matters: 0,
          answered: 0,
          closed: 0,
          cost_minor: 0,
        };
        g.messages += Number(r.inbound);
        g.intakes++;
        if (r.kind === 'consultation' || r.case_id) g.consultations++;
        if (r.status === 'handled_internally') g.handled_internally++;
        if (r.status === 'archived') g.archived++;
        if (r.case_id) {
          g.cases++;
          if (Number(r.team) > 0) g.needed_lawyer++;
          if (Number(r.team) > 1) g.multi_lawyer++;
          if (r.matter_id) g.matters++;
          if (['answered', 'closed'].includes(r.case_status) || r.outcome) g.answered += r.case_status === 'answered' || r.outcome === 'answered' || r.outcome === 'resolved' ? 1 : 0;
          if (r.case_status === 'closed') g.closed++;
          g.cost_minor += caseCostMinor(r.case_id);
        }
        groups.set(r.k, g);
      }
      const items = [...groups.values()]
        .map((g) => ({
          ...g,
          cost: fromMinor(g.cost_minor),
          cost_per_case: g.cases ? fromMinor(Math.round(g.cost_minor / g.cases)) : null,
          conversion_rate: g.intakes ? Math.round((g.cases / g.intakes) * 1000) / 1000 : 0,
          cost_minor: undefined,
        }))
        .sort((a, b) => b.intakes - a.intakes);
      const sum = (k) => items.reduce((s, x) => s + (x[k] || 0), 0);
      return {
        from: start,
        to: end,
        group,
        items,
        totals: {
          messages: sum('messages'),
          intakes: sum('intakes'),
          consultations: sum('consultations'),
          handled_internally: sum('handled_internally'),
          cases: sum('cases'),
          needed_lawyer: sum('needed_lawyer'),
          multi_lawyer: sum('multi_lawyer'),
          matters: sum('matters'),
          closed: sum('closed'),
          cost: Math.round(sum('cost') * 100) / 100,
        },
      };
    },

    /** توزيع الملفات حسب المجال وحاجتها لأكثر من تخصص */
    byArea() {
      return db
        .all(
          `SELECT c.legal_area, COUNT(*) AS cases, SUM(c.status = 'closed') AS closed,
             SUM((SELECT COUNT(*) FROM assignments a WHERE a.case_id = c.id AND a.status != 'withdrawn') > 1) AS multi,
             SUM(c.matter_id IS NOT NULL) AS matters
           FROM cases c GROUP BY c.legal_area ORDER BY cases DESC`,
        )
        .map((r) => ({ ...r, label: AREA[r.legal_area], cases: Number(r.cases), closed: Number(r.closed), multi: Number(r.multi), matters: Number(r.matters) }));
    },

    /** حجم الطلبات أسبوعيًا (آخر 12 أسبوعًا) لمتابعة أثر الحملات */
    weeklyVolume() {
      const out = [];
      const t = nowIso();
      for (let w = 11; w >= 0; w--) {
        const s = addDays(t, -7 * (w + 1));
        const e = addDays(t, -7 * w);
        out.push({
          week_start: s.slice(0, 10),
          intakes: Number(db.value('SELECT COUNT(*) FROM intakes WHERE created_at >= ? AND created_at < ?', s, e)),
          cases: Number(db.value('SELECT COUNT(*) FROM cases WHERE created_at >= ? AND created_at < ?', s, e)),
          closed: Number(db.value('SELECT COUNT(*) FROM cases WHERE closed_at >= ? AND closed_at < ?', s, e)),
        });
      }
      return out;
    },

    dashboard(user) {
      const t = nowIso();
      const week = addDays(t, 7);
      const q = (sql, ...p) => Number(db.value(sql, ...p));
      const queue = app.requests.queue();
      const period = periodOf(t);
      return {
        intakes: {
          new: q("SELECT COUNT(*) FROM intakes WHERE status = 'new'"),
          in_review: q("SELECT COUNT(*) FROM intakes WHERE status = 'in_review'"),
          awaiting_client: q("SELECT COUNT(*) FROM intakes WHERE status = 'awaiting_client'"),
          today: q('SELECT COUNT(*) FROM intakes WHERE created_at >= ?', addDays(t, -1)),
          urgent: q("SELECT COUNT(*) FROM intakes WHERE status IN ('new','in_review') AND priority IN ('high','urgent')"),
        },
        cases: Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM cases GROUP BY status').map((r) => [r.status, Number(r.n)])),
        open_cases: q("SELECT COUNT(*) FROM cases WHERE status != 'closed'"),
        pending_decisions: {
          info_requests: queue.info_requests.length,
          client_replies: queue.client_replies.length,
          counsel_requests: queue.counsel_requests.length,
          opinions: queue.opinions.length,
          proposed_issues: queue.proposed_issues.length,
          approved_unanswered: queue.approved_unanswered.length,
          identity_conflicts: queue.identity_conflicts.length,
        },
        overdue_assignments: queue.overdue_assignments.length,
        upcoming_events: db.all(
          `SELECT e.id, e.kind, e.title, e.starts_at, e.client_attendance_required, m.id AS matter_id, m.code AS matter_code
           FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE e.status = 'scheduled' AND e.starts_at >= ? AND e.starts_at <= ? ORDER BY e.starts_at LIMIT 10`,
          t,
          week,
        ),
        overdue_invoices: q("SELECT COUNT(*) FROM invoices WHERE status IN ('unpaid','partially_paid') AND due_at < ?", t),
        failed_messages: q("SELECT COUNT(*) FROM messages WHERE direction = 'out' AND status = 'failed'"),
        similar_alerts: db.all(
          `SELECT a.intake_id, a.summary, a.created_at, i.code FROM activity a JOIN intakes i ON i.id = a.intake_id
           WHERE a.type = 'ai.similar_alert' AND i.status IN ('new','in_review','awaiting_client') ORDER BY a.id DESC LIMIT 5`,
        ),
        knowledge_pending: q("SELECT COUNT(*) FROM knowledge_records WHERE status = 'pending_review'"),
        capacity: (() => {
          const l = app.lawyers.list({ period });
          return { ...l.totals, top_loaded: l.items.filter((x) => x.active).sort((a, b) => (b.utilization || 0) - (a.utilization || 0)).slice(0, 5).map((x) => ({ id: x.id, name: x.display_name, open: x.metrics.open_assignments, capacity: x.capacity, overdue: x.metrics.overdue })) };
        })(),
        month: {
          period,
          cases_opened: q('SELECT COUNT(*) FROM cases WHERE substr(created_at, 1, 7) = ?', period),
          cases_closed: q('SELECT COUNT(*) FROM cases WHERE closed_at IS NOT NULL AND substr(closed_at, 1, 7) = ?', period),
          lawyer_cost: fromMinor(q("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE period = ? AND status != 'void'", period)),
          pro_bono: q("SELECT COUNT(*) FROM billable_events WHERE period = ? AND treatment IN ('pro_bono','csr')", period),
        },
        weekly: svc.weeklyVolume(),
        ai: app.ai.status(),
        whatsapp_configured: app.whatsapp.configured,
        user: { name: user.name, role: user.role },
      };
    },
  };
  return svc;
}

/**
 * بيانات بوابة العميل (ما يخصه فقط، بدون أي ملاحظات داخلية أو أسماء محامين).
 * رابط الموقع مقصور على طلب واحد وما تفرع عنه (intakeId)، لأن رقم الهاتف في نموذج الموقع غير موثّق؛
 * أما الرابط الذي ترسله الإدارة لرقم العميل الموثّق فيشمل كل ملفاته.
 */
export function createPortal(app) {
  const { db } = app;

  /** نطاق الوصول: قوائم المعرفات المسموح بها */
  function scopeOf(client, intakeId) {
    if (!intakeId) {
      return {
        full: true,
        intakeIds: db.all('SELECT id FROM intakes WHERE client_id = ?', client.id).map((r) => r.id),
        caseIds: db.all('SELECT id FROM cases WHERE client_id = ?', client.id).map((r) => r.id),
        matterIds: db.all('SELECT id FROM matters WHERE client_id = ?', client.id).map((r) => r.id),
      };
    }
    const intake = db.get('SELECT * FROM intakes WHERE id = ? AND client_id = ?', intakeId, client.id);
    if (!intake) return { full: false, intakeIds: [], caseIds: [], matterIds: [], intake: null };
    const caseIds = intake.case_id ? [intake.case_id] : [];
    const matterIds = caseIds.length ? db.all('SELECT id FROM matters WHERE case_id = ?', caseIds[0]).map((r) => r.id) : [];
    return { full: false, intakeIds: [intake.id], caseIds, matterIds, intake };
  }
  const inList = (ids) => (ids.length ? ids.join(',') : '-1'); // معرفات رقمية من قاعدة البيانات فقط

  const svc = {
    scopeOf,

    /** هل يقع هذا الطلب ضمن نطاق الرابط؟ */
    allowsInfoRequest(client, intakeId, requestId) {
      const sc = scopeOf(client, intakeId);
      const r = db.get('SELECT case_id FROM info_requests WHERE id = ?', requestId);
      return !!r && sc.caseIds.includes(r.case_id);
    },

    /** الوجهة الافتراضية لرسالة جديدة من البوابة */
    targetFor(client, intakeId) {
      if (!intakeId) return {};
      return { target_intake_id: intakeId };
    },

    view(client, intakeId = null) {
      const sc = scopeOf(client, intakeId);
      const clientStatus = (s) =>
        ({ new: 'قيد المراجعة', assigned: 'قيد الدراسة', in_progress: 'قيد الدراسة', under_review: 'قيد المراجعة النهائية', approved: 'جارٍ إعداد الرد', answered: 'تم الرد', closed: 'مغلق' })[s] || 'قيد المتابعة';
      const I = inList(sc.intakeIds);
      const C = inList(sc.caseIds);
      const M = inList(sc.matterIds);
      const cases = db.all(`SELECT id, code, title, status FROM cases WHERE id IN (${C}) ORDER BY id DESC`);
      const msgs = db
        .all(
          `SELECT id, direction, channel, body, created_at FROM messages
           WHERE client_id = ? AND (intake_id IN (${I}) OR case_id IN (${C}) OR matter_id IN (${M})${sc.full ? ' OR (intake_id IS NULL AND case_id IS NULL AND matter_id IS NULL)' : ''})
             AND (direction = 'in' OR status IN ('sent','delivered','read','simulated'))
           ORDER BY id DESC LIMIT 100`,
          client.id,
        )
        .reverse();
      const byMsg = new Map();
      if (msgs.length) {
        const ids = msgs.map((m) => m.id).join(',');
        for (const d of db.all(`SELECT id, message_id, filename FROM documents WHERE message_id IN (${ids}) AND uploaded_by_kind = 'client'`)) {
          if (!byMsg.has(d.message_id)) byMsg.set(d.message_id, []);
          byMsg.get(d.message_id).push({ id: d.id, filename: d.filename });
        }
      }
      return {
        scope: sc.full ? 'client' : 'request',
        client: sc.full
          ? { code: client.code, name: client.name }
          : { code: null, name: sc.intake?.contact_name || null, reference: sc.intake?.code || null },
        cases: cases.map((c) => ({ code: c.code, title: c.title, status: c.status, status_label: clientStatus(c.status) })),
        intakes: db
          .all(`SELECT code, status, created_at FROM intakes WHERE id IN (${I}) AND status IN ('new','in_review','awaiting_client') ORDER BY id DESC`)
          .map((i) => ({ ...i, status_label: i.status === 'awaiting_client' ? 'بانتظار ردك' : 'قيد المراجعة' })),
        requests: db
          .all(
            `SELECT r.id, r.kind, r.client_message, r.status, r.sent_at, c.code AS case_code FROM info_requests r JOIN cases c ON c.id = r.case_id
             WHERE r.case_id IN (${C}) AND r.status IN ('sent_to_client','client_replied') ORDER BY r.id DESC`,
          )
          .map((r) => ({ id: r.id, kind: r.kind, case_code: r.case_code, message: r.client_message, status: r.status, created_at: r.sent_at, can_reply: true })),
        messages: msgs.map((m) => ({ ...m, documents: byMsg.get(m.id) || [] })),
        answers: db.all(
          `SELECT a.id, a.body, a.sent_at, c.code AS case_code FROM client_answers a JOIN cases c ON c.id = a.case_id
           WHERE a.case_id IN (${C}) AND a.status = 'sent' ORDER BY a.id DESC`,
        ),
        events: db.all(
          `SELECT e.id, e.kind, e.title, e.starts_at, e.location, e.client_attendance_required, m.code AS matter_code
           FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE m.id IN (${M}) AND e.status = 'scheduled' AND e.starts_at >= ? ORDER BY e.starts_at`,
          nowIso(),
        ),
        invoices: db
          .all(`SELECT id, number, description, amount_minor, due_at, status FROM invoices WHERE (matter_id IN (${M}) OR case_id IN (${C})) AND status != 'cancelled' ORDER BY id DESC`)
          .map((i) => ({
            number: i.number,
            description: i.description,
            amount: fromMinor(i.amount_minor),
            due_at: i.due_at,
            status: i.status,
            paid_amount: fromMinor(Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?', i.id))),
          })),
      };
    },
  };
  return svc;
}
