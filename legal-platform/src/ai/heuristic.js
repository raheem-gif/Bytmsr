// المحلل المحلي (بدون إنترنت): قواعد عربية لتصنيف الطلب واستخراج الوقائع والمعلومات الناقصة واقتراح المسائل.
// هذا «مساعد بسيط» كما في المرحلة الأولى من المنظومة؛ عند ضبط مفتاح Claude يُستخدم نموذج لغوي بدلًا منه.
import { normalizeArabic, truncate } from '../util.js';
import { LEGAL_AREAS } from '../constants.js';
import { wordForms, sentences } from './text.js';

const n = normalizeArabic;

// معجم المجالات: [كلمة/عبارة, وزن]. العبارات متعددة الكلمات تُطابَق كنص، والمفردة تُطابَق مع أشكال الكلمات.
const LEXICON = {
  INH: [['ميراث', 3], ['مواريث', 3], ['ورث', 2], ['ورثه', 3], ['الورثه', 3], ['تركه', 2], ['المتوفي', 2], ['توفي', 2], ['توفيت', 2], ['اتوفي', 2], ['اتوفت', 2], ['وفاه', 2], ['اعلام وراثه', 4], ['اعلام الوراثه', 4], ['اعلام شرعي', 4], ['نصيب', 2], ['انصبه', 2], ['قسمه', 2], ['وصيه', 2], ['المرحوم', 2], ['المرحومه', 2], ['الله يرحمه', 2], ['الله يرحمها', 2], ['قاصر', 1], ['القصر', 1], ['فرز وتجنيب', 2]],
  FAM: [['طلاق', 3], ['طلقني', 3], ['طلقها', 3], ['نفقه', 3], ['حضانه', 3], ['رؤيه', 2], ['خلع', 3], ['زواج', 2], ['جواز', 2], ['مهر', 2], ['قايمه منقولات', 4], ['منقولات', 2], ['عده', 1], ['متعه', 2], ['زوجي', 2], ['زوجتي', 2], ['جوزي', 2], ['مراتي', 2], ['طليقي', 3], ['طليقتي', 3], ['نسب', 2], ['ولايه تعليميه', 3], ['مسكن الزوجيه', 3], ['مسكن حضانه', 3], ['اجر رضاعه', 3], ['محكمه الاسره', 4]],
  PRP: [['عقار', 2], ['شقه', 2], ['ارض', 2], ['عماره', 1], ['الشهر العقاري', 3], ['عقد بيع', 3], ['ايجار', 3], ['مستاجر', 3], ['المالك', 2], ['طرد', 2], ['الايجار القديم', 4], ['حيازه', 2], ['تعدي', 1], ['تمكين', 2], ['وضع يد', 3], ['صحه توقيع', 3], ['صحه ونفاذ', 3], ['تسجيل', 1], ['فدان', 2], ['قيراط', 2]],
  CIV: [['تعويض', 2], ['دين', 2], ['سلف', 2], ['سلفت', 3], ['سلفه', 2], ['قرض', 2], ['مقاول', 2], ['ضرر', 1], ['فسخ', 2], ['التزام', 1], ['عربون', 2], ['غش', 1], ['ضمان', 1], ['عقد', 1], ['مديونيه', 2], ['حادثه', 2], ['يرجعهم', 2], ['يرجعلي', 2], ['وصل امانه', 1], ['كمبياله', 3]],
  LAB: [['فصل', 2], ['فصلوني', 3], ['فصلني', 3], ['فصلتني', 3], ['اترفدت', 3], ['رفد', 3], ['رفدوني', 3], ['مرتب', 2], ['راتب', 2], ['اجر', 1], ['تامينات', 3], ['متامن', 3], ['مؤمن عليا', 3], ['مكافاه نهايه الخدمه', 4], ['صاحب العمل', 3], ['صاحب الشغل', 3], ['استقاله', 2], ['اجازات', 1], ['عقد عمل', 4], ['عقد العمل', 4], ['مكتب العمل', 4], ['شهاده خبره', 3], ['مستحقاتي', 2], ['معاش', 2], ['اصابه عمل', 4], ['اتصبت', 2], ['شغلي', 1], ['الشغل', 1], ['شغل', 1], ['عامل', 1]],
  CRM: [['محضر', 3], ['الشرطه', 2], ['القسم', 1], ['نيابه', 3], ['النيابه', 3], ['حبس', 3], ['محبوس', 3], ['سرقه', 3], ['ضرب', 2], ['تهديد', 2], ['ايصال امانه', 4], ['شيك', 2], ['بدون رصيد', 3], ['جنحه', 3], ['جنايه', 3], ['قبض', 2], ['اتهام', 3], ['متهم', 3], ['نصب', 3], ['تحرش', 3], ['ابتزاز', 3], ['سب وقذف', 4], ['بلاغ', 2]],
  COM: [['شركه', 2], ['شريك', 2], ['شراكه', 2], ['سجل تجاري', 4], ['علامه تجاريه', 4], ['افلاس', 3], ['تجاري', 2], ['بضاعه', 2], ['مورد', 1], ['توكيل تجاري', 4], ['محل', 1]],
  TAX: [['ضريبه', 3], ['ضرايب', 3], ['الضريبه', 3], ['الضرايب', 3], ['مصلحه الضرايب', 4], ['اقرار ضريبي', 4], ['التصرفات العقاريه', 4], ['ضريبه عقاريه', 4], ['القيمه المضافه', 3], ['فحص ضريبي', 4], ['ضريبي', 3]],
  ADM: [['قرار اداري', 4], ['مجلس الدوله', 4], ['موظف', 2], ['الحكومه', 2], ['ترخيص', 2], ['رخصه', 2], ['تظلم', 3], ['جزاء', 2], ['ترقيه', 2], ['الوزاره', 2], ['هدم', 2], ['ازاله', 2], ['نزع الملكيه', 4], ['المحافظه', 1]],
};

