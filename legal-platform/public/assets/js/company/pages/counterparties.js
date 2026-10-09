// الإصدار 10 — «الأطراف المتعاملة» `#/memory/counterparties` (U10-66، P1): قائمة للاطلاع (الاسم · النوع · «{n} عقود · {m}
// طلبات») تُبنى تلقائيًا من الطلبات والعقود؛ لكل طرف «عرض العناصر» (الذاكرة مصفّاة به) و«عرض الطلبات» (بحث باسمه).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { icon, button, emptyState } from '../../lib/ui.js';
import { countOf } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { pageHead, errorView, sectionCard } from '../common.js';

const M = W.memory;

export default async function counterparties(ctx) {
  const parent = { label: W.nav.memory, href: '#/memory' };
  let items;
  try {
    items = (await api.get('/company/counterparties')).items || [];
  } catch (err) {
    return errorView(W.nav.counterparties, err, () => ctx.reload(), parent);
  }
  const listEl = h('div', { 'aria-live': 'polite' });
  const render = (q = '') => {
    const nq = q.trim();
    const shown = nq ? items.filter((c) => c.name.includes(nq)) : items;
    if (!shown.length) return mount(listEl, emptyState(M.cps_empty, null, { icon: 'users' }));
    mount(
      listEl,
      h(
        'ul.co-cps',
        shown.map((c) =>
          h(
            'li.co-cp',
            h('span.co-cp-icon', { 'aria-hidden': 'true' }, icon(c.kind === 'supplier' ? 'truck' : 'users', { size: 20 })),
            h('span.co-cp-main', h('span.co-cp-name', { dir: 'auto' }, c.name), h('span.co-muted', `${c.kind_label} · ${countOf(c.contracts, 'contract')} · ${countOf(c.requests, 'request')}`)),
            h(
              'span.co-file-actions',
              c.memory_items ? button(M.cps_items, { variant: 'ghost', size: 'sm', href: `#/memory/contracts?counterparty_id=${encodeURIComponent(c.id)}` }) : null,
              c.requests ? button(M.cps_requests, { variant: 'ghost', size: 'sm', href: `#/requests?q=${encodeURIComponent(c.name)}` }) : null,
            ),
          ),
        ),
      ),
    );
  };
  const search = h('input.input', { type: 'search', placeholder: M.cps_search, 'aria-label': M.cps_search, onInput: () => render(search.value) });
  render();
  return h(
    'div.co-page.co-counterparties',
    pageHead(W.nav.counterparties, M.cps_sub),
    h('div.co-filters', h('div.co-filter-row', h('div.search-input.co-req-search', icon('search', { size: 18 }), search))),
    sectionCard(null, listEl),
  );
}
