// v12 media — خدمة المستندات والصوت (app.media): طابور المعالجة (تحويل الصوت إلى نص، تنظيف الصور، قراءة النص)،
// التحقق من بيانات ماسح المستندات قبل أي كتابة، تنظيف الملفات اليتيمة، إعدادات «المستندات والصوت»، وما تعرضه صفحات
// الخصوصية والصحة والبحث.
//
// قواعد ثابتة (spec §2، L12-17، L12-18، L12-66…L12-70):
// • النص الآلي (صوت أو مستند) للفريق فقط؛ لا يصل لمحامٍ ولا عميل ولا شركة ولا واتساب.
// • الطابور خارج قفل المجدول: مهمة media.process تستدعي kick() فقط، والحلقة لها قفلها؛ وحدة واحدة في المرة
//   (تحويل صوت واحد، صفحة OCR واحدة، تنظيف صورة واحدة)، والنتيجة تُكتب WHERE id = ? AND gen = ?.
// • تحت node --test لا يعمل kick() (الاختبارات تستدعي processDue)، والأدوات متوقفة إلا بـ MEDIA_TOOLS=on أو *_BIN.
// • البذور لا تضيف مهام أبدًا: تكتب المسودات والنسخ والنصوص مباشرة.
//
// MD-0: العقد والهيكل. المعالِجات (stt / clean / ocr) تُسجَّل في MD-6 / MD-9 / MD-10؛ قبلها تبقى المهام في الانتظار.
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound, nowIso, v, ApiError } from '../util.js';
import { createMediaTools, toolsMode } from '../media-tools.js';

export const JOB_KINDS = ['stt', 'clean', 'ocr'];
const KIND_ORDER = "CASE kind WHEN 'stt' THEN 0 WHEN 'clean' THEN 1 ELSE 2 END";
/** محاولات الوحدة القابلة للإعادة: بعد 1 ثم 5 ثم 30 دقيقة، ثم «تعذّر» */
export const RETRY_MINUTES = [1, 5, 30];
export const MAX_ATTEMPTS = 4;
/** وحدة بقيت running أكثر من هذا (في العملية نفسها) تُعاد إلى الانتظار */
export const STALE_MINUTES = 15;
/** أقل مساحة حرة على قرص البيانات قبل رفض الرفع (H-M13) */
export const DISK_LOW_BYTES = 500 * 1024 * 1024;

/** حدود الماسح لكل سطح (L12-58): الصفحات، الأصول لكل صفحة، وحجم الأصول المفكوكة في الطلب الواحد */
export const SCAN_CAPS = {
  intake: { pages: 12, originalsBytes: 15 * 1024 * 1024 },
  portal: { pages: 12, originalsBytes: 15 * 1024 * 1024 },
  company: { pages: 12, originalsBytes: 6 * 1024 * 1024 },
  staff: { pages: 20, originalsBytes: 30 * 1024 * 1024 },
};
export const ORIGINALS_PER_PAGE = 2;
export const SCAN_PARAMS_MAX = 2048;
export const SCAN_MODES = ['auto', 'color', 'gray', 'bw'];
const ORIGINAL_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** الإعدادات التي يضبطها الخادم وحده (ترفضها PATCH /api/admin/settings) */
export const SERVER_SET_KEYS = ['stt_third_party_since', 'ocr_claude_since'];
const BOOL_KEYS = ['web_voice_enabled', 'stt_auto', 'stt_charity_third_party', 'scan_client_enabled', 'scan_server_auto', 'ocr_claude_allowed', 'ocr_claude_companies'];
const INT_KEYS = {
  stt_minutes_per_client_day: ['أقصى دقائق تحويل لكل شخص في اليوم', 1, 240],
  ocr_claude_budget_pct: ['نسبة ميزانية الذكاء الاصطناعي المتاحة لقراءة المستندات (%)', 0, 100],
  ocr_max_pages: ['أقصى عدد صفحات تُقرأ من المستند', 1, 30],
};
export const OCR_PROVIDERS = ['auto', 'tesseract', 'claude', 'off'];
const OCR_MODEL_RE = /^claude-[a-z0-9-]{3,40}$/;

const scanError = (msg, field = 'scan') => new ApiError(400, msg, 'bad_scan', { fields: { [field]: msg } });
const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** طول البيانات المفكوكة من base64 (دون فكها) */
export function base64Bytes(b64) {
  const s = String(b64 || '');
  const body = s.startsWith('data:') && s.includes(',') ? s.slice(s.indexOf(',') + 1) : s;
  const len = body.replace(/\s+/g, '').length;
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((len * 3) / 4) - pad);
}

function normQuad(q) {
  if (!Array.isArray(q) || q.length !== 4) return null;
  const out = [];
  for (const p of q) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    out.push([Math.round(clamp01(x) * 10000) / 10000, Math.round(clamp01(y) * 10000) / 10000]);
  }
  return out;
}

