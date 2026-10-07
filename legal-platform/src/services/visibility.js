// الصلاحيات الدقيقة: «ما تراه الإدارة ليس بالضرورة ما يراه المحامي».
// هذا الملف هو المصدر الوحيد لما يُعرض للمحامي؛ كل بيانات المحامي تُبنى هنا من المنح الصريحة (assignment_grants).
// لا يحصل المحامي أبدًا على: هاتف العميل، رقمه القومي، بريده، المحادثة الأصلية، مصدر العميل، الملاحظات الداخلية، التكلفة.
import { nowIso, notFound, badRequest, parseJson } from '../util.js';
import { LABELS, LEGAL_AREAS } from '../constants.js';
import { parseItems } from './v91-l-work.js'; // v9.1 l-work
import { redact } from '../ai/redact.js'; // v9.1 l-work: تنقية رسائل الإدارة للمستفيد/ة قبل عرضها للمحامي

const ACTIVE_ASSIGNMENT = ['assigned', 'in_progress', 'submitted', 'returned', 'approved'];
const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

export function createVisibility(app) {
  const { db } = app;

  const svc = {
    /** الإسناد الخاص بهذا المحامي فقط (404 لأي إسناد آخر حتى لا نكشف وجوده) */
    requireAssignment(assignmentId, lawyer) {
      const a = db.get('SELECT * FROM assignments WHERE id = ? AND lawyer_id = ?', assignmentId, lawyer.id);
      if (!a || a.status === 'withdrawn') throw notFound('الملف غير موجود أو لم يعد مسندًا إليك');
      return a;
    },

    grantsOf(assignmentId) {
      const g = { facts: false, client_name: false, issue: new Set(), document: new Set(), opinion: new Set(), info_request: new Set() };
      for (const r of db.all('SELECT resource, resource_id FROM assignment_grants WHERE assignment_id = ?', assignmentId)) {
        if (r.resource === 'facts') g.facts = true;
        else if (r.resource === 'client_name') g.client_name = true;
        else g[r.resource].add(Number(r.resource_id));
      }
      return g;
    },

    grantsPublic(assignmentId) {
      const g = svc.grantsOf(assignmentId);
      return {
        facts: g.facts,
        client_name: g.client_name,
        issue_ids: [...g.issue],
        document_ids: [...g.document],
        opinion_assignment_ids: [...g.opinion],
        info_request_ids: [...g.info_request],
      };
    },

    /** التحقق من أن كل مورد ممنوح ينتمي لنفس الملف */
    normalizeGrants(caseId, assignmentId, input = {}) {
      const ids = (x, label) => {
        if (x === undefined || x === null) return [];
        if (!Array.isArray(x)) throw badRequest(`«${label}» يجب أن يكون قائمة`);
        return [...new Set(x.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
      };
      const issueIds = ids(input.issue_ids, 'المسائل');
      const docIds = ids(input.document_ids, 'المستندات');
      const opIds = ids(input.opinion_assignment_ids, 'آراء الفريق').filter((x) => x !== assignmentId);
      const irIds = ids(input.info_request_ids, 'طلبات المعلومات');
      const check = (table, list, label, extra = '') => {
        for (const id of list) {
          const row = db.get(`SELECT 1 FROM ${table} WHERE id = ? AND case_id = ?${extra}`, id, caseId);
          if (!row) throw badRequest(`${label} رقم ${id} لا ينتمي لهذا الملف`);
        }
      };
      check('case_issues', issueIds, 'المسألة', " AND status != 'dropped'");
      check('documents', docIds, 'المستند');
      check('assignments', opIds, 'عضو الفريق');
      check('info_requests', irIds, 'طلب المعلومات');
      return {
        facts: !!input.facts,
        client_name: !!input.client_name,
        issue_ids: issueIds,
        document_ids: docIds,
        opinion_assignment_ids: opIds,
        info_request_ids: irIds,
      };
    },

    /** استبدال صلاحيات الإسناد بالكامل */
    setGrants(assignmentId, grants, actor) {
      const a = db.get('SELECT * FROM assignments WHERE id = ?', assignmentId);
      if (!a) throw notFound('الإسناد غير موجود');
      const g = svc.normalizeGrants(a.case_id, a.id, grants);
      const t = nowIso();
      db.tx(() => {
        db.run('DELETE FROM assignment_grants WHERE assignment_id = ?', a.id);
        const ins = (resource, id = 0) =>
          db.insert('assignment_grants', { assignment_id: a.id, resource, resource_id: id, granted_by: actor?.id ?? null, granted_at: t });
        if (g.facts) ins('facts');
        if (g.client_name) ins('client_name');
        g.issue_ids.forEach((id) => ins('issue', id));
        g.document_ids.forEach((id) => ins('document', id));
        g.opinion_assignment_ids.forEach((id) => ins('opinion', id));
        g.info_request_ids.forEach((id) => ins('info_request', id));
      });
      return g;
    },

    addGrant(assignmentId, resource, resourceId = 0, actor = null) {
      db.run(
        'INSERT OR IGNORE INTO assignment_grants (assignment_id, resource, resource_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)',
        assignmentId,
        resource,
        resourceId,
        actor?.id ?? null,
        nowIso(),
      );
    },

    /** الصلاحيات المقترحة افتراضيًا (تعدلها الإدارة قبل الحفظ) */
    defaultGrants(caseId, role, { issueIds = null, documentIds = null } = {}) {
      const allIssues = db.all("SELECT id FROM case_issues WHERE case_id = ? AND status = 'active'", caseId).map((r) => r.id);
      // v9.1 b-forms: الرسائل الصوتية لا تدخل أبدًا في «كل المستندات» (قد تحتوي بيانات تواصل)؛ تُتاح فقط باختيار صريح
      const allDocs = db.all("SELECT id FROM documents WHERE case_id = ? AND mime NOT LIKE 'audio/%'", caseId).map((r) => r.id);
      if (role === 'lead' || role === 'co_counsel') {
        return { facts: true, client_name: false, issue_ids: allIssues, document_ids: allDocs, opinion_assignment_ids: [], info_request_ids: [] };
      }
      return {
        facts: true,
        client_name: false,
        issue_ids: issueIds ?? [],
        document_ids: documentIds ?? [],
        opinion_assignment_ids: [],
        info_request_ids: [],
      };
    },

    /** تسجيل آخر اطلاع للمحامي على الملف (لتمييز المعلومات الجديدة) */
    markViewed(assignmentId, lawyer) {
      db.run('UPDATE assignments SET last_viewed_at = ? WHERE id = ? AND lawyer_id = ?', nowIso(), assignmentId, lawyer.id);
    },

    markOpened(assignmentId, lawyer) {
      const a = svc.requireAssignment(assignmentId, lawyer);
      const t = nowIso();
      if (!a.first_opened_at) {
        db.update('assignments', a.id, {
          first_opened_at: t,
          status: a.status === 'assigned' ? 'in_progress' : a.status,
          last_activity_at: t,
        });
        app.activity.log({ case_id: a.case_id, actor: lawyer, type: 'assignment.opened', summary: `فتح ${lawyer.name} الملف وبدأ العمل عليه` });
        app.cases.refreshStatus(a.case_id);
      }
      return svc.assignmentView(a.id, lawyer);
    },

    /**
     * v9.1 l-work: ما طلبته الإدارة بالفعل من المستفيد/ة في نفس الملف (حتى لا يُسأل مرتين).
     * يُعرض فقط لمن أُتيح له ملخص الوقائع، ويقتصر على نص الرسالة المعتمدة للمستفيد/ة وحالتها:
     * لا سؤال المحامي الآخر، ولا اسم من طلب، ولا رد المستفيد/ة.
     */
    caseOpenRequests(a, lawyer) {
      const asg = typeof a === 'object' && a ? a : svc.requireAssignment(a, lawyer);
      const g = svc.grantsOf(asg.id);
      if (!g.facts) return [];
      // رسالة الإدارة للمستفيد/ة قد تناديها باسمها («أستاذة سامية») أو تذكر رقمًا أو رابطًا: تُنقّى قبل وصولها للمحامي
      const clean = svc.beneficiaryTextCleaner(asg.case_id, g);
      return db
        .all(
          `SELECT id, kind, client_message, items, status, sent_at FROM info_requests
           WHERE case_id = ? AND status IN ('sent_to_client','client_replied') AND (assignment_id IS NULL OR assignment_id != ?)
             AND kind IN ('document','information') AND client_message IS NOT NULL ORDER BY id`,
          asg.case_id,
          asg.id,
        )
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          client_message: clean(r.client_message),
          // بنود الورق كما أرسلتها الإدارة للمستفيد/ة (جزء من الرسالة المعتمدة نفسها)
          items: parseItems(r.items).map((it) => clean(it.label)),
          status: r.status,
          sent_at: r.sent_at,
          // ضغط «أحتاج هذا أيضًا» من قبل (طلبه المرتبط عند الإدارة أو وصله الرد)
          joined: !!db.get("SELECT 1 FROM info_requests WHERE assignment_id = ? AND duplicate_of_id = ? AND status IN ('pending_admin','shared')", asg.id, r.id),
        }));
    },

    /**
     * v9.1 l-work: تنقية نص كتبته الإدارة للمستفيد/ة قبل عرضه للمحامي: الروابط والهواتف والأرقام القومية دائمًا،
     * واسم المستفيد/ة ما لم يُتح له الاسم (src/ai/redact.js، نفس أداة قاعدة المعرفة).
     */
    beneficiaryTextCleaner(caseId, g) {
      const names = [];
      if (!g.client_name) {
        const row = db.get('SELECT cl.name FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?', caseId);
        if (row && row.name) names.push(row.name);
      }
      return (text) => (text == null ? text : redact(String(text), { names }).text);
    },

    /** العرض الكامل للمحامي — مبني حصريًا من المنح الصريحة */
    assignmentView(assignmentId, lawyer) {
      const a = svc.requireAssignment(assignmentId, lawyer);
      const c = db.get('SELECT * FROM cases WHERE id = ?', a.case_id);
      const g = svc.grantsOf(a.id);
      const closed = c.status === 'closed';
      const editable = !closed && ['assigned', 'in_progress', 'returned'].includes(a.status);

      // v9.1 l-work: null حين لا يُتاح الاسم، والواجهة تكتب «اسم المستفيد/ة محجوب للخصوصية.»
      let clientLabel = null;
      if (g.client_name) {
        const cl = app.clients.get(c.client_id);
        if (cl?.name) clientLabel = cl.name;
      }

      const issues = db
        .all("SELECT * FROM case_issues WHERE case_id = ? AND status != 'dropped' ORDER BY number", c.id)
        .filter((i) => (i.status === 'active' && g.issue.has(i.id)) || i.proposed_by_user_id === lawyer.id)
        .map((i) => ({ id: i.id, number: i.number, title: i.title, details: i.details, legal_area: i.legal_area, status: i.status, origin: i.origin }));

      const documents = db
        .all('SELECT * FROM documents WHERE case_id = ? ORDER BY id', c.id)
        .filter((d) => g.document.has(d.id) || d.uploaded_by_user_id === lawyer.id)
        // granted: أتاحته الإدارة (يمكن الإشارة إليه في طلب مساعدة)، وإلا فهو مما رفعه المحامي نفسه
        .map((d) => ({ ...app.documents.publicView(d), granted: g.document.has(d.id) }));

      const myOpinions = db
        .all('SELECT * FROM opinions WHERE assignment_id = ? ORDER BY version', a.id)
        .map((o) => ({
          id: o.id,
          version: o.version,
          body: o.body,
          status: o.status,
          submitted_at: o.submitted_at,
          reviewed_at: o.reviewed_at,
          review_note: o.status === 'returned' || o.status === 'approved' ? o.review_note : null,
          ai_suggestion_id: o.ai_suggestion_id,
          updated_at: o.updated_at,
          // v9.1 l-work (B91-16): خطوات عملية للمستفيد/ة كتبها المحامي نفسه (تراجعها الإدارة قبل أي إرسال)
          client_steps: parseJson(o.client_steps, null),
        }));
      const draft = myOpinions.filter((o) => o.status === 'draft').pop() || null;

      // آراء أعضاء الفريق الذين أُتيحت آراؤهم لهذا المحامي (المقدمة أو المعتمدة فقط، لا المسودات)
      const team = [];
      for (const otherId of g.opinion) {
        const oa = db.get(
          `SELECT a.*, u.name AS lawyer_name, l.title AS lawyer_title FROM assignments a JOIN users u ON u.id = a.lawyer_id
           LEFT JOIN lawyers l ON l.user_id = a.lawyer_id WHERE a.id = ? AND a.case_id = ? AND a.status != 'withdrawn'`,
          otherId,
          c.id,
        );
        if (!oa) continue;
        const ops = db
          .all("SELECT version, body, status, submitted_at FROM opinions WHERE assignment_id = ? AND status IN ('submitted','approved') ORDER BY version DESC", oa.id)
          .slice(0, 1);
        const cr = oa.counsel_request_id ? db.get('SELECT kind, specialty FROM counsel_requests WHERE id = ?', oa.counsel_request_id) : null;
        team.push({
          assignment_id: oa.id,
          lawyer_name: `${oa.lawyer_title || ''} ${oa.lawyer_name}`.trim(),
          role: oa.role,
          role_label: LABELS.assignment_role[oa.role],
          status: oa.status,
          status_label: LABELS.assignment_status[oa.status],
          brief: oa.brief,
          specialty_label: cr?.specialty ? AREA[cr.specialty] : null,
          opinion: ops[0] || null,
        });
      }

      // المحامي الأساسي الذي طلب المساعدة (اسمه ودوره فقط) عند إسناد متخصص
      let requestedBy = null;
      if (a.counsel_request_id) {
        const cr = db.get(
          `SELECT cr.kind, cr.specialty, cr.description, u.name, l.title FROM counsel_requests cr
           JOIN assignments ra ON ra.id = cr.requester_assignment_id JOIN users u ON u.id = ra.lawyer_id
           LEFT JOIN lawyers l ON l.user_id = ra.lawyer_id WHERE cr.id = ?`,
          a.counsel_request_id,
        );
        if (cr) {
          requestedBy = {
            lawyer_name: `${cr.title || ''} ${cr.name}`.trim(),
            kind: cr.kind,
            kind_label: LABELS.counsel_kind[cr.kind],
            specialty_label: cr.specialty ? AREA[cr.specialty] : null,
          };
        }
      }

      const docMap = new Map();
      const irDocs = (irId) => {
        if (!docMap.has(irId)) {
          docMap.set(
            irId,
            db.all('SELECT * FROM documents WHERE info_request_id = ?', irId).filter((d) => g.document.has(d.id)).map((d) => app.documents.publicView(d)),
          );
        }
        return docMap.get(irId);
      };
      const mapIr = (r, own) => ({
        id: r.id,
        kind: r.kind,
        kind_label: LABELS.info_request_kind[r.kind],
        question: r.question,
        status: r.status,
        status_label: LABELS.info_request_status[r.status],
        own,
        admin_note: own && r.status === 'rejected' ? r.admin_note : null,
        response_text: r.status === 'shared' ? r.response_text : null,
        // v9.1 l-work: «أحتاج هذا أيضًا» يصله رد الطلب الأصلي: مستنداته (المتاحة له فقط) تظهر في صف طلبه هو
        documents: r.status === 'shared' ? (own && r.duplicate_of_id ? dupDocs(r) : irDocs(r.id)) : [],
        created_at: r.created_at,
        shared_at: r.shared_at,
        // جديد منذ آخر مرة فتح فيها المحامي الملف
        is_new: r.status === 'shared' && !!r.shared_at && (!a.last_viewed_at || r.shared_at > a.last_viewed_at),
        // v9.1 l-work: المهلة، و«أحتاج هذا أيضًا»، وبنود المستندات (حالة كل بند لا تظهر إلا بعد إتاحة الرد)
        sent_at: own ? r.sent_at : null,
        requested_due_at: own && r.kind === 'extension' ? r.requested_due_at : null,
        extension_applied: own && r.kind === 'extension' ? !!r.extension_applied_at : false,
        duplicate_of_id: own ? r.duplicate_of_id || null : null,
        items: own && r.duplicate_of_id ? dupItems(r) : itemStatuses(r),
      });
      // v9.1 l-work: الطلب المرتبط يعرض بنود الطلب الأصلي (نفس ما يراه في «مطلوب بالفعل»، منقّى) وحالتها بعد إتاحة الرد
      const cleanForLawyer = svc.beneficiaryTextCleaner(c.id, g);
      function dupOriginal(r) {
        const o = db.get('SELECT * FROM info_requests WHERE id = ? AND case_id = ?', r.duplicate_of_id, c.id);
        return o || null;
      }
      function dupItems(r) {
        const o = dupOriginal(r);
        if (!o) return [];
        const list = itemStatuses(r.status === 'shared' && o.status === 'shared' ? o : { ...o, status: null });
        return list.map((it) => ({ ...it, label: cleanForLawyer(it.label) }));
      }
      function dupDocs(r) {
        const seen = new Set();
        return [...irDocs(r.duplicate_of_id), ...irDocs(r.id)].filter((d) => (seen.has(d.id) ? false : seen.add(d.id)));
      }
      // B91-16: «وصل» / «ناقص» لكل بند بعد إتاحة الرد فقط (من ملفات رد المستفيد/ة على كل بند وما أفادت بعدم وجوده)
      function itemStatuses(r) {
        const items = parseItems(r.items);
        if (!items.length) return [];
        if (r.status !== 'shared') return items.map((it) => ({ label: it.label, status: null }));
        const missing = new Set((parseJson(r.items_missing, []) || []).map(Number));
        let received = new Set();
        try {
          received = new Set(db.all('SELECT DISTINCT info_request_item AS i FROM documents WHERE info_request_id = ? AND info_request_item IS NOT NULL', r.id).map((x) => Number(x.i)));
        } catch {
          /* عمود info_request_item غير موجود في قاعدة بيانات أقدم */
        }
        return items.map((it, idx) => ({ label: it.label, status: received.has(idx) ? 'received' : missing.has(idx) ? 'missing' : 'needed' }));
      }
      const infoRequests = [
        ...db.all('SELECT * FROM info_requests WHERE assignment_id = ? ORDER BY id', a.id).map((r) => mapIr(r, true)),
        ...db
          .all("SELECT * FROM info_requests WHERE case_id = ? AND status = 'shared' AND (assignment_id IS NULL OR assignment_id != ?) ORDER BY id", c.id, a.id)
          .filter((r) => g.info_request.has(r.id))
          .map((r) => mapIr(r, false)),
      ];

      const counsel = db
        .all(
          `SELECT cr.*, u.name AS assigned_name, l.title AS assigned_title FROM counsel_requests cr
           LEFT JOIN assignments aa ON aa.id = cr.assigned_assignment_id LEFT JOIN users u ON u.id = aa.lawyer_id
           LEFT JOIN lawyers l ON l.user_id = aa.lawyer_id WHERE cr.requester_assignment_id = ? ORDER BY cr.id`,
          a.id,
        )
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          kind_label: LABELS.counsel_kind[r.kind],
          specialty: r.specialty,
          specialty_label: r.specialty ? AREA[r.specialty] : null,
          issue_ids: parseJson(r.issue_ids, []),
          description: r.description,
          status: r.status,
          status_label: LABELS.counsel_status[r.status],
          admin_note: r.status === 'rejected' ? r.admin_note : null,
          assigned_lawyer: r.assigned_name ? `${r.assigned_title || ''} ${r.assigned_name}`.trim() : null,
          created_at: r.created_at,
        }));

      return {
        assignment: {
          id: a.id,
          role: a.role,
          role_label: LABELS.assignment_role[a.role],
          status: a.status,
          status_label: LABELS.assignment_status[a.status],
          brief: a.brief,
          due_at: a.due_at,
          assigned_at: a.assigned_at,
          first_opened_at: a.first_opened_at,
          submitted_at: a.submitted_at,
          approved_at: a.approved_at,
          hours_spent: a.hours_spent,
          fee_mode: a.fee_mode,
          fee_mode_label: LABELS.fee_mode[a.fee_mode],
          fee_amount: a.fee_mode === 'custom' && a.fee_amount_minor !== null ? a.fee_amount_minor / 100 : null,
        },
        case: {
          code: c.code,
          title: c.title,
          legal_area: c.legal_area,
          legal_area_label: AREA[c.legal_area],
          priority: c.priority,
          state: closed ? 'closed' : 'open',
          state_label: closed ? 'مغلق' : 'مفتوح',
        },
        client_label: clientLabel,
        facts: g.facts ? c.facts_shared || '' : null,
        facts_granted: g.facts,
        issues,
        documents,
        my_opinions: myOpinions,
        current_draft: draft,
        team,
        requested_by: requestedBy,
        info_requests: infoRequests,
        // v9.1 l-work: «مطلوب بالفعل من المستفيد/ة» (فارغة دون منحة الوقائع)
        case_open_requests: svc.caseOpenRequests(a, lawyer),
        counsel_requests: counsel,
        permissions: {
          can_edit: editable,
          can_submit: editable,
          can_request: !closed && ACTIVE_ASSIGNMENT.includes(a.status) && a.status !== 'approved',
        },
      };
    },

    /** قائمة ملفات المحامي */
    listForLawyer(lawyer, { scope = 'active' } = {}) {
      const where =
        scope === 'history'
          ? "(a.status IN ('approved','withdrawn') OR c.status = 'closed') AND a.status != 'withdrawn'"
          : "a.status IN ('assigned','in_progress','submitted','returned') AND c.status != 'closed'";
      const t = nowIso();
      return db
        .all(
          `SELECT a.*, c.code AS case_code, c.title AS case_title, c.legal_area, c.priority, c.status AS case_status,
             (SELECT COUNT(*) FROM info_requests ir WHERE ir.assignment_id = a.id AND ir.status IN ('pending_admin','sent_to_client','client_replied')) AS open_info_requests,
             (SELECT COUNT(*) FROM info_requests ir WHERE ir.assignment_id = a.id AND ir.status = 'shared') AS shared_info_requests,
             (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id = a.case_id AND ir.status = 'shared'
                AND (ir.shared_at > COALESCE(a.last_viewed_at, '')) AND (ir.assignment_id = a.id OR EXISTS (
                  SELECT 1 FROM assignment_grants g WHERE g.assignment_id = a.id AND g.resource = 'info_request' AND g.resource_id = ir.id))) AS unseen_shared_info_requests,
             (SELECT COUNT(*) FROM counsel_requests cr WHERE cr.requester_assignment_id = a.id AND cr.status IN ('pending_admin','assigned')) AS open_counsel_requests
           FROM assignments a JOIN cases c ON c.id = a.case_id WHERE a.lawyer_id = ? AND ${where}
           ORDER BY CASE WHEN a.due_at IS NULL THEN 1 ELSE 0 END, a.due_at, a.id DESC`,
          lawyer.id,
        )
        .map((r) => ({
          id: r.id,
          case_code: r.case_code,
          case_title: r.case_title,
          legal_area: r.legal_area,
          legal_area_label: AREA[r.legal_area],
          priority: r.priority,
          role: r.role,
          role_label: LABELS.assignment_role[r.role],
          status: r.status,
          status_label: LABELS.assignment_status[r.status],
          case_state: r.case_status === 'closed' ? 'closed' : 'open',
          brief: r.brief,
          due_at: r.due_at,
          assigned_at: r.assigned_at,
          overdue: !!(r.due_at && r.due_at < t && ['assigned', 'in_progress', 'returned'].includes(r.status)),
          open_info_requests: Number(r.open_info_requests),
          shared_info_requests: Number(r.shared_info_requests),
          unseen_shared_info_requests: Number(r.unseen_shared_info_requests),
          open_counsel_requests: Number(r.open_counsel_requests),
        }));
    },
  };
  return svc;
}
