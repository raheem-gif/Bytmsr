-- v10 B2B (SRV-0): إشعارات بوابة الشركات وصندوق البريد الصادر.
-- body_text يحمل {link} متغيرًا للروابط السرية (الدعوة وإعادة التعيين): الرابط في الذاكرة حتى يُرسل ولا يُحفظ
-- إلا في العرض التجريبي. لا محتوى قانونيًا ولا عناوين طلبات في البريد (L-32).
CREATE TABLE IF NOT EXISTS company_notifications (
  id INTEGER PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                                   -- مسار داخل البوابة: #/requests/NFD-0012
  request_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_notifications_user ON company_notifications(company_user_id, read_at);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY,
  to_address TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  purpose TEXT NOT NULL,                       -- invite|reset|request_update|…|staff_alert|charge_added|security_old_email
  company_id INTEGER,
  company_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',       -- queued|sending|sent|simulated|failed|skipped
  provider TEXT,
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_queue ON email_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_user ON email_outbox(company_user_id, created_at);
