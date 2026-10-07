// v9.1 l-work — مقارنة نصين بلا مكتبات (L-13): LCS على الفقرات، ثم على الكلمات داخل الفقرات المعدّلة.
// وحدة خالصة بلا DOM (تُختبر في Node): العرض في pages/lawyer/write.js.
//
// الواجهة:
//   splitParagraphs(text) → string[]           الفقرة = سطر غير فارغ
//   wordDiff(a, b) → [{op:'same'|'add'|'del', text}]
//   diffParagraphs(oldText, newText) → { blocks:[{type:'same'|'added'|'removed'|'changed', text, old?, words?}], changed:number }
//     changed = عدد الفقرات المضافة أو المعدّلة أو المحذوفة

const MAX_CELLS = 4_000_000;

/** الفقرات: الأسطر غير الفارغة بعد إزالة المسافات الطرفية */
export function splitParagraphs(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** مقارنة للتطابق تتجاهل فروق المسافات */
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/**
 * نص التعديل بين قائمتين بأطول متتالية مشتركة.
 * @returns {Array<{op:'same'|'add'|'del', a?:number, b?:number}>}
 */
function lcsOps(a, b, eq = (x, y) => x === y) {
  const n = a.length;
  const m = b.length;
  // تقليم البداية والنهاية المتطابقتين (أغلب التعديلات محلية) قبل جدول LCS
  let start = 0;
  while (start < n && start < m && eq(a[start], b[start])) start++;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const ops = [];
  for (let i = 0; i < start; i++) ops.push({ op: 'same', a: i, b: i });
  const rows = endA - start;
  const cols = endB - start;
  if (rows * cols > MAX_CELLS) {
    // نص ضخم جدًا: نعرض الجزء الأوسط كحذف ثم إضافة بدل تجميد المتصفح
    for (let i = start; i < endA; i++) ops.push({ op: 'del', a: i });
    for (let j = start; j < endB; j++) ops.push({ op: 'add', b: j });
  } else {
    const w = cols + 1;
    const L = new Uint32Array((rows + 1) * w);
    for (let i = rows - 1; i >= 0; i--) {
      for (let j = cols - 1; j >= 0; j--) {
        L[i * w + j] = eq(a[start + i], b[start + j]) ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (eq(a[start + i], b[start + j])) {
        ops.push({ op: 'same', a: start + i, b: start + j });
        i++;
        j++;
      } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
        ops.push({ op: 'del', a: start + i });
        i++;
      } else {
        ops.push({ op: 'add', b: start + j });
        j++;
      }
    }
    for (; i < rows; i++) ops.push({ op: 'del', a: start + i });
    for (; j < cols; j++) ops.push({ op: 'add', b: start + j });
  }
  for (let k = 0; k < n - endA; k++) ops.push({ op: 'same', a: endA + k, b: endB + k });
  return ops;
}

const tokens = (s) => String(s || '').split(/\s+/).filter(Boolean);

/** فرق الكلمات بين فقرتين */
export function wordDiff(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  const out = [];
  for (const o of lcsOps(ta, tb)) {
    const text = o.op === 'add' ? tb[o.b] : ta[o.a];
    const last = out[out.length - 1];
    if (last && last.op === o.op) last.text += ` ${text}`;
    else out.push({ op: o.op, text });
  }
  return out;
}

/** نسبة الكلمات المشتركة بين فقرتين (لإقران فقرة محذوفة بفقرة مضافة على أنها «معدّلة») */
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const same = lcsOps(ta, tb).filter((o) => o.op === 'same').length;
  return (2 * same) / (ta.length + tb.length);
}

/**
 * مقارنة على مستوى الفقرات.
 * @returns {{ blocks: Array<{type:'same'|'added'|'removed'|'changed', text:string, old?:string, words?:Array}>, changed:number }}
 */
export function diffParagraphs(oldText, newText) {
  const a = splitParagraphs(oldText);
  const b = splitParagraphs(newText);
  const ops = lcsOps(a.map(norm), b.map(norm));
  const blocks = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].op === 'same') {
      blocks.push({ type: 'same', text: b[ops[k].b] });
      k++;
      continue;
    }
    // مجموعة متصلة من الحذف والإضافة: نقرن كل محذوفة بأقرب مضافة مشابهة فتُعرض «معدّلة» بكلماتها
    const dels = [];
    const adds = [];
    while (k < ops.length && ops[k].op !== 'same') {
      if (ops[k].op === 'del') dels.push(a[ops[k].a]);
      else adds.push(b[ops[k].b]);
      k++;
    }
    const usedDel = new Set();
    for (const add of adds) {
      let best = -1;
      let bestScore = 0.3;
      dels.forEach((d, idx) => {
        if (usedDel.has(idx)) return;
        const s = similarity(d, add);
        if (s >= bestScore) {
          best = idx;
          bestScore = s;
        }
      });
      if (best >= 0) {
        usedDel.add(best);
        blocks.push({ type: 'changed', text: add, old: dels[best], words: wordDiff(dels[best], add) });
      } else blocks.push({ type: 'added', text: add });
    }
    dels.forEach((d, idx) => {
      if (!usedDel.has(idx)) blocks.push({ type: 'removed', text: d });
    });
  }
  return { blocks, changed: blocks.filter((x) => x.type !== 'same').length };
}
