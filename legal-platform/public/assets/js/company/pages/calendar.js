// الإصدار 10 — «المواعيد المهمة» `#/memory/calendar` (U10-64): فترة «60 يومًا · 3 أشهر · 12 شهرًا» وتصفية بالنوع، ثم جدول
// أعمال مجمّع بالشهر (رقم اليوم واسمه + العنوان + «النوع · نوع الموعد»). الشبكة الشهرية مؤجلة (P2)، ولا زر اشتراك ICS (10.1).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { monthLabel, weekday, cairoToday } from '../../lib/fmt.js';
import { button, emptyState } from '../../lib/ui.js';
import { MEMORY_KINDS } from '../../lib/company-catalog.js';
import { W } from '../words-pages.js';
import { isAdmin } from '../state.js';
import { pageHead, errorView } from '../common.js';
import { canAdd, ADMIN_KINDS, kindIcon } from './memory.js';

const M = W.memory;
const RANGES = [
  ['60', M.range_60, 60],
  ['3m', M.range_3m, 92],
  ['12m', M.range_12m, 366],
];
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default async function calendar(ctx) {
  const parent = { label: W.nav.memory, href: '#/memory' };
  const st = { range: RANGES.some((r) => r[0] === ctx.query.range) ? ctx.query.range : '60', kind: MEMORY_KINDS.some((k) => k.key === ctx.query.kind) ? ctx.query.kind : '' };
  const listEl = h('div.co-agenda-wrap', { 'aria-live': 'polite' });
  let kinds = [];
  try {
    kinds = (await api.get('/company/memory', { limit: 1 })).can?.kinds || [];
  } catch (err) {
    return errorView(W.nav.calendar, err, () => ctx.reload(), parent);
  }
  function syncHash() {
    const s = new URLSearchParams();
    if (st.range !== '60') s.set('range', st.range);
    if (st.kind) s.set('kind', st.kind);
    const qs = s.toString();
    window.history.replaceState(null, '', `#/memory/calendar${qs ? `?${qs}` : ''}`);
  }
  let seq = 0;
  async function load() {
    const my = ++seq;
    const from = cairoToday();
    const to = addDays(from, RANGES.find((r) => r[0] === st.range)[2]);
    try {
      const res = await api.get('/company/key-dates', { from, to, kind: st.kind || undefined });
      if (my !== seq) return;
      render(res.items || []);
    } catch (err) {
      if (my === seq) mount(listEl, errorView(W.nav.calendar, err, () => load(), parent));
    }
  }
  function render(items) {
    if (!items.length) return mount(listEl, emptyState(M.cal_empty, null, { icon: 'calendar' }));
    const groups = new Map();
    for (const d of items) {
      const k = d.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    mount(
      listEl,
      [...groups].map(([ym, list]) =>
        h(
          'section.co-section.co-agenda',
          h('header.co-section-head', h('h2.co-section-title', monthLabel(ym))),
          h(
            'ul.co-agenda-list',
            list.map((d) =>
              h(
                'li',
                h(
                  'a.co-agenda-row',
                  { href: `#/memory/item/${encodeURIComponent(d.memory_id)}` },
                  h('span.co-agenda-day', h('span.co-agenda-num.num', String(Number(d.date.slice(8, 10)))), h('span.co-agenda-wd', weekday(`${d.date}T10:00:00Z`))),
                  h('span.co-agenda-icon', { 'aria-hidden': 'true' }, kindIcon(d.kind, 20)),
                  h('span.co-agenda-text', h('span.co-agenda-title', { dir: 'auto' }, d.title), h('span.co-muted', `${d.kind_label} · ${d.date_kind_label}`)),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
  const rangeSeg = h(
    'div.co-seg',
    { role: 'group', 'aria-label': M.range_label },
    RANGES.map(([k, label]) => h('button.co-seg-btn', { type: 'button', 'aria-pressed': st.range === k ? 'true' : 'false', onClick: (e) => { st.range = k; rangeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); syncHash(); load(); } }, label)),
  );
  const kindSel = h(
    'select.input',
    { 'aria-label': M.kind_label, onChange: () => { st.kind = kindSel.value; syncHash(); load(); } },
    h('option', { value: '' }, M.kind_all),
    MEMORY_KINDS.filter((k) => isAdmin() || !ADMIN_KINDS.has(k.key)).map((k) => h('option', { value: k.key }, k.list_label)),
  );
  kindSel.value = st.kind;
  await load();
  const add = canAdd(kinds, 'key_date') ? button(M.add_date, { variant: 'secondary', icon: 'plus', href: '#/memory/new/key-dates' }) : null;
  return h(
    'div.co-page.co-calendar',
    pageHead(W.nav.calendar, M.cal_sub, { actions: add }),
    h('div.co-filters', h('div.co-filter-row', rangeSeg, h('div.select-wrap.co-mem-select', kindSel))),
    listEl,
  );
}
