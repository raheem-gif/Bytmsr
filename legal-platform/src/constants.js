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
    company_portal: 'بوابة الشركة', // v10 b2b-server
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
    // v9.1 l-work: طلبات المحامي للإدارة وحدها (لا تُرسل للمستفيد/ة)
    extension: 'طلب مهلة',
    admin_question: 'سؤال للإدارة',
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
    track: 'نوع الطلب المقترح', // v9.2: ماذا يصير الطلب (استشارة / قضية / رد الإدارة / توجيه / نسألها الأول)
    // v10 b2b-server: فرز طلبات الشركات
    company_type: 'نوع طلب الشركة',
    urgency: 'درجة الاستعجال',
    scope: 'داخل الباقة أو خارجها',
    effort: 'حجم العمل المتوقع',
    segment: 'نوع الخدمة', // v11 segment-server: اقتراح «خيري / أفراد وشركات» (لا يُطبَّق تلقائيًا أبدًا)
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
    // v9.1 l-court
    hearing_outcome_missing: 'تنبيه المحامي بجلسة انعقدت دون تسجيل نتيجتها',
    // v9.1 l-home (رسائل واتساب للمحامين في صندوق الصادر؛ ليست قاعدة أتمتة قابلة للتعديل)
    lawyer_alert: 'تنبيه للمحامي على واتساب (بلا بيانات مستفيدين)',
    // v9.1 b-site (B91-01): الرد الآلي بعد أن تؤكد المستفيدة رقمها برسالة واتساب فيها رقم الطلب وكود التأكيد
    identity_confirm: 'رد تأكيد رقم المستفيد/ة على واتساب',
    // v9.2 — رسائل آلية ثابتة لقصص واتساب (متوقفة افتراضيًا؛ تُفعَّل من الإعدادات ← القصص الواردة على واتساب)
    story_welcome: 'ترحيب وقائمة المواضيع على واتساب',
    story_topic_nudge: 'طلب الحكاية بعد اختيار الموضوع',
    story_ack: 'تأكيد وصول الحكاية ورقم الطلب',
    // v11 segment-server: أزرار نوع الخدمة على الرقم المشترك وتأكيد الاختيار
    segment_choice: 'سؤال نوع الخدمة على الرقم المشترك',
    segment_chosen: 'تأكيد اختيار نوع الخدمة',
  },
  actor_kind: {
    staff: 'الإدارة',
    lawyer: 'محامٍ',
    client: 'المستفيد/ة',
    system: 'النظام',
    ai: 'الذكاء الاصطناعي',
    company: 'الشركة', // v10 b2b-server: مستخدم بوابة شركة عميلة (لا معرّف مستخدم في السجل، L-19)
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
    'brand.colors_updated': 'تعديل ألوان المؤسسة',
    'brand.colors_reset': 'إرجاع ألوان المؤسسة الأصلية',
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
    'account.push_enabled': 'تفعيل تنبيهات الجهاز للمحامي', // v9.1 l-home
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
    // v9.1 l-home: تنبيهات المحامين على واتساب (L-06) — قالب مستقل لا يُستخدم لغيرهم
    lawyer_alert: 'تنبيهات المحامين (بلا بيانات مستفيدين)',
    // v9.1 b-site (B91-01): قالب بلا أي تفاصيل («في جديد في طلبك… صفحة طلبك: الرابط»، بصيغة محايدة) حين لا يوجد قالب مربوط بالغرض
    portal_update: 'تنبيه بجديد في صفحة المتابعة (بلا تفاصيل) خارج نافذة الـ 24 ساعة',
    // v11 segment-server [r2 S15]: قوالب الأفراد والشركات (اختيارية؛ بلا ربط ← قالب «تنبيه بجديد» المحايد)
    'case_update@paid': 'تحديثات الملف والردود خارج نافذة الـ 24 ساعة — الأفراد والشركات',
    'portal_update@paid': 'تنبيه بجديد في صفحة المتابعة (بلا تفاصيل) — الأفراد والشركات',
    'survey@paid': 'استبيان رضا العملاء — الأفراد والشركات',
    'rule:hearing_reminder@paid': 'قاعدة: تذكير بموعد يلزم حضوره — الأفراد والشركات',
    'rule:document_reminder@paid': 'قاعدة: تذكير بمستند أو معلومة ناقصة — الأفراد والشركات',
    'rule:invoice_reminder@paid': 'قاعدة: تذكير بفاتورة متأخرة السداد — الأفراد والشركات',
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
    // v9.1 b-site (B91-10)
    first_name: 'اسم المخاطبة (بالكنية مثل «أم محمد»)',
    ref: 'رقم الطلب (REQ)',
    portal_link: 'رابط صفحة المتابعة',
    time_spoken: 'الساعة كما تُقال («10 الصبح»)',
    description: 'سبب المبلغ (وصف الفاتورة)',
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
    company_triage: 'فرز طلبات الشركات', // v10 b2b-server
    company_deliverable: 'ملخص تسليم لشركة', // v10 b2b-server
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
    // v10 b2b-server: مستندات الشركات
    commercial_contract: 'عقد تجاري',
    nda: 'اتفاقية سرية',
    employment_contract: 'عقد عمل',
    legal_notice: 'إنذار أو مطالبة',
    corporate_document: 'مستند شركة (نظام أساسي، قرار، سجل)',
    licence_permit: 'ترخيص أو تصريح',
    marketing_material: 'مادة إعلانية',
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
    'ai.story_accepted': 'اعتماد الإدارة لاقتراح الذكاء الاصطناعي في طلب وارد', // v9.2
  },
  // <labels:v92-stories> — القصص الواردة: حالة القصة، المسار المقترح، نصوص الرسائل الصوتية، محاولات الاتصال
  story_state: { collecting: 'القصة لسه بتتكتب', ready: 'جاهزة للقرار' },
  story_view: {
    callback: 'طلبت مكالمة',
    collecting: 'القصة لسه بتتكتب',
    blocked: 'فيها رسالة صوتية لم تُكتب',
    stale: 'وصل جديد بعد الملخص',
    ready: 'جاهزة للقرار',
    awaiting: 'بانتظار ردها',
    decided: 'تم القرار',
  },
  story_ready_via: { quiet: 'بعد فترة بلا رسائل', client_done: 'كتبت «خلاص»', website: 'من نموذج الموقع', staff_entry: 'سجلتها الإدارة', staff_now: 'بطلب من الإدارة' },
  story_track: { consultation: 'استشارة', matter: 'قضية / ملف مستمر', internal: 'ترد الإدارة', refer: 'توجيه لجهة أخرى', need_info: 'نسألها الأول' },
  story_track_long: {
    consultation: 'ملف استشارة — يكتب فيه محامٍ رأيًا',
    matter: 'ملف مستمر — قضية أمام المحكمة أو عمل قانوني مستمر',
    internal: 'ترد الإدارة بنفسها بمعلومة أو توجيه',
    refer: 'خارج نطاقنا — نوجّهها لجهة مناسبة',
    need_info: 'محتاجين نسألها قبل القرار',
  },
  story_track_action: { consultation: 'اعمله استشارة', matter: 'افتح ملف قضية', internal: 'رد وأغلق الطلب', refer: 'وجّه وأغلق الطلب', need_info: 'اسألها' },
  voice_status: { pending: 'لم تُكتب بعد', confirmed: 'مكتوبة', unclear: 'غير مفهومة' },
  resolution_kind: { answered: 'رد بمعلومة أو توجيه', referral: 'توجيه لجهة أخرى', unreachable: 'تعذّر الوصول إليها' },
  call_outcome: { no_answer: 'لم ترد', busy: 'مشغول', wrong_number: 'رقم خطأ', someone_else: 'ردّ شخص آخر' },
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
  // v9.1 l-court — <labels:v91> نتيجة الجلسة كما يسجلها المحامي من ممر المحكمة (L-02)
  event_outcome: {
    adjourned: 'تأجّلت',
    reserved: 'حُجزت للحكم',
    judgment: 'صدر الحكم',
    not_held: 'لم تُنظر',
  },
  // سبب التأجيل (adjourned) أو سبب عدم نظر الجلسة (not_held) — يُكتب بعد «تأجّلت لجلسة {التاريخ} —»
  event_outcome_reason: {
    review: 'للاطلاع',
    documents: 'لتقديم مستندات',
    notice: 'للإعلان',
    pleading: 'للمرافعة',
    expert: 'للخبير',
    administrative: 'إداريًا',
    struck: 'شُطبت',
    no_session: 'لم تنعقد',
    other: 'سبب آخر',
  },
  // <labels:v10-b2b> — خدمة الشركات (الإدارة القانونية الخارجية). تسميات فريق المكتب؛ نصوص البوابة في كتالوج الشركات وwords.js
  company_status: {
    trial: 'فترة تجريبية',
    active: 'نشطة',
    past_due: 'متأخرة السداد',
    suspended: 'موقوفة (اطلاع فقط)',
    ended: 'انتهى الاشتراك',
  },
  // L-50: دور الشركة الأعلى «مدير البوابة»؛ «مدير العلاقة» هو موظف المكتب المسؤول عن الشركة
  company_user_role: {
    company_admin: 'مدير البوابة',
    member: 'عضو',
    viewer: 'اطلاع فقط',
  },
  company_user_state: {
    active: 'نشط',
    invite_pending: 'دعوة لم تُقبل بعد',
    locked: 'مقفل مؤقتًا',
    inactive: 'موقوف',
  },
  company_request_type: {
    contract_review: 'مراجعة عقد قبل التوقيع',
    contract_drafting: 'إعداد عقد',
    nda: 'اتفاقية سرية (NDA)',
    employment: 'مسألة عمالية / موظف',
    marketing_review: 'مراجعة حملة تسويقية',
    legal_notice: 'إنذار أو مطالبة وصلت للشركة',
    board_resolution: 'قرار مجلس إدارة / جمعية',
    supplier_issue: 'مشكلة مع مورد',
    compliance_question: 'سؤال امتثال',
    renewal_followup: 'متابعة تجديد عقد أو ترخيص',
    dispute: 'بدء نزاع',
    other: 'طلب آخر',
  },
  company_request_status: {
    submitted: 'جديد — بانتظار الفرز',
    awaiting_company: 'بانتظار الشركة',
    in_progress: 'جارٍ العمل',
    delivered: 'سُلِّم — بانتظار اعتماد الشركة',
    closed: 'مغلق',
    declined: 'اعتذرنا عنه',
    cancelled: 'ألغته الشركة',
  },
  company_waiting_on: {
    info: 'معلومة أو مستند من الشركة',
    quote: 'موافقة الشركة على عرض سعر',
    overage: 'موافقة الشركة على تكلفة إضافية',
  },
  // مراحل الطلب كما تراها الشركة (نفس STAGES في public/assets/js/lib/company-catalog.js)
  company_stage: {
    received: 'قيد الدراسة',
    needs_you: 'بانتظار ردكم',
    approval: 'بانتظار موافقتكم',
    working: 'جارٍ العمل',
    final_review: 'مراجعة نهائية',
    delivered: 'تم التسليم — بانتظار اعتمادكم',
    closed: 'مكتمل',
    declined: 'اعتذرنا عن الطلب',
    cancelled: 'ملغى',
  },
  company_quote_status: {
    sent: 'بانتظار الموافقة',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
    expired: 'انتهت صلاحيته',
    withdrawn: 'سُحب',
  },
  company_quote_kind: {
    out_of_scope: 'عمل خارج الباقة',
    overage: 'طلب إضافي فوق الباقة',
  },
  company_quote_basis: {
    fixed: 'مبلغ ثابت',
    capped: 'بحد أقصى',
  },
  company_deliverable_kind: {
    memo: 'مذكرة رأي قانوني',
    reviewed_contract: 'عقد مُراجَع بالملاحظات',
    draft_document: 'مستند مُعَد',
    letter: 'خطاب أو رد على إنذار',
    resolution: 'نموذج قرار',
    checklist: 'قائمة إجراءات',
    other: 'تسليم آخر',
  },
  company_deliverable_status: {
    draft: 'مسودة',
    released: 'أُرسل للشركة',
    withdrawn: 'سُحب',
  },
  company_memory_kind: {
    contract: 'عقد',
    template: 'نموذج معتمد',
    licence: 'ترخيص أو تصريح',
    resolution: 'قرار مجلس أو جمعية',
    position: 'موقف معتمد من الإدارة',
    person: 'مفوَّض بالتوقيع أو التمثيل',
    policy: 'سياسة داخلية',
    dispute: 'نزاع',
    key_date: 'موعد مهم',
  },
  // حالات عناصر الذاكرة (اتحاد حالات كل الأنواع؛ التسمية حسب النوع في الكتالوج)
  company_memory_status: {
    draft: 'مسودة',
    under_review: 'قيد المراجعة',
    active: 'سارٍ',
    expired: 'منتهٍ',
    terminated: 'مُنهى',
    renewed: 'مُجدَّد',
    retired: 'متوقف العمل به',
    renewal_in_progress: 'قيد التجديد',
    cancelled: 'مُلغى',
    superseded: 'حلّ محله أحدث',
    revoked: 'أُلغي',
    threatened: 'محتمل',
    settled: 'انتهى بتسوية',
    won: 'صدر لصالح الشركة',
    lost: 'صدر ضد الشركة',
    closed: 'منتهٍ',
    done: 'تم',
  },
  company_memory_access: {
    all: 'كل فريق الشركة',
    admins: 'مديرو البوابة فقط',
  },
  company_entity_relation: {
    parent: 'الشركة الأم',
    subsidiary: 'تابعة',
    affiliate: 'شقيقة',
    branch: 'فرع',
  },
  company_counterparty_kind: {
    supplier: 'مورد',
    customer: 'عميل',
    partner: 'شريك',
    landlord: 'مؤجر',
    regulator: 'جهة رقابية',
    employee: 'موظف',
    other: 'أخرى',
  },
  company_plan_period: {
    monthly: 'شهرية',
    quarterly: 'ربع سنوية',
    annual: 'سنوية',
  },
  company_plan_tier: {
    starter: 'Starter',
    growth: 'Growth',
    enterprise: 'Enterprise',
    custom: 'شروط خاصة',
  },
  company_overage_policy: {
    approve: 'بموافقة الشركة على تكلفة إضافية',
    bill: 'تُضاف تكلفة إضافية تلقائيًا',
    block: 'لا يبدأ العمل حتى الدورة التالية',
  },
  company_senior_review: {
    always: 'مراجعة ثانية مستقلة لكل طلب',
    high_risk: 'مراجعة ثانية مستقلة للطلبات عالية المخاطر',
    never: 'بلا مراجعة ثانية مستقلة',
  },
  company_quota_kind: {
    included: 'ضمن الباقة',
    overage: 'تكلفة إضافية',
    out_of_scope: 'خارج الباقة',
    free: 'دون احتساب',
  },
  company_charge_kind: {
    subscription: 'اشتراك الباقة',
    out_of_scope: 'عمل خارج الباقة',
    overage: 'طلب إضافي فوق الباقة',
    expense: 'مصروفات',
    adjustment: 'تسوية',
  },
  company_sla_state: {
    on_track: 'في الموعد',
    at_risk: 'يقترب موعده',
    late: 'متأخر',
    paused: 'متوقف لحين رد الشركة',
    met: 'سُلِّم في الموعد',
    missed: 'سُلِّم بعد الموعد',
  },
  company_sla_phase: {
    first_response: 'أول رد',
    confirm: 'تأكيد الموعد',
    delivery: 'التسليم',
  },
  company_pod_role: {
    preferred_lead: 'مفضل كمحامٍ رئيسي',
    preferred_reviewer: 'مفضل للمراجعة',
    excluded: 'مستبعد لهذه الشركة',
  },
  b2b_skill: {
    contracts: 'العقود',
    corporate_governance: 'حوكمة الشركات',
    employment: 'علاقات العمل',
    ip: 'الملكية الفكرية',
    data_protection: 'حماية البيانات',
    consumer_marketing: 'حماية المستهلك والتسويق',
    regulatory: 'التراخيص والامتثال',
    disputes: 'النزاعات',
    real_estate: 'العقارات',
    tax: 'الضرائب',
    competition: 'المنافسة',
    banking_finance: 'البنوك والتمويل',
  },
  company_risk: {
    tight_deadline: 'موعد ضيق',
    high_value: 'قيمة مرتفعة',
    unlimited_liability: 'مسؤولية غير محدودة',
    exclusivity_non_compete: 'حصرية أو عدم منافسة',
    auto_renewal_trap: 'تجديد تلقائي يصعب إيقافه',
    termination_penalty: 'غرامة إنهاء',
    personal_data: 'بيانات شخصية',
    regulatory_exposure: 'تعرض رقابي',
    government_counterparty: 'طرف حكومي',
    foreign_law_or_forum: 'قانون أو محكمة أجنبية',
    litigation_threat: 'تهديد بالتقاضي',
    employee_termination_risk: 'مخاطر إنهاء خدمة موظف',
    consumer_claims: 'شكاوى المستهلكين',
    ip_ownership: 'ملكية فكرية',
    missing_contract: 'لا يوجد عقد مكتوب',
    other: 'أخرى',
  },
  company_risk_level: {
    low: 'منخفضة',
    medium: 'متوسطة',
    high: 'مرتفعة',
  },
  company_excluded_work: {
    litigation: 'تمثيل أمام المحاكم',
    arbitration: 'تحكيم',
    mna: 'استحواذ واندماج',
    criminal: 'جنائي',
    debt_collection: 'تحصيل ديون',
    due_diligence: 'فحص قانوني نافٍ للجهالة',
    other_excluded: 'عمل خارج الباقة',
  },
  company_visibility: {
    company: 'كل فريق الشركة',
    private: 'المرسل ومديرو البوابة فقط',
  },
  legal_form: {
    llc: 'ذات مسؤولية محدودة',
    jsc: 'مساهمة',
    sole: 'منشأة فردية',
    branch: 'فرع',
    partnership: 'شركة أشخاص',
    other: 'أخرى',
  },
  email_status: {
    queued: 'في الانتظار',
    sending: 'جارٍ الإرسال',
    sent: 'أُرسلت',
    simulated: 'في صندوق الصادر فقط (لم تُرسل)',
    failed: 'تعذّر الإرسال',
    skipped: 'لم تُرسل',
  },
  email_purpose: {
    invite: 'دعوة للانضمام',
    reset: 'رابط تعيين كلمة المرور',
    request_update: 'تحديث على طلب',
    clarification: 'سؤال من الفريق القانوني',
    quote: 'عرض سعر',
    deliverable: 'تسليم جاهز للمراجعة',
    renewal: 'موعد يقترب في الذاكرة القانونية',
    security: 'تنبيه أمني',
    security_old_email: 'إشعار للبريد السابق بعد تغييره',
    charge_added: 'تكلفة إضافية',
    staff_alert: 'تنبيه لفريق المكتب',
    trial: 'الفترة التجريبية',
    test: 'رسالة تجربة',
  },
  // أحداث سجل الأمان لخدمة الشركات (L-20: البادئات company. وcompany_auth. وemail. فقط) — تُدمج في security_event
  company_security_event: {
    'company.created': 'إنشاء شركة عميلة',
    'company.updated': 'تعديل بيانات شركة عميلة',
    'company.status_changed': 'تغيير حالة شركة عميلة',
    'company.subscription_changed': 'تغيير باقة أو اشتراك شركة',
    'company.plan_saved': 'حفظ باقة شركات',
    'company.settings_updated': 'تعديل إعدادات خدمة الشركات',
    'company.user_invited': 'دعوة مستخدم شركة',
    'company.user_invite_resent': 'إعادة إصدار دعوة مستخدم شركة',
    'company.user_updated': 'تعديل بيانات مستخدم شركة',
    'company.user_role_changed': 'تغيير دور مستخدم شركة',
    'company.user_deactivated': 'إيقاف حساب مستخدم شركة',
    'company.user_reactivated': 'إعادة تفعيل حساب مستخدم شركة',
    'company.user_email_changed': 'تغيير بريد مستخدم شركة',
    'company.invite_conflict': 'دعوة لبريد مسجل لدى شركة أخرى',
    'company.entity_override': 'تجاوز حد الكيانات في الباقة',
    'company.conflict_acknowledged': 'المتابعة رغم تعارض مصالح محتمل',
    'company.quota_free': 'طلب شركة دون احتساب من الباقة',
    'company.quota_released': 'إرجاع طلب مشمول إلى رصيد الباقة',
    'company.quote_sent': 'إرسال عرض سعر لشركة',
    'company.quote_withdrawn': 'سحب عرض سعر',
    'company.quote_approved': 'موافقة شركة على عرض سعر',
    'company.quote_rejected': 'رفض شركة لعرض سعر',
    'company.deliverable_released_override': 'إرسال تسليم لشركة مع تجاوز ضوابط الإرسال',
    'company.deliverable_withdrawn': 'سحب تسليم أُرسل لشركة',
    'company.memory_purged': 'حذف نهائي لعنصر من الذاكرة القانونية لشركة',
    'company.charge_created': 'إضافة تكلفة على شركة',
    'company.charge_voided': 'إلغاء تكلفة على شركة',
    'company.charges_exported': 'تصدير تكاليف الشركات',
    'company_auth.login': 'دخول مستخدم شركة',
    'company_auth.login_failed': 'محاولة دخول فاشلة لبوابة الشركات',
    'company_auth.lockout': 'إيقاف مؤقت لدخول مستخدم شركة',
    'company_auth.rate_limited': 'تجاوز حد محاولات دخول بوابة الشركات',
    'company_auth.logout': 'خروج مستخدم شركة',
    'company_auth.invite_accepted': 'قبول دعوة بوابة الشركات',
    'company_auth.2fa_enabled': 'تفعيل التحقق بخطوتين لمستخدم شركة',
    'company_auth.2fa_disabled': 'إلغاء التحقق بخطوتين لمستخدم شركة',
    'company_auth.2fa_failed': 'رمز تحقق غير صحيح لمستخدم شركة',
    'company_auth.2fa_recovery_used': 'دخول مستخدم شركة برمز استرداد',
    'company_auth.2fa_reset_by_staff': 'إلغاء التحقق بخطوتين لمستخدم شركة بواسطة الإدارة',
    'company_auth.recovery_codes_regenerated': 'إصدار رموز استرداد جديدة لمستخدم شركة',
    'company_auth.password_changed': 'تغيير كلمة مرور مستخدم شركة',
    'company_auth.reset_requested': 'طلب استعادة كلمة مرور من بوابة الشركات',
    'company_auth.reset_link_issued': 'إصدار رابط تعيين كلمة مرور لمستخدم شركة',
    'company_auth.password_reset': 'تعيين كلمة مرور مستخدم شركة عبر الرابط',
    'company_auth.sessions_revoked': 'إنهاء جلسات مستخدم شركة',
    'company_auth.session_revoked': 'إنهاء جلسة لمستخدم شركة',
    'company_auth.unlocked': 'رفع الإيقاف المؤقت عن مستخدم شركة',
    'email.settings_updated': 'تعديل إعدادات البريد الإلكتروني',
    'email.test_sent': 'إرسال رسالة بريد تجريبية',
  },
  // <labels:v11-segment> — نوع الخدمة (L11-16): النص دائمًا مع أيقونة في الواجهة، والمحامون لا يرون شيئًا منه
  segment: { charity: 'خيري', paid: 'أفراد وشركات' },
  segment_short: { charity: 'خيري', paid: 'أفراد' },
  segment_long: { charity: 'خيري — مساعدة مجانية', paid: 'أفراد وشركات — خدمة بأتعاب' },
  // مصدر نوع الخدمة (S11 §3.2)؛ NULL على صف قديم = «قبل الإصدار 11 (خيري)»
  segment_source: {
    website: 'اختيار الزائر في الموقع',
    website_default: 'الموقع بدون اختيار — خيري افتراضيًا',
    wa_line: 'رقم واتساب المخصص',
    wa_tag: 'رسالة واتساب الجاهزة من الموقع',
    wa_choice: 'اختار من أزرار واتساب',
    returning: 'من طلباته السابقة',
    reference: 'من الطلب أو الملف الأصلي',
    manual: 'سجلته الإدارة',
    staff: 'غيّرته الإدارة',
    company: 'بوابة الشركات',
    company_lead: 'نموذج طلب عرض للشركات',
  },
  wa_line: { main: 'الرقم الأساسي', paid: 'رقم الأفراد والشركات', unknown: 'رقم غير مضبوط' },
  // وضع الرقم الأساسي في التكاملات ([r2 S3]: «أفراد وشركات فقط» غير متاح للرقم الأساسي في 11.0)
  wa_segment_mode: { charity: 'الخيري (الأفراد والشركات بجملة الحجز)', shared: 'الخدمتين معًا (رقم واحد)' },
  requester_needs: {
    contracts: 'مراجعة العقود وصياغتها',
    employees: 'شؤون الموظفين',
    compliance: 'الامتثال والتراخيص',
    disputes: 'النزاعات والإنذارات',
    subscription: 'اشتراك شهري متكامل',
  },
  requester_employees: { '1-10': '1–10', '11-50': '11–50', '51-200': '51–200', '200+': 'أكثر من 200' },
  segment_reason_codes: { not_eligible: 'غير مستحق للخيري', wrong_choice: 'اختار النوع الخطأ', company: 'طلب شركة' },
  segment_tone: { charity: 'بأسلوب الخيري', paid: 'بأسلوب الأفراد والشركات', neutral: 'بأسلوب محايد' },
  // أحداث سجل الأمان (تُدمج في security_event أدناه)
  segment_security_event: {
    'segment.changed': 'تغيير نوع الخدمة',
    'integration.wa_mode_changed': 'تغيير وضع رقم واتساب',
    'segment.case_fee': 'أتعاب مقترحة لملف أفراد وشركات',
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
      // v9.1 b-site (B91-10): كلام بسيط، اسمها بالكنية، رقم الطلب فقط، رابط صفحتها، و{ي}/{ة} حسب صيغة المخاطبة
      template:
        'أهلًا يا {first_name}، عندك {event_kind} يوم {date} الساعة {time_spoken}.\nالمكان: {location}\nلازم تحضر{ي} بنفسك، وهات{ي} معاك{ي} بطاقتك.\nلو مش هتقدر{ي} تحضر{ي}، رد{ي} علينا هنا بسرعة.\nالتفاصيل: {portal_link}\n— {org_name}',
      // v11 segment-server (S11 §10.3): نص الأفراد والشركات
      template_paid:
        'مرحبًا {first_name}، تذكير بموعد {event_kind} يوم {date} الساعة {time_spoken}.\nالمكان: {location}\nيلزم حضوركم شخصيًا مع بطاقة الرقم القومي.\nإن تعذّر حضوركم يرجى الرد علينا هنا في أقرب وقت.\nالتفاصيل: {portal_link}\n— {org_name}',
    },
  },
  invoice_reminder: {
    enabled: true,
    params: {
      repeat_every_days: 7,
      max_reminders: 3,
      template:
        'أهلًا يا {first_name}، ده تذكير بمصاريف قضيتك: {amount} ج.م ({description}).\nلو عندك سؤال أو مش قادر{ة} تدفع{ي} دلوقتي، رد{ي} علينا هنا قبل ما تدفع{ي} أي حاجة.\n— {org_name}',
      template_paid: 'مرحبًا {first_name}، تذكير بمبلغ {amount} ج.م ({description}).\nلأي استفسار يرجى الرد علينا هنا قبل السداد.\n— {org_name}',
    },
  },
  document_reminder: {
    enabled: true,
    params: {
      after_days: 2,
      repeat_every_days: 3,
      max_reminders: 2,
      template:
        'أهلًا يا {first_name}، لسه مستنيين منك: {request}\nصوّر{ي} الورقة وابعت{ي}ها هنا على واتساب، أو من صفحتك: {portal_link}\nلو مش لاقي{ة} الورقة، قول{ي} لنا وهنساعدك.\n— {org_name}',
      template_paid: 'مرحبًا {first_name}، ما زلنا في انتظار: {request}\nيمكنكم تصوير المستند وإرساله هنا على واتساب، أو من صفحة طلبكم: {portal_link}\n— {org_name}',
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
        'أهلًا يا {first_name}، يا ترى ردّنا فادك؟\nابعت{ي} رقم من 1 لـ 5 (5 = ممتاز، 1 = مش راضي{ة}).\nرأيك بيفرق معانا.\n— {org_name}',
      template_paid: 'مرحبًا {first_name}، يسعدنا تقييمكم لخدمتنا برقم من 1 إلى 5 (5 = ممتاز، 1 = غير راضٍ).\nرأيكم يساعدنا على التحسين.\n— {org_name}',
    },
  },
  // v9.1 l-court — تنبيه داخلي للمحامي المسؤول (بلا رسالة للمستفيد/ة): جلسة انعقدت ولم تُسجَّل نتيجتها،
  // الساعة 15:00 بتوقيت القاهرة يوم الجلسة ثم مرة أخيرة 10:00 صباح اليوم التالي (التنفيذ في matters.runOutcomeMissing)
  hearing_outcome_missing: {
    enabled: true,
    params: {},
  },
};

