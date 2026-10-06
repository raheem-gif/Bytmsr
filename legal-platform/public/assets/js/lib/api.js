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
    super(message || GENERIC_ERROR);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fallbackMessage(status) {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return 'حدث خطأ في الخادم، حاول مرة أخرى بعد قليل';
  return GENERIC_ERROR;
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

const AUTH_QUIET_PATHS = ['/auth/login', '/auth/me', '/auth/session'];

/**
 * ينفذ طلبًا ويعيد JSON المحلل أو يرمي ApiError.
 * @param {string} method
 * @param {string} path مسار نسبي إلى /api
 * @param {{query?:object, body?:any, signal?:AbortSignal}} [opts]
 */
export async function request(method, path, { query, body, signal, background = false } = {}) {
  const m = method.toUpperCase();
  const init = {
    method: m,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  };
  // طلبات الخلفية (مثل تحديث الإشعارات الدوري) لا يحتسبها الخادم نشاطًا يمدّد مهلة عدم النشاط للجلسة
  if (background) init.headers['X-Background-Request'] = '1';
  if (m !== 'GET' && m !== 'HEAD') {
    // الخادم يرفض الطلبات المعدِّلة بغير JSON (حماية CSRF)
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body === undefined ? {} : body);
  }

  let res;
  try {
    res = await fetch(buildUrl(path, query), init);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError(GENERIC_ERROR, { status: 0, code: 'network_error' });
  }

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (res.status !== 204) {
    try {
      data = type.includes('json') ? await res.json() : await res.text();
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      // رد ناجح انقطع أو تلف أثناء القراءة: خطأ شبكة واضح بدل null تنهار عليه الصفحة
      if (res.ok) throw new ApiError(GENERIC_ERROR, { status: 0, code: 'network_error' });
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

/** رابط تنزيل مستند محفوظ. */
export function downloadUrl(documentId) {
  return `/api/documents/${encodeURIComponent(documentId)}/download`;
}
