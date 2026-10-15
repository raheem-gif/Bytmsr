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
//
// v12 media (MD-3، §5.8): photoPicker({ …, scan = 'auto'|'off', pages = false }) — كل صورة مستند تمر بالماسح على الموبايل
// (lib/scanner.js، يُحمَّل عند أول صورة فقط): الصورة المصغّرة هي الصفحة النظيفة، والصورة الأصلية تُرفع معها دائمًا.
// لم تُكتشف حدود الورقة أو كانت مقصوصة ← الأصل بنقطة كهرمانية وسطر وزران («إعادة التصوير» · «استخدام الصورة كما هي»)،
// ولمس الصورة يفتح ورقة تعديل الأركان. pages: true (الطلب المدفوع) ← «صفحة أخرى» تضيف صفحة لنفس المستند ← PDF واحد.
// أي فشل (فك، عامل، مهلة، ذاكرة، صفحة فارغة) يعود بصمت إلى التصغير العادي بلا scan. fileToUpload(file) يضيف scan (والأصول
// بـ base64) للملف الممسوح. Save-Data أو شبكة 2g/3g ← الأصل 1200 px بجودة 0.7 و«جارٍ تجهيز الصورة 2 من 3…» (L12-58).

import { h, svg, mount } from '../lib/h.js';

/** v12 media (MD-7، M12-01): تنسيق المكوّنات دون استيراد recorder.js (لا يُطلب المسجّل في صفحة بلا تسجيل صوتي) */
function ensureFormsStyles() {
  try {
    if (document.querySelector('link[data-bmf-css], link[href*="v91-b-forms.css"]')) return;
    const href = new URL('../../css/v91-b-forms.css', import.meta.url).pathname;
    document.head.append(h('link', { rel: 'stylesheet', href, 'data-bmf-css': '1' }));
  } catch {
    /* بلا تنسيق إضافي يبقى المكوّن صالحًا للاستخدام */
  }
}

// ملف ممسوح ← { doc: { name, pages }, scan } (الأصول Blobs حتى لحظة الإرسال)
const SCANS = new WeakMap();
let scanLoading = null;
let scanMods = null; // { scanner, sheet } بعد التحميل
/** الماسح وورقته عند أول صورة (لا يُطلبان مع الصفحة أبدًا) */
export function loadScanner() {
  if (!scanLoading) {
    scanLoading = Promise.all([import('../lib/scanner.js'), import('../lib/scan-sheet.js')]).then(
      ([scanner, sheet]) => {
        sheet.loadScanStyles();
        scanMods = { scanner, sheet };
        return scanMods;
      },
      (e) => {
        scanLoading = null;
        throw e;
      },
    );
  }
  return scanLoading;
}
/** المستند الممسوح خلف ملف (أو null) */
export function scanOf(file) {
  return (file && SCANS.get(file)) || null;
}
/** إعداد «تحسين صور المستندات على جهاز المرسل» (scan_client_enabled) إن حملته الصفحة؛ غيابه = مفعّل */
function scanSwitchOn() {
  try {
    const el = document.getElementById('bm-public');
    if (el && JSON.parse(el.textContent || '{}').scan === false) return false;
  } catch {
    /* بيانات الصفحة غير قابلة للقراءة: الافتراضي */
  }
  return true;
}
/** صفحات مستند ← ملف جديد مسجّل مع كتلة scan */
async function buildScanned(doc) {
  const { scanner } = await loadScanner();
  const { file, scan } = await scanner.docFile(doc.pages, { name: doc.name });
  SCANS.set(file, { doc, scan });
  return file;
}

// ───────── الماسح للمنتقيات الثلاثة (photoPicker هنا، coUploader للشركات، fileInput للفريق) ─────────
const SCANNABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DEFAULT_PAGES = 12; // L12-58 (الفريق 20)

