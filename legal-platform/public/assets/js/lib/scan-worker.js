// v12 media (MD-2) — محرك الماسح: يعمل في عامل وحدة (module Worker، نفس الأصل، مسموح بـ script-src 'self')، وتستورده
// scanner.js نفسه في الخيط الرئيسي حين لا يتوفر العامل أو OffscreenCanvas (Safari القديم). صورة واحدة في المرة (L12-72):
// تُغلق الصورة المفكوكة فور رسم النسخ الثلاث، وتُصفَّر اللوحات بعد كل استخدام، والجلسة تُحذف عند close.
//
// العمليات: open(file, opts) · detect() · render(opts) · preview(opts) · pdf(pages, opts) · close()
// الأخطاء تحمل code: too_large (> 50 ميجابكسل قبل الفك، L12-67) · unsupported (ليست JPEG/PNG/WebP) · bad_bitmap (اتجاه
// الصورة المفكوكة لا يطابق الترويسة) · blank (صفحة فارغة: تباين < 2) · no_session · no_offscreen (عامل بلا OffscreenCanvas).
import { detectQuad, pageSize, warp, enhance, rotate, uprightTurns, jpegInfo, imageDims, buildPdf, packBits1, buildPng1, grayOf, lumaStd } from './scan-core.js';

const MAX_PIXELS = 50e6;
const KEEP_BYTES = 400 * 1024;
let S = null;

const fail = (code) => Object.assign(new Error(code), { code });
const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;

function canvasOf(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  if (inWorker) throw fail('no_offscreen');
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const zero = (c) => {
  c.width = 0;
  c.height = 0;
};
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

/** رسم مصدر (صورة أو لوحة) على لوحة أطول ضلع فيها ≤ maxSide */
function scaled(src, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s));
  const h = Math.max(1, Math.round(sh * s));
  const c = canvasOf(w, h);
  const x = ctx2d(c);
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  return c;
}
const pixels = (c) => ctx2d(c).getImageData(0, 0, c.width, c.height);

async function encode(c, type, quality) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(fail('encode'))), type, quality));
}
async function toBlob(img, type, quality) {
  const c = canvasOf(img.width, img.height);
  ctx2d(c).putImageData(img instanceof ImageData ? img : new ImageData(img.data, img.width, img.height), 0, 0);
  try {
    return await encode(c, type, quality);
  } finally {
    zero(c);
  }
}
async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * فك الصورة مرة واحدة مع تطبيق اتجاه EXIF والتصغير أثناء الفك، وتجهيز: المصدر (≤ sourceMax)، نسخة الاكتشاف 480،
 * والنسخة الرمادية 1200، والأصل المرفوع (اليوم: ≤ origMax بجودة origQuality؛ ملف JPEG صغير مستقيم يُرفع كما هو).
 */
export async function open(file, { sourceMax = 2400, origMax = 1600, origQuality = 0.72 } = {}) {
  S = null;
  const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  let dims = imageDims(head);
  if (!dims && head[0] === 0xff && head[1] === 0xd8 && file.size > head.length) dims = imageDims(new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()));
  if (!dims) throw fail('unsupported');
  if (dims.width * dims.height > MAX_PIXELS || !dims.width || !dims.height) throw fail('too_large');
  const swap = dims.orientation >= 5 && dims.orientation <= 8;
  const W = swap ? dims.height : dims.width;
  const H = swap ? dims.width : dims.height;
  const s = Math.min(1, Math.max(sourceMax, origMax) / Math.max(W, H));
  const opts = { imageOrientation: 'from-image' };
  if (s < 1) Object.assign(opts, { resizeWidth: Math.round(W * s), resizeHeight: Math.round(H * s), resizeQuality: 'high' });
  const bmp = await createImageBitmap(file, opts);
  const canvases = [];
  try {
    // L12-72: نسبة أبعاد الصورة المفكوكة يجب أن تطابق الترويسة بعد الاتجاه (وإلا لم يُطبق EXIF)؛ الحجم يُصحح بالرسم
    const aspect = bmp.width / bmp.height;
    if (Math.abs(aspect - W / H) / (W / H) > 0.05) throw fail('bad_bitmap');
    const src = scaled(bmp, bmp.width, bmp.height, sourceMax);
    canvases.push(src);
    let original = null;
    if (dims.format === 'jpeg' && dims.orientation === 1 && file.size <= KEEP_BYTES && Math.max(W, H) <= origMax) original = file.slice(0, file.size, 'image/jpeg');
    else {
      const oc = scaled(bmp, bmp.width, bmp.height, origMax);
      canvases.push(oc);
      original = await encode(oc, 'image/jpeg', origQuality);
    }
    bmp.close?.();
    const source = pixels(src);
    // L12-72: لوحة تُقرأ فارغة (متصفح يمنع القراءة أو يعيد أصفارًا) ← رجوع صامت إلى التصغير العادي
    if (lumaStd(source) < 2) throw fail('blank');
    const workC = scaled(src, src.width, src.height, 480);
    const fineC = scaled(src, src.width, src.height, 1200);
    canvases.push(workC, fineC);
    const work = pixels(workC);
    const fine = pixels(fineC);
    S = { source, work, refine: { width: fine.width, height: fine.height, gray: grayOf(fine) } };
    return { width: source.width, height: source.height, photoW: W, photoH: H, original };
  } finally {
    bmp.close?.();
    for (const c of canvases) zero(c);
  }
}

