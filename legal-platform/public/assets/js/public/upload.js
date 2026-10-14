// v9.1 b-forms — تصوير الورق ورفعه من موبايل بسيط وعلى نت ضعيف.
//
// API (ثابت؛ يستخدمه نموذج الطلب وصفحة المتابعة):
//   photoPicker({ label, multiple = true, max = 5, onChange(files), address = 'f'|'m'|'p' (الأفراد والشركات، v11), variant = 'big'|'row'|'compact',
//                 namePrefix = 'ورقة', galleryLabel, tip = false, maxBytes = 8 MB, maxSide = 1600, quality = 0.72,
//                 initial = [], messages: { tooMany, bad } }) → HTMLElement
//     الكاميرا أولًا (<input capture="environment">) ثم «من الموبايل» (صور أو PDF)، صور مصغّرة 3 في الصف مع زر × لكل صورة،
//     والصور تُصغَّر على الموبايل فور اختيارها (واحدة بعد الأخرى). onChange يستقبل ملفات File جاهزة للإرسال.
//     العنصر يحمل أيضًا: getFiles() · setFiles(files) · getUploads() → Promise<[{ filename, mime, data_base64 }]>
//                       · clear() · setDisabled(bool) · ready() → Promise (حتى ينتهي التجهيز)
//   compressImage(file, { maxSide = 1600, quality = 0.75 }) → Promise<{ filename, mime, data_base64, size }>
//   compressToBlob(file, opts) → Promise<File>   (نفس التصغير، والنتيجة ملف بدل base64)
//   fileToUpload(file) → Promise<{ filename, mime, data_base64 }>
//   sendWithProgress(url, body, { onProgress(fraction, loaded, total), signal, idleTimeoutMs }) → Promise<JSON>
//     XMLHttpRequest بصيغة JSON على نفس المسار (نفس قواعد Origin وCSRF)، وخطأ الشبكة أو الإيقاف يرفض بـ err.code
//     'network_error' | 'aborted'، وخطأ الخادم بـ err.status و err.message (رسالة الخادم العربية) و err.details.
//   uploadProgress({ text = 'بنبعت…', onCancel, address }) → HTMLElement مع set(fraction) — شريط «بنبعت… 40٪» و«ما تقفليش الصفحة»
//   friendlyError(err, address) → نص بسيط للمستفيدة
//
// يعتمد على h.js فقط.

import { h, svg, mount } from '../lib/h.js';
import { ensureFormsStyles } from './recorder.js';

const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const EXT_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf' };
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heic', 'application/pdf': '.pdf' };
const MIN_COMPRESS_BYTES = 400 * 1024;
const TIP_KEY = 'bm_photo_tip_off';

/** «صورة واحدة» · «صورتين» · «5 صور» · «12 صورة» */
export function photosText(n) {
  if (n === 1) return 'صورة واحدة';
  if (n === 2) return 'صورتين';
  if (n >= 3 && n <= 10) return `${n} صور`;
  return `${n} صورة`;
}

