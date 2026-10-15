// v12 staff-lines (SL-0/SL-2/SL-3، §5.7، L12-81): «مسار الطلب» في منصة الفريق — نوع الطلب (استشارة / دعوى قضائية / شركات)
// ثم المجال أو الوضع ثم الموضوع، كما اختاره صاحب الطلب في الصفحة الأولى أو قائمة واتساب، أو كما حدده الفريق.
// كلمات محايدة بلا ألوان نوع الخدمة (الذهبي والأخضر لـ«خيري» و«أفراد وشركات» وحدهما). الكلمات تأتي من الخادم
// (pathway_labels، كتلة pathway)؛ ورقة التعديل وحدها تستورد entry-tree.js عند فتحها (L12-24). لا شيء من هذا للمحامين.

import { h, tagged } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { modal, field, toast, errorMessage } from '../../lib/ui.js';

export const NO_PATHWAY_LABEL = 'لم يُحدَّد النوع';
export const PATH_KEY = 'المسار:';
export const PATH_SEP = ' › ';
export const SHEET_TITLE = 'مسار الطلب';
export const SHEET_ERROR = 'اختاروا مسارًا صحيحًا أو اتركوه دون تحديد.';
// خيارات مرشح «كل الأنواع» (INB-01…06) — الكلمات نفسها LINES[*].staff في entry-tree.js
export const LINE_FILTER_ALL = 'كل الأنواع';
export const LINE_FILTER_OPTIONS = [
  { value: 'consultation', label: 'استشارة' },
  { value: 'litigation', label: 'دعوى قضائية' },
  { value: 'company', label: 'شركات' },
  { value: 'none', label: NO_PATHWAY_LABEL },
];
export const LINE_VALUES = LINE_FILTER_OPTIONS.map((o) => o.value);

/** كلمات المسار للفريق: مصفوفة من الصف (pathway_labels) أو من الكتلة (staff_labels) */
function staffLabelsOf(x) {
  if (!x) return [];
  if (Array.isArray(x.pathway_labels)) return x.pathway_labels.filter(Boolean);
  if (Array.isArray(x.staff_labels)) return x.staff_labels.filter(Boolean);
  return [];
}

/** رقاقة نوع الطلب في ترويسة الطلب («استشارة» · «دعوى» · «شركات»، أول كلمات المسار) أو null بلا مسار. x = صف أو كتلة */
export function lineChip(x) {
  const labels = staffLabelsOf(x);
  if (!labels.length) return null;
  return h('span.line-chip', { tag: 'PTH-01', title: labels.join(PATH_SEP) }, labels[0]);
}

/** مسار الطلب في صف صندوق الوارد: «استشارة › الأسرة والميراث › الطلاق أو الخلع» أو null */
export function linePath(row) {
  const labels = staffLabelsOf(row);
  if (!labels.length) return null;
  return h('span.line-path', { tag: 'PTH-04' }, labels.join(PATH_SEP));
}

/**
 * طلب بلا مسار له مجال قانوني: «مقترح: {النوع}» رمادي + «تأكيد» بضغطة واحدة (PUT …/pathway { path: <line>, reason: 'suggested' }).
 * row.suggested_line + row.suggested_line_label من الخادم. onConfirm(result) بعد الحفظ. withButton=false: النص وحده
 * (داخل رابط صف القائمة لا يوضع زر).
 */
export function suggestRow(row, { onConfirm, withButton = true } = {}) {
  if (!row || row.pathway || !row.suggested_line) return null;
  const text = h('span.line-path.line-path--suggest', { tag: 'PTH-05' }, `مقترح: ${row.suggested_line_label || row.suggested_line}`);
  if (!withButton) return text;
  const btn = h(
    'button.btn-link',
    {
      type: 'button',
      tag: 'PTH-06',
      'aria-label': `تأكيد نوع الطلب: ${row.suggested_line_label || row.suggested_line}`,
      onClick: async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        try {
          const res = await api.put(`/admin/intakes/${row.id}/pathway`, { path: row.suggested_line, reason: 'suggested' });
          toast('تم تحديد نوع الطلب', 'success');
          if (onConfirm) await onConfirm(res);
        } catch (err) {
          btn.disabled = false;
          toast(errorMessage(err), 'danger');
        } finally {
          btn.removeAttribute('aria-busy');
        }
      },
    },
    'تأكيد',
  );
  return h('span.line-suggest', text, ' ', btn);
}

/**
 * سطر المسار تحت عنوان الطلب: «المسار: استشارة › الأسرة والميراث › الطلاق أو الخلع · من الموقع» + «تعديل»،
 * وبلا مسار: «المسار: لم يُحدَّد النوع» + «تحديد». onEdit = null يخفي الزر.
 */
