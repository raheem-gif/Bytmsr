// عميل JSON موحد لواجهة /api مع رسائل خطأ عربية.

export const GENERIC_ERROR = 'تعذر الاتصال بالخادم، حاول مرة أخرى';

const STATUS_MESSAGES = {
  400: 'البيانات المرسلة غير صحيحة',
  401: 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى',
  403: 'ليست لديك صلاحية لتنفيذ هذا الإجراء',
  404: 'العنصر المطلوب غير موجود',
  409: 'تعذر تنفيذ الإجراء بسبب تعارض مع حالة البيانات الحالية',
  413: 'حجم البيانات المرسلة أكبر من المسموح',
  422: 'البيانات المرسلة غير مكتملة أو غير صحيحة',
  429: 'محاولات كثيرة متتالية، انتظر قليلًا ثم حاول مرة أخرى',
};

/** خطأ من الخادم أو الشبكة يحمل رسالة عربية جاهزة للعرض. */
export class ApiError extends Error {
  /**
   * @param {string} message رسالة عربية
   * @param {{status?:number, code?:string, details?:any}} [info]
   */
  constructor(message, { status = 0, code = 'network_error', details } = {}) {
    super(message || genericError);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// v10 b2b-portal (CO-14): بوابة الشركات تستبدل جمل الأخطاء العامة (المفرد في /app) بجمل الجمع لأسلوب الأعمال
let genericError = GENERIC_ERROR;
let serverError = 'حدث خطأ في الخادم، حاول مرة أخرى بعد قليل';
/** setErrorCopy({ generic, 400, 401, …, 500 }): نصوص الأخطاء العامة لهذه الصفحة (الافتراضي كما هو لـ /app) */
export function setErrorCopy(map = {}) {
  for (const [k, v] of Object.entries(map || {})) {
    if (typeof v !== 'string' || !v) continue;
    if (k === 'generic') genericError = v;
    else if (k === '500') serverError = v;
    else if (/^\d{3}$/.test(k)) STATUS_MESSAGES[k] = v;
  }
}

function fallbackMessage(status) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return serverError;
  return genericError;
}

// ───────── (إصلاح 9.1) نافذة فتح المنصة دون اتصال ─────────
// «اليوم» المحفوظ على الجهاز يُفتح دون اتصال حتى نهاية الجلسة على الخادم فقط (انتهاؤها أو مهلة عدم النشاط، أيهما أقرب)،
// لا بعدها (هاتف مفقود أو مشترك بعد إنهاء الجلسة). الخادم يحدّث آخر نشاط كل 5 دقائق على الأكثر: هامش 10 دقائق.
const UNTIL_SLACK_MS = 10 * 60000;
/**
 * @param {{expires_at:string, idle_hours:number}|null} session من /api/auth/session
 * @param {number} [at] وقت آخر نشاط (ms)
 * @returns {number} وقت (ms) لا يُفتح بعده شيء من الجهاز دون اتصال؛ 0 إن لم تُعرف الجلسة
 */
export function sessionUntil(session, at = Date.now()) {
  if (!session || typeof session !== 'object') return 0;
  const exp = Date.parse(session.expires_at || '');
  const idleMs = Number(session.idle_hours) * 3600000;
  if (!Number.isFinite(exp) || !(idleMs > 0)) return 0;
  return Math.max(0, Math.min(exp, at + idleMs - UNTIL_SLACK_MS));
}
let activityHook = null;
/** يُستدعى بعد كل طلب ناجح ليس من الخلفية (يحتسبه الخادم نشاطًا يمدّد مهلة عدم النشاط) */
export function onUserActivity(fn) {
  activityHook = typeof fn === 'function' ? fn : null;
}

/** يبني الرابط الكامل مع تجاهل القيم الفارغة في الاستعلام. */
export function buildUrl(path, query) {
  const clean = String(path || '').startsWith('/') ? path : `/${path}`;
  let url = `/api${clean}`;
  if (query && typeof query === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length) params.set(k, v.join(','));
      } else params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}

// v10 b2b-portal: 401 من دخول بوابة الشركات وحالة جلستها إجابة لا انتهاء جلسة (U10-14)
const AUTH_QUIET_PATHS = ['/auth/login', '/auth/me', '/auth/session', '/company/auth/login', '/company/auth/login/2fa', '/company/auth/session'];

