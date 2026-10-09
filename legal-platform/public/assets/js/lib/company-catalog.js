// الإصدار 10 — كتالوج خدمة الشركات (مصدر واحد للخادم وبوابة الشركات وصفحات فريق المكتب؛ L-24).
// وحدة نقية بلا DOM ولا استيرادات: المفاتيح والتسميات والأيقونات والمراحل والأولويات وأنواع التسليم ورموز المخاطر
// والأعمال المستبعدة والعملات وبيانات أنواع الذاكرة القانونية. مواصفات الحقول والتحقق منها في company-catalog-fields.js
// (تُحمَّل عند الحاجة فقط؛ CS-32). نصوص الشركة بالعربية الفصحى وبصيغة الجمع (U10-01)، وأسماء الأدوار حسب L-50.

export const CATALOG_VERSION = 1;

/** أنواع الطلبات الاثنا عشر بترتيب المستخدم (U10-28؛ الترتيب قرار مفتوح O-15) */
export const REQUEST_TYPES = Object.freeze([
  {
    key: 'contract_review',
    label: 'مراجعة عقد قبل التوقيع',
    company_label: 'مراجعة عقد',
    sub: 'قبل التوقيع',
    icon: 'fileSignature',
    default_area: 'COM',
    default_skills: ['contracts'],
    default_size: 'M',
    default_visibility: 'company',
    deliverable_kind: 'reviewed_contract',
    party_role: 'related',
    requires_document: true,
    requires_entity: false,
    document_label: 'العقد (مسودة أو نسخة للتوقيع)',
    description_label: 'ما الذي يهمكم في هذا العقد؟',
    description_hint: 'مثل: بنود تقلقكم، شروط لا تقبلونها، ما اتُّفق عليه شفهيًا ولم يُكتب.',
  },
  {
    key: 'contract_drafting',
    label: 'إعداد عقد',
    company_label: 'صياغة عقد',
    sub: 'عقد جديد من البداية',
    icon: 'filePen',
    default_area: 'COM',
    default_skills: ['contracts'],
    default_size: 'M',
    default_visibility: 'company',
    deliverable_kind: 'draft_document',
    party_role: 'related',
    requires_document: false,
    requires_entity: false,
    document_label: 'مسودات أو مراسلات سابقة',
    description_label: 'ما الذي تريدون أن يحققه العقد؟',
    description_hint: 'الطرفان، محل العقد، المدة، المقابل، وأي شروط خاصة.',
  },
  {
    key: 'nda',
    label: 'اتفاقية سرية (NDA)',
    company_label: 'اتفاقية سرية',
    sub: 'NDA',
    sub_lang: 'en',
    icon: 'fileLock',
    default_area: 'COM',
    default_skills: ['contracts'],
    default_size: 'S',
    default_visibility: 'company',
    deliverable_kind: 'draft_document',
    party_role: 'related',
    requires_document: false,
    requires_entity: false,
    document_label: null,
    description_label: 'ما المعلومات التي ستتبادلونها؟',
    description_hint: 'مثل: بيانات عملاء، أسعار، خطط منتج.',
  },
  {
    key: 'employment',
    label: 'مسألة عمالية / موظف',
    company_label: 'مسألة موظف',
    sub: 'إنهاء خدمة، جزاء، مستحقات…',
    icon: 'userCog',
    default_area: 'LAB',
    default_skills: ['employment'],
    default_size: 'M',
    default_visibility: 'private',
    deliverable_kind: 'memo',
    party_role: 'related',
    requires_document: false,
    requires_entity: false,
    document_label: 'عقد العمل، الإنذارات، آخر قسيمة مرتب',
    description_label: 'ماذا حدث؟',
    description_hint: 'اذكروا الوقائع والتواريخ بلا أسماء.',
  },
  {
    key: 'marketing_review',
    label: 'مراجعة حملة تسويقية',
    company_label: 'مراجعة حملة تسويقية',
    sub: 'إعلان، عروض، مسابقات',
    icon: 'megaphone',
    default_area: 'ADM',
    default_skills: ['consumer_marketing'],
    default_size: 'S',
    default_visibility: 'company',
    deliverable_kind: 'memo',
    party_role: null,
    requires_document: false,
    requires_entity: false,
    document_label: 'التصميمات أو النصوص',
    description_label: 'ما فكرة الحملة؟',
    description_hint: 'الرسالة الأساسية، العروض أو الأسعار، أي جوائز أو مسابقات.',
  },
  {
    key: 'legal_notice',
    label: 'إنذار أو مطالبة وصلت للشركة',
    company_label: 'إنذار أو مطالبة وصلتكم',
    sub: 'إنذار، صحيفة دعوى، خطاب جهة حكومية',
    icon: 'mailWarning',
    default_area: 'CIV',
    default_skills: ['disputes'],
    default_size: 'M',
    default_visibility: 'company',
    deliverable_kind: 'letter',
    party_role: 'opponent',
    requires_document: true,
    requires_entity: false,
    document_label: 'صورة الإنذار أو المطالبة',
    description_label: 'ما الذي تعرفونه عن هذا الإنذار؟',
    description_hint: 'علاقتكم بالجهة المرسِلة، وهل هناك عقد أو فواتير مرتبطة.',
  },
  {
    key: 'board_resolution',
    label: 'قرار مجلس إدارة / جمعية',
    company_label: 'قرار مجلس إدارة أو جمعية',
    sub: 'مفوضو البنك، تعيين مدير، توكيل',
    icon: 'landmark',
    default_area: 'COM',
    default_skills: ['corporate_governance'],
    default_size: 'S',
    default_visibility: 'company',
    deliverable_kind: 'resolution',
    party_role: null,
    requires_document: false,
    requires_entity: true,
    document_label: 'النظام الأساسي، آخر قرار مماثل',
    description_label: 'ما المطلوب في القرار؟',
    description_hint: 'مثل: إضافة مفوض جديد على الحساب البنكي وحدود صلاحياته.',
  },
  {
    key: 'supplier_issue',
    label: 'مشكلة مع مورد',
    company_label: 'مشكلة مع مورد',
    sub: 'تأخير، جودة، أسعار',
    icon: 'truck',
    default_area: 'COM',
    default_skills: ['contracts', 'disputes'],
    default_size: 'M',
    default_visibility: 'company',
    deliverable_kind: 'memo',
    party_role: 'opponent',
    requires_document: false,
    requires_entity: false,
    document_label: null,
    description_label: 'ماذا حدث مع المورد؟',
    description_hint: 'الوقائع والتواريخ والمبالغ، وما تريدونه: الاستمرار أو التعويض أو الإنهاء.',
  },
  {
    key: 'compliance_question',
    label: 'سؤال امتثال',
    company_label: 'سؤال امتثال',
    sub: 'ضرائب، عمل، حماية بيانات، تراخيص',
    icon: 'shieldCheck',
    default_area: 'ADM',
    default_skills: ['regulatory'],
    default_size: 'S',
    default_visibility: 'company',
    deliverable_kind: 'memo',
    party_role: null,
    requires_document: false,
    requires_entity: false,
    document_label: 'أي خطاب من جهة رسمية',
    description_label: 'سؤالكم',
    description_hint: 'صفوا النشاط أو الموقف، واذكروا أي خطاب من جهة رسمية.',
  },
  {
    key: 'renewal_followup',
    label: 'متابعة تجديد عقد أو ترخيص',
    company_label: 'تجديد عقد أو ترخيص',
    sub: 'متابعة قبل الانتهاء',
    icon: 'calendarClock',
    default_area: 'COM',
    default_skills: ['regulatory'],
    default_size: 'S',
    default_visibility: 'company',
    deliverable_kind: 'memo',
    party_role: 'related',
    requires_document: false,
    requires_entity: false,
    document_label: null,
    description_label: 'ما الذي تحتاجونه؟',
    description_hint: 'تجديد بنفس الشروط، تعديل شروط، أو إنهاء.',
  },
  {
    key: 'dispute',
    label: 'بدء نزاع',
    company_label: 'بدء نزاع أو مطالبة',
    sub: 'مستحقات، إخلال بعقد',
    icon: 'gavel',
    default_area: 'CIV',
    default_skills: ['disputes'],
    default_size: 'L',
    default_visibility: 'company',
    deliverable_kind: 'memo',
    party_role: 'opponent',
    requires_document: false,
    requires_entity: false,
    document_label: null,
    description_label: 'ما خلفية النزاع؟',
    description_hint: 'الوقائع، المراسلات، والمبالغ.',
  },
  {
    key: 'other',
    label: 'طلب آخر',
    company_label: 'طلب آخر',
    sub: 'أي سؤال قانوني',
    icon: 'helpCircle',
    default_area: 'GEN',
    default_skills: [],
    default_size: 'M',
    default_visibility: 'company',
    deliverable_kind: 'other',
    party_role: null,
    requires_document: false,
    requires_entity: false,
    document_label: null,
    description_label: 'اكتبوا طلبكم',
    description_hint: 'كلما كانت التفاصيل أوضح كان الرد أسرع.',
  },
].map((t) => Object.freeze({ ...t, default_skills: Object.freeze([...t.default_skills]) })));

