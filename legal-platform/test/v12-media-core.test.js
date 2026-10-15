// v12 media (MD-1): نواة ماسح المستندات scan-core.js على صور اصطناعية مبنية بـ JS خالص (بلا canvas).
// المشهد: طاولة داكنة مشوّشة + ورقة فاتحة بأسطر «نص» داكنة، بزاوية أو منظور، مع ظل اختياري. الأركان الحقيقية معروفة بالضبط.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  detectQuad,
  pageSize,
  warp,
  enhance,
  autoMode,
  uprightTurns,
  rotate,
  jpegInfo,
  packBits1,
  buildPdf,
  buildPng1,
  crc32,
  homography,
  orderQuad,
  grayOf,
  lumaStd,
  quadFraction,
  imageDims,
} from '../public/assets/js/lib/scan-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'test/fixtures/v12-media');

// ───────── مولد المشهد ─────────

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const applyH = (H, x, y) => {
  const d = H[6] * x + H[7] * y + 1;
  return { x: (H[0] * x + H[1] * y + H[2]) / d, y: (H[3] * x + H[4] * y + H[5]) / d };
};

/**
 * corners: 4 نقاط الورقة في الصورة [TL,TR,BR,BL] (px). bow: انتفاخ الحافتين اليمنى واليسرى (نسبة من عرض الورقة).
 * shadow: أقل معامل إضاءة (1 = بلا ظل) يتدرج أفقيًا. stamp: دائرة زرقاء على الورقة.
 */
function scene(W, H, corners, { seed = 7, bow = 0, shadow = 1, stamp = false, paper = [236, 234, 228], grain = true, textTo = 1 } = {}) {
  const PW = 1000;
  const PH = 1414;
  const page = [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }];
  const inv = corners ? homography(corners, page) : null;
  const rand = rng(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // طاولة خشب داكن مشوّش
      const n = (rand() - 0.5) * 30 + (grain ? Math.sin(x * 0.05 + y * 0.013) * 8 : 0);
      let r = 92 + n;
      let g = 62 + n * 0.8;
      let b = 44 + n * 0.6;
      if (inv) {
        const p = applyH(inv, x + 0.5, y + 0.5);
        const u = p.x / PW;
        const v = p.y / PH;
        const bulge = bow ? bow * 4 * v * (1 - v) : 0;
        if (u >= -bulge && u <= 1 + bulge && v >= 0 && v <= 1) {
          [r, g, b] = paper;
          const pn = (rand() - 0.5) * 6;
          r += pn;
          g += pn;
          b += pn;
          // أسطر نص محاذاة لليمين (عربي): أشرطة داكنة بأطوال مختلفة
          const line = Math.floor((v * PH - 160) / 46);
          const inLine = v * PH > 160 && v * PH < Math.min(PH - 160, textTo * PH) && (v * PH - 160) % 46 < 18;
          const len = 0.45 + ((line * 37) % 40) / 100;
          // كلمات لا أشرطة متصلة: فراغ كل 50–90 وحدة
          const word = (u * PW + line * 23) % (50 + ((line * 13) % 40)) > 12;
          if (inLine && word && u < 0.9 && u > 0.9 - len * 0.8) [r, g, b] = [40, 40, 44];
          if (stamp) {
            const dx = u * PW - 260;
            const dy = v * PH - 1200;
            const rr = Math.hypot(dx, dy);
            if (rr < 90 && rr > 62) [r, g, b] = [40, 70, 190];
          }
        }
      }
      const k = shadow < 1 ? shadow + (1 - shadow) * (x / W) : 1;
      data[i] = r * k;
      data[i + 1] = g * k;
      data[i + 2] = b * k;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** تصغير بمتوسط المربعات (مثل drawImage بجودة عالية) */
function downscale(img, maxSide) {
  const s = maxSide / Math.max(img.width, img.height);
  const w = Math.round(img.width * s);
  const h = Math.round(img.height * s);
  const out = new Uint8ClampedArray(w * h * 4);
  const fx = img.width / w;
  const fy = img.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      const y0 = Math.floor(y * fy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      const acc = [0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const j = (yy * img.width + xx) * 4;
          acc[0] += img.data[j];
          acc[1] += img.data[j + 1];
          acc[2] += img.data[j + 2];
          n++;
        }
      const o = (y * w + x) * 4;
      out[o] = acc[0] / n;
      out[o + 1] = acc[1] / n;
      out[o + 2] = acc[2] / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** مثل scanner.js: work 480 + fine 1200 رمادي، ثم الأركان بإحداثيات المصدر */
function detectOn(img) {
  const work = downscale(img, 480);
  const fine = img.width === 1200 || img.height === 1200 ? img : downscale(img, 1200);
  const r = detectQuad(work, { refine: { width: fine.width, height: fine.height, gray: grayOf(fine) } });
  if (!r || !r.quad) return { r, quad: null };
  const k = img.width / work.width;
  return { r, quad: r.quad.map((p) => ({ x: p.x * k, y: p.y * k })) };
}

const cornerError = (quad, truth, W, H) => Math.max(...quad.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y))) / Math.hypot(W, H);

function rotRect(cx, cy, w, h, deg) {
  const a = (deg * Math.PI) / 180;
  const pts = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return pts.map(([x, y]) => ({ x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) }));
}

