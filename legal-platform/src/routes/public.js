// المسارات العامة: البيانات الوصفية، الدخول، الإشعارات، تنزيل المستندات، نموذج الموقع، بوابة العميل، Webhook واتساب.
import { LEGAL_AREAS, GOVERNORATES, LABELS, ENUMS } from '../constants.js';
import { requireUser } from '../auth.js';
import { idParam } from '../http.js';
import { v, badRequest, notFound, forbidden } from '../util.js';
import crypto from 'node:crypto'; // v9.1 b-forms
import { sha256, parseJson, addDays, nowIso } from '../util.js'; // v9.1 b-forms
import { sha256 as metaHash } from '../util.js'; // v9.1 l-home
import { sourceFromWebAttribution } from '../channels/engine.js';
import { verifySignature, publicWhatsAppDigits, isPlaceholderWhatsApp } from '../channels/whatsapp.js';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin@2026', role: 'admin', name: 'كريم منصور — إدارة النظام' },
  { username: 'manager', password: 'Manager@2026', role: 'case_manager', name: 'منى السيد — إدارة الحالات' },
  { username: 'ahmed', password: 'Lawyer@2026', role: 'lawyer', name: 'أ. أحمد عبد العظيم — مواريث (المحامي الأساسي)' },
  { username: 'mohamed', password: 'Lawyer@2026', role: 'lawyer', name: 'أ. محمد فؤاد — ضرائب (محامٍ متخصص مساعد)' },
  { username: 'salwa', password: 'Lawyer@2026', role: 'lawyer', name: 'د. سلوى الشريف — مراجعة نهائية (تطوعي)' },
];
export { DEMO_ACCOUNTS };

