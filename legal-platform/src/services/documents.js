// المستندات: الحفظ الآمن على القرص، والتحقق من صلاحية الوصول قبل أي تنزيل.
//
// v12 media (MD-4، §5.8، L12-58 … L12-61، L12-67، L12-70، L12-73):
// • كل ملف يُفك ويُفحص كاملًا (الحجم، بصمة المحتوى، أبعاد الصورة من الترويسة وحدها) قبل أي كتابة: inspect().
//   صورة أكبر من 40 ميجابكسل أو ضلعها أكثر من 12,000 ← 400 image_too_large «الصورة كبيرة جدًا» لما يرفعه شخص؛ وما
//   ينزّله الخادم (واتساب) يُحفظ بلا فك وscan_state = 'skipped' (للتنزيل فقط).
// • مرفق من ماسح الهاتف (scan): الملف الرئيسي = النسخة النظيفة (صف documents)، والأصول = document_files(role='original',
//   page=n) تحت uploadsDir/variants/YYYY/MM/ ببصمة sha256 وأبعادها. المعروض افتراضيًا (display_file_id): النسخة النظيفة
//   فقط حين تكون واثقة (L12-59)، وإلا أصل الصفحة الأولى. HEIC يُحفظ كما هو وscan_state = 'skipped'.
// • التنزيل بنسخة (file = display | main | clean | original، page = n) لا يحل إلا WHERE document_id = المستند نفسه؛
//   أصل JPEG ينزّله محامٍ تُحذف منه بيانات EXIF/XMP (APP1) أثناء الإرسال، والملف المخزّن وبصمته كما هما.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest, notFound, forbidden, nowIso, randomToken, v, arabicCount, AR_UNITS, ApiError } from '../util.js';
import { imageDims } from '../../public/assets/js/lib/scan-core.js';

// أنواع الملفات المسموح بها (المستندات والصور والرسائل الصوتية الشائعة في واتساب)
const ALLOWED = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'video/mp4': '.mp4',
  // v9.1 b-forms: الرسالة الصوتية من نموذج الموقع والبوابة (MediaRecorder في Chrome على أندرويد يسجّل audio/webm)
  'audio/webm': '.webm',
};
const EXT_TO_MIME = Object.fromEntries(Object.entries(ALLOWED).map(([m, e]) => [e, m]));
EXT_TO_MIME['.jpeg'] = 'image/jpeg';

// v12 media (L12-67): حدود الصورة المقروءة من الترويسة
export const IMAGE_MAX_PIXELS = 40_000_000;
export const IMAGE_MAX_SIDE = 12_000;
const RASTER = new Set(['image/jpeg', 'image/png', 'image/webp']);
// الملف الرئيسي لمرفق ممسوح: صورة نظيفة أو PDF من عدة صفحات (M §5.4)
const SCAN_MAIN = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const SCANNED_STATES = new Set(['client', 'staff']);

