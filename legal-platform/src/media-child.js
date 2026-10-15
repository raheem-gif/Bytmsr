// v12 media (MD-9، L12-66…L12-68): تنظيف صورة واحدة على الخادم في عملية فرعية معزولة (scan-core بعيدًا عن عملية الويب).
// تُشغَّل بـ child_process.fork من src/services/media.js مع --max-old-space-size=128 وبيئة دنيا (لا أسرار) وأولوية 19
// وoom_score_adj 1000، وحدة واحدة لكل عملية ثم تُقتل. لا تفعل شيئًا إذا استوردها أحد (الاختبارات تستورد الدوال الخالصة):
// تعمل فقط حين شغّلها media.js (BM_MEDIA_CHILD=1 وقناة IPC).
//
// البروتوكول: الأب يرسل { id, type: 'clean', input } ويستقبل { id, ok: true, result } أو { id, ok: false, code, message }.
// input: { file (مسار مطلق داخل uploads)، mime، width، height (الأبعاد بعد اتجاه EXIF، من الترويسة)، orientation، bin (convert
//          بمسار مطلق)، tmpDir، policyDir، out (مسار ملف الناتج داخل المجلد المؤقت) }
// result: { skipped: السبب، score? } أو { out، width، height، bytes، params: { quad، score، area، chroma، ink، turns } }
//
// الخط (spike server-scan.mjs بعد مراجعة الأمن والأداء): فك متتابع (لا متوازٍ) بثلاثة أحجام 480 ثم 1200 ثم 2000 بحد أقصى
// (-define jpeg:size = ضعف المطلوب، -auto-orient، -resize بلا «!» ثم التحقق من الحجم الناتج: اتجاه خاطئ يغيّر الحجم)،
// detectQuad، البوابة (درجة ≥ 0.60، ليست مقطوعة، داخلها ورق: وسيط التشبع ≤ 55 ونسبة الحبر بعد التنظيف 1–35 %)، warp،
// enhance('auto')، uprightTurns، ثم ترميز JPEG بجودة 72 (jpeg:- على الخرج). ImageMagick للفك والترميز فقط.
import fs from 'node:fs';
import { detectQuad, pageSize, warp, enhance, grayOf, uprightTurns, rotate, quadFraction } from '../public/assets/js/lib/scan-core.js';
import { createMediaTools, IM_LIMITS, CODER_FOR_MIME } from './media-tools.js';

export const WORK_SIDE = 480;
export const FINE_SIDE = 1200;
export const SOURCE_SIDE = 2000;
/** أكبر صورة ينظفها الخادم (L12-67): أكبر من ذلك تُترك لـ «نظّف المستند» في المتصفح */
export const SERVER_CLEAN_MAX_PIXELS = 24_000_000;
/** بوابة الثقة (M12-27، L12-21): لا تُحفظ نسخة محسّنة لصورة ليست ورقة (باب، سيارة، وجه) */
export const GATE = { score: 0.6, chroma: 55, inkMin: 0.01, inkMax: 0.35 };

const codeError = (code, message = code) => Object.assign(new Error(message), { code });

/** أبعاد داخل مربع max مع الحفاظ على النسبة (نفس تقريب ImageMagick لـ -resize WxH) */
export function fitBox(W, H, max) {
  const s = Math.min(1, max / Math.max(W, H));
  return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))];
}

/**
 * وسائط فك صورة إلى RGBA بحجم w×h (بعد الاتجاه). بادئة الصيغة من النوع المتحقق منه (L12-68)، -define jpeg:size بالاتجاه
 * الخام (يسبق الاستدارة)، و-resize بلا «!» (L12-67): لو اختلف الاتجاه الفعلي عن الترويسة يخرج حجم آخر فيُرفض.
 */
