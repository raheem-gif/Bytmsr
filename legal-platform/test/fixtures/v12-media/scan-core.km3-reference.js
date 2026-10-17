// TEST ORACLE ONLY (v12 gate K-M3): scan-core.js as it was before the K-M3 speed-ups (with K-M1 nested). test/v12-gate-media.test.js
// checks that the optimised public/assets/js/lib/scan-core.js gives byte-identical detection and renders. Never served.
// v12 media (MD-1) — نواة ماسح المستندات: JS خالص بلا DOM ولا مكتبات. تعمل في المتصفح (العامل أو الخيط الرئيسي) وفي
// Node (تنظيف الصور على الخادم داخل عملية فرعية، L12-66). الواجهة مجمّدة (M §5.1)؛ الإضافات بعدها لا تغيّر ما قبلها.
//
// الصور كائنات { width, height, data: Uint8ClampedArray|Uint8Array RGBA } (ImageData يصلح)، والقنوات الرمادية Float32Array.
//
// API
//   detectQuad(work, { refine }) → { quad:[TL,TR,BR,BL] (work px), score, support, method:'lines'|'segment', refined, bow,
//        partial, candidates, lines } | { quad:null, score } | null
//        work: RGBA ≈ 480 px؛ refine (اختياري): { gray, width, height } ≈ 1200 px بنفس الإطار
//   pageSize(quad, srcW, srcH, { maxSide = 2000, snap = true }) → { w, h, aspect, a4, method:'zhang'|'sides' }
//   warp(src, quad /* src px */, outW, outH) → RGBA
//   enhance(img, 'auto'|'color'|'gray'|'bw') → RGBA + .mode
//   autoMode(img) → 'color'|'gray' · uprightTurns(img) → 0|1|3 · rotate(img, quarterTurns) → RGBA
//   jpegInfo(bytes) → { width, height, components, orientation } | null · packBits1(img, { png }) → Uint8Array
//   buildPdf([{ kind:'jpeg', bytes, width, height, components } | { kind:'flate1', bytes, width, height }], { title, producer })
//        → Uint8Array
//   homography(src4, dst4) → number[9] · orderQuad(pts) → [TL,TR,BR,BL]
//   إضافات MD-1: imageDims(bytes) (الأبعاد من الترويسة فقط) · buildPng1(zlibBytes, width, height) → PNG رمادي 1-bit · crc32(bytes) · lumaStd(img) (صفحة فارغة < 2،
//   L12-72) · quadFraction(quad, w, h) (مساحة الصفحة من الصورة، L12-59)

// ───────────────────────── small image helpers ─────────────────────────

export function grayOf(img) {
  const { width: w, height: h, data: d } = img;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

function chromaOf(img) {
  const { width: w, height: h, data: d } = img;
  const c = new Float32Array(w * h);
  for (let i = 0, j = 0; j < c.length; i += 4, j++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    c[j] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  return c;
}

/** separable box blur, radius r, in place-safe (returns new array) */
function boxBlur(src, w, h, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** ≈ gaussian: three box passes */
function gaussBlur(src, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

function sobel(g, w, h) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1], p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
      const sx = c + 2 * f + r - (a + 2 * d + p);
      const sy = p + 2 * q + r - (a + 2 * b + c);
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return { gx, gy, mag };
}

function percentile(arr, p, step = 1) {
  const n = Math.floor(arr.length / step);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = arr[i * step];
  s.sort();
  return s[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))];
}

function sample(a, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
  const x0 = Math.min(w - 2, Math.floor(x)), y0 = Math.min(h - 2, Math.floor(y));
  const fx = x - x0, fy = y - y0;
  const i = y0 * w + x0;
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + w] * (1 - fx) + a[i + w + 1] * fx) * fy;
}

function otsu(values, step = 1) {
  const hist = new Float64Array(256);
  let n = 0;
  for (let i = 0; i < values.length; i += step) {
    hist[Math.max(0, Math.min(255, Math.round(values[i])))]++;
    n++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

// ───────────────────────── geometry ─────────────────────────

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function orderQuad(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // clockwise on screen (y down): start at the point with the smallest x+y
  let k = 0;
  for (let i = 1; i < 4; i++) if (sorted[i].x + sorted[i].y < sorted[k].x + sorted[k].y) k = i;
  return [0, 1, 2, 3].map((i) => sorted[(k + i) % 4]);
}

function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], n = q[(i + 1) % 4];
    a += p.x * n.y - n.x * p.y;
  }
  return Math.abs(a) / 2;
}

function isConvex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function angleAt(q, i) {
  const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))))) * 180) / Math.PI;
}

function intersect(l1, l2) {
  // lines in normal form: x cosθ + y sinθ = ρ
  const a1 = Math.cos(l1.t), b1 = Math.sin(l1.t), a2 = Math.cos(l2.t), b2 = Math.sin(l2.t);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (l1.r * b2 - l2.r * b1) / det, y: (a1 * l2.r - a2 * l1.r) / det };
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** largest-area quadrilateral with vertices on a convex polygon (polygon simplified to ≤ 28 vertices first) */
function maxAreaQuad(hull) {
  let poly = hull;
  if (poly.length > 28) {
    const step = poly.length / 28;
    poly = Array.from({ length: 28 }, (_, i) => hull[Math.floor(i * step)]);
  }
  const n = poly.length;
  if (n < 4) return null;
  let best = null, bestA = 0;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [poly[a], poly[b], poly[c], poly[d]];
          const A = quadArea(q);
          if (A > bestA) {
            bestA = A;
            best = q;
          }
        }
  return best && orderQuad(best);
}