// القوالب الافتراضية السابقة كما خُزّنت في قواعد البيانات القائمة: إن بقيت دون تعديل من الإدارة
// تُستبدل تلقائيًا بالقالب الافتراضي الحالي (لتصحيح الصياغة واسم المؤسسة الثابت).
export const LEGACY_AUTOMATION_TEMPLATES = {
  hearing_reminder: [
    'نذكّر حضرتكم بأن لديكم {event_kind} في ملفكم رقم {matter_code} يوم {date} الساعة {time} في {location}، ويلزم حضور حضرتكم شخصيًا. للاستفسار يمكنكم الرد على هذه الرسالة. — بيوت مصر',
    // v9.1 b-site: القوالب الافتراضية للإصدار 9 (تُستبدل بالصياغة البسيطة ما لم تعدّلها الإدارة)
    'نذكّر حضرتكم بموعد في ملفكم رقم {matter_code} يلزم حضوركم فيه شخصيًا.\nنوع الموعد: {event_kind}\nالتاريخ: {date} الساعة {time}\nالمكان: {location}\nللاستفسار يمكنكم الرد على هذه الرسالة. — {org_name}',
  ],
  invoice_reminder: [
    'تحية طيبة، نود تذكير حضرتكم بأن الفاتورة رقم {invoice_number} بمبلغ {amount} جنيه استحقت بتاريخ {due_date} ولم تُسدَّد بعد. شكرًا لحضرتكم. — بيوت مصر',
    'تحية طيبة، نود تذكير حضرتكم بأن الفاتورة رقم {invoice_number} بمبلغ {amount} ج.م استحقت بتاريخ {due_date} ولم تُسدَّد بعد. شكرًا لحضرتكم. — {org_name}',
  ],
  document_reminder: [
    'تحية طيبة، ما زلنا بانتظار ردكم على طلبنا الخاص بملفكم رقم {case_code}: «{request}». يمكنكم الرد على هذه الرسالة أو من خلال الرابط الخاص بكم. — بيوت مصر',
    'تحية طيبة، ما زلنا بانتظار ردكم على طلبنا الخاص بملفكم رقم {case_code}: «{request}». يمكنكم الرد على هذه الرسالة أو من خلال الرابط الخاص بكم. — {org_name}',
  ],
  satisfaction_survey: [
    'تحية طيبة، نرجو أن يكون ردنا في ملفكم رقم {case_code} قد أفادكم. يسعدنا تقييمكم لخدمة {org_name} بإرسال رقم من 1 إلى 5 (5 = ممتاز، 1 = غير راضٍ). رأيكم يساعدنا على خدمة الأسر بصورة أفضل.',
  ],
};

