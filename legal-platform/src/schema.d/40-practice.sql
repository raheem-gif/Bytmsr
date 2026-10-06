-- v9 — وحدة الممارسة (practice): بطاقة المستفيد، أطراف الملفات وتعارض المصالح، اشتراكات التقويم.
-- القيم المسموح بها تُتحقق في الخدمة (src/services/practice.js) لا بقيود CHECK حتى يمكن توسيعها دون ترحيل.

-- بطاقة المستفيد (البحث الاجتماعي): بيانات حساسة للإدارة فقط ولا تظهر للمحامين إطلاقًا.
-- الأبناء بسنوات الميلاد والنوع فقط — بلا أسماء (تقليل البيانات الشخصية).
CREATE TABLE IF NOT EXISTS beneficiary_profiles (
  client_id INTEGER PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  relation TEXT,
  children_count INTEGER,
  children TEXT NOT NULL DEFAULT '[]',
  monthly_income_band TEXT,
  housing TEXT,
  employment TEXT,
  has_disability INTEGER NOT NULL DEFAULT 0,
  foundation_file_number TEXT,
  is_foundation_beneficiary INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  -- staff | self_reported | import
  data_source TEXT NOT NULL DEFAULT 'staff',
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beneficiary_file_no ON beneficiary_profiles(foundation_file_number);

-- ما ذكره مقدم الطلب عن نفسه في نموذج الموقع (غير موثّق): يبقى مرتبطًا بالطلب حتى تعتمده الإدارة في البطاقة
CREATE TABLE IF NOT EXISTS beneficiary_submissions (
  id INTEGER PRIMARY KEY,
  intake_id INTEGER NOT NULL UNIQUE REFERENCES intakes(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id),
  data TEXT NOT NULL,
  applied_at TEXT,
  applied_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- أطراف الملفات (الخصوم والأطراف ذات الصلة والشهود) لفحص تعارض المصالح
CREATE TABLE IF NOT EXISTS case_parties (
  id INTEGER PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
  matter_id INTEGER REFERENCES matters(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  national_id TEXT,
  notes TEXT,
  -- staff | matter_opponent | import
  origin TEXT NOT NULL DEFAULT 'staff',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties(case_id);
CREATE INDEX IF NOT EXISTS idx_case_parties_matter ON case_parties(matter_id);
CREATE INDEX IF NOT EXISTS idx_case_parties_nid ON case_parties(national_id);
CREATE INDEX IF NOT EXISTS idx_case_parties_norm ON case_parties(name_norm);

-- رابط اشتراك التقويم (ICS) لكل مستخدم: الرمز مخزن مُجزّأً فقط ويمكن إعادة إصداره لإبطال القديم
CREATE TABLE IF NOT EXISTS calendar_feeds (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_intake_out ON messages(intake_id, direction, automated);
