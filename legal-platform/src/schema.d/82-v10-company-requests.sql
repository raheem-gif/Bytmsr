-- v10 B2B (SRV-0): طلبات الشركات (كائن العلاقة: المرحلة، المواعيد، الباقة، الاستيضاحات، العروض، التسليمات)
-- بجانب ملف العمل الداخلي في cases (كائن العمل: المحامون والآراء والمراجعة). الشركة لا ترى الملف ولا رمزه أبدًا.
CREATE TABLE IF NOT EXISTS company_requests (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  number INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,                   -- NFD-0012
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  fields TEXT NOT NULL DEFAULT '{}',           -- حقول النوع + output_language (المبالغ بالجنيه كما كُتبت)
  entity_id INTEGER REFERENCES company_entities(id),
  submitted_by INTEGER NOT NULL REFERENCES company_users(id),
  visibility TEXT NOT NULL DEFAULT 'company',  -- company|private
  requested_priority TEXT NOT NULL DEFAULT 'normal',
  urgent_reason TEXT,
  needed_by TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',     -- low|normal|high|urgent (الإدارة)
  priority_changed_reason TEXT,                -- urgent_allowance|staff
  status TEXT NOT NULL DEFAULT 'submitted',    -- submitted|awaiting_company|in_progress|delivered|closed|declined|cancelled
  waiting_on TEXT,                             -- NULL|info|quote|overage
  resolution TEXT,                             -- accepted|auto_closed|staff_closed|declined|cancelled|quote_rejected
  resolution_kind TEXT,                        -- out_of_scope|conflict|not_legal|duplicate|other|resolved|withdrawn|delivered
  resolution_note TEXT,                        -- سبب يظهر للشركة
  flags TEXT NOT NULL DEFAULT '[]',            -- quote_approved|changes_requested|clarification_answered|plan_error|memory_pending…
  practice_area TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  size TEXT,                                   -- S|M|L|XL
  scope TEXT,                                  -- in_scope|out_of_scope
  quota_kind TEXT,                             -- included|overage|out_of_scope|free
  quota_period TEXT,                           -- بداية دورة الاستخدام الشهرية YYYY-MM-DD (L-28)
  requires_senior_review INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT,                             -- low|medium|high
  case_id INTEGER UNIQUE REFERENCES cases(id),
  handler_id INTEGER REFERENCES users(id),
  ai_suggestion_id INTEGER REFERENCES ai_suggestions(id),
  accept_plan TEXT,                            -- خطة البدء المحفوظة مع عرض السعر (JSON)
  accept_plan_error TEXT,                      -- سبب تعذّر بدء العمل تلقائيًا بعد الموافقة (L-61)
  triaged_at TEXT,
  sla_clock TEXT NOT NULL DEFAULT 'business',  -- business|calendar
  first_response_due_at TEXT,
  first_response_at TEXT,
  first_response_kind TEXT,                    -- accept|clarify|quote|overage|decline (CO-3)
  confirm_due_at TEXT,                         -- مرحلة «تأكيد الموعد» بعد رد الشركة أو موافقتها (L-28)
  delivery_window_hours REAL,
  delivery_due_at TEXT,
  delivery_due_original_at TEXT,
  delivery_due_reason TEXT,
  sla_paused_at TEXT,
  sla_remaining_minutes INTEGER,
  sla_paused_minutes_total INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT,
  accepted_by INTEGER REFERENCES users(id),
  delivered_at TEXT,
  closed_at TEXT,
  reopened_at TEXT,
  escalated_at TEXT,                           -- تصعيد مفتوح (يُمسح عند إقرار الإدارة)
  escalation_reason TEXT,
  last_escalated_at TEXT,                      -- لحد مرة كل 24 ساعة (CO-18)
  escalation_acked_at TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  memory_item_id INTEGER,                      -- عنصر الذاكرة المحفوظ عند الاعتماد (L-55)
  client_ref TEXT,
  rev INTEGER NOT NULL DEFAULT 0,              -- compare-and-set لإجراءات الإدارة
  last_company_activity_at TEXT,
  staff_unread INTEGER NOT NULL DEFAULT 0,
  last_notice_at TEXT,                         -- آخر تنبيه للشركة عن الطلب، وصف البريد المرتبط به (CO-2)
  last_notice_email_id INTEGER,
  search_norm TEXT,                            -- نص البحث بعد normalizeArabic (L-55)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, number)
);
CREATE INDEX IF NOT EXISTS idx_company_requests_company ON company_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_company_requests_queue ON company_requests(status, delivery_due_at);
CREATE INDEX IF NOT EXISTS idx_company_requests_submitter ON company_requests(submitted_by);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_requests_ref ON company_requests(submitted_by, client_ref) WHERE client_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_request_watchers (
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  company_user_id INTEGER NOT NULL REFERENCES company_users(id),
  added_by INTEGER REFERENCES company_users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, company_user_id)
);
CREATE INDEX IF NOT EXISTS idx_company_request_watchers_user ON company_request_watchers(company_user_id);