export function pathLine(block, { onEdit } = {}) {
  const labels = staffLabelsOf(block);
  const has = labels.length > 0;
  return h(
    'p.path-line',
    { tag: 'PTH-02' },
    h('span.path-line__k', PATH_KEY),
    ' ',
    has ? labels.join(PATH_SEP) : NO_PATHWAY_LABEL,
    has && block.source_label ? [' ', h('span.path-line__src', `· ${block.source_label}`)] : null,
    onEdit ? [' ', h('button.btn-link', { type: 'button', tag: 'PTH-03', onClick: () => onEdit() }, has ? 'تعديل' : 'تحديد')] : null,
  );
}

// ───────────── ورقة «مسار الطلب» (P1، E12-51): ثلاث قوائم متتالية من entry-tree.js ─────────────

let treeMod = null;
const loadTree = () => (treeMod ||= import('../../public/entry-tree.js'));

/**
 * يفتح ورقة تعديل المسار. intake = { id, pathway (كتلة أو null) }. onSaved(result) بعد الحفظ.
 * القائمة الأولى «نوع الطلب» (والخيار «لم يُحدَّد النوع» يمسح المسار)، ثم «المجال أو الوضع»، ثم «الموضوع» حين يكون للاختيار
 * صفحة تحته. مخارج الشجرة (الدخول إلى بوابة الشركات) ليست مسارًا. «السبب (اختياري)» ≤ 300 حرف.
 */
export async function openPathwaySheet(intake, { onSaved } = {}) {
  let tree;
  try {
    tree = await loadTree();
  } catch (err) {
    toast(errorMessage(err), 'danger');
    return null;
  }
  const { LINES, pageOf } = tree;
  const current = (intake && intake.pathway && intake.pathway.path) || '';
  const segs = current ? current.split('/') : [];
  const optionsOf = (path) => {
    const p = pageOf(path);
    return p ? p.options.filter((o) => o.kind !== 'exit') : [];
  };
  const mkSelect = (tag, items, value, blank) =>
    h(
      'select.input',
      { tag, value },
      h('option', { value: '' }, blank),
      items.map((o) => h('option', { value: o.value }, o.label)),
    );

  const lineSel = mkSelect(
    'PTH-08',
    Object.entries(LINES).map(([k, l]) => ({ value: k, label: l.staff })),
    segs[0] || '',
    NO_PATHWAY_LABEL,
  );
  const areaHost = h('div');
  const topicHost = h('div');
  const reason = h('textarea.input', { tag: 'PTH-11', rows: 2, maxLength: 300 });
  const err = h('p.field-error', { tag: 'PTH-14', role: 'alert', hidden: true }, SHEET_ERROR);
  let areaSel = null;
  let topicSel = null;

  function drawTopic(preset = '') {
    topicSel = null;
    topicHost.replaceChildren();
    const a = areaSel && areaSel.value;
    if (!a) return;
    const opts = optionsOf(a);
    if (!opts.length) return;
    topicSel = mkSelect('PTH-10', opts.map((o) => ({ value: o.path, label: o.label })), preset, '—');
    topicHost.append(field('الموضوع', h('div.select-wrap', topicSel)));
  }
  function drawArea(preset = '', presetTopic = '') {
    areaSel = null;
    areaHost.replaceChildren();
    topicHost.replaceChildren();
    const line = lineSel.value;
    if (!line) return;
    const opts = optionsOf(line);
    areaSel = mkSelect('PTH-09', opts.map((o) => ({ value: o.path, label: o.label })), preset, '—');
    areaSel.addEventListener('change', () => drawTopic());
    areaHost.append(field('المجال أو الوضع', h('div.select-wrap', areaSel)));
    drawTopic(presetTopic);
  }
  lineSel.addEventListener('change', () => drawArea());
  drawArea(segs.length > 1 ? segs.slice(0, 2).join('/') : '', segs.length > 2 ? segs.slice(0, 3).join('/') : '');

  const chosen = () => (topicSel && topicSel.value) || (areaSel && areaSel.value) || lineSel.value || null;
  let saved = null;
  const m = modal({
    title: SHEET_TITLE,
    sheet: true,
    className: 'pth-sheet',
    body: h('div.stack', { tag: 'PTH-07' }, field('نوع الطلب', h('div.select-wrap', lineSel)), areaHost, topicHost, field('السبب (اختياري)', reason), err),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'حفظ',
        variant: 'primary',
        onClick: async () => {
          err.hidden = true;
          const path = chosen();
          try {
            saved = await api.put(`/admin/intakes/${intake.id}/pathway`, { path, reason: reason.value.trim() || undefined });
          } catch (e) {
            if (e && e.details && e.details.fields && e.details.fields.path) {
              err.hidden = false;
              return false;
            }
            throw e;
          }
          toast('تم حفظ مسار الطلب', 'success');
          if (onSaved) await onSaved(saved);
          return undefined;
        },
      },
    ],
  });
  if (m && m.buttons) {
    tagged('PTH-13', m.buttons[0]);
    tagged('PTH-12', m.buttons[1]);
  }
  return m;
}