/** homography H (9 numbers, h33 = 1) mapping src[i] → dst[i] */
export function homography(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const pivot = A[c][c];
    if (Math.abs(pivot) < 1e-12) return null;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / pivot;
      if (!f) continue;
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

// ───────────────────────── detection ─────────────────────────

/**
 * Scores a quad by: edge support along each side (strong gradient perpendicular to the side), paper-vs-table contrast
 * across the side, and size. Sides lying on the image border count as half-supported (page runs off the frame).
 */
function scoreQuad(q, F) {
  const { w, h, mag, gx, gy, L, magHi } = F;
  if (!isConvex(q)) return null;
  const area = quadArea(q);
  const frac = area / (w * h);
  if (frac < 0.08) return null;
  for (let i = 0; i < 4; i++) {
    const ang = angleAt(q, i);
    if (ang < 45 || ang > 135) return null;
  }
  const s0 = dist(q[0], q[1]), s1 = dist(q[1], q[2]), s2 = dist(q[2], q[3]), s3 = dist(q[3], q[0]);
  if (Math.max(s0, s2) / Math.min(s0, s2) > 2.2 || Math.max(s1, s3) / Math.min(s1, s3) > 2.2) return null;
  const margin = 0.06 * Math.max(w, h);
  for (const p of q) if (p.x < -margin || p.y < -margin || p.x > w - 1 + margin || p.y > h - 1 + margin) return null;
  const thr = magHi * 0.22;
  const sides = [];
  const onFrame = [];
  // paperness: sample a 9×9 grid inside the quad (bilinear in quad coordinates)
  const chromaIn = [];
  for (let gy = 1; gy <= 9; gy++)
    for (let gx = 1; gx <= 9; gx++) {
      const u = gx / 10, v = gy / 10;
      const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
      const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
      const c = sample(F.C, w, h, top.x + (bot.x - top.x) * v, top.y + (bot.y - top.y) * v);
      if (!Number.isNaN(c)) chromaIn.push(c);
    }
  chromaIn.sort((a, b) => a - b);
  const chromaMed = chromaIn[Math.floor(chromaIn.length / 2)] ?? 0;
  if (chromaMed > 55) return null;
  let contrastSum = 0, contrastN = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const len = dist(a, b);
    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
    const nx = dy, ny = -dx; // outward for clockwise order
    const K = Math.max(16, Math.round(len / 4));
    let ok = 0, inFrame = 0;
    for (let k = 0; k < K; k++) {
      const t = 0.06 + (0.88 * k) / (K - 1);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      if (px < 2 || py < 2 || px > w - 3 || py > h - 3) continue;
      inFrame++;
      let best = 0;
      for (let d = -2; d <= 2; d++) {
        const sx = Math.round(px + nx * d), sy = Math.round(py + ny * d);
        if (sx < 1 || sy < 1 || sx > w - 2 || sy > h - 2) continue;
        const j = sy * w + sx;
        const m = mag[j];
        if (m <= best) continue;
        const cos = Math.abs(gx[j] * nx + gy[j] * ny) / (m + 1e-6);
        if (cos > 0.8) best = m;
      }
      if (best > thr) ok++;
      const li = sample(L, w, h, px - nx * 4, py - ny * 4), lo = sample(L, w, h, px + nx * 4, py + ny * 4);
      if (!Number.isNaN(li) && !Number.isNaN(lo)) {
        contrastSum += li - lo;
        contrastN++;
      }
    }
    onFrame.push(inFrame < K * 0.3);
    sides.push(inFrame < K * 0.3 ? 0.5 : ok / Math.max(1, inFrame));
  }
  const frameSides = onFrame.filter(Boolean).length;
  if (frameSides >= 3) return null;
  if (frameSides && sides.filter((_, i) => !onFrame[i]).some((v) => v < 0.6)) return null;
  const support = sides.reduce((s, v) => s + v, 0) / 4;
  const minSupport = Math.min(...sides);
  const contrast = contrastN ? contrastSum / contrastN : 0;
  const contrastTerm = Math.max(-1, Math.min(1, contrast / 30));
  const sizeTerm = Math.min(1, frac / 0.55);
  const score = 0.5 * support + 0.2 * minSupport + 0.15 * sizeTerm + 0.15 * contrastTerm;
  return { score: score - 0.04 * frameSides, support, minSupport, contrast, frac, sides, frameSides };
}

function houghLines(F, maxLines = 22) {
  const { w, h, mag, gx, gy, nms, thrLow } = F;
  const diag = Math.ceil(Math.hypot(w, h));
  const T = 180;
  const R = 2 * diag + 1;
  const acc = new Float32Array(T * R);
  const cosT = new Float32Array(T), sinT = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    cosT[t] = Math.cos((t * Math.PI) / T);
    sinT[t] = Math.sin((t * Math.PI) / T);
  }
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (!nms[i]) continue;
      const m = mag[i];
      if (m < thrLow) continue;
      let phi = Math.atan2(gy[i], gx[i]);
      if (phi < 0) phi += Math.PI;
      const tc = Math.round((phi * T) / Math.PI);
      const wgt = Math.min(m, thrLow * 6);
      for (let dt = -3; dt <= 3; dt++) {
        const t = (tc + dt + T) % T;
        const r = Math.round(x * cosT[t] + y * sinT[t]) + diag;
        acc[t * R + r] += wgt;
      }
    }
  }
  // peaks with non-maximum suppression (θ ±4, ρ ±6), wrap-aware duplicate removal afterwards
  const peaks = [];
  let accMax = 0;
  for (let i = 0; i < acc.length; i++) if (acc[i] > accMax) accMax = acc[i];
  const floor = accMax * 0.12;
  for (let t = 0; t < T; t++) {
    for (let r = 1; r < R - 1; r++) {
      const v = acc[t * R + r];
      if (v <= floor) continue;
      let isMax = true;
      for (let dt = -4; dt <= 4 && isMax; dt++) {
        const tt = (t + dt + T) % T;
        for (let dr = -6; dr <= 6; dr++) {
          if (!dt && !dr) continue;
          const rr = r + dr;
          if (rr < 0 || rr >= R) continue;
          if (acc[tt * R + rr] > v) {
            isMax = false;
            break;
          }
        }
      }
      if (isMax) peaks.push({ t: (t * Math.PI) / T, r: r - diag, v });
    }
  }
  peaks.sort((a, b) => b.v - a.v);
  const out = [];
  for (const p of peaks) {
    if (out.length >= maxLines) break;
    const dup = out.some((o) => {
      let dt = Math.abs(o.t - p.t);
      let sameSign = true;
      if (dt > Math.PI / 2) {
        dt = Math.PI - dt;
        sameSign = false;
      }
      const dr = sameSign ? Math.abs(o.r - p.r) : Math.abs(o.r + p.r);
      return dt < (4 * Math.PI) / 180 && dr < 8;
    });
    if (!dup) out.push(p);
  }
  return out;
}

