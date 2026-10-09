-- v10 B2B (SRV-0): الذاكرة القانونية لكل شركة (عقود، نماذج، تراخيص، قرارات، مواقف، مفوَّضون، سياسات، نزاعات، مواعيد)
-- والأطراف المتعاملة. الحذف النهائي (للإدارة فقط) يحذف صراحة بترتيب ثابت؛ الجداول الفرعية تتبع العنصر (CASCADE).
CREATE TABLE IF NOT EXISTS company_counterparties (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',          -- supplier|customer|partner|landlord|regulator|employee|other
  registry_no TEXT,
  notes TEXT,
  risk_level TEXT,
  blocked INTEGER NOT NULL DEFAULT 0,
  private_only INTEGER NOT NULL DEFAULT 0,     -- أُنشئ من طلبات خاصة فقط (لمديري البوابة، CS-22)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, name_norm)
);

CREATE TABLE IF NOT EXISTS company_memory (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL,                          -- contract|template|dispute|person|position|licence|resolution|policy|key_date
  title TEXT NOT NULL,
  entity_id INTEGER REFERENCES company_entities(id),
  counterparty_id INTEGER REFERENCES company_counterparties(id),
  status TEXT NOT NULL DEFAULT 'active',
  start_date TEXT,                             -- YYYY-MM-DD (تقويم القاهرة)
  end_date TEXT,
  notice_deadline TEXT,                        -- محسوب
  next_date TEXT,                              -- محسوب: أقرب موعد قادم للتذكير والترتيب
  value_minor INTEGER,
  currency TEXT,
  summary TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  tags TEXT NOT NULL DEFAULT '[]',
  access TEXT NOT NULL DEFAULT 'all',          -- all|admins
  staff_notes TEXT,                            -- للإدارة فقط
  remind_days TEXT,
  owner_company_user_id INTEGER REFERENCES company_users(id),
  source_request_id INTEGER REFERENCES company_requests(id),
  matter_id INTEGER REFERENCES matters(id),
  created_by_kind TEXT NOT NULL,               -- company|staff|system|seed
  created_by_company_user_id INTEGER REFERENCES company_users(id),
  created_by_user_id INTEGER REFERENCES users(id),
  reviewed_at TEXT,                            -- راجعه فريق المكتب (عنصر حُفظ تلقائيًا من طلب، L-55)
  reviewed_by INTEGER REFERENCES users(id),
  search_norm TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_memory_company ON company_memory(company_id, kind, archived_at);
CREATE INDEX IF NOT EXISTS idx_company_memory_next ON company_memory(next_date) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS company_memory_documents (
  memory_id INTEGER NOT NULL REFERENCES company_memory(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  PRIMARY KEY (memory_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_company_memory_documents_doc ON company_memory_documents(document_id);

CREATE TABLE IF NOT EXISTS company_memory_reminders (
  memory_id INTEGER NOT NULL REFERENCES company_memory(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  offset_days INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (memory_id, due_date, offset_days)
);