const COPY = {
  f: {
    camera: 'صوّري ورقة',
    gallery: 'اختاري صورة أو ملف من الموبايل',
    galleryShort: 'من الموبايل',
    remove: 'شيلي الصورة دي',
    preparing: 'بنجهّز الصور…',
    tooMany: (max) => `تقدري تبعتي لحد ${photosText(max)} دلوقتي. الباقي ابعتيه بعدين من صفحتك.`,
    bad: 'الملف ده مش هينفع. جربي صورة بدل منه.',
    tip: 'حطي الورقة على ترابيزة في مكان منوّر، وخلي الأربع أركان باينين.',
    tipOk: 'تمام',
    sending: 'بنبعت…',
    dontClose: 'ما تقفليش الصفحة',
    stop: 'وقّفي',
    net: 'ما اتبعتش. اتأكدي إن النت شغال وجربي تاني.',
    big: 'الصور كبيرة أوي. شيلي صورة وجربي تاني.',
    many: 'بعتي كتير في وقت قصير. استني شوية وجربي تاني.',
    stopped: 'وقّفتي الإرسال. صورك لسه موجودة.',
  },
  m: {
    camera: 'صوّر ورقة',
    gallery: 'اختار صورة أو ملف من الموبايل',
    galleryShort: 'من الموبايل',
    remove: 'شيل الصورة دي',
    preparing: 'بنجهّز الصور…',
    tooMany: (max) => `تقدر تبعت لحد ${photosText(max)} دلوقتي. الباقي ابعته بعدين من صفحتك.`,
    bad: 'الملف ده مش هينفع. جرب صورة بدل منه.',
    tip: 'حط الورقة على ترابيزة في مكان منوّر، وخلي الأربع أركان باينين.',
    tipOk: 'تمام',
    sending: 'بنبعت…',
    dontClose: 'ما تقفلش الصفحة',
    stop: 'وقّف',
    net: 'ما اتبعتش. اتأكد إن النت شغال وجرب تاني.',
    big: 'الصور كبيرة أوي. شيل صورة وجرب تاني.',
    many: 'بعت كتير في وقت قصير. استنى شوية وجرب تاني.',
    stopped: 'وقّفت الإرسال. صورك لسه موجودة.',
  },
  // v11 fixer-public (K11/J-05): صفحة الطلب للأفراد والشركات (address 'p'): فصحى مهذبة بصيغة الجمع (G11-39)
  p: {
    camera: 'تصوير مستند',
    gallery: 'اختيار صورة أو ملف من الهاتف',
    galleryShort: 'من الهاتف',
    remove: 'حذف هذه الصورة',
    preparing: 'جارٍ تجهيز الصور…',
    tooMany: (max) => `يمكنكم إرسال ${photosText(max)} على الأكثر الآن، وإرسال الباقي لاحقًا من صفحة طلبكم.`,
    bad: 'لا يمكن استخدام هذا الملف. جرّبوا صورة بدلًا منه.',
    tip: 'ضعوا المستند على سطح مستوٍ في مكان مضيء، واحرصوا على ظهور أركانه الأربعة.',
    tipOk: 'حسنًا',
    sending: 'جارٍ الإرسال…',
    dontClose: 'لا تغلقوا الصفحة',
    stop: 'إيقاف',
    net: 'لم يُرسل. تأكدوا من الاتصال بالإنترنت وحاولوا مرة أخرى.',
    big: 'حجم الصور كبير. احذفوا صورة وحاولوا مرة أخرى.',
    many: 'أُرسلت طلبات كثيرة في وقت قصير. انتظروا قليلًا ثم حاولوا مرة أخرى.',
    stopped: 'أُوقف الإرسال. صوركم ما زالت محفوظة.',
  },
};
const copyFor = (address) => COPY[address === 'm' || address === 'p' ? address : 'f'];

