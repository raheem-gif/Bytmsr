// محرك الاستقبال الموحد (Intake Engine) والإرسال الموحد.
// الموقع وواتساب (وأي قناة مستقبلية) مجرد «أبواب» تصل إلى نفس المكان:
// كل رسالة واردة تُوحَّد، يُحدَّد عميلها، ثم تُلحق بالطلب أو الملف المفتوح بدل إنشاء قصة منفصلة.
import { nowIso, addHours, parseJson, badRequest, notFound, cairoYear, truncate } from '../util.js';
import { CODE_PREFIX, LABELS } from '../constants.js';
import { parseWebhook, sourceFromReferral } from './whatsapp.js';

const REF_RE = /REQ-(\d{4})-(\d{5})/i;

/** استنتاج مصدر العميل من بيانات الموقع (UTM / Referrer / رمز جهة الإحالة) */
export function sourceFromWebAttribution(attr = {}) {
  const a = attr || {};
  const src = String(a.utm_source || '').toLowerCase();
  const medium = String(a.utm_medium || '').toLowerCase();
  const ref = String(a.referrer || '').toLowerCase();
  const paid = /cpc|ppc|paid|ad|ads|sponsored|display/.test(medium);
  const detail = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'referrer', 'landing_path']) {
    if (a[k]) detail[k] = String(a[k]).slice(0, 300);
  }
  const campaign = a.utm_campaign ? String(a.utm_campaign).slice(0, 150) : null;
  if (a.ref) return { source: 'referral', campaign: campaign || String(a.ref).slice(0, 100), detail };
  if (/^(fb|facebook|meta)/.test(src)) return { source: paid || !medium ? 'facebook_ad' : 'social_organic', campaign, detail };
  if (/^(ig|instagram)/.test(src)) return { source: paid || !medium ? 'instagram_ad' : 'social_organic', campaign, detail };
  if (/google/.test(src) || /google\./.test(ref)) return { source: 'google', campaign, detail };
  if (src) return { source: 'other', campaign, detail };
  if (/facebook\.|instagram\.|t\.co|twitter\.|x\.com|tiktok\.|linkedin\./.test(ref)) return { source: 'social_organic', campaign, detail };
  if (ref && !ref.includes('localhost')) return { source: 'other', campaign, detail };
  return { source: 'direct', campaign, detail };
}

