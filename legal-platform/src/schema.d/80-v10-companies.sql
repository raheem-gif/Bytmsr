-- v10 B2B (b2b-server، SRV-0): الشركات العميلة وكياناتها ومستخدموها — حسابات منفصلة تمامًا عن users
-- (جدول users وقيد الدور فيه لا يُمسّان). كل الجداول IF NOT EXISTS فتشغيل الملف مرتين لا يغيّر شيئًا،
-- ولا قيود CHECK على الحالات (يُتحقق منها في الخدمات كبقية وحدات الإصدار 9).
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,                 -- CO-00001
  prefix TEXT NOT NULL UNIQUE,               -- بادئة أرقام الطلبات NFD (لا تتغير بعد أول طلب)
  name TEXT NOT NULL,
  legal_name TEXT,
  industry TEXT,
  size_band TEXT,                            -- 1-10|11-50|51-200|201-500|500+
  commercial_registry TEXT,
  tax_id TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'trial',      -- trial|active|past_due|suspended|ended
  status_reason TEXT,
  trial_ends_at TEXT,
  ended_at TEXT,
  account_manager_id INTEGER REFERENCES users(id),  -- «مدير العلاقة» من فريق المكتب
  client_id INTEGER UNIQUE REFERENCES clients(id),  -- العميل الداخلي (الظل) الذي تُفتح عليه ملفات العمل
  require_2fa INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  notes_internal TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

CREATE TABLE IF NOT EXISTS company_entities (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  legal_form TEXT,                           -- llc|jsc|sole|branch|partnership|other
  relation TEXT NOT NULL DEFAULT 'parent',   -- parent|subsidiary|affiliate|branch
  parent_entity_id INTEGER REFERENCES company_entities(id),
  commercial_registry TEXT,
  tax_id TEXT,
  jurisdiction TEXT,
  status TEXT NOT NULL DEFAULT 'active',     -- active|inactive
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_entities_company ON company_entities(company_id);

CREATE TABLE IF NOT EXISTS company_users (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  job_title TEXT,
  phone TEXT,                                -- لا يظهر للمحامين أبدًا
  role TEXT NOT NULL DEFAULT 'member',       -- company_admin|member|viewer
  billing_contact INTEGER NOT NULL DEFAULT 0,
  email_pref TEXT NOT NULL DEFAULT 'important', -- all|important|none (أمان الحساب يُرسل دائمًا)
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  invite_pending INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_changed_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  last_failed_login_at TEXT,
  locked_until TEXT,
  terms_accepted_at TEXT,
  last_login_at TEXT,
  deactivated_at TEXT,
  created_by_kind TEXT NOT NULL,             -- staff|company|seed
  created_by_user_id INTEGER REFERENCES users(id),
  created_by_company_user_id INTEGER REFERENCES company_users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id, active);

-- فريق الشركة المفضل/المستبعد من المحامين (للإدارة فقط؛ لا تراه الشركة)
CREATE TABLE IF NOT EXISTS company_team (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  lawyer_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,                         -- preferred_lead|preferred_reviewer|excluded
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (company_id, lawyer_id)
);

-- فهارس الأعمدة المضافة (80-v10-companies.columns.json)
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_cases_company ON cases(company_id);
CREATE INDEX IF NOT EXISTS idx_cases_company_request ON cases(company_request_id);
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE INDEX IF NOT EXISTS idx_documents_company_request ON documents(company_request_id);
CREATE INDEX IF NOT EXISTS idx_documents_assignment ON documents(assignment_id);
CREATE INDEX IF NOT EXISTS idx_activity_company_request ON activity(company_request_id);
CREATE INDEX IF NOT EXISTS idx_activity_company ON activity(company_id, created_at);
-- security_events.company_id/company_user_id: الجدول يُنشأ في 00-core.sql بعد خطوة الأعمدة على قاعدة جديدة،
-- فتضيفهما createAudit() في src/services/platform.js مع فهرسهما (إضافة آمنة تتكرر بلا أثر).
CREATE INDEX IF NOT EXISTS idx_knowledge_scope ON knowledge_records(scope, company_id);
