-- إصلاحات ما قبل الإطلاق (الإصدار 9)

-- الإيقاف المؤقت للدخول لكل مصدر (عنوان IP أو جهاز موثوق) بدل إيقاف الحساب كله:
-- محاولات خاطئة من مصدر ما لا تمنع صاحب الحساب من الدخول من جهاز سبق أن دخل منه أو من شبكة أخرى.
CREATE TABLE IF NOT EXISTS login_locks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source)
);
CREATE INDEX IF NOT EXISTS idx_login_locks_updated ON login_locks(updated_at);

-- الأجهزة التي سبق أن أتم منها المستخدم الدخول (كعكة bm_dev عشوائية تُخزَّن مُجزّأة).
-- لا تمنح أي صلاحية بذاتها؛ تفصل فقط عداد المحاولات الفاشلة لهذا الجهاز عن محاولات الغرباء.
CREATE TABLE IF NOT EXISTS login_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  user_agent TEXT,
  UNIQUE (user_id, token_hash)
);
CREATE INDEX IF NOT EXISTS idx_login_devices_user ON login_devices(user_id);
