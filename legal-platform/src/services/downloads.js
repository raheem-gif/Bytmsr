// روابط تنزيل لمرة واحدة للملفات الحساسة: تصدير بيانات المستفيدين CSV، النسخ الاحتياطية، التصدير الكامل
// (مع مفتاح التشفير اختياريًا)، تصدير سجل الأمان، وتصدير تقرير الأثر.
//
// لماذا: طلب GET بكعكة الجلسة وحدها لا يكفي لهذه الملفات. أي موقع آخر يستطيع فتح رابط GET في متصفح مدير النظام
// (تنقل علوي؛ الكعكة SameSite=Lax تُرسل معه) فيُنزَّل ملف ببيانات شخصية أو بمفتاح التشفير إلى جهازه، ويُحجز قفل التصدير،
// وتُسجَّل أحداث «حرجة» في سجل الأمان باسمه دون علمه.
//
// الحل:
//   1) POST على مسار التنزيل (JSON فقط مع فحص Origin في src/app.js، فلا يستطيع موقع آخر إرساله) يتحقق من الصلاحية
//      والمعاملات ويعيد { url, filename, expires_at } برمز عشوائي.
//   2) GET /api/download?token=… يقبل الرمز مرة واحدة فقط، خلال 60 ثانية، لنفس المستخدم ونفس الجلسة، ويعيد فحص الصلاحية
//      قبل إرسال الملف. المعاملات (اسم الملف، الفلاتر، تضمين المفتاح) محفوظة مع الرمز ولا تُقرأ من رابط GET.
// الرموز في الذاكرة فقط (تُجزَّأ قبل التخزين) وتسقط بإعادة تشغيل الخادم؛ هذا مقصود لرابط عمره دقيقة.
import { ApiError, now, randomToken, sha256 } from '../util.js';

export const DOWNLOAD_TTL_SECONDS = 60;
const MAX_PENDING = 1000;
export const DOWNLOAD_PATH = '/api/download';

const invalidLink = () =>
  new ApiError(403, 'رابط التنزيل غير صالح أو انتهت صلاحيته (يصلح مرة واحدة خلال دقيقة من الجلسة نفسها). اضغط زر التنزيل في المنصة مرة أخرى.', 'download_link_invalid');

export function createDownloads(app) {
  /** sha256(token) → { kind, userId, session, params, filename, expires } */
  const pending = new Map();
  /** kind → { guard, send } */
  const kinds = new Map();

  function sweep() {
    const t = now().getTime();
    for (const [k, rec] of pending) if (rec.expires <= t) pending.delete(k);
    // حد أعلى للذاكرة: يُحذف الأقدم أولًا (ترتيب الإدراج)
    while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
  }

  const svc = {
    ttlSeconds: DOWNLOAD_TTL_SECONDS,

    /** عدد الروابط المعلقة (للاختبارات) */
    pendingCount() {
      sweep();
      return pending.size;
    },

    /** يصدر رابط تنزيل لمرة واحدة مربوطًا بالمستخدم وجلسته الحالية */
    issue(user, kind, params = {}, { filename = null } = {}) {
      if (!kinds.has(kind)) throw new Error(`unknown download kind: ${kind}`);
      if (!user?.id || !user.session_token_hash) throw invalidLink();
      sweep();
      const token = randomToken(24);
      const expires = now().getTime() + DOWNLOAD_TTL_SECONDS * 1000;
      pending.set(sha256(token), { kind, userId: user.id, session: user.session_token_hash, params, filename, expires });
      return {
        url: `${DOWNLOAD_PATH}?token=${encodeURIComponent(token)}`,
        filename,
        expires_in: DOWNLOAD_TTL_SECONDS,
        expires_at: new Date(expires).toISOString(),
      };
    },

    /**
     * يسجل تنزيلًا حساسًا على المسار path:
     *   POST path → guard(ctx) ثم prepare(ctx, user) (تحقق ورمي الأخطاء قبل إصدار الرابط) ← { url, filename, expires_at }
     *   GET /api/download?token=… → guard(ctx) من جديد ثم send(ctx, user, params)
     * @param {object} spec { guard(ctx) → user, prepare?(ctx, user) → { params, filename }, send(ctx, user, params) }
     */
    route(router, path, { guard, prepare = () => ({}), send }) {
      const kind = `POST ${path}`;
      kinds.set(kind, { guard, send });
      router.post(path, async (ctx) => {
        const user = guard(ctx);
        const { params = {}, filename = null } = (await prepare(ctx, user)) || {};
        return svc.issue(user, kind, params, { filename });
      });
    },

    /** معالج GET /api/download */
    async consume(ctx) {
      const token = typeof ctx.query.token === 'string' ? ctx.query.token : '';
      if (!token || token.length > 200) throw invalidLink();
      const key = sha256(token);
      const rec = pending.get(key);
      if (!rec) throw invalidLink();
      if (rec.expires <= now().getTime()) {
        pending.delete(key);
        throw invalidLink();
      }
      // الرمز لا يصلح إلا لمن طلبه وفي الجلسة نفسها؛ محاولة من جلسة أخرى لا تستهلكه
      const u = ctx.user;
      if (!u || u.id !== rec.userId || u.session_token_hash !== rec.session) throw invalidLink();
      pending.delete(key);
      const spec = kinds.get(rec.kind);
      const user = spec.guard(ctx);
      ctx.res.setHeader('Referrer-Policy', 'no-referrer');
      ctx.res.setHeader('X-Robots-Tag', 'noindex');
      await spec.send(ctx, user, rec.params);
      ctx.streamed = true;
    },

    /** يربط مسار GET الموحد */
    mount(router) {
      router.get(DOWNLOAD_PATH, (ctx) => svc.consume(ctx));
    },
  };
  return svc;
}
