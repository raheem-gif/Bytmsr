// كلمات المستفيد/ة (الإصدار 9.1 — مسار b-site): نظام الصياغة والأحجام لصفحات المستفيدين.
// وحدة مستقلة بلا أي import (تُحمّل في الصفحات العامة الخفيفة دون مكتبة المكونات)، ونفس قواعدها في الخادم (src/util.js).
//
// الواجهة الثابتة (لا تُغيَّر أسماؤها؛ تستوردها صفحات الطلب والمتابعة):
//   addressName(name)            ← «أم محمد» / «سامية» / '' (لا «أم» وحدها أبدًا)
//   addressForm(person|name, f?) ← 'f' | 'm'  (address_form من الإدارة أولًا، ثم «أبو …» = مذكر، وإلا مؤنث)
//   say(word, form)              ← الصيغة المؤنثة أو المذكرة من القاموس: say('صوّري', 'm') ← «صوّر»
//   genderize(text, form)        ← رموز {ي} و{ة} في النص: «صوّر{ي}» ← «صوّري» / «صوّر»
//   gloss(term) / glossText(text, seen?) / GLOSSARY ← المصطلح مع شرحه البسيط (أول مرة في الشاشة فقط)
//   spokenTime(iso) ← «10 الصبح»   spokenDate(iso) ← «الجمعة 9 أكتوبر»
//   dayWord(iso, now?) ← «النهارده» / «بكرة» / «بعد يومين» / «بعد 3 أيام» / «يوم الجمعة 9 أكتوبر»
//   when(iso, now?) ← «بكرة الساعة 10 الصبح»
//   countWord(n, [مفرد، مثنى، جمع، تمييز]) ← مطابقة العدد والمعدود
//   publicData() ← بيانات المؤسسة المضمّنة في الصفحة (<script type="application/json" id="bm-public">) دون طلب /api/meta
//   officeHoursLine() ← «بنرد من السبت للخميس…» أو ''
//   SIZES ← أحجام الخط والأزرار (نفس متغيرات CSS تحت body.pub.v91)

export const TZ = 'Africa/Cairo';

/** أحجام نظام المستفيد/ة بالبكسل (مرآة لمتغيرات public-site.css: --text, --tap-primary …) */
export const SIZES = Object.freeze({ text: 18, small: 16, meta: 15, tapPrimary: 56, tap: 48, input: 52, row: 56, bar: 64 });

// ───────────── المخاطبة ─────────────

const KUNYA_RE = /^(أم|ام|إم|أبو|ابو|أبو)$/;
const MALE_KUNYA_RE = /^(أبو|ابو|أبو)$/;

/** الاسم الذي نخاطب به: الكنية كاملة («أم محمد عبد الله» ← «أم محمد») أو الاسم الأول («سامية محمود» ← «سامية»). */
export function addressName(name) {
  const w = String(name ?? '')
    .replace(/[‎‏؜]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!w.length) return '';
  if (KUNYA_RE.test(w[0])) return w[1] ? `${w[0]} ${w[1]}${w[1] === 'عبد' && w[2] ? ` ${w[2]}` : ''}` : '';
  if (w[0] === 'عبد' && w[1]) return `${w[0]} ${w[1]}`;
  return w[0];
}

/**
 * صيغة المخاطبة 'f' | 'm'. addressForm({ name, address_form }) أو addressForm('أبو أحمد') أو addressForm(name, 'm').
 * الافتراضي مؤنث (أغلب المستفيدين أرامل وأمهات).
 */
export function addressForm(person, explicit) {
  const set = explicit ?? (person && typeof person === 'object' ? person.address_form ?? person.address : null);
  if (set === 'm' || set === 'f') return set;
  const name = person && typeof person === 'object' ? person.name : person;
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  return MALE_KUNYA_RE.test(first) ? 'm' : 'f';
}

