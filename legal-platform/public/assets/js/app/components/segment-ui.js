// v11 segment-staff (ST-0) — أدوات واجهة «نوع الخدمة» للإدارة: «خيري» / «أفراد وشركات» / «شركة» / «غير محدد».
// عقد المسار (§10.1 ST-0): رقاقة النوع، مفتاح التصفية، رأس الإرسال «سيُرسل من»، ورقة تغيير النوع، بطاقة «غير محدد»،
// رقائق الاقتراح واختلاف الرقم، وورقة «إضافة أتعاب» لملف الأفراد.
// القواعد (L11-16 r2، §10.3): لون واحد لكل نوع في كل مكان — الذهبي = خيري، الأخضر = أفراد/شركة؛ الأزرق والبرتقالي
// للحالات فقط. الرقاقة غير تفاعلية ودائمًا نص + أيقونة (لا تعتمد على اللون وحده). لا شيء من هذا في صفحات المحامين.

import { h, frag, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label as metaLabel, cairoToday, cairoDateToIso } from '../../lib/fmt.js';
import { icon, iconNames, modal, field, button, toast, errorMessage, discardGuard, uid } from '../../lib/ui.js';

export const SEGMENT_VALUES = ['charity', 'paid'];

// نسخة احتياطية من مسميات الخادم (LABELS في src/constants.js) — تُقدَّم مسميات /api/meta دائمًا إن وُجدت
const FALLBACK = {
  segment: { charity: 'خيري', paid: 'أفراد وشركات' },
  segment_short: { charity: 'خيري', paid: 'أفراد' },
  segment_long: { charity: 'خيري — مساعدة مجانية', paid: 'أفراد وشركات — خدمة بأتعاب' },
  segment_tone: { charity: 'بأسلوب الخيري', paid: 'بأسلوب الأفراد والشركات', neutral: 'بأسلوب محايد' },
  segment_reason_codes: { not_eligible: 'غير مستحق للخيري', wrong_choice: 'اختار النوع الخطأ', company: 'طلب شركة' },
  wa_line: { main: 'الرقم الأساسي', paid: 'رقم الأفراد والشركات', unknown: 'رقم غير مضبوط' },
};
export const UNSET_LABEL = 'غير محدد';
export const COMPANY_LABEL = 'شركة';
export const COMPANY_LEAD_LABEL = 'شركة — طلب عرض';
export const LEGACY_SOURCE_LABEL = 'قبل الإصدار 11 (خيري)';
export const SEGMENT_TITLE = 'نوع الخدمة';
export const NO_AMOUNT_NOTE = 'لن يُطلب أي مبلغ إلا بموافقة صريحة من العميل على صفحة طلبه.';
export const ANALYSIS_SAME_NOTE = 'لا يتغير التحليل؛ يتغير أسلوب الرسائل والحسابات فقط.';
export const FEES_NOT_AGREED = 'لم يوافق العميل على الأتعاب بعد';
export const PAID_CASE_NOTE = 'ملف مدفوع: لا يُسجَّل تطوعيًا ولا يُربط ببرنامج تمويل.';
export const ON_CASE_HINT = 'غيّروا نوع الخدمة من صفحة الملف.';
export const REQUIRED_TEXT = 'اختاروا نوع الخدمة أولًا.';

/** مسمى من LABELS[group][key] (meta أولًا ثم النسخة الاحتياطية) */
export function segLabel(group, key) {
  if (key == null || key === '') return null;
  const v = metaLabel(group, key);
  if (v && v !== String(key) && v !== '—') return v;
  return (FALLBACK[group] && FALLBACK[group][key]) || String(key);
}

/** قيمة صالحة 'charity' | 'paid' أو null */
export function parseSeg(v) {
  return SEGMENT_VALUES.includes(v) ? v : null;
}

function glyph(name, size = 14) {
  // ui.js قد لا يعرف «heart» في نسخة أقدم: درع بعلامة صح بدلًا منه (§10.1 ST-0)
  const n = iconNames.includes(name) ? name : name === 'heart' ? 'shieldCheck' : 'dot';
  return icon(n, { size, className: 'seg-glyph' });
}

