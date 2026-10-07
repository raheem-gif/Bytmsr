// بوابة المحامي — ملف مستمر (الإصدار 9.1 — مسار l-court، L-02/L-18/L-22).
// ما يحتاجه المحامي في ممر المحكمة: المحكمة والدائرة ورقم الدعوى في سطر، جلسة بلا نتيجة أولًا مع «سجّل النتيجة»،
// ثم الجلسات في ثلاث مجموعات (بانتظار النتيجة / القادمة / السابقة)، والمهام، والمستندات، وبيانات الدعوى مطوية.
// التواصل مع المستفيد/ة وتذكيره من مسؤولية الإدارة؛ ما يكتبه المحامي من مواعيد تراجعه الإدارة قبل أي تذكير.
// الرابط #/my/matters/:id?outcome=:eventId يفتح ورقة النتيجة مباشرة (من إشعار «لم تُسجَّل نتيجة جلسة اليوم»).

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, date, shortDate, time, weekday, isoToCairoDate, cairoToday, cairoInputToIso } from '../../../lib/fmt.js';
import { card, alertBox, badge, dueBadge, button, toast, emptyState, errorState, icon, richText, codeTag, modal, confirmDialog, setBusy, uid, errorMessage } from '../../../lib/ui.js';
import { eventDateBox } from './matters.js';
import { openOutcomeSheet, openAddHearingSheet, openEditEventSheet, outcomeLine, longDay, addDaysKey } from '../../components/outcome-sheet.js';
import { initOutbox, outboxSend, outboxStateFor, onOutboxChange, dismissOutboxFailure, QUEUED_TEXT } from '../../components/outbox.js';
import { docList } from '../../components/doc-viewer.js';
import { count, matterStatus } from '../../words.js';

const BEN = 'المستفيد/ة';
const COURT_KINDS = ['hearing', 'expert'];
const PAST_SHOWN = 3;

/** يغلف معالج نقر غير متزامن: أي خطأ يظهر في رسالة بدل أن يضيع. */
const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    toast(errorMessage(err), 'danger');
  }
};

const bdi = (v) => h('bdi.lc-num', { dir: 'ltr' }, String(v));

/** «الأربعاء 7 أكتوبر · 9:30 ص» */
const whenText = (iso) => `${weekday(iso)} ${shortDate(iso)} · ${time(iso)}`;

