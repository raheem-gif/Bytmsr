// v9.1 l-work — مساحة عمل المحامي: ترحيل أنواع طلبات المحامي، والمستندات المقترحة عند طلب مستند (L-19).
//
// الواجهة البرمجية (للمسارات والخدمات الأخرى):
//   LAWYER_REQUEST_KINDS                     أنواع طلبات المحامي: document | information | extension | admin_question
//   ADMIN_ONLY_KINDS                         أنواع لا تُرسل للمستفيد/ة أبدًا (extension، admin_question)
//   migrateInfoRequestKinds(db)              يوسّع قيد kind في جدول info_requests مرة واحدة (آمن للتكرار)
//   parseItems(json) → [{label, status?}]    بنود طلب المستند (B91-16) من عمود items
//   suggestedDocuments(app, assignmentId, lawyer) → { items: [{ label, text, basis }] }
//       اقتراحات مستندات لطلب جديد: من «المستندات المرتبطة» بأنواع المستندات المتاحة للمحامي (heuristic) وقائمة المجال،
//       مطروحًا منها ما أُتيح له وما هو مطلوب بالفعل مما يراه. لا تحتوي أي بيانات للمستفيد/ة.
import { normalizeArabic, parseJson } from '../util.js';
import { analyzeDocument, docTypeOf } from '../ai/heuristic.js';

export const LAWYER_REQUEST_KINDS = ['document', 'information', 'extension', 'admin_question'];
export const ADMIN_ONLY_KINDS = ['extension', 'admin_question'];

const OLD_CHECK_RE = /CHECK\s*\(\s*kind\s+IN\s*\(\s*'information'\s*,\s*'document'\s*\)\s*\)/i;
const NEW_CHECK = "CHECK (kind IN ('information','document','extension','admin_question'))";

/**
 * قيد kind في info_requests (schema.sql) لا يقبل إلا information/document. SQLite لا يعدّل القيود بـ ALTER،
 * فنعيد بناء الجدول بنفس تعريفه الحالي (ومنه أعمدة الوحدات الأخرى المضافة لاحقًا) مع القيد الموسّع، ونعيد فهارسه.
 * لا يفعل شيئًا إن كان القيد موسّعًا بالفعل.
 */