export const REQUEST_TYPE_KEYS = Object.freeze(REQUEST_TYPES.map((t) => t.key));

/**
 * مراحل الطلب كما تراها الشركة (company_label) وفريق المكتب (staff_label). اللون للحالة: warning لكل ما ينتظر الشركة
 * (ومعه أيقونته دائمًا)، و«تم التسليم» warning لأن الشركة ما زال عليها الاعتماد، و«مكتمل» success (L-63، CO-16).
 */
export const STAGES = Object.freeze([
  { key: 'received', company_label: 'قيد الدراسة', staff_label: 'بانتظار الفرز', tone: 'neutral', icon: 'inbox' },
  { key: 'needs_you', company_label: 'بانتظار ردكم', staff_label: 'بانتظار رد الشركة', tone: 'warning', icon: 'alert' },
  { key: 'approval', company_label: 'بانتظار موافقتكم', staff_label: 'بانتظار موافقة الشركة', tone: 'warning', icon: 'alert' },
  { key: 'working', company_label: 'جارٍ العمل', staff_label: 'جارٍ العمل', tone: 'info', icon: 'briefcase' },
  { key: 'final_review', company_label: 'مراجعة نهائية', staff_label: 'مراجعة نهائية', tone: 'info', icon: 'shieldCheck' },
  { key: 'delivered', company_label: 'تم التسليم — بانتظار اعتمادكم', company_short: 'تم التسليم', staff_label: 'سُلِّم — بانتظار اعتماد الشركة', tone: 'warning', icon: 'checkCircle' },
  { key: 'closed', company_label: 'مكتمل', staff_label: 'مكتمل', tone: 'success', icon: 'checkCircle' },
  { key: 'declined', company_label: 'اعتذرنا عن الطلب', staff_label: 'اعتذرنا عنه', tone: 'neutral', icon: 'x' },
  { key: 'cancelled', company_label: 'ملغى', staff_label: 'ملغى', tone: 'neutral', icon: 'x' },
].map((s) => Object.freeze(s)));