// ───────── v9.1 l-home (L-07): طلب GET مبكر لبيانات الصفحة ─────────
// يبدأ بالتوازي مع تحميل وحدة الصفحة (رابط إشعار يُفتح على شبكة بطيئة)، ثم يأخذه أول api.get بنفس الرابط بدل طلب جديد
// — مرة واحدة وخلال 15 ثانية. الرد يُعالج عند أخذه كأي رد (فـ 401 مثلًا يُبلَّغ عندها لا قبلها).
// المخزن نفسه يملؤه app/boot-early.js (سكربت صغير يسبق وحدات التطبيق في صفحة /app): الرابط ← { promise, at }
const EARLY_GET_MAX_MS = 15000;
function earlyGets() {
  const w = typeof window !== 'undefined' ? window : globalThis;
  if (!w.__bmEarlyGets || typeof w.__bmEarlyGets !== 'object') w.__bmEarlyGets = {};
  return w.__bmEarlyGets;
}
export function prefetchGet(path, query) {
  const url = buildUrl(path, query);
  const map = earlyGets();
  const hit = map[url];
  if (hit && Date.now() - hit.at < EARLY_GET_MAX_MS) return;
  const promise = fetch(url, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  promise.catch(() => {});
  map[url] = { promise, at: Date.now() };
}
/**
 * رد جاهز لطلب GET (مثل بيانات الصفحة التي تصل مع /api/auth/session?page=…) يأخذه أول api.get بالمسار نفسه.
 * @param {string} path مسار نسبي إلى /api (مثل '/lawyer/matters/2')
 * @param {number} status
 * @param {any} body
 */
export function putEarlyResult(path, status, body) {
  if (typeof path !== 'string' || !path.startsWith('/')) return;
  earlyGets()[buildUrl(path)] = { result: { status: Number(status) || 200, body }, at: Date.now() };
}
function takeEarlyGet(url) {
  const map = earlyGets();
  const hit = map[url];
  if (!hit) return null;
  delete map[url];
  if (Date.now() - hit.at >= EARLY_GET_MAX_MS) return null;
  if (hit.result) {
    // يُعالج كأي رد من الشبكة (الأخطاء والجلسة المنتهية بالمسار نفسه)
    const { status, body } = hit.result;
    return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body ?? null), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
  }
  return hit.promise || null;
}
/** يلغي الطلبات المبكرة (عند تسجيل الدخول أو الخروج: لا يأخذ مستخدم ردًا طُلب قبل جلسته) */
export function clearPrefetched() {
  const map = earlyGets();
  for (const k of Object.keys(map)) delete map[k];
}

/**
 * ينفذ طلبًا ويعيد JSON المحلل أو يرمي ApiError.
 * @param {string} method
 * @param {string} path مسار نسبي إلى /api
 * @param {{query?:object, body?:any, signal?:AbortSignal}} [opts]
 */
export async function request(method, path, { query, body, signal, background = false, keepalive = false } = {}) {
  const m = method.toUpperCase();
  const init = {
    method: m,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  };
  // v9.1 l-work: keepalive يُكمل الطلب بعد إغلاق الصفحة (حفظ مسودة الرأي عند visibilitychange→hidden)؛ حده 64 كيلوبايت
  if (keepalive) init.keepalive = true;
  // طلبات الخلفية (مثل تحديث الإشعارات الدوري) لا يحتسبها الخادم نشاطًا يمدّد مهلة عدم النشاط للجلسة
  if (background) init.headers['X-Background-Request'] = '1';
  if (m !== 'GET' && m !== 'HEAD') {
    // الخادم يرفض الطلبات المعدِّلة بغير JSON (حماية CSRF)
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body === undefined ? {} : body);
  }

  let res;
  try {
    const url = buildUrl(path, query);
    const early = m === 'GET' && !signal ? takeEarlyGet(url) : null;
    res = await (early || fetch(url, init));
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError(genericError, { status: 0, code: 'network_error' });
  }

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (res.status !== 204) {
    try {
      data = type.includes('json') ? await res.json() : await res.text();
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // رد ناجح انقطع أو تلف أثناء القراءة: خطأ شبكة واضح بدل null تنهار عليه الصفحة
      if (res.ok) throw new ApiError(genericError, { status: 0, code: 'network_error' });
      data = null;
    }
  }

  if (!res.ok) {
    const isObj = data && typeof data === 'object';
    const err = new ApiError((isObj && data.error) || fallbackMessage(res.status), {
      status: res.status,
      code: (isObj && data.code) || `http_${res.status}`,
      details: isObj ? data.details : undefined,
    });
    const bare = String(path).split('?')[0];
    if (res.status === 401 && !AUTH_QUIET_PATHS.includes(bare)) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    // قيد فُرض على الحساب أثناء الجلسة (إلزام بالتحقق بخطوتين أو كلمة مرور مؤقتة): main.js يعرض شاشة الإلزام
    if (res.status === 403 && (err.code === 'two_factor_enrollment_required' || err.code === 'password_change_required')) {
      window.dispatchEvent(new CustomEvent('auth:restricted', { detail: { code: err.code } }));
    }
    throw err;
  }
  if (!background && activityHook) {
    try {
      activityHook();
    } catch {
      /* تجاهل */
    }
  }
  return data;
}

