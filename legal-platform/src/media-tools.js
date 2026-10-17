// v12 media: الأدوات الاختيارية على الخادم (ImageMagick لفك الصور وترميزها، Tesseract لقراءة النص، poppler للـ PDF).
// لا اعتمادية تشغيل: كل أداة تُفحص مرة واحدة عند أول حاجة (L12-69) وتعمل المنصة بدونها (تحسين في المتصفح، بلا قراءة نص).
// التشغيل مقوّى (L12-66، L12-68): execFile بمصفوفة وسائط (لا shell أبدًا)، مسار ثنائي مطلق، killSignal SIGKILL، مهلة،
// بيئة دنيا (لا APP_SECRET ولا مفاتيح ولا كلمة مرور SMTP)، cwd = مجلد مؤقت خاص 0700 خارج uploadsDir، أولوية 19، oom_score_adj 1000.
// ImageMagick لا يُستخدم إلا إذا أظهر «convert -list policy» قاعدة منع كل الصيغ (deploy/imagemagick/policy.xml): يفشل مغلقًا.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as nodeExecFile } from 'node:child_process';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

/** الأدوات التي تُفحص، ومتغير البيئة الذي يحدد مسارها المطلق (للاختبارات أو مسار غير قياسي) */
export const TOOLS = {
  imagemagick: { env: 'IMAGEMAGICK_BIN', names: ['convert', 'magick'] },
  tesseract: { env: 'TESSERACT_BIN', names: ['tesseract'] },
  pdftotext: { env: 'PDFTOTEXT_BIN', names: ['pdftotext'] },
  pdftoppm: { env: 'PDFTOPPM_BIN', names: ['pdftoppm'] },
  pdfinfo: { env: 'PDFINFO_BIN', names: ['pdfinfo'] },
};
const SEARCH_DIRS = ['/usr/bin', '/usr/local/bin', '/bin'];

/** المفاتيح الوحيدة في بيئة أي أداة نشغّلها (اختبار L12-68 يتحقق منها) */
export const SPAWN_ENV_KEYS = ['PATH', 'LANG', 'OMP_THREAD_LIMIT', 'MAGICK_TEMPORARY_PATH', 'MAGICK_CONFIGURE_PATH'];

/** مجلد سياسة ImageMagick المرفقة بالمنصة */
export const POLICY_DIR = path.resolve(SRC_DIR, '..', 'deploy', 'imagemagick');

/** حدود ImageMagick لكل تشغيل (L12-66؛ السياسة المرفقة تحمل القيم نفسها) */
export const IM_LIMITS = [
  '-limit', 'memory', '48MiB',
  '-limit', 'map', '96MiB',
  '-limit', 'disk', '512MiB',
  '-limit', 'area', '40MP',
  '-limit', 'width', '12000',
  '-limit', 'height', '12000',
  '-limit', 'thread', '1',
  '-limit', 'time', '60',
];

/** بادئة الصيغة لكل مدخل من النوع المتحقق منه (L12-68)؛ HEIC لا يُعطى لـ ImageMagick أبدًا */
export const CODER_FOR_MIME = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

/** قاعدة «امنع كل الصيغ» كما يطبعها convert -list policy */
export const DENY_ALL_CODER_RE = /Policy:\s*Coder\s*\n\s*rights:\s*None\s*\n\s*pattern:\s*\*\s*(?:\n|$)/;

const OFF_VALUES = new Set(['off', '0', 'false', 'no']);

/**
 * وضع الأدوات: 'off' (MEDIA_TOOLS=off)، 'on' (MEDIA_TOOLS=on)، 'test' (تحت node --test: لا أداة إلا ما حُدد مساره بـ *_BIN)،
 * أو 'auto' (تُبحث في /usr/bin و/usr/local/bin و/bin).
 */
export function toolsMode(env = process.env) {
  const v = String(env.MEDIA_TOOLS || '').trim().toLowerCase();
  if (OFF_VALUES.has(v)) return 'off';
  if (v === 'on') return 'on';
  if (env.NODE_TEST_CONTEXT) return 'test';
  return 'auto';
}

