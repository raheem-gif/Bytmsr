// مسارات الإدارة (مدير النظام ومديرو الحالات). الإجراءات المالية وإدارة الحسابات لمدير النظام فقط.
import { requireStaff, requireAdmin } from '../auth.js';
import { idParam } from '../http.js';
import { v, badRequest, notFound, conflict, randomToken, nowIso, normalizePhone } from '../util.js';
import { ENUMS, AREA_CODES, DEFAULT_SETTINGS, LABELS } from '../constants.js';
import { CLIENT_TEXTS } from '../constants.js'; // v9.1 b-site (B91-10)
import { isPlaceholderWhatsApp } from '../channels/whatsapp.js';
// v9.2 (admin-ai): القصص الواردة، المكالمات، نصوص الرسائل الصوتية
import { latinDigits } from '../util.js';
import { topicByKey } from '../../public/assets/js/public/topics.js';

const UPLOAD = { limit: 60 * 1024 * 1024 };

export function registerAdminRoutes(router, app) {
  const S = (fn, opts) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  const id = (ctx, k = 'id') => idParam(ctx.params, k);

  // ===== لوحة المتابعة وقائمة القرارات =====
  router.get('/api/admin/dashboard', S((ctx, u) => app.analytics.dashboard(u)));
  router.get('/api/admin/queue', S(() => app.requests.queue()));
  router.get('/api/admin/staff', S(() => app.lawyers.staffList().filter((x) => x.active).map(({ id: uid, name, role }) => ({ id: uid, name, role }))));

  // ===== صندوق الوارد الموحد =====
  router.get('/api/admin/intakes', S((ctx) => app.intakes.list(ctx.query)));
  router.post('/api/admin/intakes', S((ctx, u) => {
    ctx.status = 201;
    return app.intakes.createManual(ctx.body, u);
  }));
  router.get('/api/admin/intakes/:id', S((ctx) => {
    // فتح الطلب يصفّر غير المقروء فقط؛ «قيد الفرز» والإسناد يبدآن مع أول إجراء فرز (رد، تعديل، قرار)
    app.intakes.markRead(id(ctx));
    // (v9 messaging) إعلام العميل على واتساب بقراءة رسالته (أفضل جهد، غير متزامن)
    app.messaging?.markConversationRead?.({ intakeId: id(ctx) });
    return app.intakes.detail(id(ctx));
  }));
  router.patch('/api/admin/intakes/:id', S((ctx, u) => app.intakes.update(id(ctx), ctx.body, u)));
  router.post('/api/admin/intakes/:id/analyze', S(async (ctx, u) => app.ai.analyzeIntake(app.intakes.require(id(ctx)).id, u)));
  // [R2-A13/S-32] meta من الواجهة لا يصل أبدًا لرسالة المستفيدة (لا مستند ولا إخفاء من صفحتها ولا قالب)
  router.post('/api/admin/intakes/:id/reply', S((ctx, u) => {
    const { meta: _ignoredMeta, ...body } = ctx.body;
    return app.intakes.reply(id(ctx), body, u);
  }));
  router.post('/api/admin/intakes/:id/handle-internally', S((ctx, u) => app.intakes.handleInternally(id(ctx), ctx.body, u)));
  router.post('/api/admin/intakes/:id/archive', S((ctx, u) => app.intakes.archive(id(ctx), ctx.body, u)));
  router.post('/api/admin/intakes/:id/reopen', S((ctx, u) => app.intakes.reopen(id(ctx), u)));
  router.post('/api/admin/intakes/:id/confirm-identity', S((ctx, u) => app.intakes.confirmIdentity(id(ctx), u)));
  router.post('/api/admin/intakes/:id/revoke-portal', S((ctx, u) => {
    const r = app.intakes.revokePortal(id(ctx), u);
    app.audit.log({ actor: u, ctx, type: 'portal.revoked', severity: 'warning', summary: `إلغاء روابط بوابة العميل الخاصة بالطلب الوارد رقم ${id(ctx)}`, data: { intake_id: id(ctx) } });
    return r;
  }));
  router.post('/api/admin/intakes/:id/convert', S((ctx, u) => {
    ctx.status = 201;
    return { case: app.intakes.convert(id(ctx), ctx.body, u) };
  }));
  router.post('/api/admin/intakes/:id/link-client', S((ctx, u) => app.intakes.linkClient(id(ctx), v.int(ctx.body.client_id, 'العميل', { required: true, min: 1 }), u)));
  router.post('/api/admin/intakes/:id/ai-feedback', S((ctx, u) => app.intakes.aiFeedback(id(ctx), ctx.body, u)));

  // ===== v9.2 (admin-ai): القصة ← اقتراح ← طلب بنقرة (§6.2) =====
  const storyLimit = (u) => app.limiters.storyNow.hit(`story:${u.id}`);
  router.get('/api/admin/intakes/:id/proposal', S((ctx) => app.stories.proposal(app.intakes.require(id(ctx)).id)));
  // «لخّصها الآن»: القصة جاهزة الآن + تحليل فوري (لا يُحسب على الحد اليومي؛ محدود بعدد مرات الضغط)
  router.post('/api/admin/intakes/:id/story/ready', S(async (ctx, u) => {
    const i = app.intakes.require(id(ctx));
    if (!['new', 'in_review', 'awaiting_client'].includes(i.status)) throw conflict('تم البت في هذا الطلب بالفعل');
    storyLimit(u);
    app.stories.markReady(i.id, 'staff_now', u, { analyze: false });
    app.stories.cancelTimers(i.id);
    await app.ai.analyzeIntake(i.id, u);
    return { story: app.stories.storyOf(i.id), proposal: app.stories.proposal(i.id) };
  }));
  router.post('/api/admin/intakes/:id/accept', S(async (ctx, u) => {
    const r = await app.stories.accept(id(ctx), ctx.body, u);
    app.audit.log({
      actor: u,
      ctx,
      type: 'ai.story_accepted',
      summary: `اعتماد قرار الطلب ${r.intake.code}: ${LABELS.story_track[r.track]}${r.case ? ` (${r.case.code})` : ''}`,
      data: { intake_id: r.intake.id, track: r.track, case_id: r.case?.id ?? null, matter_id: r.matter?.id ?? null, message_id: r.message?.id ?? null, deliver: ctx.body?.deliver || 'message' },
    });
    return r;
  }));
  router.post('/api/admin/intakes/:id/call-note', S(async (ctx, u) => {
    storyLimit(u);
    const r = await app.stories.callNote(id(ctx), ctx.body, u);
    if (!r.duplicate) ctx.status = 201;
    return r;
  }));
  router.post('/api/admin/intakes/:id/call-attempt', S((ctx, u) => {
    storyLimit(u);
    const r = app.stories.callAttempt(id(ctx), ctx.body, u);
    if (!r.duplicate) ctx.status = 201;
    return r;
  }));
  router.post('/api/admin/intakes/:id/close-unreachable', S((ctx, u) => {
    storyLimit(u);
    return app.stories.closeUnreachable(id(ctx), u);
  }));
  router.post('/api/admin/messages/split', S(async (ctx, u) => {
    storyLimit(u);
    const r = await app.stories.split(ctx.body, u);
    if (!r.duplicate) ctx.status = 201;
    return r;
  }));
  // نص رسالة صوتية تكتبه الإدارة (أو «الرسالة مش مفهومة»)
  router.put('/api/admin/voice-notes/:documentId/transcript', S((ctx, u) => {
    app.limiters.transcript.hit(`transcript:${u.id}`);
    return app.voice.save(id(ctx, 'documentId'), ctx.body, u);
  }));

  // محاكي واتساب للعرض التجريبي: يبني Webhook مطابقًا لصيغة Meta ويمرره على نفس المسار الحقيقي
  router.post('/api/admin/simulate/whatsapp', S((ctx) => {
    if (!app.config.demo) throw notFound('المحاكي متاح في الوضع التجريبي فقط');
    const b = ctx.body;
    const phone = v.phone(b.from, 'رقم المرسل', { required: true });
    // v9.2 (A92-22): رسالة نصية، أو رسالة صوتية تجريبية، أو صورة ورقة، أو اختيار موضوع من قائمة الترحيب
    const kind = v.oneOf(b.kind || 'text', ['text', 'voice', 'photo', 'list_reply'], 'نوع الرسالة', { required: true });
    const text = v.str(b.text, 'نص الرسالة', { required: kind === 'text', max: 4000 });
    const msg = { from: phone.replace(/^\+/, ''), id: `wamid.SIM.${randomToken(12)}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } };
    if (kind === 'voice') {
      delete msg.text;
      msg.type = 'audio';
      msg.audio = { id: 'SIM-SAMPLE-VOICE', mime_type: 'audio/webm' };
    } else if (kind === 'photo') {
      delete msg.text;
      msg.type = 'image';
      msg.image = { id: 'SIM-SAMPLE-PHOTO', mime_type: 'image/jpeg', ...(text ? { caption: text } : {}) };
    } else if (kind === 'list_reply') {
      const key = /^topic:([a-z_]+)$/.exec(String(b.reply_id || ''))?.[1];
      const topic = key ? topicByKey(key) : null;
      if (!topic || topic.key !== key) throw badRequest('اختيار القائمة غير معروف');
      delete msg.text;
      msg.type = 'interactive';
      msg.interactive = { type: 'list_reply', list_reply: { id: `topic:${topic.key}`, title: topic.wa_title } };
    }
    if (b.ad && b.ad.platform) {
      const platform = v.oneOf(b.ad.platform, ['facebook', 'instagram'], 'منصة الإعلان', { required: true });
      msg.referral = {
        source_url: platform === 'instagram' ? 'https://www.instagram.com/p/sim' : 'https://fb.me/sim-ad',
        source_type: 'ad',
        source_id: v.str(b.ad.ad_id, 'رقم الإعلان', { max: 60 }) || `ad-${platform}-${randomToken(4)}`,
        headline: v.str(b.ad.headline, 'عنوان الإعلان', { max: 150 }) || `استشارة قانونية مجانية من ${app.settings.get('org_name') || DEFAULT_SETTINGS.org_name}`,
        ctwa_clid: randomToken(10),
      };
    }
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'SIM', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: 'SIM', phone_number_id: 'SIM' }, contacts: [{ profile: { name: v.str(b.name, 'اسم المرسل', { max: 100 }) || 'عميل' }, wa_id: msg.from }], messages: [msg] } }] }],
    };
    const result = app.engine.handleWhatsAppWebhook(payload);
    const row = app.db.get('SELECT id, intake_id, case_id FROM messages WHERE channel = ? AND external_id = ?', 'whatsapp', msg.id);
    // v9.2: ردودنا الآلية على هذه الرسالة (الترحيب بالقائمة، «احكيلنا»، «وصلتنا حكايتك») وحالة القصة
    const replies = row?.intake_id
      ? app.db
          .all("SELECT id, body, automation_rule, status, meta FROM messages WHERE intake_id = ? AND direction = 'out' AND id > ? ORDER BY id", row.intake_id, row.id)
          .map((m) => ({ id: m.id, body: m.body, rule: m.automation_rule, status: m.status, wa: JSON.parse(m.meta || '{}').wa || null }))
      : [];
    const story = row?.intake_id ? app.stories.storyOf(row.intake_id) : null;
    return {
      ...result,
      intake_id: row?.intake_id ?? null,
      case_id: row?.case_id ?? null,
      intake_code: row?.intake_id ? app.db.value('SELECT code FROM intakes WHERE id = ?', row.intake_id) ?? null : null,
      case_code: row?.case_id ? app.db.value('SELECT code FROM cases WHERE id = ?', row.case_id) ?? null : null,
      replies,
      story_view: story?.view || null,
      story_view_label: story?.view ? LABELS.story_view[story.view] : null,
      welcome_enabled: !!app.settings.get('story_welcome_enabled'),
    };
  }));

  // ===== العملاء =====
  router.get('/api/admin/clients', S((ctx) => app.clients.list(ctx.query)));
  router.get('/api/admin/clients/:id', S((ctx) => app.clients.detail(id(ctx))));
  router.patch('/api/admin/clients/:id', S((ctx, u) => app.clients.update(id(ctx), ctx.body, u)));
  router.post('/api/admin/clients/:id/identities', S((ctx, u) => {
    const c = app.clients.require(id(ctx));
    const kind = v.oneOf(ctx.body.kind, ['phone', 'email'], 'نوع الهوية', { required: true });
    const value = kind === 'phone' ? v.phone(ctx.body.value, 'رقم الهاتف', { required: true }) : v.email(ctx.body.value, 'البريد الإلكتروني', { required: true });
    app.clients.addIdentity(c.id, kind, value);
    app.activity.log({ client_id: c.id, actor: u, type: 'client.identity_added', summary: `أُضيفت هوية تواصل جديدة للعميل (${kind === 'phone' ? 'هاتف' : 'بريد'})` });
    return app.clients.identities(c.id);
  }));
  router.post('/api/admin/clients/:id/merge', S((ctx, u) => app.clients.merge(id(ctx), v.int(ctx.body.other_client_id, 'العميل المكرر', { required: true, min: 1 }), u)));
  router.post('/api/admin/clients/:id/revoke-portal', S((ctx, u) => {
    const c = app.clients.require(id(ctx));
    const revoked = app.clients.revokePortalTokens(c.id);
    if (revoked) app.activity.log({ client_id: c.id, actor: u, type: 'portal.revoked', summary: `ألغت الإدارة كل روابط البوابة السارية للعميل (${revoked})` });
    app.audit.log({ actor: u, ctx, type: 'portal.revoked', severity: 'warning', summary: `إلغاء روابط بوابة العميل ${c.code || c.id} (عدد الروابط الملغاة: ${revoked})`, data: { client_id: c.id, revoked } });
    return { revoked };
  }));
  router.post('/api/admin/clients/:id/portal-link', S((ctx, u) => {
    const c = app.clients.require(id(ctx));
    const token = app.clients.issuePortalToken(c.id);
    const url = app.clients.portalUrl(token);
    let message = null;
    if (ctx.body.send) {
      // v9.1 b-site (B91-10): نفس كلام رسائل المستفيد/ة البسيط («دي صفحة طلبك…») بصيغة المخاطبة الصحيحة.
      // v9.1 fixes: الرابط لا يُحفظ في نص الرسالة: {portal_link} في نص واتساب يُستبدل عند الإرسال الفعلي برابط
      // بنطاق رقمها، والنص المحفوظ (للإدارة وصفحة المتابعة) بلا رابط
      const w = app.engine.clientWords({ clientId: c.id });
      const waText = app.engine.fillClientText(CLIENT_TEXTS.portal_link_message, { first_name: w.first_name, org_name: app.settings.get('org_name') }, w.form);
      message = app.engine.sendToClient({
        client_id: c.id,
        body: app.engine.withoutLinkLines(waText),
        channel: 'whatsapp',
        author: u,
        meta: { wa_text: waText, portal_link_sent: true },
      });
    }
    app.activity.log({ client_id: c.id, actor: u, type: 'client.portal_link', summary: ctx.body.send ? 'أُرسل للعميل رابط البوابة الخاص به' : 'أُنشئ رابط بوابة جديد للعميل' });
    app.audit.log({ actor: u, ctx, type: 'portal.link_issued', summary: `إصدار رابط بوابة جديد للعميل ${c.code || c.id}${ctx.body.send ? ' وإرساله عبر واتساب' : ''}`, data: { client_id: c.id, sent: !!ctx.body.send } });
    return { url, message_id: message?.id ?? null };
  }));

  // ===== ملفات الاستشارات =====
  router.get('/api/admin/cases', S((ctx) => app.cases.list(ctx.query)));
  router.get('/api/admin/cases/:id', S((ctx) => {
    app.cases.markRead(id(ctx));
    // (v9 messaging) إعلام العميل على واتساب بقراءة رسالته (أفضل جهد، غير متزامن)
    app.messaging?.markConversationRead?.({ caseId: id(ctx) });
    return app.cases.detail(id(ctx));
  }));
  router.patch('/api/admin/cases/:id', S((ctx, u) => app.cases.update(id(ctx), ctx.body, u)));
  router.post('/api/admin/cases/:id/issues', S((ctx, u) => app.cases.addIssue(id(ctx), ctx.body, u)));
  router.patch('/api/admin/cases/:id/issues/:issueId', S((ctx, u) => app.cases.updateIssue(id(ctx), id(ctx, 'issueId'), ctx.body, u)));
  router.post('/api/admin/cases/:id/ai/issues', S(async (ctx, u) => app.ai.suggestIssuesForCase(id(ctx), u)));
  router.post('/api/admin/cases/:id/documents', S((ctx, u) => app.cases.addDocuments(id(ctx), ctx.body.files, u, { title: ctx.body.title })), UPLOAD);
  router.patch('/api/admin/documents/:id', S((ctx, u) => {
    const d = app.documents.get(id(ctx));
    if (!d) throw notFound('المستند غير موجود');
    const patch = {};
    if (ctx.body.title !== undefined) patch.title = v.str(ctx.body.title, 'عنوان المستند', { required: true, max: 200 });
    if (ctx.body.matter_id !== undefined) {
      // إتاحة مستند (مثل مرفق من العميل) للمحامي المسؤول عن الملف المستمر، أو سحبه منه
      const mid = ctx.body.matter_id === null ? null : v.int(ctx.body.matter_id, 'الملف المستمر', { min: 1 });
      if (mid) {
        const m = app.matters.require(mid);
        if (m.client_id !== d.client_id) throw badRequest('المستند لا يخص عميل هذا الملف المستمر');
      }
      patch.matter_id = mid;
    }
    if (!Object.keys(patch).length) throw badRequest('لا توجد تعديلات');
    app.db.update('documents', d.id, patch);
    if (patch.matter_id !== undefined) {
      const mid = patch.matter_id || d.matter_id;
      const m = mid ? app.matters.require(mid) : null;
      app.activity.log({
        matter_id: m?.id,
        case_id: m?.case_id ?? d.case_id,
        actor: u,
        type: patch.matter_id ? 'document.shared_matter' : 'document.unshared_matter',
        summary: patch.matter_id ? `أُتيح المستند «${d.title || d.filename}» للمحامي المسؤول عن الملف المستمر` : `سُحب المستند «${d.title || d.filename}» من الملف المستمر`,
      });
    }
    return app.documents.publicView(app.documents.get(d.id));
  }));
  router.get('/api/admin/cases/:id/suggest-lawyers', S((ctx) => {
    const c = app.cases.require(id(ctx));
    const area = ctx.query.area && AREA_CODES.includes(ctx.query.area) ? ctx.query.area : c.legal_area;
    const excluded = app.db
      .all(
        `SELECT a.lawyer_id AS id, u.name, a.role FROM assignments a JOIN users u ON u.id = a.lawyer_id
         WHERE a.case_id = ? AND a.status != 'withdrawn'`,
        c.id,
      )
      .map((x) => ({ id: x.id, name: x.name, reason: `عضو بالفعل في فريق الملف (${LABELS.assignment_role[x.role]})` }));
    return { area, items: app.lawyers.suggest({ area, case_id: c.id }).slice(0, 15), excluded };
  }));
  router.get('/api/admin/cases/:id/default-grants', S((ctx) => {
    const c = app.cases.require(id(ctx));
    const role = v.oneOf(ctx.query.role, ENUMS.assignment_role, 'الدور') || 'lead';
    return app.visibility.defaultGrants(c.id, role);
  }));
  router.post('/api/admin/cases/:id/assignments', S((ctx, u) => {
    ctx.status = 201;
    return app.cases.assign(id(ctx), ctx.body, u);
  }));
  router.patch('/api/admin/assignments/:id', S((ctx, u) => app.cases.updateAssignment(id(ctx), ctx.body, u)));
  router.put('/api/admin/assignments/:id/grants', S((ctx, u) => app.cases.setGrants(id(ctx), ctx.body, u)));
  router.post('/api/admin/assignments/:id/reengage', S((ctx, u) => app.cases.reengage(id(ctx), u, ctx.body)));
  router.post('/api/admin/assignments/:id/withdraw', S((ctx, u) => {
    app.cases.withdraw(id(ctx), u, { note: v.str(ctx.body.note, 'السبب', { max: 500 }) });
    return { ok: true };
  }));

  router.post('/api/admin/cases/:id/info-requests', S((ctx, u) => app.requests.createInfoByStaff(id(ctx), u, ctx.body)));
  router.post('/api/admin/info-requests/:id/approve', S((ctx, u) => app.requests.approveInfo(id(ctx), u, ctx.body)));
  router.post('/api/admin/info-requests/:id/reject', S((ctx, u) => app.requests.rejectInfo(id(ctx), u, ctx.body)));
  router.post('/api/admin/info-requests/:id/record-reply', S((ctx, u) => app.requests.recordReply(id(ctx), u, ctx.body)));
  router.post('/api/admin/info-requests/:id/share', S((ctx, u) => app.requests.shareInfo(id(ctx), u, ctx.body)));
  router.post('/api/admin/info-requests/:id/cancel', S((ctx, u) => app.requests.cancelInfo(id(ctx), u)));
  router.post('/api/admin/counsel-requests/:id/assign', S((ctx, u) => app.requests.assignCounsel(id(ctx), u, ctx.body)));
  router.post('/api/admin/counsel-requests/:id/reject', S((ctx, u) => app.requests.rejectCounsel(id(ctx), u, ctx.body)));

  router.post('/api/admin/opinions/:id/approve', S((ctx, u) => app.opinions.approve(id(ctx), u, ctx.body)));
  router.post('/api/admin/opinions/:id/return', S((ctx, u) => app.opinions.returnToLawyer(id(ctx), u, ctx.body)));
  router.post('/api/admin/cases/:id/client-answers', S((ctx, u) => app.opinions.saveClientAnswer(id(ctx), u, ctx.body)));
  router.post('/api/admin/cases/:id/ai/client-version', S(async (ctx, u) => app.ai.clientVersion(id(ctx), v.int(ctx.body.opinion_id, 'الرأي', { required: true, min: 1 }), u)));
  router.post('/api/admin/client-answers/:id/send', S((ctx, u) => app.opinions.sendClientAnswer(id(ctx), u, ctx.body)));
  router.post('/api/admin/cases/:id/messages', S((ctx, u) => app.cases.sendMessage(id(ctx), ctx.body, u)));
  router.post('/api/admin/cases/:id/close', S((ctx, u) => app.cases.close(id(ctx), ctx.body, u)));
  router.post('/api/admin/cases/:id/reopen', S((ctx, u) => app.cases.reopen(id(ctx), ctx.body, u)));
  router.post('/api/admin/cases/:id/matter', S((ctx, u) => {
    ctx.status = 201;
    return app.matters.createFromCase(id(ctx), ctx.body, u);
  }));
  router.post('/api/admin/messages/:id/retry', S((ctx) => app.engine.retry(id(ctx))));

  // ===== الملفات المستمرة =====
  router.get('/api/admin/matters', S((ctx) => app.matters.list(ctx.query)));
  router.get('/api/admin/matters/:id', S((ctx) => app.matters.detail(id(ctx))));
  router.patch('/api/admin/matters/:id', S((ctx, u) => app.matters.update(id(ctx), ctx.body, u)));
  router.post('/api/admin/matters/:id/events', S((ctx, u) => app.matters.addEvent(id(ctx), ctx.body, u)));
  router.patch('/api/admin/matter-events/:id', S((ctx, u) => app.matters.updateEvent(id(ctx), ctx.body, u)));
  router.post('/api/admin/matter-events/:id/approve-reminder', S((ctx, u) => app.matters.approveEventText(id(ctx), u)));
  router.post('/api/admin/matters/:id/tasks', S((ctx, u) => app.matters.addTask(id(ctx), ctx.body, u)));
  router.patch('/api/admin/matter-tasks/:id', S((ctx, u) => app.matters.updateTask(id(ctx), ctx.body, u)));
  router.post('/api/admin/matters/:id/invoices', S((ctx, u) => app.matters.addInvoice(id(ctx), ctx.body, u)));
  router.post('/api/admin/invoices/:id/payments', S((ctx, u) => app.matters.addPayment(id(ctx), ctx.body, u)));
  router.post('/api/admin/invoices/:id/cancel', S((ctx, u) => app.matters.cancelInvoice(id(ctx), u)));
  router.post('/api/admin/matters/:id/expenses', S((ctx, u) => app.matters.addExpense(id(ctx), ctx.body, u)));
  router.post('/api/admin/matters/:id/messages', S((ctx, u) => app.matters.sendMessage(id(ctx), ctx.body, u)));
  router.post('/api/admin/matters/:id/documents', S((ctx, u) => {
    const m = app.matters.require(id(ctx));
    const ids = app.documents.saveMany(ctx.body.files, { client_id: m.client_id, matter_id: m.id, case_id: m.case_id, title: ctx.body.title }, u, { max: 10 });
    app.activity.log({ matter_id: m.id, case_id: m.case_id, actor: u, type: 'documents.added', summary: `أُضيفت مستندات إلى الملف المستمر (العدد: ${ids.length})` });
    return ids.map((x) => app.documents.publicView(app.documents.get(x)));
  }), UPLOAD);
  router.post('/api/admin/matters/:id/lawyer-fees', A((ctx, u) => {
    const m = app.matters.require(id(ctx));
    return app.accounting.addAdjustment({ ...ctx.body, kind: 'matter_fee', matter_id: m.id }, u);
  }));

  // ===== شبكة المحامين =====
  router.get('/api/admin/lawyers', S((ctx) => app.lawyers.list(ctx.query)));
  router.post('/api/admin/lawyers', A((ctx, u) => {
    ctx.status = 201;
    // بدون كلمة مرور: يُنشأ الحساب برابط دعوة للاستخدام مرة واحدة (وحدة الحسابات)
    if (!ctx.body.password) return app.accounts.createInvitedUser('lawyer', ctx.body, u, ctx);
    const created = app.lawyers.create(ctx.body, u);
    app.accounts.onUserCreated(created.id, u, ctx, { temporary: ctx.body.temporary_password === true });
    return created;
  }));
  router.get('/api/admin/lawyers/suggest', S((ctx) => app.lawyers.suggest({ area: ctx.query.area, case_id: ctx.query.case_id })));
  router.get('/api/admin/lawyers/:id', S((ctx) => app.lawyers.detail(id(ctx), ctx.query.period)));
  // app.accounts.audited: يسجل التفعيل/الإيقاف وتغيير البيانات في سجل الأمان، وكلمة المرور التي تعيّنها الإدارة تصبح مؤقتة
  router.patch('/api/admin/lawyers/:id', A((ctx, u) => app.accounts.audited(id(ctx), u, ctx, () => app.lawyers.update(id(ctx), ctx.body, u))));
  router.post('/api/admin/lawyers/:id/password', A((ctx, u) =>
    app.accounts.audited(id(ctx), u, ctx, () => app.lawyers.setPassword(id(ctx), ctx.body.password, u), { temporaryPassword: ctx.body.temporary_password !== false }),
  ));
  router.post('/api/admin/lawyers/:id/package', A((ctx, u) => {
    app.accounting.addPackage(id(ctx), ctx.body, u);
    return app.lawyers.detail(id(ctx)).lawyer;
  }));

  // ===== المحاسبة (مدير النظام) =====
  router.get('/api/admin/accounting/summary', A((ctx) => app.accounting.summary(ctx.query.period)));
  router.get('/api/admin/accounting/ledger', A((ctx) => app.accounting.ledger(ctx.query)));
  router.post('/api/admin/accounting/close-month', A((ctx, u) => app.accounting.closeMonth(ctx.body.period, u)));
  router.post('/api/admin/accounting/payouts', A((ctx, u) => app.accounting.payout(ctx.body, u)));
  router.post('/api/admin/accounting/adjustments', A((ctx, u) => app.accounting.addAdjustment(ctx.body, u)));
  router.post('/api/admin/accounting/entries/:id/void', A((ctx, u) => app.accounting.voidEntry(id(ctx), u, v.str(ctx.body.note, 'السبب', { max: 300 }))));
  router.get('/api/admin/accounting/case-cost/:id', S((ctx) => app.accounting.caseCost(app.cases.require(id(ctx)).id)));

  // ===== الأتمتة والرسائل =====
  router.get('/api/admin/automations', S(() => ({ rules: app.automations.list(), whatsapp_configured: app.whatsapp.configured })));
  router.patch('/api/admin/automations/:key', A((ctx, u) => app.automations.update(ctx.params.key, ctx.body, u)));
  router.post('/api/admin/automations/run', S(() => app.automations.runAll()));
  // معاينة قبل التشغيل اليدوي: كم رسالة ستُرسل للمستفيدين الآن (لا يُنفَّذ ولا يُرسل شيء)
  router.get('/api/admin/automations/preview', S(() => app.automations.preview()));
  router.get('/api/admin/outbox', S((ctx) => app.automations.outbox(ctx.query)));

  // ===== المعرفة المؤسسية والذكاء الاصطناعي =====
  router.get('/api/admin/knowledge', S((ctx) => app.knowledge.list(ctx.query)));
  router.get('/api/admin/knowledge/search', S((ctx) => app.knowledge.search(v.str(ctx.query.q, 'نص البحث', { required: true, max: 2000 }))));
  router.get('/api/admin/knowledge/export', A(() => ({ exported_at: nowIso(), records: app.knowledge.exportTraining() })));
  router.get('/api/admin/knowledge/:id', S((ctx) => app.knowledge.get(id(ctx))));
  router.patch('/api/admin/knowledge/:id', S((ctx, u) => app.knowledge.update(id(ctx), ctx.body, u)));
  router.post('/api/admin/knowledge/:id/approve', S((ctx, u) => app.knowledge.approve(id(ctx), ctx.body, u)));
  router.post('/api/admin/knowledge/:id/exclude', S((ctx, u) => app.knowledge.exclude(id(ctx), ctx.body, u)));
  router.post('/api/admin/knowledge/:id/rebuild', S((ctx) => app.knowledge.rebuild(id(ctx))));
  router.get('/api/admin/ai/metrics', S(() => app.ai.metrics()));

  // ===== التحليلات =====
  router.get('/api/admin/analytics/funnel', S((ctx) => {
    const group = ['source', 'channel', 'campaign'].includes(ctx.query.group) ? ctx.query.group : 'source';
    return app.analytics.funnel({ from: v.iso(ctx.query.from, 'من'), to: v.iso(ctx.query.to, 'إلى'), group });
  }));
  router.get('/api/admin/analytics/areas', S(() => ({ items: app.analytics.byArea(), weekly: app.analytics.weeklyVolume() })));
  router.get('/api/admin/analytics/spend', S((ctx) => app.analytics.listSpend(ctx.query)));
  router.post('/api/admin/analytics/spend', A((ctx, u) => app.analytics.saveSpend(ctx.body, u)));
  router.patch('/api/admin/analytics/spend/:id', A((ctx) => app.analytics.updateSpend(id(ctx), ctx.body)));
  router.delete('/api/admin/analytics/spend/:id', A((ctx) => app.analytics.deleteSpend(id(ctx))));

  // ===== المستخدمون والإعدادات (مدير النظام) =====
  router.get('/api/admin/users', A(() => app.lawyers.staffList()));
  router.post('/api/admin/users', A((ctx, u) => {
    ctx.status = 201;
    // بدون كلمة مرور: دعوة للاستخدام مرة واحدة (وحدة الحسابات)
    if (!ctx.body.password) return app.accounts.createInvitedUser('staff', ctx.body, u, ctx);
    const created = app.lawyers.createStaff(ctx.body);
    app.accounts.onUserCreated(created.id, u, ctx, { temporary: ctx.body.temporary_password === true });
    return created;
  }));
  router.patch('/api/admin/users/:id', A((ctx, u) =>
    app.accounts.audited(id(ctx), u, ctx, () => app.lawyers.updateStaff(id(ctx), ctx.body, u), { temporaryPassword: ctx.body.temporary_password !== false }),
  ));
  /** v9.2: التحقق من إعدادات القصص الواردة والمكالمات */
  function storySettings(b) {
    const out = {};
    if (b.story_quiet_minutes !== undefined) {
      const n = Number(latinDigits(b.story_quiet_minutes));
      if (!Number.isInteger(n) || n < 2 || n > 120) throw badRequest('اكتب مدة بين 2 و120 دقيقة');
      out.story_quiet_minutes = n;
    }
    for (const k of ['story_welcome_enabled', 'story_ack_enabled']) if (b[k] !== undefined) out[k] = v.bool(b[k]);
    if (b.story_auto_ai_max_per_day !== undefined) out.story_auto_ai_max_per_day = v.int(b.story_auto_ai_max_per_day, 'حد التحليل التلقائي بـ Claude لكل طلب', { required: true, min: 1, max: 50 });
    if (b.story_done_words !== undefined) {
      const list = b.story_done_words;
      if (!Array.isArray(list) || list.length > 20) throw badRequest('كلمات «خلاص»: 20 كلمة على الأكثر');
      out.story_done_words = list.map((w) => v.str(w, 'كلمة «خلاص»', { required: true, max: 30 }));
    }
    if (b.story_referrals !== undefined) {
      const list = b.story_referrals;
      if (!Array.isArray(list) || list.length > 20) throw badRequest('دليل التوجيه: 20 جهة على الأكثر');
      out.story_referrals = list.map((r, k) => {
        if (!r || typeof r !== 'object') throw badRequest(`جهة التوجيه رقم ${k + 1} غير صالحة`);
        const kws = r.keywords === undefined ? [] : r.keywords;
        if (!Array.isArray(kws) || kws.length > 30) throw badRequest('الكلمات الدالة: 30 كلمة على الأكثر لكل جهة');
        return {
          key: v.str(r.key, 'مفتاح الجهة', { required: true, max: 40 }),
          label: v.str(r.label, 'اسم الجهة', { required: true, max: 100 }),
          keywords: kws.map((x) => v.str(x, 'كلمة دالة', { required: true, max: 40 })),
          reply: v.str(r.reply, 'رسالة التوجيه', { max: 1000 }) || '',
        };
      });
    }
    if (b.callback_from_number !== undefined) {
      const raw = String(latinDigits(b.callback_from_number ?? '')).trim();
      let shown = '';
      if (raw) {
        const p = normalizePhone(raw);
        if (!p || !p.startsWith('+20')) throw badRequest('اكتب رقمًا مصريًا صحيحًا أو اتركه فارغًا');
        // [مراجعة 9.2] يُحفظ بالصيغة المحلية المعروضة لها في الموقع («01211114662») لا كما كُتب (مسافات، رموز، +20)
        shown = `0${p.slice(3)}`;
      }
      out.callback_from_number = shown;
    }
    if (b.callback_eta_days !== undefined) out.callback_eta_days = v.int(b.callback_eta_days, 'نتصل خلال (أيام عمل)', { required: true, min: 1, max: 5 });
    return out;
  }

  router.get('/api/admin/settings', A((ctx) => ({
    settings: app.settings.all(),
    integrations: {
      whatsapp_configured: app.whatsapp.configured,
      // حالة الاتصال الفعلية (بعد «اختبار الاتصال»): simulation | untested | failed | connected
      whatsapp_status: app.system?.whatsappStatus ? app.system.whatsappStatus() : null,
      // القيم الفعلية (البيئة أولًا ثم المحفوظ من صفحة التكاملات)
      whatsapp_verify_token_set: !!app.whatsapp.effective().verifyToken,
      whatsapp_app_secret_set: !!app.whatsapp.effective().appSecret,
      webhook_path: '/webhooks/whatsapp',
      ai: app.ai.status(),
      demo: !!app.config.demo,
    },
  })));
  router.patch('/api/admin/settings', A((ctx) => {
    const b = ctx.body;
    const out = {};
    const str = (k, label, max, required = false) => {
      if (b[k] !== undefined) out[k] = v.str(b[k], label, { required, max });
    };
    str('org_name', 'اسم المؤسسة', 100, true);
    str('org_tagline', 'الشعار', 200);
    str('privacy_notice', 'سياسة الخصوصية', 2000, true);
    str('whatsapp_template_name', 'اسم قالب واتساب', 100);
    str('whatsapp_template_language', 'لغة القالب', 10);
    // (v9 site) الموقع العام وبيانات التواصل: روابط https من فيسبوك/إنستجرام فقط، بريد وهاتف صالحان، أطوال محددة
    if (app.site?.validateSettings) Object.assign(out, app.site.validateSettings(b));
    if (b.whatsapp_display_number !== undefined) {
      // فارغ = لا رقم واتساب للمؤسسة بعد (تختفي أزرار واتساب من الموقع ويظهر الهاتف بديلًا)
      const s = v.str(b.whatsapp_display_number, 'رقم واتساب', { max: 30 });
      if (s !== null) {
        if (!normalizePhone(s)) throw badRequest('رقم واتساب غير صالح');
        if (isPlaceholderWhatsApp(s)) throw badRequest('هذا رقم توضيحي وليس رقم واتساب المؤسسة؛ اكتب الرقم الفعلي أو اترك الحقل فارغًا');
      }
      out.whatsapp_display_number = s ?? '';
    }
    if (b.default_assignment_days !== undefined) out.default_assignment_days = v.int(b.default_assignment_days, 'المدة الافتراضية للرد', { required: true, min: 1, max: 60 });
    // v9.2 (admin-ai): إعدادات القصص الواردة (تحقق صريح قبل الحلقة العامة)
    Object.assign(out, storySettings(b));
    if (b.similarity_threshold !== undefined) out.similarity_threshold = v.num(b.similarity_threshold, 'حد التشابه', { required: true, min: 0.05, max: 0.9 });
    // بقية الإعدادات المعرفة في DEFAULT_SETTINGS (التي تضيفها وحدات الإصدار 9) تُتحقق حسب نوع قيمتها الافتراضية
    // (v9 accounts) مفاتيح سياسة الأمان لا تُحفظ من هنا مباشرة بل عبر app.accounts.updatePolicy
    // (نطاقاتها، شرط تفعيل التحقق بخطوتين لمن يُلزم به الآخرين، وتسجيلها كحدث «تعديل سياسة الأمان»)
    const policyKeys = app.accounts?.POLICY_KEYS || [];
    for (const [k, val] of Object.entries(b)) {
      if (k in out || !(k in DEFAULT_SETTINGS) || policyKeys.includes(k)) continue;
      const def = DEFAULT_SETTINGS[k];
      if (typeof def === 'number') out[k] = v.num(val, k, { required: true, min: -1e9, max: 1e9 });
      else if (typeof def === 'boolean') out[k] = v.bool(val);
      else if (typeof def === 'string') out[k] = v.str(val, k, { max: 5000 }) ?? '';
      else if (Array.isArray(def) || (def && typeof def === 'object')) {
        if (typeof val !== 'object' || val === null) throw badRequest(`قيمة غير صالحة للإعداد ${k}`);
        if (JSON.stringify(val).length > 20000) throw badRequest(`قيمة الإعداد ${k} أطول من المسموح`);
        out[k] = val;
      }
    }
    const policyPatch = Object.fromEntries(Object.entries(b).filter(([k]) => policyKeys.includes(k)));
    if (Object.keys(policyPatch).length) app.accounts.updatePolicy(policyPatch, ctx.user, ctx);
    for (const [k, val] of Object.entries(out)) {
      if (!(k in DEFAULT_SETTINGS)) continue;
      app.settings.set(k, val);
    }
    if (Object.keys(out).length) app.audit.log({ actor: ctx.user, ctx, type: 'settings.updated', summary: `تم تعديل الإعدادات: ${Object.keys(out).join('، ')}` });
    return app.settings.all();
  }));
}
