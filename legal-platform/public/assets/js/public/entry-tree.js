// v12 entry (§5.1، E12-01…E12-09 + r2 L12-50…L12-55، L12-63): شجرة الصفحة الأولى «كيف نساعدكم؟» ومسار الطلب.
// وحدة نقية بلا DOM، تستورد topics.js فقط. يستوردها الخادم (site.js، routes/public.js، services/pathways.js،
// segments.js، stories.js، engine.js) والاختبارات وسجل الرموز، وورقة «مسار الطلب» في /app عند فتحها فقط (L12-24).
// لا تستوردها أي صفحة عامة: صفحة الطلب تتلقى ورقتها وحدها في <script type="application/json" id="bm-path">.
//
// قواعد البيانات (E12-01/E12-09): id = جزء الرابط [a-z0-9-] فريد بين الإخوة؛ tag = رمز الصف، qtag = رمز سؤال الصفحة؛
// label ≤ 30 حرفًا، hint ≤ 40؛ wa = عنوان واتساب حين يطول الاسم (المستوى الأول ≤ 20، الثاني ≤ 24)؛ wa_desc ≤ 72؛
// say = ما يُقال في جملة واتساب الجاهزة ('' = تُتخطى، والافتراضي الاسم)؛ staff = كلمة الفريق؛ use = قائمة مشتركة؛
// inherit = حقول تُدمج في كل ورقة تحتها (ask وurgent_unknown تُضمّ، الأب أولًا)؛ to = بيانات الورقة.
// b2b: true = يختفي حين تتوقف خدمة الشركات؛ portal: true = يختفي حين تُغلق بوابة الشركات؛ والصفحة التي يبقى فيها
// اختيار واحد تُتخطى إلى ذلك الاختيار (L12-63). لا تُحذف أبدًا معرّفات منشورة: تُحال في RETIRED.
// الكلمات: أسماء ومصادر فقط في الاختيارات، والأسئلة بصيغة الجمع المهذبة، بلا «—» ولا علامة تعجب ولا صور.
import { QUESTIONS } from './topics.js';

export const TREE_VERSION = 1;

/** نسخة مجمدة بعمق (البيانات لا تُعدَّل وقت التشغيل) */
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

// ───────────── الشجرة (E12-02 حرفيًا مع تعديلات r2) ─────────────

