// العملاء: لكل عميل رقم مستقل (CL-00881)، وقد تكون له عدة طلبات وملفات عبر الزمن ومن أكثر من قناة.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { relative, dateTime, num } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  badge,
  icon,
  codeTag,
  ltr,
  table,
  emptyState,
  errorState,
  loading,
  filterBar,
  searchInput,
  modal,
  toast,
} from '../../../lib/ui.js';
import { replaceQuery } from './inbox.js';

const PAGE = 50;

/**
 * نافذة للبحث عن عميل واختياره (تُستخدم في الدمج).
 * @param {{title:string, intro?:string, excludeId?:number, initialQuery?:string, confirmLabel?:string}} opts
 * @returns {Promise<object|null>} العميل المختار أو null عند الإلغاء
 */
export function pickClient({ title, intro, excludeId, initialQuery = '', confirmLabel = 'متابعة' } = {}) {
  return new Promise((resolve) => {
    let chosen = null;
    let confirmed = false;
    let seq = 0;
    const results = h('div.pa-pick-results', { 'aria-live': 'polite' });

    async function search(q) {
      const my = ++seq;
      chosen = null;
      mount(results, loading('جارٍ البحث…'));
      try {
        const res = await api.get('/admin/clients', { q, limit: 20 });
        if (my !== seq) return;
        const list = (res.items || []).filter((c) => c.id !== excludeId);
        if (!list.length) {
          mount(results, emptyState(q ? 'لا يوجد مستفيد/ة مطابق لهذا البحث' : 'لا يوجد مستفيدون آخرون', null, { compact: true, icon: 'users', tag: 'CLI-01' }));
          return;
        }
        const buttons = [];
        const items = list.map((c) => {
          const b = h(
            'button.pa-pick-item',
            {
              type: 'button',
              'aria-pressed': 'false',
              onClick: () => {
                chosen = c;
                buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
              },
              tag: 'CLI-02',
            },
            h('span.pa-pick-check', { 'aria-hidden': 'true' }, icon('check', { size: 14 })),
            h(
              'span.pa-pick-body',
              h('span.pa-pick-head', codeTag(c.code), h('strong', c.name || 'بدون اسم')),
              h(
                'span.pa-pick-sub',
                c.phone ? ltr(c.phone) : h('span.muted', 'لا يوجد هاتف'),
                h('span', `طلبات: ${c.intakes_count} · ملفات: ${c.cases_count}`),
              ),
            ),
          );
          buttons.push(b);
          return h('li', b);
        });
        mount(results, h('ul.pa-pick-list', { 'aria-label': 'نتائج البحث — اختر مستفيدًا' }, items));
      } catch (err) {
        if (my !== seq) return;
        mount(results, errorState(err, () => search(q)));
      }
    }

    modal({
      title,
      size: 'md',
      body: () =>
        frag(
          intro && h('p.modal-intro', intro),
          searchInput({
            placeholder: 'ابحث بالاسم أو كود المستفيد/ة أو رقم الهاتف…',
            label: 'بحث عن مستفيد/ة',
            value: initialQuery,
            onSearch: (q) => search(q),
            tag: 'CLI-03',
          }),
          results,
        ),
      actions: [
        { label: 'إلغاء', variant: 'ghost', tag: 'CLI-04' },
        {
          label: confirmLabel,
          variant: 'primary',
          onClick: () => {
            if (!chosen) {
              toast('اختر مستفيدًا من نتائج البحث أولًا', 'warning');
              return false;
            }
            confirmed = true;
            return undefined;
          },
          tag: 'CLI-05',
        },
      ],
      onClose: () => resolve(confirmed ? chosen : null),
      tag: 'CLI-06',
    });
    search(initialQuery);
  });
}