// مؤنث ← مذكر. المفتاح الصيغة المؤنثة (الافتراضية)، ويُقبل البحث بالمذكر أيضًا.
const DICT = {
  'صوّري': 'صوّر',
  'ابعتي': 'ابعت',
  'ابعتيلنا': 'ابعتلنا',
  'اختاري': 'اختار',
  'اكتبي': 'اكتب',
  'سجّلي': 'سجّل',
  'اتصلي': 'اتصل',
  'كلمينا': 'كلمنا',
  'اقري': 'اقرا',
  'ردّي': 'ردّ',
  'قولي': 'قول',
  'افتحي': 'افتح',
  'احفظي': 'احفظ',
  'امسحي': 'امسح',
  'جرّبي': 'جرّب',
  'اطلبي': 'اطلب',
  'تابعي': 'تابع',
  'غيّري': 'غيّر',
  'هاتي': 'هات',
  'تحضري': 'تحضر',
  'تدفعي': 'تدفع',
  'تبعتي': 'تبعت',
  'تختاري': 'تختار',
  'تقدري': 'تقدر',
  'هتقدري': 'هتقدر',
  'تعرفي': 'تعرف',
  'هتعرفي': 'هتعرف',
  'قدّمتي': 'قدّمت',
  'بعتيها': 'بعتها',
  'ضيّعتي': 'ضيّعت',
  'عايزة': 'عايز',
  'لاقية': 'لاقي',
  'قادرة': 'قادر',
  'فاهمة': 'فاهم',
  'متأكدة': 'متأكد',
  'راضية': 'راضي',
  'صاحبة': 'صاحب',
  'بيكي': 'بيك',
  'معاكي': 'معاك',
  'ليكي': 'ليك',
  'عليكي': 'عليك',
  'إنتي': 'إنت',
  'خلّصتها': 'خلّصتها',
};
const DICT_M = Object.fromEntries(Object.entries(DICT).map(([f, m]) => [m, f]));

/** الكلمة بصيغة المخاطبة: say('صوّري', 'm') ← «صوّر»، say('صوّر') ← «صوّري». كلمة غير معروفة تُعاد كما هي. */
export function say(word, form = 'f') {
  const w = String(word ?? '');
  const fem = DICT[w] !== undefined ? w : DICT_M[w];
  if (fem === undefined) return w;
  return form === 'm' ? DICT[fem] : fem;
}

/** رموز النوع: {ي} و{ة} ← «ي»/«ة» للمؤنث وتُحذف للمذكر (نفس genderize في الخادم). */
export function genderize(text, form = 'f') {
  const f = form !== 'm';
  return String(text ?? '')
    .replace(/\{ي\}/g, f ? 'ي' : '')
    .replace(/\{ة\}/g, f ? 'ة' : '');
}

// ───────────── المصطلحات القانونية بشرح بسيط ─────────────

export const GLOSSARY = Object.freeze({
  'إعلام الوراثة': 'ورقة من المحكمة بتقول مين الورثة',
  'النيابة الحسبية': 'الجهة اللي بتحمي فلوس الأيتام',
  'نفقة': 'مصاريف العيال الشهرية',
  'جلسة': 'ميعاد في المحكمة',
  'القيد العائلي': 'ورقة فيها أفراد الأسرة',
  'حكم': 'قرار المحكمة',
});

const stripAl = (s) => String(s).replace(/^ال(?=\S{3,})/, '');
const findTerm = (term) => {
  const t = String(term ?? '').trim();
  if (GLOSSARY[t]) return t;
  const bare = stripAl(t);
  return Object.keys(GLOSSARY).find((k) => stripAl(k) === bare) || null;
};