// ───────── أيقونات ─────────
const PATHS = {
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M16 13a4 4 0 1 1-8 0a4 4 0 1 1 8 0'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M10 8.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0', 'M21 15l-5-5L5 21'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  bulb: ['M9 18h6', 'M10 22h4', 'M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z'],
};
function ic(name, size = 22) {
  return svg(
    'svg',
    { class: `bmf-ic bmf-ic-${name}`, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    PATHS[name].map((d) => svg('path', { d })),
  );
}

// ───────── أدوات الملفات ─────────

function typeOf(file) {
  const t = String(file?.type || '').toLowerCase();
  if (t) return t === 'image/jpg' ? 'image/jpeg' : t;
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  return EXT_MIME[ext] || '';
}

function safePrefix(s) {
  return String(s || 'ورقة').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'ورقة';
}

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

function asFile(blob, name, type) {
  try {
    return new File([blob], name, { type: type || blob.type, lastModified: Date.now() });
  } catch {
    // متصفحات قديمة جدًا بلا مُنشئ File
    const b = blob.slice(0, blob.size, type || blob.type);
    b.name = name;
    return b;
  }
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, release: () => bmp.close?.() };
    } catch {
      /* نجرب <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * تصغير صورة على الموبايل: JPEG/PNG/WebP أكبر من 400 كيلوبايت ← أطول ضلع ≤ maxSide بصيغة JPEG.
 * PDF وHEIC وما لا يمكن فكه يُعاد كما هو. النتيجة File اسمه ينتهي بامتداد نوعه الفعلي.
 */
export async function compressToBlob(file, { maxSide = 1600, quality = 0.75, minBytes = MIN_COMPRESS_BYTES, name } = {}) {
  const type = typeOf(file);
  const baseName = String(name || file?.name || 'صورة').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const keep = () => {
    const t = type === 'image/heif' ? 'image/heic' : type;
    return asFile(file, baseName + (MIME_EXT[t] || ''), t || file.type);
  };
  if (!COMPRESSIBLE.has(type) || (file.size || 0) <= minBytes) return keep();
  let d;
  try {
    d = await decode(file);
  } catch {
    return keep();
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(d.w, d.h, 1));
    const w = Math.max(1, Math.round(d.w * scale));
    const hgt = Math.max(1, Math.round(d.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, hgt);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(d.src, 0, 0, w, hgt);
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    canvas.width = 0;
    canvas.height = 0;
    if (!out || (scale === 1 && out.size >= (file.size || 0))) return keep();
    return asFile(out, `${baseName}.jpg`, 'image/jpeg');
  } finally {
    d.release();
  }
}

/** ملف ← مرفق بصيغة الخادم */
export async function fileToUpload(file) {
  const mime = typeOf(file) === 'image/heif' ? 'image/heic' : typeOf(file) || 'application/octet-stream';
  return { filename: file.name || `ملف${MIME_EXT[mime] || ''}`, mime, data_base64: await readAsBase64(file) };
}

/** عقد واجهة b-forms: تصغير صورة وإرجاعها بصيغة مرفقات الخادم مع حجمها بعد التصغير */
export async function compressImage(file, { maxSide = 1600, quality = 0.75 } = {}) {
  const out = await compressToBlob(file, { maxSide, quality });
  const up = await fileToUpload(out);
  return { ...up, size: out.size };
}

// ───────── الإرسال مع نسبة التقدم ─────────

class UploadError extends Error {
  constructor(message, { status = 0, code = 'network_error', details } = {}) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * POST بصيغة JSON عبر XMLHttpRequest لمعرفة نسبة الرفع. نفس قواعد الخادم (JSON فقط، فحص Origin، كعكات الجلسة).
 * url: مسار كامل '/api/…' (أو مسار بدون /api يُضاف له كما في api.js).
 */
export function sendWithProgress(url, body, { onProgress, signal, idleTimeoutMs = 90000 } = {}) {
  const target = /^(https?:)?\/\//.test(url) || String(url).startsWith('/api/') ? url : `/api${String(url).startsWith('/') ? '' : '/'}${url}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let idle = null;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      window.removeEventListener('offline', onOffline);
      signal?.removeEventListener?.('abort', onAbort);
      fn(v);
    };
    // نت متقطع: إن توقف الرفع تمامًا مدة طويلة نعتبره انقطاعًا ليظهر زر «حاولي تاني» بدل انتظار بلا نهاية
    const arm = () => {
      clearTimeout(idle);
      if (idleTimeoutMs > 0) idle = setTimeout(() => xhr.abort(), idleTimeoutMs);
    };
    const onOffline = () => xhr.abort();
    const onAbort = () => {
      xhr.abort();
      done(reject, new UploadError('aborted', { code: 'aborted' }));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort);
    window.addEventListener('offline', onOffline);
    xhr.open('POST', target, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'text';
    xhr.upload.addEventListener('progress', (e) => {
      arm();
      if (e.lengthComputable && e.total > 0) {
        try {
          onProgress?.(Math.min(1, e.loaded / e.total), e.loaded, e.total);
        } catch {
          /* لا نوقف الرفع بسبب خطأ في الواجهة */
        }
      }
    });
    xhr.upload.addEventListener('load', () => {
      try {
        onProgress?.(1, 1, 1);
      } catch {
        /* لا شيء */
      }
      // بعد اكتمال الرفع ينتظر الخادم حفظ الملفات: مهلة أطول قليلًا
      arm();
    });
    xhr.addEventListener('load', () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return done(resolve, data ?? {});
      done(reject, new UploadError((data && data.error) || 'تعذر الإرسال', { status: xhr.status, code: (data && data.code) || 'http_error', details: data && data.details }));
    });
    xhr.addEventListener('error', () => done(reject, new UploadError('network', { code: 'network_error' })));
    xhr.addEventListener('abort', () => done(reject, new UploadError('network', { code: signal?.aborted ? 'aborted' : 'network_error' })));
    xhr.addEventListener('timeout', () => done(reject, new UploadError('network', { code: 'network_error' })));
    arm();
    try {
      xhr.send(typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    } catch {
      done(reject, new UploadError('network', { code: 'network_error' }));
    }
  });
}

/** نص بسيط لخطأ الإرسال */
export function friendlyError(err, address = 'f') {
  const t = copyFor(address);
  if (!err) return t.net;
  if (err.code === 'aborted') return t.stopped;
  if (err.code === 'network_error' || err.status === 0 || err.status >= 500) return t.net;
  if (err.status === 413) return t.big;
  if (err.status === 429) return t.many;
  return err.message || t.net;
}

