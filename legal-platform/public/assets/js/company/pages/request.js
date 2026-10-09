// الإصدار 10 — صفحة الطلب `#/requests/<CODE>` (U10-42…U10-58 مع §8.3 وL-25 وL-55 وL-64):
// الرأس (الكود، العنوان، النوع والحالة، الوعد) ← بطاقة إجراء واحدة على الأكثر (سؤال من الفريق، أو عرض سعر، أو قرار التسليم)
// ← «أين وصل طلبكم؟» ← التسليمات بإصداراتها ← المحادثة (إرسال متفائل وإعادة محاولة؛ النص لا يضيع) ← التفاصيل ← المستندات
// ← من الذاكرة القانونية ← المتابعون. على الحاسوب عمودان 8/4، وعلى الهاتف عمود واحد بالترتيب أعلاه (CSS order).
// كل ورقة فيها كتابة تسأل «تجاهل ما كتبتموه؟» قبل الإغلاق. الموافقة على عرض السعر بورقة تأكيد + haptic('commit')،
// واعتماد التسليم + haptic('success'). لا شيء عن الفريق الداخلي: «فريقكم القانوني» صوت واحد (L-22).
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { time as fmtTime } from '../../lib/fmt.js';
import { icon, button, badge, codeTag, kv, stepTracker, toast, errorMessage, setBusy, confirmDanger, alertBox, field } from '../../lib/ui.js';
import { haptic } from '../../lib/haptics.js';
import {
  coPromise,
  coStepper,
  stageBadge,
  coClarificationCard,
  coQuoteCard,
  coDeliverableCard,
  teamAuthor,
  copy,
  countOf,
  whenLong,
  whenShort,
  dayText,
  typeLabel,
} from '../../lib/company-ui.js';
import { coUploader, coRequestFields } from '../../lib/company-forms.js';
import { W } from '../words-pages.js';
import { S, isAdmin } from '../state.js';
import { errorView } from '../common.js';
import { textSheet, menuButton, docItems, starsInput, chipFill, textareaField, sheetError, showError, companyUrlFor } from '../page-kit.js';

const PRIORITY = { normal: W.newRequest.normal, high: W.newRequest.high, urgent: W.newRequest.urgent };
const DAY = 86400000;
// نص الرسالة غير المرسلة يبقى في الذاكرة لكل طلب: لا يضيع عند انتهاء الجلسة أو الانتقال (U10-84)؛ لا تخزين على الجهاز
const composerText = new Map();

const mgrName = () => S.home?.account_manager?.name || null;

/** يوم/وقت: «اليوم، قبل 5:00 م» أو التاريخ الطويل */
const at = (iso) => (iso ? whenLong(iso) : '—');

function section(key, title, body, { actions = null, className = '' } = {}) {
  return h('section.co-section.co-req-block', { class: [`co-req-${key}`, className], id: `co-req-${key}`, 'aria-label': typeof title === 'string' ? title : null, tabindex: '-1' }, title ? h('header.co-section-head', h('h2.co-section-title', title), actions) : null, body);
}

// ───────────────────────── المحادثة (U10-51) ─────────────────────────
function authorOf(m) {
  if (m.author?.kind === 'team' || m.direction === 'out') return teamAuthor();
  if (m.author?.id && m.author.id === S.user?.id) return h('span.co-msg-author', W.thread.you);
  return h('span.co-msg-author', { dir: 'auto' }, m.author?.name || '');
}
function msgDocs(m) {
  if (!m.documents?.length) return null;
  return h(
    'div.co-msg-docs',
    m.documents.map((d) => h('a.doc-chip', { href: companyUrlFor(d), download: '', title: d.filename }, icon('paperclip', { size: 14 }), h('span', { dir: 'auto' }, d.title || d.filename))),
  );
}
function dayKey(iso) {
  return iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(iso)) : '';
}
function dayName(iso) {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  if (k === today) return W.notif.today;
  if (k === dayKey(new Date(Date.now() - DAY).toISOString())) return 'أمس';
  return dayText(k, { year: k.slice(0, 4) !== today.slice(0, 4) });
}

