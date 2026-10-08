// مزود Claude عبر حزمة Anthropic الرسمية (@anthropic-ai/sdk) — اعتمادية اختيارية تُحمَّل فقط عند ضبط المفتاح.
// عند أي تعذر (غياب الحزمة، خطأ شبكة، رفض، تجاوز سقف الإنفاق) يعود النظام تلقائيًا إلى المحلل المحلي دون إيقاف العمل.
// كل استدعاء يُبلَّغ عنه عبر onUsage (الرموز، النموذج، زمن الاستجابة، النجاح أو الخطأ) لحساب التكلفة وسقف الإنفاق.
import { AREA_CODES, LABELS } from '../constants.js';
import { STORY_TRACKS } from '../constants.js'; // v9.2 (admin-ai)

export class AiUnavailable extends Error {
  constructor(message, code = 'unavailable') {
    super(message);
    this.code = code;
  }
}

let sdkPromise = null;
let sdkLoader = () => import('@anthropic-ai/sdk').then((m) => m.default || m);
function loadSdk() {
  if (!sdkPromise) sdkPromise = Promise.resolve().then(sdkLoader).catch(() => null);
  return sdkPromise;
}
/** للاختبارات فقط: استبدال الحزمة بنسخة وهمية (لا يُستدعى الـ API الحقيقي في الاختبارات أبدًا). null يعيد الافتراضي. */
export function setSdkLoader(fn) {
  sdkLoader = fn || (() => import('@anthropic-ai/sdk').then((m) => m.default || m));
  sdkPromise = null;
}