/** سطر المحكمة: «محكمة جنح مدينة نصر · الدائرة 12 جنح · رقم 25416 لسنة 2026» */
export function courtLine(m) {
  const parts = [];
  if (m.court) parts.push(h('span', m.court));
  if (m.circuit) parts.push(h('span', m.circuit));
  if (m.lawsuit_number) parts.push(h('span.nowrap', 'رقم ', bdi(m.lawsuit_number), m.lawsuit_year ? [' لسنة ', bdi(m.lawsuit_year)] : null));
  const out = [];
  parts.forEach((p, i) => {
    if (i) out.push(h('span.lc-sep', { 'aria-hidden': 'true' }, ' · '));
    out.push(p);
  });
  return out;
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const base = `/lawyer/matters/${encodeURIComponent(id)}`;
  if (ctx.user) initOutbox(ctx.user);

  let data;
  try {
    data = await api.get(base);
  } catch (err) {
    return h('div.lc-page', h('h1.page-title', 'ملف مستمر'), card({ body: errorState(err, () => ctx.reload()) }));
  }
  ctx.setTitle(data.matter.code);

  const isClosed = () => data.matter.status === 'closed';
  const now = () => Date.now();
  const isCourt = (e) => COURT_KINDS.includes(e.kind);
  const pending = () =>
    data.events
      .filter((e) => e.status === 'scheduled' && isCourt(e) && Date.parse(e.starts_at) <= now())
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const upcoming = () =>
    data.events.filter((e) => e.status === 'scheduled' && Date.parse(e.starts_at) > now()).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const past = () => data.events.filter((e) => !pending().includes(e) && !upcoming().includes(e)).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));

  const hosts = { pending: h('div.lc-pending-host'), events: h('div'), tasks: h('div'), bar: h('div.lc-bar-host') };
  let showAllPast = false;

  // ───────────── تحديث الصفوف المتأثرة فقط ─────────────

  function upsertEvent(e) {
    if (!e) return;
    const i = data.events.findIndex((x) => x.id === e.id);
    if (i >= 0) data.events[i] = { ...data.events[i], ...e };
    else data.events.push(e);
  }
  function upsertTask(t) {
    if (!t) return;
    const i = data.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) data.tasks[i] = { ...data.tasks[i], ...t };
    else data.tasks.push(t);
  }
  function applyOutcome(res) {
    if (!res) return;
    upsertEvent(res.event);
    upsertEvent(res.next_event);
    upsertTask(res.task);
    // تعديل النتيجة قد يلغي الجلسة المولّدة سابقًا أو مهمة ميعاد الطعن: تُحدَّث صفوفها أيضًا
    upsertEvent(res.cancelled_event);
    upsertTask(res.cancelled_task);
    drawEvents();
    drawTasks();
  }
  async function refresh() {
    data = await api.get(base);
    drawEvents();
    drawTasks();
  }

  function recordOutcome(e) {
    if (isClosed()) return;
    openOutcomeSheet({
      event: e,
      user: ctx.user,
      onSaved: applyOutcome,
      onQueued: () => drawEvents(),
    });
  }

  // ───────────── الترويسة ─────────────

  function headerNode() {
    const m = data.matter;
    return h(
      'header.lc-head',
      h('div.lc-head-top', codeTag(m.code), m.status !== 'open' ? badge(matterStatus(m.status), m.status === 'closed' ? 'neutral' : 'warning', { dot: true }) : null),
      h('h1.page-title.lc-title', m.title),
      h('p.lc-court-line', courtLine(m)),
      isClosed()
        ? null
        : h(
            'div.lc-head-actions',
            button('إضافة جلسة', { variant: 'secondary', icon: 'calendar', onClick: safe(addHearing) }),
            button('إضافة مهمة', { variant: 'secondary', icon: 'plus', onClick: safe(addTask) }),
          ),
    );
  }

  // ───────────── جلسة بلا نتيجة ─────────────

  function pendingCard() {
    const list = pending();
    if (!list.length || isClosed()) return null;
    const e = list[0];
    const q = outboxStateFor(`event:${e.id}`);
    return h(
      'section.lc-pending-card',
      { 'aria-labelledby': 'lc-pending-title' },
      h(
        'div.lc-pending-text',
        h('h2#lc-pending-title.lc-pending-title', icon('alert', { size: 18 }), `${list.length > 1 ? count(list.length, 'hearing') + ' بلا نتيجة' : 'جلسة بلا نتيجة'} — ${shortDate(e.starts_at)} ${time(e.starts_at)}`),
        h('p.lc-pending-sub', e.title),
        q && q.state === 'queued' ? h('p.lc-queued', icon('clock', { size: 14 }), QUEUED_TEXT) : null,
      ),
      q && q.state === 'queued' ? null : button('سجّل النتيجة', { variant: 'primary', size: 'lg', icon: 'edit', className: 'lc-pending-btn', onClick: () => recordOutcome(e) }),
    );
  }

  // ───────────── الجلسات ─────────────

  function attendanceBadge(e, isUpcoming) {
    if (!Number(e.client_attendance_required)) return null;
    return h(
      'p.lc-attend',
      icon('user', { size: 14 }),
      h('span', isUpcoming ? `يلزم حضور ${BEN} — تذكير آلي قبل الموعد بثلاثة أيام ثم قبله بيوم` : `كان يلزم حضور ${BEN}`),
    );
  }

  function queueLine(e) {
    const q = outboxStateFor(`event:${e.id}`);
    if (!q) return null;
    if (q.state === 'queued') return h('p.lc-queued', icon('clock', { size: 14 }), QUEUED_TEXT);
    return h(
      'p.lc-failed',
      icon('alert', { size: 14 }),
      h('span', `لم يُحفظ: ${q.item.error}`),
      h('button.lc-reveal.lc-inline', {
        type: 'button',
        onClick: () => {
          dismissOutboxFailure(q.item.id);
          recordOutcome(e);
        },
      }, 'افتح'),
    );
  }

  function eventRow(e, group) {
    const kindBadge = e.title && e.title.trim() !== label('event_kind', e.kind) && e.kind !== 'hearing' ? badge(label('event_kind', e.kind), 'neutral') : null;
    let actions = null;
    if (!isClosed()) {
      if (group === 'pending') {
        const q = outboxStateFor(`event:${e.id}`);
        actions = q && q.state === 'queued' ? null : button('سجّل النتيجة', { variant: 'primary', icon: 'edit', className: 'lc-ev-primary', onClick: () => recordOutcome(e) });
      } else if (group === 'upcoming') {
        actions = h('button.lc-more', { type: 'button', 'aria-label': `خيارات ${e.title}`, onClick: () => eventMenu(e) }, icon('more', { size: 22 }));
      } else if (isCourt(e) && (e.outcome_kind || e.outcome) && e.status !== 'cancelled') {
        actions = h('button.lc-reveal.lc-small', { type: 'button', onClick: () => recordOutcome(e) }, 'تعديل النتيجة');
      } else if (isCourt(e) && e.status === 'cancelled' && e.outcome_kind) {
        actions = h('button.lc-reveal.lc-small', { type: 'button', onClick: () => recordOutcome(e) }, 'تعديل النتيجة');
      } else if (!isCourt(e) && e.status === 'scheduled') {
        actions = h('button.lc-reveal.lc-small', { type: 'button', onClick: safe(() => markEventDone(e)) }, 'تمّ الموعد');
      }
    }
    const line = outcomeLine(e);
    return h(
      'li.lc-ev',
      { class: `is-${group}`, dataset: { eventId: e.id } },
      eventDateBox(e.starts_at, { muted: e.status === 'cancelled' }),
      h(
        'div.lc-ev-main',
        h('div.lc-ev-title', h('span', e.title || label('event_kind', e.kind)), kindBadge),
        // المكان يُذكر فقط إن اختلف عن المحكمة المكتوبة في رأس الصفحة
        h('p.lc-ev-when', h('span', whenText(e.starts_at)), e.location && e.location !== data.matter.court ? h('span.lc-ev-loc', ` · ${e.location}`) : null),
        group === 'past' && line ? h('p.lc-ev-outcome', richText(line)) : null,
        group === 'past' && !line && e.status === 'cancelled' ? h('p.lc-ev-outcome.muted', 'أُلغيت') : null,
        group === 'past' && !line && e.status === 'done' ? h('p.lc-ev-outcome.muted', 'تمّ') : null,
        attendanceBadge(e, group === 'upcoming'),
        // v9.1 fixes: لقاء وعدت به الإدارة المستفيد/ة باسمك، وردها على الحضور
        group !== 'past' && e.client_attendance_label ? h('p.lc-attend', icon(e.client_attendance === 'not_coming' ? 'alert' : 'check', { size: 14 }), h('span', e.client_attendance_label)) : null,
        group !== 'past' && e.meeting_promise ? h('p.lc-attend', icon('mapPin', { size: 14 }), h('span', e.meeting_promise)) : null,
        e.notes ? h('p.lc-ev-notes', richText(e.notes)) : null,
        queueLine(e),
      ),
      actions ? h('div.lc-ev-actions', actions) : null,
    );
  }

  function group(title, list, g, extra) {
    if (!list.length) return null;
    return h('section.lc-group', { class: `lc-group-${g}` }, h('h3.lc-group-title', title, h('span.lc-count', ` (${list.length})`)), h('ul.lc-ev-list', list.map((e) => eventRow(e, g))), extra || null);
  }

  function eventsCard() {
    const p = pending();
    const u = upcoming();
    const past_ = past();
    const shownPast = showAllPast ? past_ : past_.slice(0, PAST_SHOWN);
    const more =
      past_.length > PAST_SHOWN && !showAllPast
        ? h('button.lc-reveal', { type: 'button', onClick: () => { showAllPast = true; drawEvents(); } }, `عرض الكل (${past_.length})`)
        : null;
    const body = data.events.length
      ? frag(
          group('بانتظار النتيجة', p, 'pending'),
          group('القادمة', u, 'upcoming'),
          !u.length ? h('p.muted.small.lc-none', 'لا توجد جلسات قادمة مسجلة.') : null,
          group('السابقة', shownPast, 'past', more),
          h('p.lc-muted-line', icon('zap', { size: 14 }), `الجلسات التي يلزم فيها حضور ${BEN}: تذكير آلي قبلها بثلاثة أيام ثم قبلها بيوم، بعد مراجعة الإدارة.`),
        )
      : emptyState('لم تُسجَّل جلسات في هذا الملف بعد.', isClosed() ? null : button('إضافة جلسة', { variant: 'secondary', icon: 'calendar', onClick: safe(addHearing) }), { compact: true, icon: 'calendar' });
    return card({ title: 'الجلسات', icon: 'gavel', className: 'lc-card lc-events-card', body });
  }

  function eventMenu(e) {
    const m = modal({
      title: e.title || 'الجلسة',
      subtitle: whenText(e.starts_at),
      sheet: true,
      className: 'lc-menu-sheet',
      body: h(
        'div.lc-menu',
        h('button.lc-menu-item', { type: 'button', onClick: () => { m.close('action'); editEvent(e); } }, icon('edit', { size: 20 }), h('span', 'تعديل الموعد')),
        h(
          'button.lc-menu-item.is-danger',
          { type: 'button', onClick: safe(async () => { m.close('action'); await cancelEvent(e); }) },
          icon('x', { size: 20 }),
          h('span', 'أُلغيت الجلسة'),
        ),
      ),
    });
  }

  function editEvent(e) {
    openEditEventSheet({ event: e, matter: data.matter, onSaved: (row) => { upsertEvent(pickEvent(row)); drawEvents(); } });
  }

  /** صف من PATCH (الصف الخام من الخادم) → الحقول التي تعرضها الصفحة */
  function pickEvent(row) {
    if (!row) return null;
    const keep = ['id', 'kind', 'title', 'starts_at', 'location', 'client_attendance_required', 'status', 'notes', 'outcome'];
    return Object.fromEntries(keep.filter((k) => k in row).map((k) => [k, row[k]]));
  }

  async function cancelEvent(e) {
    const ok = await confirmDialog({ title: 'أُلغيت الجلسة؟', message: `ستُعلَّم «${e.title}» يوم ${whenText(e.starts_at)} ملغاة، ولن يُرسل تذكير بها.`, confirmLabel: 'نعم، أُلغيت', cancelLabel: 'رجوع', danger: true });
    if (!ok) return;
    const row = await api.patch(`/lawyer/matter-events/${encodeURIComponent(e.id)}`, { status: 'cancelled' });
    upsertEvent(pickEvent(row));
    drawEvents();
    toast('سُجّلت الجلسة ملغاة.', 'success');
  }

  async function markEventDone(e) {
    const row = await api.patch(`/lawyer/matter-events/${encodeURIComponent(e.id)}`, { status: 'done' });
    upsertEvent(pickEvent(row));
    drawEvents();
    toast('سُجّل الموعد منتهيًا.', 'success');
  }

  async function addHearing() {
    const ev = await openAddHearingSheet({ matter: data.matter });
    if (!ev) return;
    await refresh();
  }

  // ───────────── المهام ─────────────

  async function setTaskStatus(t, status, btn) {
    const prev = t.status;
    setBusy(btn, true);
    // واجهة متفائلة: يتغير الصف فورًا، ويُرسل الطلب (أو يُحفظ في الصندوق بلا شبكة)
    upsertTask({ ...t, status, done_at: status === 'done' ? new Date().toISOString() : null });
    try {
      const r = await outboxSend({ kind: 'task', method: 'PATCH', path: `/lawyer/matter-tasks/${encodeURIComponent(t.id)}`, body: { status }, ref: `task:${t.id}`, label: `المهمة «${t.title}»` });
      if (r.status === 'sent' && r.data) upsertTask(r.data);
      if (r.status === 'queued') toast('لا يوجد اتصال. سيُرسل تلقائيًا عند عودة الشبكة.', 'warning', 5000);
      else toast(status === 'done' ? 'سُجّلت المهمة: تمّت.' : 'أُعيد فتح المهمة.', 'success');
    } catch (err) {
      upsertTask({ ...t, status: prev });
      toast(errorMessage(err), 'danger');
    } finally {
      drawTasks();
    }
  }

  function taskRow(t) {
    const done = t.status === 'done';
    const cancelled = t.status === 'cancelled';
    const q = outboxStateFor(`task:${t.id}`);
    let action = null;
    if (!isClosed() && !cancelled && !(q && q.state === 'queued')) {
      action = done
        ? h('button.btn.btn-ghost.btn-sm.lc-task-btn', { type: 'button', onClick: (ev) => setTaskStatus(t, 'open', ev.currentTarget) }, h('span.btn-label', 'إعادة فتح'))
        : h('button.btn.btn-secondary.btn-sm.lc-task-btn', { type: 'button', onClick: (ev) => setTaskStatus(t, 'done', ev.currentTarget) }, icon('check', { size: 16 }), h('span.btn-label', 'تمّت'));
    }
    return h(
      'li.lc-task',
      { class: [done && 'is-done', cancelled && 'is-cancelled'], dataset: { taskId: t.id } },
      h('span.lc-task-icon', { 'aria-hidden': 'true', class: done ? 'tone-success' : Number(t.procedural) ? 'tone-warning' : 'tone-info' }, icon(done ? 'checkCircle' : Number(t.procedural) ? 'flag' : 'check', { size: 18 })),
      h(
        'div.lc-task-main',
        h('p.lc-task-title', richText(t.title)),
        h(
          'p.lc-task-meta',
          Number(t.procedural) ? badge('موعد إجرائي', 'warning') : null,
          t.due_at && !done && !cancelled ? h('span', `${weekday(t.due_at)} ${shortDate(t.due_at)}`) : null,
          t.due_at && !done && !cancelled ? dueBadge(t.due_at) : null,
          done ? h('span.muted', t.done_at ? `تمّت ${shortDate(t.done_at)}` : 'تمّت') : null,
          cancelled ? h('span.muted', 'أُلغيت') : null,
        ),
        t.details ? h('p.lc-task-details', richText(t.details)) : null,
        q && q.state === 'queued' ? h('p.lc-queued', icon('clock', { size: 14 }), QUEUED_TEXT) : null,
        q && q.state === 'failed'
          ? h('p.lc-failed', icon('alert', { size: 14 }), h('span', `لم يُحفظ: ${q.item.error}`), h('button.lc-reveal.lc-inline', { type: 'button', onClick: () => { dismissOutboxFailure(q.item.id); refresh(); } }, 'افتح'))
          : null,
      ),
      action ? h('div.lc-task-actions', action) : null,
    );
  }

  function tasksCard() {
    const order = { open: 0, done: 1, cancelled: 2 };
    const tasks = [...data.tasks].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')));
    return card({
      title: 'المهام',
      icon: 'check',
      className: 'lc-card',
      body: tasks.length ? h('ul.lc-task-list', tasks.map(taskRow)) : emptyState('لا توجد مهام في هذا الملف.', null, { compact: true, icon: 'check' }),
    });
  }

  function addTask() {
    return new Promise((resolve) => {
      let created = null;
      const s = { title: '', date: '', procedural: false, details: '' };
      const tid = uid('lctt');
      const titleInput = h('input.input', { id: tid, type: 'text', maxLength: 300, required: true, placeholder: 'مثال: تقديم مذكرة بالدفاع قبل الجلسة', onInput: (e) => { s.title = e.target.value; validate(); } });
      const did = uid('lctd');
      const echo = h('p.lc-date-echo', { 'aria-live': 'polite', hidden: true });
      const dateInput = h('input.input', { id: did, type: 'date', min: cairoToday(), max: addDaysKey(cairoToday(), 730), onInput: (e) => onDate(e.target.value), onChange: (e) => onDate(e.target.value) });
      function onDate(v) {
        s.date = v;
        echo.textContent = /^\d{4}-\d{2}-\d{2}$/.test(v) ? longDay(v) : '';
        echo.hidden = !echo.textContent;
        validate();
      }
      const procInput = h('input.lc-switch-input', { type: 'checkbox', role: 'switch', onChange: (e) => { s.procedural = e.target.checked; validate(); } });
      const status = h('p.lc-sheet-status.tone-danger', { role: 'status', hidden: true });
      const saveBtn = h('button.btn.btn-primary.btn-lg.btn-block.lc-save', { type: 'button', disabled: true }, h('span.btn-label', 'إضافة المهمة'));
      const detailsHost = h('div');
      mount(
        detailsHost,
        h('button.lc-reveal', {
          type: 'button',
          onClick: () => {
            const xid = uid('lctx');
            const ta = h('textarea.textarea', { id: xid, rows: 2, maxLength: 3000, onInput: (e) => { s.details = e.target.value; } });
            mount(detailsHost, h('div.field', h('label.field-label', { htmlFor: xid }, 'تفاصيل'), ta));
            ta.focus();
          },
        }, '+ تفاصيل'),
      );
      function validate() {
        const ok = s.title.trim().length > 0 && (!s.procedural || /^\d{4}-\d{2}-\d{2}$/.test(s.date));
        saveBtn.disabled = !ok;
        return ok;
      }
      saveBtn.addEventListener('click', async () => {
        if (!validate()) return;
        setBusy(saveBtn, true);
        status.hidden = true;
        try {
          created = await api.post(`${base}/tasks`, {
            title: s.title.trim(),
            due_at: s.date ? cairoInputToIso(`${s.date}T23:59`) : undefined,
            procedural: Boolean(s.procedural),
            details: s.details.trim() || undefined,
          });
          m.close('saved');
          toast('أُضيفت المهمة.', 'success');
        } catch (err) {
          status.hidden = false;
          status.textContent = err && err.status === 0 ? 'لا يوجد اتصال. لم تُضف المهمة بعد — أعد المحاولة عند عودة الشبكة.' : errorMessage(err);
        } finally {
          setBusy(saveBtn, false);
          validate();
        }
      });
      const m = modal({
        title: 'إضافة مهمة',
        sheet: true,
        className: 'lc-task-sheet',
        body: h(
          'div.lc-sheet-body',
          h('div.field', h('label.field-label', { htmlFor: tid }, 'المهمة', h('span.req', { 'aria-hidden': 'true' }, '*')), titleInput),
          h('div.field', h('label.field-label', { htmlFor: did }, 'الموعد (اختياري)'), dateInput, echo),
          h('label.lc-switch', procInput, h('span.lc-switch-track', { 'aria-hidden': 'true' }), h('span.lc-switch-text', 'موعد إجرائي (مثل ميعاد طعن أو تقديم مذكرة) — ينبّهك النظام قبله بثلاثة أيام')),
          detailsHost,
          status,
        ),
        beforeClose: async () => (!s.title && !s.date && !s.details ? true : confirmDialog({ title: 'تجاهل ما أدخلته؟', message: 'لم تُضف المهمة بعد.', confirmLabel: 'تجاهل', cancelLabel: 'متابعة', danger: true })),
        onClose: async () => {
          if (created) {
            upsertTask(created);
            drawTasks();
          }
          resolve(created);
        },
      });
      m.el.appendChild(h('div.lc-sheet-footer', saveBtn));
    });
  }

  // ───────────── المستندات وبيانات الدعوى ─────────────

  function docsCard() {
    const docs = data.documents || [];
    return card({
      title: 'المستندات',
      icon: 'paperclip',
      className: 'lc-card',
      body: docs.length ? docList(docs, { source: false }) : emptyState('لا توجد مستندات في هذا الملف. تضيف الإدارة مستندات الدعوى عند استلامها.', null, { compact: true, icon: 'paperclip' }),
    });
  }

  function infoDetails() {
    const m = data.matter;
    const rows = [
      [BEN, data.client_name],
      ['الخصم', m.opponent],
      ['تاريخ فتح الملف', m.opened_at && date(m.opened_at)],
    ].filter(([, v]) => v);
    return h(
      'details.lc-details',
      h('summary', icon('scale', { size: 18 }), h('span', 'بيانات الدعوى'), icon('chevronDown', { size: 18, className: 'lc-chev' })),
      h(
        'div.lc-details-body',
        h('dl.lc-dl', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v)))),
        m.notes ? h('div.lc-assign-notes', h('h3.lc-group-title', 'تكليف الإدارة وملاحظاتها'), h('p.pre', richText(m.notes))) : null,
      ),
    );
  }

  // ───────────── الشريط السفلي (الهاتف) ─────────────

  function barNode() {
    if (isClosed()) return null;
    const p = pending().filter((e) => !(outboxStateFor(`event:${e.id}`)?.state === 'queued'));
    return h(
      'div.lc-bottom-bar',
      p.length
        ? button('سجّل النتيجة', { variant: 'primary', size: 'lg', icon: 'edit', onClick: () => recordOutcome(p[0]) })
        : button('إضافة جلسة', { variant: 'primary', size: 'lg', icon: 'calendar', onClick: safe(addHearing) }),
      button('إضافة مهمة', { variant: 'secondary', size: 'lg', icon: 'plus', onClick: safe(addTask) }),
    );
  }

  // ───────────── الرسم ─────────────

  function drawEvents() {
    mount(hosts.pending, pendingCard());
    mount(hosts.events, eventsCard());
    mount(hosts.bar, barNode());
  }
  function drawTasks() {
    mount(hosts.tasks, tasksCard());
  }
  drawEvents();
  drawTasks();

  // صندوق الصادر: عند إرسال ما كان منتظرًا (أو رفضه) تُحدَّث الصفوف المتأثرة
  const off = onOutboxChange(({ sent, failed }) => {
    if (!hosts.events.isConnected) {
      off();
      return;
    }
    for (const s of sent || []) {
      if (s.item.kind === 'outcome' && s.data) {
        upsertEvent(s.data.event);
        upsertEvent(s.data.next_event);
        upsertTask(s.data.task);
        upsertEvent(s.data.cancelled_event);
        upsertTask(s.data.cancelled_task);
      } else if (s.item.kind === 'task' && s.data) upsertTask(s.data);
    }
    if ((failed || []).length) {
      // الإجراء المرفوض: نعيد قراءة الملف حتى يظهر الوضع الفعلي مع «لم يُحفظ: …»
      refresh().catch(() => {});
      return;
    }
    // تغيّر الصندوق (إضافة/إرسال/رفض): تُعاد رسم الجلسات والمهام فقط
    drawEvents();
    drawTasks();
  });

  // رابط مباشر من الإشعار أو التقويم: ?outcome=<eventId>
  const wanted = ctx.query && ctx.query.outcome ? Number(ctx.query.outcome) : null;
  if (wanted) {
    // يُزال ?outcome من العنوان حتى لا تُفتح الورقة مرة أخرى عند إعادة التحميل أو الرجوع
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/my/matters/${encodeURIComponent(id)}`);
    } catch {
      /* لا شيء */
    }
  }
  if (wanted && !isClosed()) {
    const e = data.events.find((x) => x.id === wanted);
    if (e && isCourt(e) && (e.status === 'scheduled' ? Date.parse(e.starts_at) <= now() || isoToCairoDate(e.starts_at) <= cairoToday() : true)) {
      requestAnimationFrame(() => recordOutcome(e));
    }
  }

  return h(
    'div.lc-page.lc-matter',
    headerNode(),
    isClosed() ? alertBox('هذا الملف المستمر مغلق — العرض للقراءة فقط.', 'warning', { icon: 'lock' }) : null,
    hosts.pending,
    h('div.lc-grid', h('div.lc-main', hosts.events, hosts.tasks), h('div.lc-side', docsCard(), infoDetails())),
    hosts.bar,
  );
}
