-- الإصدار 9.1 — مسار l-home: تنبيهات المحامي على واتساب (L-06)، تنبيهات الجهاز (L-20)، وتذكّر الجهاز الموثوق (L-17).
-- users.alert_whatsapp (اشتراك المحامي في تنبيهات واتساب، مغلق افتراضيًا) وsessions.remember/idle_hours في 74-v91-l-home.columns.json.

-- سجل تنبيهات المحامين وقائمة انتظارها: تنبيه واحد لكل (مستخدم، نوع، عنصر)، وما يقع في ساعات الهدوء (10 م – 8 ص بتوقيت
-- القاهرة) يُرسل في الثامنة صباحًا. النص لا يحمل إلا الأكواد والتواريخ ورابط المنصة — بلا أي بيانات عن المستفيدين.
CREATE TABLE IF NOT EXISTS lawyer_alerts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  -- queued: بانتظار موعده، sent/simulated: أُرسل (أو سُجّل في وضع المحاكاة)، skipped: لم يُرسل (التنبيهات أُوقفت أو تجاوز الحد اليومي)
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','simulated','failed','skipped')),
  send_after TEXT NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE(user_id, type, entity)
);
CREATE INDEX IF NOT EXISTS idx_lawyer_alerts_queue ON lawyer_alerts(status, send_after);
CREATE INDEX IF NOT EXISTS idx_lawyer_alerts_user_day ON lawyer_alerts(user_id, sent_at);

-- اشتراكات تنبيهات الجهاز (Web Push) لتطبيق المنصة المثبت: تُحذف عند تسجيل الخروج أو إنهاء الجلسات الأخرى
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_sent_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
