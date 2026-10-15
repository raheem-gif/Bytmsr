// v12 gate — media fixer: K-M1 (clean copy first whenever detection is confident; the printed-frame failure stays
// original-first), K-M2 (real Tesseract end to end when installed; the health card names it when missing), K-M3 (scan-core
// speed-ups keep the same results).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startTestApp } from './helpers.js';
import { detectQuad, grayOf, homography, quadFraction } from '../public/assets/js/lib/scan-core.js';
import { scanConfident, SCAN_CONFIDENCE } from '../src/services/documents.js';
import { tinyJpeg } from './fixtures/v12-media/fake-convert.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = path.join(ROOT, 'test/fixtures/v12-media');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ───────── synthetic phone photo: a sheet on a table, optional printed frame inside the page, optional bow ─────────
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
/** frame: { inset, width } as fractions of the page width (PW-M11 n01: a form with a printed border near the edge) */
function scene(W, H, corners, { seed = 7, frame = null, table = [92, 62, 44], bow = 0 } = {}) {
  const PW = 1000;
  const PH = 1414;
  const inv = homography(corners, [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }]);
  const rand = rng(seed);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (rand() - 0.5) * 24;
      let r = table[0] + n;
      let g = table[1] + n * 0.8;
      let b = table[2] + n * 0.6;
      const p = applyH(inv, x + 0.5, y + 0.5);
      const u = p.x / PW;
      const v = p.y / PH;
      const bulge = bow ? bow * 4 * v * (1 - v) : 0;
      if (u >= -bulge && u <= 1 + bulge && v >= 0 && v <= 1) {
        const pn = (rand() - 0.5) * 6;
        [r, g, b] = [236 + pn, 234 + pn, 228 + pn];
        const line = Math.floor((v * PH - 160) / 46);
        const inLine = v * PH > 160 && v * PH < PH - 160 && (v * PH - 160) % 46 < 18;
        const len = 0.45 + ((line * 37) % 40) / 100;
        const word = (u * PW + line * 23) % (50 + ((line * 13) % 40)) > 12;
        if (inLine && word && u < 0.85 && u > 0.85 - len * 0.75) [r, g, b] = [40, 40, 44];
        if (frame) {
          const du = Math.min(u, 1 - u) * PW;
          const dv = Math.min(v, 1 - v) * PH;
          const ins = frame.inset * PW;
          const wd = frame.width * PW;
          if ((du >= ins && du <= ins + wd && dv >= ins) || (dv >= ins && dv <= ins + wd && du >= ins)) [r, g, b] = [28, 52, 40];
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
/** box-average downscale (like drawImage with high quality) */
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
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const j = (yy * img.width + xx) * 4;
          acc[0] += img.data[j];
          acc[1] += img.data[j + 1];
          acc[2] += img.data[j + 2];
          n++;
        }
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
const rotRect = (cx, cy, w, h, deg) => {
  const a = (deg * Math.PI) / 180;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({ x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) }));
};
const W = 900;
const H = 1200;
/** like scanner.js: work 480 + fine gray (≤ 1200) → the detection, corner error against the truth and the docFile view */
function scan(img, truth) {
  const work = downscale(img, 480);
  const r = detectQuad(work, { refine: { width: img.width, height: img.height, gray: grayOf(img) } });
  if (!r || !r.quad) return { r, err: null };
  const k = img.width / work.width;
  const quad = r.quad.map((p) => ({ x: p.x * k, y: p.y * k }));
  let best = Infinity;
  for (let s = 0; s < 4; s++) best = Math.min(best, Math.max(...quad.map((p, i) => Math.hypot(p.x - truth[(i + s) % 4].x, p.y - truth[(i + s) % 4].y))) / Math.hypot(img.width, img.height));
  const quad01 = r.quad.map((p) => [p.x / work.width, p.y / work.height]);
  const params = { mode: 'color', partial: !!r.partial, adjusted: false, nested: !!r.nested, score: Math.round(r.score * 1000) / 1000, quads: [quad01] };
  return { r, err: best, area: quadFraction(r.quad, work.width, work.height), confident: scanConfident(params, { dims: [{ width: img.width, height: img.height }] }) };
}

