// v12 gate (V-14): نص Tesseract كما يحتاجه مكتب محاماة — الكلمات من نموذج «ara»، والأرقام (قيد، تاريخ، رقم قومي، رقم قضية)
// من قراءة ثانية بنموذج الخط العربي «Arabic» إن كان مثبتًا: نموذج ara السريع يقرأ الأرقام الهندية حروفًا («٤٥٢٨» ← «(نامع»)،
// ومزج ara+eng كان يحوّلها إلى حروف لاتينية («EOPA»). الصفحة الإنجليزية (ثقة ara منخفضة) تُقرأ بـ eng.
// قياس البوابة على صفحات العقد الممسوحة (spike p01/p05/h05 بعد المسح): الكلمات ara+eng 88.6–90 % ← ara 91.3–93.2 %،
// والأرقام الصحيحة 12–16 % ← 30–36 % بالدمج (الصفحة المثالية 8 ← 32 %). الأرقام تبقى أضعف ما يُقرأ، فتظهر مظللة في لوحة النص للمراجعة.
// دوال خالصة (بلا ملفات ولا عمليات) تختبرها test/v12-gate-media-r2.test.js.

const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/** صف TSV من Tesseract (level 5 = كلمة) → { key, x, y, w, h, conf, text }؛ خرج ليس TSV → null */
export function parseTesseractTsv(out) {
  const lines = String(out || '').split('\n');
  if (!/^level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext/.test(lines[0] || '')) return null;
  const words = [];
  for (const l of lines.slice(1)) {
    const c = l.split('\t');
    if (c[0] !== '5' || c.length < 12) continue;
    const text = c.slice(11).join('\t').replace(BIDI_MARKS, '').trim();
    if (!text) continue;
    words.push({ key: `${c[1]}.${c[2]}.${c[3]}.${c[4]}`, par: `${c[1]}.${c[2]}.${c[3]}`, x: +c[6], y: +c[7], w: +c[8], h: +c[9], conf: Number(c[10]), text });
  }
  return words;
}

/** متوسط ثقة الكلمات (0–100) موزونًا بطولها، أو null */
export function meanConfidence(words) {
  let n = 0;
  let s = 0;
  for (const w of words || []) {
    if (!Number.isFinite(w.conf) || w.conf < 0) continue;
    const k = Math.max(1, [...w.text].length);
    n += k;
    s += w.conf * k;
  }
  return n ? s / n : null;
}

/** نص الصفحة من الكلمات: كلمات السطر بمسافة، سطر لكل سطر، وسطر فارغ بين الفقرات (مثل خرج Tesseract النصي) */
export function textFromWords(words) {
  let out = '';
  let prev = null;
  for (const w of words || []) {
    if (prev) out += prev.key === w.key ? ' ' : prev.par === w.par ? '\n' : '\n\n';
    out += w.text;
    prev = w;
  }
  return out;
}

const DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/gu;
const ARABIC_RUN3 = /[\u0621-\u064A]{3}/u;
const digitShare = (t) => {
  const chars = [...t];
  const d = chars.filter((ch) => /[0-9\u0660-\u0669\u06F0-\u06F9]/u.test(ch)).length;
  return chars.length ? d / chars.length : 0;
};
const area = (a) => Math.max(0, a.w) * Math.max(0, a.h);
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const vOverlap = (a, b) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) / Math.max(1, Math.min(a.h, b.h));
const iou = (a, b) => {
  const i = inter(a, b);
  return i ? i / (area(a) + area(b) - i) : 0;
};

/**
 * دمج الأرقام: كل كلمة من القراءة الثانية (نموذج Arabic) نصفها أرقام على الأقل تحل محل الكلمة التي في مكانها نفسه من
 * القراءة الأولى (أكبر تطابق للمربعين ≥ 0.5؛ القراءتان تقطّعان الصفحة بالطريقة نفسها)، أو — إن قُطّعت مختلفة — الكلمات
 * التي يقع منتصفها داخل مربع الرقم في السطر نفسه. لا تُستبدل كلمة عربية واثقة (ثقة ≥ 90، ثلاثة حروف عربية متتالية، بلا أرقام ولا
 * لاتيني) ولا علامة واثقة («/» بين رقمين). → كلمات جديدة (لا يغيّر المدخل)؛ الأرقام بالصيغة الهندية العربية.
 */
export function mergeDigits(words, digitWords) {
  const out = (words || []).map((w) => ({ ...w }));
  for (const n of digitWords || []) {
    if (!(n.text.match(DIGIT) || []).length || digitShare(n.text) < 0.5) continue;
    const free = out.filter((w) => !w.dead && !w.digits);
    let best = null;
    for (const w of free) if (iou(w, n) >= 0.5 && (!best || iou(w, n) > iou(best, n))) best = w;
    const hits = best ? [best] : free.filter((w) => w.x + w.w / 2 >= n.x && w.x + w.w / 2 <= n.x + n.w && vOverlap(w, n) >= 0.5);
    if (!hits.length) continue;
    const solid = hits.some((w) => w.conf >= 90 && ((ARABIC_RUN3.test(w.text) && !/[0-9A-Za-z٠-٩]/.test(w.text)) || !/[\p{L}\p{N}]/u.test(w.text)));
    if (solid) continue;
    let digits = n.text.replace(/[^0-9\u0660-\u0669\u06F0-\u06F9/.\-:()\u060C,]/gu, '');
    if (!digits) continue;
    // رقم مختلط («٤0۲۸»، «١٩٩7»): الصيغة الهندية العربية للرقم كله. النموذج يكتب «0» لدائرة الخمسة «٥» و«7» للستة «٦»
    // (شكلاهما؛ الصفر الهندي نقطة)، فتُقرأ كذلك داخل رقم هندي: +2 نقطة في الأرقام الصحيحة على صفحات العقد الأربع.
    if (/[\u0660-\u0669\u06F0-\u06F9]/u.test(digits)) digits = digits.replace(/[0-9]/g, (d) => (d === '0' ? '\u0665' : d === '7' ? '\u0666' : String.fromCharCode(0x0660 + Number(d))));
    digits = digits.replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x0660));
    hits[0].text = digits;
    hits[0].conf = Math.min(hits[0].conf, n.conf);
    hits[0].digits = true;
    for (const w of hits.slice(1)) w.dead = true;
  }
  return out.filter((w) => !w.dead);
}

/**
 * تنظيف نص Tesseract قبل الحفظ: علامات الاتجاه (يضعها Tesseract حول كل مقطع لاتيني فتقلب اتجاه السطر في العرض والنسخ)،
 * أشكال الحروف الفارسية والأردية من نموذج Arabic (ی ک ہ ھ ۀ) ← العربية، والأرقام الفارسية ← الهندية العربية.
 */
export function tidyOcrText(text) {
  return String(text || '')
    .replace(/\f/g, '')
    .replace(BIDI_MARKS, '')
    .replace(/[\u06CC\u06D2]/g, 'ي')
    .replace(/\u06A9/g, 'ك')
    .replace(/[\u06C1\u06BE]/g, 'ه')
    .replace(/\u06C0/g, 'ة')
    .replace(/[\u06F0-\u06F9]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x06f0 + 0x0660))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** ثقة ara أقل من هذا (من 100) ← تُجرَّب eng، وتُعتمد إن زادت ثقتها 15 نقطة على الأقل (صفحة إنجليزية) */
export const OCR_LATIN_TRY_BELOW = 55;
export const OCR_LATIN_MARGIN = 15;

