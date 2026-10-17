// v12 tags-core (TG-0، T12-50…T12-55): ماسح المصدر لرموز العناصر — بلا اعتماديات، ثابت (لا يشغّل كود الصفحات).
// يجد التعريفات (data-tag="X-NN" · tag: 'X-NN' · 'data-tag': 'X-NN' · tagged('X-NN' · خرائط *_TAGS) والعناصر النائبة
// (X-00) والاستعمالات غير الحرفية، مع نوع العنصر ونصه العربي وموقعه file:line. يقرؤه src/tags/registry.js وscripts/tags.js
// والاختبارات. يستثني src/tags/ وscripts/ وtest/ (فيها رموز أمثلة ليست تعريفات).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** جذر legal-platform */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// قيمة في موضع رمز: حروف ثم شرطة ثم أرقام. صيغتها الصحيحة يتحقق منها registry.validate (CODE_RE).
const CODE_ANY = '[A-Za-z]{1,6}-\\d{1,5}';
export const PLACEHOLDER_NUM = '00';

// ───────────────────────── قائمة الملفات ─────────────────────────

const toPosix = (p) => p.split(path.sep).join('/');

/** ملفات المصدر الممسوحة (مسارات نسبية بصيغة posix، مرتبة) */
export function listSourceFiles(root = ROOT) {
  const out = [];
  const walk = (relDir, accept) => {
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.') || rel === 'src/tags') continue;
        walk(rel, accept);
      } else if (e.isFile() && accept(rel)) out.push(rel);
    }
  };
  // public/*.html (المستوى الأعلى فقط)
  try {
    for (const e of fs.readdirSync(path.join(root, 'public'), { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.html')) out.push(`public/${e.name}`);
  } catch {
    /* بلا مجلد عام */
  }
  walk('public/assets/js', (rel) => rel.endsWith('.js') || rel.endsWith('.mjs'));
  walk('src', (rel) => rel.endsWith('.js') || rel.endsWith('.mjs'));
  return [...new Set(out)].sort();
}

// ───────────────────────── محلل JS صغير ─────────────────────────

const EXPR_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'export', 'default', 'extends']);
const WS = new Set([' ', '\t', '\n', '\r', '\f', '\v', ' ', '﻿', ' ', ' ']);
const ID_START = /[A-Za-z_$\u0080-￿]/;
const ID_PART = /[\w$\u0080-￿]/;

function regexAllowed(prev) {
  if (!prev) return true;
  if (prev.t === 'num' || prev.t === 'str' || prev.t === 'tpl' || prev.t === 'regex') return false;
  if (prev.t === 'id') return EXPR_KEYWORDS.has(prev.v);
  if (prev.t === 'p') return !(prev.v === ')' || prev.v === ']' || prev.v === '}');
  return true;
}

/**
 * يقطّع مصدر JS إلى رموز: { t: 'id'|'str'|'tpl'|'regex'|'num'|'p', s, e, v?, parent, close? }.
 * القوالب `…${…}…` تُقطَّع أجزاءً، وما بين ${ } يُقطَّع كأي كود (فيُرى h() و tag: داخلها). يعيد أيضًا مواضع التعليقات.
 */
export function tokenize(src) {
  const toks = [];
  const comments = [];
  const stack = []; // فهارس الأقواس المفتوحة
  const n = src.length;
  let i = 0;
  let prev = null;
  const push = (tok) => {
    tok.parent = stack.length ? stack[stack.length - 1] : -1;
    toks.push(tok);
    if (tok.t !== 'tpl' || tok.end) prev = tok;
    return toks.length - 1;
  };
  // يمسح جزء قالب يبدأ عند from (بعد ` أو بعد } المغلقة لتعبير) حتى ` أو ${
  const scanTemplate = (from, chunkStart) => {
    let j = from;
    while (j < n) {
      const c = src[j];
      if (c === '\\') {
        j += 2;
        continue;
      }
      if (c === '`') {
        push({ t: 'tpl', s: chunkStart, e: j + 1, end: true });
        return j + 1;
      }
      if (c === '$' && src[j + 1] === '{') {
        push({ t: 'tpl', s: chunkStart, e: j });
        const k = push({ t: 'p', v: '{', s: j, e: j + 2, tpl: true });
        stack.push(k);
        prev = toks[k];
        return j + 2;
      }
      j++;
    }
    push({ t: 'tpl', s: chunkStart, e: n, end: true });
    return n;
  };
  while (i < n) {
    const c = src[i];
    if (WS.has(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const e = src.indexOf('\n', i);
      const end = e === -1 ? n : e;
      comments.push([i, end]);
      i = end;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      const end = e === -1 ? n : e + 2;
      comments.push([i, end]);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      push({ t: 'str', s: i, e: Math.min(n, j + 1), q: c });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      i = scanTemplate(i + 1, i);
      continue;
    }
    if (c === '/' && regexAllowed(prev)) {
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (inClass) {
          if (d === ']') inClass = false;
        } else if (d === '[') inClass = true;
        else if (d === '/') break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      push({ t: 'regex', s: i, e: j });
      i = j;
      continue;
    }
    if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j++;
      push({ t: 'num', s: i, e: j });
      i = j;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      push({ t: 'id', s: i, e: j, v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') {
      const k = push({ t: 'p', v: c, s: i, e: i + 1 });
      stack.push(k);
      i++;
      continue;
    }
    if (c === '}' || c === ')' || c === ']') {
      const open = stack.length ? stack.pop() : -1;
      const k = push({ t: 'p', v: c, s: i, e: i + 1, open });
      toks[k].parent = open >= 0 ? toks[open].parent : -1;
      if (open >= 0) toks[open].close = k;
      i++;
      if (open >= 0 && toks[open].tpl && c === '}') i = scanTemplate(i, i);
      continue;
    }
    push({ t: 'p', v: c, s: i, e: i + 1 });
    i++;
  }
  return { toks, comments };
}

/** نسخة من المصدر بلا تعليقات (تُستبدل بمسافات، وتبقى الأسطر في مكانها) */
export function blankRanges(src, ranges) {
  if (!ranges.length) return src;
  const out = [];
  let at = 0;
  for (const [s, e] of ranges) {
    out.push(src.slice(at, s), src.slice(s, e).replace(/[^\n]/g, ' '));
    at = e;
  }
  out.push(src.slice(at));
  return out.join('');
}

export function htmlCommentRanges(src) {
  const out = [];
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src))) out.push([m.index, m.index + m[0].length]);
  return out;
}

function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** فهرس الرمز الذي يحوي الموضع (بحث ثنائي على البدايات) */
function tokenAt(toks, offset) {
  let lo = 0;
  let hi = toks.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (toks[mid].s <= offset) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best >= 0 && offset < toks[best].e ? best : -1;
}

// ───────────────────────── النصوص ─────────────────────────

const ARABIC = /[؀-ۿ]/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", laquo: '«', raquo: '»', rlm: '', lrm: '' };

/** يحذف تعابير ${…} المتوازنة ويضع مكانها «…» */
function dropExpressions(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      while (j < s.length && depth) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      out += '…';
      i = j;
    } else out += s[i++];
  }
  return out.replace(/\{\{[^}]*\}\}/g, '…');
}