function bubble(m, { pending = null, onRetry = null } = {}) {
  if (m.kind === 'status') {
    return h('div.co-msg.co-msg-status', h('p', { dir: 'auto' }, m.body), h('time', { datetime: m.created_at }, fmtTime(m.created_at)));
  }
  const team = m.direction === 'out';
  const items = Array.isArray(m.items) && m.items.length ? h('ol.co-msg-items', m.items.map((it) => h('li', { dir: 'auto' }, it.label))) : null;
  const answered = m.kind === 'clarification' && m.answered_at ? h('p.co-msg-answered', icon('check', { size: 14 }), W.clarification.answered) : null;
  const replyTag = m.kind === 'clarification_reply' ? h('p.co-msg-tag', W.thread.reply_to) : null;
  let status = null;
  if (pending === 'sending') status = h('span.co-msg-state', { role: 'status' }, W.thread.sending);
  else if (pending === 'sent') status = h('span.co-msg-state', { role: 'status' }, icon('check', { size: 13 }), W.thread.sent);
  else if (pending === 'failed') status = h('span.co-msg-state.is-failed', { role: 'alert' }, icon('alert', { size: 13 }), W.thread.failed, ' · ', button(W.thread.retry, { variant: 'link', size: 'sm', onClick: onRetry }));
  const body = m.body && m.body !== W.thread.files_only ? h('div.co-msg-body', { dir: 'auto' }, m.body) : null;
  return h(
    'div.co-msg',
    { class: [team ? 'co-msg-team' : 'co-msg-company', m.kind === 'clarification' && 'co-msg-clar', pending === 'failed' && 'is-failed'], dataset: { messageId: m.id || '' } },
    h('div.co-msg-bubble', h('div.co-msg-meta', authorOf(m)), replyTag, body, items, answered, msgDocs(m), h('div.co-msg-foot', h('time', { datetime: m.created_at }, fmtTime(m.created_at)), status)),
  );
}

/** المستندات المتبقية للطلب (≤ 30 لكل طلب، L-27) */
const docsLeft = (view) => Math.max(0, 30 - (view?.documents || []).length);

/** J-10: المحادثة تبدأ بأحدث الرسائل — الأقدم خلف «عرض الرسائل الأقدم»، وعلى سطح المكتب يُمرَّر الصندوق إلى آخره */
const THREAD_RECENT = 6;
function threadNodes(messages) {
  const out = [];
  let last = '';
  for (const m of messages) {
    const k = dayKey(m.created_at);
    if (k !== last) {
      out.push(h('div.co-thread-day', h('span', dayName(m.created_at))));
      last = k;
    }
    out.push(bubble(m));
  }
  return out;
}
function thread(messages) {
  const list = h('div.co-thread', { role: 'log', 'aria-label': W.req.conversation, 'aria-live': 'polite' });
  if (!messages.length) {
    list.append(h('p.co-muted.co-thread-empty', W.thread.empty));
    return list;
  }
  const hidden = Math.max(0, messages.length - THREAD_RECENT);
  if (hidden) {
    const more = button(copy('thread.earlier', { n: hidden }), {
      variant: 'link',
      size: 'sm',
      className: 'co-thread-more',
      onClick: () => {
        const older = threadNodes(messages.slice(0, hidden));
        list.replaceChildren(...threadNodes(messages));
        const first = list.querySelector('.co-msg');
        first?.setAttribute('tabindex', '-1');
        first?.focus({ preventScroll: true });
        (older[0] || first)?.scrollIntoView({ block: 'start' });
      },
    });
    list.append(h('div.co-thread-more-wrap', more), ...threadNodes(messages.slice(hidden)));
  } else list.append(...threadNodes(messages));
  // على سطح المكتب صندوق المحادثة بارتفاع محدود: يُعرض آخره (أحدث رسالة) لا أوله
  let tries = 0;
  const toEnd = () => {
    if (list.isConnected) list.scrollTop = list.scrollHeight;
    else if (tries++ < 30) requestAnimationFrame(toEnd);
  };
  requestAnimationFrame(toEnd);
  return list;
}

