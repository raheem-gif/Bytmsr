-- v9 — وحدة الذكاء الاصطناعي: سجل الاستهلاك والتكلفة، تنبيهات سقف الإنفاق، وتحليلات المستندات.

-- كل استدعاء لوظيفة ذكاء اصطناعي (Claude أو المحلل المحلي) مع الرموز المستهلكة والتكلفة التقديرية.
-- التكلفة بأجزاء المليون من الدولار (عدد صحيح) حتى لا تتراكم أخطاء الكسور العشرية.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY,
  feature TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  provider TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  -- 1 = خُدم الطلب بالمحلل المحلي بدلًا من Claude (تعذر، أو تجاوز سقف الإنفاق)
  fallback INTEGER NOT NULL DEFAULT 0,
  fallback_reason TEXT,
  -- الفترة الشهرية بتوقيت القاهرة YYYY-MM (أساس سقف الإنفاق)
  period TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_period ON ai_usage(period, provider, feature);
CREATE INDEX IF NOT EXISTS idx_ai_usage_time ON ai_usage(created_at);

-- تنبيهات سقف الإنفاق: صف واحد لكل شهر ونوع تنبيه حتى لا تتكرر الإشعارات
CREATE TABLE IF NOT EXISTS ai_budget_alerts (
  period TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('warning','exceeded')),
  budget_usd REAL NOT NULL,
  spent_usd REAL NOT NULL,
  notified_at TEXT NOT NULL,
  PRIMARY KEY (period, kind)
);

-- نتيجة تحليل مستند (نوعه، الوقائع الرئيسية، ما يثبته، الملاحظات، المستندات المرتبطة الناقصة)
CREATE TABLE IF NOT EXISTS document_ai (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES cases(id),
  intake_id INTEGER REFERENCES intakes(id),
  matter_id INTEGER REFERENCES matters(id),
  provider TEXT NOT NULL,
  model TEXT,
  doc_type TEXT NOT NULL,
  result TEXT NOT NULL,
  -- بصمة الملف وقت التحليل (لاكتشاف تحليل قديم لملف استُبدل)
  sha256 TEXT,
  created_by INTEGER REFERENCES users(id),
  created_by_role TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_ai_doc ON document_ai(document_id, id);
CREATE INDEX IF NOT EXISTS idx_document_ai_case ON document_ai(case_id);