export const TREE = deepFreeze({
  v: 1,
  q: 'كيف نساعدكم؟',
  qtag: 'T-01',
  children: [
    {
      id: 'consultation',
      tag: 'T-02',
      label: 'استشارة',
      hint: 'أسرة، ميراث، إيجار، عمل، عقود',
      staff: 'استشارة',
      chip: 'استشارة',
      head: 'مرحبًا، أرغب في حجز استشارة قانونية',
      q: 'في أي مجال؟',
      qtag: 'T-03',
      inherit: { ph: 'consult' },
      children: [
        {
          id: 'family',
          tag: 'T-04',
          label: 'الأسرة والميراث',
          say: '',
          wa_desc: 'طلاق، نفقة، حضانة، ميراث، أموال القاصرين',
          q: 'ما الموضوع؟',
          qtag: 'T-05',
          children: [
            { id: 'divorce', tag: 'T-06', label: 'الطلاق أو الخلع', to: { topic: null, area: 'FAM', ask: [] } },
            { id: 'alimony', tag: 'T-07', label: 'النفقة', to: { topic: 'alimony', area: 'FAM', ask: ['alimony.for', 'children'] } },
            { id: 'custody', tag: 'T-08', label: 'الحضانة والرؤية', to: { topic: 'custody', area: 'FAM', ask: ['custody.issue', 'children'] } },
            { id: 'inheritance', tag: 'T-09', label: 'الميراث', to: { topic: 'inh', area: 'INH', ask: ['inh.deceased', 'inh.certificate'] } },
            { id: 'minors', tag: 'T-10', label: 'أموال القاصرين', hint: 'الولاية على المال والنيابة الحسبية', to: { topic: 'guardianship', area: 'GRD', ask: ['guardianship.where', 'children'] } },
            { id: 'other', tag: 'T-11', label: 'موضوع آخر في الأسرة', to: { topic: null, area: 'FAM', ask: [] } },
          ],
        },
        {
          id: 'property',
          tag: 'T-12',
          label: 'العقارات والإيجار',
          say: '',
          wa_desc: 'إيجار قديم وجديد، بيع وشراء، نزاعات الملكية',
          q: 'ما الموضوع؟',
          qtag: 'T-13',
          children: [
            { id: 'old-rent', tag: 'T-14', label: 'إيجار قديم', to: { topic: 'rent', area: 'PRP', ask: ['rent.side'], pre: { 'rent.home': 'rented_old' } } },
            { id: 'new-rent', tag: 'T-15', label: 'إيجار جديد', to: { topic: 'rent', area: 'PRP', ask: ['rent.side'], pre: { 'rent.home': 'rented_new' } } },
            { id: 'sale', tag: 'T-16', label: 'بيع أو شراء عقار', hint: 'العقد والتسجيل في الشهر العقاري', to: { topic: null, area: 'PRP', ask: [] } },
            { id: 'dispute', tag: 'T-17', label: 'نزاع على ملكية أو وضع يد', to: { topic: null, area: 'PRP', ask: [] } },
            { id: 'other', tag: 'T-18', label: 'موضوع آخر في العقارات', to: { topic: null, area: 'PRP', ask: [] } },
          ],
        },
        {
          id: 'work',
          tag: 'T-19',
          label: 'العمل والعمال',
          say: '',
          wa_desc: 'فصل من العمل، أجور ومستحقات، عقود العمل',
          q: 'ما الموضوع؟',
          qtag: 'T-20',
          children: [
            { id: 'dismissal', tag: 'T-21', label: 'فصل من العمل', to: { topic: null, area: 'LAB', ask: [] } },
            { id: 'wages', tag: 'T-22', label: 'أجور أو مستحقات', to: { topic: null, area: 'LAB', ask: [] } },
            { id: 'contract', tag: 'T-23', label: 'عقد العمل', hint: 'مراجعته أو كتابته', to: { topic: null, area: 'LAB', ask: [] } },
            { id: 'other', tag: 'T-24', label: 'موضوع آخر في العمل', to: { topic: null, area: 'LAB', ask: [] } },
          ],
        },
        {
          id: 'contracts',
          tag: 'T-25',
          label: 'العقود والديون',
          say: '',
          wa_desc: 'مراجعة العقود وكتابتها، الشيكات، المطالبات المالية',
          q: 'ما الموضوع؟',
          qtag: 'T-26',
          children: [
            { id: 'review', tag: 'T-27', label: 'مراجعة عقد قبل التوقيع', to: { topic: null, area: 'CIV', ask: [] } },
            { id: 'drafting', tag: 'T-28', label: 'كتابة عقد', to: { topic: null, area: 'CIV', ask: [] } },
            { id: 'cheques', tag: 'T-29', label: 'شيكات أو إيصالات أمانة', to: { topic: null, area: 'CRM', ask: [] } },
            { id: 'debt', tag: 'T-30', label: 'دين أو مطالبة مالية', to: { topic: null, area: 'CIV', ask: [] } },
            { id: 'other', tag: 'T-31', label: 'موضوع آخر في العقود', to: { topic: null, area: 'CIV', ask: [] } },
          ],
        },
        {
          id: 'government',
          tag: 'T-32',
          label: 'المعاش والجهات الحكومية',
          say: '',
          wa_desc: 'صرف المعاش، التأمينات، المستندات الرسمية، القرارات الحكومية',
          q: 'ما الموضوع؟',
          qtag: 'T-33',
          children: [
            { id: 'pension', tag: 'T-34', label: 'المعاش', hint: 'صرفه أو وقفه أو قيمته', to: { topic: 'pen', area: 'PEN', ask: ['pen.whose', 'pen.status'] } },
            { id: 'insurance', tag: 'T-35', label: 'التأمينات الاجتماعية', to: { topic: null, area: 'PEN', ask: [] } },
            { id: 'papers', tag: 'T-36', label: 'مستند رسمي', hint: 'استخراجه أو تصحيح بياناته', to: { topic: 'papers', area: 'ADM', ask: ['papers.doc'] } },
            { id: 'decision', tag: 'T-37', label: 'قرار حكومي', hint: 'التظلم منه أو الطعن عليه', to: { topic: null, area: 'ADM', ask: [] } },
            { id: 'other', tag: 'T-38', label: 'جهة حكومية أخرى', to: { topic: null, area: 'ADM', ask: [] } },
          ],
        },
        { id: 'other', tag: 'T-39', label: 'موضوع آخر', hint: 'أو لا تعرفون التصنيف', wa_desc: 'اكتبوا الموضوع وسنوجّهكم', to: { topic: 'other', area: null, ask: [] } },
      ],
    },
    {
      id: 'litigation',
      tag: 'T-40',
      label: 'رفع دعوى قضائية',
      hint: 'أو الرد على دعوى مرفوعة عليكم',
      staff: 'دعوى قضائية',
      chip: 'دعوى',
      head: 'مرحبًا، أحتاج محاميًا في قضية',
      q: 'ما وضع القضية؟',
      qtag: 'T-41',
      inherit: { ph: 'case' },
      children: [
        { id: 'new', tag: 'T-42', label: 'رفع دعوى جديدة', use: 'litigation-types', inherit: { ask: [] } },
        { id: 'defend', tag: 'T-43', label: 'الرد على دعوى مرفوعة', hint: 'وصلكم إعلان أو رُفعت عليكم دعوى', use: 'litigation-types', inherit: { ask: ['case.next'], urgent_unknown: ['case.next'] } },
        { id: 'ongoing', tag: 'T-44', label: 'قضية أمام المحكمة الآن', use: 'litigation-types', inherit: { ask: ['case.next'] } },
        { id: 'judgment', tag: 'T-45', label: 'صدر حكم', say: 'حكم صادر', hint: 'تنفيذه أو الطعن عليه', use: 'litigation-types', inherit: { ask: ['judgment.when'] } },
        {
          id: 'paper',
          tag: 'T-83',
          label: 'ورقة من المحكمة أو القسم',
          hint: 'ولا تعرفون ما المطلوب',
          wa_desc: 'ولا تعرفون ما المطلوب',
          to: { topic: null, area: null, ask: ['case.next'], urgent_unknown: ['case.next'], ph: 'paper', docs_sub: 'صوّروا الورقة كما هي.' },
        },
      ],
    },
    {
      id: 'company',
      tag: 'T-53',
      label: 'تأسيس شركات',
      hint: 'ومستشار قانوني لشركتكم',
      hint_b2b_off: 'وتعديلها، وعقودها وتراخيصها',
      staff: 'شركات',
      chip: 'شركات',
      head: 'مرحبًا، أرغب في خدمة قانونية لشركة',
      q: 'ما الذي تحتاجونه؟',
      qtag: 'T-54',
      children: [
        {
          id: 'new',
          tag: 'T-55',
          label: 'تأسيس شركة جديدة',
          q: 'ما الشكل القانوني؟',
          qtag: 'T-56',
          inherit: { ph: 'co_new' },
          children: [
            { id: 'one-person', tag: 'T-57', label: 'شركة الشخص الواحد', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'llc', tag: 'T-58', label: 'ذات مسؤولية محدودة', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'jsc', tag: 'T-59', label: 'شركة مساهمة', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'partnership', tag: 'T-60', label: 'تضامن أو توصية بسيطة', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'foreign', tag: 'T-61', label: 'فرع لشركة أجنبية', hint: 'أو مكتب تمثيل', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'undecided', tag: 'T-62', label: 'لم نحدد بعد', hint: 'نساعدكم في الاختيار', to: { topic: null, area: 'COM', ask: [] } },
          ],
        },
        {
          id: 'counsel',
          tag: 'T-63',
          label: 'مستشار قانوني للشركة',
          staff: 'مستشار قانوني',
          hint: 'إدارة قانونية باشتراك شهري',
          wa_desc: 'إدارة قانونية لشركتكم باشتراك شهري',
          q: 'هل لدى شركتكم حساب معنا؟',
          qtag: 'T-64',
          b2b: true,
          children: [
            { id: 'account', tag: 'T-65', label: 'نعم، الدخول إلى بوابة الشركات', portal: true, to: { href: '/company' } },
            { id: 'proposal', tag: 'T-66', label: 'لا، نريد عرضًا', staff: 'طلب عرض', say: '', to: { lead: true, topic: null, area: 'COM', ask: [] } },
          ],
        },
        {
          id: 'change',
          tag: 'T-67',
          label: 'تعديل شركة قائمة',
          wa_desc: 'رأس المال، الشركاء، المدير، النشاط، المقر',
          q: 'ما التعديل؟',
          qtag: 'T-68',
          inherit: { ph: 'co_change', company_name: true },
          children: [
            { id: 'capital', tag: 'T-69', label: 'رأس المال', hint: 'زيادته أو تخفيضه', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'partners', tag: 'T-70', label: 'الشركاء أو المساهمون', hint: 'دخول أو خروج أو نقل حصص', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'management', tag: 'T-71', label: 'المدير أو النشاط أو المقر', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'conversion', tag: 'T-72', label: 'تغيير الشكل القانوني', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'liquidation', tag: 'T-73', label: 'تصفية الشركة', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'other', tag: 'T-74', label: 'تعديل آخر', to: { topic: null, area: 'COM', ask: [] } },
          ],
        },
        {
          id: 'contracts',
          tag: 'T-75',
          label: 'عقد أو ترخيص أو علامة تجارية',
          say: '',
          wa: 'عقود وتراخيص وعلامات',
          wa_desc: 'عقود الشركة، التراخيص والسجل التجاري، العلامات التجارية',
          q: 'ما المطلوب؟',
          qtag: 'T-76',
          inherit: { ph: 'co_contracts', company_name: true },
          children: [
            { id: 'contract', tag: 'T-77', label: 'عقد', hint: 'مراجعته أو كتابته', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'trademark', tag: 'T-78', label: 'علامة تجارية', hint: 'تسجيلها أو حمايتها', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'licence', tag: 'T-79', label: 'ترخيص أو سجل تجاري', to: { topic: null, area: 'COM', ask: [] } },
            { id: 'other', tag: 'T-80', label: 'موضوع آخر', to: { topic: null, area: 'COM', ask: [] } },
          ],
        },
        {
          id: 'other',
          tag: 'T-82',
          label: 'موضوع آخر للشركة',
          hint: 'عمال، ضرائب، تحصيل مستحقات، وغيرها',
          wa_desc: 'نزاع عمالي، ضرائب، تحصيل مستحقات، أو غير ذلك',
          to: { topic: null, area: 'COM', ask: [], ph: 'co_contracts', company_name: true },
        },
      ],
    },
  ],
  shared: {
    'litigation-types': {
      q: 'ما نوع القضية؟',
      qtag: 'T-46',
      children: [
        { id: 'family', tag: 'T-47', label: 'أسرة وميراث', hint: 'طلاق، نفقة، حضانة، تركات', to: { topic: null, area: 'FAM' } },
        { id: 'property', tag: 'T-48', label: 'إيجار وعقارات', to: { topic: null, area: 'PRP' } },
        { id: 'labour', tag: 'T-49', label: 'عمل وعمال', to: { topic: null, area: 'LAB' } },
        { id: 'civil', tag: 'T-50', label: 'مدني وتجاري', hint: 'عقود، ديون، تعويضات', to: { topic: null, area: 'CIV' } },
        { id: 'criminal', tag: 'T-51', label: 'جنائي', hint: 'جنح وجنايات وشيكات', to: { topic: null, area: 'CRM' } },
        { id: 'other', tag: 'T-52', label: 'نوع آخر', hint: 'أو لا تعرفون', to: { topic: null, area: null } },
      ],
    },
  },
  // يظهر تحت الاختيارات الثلاثة فقط حين تُعاد الخدمة الخيرية (E12-29)، وليس صفًا رابعًا
  restored: { tag: 'T-81', text: 'تبحثون عن مساعدة قانونية مجانية؟', go: 'خيري', href: '/khayri' },
});

