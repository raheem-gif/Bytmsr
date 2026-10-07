-- الإصدار 9.1 — مسار l-work: طلبات المحامي (المهلة، السؤال للإدارة، «أحتاج هذا أيضًا») ومرجع إعادة الإرسال الآمن.
-- (توسيع قيد kind في info_requests لا يمكن بـ SQL ثابت؛ تنفذه src/services/v91-l-work.js مرة واحدة عند التشغيل)
CREATE INDEX IF NOT EXISTS idx_info_requests_duplicate ON info_requests(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_info_requests_client_ref ON info_requests(requested_by, client_ref) WHERE client_ref IS NOT NULL;