// v9.1 b-site (B91-10): نصوص ثابتة تصل المستفيد/ة (رموز {ي}/{ة} حسب صيغة المخاطبة، و{first_name} بالكنية).
// portal_update نص قالب ميتا المقترح (بلا أي تفاصيل) لغرض «تنبيه بجديد في صفحة المتابعة» خارج نافذة الـ 24 ساعة.
export const CLIENT_TEXTS = {
  otp: 'كود دخول صفحتك عند {org_name}: {code}\nمحدش من عندنا هيطلبه منك أبدًا.',
  portal_update: 'أهلًا يا {first_name}، في جديد في طلبك عند {org_name}.\nافتح{ي} صفحتك من هنا: {portal_link}',
  confirm_reply: 'أهلًا يا {first_name}، وصلتنا رسالتك.\nرقم طلبك: {ref}\nمن دلوقتي هنبعتلك أي جديد هنا على واتساب.\nصفحة طلبك: {portal_link}\n— {org_name}',
  info_suffix_document: '\n\nصوّر{ي} الورقة وابعت{ي}ها هنا، أو من صفحتك: {portal_link}',
  info_suffix_information: '\n\nرد{ي} علينا هنا بكتابة أو برسالة صوتية.',
  document_fallback: 'بعتنالك ورقة «{title}». تقدر{ي} تنزّل{ي}ها من صفحتك. — {org_name}',
  document_sent: 'بعتنالك ورقة «{title}». — {org_name}',
  survey_question: 'أهلًا يا {first_name}، يا ترى ردّنا فادك؟',
  survey_footer: 'أو ابعت{ي} رقم من 1 لـ 5',
  survey_thanks: 'شكرًا على رأيك يا {first_name}. إحنا معاك{ي} في أي وقت. — {org_name}',
  survey_ask_comment: 'متأسفين إن تجربتك ما كانتش كويسة. قول{ي} لنا في رسالة واحدة إيه اللي ما عجبك{ي}ش، وهنكلمك. — {org_name}',
  survey_comment_thanks: 'شكرًا، وصلتنا ملاحظتك وهنتابعها معاك{ي}. — {org_name}',
  portal_link_message: 'أهلًا يا {first_name}، دي صفحة طلبك عند {org_name}. منها تعرف{ي} كل جديد وتبعت{ي} الورق: {portal_link}',
  // v9.2 — قصص واتساب: {hello} = «أهلًا يا {الاسم}» (اسم من الموقع أو الإدارة فقط) أو «أهلًا بيك{ي}»،
  // و{ref_no} = «طلب رقم 29» (لا REQ-… في رسائل واتساب). نصوص ثابتة لا يكتبها الذكاء الاصطناعي.
  story_welcome:
    '{hello}، ده الدعم القانوني في {org_name}. الاستشارة ببلاش وكلامك سر عندنا.\nاختار{ي} موضوعك من الزرار اللي تحت، أو احكيلنا على طول بالكتابة أو برسالة صوتية.\nولما تخلّص{ي} ابعت{ي} كلمة «خلاص»، أو اصبر{ي} شوية.',
  story_welcome_header: 'الدعم القانوني — {org_name}', // v10 experience (L-07): لا يبدأ السطر باسم لاتيني
  story_welcome_button: 'اختار{ي} الموضوع',
  story_welcome_section: 'مواضيع بنساعد فيها',
  story_welcome_footer: 'مش لازم تختار{ي} — اكتب{ي} أو سجّل{ي} على طول',
  story_topic_nudge: 'تمام. احكيلنا حصل إيه بالكتابة أو برسالة صوتية، ولما تخلّص{ي} ابعت{ي} «خلاص»، أو اصبر{ي} شوية.',
  story_ack: '{hello}. وصلتنا حكايتك، وده {ref_no}.\nفريقنا هيشوفها ويرد عليك{ي} هنا.\nلو افتكرت{ي} حاجة تانية ابعت{ي}ها في أي وقت.\n— {org_name}',
  story_ack_closed: '\nإحنا شغالين {office_hours}، وهنرد أول ما نرجع.',
  story_accepted: '{hello}، {ref_no} اتسجّل، والمحامي هيدرس مشكلتك. هنبعت لك أي جديد هنا.\n— {org_name}',
  story_accepted_matter: '{hello}، {ref_no} اتسجّل، والمحامي هيتابع قضيتك. هنبعت لك أي جديد هنا.\n— {org_name}',
  story_questions: '{hello}، بخصوص {ref_no}: عشان نقدر نساعدك محتاجين نعرف:\n{questions}\nرد{ي} علينا هنا بالكتابة أو برسالة صوتية.\n— {org_name}',
};