/**
 * درجات الاستعجال. نص الوعد لكل درجة يُبنى من الباقة (durationText في company-sla.js)، ونافذة العاجل من meta
 * (urgent_hours_text) — L-53، CO-25. «منخفض» للإدارة فقط.
 */
export const PRIORITIES = Object.freeze([
  { key: 'normal', label: 'عادي', company: true },
  { key: 'high', label: 'مرتفع', company: true },
  { key: 'urgent', label: 'عاجل', company: true },
  { key: 'low', label: 'منخفض', company: false },
].map((p) => Object.freeze(p)));

export const DELIVERABLE_KINDS = Object.freeze([
  { key: 'memo', label: 'مذكرة رأي قانوني' },
  { key: 'reviewed_contract', label: 'عقد مُراجَع بالملاحظات' },
  { key: 'draft_document', label: 'مستند مُعَد' },
  { key: 'letter', label: 'خطاب أو رد على إنذار' },
  { key: 'resolution', label: 'نموذج قرار' },
  { key: 'checklist', label: 'قائمة إجراءات' },
  { key: 'other', label: 'تسليم آخر' },
].map((x) => Object.freeze(x)));

/** تخصصات عمل الشركات (لملف المحامي واقتراح المحامين؛ لا تظهر للشركة) */
export const B2B_SKILLS = Object.freeze([
  { key: 'contracts', label: 'العقود' },
  { key: 'corporate_governance', label: 'حوكمة الشركات' },
  { key: 'employment', label: 'علاقات العمل' },
  { key: 'ip', label: 'الملكية الفكرية' },
  { key: 'data_protection', label: 'حماية البيانات' },
  { key: 'consumer_marketing', label: 'حماية المستهلك والتسويق' },
  { key: 'regulatory', label: 'التراخيص والامتثال' },
  { key: 'disputes', label: 'النزاعات' },
  { key: 'real_estate', label: 'العقارات' },
  { key: 'tax', label: 'الضرائب' },
  { key: 'competition', label: 'المنافسة' },
  { key: 'banking_finance', label: 'البنوك والتمويل' },
].map((x) => Object.freeze(x)));

