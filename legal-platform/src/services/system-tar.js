// كاتب وقارئ أرشيف tar (صيغة ustar مع ترويسات PAX للأسماء الطويلة أو غير اللاتينية) بلا أي اعتماديات.
// يُستخدم للتصدير الكامل (قاعدة البيانات + المرفقات + manifest.json) ولنقل المنصة إلى خادم جديد.
// (الإصدار 9 — وحدة platform)
import crypto from 'node:crypto';
import fs from 'node:fs';

const BLOCK = 512;
const ZERO = Buffer.alloc(BLOCK);

function octal(n, len) {
  const s = Math.max(0, Math.floor(Number(n) || 0)).toString(8);
  if (s.length > len - 1) throw new Error('tar: value too large for header field');
  return s.padStart(len - 1, '0') + '\0';
}

function put(buf, str, offset, len) {
  const b = Buffer.from(String(str), 'utf8');
  b.copy(buf, offset, 0, Math.min(b.length, len));
}

const PLAIN = /^[\x20-\x7e]*$/;

/** يقسم المسار إلى prefix + name حسب حدود ustar (155 + 100 بايت)، أو null إن تعذر */
function splitUstar(name) {
  if (!PLAIN.test(name)) return null;
  if (name.length <= 100) return { name, prefix: '' };
  for (let i = name.lastIndexOf('/'); i > 0; i = name.lastIndexOf('/', i - 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (rest && prefix.length <= 155 && rest.length <= 100) return { name: rest, prefix };
  }
  return null;
}

function rawHeader({ name, prefix = '', size, mode, mtime, type }) {
  const h = Buffer.alloc(BLOCK);
  put(h, name, 0, 100);
  put(h, octal(mode, 8), 100, 8);
  put(h, octal(0, 8), 108, 8);
  put(h, octal(0, 8), 116, 8);
  put(h, octal(size, 12), 124, 12);
  put(h, octal(mtime, 12), 136, 12);
  h.fill(0x20, 148, 156); // مسافات أثناء حساب المجموع الاختباري
  put(h, type, 156, 1);
  put(h, 'ustar\0', 257, 6);
  put(h, '00', 263, 2);
  put(h, 'app', 265, 32);
  put(h, 'app', 297, 32);
  put(h, prefix, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  put(h, sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body);
  let digits = String(len).length;
  while (String(len + digits).length !== digits) digits += 1;
  return `${len + digits}${body}`;
}

function padding(size) {
  const r = size % BLOCK;
  return r ? Buffer.alloc(BLOCK - r) : null;
}

/** ترويسة (أو ترويستين مع PAX) لعنصر في الأرشيف */
export function entryHeader({ name, size = 0, mode = 0o644, mtime = Date.now() / 1000, type = '0' }) {
  const clean = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').includes('..')) throw new Error(`tar: unsafe entry name ${name}`);
  const split = splitUstar(clean);
  if (split) return rawHeader({ name: split.name, prefix: split.prefix, size, mode, mtime, type });
  const pax = Buffer.from(paxRecord('path', clean), 'utf8');
  const short = `PaxHeader/${clean.replace(/[^\x20-\x7e]/g, '_').slice(-80)}`;
  return Buffer.concat([
    rawHeader({ name: short, size: pax.length, mode: 0o644, mtime, type: 'x' }),
    pax,
    padding(pax.length) || Buffer.alloc(0),
    rawHeader({ name: clean.replace(/[^\x20-\x7e]/g, '_').slice(-100), size, mode, mtime, type }),
  ]);
}

/**
 * يولّد أجزاء أرشيف tar من قائمة عناصر (مصفوفة أو مولّد غير متزامن يُستهلك بالترتيب).
 * العنصر: { name, size?, mtime?, mode?, data?: Buffer|string, file?: string, type?: '0'|'5' }
 * بعد كتابة كل ملف يُضاف إليه: entry.sha256 و entry.written (لبناء manifest في آخر الأرشيف).
 */
export async function* tarChunks(entries) {
  for await (const entry of entries) {
    if (entry.type === '5') {
      const dir = String(entry.name).replace(/\/?$/, '/');
      yield entryHeader({ name: dir, size: 0, mode: 0o755, mtime: entry.mtime, type: '5' });
      continue;
    }
    const data = entry.data !== undefined ? (Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')) : null;
    let size = entry.size;
    if (data) size = data.length;
    else if (size === undefined) size = fs.statSync(entry.file).size;
    yield entryHeader({ name: entry.name, size, mode: entry.mode, mtime: entry.mtime ?? Date.now() / 1000 });
    const hash = crypto.createHash('sha256');
    let written = 0;
    if (data) {
      hash.update(data);
      written = data.length;
      yield data;
    } else {
      // الحجم في الترويسة ملزم: نقطع الزيادة أو نكمل بالأصفار إن تغير الملف أثناء القراءة
      for await (const chunk of fs.createReadStream(entry.file)) {
        if (written >= size) break;
        const part = written + chunk.length > size ? chunk.subarray(0, size - written) : chunk;
        hash.update(part);
        written += part.length;
        yield part;
      }
      if (written < size) {
        const fill = Buffer.alloc(size - written);
        hash.update(fill);
        yield fill;
      }
    }
    entry.sha256 = hash.digest('hex');
    entry.written = size;
    const pad = padding(size);
    if (pad) yield pad;
  }
  yield ZERO;
  yield ZERO;
}

function readString(buf, offset, len) {
  const slice = buf.subarray(offset, offset + len);
  const end = slice.indexOf(0);
  return (end >= 0 ? slice.subarray(0, end) : slice).toString('utf8');
}

function readOctal(buf, offset, len) {
  const s = readString(buf, offset, len).trim();
  return s ? parseInt(s, 8) : 0;
}

function checksumOk(h) {
  const stored = readOctal(h, 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : h[i];
  return sum === stored;
}

function parsePax(buf) {
  // كل سجل: "<الطول بالبايت> <المفتاح>=<القيمة>\n"
  const out = {};
  let i = 0;
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i);
    if (sp < 0) break;
    const len = Number(buf.subarray(i, sp).toString('ascii'));
    if (!len || i + len > buf.length) break;
    const rec = buf.subarray(sp + 1, i + len - 1).toString('utf8');
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/**
 * قارئ tar متدفق: يستقبل مصدرًا من الأجزاء (AsyncIterable<Buffer>) ويولّد العناصر بالترتيب.
 * كل عنصر: { name, size, type, mtime, body: AsyncIterable<Buffer> } — استهلك body قبل طلب العنصر التالي
 * (أو اتركه وسيُتجاوز تلقائيًا).
 */
export async function* parseTar(source) {
  const it = source[Symbol.asyncIterator] ? source[Symbol.asyncIterator]() : source[Symbol.iterator]();
  let buf = Buffer.alloc(0);
  let ended = false;
  const pull = async () => {
    const r = await it.next();
    if (r.done) ended = true;
    else buf = buf.length ? Buffer.concat([buf, r.value]) : Buffer.from(r.value);
  };
  const need = async (n) => {
    while (buf.length < n && !ended) await pull();
    return buf.length >= n;
  };
  const take = async (n) => {
    if (!(await need(n))) throw new Error('tar: unexpected end of archive');
    const out = buf.subarray(0, n);
    buf = buf.subarray(n);
    return out;
  };
  let pax = null;
  for (;;) {
    if (!(await need(BLOCK))) return;
    const h = await take(BLOCK);
    if (h.every((b) => b === 0)) return;
    if (!checksumOk(h)) throw new Error('tar: bad header checksum');
    const type = String.fromCharCode(h[156] || 0x30);
    const size = readOctal(h, 124, 12);
    const prefix = readString(h, 345, 155);
    let name = readString(h, 0, 100);
    if (prefix) name = `${prefix}/${name}`;
    if (type === 'x') {
      pax = parsePax(Buffer.from(await take(size)));
      const pad = size % BLOCK;
      if (pad) await take(BLOCK - pad);
      continue;
    }
    if (type === 'g') {
      await take(size + (size % BLOCK ? BLOCK - (size % BLOCK) : 0));
      continue;
    }
    if (pax?.path) name = pax.path;
    pax = null;
    let remaining = size;
    const body = {
      async *[Symbol.asyncIterator]() {
        while (remaining > 0) {
          if (!buf.length) {
            if (ended) throw new Error('tar: unexpected end of archive');
            await pull();
            continue;
          }
          const n = Math.min(remaining, buf.length);
          const part = buf.subarray(0, n);
          buf = buf.subarray(n);
          remaining -= n;
          yield part;
        }
      },
    };
    yield { name, size, type: type === '\0' ? '0' : type, mtime: readOctal(h, 136, 12), body };
    // تجاوز ما لم يستهلكه المستدعي ثم الحشو
    // eslint-disable-next-line no-unused-vars
    for await (const _ of body);
    const pad = size % BLOCK;
    if (pad) await take(BLOCK - pad);
  }
}

/** قراءة أرشيف كامل من الذاكرة (للاختبارات والملفات الصغيرة) */
export async function readTarBuffer(buffer) {
  const out = [];
  for await (const e of parseTar([buffer])) {
    const parts = [];
    for await (const c of e.body) parts.push(c);
    out.push({ name: e.name, size: e.size, type: e.type, mtime: e.mtime, data: Buffer.concat(parts) });
  }
  return out;
}
