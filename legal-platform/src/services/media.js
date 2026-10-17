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
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { badRequest, notFound, nowIso, v, ApiError, randomToken, normalizeArabic } from '../util.js';
import { createMediaTools, toolsMode, deprioritize, POLICY_DIR, IM_LIMITS, CODER_FOR_MIME } from '../media-tools.js';
import { headerDims, scanConfident } from './documents.js';
import { SERVER_CLEAN_MAX_PIXELS } from '../media-child.js';
import { parseTesseractTsv, meanConfidence, textFromWords, mergeDigits, tidyOcrText, OCR_LATIN_TRY_BELOW, OCR_LATIN_MARGIN } from './ocr-text.js';

export const JOB_KINDS = ['stt', 'clean', 'ocr'];
const KIND_ORDER = "CASE kind WHEN 'stt' THEN 0 WHEN 'clean' THEN 1 ELSE 2 END";
/** محاولات الوحدة القابلة للإعادة: بعد 1 ثم 5 ثم 30 دقيقة، ثم «تعذّر» */
export const RETRY_MINUTES = [1, 5, 30];
export const MAX_ATTEMPTS = 4;
/** وحدة بقيت running أكثر من هذا (في العملية نفسها) تُعاد إلى الانتظار */
export const STALE_MINUTES = 15;
/** أقل مساحة حرة على قرص البيانات قبل رفض الرفع (H-M13) */
export const DISK_LOW_BYTES = 500 * 1024 * 1024;

// ───────── التنظيف على الخادم (MD-9، L12-66) ─────────
/** العملية الفرعية التي تشغّل scan-core (عملية الويب لا تشغّله أبدًا) */
export const CHILD_PATH = fileURLToPath(new URL('../media-child.js', import.meta.url));
/** أقل ذاكرة متاحة قبل وحدة تنظيف أو قراءة؛ أقل منها تؤجَّل 5 دقائق، وبعد 6 تأجيلات «لم يُعالَج» (low_memory) */
export const MEMORY_HEADROOM_MIN = 300 * 1024 * 1024;
export const MEMORY_DEFER_MINUTES = 5;
export const MEMORY_DEFER_MAX = 6;
/** ذاكرة الخادم الأقل من هذا تظهر تنبيهًا في «صحة النظام» (SYS-09) */
export const MEMORY_SLOW_BELOW = 1024 * 1024 * 1024;
/** أقصى مدة لوحدة تنظيف كاملة في العملية الفرعية (ثلاثة فكوك وترميز، كل منها ≤ 60 ثانية) */
export const CHILD_TIMEOUT_MS = 200_000;
/** الصور التي ينظفها الخادم وحده: صور العملاء بلا ماسح (واتساب، وما فشل فيه ماسح الهاتف، ورفع الشركات بلا scan) */
const AUTO_CLEAN_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** المستندات التي يُقرأ نصها (MD-10) */
export const OCR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
/** أسماء الاستكمال في سجل الأمان */
const BACKFILL_LABELS = { stt: 'تحويل الرسائل الصوتية', clean: 'تحسين الصور', ocr: 'قراءة نص المستندات' };
/** وسم لوحة «النص» (L12-35) */
export const OCR_LABEL = 'نص مستخرج آليًا من المستند، راجعه قبل الاعتماد عليه.';
/** ملاحظة مجموعة «مستندات» في البحث (L12-37) */
export const SEARCH_NOTE = 'البحث في النص المقروء آليًا وقد لا يجد كل الكلمات.';
export const OCR_SOURCE_LABELS = { tesseract: 'Tesseract على الخادم', pdftotext: 'طبقة النص في ملف PDF', claude: 'Claude', staff: 'الفريق' };
/** لماذا لا تُقرأ الوثيقة بـ Claude (رسائل للفريق) */
export const CLAUDE_BLOCK_TEXT = {
  not_allowed: 'إرسال صور المستندات إلى Claude غير مسموح. فعّله من «الإعدادات ← المستندات والصوت».',
  company: 'قراءة مستندات الشركات بـ Claude غير مسموحة.',
  before_disclosure: 'وصل هذا المستند قبل إعلان القراءة بـ Claude في سياسة الخصوصية.',
  backfill: 'الاستكمال لا يستخدم Claude.',
  budget: 'ميزانية الذكاء الاصطناعي لهذا الشهر لا تتسع.',
  budget_share: 'حصة قراءة المستندات من ميزانية الذكاء الاصطناعي لا تتسع.',
  ai_off: 'Claude غير مضبوط في «التكاملات».',
};

/**
 * الذاكرة المتاحة الآن: حد cgroup v2 (memory.max − memory.current) أو v1، وإلا os.freemem()؛ الأقل منهما.
 * → { limit, headroom, source }
 */
