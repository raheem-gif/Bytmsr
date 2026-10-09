// الإصدار 10 — مواصفات حقول طلبات الشركات وعناصر الذاكرة القانونية، والتحقق المشترك بين الخادم والمتصفح (L-24).
// وحدة نقية بلا DOM: يستوردها الخادم (src/services/company-*.js) ويستوردها المتصفح عند الحاجة فقط (lib/company-forms.js)
// فلا تدخل في حزمة الدخول الأولى للبوابة (CS-32). نصوص الحقول من UX §5.6 و§5.8 كما هي.
//
// FieldSpec: { key, kind: 'text'|'textarea'|'select'|'multi'|'date'|'money'|'bool'|'int'|'memory_ref', label, hint?, placeholder?,
//              required?, required_unless?, max?, min?, options?:[{key,label,note?}], memory_kinds?:[...], visible:'main'|'more',
//              dir:'auto', future?:bool, default?, column? }
// المبالغ في حقول الطلب بالجنيه (كما تُكتب)، وفي أعمدة الذاكرة بالقرش (value_minor).
import * as base from './company-catalog.js';

export * from './company-catalog.js';

const f = (spec) => Object.freeze({ visible: 'main', dir: 'auto', ...spec, ...(spec.options ? { options: Object.freeze(spec.options.map((o) => Object.freeze(o))) } : {}) });
const CURRENCY_OPTIONS = base.CURRENCIES.map((c) => ({ key: c.key, label: c.label }));
const currency = () => f({ key: 'currency', kind: 'select', label: 'العملة', options: CURRENCY_OPTIONS, visible: 'more', default: 'EGP' });

const CONTRACT_KINDS = [
  { key: 'supply', label: 'توريد' },
  { key: 'service', label: 'خدمات' },
  { key: 'distribution', label: 'توزيع' },
  { key: 'agency', label: 'وكالة تجارية' },
  { key: 'lease', label: 'إيجار' },
  { key: 'license', label: 'ترخيص استخدام' },
  { key: 'loan', label: 'قرض أو تمويل' },
  { key: 'shareholders', label: 'اتفاق شركاء أو مساهمين' },
  { key: 'sale', label: 'بيع' },
  { key: 'other', label: 'أخرى' },
];
const OUR_ROLES = [
  { key: 'buyer', label: 'مشترٍ' },
  { key: 'seller', label: 'بائع' },
  { key: 'service_provider', label: 'مقدم خدمة' },
  { key: 'client', label: 'متلقي خدمة' },
  { key: 'licensor', label: 'مانح ترخيص' },
  { key: 'licensee', label: 'مرخَّص له' },
  { key: 'landlord', label: 'مؤجر' },
  { key: 'tenant', label: 'مستأجر' },
  { key: 'other', label: 'أخرى' },
];
const counterparty = (extra = {}) => f({ key: 'counterparty_name', kind: 'text', label: 'الطرف الآخر', placeholder: 'الاسم كما في العقد', required: true, max: 200, counterparty: true, ...extra });

/** ملاحظة نطاق تظهر تحت حقل قيمة العقد حين تتجاوز الحد المشمول في الباقة (U10-31) */
export const CAP_NOTE = 'قيمة العقد أعلى من الحد المشمول في باقتكم؛ سنرسل لكم عرض سعر قبل بدء العمل.';
const COURT_NOTE = 'التمثيل أمام المحاكم والتحكيم خارج الاشتراك عادةً: سنرسل لكم عرض سعر قبل أي عمل. ويمكننا الآن دراسة موقفكم ضمن الباقة.';

