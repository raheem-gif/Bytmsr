// ملفات الاستشارات: الإنشاء من الطلب الوارد، المسائل، المستندات، فريق العمل والصلاحيات، الإغلاق وإعادة الفتح.
import { nowIso, addDays, cairoYear, parseJson, badRequest, notFound, conflict, v, truncate } from '../util.js';
import { LABELS, LEGAL_AREAS, AREA_CODES, ENUMS } from '../constants.js';
import { mapMessage } from '../channels/engine.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const OPEN_ASSIGNMENT = ['assigned', 'in_progress', 'submitted', 'returned'];

export function createCases(app) {
  const { db } = app;

  function nextCaseCode(area, iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`case:${area}:${y}`, 1);
    return `${area}-${y}-${String(n).padStart(5, '0')}`;
  }

  function lawyerName(userId) {
    const r = db.get('SELECT u.name, l.title FROM users u LEFT JOIN lawyers l ON l.user_id = u.id WHERE u.id = ?', userId);
    return r ? `${r.title || ''} ${r.name}`.trim() : '';
  }

  const svc = {
    nextCaseCode,
    lawyerName,

    require(caseId) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) throw notFound('الملف غير موجود');
      return c;
    },
    requireOpen(caseId) {
      const c = svc.require(caseId);
      if (c.status === 'closed') throw conflict('الملف مغلق. أعد فتحه أولًا إذا لزم الأمر.');
      return c;
    },

    /** إنشاء ملف جديد (يُستدعى من تحويل الطلب الوارد) */
    createFromIntake(intake, body, actor) {
      const area = v.oneOf(body.legal_area, AREA_CODES, 'المجال القانوني', { required: true });
      const title = v.str(body.title, 'عنوان الملف', { required: true, max: 200 });
      const t = nowIso();
      const id = db.insert('cases', {
        code: nextCaseCode(area, t),
        client_id: intake.client_id,
        intake_id: intake.id,
        legal_area: area,
        title,
        facts_internal: v.str(body.facts_internal, 'الوقائع الداخلية', { max: 20000 }),
        facts_shared: v.str(body.facts_shared, 'ملخص الوقائع للمحامي', { max: 20000 }),
        status: 'new',
        priority: v.oneOf(body.priority, ENUMS.priority, 'الأولوية') || intake.priority || 'normal',
        case_manager_id: v.int(body.case_manager_id, 'مدير الحالة', { min: 1 }) ?? actor.id,
        due_at: v.iso(body.due_at, 'الموعد المستهدف'),
        source: intake.source,
        channel: intake.first_channel,
        campaign: intake.campaign,
        created_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      if (body.case_manager_id) {
        const cm = db.get("SELECT id FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", body.case_manager_id);
        if (!cm) throw badRequest('مدير الحالة المختار غير صالح');
      }
      const issues = Array.isArray(body.issues) ? body.issues : [];
      issues.forEach((i, idx) => {
        db.insert('case_issues', {
          case_id: id,
          number: idx + 1,
          title: v.str(i.title, 'عنوان المسألة', { required: true, max: 300 }),
          details: v.str(i.details, 'تفاصيل المسألة', { max: 3000 }),
          legal_area: v.oneOf(i.legal_area, AREA_CODES, 'مجال المسألة') || area,
          origin: i.origin === 'ai' ? 'ai' : 'staff',
          status: 'active',
          created_at: t,
        });
      });
      // كل ما وصل في مرحلة الطلب ينتقل إلى الملف
      db.run('UPDATE documents SET case_id = ? WHERE intake_id = ? AND case_id IS NULL', id, intake.id);
      db.run('UPDATE messages SET case_id = ? WHERE intake_id = ? AND case_id IS NULL', id, intake.id);
      return svc.require(id);
    },

    /** حساب حالة الملف من واقع فريق العمل والآراء (بدل تخزين حالة قد تنحرف عن الواقع) */
    refreshStatus(caseId) {
      const c = svc.require(caseId);
      if (c.status === 'closed') return 'closed';
      const assignments = db.all("SELECT * FROM assignments WHERE case_id = ? AND status != 'withdrawn' ORDER BY id", caseId);
      // المحامي الأساسي يحدد الحالة. إن سُحب ولم يُعيَّن بديل فالملف يحتاج محاميًا أساسيًا جديدًا،
      // ولا تُستنتج حالته من اعتماد رأي متخصص فرعي
      const lead = assignments.filter((a) => a.role === 'lead').pop();
      const hadLead = !lead && !!db.get("SELECT 1 FROM assignments WHERE case_id = ? AND role = 'lead'", caseId);
      const primary = lead || (hadLead ? null : assignments[0]) || null;
      const answered = db.get("SELECT 1 FROM client_answers WHERE case_id = ? AND status = 'sent'", caseId);
      let status;
      if (!primary) status = answered ? 'answered' : 'new';
      else if (primary.status === 'approved') status = answered ? 'answered' : 'approved';
      else if (primary.status === 'submitted') status = 'under_review';
      else if (assignments.some((a) => a.first_opened_at)) status = 'in_progress';
      else status = 'assigned';
      // ملف تم الرد فيه على العميل ثم استمر العمل عليه (من أي عضو في الفريق) لا يبقى «تم الرد» حتى تكتمل الدورة
      if (answered) {
        if (assignments.some((a) => a.status === 'submitted')) status = 'under_review';
        else if (assignments.some((a) => ['assigned', 'in_progress', 'returned'].includes(a.status))) status = 'in_progress';
      }
      if (status !== c.status) db.update('cases', caseId, { status, updated_at: nowIso() });
      return status;
    },

    list({ status, area, lawyer_id, q, priority, manager_id, scope, limit = 100, offset = 0 } = {}) {
      const where = ['1=1'];
      const params = [];
      if (status && ENUMS.case_status.includes(status)) {
        where.push('c.status = ?');
        params.push(status);
      } else if (scope === 'open') where.push("c.status != 'closed'");
      if (area && AREA_CODES.includes(area)) {
        where.push('c.legal_area = ?');
        params.push(area);
      }
      if (priority && ENUMS.priority.includes(priority)) {
        where.push('c.priority = ?');
        params.push(priority);
      }
      if (manager_id) {
        where.push('c.case_manager_id = ?');
        params.push(Number(manager_id));
      }
      if (lawyer_id) {
        where.push("EXISTS (SELECT 1 FROM assignments a WHERE a.case_id = c.id AND a.lawyer_id = ? AND a.status != 'withdrawn')");
        params.push(Number(lawyer_id));
      }
      if (q) {
        where.push('(c.code LIKE ? OR c.title LIKE ? OR cl.name LIKE ? OR cl.code LIKE ?)');
        const like = `%${String(q).trim()}%`;
        params.push(like, like, like, like);
      }
      const t = nowIso();
      const sql = `FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE ${where.join(' AND ')}`;
      const rows = db.all(
        `SELECT c.*, cl.code AS client_code, cl.name AS client_name, m.name AS manager_name,
           (SELECT u.name FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = c.id AND a.role = 'lead' AND a.status != 'withdrawn' ORDER BY a.id DESC LIMIT 1) AS lead_name,
           (SELECT COUNT(*) FROM assignments a WHERE a.case_id = c.id AND a.status != 'withdrawn') AS team_size,
           (SELECT COUNT(*) FROM info_requests r WHERE r.case_id = c.id AND r.status IN ('pending_admin','client_replied')) AS pending_info,
           (SELECT COUNT(*) FROM counsel_requests r WHERE r.case_id = c.id AND r.status = 'pending_admin') AS pending_counsel,
           (SELECT COUNT(*) FROM opinions o WHERE o.case_id = c.id AND o.status = 'submitted') AS pending_opinions,
           (SELECT COUNT(*) FROM assignments a WHERE a.case_id = c.id AND a.status IN ('assigned','in_progress','returned') AND a.due_at < ?) AS overdue_assignments
         ${sql.replace('JOIN clients cl ON cl.id = c.client_id', 'JOIN clients cl ON cl.id = c.client_id LEFT JOIN users m ON m.id = c.case_manager_id')}
         ORDER BY CASE c.status WHEN 'closed' THEN 1 ELSE 0 END, CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, c.id DESC
         LIMIT ? OFFSET ?`,
        t,
        ...params,
        Math.min(Number(limit) || 100, 500),
        Number(offset) || 0,
      );
      const total = Number(db.value(`SELECT COUNT(*) ${sql}`, ...params));
      return {
        total,
        items: rows.map((r) => ({
          id: r.id,
          code: r.code,
          title: r.title,
          legal_area: r.legal_area,
          status: r.status,
          priority: r.priority,
          client_code: r.client_code,
          client_name: r.client_name,
          manager_name: r.manager_name,
          lead_name: r.lead_name,
          team_size: Number(r.team_size),
          pending_actions: Number(r.pending_info) + Number(r.pending_counsel) + Number(r.pending_opinions),
          overdue_assignments: Number(r.overdue_assignments),
          unread_count: r.unread_count,
          source: r.source,
          channel: r.channel,
          matter_id: r.matter_id,
          due_at: r.due_at,
          created_at: r.created_at,
          closed_at: r.closed_at,
          outcome: r.outcome,
        })),
      };
    },

    /** الملف الكامل للإدارة */
    detail(caseId) {
      const c = svc.require(caseId);
      const client = app.clients.get(c.client_id);
      const intake = c.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null;
      const documents = db.all('SELECT * FROM documents WHERE case_id = ? ORDER BY id', c.id).map((d) => ({
        ...app.documents.publicView(d),
        info_request_id: d.info_request_id,
        message_id: d.message_id,
      }));
      const docsByMessage = new Map();
      for (const d of db.all('SELECT * FROM documents WHERE message_id IS NOT NULL AND (case_id = ? OR intake_id = ?)', c.id, c.intake_id ?? -1)) {
        if (!docsByMessage.has(d.message_id)) docsByMessage.set(d.message_id, []);
        docsByMessage.get(d.message_id).push(app.documents.publicView(d));
      }
      const messages = db
        .all(
          `SELECT m.*, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_user_id
           WHERE m.case_id = ? OR (? IS NOT NULL AND m.intake_id = ?) ORDER BY m.id`,
          c.id,
          c.intake_id,
          c.intake_id,
        )
        .map((m) => mapMessage(m, docsByMessage));

      const assignments = db
        .all(
          `SELECT a.*, u.name AS lawyer_name, l.title AS lawyer_title, l.specialties, l.agreement
           FROM assignments a JOIN users u ON u.id = a.lawyer_id LEFT JOIN lawyers l ON l.user_id = a.lawyer_id
           WHERE a.case_id = ? ORDER BY a.id`,
          c.id,
        )
        .map((a) => {
          const be = db.get('SELECT * FROM billable_events WHERE assignment_id = ?', a.id);
          return {
            id: a.id,
            lawyer_id: a.lawyer_id,
            lawyer_name: `${a.lawyer_title || ''} ${a.lawyer_name}`.trim(),
            specialties: parseJson(a.specialties, []),
            agreement_type: parseJson(a.agreement, {}).type || null,
            role: a.role,
            status: a.status,
            brief: a.brief,
            due_at: a.due_at,
            fee_mode: a.fee_mode,
            fee_amount: a.fee_amount_minor !== null ? a.fee_amount_minor / 100 : null,
            hours_spent: a.hours_spent,
            counsel_request_id: a.counsel_request_id,
            assigned_at: a.assigned_at,
            first_opened_at: a.first_opened_at,
            submitted_at: a.submitted_at,
            approved_at: a.approved_at,
            grants: app.visibility.grantsPublic(a.id),
            billing: be
              ? { treatment: be.treatment, amount: be.amount_minor / 100, notional: be.notional_minor / 100, period: be.period, trigger: be.trigger }
              : null,
          };
        });

      const infoRequests = db
        .all(
          `SELECT r.*, u.name AS requested_by_name FROM info_requests r LEFT JOIN users u ON u.id = r.requested_by
           WHERE r.case_id = ? ORDER BY r.id`,
          c.id,
        )
        .map((r) => ({
          ...r,
          documents: db.all('SELECT * FROM documents WHERE info_request_id = ?', r.id).map((d) => app.documents.publicView(d)),
        }));
      const counselRequests = db
        .all(
          `SELECT r.*, u.name AS requester_name FROM counsel_requests r
           JOIN assignments ra ON ra.id = r.requester_assignment_id JOIN users u ON u.id = ra.lawyer_id
           WHERE r.case_id = ? ORDER BY r.id`,
          c.id,
        )
        .map((r) => ({ ...r, issue_ids: parseJson(r.issue_ids, []), document_ids: parseJson(r.document_ids, []) }));
      const opinions = db
        .all(
          `SELECT o.*, a.role, a.lawyer_id, u.name AS lawyer_name, r.name AS reviewer_name FROM opinions o
           JOIN assignments a ON a.id = o.assignment_id JOIN users u ON u.id = a.lawyer_id
           LEFT JOIN users r ON r.id = o.reviewed_by WHERE o.case_id = ? AND o.status != 'draft' ORDER BY o.id`,
          c.id,
        );
      const clientAnswers = db.all('SELECT * FROM client_answers WHERE case_id = ? ORDER BY id', c.id);
      const issues = db.all(
        `SELECT i.*, u.name AS proposed_by_name FROM case_issues i LEFT JOIN users u ON u.id = i.proposed_by_user_id
         WHERE i.case_id = ? ORDER BY i.number`,
        c.id,
      );
      const matter = c.matter_id ? db.get('SELECT id, code, title, status FROM matters WHERE id = ?', c.matter_id) : null;
      const knowledge = db.get('SELECT id, status, usage FROM knowledge_records WHERE case_id = ?', c.id) || null;
      const aiIntake = intake ? app.ai.latest('intake', intake.id, 'intake_analysis') : null;
      const aiIssues = app.ai.latest('case', c.id, 'issues');
      const similarText = [c.title, c.facts_shared, c.facts_internal].filter(Boolean).join('\n');

      return {
        case: {
          ...c,
          legal_area_label: AREA[c.legal_area],
          case_manager_name: c.case_manager_id ? db.value('SELECT name FROM users WHERE id = ?', c.case_manager_id) ?? null : null,
        },
        client: client ? { ...client, phone: app.clients.primaryPhone(client.id), identities: app.clients.identities(client.id) } : null,
        intake: intake
          ? { id: intake.id, code: intake.code, source: intake.source, campaign: intake.campaign, first_channel: intake.first_channel, channels: parseJson(intake.channels, []), source_detail: parseJson(intake.source_detail, {}), created_at: intake.created_at }
          : null,
        issues,
        documents,
        messages,
        assignments,
        info_requests: infoRequests,
        counsel_requests: counselRequests,
        opinions,
        client_answers: clientAnswers,
        matter,
        knowledge,
        cost: app.accounting.caseCost(c.id),
        activity: app.activity.forCase(c.id, c.intake_id),
        ai: {
          intake_analysis: aiIntake,
          issues: aiIssues,
          similar: app.ai.similar(similarText, { scope: 'staff', excludeCaseId: c.id, limit: 8, area: c.legal_area }),
          status: app.ai.status(),
        },
      };
    },

    update(caseId, body, actor) {
      const c = svc.require(caseId);
      const patch = { updated_at: nowIso() };
      if (body.title !== undefined) patch.title = v.str(body.title, 'عنوان الملف', { required: true, max: 200 });
      if (body.facts_internal !== undefined) patch.facts_internal = v.str(body.facts_internal, 'الوقائع الداخلية', { max: 20000 });
      if (body.facts_shared !== undefined) patch.facts_shared = v.str(body.facts_shared, 'ملخص الوقائع للمحامي', { max: 20000 });
      if (body.priority !== undefined) patch.priority = v.oneOf(body.priority, ENUMS.priority, 'الأولوية', { required: true });
      if (body.due_at !== undefined) patch.due_at = v.iso(body.due_at, 'الموعد المستهدف');
      if (body.case_manager_id !== undefined) {
        const id = v.int(body.case_manager_id, 'مدير الحالة', { min: 1 });
        if (id && !db.get("SELECT 1 FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", id)) throw badRequest('مدير الحالة المختار غير صالح');
        patch.case_manager_id = id;
      }
      if (body.legal_area !== undefined) {
        const area = v.oneOf(body.legal_area, AREA_CODES, 'المجال القانوني', { required: true });
        // الكود يبقى كما هو (معرف ثابت للملف)، والمجال يُصحَّح للتقارير والمعرفة
        patch.legal_area = area;
      }
      db.update('cases', c.id, patch);
      const changed = Object.keys(patch).filter((k) => k !== 'updated_at');
      if (changed.length) {
        app.activity.log({
          case_id: c.id,
          actor,
          type: 'case.updated',
          summary: `تم تحديث بيانات الملف (${changed.map((k) => FIELD_LABELS[k] || k).join('، ')})`,
          data: { fields: changed },
        });
      }
      if (patch.facts_shared !== undefined && patch.facts_shared !== c.facts_shared) {
        // إبلاغ أعضاء الفريق الذين يرون الوقائع بتحديثها
        const ids = db
          .all(
            `SELECT DISTINCT a.lawyer_id FROM assignments a JOIN assignment_grants g ON g.assignment_id = a.id
             WHERE a.case_id = ? AND g.resource = 'facts' AND a.status IN ('assigned','in_progress','returned','submitted')`,
            c.id,
          )
          .map((r) => r.lawyer_id);
        const assignmentsByLawyer = new Map(db.all('SELECT id, lawyer_id FROM assignments WHERE case_id = ?', c.id).map((a) => [a.lawyer_id, a.id]));
        for (const lid of ids) {
          app.notifications.notify(lid, {
            type: 'case.facts_updated',
            title: `تم تحديث ملخص الوقائع في الملف ${c.code}`,
            link: `#/my/assignments/${assignmentsByLawyer.get(lid)}`,
          });
        }
      }
      return svc.require(c.id);
    },

    markRead(caseId) {
      db.run('UPDATE cases SET unread_count = 0 WHERE id = ?', caseId);
    },

    // ===== المسائل =====
    addIssue(caseId, body, actor) {
      const c = svc.requireOpen(caseId);
      const number = Number(db.value('SELECT COALESCE(MAX(number), 0) + 1 FROM case_issues WHERE case_id = ?', c.id));
      const id = db.insert('case_issues', {
        case_id: c.id,
        number,
        title: v.str(body.title, 'عنوان المسألة', { required: true, max: 300 }),
        details: v.str(body.details, 'تفاصيل المسألة', { max: 3000 }),
        legal_area: v.oneOf(body.legal_area, AREA_CODES, 'مجال المسألة') || c.legal_area,
        origin: body.origin === 'ai' ? 'ai' : 'staff',
        status: 'active',
        created_at: nowIso(),
      });
      app.activity.log({ case_id: c.id, actor, type: 'issue.added', summary: `أضافت الإدارة المسألة رقم ${number}` });
      if (body.origin === 'ai' && body.suggestion_id) {
        app.ai.recordFeedback({ suggestion_id: Number(body.suggestion_id), entity_type: 'case', entity_id: c.id, case_id: c.id, field: 'issues', verdict: 'accepted', ai_value: body.title, final_value: body.title, actor });
      }
      return db.get('SELECT * FROM case_issues WHERE id = ?', id);
    },

    updateIssue(caseId, issueId, body, actor) {
      const c = svc.require(caseId);
      const issue = db.get('SELECT * FROM case_issues WHERE id = ? AND case_id = ?', issueId, c.id);
      if (!issue) throw notFound('المسألة غير موجودة');
      const patch = {};
      if (body.title !== undefined) patch.title = v.str(body.title, 'عنوان المسألة', { required: true, max: 300 });
      if (body.details !== undefined) patch.details = v.str(body.details, 'تفاصيل المسألة', { max: 3000 });
      if (body.legal_area !== undefined) patch.legal_area = v.oneOf(body.legal_area, AREA_CODES, 'مجال المسألة', { required: true });
      if (body.status !== undefined) patch.status = v.oneOf(body.status, ['active', 'dropped'], 'حالة المسألة', { required: true });
      db.update('case_issues', issue.id, patch);
      if (patch.status === 'active' && issue.status === 'proposed') {
        // اعتماد مسألة اقترحها محامٍ: تُتاح له تلقائيًا
        const prop = db.get("SELECT id FROM assignments WHERE case_id = ? AND lawyer_id = ? AND status != 'withdrawn'", c.id, issue.proposed_by_user_id);
        if (prop) app.visibility.addGrant(prop.id, 'issue', issue.id, actor);
        app.activity.log({ case_id: c.id, actor, type: 'issue.accepted', summary: `اعتمدت الإدارة المسألة رقم ${issue.number} التي اقترحها المحامي` });
        if (issue.proposed_by_user_id) {
          app.notifications.notify(issue.proposed_by_user_id, {
            type: 'issue.accepted',
            title: `اعتُمدت المسألة التي اقترحتها في الملف ${c.code}`,
            link: prop ? `#/my/assignments/${prop.id}` : null,
          });
        }
      } else if (patch.status === 'dropped') {
        db.run("DELETE FROM assignment_grants WHERE resource = 'issue' AND resource_id = ?", issue.id);
        app.activity.log({ case_id: c.id, actor, type: 'issue.dropped', summary: `استُبعدت المسألة رقم ${issue.number}` });
      } else {
        app.activity.log({ case_id: c.id, actor, type: 'issue.updated', summary: `تم تعديل المسألة رقم ${issue.number}` });
      }
      return db.get('SELECT * FROM case_issues WHERE id = ?', issue.id);
    },

    /** المحامي يقترح مسألة جديدة اكتشفها؛ تعتمدها الإدارة */
    proposeIssue(assignmentId, lawyer, body) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      const c = svc.requireOpen(a.case_id);
      const number = Number(db.value('SELECT COALESCE(MAX(number), 0) + 1 FROM case_issues WHERE case_id = ?', c.id));
      const id = db.insert('case_issues', {
        case_id: c.id,
        number,
        title: v.str(body.title, 'عنوان المسألة', { required: true, max: 300 }),
        details: v.str(body.details, 'تفاصيل المسألة', { max: 3000 }),
        legal_area: v.oneOf(body.legal_area, AREA_CODES, 'مجال المسألة') || c.legal_area,
        origin: 'lawyer',
        proposed_by_user_id: lawyer.id,
        status: 'proposed',
        created_at: nowIso(),
      });
      app.activity.log({ case_id: c.id, actor: lawyer, type: 'issue.proposed', summary: `اقترح ${lawyer.name} مسألة جديدة (رقم ${number})` });
      app.notifications.notifyStaff(
        { type: 'issue.proposed', title: `مسألة جديدة مقترحة من المحامي في الملف ${c.code}`, body: truncate(body.title, 120), link: `#/cases/${c.id}` },
        { caseManagerId: c.case_manager_id },
      );
      return db.get('SELECT * FROM case_issues WHERE id = ?', id);
    },

    // ===== المستندات =====
    addDocuments(caseId, files, actor, { title } = {}) {
      const c = svc.require(caseId);
      const ids = app.documents.saveMany(files, { client_id: c.client_id, case_id: c.id, intake_id: c.intake_id, title }, actor, { max: 10 });
      app.activity.log({ case_id: c.id, actor, type: 'documents.added', summary: `أضافت الإدارة مستندات إلى الملف (العدد: ${ids.length})` });
      return ids.map((id) => app.documents.publicView(app.documents.get(id)));
    },

    // ===== فريق العمل =====
    /**
     * إسناد محامٍ للملف مع تحديد الدور والسؤال المطلوب والمدة والأتعاب والصلاحيات.
     * body: { lawyer_id, role, brief, due_at, fee_mode, fee_amount, grants, counsel_request_id }
     */
    assign(caseId, body, actor) {
      const c = svc.requireOpen(caseId);
      const lawyerId = v.int(body.lawyer_id, 'المحامي', { required: true, min: 1 });
      const lawyer = db.get(
        "SELECT u.*, l.specialties, l.capacity, l.agreement FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ? AND u.role = 'lawyer'",
        lawyerId,
      );
      if (!lawyer) throw badRequest('المحامي المختار غير موجود');
      if (!lawyer.active) throw badRequest('حساب هذا المحامي موقوف');
      const role = v.oneOf(body.role, ENUMS.assignment_role, 'الدور', { required: true });
      const feeMode = v.oneOf(body.fee_mode, ENUMS.fee_mode, 'طريقة الأتعاب') || 'agreement';
      const feeMinor = feeMode === 'custom' ? v.money(body.fee_amount, 'مبلغ الأتعاب', { required: true }) : null;
      const settings = app.settings.all();
      const dueAt = v.iso(body.due_at, 'موعد التسليم') || addDays(nowIso(), Number(settings.default_assignment_days) || 3);
      const brief = v.str(body.brief, 'السؤال المطلوب تحديدًا', { max: 5000 });
      if (role === 'lead') {
        const lead = db.get("SELECT id FROM assignments WHERE case_id = ? AND role = 'lead' AND status != 'withdrawn'", c.id);
        if (lead) throw conflict('يوجد محامٍ أساسي بالفعل لهذا الملف. اسحب الإسناد الحالي أو أعد فتح مهمته، أو اختر دورًا آخر.');
      }
      const existing = db.get('SELECT * FROM assignments WHERE case_id = ? AND lawyer_id = ?', c.id, lawyerId);
      if (existing && existing.status !== 'withdrawn') throw conflict('هذا المحامي عضو بالفعل في فريق الملف');

      const warnings = [];
      const open = Number(
        db.value(
          `SELECT COUNT(*) FROM assignments a JOIN cases c ON c.id = a.case_id
           WHERE a.lawyer_id = ? AND a.status IN ('assigned','in_progress','submitted','returned') AND c.status != 'closed'`,
          lawyerId,
        ),
      );
      if (open >= lawyer.capacity) warnings.push(`تنبيه: الإسنادات المفتوحة لدى هذا المحامي (${open}) بلغت طاقته المحددة (${lawyer.capacity}) أو تجاوزتها.`);
      const specs = parseJson(lawyer.specialties, []);
      const neededArea = body.specialty || c.legal_area;
      if (!specs.includes(neededArea)) warnings.push(`تنبيه: تخصصات المحامي المسجلة لا تشمل «${AREA[neededArea]}».`);

      const t = nowIso();
      const assignmentId = db.tx(() => {
        let id;
        const row = {
          role,
          counsel_request_id: body.counsel_request_id ?? null,
          brief,
          due_at: dueAt,
          status: 'assigned',
          fee_mode: feeMode,
          fee_amount_minor: feeMinor,
          hours_spent: null,
          assigned_by: actor.id,
          assigned_at: t,
          first_opened_at: null,
          submitted_at: null,
          first_submitted_at: null,
          approved_at: null,
          withdrawn_at: null,
          last_activity_at: t,
        };
        if (existing) {
          // إعادة إسناد محامٍ سبق سحبه من نفس الملف
          db.update('assignments', existing.id, row);
          db.run('DELETE FROM assignment_grants WHERE assignment_id = ?', existing.id);
          id = existing.id;
        } else {
          id = db.insert('assignments', { case_id: c.id, lawyer_id: lawyerId, ...row });
        }
        const grants = body.grants ?? app.visibility.defaultGrants(c.id, role);
        app.visibility.setGrants(id, grants, actor);
        return id;
      });

      app.activity.log({
        case_id: c.id,
        actor,
        type: 'assignment.created',
        summary: `أُسند الملف إلى ${lawyerName(lawyerId)} — الدور: «${LABELS.assignment_role[role]}»`,
        data: { assignment_id: assignmentId, lawyer_id: lawyerId, role },
      });
      app.notifications.notify(lawyerId, {
        type: 'assignment.new',
        title: `أُسند إليك الملف ${c.code}`,
        body: brief ? truncate(brief, 160) : truncate(c.title, 160),
        link: `#/my/assignments/${assignmentId}`,
      });
      svc.refreshStatus(c.id);
      return { assignment: db.get('SELECT * FROM assignments WHERE id = ?', assignmentId), warnings };
    },

    updateAssignment(assignmentId, body, actor) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) throw notFound('الإسناد غير موجود');
      svc.requireOpen(a.case_id);
      const patch = {};
      if (body.brief !== undefined) patch.brief = v.str(body.brief, 'السؤال المطلوب تحديدًا', { max: 5000 });
      if (body.due_at !== undefined) patch.due_at = v.iso(body.due_at, 'موعد التسليم');
      if (body.fee_mode !== undefined || body.fee_amount !== undefined) {
        if (db.get('SELECT 1 FROM billable_events WHERE assignment_id = ?', a.id)) {
          throw conflict('لا يمكن تعديل الأتعاب بعد تسجيل واقعة الاستحقاق لهذا الإسناد');
        }
        const mode = v.oneOf(body.fee_mode ?? a.fee_mode, ENUMS.fee_mode, 'طريقة الأتعاب', { required: true });
        patch.fee_mode = mode;
        patch.fee_amount_minor = mode === 'custom' ? v.money(body.fee_amount, 'مبلغ الأتعاب', { required: true }) : null;
      }
      db.update('assignments', a.id, patch);
      app.activity.log({ case_id: a.case_id, actor, type: 'assignment.updated', summary: `تم تعديل بيانات إسناد ${lawyerName(a.lawyer_id)}` });
      if (patch.due_at || patch.brief) {
        app.notifications.notify(a.lawyer_id, {
          type: 'assignment.updated',
          title: `تم تحديث تكليفك في الملف ${svc.require(a.case_id).code}`,
          link: `#/my/assignments/${a.id}`,
        });
      }
      return db.get('SELECT * FROM assignments WHERE id = ?', a.id);
    },

    setGrants(assignmentId, grants, actor) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) throw notFound('الإسناد غير موجود');
      const before = app.visibility.grantsPublic(a.id);
      const after = app.visibility.setGrants(a.id, grants, actor);
      app.activity.log({
        case_id: a.case_id,
        actor,
        type: 'grants.updated',
        summary: `تم تحديث ما يمكن أن يطّلع عليه ${lawyerName(a.lawyer_id)}`,
        data: { before, after },
      });
      const c = svc.require(a.case_id);
      app.notifications.notify(a.lawyer_id, {
        type: 'grants.updated',
        title: `تم تحديث المحتوى المتاح لك في الملف ${c.code}`,
        link: `#/my/assignments/${a.id}`,
      });
      return after;
    },

    withdraw(assignmentId, actor, { note } = {}) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) throw notFound('الإسناد غير موجود');
      if (a.status === 'withdrawn') throw conflict('الإسناد مسحوب بالفعل');
      if (a.status === 'approved') throw conflict('لا يمكن سحب إسناد اعتُمد رأيه بالفعل');
      const t = nowIso();
      db.tx(() => {
        db.update('assignments', a.id, { status: 'withdrawn', withdrawn_at: t });
        db.run("UPDATE info_requests SET status = 'cancelled', updated_at = ? WHERE assignment_id = ? AND status = 'pending_admin'", t, a.id);
        db.run("UPDATE counsel_requests SET status = 'cancelled', updated_at = ? WHERE requester_assignment_id = ? AND status = 'pending_admin'", t, a.id);
        db.run("UPDATE opinions SET status = 'superseded', updated_at = ? WHERE assignment_id = ? AND status = 'submitted'", t, a.id);
        // إزالة إتاحة آراء هذا العضو لغيره
        db.run("DELETE FROM assignment_grants WHERE resource = 'opinion' AND resource_id = ?", a.id);
        if (a.counsel_request_id) {
          db.run("UPDATE counsel_requests SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'assigned'", t, a.counsel_request_id);
        }
      });
      const c = svc.require(a.case_id);
      app.activity.log({ case_id: a.case_id, actor, type: 'assignment.withdrawn', summary: `سُحب الإسناد من ${lawyerName(a.lawyer_id)}${note ? `: ${note}` : ''}` });
      app.notifications.notify(a.lawyer_id, { type: 'assignment.withdrawn', title: `لم يعد الملف ${c.code} مسندًا إليك`, body: note || null });
      svc.refreshStatus(a.case_id);
    },

    /**
     * إعادة فتح إسناد محامٍ اعتُمد رأيه (مثل متابعة بعد إعادة فتح الملف): يعود الإسناد إليه بنسخة عمل جديدة
     * تبدأ من آخر رأي معتمد. لا تُسجَّل أتعاب جديدة تلقائيًا (الاستحقاق مرة واحدة لكل إسناد؛ أي أتعاب إضافية تُضاف كقيد يدوي).
     */
    reengage(assignmentId, actor, body = {}) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) throw notFound('الإسناد غير موجود');
      const c = svc.requireOpen(a.case_id);
      if (a.status !== 'approved') throw conflict('يمكن إعادة فتح الإسنادات المعتمدة فقط');
      const lawyer = db.get('SELECT active FROM users WHERE id = ?', a.lawyer_id);
      if (!lawyer?.active) throw conflict('حساب هذا المحامي موقوف');
      const settings = app.settings.all();
      const brief = body.brief !== undefined ? v.str(body.brief, 'المطلوب في المتابعة', { max: 5000 }) : a.brief;
      const dueAt = v.iso(body.due_at, 'موعد التسليم') || addDays(nowIso(), Number(settings.default_assignment_days) || 3);
      const t = nowIso();
      db.tx(() => {
        db.update('assignments', a.id, { status: 'returned', brief, due_at: dueAt, last_activity_at: t });
        const last = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1", a.id);
        const version = Number(db.value('SELECT COALESCE(MAX(version), 0) FROM opinions WHERE assignment_id = ?', a.id)) + 1;
        db.insert('opinions', {
          case_id: a.case_id,
          assignment_id: a.id,
          version,
          body: last?.body || '',
          status: 'draft',
          ai_suggestion_id: last?.ai_suggestion_id ?? null,
          created_at: t,
          updated_at: t,
        });
      });
      app.activity.log({ case_id: c.id, actor, type: 'assignment.reengaged', summary: `أعادت الإدارة فتح إسناد ${lawyerName(a.lawyer_id)} للمتابعة` });
      app.notifications.notify(a.lawyer_id, {
        type: 'assignment.reengaged',
        title: `أعادت الإدارة فتح إسنادك في الملف ${c.code} للمتابعة`,
        body: brief ? truncate(brief, 160) : null,
        link: `#/my/assignments/${a.id}`,
      });
      svc.refreshStatus(c.id);
      return { ok: true };
    },

    // ===== المحادثة مع العميل =====
    sendMessage(caseId, body, actor) {
      const c = svc.require(caseId);
      const text = v.str(body.body, 'نص الرسالة', { required: true, max: 4000 });
      const msg = app.engine.sendToClient({
        client_id: c.client_id,
        intake_id: c.intake_id,
        case_id: c.id,
        matter_id: c.matter_id,
        body: text,
        channel: body.channel || 'auto',
        author: actor,
      });
      db.run('UPDATE cases SET unread_count = 0 WHERE id = ?', c.id);
      app.activity.log({ case_id: c.id, actor, type: 'message.sent', summary: `أرسلت الإدارة رسالة للعميل عبر ${LABELS.channel[msg.channel]}` });
      return msg;
    },

    // ===== الإغلاق =====
    close(caseId, body, actor) {
      const c = svc.requireOpen(caseId);
      const outcome = v.oneOf(body.outcome, ENUMS.case_outcome, 'نتيجة الملف', { required: true });
      const note = v.str(body.note, 'ملاحظة الإغلاق', { max: 3000 });
      const pendingOps = db.all("SELECT o.id FROM opinions o WHERE o.case_id = ? AND o.status = 'submitted'", c.id);
      if (pendingOps.length && !body.force) {
        throw conflict('توجد آراء مقدمة بانتظار مراجعة الإدارة. اعتمدها أو أعدها قبل إغلاق الملف.', { pending_opinions: pendingOps.map((o) => o.id) });
      }
      const t = nowIso();
      // أعضاء ما زالوا يعملون سيُسحب إسنادهم: نبلغهم بدل أن تختفي المهمة دون إشعار
      const dropped = db.all("SELECT id, lawyer_id FROM assignments WHERE case_id = ? AND status IN ('assigned','in_progress','returned','submitted')", c.id);
      db.tx(() => {
        db.run("UPDATE info_requests SET status = 'cancelled', updated_at = ? WHERE case_id = ? AND status IN ('pending_admin','sent_to_client','client_replied')", t, c.id);
        db.run("UPDATE counsel_requests SET status = 'cancelled', updated_at = ? WHERE case_id = ? AND status = 'pending_admin'", t, c.id);
        db.run("UPDATE opinions SET status = 'superseded', updated_at = ? WHERE case_id = ? AND status IN ('submitted','draft')", t, c.id);
        db.run(
          "UPDATE assignments SET status = 'withdrawn', withdrawn_at = ? WHERE case_id = ? AND status IN ('assigned','in_progress','returned','submitted')",
          t,
          c.id,
        );
        // طلبات المساعدة التي كان يخدمها عضو سُحب إسناده لم تكتمل: تُلغى ولا تبقى «تم الإسناد» للأبد
        db.run(
          "UPDATE counsel_requests SET status = 'cancelled', updated_at = ? WHERE case_id = ? AND status = 'assigned' AND assigned_assignment_id IN (SELECT id FROM assignments WHERE case_id = ? AND status = 'withdrawn')",
          t,
          c.id,
          c.id,
        );
        for (const a of dropped) db.run("DELETE FROM assignment_grants WHERE resource = 'opinion' AND resource_id = ?", a.id);
        db.update('cases', c.id, { status: 'closed', outcome, closure_note: note, closed_at: t, closed_by: actor.id, updated_at: t });
        app.activity.log({ case_id: c.id, actor, type: 'case.closed', summary: `أغلقت الإدارة الملف — ${LABELS.case_outcome[outcome]}`, data: { outcome } });
        // المحاسبة (وقائع الاستحقاق عند الإغلاق) وقاعدة المعرفة
        app.events.emit('case.closed', { caseId: c.id, actor });
      });
      const team = db.all("SELECT id, lawyer_id FROM assignments WHERE case_id = ? AND status = 'approved'", c.id);
      for (const a of team) {
        app.notifications.notify(a.lawyer_id, { type: 'case.closed', title: `أغلقت الإدارة الملف ${c.code}`, body: 'شكرًا لمساهمتك.', link: `#/my/assignments/${a.id}` });
      }
      for (const a of dropped) {
        app.notifications.notify(a.lawyer_id, { type: 'assignment.withdrawn', title: `أغلقت الإدارة الملف ${c.code} ولم يعد مسندًا إليك`, body: note ? truncate(note, 160) : null });
      }
      return svc.require(c.id);
    },

    reopen(caseId, body, actor) {
      const c = svc.require(caseId);
      if (c.status !== 'closed') throw conflict('الملف ليس مغلقًا');
      const t = nowIso();
      db.tx(() => {
        db.update('cases', c.id, { status: 'new', outcome: null, closed_at: null, closed_by: null, updated_at: t });
        app.activity.log({ case_id: c.id, actor, type: 'case.reopened', summary: `أعادت الإدارة فتح الملف${body?.note ? `: ${body.note}` : ''}` });
        // سجل المعرفة المعتمد يخرج من الاسترجاع والتصدير حتى يُعاد بناؤه ومراجعته بعد الإغلاق التالي
        const k = db.run("UPDATE knowledge_records SET status = 'pending_review', usage = 'none', updated_at = ? WHERE case_id = ? AND status = 'approved'", t, c.id);
        if (k.changes) app.activity.log({ case_id: c.id, actor, type: 'knowledge.reopened', summary: 'أُعيد سجل المعرفة للمراجعة لإعادة فتح الملف' });
      });
      svc.refreshStatus(c.id);
      return svc.require(c.id);
    },
  };
  return svc;
}

const FIELD_LABELS = {
  title: 'العنوان',
  facts_internal: 'الوقائع الداخلية',
  facts_shared: 'ملخص الوقائع للمحامين',
  priority: 'الأولوية',
  due_at: 'الموعد المستهدف',
  case_manager_id: 'مدير الحالة',
  legal_area: 'المجال القانوني',
};
