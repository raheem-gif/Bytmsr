// المسارات العامة: البيانات الوصفية، الدخول، الإشعارات، تنزيل المستندات، نموذج الموقع، بوابة العميل، Webhook واتساب.
import { LEGAL_AREAS, GOVERNORATES, LABELS, ENUMS } from '../constants.js';
import { requireUser } from '../auth.js';
import { idParam } from '../http.js';
import { v, badRequest, notFound, forbidden } from '../util.js';
import { sourceFromWebAttribution } from '../channels/engine.js';
import { verifySignature } from '../channels/whatsapp.js';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin@2026', role: 'admin', name: 'كريم منصور — مدير النظام' },
  { username: 'manager', password: 'Manager@2026', role: 'case_manager', name: 'منى السيد — مديرة الحالات' },
  { username: 'ahmed', password: 'Lawyer@2026', role: 'lawyer', name: 'أ. أحمد عبد العظيم — مواريث (المحامي الأساسي)' },
  { username: 'mohamed', password: 'Lawyer@2026', role: 'lawyer', name: 'أ. محمد فؤاد — ضرائب (متخصص مساعد)' },
  { username: 'salwa', password: 'Lawyer@2026', role: 'lawyer', name: 'د. سلوى الشريف — مراجع أول (Pro Bono)' },
];
export { DEMO_ACCOUNTS };

