// الإصدار 10 — «الذاكرة القانونية» (U10-59): بحث في كل الأنواع المقروءة، شريط «مواعيد خلال 60 يومًا» (5 على الأكثر +
// «التقويم ‹»)، ثم الأقسام بعدد كل قسم وسطر حالته (صفوف على الهاتف، بطاقات بثلاثة أعمدة على الحاسوب). المواقف المعتمدة
// والمفوَّضون والنزاعات لمديري البوابة (والخادم لا يعيد عناصر «مديرو البوابة فقط» لغيرهم؛ L-51).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { icon, button, kRow, emptyState, errorMessage } from '../../lib/ui.js';
import { MEMORY_KINDS } from '../../lib/company-catalog.js';
import { copy, countOf, dayText } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { isAdmin, isViewer, readOnly } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';

export const ADMIN_KINDS = new Set(['position', 'person', 'dispute']);
const KIND_ICON = { contract: 'fileSignature', template: 'filePen', licence: 'shieldCheck', resolution: 'landmark', position: 'flag', person: 'userCog', policy: 'book', dispute: 'scale', key_date: 'calendarClock' };

export const kindHref = (k) => (k.key === 'key_date' ? '#/memory/calendar' : `#/memory/${k.slug}`);
export const kindIcon = (key, size = 22) => icon(KIND_ICON[key] || 'bookOpen', { size });

/** صف عنصر ذاكرة مختصر (نتائج البحث، المواعيد) */
export function memoryRow(m, { sub } = {}) {
  return kRow({ icon: kindIcon(m.kind), title: h('span', { dir: 'auto' }, m.title), sub: sub ?? [m.kind_label, m.next_date ? ` · ${dayText(m.next_date, { year: true })}` : ''], href: `#/memory/item/${encodeURIComponent(m.id)}` });
}

/** صف موعد: شريحة اليوم + العنوان + «النوع · نوع الموعد» */
export function dateRow(d) {
  return kRow({ icon: h('span.co-date-chip.num', dayText(d.date)), title: h('span', { dir: 'auto' }, d.title), sub: `${d.kind_label} · ${d.date_kind_label}`, href: `#/memory/item/${encodeURIComponent(d.memory_id)}` });
}

export function canAdd(kinds, key) {
  return !isViewer() && !readOnly() && kinds.includes(key);
}

export default async function memoryHub(ctx) {
  let data;
  let dates;
  try {
    [data, dates] = await Promise.all([api.get('/company/memory', { limit: 1 }), api.get('/company/key-dates').catch(() => ({ items: [] }))]);
  } catch (err) {
    return errorView(W.nav.memory, err, () => ctx.reload());
  }
  const counts = data.counts || {};
  const kinds = data.can?.kinds || [];
  const total = Object.values(counts).reduce((n, c) => n + (c.total || 0), 0);

  // البحث في الذاكرة (q في الخادم، كل الأنواع المقروءة)
  const results = h('div.co-mem-results', { 'aria-live': 'polite' });
  let seq = 0;
  let timer = 0;
  const input = h('input.input', {
    type: 'search',
    placeholder: W.memory.search,
    'aria-label': W.memory.search,
    enterkeyhint: 'search',
    onInput: () => {
      clearTimeout(timer);
      timer = setTimeout(run, 300);
    },
  });
  async function run() {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) {
      mount(results);
      body.hidden = false;
      return;
    }
    try {
      const res = await api.get('/company/memory', { q, limit: 30 });
      if (my !== seq) return;
      body.hidden = true;
      mount(
        results,
        sectionCard(
          W.memory.results,
          res.items?.length ? h('ul.k-list', res.items.map((m) => h('li', memoryRow(m)))) : h('p.co-muted', copy('search.empty', { q })),
        ),
      );
    } catch (err) {
      if (my === seq) mount(results, h('p.co-send-error', { role: 'alert' }, errorMessage(err)));
    }
  }

  const strip = sectionCard(
    W.memory.dates,
    dates.items?.length ? h('ul.k-list.co-dates', dates.items.slice(0, 5).map((d) => h('li', dateRow(d)))) : h('p.co-muted', W.memory.no_dates),
    { actions: h('a.co-link', { href: '#/memory/calendar' }, W.memory.calendar_link, ' ‹') },
  );

  const visibleKinds = MEMORY_KINDS.filter((k) => isAdmin() || !ADMIN_KINDS.has(k.key));
  const tiles = [
    ...visibleKinds.map((k) => {
      const c = counts[k.key] || { total: 0, soon: 0 };
      const line = k.key === 'key_date' ? [W.memory.calendar_link, c.total ? ` · ${c.total}` : ''] : [h('span.num', String(c.total)), c.soon ? ` · ${countOf(c.soon, 'soon_date')}` : ''];
      return { href: kindHref(k), key: k.key, title: k.key === 'key_date' ? W.nav.calendar : k.list_label, line, warn: c.soon > 0 };
    }),
    { href: '#/memory/entities', key: 'entities', title: W.nav.entities, line: copy('memory.entities_line', { n: data.entities ?? 0, max: data.max_entities ?? '—' }), icon: 'building' },
    { href: '#/memory/counterparties', key: 'counterparties', title: W.nav.counterparties, line: h('span.num', String(data.counterparties ?? 0)), icon: 'users' },
  ];
  const grid = h(
    'ul.co-mem-kinds',
    tiles.map((t) =>
      h(
        'li',
        h(
          'a.co-mem-kind',
          { href: t.href, dataset: { kind: t.key } },
          h('span.co-mem-kind-icon', { 'aria-hidden': 'true' }, t.icon ? icon(t.icon, { size: 22 }) : kindIcon(t.key)),
          h('span.co-mem-kind-text', h('span.co-mem-kind-title', t.title), h('span.co-mem-kind-line', { class: t.warn && 'is-warn' }, t.warn ? icon('clock', { size: 14 }) : null, t.line)),
          h('span.co-mem-kind-chev', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 18 })),
        ),
      ),
    ),
  );
  const empty =
    total === 0
      ? emptyState(
          W.memory.empty_text,
          canAdd(kinds, 'contract') || canAdd(kinds, 'licence')
            ? h(
                'div.co-row-actions',
                canAdd(kinds, 'contract') ? button(W.memory.add_contract, { variant: 'secondary', icon: 'plus', href: '#/memory/new/contracts' }) : null,
                canAdd(kinds, 'licence') ? button(W.memory.add_licence, { variant: 'secondary', icon: 'plus', href: '#/memory/new/licences' }) : null,
              )
            : null,
          { title: W.memory.empty_title, icon: 'bookOpen' },
        )
      : null;
  const body = h('div.co-mem-body', empty ? h('section.co-section', empty) : null, strip, h('section.co-section', h('header.co-section-head', h('h2.co-section-title', W.memory.kinds)), grid));
  return h(
    'div.co-page.co-memory',
    pageHead(W.nav.memory, W.memory.sub),
    h('div.search-input.co-mem-search', { role: 'search' }, icon('search', { size: 18 }), input),
    results,
    body,
  );
}