/** تعريف الرقاقة لقيمة/ملف: { kind, text, iconName, long } */
export function chipSpec(value, { company = false, requesterKind = null, size = 'short' } = {}) {
  if (company) return { kind: 'company', text: COMPANY_LABEL, iconName: 'building', long: segLabel('segment_long', 'paid') };
  if (requesterKind === 'company') return { kind: 'company', text: COMPANY_LEAD_LABEL, iconName: 'building', long: segLabel('segment_long', 'paid') };
  const v = parseSeg(value);
  if (!v) return { kind: 'unset', text: UNSET_LABEL, iconName: 'helpCircle', long: UNSET_LABEL };
  const group = size === 'long' ? 'segment_long' : size === 'label' ? 'segment' : 'segment_short';
  return { kind: v, text: segLabel(group, v), iconName: v === 'charity' ? 'heart' : 'briefcase', long: segLabel('segment_long', v) };
}

/**
 * رقاقة نوع الخدمة (L11-16 r2): «خيري» ذهبية بقلب ممتلئ، «أفراد» و«شركة» خضراء بحقيبة/مبنى، «غير محدد» محايدة بحد متقطع.
 * @param {'charity'|'paid'|null} value
 * @param {{source?:string, sourceLabel?:string, requesterKind?:string, company?:boolean, size?:'short'|'label'|'long', className?:string}} [opts]
 */
export function segmentChip(value, opts = {}) {
  const spec = chipSpec(value, opts);
  const src = opts.sourceLabel || (opts.source ? segLabel('segment_source', opts.source) : spec.kind === 'charity' && opts.source === null ? LEGACY_SOURCE_LABEL : null);
  const title = [spec.long, src].filter(Boolean).join(' · ');
  return h(
    'span.pill.seg-chip',
    { class: [`seg-chip--${spec.kind}`, opts.className], title, dataset: { seg: spec.kind } },
    glyph(spec.iconName),
    h('span.seg-chip-text', spec.text),
  );
}

/** «المقترح: أفراد وشركات» — اقتراح لا يُطبَّق (حبة محايدة منفصلة عن رقاقة النوع) */
export function hintChip(hint) {
  const v = hint && parseSeg(hint.segment);
  if (!v) return null;
  const reasons = Array.isArray(hint.reasons) ? hint.reasons.filter(Boolean) : [];
  return h(
    'span.pill.pill-neutral.seg-hint',
    { title: reasons.length ? `اقتراح لا يُطبَّق تلقائيًا: ${reasons.join('، ')}` : 'اقتراح لا يُطبَّق تلقائيًا' },
    icon('sparkle', { size: 14 }),
    h('span', `المقترح: ${segLabel('segment', v)}`),
  );
}

/** r2 S14: طلب خيري يقول نصه إنه أفراد/شركة — «يبدو أفراد وشركات — {reasons}» (لا يُطبَّق) */
export function mismatchChip(hint) {
  const v = hint && parseSeg(hint.segment || 'paid');
  if (!hint || !v) return null;
  const reasons = Array.isArray(hint.reasons) ? hint.reasons.filter(Boolean) : [];
  return h(
    'span.pill.pill-neutral.seg-mismatch',
    { title: 'اقتراح من نص الطلب لا يُطبَّق تلقائيًا — غيّروا النوع من «تغيير» إن لزم' },
    icon('sparkle', { size: 14 }),
    h('span', `يبدو ${segLabel('segment', v)}${reasons.length ? ` — ${reasons.join('، ')}` : ''}`),
  );
}

/** r2 S7: «كتب على رقم الأفراد والشركات» / «كتب على الرقم الأساسي» */
export function lineMismatchChip(line) {
  const key = line && typeof line === 'object' ? line.line : line;
  if (!key) return null;
  const text = (line && line.line_label) || (key === 'paid' ? 'كتب على رقم الأفراد والشركات' : 'كتب على الرقم الأساسي');
  return h('span.pill.pill-neutral.seg-line', { title: 'وصلت الرسالة على رقم الجانب الآخر وأُلحقت بآخر طلب مفتوح له — يمكن فصلها بـ «اعمل منها طلب جديد»' }, icon('whatsapp', { size: 14 }), h('span', text));
}

/** r2 S8: «وصلت على رقم غير مضبوط (…{last4})» */
export function unknownLineText(last4) {
  return `وصلت على رقم غير مضبوط (…${last4 || '????'})`;
}

export function unknownLineChip(last4) {
  return h('span.pill.pill-neutral.seg-line.is-unknown', icon('alert', { size: 14 }), h('span', unknownLineText(last4)));
}