export function createEngine(app) {
  const { db, config } = app;

  function nextIntakeCode(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`intake:${y}`, 1);
    return `${CODE_PREFIX.intake}-${y}-${String(n).padStart(5, '0')}`;
  }

  /** آخر قناة وارد استخدمها العميل (لاختيار قناة الرد تلقائيًا) */
  function lastInbound(clientId) {
    return db.get(
      "SELECT channel, created_at FROM messages WHERE client_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1",
      clientId,
    );
  }

  // طلب أنشأه نموذج الموقع برقم عميل مسجل ولم تتحقق الإدارة بعد من أن المرسل صاحب الرقم
  const UNVERIFIED_SQL = "COALESCE(json_extract(source_detail, '$.phone_match_unverified'), 0) = 1";
  const isUnverifiedIntake = (i) => !!i && !!parseJson(i.source_detail, {}).phone_match_unverified;

  /**
   * verifiedSender: المرسل أثبت ملكية الرقم (واتساب) أو دخل برابط بوابة العميل الكامل.
   * هذا المرسل لا تُوجَّه رسائله تلقائيًا إلى طلب غير موثّق أنشأه شخص آخر من الموقع بنفس الرقم،
   * وإلا وصلت رسائل صاحب الرقم إلى رابط بوابة ذلك الشخص.
   */
  function findTarget(client, { refIntake, forceNew, caseId, intakeId, verifiedSender }) {
    if (intakeId) {
      // رسالة من رابط بوابة خاص بطلب بعينه
      const i = db.get('SELECT * FROM intakes WHERE id = ? AND client_id = ?', intakeId, client.id);
      if (i) {
        const c = i.case_id ? db.get('SELECT * FROM cases WHERE id = ?', i.case_id) : null;
        return { intake: i, caseRow: c };
      }
    }
    if (caseId) {
      // رد موجه لملف بعينه (مثل الرد على طلب معلومات من البوابة)
      const c = db.get('SELECT * FROM cases WHERE id = ? AND client_id = ?', caseId, client.id);
      if (c) return { intake: c.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null, caseRow: c };
    }
    // طلب «جديد» صريح (نموذج الموقع) يتقدم على أي رقم طلب مذكور في النص
    if (forceNew) return { intake: null, caseRow: null };
    if (refIntake) return { intake: refIntake, caseRow: refIntake.case_id ? db.get('SELECT * FROM cases WHERE id = ?', refIntake.case_id) : null };
    const skipUnverified = verifiedSender ? 1 : 0;
    const openIntake = db.get(
      `SELECT * FROM intakes WHERE client_id = ? AND status IN ('new','in_review','awaiting_client')
         AND NOT (? = 1 AND ${UNVERIFIED_SQL})
       ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openIntake) return { intake: openIntake, caseRow: null };
    const unverifiedCaseIds = `SELECT id FROM cases WHERE intake_id IN (SELECT id FROM intakes WHERE ${UNVERIFIED_SQL})`;
    const openCase = db.get(
      `SELECT * FROM cases WHERE client_id = ? AND status != 'closed' AND NOT (? = 1 AND id IN (${unverifiedCaseIds})) ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openCase) {
      return { intake: openCase.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', openCase.intake_id) : null, caseRow: openCase };
    }
    // ملف عمل مستمر مفتوح (قضية أمام المحكمة) بعد إغلاق الاستشارة
    const openMatter = db.get(
      `SELECT * FROM matters WHERE client_id = ? AND status != 'closed'
         AND NOT (? = 1 AND case_id IN (${unverifiedCaseIds}))
       ORDER BY id DESC LIMIT 1`,
      client.id,
      skipUnverified,
    );
    if (openMatter) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', openMatter.case_id);
      return { intake: c?.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null, caseRow: c, matter: openMatter };
    }
    return { intake: null, caseRow: null };
  }

  const engine = {
    lastInbound,

    /**
     * استقبال رسالة واردة موحدة من أي قناة.
     * msg: { channel, external_id, from_phone, from_email, contact_name, text, attachments, timestamp,
     *        attribution: {source, campaign, detail}, governorate, legal_area_hint, portal_client_id,
     *        force_new_intake, intake_kind }
     * @returns {{ duplicate, client, intake, caseRow, message_id, created_intake, document_ids }}
     */
    receive(msg) {
      if (!LABELS.channel[msg.channel]) throw badRequest('قناة غير معروفة');
      const text = String(msg.text ?? '').slice(0, 20000);
      const result = db.tx(() => {
        if (msg.external_id) {
          const dup = db.get('SELECT id, intake_id, case_id, client_id FROM messages WHERE channel = ? AND external_id = ?', msg.channel, msg.external_id);
          if (dup) return { duplicate: true, message_id: dup.id };
        }
        const t = nowIso();
        // 1) تحديد العميل
        let client;
        let createdClient = false;
        if (msg.portal_client_id) {
          client = app.clients.require(msg.portal_client_id);
        } else {
          if (!msg.from_phone && !msg.from_email) throw badRequest('لا يمكن تحديد المرسل: رقم الهاتف أو البريد مطلوب');
          const r = app.clients.resolveOrCreate({
            phone: msg.from_phone,
            email: msg.from_email,
            name: msg.contact_name,
            governorate: msg.governorate,
            channel: msg.channel,
            // واتساب يثبت ملكية الرقم؛ أما الموقع فالرقم والبريد مجرد بيانات مُدخلة
            verified: msg.channel !== 'website',
          });
          client = r.client;
          createdClient = r.created;
        }

        // المرسل موثّق: واتساب يثبت ملكية الرقم، ورابط البوابة الكامل يصدره الموظفون للعميل نفسه.
        // أما نموذج الموقع ورابط البوابة الخاص بطلب واحد فبياناتهما مجرد مُدخلات غير مثبتة.
        const verifiedSender = msg.channel !== 'website' || (!!msg.portal_client_id && !msg.target_intake_id);

        // 2) رقم طلب مذكور في الرسالة (الانتقال من الموقع إلى واتساب)
        // لا نتبع رقم الطلب لمرسل غير موثّق: من يعرف رقم هاتف عميل ورقم طلبه لا يصل بذلك إلى ملفه
        let refIntake = null;
        let identityConflict = null;
        let mentionedRef = null;
        let refToUnverified = null;
        const m = REF_RE.exec(text);
        if (m && !verifiedSender) mentionedRef = `REQ-${m[1]}-${m[2]}`;
        if (m && verifiedSender) {
          const ref = db.get('SELECT * FROM intakes WHERE code = ?', `REQ-${m[1]}-${m[2]}`);
          if (ref) {
            const refClient = ref.client_id ? app.clients.get(ref.client_id) : null;
            if (refClient && refClient.id === client.id) {
              // نستخدم الطلب المذكور فقط إذا كان ما زال حيًا؛ أما المنتهي فلا نُلحق به الرسالة حتى لا تُدفن في ملف مغلق
              const refCase = ref.case_id ? db.get('SELECT status FROM cases WHERE id = ?', ref.case_id) : null;
              if (['new', 'in_review', 'awaiting_client'].includes(ref.status) || (refCase && refCase.status !== 'closed')) {
                refIntake = ref;
              } else if (['handled_internally', 'archived'].includes(ref.status) && !ref.case_id) {
                // العميل عاد لنفس الموضوع: نعيد فتح الطلب للفرز
                db.update('intakes', ref.id, { status: 'in_review', updated_at: nowIso() });
                refIntake = db.get('SELECT * FROM intakes WHERE id = ?', ref.id);
              }
              // صاحب الرقم يذكر رقم طلب أُنشئ من الموقع برقمه: غالبًا هو نفسه يستكمل عبر واتساب، لكن التأكيد للإدارة
              if (refIntake && isUnverifiedIntake(refIntake)) refToUnverified = refIntake;
            } else if (refClient) {
              // رقم مختلف يذكر رقم طلب لعميل آخر: لا ندمج تلقائيًا حماية للخصوصية، ونطلب تحقق الإدارة
              identityConflict = { intake_id: ref.id, intake_code: ref.code, client_code: refClient.code };
            }
          }
        }

        // 3) تحديد الطلب/الملف المستهدف
        const target = findTarget(client, {
          refIntake,
          forceNew: !!msg.force_new_intake,
          caseId: msg.target_case_id,
          intakeId: msg.target_intake_id,
          verifiedSender,
        });
        let intake = target.intake;
        let caseRow = target.caseRow;
        const matter = target.matter || (caseRow?.matter_id ? db.get('SELECT * FROM matters WHERE id = ?', caseRow.matter_id) : null);
        let createdIntake = false;

        if (!intake) {
          let attribution = msg.attribution || null;
          const previous = Number(db.value('SELECT COUNT(*) FROM intakes WHERE client_id = ?', client.id));
          if (msg.channel === 'website' && !createdClient && !msg.portal_client_id) {
            // طلب من الموقع برقم عميل موجود: الرقم غير موثّق، فننبه الإدارة قبل الاعتماد على هذا الربط
            attribution = { ...(attribution || {}), detail: { ...((attribution && attribution.detail) || {}), phone_match_unverified: true } };
          }
          if (!attribution || !attribution.source || attribution.source === 'unknown') {
            attribution = { ...(attribution || {}), source: previous > 0 ? 'returning' : attribution?.source || 'unknown' };
          }
          const id = db.insert('intakes', {
            code: nextIntakeCode(t),
            client_id: client.id,
            status: 'new',
            kind: msg.intake_kind || null,
            first_channel: msg.channel,
            last_channel: msg.channel,
            channels: JSON.stringify([msg.channel]),
            source: LABELS.source[attribution.source] ? attribution.source : 'unknown',
            source_detail: JSON.stringify(attribution.detail || {}),
            campaign: attribution.campaign || null,
            legal_area: msg.legal_area_hint || null,
            contact_name: msg.contact_name || client.name || null,
            contact_phone: msg.from_phone || app.clients.primaryPhone(client.id),
            governorate: msg.governorate || client.governorate || null,
            created_at: t,
            updated_at: t,
          });
          intake = db.get('SELECT * FROM intakes WHERE id = ?', id);
          createdIntake = true;
          app.activity.log({
            intake_id: intake.id,
            client_id: client.id,
            actor: { kind: 'client' },
            type: 'intake.created',
            summary: `طلب وارد جديد عبر ${LABELS.channel[msg.channel]} (المصدر: ${LABELS.source[intake.source]})`,
            data: { channel: msg.channel, source: intake.source, campaign: intake.campaign },
          });
        }

        // 4) حفظ الرسالة
        const meta = {};
        if (msg.referral) meta.referral = msg.referral;
        if (identityConflict) meta.identity_conflict = identityConflict;
        if (mentionedRef) meta.mentioned_ref = mentionedRef; // للمراجعة اليدوية فقط، دون ربط تلقائي
        if (msg.context_id) meta.reply_to = msg.context_id;
        if (msg.info_request_id) meta.info_request_id = msg.info_request_id;
        // نعتمد وقت الاستلام في الخادم للترتيب، ونحفظ توقيت المزوّد للرجوع إليه
        if (msg.timestamp) meta.provider_timestamp = msg.timestamp;
        const messageId = db.insert('messages', {
          client_id: client.id,
          intake_id: intake?.id ?? null,
          case_id: caseRow?.id ?? null,
          matter_id: matter?.id ?? null,
          direction: 'in',
          channel: msg.channel,
          external_id: msg.external_id || null,
          body: text,
          status: 'received',
          meta: JSON.stringify(meta),
          created_at: t,
        });

        // 5) المرفقات القادمة من الواجهة (base64) تُحفظ فورًا؛ وسائط واتساب تُنزَّل لاحقًا بشكل غير متزامن
        const documentIds = [];
        for (const a of msg.attachments || []) {
          if (a.data_base64 || a.buffer) {
            documentIds.push(
              app.documents.save(a, {
                client_id: client.id,
                intake_id: intake?.id,
                case_id: caseRow?.id,
                // لا نربط المرفق بالملف المستمر: المحامي المسؤول لا يرى مرفقات العميل إلا إذا أتاحتها الإدارة
                message_id: messageId,
                info_request_id: msg.info_request_id,
              }, { kind: 'client' }),
            );
          }
        }

        // 6) تحديث العدادات والحالة
        if (intake) {
          const chans = parseJson(intake.channels, []);
          if (!chans.includes(msg.channel)) chans.push(msg.channel);
          db.update('intakes', intake.id, {
            last_message_at: t,
            last_inbound_at: t,
            last_channel: msg.channel,
            channels: JSON.stringify(chans),
            unread_count: (intake.unread_count || 0) + 1,
            // رسالة البوابة تعيد طلبًا منتهيًا للفرز، إلا إذا كان طلبًا غير موثّق الهوية فيبقى كما أغلقته الإدارة
            status:
              intake.status === 'awaiting_client' ||
              (msg.target_intake_id && ['handled_internally', 'archived'].includes(intake.status) && !isUnverifiedIntake(intake))
                ? 'in_review'
                : intake.status,
            updated_at: t,
          });
        }
        if (caseRow) {
          db.run('UPDATE cases SET unread_count = unread_count + 1, updated_at = ? WHERE id = ?', t, caseRow.id);
        }
        if (!createdIntake) {
          app.activity.log({
            intake_id: intake?.id,
            case_id: caseRow?.id,
            matter_id: matter?.id,
            client_id: client.id,
            actor: { kind: 'client' },
            type: 'message.received',
            summary: `رسالة جديدة من العميل عبر ${LABELS.channel[msg.channel]}`,
            data: { message_id: messageId },
          });
        }

        // 7) إشعارات الإدارة
        if (identityConflict) {
          app.notifications.notifyStaff({
            type: 'identity_conflict',
            title: `رقم جديد يذكر الطلب ${identityConflict.intake_code}`,
            body: 'وصلت رسالة من رقم غير مسجل لصاحب الطلب. تحقق من هوية المرسل قبل دمج العميلين.',
            link: `#/inbox/${intake.id}`,
          });
        }
        if (refToUnverified) {
          app.notifications.notifyStaff({
            type: 'identity.ref_from_owner',
            title: `صاحب الرقم ذكر الطلب ${refToUnverified.code} عبر ${LABELS.channel[msg.channel]}`,
            body: 'الطلب أُنشئ من الموقع برقم غير موثّق. راجع المحادثة وأكّد هوية المرسل من صفحة الطلب إن كان هو مقدّم الطلب.',
            link: `#/inbox/${refToUnverified.id}`,
          });
        }
        if (createdIntake) {
          app.notifications.notifyStaff({
            type: 'intake.new',
            title: `طلب وارد جديد ${intake.code} عبر ${LABELS.channel[msg.channel]}`,
            body: truncate(text, 140),
            link: `#/inbox/${intake.id}`,
          });
        } else if (caseRow) {
          const pending = Number(
            db.value("SELECT COUNT(*) FROM info_requests WHERE case_id = ? AND status = 'sent_to_client'", caseRow.id),
          );
          app.notifications.notifyStaff(
            {
              type: 'case.client_message',
              title: `رسالة جديدة من العميل في الملف ${caseRow.code}`,
              body: pending ? `قد تكون ردًا على طلب معلق للعميل (الطلبات المعلقة: ${pending}). ${truncate(text, 100)}` : truncate(text, 140),
              link: `#/cases/${caseRow.id}`,
            },
            { caseManagerId: caseRow.case_manager_id },
          );
        }

        return {
          duplicate: false,
          client,
          created_client: createdClient,
          intake: intake ? db.get('SELECT * FROM intakes WHERE id = ?', intake.id) : null,
          caseRow,
          message_id: messageId,
          created_intake: createdIntake,
          document_ids: documentIds,
        };
      });

      if (!result.duplicate) {
        // تحليل الذكاء الاصطناعي للطلبات التي لم تتحول بعد إلى ملفات (مؤجل قليلًا لتجميع الرسائل المتتابعة)
        if (result.intake && !result.caseRow && result.intake.status !== 'converted') {
          app.ai.scheduleIntakeAnalysis(result.intake.id);
        }
        // تنزيل وسائط واتساب في الخلفية
        const pendingMedia = (msg.attachments || []).filter((a) => a.media_id);
        if (pendingMedia.length) engine.fetchWhatsAppMedia(result, pendingMedia).catch((e) => app.log('media', e));
      }
      return result;
    },

    async fetchWhatsAppMedia(result, items) {
      for (const a of items) {
        if (!app.whatsapp.configured) {
          db.run(
            "UPDATE messages SET meta = json_set(meta, '$.pending_media', json(?)) WHERE id = ?",
            JSON.stringify(items.map((x) => ({ media_id: x.media_id, kind: x.kind, mime: x.mime }))),
            result.message_id,
          );
          return;
        }
        try {
          const { buffer, mime } = await app.whatsapp.downloadMedia(a.media_id);
          const ext = { image: 'jpg', audio: 'ogg', video: 'mp4', document: 'pdf' }[a.kind] || 'bin';
          app.documents.save(
            { filename: a.filename || `${a.kind}-${a.media_id}.${ext}`, mime: a.mime || mime, buffer },
            {
              client_id: result.client.id,
              intake_id: result.intake?.id,
              case_id: result.caseRow?.id,
              message_id: result.message_id,
            },
            { kind: 'client' },
          );
        } catch (e) {
          app.log('whatsapp media download failed', e);
        }
      }
    },

    /** معالجة Webhook واتساب بالكامل */
    handleWhatsAppWebhook(payload) {
      const { messages, statuses } = parseWebhook(payload);
      const results = [];
      let failed = 0;
      for (const m of messages) {
        if (!m.from_phone) continue;
        // رسالة واحدة معيبة لا يجب أن توقف بقية الدفعة (ميتا تعيد إرسال الدفعة كاملة عند الفشل)
        try {
          const attribution = sourceFromReferral(m.referral);
          results.push(engine.receive({ ...m, attribution }));
        } catch (e) {
          failed++;
          app.log(`whatsapp inbound ${m.external_id} failed`, e);
        }
      }
      for (const s of statuses) {
        try {
          engine.applyStatus(s);
        } catch (e) {
          app.log('whatsapp status failed', e);
        }
      }
      return { received: results.filter((r) => !r.duplicate).length, duplicates: results.filter((r) => r.duplicate).length, failed, statuses: statuses.length };
    },

    applyStatus({ external_id, status, error }) {
      const allowed = ['sent', 'delivered', 'read', 'failed'];
      if (!allowed.includes(status)) return;
      const row = db.get("SELECT id, status FROM messages WHERE channel = 'whatsapp' AND external_id = ?", external_id);
      if (!row) return;
      // لا نرجع الحالة للخلف (read بعد delivered)
      const order = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
      if ((order[status] ?? 0) < (order[row.status] ?? 0) && status !== 'failed') return;
      db.update('messages', row.id, { status, error: error || null });
    },

    // ===================== الإرسال الموحد =====================
    /** اختيار القناة: نرد على العميل من حيث يتواصل في هذا الملف تحديدًا، ثم من حيث تواصل آخر مرة */
    pickChannel(clientId, requested = 'auto', { intakeId = null, caseId = null } = {}) {
      const phone = app.clients.primaryPhone(clientId);
      if (requested === 'whatsapp') {
        if (!phone) throw badRequest('لا يوجد رقم هاتف مسجل لهذا العميل للإرسال عبر واتساب');
        return 'whatsapp';
      }
      if (requested === 'website') return 'website';
      if (requested && requested !== 'auto') throw badRequest('قناة الإرسال غير مدعومة');
      const scoped = (col, id) =>
        id ? db.get(`SELECT channel FROM messages WHERE ${col} = ? AND client_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1`, id, clientId) : null;
      const last = scoped('case_id', caseId) || scoped('intake_id', intakeId) || lastInbound(clientId);
      if (last?.channel === 'website') return 'website';
      if (phone) return 'whatsapp';
      return 'website';
    },

    /**
     * إرسال رسالة للعميل عبر قناة المؤسسة.
     * @returns {object} صف الرسالة
     */
    sendToClient({ client_id, intake_id = null, case_id = null, matter_id = null, body, channel = 'auto', author = null, automated = false, rule = null, meta = {} }) {
      if (!body || !String(body).trim()) throw badRequest('نص الرسالة فارغ');
      const client = app.clients.require(client_id);
      // الرسائل الآلية (تذكير بجلسة/فاتورة/مستند) تُرسل عبر واتساب متى توفر رقم، لأن البوابة لا تُنبّه العميل
      const ch =
        automated && (!channel || channel === 'auto') && app.clients.primaryPhone(client.id)
          ? 'whatsapp'
          : engine.pickChannel(client.id, channel, { intakeId: intake_id, caseId: case_id });
      const t = nowIso();
      const to = ch === 'whatsapp' ? app.clients.primaryPhone(client.id) : null;
      const id = db.insert('messages', {
        client_id: client.id,
        intake_id,
        case_id,
        matter_id,
        direction: 'out',
        channel: ch,
        to_address: to,
        body: String(body).slice(0, 4096),
        author_user_id: author?.id ?? null,
        automated: automated ? 1 : 0,
        automation_rule: rule,
        status: ch === 'website' ? 'sent' : 'queued',
        meta: JSON.stringify(meta),
        sent_at: ch === 'website' ? t : null,
        created_at: t,
      });
      if (intake_id) db.update('intakes', intake_id, { last_message_at: t, unread_count: 0, updated_at: t });
      if (ch === 'whatsapp') {
        if (!app.whatsapp.configured) {
          db.update('messages', id, { status: 'simulated', sent_at: t });
        } else {
          // الإرسال الفعلي غير متزامن؛ الحالة تُحدَّث عند النجاح/الفشل ومن Webhook الحالات
          engine.dispatch(id).catch((e) => app.log('dispatch', e));
        }
      }
      return db.get('SELECT * FROM messages WHERE id = ?', id);
    },

    /** إرسال رسالة واتساب مسجلة بالفعل (مع مراعاة نافذة الـ 24 ساعة) */
    async dispatch(messageId) {
      const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
      if (!msg || msg.status !== 'queued' || msg.channel !== 'whatsapp') return;
      const settings = app.settings.all();
      const lastIn = db.get(
        "SELECT created_at FROM messages WHERE client_id = ? AND direction = 'in' AND channel = 'whatsapp' ORDER BY id DESC LIMIT 1",
        msg.client_id,
      );
      const inWindow = lastIn && addHours(lastIn.created_at, 24) > nowIso();
      try {
        let wamid;
        if (inWindow) {
          wamid = await app.whatsapp.sendText(msg.to_address, msg.body);
        } else {
          if (!settings.whatsapp_template_name) {
            throw new Error('خارج نافذة الـ 24 ساعة ولا يوجد قالب رسائل معتمد في الإعدادات');
          }
          wamid = await app.whatsapp.sendTemplate(msg.to_address, settings.whatsapp_template_name, settings.whatsapp_template_language, msg.body);
        }
        db.update('messages', msg.id, {
          status: 'sent',
          external_id: wamid,
          sent_at: nowIso(),
          meta: JSON.stringify({ ...parseJson(msg.meta, {}), via: inWindow ? 'session' : 'template' }),
        });
      } catch (e) {
        db.update('messages', msg.id, { status: 'failed', error: String(e.message || e).slice(0, 500) });
        app.notifications.notifyStaff({
          type: 'message.failed',
          title: 'تعذر إرسال رسالة واتساب',
          body: String(e.message || e).slice(0, 200),
          link: msg.case_id ? `#/cases/${msg.case_id}` : msg.intake_id ? `#/inbox/${msg.intake_id}` : '#/automations',
        });
      }
    },

    /** إعادة محاولة رسالة فاشلة */
    retry(messageId) {
      const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
      if (!msg || msg.direction !== 'out') throw notFound('الرسالة غير موجودة');
      if (msg.status !== 'failed') throw badRequest('يمكن إعادة إرسال الرسائل الفاشلة فقط');
      db.update('messages', msg.id, { status: 'queued', error: null });
      if (!app.whatsapp.configured) db.update('messages', msg.id, { status: 'simulated', sent_at: nowIso() });
      else engine.dispatch(msg.id).catch((e) => app.log('dispatch', e));
      return db.get('SELECT * FROM messages WHERE id = ?', msg.id);
    },

    /** إرسال أي رسائل عالقة في قائمة الانتظار (مثلًا بعد إعادة تشغيل الخادم) */
    async flushQueue() {
      if (!app.whatsapp.configured) return 0;
      const rows = db.all("SELECT id FROM messages WHERE direction = 'out' AND status = 'queued' AND channel = 'whatsapp' AND created_at < ? LIMIT 50", addHours(nowIso(), -0.02));
      for (const r of rows) await engine.dispatch(r.id);
      return rows.length;
    },
  };
  return engine;
}

/** تجهيز رسائل المحادثة للعرض (للإدارة) */
export function mapMessage(r, docsByMessage = new Map()) {
  return {
    id: r.id,
    direction: r.direction,
    channel: r.channel,
    body: r.body,
    status: r.status,
    error: r.error,
    automated: !!r.automated,
    automation_rule: r.automation_rule,
    author_name: r.author_name || null,
    intake_id: r.intake_id,
    case_id: r.case_id,
    matter_id: r.matter_id,
    meta: parseJson(r.meta, {}),
    created_at: r.created_at,
    documents: docsByMessage.get(r.id) || [],
  };
}
