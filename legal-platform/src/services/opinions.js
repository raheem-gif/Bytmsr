// آراء المحامين: المسودة، التقديم للإدارة، الاعتماد أو الإعادة، ثم إعداد النسخة الموجهة للعميل وإرسالها.
// ضغط المحامي على «تقديم» لا يعني أن العميل تلقى الرد: الرد يعود أولًا للمؤسسة.
import { nowIso, badRequest, notFound, conflict, v, truncate, ApiError } from '../util.js';
import { LABELS } from '../constants.js';
import { clientAnswerFields, answerMessageText } from './portal-v91.js'; // v9.1 b-portal

export function createOpinions(app) {
  const { db } = app;

  function requireOpinion(id) {
    const o = db.get('SELECT * FROM opinions WHERE id = ?', id);
    if (!o) throw notFound('الرأي غير موجود');
    return o;
  }
  function nextVersion(assignmentId) {
    return Number(db.value('SELECT COALESCE(MAX(version), 0) + 1 FROM opinions WHERE assignment_id = ?', assignmentId));
  }

  const svc = {
    /** حفظ المسودة (يمكن العودة إليها لاحقًا) */
    saveDraft(assignmentId, lawyer, body) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      app.cases.requireOpen(a.case_id);
      if (!['assigned', 'in_progress', 'returned'].includes(a.status)) {
        throw conflict(a.status === 'submitted' ? 'رأيك مقدم وبانتظار مراجعة الإدارة' : 'لا يمكن تعديل الرأي في هذه المرحلة');
      }
      const text = v.str(body.body, 'نص الرأي', { required: true, max: 60000, trim: false });
      let aiId = null;
      if (body.ai_suggestion_id) {
        const sug = app.ai.suggestion(Number(body.ai_suggestion_id));
        if (!sug || sug.entity_type !== 'assignment' || sug.entity_id !== a.id) throw badRequest('المسودة الآلية غير صالحة');
        aiId = sug.id;
      }
      const t = nowIso();
      const draft = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1", a.id);
      // v9.1 l-work (L-03): لا كتابة صامتة فوق نص أحدث حُفظ من جهاز آخر — يقرر المحامي أي النصين يبقى
      if (draft && body.base_updated_at && body.base_updated_at !== draft.updated_at && draft.body !== text && body.force !== true) {
        throw new ApiError(409, 'تغيّر نص رأيك على المنصة من جهاز آخر بعد آخر حفظ من هذا الجهاز', 'draft_conflict', {
          server_body: draft.body,
          server_updated_at: draft.updated_at,
          server_words: draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0,
        });
      }
      // v9.1 l-work (B91-16): خطوات عملية مقترحة للمستفيد/ة (اختيارية، خطوة في كل سطر، حتى 8)
      let steps;
      if (body.client_steps !== undefined) {
        const list = Array.isArray(body.client_steps) ? body.client_steps : String(body.client_steps ?? '').split('\n');
        const clean = list.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (clean.length > 8) throw badRequest('الحد الأقصى 8 خطوات للمستفيد/ة');
        if (clean.some((s) => s.length > 300)) throw badRequest('كل خطوة للمستفيد/ة 300 حرف على الأكثر');
        steps = clean.length ? JSON.stringify(clean) : null;
      }
      let id;
      if (draft) {
        db.update('opinions', draft.id, { body: text, ai_suggestion_id: aiId ?? draft.ai_suggestion_id, client_steps: steps, updated_at: t });
        id = draft.id;
      } else {
        id = db.insert('opinions', {
          case_id: a.case_id,
          assignment_id: a.id,
          version: nextVersion(a.id),
          body: text,
          status: 'draft',
          ai_suggestion_id: aiId,
          client_steps: steps ?? undefined,
          created_at: t,
          updated_at: t,
        });
      }
      db.update('assignments', a.id, {
        status: a.status === 'assigned' ? 'in_progress' : a.status,
        first_opened_at: a.first_opened_at || t,
        last_activity_at: t,
      });
      if (a.status === 'assigned') app.cases.refreshStatus(a.case_id);
      return requireOpinion(id);
    },

    /** تقديم الرأي للإدارة */
    submit(assignmentId, lawyer, body = {}) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      const c = app.cases.requireOpen(a.case_id);
      if (!['assigned', 'in_progress', 'returned'].includes(a.status)) {
        throw conflict(a.status === 'submitted' ? 'رأيك مقدم بالفعل وبانتظار مراجعة الإدارة' : 'لا يمكن تقديم الرأي في هذه المرحلة');
      }
      // v9.1 l-work: client_steps، وbase_updated_at/force حتى لا يكتب التقديم من نافذة قديمة فوق نص أحدث (409 draft_conflict)
      if (body.body !== undefined) svc.saveDraft(a.id, lawyer, { body: body.body, ai_suggestion_id: body.ai_suggestion_id, client_steps: body.client_steps, base_updated_at: body.base_updated_at, force: body.force });
      const draft = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'draft' ORDER BY version DESC LIMIT 1", a.id);
      if (!draft || draft.body.trim().length < 20) throw badRequest('اكتب رأيك (20 حرفًا على الأقل) قبل التقديم');
      if (/\[يُستكمل/.test(draft.body)) throw badRequest('المسودة ما زالت تحتوي على أجزاء «يُستكمل» من المسودة الآلية. أكملها أو احذفها قبل التقديم.');
      const hours = v.num(body.hours_spent, 'عدد الساعات', { min: 0, max: 1000 });
      const t = nowIso();
      db.tx(() => {
        db.update('opinions', draft.id, { status: 'submitted', submitted_at: t, updated_at: t });
        db.update('assignments', a.id, {
          status: 'submitted',
          submitted_at: t,
          first_submitted_at: a.first_submitted_at || t,
          hours_spent: hours ?? a.hours_spent,
          last_activity_at: t,
        });
        if (a.counsel_request_id) {
          db.run("UPDATE counsel_requests SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'assigned'", t, t, a.counsel_request_id);
        }
      });
      app.ai.feedbackOnDraft({ ...draft, status: 'submitted' }, lawyer);
      app.activity.log({
        case_id: c.id,
        actor: lawyer,
        type: 'opinion.submitted',
        summary: `قدّم ${lawyer.name} رأيه (الإصدار ${draft.version}) إلى الإدارة`,
        data: { opinion_id: draft.id, assignment_id: a.id },
      });
      app.notifications.notifyStaff(
        { type: 'opinion.submitted', title: `رأي جديد بانتظار المراجعة في الملف ${c.code}`, body: `${LABELS.assignment_role[a.role]}: ${lawyer.name}`, link: `#/cases/${c.id}` },
        { caseManagerId: c.case_manager_id },
      );
      // أعضاء الفريق المسموح لهم برؤية هذا الرأي (مثل المحامي الأساسي الذي طلب رأي المتخصص)
      const watchers = db.all(
        `SELECT a.id, a.lawyer_id FROM assignment_grants g JOIN assignments a ON a.id = g.assignment_id
         WHERE g.resource = 'opinion' AND g.resource_id = ? AND a.status != 'withdrawn'`,
        a.id,
      );
      for (const w of watchers) {
        app.notifications.notify(w.lawyer_id, {
          type: 'team.opinion',
          title: `قدّم ${lawyer.name} رأيه في الملف ${c.code}`,
          body: 'أصبح الرأي متاحًا لك ضمن فريق الملف.',
          link: `#/my/assignments/${w.id}`,
        });
      }
      app.cases.refreshStatus(c.id);
      return requireOpinion(draft.id);
    },

    /** اعتماد الإدارة للرأي (واقعة استحقاق محتملة حسب اتفاق المحامي) */
    approve(opinionId, actor, body = {}) {
      const o = requireOpinion(opinionId);
      if (o.status !== 'submitted') throw conflict('يمكن اعتماد الآراء المقدمة فقط');
      const c = app.cases.requireOpen(o.case_id);
      const score = v.int(body.quality_score, 'تقييم الجودة', { min: 1, max: 5 });
      const note = v.str(body.note, 'ملاحظة المراجعة', { max: 3000 });
      const t = nowIso();
      const a = db.get('SELECT * FROM assignments WHERE id = ?', o.assignment_id);
      db.tx(() => {
        db.update('opinions', o.id, { status: 'approved', reviewed_by: actor.id, reviewed_at: t, review_note: note, quality_score: score, updated_at: t });
        db.update('assignments', a.id, { status: 'approved', approved_at: t, last_activity_at: t });
        app.activity.log({
          case_id: c.id,
          actor,
          type: 'opinion.approved',
          summary: `اعتمدت الإدارة رأي ${app.cases.lawyerName(a.lawyer_id)} (${LABELS.assignment_role[a.role]})`,
          data: { opinion_id: o.id, quality_score: score },
        });
        app.events.emit('assignment.approved', { assignmentId: a.id, actor });
      });
      app.notifications.notify(a.lawyer_id, {
        type: 'opinion.approved',
        title: `اعتمدت الإدارة رأيك في الملف ${c.code}`,
        body: note ? truncate(note, 160) : null,
        link: `#/my/assignments/${a.id}`,
      });
      app.cases.refreshStatus(c.id);
      return requireOpinion(o.id);
    },

    /** إعادة الرأي للمحامي مع ملاحظات (يظل الملف مفتوحًا) */
    returnToLawyer(opinionId, actor, body = {}) {
      const o = requireOpinion(opinionId);
      if (o.status !== 'submitted') throw conflict('يمكن إعادة الآراء المقدمة فقط');
      const c = app.cases.requireOpen(o.case_id);
      const note = v.str(body.note, 'ملاحظات الإعادة', { required: true, max: 5000 });
      const t = nowIso();
      const a = db.get('SELECT * FROM assignments WHERE id = ?', o.assignment_id);
      db.tx(() => {
        db.update('opinions', o.id, { status: 'returned', reviewed_by: actor.id, reviewed_at: t, review_note: note, updated_at: t });
        db.update('assignments', a.id, { status: 'returned', last_activity_at: t });
        // نسخة عمل جديدة تبدأ من النص المعاد حتى لا يضيع شيء
        db.insert('opinions', {
          case_id: o.case_id,
          assignment_id: a.id,
          version: nextVersion(a.id),
          body: o.body,
          status: 'draft',
          ai_suggestion_id: o.ai_suggestion_id,
          client_steps: o.client_steps ?? undefined, // v9.1 l-work
          created_at: t,
          updated_at: t,
        });
      });
      app.activity.log({ case_id: c.id, actor, type: 'opinion.returned', summary: `أعادت الإدارة رأي ${app.cases.lawyerName(a.lawyer_id)} للتعديل`, data: { opinion_id: o.id } });
      app.notifications.notify(a.lawyer_id, {
        type: 'opinion.returned',
        title: `أعادت الإدارة رأيك في الملف ${c.code} للتعديل`,
        body: truncate(note, 160),
        // v9.1 l-home (L-12): يفتح المحرر مباشرة لا صفحة الإسناد الطويلة
        link: `#/my/assignments/${a.id}/write`,
      });
      app.cases.refreshStatus(c.id);
      return requireOpinion(o.id);
    },

    // ===== النسخة الموجهة للعميل =====
    /** إنشاء/تعديل مسودة الرد على العميل (الصياغة النهائية قد تختلف عن الصياغة المهنية الداخلية) */
    saveClientAnswer(caseId, actor, body) {
      const c = app.cases.requireOpen(caseId);
      const text = v.str(body.body, 'نص الرد على العميل', { required: true, max: 4000, trim: false });
      const opinionId = v.int(body.opinion_id, 'الرأي المرتبط', { min: 1 });
      if (opinionId) {
        const o = db.get("SELECT * FROM opinions WHERE id = ? AND case_id = ? AND status = 'approved'", opinionId, c.id);
        if (!o) throw badRequest('يجب أن يكون الرأي المرتبط معتمدًا من الإدارة');
      }
      const t = nowIso();
      if (body.id) {
        const ans = db.get('SELECT * FROM client_answers WHERE id = ? AND case_id = ?', body.id, c.id);
        if (!ans) throw notFound('مسودة الرد غير موجودة');
        if (ans.status === 'sent') throw conflict('تم إرسال هذا الرد بالفعل');
        db.update('client_answers', ans.id, { body: text, opinion_id: opinionId ?? ans.opinion_id, ...clientAnswerFields(app, c.id, body), updated_at: t }); // v9.1 b-portal: الخلاصة والخطوات
        return db.get('SELECT * FROM client_answers WHERE id = ?', ans.id);
      }
      const id = db.insert('client_answers', {
        case_id: c.id,
        opinion_id: opinionId,
        ...clientAnswerFields(app, c.id, body), // v9.1 b-portal (B91-08): summary / steps / voice_document_id
        body: text,
        status: 'draft',
        prepared_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      app.activity.log({ case_id: c.id, actor, type: 'client_answer.drafted', summary: 'أعدت الإدارة مسودة الرد الموجه للعميل' });
      return db.get('SELECT * FROM client_answers WHERE id = ?', id);
    },

    sendClientAnswer(answerId, actor, body = {}) {
      const ans = db.get('SELECT * FROM client_answers WHERE id = ?', answerId);
      if (!ans) throw notFound('مسودة الرد غير موجودة');
      if (ans.status === 'sent') throw conflict('تم إرسال هذا الرد بالفعل');
      const c = app.cases.requireOpen(ans.case_id);
      // v9.1 b-portal (B91-08): مع الخلاصة تصل الرسالة قصيرة (التحية، الخلاصة، الخطوات، رابط صفحتها)، والرد الكامل في صفحتها
      const short = answerMessageText(app, ans, c);
      // v9.1 fixes: نص واتساب وحده يحمل {portal_link} (يُصدر الرابط عند الإرسال الفعلي)؛ النص المحفوظ بلا رابط
      const waText = short ? answerMessageText(app, ans, c, { forWhatsApp: true }) : null;
      const msg = app.engine.sendToClient({
        client_id: c.client_id,
        intake_id: c.intake_id,
        case_id: c.id,
        body: short || ans.body,
        channel: body.channel || 'auto',
        author: actor,
        meta: { client_answer_id: ans.id, ...(waText && waText !== short ? { wa_text: waText } : {}) },
        // الرسالة الصوتية من المؤسسة (إن أُرفقت) تُتاح في صفحة المتابعة مع الرد
        attachments: ans.voice_document_id ? [ans.voice_document_id] : [],
      });
      const t = nowIso();
      db.update('client_answers', ans.id, { status: 'sent', channel: msg.channel, message_id: msg.id, sent_by: actor.id, sent_at: t, updated_at: t });
      app.activity.log({ case_id: c.id, actor, type: 'client_answer.sent', summary: `أرسلت الإدارة الرد النهائي للعميل عبر ${LABELS.channel[msg.channel]}` });
      app.cases.refreshStatus(c.id);
      return db.get('SELECT * FROM client_answers WHERE id = ?', ans.id);
    },
  };
  return svc;
}
