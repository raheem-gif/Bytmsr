// إخفاء البيانات الشخصية قبل إدخال الحالة في قاعدة المعرفة المؤسسية.
// إخفاء آلي «أولي» يُراجَع دائمًا من الإدارة قبل اعتماد الحالة للاستخدام المعرفي أو التدريبي.
import { latinDigits } from '../util.js';

const STOP_NAME_PARTS = new Set(['عبد', 'على', 'علي', 'ابو', 'أبو', 'بن', 'بنت', 'ال', 'الله', 'محمد', 'احمد', 'أحمد']);

const KIN = '(?:اخويا|أخويا|اخوي|أخوي|أخي|اخي|اختي|أختي|ابني|إبني|بنتي|ابويا|أبويا|أبي|ابي|والدي|والدتي|امي|أمي|زوجي|زوجتي|جوزي|مراتي|عمي|عمتي|خالي|خالتي|جدي|جدتي|طليقي|طليقتي|المرحوم|المرحومة|المرحومه|المتوفى|المتوفي|المدعو|المدعوة|السيد|السيدة|الحاج|الحاجة|الأستاذ|الاستاذ|الأستاذة|الاستاذة|المهندس|الدكتور)';
// ألقاب مختصرة: يجب أن تكون كلمة مستقلة تمامًا
const ABBR = '(?:أ\\.|د\\.|م\\.)';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** نمط متسامح مع اختلاف الكتابة الشائع: ة/ه، أ/إ/آ/ا، ى/ي، والمسافة في «عبد ال...» */
function tolerantName(name) {
  return escapeRe(name)
    .replace(/[ةه]/g, '[ةه]')
    .replace(/[اأإآ]/g, '[اأإآ]')
    .replace(/[ىي]/g, '[ىي]')
    .replace(/\s+/g, '\\s*');
}

/**
 * @param {string} text
 * @param {{ names?: string[] }} opts أسماء معروفة (العميل، المحامون) تُخفى أينما وردت
 * @returns {{ text: string, counts: object }}
 */
export function redact(text, { names = [] } = {}) {
  if (!text) return { text: text || '', counts: {} };
  const counts = {};
  const bump = (k, by = 1) => (counts[k] = (counts[k] || 0) + by);
  // نعمل على نسخة بأرقام لاتينية (نفس الطول) حتى تُكتشف الأرقام العربية-الهندية أيضًا
  let s = latinDigits(String(text));

  const rep = (re, label, key) => {
    s = s.replace(re, (...m) => {
      bump(key);
      return typeof label === 'function' ? label(...m) : label;
    });
  };

  rep(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[بريد إلكتروني]', 'emails');
  rep(/https?:\/\/\S+/g, '[رابط]', 'links');
  rep(/\b[23]\d{13}\b/g, '[رقم قومي]', 'national_ids');
  s = s.replace(/(?:\+|00)?\d[\d\s-]{7,16}\d/g, (m) => {
    const t = m.trim();
    const digits = t.replace(/\D/g, '').length;
    // التواريخ (2026-11-15) والأرقام القصيرة ليست هواتف
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(t) || digits < 8 || digits > 15) return m;
    bump('phones');
    return '[رقم هاتف]';
  });
  rep(/\b(?:[A-Z]{2,3})-\d{4}-\d{5}\b|\bCL-\d{5}\b/g, '[رقم ملف]', 'codes');
  rep(/(?:شارع|ش\.)\s+[^\s،.,]+(?:\s+[^\s،.,]+){0,2}/g, '[عنوان]', 'addresses');
  rep(/(?:عمارة|عماره|برج|شقة|شقه)\s+رقم\s*\d+/g, '[عنوان]', 'addresses');

  // الأسماء المعروفة: الاسم الكامل ثم الاسم الثنائي ثم الاسم الأول (إن لم يكن شائعًا جدًا)
  const variants = new Set();
  for (const full of names.filter(Boolean)) {
    const clean = String(full).replace(/^(?:أ\.|د\.|م\.|الأستاذ|الاستاذ|الأستاذة|الاستاذة)\s*/, '').trim();
    if (!clean) continue;
    const parts = clean.split(/\s+/);
    variants.add(clean);
    if (parts.length >= 2) variants.add(parts.slice(0, 2).join(' '));
    if (parts[0].length >= 4 && !STOP_NAME_PARTS.has(parts[0])) variants.add(parts[0]);
  }
  for (const nm of [...variants].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^\\p{L}])${tolerantName(nm)}(?=$|[^\\p{L}])`, 'gu');
    s = s.replace(re, (m, pre) => {
      bump('names');
      return `${pre}[اسم]`;
    });
  }

  // اسم يلي صلة قرابة أو لقبًا: «أخويا محمود» ← «أخويا [اسم]»
  // الصلة أو اللقب يجب أن يكون كلمة مستقلة (وإلا اعتُبرت «الحكم.» لقب «م.»)
  const kinRe = new RegExp(`(^|[^\\p{L}])((?:[وف]?${KIN})|${ABBR})\\s+(?!\\[)([\\p{L}]{3,})(\\s+(?!\\[)[\\p{L}]{3,})?`, 'gu');
  s = s.replace(kinRe, (m, pre, kin, first, second) => {
    // لا نخفي الكلمات العامة التي تلي صلة القرابة
    const common = /^(?:الله|رحمه|رحمها|يرحمه|يرحمها|عنده|عندها|كان|كانت|قال|قالت|اللي|الذي|التي|ده|دي|هو|هي|في|من|على|علي|مات|ماتت|توفي|توفيت|اتوفى|اتوفت|متوفي|متوفى|ساكن|ساكنة|عايش|عايشة|رافض|رافضة|مسافر|مسافرة|و|بقى|بقت)$/;
    if (common.test(first)) return m;
    bump('names');
    const keepSecond = second && common.test(second.trim()) ? second : '';
    return `${pre}${kin} [اسم]${keepSecond}`;
  });

  return { text: s, counts };
}
