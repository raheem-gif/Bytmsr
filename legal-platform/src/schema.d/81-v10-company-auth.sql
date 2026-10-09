-- v10 B2B (SRV-0): جلسات مستخدمي الشركات ودخولهم — منفصلة عن sessions/login_* الخاصة بفريق المكتب.
-- الإيقاف المؤقت لكل (حساب، عنوان IP) فقط: source = 'ip:<العنوان>' (لا أجهزة معروفة في 10.0، L-15).
CREATE TABLE IF NOT EXISTS company_sessions (
  token_hash TEXT PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  idle_hours REAL,
  remember INTEGER NOT NULL DEFAULT 0,
  auth_method TEXT,                            -- password_only|totp|recovery|invite
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_sessions_user ON company_sessions(company_user_id);

CREATE TABLE IF NOT EXISTS company_login_challenges (
  token_hash TEXT PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  remember INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_login_challenges_user ON company_login_challenges(company_user_id);

CREATE TABLE IF NOT EXISTS company_user_2fa (
  company_user_id INTEGER PRIMARY KEY REFERENCES company_users(id) ON DELETE CASCADE,
  secret_enc TEXT,
  enabled_at TEXT,
  pending_secret_enc TEXT,
  pending_at TEXT,
  last_step INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_recovery_codes (
  id INTEGER PRIMARY KEY,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_recovery_user ON company_recovery_codes(company_user_id);

-- روابط الاستخدام الواحد (دعوة أو إعادة تعيين)؛ الرمز مُجزّأ فقط، والرابط الكامل في الذاكرة حتى يُرسل
CREATE TABLE IF NOT EXISTS company_account_tokens (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                          -- invite|reset
  token_hash TEXT NOT NULL UNIQUE,
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  created_by_kind TEXT NOT NULL,               -- staff|company|self|seed
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_company_user_id INTEGER REFERENCES company_users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_ip TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_tokens_user ON company_account_tokens(company_user_id, kind);

CREATE TABLE IF NOT EXISTS company_login_locks (
  company_user_id INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                        -- ip:<العنوان>
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_user_id, source)
);
CREATE INDEX IF NOT EXISTS idx_company_login_locks_updated ON company_login_locks(updated_at);