// ───────────── جدول الأسعار ─────────────
// أسعار تقديرية بالدولار الأمريكي لكل مليون رمز على Anthropic API المباشر (أسعار أكتوبر 2026).
// cache_write = كتابة الذاكرة المؤقتة لمدة 5 دقائق (1.25× سعر الإدخال)، cache_read = القراءة منها.
// تُستخدم لتقدير التكلفة وتطبيق سقف الإنفاق الشهري فقط؛ الفاتورة الرسمية من لوحة Anthropic هي المرجع.
// عند تغيّر الأسعار أو إضافة نموذج يُحدَّث هذا الجدول؛ النموذج غير المعروف يُحسب بسعر النموذج الافتراضي.
export const MODEL_PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, cache_read: 0.25, cache_write: 12.5 },
  'claude-fable-5': { input: 10, output: 50, cache_read: 1, cache_write: 12.5 },
  'claude-opus-5-5': { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  'claude-opus-5': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  'claude-opus-4-7': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  'claude-opus-4-6': { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  'claude-sonnet-5': { input: 2, output: 10, cache_read: 0.2, cache_write: 2.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-haiku-4-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
};
export const DEFAULT_MODEL = 'claude-opus-5-5';

export function priceFor(model) {
  const m = String(model || '');
  if (MODEL_PRICES[m]) return { ...MODEL_PRICES[m], known: true };
  // معرّفات بلاحقة (مثل تاريخ إصدار) تُطابق أطول بادئة معروفة
  const key = Object.keys(MODEL_PRICES).sort((a, b) => b.length - a.length).find((k) => m.startsWith(k));
  return key ? { ...MODEL_PRICES[key], known: true } : { ...MODEL_PRICES[DEFAULT_MODEL], known: false };
}

/** التكلفة التقديرية بأجزاء المليون من الدولار (عدد صحيح) */
export function estimateCostMicroUsd(model, usage = {}) {
  const p = priceFor(model);
  // السعر لكل مليون رمز بالدولار = السعر لكل رمز بأجزاء المليون من الدولار
  const micro =
    (Number(usage.input_tokens) || 0) * p.input +
    (Number(usage.output_tokens) || 0) * p.output +
    (Number(usage.cache_read_input_tokens) || 0) * p.cache_read +
    (Number(usage.cache_creation_input_tokens) || 0) * p.cache_write;
  return Math.round(micro);
}

/** ترجمة أخطاء خدمة Claude إلى رسائل عربية واضحة للإدارة */
export function describeError(e, Anthropic) {
  const status = typeof e?.status === 'number' ? e.status : null;
  const is = (name) => !!(Anthropic && Anthropic[name] && e instanceof Anthropic[name]);
  if (e instanceof AiUnavailable) return { code: e.code, status, message: e.message };
  if (is('APIConnectionTimeoutError') || e?.name === 'APIConnectionTimeoutError') return { code: 'timeout', status, message: 'انتهت مهلة الاتصال بخدمة Claude دون رد، حاول مرة أخرى' };
  if (is('APIConnectionError') || e?.name === 'APIConnectionError' || (!status && /fetch|network|ECONN|ENOTFOUND|socket/i.test(String(e?.message || '')))) {
    return { code: 'network', status, message: 'تعذر الاتصال بخدمة Claude (تحقق من اتصال الخادم بالإنترنت)' };
  }
  if (status === 401 || is('AuthenticationError')) return { code: 'invalid_key', status: 401, message: 'مفتاح Anthropic API غير صالح أو أُلغي' };
  if (status === 403 || is('PermissionDeniedError')) return { code: 'permission', status: 403, message: 'المفتاح لا يملك صلاحية استخدام هذا النموذج أو الخدمة' };
  if (status === 404 || is('NotFoundError')) return { code: 'model_not_found', status: 404, message: 'النموذج المحدد غير متاح لهذا الحساب' };
  if (status === 429 || is('RateLimitError')) return { code: 'rate_limited', status: 429, message: 'تم تجاوز حد الاستخدام المسموح لدى Anthropic مؤقتًا، حاول بعد قليل' };
  if (status === 529) return { code: 'overloaded', status: 529, message: 'خدمة Claude مزدحمة حاليًا، حاول بعد قليل' };
  if (status === 400 || status === 413 || is('BadRequestError')) return { code: 'bad_request', status, message: 'رفضت خدمة Claude الطلب (تحقق من اسم النموذج ورصيد الحساب وحجم المستند)' };
  if (status && status >= 500) return { code: 'server_error', status, message: `خطأ مؤقت في خدمة Claude (${status})` };
  if (status) return { code: 'api_error', status, message: `خطأ من خدمة Claude (${status})` };
  return { code: 'unknown', status: null, message: 'تعذر الاتصال بخدمة Claude' };
}

// ───────────── التعليمات ─────────────
// الجزء الثابت من تعليمات النظام: يُخزَّن مؤقتًا (prompt caching) لأنه لا يتغير بين الطلبات.
// لا تضع فيه أي قيمة متغيرة (وقت، معرفات) حتى لا تبطل الذاكرة المؤقتة. اسم المؤسسة يتغير نادرًا من الإعدادات.
const SYSTEM_BASE = `أنت مساعد قانوني داخلي في برنامج الدعم القانوني لدى «{ORG}»، وهي مؤسسة أهلية مصرية مشهرة بوزارة التضامن الاجتماعي تخدم الأرامل والأيتام وأسرهم. يصل المستفيدون إلى البرنامج عبر واتساب والموقع الإلكتروني بمشكلات قانونية، فتفرزها الإدارة ثم تُسند ما يحتاج إلى رأي قانوني إلى محامين متطوعين أو بأجر تحت إشرافها.

حدود دورك:
- تعمل لصالح الإدارة والمحامين فقط. القرار النهائي دائمًا للإدارة والمحامي؛ أنت تقترح ولا تقرر.
- لا تخاطب المستفيدين مباشرة إلا حين يُطلب منك صراحة صياغة نص موجه إليهم، وتراجعه الإدارة قبل إرساله.

السياق القانوني (القانون المصري):
- أغلب الطلبات في مسائل الأسرة بعد وفاة العائل: المواريث وإعلام الوراثة والوصية الواجبة، والنفقة (نفقة الزوجة والصغار ونفقة الأقارب)، والحضانة والرؤية والولاية التعليمية، والولاية على مال القاصرين وإشراف النيابة الحسبية (نيابة شؤون الأسرة للولاية على المال)، ومعاشات التأمين الاجتماعي ومعاش الأرملة والأيتام وبرنامج تكافل وكرامة، والسكن والإيجار، والعمل، واستخراج المستندات الرسمية.
- الأطر الحاكمة عادةً: قوانين الأحوال الشخصية وإجراءات التقاضي أمام محكمة الأسرة، وقانون المواريث، وقانون الوصية، وأحكام الولاية على المال، وقانون التأمينات الاجتماعية والمعاشات، وقانون الطفل.
- لا تذكر رقم قانون أو مادة أو مبدأ قضائي إلا إذا كنت متأكدًا منه تمامًا؛ وعند عدم التأكد اكتب: «يحدد المحامي النص القانوني الحاكم».
- لا تخترع وقائع أو تواريخ أو مبالغ غير موجودة في المعطيات، وميّز بين ما ورد في الملف وما هو استنتاج. اذكر المدد والمواعيد الإجرائية بحذر مع التنبيه إلى تحقق المحامي منها.

اللغة والمصطلحات:
- اكتب بالعربية الفصحى الواضحة المستخدمة في الممارسة القانونية والأهلية في مصر. افهم العامية المصرية في رسائل المستفيدين، لكن لا تكتب بها.
- مصطلحات موحدة: «مستفيد/مستفيدة» لصاحب الطلب، و«استشارة» أو «ملف» لما تدرسه المؤسسة، و«قضية» للدعاوى المنظورة أمام المحاكم فقط، و«إسناد» لما تكلّف به الإدارة محاميًا، و«مهمة» لمهام الملفات المستمرة.
- راعِ قواعد العدد والمعدود والتذكير والتأنيث.

مراعاة المستفيدين:
- كثير من المستفيدين أرامل وأمهات أيتام يمرون بظروف صعبة. في أي نص موجه إليهم: لغة رحيمة محترمة غير متعالية، دون لوم أو تهويل، ودون وعود بنتائج أو مواعيد لم تحددها الإدارة.

الخصوصية:
- النصوص الموجهة للمحامين لا تتضمن أرقام هواتف المستفيدين ولا أرقامهم القومية ولا عناوينهم التفصيلية ولا محادثاتهم ولا مصدر وصولهم ولا أي تكلفة؛ اعتمد فقط على ما أتاحته الإدارة.
- النصوص الموجهة للمستفيدين لا تكشف أسماء المحامين ولا الملاحظات الداخلية ولا آراء لم تعتمدها الإدارة.
- الحالات السابقة من المعرفة المؤسسية مجهّلة ومعتمدة: استرشد بمنهج الحل فيها دون نقل وقائعها إلى الحالة الحالية، ولا تحاول استنتاج هوية أصحابها.

التزم بمخطط المخرجات المطلوب بدقة.`;

const AREA_GUIDE = `المجالات (legal_area): INH مواريث وتركات وإعلام الوراثة؛ FAM أحوال شخصية وأسرة (نفقة، حضانة، رؤية، طلاق، خلع)؛ GRD الولاية على المال والنيابة الحسبية (أموال القاصرين، تعيين وصي، الإذن بالتصرف، الحجر)؛ PEN معاشات وتأمينات اجتماعية وتكافل وكرامة؛ PRP عقارات وإيجارات وسكن؛ CIV مدني وعقود وتعويضات وديون؛ LAB عمل ومنازعات عمالية؛ CRM جنائي؛ COM تجاري وشركات؛ TAX ضرائب؛ ADM إداري ومنازعات مع جهات حكومية؛ GEN أخرى أو استفسار عام.`;

const PROMPTS = {
  intake_analysis: `مهمتك: فرز طلب وارد من مستفيد (عبر واتساب أو الموقع) قبل أن تقرر الإدارة فتح ملف له.
${AREA_GUIDE}
- title: عنوان محايد قصير (حتى 12 كلمة) يصف المسألة لا الشخص، بلا أسماء أو أرقام.
- summary: ملخص محايد للوقائع كما رواها المستفيد في 2-4 جمل.
- facts: الوقائع الجوهرية كما وردت (تواريخ، أطراف بصفاتهم، أموال، إجراءات تمت).
- missing_info: ما يحتاجه المحامي ولم يرد في الرسائل (kind=document للمستندات). استرشد بقوائم المجال: في GRD قرار الوصاية أو الولاية وكشف حساب أموال القاصرين وشهادات ميلاد الأبناء؛ في PEN رقم المعاش وشهادة الوفاة وإعلام الوراثة والبحث الاجتماعي؛ في INH إعلام الوراثة وبيان الورثة وعناصر التركة. لا تطلب ما ذكره المستفيد.
- information_sufficient = true فقط إذا كانت الوقائع كافية لإبداء رأي مبدئي.
- secondary_areas: مجالات أخرى قد تستدعي رأي متخصص (مثل الولاية على المال في تركة فيها قاصرون، أو المعاش بعد وفاة الزوج، أو الأثر الضريبي).
- urgency: urgent عند حبس أو تنفيذ وشيك؛ high عند جلسة أو مهلة قريبة أو طرد من السكن أو انقطاع مورد رزق الأسرة.
- confidence بين 0 و 1.
- one_line: سطر واحد للإدارة (حتى 140 حرفًا) يحكي القصة بلغة بسيطة بلا أسماء ولا أرقام، مثل: «أرملة يرفض أهل زوجها إعطاء أولادها نصيبهم في الشقة».
- recommended_track: ماذا يصير هذا الطلب؟
  consultation: مسألة قانونية تحتاج رأيًا مكتوبًا من محامٍ (الاختيار المعتاد).
  matter: دعوى قائمة أو جلسة محددة أو حكم يحتاج تنفيذًا أو طعنًا، أو تمثيل مستمر أمام محكمة أو جهة.
  internal: سؤال إجرائي بسيط تجيب عنه الإدارة بمعلومة عامة أو توجيه (أين تذهب وما الأوراق المطلوبة) دون رأي في حقها.
  refer: طلب خارج الدعم القانوني (مساعدة مالية أو علاج أو عمل…) أو جهة أخرى أنسب.
  need_info: لا يمكن فهم المشكلة أو اختيار مسار من الرسائل. لا تخترها لمجرد نقص مستندات أو تفاصيل؛ مكانها missing_info.
  عند الشك بين consultation وinternal اختر consultation.
- track_reason: جملة واحدة للإدارة (حتى 25 كلمة) تشرح سبب الاختيار. track_confidence بين 0 و 1.
- request_draft: مسودة تراجعها الإدارة قبل أي إرسال أو إتاحة:
  title: عنوان الملف المقترح.
  facts_for_lawyer: الوقائع بصياغة محايدة مرتبة زمنيًا لمحامٍ، بلا اسم المستفيدة أو أسماء أطفالها أو أرقام هواتف أو رقم قومي أو عنوان تفصيلي أو مصدر وصولها.
  internal_note: ظروف اجتماعية أو حساسة تفيد الإدارة فقط، أو null.
  brief_for_lawyer: لـ consultation وmatter: السؤال المحدد المطلوب من المحامي في سطرين؛ وإلا null.
  matter: لـ matter فقط: kind (litigation للتمثيل أمام القضاء، ongoing لعمل قانوني مستمر) والمحكمة والخصم (بصفته أو اسمه كما ورد) وموعد الجلسة كما ورد نصًا؛ وإلا null.
  questions_for_her: لـ need_info فقط: من سؤال إلى ثلاثة أسئلة قصيرة (حتى 100 حرف) بالعامية المصرية البسيطة بصيغة المخاطبة المحددة، سؤال واحد في كل عنصر؛ وإلا [].
  reply_to_her: لـ internal وrefer فقط: رسالة واتساب حتى 600 حرف بالعامية المصرية البسيطة بصيغة المخاطبة المحددة، تبدأ حرفيًا بـ «{hello}،» وتنتهي بـ «— {org_name}». في internal: معلومة إجرائية عامة فقط (فين تروح، إيه الورق، الخطوة الجاية) بلا مدد قانونية ولا أرقام مواد ولا وعد بنتيجة؛ وإن لم تكن متأكدًا من المعلومة فاختر consultation. في refer: الجهة المناسبة بوصفها العام، واكتب {org_phone} إن احتاجت أن تكلم المؤسسة، ولا تكتب رقم هاتف لأي جهة أخرى ولا أي رابط. وإلا null.
  referral_target: لـ refer فقط: اسم الجهة أو البرنامج بوصف عام؛ وإلا null.
  resolution_note: لـ internal وrefer فقط: سطر داخلي يلخص ما سيتم؛ وإلا null.
- استثناء من قاعدة اللغة: questions_for_her وreply_to_her فقط بالعامية المصرية لأنها موجهة للمستفيدة مباشرة، بلا أكواد داخلية ولا أسماء محامين. {hello} و{org_name} و{org_phone} و{ref_no} متغيرات يملؤها النظام فاكتبها كما هي.
- الرسائل الصوتية: «(رسالة صوتية — نص كتبته الإدارة)» كلام المستفيدة كما سمعته الإدارة؛ «[رسالة صوتية غير مفهومة]» سمعتها الإدارة ولم تفهم منها كلامًا؛ «[رسالة صوتية لم تُكتب بعد]» تعني أن جزءًا من القصة غير معروف: أضف إلى missing_info بند «محتوى الرسالة الصوتية التي لم تُسمع بعد» ولا تخمّن محتواها.
- «(مكالمة — كتبتها الإدارة)» ما قالته المستفيدة في مكالمة هاتفية كما كتبته الإدارة.
- «— رسالة من المؤسسة:» أسئلة أرسلتها الإدارة؛ الوقائع تؤخذ من كلام المستفيدة فقط.
- اختيارات النموذج ضغطات على صور وقد تكون خاطئة؛ كلامها هو المعتمد، ولا تُنقل للمحامي كوقائع.`,

  issues: `مهمتك: اقتراح المسائل القانونية التي يجب على المحامي بحثها في هذا الملف، مرتبة حسب الأهمية، بحد أقصى 7 مسائل.
صغ كل مسألة سؤالًا قانونيًا قابلًا للبحث لا إجابة. ${AREA_GUIDE}`,

  draft: `مهمتك: كتابة مسودة أولية منظمة لرأي قانوني يستكمله المحامي. ابدأ بسطر يوضح أنها مسودة آلية تحتاج مراجعة.
الأقسام: أولًا الوقائع، ثانيًا المسائل، ثالثًا التحليل، رابعًا الرأي والتوصيات العملية، خامسًا المستندات المطلوب استيفاؤها.
- اعتمد فقط على المعطيات المرفقة؛ فهي كل ما أتاحته الإدارة لهذا المحامي.
- document_analyses تحليلات آلية أولية للمستندات المتاحة له: استخدمها للإشارة إلى ما يثبته كل مستند وما ينقصه، مع التنبيه إلى التحقق من الأصل.
- approved_precedents حالات سابقة معتمدة ومجهّلة من المعرفة المؤسسية، لكل منها رمز مثل KR-00012: استرشد بمنهج الحل فيها ولا تنقل وقائعها، ولا تذكر رموزها داخل النص.
- used_sources: رموز الحالات السابقة التي استرشدت بها فعلًا فقط (قائمة فارغة إن لم تستخدم أيًا منها).
- اترك بين قوسين معقوفين [يُستكمل: …] ما يحتاج إلى بحث أو تحقق من المحامي.`,

  client_version: `مهمتك: إعادة صياغة الرأي القانوني المعتمد في رسالة موجهة للمستفيد باسم «{ORG}».
- لغة بسيطة مهذبة رحيمة، وخطوات عملية مرقمة واضحة، وما يلزم إحضاره من مستندات.
- لا تضف أي رأي أو استنتاج قانوني غير موجود في الرأي المعتمد. استرشد بالحالات السابقة المعتمدة وتحليلات المستندات لصياغة الخطوات العملية فقط.
- بلا مصطلحات معقدة، وبلا ملاحظات داخلية أو أسماء محامين أو رموز حالات سابقة.
- اختم بأن الإفادة مبنية على المعلومات والمستندات المقدمة، وبدعوة للتواصل بالرد على الرسالة.
- ابدأ text بـ «أهلًا يا {الاسم}،» باسم المستفيد الأول أو كنيته («أم محمد»)، لا «الأستاذ/ة» ولا «تحية طيبة وبعد»، ولا تذكر رقم الملف أو أي كود.
- summary: الخلاصة بالعامية المصرية البسيطة في ثلاث جمل على الأكثر (≤ 400 حرف)، بلا مصطلح قانوني إلا مع شرحه بين قوسين، مثل «نفقة (مصاريف العيال الشهرية)».
- steps: من خطوة إلى ثماني خطوات عملية مطلوبة من المستفيد، كل خطوة جملة قصيرة بالعامية (≤ 160 حرفًا)، بلا أسماء محامين ولا ملاحظات داخلية.`,

  reply: `مهمتك: اقتراح ردود قصيرة جاهزة للإرسال عبر واتساب من فريق «{ORG}» إلى المستفيد، يراجعها الموظف قبل الإرسال.
- اقترح ردين أو ثلاثة بنبرات مختلفة (formal رسمي، warm ودود، brief مختصر)، كل رد في حدود 500 حرف ويُختم بـ «— {ORG}».
- الغرض (intent): answer إجابة أو إفادة بالمستجدات؛ ask_documents طلب المستندات والمعلومات الناقصة؛ reassure طمأنة ومتابعة؛ schedule تحديد موعد أو التذكير بموعد معتمد.
- ابنِ الرد فقط على المعطيات: المحادثة، وتحليل الفرز، والطلبات المرسلة للمستفيد، والرد المعتمد إن وُجد، والموعد المعتمد إن وُجد. لا تكرر طلب معلومة ذكرها المستفيد.
- لا تقدم أي رأي أو استنتاج قانوني إلا إذا ورد في approved_answer؛ وإن لم يوجد رد معتمد فاكتفِ بالإفادة بالحالة وطلب الناقص.
- لا تذكر أسماء المحامين ولا الملاحظات الداخلية ولا التكاليف، ولا تعد بنتيجة أو بموعد لم يرد في المعطيات.
- خاطب المستفيد بـ «حضرتك/حضرتكم» دون افتراض جنسه، وبلغة رحيمة تراعي ظروف الأرامل والأيتام. لا رموز تعبيرية.`,

  document_analysis: `مهمتك: تحليل مستند مرفق في ملف لدى برنامج الدعم القانوني لمساعدة الإدارة والمحامي.
- doc_type: نوع المستند من القائمة المتاحة؛ وإن لم يطابق أيًا منها فاختر other.
- summary: وصف موجز للمستند في جملتين.
- key_facts: البيانات الجوهرية كما تظهر في المستند (أسماء الأطراف وصفاتهم، التواريخ، الأرقام المرجعية كرقم الدعوى أو القيد، المحكمة أو الجهة المصدرة، المبالغ). انقل القيم كما هي دون تخمين، ولا تنقل أرقام الهواتف.
- proves: ما يثبته المستند بالنسبة لموضوع الملف ومجاله.
- red_flags: انتهاء صلاحية، عدم وضوح، صفحات ناقصة، بيانات متعارضة، أو ما يحتاج إلى تحقق من الأصل.
- missing_related: المستندات المرتبطة التي يُستحسن طلبها لاستكمال الإثبات.
- legible=false إذا تعذرت قراءة معظم المستند.`,
};

// ───────────── مخططات المخرجات (Structured Outputs) ─────────────
const ISSUE_ITEM = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    details: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    legal_area: { type: 'string', enum: AREA_CODES },
  },
  required: ['title', 'details', 'legal_area'],
  additionalProperties: false,
};