export function registerPublicRoutes(router, app) {
  const { config } = app;

  function waDigits() {
    const s = app.settings.all();
    return config.whatsapp.numberDigits || String(s.whatsapp_display_number || '').replace(/\D/g, '');
  }

  router.get('/api/meta', () => {
    const s = app.settings.all();
    return {
      constants: { LEGAL_AREAS, GOVERNORATES, LABELS, ENUMS },
      settings: {
        org_name: s.org_name,
        org_tagline: s.org_tagline,
        whatsapp_display_number: s.whatsapp_display_number,
        whatsapp_number_digits: waDigits(),
        privacy_notice: s.privacy_notice,
      },
      demo: !!config.demo,
      demo_accounts: config.demo ? DEMO_ACCOUNTS : undefined,
    };
  });

  // ===== الدخول =====
  router.post('/api/auth/login', (ctx) => {
    const user = app.auth.login(ctx, ctx.body.username, ctx.body.password);
    return { user };
  });
  router.post('/api/auth/logout', (ctx) => {
    app.auth.logout(ctx);
    return { ok: true };
  });
  // فحص الجلسة دون خطأ 401 (لتحميل الواجهة بلا أخطاء في وحدة التحكم)
  router.get('/api/auth/session', (ctx) => ({ user: ctx.user ? app.auth.publicUser(ctx.user) : null }));
  router.get('/api/auth/me', (ctx) => {
    const u = requireUser(ctx);
    return { user: app.auth.publicUser(u) };
  });

  // ===== الإشعارات =====
  router.get('/api/notifications', (ctx) => app.notifications.list(requireUser(ctx).id, { limit: ctx.query.limit }));
  router.post('/api/notifications/read-all', (ctx) => {
    app.notifications.markAllRead(requireUser(ctx).id);
    return { ok: true };
  });
  router.post('/api/notifications/:id/read', (ctx) => {
    app.notifications.markRead(requireUser(ctx).id, idParam(ctx.params));
    return { ok: true };
  });

  // ===== تنزيل المستندات (بعد التحقق من الصلاحية) =====
  router.get('/api/documents/:id/download', (ctx) => {
    const user = requireUser(ctx);
    const doc = app.documents.get(idParam(ctx.params));
    // 404 (وليس 403) للمستندات غير المتاحة حتى لا نكشف وجودها
    if (!doc || !app.documents.canAccess(user, doc)) throw notFound('المستند غير موجود');
    app.documents.send(ctx.res, doc, { inline: ctx.query.inline === '1' });
    ctx.streamed = true;
  });

  // ===== نموذج الموقع (Website Intake API) =====
  router.post(
    '/api/public/intake',
    (ctx) => {
      app.limiters.publicIntake.hit(`intake:${ctx.ip}`);
      const b = ctx.body;
      if (b.website) return { reference: null, ok: true }; // حقل فخ للبرامج الآلية
      if (b.consent !== true) throw badRequest('يجب الموافقة على سياسة الخصوصية لإرسال الطلب');
      const name = v.str(b.name, 'الاسم', { required: true, min: 2, max: 120 });
      const phone = v.phone(b.phone, 'رقم الموبايل', { required: true, egyptianMobile: true });
      const email = v.email(b.email, 'البريد الإلكتروني');
      const governorate = b.governorate ? v.oneOf(b.governorate, GOVERNORATES, 'المحافظة') : null;
      const area = b.legal_area ? v.oneOf(b.legal_area, LEGAL_AREAS.map((a) => a.code), 'نوع المشكلة') : null;
      const description = v.str(b.description, 'وصف المشكلة', { required: true, min: 20, max: 10000 });
      const mode = b.mode === 'guided' ? 'guided' : 'form';
      const attribution = sourceFromWebAttribution(b.attribution || {});
      attribution.detail = { ...attribution.detail, intake_mode: mode };
      const r = app.engine.receive({
        channel: 'website',
        from_phone: phone,
        from_email: email,
        contact_name: name,
        governorate,
        text: description,
        attachments: Array.isArray(b.documents) ? b.documents.slice(0, 5) : b.documents ? badRequestFiles() : [],
        attribution,
        legal_area_hint: area,
        force_new_intake: true,
        intake_kind: 'consultation',
      });
      // الرابط مقصور على هذا الطلب: رقم الهاتف في نموذج الموقع غير موثّق
      const token = app.clients.issuePortalToken(r.client.id, { intakeId: r.intake.id });
      const s = app.settings.all();
      const digits = waDigits();
      const text = `مرحبًا ${s.org_name}، رقم طلبي ${r.intake.code} وأريد استكمال طلبي عبر واتساب.`;
      ctx.status = 201;
      return {
        reference: r.intake.code,
        portal_url: app.clients.portalUrl(token),
        whatsapp_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
      };
    },
    { limit: 60 * 1024 * 1024 },
  );

  // ===== بوابة العميل =====
  function portalAccess(ctx) {
    const access = app.clients.portalAccess(ctx.params.token);
    if (!access) throw notFound('الرابط غير صالح أو انتهت صلاحيته. تواصل معنا لإرسال رابط جديد.');
    return access;
  }
  router.get('/api/portal/:token', (ctx) => {
    const { client, intakeId } = portalAccess(ctx);
    return app.portal.view(client, intakeId);
  });
  router.post(
    '/api/portal/:token/messages',
    (ctx) => {
      const { client, intakeId } = portalAccess(ctx);
      app.limiters.portal.hit(`portal:${client.id}`);
      const body = v.str(ctx.body.body, 'الرسالة', { max: 5000 }) || '';
      const docs = Array.isArray(ctx.body.documents) ? ctx.body.documents.slice(0, 5) : [];
      if (!body && !docs.length) throw badRequest('اكتب رسالتك أو أرفق ملفًا');
      app.engine.receive({ channel: 'website', portal_client_id: client.id, text: body || '[مرفقات]', attachments: docs, ...app.portal.targetFor(client, intakeId) });
      return { ok: true };
    },
    { limit: 60 * 1024 * 1024 },
  );
  router.post(
    '/api/portal/:token/requests/:id/reply',
    (ctx) => {
      const { client, intakeId } = portalAccess(ctx);
      app.limiters.portal.hit(`portal:${client.id}`);
      if (!app.portal.allowsInfoRequest(client, intakeId, idParam(ctx.params))) throw notFound('الطلب غير موجود');
      return app.requests.clientReplyFromPortal(idParam(ctx.params), client, {
        body: ctx.body.body,
        documents: Array.isArray(ctx.body.documents) ? ctx.body.documents.slice(0, 5) : [],
      });
    },
    { limit: 60 * 1024 * 1024 },
  );

  // ===== Webhook واتساب (WhatsApp Business Platform) =====
  router.get('/webhooks/whatsapp', (ctx) => {
    const q = ctx.query;
    if (q['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && q['hub.verify_token'] === config.whatsapp.verifyToken) {
      ctx.text = q['hub.challenge'] || '';
      return;
    }
    throw forbidden('رمز التحقق غير صحيح');
  });
  router.post(
    '/webhooks/whatsapp',
    (ctx) => {
      if (!verifySignature(ctx.rawBody, ctx.req.headers['x-hub-signature-256'], config.whatsapp.appSecret)) {
        throw forbidden('توقيع غير صالح');
      }
      let payload;
      try {
        payload = JSON.parse(ctx.rawBody.toString('utf8'));
      } catch {
        throw badRequest('JSON غير صالح');
      }
      const result = app.engine.handleWhatsAppWebhook(payload);
      return { ok: true, ...result };
    },
    { raw: true, limit: 5 * 1024 * 1024 },
  );
}

function badRequestFiles() {
  throw badRequest('صيغة المرفقات غير صالحة');
}
