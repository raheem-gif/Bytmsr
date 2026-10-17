// v9.2 (admin-ai) — نص الرسالة الصوتية: تسمعها الإدارة وتكتب ما قالته المستفيدة بكلامها، أو تعلّمها «مش مفهومة».
// لا تحويل آلي ولا يُرسل أي صوت لـ Claude؛ النص المكتوب يدخل ملخص القصة. النصوص للإدارة فقط (لا تظهر للمحامين ولا في صفحتها).
//
// v12 media (MD-8، M12-10، L12-35، L12-60): حين توجد مسودة آلية (note.auto) والنص لم يُكتب بعد: «نص آلي للمراجعة» والنص
// في المحرر قابلًا للتعديل، و«النص الآلي غير مؤكد. استمع إلى الرسالة قبل التأكيد.» حين الثقة غير معروفة أو أقل من 0.6.
// «تأكيد النص» معطّل حتى تُشغَّل الرسالة 80٪ على الأقل في هذا الصندوق أو يُعدَّل النص («استمع إلى الرسالة أولًا.»).
// في الانتظار: «جارٍ التحويل إلى نص…» مع تحديث كل 10 ثوانٍ لا يمس محررًا فيه تركيز أو تعديل. تعذّر أو لم يُحوَّل:
// «لم يُحوَّل آليًا: {السبب}» و«حوّل الآن». الحفظ يرسل from_auto وlistened وplayed_ratio. التحويل غير مضبوط ← واجهة 11.0.

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

