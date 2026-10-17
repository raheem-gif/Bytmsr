// v12 media (MD-12، H-E4) — بيانات العرض للمستندات والصوت. تُكتب مباشرة في الجداول: لا مهام في الطابور أبدًا (L12-69)،
// ولا تحتاج ImageMagick ولا Tesseract ولا مزوّد تحويل صوت.
//
//   • مسودة نص آلي (provider = 'demo'، ثقة 0.82) على رسالة صوتية من واتساب لم تُكتب بعد ← مربع «نص آلي للمراجعة» عند الفريق،
//     و«تأكيد النص» معطّل حتى تُسمع الرسالة (L12-60).
//   • نسخة محسّنة لصورة واتساب المزروعة (الورقة نفسها بعد التنظيف، src/seed-assets/v12-death-certificate-clean.jpg) بمصدر
//     «تنظيف تلقائي على الخادم» تحت uploads/variants/auto/ ← «الأصل» و«نسخة محسّنة آليًا · الأصل محفوظ» في العارض.
//   • نص مقروء آليًا لمستندين (تلك الصورة وملف PDF) ← لوحة «النص» ومجموعة «مستندات» في البحث (للفريق فقط، L12-17).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso, randomToken, normalizeArabic } from './util.js';

/** نص المسودة التجريبية (عامية مصرية كما تخرج من خدمة التحويل) */
export const DEMO_STT_TEXT = 'السلام عليكم، أنا عايزة أسأل على ورق الميراث. جوزي اتوفى من سنتين وعندي ورقة الوفاة والقسيمة، بس أخو جوزي ماسك الشقة ومش راضي يقسم.';
/** نص الصفحة الأولى من الصورة والـ PDF (يمر في البحث بكلمة «الوفاة» أو «قيد») */
export const DEMO_OCR_PHOTO = 'جمهورية مصر العربية\nوزارة الداخلية\nقطاع الأحوال المدنية\nشهادة وفاة\nمكان الوفاة: القاهرة\nتاريخ القيد: 2024\nالختم: [ختم]';
export const DEMO_OCR_PDF = 'شهادة وفاة (صورة رسمية)\nبيانات المتوفى كما في السجل المدني\nتاريخ الوفاة وتاريخ القيد\nتوقيع الموظف المختص: [توقيع]';

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * @param {object} app
 * @returns {{ stt?: number, clean?: number, ocr?: number[] }} معرّفات المستندات (للاختبارات)
 */
export function seedV12Media(app) {
  const { db, config } = app;
  const out = { ocr: [] };
  const t = nowIso();

  // 1) مسودة نص آلي على رسالة صوتية من واتساب تنتظر الكتابة (واتساب أولًا، ثم أي رسالة صوتية من الشخص)
  const voice = db.get(
    `SELECT d.id FROM documents d JOIN voice_transcripts v ON v.document_id = d.id LEFT JOIN messages m ON m.id = d.message_id
     WHERE d.uploaded_by_kind = 'client' AND d.mime LIKE 'audio/%' AND v.status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM voice_auto_transcripts a WHERE a.document_id = d.id)
     ORDER BY (COALESCE(m.channel, '') = 'whatsapp') DESC, d.id LIMIT 1`,
  );
  if (voice) {
    db.insert('voice_auto_transcripts', {
      document_id: voice.id,
      state: 'done',
      text: DEMO_STT_TEXT,
      provider: 'demo',
      model: 'demo',
      language: 'ar',
      confidence: 0.82,
      seconds: 14,
      raw: JSON.stringify({ demo: true }),
      error: null,
      outcome: null,
      played_ratio: null,
      created_at: t,
      updated_at: t,
    });
    out.stt = voice.id;
  }

  // 2) نسخة محسّنة لصورة واتساب المزروعة (نفس بصمة الأصل في seed-assets)
  const assets = new URL('./seed-assets/', import.meta.url);
  let photo = null;
  try {
    const orig = fs.readFileSync(new URL('v91-death-certificate.jpg', assets));
    const clean = fs.readFileSync(new URL('v12-death-certificate-clean.jpg', assets));
    photo = db.get(
      `SELECT * FROM documents WHERE sha256 = ? AND uploaded_by_kind = 'client' AND scan_state IS NULL
       ORDER BY (filename LIKE 'image-%') DESC, id DESC LIMIT 1`,
      sha(orig),
    );
    if (photo) {
      const d = new Date(t);
      const key = path.join('variants', 'auto', String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, '0'), `${randomToken(18)}.jpg`);
      const abs = path.join(config.uploadsDir, key);
      fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
      fs.writeFileSync(abs, clean, { mode: 0o600 });
      const params = { v: 1, algo: 'scan-core@1', mode: 'auto', turns: 0, pages: 1, quads: [[[0, 0], [1, 0], [1, 1], [0, 1]]], score: 0.87, partial: false, adjusted: false, demo: true };
      const fid = db.insert('document_files', {
        document_id: photo.id,
        role: 'clean',
        page: 1,
        storage_key: key,
        mime: 'image/jpeg',
        size: clean.length,
        sha256: sha(clean),
        width: 600,
        height: 820,
        source: 'server_auto',
        params: JSON.stringify(params),
        created_by_kind: 'system',
        created_by: null,
        company_user_id: null,
        created_at: t,
      });
      db.run("UPDATE documents SET scan_state = 'server', display_file_id = ? WHERE id = ?", fid, photo.id);
      out.clean = photo.id;
    }
  } catch (e) {
    app.log?.('seed v12 media: clean pair skipped', e);
  }

  // 3) نص مقروء آليًا: الصورة نفسها وأول ملف PDF أرسله شخص
  const pdf = db.get("SELECT id FROM documents WHERE mime = 'application/pdf' AND uploaded_by_kind = 'client' AND company_id IS NULL ORDER BY id LIMIT 1");
  const fts = (() => {
    try {
      db.value('SELECT COUNT(*) FROM document_text_fts');
      return true;
    } catch {
      return false;
    }
  })();
  for (const [docId, text] of [
    [photo?.id, DEMO_OCR_PHOTO],
    [pdf?.id, DEMO_OCR_PDF],
  ]) {
    if (!docId) continue;
    const norm = normalizeArabic(text);
    db.run('DELETE FROM document_text WHERE document_id = ? AND page = 1', docId);
    db.insert('document_text', { document_id: docId, page: 1, text, norm, source_file: docId === photo?.id ? 'clean' : 'main', provider: 'tesseract', model: null, confidence: null, chars: text.length, status: 'machine', corrected_by: null, created_at: t, updated_at: t });
    if (fts) {
      db.run('DELETE FROM document_text_fts WHERE document_id = ? AND page = 1', docId);
      db.run('INSERT INTO document_text_fts (norm, document_id, page) VALUES (?, ?, 1)', norm, docId);
    }
    db.run("UPDATE documents SET ocr_state = 'done' WHERE id = ?", docId);
    out.ocr.push(docId);
  }
  return out;
}
