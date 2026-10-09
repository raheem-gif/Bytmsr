// الإصدار 10 — قوائم الذاكرة القانونية `#/memory/<slug>` (U10-60 وبقية الأنواع بنفس المكوّن): شرائح الحالة، وللعقود
// «الكيان» و«الطرف الآخر» و«التجديد»، وبحث؛ والحالة كلها في رابط الصفحة. على الحاسوب جدول بأعمدة النوع، وعلى الهاتف صفوف
// بشارة واحدة حسب الأولوية: «آخر موعد لإيقاف التجديد بعد…» (تحذير، ≤ 60 يومًا) ← «ينتهي بعد…» (≤ 90) ← «يتجدد تلقائيًا» ← «منتهٍ».
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { money } from '../../lib/fmt.js';
import { icon, button, badge, table, emptyState, kRow } from '../../lib/ui.js';
import { memoryKindBySlug, memoryFields } from '../../lib/company-catalog-fields.js';
import { copy, countOf, dayText, daysUntil } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { isAdmin } from '../state.js';
import { pageHead, errorView } from '../common.js';
import { canAdd, ADMIN_KINDS, kindIcon } from './memory.js';

const M = W.memory;
const desktop = () => {
  try {
    return window.matchMedia('(min-width: 1024px)').matches;
  } catch {
    return false;
  }
};
const STATUS_TONE = { active: 'success', renewed: 'success', draft: 'info', under_review: 'info', renewal_in_progress: 'info', threatened: 'warning', won: 'success', settled: 'neutral', lost: 'neutral', expired: 'neutral', terminated: 'neutral', cancelled: 'neutral', revoked: 'neutral', retired: 'neutral', superseded: 'neutral', closed: 'neutral', done: 'neutral' };
const statusBadge = (m) => badge(m.status_label || m.status, STATUS_TONE[m.status] || 'neutral', { className: 'co-badge', icon: STATUS_TONE[m.status] === 'warning' ? 'alert' : null });
const after = (n) => (n <= 0 ? M.today : `بعد ${countOf(n, 'day_after')}`);

/** شارة واحدة للعقد حسب الأولوية (U10-60) */
export function contractBadge(m) {
  const notice = m.notice_deadline ? daysUntil(m.notice_deadline) : null;
  const end = m.end_date ? daysUntil(m.end_date) : null;
  if (['expired', 'terminated'].includes(m.status) || (end != null && end < 0)) return badge(M.badge_expired, 'neutral', { className: 'co-badge' });
  if (notice != null && notice >= 0 && notice <= 60) return badge(copy('memory.badge_notice', { when: after(notice) }), 'warning', { className: 'co-badge', icon: 'clock' });
  if (end != null && end >= 0 && end <= 90) return badge(copy('memory.badge_ends', { when: after(end) }), 'info', { className: 'co-badge', icon: 'clock' });
  if (m.renewal_type === 'auto') return badge(M.badge_auto, 'primary', { className: 'co-badge' });
  return null;
}