const AREA_LABEL = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

function has(norm, forms, term) {
  return term.includes(' ') ? norm.includes(term) : forms.has(term);
}
function any(norm, forms, terms) {
  return terms.some((t) => has(norm, forms, n(t)));
}

/** تصنيف المجال القانوني مع درجة ثقة ومجالات ثانوية */
export function classify(text) {
  const norm = ' ' + n(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';
  const forms = wordForms(text);
  const scores = {};
  for (const [area, terms] of Object.entries(LEXICON)) {
    let s = 0;
    const hits = [];
    for (const [term, w] of terms) {
      if (has(norm, forms, n(term))) {
        s += w;
        hits.push(term);
      }
    }
    scores[area] = { score: s, hits };
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
  const [topArea, top] = ranked[0];
  const total = ranked.reduce((acc, [, x]) => acc + x.score, 0);
  if (top.score < 2) return { area: 'GEN', confidence: 0.3, secondary: [], scores, norm, forms };
  const confidence = Math.min(0.95, Math.round((0.45 + 0.5 * (top.score / (total || 1))) * 100) / 100);
  const secondary = ranked.slice(1).filter(([, x]) => x.score >= 3 || (x.score >= 2 && x.score >= top.score * 0.4)).map(([a]) => a);
  return { area: topArea, confidence, secondary, scores, norm, forms };
}

function detectAssets(norm, forms) {
  const assets = [];
  if (any(norm, forms, ['شقه', 'شقتين', 'عقار', 'عماره', 'بيت', 'منزل'])) assets.push('عقارًا');
  if (any(norm, forms, ['ارض', 'فدان', 'قيراط'])) assets.push('أرضًا');
  if (any(norm, forms, ['محل', 'مخزن', 'ورشه'])) assets.push('محلًا');
  if (any(norm, forms, ['سياره', 'عربيه'])) assets.push('سيارة');
  if (any(norm, forms, ['حساب', 'فلوس', 'وديعه', 'شهادات'])) assets.push('أموالًا');
  return assets;
}
function joinAr(list) {
  return list.join(' و');
}

function makeTitle(area, norm, forms) {
  switch (area) {
    case 'INH': {
      const assets = detectAssets(norm, forms);
      const minors = any(norm, forms, ['قاصر', 'القصر', 'قصر', 'اطفال', 'صغير', 'صغيره']);
      if (assets.length) return `نزاع بشأن تركة تتضمن ${joinAr(assets)}${minors ? ' وحقوق قاصرين' : ''}`;
      return `استفسار بشأن ميراث وتقسيم تركة${minors ? ' مع وجود قاصرين' : ''}`;
    }
    case 'FAM': {
      const parts = [];
      if (any(norm, forms, ['طلاق', 'طلقني', 'طلقها'])) parts.push('طلاق');
      if (any(norm, forms, ['خلع'])) parts.push('خلع');
      if (any(norm, forms, ['نفقه'])) parts.push('نفقة');
      if (any(norm, forms, ['حضانه'])) parts.push('حضانة');
      if (any(norm, forms, ['رؤيه'])) parts.push('رؤية الأطفال');
      if (any(norm, forms, ['قايمه منقولات', 'منقولات'])) parts.push('قائمة منقولات');
      return parts.length ? `أحوال شخصية: ${joinAr(parts.slice(0, 3))}` : 'مسألة أحوال شخصية وأسرة';
    }
    case 'PRP':
      if (any(norm, forms, ['ايجار', 'مستاجر', 'الايجار القديم'])) return 'نزاع إيجار عقار';
      if (any(norm, forms, ['الشهر العقاري', 'تسجيل', 'صحه ونفاذ', 'صحه توقيع'])) return 'تسجيل ملكية عقار وإثبات التعاقد';
      if (any(norm, forms, ['تعدي', 'وضع يد', 'حيازه'])) return 'تعدٍّ على عقار ونزاع حيازة';
      return 'نزاع بشأن عقار';
    case 'LAB':
      if (any(norm, forms, ['فصل', 'فصلوني', 'فصلني', 'فصلتني', 'اترفدت', 'رفد', 'رفدوني'])) return 'فصل من العمل والمطالبة بالمستحقات';
      if (any(norm, forms, ['تامينات', 'معاش'])) return 'تأمينات اجتماعية ومعاش';
      return 'نزاع عمالي';
    case 'CRM':
      if (any(norm, forms, ['شيك', 'بدون رصيد'])) return 'شيك بدون رصيد';
      if (any(norm, forms, ['ايصال امانه'])) return 'إيصال أمانة';
      if (any(norm, forms, ['سرقه'])) return 'بلاغ سرقة';
      if (any(norm, forms, ['نصب'])) return 'نصب واحتيال';
      if (any(norm, forms, ['ابتزاز', 'تهديد'])) return 'تهديد وابتزاز';
      return 'مسألة جنائية';
    case 'CIV':
      if (any(norm, forms, ['تعويض', 'حادثه'])) return 'مطالبة بتعويض';
      if (any(norm, forms, ['دين', 'سلف', 'قرض', 'مديونيه'])) return 'مطالبة بدين';
      return 'نزاع مدني وتعاقدي';
    case 'COM':
      return any(norm, forms, ['شريك', 'شراكه']) ? 'خلاف بين شركاء' : 'نزاع تجاري';
    case 'TAX':
      return 'مسألة ضريبية';
    case 'ADM':
      return any(norm, forms, ['موظف', 'جزاء', 'ترقيه']) ? 'نزاع وظيفي مع جهة حكومية' : 'منازعة إدارية مع جهة حكومية';
    default:
      return 'استفسار قانوني عام';
  }
}

const DATE_HINT = /\d{4}|\d{1,2}\s*[/-]\s*\d{1,2}|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|من سنه|من سنتين|من شهر|من شهرين|السنه اللي فاتت|الشهر اللي فات|من اسبوع|من يومين|من \d+ (سنين|سنوات|شهور|اشهر)/;

/** قوائم المعلومات والمستندات الناقصة حسب المجال */
function missingInfo(area, norm, forms, ctx) {
  const out = [];
  const add = (item, kind = 'information') => out.push({ item, kind });
  const plain = norm;
  switch (area) {
    case 'INH':
      if (!DATE_HINT.test(plain)) add('تاريخ وفاة المورِّث');
      if (!any(norm, forms, ['اعلام وراثه', 'اعلام الوراثه', 'اعلام شرعي'])) add('صورة إعلام الوراثة (إن كان قد صدر)', 'document');
      {
        const kin = ['اخوات', 'اخواتي', 'اخويا', 'اختي', 'اخوي', 'ولاد', 'اولاد', 'ابناء', 'بنات', 'زوجه', 'ارمله', 'والدتي', 'امي', 'ابويا', 'والدي'].filter((k) => has(norm, forms, n(k))).length;
        if (kin < 2) add('بيان كامل بالورثة وصلة قرابة كل منهم بالمتوفى');
      }
      if (detectAssets(norm, forms).length === 0) add('بيان عناصر التركة (عقارات، أموال، منقولات)');
      else if (!any(norm, forms, ['مسجل', 'الشهر العقاري', 'عقد', 'عقود', 'ملكيه'])) add('مستندات ملكية أصول التركة (عقود البيع أو التسجيل)', 'document');
      if (any(norm, forms, ['قاصر', 'القصر', 'قصر', 'اطفال', 'صغير', 'صغيره']) && !any(norm, forms, ['وصايه', 'وصي', 'ولايه'])) {
        add('قرار الوصاية أو الولاية على القاصرين (إن وُجد)', 'document');
      }
      break;
    case 'FAM':
      if (!any(norm, forms, ['وثيقه', 'قسيمه', 'عقد زواج', 'كتب الكتاب', 'متجوزين'])) add('تاريخ الزواج وصورة وثيقة الزواج', 'document');
      if (any(norm, forms, ['اطفال', 'ولاد', 'اولاد', 'ابني', 'بنتي', 'حضانه', 'رؤيه']) && !/\d+\s*(سنه|سنين|سنوات|شهور)|عمره|عمرها/.test(plain)) add('عدد الأبناء وأعمارهم');
      if (any(norm, forms, ['نفقه']) && !any(norm, forms, ['دخل', 'مرتب', 'راتب', 'بيشتغل', 'شغله'])) add('معلومات عن دخل الزوج أو مصادر دخله');
      if (!any(norm, forms, ['حكم', 'قضيه', 'دعوي', 'محكمه'])) add('هل توجد دعاوى أو أحكام سابقة بين الطرفين؟');
      break;
    case 'PRP':
      if (!any(norm, forms, ['مسجل', 'الشهر العقاري', 'عقد ابتدايي', 'صحه توقيع', 'عقد'])) add('صورة العقد (بيع أو إيجار) وهل هو مسجل', 'document');
      if (!DATE_HINT.test(plain)) add('تاريخ التعاقد');
      if (!any(norm, forms, ['مالك', 'المالك', 'مستاجر', 'وارث', 'ورثه', 'اشتريت', 'شاري'])) add('صفة صاحب الطلب (مالك، مستأجر، وارث، مشترٍ)');
      break;
    case 'LAB':
      if (!DATE_HINT.test(plain)) add('تاريخ بدء العمل وتاريخ إنهاء الخدمة');
      if (!any(norm, forms, ['عقد عمل', 'عقد'])) add('هل يوجد عقد عمل مكتوب؟ (صورة منه إن وجد)', 'document');
      if (!any(norm, forms, ['تامينات', 'مؤمن'])) add('هل العامل مؤمَّن عليه في التأمينات الاجتماعية؟');
      if (!/\d+\s*(جنيه|ج)/.test(plain)) add('قيمة الأجر الشهري');
      break;
    case 'CRM':
      if (!any(norm, forms, ['محضر', 'رقم المحضر'])) add('رقم المحضر والقسم أو النيابة المختصة');
      if (!any(norm, forms, ['جلسه', 'النيابه', 'نيابه', 'حكم'])) add('ما الإجراء الذي اتُّخذ حتى الآن؟ (نيابة، جلسة، حكم)');
      add('صور أي مستندات أو أوراق رسمية متعلقة بالواقعة', 'document');
      break;
    case 'CIV':
      add('صورة العقد أو سند الدين أو أي إثبات للعلاقة', 'document');
      if (!/\d+\s*(جنيه|الف|ج)/.test(plain)) add('قيمة المبلغ أو الضرر محل النزاع');
      if (!any(norm, forms, ['انذار', 'انذرت', 'كلمته', 'طالبت'])) add('هل تمت مطالبة الطرف الآخر أو إنذاره؟');
      break;
    case 'COM':
      add('عقد الشركة أو السجل التجاري', 'document');
      if (!/\d+\s*(جنيه|الف)/.test(plain)) add('قيمة الخلاف التقريبية');
      break;
    case 'TAX':
      add('الإخطارات أو النماذج الصادرة من مصلحة الضرائب', 'document');
      if (!DATE_HINT.test(plain)) add('الفترة الضريبية محل الخلاف');
      break;
    case 'ADM':
      if (!any(norm, forms, ['رقم القرار', 'قرار'])) add('رقم وتاريخ القرار الإداري محل الشكوى', 'document');
      if (!DATE_HINT.test(plain)) add('تاريخ العلم بالقرار (لحساب مواعيد التظلم والطعن)');
      if (!any(norm, forms, ['تظلم', 'تظلمت'])) add('هل تم تقديم تظلم؟ ومتى؟');
      break;
    default:
      add('تفاصيل أكثر عن المشكلة والمطلوب تحديدًا');
      add('المستندات المتاحة لدى صاحب الطلب', 'document');
  }
  if (String(ctx.text || '').trim().length < 80 && area !== 'GEN') add('وصف أكثر تفصيلًا للمشكلة وتسلسل الأحداث');
  if (!ctx.governorate) add('محل الإقامة أو المحافظة (لتحديد المحكمة المختصة)');
  return out;
}

/** اقتراح المسائل القانونية حسب المجال والوقائع */
export function suggestIssuesFor(area, text, secondary = []) {
  const norm = ' ' + n(text) + ' ';
  const forms = wordForms(text);
  const issues = [];
  const add = (title, details = null, legal_area = area) => issues.push({ title, details, legal_area });
  switch (area) {
    case 'INH':
      add('تحديد الورثة الشرعيين ونصيب كل منهم في التركة');
      if (any(norm, forms, ['قاصر', 'القصر', 'قصر', 'اطفال', 'صغير', 'صغيره'])) add('حماية نصيب القاصرين والولاية أو الوصاية عليهم، وما يلزم من إذن المحكمة للتصرف');
      if (detectAssets(norm, forms).length) add('طريقة قسمة أصول التركة (رضائيًا أو بدعوى فرز وتجنيب) وإدارة الأصول لحين القسمة');
      if (any(norm, forms, ['رافض', 'رفض', 'مانع', 'مستولي', 'واضع', 'مش راضي', 'حارمني', 'حرمني'])) add('امتناع أحد الورثة عن القسمة أو استئثاره بالتركة وسبل المطالبة بالحقوق');
      if (!any(norm, forms, ['اعلام وراثه', 'اعلام الوراثه', 'اعلام شرعي'])) add('إجراءات استخراج إعلام الوراثة');
      break;
    case 'FAM':
      if (any(norm, forms, ['نفقه'])) add('استحقاق النفقة ونوعها وتقدير قيمتها');
      if (any(norm, forms, ['حضانه'])) add('ترتيب الحضانة ومسكنها');
      if (any(norm, forms, ['رؤيه'])) add('تنظيم حق الرؤية أو الاستضافة');
      if (any(norm, forms, ['طلاق', 'طلقني', 'خلع'])) add('إجراءات الطلاق أو الخلع والحقوق المترتبة عليه (المؤخر، المتعة، نفقة العدة)');
      if (any(norm, forms, ['قايمه منقولات', 'منقولات'])) add('المطالبة بقائمة المنقولات');
      if (!issues.length) add('تحديد الطلب الأساسي وحقوق الطرفين وفق قوانين الأحوال الشخصية');
      break;
    case 'PRP':
      if (any(norm, forms, ['ايجار', 'مستاجر', 'الايجار القديم'])) add('مدى سريان عقد الإيجار والقانون الحاكم له وحقوق كل طرف');
      if (any(norm, forms, ['تسجيل', 'الشهر العقاري', 'صحه ونفاذ', 'صحه توقيع'])) add('طريق تسجيل الملكية أو إثبات التعاقد (صحة توقيع / صحة ونفاذ)');
      if (any(norm, forms, ['تعدي', 'وضع يد', 'حيازه', 'طرد'])) add('حماية الحيازة ورفع التعدي أو الطرد');
      if (!issues.length) add('تحديد الوضع القانوني للعقار وحقوق صاحب الطلب');
      break;
    case 'LAB':
      add('مدى مشروعية إنهاء علاقة العمل');
      add('حساب المستحقات العمالية (الأجر، الإجازات، مكافأة نهاية الخدمة، التعويض)');
      if (any(norm, forms, ['تامينات', 'معاش'])) add('حقوق التأمينات الاجتماعية والمعاش');
      break;
    case 'CRM':
      add('التكييف القانوني للواقعة والعقوبة المحتملة');
      add('الموقف الإجرائي الحالي والخطوة التالية (محضر، نيابة، جلسة)');
      if (any(norm, forms, ['شيك', 'ايصال امانه'])) add('إمكانية التصالح أو السداد وأثره على الدعوى');
      break;
    case 'CIV':
      add('تحديد الأساس القانوني للمطالبة ووسائل إثباتها');
      add('الإجراء المناسب (إنذار، أمر أداء، دعوى) ومدد التقادم');
      break;
    case 'COM':
      add('حقوق الشركاء والتزاماتهم وفق عقد الشركة');
      add('سبل تسوية النزاع التجاري (ودية، تحكيم، قضاء)');
      break;
    case 'TAX':
      add('مدى استحقاق الضريبة محل الخلاف وأساس احتسابها');
      add('مواعيد وإجراءات الطعن أو التظلم أمام الجهات الضريبية');
      break;
    case 'ADM':
      add('مدى مشروعية القرار الإداري وأسباب الطعن عليه');
      add('مواعيد التظلم والطعن أمام القضاء الإداري');
      break;
    default:
      add('تحديد المسألة القانونية الأساسية وجهة الاختصاص');
  }
  for (const s of secondary) {
    if (s === 'TAX') add('الأثر الضريبي المترتب على الوقائع (مثل ضريبة التصرفات العقارية)', 'قد يحتاج إلى رأي متخصص ضريبي', 'TAX');
    else if (s === 'CRM' && area !== 'CRM') add('الجوانب الجنائية المحتملة في الوقائع', 'قد يحتاج إلى رأي متخصص جنائي', 'CRM');
    else if (s === 'COM' && area !== 'COM') add('الجوانب التجارية المتعلقة بالنشاط أو الشركة', 'قد يحتاج إلى رأي متخصص في الشركات', 'COM');
    else if (s === 'ADM' && area !== 'ADM') add('الجوانب الإدارية والتعامل مع الجهات الحكومية', 'قد يحتاج إلى رأي متخصص في القضاء الإداري', 'ADM');
  }
  return issues.slice(0, 7);
}

const URGENT = ['محبوس', 'حبس', 'اتقبض', 'قبض علي', 'مقبوض'];
const HIGH = ['جلسه بكره', 'جلسه بكرا', 'بكره', 'بكرا', 'النهارده', 'عاجل', 'ضروري', 'مستعجل', 'انذار', 'طرد', 'هدم', 'ازاله', 'اخر ميعاد', 'اخر موعد', 'مهله', 'الجلسه الجايه'];

/** التحليل الكامل لطلب وارد */
export function analyzeIntake(text, ctx = {}) {
  const c = classify(text);
  const area = c.area;
  // نستبعد العناصر الآلية مثل «[مستند: ...]» من الوقائع والملخص
  const sents = sentences(text).filter((x) => !/^\[[^\]]*\]$/.test(x.trim()));
  const keyTerms = Object.values(c.scores).flatMap((x) => x.hits).map(n);
  const scored = sents.map((s, i) => {
    const sn = n(s);
    let score = keyTerms.filter((k) => sn.includes(k)).length * 2 + (/\d/.test(sn) ? 1 : 0) + (i === 0 ? 1 : 0);
    if (s.length < 15) score -= 1;
    return { s, score, i };
  });
  const facts = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => a.i - b.i)
    .map((x) => truncate(x.s, 220));
  const summaryParts = (facts.length ? facts : sents.slice(0, 3)).slice(0, 3);
  const summary = summaryParts.length
    ? `يذكر صاحب الطلب: ${summaryParts.map((s) => s.replace(/[.،]+$/, '')).join('، ')}.`
    : 'لم يقدم صاحب الطلب تفاصيل كافية بعد.';
  let urgency = 'normal';
  if (URGENT.some((k) => c.norm.includes(n(k)))) urgency = 'urgent';
  else if (HIGH.some((k) => c.norm.includes(n(k)))) urgency = 'high';
  const missing = missingInfo(area, c.norm, c.forms, { text, governorate: ctx.governorate });
  return {
    title: makeTitle(area, c.norm, c.forms),
    summary: truncate(summary, 900),
    legal_area: area,
    confidence: c.confidence,
    secondary_areas: c.secondary,
    facts,
    missing_info: missing,
    information_sufficient: missing.length === 0,
    suggested_issues: suggestIssuesFor(area, text, c.secondary),
    urgency,
    specialist_hint: c.secondary.length ? `قد يحتاج الملف أيضًا إلى رأي في: ${c.secondary.map((a) => AREA_LABEL[a]).join('، ')}` : null,
  };
}

