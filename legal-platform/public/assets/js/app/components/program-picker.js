// اختيار برنامج التمويل للملف — (الإصدار 9 — وحدة programs)
// programSelect(): حقل اختيار البرنامج في نافذة تحويل الطلب إلى ملف.
// caseProgramField(): سطر «برنامج التمويل» في بطاقة متابعة الملف (عرض + تغيير/إلغاء الربط).
// الملف ينتمي لبرنامج واحد على الأكثر، والملفات المستمرة تتبع برنامج ملفها الأصلي.

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { money, percent, date, areaLabel } from '../../lib/fmt.js';
import { badge, button, toast, modal, field, alertBox, errorMessage, confirmDialog, codeTag, icon, loading } from '../../lib/ui.js';

/** درجات ألوان نوع التمويل وحالة البرنامج */
export const FUNDER_TONES = { grant: 'info', zakat: 'success', csr: 'accent', donor: 'primary', internal: 'neutral' };
export const PROGRAM_STATUS_TONES = { planned: 'info', active: 'success', suspended: 'warning', closed: 'muted' };
export const FORECAST_TONES = { on_track: 'success', underspend: 'info', overspend_risk: 'warning', exhausted: 'danger', not_started: 'neutral', no_budget: 'muted' };

export function funderBadge(p) {
  return badge(p.funder_type_label || p.funder_type, FUNDER_TONES[p.funder_type] || 'neutral');
}
export function programStatusBadge(p) {
  return badge(p.status_label || p.status, PROGRAM_STATUS_TONES[p.status] || 'neutral', { dot: true });
}

let optionsCache = null;
/** خيارات البرامج غير المغلقة (تُحمّل مرة واحدة لكل صفحة) */
export function loadProgramOptions({ force = false } = {}) {
  if (!optionsCache || force) {
    optionsCache = api.get('/programs/options').catch((err) => {
      optionsCache = null;
      throw err;
    });
  }
  return optionsCache;
}

function optionLabel(p) {
  return `${p.code} — ${p.name}${p.status !== 'active' ? ` (${p.status_label})` : ''}`;
}

/** ملاحظات الأهلية المتوقعة لملف بمجال ومحافظة معينين (للتنبيه فقط؛ القرار في الخادم) */
export function eligibilityHints(p, { area, governorate } = {}) {
  if (!p) return [];
  const out = [...(p.warnings || [])];
  if (area && p.eligible_areas?.length && !p.eligible_areas.includes(area)) out.push(`مجال «${areaLabel(area)}» ليس من المجالات المشمولة بالبرنامج`);
  if (p.eligible_governorates?.length) {
    if (!governorate) out.push(`البرنامج مقصور على: ${p.eligible_governorates.join('، ')}`);
    else if (!p.eligible_governorates.includes(governorate)) out.push(`محافظة «${governorate}» خارج النطاق الجغرافي للبرنامج`);
  }
  if (p.utilization != null && p.utilization >= 1) out.push('استُنفدت ميزانية البرنامج');
  return out;
}

/**
 * حقل اختيار البرنامج (اختياري) لنموذج التحويل.
 * @returns {{el:HTMLElement, get:()=>number|null, setContext:(c:{area?:string, governorate?:string})=>void}}
 */