/** فحص البصمة الأولى للملف (magic bytes) حتى لا يُقبل ملف تنفيذي أو HTML على أنه PDF أو صورة */
function contentMatches(mime, buf) {
  const at = (i, ...bytes) => bytes.every((b, k) => buf[i + k] === b);
  const ascii = (i, str) => buf.length >= i + str.length && buf.toString('latin1', i, i + str.length) === str;
  const zip = () => at(0, 0x50, 0x4b, 0x03, 0x04);
  const ole = () => at(0, 0xd0, 0xcf, 0x11, 0xe0);
  const ftyp = () => ascii(4, 'ftyp');
  switch (mime) {
    case 'application/pdf':
      return buf.subarray(0, 1024).includes('%PDF');
    case 'image/png':
      return at(0, 0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg':
      return at(0, 0xff, 0xd8, 0xff);
    case 'image/webp':
      return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'image/heic':
    case 'video/mp4':
    case 'audio/mp4':
      return ftyp();
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return zip();
    case 'application/msword':
    case 'application/vnd.ms-excel':
      return ole();
    case 'audio/ogg':
      return ascii(0, 'OggS');
    case 'audio/webm':
      // v9.1 b-forms: حاوية Matroska/WebM تبدأ بترويسة EBML
      return at(0, 0x1a, 0x45, 0xdf, 0xa3);
    case 'audio/mpeg':
      return ascii(0, 'ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    case 'text/plain':
      return !buf.subarray(0, 8192).includes(0) && !ascii(0, 'MZ');
    default:
      return false;
  }
}

function sanitizeFilename(name) {
  const base = String(name || 'ملف').split(/[\\/]/).pop();
  // إزالة محارف التحكم وما قد يكسر ترويسة Content-Disposition
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().slice(0, 150);
  return cleaned || 'ملف';
}

/** أبعاد الصورة من ترويستها فقط (بلا فك) بعد تطبيق اتجاه EXIF ← { width, height, rawWidth, rawHeight } أو null */
export function headerDims(mime, buf) {
  if (!RASTER.has(mime)) return null;
  const d = imageDims(buf);
  if (!d || !d.width || !d.height) return null;
  const swap = d.orientation >= 5 && d.orientation <= 8;
  return { width: swap ? d.height : d.width, height: swap ? d.width : d.height, rawWidth: d.width, rawHeight: d.height, orientation: d.orientation || 1 };
}
export const isTooLarge = (d) => !!d && (d.rawWidth * d.rawHeight > IMAGE_MAX_PIXELS || d.rawWidth > IMAGE_MAX_SIDE || d.rawHeight > IMAGE_MAX_SIDE);
const tooLargeError = (name) => new ApiError(400, 'الصورة كبيرة جدًا', 'image_too_large', { fields: { file: name ? `الصورة «${name}» كبيرة جدًا` : 'الصورة كبيرة جدًا' } });

/** L12-73: نسخة JPEG بلا مقاطع APP1 (EXIF/GPS وXMP)؛ أي بنية غير متوقعة ← null (يُرسل الملف كما هو) */
export function stripJpegApp1(buf) {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return null;
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      parts.push(buf.subarray(i));
      return Buffer.concat(parts);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2 || i + 2 + len > buf.length) return null;
    if (marker !== 0xe1) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** مساحة شكل رباعي (أركانه بين 0 و1) من الصورة */
function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const n = q[(i + 1) % 4];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return Math.abs(a) / 2;
}
/** L12-59: النسخة النظيفة تُعرض أولًا فقط حين تكون واثقة؛ الأركان التي حددها الشخص بنفسه تُعامل كواثقة */
export function scanConfident(params) {
  if (!params || params.mode === 'bw' || params.partial) return false;
  if (params.adjusted) return true;
  if (!(Number(params.score) >= 0.6)) return false;
  const quads = Array.isArray(params.quads) ? params.quads : [];
  return quads.length > 0 && quads.every((q) => Array.isArray(q) && q.length === 4 && quadArea(q) >= 0.6);
}

export function createDocuments(app) {
  const { db, config } = app;
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  const uploadsRoot = path.resolve(config.uploadsDir);

  // الامتداد المعروف أولى من النوع الذي يعلنه المتصفح أو المرسل؛ ثم يُتحقق من المحتوى نفسه
  function resolveMime(filename, mime) {
    const ext = path.extname(filename).toLowerCase();
    if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
    const declared = String(mime || '').split(';')[0].trim().toLowerCase();
    if (declared && ALLOWED[declared]) return declared;
    return null;
  }

  /** اسم ملف امتداده يطابق النوع الفعلي دائمًا (scan.pdf.exe المعلن صورة يصبح scan.pdf.png) */
  function safeFilename(name, realMime) {
    const ext = path.extname(name).toLowerCase();
    if (EXT_TO_MIME[ext] === realMime) return name;
    return (name.replace(/\.[^.]*$/, '') || 'ملف') + ALLOWED[realMime];
  }

  /** مسار جديد داخل uploadsDir (اختياريًا تحت variants/) */
  function newKey(realMime, sub = '') {
    const d = new Date();
    return path.join(sub, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), randomToken(18) + (ALLOWED[realMime] || ''));
  }
  function writeKey(rel, buf) {
    const abs = path.join(config.uploadsDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
    fs.writeFileSync(abs, buf, { mode: 0o600 });
    return abs;
  }
  const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

  /** سطح الرفع لحدود الماسح (L12-58): الفريق، أو الشركات، أو العميل (الموقع وصفحة المتابعة) */
  function surfaceOf(links, uploader) {
    if (uploader && (uploader.role || uploader.id) && uploader.kind !== 'client') return 'staff';
    if (links?.company_id) return 'company';
    return 'intake';
  }

  /**
   * فك ملف مرفوع وفحصه كاملًا دون كتابة (L12-70): النوع، الحجم، بصمة المحتوى، وأبعاد الصورة من ترويستها (L12-67).
   * fetched: ملف نزّله الخادم (واتساب) ← الصورة الضخمة لا تُرفض بل تُعلَّم. → { original, name, realMime, buf, dims, tooLarge }
   */
  function inspect({ filename, mime, data_base64, buffer } = {}, { fetched = false } = {}) {
    const original = sanitizeFilename(filename);
    const realMime = resolveMime(original, mime);
    if (!realMime) throw badRequest(`نوع الملف «${original}» غير مدعوم. الأنواع المسموح بها: PDF، الصور، Word، Excel، النصوص، والرسائل الصوتية`);
    const name = safeFilename(original, realMime);
    let buf = buffer;
    if (!buf) {
      if (typeof data_base64 !== 'string' || !data_base64) throw badRequest(`الملف «${name}» فارغ`);
      const b64 = data_base64.includes(',') && data_base64.startsWith('data:') ? data_base64.split(',')[1] : data_base64;
      buf = Buffer.from(b64, 'base64');
    }
    if (!buf.length) throw badRequest(`الملف «${name}» فارغ`);
    if (buf.length > maxBytes) throw badRequest(`الملف «${name}» أكبر من الحد المسموح (${config.maxUploadMb} ميجابايت)`);
    if (!contentMatches(realMime, buf)) throw badRequest(`محتوى الملف «${original}» لا يطابق نوعه. ارفع الملف الأصلي دون تغيير امتداده`);
    const dims = headerDims(realMime, buf);
    const tooLarge = isTooLarge(dims);
    if (tooLarge && !fetched) throw tooLargeError(name);
    return { original, name, realMime, buf, dims, tooLarge };
  }

  /**
   * كتلة scan لمرفق (§5.4): البنية والحدود (app.media.checkScan) ثم فك كل أصل وفحصه كما في inspect.
   * → { params, originals: [{ name, realMime, buf, dims }] } أو null
   */
  function prepareScan(scan, { surface = 'intake', mainMime = null } = {}) {
    if (scan === undefined || scan === null) return null;
    const s = app.media.checkScan(scan, { surface });
    if (mainMime && !SCAN_MAIN.has(mainMime)) throw new ApiError(400, 'المستند المحسّن يجب أن يكون صورة JPG أو PNG أو ملف PDF', 'bad_scan', { fields: { scan: 'نوع غير صالح' } });
    const originals = s.originals.map((o) => {
      const r = inspect(o);
      if (!RASTER.has(r.realMime)) throw new ApiError(400, 'الصورة الأصلية يجب أن تكون JPG أو PNG أو WebP', 'bad_scan', { fields: { scan: 'نوع غير صالح' } });
      return r;
    });
    return { params: s.params, originals };
  }

  const svc = {
    maxBytes,
    inspect,
    prepareScan,
    /** v9.1 b-forms: هل الملف المرفوع (قبل الحفظ) رسالة صوتية؟ بالامتداد أولًا ثم النوع المعلن، كما في save() */
    isAudio(file) {
      const m = resolveMime(sanitizeFilename(file?.filename), file?.mime);
      return !!m && m.startsWith('audio/');
    },
    /**
     * حفظ ملف مرفوع (base64 من الواجهة أو Buffer من واتساب).
     * links: { client_id, intake_id, case_id, matter_id, message_id, info_request_id, title }
     * file.scan (v12): كتلة الماسح بأصولها؛ تُفحص كلها قبل أي كتابة.
     */
    save(file = {}, links = {}, uploader) {
      const fetched = !!file.buffer && !file.data_base64;
      const main = inspect(file, { fetched });
      const { name, realMime, buf, dims } = main;
      const surface = surfaceOf(links, uploader);
      const scan = file.scan === undefined || file.scan === null || fetched ? null : prepareScan(file.scan, { surface, mainMime: realMime });
      // v12 media: الحالة — ممسوح على الهاتف (client/staff)، أو «لم يُعالَج» لـ HEIC والصورة الضخمة (لا تُفك أبدًا)
      let scanState = null;
      if (scan) scanState = surface === 'staff' ? 'staff' : 'client';
      else if (realMime === 'image/heic' || main.tooLarge) scanState = 'skipped';
      const createdByKind = uploader?.kind === 'client' ? (links.company_id ? 'company' : 'client') : uploader?.role === 'lawyer' ? 'lawyer' : uploader ? 'staff' : 'system';

      const written = [];
      try {
        const rel = newKey(realMime);
        written.push(writeKey(rel, buf));
        const variants = (scan?.originals || []).map((o, i) => {
          const key = newKey(o.realMime, 'variants');
          written.push(writeKey(key, o.buf));
          const pages = scan.params.pages;
          const n = scan.originals.length;
          return { o, key, page: n === pages ? i + 1 : Math.min(pages, Math.floor((i * pages) / n) + 1) };
        });
        const t = nowIso();
        return db.tx(() => {
          const id = db.insert('documents', {
            client_id: links.client_id ?? null,
            intake_id: links.intake_id ?? null,
            case_id: links.case_id ?? null,
            matter_id: links.matter_id ?? null,
            message_id: links.message_id ?? null,
            info_request_id: links.info_request_id ?? null,
            title: v.str(links.title, 'عنوان المستند', { max: 200 }) || name,
            filename: name,
            mime: realMime,
            size: buf.length,
            sha256: sha(buf),
            storage_key: rel,
            uploaded_by_kind: uploader?.kind || (uploader?.role === 'lawyer' ? 'lawyer' : uploader ? 'staff' : 'system'),
            uploaded_by_user_id: uploader?.id ?? null,
            // v10 b2b-server (L-19، §4.4): ربط ملفات الشركات — رفع الشركة بلا معرّف مستخدم من users أبدًا
            company_id: links.company_id ?? undefined,
            company_request_id: links.company_request_id ?? undefined,
            company_user_id: links.company_user_id ?? undefined,
            assignment_id: links.assignment_id ?? undefined,
            created_at: t,
            // v12 media
            scan_state: scanState ?? undefined,
            page_count: scan ? scan.params.pages : undefined,
            width: dims ? dims.width : undefined,
            height: dims ? dims.height : undefined,
          });
          if (scan) {
            const params = JSON.stringify(scan.params);
            let firstOriginal = null;
            for (const vt of variants) {
              const fid = db.insert('document_files', {
                document_id: id,
                role: 'original',
                page: vt.page,
                storage_key: vt.key,
                mime: vt.o.realMime,
                size: vt.o.buf.length,
                sha256: sha(vt.o.buf),
                width: vt.o.dims ? vt.o.dims.width : null,
                height: vt.o.dims ? vt.o.dims.height : null,
                source: surface === 'staff' ? 'staff_scanner' : 'client_scanner',
                params,
                created_by_kind: createdByKind,
                created_by: createdByKind === 'staff' || createdByKind === 'lawyer' ? (uploader?.id ?? null) : null,
                company_user_id: links.company_user_id ?? null,
                created_at: t,
              });
              if (vt.page === 1 && !firstOriginal) firstOriginal = fid;
            }
            // L12-59: المعروض أولًا = الأصل ما لم تكن النسخة النظيفة واثقة
            if (!scanConfident(scan.params) && firstOriginal) db.run('UPDATE documents SET display_file_id = ? WHERE id = ?', firstOriginal, id);
          }
          // v9.2 (admin-ai): رسالة صوتية من المستفيدة ← «لم تُكتب بعد» حتى تكتب الإدارة ما قالته (مدتها من الواجهة أو من ملف Ogg)
          if (realMime.startsWith('audio/') && uploader?.kind === 'client' && app.voice?.onAudioSaved) {
            let secs = file.seconds === undefined || file.seconds === null || file.seconds === '' ? NaN : Number(file.seconds);
            if (!Number.isFinite(secs) && realMime === 'audio/ogg') secs = app.voice.oggDurationSeconds?.(buf) ?? NaN;
            app.voice.onAudioSaved({
              documentId: id,
              intakeId: links.intake_id ?? null,
              caseId: links.case_id ?? null,
              messageId: links.message_id ?? null,
              seconds: Number.isFinite(secs) ? Math.min(600, Math.max(0, secs)) : null,
            });
          }
          return id;
        });
      } catch (e) {
        // لا يبقى ملف على القرص لصف لم يُكتب
        for (const abs of written) {
          try {
            fs.unlinkSync(abs);
          } catch {
            /* لا شيء */
          }
        }
        throw e;
      }
    },

    /** حفظ مجموعة ملفات مرفوعة من الواجهة مع التحقق من العدد، وكلها تُفحص قبل كتابة أي منها (L12-70) */
    saveMany(files, links, uploader, { max = 5 } = {}) {
      if (files === undefined || files === null) return [];
      if (!Array.isArray(files)) throw badRequest('صيغة المرفقات غير صالحة');
      if (files.length > max) throw badRequest(`الحد الأقصى ${arabicCount(max, AR_UNITS.file)} في المرة الواحدة`);
      if (files.length && app.media) {
        if (app.media.diskLow()) throw app.media.diskLowError();
        app.media.checkAttachments(files, { surface: surfaceOf(links, uploader) });
      }
      return files.map((f) => svc.save(f || {}, links, uploader));
    },

    get(id) {
      return db.get('SELECT * FROM documents WHERE id = ?', id);
    },

    /** نسخ المستند (الأصول والمحسّنة)، الأحدث أولًا داخل الدور والصفحة */
    files(docId) {
      return db.all('SELECT * FROM document_files WHERE document_id = ? ORDER BY role, page, replaced_at IS NOT NULL, id DESC', docId);
    },

    /** v12 (MD-5): الملف الرئيسي هو النسخة النظيفة؟ (مرّ بماسح الهاتف: client / staff) */
    mainIsClean(doc) {
      return SCANNED_STATES.has(doc?.scan_state);
    },

    /**
     * v12 (MD-5، L12-61): النسخ كما يراها العارض.
     * → { clean: صف النسخة المحسّنة الحالية | 'main' | null, display: 'clean' | 'original', row: صف المعروض أو null }
     */
    variantsOf(doc) {
      if (!doc) return { clean: null, display: 'original', row: null };
      const cleanRow = db.get("SELECT * FROM document_files WHERE document_id = ? AND role = 'clean' AND page = 1 AND replaced_at IS NULL ORDER BY id DESC LIMIT 1", doc.id) || null;
      const clean = cleanRow || (SCANNED_STATES.has(doc.scan_state) ? 'main' : null);
      const row = doc.display_file_id ? db.get('SELECT * FROM document_files WHERE id = ? AND document_id = ?', doc.display_file_id, doc.id) || null : null;
      let display;
      if (row) display = row.role === 'clean' ? 'clean' : 'original';
      else display = SCANNED_STATES.has(doc.scan_state) ? 'clean' : 'original';
      return { clean, display, row };
    },

    /**
     * v12 (MD-5، L12-61): الملف المعروض للقراءة الآلية (تحليل Claude). مستند PDF من عدة صفحات يُقرأ كاملًا (الرئيسي)
     * حتى لا يُقرأ أصل الصفحة الأولى وحده. → { storage_key, mime, size, variant }
     */
    displayFile(doc) {
      if (!doc) return null;
      if (doc.display_file_id && !(doc.mime === 'application/pdf' && Number(doc.page_count) > 1)) {
        const row = db.get('SELECT * FROM document_files WHERE id = ? AND document_id = ?', doc.display_file_id, doc.id);
        if (row) return { storage_key: row.storage_key, mime: row.mime, size: row.size, variant: row };
      }
      return { storage_key: doc.storage_key, mime: doc.mime, size: doc.size, variant: null };
    },

    /**
     * v12 (MD-5، MD-9): حفظ نسخة لمستند موجود (role = 'clean' عادة) تحت uploadsDir/variants/ (أو variants/auto/ لما ينظّفه
     * الخادم وحده، H-M10). الملف يُفحص قبلها (inspect). → رقم الصف. لا يغيّر display_file_id (يقرره المستدعي).
     */
    saveVariant(doc, { buf, realMime, dims = null }, { role = 'clean', page = 1, source, params = null, createdByKind = 'staff', createdBy = null, sub = 'variants' } = {}) {
      if (!doc || !buf || !realMime) throw badRequest('نسخة غير صالحة');
      const key = newKey(realMime, sub);
      const abs = writeKey(key, buf);
      try {
        return db.insert('document_files', {
          document_id: doc.id,
          role,
          page,
          storage_key: key,
          mime: realMime,
          size: buf.length,
          sha256: sha(buf),
          width: dims ? dims.width : null,
          height: dims ? dims.height : null,
          source,
          params: params ? JSON.stringify(params) : null,
          created_by_kind: createdByKind,
          created_by: createdBy,
          company_user_id: null,
          created_at: nowIso(),
        });
      } catch (e) {
        try {
          fs.unlinkSync(abs);
        } catch {
          /* لا شيء */
        }
        throw e;
      }
    },

    publicView(d) {
      if (!d) return null;
      const out = {
        id: d.id,
        title: d.title,
        filename: d.filename,
        mime: d.mime,
        size: d.size,
        uploaded_by_kind: d.uploaded_by_kind,
        created_at: d.created_at,
        // v9.1 l-work: نوع العرض داخل التطبيق (PDF في عارض المتصفح، الصور في العارض المدمج، غيرها تنزيل فقط)
        kind: d.mime === 'application/pdf' ? 'pdf' : /^image\/(jpeg|png|webp)$/.test(d.mime || '') ? 'image' : 'doc',
      };
      // v12 media (MD-4): ملخص النسخ والقراءة للفريق والمحامي فقط (بوابة الشركات والمتابعة لا تستخدمان publicView)
      if (d.scan_state || d.display_file_id || d.ocr_state) {
        const rows = db.all("SELECT role, page FROM document_files WHERE document_id = ? AND replaced_at IS NULL", d.id);
        const scanned = SCANNED_STATES.has(d.scan_state);
        // v12 (MD-5): المعروض ← من دور صف display_file_id (نسخة نظّفها الفريق لمستند ممسوح، أو أصل)، وإلا الرئيسي
        const shown = d.display_file_id ? db.get('SELECT role FROM document_files WHERE id = ? AND document_id = ?', d.display_file_id, d.id) : null;
        out.scan = {
          state: d.scan_state || null,
          clean: scanned || rows.some((r) => r.role === 'clean'),
          originals: rows.filter((r) => r.role === 'original').length,
          pages: Number(d.page_count) || 1,
          display: shown ? (shown.role === 'clean' ? 'clean' : 'original') : scanned ? 'clean' : 'original',
          reason: d.scan_state === 'skipped' ? (d.mime === 'image/heic' ? 'heic' : 'too_large') : null,
        };
        if (d.ocr_state) out.ocr = { state: d.ocr_state, pages: Number(db.value('SELECT COUNT(*) FROM document_text WHERE document_id = ?', d.id)) || 0 };
      }
      return out;
    },

    /**
     * هل يحق لهذا المستخدم تنزيل المستند؟
     * الإدارة: نعم. المحامي: فقط إذا أتيح له صراحة في إسناد نشط، أو رفعه بنفسه، أو كان ضمن ملف مستمر هو مسؤول عنه.
     */
    canAccess(user, doc) {
      if (!user || !doc) return false;
      if (user.role === 'admin' || user.role === 'case_manager') return true;
      if (user.role !== 'lawyer') return false;
      if (doc.uploaded_by_user_id === user.id) return true;
      const granted = db.get(
        `SELECT 1 FROM assignment_grants g JOIN assignments a ON a.id = g.assignment_id
         WHERE g.resource = 'document' AND g.resource_id = ? AND a.lawyer_id = ? AND a.status != 'withdrawn'`,
        doc.id,
        user.id,
      );
      if (granted) return true;
      // v10 b2b-server (B10-36، CS-11d): مستند عنصر ذاكرة شركة مُنح لإسناد نشط، حتى 7 أيام بعد إغلاق الملف
      if (doc.company_id) {
        const memoryGrant = db.get(
          `SELECT 1 FROM company_memory_documents md JOIN assignment_memory_grants mg ON mg.memory_id = md.memory_id
           JOIN assignments a ON a.id = mg.assignment_id JOIN cases c ON c.id = a.case_id
           WHERE md.document_id = ? AND a.lawyer_id = ? AND a.status != 'withdrawn' AND c.company_id = ?
             AND (c.closed_at IS NULL OR c.closed_at >= ?)`,
          doc.id,
          user.id,
          doc.company_id,
          new Date(Date.parse(nowIso()) - 7 * 86400000).toISOString(),
        );
        if (memoryGrant) return true;
      }
      if (doc.matter_id) {
        const m = db.get('SELECT 1 FROM matters WHERE id = ? AND responsible_lawyer_id = ?', doc.matter_id, user.id);
        if (m) return true;
      }
      return false;
    },

    /**
     * إرسال الملف للمتصفح بعد التحقق. variant (v12): صف من document_files لنفس المستند (مساره ونوعه وحجمه واسمه)،
     * strip: حذف APP1 من JPEG (المحامي، L12-73).
     */
    send(res, doc, { inline = false, variant = null, strip = false } = {}) {
      if (variant && variant.document_id !== doc.id) throw notFound('الملف غير موجود على الخادم');
      const key = variant ? variant.storage_key : doc.storage_key;
      const mime = variant ? variant.mime : doc.mime;
      const abs = path.resolve(config.uploadsDir, key);
      if (!abs.startsWith(uploadsRoot + path.sep)) throw forbidden();
      if (!fs.existsSync(abs)) throw notFound('الملف غير موجود على الخادم');
      const w = variant ? variant.width : doc.width;
      const hgt = variant ? variant.height : doc.height;
      // L12-67: لا عرض داخل الصفحة لصورة أكبر من 40 ميجابكسل
      const huge = Number(w) * Number(hgt) > IMAGE_MAX_PIXELS;
      const safeInline = inline && !huge && (mime === 'application/pdf' || mime.startsWith('image/'));
      let body = null;
      if (strip && mime === 'image/jpeg') body = stripJpegApp1(fs.readFileSync(abs));
      const base = (doc.filename.replace(/\.[^.]*$/, '') || 'document') + (variant?.role === 'original' ? (variant.page > 1 ? `-الأصل-${variant.page}` : '-الأصل') : '');
      res.statusCode = 200;
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', body ? body.length : variant ? variant.size : doc.size);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        // الامتداد يُشتق من النوع المتحقق منه، لا من الاسم الأصلي
        `${safeInline ? 'inline' : 'attachment'}; filename="document${ALLOWED[mime] || ''}"; filename*=UTF-8''${encodeURIComponent(base + (ALLOWED[mime] || ''))}`,
      );
      if (body) res.end(body);
      else fs.createReadStream(abs).pipe(res);
    },
  };
  return svc;
}
