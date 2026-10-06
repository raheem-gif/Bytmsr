-- مخطط قاعدة البيانات (SQLite). الأموال تُخزَّن بالقرش كأعداد صحيحة (*_minor) لتجنب أخطاء الكسور.
-- التواريخ نصوص ISO-8601 بتوقيت UTC.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ===== المستخدمون والجلسات =====
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','case_manager','lawyer')),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ملف المحامي: التخصصات والطاقة الاستيعابية واتفاق المحاسبة
CREATE TABLE IF NOT EXISTS lawyers (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'أ.',
  specialties TEXT NOT NULL DEFAULT '[]',
  bar_number TEXT,
  bar_level TEXT,
  firm TEXT,
  capacity INTEGER NOT NULL DEFAULT 10,
  agreement TEXT NOT NULL,
  package_remaining INTEGER,
  notes TEXT
);

-- ===== العملاء =====
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  national_id TEXT,
  governorate TEXT,
  email TEXT,
  notes TEXT,
  merged_into INTEGER REFERENCES clients(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_identities (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('phone','email')),
  value TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE(kind, value)
);
CREATE INDEX IF NOT EXISTS idx_identities_client ON client_identities(client_id);

CREATE TABLE IF NOT EXISTS portal_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- رابط الموقع يخص طلبًا واحدًا (لأن رقم الهاتف المُدخل في الموقع غير موثّق)؛ NULL = كل ملفات العميل (رابط ترسله الإدارة)
  intake_id INTEGER REFERENCES intakes(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_client ON portal_tokens(client_id);

-- ===== الطلبات الواردة (Intake) =====
CREATE TABLE IF NOT EXISTS intakes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id INTEGER REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'new',
  kind TEXT,
  first_channel TEXT NOT NULL,
  last_channel TEXT,
  channels TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'unknown',
  source_detail TEXT NOT NULL DEFAULT '{}',
  campaign TEXT,
  title TEXT,
  summary TEXT,
  legal_area TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  contact_name TEXT,
  contact_phone TEXT,
  governorate TEXT,
  assigned_staff_id INTEGER REFERENCES users(id),
  case_id INTEGER REFERENCES cases(id),
  internal_notes TEXT,
  resolution_note TEXT,
  last_message_at TEXT,
  last_inbound_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intakes_status ON intakes(status);
CREATE INDEX IF NOT EXISTS idx_intakes_client ON intakes(client_id);

-- ===== ملفات الاستشارات (Cases) =====
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  intake_id INTEGER REFERENCES intakes(id),
  legal_area TEXT NOT NULL,
  title TEXT NOT NULL,
  facts_internal TEXT,
  facts_shared TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  case_manager_id INTEGER REFERENCES users(id),
  due_at TEXT,
  source TEXT,
  channel TEXT,
  campaign TEXT,
  outcome TEXT,
  closure_note TEXT,
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  matter_id INTEGER REFERENCES matters(id),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_client ON cases(client_id);

-- المسائل القانونية داخل الملف (المسألة رقم 1، 2، 3 ...)
CREATE TABLE IF NOT EXISTS case_issues (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  legal_area TEXT,
  origin TEXT NOT NULL DEFAULT 'staff' CHECK (origin IN ('staff','ai','lawyer')),
  proposed_by_user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('proposed','active','dropped')),
  created_at TEXT NOT NULL,
  UNIQUE(case_id, number)
);