function lineQuads(lines, F) {
  const angDiff = (a, b) => {
    const d = Math.abs(a - b) % Math.PI;
    return Math.min(d, Math.PI - d);
  };
  const pairs = [];
  const minSep = 0.15 * Math.min(F.w, F.h);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      if (angDiff(a.t, b.t) > (30 * Math.PI) / 180) continue;
      // separation measured at the image centre
      const cx = F.w / 2, cy = F.h / 2;
      const da = cx * Math.cos(a.t) + cy * Math.sin(a.t) - a.r;
      const db = cx * Math.cos(b.t) + cy * Math.sin(b.t) - b.r;
      // bring b to a's orientation sign
      const sb = Math.cos(a.t - b.t) >= 0 ? db : -db;
      if (Math.abs(da - sb) < minSep) continue;
      pairs.push([a, b]);
    }
  const quads = [];
  for (let i = 0; i < pairs.length; i++)
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i], [c, d] = pairs[j];
      if (angDiff(a.t, c.t) < (50 * Math.PI) / 180) continue;
      const pts = [intersect(a, c), intersect(c, b), intersect(b, d), intersect(d, a)];
      if (pts.some((p) => !p)) continue;
      quads.push(orderQuad(pts));
    }
  return quads;
}

function segmentQuad(F, img) {
  const { w, h, L } = F;
  const C = gaussBlur(chromaOf(img), w, h, 1.5);
  const P = new Float32Array(w * h);
  for (let i = 0; i < P.length; i++) P[i] = Math.max(0, Math.min(255, L[i] - 1.5 * C[i]));
  const T = otsu(P, 2);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < P.length; i++) mask[i] = P[i] > T ? 1 : 0;
  // fill holes: background = not-mask reachable from the border
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => {
    if (!mask[i] && !seen[i]) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !seen[i]) mask[i] = 1;
  // largest component
  const lab = new Int32Array(w * h);
  let bestLabel = 0, bestSize = 0, label = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || lab[s]) continue;
    label++;
    let size = 0;
    stack.push(s);
    lab[s] = label;
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && mask[i - 1] && !lab[i - 1]) (lab[i - 1] = label), stack.push(i - 1);
      if (x < w - 1 && mask[i + 1] && !lab[i + 1]) (lab[i + 1] = label), stack.push(i + 1);
      if (y > 0 && mask[i - w] && !lab[i - w]) (lab[i - w] = label), stack.push(i - w);
      if (y < h - 1 && mask[i + w] && !lab[i + w]) (lab[i + w] = label), stack.push(i + w);
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
  }
  if (bestSize < 0.08 * w * h || bestSize > 0.985 * w * h) return null;
  const pts = [];
  for (let y = 0; y < h; y++) {
    let first = -1, last = -1;
    for (let x = 0; x < w; x++)
      if (lab[y * w + x] === bestLabel) {
        if (first < 0) first = x;
        last = x;
      }
    if (first >= 0) pts.push({ x: first, y }, { x: last, y });
  }
  const hull = convexHull(pts);
  return maxAreaQuad(hull);
}

function features(work) {
  const w = work.width, h = work.height;
  const g = grayOf(work);
  const L = gaussBlur(g, w, h, 1.6);
  const C = gaussBlur(chromaOf(work), w, h, 1.6);
  // gradient of luminance + chroma (a white page on a coloured cloth has chroma edges even at equal brightness)
  const s1 = sobel(L, w, h), s2 = sobel(C, w, h);
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  for (let i = 0; i < mag.length; i++) {
    if (s2.mag[i] > s1.mag[i]) {
      gx[i] = s2.gx[i];
      gy[i] = s2.gy[i];
      mag[i] = s2.mag[i];
    } else {
      gx[i] = s1.gx[i];
      gy[i] = s1.gy[i];
      mag[i] = s1.mag[i];
    }
  }
  // non-maximum suppression along the gradient
  const nms = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (!m) continue;
      const ax = Math.abs(gx[i]), ay = Math.abs(gy[i]);
      let n1, n2;
      if (ax > 2.414 * ay) [n1, n2] = [mag[i - 1], mag[i + 1]];
      else if (ay > 2.414 * ax) [n1, n2] = [mag[i - w], mag[i + w]];
      else if (gx[i] * gy[i] > 0) [n1, n2] = [mag[i - w - 1], mag[i + w + 1]];
      else [n1, n2] = [mag[i - w + 1], mag[i + w - 1]];
      if (m >= n1 && m >= n2) nms[i] = 1;
    }
  const magHi = Math.max(20, percentile(mag, 0.97, 3));
  return { w, h, L, C, mag, gx, gy, nms, magHi, thrLow: magHi * 0.18 };
}

/**
 * Refine each side on a higher-resolution gray image: search along the normal for the strongest consistent edge,
 * fit d(t) = c0 + c1·t + c2·t² per side (a bowed page edge is a curve, not a line), then intersect adjacent curves.
 */