/** الخطوط الثلاثة (E12-03) من عُقد المستوى الأول نفسها: مصدر واحد للكلمات (L12-82) */
export const LINES = deepFreeze(
  Object.fromEntries(
    TREE.children.map((n) => [n.id, { tag: n.tag, label: n.label, hint: n.hint, hint_b2b_off: n.hint_b2b_off || null, staff: n.staff, chip: n.chip, head: n.head }]),
  ),
);

// ───────────── أسئلة الطلب (E12-04 + r2 L12-52، L12-55) ─────────────

/** رموز شاشات الأسئلة في طلب الأفراد والشركات (topics.js لا يُمس) */
export const QUESTION_TAGS = deepFreeze({
  'inh.deceased': 'I-11', 'inh.certificate': 'I-12', 'pen.whose': 'I-13', 'pen.status': 'I-14',
  'guardianship.where': 'I-15', 'alimony.father': 'I-16', 'custody.issue': 'I-17', 'children': 'I-18', 'rent.home': 'I-19',
  'rent.evict': 'I-20', 'papers.doc': 'I-21', 'case.next': 'I-22',
  'judgment.when': 'I-23', 'alimony.for': 'I-24', 'rent.side': 'I-25',
});

/** أسئلة لا تُسأل إلا في طلب الأفراد والشركات. urgent على الإجابة، وunknown_urgent على السؤال = «لا أعرف» عاجلة */
export const TREE_QUESTIONS = deepFreeze({
  'case.next': {
    id: 'case.next',
    tag: QUESTION_TAGS['case.next'],
    staff_title: 'أقرب جلسة أو موعد',
    h1: 'هل هناك جلسة أو موعد قريب؟',
    answers: [
      { value: 'soon', label: 'خلال أسبوعين', staff: 'خلال 14 يومًا', urgent: true },
      { value: 'later', label: 'بعد أكثر من أسبوعين', staff: 'بعد أكثر من 14 يومًا' },
      { value: 'none', label: 'لا يوجد موعد بعد', staff: 'لا يوجد موعد' },
    ],
  },
  'judgment.when': {
    id: 'judgment.when',
    tag: QUESTION_TAGS['judgment.when'],
    staff_title: 'تاريخ صدور الحكم',
    h1: 'متى صدر الحكم؟',
    unknown_urgent: true,
    answers: [
      { value: 'recent', label: 'خلال آخر أسبوعين', staff: 'خلال 14 يومًا', urgent: true },
      { value: 'mid', label: 'من أسبوعين إلى 40 يومًا', staff: 'من 15 إلى 40 يومًا', urgent: true },
      { value: 'old', label: 'منذ أكثر من 40 يومًا', staff: 'أكثر من 40 يومًا' },
    ],
  },
  'alimony.for': {
    id: 'alimony.for',
    tag: QUESTION_TAGS['alimony.for'],
    staff_title: 'النفقة مطلوبة لـ',
    h1: 'النفقة لمن؟',
    answers: [
      { value: 'wife', label: 'للزوجة', staff: 'الزوجة' },
      { value: 'children', label: 'للأبناء', staff: 'الأبناء' },
      { value: 'both', label: 'للزوجة والأبناء', staff: 'الزوجة والأبناء' },
      { value: 'payer', label: 'مطلوب منّا دفعها', staff: 'مقدّم الطلب مطالَب بدفعها' },
    ],
  },
  'rent.side': {
    id: 'rent.side',
    tag: QUESTION_TAGS['rent.side'],
    staff_title: 'صفة مقدّم الطلب',
    h1: 'أنتم المالك أم المستأجر؟',
    answers: [
      { value: 'owner', label: 'المالك', staff: 'المالك' },
      { value: 'tenant', label: 'المستأجر', staff: 'المستأجر' },
    ],
  },
});

