// المحلل المحلي (بدون إنترنت): قواعد عربية لتصنيف الطلب واستخراج الوقائع والمعلومات الناقصة واقتراح المسائل.
// هذا «مساعد بسيط» كما في المرحلة الأولى من المنظومة؛ عند ضبط مفتاح Claude يُستخدم نموذج لغوي بدلًا منه.
import { normalizeArabic, truncate, latinDigits } from '../util.js';
import { LEGAL_AREAS, LABELS, DEFAULT_SETTINGS } from '../constants.js';
import { wordForms, sentences, tokens } from './text.js';
import { topicByKey } from '../../public/assets/js/public/topics.js'; // v9.2: مجال الموضوع الذي اختارته

const n = normalizeArabic;

// معجم المجالات: [كلمة/عبارة, وزن]. العبارات متعددة الكلمات تُطابَق كنص، والمفردة تُطابَق مع أشكال الكلمات.
const LEXICON = {
  INH: [['ميراث', 3], ['مواريث', 3], ['ورث', 2], ['ورثه', 3], ['الورثه', 3], ['تركه', 2], ['المتوفي', 2], ['توفي', 2], ['توفيت', 2], ['اتوفي', 2], ['اتوفت', 2], ['وفاه', 2], ['اعلام وراثه', 4], ['اعلام الوراثه', 4], ['اعلام شرعي', 4], ['نصيب', 2], ['انصبه', 2], ['قسمه', 2], ['وصيه', 2], ['المرحوم', 2], ['المرحومه', 2], ['الله يرحمه', 2], ['الله يرحمها', 2], ['قاصر', 1], ['القصر', 1], ['فرز وتجنيب', 2]],
  FAM: [['طلاق', 3], ['طلقني', 3], ['طلقها', 3], ['نفقه', 3], ['حضانه', 3], ['رؤيه', 2], ['خلع', 3], ['زواج', 2], ['جواز', 2], ['مهر', 2], ['قايمه منقولات', 4], ['منقولات', 2], ['عده', 1], ['متعه', 2], ['زوجي', 2], ['زوجتي', 2], ['جوزي', 2], ['مراتي', 2], ['طليقي', 3], ['طليقتي', 3], ['نسب', 2], ['ولايه تعليميه', 3], ['مسكن الزوجيه', 3], ['مسكن حضانه', 3], ['اجر رضاعه', 3], ['محكمه الاسره', 4], ['نفقه الصغار', 4], ['نفقه صغار', 4], ['نفقه الاقارب', 4], ['نفقه الايتام', 4], ['حماتي', 1], ['ام جوزي', 2]],
  // v9: الولاية على المال والنيابة الحسبية (أموال القاصرين بعد وفاة الأب)
  GRD: [['الولايه علي المال', 6], ['ولايه علي المال', 6], ['النيابه الحسبيه', 6], ['نيابه حسبيه', 6], ['حسبيه', 4], ['المجلس الحسبي', 6], ['نيابه شئون الاسره', 5], ['نيابه الاسره', 3], ['وصايه', 3], ['وصيه علي', 5], ['وصي علي', 5], ['ابقي وصيه', 4], ['ولي طبيعي', 4], ['الولي الطبيعي', 4], ['ولايه علي', 3], ['اموال القصر', 5], ['فلوس القصر', 5], ['حساب القصر', 5], ['فلوس العيال', 3], ['فلوس الاولاد', 3], ['فلوس ولادي', 3], ['كشف حساب', 3], ['جرد', 2], ['حجر', 3], ['محجور', 3], ['اذن النيابه', 4], ['اذن المحكمه', 2], ['قاصر', 2], ['القصر', 2], ['قصر', 1]],
  // v9: المعاشات والتأمينات الاجتماعية وبرنامج تكافل وكرامة
  PEN: [['معاش', 4], ['تكافل وكرامه', 6], ['تكافل', 3], ['الضمان الاجتماعي', 4], ['معاش الضمان', 5], ['التضامن الاجتماعي', 2], ['هيئه التامين', 4], ['التامين الاجتماعي', 3], ['التامينات الاجتماعيه', 3], ['مكتب التامينات', 4], ['صرف المعاش', 5], ['صرف معاش', 5], ['اصرف معاش', 5], ['معاش جوزي', 3], ['معاش زوجي', 3], ['معاش زوجها', 3], ['معاش ابويا', 3], ['معاش والدي', 3], ['معاش المرحوم', 3], ['معاش المتوفي', 3], ['معاش يتيم', 5], ['معاش الايتام', 5], ['مستحقي المعاش', 5], ['منحه الوفاه', 5], ['بحث اجتماعي', 3], ['البحث الاجتماعي', 3], ['كارت ميزه', 4], ['معاش استثنائي', 5], ['الرقم التاميني', 4], ['رقم تاميني', 4], ['ارمله', 1], ['ايتام', 1]],
  PRP: [['عقار', 2], ['شقه', 2], ['ارض', 2], ['عماره', 1], ['الشهر العقاري', 3], ['عقد بيع', 3], ['ايجار', 3], ['مستاجر', 3], ['المالك', 2], ['طرد', 2], ['الايجار القديم', 4], ['حيازه', 2], ['تعدي', 1], ['تمكين', 2], ['وضع يد', 3], ['صحه توقيع', 3], ['صحه ونفاذ', 3], ['تسجيل', 1], ['فدان', 2], ['قيراط', 2]],
  CIV: [['تعويض', 2], ['دين', 2], ['سلف', 2], ['سلفت', 3], ['سلفه', 2], ['قرض', 2], ['مقاول', 2], ['ضرر', 1], ['فسخ', 2], ['التزام', 1], ['عربون', 2], ['غش', 1], ['ضمان', 1], ['عقد', 1], ['مديونيه', 2], ['حادثه', 2], ['يرجعهم', 2], ['يرجعلي', 2], ['وصل امانه', 1], ['كمبياله', 3]],
  LAB: [['فصل', 2], ['فصلوني', 3], ['فصلني', 3], ['فصلتني', 3], ['اترفدت', 3], ['رفد', 3], ['رفدوني', 3], ['مرتب', 2], ['راتب', 2], ['اجر', 1], ['تامينات', 3], ['متامن', 3], ['مؤمن عليا', 3], ['مكافاه نهايه الخدمه', 4], ['صاحب العمل', 3], ['صاحب الشغل', 3], ['استقاله', 2], ['اجازات', 1], ['عقد عمل', 4], ['عقد العمل', 4], ['مكتب العمل', 4], ['شهاده خبره', 3], ['مستحقاتي', 2], ['معاش', 1], ['اصابه عمل', 4], ['اتصبت', 2], ['شغلي', 1], ['الشغل', 1], ['شغل', 1], ['عامل', 1]],
  CRM: [['محضر', 3], ['الشرطه', 2], ['القسم', 1], ['نيابه', 3], ['النيابه', 3], ['حبس', 3], ['محبوس', 3], ['سرقه', 3], ['ضرب', 2], ['تهديد', 2], ['ايصال امانه', 4], ['شيك', 2], ['بدون رصيد', 3], ['جنحه', 3], ['جنايه', 3], ['قبض', 2], ['اتهام', 3], ['متهم', 3], ['نصب', 3], ['تحرش', 3], ['ابتزاز', 3], ['سب وقذف', 4], ['بلاغ', 2]],
  COM: [['شركه', 2], ['شريك', 2], ['شراكه', 2], ['سجل تجاري', 4], ['علامه تجاريه', 4], ['افلاس', 3], ['تجاري', 2], ['بضاعه', 2], ['مورد', 1], ['توكيل تجاري', 4], ['محل', 1]],
  TAX: [['ضريبه', 3], ['ضرايب', 3], ['الضريبه', 3], ['الضرايب', 3], ['مصلحه الضرايب', 4], ['اقرار ضريبي', 4], ['التصرفات العقاريه', 4], ['ضريبه عقاريه', 4], ['القيمه المضافه', 3], ['فحص ضريبي', 4], ['ضريبي', 3]],
  ADM: [['قرار اداري', 4], ['مجلس الدوله', 4], ['موظف', 2], ['الحكومه', 2], ['ترخيص', 2], ['رخصه', 2], ['تظلم', 3], ['جزاء', 2], ['ترقيه', 2], ['الوزاره', 2], ['هدم', 2], ['ازاله', 2], ['نزع الملكيه', 4], ['المحافظه', 1]],
};

const AREA_LABEL = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));
const DOC_TYPE_LABELS = LABELS.ai_doc_type || {};

function has(norm, forms, term) {
  return term.includes(' ') ? norm.includes(term) : forms.has(term);
}
function any(norm, forms, terms) {
  return terms.some((t) => has(norm, forms, n(t)));
}

