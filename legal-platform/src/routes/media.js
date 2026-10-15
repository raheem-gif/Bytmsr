// v12 media — مسارات المستندات والصوت (spec §2.1). كل مسار: فحص الدور على الخادم أولًا ثم سجل الأمان.
// كعكة بوابة الشركات وحدها لا تصل إلى أي مسار هنا (لا مستخدم ← 401)، والمحامي 403 (لا مسار للمحامين في 12.0، L12-17).
//
//   POST /api/admin/documents/:id/clean            S  نسخة محسّنة من المتصفح (60 في الساعة لكل موظف، ≤ 20 ميجابايت)   MD-5
//   PUT  /api/admin/documents/:id/display          S  { show: 'clean' | 'original' } ينقل المؤشر فقط ولا يحذف       MD-5
//   GET  /api/admin/documents/:id/files            S  سطر معلومات النسخ (sha256، المصدر، المعاملات) للفريق          MD-5
//   POST /api/admin/documents/:id/rescan           S  إعادة التنظيف والقراءة                                         MD-9/10
//   GET  /api/admin/documents/:id/text             S  النص المقروء آليًا (للفريق فقط)                                MD-10
//   PUT  /api/admin/documents/:id/text/:page       S  تصحيح النص (P1)                                               MD-10
//   POST /api/admin/documents/:id/ocr              S  { provider?: 'tesseract' | 'claude' }                          MD-10
//   POST /api/admin/voice-notes/:documentId/auto   S  «حوّل الآن»                                                    MD-6
//   GET  /api/admin/media/status                   A  الأدوات والطابور (P1)                                          MD-11
//   POST /api/admin/media/backfill                 A  الاستكمال (P1، 5 في اليوم)                                     MD-11
//   POST /api/admin/integrations/stt/test          A  اختبار اتصال تحويل الصوت → { ok, status, code, latency_ms }    MD-6
//      (يُسجَّل قبل مسارات system.js فيسبق المسار العام /api/admin/integrations/:name/test لهذا التكامل وحده)
//
// كل مسار يتحقق من الدور أولًا ثم يكتب سجل الأمان (المسارات كلها مبنية منذ MD-11).
import { requireStaff, requireAdmin, RateLimiter } from '../auth.js';
import { ApiError, nowIso } from '../util.js';
import { sttReason } from '../ai/stt.js';

/** نتيجة «اختبار الاتصال» لتحويل الصوت بالعربية (الرمز فقط يُعاد للواجهة، L12-71) */
export const STT_TEST_CODES = { ok: 'نجح', off: 'التحويل متوقف', not_configured: 'الإعدادات ناقصة', no_clip: 'مقطع الاختبار غير موجود' };

/** حد جسم «نظّف المستند»: ملف ≤ 20 ميجابايت بعد فك base64 + المعاملات */
export const CLEAN_BODY_LIMIT = 28 * 1024 * 1024;

