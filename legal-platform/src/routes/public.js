// المسارات العامة: البيانات الوصفية، الدخول، الإشعارات، تنزيل المستندات، نموذج الموقع، بوابة العميل، Webhook واتساب.
import { LEGAL_AREAS, GOVERNORATES, LABELS, ENUMS } from '../constants.js';
import { requireUser } from '../auth.js';
import { idParam } from '../http.js';
import { v, badRequest, notFound, forbidden } from '../util.js';
import crypto from 'node:crypto'; // v9.1 b-forms
import { sha256, parseJson, addDays, nowIso } from '../util.js'; // v9.1 b-forms
import { sha256 as metaHash } from '../util.js'; // v9.1 l-home
import { sourceFromWebAttribution, isPortalUnverifiedIntake } from '../channels/engine.js';
import { verifySignature, publicWhatsAppDigits, isPlaceholderWhatsApp } from '../channels/whatsapp.js';
// v9.2 public: مصدر واحد لمواضيع الطلب (الموقع والخادم والإدارة)
import { topicByKey, sanitizeAnswers, infer, CALLBACK_WHEN } from '../../public/assets/js/public/topics.js';
import { addressForm } from '../util.js';
// v11 segment-server (SS-1، §5.7): نوع الخدمة وطلب العرض للشركات
import { ApiError } from '../util.js';
import { isPlainName, collapseSpaces } from '../brand.js';
import { REQUESTER_EMPLOYEES, REQUESTER_NEEDS } from '../../public/assets/js/public/segment.js';

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
// v9.2 public (§3.3): من أين بدأ الطلب، وأي شكل للنموذج
const ENTRIES = ['home_tile', 'home_callback', 'intake_tiles', 'direct', 'company_band']; // v11 segment-server: + company_band
const MODES = ['form', 'guided', 'tiles', 'callback'];
const NAME_MSG = 'اكتبي اسمك كامل، أو سيبيه فاضي.';
const MAX_AUDIO_SECONDS = 600;
// المحافظات الأكثر طلبًا تُكمَّل من هذه القائمة حتى 6، ثم «محافظة تانية»
const QUICK_GOVERNORATES = ['القاهرة', 'الجيزة', 'القليوبية', 'الإسكندرية', 'الشرقية', 'الدقهلية'];
const OTHER_GOVERNORATE = 'محافظة تانية';
const nonSpace = (s) => String(s || '').replace(/\s/gu, '').length;
// v11 segment-server [r2 S16]: رمز ثابت لكل خطأ 400/429 من نموذج الطلب (يترجمه intake.js لنصوص الأفراد والشركات)، والنص العربي كما هو
const withCode = (err, code) => {
  if (err instanceof ApiError) err.code = code;
  return err;
};
const INVALID_MSG = 'بيانات غير صالحة.';
const COMPANY_NAME_MSG = 'اكتبوا اسم الشركة.';
const COMPANY_EMAIL_MSG = 'البريد الإلكتروني غير صحيح.';
/**
 * v11 segment-server (G11-44): بيانات طلب العرض للشركات — مع «أفراد وشركات» فقط. المفاتيح غير المعروفة تُحذف،
 * والقيم غير الصالحة 400 بأخطاء الحقول.
 */