/** «نظّف المستند»: أقصى حجم للنسخة المرسلة من المتصفح (≤ 20 ميجابايت، §2.1) */
export const CLEAN_MAX_BYTES = 20 * 1024 * 1024;
/** مصدر كل نسخة كما يظهر في سطر معلومات المستند للفريق */
export const FILE_SOURCE_LABELS = { client_scanner: 'ماسح هاتف المرسل', staff_scanner: 'ماسح المنصة', server_auto: 'تنظيف تلقائي على الخادم' };
const CLEANABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CLEAN_OUT = new Set(['image/jpeg', 'image/png']);

/** معاملات الماسح (بلا الأصول): البنية والحدود فقط، والأرقام مقيدة (§5.4). maxPages = حد السطح. */
function normalizeParams(rest, maxPages) {
  let paramsLen;
  try {
    paramsLen = JSON.stringify(rest ?? {}).length;
  } catch {
    throw scanError('بيانات تحسين الصورة غير صالحة');
  }
  if (!isPlainObject(rest)) throw scanError('بيانات تحسين الصورة غير صالحة');
  if (paramsLen > SCAN_PARAMS_MAX) throw scanError('بيانات تحسين الصورة أطول من المسموح');
  if (rest.v !== undefined && Number(rest.v) !== 1) throw scanError('إصدار بيانات تحسين الصورة غير مدعوم');
  const pages = rest.pages === undefined ? 1 : Number(rest.pages);
  if (!Number.isInteger(pages) || pages < 1) throw scanError('عدد الصفحات غير صالح');
  if (pages > maxPages) throw scanError(`الحد الأقصى ${maxPages} صفحة في المستند الواحد`);
  const mode = rest.mode === undefined ? 'auto' : String(rest.mode);
  if (!SCAN_MODES.includes(mode)) throw scanError('وضع تحسين الصورة غير معروف');
  const turns = rest.turns === undefined ? 0 : Number(rest.turns);
  if (!Number.isInteger(turns) || turns < 0 || turns > 3) throw scanError('دوران الصفحة غير صالح');
  const score = rest.score === undefined || rest.score === null ? null : Number(rest.score);
  if (score !== null && !Number.isFinite(score)) throw scanError('درجة الثقة غير صالحة');
  let quads = null;
  if (rest.quad !== undefined && rest.quad !== null) {
    const single = normQuad(rest.quad);
    if (single) quads = [single];
    else if (Array.isArray(rest.quad) && rest.quad.length <= pages) {
      quads = rest.quad.map(normQuad);
      if (quads.some((q) => !q)) throw scanError('حدود الصفحة غير صالحة');
    } else throw scanError('حدود الصفحة غير صالحة');
  }
  return {
    v: 1,
    algo: String(rest.algo || 'scan-core@1').slice(0, 40),
    mode,
    turns,
    pages,
    quads,
    score: score === null ? null : Math.round(clamp01(score) * 1000) / 1000,
    partial: rest.partial === true,
    adjusted: rest.adjusted === true,
  };
}