/** مسودة أولية منظمة للمحامي (تعتمد فقط على ما أُتيح له) */
export function draftOpinion({ title, area, facts, brief, issues, missing, similar }) {
  const lines = [];
  lines.push('مسودة أولية مُعدّة آليًا — للاسترشاد فقط، وتحتاج إلى مراجعة المحامي واستكمال التحليل القانوني.');
  lines.push('');
  lines.push(`الموضوع: ${title || AREA_LABEL[area] || 'استشارة قانونية'}`);
  if (brief) lines.push(`المطلوب تحديدًا: ${brief}`);
  lines.push('');
  lines.push('أولًا: الوقائع كما وردت في الملف');
  lines.push(facts ? facts.trim() : '— (لم تُتح لك وقائع تفصيلية في هذا الإسناد)');
  lines.push('');
  lines.push('ثانيًا: المسائل القانونية محل الدراسة');
  if (issues?.length) issues.forEach((i) => lines.push(`${i.number ? `المسألة ${i.number}` : '•'}: ${i.title}${i.details ? ` — ${i.details}` : ''}`));
  else lines.push('— تُحدَّد بعد دراسة الوقائع.');
  lines.push('');
  lines.push('ثالثًا: التحليل القانوني');
  (issues?.length ? issues : [{ title: 'المسألة الأساسية' }]).forEach((i) => {
    lines.push(`• ${i.title}:`);
    lines.push('  [يُستكمل: النصوص الحاكمة في التشريع المصري، والمبادئ القضائية ذات الصلة، وتطبيقها على الوقائع]');
  });
  lines.push('');
  lines.push('رابعًا: الرأي والتوصيات العملية');
  lines.push('[يُستكمل: الرأي في كل مسألة، والخطوات المقترحة بالترتيب، والمدد والمواعيد الواجب مراعاتها]');
  if (missing?.length) {
    lines.push('');
    lines.push('خامسًا: معلومات ومستندات يُستحسن استيفاؤها قبل إبداء الرأي النهائي');
    missing.forEach((m) => lines.push(`• ${typeof m === 'string' ? m : m.item}`));
  }
  if (similar?.length) {
    lines.push('');
    lines.push('ملاحظة: حالات سابقة مشابهة اعتمدت المؤسسة الرد عليها (بيانات مجهّلة):');
    similar.slice(0, 3).forEach((s) => lines.push(`• ${s.title}${s.key_points ? ` — ${truncate(s.key_points, 200)}` : ''}`));
  }
  return lines.join('\n');
}

/** نسخة موجهة للعميل بلغة مبسطة */
export function clientVersion({ clientName, caseCode, opinion, orgName }) {
  const body = String(opinion || '')
    .split('\n')
    .filter((l) => !/^مسودة أولية|^\[يُستكمل/.test(l.trim()))
    .join('\n')
    .trim();
  return [
    `${clientName ? `الأستاذ/ة ${clientName}` : 'عميلنا العزيز'}، تحية طيبة وبعد،`,
    '',
    `بخصوص استفساركم في الملف رقم ${caseCode}، وبعد دراسته من المختصين لدينا، نفيدكم بما يلي:`,
    '',
    body,
    '',
    'هذه الإفادة مبنية على المعلومات والمستندات التي قدمتموها، وقد يتغير الرأي إذا ظهرت وقائع أو مستندات جديدة.',
    'للاستفسار أو إرسال أي مستندات إضافية يمكنكم الرد على هذه الرسالة.',
    '',
    'مع خالص التحية،',
    `فريق ${orgName || 'بيوت مصر'} للخدمات القانونية`,
  ].join('\n');
}
