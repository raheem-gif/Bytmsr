// v12 media (MD-9) — ImageMagick مزيف للاختبارات: يجيب -version و-list policy (بقاعدة منع كل الصيغ)، ويرسم عند «الفك»
// مشهدًا اصطناعيًا بالحجم المطلوب (طاولة داكنة وورقة فاتحة بأسطر نص، أو «باب» ملوّن إن حمل الملف التعليق scene=door)،
// ويعيد عند «الترميز» JPEG صغيرًا ترويسته بأبعاد الصورة. يسجّل كل argv في ملف السجل إن ضُبط FAKE_CONVERT_LOG في الملف.
// يُشغَّل من سكربت تنفيذي (fakeBin) بـ import(); البيئة دنيا (PATH وLANG وMAGICK_* فقط) كما في الإنتاج.
import fs from 'node:fs';
import { homography } from '../../../public/assets/js/lib/scan-core.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** ورقة بأركان نسبية على طاولة خشب داكنة */
export function paperScene(W, H) {
  const corners = [
    { x: 0.1 * W, y: 0.08 * H },
    { x: 0.9 * W, y: 0.1 * H },
    { x: 0.88 * W, y: 0.93 * H },
    { x: 0.12 * W, y: 0.91 * H },
  ];
  const PW = 1000;
  const PH = 1414;
  const inv = homography(corners, [{ x: 0, y: 0 }, { x: PW, y: 0 }, { x: PW, y: PH }, { x: 0, y: PH }]);
  const rand = rng(11);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (rand() - 0.5) * 24;
      let r = 92 + n;
      let g = 62 + n * 0.8;
      let b = 44 + n * 0.6;
      const X = x + 0.5;
      const Y = y + 0.5;
      const d = inv[6] * X + inv[7] * Y + 1;
      const u = (inv[0] * X + inv[1] * Y + inv[2]) / d / PW;
      const v = (inv[3] * X + inv[4] * Y + inv[5]) / d / PH;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        r = 236;
        g = 234;
        b = 228;
        // أسطر «نص» داكنة محاذاة لليمين
        const line = Math.floor(v * 40);
        const inLine = (v * 40) % 1 > 0.55 && line > 3 && line < 36;
        const len = 0.45 + ((line * 37) % 40) / 100;
        if (inLine && u > 0.92 - len && u < 0.92) {
          r = 40;
          g = 40;
          b = 44;
        }
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** «باب» ملوّن بلا ورقة */
export function doorScene(W, H) {
  const rand = rng(5);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = (rand() - 0.5) * 20;
      const panel = x > W * 0.2 && x < W * 0.8 && y > H * 0.1 && y < H * 0.95;
      data[i] = (panel ? 170 : 60) + n;
      data[i + 1] = (panel ? 60 : 90) + n;
      data[i + 2] = (panel ? 40 : 140) + n;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** JPEG بأبعاد معينة في SOF0 (يكفي لفحص البصمة والترويسة) */
export function tinyJpeg(w, h, comment = '') {
  const parts = [Buffer.from([0xff, 0xd8])];
  if (comment) {
    const c = Buffer.from(comment, 'latin1');
    parts.push(Buffer.from([0xff, 0xfe, (c.length + 2) >> 8, (c.length + 2) & 0xff]), c);
  }
  parts.push(Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]));
  parts.push(Buffer.alloc(64, 0x55), Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function readStdin() {
  const chunks = [];
  let n;
  const buf = Buffer.alloc(1 << 16);
  for (;;) {
    try {
      n = fs.readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === 'EAGAIN') continue;
      if (e.code === 'EOF') break;
      throw e;
    }
    if (!n) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks);
}

export function main(argv, { log = null } = {}) {
  if (log) fs.appendFileSync(log, JSON.stringify(argv) + '\n');
  if (argv[0] === '-version') {
    process.stdout.write('Version: ImageMagick 6.9.12-98 Q16 x86_64 (fake for tests)\n');
    return;
  }
  if (argv[0] === '-list' && argv[1] === 'policy') {
    process.stdout.write('\nPath: /etc/ImageMagick-6/policy.xml\n  Policy: Resource\n    name: memory\n    value: 48MiB\n  Policy: Coder\n    rights: None \n    pattern: *\n  Policy: Coder\n    rights: Read Write \n    pattern: {JPEG,PNG,WEBP,RGBA,GRAY}\n');
    return;
  }
  const last = argv[argv.length - 1];
  if (last === 'rgba:-') {
    const geo = argv[argv.indexOf('-resize') + 1];
    const [W, H] = geo.split('x').map(Number);
    const input = argv.find((a) => /^(jpeg|png|webp):\//.test(a));
    const file = input.slice(input.indexOf(':') + 1);
    const bytes = fs.readFileSync(file);
    const door = bytes.includes(Buffer.from('scene=door', 'latin1'));
    if (bytes.includes(Buffer.from('scene=slow', 'latin1'))) {
      setTimeout(() => {}, 60_000);
      return;
    }
    const data = door ? doorScene(W, H) : paperScene(W, H);
    process.stdout.write(Buffer.from(data.buffer, data.byteOffset, data.length));
    return;
  }
  if (last === 'jpeg:-') {
    const geo = argv[argv.indexOf('-size') + 1];
    const [W, H] = geo.split('x').map(Number);
    const raw = readStdin();
    if (raw.length !== W * H * 4) {
      process.stderr.write(`bad rgba length ${raw.length}\n`);
      process.exit(1);
    }
    process.stdout.write(tinyJpeg(W, H));
    return;
  }
  process.stderr.write('unsupported\n');
  process.exit(2);
}