// v11 segment-server (S11 §10.2، L11-25): نفس المفاتيح بصيغة الجمع المهذبة لعملاء الأفراد والشركات — بلا «ببلاش» ولا
// «مجاني» ولا رموز {ي}/{ة}. يُختار النص عبر app.segments.text(key, tone)؛ الأفراد والشركات لا يرجعون أبدًا لنص الخيري.
// {hello} = «مرحبًا {first_name}» أو «مرحبًا بكم»، و{ref_no} = «الطلب رقم 29».
export const CLIENT_TEXTS_PAID = {
  portal_update: 'مرحبًا {first_name}، يوجد جديد في طلبكم لدى {org_name}.\nصفحة طلبكم: {portal_link}',
  confirm_reply: 'مرحبًا {first_name}، وصلتنا رسالتكم.\nرقم طلبكم: {ref}\nسنرسل لكم أي جديد هنا على واتساب.\nصفحة طلبكم: {portal_link}\n— {org_name}',
  info_suffix_document: '\n\nيمكنكم تصوير المستند وإرساله هنا، أو من صفحة طلبكم: {portal_link}',
  info_suffix_information: '\n\nيرجى الرد علينا هنا كتابةً أو برسالة صوتية.',
  document_fallback: 'أرسلنا لكم مستند «{title}»، ويمكنكم تنزيله من صفحة طلبكم. — {org_name}',
  document_sent: 'أرسلنا لكم مستند «{title}». — {org_name}',
  survey_question: 'مرحبًا {first_name}، كيف تقيّمون خدمتنا؟',
  survey_footer: 'أو أرسلوا رقمًا من 1 إلى 5',
  survey_thanks: 'شكرًا لتقييمكم. نحن في خدمتكم دائمًا. — {org_name}',
  survey_ask_comment: 'نأسف لأن تجربتكم لم تكن كما ينبغي. يسعدنا أن تخبرونا في رسالة واحدة بما لم يعجبكم، وسنتواصل معكم. — {org_name}',
  survey_comment_thanks: 'شكرًا، وصلتنا ملاحظتكم وسنتابعها معكم. — {org_name}',
  portal_link_message: 'مرحبًا {first_name}، هذه صفحة طلبكم لدى {org_name}، ومنها تتابعون كل جديد وترسلون المستندات: {portal_link}',
  story_welcome:
    '{hello}، شكرًا لتواصلكم مع {org_name}.\nاختاروا موضوع الاستشارة من القائمة، أو اكتبوا موضوعكم مباشرة أو أرسلوا رسالة صوتية، وعند الانتهاء أرسلوا «خلاص».\nنتفق معكم على الأتعاب قبل بدء أي عمل.',
  story_welcome_header: 'خدمات قانونية — {org_name}',
  story_welcome_button: 'اختيار الموضوع',
  story_welcome_section: 'مجالات الاستشارة',
  story_welcome_footer: 'يمكنكم الكتابة مباشرة دون اختيار',
  story_topic_nudge: 'شكرًا. يرجى كتابة تفاصيل موضوعكم أو إرسالها في رسالة صوتية، وعند الانتهاء أرسلوا «خلاص».',
  story_ack: '{hello}، وصلنا طلبكم، وهذا {ref_no}.\nسيراجعه فريقنا ويتواصل معكم هنا لتحديد الخطوة التالية والأتعاب قبل بدء أي عمل.\n— {org_name}',
  story_ack_closed: '\nمواعيد العمل: {office_hours}، وسنرد عليكم فور العودة.',
  story_accepted: '{hello}، تم تسجيل {ref_no}، وسيبدأ المحامي المختص دراسة موضوعكم وفق ما اتفقنا عليه. سنوافيكم بأي جديد هنا.\n— {org_name}',
  story_accepted_matter: '{hello}، تم تسجيل {ref_no}، وسيتابع المحامي المختص قضيتكم وفق ما اتفقنا عليه. سنوافيكم بأي جديد هنا.\n— {org_name}',
  story_questions: '{hello}، بخصوص {ref_no}: نحتاج إلى معرفة ما يلي:\n{questions}\nيرجى الرد علينا هنا كتابةً أو برسالة صوتية.\n— {org_name}',
  story_refer_generic:
    '{hello}، نشكركم على تواصلكم. موضوعكم خارج نطاق الخدمات القانونية التي نقدمها، وننصح بالتوجه إلى جهة مختصة. يسعدنا مساعدتكم في أي مسألة قانونية أخرى.\n— {org_name}',
  fee_line: '\nوأرسلنا لكم الأتعاب المقترحة في صفحة طلبكم للموافقة قبل البدء.',
  // النبرة المحايدة (طلب «غير محدد»): بلا أتعاب ولا «ببلاش»
  story_ack_neutral: '{hello}، وصلتنا رسالتكم، وهذا {ref_no}.\nسيراجعها فريقنا ويرد عليكم هنا.\n— {org_name}',
  // S11 §10.1 — تأكيد اختيار «أفراد وشركات» من أزرار الرقم المشترك
  segment_chosen_paid:
    'شكرًا لاختياركم خدمات الأفراد والشركات. اكتبوا لنا موضوعكم باختصار أو أرسلوا رسالة صوتية، وعند الانتهاء أرسلوا «خلاص». سيتواصل معكم فريقنا لتحديد الاستشارة والأتعاب قبل بدء أي عمل.\n— {org_name}',
};
// S11 §10.1 — سؤال نوع الخدمة على الرقم المشترك (P1): نبرة محايدة بالجمع لشخص لا نعرف نوع خدمته بعد، فيذكر الخيارين
export const SEGMENT_CHOICE_TEXTS = {
  segment_choice:
    'أهلًا بيكم في {org_name}.\nعشان نوصّلكم للفريق المناسب، اختاروا من الزرارين:\n• «خيري — مجاني»: مساعدة قانونية ببلاش للأرامل والأيتام والأسر المحتاجة.\n• «أفراد وشركات»: خدمات قانونية بأتعاب، بنتفق عليها معاكم قبل أي شغل.\nولو مش متأكدين، اكتبوا مشكلتكم أو ابعتوا رسالة صوتية، وإحنا هنساعدكم.',
  segment_choice_footer: 'كلامكم سر عندنا',
};
// نصوص تخص الخيري وحده (بنبرة الخيري) تكمل CLIENT_TEXTS: تأكيد اختيار «خيري» من أزرار الرقم المشترك
export const CLIENT_TEXTS_CHARITY_EXTRA = {
  segment_chosen_charity: 'تمام. احكيلنا مشكلتك بالكتابة أو برسالة صوتية، ولما تخلّص{ي} ابعت{ي} «خلاص».\nالاستشارة ببلاش وكلامك سر عندنا.\n— {org_name}',
};
// S11 §10.4 — رسالة اختيارية تكتبها الإدارة عند تغيير نوع الخدمة (قابلة للتعديل، لا تُرسل تلقائيًا أبدًا)
export const SEGMENT_CHANGE_TEXTS = {
  // من «خيري» إلى «أفراد وشركات»: بنبرة الخيري (جاءت كخيري)
  to_paid:
    '{hello}، بعد مراجعة طلبك ({ref_no})، الموضوع ده خارج برنامج الدعم القانوني المجاني. نقدر نساعدك فيه كخدمة بأتعاب، وهنقولك على المبلغ الأول ومش هنبدأ أي حاجة غير بموافقتك. لو حابب{ة} نكمّل، رد{ي} علينا هنا.\n— {org_name}',
  // من «أفراد وشركات» إلى «خيري»: بنبرة الأفراد والشركات
  to_charity:
    'مرحبًا {first_name}، بعد مراجعة طلبكم ({ref_no}) يسعدنا إبلاغكم أن موضوعكم يدخل ضمن برنامج الدعم القانوني المجاني، فلن تُطلب منكم أي أتعاب. سنوافيكم بالخطوات هنا.\n— {org_name}',
};

