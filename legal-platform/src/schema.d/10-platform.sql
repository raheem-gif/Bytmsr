-- v9 platform: سجل النسخ الاحتياطية (الملفات نفسها في DATA_DIR/backups — هذا الجدول يحفظ من أنشأها ومتى وحالة فحصها)
CREATE TABLE IF NOT EXISTS system_backups (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto','manual','pre_restore')),
  size_bytes INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  integrity TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_system_backups_time ON system_backups(created_at);

-- حالة الإعداد الأول: رمز الإعداد يُخزن مُجزّأً (sha256) فقط ويُلغى نهائيًا بعد إتمام الإعداد.
-- صف واحد فقط (id = 1).
CREATE TABLE IF NOT EXISTS system_setup (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash TEXT,
  token_created_at TEXT,
  token_expires_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  -- wizard | env | cli | demo
  method TEXT,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  completed_ip TEXT
);

-- نتائج «اختبار الاتصال» للتكاملات (آخر النتائج تظهر في صفحة التكاملات وصحة النظام)
CREATE TABLE IF NOT EXISTS integration_tests (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT,
  details TEXT,
  duration_ms INTEGER,
  tested_by INTEGER REFERENCES users(id),
  tested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_tests_name ON integration_tests(name, tested_at);