/**
 * سطر المصدر في ترويسة الطلب: «أفراد وشركات · رقم واتساب المخصص»
 * @param {{value, label?, source?, source_label?}} block كتلة segment من الخادم
 */
export function sourceLine(block = {}) {
  const v = parseSeg(block.value);
  const name = v ? segLabel('segment', v) : UNSET_LABEL;
  const src = block.source_label || (block.source ? segLabel('segment_source', block.source) : v === 'charity' ? LEGACY_SOURCE_LABEL : null);
  return [name, src].filter(Boolean).join(' · ');
}

/** مصدر النوع وحده (بجوار الرقاقة): «رقم واتساب المخصص»، أو «وصلت على الرقم الأساسي» لطلب غير محدد */
export function sourceText(block = {}) {
  const v = parseSeg(block.value);
  if (block.source_label) return block.source_label;
  if (block.source) return segLabel('segment_source', block.source);
  if (v === 'charity') return LEGACY_SOURCE_LABEL;
  // الرقم غير المضبوط له رقاقته الخاصة (unknownLineChip)
  return block.wa_line_label && block.wa_line !== 'unknown' ? `وصلت على ${block.wa_line_label}` : null;
}

// ───────────── مفتاح التصفية «الكل · خيري · أفراد وشركات · غير محدد» ─────────────

/**
 * مفتاح نوع الخدمة (`.segmented`، أهداف ≥ 44px، الأعداد هادئة).
 * compact: true = مسميات قصيرة بلا أيقونات (تحت 600px)؛ 'auto' (الافتراضي) = الاثنان والـ CSS يختار حسب العرض.
 * @param {{value?:string, counts?:{charity?:number, paid?:number, unset?:number}, onChange?:(v:string)=>void, withUnset?:boolean,
 *          compact?:boolean|'auto', label?:string}} opts  value: '' | 'charity' | 'paid' | 'unset'
 */
export function segmentSwitch({ value = '', counts = null, onChange, withUnset = true, compact = 'auto', label: aria = SEGMENT_TITLE } = {}) {
  const el = h('div.segmented.seg-switch', { role: 'group', 'aria-label': aria, class: compact === true && 'is-compact' });
  let cur = value || '';
  let cnt = counts || {};
  const OPTS = [
    { key: '', full: 'الكل', short: 'الكل', icon: null },
    { key: 'charity', full: segLabel('segment', 'charity'), short: segLabel('segment_short', 'charity'), icon: 'heart' },
    { key: 'paid', full: segLabel('segment', 'paid'), short: segLabel('segment_short', 'paid'), icon: 'briefcase' },
    withUnset && { key: 'unset', full: UNSET_LABEL, short: UNSET_LABEL, icon: 'helpCircle' },
  ].filter(Boolean);
  const n = (k) => (k === '' ? ['charity', 'paid', 'unset'].reduce((s, x) => s + (Number(cnt[x]) || 0), 0) : Number(cnt[k]) || 0);
  function draw() {
    mount(
      el,
      OPTS.map((o) => {
        const num = counts ? n(o.key) : null;
        // «غير محدد» يُظهر عدده متى كان > 0 (والباقي دائمًا)
        const showNum = num != null && (o.key !== 'unset' || num > 0);
        const text =
          compact === true
            ? h('span.seg-l', o.short)
            : o.full === o.short
              ? h('span.seg-l', o.full)
              : [h('span.seg-l.seg-l-full', o.full), h('span.seg-l.seg-l-short', { 'aria-hidden': 'true' }, o.short)];
        return h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(cur === o.key),
            dataset: { seg: o.key || 'all' },
            class: o.key && `seg-opt--${o.key}`,
            'aria-label': compact === true || o.full === o.short ? null : `${o.full}${showNum ? ` (${num})` : ''}`,
            onClick: () => {
              if (cur === o.key) return;
              cur = o.key;
              draw();
              if (onChange) onChange(cur);
            },
          },
          compact !== true && o.icon ? glyph(o.icon, 16) : null,
          text,
          showNum ? h('span.count-quiet.seg-n', String(num)) : null,
        );
      }),
    );
  }
  el.update = ({ value: v, counts: c } = {}) => {
    if (v !== undefined) cur = v || '';
    if (c !== undefined) cnt = c || {};
    draw();
  };
  el.getValue = () => cur;
  draw();
  return el;
}