/** تصنيف المجال القانوني مع درجة ثقة ومجالات ثانوية */
/**
 * كلمات تُحسب لمجال ما إلا في سياق يدل على مجال آخر:
 * «النيابة» في «النيابة الحسبية» ليست نيابة جنائية، و«متأمن عليه» في سياق معاش المتوفى ليست نزاعًا عماليًا.
 */
const CONTEXT_EXCLUSIONS = [
  { area: 'CRM', terms: ['نيابه', 'النيابه'], when: ['النيابه الحسبيه', 'نيابه حسبيه', 'نيابه شئون الاسره', 'نيابه الاسره', 'اذن النيابه'] },
  {
    area: 'LAB',
    terms: ['تامينات', 'متامن', 'مؤمن عليا'],
    when: (norm, forms) => any(norm, forms, ['معاش']) && any(norm, forms, ['توفي', 'اتوفي', 'المتوفي', 'المرحوم', 'الله يرحمه', 'وفاه', 'ارمله']),
  },
];
function excluded(area, term, norm, forms) {
  return CONTEXT_EXCLUSIONS.some(
    (x) => x.area === area && x.terms.includes(term) && (typeof x.when === 'function' ? x.when(norm, forms) : x.when.some((p) => norm.includes(n(p)))),
  );
}

