// الثوابت والمسميات العربية المشتركة بين الخادم والواجهة.
// يُرسل كامل هذا الملف للواجهة عبر GET /api/meta حتى لا تتكرر المسميات في مكانين.

export const LEGAL_AREAS = [
  { code: 'INH', label: 'مواريث وتركات' },
  { code: 'FAM', label: 'أحوال شخصية وأسرة' },
  { code: 'PRP', label: 'عقارات وملكية وإيجارات' },
  { code: 'CIV', label: 'مدني وعقود وتعويضات' },
  { code: 'LAB', label: 'عمل وتأمينات اجتماعية' },
  { code: 'CRM', label: 'جنائي' },
  { code: 'COM', label: 'تجاري وشركات' },
  { code: 'TAX', label: 'ضرائب' },
  { code: 'ADM', label: 'إداري ومنازعات حكومية' },
  { code: 'GEN', label: 'أخرى / عام' },
];
export const AREA_CODES = LEGAL_AREAS.map((a) => a.code);

export const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية',
  'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس',
  'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء',
];

export const LABELS = {
  // مسميات محايدة لا تفترض جنس صاحب الحساب (لا يوجد حقل للجنس)
  user_role: {
    admin: 'إدارة النظام',
    case_manager: 'إدارة الحالات',
    lawyer: 'محامٍ',
  },
  channel: {
    whatsapp: 'واتساب',
    website: 'الموقع الإلكتروني',
    phone: 'مكالمة هاتفية',
    walk_in: 'حضور شخصي',
    email: 'بريد إلكتروني',
  },
  source: {
    facebook_ad: 'إعلان ممول على فيسبوك',
    instagram_ad: 'إعلان ممول على إنستجرام',
    meta_ad: 'إعلان ممول (ميتا)',
    google: 'بحث جوجل',
    direct: 'دخول مباشر',
    referral: 'إحالة من جهة متعاونة',
    social_organic: 'وسائل التواصل (غير ممول)',
    returning: 'عميل سابق',
    other: 'أخرى',
    unknown: 'غير معروف',
  },
  intake_status: {
    new: 'جديد',
    in_review: 'قيد الفرز',
    awaiting_client: 'بانتظار العميل',
    handled_internally: 'تم التعامل داخليًا',
    converted: 'تحوّل إلى ملف',
    archived: 'مؤرشف',
  },
  intake_kind: {
    inquiry: 'استفسار عام',
    consultation: 'استشارة قانونية',
  },
  priority: {
    low: 'منخفضة',
    normal: 'عادية',
    high: 'عالية',
    urgent: 'عاجلة',
  },
  case_status: {
    new: 'جديد — بانتظار الإسناد',
    assigned: 'مُسند إلى محامٍ',
    in_progress: 'قيد الدراسة',
    under_review: 'قيد مراجعة الإدارة',
    approved: 'معتمد — بانتظار الرد على العميل',
    answered: 'تم الرد على العميل',
    closed: 'مغلق',
  },
  case_outcome: {
    answered: 'تم تقديم الاستشارة',
    resolved: 'تم حل المسألة',
    referred_matter: 'تحوّل إلى ملف عمل مستمر',
    client_withdrew: 'انسحب العميل',
    not_eligible: 'خارج نطاق الخدمة',
    duplicate: 'ملف مكرر',
  },
  // الإسناد = ما تكلّف به الإدارة محاميًا في ملف؛ تُستخدم الكلمة نفسها في واجهة الإدارة وبوابة المحامي.
  assignment_role: {
    lead: 'المحامي الأساسي',
    specialist: 'محامٍ متخصص مساعد',
    second_opinion: 'رأي ثانٍ',
    reviewer: 'مراجعة نهائية',
    co_counsel: 'محامٍ مشارك',
  },
  assignment_status: {
    assigned: 'مُسند — لم يُفتح بعد',
    in_progress: 'قيد العمل',
    submitted: 'مقدَّم للإدارة',
    returned: 'معاد للتعديل',
    approved: 'معتمد',
    withdrawn: 'مسحوب',
  },
  fee_mode: {
    agreement: 'حسب اتفاق المحامي',
    custom: 'مبلغ محدد لهذا الإسناد',
    pro_bono: 'تطوعي دون مقابل',
  },
  info_request_kind: {
    information: 'طلب معلومات',
    document: 'طلب مستند',
  },
  info_request_status: {
    pending_admin: 'بانتظار موافقة الإدارة',
    rejected: 'رفضته الإدارة',
    sent_to_client: 'أُرسل للعميل — بانتظار الرد',
    client_replied: 'رد العميل — بانتظار مراجعة الإدارة',
    shared: 'متاح للمحامي',
    cancelled: 'ملغى',
  },
  counsel_kind: {
    second_opinion: 'رأي ثانٍ',
    specialist_input: 'رأي متخصص',
    document_review: 'مراجعة مستند',
    co_counsel: 'مشاركة محامٍ في دراسة المسألة',
  },
  counsel_status: {
    pending_admin: 'بانتظار الإدارة',
    assigned: 'تم الإسناد لمحامٍ',
    completed: 'قُدِّم الرأي',
    rejected: 'رفضته الإدارة',
    cancelled: 'ملغى',
  },
  opinion_status: {
    draft: 'مسودة',
    submitted: 'مقدَّم للإدارة',
    returned: 'معاد للتعديل',
    approved: 'معتمد',
    superseded: 'نسخة سابقة',
  },
  client_answer_status: {
    draft: 'مسودة للعميل',
    sent: 'أُرسل للعميل',
  },
  agreement_type: {
    per_case: 'بالقطعة — مبلغ لكل استشارة معتمدة',
    monthly: 'مبلغ شهري ثابت',
    monthly_quota: 'شهري يشمل عددًا محددًا من الاستشارات + سعر للزيادة',
    package: 'باقة استشارات مدفوعة مسبقًا',
    pro_bono: 'تطوعي بالكامل دون مقابل',
    csr: 'برنامج مسؤولية مجتمعية لمكتب محاماة',
  },
  billable_trigger: {
    on_approval: 'عند اعتماد الإدارة للرأي',
    on_close: 'عند إغلاق الملف',
  },
  treatment: {
    payable: 'مستحق الدفع',
    included_monthly: 'ضمن المبلغ الشهري',
    included_quota: 'ضمن الحصة الشهرية',
    overage: 'زيادة عن الحصة الشهرية',
    package_credit: 'مخصوم من الباقة',
    package_overage: 'بعد نفاد الباقة',
    pro_bono: 'مساهمة تطوعية',
    csr: 'ضمن برنامج المسؤولية المجتمعية',
  },
  ledger_kind: {
    fee: 'أتعاب استشارة',
    overage: 'أتعاب زيادة عن الحصة',
    monthly_fee: 'المبلغ الشهري',
    package_purchase: 'قيمة باقة',
    matter_fee: 'أتعاب ملف عمل مستمر',
    reimbursement: 'استرداد مصروفات',
    adjustment: 'تسوية',
  },
  ledger_status: {
    accrued: 'مستحق — لم يُصرف',
    paid: 'تم الصرف',
    void: 'ملغى',
  },
  matter_kind: {
    litigation: 'تمثيل أمام القضاء',
    ongoing: 'عمل قانوني مستمر',
  },
  matter_status: {
    open: 'مفتوح',
    on_hold: 'معلّق',
    closed: 'مغلق',
  },
  event_kind: {
    hearing: 'جلسة',
    meeting: 'اجتماع',
    expert: 'جلسة خبير',
    appointment: 'موعد إجرائي',
    other: 'موعد آخر',
  },
  event_status: {
    scheduled: 'مجدول',
    done: 'تم',
    postponed: 'مؤجل',
    cancelled: 'ملغى',
  },
  task_status: {
    open: 'مفتوحة',
    done: 'منجزة',
    cancelled: 'ملغاة',
  },
  invoice_status: {
    unpaid: 'غير مسددة',
    partially_paid: 'مسددة جزئيًا',
    paid: 'مسددة',
    cancelled: 'ملغاة',
  },
  expense_paid_by: {
    organization: 'المؤسسة',
    lawyer: 'المحامي (يُسترد)',
    client: 'العميل',
  },
  knowledge_status: {
    pending_review: 'بانتظار المراجعة',
    approved: 'معتمد',
    excluded: 'مستبعد',
  },
  knowledge_usage: {
    none: 'غير مستخدم',
    knowledge: 'للاسترجاع المعرفي فقط',
    knowledge_training: 'للاسترجاع والتدريب وقياس الأداء',
  },
  message_status: {
    received: 'مستلمة',
    queued: 'في قائمة الإرسال',
    sent: 'أُرسلت',
    delivered: 'تم التسليم',
    read: 'تمت القراءة',
    failed: 'فشل الإرسال',
    simulated: 'إرسال تجريبي (محاكاة)',
  },
  ai_field: {
    legal_area: 'التصنيف القانوني',
    title: 'العنوان المقترح',
    summary: 'ملخص الوقائع',
    missing_info: 'المعلومات والمستندات الناقصة',
    issues: 'المسائل القانونية',
    draft: 'المسودة الأولية',
    specialist_needed: 'الحاجة إلى متخصص آخر',
  },
  ai_verdict: {
    accepted: 'صحيح / مقبول',
    corrected: 'صُحِّح',
    rejected: 'مرفوض',
    missed: 'فات الذكاء الاصطناعي',
  },
  automation_rule: {
    hearing_reminder: 'تذكير العميل بموعد يلزم حضوره',
    invoice_reminder: 'تذكير بفاتورة متأخرة السداد',
    document_reminder: 'تذكير العميل بمستند أو معلومة ناقصة',
    procedural_deadline: 'تنبيه بموعد إجرائي يقترب دون تسجيل الإجراء',
    assignment_overdue: 'تنبيه بتجاوز المحامي المدة المطلوبة',
  },
  actor_kind: {
    staff: 'الإدارة',
    lawyer: 'محامٍ',
    client: 'العميل',
    system: 'النظام',
    ai: 'الذكاء الاصطناعي',
  },
};