/** نص قصير للسجل: بلا وسوم، كيانات مفكوكة، مسافات مضغوطة، 70 حرفًا على الأكثر (T12-54) */
export function cleanText(s, max = 70) {
  let t = dropExpressions(String(s ?? ''))
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#?\w+);/g, (m, k) => (k in ENTITIES ? ENTITIES[k] : k.startsWith('#') ? String.fromCodePoint(Number(k.slice(1)) || 32) : m))
    .replace(/\\n/g, ' ')
    .replace(/\\(["'`\\])/g, '$1')
    .replace(/[‎‏⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(?:…\s*)+/g, '… ')
    .trim();
  if (t.length > max) t = `${t.slice(0, max - 1).trim()}…`;
  return t;
}

const strValue = (src, tok) => (tok.t === 'tpl' ? src.slice(tok.s, tok.e).replace(/^`|`$/g, '') : src.slice(tok.s + 1, tok.e - 1));

// ───────────────────────── الأنواع (T12-53) ─────────────────────────

export const ELEMENT_KIND = {
  a: 'رابط', button: 'زر', h1: 'عنوان', h2: 'عنوان', h3: 'عنوان', h4: 'عنوان', h5: 'عنوان', h6: 'عنوان', summary: 'عنوان', legend: 'عنوان',
  section: 'قسم/بطاقة', article: 'قسم/بطاقة', aside: 'قسم/بطاقة', div: 'قسم/بطاقة', header: 'قسم/بطاقة', footer: 'قسم/بطاقة', main: 'قسم/بطاقة', dl: 'قسم/بطاقة',
  nav: 'قائمة روابط', ul: 'قائمة', ol: 'قائمة', li: 'عنصر قائمة', details: 'سؤال قابل للفتح', form: 'نموذج',
  input: 'حقل', select: 'حقل', textarea: 'حقل', label: 'حقل', fieldset: 'حقل',
  p: 'نص', span: 'نص', small: 'نص', strong: 'نص', b: 'نص', em: 'نص', i: 'نص', bdi: 'نص', time: 'نص',
  img: 'صورة', svg: 'صورة', figure: 'صورة', picture: 'صورة', dialog: 'نافذة', table: 'جدول', tr: 'صف', th: 'عمود', td: 'خانة',
};

/** مكوّنات ui.js وأطقم البوابة وصفحة المتابعة: النوع وموضع وسيط الخيارات (null = بلا خيارات، يُلفّ بـ tagged) */
export const BUILDERS = {
  button: { kind: 'زر', opts: 1 },
  asyncButton: { kind: 'زر', opts: 2 },
  copyButton: { kind: 'زر', opts: 2 },
  btn: { kind: 'زر', opts: 1 },
  menuButton: { kind: 'زر', opts: null },
  card: { kind: 'قسم/بطاقة', opts: 0 },
  section: { kind: 'قسم/بطاقة', opts: null },
  statCard: { kind: 'بطاقة رقم', opts: 0 },
  kRow: { kind: 'صف', opts: 0 },
  alertBox: { kind: 'تنبيه', opts: 2 },
  emptyState: { kind: 'حالة فارغة', opts: 2 },
  pageHeader: { kind: 'عنوان', opts: 0 },
  modal: { kind: 'نافذة', opts: 0 },
  formDialog: { kind: 'نافذة', opts: 0 },
  confirmDialog: { kind: 'نافذة', opts: 0 },
  confirmDanger: { kind: 'نافذة', opts: 0 },
  textSheet: { kind: 'نافذة', opts: 0 },
  sheet: { kind: 'نافذة', opts: 0 },
  field: { kind: 'حقل', opts: 2 },
  fileInput: { kind: 'حقل', opts: 0 },
  selectInput: { kind: 'حقل', opts: 0 },
  searchInput: { kind: 'حقل', opts: 0 },
  tabs: { kind: 'خيار', opts: 1 },
  choiceTiles: { kind: 'خيار', opts: 0 },
  table: { kind: 'جدول', opts: 0 },
  form: { kind: 'نموذج', opts: 1 }, // v12 tags (TG-6): ui.js form(fields, { tag, submitTag, cancelTag }) and fields[].tag
};
const OTHER_KIND = { kv: 'قائمة', timeline: 'قائمة', chatThread: 'قائمة', chips: 'خيار', form: 'نموذج', progressBar: 'مؤشر تقدم', stepTracker: 'مؤشر تقدم', badge: 'شارة', statusBadge: 'شارة', confirmDiscard: 'نافذة', navItem: 'رابط' };
export const MAP_KIND = { TEXT_TAGS: 'رسالة واتساب', EMAIL_TAGS: 'بريد', NOTIF_TAGS: 'إشعار', ALERT_TAGS: 'رسالة واتساب للمحامي', QUESTION_TAGS: 'سؤال', ANSWER_TAGS: 'خيار' };
/** عناصر h() الأساسية (T12-75/T12-78) */
export const KEY_ELEMENTS = new Set(['h1', 'h2', 'h3', 'button', 'a', 'section', 'form', 'input', 'select', 'textarea', 'details', 'header', 'footer', 'nav', 'summary', 'dialog']);
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'area', 'col', 'embed', 'wbr']);
const CONTAINERS = new Set(['section', 'article', 'aside', 'div', 'header', 'footer', 'main', 'nav', 'ul', 'ol', 'details', 'form', 'dl', 'table', 'fieldset', 'li', 'dialog']);

// ───────────────────────── سياق HTML ─────────────────────────

const attrOf = (attrs, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*\\\\?(["'])([\\s\\S]*?)\\\\?\\1`).exec(attrs);
  return m ? m[2] : '';
};

/** العنصر الذي يحمل السمة عند offset: { el, kind, text } من المصدر الخام (ملف HTML أو قالب نصي في JS) */
export function htmlContext(src, offset) {
  const lt = src.lastIndexOf('<', offset);
  if (lt < 0) return null;
  const nm = /^<([a-zA-Z][\w-]*)/.exec(src.slice(lt, lt + 40));
  if (!nm) return null;
  const el = nm[1].toLowerCase();
  const gt = src.indexOf('>', offset);
  if (gt < 0) return { el, kind: ELEMENT_KIND[el] || 'عنصر', text: '' };
  const attrs = src.slice(lt + nm[0].length, gt);
  const named = attrOf(attrs, 'aria-label') || attrOf(attrs, 'alt') || attrOf(attrs, 'placeholder') || attrOf(attrs, 'title');
  let inner = '';
  if (!VOID.has(el) && !attrs.trimEnd().endsWith('/')) {
    const re = new RegExp(`<(/?)${el}\\b[^>]*>`, 'gi');
    re.lastIndex = gt + 1;
    let depth = 1;
    let m;
    const limit = gt + 1 + 8000;
    while ((m = re.exec(src)) && m.index < limit) {
      depth += m[1] ? -1 : 1;
      if (!depth) {
        inner = src.slice(gt + 1, m.index);
        break;
      }
    }
    if (depth) inner = src.slice(gt + 1, Math.min(src.length, gt + 1 + 400));
  }
  const pick = (body) => {
    if (CONTAINERS.has(el)) {
      const head = /<(h[1-6]|summary|legend)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body);
      return (head ? cleanText(head[2]) : '') || cleanText(named) || cleanText(body);
    }
    return cleanText(body) || cleanText(named);
  };
  // v12 gate fixer-server (TA-04): نص كل جانب وحده (<!--#if side_paid--> و<!--#if side_charity-->) بدل دمجهما في سطر
  // واحد («بيانات تقدّمها أنت تقدّمونها»): النص = صيغة الأفراد والشركات، والصيغتان في texts
  if (/<!--#if side_(?:paid|charity)-->/.test(inner)) {
    const paid = pick(dropSide(inner, 'charity'));
    const charity = pick(dropSide(inner, 'paid'));
    if (paid !== charity) return { el, kind: ELEMENT_KIND[el] || 'عنصر', text: paid || charity, texts: [{ label: 'أفراد وشركات', text: paid || '—' }, { label: 'خيري', text: charity || '—' }] };
  }
  return { el, kind: ELEMENT_KIND[el] || 'عنصر', text: pick(inner) };
}

/** v12 gate fixer-server (TA-04): يحذف كتل جانب من قالب HTML */
const dropSide = (s, side) => String(s).replace(new RegExp(`<!--#if side_${side}-->[\\s\\S]*?<!--/if side_${side}-->`, 'g'), ' ');

// ───────────────────────── سياق JS ─────────────────────────

/** خصائص المستوى الأول في كائن حرفي: الاسم ← رمز القيمة */
function objectProps(src, toks, openIdx) {
  const out = new Map();
  const close = toks[openIdx].close ?? toks.length;
  for (let k = openIdx + 1; k < close; k++) {
    const tk = toks[k];
    if (tk.parent !== openIdx) continue;
    if ((tk.t === 'id' || tk.t === 'str') && toks[k + 1]?.t === 'p' && toks[k + 1].v === ':' && toks[k + 1].parent === openIdx) {
      const name = tk.t === 'id' ? tk.v : src.slice(tk.s + 1, tk.e - 1);
      if (!out.has(name)) out.set(name, k + 2);
    } else if (tk.t === 'id' && (toks[k + 1]?.v === ',' || k + 1 === close) && (toks[k - 1]?.v === ',' || k - 1 === openIdx)) {
      // v12 tags (TG-6): shorthand property ({ type, tag, onClick }) — the value is the variable of the same name
      if (!out.has(tk.v)) out.set(tk.v, k);
    }
  }
  return out;
}

/** قالب `…${…}…` كاملًا من جزئه الأول: [بداية، نهاية، فهرس الجزء الأخير] */
function fullTemplate(toks, k) {
  let i = k;
  while (toks[i] && toks[i].t === 'tpl' && !toks[i].end) {
    const open = toks[i + 1];
    if (!open || !open.tpl || open.close == null) break;
    i = open.close + 1;
  }
  const last = toks[i] && toks[i].t === 'tpl' ? i : k;
  return [toks[k].s, toks[last].e, last];
}

/** v12 gate fixer-server (TA-04): آخر نص أعاده firstArabic ومفتاح نسخته إن كان الوسيط الثاني في P('key', '…') (portal.js) */
let lastArabic = null;
function copyKeyAt(src, toks, k) {
  const comma = toks[k - 1];
  const keyTok = toks[k - 2];
  const open = toks[k - 3];
  const fn = toks[k - 4];
  if (comma?.v === ',' && keyTok?.t === 'str' && open?.v === '(' && fn?.t === 'id' && fn.v === 'P' && toks[k - 5]?.v !== '.') return strValue(src, keyTok);
  return null;
}

/** أول نص عربي حرفي داخل مدى رموز [from, to) */
function firstArabic(src, toks, from, to) {
  lastArabic = null;
  for (let k = from; k < to; k++) {
    const tk = toks[k];
    if (tk.t !== 'str' && tk.t !== 'tpl') continue;
    if (tk.t === 'tpl' && src[tk.s] === '`' && !tk.end) {
      const [s0, e0] = fullTemplate(toks, k);
      const txt = cleanText(src.slice(s0, e0).replace(/^`|`$/g, ''));
      if (ARABIC.test(txt)) return txt;
      continue;
    }
    const v = strValue(src, tk);
    if (ARABIC.test(v)) {
      const txt = cleanText(v);
      if (txt && ARABIC.test(txt)) {
        const key = copyKeyAt(src, toks, k);
        if (key) lastArabic = { text: txt, key };
        return txt;
      }
    }
  }
  return '';
}

/** اسم الدالة المستدعاة قبل '(' عند الفهرس openIdx: { name, start } أو null */
function calleeOf(toks, openIdx) {
  const before = toks[openIdx - 1];
  if (!before || before.t !== 'id') return null;
  const prev2 = toks[openIdx - 2];
  if (prev2 && prev2.t === 'id' && prev2.v === 'function') return null;
  let start = before.s;
  if (prev2 && prev2.t === 'p' && prev2.v === '.' && toks[openIdx - 3]?.t === 'id') start = toks[openIdx - 3].s;
  return { name: before.v, start, member: Boolean(prev2 && prev2.t === 'p' && prev2.v === '.') };
}

/** وسائط استدعاء: مصفوفة [from, to) لفهارس الرموز (مفصولة بفواصل المستوى الأول) */
export function callArgs(toks, openIdx) {
  const close = toks[openIdx].close ?? toks.length;
  const args = [];
  let from = openIdx + 1;
  for (let k = openIdx + 1; k < close; k++) {
    if (toks[k].parent === openIdx && toks[k].t === 'p' && toks[k].v === ',') {
      if (k > from) args.push([from, k]);
      from = k + 1;
    }
  }
  if (close > from) args.push([from, close]);
  return args;
}

const PROP_TEXT_KEYS = ['label', 'title', 'text', 'name', 'heading', 'q'];

function propText(src, toks, props, keys = PROP_TEXT_KEYS) {
  for (const key of keys) {
    const k = props.get(key);
    if (k == null) continue;
    const tk = toks[k];
    if (tk && (tk.t === 'str' || tk.t === 'tpl')) {
      const t = cleanText(strValue(src, tk));
      if (t) return t;
    }
  }
  return '';
}

// review (TAGS.md مقروء للمالك): نص يأتي من وحدة كلمات بدل نص حرفي — W.nav.logout في بوابة الشركات، COPY.done في نموذج
// الطلب. يُسجَّل المرجع (ref) فيحلّه registry.js من الوحدة نفسها، بدل «(نص متغير)».
const REF_ROOTS = new Map([
  ['W', 'W'],
  ['COPY', 'COPY'],
]);
let refRoots = REF_ROOTS;

/** v12 gate fixer-server (TA-04): نصوص كائنات const NAME = { key: 'نص عربي', … } في الملف نفسه: { NAME: { key: نص } } */
let localWords = {};
function localWordMaps(src, blank, toks) {
  const out = {};
  for (const m of String(blank).matchAll(/\bconst\s+([A-Z][A-Za-z0-9_]*)\s*=\s*\{/g)) {
    // W وCOPY يحلّهما registry.js من وحدات الكلمات (نسخة الأفراد والشركات)، لا الكائن المحلي («خيري»)
    if (/_TAGS$|^TAGS$/.test(m[1]) || REF_ROOTS.has(m[1])) continue;
    const k = tokenAt(toks, m.index + m[0].length - 1);
    if (k < 0 || toks[k].v !== '{') continue;
    const props = objectProps(src, toks, k);
    const words = {};
    for (const [name, vi] of props) {
      const tk = toks[vi];
      if (tk?.t !== 'str' && !(tk?.t === 'tpl' && tk.end && src[tk.s] === '`')) continue;
      const t = cleanText(strValue(src, tk));
      if (t && ARABIC.test(t)) words[name] = t;
    }
    if (Object.keys(words).length) out[m[1]] = words;
  }
  return out;
}

/** أسماء مختصرة في الملف نفسه: const A = W.account; ← A.name يعني W.account.name */
export function refAliases(src) {
  const out = new Map(REF_ROOTS);
  for (const m of String(src).matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(W(?:\.[A-Za-z_$][\w$]*)+)\s*;/g)) if (!out.has(m[1])) out.set(m[1], m[2]);
  return out;
}

/** أول سلسلة W.a.b / COPY.x (أو اسم مختصر لها) داخل مدى رموز [from, to) لا تُستدعى دالةً (W.addressForm(…) ليست نصًا) */
export function firstRef(toks, from, to, roots = refRoots) {
  for (let k = from; k < to; k++) {
    const t = toks[k];
    if (t.t !== 'id' || !roots.has(t.v)) continue;
    const prev = toks[k - 1];
    if (prev && prev.t === 'p' && prev.v === '.') continue;
    const parts = [roots.get(t.v)];
    let j = k + 1;
    while (toks[j]?.t === 'p' && toks[j].v === '.' && toks[j + 1]?.t === 'id') {
      parts.push(toks[j + 1].v);
      j += 2;
    }
    if (parts.length < 2 || (toks[j]?.t === 'p' && toks[j].v === '(') || (toks[j]?.t === 'p' && toks[j].v === '=' && toks[j + 1]?.v !== '=')) continue;
    return parts.join('.');
  }
  return '';
}

/** يضيف ref حين لا نص حرفي */
const withRef = (res, toks, from, to) => (res.text ? res : { ...res, ref: firstRef(toks, from, to) || undefined });

/** النوع والنص لتعريف في JS عند الرمز valIdx (قيمة tag: 'X' أو وسيط tagged('X') */
function jsContext(src, toks, valIdx, key) {
  const objIdx = toks[valIdx].parent;
  const obj = toks[objIdx];
  if (key === 'tagged') {
    // tagged('X', builder(…)) : النوع من الدالة الملفوفة، والنص أول نص عربي في الاستدعاء
    const args = callArgs(toks, objIdx);
    let kind = 'عنصر';
    if (args[1]) {
      const [a] = args[1];
      const t0 = toks[a];
      const t1 = toks[a + 1];
      const nameIdx = t0?.t === 'id' && t1?.t === 'p' && t1.v === '.' ? a + 2 : a;
      const nameTok = toks[nameIdx];
      if (nameTok?.t === 'id') {
        const nm = nameTok.v;
        if (nm === 'h' || nm === 'svg') {
          const first = toks[nameIdx + 2];
          const el = first && first.t === 'str' ? /^[a-z0-9]*/i.exec(strValue(src, first))[0].toLowerCase() || 'div' : 'div';
          kind = ELEMENT_KIND[el] || 'عنصر';
        } else kind = BUILDERS[nm]?.kind || OTHER_KIND[nm] || 'عنصر';
      }
    }
    return withRef({ kind, text: firstArabic(src, toks, objIdx + 1, obj.close ?? toks.length) }, toks, objIdx + 1, obj.close ?? toks.length);
  }
  if (!obj || obj.t !== 'p' || obj.v !== '{') return { kind: 'عنصر', text: '' };
  const props = objectProps(src, toks, objIdx);
  // v12 gate fixer-server (TA-04): titleTag = عنوان البطاقة (title:)، submitTag = زر الإرسال (submitLabel:) — لا أول نص عربي
  // في الاستدعاء كله (INT-44 «توجيه النموذج: …»، LGN-36 «اسم المستخدم»)
  if (key === 'titleTag') {
    const vi = props.get('title');
    const text = propText(src, toks, props, ['title']);
    return text ? { kind: 'عنوان', text } : { kind: 'عنوان', text: '', ref: vi != null ? firstRef(toks, vi, vi + 1) || undefined : undefined };
  }
  if (key === 'submitTag') return { kind: 'زر', text: propText(src, toks, props, ['submitLabel']) || 'حفظ' };
  // عنصر كتالوج له تسمية للفريق وأخرى للشركة (company-catalog.js): ما تراه الشركة نصًا، والتسميتان صيغتين
  if (props.has('company_label')) {
    const staff = propText(src, toks, props, ['label']);
    const company = propText(src, toks, props, ['company_label']);
    if (company && staff && company !== staff) return { kind: 'عنصر قائمة', text: company, texts: [{ label: 'بوابة الشركات', text: company }, { label: 'الفريق', text: staff }] };
  }
  if (key === 'qtag') return withRef({ kind: 'سؤال', text: propText(src, toks, props, ['q', 'title', 'label']) || firstArabic(src, toks, objIdx + 1, obj.close ?? toks.length) }, toks, objIdx + 1, obj.close ?? toks.length);
  const outer = obj.parent >= 0 ? toks[obj.parent] : null;
  if (outer && outer.v === '(') {
    const callee = calleeOf(toks, obj.parent);
    if (callee) {
      const span = [obj.parent + 1, outer.close ?? toks.length];
      if (callee.name === 'h' || callee.name === 'svg') {
        const first = toks[obj.parent + 1];
        const el = first && first.t === 'str' ? (/^[a-z0-9]*/i.exec(strValue(src, first))[0] || 'div').toLowerCase() : 'div';
        return withRef({ kind: ELEMENT_KIND[el] || 'عنصر', text: firstArabic(src, toks, ...span), el }, toks, ...span);
      }
      const kind = BUILDERS[callee.name]?.kind || OTHER_KIND[callee.name] || 'عنصر';
      const res = { kind, text: propText(src, toks, props) || firstArabic(src, toks, ...span) };
      // review: navItem('/cases', 'briefcase', { tag }) في app/shell.js: الاسم عنوان المسار في routes.js (routeTitle)
      const first = toks[span[0]];
      if (!res.text && callee.name === 'navItem' && first?.t === 'str') return { ...res, kind: 'رابط', ref: `ROUTE:${strValue(src, first)}` };
      return withRef(res, toks, ...span);
    }
  }
  // عنصر بيانات (عقدة شجرة، سؤال، رابط قائمة، حقل إعدادات…)
  const inList = outer && outer.v === '[';
  return withRef({ kind: inList ? 'عنصر قائمة' : 'خيار', text: propText(src, toks, props) || firstArabic(src, toks, objIdx + 1, obj.close ?? toks.length) }, toks, objIdx + 1, obj.close ?? toks.length);
}

// ───────────────────────── المسح ─────────────────────────

const ATTR_RE = new RegExp(`data-tag\\s*=\\s*\\\\?(["'])(${CODE_ANY})\\\\?\\1`, 'g');
const ATTR_EXPR_RE = /data-tag\s*=\s*\\?(["'])\$\{([^}]*)\}\\?\1/g;
// v12 tags (TG-6): a guarded literal counts too — tag: X && 'I-54' · tag: PC ? 'P-02' : null (the literal is the definition)
const PROP_RE = new RegExp(`(?<![\\w$.-])(['"]?)(tag|qtag|data-tag|[a-z][A-Za-z0-9]*Tag)\\1\\s*:\\s*(?:!?[\\w$.]+(?:\\([^()]*\\))?\\s*(?:&&|\\?)\\s*)?(['"\`])(${CODE_ANY})\\3`, 'g');
const PROP_EXPR_RE = /(?<![\w$.-])(['"]?)(tag|qtag|data-tag|[a-z][A-Za-z0-9]*Tag)\1\s*:\s*(?!['"`\s])([\w$.?[\]()'"]+)/g;
const DOM_TAG_RE = new RegExp(`\\.dataset\\.tag\\s*=\\s*(['"])(${CODE_ANY})\\1|setAttribute\\(\\s*(['"])data-tag\\3\\s*,\\s*['"](${CODE_ANY})['"]`, 'g');
const TAGGED_RE = new RegExp(`\\btagged\\(\\s*(['"\`])(${CODE_ANY})\\1`, 'g');
// v12 gate fixer-server (TA-01): + خريطة محلية اسمها TAGS (integrations.js: const TAGS = { preset: 'INT-06', … })
const MAP_RE = /\b([A-Z][A-Z0-9_]*_TAGS|TAGS)\s*=\s*(?:[\w$.]+\(\s*)?\{/g;
const MAP_ENTRY_RE = new RegExp(`(?:(['"])([^'"\\n]+)\\1|([A-Za-z_$][\\w$]*))\\s*:\\s*(['"])(${CODE_ANY})\\4`, 'g');
const POINTER_RE = new RegExp(`@tag-src\\s+(${CODE_ANY})`, 'g');
const SETTING_RE = new RegExp(`@tag-setting\\s+(${CODE_ANY})\\s+([^\\n*]+)`, 'g');

// v12 gate fixer-server (TA-01): رمز كامل (لا X-00، ولا أرقام بأكثر من 3 خانات)
const LOOSE_CODE_RE = /^[A-Z]{1,6}-(?!00$)\d{2,3}$/;

/** موضع الرمز الحرفي عند k: 'arg' | 'default' | 'var' | 'fallback' | 'ternary' أو null */
function looseContext(toks, k) {
  const p = toks[k - 1];
  const nx = toks[k + 1];
  if (!p || p.t !== 'p') return null;
  const parentIdx = toks[k].parent;
  const parent = parentIdx >= 0 ? toks[parentIdx] : null;
  const endsArg = !nx || (nx.t === 'p' && (nx.v === ')' || nx.v === ','));
  if ((p.v === '(' || p.v === ',') && parent?.v === '(' && endsArg && calleeOf(toks, parentIdx)) return 'arg';
  if (p.v === '=' && toks[k - 2]?.t === 'id' && toks[k - 3]?.v !== '=' && toks[k - 3]?.v !== '!') {
    if (parent?.v === '(') return 'default';
    if (/^(?:const|let|var)$/.test(toks[k - 3]?.v || '')) return 'var';
  }
  if ((p.v === '|' && toks[k - 2]?.v === '|') || (p.v === '?' && toks[k - 2]?.v === '?')) return 'fallback';
  if (p.v === '?' && nx?.v !== '.') return 'ternary';
  if (p.v === ':') {
    // فرع «وإلا» في شرط ثلاثي: «?» قبله في المستوى نفسه قبل أي «,» أو «;» أو بداية القوس
    for (let j = k - 2; j > parentIdx; j--) {
      const t = toks[j];
      if (t.parent !== parentIdx) continue;
      if (t.t === 'p' && (t.v === ',' || t.v === ';')) return null;
      if (t.t === 'p' && t.v === '?' && toks[j + 1]?.v !== '.' && toks[j - 1]?.v !== '?') return 'ternary';
    }
  }
  return null;
}

/** نوع ونص تعريف حرفي من looseContext: خاصية tag في كائن ← سياق الكائن؛ وسيط ← نص الاستدعاء */
function looseInfo(src, toks, k, how) {
  const parentIdx = toks[k].parent;
  const parent = parentIdx >= 0 ? toks[parentIdx] : null;
  if (parent?.v === '{' && (how === 'ternary' || how === 'fallback')) {
    // نوع العنصر من سياق الكائن، والنص من خصائصه وحدها (لا أول نص عربي في أبنائه: «فتح» زر داخل البند ليس اسمه)
    const ctx = jsContext(src, toks, k, 'tag');
    return { kind: ctx.kind, text: propText(src, toks, objectProps(src, toks, parentIdx)) };
  }
  if (how === 'default' && toks[k - 2]?.t === 'id') {
    // tag = 'L-01' في معاملات دالة تبني HTML: نوع العنصر الذي يحمل data-tag="${tag}" ونصوص aria-label الحرفية فيه
    const name = toks[k - 2].v;
    const at = src.indexOf(`data-tag="\${${name}}"`, toks[k].e);
    if (at > 0 && at - toks[k].e < 4000) {
      const ctx = htmlContext(src, at);
      const lt = src.lastIndexOf('<', at);
      const aria = /aria-label="([^"]*)"/.exec(src.slice(lt, src.indexOf('>', at) + 1))?.[1] || '';
      const words = [...aria.matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((x) => ARABIC.test(x));
      return { kind: ctx?.kind || 'عنصر', text: words.join(' · ') || (ctx?.text && ctx.text !== '…' ? ctx.text : '') };
    }
  }
  if (how === 'arg' && parent?.v === '(') {
    const callee = calleeOf(toks, parentIdx);
    const span = [parentIdx + 1, parent.close ?? toks.length];
    const kind = (callee && (BUILDERS[callee.name]?.kind || OTHER_KIND[callee.name] || LOCAL_KIND[callee.name])) || 'عنصر';
    const own = withRef({ kind, text: firstArabic(src, toks, ...span) }, toks, ...span);
    if (own.text || own.ref) return own;
    // input({…}, 'IC-18') داخل row('…', T.company, input(…), …): نص الاستدعاء المحيط (تسمية الحقل)
    const outerIdx = parent.parent;
    const outer = outerIdx >= 0 ? toks[outerIdx] : null;
    if (outer?.v === '(' && calleeOf(toks, outerIdx)) {
      const span2 = [outerIdx + 1, outer.close ?? toks.length];
      return withRef({ kind, text: firstArabic(src, toks, ...span2) }, toks, ...span2);
    }
    return own;
  }
  return { kind: 'عنصر', text: '' };
}

// v12 gate fixer-server (TA-01): أنواع دوال مساعدة محلية شائعة
const LOCAL_KIND = { input: 'حقل', row: 'حقل', group: 'مجموعة حقول', backfill: 'زر', chips: 'خيار' };

const codeParts = (code) => {
  const m = /^([A-Za-z]+)-(\d+)$/.exec(code);
  return { prefix: m[1], num: m[2] };
};

/** يمسح ملفًا واحدًا. rel = المسار النسبي (يحدد طريقة القراءة HTML أو JS). */
export function scanFile(rel, src) {
  const isHtml = rel.endsWith('.html');
  const lineOf = lineIndex(src);
  const lines = src.split('\n');
  const defs = [];
  const uses = [];
  const pointers = [];
  const settings = [];
  const variantLine = (line) => /tags:variant/.test(lines[line - 1] || '') || /tags:variant/.test(lines[line - 2] || '');
  let toks = [];
  let blank;
  localWords = {};
  if (isHtml) blank = blankRanges(src, htmlCommentRanges(src));
  else {
    const tk = tokenize(src);
    toks = tk.toks;
    blank = blankRanges(src, tk.comments);
    refRoots = refAliases(blank);
    // v12 gate fixer-server (TA-04): كائنات نصوص محلية (const T = { company: 'اسم الشركة', … }) ← T.company يُقرأ نصًا
    localWords = localWordMaps(src, blank, toks);
    for (const name of Object.keys(localWords)) if (!refRoots.has(name)) refRoots.set(name, name);
  }
  const taken = new Set(); // مواضع التعريفات (v12 gate fixer-server، TA-01)
  const add = (code, offset, form, ctx, extra = {}) => {
    taken.add(offset);
    const { prefix, num } = codeParts(code);
    const line = lineOf(offset);
    const rec = { code, prefix, num, file: rel, line, form, kind: ctx?.kind || 'عنصر', text: ctx?.text || '', ...extra };
    if (!rec.text && ctx?.ref) {
      const [root, key, ...more] = String(ctx.ref).split('.');
      const local = !more.length && localWords[root]?.[key];
      if (local) rec.text = local;
      else rec.ref = ctx.ref;
    }
    // v12 gate fixer-server (TA-04): صيغ النص (جانبا القالب، تسمية الفريق وتسمية الشركة) ومفتاح نسخة P('key', '…')
    if (ctx?.texts?.length) rec.texts = ctx.texts;
    if (ctx?.text && lastArabic && lastArabic.text === ctx.text) rec.copyKey = lastArabic.key;
    lastArabic = null;
    if (variantLine(line)) rec.variant = true;
    if (num === PLACEHOLDER_NUM) rec.placeholder = true;
    defs.push(rec);
  };
  const mapSpans = [];
  // خرائط *_TAGS (TEXT_TAGS، EMAIL_TAGS، QUESTION_TAGS…): كل قيمة رمز = تعريف بمفتاحه
  if (!isHtml) {
    MAP_RE.lastIndex = 0;
    let m;
    while ((m = MAP_RE.exec(blank))) {
      const braceAt = m.index + m[0].length - 1;
      const k = tokenAt(toks, braceAt);
      if (k < 0 || toks[k].v !== '{') continue;
      const end = toks[toks[k].close]?.e ?? blank.length;
      mapSpans.push([braceAt, end]);
      const body = blank.slice(braceAt, end);
      // v12 gate fixer-server (TA-01): خريطة TAGS المحلية تربط اسم حقل نموذج برمزه؛ النص = تسمية الحقل ({ name: 'x', label: '…' })
      const fieldLabels = m[1] === 'TAGS' ? Object.fromEntries([...src.matchAll(/name:\s*'([\w-]+)'\s*,\s*label:\s*'([^'\n]+)'/g)].map((x) => [x[1], cleanText(x[2])])) : null;
      MAP_ENTRY_RE.lastIndex = 0;
      let e;
      while ((e = MAP_ENTRY_RE.exec(body))) {
        const key = e[2] ?? e[3];
        const at = braceAt + e.index + e[0].lastIndexOf(e[5]);
        if (fieldLabels) add(e[5], at, 'prop', { kind: 'حقل', text: fieldLabels[key] || '' }, { key: 'tag' });
        else add(e[5], at, 'map', { kind: MAP_KIND[m[1]] || 'رسالة', text: '' }, { map: m[1], key });
      }
    }
  }
  const inMap = (off) => mapSpans.some(([s, e]) => off >= s && off < e);
  // data-tag="X" في HTML وفي القوالب النصية
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(blank))) {
    const at = m.index + m[0].indexOf(m[2]);
    // [data-tag="X"] في محدِّد CSS/querySelector استعمال لا تعريف
    if (/\[\s*$/.test(blank.slice(Math.max(0, m.index - 8), m.index))) {
      uses.push({ file: rel, line: lineOf(m.index), expr: m[2] });
      continue;
    }
    if (!isHtml) {
      const k = tokenAt(toks, at);
      if (k < 0 || (toks[k].t !== 'str' && toks[k].t !== 'tpl')) continue;
    }
    add(m[2], at, 'attr', htmlContext(src, m.index));
  }
  ATTR_EXPR_RE.lastIndex = 0;
  while ((m = ATTR_EXPR_RE.exec(blank))) uses.push({ file: rel, line: lineOf(m.index), expr: m[2].trim() });
  if (!isHtml) {
    PROP_RE.lastIndex = 0;
    while ((m = PROP_RE.exec(blank))) {
      const at = m.index + m[0].lastIndexOf(m[4]);
      if (inMap(at)) continue;
      const k = tokenAt(toks, at);
      if (k < 0) continue;
      if ((toks[k].t === 'str' || toks[k].t === 'tpl') && toks[k].s === at - 1) add(m[4], at, 'prop', jsContext(src, toks, k, m[2]), { key: m[2] });
      else if (toks[k].t === 'str' || toks[k].t === 'tpl') add(m[4], at, 'prop', { kind: m[2] === 'qtag' ? 'سؤال' : 'خيار', text: '' }, { key: m[2], embedded: true });
    }
    PROP_EXPR_RE.lastIndex = 0;
    while (rel.startsWith('public/') && (m = PROP_EXPR_RE.exec(blank))) {
      const k = tokenAt(toks, m.index + m[0].length - 1);
      if (k >= 0 && (toks[k].t === 'str' || toks[k].t === 'tpl' || toks[k].t === 'regex')) continue;
      if (/^(?:null|undefined|true|false|\d+)$/.test(m[3])) continue;
      uses.push({ file: rel, line: lineOf(m.index), expr: m[3] });
    }
    // v12 tags (TG-6): DOM code without h() (saved.js, landing.js): el.dataset.tag = 'I-00' · el.setAttribute('data-tag', 'I-00')
    DOM_TAG_RE.lastIndex = 0;
    while ((m = DOM_TAG_RE.exec(blank))) {
      const code = m[2] || m[4];
      const at = m.index + m[0].lastIndexOf(code);
      const k = tokenAt(toks, at);
      if (k < 0 || toks[k].t !== 'str') continue;
      add(code, at, 'dom', { kind: 'عنصر', text: '' });
    }
    TAGGED_RE.lastIndex = 0;
    while ((m = TAGGED_RE.exec(blank))) {
      const at = m.index + m[0].lastIndexOf(m[2]);
      const k = tokenAt(toks, at);
      if (k < 0 || toks[k].t !== 'str') continue;
      add(m[2], at, 'tagged', jsContext(src, toks, k, 'tagged'));
    }
    // v12 gate fixer-server (TA-01): رمز حرفي يصل إلى data-tag عبر دالة مساعدة — وسيط استدعاء (row(…, 'IC-03')،
    // backfill(…, 'SYS-06'))، قيمة افتراضية (tag = 'L-01')، متغير (const tag = 'X-01')، بديل (it.tag || 'CT-21') أو فرع شرط
    // (c ? 'SYS-09' : 'SYS-10'). قيمة خاصية عادية ({ crv: 'P-256' }) وعناصر المصفوفات ليست تعريفات.
    for (let k = 0; k < toks.length; k++) {
      const tk = toks[k];
      if (tk.t !== 'str') continue;
      const val = src.slice(tk.s + 1, tk.e - 1);
      if (!LOOSE_CODE_RE.test(val)) continue;
      const at = tk.s + 1;
      if (taken.has(at) || inMap(at)) continue;
      const how = looseContext(toks, k);
      if (!how) continue;
      const pIdx = tk.parent;
      // اسم الدالة: المستدعاة (وسيط) أو المعرَّفة (قيمة افتراضية في function NAME(…))
      const fn = pIdx >= 0 && toks[pIdx].v === '(' && toks[pIdx - 1]?.t === 'id' ? toks[pIdx - 1].v : null;
      add(val, at, 'arg', looseInfo(src, toks, k, how), { how, fn });
    }
    // وسيط لدالة في الملف نفسه رمزها الافتراضي معرَّف (treeLogoHtml(…, 'I-04') ← tag = 'L-01'): نوعها ونصها
    for (const d of defs) {
      if (d.form !== 'arg' || d.how !== 'arg' || d.text || !d.fn) continue;
      const base = defs.find((x) => x.form === 'arg' && x.how === 'default' && x.fn === d.fn && x.text);
      if (base) {
        d.kind = base.kind;
        d.text = base.text;
        delete d.ref;
      }
    }
  }
  // مؤشرات @tag-src ومصادر @tag-setting (في التعليقات؛ T12-52)
  POINTER_RE.lastIndex = 0;
  while ((m = POINTER_RE.exec(src))) pointers.push({ code: m[1], file: rel, line: lineOf(m.index) });
  SETTING_RE.lastIndex = 0;
  while ((m = SETTING_RE.exec(src))) settings.push({ code: m[1], card: m[2].replace(/\s*-->\s*$/, '').trim(), file: rel, line: lineOf(m.index) });
  defs.sort((a, b) => a.line - b.line);
  return { defs, uses, pointers, settings };
}

/**
 * يمسح كل المصادر. يعيد { root, files, defs (تعريفات بأرقام)، placeholders (X-00)، uses، pointers، settings }.
 * opts.files: قائمة ملفات بدل listSourceFiles · opts.read(rel): قارئ بديل (للاختبار).
 */
export function scanSources({ root = ROOT, files, read } = {}) {
  const list = files || listSourceFiles(root);
  const out = { root, files: list, defs: [], placeholders: [], uses: [], pointers: [], settings: [] };
  for (const rel of list) {
    let src;
    try {
      src = read ? read(rel) : fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (src == null || !/data-tag|tag|_TAGS|@tag-/.test(src)) continue;
    const r = scanFile(rel, src);
    for (const d of r.defs) (d.placeholder ? out.placeholders : out.defs).push(d);
    out.uses.push(...r.uses);
    out.pointers.push(...r.pointers);
    out.settings.push(...r.settings);
  }
  return out;
}

/** مسح مخزَّن حسب تواريخ تعديل الملفات (لنقطة /api/admin/tags وغيرها) */
let cache = null;
export function cachedScan(root = ROOT) {
  const files = listSourceFiles(root);
  const sig = files.map((f) => {
    try {
      const st = fs.statSync(path.join(root, f));
      return `${f}:${st.size}:${Math.floor(st.mtimeMs)}`;
    } catch {
      return f;
    }
  }).join('|');
  if (cache && cache.root === root && cache.sig === sig) return cache.scan;
  const scan = scanSources({ root, files });
  cache = { root, sig, scan };
  return scan;
}

// ───────────────────────── التغطية (وضع التقرير) وأداة autotag ─────────────────────────

const skipNear = (lines, line) => /tags:skip/.test(lines[line - 1] || '') || /tags:skip/.test(lines[line - 2] || '');

/** هل في كائن الخصائص الحرفي (فهرس '{') خاصية tag؟ */
function objectHasTag(src, toks, openIdx) {
  const props = objectProps(src, toks, openIdx);
  return props.has('tag') || props.has('data-tag');
}

const isObjectArg = (toks, [a, b]) => toks[a]?.t === 'p' && toks[a].v === '{' && toks[a].close === b - 1;

/**
 * استدعاءات المكوّنات وh() لعناصر أساسية في ملف JS: [{ name, line, tagged: bool, skip: bool, ... }].
 * tagged = في خياراتها tag، أو هي الوسيط الثاني لـ tagged(…). skip = «// tags:skip» على السطر أو الذي قبله.
 */
export function builderCalls(src, tk = tokenize(src)) {
  const { toks } = tk;
  const lineOf = lineIndex(src);
  const lines = src.split('\n');
  const out = [];
  for (let k = 0; k < toks.length - 1; k++) {
    const id = toks[k];
    const open = toks[k + 1];
    if (id.t !== 'id' || open.t !== 'p' || open.v !== '(') continue;
    const name = id.v;
    const isH = name === 'h';
    if (!isH && !BUILDERS[name]) continue;
    const before = toks[k - 1];
    if (before && before.t === 'id' && before.v === 'function') continue;
    if (before && before.t === 'p' && before.v === '.' && !(toks[k - 2]?.t === 'id' && /^(ui|UI|kit|K)$/.test(toks[k - 2].v))) continue;
    const afterClose = toks[(open.close ?? k) + 1];
    if (afterClose && afterClose.t === 'p' && afterClose.v === '{') continue; // تعريف دالة/طريقة
    const args = callArgs(toks, k + 1);
    let el = null;
    if (isH) {
      const first = args[0] && toks[args[0][0]];
      if (!first || first.t !== 'str' || args[0][1] - args[0][0] !== 1) continue;
      el = (/^[a-z0-9]*/i.exec(strValue(src, first))[0] || 'div').toLowerCase();
      if (!KEY_ELEMENTS.has(el)) continue;
    }
    const start = before && before.t === 'p' && before.v === '.' ? toks[k - 2].s : id.s;
    const line = lineOf(id.s);
    // ملفوف بـ tagged(…) كوسيط ثانٍ؟
    let wrapped = false;
    const par = open.parent >= 0 ? toks[open.parent] : null;
    if (par && par.v === '(') {
      const c = calleeOf(toks, open.parent);
      if (c && c.name === 'tagged') {
        const pargs = callArgs(toks, open.parent);
        wrapped = Boolean(pargs[1] && pargs[1][0] <= k && k < pargs[1][1]);
      }
    }
    let hasTag = wrapped;
    const optPos = isH ? 1 : BUILDERS[name].opts;
    if (!hasTag && optPos != null && args[optPos] && isObjectArg(toks, args[optPos])) hasTag = objectHasTag(src, toks, args[optPos][0]);
    // v12 tags (TG-6): a local helper with an options-object signature (intake.js field({ …, tag })) carries its tag in arg 0
    if (!hasTag && !isH && optPos !== 0 && args[0] && isObjectArg(toks, args[0])) hasTag = objectHasTag(src, toks, args[0][0]);
    out.push({ name, el, line, start, openIdx: k + 1, closeIdx: open.close, args, optPos, tagged: hasTag, wrapped, skip: skipNear(lines, line) });
  }
  return out;
}

const HTML_KEY_RE = /<(section|header|footer|nav|h1|h2|h3|button|details|form|input|select|textarea|a)\b([^>]*)>/gi;

/** عناصر HTML الأساسية بلا data-tag (الروابط داخل <p> مستثناة، وكذلك input المخفي) */
export function untaggedHtml(src) {
  const blank = blankRanges(src, htmlCommentRanges(src));
  const lineOf = lineIndex(src);
  const pRanges = [];
  const pre = /<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let m;
  while ((m = pre.exec(blank))) pRanges.push([m.index, m.index + m[0].length]);
  const out = [];
  HTML_KEY_RE.lastIndex = 0;
  while ((m = HTML_KEY_RE.exec(blank))) {
    const el = m[1].toLowerCase();
    const attrs = m[2];
    if (/\sdata-tag\s*=/.test(attrs) || /\sdata-notag\s*=/.test(attrs)) continue;
    if (el === 'input' && /\stype\s*=\s*["']?hidden/i.test(attrs)) continue;
    if (el === 'a' && pRanges.some(([s, e]) => m.index > s && m.index < e)) continue;
    out.push({ el, line: lineOf(m.index), index: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * تقرير التغطية الثابت (وضع التقرير فقط في 12.0 حتى يفعّل مسار tags التطبيق، T12-94):
 * لكل ملف من ملفات الواجهة عدد استدعاءات المكوّنات/عناصر h() الأساسية وقوالب HTML بلا رمز.
 */
export function coverageReport({ root = ROOT, files } = {}) {
  const list = (files || listSourceFiles(root)).filter((f) => /^public\/(?:[^/]+\.html|assets\/js\/(?:app|company|public)\/.+\.js|assets\/js\/lib\/company-ui(?:-core)?\.js)$/.test(f));
  const rows = [];
  let total = 0;
  let untagged = 0;
  for (const rel of list) {
    let src;
    try {
      src = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      continue;
    }
    let n = 0;
    let u = 0;
    const missing = [];
    if (rel.endsWith('.html')) {
      const tagged = (src.match(/\sdata-tag\s*=/g) || []).length;
      const miss = untaggedHtml(src);
      n = tagged + miss.length;
      u = miss.length;
      missing.push(...miss.slice(0, 5).map((x) => `${x.el}:${x.line}`));
    } else {
      for (const c of builderCalls(src)) {
        if (c.skip) continue;
        n++;
        if (!c.tagged) {
          u++;
          if (missing.length < 5) missing.push(`${c.el || c.name}:${c.line}`);
        }
      }
    }
    if (!n) continue;
    total += n;
    untagged += u;
    rows.push({ file: rel, keys: n, untagged: u, sample: missing });
  }
  rows.sort((a, b) => b.untagged - a.untagged || a.file.localeCompare(b.file));
  return { total, untagged, tagged: total - untagged, rows };
}

/**
 * أداة autotag (T12-90): تضيف عناصر نائبة X-00 لاستدعاءات المكوّنات وعناصر h() وقوالب HTML الأساسية التي بلا رمز.
 * لا تختار أرقامًا أبدًا. تعيد { out, inserted:[{line, what}], skipped:[{line, reason}] }.
 */
export function autotagSource(rel, src, prefix, { titles = true, items = true, fields = true } = {}) {
  const ph = `${prefix}-00`;
  const edits = []; // [pos, text]
  const inserted = [];
  const skipped = [];
  if (rel.endsWith('.html')) {
    for (const x of untaggedHtml(src)) {
      const closeAt = src[x.end - 2] === '/' ? x.end - 2 : x.end - 1;
      const ws = closeAt > 0 && /\s/.test(src[closeAt - 1]) ? '' : ' ';
      edits.push([closeAt, `${ws}data-tag="${ph}"${src[x.end - 2] === '/' ? ' ' : ''}`]);
      inserted.push({ line: x.line, what: `<${x.el}>` });
    }
  } else {
    const tk = tokenize(src);
    const { toks } = tk;
    let needsTagged = false;
    const indentAt = (pos) => /^[ \t]*/.exec(src.slice(src.lastIndexOf('\n', pos - 1) + 1))[0];
    // يضيف text قبل القوس المغلق (كائن أو قائمة وسائط) مع مراعاة الفاصلة الأخيرة والأسطر المتعددة
    const insertBeforeClose = (openTok, closeTok, text) => {
      let at = closeTok.s;
      while (at > openTok.e && /\s/.test(src[at - 1])) at--;
      if (at === openTok.e) {
        edits.push([at, openTok.v === '{' ? ` ${text} ` : text]);
        return;
      }
      const last = src[at - 1];
      if (src.slice(at, closeTok.s).includes('\n')) edits.push([at, last === ',' ? `\n${indentAt(at)}${text},` : `,\n${indentAt(at)}${text}`]);
      else edits.push([at, last === ',' ? ` ${text}` : `, ${text}`]);
    };
    // v12 tags (TG-6، T12-90/T12-91): عنوان الصفحة والبطاقة (titleTag)، وعناصر القوائم الحرفية داخل الخيارات
    // (actions/fields/columns/options/breadcrumbs/items) تأخذ رمزًا لكل عنصر؛ وrowTag لقالب صف الجدول.
    const objOf = (c) => (c.optPos != null && c.args[c.optPos] && isObjectArg(toks, c.args[c.optPos]) ? c.args[c.optPos][0] : null);
    // حقول نموذج رُمِّزت بعد البناء (tagged('X', f.control('name').wrap)) أو زر إرساله (f.el.querySelector('button[type="submit"]')):
    // الرمز الملفوف هو المعتمد، فلا يُضاف رمز ثانٍ لنفس العنصر
    const wrappedControls = new Set([...src.matchAll(/tagged\(\s*['"][A-Z]{1,3}-\d{2,3}['"]\s*,\s*[\w$.]+\.control\(\s*['"]([\w-]+)['"]\s*\)/g)].map((m) => m[1]));
    const wrappedSubmit = /tagged\(\s*['"][A-Z]{1,3}-\d{2,3}['"]\s*,\s*[\w$.]+\.querySelector\(\s*['"]button\[type=\\?["']?submit\\?["']?\]['"]\s*\)/.test(src) || /tagged\(\s*['"][A-Z]{1,3}-\d{2,3}['"]\s*,\s*submit\b/.test(src);
    const itemsIn = (arrOpen, need = null) => {
      // عناصر مصفوفة حرفية: كائنات حرفية في المستوى الأول بلا tag
      const out = [];
      const close = toks[arrOpen].close;
      for (let k = arrOpen + 1; k < close; k++) {
        const t = toks[k];
        if (t.parent !== arrOpen || t.t !== 'p' || t.v !== '{') continue;
        const before = toks[k - 1];
        if (before && before.t === 'p' && before.v === '...') continue;
        const props = objectProps(src, toks, k);
        if (props.has('tag') || props.has('data-tag')) continue;
        if (!['label', 'title', 'text', 'name', 'key', 'value', 'heading'].some((p) => props.has(p))) continue;
        const ty = props.get('type');
        if (ty != null && toks[ty]?.t === 'str' && src.slice(toks[ty].s + 1, toks[ty].e - 1) === 'hidden') continue; // حقل مخفي بلا عنصر ظاهر
        const nm = props.get('name');
        if (nm != null && toks[nm]?.t === 'str' && wrappedControls.has(src.slice(toks[nm].s + 1, toks[nm].e - 1))) continue;
        if (need && !props.has(need)) continue; // مسار التنقل: الرابط وحده يحمل الرمز (العنصر الأخير نص)
        out.push(k);
      }
      return out;
    };
    const itemTagged = new Set();
    const ITEM_KEYS = { modal: ['actions'], textSheet: ['actions'], formDialog: ['fields'], table: ['columns'], choiceTiles: ['options'], pageHeader: ['breadcrumbs'] };
    const lineOfTok = lineIndex(src);
    for (const c of builderCalls(src, tk)) {
      if (c.skip) continue;
      const o = items || titles ? objOf(c) : null;
      if (o != null) {
        const props = objectProps(src, toks, o);
        if (titles && (c.name === 'pageHeader' || c.name === 'card') && props.has('title') && !props.has('titleTag')) {
          insertBeforeClose(toks[o], toks[toks[o].close], `titleTag: '${ph}'`);
          inserted.push({ line: c.line, what: `${c.name}() title` });
        }
        if (items && c.name === 'table' && !props.has('rowTag')) {
          insertBeforeClose(toks[o], toks[toks[o].close], `rowTag: '${ph}'`);
          inserted.push({ line: c.line, what: 'table() row' });
        }
        for (const key of (items && ITEM_KEYS[c.name]) || []) {
          const v = props.get(key);
          if (v == null || toks[v].t !== 'p' || toks[v].v !== '[') continue;
          for (const k of itemsIn(v, key === 'breadcrumbs' ? 'href' : null)) {
            itemTagged.add(k);
            insertBeforeClose(toks[k], toks[toks[k].close], `tag: '${ph}'`);
            inserted.push({ line: lineOfTok(toks[k].s), what: `${c.name}() ${key}[]` });
          }
        }
      }
      if (items && c.name === 'form' && o != null) {
        const props = objectProps(src, toks, o);
        if (props.has('onSubmit') && !props.has('submitTag') && !props.has('footer') && !wrappedSubmit) {
          insertBeforeClose(toks[o], toks[toks[o].close], `submitTag: '${ph}'`);
          inserted.push({ line: c.line, what: 'form() submit' });
        }
        if (props.has('cancel') && !props.has('cancelTag') && !props.has('footer')) {
          insertBeforeClose(toks[o], toks[toks[o].close], `cancelTag: '${ph}'`);
          inserted.push({ line: c.line, what: 'form() cancel' });
        }
      }
      const listArg = c.name === 'tabs' || c.name === 'form' ? c.args[0] : c.name === 'menuButton' ? c.args[1] : null;
      if (items && listArg && toks[listArg[0]].t === 'p' && toks[listArg[0]].v === '[' && toks[listArg[0]].close === listArg[1] - 1) {
        for (const k of itemsIn(listArg[0])) {
          itemTagged.add(k);
          insertBeforeClose(toks[k], toks[toks[k].close], `tag: '${ph}'`);
          inserted.push({ line: lineOfTok(toks[k].s), what: `${c.name}() items[]` });
        }
      }
      if (c.tagged) continue;
      const what = c.el ? `h('${c.el}')` : `${c.name}()`;
      const closeTok = toks[c.closeIdx];
      if (!closeTok) {
        skipped.push({ line: c.line, reason: `${what}: unbalanced call` });
        continue;
      }
      const insertProp = (argRange) => {
        const objOpen = toks[argRange[0]];
        insertBeforeClose(objOpen, toks[objOpen.close], `tag: '${ph}'`);
      };
      if (c.name === 'h') {
        const a1 = c.args[1];
        if (!a1) {
          insertBeforeClose(toks[c.openIdx], closeTok, `{ tag: '${ph}' }`);
        } else if (isObjectArg(toks, a1)) insertProp(a1);
        else {
          const t0 = toks[a1[0]];
          const single = a1[1] - a1[0] === 1;
          const childLike = (single && (t0.t === 'str' || t0.t === 'num')) || t0.t === 'tpl' || (t0.t === 'p' && t0.v === '[') || (t0.t === 'id' && toks[a1[0] + 1]?.t === 'p' && toks[a1[0] + 1].v === '(' && toks[a1[0] + 1].close === a1[1] - 1);
          if (!childLike) {
            skipped.push({ line: c.line, reason: `${what}: second argument may be props or children` });
            continue;
          }
          edits.push([t0.s, `{ tag: '${ph}' }, `]);
        }
      } else if (c.optPos != null && c.args[c.optPos] && isObjectArg(toks, c.args[c.optPos])) {
        insertProp(c.args[c.optPos]);
      } else if (c.optPos != null && c.args.length === c.optPos) {
        insertBeforeClose(toks[c.openIdx], closeTok, `{ tag: '${ph}' }`);
      } else {
        edits.push([c.start, `tagged('${ph}', `]);
        edits.push([closeTok.e, ')']);
        needsTagged = true;
      }
      inserted.push({ line: c.line, what });
    }
    // v12 tags (TG-6): مواصفات حقول النماذج المعرَّفة خارج استدعاء المكوّن ({ name: '…', label, type… } في قائمة حرفية:
    // دوال تُرجع الحقول، أو نوافذ محلية مثل formModal) — كل حقل وحدة واحدة (التسمية والعنصر والتلميح، T12-09)
    if (fields) {
      const FIELDISH = ['type', 'required', 'maxLength', 'options', 'hint', 'placeholder', 'rows', 'min', 'max', 'ltr', 'full', 'text', 'autocomplete'];
      const lines = src.split('\n');
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.t !== 'p' || t.v !== '{' || itemTagged.has(k) || t.close == null) continue;
        const par = toks[t.parent];
        // في قائمة حرفية، أو كائن تُرجعه دالة سهمية مباشرة (=> ({ name… }))
        const inArray = par && par.t === 'p' && par.v === '[';
        const arrowObj = par && par.t === 'p' && par.v === '(' && toks[t.parent - 1]?.v === '>' && toks[t.parent - 2]?.v === '=' && par.close === t.close + 1;
        if (!inArray && !arrowObj) continue;
        const before = toks[k - 1];
        if (before && before.t === 'p' && before.v === '...') continue;
        const props = objectProps(src, toks, k);
        if (props.has('tag') || props.has('data-tag')) continue;
        const nm = props.get('name');
        // زر إجراء في قائمة إجراءات معرَّفة خارج الاستدعاء (actions: sheetActions): { label, variant | onClick }
        const actionSpec = inArray && nm == null && props.has('label') && (props.has('variant') || props.has('onClick')) && !props.has('key') && !props.has('value');
        if (!actionSpec) {
          if (nm == null || toks[nm]?.t !== 'str' || !(props.has('label') || props.has('text'))) continue;
          if (!FIELDISH.some((q) => props.has(q))) continue;
        }
        const ty = props.get('type');
        if (ty != null && toks[ty]?.t === 'str' && src.slice(toks[ty].s + 1, toks[ty].e - 1) === 'hidden') continue;
        if (nm != null && toks[nm]?.t === 'str' && wrappedControls.has(src.slice(toks[nm].s + 1, toks[nm].e - 1))) continue;
        const ln = lineOfTok(t.s);
        if (/tags:skip/.test(lines[ln - 1] || '') || /tags:skip/.test(lines[ln - 2] || '')) continue;
        insertBeforeClose(t, toks[t.close], `tag: '${ph}'`);
        inserted.push({ line: ln, what: actionSpec ? 'action spec' : 'field spec' });
      }
    }
    if (needsTagged && !/import\s*\{[^}]*\btagged\b[^}]*\}/.test(src)) {
      const imp = /import\s*\{([^}]*)\}\s*from\s*(['"])([^'"]*\/lib\/h\.js|\.\/h\.js)\2/.exec(src);
      if (imp) {
        // يضيف tagged إلى استيراد h.js الموجود
        const braceEnd = imp.index + imp[0].indexOf('}');
        let at = braceEnd;
        while (at > 0 && /\s/.test(src[at - 1])) at--;
        edits.push([at, src[at - 1] === ',' ? ' tagged' : ', tagged']);
      } else {
        const fromDir = path.posix.dirname(rel);
        let relH = path.posix.relative(fromDir, 'public/assets/js/lib/h.js');
        if (!relH.startsWith('.')) relH = `./${relH}`;
        const lastImport = [...src.matchAll(/^import[^;]*;[ \t]*$/gm)].pop();
        const at = lastImport ? lastImport.index + lastImport[0].length : 0;
        edits.push([at, `${at ? '\n' : ''}import { tagged } from '${relH}';${at ? '' : '\n'}`]);
      }
    }
  }
  // التعديلات إدراجات فقط، تُطبَّق من النهاية إلى البداية (الثابت عند التساوي: ترتيب الإضافة معكوس)
  const ordered = edits.map((e, i) => [...e, i]).sort((a, b) => b[0] - a[0] || b[2] - a[2]);
  let out = src;
  for (const [pos, text] of ordered) out = out.slice(0, pos) + text + out.slice(pos);
  return { out, inserted, skipped };
}