export function decodeArgs({ file, mime, orientation = 1 }, w, h) {
  const coder = CODER_FOR_MIME[mime];
  if (!coder) throw codeError('unsupported', `no coder for ${mime}`);
  if (typeof file !== 'string' || !file.startsWith('/')) throw codeError('bad_input', 'input path must be absolute');
  const args = [...IM_LIMITS];
  if (coder === 'jpeg') {
    const swap = orientation >= 5 && orientation <= 8;
    const [rw, rh] = swap ? [h, w] : [w, h];
    args.push('-define', `jpeg:size=${2 * rw}x${2 * rh}`);
  }
  args.push(`${coder}:${file}`, '-auto-orient', '-resize', `${w}x${h}`, '-depth', '8', 'rgba:-');
  return args;
}

/** وسائط ترميز RGBA (من stdin) إلى JPEG على stdout، بلا بيانات وصفية */
export function encodeArgs(w, h, quality = 72) {
  return [...IM_LIMITS, '-size', `${w}x${h}`, '-depth', '8', 'rgba:-', '-quality', String(quality), '-sampling-factor', '4:2:0', '-strip', 'jpeg:-'];
}

/**
 * الحجم الفعلي لخرج RGBA: w×h أو جار بفارق بكسل واحد (تقريب). غير ذلك = اتجاه أو صورة غير متوقعة ← خطأ.
 */
export function rgbaSize(bytes, w, h) {
  if (bytes === w * h * 4) return [w, h];
  for (const dw of [0, -1, 1]) {
    for (const dh of [0, -1, 1]) {
      const W = w + dw;
      const H = h + dh;
      if (W > 0 && H > 0 && W * H * 4 === bytes) return [W, H];
    }
  }
  throw codeError('size_mismatch', `decoded ${bytes} bytes, expected ${w}x${h}`);
}

/** وسيط التشبع (max−min) على شبكة متفرقة: الورق رمادي/أبيض، والباب أو السيارة ملونة */
export function medianChroma(img) {
  const d = img.data;
  const step = Math.max(4, ((d.length / 4 / 20000) | 0) * 4);
  const vals = [];
  for (let i = 0; i < d.length; i += step) vals.push(Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
  if (!vals.length) return 255;
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}

/** نسبة «الحبر» بعد التنظيف (بكسلات داكنة): صفحة فارغة < 1 % وصورة غير ورقية > 35 % */
export function inkShare(img) {
  const d = img.data;
  const step = Math.max(4, ((d.length / 4 / 40000) | 0) * 4);
  let dark = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += step) {
    if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 128) dark++;
    n++;
  }
  return n ? dark / n : 0;
}

/**
 * خط التنظيف بمرمّز قابل للحقن (الاختبارات): codec.decode(w, h) → { width, height, data }، codec.encode(img) → Buffer.
 * input: { width, height } بعد الاتجاه. → { skipped, score? } أو { jpeg, width, height, params }
 */
export async function cleanPipeline(input, codec) {
  const W = Number(input.width);
  const H = Number(input.height);
  if (!(W > 0 && H > 0)) return { skipped: 'unknown_size' };
  if (W * H > SERVER_CLEAN_MAX_PIXELS) return { skipped: 'too_large' };
  const [ww, wh] = fitBox(W, H, WORK_SIDE);
  const work = await codec.decode(ww, wh);
  const [fw, fh] = fitBox(W, H, FINE_SIDE);
  let fine = await codec.decode(fw, fh);
  const det = detectQuad(work, { refine: { width: fine.width, height: fine.height, gray: grayOf(fine) } });
  fine = null;
  if (!det || !det.quad) return { skipped: 'no_paper', score: Number.isFinite(det?.score) ? Math.round(det.score * 1000) / 1000 : null };
  const score = Math.round(det.score * 1000) / 1000;
  if (det.score < GATE.score) return { skipped: 'uncertain', score };
  if (det.partial) return { skipped: 'partial', score };
  const area = quadFraction(det.quad, work.width, work.height);
  // داخل الشكل ورق؟ (على صورة العمل الصغيرة قبل التنظيف)
  const small = pageSize(det.quad, work.width, work.height, { maxSide: 240 });
  const chroma = medianChroma(warp(work, det.quad, small.w, small.h));
  if (chroma > GATE.chroma) return { skipped: 'not_paper', score };
  const [sw, sh] = fitBox(W, H, SOURCE_SIDE);
  let source = await codec.decode(sw, sh);
  const k = source.width / work.width;
  const quad = det.quad.map((p) => ({ x: p.x * k, y: p.y * k }));
  const size = pageSize(quad, source.width, source.height, { maxSide: SOURCE_SIDE });
  let clean = enhance(warp(source, quad, size.w, size.h), 'auto');
  source = null;
  const ink = inkShare(clean);
  if (ink < GATE.inkMin || ink > GATE.inkMax) return { skipped: 'not_paper', score };
  const turns = uprightTurns(clean);
  if (turns) clean = rotate(clean, turns);
  const jpeg = await codec.encode(clean);
  const r4 = (n) => Math.round(n * 10000) / 10000;
  return {
    jpeg,
    width: clean.width,
    height: clean.height,
    params: {
      quad: det.quad.map((p) => [r4(Math.min(1, Math.max(0, p.x / work.width))), r4(Math.min(1, Math.max(0, p.y / work.height)))]),
      score,
      area: r4(area),
      chroma,
      ink: r4(ink),
      turns,
    },
  };
}