/** مفتاح الملفات «الكل · خيري · أفراد · شركات» (ST-4): خيري = segment=charity؛ أفراد = segment=paid&line=b2c؛ شركات = line=b2b */
export const CASE_SEGMENT_FILTERS = [
  { key: '', label: 'الكل', icon: null, query: {} },
  { key: 'charity', label: 'خيري', icon: 'heart', query: { segment: 'charity' } },
  { key: 'paid', label: 'أفراد', icon: 'briefcase', query: { segment: 'paid', line: 'b2c' } },
  { key: 'company', label: 'شركات', icon: 'building', query: { line: 'b2b' } },
];

/** مفتاح ملف من الرابط: ?seg=charity|paid|company (ومن الرابط القديم ?line=b2c|b2b) */
export function caseFilterKey(query = {}) {
  const s = String(query.seg || '');
  if (CASE_SEGMENT_FILTERS.some((f) => f.key && f.key === s)) return s;
  if (query.line === 'b2b') return 'company';
  if (query.segment === 'charity') return 'charity';
  if (query.segment === 'paid' || query.line === 'b2c') return query.segment === 'paid' ? 'paid' : '';
  return '';
}

/** معاملات GET /api/admin/cases|matters لمفتاح الملفات */
export function caseFilterQuery(key) {
  const f = CASE_SEGMENT_FILTERS.find((x) => x.key === key) || CASE_SEGMENT_FILTERS[0];
  return { ...f.query };
}

export function caseSegmentSwitch({ value = '', onChange, label: aria = SEGMENT_TITLE } = {}) {
  const el = h('div.segmented.seg-switch.seg-switch--cases', { role: 'group', 'aria-label': aria });
  let cur = value || '';
  function draw() {
    mount(
      el,
      CASE_SEGMENT_FILTERS.map((f) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(cur === f.key),
            dataset: { seg: f.key || 'all' },
            class: f.key && `seg-opt--${f.key}`,
            onClick: () => {
              if (cur === f.key) return;
              cur = f.key;
              draw();
              if (onChange) onChange(cur);
            },
          },
          f.icon ? glyph(f.icon, 16) : null,
          h('span.seg-l', f.label),
        ),
      ),
    );
  }
  el.getValue = () => cur;
  draw();
  return el;
}

// ───────────── رأس الإرسال (r2 P13) ─────────────

/**
 * رأس كل ورقة أو محرر يرسل للعميل: رقاقة النوع + النبرة + «سيُرسل من: …» (دائمًا، حتى بلا رقم للأفراد).
 * @param {{segment?:string|null, tone?:string, sendLine?:{key,label}|null, company?:boolean, requesterKind?:string}} opts
 */
export function sendHeader({ segment = null, tone = null, sendLine = null, company = false, requesterKind = null } = {}) {
  const v = parseSeg(segment);
  const t = tone || (company ? 'paid' : v || 'neutral');
  const line = sendLine && sendLine.label ? sendLine.label : 'صفحة المتابعة';
  return h(
    'div.send-head',
    { dataset: { tone: t, line: (sendLine && sendLine.key) || 'portal' } },
    segmentChip(v, { company, requesterKind, size: 'label' }),
    h('span.send-head-tone', segLabel('segment_tone', t)),
    h('span.send-head-line', icon(sendLine && ['main', 'paid'].includes(sendLine.key) ? 'whatsapp' : 'globe', { size: 14 }), h('span', `سيُرسل من: ${line}`)),
  );
}

// ───────────── اختيار النوع داخل ورقة «اعمله طلب» (ST-3) ─────────────

/**
 * اختيار «نوع الخدمة» بلا قيمة افتراضية (حين segment_required) أو بقيمة الطلب الحالية.
 * @param {{value?:string|null, required?:boolean, hint?:object, current?:string|null, onChange?:(v)=>void}} opts
 * @returns {HTMLElement & {getValue:()=>string|null, setError:(msg)=>void}}
 */
