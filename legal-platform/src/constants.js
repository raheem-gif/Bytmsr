// الثوابت والمسميات العربية المشتركة بين الخادم والواجهة.
// يُرسل كامل هذا الملف للواجهة عبر GET /api/meta حتى لا تتكرر المسميات في مكانين.

export const LEGAL_AREAS = [
  { code: 'INH', label: 'مواريث وتركات' },
  { code: 'FAM', label: 'أحوال شخصية وأسرة' },
  // v9 (وحدة ai): مجالان أساسيان في عمل المؤسسة مع الأرامل والأيتام
  { code: 'GRD', label: 'الولاية على المال والنيابة الحسبية' },
  { code: 'PEN', label: 'معاشات وتأمينات وتكافل وكرامة' },
  { code: 'PRP', label: 'عقارات وملكية وإيجارات' },
  { code: 'CIV', label: 'مدني وعقود وتعويضات' },
  { code: 'LAB', label: 'عمل ومنازعات عمالية' },
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
    returning: 'مستفيد/ة سابق/ة',
    other: 'أخرى',
    unknown: 'غير معروف',
  },
  intake_status: {
    new: 'جديد',
    in_review: 'قيد الفرز',
    awaiting_client: 'بانتظار المستفيد/ة',
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
    approved: 'معتمد — بانتظار الرد على المستفيد/ة',
    answered: 'تم الرد على المستفيد/ة',
    closed: 'مغلق',
  },
  case_outcome: {
    answered: 'تم تقديم الاستشارة',
    resolved: 'تم حل المسألة',
    referred_matter: 'تحوّل إلى ملف عمل مستمر',
    client_withdrew: 'انسحب المستفيد/ة',
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
    sent_to_client: 'أُرسل للمستفيد/ة — بانتظار الرد',
    client_replied: 'ردّ المستفيد/ة — بانتظار مراجعة الإدارة',
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
    draft: 'مسودة للمستفيد/ة',
    sent: 'أُرسل للمستفيد/ة',
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
    client: 'المستفيد/ة',
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
    reply: 'الردود المقترحة على المستفيد',
    document_analysis: 'تحليل المستندات',
  },
  ai_verdict: {
    accepted: 'صحيح / مقبول',
    corrected: 'صُحِّح',
    rejected: 'مرفوض',
    missed: 'فات الذكاء الاصطناعي',
  },
  automation_rule: {
    hearing_reminder: 'تذكير المستفيد/ة بموعد يلزم حضوره',
    invoice_reminder: 'تذكير بفاتورة متأخرة السداد',
    document_reminder: 'تذكير المستفيد/ة بمستند أو معلومة ناقصة',
    procedural_deadline: 'تنبيه بموعد إجرائي يقترب دون تسجيل الإجراء',
    assignment_overdue: 'تنبيه بتجاوز المحامي المدة المطلوبة',
    satisfaction_survey: 'استبيان رضا المستفيد/ة بعد إرسال الرد',
    portal_otp: 'رمز الدخول إلى صفحة المتابعة',
  },
  actor_kind: {
    staff: 'الإدارة',
    lawyer: 'محامٍ',
    client: 'المستفيد/ة',
    system: 'النظام',
    ai: 'الذكاء الاصطناعي',
  },
  // ── الإصدار 9: كل وحدة تضيف مجموعات تسمياتها تحت علامتها فقط (تعديلات موضعية) ──
  // <labels:platform>
  backup_kind: {
    auto: 'تلقائية (يومية)',
    manual: 'يدوية',
    pre_restore: 'قبل الاستعادة',
  },
  integration_source: {
    env: 'متغيرات البيئة',
    db: 'لوحة الإدارة (مشفرة)',
    default: 'القيمة الافتراضية',
  },
  key_source: {
    env: 'متغير البيئة APP_SECRET',
    file: 'ملف .secret-key في مجلد البيانات',
    ephemeral: 'مفتاح مؤقت (يضيع عند إعادة التشغيل)',
  },
  // أحداث سجل الأمان لوحدة المنصة (الإعداد الأول، النسخ الاحتياطي، التصدير، المهام، التكاملات، سطر الأوامر)
  // تُدمج في security_event أسفل هذا الملف مع بقية مجموعات *_security_event
  platform_security_event: {
    'system.setup_completed': 'اكتمال الإعداد الأول للمنصة',
    'system.setup_token_failed': 'محاولة إعداد أول برمز غير صحيح',
    'system.admin_cli_created': 'إنشاء حساب «إدارة النظام» من سطر أوامر الخادم',
    'system.admin_cli_reset': 'إعادة تعيين حساب «إدارة النظام» من سطر أوامر الخادم',
    'system.restore': 'استعادة قاعدة البيانات من نسخة احتياطية',
    'system.export': 'تصدير كامل لبيانات المنصة',
    'system.job_run': 'تشغيل مهمة دورية يدويًا',
    'backup.created': 'إنشاء نسخة احتياطية',
    'backup.settings_changed': 'تعديل إعدادات النسخ الاحتياطي',
    'backup.downloaded': 'تنزيل نسخة احتياطية',
    'backup.deleted': 'حذف نسخة احتياطية',
    'integration.tested': 'اختبار اتصال تكامل',
  },
  // <labels:accounts>
  security_event: {
    'auth.login': 'تسجيل دخول ناجح',
    'auth.login_failed': 'محاولة دخول فاشلة',
    'auth.lockout': 'إيقاف مؤقت للدخول بعد محاولات فاشلة',
    'auth.rate_limited': 'تجاوز حد محاولات الدخول',
    'auth.logout': 'تسجيل خروج',
    'auth.2fa_failed': 'رمز تحقق بخطوتين غير صحيح',
    'auth.2fa_recovery_used': 'دخول برمز استرداد',
    'auth.session_revoked': 'إنهاء جلسة',
    'auth.sessions_revoked': 'إنهاء جلسات متعددة',
    'account.password_changed': 'تغيير كلمة المرور',
    'account.password_reset_link': 'إصدار رابط إعادة تعيين كلمة المرور',
    'account.password_reset': 'إعادة تعيين كلمة المرور عبر الرابط',
    'account.temp_password_set': 'تعيين كلمة مرور مؤقتة',
    'account.2fa_enabled': 'تفعيل التحقق بخطوتين',
    'account.2fa_disabled': 'إلغاء التحقق بخطوتين',
    'account.2fa_reset_by_admin': 'إلغاء التحقق بخطوتين بواسطة الإدارة',
    'account.recovery_codes_regenerated': 'إصدار رموز استرداد جديدة',
    'account.invite_created': 'إنشاء دعوة حساب',
    'account.invite_resent': 'إعادة إصدار دعوة',
    'account.invite_revoked': 'إلغاء دعوة',
    'account.invite_accepted': 'قبول دعوة وتفعيل الحساب',
    'account.profile_updated': 'تعديل بيانات الحساب',
    'account.unlocked': 'رفع الإيقاف المؤقت عن الحساب',
    'user.created': 'إنشاء مستخدم',
    'user.activated': 'تفعيل حساب',
    'user.deactivated': 'إيقاف حساب',
    'user.role_changed': 'تغيير الدور والصلاحيات',
    'user.updated': 'تعديل بيانات مستخدم',
    'portal.link_issued': 'إصدار رابط صفحة متابعة',
    'portal.revoked': 'إلغاء روابط صفحة متابعة',
    'settings.updated': 'تعديل الإعدادات',
    'integration.updated': 'تعديل إعدادات تكامل',
    'security.policy_updated': 'تعديل سياسة الأمان',
    'audit.exported': 'تصدير سجل الأمان',
    // وحدة programs: البرامج والتمويل والمستندات المطبوعة
    'program.created': 'إنشاء برنامج تمويل',
    'program.updated': 'تعديل برنامج تمويل',
    'program.closed': 'إغلاق برنامج تمويل',
    'program.reopened': 'إعادة فتح برنامج تمويل',
    'program.deleted': 'حذف برنامج تمويل',
    'print.document': 'طباعة مستند',
    'print.denied': 'محاولة طباعة مستند غير مسموح به',
  },
  security_severity: {
    info: 'معلومة',
    warning: 'تحذير',
    critical: 'حرج',
  },
  account_token_kind: {
    invite: 'دعوة حساب جديد',
    reset: 'إعادة تعيين كلمة المرور',
  },
  account_state: {
    active: 'نشط',
    invite_pending: 'بانتظار قبول الدعوة',
    locked: 'موقوف مؤقتًا',
    must_change: 'يلزمه تغيير كلمة المرور',
    inactive: 'موقوف',
  },
  auth_method: {
    password_only: 'كلمة المرور',
    totp: 'كلمة المرور + رمز التحقق',
    recovery: 'كلمة المرور + رمز استرداد',
    invite: 'قبول دعوة',
  },
  // <labels:messaging>
  quick_reply_category: {
    documents: 'المستندات المطلوبة',
    procedures: 'الإجراءات والخطوات',
    appointments: 'المواعيد والعنوان',
    portal: 'صفحات متابعة المستفيدين',
    greeting: 'الترحيب والختام',
    general: 'عام',
  },
  // المتغيرات المتاحة في نص الرد الجاهز
  quick_reply_variable: {
    client_name: 'اسم المستفيد',
    case_code: 'كود الملف',
    request_code: 'رقم الطلب',
    org_name: 'اسم المؤسسة',
  },
  wa_template_status: {
    APPROVED: 'معتمد',
    PENDING: 'قيد مراجعة ميتا',
    REJECTED: 'مرفوض',
    PAUSED: 'موقوف مؤقتًا',
    DISABLED: 'معطّل',
    IN_APPEAL: 'قيد التظلم',
    PENDING_DELETION: 'بانتظار الحذف',
    DELETED: 'محذوف',
    LIMIT_EXCEEDED: 'تجاوز الحد',
  },
  wa_template_category: {
    UTILITY: 'خدمي',
    MARKETING: 'تسويقي',
    AUTHENTICATION: 'مصادقة',
  },
  // أغراض ربط القوالب: ماذا تُرسل المنصة بكل قالب خارج نافذة الـ 24 ساعة
  wa_template_purpose: {
    case_update: 'تحديثات الملف والردود خارج نافذة الـ 24 ساعة',
    otp: 'رمز الدخول إلى صفحة المتابعة',
    survey: 'استبيان رضا المستفيدين',
    'rule:hearing_reminder': 'قاعدة: تذكير المستفيد/ة بموعد يلزم حضوره',
    'rule:invoice_reminder': 'قاعدة: تذكير بفاتورة متأخرة السداد',
    'rule:document_reminder': 'قاعدة: تذكير المستفيد/ة بمستند أو معلومة ناقصة',
  },
  // ما يمكن وضعه في متغيرات القالب {{1}}…{{n}}
  wa_template_variable: {
    body: 'نص الرسالة كاملًا',
    client_name: 'اسم المستفيد',
    org_name: 'اسم المؤسسة',
    case_code: 'كود الملف',
    matter_code: 'كود الملف المستمر',
    request_code: 'رقم الطلب',
    code: 'رمز الدخول',
    event_kind: 'نوع الموعد',
    date: 'التاريخ',
    time: 'الساعة',
    location: 'المكان',
    title: 'عنوان الموعد',
    invoice_number: 'رقم الفاتورة',
    amount: 'المبلغ المتبقي',
    due_date: 'تاريخ الاستحقاق',
    request: 'نص الطلب الموجه للمستفيد/ة',
  },
  survey_status: {
    sent: 'أُرسل — بانتظار التقييم',
    awaiting_comment: 'قيّم المستفيد/ة الخدمة — بانتظار التعليق',
    answered: 'تم التقييم',
    expired: 'انتهت مدته دون رد',
  },
  satisfaction_rating: {
    5: 'ممتاز',
    4: 'جيد جدًا',
    3: 'جيد',
    2: 'مقبول',
    1: 'غير راضٍ',
  },
  // أحداث سجل الأمان الخاصة بدخول بوابة العملاء برمز واتساب
  messaging_security_event: {
    'portal.otp_requested': 'طلب رمز الدخول إلى صفحة المتابعة',
    'portal.otp_login': 'الدخول إلى صفحة المتابعة برمز واتساب',
    'portal.otp_failed': 'رمز دخول بوابة غير صحيح',
    'portal.otp_locked': 'إيقاف رمز دخول بعد محاولات فاشلة',
    'portal.otp_rate_limited': 'تجاوز حد طلبات رمز الدخول',
    'whatsapp.templates_synced': 'مزامنة قوالب واتساب',
    'whatsapp.template_mapped': 'ربط قالب واتساب بغرض',
    'document.sent_to_client': 'إرسال مستند للمستفيد/ة',
  },
  // <labels:practice>
  // بطاقة المستفيد (البحث الاجتماعي) — لا تظهر للمحامين إطلاقًا
  beneficiary_relation: {
    widow: 'أرملة',
    orphan_guardian: 'وصي أو كافل أيتام',
    divorced: 'مطلقة معيلة',
    wife: 'زوجة',
    other: 'أخرى',
  },
  income_band: {
    none: 'بلا دخل ثابت',
    lt_2000: 'أقل من 2,000 ج.م شهريًا',
    '2000_4000': 'من 2,000 إلى 4,000 ج.م شهريًا',
    '4000_7000': 'من 4,000 إلى 7,000 ج.م شهريًا',
    gt_7000: 'أكثر من 7,000 ج.م شهريًا',
  },
  housing: {
    owned: 'سكن مملوك',
    rented_old: 'إيجار قديم',
    rented_new: 'إيجار جديد',
    family: 'إقامة لدى الأسرة',
    none: 'بلا سكن مستقر',
  },
  employment: {
    none: 'بلا عمل',
    irregular: 'عمل غير منتظم أو باليومية',
    employed: 'عمل منتظم بأجر',
    pension: 'معاش أو دعم نقدي فقط',
    other: 'أخرى',
  },
  child_gender: { m: 'ذكر', f: 'أنثى' },
  beneficiary_source: {
    staff: 'أدخلته الإدارة',
    self_reported: 'ذكره مقدم الطلب ولم يُتحقق منه',
    import: 'مستورد من ملف',
  },
  vulnerability_level: {
    severe: 'احتياج شديد',
    high: 'احتياج مرتفع',
    medium: 'احتياج متوسط',
    low: 'احتياج محدود',
  },
  // قيمة الحقوق المستردة عند إغلاق الملف (لتقرير الأثر)
  outcome_kind: {
    inheritance_share: 'نصيب في ميراث',
    alimony_judgment: 'حكم نفقة',
    custody: 'حضانة أو رؤية',
    pension: 'معاش أو تكافل وكرامة',
    document_issued: 'استخراج مستند رسمي',
    settlement: 'تسوية ودية',
    advice_only: 'استشارة دون أثر مالي مباشر',
    other: 'أخرى',
  },
  // أطراف الملف وفحص تعارض المصالح
  party_role: {
    opponent: 'خصم',
    related: 'طرف ذو صلة',
    witness: 'شاهد',
  },
  conflict_level: {
    high: 'تعارض محتمل',
    review: 'يحتاج مراجعة',
    info: 'للعلم',
  },
  conflict_match: {
    national_id: 'تطابق الرقم القومي',
    exact: 'تطابق الاسم',
    partial: 'تشابه في الاسم',
  },
  // التقويم
  calendar_type: {
    event: 'الجلسات والمواعيد',
    task: 'المواعيد الإجرائية والمهام',
    assignment: 'مواعيد تسليم الإسنادات',
    invoice: 'استحقاق الفواتير',
  },
  // الاستيراد والتصدير
  data_entity: {
    clients: 'العملاء والمستفيدون',
    intakes: 'الطلبات الواردة',
    cases: 'ملفات الاستشارات',
    matters: 'الملفات المستمرة',
    lawyers: 'المحامون',
    ledger: 'دفتر مستحقات المحامين',
  },
  // مسميات أحداث سجل الأمان لهذه الوحدة (تُدمج في security_event عند تحميل الخدمة دون تعديل كتلة وحدة الحسابات)
  practice_security_event: {
    'data.exported': 'تصدير بيانات بصيغة CSV',
    'data.imported': 'استيراد بيانات من ملف CSV',
    'impact.exported': 'تصدير تقرير الأثر',
    'calendar.feed_issued': 'إصدار رابط اشتراك التقويم',
    'calendar.feed_revoked': 'إلغاء رابط اشتراك التقويم',
  },
  // <labels:ai>
  // وظائف الذكاء الاصطناعي (لسجل الاستهلاك والتكلفة)
  ai_feature: {
    intake_analysis: 'تحليل الطلبات الواردة وتصنيفها',
    issues: 'اقتراح المسائل القانونية',
    draft: 'مسودة أولية للمحامي',
    client_version: 'صياغة نسخة الرد للمستفيد',
    reply: 'الردود المقترحة على المستفيد',
    document_analysis: 'تحليل المستندات',
    connection_test: 'اختبار الاتصال',
  },
  ai_provider: {
    anthropic: 'Claude (Anthropic)',
    heuristic: 'المحلل المحلي (بدون إنترنت)',
  },
  ai_mode: {
    auto: 'تلقائي (Claude عند ضبط المفتاح)',
    anthropic: 'Claude دائمًا',
    heuristic: 'المحلل المحلي فقط',
  },
  ai_effort: {
    low: 'منخفض (أسرع وأقل تكلفة)',
    medium: 'متوسط (موصى به)',
    high: 'مرتفع',
    xhigh: 'مرتفع جدًا',
    max: 'أقصى جهد',
  },
  ai_reply_intent: {
    answer: 'إجابة أو إفادة بالمستجدات',
    ask_documents: 'طلب مستندات أو معلومات ناقصة',
    reassure: 'طمأنة ومتابعة',
    schedule: 'تحديد موعد أو تذكير به',
  },
  ai_reply_tone: {
    formal: 'رسمي',
    warm: 'ودود',
    brief: 'مختصر',
  },
  ai_doc_type: {
    inheritance_declaration: 'إعلام وراثة',
    lease_contract: 'عقد إيجار',
    sale_contract: 'عقد بيع أو شراء',
    court_judgment: 'حكم قضائي',
    death_certificate: 'شهادة وفاة',
    national_id: 'بطاقة رقم قومي',
    marriage_divorce: 'قسيمة زواج أو طلاق',
    birth_certificate: 'شهادة ميلاد',
    guardianship_order: 'قرار وصاية أو ولاية على المال',
    pension_document: 'مستند معاش أو تأمينات',
    other: 'مستند آخر',
  },
  ai_fact_kind: {
    name: 'اسم',
    date: 'تاريخ',
    number: 'رقم',
    court: 'جهة أو محكمة',
    party: 'طرف',
    amount: 'مبلغ',
    other: 'معلومة',
  },
  ai_red_flag: {
    expired: 'منتهي الصلاحية',
    illegible: 'غير واضح',
    missing_pages: 'صفحات ناقصة',
    inconsistent: 'بيانات متعارضة',
    unverified: 'يحتاج إلى تحقق',
    other: 'ملاحظة',
  },
  // تُضاف إلى security_event عند تحميل خدمة الذكاء الاصطناعي (src/ai/index.js)
  ai_security_event: {
    'ai.connection_test': 'اختبار الاتصال بخدمة Claude',
    'ai.budget_exceeded': 'تجاوز إنفاق الذكاء الاصطناعي السقف الشهري',
  },
  // <labels:site>
  // <labels:programs>
  program_status: {
    planned: 'لم يبدأ بعد',
    active: 'نشط',
    suspended: 'موقوف مؤقتًا',
    closed: 'مغلق',
  },
  funder_type: {
    grant: 'منحة',
    zakat: 'زكاة (نماء)',
    csr: 'شراكة مسؤولية مجتمعية',
    donor: 'تبرعات ومتبرعون',
    internal: 'موارد ذاتية للمؤسسة',
  },
  program_forecast: {
    on_track: 'الإنفاق متوازن مع مدة البرنامج',
    underspend: 'الإنفاق أبطأ من المتوقع',
    overspend_risk: 'يُتوقع تجاوز الميزانية قبل نهاية المدة',
    exhausted: 'استُنفدت الميزانية',
    not_started: 'لم يبدأ البرنامج بعد',
    no_budget: 'بلا ميزانية محددة',
  },
  program_spend_kind: {
    lawyer_fees: 'أتعاب المحامين',
    reimbursements: 'استرداد مصروفات المحامين',
    expenses: 'مصروفات دفعتها المؤسسة',
  },
  print_kind: {
    invoice: 'فاتورة',
    receipt: 'إيصال استلام',
    answer: 'إفادة قانونية',
    statement: 'كشف حساب محامٍ',
    'case-summary': 'ملخص ملف (داخلي)',
    programme: 'تقرير برنامج',
  },
};

