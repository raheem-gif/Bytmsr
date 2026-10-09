// الإصدار 10 — مكونات بوابة الشركات المشتركة (L-43، U10-92؛ عقد POR-0 — التواقيع ثابتة):
// تستوردها البوابة /company وصفحات فريق المكتب لمعاينة «كما تراه الشركة» (بلا معالجات = معاينة فقط).
//
//   typeIcon(key, { size }) → Element · typeLabel(key) → نص البوابة لنوع الطلب
//   stageBadge(stage, { late = false, short = false }) → Element   شارة الحالة (ممتلئة) + «متأخر» بأيقونة الساعة
//   promiseText(promise, { stage, short = false, remainingHours }) → { text, tone, icon } · coPromise(promise, opts) → Element
//   coRequestRow(item, { href }) → Element                          صف طلب (U10-27)
//   coUsageMeter(quota, { showPrices = false, policy, price, hasManager = true, newRequest = false }) → Element (U10-24)
//   coStepper(stage, timeline) → { steps, current, state, note, hidden }   نموذج ui.stepTracker (L-25)
//   riskBadge(level) → Element|null · teamAuthor() → Element
//   coClarificationCard(msg, { canAnswer, onReply, uploader }) → Element   (U10-46)
//   coQuoteCard(quote, { canApprove, approverNames, onApprove, onReject, onDiscuss }) → Element (U10-47)
//   coDeliverableCard(d, { canDecide, onAccept, onRequestChanges, docUrl, autoCloseAt, changesNote }) → Element (U10-48)
//   coSearchBox({ onPick, compact = false }) → Element               بحث واحد (L-55)
//   copy(key, vars) → string · copyParts(key, vars) → [string|Node]  نصوص company/words.js (تحذف جمل البريد حين لا بريد)
//   whenLong(iso) · whenShort(iso) · dayText('YYYY-MM-DD')          مواعيد بتوقيت القاهرة (U10-06)
import { h } from './h.js';
import { icon, badge, button, uid, toast, errorMessage, setBusy } from './ui.js';
import { api } from './api.js';
import { isoToCairoDate, monthLabel } from './fmt.js';
import { W } from '../company/words-flows.js';
import { copy, countOf, whenLong, whenShort, dayText, typeIcon, stageLabel, riskBadge } from './company-ui-core.js';

export * from './company-ui-core.js';

// ───────────────────────── بطاقة الاستيضاح (U10-46) ─────────────────────────
/**
 * msg: { id, body, items:[{label}], answered_at }. onReply({ body, missing_items, upload_ids }) → Promise.
 * uploader(index, label) → { el, uploadIds(), pending(), clear() } (من lib/company-forms.js coUploader؛ تمرره الصفحة).
 */