// v9.2 (A92-11): ماذا يصير الطلب ومسوداته (تراجعها الإدارة قبل أي إرسال أو إتاحة)
const NULL_STR = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const MATTER_DRAFT = {
  type: 'object',
  properties: { kind: { type: 'string', enum: ['litigation', 'ongoing'] }, court: NULL_STR, opponent: NULL_STR, next_hearing_text: NULL_STR },
  required: ['kind', 'court', 'opponent', 'next_hearing_text'],
  additionalProperties: false,
};
const REQUEST_DRAFT = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    facts_for_lawyer: { type: 'string' },
    internal_note: NULL_STR,
    brief_for_lawyer: NULL_STR,
    matter: { anyOf: [MATTER_DRAFT, { type: 'null' }] },
    questions_for_her: { type: 'array', items: { type: 'string' } },
    reply_to_her: NULL_STR,
    referral_target: NULL_STR,
    resolution_note: NULL_STR,
  },
  required: ['title', 'facts_for_lawyer', 'internal_note', 'brief_for_lawyer', 'matter', 'questions_for_her', 'reply_to_her', 'referral_target', 'resolution_note'],
  additionalProperties: false,
};

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'عنوان قصير ومحدد للحالة (حتى 12 كلمة)' },
    summary: { type: 'string', description: 'ملخص محايد للوقائع في 2-4 جمل' },
    legal_area: { type: 'string', enum: AREA_CODES },
    confidence: { type: 'number' },
    secondary_areas: { type: 'array', items: { type: 'string', enum: AREA_CODES } },
    facts: { type: 'array', items: { type: 'string' } },
    missing_info: {
      type: 'array',
      items: {
        type: 'object',
        properties: { item: { type: 'string' }, kind: { type: 'string', enum: ['information', 'document'] } },
        required: ['item', 'kind'],
        additionalProperties: false,
      },
    },
    information_sufficient: { type: 'boolean' },
    suggested_issues: { type: 'array', items: ISSUE_ITEM },
    urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    specialist_hint: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    one_line: { type: 'string', description: 'سطر واحد للإدارة يحكي القصة (حتى 140 حرفًا)' },
    recommended_track: { type: 'string', enum: STORY_TRACKS },
    track_reason: { type: 'string' },
    track_confidence: { type: 'number' },
    request_draft: REQUEST_DRAFT,
  },
  required: [
    'title', 'summary', 'legal_area', 'confidence', 'secondary_areas', 'facts', 'missing_info',
    'information_sufficient', 'suggested_issues', 'urgency', 'specialist_hint',
    'one_line', 'recommended_track', 'track_reason', 'track_confidence', 'request_draft',
  ],
  additionalProperties: false,
};

