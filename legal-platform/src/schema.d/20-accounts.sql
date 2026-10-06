-- v9 — وحدة الحسابات والأمان: الدعوات وروابط إعادة التعيين، التحقق بخطوتين (TOTP)، رموز الاسترداد، وخطوة الدخول الثانية.

-- روابط الاستخدام الواحد: دعوة حساب جديد (invite) أو إعادة تعيين كلمة المرور (reset).
-- يُخزن الرمز مُجزّأً (sha256) فقط؛ الرابط الكامل لا يُعرض إلا لحظة إنشائه.
CREATE TABLE IF NOT EXISTS account_tokens (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invite','reset')),
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_ip TEXT,
  revoked_at TEXT,
  revoked_by INTEGER REFERENCES users(id),
  -- عدد مرات إعادة الإصدار (لعرض «أُعيد إرسالها مرتين»)
  reissue_of INTEGER REFERENCES account_tokens(id)
);
CREATE INDEX IF NOT EXISTS idx_account_tokens_user ON account_tokens(user_id, kind);

-- التحقق بخطوتين: السر مشفر (AES-256-GCM) بمفتاح خارج قاعدة البيانات، ومنفصل عن جدول المستخدمين
-- حتى لا يظهر في أي استعلام SELECT u.* عن المستخدمين.
CREATE TABLE IF NOT EXISTS user_2fa (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc TEXT,
  enabled_at TEXT,
  pending_secret_enc TEXT,
  pending_at TEXT,
  -- آخر خطوة زمنية (30 ثانية) قُبل رمزها: يمنع إعادة استخدام نفس الرمز
  last_step INTEGER,
  updated_at TEXT NOT NULL
);

-- رموز الاسترداد (10 رموز للاستخدام مرة واحدة، مُجزّأة بـ scrypt)
CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON user_recovery_codes(user_id);

-- خطوة الدخول الثانية: رمز مؤقت قصير العمر بعد التحقق من كلمة المرور وقبل إنشاء الجلسة
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_challenges_user ON login_challenges(user_id);

CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at);

-- معرف علني للجلسة (لعرضها وإنهائها دون كشف رمزها)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_public ON sessions(public_id);
CREATE INDEX IF NOT EXISTS idx_users_invite_pending ON users(invite_pending);