function refineQuad(quad, scale, R, { searchFrac = 0.014, signed = true, prior = null } = {}) {
  const { width: w, height: h } = R;
  const L = R.blurred || (R.blurred = gaussBlur(R.gray, w, h, 1.2));
  const S = R.sobel || (R.sobel = sobel(L, w, h));
  const q = quad.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const diag = Math.hypot(w, h);
  const searchR = Math.max(6, Math.round(diag * searchFrac));
  const sides = [];
  for (let i = 0; i < 4; i++) {
    // with a prior pass: same side frame, search centred on the prior curve (a bowed edge leaves the chord)
    const P = prior && prior[i];
    const a = P ? P.a : q[i], b = q[(i + 1) % 4];
    const len = P ? P.len : dist(a, b);
    const dx = P ? P.dx : (b.x - a.x) / len, dy = P ? P.dy : (b.y - a.y) / len;
    const side = { a, dx, dy, nx: dy, ny: -dx, len };
    const pts = [];
    const K = 56;
    for (let k = 0; k < K; k++) {
      const t = 0.04 + (0.92 * k) / (K - 1);
      const c0 = P ? P.c[0] + P.c[1] * t + P.c[2] * t * t : 0;
      const px = a.x + dx * len * t + side.nx * c0, py = a.y + dy * len * t + side.ny * c0;
      let best = 0, bestD = 0;
      for (let d = -searchR; d <= searchR; d++) {
        const sx = Math.round(px + side.nx * d), sy = Math.round(py + side.ny * d);
        if (sx < 1 || sy < 1 || sx > w - 2 || sy > h - 2) continue;
        const j = sy * w + sx;
        const m = S.mag[j];
        if (m <= best) continue;
        // the page is the brighter side: brightness grows inward, so the gradient points against the outward normal
        const dot = (S.gx[j] * side.nx + S.gy[j] * side.ny) / (m + 1e-6);
        if (signed ? dot < -0.8 : Math.abs(dot) > 0.8) {
          best = m;
          bestD = d;
        }
      }
      if (best > 0) {
        const m0 = sample(S.mag, w, h, px + side.nx * (bestD - 1), py + side.ny * (bestD - 1));
        const m2 = sample(S.mag, w, h, px + side.nx * (bestD + 1), py + side.ny * (bestD + 1));
        let off = 0;
        if (!Number.isNaN(m0) && !Number.isNaN(m2)) {
          const den = m0 - 2 * best + m2;
          if (den < 0) off = Math.max(-0.5, Math.min(0.5, (0.5 * (m0 - m2)) / den));
        }
        pts.push({ t, d: c0 + bestD + off });
      }
    }
    if (pts.length < K * 0.4) return null;
    side.c = fitCurve(pts);
    sides.push(side);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = intersectCurves(sides[(i + 3) % 4], sides[i]);
    if (!p) return null;
    out.push(p);
  }
  for (let i = 0; i < 4; i++) if (dist(out[i], q[i]) > diag * Math.max(0.04, searchFrac * 2)) return null;
  const bow = Math.max(...sides.map((sd) => Math.abs(sd.c[2]) / 4)) / diag;
  const res = out.map((p) => ({ x: p.x / scale, y: p.y / scale }));
  res.bow = bow;
  res.sides = sides;
  return res;
}

function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[3] / r[i]);
}

/** robust quadratic d(t) with outlier rejection; falls back to a line when the bow is under ~0.75 px */
function fitCurve(pts) {
  let use = pts;
  let c = [0, 0, 0];
  for (let round = 0; round < 4; round++) {
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
    for (const p of use) {
      const v = [1, p.t, p.t * p.t];
      for (let i = 0; i < 3; i++) {
        B[i] += v[i] * p.d;
        for (let j = 0; j < 3; j++) S[i][j] += v[i] * v[j];
      }
    }
    c = solve3(S, B) || c;
    const res = use.map((p) => Math.abs(p.d - (c[0] + c[1] * p.t + c[2] * p.t * p.t)));
    const sorted = res.slice().sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    const lim = Math.max(1.0, med * 3);
    const next = use.filter((_, i) => res[i] <= lim);
    if (next.length === use.length || next.length < 8) break;
    use = next;
  }
  if (Math.abs(c[2]) / 4 < 0.75) {
    // straight edge: plain least-squares line through the inliers
    let st = 0, sd = 0, stt = 0, std = 0;
    for (const p of use) {
      st += p.t;
      sd += p.d;
      stt += p.t * p.t;
      std += p.t * p.d;
    }
    const n = use.length;
    const den = n * stt - st * st;
    if (Math.abs(den) > 1e-9) {
      const c1 = (n * std - st * sd) / den;
      c = [(sd - c1 * st) / n, c1, 0];
    }
  }
  return c;
}

const curvePoint = (S, t) => {
  const d = S.c[0] + S.c[1] * t + S.c[2] * t * t;
  return { x: S.a.x + S.dx * t * S.len + S.nx * d, y: S.a.y + S.dy * t * S.len + S.ny * d };
};
const curveDeriv = (S, t) => {
  const dd = S.c[1] + 2 * S.c[2] * t;
  return { x: S.dx * S.len + S.nx * dd, y: S.dy * S.len + S.ny * dd };
};

/** end of side S1 (t≈1) meets start of side S2 (t≈0): Newton on C1(s) − C2(t) = 0 */
function intersectCurves(S1, S2) {
  let s = 1, t = 0;
  for (let it = 0; it < 8; it++) {
    const P = curvePoint(S1, s), Q = curvePoint(S2, t);
    const fx = P.x - Q.x, fy = P.y - Q.y;
    if (Math.abs(fx) + Math.abs(fy) < 1e-3) break;
    const A = curveDeriv(S1, s), B = curveDeriv(S2, t);
    // [A  −B] [ds dt]ᵀ = −F
    const det = A.x * -B.y - -B.x * A.y;
    if (Math.abs(det) < 1e-9) return null;
    const ds = (-fx * -B.y - -B.x * -fy) / det;
    const dt = (A.x * -fy - -fx * A.y) / det;
    s += ds;
    t += dt;
    if (Math.abs(s - 1) > 0.5 || Math.abs(t) > 0.5) return null;
  }
  return curvePoint(S1, s);
}

/**
 * K-M1 (L12-59): a printed frame or rule inside the page can beat the paper edge (PW-M11 n01: the frame line, 2 % in).
 * Walk outward from each fitted side: page-bright for ≥ 3 px right after the side, then a sustained fall to the
 * background, on ≥ 70 % of the side at a constant offset (a frame runs parallel to the edge; measuring from the fitted
 * curve keeps bowed edges out) → the quad sits inside the paper. sides: { a, dx, dy, len, c } in the px of L.
 */