-- ===== الرسائل (كل القنوات، الوارد والصادر، ومنها صندوق الإرسال) =====
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  intake_id INTEGER REFERENCES intakes(id),
  case_id INTEGER REFERENCES cases(id),
  matter_id INTEGER REFERENCES matters(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  channel TEXT NOT NULL,
  external_id TEXT,
  to_address TEXT,
  body TEXT NOT NULL DEFAULT '',
  author_user_id INTEGER REFERENCES users(id),
  automated INTEGER NOT NULL DEFAULT 0,
  automation_rule TEXT,
  status TEXT NOT NULL,
  error TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  scheduled_for TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external ON messages(channel, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_intake ON messages(intake_id);
CREATE INDEX IF NOT EXISTS idx_messages_case ON messages(case_id);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(direction, status);

-- ===== المستندات =====
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  intake_id INTEGER REFERENCES intakes(id),
  case_id INTEGER REFERENCES cases(id),
  matter_id INTEGER REFERENCES matters(id),
  message_id INTEGER REFERENCES messages(id),
  info_request_id INTEGER REFERENCES info_requests(id),
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by_kind TEXT NOT NULL CHECK (uploaded_by_kind IN ('client','staff','lawyer','system')),
  uploaded_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_intake ON documents(intake_id);

-- ===== فريق الملف: الإسناد والصلاحيات =====
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  lawyer_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('lead','specialist','second_opinion','reviewer','co_counsel')),
  counsel_request_id INTEGER REFERENCES counsel_requests(id),
  brief TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',
  fee_mode TEXT NOT NULL DEFAULT 'agreement' CHECK (fee_mode IN ('agreement','custom','pro_bono')),
  fee_amount_minor INTEGER,
  hours_spent REAL,
  assigned_by INTEGER REFERENCES users(id),
  assigned_at TEXT NOT NULL,
  first_opened_at TEXT,
  submitted_at TEXT,
  first_submitted_at TEXT,
  approved_at TEXT,
  withdrawn_at TEXT,
  last_activity_at TEXT,
  last_viewed_at TEXT,
  UNIQUE(case_id, lawyer_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_lawyer ON assignments(lawyer_id, status);

-- ما يراه كل عضو في الفريق: لكل إسناد قائمة صريحة بالموارد المسموح بها
CREATE TABLE IF NOT EXISTS assignment_grants (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (resource IN ('facts','client_name','issue','document','opinion','info_request')),
  resource_id INTEGER NOT NULL DEFAULT 0,
  granted_by INTEGER REFERENCES users(id),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (assignment_id, resource, resource_id)
);

-- طلبات المعلومات / المستندات من المحامي (تمر بالإدارة أولًا)
CREATE TABLE IF NOT EXISTS info_requests (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES assignments(id),
  requested_by INTEGER REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('information','document')),
  question TEXT NOT NULL,
  client_message TEXT,
  status TEXT NOT NULL,
  admin_note TEXT,
  client_reply TEXT,
  response_text TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  sent_at TEXT,
  sent_channel TEXT,
  outbound_message_id INTEGER REFERENCES messages(id),
  replied_at TEXT,
  shared_at TEXT,
  shared_by INTEGER REFERENCES users(id),
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_info_requests_case ON info_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_info_requests_status ON info_requests(status);

-- طلبات مساعدة محامٍ آخر (رأي ثانٍ / متخصص / مراجعة مستند / مشاركة)
CREATE TABLE IF NOT EXISTS counsel_requests (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  requester_assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  kind TEXT NOT NULL CHECK (kind IN ('second_opinion','specialist_input','document_review','co_counsel')),
  specialty TEXT,
  issue_ids TEXT NOT NULL DEFAULT '[]',
  document_ids TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  admin_note TEXT,
  assigned_assignment_id INTEGER REFERENCES assignments(id),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_counsel_requests_case ON counsel_requests(case_id);

-- آراء المحامين (مسودات وإصدارات مقدمة)
CREATE TABLE IF NOT EXISTS opinions (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','submitted','returned','approved','superseded')),
  ai_suggestion_id INTEGER REFERENCES ai_suggestions(id),
  submitted_at TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT,
  quality_score INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(assignment_id, version)
);

-- النسخة الموجهة للعميل (تعدها الإدارة بعد الاعتماد)
CREATE TABLE IF NOT EXISTS client_answers (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  opinion_id INTEGER REFERENCES opinions(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','sent')),
  channel TEXT,
  message_id INTEGER REFERENCES messages(id),
  prepared_by INTEGER REFERENCES users(id),
  sent_by INTEGER REFERENCES users(id),
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ===== ملفات العمل المستمر (Matters) =====
CREATE TABLE IF NOT EXISTS matters (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  case_id INTEGER NOT NULL REFERENCES cases(id),
  client_id INTEGER NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  responsible_lawyer_id INTEGER REFERENCES users(id),
  court TEXT,
  circuit TEXT,
  lawsuit_number TEXT,
  lawsuit_year TEXT,
  opponent TEXT,
  agreed_fee_minor INTEGER,
  notes TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matter_events (
  id INTEGER PRIMARY KEY,
  matter_id INTEGER NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT,
  client_attendance_required INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  outcome TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matter_events_time ON matter_events(starts_at);

CREATE TABLE IF NOT EXISTS matter_tasks (
  id INTEGER PRIMARY KEY,
  matter_id INTEGER NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT,
  assignee_user_id INTEGER REFERENCES users(id),
  due_at TEXT,
  procedural INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  done_at TEXT,
  done_by INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- فواتير العميل ومدفوعاته ومصروفات الملفات
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  matter_id INTEGER REFERENCES matters(id),
  case_id INTEGER REFERENCES cases(id),
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  matter_id INTEGER REFERENCES matters(id),
  case_id INTEGER REFERENCES cases(id),
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  incurred_at TEXT NOT NULL,
  paid_by TEXT NOT NULL CHECK (paid_by IN ('organization','lawyer','client')),
  lawyer_id INTEGER REFERENCES users(id),
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- ===== المحاسبة =====
-- واقعة الاستحقاق: ما حدث مهنيًا (لكل إسناد مرة واحدة فقط)
CREATE TABLE IF NOT EXISTS billable_events (
  id INTEGER PRIMARY KEY,
  lawyer_id INTEGER NOT NULL REFERENCES users(id),
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES assignments(id),
  case_id INTEGER NOT NULL REFERENCES cases(id),
  trigger TEXT NOT NULL,
  agreement_type TEXT NOT NULL,
  treatment TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  notional_minor INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billable_lawyer_period ON billable_events(lawyer_id, period);

-- دفتر المستحقات المالية للمحامين
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY,
  lawyer_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  case_id INTEGER REFERENCES cases(id),
  matter_id INTEGER REFERENCES matters(id),
  billable_event_id INTEGER REFERENCES billable_events(id),
  expense_id INTEGER REFERENCES expenses(id),
  period TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accrued',
  payout_id INTEGER REFERENCES payouts(id),
  dedupe_key TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_lawyer ON ledger_entries(lawyer_id, status);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY,
  lawyer_id INTEGER NOT NULL REFERENCES users(id),
  amount_minor INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- ===== الذكاء الاصطناعي والمعرفة المؤسسية =====
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  output TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entity ON ai_suggestions(entity_type, entity_id, kind);

CREATE TABLE IF NOT EXISTS ai_feedback (
  id INTEGER PRIMARY KEY,
  suggestion_id INTEGER REFERENCES ai_suggestions(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  case_id INTEGER REFERENCES cases(id),
  field TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('accepted','corrected','rejected','missed')),
  ai_value TEXT,
  final_value TEXT,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_field ON ai_feedback(field, verdict);

CREATE TABLE IF NOT EXISTS knowledge_records (
  id INTEGER PRIMARY KEY,
  case_id INTEGER UNIQUE REFERENCES cases(id),
  legal_area TEXT NOT NULL,
  title TEXT NOT NULL,
  facts TEXT NOT NULL,
  issues TEXT NOT NULL DEFAULT '[]',
  info_requested TEXT NOT NULL DEFAULT '[]',
  documents_requested TEXT NOT NULL DEFAULT '[]',
  specialists TEXT NOT NULL DEFAULT '[]',
  final_answer TEXT,
  client_answer TEXT,
  ai_corrections TEXT NOT NULL DEFAULT '[]',
  journey TEXT NOT NULL DEFAULT '[]',
  outcome TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_review',
  usage TEXT NOT NULL DEFAULT 'none',
  redaction_report TEXT NOT NULL DEFAULT '{}',
  review_note TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ===== السجل والإشعارات والأتمتة =====
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  case_id INTEGER,
  intake_id INTEGER,
  matter_id INTEGER,
  client_id INTEGER,
  actor_user_id INTEGER REFERENCES users(id),
  actor_kind TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_case ON activity(case_id);
CREATE INDEX IF NOT EXISTS idx_activity_intake ON activity(intake_id);
CREATE INDEX IF NOT EXISTS idx_activity_matter ON activity(matter_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS automation_rules (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  params TEXT NOT NULL DEFAULT '{}',
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  rule_key TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  result TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (rule_key, dedupe_key)
);

-- الإنفاق على الإعلانات والحملات (لحساب تكلفة اكتساب الطلب والملف لكل مصدر/حملة)
CREATE TABLE IF NOT EXISTS ad_spend (
  id INTEGER PRIMARY KEY,
  period TEXT NOT NULL,
  source TEXT NOT NULL,
  campaign TEXT NOT NULL DEFAULT '',
  amount_minor INTEGER NOT NULL,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(period, source, campaign)
);