export function coClarificationCard(msg, opts = {}) {
  const { canAnswer = false, onReply, uploader } = opts;
  const items = Array.isArray(msg?.items) ? msg.items : [];
  const interactive = !!(canAnswer && typeof onReply === 'function' && !msg.answered_at);
  const state = items.map(() => ({ missing: false, up: null }));
  const ta = interactive ? h('textarea.input', { rows: 3, dir: 'auto', maxlength: 5000, id: uid('co-clar') }) : null;
  const ask = h('div.co-ask', { role: 'alert', hidden: true });
  const sendBtn = interactive ? button(W.clarification.send, { variant: 'primary', onClick: () => send() }) : null;
  const rows = items.map((it, i) => {
    const s = state[i];
    const slot = h('div.co-clar-slot');
    const marked = h('p.co-clar-marked', { hidden: true }, icon('info', { size: 16 }), h('span', W.clarification.marked), ' ', button(W.clarification.undo, { variant: 'link', size: 'sm', onClick: () => setMissing(false) }));
    const attachBtn = interactive && uploader ? button(W.clarification.attach, { variant: 'secondary', size: 'sm', icon: 'paperclip', onClick: () => openUploader() }) : null;
    const missBtn = interactive ? button(W.clarification.unavailable, { variant: 'ghost', size: 'sm', onClick: () => setMissing(true) }) : null;
    const actions = interactive ? h('div.co-clar-actions', attachBtn, missBtn) : null;
    function openUploader() {
      if (!uploader || s.up) return;
      s.up = uploader(i, it.label);
      slot.append(s.up.el);
      sync();
    }
    function setMissing(v) {
      s.missing = v;
      marked.hidden = !v;
      if (actions) actions.hidden = v;
      slot.hidden = v;
      sync();
    }
    s.open = openUploader;
    s.setMissing = setMissing;
    return h('li.co-clar-item', h('span.co-clar-label', { dir: 'auto' }, it.label), actions, slot, marked);
  });
  function payload() {
    const ids = state.flatMap((s) => (s.up ? s.up.uploadIds() : []));
    return { body: ta ? ta.value.trim() : '', missing_items: state.map((s, i) => (s.missing ? i : -1)).filter((i) => i >= 0), upload_ids: ids };
  }
  function sync() {
    if (!sendBtn) return;
    const p = payload();
    sendBtn.disabled = !(p.body || p.upload_ids.length || p.missing_items.length);
  }
  if (ta) ta.addEventListener('input', sync);
  async function send() {
    if (sendBtn.classList.contains('is-loading')) return;
    if (state.some((s) => s.up && s.up.pending())) return toast(W.state.uploads_wait, 'warning');
    const open = state.findIndex((s) => !s.missing && !(s.up && s.up.uploadIds().length));
    if (open >= 0 && items.length) {
      ask.hidden = false;
      ask.replaceChildren(
        h('p', copy('clarification.ask_missing', { n: open + 1 })),
        h('div.co-clar-actions', button(W.clarification.yes_missing, { variant: 'secondary', size: 'sm', onClick: () => { ask.hidden = true; state[open].setMissing(true); send(); } }), button(W.clarification.will_attach, { variant: 'ghost', size: 'sm', onClick: () => { ask.hidden = true; state[open].open(); } })),
      );
      return;
    }
    setBusy(sendBtn, true);
    try {
      await onReply(payload());
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(sendBtn, false);
    }
  }
  sync();
  return h(
    'section.co-card.co-card-attention',
    { 'aria-label': W.clarification.title },
    // العنوان نفسه يقول «فريقكم القانوني» (صوت واحد، L-22)؛ العلامة بجانبه بلا تكرار الاسم
    h('header.co-card-head', h('h2.co-card-title.co-card-title-team', h('span.co-team-mark', { 'aria-hidden': 'true' }, icon('scale', { size: 16 })), h('span', W.clarification.title))),
    msg?.body ? h('p.co-quote-text', { dir: 'auto' }, `«${msg.body}»`) : null,
    items.length ? [h('p.co-card-label', W.clarification.needed), h('ol.co-clar-items', rows)] : null,
    interactive ? [h('label.field-label', { htmlFor: ta.id }, W.clarification.reply), ta, ask, h('div.co-card-actions', sendBtn)] : null,
    msg?.answered_at ? h('p.co-card-foot', icon('check', { size: 16 }), W.clarification.answered) : h('p.co-card-foot', icon('clock', { size: 16 }), opts.canAnswer === false ? W.clarification.viewer : W.clarification.paused),
  );
}