/**
 * أسئلة topics.js بكلمات الأفراد والشركات (E12-41: نفس القيم وترتيب الإجابات؛ صيغ محايدة لا تفترض أرملة).
 * alimony.father وrent.home وrent.evict لم تعد تُعرض في طلب الأفراد والشركات (L12-55) وتبقى للسجل فقط.
 */
export const PAID_QUESTIONS = deepFreeze({
  'inh.deceased': { h1: 'من المتوفى؟', a: ['الزوج أو الزوجة', 'أحد الوالدين', 'ابن أو ابنة', 'شخص آخر'] },
  'inh.certificate': { h1: 'هل صدر إعلام الوراثة؟', sub: 'حكم من المحكمة يحدد الورثة', a: ['نعم، صدر', 'ليس بعد'] },
  'pen.whose': { h1: 'معاش مَن؟', a: ['معاش الزوج أو الزوجة', 'معاش أحد الوالدين', 'تكافل وكرامة', 'معاشي أو غير ذلك'] },
  'pen.status': { h1: 'هل يُصرف المعاش الآن؟', a: ['لم يُصرف بعد', 'كان يُصرف وتوقف', 'يُصرف بقيمة أقل'] },
  'guardianship.where': { h1: 'أين أموال القاصرين؟', a: ['في البنك', 'في البريد', 'تركة لم تُقسم', 'أخرى'] },
  'alimony.father': { h1: 'النفقة: ما الوضع الآن؟', a: ['الأب متوفى', 'الوالدان منفصلان', 'الأب لا ينفق', 'غير ذلك'] },
  'custody.issue': { h1: 'ما المشكلة؟', a: ['نزاع على الحضانة', 'لا أرى أبنائي', 'مشكلة في مواعيد الرؤية', 'أخرى'] },
  children: { h1: 'كم عدد الأبناء أقل من 18 سنة؟', a: ['1', '2', '3', '4 أو أكثر'] },
  'rent.home': { h1: 'هل السكن إيجار أم ملك؟', a: ['إيجار قديم', 'إيجار جديد', 'ملك', 'لدى الأسرة'] },
  'rent.evict': { h1: 'هل هناك مطالبة بإخلاء السكن؟', a: ['نعم', 'لا'] },
  'papers.doc': { h1: 'ما المستند المطلوب؟', a: ['شهادة وفاة', 'قيد عائلي', 'بطاقة أو شهادة ميلاد', 'مستند آخر'] },
});

/** «لا أعرف»: آخر صف في كل سؤال (بلون النص الثانوي) */
export const PAID_UNKNOWN = deepFreeze({ value: 'unknown', label: 'لا أعرف', staff: 'لا يعرف' });

/** إجابات إضافية في طلب الأفراد والشركات فقط، تُعرض أولًا: [القيمة، الكلمة، كلمة الفريق] (L12-55) */
export const PAID_EXTRA_ANSWERS = deepFreeze({ children: [['none', 'لا يوجد', 'لا يوجد']] });

/** رموز صفوف الإجابات: '<سؤال>:<قيمة>'، بترتيب QUESTIONS ثم TREE_QUESTIONS، والإضافية أولًا و«لا أعرف» أخيرًا */
export const ANSWER_TAGS = deepFreeze({
  'inh.deceased:husband': 'I-80', 'inh.deceased:parent': 'I-81', 'inh.deceased:child': 'I-82',
  'inh.deceased:other': 'I-83', 'inh.deceased:unknown': 'I-84', 'inh.certificate:yes': 'I-85',
  'inh.certificate:no': 'I-86', 'inh.certificate:unknown': 'I-87', 'pen.whose:husband': 'I-88',
  'pen.whose:parent': 'I-89', 'pen.whose:takaful': 'I-90', 'pen.whose:other': 'I-91', 'pen.whose:unknown': 'I-92',
  'pen.status:never': 'I-93', 'pen.status:stopped': 'I-94', 'pen.status:less': 'I-95', 'pen.status:unknown': 'I-96',
  'guardianship.where:bank': 'I-97', 'guardianship.where:post': 'I-98', 'guardianship.where:estate': 'I-99',
  'guardianship.where:other': 'I-100', 'guardianship.where:unknown': 'I-101', 'alimony.father:deceased': 'I-102',
  'alimony.father:divorced': 'I-103', 'alimony.father:absent': 'I-104', 'alimony.father:other': 'I-105',
  'alimony.father:unknown': 'I-106', 'custody.issue:take': 'I-107', 'custody.issue:nosee': 'I-108',
  'custody.issue:visit': 'I-109', 'custody.issue:other': 'I-110', 'custody.issue:unknown': 'I-111',
  'children:none': 'I-112', 'children:1': 'I-113', 'children:2': 'I-114', 'children:3': 'I-115', 'children:4': 'I-116',
  'children:unknown': 'I-117', 'rent.home:rented_old': 'I-118', 'rent.home:rented_new': 'I-119',
  'rent.home:owned': 'I-120', 'rent.home:family': 'I-121', 'rent.home:unknown': 'I-122', 'rent.evict:yes': 'I-123',
  'rent.evict:no': 'I-124', 'rent.evict:unknown': 'I-125', 'papers.doc:death': 'I-126', 'papers.doc:family': 'I-127',
  'papers.doc:id': 'I-128', 'papers.doc:other': 'I-129', 'papers.doc:unknown': 'I-130', 'case.next:soon': 'I-131',
  'case.next:later': 'I-132', 'case.next:none': 'I-133', 'case.next:unknown': 'I-134', 'judgment.when:recent': 'I-135',
  'judgment.when:mid': 'I-136', 'judgment.when:old': 'I-137', 'judgment.when:unknown': 'I-138',
  'alimony.for:wife': 'I-139', 'alimony.for:children': 'I-140', 'alimony.for:both': 'I-141',
  'alimony.for:payer': 'I-142', 'alimony.for:unknown': 'I-143', 'rent.side:owner': 'I-144',
  'rent.side:tenant': 'I-145', 'rent.side:unknown': 'I-146',
});