/** صورة مستند ← ملف ممسوح (نظيف + أصل)، أو null (لا ماسح، ليست صورة، أي فشل ← التصغير العادي بصمت) */
export async function scanImage(file, { name = 'مستند', register = 'p', i = 1, n = 1, onStatus, sourceMax = 2400, maxSide = 1754, quality = 0.7 } = {}) {
  if (!SCANNABLE.has(typeOf(file)) || !scanSwitchOn()) return null;
  try {
    const m = await loadScanner();
    if (!m.scanner.supportsScanner()) return null;
    onStatus?.(m.sheet.prepText(register, i, n));
    const page = await m.scanner.scanPage(file, { sourceMax, maxSide, quality });
    return await buildScanned({ name, pages: [page], opts: { sourceMax, maxSide, quality } });
  } catch {
    return null;
  }
}
/** رقم أول صفحة تحتاج انتباهًا (مقصوصة أو بلا حدود) أو -1 */
export function scanProblem(file) {
  const s = SCANS.get(file);
  return s ? s.doc.pages.findIndex((p) => p.state === 'partial' || p.state === 'notfound') : -1;
}
/** ورقة تعديل الأركان على صفحة (الأولى التي تحتاج انتباهًا، وإلا الأخيرة) ← ملف جديد، أو null عند الإلغاء */
export async function scanEditPage(file, { register = 'p', trigger = null } = {}) {
  const s = SCANS.get(file);
  if (!s) return null;
  const { sheet } = await loadScanner();
  const w = scanProblem(file);
  const idx = w >= 0 ? w : s.doc.pages.length - 1;
  const o = s.doc.opts || {};
  const res = await sheet.editPage(s.doc.pages[idx], { register, trigger, maxSide: o.maxSide, quality: o.quality, sourceMax: o.sourceMax });
  if (res.action === 'cancel') return null;
  const pages = s.doc.pages.slice();
  pages[idx] = res.action === 'done' ? res.page : { ...pages[idx], clean: null, bits: null, state: 'asis' };
  return buildScanned({ ...s.doc, pages });
}
/** «استخدام الصورة كما هي» من الملاحظة: المقصوصة تبقى نسختها النظيفة (والأصل يُعرض أولًا، L12-59)، وبلا حدود ← الأصل */
export async function scanKeepPage(file, idx = scanProblem(file)) {
  const s = SCANS.get(file);
  if (!s || idx < 0) return null;
  const pages = s.doc.pages.slice();
  const p = pages[idx];
  pages[idx] = p.state === 'partial' ? { ...p, state: 'kept' } : { ...p, clean: null, bits: null, state: 'asis' };
  return buildScanned({ ...s.doc, pages });
}
/**
 * صورة جديدة صفحةً إضافية (replace = رقم صفحة يُستبدل: «إعادة التصوير») ← ملف جديد، أو null.
 * الوضع الذي اختاره الشخص للصفحة السابقة (أبيض وأسود أو رمادي) يُطبَّق على الصفحة الجديدة (مراجعة 12.0).
 */
export async function scanAddPage(file, raw, { replace = null, maxPages = DEFAULT_PAGES } = {}) {
  const s = SCANS.get(file);
  if (!s || !SCANNABLE.has(typeOf(raw))) return null;
  const isReplace = Number.isInteger(replace) && replace >= 0 && replace < s.doc.pages.length;
  if (!isReplace && s.doc.pages.length >= maxPages) return null;
  const { scanner } = await loadScanner();
  const o = s.doc.opts || {};
  const ref = s.doc.pages[isReplace ? replace : s.doc.pages.length - 1];
  const mode = ref && ref.mode && ref.mode !== 'auto' ? ref.mode : 'auto';
  const page = await scanner.scanPage(raw, { sourceMax: o.sourceMax, maxSide: o.maxSide, quality: o.quality, mode });
  const pages = s.doc.pages.slice();
  if (isReplace) pages[replace] = page;
  else pages.push(page);
  return buildScanned({ ...s.doc, pages });
}
/** عدد صفحات المستند الممسوح (0 لملف عادي) */
export function scanPages(file) {
  return SCANS.get(file)?.doc.pages.length || 0;
}
/** كتلة scan بأصولها بـ base64 دون الملف الرئيسي (لمسار الفريق: file.bmScan) أو null */
export async function scanBlock(file) {
  const s = SCANS.get(file)?.scan;
  if (!s) return null;
  const originals = [];
  for (const o of s.originals) originals.push({ filename: o.filename, mime: o.mime, data_base64: await readAsBase64(o.blob) });
  const { originals: _o, ...params } = s;
  return { ...params, originals };
}
/**
 * ربط الماسح بقائمة ملفات الفريق (ui.js fileInput) — هنا لا في ui.js حتى لا يكبر ملف المنصة الأساسي.
 * ctl: { files(), set(i, file), input, maxBytes, note(msg), pages } → { scan(file), row(file), take(list), reset() }
 */