// v12 media (MD-8): نصوص المسودة الآلية (L12-35، L12-60)
export const VT_AUTO = {
  label: 'نص آلي للمراجعة',
  lowConf: 'النص الآلي غير مؤكد. استمع إلى الرسالة قبل التأكيد.',
  listenFirst: 'استمع إلى الرسالة أولًا.',
  empty: 'لا يوجد كلام مفهوم',
  working: 'جارٍ التحويل إلى نص…',
  failed: (why) => `لم يُحوَّل آليًا: ${why}`,
  runNow: 'حوّل الآن',
  confirm: 'تأكيد النص',
  unclear: 'الرسالة غير مفهومة',
};
/** نسبة ما شُغّل من الرسالة في هذا العنصر (TimeRanges.played ÷ المدة) */
export function playedRatio(audio) {
  try {
    const d = audio && Number(audio.duration);
    if (!audio || !Number.isFinite(d) || d <= 0) return 0;
    let sum = 0;
    for (let i = 0; i < audio.played.length; i++) sum += audio.played.end(i) - audio.played.start(i);
    return Math.max(0, Math.min(1, sum / d));
  } catch {
    return 0;
  }
}
const normText = (x) => String(x || '').replace(/\s+/g, ' ').trim();
const POLL_MS = 10_000;

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
      tag: 'VTR-11',
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
  let auto = note.auto || null; // v12 media (MD-8): للفريق فقط
  let editing = false;
  let dirty = false; // في المحرر نص لم يُحفظ (لا يستبدله التحديث الدوري)
  let pollTimer = null;
  const root = h('div.pa-vt', { dataset: { doc: String(note.document_id), status: t.status }, tag: 'VTR-01' });
  const live = h('p.sr-only', { 'aria-live': 'polite' });
  const player = withPlayer && src ? h('audio.doc-audio-player', { controls: true, preload: 'metadata', src, 'aria-label': 'رسالة صوتية من المستفيدة' }) : null;
  const target = () => player || audio;

  async function save(body) {
    // v12 media (L12-60): مراجعة المسودة الآلية ← هل سُمعت الرسالة في هذا الصندوق، وكم شُغّل منها
    if (hasDraft()) {
      const ratio = playedRatio(target());
      Object.assign(body, { from_auto: true, listened: ratio >= 0.8, played_ratio: Math.round(ratio * 1000) / 1000 });
    }
    const res = await api.put(`/admin/voice-notes/${encodeURIComponent(note.document_id)}/transcript`, body);
    Object.assign(t, res.transcript || {});
    if (res.auto !== undefined) auto = res.auto;
    editing = false;
    dirty = false;
    draw();
    live.textContent = 'حُفظ النص';
    if (onSaved) await onSaved(res);
    return res;
  }

  /** مسودة آلية جاهزة لهذه الرسالة والنص لم يُكتب بعد */
  function hasDraft() {
    return !!auto && (auto.state === 'done' || auto.state === 'empty') && t.status === 'pending';
  }

  // ───── v12 media (MD-8): «حوّل الآن» والتحديث كل 10 ثوانٍ أثناء التحويل ─────
  async function runNow(btn) {
    btn.disabled = true;
    try {
      await api.post(`/admin/voice-notes/${encodeURIComponent(note.document_id)}/auto`, {});
      auto = { ...(auto || {}), state: 'queued', error: null, error_label: null };
      draw();
      startPoll();
    } catch (err) {
      btn.disabled = false;
      const msg = (err && err.message) || 'تعذر طلب التحويل';
      if (err && err.status === 409) {
        auto = { ...(auto || {}), state: 'skipped', error_label: msg };
        draw();
      } else live.textContent = msg;
    }
  }
  function busyEditor() {
    const ae = document.activeElement;
    return dirty || (ae && root.contains(ae) && /^(TEXTAREA|INPUT)$/.test(ae.tagName));
  }
  function startPoll() {
    if (pollTimer || !note.intake_id) return;
    pollTimer = setInterval(async () => {
      if (!root.isConnected) return stopPoll();
      if (!auto || (auto.state !== 'queued' && auto.state !== 'running')) return stopPoll();
      try {
        const d = await api.get(`/admin/intakes/${encodeURIComponent(note.intake_id)}`, null, { background: true });
        const fresh = (d.voice_notes || []).find((x) => x.document_id === note.document_id);
        if (!fresh || !fresh.auto) return;
        if (fresh.auto.state === 'queued' || fresh.auto.state === 'running') return;
        if (busyEditor()) return; // لا يُستبدل محرر فيه تركيز أو نص لم يُحفظ؛ المحاولة التالية بعد 10 ثوانٍ
        auto = fresh.auto;
        Object.assign(t, fresh.transcript || {});
        stopPoll();
        draw();
        live.textContent = auto.state === 'done' ? 'وصل النص الآلي للمراجعة' : '';
      } catch {
        /* محاولة لاحقة */
      }
    }, POLL_MS);
  }
  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /** سطر حالة التحويل الآلي فوق محرر 11.0 (في الانتظار، تعذّر، أو لم يُحوَّل بعد) */
  function autoStatus() {
    if (!auto || t.status !== 'pending' || readOnly) return null;
    if (auto.state === 'queued' || auto.state === 'running') {
      startPoll();
      return h('p.small.muted.pa-vt-auto', { tag: 'VTR-07', role: 'status' }, VT_AUTO.working);
    }
    const run = auto.can_run ? h('button.btn-link.pa-vt-run', { type: 'button', tag: 'VTR-08', onClick: (e) => runNow(e.currentTarget) }, VT_AUTO.runNow) : null;
    if (auto.state === 'failed' || auto.state === 'skipped') return h('p.small.muted.pa-vt-auto', h('span', VT_AUTO.failed(auto.error_label || 'تعذر التحويل')), run ? ' ' : null, run);
    if (auto.state === 'none' && run) return h('p.small.muted.pa-vt-auto', run);
    return null;
  }

  /** المحرر بمسودة آلية (L12-60): التأكيد بعد سماع 80٪ من الرسالة أو تعديل النص */
  function draftEditor() {
    const id = uid('vt-auto');
    const draftText = auto.text || '';
    const low = !(Number.isFinite(auto.confidence) && auto.confidence >= 0.6);
    const ta = h('textarea.input.pa-vt-input', { id, rows: 3, maxlength: 5000, dir: 'auto', tag: 'VTR-04', 'aria-describedby': `${id}-gate` });
    ta.value = draftText;
    const err = h('p.field-error', { role: 'alert', hidden: true });
    const gate = h('p.field-hint.pa-vt-gate', { id: `${id}-gate`, tag: 'VTR-09' }, VT_AUTO.listenFirst);
    const confirmBtn = asyncButton(
      VT_AUTO.confirm,
      async () => {
        const text = ta.value.trim();
        if (!text) {
          err.textContent = 'اكتب ما سمعته أولًا، أو اختر «الرسالة غير مفهومة».';
          err.hidden = false;
          ta.focus();
          return;
        }
        err.hidden = true;
        await save({ text });
      },
      { variant: 'primary', size: 'sm', icon: 'check', className: 'pa-vt-save', tag: 'VTR-12' },
    );
    confirmBtn.dataset.tag = 'VTR-05';
    const unclearBtn = asyncButton(VT_AUTO.unclear, () => save({ unclear: true }), { variant: 'ghost', size: 'sm', icon: 'x', className: 'pa-vt-unclear', tag: 'VTR-13' });
    unclearBtn.dataset.tag = 'VTR-06';
    const a = target();
    const refresh = () => {
      const edited = normText(ta.value) !== normText(draftText);
      dirty = edited;
      const ok = edited || playedRatio(target()) >= 0.8;
      confirmBtn.disabled = !ok || !ta.value.trim();
      gate.hidden = ok;
    };
    ta.addEventListener('input', refresh);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !confirmBtn.disabled) {
        e.preventDefault();
        confirmBtn.click();
      }
    });
    if (a) for (const ev of ['timeupdate', 'ended', 'pause', 'seeked']) a.addEventListener(ev, refresh);
    refresh();
    return h(
      'div.pa-vt-edit',
      low ? h('p.vt-warn', { tag: 'VTR-03' }, VT_AUTO.lowConf) : null,
      auto.state === 'empty' ? h('p.small.muted', { tag: 'VTR-10' }, VT_AUTO.empty) : null,
      h('label.sr-only', { for: id }, 'النص الآلي للرسالة الصوتية، راجعه وعدّله قبل التأكيد'),
      ta,
      err,
      h('div.pa-vt-actions', confirmBtn, unclearBtn),
      gate,
    );
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
      tag: 'VTR-14',
    });
    ta.value = t.status === 'confirmed' ? t.text || '' : '';
    ta.addEventListener('input', () => (dirty = ta.value.trim() !== '')); // v12 media: التحديث الدوري لا يمس نصًا يُكتب
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
      { variant: 'primary', size: 'sm', icon: 'check', className: 'pa-vt-save', tag: 'VTR-15' },
    );
    const unclearBtn = asyncButton('الرسالة مش مفهومة', () => save({ unclear: true }), { variant: 'ghost', size: 'sm', icon: 'x', className: 'pa-vt-unclear', tag: 'VTR-16' });
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
            tag: 'VTR-17',
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
          tag: 'VTR-18',
        });
    if (t.status === 'unclear') {
      return h('div.pa-vt-done', h('p.pa-vt-meta', h('span', `غير مفهومة — ${by}`), edit));
    }
    // v12 media (M §4.4): من المسودة الآلية كما هي أو بعد تعديلها
    const oc = auto && auto.outcome ? String(auto.outcome) : '';
    const from = oc.startsWith('accepted') ? 'من النص الآلي ' : oc.startsWith('edited') ? 'بعد تعديل النص الآلي ' : null;
    return h(
      'div.pa-vt-done',
      h('p.pa-vt-text', { dir: 'auto' }, t.text || ''),
      h('p.pa-vt-meta', h('span', `كتبتها ${by} `, from, when), edit),
    );
  }

  function draw() {
    root.dataset.status = t.status;
    root.dataset.auto = auto ? auto.state : '';
    root.classList.toggle('is-pending', t.status === 'pending');
    const draft = !readOnly && hasDraft() && !editing;
    mount(
      root,
      h(
        'div.pa-vt-head',
        h('span.pa-vt-title', icon('mic', { size: 15 }), 'نص الرسالة الصوتية'),
        badge(STATUS_TEXT[t.status] || t.status, STATUS_TONES[t.status] || 'neutral', { className: 'pa-vt-status' }),
        draft ? h('span.state.state--info', { tag: 'VTR-02' }, VT_AUTO.label) : null,
        (player || audio) && speedControl(target),
      ),
      player,
      readOnly && t.status === 'pending' ? h('p.small.muted', 'لم تُكتب بعد.') : draft ? draftEditor() : t.status === 'pending' || editing ? [autoStatus(), editor()] : shown(),
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
