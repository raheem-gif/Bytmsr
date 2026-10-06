// طبقة HTTP: موجّه طلبات بسيط، قراءة JSON، ملفات ثابتة، ترويسات أمان، معالجة أخطاء موحدة.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ApiError, badRequest } from './util.js';

// ───────── الضغط والتخزين المؤقت (للتشغيل المباشر أو على Render بلا وكيل يضغط الردود) ─────────
// الملفات النصية تُرسل مضغوطة (gzip) لمن يقبلها، مع ETag للتحقق السريع (304)،
// والملفات المطلوبة برقم إصدارها (?v=…) تُخزَّن في المتصفح سنة كاملة لأن أي تعديل يغيّر الرقم.
const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.webmanifest', '.ico']);
const MIN_COMPRESS_BYTES = 1024;
const MAX_COMPRESS_BYTES = 5 * 1024 * 1024;
const gzCache = new Map(); // المسار ← { key, gz }
const versionCache = new Map(); // المسار ← { key, v }

export function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req?.headers?.['accept-encoding'] || ''));
}

const statKey = (st) => `${st.size}-${Math.floor(st.mtimeMs)}`;

/** رقم إصدار قصير لملف ثابت (يتغير مع أي تعديل في محتواه) — يُضاف للروابط كـ ?v=… */
export function assetVersion(file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  const key = statKey(st);
  const c = versionCache.get(file);
  if (c && c.key === key) return c.v;
  let v;
  try {
    v = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('base64url').slice(0, 10);
  } catch {
    return null;
  }
  versionCache.set(file, { key, v });
  if (versionCache.size > 2000) versionCache.delete(versionCache.keys().next().value);
  return v;
}

function gzipFile(file, st) {
  const key = statKey(st);
  const c = gzCache.get(file);
  if (c && c.key === key) return c.gz;
  const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
  gzCache.set(file, { key, gz });
  if (gzCache.size > 500) gzCache.delete(gzCache.keys().next().value);
  return gz;
}

/**
 * يرسل جسمًا نصيًا جاهزًا (JSON أو HTML) مضغوطًا إن قبله المتصفح وكان أكبر من 1 كيلوبايت.
 * يضبط Content-Length و Vary؛ ولا يكتب الجسم لطلبات HEAD.
 */
export function sendBody(res, status, body, { req = res.req } = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.statusCode = status;
  if (buf.length >= MIN_COMPRESS_BYTES && buf.length <= MAX_COMPRESS_BYTES) {
    res.setHeader('Vary', 'Accept-Encoding');
    if (acceptsGzip(req)) {
      buf = zlib.gzipSync(buf, { level: 6 });
      res.setHeader('Content-Encoding', 'gzip');
    }
  }
  res.setHeader('Content-Length', buf.length);
  if (req?.method === 'HEAD') return res.end();
  res.end(buf);
}