export function programSelect({ value = null, area = null, governorate = null, label = 'برنامج التمويل (اختياري)' } = {}) {
  let ctx = { area, governorate };
  let programs = [];
  const sel = h('select.input', { disabled: true }, h('option', { value: '' }, 'جارٍ تحميل البرامج…'));
  const note = h('div.pg-pick-note', { 'aria-live': 'polite' });
  const wrap = field(label, h('div.select-wrap', sel), {
    hint: 'يُحتسب ما يُصرف على الملف وملفه المستمر ضمن ميزانية البرنامج المختار. يمكن تغييره لاحقًا من صفحة الملف.',
    full: true,
  });
  wrap.append(note);

  function drawNote() {
    const p = programs.find((x) => String(x.id) === sel.value);
    if (!p) {
      mount(note);
      return;
    }
    const hints = eligibilityHints(p, ctx);
    mount(
      note,
      h(
        'p.small',
        { class: hints.length ? 'pg-text-warning' : 'muted' },
        hints.length ? [icon('alert', { size: 14 }), ` ${hints.join(' — ')}. يُربط الملف بقرار الإدارة رغم ذلك.`] : `${p.funder_name} — المصروف ${money(p.spend)} من ${money(p.budget)}${p.utilization != null ? ` (${percent(p.utilization)})` : ''}`,
      ),
    );
  }
  sel.addEventListener('change', drawNote);

  // تحميل جديد عند كل فتح للنموذج: برنامج أُنشئ أو أُغلق للتو يظهر أو يختفي دون إعادة تحميل الصفحة
  loadProgramOptions({ force: true })
    .then((list) => {
      programs = list || [];
      mount(
        sel,
        h('option', { value: '' }, programs.length ? 'دون برنامج' : 'لا توجد برامج متاحة'),
        programs.map((p) => h('option', { value: String(p.id) }, optionLabel(p))),
      );
      sel.disabled = !programs.length;
      if (value) sel.value = String(value);
      drawNote();
    })
    .catch((err) => {
      mount(sel, h('option', { value: '' }, 'تعذر تحميل البرامج'));
      mount(note, h('p.small.pg-text-warning', errorMessage(err)));
    });

  return {
    el: wrap,
    get: () => (sel.value ? Number(sel.value) : null),
    setContext(c = {}) {
      ctx = { ...ctx, ...c };
      drawNote();
    },
  };
}

/**
 * ربط ملف ببرنامج مع معالجة ردود الخادم: خارج الأهلية ← تأكيد صريح ثم إعادة المحاولة.
 * @returns {Promise<object|null>} النتيجة أو null عند الإلغاء
 */
export async function linkWithConfirm(send) {
  try {
    return await send({});
  } catch (err) {
    const d = err && err.details;
    if (err && err.status === 409 && d && d.reason === 'ineligible') {
      const ok = await confirmDialog({
        title: 'الملف خارج نطاق أهلية البرنامج',
        message: h('div', h('p', 'لاحظ النظام ما يلي:'), h('ul.pg-reasons', (d.reasons || []).map((r) => h('li', r))), h('p', 'هل تريد ربط الملف بالبرنامج رغم ذلك؟ يُسجَّل القرار في سجل الملف.')),
        confirmLabel: 'نعم، اربط الملف',
      });
      if (!ok) return null;
      return send({ confirm_ineligible: true });
    }
    if (err && err.status === 409 && d && d.reason === 'already_linked') {
      const cur = d.current_program || {};
      const ok = await confirmDialog({
        title: 'الملف مرتبط ببرنامج آخر',
        message: `الملف مرتبط حاليًا ببرنامج ${cur.code || ''} «${cur.name || ''}». الملف ينتمي لبرنامج واحد فقط؛ هل تريد نقله إلى هذا البرنامج؟`,
        confirmLabel: 'نعم، انقل الملف',
      });
      if (!ok) return null;
      try {
        return await send({ move: true });
      } catch (err2) {
        if (err2 && err2.status === 409 && err2.details && err2.details.reason === 'ineligible') return linkWithConfirm((extra) => send({ move: true, ...extra }));
        throw err2;
      }
    }
    throw err;
  }
}

/**
 * سطر «برنامج التمويل» في صفحة الملف: يعرض البرنامج الحالي ويتيح للإدارة تغييره أو إلغاء الربط.
 * @param {{caseId:number, closed?:boolean, onChange?:(res:object)=>void}} opts
 */
