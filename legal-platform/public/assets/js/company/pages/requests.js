// الإصدار 10 — «الطلبات» (U10-26، U10-27 وL-55): حالة «مفتوحة · مكتملة · الكل»، ونطاق «طلباتي · كل ما يمكنني رؤيته»
// للعضو، وبحث في الخادم (بحث غير فارغ يشمل كل الحالات ويقول ذلك)، وتصفية بالنوع (ورقة على الهاتف، قائمة على الحاسوب)،
// والحالة في رابط الصفحة (قابلة للمشاركة ومع زر الرجوع)، وصفحات بـ before=<code>. صفوف على الهاتف وجدول على الحاسوب.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative } from '../../lib/fmt.js';
import { icon, button, badge, emptyState, table, modal, setBusy, toast, errorMessage } from '../../lib/ui.js';
import { REQUEST_TYPES } from '../../lib/company-catalog.js';
import { coRequestRow, stageBadge, promiseText, typeIcon, typeLabel } from '../../lib/company-ui-core.js';
import { W } from '../words.js';
import { S, isViewer, readOnly, setItem, getItem } from '../state.js';
import { pageHead, errorView } from '../common.js';

const STATES = ['open', 'closed', 'all'];
const desktop = () => {
  try {
    return window.matchMedia('(min-width: 1024px)').matches;
  } catch {
    return false;
  }
};
const promiseAt = (r) => r.promise?.delivery_by || r.promise?.confirm_by || r.promise?.first_response_by || '9999';

/** شريط اختيار واحد («مفتوحة · مكتملة · الكل») بأزرار متجاورة */
function segmented(label, options, value, onPick) {
  const btns = options.map(([key, text]) =>
    h('button.co-seg-btn', { type: 'button', 'aria-pressed': key === value ? 'true' : 'false', onClick: () => { btns.forEach((b) => b.setAttribute('aria-pressed', b === btnOf(key) ? 'true' : 'false')); onPick(key); } }, text),
  );
  const btnOf = (key) => btns[options.findIndex((o) => o[0] === key)];
  const el = h('div.co-seg', { role: 'group', 'aria-label': label }, btns);
  el.setValue = (key) => btns.forEach((b, i) => b.setAttribute('aria-pressed', options[i][0] === key ? 'true' : 'false'));
  return el;
}

