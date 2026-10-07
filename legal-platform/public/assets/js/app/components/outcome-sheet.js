// v9.1 l-court — أوراق ممر المحكمة (L-02 / L-18 / L-22):
//   openOutcomeSheet  «ماذا قررت المحكمة؟» في 3 لمسات: تأجّلت / حُجزت للحكم / صدر الحكم / لم تُنظر،
//                     تاريخ الجلسة القادمة (تاريخ فقط، الساعة مثل هذه الجلسة)، وميعاد الطعن بعد الحكم.
//                     طلب واحد آمن للتكرار (client_ref) عبر صندوق الصادر: بلا شبكة يُحفظ على الجهاز ويُرسل تلقائيًا.
//   openAddHearingSheet  «إضافة جلسة»: التاريخ والساعة (09:00 افتراضيًا)، حضور المستفيد/ة، ملاحظة.
//   openEditEventSheet   «تعديل الموعد»: التاريخ والساعة (والمكان).
//   outcomeLine(event)   سطر القرار المختصر لصف الجلسة (من النص الذي يكتبه الخادم).
//
// الواجهة البرمجية (ثابتة — تستوردها «اليوم» وصفحة الملف المستمر والتقويم):
//   openOutcomeSheet({ event, user?, onSaved?(data), onQueued?(item) }) → Promise<'saved'|'queued'|null>
//     event: { id, title, starts_at, client_attendance_required?, kind?, outcome_kind?, outcome_reason?,
//              outcome_decision?, next_event_at? }  (يكفي id وtitle وstarts_at)
//     data:  رد الخادم { event, next_event, task } (لتحديث الصفوف المتأثرة فقط دون إعادة تحميل)
//   openAddHearingSheet({ matter, onSaved?(event) }) → Promise<event|null>   matter: { id, court?, circuit? }
//   openEditEventSheet({ event, matter?, onSaved?(event) }) → Promise<event|null>
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { modal, choiceTiles, icon, toast, confirmDialog, setBusy, uid, errorMessage } from '../../lib/ui.js';
import { label, options, time, weekday, date, shortDate, isoToCairoDate, cairoToday, cairoInputToIso } from '../../lib/fmt.js';
import { outboxSend, initOutbox } from './outbox.js';

const BEN = 'المستفيد/ة';

const RESULTS = [
  { value: 'adjourned', label: 'تأجّلت' },
  { value: 'reserved', label: 'حُجزت للحكم' },
  { value: 'judgment', label: 'صدر الحكم' },
  { value: 'not_held', label: 'لم تُنظر' },
];
const ADJOURN_REASONS = [
  { value: 'review', label: 'للاطلاع' },
  { value: 'documents', label: 'لتقديم مستندات' },
  { value: 'notice', label: 'للإعلان' },
  { value: 'pleading', label: 'للمرافعة' },
  { value: 'expert', label: 'للخبير' },
  { value: 'administrative', label: 'إداريًا' },
];
const NOT_HELD_REASONS = [
  { value: 'struck', label: 'شُطبت' },
  { value: 'no_session', label: 'لم تنعقد' },
  { value: 'other', label: 'سبب آخر' },
];

// ───────────── أدوات التاريخ (تاريخ فقط بتوقيت القاهرة) ─────────────

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' + أيام */
export function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
const validKey = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const noonIso = (key) => cairoInputToIso(`${key}T12:00`);
/** «الأربعاء 28 أكتوبر 2026» */
export function longDay(key) {
  const iso = noonIso(key);
  return iso ? `${weekday(iso)} ${date(iso)}` : '';
}
/** «الأربعاء 28 أكتوبر» */
export function shortDay(key) {
  const iso = noonIso(key);
  return iso ? `${weekday(iso)} ${shortDate(iso)}` : '';
}
/** ساعة الموعد بتوقيت القاهرة 'HH:MM' */
function hmOf(iso) {
  if (!iso) return '09:00';
  const s = new Date(iso);
  if (Number.isNaN(s.getTime())) return '09:00';
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(s);
  return p.replace(/[^\d:]/g, '') || '09:00';
}
/** «9:30 ص» من 'HH:MM' */
function hmLabel(hm) {
  const iso = cairoInputToIso(`${cairoToday()}T${hm || '09:00'}`);
  return iso ? time(iso) : hm;
}
/** «الأربعاء 7 أكتوبر 9:30 ص» */
function whenLine(iso) {
  return `${weekday(iso)} ${shortDate(iso)} ${time(iso)}`;
}