/** المصطلح مع شرحه: gloss('جلسة') ← «جلسة (ميعاد في المحكمة)». غير المعروف يُعاد كما هو. */
export function gloss(term) {
  const k = findTerm(term);
  return k ? `${String(term).trim()} (${GLOSSARY[k]})` : String(term ?? '');
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * يضيف الشرح بعد أول ظهور لكل مصطلح في النص (مرة واحدة في الشاشة: مرّر نفس seen لكل نصوص الشاشة).
 * لا يكرر الشرح إن كان النص يحتوي عليه بالفعل.
 */
export function glossText(text, seen = new Set()) {
  let out = String(text ?? '');
  for (const [term, plain] of Object.entries(GLOSSARY)) {
    const key = stripAl(term);
    if (seen.has(key)) continue;
    // يقبل حروف العطف والجر الملتصقة («والقيد العائلي»، «بالجلسة»)
    const re = new RegExp(`(^|[\\s«(،.])((?:[وفبل]|وب|ول)?(?:ال)?${escRe(key)})(?=$|[\\s»)،.:؟!])(?!\\s*\\()`, 'u');
    const m = re.exec(out);
    if (!m) continue;
    seen.add(key);
    if (out.includes(plain)) continue;
    const at = m.index + m[1].length + m[2].length;
    out = `${out.slice(0, at)} (${plain})${out.slice(at)}`;
  }
  return out;
}

// ───────────── التاريخ والوقت كما يُقالان ─────────────

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
let DTF = null;

function parts(iso) {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  DTF = DTF || new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {};
  for (const p of DTF.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { year: o.year, month: o.month, day: o.day, hour: o.hour % 24, minute: o.minute };
}

/** «10 الصبح»، «1 الضهر»، «4 العصر»، «8 بالليل»، «10 ونص الصبح» (توقيت القاهرة) */
export function spokenTime(iso) {
  const p = parts(iso);
  if (!p) return '';
  const period = p.hour < 4 ? 'بالليل' : p.hour < 6 ? 'الفجر' : p.hour < 12 ? 'الصبح' : p.hour < 15 ? 'الضهر' : p.hour < 18 ? 'العصر' : 'بالليل';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const mins = p.minute === 0 ? '' : p.minute === 30 ? ' ونص' : p.minute === 15 ? ' وربع' : `:${String(p.minute).padStart(2, '0')}`;
  return `${h12}${mins} ${period}`;
}

/** «الجمعة 9 أكتوبر» (بلا سنة) */
export function spokenDate(iso) {
  const p = parts(iso);
  if (!p) return '';
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${AR_DAYS[dow]} ${p.day} ${AR_MONTHS[p.month - 1]}`;
}

/** «النهارده»، «بكرة»، «بعد يومين»، «بعد 3 أيام»، «إمبارح»، وإلا «يوم الجمعة 9 أكتوبر» */
export function dayWord(iso, now = Date.now()) {
  const a = parts(iso);
  const b = parts(now instanceof Date || typeof now === 'string' ? now : new Date(now));
  if (!a || !b) return '';
  const diff = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
  if (diff === 0) return 'النهارده';
  if (diff === 1) return 'بكرة';
  if (diff === 2) return 'بعد يومين';
  if (diff >= 3 && diff <= 6) return `بعد ${diff} أيام`;
  if (diff === -1) return 'إمبارح';
  return `يوم ${spokenDate(iso)}`;
}

/** «بكرة الساعة 10 الصبح» / «يوم الجمعة 9 أكتوبر الساعة 4 العصر» */
export function when(iso, now = Date.now()) {
  const d = dayWord(iso, now);
  return d ? `${d} الساعة ${spokenTime(iso)}` : '';
}

/** العدد مع معدوده: countWord(3, ['حاجة', 'حاجتين', 'حاجات', 'حاجة']) ← «3 حاجات» */
export function countWord(n, [one, two, few, many]) {
  const k = Math.abs(Math.round(Number(n) || 0));
  if (k === 1) return one;
  if (k === 2) return two;
  const r = k % 100;
  if (r >= 3 && r <= 10) return `${k} ${few}`;
  if (r >= 11 && r <= 99) return `${k} ${many}`;
  return `${k} ${String(one).replace(/\s+واحد[ةه]?(?=\s|$)/, '')}`;
}

// ───────────── بيانات المؤسسة المضمّنة في الصفحة (B91-11) ─────────────

let PUBLIC = null;

/**
 * بيانات الصفحة العامة دون طلب شبكة: { org_name, site_name, phone, phone_e164, whatsapp_digits, office_hours,
 * portal_otp_enabled, governorates, areas: [{code, label}], setup_required, demo }. كائن فارغ إن لم توجد.
 */
export function publicData() {
  if (PUBLIC) return PUBLIC;
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('bm-public') : null;
    PUBLIC = el ? JSON.parse(el.textContent || '{}') || {} : {};
  } catch {
    PUBLIC = {};
  }
  return PUBLIC;
}

/** «بنرد من السبت إلى الخميس…» أو '' إن لم تُضبط مواعيد العمل */
export function officeHoursLine(data = publicData()) {
  return data && data.office_hours ? `بنرد ${data.office_hours}` : '';
}
