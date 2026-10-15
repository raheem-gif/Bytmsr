// v12 media (MD-2): scanner engine (module worker or main thread), one image at a time (L12-72); errors carry err.code.
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

/** draw onto a canvas with long side ≤ maxSide */
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

/** one decode → source, work 480, fine gray 1200, original */
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
    // L12-72: decoded aspect must match the oriented header
    const aspect = bmp.width / bmp.height;
    if (Math.abs(aspect - W / H) / (W / H) > 0.05) throw fail('bad_bitmap');
    const src = scaled(bmp, bmp.width, bmp.height, sourceMax);
    // K-M3: detection images drawn from the bitmap itself
    const workC = scaled(bmp, bmp.width, bmp.height, 480);
    const fineC = scaled(bmp, bmp.width, bmp.height, 1200);
    canvases.push(src, workC, fineC);
    let original = null;
    const kept = dims.format === 'jpeg' && dims.orientation === 1 && file.size <= KEEP_BYTES && Math.max(W, H) <= origMax;
    if (kept) original = file.slice(0, file.size, 'image/jpeg');
    else {
      const oc = scaled(bmp, bmp.width, bmp.height, origMax);
      canvases.push(oc);
      original = await encode(oc, 'image/jpeg', origQuality);
    }
    bmp.close?.();
    const source = pixels(src);
    // L12-72: blank readback → silent fallback
    if (lumaStd(source) < 2) throw fail('blank');
    const work = pixels(workC);
    const fine = pixels(fineC);
    S = { source, work, refine: { width: fine.width, height: fine.height, gray: grayOf(fine) } };
    // SEC-7: re-encoded unless kept
    return { width: source.width, height: source.height, photoW: W, photoH: H, original, reencoded: !kept };
  } finally {
    bmp.close?.();
    for (const c of canvases) zero(c);
  }
}

/** → { quad 0..1 | null, score, partial, nested (K-M1), method } */
export function detect() {
  if (!S) throw fail('no_session');
  const t = Date.now();
  const r = detectQuad(S.work, { refine: S.refine });
  const ms = Date.now() - t;
  if (!r || !r.quad) return { quad: null, score: r?.score ?? 0, partial: false, nested: false, method: r?.method ?? null, ms };
  const { width: w, height: h } = S.work;
  const quad = r.quad.map((p) => [Math.min(1, Math.max(0, p.x / w)), Math.min(1, Math.max(0, p.y / h))]);
  return { quad, score: r.score, partial: !!r.partial, nested: !!r.nested, method: r.method, ms };
}

const FULL = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** clean page: bw → 1-bit PNG (+ PDF bits), else JPEG */
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

/** source preview for the corner sheet */
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

/** pages → one PDF */
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

/** K-M3: JIT warm-up on a synthetic page */
export function warmup() {
  const w = 240, h = 320;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const paper = x > 40 + y * 0.05 && x < 200 + y * 0.05 && y > 30 && y < 290;
      const ink = paper && y % 18 < 4 && x % 23 < 9 && x > 70 && x < 180;
      const v = ink ? 40 : paper ? 232 : 90 + ((x * 7 + y * 13) % 17);
      data[i] = v;
      data[i + 1] = v - (paper ? 2 : 20);
      data[i + 2] = v - (paper ? 6 : 34);
      data[i + 3] = 255;
    }
  }
  const img = { width: w, height: h, data };
  const r = detectQuad(img, { refine: { width: w, height: h, gray: grayOf(img) } });
  const quad = r?.quad || [{ x: 40, y: 30 }, { x: 200, y: 30 }, { x: 214, y: 290 }, { x: 54, y: 290 }];
  const size = pageSize(quad, w, h, { maxSide: 300 });
  lumaStd(rotate(enhance(warp(img, quad, size.w, size.h), 'auto'), 0));
  return true;
}

const OPS = { open, detect, render, preview, pdf, close, warmup };

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
