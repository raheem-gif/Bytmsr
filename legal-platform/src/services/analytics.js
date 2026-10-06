// التحليلات: مصدر العميل ≠ قناة التواصل. نعرف ليس فقط عدد الرسائل التي أنتجها كل إعلان،
// بل ماذا حدث لها فعليًا: كم تحول لاستشارة، كم احتاج محاميًا، كم صار قضية، كم كلّف، وما النتائج.
import { nowIso, addDays, periodOf, fromMinor, isValidPeriod, badRequest, notFound, conflict, v, normalizePhone } from '../util.js';
import { LABELS, LEGAL_AREAS, ENUMS } from '../constants.js';
import { portalUnverifiedSql, isPortalUnverifiedIntake } from '../channels/engine.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

const SPEND_DUP = 'يوجد سجل إنفاق لنفس الشهر والمصدر والحملة. عدّل السجل القائم بدل إضافة سجل جديد';

function spendFields(body) {
  const period = v.str(body.period, 'الشهر', { required: true, max: 7 });
  if (!isValidPeriod(period)) throw badRequest('الشهر يجب أن يكون بصيغة YYYY-MM');
  return {
    period,
    source: v.oneOf(body.source, ENUMS.source, 'المصدر', { required: true }),
    campaign: v.str(body.campaign, 'الحملة', { max: 150 }) || '',
    amount_minor: v.money(body.amount, 'المبلغ', { required: true, min: 0 }),
    note: v.str(body.note, 'ملاحظة', { max: 300 }),
  };
}

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
      // الإنفاق الإعلاني للأشهر التي تتقاطع مع الفترة (بالمصدر أو الحملة)
      const spendBy = new Map();
      if (group !== 'channel') {
        const p1 = periodOf(start);
        const p2 = periodOf(end);
        for (const r of db.all('SELECT source, campaign, SUM(amount_minor) AS amt FROM ad_spend WHERE period >= ? AND period <= ? GROUP BY source, campaign', p1, p2)) {
          const key = group === 'source' ? r.source : r.campaign || '—';
          spendBy.set(key, (spendBy.get(key) || 0) + Number(r.amt));
        }
        for (const key of spendBy.keys()) {
          if (!groups.has(key)) {
            groups.set(key, {
              key,
              label: group === 'source' ? LABELS.source[key] || key : key,
              messages: 0, intakes: 0, consultations: 0, handled_internally: 0, archived: 0, cases: 0,
              needed_lawyer: 0, multi_lawyer: 0, matters: 0, answered: 0, closed: 0, cost_minor: 0,
            });
          }
        }
      }
      const items = [...groups.values()]
        .map((g) => {
          const spend = spendBy.get(g.key) || 0;
          return {
            ...g,
            cost: fromMinor(g.cost_minor),
            cost_per_case: g.cases ? fromMinor(Math.round(g.cost_minor / g.cases)) : null,
            conversion_rate: g.intakes ? Math.round((g.cases / g.intakes) * 1000) / 1000 : 0,
            ad_spend: group === 'channel' ? null : fromMinor(spend),
            ad_cost_per_intake: spend && g.intakes ? fromMinor(Math.round(spend / g.intakes)) : null,
            ad_cost_per_case: spend && g.cases ? fromMinor(Math.round(spend / g.cases)) : null,
            cost_minor: undefined,
          };
        })
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
          ad_spend: group === 'channel' ? null : Math.round(sum('ad_spend') * 100) / 100,
        },
      };
    },

    // ===== الإنفاق الإعلاني =====
    listSpend({ from_period, to_period } = {}) {
      const p1 = isValidPeriod(from_period) ? from_period : '0000-01';
      const p2 = isValidPeriod(to_period) ? to_period : '9999-12';
      return {
        items: db
          .all(
            `SELECT s.*, u.name AS created_by_name FROM ad_spend s LEFT JOIN users u ON u.id = s.created_by
             WHERE s.period >= ? AND s.period <= ? ORDER BY s.period DESC, s.source, s.campaign`,
            p1,
            p2,
          )
          .map((r) => ({ ...r, amount: fromMinor(r.amount_minor), source_label: LABELS.source[r.source] || r.source })),
        // الحملات المعروفة من الطلبات الواردة (لتطابق أسماء الحملات عند الإدخال)
        campaigns: db.all(
          "SELECT source, campaign, COUNT(*) AS intakes FROM intakes WHERE campaign IS NOT NULL AND campaign != '' GROUP BY source, campaign ORDER BY intakes DESC LIMIT 100",
        ),
      };
    },
    saveSpend(body, actor) {
      const f = spendFields(body);
      // لا نستبدل سجلًا قائمًا بصمت: التعديل يكون من «تعديل» على السجل نفسه
      if (db.get('SELECT 1 FROM ad_spend WHERE period = ? AND source = ? AND campaign = ?', f.period, f.source, f.campaign)) throw conflict(SPEND_DUP);
      const t = nowIso();
      const id = db.insert('ad_spend', { ...f, created_by: actor.id, created_at: t, updated_at: t });
      const r = db.get('SELECT * FROM ad_spend WHERE id = ?', id);
      return { ...r, amount: fromMinor(r.amount_minor) };
    },
    /** تعديل سجل إنفاق بعينه (بما في ذلك الشهر والمصدر والحملة) دون إنشاء سجل ثانٍ */
    updateSpend(id, body) {
      const row = db.get('SELECT * FROM ad_spend WHERE id = ?', id);
      if (!row) throw notFound('السجل غير موجود');
      const f = spendFields({ period: row.period, source: row.source, campaign: row.campaign, amount: fromMinor(row.amount_minor), note: row.note, ...body });
      if (db.get('SELECT 1 FROM ad_spend WHERE period = ? AND source = ? AND campaign = ? AND id != ?', f.period, f.source, f.campaign, id)) throw conflict(SPEND_DUP);
      db.update('ad_spend', id, { ...f, updated_at: nowIso() });
      const r = db.get('SELECT * FROM ad_spend WHERE id = ?', id);
      return { ...r, amount: fromMinor(r.amount_minor) };
    },
    deleteSpend(id) {
      const r = db.get('SELECT id FROM ad_spend WHERE id = ?', id);
      if (!r) throw notFound('السجل غير موجود');
      db.run('DELETE FROM ad_spend WHERE id = ?', id);
      return { ok: true };
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
          urgent: q("SELECT COUNT(*) FROM intakes WHERE status IN ('new','in_review','awaiting_client') AND priority IN ('high','urgent')"),
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
        // v9 practice: زمن أول رد ومستوى الخدمة
        sla: app.practice ? app.practice.slaSummary() : null,
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
        // «متصل» فقط بعد اختبار اتصال ناجح؛ وإلا «مضبوط (لم يُختبر)» أو «فشل آخر اختبار» أو «وضع المحاكاة»
        whatsapp: app.system?.whatsappStatus ? app.system.whatsappStatus() : null,
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
  const samePhone = (a, b) => !!a && !!b && (normalizePhone(a) || a) === (normalizePhone(b) || b);

  /**
   * نطاق الوصول: قوائم المعرفات المسموح بها.
   * phone: رابط صدر بعد الدخول برمز واتساب على هذا الرقم — يقتصر على ما أتى من هذا الرقم نفسه
   * (طلبات رقم التواصل فيها هو نفس الرقم وما تفرع عنها)، فلا يكشف دمج العميل مع ملف آخر ملفات ذلك الملف لصاحب الرقم.
   */
  function scopeOf(client, intakeId, { phone = null } = {}) {
    if (!intakeId) {
      // طلب من نموذج الموقع لم تؤكد الإدارة أن مقدّمه هو صاحب الرقم لا يظهر في بوابة صاحب الرقم
      // (رمز الدخول عبر واتساب أو رابط الإدارة): قد يكون شخصًا آخر أخطأ في كتابة رقمه أو استخدم رقم قريب،
      // فلا تُكشف رسائله ومستنداته وملفه لصاحب الرقم. يتابعه مقدّمه برابط الطلب الذي وصله عند الإرسال.
      const unverified = new Set(
        db.all(`SELECT id FROM intakes WHERE client_id = ? AND ${portalUnverifiedSql()}`, client.id).map((r) => r.id),
      );
      let intakes = db.all('SELECT id, contact_phone, contact_name FROM intakes WHERE client_id = ? ORDER BY id', client.id).filter((r) => !unverified.has(r.id));
      if (phone) intakes = intakes.filter((r) => samePhone(r.contact_phone, phone));
      const allowed = new Set(intakes.map((r) => r.id));
      // رابط الإدارة الكامل يشمل الملفات التي لا طلب لها؛ رابط رمز واتساب يقتصر على ما تفرع عن طلبات الرقم
      const caseAllowed = (intakeRef) => (phone ? allowed.has(intakeRef) : !unverified.has(intakeRef));
      return {
        full: true,
        phone: phone || null,
        intakeIds: [...allowed],
        caseIds: db
          .all('SELECT id, intake_id FROM cases WHERE client_id = ?', client.id)
          .filter((r) => caseAllowed(r.intake_id))
          .map((r) => r.id),
        matterIds: db
          .all('SELECT m.id, c.intake_id FROM matters m JOIN cases c ON c.id = m.case_id WHERE m.client_id = ?', client.id)
          .filter((r) => caseAllowed(r.intake_id))
          .map((r) => r.id),
        latestName: intakes.length ? intakes[intakes.length - 1].contact_name || null : null,
      };
    }
    const intake = db.get('SELECT * FROM intakes WHERE id = ? AND client_id = ?', intakeId, client.id);
    if (!intake) return { full: false, intakeIds: [], caseIds: [], matterIds: [], intake: null };
    const caseIds = intake.case_id ? [intake.case_id] : [];
    const matterIds = caseIds.length ? db.all('SELECT id FROM matters WHERE case_id = ?', caseIds[0]).map((r) => r.id) : [];
    // رابط طلب من الموقع لم تُؤكد هوية مقدّمه: يعرض جانب الموقع والبوابة من المحادثة فقط، لا رسائل واتساب صاحب الرقم
    // (قد يكون صاحب الرقم شخصًا آخر أخطأ مقدّم الطلب في كتابة رقمه؛ رسائله وردود الإدارة عليه لا تخص صاحب الرابط)
    return { full: false, intakeIds: [intake.id], caseIds, matterIds, intake, websiteOnly: isPortalUnverifiedIntake(intake) };
  }
  const inList = (ids) => (ids.length ? ids.join(',') : '-1'); // معرفات رقمية من قاعدة البيانات فقط

  /**
   * الرسائل التي لا تخص طلبًا أو ملفًا (مثل رسالة رابط البوابة): تظهر في الرابط الكامل فقط،
   * ولرابط رمز واتساب ما أُرسل إلى هذا الرقم نفسه فقط.
   */
  function orphanSql(sc, alias = '') {
    const c = (x) => (alias ? `${alias}.${x}` : x);
    if (!sc.full) return { sql: '', params: [] };
    const base = `${c('intake_id')} IS NULL AND ${c('case_id')} IS NULL AND ${c('matter_id')} IS NULL`;
    if (!sc.phone) return { sql: ` OR (${base})`, params: [] };
    return { sql: ` OR (${base} AND ${c('direction')} = 'out' AND ${c('to_address')} = ?)`, params: [sc.phone] };
  }

  const svc = {
    scopeOf,
    orphanSql,

    /** هل يقع هذا الطلب ضمن نطاق الرابط؟ */
    allowsInfoRequest(client, intakeId, requestId, opts = {}) {
      const sc = scopeOf(client, intakeId, opts);
      const r = db.get('SELECT case_id FROM info_requests WHERE id = ?', requestId);
      return !!r && sc.caseIds.includes(r.case_id);
    },

    /** الوجهة الافتراضية لرسالة جديدة من البوابة */
    targetFor(client, intakeId, { phone = null } = {}) {
      if (intakeId) return { target_intake_id: intakeId };
      if (!phone) return {};
      // رابط رمز واتساب: الرسالة تذهب لأحدث طلب أو ملف مفتوح ضمن نطاق الرقم، وإلا تفتح طلبًا جديدًا برقمه
      // (لا يختار المحرك تلقائيًا طلبًا لا يراه صاحب الرابط)
      const sc = scopeOf(client, null, { phone });
      const I = inList(sc.intakeIds);
      const C = inList(sc.caseIds);
      const M = inList(sc.matterIds);
      const open = db.get(`SELECT id FROM intakes WHERE id IN (${I}) AND status IN ('new','in_review','awaiting_client') ORDER BY id DESC LIMIT 1`);
      if (open) return { target_intake_id: open.id };
      const kase = db.get(`SELECT id FROM cases WHERE id IN (${C}) AND status != 'closed' ORDER BY id DESC LIMIT 1`);
      if (kase) return { target_case_id: kase.id };
      const matter = db.get(`SELECT case_id FROM matters WHERE id IN (${M}) AND status != 'closed' ORDER BY id DESC LIMIT 1`);
      if (matter?.case_id) return { target_case_id: matter.case_id };
      return { force_new_intake: true, from_phone: phone };
    },

    view(client, intakeId = null, { phone = null } = {}) {
      const sc = scopeOf(client, intakeId, { phone });
      const clientStatus = (s) =>
        ({ new: 'قيد المراجعة', assigned: 'قيد الدراسة', in_progress: 'قيد الدراسة', under_review: 'قيد المراجعة النهائية', approved: 'جارٍ إعداد الرد', answered: 'تم الرد', closed: 'مغلق' })[s] || 'قيد المتابعة';
      const I = inList(sc.intakeIds);
      const C = inList(sc.caseIds);
      const M = inList(sc.matterIds);
      const cases = db.all(`SELECT id, code, title, status FROM cases WHERE id IN (${C}) ORDER BY id DESC`);
      const orphan = orphanSql(sc);
      const msgs = db
        .all(
          `SELECT id, direction, channel, body, created_at FROM messages
           WHERE client_id = ? AND (intake_id IN (${I}) OR case_id IN (${C}) OR matter_id IN (${M})${orphan.sql})
             ${sc.websiteOnly ? "AND channel = 'website'" : ''}
             AND (direction = 'in' OR status IN ('sent','delivered','read','simulated'))
             AND COALESCE(automation_rule, '') != 'portal_otp'
           ORDER BY id DESC LIMIT 100`,
          client.id,
          ...orphan.params,
        )
        .reverse();
      const byMsg = new Map();
      if (msgs.length) {
        const ids = msgs.map((m) => m.id).join(',');
        for (const d of db.all(`SELECT id, message_id, filename FROM documents WHERE message_id IN (${ids}) AND uploaded_by_kind = 'client'`)) {
          if (!byMsg.has(d.message_id)) byMsg.set(d.message_id, []);
          byMsg.get(d.message_id).push({ id: d.id, filename: d.filename });
        }
        // (v9 messaging) المستندات التي أرسلتها الإدارة للعميل مع رسالة صادرة (تُنزَّل من /api/portal/<token>/documents/<id>)
        for (const d of db.all(`SELECT d.id, ma.message_id, d.filename FROM message_attachments ma JOIN documents d ON d.id = ma.document_id WHERE ma.message_id IN (${ids})`)) {
          if (!byMsg.has(d.message_id)) byMsg.set(d.message_id, []);
          byMsg.get(d.message_id).push({ id: d.id, filename: d.filename, sent: true });
        }
      }
      return {
        scope: sc.full ? 'client' : 'request',
        client: !sc.full
          ? { code: null, name: sc.intake?.contact_name || null, reference: sc.intake?.code || null }
          : sc.phone && Number(db.value("SELECT COUNT(*) FROM client_identities WHERE client_id = ? AND kind = 'phone'", client.id)) > 1
            ? // ملف عميل بأكثر من رقم (قد يكون دمجًا لملفين): لا نعرض اسم الملف وكوده لصاحب هذا الرقم، بل الاسم الذي كتبه هو
              { code: null, name: sc.latestName || null }
            : { code: client.code, name: client.name },
        cases: cases.map((c) => ({ code: c.code, title: c.title, status: c.status, status_label: clientStatus(c.status) })),
        intakes: db
          .all(`SELECT code, status, created_at FROM intakes WHERE id IN (${I}) AND status IN ('new','in_review','awaiting_client') ORDER BY id DESC`)
          .map((i) => ({ ...i, status_label: i.status === 'awaiting_client' ? 'بانتظار ردك' : 'قيد المراجعة' })),
        requests: db
          .all(
            `SELECT r.id, r.kind, r.client_message, r.status, r.sent_at, c.code AS case_code FROM info_requests r JOIN cases c ON c.id = r.case_id
             WHERE r.case_id IN (${C}) AND r.status IN ('sent_to_client','client_replied') ORDER BY r.id DESC`,
          )
          .map((r) => ({ id: r.id, kind: r.kind, case_code: r.case_code, message: r.client_message, status: r.status, created_at: r.sent_at, can_reply: r.status === 'sent_to_client' })),
        messages: msgs.map((m) => ({ ...m, documents: byMsg.get(m.id) || [] })),
        answers: db.all(
          `SELECT a.id, a.body, a.sent_at, c.code AS case_code FROM client_answers a JOIN cases c ON c.id = a.case_id
           WHERE a.case_id IN (${C}) AND a.status = 'sent' ORDER BY a.id DESC`,
        ),
        // نص الموعد الذي كتبه المحامي لا يظهر للعميل قبل اعتماد الإدارة: نعرض نوع الموعد والمحكمة فقط
        events: db
          .all(
            `SELECT e.id, e.kind, e.title, e.starts_at, e.location, e.client_attendance_required, e.client_text_approved, m.code AS matter_code, m.court
             FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE m.id IN (${M}) AND e.status = 'scheduled' AND e.starts_at >= ? ORDER BY e.starts_at`,
            nowIso(),
          )
          .map(({ client_text_approved, court, ...e }) =>
            client_text_approved ? e : { ...e, title: LABELS.event_kind[e.kind] || e.title, location: court || null },
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