/** → { quad: [[x,y]…] (0..1 من الصورة بعد الاتجاه) | null, score, partial, method } */
export function detect() {
  if (!S) throw fail('no_session');
  const t = Date.now();
  const r = detectQuad(S.work, { refine: S.refine });
  const ms = Date.now() - t;
  if (!r || !r.quad) return { quad: null, score: r?.score ?? 0, partial: false, method: r?.method ?? null, ms };
  const { width: w, height: h } = S.work;
  const quad = r.quad.map((p) => [Math.min(1, Math.max(0, p.x / w)), Math.min(1, Math.max(0, p.y / h))]);
  return { quad, score: r.score, partial: !!r.partial, method: r.method, ms };
}

const FULL = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * الصفحة النظيفة: quad بين 0..1 (null = الصورة كاملة). أبيض وأسود ← PNG بت واحد (+ bits لملف PDF)، وغيره JPEG.
 * → { blob, width, height, mode, turns, bits }
 */
export async function render({ quad = null, mode = 'auto', turns = null, maxSide = 1754, quality = 0.7 } = {}) {
  if (!S) throw fail('no_session');
  const { source } = S;
  const q = (quad || FULL).map(([x, y]) => ({ x: x * source.width, y: y * source.height }));
  const size = pageSize(q, source.width, source.height, { maxSide, snap: !!quad });
  let clean = enhance(warp(source, q, size.w, size.h), mode);
  const outMode = clean.mode;
  let rot = turns;
  if (rot === null || rot === undefined) rot = quad ? uprightTurns(clean) : 0;
  if (rot) clean = rotate(clean, rot);
  if (lumaStd(clean) < 2) throw fail('blank');
  let blob = null;
  let bits = null;
  if (outMode === 'bw') {
    const z = await deflate(packBits1(clean, { png: true }));
    if (z) {
      blob = new Blob([buildPng1(z, clean.width, clean.height)], { type: 'image/png' });
      bits = await deflate(packBits1(clean));
    }
  }
  if (!blob) blob = await toBlob(clean, 'image/jpeg', outMode === 'bw' ? 0.6 : quality);
  return { blob, width: clean.width, height: clean.height, mode: outMode, turns: rot, bits };
}

/** صورة المصدر مصغّرة لمحرر الأركان */
export async function preview({ maxSide = 900, quality = 0.8 } = {}) {
  if (!S) throw fail('no_session');
  const src = canvasOf(S.source.width, S.source.height);
  ctx2d(src).putImageData(S.source, 0, 0);
  const c = scaled(src, src.width, src.height, maxSide);
  zero(src);
  try {
    return await encode(c, 'image/jpeg', quality);
  } finally {
    zero(c);
  }
}

/** صفحات → PDF واحد: [{ blob (JPEG) } | { bits, width, height } (أبيض وأسود)] */
export async function pdf(pages, { title = 'Scan' } = {}) {
  const out = [];
  for (const p of pages) {
    if (p.bits) {
      out.push({ kind: 'flate1', bytes: p.bits, width: p.width, height: p.height });
      continue;
    }
    const bytes = new Uint8Array(await p.blob.arrayBuffer());
    const info = jpegInfo(bytes);
    if (!info) throw fail('bad_page');
    out.push({ kind: 'jpeg', bytes, width: info.width, height: info.height, components: info.components });
  }
  return new Blob([buildPdf(out, { title, producer: 'scan-core' })], { type: 'application/pdf' });
}

export function close() {
  S = null;
  return true;
}

const OPS = { open, detect, render, preview, pdf, close };

if (inWorker) {
  self.onmessage = async (e) => {
    const { id, op, args = [] } = e.data || {};
    try {
      if (op !== 'close' && (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function')) throw fail('no_offscreen');
      const r = await OPS[op](...args);
      self.postMessage({ id, ok: true, r });
    } catch (err) {
      self.postMessage({ id, ok: false, code: err?.code || 'error' });
    }
  };
}
