-- v9.2 — نصوص الرسائل الصوتية (تكتبها الإدارة) ومحاولات الاتصال وفهرس قائمة الفرز
-- [R2-A17] لا CHECK على status: يُتحقق منها في voice.js حتى تضيف 9.3 حالات (queued/auto_draft/failed) دون إعادة بناء الجدول
CREATE TABLE IF NOT EXISTS voice_transcripts (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  intake_id INTEGER REFERENCES intakes(id),
  case_id INTEGER REFERENCES cases(id),
  message_id INTEGER REFERENCES messages(id),
  status TEXT NOT NULL DEFAULT 'pending',
  text TEXT,
  duration_seconds REAL,
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_intake ON voice_transcripts(intake_id);
CREATE INDEX IF NOT EXISTS idx_intakes_story ON intakes(status, story_state, last_inbound_at);
-- [R2-B9] محاولات الاتصال التي لم تنجح (المكالمة الناجحة تُسجَّل كـ call-note)
CREATE TABLE IF NOT EXISTS call_attempts (
  id INTEGER PRIMARY KEY,
  intake_id INTEGER NOT NULL REFERENCES intakes(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,            -- no_answer | busy | wrong_number | someone_else (validated in stories.js)
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_attempts_intake ON call_attempts(intake_id);
-- [R2-A4] أول تشغيل لـ 9.2: الرسائل الآلية للقصص لا تخص المحادثات الأقدم (يبقى أول قيمة فقط)
INSERT OR IGNORE INTO settings (key, value) VALUES ('stories_since', json_quote(strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