function newRef() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* تجاهل */
  }
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** سطر القرار المختصر: نص الخادم كما هو («تأجّلت لجلسة الأربعاء 28 أكتوبر 2026 — للاطلاع.») */
export function outcomeLine(e) {
  return e && e.outcome ? String(e.outcome).trim() : '';
}

// ───────────── عناصر صغيرة ─────────────

function fieldBox(labelText, control, { hint, required = false, id, aside = null } = {}) {
  const err = h('p.field-error', { hidden: true }, icon('alert', { size: 14 }), h('span'));
  const labelEl = labelText ? h('label.field-label', { htmlFor: id }, labelText, required ? h('span.req', { 'aria-hidden': 'true' }, '*') : null) : null;
  // aside: عنصر صغير في سطر التسمية نفسه (مثل التاريخ المختار بالحروف) لتوفير الارتفاع على الهاتف
  const lab = labelEl && aside ? h('div.lc-label-row', labelEl, aside) : labelEl;
  const wrap = h('div.field.lc-field', lab, control, hint || null, err);
  wrap.setError = (msg) => {
    err.hidden = !msg;
    err.lastChild.textContent = msg || '';
    wrap.classList.toggle('has-error', Boolean(msg));
    const input = control.matches?.('input, textarea, select') ? control : control.querySelector?.('input, textarea, select');
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  };
  return wrap;
}

/** مفتاح تبديل (role=switch) بارتفاع ≥ 44px */
function switchRow(text, checked, onChange) {
  const input = h('input.lc-switch-input', { type: 'checkbox', role: 'switch', checked, onChange: (e) => onChange(e.target.checked) });
  return h('label.lc-switch', input, h('span.lc-switch-track', { 'aria-hidden': 'true' }), h('span.lc-switch-text', text));
}

/** رابط يكشف حقلًا اختياريًا («+ أضف ملاحظة») */
function revealLink(text, onReveal) {
  const b = h('button.lc-reveal', { type: 'button' }, text);
  b.addEventListener('click', () => {
    b.hidden = true;
    onReveal();
  });
  return b;
}

// ───────────── ورقة نتيجة الجلسة ─────────────