const W = 900;
const H = 1200;
const POSES = {
  straight: rotRect(450, 600, 560, 792, 3),
  rotated17: rotRect(450, 600, 520, 735, 17),
  rotatedNeg12: rotRect(440, 620, 540, 763, -12),
  perspective: [
    { x: 250, y: 200 },
    { x: 650, y: 210 },
    { x: 760, y: 1020 },
    { x: 140, y: 1010 },
  ],
  small: rotRect(420, 520, 380, 537, 8),
  steep: [
    { x: 300, y: 260 },
    { x: 700, y: 180 },
    { x: 780, y: 990 },
    { x: 190, y: 1060 },
  ],
};

// ───────── الاكتشاف ─────────

for (const [name, corners] of Object.entries(POSES)) {
  test(`detectQuad: ${name} → corner error < 1 %`, () => {
    const img = scene(W, H, corners, { seed: name.length * 13 + 1 });
    const { r, quad } = detectOn(img);
    assert.ok(quad, `no quad (score ${r?.score})`);
    const err = cornerError(quad, corners, W, H);
    assert.ok(err < 0.01, `corner error ${(err * 100).toFixed(2)} %`);
    assert.equal(r.partial, false);
  });
}

test('detectQuad: no paper → no quad', () => {
  const img = scene(800, 600, null, { seed: 3, grain: false });
  const { r, quad } = detectOn(img);
  assert.equal(quad, null);
  assert.ok(!r || r.quad === null);
});

test('detectQuad: page larger than the frame → partial', () => {
  // الحافة السفلية خارج الصورة
  const corners = [
    { x: 150, y: 260 },
    { x: 760, y: 240 },
    { x: 800, y: 1420 },
    { x: 110, y: 1440 },
  ];
  const img = scene(W, H, corners, { seed: 11, textTo: 0.4 }); // نص في أعلى الورقة فقط، وأسفلها الظاهر فارغ
  const { r, quad } = detectOn(img);
  assert.ok(quad, 'a quad for the visible part');
  assert.equal(r.partial, true);
});

test('detectQuad: bowed side edges (quadratic) → corner error < 1 %', () => {
  const corners = rotRect(450, 600, 560, 792, 4);
  const img = scene(W, H, corners, { seed: 21, bow: 0.02 });
  const { quad } = detectOn(img);
  assert.ok(quad);
  assert.ok(cornerError(quad, corners, W, H) < 0.01);
});

test('detectQuad: works under a 0.55 shadow gradient', () => {
  const corners = rotRect(450, 600, 560, 792, -6);
  const { quad } = detectOn(scene(W, H, corners, { seed: 5, shadow: 0.55 }));
  assert.ok(quad);
  assert.ok(cornerError(quad, corners, W, H) < 0.01);
});

// ───────── الهندسة ─────────

