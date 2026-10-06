-- v9 — وحدة الرسائل: الردود الجاهزة، قوالب واتساب المعتمدة وربطها بالأغراض، دخول بوابة العملاء برمز واتساب،
-- المستندات المرسلة للعميل، واستبيان رضا العملاء.

-- الردود الجاهزة (Canned responses) التي يدرجها فريق الإدارة في رسائل العملاء
CREATE TABLE IF NOT EXISTS quick_replies (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  -- اختصار يُكتب في محرر الرسالة مثل «/وثائق» (فريد إن وُجد)
  shortcut TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_replies_shortcut ON quick_replies(shortcut) WHERE shortcut IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_replies_category ON quick_replies(category);

-- قوالب رسائل واتساب كما اعتمدتها ميتا (تُزامَن من حساب واتساب للأعمال WABA)
CREATE TABLE IF NOT EXISTS wa_templates (
  id INTEGER PRIMARY KEY,
  external_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL,
  header_text TEXT,
  body_text TEXT,
  footer_text TEXT,
  -- عدد متغيرات نص القالب {{1}}…{{n}}
  param_count INTEGER NOT NULL DEFAULT 0,
  header_param_count INTEGER NOT NULL DEFAULT 0,
  -- الأزرار [{type, text, url?}] (مثل زر نسخ الرمز في قوالب المصادقة)
  buttons TEXT NOT NULL DEFAULT '[]',
  rejected_reason TEXT,
  synced_at TEXT NOT NULL,
  -- لم يعد موجودًا في حساب واتساب عند آخر مزامنة
  removed_at TEXT,
  UNIQUE(name, language)
);

-- ربط كل غرض (تحديث الملف، رمز الدخول، الاستبيان، قاعدة أتمتة) بقالب معتمد وترتيب متغيراته
CREATE TABLE IF NOT EXISTS wa_template_mappings (
  purpose TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL,
  -- أسماء المتغيرات بترتيب {{1}}…{{n}} مثل ["client_name","body"]
  params TEXT NOT NULL DEFAULT '[]',
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

-- المستندات المرفقة برسالة صادرة للعميل (المستند نفسه يبقى في ملفه الأصلي دون تكرار)
CREATE TABLE IF NOT EXISTS message_attachments (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_doc ON message_attachments(document_id);

-- رموز دخول بوابة العملاء عبر واتساب: الرمز مُجزّأ، وصالح 10 دقائق و5 محاولات.
-- يُنشأ صف لكل طلب حتى لو لم يطابق الرقم عميلًا موثّقًا (client_id = NULL) حتى لا يختلف السلوك فيُكشف وجود الرقم.
CREATE TABLE IF NOT EXISTS portal_otps (
  id INTEGER PRIMARY KEY,
  challenge_hash TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  locked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_portal_otps_phone ON portal_otps(phone, created_at);

-- استبيانات الرضا المرسلة بعد الرد على العميل (استبيان واحد لكل ملف)
CREATE TABLE IF NOT EXISTS case_surveys (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL UNIQUE REFERENCES cases(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_answer_id INTEGER REFERENCES client_answers(id),
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  channel TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','awaiting_comment','answered','expired')),
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  answered_at TEXT,
  -- بعد تقييم منخفض نطلب من العميل توضيحًا؛ رسالته التالية خلال هذه المدة تُسجَّل تعليقًا على تقييمه
  comment_until TEXT,
  followup_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_case_surveys_client ON case_surveys(client_id, status);

-- تقييم العميل للخدمة (1–5) وتعليقه
CREATE TABLE IF NOT EXISTS case_feedback (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id),
  survey_id INTEGER REFERENCES case_surveys(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  channel TEXT NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_feedback_case ON case_feedback(case_id);
CREATE INDEX IF NOT EXISTS idx_case_feedback_time ON case_feedback(created_at);