describe('v12 gate K-M1 — the clean copy opens first whenever the detection is confident (L12-59 r3)', () => {
  test('scan-core: a printed frame inside the page wins the edge search → nested, so it is never shown first; plain and bowed pages are not nested', () => {
    const frame = rotRect(450, 600, 600, 848, 4);
    const f = scan(scene(W, H, frame, { seed: 11, frame: { inset: 0.03, width: 0.012 } }), frame);
    assert.ok(f.r?.quad, 'a quad');
    // the reproduction of PW-M11 n01: the detector sits on the printed frame (corner error > 1 %) …
    assert.ok(f.err > 0.01, `the synthetic frame is the hard case (err ${(f.err * 100).toFixed(2)} %)`);
    // … and K-M1 catches it: nested → the original opens first
    assert.equal(f.r.nested, true);
    assert.equal(f.confident, false);
    // a light table and a wider frame are caught the same way
    for (const [opts, deg] of [[{ frame: { inset: 0.03, width: 0.012 }, table: [200, 196, 188] }, -5], [{ frame: { inset: 0.05, width: 0.008 }, table: [160, 158, 150] }, 6]]) {
      const c = rotRect(450, 600, 600, 848, deg);
      const s = scan(scene(W, H, c, { seed: 13, ...opts }), c);
      assert.ok(s.err <= 0.01 || s.r.nested === true, `wrong crop not flagged (err ${(s.err * 100).toFixed(2)} %)`);
      assert.equal(s.confident && s.err > 0.01, false);
    }
    const plainC = rotRect(450, 600, 600, 848, 4);
    const plain = scan(scene(W, H, plainC, { seed: 11 }), plainC);
    assert.ok(plain.err < 0.01);
    assert.equal(plain.r.nested, false);
    assert.equal(plain.confident, true, 'a plain confident page now opens clean (area ≈ 0.47, was original under the 60 % rule)');
    // a bowed page: measured from the fitted curve, not the chord → not nested
    const bowC = rotRect(450, 600, 560, 792, 4);
    const bowed = scan(scene(W, H, bowC, { seed: 21, bow: 0.02 }), bowC);
    assert.ok(bowed.err < 0.01);
    assert.equal(bowed.r.nested, false);
  });

  test('scan-core: a small page (≈ 16 % of the photo) is confident; ≈ 9 % (h08 receipt) stays original-first', () => {
    const c16 = rotRect(450, 600, 345, 488, -6);
    const s16 = scan(scene(W, H, c16, { seed: 5 }), c16);
    assert.ok(s16.err < 0.01, `err ${s16.err}`);
    assert.ok(s16.area > 0.15 && s16.area < 0.18, `area ${s16.area}`);
    assert.equal(s16.confident, true);
    const c09 = rotRect(450, 600, 262, 370, 8);
    const s09 = scan(scene(W, H, c09, { seed: 5 }), c09);
    if (s09.r?.quad) assert.equal(s09.confident, false, `area ${s09.area}`);
  });

  test('scanConfident: score, area ≥ 15 %, convex, angles, side ratio and aspect; partial, nested and bw stay original; adjusted counts', () => {
    assert.deepEqual({ ...SCAN_CONFIDENCE }, { score: 0.75, minArea: 0.15, minAngle: 45, maxAngle: 135, maxSideRatio: 2.2, maxAspect: 3 });
    const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const dims = [{ width: 3000, height: 4000 }];
    const base = { mode: 'color', partial: false, adjusted: false, nested: false, score: 0.9 };
    const ok = (extra, d = dims) => scanConfident({ ...base, ...extra }, { dims: d });
    assert.equal(ok({ quads: [sq(0.2, 0.2, 0.8, 0.86)] }), true, 'area 0.40 (was original under the 60 % rule)');
    assert.equal(ok({ quads: [sq(0.3, 0.3, 0.7, 0.7)] }), true, 'area 0.16');
    assert.equal(ok({ quads: [sq(0.3, 0.3, 0.68, 0.68)] }), false, 'area 0.144');
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], score: 0.74 }), false, 'score under 0.75');
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], score: null }), false, 'no score');
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], partial: true }), false);
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], nested: true }), false, 'frame inside the paper');
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], nested: true, adjusted: true }), false, 'nested is only sent for a page whose corners were not moved');
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9)], mode: 'bw' }), false);
    assert.equal(ok({ quads: [sq(0.45, 0.45, 0.5, 0.5)], score: 0.2, adjusted: true }), true, 'corners set by the person');
    assert.equal(ok({ quads: [] }), false);
    assert.equal(ok({ quads: [[[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]]] }), false, 'crossed (non-convex)');
    assert.equal(ok({ quads: [[[0.1, 0.1], [0.9, 0.1], [0.9, NaN], [0.1, 0.9]]] }), false, 'non-finite');
    // aspect > 3 (a 0.9 × 0.15 strip of a 3000×4000 photo: 2700 × 600 px = 4.5)
    assert.equal(ok({ quads: [sq(0.05, 0.4, 0.95, 0.55)] }), false, 'strip');
    // the same strip is fine without dims (only area + convexity), but its area 0.135 fails anyway
    // a trapezoid with a short bottom (2400 vs 600 px: opposite sides 4 : 1) and a parallelogram with 42° / 138° corners
    assert.equal(ok({ quads: [[[0.1, 0.1], [0.9, 0.1], [0.95, 0.9], [0.75, 0.9]]] }), false, 'opposite sides 4 : 1');
    assert.equal(ok({ quads: [[[0.0, 0.25], [0.4, 0.25], [1.0, 0.65], [0.6, 0.65]]] }), false, '138° corner');
    assert.equal(scanConfident({ ...base, quads: [[[0.0, 0.25], [0.4, 0.25], [1.0, 0.65], [0.6, 0.65]]] }), true, 'without dims: area + convexity only');
    assert.equal(ok({ quads: [[[0.1, 0.1], [0.9, 0.1], [0.95, 0.9], [0.55, 0.9]]] }), true, 'a steep but plausible page (2 : 1, 67°)');
    // multi-page: every page must be confident
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9), sq(0.3, 0.3, 0.68, 0.68)] }, [dims[0], dims[0]]), false);
    assert.equal(ok({ quads: [sq(0.1, 0.1, 0.9, 0.9), sq(0.2, 0.2, 0.8, 0.8)] }, [dims[0], dims[0]]), true);
  });

  test('scanner.js carries nested into the scan block; moving the corners clears it', async () => {
    const S = await import('../public/assets/js/lib/scanner.js');
    const blob = (type = 'image/jpeg') => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type });
    const page = { raw: blob(), original: blob(), quad: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], detected: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], score: 0.97, partial: false, nested: true, method: 'lines', adjusted: false, mode: 'auto', outMode: 'color', turns: 0, clean: blob(), bits: null, width: 10, height: 14, state: 'ok' };
    const d = await S.docFile([page], { name: 'نموذج' });
    assert.equal(d.scan.nested, true);
    const moved = S.applyRender(page, [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]], 'auto', { blob: blob(), bits: null, width: 10, height: 14, mode: 'color', turns: 0 });
    assert.equal(moved.adjusted, true);
    assert.equal(moved.nested, false);
    assert.equal((await S.docFile([moved], { name: 'نموذج' })).scan.nested, false);
    const plain = await S.docFile([{ ...page, nested: false }], { name: 'نموذج' });
    assert.equal(plain.scan.nested, false);
    // the worker's detect() reports it
    assert.match(read('public/assets/js/lib/scan-worker.js'), /nested: !!r\.nested/);
  });

  describe('server: the upload contract and the server auto-clean follow the same rule', () => {
    let t;
    let dir;
    before(async () => {
      t = await startTestApp();
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-km1-'));
      const fake = path.join(dir, 'convert');
      fs.writeFileSync(fake, `#!${process.execPath}\nimport(${JSON.stringify(pathToFileURL(path.join(FIX, 'fake-convert.mjs')).href)}).then((m) => m.main(process.argv.slice(2), { log: null })).catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(3); });\n`, { mode: 0o755 });
      t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
      t.app.media.tools.configure({ env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: fake } });
    });
    after(async () => {
      t.app.media.setChildRunner(null);
      if (t) await t.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const b64 = (buf) => Buffer.from(buf).toString('base64');
    const orient6 = () => fs.readFileSync(path.join(FIX, 'orient-6.jpg'));
    const save = (extra) => {
      const scan = { v: 1, algo: 'scan-core@1', mode: 'color', turns: 0, pages: 1, quad: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.86], [0.2, 0.86]], score: 0.93, partial: false, adjusted: false, originals: [{ filename: 'ورقة-الأصل.jpg', mime: 'image/jpeg', data_base64: b64(orient6()) }], ...extra };
      return t.app.documents.save({ filename: 'ورقة.jpg', mime: 'image/jpeg', data_base64: b64(fs.readFileSync(path.join(FIX, 'orient-3.jpg'))), scan }, {}, { kind: 'client' });
    };
    const shown = (id) => {
      const d = t.app.documents.get(id);
      return d.display_file_id ? t.app.db.get('SELECT role FROM document_files WHERE id = ?', d.display_file_id).role : 'main';
    };

    test('a phone scan with the page at 40 % of the photo opens on the clean copy; nested opens on the original', () => {
      const a = save({});
      assert.equal(shown(a), 'main');
      assert.equal(t.app.documents.publicView(t.app.documents.get(a)).scan.display, 'clean');
      const b = save({ nested: true });
      assert.equal(shown(b), 'original');
      assert.equal(JSON.parse(t.app.db.get("SELECT params FROM document_files WHERE document_id = ? AND role = 'original'", b).params).nested, true, 'stored with the original');
      // only a real boolean counts
      assert.equal(t.app.media.checkScan({ v: 1, pages: 1, quad: [[0, 0], [1, 0], [1, 1], [0, 1]], score: 0.9, nested: 'yes', originals: [{ filename: 'a.jpg', mime: 'image/jpeg', data_base64: b64(orient6()) }] }, { surface: 'intake' }).params.nested, false);
    });

    test('server auto-clean (WhatsApp photo): a confident 30 % page is displayed clean; the child reporting nested keeps the original', async () => {
      const waPhoto = () => t.app.documents.save({ filename: `image-wa-${Math.random().toString(36).slice(2)}.jpg`, mime: 'image/jpeg', buffer: tinyJpeg(1200, 1600, 'scene=paper') }, {}, { kind: 'client' });
      for (const [nested, expectClean] of [[false, true], [true, false]]) {
        const id = waPhoto();
        t.app.media.setChildRunner(async (type, input) => {
          fs.writeFileSync(input.out, tinyJpeg(900, 1300));
          return { out: input.out, width: 900, height: 1300, bytes: 10, params: { quad: [[0.2, 0.2], [0.75, 0.2], [0.75, 0.75], [0.2, 0.75]], score: 0.95, area: 0.3, chroma: 4, ink: 0.08, turns: 0, nested } };
        });
        for (let i = 0; i < 4 && t.app.db.get("SELECT state FROM media_jobs WHERE kind = 'clean' AND document_id = ?", id)?.state === 'queued'; i++) await t.app.media.processDue({ budgetMs: 5000 });
        const job = t.app.db.get("SELECT state, error FROM media_jobs WHERE kind = 'clean' AND document_id = ?", id);
        assert.equal(job.state, 'done', JSON.stringify(job));
        const d = t.app.documents.get(id);
        const clean = t.app.db.get("SELECT id, params FROM document_files WHERE document_id = ? AND role = 'clean'", id);
        assert.ok(clean, 'the clean copy is stored either way');
        assert.equal(JSON.parse(clean.params).nested, nested);
        assert.equal(d.display_file_id === clean.id, expectClean, `nested=${nested}`);
      }
    });
  });

  test('spec note and source: the 60 % rule is gone, the new rule is documented', () => {
    const src = read('src/services/documents.js');
    assert.ok(!/quadArea\(q\) >= 0\.6/.test(src), 'old 60 % rule removed');
    assert.match(read('src/services/media.js'), /nested: rest\.nested === true/);
    assert.match(read('src/media-child.js'), /nested: !!det\.nested/);
  });
});