/** المحرر: نص (Ctrl/⌘+Enter) + مرفقات (≤ 5) + إرسال متفائل («يُرسل…» ← «أُرسل»، أو «لم تُرسل · إعادة المحاولة») */
function composer(view, listEl, ctx) {
  const r = view.request;
  const code = r.code;
  const can = r.can || {};
  if (!can.message) {
    const note = S.user?.role === 'viewer' ? W.thread.viewer : r.status === 'closed' ? W.thread.closed_plain : null;
    return note ? h('p.co-card-note.co-composer-note', icon('info', { size: 16 }), h('span', note)) : null;
  }
  const ta = h('textarea.input.co-composer-input', { rows: 2, dir: 'auto', maxlength: 5000, placeholder: W.thread.placeholder, 'aria-label': W.thread.label });
  ta.value = composerText.get(code) || '';
  ta.addEventListener('input', () => composerText.set(code, ta.value));
  let up = null;
  const upSlot = h('div.co-composer-files');
  const attach = button(W.thread.attach, {
    variant: 'ghost',
    icon: 'paperclip',
    onClick: () => {
      if (up) return up.el.querySelector('input[type=file]')?.click();
      // J-20/K11: حد 30 مستندًا للطلب يشمل ما فيه
      up = coUploader({ max: 5, perRequestLeft: docsLeft(view), capture: true });
      upSlot.append(up.el);
    },
  });
  const sendBtn = button(W.thread.send, { variant: 'primary', icon: 'send', onClick: () => send() });
  const note = r.status === 'closed' ? h('p.co-card-note', icon('info', { size: 16 }), h('span', W.thread.closed)) : null;
  async function post(payload, el) {
    try {
      const res = await api.post(`/company/requests/${encodeURIComponent(code)}/messages`, payload);
      const fresh = bubble(res.message || { ...payload, created_at: new Date().toISOString(), direction: 'in', kind: 'message', author: { kind: 'user', id: S.user?.id } }, { pending: 'sent' });
      el.replaceWith(fresh);
      if (payload.upload_ids?.length) ctx.reload();
    } catch (err) {
      // انتهت الجلسة: النص الذي لم يصل يعود إلى المحرر بعد الدخول (U10-84) — لا يضيع
      if (err?.status === 401) {
        if (payload.body && !composerText.get(code)) composerText.set(code, payload.body);
        return;
      }
      const failed = bubble({ ...payload, created_at: new Date().toISOString(), direction: 'in', kind: 'message', author: { kind: 'user', id: S.user?.id } }, { pending: 'failed', onRetry: () => { failed.replaceWith(el); post(payload, el); } });
      el.replaceWith(failed);
      toast(errorMessage(err), 'danger', 6000);
    }
  }
  function send() {
    const text = ta.value.trim();
    if (up?.pending()) return toast(W.state.uploads_wait, 'warning');
    const ids = up ? up.uploadIds() : [];
    if (!text && !ids.length) return ta.focus();
    const payload = { body: text, upload_ids: ids };
    const optimistic = bubble({ body: text || W.thread.files_only, created_at: new Date().toISOString(), direction: 'in', kind: 'message', author: { kind: 'user', id: S.user?.id } }, { pending: 'sending' });
    listEl.querySelector('.co-thread-empty')?.remove();
    listEl.append(optimistic);
    optimistic.scrollIntoView({ block: 'nearest' });
    ta.value = '';
    composerText.delete(code);
    up?.clear();
    post(payload, optimistic);
  }
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });
  return h('div.co-composer', note, h('label.sr-only', W.thread.label), ta, upSlot, h('div.co-composer-actions', attach, h('span.co-composer-hint.co-desk-only', h('bdi', { dir: 'ltr' }, 'Ctrl+Enter'), ` ${W.thread.shortcut}`), sendBtn));
}

