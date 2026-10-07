-- الإصدار 9.1 — مسار l-court: نتيجة الجلسة من ممر المحكمة (L-02) وميعاد الطعن (L-22)

-- client_ref: آخر مرجع عميل سُجّلت به نتيجة هذه الجلسة (فريد)، وparent_event_id: الجلسة التي أُجّلت إلى هذه
CREATE UNIQUE INDEX IF NOT EXISTS idx_matter_events_client_ref ON matter_events(client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matter_events_parent ON matter_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_matter_tasks_source_event ON matter_tasks(source_event_id);

-- سجل كل تسجيل لنتيجة جلسة (لإعادة الإرسال الآمنة من صندوق الصادر: نفس client_ref يعيد نفس الرد دون تكرار)
CREATE TABLE IF NOT EXISTS matter_event_outcomes (
  id INTEGER PRIMARY KEY,
  client_ref TEXT NOT NULL UNIQUE,
  event_id INTEGER NOT NULL REFERENCES matter_events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  result TEXT NOT NULL,
  next_event_id INTEGER REFERENCES matter_events(id) ON DELETE SET NULL,
  task_id INTEGER REFERENCES matter_tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matter_event_outcomes_event ON matter_event_outcomes(event_id);