export function fileInputScan(ctl) {
  let pick = null; // { f, replace }: الصورة التالية صفحة جديدة لمستند أو بديل صفحة
  const swap = async (old, out) => {
    const i = ctl.files().indexOf(old);
    if (i < 0 || !out) return;
    if (out.size > ctl.maxBytes) return ctl.note(`الملف «${out.name}» أكبر من الحد المسموح`);
    out.bmScan = await scanBlock(out);
    ctl.set(i, out);
  };
  // تعديل بعد تعديل على المستند نفسه (صفحة ثم صفحة) بالترتيب، وكل تعديل يبدأ من آخر نسخة (لا تضيع صفحة، مراجعة 12.0)
  const latest = new WeakMap();
  const cur = (f) => {
    let x = f;
    while (latest.has(x)) x = latest.get(x);
    return x;
  };
  let chain = Promise.resolve();
  const done = (old, fn) =>
    (chain = chain.then(async () => {
      const f = cur(old);
      if (!ctl.files().includes(f)) return;
      let out = null;
      try {
        out = await fn(f);
      } catch {
        out = null;
      }
      if (!out) return;
      latest.set(f, out);
      await swap(f, out);
    }));
  return {
    scan: (f) => done(f, (x) => scanImage(x, { name: x.name, register: 'staff', sourceMax: 3200, maxSide: 2339 })),
    reset: () => (pick = null),
    take(list) {
      const tg = pick;
      pick = null;
      if (!tg || !list.length || !ctl.files().includes(cur(tg.f))) return false;
      done(tg.f, (x) => scanAddPage(x, list[0], { maxPages: 20, replace: tg.replace }));
      return true;
    },
    row(file) {
      const doc = scanDoc(file);
      if (!doc || !scanMods) return null;
      const { sheet } = scanMods;
      const w = scanProblem(file);
      const choose = (replace) => {
        pick = { f: file, replace };
        ctl.input.click();
      };
      return h(
        'div.file-scan',
        doc.pages.length > 1 ? sheet.pagesBadge(doc.pages.length) : null,
        h('button.scn-btn.scn-btn--text.scn-btn--sm', { type: 'button', onClick: (e) => done(file, (x) => scanEditPage(x, { register: 'staff', trigger: e.currentTarget })), tag: 'UP-10' }, 'تعديل'),
        ctl.pages && doc.pages.length < 20 ? sheet.addPageButton({ register: 'staff', onClick: () => choose(null) }) : null,
        w >= 0 ? sheet.scanNote(doc.pages[w], { register: 'staff', onRetake: () => choose(w), onKeep: () => done(file, (x) => scanKeepPage(x, w)) }) : null,
      );
    },
  };
}
/** صفحات المستند الممسوح ({ name, pages }) أو null */
export function scanDoc(file) {
  return SCANS.get(file)?.doc || null;
}

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