const ISSUES_SCHEMA = {
  type: 'object',
  properties: { issues: { type: 'array', items: ISSUE_ITEM } },
  required: ['issues'],
  additionalProperties: false,
};

const TEXT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
};

// v9.1 b-portal (B91-08): النسخة الموجهة للمستفيد/ة + «الخلاصة بكلام بسيط» + «الخطوات المطلوبة منها»
const CLIENT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    summary: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['text', 'summary', 'steps'],
  additionalProperties: false,
};

const DRAFT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' }, used_sources: { type: 'array', items: { type: 'string' } } },
  required: ['text', 'used_sources'],
  additionalProperties: false,
};

export const REPLY_TONES = ['formal', 'warm', 'brief'];
const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tone: { type: 'string', enum: REPLY_TONES }, text: { type: 'string' } },
        required: ['tone', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
};

export const DOC_TYPES = Object.keys(LABELS.ai_doc_type || { other: '' });
export const FACT_KINDS = Object.keys(LABELS.ai_fact_kind || { other: '' });
export const FLAG_KINDS = Object.keys(LABELS.ai_red_flag || { other: '' });
const DOC_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    confidence: { type: 'number' },
    summary: { type: 'string' },
    key_facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: FACT_KINDS }, label: { type: 'string' }, value: { type: 'string' } },
        required: ['kind', 'label', 'value'],
        additionalProperties: false,
      },
    },
    proves: { type: 'array', items: { type: 'string' } },
    red_flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kind: { type: 'string', enum: FLAG_KINDS }, text: { type: 'string' } },
        required: ['kind', 'text'],
        additionalProperties: false,
      },
    },
    missing_related: { type: 'array', items: { type: 'string' } },
    legible: { type: 'boolean' },
  },
  required: ['doc_type', 'confidence', 'summary', 'key_facts', 'proves', 'red_flags', 'missing_related', 'legible'],
  additionalProperties: false,
};