function cleanRequester(raw, segment) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.kind !== 'company' || segment !== 'paid') throw withCode(badRequest(INVALID_MSG), 'invalid');
  const name = typeof raw.company_name === 'string' ? collapseSpaces(raw.company_name) : '';
  if (name.length < 2 || name.length > 120 || !isPlainName(name)) throw withCode(badRequest(COMPANY_NAME_MSG, { fields: { company_name: COMPANY_NAME_MSG } }), 'invalid');
  const out = { kind: 'company', company_name: name };
  if (raw.job_title !== undefined && raw.job_title !== null && raw.job_title !== '') {
    const jt = typeof raw.job_title === 'string' ? collapseSpaces(raw.job_title) : '';
    if (!jt || jt.length > 80 || !isPlainName(jt)) throw withCode(badRequest(INVALID_MSG, { fields: { job_title: INVALID_MSG } }), 'invalid');
    out.job_title = jt;
  }
  if (raw.email !== undefined && raw.email !== null && raw.email !== '') {
    let email = null;
    try {
      email = v.email(raw.email, 'البريد الإلكتروني');
    } catch {
      email = null;
    }
    if (!email) throw withCode(badRequest(COMPANY_EMAIL_MSG, { fields: { email: COMPANY_EMAIL_MSG } }), 'invalid');
    out.email = email;
  }
  if (raw.employees !== undefined && raw.employees !== null && raw.employees !== '') {
    if (!REQUESTER_EMPLOYEES.includes(raw.employees)) throw withCode(badRequest(INVALID_MSG, { fields: { employees: INVALID_MSG } }), 'invalid');
    out.employees = raw.employees;
  }
  if (raw.needs !== undefined && raw.needs !== null) {
    if (!Array.isArray(raw.needs) || raw.needs.length > REQUESTER_NEEDS.length || raw.needs.some((x) => !REQUESTER_NEEDS.includes(x))) throw withCode(badRequest(INVALID_MSG, { fields: { needs: INVALID_MSG } }), 'invalid');
    out.needs = REQUESTER_NEEDS.filter((k) => raw.needs.includes(k));
  }
  return out;
}

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
    // (إصلاح 9.1) نافذة الجلسة: الواجهة لا تفتح «اليوم» المحفوظ على الجهاز دون اتصال بعد انتهائها (هاتف مفقود أو مشترك).
    // last_seen_at هو آخر نشاط مسجّل قبل هذا الطلب (طلب الخلفية لا يمدّد المهلة)
    if (ctx.user && ctx.user.session_expires) {
      const idle = Number(ctx.user.session_idle_hours) > 0 ? Number(ctx.user.session_idle_hours) : app.auth.idleHours();
      out.session = { expires_at: ctx.user.session_expires, idle_hours: idle, last_seen_at: ctx.user.session_last_seen || ctx.user.session_created || null };
    }
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
  // v9.2 public: رقم المكالمة الذي سيظهر لها («من الرقم ده»): callback_from_number، وإلا تليفون المؤسسة
  function callbackFrom(segment = 'charity') {
    // v11 segment-server (P1): رقم مكالمات الأفراد والشركات ← رقم المكالمات العام ← هاتف الأفراد والشركات/المؤسسة
    const paidOwn = segment === 'paid' ? String(app.settings.get('callback_from_number_paid') || '').trim() : '';
    if (paidOwn) return paidOwn;
    const own = String(app.settings.get('callback_from_number') || '').trim();
    const paidPhone = segment === 'paid' ? String(app.settings.get('org_phone_paid') || '').trim() : '';
    return own || paidPhone || String(app.settings.get('org_phone') || '').trim() || null;
  }
  function callbackEtaDays() {
    const n = Math.round(Number(app.settings.get('callback_eta_days')));
    return Number.isFinite(n) && n >= 1 ? Math.min(5, n) : 1;
  }
  // [R2-B28] «إنتي من أنهي محافظة؟»: أكثر 6 محافظات طلبًا في آخر سنة (التعادل بترتيب القائمة)، تُكمَّل من القائمة الثابتة
  function aboutGovernorates() {
    const since = addDays(nowIso(), -365);
    const rows = db.all('SELECT governorate AS g, COUNT(*) AS n FROM intakes WHERE governorate IS NOT NULL AND created_at >= ? GROUP BY governorate', since);
    const count = new Map(rows.filter((r) => GOVERNORATES.includes(r.g)).map((r) => [r.g, Number(r.n)]));
    const top = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || GOVERNORATES.indexOf(a) - GOVERNORATES.indexOf(b)).slice(0, 6);
    for (const g of QUICK_GOVERNORATES) if (top.length < 6 && !top.includes(g)) top.push(g);
    return [...top, OTHER_GOVERNORATE];
  }
  function v92Fields(current) {
    const fa = parseJson(current?.form_answers, null);
    const callback = fa && CALLBACK_WHEN[fa.callback] ? fa.callback : null;
    return { callback, callback_from: callbackFrom(current?.segment === 'paid' ? 'paid' : 'charity'), callback_eta_days: callbackEtaDays(), about_governorates: aboutGovernorates() };
  }

  function intakeResponse(intake, clientId) {
    const s = app.settings.all();
    const current = db.get('SELECT * FROM intakes WHERE id = ?', intake.id) || intake;
    // v11 segment-server (§5.7): رقم واتساب جانب الطلب ([r2 P4] الأفراد والشركات: رقمهم المُتحقق منه أو الأساسي)؛
    // جملة التأكيد نفسها لا تتغير للجانبين (B91-01)
    const segment = current.segment ?? null;
    const digits = app.segments ? app.segments.publicDigits(segment === 'charity' ? 'charity' : 'paid') : waDigits();
    const extra = { ...v92Fields(current), segment };
    if (!isPortalUnverifiedIntake(current)) {
      // v9.1 fixes: إعادة الإرسال بنفس submission_id بعد تأكيد الرقم (بالكود أو من الإدارة) لا تُصدر رابطًا ولا كودًا جديدًا:
      // الطلب صار قصة صاحبة الرقم، ورابطها يصلها على واتساب. (حامل submission_id أثبت أنه المتصفح الذي أرسل الطلب، لا صاحب الرقم)
      return {
        reference: intake.code,
        portal_url: null,
        confirm_url: null,
        whatsapp_url: null,
        confirmed: true,
        eta_review_days: Math.max(1, Number(s.portal_eta_review_days) || 2),
        ...extra,
      };
    }
    // رابط الموقع «موقع فقط» دائمًا (portal.scopeOf): لا يعرض رسائل واتساب صاحب الرقم ولا يتسع بعد تأكيد الرقم
    const token = app.clients.issuePortalToken(clientId, { intakeId: intake.id });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const fresh = db.get('SELECT source_detail FROM intakes WHERE id = ?', intake.id);
    const sd = parseJson(fresh?.source_detail, {});
    sd.confirm_hash = app.integrations.hmac('intake-confirm', code);
    sd.confirm_expires_at = addDays(nowIso(), 30);
    if (!Number.isInteger(sd.confirm_failures)) sd.confirm_failures = 0;
    db.update('intakes', intake.id, { source_detail: JSON.stringify(sd) });
    const text = `مرحبًا ${app.brand.displayName()}، رقم طلبي ${intake.code} وأريد استكمال طلبي عبر واتساب.`; // v10 experience (CS-25)
    const confirmText = `السلام عليكم، ده رقم طلبي ${intake.code} وكود التأكيد ${code}`;
    return {
      reference: intake.code,
      portal_url: app.clients.portalUrl(token),
      confirm_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(confirmText)}` : null,
      // للتوافق مع الإصدارات السابقة؛ الواجهة تستخدم confirm_url
      whatsapp_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null,
      // «فريقنا هيقرا طلبك — غالبًا خلال يومين شغل» في شاشة «وصلنا طلبك»
      eta_review_days: Math.max(1, Number(s.portal_eta_review_days) || 2),
      // v9.2 public: بطاقة «هنكلمك» و«كمان سؤالين»
      ...extra,
    };
  }

  /**
   * v9.2 public (§3.3): استقبال طلب الموقع. الاسم اختياري؛ الموضوع وإجابات الصور ووقت المكالمة اختيارية.
   * طلب مكالمة بلا حكاية مقبول (body = «عايزة حد يكلمني — الصبح» أو «محتاجين حد يكلمنا — …» بلا اسم).
   * يُستدعى من المسار، ومن بيانات العرض التجريبية (seed-v92-public.js) بنفس القواعد دون حدود المعدل.
   */
  function submitIntake(b, opts = {}) {
    try {
      return submitIntakeInner(b, opts);
    } catch (e) {
      // v11 segment-server [r2 S16]: كل 400/429 برمز ثابت (الرمز الأدق يُضبط عند مصدر الخطأ)
      if (e instanceof ApiError && e.status === 429) e.code = 'rate_limited';
      else if (e instanceof ApiError && e.status === 400 && (!e.code || e.code === 'bad_request')) e.code = 'invalid';
      throw e;
    }
  }
  function submitIntakeInner(b, { limits = true, cookieHeader = null } = {}) {
    if (b.website) return { status: 200, body: { reference: null, ok: true } }; // حقل فخ للبرامج الآلية
    if (b.consent !== true) throw badRequest('لازم توافقي عشان نقدر نساعدك.');
    // v11 segment-server (SS-1): نوع الخدمة segment › كعكة bm_seg › الافتراضي — قيمة غير صالحة لا ترفض الطلب أبدًا
    const seg = app.segments ? app.segments.fromWebsite({ body: b, cookieHeader }) : { segment: 'charity', source: 'website_default', via: 'default' };
    const requester = cleanRequester(b.requester, seg.segment);
    // الاسم اختياري: «سيبيه فاضي» = لا يُرسل أصلًا (النموذج لا يرسله فاضيًا)؛ أما إن أُرسل فحرفان على الأقل
    let name = null;
    if (b.name !== undefined && b.name !== null) {
      const raw = typeof b.name === 'string' ? b.name.trim() : '';
      if (raw.length < 2 || raw.length > 120) throw withCode(badRequest(NAME_MSG, { fields: { name: NAME_MSG } }), 'bad_name');
      name = raw;
    }
    let phone;
    try {
      phone = v.phone(b.phone, 'رقم الموبايل', { required: true, egyptianMobile: true });
    } catch (e) {
      throw withCode(e, 'bad_phone');
    }
    // v9.2: الموضوع (مفتاح أو اسم قديم، وإلا بلا موضوع بصمت) وإجابات الصور (كائن فقط) ووقت المكالمة
    const topic = topicByKey(b.topic);
    if (b.answers !== undefined && b.answers !== null && (typeof b.answers !== 'object' || Array.isArray(b.answers))) throw badRequest('اختيارات غير صالحة.');
    const answers = sanitizeAnswers(topic?.key, b.answers || {});
    const callback = b.callback === undefined || b.callback === null || b.callback === '' ? null : v.oneOf(b.callback, Object.keys(CALLBACK_WHEN), 'الوقت المناسب');
    const entry = ENTRIES.includes(b.entry) ? b.entry : 'direct';
    const consentV = Number.isInteger(b.consent_v) && b.consent_v >= 1 && b.consent_v <= 99 ? b.consent_v : null;
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
    if (prev) return { status: 201, body: intakeResponse(prev.intake, prev.clientId) };
    if (limits) app.limiters.publicIntakePhone.hit(`phone:${phone}`);
    const email = v.email(b.email, 'البريد الإلكتروني');
    const governorate = b.governorate ? v.oneOf(b.governorate, GOVERNORATES, 'المحافظة') : null;
    const codes = LEGAL_AREAS.map((a) => a.code);
    let area = b.legal_area ? v.oneOf(b.legal_area, codes, 'نوع المشكلة') : null;
    if (!area && topic?.area && codes.includes(topic.area)) area = topic.area;
    // v9.1 b-forms: حتى 5 صور/مستندات و3 رسائل صوتية؛ الرسالة الصوتية تغني عن الكتابة،
    // وبدونها يكفي وصف من 10 حروف («جوزي مات ومعاش» مقبول)، أو طلب مكالمة (v9.2)
    const files = b.documents == null ? [] : Array.isArray(b.documents) ? b.documents : badRequestFiles();
    const audioCount = files.filter((f) => app.documents.isAudio(f || {})).length;
    if (files.length - audioCount > MAX_INTAKE_DOCS) throw withCode(badRequest('تقدري تبعتي لحد 5 صور دلوقتي. الباقي ابعتيه بعدين من صفحتك.'), 'too_many_files');
    if (audioCount > MAX_INTAKE_AUDIO) throw withCode(badRequest('تقدري تبعتي لحد 3 رسايل صوتية.'), 'too_many_audio');
    // v9.2: مدة الرسالة الصوتية كما سجّلها المتصفح (0–600 ثانية) تصل لحفظ المستند
    const attachments = files.map((f) => {
      if (!f || typeof f !== 'object') return f;
      const { seconds, ...rest } = f;
      const n = Number(seconds);
      return app.documents.isAudio(f) && seconds !== undefined && seconds !== null && Number.isFinite(n) ? { ...rest, seconds: Math.max(0, Math.min(MAX_AUDIO_SECONDS, n)) } : rest;
    });
    let description = v.str(b.description, 'وصف المشكلة', { max: 10000 }) || '';
    // v11 segment-server (G11-44): طلب عرض الشركات بلا تفاصيل مقبول بنص ثابت لا يُعد من الوقائع
    const companyCanned = !!requester && !audioCount && nonSpace(description) < MIN_DESC_CHARS && !callback;
    if (companyCanned) description = `طلب عرض لخدمات الشركات — ${requester.company_name}`;
    if (!audioCount && nonSpace(description) < MIN_DESC_CHARS && !callback) {
      throw withCode(badRequest('سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.', { fields: { description: 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.' } }), 'too_short');
    }
    // v9.2 (بوابة الدمج K3): كلمتين كتبتهم ثم «مش عارفة تحكي؟ سيبي رقمك» (أقل من 10 حروف بلا صوت) ليسا حكاية:
    // الطلب طلب مكالمة بلا حكاية (الجملة الجاهزة أولًا، ثم كلماتها كما هي للموظفين فقط، خارج الوقائع والتحليل)
    const shortNote = callback && !audioCount && nonSpace(description) < MIN_DESC_CHARS ? description.trim() : '';
    if (callback && !audioCount && nonSpace(description) < MIN_DESC_CHARS) description = '';
    const hasText = nonSpace(description) > 0;
    const story = audioCount && hasText ? 'both' : audioCount ? 'voice' : hasText ? 'text' : 'none';
    const hasStory = story !== 'none';
    const when = callback ? CALLBACK_WHEN[callback].label : '';
    // [S-25] بلا اسم لا نعرف إن كانت هي أو هو: جملة محايدة
    const callbackLine = callback ? `${name ? `${addressForm({ name }) === 'm' ? 'عايز' : 'عايزة'} حد يكلمني — ` : 'محتاجين حد يكلمنا — '}${when}` : '';
    if (!description) description = audioCount ? VOICE_ONLY_TEXT : shortNote ? `${callbackLine}\n${shortNote}` : callbackLine;
    const mode = MODES.includes(b.mode) ? b.mode : 'form';
    // v9 practice: بيانات الأسرة الاختيارية (يذكرها مقدم الطلب ولا يُتحقق منها) تُتحقق قبل إنشاء أي شيء.
    // v9.2: ما يُستنتج من الإجابات (الصفة، عدد الأطفال، السكن) وما ترسله صراحةً يغلب عليه
    const inferred = infer(answers);
    let beneficiary = null;
    // v11 segment-server: لا بيانات أسرة لطلبات الأفراد والشركات (لا بحث اجتماعي ولا أولوية من وضع الأسرة)
    if (app.practice && seg.segment !== 'paid') {
      const explicit = app.practice.beneficiary.validatePublic(b.beneficiary);
      const fromAnswers = {};
      for (const k of ['relation', 'children_count', 'housing']) if (inferred[k] !== undefined) fromAnswers[k] = inferred[k];
      const implied = Object.keys(fromAnswers).length ? app.practice.beneficiary.validatePublic(fromAnswers) : null;
      const merged = { ...(implied || {}), ...(explicit || {}) };
      beneficiary = Object.keys(merged).length ? merged : null;
    }
    const attribution = sourceFromWebAttribution(b.attribution || {});
    attribution.detail = { ...attribution.detail, intake_mode: mode, gate: seg.segment, gate_via: seg.via, ...(requester ? { requester } : {}) };
    const r = app.engine.receive({
      channel: 'website',
      from_phone: phone,
      from_email: email,
      contact_name: name,
      governorate,
      text: description,
      attachments,
      external_id: externalId,
      attribution,
      legal_area_hint: area,
      force_new_intake: true,
      intake_kind: 'consultation',
      topic: topic?.key || null,
      extra_meta: callback ? { callback, callback_canned: !hasStory } : companyCanned ? { company_lead_canned: true } : undefined,
      // v11 segment-server (L11-41): نوع الخدمة ومصدره صراحة عند إنشاء الطلب
      segment: seg.segment,
      segment_source: requester ? 'company_lead' : seg.source,
      requester_kind: requester ? 'company' : null,
    });
    if (r.duplicate) {
      // سباق نادر: نفس الإرسال وصل مرتين في نفس اللحظة
      const again = already();
      if (!again) throw new Error('public intake duplicate without a matching intake');
      return { status: 201, body: intakeResponse(again.intake, again.clientId) };
    }
    // الرابط مقصور على هذا الطلب الجديد وحده: رقم الهاتف في نموذج الموقع غير موثّق،
    // فلا يُصدر رابط أبدًا لطلب لم يُنشئه هذا الإرسال نفسه
    if (!r.created_intake || !r.intake) throw new Error('public intake did not create a new intake');
    // v9.2 (§3.3): اختيارات الصور كما ضغطت عليها (تقرأها الإدارة والتحليل تحت «قد تكون غير دقيقة»)
    const formAnswers = { v: 1, topic: topic?.key || null, answers, callback: callback || null, story, entry, inferred, consent_v: consentV, ...(requester ? { requester } : {}) };
    // v9.2 (بوابة الدمج K1): اسم الطلب = ما كتبه هذا الإرسال وحده. الرقم المكتوب في الموقع غير مثبت، فطلب بلا اسم
    // على رقم عميل موجود لا يرث اسم صاحب الرقم (وإلا عرضته صفحة /p/… والردود الجاهزة لمن كتب الرقم: «أهلًا يا رامي»).
    // الموظفون يرون اسم ملف العميل كما هو (intakes.list: contact_name || client_name).
    db.update('intakes', r.intake.id, { form_answers: JSON.stringify(formAnswers), contact_name: name });
    if (beneficiary) app.practice.beneficiary.savePublic(r.intake, r.client, beneficiary, { createdClient: !!r.created_client });
    if (callback) {
      const form = name ? addressForm({ name }) : null;
      const summary = !name
        ? `طُلبت مكالمة (${when}) من نموذج الموقع`
        : `${form === 'm' ? 'طلب المستفيد' : 'طلبت المستفيدة'} مكالمة (${when}) من نموذج الموقع`;
      app.activity.log({ intake_id: r.intake.id, client_id: r.client.id, actor: { kind: 'client' }, type: 'client.callback', summary, data: { when: callback, source: 'website', story } });
      app.notifications.notifyStaff({
        type: 'client.callback',
        // v11 segment-server (§5.6): طلب الأفراد والشركات يُعلَّم في العنوان (عنوان الخيري كما في 10.0)
        title: `طلب مكالمة (${when}) — الطلب ${r.intake.code}${seg.segment === 'paid' && app.segments ? ` · ${app.segments.label('paid')}` : ''}`,
        body: hasStory
          ? 'اتصلوا على رقمها المسجل في الطلب، والمكالمة نفسها فرصة لتأكيد هويتها.'
          : 'طلب جديد من الموقع بدون حكاية. اتصلوا عليها واسمعوا مشكلتها، ثم سجّلوا ما قالته من «تسجيل المكالمة» في صفحة الطلب.',
        link: `#/inbox/${r.intake.id}`,
      });
    }
    if (requester) {
      // v11 segment-server (§5.6): تنبيه «طلب عرض من شركة» (بجانب «طلب وارد جديد»)
      app.notifications.notifyStaff({
        type: 'intake.company_lead',
        title: `طلب عرض من شركة: ${requester.company_name} — ${r.intake.code}`,
        body: requester.needs?.length ? requester.needs.map((k) => LABELS.requester_needs[k]).join('، ') : null,
        link: `#/inbox/${r.intake.id}`,
      });
    }
    return { status: 201, body: intakeResponse(r.intake, r.client.id) };
  }
  // بيانات العرض التجريبية تمر بنفس القواعد (seed-v92-public.js)
  app.publicIntake = (body, o = {}) => submitIntake(body || {}, { limits: false, ...o });

  router.post(
    '/api/public/intake',
    (ctx) => {
      try {
        app.limiters.publicIntake.hit(`intake:${ctx.ip}`);
      } catch (e) {
        throw withCode(e, 'rate_limited'); // v11 segment-server [r2 S16]
      }
      const out = submitIntake(ctx.body || {}, { limits: true, cookieHeader: ctx.req.headers.cookie || null });
      if (out.status !== 200) ctx.status = out.status;
      return out.body;
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
  // v9.2 public: «كمان سؤالين — لو تحبي» بعد الإرسال (المحافظة والصفة). روابط الطلب الواحد فقط (رابط شاشة النجاح)
  router.post('/api/portal/:token/about', (ctx) => {
    const { client, intakeId, phone } = portalAccess(ctx);
    app.limiters.portal.hit(`portal:${client.id}`);
    return app.portal.about(client, intakeId, ctx.body || {}, { phone });
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