/** رموز المخاطر (للفرز عند فريق المكتب) */
export const RISK_CODES = Object.freeze([
  { key: 'tight_deadline', label: 'موعد ضيق' },
  { key: 'high_value', label: 'قيمة مرتفعة' },
  { key: 'unlimited_liability', label: 'مسؤولية غير محدودة' },
  { key: 'exclusivity_non_compete', label: 'حصرية أو عدم منافسة' },
  { key: 'auto_renewal_trap', label: 'تجديد تلقائي يصعب إيقافه' },
  { key: 'termination_penalty', label: 'غرامة إنهاء' },
  { key: 'personal_data', label: 'بيانات شخصية' },
  { key: 'regulatory_exposure', label: 'تعرض رقابي' },
  { key: 'government_counterparty', label: 'طرف حكومي' },
  { key: 'foreign_law_or_forum', label: 'قانون أو محكمة أجنبية' },
  { key: 'litigation_threat', label: 'تهديد بالتقاضي' },
  { key: 'employee_termination_risk', label: 'مخاطر إنهاء خدمة موظف' },
  { key: 'consumer_claims', label: 'شكاوى المستهلكين' },
  { key: 'ip_ownership', label: 'ملكية فكرية' },
  { key: 'missing_contract', label: 'لا يوجد عقد مكتوب' },
  { key: 'other', label: 'أخرى' },
].map((x) => Object.freeze(x)));

/** درجات المخاطر في التسليم (تظهر للشركة بالكلمات) */
export const RISK_LEVELS = Object.freeze([
  { key: 'low', label: 'منخفضة', tone: 'success' },
  { key: 'medium', label: 'متوسطة', tone: 'warning' },
  { key: 'high', label: 'مرتفعة', tone: 'danger' },
].map((x) => Object.freeze(x)));

/** أعمال خارج الاشتراك عادةً (بعرض سعر قبل أي عمل) */
export const EXCLUDED_WORK = Object.freeze([
  { key: 'litigation', label: 'تمثيل أمام المحاكم' },
  { key: 'arbitration', label: 'تحكيم' },
  { key: 'mna', label: 'استحواذ واندماج' },
  { key: 'criminal', label: 'جنائي' },
  { key: 'debt_collection', label: 'تحصيل ديون' },
  { key: 'due_diligence', label: 'فحص قانوني نافٍ للجهالة' },
  { key: 'other_excluded', label: 'عمل خارج الباقة' },
].map((x) => Object.freeze(x)));

export const CURRENCIES = Object.freeze([
  { key: 'EGP', label: 'ج.م' },
  { key: 'USD', label: 'دولار أمريكي' },
  { key: 'EUR', label: 'يورو' },
  { key: 'SAR', label: 'ريال سعودي' },
  { key: 'AED', label: 'درهم إماراتي' },
  { key: 'other', label: 'أخرى' },
].map((x) => Object.freeze(x)));

/** «لغة التسليم» (U10-D1) */
export const OUTPUT_LANGUAGES = Object.freeze([
  { key: 'ar', label: 'العربية' },
  { key: 'en', label: 'English', lang: 'en' },
  { key: 'both', label: 'العربية والإنجليزية' },
].map((x) => Object.freeze(x)));

/** أساس عرض السعر في 10.0: مبلغ ثابت أو بحد أقصى (L-31) */
export const QUOTE_BASES = Object.freeze([
  { key: 'fixed', label: 'مبلغ ثابت' },
  { key: 'capped', label: 'بحد أقصى' },
].map((x) => Object.freeze(x)));

