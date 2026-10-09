-- v11 segment-server (schema 86): نوع الخدمة «خيري» / «أفراد وشركات». يعمل في كل تشغيل ولا يغيّر شيئًا في المرة الثانية،
-- ولا يلمس intakes.segment أبدًا (NULL = «غير محدد» يبقى كما هو).
-- ملفات الشركات وملفاتها المستمرة «أفراد وشركات» دائمًا
UPDATE cases SET segment = 'paid' WHERE company_id IS NOT NULL AND segment != 'paid';
UPDATE matters SET segment = 'paid' WHERE segment != 'paid' AND case_id IN (SELECT id FROM cases WHERE company_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_intakes_segment ON intakes(segment, status);
CREATE INDEX IF NOT EXISTS idx_cases_segment ON cases(segment, status);
CREATE INDEX IF NOT EXISTS idx_matters_segment ON matters(segment, status);
-- [r2 S6] لقطة نوع الخدمة على أحداث العمل وقيود الدفتر: تُكتب مرة واحدة عند الإدراج ولا تتبع تغييرًا لاحقًا لنوع الملف،
-- فتبقى الفترات المغلقة كما هي. ملء الصفوف القديمة الفارغة فقط (قيد بلا ملف ولا ملف مستمر = «خيري»).
UPDATE billable_events SET segment = (SELECT CASE WHEN c.company_id IS NOT NULL OR c.segment = 'paid' THEN 'paid' ELSE 'charity' END FROM cases c WHERE c.id = billable_events.case_id) WHERE segment IS NULL;
UPDATE billable_events SET segment = 'charity' WHERE segment IS NULL;
UPDATE ledger_entries SET segment = COALESCE((SELECT CASE WHEN c.company_id IS NOT NULL OR c.segment = 'paid' THEN 'paid' ELSE 'charity' END FROM cases c WHERE c.id = COALESCE(ledger_entries.case_id, (SELECT m.case_id FROM matters m WHERE m.id = ledger_entries.matter_id))), 'charity') WHERE segment IS NULL;
CREATE TRIGGER IF NOT EXISTS trg_v11_be_segment AFTER INSERT ON billable_events WHEN NEW.segment IS NULL
BEGIN
  UPDATE billable_events SET segment = COALESCE((SELECT CASE WHEN c.company_id IS NOT NULL OR c.segment = 'paid' THEN 'paid' ELSE 'charity' END FROM cases c WHERE c.id = NEW.case_id), 'charity') WHERE id = NEW.id;
END;
CREATE TRIGGER IF NOT EXISTS trg_v11_le_segment AFTER INSERT ON ledger_entries WHEN NEW.segment IS NULL
BEGIN
  UPDATE ledger_entries SET segment = COALESCE((SELECT CASE WHEN c.company_id IS NOT NULL OR c.segment = 'paid' THEN 'paid' ELSE 'charity' END FROM cases c WHERE c.id = COALESCE(NEW.case_id, (SELECT m.case_id FROM matters m WHERE m.id = NEW.matter_id))), 'charity') WHERE id = NEW.id;
END;