// القيم المسموح بها لكل حقل (تُستخدم في التحقق من المدخلات)
export const ENUMS = Object.fromEntries(
  Object.entries(LABELS).map(([k, v]) => [k, Object.keys(v)]),
);

// قوالب رسائل العميل: {org_name} يُملأ من إعداد «اسم المؤسسة»، و{event_kind} يأتي بعد «نوع الموعد:»
// حتى لا يتعارض تذكير الصفة مع تأنيث نوع الموعد أو تذكيره (جلسة / اجتماع / موعد آخر).
export const DEFAULT_AUTOMATION_RULES = {
  hearing_reminder: {
    enabled: true,
    params: {
      days_before: 3,
      template:
        'نذكّر حضرتكم بموعد في ملفكم رقم {matter_code} يلزم حضوركم فيه شخصيًا.\nنوع الموعد: {event_kind}\nالتاريخ: {date} الساعة {time}\nالمكان: {location}\nللاستفسار يمكنكم الرد على هذه الرسالة. — {org_name}',
    },
  },
  invoice_reminder: {
    enabled: true,
    params: {
      repeat_every_days: 7,
      max_reminders: 3,
      template:
        'تحية طيبة، نود تذكير حضرتكم بأن الفاتورة رقم {invoice_number} بمبلغ {amount} ج.م استحقت بتاريخ {due_date} ولم تُسدَّد بعد. شكرًا لحضرتكم. — {org_name}',
    },
  },
  document_reminder: {
    enabled: true,
    params: {
      after_days: 2,
      repeat_every_days: 3,
      max_reminders: 2,
      template:
        'تحية طيبة، ما زلنا بانتظار ردكم على طلبنا الخاص بملفكم رقم {case_code}: «{request}». يمكنكم الرد على هذه الرسالة أو من خلال الرابط الخاص بكم. — {org_name}',
    },
  },
  procedural_deadline: {
    enabled: true,
    params: { days_before: 3 },
  },
  assignment_overdue: {
    enabled: true,
    params: {},
  },
};