test('homography: round trip < 1e-6', () => {
  const src = [
    { x: 12, y: 30 },
    { x: 410, y: 5 },
    { x: 380, y: 520 },
    { x: 40, y: 470 },
  ];
  const dst = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 424 },
    { x: 0, y: 424 },
  ];
  const Hm = homography(src, dst);
  const Hi = homography(dst, src);
  for (let i = 0; i < 4; i++) {
    const p = applyH(Hm, src[i].x, src[i].y);
    assert.ok(Math.abs(p.x - dst[i].x) < 1e-6 && Math.abs(p.y - dst[i].y) < 1e-6);
  }
  for (const q of [
    { x: 100, y: 100 },
    { x: 250, y: 333 },
  ]) {
    const back = applyH(Hi, ...Object.values(applyH(Hm, q.x, q.y)));
    assert.ok(Math.abs(back.x - q.x) < 1e-6 && Math.abs(back.y - q.y) < 1e-6);
  }
});

test('orderQuad: any order → TL, TR, BR, BL', () => {
  const q = orderQuad([
    { x: 90, y: 95 },
    { x: 10, y: 8 },
    { x: 12, y: 99 },
    { x: 95, y: 5 },
  ]);
  assert.deepEqual(
    q.map((p) => [p.x, p.y]),
    [
      [10, 8],
      [95, 5],
      [90, 95],
      [12, 99],
    ],
  );
});

test('pageSize: A4 snap within 6 % and the size cap', () => {
  const q = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1400 },
    { x: 0, y: 1400 },
  ];
  const s = pageSize(q, 3000, 4000, { maxSide: 1754 });
  assert.equal(s.a4, true);
  assert.ok(Math.abs(s.aspect - Math.SQRT2) < 1e-9);
  assert.equal(s.h, 1400); // لا تكبير أكثر مما في الصورة
  const s2 = pageSize([{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2800 }, { x: 0, y: 2800 }], 3000, 4000, { maxSide: 1754 });
  assert.equal(s2.h, 1754);
  assert.equal(pageSize(q, 3000, 4000, { snap: false }).a4, false);
});

test('pageSize: Zhang–He aspect from a synthetic camera projection (within 3 %)', () => {
  // مستطيل 1 × 1.6 في الفضاء، كاميرا بُعدها البؤري = قطر الصورة، دوران عام (ميل 25° وانحراف 15° ولفّ 8°)
  const Wi = 3000;
  const Hi = 4000;
  const f = Math.hypot(Wi, Hi);
  const [a, b, c] = [25, 15, 8].map((d) => (d * Math.PI) / 180);
  const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const Rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const Ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const Rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  const R = mul(Rz, mul(Ry, Rx));
  const quad = [[-0.5, -0.8], [0.5, -0.8], [0.5, 0.8], [-0.5, 0.8]].map(([x, y]) => {
    const X = R[0][0] * x + R[0][1] * y + 0.1;
    const Y = R[1][0] * x + R[1][1] * y - 0.05;
    const Z = R[2][0] * x + R[2][1] * y + 3;
    return { x: Wi / 2 + (f * X) / Z, y: Hi / 2 + (f * Y) / Z };
  });
  const s = pageSize(quad, Wi, Hi, { snap: false, maxSide: 2000 });
  assert.equal(s.method, 'zhang');
  assert.ok(Math.abs(s.aspect - 1.6) / 1.6 < 0.03, `aspect ${s.aspect}`);
  // جانبا الشكل في الصورة وحدهما يعطيان نسبة بعيدة (هذا ما يصححه Zhang–He)
  const sides = Math.max(Math.hypot(quad[0].x - quad[3].x, quad[0].y - quad[3].y), Math.hypot(quad[1].x - quad[2].x, quad[1].y - quad[2].y)) /
    Math.max(Math.hypot(quad[0].x - quad[1].x, quad[0].y - quad[1].y), Math.hypot(quad[3].x - quad[2].x, quad[3].y - quad[2].y));
  assert.ok(Math.abs(sides - 1.6) / 1.6 > 0.05);
});

test('warp: identity quad returns the same pixels', () => {
  const rand = rng(9);
  const src = { width: 50, height: 40, data: new Uint8ClampedArray(50 * 40 * 4).map((_, i) => ((i & 3) === 3 ? 255 : Math.floor(rand() * 256))) };
  const out = warp(
    src,
    [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 0, y: 40 },
    ],
    50,
    40,
  );
  let maxDiff = 0;
  for (let i = 0; i < src.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(src.data[i] - out.data[i]));
  assert.ok(maxDiff <= 1, `max diff ${maxDiff}`);
});

// ───────── التحسين ─────────