function insidePaper(sides, L, w, h) {
  const diag = Math.hypot(w, h);
  const D = Math.max(12, Math.round(diag * 0.045));
  const startMax = Math.max(4, Math.round(diag * 0.012));
  const prof = new Float32Array(D + 1);
  const N = 40;
  for (const S of sides) {
    let valid = 0;
    const offs = [];
    for (let j = 0; j < N; j++) {
      const t = 0.1 + (0.8 * j) / (N - 1);
      const p = curvePoint(S, t);
      const dv = curveDeriv(S, t);
      const dl = Math.hypot(dv.x, dv.y) || 1;
      const nx = dv.y / dl, ny = -dv.x / dl; // outward (clockwise order)
      let pin = 0;
      for (let d = 3; d <= 10; d++) {
        const v = sample(L, w, h, p.x - nx * d, p.y - ny * d);
        if (v > pin) pin = v;
      }
      if (!(pin > 50)) continue;
      let inFrame = true;
      for (let d = 0; d <= D; d++) {
        const v = sample(L, w, h, p.x + nx * d, p.y + ny * d);
        if (Number.isNaN(v)) {
          inFrame = false;
          break;
        }
        prof[d] = v;
      }
      if (!inFrame) continue;
      valid++;
      const bright = pin - Math.max(12, 0.07 * pin);
      let d = 1;
      while (d <= startMax && prof[d] < bright) d++;
      if (d > startMax) continue;
      const start = d;
      while (d <= D && prof[d] >= bright) d++;
      if (d - start < 3 || d > D - 5) continue;
      let m = 0, n = 0;
      for (let e = d + 2; e <= Math.min(D, d + 7); e++) (m += prof[e]), n++;
      if (pin - m / n >= Math.max(18, 0.1 * pin)) offs.push(d);
    }
    if (valid < 12 || offs.length < 0.7 * valid) continue;
    offs.sort((x, y) => x - y);
    const med = offs[offs.length >> 1];
    const iqr = offs[Math.floor(offs.length * 0.75)] - offs[Math.floor(offs.length * 0.25)];
    if (iqr <= Math.max(2, 0.15 * med)) return true;
  }
  return false;
}

export function detectQuad(work, { refine = null } = {}) {
  const F = features(work);
  const cands = [];
  const lines = houghLines(F);
  // the frame itself as optional sides (a page bigger than the photo); a quad may use at most two of them
  const frame = [
    { t: 0, r: 1, frame: true },
    { t: 0, r: F.w - 2, frame: true },
    { t: Math.PI / 2, r: 1, frame: true },
    { t: Math.PI / 2, r: F.h - 2, frame: true },
  ];
  for (const q of lineQuads(lines.concat(frame), F)) {
    const s = scoreQuad(q, F);
    if (s) cands.push({ quad: q, method: 'lines', ...s });
  }
  const seg = segmentQuad(F, work);
  if (seg) {
    const s = scoreQuad(seg, F);
    if (s) cands.push({ quad: seg, method: 'segment', ...s });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (best.score < 0.42 || best.support < 0.35) return { quad: null, score: best.score, method: best.method, candidates: cands.length, lines: lines.length };
  let quad = best.quad;
  let refined = false;
  if (refine) {
    // wide pass (a bowed edge can sit ~3 % away from the coarse line at the corners), then a tight pass
    const k = refine.width / work.width;
    const wide = refineQuad(quad, k, refine, { searchFrac: 0.03 }) || refineQuad(quad, k, refine, { searchFrac: 0.03, signed: false });
    const base = wide || quad;
    const prior = wide ? wide.sides : null;
    const tight = refineQuad(base, k, refine, { searchFrac: 0.01, prior }) || refineQuad(base, k, refine, { searchFrac: 0.01, signed: false, prior });
    const r = tight || wide;
    if (r) {
      quad = r;
      quad.bow = r.bow;
      refined = true;
    }
  }
  const W = work.width, H = work.height;
  const tol = 0.01 * Math.max(W, H);
  // a corner on (or beyond) the frame edge: the page is probably cut — the UI suggests a retake
  const partial = best.frameSides > 0 || quad.some((p) => p.x < tol || p.y < tol || p.x > W - 1 - tol || p.y > H - 1 - tol);
  // K-M1: paper continues outside the quad (a printed frame won) → the clean copy is not shown first (L12-59)
  const nested = refined && quad.sides
    ? insidePaper(quad.sides, refine.blurred, refine.width, refine.height)
    : insidePaper(quad.map((a, i) => {
        const b = quad[(i + 1) % 4];
        const len = dist(a, b);
        const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
        return { a, dx, dy, nx: dy, ny: -dx, len, c: [0, 0, 0] };
      }), F.L, W, H);
  return { quad, score: best.score, support: best.support, method: best.method, refined, bow: quad.bow ?? null, partial, nested, candidates: cands.length, lines: lines.length };
}

// ───────────────────────── page size ─────────────────────────

/**
 * Output size for a quad (src px). Aspect from the Zhang–He rectification (focal length from the quad) when perspective
 * is measurable, else from side lengths; snapped to A4 when within 6 %.
 */
export function pageSize(quad, srcW, srcH, { maxSide = 2000, snap = true } = {}) {
  const [tl, tr, br, bl] = quad;
  const wSide = Math.max(dist(tl, tr), dist(bl, br));
  const hSide = Math.max(dist(tl, bl), dist(tr, br));
  let aspect = hSide / wSide;
  // Zhang & He (2007): m1=TL, m2=TR, m3=BL, m4=BR around the principal point
  const u0 = srcW / 2, v0 = srcH / 2;
  const m = [tl, tr, bl, br].map((p) => [p.x - u0, p.y - v0, 1]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c14 = cross(m[0], m[3]);
  const k2 = dot(c14, m[2]) / dot(cross(m[1], m[3]), m[2]);
  const k3 = dot(c14, m[1]) / dot(cross(m[2], m[3]), m[1]);
  const n2 = m[1].map((v, i) => k2 * v - m[0][i]);
  const n3 = m[2].map((v, i) => k3 * v - m[0][i]);
  let method = 'sides';
  if (Math.abs(n2[2]) > 1e-6 && Math.abs(n3[2]) > 1e-6) {
    const f2 = -(n2[0] * n3[0] + n2[1] * n3[1]) / (n2[2] * n3[2]);
    if (f2 > 0) {
      const f = Math.sqrt(f2);
      // reject absurd focal lengths (phone cameras: ~0.6–1.6 × image diagonal)
      const diag = Math.hypot(srcW, srcH);
      if (f > 0.4 * diag && f < 3 * diag) {
        const wh = Math.sqrt((n2[0] ** 2 + n2[1] ** 2 + f2 * n2[2] ** 2) / (n3[0] ** 2 + n3[1] ** 2 + f2 * n3[2] ** 2));
        const zh = 1 / wh;
        if (zh > 0.4 && zh < 2.5 && Math.abs(zh - aspect) / aspect < 0.25) {
          aspect = zh;
          method = 'zhang';
        }
      }
    }
  }
  let a4 = false;
  if (snap) {
    for (const target of [Math.SQRT2, 1 / Math.SQRT2]) {
      if (Math.abs(aspect - target) / target < 0.06) {
        aspect = target;
        a4 = true;
      }
    }
  }
  // resolution: no upsampling beyond what the photo holds, capped by maxSide
  const longPx = Math.max(wSide, hSide);
  const long = Math.min(maxSide, Math.round(longPx));
  const w = aspect >= 1 ? Math.round(long / aspect) : long;
  const h = aspect >= 1 ? long : Math.round(long * aspect);
  return { w, h, aspect, a4, method };
}

// ───────────────────────── warp ─────────────────────────

export function warp(src, quad, outW, outH) {
  const H = homography(
    [{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }],
    quad,
  );
  const out = { width: outW, height: outH, data: new Uint8ClampedArray(outW * outH * 4) };
  const sd = src.data, od = out.data;
  const sw = src.width, sh = src.height;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;
  let o = 0;
  for (let y = 0; y < outH; y++) {
    const Y = y + 0.5;
    for (let x = 0; x < outW; x++) {
      const X = x + 0.5;
      const den = h6 * X + h7 * Y + 1;
      let u = (h0 * X + h1 * Y + h2) / den - 0.5;
      let v = (h3 * X + h4 * Y + h5) / den - 0.5;
      if (u < 0) u = 0;
      else if (u > sw - 1.001) u = sw - 1.001;
      if (v < 0) v = 0;
      else if (v > sh - 1.001) v = sh - 1.001;
      const u0 = u | 0, v0 = v | 0;
      const fu = u - u0, fv = v - v0;
      const i00 = (v0 * sw + u0) << 2, i01 = i00 + (sw << 2);
      const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
      od[o] = sd[i00] * w00 + sd[i00 + 4] * w10 + sd[i01] * w01 + sd[i01 + 4] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i00 + 5] * w10 + sd[i01 + 1] * w01 + sd[i01 + 5] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i00 + 6] * w10 + sd[i01 + 2] * w01 + sd[i01 + 6] * w11;
      od[o + 3] = 255;
      o += 4;
    }
  }
  return out;
}