export default async function memoryList(ctx) {
  const kind = memoryKindBySlug(ctx.params.slug);
  const parent = { label: W.nav.memory, href: '#/memory' };
  if (!kind || (ADMIN_KINDS.has(kind.key) && !isAdmin())) return errorView(W.nav.memory, { status: 404 }, null, parent);
  const isContract = kind.key === 'contract';
  ctx.setTitle(kind.list_label);
  const roles = Object.fromEntries((memoryFields('contract').find((f) => f.key === 'our_role')?.options || []).map((o) => [o.key, o.label]));
  const q = ctx.query;
  const st = {
    chip: ['active', 'soon', 'expired', 'drafts'].includes(q.chip) ? q.chip : 'all',
    entity_id: q.entity_id || '',
    counterparty_id: q.counterparty_id || '',
    renewal_type: ['auto', 'manual', 'none'].includes(q.renewal_type) ? q.renewal_type : '',
    q: String(q.q || '').slice(0, 100),
  };
  let res;
  let ents = [];
  let cps = [];
  const params = () => ({
    kind: kind.key,
    status: st.chip === 'active' ? 'active' : st.chip === 'expired' ? 'expired,terminated' : st.chip === 'drafts' ? 'draft,under_review' : undefined,
    due_within_days: st.chip === 'soon' ? 60 : undefined,
    entity_id: st.entity_id || undefined,
    counterparty_id: st.counterparty_id || undefined,
    renewal_type: isContract && st.renewal_type ? st.renewal_type : undefined,
    q: st.q.length >= 2 ? st.q : undefined,
    limit: 300,
  });
  try {
    [res, ents, cps] = await Promise.all([
      api.get('/company/memory', params()),
      api.get('/company/entities').then((r) => r.items || []).catch(() => []),
      isContract || st.counterparty_id ? api.get('/company/counterparties').then((r) => r.items || []).catch(() => []) : [],
    ]);
  } catch (err) {
    return errorView(kind.list_label, err, () => ctx.reload(), parent);
  }
  const kinds = res.can?.kinds || [];
  const listEl = h('div.co-mem-list', { 'aria-live': 'polite' });
  const filtered = () => st.chip !== 'all' || st.entity_id || st.counterparty_id || st.renewal_type || st.q;

  function syncHash() {
    const s = new URLSearchParams();
    for (const k of ['chip', 'entity_id', 'counterparty_id', 'renewal_type', 'q']) if (st[k] && st[k] !== 'all') s.set(k, st[k]);
    const qs = s.toString();
    window.history.replaceState(null, '', `#/memory/${kind.slug}${qs ? `?${qs}` : ''}`);
  }
  let seq = 0;
  async function load() {
    const my = ++seq;
    listEl.setAttribute('aria-busy', 'true');
    try {
      const r = await api.get('/company/memory', params());
      if (my !== seq) return;
      res = r;
      render();
    } catch (err) {
      if (my === seq) mount(listEl, errorView(kind.list_label, err, () => load(), parent));
    } finally {
      if (my === seq) listEl.setAttribute('aria-busy', 'false');
    }
  }
  function render() {
    const items = res.items || [];
    if (!items.length) {
      mount(
        listEl,
        filtered()
          ? emptyState(M.empty_filtered, button(M.clear_filters, { variant: 'secondary', onClick: () => { Object.assign(st, { chip: 'all', entity_id: '', counterparty_id: '', renewal_type: '', q: '' }); search.value = ''; syncHash(); ctx.reload(); } }), { icon: 'search' })
          : emptyState(M.empty_list, canAdd(kinds, kind.key) ? button(copy('memory.add', { label: kind.label }), { variant: 'secondary', icon: 'plus', href: `#/memory/new/${kind.slug}` }) : null, { icon: 'bookOpen' }),
      );
      return;
    }
    const href = (m) => `#/memory/item/${encodeURIComponent(m.id)}`;
    if (desktop()) {
      const cols = isContract
        ? [
            { key: 'title', label: M.col_contract, render: (m) => h('a.co-cell-req', { href: href(m) }, h('span.co-cell-icon', { 'aria-hidden': 'true' }, kindIcon(m.kind, 20)), h('span.co-cell-text', h('span.co-cell-title', { dir: 'auto' }, m.title), m.counterparty ? h('span.co-muted', { dir: 'auto' }, m.counterparty.name) : null)) },
            { key: 'entity', label: M.col_entity, render: (m) => h('span', { dir: 'auto' }, m.entity?.name || '—') },
            { key: 'our_role', label: M.col_role, render: (m) => roles[m.our_role] || '—' },
            { key: 'value', label: M.col_value, render: (m) => h('span.num', m.value != null ? (m.currency && m.currency !== 'EGP' ? `${Number(m.value).toLocaleString('en-US')} ${m.currency}` : money(m.value)) : '—') },
            { key: 'end_date', label: M.col_end, render: (m) => h('span.num', m.end_date ? dayText(m.end_date, { year: true }) : '—') },
            { key: 'notice', label: M.col_notice, render: (m) => h('span.co-cell-stack', m.notice_deadline ? h('span.num', dayText(m.notice_deadline, { year: true })) : '—', contractBadge(m)) },
            { key: 'status', label: M.col_status, render: (m) => statusBadge(m) },
          ]
        : [
            { key: 'title', label: M.col_title, render: (m) => h('a.co-cell-req', { href: href(m) }, h('span.co-cell-icon', { 'aria-hidden': 'true' }, kindIcon(m.kind, 20)), h('span.co-cell-text', h('span.co-cell-title', { dir: 'auto' }, m.title), m.counterparty ? h('span.co-muted', { dir: 'auto' }, m.counterparty.name) : null)) },
            { key: 'entity', label: M.col_entity, render: (m) => h('span', { dir: 'auto' }, m.entity?.name || '—') },
            { key: 'next', label: M.col_next, render: (m) => h('span.num', m.next_date ? dayText(m.next_date, { year: true }) : '—') },
            { key: 'status', label: M.col_status, render: (m) => statusBadge(m) },
          ];
      mount(listEl, table({ caption: kind.list_label, rows: items, columns: cols, onRowClick: (m) => ctx.navigate(`/memory/item/${m.id}`) }));
    } else {
      mount(
        listEl,
        h(
          'ul.k-list.co-mem-rows',
          items.map((m) => {
            const sub = isContract
              ? [m.counterparty ? h('span', { dir: 'auto' }, m.counterparty.name) : null, m.end_date ? `${m.counterparty ? ' · ' : ''}${copy('memory.ends_on', { date: dayText(m.end_date, { year: true }) })}` : '']
              : [m.status_label, m.next_date ? ` · ${dayText(m.next_date, { year: true })}` : ''];
            return h('li', kRow({ icon: kindIcon(m.kind), title: h('span', { dir: 'auto' }, m.title), sub, badges: isContract ? contractBadge(m) : null, href: href(m), className: 'co-row' }));
          }),
        ),
      );
    }
  }

  // الشرائح والمرشحات
  const chipDefs = isContract
    ? [['all', M.chip_all], ['active', M.chip_active], ['soon', M.chip_soon], ['expired', M.chip_expired], ['drafts', M.chip_drafts]]
    : [['all', M.chip_all], ['soon', M.chip_soon]];
  const chips = h(
    'div.co-seg.co-mem-chips',
    { role: 'group', 'aria-label': M.filter_label },
    chipDefs.map(([k, label]) =>
      h('button.co-seg-btn', { type: 'button', 'aria-pressed': st.chip === k ? 'true' : 'false', onClick: (e) => { st.chip = k; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); syncHash(); load(); } }, label),
    ),
  );
  const select = (label, value, options, onChange) => {
    const sel = h('select.input', { 'aria-label': label, onChange: () => onChange(sel.value) }, h('option', { value: '' }, `${label}: ${M.any}`), options.map(([v, l]) => h('option', { value: String(v) }, l)));
    sel.value = String(value || '');
    return h('div.select-wrap.co-mem-select', sel);
  };
  const selects = [];
  if (ents.length > 1) selects.push(select(M.entity, st.entity_id, ents.map((e) => [e.id, e.name]), (v) => { st.entity_id = v; syncHash(); load(); }));
  if (isContract && cps.length) selects.push(select(M.counterparty, st.counterparty_id, cps.map((c) => [c.id, c.name]), (v) => { st.counterparty_id = v; syncHash(); load(); }));
  else if (st.counterparty_id) selects.push(select(M.counterparty, st.counterparty_id, cps.map((c) => [c.id, c.name]), (v) => { st.counterparty_id = v; syncHash(); load(); }));
  if (isContract) selects.push(select(M.renewal, st.renewal_type, [['auto', M.renewal_auto], ['manual', M.renewal_manual], ['none', M.renewal_none]], (v) => { st.renewal_type = v; syncHash(); load(); }));
  let timer = 0;
  const search = h('input.input', {
    type: 'search',
    value: st.q,
    placeholder: M.search,
    'aria-label': M.search,
    onInput: () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        st.q = search.value.trim().slice(0, 100);
        syncHash();
        load();
      }, 300);
    },
  });
  render();
  // عبور حد 1024px: صفوف ↔ جدول
  let wasDesktop = desktop();
  const onResize = () => {
    if (!listEl.isConnected) return window.removeEventListener('resize', onResize);
    if (desktop() !== wasDesktop) {
      wasDesktop = desktop();
      render();
    }
  };
  window.addEventListener('resize', onResize);
  const add = canAdd(kinds, kind.key) ? button(copy('memory.add', { label: kind.label }), { variant: 'secondary', icon: 'plus', href: `#/memory/new/${kind.slug}` }) : null;
  return h(
    'div.co-page.co-mem-page',
    pageHead(kind.list_label, null, { actions: add }),
    h('div.co-filters', h('div.co-filter-row', chips), h('div.co-filter-row', h('div.search-input.co-req-search', icon('search', { size: 18 }), search), selects)),
    listEl,
  );
}