function flatPage(w, h, { shadow = 1, stamp = false } = {}) {
  return scene(w, h, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], { shadow, stamp, seed: 4, paper: [226, 224, 218] });
}

test('enhance: paper > 240 and ink < 80 under a 0.55 shadow', () => {
  const img = flatPage(400, 566, { shadow: 0.55 });
  const out = enhance(img, 'gray');
  assert.equal(out.mode, 'gray');
  // الورقة: صفوف بلا نص قرب الحافة العلوية، والحبر: مركز أول سطر نص
  let paper = 0;
  let pn = 0;
  for (let y = 10; y < 40; y++)
    for (let x = 10; x < 390; x++) {
      paper += out.data[(y * 400 + x) * 4];
      pn++;
    }
  assert.ok(paper / pn > 240, `paper mean ${paper / pn}`);
  const inkY = Math.round(((160 + 9) / 1414) * 566);
  const inkX = Math.round(0.85 * 400);
  let ink = 0;
  let inN = 0;
  for (let x = inkX - 20; x < inkX; x++) {
    ink += out.data[(inkY * 400 + x) * 4];
    inN++;
  }
  assert.ok(ink / inN < 80, `ink mean ${ink / inN}`);
});

test('enhance: bw output is only 0 and 255', () => {
  const out = enhance(flatPage(300, 424, { shadow: 0.7 }), 'bw');
  assert.equal(out.mode, 'bw');
  for (let i = 0; i < out.data.length; i += 4) assert.ok(out.data[i] === 0 || out.data[i] === 255);
  assert.ok(out.data.some((v, i) => i % 4 === 0 && v === 0), 'some ink survives');
});

test('autoMode: colour with a blue stamp, grey without', () => {
  assert.equal(autoMode(flatPage(400, 566, { stamp: true })), 'color');
  assert.equal(autoMode(flatPage(400, 566)), 'gray');
  assert.equal(enhance(flatPage(400, 566, { stamp: true }), 'auto').mode, 'color');
});

test('uprightTurns: 0 for a portrait page, 1 or 3 for a landscape page with vertical lines', () => {
  assert.equal(uprightTurns(flatPage(300, 424)), 0);
  const land = rotate(enhance(flatPage(300, 424), 'gray'), 1);
  assert.ok(land.width > land.height);
  assert.ok([1, 3].includes(uprightTurns(land)));
});

test('rotate: four quarter turns = identity; one turn swaps the sides', () => {
  const img = flatPage(30, 20);
  const r1 = rotate(img, 1);
  assert.equal(r1.width, 20);
  assert.equal(r1.height, 30);
  const r4 = rotate(rotate(rotate(r1, 1), 1), 1);
  assert.deepEqual(Array.from(r4.data), Array.from(img.data));
  assert.equal(rotate(img, 0), img);
});

test('lumaStd: a blank render is < 2, a page is not; quadFraction', () => {
  assert.ok(lumaStd({ width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) }) < 2);
  assert.ok(lumaStd(flatPage(200, 283)) > 10);
  assert.ok(Math.abs(quadFraction([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 0, y: 100 }], 100, 100) - 0.5) < 1e-9);
});

// ───────── JPEG وPDF وPNG ─────────

test('jpegInfo: seeded death certificate and EXIF orientation fixtures', () => {
  const info = jpegInfo(fs.readFileSync(path.join(ROOT, 'src/seed-assets/v91-death-certificate.jpg')));
  assert.ok(info && info.width > 0 && info.height > 0);
  assert.equal(info.orientation, 1);
  assert.ok([1, 3].includes(info.components));
  for (const o of [3, 6, 8]) {
    const j = jpegInfo(fs.readFileSync(path.join(FIX, `orient-${o}.jpg`)));
    assert.deepEqual([j.width, j.height, j.orientation], [64, 40, o]);
  }
  assert.equal(jpegInfo(Buffer.from('not a jpeg')), null);
  assert.equal(jpegInfo(fs.readFileSync(path.join(FIX, 'sample.heic'))), null);
});

