// v9.2 (admin-ai) — نص الرسالة الصوتية: تسمعها الإدارة وتكتب ما قالته المستفيدة بكلامها، أو تعلّمها «مش مفهومة».
// لا تحويل آلي ولا يُرسل أي صوت لـ Claude؛ النص المكتوب يدخل ملخص القصة. النصوص للإدارة فقط (لا تظهر للمحامين ولا في صفحتها).

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative, dateTime } from '../../lib/fmt.js';
import { button, asyncButton, badge, icon, uid } from '../../lib/ui.js';

const SPEEDS = [
  { value: '1', label: '1×' },
  { value: '1.25', label: '1.25×' },
  { value: '1.5', label: '1.5×' },
];
const STATUS_TONES = { pending: 'warning', confirmed: 'success', unclear: 'neutral' };
const STATUS_TEXT = { pending: 'لم تُكتب بعد', confirmed: 'مكتوبة', unclear: 'غير مفهومة' };

/**
 * «السرعة: 1× · 1.25× · 1.5×» لمشغل صوت موجود (أو لمشغل يُنشأ لاحقًا عبر getAudio).
 * @param {HTMLAudioElement|(() => HTMLAudioElement|null)} audio
 */
export function speedControl(audio) {
  const get = typeof audio === 'function' ? audio : () => audio;
  const id = uid('vt-speed');
  const sel = h(
    'select.input.pa-vt-speed-select',
    {
      id,
      onChange: () => {
        const a = get();
        if (a) a.playbackRate = Number(sel.value) || 1;
      },
    },
    SPEEDS.map((s) => h('option', { value: s.value }, s.label)),
  );
  return h('span.pa-vt-speed', h('label', { for: id }, 'السرعة:'), h('span.select-wrap', sel));
}

/**
 * محرر نص رسالة صوتية واحدة.
 * @param {{document_id:number, duration_seconds?:number|null, transcript:{status:string, text?:string|null, updated_by_name?:string|null, updated_at?:string|null}}} note
 * @param {{audio?:HTMLAudioElement|null, withPlayer?:boolean, src?:string, onSaved?:(res:any)=>any, readOnly?:boolean}} [opts]
 *   audio: مشغل موجود بجوار المحرر (فقاعة المحادثة أو قائمة المستندات) يتحكم فيه زر السرعة؛
 *   withPlayer+src: يُنشأ مشغل داخل المحرر. onSaved(res): بعد الحفظ (res فيه story.voice_missing).
 * @returns {HTMLElement}
 */
export function voiceTranscriptEditor(note, { audio = null, withPlayer = false, src = '', onSaved, readOnly = false } = {}) {
  const t = { status: 'pending', text: null, updated_by_name: null, updated_at: null, ...(note.transcript || {}) };
  let editing = false;
  const root = h('div.pa-vt', { dataset: { doc: String(note.document_id), status: t.status } });
  const live = h('p.sr-only', { 'aria-live': 'polite' });
  const player = withPlayer && src ? h('audio.doc-audio-player', { controls: true, preload: 'metadata', src, 'aria-label': 'رسالة صوتية من المستفيدة' }) : null;
  const target = () => player || audio;

  async function save(body) {
    const res = await api.put(`/admin/voice-notes/${encodeURIComponent(note.document_id)}/transcript`, body);
    Object.assign(t, res.transcript || {});
    editing = false;
    draw();
    live.textContent = 'حُفظ النص';
    if (onSaved) await onSaved(res);
    return res;
  }

  function editor() {
    const id = uid('vt-text');
    const ta = h('textarea.input.pa-vt-input', {
      id,
      rows: 3,
      maxlength: 5000,
      dir: 'auto',
      placeholder: 'اكتب ما قالته المستفيدة بكلامها',
      'aria-describedby': `${id}-hint`,
    });
    ta.value = t.status === 'confirmed' ? t.text || '' : '';
    const err = h('p.field-error', { role: 'alert', hidden: true });
    const saveBtn = asyncButton(
      'حفظ النص',
      async () => {
        const text = ta.value.trim();
        if (!text) {
          err.textContent = 'اكتب ما سمعته أولًا، أو اختر «الرسالة مش مفهومة».';
          err.hidden = false;
          ta.focus();
          return;
        }
        err.hidden = true;
        await save({ text });
      },
      { variant: 'primary', size: 'sm', icon: 'check', className: 'pa-vt-save' },
    );
    const unclearBtn = asyncButton('الرسالة مش مفهومة', () => save({ unclear: true }), { variant: 'ghost', size: 'sm', icon: 'x', className: 'pa-vt-unclear' });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveBtn.click();
      }
    });
    return h(
      'div.pa-vt-edit',
      h('label.sr-only', { for: id }, 'نص الرسالة الصوتية كما قالته المستفيدة'),
      ta,
      h('p.field-hint', { id: `${id}-hint` }, 'اسمع الرسالة واكتبها بكلامها كما هو. Ctrl + Enter للحفظ.'),
      err,
      h(
        'div.pa-vt-actions',
        saveBtn,
        unclearBtn,
        editing &&
          button('إلغاء', {
            variant: 'ghost',
            size: 'sm',
            onClick: () => {
              editing = false;
              draw();
              root.querySelector('.pa-vt-edit-btn')?.focus();
            },
          }),
      ),
    );
  }

  function shown() {
    const by = t.updated_by_name || 'الإدارة';
    const when = t.updated_at ? h('time', { datetime: t.updated_at, title: dateTime(t.updated_at) }, relative(t.updated_at)) : null;
    const edit = readOnly
      ? null
      : button('تعديل', {
          variant: 'link',
          size: 'sm',
          icon: 'edit',
          className: 'pa-vt-edit-btn',
          onClick: () => {
            editing = true;
            draw();
            root.querySelector('textarea')?.focus();
          },
        });
    if (t.status === 'unclear') {
      return h('div.pa-vt-done', h('p.pa-vt-meta', h('span', `غير مفهومة — ${by}`), edit));
    }
    return h(
      'div.pa-vt-done',
      h('p.pa-vt-text', { dir: 'auto' }, t.text || ''),
      h('p.pa-vt-meta', h('span', `كتبتها ${by} `, when), edit),
    );
  }

  function draw() {
    root.dataset.status = t.status;
    root.classList.toggle('is-pending', t.status === 'pending');
    mount(
      root,
      h(
        'div.pa-vt-head',
        h('span.pa-vt-title', icon('mic', { size: 15 }), 'نص الرسالة الصوتية'),
        badge(STATUS_TEXT[t.status] || t.status, STATUS_TONES[t.status] || 'neutral', { className: 'pa-vt-status' }),
        (player || audio) && speedControl(target),
      ),
      player,
      readOnly && t.status === 'pending' ? h('p.small.muted', 'لم تُكتب بعد.') : t.status === 'pending' || editing ? editor() : shown(),
      live,
    );
  }

  draw();
  return root;
}

/** «حُفظ النص — باقي 2 رسالتان…» بصيغة سليمة للعدد */
export function voiceLeftText(n) {
  if (n === 1) return 'حُفظ النص — باقي رسالة صوتية واحدة';
  if (n === 2) return 'حُفظ النص — باقي رسالتان صوتيتان';
  if (n >= 3 && n <= 10) return `حُفظ النص — باقي ${n} رسائل صوتية`;
  return `حُفظ النص — باقي ${n} رسالة صوتية`;
}