/** حقول كل نوع: الإلزامية الظاهرة أولًا (≤ 4)، ثم «تفاصيل إضافية (اختياري)» (visible: 'more') — U10-29/U10-31 */
export const TYPE_FIELDS = Object.freeze({
  contract_review: Object.freeze([
    counterparty(),
    f({ key: 'contract_kind', kind: 'select', label: 'نوع العقد', required: true, options: CONTRACT_KINDS }),
    f({ key: 'our_role', kind: 'select', label: 'صفة شركتكم في العقد', required: true, options: OUR_ROLES }),
    f({ key: 'contract_value', kind: 'money', label: 'قيمة العقد (تقريبًا)', visible: 'more', cap_check: true }),
    currency(),
    f({ key: 'signing_deadline', kind: 'date', label: 'موعد التوقيع', visible: 'more', future: true, urgency: true }),
    f({ key: 'governing_law', kind: 'text', label: 'القانون الحاكم (إن وُجد)', hint: 'مثل: القانون المصري، قانون إنجلترا', max: 200, visible: 'more' }),
  ]),
  contract_drafting: Object.freeze([
    counterparty(),
    f({ key: 'contract_kind', kind: 'select', label: 'نوع العقد', required: true, options: CONTRACT_KINDS }),
    f({ key: 'our_role', kind: 'select', label: 'صفة شركتكم في العقد', required: true, options: OUR_ROLES }),
    f({ key: 'key_terms', kind: 'textarea', label: 'الشروط المتفق عليها', required: true, max: 4000 }),
    f({ key: 'contract_value', kind: 'money', label: 'قيمة العقد', visible: 'more', cap_check: true }),
    currency(),
  ]),
  nda: Object.freeze([
    counterparty(),
    f({
      key: 'direction',
      kind: 'select',
      label: 'اتجاه السرية',
      required: true,
      options: [
        { key: 'mutual', label: 'متبادلة (الطرفان يتبادلان المعلومات)' },
        { key: 'we_disclose', label: 'نحن نُفصح للطرف الآخر' },
        { key: 'we_receive', label: 'الطرف الآخر يُفصح لنا' },
      ],
    }),
    f({ key: 'purpose', kind: 'text', label: 'الغرض من تبادل المعلومات', required: true, max: 500 }),
    f({ key: 'template_memory_id', kind: 'memory_ref', label: 'استخدام نموذج السرية المعتمد لديكم', memory_kinds: ['template'] }),
    f({ key: 'duration_months', kind: 'int', label: 'مدة الالتزام بالسرية (بالأشهر)', min: 1, max: 120, default: 24, visible: 'more' }),
  ]),
  employment: Object.freeze([
    f({ key: 'employee_role', kind: 'text', label: 'وظيفة الموظف', hint: 'الوظيفة فقط بلا اسم — نطلب ما يلزم لاحقًا', required: true, max: 120 }),
    f({
      key: 'issue_kind',
      kind: 'select',
      label: 'نوع المسألة',
      required: true,
      options: [
        { key: 'termination', label: 'إنهاء خدمة' },
        { key: 'disciplinary', label: 'جزاء تأديبي أو تحقيق' },
        { key: 'resignation', label: 'استقالة' },
        { key: 'wages', label: 'أجور ومستحقات' },
        { key: 'contract', label: 'عقد عمل أو تعديله' },
        { key: 'injury', label: 'إصابة عمل' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'employment_start', kind: 'date', label: 'تاريخ بدء عمله', visible: 'more' }),
    f({
      key: 'written_contract',
      kind: 'select',
      label: 'هل يوجد عقد عمل مكتوب؟',
      visible: 'more',
      options: [
        { key: 'yes', label: 'نعم' },
        { key: 'no', label: 'لا' },
        { key: 'unknown', label: 'غير متأكدين' },
      ],
    }),
  ]),
  marketing_review: Object.freeze([
    f({ key: 'campaign_name', kind: 'text', label: 'اسم الحملة', required: true, max: 200 }),
    f({
      key: 'channels',
      kind: 'multi',
      label: 'أين ستُنشر؟',
      required: true,
      options: [
        { key: 'social', label: 'وسائل التواصل الاجتماعي' },
        { key: 'tv', label: 'تلفزيون أو راديو' },
        { key: 'outdoor', label: 'إعلانات طرق' },
        { key: 'sms', label: 'رسائل نصية' },
        { key: 'website', label: 'الموقع الإلكتروني أو التطبيق' },
        { key: 'influencers', label: 'مؤثرون' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'launch_date', kind: 'date', label: 'موعد الإطلاق', required: true, future: true, urgency: true }),
    f({
      key: 'contains',
      kind: 'multi',
      label: 'هل تتضمن الحملة…',
      visible: 'more',
      options: [
        { key: 'prices_discounts', label: 'أسعار أو خصومات' },
        { key: 'comparison', label: 'مقارنة بمنافسين' },
        { key: 'health_claims', label: 'ادعاءات صحية أو غذائية' },
        { key: 'contests', label: 'مسابقات أو جوائز' },
        { key: 'personal_data', label: 'جمع بيانات شخصية' },
        { key: 'children', label: 'موجهة للأطفال' },
      ],
    }),
  ]),
  legal_notice: Object.freeze([
    f({ key: 'sender_name', kind: 'text', label: 'الجهة المرسِلة', required: true, max: 200, counterparty: true }),
    f({
      key: 'notice_kind',
      kind: 'select',
      label: 'نوعه',
      required: true,
      options: [
        { key: 'warning', label: 'إنذار' },
        { key: 'lawsuit', label: 'صحيفة دعوى' },
        { key: 'government', label: 'خطاب جهة حكومية' },
        { key: 'demand_letter', label: 'مطالبة مالية' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'received_at', kind: 'date', label: 'تاريخ الاستلام', required: true }),
    f({ key: 'response_deadline', kind: 'date', label: 'آخر موعد للرد (إن ذُكر)', visible: 'more', future: true, urgency: true }),
    f({ key: 'amount_claimed', kind: 'money', label: 'المبلغ المطالب به', visible: 'more' }),
    currency(),
  ]),
  board_resolution: Object.freeze([
    f({
      key: 'body',
      kind: 'select',
      label: 'الجهة المصدِرة للقرار',
      required: true,
      options: [
        { key: 'board', label: 'مجلس الإدارة' },
        { key: 'general_assembly', label: 'الجمعية العامة' },
        { key: 'partners', label: 'الشركاء' },
      ],
    }),
    f({
      key: 'subject',
      kind: 'select',
      label: 'موضوع القرار',
      required: true,
      options: [
        { key: 'appoint_remove_director', label: 'تعيين أو عزل مدير أو عضو' },
        { key: 'bank_account', label: 'الحسابات البنكية والمفوضون' },
        { key: 'approve_financials', label: 'اعتماد القوائم المالية' },
        { key: 'capital_change', label: 'تعديل رأس المال' },
        { key: 'branch', label: 'فتح أو إغلاق فرع' },
        { key: 'poa', label: 'إصدار توكيل' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'meeting_date', kind: 'date', label: 'موعد الاجتماع (إن تحدد)', visible: 'more' }),
  ]),
  supplier_issue: Object.freeze([
    f({ key: 'supplier_name', kind: 'text', label: 'اسم المورد', required: true, max: 200, counterparty: true }),
    f({
      key: 'issue_kind',
      kind: 'select',
      label: 'نوع المشكلة',
      required: true,
      options: [
        { key: 'late_delivery', label: 'تأخر التوريد' },
        { key: 'quality', label: 'جودة أو مطابقة' },
        { key: 'payment', label: 'سداد أو فواتير' },
        { key: 'termination', label: 'إنهاء التعاقد' },
        { key: 'price_change', label: 'تغيير الأسعار' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'amount', kind: 'money', label: 'المبلغ محل الخلاف', visible: 'more' }),
    currency(),
    f({ key: 'contract_memory_id', kind: 'memory_ref', label: 'العقد مع المورد (من ذاكرتكم)', memory_kinds: ['contract'], visible: 'more' }),
  ]),
  compliance_question: Object.freeze([
    f({
      key: 'area',
      kind: 'select',
      label: 'مجال السؤال',
      required: true,
      options: [
        { key: 'tax', label: 'ضرائب' },
        { key: 'labour', label: 'عمل وتأمينات اجتماعية' },
        { key: 'data_protection', label: 'حماية البيانات الشخصية' },
        { key: 'consumer_protection', label: 'حماية المستهلك' },
        { key: 'competition', label: 'المنافسة' },
        { key: 'licensing', label: 'تراخيص' },
        { key: 'customs', label: 'جمارك واستيراد' },
        { key: 'health_safety', label: 'سلامة وصحة مهنية' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
  ]),
  renewal_followup: Object.freeze([
    f({ key: 'memory_id', kind: 'memory_ref', label: 'العقد أو الترخيص', memory_kinds: ['contract', 'licence'] }),
    f({ key: 'item_name', kind: 'text', label: 'اسم العقد أو الترخيص', max: 200, required_unless: 'memory_id' }),
    f({ key: 'expiry_date', kind: 'date', label: 'تاريخ الانتهاء', required_unless: 'memory_id', urgency: true }),
    f({
      key: 'action',
      kind: 'select',
      label: 'ماذا تريدون؟',
      required: true,
      options: [
        { key: 'renew', label: 'تجديد' },
        { key: 'terminate', label: 'إنهاء أو عدم تجديد' },
        { key: 'renegotiate', label: 'إعادة تفاوض' },
        { key: 'unsure', label: 'لم نقرر بعد' },
      ],
    }),
  ]),
  dispute: Object.freeze([
    counterparty({ placeholder: undefined }),
    f({
      key: 'dispute_kind',
      kind: 'select',
      label: 'نوع النزاع',
      required: true,
      options: [
        { key: 'owed_to_us', label: 'مستحقات لنا' },
        { key: 'claim_against_us', label: 'مطالبة ضدنا' },
        { key: 'breach', label: 'إخلال بعقد' },
        { key: 'ip', label: 'ملكية فكرية' },
        { key: 'employment', label: 'نزاع عمالي' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({
      key: 'stage',
      kind: 'select',
      label: 'أين وصل النزاع؟',
      required: true,
      options: [
        { key: 'starting', label: 'لم نبدأ بعد' },
        { key: 'demand_sent', label: 'أرسلنا مطالبة أو إنذارًا' },
        { key: 'lawsuit_filed', label: 'رُفعت دعوى', note: COURT_NOTE, excluded_work: 'litigation' },
        { key: 'arbitration', label: 'تحكيم', note: COURT_NOTE, excluded_work: 'arbitration' },
      ],
    }),
    f({ key: 'desired_outcome', kind: 'text', label: 'النتيجة التي تريدونها', required: true, max: 500 }),
    f({ key: 'amount', kind: 'money', label: 'المبلغ', visible: 'more' }),
    currency(),
  ]),
  other: Object.freeze([]),
});

/** قوالب العنوان المقترح (U10-31): {مفتاح الحقل} يُستبدل بتسمية الخيار أو القيمة */
export const TITLE_TEMPLATES = Object.freeze({
  contract_review: 'مراجعة عقد {contract_kind} مع {counterparty_name}',
  contract_drafting: 'صياغة عقد {contract_kind} مع {counterparty_name}',
  nda: 'اتفاقية سرية مع {counterparty_name}',
  employment: 'مسألة عمالية: {issue_kind} — {employee_role}',
  marketing_review: 'مراجعة حملة: {campaign_name}',
  legal_notice: '{notice_kind} من {sender_name}',
  board_resolution: 'قرار {body}: {subject}',
  supplier_issue: 'مشكلة مع المورد {supplier_name}: {issue_kind}',
  compliance_question: 'سؤال امتثال: {area}',
  renewal_followup: 'متابعة تجديد: {item_name}',
  dispute: 'نزاع مع {counterparty_name}: {dispute_kind}',
  other: '',
});

/** ما يلزم عادةً لكل نوع (يستخدمه المحلل المحلي ويُعرض لفريق المكتب فقط) */
export const MISSING_CHECKLISTS = Object.freeze({
  contract_review: [
    { key: 'document', kind: 'document', label: 'نسخة العقد (مسودة أو موقعة)' },
    { key: 'counterparty_name', kind: 'information', label: 'الاسم القانوني للطرف الآخر' },
    { key: 'contract_value', kind: 'information', label: 'قيمة العقد' },
    { key: 'signing_deadline', kind: 'information', label: 'موعد التوقيع' },
    { key: 'red_lines', kind: 'information', label: 'البنود التي لا تقبلها الشركة' },
  ],
  contract_drafting: [
    { key: 'counterparty_name', kind: 'information', label: 'الاسم القانوني للطرف الآخر' },
    { key: 'key_terms', kind: 'information', label: 'الشروط التجارية المتفق عليها' },
    { key: 'contract_value', kind: 'information', label: 'المقابل وطريقة السداد' },
    { key: 'duration', kind: 'information', label: 'مدة العقد' },
  ],
  nda: [
    { key: 'counterparty_name', kind: 'information', label: 'الاسم القانوني للطرف الآخر' },
    { key: 'direction', kind: 'information', label: 'اتجاه السرية (متبادلة أم من طرف واحد)' },
    { key: 'purpose', kind: 'information', label: 'الغرض من تبادل المعلومات' },
    { key: 'duration_months', kind: 'information', label: 'مدة الالتزام بالسرية' },
  ],
  employment: [
    { key: 'document', kind: 'document', label: 'عقد العمل' },
    { key: 'history', kind: 'document', label: 'سجل الإنذارات أو الجزاءات' },
    { key: 'payslip', kind: 'document', label: 'آخر قسيمة مرتب' },
    { key: 'employment_start', kind: 'information', label: 'تاريخ بدء العمل والتواريخ المهمة' },
  ],
  marketing_review: [
    { key: 'document', kind: 'document', label: 'التصميم أو النص النهائي للإعلان' },
    { key: 'channels', kind: 'information', label: 'قنوات النشر' },
    { key: 'launch_date', kind: 'information', label: 'موعد الإطلاق' },
    { key: 'claims', kind: 'document', label: 'ما يثبت الادعاءات الواردة في الإعلان' },
  ],
  legal_notice: [
    { key: 'document', kind: 'document', label: 'صورة الإنذار أو المطالبة' },
    { key: 'received_at', kind: 'information', label: 'تاريخ الاستلام' },
    { key: 'response_deadline', kind: 'information', label: 'آخر موعد للرد' },
    { key: 'related', kind: 'document', label: 'العقد أو الفواتير المرتبطة' },
  ],
  board_resolution: [
    { key: 'articles', kind: 'document', label: 'النظام الأساسي للشركة' },
    { key: 'board', kind: 'information', label: 'تشكيل مجلس الإدارة الحالي' },
    { key: 'agenda', kind: 'information', label: 'جدول أعمال الاجتماع' },
  ],
  supplier_issue: [
    { key: 'contract', kind: 'document', label: 'العقد مع المورد' },
    { key: 'correspondence', kind: 'document', label: 'المراسلات' },
    { key: 'amount', kind: 'information', label: 'المبالغ والفواتير' },
  ],
  compliance_question: [
    { key: 'activity', kind: 'information', label: 'وصف النشاط أو الموقف' },
    { key: 'regulator_letter', kind: 'document', label: 'خطاب الجهة الرسمية إن وُجد' },
  ],
  renewal_followup: [
    { key: 'document', kind: 'document', label: 'العقد أو الترخيص' },
    { key: 'expiry_date', kind: 'information', label: 'تاريخ الانتهاء' },
  ],
  dispute: [
    { key: 'contract', kind: 'document', label: 'العقد' },
    { key: 'evidence', kind: 'document', label: 'المستندات المؤيدة' },
    { key: 'correspondence', kind: 'document', label: 'المراسلات' },
    { key: 'amount', kind: 'information', label: 'المبالغ محل النزاع' },
  ],
  other: [],
});

/**
 * الحقول المشتركة لكل طلب (U10-34…U10-37). stored: 'request' عمود في الطلب، 'fields' داخل حقول الطلب (output_language).
 * الكيان والمتابعون قوائم ديناميكية من بيانات الشركة.
 */
export const COMMON_FIELDS = Object.freeze([
  f({
    key: 'priority',
    kind: 'select',
    label: 'ما مدى الاستعجال؟',
    options: base.PRIORITIES.filter((p) => p.company).map((p) => ({ key: p.key, label: p.label })),
    default: 'normal',
    stored: 'request',
  }),
  f({ key: 'urgent_reason', kind: 'text', label: 'لماذا هو عاجل؟', max: 300, required_if: { priority: 'urgent' }, required_message: 'اكتبوا سبب الاستعجال.', stored: 'request' }),
  f({ key: 'needed_by', kind: 'date', label: 'تحتاجونه قبل (اختياري)', hint: 'إن كان هناك موعد نهائي: توقيع، رد على إنذار، إطلاق حملة.', future: true, urgency: true, stored: 'request' }),
  f({ key: 'entity_id', kind: 'entity', label: 'الكيان المعني', stored: 'request' }),
  f({
    key: 'visibility',
    kind: 'select',
    label: 'مَن يرى هذا الطلب في شركتكم؟',
    hint: 'فريقكم القانوني يرى الطلب في الحالتين.',
    options: base.VISIBILITIES.map((x) => ({ key: x.key, label: x.label })),
    stored: 'request',
  }),
  f({ key: 'watcher_ids', kind: 'watchers', label: 'إشراك زملاء في المتابعة (اختياري)', hint: 'يصلهم كل جديد. ويستطيع الأعضاء ومديرو البوابة منهم الرد واعتماد التسليم.', max: 10, stored: 'request' }),
  f({ key: 'output_language', kind: 'select', label: 'لغة التسليم', options: base.OUTPUT_LANGUAGES.map((x) => ({ key: x.key, label: x.label })), default: 'ar', stored: 'fields' }),
]);

/** حدود العنوان والوصف (B10-21) */
export const REQUEST_LIMITS = Object.freeze({ title_max: 140, description_min: 10, description_max: 20000, files_per_call: 5, files_per_request: 30, watchers_max: 10 });

/** رسائل التحقق المشتركة (U10-30) */
export const FIELD_ERRORS = Object.freeze({
  required: 'هذا الحقل مطلوب.',
  description: 'اكتبوا وصفًا من 10 أحرف على الأقل.',
  past_date: 'اختاروا تاريخًا من اليوم أو بعده.',
  end_before_start: 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.',
  money: 'اكتبوا رقمًا فقط، مثل 1200000.',
  date: 'اكتبوا تاريخًا صحيحًا.',
  option: 'اختاروا من القائمة.',
  too_long: 'النص أطول من المسموح.',
  int: 'اكتبوا عددًا صحيحًا.',
  range: 'الرقم خارج النطاق المسموح.',
});

// ───────────────────────── الذاكرة القانونية (U10-63) ─────────────────────────
const TITLE = (label) => f({ key: 'title', kind: 'text', label, required: true, max: 200, column: 'title' });
const SUMMARY = f({ key: 'summary', kind: 'textarea', label: 'الملخص', max: 2000, column: 'summary', visible: 'more' });

/** حقول كل نوع من عناصر الذاكرة. column = عمود في جدول company_memory، وغيره داخل data */
export const MEMORY_FIELDS = Object.freeze({
  contract: Object.freeze([
    TITLE('عنوان العقد'),
    f({ key: 'counterparty_name', kind: 'text', label: 'الطرف الآخر', required: true, max: 200, column: 'counterparty', counterparty: true }),
    f({ key: 'entity_id', kind: 'entity', label: 'الكيان', column: 'entity_id' }),
    f({ key: 'contract_kind', kind: 'select', label: 'نوع العقد', options: CONTRACT_KINDS }),
    f({ key: 'our_role', kind: 'select', label: 'صفة شركتكم', options: OUR_ROLES }),
    f({ key: 'start_date', kind: 'date', label: 'تاريخ البدء', column: 'start_date' }),
    f({ key: 'end_date', kind: 'date', label: 'تاريخ الانتهاء', column: 'end_date', after: 'start_date' }),
    f({
      key: 'renewal_type',
      kind: 'select',
      label: 'التجديد',
      options: [
        { key: 'auto', label: 'تلقائي' },
        { key: 'manual', label: 'يدوي' },
        { key: 'none', label: 'لا يتجدد' },
      ],
    }),
    f({ key: 'term_months', kind: 'int', label: 'مدة التجديد (بالأشهر)', min: 1, max: 120, show_if: { renewal_type: 'auto' } }),
    f({ key: 'notice_days', kind: 'int', label: 'مهلة الإخطار بعدم التجديد (بالأيام)', min: 0, max: 365, show_if: { renewal_type: 'auto' } }),
    f({ key: 'value', kind: 'money', label: 'القيمة', column: 'value_minor' }),
    f({ key: 'currency', kind: 'select', label: 'العملة', options: CURRENCY_OPTIONS, column: 'currency', default: 'EGP' }),
    f({ key: 'governing_law', kind: 'text', label: 'القانون الحاكم', max: 200 }),
    f({ key: 'signed', kind: 'bool', label: 'موقَّع؟' }),
    f({ key: 'signed_at', kind: 'date', label: 'تاريخ التوقيع', show_if: { signed: true } }),
    f({ key: 'key_terms', kind: 'textarea', label: 'أهم الشروط', max: 2000 }),
    SUMMARY,
  ]),
  template: Object.freeze([
    TITLE('اسم النموذج'),
    f({
      key: 'template_kind',
      kind: 'select',
      label: 'نوع النموذج',
      options: [
        { key: 'nda', label: 'اتفاقية سرية' },
        { key: 'service', label: 'عقد خدمات' },
        { key: 'supply', label: 'عقد توريد' },
        { key: 'employment_offer', label: 'عرض عمل' },
        { key: 'policy', label: 'سياسة' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'version', kind: 'text', label: 'الإصدار', max: 40 }),
    f({ key: 'approved_at', kind: 'date', label: 'تاريخ الاعتماد' }),
    f({ key: 'approved_by_text', kind: 'text', label: 'اعتمده', max: 120 }),
    SUMMARY,
  ]),
  licence: Object.freeze([
    TITLE('اسم الترخيص'),
    f({ key: 'issuer', kind: 'text', label: 'الجهة المصدرة', required: true, max: 200 }),
    f({ key: 'licence_number', kind: 'text', label: 'رقم الترخيص', max: 80 }),
    f({ key: 'entity_id', kind: 'entity', label: 'الكيان', column: 'entity_id' }),
    f({ key: 'end_date', kind: 'date', label: 'تاريخ الانتهاء', column: 'end_date' }),
    f({ key: 'renewal_lead_days', kind: 'int', label: 'ابدؤوا التجديد قبل (يومًا)', min: 0, max: 365 }),
    SUMMARY,
  ]),
  resolution: Object.freeze([
    TITLE('العنوان'),
    f({
      key: 'body',
      kind: 'select',
      label: 'الجهة',
      options: [
        { key: 'board', label: 'مجلس الإدارة' },
        { key: 'general_assembly', label: 'الجمعية العامة' },
        { key: 'partners', label: 'الشركاء' },
      ],
    }),
    f({ key: 'meeting_date', kind: 'date', label: 'تاريخ الاجتماع' }),
    f({ key: 'subject', kind: 'text', label: 'الموضوع', max: 300 }),
    f({ key: 'entity_id', kind: 'entity', label: 'الكيان', column: 'entity_id' }),
    SUMMARY,
  ]),
  position: Object.freeze([
    f({ key: 'topic', kind: 'text', label: 'الموضوع', required: true, max: 200 }),
    f({ key: 'decision', kind: 'textarea', label: 'القرار', required: true, max: 2000 }),
    f({ key: 'decided_by_text', kind: 'text', label: 'صادر عن', max: 120 }),
    f({ key: 'decided_at', kind: 'date', label: 'التاريخ' }),
    f({ key: 'applies_to', kind: 'multi', label: 'ينطبق على', options: base.REQUEST_TYPES.map((t) => ({ key: t.key, label: t.company_label })) }),
  ]),
  person: Object.freeze([
    f({ key: 'person_name', kind: 'text', label: 'الاسم', required: true, max: 120 }),
    f({ key: 'person_title', kind: 'text', label: 'الصفة', max: 120 }),
    f({
      key: 'authority',
      kind: 'select',
      label: 'نوع التفويض',
      required: true,
      options: [
        { key: 'signatory', label: 'مفوض بالتوقيع' },
        { key: 'board_member', label: 'عضو مجلس إدارة' },
        { key: 'authorised_requester', label: 'مخوَّل بإرسال الطلبات' },
        { key: 'poa_holder', label: 'وكيل بتوكيل' },
        { key: 'manager', label: 'مدير' },
      ],
    }),
    f({ key: 'limit', kind: 'money', label: 'حد التفويض' }),
    f({ key: 'poa_ref', kind: 'text', label: 'مرجع التوكيل', max: 120 }),
    f({ key: 'end_date', kind: 'date', label: 'صالح حتى', column: 'end_date' }),
    f({ key: 'entity_id', kind: 'entity', label: 'الكيان', column: 'entity_id' }),
  ]),
  policy: Object.freeze([
    TITLE('الاسم'),
    f({
      key: 'policy_kind',
      kind: 'select',
      label: 'النوع',
      options: [
        { key: 'code_of_conduct', label: 'مدونة سلوك' },
        { key: 'data_protection', label: 'حماية بيانات' },
        { key: 'hr', label: 'موارد بشرية' },
        { key: 'procurement', label: 'مشتريات' },
        { key: 'other', label: 'أخرى' },
      ],
    }),
    f({ key: 'version', kind: 'text', label: 'الإصدار', max: 40 }),
    f({ key: 'approved_at', kind: 'date', label: 'تاريخ الاعتماد' }),
    SUMMARY,
  ]),
  dispute: Object.freeze([
    TITLE('العنوان'),
    f({ key: 'counterparty_name', kind: 'text', label: 'الطرف الآخر', max: 200, column: 'counterparty', counterparty: true }),
    f({
      key: 'forum',
      kind: 'select',
      label: 'الجهة',
      options: [
        { key: 'court', label: 'محكمة' },
        { key: 'arbitration', label: 'تحكيم' },
        { key: 'labour_office', label: 'مكتب العمل' },
        { key: 'regulator', label: 'جهة رقابية' },
        { key: 'negotiation', label: 'تفاوض' },
      ],
    }),
    f({
      key: 'our_role',
      kind: 'select',
      label: 'صفتكم',
      options: [
        { key: 'claimant', label: 'مدعٍ' },
        { key: 'respondent', label: 'مدعى عليه' },
      ],
    }),
    f({ key: 'stage', kind: 'text', label: 'المرحلة', max: 200 }),
    f({ key: 'next_event_date', kind: 'date', label: 'الموعد القادم' }),
    f({ key: 'outcome', kind: 'text', label: 'النتيجة', max: 300 }),
    SUMMARY,
  ]),
  key_date: Object.freeze([
    TITLE('العنوان'),
    f({ key: 'date', kind: 'date', label: 'التاريخ', required: true, column: 'start_date' }),
    f({
      key: 'recurrence',
      kind: 'select',
      label: 'التكرار',
      options: [
        { key: 'none', label: 'لا يتكرر' },
        { key: 'yearly', label: 'سنويًا' },
        { key: 'monthly', label: 'شهريًا' },
      ],
      default: 'none',
    }),
    f({ key: 'note', kind: 'textarea', label: 'ملاحظة', max: 1000 }),
  ]),
});

/** حقول مشتركة لكل عناصر الذاكرة */
export const MEMORY_COMMON_FIELDS = Object.freeze([
  f({
    key: 'access',
    kind: 'select',
    label: 'مَن يراه',
    options: [
      { key: 'all', label: 'كل فريق الشركة' },
      { key: 'admins', label: 'مديرو البوابة فقط' },
    ],
    admins_only: true,
  }),
  f({ key: 'remind_days', kind: 'multi_int', label: 'التذكير قبل', options: base.REMIND_DAY_CHOICES.map((d) => ({ key: d, label: String(d) })) }),
]);

// ───────────────────────── أنواع كاملة (البيانات + الحقول) ─────────────────────────
/** نوع الطلب كاملًا (بيانات الكتالوج + الحقول + قائمة النواقص + قالب العنوان) */
export function fullType(key) {
  const t = base.typeByKey(key);
  if (!t) return null;
  return { ...t, fields: TYPE_FIELDS[key] || [], missing_checklist: MISSING_CHECKLISTS[key] || [], title_template: TITLE_TEMPLATES[key] || '' };
}
/** نفس REQUEST_TYPES في company-catalog.js مع fields وmissing_checklist وtitle_template (شكل §4.3 كاملًا) */
export const REQUEST_TYPES = Object.freeze(base.REQUEST_TYPES.map((t) => Object.freeze(fullType(t.key))));
/** نفس MEMORY_KINDS مع fields */
export const MEMORY_KINDS = Object.freeze(base.MEMORY_KINDS.map((k) => Object.freeze({ ...k, fields: MEMORY_FIELDS[k.key] || [] })));
export function typeByKey(k) {
  return REQUEST_TYPES.find((t) => t.key === k) || null;
}
export function memoryKindByKey(k) {
  return MEMORY_KINDS.find((x) => x.key === k) || null;
}
export function memoryKindBySlug(s) {
  return MEMORY_KINDS.find((x) => x.slug === s) || null;
}
export function typeFields(key) {
  return TYPE_FIELDS[key] || [];
}
export function memoryFields(kind) {
  return MEMORY_FIELDS[kind] || [];
}

// ───────────────────────── أدوات التاريخ (تقويم القاهرة) ─────────────────────────
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** تاريخ اليوم بتوقيت القاهرة YYYY-MM-DD */
export function cairoToday(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function isDateKey(s) {
  const m = DATE_RE.exec(String(s ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}
/** إضافة أيام لتاريخ YYYY-MM-DD */
export function addDaysKey(key, days) {
  const m = DATE_RE.exec(key);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days)));
  return d.toISOString().slice(0, 10);
}
/**
 * إضافة أشهر لتاريخ YYYY-MM-DD (اليوم يُقصّ على آخر أيام الشهر). anchorDay (G-R3): يوم الشهر الأصلي للتكرار — يُقصّ
 * الموعد المحسوب وحده ولا يضيع اليوم 29–31 بعد شهر قصير (31 يناير ← 28 فبراير ← 31 مارس).
 */
export function addMonthsKey(key, months, anchorDay = null) {
  const m = DATE_RE.exec(key);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + Number(months);
  const ty = y + Math.floor(mo / 12);
  const tm = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const want = Number.isInteger(Number(anchorDay)) && Number(anchorDay) >= 1 && Number(anchorDay) <= 31 ? Number(anchorDay) : Number(m[3]);
  const d = Math.min(want, last);
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ───────────────────────── التحقق ─────────────────────────
const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);

/** قيمة حقل واحد بعد التنظيف، أو { error } */
function coerce(spec, raw, { today }) {
  const opts = spec.options || [];
  switch (spec.kind) {
    case 'text':
    case 'textarea': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { error: FIELD_ERRORS.required };
      const s = String(raw).replace(/\r\n/g, '\n').trim();
      if (spec.max && s.length > spec.max) return { error: FIELD_ERRORS.too_long };
      return { value: s };
    }
    case 'select': {
      const k = typeof raw === 'number' ? raw : String(raw);
      return opts.some((o) => o.key === k) ? { value: k } : { error: FIELD_ERRORS.option };
    }
    case 'multi': {
      const arr = Array.isArray(raw) ? raw : [raw];
      const out = [];
      for (const x of arr) {
        if (!opts.some((o) => o.key === x)) return { error: FIELD_ERRORS.option };
        if (!out.includes(x)) out.push(x);
      }
      return { value: out };
    }
    case 'multi_int': {
      const arr = Array.isArray(raw) ? raw : [raw];
      const out = [];
      for (const x of arr) {
        const n = Number(toLatinDigits(x));
        if (!opts.some((o) => o.key === n)) return { error: FIELD_ERRORS.option };
        if (!out.includes(n)) out.push(n);
      }
      return { value: out.sort((a, b) => b - a) };
    }
    case 'date': {
      const s = toLatinDigits(String(raw)).trim().slice(0, 10);
      if (!isDateKey(s)) return { error: FIELD_ERRORS.date };
      if (spec.future && today && s < today) return { error: FIELD_ERRORS.past_date };
      return { value: s };
    }
    case 'money': {
      const s = toLatinDigits(String(raw)).replace(/[,\s٬]/g, '').trim();
      if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: FIELD_ERRORS.money };
      const n = Number(s);
      if (!Number.isFinite(n) || n > 1e12) return { error: FIELD_ERRORS.money };
      return { value: n };
    }
    case 'int':
    case 'memory_ref':
    case 'entity': {
      const s = toLatinDigits(String(raw)).trim();
      if (!/^\d+$/.test(s)) return { error: FIELD_ERRORS.int };
      const n = Number(s);
      if (spec.kind !== 'int' && n <= 0) return { error: FIELD_ERRORS.int };
      if ((spec.min !== undefined && n < spec.min) || (spec.max !== undefined && n > spec.max)) return { error: FIELD_ERRORS.range };
      return { value: n };
    }
    case 'bool':
      return { value: raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on' };
    default:
      return { value: raw };
  }
}

function validateSpecs(specs, input, { today, includeHidden = true } = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const values = {};
  const errors = {};
  for (const spec of specs) {
    if (!includeHidden && spec.show_if && !Object.entries(spec.show_if).every(([k, v]) => src[k] === v)) continue;
    const raw = src[spec.key];
    let required = !!spec.required;
    if (spec.required_unless && !isEmpty(src[spec.required_unless])) required = false;
    else if (spec.required_unless) required = true;
    if (spec.required_if && Object.entries(spec.required_if).every(([k, v]) => src[k] === v)) required = true;
    if (isEmpty(raw)) {
      if (required) errors[spec.key] = spec.required_message || FIELD_ERRORS.required;
      continue;
    }
    const r = coerce(spec, raw, { today });
    if (r.error) errors[spec.key] = r.error;
    else values[spec.key] = r.value;
  }
  return { values, errors };
}

/**
 * التحقق من حقول نوع الطلب (+ output_language). يعيد { values, errors:{key: رسالة} }.
 * لا يتحقق من وجود عناصر الذاكرة (memory_ref) ولا من الكيان — يفعل ذلك الخادم داخل الشركة نفسها (L-51).
 */
export function validateFields(typeKey, fields, { today = cairoToday() } = {}) {
  const specs = TYPE_FIELDS[typeKey];
  if (!specs) return { values: {}, errors: { type: FIELD_ERRORS.option } };
  const src = fields && typeof fields === 'object' ? fields : {};
  const { values, errors } = validateSpecs(specs, src, { today });
  const hasMoney = specs.some((s) => s.kind === 'money' && values[s.key] !== undefined);
  if (specs.some((s) => s.key === 'currency') && hasMoney && !values.currency) values.currency = 'EGP';
  if (specs.some((s) => s.key === 'duration_months') && values.duration_months === undefined && typeKey === 'nda') values.duration_months = 24;
  const lang = COMMON_FIELDS.find((s) => s.key === 'output_language');
  if (!isEmpty(src.output_language)) {
    const r = coerce(lang, src.output_language, { today });
    if (r.error) errors.output_language = r.error;
    else values.output_language = r.value;
  } else values.output_language = 'ar';
  return { values, errors };
}

/**
 * التحقق من عنصر ذاكرة: يعيد { values: { title, counterparty, entity_id, start_date, end_date, value_minor, currency, summary,
 * access?, remind_days?, data:{…} }, errors }. partial: تعديل جزئي (الحقول الغائبة لا تُعد ناقصة).
 */
export function validateMemory(kind, data, { today = cairoToday(), partial = false } = {}) {
  const meta = base.memoryKindByKey(kind);
  const specs = MEMORY_FIELDS[kind];
  if (!meta || !specs) return { values: {}, errors: { kind: FIELD_ERRORS.option } };
  const src = data && typeof data === 'object' ? data : {};
  const useSpecs = partial ? specs.filter((s) => Object.prototype.hasOwnProperty.call(src, s.key)) : specs;
  const { values: raw, errors } = validateSpecs([...useSpecs, ...MEMORY_COMMON_FIELDS.filter((s) => !partial || Object.prototype.hasOwnProperty.call(src, s.key))], src, { today });
  const values = { data: {} };
  for (const spec of [...specs, ...MEMORY_COMMON_FIELDS]) {
    if (!(spec.key in raw)) continue;
    const v = raw[spec.key];
    if (spec.column === 'value_minor') values.value_minor = Math.round(v * 100);
    else if (spec.column) values[spec.column] = v;
    else if (spec.key === 'access' || spec.key === 'remind_days') values[spec.key] = v;
    else if (spec.kind === 'money') values.data[`${spec.key}_minor`] = Math.round(v * 100);
    else values.data[spec.key] = v;
  }
  if (meta.title_from && values.data[meta.title_from] !== undefined) values.title = String(values.data[meta.title_from]).slice(0, 200);
  const start = values.start_date ?? src.start_date;
  const end = values.end_date ?? src.end_date;
  if (kind === 'contract' && isDateKey(start) && isDateKey(end) && end <= start) errors.end_date = FIELD_ERRORS.end_before_start;
  if (values.value_minor !== undefined && !values.currency && !partial) values.currency = 'EGP';
  return { values, errors };
}

/** تسمية خيار في حقل */
function optionLabel(spec, value) {
  if (!spec?.options) return value;
  if (Array.isArray(value)) return value.map((x) => optionLabel(spec, x)).join('، ');
  return spec.options.find((o) => o.key === value)?.label ?? value;
}

/**
 * العنوان المقترح من قالب النوع. memoryTitles: { [memoryId]: title } لحقول الإشارة إلى الذاكرة (تجديد عقد من الذاكرة).
 * الحقول الناقصة تُحذف مع الرابط المتدلي («مع»، «من»، «:» …) فيبقى عنوان مفهوم أثناء الكتابة.
 */
export function renderTitle(typeKey, fields, { memoryTitles = {} } = {}) {
  const tpl = TITLE_TEMPLATES[typeKey];
  if (!tpl) return '';
  const specs = TYPE_FIELDS[typeKey] || [];
  const src = fields && typeof fields === 'object' ? fields : {};
  let out = tpl.replace(/\{([a-z_]+)\}/g, (m, key) => {
    let v = src[key];
    if (key === 'item_name' && isEmpty(v) && src.memory_id && memoryTitles[src.memory_id]) v = memoryTitles[src.memory_id];
    if (isEmpty(v)) return '';
    const spec = specs.find((s) => s.key === key);
    return String(optionLabel(spec, v)).trim();
  });
  out = out
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:مع|من|—|:)\s*$/u, '')
    .replace(/^\s*(?:—|:)\s*/u, '')
    .replace(/\s+(?:—|:)\s+(?=(?:—|:))/gu, ' ')
    .trim();
  return out.slice(0, REQUEST_LIMITS.title_max);
}

/**
 * التواريخ المحسوبة لعنصر ذاكرة: notice_deadline (آخر موعد للإخطار بعدم التجديد التلقائي) وnext_date (أقرب موعد قادم).
 * item = { start_date, end_date, data } (data كائن أو JSON).
 */
export function computeMemoryDates(kind, item, { today = cairoToday() } = {}) {
  const data = typeof item?.data === 'string' ? safeJson(item.data) : item?.data || {};
  const start = isDateKey(item?.start_date) ? item.start_date : null;
  const end = isDateKey(item?.end_date) ? item.end_date : null;
  let notice = null;
  let next = null;
  if (kind === 'contract') {
    const days = Number(data.notice_days);
    if (data.renewal_type === 'auto' && end && Number.isInteger(days) && days >= 0) notice = addDaysKey(end, -days);
    const candidates = [notice, end].filter(Boolean);
    next = candidates.filter((d) => d >= today).sort()[0] || end || null;
  } else if (kind === 'licence' || kind === 'person') {
    next = end;
  } else if (kind === 'key_date') {
    next = start;
  } else if (kind === 'dispute') {
    next = isDateKey(data.next_event_date) ? data.next_event_date : null;
  }
  return { notice_deadline: notice, next_date: next };
}

function safeJson(s) {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** الحقول التي يراها المحامي من عنصر ذاكرة مُنح له (L-57) — مع التسميات */
export function lawyerMemoryData(kind, data) {
  const meta = base.memoryKindByKey(kind);
  if (!meta || meta.grantable === false) return {};
  const src = typeof data === 'string' ? safeJson(data) : data || {};
  const out = {};
  for (const k of meta.lawyer_fields) if (src[k] !== undefined && src[k] !== null && src[k] !== '') out[k] = src[k];
  return out;
}
