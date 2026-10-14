// صندوق الوارد الموحد: فرز الطلبات الواردة من كل القنوات، والرد، والتعامل الداخلي، والتحويل إلى ملف.
import { nowIso, parseJson, badRequest, notFound, conflict, v } from '../util.js';
import { addressForm } from '../util.js'; // v9.2 بوابة N6
import { ApiError } from '../util.js'; // v11 segment-server
import { LABELS, LEGAL_AREAS, AREA_CODES, ENUMS } from '../constants.js';
import { mapMessage, isPortalUnverifiedIntake } from '../channels/engine.js';
// v9.2 (admin-ai): حالة القصة (SQL واحد) وترتيب الفرز واختيارات الموقع والمسار المقترح
import { STORY_VIEW_SQL, STORY_TRIAGE_RANK_SQL } from './stories.js';
import { STORY_TRACKS, STORY_AUTO_RULES } from '../constants.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const OPEN_STATUSES = ['new', 'in_review', 'awaiting_client'];
// v9.1 fixes: معاينة آخر رسالة في صندوق الوارد تتخطى رسالة تأكيد الرقم (رقم الطلب + كود التأكيد) والرد الآلي عليها
// (v9.2 [R2-A19]: ولا الرسائل الآلية للقصص — الترحيب و«احكيلنا» و«وصلتنا حكايتك» — حتى تبقى آخر رسالة منها ظاهرة)
const PREVIEW_SQL = `json_extract(m.meta, '$.identity_confirm') IS NULL AND COALESCE(m.automation_rule, '') != 'identity_confirm' AND COALESCE(m.automation_rule, '') NOT IN (${STORY_AUTO_RULES.map((r) => `'${r}'`).join(', ')})`;
const STORY_FILTERS = ['callback', 'collecting', 'ready', 'stale', 'awaiting', 'blocked', 'voice'];