/** ملف ← مرفق بصيغة الخادم (+ scan بأصوله إن مرّ بالماسح، §5.4) */
export async function fileToUpload(file) {
  const mime = typeOf(file) === 'image/heif' ? 'image/heic' : typeOf(file) || 'application/octet-stream';
  const up = { filename: file.name || `ملف${MIME_EXT[mime] || ''}`, mime, data_base64: await readAsBase64(file) };
  const scan = await scanBlock(file);
  if (scan) up.scan = scan;
  return up;
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
    { role: 'status', tag: 'UP-09' },
    pct,
    bar,
    h('p.bmf-progress-hint', t.dontClose),
    onCancel && h('button.bmf-btn.bmf-btn-outline.bmf-progress-stop', { type: 'button', onClick: () => onCancel(), tag: 'UP-11' }, t.stop),
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

const MAX_PAGES = DEFAULT_PAGES; // L12-58: صفحات المستند الواحد على الطلب والمتابعة
const OPEN_LABEL = { f: 'ظبّطي الورقة', m: 'ظبّط الورقة', p: 'تعديل المستند' };

/**
 * الكاميرا أولًا ثم «من الموبايل»، مع صور مصغّرة وزر × لكل صورة.
 * scan: 'auto' (الماسح على الموبايل) | 'off' · pages: «صفحة أخرى» لمستند من عدة صفحات (الطلب المدفوع)
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
  scan = 'auto',
  pages = false,
} = {}) {
  ensureFormsStyles();
  const t = copyFor(address);
  const register = address === 'm' || address === 'p' ? address : 'f';
  const limit = Math.max(1, multiple ? Number(max) || 5 : 1);
  const prefix = safePrefix(namePrefix);
  // دفتر الصفحات للطلب المدفوع فقط؛ «خيري»: صورة واحدة = ورقة واحدة (O-M5)
  const multiPage = !!pages && register === 'p';
  let files = [];
  let urls = new Map();
  let disabled = false;
  let queue = Promise.resolve();
  let pending = 0;
  let docN = 0;
  // الصورة التالية من الكاميرا: صفحة جديدة لمستند، أو بديل صفحة («إعادة التصوير»)
  let target = null;

  const camInput = h('input.bmf-file', { type: 'file', accept: 'image/*', capture: 'environment', tabindex: '-1', 'aria-hidden': 'true', tag: 'UP-12' });
  const galInput = h('input.bmf-file', { type: 'file', accept: 'image/*,application/pdf', multiple: multiple && limit > 1, tabindex: '-1', 'aria-hidden': 'true', tag: 'UP-13' });
  const camLabel = label || t.camera;
  const galLabel = galleryLabel || (variant === 'big' ? t.gallery : t.galleryShort);
  const iconOnly = (v) => variant === 'compact' || (variant === 'row' && v === 'gallery');

  // K-M3: الضغط على زر التصوير يجهّز الماسح (لا عند تحميل الصفحة، ولا حين يكون متوقفًا)
  const warm = () => {
    if (scan !== 'off' && scanSwitchOn()) loadScanner().then((m) => m.scanner.warm?.(), () => {});
  };
  const camBtn = h(
    'button.bmf-btn.bmf-pick-camera',
    {
      type: 'button',
      class: variant === 'big' ? 'bmf-btn-primary bmf-btn-lg' : 'bmf-btn-primary',
      'aria-label': iconOnly('camera') ? camLabel : null,
      title: iconOnly('camera') ? camLabel : null,
      onPointerdown: warm,
      onClick: () => {
        if (disabled) return;
        target = null;
        warm();
        camInput.click();
      },
      tag: 'UP-01',
    },
    ic('camera', variant === 'big' ? 24 : 22),
    !iconOnly('camera') && h('span', camLabel),
  );
  const galBtn = h(
    'button.bmf-btn.bmf-btn-outline.bmf-pick-gallery',
    {
      type: 'button',
      'aria-label': iconOnly('gallery') ? galLabel : null,
      title: iconOnly('gallery') ? galLabel : null,
      onPointerdown: warm,
      onClick: () => {
        if (disabled) return;
        warm();
        galInput.click();
      },
      tag: 'UP-02',
    },
    ic('image', 22),
    !iconOnly('gallery') && h('span', galLabel),
  );
  const status = h('p.bmf-pick-status', { role: 'status', 'aria-live': 'polite', tag: 'UP-06' });
  const error = h('p.bmf-pick-error', { role: 'alert', hidden: true, tag: 'UP-08' });
  const grid = h('ul.bmf-thumbs', { class: variant === 'big' ? 'is-big' : 'is-small', 'aria-label': 'الصور المختارة', tag: 'UP-03' });
  const noteHost = h('div.bmf-scan-host');

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
        { tag: 'UP-07' },
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
            tag: 'UP-14',
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
    noteHost,
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

  function urlFor(blob) {
    if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
    return urls.get(blob);
  }
  /** الصفحة التي تحتاج انتباهًا (مقصوصة أو بلا حدود)، وإلا آخر صفحة */
  const problemIndex = (doc) => doc.pages.findIndex((p) => p.state === 'partial' || p.state === 'notfound');
  const shownBlob = (f) => {
    const s = SCANS.get(f);
    if (!s) return f;
    // مقصوصة أو بلا حدود: الصورة المصغّرة تبقى الأصل (بنقطة كهرمانية) حتى يقرر الشخص
    const p = s.doc.pages[0];
    return p.clean && p.state !== 'notfound' && p.state !== 'partial' ? p.clean : p.original;
  };

  function paint() {
    const live = new Set(files.map(shownBlob));
    for (const [b, u] of urls) {
      if (!live.has(b)) {
        URL.revokeObjectURL(u);
        urls.delete(b);
      }
    }
    let note = null;
    mount(
      grid,
      files.map((f, i) => {
        const s = SCANS.get(f);
        const show = shownBlob(f);
        const type = typeOf(show);
        const isImg = type.startsWith('image/') && type !== 'image/heic' && type !== 'image/heif';
        const img = isImg ? h('img', { src: urlFor(show), alt: `صورة ${i + 1}`, loading: 'lazy', decoding: 'async' }) : h('span.bmf-thumb-file', ic('file', 26), h('span.bmf-thumb-name', { dir: 'auto' }, f.name || `ملف ${i + 1}`));
        const warn = s ? problemIndex(s.doc) : -1;
        if (s && warn >= 0 && !note && scanMods) {
          note = { f, page: s.doc.pages[warn], idx: warn };
        }
        return h(
          'li.bmf-thumb',
          s && isImg
            ? h('button.scn-thumb-open', { type: 'button', disabled, 'aria-label': `${OPEN_LABEL[register]} ${i + 1}`, onClick: (e) => edit(f, e.currentTarget), tag: 'UP-04' }, img)
            : img,
          s && warn >= 0 ? h('span.scn-dot', { 'aria-hidden': 'true' }) : null,
          s && s.doc.pages.length > 1 && scanMods ? scanMods.sheet.pagesBadge(s.doc.pages.length) : null,
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
              tag: 'UP-05',
            },
            ic('x', 20),
          ),
        );
      }),
    );
    grid.hidden = !files.length;
    // ملاحظة واحدة تحت الصور: لم تُكتشف حدود الورقة أو كانت مقصوصة
    const last = files[files.length - 1];
    const lastDoc = last && SCANS.get(last)?.doc;
    mount(
      noteHost,
      note && scanMods
        ? scanMods.sheet.scanNote(note.page, {
            register,
            onRetake: disabled ? null : () => retake(note.f, note.idx),
            onKeep: disabled ? null : () => keep(note.f, note.idx),
          })
        : null,
      // «صفحة أخرى» لآخر مستند، ولا تظهر مع ملاحظة تنتظر قرارًا (قرار واحد في المرة)
      multiPage && !note && lastDoc && scanMods && lastDoc.pages.length < MAX_PAGES
        ? scanMods.sheet.addPageButton({
            register,
            // gate JR-09: بعد الصفحة الأولى سؤال صغير بجانب الزر، فلا تصير الصفحة الثانية مستندًا منفصلًا
            hint: lastDoc.pages.length === 1,
            disabled: disabled || pending > 0,
            onClick: () => {
              if (disabled) return;
              target = { mode: 'add', f: last };
              camInput.click();
            },
          })
        : null,
    );
    const full = files.length + pending >= limit;
    camBtn.disabled = disabled || full;
    galBtn.disabled = disabled || full;
    el.dataset.count = String(files.length);
  }

  /** صورة ← ملف جاهز: الماسح أولًا (صورة مستند)، وإلا التصغير العادي كما في 11.0 */
  async function prepare(file, i = 1, n = 1) {
    const type = typeOf(file);
    if (!ACCEPTED.has(type)) {
      showError(messages.bad || t.bad);
      return null;
    }
    docN += 1;
    const name = `${prefix}-${docN}`;
    if (scan !== 'off') {
      const out = await scanImage(file, { name, register, i, n, onStatus: (txt) => (status.textContent = txt) });
      if (out && out.size && out.size <= maxBytes) return out;
    }
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
      for (let k = 0; k < take.length; k++) {
        const out = await prepare(take[k], k + 1, take.length);
        pending -= 1;
        if (out && files.length < limit) files.push(out);
        paint();
      }
      status.textContent = '';
      el.classList.remove('is-busy');
      emit();
    });
  }

  // ملف استُبدل (تعديل، صفحة جديدة) ← ملفه الجديد: «صفحة أخرى» مرتين قبل انتهاء الأولى تُضاف للمستند نفسه ولا تضيع (مراجعة 12.0)
  const replaced = new WeakMap();
  const latest = (f) => {
    let x = f;
    while (replaced.has(x)) x = replaced.get(x);
    return x;
  };
  /**
   * تعديل مستند ممسوح (ورقة التعديل، صفحة جديدة، بديل صفحة) ← ملف جديد مكانه. fn(ملف المستند الحالي) بالترتيب في الطابور.
   * fallback: صورة لم تُجهز صفحةً (فشل الماسح أو الحد الأقصى للصفحات) تُضاف صورةً مستقلة بدل أن تضيع.
   * refocus: التركيز يعود إلى الصورة المصغّرة الجديدة بعد إغلاق ورقة التعديل (العنصر القديم أعيد رسمه).
   */
  function change(f0, fn, { fallback = null, refocus = false } = {}) {
    queue = queue.then(async () => {
      const f = latest(f0);
      if (!SCANS.get(f) || !files.includes(f)) {
        if (fallback) add([fallback]);
        return;
      }
      el.classList.add('is-busy');
      let at = files.indexOf(f);
      try {
        const out = await fn(f);
        if (!out) {
          if (fallback) add([fallback]);
          return;
        }
        if (out.size > maxBytes) return showError(messages.bad || t.bad);
        at = files.indexOf(f);
        if (at >= 0) {
          files[at] = out;
          replaced.set(f, out);
        }
      } catch {
        // الصفحة الجديدة لم تُجهز: يبقى المستند كما كان، والصورة نفسها تُضاف وحدها (التصغير العادي)
        if (fallback) add([fallback]);
      } finally {
        status.textContent = '';
        el.classList.remove('is-busy');
        paint();
        emit();
        if (refocus && at >= 0) grid.querySelectorAll('.bmf-thumb')[at]?.querySelector('.scn-thumb-open, .bmf-thumb-x')?.focus();
      }
    });
    return queue;
  }
  const edit = (f, trigger) => !disabled && change(f, (cur) => scanEditPage(cur, { register, trigger }), { refocus: true });
  const keep = (f, idx) => change(f, (cur) => scanKeepPage(cur, idx));
  function retake(f, idx) {
    target = { mode: 'replace', f, idx };
    camInput.click();
  }
  function takePage(raw) {
    const tg = target;
    target = null;
    if (!tg || !files.includes(latest(tg.f)) || !SCANNABLE.has(typeOf(raw))) return add([raw]);
    status.textContent = scanMods ? scanMods.sheet.prepText(register) : t.preparing;
    return change(tg.f, (cur) => scanAddPage(cur, raw, { replace: tg.mode === 'replace' ? tg.idx : null, maxPages: MAX_PAGES }), { fallback: raw });
  }

  camInput.addEventListener('change', () => {
    const list = [...(camInput.files || [])];
    camInput.value = '';
    if (target && list.length) takePage(list[0]);
    else add(list);
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