/** نص مربع القصة لكل نوع ورقة (E12-05 + r2 L12-53) */
export const PLACEHOLDERS = deepFreeze({
  consult: 'ماذا حدث، وما الذي تريدون معرفته؟',
  case: 'ما موضوع الدعوى، ومن الطرف الآخر، وما آخر ما حدث؟',
  co_new: 'النشاط، وعدد الشركاء، والمحافظة، ورأس المال المتوقع.',
  co_change: 'اسم الشركة، والتعديل المطلوب.',
  co_contracts: 'ما المطلوب تحديدًا، ولأي نشاط.',
  paper: 'ما الورقة التي وصلتكم، ومتى وصلت؟',
});

/** السطر تحت «هل لديكم مستندات؟» لكل خط (L12-86)؛ docs_sub في الورقة يغلبه */
export const DOCS_SUB = deepFreeze({
  consultation: 'عقد أو إيصال أو أي ورقة تخص الموضوع.',
  litigation: 'صحيفة الدعوى أو الإعلان أو الحكم.',
  company: 'السجل التجاري أو العقد أو الترخيص.',
});

/** مصدر المسار كما يراه الفريق (E12-50) */
export const PATHWAY_SOURCES = deepFreeze({ website: 'من الموقع', wa_menu: 'من قائمة واتساب', wa_tag: 'من رسالة واتساب الجاهزة', staff: 'عدّله الفريق' });

// ───────────── المفاتيح القديمة (E12-06) ─────────────

/** مفاتيح مواضيع 9.2/11.0 (وأسماؤها القديمة تمر أولًا على topicByKey) ← مسار؛ مسار صفحة يفتح الصفحة ليختار الزائر */
export const TOPIC_TO_PATH = deepFreeze({
  inh: 'consultation/family/inheritance',
  pen: 'consultation/government/pension',
  guardianship: 'consultation/family/minors',
  alimony: 'consultation/family/alimony',
  custody: 'consultation/family/custody',
  rent: 'consultation/property',
  papers: 'consultation/government/papers',
  other: 'consultation/other',
});
/** مجالات LEGAL_AREAS ← مسار (أول جزء = الخط المقترح للطلبات بلا مسار، L12-81) */
export const AREA_TO_PATH = deepFreeze({
  INH: 'consultation/family/inheritance',
  FAM: 'consultation/family',
  GRD: 'consultation/family/minors',
  PEN: 'consultation/government/pension',
  PRP: 'consultation/property',
  CIV: 'consultation/contracts',
  LAB: 'consultation/work',
  CRM: 'litigation',
  COM: 'company',
  TAX: 'consultation/other',
  ADM: 'consultation/government',
  GEN: 'consultation/other',
});
/** 'مسار/قديم': 'مسار/جديد' — لا يُحذف معرّف منشور أبدًا؛ يُحال هنا (301 للصفحات، ويُحوَّل عند الإرسال). يُتحقق منه عند التحميل */
export const RETIRED = deepFreeze({});

export const PATH_RE = /^[a-z0-9-]{1,24}(?:\/[a-z0-9-]{1,24}){0,2}$/;

// ───────────── الفهرس (يُبنى مرة عند التحميل) ─────────────

const NODES = new Map(); // مسار ← { path, node, parent, kind: 'page'|'leaf'|'exit', q, qtag, kids: [مسار], leaf }
const ORDER = []; // المسارات بترتيب الشجرة (للصفحات والأوراق)

function kidsOf(node) {
  return node.use ? TREE.shared[node.use].children : node.children || null;
}
function qOf(node) {
  return node.use ? TREE.shared[node.use] : node;
}
function mergeInherit(inh, more) {
  if (!more) return inh;
  const out = { ...inh, ...more };
  for (const k of ['ask', 'urgent_unknown']) if (more[k]) out[k] = [...(inh[k] || []), ...more[k]];
  return out;
}

function makeLeaf(path, chain, inh) {
  const node = chain[chain.length - 1];
  const to = node.to || {};
  const line = chain[0].id;
  const exit = typeof to.href === 'string';
  const ph = to.ph ?? inh.ph ?? null;
  return deepFreeze({
    path,
    line,
    depth: chain.length,
    labels: chain.map((n) => n.label),
    staff: chain.map((n, i) => (i === 0 ? n.chip : n.staff ?? n.label)),
    tags: chain.map((n) => n.tag),
    topic: exit ? null : to.topic ?? null,
    area: exit ? null : to.area ?? null,
    ask: exit ? [] : [...(inh.ask || []), ...(to.ask || [])],
    pre: exit ? {} : { ...(to.pre || {}) },
    ph: exit || to.lead ? null : ph,
    company_name: !exit && !!(to.company_name ?? inh.company_name),
    lead: !!to.lead,
    href: exit ? to.href : null,
    exit,
    urgent_unknown: exit ? [] : [...(inh.urgent_unknown || []), ...(to.urgent_unknown || [])],
    docs_sub: exit || to.lead ? null : to.docs_sub ?? DOCS_SUB[line] ?? null,
  });
}

(function build() {
  const walk = (node, path, chain, inh) => {
    const kids = kidsOf(node);
    const q = qOf(node);
    if (kids) {
      const here = mergeInherit(inh, node.inherit);
      const rec = { path, node, parent: chain.length > 1 ? chain.slice(0, -1).map((n) => n.id).join('/') : chain.length === 1 ? '' : null, kind: 'page', q: q.q, qtag: q.qtag, kids: [], leaf: null };
      NODES.set(path, rec);
      ORDER.push(path);
      for (const k of kids) {
        const p = path ? `${path}/${k.id}` : k.id;
        rec.kids.push(p);
        walk(k, p, [...chain, k], here);
      }
    } else {
      const leaf = makeLeaf(path, chain, inh);
      NODES.set(path, { path, node, parent: chain.slice(0, -1).map((n) => n.id).join('/'), kind: leaf.exit ? 'exit' : 'leaf', q: null, qtag: null, kids: [], leaf });
      ORDER.push(path);
    }
  };
  walk(TREE, '', [], {});
})();