function isExecutable(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** المسار المطلق للأداة أو { reason } */
export function resolveBin(tool, env = process.env, mode = toolsMode(env)) {
  const spec = TOOLS[tool];
  if (!spec) return { bin: null, reason: 'unknown' };
  if (mode === 'off') return { bin: null, reason: 'disabled' };
  const explicit = String(env[spec.env] || '').trim();
  if (explicit) {
    if (!path.isAbsolute(explicit)) return { bin: null, reason: 'bin_not_absolute' };
    return isExecutable(explicit) ? { bin: explicit, reason: null } : { bin: null, reason: 'bin_missing' };
  }
  if (mode === 'test') return { bin: null, reason: 'disabled' };
  for (const dir of SEARCH_DIRS) {
    for (const name of spec.names) {
      const f = path.join(dir, name);
      if (isExecutable(f)) return { bin: f, reason: null };
    }
  }
  return { bin: null, reason: 'missing' };
}

function firstLine(buf) {
  return String(buf || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, 160) || null;
}

/** أولوية منخفضة واستعداد للقتل أولًا عند نفاد الذاكرة (أفضل محاولة؛ لا تفشل التشغيل) */
export function deprioritize(pid) {
  if (!pid) return;
  try {
    os.setPriority(pid, 19);
  } catch {
    // غير مسموح في هذه البيئة
  }
  try {
    fs.writeFileSync(`/proc/${pid}/oom_score_adj`, '1000');
  } catch {
    // ليس Linux أو بلا صلاحية
  }
}

/**
 * @param {{ tmpDir: string, policyDir?: string, env?: object, execFileImpl?: Function, log?: Function }} opts
 */
export function createMediaTools({ tmpDir, policyDir = POLICY_DIR, env = process.env, execFileImpl = nodeExecFile, log = () => {} } = {}) {
  let cache = null;
  let probing = null;
  let curEnv = env;
  let execImpl = execFileImpl;
  const children = new Set();

  function spawnEnv() {
    return { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', OMP_THREAD_LIMIT: '1', MAGICK_TEMPORARY_PATH: tmpDir, MAGICK_CONFIGURE_PATH: policyDir };
  }

  /**
   * تشغيل أداة: bin مسار مطلق، argv مصفوفة (لا تُفسَّر في shell)، input (Buffer اختياري على stdin).
   * يرفض بخطأ فيه code = 'timeout' عند انتهاء المهلة (تُقتل العملية بـ SIGKILL).
   */
  function run(bin, argv, { input = null, timeoutMs = 60_000, maxBuffer = 64 * 1024 * 1024 } = {}) {
    if (!bin || !path.isAbsolute(bin)) return Promise.reject(Object.assign(new Error('tool path must be absolute'), { code: 'bin_not_absolute' }));
    if (!Array.isArray(argv) || argv.some((a) => typeof a !== 'string')) return Promise.reject(Object.assign(new Error('argv must be an array of strings'), { code: 'bad_argv' }));
    try {
      fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
    } catch {
      // يُبلَّغ عنه عند التشغيل
    }
    return new Promise((resolve, reject) => {
      let child;
      const opts = { shell: false, cwd: tmpDir, env: spawnEnv(), timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer, encoding: 'buffer', windowsHide: true };
      try {
        child = execImpl(bin, argv, opts, (err, stdout, stderr) => {
          children.delete(child);
          if (err) {
            if (err.killed && err.signal === 'SIGKILL') err.code = 'timeout';
            err.stdout = stdout;
            err.stderr = stderr;
            return reject(err);
          }
          resolve({ stdout: stdout ?? Buffer.alloc(0), stderr: stderr ?? Buffer.alloc(0) });
        });
      } catch (e) {
        return reject(e);
      }
      if (child) {
        children.add(child);
        deprioritize(child.pid);
        if (child.stdin) {
          child.stdin.on('error', () => {});
          if (input) child.stdin.end(input);
          else child.stdin.end();
        }
      }
    });
  }

  async function version(bin, args) {
    try {
      const r = await run(bin, args, { timeoutMs: 10_000, maxBuffer: 1024 * 1024 });
      return firstLine(r.stdout) || firstLine(r.stderr);
    } catch (e) {
      // pdftotext -v في إصدارات قديمة يخرج بغير صفر مع طباعة الإصدار
      return firstLine(e.stderr) || firstLine(e.stdout) || null;
    }
  }

  async function probeTool(tool, mode) {
    const { bin, reason } = resolveBin(tool, curEnv, mode);
    if (!bin) return { ok: false, bin: null, version: null, reason };
    if (tool === 'imagemagick') {
      const ver = await version(bin, ['-version']);
      if (!ver) return { ok: false, bin, version: null, reason: 'no_version' };
      let policyOk = false;
      try {
        const r = await run(bin, ['-list', 'policy'], { timeoutMs: 10_000, maxBuffer: 1024 * 1024 });
        policyOk = DENY_ALL_CODER_RE.test(String(r.stdout || '') + '\n' + String(r.stderr || ''));
      } catch {
        policyOk = false;
      }
      return { ok: policyOk, bin, version: ver, policy: policyOk, reason: policyOk ? null : 'policy' };
    }
    if (tool === 'tesseract') {
      const ver = await version(bin, ['--version']);
      if (!ver) return { ok: false, bin, version: null, langs: [], ara: false, reason: 'no_version' };
      let langs = [];
      try {
        const r = await run(bin, ['--list-langs'], { timeoutMs: 10_000, maxBuffer: 1024 * 1024 });
        langs = String(r.stdout || '')
          .split('\n')
          .slice(1)
          .map((l) => l.trim())
          .filter((l) => /^(?:script\/)?[A-Za-z_]{2,20}$/.test(l)); // V-14: نموذج الخط العربي script/Arabic في بعض التوزيعات
      } catch {
        langs = [];
      }
      const ara = langs.includes('ara');
      return { ok: ara, bin, version: ver, langs, ara, reason: ara ? null : 'no_ara' };
    }
    const ver = await version(bin, ['-v']);
    return ver ? { ok: true, bin, version: ver, reason: null } : { ok: false, bin, version: null, reason: 'no_version' };
  }

  const tools = {
    TOOLS,
    spawnEnv,
    run,

    /** فحص الأدوات (مرة واحدة لكل عملية، أو من جديد مع force) */
    async probe({ force = false } = {}) {
      if (cache && !force) return cache;
      if (probing) return probing;
      probing = (async () => {
        const mode = toolsMode(curEnv);
        const out = { mode, probed_at: new Date().toISOString() };
        for (const tool of Object.keys(TOOLS)) {
          try {
            out[tool] = await probeTool(tool, mode);
          } catch (e) {
            out[tool] = { ok: false, bin: null, version: null, reason: 'probe_failed' };
            log(`media tools: probe ${tool} failed`, e);
          }
        }
        cache = out;
        return out;
      })();
      try {
        return await probing;
      } finally {
        probing = null;
      }
    },

    /** آخر نتيجة فحص أو null (بلا تشغيل) */
    status() {
      return cache;
    },
    has(tool) {
      return !!cache?.[tool]?.ok;
    },
    bin(tool) {
      return cache?.[tool]?.ok ? cache[tool].bin : null;
    },

    /** للاختبارات: بيئة أخرى أو منفّذ بديل، ويُعاد الفحص عند أول حاجة */
    configure({ env: nextEnv, execFileImpl: nextExec } = {}) {
      if (nextEnv) curEnv = nextEnv;
      if (nextExec) execImpl = nextExec;
      cache = null;
    },

    /** إيقاف كل عملية جارية (إغلاق التطبيق) */
    killAll() {
      for (const c of children) {
        try {
          c.kill('SIGKILL');
        } catch {
          // انتهت بالفعل
        }
      }
      children.clear();
    },
    running() {
      return children.size;
    },
  };
  return tools;
}