export function caseProgramField({ caseId, closed = false, onChange } = {}) {
  const host = h('div.pg-case-program', loading('جارٍ التحميل…'));
  let current = null;

  function draw() {
    const p = current && current.program;
    const hints = (current && current.eligibility) || [];
    // الملف المغلق يمكن نسبته لبرنامج لاحقًا (تقارير الجهات الممولة تشمل الملفات المنجزة)،
    // أما ملفات البرنامج المغلق فنهائية حتى يُعيد مدير النظام فتحه
    const programClosed = p && p.status === 'closed';
    const changeBtn = programClosed
      ? null
      : button(p ? 'تغيير' : 'ربط ببرنامج', { size: 'sm', variant: 'ghost', icon: p ? 'edit' : 'link', onClick: openDialog, className: 'no-print', title: closed ? 'الملف مغلق؛ يمكن نسبته لبرنامج لأغراض التقارير' : null });
    mount(
      host,
      p
        ? h(
            'div.pg-case-program-row',
            h('a.pg-case-program-link', { href: `#/programs/${p.id}` }, codeTag(p.code), h('span', p.name)),
            h('span.pg-inline', funderBadge(p), p.status !== 'active' && programStatusBadge(p)),
            hints.length > 0 && h('span.small.pg-text-warning', icon('alert', { size: 13 }), ` ${hints.join(' — ')}`),
            programClosed && h('span.small.muted', 'البرنامج مغلق؛ لا يتغير ربط ملفاته إلا بعد إعادة فتحه'),
            changeBtn,
          )
        : h('div.pg-case-program-row', h('span.muted', 'غير مرتبط بأي برنامج تمويل'), changeBtn),
    );
  }

  async function load() {
    try {
      current = await api.get(`/programs/case/${encodeURIComponent(caseId)}`);
      draw();
    } catch (err) {
      mount(host, h('span.small.muted', errorMessage(err)));
    }
  }

  async function openDialog() {
    let programs = [];
    try {
      programs = await loadProgramOptions({ force: true });
    } catch (err) {
      toast(errorMessage(err), 'danger');
      return;
    }
    const cur = current && current.program;
    const sel = h(
      'select.input',
      h('option', { value: '' }, 'دون برنامج (إلغاء الربط)'),
      programs.map((p) => h('option', { value: String(p.id) }, optionLabel(p))),
    );
    if (cur) sel.value = String(cur.id);
    const info = h('div.pg-pick-note');
    const drawInfo = () => {
      const p = programs.find((x) => String(x.id) === sel.value);
      if (!p) {
        mount(info, cur ? alertBox('سيُلغى ربط الملف بالبرنامج، ولن يُحتسب إنفاقه ضمن أي برنامج.', 'warning') : null);
        return;
      }
      mount(
        info,
        h(
          'dl.kv.pg-pick-kv',
          h('div.kv-row', h('dt', 'الجهة الممولة'), h('dd', p.funder_name, ' ', funderBadge(p))),
          h('div.kv-row', h('dt', 'المدة'), h('dd', `${date(p.start_date)} — ${p.end_date ? date(p.end_date) : 'مفتوحة'}`)),
          h('div.kv-row', h('dt', 'الميزانية'), h('dd', `المصروف ${money(p.spend)} من ${money(p.budget)}${p.utilization != null ? ` (${percent(p.utilization)})` : ''}`)),
          p.eligible_areas.length > 0 && h('div.kv-row', h('dt', 'المجالات المشمولة'), h('dd', p.eligible_areas.map(areaLabel).join('، '))),
          p.eligible_governorates.length > 0 && h('div.kv-row', h('dt', 'المحافظات المشمولة'), h('dd', p.eligible_governorates.join('، '))),
        ),
        (p.warnings || []).length ? alertBox(p.warnings.join(' — '), 'warning') : null,
      );
    };
    sel.addEventListener('change', drawInfo);
    drawInfo();
    modal({
      title: 'برنامج التمويل للملف',
      size: 'md',
      body: h(
        'div.stack',
        h('p.modal-intro', 'يُحتسب ما يُصرف على هذا الملف (أتعاب المحامين ومصروفات المؤسسة، وملفه المستمر إن وُجد) ضمن ميزانية البرنامج المختار وتقاريره للجهة الممولة. هذه بيانات داخلية للإدارة ولا تظهر للمحامين.'),
        field('البرنامج', h('div.select-wrap', sel), { full: true }),
        info,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حفظ',
          variant: 'primary',
          onClick: async () => {
            const pid = sel.value ? Number(sel.value) : null;
            if ((cur ? cur.id : null) === pid) return undefined;
            const res = await linkWithConfirm((extra) => api.put(`/programs/case/${encodeURIComponent(caseId)}`, { program_id: pid, ...extra }));
            if (!res) return false;
            current = res;
            draw();
            toast(pid ? `رُبط الملف ببرنامج ${res.program ? res.program.code : ''}` : 'أُلغي ربط الملف بالبرنامج', 'success');
            if (onChange) onChange(res);
            return undefined;
          },
        },
      ],
    });
  }

  load();
  return host;
}