export function segmentChoice({ value = null, required = false, hint = null, current = null, onChange } = {}) {
  let cur = parseSeg(value);
  const name = uid('seg-choice');
  const note = h('p.seg-choice-note', { hidden: true }, icon('info', { size: 14 }), h('span', 'سيُسجَّل تغيير نوع الخدمة.'));
  const radios = SEGMENT_VALUES.map((v) => {
    const r = h('input', { type: 'radio', name, value: v, checked: cur === v, required });
    r.addEventListener('change', () => {
      if (!r.checked) return;
      cur = v;
      sync();
      if (onChange) onChange(v);
    });
    return h('label.seg-choice-opt', { class: `is-${v}` }, r, glyph(v === 'charity' ? 'heart' : 'briefcase', 18), h('span', segLabel('segment_long', v)));
  });
  const group = h('div.seg-choice-opts', { role: 'radiogroup' }, radios);
  const wrap = field(SEGMENT_TITLE, group, { group: true, required, hint: required ? 'اختاروا النوع قبل الإرسال — لا يوجد اختيار افتراضي.' : null, className: 'seg-choice' });
  const hintEl = hint && parseSeg(hint.segment) ? h('div.seg-choice-hint', hintChip(hint)) : null;
  function sync() {
    const cp = parseSeg(current);
    note.hidden = !(cp && cur && cur !== cp);
    wrap.setError('');
  }
  sync();
  const el = h('div.seg-choice-block', wrap, hintEl, note);
  el.getValue = () => cur;
  el.setError = (msg) => wrap.setError(msg || '');
  el.focusFirst = () => radios[0]?.querySelector('input')?.focus();
  return el;
}

// ───────────── ورقة تغيير نوع الخدمة (S11-39) ─────────────

/**
 * جسم ورقة التغيير (قابل للاختبار بلا نافذة): الاختيار، السبب (مطلوب فقط حين النوع الحالي ليس «غير محدد»)،
 * رقائق السبب السريعة، ورسالة العميل الاختيارية بالنص المقترح حسب الاتجاه، والملاحظة.
 * @param {{kind:'intake'|'case', current:string|null, changeMessage?:{charity?:string,paid?:string}|null}} opts
 */
export function segmentSheetBody({ kind = 'intake', current = null, changeMessage = null } = {}) {
  const cur = parseSeg(current);
  let target = cur;
  let reasonCode = null;
  let dirty = false;
  const reasonNeeded = () => Boolean(cur);
  const name = uid('seg-ov');
  const radios = SEGMENT_VALUES.map((v) => {
    const r = h('input', { type: 'radio', name, value: v, checked: cur === v });
    r.addEventListener('change', () => {
      if (!r.checked) return;
      target = v;
      dirty = true;
      syncMessage();
    });
    return h('label.seg-choice-opt', { class: `is-${v}` }, r, glyph(v === 'charity' ? 'heart' : 'briefcase', 18), h('span', segLabel('segment_long', v)));
  });
  const choiceWrap = field(SEGMENT_TITLE, h('div.seg-choice-opts', { role: 'radiogroup' }, radios), { group: true, required: true });

  const reason = h('textarea.input', { rows: 2, maxlength: 300, dir: 'auto', required: reasonNeeded() });
  reason.addEventListener('input', () => {
    dirty = true;
    reasonCode = null;
  });
  const codes = Object.keys(FALLBACK.segment_reason_codes);
  const reasonChips = h(
    'div.seg-reason-chips',
    { role: 'group', 'aria-label': 'أسباب جاهزة' },
    codes.map((c) =>
      h(
        'button.chip.seg-reason-chip',
        {
          type: 'button',
          dataset: { code: c },
          onClick: () => {
            reason.value = segLabel('segment_reason_codes', c);
            reasonCode = c;
            dirty = true;
            reasonWrap.setError('');
          },
        },
        segLabel('segment_reason_codes', c),
      ),
    ),
  );
  const reasonWrap = field('السبب', reason, { required: reasonNeeded(), hint: reasonNeeded() ? 'من 3 إلى 300 حرف — يُحفظ في السجل.' : 'اختياري عند التحديد لأول مرة.' });

  // رسالة العميل (اختيارية، غير محددة افتراضيًا): النص المقترح حسب الاتجاه من الخادم (change_message[to])
  const sendCb = h('input', { type: 'checkbox' });
  const msg = h('textarea.input.seg-msg', { rows: 5, maxlength: 4000, dir: 'auto', disabled: true });
  let msgEdited = false;
  msg.addEventListener('input', () => {
    msgEdited = true;
    dirty = true;
  });
  sendCb.addEventListener('change', () => {
    msg.disabled = !sendCb.checked;
    dirty = true;
    msgWrap.classList.toggle('is-off', !sendCb.checked);
  });
  const msgWrap = field('نص الرسالة', msg, { full: true, className: 'is-off' });
  function syncMessage() {
    if (msgEdited) return;
    const t = target && target !== cur && changeMessage ? changeMessage[target] : null;
    msg.value = t || '';
  }
  syncMessage();
  const msgBlock = cur ? h('div.seg-msg-block', h('label.check', sendCb, h('span', 'إرسال رسالة للعميل')), msgWrap) : null;
  const alert = h('div.seg-sheet-alert', { role: 'alert', 'aria-live': 'assertive' });

  const el = frag(
    alert,
    kind === 'case' ? h('p.seg-sheet-intro', 'يتغير النوع في الملف وملفاته المستمرة وطلبه الأصلي معًا.') : null,
    choiceWrap,
    h('div.seg-reason', reasonWrap, reasonChips),
    msgBlock,
    h('p.seg-note', icon('info', { size: 14 }), h('span', NO_AMOUNT_NOTE)),
  );
  return {
    el,
    alert,
    isDirty: () => dirty,
    target: () => target,
    /** يعيد جسم الطلب أو null مع إظهار الخطأ */
    payload() {
      choiceWrap.setError('');
      reasonWrap.setError('');
      msgWrap.setError('');
      if (!target) {
        choiceWrap.setError(REQUIRED_TEXT);
        return null;
      }
      const r = reason.value.trim();
      if (reasonNeeded() && target !== cur && r.length < 3) {
        reasonWrap.setError('اكتبوا سبب التغيير.');
        reason.focus();
        return null;
      }
      const body = { segment: target };
      if (r) body.reason = r;
      if (reasonCode) body.reason_code = reasonCode;
      if (msgBlock && sendCb.checked) {
        const t = msg.value.trim();
        if (!t) {
          msgWrap.setError('اكتبوا نص الرسالة أو ألغوا الإرسال');
          return null;
        }
        body.message = { send: true, text: t };
      }
      return body;
    },
    showError(err) {
      mount(alert, h('p.alert.alert-danger', icon('alert', { size: 16 }), h('span', errorMessage(err))));
    },
    controls: { radios, reason, reasonChips, sendCb, msg },
  };
}