// ───────────────────────── enhancement ─────────────────────────

/** paper background per channel: block mean → max filter (removes text) → blur → bilinear upsample */
function backgroundPlanes(img) {
  const { width: w, height: h, data: d } = img;
  const B = Math.max(4, Math.round(Math.max(w, h) / 160)); // block ≈ 1/160 of the page
  const bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const planes = [new Float32Array(bw * bh), new Float32Array(bw * bh), new Float32Array(bw * bh)];
  const counts = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) {
    const by = (y / B) | 0;
    for (let x = 0; x < w; x++) {
      const k = by * bw + ((x / B) | 0);
      const i = (y * w + x) << 2;
      planes[0][k] += d[i];
      planes[1][k] += d[i + 1];
      planes[2][k] += d[i + 2];
      counts[k]++;
    }
  }
  const R = 4; // max filter radius in blocks (≈ 2.5 % of the page: wider than a text line)
  return planes.map((p) => {
    for (let k = 0; k < p.length; k++) p[k] /= counts[k];
    // separable max filter
    const tmp = new Float32Array(bw * bh), mx = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        let m = 0;
        for (let k = Math.max(0, x - R); k <= Math.min(bw - 1, x + R); k++) m = Math.max(m, p[y * bw + k]);
        tmp[y * bw + x] = m;
      }
    for (let x = 0; x < bw; x++)
      for (let y = 0; y < bh; y++) {
        let m = 0;
        for (let k = Math.max(0, y - R); k <= Math.min(bh - 1, y + R); k++) m = Math.max(m, tmp[k * bw + x]);
        mx[y * bw + x] = m;
      }
    const sm = gaussBlur(mx, bw, bh, 2);
    return { plane: sm, bw, bh, B };
  });
}

function upsampleAt(bg, x, y) {
  const fx = Math.min(bg.bw - 1.001, Math.max(0, (x + 0.5) / bg.B - 0.5));
  const fy = Math.min(bg.bh - 1.001, Math.max(0, (y + 0.5) / bg.B - 0.5));
  return sample(bg.plane, bg.bw, bg.bh, fx, fy);
}

/** colourfulness after cleaning: share of clearly coloured pixels (stamps, signatures in blue ink, coloured forms) */
export function autoMode(img) {
  const d = img.data;
  let coloured = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const c = Math.max(r, g, b) - Math.min(r, g, b);
    if (c > 48 && Math.max(r, g, b) < 235) coloured++;
    n++;
  }
  return coloured / n > 0.002 ? 'color' : 'gray';
}