// مسميات أحداث سجل الأمان التي تعرّفها كل وحدة في مجموعتها (platform_security_event، messaging_security_event، …)
// تُدمج هنا في security_event فتتوفر لصفحة «سجل الأمان» وتصدير CSV أيًا كانت الخدمات المحمّلة
// (التسمية الموجودة في security_event تتقدم). test/v9-integration.test.js يتحقق أن لكل نوع يُسجَّل تسمية.
for (const [group, labels] of Object.entries(LABELS)) {
  if (group === 'security_event' || !group.endsWith('_security_event')) continue;
  for (const [k, val] of Object.entries(labels)) if (!LABELS.security_event[k]) LABELS.security_event[k] = val;
}

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
  // (الإصدار 9 — وحدة messaging) يُرسل بعد إرسال الرد النهائي للعميل بعدد الساعات المحدد، مرة واحدة لكل ملف.
  // داخل نافذة واتساب: أزرار «ممتاز / جيد / غير راضٍ»؛ وخارجها القالب المربوط أو هذا النص (الرد برقم من 1 إلى 5).
  satisfaction_survey: {
    enabled: true,
    params: {
      after_hours: 24,
      expire_days: 7,
      template:
        'تحية طيبة، نرجو أن يكون ردنا في ملفكم رقم {case_code} قد أفادكم. يسعدنا تقييمكم لخدمة {org_name} بإرسال رقم من 1 إلى 5 (5 = ممتاز، 1 = غير راضٍ). رأيكم يساعدنا على خدمة الأسر بصورة أفضل.',
    },
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
  org_name: 'مؤسسة بيوت مصر',
  org_tagline: 'دعم قانوني يصون حقوق الأرامل والأيتام وأسرهم',
  // رقم واتساب المؤسسة كما يظهر للمستفيدين. فارغ حتى تضبطه الإدارة (معالج الإعداد أو «التكاملات» أو الإعدادات)؛
  // ما دام فارغًا لا تظهر أزرار واتساب ولا روابط wa.me في الموقع والبوابة، ويظهر الهاتف بديلًا.
  whatsapp_display_number: '',
  // نافذة الـ 24 ساعة في واتساب: خارجها لا تُرسل إلا رسائل القوالب المعتمدة من ميتا
  whatsapp_template_name: 'case_update',
  whatsapp_template_language: 'ar',
  default_assignment_days: 3,
  similarity_threshold: 0.15,
  privacy_notice:
    'تُستخدم بياناتك فقط لتقديم الخدمة القانونية المطلوبة، ولا يطّلع عليها إلا المختصون في المؤسسة والمحامون بالقدر الضروري لأداء المهمة.',
  // ── الإصدار 9: كل وحدة تضيف إعداداتها تحت علامتها فقط (تعديلات موضعية) ──
  // <settings:platform>
  // ملف المؤسسة (يُضبط في معالج الإعداد الأول ويظهر في الموقع والمراسلات)
  org_legal_name: 'مؤسسة بيوت مصر لدعم الأرامل والأيتام',
  org_registration: 'مشهرة برقم 11108 لسنة 2020 — وزارة التضامن الاجتماعي',
  org_phone: '01211114662',
  org_address: '44 شارع المحكمة العسكرية، بجوار مدرسة الزهراء، الحي العاشر، مدينة نصر، القاهرة',
  org_facebook_url: 'https://www.facebook.com/Beyootmisr/',
  // النسخ الاحتياطي اليومي (VACUUM INTO) وعدد النسخ المحتفظ بها
  backup_enabled: true,
  backup_retention: 14,
  // <settings:accounts>
  // إلزام حسابات «إدارة النظام» بالتحقق بخطوتين (من لم يفعّله يُطلب منه ذلك فور الدخول)
  security_require_2fa_admins: false,
  // إنهاء الجلسة بعد عدم النشاط (ساعات)، والحد الأقصى لعمر الجلسة (ساعات)
  session_idle_hours: 12,
  session_max_hours: 72,
  // صلاحية روابط الدعوة وإعادة التعيين (ساعات)
  invite_valid_hours: 72,
  reset_valid_hours: 24,
  // مدة الاحتفاظ بأحداث سجل الأمان العادية (الأحداث الحرجة والتحذيرات تُحفظ ضعف المدة)
  security_audit_retention_days: 365,
  // اسم الجهة الظاهر في تطبيق المصادقة (حروف لاتينية لضمان التوافق مع كل التطبيقات)
  security_totp_issuer: 'Beyoot Misr',
  // <settings:messaging>
  // دخول بوابة العملاء برمز يصل عبر واتساب على صفحة /portal
  portal_otp_enabled: true,
  // التقييم الذي يساويه أو يقل عنه يُنبَّه مدير الحالة فورًا (من 1 إلى 5)
  survey_low_rating_threshold: 2,
  // <settings:practice>
  // مستوى الخدمة: المدة القصوى (ساعات) لأول رد من الإدارة على طلب وارد عبر واتساب أو الموقع
  sla_first_response_hours: 4,
  // تنبيه الإدارة (مرة واحدة لكل طلب) عند تجاوز مهلة أول رد
  sla_alerts_enabled: true,
  // <settings:ai>
  // <settings:site>
  // الموقع العام: اسم البرنامج وبيانات التواصل الإضافية. الاسم الرسمي والإشهار والعنوان والهاتف وفيسبوك
  // في «ملف المؤسسة» أعلاه (org_legal_name, org_registration, org_address, org_phone, org_facebook_url).
  site_program_name: 'الدعم القانوني',
  org_email: '',
  org_instagram_url: '',
  office_hours: 'من السبت إلى الخميس، من العاشرة صباحًا حتى الرابعة عصرًا',
  // <settings:programs>
  // عتبات تنبيه استهلاك ميزانية البرامج (نسب مئوية؛ يُرسل كل تنبيه مرة واحدة لكل برنامج)
  program_alert_thresholds: [80, 100],
  // ملاحظة تُطبع أسفل فواتير العملاء، وتنبيه يُطبع أسفل الإفادات القانونية
  print_invoice_note: 'يُرجى ذكر رقم الفاتورة عند السداد، وطلب إيصال استلام رسمي مختوم بخاتم المؤسسة.',
  print_answer_disclaimer:
    'هذه الإفادة مبنية على الوقائع والمستندات التي قدمها صاحب الشأن حتى تاريخها، وتُقدَّم دون مقابل ضمن برنامج الدعم القانوني، ولا تُعد توكيلًا بالحضور أمام أي جهة.',
};

export const CODE_PREFIX = {
  client: 'CL',
  intake: 'REQ',
  matter: 'MTR',
  invoice: 'INV',
};