export function openOutcomeSheet({ event, user = null, onSaved, onQueued } = {}) {
  if (!event || !event.id) return Promise.resolve(null);
  if (user) initOutbox(user);
  return new Promise((resolve) => {
    let outcome = null;
    const eventDay = isoToCairoDate(event.starts_at) || cairoToday();
    const minNext = addDaysKey(eventDay, 1);
    const maxNext = addDaysKey(eventDay, 730);
    const editing = Boolean(event.outcome_kind);
    const ref = newRef();
    // ساعة هذه الجلسة هي الافتراضية للجلسة القادمة؛ وعند تعديل نتيجة سابقة تبقى ساعة الجلسة القادمة كما سُجّلت
    const baseTime = hmOf(event.starts_at);
    const appealKey = editing && event.outcome_kind === 'judgment' && event.appeal_due_at ? isoToCairoDate(event.appeal_due_at) : '';
    const s = {
      result: editing ? event.outcome_kind : null,
      next_date: editing && event.next_event_at ? isoToCairoDate(event.next_event_at) : '',
      next_time: editing && event.next_event_at ? hmOf(event.next_event_at) : baseTime,
      timeOpen: false,
      reason: editing ? event.outcome_reason || null : null,
      note: editing && event.outcome_kind !== 'judgment' ? event.outcome_decision || '' : '',
      noteOpen: false,
      decision: editing && event.outcome_kind === 'judgment' ? event.outcome_decision || '' : '',
      // ميعاد الطعن المسجل سابقًا يظهر في ورقة التعديل (وإلا أُلغيت مهمته عند حفظ التعديل)
      appealOpen: Boolean(appealKey),
      appeal_date: appealKey,
      attendance: Boolean(Number(event.client_attendance_required)),
    };
    const initial = JSON.stringify(s);
    const dirty = () => JSON.stringify(s) !== initial;

    const today = eventDay === cairoToday();
    const title = today ? 'نتيجة جلسة اليوم' : 'نتيجة الجلسة';
    const subtitle = `${event.title || label('event_kind', event.kind || 'hearing')} · ${whenLine(event.starts_at)}`;

    const dyn = h('div.lc-sheet-dyn');
    const status = h('div.lc-sheet-status', { role: 'status', 'aria-live': 'polite', hidden: true });
    const saveBtn = h('button.btn.btn-primary.btn-lg.btn-block.lc-save', { type: 'button', disabled: true }, h('span.btn-label', 'حفظ النتيجة'));
    const footer = h('div.lc-sheet-footer', saveBtn);
    const fields = {};

    const tiles = choiceTiles({
      label: 'ماذا قررت المحكمة؟',
      options: RESULTS,
      value: s.result,
      columns: 2,
      onChange: (v) => {
        s.result = v;
        if (v !== 'adjourned' && v !== 'not_held') s.reason = null;
        else if (s.reason && !(v === 'adjourned' ? ADJOURN_REASONS : NOT_HELD_REASONS).some((r) => r.value === s.reason)) s.reason = null;
        renderDyn();
        validate();
      },
    });
    tiles.classList.add('lc-result-tiles');

    function dateField(key, labelText, required) {
      const id = uid('lcd');
      const echo = h('span.lc-date-echo', { 'aria-live': 'polite' });
      const input = h('input.input.lc-date-input', {
        id,
        type: 'date',
        required,
        min: minNext,
        max: maxNext,
        value: s.next_date,
        onInput: (e) => {
          s.next_date = e.target.value;
          syncEcho();
          renderNextExtras();
          validate();
        },
        onChange: (e) => {
          s.next_date = e.target.value;
          syncEcho();
          renderNextExtras();
          validate();
        },
      });
      const syncEcho = () => {
        echo.textContent = validKey(s.next_date) ? longDay(s.next_date) : '';
        echo.hidden = !echo.textContent;
      };
      syncEcho();
      const timeHost = h('div.lc-time-host');
      const timeHint = () => {
        if (s.timeOpen) {
          const tid = uid('lct');
          const t = h('input.input.lc-time-input', { id: tid, type: 'time', value: s.next_time, step: 300, onInput: (e) => { s.next_time = e.target.value || s.next_time; validate(); }, onChange: (e) => { s.next_time = e.target.value || s.next_time; validate(); } });
          return h('div.lc-time-row', h('label.field-label', { htmlFor: tid }, 'الساعة'), t);
        }
        const link = h('button.lc-reveal.lc-inline', { type: 'button', onClick: () => { s.timeOpen = true; mount(timeHost, timeHint()); timeHost.querySelector('input')?.focus(); } }, 'تغيير الساعة');
        return h('p.lc-time-hint', s.next_time === baseTime ? `الساعة ${hmLabel(s.next_time)} مثل هذه الجلسة · ` : `الساعة ${hmLabel(s.next_time)} · `, link);
      };
      mount(timeHost, timeHint());
      const wrap = fieldBox(labelText, input, { required, id, aside: echo, hint: timeHost });
      fields[key] = wrap;
      return wrap;
    }

    const nextExtras = h('div.lc-next-extras');
    function renderNextExtras() {
      if (!validKey(s.next_date) || s.result === 'judgment' || !s.result) {
        mount(nextExtras);
        return;
      }
      if (nextExtras.childNodes.length) return;
      mount(
        nextExtras,
        switchRow(`يلزم حضور ${BEN} في الجلسة القادمة`, s.attendance, (v) => {
          s.attendance = v;
        }),
        h('p.lc-muted-line', `تُضاف الجلسة القادمة لتقويمك، وتراجعها الإدارة قبل تذكير ${BEN}.`),
      );
    }

    /** «+ أضف ملاحظة» (رابط يُوضع في سطر السبب لتوفير الارتفاع) ومكان الحقل حين يُكشف */
    function noteArea() {
      const host = h('div.lc-note-host');
      const show = (focus) => {
        const id = uid('lcn');
        const ta = h('textarea.textarea.lc-note', { id, rows: 2, maxLength: 3000, value: s.note, onInput: (e) => { s.note = e.target.value; } });
        mount(host, fieldBox('ملاحظة', ta, { id }));
        if (focus) ta.focus();
      };
      let link = null;
      if (s.note || s.noteOpen) {
        s.noteOpen = true;
        show(false);
      } else {
        link = revealLink('+ أضف ملاحظة', () => {
          s.noteOpen = true;
          show(true);
        });
      }
      return { link, host };
    }

    function reasonBlock(list, labelText, note) {
      const lid = uid('lcr');
      const chips = choiceTiles({ options: list, value: s.reason, variant: 'chip', allowDeselect: true, onChange: (v) => { s.reason = v; } });
      chips.setAttribute('aria-labelledby', lid);
      chips.classList.add('lc-reason');
      return h('div.lc-reason-block', h('div.lc-label-row', h('span.field-label', { id: lid }, labelText), note ? note.link : null), chips);
    }

    function renderDyn() {
      for (const k of Object.keys(fields)) delete fields[k];
      mount(nextExtras);
      switch (s.result) {
        case 'adjourned': {
          const note = noteArea();
          mount(dyn, dateField('next_date', 'تاريخ الجلسة القادمة', true), reasonBlock(ADJOURN_REASONS, 'سبب التأجيل (اختياري)', note), note.host, nextExtras);
          break;
        }
        case 'reserved': {
          const note = noteArea();
          mount(dyn, dateField('next_date', 'تاريخ النطق بالحكم', true), note.link, note.host, nextExtras);
          break;
        }
        case 'judgment': {
          const id = uid('lcj');
          const ta = h('textarea.textarea', { id, rows: 3, maxLength: 5000, required: true, placeholder: 'مثال: حكمت المحكمة بالبراءة.', value: s.decision, onInput: (e) => { s.decision = e.target.value; fields.decision?.setError(null); validate(); } });
          fields.decision = fieldBox('منطوق الحكم أو القرار', ta, { required: true, id });
          const appealHost = h('div.lc-appeal-host');
          const showAppeal = () => {
            const aid = uid('lca');
            const ai = h('input.input', { id: aid, type: 'date', min: eventDay, max: maxNext, value: s.appeal_date, onInput: (e) => { s.appeal_date = e.target.value; fields.appeal_due_date?.setError(null); validate(); }, onChange: (e) => { s.appeal_date = e.target.value; validate(); } });
            fields.appeal_due_date = fieldBox('ميعاد الطعن', ai, { id: aid, hint: h('p.field-hint', 'تُضاف مهمة إجرائية «ميعاد الطعن على الحكم» بهذا التاريخ. أدخل التاريخ بنفسك.') });
            mount(appealHost, fields.appeal_due_date);
          };
          if (s.appealOpen) showAppeal();
          else mount(appealHost, revealLink('+ أضف ميعاد الطعن', () => { s.appealOpen = true; showAppeal(); appealHost.querySelector('input')?.focus(); }));
          mount(dyn, fields.decision, appealHost);
          break;
        }
        case 'not_held': {
          const note = noteArea();
          mount(dyn, reasonBlock(NOT_HELD_REASONS, 'السبب (اختياري)', note), note.host, dateField('next_date', 'تاريخ الجلسة القادمة (اختياري)', false), nextExtras);
          break;
        }
        default:
          mount(dyn);
      }
      renderNextExtras();
    }

    function problems() {
      const p = {};
      if (!s.result) p.result = 'اختر ما قررته المحكمة';
      const needsNext = s.result === 'adjourned' || s.result === 'reserved';
      if (s.result && s.result !== 'judgment') {
        if (needsNext && !s.next_date) p.next_date = 'حدد تاريخ الجلسة القادمة';
        else if (s.next_date && !validKey(s.next_date)) p.next_date = 'التاريخ غير صالح';
        else if (s.next_date && s.next_date <= eventDay) p.next_date = 'تاريخ الجلسة القادمة يجب أن يكون بعد هذه الجلسة';
        else if (s.next_date && s.next_date > maxNext) p.next_date = 'تاريخ الجلسة القادمة بعيد جدًا (أكثر من سنتين)';
      }
      if (s.result === 'judgment') {
        if (String(s.decision || '').trim().length < 5) p.decision = 'اكتب منطوق الحكم أو القرار (5 أحرف على الأقل)';
        if (s.appealOpen && s.appeal_date && (!validKey(s.appeal_date) || s.appeal_date < eventDay)) p.appeal_due_date = 'ميعاد الطعن يجب ألا يسبق تاريخ الحكم';
      }
      return p;
    }

    function validate() {
      const p = problems();
      saveBtn.disabled = Object.keys(p).length > 0;
      // أخطاء التاريخ تظهر فور اختيار تاريخ غير مقبول (وليس أثناء خلو الحقل)
      if (fields.next_date) fields.next_date.setError(s.next_date && p.next_date ? p.next_date : null);
      return p;
    }

    function setStatus(msg, tone = 'warning') {
      status.hidden = !msg;
      status.className = `lc-sheet-status tone-${tone}`;
      mount(status, msg ? [icon(tone === 'danger' ? 'alert' : 'clock', { size: 16 }), h('span', msg)] : null);
    }

    function body() {
      const out = { result: s.result, client_ref: ref };
      if (s.result === 'judgment') {
        out.decision = String(s.decision || '').trim();
        if (s.appealOpen && s.appeal_date) out.appeal_due_date = s.appeal_date;
      } else {
        if (s.reason) out.reason = s.reason;
        if (s.note && s.note.trim()) out.decision = s.note.trim();
        if (s.next_date) {
          out.next_date = s.next_date;
          if (s.next_time && (s.timeOpen || s.next_time !== baseTime)) out.next_time = s.next_time;
          out.next_attendance_required = Boolean(s.attendance);
        }
      }
      return out;
    }

    async function save() {
      const p = validate();
      if (Object.keys(p).length) return;
      setStatus(null);
      setBusy(saveBtn, true);
      saveBtn.querySelector('.btn-label').textContent = 'جارٍ الحفظ…';
      const payload = body();
      const nextKey = payload.next_date || null;
      try {
        const r = await outboxSend({
          kind: 'outcome',
          method: 'POST',
          path: `/lawyer/matter-events/${encodeURIComponent(event.id)}/outcome`,
          body: payload,
          ref: `event:${event.id}`,
          label: `نتيجة «${event.title || 'الجلسة'}»`,
        });
        if (r.status === 'queued') {
          outcome = 'queued';
          m.close('queued');
          toast('لا يوجد اتصال. حُفظت النتيجة على هذا الجهاز وستُرسل تلقائيًا عند عودة الشبكة.', 'warning', 6000);
          if (onQueued) onQueued(r.item);
          return;
        }
        outcome = 'saved';
        m.close('saved');
        const nx = r.data && r.data.next_event ? isoToCairoDate(r.data.next_event.starts_at) : nextKey;
        toast(nx ? `حُفظت النتيجة. الجلسة القادمة: ${shortDay(nx)}.` : 'حُفظت النتيجة.', 'success', 5000);
        if (onSaved) onSaved(r.data);
      } catch (err) {
        const fieldsMap = err && err.details && err.details.fields;
        let shown = false;
        if (fieldsMap && typeof fieldsMap === 'object') {
          for (const [k, msg] of Object.entries(fieldsMap)) {
            if (fields[k]) {
              fields[k].setError(msg);
              shown = true;
            }
          }
        }
        if (!shown) setStatus(errorMessage(err), 'danger');
        // خطأ في حقل: يصحّحه ثم «حفظ النتيجة»؛ وغير ذلك (عطل مؤقت أو تعارض) «أعد المحاولة»
        saveBtn.querySelector('.btn-label').textContent = shown ? 'حفظ النتيجة' : 'أعد المحاولة';
      } finally {
        setBusy(saveBtn, false);
        if (outcome == null) saveBtn.disabled = Object.keys(problems()).length > 0;
      }
    }
    saveBtn.addEventListener('click', save);

    renderDyn();
    validate();

    const m = modal({
      title,
      subtitle,
      sheet: true,
      className: 'lc-outcome-sheet',
      body: h('div.lc-sheet-body', tiles, dyn, status),
      beforeClose: async () => {
        if (!dirty()) return true;
        return confirmDialog({ title: 'تجاهل ما أدخلته؟', message: 'لم تُحفظ النتيجة بعد.', confirmLabel: 'تجاهل', cancelLabel: 'متابعة', danger: true });
      },
      onClose: () => resolve(outcome),
    });
    m.el.appendChild(footer);
  });
}