export function enhance(img, mode = 'auto') {
  const { width: w, height: h, data: d } = img;
  const bgs = backgroundPlanes(img);
  const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  const od = out.data;
  // 1) shading correction per channel (white paper becomes white, shadows and colour cast disappear).
  //    Bilinear upsampling of the block maps with per-column weights computed once (no per-pixel function calls).
  const { bw, bh, B } = bgs[0];
  const P0 = bgs[0].plane, P1 = bgs[1].plane, P2 = bgs[2].plane;
  const xi = new Int32Array(w), xf = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const f = Math.min(bw - 1.001, Math.max(0, (x + 0.5) / B - 0.5));
    xi[x] = f | 0;
    xf[x] = f - (f | 0);
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, (y + 0.5) / B - 0.5));
    const y0 = fy | 0, wy = fy - y0;
    const r0 = y0 * bw, r1 = r0 + bw;
    let i = y * w * 4;
    for (let x = 0; x < w; x++, i += 4) {
      const k0 = r0 + xi[x], k1 = r1 + xi[x], wx = xf[x];
      const a = (1 - wx) * (1 - wy), b = wx * (1 - wy), c = (1 - wx) * wy, e = wx * wy;
      const g0 = P0[k0] * a + P0[k0 + 1] * b + P0[k1] * c + P0[k1 + 1] * e;
      const g1 = P1[k0] * a + P1[k0 + 1] * b + P1[k1] * c + P1[k1 + 1] * e;
      const g2 = P2[k0] * a + P2[k0 + 1] * b + P2[k1] * c + P2[k1 + 1] * e;
      od[i] = (d[i] * 250) / (g0 > 30 ? g0 : 30);
      od[i + 1] = (d[i + 1] * 250) / (g1 > 30 ? g1 : 30);
      od[i + 2] = (d[i + 2] * 250) / (g2 > 30 ? g2 : 30);
      od[i + 3] = 255;
    }
  }
  // 2) levels: black point at the 0.5th percentile of luminance (ink), white point 245; gamma 1.25 deepens strokes
  const lum = new Float32Array(Math.ceil((w * h) / 7));
  for (let i = 0, j = 0; j < lum.length && i < od.length; i += 28, j++) lum[j] = 0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2];
  const black = Math.min(110, percentile(lum, 0.005));
  const white = 238;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.max(0, Math.min(1, (v - black) / (white - black)));
    lut[v] = Math.round(255 * Math.pow(t, 1.25));
  }
  const m = mode === 'auto' ? autoMode(out) : mode;
  if (m === 'color') {
    for (let i = 0; i < od.length; i += 4) {
      // stretch luminance through the LUT and keep chroma (stamps stay blue)
      const r = od[i], g = od[i + 1], b = od[i + 2];
      const Y = 0.299 * r + 0.587 * g + 0.114 * b;
      const Y2 = lut[Y | 0];
      const k = Y > 1 ? Y2 / Y : 0;
      od[i] = Y2 + (r * k - Y2) * 1.15;
      od[i + 1] = Y2 + (g * k - Y2) * 1.15;
      od[i + 2] = Y2 + (b * k - Y2) * 1.15;
    }
  } else {
    for (let i = 0; i < od.length; i += 4) {
      const Y = lut[(0.299 * od[i] + 0.587 * od[i + 1] + 0.114 * od[i + 2]) | 0];
      od[i] = od[i + 1] = od[i + 2] = Y;
    }
    if (m === 'bw') sauvola(out);
  }
  out.mode = m;
  return out;
}

/** Sauvola binarisation with integral images (window ≈ 1/40 of the width, k = 0.2) */
function sauvola(img) {
  const { width: w, height: h, data: d } = img;
  const I = new Float64Array((w + 1) * (h + 1)), I2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0, s2 = 0;
    for (let x = 0; x < w; x++) {
      const v = d[(y * w + x) << 2];
      s += v;
      s2 += v * v;
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s;
      I2[(y + 1) * (w + 1) + x + 1] = I2[y * (w + 1) + x + 1] + s2;
    }
  }
  const r = Math.max(7, Math.round(w / 80));
  const k = 0.2, R = 128;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = (x1 - x0) * (y1 - y0);
      const a = (y1) * (w + 1) + x1, b = y0 * (w + 1) + x1, c = y1 * (w + 1) + x0, e = y0 * (w + 1) + x0;
      const sum = I[a] - I[b] - I[c] + I[e];
      const sum2 = I2[a] - I2[b] - I2[c] + I2[e];
      const mean = sum / n;
      const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
      const t = mean * (1 + k * (sd / R - 1));
      out[y * w + x] = d[(y * w + x) << 2] > Math.min(t, 200) ? 255 : 0;
    }
  }
  for (let i = 0; i < out.length; i++) d[i << 2] = d[(i << 2) + 1] = d[(i << 2) + 2] = out[i];
}

function inkMask(img, maxSide = 700) {
  const { width: w, height: h, data: d } = img;
  const step = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  const W = Math.floor(w / step), H = Math.floor(h / step);
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = d[((y * step) * w + x * step) << 2] < 150 ? 1 : 0;
  return { m, W, H };
}

/** coefficient of variation of a profile over its central 80 % (text lines → rows alternate ink / gap) */
function profileCv(p) {
  const a = Math.floor(p.length * 0.1), b = Math.ceil(p.length * 0.9);
  let s = 0, s2 = 0;
  for (let i = a; i < b; i++) {
    s += p[i];
    s2 += p[i] * p[i];
  }
  const n = b - a, mean = s / n;
  return mean ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) / mean : 0;
}

/** 'h' when text lines run horizontally, 'v' when vertically, null when unclear */
export function lineDirection(img) {
  const { m, W, H } = inkMask(img);
  const rows = new Float64Array(H), cols = new Float64Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) (rows[y]++, cols[x]++);
  const cr = profileCv(rows), cc = profileCv(cols);
  if (cr > 1.35 * cc) return 'h';
  if (cc > 1.35 * cr) return 'v';
  return null;
}

/** Arabic prior: more text lines end flush at the right margin than at the left (positive = upright RTL) */
function rtlScore(img) {
  const { m, W, H } = inkMask(img);
  const lefts = [], rights = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1, n = 0;
    for (let x = 0; x < W; x++)
      if (m[y * W + x]) {
        if (l < 0) l = x;
        r = x;
        n++;
      }
    if (n > W * 0.02) (lefts.push(l), rights.push(r));
  }
  if (lefts.length < 10) return 0;
  const minL = Math.min(...lefts), maxR = Math.max(...rights), tol = W * 0.02;
  const right = rights.filter((x) => x >= maxR - tol).length, left = lefts.filter((x) => x <= minL + tol).length;
  return (right - left) / lefts.length;
}