/** واجهة مختصرة: api.get('/admin/cases', { status: 'new' }) */
export const api = {
  get: (path, query, opts) => request('GET', path, { ...opts, query }),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, body, opts) => request('DELETE', path, { ...opts, body }),
  request,
};

/** يعرض حجمًا بالبايت بصيغة مقروءة بالعربية. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} كيلوبايت`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} ميجابايت`;
}

/**
 * يحوّل ملفًا إلى { filename, mime, data_base64 } لإرساله داخل JSON.
 * @param {File} file
 * @param {{maxBytes?:number}} [opts]
 */
export function fileToUpload(file, { maxBytes = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new ApiError('لم يتم اختيار ملف', { code: 'file_missing' }));
      return;
    }
    if (file.size > maxBytes) {
      reject(
        new ApiError(`حجم الملف «${file.name}» أكبر من الحد المسموح (${formatBytes(maxBytes)})`, {
          code: 'file_too_large',
          details: { filename: file.name, size: file.size, max: maxBytes },
        }),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve({
        filename: file.name || 'document',
        mime: file.type || 'application/octet-stream',
        data_base64: comma >= 0 ? result.slice(comma + 1) : '',
      });
    };
    reader.onerror = () => reject(new ApiError(`تعذرت قراءة الملف «${file.name}»`, { code: 'file_read_error' }));
    reader.readAsDataURL(file);
  });
}

/** يحوّل قائمة ملفات دفعة واحدة. */
export function filesToUploads(files, opts) {
  return Promise.all(Array.from(files || []).map((f) => fileToUpload(f, opts)));
}

function saveAs(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || '';
  a.hidden = true;
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

/**
 * تنزيل ملف حساس (تصدير بيانات المستفيدين، نسخة احتياطية، التصدير الكامل، سجل الأمان، تقرير الأثر).
 * الخادم لا يرسل هذه الملفات لطلب GET بالكعكة وحدها (يستطيع أي موقع آخر فتح الرابط في متصفحك): نطلب أولًا
 * رابط تنزيل بـ POST، صالحًا لمرة واحدة خلال دقيقة ولهذه الجلسة فقط، ثم نبدأ التنزيل منه.
 *   mode 'blob' (الافتراضي، لملفات CSV): يُجلب الملف أولًا فتظهر رسالة الخطأ بالعربية إن فشل.
 *   mode 'navigate' (الملفات الكبيرة: قاعدة البيانات والتصدير الكامل): يحفظه المتصفح مباشرة دون تحميله في الذاكرة.
 * @param {string} path مسار نسبي إلى /api (مسار POST الذي يصدر رابط التنزيل)
 * @param {object} [body] معاملات التصدير (الفلاتر وغيرها)
 * @returns {Promise<{filename:string}>}
 */
export async function downloadFile(path, body, { mode = 'blob', fallbackName = 'download' } = {}) {
  const ticket = await request('POST', path, { body: body || {} });
  if (!ticket || typeof ticket.url !== 'string' || !ticket.url.startsWith('/api/')) {
    throw new ApiError(genericError, { status: 0, code: 'bad_download_ticket' });
  }
  if (mode === 'navigate') {
    const name = ticket.filename || fallbackName;
    saveAs(ticket.url, name);
    return { filename: name };
  }
  let res;
  try {
    res = await fetch(ticket.url, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(genericError, { status: 0, code: 'network_error' });
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new ApiError((data && data.error) || 'تعذر تنزيل الملف', { status: res.status, code: (data && data.code) || `http_${res.status}` });
  }
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="([^"]+)"/i.exec(cd);
  let name = ticket.filename || fallbackName;
  if (m) {
    try {
      name = decodeURIComponent(m[1]);
    } catch {
      name = m[1];
    }
  }
  let blob;
  try {
    blob = await res.blob();
  } catch {
    throw new ApiError(genericError, { status: 0, code: 'network_error' });
  }
  const href = URL.createObjectURL(blob);
  saveAs(href, name);
  setTimeout(() => URL.revokeObjectURL(href), 1500);
  return { filename: name };
}

/** رابط تنزيل مستند محفوظ. */
export function downloadUrl(documentId) {
  return `/api/documents/${encodeURIComponent(documentId)}/download`;
}
