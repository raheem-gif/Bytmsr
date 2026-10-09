// ملفات الاستشارات: كل ملف نشأ من فرز طلب وارد. تبويبات الحالة، فلاتر، بحث، ومؤشرات ما يحتاج قرار الإدارة.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, relative, dateTime, count } from '../../../lib/fmt.js';
import {
  pageHeader,
  table,
  statusBadge,
  badge,
  codeTag,
  filterBar,
  searchInput,
  selectInput,
  statCard,
  button,
  chips,
  errorState,
  loading,
  alertBox,
} from '../../../lib/ui.js';
// v11 segment-staff (ST-4): «الكل · خيري · أفراد · شركات» ورقاقة النوع على كل ملف
import { segmentChip, caseSegmentSwitch, caseFilterKey, caseFilterQuery, SEGMENT_TITLE } from '../../components/segment-ui.js';

const LIMIT = 500;
const FLAGS = {
  action: { label: 'بحاجة إلى قرار الإدارة', test: (r) => r.pending_actions > 0 },
  overdue: { label: 'بها إسنادات متأخرة', test: (r) => r.overdue_assignments > 0 },
  unread: { label: 'بها رسائل غير مقروءة من المستفيد/ة', test: (r) => r.unread_count > 0 },
};

export default async function render(ctx) {
  const q0 = ctx.query || {};
  const statusKeys = options('case_status').map((o) => o.value);
  const state = {
    status: q0.status === 'all' || statusKeys.includes(q0.status) ? q0.status : 'open',
    area: q0.area || '',
    priority: q0.priority || '',
    q: q0.q || '',
    manager_id: q0.manager_id || '',
    lawyer_id: q0.lawyer_id || '',
    flag: FLAGS[q0.flag] ? q0.flag : '',
    line: q0.line === 'b2c' || q0.line === 'b2b' ? q0.line : '', // v10 b2b-staff (STF-10): «الأفراد · الشركات»
    seg: caseFilterKey(q0), // v11 segment-staff: '' | charity | paid | company
  };
  // v11: المفتاح يحدد معاملات القائمة — خيري = segment=charity؛ أفراد = segment=paid&line=b2c؛ شركات = line=b2b
  function applySeg() {
    const q = caseFilterQuery(state.seg);
    state.segment = q.segment || '';
    if (state.seg) state.line = q.line || '';
  }
  applySeg();

  // قوائم الفلاتر المساعدة: فشلها لا يمنع عرض الصفحة
  const [staff, lawyers] = await Promise.all([
    api.get('/admin/staff').catch(() => []),
    api.get('/admin/lawyers').then((r) => (r && r.items) || []).catch(() => []),
  ]);

  let items = [];
  let total = 0;
  let seq = 0;

  const statsHost = h('div.stats-grid.pb-stats');
  const segHost = h('div.segmented.pb-seg', { role: 'group', 'aria-label': 'تصفية حسب حالة الملف' });
  const flagHost = h('div');
  const resultHost = h('div', loading());
  const countLine = h('p.small.muted', { 'aria-live': 'polite' });

  function syncUrl() {
    const qs = new URLSearchParams();
    if (state.status !== 'open') qs.set('status', state.status);
    for (const k of ['segment', 'area', 'priority', 'q', 'manager_id', 'lawyer_id', 'flag', 'line']) if (state[k]) qs.set(k, state[k]);
    const s = qs.toString();
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/cases${s ? `?${s}` : ''}`);
    } catch {
      /* تجاهل: المتصفح قد يمنع replaceState في سياقات خاصة */
    }
  }

  async function load() {
    const my = ++seq;
    mount(resultHost, loading('جارٍ تحميل الملفات…'));
    try {
      const res = await api.get('/admin/cases', {
        area: state.area,
        priority: state.priority,
        q: state.q,
        manager_id: state.manager_id,
        lawyer_id: state.lawyer_id,
        line: state.line || undefined, // v10 b2b-staff
        segment: state.segment || undefined, // v11 segment-staff
        limit: LIMIT,
      });
      if (my !== seq) return;
      items = (res && res.items) || [];
      total = (res && res.total) || items.length;
      draw();
    } catch (err) {
      if (my !== seq) return;
      mount(statsHost);
      mount(resultHost, errorState(err, load));
    }
  }

  function setStatus(s) {
    state.status = s;
    syncUrl();
    draw();
  }

  function setFlag(f) {
    state.flag = state.flag === f ? '' : f;
    syncUrl();
    draw();
  }

  function visibleRows() {
    let rows = items;
    if (state.status === 'open') rows = rows.filter((r) => r.status !== 'closed');
    else if (state.status !== 'all') rows = rows.filter((r) => r.status === state.status);
    if (state.flag) rows = rows.filter(FLAGS[state.flag].test);
    return rows;
  }

  function drawStats() {
    const open = items.filter((r) => r.status !== 'closed');
    const action = open.filter(FLAGS.action.test).length;
    const overdue = open.filter(FLAGS.overdue.test).length;
    const unread = items.filter(FLAGS.unread.test).length;
    mount(
      statsHost,
      statCard({ label: 'ملفات مفتوحة', value: open.length, icon: 'briefcase', tone: 'primary', hint: 'كل ما لم تغلقه الإدارة بعد', onClick: () => setStatus('open') }),
      statCard({ label: 'بحاجة إلى قرار الإدارة', value: action, icon: 'queue', tone: 'warning', hint: 'آراء أو طلبات بانتظار البت', onClick: () => setFlag('action') }),
      statCard({ label: 'ملفات بها إسنادات متأخرة', value: overdue, icon: 'clock', tone: overdue ? 'danger' : 'muted', hint: 'تجاوز المحامي المدة المطلوبة', onClick: () => setFlag('overdue') }),
      statCard({ label: 'رسائل جديدة من المستفيدين', value: unread, icon: 'message', tone: 'info', hint: 'لم تُقرأ بعد في المحادثة', onClick: () => setFlag('unread') }),
    );
  }

  function drawSegments() {
    const counts = { open: items.filter((r) => r.status !== 'closed').length, all: items.length };
    for (const r of items) counts[r.status] = (counts[r.status] || 0) + 1;
    const segs = [
      ['open', 'الكل المفتوح'],
      ...options('case_status').map((o) => [o.value, o.label]),
      ['all', 'كل الملفات'],
    ];
    mount(
      segHost,
      segs.map(([key, text]) =>
        h(
          'button.seg',
          { type: 'button', 'aria-pressed': String(state.status === key), onClick: () => setStatus(key) },
          text,
          h('span.tab-count', String(counts[key] || 0)),
        ),
      ),
    );
  }

  function drawFlag() {
    if (!state.flag) {
      mount(flagHost);
      return;
    }
    mount(
      flagHost,
      h(
        'div.row.pb-active-flag',
        h('span.small.muted', 'تصفية إضافية:'),
        chips([{ label: FLAGS[state.flag].label, value: state.flag, tone: 'accent' }], { onRemove: () => setFlag(state.flag) }),
      ),
    );
  }

  const columns = [
    {
      key: 'code',
      label: 'الملف',
      className: 'col-wide',
      render: (r) =>
        h(
          'div.pb-case-cell',
          h('a.pb-code-link', { href: `#/cases/${r.id}`, 'aria-label': `فتح الملف ${r.code}` }, codeTag(r.code)),
          h('div.cell-title', r.title),
          r.manager_name && h('div.cell-sub', `مدير الحالة: ${r.manager_name}`),
        ),
    },
    {
      key: 'client',
      label: 'المستفيد/ة',
      // v10 b2b-staff (STF-10): ملف عمل لطلب شركة — شارة «شركة» واسم الشركة بدل المستفيد/ة
      // v11 segment-staff (L11-16): رقاقة «شركة» الخضراء بمبنى بدل شارة v10 الرمادية، و«خيري»/«أفراد» لملفات الأفراد
      render: (r) =>
        r.company_id
          ? h('div', h('div.cell-title', segmentChip('paid', { company: true }), ' ', r.company_name || ''), h('div.cell-sub', 'ملف عمل لطلب شركة'))
          : h('div', h('div.cell-title', r.client_name || 'بدون اسم'), h('div.cell-sub', segmentChip(r.segment), ' ', codeTag(r.client_code))),
    },
    { key: 'area', label: 'المجال', render: (r) => areaLabel(r.legal_area) },
    {
      key: 'status',
      label: 'الحالة',
      render: (r) =>
        h(
          'div.stack-sm.pb-status-cell',
          statusBadge('case_status', r.status),
          r.status === 'closed' && r.outcome && h('span.cell-sub', label('case_outcome', r.outcome)),
        ),
    },
    { key: 'priority', label: 'الأولوية', render: (r) => statusBadge('priority', r.priority) },
    {
      key: 'lead',
      label: 'المحامي الأساسي',
      render: (r) =>
        h(
          'div',
          r.lead_name ? h('div.nowrap', r.lead_name) : h('div.muted', 'لم يُسند بعد'),
          r.team_size > 0 && h('div.cell-sub', `الفريق: ${count(r.team_size, ['محامٍ واحد', 'محاميان', 'محامين', 'محاميًا'])}`),
        ),
    },
    {
      key: 'alerts',
      label: 'يحتاج انتباهًا',
      render: (r) => {
        const items = [
          r.pending_actions > 0 && badge(`بانتظار قرار الإدارة: ${r.pending_actions}`, 'warning', { icon: 'queue' }),
          r.overdue_assignments > 0 && badge(`إسنادات متأخرة: ${r.overdue_assignments}`, 'danger', { icon: 'clock' }),
          r.unread_count > 0 && badge(`رسائل جديدة: ${r.unread_count}`, 'info', { icon: 'message' }),
        ].filter(Boolean);
        return items.length ? h('div.pb-alerts-cell', items) : null;
      },
    },
    {
      key: 'created',
      label: 'أُنشئ',
      // عمود ثانوي: يختفي تحت 1440px (الترتيب الافتراضي بالأحدث يغني عنه) حتى لا يُدفع الجدول إلى التمرير
      className: 'col-hide-lg',
      render: (r) => h('time.nowrap.small', { datetime: r.created_at, title: dateTime(r.created_at) }, relative(r.created_at)),
    },
  ];

  function drawTable() {
    const rows = visibleRows();
    const truncated = total > items.length;
    countLine.textContent = `عدد الملفات المعروضة: ${rows.length}${truncated ? ` (من أحدث ${count(items.length, 'case')} من إجمالي ${total})` : ''}`;
    const empty = state.q || state.area || state.priority || state.manager_id || state.lawyer_id || state.flag
      ? 'لا توجد ملفات مطابقة لعوامل التصفية الحالية'
      : state.status === 'open'
        ? 'لا توجد ملفات مفتوحة حاليًا'
        : 'لا توجد ملفات في هذه الحالة';
    mount(
      resultHost,
      truncated &&
        alertBox('يُعرض أحدث 500 ملف فقط. استخدم البحث أو الفلاتر لتضييق النتائج.', 'info'),
      h(
        'section.card',
        h(
          'div.card-body.card-body-flush',
          table({
            columns,
            rows,
            empty,
            stack: true,
            caption: 'جدول ملفات الاستشارات',
            onRowClick: (r) => ctx.navigate(`/cases/${r.id}`),
            rowClass: (r) => (r.status === 'closed' ? 'is-muted' : r.priority === 'urgent' ? 'is-highlight' : null),
          }),
        ),
      ),
    );
  }

  function draw() {
    drawStats();
    drawSegments();
    drawFlag();
    drawTable();
  }

  const onFilter = (key) => (value) => {
    state[key] = value || '';
    syncUrl();
    load();
  };

  const managerOptions = staff.map((s) => ({ value: s.id, label: `${s.name} (${label('user_role', s.role)})` }));
  const lawyerOptions = lawyers.map((l) => ({ value: l.id, label: l.display_name || l.name }));

  const resetBtn = button('مسح الفلاتر', {
    variant: 'ghost',
    icon: 'x',
    onClick: () => {
      ctx.navigate('/cases');
    },
  });

  const filters = filterBar([
    searchInput({ placeholder: 'ابحث بكود الملف أو العنوان أو اسم المستفيد/ة أو كوده…', value: state.q, onSearch: onFilter('q'), label: 'بحث في الملفات' }),
    selectInput({ options: areaOptions(), value: state.area, onChange: onFilter('area'), label: 'المجال القانوني', allLabel: 'كل المجالات' }),
    selectInput({ options: options('priority'), value: state.priority, onChange: onFilter('priority'), label: 'الأولوية', allLabel: 'كل الأولويات' }),
    managerOptions.length > 0 &&
      selectInput({ options: managerOptions, value: state.manager_id, onChange: onFilter('manager_id'), label: 'مدير الحالة', allLabel: 'كل مديري الحالات' }),
    lawyerOptions.length > 0 &&
      selectInput({ options: lawyerOptions, value: state.lawyer_id, onChange: onFilter('lawyer_id'), label: 'المحامي في الفريق', allLabel: 'كل المحامين' }),
    resetBtn,
  ]);

  const header = pageHeader({
    title: 'ملفات الاستشارات',
    subtitle: 'الرسالة لا تصبح ملفًا تلقائيًا: كل ملف هنا قررت الإدارة تحويله من صندوق الوارد بعد الفرز، وله كود ثابت وفريق وصلاحيات محددة.',
    breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'ملفات الاستشارات' }],
    actions: [
      button('بانتظار قرار الإدارة', { icon: 'queue', href: '#/queue' }),
      button('صندوق الوارد', { icon: 'inbox', variant: 'primary', href: '#/inbox' }),
    ],
  });

  // v11 segment-staff (ST-4): بدل قائمة v10 «الأفراد · الشركات»
  const segSwitch = caseSegmentSwitch({
    value: state.seg,
    label: SEGMENT_TITLE,
    onChange: (v) => {
      state.seg = v;
      state.line = '';
      applySeg();
      syncUrl();
      load();
    },
  });

  load();
  return frag(header, statsHost, h('div.seg-filter', segSwitch), h('div.pb-seg-wrap', segHost), filters, flagHost, countLine, resultHost);
}