/** المرمّز الحقيقي: ImageMagick بالأداة المقوّاة (argv، بيئة دنيا، مهلة 60 ثانية لكل تشغيل) */
export function imageMagickCodec(tools, input) {
  return {
    async decode(w, h) {
      const r = await tools.run(input.bin, decodeArgs(input, w, h), { timeoutMs: 60_000, maxBuffer: (w + 1) * (h + 1) * 4 + 1024 });
      const buf = r.stdout;
      const [W, H] = rgbaSize(buf.length, w, h);
      return { width: W, height: H, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length) };
    },
    async encode(img) {
      const input8 = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
      const r = await tools.run(input.bin, encodeArgs(img.width, img.height), { input: input8, timeoutMs: 60_000, maxBuffer: 32 * 1024 * 1024 });
      const out = r.stdout;
      if (!(out.length > 3 && out[0] === 0xff && out[1] === 0xd8 && out[2] === 0xff)) throw codeError('bad_output', 'encoder did not return a JPEG');
      return out;
    },
  };
}

let childTools = null;

const HANDLERS = {
  async clean(input) {
    if (!input || typeof input.out !== 'string' || !input.out.startsWith('/')) throw codeError('bad_input', 'output path must be absolute');
    childTools = createMediaTools({ tmpDir: input.tmpDir, policyDir: input.policyDir, env: {} });
    const res = await cleanPipeline(input, imageMagickCodec(childTools, input));
    if (res.skipped) return { skipped: res.skipped, score: res.score ?? null };
    fs.writeFileSync(input.out, res.jpeg, { mode: 0o600 });
    return { out: input.out, width: res.width, height: res.height, bytes: res.jpeg.length, params: res.params };
  },
};

function reply(msg) {
  try {
    process.send(msg);
  } catch {
    // الأب أغلق القناة
  }
}

if (process.env.BM_MEDIA_CHILD === '1' && typeof process.send === 'function') {
  process.on('message', async (msg) => {
    const id = msg && typeof msg === 'object' ? msg.id : null;
    const fn = msg && Object.hasOwn(HANDLERS, msg.type) ? HANDLERS[msg.type] : null;
    if (!fn) {
      reply({ id, ok: false, code: 'unknown_unit', message: 'unit type not available' });
      return;
    }
    try {
      reply({ id, ok: true, result: await fn(msg.input || {}) });
    } catch (e) {
      reply({ id, ok: false, code: String(e?.code || 'failed').slice(0, 40), message: String(e?.message || e).slice(0, 300) });
    }
  });
  // الأب انتهى أو قُتل: نوقف ImageMagick الجاري ونخرج (لا عملية يتيمة)
  process.on('disconnect', () => {
    childTools?.killAll();
    process.exit(0);
  });
  reply({ type: 'ready' });
}