// v9.1 b-forms: حدود نموذج الطلب
const MIN_DESC_CHARS = 10; // حروف غير المسافات، حين لا توجد رسالة صوتية
const MAX_INTAKE_DOCS = 5;
const MAX_INTAKE_AUDIO = 3;
const VOICE_ONLY_TEXT = '[رسالة صوتية]';
const SUBMISSION_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function registerPublicRoutes(router, app) {
  const { config } = app;
  const db = app.db; // v9.1 b-forms

  function waDigits() {
    // الرقم الفعلي من إعدادات التكاملات (البيئة أولًا) ثم الرقم الظاهر في الإعدادات العامة؛
    // '' إن لم يُضبط رقم حقيقي (الرقم التوضيحي +20 100 000 0000 لا يُنتج رابط wa.me أبدًا)
    if (app.whatsapp.publicDigits) return app.whatsapp.publicDigits();
    return publicWhatsAppDigits(config.whatsapp?.numberDigits) || publicWhatsAppDigits(app.settings.get('whatsapp_display_number'));
  }

  // v9.1 l-home (L-07): الحمولة نفسها تُبنى هنا، وتُرسل بـ ETag (304 لمن يملك نسختها)، و/api/auth/session يعيد
  // meta_version فتستخدم الواجهة نسختها المحفوظة دون طلب /api/meta إطلاقًا ما دامت لم تتغير.
  const buildMeta = (ctx) => {
    const s = app.settings.all();
    const digits = waDigits();
    return {
      constants: { LEGAL_AREAS, GOVERNORATES, LABELS, ENUMS },
      settings: {
        org_name: s.org_name,
        org_tagline: s.org_tagline,
        // الرقم الظاهر كما كتبته الإدارة، ويُخفى ما دام لا يوجد رقم واتساب فعلي (فارغ أو توضيحي)
        whatsapp_display_number: digits && !isPlaceholderWhatsApp(s.whatsapp_display_number) ? s.whatsapp_display_number || '' : '',
        whatsapp_number_digits: digits,
        privacy_notice: s.privacy_notice,
        default_assignment_days: s.default_assignment_days,
      },
      demo: !!config.demo,
      demo_accounts: config.demo ? DEMO_ACCOUNTS : undefined,
      version: app.version,
      // حقول تضيفها وحدات الإصدار 9
      ...Object.assign({}, ...app.metaProviders.map((fn) => fn(ctx) || {})),
    };
  };
  const metaVersion = (meta) => `"m-${metaHash(JSON.stringify(meta)).slice(0, 20)}"`;
  app.metaVersion = (ctx) => metaVersion(buildMeta(ctx));
  // ?part=login: نسخة صغيرة لشاشات ما قبل الدخول (الإعدادات العامة وتسميات الأدوار فقط، نحو 1 كيلوبايت بدل 10)؛
  // تجلب الواجهة النسخة الكاملة في الخلفية بعد ظهور شاشة الدخول وقبل فتح التطبيق.
  const loginMeta = (meta) => ({ ...meta, constants: { LABELS: { user_role: LABELS.user_role } }, partial: true });
  router.get('/api/meta', (ctx) => {
    const meta = ctx.query?.part === 'login' ? loginMeta(buildMeta(ctx)) : buildMeta(ctx);
    const etag = metaVersion(meta);
    ctx.res.setHeader('ETag', etag);
    const inm = String(ctx.req.headers['if-none-match'] || '');
    if (inm && inm.split(',').some((x) => x.trim().replace(/^W\//, '') === etag)) {
      ctx.res.statusCode = 304;
      ctx.res.setHeader('Cache-Control', 'no-cache');
      ctx.res.end();
      ctx.streamed = true;
      return undefined;
    }
    return meta;
  });

  // ===== الدخول =====
  // يعيد { user } أو { two_factor_required, challenge } لحسابات التحقق بخطوتين (الخطوة الثانية: POST /api/auth/login/2fa)
  router.post('/api/auth/login', (ctx) => app.auth.loginStep(ctx, ctx.body.username, ctx.body.password));
  router.post('/api/auth/logout', (ctx) => {
    app.auth.logout(ctx);
    return { ok: true };
  });
  // فحص الجلسة دون خطأ 401 (لتحميل الواجهة بلا أخطاء في وحدة التحكم)
  // v9.1 l-home: meta_version = ETag الحالي لـ /api/meta (تتخطى الواجهة طلب meta إن طابق نسختها المحفوظة)
  // ?meta=full|login (جهاز بلا نسخة meta محفوظة): الحمولة نفسها في الرد مع ETag لها — طلب واحد بدل اثنين على شبكة بطيئة.
  // من لديه جلسة صالحة يأخذ النسخة الكاملة دائمًا (سيدخل التطبيق مباشرة).
  // ?page=/lawyer/…: بيانات صفحة المحامي المطلوبة في الرابط مع الجلسة (app.sessionPageData — مسار l-home)
  router.get('/api/auth/session', async (ctx) => {
    const full = buildMeta(ctx);
    const out = { user: ctx.user ? app.auth.publicUser(ctx.user) : null, meta_version: metaVersion(full) };
    const want = ctx.query?.meta;
    if (want === 'full' || want === 'login') {
      out.meta = want === 'login' && !ctx.user ? loginMeta(full) : full;
      out.meta_etag = out.meta === full ? out.meta_version : metaVersion(out.meta);
    }
    if (ctx.query?.page && ctx.user && app.sessionPageData) {
      const page = await app.sessionPageData(ctx, String(ctx.query.page));
      if (page) out.page = page;
    }
    return out;
  });
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
  // v9.1 b-forms: ردّ نموذج الطلب. رابط المتابعة مقصور على هذا الطلب وحده، وكود التأكيد (6 أرقام عشوائية،
  // يُخزَّن مُجزّأً 30 يومًا) يُرسل مع رقم الطلب في رسالة واتساب جاهزة فيثبت أن مقدّمة الطلب صاحبة الرقم (B91-01).
  // إعادة الإرسال بنفس submission_id (انقطع النت بعد وصول الطلب) تُصدر رابطًا وكودًا جديدين لنفس الطلب ولا تنشئ طلبًا ثانيًا.
  function intakeResponse(intake, clientId) {
    const token = app.clients.issuePortalToken(clientId, { intakeId: intake.id });
    const s = app.settings.all();
    const digits = waDigits();
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const fresh = db.get('SELECT source_detail FROM intakes WHERE id = ?', intake.id);
    const sd = parseJson(fresh?.source_detail, {});
    sd.confirm_hash = sha256(code);
    sd.confirm_expires_at = addDays(nowIso(), 30);
    if (!Number.isInteger(sd.confirm_failures)) sd.confirm_failures = 0;
    db.update('intakes', intake.id, { source_detail: JSON.stringify(sd) });
    const text = `مرحبًا ${s.org_name}، رقم طلبي ${intake.code} وأريد استكمال طلبي عبر واتساب.`;
    const confirmText = `السلام عليكم، ده رقم طلبي ${intake.code} وكود التأكيد ${code}`;
    return {
      reference: intake.code,
      portal_url: app.clients.portalUrl(token),
      confirm_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(confirmText)}` : null,
      // للتوافق مع الإصدارات السابقة؛ الواجهة تستخدم confirm_url
      whatsapp_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
      // «فريقنا هيقرا طلبك — غالبًا خلال يومين شغل» في شاشة «وصلنا طلبك»
      eta_review_days: Math.max(1, Number(s.portal_eta_review_days) || 2),
    };
  }

  router.post(
    '/api/public/intake',
    (ctx) => {
      app.limiters.publicIntake.hit(`intake:${ctx.ip}`);
      const b = ctx.body;
      if (b.website) return { reference: null, ok: true }; // حقل فخ للبرامج الآلية
      if (b.consent !== true) throw badRequest('لازم توافقي عشان نقدر نساعدك.');
      const name = v.str(b.name, 'الاسم', { required: true, min: 2, max: 120 });
      const phone = v.phone(b.phone, 'رقم الموبايل', { required: true, egyptianMobile: true });
      // v9.1 b-forms: معرّف إرسال عشوائي من المتصفح؛ إعادة المحاولة بعد انقطاع النت لا تنشئ طلبًا ثانيًا
      const submission = typeof b.submission_id === 'string' && SUBMISSION_RE.test(b.submission_id) ? b.submission_id : null;
      let externalId = submission ? `web-intake:${submission}` : null;
      const already = () => {
        if (!externalId) return null;
        const m = db.get("SELECT intake_id, client_id FROM messages WHERE channel = 'website' AND external_id = ?", externalId);
        if (!m) return null;
        const it = m.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', m.intake_id) : null;
        // نفس المعرّف ونفس الرقم فقط (المعرّف سر لا يعرفه إلا متصفح مقدّمة الطلب)؛ رقم مختلف = طلب جديد مستقل
        if (it && it.contact_phone === phone && m.client_id) return { intake: it, clientId: m.client_id };
        externalId = null;
        return null;
      };
      const prev = already();
      if (prev) {
        ctx.status = 201;
        return intakeResponse(prev.intake, prev.clientId);
      }
      app.limiters.publicIntakePhone.hit(`phone:${phone}`);
      const email = v.email(b.email, 'البريد الإلكتروني');
      const governorate = b.governorate ? v.oneOf(b.governorate, GOVERNORATES, 'المحافظة') : null;
      const area = b.legal_area ? v.oneOf(b.legal_area, LEGAL_AREAS.map((a) => a.code), 'نوع المشكلة') : null;
      // v9.1 b-forms: حتى 5 صور/مستندات و3 رسائل صوتية؛ الرسالة الصوتية تغني عن الكتابة،
      // وبدونها يكفي وصف من 10 حروف («جوزي مات ومعاش» مقبول)
      const files = b.documents == null ? [] : Array.isArray(b.documents) ? b.documents : badRequestFiles();
      const audioCount = files.filter((f) => app.documents.isAudio(f || {})).length;
      if (files.length - audioCount > MAX_INTAKE_DOCS) throw badRequest('تقدري تبعتي لحد 5 صور دلوقتي. الباقي ابعتيه بعدين من صفحتك.');
      if (audioCount > MAX_INTAKE_AUDIO) throw badRequest('تقدري تبعتي لحد 3 رسايل صوتية.');
      let description = v.str(b.description, 'وصف المشكلة', { max: 10000 }) || '';
      if (!audioCount && description.replace(/\s/gu, '').length < MIN_DESC_CHARS) {
        throw badRequest('سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.', { fields: { description: 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.' } });
      }
      if (!description) description = VOICE_ONLY_TEXT;
      const mode = b.mode === 'guided' ? 'guided' : 'form';
      // v9 practice: بيانات الأسرة الاختيارية (يذكرها مقدم الطلب ولا يُتحقق منها) تُتحقق قبل إنشاء أي شيء
      const beneficiary = app.practice ? app.practice.beneficiary.validatePublic(b.beneficiary) : null;
      const attribution = sourceFromWebAttribution(b.attribution || {});
      attribution.detail = { ...attribution.detail, intake_mode: mode };
      const r = app.engine.receive({
        channel: 'website',
        from_phone: phone,
        from_email: email,
        contact_name: name,
        governorate,
        text: description,
        attachments: files,
        external_id: externalId,
        attribution,
        legal_area_hint: area,
        force_new_intake: true,
        intake_kind: 'consultation',
      });
      if (r.duplicate) {
        // سباق نادر: نفس الإرسال وصل مرتين في نفس اللحظة
        const again = already();
        if (!again) throw new Error('public intake duplicate without a matching intake');
        ctx.status = 201;
        return intakeResponse(again.intake, again.clientId);
      }
      // الرابط مقصور على هذا الطلب الجديد وحده: رقم الهاتف في نموذج الموقع غير موثّق،
      // فلا يُصدر رابط أبدًا لطلب لم يُنشئه هذا الإرسال نفسه
      if (!r.created_intake || !r.intake) throw new Error('public intake did not create a new intake');
      if (beneficiary) app.practice.beneficiary.savePublic(r.intake, r.client, beneficiary, { createdClient: !!r.created_client });
      ctx.status = 201;
      return intakeResponse(r.intake, r.client.id);
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
    const { client, intakeId, phone } = portalAccess(ctx);
    return app.portal.view(client, intakeId, { phone });
  });
  router.post(
    '/api/portal/:token/messages',
    (ctx) => {
      const { client, intakeId, phone } = portalAccess(ctx);
      app.limiters.portal.hit(`portal:${client.id}`);
      // v9.1 b-portal: صور ورسائل صوتية، وسؤال على رد بعينه (answer_id) أو مبلغ بعينه (invoice_number) داخل نطاق الرابط
      return app.portal.postMessage(client, intakeId, ctx.body || {}, { phone });
    },
    { limit: 60 * 1024 * 1024 },
  );
  // v9.1 b-portal: «هحضر / مش هقدر أحضر / عندي سؤال» على موعد يلزم حضورها (B91-13)
  router.post('/api/portal/:token/events/:id/response', (ctx) => {
    const { client, intakeId, phone } = portalAccess(ctx);
    app.limiters.portal.hit(`portal:${client.id}`);
    return app.portal.eventResponse(client, intakeId, idParam(ctx.params), ctx.body || {}, { phone });
  });
  // v9.1 b-portal: «موافقة / عندي سؤال / مش قادرة أدفع» على مصاريف القضية (B91-18)
  router.post('/api/portal/:token/invoices/:number/response', (ctx) => {
    const { client, intakeId, phone } = portalAccess(ctx);
    app.limiters.portal.hit(`portal:${client.id}`);
    return app.portal.invoiceResponse(client, intakeId, String(ctx.params.number || ''), ctx.body || {}, { phone });
  });
  // v9.1 b-portal: «اطلبي مكالمة» (مرتين في اليوم على الأكثر) (B91-14)
  router.post('/api/portal/:token/callback', (ctx) => {
    const { client, intakeId, phone } = portalAccess(ctx);
    app.limiters.portal.hit(`portal:${client.id}`);
    return app.portal.callback(client, intakeId, ctx.body || {}, { phone });
  });
  router.post(
    '/api/portal/:token/requests/:id/reply',
    (ctx) => {
      const { client, intakeId, phone } = portalAccess(ctx);
      app.limiters.portal.hit(`portal:${client.id}`);
      if (!app.portal.allowsInfoRequest(client, intakeId, idParam(ctx.params), { phone })) throw notFound('الطلب غير موجود');
      // v9.1 b-portal: صورة لكل بند (documents[].item)، و«مش لاقية الورقة دي» (missing_items)، والطلب يبقى مفتوحًا لباقي البنود
      return app.portal.replyToRequest(client, intakeId, idParam(ctx.params), ctx.body || {}, { phone });
    },
    { limit: 60 * 1024 * 1024 },
  );

  // ===== Webhook واتساب (WhatsApp Business Platform) =====
  router.get('/webhooks/whatsapp', (ctx) => {
    const q = ctx.query;
    // رمز التحقق الفعلي: البيئة أولًا ثم ما حُفظ من صفحة التكاملات
    const verifyToken = app.whatsapp.effective().verifyToken;
    if (q['hub.mode'] === 'subscribe' && verifyToken && q['hub.verify_token'] === verifyToken) {
      ctx.text = q['hub.challenge'] || '';
      return;
    }
    throw forbidden('رمز التحقق غير صحيح');
  });
  router.post(
    '/webhooks/whatsapp',
    (ctx) => {
      // سر التطبيق الفعلي: البيئة أولًا ثم ما حُفظ (مشفرًا) من صفحة التكاملات
      const appSecret = app.whatsapp.effective().appSecret;
      if (!appSecret) {
        // بدون سر التطبيق لا يمكن التحقق من أن الرسالة من ميتا: نقبلها فقط في وضع المحاكاة خارج الإنتاج
        if (config.production || app.whatsapp.configured) throw forbidden('Webhook واتساب معطل: يجب ضبط سر التطبيق (WHATSAPP_APP_SECRET) من صفحة التكاملات أو متغيرات البيئة');
      } else if (!verifySignature(ctx.rawBody, ctx.req.headers['x-hub-signature-256'], appSecret)) {
        throw forbidden('توقيع غير صالح');
      }
      let payload;
      try {
        payload = JSON.parse(ctx.rawBody.toString('utf8'));
      } catch {
        throw badRequest('JSON غير صالح');
      }
      const result = app.engine.handleWhatsAppWebhook(payload);
      // عند فشل حفظ أي رسالة نرد بخطأ حتى تعيد ميتا الإرسال؛ الرسائل المحفوظة لن تتكرر (منع التكرار بمعرف الرسالة)
      if (result.failed) ctx.status = 500;
      return { ok: !result.failed, ...result };
    },
    { raw: true, limit: 5 * 1024 * 1024 },
  );
}

function badRequestFiles() {
  throw badRequest('صيغة المرفقات غير صالحة');
}