export function createIntakes(app) {
  const { db } = app;

  const svc = {
    require(id) {
      const i = db.get('SELECT * FROM intakes WHERE id = ?', id);
      if (!i) throw notFound('الطلب غير موجود');
      return i;
    },

    list({ status, channel, source, q, area, priority, scope = 'open', limit = 100, offset = 0, story, track, sort, segment } = {}) {
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
        // v9.1 b-portal (B91-21): رقم الطلب القصير كما تقوله المستفيدة في التليفون («29» أو «29/2026»)
        const refs = app.portal?.shortRefCodes ? app.portal.shortRefCodes(q) : [];
        if (refs.length) {
          fWhere[fWhere.length - 1] = `(${fWhere[fWhere.length - 1]} OR i.code IN (${refs.map(() => '?').join(', ')}))`;
          fParams.push(...refs);
        }
      }
      // v9.2 [R2-A11]: المسار المقترح (من آخر تحليل كامل)
      if (track && STORY_TRACKS.includes(track)) {
        fWhere.push('i.ai_track = ?');
        fParams.push(track);
      }
      // v11 segment-server (§5.6): أعداد نوع الخدمة للطلبات المفتوحة تحت بقية المرشحات (قبل مرشح النوع نفسه)
      const segmentCounts = app.segments ? app.segments.counts(`${fWhere.join(' AND ')} AND i.status IN ('new','in_review','awaiting_client')`, fParams) : null;
      if (segment === 'charity' || segment === 'paid') {
        fWhere.push('i.segment = ?');
        fParams.push(segment);
      } else if (segment === 'unset') fWhere.push('i.segment IS NULL');
      where.push(...fWhere.slice(1));
      params.push(...fParams);
      // v9.2 [R2-A11]: حالة القصة من نفس تعريف SQL (لا يُعاد حسابها من نص الرسائل)
      if (story && STORY_FILTERS.includes(story)) {
        if (story === 'voice') where.push('i.voice_missing > 0');
        else {
          where.push(`(${STORY_VIEW_SQL}) = ?`);
          params.push(story);
        }
      }
      const base = `FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id WHERE ${where.join(' AND ')}`;
      // [R2-B8] ترتيب الفرز: طلبات المكالمة، ثم الجاهزة والمحجوبة معًا، ثم الأولوية، ثم الأقدم اكتمالًا أولًا
      const order =
        sort === 'triage'
          ? `${STORY_TRIAGE_RANK_SQL},
           CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           COALESCE(i.story_ready_at, i.last_inbound_at, i.created_at) ASC, i.id ASC`
          : `CASE i.status WHEN 'new' THEN 0 WHEN 'in_review' THEN 1 WHEN 'awaiting_client' THEN 2 ELSE 3 END,
           CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           COALESCE(i.last_message_at, i.created_at) DESC`;
      const rows = db.all(
        `SELECT i.*, cl.code AS client_code, cl.name AS client_name, cl.address_form AS client_address_form,
           (${STORY_VIEW_SQL}) AS story_view,
           (SELECT json_extract(m.meta, '$.call_note') FROM messages m WHERE m.intake_id = i.id AND m.direction = 'in' ORDER BY m.id DESC LIMIT 1) AS last_in_call_note,
           (SELECT COUNT(*) FROM call_attempts ca WHERE ca.intake_id = i.id) AS call_attempts_count,
           (SELECT COUNT(*) FROM documents d WHERE d.intake_id = i.id AND d.uploaded_by_kind = 'client' AND d.mime LIKE 'audio/%') AS voice_docs,
           (SELECT body FROM messages m WHERE m.intake_id = i.id AND ${PREVIEW_SQL} ORDER BY m.id DESC LIMIT 1) AS last_message,
           (SELECT direction FROM messages m WHERE m.intake_id = i.id AND ${PREVIEW_SQL} ORDER BY m.id DESC LIMIT 1) AS last_direction,
           (SELECT COUNT(*) FROM messages m WHERE m.intake_id = i.id) AS messages_count,
           (SELECT COUNT(*) FROM documents d WHERE d.intake_id = i.id) AS documents_count,
           (SELECT COUNT(*) FROM intakes o WHERE o.client_id = i.client_id AND o.id != i.id) AS client_other_intakes,
           (SELECT m.wa_line FROM messages m WHERE m.intake_id = i.id AND m.direction = 'in' AND m.channel = 'whatsapp' ORDER BY m.id DESC LIMIT 1) AS last_wa_line,
           (SELECT json_extract(m.meta, '$.line_mismatch.line') FROM messages m WHERE m.intake_id = i.id AND m.direction = 'in' AND json_extract(m.meta, '$.line_mismatch') IS NOT NULL ORDER BY m.id DESC LIMIT 1) AS line_mismatch_line
         ${base}
         ORDER BY ${order}
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
      // v9.2: عدد الطلبات المفتوحة في كل حالة قصة ضمن نفس الفلاتر (يطابق مجموع فلتر story=… لكل حالة)
      const storyCounts = { callback: 0, collecting: 0, ready: 0, stale: 0, awaiting: 0, blocked: 0, voice: 0 };
      for (const r of db.all(
        `SELECT (${STORY_VIEW_SQL}) AS v, COUNT(*) AS n, SUM(i.voice_missing > 0) AS voice FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id
         WHERE ${fWhere.join(' AND ')} AND i.status IN ('new','in_review','awaiting_client') GROUP BY v`,
        ...fParams,
      )) {
        if (r.v in storyCounts) storyCounts[r.v] = Number(r.n);
        storyCounts.voice += Number(r.voice) || 0;
      }
      return {
        total,
        counts,
        story_counts: storyCounts,
        segment_counts: segmentCounts, // v11 segment-server
        items: rows.map((r) => {
          // v9.2: آخر تحليل كامل، وإلا الملخص المبدئي أثناء كتابة القصة (preview)
          const ai = app.ai.latestStory ? app.ai.latestStory(r.id) : app.ai.latest('intake', r.id, 'intake_analysis');
          const story = app.stories ? app.stories.view(r) : null;
          if (story) story.voice.total = Number(r.voice_docs) || 0;
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
            // [بوابة 9.2 S1] طلب موقع غير مؤكد بلا اسم: لا نعرضه باسم صاحب الرقم المسجل
            contact_name: r.contact_name || (isPortalUnverifiedIntake(r) ? null : r.client_name),
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
                  // v9.2: سطر القصة والمسار المقترح وسببه
                  one_line: ai.output.one_line || null,
                  track: ai.output.recommended_track || null,
                  track_label: ai.output.recommended_track ? LABELS.story_track[ai.output.recommended_track] : null,
                  track_reason: ai.output.track_reason || null,
                  preview: !!ai.output.preview,
                  blocked: ai.output.blocked || null,
                  analyzed_at: ai.created_at,
                }
              : null,
            story,
            form: app.stories ? app.stories.formOf(r) : null,
            topic: r.topic || null,
            identity_unconfirmed: isPortalUnverifiedIntake(r),
            // [بوابة 9.2 N6] صيغة المخاطبة لنصوص الإدارة («اتصل به/بها»): لرقم غير مؤكد من الاسم الذي كتبه فقط
            address_form: isPortalUnverifiedIntake(r) ? addressForm({ name: r.contact_name }) : addressForm({ name: r.client_name || r.contact_name, address_form: r.client_address_form }),
            // v11 segment-server (§5.6): نوع الخدمة لكل طلب (الشريحة/الشارة في الواجهة)
            segment: r.segment ?? null,
            segment_source: r.segment_source ?? null,
            segment_hint: app.segments ? app.segments.hintOf(r) : null,
            wa_line: r.last_wa_line || r.wa_line || null,
            line_mismatch: r.line_mismatch_line ? { line: r.line_mismatch_line } : null,
            requester_kind: parseJson(r.form_answers, {})?.requester?.kind === 'company' ? 'company' : null,
          };
        }),
      };
    },

    /**
     * فتح الطلب من الإدارة: تصفير غير المقروء فقط. مجرد التصفح لا يغيّر الحالة ولا يُسند الفرز لمن فتحه
     * (حتى لا يسحب زميل يتصفح الطلبات طلبًا من عداد «جديد»)؛ الإسناد يحدث مع أول إجراء فرز (startTriage).
     */
    markRead(id) {
      const i = svc.require(id);
      if (i.unread_count) db.update('intakes', i.id, { unread_count: 0 });
    },

    /**
     * أول إجراء فرز فعلي (رد، تعديل، تأكيد هوية، قرار): «جديد» ← «قيد الفرز»، ويُسند الفرز لمن قام بالإجراء
     * إن لم يكن مسندًا لأحد. assign=false عندما يحدد الإجراء نفسه المسؤول عن الفرز.
     */
    startTriage(id, actor, { assign = true } = {}) {
      const i = svc.require(id);
      if (!actor?.id) return i;
      const patch = {};
      if (i.status === 'new') patch.status = 'in_review';
      if (assign && !i.assigned_staff_id && ['admin', 'case_manager'].includes(actor.role)) patch.assigned_staff_id = actor.id;
      if (!Object.keys(patch).length) return i;
      db.update('intakes', i.id, patch);
      if (patch.status) {
        app.activity.log({ intake_id: i.id, client_id: i.client_id, actor, type: 'intake.triage_started', summary: `بدأ ${actor.name} فرز الطلب` });
      }
      return svc.require(i.id);
    },

    /** فتح الطلب وبدء فرزه معًا (تستخدمه البيانات التجريبية) */
    markSeen(id, actor) {
      svc.markRead(id);
      return svc.startTriage(id, actor);
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
      // v9.2: آخر تحليل كامل، وإلا الملخص المبدئي (preview) أثناء كتابة القصة
      const ai = app.ai.latestStory ? app.ai.latestStory(i.id) : app.ai.latest('intake', i.id, 'intake_analysis');
      const sd = parseJson(i.source_detail, {});
      // v9.1 b-forms: مُجزّأ كود التأكيد لا يغادر الخادم (6 أرقام فقط يسهل تخمينها من المُجزّأ)
      delete sd.confirm_hash;
      return {
        intake: {
          ...i,
          channels: parseJson(i.channels, []),
          source_detail: sd,
          identity: {
            phone_match_unverified: !!sd.phone_match_unverified,
            // رقم من نموذج الموقع لم يُثبت أن مقدّم الطلب صاحبه: الطلب لا يظهر في بوابة صاحب الرقم حتى التأكيد
            phone_unverified: isPortalUnverifiedIntake(i),
            confirmed_at: sd.identity_confirmed_at || null,
            confirmed_by_name: sd.identity_confirmed_by_name || null,
            // v9.1 b-site (B91-01): أين يصل الرد؟ «واتساب + صفحة المتابعة» أو «صفحة المتابعة فقط — الرقم غير مؤكد»
            confirmed_via: sd.identity_confirmed_via || null,
            reply_channel: i.client_id && app.engine?.channelHint ? app.engine.channelHint({ clientId: i.client_id, intakeId: i.id }) : null,
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
        // v11 segment-server (§5.6، L11-61): نوع الخدمة، والنبرة، والرقم الذي سيُرسل منه
        ...(app.segments
          ? {
              segment: app.segments.intakeBlock(i),
              tone: app.segments.tone(i),
              send_line: i.client_id ? app.segments.sendLine({ clientId: i.client_id, intakeId: i.id }) : null,
            }
          : {}),
        // v9.2 (admin-ai): القصة واختيارات الموقع والاقتراح والرسائل الصوتية ومحاولات الاتصال
        ...(app.stories
          ? {
              story: app.stories.storyOf(i.id),
              form: app.stories.formOf(i),
              proposal: app.stories.proposal(i.id),
              voice_notes: app.voice ? app.voice.listForIntake(i.id) : [],
              call_attempts: app.stories.attempts(i.id).items,
            }
          : {}),
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
      // تعديل بيانات الطلب إجراء فرز: يبدأ الفرز (ما لم يحدد التعديل المسؤول عن الفرز بنفسه)
      if (OPEN_STATUSES.includes(i.status)) return svc.startTriage(i.id, actor, { assign: body.assigned_staff_id === undefined });
      return svc.require(i.id);
    },

    /** [R2-A13/S-32] meta معامل داخلي رابع (أسئلة «نسألها الأول» من stories.accept)؛ body.meta من المسار يُتجاهل دائمًا */
    reply(id, body, actor, { meta } = {}) {
      const i = svc.require(id);
      const text = v.str(body.body, 'نص الرد', { required: true, max: 4000 });
      const msg = app.engine.sendToClient({
        client_id: i.client_id,
        intake_id: i.id,
        case_id: i.case_id,
        body: text,
        channel: body.channel || 'auto',
        author: actor,
        ...(meta && typeof meta === 'object' ? { meta } : {}),
      });
      // الرد أول إجراء فرز: «قيد الفرز» ويُسند الفرز لمن رد إن لم يكن مسندًا
      if (OPEN_STATUSES.includes(i.status)) svc.startTriage(i.id, actor);
      const patch = { updated_at: nowIso() };
      if (body.await_client && ['new', 'in_review'].includes(i.status)) patch.status = 'awaiting_client';
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
      svc.startTriage(i.id, actor); // من بتّ في الطلب هو المسؤول عن فرزه إن لم يكن مسندًا لأحد
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
      svc.startTriage(i.id, actor);
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
      // طلب طابق رقمه عميلًا مسجلًا، أو أي طلب من نموذج الموقع لم يُثبت أن مقدّمه صاحب الرقم
      if (!isPortalUnverifiedIntake(i)) throw conflict('لا يحتاج هذا الطلب إلى تأكيد هوية، أو تم تأكيدها بالفعل');
      if (OPEN_STATUSES.includes(i.status)) svc.startTriage(i.id, actor);
      if (app.engine?.confirmStory) {
        // v9.1 b-site (B91-01): نفس مسار التأكيد برسالة واتساب (رقم الطلب + كود التأكيد)؛ بعده تصل الرسائل على واتساب
        app.engine.confirmStory(svc.require(i.id), 'staff', actor);
      } else {
        delete sd.phone_match_unverified;
        sd.identity_confirmed_at = nowIso();
        sd.identity_confirmed_by = actor.id;
        sd.identity_confirmed_by_name = actor.name;
        db.update('intakes', i.id, { source_detail: JSON.stringify(sd), updated_at: nowIso() });
      }
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
      // v11 segment-server (§5.6): «غير محدد» بلا اختيار ← 409 segment_required، واختيار مختلف = تغيير مسجل («عند اعتماد القرار»)
      const segWanted = svc.segmentParam(body.segment);
      if (i.segment === null && !segWanted) throw new ApiError(409, 'اختاروا نوع الخدمة أولًا.', 'segment_required', { hint: app.segments?.hintOf?.(i) ?? null });
      const caseRow = db.tx(() => {
        if (segWanted && segWanted !== i.segment) app.segments.setIntake(i.id, segWanted, { actor, reason: i.segment === null ? undefined : 'عند اعتماد القرار', via: 'accept' });
        svc.startTriage(i.id, actor);
        if (body.client) app.clients.update(i.client_id, body.client, actor);
        const c = app.cases.createFromIntake(db.get('SELECT * FROM intakes WHERE id = ?', i.id), body, actor);
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
      // v11 segment-server: نوع الخدمة من نموذج الإدارة (الواجهة تلزمه؛ بدونه «خيري» كما كان)، المصدر «سجلته الإدارة»
      const segment = svc.segmentParam(body.segment) || 'charity';
      const r = app.engine.receive({
        segment,
        segment_source: 'manual',
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

    /** v11 segment-server: قيمة segment من طلب الإدارة (فارغ ← null؛ قيمة غير معروفة ← 400) */
    segmentParam(raw) {
      if (raw === undefined || raw === null || raw === '') return null;
      if (raw !== 'charity' && raw !== 'paid') throw new ApiError(400, 'نوع الخدمة غير صالح.', 'bad_request', { fields: { segment: 'نوع الخدمة غير صالح.' } });
      return raw;
    },

    /** دمج عميل الطلب مع عميل موجود (نفس الشخص من رقم آخر) */
    linkClient(id, clientId, actor) {
      const i = svc.require(id);
      if (!i.client_id) throw badRequest('لا يوجد عميل مرتبط بالطلب');
      const target = app.clients.require(clientId);
      if (target.company_id) throw Object.assign(conflict('هذا حساب داخلي لشركة عميلة؛ لا يُربط بطلب فرد.'), { code: 'company_client' }); // v10 b2b-server (حارس #11)
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