/** أدوار مستخدمي الشركة (L-50): الجملة الشارحة تظهر في دعوة زميل وفي «ما الفرق بين الأدوار؟» */
export const COMPANY_ROLES = Object.freeze([
  {
    key: 'company_admin',
    label: 'مدير البوابة',
    plural: 'مديرو البوابة',
    sentence: 'يرسل الطلبات ويرى كل طلبات الشركة، ويوافق على عروض الأسعار، ويدير الفريق والتكاليف الإضافية والذاكرة القانونية.',
  },
  {
    key: 'member',
    label: 'عضو',
    plural: 'الأعضاء',
    sentence: 'يرسل الطلبات ويتابع طلباته والطلبات المشتركة، ويضيف عقودًا وتراخيص ومواعيد إلى الذاكرة القانونية.',
  },
  {
    key: 'viewer',
    label: 'اطلاع فقط',
    plural: 'حسابات الاطلاع فقط',
    sentence: 'يرى الطلبات المشتركة والذاكرة القانونية، دون إرسال أو رد أو موافقة.',
  },
].map((x) => Object.freeze(x)));

/** مَن يرى الطلب داخل الشركة (فريق المكتب يرى الطلب في الحالتين) */
export const VISIBILITIES = Object.freeze([
  { key: 'company', label: 'كل فريق الشركة على البوابة' },
  { key: 'private', label: 'أنا ومديرو البوابة فقط' },
].map((x) => Object.freeze(x)));

/**
 * أنواع عناصر الذاكرة القانونية (U10-59/U10-63). lawyer_fields: الحقول الوحيدة التي قد تصل لمحامٍ مُنح العنصر (L-57)؛
 * «المفوَّضون» لا يُمنحون للمحامين أبدًا (grantable: false). member_writable: يضيفها العضو ويعدّل ما أضافه فقط (B10-39).
 * remind_days: مواعيد التذكير الافتراضية بالأيام قبل الموعد (إعداد b2b_memory_remind_days يغيّرها).
 */
export const MEMORY_KINDS = Object.freeze([
  {
    key: 'contract',
    slug: 'contracts',
    label: 'عقد',
    list_label: 'العقود',
    icon: 'fileSignature',
    default_access: 'all',
    member_writable: true,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'draft', label: 'مسودة' },
      { key: 'under_review', label: 'قيد المراجعة' },
      { key: 'active', label: 'سارٍ' },
      { key: 'expired', label: 'منتهٍ' },
      { key: 'terminated', label: 'مُنهى' },
      { key: 'renewed', label: 'مُجدَّد' },
    ],
    remind_days: [60, 30, 7],
    lawyer_fields: ['our_role', 'contract_kind', 'renewal_type', 'term_months', 'notice_days', 'governing_law', 'signed', 'signed_at', 'key_terms'],
  },
  {
    key: 'template',
    slug: 'templates',
    label: 'نموذج معتمد',
    list_label: 'النماذج المعتمدة',
    icon: 'fileText',
    default_access: 'all',
    member_writable: true,
    grantable: true,
    requires_document: true,
    statuses: [
      { key: 'active', label: 'معتمد' },
      { key: 'retired', label: 'متوقف العمل به' },
    ],
    remind_days: [30, 7],
    lawyer_fields: ['template_kind', 'version', 'approved_at'],
  },
  {
    key: 'licence',
    slug: 'licences',
    label: 'ترخيص أو تصريح',
    list_label: 'التراخيص والتصاريح',
    icon: 'shieldCheck',
    default_access: 'all',
    member_writable: true,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'active', label: 'ساري' },
      { key: 'renewal_in_progress', label: 'قيد التجديد' },
      { key: 'expired', label: 'منتهٍ' },
      { key: 'cancelled', label: 'مُلغى' },
    ],
    remind_days: [90, 30, 7],
    lawyer_fields: ['issuer', 'licence_number'],
  },
  {
    key: 'resolution',
    slug: 'resolutions',
    label: 'قرار مجلس أو جمعية',
    list_label: 'قرارات المجلس والجمعية',
    icon: 'landmark',
    default_access: 'all',
    member_writable: false,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'active', label: 'ساري' },
      { key: 'superseded', label: 'حلّ محله قرار أحدث' },
    ],
    remind_days: [30, 7],
    lawyer_fields: ['body', 'meeting_date', 'subject'],
  },
  {
    key: 'position',
    slug: 'positions',
    label: 'موقف معتمد من الإدارة',
    list_label: 'المواقف المعتمدة',
    icon: 'flag',
    default_access: 'admins',
    member_writable: false,
    grantable: true,
    requires_document: false,
    title_from: 'topic',
    statuses: [
      { key: 'active', label: 'معتمد' },
      { key: 'superseded', label: 'حلّ محله موقف أحدث' },
    ],
    remind_days: [30, 7],
    lawyer_fields: ['topic', 'decision', 'decided_at', 'applies_to'],
  },
  {
    key: 'person',
    slug: 'people',
    label: 'مفوَّض بالتوقيع أو التمثيل',
    list_label: 'المفوَّضون بالتوقيع والتمثيل',
    icon: 'userCog',
    default_access: 'admins',
    member_writable: false,
    grantable: false,
    requires_document: false,
    title_from: 'person_name',
    statuses: [
      { key: 'active', label: 'ساري' },
      { key: 'revoked', label: 'أُلغي التفويض' },
      { key: 'expired', label: 'منتهٍ' },
    ],
    remind_days: [30, 7],
    lawyer_fields: [],
  },
  {
    key: 'policy',
    slug: 'policies',
    label: 'سياسة داخلية',
    list_label: 'السياسات الداخلية',
    icon: 'book',
    default_access: 'all',
    member_writable: false,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'active', label: 'سارية' },
      { key: 'retired', label: 'متوقف العمل بها' },
    ],
    remind_days: [30, 7],
    lawyer_fields: ['policy_kind', 'version', 'approved_at'],
  },
  {
    key: 'dispute',
    slug: 'disputes',
    label: 'نزاع',
    list_label: 'النزاعات',
    icon: 'gavel',
    default_access: 'admins',
    member_writable: false,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'threatened', label: 'محتمل' },
      { key: 'active', label: 'نشط' },
      { key: 'settled', label: 'انتهى بتسوية' },
      { key: 'won', label: 'صدر لصالحنا' },
      { key: 'lost', label: 'صدر ضدنا' },
      { key: 'closed', label: 'منتهٍ' },
    ],
    remind_days: [7, 1],
    lawyer_fields: ['forum', 'our_role', 'stage', 'outcome'],
  },
  {
    key: 'key_date',
    slug: 'key-dates',
    label: 'موعد مهم',
    list_label: 'المواعيد المهمة',
    icon: 'calendarClock',
    default_access: 'all',
    member_writable: true,
    grantable: true,
    requires_document: false,
    statuses: [
      { key: 'active', label: 'قادم' },
      { key: 'done', label: 'تم' },
    ],
    remind_days: [14, 3, 1],
    lawyer_fields: ['recurrence'],
  },
].map((k) => Object.freeze({ ...k, statuses: Object.freeze(k.statuses.map((s) => Object.freeze(s))), remind_days: Object.freeze([...k.remind_days]), lawyer_fields: Object.freeze([...k.lawyer_fields]) })));