// ───────────── ورقة «إضافة جلسة» ─────────────

export function openAddHearingSheet({ matter, onSaved } = {}) {
  if (!matter || !matter.id) return Promise.resolve(null);
  return new Promise((resolve) => {
    let created = null;
    const today = cairoToday();
    const s = { date: '', time: '09:00', attendance: false, note: '', noteOpen: false, kind: 'hearing', kindOpen: false, location: '', locationOpen: false };
    const initial = JSON.stringify(s);
    const courtText = [matter.court, matter.circuit].filter(Boolean).join(' — ');

    const did = uid('lcd');
    const dateEcho = h('p.lc-date-echo', { 'aria-live': 'polite', hidden: true });
    const pastHint = h('p.lc-past-hint', { hidden: true }, icon('alert', { size: 14 }), h('span', 'هذا التاريخ مضى. لتسجيل جلسة انعقدت أضفها ثم سجّل نتيجتها.'));
    const dateInput = h('input.input', {
      id: did,
      type: 'date',
      required: true,
      max: addDaysKey(today, 730),
      onInput: (e) => onDate(e.target.value),
      onChange: (e) => onDate(e.target.value),
    });
    function onDate(v) {
      s.date = v;
      dateEcho.textContent = validKey(v) ? longDay(v) : '';
      dateEcho.hidden = !dateEcho.textContent;
      pastHint.hidden = !(validKey(v) && v < today);
      dateField.setError(null);
      validate();
    }
    const dateField = fieldBox('التاريخ', dateInput, { required: true, id: did, hint: h('div', dateEcho, pastHint) });
    const tid = uid('lct');
    const timeInput = h('input.input', { id: tid, type: 'time', value: s.time, step: 300, onInput: (e) => { s.time = e.target.value; validate(); }, onChange: (e) => { s.time = e.target.value; validate(); } });
    const timeField = fieldBox('الساعة', timeInput, { id: tid });

    const placeHost = h('div.lc-place');
    const showPlace = () => {
      const lid = uid('lcl');
      const li = h('input.input', { id: lid, type: 'text', maxLength: 200, value: s.location, placeholder: courtText || 'مثال: محكمة الأسرة ببنها', onInput: (e) => { s.location = e.target.value; } });
      mount(placeHost, fieldBox('المكان', li, { id: lid }));
      li.focus();
    };
    mount(
      placeHost,
      h(
        'p.lc-place-line',
        icon('mapPin', { size: 16 }),
        h('span', courtText ? `المكان: ${courtText}` : 'المكان: المحكمة المسجلة في الملف'),
        h('button.lc-reveal.lc-inline', { type: 'button', onClick: () => { s.locationOpen = true; showPlace(); } }, 'تغيير'),
      ),
    );

    const noteHost = h('div');
    mount(
      noteHost,
      revealLink('+ ملاحظة', () => {
        s.noteOpen = true;
        const nid = uid('lcn');
        const ta = h('textarea.textarea', { id: nid, rows: 2, maxLength: 3000, onInput: (e) => { s.note = e.target.value; } });
        mount(noteHost, fieldBox('ملاحظة', ta, { id: nid }));
        ta.focus();
      }),
    );

    const kindHost = h('div');
    mount(
      kindHost,
      revealLink('موعد من نوع آخر', () => {
        s.kindOpen = true;
        const kid = uid('lck');
        const sel = h(
          'select.select',
          { id: kid, onChange: (e) => { s.kind = e.target.value; } },
          options('event_kind').map((o) => h('option', { value: o.value, selected: o.value === s.kind }, o.label)),
        );
        mount(kindHost, fieldBox('نوع الموعد', sel, { id: kid }));
      }),
    );

    const status = h('div.lc-sheet-status', { role: 'status', 'aria-live': 'polite', hidden: true });
    const saveBtn = h('button.btn.btn-primary.btn-lg.btn-block.lc-save', { type: 'button', disabled: true }, h('span.btn-label', 'إضافة الجلسة'));

    function validate() {
      const ok = validKey(s.date) && /^\d{2}:\d{2}$/.test(s.time || '');
      saveBtn.disabled = !ok;
      return ok;
    }

    saveBtn.addEventListener('click', async () => {
      if (!validate()) return;
      status.hidden = true;
      setBusy(saveBtn, true);
      try {
        created = await api.post(`/lawyer/matters/${encodeURIComponent(matter.id)}/events`, {
          kind: s.kind,
          starts_at: cairoInputToIso(`${s.date}T${s.time}`),
          location: s.location || undefined,
          client_attendance_required: Boolean(s.attendance),
          notes: s.note || undefined,
        });
        m.close('saved');
        toast(`أُضيفت الجلسة: ${shortDay(s.date)} ${hmLabel(s.time)}.`, 'success', 4000);
        if (onSaved) onSaved(created);
      } catch (err) {
        const f = err && err.details && err.details.fields;
        if (f && f.starts_at) dateField.setError(f.starts_at);
        status.hidden = false;
        status.className = 'lc-sheet-status tone-danger';
        mount(status, icon('alert', { size: 16 }), h('span', err && err.status === 0 ? 'لا يوجد اتصال. لم تُضف الجلسة بعد — أعد المحاولة عند عودة الشبكة.' : errorMessage(err)));
      } finally {
        setBusy(saveBtn, false);
        validate();
      }
    });

    const m = modal({
      title: 'إضافة جلسة',
      sheet: true,
      className: 'lc-add-sheet',
      body: h(
        'div.lc-sheet-body',
        h('div.lc-two', dateField, timeField),
        placeHost,
        switchRow(`يلزم حضور ${BEN}`, false, (v) => { s.attendance = v; }),
        h('div.lc-links-row', noteHost, kindHost),
        status,
      ),
      beforeClose: async () => {
        if (JSON.stringify(s) === initial) return true;
        return confirmDialog({ title: 'تجاهل ما أدخلته؟', message: 'لم تُضف الجلسة بعد.', confirmLabel: 'تجاهل', cancelLabel: 'متابعة', danger: true });
      },
      onClose: () => resolve(created),
    });
    m.el.appendChild(h('div.lc-sheet-footer', saveBtn));
  });
}