/** شريط «بنبعت… 40٪» مع «ما تقفليش الصفحة» وزر «وقّفي» اختياري */
export function uploadProgress({ text, onCancel, address = 'f' } = {}) {
  ensureFormsStyles();
  const t = copyFor(address);
  const label = text || t.sending;
  const fill = h('span.bmf-progress-fill');
  const bar = h('div.bmf-progress-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', 'aria-label': label }, fill);
  const pct = h('span.bmf-progress-text', `${label} 0٪`);
  const el = h(
    'div.bmf-progress',
    { role: 'status' },
    pct,
    bar,
    h('p.bmf-progress-hint', t.dontClose),
    onCancel && h('button.bmf-btn.bmf-btn-outline.bmf-progress-stop', { type: 'button', onClick: () => onCancel() }, t.stop),
  );
  let last = -1;
  el.set = (fraction) => {
    const p = Math.max(0, Math.min(100, Math.round((Number(fraction) || 0) * 100)));
    if (p === last) return;
    last = p;
    fill.style.width = `${p}%`;
    bar.setAttribute('aria-valuenow', String(p));
    pct.textContent = `${label} ${p}٪`;
  };
  return el;
}

// ───────── منتقي الصور ─────────

/**
 * الكاميرا أولًا ثم «من الموبايل»، مع صور مصغّرة وزر × لكل صورة.
 * @returns {HTMLElement}
 */