export function readMemory() {
  const free = os.freemem();
  const num = (f) => {
    try {
      return Number(fs.readFileSync(f, 'utf8').trim());
    } catch {
      return NaN;
    }
  };
  let limit = null;
  let used = null;
  let source = 'os';
  const max2 = num('/sys/fs/cgroup/memory.max');
  const cur2 = num('/sys/fs/cgroup/memory.current');
  if (Number.isFinite(max2) && Number.isFinite(cur2)) {
    limit = max2;
    used = cur2;
    source = 'cgroup2';
  } else {
    const max1 = num('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    const cur1 = num('/sys/fs/cgroup/memory/memory.usage_in_bytes');
    if (Number.isFinite(max1) && max1 < 2 ** 60 && Number.isFinite(cur1)) {
      limit = max1;
      used = cur1;
      source = 'cgroup1';
    }
  }
  const headroom = limit !== null ? Math.min(limit - used, free) : free;
  return { limit: limit ?? os.totalmem(), headroom, source };
}

const codeErr = (code, message = code, extra = {}) => Object.assign(new Error(message), { code, ...extra });

/**
 * فشل أداة خارجية (ImageMagick، Tesseract، poppler) → { retry, code } (SEC-4): المهلة وتعطل العملية أو نقص موارد
 * النظام المؤقت تُعاد لاحقًا؛ خروج الأداة برمز غير صفري (ملف تالف، ذاكرة ImageMagick لا تكفي صورة بهذا الحجم) نتيجته
 * واحدة كل مرة، فلا يُعاد: «too_large» إن قالت الأداة ذلك، وإلا «tool_error» (لا رقم خروج خام مثل «1»).
 */
export function toolFailure(e) {
  const code = e?.code;
  const said = `${e?.message || ''}\n${e?.stderr ? String(e.stderr).slice(-2000) : ''}`;
  if (code === 'timeout' || e?.retryable) return { retry: true, code: 'timeout' };
  if (['EAGAIN', 'ENOMEM', 'EMFILE', 'ENFILE', 'child_killed', 'child_exit', 'child_error', 'fork_failed'].includes(code)) return { retry: true, code: String(code).toLowerCase() };
  if (typeof code === 'number' || /^\d+$/.test(String(code ?? '')) || code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || code === 'bad_output' || code === 'unsupported') {
    if (/cache resources exhausted|exceeds limit|width or height exceeds|memory allocation failed|too large|resource limit/i.test(said)) return { retry: false, code: 'too_large' };
    return { retry: false, code: 'tool_error' };
  }
  if (code === 'tool_missing') return { retry: false, code: 'tool_missing' };
  return { retry: true, code: String(code || 'error').slice(0, 40) };
}
const escHtml = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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
    // K-M1: ورق خارج الحدود المكتشفة (إطار مطبوع داخل الورقة) ← الأصل أولًا (L12-59)
    nested: rest.nested === true,
    // gate SEC-7 (L12-58): «الأصل» المحفوظ نسخة أعاد الهاتف ترميزها (1600 أو 1200 بكسل)، لا ملف الكاميرا نفسه
    ...(rest.reencoded === true ? { reencoded: true } : {}),
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
  let memProbe = null;
  let diskEstimate = null; // تقدير حجم المرفقات لتنبيه القرص (كل 10 دقائق)
  let childRunner = null; // للاختبارات: بديل العملية الفرعية (type, input) → result
  const childProcs = new Set();

  const testContext = () => !!process.env.NODE_TEST_CONTEXT;
  // البذور تعمل قبل أن يستمع الخادم: لا تضيف مهام أبدًا (L12-69)؛ بعد الاستماع كل حفظ يضيف مهامه
  const live = () => !!app.server?.listening;

  // ───────── العملية الفرعية (L12-66) ─────────
  function killChild(child) {
    try {
      process.kill(-child.pid, 'SIGKILL'); // المجموعة كلها: العملية الفرعية وأي ImageMagick شغّلته
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // انتهت بالفعل
      }
    }
  }

  /** وحدة واحدة في عملية فرعية جديدة ثم تُقتل: --max-old-space-size=128، بيئة دنيا، أولوية 19، oom_score_adj 1000 */
  function runChild(type, input, { timeoutMs = CHILD_TIMEOUT_MS } = {}) {
    if (childRunner) return Promise.resolve().then(() => childRunner(type, input));
    return new Promise((resolve, reject) => {
      let settled = false;
      let stderr = '';
      let child;
      try {
        child = fork(CHILD_PATH, [], {
          execArgv: ['--max-old-space-size=128'],
          env: { ...tools.spawnEnv(), BM_MEDIA_CHILD: '1' },
          cwd: tmpDir,
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          detached: true,
          serialization: 'json',
        });
      } catch (e) {
        reject(codeErr('fork_failed', e.message));
        return;
      }
      childProcs.add(child);
      deprioritize(child.pid);
      let timer = null;
      const end = (fn, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        killChild(child);
        childProcs.delete(child);
        fn(val);
      };
      timer = setTimeout(() => end(reject, codeErr('timeout', 'media child timed out', { retryable: true })), timeoutMs);
      child.stderr?.on('data', (b) => {
        stderr = (stderr + b).slice(-2000);
      });
      child.on('message', (m) => {
        if (m && m.type === 'ready') {
          child.send({ id: 1, type, input });
          return;
        }
        if (!m || m.id !== 1) return;
        if (m.ok) end(resolve, m.result);
        else end(reject, codeErr(m.code || 'failed', m.message || 'media child failed'));
      });
      child.on('error', (e) => end(reject, codeErr('child_error', e.message)));
      child.on('exit', (code, signal) => end(reject, codeErr(signal ? 'child_killed' : 'child_exit', `media child exited (${code ?? signal}) ${stderr.slice(-300)}`)));
    });
  }

  /** حارس الذاكرة قبل وحدة تنظيف أو قراءة (L12-66) → null (تابع) أو نتيجة تأجيل/ترك */
  function memoryGate(job) {
    const m = memProbe ? memProbe() : readMemory();
    if (!(Number(m?.headroom) < MEMORY_HEADROOM_MIN)) return null;
    const prev = /^low_memory:(\d+)$/.exec(String(job.error || ''));
    const n = (prev ? Number(prev[1]) : 0) + 1;
    if (n > MEMORY_DEFER_MAX) return { state: 'skipped', error: 'low_memory' };
    return { state: 'defer', seconds: MEMORY_DEFER_MINUTES * 60, error: `low_memory:${n}` };
  }

  function rmQuiet(f) {
    try {
      fs.unlinkSync(f);
    } catch {
      // غير موجود
    }
  }

  /** لماذا لا ينظف الخادم هذا المستند؟ (L12-21) → null أو السبب */
  function autoCleanBlock(doc) {
    if (!doc) return 'gone';
    if (doc.uploaded_by_kind !== 'client') return 'not_client'; // رفع الفريق والمحامين: «نظّف المستند» فقط (سلامة الدليل)
    if (!AUTO_CLEAN_MIMES.has(doc.mime)) return 'not_image';
    if (doc.scan_state === 'skipped') return doc.mime === 'image/heic' ? 'heic' : 'too_large';
    if (doc.scan_state) return 'already_clean';
    if (db.get("SELECT 1 FROM document_files WHERE document_id = ? AND role = 'clean'", doc.id)) return 'already_clean';
    if (!(Number(doc.width) > 0 && Number(doc.height) > 0)) return 'unknown_size';
    if (Number(doc.width) * Number(doc.height) > SERVER_CLEAN_MAX_PIXELS) return 'too_large';
    return null;
  }

  /** وحدة «تنظيف على الخادم» (MD-9): صورة عميل بلا ماسح ← نسخة محسّنة server_auto تحت variants/auto/ */
  async function cleanUnit(job) {
    const doc = app.documents.get(job.document_id);
    const block = autoCleanBlock(doc);
    if (block) return { state: block === 'gone' ? 'cancelled' : 'skipped', error: block };
    if (app.settings.get('scan_server_auto') === false) return { state: 'skipped', error: 'off' };
    await tools.probe();
    if (!tools.has('imagemagick')) return { state: 'skipped', error: 'tool_missing' };
    const mem = memoryGate(job);
    if (mem) return mem;
    const abs = path.resolve(uploadsDir, doc.storage_key);
    if (!abs.startsWith(path.resolve(uploadsDir) + path.sep)) return { state: 'failed', error: 'bad_path' };
    let head;
    try {
      head = headerDims(doc.mime, fs.readFileSync(abs));
    } catch {
      return { state: 'failed', error: 'file_missing' };
    }
    if (!head) return { state: 'skipped', error: 'unknown_size' };
    const out = path.join(tmpDir, `clean-${job.id}-${randomToken(8)}.jpg`);
    const started = Date.now();
    try {
      let r;
      try {
        r = await runChild('clean', { file: abs, mime: doc.mime, width: head.width, height: head.height, orientation: head.orientation, bin: tools.bin('imagemagick'), tmpDir, policyDir: POLICY_DIR, out });
      } catch (e) {
        if (stopping) throw e;
        app.log(`media clean #${job.id}: ${e.code || 'error'}`);
        // SEC-4: خروج ImageMagick برمز غير صفري نتيجته واحدة كل مرة ← «تعذّر» بسبب مقروء، لا إعادة
        const f = toolFailure(e);
        return f.retry ? { state: 'retry', error: f.code || 'child_failed' } : { state: f.code === 'too_large' ? 'skipped' : 'failed', error: f.code };
      }
      if (!r || r.skipped) return { state: 'skipped', error: r?.skipped || 'no_result' };
      let buf;
      try {
        buf = fs.readFileSync(out);
      } catch {
        return { state: 'failed', error: 'no_output' };
      }
      const f = app.documents.inspect({ filename: 'clean.jpg', mime: 'image/jpeg', buffer: buf }, { fetched: true });
      if (f.realMime !== 'image/jpeg' || !f.dims || f.dims.width !== r.width || f.dims.height !== r.height) return { state: 'failed', error: 'bad_output' };
      const params = normalizeParams({ algo: 'scan-core@1', mode: 'auto', turns: r.params?.turns ?? 0, pages: 1, quad: r.params?.quad, score: r.params?.score, nested: r.params?.nested === true }, 1);
      const confident = scanConfident(params, { dims: [{ width: head.width, height: head.height }] });
      let saved = false;
      db.tx(() => {
        // نتيجة لجيل أقدم من المهمة (أُعيدت جدولتها) أو مستند نظّفه الفريق في هذه الأثناء ← لا تُكتب
        if (Number(db.value('SELECT gen FROM media_jobs WHERE id = ?', job.id)) !== Number(job.gen)) return;
        const cur = app.documents.get(doc.id);
        if (!cur || autoCleanBlock(cur)) return;
        const fid = app.documents.saveVariant(
          cur,
          { buf, realMime: 'image/jpeg', dims: f.dims },
          { role: 'clean', page: 1, source: 'server_auto', params: { ...params, area: r.params?.area ?? null, chroma: r.params?.chroma ?? null, ink: r.params?.ink ?? null }, createdByKind: 'system', createdBy: null, sub: path.join('variants', 'auto') },
        );
        // L12-59: النسخة المحسّنة تُعرض أولًا فقط حين يكون الاكتشاف واثقًا (documents.SCAN_CONFIDENCE)، وإلا يبقى الأصل
        db.run("UPDATE documents SET scan_state = 'server', display_file_id = ? WHERE id = ?", confident ? fid : (cur.display_file_id ?? null), cur.id);
        saved = true;
      });
      try {
        const t = nowIso();
        db.insert('media_usage', { kind: 'clean_server', provider: 'imagemagick', model: null, document_id: doc.id, seconds: (Date.now() - started) / 1000, pages: 1, cost_micro_usd: 0, ok: saved ? 1 : 0, error: saved ? null : 'superseded', period: t.slice(0, 7), created_at: t });
      } catch (e) {
        app.log('media usage (clean) failed', e);
      }
      return saved ? { state: 'done' } : { state: 'cancelled', error: 'superseded' };
    } finally {
      rmQuiet(out);
    }
  }

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
      // الصفحة التالية وحدة جديدة: محاولاتها من الصفر
      return db.run("UPDATE media_jobs SET state = 'queued', attempts = 0, locked_at = NULL, error = NULL, next_page = ?, next_at = ?, provider = COALESCE(?, provider), updated_at = ? WHERE id = ? AND gen = ?", res.next_page ?? null, t, res.provider ?? null, t, job.id, job.gen).changes;
    }
    if (state === 'defer') {
      // تأجيل لا يُحتسب محاولة (ذاكرة غير كافية، أو قراءة تنتظر تنظيف المستند نفسه)
      const at = new Date(Date.parse(t) + (Number(res.seconds) || MEMORY_DEFER_MINUTES * 60) * 1000).toISOString();
      return db.run("UPDATE media_jobs SET state = 'queued', attempts = MAX(0, attempts - 1), locked_at = NULL, error = ?, next_at = ?, updated_at = ? WHERE id = ? AND gen = ?", error, at, t, job.id, job.gen).changes;
    }
    if (state === 'retry') {
      if (job.attempts >= MAX_ATTEMPTS) {
        const n = db.run("UPDATE media_jobs SET state = 'failed', locked_at = NULL, error = ?, updated_at = ? WHERE id = ? AND gen = ?", error, t, job.id, job.gen).changes;
        if (n && job.kind === 'ocr') ocrFinal(job.document_id, 'failed');
        return n;
      }
      const wait = RETRY_MINUTES[Math.min(RETRY_MINUTES.length - 1, Math.max(0, job.attempts - 1))];
      const at = new Date(Date.parse(t) + wait * 60000).toISOString();
      return db.run("UPDATE media_jobs SET state = 'queued', locked_at = NULL, error = ?, next_at = ?, updated_at = ? WHERE id = ? AND gen = ?", error, at, t, job.id, job.gen).changes;
    }
    const final = ['done', 'skipped', 'failed', 'cancelled'].includes(state) ? state : 'failed';
    const n = db.run('UPDATE media_jobs SET state = ?, locked_at = NULL, error = ?, provider = COALESCE(?, provider), updated_at = ? WHERE id = ? AND gen = ?', final, error, res?.provider ?? null, t, job.id, job.gen).changes;
    // قراءة النص: حالة المستند تتبع النهاية (النص المقروء سابقًا يبقى «تم»)
    if (n && job.kind === 'ocr' && (final === 'failed' || final === 'skipped')) ocrFinal(job.document_id, final);
    return n;
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

  // ───────── قراءة النص (MD-10، M12-28…31، L12-17، L12-19، L12-37، L12-67) ─────────
  /** حدود القراءة: الصفحة التي فيها أقل من 20 حرفًا في طبقة نص PDF تُقرأ من صورتها */
  const OCR_LETTERS_MIN = 20;
  /** صفحة PDF ضلعها أكبر من 4,000 نقطة (نحو 55 بوصة، أكبر من A0) لا تُحوَّل إلى صورة ولا تُقرأ (قنبلة صفحة، L12-67) */
  const PDF_PAGE_MAX_PT = 4000;
  const OCR_TEXT_MAX = 50_000;
  const letters = (t) => (String(t || '').match(/\p{L}/gu) || []).length;

  /** تشغيل أداة مع تسجيل الوقت؛ الخطأ يحمل code (timeout أو غيره) */
  async function runTool(tool, argv, opts = {}) {
    const bin = tools.bin(tool);
    if (!bin) throw codeErr('tool_missing');
    return tools.run(bin, argv, { timeoutMs: 60_000, maxBuffer: 16 * 1024 * 1024, ...opts });
  }

  /** pdfinfo للصفحات الأولى: العدد الكلي ومقاس كل صفحة بالنقاط (قبل أي تحويل إلى صورة، L12-67) */
  async function pdfPages(abs, max) {
    const r = await runTool('pdfinfo', ['-f', '1', '-l', String(max), abs], { timeoutMs: 30_000, maxBuffer: 1024 * 1024 });
    const out = String(r.stdout || '');
    const total = Number(/^Pages:\s+(\d+)/m.exec(out)?.[1]) || 0;
    const sizes = new Map();
    for (const m of out.matchAll(/^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/gm)) sizes.set(Number(m[1]), [Number(m[2]), Number(m[3])]);
    return { total, sizes };
  }

  /** صفحة PDF إلى صورة بمقاس أقصى ثابت (-scale-to، لا -r أبدًا، L12-67) → مسار الصورة المؤقتة */
  async function rasterPdfPage(abs, page, scaleTo, fmt = 'png') {
    const prefix = path.join(tmpDir, `ocr-${randomToken(8)}`);
    await runTool('pdftoppm', [fmt === 'jpeg' ? '-jpeg' : '-png', '-scale-to', String(scaleTo), '-f', String(page), '-l', String(page), '-singlefile', abs, prefix]);
    return `${prefix}.${fmt === 'jpeg' ? 'jpg' : 'png'}`;
  }

  /**
   * صورة جاهزة للقراءة بضلع أقصى max (ImageMagick إن وُجد: اتجاه EXIF ثم تصغير بلا «!») → { file, temp } أو null.
   * SEC-4: JPEG يُفك مصغّرًا من البداية (-define jpeg:size، كما في media-child) فصورة 31–40 ميجابكسل يقبلها الرفع تُقرأ
   * داخل حدود ذاكرة ImageMagick؛ وغير JPEG فوق حد التنظيف على الخادم (24 ميجابكسل) لا تُفك: «أكبر من المسموح».
   */
  async function imageForOcr(abs, mime, dims, max, fmt = 'png') {
    if (tools.has('imagemagick') && CODER_FOR_MIME[mime]) {
      const coder = CODER_FOR_MIME[mime];
      if (coder !== 'jpeg' && dims && Number(dims.width) * Number(dims.height) > SERVER_CLEAN_MAX_PIXELS) throw codeErr('too_large', 'image too large to decode for OCR');
      const out = path.join(tmpDir, `ocr-${randomToken(8)}.${fmt === 'jpeg' ? 'jpg' : 'png'}`);
      const outArg = fmt === 'jpeg' ? ['-quality', '85', `jpeg:${out}`] : [`png:${out}`];
      const hint = coder === 'jpeg' ? ['-define', `jpeg:size=${max}x${max}`] : [];
      await runTool('imagemagick', [...IM_LIMITS, ...hint, `${coder}:${abs}`, '-auto-orient', '-resize', `${max}x${max}>`, '-strip', ...outArg]);
      return { file: out, temp: true };
    }
    if (dims && Math.max(dims.width, dims.height) <= max) return { file: abs, temp: false };
    return null;
  }

  /**
   * Tesseract على صورة صفحة (V-14، src/services/ocr-text.js): «ara» أولًا بخرج TSV (كلمة كلمة بثقتها)؛ ثقة منخفضة ومعها
   * eng ← تُجرَّب eng (صفحة إنجليزية)؛ ومع نموذج الخط العربي «Arabic» قراءة ثانية تأخذ منها الأرقام الهندية العربية فقط.
   * لا «ara+eng» بعد الآن: كان يقرأ «٤٥٢٨» حروفًا لاتينية («EOPA»). OMP_THREAD_LIMIT=1، 60 ثانية لكل قراءة.
   * → { text, confidence (0–1) أو null, lang }
   */
  async function tesseract(file) {
    const langs = tools.status()?.tesseract?.langs || [];
    const pass = async (lang) => {
      const r = await runTool('tesseract', [file, 'stdout', '-l', lang, '--oem', '1', '--psm', '3', 'tsv'], { maxBuffer: 8 * 1024 * 1024 });
      const out = String(r.stdout || '');
      return { out, words: parseTesseractTsv(out) };
    };
    const main = await pass('ara');
    // خرج نصي (إصدار قديم بلا tsv أو أداة بديلة): يُحفظ كما هو بعد التنظيف
    if (!main.words) return { text: tidyOcrText(main.out), confidence: null, lang: 'ara' };
    let words = main.words;
    let conf = meanConfidence(words);
    let lang = 'ara';
    if (langs.includes('eng') && (conf === null || conf < OCR_LATIN_TRY_BELOW)) {
      const e = await pass('eng');
      const ec = e.words ? meanConfidence(e.words) : null;
      if (ec !== null && ec >= (conf ?? 0) + OCR_LATIN_MARGIN) {
        words = e.words;
        conf = ec;
        lang = 'eng';
      }
    }
    const script = langs.includes('Arabic') ? 'Arabic' : langs.includes('script/Arabic') ? 'script/Arabic' : null;
    if (lang === 'ara' && script && words.length) {
      const d = await pass(script);
      if (d.words) words = mergeDigits(words, d.words);
    }
    return { text: tidyOcrText(textFromWords(words)), confidence: conf === null ? null : Math.round(conf * 10) / 1000, lang };
  }

  /** لماذا لا تُقرأ هذه الوثيقة بـ Claude؟ (L12-19) → null أو السبب */
  function claudeBlock(doc, job) {
    if (Number(job?.priority) < 0) return 'backfill'; // الاستكمال لا يستخدم Claude أبدًا
    if (app.settings.get('ocr_claude_allowed') !== true) return 'not_allowed';
    if (doc.company_id && app.settings.get('ocr_claude_companies') !== true) return 'company';
    const since = String(app.settings.get('ocr_claude_since') || '');
    if (!since || String(doc.created_at || '') < since) return 'before_disclosure';
    return null;
  }

  /** كتابة نص صفحة (حذف ثم إدراج في معاملة واحدة، مع صف البحث). لا يكتب فوق صفحة صحّحها الفريق ولا لجيل قديم. */
  function writePage(job, docId, page, text, { provider, model = null, confidence = null, sourceFile = 'main' }) {
    const body = String(text || '').slice(0, OCR_TEXT_MAX);
    const norm = normalizeArabic(body);
    const t = nowIso();
    let wrote = false;
    db.tx(() => {
      if (job && Number(db.value('SELECT gen FROM media_jobs WHERE id = ?', job.id)) !== Number(job.gen)) return;
      const cur = db.get('SELECT status FROM document_text WHERE document_id = ? AND page = ?', docId, page);
      if (cur?.status === 'corrected') return;
      db.run('DELETE FROM document_text WHERE document_id = ? AND page = ?', docId, page);
      db.insert('document_text', { document_id: docId, page, text: body, norm, source_file: sourceFile, provider, model, confidence, chars: body.length, status: 'machine', corrected_by: null, created_at: t, updated_at: t });
      ftsWrite(docId, page, norm);
      wrote = true;
    });
    return wrote;
  }
  function ftsWrite(docId, page, norm) {
    if (!ftsOk) return;
    try {
      db.run('DELETE FROM document_text_fts WHERE document_id = ? AND page = ?', docId, page);
      db.run('INSERT INTO document_text_fts (norm, document_id, page) VALUES (?, ?, ?)', norm, docId, page);
    } catch (e) {
      app.log('media: fts write failed', e);
    }
  }
  function ocrUsage(docId, provider, started, ok, error = null) {
    try {
      const t = nowIso();
      db.insert('media_usage', { kind: 'ocr_local', provider, model: null, document_id: docId, seconds: (Date.now() - started) / 1000, pages: 1, cost_micro_usd: 0, ok: ok ? 1 : 0, error, period: t.slice(0, 7), created_at: t });
    } catch (e) {
      app.log('media usage (ocr) failed', e);
    }
  }
  /** حالة القراءة في صف المستند بعد آخر صفحة */
  function ocrFinal(docId, state) {
    if (state === 'done' || state === 'empty') db.run('UPDATE documents SET ocr_state = ? WHERE id = ?', state, docId);
    else db.run("UPDATE documents SET ocr_state = ? WHERE id = ? AND (ocr_state IS NULL OR ocr_state NOT IN ('done', 'empty'))", state, docId);
  }

  /** الملف الذي يُقرأ: النسخة المحسّنة إن وُجدت (أوضح للقراءة)، وإلا الرئيسي */
  function ocrSource(doc) {
    const clean = db.get("SELECT * FROM document_files WHERE document_id = ? AND role = 'clean' AND page = 1 AND replaced_at IS NULL ORDER BY id DESC LIMIT 1", doc.id);
    if (clean && doc.mime !== 'application/pdf') {
      const abs = path.resolve(uploadsDir, clean.storage_key);
      if (fs.existsSync(abs)) return { abs, mime: clean.mime, dims: clean.width ? { width: clean.width, height: clean.height } : null, sourceFile: 'clean' };
    }
    return { abs: path.resolve(uploadsDir, doc.storage_key), mime: doc.mime, dims: doc.width ? { width: doc.width, height: doc.height } : null, sourceFile: 'main' };
  }

  /**
   * وحدة «قراءة صفحة» (MD-10): صفحة واحدة لكل وحدة (next_page). PDF: pdfinfo أولًا (مقاس الصفحة)، ثم طبقة النص
   * (pdftotext)، والصفحة الخالية تُحوَّل صورة (pdftoppm -scale-to 2000) وتُقرأ. Claude (P1) بصورة الصفحة فقط، بشروطه.
   */
  async function ocrUnit(job) {
    const doc = app.documents.get(job.document_id);
    if (!doc) return { state: 'cancelled', error: 'gone' };
    if (!OCR_MIMES.has(doc.mime) || doc.scan_state === 'skipped') return { state: 'skipped', error: 'unsupported' };
    const setting = svc.ocrProvider();
    if (setting === 'off') return { state: 'skipped', error: 'off' };
    // القراءة تنتظر تنظيف المستند نفسه (النسخة المحسّنة أوضح)
    if (db.get("SELECT 1 FROM media_jobs WHERE document_id = ? AND kind = 'clean' AND state IN ('queued', 'running')", doc.id)) return { state: 'defer', seconds: 30, error: 'waiting_clean' };
    await tools.probe();
    const maxPages = Math.min(30, Math.max(1, Number(app.settings.get('ocr_max_pages')) || 10));
    const page = Math.max(1, Number(job.next_page) || 1);
    const src = ocrSource(doc);
    const isPdf = doc.mime === 'application/pdf';
    // Claude: بطلب صريح من الفريق، أو إعداد «Claude»، بشروطه (السماح، الشركات، تاريخ الإعلان، الميزانية)؛ وإلا Tesseract
    let useClaude = false;
    let claudeWhy = null;
    if (job.provider === 'claude' || (setting === 'claude' && job.provider !== 'tesseract')) {
      claudeWhy = claudeBlock(doc, job);
      if (!claudeWhy) {
        const model = String(app.settings.get('ocr_model') || '') || null;
        const allow = app.ai?.ocrAllowance ? app.ai.ocrAllowance({ pages: Math.max(1, (isPdf ? maxPages : 1) - page + 1), model }) : { ok: false, reason: 'ai_off' };
        if (allow.ok) useClaude = true;
        else claudeWhy = allow.reason;
      }
    }
    const canRaster = useClaude || tools.has('tesseract');
    if (!isPdf && !canRaster) return { state: 'skipped', error: claudeWhy && job.provider === 'claude' ? `claude_${claudeWhy}` : 'tool_missing' };
    if (isPdf && !tools.has('pdfinfo')) return { state: 'skipped', error: 'tool_missing' };
    if (!src.abs.startsWith(path.resolve(uploadsDir) + path.sep) || !fs.existsSync(src.abs)) return { state: 'failed', error: 'file_missing' };
    const mem = memoryGate(job);
    if (mem) return mem;

    const started = Date.now();
    const temps = [];
    let total = 1;
    try {
      let text = null;
      let provider = null;
      let model = null;
      let confidence = null;
      let rasterFile = null;
      let rasterMime = 'image/png';
      if (isPdf) {
        const info = await pdfPages(src.abs, maxPages);
        total = Math.min(maxPages, info.total || 1);
        if (page > total) return { state: 'done' };
        const size = info.sizes.get(page);
        if (size && (size[0] > PDF_PAGE_MAX_PT || size[1] > PDF_PAGE_MAX_PT)) {
          // صفحة عملاقة: لا تُقرأ ولا تُحوَّل (تبقى بلا نص)
          provider = null;
        } else {
          if (tools.has('pdftotext')) {
            const r = await runTool('pdftotext', ['-layout', '-enc', 'UTF-8', '-f', String(page), '-l', String(page), src.abs, '-'], { maxBuffer: 8 * 1024 * 1024 });
            const t = String(r.stdout || '').replace(/\f/g, '').trim();
            if (letters(t) >= OCR_LETTERS_MIN) {
              text = t;
              provider = 'pdftotext';
            }
          }
          if (text === null && canRaster && tools.has('pdftoppm')) {
            rasterFile = await rasterPdfPage(src.abs, page, useClaude ? 1568 : 2000, useClaude ? 'jpeg' : 'png');
            rasterMime = useClaude ? 'image/jpeg' : 'image/png';
            temps.push(rasterFile);
          }
        }
      } else {
        const img = await imageForOcr(src.abs, src.mime, src.dims, useClaude ? 1568 : 2000, useClaude ? 'jpeg' : 'png');
        if (!img) return { state: 'skipped', error: 'needs_imagemagick' };
        if (img.temp) temps.push(img.file);
        rasterFile = img.file;
        rasterMime = img.temp ? (useClaude ? 'image/jpeg' : 'image/png') : src.mime;
      }
      if (text === null && rasterFile) {
        if (useClaude) {
          try {
            const r = await app.ai.ocrPage({ buffer: fs.readFileSync(rasterFile), mime: rasterMime, page, model: String(app.settings.get('ocr_model') || '') || null, documentId: doc.id });
            text = r.text;
            provider = 'claude';
            model = r.model;
          } catch (e) {
            claudeWhy = e?.code || 'error';
            useClaude = false;
          }
        }
        if (text === null && tools.has('tesseract')) {
          const r = await tesseract(rasterFile);
          text = r.text;
          confidence = r.confidence;
          provider = 'tesseract';
        }
      }
      if (provider && text !== null) {
        writePage(job, doc.id, page, text, { provider, model, confidence, sourceFile: src.sourceFile });
        if (provider !== 'claude') ocrUsage(doc.id, provider, started, true);
      } else if (page === 1 && !isPdf) {
        return { state: 'skipped', error: claudeWhy ? `claude_${claudeWhy}` : 'tool_missing' };
      }
      // الصفحة التالية بالمزوّد نفسه؛ وإن تعذّر Claude هنا تُكمل الصفحات الباقية بـ Tesseract (لا محاولات متكررة)
      const nextProvider = provider === 'claude' ? 'claude' : claudeWhy && (job.provider === 'claude' || setting === 'claude') ? 'tesseract' : job.provider ?? null;
      if (isPdf && page < total) return { state: 'next', next_page: page + 1, provider: nextProvider };
      const sum = Number(db.value('SELECT COALESCE(SUM(chars), 0) FROM document_text WHERE document_id = ?', doc.id)) || 0;
      const rows = Number(db.value('SELECT COUNT(*) FROM document_text WHERE document_id = ?', doc.id)) || 0;
      if (!rows) return { state: 'skipped', error: claudeWhy ? `claude_${claudeWhy}` : 'no_text' };
      ocrFinal(doc.id, sum > 0 ? 'done' : 'empty');
      return { state: 'done', provider: provider || null };
    } catch (e) {
      if (stopping) throw e;
      // SEC-4: المهلة وتعطل العملية فقط تُعاد؛ خروج الأداة بخطأ (PDF تالف، صورة أكبر من ذاكرة ImageMagick) «تعذّر» بسبب مقروء
      const f = e?.code === 'too_large' ? { retry: false, code: 'too_large' } : toolFailure(e);
      ocrUsage(doc.id, 'tesseract', started, false, f.code);
      app.log(`media ocr #${job.id} page ${page}: ${f.code}${e?.code !== undefined && e?.code !== f.code ? ` (${String(e.code).slice(0, 40)})` : ''}`);
      if (f.code === 'tool_missing' || f.code === 'too_large') return { state: 'skipped', error: f.code };
      return { state: f.retry ? 'retry' : 'failed', error: f.code };
    } finally {
      for (const f of temps) rmQuiet(f);
    }
  }

  /** نص مقتطف حول أول تطابق (≤ 120 حرفًا)، بمطابقة على النص الموحَّد ثم القص من الأصل */
  function snippetOf(text, nq) {
    const src = String(text || '');
    let norm = '';
    const map = [];
    for (let i = 0; i < src.length; i++) {
      const n = normalizeArabic(src[i]);
      for (const ch of n) {
        norm += ch;
        map.push(i);
      }
    }
    const at = norm.indexOf(nq);
    const pos = at >= 0 ? map[at] : 0;
    const start = Math.max(0, pos - 40);
    const clip = src.slice(start, start + 120).replace(/\s+/g, ' ').trim();
    return (start > 0 ? '…' : '') + clip + (start + 120 < src.length ? '…' : '');
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

    /** الذاكرة المتاحة (cgroup أو النظام) */
    memory() {
      return memProbe ? memProbe() : readMemory();
    },
    /** للاختبارات: قياس بديل للذاكرة (null = القياس الحقيقي) */
    setMemoryProbe(fn) {
      memProbe = typeof fn === 'function' ? fn : null;
    },
    /** للاختبارات: بديل العملية الفرعية (type, input) → result (null = fork الحقيقي) */
    setChildRunner(fn) {
      childRunner = typeof fn === 'function' ? fn : null;
    },
    /** سبب عدم التنظيف على الخادم (null = مؤهل) */
    autoCleanBlock,

    /**
     * documents.save (داخل معاملة الحفظ): مهام المستند الجديد. لا شيء قبل استماع الخادم (البذور، L12-69).
     * صورة عميل بلا ماسح ← تنظيف على الخادم (L12-21)؛ صورة أو PDF ← قراءة النص (MD-10).
     */
    onSaved(docId, { mime, scanned = false, tooLarge = false, uploaderKind = null } = {}) {
      if (!live()) return;
      try {
        if (uploaderKind === 'client' && !scanned && !tooLarge && AUTO_CLEAN_MIMES.has(mime) && app.settings.get('scan_server_auto') !== false) svc.enqueue('clean', docId);
        if (OCR_MIMES.has(mime) && !tooLarge && svc.ocrProvider?.() !== 'off') svc.enqueue('ocr', docId);
      } catch (e) {
        app.log('media: enqueue on save failed', e);
      }
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

    /**
     * فقرات الخصوصية (M §10، L12-62، MD-11) في §7 من /privacy: نص ثابت تختاره الإعدادات (لا مدخلات مستخدم إلا اسم
     * المزوّد مهرّبًا). الأفراد والشركات بصيغة الجمع، و«خيري» بالمخاطَب المفرد كبقية الصفحة.
     *  • تحويل الصوت: جهة خارجية (باسمها، «وقد تُعالج خارج مصر») أو خادم المكتب؛ لا فقرة والتحويل متوقف، ولا فقرة جهة خارجية
     *    في صفحة «خيري» ما لم يُفعَّل تحويل صوت المستفيدات عندها (stt_charity_third_party).
     *  • المستندات: دائمًا، وجملة Claude حين يُسمح بإرسال صور المستندات إليه (ocr_claude_allowed).
     */
    privacyHtml(side = 'paid') {
      const paid = side === 'paid';
      const out = [];
      const st = app.stt?.settings?.() || {};
      const provider = String(st.provider || 'off');
      if (provider !== 'off' && app.stt?.configured?.()) {
        const third = app.stt.isThirdParty();
        const lawyer = paid
          ? 'ولا يطّلع المحامي على هذا النص الآلي، ولا على تسجيلاتكم إلا إذا أتاحها له فريقنا لدراسة موضوعكم.'
          : 'ولا يطّلع المحامي على هذا النص الآلي، ولا على تسجيلاتك إلا إذا أتاحها له فريقنا لدراسة موضوعك.';
        if (third && (paid || app.settings.get('stt_charity_third_party') === true)) {
          const vendor = escHtml(String(st.vendorName || '').trim().slice(0, 60));
          const who = vendor ? `جهة تقنية خارجية (<bdi>${vendor}</bdi>)` : 'جهة تقنية خارجية';
          out.push(
            `<p data-tag="PV-01"><strong>تحويل الرسائل الصوتية إلى نص.</strong> ${paid ? 'عندما ترسلون لنا رسالة صوتية' : 'عندما ترسل لنا رسالة صوتية'}، قد نستعين بخدمة تحويل الكلام إلى نص تقدّمها ${who}، وقد تُعالج خارج مصر، ${paid ? 'لنكتب ما قلتموه بسرعة' : 'لنكتب ما قلته بسرعة'}. يُرسل التسجيل إليها لهذا الغرض وحده، ولا يُستخدم في تدريب نماذجها، ويراجع فريقنا النص قبل الاعتماد عليه. ${lawyer}</p>`,
          );
        } else if (!third) {
          out.push(
            `<p data-tag="PV-02"><strong>تحويل الرسائل الصوتية إلى نص.</strong> ${paid ? 'عندما ترسلون لنا رسالة صوتية' : 'عندما ترسل لنا رسالة صوتية'}، نحوّل الرسالة الصوتية إلى نص على أجهزة يملكها المكتب، دون إرسالها إلى أي جهة خارجية، ويراجع فريقنا النص قبل الاعتماد عليه. ${lawyer}</p>`,
          );
        }
      }
      const read = app.settings.get('ocr_claude_allowed') === true
        ? '<span data-tag="PV-04">وقد نستعين في قراءة النص بأداة الذكاء الاصطناعي <bdi dir="ltr">Claude</bdi> من شركة <bdi dir="ltr">Anthropic</bdi>، فتُرسل صورة المستند إليها لهذا الغرض وحده ولا تُستخدم في تدريب نماذجها.</span>'
        : 'وتتم هذه القراءة على خوادمنا.';
      out.push(
        `<p data-tag="PV-03"><strong>تحسين صور المستندات وقراءتها.</strong> ${paid ? 'عندما ترسلون صورة مستند' : 'عندما ترسل صورة مستند'}، نقصّ حوافها ونعدّل إضاءتها لتصبح واضحة، ونحتفظ بالصورة الأصلية ${paid ? 'كما أرسلتموها' : 'كما أرسلتها'}. وقد نستخرج النص المكتوب في المستند آليًا ليسهل علينا البحث فيه، ${read}</p>`,
      );
      return out.join('\n');
    },
    /** سطر حذف البيانات (M §10) لصفحة /data-deletion */
    deletionHtml(side = 'paid') {
      const your = side === 'paid' ? 'كم' : 'ك';
      return `<p data-tag="DD-01">ويشمل الحذف النسخ المحسّنة من صور مستندات${your} والنصوص المستخرجة منها ونصوص رسائل${your} الصوتية.</p>`;
    },

    /**
     * H-M2 (MD-4، L12-61، L12-73): تنزيل نسخة من مستند لمن يملك الوصول إليه (canAccess عند المستدعي).
     * file ∈ display (الافتراضي: ما يعرضه display_file_id) | main | clean | original، page ≥ 1. لا يُحل إلا
     * WHERE document_id = doc.id، وغير الموجود 404. كل JPEG للمحامي بلا EXIF/XMP، والملف المخزّن كما هو.
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
        // نسخة الخادم الآلية لا تدخل النسخ الاحتياطية (H-M10): بعد استعادة نسخة يُعرض الأصل حتى يعيدها الاستكمال
        if (variant && variant.source === 'server_auto' && !fs.existsSync(path.resolve(uploadsDir, variant.storage_key))) variant = null;
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
      // L12-73 (مراجعة 12.0): كل JPEG يصل لمحامٍ بلا EXIF/GPS، لا الأصل المطلوب بـ ?file=original وحده: صورة عميل لم تمر
      // بالماسح هي نفسها «الأصل» وتُنزَّل افتراضيًا. النسخ المحسّنة بلا بيانات وصفية أصلًا، والملف المخزّن وبصمته كما هما.
      app.documents.send(res, doc, { inline, variant, strip, forLawyer: user?.role === 'lawyer' }); // v12 gate fixer-server (SEC-8)
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
          params: pr ? { mode: pr.mode ?? null, score: pr.score ?? null, partial: !!pr.partial, adjusted: !!pr.adjusted, turns: pr.turns ?? 0, reencoded: !!pr.reencoded } : null,
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

    /** طريقة القراءة المضبوطة: auto | tesseract | claude | off */
    ocrProvider() {
      const p = String(app.settings.get('ocr_provider') || 'auto');
      return OCR_PROVIDERS.includes(p) ? p : 'auto';
    },

    /**
     * GET /api/admin/documents/:id/text (للفريق فقط، L12-17): النص المقروء آليًا صفحةً صفحة + ما يمكن طلبه.
     * سجل الأمان document.text_viewed (info).
     */
    textOf(docId, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      const pages = db
        .all('SELECT page, text, provider, model, confidence, chars, status, corrected_by, updated_at FROM document_text WHERE document_id = ? ORDER BY page', doc.id)
        .map((r) => ({ page: r.page, text: r.text, provider: r.provider, provider_label: OCR_SOURCE_LABELS[r.provider] || r.provider, model: r.model, confidence: r.confidence, chars: r.chars, status: r.status, updated_at: r.updated_at }));
      const job = db.get("SELECT state, error, provider, next_page, updated_at FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", doc.id) || null;
      app.audit.log({ actor: user, ctx, type: 'document.text_viewed', severity: 'info', summary: `عرض النص المستخرج من المستند «${doc.title || doc.filename}»`, data: { document_id: doc.id, pages: pages.length } });
      const readable = OCR_MIMES.has(doc.mime) && doc.scan_state !== 'skipped';
      return {
        document_id: doc.id,
        state: doc.ocr_state || null,
        job: job ? { state: job.state, error: job.error, provider: job.provider, page: job.next_page ?? null } : null,
        pages,
        can_read: readable && svc.ocrProvider() !== 'off',
        can_claude: readable && !claudeBlock(doc, { priority: 0 }),
        claude_reason: readable ? claudeBlock(doc, { priority: 0 }) : 'unsupported',
        label: OCR_LABEL,
      };
    },

    /** PUT /api/admin/documents/:id/text/:page (P1): تصحيح الفريق ← status = 'corrected'، يُسجَّل document.text_corrected */
    correctText(docId, pageRaw, body, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      const page = Number(pageRaw);
      if (!Number.isInteger(page) || page < 1 || page > 100) throw notFound('الصفحة غير موجودة');
      const row = db.get('SELECT * FROM document_text WHERE document_id = ? AND page = ?', doc.id, page);
      if (!row) throw notFound('لا يوجد نص مقروء لهذه الصفحة');
      const text = typeof body?.text === 'string' ? body.text.replace(/\r\n/g, '\n') : null;
      if (text === null) throw badRequest('النص مطلوب', { fields: { text: 'مطلوب' } });
      if (text.length > OCR_TEXT_MAX) throw badRequest('النص أطول من المسموح (50,000 حرف)', { fields: { text: 'طويل' } });
      const norm = normalizeArabic(text);
      const t = nowIso();
      db.tx(() => {
        db.run("UPDATE document_text SET text = ?, norm = ?, chars = ?, status = 'corrected', corrected_by = ?, updated_at = ? WHERE document_id = ? AND page = ?", text, norm, text.length, user?.id ?? null, t, doc.id, page);
        ftsWrite(doc.id, page, norm);
        if (text.trim()) db.run("UPDATE documents SET ocr_state = 'done' WHERE id = ?", doc.id);
      });
      app.audit.log({ actor: user, ctx, type: 'document.text_corrected', summary: `تصحيح النص المستخرج من الصفحة ${page} في المستند «${doc.title || doc.filename}»`, data: { document_id: doc.id, page, chars: text.length } });
      return { page, status: 'corrected', chars: text.length, updated_at: t };
    },

    /**
     * POST /api/admin/documents/:id/ocr { provider?: 'tesseract' | 'claude' } (30 في الساعة): قراءة الآن بأولوية الفريق.
     * Claude فقط حين يسمح الإعداد وشروطه (L12-19). سجل الأمان document.ocr_requested.
     */
    requestOcr(docId, body, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      if (!OCR_MIMES.has(doc.mime) || doc.scan_state === 'skipped') throw badRequest('قراءة النص للصور وملفات PDF فقط');
      const provider = body?.provider === undefined || body?.provider === null || body?.provider === '' ? null : String(body.provider);
      if (provider !== null && provider !== 'tesseract' && provider !== 'claude') throw badRequest('طريقة القراءة غير معروفة', { fields: { provider: 'tesseract | claude' } });
      if (svc.ocrProvider() === 'off' && provider !== 'claude') throw new ApiError(409, 'قراءة نص المستندات متوقفة من «الإعدادات».', 'ocr_off');
      if (provider === 'claude') {
        const why = claudeBlock(doc, { priority: 10 });
        if (why) throw new ApiError(409, CLAUDE_BLOCK_TEXT[why] || 'القراءة بـ Claude غير متاحة لهذا المستند.', `claude_${why}`);
      }
      const jobId = svc.enqueue('ocr', doc.id, { priority: 10, requestedBy: user?.id ?? null, provider });
      app.audit.log({ actor: user, ctx, type: 'document.ocr_requested', summary: `طلب قراءة نص المستند «${doc.title || doc.filename}»${provider === 'claude' ? ' بـ Claude' : ''}`, data: { document_id: doc.id, provider, job_id: jobId } });
      return { queued: jobId !== null, running: jobId === null, job_id: jobId };
    },

    /** POST /api/admin/documents/:id/rescan: إعادة التنظيف الآلي (لصور العملاء المؤهلة) والقراءة. media.job_requested */
    rescan(docId, user, ctx = null) {
      const doc = app.documents.get(docId);
      if (!doc) throw notFound('المستند غير موجود');
      const kinds = [];
      if (!autoCleanBlock(doc) && app.settings.get('scan_server_auto') !== false) {
        svc.enqueue('clean', doc.id, { priority: 10, requestedBy: user?.id ?? null });
        kinds.push('clean');
      }
      if (OCR_MIMES.has(doc.mime) && doc.scan_state !== 'skipped' && svc.ocrProvider() !== 'off') {
        svc.enqueue('ocr', doc.id, { priority: 10, requestedBy: user?.id ?? null });
        kinds.push('ocr');
      }
      if (!kinds.length) throw new ApiError(409, 'لا توجد معالجة متاحة لهذا المستند الآن.', 'nothing_to_do');
      app.audit.log({ actor: user, ctx, type: 'media.job_requested', summary: `طلب إعادة معالجة المستند «${doc.title || doc.filename}»`, data: { document_id: doc.id, kinds } });
      return { queued: kinds };
    },

    /**
     * بحث الفريق في النص المقروء آليًا (H-M7، L12-37): q من 3 إلى 100 حرف، عبارة مقتبسة في FTS5 (trigram) وإلا LIKE
     * بـ ESCAPE؛ 10 نتائج على الأكثر، مستندات موجودة فقط، ومقتطف ≤ 120 حرفًا. للفريق فقط (لا بحث للمحامي، L12-17).
     */
    searchStaff(qRaw) {
      const q = String(qRaw ?? '').trim();
      if (q.length < 3 || q.length > 100) return [];
      const nq = normalizeArabic(q).replace(/\s+/g, ' ').trim();
      if (nq.replace(/\s/g, '').length < 3) return [];
      const cols = 't.document_id, t.page, t.text, d.title, d.filename, d.intake_id, d.case_id, d.matter_id, d.company_request_id';
      let rows = null;
      if (ftsOk) {
        try {
          rows = db.all(
            `SELECT ${cols} FROM document_text_fts f JOIN document_text t ON t.document_id = f.document_id AND t.page = f.page
             JOIN documents d ON d.id = f.document_id WHERE document_text_fts MATCH ? ORDER BY d.id DESC, t.page LIMIT 10`,
            '"' + nq.replace(/"/g, '""') + '"',
          );
        } catch {
          rows = null;
        }
      }
      if (rows === null) {
        const like = '%' + nq.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
        rows = db.all(`SELECT ${cols} FROM document_text t JOIN documents d ON d.id = t.document_id WHERE t.norm LIKE ? ESCAPE '\\' ORDER BY d.id DESC, t.page LIMIT 10`, like);
      }
      return rows.map((r) => ({
        id: r.document_id,
        title: r.title || r.filename,
        page: r.page,
        snippet: snippetOf(r.text, nq),
        href: r.intake_id ? `#/inbox/${r.intake_id}` : r.case_id ? `#/cases/${r.case_id}` : r.matter_id ? `#/matters/${r.matter_id}` : r.company_request_id ? `#/company-requests/${r.company_request_id}` : null,
      }));
    },

    /**
     * تنبيهات «صحة النظام» (H-M10، MD-11): ذاكرة الخادم < 1 جيجابايت (SYS-09)، المرفقات × (عدد النسخ الاحتياطية + 1) > 70 %
     * من القرص (SYS-10)، وImageMagick مثبت بلا السياسة المرفقة. → [{ key, level, title, detail, href }]
     */
    healthChecks() {
      const out = [];
      try {
        const m = svc.memory();
        if (Number(m.limit) > 0 && Number(m.limit) < MEMORY_SLOW_BELOW) {
          out.push({ key: 'media_memory', level: 'warning', title: 'ذاكرة الخادم أقل من 1 جيجابايت: تنظيف الصور وقراءتها أبطأ', detail: 'تعمل المعالجة صورةً صورة ولا تبدأ إلا مع 300 ميجابايت متاحة على الأقل، فتتأخر عند الضغط. خادم بذاكرة 1 جيجابايت أو أكثر يكفي.', href: null });
        }
      } catch (e) {
        app.log('media health: memory', e);
      }
      try {
        const now = Date.now();
        if (!diskEstimate || now - diskEstimate.at > 10 * 60 * 1000) {
          let bytes = 0;
          const stack = [uploadsDir];
          while (stack.length) {
            const dir = stack.pop();
            let ents = [];
            try {
              ents = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
              continue;
            }
            for (const e of ents) {
              const abs = path.join(dir, e.name);
              if (e.isDirectory()) {
                if (path.relative(uploadsDir, abs) !== path.join('variants', 'auto')) stack.push(abs); // نسخ الخادم الآلية لا تُنسخ احتياطيًا
              } else if (e.isFile()) {
                try {
                  bytes += fs.statSync(abs).size;
                } catch {
                  // حُذف للتو
                }
              }
            }
          }
          let total = null;
          try {
            const st = fs.statfsSync(config.dataDir || path.dirname(config.dbPath));
            total = Number(st.blocks) * Number(st.bsize);
          } catch {
            total = null;
          }
          diskEstimate = { at: now, bytes, total };
        }
        const retention = Number(app.settings.get('backup_retention')) || 14;
        if (diskEstimate.total && diskEstimate.bytes * (retention + 1) > 0.7 * diskEstimate.total) {
          out.push({ key: 'media_disk', level: 'warning', title: 'النسخ الاحتياطية قد تملأ القرص: انقل إلى قرص 10 جيجابايت أو قلّل مدة الاحتفاظ إلى 7 أيام.', detail: 'المرفقات مضروبة في عدد النسخ الاحتياطية المحفوظة تتجاوز 70 % من مساحة القرص.', href: '#/system' });
        }
      } catch (e) {
        app.log('media health: disk', e);
      }
      // K-M2 (gate): قراءة النص مفعّلة لكن Tesseract (أو لغته العربية) غير موجود ← تنبيه صريح بطريقة الإصلاح. الفحص كسول:
      // إن لم تُفحص الأدوات بعد في هذه العملية يبدأ الفحص في الخلفية فيظهر التنبيه في التحديث التالي.
      const st = tools.status();
      if (!st && !process.env.NODE_TEST_CONTEXT) tools.probe().catch(() => {});
      const ts = st?.tesseract;
      if (ts && !ts.ok && ts.reason !== 'disabled' && svc.ocrProvider() !== 'off') {
        out.push({
          key: 'media_ocr_tool',
          level: 'warning',
          title: ts.reason === 'no_ara' ? 'Tesseract مثبت بلا اللغة العربية: لا يُقرأ نص المستندات' : 'Tesseract غير مثبت على الخادم: لا يُقرأ نص المستندات',
          detail:
            'الصور وملفات PDF الممسوحة تُحفظ وتُعرض كالمعتاد، لكن نصها لا يُقرأ ولا يظهر في البحث. صورة Docker تثبّته (MEDIA_TOOLS=1، الافتراضي)؛ وعلى خادم بلا Docker: apt-get install tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng tesseract-ocr-script-arab ثم «افحص الأدوات» و«نظّف واقرأ المستندات القديمة».',
          href: null,
        });
      }
      const im = st?.imagemagick;
      if (im && im.bin && !im.ok && im.reason === 'policy') {
        out.push({ key: 'media_policy', level: 'warning', title: 'ImageMagick مثبت لكن سياسة الأمان المرفقة غير مفعّلة', detail: 'لا تُنظَّف صور واتساب على الخادم حتى تُنسخ deploy/imagemagick/policy.xml إلى /etc/ImageMagick-6/policy.xml (صورة Docker تفعل ذلك). «نظّف المستند» في المتصفح يعمل.', href: null });
      }
      return out;
    },

    /**
     * GET /api/admin/media/status (مدير النظام، P1): يفحص الأدوات (مرة لكل عملية، أو من جديد مع probe) ثم الحالة.
     * سجل الأمان media.status_viewed (info).
     */
    async statusFor(user, ctx = null, { probe = false } = {}) {
      await tools.probe({ force: !!probe });
      const st = svc.status();
      const m = svc.memory();
      app.audit.log({ actor: user, ctx, type: 'media.status_viewed', severity: 'info', summary: probe ? 'فحص أدوات المستندات والصوت على الخادم' : 'عرض حالة معالجة المستندات والصوت', data: { probe: !!probe } });
      return { ...st, memory: { limit_bytes: m.limit, headroom_bytes: m.headroom, source: m.source }, ocr_provider: svc.ocrProvider(), scan_server_auto: app.settings.get('scan_server_auto') !== false };
    },

    /**
     * POST /api/admin/media/backfill { kind: 'stt' | 'clean' | 'ocr', days ≤ 90 } (مدير النظام، P1، 5 في اليوم):
     * الأحدث أولًا بأولوية −5. تحويل الصوت: رسائل العملاء من آخر days يومًا، وعند جهة خارجية من تاريخ الإعلان فقط
     * (L12-62). التنظيف: صور العملاء المؤهلة (ومنها نسخ الخادم التي لم تعد على القرص بعد استعادة نسخة احتياطية). القراءة:
     * الصور وملفات PDF بلا نص. الاستكمال لا يستخدم Claude أبدًا. سجل الأمان media.backfill_queued (warning).
     */
    backfill(body, user, ctx = null) {
      const kind = String(body?.kind || '');
      if (!JOB_KINDS.includes(kind)) throw badRequest('اختر نوع الاستكمال', { fields: { kind: 'stt | clean | ocr' } });
      const days = body?.days === undefined ? (kind === 'stt' ? 30 : 90) : Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 90) throw badRequest('عدد الأيام من 1 إلى 90', { fields: { days: '1–90' } });
      let since = new Date(Date.parse(nowIso()) - days * 86400000).toISOString();
      let rows = [];
      if (kind === 'stt') {
        if (!app.stt?.configured?.()) throw new ApiError(409, 'تحويل الرسائل الصوتية إلى نص غير مضبوط. اضبطه من «التكاملات».', 'stt_off');
        const disclosed = String(app.settings.get('stt_third_party_since') || '');
        if (app.stt.isThirdParty() && disclosed && disclosed > since) since = disclosed;
        rows = db.all(
          `SELECT d.id FROM documents d WHERE d.uploaded_by_kind = 'client' AND d.mime LIKE 'audio/%' AND d.created_at >= ?
             AND NOT EXISTS (SELECT 1 FROM voice_auto_transcripts a WHERE a.document_id = d.id AND a.state = 'done')
             AND NOT EXISTS (SELECT 1 FROM media_jobs j WHERE j.document_id = d.id AND j.kind = 'stt' AND j.state IN ('queued', 'running'))
           ORDER BY d.id DESC LIMIT 500`,
          since,
        );
        rows = rows.filter((r) => {
          const pol = app.stt.policy?.(app.documents.get(r.id)) || {};
          return !['charity', 'before_disclosure', 'mime', 'too_big', 'too_long'].includes(pol.reason);
        });
      } else if (kind === 'clean') {
        if (app.settings.get('scan_server_auto') === false) throw new ApiError(409, 'تحسين الصور على الخادم متوقف من «الإعدادات».', 'clean_off');
        // نسخ الخادم الآلية التي لم تعد على القرص (لا تدخل النسخ الاحتياطية، H-M10): تُحذف صفوفها ثم يعاد التنظيف
        for (const f of db.all("SELECT f.id, f.document_id, f.storage_key FROM document_files f JOIN documents d ON d.id = f.document_id WHERE f.source = 'server_auto' AND d.created_at >= ?", since)) {
          if (fs.existsSync(path.resolve(uploadsDir, f.storage_key))) continue;
          db.tx(() => {
            db.run('UPDATE documents SET display_file_id = NULL WHERE id = ? AND display_file_id = ?', f.document_id, f.id);
            db.run('DELETE FROM document_files WHERE id = ?', f.id);
            if (!db.get("SELECT 1 FROM document_files WHERE document_id = ? AND role = 'clean'", f.document_id)) db.run("UPDATE documents SET scan_state = NULL WHERE id = ? AND scan_state = 'server'", f.document_id);
          });
        }
        rows = db
          .all("SELECT * FROM documents WHERE uploaded_by_kind = 'client' AND mime IN ('image/jpeg', 'image/png', 'image/webp') AND scan_state IS NULL AND created_at >= ? ORDER BY id DESC LIMIT 500", since)
          .filter((d) => !autoCleanBlock(d));
      } else {
        if (svc.ocrProvider() === 'off') throw new ApiError(409, 'قراءة نص المستندات متوقفة من «الإعدادات».', 'ocr_off');
        rows = db.all(
          `SELECT d.id FROM documents d WHERE d.mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') AND COALESCE(d.scan_state, '') != 'skipped'
             AND d.created_at >= ? AND NOT EXISTS (SELECT 1 FROM document_text t WHERE t.document_id = d.id)
           ORDER BY d.id DESC LIMIT 500`,
          since,
        );
      }
      let queued = 0;
      for (const r of rows) if (svc.enqueue(kind, r.id, { priority: -5, requestedBy: user?.id ?? null, provider: kind === 'ocr' ? 'tesseract' : null }) !== null) queued += 1;
      app.audit.log({ actor: user, ctx, type: 'media.backfill_queued', severity: 'warning', summary: `استكمال ${BACKFILL_LABELS[kind]} لآخر ${days} يومًا: ${queued} مستند`, data: { kind, days, since, queued } });
      return { kind, days, since, queued };
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
      for (const c of childProcs) killChild(c);
      childProcs.clear();
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
  // MD-9: تنظيف صور العملاء التي لم تمر بماسح الهاتف (وحدة = صورة واحدة في عملية فرعية)
  svc.registerHandler('clean', (job) => cleanUnit(job));
  // MD-10: قراءة النص (وحدة = صفحة واحدة)
  svc.registerHandler('ocr', (job) => ocrUnit(job));

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