export default async function requests(ctx) {
  const st = {
    state: STATES.includes(ctx.query.state) ? ctx.query.state : 'open',
    scope: ctx.query.scope === 'mine' ? 'mine' : S.user?.role === 'member' && getItem('localStorage', `ek.co.view:${S.user.id}:scope`) === 'mine' ? 'mine' : 'visible',
    q: String(ctx.query.q || '').slice(0, 100),
    type: REQUEST_TYPES.some((t) => t.key === ctx.query.type) ? ctx.query.type : '',
  };
  let items = [];
  let next = null;
  let seq = 0;
  const listEl = h('div.co-req-list', { 'aria-live': 'polite', 'aria-busy': 'false' });
  const note = h('p.co-searched', { hidden: true }, icon('search', { size: 16 }), h('span', W.requests.searched));
  const moreBtn = button(W.requests.more, { variant: 'secondary', onClick: () => load(true) });
  const moreWrap = h('div.co-more-wrap', { hidden: true }, moreBtn);

  /** الحالة في الرابط بلا إعادة رسم الصفحة (التركيز يبقى في حقل البحث) */
  function syncHash() {
    const q = new URLSearchParams();
    if (st.state !== 'open') q.set('state', st.state);
    if (st.scope === 'mine') q.set('scope', 'mine');
    if (st.q) q.set('q', st.q);
    if (st.type) q.set('type', st.type);
    const s = q.toString();
    window.history.replaceState(null, '', `#/requests${s ? `?${s}` : ''}`);
  }

  function renderList() {
    note.hidden = !st.q;
    stateSeg.classList.toggle('is-muted', !!st.q);
    if (!items.length) return mount(listEl, emptyView());
    let rows = items;
    if (!st.q && st.state === 'open') rows = [...items].sort((a, b) => Number(b.needs_you) - Number(a.needs_you) || String(promiseAt(a)).localeCompare(String(promiseAt(b))));
    if (desktop()) {
      mount(
        listEl,
        table({
          caption: W.nav.requests,
          rows,
          onRowClick: (r) => ctx.navigate(`/requests/${encodeURIComponent(r.code)}`),
          columns: [
            { key: 'title', label: W.requests.col_request, render: (r) => h('a.co-cell-req', { href: `#/requests/${encodeURIComponent(r.code)}` }, h('span.co-cell-icon', { 'aria-hidden': 'true' }, typeIcon(r.type, { size: 20 })), h('span.co-cell-text', h('span.co-cell-title', { dir: 'auto' }, r.title), h('bdi.co-code', { dir: 'ltr' }, r.code))) },
            { key: 'type', label: W.requests.col_type, render: (r) => badge(r.type_label || typeLabel(r.type), 'primary', { className: 'co-badge' }) },
            { key: 'stage', label: W.requests.col_status, render: (r) => stageBadge(r.stage, { late: r.promise?.state === 'late', short: true }) },
            { key: 'promise', label: W.requests.col_promise, render: (r) => h('span.co-cell-promise', promiseText(r.promise, { stage: r.stage, short: true }).text || '—') },
            { key: 'by', label: W.requests.col_sender, render: (r) => (r.submitted_by?.id === S.user?.id ? W.requests.you : r.submitted_by?.name || '—') },
            { key: 'updated_at', label: W.requests.col_updated, render: (r) => h('span.num', relative(r.updated_at)) },
          ],
        }),
      );
    } else mount(listEl, h('ul.k-list.co-req-rows', rows.map((r) => h('li', coRequestRow(r)))));
  }

  function emptyView() {
    if (st.q || st.type) return emptyState(W.requests.empty_search, button(W.requests.clear_search, { variant: 'secondary', onClick: () => { st.q = ''; st.type = ''; searchInput.value = ''; typeCtl.update(); syncHash(); load(); } }), { icon: 'search' });
    if (isViewer() && st.state !== 'closed') return emptyState(W.requests.empty_viewer, null, { title: W.requests.empty_viewer_title, icon: 'inbox' });
    if (st.state === 'open' && hasAny) return emptyState(W.requests.empty_open, button(W.requests.show_closed, { variant: 'secondary', onClick: () => { st.state = 'closed'; stateSeg.setValue('closed'); syncHash(); load(); } }), { icon: 'checkCircle' });
    return emptyState(W.requests.empty_text, isViewer() || readOnly() ? null : button(W.nav.new_request, { variant: 'secondary', icon: 'plus', href: '#/requests/new' }), { title: W.requests.empty_title, icon: 'inbox' });
  }

  let hasAny = true;
  async function load(append = false) {
    const my = ++seq;
    listEl.setAttribute('aria-busy', 'true');
    if (append) setBusy(moreBtn, true);
    try {
      const res = await api.get('/company/requests', { state: st.q ? 'all' : st.state, scope: st.scope === 'mine' ? 'mine' : undefined, q: st.q || undefined, type: st.type || undefined, before: append ? next : undefined, limit: 20 });
      if (my !== seq) return;
      items = append ? [...items, ...(res.items || [])] : res.items || [];
      next = res.next_before || null;
      if (!items.length && !append && st.state === 'open' && !st.q && !st.type) {
        const any = await api.get('/company/requests', { state: 'all', limit: 1 }).catch(() => null);
        hasAny = !!any?.items?.length;
      }
      renderList();
      moreWrap.hidden = !next;
    } catch (err) {
      if (my !== seq) return;
      if (append) toast(errorMessage(err), 'danger');
      else mount(listEl, errorView(W.nav.requests, err, () => load()));
    } finally {
      if (my === seq) listEl.setAttribute('aria-busy', 'false');
      setBusy(moreBtn, false);
    }
  }

  const stateSeg = segmented(W.requests.state_label, [['open', W.requests.open], ['closed', W.requests.closed], ['all', W.requests.all]], st.state, (v) => {
    st.state = v;
    syncHash();
    load();
  });
  const scopeSeg =
    S.user?.role === 'member'
      ? segmented(W.requests.scope_label, [['mine', W.requests.mine], ['visible', W.requests.visible]], st.scope, (v) => {
          st.scope = v;
          setItem('localStorage', `ek.co.view:${S.user.id}:scope`, v);
          syncHash();
          load();
        })
      : null;
  let timer = 0;
  const searchInput = h('input.input', {
    type: 'search',
    value: st.q,
    placeholder: W.requests.search,
    'aria-label': W.requests.search_label,
    enterkeyhint: 'search',
    onInput: () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        st.q = searchInput.value.trim().slice(0, 100);
        syncHash();
        load();
      }, 300);
    },
  });
  const search = h('div.search-input.co-req-search', icon('search', { size: 18 }), searchInput);

  // التصفية بالنوع: قائمة منسدلة على الحاسوب، وورقة بشرائح على الهاتف
  const typeCtl = (() => {
    const sel = h('select.input', { 'aria-label': W.requests.type, onChange: () => { st.type = sel.value; syncHash(); load(); updateBtn(); } }, h('option', { value: '' }, W.requests.all_types), REQUEST_TYPES.map((t) => h('option', { value: t.key }, t.company_label)));
    sel.value = st.type;
    const label = h('span');
    const btn = h('button.btn.btn-secondary.co-type-btn', { type: 'button', onClick: () => openSheet() }, icon('filter', { size: 18 }), label);
    const updateBtn = () => {
      label.textContent = st.type ? typeLabel(st.type) : W.requests.type;
      btn.classList.toggle('is-on', !!st.type);
      sel.value = st.type;
    };
    function openSheet() {
      let pick = st.type;
      const chips = h(
        'div.co-type-chips',
        { role: 'radiogroup', 'aria-label': W.requests.type },
        [['', W.requests.all_types], ...REQUEST_TYPES.map((t) => [t.key, t.company_label])].map(([k, l]) =>
          h('button.chip-toggle', { type: 'button', role: 'radio', 'aria-checked': k === pick ? 'true' : 'false', onClick: (e) => { pick = k; chips.querySelectorAll('[role=radio]').forEach((b) => b.setAttribute('aria-checked', b === e.currentTarget ? 'true' : 'false')); } }, l),
        ),
      );
      modal({ title: W.requests.type_sheet, sheet: true, body: chips, actions: [{ label: W.requests.apply, variant: 'primary', onClick: () => { st.type = pick; updateBtn(); syncHash(); load(); } }] });
    }
    updateBtn();
    return { el: h('div.co-type-filter', h('div.select-wrap.co-type-select', sel), btn), update: updateBtn };
  })();

  // إعادة الرسم عند عبور حد 1024px (صفوف ↔ جدول)
  let wasDesktop = desktop();
  const onResize = () => {
    if (!listEl.isConnected) return window.removeEventListener('resize', onResize);
    if (desktop() !== wasDesktop) {
      wasDesktop = desktop();
      if (items.length) renderList();
    }
  };
  window.addEventListener('resize', onResize);

  await load();
  return h(
    'div.co-page.co-requests',
    pageHead(W.nav.requests, W.requests.sub),
    h('div.co-filters', h('div.co-filter-row', stateSeg, scopeSeg), h('div.co-filter-row', search, typeCtl.el)),
    note,
    listEl,
    moreWrap,
  );
}