test('imageDims: header-only sizes for JPEG (+ orientation), PNG IHDR and the three WebP chunks', () => {
  const read = (f) => fs.readFileSync(path.join(FIX, f));
  assert.deepEqual(imageDims(read('orient-6.jpg')), { format: 'jpeg', width: 64, height: 40, orientation: 6 });
  assert.deepEqual(imageDims(read('lossy.webp')), { format: 'webp', width: 70, height: 45, orientation: 1 });
  assert.deepEqual(imageDims(read('lossless.webp')), { format: 'webp', width: 71, height: 46, orientation: 1 });
  assert.deepEqual(imageDims(read('alpha.webp')), { format: 'webp', width: 73, height: 47, orientation: 1 });
  // قنبلة PNG: 7200×7200 بت واحد في بضعة كيلوبايت؛ الأبعاد تُقرأ دون فك (L12-67)
  const rows = new Uint8Array((1 + 900) * 7200);
  const bomb = buildPng1(zlib.deflateSync(rows, { level: 9 }), 7200, 7200);
  assert.ok(bomb.length < 12_000, `bomb ${bomb.length} B`);
  assert.deepEqual(imageDims(bomb), { format: 'png', width: 7200, height: 7200, orientation: 1 });
  assert.equal(imageDims(read('sample.heic')), null);
  assert.equal(imageDims(Buffer.from('%PDF-1.4 not an image at all, long enough')), null);
});

test('packBits1: MSB first, 1 = white; png rows carry a filter byte', () => {
  const w = 10;
  const data = new Uint8ClampedArray(w * 2 * 4);
  const white = [0, 2, 9, 10, 19]; // pixels (row 0: 0, 2, 9; row 1: 0, 9)
  for (const p of white) data[p * 4] = 255;
  const bits = packBits1({ width: w, height: 2, data });
  assert.deepEqual(Array.from(bits), [0b10100000, 0b01000000, 0b10000000, 0b01000000]);
  const png = packBits1({ width: w, height: 2, data }, { png: true });
  assert.deepEqual(Array.from(png), [0, 0b10100000, 0b01000000, 0, 0b10000000, 0b01000000]);
});

test('buildPng1: valid chunks and CRCs; rows inflate back', () => {
  const img = enhance(flatPage(120, 170), 'bw');
  const rows = packBits1(img, { png: true });
  const png = buildPng1(zlib.deflateSync(rows), img.width, img.height);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buf = Buffer.from(png);
  let o = 8;
  const types = [];
  let idat = null;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    assert.equal(buf.readUInt32BE(o + 8 + len), crc32(buf.subarray(o + 4, o + 8 + len)), `${type} crc`);
    if (type === 'IHDR') assert.deepEqual([body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9]], [120, 170, 1, 0]);
    if (type === 'IDAT') idat = body;
    types.push(type);
    o += 12 + len;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  assert.deepEqual(Buffer.compare(zlib.inflateSync(idat), Buffer.from(rows)), 0);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('buildPdf: header, /Count, xref offsets point at "n 0 obj", startxref at xref', () => {
  const jpeg = fs.readFileSync(path.join(FIX, 'orient-6.jpg'));
  const ji = jpegInfo(jpeg);
  const bw = enhance(flatPage(100, 141), 'bw');
  const pdf = Buffer.from(
    buildPdf(
      [
        { kind: 'jpeg', bytes: jpeg, width: ji.width, height: ji.height, components: ji.components },
        { kind: 'flate1', bytes: zlib.deflateSync(packBits1(bw)), width: 100, height: 141 },
        { kind: 'jpeg', bytes: jpeg, width: ji.width, height: ji.height, components: ji.components },
      ],
      { title: 'عقد (مسح)', producer: 'scan-core' },
    ),
  );
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.match(text, /\/Count 3 >>/);
  assert.match(text, /\/BitsPerComponent 1 \/Filter \/FlateDecode/);
  assert.equal((text.match(/\/Filter \/DCTDecode/g) || []).length, 2);
  const startxref = Number(text.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(text.startsWith('xref\n', startxref));
  const rows = text.slice(startxref).split('\n');
  const size = Number(rows[1].split(' ')[1]);
  for (let n = 1; n < size; n++) {
    const off = Number(rows[2 + n].slice(0, 10));
    assert.ok(text.startsWith(`${n} 0 obj\n`, off), `object ${n} at ${off}`);
  }
  // العنوان العربي لا يكسر الملف (يُحذف ما ليس ASCII)
  assert.match(text, /\/Title \(\s*\\\(\s*\\\)\)/);
});
