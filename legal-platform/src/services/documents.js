// المستندات: الحفظ الآمن على القرص، والتحقق من صلاحية الوصول قبل أي تنزيل.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { badRequest, notFound, forbidden, nowIso, randomToken, v, arabicCount, AR_UNITS } from '../util.js';

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

export function createDocuments(app) {
  const { db, config } = app;
  const maxBytes = config.maxUploadMb * 1024 * 1024;

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

  const svc = {
    maxBytes,
    /** v9.1 b-forms: هل الملف المرفوع (قبل الحفظ) رسالة صوتية؟ بالامتداد أولًا ثم النوع المعلن، كما في save() */
    isAudio(file) {
      const m = resolveMime(sanitizeFilename(file?.filename), file?.mime);
      return !!m && m.startsWith('audio/');
    },
    /**
     * حفظ ملف مرفوع (base64 من الواجهة أو Buffer من واتساب).
     * links: { client_id, intake_id, case_id, matter_id, message_id, info_request_id, title }
     */
    save({ filename, mime, data_base64, buffer, seconds }, links, uploader) {
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
      const d = new Date();
      const rel = path.join(String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), randomToken(18) + (ALLOWED[realMime] || ''));
      const abs = path.join(config.uploadsDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
      fs.writeFileSync(abs, buf, { mode: 0o600 });
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
        sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        storage_key: rel,
        uploaded_by_kind: uploader?.kind || (uploader?.role === 'lawyer' ? 'lawyer' : uploader ? 'staff' : 'system'),
        uploaded_by_user_id: uploader?.id ?? null,
        created_at: nowIso(),
      });
      // v9.2 (admin-ai): رسالة صوتية من المستفيدة ← «لم تُكتب بعد» حتى تكتب الإدارة ما قالته (مدتها من الواجهة أو من ملف Ogg)
      if (realMime.startsWith('audio/') && uploader?.kind === 'client' && app.voice?.onAudioSaved) {
        let secs = seconds === undefined || seconds === null || seconds === '' ? NaN : Number(seconds);
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
    },

    /** حفظ مجموعة ملفات مرفوعة من الواجهة مع التحقق من العدد */
    saveMany(files, links, uploader, { max = 5 } = {}) {
      if (files === undefined || files === null) return [];
      if (!Array.isArray(files)) throw badRequest('صيغة المرفقات غير صالحة');
      if (files.length > max) throw badRequest(`الحد الأقصى ${arabicCount(max, AR_UNITS.file)} في المرة الواحدة`);
      return files.map((f) => svc.save(f || {}, links, uploader));
    },

    get(id) {
      return db.get('SELECT * FROM documents WHERE id = ?', id);
    },

    publicView(d) {
      if (!d) return null;
      return {
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
      if (doc.matter_id) {
        const m = db.get('SELECT 1 FROM matters WHERE id = ? AND responsible_lawyer_id = ?', doc.matter_id, user.id);
        if (m) return true;
      }
      return false;
    },

    /** إرسال الملف للمتصفح بعد التحقق */
    send(res, doc, { inline = false } = {}) {
      const abs = path.join(config.uploadsDir, doc.storage_key);
      if (!abs.startsWith(config.uploadsDir + path.sep)) throw forbidden();
      if (!fs.existsSync(abs)) throw notFound('الملف غير موجود على الخادم');
      const safeInline = inline && (doc.mime === 'application/pdf' || doc.mime.startsWith('image/'));
      res.statusCode = 200;
      res.setHeader('Content-Type', doc.mime);
      res.setHeader('Content-Length', doc.size);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        // الامتداد يُشتق من النوع المتحقق منه، لا من الاسم الأصلي
        `${safeInline ? 'inline' : 'attachment'}; filename="document${ALLOWED[doc.mime] || ''}"; filename*=UTF-8''${encodeURIComponent((doc.filename.replace(/\.[^.]*$/, '') || 'document') + (ALLOWED[doc.mime] || ''))}`,
      );
      fs.createReadStream(abs).pipe(res);
    },
  };
  return svc;
}