/** نص نتيجة التغيير بعد الحفظ (الفترات المغلقة، فواتير أُلغيت) */
export function afterChangeNotes(res = {}) {
  const out = [];
  if (Array.isArray(res.affected_periods) && res.affected_periods.length) out.push(`الفترات المغلقة لم تتغير: ${res.affected_periods.join('، ')}`);
  const n = Array.isArray(res.cancelled_invoices) ? res.cancelled_invoices.length : 0;
  if (n) out.push(n === 1 ? 'أُلغيت فاتورة أتعاب واحدة لم تُدفع.' : n === 2 ? 'أُلغيت فاتورتا أتعاب لم تُدفعا.' : `أُلغيت ${n} فواتير أتعاب لم تُدفع.`);
  return out;
}

/** يحفظ النوع: PUT /api/admin/intakes|cases/:id/segment */
export function saveSegment(kind, id, body) {
  const path = kind === 'case' ? 'cases' : 'intakes';
  return api.put(`/admin/${path}/${encodeURIComponent(id)}/segment`, body);
}

/**
 * ورقة «نوع الخدمة لهذا الطلب» (S11-39 + r2 S14/S21). الأخطاء (403/409/400) تظهر داخل الورقة بنص الخادم.
 * @param {{kind:'intake'|'case', id:number, current:string|null, hint?:object, changeMessage?:object, onSaved?:(res)=>void}} opts
 */
export function openSegmentSheet({ kind = 'intake', id, current = null, hint = null, changeMessage = null, onSaved } = {}) {
  const body = segmentSheetBody({ kind, current, changeMessage });
  let saved = null;
  const handle = modal({
    sheet: true,
    className: 'seg-sheet',
    title: kind === 'case' ? 'نوع الخدمة لهذا الملف' : 'نوع الخدمة لهذا الطلب',
    subtitle: current ? `الآن: ${segLabel('segment_long', current)}` : `الآن: ${UNSET_LABEL}`,
    // الاقتراح يظهر فقط حين يخالف النوع الحالي (أو النوع غير محدد)
    body: frag(hint && parseSeg(hint.segment) && hint.segment !== parseSeg(current) ? h('div.seg-sheet-hint', hintChip(hint)) : null, body.el),
    beforeClose: discardGuard(() => body.isDirty(), { singular: true }),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'حفظ',
        variant: 'primary',
        onClick: async () => {
          mount(body.alert);
          const payload = body.payload();
          if (!payload) return false;
          try {
            saved = await saveSegment(kind, id, payload);
          } catch (err) {
            body.showError(err);
            return false;
          }
          return undefined;
        },
      },
    ],
    onClose: () => {
      if (!saved) return;
      toast(saved.unchanged ? 'لم يتغير نوع الخدمة' : `نوع الخدمة الآن: ${segLabel('segment', saved.value || body.target())}`, 'success');
      for (const n of afterChangeNotes(saved)) toast(n, 'info', 9000);
      if (onSaved) onSaved(saved);
    },
  });
  return handle;
}

