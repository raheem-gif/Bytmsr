-- v9 (programs): البرامج ومصادر التمويل (منح، زكاة «نماء»، شراكات مسؤولية مجتمعية، تبرعات، موارد ذاتية)
-- الملف (case) ينتمي إلى برنامج واحد على الأكثر عبر cases.program_id (عمود مضاف في 60-programs.columns.json)،
-- والملفات المستمرة (matters) تتبع برنامج ملفها الأصلي.

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  funder_name TEXT NOT NULL,
  funder_type TEXT NOT NULL CHECK (funder_type IN ('grant','zakat','csr','donor','internal')),
  -- بيانات التواصل مع الجهة المانحة ورقم اتفاقية المنحة (للإدارة فقط)
  funder_contact TEXT,
  agreement_ref TEXT,
  description TEXT,
  -- القيود على أوجه الصرف (مثل مصارف الزكاة) وملاحظات الالتزام
  restrictions TEXT,
  -- التواريخ بتوقيت UTC (بداية يوم البدء ونهاية يوم الانتهاء بتوقيت القاهرة)
  start_date TEXT NOT NULL,
  end_date TEXT,
  budget_minor INTEGER NOT NULL DEFAULT 0,
  -- نطاق الأهلية: محافظات ومجالات قانونية (قائمة فارغة = بلا قيد)
  eligible_governorates TEXT NOT NULL DEFAULT '[]',
  eligible_areas TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','suspended','closed')),
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  close_note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_cases_program ON cases(program_id);

-- تنبيهات استهلاك الميزانية: مرة واحدة لكل عتبة (80% / 100%) ولكل قيمة ميزانية
-- (إذا زِيدت الميزانية لاحقًا تعود التنبيهات للعمل عند العتبات الجديدة)
CREATE TABLE IF NOT EXISTS program_alerts (
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  threshold INTEGER NOT NULL,
  budget_minor INTEGER NOT NULL,
  spend_minor INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (program_id, threshold, budget_minor)
);

-- ترقيم إيصالات الاستلام RCPT-YYYY-NNNNN (فريد وثابت؛ يُمنح عند تسجيل الدفعة)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receipt_number) WHERE receipt_number IS NOT NULL;
