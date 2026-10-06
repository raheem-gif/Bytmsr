// مُرمِّز رموز QR بدون أي مكتبات خارجية (ISO/IEC 18004): وضع البايت (UTF-8)، مستوى تصحيح الأخطاء M،
// الإصدارات 1–10 (حتى 213 بايتًا — تكفي روابط otpauth:// لتطبيقات المصادقة)، مع اختيار أفضل قناع آليًا.
// encodeQr(text) دالة نقية (تعمل في المتصفح وفي Node للاختبارات)، وqrSvg(text) ترسمه SVG حادًّا بأي حجم.
import { svg } from '../../lib/h.js';

// [عدد كلمات تصحيح الخطأ لكل كتلة، [[عدد الكتل، كلمات البيانات لكل كتلة], ...]] — مستوى M
const ECC_M = [
  null,
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];
// مراكز أنماط المحاذاة لكل إصدار
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const QR_MAX_VERSION = 10;

// ===== حساب الحقل المنتهي GF(256) بكثير الحدود 0x11D =====
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}
/** معاملات مولّد ريد-سولومون (بدون المعامل الأعلى = 1) */
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}
/** باقي القسمة = كلمات تصحيح الخطأ */
function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

function utf8(text) {
  return Array.from(new TextEncoder().encode(String(text)));
}
function dataCapacity(version) {
  const [, groups] = ECC_M[version];
  return groups.reduce((s, [n, k]) => s + n * k, 0);
}
function countBits(version) {
  return version <= 9 ? 8 : 16;
}

/** تقسيم كلمات البيانات إلى كتل، وإضافة تصحيح الخطأ، ثم التشبيك */
function addEccAndInterleave(data, version) {
  const [ecLen, groups] = ECC_M[version];
  const divisor = rsDivisor(ecLen);
  const blocks = [];
  let k = 0;
  for (const [count, size] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + size);
      k += size;
      blocks.push({ data: d, ecc: rsRemainder(d, divisor) });
    }
  }
  const out = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** بتات معلومات الصيغة (مستوى M = 00) مع BCH(15,5) والقناع 0x5412 */
export function formatBits(mask) {
  const data = (0 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
/** بتات معلومات الإصدار (للإصدار 7 فأعلى) مع BCH(18,6) */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function buildMatrix(version, codewords, mask) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  // أنماط التوقيت
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // أنماط البحث مع الفواصل
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  // أنماط المحاذاة
  const pos = ALIGN[version];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // معلومات الصيغة
  const fb = formatBits(mask);
  for (let i = 0; i <= 5; i++) set(8, i, bit(fb, i));
  set(8, 7, bit(fb, 6));
  set(8, 8, bit(fb, 7));
  set(7, 8, bit(fb, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fb, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fb, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fb, i));
  set(8, size - 8, true); // الوحدة الداكنة الثابتة
  // معلومات الإصدار
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(vb, i));
      set(b, a, bit(vb, i));
    }
  }
  // وضع البيانات بنمط متعرج من الأسفل يمينًا، مع تطبيق القناع
  const maskFn = MASKS[mask];
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        let dark = false;
        if (i < total) {
          dark = bit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
        m[y][x] = dark !== maskFn(x, y);
      }
    }
  }
  return m;
}

/** درجة العقوبة (للمفاضلة بين الأقنعة الثمانية) */
function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  const pattern = [true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let k = 1; k <= size; k++) {
      if (k < size && line[k] === line[k - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let k = 0; k + 7 <= size; k++) {
      if (!pattern.every((p, n) => line[k + n] === p)) continue;
      const before = k >= 4 && [1, 2, 3, 4].every((n) => !line[k - n]);
      const after = k + 11 <= size && [7, 8, 9, 10].every((n) => !line[k + n]);
      if (before || after) score += 40;
    }
  }
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * ترميز نص إلى مصفوفة QR.
 * @param {string} text
 * @param {{mask?:number, minVersion?:number}} [opts] mask لفرض قناع بعينه (للاختبارات)
 * @returns {{version:number, size:number, mask:number, modules:boolean[][]}}
 */
export function encodeQr(text, { mask = null, minVersion = 1 } = {}) {
  const bytes = utf8(text);
  let version = Math.max(1, minVersion);
  while (version <= QR_MAX_VERSION && 4 + countBits(version) + bytes.length * 8 > dataCapacity(version) * 8) version++;
  if (version > QR_MAX_VERSION) throw new RangeError('النص أطول من سعة رمز QR المدعومة');
  const capBits = dataCapacity(version) * 8;
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capBits / 8; pad ^= 0xec ^ 0x11) data.push(pad);
  const codewords = addEccAndInterleave(data, version);
  let best = null;
  for (let k = 0; k < 8; k++) {
    if (mask !== null && k !== mask) continue;
    const modules = buildMatrix(version, codewords, k);
    const score = mask !== null ? 0 : penalty(modules);
    if (!best || score < best.score) best = { version, size: modules.length, mask: k, modules, score };
  }
  return { version: best.version, size: best.size, mask: best.mask, modules: best.modules };
}

/**
 * رمز QR كعنصر SVG (مسار واحد، حواف حادة، منطقة هادئة 4 وحدات). الألوان ثابتة (أسود على أبيض) لضمان القراءة في الوضع الداكن.
 * @param {string} text
 * @param {{size?:number, label?:string, className?:string}} [opts]
 */
export function qrSvg(text, { size = 220, label = 'رمز QR', className } = {}) {
  const { size: n, modules } = encodeQr(text);
  const quiet = 4;
  const dim = n + quiet * 2;
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (modules[y][x]) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  }
  return svg(
    'svg',
    {
      class: ['qr-code', className],
      viewBox: `0 0 ${dim} ${dim}`,
      width: size,
      height: size,
      role: 'img',
      'aria-label': label,
      'shape-rendering': 'crispEdges',
    },
    svg('rect', { width: dim, height: dim, fill: '#ffffff' }),
    svg('path', { d, fill: '#000000' }),
  );
}