export const MEMORY_KIND_KEYS = Object.freeze(MEMORY_KINDS.map((k) => k.key));

/** عناصر الذاكرة التي يضيفها العضو (ويعدّل ما أضافه هو فقط) */
export const MEMBER_MEMORY_KINDS = Object.freeze(MEMORY_KINDS.filter((k) => k.member_writable).map((k) => k.key));

/** مواعيد التذكير المتاحة في نموذج الذاكرة (بالأيام قبل الموعد) */
export const REMIND_DAY_CHOICES = Object.freeze([90, 60, 30, 14, 7, 1]);

const byKey = (list) => Object.freeze(Object.fromEntries(list.map((x) => [x.key, x])));
const TYPE_BY_KEY = byKey(REQUEST_TYPES);
const STAGE_BY_KEY = byKey(STAGES);
const KIND_BY_KEY = byKey(MEMORY_KINDS);
const KIND_BY_SLUG = Object.freeze(Object.fromEntries(MEMORY_KINDS.map((k) => [k.slug, k])));

export function typeByKey(k) {
  return TYPE_BY_KEY[k] || null;
}
export function stageByKey(k) {
  return STAGE_BY_KEY[k] || null;
}
export function memoryKindByKey(k) {
  return KIND_BY_KEY[k] || null;
}
export function memoryKindBySlug(s) {
  return KIND_BY_SLUG[s] || null;
}
/** تسمية حالة عنصر الذاكرة حسب نوعه */
export function memoryStatusLabel(kind, status) {
  return memoryKindByKey(kind)?.statuses.find((s) => s.key === status)?.label || status || '';
}
/** تسمية من قائمة [{key,label}] */
export function labelOf(list, key) {
  return (list || []).find((x) => x.key === key)?.label || key || '';
}
