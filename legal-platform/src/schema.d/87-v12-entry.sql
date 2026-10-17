-- v12 entry (schema 87): مسار الطلب من الصفحة الأولى أو قائمة واتساب. إضافي ويُعاد تشغيله بلا أثر؛ لا يملأ صفوفًا قديمة ولا يرسل شيئًا.
CREATE INDEX IF NOT EXISTS idx_intakes_service_line ON intakes(service_line, status);
CREATE TABLE IF NOT EXISTS entry_tree_daily (
  day   TEXT NOT NULL,             -- YYYY-MM-DD بتوقيت القاهرة
  node  TEXT NOT NULL,             -- '' للصفحة الأولى، وإلا مسار الصفحة مثل 'litigation/defend'
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, node)
) WITHOUT ROWID;