// أنواع الملفات التي تقبلها خدمة Claude كمحتوى (مستند PDF أو نص، أو صورة)
export const AI_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
// الحدود تُطبَّق على الملف قبل ترميز base64 الذي يزيد حجمه بمقدار الثلث:
// الصورة المرمَّزة حدها 5 ميجابايت لدى الخدمة (أي نحو 3.75 ميجابايت للملف الأصلي)،
// والطلب كله حده 32 ميجابايت (فنترك هامشًا للتعليمات ونكتفي بـ 22 ميجابايت لملف PDF).
export const AI_MAX_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);
export const AI_MAX_PDF_BYTES = 22 * 1024 * 1024;
export const AI_MAX_TEXT_CHARS = 200000;

/**
 * كتلة محتوى للمستند حسب نوعه: { block } أو { block:null, reason } بسبب عربي واضح (نوع أو حجم غير مدعوم).
 * لا يُرسل أي ملف يتجاوز حدود الخدمة حتى لا يُرفض الطلب بعد استهلاك الوقت.
 */
export function documentBlockFor({ mime, buffer }) {
  if (!buffer) return { block: null, reason: 'تعذرت قراءة الملف من الخادم' };
  const tooBig = (limit) => ({ block: null, reason: `حجم الملف أكبر من الحد المسموح للتحليل الآلي (${Math.round((limit / (1024 * 1024)) * 10) / 10} ميجابايت)` });
  if (mime === 'application/pdf') {
    if (buffer.length > AI_MAX_PDF_BYTES) return tooBig(AI_MAX_PDF_BYTES);
    return { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } } };
  }
  if (AI_IMAGE_TYPES.includes(mime)) {
    if (buffer.length > AI_MAX_IMAGE_BYTES) return tooBig(AI_MAX_IMAGE_BYTES);
    return { block: { type: 'image', source: { type: 'base64', media_type: mime, data: buffer.toString('base64') } } };
  }
  if (mime === 'text/plain') {
    return { block: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: buffer.toString('utf8').slice(0, AI_MAX_TEXT_CHARS) } } };
  }
  return { block: null, reason: 'نوع الملف غير مدعوم للتحليل الآلي (المدعوم: PDF والصور والنصوص)' };
}