export default async function render(ctx) {
  let q = ctx.query.q || '';
  let data = await api.get('/admin/clients', { q, limit: PAGE });
  let items = data.items || [];
  let seq = 0;

  const info = h('p.pa-result-info', { 'aria-live': 'polite' });
  const host = h('div');
  const moreHost = h('div.pa-more');

  async function load({ append = false } = {}) {
    const my = ++seq;
    replaceQuery('/clients', { q });
    if (!append) mount(host, loading('جارٍ تحميل المستفيدين…'));
    try {
      const res = await api.get('/admin/clients', { q, limit: PAGE, offset: append ? items.length : 0 });
      if (my !== seq) return;
      const before = items.length;
      data = res;
      items = append ? items.concat(res.items || []) : res.items || [];
      draw();
      if (append) {
        const next = host.querySelectorAll('tbody tr')[before];
        if (next) next.focus();
      }
    } catch (err) {
      if (my !== seq) return;
      if (append) toast(err.message, 'danger');
      else mount(host, errorState(err, () => load()));
    }
  }

  const countCell = (n, tone) => (Number(n) > 0 ? badge(num(n), tone) : h('span.muted', '0'));

  function draw() {
    const total = Number(data.total) || 0;
    info.textContent = total ? `عدد المستفيدين: ${num(total)}${items.length < total ? ` — المعروض ${items.length}` : ''}` : '';
    if (!items.length) {
      mount(
        host,
        card({
          body: emptyState(q ? 'لا يوجد مستفيد/ة مطابق لهذا البحث' : 'لا يوجد مستفيدون مسجلون بعد', q ? button('مسح البحث', { icon: 'x', onClick: () => ctx.navigate('/clients'), tag: 'CLI-07' }) : null, {
            icon: 'users',
            tag: 'CLI-08',
          }),
          tag: 'CLI-09',
        }),
      );
      mount(moreHost);
      return;
    }
    mount(
      host,
      table({
        caption: 'قائمة المستفيدين',
        stack: true,
        className: 'pa-clients-table',
        onRowClick: (row) => ctx.navigate(`/clients/${row.id}`),
        columns: [
          { key: 'code', label: 'كود المستفيد/ة', render: (r) => h('a.pa-plain-link', { href: `#/clients/${r.id}`, tag: 'CLI-10' }, codeTag(r.code)), tag: 'CLI-11' },
          {
            key: 'name',
            label: 'الاسم',
            className: 'col-wide',
            render: (r) =>
              h('div', h('div.cell-title', r.name || h('span.muted', 'بدون اسم')), r.governorate && h('div.cell-sub', r.governorate)),
              tag: 'CLI-12',
          },
          { key: 'phone', label: 'الهاتف', render: (r) => (r.phone ? ltr(r.phone) : null), tag: 'CLI-13' },
          { key: 'intakes_count', label: 'الطلبات', align: 'center', render: (r) => countCell(r.intakes_count, 'neutral'), tag: 'CLI-14' },
          { key: 'cases_count', label: 'ملفات الاستشارة', align: 'center', render: (r) => countCell(r.cases_count, 'neutral'), tag: 'CLI-15' },
          { key: 'open_cases_count', label: 'ملفات مفتوحة', align: 'center', render: (r) => countCell(r.open_cases_count, 'info'), tag: 'CLI-16' },
          { key: 'matters_count', label: 'ملفات مستمرة', align: 'center', render: (r) => countCell(r.matters_count, 'accent'), tag: 'CLI-17' },
          {
            key: 'last_contact_at',
            label: 'آخر تواصل',
            render: (r) =>
              r.last_contact_at ? h('time', { datetime: r.last_contact_at, title: dateTime(r.last_contact_at) }, relative(r.last_contact_at)) : null,
              tag: 'CLI-18',
          },
        ],
        rows: items,
        rowTag: 'CLI-19',
        tag: 'CLI-20',
      }),
    );
    mount(
      moreHost,
      items.length < total &&
        button(`عرض المزيد (${total - items.length})`, {
          icon: 'chevronDown',
          onClick: (e) => {
            e.currentTarget.disabled = true;
            load({ append: true });
          },
          tag: 'CLI-21',
        }),
    );
  }

  draw();

  return h(
    'div.pa-page.pa-page-clients',
    pageHeader({
      title: 'أصحاب الطلبات', // v12 gate (V-08): كعنوان القائمة الجانبية
      subtitle: 'لكل صاحب طلب رقم مستقل، ويمكن أن تكون له عدة طلبات وملفات عبر الزمن',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard', tag: 'CLI-22' }, { label: 'أصحاب الطلبات' }],
      meta: h(
        'p.pa-principle',
        icon('link', { size: 15 }),
        h('span', 'يتعرّف النظام على صاحب الطلب من رقم هاتفه أو بريده، فيربط تلقائيًا ما يصل منه عبر واتساب أو الموقع أو غيرهما بنفس الملف.'),
      ),
      titleTag: 'CLI-23',
      tag: 'CLI-24',
    }),
    filterBar([
      searchInput({
        placeholder: 'ابحث بالاسم أو كود المستفيد/ة أو رقم الهاتف…',
        label: 'بحث في المستفيدين',
        value: q,
        onSearch: (v) => {
          q = v;
          load();
        },
        tag: 'CLI-25',
      }),
    ]),
    info,
    host,
    moreHost,
  );
}
