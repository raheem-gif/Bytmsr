// طلبات المعلومات/المستندات وطلبات مساعدة محامٍ آخر.
// المحامي لا يتواصل مع العميل ولا يفتح الملف لزميل بنفسه: كل طلب يمر بالإدارة أولًا.
import { nowIso, parseJson, badRequest, notFound, conflict, v, truncate, arabicCount, AR_UNITS } from '../util.js';
import { LABELS, LEGAL_AREAS, AREA_CODES, ENUMS } from '../constants.js';
import { CLIENT_TEXTS } from '../constants.js'; // v9.1 b-site (B91-10)
// v9.1 l-work: أنواع طلبات المحامي الجديدة (مهلة، سؤال للإدارة) و«أحتاج هذا أيضًا» وبنود المستندات
import { migrateInfoRequestKinds, LAWYER_REQUEST_KINDS, ADMIN_ONLY_KINDS } from './v91-l-work.js';
import { cairoParts, cairoLocalToIso, cairoDayKey, arabicDate, arabicTime, addDays } from '../util.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const COUNSEL_ROLE = { second_opinion: 'second_opinion', specialist_input: 'specialist', document_review: 'specialist', co_counsel: 'co_counsel' };

export function createRequests(app) {
  const { db } = app;
  migrateInfoRequestKinds(db); // v9.1 l-work: يقبل الجدول نوعي «طلب مهلة» و«سؤال للإدارة»

  function requireIr(id) {
    const r = db.get('SELECT * FROM info_requests WHERE id = ?', id);
    if (!r) throw notFound('طلب المعلومات غير موجود');
    return r;
  }
  function requireCr(id) {
    const r = db.get('SELECT * FROM counsel_requests WHERE id = ?', id);
    if (!r) throw notFound('طلب المساعدة غير موجود');
    return r;
  }
  function touchAssignment(id) {
    if (id) db.run('UPDATE assignments SET last_activity_at = ? WHERE id = ?', nowIso(), id);
  }

  const svc = {
    // ======================= طلبات المعلومات والمستندات =======================
    /** المحامي يضغط «طلب معلومات» أو «طلب مستند» من داخل الملف */
    createInfoByLawyer(assignmentId, lawyer, body) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      const c = app.cases.requireOpen(a.case_id);
      if (a.status === 'approved') throw conflict('تم اعتماد رأيك في هذا الملف بالفعل');
      // v9.1 l-work: إعادة الإرسال الآمنة — نفس client_ref من نفس المحامي يعيد الطلب نفسه دون تكرار
      const clientRef = v.str(body.client_ref, 'مرجع الطلب', { max: 80 });
      if (clientRef) {
        const prev = db.get('SELECT * FROM info_requests WHERE requested_by = ? AND client_ref = ?', lawyer.id, clientRef);
        if (prev) {
          if (prev.assignment_id !== a.id) throw conflict('مرجع الطلب مستخدم في ملف آخر');
          return prev;
        }
      }
      let kind = v.oneOf(body.kind, LAWYER_REQUEST_KINDS, 'نوع الطلب', { required: !body.duplicate_of_id });
      let question = null;
      let items = null;
      let requestedDueAt = null;
      let duplicateOf = null;
      if (body.duplicate_of_id !== undefined && body.duplicate_of_id !== null && body.duplicate_of_id !== '') {
        // «أحتاج هذا أيضًا»: طلب مرتبط بطلب قائم أُرسل للمستفيد/ة في نفس الملف، دون سؤاله مرة أخرى
        const dupId = v.int(body.duplicate_of_id, 'الطلب القائم', { min: 1 });
        const open = app.visibility.caseOpenRequests(a, lawyer).find((r) => r.id === dupId);
        if (!open) throw badRequest('الطلب القائم غير متاح لك');
        const orig = requireIr(dupId);
        if (db.get("SELECT 1 FROM info_requests WHERE assignment_id = ? AND duplicate_of_id = ? AND status IN ('pending_admin','shared')", a.id, orig.id)) {
          throw conflict('طلبت هذا بالفعل، وسيصلك الرد نفسه عند وصوله');
        }
        duplicateOf = orig;
        kind = orig.kind;
        // النص كما يراه هذا المحامي في «مطلوب بالفعل» (منقّى من اسم المستفيد/ة غير المتاح له ومن الأرقام والروابط)
        question = `أحتاج هذا أيضًا: ${open.client_message || ''}${open.items && open.items.length ? ` (${open.items.join('، ')})` : ''}`.trim().slice(0, 3000);
      } else if (kind === 'extension') {
        if (!['assigned', 'in_progress', 'returned'].includes(a.status)) throw conflict('لا يمكن طلب مهلة بعد تقديم الرأي');
        if (!a.due_at) throw badRequest('لا يوجد موعد تسليم محدد لهذا الإسناد');
        requestedDueAt = svc.extensionDueAt(a, body);
        if (requestedDueAt <= a.due_at) throw badRequest('اختر يومًا بعد موعد التسليم الحالي');
        if (requestedDueAt > addDays(a.due_at, 60)) throw badRequest('أقصى مهلة يمكن طلبها 60 يومًا بعد الموعد الحالي');
        const reason = v.str(body.reason, 'سبب المهلة', { max: 300 });
        const note = v.str(body.note ?? body.question, 'ملاحظة', { max: 1000 });
        question = [`مهلة حتى ${arabicDate(requestedDueAt)}، ${arabicTime(requestedDueAt)}`, reason, note].filter(Boolean).join(' — ');
        if (db.get("SELECT 1 FROM info_requests WHERE assignment_id = ? AND kind = 'extension' AND status = 'pending_admin'", a.id)) {
          throw conflict('لديك طلب مهلة عند الإدارة بالفعل');
        }
      } else if (kind === 'document' && body.items !== undefined && body.items !== null) {
        // B91-16: المستندات المطلوبة بندًا بندًا (تظهر للمستفيد/ة قائمةً بعد موافقة الإدارة)
        if (!Array.isArray(body.items)) throw badRequest('«المستندات المطلوبة» يجب أن تكون قائمة');
        const labels = body.items.map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (!labels.length) throw badRequest('اكتب مستندًا واحدًا على الأقل');
        if (labels.length > 5) throw badRequest('الحد الأقصى 5 مستندات في الطلب الواحد');
        for (const l of labels) if (l.length > 80) throw badRequest(`اسم المستند أطول من 80 حرفًا: «${truncate(l, 40)}»`);
        items = labels.map((label) => ({ label }));
        const reason = v.str(body.reason ?? body.question, 'سبب الطلب', { max: 2000 });
        question = `مطلوب: ${labels.join('، ')}${reason ? `\n${reason}` : ''}`;
      } else {
        question = v.str(body.question, 'المطلوب', { required: true, min: 5, max: 3000 });
      }
      const t = nowIso();
      const id = db.insert('info_requests', {
        case_id: c.id,
        assignment_id: a.id,
        requested_by: lawyer.id,
        kind,
        question,
        status: 'pending_admin',
        requested_due_at: requestedDueAt,
        duplicate_of_id: duplicateOf ? duplicateOf.id : null,
        items: items ? JSON.stringify(items) : null,
        client_ref: clientRef,
        created_at: t,
        updated_at: t,
      });
      touchAssignment(a.id);
      const kindLabel = duplicateOf ? `طلب مكرر (${LABELS.info_request_kind[kind]})` : LABELS.info_request_kind[kind];
      app.activity.log({
        case_id: c.id,
        actor: lawyer,
        type: 'info_request.created',
        summary: `قدّم ${lawyer.name} ${kindLabel}: «${truncate(question, 120)}»`,
        data: { info_request_id: id },
      });
      app.notifications.notifyStaff(
        { type: 'info_request.pending', title: `${kindLabel} من المحامي في الملف ${c.code}`, body: truncate(question, 160), link: `#/cases/${c.id}` },
        { caseManagerId: c.case_manager_id },
      );
      if (!duplicateOf && (kind === 'document' || kind === 'information')) app.ai.feedbackOnInfoRequest(c.id, question, lawyer);
      return requireIr(id);
    },

    /**
     * v9.1 l-work: موعد التسليم المطلوب في طلب المهلة. يقبل requested_due_date ('YYYY-MM-DD' بتوقيت القاهرة، بنفس ساعة
     * الموعد الحالي) أو requested_due_at (ISO).
     */
    extensionDueAt(a, body) {
      const day = typeof body.requested_due_date === 'string' ? body.requested_due_date.trim() : '';
      if (day) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
        if (!m) throw badRequest('«حتى أي يوم؟» ليس تاريخًا صالحًا');
        const p = cairoParts(a.due_at);
        const iso = cairoLocalToIso(Number(m[1]), Number(m[2]), Number(m[3]), p.hour, p.minute);
        if (cairoDayKey(iso) !== day) throw badRequest('«حتى أي يوم؟» ليس تاريخًا صالحًا');
        return iso;
      }
      return v.iso(body.requested_due_at, 'حتى أي يوم؟', { required: true });
    },

    /** الإدارة تطلب من العميل مباشرة (أثناء الفرز أو بعده) */
    createInfoByStaff(caseId, actor, body) {
      const c = app.cases.requireOpen(caseId);
      // v9.1 l-work: الإدارة تطلب من المستفيد/ة معلومة أو مستندًا فقط (المهلة والسؤال للإدارة من المحامي وحده)
      const kind = v.oneOf(body.kind, ENUMS.info_request_kind.filter((k) => !ADMIN_ONLY_KINDS.includes(k)), 'نوع الطلب', { required: true });
      const question = v.str(body.question, 'المطلوب', { required: true, min: 5, max: 3000 });
      const t = nowIso();
      const id = db.insert('info_requests', {
        case_id: c.id,
        assignment_id: null,
        requested_by: actor.id,
        kind,
        question,
        status: 'pending_admin',
        created_at: t,
        updated_at: t,
      });
      app.activity.log({ case_id: c.id, actor, type: 'info_request.created', summary: `أنشأت الإدارة ${LABELS.info_request_kind[kind]}: «${truncate(question, 120)}»` });
      if (body.send !== false) return svc.approveInfo(id, actor, { client_message: body.client_message || question, channel: body.channel, items: body.items }); // v9.1 b-portal: items
      return requireIr(id);
    },

    /** موافقة الإدارة وإرسال السؤال للعميل عبر قناة المؤسسة */
    approveInfo(id, actor, body) {
      const r = requireIr(id);
      // v9.1 l-work: طلب المهلة والسؤال للإدارة و«أحتاج هذا أيضًا» لا تُرسل للمستفيد/ة أبدًا
      if (ADMIN_ONLY_KINDS.includes(r.kind) || r.duplicate_of_id) throw conflict('هذا الطلب لا يُرسل للمستفيد/ة');
      if (r.status !== 'pending_admin') throw conflict('تم البت في هذا الطلب بالفعل');
      const c = app.cases.requireOpen(r.case_id);
      const clientMessage = v.str(body.client_message, 'نص الرسالة للعميل', { required: true, max: 3000 });
      // v9.1 b-portal (B91-03): البنود المطلوبة كما راجعتها الإدارة (بند في كل سطر، ≤ 5) ← صف «صوّري» لكل بند في صفحتها
      const editedItems = r.kind === 'document' && body.items !== undefined && app.portal?.itemsInput ? app.portal.itemsInput(body.items) : undefined;
      // v9.1 b-site (B91-01/B91-10): صفحة المتابعة تعرض نص الطلب نظيفًا، وعلى واتساب فقط يُضاف سطر بسيط
      // («صوّري الورقة وابعتيها هنا، أو من صفحتك: الرابط» / «ردّي علينا هنا بكتابة أو برسالة صوتية.») بلا كود الملف
      const story = { clientId: c.client_id, intakeId: c.intake_id, caseId: c.id };
      const channel = app.engine.pickChannel(c.client_id, body.channel || 'auto', story);
      const meta = { info_request_id: r.id };
      if (channel === 'whatsapp') {
        const words = app.engine.clientWords(story);
        const suffix = r.kind === 'document' ? CLIENT_TEXTS.info_suffix_document : CLIENT_TEXTS.info_suffix_information;
        const link = /\{portal_link\}/.test(suffix) ? app.engine.storyLink(story) : null;
        meta.wa_text = app.engine.fillClientText(`${clientMessage}${suffix}`, { portal_link: link }, words.form);
      }
      const msg = app.engine.sendToClient({
        client_id: c.client_id,
        intake_id: c.intake_id,
        case_id: c.id,
        body: clientMessage,
        channel,
        author: actor,
        meta,
      });
      const t = nowIso();
      db.update('info_requests', r.id, {
        status: 'sent_to_client',
        client_message: clientMessage,
        decided_by: actor.id,
        decided_at: t,
        sent_at: t,
        sent_channel: msg.channel,
        outbound_message_id: msg.id,
        items: editedItems, // v9.1 b-portal (undefined = يبقى ما كتبه المحامي)
        updated_at: t,
      });
      app.activity.log({ case_id: c.id, actor, type: 'info_request.sent', summary: `وافقت الإدارة على الطلب وأرسلته للعميل عبر ${LABELS.channel[msg.channel]}` });
      if (r.requested_by && r.assignment_id) {
        app.notifications.notify(r.requested_by, {
          type: 'info_request.sent',
          title: `أُرسل طلبك للمستفيد/ة في الملف ${c.code}`,
          body: 'سيصلك إشعار عند إتاحة الرد لك.',
          link: `#/my/assignments/${r.assignment_id}`,
        });
      }
      return requireIr(r.id);
    },

    rejectInfo(id, actor, body) {
      const r = requireIr(id);
      if (r.status !== 'pending_admin') throw conflict('تم البت في هذا الطلب بالفعل');
      const note = v.str(body.note, 'سبب الرفض', { required: true, max: 2000 });
      const t = nowIso();
      db.update('info_requests', r.id, { status: 'rejected', admin_note: note, decided_by: actor.id, decided_at: t, updated_at: t });
      const c = app.cases.require(r.case_id);
      app.activity.log({ case_id: c.id, actor, type: 'info_request.rejected', summary: `رفضت الإدارة طلب المعلومات: ${truncate(note, 120)}` });
      if (r.requested_by && r.assignment_id) {
        app.notifications.notify(r.requested_by, {
          type: 'info_request.rejected',
          title: `لم توافق الإدارة على طلبك في الملف ${c.code}`,
          body: truncate(note, 160),
          link: `#/my/assignments/${r.assignment_id}`,
        });
      }
      return requireIr(r.id);
    },

    /** رد العميل من بوابة الموقع على طلب محدد */
    clientReplyFromPortal(id, client, body) {
      const r = requireIr(id);
      const c = app.cases.require(r.case_id);
      if (c.client_id !== client.id) throw notFound('الطلب غير موجود');
      if (!['sent_to_client', 'client_replied'].includes(r.status)) throw conflict('هذا الطلب لم يعد بانتظار الرد');
      const text = v.str(body.body, 'الرد', { max: 5000 }) || '';
      if (!text && !(body.documents || []).length) throw badRequest('اكتب ردك أو أرفق المستند المطلوب');
      const res = app.engine.receive({
        channel: 'website',
        portal_client_id: client.id,
        target_case_id: c.id,
        text: text || '[مستند مرفق ردًا على الطلب]',
        attachments: (body.documents || []).slice(0, 5),
        info_request_id: r.id,
      });
      const t = nowIso();
      const combined = r.client_reply ? `${r.client_reply}\n---\n${text}` : text;
      db.update('info_requests', r.id, { status: 'client_replied', client_reply: combined || null, replied_at: t, updated_at: t });
      app.activity.log({ case_id: c.id, actor: { kind: 'client' }, type: 'info_request.replied', summary: 'رد العميل على طلب المعلومات من خلال الموقع' });
      app.notifications.notifyStaff(
        { type: 'info_request.replied', title: `رد العميل على طلب في الملف ${c.code}`, body: 'راجع الرد ثم أتحه للمحامي.', link: `#/cases/${c.id}` },
        { caseManagerId: c.case_manager_id },
      );
      return { ok: true, message_id: res.message_id };
    },

    /** تسجيل رد وصل عبر واتساب كرد على طلب محدد (تختاره الإدارة من المحادثة) */
    recordReply(id, actor, body) {
      const r = requireIr(id);
      if (!['sent_to_client', 'client_replied'].includes(r.status)) throw conflict('هذا الطلب ليس بانتظار رد العميل');
      const c = app.cases.require(r.case_id);
      const text = v.str(body.reply_text, 'نص رد العميل', { max: 10000 });
      const messageIds = v.ids(body.message_ids, 'الرسائل');
      const docIds = v.ids(body.document_ids, 'المستندات');
      let reply = text || '';
      for (const mid of messageIds) {
        const m = db.get("SELECT * FROM messages WHERE id = ? AND client_id = ? AND direction = 'in'", mid, c.client_id);
        if (!m) throw badRequest(`الرسالة ${mid} لا تخص عميل هذا الملف`);
        reply += (reply ? '\n' : '') + m.body;
        db.run('UPDATE documents SET info_request_id = ?, case_id = ? WHERE message_id = ?', r.id, c.id, m.id);
      }
      for (const did of docIds) {
        const d = db.get('SELECT * FROM documents WHERE id = ? AND (case_id = ? OR client_id = ?)', did, c.id, c.client_id);
        if (!d) throw badRequest(`المستند ${did} لا يخص هذا الملف`);
        db.run('UPDATE documents SET info_request_id = ?, case_id = ? WHERE id = ?', r.id, c.id, d.id);
      }
      if (!reply && !docIds.length && !messageIds.length) throw badRequest('حدد رسالة العميل أو اكتب الرد');
      const t = nowIso();
      db.update('info_requests', r.id, { status: 'client_replied', client_reply: reply || r.client_reply, replied_at: t, updated_at: t });
      app.activity.log({ case_id: c.id, actor, type: 'info_request.reply_recorded', summary: 'سجلت الإدارة رد العميل على طلب المعلومات' });
      return requireIr(r.id);
    },

    /**
     * إتاحة الرد للمحامي بعد مراجعة الإدارة (أو إجابة الإدارة مباشرة دون سؤال العميل).
     * body: { response_text, document_ids, share_with_assignment_ids }
     */
    shareInfo(id, actor, body) {
      const r = requireIr(id);
      if (!['pending_admin', 'sent_to_client', 'client_replied'].includes(r.status)) throw conflict('لا يمكن إتاحة هذا الطلب في حالته الحالية');
      const c = app.cases.requireOpen(r.case_id);
      const response = v.str(body.response_text, 'الرد المتاح للمحامي', { required: true, max: 10000 });
      const docIds = v.ids(body.document_ids, 'المستندات');
      for (const did of docIds) {
        const d = db.get('SELECT id FROM documents WHERE id = ? AND case_id = ?', did, c.id);
        if (!d) throw badRequest(`المستند ${did} لا ينتمي لهذا الملف`);
        db.run('UPDATE documents SET info_request_id = COALESCE(info_request_id, ?) WHERE id = ?', r.id, did);
      }
      const extra = v.ids(body.share_with_assignment_ids, 'أعضاء الفريق');
      const targets = new Set(extra);
      // صاحب الطلب يُضاف تلقائيًا ما دام في الفريق؛ إن سُحب إسناده يختار الموظف من يتسلم الرد بدلًا منه
      const requester = r.assignment_id ? db.get('SELECT status FROM assignments WHERE id = ?', r.assignment_id) : null;
      if (requester && requester.status !== 'withdrawn') targets.add(r.assignment_id);
      // v9.1 l-work: الطلبات المرتبطة («أحتاج هذا أيضًا») تكفي مستلمين للرد حين لا يوجد صاحب طلب أصلي في الفريق
      const hasLinked = !r.duplicate_of_id && !!db.get(
        `SELECT 1 FROM info_requests d JOIN assignments da ON da.id = d.assignment_id
         WHERE d.duplicate_of_id = ? AND d.status = 'pending_admin' AND da.status != 'withdrawn'`,
        r.id,
      );
      if (!targets.size && !hasLinked) {
        const team = Number(db.value("SELECT COUNT(*) FROM assignments WHERE case_id = ? AND status != 'withdrawn'", c.id));
        if (team) {
          throw badRequest(
            r.assignment_id
              ? 'المحامي صاحب الطلب لم يعد في الفريق؛ اختر عضوًا آخر لإتاحة الرد له'
              : 'اختر عضوًا واحدًا على الأقل من الفريق لإتاحة الرد له',
          );
        }
      }
      // v9.1 l-work: تمديد الموعد عند الرد على طلب المهلة (approve_extension) — في نفس المعاملة
      const approveExtension = r.kind === 'extension' && v.bool(body.approve_extension);
      if (approveExtension && !r.requested_due_at) throw badRequest('طلب المهلة لا يحدد موعدًا جديدًا');
      const extAssignment = approveExtension && r.assignment_id ? db.get("SELECT * FROM assignments WHERE id = ? AND status != 'withdrawn'", r.assignment_id) : null;
      if (approveExtension && !extAssignment) throw badRequest('المحامي صاحب طلب المهلة لم يعد في الفريق');
      // v9.1 l-work: من طلبوا الشيء نفسه («أحتاج هذا أيضًا») يصلهم الرد نفسه دون سؤال المستفيد/ة مرة أخرى
      const duplicates = r.duplicate_of_id ? [] : db.all("SELECT * FROM info_requests WHERE duplicate_of_id = ? AND status = 'pending_admin' ORDER BY id", r.id);
      const sharedTitle = (code) =>
        r.kind === 'admin_question'
          ? `ردّت الإدارة على سؤالك في الملف ${code}`
          : r.kind === 'extension'
            ? approveExtension
              ? `مُدّد موعد تسليم رأيك في الملف ${code} إلى ${arabicDate(r.requested_due_at)}، ${arabicTime(r.requested_due_at)}`
              : `ردّت الإدارة على طلب المهلة في الملف ${code}`
            : `أصبحت المعلومة المطلوبة متاحة في الملف ${code}`;
      const t = nowIso();
      db.tx(() => {
        db.update('info_requests', r.id, { status: 'shared', response_text: response, shared_at: t, shared_by: actor.id, updated_at: t, decided_by: r.decided_by ?? actor.id, decided_at: r.decided_at ?? t, extension_applied_at: approveExtension ? t : undefined });
        if (approveExtension) db.update('assignments', extAssignment.id, { due_at: r.requested_due_at, last_activity_at: t });
        for (const aid of targets) {
          const a = db.get("SELECT * FROM assignments WHERE id = ? AND case_id = ? AND status != 'withdrawn'", aid, c.id);
          if (!a) throw badRequest('عضو الفريق المختار غير صالح');
          for (const did of docIds) app.visibility.addGrant(a.id, 'document', did, actor);
          if (a.id !== r.assignment_id) app.visibility.addGrant(a.id, 'info_request', r.id, actor);
          app.notifications.notify(a.lawyer_id, {
            type: 'info_request.shared',
            title: sharedTitle(c.code),
            body: truncate(r.question, 140),
            link: `#/my/assignments/${a.id}${r.kind === 'extension' ? '' : '?tab=requests'}`,
          });
        }
        for (const d of duplicates) {
          const da = d.assignment_id ? db.get("SELECT * FROM assignments WHERE id = ? AND case_id = ? AND status != 'withdrawn'", d.assignment_id, c.id) : null;
          if (!da) continue;
          db.update('info_requests', d.id, { status: 'shared', response_text: response, shared_at: t, shared_by: actor.id, updated_at: t, decided_by: actor.id, decided_at: t });
          for (const did of docIds) app.visibility.addGrant(da.id, 'document', did, actor);
          if (!targets.has(da.id)) {
            app.notifications.notify(da.lawyer_id, {
              type: 'info_request.shared',
              title: `أصبحت المعلومة المطلوبة متاحة في الملف ${c.code}`,
              body: truncate(d.question, 140),
              link: `#/my/assignments/${da.id}?tab=requests`,
            });
          }
        }
      });
      app.activity.log({ case_id: c.id, actor, type: 'info_request.shared', summary: `راجعت الإدارة الرد وأتاحته للمحامي${docIds.length ? ` مع ${arabicCount(docIds.length, AR_UNITS.document)}` : ''}` });
      return requireIr(r.id);
    },

    cancelInfo(id, user) {
      const r = requireIr(id);
      if (user.role === 'lawyer') {
        if (r.requested_by !== user.id || r.status !== 'pending_admin') throw conflict('لا يمكن إلغاء هذا الطلب');
      } else if (['shared', 'rejected', 'cancelled'].includes(r.status)) throw conflict('لا يمكن إلغاء هذا الطلب');
      db.update('info_requests', r.id, { status: 'cancelled', updated_at: nowIso() });
      app.activity.log({ case_id: r.case_id, actor: user, type: 'info_request.cancelled', summary: 'أُلغي طلب المعلومات' });
      return requireIr(r.id);
    },

    // ======================= طلبات مساعدة محامٍ آخر =======================
    /** Request Counsel Assistance: رأي ثانٍ، رأي متخصص، مراجعة مستند، أو مشاركة محامٍ */
    createCounsel(assignmentId, lawyer, body) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      const c = app.cases.requireOpen(a.case_id);
      if (a.status === 'approved') throw conflict('تم اعتماد رأيك في هذا الملف بالفعل');
      const kind = v.oneOf(body.kind, ENUMS.counsel_kind, 'نوع المساعدة', { required: true });
      const specialty = v.oneOf(body.specialty, AREA_CODES, 'التخصص المطلوب', { required: kind === 'specialist_input' });
      const description = v.str(body.description, 'وصف المطلوب', { required: true, min: 10, max: 3000 });
      const grants = app.visibility.grantsOf(a.id);
      const issueIds = v.ids(body.issue_ids, 'المسائل');
      const docIds = v.ids(body.document_ids, 'المستندات');
      // المحامي لا يستطيع أن يشير إلا لما أُتيح له
      if (issueIds.some((x) => !grants.issue.has(x))) throw badRequest('يمكنك الإشارة فقط إلى المسائل المتاحة لك');
      if (docIds.some((x) => !grants.document.has(x))) throw badRequest('يمكنك الإشارة فقط إلى المستندات المتاحة لك');
      const t = nowIso();
      const id = db.insert('counsel_requests', {
        case_id: c.id,
        requester_assignment_id: a.id,
        kind,
        specialty,
        issue_ids: JSON.stringify(issueIds),
        document_ids: JSON.stringify(docIds),
        description,
        status: 'pending_admin',
        created_at: t,
        updated_at: t,
      });
      touchAssignment(a.id);
      app.activity.log({
        case_id: c.id,
        actor: lawyer,
        type: 'counsel_request.created',
        summary: `قدّم ${lawyer.name} طلب ${LABELS.counsel_kind[kind]}${specialty ? ` — ${AREA[specialty]}` : ''}`,
        data: { counsel_request_id: id },
      });
      app.notifications.notifyStaff(
        {
          type: 'counsel_request.pending',
          title: `طلب مساعدة محامٍ في الملف ${c.code}`,
          body: `${LABELS.counsel_kind[kind]}${specialty ? ` — ${AREA[specialty]}` : ''}: ${truncate(description, 120)}`,
          link: `#/cases/${c.id}`,
        },
        { caseManagerId: c.case_manager_id },
      );
      app.ai.feedbackOnCounsel(c.id, specialty, lawyer);
      return requireCr(id);
    },

    /**
     * الإدارة تختار المحامي المساعد وتحدد بدقة ما يراه.
     * body: { lawyer_id, role, brief, due_at, fee_mode, fee_amount, grants, share_with_requester }
     */
    assignCounsel(id, actor, body) {
      const r = requireCr(id);
      if (r.status !== 'pending_admin') throw conflict('تم البت في هذا الطلب بالفعل');
      const c = app.cases.requireOpen(r.case_id);
      const role = v.oneOf(body.role, ENUMS.assignment_role, 'الدور') || COUNSEL_ROLE[r.kind];
      if (role === 'lead') throw badRequest('لا يمكن إسناد طلب مساعدة بدور المحامي الأساسي');
      const grants = body.grants ?? app.visibility.defaultGrants(c.id, role, {
        issueIds: parseJson(r.issue_ids, []),
        documentIds: parseJson(r.document_ids, []),
      });
      const result = db.tx(() => {
        const { assignment, warnings } = app.cases.assign(
          c.id,
          {
            lawyer_id: body.lawyer_id,
            role,
            brief: body.brief ?? `${LABELS.counsel_kind[r.kind]}: ${r.description}`,
            due_at: body.due_at,
            fee_mode: body.fee_mode,
            fee_amount: body.fee_amount,
            grants,
            counsel_request_id: r.id,
            // الإدارة قد تحدد تخصصًا غير ما طلبه المحامي
            specialty: v.oneOf(body.specialty, AREA_CODES, 'التخصص المطلوب') || r.specialty,
          },
          actor,
        );
        const t = nowIso();
        db.update('counsel_requests', r.id, { status: 'assigned', assigned_assignment_id: assignment.id, decided_by: actor.id, decided_at: t, updated_at: t, admin_note: v.str(body.note, 'ملاحظة', { max: 2000 }) });
        // رأي المتخصص يظهر للمحامي الأساسي الذي طلبه (ما لم تقرر الإدارة غير ذلك)
        if (body.share_with_requester !== false) app.visibility.addGrant(r.requester_assignment_id, 'opinion', assignment.id, actor);
        return { assignment, warnings };
      });
      const requester = db.get('SELECT * FROM assignments WHERE id = ?', r.requester_assignment_id);
      app.notifications.notify(requester.lawyer_id, {
        type: 'counsel_request.assigned',
        title: `وافقت الإدارة على طلب المساعدة في الملف ${c.code}`,
        body: `أُسند الطلب إلى ${app.cases.lawyerName(result.assignment.lawyer_id)}`,
        link: `#/my/assignments/${requester.id}`,
      });
      app.activity.log({ case_id: c.id, actor, type: 'counsel_request.assigned', summary: `أسندت الإدارة طلب المساعدة إلى ${app.cases.lawyerName(result.assignment.lawyer_id)} بصلاحيات محددة` });
      return { request: requireCr(r.id), assignment: result.assignment, warnings: result.warnings };
    },

    rejectCounsel(id, actor, body) {
      const r = requireCr(id);
      if (r.status !== 'pending_admin') throw conflict('تم البت في هذا الطلب بالفعل');
      const note = v.str(body.note, 'سبب الرفض', { required: true, max: 2000 });
      const t = nowIso();
      db.update('counsel_requests', r.id, { status: 'rejected', admin_note: note, decided_by: actor.id, decided_at: t, updated_at: t });
      const c = app.cases.require(r.case_id);
      const requester = db.get('SELECT * FROM assignments WHERE id = ?', r.requester_assignment_id);
      app.notifications.notify(requester.lawyer_id, {
        type: 'counsel_request.rejected',
        title: `لم توافق الإدارة على طلب المساعدة في الملف ${c.code}`,
        body: truncate(note, 160),
        link: `#/my/assignments/${requester.id}`,
      });
      app.activity.log({ case_id: c.id, actor, type: 'counsel_request.rejected', summary: `رفضت الإدارة طلب المساعدة: ${truncate(note, 100)}` });
      return requireCr(r.id);
    },

    cancelCounsel(id, lawyer) {
      const r = requireCr(id);
      const requester = db.get('SELECT * FROM assignments WHERE id = ?', r.requester_assignment_id);
      if (requester.lawyer_id !== lawyer.id || r.status !== 'pending_admin') throw conflict('لا يمكن إلغاء هذا الطلب');
      db.update('counsel_requests', r.id, { status: 'cancelled', updated_at: nowIso() });
      app.activity.log({ case_id: r.case_id, actor: lawyer, type: 'counsel_request.cancelled', summary: 'ألغى المحامي طلب المساعدة' });
      return requireCr(r.id);
    },

    /** قائمة انتظار قرارات الإدارة */
    queue() {
      const t = nowIso();
      const caseCols = 'c.code AS case_code, c.title AS case_title, c.id AS case_id';
      return {
        info_requests: db.all(
          `SELECT r.*, ${caseCols}, u.name AS requested_by_name FROM info_requests r JOIN cases c ON c.id = r.case_id
           LEFT JOIN users u ON u.id = r.requested_by WHERE r.status = 'pending_admin' ORDER BY r.id`,
        ),
        client_replies: db
          .all(
            `SELECT r.*, ${caseCols}, u.name AS requested_by_name FROM info_requests r JOIN cases c ON c.id = r.case_id
             LEFT JOIN users u ON u.id = r.requested_by WHERE r.status = 'client_replied' ORDER BY r.replied_at`,
          )
          .map((r) => {
            // مرفقات رد العميل حتى تُتاح مع الرد ولا تسقط عند الإتاحة السريعة
            const documents = db.all('SELECT id, filename, title FROM documents WHERE info_request_id = ? ORDER BY id', r.id);
            return { ...r, documents, document_ids: documents.map((d) => d.id) };
          }),
        awaiting_client: db.all(
          `SELECT r.*, ${caseCols} FROM info_requests r JOIN cases c ON c.id = r.case_id WHERE r.status = 'sent_to_client' ORDER BY r.sent_at`,
        ),
        counsel_requests: db.all(
          `SELECT r.*, ${caseCols}, u.name AS requester_name FROM counsel_requests r JOIN cases c ON c.id = r.case_id
           JOIN assignments ra ON ra.id = r.requester_assignment_id JOIN users u ON u.id = ra.lawyer_id
           WHERE r.status = 'pending_admin' ORDER BY r.id`,
        ).map((r) => {
          const issueIds = parseJson(r.issue_ids, []);
          const docIds = parseJson(r.document_ids, []);
          return {
            ...r,
            issue_ids: issueIds,
            document_ids: docIds,
            issues: issueIds.map((iid) => db.get('SELECT id, number, title FROM case_issues WHERE id = ?', iid)).filter(Boolean),
            documents: docIds.map((did) => db.get('SELECT id, title, filename FROM documents WHERE id = ?', did)).filter(Boolean),
          };
        }),
        opinions: db.all(
          `SELECT o.id, o.version, o.submitted_at, o.assignment_id, a.role, u.name AS lawyer_name, ${caseCols}
           FROM opinions o JOIN assignments a ON a.id = o.assignment_id JOIN users u ON u.id = a.lawyer_id JOIN cases c ON c.id = o.case_id
           WHERE o.status = 'submitted' ORDER BY o.submitted_at`,
        ),
        proposed_issues: db.all(
          `SELECT i.*, ${caseCols}, u.name AS proposed_by_name FROM case_issues i JOIN cases c ON c.id = i.case_id
           LEFT JOIN users u ON u.id = i.proposed_by_user_id WHERE i.status = 'proposed' AND c.status != 'closed' ORDER BY i.id`,
        ),
        approved_unanswered: db.all(
          `SELECT ${caseCols}, c.updated_at FROM cases c WHERE c.status = 'approved' ORDER BY c.updated_at`,
        ),
        overdue_assignments: db.all(
          `SELECT a.id, a.due_at, a.role, a.status, u.name AS lawyer_name, ${caseCols} FROM assignments a
           JOIN users u ON u.id = a.lawyer_id JOIN cases c ON c.id = a.case_id
           WHERE a.status IN ('assigned','in_progress','returned') AND a.due_at < ? AND c.status != 'closed' ORDER BY a.due_at`,
          t,
        ),
        identity_conflicts: db.all(
          `SELECT m.id, m.intake_id, m.body, m.created_at, json_extract(m.meta, '$.identity_conflict.intake_code') AS referenced_code,
             json_extract(m.meta, '$.identity_conflict.intake_id') AS referenced_intake_id,
             json_extract(m.meta, '$.identity_conflict.client_code') AS referenced_client_code,
             (SELECT code FROM intakes WHERE id = m.intake_id) AS intake_code
           FROM messages m WHERE json_extract(m.meta, '$.identity_conflict') IS NOT NULL
             AND EXISTS (SELECT 1 FROM intakes i WHERE i.id = m.intake_id AND i.status IN ('new','in_review','awaiting_client'))
           ORDER BY m.id DESC LIMIT 20`,
        ),
      };
    },
  };
  return svc;
}