/** كتلة محتوى للمستند حسب نوعه، أو null إذا كان النوع أو الحجم غير مدعوم */
export function documentBlock(file) {
  return documentBlockFor(file).block;
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// إعادة التوجيه التلقائي عند الرفض (fallbacks: 'default') مدعومة على هذه النماذج فقط؛ غيرها يُرسل بدونها
const FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
function routingParams(model) {
  return FALLBACK_MODELS.includes(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}
// مستوى الجهد غير مدعوم على Haiku 4.5
function effortConfig(model, level) {
  return /haiku/.test(String(model)) ? {} : { effort: level };
}

/**
 * @param {{apiKey:string, model:string, effort?:string, log?:Function, orgName?:()=>string,
 *          onUsage?:(rec:object)=>void}} opts
 */
export function createAnthropicProvider({ apiKey, model, effort = 'medium', log, orgName = () => 'بيوت مصر', onUsage = () => {} }) {
  let client = null;
  const org = () => orgName() || 'بيوت مصر';
  const eff = EFFORTS.includes(effort) ? effort : 'medium';

  async function getClient() {
    if (client) return client;
    const Anthropic = await loadSdk();
    if (!Anthropic) throw new AiUnavailable('حزمة @anthropic-ai/sdk غير مثبتة على الخادم (npm install)', 'sdk_missing');
    client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
    return client;
  }

  function report(meta, rec) {
    try {
      onUsage({ ...meta, provider: 'anthropic', ...rec });
    } catch (e) {
      log?.('ai usage record failed', e);
    }
  }

  /** طلب واحد بمخرجات JSON منظمة. meta: { feature, entity_type, entity_id, user_id } */
  async function structured({ meta, feature, content, schema, maxTokens = 16000, effortLevel = eff }) {
    const c = await getClient();
    const Anthropic = await loadSdk();
    const system = [
      // الجزء الثابت أولًا مع نقطة تخزين مؤقت، ثم تعليمات الوظيفة (ثابتة لكل وظيفة) بنقطة ثانية
      { type: 'text', text: SYSTEM_BASE.replaceAll('{ORG}', org()), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: PROMPTS[feature].replaceAll('{ORG}', org()), cache_control: { type: 'ephemeral' } },
    ];
    const started = Date.now();
    let response;
    try {
      response = await c.beta.messages.create({
        model,
        max_tokens: maxTokens,
        // عند رفض الطلب من مصنفات الأمان يُعاد تشغيله تلقائيًا على النموذج البديل الموصى به
        ...routingParams(model),
        system,
        messages: [{ role: 'user', content }],
        output_config: { ...effortConfig(model, effortLevel), format: { type: 'json_schema', schema } },
      });
    } catch (e) {
      const d = describeError(e, Anthropic);
      report(meta, { model, latency_ms: Date.now() - started, ok: false, error: d.message, usage: null });
      throw new AiUnavailable(d.message, d.code);
    }
    const usedModel = response.model || model;
    const fail = (msg, code) => {
      report(meta, { model: usedModel, usage: response.usage, latency_ms: Date.now() - started, ok: false, error: msg });
      return new AiUnavailable(msg, code);
    };
    if (response.stop_reason === 'refusal') throw fail('اعتذر النموذج عن معالجة هذا الطلب', 'refusal');
    if (response.stop_reason === 'max_tokens') throw fail('تجاوز الرد الحد الأقصى للطول', 'max_tokens');
    const text = (response.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      log?.('anthropic: invalid JSON output');
      throw fail('رد غير صالح من النموذج', 'invalid_output');
    }
    report(meta, { model: usedModel, usage: response.usage, latency_ms: Date.now() - started, ok: true, error: null });
    return { data, model: usedModel };
  }

  const json = (obj) => JSON.stringify(obj, null, 2);

  return {
    name: 'anthropic',
    model,
    effort: eff,

    async analyzeIntake({ text, governorate, channel = null, topic = null, form = 'f', voice = null }, meta = {}) {
      // v9.2 (A92-11): القناة والموضوع الذي اختارته وصيغة مخاطبتها وعدد الرسائل الصوتية (لا يُرسل أي صوت أبدًا)
      const v = voice || { total: 0, done: 0, missing: 0 };
      const header = [
        `المحافظة المعروفة: ${governorate || 'غير معروفة'}`,
        `القناة: ${channel || 'غير معروفة'}`,
        `الموضوع الذي اختارته: ${topic || 'لم تختر'}`,
        `صيغة مخاطبتها: ${form === 'm' ? 'مذكر' : 'مؤنث'}`,
        `الرسائل الصوتية: ${v.total} (مكتوبة ${v.done}، لم تُكتب ${v.missing})`,
      ].join('\n');
      const { data, model: m } = await structured({
        meta,
        feature: 'intake_analysis',
        content: `${header}\n\nرسائل المستفيد بترتيب وصولها:\n"""\n${text}\n"""`,
        schema: ANALYSIS_SCHEMA,
      });
      return { ...data, _model: m };
    },

    async suggestIssues({ title, facts, area }, meta = {}) {
      const { data, model: m } = await structured({
        meta,
        feature: 'issues',
        content: `عنوان الملف: ${title}\nالمجال: ${area}\n\nالوقائع:\n"""\n${facts}\n"""`,
        schema: ISSUES_SCHEMA,
      });
      return { issues: data.issues, _model: m };
    },

    async draftOpinion({ title, area, facts, brief, issues, missing, precedents = [], documents = [] }, meta = {}) {
      const { data, model: m } = await structured({
        meta,
        feature: 'draft',
        content: json({ title, legal_area: area, brief, facts, issues, missing, document_analyses: documents, approved_precedents: precedents }),
        schema: DRAFT_SCHEMA,
      });
      return { text: data.text, used_sources: Array.isArray(data.used_sources) ? data.used_sources : [], _model: m };
    },

    async clientVersion({ clientName, caseCode, opinion, precedents = [], documents = [] }, meta = {}) {
      const { data, model: m } = await structured({
        meta,
        feature: 'client_version',
        content: json({ beneficiary_name: clientName || null, case_code: caseCode, approved_opinion: opinion, document_analyses: documents, approved_precedents: precedents }),
        schema: CLIENT_SCHEMA, // v9.1 b-portal: + summary / steps
      });
      const steps = Array.isArray(data.steps) ? data.steps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 160)) : undefined;
      return { text: data.text, summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim().slice(0, 400) : undefined, steps: steps && steps.length ? steps : undefined, _model: m };
    },

    async suggestReplies(context, meta = {}) {
      const { data, model: m } = await structured({
        meta,
        feature: 'reply',
        content: json(context),
        schema: REPLY_SCHEMA,
        maxTokens: 8000,
        // ردود قصيرة يُنتظر ظهورها فورًا: جهد منخفض يكفي ويقلل التكلفة وزمن الانتظار
        effortLevel: 'low',
      });
      return { suggestions: Array.isArray(data.suggestions) ? data.suggestions : [], _model: m };
    },

    async analyzeDocument({ block, filename, title, area, caseTitle }, meta = {}) {
      const { data, model: m } = await structured({
        meta,
        feature: 'document_analysis',
        content: [
          block,
          {
            type: 'text',
            text: `اسم الملف: ${filename}\nعنوان المستند: ${title || '—'}\nمجال الملف: ${area || 'غير محدد'}\nموضوع الملف: ${caseTitle || 'غير محدد'}\n\nحلّل المستند المرفق.`,
          },
        ],
        schema: DOC_SCHEMA,
      });
      return { ...data, _model: m };
    },

    /** طلب صغير حقيقي للتحقق من المفتاح والنموذج والاتصال */
    async ping(meta = {}) {
      const Anthropic = await loadSdk();
      const started = Date.now();
      try {
        const c = await getClient();
        const response = await c.beta.messages.create(
          {
            model,
            max_tokens: 512,
            ...routingParams(model),
            messages: [{ role: 'user', content: 'اختبار اتصال: أجب بكلمة «تم» فقط.' }],
            ...(/haiku/.test(String(model)) ? {} : { output_config: { effort: 'low' } }),
          },
          { maxRetries: 0, timeout: 30_000 },
        );
        const latency = Date.now() - started;
        report(meta, { model: response.model || model, usage: response.usage, latency_ms: latency, ok: true, error: null });
        return { ok: true, model: response.model || model, latency_ms: latency };
      } catch (e) {
        const d = describeError(e, Anthropic);
        if (d.code !== 'sdk_missing') report(meta, { model, usage: null, latency_ms: Date.now() - started, ok: false, error: d.message });
        return { ok: false, error: d.message, code: d.code, status: d.status ?? null, latency_ms: Date.now() - started };
      }
    },
  };
}
