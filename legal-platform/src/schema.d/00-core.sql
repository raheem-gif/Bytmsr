-- v9: البنية المشتركة لكل الوحدات

-- سجل الأمان والتدقيق (دخول، تغيير صلاحيات، تصدير، نسخ احتياطي، تغيير إعدادات حساسة)
CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  user_id INTEGER REFERENCES users(id),
  actor_name TEXT,
  ip TEXT,
  user_agent TEXT,
  summary TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type, created_at);

-- أسرار التكاملات (واتساب، Claude) مشفرة AES-256-GCM بمفتاح خارج قاعدة البيانات
CREATE TABLE IF NOT EXISTS integration_secrets (
  name TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- حالة المهام الدورية (للمتابعة في صفحة صحة النظام)
CREATE TABLE IF NOT EXISTS job_runs (
  name TEXT PRIMARY KEY,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_ok_at TEXT,
  last_error TEXT,
  last_result TEXT,
  runs INTEGER NOT NULL DEFAULT 0
);