// ───────────── بطاقة «نوع الخدمة غير محدد» (ST-2، r2 S21: ضغطة واحدة تحفظ بلا سبب) ─────────────

/**
 * @param {{id:number, hint?:{segment,reasons}|null}} intake
 * @param {(segment:string, res:object)=>void} onPick بعد الحفظ
 */
export function undeterminedCard(intake, onPick) {
  const hint = intake && intake.hint && parseSeg(intake.hint.segment) ? intake.hint : null;
  const err = h('p.field-error', { role: 'alert', hidden: true });
  const btns = [];
  async function pick(v, btn) {
    err.hidden = true;
    btns.forEach((b) => (b.disabled = true));
    btn.classList.add('is-loading');
    try {
      const res = await saveSegment('intake', intake.id, { segment: v });
      toast(`نوع الخدمة الآن: ${segLabel('segment', v)}`, 'success');
      if (onPick) onPick(v, res);
    } catch (e) {
      mount(err, icon('alert', { size: 14 }), h('span', errorMessage(e)));
      err.hidden = false;
    } finally {
      btns.forEach((b) => (b.disabled = false));
      btn.classList.remove('is-loading');
    }
  }
  const big = (v) => {
    const b = h(
      'button.seg-card-btn',
      { type: 'button', class: `is-${v}`, dataset: { seg: v }, onClick: () => pick(v, b) },
      h('span.seg-card-ico', glyph(v === 'charity' ? 'heart' : 'briefcase', 22)),
      h('span.seg-card-label', segLabel('segment_long', v)),
    );
    btns.push(b);
    return b;
  };
  const useHint = hint
    ? (() => {
        const b = button('استخدم الاقتراح', { variant: 'secondary', size: 'sm', icon: 'sparkle', className: 'seg-card-use', onClick: () => pick(hint.segment, b) });
        btns.push(b);
        return b;
      })()
    : null;
  const reasons = hint && Array.isArray(hint.reasons) ? hint.reasons.filter(Boolean) : [];
  return h(
    'section.seg-card',
    { 'aria-labelledby': 'seg-card-title' },
    h('h2.seg-card-title#seg-card-title', glyph('helpCircle', 20), h('span', 'نوع الخدمة غير محدد')),
    h('div.seg-card-btns', big('charity'), big('paid')),
    hint && h('div.seg-card-hint', h('span', `المقترح: ${segLabel('segment', hint.segment)}${reasons.length ? ` — ${reasons.join('، ')}` : ''}`), useHint),
    h('p.seg-card-note', ANALYSIS_SAME_NOTE),
    err,
  );
}

// ───────────── «إضافة أتعاب» لملف الأفراد (ST-4، r2 P5) ─────────────