// ───────────────────────── الأوراق ─────────────────────────
function approveSheet(q, code, ctx) {
  const note = textareaField(W.quoteSheet.note, { max: 1000, rows: 3 });
  const err = sheetError();
  const company = S.company?.name || '';
  // J-22: العرض «بحد أقصى» لا يُقرأ التزامًا بالمبلغ كاملًا
  const capped = q.basis === 'capped' ? '_capped' : '';
  const text = copy(`${q.kind === 'overage' ? 'quoteSheet.approve_text_overage' : 'quoteSheet.approve_text'}${capped}`, { company, amount: q.amount_text || '' });
  textSheet({
    title: W.quoteSheet.approve_title,
    dirty: () => !!note.value(),
    body: h('div.co-sheet-body', h('p.co-sheet-lead', text), q.basis === 'capped' ? h('p.co-card-sub', copy('quote.capped_note', { cap: q.amount_text || '' })) : null, note.wrap, err),
    actions: [
      { label: W.quoteSheet.back, variant: 'ghost' },
      {
        label: W.quoteSheet.confirm,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          try {
            await api.post(`/company/requests/${encodeURIComponent(code)}/quotes/${encodeURIComponent(q.number)}/approve`, { note: note.value() || undefined });
          } catch (e) {
            showError(err, e?.code === 'quote_expired' ? W.quoteSheet.expired : errorMessage(e));
            return false;
          }
          haptic('commit');
          toast(W.quoteSheet.approved, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

function rejectSheet(q, code, ctx) {
  const reason = textareaField(W.quoteSheet.reason, { required: true, max: 500, rows: 3 });
  const err = sheetError();
  textSheet({
    title: W.quoteSheet.reject_title,
    dirty: () => !!reason.value(),
    body: h('div.co-sheet-body', chipFill(W.quoteSheet.reject_chips, reason.input), reason.wrap, h('p.co-hint-warning', icon('alert', { size: 16 }), h('span', W.quoteSheet.reject_warning)), err),
    actions: [
      { label: W.quoteSheet.back, variant: 'ghost' },
      {
        label: W.quoteSheet.reject_confirm,
        variant: 'danger',
        onClick: async () => {
          showError(err, '');
          if (!reason.value()) {
            reason.wrap.setError(W.quoteSheet.reason_required);
            reason.input.focus();
            return false;
          }
          try {
            await api.post(`/company/requests/${encodeURIComponent(code)}/quotes/${encodeURIComponent(q.number)}/reject`, { reason: reason.value() });
          } catch (e) {
            showError(err, errorMessage(e));
            return false;
          }
          toast(W.quoteSheet.rejected, 'info');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

function acceptSheet(d, view, ctx) {
  const r = view.request;
  let rating = 0;
  const ratingErr = h('p.field-error', { role: 'alert', hidden: true });
  const comment = textareaField(W.acceptSheet.comment, { max: 2000, rows: 3 });
  const stars = starsInput({
    label: W.acceptSheet.rating,
    onChange: (v) => {
      rating = v;
      ratingErr.hidden = true;
      comment.wrap.querySelector('.field-label, label')?.replaceChildren(v <= 2 ? W.acceptSheet.comment_low : W.acceptSheet.comment);
    },
  });
  const save = r.can?.save_to_memory ? h('input', { type: 'checkbox', checked: true, id: `co-save-${d.id}` }) : null;
  const saveBox = save ? h('div.co-check-block', h('label.check.check-single', { htmlFor: save.id }, save, h('span', W.acceptSheet.save_memory)), h('p.field-hint', W.acceptSheet.save_memory_hint)) : null;
  let topic = null;
  let decision = null;
  let decisionBox = null;
  if (r.can?.record_decision && isAdmin()) {
    topic = h('input.input', { type: 'text', dir: 'auto', maxlength: 200 });
    decision = h('textarea.input', { rows: 3, dir: 'auto', maxlength: 2000 });
    decisionBox = h('details.co-details.co-decision', h('summary', W.acceptSheet.decision), h('div.co-decision-body', field(W.acceptSheet.topic, topic), field(W.acceptSheet.decision_text, decision, { full: true }), h('p.field-hint', W.acceptSheet.decision_hint)));
  }
  const err = sheetError();
  textSheet({
    title: W.acceptSheet.title,
    dirty: () => !!comment.value() || !!topic?.value.trim() || !!decision?.value.trim(),
    body: h('div.co-sheet-body', h('div.co-rating', h('p.field-label', { id: `co-rate-${d.id}` }, W.acceptSheet.rating), stars.el, ratingErr), comment.wrap, saveBox, decisionBox, err),
    actions: [
      {
        label: W.acceptSheet.submit,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (!rating) {
            ratingErr.textContent = W.acceptSheet.rating_required;
            ratingErr.hidden = false;
            stars.el.querySelector('[tabindex="0"]')?.focus();
            return false;
          }
          const body = { rating, comment: comment.value() || undefined };
          if (save) body.save_to_memory = !!save.checked;
          if (topic && topic.value.trim() && decision.value.trim()) body.record_decision = { topic: topic.value.trim(), decision: decision.value.trim() };
          try {
            await api.post(`/company/requests/${encodeURIComponent(r.code)}/deliverables/${encodeURIComponent(d.id)}/accept`, body);
          } catch (e) {
            showError(err, errorMessage(e));
            return false;
          }
          haptic('success');
          toast(W.acceptSheet.done, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

function changesLeft(r) {
  const rev = r.revisions || {};
  const max = Number(rev.max) || 0;
  const left = Math.max(0, max - (Number(rev.used) || 0));
  return { left, max, until: rev.until };
}

function changesSheet(d, view, ctx) {
  const r = view.request;
  const { left, max, until } = changesLeft(r);
  const what = textareaField(W.changesSheet.what, { required: true, max: 3000, rows: 5, hint: W.changesSheet.hint });
  const err = sheetError();
  // C-03: «تبقّت لكم جولة تعديل واحدة حتى …» (بلا «(من 1)» حين لم تُستخدم أي جولة)
  const key = `${until ? 'changesSheet.left' : 'changesSheet.left_open'}${left >= max ? '_all' : ''}`;
  const line = h('p.co-card-sub', copy(key, { left: countOf(left, 'round_left'), max, date: until ? whenLong(until, { time: false }) : '' }));
  const sh = textSheet({
    title: W.changesSheet.title,
    dirty: () => !!what.value(),
    body: h('div.co-sheet-body', what.wrap, line, err),
    actions: [
      {
        label: W.changesSheet.submit,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (!what.value()) {
            what.wrap.setError(W.changesSheet.required);
            what.input.focus();
            return false;
          }
          try {
            await api.post(`/company/requests/${encodeURIComponent(r.code)}/deliverables/${encodeURIComponent(d.id)}/request-changes`, { comment: what.value() });
          } catch (e) {
            showError(err, e?.code === 'revision_limit' ? W.changesSheet.limit : errorMessage(e));
            if (e?.code === 'revision_limit') sh.buttons?.forEach((b) => (b.hidden = true));
            return false;
          }
          toast(W.changesSheet.done, 'success', 6000);
          ctx.reload();
          return true;
        },
      },
    ],
  });
  return sh;
}

function escalateSheet(r, ctx) {
  const what = textareaField(W.escalateSheet.what, { required: true, max: 500, rows: 3 });
  const err = sheetError();
  textSheet({
    title: W.escalateSheet.title,
    dirty: () => !!what.value(),
    body: h('div.co-sheet-body', h('p.co-sheet-lead', mgrName() ? W.escalateSheet.text : W.escalateSheet.text_team), chipFill(W.escalateSheet.chips, what.input), what.wrap, err),
    actions: [
      {
        label: W.escalateSheet.submit,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (!what.value()) {
            what.wrap.setError(W.escalateSheet.required);
            what.input.focus();
            return false;
          }
          try {
            await api.post(`/company/requests/${encodeURIComponent(r.code)}/escalate`, { reason: what.value() });
          } catch (e) {
            const nextAt = r.last_escalated_at ? new Date(Date.parse(r.last_escalated_at) + DAY).toISOString() : null;
            showError(err, e?.code === 'escalation_throttled' && nextAt ? copy('escalateSheet.throttled', { time: whenLong(nextAt) }) : errorMessage(e));
            return false;
          }
          toast(W.escalateSheet.done, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

async function watchersSheet(view, ctx) {
  const r = view.request;
  let cols = [];
  try {
    cols = (await api.get('/company/colleagues'))?.items || [];
  } catch (e) {
    return toast(errorMessage(e), 'danger');
  }
  const others = cols.filter((c) => c.id !== r.submitted_by?.id);
  const sel = new Set((view.watchers || []).map((w) => w.id));
  const err = sheetError();
  const list = others.length
    ? h(
        'div.co-watchers',
        others.map((c) =>
          h(
            'button.chip-toggle',
            {
              type: 'button',
              'aria-pressed': sel.has(c.id) ? 'true' : 'false',
              class: sel.has(c.id) && 'is-on',
              onClick: (e) => {
                if (sel.has(c.id)) sel.delete(c.id);
                else if (sel.size < 10) sel.add(c.id);
                else return showError(err, W.watchersSheet.max);
                e.currentTarget.setAttribute('aria-pressed', sel.has(c.id) ? 'true' : 'false');
                e.currentTarget.classList.toggle('is-on', sel.has(c.id));
              },
            },
            icon('check', { size: 14 }),
            h('span', c.name),
            h('span.co-watcher-role', `· ${c.role_label}`),
          ),
        ),
      )
    : h('p.co-muted', W.watchersSheet.none);
  const initial = [...sel].sort().join(',');
  textSheet({
    title: W.watchersSheet.title,
    dirty: () => [...sel].sort().join(',') !== initial,
    body: h('div.co-sheet-body', h('p.field-hint', W.newRequest.watchers_hint), r.visibility === 'private' ? h('p.field-hint', W.newRequest.watchers_private) : null, list, err),
    actions: others.length
      ? [
          {
            label: W.watchersSheet.save,
            variant: 'primary',
            onClick: async () => {
              try {
                await api.put(`/company/requests/${encodeURIComponent(r.code)}/watchers`, { company_user_ids: [...sel] });
              } catch (e) {
                showError(err, errorMessage(e));
                return false;
              }
              toast(W.watchersSheet.saved, 'success');
              ctx.reload();
              return true;
            },
          },
        ]
      : [],
  });
}

function documentsSheet(view, ctx) {
  const r = view.request;
  const up = coUploader({ max: 5, perRequestLeft: docsLeft(view), capture: true });
  const err = sheetError();
  textSheet({
    title: W.docs.add,
    dirty: () => up.uploadIds().length > 0 || up.pending() > 0,
    body: h('div.co-sheet-body', up.el, err),
    actions: [
      {
        label: W.docs.upload,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (up.pending()) {
            showError(err, W.uploader.wait);
            return false;
          }
          const ids = up.uploadIds();
          if (!ids.length) return false;
          try {
            await api.post(`/company/requests/${encodeURIComponent(r.code)}/documents`, { upload_ids: ids });
          } catch (e) {
            showError(err, e?.code === 'request_documents_limit' ? W.uploader.request_full : errorMessage(e));
            return false;
          }
          toast(W.docs.added, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

async function cancelRequest(r, ctx) {
  const ok = await confirmDanger({ title: copy('cancelReq.title', { code: r.code }), message: W.cancelReq.text, confirmLabel: W.cancelReq.confirm, cancelLabel: W.cancelReq.back });
  if (!ok) return;
  try {
    await api.post(`/company/requests/${encodeURIComponent(r.code)}/cancel`, {});
  } catch (e) {
    return toast(errorMessage(e), 'danger', 6000);
  }
  toast(W.cancelReq.done, 'info');
  ctx.reload();
}

// ───────────────────────── أجزاء الصفحة ─────────────────────────
function escalateInfo(r) {
  const last = r.last_escalated_at ? Date.parse(r.last_escalated_at) : 0;
  const waitUntil = last && Date.now() - last < DAY ? new Date(last + DAY).toISOString() : null;
  const allowedRole = isAdmin() || r.submitted_by?.id === S.user?.id;
  const open = !['closed', 'declined', 'cancelled'].includes(r.stage);
  return { can: !!r.can?.escalate, waitUntil: allowedRole && open && !r.can?.escalate ? waitUntil : null };
}

function header(view, ctx) {
  const r = view.request;
  const esc = escalateInfo(r);
  const items = [
    esc.can ? { label: W.req.escalate, icon: 'flag', onClick: () => escalateSheet(r, ctx) } : esc.waitUntil ? { label: copy('req.escalate_wait', { time: whenLong(esc.waitUntil) }), icon: 'flag', disabled: true } : null,
    r.can?.edit_watchers ? { label: W.req.watchers, icon: 'users', onClick: () => watchersSheet(view, ctx) } : null,
    r.can?.cancel ? { label: W.req.cancel, icon: 'x', danger: true, onClick: () => cancelRequest(r, ctx) } : null,
    {
      label: W.req.copy_link,
      icon: 'link',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.split('?')[0]);
          toast(W.req.link_copied, 'success');
        } catch {
          /* بلا حافظة: لا شيء */
        }
      },
    },
  ];
  const late = r.promise?.state === 'late';
  return h(
    'header.co-req-head',
    h('div.co-req-head-top', codeTag(r.code), menuButton(W.req.menu, items)),
    h('h1.co-h1', { tabindex: '-1', dir: 'auto' }, r.title || typeLabel(r.type)),
    h('div.co-badges', badge(r.type_label || typeLabel(r.type), 'primary', { className: 'co-badge' }), stageBadge(r.stage, { late })),
  );
}

function promiseBox(view, ctx) {
  const r = view.request;
  const p = r.promise || {};
  const esc = escalateInfo(r);
  const action = p.state === 'late' && esc.can ? button(W.req.escalate, { variant: 'secondary', size: 'sm', icon: 'flag', onClick: () => escalateSheet(r, ctx) }) : null;
  const typical = !p.delivery_by && p.delivery_estimate_text && !['closed', 'declined', 'cancelled', 'delivered'].includes(r.stage) ? copy('promise.typical', { duration: p.delivery_estimate_text }) : null;
  const box = coPromise(p, { stage: r.stage, remainingHours: r.remaining_business_hours, action, typical });
  if (box.hidden) return null;
  box.classList.add('co-req-promise');
  return box;
}

function stateNote(view) {
  const r = view.request;
  const closedAt = (view.timeline || []).find((t) => t.stage === 'closed')?.at || r.updated_at;
  if (r.stage === 'declined') {
    return h('div.co-state-note', icon('info', { size: 18 }), h('div', h('p', r.resolution_note ? copy('req.declined', { reason: r.resolution_note }) : W.req.declined_plain), h('p.co-muted', W.req.declined_quota)));
  }
  if (r.stage === 'cancelled') return h('div.co-state-note', icon('info', { size: 18 }), h('p', copy('req.cancelled', { date: whenLong(r.updated_at, { time: false }) })));
  if (r.stage === 'closed') {
    const text = r.resolution === 'auto_closed' ? copy('req.auto_closed', { date: whenLong(closedAt, { time: false }) }) : `${copy('req.closed', { date: whenLong(closedAt, { time: false }) })}${r.resolution_note ? ` ${r.resolution_note}` : ''}`;
    return h('div.co-state-note.is-success', icon('checkCircle', { size: 18 }), h('p', text));
  }
  return null;
}

function tracker(view) {
  const r = view.request;
  const m = coStepper(r.stage, view.timeline);
  if (m.hidden) return null;
  return section('tracker', W.stepper.label, stepTracker(m.steps, { current: m.current, state: m.state, note: m.note, label: W.stepper.label }));
}

/** بطاقة الإجراء الواحدة: سؤال مفتوح ← عرض سعر ← قرار التسليم (U10-42) */
function actionCard(view, ctx) {
  const r = view.request;
  const can = r.can || {};
  const open = (view.messages || []).filter((m) => m.kind === 'clarification' && !m.answered_at);
  if (open.length) {
    const msg = open[0];
    const card = coClarificationCard(msg, {
      canAnswer: !!can.answer,
      uploader: (i, label) => coUploader({ max: 5, perRequestLeft: docsLeft(view), titlePrefix: `${label} — ` }),
      onReply: async (payload) => {
        await api.post(`/company/requests/${encodeURIComponent(r.code)}/clarifications/${encodeURIComponent(msg.id)}/reply`, payload);
        toast(W.clarification.sent, 'success');
        ctx.reload();
      },
    });
    return h('div.co-req-action', { id: 'co-req-action', tabindex: '-1' }, card, open.length > 1 ? h('p.co-muted.co-action-more', icon('info', { size: 14 }), W.req.another_open) : null);
  }
  const q = view.quote;
  if (q && q.status === 'sent') {
    const card = coQuoteCard(q, {
      canApprove: !!can.approve_quote,
      approverNames: q.approver_names || [],
      onApprove: can.approve_quote ? () => approveSheet(q, r.code, ctx) : null,
      onReject: can.approve_quote ? () => rejectSheet(q, r.code, ctx) : null,
      onDiscuss: () => discuss(q),
    });
    return h('div.co-req-action', { id: 'co-req-action', tabindex: '-1' }, card);
  }
  const d = decisionDeliverable(view);
  if (d) {
    const { left } = changesLeft(r);
    return h(
      'div.co-req-action',
      { id: 'co-req-action', tabindex: '-1' },
      coDeliverableCard(d, {
        canDecide: !!can.decide_deliverable,
        onAccept: can.decide_deliverable ? () => acceptSheet(d, view, ctx) : null,
        onRequestChanges: can.decide_deliverable ? () => changesSheet(d, view, ctx) : null,
        docUrl: companyUrlFor,
        autoCloseAt: r.auto_close_at,
        changesNote: left <= 0 ? W.changesSheet.limit : null,
      }),
    );
  }
  return null;
}
/** التسليم النهائي المنتظر قرارًا (يظهر في بطاقة الإجراء لا مرتين) */
function decisionDeliverable(view) {
  const ds = view.deliverables || [];
  const last = [...ds].reverse().find((d) => d.final);
  return last && !last.decision && view.request.stage === 'delivered' ? last : null;
}

function discuss(q) {
  const ta = document.querySelector('.co-composer-input');
  if (!ta) return;
  ta.value = copy('thread.discuss', { number: q.number });
  ta.dispatchEvent(new Event('input'));
  ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

function deliverablesBlock(view, ctx) {
  const pending = decisionDeliverable(view);
  const ds = [...(view.deliverables || [])].reverse().filter((d) => d !== pending);
  if (!ds.length) return null;
  const [latest, ...older] = ds;
  const card = (d) => coDeliverableCard(d, { canDecide: false, docUrl: companyUrlFor });
  return section(
    'deliverables',
    W.req.deliverables,
    h('div.co-deliverables', card(latest), older.length ? h('details.co-details.co-older', h('summary', copy('deliverable.previous', { n: older.length })), older.map(card)) : null),
  );
}

function detailsBlock(view) {
  const r = view.request;
  const pairs = [[W.req.type, r.type_label || typeLabel(r.type)]];
  if (r.entity?.name) pairs.push([W.req.entity, h('span', { dir: 'auto' }, r.entity.name)]);
  const pri = PRIORITY[r.priority] || r.priority;
  pairs.push([W.req.priority, r.priority_changed ? h('span', pri, h('span.co-muted', ` — ${copy('req.priority_changed', { x: pri })}`)) : pri]);
  if (r.urgent_reason) pairs.push([W.req.urgent_reason, h('span', { dir: 'auto' }, r.urgent_reason)]);
  if (r.needed_by) pairs.push([W.req.needed_by, dayText(r.needed_by, { year: true })]);
  const by = r.submitted_by?.id === S.user?.id ? W.thread.you : r.submitted_by?.name || '—';
  pairs.push([W.req.sent_by, copy('req.sent_by_value', { name: by, date: whenLong(r.created_at) })]);
  pairs.push([W.req.visibility, r.visibility_label || '']);
  pairs.push([W.req.watchers_label, (view.watchers || []).length ? view.watchers.map((w) => w.name).join('، ') : W.req.no_watchers]);
  const desc = h('div.co-desc', { dir: 'auto' }, r.description || '');
  const long = String(r.description || '').split('\n').length > 8 || String(r.description || '').length > 600;
  if (long) desc.classList.add('is-folded');
  const more = long ? button(W.req.show_full, { variant: 'link', size: 'sm', onClick: (e) => { desc.classList.remove('is-folded'); e.currentTarget.remove(); } }) : null;
  return section('details', W.req.details, h('div', kv(pairs, { className: 'co-fields-kv' }), coRequestFields(r.type, r.fields || {}), h('p.co-card-label', W.req.description), desc, more));
}

function documentsBlock(view, ctx) {
  const r = view.request;
  const docs = view.documents || [];
  const add = r.can?.upload ? button(W.docs.add, { variant: 'secondary', size: 'sm', icon: 'plus', onClick: () => documentsSheet(view, ctx) }) : null;
  return section(
    'documents',
    docs.length ? [W.req.documents, ' ', h('span.co-count.num', `(${docs.length})`)] : W.req.documents,
    docItems(docs, { origin: (d) => (d.from === 'company' ? W.docs.from_company : W.docs.from_team), empty: W.docs.empty }),
    { actions: add },
  );
}

function memoryBlock(view) {
  const refs = view.memory_refs || [];
  if (!refs.length) return null;
  return section(
    'memory',
    W.req.memory_refs,
    h('ul.k-list', refs.map((m) => h('li', h('a.k-row', { href: `#/memory/item/${encodeURIComponent(m.id)}` }, h('span.k-row-icon', { 'aria-hidden': 'true' }, icon('bookOpen', { size: 20 })), h('span.k-row-main', h('span.k-row-title', { dir: 'auto' }, m.title), h('span.k-row-sub', m.kind_label)), h('span.k-row-chevron', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 20 })))))),
  );
}

function conversationBlock(view, ctx) {
  const list = thread(view.messages || []);
  return section('messages', W.req.conversation, h('div.co-conversation', list, composer(view, list, ctx)));
}

function escalatedBanner(r) {
  if (!r.last_escalated_at || ['closed', 'declined', 'cancelled'].includes(r.stage)) return null;
  if (Date.now() - Date.parse(r.last_escalated_at) > 7 * DAY) return null;
  return alertBox(copy(mgrName() ? 'req.escalated' : 'req.escalated_team', { time: whenShort(r.last_escalated_at) }), 'info');
}

/** ?focus=action|deliverable|messages|documents ← تمرير إلى البطاقة وتركيزها (روابط الإشعارات والبريد) */
function applyFocus(root, focus) {
  const id = { action: 'co-req-action', deliverable: 'co-req-action', messages: 'co-req-messages', documents: 'co-req-documents' }[focus];
  if (!id) return;
  setTimeout(() => {
    const el = root.querySelector(`#${id}`) || (focus === 'deliverable' ? root.querySelector('#co-req-deliverables') : null);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }, 80);
}

// ───────────────────────── الصفحة ─────────────────────────
export default async function requestPage(ctx) {
  const code = String(ctx.params.code || '').toUpperCase();
  const parent = { label: W.nav.requests, href: '#/requests' };
  if (!/^[A-Z]{2,5}-\d{4,6}$/.test(code)) return errorView(W.req.load_error, { status: 404 }, null, parent);
  let view;
  try {
    view = await api.get(`/company/requests/${encodeURIComponent(code)}`);
  } catch (err) {
    return errorView(code, err, () => ctx.reload(), parent);
  }
  const r = view.request;
  ctx.setTitle(r.code);
  const note = stateNote(view);
  const main = h(
    'div.co-req-main',
    actionCard(view, ctx),
    deliverablesBlock(view, ctx),
    conversationBlock(view, ctx),
  );
  const aside = h(
    'div.co-req-aside',
    note ? null : promiseBox(view, ctx),
    note,
    tracker(view),
    detailsBlock(view),
    documentsBlock(view, ctx),
    memoryBlock(view),
  );
  const page = h('div.co-page.co-req', header(view, ctx), escalatedBanner(r), h('div.co-req-grid', main, aside));
  if (ctx.query.focus) applyFocus(page, ctx.query.focus);
  return page;
}
