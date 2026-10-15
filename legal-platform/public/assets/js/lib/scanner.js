// v12 media (MD-2): browser scanner API (lazy, never precached, L12-89); engine in scan-worker.js; failures reject with err.code.
const TIMEOUT_MS = 12_000;
export const SCAN_ALGO = 'scan-core@1';

let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();
let mainEngine = null;
let chain = Promise.resolve();

const fail = (code) => Object.assign(new Error(code), { code });

export function supportsScanner() {
  try {
    return typeof createImageBitmap === 'function' && typeof Uint8ClampedArray === 'function' && typeof Blob === 'function' && (typeof OffscreenCanvas === 'function' || typeof document !== 'undefined');
  } catch {
    return false;
  }
}

export function networkProfile() {
  let slow = false;
  try {
    const c = navigator.connection;
    slow = !!(c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType)));
  } catch {
    slow = false;
  }
  return slow ? { slow, origMax: 1200, origQuality: 0.7 } : { slow, origMax: 1600, origQuality: 0.72 };
}

function dropWorker(code) {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* لا شيء */
    }
  }
  worker = null;
  for (const [, p] of pending) p.reject(fail(code));
  pending.clear();
}

function getWorker() {
  if (workerBroken || typeof Worker !== 'function') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./scan-worker.js', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e) => {
    const { id, ok, r, code } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (ok) p.resolve(r);
    else {
      if (code === 'no_offscreen') workerBroken = true;
      p.reject(fail(code || 'error'));
    }
  };
  // no module worker / load error → main thread
  worker.onerror = (e) => {
    e?.preventDefault?.();
    workerBroken = true;
    dropWorker('worker_error');
  };
  return worker;
}

async function engine() {
  if (!mainEngine) mainEngine = await import('./scan-worker.js');
  return mainEngine;
}

/** K-M3: load + warm the engine on the camera/gallery press */
let warmed = false;
export function warm() {
  try {
    if (!supportsScanner()) return false;
    if (warmed) return true;
    warmed = true;
    // serial with the photos; on the main thread after the camera/gallery has opened
    const run = () => serial(() => call('warmup')).catch(() => {});
    if (getWorker()) run();
    else setTimeout(run, 600);
    return true;
  } catch {
    return false;
  }
}

/** one engine op: worker with a 12 s timeout, or main thread */
async function call(op, ...args) {
  const w = getWorker();
  if (!w) return (await engine())[op](...args);
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(fail('timeout'));
      dropWorker('timeout');
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    try {
      w.postMessage({ id, op, args });
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      reject(fail('post'));
    }
  });
}

/** one image at a time */
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function openScan(file, { sourceMax = 2400, origMax, origQuality } = {}) {
  if (!supportsScanner()) throw fail('unsupported');
  const net = networkProfile();
  const opts = { sourceMax, origMax: origMax || net.origMax, origQuality: origQuality || net.origQuality };
  let info;
  try {
    info = await call('open', file, opts);
  } catch (e) {
    // worker unusable → once on the main thread
    if (!['worker_error', 'no_offscreen'].includes(e.code)) throw e;
    workerBroken = true;
    info = await call('open', file, opts);
  }
  return {
    ...info,
    detect: () => call('detect'),
    render: (o = {}) => call('render', o),
    preview: (o = {}) => call('preview', o),
    close: () => call('close').catch(() => false),
  };
}

const roundQuad = (q) => q && q.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
const sameQuad = (a, b) => !!a && !!b && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 0.002 && Math.abs(p[1] - b[i][1]) < 0.002);

/** photo → page (clean when the paper is found) */
export function scanPage(file, { sourceMax = 2400, maxSide = 1754, quality = 0.7, mode = 'auto' } = {}) {
  return serial(async () => {
    const s = await openScan(file, { sourceMax });
    try {
      const d = await s.detect();
      const page = {
        raw: file,
        original: s.original,
        reencoded: !!s.reencoded,
        quad: roundQuad(d.quad),
        detected: roundQuad(d.quad),
        score: Number.isFinite(d.score) ? d.score : null,
        partial: !!d.partial,
        nested: !!d.nested,
        method: d.method || null,
        adjusted: false,
        mode,
        outMode: null,
        turns: null,
        clean: null,
        bits: null,
        width: 0,
        height: 0,
        state: d.quad ? (d.partial ? 'partial' : 'ok') : 'notfound',
      };
      if (d.quad) {
        const r = await s.render({ quad: d.quad, mode, maxSide, quality });
        Object.assign(page, { clean: r.blob, bits: r.bits || null, width: r.width, height: r.height, outMode: r.mode, turns: r.turns });
      }
      return page;
    } finally {
      await s.close();
    }
  });
}