// ───────────────────────── عرض السعر (U10-47) ─────────────────────────
export function coQuoteCard(q, { canApprove = false, approverNames = [], onApprove, onReject, onDiscuss } = {}) {
  if (!q) return h('div', { hidden: true });
  const amount = q.amount_text || '';
  const capped = q.basis === 'capped';
  const kind = q.kind === 'overage' ? copy('quote.overage', { month: monthLabel(isoToCairoDate(q.sent_at).slice(0, 7)) }) : W.quote.out_of_scope;
  const head = h('p.co-card-meta', h('bdi.co-code', { dir: 'ltr' }, q.number), ' · ', kind);
  if (q.status !== 'sent') {
    const text =
      q.status === 'expired'
        ? copy('quote.expired', { date: whenLong(q.valid_until, { time: false }) })
        : q.status === 'approved'
          ? copy('quote.approved', { date: whenLong(q.decided_at, { time: false }), name: q.decided_by?.name || '' })
          : q.status === 'rejected'
            ? copy('quote.rejected', { date: whenLong(q.decided_at, { time: false }), name: q.decided_by?.name || '' })
            : W.quote.withdrawn;
    return h('section.co-card.co-card-quiet', head, amount ? h('p.co-quote-amount.num', amount, capped ? ` · ${W.quote.capped}` : '') : null, h('p', text));
  }
  const preview = !onApprove && !onReject && !onDiscuss;
  const extra = [q.assumptions, q.excluded].filter(Boolean);
  const actions = canApprove || preview
    ? h(
        'div.co-card-actions',
        button(W.quote.approve, { variant: 'primary', disabled: preview, onClick: onApprove ? () => onApprove(q) : null }),
        button(W.quote.reject, { variant: 'secondary', disabled: preview, onClick: onReject ? () => onReject(q) : null }),
        button(W.quote.discuss, { variant: 'link', disabled: preview, onClick: onDiscuss ? () => onDiscuss(q) : null }),
      )
    : h(
        'div.co-card-actions',
        h('p.co-card-note', icon('info', { size: 16 }), h('span', approverNames.length ? copy(approverNames.length === 1 ? 'quote.approvers_one' : 'quote.approvers', { names: approverNames.join('، ') }) : W.quote.approvers_plain)),
        onDiscuss ? button(W.quote.discuss, { variant: 'link', onClick: () => onDiscuss(q) }) : null,
      );
  return h(
    'section.co-card.co-card-attention',
    { 'aria-label': W.quote.title },
    h('header.co-card-head', h('h2.co-card-title', W.quote.title)),
    head,
    h('p.co-quote-amount.num', amount, ' · ', capped ? W.quote.capped : W.quote.fixed),
    capped ? h('p.co-card-sub', copy('quote.capped_note', { cap: amount })) : null,
    q.scope_of_work ? [h('p.co-card-label', W.quote.scope), h('p.co-pre', { dir: 'auto' }, q.scope_of_work)] : null,
    extra.length ? h('details.co-details', h('summary', W.quote.assumptions), extra.map((x) => h('p.co-pre', { dir: 'auto' }, x))) : null,
    h('p.co-card-sub', copy('quote.valid_until', { date: whenLong(q.valid_until, { time: false }) })),
    actions,
    h('p.co-card-foot', W.quote.footnote),
  );
}

// ───────────────────────── التسليم (U10-48) ─────────────────────────
const defaultDocUrl = (doc, { inline = false } = {}) => `${doc.url || `/api/company/documents/${encodeURIComponent(doc.id)}/download`}${inline ? '?inline=1' : ''}`;
const viewable = (doc) => /^(application\/pdf|image\/(jpeg|png|webp))$/.test(String(doc.mime || '')) || doc.kind === 'pdf' || doc.kind === 'image';
const starsText = (n) => `${'★'.repeat(Math.max(0, Math.min(5, n)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, n)))}`;

/** صف ملف: «عرض» (PDF والصور) و«تنزيل» صريح */
export function coFileRow(doc, { docUrl = defaultDocUrl } = {}) {
  const name = doc.title || doc.filename || '';
  const ext = (String(doc.filename || '').split('.').pop() || '').toUpperCase().slice(0, 4);
  return h(
    'li.co-file',
    h('bdi.co-file-type', { dir: 'ltr' }, ext || 'FILE'),
    h('span.co-file-name', { dir: 'auto' }, name),
    h(
      'span.co-file-actions',
      viewable(doc) ? h('a.btn.btn-ghost.btn-sm', { href: docUrl(doc, { inline: true }), target: '_blank', rel: 'noopener noreferrer', 'aria-label': copy('deliverable.view_name', { name }) }, W.deliverable.view) : null,
      h('a.btn.btn-secondary.btn-sm', { href: docUrl(doc), download: '', 'aria-label': copy('deliverable.download_name', { name }) }, icon('download', { size: 16 }), h('span', W.deliverable.download)),
    ),
  );
}