export function photoPicker({
  label,
  multiple = true,
  max = 5,
  onChange,
  address = 'f',
  variant = 'big',
  namePrefix = 'ورقة',
  galleryLabel,
  tip = false,
  maxBytes = 8 * 1024 * 1024,
  maxSide = 1600,
  quality = 0.72,
  initial = [],
  messages = {},
} = {}) {
  ensureFormsStyles();
  const t = copyFor(address);
  const limit = Math.max(1, multiple ? Number(max) || 5 : 1);
  const prefix = safePrefix(namePrefix);
  let files = [];
  let urls = new Map();
  let disabled = false;
  let queue = Promise.resolve();
  let pending = 0;

  const camInput = h('input.bmf-file', { type: 'file', accept: 'image/*', capture: 'environment', tabindex: '-1', 'aria-hidden': 'true' });
  const galInput = h('input.bmf-file', { type: 'file', accept: 'image/*,application/pdf', multiple: multiple && limit > 1, tabindex: '-1', 'aria-hidden': 'true' });
  const camLabel = label || t.camera;
  const galLabel = galleryLabel || (variant === 'big' ? t.gallery : t.galleryShort);
  const iconOnly = (v) => variant === 'compact' || (variant === 'row' && v === 'gallery');

  const camBtn = h(
    'button.bmf-btn.bmf-pick-camera',
    { type: 'button', class: variant === 'big' ? 'bmf-btn-primary bmf-btn-lg' : 'bmf-btn-primary', 'aria-label': iconOnly('camera') ? camLabel : null, title: iconOnly('camera') ? camLabel : null, onClick: () => !disabled && camInput.click() },
    ic('camera', variant === 'big' ? 24 : 22),
    !iconOnly('camera') && h('span', camLabel),
  );
  const galBtn = h(
    'button.bmf-btn.bmf-btn-outline.bmf-pick-gallery',
    { type: 'button', 'aria-label': iconOnly('gallery') ? galLabel : null, title: iconOnly('gallery') ? galLabel : null, onClick: () => !disabled && galInput.click() },
    ic('image', 22),
    !iconOnly('gallery') && h('span', galLabel),
  );
  const status = h('p.bmf-pick-status', { role: 'status', 'aria-live': 'polite' });
  const error = h('p.bmf-pick-error', { role: 'alert', hidden: true });
  const grid = h('ul.bmf-thumbs', { class: variant === 'big' ? 'is-big' : 'is-small', 'aria-label': 'الصور المختارة' });

  let tipEl = null;
  if (tip) {
    let off = false;
    try {
      off = localStorage.getItem(TIP_KEY) === '1';
    } catch {
      off = false;
    }
    if (!off) {
      tipEl = h(
        'div.bmf-tip',
        ic('bulb', 20),
        h('p', t.tip),
        h(
          'button.bmf-tip-ok',
          {
            type: 'button',
            onClick: () => {
              try {
                localStorage.setItem(TIP_KEY, '1');
              } catch {
                /* لا شيء */
              }
              tipEl.remove();
            },
          },
          t.tipOk,
        ),
      );
    }
  }

  const el = h(
    'div.bmf-pick',
    { class: `bmf-pick--${variant}` },
    tipEl,
    h('div.bmf-pick-actions', camBtn, galBtn),
    camInput,
    galInput,
    status,
    error,
    grid,
  );

  const showError = (msg) => {
    error.textContent = msg || '';
    error.hidden = !msg;
  };

  const emit = () => {
    try {
      onChange?.(files.slice());
    } catch (e) {
      console.error(e);
    }
  };

  function urlFor(f) {
    if (!urls.has(f)) urls.set(f, URL.createObjectURL(f));
    return urls.get(f);
  }

  function paint() {
    for (const [f, u] of urls) {
      if (!files.includes(f)) {
        URL.revokeObjectURL(u);
        urls.delete(f);
      }
    }
    mount(
      grid,
      files.map((f, i) => {
        const isImg = typeOf(f).startsWith('image/') && typeOf(f) !== 'image/heic' && typeOf(f) !== 'image/heif';
        return h(
          'li.bmf-thumb',
          isImg
            ? h('img', { src: urlFor(f), alt: `صورة ${i + 1}`, loading: 'lazy', decoding: 'async' })
            : h('span.bmf-thumb-file', ic('file', 26), h('span.bmf-thumb-name', { dir: 'auto' }, f.name || `ملف ${i + 1}`)),
          h(
            'button.bmf-thumb-x',
            {
              type: 'button',
              disabled,
              'aria-label': `${t.remove} (${i + 1})`,
              title: t.remove,
              onClick: () => {
                if (disabled) return;
                files = files.filter((x) => x !== f);
                showError('');
                paint();
                emit();
                (grid.querySelector('.bmf-thumb-x') || camBtn).focus();
              },
            },
            ic('x', 20),
          ),
        );
      }),
    );
    grid.hidden = !files.length;
    const full = files.length + pending >= limit;
    camBtn.disabled = disabled || full;
    galBtn.disabled = disabled || full;
    el.dataset.count = String(files.length);
  }

  async function prepare(file) {
    const type = typeOf(file);
    if (!ACCEPTED.has(type)) {
      showError(messages.bad || t.bad);
      return null;
    }
    const name = `${prefix}-${files.length + 1}`;
    let out;
    try {
      out = await compressToBlob(file, { maxSide, quality, name });
    } catch {
      showError(messages.bad || t.bad);
      return null;
    }
    if (!out || !out.size || out.size > maxBytes) {
      showError(messages.bad || t.bad);
      return null;
    }
    return out;
  }

  function add(list) {
    const incoming = [...(list || [])];
    if (!incoming.length) return;
    showError('');
    const room = limit - files.length - pending;
    if (incoming.length > room) showError(messages.tooMany ? messages.tooMany(limit) : t.tooMany(limit));
    const take = incoming.slice(0, Math.max(0, room));
    if (!take.length) return;
    pending += take.length;
    status.textContent = t.preparing;
    el.classList.add('is-busy');
    paint();
    // صورة بعد صورة: موبايل بذاكرة 2 جيجا لا يتحمل فك عدة صور كبيرة معًا
    queue = queue.then(async () => {
      for (const f of take) {
        const out = await prepare(f);
        pending -= 1;
        if (out && files.length < limit) files.push(out);
        paint();
      }
      status.textContent = '';
      el.classList.remove('is-busy');
      emit();
    });
  }

  camInput.addEventListener('change', () => {
    add(camInput.files);
    camInput.value = '';
  });
  galInput.addEventListener('change', () => {
    add(galInput.files);
    galInput.value = '';
  });

  el.getFiles = () => files.slice();
  el.setFiles = (list = []) => {
    files = [...list].filter(Boolean).slice(0, limit);
    paint();
  };
  el.getUploads = async () => {
    await queue;
    const out = [];
    for (const f of files) out.push(await fileToUpload(f));
    return out;
  };
  el.ready = () => queue;
  el.clear = () => {
    files = [];
    showError('');
    paint();
    emit();
  };
  el.setDisabled = (v) => {
    disabled = !!v;
    el.classList.toggle('is-disabled', disabled);
    paint();
  };
  el.focusCamera = () => camBtn.focus();

  el.setFiles(initial);
  return el;
}
