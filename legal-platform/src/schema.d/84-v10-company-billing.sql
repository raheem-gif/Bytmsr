-- v10 B2B (SRV-0): الباقات والاشتراكات (لقطة من الشروط) وسجل التكاليف الإضافية المعتمدة.
-- الفواتير والمدفوعات مؤجلة إلى 10.1 (L-31)؛ يضيف 10.1 العمود company_charges.invoice_id عبر .columns.json.
CREATE TABLE IF NOT EXISTS company_plans (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  terms TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plan_id INTEGER REFERENCES company_plans(id),
  terms TEXT NOT NULL,                         -- لقطة من شروط الباقة (قابلة للتعديل لكل شركة)
  status TEXT NOT NULL DEFAULT 'active',       -- active|ended
  starts_on TEXT NOT NULL,                     -- YYYY-MM-DD: يثبّت يوم بداية دورات الاستخدام الشهرية
  ends_on TEXT,
  renews TEXT NOT NULL DEFAULT 'auto',         -- auto|manual
  next_invoice_on TEXT,                        -- غير مستخدم في 10.0
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_subscriptions_active ON company_subscriptions(company_id) WHERE status = 'active';

-- كل إدراج هنا يُبلَّغ به مديرو البوابة وجهات الفواتير (INV-B10). العرض بحد أقصى: تكلفة بالحد الأقصى عند الموافقة،
-- ولا يحل محلها إلا مبلغ أقل (replaces_charge_id).
CREATE TABLE IF NOT EXISTS company_charges (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  request_id INTEGER REFERENCES company_requests(id),
  quote_id INTEGER UNIQUE REFERENCES company_quotes(id),
  kind TEXT NOT NULL,                          -- out_of_scope|overage|expense|adjustment
  description TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EGP',
  period TEXT NOT NULL,                        -- بداية دورة الاستخدام YYYY-MM-DD
  replaces_charge_id INTEGER REFERENCES company_charges(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  voided_at TEXT,
  voided_by INTEGER REFERENCES users(id),
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_company_charges_company ON company_charges(company_id, period);