export function registerMediaRoutes(router, app) {
  const S = (fn) => (ctx) => fn(ctx, requireStaff(ctx));
  const A = (fn) => (ctx) => fn(ctx, requireAdmin(ctx));
  // جسم كبير: الدور يُفحص قبل قراءة الجسم (gate)، فلا يُقرأ 28 ميجابايت من زائر بلا جلسة
  const staffGate = (ctx) => {
    requireStaff(ctx);
    return null;
  };

  const docId = (ctx) => {
    const n = Number(ctx.params.id);
    if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'المستند غير موجود', 'not_found');
    return n;
  };
  // 60 تنظيفًا في الساعة لكل موظف (§2.1)
  const cleanLimit = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });

  router.post(
    '/api/admin/documents/:id/clean',
    S((ctx, u) => {
      cleanLimit.hit(`clean:${u.id}`);
      return app.media.cleanDocument(docId(ctx), ctx.body, u, ctx);
    }),
    { limit: CLEAN_BODY_LIMIT, gate: staffGate },
  );
  router.put('/api/admin/documents/:id/display', S((ctx, u) => app.media.setDisplay(docId(ctx), ctx.body?.show, u, ctx)));
  router.get('/api/admin/documents/:id/files', S((ctx, u) => app.media.fileInfo(docId(ctx), u, ctx)));
  // MD-9/MD-10: إعادة المعالجة (60 في الساعة)، النص المقروء (للفريق فقط، L12-17)، تصحيحه (P1)، والقراءة الآن (30 في الساعة)
  const rescanLimit = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
  const ocrLimit = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 30 });
  router.post(
    '/api/admin/documents/:id/rescan',
    S((ctx, u) => {
      rescanLimit.hit(`rescan:${u.id}`);
      return app.media.rescan(docId(ctx), u, ctx);
    }),
  );
  router.get('/api/admin/documents/:id/text', S((ctx, u) => app.media.textOf(docId(ctx), u, ctx)));
  router.put('/api/admin/documents/:id/text/:page', S((ctx, u) => app.media.correctText(docId(ctx), ctx.params.page, ctx.body, u, ctx)));
  router.post(
    '/api/admin/documents/:id/ocr',
    S((ctx, u) => {
      ocrLimit.hit(`ocr:${u.id}`);
      return app.media.requestOcr(docId(ctx), ctx.body, u, ctx);
    }),
  );
  // «حوّل الآن» (MD-6/MD-8): مهمة بأولوية الفريق (تتجاوز حد الشخص اليومي، وتلتزم بقيد «خيري» وتاريخ الإعلان)
  const autoLimit = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
  router.post(
    '/api/admin/voice-notes/:documentId/auto',
    S((ctx, u) => {
      autoLimit.hit(`stt:${u.id}`);
      const id = Number(ctx.params.documentId);
      const d = Number.isInteger(id) && id > 0 ? app.documents.get(id) : null;
      if (!d || d.uploaded_by_kind !== 'client' || !/^audio\//.test(String(d.mime || ''))) throw new ApiError(404, 'الرسالة الصوتية غير موجودة', 'not_found');
      if (!app.stt.configured()) throw new ApiError(409, 'تحويل الرسائل الصوتية إلى نص غير مضبوط. اضبطه من «التكاملات».', 'stt_off');
      const pol = app.stt.policy(d, { manual: true });
      if (pol.reason && ['charity', 'before_disclosure', 'mime', 'too_big', 'too_long'].includes(pol.reason)) {
        app.stt.saveDraft(d.id, { state: 'skipped', provider: app.stt.settings().provider, error: pol.reason, seconds: pol.seconds ?? null });
        throw new ApiError(409, sttReason(pol.reason), `stt_${pol.reason}`);
      }
      const jobId = app.media.enqueue('stt', d.id, { priority: 10, requestedBy: u.id });
      app.audit.log({ actor: u, ctx, type: 'voice.auto_requested', summary: `طلب تحويل الرسالة الصوتية رقم ${d.id} إلى نص الآن`, data: { document_id: d.id, job_id: jobId } });
      return { queued: jobId !== null, running: jobId === null, job_id: jobId };
    }),
  );
  // MD-11 (P1): حالة الأدوات والطابور (?probe=1 يعيد فحص الأدوات)، والاستكمال (5 في اليوم لكل مدير)
  router.get('/api/admin/media/status', A((ctx, u) => app.media.statusFor(u, ctx, { probe: ctx.query?.probe === '1' })));
  const backfillLimit = new RateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 5 });
  router.post(
    '/api/admin/media/backfill',
    A((ctx, u) => {
      backfillLimit.hit(`backfill:${u.id}`);
      return app.media.backfill(ctx.body, u, ctx);
    }),
  );
  // اختبار الاتصال (MD-6، L12-71): مقطع صامت مرفق ← { ok, status, code, latency_ms } فقط، يُحفظ كآخر اختبار ويُسجَّل
  let sttTesting = false;
  router.post(
    '/api/admin/integrations/stt/test',
    A(async (ctx, u) => {
      if (sttTesting) throw new ApiError(409, 'يجري اختبار هذا التكامل الآن، انتظر النتيجة', 'conflict');
      sttTesting = true;
      let r;
      try {
        r = await app.stt.test();
      } finally {
        sttTesting = false;
      }
      const message = r.ok ? `نجح الاتصال (${r.latency_ms} مللي ثانية)` : `فشل الاتصال: ${STT_TEST_CODES[r.code] || sttReason(r.code)}`;
      try {
        app.db.insert('integration_tests', { name: 'stt', ok: r.ok ? 1 : 0, message, details: JSON.stringify({ status: r.status, code: r.code }), duration_ms: r.latency_ms, tested_by: u.id, tested_at: nowIso() });
      } catch (e) {
        app.log('stt test record failed', e);
      }
      app.audit.log({ actor: u, ctx, type: 'integration.tested', severity: r.ok ? 'info' : 'warning', summary: `اختبار اتصال تحويل الرسائل الصوتية إلى نص: ${r.ok ? 'ناجح' : 'فاشل'}`, data: { name: 'stt', ok: r.ok, code: r.code, status: r.status, duration_ms: r.latency_ms } });
      return { ok: r.ok, status: r.status, code: r.code, latency_ms: r.latency_ms };
    }),
  );
  void app;
}