export function coDeliverableCard(d, { canDecide = false, onAccept, onRequestChanges, docUrl = defaultDocUrl, autoCloseAt = null, changesNote = null } = {}) {
  if (!d) return h('div', { hidden: true });
  const recs = Array.isArray(d.recommendations) ? d.recommendations.filter(Boolean) : [];
  const preview = !onAccept && !onRequestChanges;
  const decide = d.final && !d.decision && (canDecide || preview);
  let foot = null;
  if (d.decision === 'accepted') foot = h('p.co-card-foot', icon('checkCircle', { size: 16 }), h('span', copy('deliverable.accepted', { date: whenLong(d.decided_at, { time: false }), stars: starsText(Number(d.rating) || 0) })));
  else if (d.decision === 'changes_requested') foot = h('p.co-card-foot', icon('edit', { size: 16 }), h('span', copy('deliverable.changes_requested', { date: whenLong(d.decided_at, { time: false }) })));
  return h(
    'article.co-card.co-deliverable',
    { class: decide && 'co-card-attention', dataset: { deliverableId: d.id } },
    h('header.co-card-head', h('h2.co-card-title', copy('deliverable.head', { version: d.version })), d.released_at ? h('span.co-card-time', copy('deliverable.released', { when: whenShort(d.released_at) })) : null),
    h('div.co-badges', d.kind_label ? badge(d.kind_label, 'primary', { className: 'co-badge' }) : null, d.final ? null : badge(W.deliverable.interim, 'info', { className: 'co-badge' })),
    h('h3.co-deliverable-title', { dir: 'auto' }, d.title || ''),
    riskBadge(d.risk_level),
    d.final ? null : h('p.co-card-sub', W.deliverable.interim_note),
    d.summary ? [h('p.co-card-label', W.deliverable.summary), h('p.co-pre', { dir: 'auto' }, d.summary)] : null,
    recs.length ? [h('p.co-card-label', W.deliverable.recommendations), h('ol.co-recs', recs.map((r) => h('li', { dir: 'auto' }, typeof r === 'string' ? r : r.text || '')))] : null,
    d.body ? h('details.co-details', h('summary', W.deliverable.body), h('div.co-pre', { dir: 'auto' }, d.body)) : null,
    d.documents?.length ? [h('p.co-card-label', W.deliverable.files), h('ul.co-files', d.documents.map((x) => coFileRow(x, { docUrl })))] : null,
    decide
      ? h(
          'div.co-card-actions',
          button(W.deliverable.accept, { variant: 'primary', icon: 'check', disabled: preview, onClick: onAccept ? () => onAccept(d) : null }),
          // جولات التعديل المشمولة استُخدمت: نص بدل الزر (U10-50)
          changesNote ? h('p.co-card-note', icon('info', { size: 16 }), h('span', changesNote)) : button(W.deliverable.changes, { variant: 'secondary', disabled: preview, onClick: onRequestChanges ? () => onRequestChanges(d) : null }),
        )
      : null,
    decide && autoCloseAt ? h('p.co-card-sub', copy('deliverable.auto_close', { date: whenLong(autoCloseAt, { time: false }) })) : null,
    foot,
  );
}

// ───────────────────────── البحث الواحد (L-55) ─────────────────────────
function defaultPick(item, kind) {
  if (kind === 'requests') window.location.hash = `#/requests/${encodeURIComponent(item.code)}`;
  else if (kind === 'memory') window.location.hash = `#/memory/item/${encodeURIComponent(item.id)}`;
  else if (kind === 'documents') window.open(`${item.url || `/api/company/documents/${item.id}/download`}?inline=1`, '_blank', 'noopener');
}