/** إرسال ملف ثابت: ETag/304، ضغط gzip للملفات النصية، وCache-Control كما يحدده المستدعي */
function sendStaticFile(req, res, file, st, cacheControl) {
  const ext = path.extname(file).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', cacheControl);
  const etag = `W/"${statKey(st)}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', new Date(st.mtimeMs).toUTCString());
  const compressible = COMPRESSIBLE_EXT.has(ext) && st.size >= MIN_COMPRESS_BYTES && st.size <= MAX_COMPRESS_BYTES;
  if (compressible) res.setHeader('Vary', 'Accept-Encoding');
  const inm = String(req.headers['if-none-match'] || '');
  if (inm && inm.split(',').some((x) => x.trim() === etag)) {
    res.statusCode = 304;
    res.end();
    return true;
  }
  res.statusCode = 200;
  if (compressible && acceptsGzip(req)) {
    let gz;
    try {
      gz = gzipFile(file, st);
    } catch {
      gz = null;
    }
    if (gz) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Length', gz.length);
      if (req.method === 'HEAD') res.end();
      else res.end(gz);
      return true;
    }
  }
  res.setHeader('Content-Length', st.size);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // الردود الكبيرة (مثل /api/meta) تُضغط لمن يقبل gzip
  sendBody(res, status, body);
}

export function sendError(res, err, log) {
  if (err instanceof ApiError) {
    const payload = { error: err.message, code: err.code };
    if (err.details !== undefined) payload.details = err.details;
    return sendJson(res, err.status, payload);
  }
  if (log) log(err);
  return sendJson(res, 500, { error: 'حدث خطأ غير متوقع في الخادم، يرجى المحاولة مرة أخرى', code: 'server_error' });
}

/** قراءة جسم الطلب كاملًا مع حد أقصى للحجم */
export function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limitBytes) {
        done = true;
        reject(new ApiError(413, 'حجم البيانات المرسلة أكبر من المسموح', 'payload_too_large'));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    try {
      out[k] = decodeURIComponent(val);
    } catch {
      out[k] = val;
    }
  }
  return out;
}

/**
 * موجّه بسيط: router.get('/api/x/:id', handler, opts)
 * المعالج يستقبل ctx = { req, res, params, query, body, rawBody, user, ip, app }
 * ويُرجع كائنًا يُرسل كـ JSON (أو undefined إذا أرسل الرد بنفسه).
 */
export class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler, opts = {}) {
    const keys = [];
    const re = new RegExp(
      '^' +
        pattern
          .replace(/\/+$/, '')
          .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
          .replace(/:(\w+)/g, (_, k) => {
            keys.push(k);
            return '([^/]+)';
          }) +
        '/?$',
    );
    this.routes.push({ method, pattern, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  put(p, h, o) { this.add('PUT', p, h, o); }
  patch(p, h, o) { this.add('PATCH', p, h, o); }
  delete(p, h, o) { this.add('DELETE', p, h, o); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => {
        try {
          params[k] = decodeURIComponent(m[i + 1]);
        } catch {
          params[k] = m[i + 1];
        }
      });
      return { route: r, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

/** تحويل معامل المسار الرقمي مع رسالة واضحة */
export function idParam(params, key = 'id') {
  const n = Number(params[key]);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('معرف غير صالح');
  return n;
}

/** إرسال ملف محدد (صفحات HTML بمسارات نظيفة) */
export function sendFile(req, res, file) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  return sendStaticFile(req, res, file, st, ext === '.html' ? 'no-store' : 'no-cache');
}

/** خدمة الملفات الثابتة بأمان (منع الخروج من المجلد) */
export function serveStatic(req, res, publicDir, pathname, { fallbackFile } = {}) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel.includes('\0')) return false;
  const target = path.normalize(path.join(publicDir, rel));
  if (!target.startsWith(publicDir + path.sep) && target !== publicDir) return false;
  let file = target;
  let st;
  try {
    st = fs.statSync(file);
    if (st.isDirectory()) {
      file = path.join(file, 'index.html');
      st = fs.statSync(file);
    }
    if (!st.isFile()) throw new Error('not file');
  } catch {
    if (!fallbackFile) return false;
    file = fallbackFile;
    try {
      st = fs.statSync(file);
    } catch {
      return false;
    }
  }
  const ext = path.extname(file).toLowerCase();
  // ملفات الواجهة تتغير مع كل إصدار؛ نطلب إعادة التحقق دائمًا (ETag ← 304 دون إعادة التنزيل)،
  // إلا إذا طُلب الملف برقم إصداره الحالي (?v=…) فيُخزَّن سنة كاملة
  let cache = ext === '.html' ? 'no-store' : 'no-cache';
  if (ext !== '.html') {
    const q = String(req.url || '').split('?')[1] || '';
    const v = new URLSearchParams(q).get('v');
    if (v && v === assetVersion(file)) cache = 'public, max-age=31536000, immutable';
  }
  return sendStaticFile(req, res, file, st, cache);
}