/** quarter turns that make a cleaned page upright: only a landscape page whose text runs vertically is turned */
export function uprightTurns(img) {
  if (img.width <= img.height) return 0;
  if (lineDirection(img) !== 'v') return 0;
  return rtlScore(rotate(img, 1)) >= 0 ? 1 : 3;
}

export function rotate(img, quarterTurns) {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (!q) return img;
  const { width: w, height: h, data: d } = img;
  const W = q % 2 ? h : w, H = q % 2 ? w : h;
  const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  const o = out.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let X, Y;
      if (q === 1) [X, Y] = [h - 1 - y, x];
      else if (q === 2) [X, Y] = [w - 1 - x, h - 1 - y];
      else [X, Y] = [y, w - 1 - x];
      const si = (y * w + x) << 2, di = (Y * W + X) << 2;
      o[di] = d[si];
      o[di + 1] = d[si + 1];
      o[di + 2] = d[si + 2];
      o[di + 3] = 255;
    }
  return out;
}

// ───────────────────────── JPEG + PDF ─────────────────────────

/** SOF dimensions, component count and EXIF orientation from JPEG bytes (reads markers only) */
export function jpegInfo(b) {
  if (!b || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2, orientation = 1;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10; // TIFF header
      const le = b[t] === 0x49;
      const u16 = (p) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32 = (p) => (le ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 16777216 : b[p] * 16777216 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]));
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (u16(e) === 0x0112) orientation = u16(e + 8);
      }
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], components: b[i + 9], orientation };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Image size from the header only, never decoding (L12-67): JPEG SOFn (+ EXIF orientation), PNG IHDR, WebP VP8/VP8L/VP8X.
 * → { format: 'jpeg'|'png'|'webp', width, height, orientation } | null
 */
export function imageDims(b) {
  if (!b || b.length < 30) return null;
  if (b[0] === 0xff && b[1] === 0xd8) {
    const j = jpegInfo(b);
    return j && { format: 'jpeg', width: j.width, height: j.height, orientation: j.orientation };
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52) {
    const u32 = (p) => b[p] * 16777216 + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]);
    return { format: 'png', width: u32(16), height: u32(20), orientation: 1 };
  }
  const tag = (p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
  if (tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const c = tag(12);
    if (c === 'VP8 ') return { format: 'webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff, orientation: 1 };
    if (c === 'VP8L') return { format: 'webp', width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)), orientation: 1 };
    if (c === 'VP8X') return { format: 'webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), orientation: 1 };
  }
  return null;
}

/** 1-bit rows (MSB first), 1 = white — DeviceGray /BitsPerComponent 1. { png: true } prefixes each row with filter byte 0. */
export function packBits1(img, { png = false } = {}) {
  const { width: w, height: h, data: d } = img;
  const rowBytes = (w + 7) >> 3;
  const stride = rowBytes + (png ? 1 : 0);
  const off = png ? 1 : 0;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (d[(y * w + x) << 2] > 127) out[y * stride + off + (x >> 3)] |= 0x80 >> (x & 7);
  return out;
}

let CRC_TABLE = null;
export function crc32(bytes, crc = 0) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** 1-bit grey PNG from zlib-deflated rows (packBits1(img, { png: true }) → deflate) */
export function buildPng1(zlib, width, height) {
  const enc = new TextEncoder();
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type, data) => {
    const td = new Uint8Array(4 + data.length);
    td.set(enc.encode(type));
    td.set(data, 4);
    parts.push(new Uint8Array(u32(data.length)), td, new Uint8Array(u32(crc32(td))));
  };
  chunk('IHDR', new Uint8Array([...u32(width), ...u32(height), 1, 0, 0, 0, 0]));
  chunk('IDAT', zlib);
  chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** luminance standard deviation on a sparse grid (a blank/failed render is < 2, L12-72) */
export function lumaStd(img) {
  const d = img.data;
  const step = Math.max(4, ((d.length / 4 / 40000) | 0) * 4);
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += step) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    s += y;
    s2 += y * y;
    n++;
  }
  if (!n) return 0;
  const m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}

/** share of the frame covered by a quad (0..1); quad in the same px as w×h */
export function quadFraction(quad, w, h) {
  return w > 0 && h > 0 ? Math.min(1, quadArea(quad) / (w * h)) : 0;
}

/**
 * Minimal PDF 1.4 writer: one image per page, page box A4-long-side (842 pt) scaled to the image aspect.
 * pages: [{ bytes, width, height, kind: 'jpeg' (DCTDecode) | 'flate1' (1-bit FlateDecode, zlib bytes) , components }]
 */
export function buildPdf(pages, { title = 'Scan', producer = 'scan-core' } = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = (data) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b);
    offset += b.length;
  };
  const obj = (n, body, stream) => {
    offsets[n] = offset;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const n = pages.length;
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`);
  pages.forEach((p, i) => {
    const id = pageIds[i];
    const long = 841.89;
    const pw = p.width >= p.height ? long : (long * p.width) / p.height;
    const ph = p.width >= p.height ? (long * p.height) / p.width : long;
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, `<< /Length ${content.length} >>`, enc.encode(content));
    if (p.kind === 'flate1') {
      obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode /Length ${p.bytes.length} >>`, p.bytes);
    } else {
      const cs = p.components === 1 ? '/DeviceGray' : p.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      obj(id + 2, `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>`, p.bytes);
    }
  });
  const infoId = 3 + n * 3;
  const esc = (s) => String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '');
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  const date = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  obj(infoId, `<< /Title (${esc(title)}) /Producer (${esc(producer)}) /CreationDate (${date}) >>`);
  const xref = offset;
  const size = infoId + 1;
  let x = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let k = 1; k < size; k++) x += `${String(offsets[k]).padStart(10, '0')} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