/** حقل بحث في الطلبات والذاكرة والمستندات: نتائج مجمّعة، أسهم للتنقل، Enter للفتح، Esc للإغلاق */
export function coSearchBox({ onPick = defaultPick, compact = false } = {}) {
  const id = uid('co-search');
  const status = h('span.sr-only', { 'aria-live': 'polite' });
  const list = h('div.co-search-pop', { id: `${id}-list`, role: 'listbox', 'aria-label': W.search.label, hidden: true });
  const input = h('input.input.co-search-input', {
    type: 'search',
    role: 'combobox',
    autocomplete: 'off',
    enterkeyhint: 'search',
    placeholder: W.search.placeholder,
    'aria-label': W.search.label,
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
    'aria-autocomplete': 'list',
  });
  let timer = 0;
  let seq = 0;
  let opts = [];
  let active = -1;
  const open = (v) => {
    list.hidden = !v;
    input.setAttribute('aria-expanded', v ? 'true' : 'false');
    if (!v) {
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };
  const mark = (i) => {
    active = i;
    opts.forEach((o, k) => o.el.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    if (opts[i]) {
      input.setAttribute('aria-activedescendant', opts[i].el.id);
      opts[i].el.scrollIntoView({ block: 'nearest' });
    }
  };
  const pick = (i) => {
    const o = opts[i];
    if (!o) return;
    open(false);
    input.blur();
    onPick(o.item, o.kind);
  };
  const option = (item, kind, title, sub, ic) => {
    const el = h(
      'div.co-search-opt',
      { id: uid(`${id}-o`), role: 'option', 'aria-selected': 'false', onMousedown: (e) => e.preventDefault(), onClick: () => pick(opts.findIndex((o) => o.el === el)) },
      h('span.co-search-ic', { 'aria-hidden': 'true' }, ic),
      h('span.co-search-txt', h('span.co-search-title', { dir: 'auto' }, title), sub ? h('span.co-search-sub', sub) : null),
    );
    opts.push({ el, item, kind });
    return el;
  };
  function render(q, res) {
    opts = [];
    const groups = [
      ['requests', W.search.requests, (r) => option(r, 'requests', r.title, [h('bdi', { dir: 'ltr' }, r.code), ' · ', stageLabel(r.stage, { short: true })], typeIcon(r.type, { size: 18 }))],
      ['memory', W.search.memory, (m) => option(m, 'memory', m.title, [m.kind_label, m.next_date ? ` · ${dayText(m.next_date, { year: true })}` : ''], icon('book', { size: 18 }))],
      ['documents', W.search.documents, (d) => option(d, 'documents', d.title || d.filename, d.request_code ? h('bdi', { dir: 'ltr' }, d.request_code) : d.filename !== d.title ? d.filename : null, icon('fileText', { size: 18 }))],
    ];
    const nodes = groups
      .filter(([k]) => res[k]?.length)
      .map(([k, label, make]) => h('div.co-search-group', { role: 'group', 'aria-label': label }, h('div.co-search-head', { 'aria-hidden': 'true' }, label), res[k].map(make)));
    list.replaceChildren(...(nodes.length ? nodes : [h('p.co-search-empty', copy('search.empty', { q }))]));
    // قارئ الشاشة يسمع العدد بمعدوده («3 نتائج») لا رقمًا وحده
    status.textContent = nodes.length ? countOf(opts.length, 'result') : copy('search.empty', { q });
    open(true);
  }
  async function run(q) {
    const my = ++seq;
    if (q.length < 2) return open(false);
    try {
      const res = await api.get('/company/search', { q });
      if (my === seq && input.value.trim() === q) render(q, res || {});
    } catch (err) {
      if (my !== seq) return;
      list.replaceChildren(h('p.co-search-empty', err?.status === 401 ? errorMessage(err) : W.search.error));
      open(true);
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    timer = setTimeout(() => run(q), 250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (list.hidden || !opts.length) return;
      e.preventDefault();
      mark((active + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(active);
      else {
        clearTimeout(timer);
        run(input.value.trim());
      }
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      e.stopPropagation();
      open(false);
    }
  });
  input.addEventListener('focus', () => opts.length && input.value.trim().length >= 2 && open(true));
  input.addEventListener('blur', () => setTimeout(() => open(false), 120));
  return h('div.co-search', { class: compact && 'is-compact', role: 'search' }, h('span.co-search-glass', { 'aria-hidden': 'true' }, icon('search', { size: 18 })), input, list, status);
}