// RETIRED: كل هدف موجود، ولا دوائر (L12-76) — وإلا يفشل التشغيل
(function checkRetired() {
  for (const [from, to] of Object.entries(RETIRED)) {
    if (!PATH_RE.test(from) || !PATH_RE.test(to)) throw new Error(`entry-tree RETIRED: bad path ${from} → ${to}`);
    if (NODES.has(from)) throw new Error(`entry-tree RETIRED: ${from} is still a live node`);
    const seen = new Set([from]);
    let cur = to;
    while (Object.hasOwn(RETIRED, cur)) {
      if (seen.has(cur)) throw new Error(`entry-tree RETIRED: cycle at ${cur}`);
      seen.add(cur);
      cur = RETIRED[cur];
    }
    if (!NODES.has(cur)) throw new Error(`entry-tree RETIRED: target ${cur} does not exist`);
  }
})();

/** سياق العرض (L12-63): خدمة الشركات مفعّلة؟ بوابة الشركات مفتوحة؟ (الافتراضي نعم لكليهما للاختبارات والسجل) */
function ctxOf(ctx) {
  const b2b = !ctx || ctx.b2b !== false;
  return { b2b, portal: b2b && (!ctx || ctx.portal !== false) };
}

/** هل العقدة (وكل آبائها) ظاهرة في هذا السياق؟ */
function visible(path, c) {
  let p = path;
  while (p) {
    const rec = NODES.get(p);
    if (!rec) return false;
    if ((rec.node.b2b && !c.b2b) || (rec.node.portal && !c.portal)) return false;
    const i = p.lastIndexOf('/');
    p = i < 0 ? '' : p.slice(0, i);
  }
  return true;
}
function visibleKids(path, c) {
  const rec = NODES.get(path);
  return rec ? rec.kids.filter((k) => visible(k, c)) : [];
}
/** الهدف الفعلي: صفحة بقي فيها اختيار واحد تُتخطى إليه (بوابة الشركات مغلقة ← «لا، نريد عرضًا») */
function target(path, c) {
  let p = path;
  for (let i = 0; i < 4; i++) {
    const rec = NODES.get(p);
    if (!rec || rec.kind !== 'page' || !p) return p;
    const kids = visibleKids(p, c);
    if (kids.length !== 1) return p;
    p = kids[0];
  }
  return p;
}

