// الملفات المستمرة: تمثيل قضائي أو عمل قانوني مستمر نشأ من تحويل استشارة، مع الجلسات والمهام والفواتير.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, options, date, time, dateTime, relative } from '../../../lib/fmt.js';
import {
  pageHeader,
  table,
  statusBadge,
  badge,
  codeTag,
  filterBar,
  searchInput,
  statCard,
  button,
  errorState,
  loading,
  ltr,
} from '../../../lib/ui.js';
// v11 segment-staff (ST-4): «الكل · خيري · أفراد · شركات» ورقاقة النوع (الملف المستمر يتبع ملفه)
import { segmentChip, caseSegmentSwitch, caseFilterKey, caseFilterQuery, SEGMENT_TITLE } from '../../components/segment-ui.js';

const WEEK = 7 * 24 * 3600 * 1000;

export default async function render(ctx) {
  const q0 = ctx.query || {};
  const statusKeys = options('matter_status').map((o) => o.value);
  const state = {
    status: statusKeys.includes(q0.status) || q0.status === 'all' ? q0.status : 'active',
    q: q0.q || '',
    seg: caseFilterKey(q0),
  };

  let items = [];
  let seq = 0;
  const statsHost = h('div.stats-grid');
  const segHost = h('div.segmented', { role: 'group', 'aria-label': 'تصفية حسب حالة الملف المستمر' });
  const countLine = h('p.small.muted', { 'aria-live': 'polite' });
  const resultHost = h('div', loading());

  function syncUrl() {
    const qs = new URLSearchParams();
    if (state.status !== 'active') qs.set('status', state.status);
    if (state.q) qs.set('q', state.q);
    for (const [k, v] of Object.entries(caseFilterQuery(state.seg))) qs.set(k, v);
    const s = qs.toString();
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/matters${s ? `?${s}` : ''}`);
    } catch {
      /* لا شيء */
    }
  }

  async function load() {
    const my = ++seq;
    mount(resultHost, loading('جارٍ تحميل الملفات المستمرة…'));
    try {
      // review: عناصر القائمة لا تحمل company_id، فتحت «الكل» تُعرف ملفات الشركات من طلب ‎line=b2b‎ موازٍ (رقاقة «شركة» لا «أفراد»)
      const [res, b2b] = await Promise.all([
        api.get('/admin/matters', { q: state.q, ...caseFilterQuery(state.seg) }),
        state.seg ? null : api.get('/admin/matters', { q: state.q, line: 'b2b' }, { background: true }).catch(() => null),
      ]);
      if (my !== seq) return;
      items = Array.isArray(res) ? res : (res && res.items) || [];
      const companyIds = new Set((Array.isArray(b2b) ? b2b : (b2b && b2b.items) || []).map((m) => m.id));
      if (state.seg === 'company') items.forEach((m) => (m.is_company = true));
      else items.forEach((m) => (m.is_company = Boolean(m.company_id) || companyIds.has(m.id)));
      draw();
    } catch (err) {
      if (my !== seq) return;
      mount(resultHost, errorState(err, load));
    }
  }

  function setStatus(s) {
    state.status = s;
    syncUrl();
    draw();
  }

  function visible() {
    if (state.status === 'all') return items;
    if (state.status === 'active') return items.filter((m) => m.status !== 'closed');
    return items.filter((m) => m.status === state.status);
  }

  function drawStats() {
    const now = Date.now();
    const open = items.filter((m) => m.status !== 'closed');
    const soon = open.filter((m) => m.next_event_at && new Date(m.next_event_at).getTime() - now <= WEEK).length;
    const overdueTasks = open.reduce((s, m) => s + (m.overdue_tasks || 0), 0);
    const unpaid = items.reduce((s, m) => s + (m.unpaid_invoices || 0), 0);
    mount(
      statsHost,
      statCard({ label: 'ملفات مستمرة نشطة', value: open.length, icon: 'gavel', tone: 'primary', hint: 'مفتوحة أو معلّقة' }),
      statCard({ label: 'مواعيد خلال 7 أيام', value: soon, icon: 'calendar', tone: soon ? 'accent' : 'muted', hint: 'جلسات واجتماعات مجدولة' }),
      statCard({ label: 'مهام متأخرة', value: overdueTasks, icon: 'clock', tone: overdueTasks ? 'danger' : 'muted', hint: 'تجاوزت موعدها ولم تُنجز' }),
      statCard({ label: 'فواتير غير مسددة', value: unpaid, icon: 'wallet', tone: unpaid ? 'warning' : 'muted', hint: 'غير مسددة أو مسددة جزئيًا' }),
    );
  }

  function drawSegments() {
    const counts = { all: items.length, active: items.filter((m) => m.status !== 'closed').length };
    for (const m of items) counts[m.status] = (counts[m.status] || 0) + 1;
    const segs = [['active', 'النشطة'], ...options('matter_status').map((o) => [o.value, o.label]), ['all', 'الكل']];
    mount(
      segHost,
      segs.map(([key, text]) =>
        h('button.seg', { type: 'button', 'aria-pressed': String(state.status === key), onClick: () => setStatus(key) }, text, h('span.tab-count', String(counts[key] || 0))),
      ),
    );
  }

  // الحالة بجوار الكود، والمحكمة والدعوى في عمود واحد: يتسع الجدول لعرض 1366px دون أن تختفي أعمدته الأخيرة
  const columns = [
    {
      key: 'code',
      label: 'الملف',
      className: 'col-case',
      render: (m) =>
        h(
          'div.pb-case-cell',
          h(
            'div.fx-code-row',
            h('a.pb-code-link', { href: `#/matters/${m.id}`, 'aria-label': `فتح الملف ${m.code}` }, codeTag(m.code)),
            statusBadge('matter_status', m.status),
          ),
          h('div.cell-title', m.title),
          h('div.cell-sub', label('matter_kind', m.kind), m.case_code ? [' · من الاستشارة ', h('bdi.nowrap-code', { dir: 'ltr' }, m.case_code)] : null),
        ),
    },
    {
      key: 'client',
      label: 'المستفيد/ة',
      render: (m) =>
        h(
          'div',
          h('div.cell-title', m.client_name || 'بدون اسم'),
          h('div.cell-sub', segmentChip(m.segment, { company: Boolean(m.is_company) }), ' ', codeTag(m.client_code)),
        ),
    },
    { key: 'lawyer', label: 'المحامي المسؤول', render: (m) => (m.lawyer_name ? h('span', m.lawyer_name) : h('span.muted', 'لم يُحدَّد')) },
    {
      key: 'court',
      label: 'المحكمة والدعوى',
      className: 'fx-court-cell',
      render: (m) =>
        m.court || m.lawsuit_number
          ? h(
              'div',
              m.court && h('div', m.court),
              m.circuit && h('div.cell-sub', m.circuit),
              m.lawsuit_number && h('div.cell-sub.nowrap', 'الدعوى رقم ', ltr(m.lawsuit_number), m.lawsuit_year ? [' لسنة ', ltr(m.lawsuit_year)] : null),
            )
          : null,
    },
    {
      key: 'next',
      label: 'الموعد القادم',
      render: (m) =>
        m.next_event_at
          ? h('time', { datetime: m.next_event_at, title: dateTime(m.next_event_at) }, h('div.nowrap.small', date(m.next_event_at)), h('div.cell-sub.nowrap', time(m.next_event_at)), h('div.cell-sub.nowrap', relative(m.next_event_at)))
          : h('span.small.muted', 'لا مواعيد مجدولة'),
    },
    {
      key: 'tasks',
      label: 'المهام',
      align: 'center',
      render: (m) =>
        m.open_tasks || m.overdue_tasks
          ? h(
              'div.row.pb-center-row',
              m.open_tasks > 0 && badge(String(m.open_tasks), 'info', { title: 'مهام مفتوحة' }),
              m.overdue_tasks > 0 && badge(`متأخرة: ${m.overdue_tasks}`, 'danger', { icon: 'clock' }),
            )
          : null,
    },
    {
      key: 'invoices',
      label: 'غير مسدد',
      align: 'center',
      render: (m) => (m.unpaid_invoices > 0 ? badge(String(m.unpaid_invoices), 'warning', { icon: 'wallet', title: 'فواتير غير مسددة' }) : null),
    },
  ];

  function drawTable() {
    const rows = visible();
    countLine.textContent = `عدد الملفات المعروضة: ${rows.length}`;
    mount(
      resultHost,
      h(
        'section.card',
        h(
          'div.card-body.card-body-flush',
          table({
            columns,
            rows,
            stack: true,
            caption: 'جدول الملفات المستمرة',
            empty: state.q ? 'لا توجد ملفات مستمرة مطابقة للبحث' : 'لا توجد ملفات مستمرة في هذه الحالة. تُنشأ من داخل ملف الاستشارة عبر «تحويل إلى ملف مستمر».',
            onRowClick: (m) => ctx.navigate(`/matters/${m.id}`),
            rowClass: (m) => (m.status === 'closed' ? 'is-muted' : m.overdue_tasks > 0 ? 'is-highlight' : null),
          }),
        ),
      ),
    );
  }

  function draw() {
    drawStats();
    drawSegments();
    drawTable();
  }

  const header = pageHeader({
    title: 'الملفات المستمرة',
    subtitle: 'تمثيل أمام القضاء أو عمل قانوني مستمر نشأ من تحويل استشارة، مع الاحتفاظ بكل ما تم فيها: جلسات ومهام إجرائية وفواتير وتذكيرات آلية للمستفيد/ة.',
    breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'الملفات المستمرة' }],
    actions: button('ملفات الاستشارات', { icon: 'briefcase', href: '#/cases' }),
  });

  const filters = filterBar([
    searchInput({
      placeholder: 'ابحث بكود الملف أو العنوان أو رقم الدعوى أو اسم المستفيد/ة…',
      value: state.q,
      label: 'بحث في الملفات المستمرة',
      onSearch: (v) => {
        state.q = v;
        syncUrl();
        load();
      },
    }),
  ]);

  const segSwitch = caseSegmentSwitch({
    value: state.seg,
    label: SEGMENT_TITLE,
    onChange: (v) => {
      state.seg = v;
      syncUrl();
      load();
    },
  });

  load();
  return frag(header, statsHost, h('div.seg-filter', segSwitch), segHost, filters, countLine, resultHost);
}