/** ورقة «إضافة أتعاب لهذا الملف»: المبلغ · الوصف · تاريخ الاستحقاق → POST /api/admin/cases/:id/invoices */
export function feeSheetBody() {
  const amount = h('input.input', { type: 'text', inputmode: 'decimal', dir: 'ltr', autocomplete: 'off' });
  const desc = h('input.input', { type: 'text', maxlength: 300, dir: 'auto', placeholder: 'أتعاب استشارة قانونية' });
  const due = h('input.input', { type: 'date', min: cairoToday() });
  const fa = field('المبلغ', h('div.input-group', amount, h('span.input-addon', 'ج.م')), { required: true });
  const fd = field('الوصف', desc, { hint: 'يظهر على صفحة الطلب.' });
  const fdue = field('تاريخ الاستحقاق', due, { required: true });
  let dirty = false;
  for (const x of [amount, desc, due]) x.addEventListener('input', () => (dirty = true));
  amount.addEventListener('input', () => fa.setError(''));
  due.addEventListener('input', () => fdue.setError(''));
  const alert = h('div.seg-sheet-alert', { role: 'alert', 'aria-live': 'assertive' });
  return {
    el: frag(alert, h('div.form-grid', fa, fd, fdue), h('p.seg-note', icon('info', { size: 14 }), h('span', 'يصل إلى صفحة الطلب للموافقة عليه قبل أي عمل.'))),
    alert,
    isDirty: () => dirty,
    payload() {
      fa.setError('');
      fdue.setError('');
      const raw = String(amount.value || '')
        .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
        .replace(/[,٬\s]/g, '')
        .replace('٫', '.');
      const n = Number(raw);
      if (!raw || !Number.isFinite(n) || n < 0.01) {
        fa.setError('اكتبوا مبلغًا صحيحًا');
        amount.focus();
        return null;
      }
      if (!due.value) {
        fdue.setError('اختاروا تاريخ الاستحقاق');
        return null;
      }
      const body = { amount: n, due_at: cairoDateToIso(due.value, true) };
      if (desc.value.trim()) body.description = desc.value.trim();
      return body;
    },
    showError(err) {
      mount(alert, h('p.alert.alert-danger', icon('alert', { size: 16 }), h('span', errorMessage(err))));
    },
    controls: { amount, desc, due },
  };
}

export function openFeeSheet({ caseId, onSaved } = {}) {
  const body = feeSheetBody();
  let saved = null;
  return modal({
    sheet: true,
    className: 'seg-sheet seg-fee-sheet',
    title: 'إضافة أتعاب لهذا الملف',
    body: body.el,
    beforeClose: discardGuard(() => body.isDirty(), { singular: true }),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'إرسال للعميل للموافقة',
        variant: 'primary',
        icon: 'send',
        onClick: async () => {
          mount(body.alert);
          const payload = body.payload();
          if (!payload) return false;
          try {
            saved = await api.post(`/admin/cases/${encodeURIComponent(caseId)}/invoices`, payload);
          } catch (err) {
            body.showError(err);
            return false;
          }
          return undefined;
        },
      },
    ],
    onClose: () => {
      if (!saved) return;
      toast('أُرسلت الأتعاب إلى صفحة الطلب للموافقة', 'success');
      if (onSaved) onSaved(saved);
    },
  });
}

/** سطر حالة الأتعاب لملف الأفراد: { invoices, agreed } */
export function feesStateText(fees) {
  if (!fees) return null;
  if (!fees.invoices) return 'لم تُرسل أتعاب لهذا الملف بعد.';
  return fees.agreed ? 'تمت الموافقة على الأتعاب.' : FEES_NOT_AGREED;
}

/**
 * أتعاب هذا الملف من سجل نشاطه (يخص الملف وحده): أُصدرت (invoice.created مع case_fee) · وافق العميل
 * (invoice.client_response = agree) · أُلغيت (invoice.cancelled). invoices (اختياري) = فواتير المستفيد/ة للمبلغ والحالة.
 * @returns {Array<{id:number, number?:string, amount?:number, due_at?:string, status?:string, text:string, agreed:boolean, cancelled:boolean}>}
 */
export function caseFeeItems(activity = [], invoices = []) {
  const acts = Array.isArray(activity) ? activity : [];
  const byId = new Map((invoices || []).map((i) => [Number(i.id), i]));
  const has = (type, id, extra) => acts.some((a) => a && a.type === type && a.data && Number(a.data.invoice_id) === id && (!extra || extra(a.data)));
  const seen = new Set();
  const out = [];
  for (const a of acts) {
    if (!a || a.type !== 'invoice.created' || !a.data || !a.data.case_fee) continue;
    const id = Number(a.data.invoice_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const inv = byId.get(id) || {};
    const paid = ['paid', 'partially_paid'].includes(inv.status);
    out.push({
      id,
      number: inv.number || null,
      amount: inv.amount ?? null,
      due_at: inv.due_at || null,
      status: inv.status || null,
      description: inv.description || null,
      text: a.summary || '',
      agreed: paid || has('invoice.client_response', id, (d) => d.answer === 'agree'),
      cancelled: inv.status === 'cancelled' || has('invoice.cancelled', id),
    });
  }
  return out;
}