// ───────────── ورقة «تعديل الموعد» ─────────────

export function openEditEventSheet({ event, matter = null, onSaved } = {}) {
  if (!event || !event.id) return Promise.resolve(null);
  return new Promise((resolve) => {
    let saved = null;
    const s = { date: isoToCairoDate(event.starts_at), time: hmOf(event.starts_at), location: event.location || '' };
    const initial = JSON.stringify(s);
    const did = uid('lcd');
    const echo = h('p.lc-date-echo', { 'aria-live': 'polite' }, longDay(s.date));
    const dateInput = h('input.input', { id: did, type: 'date', required: true, value: s.date, onInput: (e) => onDate(e.target.value), onChange: (e) => onDate(e.target.value) });
    function onDate(v) {
      s.date = v;
      echo.textContent = validKey(v) ? longDay(v) : '';
      validate();
    }
    const tid = uid('lct');
    const timeInput = h('input.input', { id: tid, type: 'time', value: s.time, step: 300, onInput: (e) => { s.time = e.target.value; validate(); } });
    const lid = uid('lcl');
    const locInput = h('input.input', { id: lid, type: 'text', maxLength: 200, value: s.location, placeholder: matter?.court || '', onInput: (e) => { s.location = e.target.value; } });
    const status = h('div.lc-sheet-status', { role: 'status', hidden: true });
    const saveBtn = h('button.btn.btn-primary.btn-lg.btn-block.lc-save', { type: 'button' }, h('span.btn-label', 'حفظ الموعد'));
    function validate() {
      const ok = validKey(s.date) && /^\d{2}:\d{2}$/.test(s.time || '');
      saveBtn.disabled = !ok;
      return ok;
    }
    saveBtn.addEventListener('click', async () => {
      if (!validate()) return;
      setBusy(saveBtn, true);
      try {
        saved = await api.patch(`/lawyer/matter-events/${encodeURIComponent(event.id)}`, {
          starts_at: cairoInputToIso(`${s.date}T${s.time}`),
          location: s.location || null,
        });
        m.close('saved');
        toast('عُدّل الموعد. تراجعه الإدارة قبل تذكير المستفيد/ة.', 'success', 4500);
        if (onSaved) onSaved(saved);
      } catch (err) {
        status.hidden = false;
        status.className = 'lc-sheet-status tone-danger';
        mount(status, icon('alert', { size: 16 }), h('span', err && err.status === 0 ? 'لا يوجد اتصال. لم يُحفظ التعديل بعد — أعد المحاولة عند عودة الشبكة.' : errorMessage(err)));
      } finally {
        setBusy(saveBtn, false);
        validate();
      }
    });
    const m = modal({
      title: 'تعديل الموعد',
      subtitle: event.title || '',
      sheet: true,
      className: 'lc-edit-sheet',
      body: h('div.lc-sheet-body', h('div.lc-two', fieldBox('التاريخ', dateInput, { required: true, id: did, hint: echo }), fieldBox('الساعة', timeInput, { id: tid })), fieldBox('المكان', locInput, { id: lid }), status),
      beforeClose: async () => (JSON.stringify(s) === initial ? true : confirmDialog({ title: 'تجاهل ما أدخلته؟', message: 'لم يُحفظ التعديل بعد.', confirmLabel: 'تجاهل', cancelLabel: 'متابعة', danger: true })),
      onClose: () => resolve(saved),
    });
    m.el.appendChild(h('div.lc-sheet-footer', saveBtn));
    validate();
  });
}