// v9.2 — مسارات الطلب التي يقترحها الذكاء الاصطناعي وتعتمدها الإدارة، وقواعد الرسائل الآلية للقصص
export const STORY_TRACKS = ['consultation', 'matter', 'internal', 'refer', 'need_info'];
// (v11 segment-server: + سؤال نوع الخدمة وتأكيده — آليان مرتبطان بنافذة الـ 24 ساعة مثل رسائل القصة)
export const STORY_AUTO_RULES = ['story_welcome', 'story_topic_nudge', 'story_ack', 'segment_choice', 'segment_chosen'];

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
  security_totp_issuer: 'Emam Legal', // v10 experience (L-04): للتسجيلات الجديدة فقط
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
  // v9.1 b-site (B91-07/B91-12): بكلام يومي لأنه يظهر بعد «بنرد …» في الصفحة الرئيسية (قرار مفتوح للمؤسسة)
  // («لحد» لا «لـ»: «لـ» قبل رقم تنفصل في آخر السطر على الموبايل)
  office_hours: 'من السبت للخميس، من 10 الصبح لحد 4 العصر',
  // v10: اسم المكتب كما يراه العملاء (الواجهة فقط؛ الكيان القانوني في org_legal_name)
  brand_name: 'Emam Legal and Consultancy',
  brand_short_name: 'Emam Legal',
  // v10 experience (L-03): إظهار اسم المكتب في واجهة /app (الدخول والقائمة وعنوان التبويب)؛ إيقافه يعيد اسم المؤسسة كما في 9.2
  brand_in_staff_app: true,
  // <settings:programs>
  // عتبات تنبيه استهلاك ميزانية البرامج (نسب مئوية؛ يُرسل كل تنبيه مرة واحدة لكل برنامج)
  program_alert_thresholds: [80, 100],
  // ملاحظة تُطبع أسفل فواتير العملاء، وتنبيه يُطبع أسفل الإفادات القانونية
  print_invoice_note: 'يُرجى ذكر رقم الفاتورة عند السداد، وطلب إيصال استلام رسمي مختوم بخاتم المؤسسة.',
  print_answer_disclaimer:
    'هذه الإفادة مبنية على الوقائع والمستندات التي قدمها صاحب الشأن حتى تاريخها، وتُقدَّم دون مقابل ضمن برنامج الدعم القانوني، ولا تُعد توكيلًا بالحضور أمام أي جهة.',
  // v9.1 l-court — موعد الصرف المعتاد كما يظهر للمحامين في «مستحقاتي» (فارغ = يُخفى ويظهر «تحدد الإدارة موعد الصرف»)
  lawyer_payout_note: '',
  // v9.1 b-portal — صفحة متابعة المستفيد/ة: المدد التقريبية في «طلبك وصل لفين؟» (قرار مفتوح للمؤسسة قبل الإطلاق)،
  // تعليمات الدفع في «مصاريف قضيتك» (فارغ = تُخفى)، ومواعيد العمل المنظمة لمعرفة «مفتوحين دلوقتي؟» بتوقيت القاهرة
  // (الأيام بترقيم getDay: 0 الأحد … 6 السبت؛ النص الظاهر يبقى office_hours)
  portal_eta_review_days: 2,
  portal_eta_study_min_days: 7,
  portal_eta_study_max_days: 14,
  portal_payment_instructions: '',
  office_hours_schedule: { days: [6, 0, 1, 2, 3, 4], from: '10:00', to: '16:00' },
  // v9.1 l-home — «تذكّرني على هذا الجهاز» للمحامين (L-17): أقصى عمر للجلسة بالأيام مع التحقق بخطوتين (1–90) وبدونه (1–30).
  // مهلة عدم النشاط: 14 يومًا مع التحقق بخطوتين و3 أيام بدونه (لا تتجاوز أقصى عمر). الإدارة لا تتأثر.
  lawyer_remember_days_2fa: 30,
  lawyer_remember_days: 7,
  // <settings:v92-stories>
  // القصة «جاهزة» بعد هذه الدقائق بلا رسائل منها، أو عندما تكتب كلمة من story_done_words (الرسالة كلها)
  story_quiet_minutes: 10,
  story_done_words: ['خلاص', 'خلصت', 'بس كده', 'بس كدا', 'كده خلاص', 'كدا خلاص', 'هو ده', 'هو دا', 'ده كل حاجة', 'دا كل حاجة', 'تمام كده'],
  // رسائل آلية ثابتة على واتساب: متوقفة افتراضيًا (قرار للمؤسسة بعد مراجعة سياسة الخصوصية — قرار مفتوح 11)
  story_welcome_enabled: false,
  story_ack_enabled: false,
  // تحليلات Claude التلقائية لكل طلب خلال 24 ساعة («حلّل الآن» و«لخّصها الآن» لا تُحسب)
  story_auto_ai_max_per_day: 6,
  // [R2-B9] الرقم الذي نتصل منه بالمستفيدات (فارغ = رقم المؤسسة org_phone)، ونتصل خلال كم يوم عمل
  callback_from_number: '',
  callback_eta_days: 1,
  // دليل التوجيه لما هو خارج الدعم القانوني (لا أرقام لجهات خارجية: تضيفها الإدارة). الكلمات بعد normalizeArabic.
  story_referrals: [
    {
      key: 'foundation_programs',
      label: 'برامج المؤسسة الأخرى (مساعدات، علاج، كسوة…)',
      keywords: ['مساعده ماليه', 'مساعده في المصاريف', 'اعانه', 'شنطه رمضان', 'كرتونه', 'مصاريف عمليه', 'كسوه', 'جهاز العروسه', 'عايزه شغل', 'محتاجه شغل', 'محتاجه فلوس'],
      reply: '{hello}، طلبك ده مش من شغل الدعم القانوني، بس المؤسسة عندها برامج تانية ممكن تساعدك فيه. كلّم{ي} المؤسسة على {org_phone} واسأل{ي} عن البرنامج المناسب.\n— {org_name}',
    },
  ],
  // <settings:v10-b2b> — خدمة الشركات. لا تُحفظ من PATCH /api/admin/settings العام (حارس #23)، بل من
  // PUT /api/admin/b2b/settings (مدير النظام، بتحقق وسجل). company_* و b2b_* كلها هنا.
  b2b_enabled: true,
  // مواعيد العمل لمستوى الخدمة: null = نفس مواعيد العمل العامة office_hours_schedule (CO-11)؛ كائن = مواعيد للشركات فقط
  b2b_business_hours: null,
  b2b_holidays: [],
  // نافذة الطلبات العاجلة (بتوقيت القاهرة، ترقيم getDay): الساعة «calendar» تعمل داخلها فقط (L-53)
  b2b_urgent_hours: { days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '22:00' },
  b2b_auto_close_days: 7,
  b2b_revision_window_days: 30,
  b2b_reminder_after_hours: 16,
  b2b_max_reminders: 2,
  b2b_quote_valid_days: 14,
  b2b_trial_days: 14,
  b2b_ended_readonly_days: 90,
  b2b_memory_remind_days: { contract: [60, 30, 7], licence: [90, 30, 7], key_date: [14, 3, 1], dispute: [7, 1], person: [30, 7], other: [30, 7] },
  // رابط شروط الخدمة للشركات (https أو فارغ) يظهر عند قبول الدعوة (L-49)
  b2b_terms_url: '',
  // المساحة المتاحة لملفات كل شركة (ميجابايت) وعدد الملفات في اليوم (L-27)
  b2b_storage_mb: 2048,
  b2b_files_per_day: 200,
  // الاحتفاظ: صندوق البريد الصادر، والإشعارات المقروءة في البوابة (CS-30)
  b2b_outbox_retention_days: 90,
  b2b_notifications_retention_days: 180,
  company_session_idle_hours: 12,
  company_session_max_hours: 72,
  // «تذكر هذا الجهاز» (P1): لا تُقرأ إلا بعد تفعيل الميزة (CO-21)
  company_remember_days: 14,
  company_remember_days_2fa: 30,
  company_invite_valid_hours: 72,
  company_reset_valid_minutes: 60,
  company_email_max_per_hour: 20,
  // <settings:v11-segment> — نوع الخدمة «خيري» / «أفراد وشركات» (§5.3)
  // شاشة الاختيار في / لأول زيارة (مفتاح الإيقاف: متوقفة = الصفحة الرئيسية «خيري» دائمًا)
  site_gate_enabled: true,
  // هاتف صفحات الأفراد والشركات (فارغ = org_phone)
  org_phone_paid: '',
  // طلب من الموقع بلا اختيار صالح وبلا كعكة bm_seg (روابط ما قبل 11.0 كلها روابط خيري)
  segment_website_default: 'charity',
  // [r2 P4] بلا رقم أفراد وشركات مُتحقق منه: صفحات الأفراد والشركات تربط بالرقم الأساسي بجملة الحجز، وتلك الجملة على الرقم
  // الأساسي تجعل الطلب «أفراد وشركات» (أطفئوه إن كان اسم الرقم في واتساب باسم الجمعية — قرار O-32)
  wa_paid_on_main: true,
  // أزرار اختيار نوع الخدمة على الرقم المشترك (متوقفة حتى تُراجع صياغة الخصوصية)
  wa_segment_choice_enabled: false,
  // الرقم المشترك: نوع خدمة آخر طلب للعميل خلال هذه الأيام (0 = لا) — [r2 S3] P0
  segment_returning_days: 365,
  // رقم المكالمات لعملاء الأفراد والشركات (فارغ = callback_from_number ثم org_phone)
  callback_from_number_paid: '',
  // تنبيه أسفل «الإفادة القانونية» المطبوعة لعملاء الأفراد والشركات (بلا «دون مقابل»)
  print_answer_disclaimer_paid: 'هذه الإفادة مبنية على الوقائع والمستندات التي قدمها صاحب الشأن حتى تاريخها، ولا تُعد توكيلًا بالحضور أمام أي جهة.',
};

export const CODE_PREFIX = {
  client: 'CL',
  intake: 'REQ',
  matter: 'MTR',
  invoice: 'INV',
  company: 'CO', // v10 b2b-server
  quote: 'Q', // v10 b2b-server: عروض الأسعار {prefix}-Q-NNN لكل شركة
};