export function migrateInfoRequestKinds(db) {
  const raw = db.raw;
  const row = raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'info_requests'").get();
  if (!row || !OLD_CHECK_RE.test(row.sql)) return false;
  const indexes = raw
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'info_requests' AND sql IS NOT NULL")
    .all()
    .map((r) => r.sql);
  const createNew = row.sql
    .replace(/^\s*CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?["`]?info_requests["`]?/i, 'CREATE TABLE info_requests_v91')
    .replace(OLD_CHECK_RE, NEW_CHECK);
  if (!/^CREATE TABLE info_requests_v91/.test(createNew)) throw new Error('info_requests migration: unexpected DDL');
  raw.exec('PRAGMA foreign_keys = OFF');
  raw.exec('PRAGMA legacy_alter_table = ON');
  try {
    raw.exec('BEGIN IMMEDIATE');
    try {
      raw.exec('DROP TABLE IF EXISTS info_requests_v91');
      raw.exec(createNew);
      raw.exec('INSERT INTO info_requests_v91 SELECT * FROM info_requests');
      raw.exec('DROP TABLE info_requests');
      raw.exec('ALTER TABLE info_requests_v91 RENAME TO info_requests');
      for (const sql of indexes) raw.exec(sql);
      raw.exec('COMMIT');
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  } finally {
    raw.exec('PRAGMA legacy_alter_table = OFF');
    raw.exec('PRAGMA foreign_keys = ON');
  }
  if (db.cache) db.cache.clear();
  return true;
}

/** بنود طلب المستند: [{label, status?}] (تقبل أيضًا قائمة نصوص) */
export function parseItems(json) {
  const arr = parseJson(json, null);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === 'string' ? { label: x } : x && typeof x.label === 'string' ? { ...x } : null))
    .filter((x) => x && x.label.trim());
}

// ───────────── المستندات المقترحة (L-19) ─────────────

// اسم قصير لكل نوع مستند يعرفه المحلل المحلي (heuristic DOC_RULES) — يظهر شريحةً وتُدرج «صورة {الاسم}»
const SHORT_BY_TYPE = {
  inheritance_declaration: 'إعلام الوراثة',
  guardianship_order: 'قرار الوصاية',
  pension_document: 'مستندات المعاش',
  death_certificate: 'شهادة الوفاة',
  birth_certificate: 'شهادات ميلاد الأبناء',
  marriage_divorce: 'قسيمة الزواج',
  national_id: 'بطاقات الرقم القومي',
  court_judgment: 'الحكم الصادر',
  lease_contract: 'عقد الإيجار',
  sale_contract: 'عقد البيع',
};

// قائمة المستندات المعتادة لكل مجال (مختصرة من قوائم النواقص في src/ai/heuristic.js)
const AREA_DOCS = {
  INH: ['إعلام الوراثة', 'شهادة الوفاة', 'قسيمة الزواج', 'شهادات ميلاد الأبناء', 'قرار الوصاية', 'مستندات ملكية أصول التركة'],
  FAM: ['قسيمة الزواج', 'شهادات ميلاد الأبناء', 'أحكام سابقة بين الطرفين', 'مستندات دخل الزوج'],
  GRD: ['قرار الوصاية', 'شهادات ميلاد الأبناء', 'كشف حساب أموال القاصرين', 'إعلام الوراثة'],
  PEN: ['شهادة الوفاة', 'إعلام الوراثة', 'بطاقات الرقم القومي', 'شهادات ميلاد الأبناء', 'قرار رفض المعاش أو وقفه'],
  PRP: ['عقد البيع', 'عقد الإيجار', 'سند ملكية البائع', 'إيصالات سداد الأجرة'],
  LAB: ['عقد العمل', 'بيان التأمينات الاجتماعية', 'كشوف المرتبات'],
  CRM: ['المحضر', 'قرار النيابة'],
  CIV: ['العقد أو سند الدين', 'الإنذار الموجه للطرف الآخر'],
  COM: ['عقد الشركة', 'السجل التجاري'],
  TAX: ['إخطارات مصلحة الضرائب'],
  ADM: ['القرار الإداري', 'التظلم المقدم'],
  GEN: [],
};

/** اسم مختصر صالح للشريحة من عبارة «مستند مرتبط» في المحلل المحلي، أو null إن طال */
function shortName(phrase) {
  // نقتطع الشرح والبدائل أولًا («(لإثبات…)»، «أو صدور حكم…»، «إن وُجد») ثم نتعرف على النوع
  const s = String(phrase || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .split(/\s+(?:أو|إن|إذا)\s+/)[0]
    .replace(/^(أي|كل)\s+/, '')
    .replace(/^صور(ة|ه)\s+/, '')
    .trim();
  const type = docTypeOf(s);
  if (type && SHORT_BY_TYPE[type]) return SHORT_BY_TYPE[type];
  // «ما يفيد…» و«ما يثبت…» وصف لا اسم مستند: لا يصلح شريحة
  if (!s || s.length > 32 || /^ما\s/.test(s)) return null;
  return s;
}

/** مفتاح مقارنة: نوع المستند إن عُرف، وإلا النص الموحّد بلا «صورة» */
function keyOf(text) {
  const type = docTypeOf(text);
  if (type) return `t:${type}`;
  return `n:${normalizeArabic(String(text || '')).replace(/^صوره\s+/, '').replace(/\s+/g, ' ').trim()}`;
}

/**
 * @returns {{ items: Array<{label:string, text:string, basis:'related'|'area'|'both'}> }}
 */
export function suggestedDocuments(app, assignmentId, lawyer) {
  const view = app.visibility.assignmentView(assignmentId, lawyer); // يرمي 404 لغير صاحب الإسناد
  const granted = view.documents || [];
  // ما يُستبعد: المستندات المتاحة له، وطلباته المفتوحة، وما هو مطلوب بالفعل من المستفيد/ة مما يراه
  const taken = new Set();
  const takenText = [];
  const take = (text) => {
    if (!text) return;
    taken.add(keyOf(text));
    takenText.push(normalizeArabic(String(text)));
  };
  for (const d of granted) {
    take(d.title);
    take(d.filename);
  }
  for (const r of view.info_requests || []) {
    if (!['pending_admin', 'sent_to_client', 'client_replied'].includes(r.status)) continue;
    if (r.kind !== 'document' && r.kind !== 'information') continue;
    take(r.question);
    for (const it of r.items || []) take(it.label);
  }
  for (const r of view.case_open_requests || []) {
    take(r.client_message);
    for (const label of r.items || []) take(label);
  }
  // كل عبارة مطلوبة قد تذكر عدة مستندات: نبحث أيضًا عن الاسم داخل النص
  const isTaken = (label) => {
    if (taken.has(keyOf(label))) return true;
    const nl = normalizeArabic(label).replace(/\s+/g, ' ').trim();
    return takenText.some((t) => t.includes(nl));
  };

  const scores = new Map();
  const add = (label, weight, basis, order) => {
    if (!label || isTaken(label)) return;
    const k = keyOf(label);
    const cur = scores.get(k);
    if (cur) {
      cur.score += weight;
      if (cur.basis !== basis) cur.basis = 'both';
      cur.order = Math.min(cur.order, order);
    } else scores.set(k, { label, score: weight, basis, order });
  };
  // المستندات المرتبطة بأنواع المستندات المتاحة (بالتناوب حتى لا يطغى مستند واحد)
  const relatedLists = granted
    .filter((d) => d.granted !== false)
    .map((d) => analyzeDocument({ filename: d.filename, title: d.title, mime: d.mime, size: d.size }).missing_related || []);
  const longest = Math.max(0, ...relatedLists.map((l) => l.length));
  let order = 0;
  for (let i = 0; i < longest; i++) {
    for (const list of relatedLists) if (list[i]) add(shortName(list[i]), 2, 'related', order++);
  }
  for (const label of AREA_DOCS[view.case.legal_area] || []) add(label, 1, 'area', order++);

  const items = [...scores.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 5)
    .map((s) => ({ label: s.label, text: `صورة ${s.label}`, basis: s.basis }));
  return { items };
}