export function createMedia(app) {
  const { db, config } = app;
  const uploadsDir = config.uploadsDir;
  const variantsDir = path.join(uploadsDir, 'variants');
  const tmpDir = path.join(config.dataDir || path.dirname(config.dbPath), 'tmp', 'media');
  const tools = createMediaTools({ tmpDir, log: app.log });

  // مجلد مؤقت خاص (0700، خارج uploadsDir) يُفرَّغ عند كل إقلاع: بقايا تشغيل انقطع لا تبقى
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  } catch (e) {
    app.log('media: temp dir unavailable', e);
  }

  // البحث في نص المستندات: FTS5 بمقسّم trigram إن توفر، وإلا LIKE (L12-37)
  let ftsOk = false;
  try {
    db.raw.exec("CREATE VIRTUAL TABLE IF NOT EXISTS document_text_fts USING fts5(norm, document_id UNINDEXED, page UNINDEXED, tokenize='trigram')");
    ftsOk = true;
    const nFts = Number(db.value('SELECT COUNT(*) FROM document_text_fts')) || 0;
    const nText = Number(db.value('SELECT COUNT(*) FROM document_text')) || 0;
    if (!nFts && nText) db.raw.exec('INSERT INTO document_text_fts (norm, document_id, page) SELECT norm, document_id, page FROM document_text');
  } catch (e) {
    ftsOk = false;
    app.log('media: FTS5 trigram unavailable, document search uses LIKE', e);
  }

  // وحدة وُجدت running عند الإقلاع = انقطاع أثناء التشغيل: crashes+1، ومرتان = «تعذّر» (crashed) (L12-69)
  try {
    const t = nowIso();
    db.run(
      `UPDATE media_jobs SET crashes = crashes + 1, gen = gen + 1, locked_at = NULL, updated_at = ?,
         state = CASE WHEN crashes + 1 >= 2 THEN 'failed' ELSE 'queued' END,
         error = CASE WHEN crashes + 1 >= 2 THEN 'crashed' ELSE error END,
         next_at = CASE WHEN crashes + 1 >= 2 THEN next_at ELSE ? END
       WHERE state = 'running'`,
      t,
      t,
    );
  } catch (e) {
    app.log('media: boot recovery failed', e);
  }

  // ───────── الطابور ─────────
  const handlers = new Map(); // kind → async (job, ctx) → { state: 'done'|'skipped'|'failed'|'retry'|'next', error?, provider?, next_page? }
  let loop = null;
  let stopping = false;
  let followUp = null;
  let snapshot = null; // قيم الإعدادات قبل PATCH (validateSettings ← afterSettings)
  let diskProbe = null;
  let diskCache = { at: 0, free: null };

  const testContext = () => !!process.env.NODE_TEST_CONTEXT;

  function registeredKinds() {
    return JOB_KINDS.filter((k) => handlers.has(k));
  }

  function nextDue() {
    const kinds = registeredKinds();
    if (!kinds.length) return null;
    return db.get(
      `SELECT * FROM media_jobs WHERE state = 'queued' AND next_at <= ? AND kind IN (${kinds.map(() => '?').join(',')})
       ORDER BY priority DESC, ${KIND_ORDER}, next_at, id LIMIT 1`,
      nowIso(),
      ...kinds,
    );
  }

  function claim(job) {
    const t = nowIso();
    const r = db.run("UPDATE media_jobs SET state = 'running', attempts = attempts + 1, locked_at = ?, updated_at = ? WHERE id = ? AND state = 'queued'", t, t, job.id);
    return r.changes === 1 ? db.get('SELECT * FROM media_jobs WHERE id = ?', job.id) : null;
  }

  function requeueStale() {
    const cutoff = new Date(Date.parse(nowIso()) - STALE_MINUTES * 60000).toISOString();
    db.run("UPDATE media_jobs SET state = 'queued', gen = gen + 1, locked_at = NULL, updated_at = ? WHERE state = 'running' AND locked_at < ?", nowIso(), cutoff);
  }

  /** كتابة نتيجة وحدة (تُهمل إن تغيّر gen: أُعيدت جدولتها أثناء التشغيل) */
  function finish(job, res) {
    const t = nowIso();
    const state = res?.state || 'failed';
    const error = res?.error ? String(res.error).slice(0, 200) : null;
    if (state === 'next') {
      return db.run("UPDATE media_jobs SET state = 'queued', locked_at = NULL, next_page = ?, next_at = ?, provider = COALESCE(?, provider), updated_at = ? WHERE id = ? AND gen = ?", res.next_page ?? null, t, res.provider ?? null, t, job.id, job.gen).changes;
    }
    if (state === 'retry') {
      if (job.attempts >= MAX_ATTEMPTS) {
        return db.run("UPDATE media_jobs SET state = 'failed', locked_at = NULL, error = ?, updated_at = ? WHERE id = ? AND gen = ?", error, t, job.id, job.gen).changes;
      }
      const wait = RETRY_MINUTES[Math.min(RETRY_MINUTES.length - 1, Math.max(0, job.attempts - 1))];
      const at = new Date(Date.parse(t) + wait * 60000).toISOString();
      return db.run("UPDATE media_jobs SET state = 'queued', locked_at = NULL, error = ?, next_at = ?, updated_at = ? WHERE id = ? AND gen = ?", error, at, t, job.id, job.gen).changes;
    }
    const final = ['done', 'skipped', 'failed', 'cancelled'].includes(state) ? state : 'failed';
    return db.run('UPDATE media_jobs SET state = ?, locked_at = NULL, error = ?, provider = COALESCE(?, provider), updated_at = ? WHERE id = ? AND gen = ?', final, error, res?.provider ?? null, t, job.id, job.gen).changes;
  }

  async function runUnit(job) {
    const fn = handlers.get(job.kind);
    let res;
    try {
      res = await fn(job, { tools, app });
    } catch (e) {
      if (stopping) {
        // إغلاق التطبيق قتل العملية: تعود الوحدة إلى الانتظار دون احتساب المحاولة
        db.run("UPDATE media_jobs SET state = 'queued', attempts = MAX(0, attempts - 1), gen = gen + 1, locked_at = NULL, updated_at = ? WHERE id = ? AND gen = ?", nowIso(), job.id, job.gen);
        return;
      }
      app.log(`media job ${job.kind} #${job.id} failed`, e);
      res = { state: e?.retryable ? 'retry' : 'failed', error: e?.code || 'error' };
    }
    finish(job, res);
  }

  function scheduleFollowUp() {
    if (stopping || testContext() || followUp) return;
    const kinds = registeredKinds();
    if (!kinds.length) return;
    const next = db.value(`SELECT MIN(next_at) FROM media_jobs WHERE state = 'queued' AND kind IN (${kinds.map(() => '?').join(',')})`, ...kinds);
    if (!next) return;
    const wait = Math.min(5 * 60000, Math.max(1000, Date.parse(next) - Date.now()));
    followUp = setTimeout(() => {
      followUp = null;
      svc.kick();
    }, wait);
    followUp.unref?.();
  }

  // ───────── الخدمة ─────────
  const svc = {
    tools,
    JOB_KINDS,
    SCAN_CAPS,

    /** حالة FTS (للاختبارات والصحة) */
    ftsAvailable() {
      return ftsOk;
    },

    /** تسجيل معالج نوع من الوحدات (MD-6 stt، MD-9 clean، MD-10 ocr) */
    registerHandler(kind, fn) {
      if (!JOB_KINDS.includes(kind)) throw new Error(`unknown media job kind ${kind}`);
      handlers.set(kind, fn);
    },

    /**
     * إضافة مهمة أو إعادتها إلى الانتظار (فريدة لكل نوع ومستند). لا تُستدعى من البذور.
     * → رقم المهمة، أو null إن كانت تعمل الآن.
     */
    enqueue(kind, documentId, { priority = 0, requestedBy = null, nextAt = null, provider = null, nextPage = null } = {}) {
      if (!JOB_KINDS.includes(kind)) throw new Error(`unknown media job kind ${kind}`);
      const id = Number(documentId);
      if (!Number.isInteger(id) || id <= 0) throw new Error('bad document id');
      const t = nowIso();
      const r = db.run(
        `INSERT INTO media_jobs (kind, document_id, state, priority, attempts, crashes, gen, next_page, next_at, provider, requested_by, created_at, updated_at)
         VALUES (?, ?, 'queued', ?, 0, 0, 0, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind, document_id) DO UPDATE SET state = 'queued', priority = MAX(media_jobs.priority, excluded.priority), attempts = 0, crashes = 0,
           gen = media_jobs.gen + 1, next_page = excluded.next_page, next_at = excluded.next_at, provider = excluded.provider, error = NULL,
           requested_by = excluded.requested_by, locked_at = NULL, updated_at = excluded.updated_at
         WHERE media_jobs.state != 'running'`,
        kind,
        id,
        Number(priority) || 0,
        nextPage,
        nextAt || t,
        provider,
        requestedBy,
        t,
        t,
      );
      if (!r.changes) return null;
      svc.kick();
      return Number(db.value('SELECT id FROM media_jobs WHERE kind = ? AND document_id = ?', kind, id)) || null;
    },

    /** تشغيل الحلقة قريبًا (بعد إضافة مهمة أو إجراء من الفريق). لا يعمل تحت node --test. */
    kick() {
      if (stopping || testContext()) return false;
      setImmediate(() => {
        svc.processDue({ budgetMs: 15_000 }).catch((e) => app.log('media: processDue failed', e));
      });
      return true;
    },

    /**
     * تشغيل الوحدات المستحقة واحدة واحدة حتى تنتهي أو تنقضي المدة. استدعاءان متزامنان يشتركان في الحلقة نفسها.
     * → { ran }
     */
    async processDue({ budgetMs = 20_000 } = {}) {
      if (loop) return loop;
      loop = (async () => {
        const started = Date.now();
        let ran = 0;
        requeueStale();
        while (!stopping && Date.now() - started < budgetMs) {
          const due = nextDue();
          if (!due) break;
          const job = claim(due);
          if (!job) continue;
          ran += 1;
          await runUnit(job);
        }
        return { ran };
      })();
      try {
        return await loop;
      } finally {
        loop = null;
        scheduleFollowUp();
      }
    },

    /** حالة الأدوات والطابور (صفحة «صحة النظام»، P1) */
    status() {
      const queue = db.all('SELECT kind, state, COUNT(*) AS n FROM media_jobs GROUP BY kind, state ORDER BY kind, state').map((r) => ({ kind: r.kind, state: r.state, n: Number(r.n) }));
      const lastErrors = db.all("SELECT id, kind, document_id, error, updated_at FROM media_jobs WHERE state IN ('failed', 'skipped') AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 10");
      return {
        mode: toolsMode(),
        tools: tools.status(),
        queue,
        last_errors: lastErrors,
        stt: { configured: !!app.stt?.configured?.(), third_party: !!app.stt?.isThirdParty?.(), budget: app.stt?.budgetState?.() || null, since: app.settings.get('stt_third_party_since') || null },
        fts: ftsOk,
        disk_low: svc.diskLow(),
      };
    },

    /**
     * التحقق من كتلة scan في مرفق (§5.8): بنية وحدود فقط، قبل أي كتابة. → { params, originals } أو null (لا scan).
     * يُكمل MD-4 الفحص الكامل في checkAttachments (فك base64، بصمة الملف، الأبعاد من الترويسة).
     */
    checkScan(scan, { surface = 'intake' } = {}) {
      if (scan === undefined || scan === null) return null;
      if (!isPlainObject(scan)) throw scanError('بيانات تحسين الصورة غير صالحة');
      const cap = SCAN_CAPS[surface] || SCAN_CAPS.intake;
      const { originals, ...rest } = scan;
      const params = normalizeParams(rest, cap.pages);
      const pages = params.pages;
      if (!Array.isArray(originals) || !originals.length) throw scanError('الصورة الأصلية مطلوبة مع النسخة المحسّنة');
      if (originals.length > pages * ORIGINALS_PER_PAGE) throw scanError(`الحد الأقصى ${ORIGINALS_PER_PAGE} صورة أصلية لكل صفحة`);
      const outOriginals = originals.map((o) => {
        if (!isPlainObject(o) || typeof o.data_base64 !== 'string' || !o.data_base64) throw scanError('صورة أصلية غير صالحة');
        const mime = String(o.mime || '').split(';')[0].trim().toLowerCase();
        if (!ORIGINAL_MIMES.has(mime)) throw scanError('الصورة الأصلية يجب أن تكون JPG أو PNG أو WebP');
        return { filename: String(o.filename || 'الأصل.jpg').slice(0, 150), mime, data_base64: o.data_base64 };
      });
      return { params, originals: outOriginals };
    },

    /**
     * التحقق من مرفقات طلب كامل قبل أي كتابة (L12-70): كل ملف رئيسي وكل أصل يُفك ويُفحص كاملًا (النوع، الحجم، بصمة
     * المحتوى، الأبعاد من الترويسة ≤ 40 ميجابكسل و12,000 px، L12-67)، وكل scan بنيته صحيحة، ومجموع الأصول المفكوكة في
     * حدود السطح (L12-58). → المرفقات كما هي (يحفظها documents.save بعدها).
     */
    checkAttachments(files, { surface = 'intake' } = {}) {
      if (files === undefined || files === null) return files;
      if (!Array.isArray(files)) throw badRequest('صيغة المرفقات غير صالحة');
      const cap = SCAN_CAPS[surface] || SCAN_CAPS.intake;
      let originalsBytes = 0;
      for (const f of files) {
        if (!f || typeof f !== 'object') continue;
        const main = app.documents.inspect(f);
        if (f.scan === undefined || f.scan === null) continue;
        const s = app.documents.prepareScan(f.scan, { surface, mainMime: main.realMime });
        for (const o of s.originals) originalsBytes += o.buf.length;
        if (originalsBytes > cap.originalsBytes) throw scanError('الصور الأصلية أكبر من الحد المسموح في الطلب الواحد');
      }
      return files;
    },

    /** المساحة الحرة على قرص البيانات بالبايت (أو null إن تعذر القياس)، محفوظة 10 ثوانٍ */
    diskFree() {
      if (diskProbe) return diskProbe();
      if (Date.now() - diskCache.at < 10_000) return diskCache.free;
      let free = null;
      try {
        const st = fs.statfsSync(config.dataDir || path.dirname(config.dbPath));
        free = Number(st.bavail) * Number(st.bsize);
      } catch {
        free = null;
      }
      diskCache = { at: Date.now(), free };
      return free;
    },
    /** أقل من 500 ميجابايت حرة: كل مسار رفع يرد 503 disk_low (H-M13) */
    diskLow() {
      const free = svc.diskFree();
      return free !== null && Number.isFinite(free) && free < DISK_LOW_BYTES;
    },
    /** للاختبارات: قياس بديل للمساحة الحرة (null = القياس الحقيقي) */
    setDiskProbe(fn) {
      diskProbe = typeof fn === 'function' ? fn : null;
      diskCache = { at: 0, free: null };
    },
    /** خطأ 503 الموحد عند امتلاء القرص */
    diskLowError() {
      return new ApiError(503, 'المساحة على الخادم غير كافية الآن. حاولوا لاحقًا.', 'disk_low');
    },

    /**
     * H-M3: تحقق مفاتيح «المستندات والصوت» في PATCH /api/admin/settings (قبل الحلقة العامة). المفاتيح التي يضبطها الخادم
     * (stt_third_party_since، ocr_claude_since) تُرفض. → القيم المتحقق منها.
     */
    validateSettings(b) {
      const out = {};
      if (!isPlainObject(b)) return out;
      for (const k of SERVER_SET_KEYS) if (b[k] !== undefined) throw badRequest('هذا الإعداد يضبطه الخادم ولا يُعدَّل يدويًا', { fields: { [k]: 'يضبطه الخادم' } });
      for (const k of BOOL_KEYS) if (b[k] !== undefined) out[k] = v.bool(b[k]);
      for (const [k, [label, min, max]] of Object.entries(INT_KEYS)) if (b[k] !== undefined) out[k] = v.int(b[k], label, { required: true, min, max });
      if (b.ocr_provider !== undefined) {
        const p = String(b.ocr_provider || '').trim();
        if (!OCR_PROVIDERS.includes(p)) throw badRequest('طريقة قراءة النص غير معروفة', { fields: { ocr_provider: 'غير معروفة' } });
        out.ocr_provider = p;
      }
      if (b.ocr_model !== undefined) {
        const m = String(b.ocr_model ?? '').trim();
        if (m && !OCR_MODEL_RE.test(m)) throw badRequest('اسم نموذج القراءة غير صالح', { fields: { ocr_model: 'غير صالح' } });
        out.ocr_model = m;
      }
      snapshot = { ocr_claude_allowed: app.settings.get('ocr_claude_allowed') === true };
      return out;
    },

    /**
     * H-M3 (r2): بعد حفظ الإعدادات. changedKeys = المفاتيح المحفوظة، before = القيم قبل الحفظ (إن لم تُمرَّر تُستخدم لقطة
     * validateSettings). ocr_claude_allowed من متوقف إلى مفعّل ← ocr_claude_since = الآن (لا يُرسل مستند أقدم، L12-19).
     */
    afterSettings(changedKeys = [], before = null) {
      const keys = Array.isArray(changedKeys) ? changedKeys : Object.keys(changedKeys || {});
      const prev = before && typeof before === 'object' ? before : snapshot || {};
      snapshot = null;
      if (keys.includes('ocr_claude_allowed')) {
        const was = prev.ocr_claude_allowed === true;
        const now = app.settings.get('ocr_claude_allowed') === true;
        if (!was && now) app.settings.set('ocr_claude_since', nowIso());
      }
    },

    /** فقرات الخصوصية (§10، L12-62) لصفحة /privacy — MD-11؛ نص ثابت تختاره الإعدادات، بلا مدخلات مستخدم */
    privacyHtml(_side = 'paid') {
      return '';
    },
    /** سطر حذف البيانات لصفحة /data-deletion — MD-11 */
    deletionHtml(_side = 'paid') {
      return '';
    },

    /**
     * H-M2 (MD-4، L12-61، L12-73): تنزيل نسخة من مستند لمن يملك الوصول إليه (canAccess عند المستدعي).
     * file ∈ display (الافتراضي: ما يعرضه display_file_id) | main | clean | original، page ≥ 1. لا يُحل إلا
     * WHERE document_id = doc.id، وغير الموجود 404. أصل JPEG للمحامي بلا EXIF/XMP، والملف المخزّن كما هو.
     */
    downloadVariant(doc, user, { file = null, page = null, inline = false, res } = {}) {
      const nf = () => new ApiError(404, 'المستند غير موجود', 'not_found');
      const f = file === null || file === undefined || file === '' ? 'display' : String(file);
      if (!['display', 'main', 'clean', 'original'].includes(f)) throw nf();
      const p = page === null || page === undefined || page === '' ? 1 : Number(page);
      if (!Number.isInteger(p) || p < 1 || p > 100) throw nf();
      const strip = user?.role === 'lawyer';
      const scanned = doc.scan_state === 'client' || doc.scan_state === 'staff';
      const row = (sql, ...args) => db.get(`SELECT * FROM document_files WHERE document_id = ? AND ${sql}`, doc.id, ...args);
      let variant = null;
      if (f === 'display') {
        if (doc.display_file_id) variant = row('id = ?', doc.display_file_id);
        if (doc.display_file_id && !variant) throw nf();
        if (p !== 1 && !variant) throw nf();
      } else if (f === 'main') {
        if (p !== 1) throw nf();
      } else if (f === 'clean') {
        // أحدث نسخة نظّفها الفريق أو الخادم، وإلا الرئيسي حين يكون هو النسخة النظيفة (ممسوح على الهاتف)
        variant = row("role = 'clean' AND page = ? AND replaced_at IS NULL ORDER BY id DESC LIMIT 1", p);
        if (!variant && !(scanned && p === 1)) throw nf();
      } else if (scanned) {
        variant = row("role = 'original' AND page = ? ORDER BY id LIMIT 1", p);
        if (!variant) throw nf();
      } else if (p !== 1) throw nf();
      app.documents.send(res, doc, { inline, variant, strip: strip && (f === 'original' || variant?.role === 'original') });
      return true;
    },

    /** v12 (MD-5): سطر في السجل الزمني لمستند (الطلب أو الملف أو الملف المستمر أو طلب الشركة الذي يتبعه) */
    docActivity(doc, actor, type, summary, data = {}) {
      if (!doc || !(doc.intake_id || doc.case_id || doc.matter_id || doc.client_id || doc.company_request_id)) return;
      try {
        app.activity.log({
          intake_id: doc.intake_id ?? null,
          case_id: doc.case_id ?? null,
          matter_id: doc.matter_id ?? null,
          client_id: doc.client_id ?? null,
          company_id: doc.company_id ?? undefined,
          company_request_id: doc.company_request_id ?? undefined,
          actor,
          type,
          summary,
          data: { document_id: doc.id, ...data },
        });
      } catch (e) {
        app.log('media: activity log failed', e);
      }
    },

    /** هل يقبل المستند «نظّف المستند»؟ صورة JPG/PNG/WebP من صفحة واحدة (لا PDF ولا HEIC ولا صوت ولا صورة ضخمة) */
    cleanable(doc) {
      if (!doc || doc.scan_state === 'skipped') return false;
      if (Number(doc.page_count) > 1) return false;
      return CLEANABLE.has(doc.mime);
    },

    /**
     * POST /api/admin/documents/:id/clean (MD-5، M12-26، L12-61): نسخة نظّفها ماسح المتصفح لدى الفريق ← document_files
     * (role='clean'، source='staff_scanner')، والنسخة السابقة تبقى (replaced_at) حتى يُحذف المستند، والعرض ← النسخة الجديدة.
     * body: { file: { filename, mime, data_base64 }, params } → publicView(doc)
     */
    cleanDocument(docId, body, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      if (!svc.cleanable(doc)) throw badRequest('لا يمكن تحسين هذا المستند. «نظّف المستند» لصور الصفحة الواحدة فقط.');
      if (svc.diskLow()) throw svc.diskLowError();
      const b = isPlainObject(body) ? body : {};
      if (!isPlainObject(b.file)) throw badRequest('النسخة المحسّنة مطلوبة');
      if (base64Bytes(b.file.data_base64) > CLEAN_MAX_BYTES) throw badRequest('النسخة المحسّنة أكبر من الحد المسموح');
      const f = app.documents.inspect({ filename: String(b.file.filename || 'مستند.jpg'), mime: b.file.mime, data_base64: b.file.data_base64 });
      if (!CLEAN_OUT.has(f.realMime)) throw new ApiError(400, 'النسخة المحسّنة يجب أن تكون صورة JPG أو PNG', 'bad_scan', { fields: { file: 'نوع غير صالح' } });
      const params = normalizeParams({ ...(isPlainObject(b.params) ? b.params : {}), pages: 1 }, 1);
      const before = app.documents.variantsOf(doc).display;
      const t = nowIso();
      let fid = null;
      db.tx(() => {
        fid = app.documents.saveVariant(doc, { buf: f.buf, realMime: f.realMime, dims: f.dims }, { role: 'clean', page: 1, source: 'staff_scanner', params, createdByKind: 'staff', createdBy: user?.id ?? null });
        db.run("UPDATE document_files SET replaced_at = ? WHERE document_id = ? AND role = 'clean' AND replaced_at IS NULL AND id != ?", t, doc.id, fid);
        db.run("UPDATE documents SET display_file_id = ?, scan_state = COALESCE(scan_state, 'cleaned') WHERE id = ?", fid, doc.id);
      });
      app.audit.log({ actor: user, ctx, type: 'document.cleaned', summary: `تحسين صورة المستند «${doc.title || doc.filename}» من المنصة`, data: { document_id: doc.id, file_id: fid, from: before, mode: params.mode, score: params.score, adjusted: params.adjusted } });
      svc.docActivity(doc, user, 'document.cleaned', `حسّن ${user?.name || 'الفريق'} صورة المستند «${doc.title || doc.filename}»، والأصل محفوظ`, { file_id: fid });
      return app.documents.publicView(app.documents.get(doc.id));
    },

    /**
     * PUT /api/admin/documents/:id/display { show: 'clean' | 'original' } (L12-61): ينقل مؤشر العرض فقط ولا يحذف شيئًا.
     * → publicView(doc)
     */
    setDisplay(docId, show, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      if (show !== 'clean' && show !== 'original') throw badRequest('اختر النسخة المعروضة: المحسّنة أو الأصل', { fields: { show: 'clean | original' } });
      const vs = app.documents.variantsOf(doc);
      let target = null;
      if (show === 'clean') {
        if (!vs.clean) throw notFound('لا توجد نسخة محسّنة لهذا المستند');
        target = vs.clean === 'main' ? null : vs.clean.id;
      } else if (app.documents.mainIsClean(doc)) {
        const orig = db.get("SELECT id FROM document_files WHERE document_id = ? AND role = 'original' AND page = 1 ORDER BY id LIMIT 1", doc.id);
        if (!orig) throw notFound('لا توجد صورة أصلية لهذا المستند');
        target = orig.id;
      }
      if ((doc.display_file_id ?? null) === target) return app.documents.publicView(doc);
      db.run('UPDATE documents SET display_file_id = ? WHERE id = ?', target, doc.id);
      app.audit.log({ actor: user, ctx, type: 'document.display_changed', summary: `${show === 'clean' ? 'عرض النسخة المحسّنة' : 'عرض الأصل'} أولًا للمستند «${doc.title || doc.filename}»`, data: { document_id: doc.id, from: vs.display, to: show } });
      svc.docActivity(doc, user, 'document.display_changed', show === 'clean' ? `اختار ${user?.name || 'الفريق'} عرض النسخة المحسّنة من «${doc.title || doc.filename}» أولًا` : `أعاد ${user?.name || 'الفريق'} عرض أصل «${doc.title || doc.filename}» أولًا`, { from: vs.display, to: show });
      return app.documents.publicView(app.documents.get(doc.id));
    },

    /**
     * GET /api/admin/documents/:id/files (للفريق، MD-5، L12-59): سطر معلومات المستند — بصمتا sha256 للأصل والمحسّنة،
     * المصدر، والمعاملات. لا مسارات تخزين.
     */
    fileInfo(docId, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      const vs = app.documents.variantsOf(doc);
      const mainClean = app.documents.mainIsClean(doc);
      const pick = (r) => {
        const pr = (() => {
          try {
            return r.params ? JSON.parse(r.params) : null;
          } catch {
            return null;
          }
        })();
        return {
          id: r.id,
          role: r.role,
          page: r.page,
          mime: r.mime,
          size: r.size,
          sha256: r.sha256,
          width: r.width,
          height: r.height,
          source: r.source,
          source_label: FILE_SOURCE_LABELS[r.source] || r.source,
          params: pr ? { mode: pr.mode ?? null, score: pr.score ?? null, partial: !!pr.partial, adjusted: !!pr.adjusted, turns: pr.turns ?? 0 } : null,
          replaced: !!r.replaced_at,
          displayed: doc.display_file_id === r.id,
          created_at: r.created_at,
        };
      };
      const files = app.documents.files(doc.id).map(pick);
      app.audit.log({ actor: user, ctx, type: 'document.files_viewed', summary: `عرض معلومات نسخ المستند «${doc.title || doc.filename}»`, data: { document_id: doc.id } });
      return {
        document_id: doc.id,
        display: vs.display,
        state: doc.scan_state || null,
        main: { role: mainClean ? 'clean' : 'original', mime: doc.mime, size: doc.size, sha256: doc.sha256, width: doc.width ?? null, height: doc.height ?? null, displayed: !doc.display_file_id },
        files,
      };
    },

    /** بحث الفريق في النص المقروء آليًا (H-M7) — MD-10 */
    searchStaff(_q) {
      return [];
    },

    /** تنبيهات «صحة النظام» (H-M10): ذاكرة < 1 جيجابايت، النسخ الاحتياطية والقرص، سياسة ImageMagick — MD-11 */
    healthChecks() {
      return [];
    },

    /**
     * المهمة اليومية media.gc (L12-70): تحذف ملفات media_orphans، والملفات تحت variants/ وفي المجلد المؤقت الأقدم من
     * ساعة التي لا يشير إليها أي صف، وصفوف البحث لمستندات محذوفة. لا تلمس شيئًا خارج variants/ والمجلد المؤقت.
     */
    gc() {
      const out = { orphans: 0, swept: 0, tmp: 0, fts: 0 };
      const root = path.resolve(variantsDir) + path.sep;
      const absOf = (key) => {
        const abs = path.resolve(uploadsDir, String(key || ''));
        return abs.startsWith(root) ? abs : null;
      };
      const unlink = (abs) => {
        try {
          fs.unlinkSync(abs);
          return true;
        } catch {
          return false;
        }
      };
      const referenced = new Set(db.all('SELECT storage_key FROM document_files').map((r) => path.resolve(uploadsDir, r.storage_key)));
      for (const r of db.all('SELECT id, storage_key FROM media_orphans ORDER BY id LIMIT 5000')) {
        const abs = absOf(r.storage_key);
        if (abs && !referenced.has(abs) && unlink(abs)) out.orphans += 1;
        db.run('DELETE FROM media_orphans WHERE id = ?', r.id);
      }
      const cutoff = Date.now() - 60 * 60 * 1000;
      const sweep = (dir, keep, counter) => {
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) {
            sweep(abs, keep, counter);
            continue;
          }
          if (!e.isFile()) continue;
          let st;
          try {
            st = fs.statSync(abs);
          } catch {
            continue;
          }
          if (st.mtimeMs < cutoff && !keep.has(abs) && unlink(abs)) out[counter] += 1;
        }
      };
      sweep(variantsDir, referenced, 'swept');
      sweep(tmpDir, new Set(), 'tmp');
      if (ftsOk) {
        try {
          out.fts = db.run('DELETE FROM document_text_fts WHERE document_id NOT IN (SELECT id FROM documents)').changes;
        } catch (e) {
          app.log('media.gc: fts cleanup failed', e);
        }
      }
      return out;
    },

    /** إغلاق التطبيق: إيقاف العمليات الفرعية، إعادة الوحدة الجارية إلى الانتظار، وانتظار الحلقة */
    async close() {
      stopping = true;
      if (followUp) clearTimeout(followUp);
      followUp = null;
      tools.killAll();
      if (loop) {
        try {
          await loop;
        } catch {
          // سُجّل داخل الحلقة
        }
      }
    },
  };

  // MD-6: تحويل الرسائل الصوتية إلى نص (وحدة = رسالة واحدة؛ السياسة والمحاولات في src/ai/stt.js)
  if (app.stt?.runJob) svc.registerHandler('stt', (job) => app.stt.runJob(job));

  // المجدول يوقظ الحلقة فقط (لا ينتظرها): قفل runDue لا يُمسك أثناء التحويل أو التنظيف (L12-69)
  app.jobs.register('media.process', {
    everyMinutes: 1,
    label: 'تحويل الصوت وتنظيف المستندات وقراءتها',
    run: async () => ({ kicked: svc.kick() }),
  });
  app.jobs.register('media.gc', {
    everyMinutes: 24 * 60,
    label: 'حذف ملفات نسخ المستندات المحذوفة',
    run: async () => svc.gc(),
  });

  return svc;
}