/** session on the raw page for fn (corner sheet) */
export function session(file, fn, { sourceMax = 2400 } = {}) {
  return serial(async () => {
    const s = await openScan(file, { sourceMax });
    try {
      return await fn(s);
    } finally {
      await s.close();
    }
  });
}

/** new render result on a page (sheet edits) */
export function applyRender(page, q, mode, r) {
  const quad = roundQuad(q);
  const adjusted = page.adjusted || !sameQuad(quad, page.detected);
  return {
    ...page,
    quad,
    mode,
    adjusted,
    // corners set by the person count as confident (L12-59)
    partial: adjusted ? false : page.partial,
    nested: adjusted ? false : !!page.nested,
    clean: r.blob,
    bits: r.bits || null,
    width: r.width,
    height: r.height,
    outMode: r.mode,
    turns: r.turns,
    state: 'ok',
  };
}

/** re-render without UI */
export function rerender(page, { quad, mode = page.mode, turns = page.turns, maxSide = 1754, quality = 0.7, sourceMax = 2400 } = {}) {
  return session(page.raw, async (s) => applyRender(page, quad || page.quad, mode, await s.render({ quad: roundQuad(quad || page.quad), mode, turns, maxSide, quality })), { sourceMax });
}

export function makePdf(pages, { title = 'Scan' } = {}) {
  return serial(() => call('pdf', pages.map((p) => (p.bits ? { bits: p.bits, width: p.width, height: p.height } : { blob: p.blob })), { title }));
}

function asFile(blob, name, type) {
  try {
    return new File([blob], name, { type: type || blob.type, lastModified: Date.now() });
  } catch {
    const b = blob.slice(0, blob.size, type || blob.type);
    b.name = name;
    return b;
  }
}
const extOf = (type) => (type === 'image/png' ? '.png' : type === 'application/pdf' ? '.pdf' : type === 'image/webp' ? '.webp' : '.jpg');

/** pages → file + scan block (§5.4); several pages = one PDF */
export async function docFile(pages, { name = 'مستند', title } = {}) {
  const base = String(name || 'مستند').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  if (pages.length === 1 && !pages[0].clean) {
    const o = pages[0].original;
    return { file: asFile(o, base + extOf(o.type), o.type), scan: null };
  }
  let file;
  if (pages.length === 1) file = asFile(pages[0].clean, base + extOf(pages[0].clean.type), pages[0].clean.type);
  else {
    const parts = pages.map((p) => (p.clean ? { blob: p.clean, bits: p.bits, width: p.width, height: p.height } : { blob: p.original }));
    file = asFile(await makePdf(parts, { title: title || base }), `${base}.pdf`, 'application/pdf');
  }
  const multi = pages.length > 1;
  const scores = pages.map((p) => (p.clean && Number.isFinite(p.score) ? p.score : null)).filter((x) => x !== null);
  const scan = {
    v: 1,
    algo: SCAN_ALGO,
    mode: pages[0].clean ? pages[0].outMode || pages[0].mode || 'auto' : 'auto',
    turns: Number(pages[0].turns) || 0,
    pages: pages.length,
    quad: multi ? pages.map((p) => (p.clean && p.quad) || [[0, 0], [1, 0], [1, 1], [0, 1]]) : pages[0].quad || [[0, 0], [1, 0], [1, 1], [0, 1]],
    score: scores.length ? Math.round(Math.min(...scores) * 1000) / 1000 : null,
    partial: pages.some((p) => p.clean && p.partial),
    // K-M1: printed frame won → original first (L12-59)
    nested: pages.some((p) => p.clean && p.nested && !p.adjusted),
    adjusted: pages.some((p) => p.adjusted),
    reencoded: pages.some((p) => p.reencoded),
    originals: pages.map((p, i) => ({ filename: `${base}-الأصل${multi ? `-${i + 1}` : ''}${extOf(p.original.type)}`, mime: p.original.type || 'image/jpeg', blob: p.original })),
  };
  return { file, scan };
}