CREATE TABLE IF NOT EXISTS company_messages (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  direction TEXT NOT NULL,                     -- in (من الشركة) | out (من الفريق)
  kind TEXT NOT NULL DEFAULT 'message',        -- message|clarification|clarification_reply|status|quote|deliverable
  body TEXT NOT NULL,
  items TEXT,                                  -- بنود الاستيضاح [{label}]
  missing_items TEXT,                          -- فهارس «غير متوفر لدينا» في الرد
  info_request_id INTEGER REFERENCES info_requests(id),
  reply_to_id INTEGER REFERENCES company_messages(id),
  answered_at TEXT,
  author_company_user_id INTEGER REFERENCES company_users(id),
  author_user_id INTEGER REFERENCES users(id), -- لا يُعرض للشركة أبدًا
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_messages_request ON company_messages(request_id, id);
CREATE INDEX IF NOT EXISTS idx_company_messages_open ON company_messages(kind, answered_at);

CREATE TABLE IF NOT EXISTS company_message_documents (
  message_id INTEGER NOT NULL REFERENCES company_messages(id),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  PRIMARY KEY (message_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_company_message_documents_doc ON company_message_documents(document_id);

CREATE TABLE IF NOT EXISTS company_request_notes (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_request_notes_request ON company_request_notes(request_id);

-- عروض الأسعار: الرقم لكل شركة {prefix}-Q-NNN (L-35) — UNIQUE العام يبقى صحيحًا لأن البادئات فريدة.
-- الأساس fixed|capped فقط في 10.0 (L-31)؛ عمودا الساعات باقيان لإصدار لاحق.
CREATE TABLE IF NOT EXISTS company_quotes (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  number TEXT NOT NULL UNIQUE,                 -- NFD-Q-003
  kind TEXT NOT NULL,                          -- out_of_scope|overage
  basis TEXT NOT NULL,                         -- fixed|capped
  amount_minor INTEGER,
  hourly_rate_minor INTEGER,
  hours_estimate REAL,
  cap_minor INTEGER,
  currency TEXT NOT NULL DEFAULT 'EGP',
  scope_of_work TEXT NOT NULL,
  assumptions TEXT,
  excluded TEXT,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',         -- sent|approved|rejected|expired|withdrawn
  created_by INTEGER REFERENCES users(id),
  sent_at TEXT,
  decided_at TEXT,
  decided_by_company_user_id INTEGER REFERENCES company_users(id),
  decision_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_quotes_open ON company_quotes(request_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_company_quotes_company ON company_quotes(company_id, status);

CREATE TABLE IF NOT EXISTS company_deliverables (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  version INTEGER NOT NULL,
  kind TEXT NOT NULL,                          -- memo|reviewed_contract|draft_document|letter|resolution|checklist|other
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT,
  recommendations TEXT NOT NULL DEFAULT '[]',
  risk_level TEXT,
  final INTEGER NOT NULL DEFAULT 1,
  opinion_id INTEGER REFERENCES opinions(id),
  ai_suggestion_id INTEGER REFERENCES ai_suggestions(id),
  status TEXT NOT NULL DEFAULT 'draft',        -- draft|released|withdrawn
  docs_reviewed INTEGER NOT NULL DEFAULT 0,    -- راجع الموظف ملفات Office/PDF (L-56)
  prepared_by INTEGER REFERENCES users(id),
  released_by INTEGER REFERENCES users(id),
  released_at TEXT,
  withdrawn_at TEXT,
  withdraw_reason TEXT,
  decision TEXT,                               -- accepted|changes_requested
  decided_by_company_user_id INTEGER REFERENCES company_users(id),
  decided_at TEXT,
  rating INTEGER,
  feedback TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (request_id, version)
);
CREATE TABLE IF NOT EXISTS company_deliverable_documents (
  deliverable_id INTEGER NOT NULL REFERENCES company_deliverables(id),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  PRIMARY KEY (deliverable_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_company_deliverable_documents_doc ON company_deliverable_documents(document_id);

CREATE TABLE IF NOT EXISTS company_sla_pauses (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  reason TEXT NOT NULL,                        -- info|quote|overage
  started_at TEXT NOT NULL,
  ended_at TEXT,
  business_minutes INTEGER
);
CREATE INDEX IF NOT EXISTS idx_company_sla_pauses_request ON company_sla_pauses(request_id);

-- تنبيه واحد لكل (طلب، نوع، مفتاح): تنبيهات مستوى الخدمة والتذكيرات (آمن لإعادة التشغيل)
CREATE TABLE IF NOT EXISTS company_request_alerts (
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, kind, key)
);

CREATE TABLE IF NOT EXISTS company_request_memory (
  request_id INTEGER NOT NULL REFERENCES company_requests(id),
  memory_id INTEGER NOT NULL,
  linked_by_kind TEXT NOT NULL,                -- staff|company|ai_accepted
  linked_by INTEGER,
  created_at TEXT NOT NULL,
  PRIMARY KEY (request_id, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_company_request_memory_memory ON company_request_memory(memory_id);

CREATE TABLE IF NOT EXISTS assignment_memory_grants (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  memory_id INTEGER NOT NULL,
  granted_by INTEGER REFERENCES users(id),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, memory_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_memory_grants_memory ON assignment_memory_grants(memory_id);

-- الرفع على مراحل (L-27): ملف واحد لكل طلب HTTP يُحفظ فورًا ويُربط بمن رفعه 24 ساعة حتى يُستخدم في طلب أو رسالة.
-- الملفات غير المستخدمة تُحذف مع ملفاتها في مهمة b2b.cleanup.
CREATE TABLE IF NOT EXISTS company_uploads (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  company_user_id INTEGER NOT NULL REFERENCES company_users(id),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_uploads_user ON company_uploads(company_user_id, used_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_company_uploads_document ON company_uploads(document_id);