/** تطبيق RETIRED على أطول بادئة مطابقة، مكررًا حتى يستقر (لا دوائر: تحققنا عند التحميل) */
function applyRetired(path) {
  let p = path;
  for (let guard = 0; guard < 8; guard++) {
    const segs = p.split('/');
    let hit = false;
    for (let n = segs.length; n >= 1; n--) {
      const key = segs.slice(0, n).join('/');
      if (Object.hasOwn(RETIRED, key)) {
        p = [RETIRED[key], ...segs.slice(n)].join('/');
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return p;
}

function hrefOf(path, c) {
  const t = target(path, c);
  const rec = NODES.get(t);
  if (!rec) return '/';
  if (rec.kind === 'exit') return rec.leaf.href;
  if (rec.kind === 'leaf') return `/intake?path=${t}`;
  return t ? `/start/${t}` : '/';
}

/** رابط الصفحة الأب الظاهرة (لـ«رجوع») */
function backOf(path, c) {
  let p = NODES.get(path)?.parent ?? '';
  while (p) {
    if (visible(p, c) && target(p, c) === p) return `/start/${p}`;
    p = NODES.get(p)?.parent ?? '';
  }
  return '/';
}

// ───────────── الواجهة (E12-01) ─────────────

/**
 * مسار (بعد RETIRED وسياق العرض) ← { path, node, leaf, exit, depth } أو null.
 * الجذر ليس مسارًا ('' = null). صفحة تُتخطى في هذا السياق تُحل إلى هدفها (path يختلف عن المدخل).
 */
export function resolvePath(raw, ctx) {
  if (typeof raw !== 'string' || !raw || raw.length > 80) return null;
  if (!PATH_RE.test(raw)) return null;
  const c = ctxOf(ctx);
  const mapped = applyRetired(raw);
  if (!PATH_RE.test(mapped) || !NODES.has(mapped) || !visible(mapped, c)) return null;
  const p = target(mapped, c);
  const rec = NODES.get(p);
  if (!rec) return null;
  return { path: p, node: rec.node, leaf: rec.kind !== 'page', exit: rec.kind === 'exit', depth: p.split('/').length };
}

/**
 * صفحة اختيار (الجذر = '') ← { path, q, qtag, depth, trail:[{id,label,tag}], options:[{id,path,label,hint,tag,href,kind,wa,wa_desc}], back }
 * أو null (ليست صفحة، أو مخفية، أو تُتخطى في هذا السياق). depth: 1 للصفحة الأولى، 2 و3 بعدها. الروابط بلا معاملات الحملة.
 */
export function pageOf(path, ctx) {
  const c = ctxOf(ctx);
  const p = path === null || path === undefined || path === '/' ? '' : String(path);
  const rec = NODES.get(p);
  if (!rec || rec.kind !== 'page') return null;
  if (p && (!visible(p, c) || target(p, c) !== p)) return null;
  const chain = [];
  if (p) {
    let acc = '';
    for (const id of p.split('/')) {
      acc = acc ? `${acc}/${id}` : id;
      const n = NODES.get(acc).node;
      chain.push({ id: n.id, label: n.label, tag: n.tag });
    }
  }
  const options = visibleKids(p, c).map((k) => {
    const n = NODES.get(k).node;
    const t = NODES.get(target(k, c));
    const hint = !p && n.hint_b2b_off && !c.b2b ? n.hint_b2b_off : n.hint || null;
    return { id: n.id, path: k, label: n.label, hint, tag: n.tag, href: hrefOf(k, c), kind: t ? t.kind : 'page', wa: n.wa || null, wa_desc: n.wa_desc || hint || null };
  });
  return { path: p, q: rec.q, qtag: rec.qtag, depth: chain.length + 1, trail: chain, options, back: p ? backOf(p, c) : null };
}

/** بيانات الورقة (أو المخرج) ← { path, line, depth, labels, staff, tags, topic, area, ask, pre, ph, company_name, lead, href, exit, urgent_unknown, docs_sub } أو null */
export function leafOf(path, ctx) {
  const r = resolvePath(path, ctx);
  if (!r || !r.leaf) return null;
  return NODES.get(r.path).leaf;
}

/** أسئلة الورقة بالترتيب */
export function flowForPath(path) {
  const leaf = leafOf(path);
  return leaf ? leaf.ask.slice() : [];
}

function validAnswer(id, v) {
  if (v === PAID_UNKNOWN.value) return true;
  if (QUESTIONS[id]?.answers.some((x) => x.value === v)) return true;
  if (TREE_QUESTIONS[id]?.answers.some((x) => x.value === v)) return true;
  return !!PAID_EXTRA_ANSWERS[id]?.some((x) => x[0] === v);
}

/** يُبقي أسئلة الورقة فقط بقيم معروفة أو 'unknown'، ثم يدمج المُجاب مسبقًا (pre يغلب)؛ ويُسقط الباقي بصمت */
export function sanitizePathAnswers(path, answers) {
  const leaf = leafOf(path);
  const out = {};
  if (!leaf || leaf.exit) return out;
  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    for (const id of leaf.ask) {
      if (!Object.hasOwn(answers, id)) continue;
      const raw = answers[id];
      if (raw === null || raw === undefined || typeof raw === 'object') continue;
      const v = String(raw).trim();
      if (validAnswer(id, v)) out[id] = v;
    }
  }
  for (const [k, v] of Object.entries(leaf.pre)) out[k] = v;
  return out;
}

function chainOf(path) {
  const mapped = typeof path === 'string' && PATH_RE.test(path) ? applyRetired(path) : null;
  if (!mapped || !NODES.has(mapped)) return null;
  const out = [];
  let acc = '';
  for (const id of mapped.split('/')) {
    acc = acc ? `${acc}/${id}` : id;
    out.push(NODES.get(acc).node);
  }
  return out;
}

/** كلمات المسار بعد الجذر؛ staff: كلمة الفريق (أول جزء = اسم الخط القصير «دعوى»، ثم staff أو الاسم) */
export function trail(path, { staff = false } = {}) {
  const chain = chainOf(path);
  if (!chain) return [];
  return chain.map((n, i) => (staff ? (i === 0 ? n.chip : n.staff ?? n.label) : n.label));
}

/** رموز صفوف المسار (للعرض عند الطلب وللاختبارات) */
function tagsOf(path) {
  const chain = chainOf(path);
  return chain ? chain.map((n) => n.tag) : [];
}

/** جملة واتساب الجاهزة (E12-07): «{بداية الخط} بخصوص {ما يُقال}، {…}.»؛ المسار ذو الخط وحده = «{بداية الخط}.» */
export function prefillFor(path) {
  const chain = chainOf(path);
  if (!chain) return null;
  const last = NODES.get(applyRetired(path));
  if (last?.kind === 'exit') return null;
  const head = chain[0].head;
  const says = chain
    .slice(1)
    .map((n) => (n.say === undefined ? n.label : n.say))
    .filter(Boolean);
  return says.length ? `${head} بخصوص ${says.join('، ')}.` : `${head}.`;
}

// نفس تطبيع segment.js N(): NFC، بلا تشكيل ولا تطويل ولا علامات اتجاه، أشكال الألف والتاء المربوطة والياء موحدة، فاصلة واحدة
const N = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/,/g, '،')
    .replace(/\s+/g, ' ')
    .trim();

const PREFILL_INDEX = new Map(); // جملة مطبّعة بلا النقطة ← مسار ورقة
for (const p of ORDER) {
  const rec = NODES.get(p);
  if (rec.kind !== 'leaf') continue;
  PREFILL_INDEX.set(N(prefillFor(p).slice(0, -1)), p);
}

/** أول جملة في الرسالة = جملة ورقة جاهزة ← { path, rest } (rest = بقية الرسالة، القصة)، وإلا null */
export function pathFromPrefill(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const end = raw.search(/[.!؟?\n]/);
  const sentence = N(end < 0 ? raw : raw.slice(0, end));
  const path = PREFILL_INDEX.get(sentence);
  if (!path) return null;
  return { path, rest: end < 0 ? '' : raw.slice(end + 1).trim() };
}

const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
/** رسالة كاملة قصيرة ← كلمات وأرقام فقط (بلا ترقيم)، أو '' */
function shortWords(text) {
  const s = N(text)
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 30 ? '' : s;
}

const LINE_WORDS = {
  consultation: ['1', 'استشاره', 'استشاره قانونيه'],
  litigation: ['2', 'دعوي', 'قضيه', 'رفع دعوي', 'رفع دعوي قضائيه', 'دعوي قضائيه', 'محامي'],
  company: ['3', 'شركه', 'شركات', 'تاسيس', 'تاسيس شركات', 'تاسيس شركه'],
};
/** ردّ مكتوب على أزرار الخطوط (E12-84) ← 'consultation'|'litigation'|'company' أو null */
export function lineFromText(text) {
  const s = shortWords(text);
  if (!s) return null;
  for (const [line, words] of Object.entries(LINE_WORDS)) if (words.includes(s)) return line;
  return null;
}

/** ردّ مكتوب على قائمة المستوى الثاني ← مسار الصف (بعنوانه أو رقمه في القائمة) أو null */
export function rowFromText(parentPath, text, ctx) {
  const page = pageOf(parentPath, ctx);
  if (!page || !page.path) return null;
  const s = shortWords(text);
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const i = Number(s) - 1;
    return page.options[i] ? page.options[i].path : null;
  }
  const hit = page.options.find((o) => N(o.label) === s || (o.wa && N(o.wa) === s));
  return hit ? hit.path : null;
}

/** كل صفحات الاختيار الظاهرة في السياق (17 افتراضيًا)، بترتيب الشجرة */
export function allPages(ctx) {
  return ORDER.filter((p) => NODES.get(p).kind === 'page')
    .map((p) => pageOf(p, ctx))
    .filter(Boolean);
}

/** كل الأوراق بلا سياق (69 ورقة طلب + مخرج واحد)، بترتيب الشجرة */
export function allLeaves() {
  return ORDER.filter((p) => NODES.get(p).kind !== 'page').map((p) => NODES.get(p).leaf);
}

/** كلمة صف إجابة في طلب الأفراد والشركات */
function answerRows(id) {
  const rows = [];
  for (const [v, label] of PAID_EXTRA_ANSWERS[id] || []) rows.push([v, label]);
  if (TREE_QUESTIONS[id]) for (const a of TREE_QUESTIONS[id].answers) rows.push([a.value, a.label]);
  else if (QUESTIONS[id]) QUESTIONS[id].answers.forEach((a, i) => rows.push([a.value, PAID_QUESTIONS[id]?.a[i] ?? a.label]));
  rows.push([PAID_UNKNOWN.value, PAID_UNKNOWN.label]);
  return rows;
}
function questionH1(id) {
  return TREE_QUESTIONS[id]?.h1 ?? PAID_QUESTIONS[id]?.h1 ?? null;
}

