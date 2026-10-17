-- v12 media (schema 88): نسخ المستند (الأصل والمحسّنة)، النص المقروء آليًا، النص الآلي للرسائل الصوتية، طابور المعالجة،
-- وإنفاق غير Anthropic. إضافي ويُعاد تشغيله بلا أثر: لا يغيّر صفًا قديمًا ولا يرسل شيئًا (scan_state / ocr_state = NULL
-- في الصفوف القديمة تعني «لم يُعالَج»). جدول البحث document_text_fts (trigram) يُنشأ من src/services/media.js داخل try/catch.

-- نسخ المستند: الأصل (role = original) من ماسح الهاتف، أو النسخة المحسّنة (role = clean) من الخادم أو من الفريق.
-- المستند المعروض يحدده documents.display_file_id (NULL = الملف الرئيسي)؛ تغيير العرض لا يحذف شيئًا أبدًا (L12-61).
CREATE TABLE IF NOT EXISTS document_files (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- original | clean  (يتحقق منها media.js)
  page INTEGER NOT NULL DEFAULT 1,
  storage_key TEXT NOT NULL,          -- تحت uploadsDir/variants/YYYY/MM/ (وما ينظفه الخادم تحت variants/auto/، خارج النسخ الاحتياطية)
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL,               -- client_scanner | staff_scanner | server_auto
  params TEXT,                        -- JSON {algo, quad, mode, turns, score, partial, adjusted} ≤ 2 KB
  created_by_kind TEXT NOT NULL,      -- client | company | staff | lawyer | system
  created_by INTEGER REFERENCES users(id),   -- الفريق والمحامون فقط؛ مستخدم الشركة في company_user_id
  company_user_id INTEGER,
  replaced_at TEXT,                   -- نسخة محسّنة أقدم بقيت بعد «نظّفه مرة أخرى» (تُحذف مع المستند)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_files_doc ON document_files(document_id, role, page);

-- النص المستخرج من كل صفحة (للفريق فقط في 12.0، L12-17)
CREATE TABLE IF NOT EXISTS document_text (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page INTEGER NOT NULL DEFAULT 1,
  text TEXT NOT NULL,
  norm TEXT NOT NULL,
  source_file TEXT NOT NULL,          -- main | clean | original
  provider TEXT NOT NULL,             -- tesseract | claude | pdftotext | staff
  model TEXT,
  confidence REAL,
  chars INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'machine',   -- machine | corrected
  corrected_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, page)
);

-- النص الآلي لرسالة صوتية من العميل: مسودة للفريق فقط حتى يؤكدها موظف في voice_transcripts (L12-16، L12-18)
CREATE TABLE IF NOT EXISTS voice_auto_transcripts (
  document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  state TEXT NOT NULL,                -- done | empty | failed | skipped
  text TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  language TEXT,
  confidence REAL,
  seconds REAL,
  raw TEXT,                           -- JSON segments {start,end,text,no_speech_prob}؛ لا صوت أبدًا
  error TEXT,                         -- auth | http | network | timeout | too_long | too_big | budget | client_cap | ...
  outcome TEXT,                       -- accepted | edited | accepted_unheard | edited_unheard | rejected (L12-60)
  played_ratio REAL,                  -- نسبة ما سُمع من الرسالة في مربع النص قبل التأكيد (0–1)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- طابور المعالجة: وحدة واحدة في المرة (تحويل صوت واحد، صفحة OCR واحدة، تنظيف صورة واحدة) خارج قفل المجدول (L12-69)
CREATE TABLE IF NOT EXISTS media_jobs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                 -- stt | clean | ocr
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued',     -- queued | running | done | failed | skipped | cancelled
  priority INTEGER NOT NULL DEFAULT 0,      -- «… الآن» من الفريق = 10، الاستكمال = -5
  attempts INTEGER NOT NULL DEFAULT 0,
  crashes INTEGER NOT NULL DEFAULT 0,       -- وُجدت running عند الإقلاع؛ مرتان = failed (crashed)
  gen INTEGER NOT NULL DEFAULT 0,           -- يزيد مع كل إعادة جدولة؛ النتيجة تُكتب WHERE id = ? AND gen = ?
  next_page INTEGER,                        -- OCR: الصفحة التالية
  next_at TEXT NOT NULL,
  locked_at TEXT,
  provider TEXT,
  error TEXT,
  requested_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, document_id)
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_due ON media_jobs(state, priority, next_at);

-- إنفاق خدمات غير Anthropic (تحويل الصوت) ووقت الخادم المحلي
CREATE TABLE IF NOT EXISTS media_usage (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                 -- stt | ocr_local | clean_server
  provider TEXT NOT NULL,
  model TEXT,
  document_id INTEGER,
  seconds REAL,
  pages INTEGER,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  period TEXT NOT NULL,               -- YYYY-MM
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_usage_period ON media_usage(period, kind);

-- ملفات نسخ حُذفت صفوفها (حذف مباشر للمستند، أو حذف متتابع عبر المفتاح الأجنبي): يمسحها media.gc من القرص (L12-70)
CREATE TABLE IF NOT EXISTS media_orphans (
  id INTEGER PRIMARY KEY,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trg_document_files_orphan AFTER DELETE ON document_files
BEGIN
  INSERT INTO media_orphans (storage_key, created_at) VALUES (old.storage_key, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
END;