export function classify(text) {
  const norm = ' ' + n(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ';
  const forms = wordForms(text);
  const scores = {};
  for (const [area, terms] of Object.entries(LEXICON)) {
    let s = 0;
    const hits = [];
    for (const [term, w] of terms) {
      if (has(norm, forms, n(term)) && !excluded(area, term, norm, forms)) {
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
/** سياق وفاة الزوج أو الأب (أرملة وأيتام) */
function widowed(norm, forms) {
  return any(norm, forms, ['توفي', 'اتوفي', 'المتوفي', 'المرحوم', 'الله يرحمه', 'الله يرحمها', 'وفاه', 'ارمله', 'ايتام', 'يتامي']);
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
    case 'GRD': {
      if (any(norm, forms, ['حجر', 'محجور'])) return 'طلب حجر وتعيين قيّم';
      if (any(norm, forms, ['بيع', 'نبيع', 'تبيع', 'اتصرف', 'تصرف']) && any(norm, forms, ['شقه', 'عقار', 'ارض', 'بيت', 'نصيب'])) return 'إذن بالتصرف في نصيب القاصرين في عقار';
      if (any(norm, forms, ['النيابه الحسبيه', 'حسبيه', 'نيابه شئون الاسره', 'نيابه الاسره', 'حساب القصر', 'فلوس القصر', 'فلوس العيال', 'اموال القصر'])) return 'الصرف من أموال القاصرين الخاضعة لإشراف النيابة الحسبية';
      if (any(norm, forms, ['وصايه', 'وصيه علي', 'وصي علي', 'ابقي وصيه'])) return 'تعيين وصي على القاصرين أو تعديل الوصاية';
      return 'الولاية على أموال القاصرين';
    }
    case 'PEN': {
      if (any(norm, forms, ['تكافل وكرامه', 'تكافل', 'الضمان الاجتماعي', 'معاش الضمان'])) return 'التقدم لبرنامج تكافل وكرامة أو استمرار صرفه';
      if (any(norm, forms, ['رفض', 'رفضوا', 'وقف', 'وقفوا', 'اتوقف', 'قطعوا', 'اتقطع'])) return 'وقف أو رفض صرف معاش والتظلم منه';
      if (any(norm, forms, ['توفي', 'اتوفي', 'المتوفي', 'المرحوم', 'الله يرحمه', 'وفاه', 'ارمله'])) return 'صرف معاش المتوفى للأرملة والأبناء المستحقين';
      return 'استحقاق معاش أو تأمينات اجتماعية';
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
      if (any(norm, forms, ['نفقه']) && !any(norm, forms, ['دخل', 'مرتب', 'راتب', 'بيشتغل', 'شغله'])) {
        add(widowed(norm, forms) ? 'معلومات عن دخل الملزَم بالنفقة بعد وفاة الأب (الجد أو غيره) ومصادر دخله' : 'معلومات عن دخل الزوج أو مصادر دخله');
      }
      if (!any(norm, forms, ['حكم', 'قضيه', 'دعوي', 'محكمه'])) add('هل توجد دعاوى أو أحكام سابقة بين الطرفين؟');
      break;
    case 'GRD':
      if (!any(norm, forms, ['قرار', 'قرار الوصايه', 'قرار المحكمه'])) add('قرار الوصاية أو الولاية على المال (إن كان قد صدر)', 'document');
      if (!any(norm, forms, ['كشف حساب', 'كشف'])) add('كشف حساب أموال القاصرين أو بيان بها (الحساب الخاضع لإشراف النيابة)', 'document');
      if (!any(norm, forms, ['شهاده ميلاد', 'شهادات ميلاد', 'شهادات الميلاد'])) add('شهادات ميلاد الأبناء القاصرين', 'document');
      if (!/\d+\s*(سنه|سنين|سنوات|شهور)|عمره|عمرها|اعمارهم/.test(plain)) add('أعمار الأبناء القاصرين');
      if (!any(norm, forms, ['اعلام وراثه', 'اعلام الوراثه', 'اعلام شرعي'])) add('صورة إعلام الوراثة', 'document');
      if (any(norm, forms, ['صرف', 'اصرف', 'تصرف', 'سحب', 'اسحب', 'بيع', 'نبيع']) && !/\d+\s*(جنيه|الف|ج)/.test(plain)) add('الغرض من الصرف أو التصرف المطلوب وقيمته التقريبية');
      break;
    case 'PEN': {
      const death = any(norm, forms, ['توفي', 'اتوفي', 'المتوفي', 'المرحوم', 'الله يرحمه', 'وفاه', 'ارمله', 'ايتام']);
      const takaful = any(norm, forms, ['تكافل وكرامه', 'تكافل', 'الضمان الاجتماعي', 'معاش الضمان']);
      if (!takaful && !any(norm, forms, ['رقم المعاش', 'الرقم التاميني', 'رقم تاميني'])) add('رقم المعاش أو الرقم التأميني لصاحب المعاش أو المتوفى');
      if (death && !any(norm, forms, ['شهاده الوفاه', 'شهاده وفاه'])) add('صورة شهادة الوفاة', 'document');
      if (death && !any(norm, forms, ['اعلام وراثه', 'اعلام الوراثه', 'اعلام شرعي'])) add('صورة إعلام الوراثة', 'document');
      if (takaful && !any(norm, forms, ['بحث اجتماعي', 'البحث الاجتماعي'])) add('هل أُجري البحث الاجتماعي من الوحدة الاجتماعية؟ وما نتيجته؟');
      if (!takaful && death && !any(norm, forms, ['شركه', 'حكومه', 'موظف', 'شغال', 'كان بيشتغل', 'متامن', 'مؤمن'])) add('جهة عمل المتوفى وهل كان مؤمَّنًا عليه في التأمينات الاجتماعية');
      if (!any(norm, forms, ['شهاده ميلاد', 'شهادات ميلاد'])) add('بطاقات الرقم القومي للمستحقين وشهادات ميلاد الأبناء', 'document');
      if (any(norm, forms, ['رفض', 'رفضوا', 'وقف', 'وقفوا', 'اتوقف', 'قطعوا', 'اتقطع']) && !DATE_HINT.test(plain)) add('تاريخ قرار الرفض أو وقف الصرف وصورة منه إن وُجدت');
      break;
    }
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

/** قائمة النواقص لمجال محدد (مثل مجال الملف بعد تصحيح الإدارة للتصنيف) */
export function missingInfoFor(area, text, ctx = {}) {
  const c = classify(text || '');
  return missingInfo(area, c.norm, c.forms, { text, governorate: ctx.governorate });
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
      if (any(norm, forms, ['نفقه']) && widowed(norm, forms)) add('نفقة الأبناء بعد وفاة الأب ومن تجب عليه من الأقارب (الجد ثم من يليه)');
      if (any(norm, forms, ['حضانه']) && widowed(norm, forms)) add('ترتيب الحضانة بعد وفاة الأب وحق الأم فيها في مواجهة أقارب الأب');
      if (any(norm, forms, ['حضانه'])) add('ترتيب الحضانة ومسكنها');
      if (any(norm, forms, ['رؤيه'])) add('تنظيم حق الرؤية أو الاستضافة');
      if (any(norm, forms, ['طلاق', 'طلقني', 'خلع'])) add('إجراءات الطلاق أو الخلع والحقوق المترتبة عليه (المؤخر، المتعة، نفقة العدة)');
      if (any(norm, forms, ['قايمه منقولات', 'منقولات'])) add('المطالبة بقائمة المنقولات');
      if (!issues.length) add('تحديد الطلب الأساسي وحقوق الطرفين وفق قوانين الأحوال الشخصية');
      break;
    case 'GRD':
      add('تحديد صاحب الولاية على مال القاصرين (الولي الطبيعي أو الوصي المعيَّن) ومدى حاجة الأم إلى قرار بتعيينها وصية');
      add('إجراءات الصرف من أموال القاصرين أو التصرف فيها بإذن من نيابة شؤون الأسرة للولاية على المال');
      if (any(norm, forms, ['بيع', 'نبيع', 'تبيع', 'اتصرف', 'تصرف', 'شقه', 'عقار', 'ارض'])) add('الحصول على إذن المحكمة بالتصرف في نصيب القاصرين في العقار وضمانات حماية الثمن');
      if (any(norm, forms, ['كشف حساب', 'جرد', 'حساب'])) add('التزامات الوصي بجرد أموال القاصرين وتقديم الحساب السنوي');
      if (any(norm, forms, ['حجر', 'محجور'])) add('شروط الحجر وتعيين القيّم وإجراءاته');
      break;
    case 'PEN':
      if (any(norm, forms, ['تكافل وكرامه', 'تكافل', 'الضمان الاجتماعي', 'معاش الضمان'])) add('شروط الاستحقاق في برنامج تكافل وكرامة وإجراءات التقدم أو التظلم');
      else {
        add('تحديد المستحقين في المعاش وأنصبتهم (الأرملة، الأبناء، الوالدان) وشروط استمرار الاستحقاق');
        add('إجراءات صرف المعاش والمستندات المطلوبة لدى الهيئة القومية للتأمين الاجتماعي');
      }
      if (any(norm, forms, ['رفض', 'رفضوا', 'وقف', 'وقفوا', 'اتوقف', 'قطعوا', 'اتقطع'])) add('التظلم من قرار رفض الصرف أو وقفه ومواعيد التظلم');
      if (any(norm, forms, ['جواز', 'زواج', 'اتجوزت', 'اشتغلت', 'شغل'])) add('أثر الزواج أو العمل على استمرار استحقاق معاش الأرملة أو الأبناء');
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
    else if (s === 'GRD' && area !== 'GRD' && area !== 'INH') add('حماية أموال القاصرين والولاية عليها', 'قد يحتاج إلى رأي في الولاية على المال', 'GRD');
    else if (s === 'PEN' && area !== 'PEN') add('استحقاق المعاش أو الدعم النقدي للأسرة وإجراءات صرفه', 'قد يحتاج إلى رأي في المعاشات والتأمينات', 'PEN');
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
  const base = {
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
  // v9.2 (A92-12): ماذا يصير الطلب؟ (استشارة / قضية / رد الإدارة / توجيه / نسألها الأول) ومسودة لكل مسار
  return { ...base, ...recommendTrack(text, base, { ...ctx, classified: c }) };
}

// ───────────────────────── v9.2 (admin-ai): المسار المقترح للطلب ومسوداته (A92-12) ─────────────────────────

// [بوابة 9.2 G7] «معايا حكم نفقة» = حكم صادر يحتاج تنفيذًا (كلمة «حكم» وحدها تُطابق ككلمة، لا داخل «محكمة»)
const COURT_PENDING = ['حكم', 'حكم نفقه', 'جلسه', 'الجلسه', 'رافع عليا', 'رافعه عليا', 'رافعين عليا', 'رفع عليا', 'رفعت عليا', 'رفعوا عليا', 'رفعو عليا', 'قضيه مرفوعه', 'دعوي مرفوعه', 'اتعلنت', 'جالي اعلان', 'اعلان من المحكمه', 'الحكم', 'حكم المحكمه', 'استئناف', 'تنفيذ الحكم', 'محضر تنفيذ', 'رقم الدعوي', 'الدائره'];
const FUTURE_INTENT = ['ارفع قضيه', 'ارفع دعوي', 'نرفع قضيه', 'عايزه اعمل قضيه'];
const INFO_QUESTION = ['ازاي', 'اطلع', 'استخرج', 'اعمل ايه', 'ايه الورق', 'الورق المطلوب', 'الاوراق المطلوبه', 'المستندات المطلوبه', 'فين اروح', 'اروح فين', 'منين', 'استفسار', 'عايزه اعرف', 'محتاجه اعرف', 'ينفع'];
const DISPUTE = ['رافض', 'رافضين', 'مش راضي', 'مش راضيين', 'مانع', 'مانعين', 'طردني', 'طردوني', 'يطردنا', 'واخد', 'واخدين', 'خدوا', 'ضربني', 'بيهددني', 'خلاف', 'مشاكل', 'حرمني', 'حرمونا', 'كلوا حق', 'اكل حق', 'نصيبي', 'نصيب العيال', 'قطعوا', 'وقفوا',
  // [بوابة 9.2 G7] حق يُنازَع عليه: «عايزة أعرف حقي وحق ولادي»، «إخواته عايزين يبيعوا الشقة»، «طليقي مش بيدفع»
  'حقي', 'حق ولادي', 'حق العيال', 'حق عيالي', 'حقنا', 'يبيعوا', 'باعوا', 'مش بيدفع', 'مبيدفعش', 'مش بيصرف', 'مبيصرفش'];
// [بوابة 9.2 G7] طرف آخر بعينه + فعل منه = نزاع وليس سؤالًا إجرائيًا («إخواته عايزين…»، «صاحب البيت بيقول…»)
const OPPONENTS = ['اخواته', 'اخواتها', 'اخوات جوزي', 'اهله', 'اهل جوزي', 'اهلها', 'طليقي', 'جوزي السابق', 'صاحب البيت', 'صاحب الشقه', 'صاحب العماره', 'المالك', 'حماتي', 'ام جوزي', 'عم العيال', 'عمهم', 'ابو العيال'];
const OPPONENT_ACTS = ['عايزين', 'عاوزين', 'عايز', 'عاوز', 'بيقول', 'بيقولوا', 'رافض', 'رافضين', 'مش بيدفع', 'مبيدفعش', 'مش بيصرف', 'باعوا', 'يبيعوا', 'خدوا', 'واخدين', 'واخد', 'طردونا', 'يطلعونا', 'يطلعوني', 'هيطلعونا', 'مانعين', 'منعونا', 'سايبنا'];
// [R2-A21] مصاريف الأطفال من أبيهم (نفقة) ليست «مساعدة» تُوجَّه لبرامج أخرى
const FAMILY_SUPPORT = ['ابو العيال', 'ابوهم', 'طليقي', 'جوزي السابق', 'نفقه', 'مصاريف العيال', 'مش بيصرف'];

// أسئلة «نسألها الأول» حسب المجال ({ي}/{ة} تُملأ حسب صيغة المخاطبة لاحقًا)
const QUESTIONS_BY_AREA = {
  GEN: ['احكيلنا في جملتين: حصل إيه، ومع مين؟'],
  INH: ['مين اللي اتوفى، وإمتى؟', 'إعلام الوراثة طلع ولا لسه؟'],
  PEN: ['المعاش ده عن مين؟ وإمتى اتوفى؟', 'قدّمت{ي} على المعاش قبل كده؟ ولو قدّمت{ي} قالولك إيه؟'],
  FAM: ['المشكلة مع مين بالظبط؟ (أبو العيال، أهله، …)', 'فيه قضية مرفوعة قبل كده؟'],
  GRD: ['فلوس العيال دي فين؟ في البنك ولا ورث لسه ما اتقسمش؟', 'فيه حد متعيّن وصي على العيال؟'],
  PRP: ['البيت ده إيجار ولا ملك؟ وباسم مين؟', 'حد طالب منكم تسيبوا البيت؟'],
  ADM: ['إيه الورقة اللي عايزين نطلّعها بالظبط؟', 'روحت{ي} فين قبل كده وقالولك إيه؟'],
};
const QUESTIONS_OTHER = ['احكيلنا في جملتين: حصل إيه، ومع مين؟', 'فيه ورق معاك{ي} يخص المشكلة؟ صوّر{ي}ه وابعت{ي}ه هنا.'];

/** أسئلة قصيرة لها (حتى 3) حسب المجال؛ المجال غير المعروف يبدأ بسؤال «حصل إيه» */
export function questionsFor(area) {
  if (!area || area === 'GEN') return QUESTIONS_BY_AREA.GEN.slice();
  return (QUESTIONS_BY_AREA[area] || QUESTIONS_OTHER).slice(0, 3);
}

/** عدد الحروف «ذات المعنى» في نص (بلا [ … ] والتحيات وكلمات «خلاص») */
export function meaningfulLetters(text) {
  const s = n(String(text || '').replace(/\[[^\]]*\]/g, ' '))
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ');
  let padded = ` ${s.trim()} `;
  for (const p of ['السلام عليكم ورحمه الله وبركاته', 'السلام عليكم ورحمه الله', 'السلام عليكم', 'وعليكم السلام', 'صباح الخير', 'مساء الخير', 'لو سمحتي', 'لو سمحت', 'ممكن', 'شكرا', 'اهلا', 'ازيك', 'خلاص']) {
    while (padded.includes(` ${p} `)) padded = padded.replace(` ${p} `, ' ');
  }
  // v10 experience: اسم المكتب و«إمام» ليسا كلامًا عن المشكلة
  padded = padded.toLowerCase();
  for (const p of brandWords()) {
    while (padded.includes(` ${p} `)) padded = padded.replace(` ${p} `, ' ');
  }
  return (padded.match(/\p{L}/gu) || []).length;
}

/**
 * أقرب رد جاهز لسؤال إجرائي:
 * (1) كلمات عنوانه موجودة في كلامها (نصف كلمات العنوان على الأقل، وكلمتان)؛ وإلا
 * (2) [مراجعة 9.2] رد جاهز من نفس مجالها القانوني (تصنيف عنوانه ونصه) — الأكثر كلمات مشتركة ثم الأكثر استخدامًا.
 * بدون (2) كان أغلب «ترد الإدارة» بلا مسودة رد («أهلًا…» والتوقيع فقط) مع أن للمؤسسة ردًا جاهزًا للموضوع نفسه
 * (معاش الأرملة، إعلام الوراثة، نزاع الإيجار…). الرد يُعرض للإدارة لتراجعه قبل أي إرسال.
 */
function bestQuickReply(text, quickReplies = [], area = null) {
  const have = new Set(tokens(text));
  let best = null;
  let near = null;
  for (const q of quickReplies || []) {
    const tt = [...new Set(tokens(q.title || ''))];
    if (!tt.length) continue;
    const hit = tt.filter((x) => have.has(x)).length;
    const score = hit / tt.length;
    if (hit >= 2 && score >= 0.5 && (!best || score > best.score || (score === best.score && (q.usage_count || 0) > (best.q.usage_count || 0)))) best = { q, score };
    if (!best && area && area !== 'GEN' && classify(`${q.title || ''}\n${q.body || ''}`).area === area) {
      const bt = new Set(tokens(`${q.title || ''} ${q.body || ''}`));
      const shared = [...have].filter((x) => bt.has(x)).length + hit * 2;
      if (!near || shared > near.shared || (shared === near.shared && (q.usage_count || 0) > (near.q.usage_count || 0))) near = { q, shared };
    }
  }
  return best ? best.q : near ? near.q : null;
}

// v10 experience (X10-B3 #12): الناس سيكتبون «مرحبا إمام» أو «السلام عليكم» واسم المكتب: اسم المكتب (الكامل والمختصر،
// كما في الإعدادات الحالية عبر setBrandNames، وإلا الافتراضي) و«إمام» تُحذف مع التحية من أول السطر.
let brandSource = () => [DEFAULT_SETTINGS.brand_name, DEFAULT_SETTINGS.brand_short_name];
/** يضبط مصدر أسماء المكتب الحالية (تستدعيه src/brand.js) */
export function setBrandNames(fn) {
  if (typeof fn === 'function') brandSource = fn;
}
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** أسماء المكتب بعد normalizeArabic وبحروف صغيرة، الأطول أولًا (+ «امام») */
function brandWords() {
  let names = [];
  try {
    names = brandSource() || [];
  } catch {
    names = [];
  }
  return [...new Set([...names, 'إمام'].map((x) => n(String(x || '')).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
}
/** يحذف اسم المكتب من أول نص (بعد التحية) — يعيد عدد الكلمات المحذوفة */
function brandLead(norm) {
  const low = norm.toLowerCase();
  for (const w of brandWords()) {
    const m = new RegExp(`^${escRe(w)}(?=$|[\\s،,.!؟?:-])[\\s،,.!؟?:-]*`, 'u').exec(low);
    if (m) return { len: m[0].length, words: w.split(/\s+/).length };
  }
  return null;
}

// تحيات وافتتاحيات لا تصلح «سطرًا واحدًا» للقصة (بعد normalizeArabic)
const LINE_OPENERS = /^(?:(?:السلام عليكم(?: ورحمه الله(?: وبركاته)?)?|سلام عليكم|وعليكم السلام|صباح الخير|مساء الخير|اهلا(?: وسهلا)?|مرحبا(?: بيكم)?|ازيكم|ازيك|لو سمحت(?:ي|وا)?|بعد اذنك(?:م)?|بخصوص(?: الطلب| طلبي)?)[\s،,.!؟?:-]*)+/u;

/**
 * [مراجعة 9.2] السطر الواحد على بطاقة القصة: أول جملة فيها كلام حقيقي، بلا التحية في أولها ولا رقم الطلب
 * (لا «مرحبًا بيوت مصر» ولا «السلام عليكم بخصوص الطلب REQ-…» كملخص).
 */
function storyLine(candidates, fallback) {
  for (const raw of candidates) {
    const noCodes = String(raw || '').replace(/REQ-\d{4}-\d{5}/gi, ' ').replace(/\s+/g, ' ').trim();
    const norm = n(noCodes);
    const m = LINE_OPENERS.exec(norm);
    // نحذف من النص الأصلي بقدر كلمات التحية (normalizeArabic لا يغيّر عدد الكلمات)
    let drop = m ? m[0].trim().split(/\s+/).filter(Boolean).length : 0;
    // v10: ثم اسم المكتب إن جاء بعد التحية («مرحبا إمام، …»)
    const afterGreeting = m ? norm.slice(m[0].length) : norm;
    const b = m ? brandLead(afterGreeting) : null;
    if (b) {
      drop += b.words;
      const again = LINE_OPENERS.exec(afterGreeting.slice(b.len));
      if (again) drop += again[0].trim().split(/\s+/).filter(Boolean).length;
    }
    const rest = drop ? noCodes.split(/\s+/).slice(drop).join(' ').replace(/^[\s،,.!؟?:-]+/, '') : noCodes;
    if (meaningfulLetters(rest) >= 12) return truncate(rest, 140);
  }
  return truncate(fallback || '', 140);
}

/** أول «محكمة …» في كلامها (حتى 4 كلمات) كما كتبتها — لا «المحكمة» وحدها */
function courtOf(text) {
  const m = /(?:^|[\s،,.(«"])(محكم[ةه](?:[ \t]+[^\s،,.؛:«»()"]+){1,3})/u.exec(String(text || ''));
  return m ? m[1].trim() : null;
}

/**
 * المسار المقترح (أول قاعدة تنطبق): محجوب (رسالة صوتية لم تُكتب / لا حكاية بعد) ← توجيه ← نسألها الأول ← قضية ← رد الإدارة ← استشارة.
 * ctx: { governorate, topic, voice: {missing, done, total}, referrals, quickReplies, meaningfulLetters, blocked }
 */
export function recommendTrack(text, base, ctx = {}) {
  const c = ctx.classified || classify(text);
  const norm = c.norm;
  const forms = c.forms;
  const letters = Number.isFinite(ctx.meaningfulLetters) ? ctx.meaningfulLetters : meaningfulLetters(text);
  const voice = ctx.voice || { total: 0, done: 0, missing: 0 };
  const facts = base.facts || [];
  const oneLine = storyLine([...facts, ...sentences(text).filter((x) => !/^\[[^\]]*\]$/.test(x.trim()))], facts[0] || base.title || '');
  const draft = (over = {}) => ({
    title: base.title,
    facts_for_lawyer: `${base.summary}${facts.length ? `\nالوقائع كما وردت:\n${facts.map((f) => `• ${f}`).join('\n')}` : ''}`,
    internal_note: null,
    brief_for_lawyer: null,
    matter: null,
    questions_for_her: [],
    reply_to_her: null,
    referral_target: null,
    resolution_note: null,
    ...over,
  });
  const out = (track, reason, confidence, over = {}, extra = {}) => ({
    one_line: oneLine,
    recommended_track: track,
    track_reason: reason,
    track_confidence: confidence,
    request_draft: draft(over),
    ...extra,
  });
  const brief = `المطلوب: رأي مبدئي في: ${base.suggested_issues?.[0]?.title || base.title}، مع المستندات اللازمة والخطوات العملية للمستفيدة.`;

  // 1) محجوب: لا قرار قبل سماع القصة
  const blocked = ctx.blocked || (voice.missing > 0 && letters < 60 ? 'voice' : null);
  if (blocked === 'no_story') {
    return out(null, 'طلبت مكالمة ولم تحكِ مشكلتها بعد — اتصل بها وسجّل المكالمة أولًا.', 0, {}, {
      blocked: 'no_story',
      one_line: 'طلبت مكالمة ولم تحكِ مشكلتها بعد',
      missing_info: [{ item: 'حكاية المستفيدة (تُسمع في المكالمة)', kind: 'information' }, ...(base.missing_info || [])].slice(0, 8),
    });
  }
  if (blocked === 'media_failed') {
    return out(null, 'تعذّر تنزيل الرسالة الصوتية — اطلبوا منها إعادة إرسالها.', 0, {}, { blocked: 'media_failed', one_line: facts.length ? oneLine : 'رسالة صوتية تعذّر تنزيلها' });
  }
  if (blocked) return out(null, 'القصة في رسالة صوتية لم تُكتب بعد — اسمعها أولًا.', 0, {}, { blocked: 'voice_untranscribed', one_line: facts.length ? oneLine : 'رسالة صوتية لم تُكتب بعد' });

  // 2) توجيه: طلب خارج الدعم القانوني (إلا نفقة الأطفال وما يشبهها)
  const topScore = Math.max(0, ...Object.values(c.scores || {}).map((x) => x.score));
  const familySupport = ['alimony', 'custody'].includes(ctx.topic) || any(norm, forms, FAMILY_SUPPORT);
  if (!familySupport && topScore < 4) {
    for (const r of Array.isArray(ctx.referrals) ? ctx.referrals : []) {
      const kws = (Array.isArray(r?.keywords) ? r.keywords : []).map((k) => n(String(k)).trim()).filter(Boolean);
      if (kws.some((k) => norm.includes(k))) {
        // [بوابة 9.2 G14] بلا أقواس متداخلة (اسم الجهة نفسه فيه أقواس)
        return out('refer', `طلبها خارج الدعم القانوني — الأنسب: ${r.label}.`, 0.55, {
          referral_target: r.label || null,
          reply_to_her: r.reply || null,
          resolution_note: `وُجّهت إلى: ${r.label}`,
        }, { reply_source: { kind: 'referral_directory', key: r.key || null, title: r.label || null } });
      }
    }
  }

  // 3) نسألها الأول: الرسائل قليلة ولا توضح المشكلة
  const topicArea = ctx.topicArea || topicByKey(ctx.topic)?.area || null;
  if (letters < 25 || (base.legal_area === 'GEN' && letters < 120 && !ctx.topic)) {
    return out('need_info', 'الرسائل قليلة ولا توضح المشكلة بعد.', 0.6, { questions_for_her: questionsFor(topicArea || base.legal_area) });
  }

  // 4) قضية: دعوى قائمة أو جلسة أو حكم (لا مجرد نية رفع قضية)
  const pending = any(norm, forms, COURT_PENDING);
  if (pending) {
    const sent = sentences(text).find((s) => n(s).includes('جلسه'));
    return out('matter', 'ذكرت قضية قائمة أو جلسة أو حكمًا، فتحتاج متابعة أمام المحكمة.', 0.6, {
      brief_for_lawyer: brief,
      matter: { kind: 'litigation', court: courtOf(text), opponent: null, next_hearing_text: sent ? truncate(sent, 120) : null },
    }, any(norm, forms, ['جلسه']) && !['high', 'urgent'].includes(base.urgency) ? { urgency: 'high' } : {});
  }
  void FUTURE_INTENT; // نية رفع قضية وحدها ← استشارة (القاعدة 6)

  // 5) رد الإدارة: سؤال إجرائي بلا نزاع — [بوابة 9.2 G7] ولا نفقة/مصاريف عيال من أبيهم، ولا طرف آخر يفعل شيئًا ضدها
  // («عايزة أعرف حقي» أو «أعمل إيه» في نزاع ليس سؤالًا يُغلق برد واحد)
  const clientLetters = (String(text || '').match(/\p{L}/gu) || []).length;
  const dispute = any(norm, forms, DISPUTE) || familySupport || (any(norm, forms, OPPONENTS) && any(norm, forms, OPPONENT_ACTS));
  if (any(norm, forms, INFO_QUESTION) && !dispute && clientLetters <= 400) {
    // [بوابة 9.2 N12] الرد الجاهز «الأقرب» من مجال الموضوع الذي اختارته (ورق رسمي ≠ إعلام وراثة لمجرد ذكر «وفاة»)
    const qr = bestQuickReply(text, ctx.quickReplies, topicArea || (base.legal_area !== 'GEN' ? base.legal_area : null));
    return out('internal', 'سؤال إجرائي بلا نزاع واضح؛ يكفيه رد بمعلومة أو توجيه.', 0.5, {
      reply_to_her: qr ? qr.body : null,
      resolution_note: `استفسار عن ${base.title}: أُجيبت بالخطوات والمستندات المطلوبة.`,
    }, { reply_source: qr ? { kind: 'quick_reply', id: qr.id, title: qr.title } : null });
  }

  // 6) استشارة (المعتاد)
  return out('consultation', `مسألة ${AREA_LABEL[base.legal_area] || 'قانونية'} تحتاج رأي محامٍ.`, Math.round((Number(base.confidence) || 0.3) * 0.8 * 100) / 100, { brief_for_lawyer: brief });
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

/** v9.1 b-portal: الاسم الذي نخاطب به («أم محمد عبد الله» ← «أم محمد»، «سامية محمود» ← «سامية») */
function kunyaName(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  if (/^(أم|ام|إم|أبو|ابو)$/.test(w[0])) return w[1] ? `${w[0]} ${w[1]}` : '';
  if (w[0] === 'عبد' && w[1]) return `${w[0]} ${w[1]}`;
  return w[0];
}

/**
 * v9.1 b-portal (B91-08): اقتراح «الخلاصة بكلام بسيط» و«الخطوات» من الرأي المعتمد بلا ذكاء اصطناعي خارجي.
 * الخلاصة من «التوصية»/«الخلاصة»/«الرأي» (وإلا فارغة) مختصرة لثلاث جمل ≤ 400 حرف؛ الخطوات مما اقترحه المحامي للمستفيد/ة،
 * وإلا خطوات عامة آمنة لا تضيف رأيًا قانونيًا. تراجعها الإدارة دائمًا قبل الإرسال.
 */
export function clientSummary({ opinion, clientSteps, tone = 'charity' } = {}) {
  const lines = String(opinion || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^مسودة أولية|^\[يُستكمل/.test(l));
  // (إصلاح 9.1) الخلاصة من فقرة الخلاصة/التوصية/الرأي فقط (الأخيرة أولًا)، لا من أول فقرة: أول فقرة غالبًا «الوقائع»
  // وفيها مصطلحات («قاصرين»). بلا فقرة كهذه لا اقتراح، وتكتب الإدارة الخلاصة بنفسها.
  const ORD = /^(?:أولًا|أولا|ثانيًا|ثانيا|ثالثًا|ثالثا|رابعًا|رابعا|خامسًا|خامسا|سادسًا|سادسا|[0-9٠-٩]+[.)-])\s*[:：.\-–]?\s*/;
  const HEAD = '(?:التوصيات|التوصية|الخلاصة والتوصية|خلاصة الرأي|الخلاصة|النتيجة|الرأي القانوني|الرأي في المسائل|الرأي|رأينا|الخطوات المقترحة|المطلوب عمله)';
  const CONCL = new RegExp(`^${HEAD}(?=\\s*[:：.\\-–]|\\s*$)`);
  const FACTS = /^(?:الوقائع|وقائع|ملخص الوقائع|التكييف|الأسانيد|السند|المسائل)/;
  const bare = lines.map((l) => l.replace(ORD, ''));
  let base = '';
  for (let i = bare.length - 1; i >= 0; i--) {
    if (!CONCL.test(bare[i])) continue;
    base = bare[i].replace(new RegExp(`^${HEAD}\\s*[:：.\\-–]?\\s*`), '').trim();
    // عنوان وحده في سطره («ثالثًا: الرأي في المسائل») ← الفقرة التالية له
    if (!base && bare[i + 1] && !FACTS.test(bare[i + 1]) && !CONCL.test(bare[i + 1])) base = bare[i + 1];
    break;
  }
  const parts = sentences(base).slice(0, 3);
  let summary = (parts.length ? parts.join(' ') : base).trim();
  if (summary.length > 400) summary = `${summary.slice(0, 397).replace(/\s+\S*$/, '')}…`;
  let steps = [];
  try {
    steps = Array.isArray(clientSteps) ? clientSteps : JSON.parse(clientSteps || '[]');
  } catch {
    steps = String(clientSteps || '').split('\n');
  }
  steps = steps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 160));
  if (!steps.length) {
    // v11 segment-server (L11-25): خطوات عامة بصيغة الجمع المهذبة لعملاء الأفراد والشركات
    steps = tone === 'charity' ? ['جهّزي الورق اللي معاكي عن المشكلة دي.', 'لو عندك أي سؤال على الرد، اسألينا من صفحتك أو كلمينا.'] : ['جهّزوا المستندات المتعلقة بالموضوع.', 'لأي سؤال على الرد، راسلونا من صفحة طلبكم أو اتصلوا بنا.'];
  }
  return { summary, steps };
}

/** نسخة موجهة للعميل بلغة مبسطة */
export function clientVersion({ clientName, caseCode, opinion, orgName }) {
  const body = String(opinion || '')
    .split('\n')
    .filter((l) => !/^مسودة أولية|^\[يُستكمل/.test(l.trim()))
    .join('\n')
    .trim();
  void caseCode; // v9.1 b-portal (B91-08): لا كود داخلي في نص الرد؛ الرقم الوحيد الذي تعرفه هو رقم الطلب
  const first = kunyaName(clientName);
  return [
    // v9.1 b-portal (B91-08): تحية بالاسم بدل «الأستاذ/ة …، تحية طيبة وبعد»
    `${first ? `أهلًا يا ${first}` : 'أهلًا بيكي'}،`,
    '',
    'ده ردّنا على مشكلتك بعد ما درسها المختصين عندنا:',
    '',
    body,
    '',
    'هذه الإفادة مبنية على المعلومات والمستندات التي قدمتموها، وقد يتغير الرأي إذا ظهرت وقائع أو مستندات جديدة.',
    'للاستفسار أو إرسال أي مستندات إضافية يمكنكم الرد على هذه الرسالة.',
    '',
    'مع خالص التحية،',
    `فريق برنامج الدعم القانوني — ${orgName || 'مؤسسة بيوت مصر'}`,
  ].join('\n');
}

/** v11 segment-server (SS-6): النسخة الموجهة لعميل الأفراد والشركات — نفس الرأي المعتمد بصيغة الجمع المهذبة، بلا «برنامج الدعم» */
export function clientVersionPaid({ clientName, caseCode, opinion, orgName }) {
  const body = String(opinion || '')
    .split('\n')
    .filter((l) => !/^مسودة أولية|^\[يُستكمل/.test(l.trim()))
    .join('\n')
    .trim();
  void caseCode;
  const first = kunyaName(clientName);
  return [
    `${first ? `مرحبًا ${first}` : 'مرحبًا بكم'}،`,
    '',
    'هذا ردّنا على موضوعكم بعد دراسته من المختصين لدينا:',
    '',
    body,
    '',
    'هذه الإفادة مبنية على المعلومات والمستندات التي قدمتموها، وقد يتغير الرأي إذا ظهرت وقائع أو مستندات جديدة.',
    'للاستفسار أو إرسال أي مستندات إضافية يمكنكم الرد على هذه الرسالة.',
    '',
    'مع خالص التحية،',
    `فريق ${orgName || 'المكتب'}`,
  ].join('\n');
}

// v11 segment-server (SS-6): أسئلة «نسألهم الأول» لعملاء الأفراد والشركات — نفس الأسئلة بصيغة الجمع المهذبة (بلا رموز النوع)
const PAID_QUESTIONS_BY_AREA = {
  GEN: ['يرجى توضيح ما حدث في جملتين: ما الموضوع، ومع من؟'],
  INH: ['من المتوفى، ومتى كانت الوفاة؟', 'هل صدر إعلام الوراثة؟'],
  PEN: ['المعاش عن من؟ ومتى كانت الوفاة؟', 'هل سبق التقدم بطلب المعاش؟ وما الرد الذي تلقيتموه؟'],
  FAM: ['مع من الخلاف تحديدًا؟', 'هل توجد قضية مرفوعة من قبل؟'],
  GRD: ['أين أموال القاصرين الآن: في البنك أم ضمن تركة لم تُقسَّم؟', 'هل يوجد وصي معيَّن على القاصرين؟'],
  PRP: ['هل العقار إيجار أم تمليك؟ وباسم من؟', 'هل طُلب منكم إخلاء العقار؟'],
  ADM: ['ما المستند الذي تريدون استخراجه تحديدًا؟', 'ما الجهة التي تقدمتم إليها من قبل، وما الرد؟'],
};
const PAID_QUESTIONS_OTHER = ['يرجى توضيح ما حدث في جملتين: ما الموضوع، ومع من؟', 'هل لديكم مستندات تخص الموضوع؟ يمكنكم تصويرها وإرسالها هنا.'];
/** أسئلة قصيرة لعملاء الأفراد والشركات (حتى 3) حسب المجال */
export function paidQuestionsFor(area) {
  if (!area || area === 'GEN') return PAID_QUESTIONS_BY_AREA.GEN.slice();
  return (PAID_QUESTIONS_BY_AREA[area] || PAID_QUESTIONS_OTHER).slice(0, 3);
}

// ───────────────────────── الإصدار 9: الردود المقترحة وتحليل المستندات (بدون ذكاء اصطناعي) ─────────────────────────

const REF = { intake: 'طلبكم رقم', case: 'ملفكم رقم', matter: 'ملفكم رقم' };

function bullet(items) {
  return items.map((x) => `• ${x}`).join('\n');
}

/**
 * بند قائمة من نص طلب كامل اعتمدته الإدارة للمستفيد: «برجاء إرسال صورة إعلام الوراثة.» ← «صورة إعلام الوراثة»،
 * حتى لا يتكرر فعل الطلب داخل القالب («نرجو إرسال: برجاء إرسال…»). علامة الاستفهام تبقى.
 */
export function asItem(text) {
  const raw = String(text || '').trim();
  const s = raw
    .replace(/^(?:برجاء|نرجو(?:\s+من\s+حضرتكم)?|يرجى|رجاء|من\s+فضلكم?|نأمل)\s+(?:التكرم\s+ب)?(?:إرسال|ارسال|إحضار|موافاتنا\s+ب|توضيح|[إا]فادتنا\s+(?:ب|عن)\s*)\s*/u, '')
    .replace(/[.،؛!\s]+$/u, '')
    .trim();
  return s || raw;
}
const stopEnd = (s) => String(s || '').replace(/[.،؛!\s]+$/u, '');

/**
 * ردود واتساب مقترحة من قوالب ثابتة مبنية على قائمة النواقص وحالة الطلب والرد المعتمد فقط.
 * لا تتضمن أي استنتاج قانوني لم تعتمده الإدارة (الإجابة القانونية تُنقل حرفيًا من الرد المعتمد إن وُجد).
 * @param {{kind:'intake'|'case'|'matter', intent:string, code:string, org_name:string, org_address?:string,
 *   status_phrase?:string, missing?:Array<{item:string,kind:string}>, pending_requests?:Array<{question:string}>,
 *   approved_answer?:{text:string, sent:boolean, sent_on?:string}|null,
 *   next_event?:{kind_label:string,title:string,date:string,time:string,location?:string,attendance:boolean}|null}} c
 */
export function suggestReplies(c) {
  // v10 experience: الاسم يأتي من المستدعي (اسم المكتب) — لا اسم ثابت هنا
  const org = String(c.org_name || '').trim();
  const sign = org ? `— ${org}` : '';
  const ref = `${REF[c.kind] || 'طلبكم رقم'} ${c.code}`;
  const out = [];
  const add = (tone, text) => out.push({ tone, text: text.trim() });
  switch (c.intent) {
    case 'ask_documents': {
      const uniq = (xs) => [...new Set(xs.map((x) => asItem(x)).filter(Boolean))];
      const pend = c.pending_requests || [];
      // لا يتكرر المستند نفسه مرتين (مرة من طلب سابق أُرسل للمستفيد ومرة من قائمة النواقص)
      const pendTypes = new Set(pend.map((r) => docTypeOf(r.question)).filter(Boolean));
      const missing = (c.missing || []).filter((m) => !(m.kind === 'document' && pendTypes.has(docTypeOf(m.item))));
      const docs = uniq([...pend.filter((r) => r.kind === 'document').map((r) => r.question), ...missing.filter((m) => m.kind === 'document').map((m) => m.item)]).slice(0, 4);
      const infos = uniq([...pend.filter((r) => r.kind !== 'document').map((r) => r.question), ...missing.filter((m) => m.kind !== 'document').map((m) => m.item)]).slice(0, Math.max(1, 4 - docs.length));
      if (!docs.length && !infos.length) docs.push('أي مستندات متعلقة بالموضوع (أحكام، عقود، شهادات رسمية)');
      const parts = [];
      if (docs.length) parts.push(`نرجو التكرم بإرسال ما يلي:\n${bullet(docs)}`);
      if (infos.length) parts.push(`${docs.length ? 'ونرجو كذلك إفادتنا' : 'نرجو التكرم بإفادتنا'} بما يلي:\n${bullet(infos)}`);
      add('formal', `تحية طيبة، لاستكمال دراسة ${ref}، ${parts.join('\n')}\n${docs.length ? 'يمكنكم إرسال صور واضحة للمستندات هنا مباشرة. ' : ''}شكرًا لحضرتكم.\n${sign}`);
      const flat = [...docs, ...infos].map((x) => x.replace(/[؟?]+$/, '')).slice(0, 3);
      add('warm', `أهلًا بحضرتك، حتى نتمكن من مساعدتكم على أفضل وجه نحتاج إلى بعض ${docs.length ? 'المستندات والمعلومات' : 'المعلومات'}: ${flat.join('، ')}.${docs.length ? ' ولا مانع من إرسال صورة بالهاتف المحمول بشرط أن تكون واضحة ومقروءة.' : ''} ${sign}`);
      if (docs.length) add('brief', `برجاء إرسال: ${docs[0]}. شكرًا لكم. ${sign}`);
      else add('brief', `${/[؟?]$/.test(infos[0]) ? infos[0] : `برجاء إفادتنا عن: ${infos[0]}.`} شكرًا لكم. ${sign}`);
      break;
    }
    case 'reassure':
      if (c.closed) {
        // ملف مغلق: لا نعد بمتابعة غير قائمة، بل ندعو لإرسال أي مستجد
        add('formal', `تحية طيبة، نقدّر تواصلكم معنا. ${ref} مغلق حاليًا لدينا، وإن طرأ أي مستجد أو كان لديكم استفسار جديد فيسعدنا تلقيه هنا ودراسته.\n${sign}`);
        add('warm', `أهلًا بحضرتك، نحن إلى جانبكم دائمًا بإذن الله. إن احتجتم إلى أي مساعدة جديدة فراسلونا هنا في أي وقت. ${sign}`);
        add('brief', `شكرًا لتواصلكم. ${ref} مغلق حاليًا، ويسعدنا تلقي أي مستجد هنا. ${sign}`);
        break;
      }
      add('formal', `تحية طيبة، نقدّر ما تمرون به، ونطمئن حضرتكم بأن ${ref} محل اهتمام ومتابعة من الفريق المختص، وسنوافيكم بكل جديد أولًا بأول.\n${sign}`);
      add('warm', `أهلًا بحضرتك، نحن إلى جانبكم بإذن الله. ${ref} ${c.status_phrase || 'قيد المتابعة'}، وأي استفسار يخطر لكم يمكنكم إرساله هنا في أي وقت. ${sign}`);
      add('brief', `نطمئنكم بأن ${ref} ${c.status_phrase || 'قيد المتابعة'}، وسنتواصل معكم قريبًا. ${sign}`);
      break;
    case 'schedule':
      if (c.next_event) {
        // نوع الموعد في سطر مستقل (مثل قالب تذكير الجلسات) حتى لا تتعارض الصيغة مع تذكير النوع وتأنيثه
        const e = c.next_event;
        const where = e.location ? ` في ${e.location}` : '';
        const attend = e.attendance ? ' ويلزم حضوركم شخصيًا.' : '';
        add(
          'formal',
          `تحية طيبة، نذكّر حضرتكم بالموعد القادم في ${ref}:\nنوع الموعد: ${e.kind_label}\nالموضوع: ${e.title}\nالتاريخ: يوم ${e.date} الساعة ${e.time}${e.location ? `\nالمكان: ${e.location}` : ''}${e.attendance ? '\nيلزم حضوركم شخصيًا.' : ''}\nللاستفسار يمكنكم الرد على هذه الرسالة.\n${sign}`,
        );
        add('warm', `أهلًا بحضرتك، تذكير ودي بالموعد القادم (${e.kind_label}) يوم ${e.date} الساعة ${e.time}${where}.${attend} نتمنى لكم التوفيق. ${sign}`);
        add('brief', `تذكير بالموعد القادم (${e.kind_label}): يوم ${e.date} الساعة ${e.time}${where}. ${sign}`);
      } else {
        const place = c.org_address ? `، ويمكنكم الحضور إلى مقر المؤسسة: ${c.org_address}` : '';
        add('formal', `تحية طيبة، نود تحديد موعد مناسب لحضرتكم للتواصل بخصوص ${ref}. برجاء إفادتنا باليوم والوقت المناسبين${place}، أو نتواصل معكم هاتفيًا.\n${sign}`);
        add('warm', `أهلًا بحضرتك، هل يناسبكم أن نتواصل معكم هاتفيًا خلال الأيام القادمة بخصوص ${ref}؟ برجاء إخبارنا بالوقت الأنسب لكم. ${sign}`);
        add('brief', `برجاء إفادتنا بالموعد المناسب لحضرتكم للتواصل بخصوص ${ref}. ${sign}`);
      }
      break;
    default: {
      const a = c.approved_answer;
      if (c.closed && !(a && a.sent)) {
        add('formal', `تحية طيبة، بخصوص ${ref}: الملف مغلق حاليًا لدينا. إن كان لديكم مستجد أو استفسار جديد فيسعدنا تلقيه هنا، وسيدرسه الفريق المختص.\n${sign}`);
        add('warm', `أهلًا بحضرتك، شكرًا لتواصلكم. إن احتجتم إلى أي مساعدة جديدة فنحن في الخدمة، ويمكنكم إرسال التفاصيل هنا. ${sign}`);
      } else if (a && a.sent) {
        add('formal', `تحية طيبة، بخصوص ${ref}: سبق أن أرسلنا إلى حضرتكم الإفادة القانونية المعتمدة${a.sent_on ? ` بتاريخ ${a.sent_on}` : ''}. إن كان لديكم أي استفسار حولها أو مستجد في الموضوع فيسعدنا تلقيه هنا.\n${sign}`);
        add('warm', `أهلًا بحضرتك، نرجو أن تكون الإفادة التي أرسلناها في ${ref} قد أوضحت الصورة. إن احتجتم إلى توضيح أي نقطة فنحن في الخدمة. ${sign}`);
      } else if (a && a.text) {
        const raw = String(a.text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const excerpt = raw.length > 650 ? `${raw.slice(0, 649).trimEnd()}…` : raw;
        add('formal', `تحية طيبة، بخصوص ${ref}، نفيدكم بما يلي:\n${excerpt}\n${sign}`);
        add('brief', `تحية طيبة، الإفادة المعتمدة في ${ref} جاهزة، وسنرسلها إلى حضرتكم كاملة في رسالة مستقلة. ${sign}`);
      } else {
        add('formal', `تحية طيبة، نفيدكم بأن ${ref} ${c.status_phrase || 'قيد الدراسة'}، وسنوافيكم بالرد فور اكتمال دراسته من الفريق القانوني المختص.\n${sign}`);
        // طلب سبق إرساله يُذكَّر به بنصه المعتمد؛ وإلا أول بند ناقص (مستند يُطلب إرساله، ومعلومة يُسأل عنها)
        const pend = (c.pending_requests || [])[0];
        const miss = (c.missing || [])[0];
        let tail = '.';
        if (pend?.question) tail = `، ونذكّركم بطلبنا السابق: ${stopEnd(pend.question)}.`;
        else if (miss?.item) {
          const item = asItem(miss.item);
          if (miss.kind === 'document') tail = `، ولتسريع الدراسة نرجو إرسال: ${item}.`;
          else tail = /[؟?]$/.test(item) ? `، ولتسريع الدراسة نرجو إفادتنا بما يلي: ${item}` : `، ولتسريع الدراسة نرجو إفادتنا عن: ${item}.`;
        }
        add('warm', `أهلًا بحضرتك، وصلتنا رسالتكم وهي محل اهتمامنا. ${ref} ${c.status_phrase || 'قيد الدراسة'}${tail} ${sign}`);
      }
      add(
        'brief',
        c.closed
          ? `شكرًا لتواصلكم. ${ref} مغلق حاليًا، ويسعدنا تلقي أي مستجد هنا. ${sign}`
          : `شكرًا لتواصلكم. ${ref} ${c.status_phrase || 'قيد المتابعة'}، وسنوافيكم بالمستجدات. ${sign}`,
      );
    }
  }
  return out.slice(0, 3);
}

// أنواع المستندات: أنماط اسم الملف (بعد التوحيد)، وما يثبته المستند عادةً، والمستندات المرتبطة التي يُستحسن طلبها.
const DOC_RULES = [
  { type: 'inheritance_declaration', re: /اعلام\s*(ال)?(وراثه|شرعي)|وراثه|inherit/, proves: ['تحديد الورثة الشرعيين وأنصبتهم كما أثبتتها المحكمة'], related: ['شهادة الوفاة', 'مستندات ملكية أصول التركة', 'شهادات ميلاد القاصرين وقرار الوصاية إن وُجدوا'] },
  { type: 'guardianship_order', re: /وصايه|ولايه|حسبي|(^|\s)(ال)?وصي(\s|$)|guardian/, proves: ['صفة الوصي أو الولي في تمثيل القاصرين وإدارة أموالهم وحدود سلطته'], related: ['شهادات ميلاد القاصرين', 'كشف حساب أموال القاصرين', 'إعلام الوراثة'] },
  { type: 'pension_document', re: /معاش|تامين|تكافل|pension|insurance/, proves: ['بيانات المعاش أو الاستحقاق التأميني (رقم المعاش، الجهة، قيمة الصرف)'], related: ['شهادة الوفاة', 'إعلام الوراثة', 'بطاقات الرقم القومي للمستحقين'] },
  { type: 'death_certificate', re: /وفاه|death/, proves: ['واقعة الوفاة وتاريخها، وهي أساس فتح التركة وطلب المعاش واستخراج إعلام الوراثة'], related: ['إعلام الوراثة', 'قسيمة الزواج (لإثبات صفة الأرملة)', 'شهادات ميلاد الأبناء'] },
  { type: 'birth_certificate', re: /ميلاد|birth/, proves: ['نسب الطفل وتاريخ ميلاده (لتحديد السن والحضانة والنفقة واستحقاق المعاش)'], related: ['قسيمة زواج الوالدين', 'شهادة وفاة الأب إن كان متوفى'] },
  { type: 'marriage_divorce', re: /قسيمه|زواج|طلاق|marriage|divorce/, proves: ['قيام الزوجية أو انتهائها وتاريخه (أساس النفقة والحضانة والميراث ومعاش الأرملة)'], related: ['شهادات ميلاد الأبناء', 'أي أحكام سابقة بين الطرفين'] },
  { type: 'national_id', re: /بطاقه|رقم قومي|هويه|national\s*id|id\s*card/, proves: ['هوية صاحب المستند وبياناته المدنية'], related: [] },
  { type: 'court_judgment', re: /(^|\s)(ال)?حكم(\s|$)|judgment|ruling/, proves: ['ما قضت به المحكمة في النزاع ومدى قابليته للتنفيذ'], related: ['الصيغة التنفيذية وما يفيد إعلان الحكم', 'ما يفيد نهائية الحكم (شهادة بعدم الطعن)'] },
  { type: 'lease_contract', re: /ايجار|lease|rent/, proves: ['العلاقة الإيجارية وشروطها والأجرة والمدة'], related: ['إيصالات سداد الأجرة', 'ما يثبت صفة المؤجر (ملكية أو وكالة)'] },
  { type: 'sale_contract', re: /(^|\s)(ال)?(بيع|شراء)(\s|$)|sale|purchase/, proves: ['التصرف بالبيع أو الشراء وأطرافه وثمنه'], related: ['ما يفيد تسجيل العقد أو صدور حكم بصحة التوقيع أو بصحته ونفاذه', 'سند ملكية البائع'] },
];

/** نوع المستند المرجح من نص (اسم ملف أو بند في قائمة النواقص)، أو null */
export function docTypeOf(text) {
  const hay = n(String(text || '')).replace(/[_\-.]+/g, ' ').toLowerCase();
  return DOC_RULES.find((r) => r.re.test(hay))?.type || null;
}

export const HEURISTIC_DOC_NOTE = 'تحليل مبدئي دون ذكاء اصطناعي: صُنّف المستند من اسمه وحجمه فقط ولم يُقرأ محتواه، ويحتاج إلى مراجعة يدوية.';

/** تصنيف مبدئي لمستند من اسمه ونوعه وحجمه (لا يُقرأ المحتوى) */
export function analyzeDocument({ filename = '', title = '', mime = '', size = 0 } = {}, { reason = null } = {}) {
  const hay = n(`${title} ${filename}`).replace(/[_\-.]+/g, ' ').toLowerCase();
  const rule = DOC_RULES.find((r) => r.re.test(hay));
  const type = rule ? rule.type : 'other';
  const flags = [];
  const isImage = String(mime).startsWith('image/');
  if (isImage && size > 0 && size < 40 * 1024) flags.push({ kind: 'illegible', text: 'حجم الصورة صغير، وقد تكون دقتها غير كافية للقراءة — يُستحسن طلب صورة أوضح.' });
  if (mime === 'application/pdf' && size > 0 && size < 3 * 1024) flags.push({ kind: 'missing_pages', text: 'حجم الملف صغير جدًا، وقد يكون فارغًا أو صفحة واحدة غير مكتملة.' });
  if (type === 'national_id') flags.push({ kind: 'unverified', text: 'يُتحقق من سريان البطاقة؛ فالبطاقة منتهية الصلاحية لا تقبلها بعض الجهات.' });
  const facts = [];
  const year = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(latinDigits(`${title} ${filename}`));
  if (year) facts.push({ kind: 'date', label: 'سنة واردة في اسم الملف', value: year[1] });
  return {
    doc_type: type,
    confidence: rule ? 0.5 : 0.2,
    summary: `${rule ? 'يبدو من اسم الملف أنه' : 'لم يتضح نوع المستند من اسمه؛ صُنّف'} «${DOC_TYPE_LABELS[type]}» (الملف: ${filename || title || '—'}).`,
    key_facts: facts,
    proves: rule ? rule.proves : ['يُحدَّد بعد اطلاع الفريق على المستند.'],
    red_flags: flags,
    missing_related: rule ? rule.related : [],
    note: reason ? `${HEURISTIC_DOC_NOTE} (${reason})` : HEURISTIC_DOC_NOTE,
  };
}

// ───────────── v11 segment-server (S11-29، r2 S14): اقتراح نوع الخدمة من الكلمات — لا يُطبَّق تلقائيًا أبدًا ─────────────
// [الكلمة كما تُعرض للإدارة, الوزن]. عبارة متعددة الكلمات تُطابق كنص، والكلمة المفردة كلمة كاملة (بعد normalizeArabic).
const SEGMENT_HINT_WORDS = {
  paid: [
    ['شركة', 1], ['شركتنا', 2], ['شركتي', 2], ['مؤسستنا التجارية', 2], ['سجل تجاري', 2], ['بطاقة ضريبية', 2],
    ['عقد توريد', 2], ['عقد توزيع', 2], ['عقد شراكة', 2], ['موظفين', 1], ['موظف عندنا', 2], ['ش.م.م', 2], ['LLC', 2],
    ['أتعاب', 1], ['بكام الاستشارة', 2], ['التكلفة', 1], ['السعر', 1], ['حجز استشارة', 2], ['محامي خاص', 2], ['استثمار', 1], ['فاتورة', 1],
  ],
  charity: [
    ['أرملة', 2], ['جوزي اتوفى', 2], ['جوزي مات', 2], ['أيتام', 2], ['العيال اليتامى', 2], ['تكافل وكرامة', 2],
    ['مش قادرة أدفع', 2], ['مش معايا فلوس', 2], ['مساعدة', 1], ['المؤسسة', 1], ['الجمعية', 1], ['ببلاش', 2], ['مجاني', 1], ['معاش الأرملة', 2],
  ],
};
const SEG_KEY = (s) => n(String(s)).replace(/[^\p{L}\p{N}.\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const SEGMENT_HINT_INDEX = Object.fromEntries(Object.entries(SEGMENT_HINT_WORDS).map(([seg, list]) => [seg, list.map(([shown, w]) => ({ shown, w, key: SEG_KEY(shown) }))]));

/**
 * { segment: 'paid'|'charity'|null, confidence 0..1, reasons[] } — يلزم فرق كلمتين على الأقل وثقة ≥ 0.6، وإلا null.
 * reasons جملة واحدة تذكر الكلمات («ذكر «شركتي» و«عقد توريد»»).
 */
export function segmentHint(text) {
  const hay = ` ${SEG_KEY(text)} `;
  const hits = { paid: [], charity: [] };
  const score = { paid: 0, charity: 0 };
  if (hay.trim()) {
    for (const seg of ['paid', 'charity']) {
      for (const t of SEGMENT_HINT_INDEX[seg]) {
        if (t.key && hay.includes(` ${t.key} `)) {
          hits[seg].push(t.shown);
          score[seg] += t.w;
        }
      }
    }
  }
  const total = score.paid + score.charity;
  const win = score.paid > score.charity ? 'paid' : score.charity > score.paid ? 'charity' : null;
  const lose = win === 'paid' ? 'charity' : 'paid';
  if (!win || hits[win].length - hits[lose].length < 2 || score[win] / total < 0.6) return { segment: null, confidence: 0, reasons: [] };
  const words = hits[win].slice(0, 3).map((w) => `«${w}»`);
  const reason = `ذكر ${words.length > 1 ? `${words.slice(0, -1).join('، ')} و${words[words.length - 1]}` : words[0]}`;
  return { segment: win, confidence: Math.round((score[win] / total) * 100) / 100, reasons: [reason] };
}
