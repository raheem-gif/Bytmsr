// معالجة النص العربي: التقطيع، إزالة الكلمات الشائعة، تجذيع خفيف، و TF-IDF للبحث عن الحالات المشابهة.
import { normalizeArabic } from '../util.js';

const STOP = new Set(
  `في من على علي الي الى عن ان انا انت هو هي هم احنا نحن ده دي دا كان كانت يكون تكون مع او و ثم لا لم لن ما ماذا ليه لماذا ازاي كيف
   هل قد كل بعد قبل عند عندي عندنا عنده عندها بين حتى لكن بس يعني اللي الذي التي الذين هذا هذه ذلك تلك هناك هنا فيه فيها منه منها
   له لها لهم بها به عليه عليها اني انه انها ايه مش مفيش كده برضه برضو كمان جدا اوي خلاص طيب لو اذا يا ياريت ممكن عايز عاوز عايزه
   عاوزه محتاج اريد نريد السلام عليكم ورحمه الله وبركاته شكرا مساء صباح الخير حضرتك حضرتكم استاذ استاذه سؤال سوال استفسار مشكله
   the a an of to and is in`.split(/\s+/).filter(Boolean),
);

const PREFIXES = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل'];
const SUFFIXES = ['هما', 'كما', 'هم', 'هن', 'كم', 'نا', 'ها', 'ات', 'ين', 'ون', 'ان', 'يه', 'ه', 'ي', 'ك'];

/** تجذيع خفيف (إزالة السوابق واللواحق الشائعة) مع الحفاظ على جذر لا يقل عن 3 أحرف */
export function lightStem(word) {
  let w = word;
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) {
      w = w.slice(p.length);
      break;
    }
  }
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 3) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  return w;
}

export function words(text) {
  return normalizeArabic(text)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function tokens(text) {
  const out = [];
  for (const w of words(text)) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    const s = lightStem(w);
    if (s.length < 2 || STOP.has(s)) continue;
    out.push(s);
  }
  return out;
}

/** مجموعة الأشكال الممكنة لكل كلمة (الأصل + بعد إزالة السابقة/اللاحقة) للمطابقة مع المعجم */
export function wordForms(text) {
  const set = new Set();
  for (const w of words(text)) {
    set.add(w);
    for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) set.add(w.slice(p.length));
    set.add(lightStem(w));
  }
  return set;
}

const ART = ['وبال', 'وال', 'بال', 'فال', 'كال', 'لل', 'ال'];
/**
 * رموز البحث عن التشابه: الجذع الخفيف + مقاطع ثلاثية الحروف من كل كلمة.
 * المقاطع الثلاثية تتحمل اختلاف الصيغ والعامية (اتوفى/توفيت/المتوفي، ساب/سابت) أفضل من التجذيع وحده.
 */
export function simTokens(text) {
  const out = [];
  for (const w of words(text)) {
    if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
    let core = w;
    for (const p of ART) {
      if (core.startsWith(p) && core.length - p.length >= 3) {
        core = core.slice(p.length);
        break;
      }
    }
    const stem = lightStem(w);
    if (stem.length >= 2 && !STOP.has(stem)) out.push(`w:${stem}`);
    if (core.length >= 3) {
      const padded = `#${core}#`;
      for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
    }
  }
  return out;
}

function tf(toks) {
  const m = new Map();
  for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

/**
 * فهرس TF-IDF بسيط في الذاكرة.
 * docs: [{ id, text, ...payload }]
 */
export function buildIndex(docs) {
  const df = new Map();
  const tfs = docs.map((d) => {
    const m = tf(simTokens(d.text));
    for (const k of m.keys()) df.set(k, (df.get(k) || 0) + 1);
    return m;
  });
  const N = docs.length;
  const idf = (k) => Math.log(1 + N / (1 + (df.get(k) || 0)));
  const vecs = tfs.map((m) => {
    const v = new Map();
    let norm = 0;
    for (const [k, c] of m) {
      const w = (1 + Math.log(c)) * idf(k);
      v.set(k, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  });
  return {
    size: N,
    /** أعلى النتائج تشابهًا مع النص */
    query(text, { limit = 10, threshold = 0 } = {}) {
      const m = tf(simTokens(text));
      const q = new Map();
      let qn = 0;
      for (const [k, c] of m) {
        const w = (1 + Math.log(c)) * idf(k);
        q.set(k, w);
        qn += w * w;
      }
      qn = Math.sqrt(qn) || 1;
      const scored = [];
      vecs.forEach((d, i) => {
        let dot = 0;
        for (const [k, w] of q) {
          const dw = d.v.get(k);
          if (dw) dot += w * dw;
        }
        const score = dot / (qn * d.norm);
        if (score > threshold) scored.push({ doc: docs[i], score });
      });
      scored.sort((a, b) => b.score - a.score);
      return { total: scored.length, items: scored.slice(0, limit) };
    },
  };
}

/** تقسيم النص إلى جمل */
export function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!؟?\n])\s+|\n+|،\s*(?=[^،]{40,})/u)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 3);
}

/** نسبة التشابه بين نصين (لقياس حجم تعديل المحامي على مسودة الذكاء الاصطناعي) */
export function similarityRatio(a, b) {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size && !tb.size) return 1;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter || 1);
}
