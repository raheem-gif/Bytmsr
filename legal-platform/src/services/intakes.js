// صندوق الوارد الموحد: فرز الطلبات الواردة من كل القنوات، والرد، والتعامل الداخلي، والتحويل إلى ملف.
import { nowIso, parseJson, badRequest, notFound, conflict, v } from '../util.js';
import { LABELS, LEGAL_AREAS, AREA_CODES, ENUMS } from '../constants.js';
import { mapMessage } from '../channels/engine.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const OPEN_STATUSES = ['new', 'in_review', 'awaiting_client'];

export function createIntakes(app) {
  const { db } = app;

  const svc = {
    require(id) {
      const i = db.get('SELECT * FROM intakes WHERE id = ?', id);
      if (!i) throw notFound('الطلب غير موجود');
      return i;
    },

    list({ status, channel, source, q, area, priority, scope = 'open', limit = 100, offset = 0 } = {}) {
      const where = ['1=1'];
      const params = [];
      // شروط الفلاتر غير الحالة (تُستخدم أيضًا لحساب عدد كل حالة ضمن نفس الفلاتر)
      const fWhere = ['1=1'];
      const fParams = [];
      if (status && ENUMS.intake_status.includes(status)) {
        where.push('i.status = ?');
        params.push(status);
      } else if (scope === 'open') {
        where.push("i.status IN ('new','in_review','awaiting_client')");
      }
      if (channel && ENUMS.channel.includes(channel)) {
        fWhere.push('(i.first_channel = ? OR i.channels LIKE ?)');
        fParams.push(channel, `%"${channel}"%`);
      }
      if (source && ENUMS.source.includes(source)) {
        fWhere.push('i.source = ?');
        fParams.push(source);
      }
      if (area && AREA_CODES.includes(area)) {
        fWhere.push('i.legal_area = ?');
        fParams.push(area);
      }
      if (priority === 'high_or_urgent') fWhere.push("i.priority IN ('high','urgent')");
      else if (priority && ENUMS.priority.includes(priority)) {
        fWhere.push('i.priority = ?');
        fParams.push(priority);
      }
      if (q) {
        const like = `%${String(q).trim()}%`;
        fWhere.push(
          '(i.code LIKE ? OR i.title LIKE ? OR i.contact_name LIKE ? OR i.contact_phone LIKE ? OR cl.code LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.intake_id = i.id AND m.body LIKE ?))',
        );
        fParams.push(like, like, like, like, like, like);
      }
      where.push(...fWhere.slice(1));
      params.push(...fParams);
      const base = `FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id WHERE ${where.join(' AND ')}`;
      const rows = db.all(
        `SELECT i.*, cl.code AS client_code, cl.name AS client_name,
           (SELECT body FROM messages m WHERE m.intake_id = i.id ORDER BY m.id DESC LIMIT 1) AS last_message,
           (SELECT direction FROM messages m WHERE m.intake_id = i.id ORDER BY m.id DESC LIMIT 1) AS last_direction,
           (SELECT COUNT(*) FROM messages m WHERE m.intake_id = i.id) AS messages_count,
           (SELECT COUNT(*) FROM documents d WHERE d.intake_id = i.id) AS documents_count,
           (SELECT COUNT(*) FROM intakes o WHERE o.client_id = i.client_id AND o.id != i.id) AS client_other_intakes
         ${base}
         ORDER BY CASE i.status WHEN 'new' THEN 0 WHEN 'in_review' THEN 1 WHEN 'awaiting_client' THEN 2 ELSE 3 END,
           CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           COALESCE(i.last_message_at, i.created_at) DESC
         LIMIT ? OFFSET ?`,
        ...params,
        Math.min(Number(limit) || 100, 500),
        Number(offset) || 0,
      );
      const total = Number(db.value(`SELECT COUNT(*) ${base}`, ...params));
      // أعداد الحالات ضمن نفس الفلاتر (القناة/المصدر/المجال/البحث) حتى تطابق التبويبات القائمة المعروضة
      const counts = Object.fromEntries(
        db
          .all(`SELECT i.status, COUNT(*) AS n FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id WHERE ${fWhere.join(' AND ')} GROUP BY i.status`, ...fParams)
          .map((r) => [r.status, Number(r.n)]),
      );
      return {
        total,
        counts,
        items: rows.map((r) => {
          const ai = app.ai.latest('intake', r.id, 'intake_analysis');
          return {
            id: r.id,
            code: r.code,
            status: r.status,
            kind: r.kind,
            priority: r.priority,
            first_channel: r.first_channel,
            channels: parseJson(r.channels, []),
            source: r.source,
            campaign: r.campaign,
            title: r.title,
            legal_area: r.legal_area,
            contact_name: r.contact_name || r.client_name,
            client_code: r.client_code,
            client_id: r.client_id,
            returning_client: Number(r.client_other_intakes) > 0,
            last_message: r.last_message,
            last_direction: r.last_direction,
            messages_count: Number(r.messages_count),
            documents_count: Number(r.documents_count),
            unread_count: r.unread_count,
            case_id: r.case_id,
            last_message_at: r.last_message_at,
            created_at: r.created_at,
            ai: ai
              ? {
                  title: ai.output.title,
                  legal_area: ai.output.legal_area,
                  urgency: ai.output.urgency,
                  similar_count: ai.output.similar?.total || 0,
                  missing_count: (ai.output.missing_info || []).length,
                  provider: ai.provider,
                }
              : null,
          };
        }),
      };
    },

    /** فتح الطلب من الإدارة: تصفير غير المقروء وبدء الفرز */
    markSeen(id, actor) {
      const i = svc.require(id);
      const patch = { unread_count: 0 };
      if (i.status === 'new') patch.status = 'in_review';
      if (!i.assigned_staff_id) patch.assigned_staff_id = actor.id;
      db.update('intakes', i.id, patch);
      if (i.status === 'new') {
        app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.triage_started', summary: `بدأ ${actor.name} فرز الطلب` });
      }
    },

    detail(id) {
      const i = svc.require(id);
      const client = i.client_id ? app.clients.get(i.client_id) : null;
      const docs = db.all('SELECT * FROM documents WHERE intake_id = ? ORDER BY id', i.id);
      const docsByMessage = new Map();
      for (const d of docs) {
        if (!d.message_id) continue;
        if (!docsByMessage.has(d.message_id)) docsByMessage.set(d.message_id, []);
        docsByMessage.get(d.message_id).push(app.documents.publicView(d));
      }
      const messages = db
        .all(
          `SELECT m.*, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_user_id
           WHERE m.intake_id = ? ORDER BY m.id`,
          i.id,
        )
        .map((m) => mapMessage(m, docsByMessage));
      const ai = app.ai.latest('intake', i.id, 'intake_analysis');
      const sd = parseJson(i.source_detail, {});
      return {
        intake: {
          ...i,
          channels: parseJson(i.channels, []),
          source_detail: sd,
          identity: {
            phone_match_unverified: !!sd.phone_match_unverified,
            confirmed_at: sd.identity_confirmed_at || null,
            confirmed_by_name: sd.identity_confirmed_by_name || null,
          },
          active_portal_links: i.client_id ? app.clients.activePortalLinks(i.client_id, { intakeId: i.id }) : 0,
        },
        client: client
          ? {
              ...client,
              phone: app.clients.primaryPhone(client.id),
              identities: app.clients.identities(client.id),
              other_intakes: db.all(
                'SELECT id, code, status, title, created_at, case_id FROM intakes WHERE client_id = ? AND id != ? ORDER BY id DESC',
                client.id,
                i.id,
              ),
              cases: db.all('SELECT id, code, title, status, legal_area, created_at FROM cases WHERE client_id = ? ORDER BY id DESC', client.id),
            }
          : null,
        messages,
        documents: docs.map((d) => app.documents.publicView(d)),
        ai,
        ai_status: app.ai.status(),
        feedback: db.all('SELECT * FROM ai_feedback WHERE entity_type = ? AND entity_id = ? ORDER BY id', 'intake', i.id),
        case: i.case_id ? db.get('SELECT id, code, title, status FROM cases WHERE id = ?', i.case_id) : null,
        activity: app.activity.forIntake(i.id),
        staff: db.all("SELECT id, name, role FROM users WHERE role IN ('admin','case_manager') AND active = 1 ORDER BY name"),
      };
    },

    update(id, body, actor) {
      const i = svc.require(id);
      const patch = { updated_at: nowIso() };
      if (body.title !== undefined) patch.title = v.str(body.title, 'العنوان', { max: 200 });
      if (body.summary !== undefined) patch.summary = v.str(body.summary, 'الملخص', { max: 5000 });
      if (body.legal_area !== undefined) patch.legal_area = v.oneOf(body.legal_area, AREA_CODES, 'المجال القانوني');
      if (body.kind !== undefined) patch.kind = v.oneOf(body.kind, ENUMS.intake_kind, 'نوع الطلب');
      if (body.priority !== undefined) patch.priority = v.oneOf(body.priority, ENUMS.priority, 'الأولوية', { required: true });
      if (body.internal_notes !== undefined) patch.internal_notes = v.str(body.internal_notes, 'الملاحظات الداخلية', { max: 10000 });
      if (body.source !== undefined) patch.source = v.oneOf(body.source, ENUMS.source, 'مصدر العميل', { required: true });
      if (body.campaign !== undefined) patch.campaign = v.str(body.campaign, 'الحملة', { max: 150 });
      if (body.assigned_staff_id !== undefined) {
        const sid = v.int(body.assigned_staff_id, 'المسؤول عن الفرز', { min: 1 });
        if (sid && !db.get("SELECT 1 FROM users WHERE id = ? AND role IN ('admin','case_manager') AND active = 1", sid)) throw badRequest('المستخدم المختار غير صالح');
        patch.assigned_staff_id = sid;
      }
      if (body.status !== undefined) {
        const st = v.oneOf(body.status, ['in_review', 'awaiting_client'], 'الحالة', { required: true });
        // الحالات المنتهية لا تُعكس بتعديل عادي؛ إعادة الفتح إجراء مستقل يُسجَّل في السجل
        if (!OPEN_STATUSES.includes(i.status)) throw conflict(i.status === 'converted' ? 'لا يمكن تغيير حالة طلب تحول إلى ملف' : 'أعد فتح الطلب أولًا');
        patch.status = st;
      }
      db.update('intakes', i.id, patch);
      return svc.require(i.id);
    },

    reply(id, body, actor) {
      const i = svc.require(id);
      const text = v.str(body.body, 'نص الرد', { required: true, max: 4000 });
      const msg = app.engine.sendToClient({
        client_id: i.client_id,
        intake_id: i.id,
        case_id: i.case_id,
        body: text,
        channel: body.channel || 'auto',
        author: actor,
      });
      const patch = { updated_at: nowIso() };
      if (body.await_client && ['new', 'in_review'].includes(i.status)) patch.status = 'awaiting_client';
      else if (i.status === 'new') patch.status = 'in_review';
      db.update('intakes', i.id, patch);
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'message.sent', summary: `ردت الإدارة على العميل عبر ${LABELS.channel[msg.channel]}` });
      return msg;
    },

    /** الطلب بسيط ولا يحتاج إلى شراء وقت محامٍ: تتعامل معه الإدارة داخليًا */
    handleInternally(id, body, actor) {
      const i = svc.require(id);
      if (['converted', 'handled_internally', 'archived'].includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      const note = v.str(body.resolution_note, 'ملخص ما تم', { required: true, max: 3000 });
      const area = body.legal_area !== undefined ? v.oneOf(body.legal_area, AREA_CODES, 'المجال القانوني') : i.legal_area;
      if (body.reply) {
        app.engine.sendToClient({ client_id: i.client_id, intake_id: i.id, body: v.str(body.reply, 'نص الرد', { required: true, max: 4000 }), channel: body.channel || 'auto', author: actor });
      }
      db.update('intakes', i.id, {
        status: 'handled_internally',
        kind: i.kind || 'inquiry',
        legal_area: area,
        resolution_note: note,
        unread_count: 0,
        updated_at: nowIso(),
      });
      const sug = app.ai.latest('intake', i.id, 'intake_analysis');
      if (sug && area) {
        app.ai.recordFeedback({
          suggestion_id: sug.id, entity_type: 'intake', entity_id: i.id, field: 'legal_area',
          verdict: sug.output.legal_area === area ? 'accepted' : 'corrected', ai_value: sug.output.legal_area, final_value: area, actor, replace: true,
        });
      }
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.handled_internally', summary: 'تعاملت الإدارة مع الطلب داخليًا دون إسناده لمحامٍ', data: { note } });
      return svc.require(i.id);
    },

    archive(id, body, actor) {
      const i = svc.require(id);
      if (i.status === 'converted') throw conflict('لا يمكن أرشفة طلب تحول إلى ملف');
      if (!OPEN_STATUSES.includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
      const reason = v.str(body.reason, 'سبب الأرشفة', { required: true, max: 500 });
      db.tx(() => {
        db.update('intakes', i.id, { status: 'archived', resolution_note: reason, unread_count: 0, updated_at: nowIso() });
        app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.archived', summary: `أُرشف الطلب: ${reason}` });
        // طلب من الموقع برقم غير موثّق: نلغي رابط بوابته عند أرشفته حتى لا يبقى منفذًا لبيانات صاحب الرقم
        if (i.client_id && parseJson(i.source_detail, {}).phone_match_unverified) {
          const n = app.clients.revokePortalTokens(i.client_id, { intakeId: i.id });
          if (n) app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'portal.revoked', summary: 'أُلغي رابط البوابة الخاص بالطلب تلقائيًا عند الأرشفة (رقم غير موثّق)' });
        }
      });
      return svc.require(i.id);
    },

    /** تأكيد أن مقدم الطلب من الموقع هو صاحب رقم الهاتف المسجل (بعد تحقق الإدارة) */
    confirmIdentity(id, actor) {
      const i = svc.require(id);
      const sd = parseJson(i.source_detail, {});
      if (!sd.phone_match_unverified) throw conflict('لا يحتاج هذا الطلب إلى تأكيد هوية، أو تم تأكيدها بالفعل');
      delete sd.phone_match_unverified;
      sd.identity_confirmed_at = nowIso();
      sd.identity_confirmed_by = actor.id;
      sd.identity_confirmed_by_name = actor.name;
      db.update('intakes', i.id, { source_detail: JSON.stringify(sd), updated_at: nowIso() });
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'identity.confirmed', summary: 'أكّدت الإدارة أن مقدم الطلب هو صاحب رقم الهاتف المسجل' });
      return { ok: true };
    },

    /** إلغاء كل روابط البوابة الخاصة بهذا الطلب */
    revokePortal(id, actor) {
      const i = svc.require(id);
      const revoked = i.client_id ? app.clients.revokePortalTokens(i.client_id, { intakeId: i.id }) : 0;
      if (revoked) app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'portal.revoked', summary: 'ألغت الإدارة رابط البوابة الخاص بالطلب' });
      return { revoked };
    },

    reopen(id, actor) {
      const i = svc.require(id);
      if (!['handled_internally', 'archived'].includes(i.status)) throw conflict('الطلب مفتوح بالفعل أو تحول إلى ملف');
      db.update('intakes', i.id, { status: 'in_review', updated_at: nowIso() });
      app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.reopened', summary: 'أُعيد فتح الطلب للفرز' });
      return svc.require(i.id);
    },

    /**
     * تحويل الطلب إلى ملف استشارة له كود مستقل (مثل INH-2026-00482).
     * body: { legal_area, title, facts_internal, facts_shared, issues: [{title, details, legal_area, origin}], priority, due_at, case_manager_id,
     *         client: { name, national_id, governorate } }
     */
    convert(id, body, actor) {
      const i = svc.require(id);
      if (i.status === 'converted') throw conflict('هذا الطلب تحول بالفعل إلى ملف', { case_id: i.case_id });
      if (!OPEN_STATUSES.includes(i.status)) throw conflict('أعد فتح الطلب أولًا قبل تحويله إلى ملف');
      if (!i.client_id) throw badRequest('لا يوجد عميل مرتبط بالطلب');
      const caseRow = db.tx(() => {
        if (body.client) app.clients.update(i.client_id, body.client, actor);
        const c = app.cases.createFromIntake(i, body, actor);
        // ربط الملف الجديد ببرنامج تمويل اختاره الموظف عند التحويل (وحدة programs)
        if (body.program_id) app.programs.linkCase(c.id, body.program_id, actor, { force: true });
        db.update('intakes', i.id, {
          status: 'converted',
          kind: 'consultation',
          case_id: c.id,
          title: c.title,
          legal_area: c.legal_area,
          summary: i.summary || body.facts_shared || null,
          unread_count: 0,
          updated_at: nowIso(),
        });
        app.activity.log({
          intake_id: i.id,
          case_id: c.id,
          client_id: i.client_id,
          actor,
          type: 'intake.converted',
          summary: `قررت الإدارة أن الطلب يستحق ملفًا قانونيًا، وصدر له الكود ${c.code} (${AREA[c.legal_area]})`,
          data: { case_code: c.code },
        });
        app.ai.feedbackOnConversion(i.id, c.id, { legal_area: c.legal_area, title: c.title }, actor);
        app.practice?.onCaseCreated(c, actor); // v9 practice: فحص تعارض المصالح للعميل (لا يوقف التحويل)
        if (Array.isArray(body.issues) && body.ai_suggestion_id) {
          const sug = app.ai.suggestion(Number(body.ai_suggestion_id));
          if (sug) {
            const aiTitles = (sug.output.suggested_issues || []).map((x) => x.title);
            const chosen = body.issues.map((x) => x.title);
            const accepted = chosen.filter((t) => aiTitles.includes(t)).length;
            app.ai.recordFeedback({
              suggestion_id: sug.id, entity_type: 'intake', entity_id: i.id, case_id: c.id, field: 'issues',
              verdict: accepted === aiTitles.length && chosen.length === aiTitles.length ? 'accepted' : accepted > 0 ? 'corrected' : 'rejected',
              ai_value: aiTitles, final_value: chosen, actor, replace: true,
            });
          }
        }
        return c;
      });
      return caseRow;
    },

    /** إنشاء طلب يدويًا (مكالمة هاتفية، حضور شخصي، بريد) — باب ثالث ورابع لنفس المحرك */
    createManual(body, actor) {
      const channel = v.oneOf(body.channel, ['phone', 'walk_in', 'email'], 'قناة الطلب', { required: true });
      const phone = v.phone(body.phone, 'رقم الهاتف', { required: channel !== 'email' });
      const email = v.email(body.email, 'البريد الإلكتروني', { required: channel === 'email' });
      const text = v.str(body.text, 'وصف الطلب', { required: true, max: 20000 });
      const source = v.oneOf(body.source, ENUMS.source, 'مصدر العميل') || 'unknown';
      const r = app.engine.receive({
        channel,
        from_phone: phone,
        from_email: email,
        contact_name: v.str(body.name, 'الاسم', { max: 150 }),
        governorate: v.str(body.governorate, 'المحافظة', { max: 50 }),
        text,
        attribution: { source, campaign: v.str(body.campaign, 'الحملة', { max: 150 }), detail: { entered_by: actor.name } },
        force_new_intake: true,
      });
      app.activity.log({ intake_id: r.intake.id, client_id: r.client.id, actor, type: 'intake.manual', summary: `سجّل ${actor.name} الطلب يدويًا (${LABELS.channel[channel]})` });
      return r.intake;
    },

    /** دمج عميل الطلب مع عميل موجود (نفس الشخص من رقم آخر) */
    linkClient(id, clientId, actor) {
      const i = svc.require(id);
      if (!i.client_id) throw badRequest('لا يوجد عميل مرتبط بالطلب');
      const target = app.clients.require(clientId);
      if (target.id === i.client_id) return app.clients.get(target.id);
      return app.clients.merge(target.id, i.client_id, actor);
    },

    aiFeedback(id, body, actor) {
      const i = svc.require(id);
      const sug = app.ai.latest('intake', i.id, 'intake_analysis');
      if (!sug) throw badRequest('لا يوجد تحليل للذكاء الاصطناعي لهذا الطلب');
      app.ai.recordFeedback({
        suggestion_id: sug.id,
        entity_type: 'intake',
        entity_id: i.id,
        case_id: i.case_id,
        field: v.oneOf(body.field, ENUMS.ai_field, 'الحقل', { required: true }),
        verdict: v.oneOf(body.verdict, ENUMS.ai_verdict, 'التقييم', { required: true }),
        ai_value: body.ai_value ?? null,
        final_value: body.final_value ?? null,
        note: v.str(body.note, 'ملاحظة', { max: 1000 }),
        actor,
      });
      return { ok: true };
    },
  };
  return svc;
}