// ───────── K-M2: real Tesseract (ara+eng) end to end when installed; a clear health warning when it is not ─────────

const REAL_TESSERACT = ['/usr/bin/tesseract', '/usr/local/bin/tesseract'].find((f) => fs.existsSync(f)) || null;
let REAL_ARA = false;
if (REAL_TESSERACT) {
  try {
    REAL_ARA = execFileSync(REAL_TESSERACT, ['--list-langs'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').map((l) => l.trim()).includes('ara');
  } catch {
    REAL_ARA = false;
  }
}

describe('v12 gate K-M2 — OCR with the real Tesseract; «صحة النظام» names a missing one', () => {
  let t;
  let dir;
  before(async () => {
    t = await startTestApp();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-km2-'));
    t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
  });
  after(async () => {
    if (t) await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const configure = async (env) => {
    t.app.media.tools.configure({ env: { NODE_TEST_CONTEXT: '1', ...env } });
    await t.app.media.tools.probe({ force: true });
  };
  const ocrWarning = () => t.app.media.healthChecks().find((c) => c.key === 'media_ocr_tool');

  test('the job reads the lease page fixture with Tesseract ara+eng (or, without it, ends tool_missing and health warns)', async () => {
    await configure(REAL_TESSERACT ? { TESSERACT_BIN: REAL_TESSERACT } : { TESSERACT_BIN: path.join(dir, 'missing-tesseract') });
    const id = t.app.documents.save({ filename: 'عقد-إيجار.jpg', mime: 'image/jpeg', buffer: fs.readFileSync(path.join(FIX, 'ocr-lease-lines.jpg')) }, {}, { kind: 'client' });
    for (let i = 0; i < 6; i++) {
      const j = t.app.db.get("SELECT state FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", id);
      if (!j || !['queued', 'running'].includes(j.state)) break;
      t.app.db.run("UPDATE media_jobs SET next_at = ? WHERE document_id = ? AND state = 'queued'", new Date(Date.now() - 1000).toISOString(), id);
      await t.app.media.processDue({ budgetMs: 60_000 });
    }
    const job = t.app.db.get("SELECT state, error, provider FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", id);
    if (REAL_TESSERACT && REAL_ARA) {
      assert.equal(job.state, 'done', JSON.stringify(job));
      const row = t.app.db.get('SELECT provider, text, status FROM document_text WHERE document_id = ? AND page = 1', id);
      assert.equal(row.provider, 'tesseract');
      assert.equal(row.status, 'machine', 'machine text, staff review it (L12-17)');
      // the fixture holds 3 lines of the spike lease; Tesseract 5 reads these words on it
      const hits = ['الخميس', 'الموافق', 'الرحمن', 'ويحمل', 'بطاقة', 'السيدة', 'إبراهيم', 'المقيمة', 'النزهة', 'مستأجرة'].filter((w) => row.text.includes(w));
      assert.ok(hits.length >= 7, `words read: ${hits.join('، ')}`);
      assert.equal(t.app.documents.get(id).ocr_state, 'done');
      assert.ok(t.app.media.searchStaff('مستأجرة').some((d) => (d.document_id ?? d.id) === id), 'staff search finds it');
      assert.equal(ocrWarning(), undefined, 'no warning while Tesseract works');
    } else {
      assert.equal(job.state, 'skipped');
      assert.equal(job.error, 'tool_missing');
      assert.ok(ocrWarning(), 'health warns');
    }
  });

  test('health: missing or without Arabic → a warning that says so and how to fix it; MEDIA_TOOLS=off or OCR off → none', async () => {
    await configure({ TESSERACT_BIN: path.join(dir, 'missing-tesseract') });
    const w = ocrWarning();
    assert.ok(w, 'warning');
    assert.equal(w.level, 'warning');
    assert.equal(w.title, 'Tesseract غير مثبت على الخادم: لا يُقرأ نص المستندات');
    assert.match(w.detail, /MEDIA_TOOLS=1/);
    assert.match(w.detail, /tesseract-ocr-ara/);
    assert.match(w.detail, /«افحص الأدوات»/);
    // in «صحة النظام» too
    const admin = await t.login('admin');
    const health = (await admin.get('/api/admin/system/health')).body;
    assert.ok((health.checks || []).some((c) => c.key === 'media_ocr_tool'), 'H-M10: listed in «صحة النظام»');
    // no Arabic data
    const fake = path.join(dir, 'tesseract');
    fs.writeFileSync(fake, `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === '--version') console.log('tesseract 5.3.4');\nelse if (a[0] === '--list-langs') console.log('List of available languages (2):\\neng\\nosd');\n`, { mode: 0o755 });
    await configure({ TESSERACT_BIN: fake });
    assert.equal(ocrWarning()?.title, 'Tesseract مثبت بلا اللغة العربية: لا يُقرأ نص المستندات');
    // deliberate: tools off, or OCR switched off
    await configure({ MEDIA_TOOLS: 'off' });
    assert.equal(ocrWarning(), undefined);
    await configure({ TESSERACT_BIN: path.join(dir, 'missing-tesseract') });
    t.app.settings.set('ocr_provider', 'off');
    assert.equal(t.app.media.ocrProvider(), 'off');
    assert.equal(ocrWarning(), undefined);
    t.app.settings.set('ocr_provider', 'auto');
  });

  test('both Dockerfiles install Tesseract with Arabic by default (MEDIA_TOOLS=1) and the system card names the tool', () => {
    for (const f of ['Dockerfile', '../Dockerfile']) {
      const src = read(f);
      assert.match(src, /ARG MEDIA_TOOLS=1/, f);
      assert.match(src, /apt-get install -y --no-install-recommends imagemagick tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng tesseract-ocr-script-arab poppler-utils/, f);
    }
    const sys = read('public/assets/js/app/pages/admin/system.js');
    assert.match(sys, /tesseract: 'Tesseract \(قراءة النص\)'/);
    assert.match(sys, /missing: 'غير مثبتة'/);
    assert.match(sys, /no_ara: 'مثبتة بلا اللغة العربية'/);
  });
});

// ───────── K-M3: speed-ups with byte-identical results; served sizes within the §4 budgets; warm-up on the camera press ─────────
import zlib from 'node:zlib';
import * as NEW_CORE from '../public/assets/js/lib/scan-core.js';
import * as REF_CORE from './fixtures/v12-media/scan-core.km3-reference.js';

describe('v12 gate K-M3 — scanner speed-ups keep the results; budgets; warm-up', () => {
  const scenes = [
    ['plain', rotRect(450, 600, 600, 848, 4), { seed: 11 }],
    ['frame', rotRect(450, 600, 600, 848, 4), { seed: 11, frame: { inset: 0.03, width: 0.012 } }],
    ['bowed', rotRect(450, 600, 560, 792, 4), { seed: 21, bow: 0.02 }],
    ['light table, small', rotRect(430, 610, 345, 488, -6), { seed: 5, table: [190, 186, 178] }],
  ];
  const run = (M, img) => {
    const work = downscale(img, 480);
    const r = M.detectQuad(work, { refine: { width: img.width, height: img.height, gray: M.grayOf(img) } });
    return r;
  };
  for (const [name, corners, opts] of scenes) {
    test(`detectQuad and the render are identical to the pre-K-M3 engine: ${name}`, () => {
      const img = scene(W, H, corners, opts);
      const a = run(REF_CORE, img);
      const b = run(NEW_CORE, img);
      assert.ok(a?.quad && b?.quad);
      assert.deepEqual(b.quad.map((p) => [p.x, p.y]), a.quad.map((p) => [p.x, p.y]));
      assert.deepEqual([b.score, b.support, b.partial, b.nested, b.method, b.refined, b.bow, b.candidates, b.lines], [a.score, a.support, a.partial, a.nested, a.method, a.refined, a.bow, a.candidates, a.lines]);
      const k = img.width / 360;
      const q = b.quad.map((p) => ({ x: p.x * k, y: p.y * k }));
      const size = NEW_CORE.pageSize(q, img.width, img.height, { maxSide: 1754 });
      const wa = REF_CORE.warp(img, q, size.w, size.h);
      const wb = NEW_CORE.warp(img, q, size.w, size.h);
      assert.ok(Buffer.from(wa.data).equals(Buffer.from(wb.data)), 'warp');
      for (const mode of ['auto', 'color', 'gray', 'bw']) {
        const ea = REF_CORE.enhance(wa, mode);
        const eb = NEW_CORE.enhance(wb, mode);
        assert.equal(eb.mode, ea.mode);
        assert.ok(Buffer.from(ea.data).equals(Buffer.from(eb.data)), `enhance ${mode}`);
      }
    });
  }

  test('served sizes stay within the spec §4 budgets (scan-core ≤ 14,336 B br; scanner + scan-sheet + scan-worker ≤ 10,240 B br)', async () => {
    const t = await startTestApp();
    try {
      const size = async (p) => {
        const r = await fetch(t.base + p, { headers: { 'accept-encoding': 'br' } });
        assert.equal(r.status, 200, p);
        // fetch decodes the body; its brotli size (default quality, as the server compresses) is what goes over the wire
        return zlib.brotliCompressSync(Buffer.from(await r.arrayBuffer())).length;
      };
      const core = await size('/assets/js/lib/scan-core.js');
      assert.ok(core <= 14336, `scan-core ${core} B br`);
      const trio = (await size('/assets/js/lib/scanner.js')) + (await size('/assets/js/lib/scan-sheet.js')) + (await size('/assets/js/lib/scan-worker.js'));
      assert.ok(trio <= 10240, `scanner + scan-sheet + scan-worker ${trio} B br`);
    } finally {
      await t.close();
    }
  });

  test('warm-up: the engine runs once on a synthetic page without a canvas; the picker warms only on a press and never when scanning is off', async () => {
    const W8 = await import('../public/assets/js/lib/scan-worker.js');
    assert.equal(W8.warmup(), true);
    const S = await import('../public/assets/js/lib/scanner.js');
    assert.equal(typeof S.warm, 'function');
    const scanner = read('public/assets/js/lib/scanner.js');
    assert.match(scanner, /serial\(\(\) => call\('warmup'\)\)/, 'in the same queue as the photos');
    assert.match(scanner, /if \(getWorker\(\)\) run\(\);\s*else setTimeout\(run, 600\);/, 'main thread: after the camera opened');
    const up = read('public/assets/js/public/upload.js');
    assert.match(up, /const warm = \(\) => \{\s*if \(scan !== 'off' && scanSwitchOn\(\)\) loadScanner\(\)/);
    assert.equal((up.match(/onPointerdown: warm,/g) || []).length, 2, 'camera and gallery buttons');
    // still never on page load: no top-level loadScanner() call in the module
    assert.ok(!/^loadScanner\(/m.test(up));
  });
});