/** كل رموز هذه الوحدة مع كلماتها (السجل والاختبارات): T- للشجرة، وI- لشاشات الأسئلة وصفوف إجاباتها */
export function allTags() {
  const out = [{ tag: TREE.qtag, label: TREE.q, kind: 'question', path: '' }];
  const seen = new Set([TREE.qtag]);
  for (const p of ORDER) {
    if (!p) continue;
    const rec = NODES.get(p);
    if (!seen.has(rec.node.tag)) {
      seen.add(rec.node.tag);
      out.push({ tag: rec.node.tag, label: rec.node.label, kind: 'option', path: p });
    }
    if (rec.kind === 'page' && p && !seen.has(rec.qtag)) {
      seen.add(rec.qtag);
      out.push({ tag: rec.qtag, label: rec.q, kind: 'question', path: p });
    }
  }
  out.push({ tag: TREE.restored.tag, label: TREE.restored.text, kind: 'restored', path: null });
  for (const [id, tag] of Object.entries(QUESTION_TAGS)) out.push({ tag, label: questionH1(id), kind: 'intake_question', question: id });
  for (const id of Object.keys(QUESTION_TAGS)) {
    for (const [v, label] of answerRows(id)) out.push({ tag: ANSWER_TAGS[`${id}:${v}`], label, kind: 'intake_answer', question: id, value: v });
  }
  const num = (t) => [t.split('-')[0], Number(t.split('-')[1])];
  return out.sort((a, b) => {
    const [pa, na] = num(a.tag);
    const [pb, nb] = num(b.tag);
    return pa === pb ? na - nb : pa < pb ? 1 : -1; // T قبل I
  });
}

/**
 * بيانات ورقة الطلب المضمّنة في صفحة /intake كما هي (E12-33، ≤ 1,024 بايت بعد JSON.stringify): null لغير أوراق الطلب.
 * { v, path, line, trail:[كلمات], tags:[T-…], back, ask:[{ id, tag, h1, [sub], answers:[[القيمة، الكلمة، الرمز]…] }],
 *   [pre], ph, [company_name], [lead], [topic], wa, [docs_sub], name_prefix }
 * ولتبقى داخل الميزانية: «لا أعرف» آخر صف في answers بكلمته ورمزه؛ ph مفتاح في PLACEHOLDERS (نصوصها في bm-copy)؛
 * docs_sub فقط حين تغلب الورقة DOCS_SUB[line]؛ والمفاتيح بين [ ] تُحذف حين تكون فارغة/false/null.
 * name_prefix = اسم الورقة (بادئة أسماء الملفات المصوّرة، L12-86).
 */
export function bmPathFor(path, ctx) {
  const c = ctxOf(ctx);
  const r = resolvePath(path, c);
  if (!r || !r.leaf || r.exit) return null;
  const leaf = NODES.get(r.path).leaf;
  const ask = leaf.ask.map((id) => {
    const q = { id, tag: QUESTION_TAGS[id], h1: questionH1(id) };
    const sub = PAID_QUESTIONS[id]?.sub;
    if (sub && !TREE_QUESTIONS[id]) q.sub = sub;
    q.answers = answerRows(id).map(([v, label]) => [v, label, ANSWER_TAGS[`${id}:${v}`]]);
    return q;
  });
  const out = { v: TREE_VERSION, path: leaf.path, line: leaf.line, trail: leaf.labels.slice(), tags: leaf.tags.slice(), back: backOf(leaf.path, c), ask };
  if (Object.keys(leaf.pre).length) out.pre = { ...leaf.pre };
  out.ph = leaf.ph;
  if (leaf.company_name) out.company_name = true;
  if (leaf.lead) out.lead = true;
  if (leaf.topic) out.topic = leaf.topic;
  out.wa = prefillFor(leaf.path);
  if (leaf.docs_sub && leaf.docs_sub !== DOCS_SUB[leaf.line]) out.docs_sub = leaf.docs_sub;
  out.name_prefix = leaf.labels[leaf.labels.length - 1];
  return out;
}

/**
 * هل الطلب عاجل؟ (L12-52): إجابة عليها urgent (case.next=soon، judgment.when=recent|mid)، أو «لا أعرف» على سؤال
 * unknown_urgent (judgment.when) أو على سؤال في urgent_unknown للورقة (case.next في الرد على دعوى وورقة المحكمة).
 */
export function isUrgent(path, answers) {
  const leaf = leafOf(path);
  if (!leaf || leaf.exit) return false;
  const a = sanitizePathAnswers(path, answers);
  for (const id of leaf.ask) {
    const v = a[id];
    if (v === undefined) continue;
    const q = TREE_QUESTIONS[id];
    if (v === PAID_UNKNOWN.value) {
      if (q?.unknown_urgent || leaf.urgent_unknown.includes(id)) return true;
      continue;
    }
    if (q?.answers.some((x) => x.value === v && x.urgent)) return true;
  }
  return false;
}

// عنوان الفريق المحايد في طلب الأفراد والشركات حين يفترض عنوان topics.js امرأة
const PAID_STAFF_TITLE = { children: 'عدد الأبناء أقل من 18 سنة' };

/** سطور الإجابات للفريق بترتيب أسئلة الورقة: «{staff_title}: {staff}» (كلمات الفريق، لا كلمات العميل) */
export function staffAnswerLines(path, answers) {
  const leaf = leafOf(path);
  if (!leaf || leaf.exit) return [];
  const a = sanitizePathAnswers(path, answers);
  const lines = [];
  for (const id of leaf.ask) {
    const v = a[id];
    if (v === undefined) continue;
    const tq = TREE_QUESTIONS[id];
    const q = tq || QUESTIONS[id];
    if (!q) continue;
    let staff = null;
    if (v === PAID_UNKNOWN.value) staff = PAID_UNKNOWN.staff;
    else staff = q.answers.find((x) => x.value === v)?.staff ?? PAID_EXTRA_ANSWERS[id]?.find((x) => x[0] === v)?.[2] ?? null;
    if (staff) lines.push(`${PAID_STAFF_TITLE[id] || q.staff_title}: ${staff}`);
  }
  return lines;
}

/** عدد الصفحات بعربية سليمة (L12-86): صفحة واحدة · صفحتان · 3–10 صفحات · 11 صفحة فأكثر (وكذلك 101، 102…) */
export function pagesAr(n) {
  const k = Math.max(0, Math.round(Number(n) || 0));
  if (k === 1) return 'صفحة واحدة';
  if (k === 2) return 'صفحتان';
  const r = k % 100;
  return r >= 3 && r <= 10 ? `${k} صفحات` : `${k} صفحة`;
}