// القوالب الافتراضية السابقة كما خُزّنت في قواعد البيانات القائمة: إن بقيت دون تعديل من الإدارة
// تُستبدل تلقائيًا بالقالب الافتراضي الحالي (لتصحيح الصياغة واسم المؤسسة الثابت).
export const LEGACY_AUTOMATION_TEMPLATES = {
  hearing_reminder: [
    'نذكّر حضرتكم بأن لديكم {event_kind} في ملفكم رقم {matter_code} يوم {date} الساعة {time} في {location}، ويلزم حضور حضرتكم شخصيًا. للاستفسار يمكنكم الرد على هذه الرسالة. — بيوت مصر',
  ],
  invoice_reminder: [
    'تحية طيبة، نود تذكير حضرتكم بأن الفاتورة رقم {invoice_number} بمبلغ {amount} جنيه استحقت بتاريخ {due_date} ولم تُسدَّد بعد. شكرًا لحضرتكم. — بيوت مصر',
  ],
  document_reminder: [
    'تحية طيبة، ما زلنا بانتظار ردكم على طلبنا الخاص بملفكم رقم {case_code}: «{request}». يمكنكم الرد على هذه الرسالة أو من خلال الرابط الخاص بكم. — بيوت مصر',
  ],
};

export const DEFAULT_SETTINGS = {
  org_name: 'بيوت مصر',
  org_tagline: 'خدمات قانونية موثوقة لكل بيت مصري',
  whatsapp_display_number: '+20 100 000 0000',
  // نافذة الـ 24 ساعة في واتساب: خارجها لا تُرسل إلا رسائل القوالب المعتمدة من ميتا
  whatsapp_template_name: 'case_update',
  whatsapp_template_language: 'ar',
  default_assignment_days: 3,
  similarity_threshold: 0.15,
  privacy_notice:
    'تُستخدم بياناتك فقط لتقديم الخدمة القانونية المطلوبة، ولا يطّلع عليها إلا المختصون في المؤسسة والمحامون بالقدر الضروري لأداء المهمة.',
};

export const CODE_PREFIX = {
  client: 'CL',
  intake: 'REQ',
  matter: 'MTR',
  invoice: 'INV',
};
