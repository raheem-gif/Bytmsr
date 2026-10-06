// بوابة المحامي — «إسناداتي»: مساحة العمل اليومية للمحامي.
// إسناداته فقط، والمطلوب منه في كل منها، دون أي بيانات اتصال بالعميل.
// المصطلح الموحد: «الإسناد» هو ما تكلّف به الإدارة المحاميَ في ملف؛ و«المهام» للملفات المستمرة فقط.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, date, num, money, count, weekday, cairoToday, dayLabel, time, percent, orgName, hours as hoursText } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  table,
  tabs,
  statCard,
  statusBadge,
  dueBadge,
  badge,
  codeTag,
  emptyState,
  errorState,
  alertBox,
  kv,
  button,
  icon,
} from '../../../lib/ui.js';
import { eventDateBox, matterCard, bidiText } from './matters.js';

const CRUMBS = [{ label: 'بوابة المحامي', href: '#/my' }, { label: 'إسناداتي' }];

// فلاتر بطاقات الأرقام
const FILTERS = {
  new: { label: 'جديدة لم تُفتح', test: (a) => a.status === 'assigned' },
  returned: { label: 'معادة للتعديل', test: (a) => a.status === 'returned' },
  overdue: { label: 'متأخرة', test: (a) => a.overdue },
  awaiting_review: { label: 'بانتظار مراجعة الإدارة', test: (a) => a.status === 'submitted' },
};


/** شارات التنبيه لكل إسناد. */
function flags(a, { history = false } = {}) {
  const out = [];
  if (!history) {
    if (a.status === 'assigned') out.push(badge('جديدة — لم تُفتح بعد', 'info', { icon: 'bell' }));
    if (a.status === 'returned') out.push(badge('أعادتها الإدارة بملاحظات', 'danger', { icon: 'refresh' }));
    const shared = Number(a.shared_info_requests) || 0;
    if (shared > 0) {
      // يحسبها الخادم من آخر اطلاع للمحامي على الملف (تعمل على أي جهاز)
      const fresh = Number(a.unseen_shared_info_requests) || 0;
      out.push(
        fresh > 0
          ? badge(shared > 1 ? `معلومات جديدة متاحة (${num(fresh)})` : 'معلومات جديدة متاحة', 'success', { icon: 'checkCircle' })
          : badge(`ردود متاحة لك: ${num(shared)}`, 'neutral', { icon: 'checkCircle' }),
      );
    }
    if (Number(a.open_info_requests) > 0) out.push(badge(`طلبات معلومات قيد المتابعة: ${num(a.open_info_requests)}`, 'warning', { icon: 'message' }));
    if (Number(a.open_counsel_requests) > 0) out.push(badge(`طلب مساعدة محامٍ قيد الإجراء: ${num(a.open_counsel_requests)}`, 'accent', { icon: 'users' }));
  }
  if (a.priority === 'urgent' || a.priority === 'high') out.push(statusBadge('priority', a.priority, { icon: 'flag', dot: false }));
  if (a.case_state === 'closed') out.push(badge('الملف مغلق', 'muted', { icon: 'lock' }));
  return out;
}

const assignmentHref = (a) => `#/my/assignments/${encodeURIComponent(a.id)}`;

/** بطاقة إسناد للجوال. */
function assignmentCard(a, opts) {
  const f = flags(a, opts);
  return h(
    'a.pc-item-card',
    { href: assignmentHref(a), class: a.overdue && 'is-overdue', 'aria-label': `فتح الإسناد ${a.case_code}: ${a.case_title}` },
    h('div.pc-item-head', codeTag(a.case_code), statusBadge('assignment_status', a.status)),
    h('div.pc-item-title', a.case_title),
    h(
      'div.pc-item-meta',
      h('span', icon('book', { size: 14 }), a.legal_area_label || areaLabel(a.legal_area)),
      h('span', icon('user', { size: 14 }), bidiText(a.role_label || label('assignment_role', a.role))),
    ),
    (!opts.history && a.due_at) || f.length
      ? h('div.pc-item-foot', !opts.history && a.due_at && dueBadge(a.due_at), f)
      : null,
  );
}

/** قائمة الإسنادات: جدول على الشاشات الواسعة وبطاقات على الجوال. */
function assignmentList(rows, ctx, { history = false, emptyText, emptyTitle } = {}) {
  if (!rows.length) {
    return h('div.card-body', emptyState(emptyText, null, { icon: history ? 'clock' : 'briefcase', title: emptyTitle, compact: history }));
  }
  const columns = [
    {
      key: 'case',
      label: 'الملف',
      className: 'col-wide',
      render: (a) => h('div.pc-cell-stack', codeTag(a.case_code), h('span.cell-title', a.case_title)),
    },
    { key: 'area', label: 'المجال', render: (a) => a.legal_area_label || areaLabel(a.legal_area) },
    { key: 'role', label: 'دوري', render: (a) => h('span.pc-role', bidiText(a.role_label || label('assignment_role', a.role))) },
    { key: 'status', label: 'الحالة', render: (a) => statusBadge('assignment_status', a.status) },
    history
      ? { key: 'assigned', label: 'تاريخ الإسناد', render: (a) => h('span.nowrap', date(a.assigned_at)) }
      : { key: 'due', label: 'الموعد المطلوب', render: (a) => (a.due_at ? dueBadge(a.due_at) : h('span.muted', 'بدون موعد')) },
    {
      key: 'flags',
      label: 'تنبيهات',
      render: (a) => {
        const f = flags(a, { history });
        return f.length ? h('div.pc-flags', f) : h('span.muted', '—');
      },
    },
  ];
  return frag(
    h(
      'div.pc-only-desktop',
      table({
        columns,
        rows,
        onRowClick: (a) => ctx.navigate(`/my/assignments/${a.id}`),
        rowClass: (a) => (a.overdue ? 'pc-row-overdue' : a.status === 'assigned' ? 'pc-row-new' : null),
        caption: history ? 'الإسنادات السابقة' : 'الإسنادات الحالية',
      }),
    ),
    h('ul.pc-card-list.pc-only-mobile', rows.map((a) => h('li', assignmentCard(a, { history })))),
  );
}

function metricsCard(m) {
  const hours = m.avg_response_hours;
  return card({
    title: 'مؤشرات أدائي',
    subtitle: 'تُحسب من سجل عملك على المنصة',
    icon: 'chart',
    body: kv([
      ['متوسط زمن تقديم الرأي', hours == null ? h('span.muted', 'لا توجد بيانات بعد') : `${hoursText(hours)} من الإسناد`],
      ['إسنادات معتمدة هذا الشهر', num(m.completed_in_period)],
      ['إجمالي الإسنادات المعتمدة', num(m.completed_total)],
      m.avg_quality != null && ['متوسط تقييم الجودة', `${num(m.avg_quality)} من 5`],
      m.returned_rate != null && ['نسبة الإعادة للتعديل', percent(m.returned_rate)],
      ['مساهمات تطوعية', `${num(m.pro_bono_in_period)} هذا الشهر — ${num(m.pro_bono_total)} إجمالًا`],
      Number(m.unpaid_balance) > 0 && ['مستحقات لم تُصرف بعد', h('a', { href: '#/my/statement' }, money(m.unpaid_balance))],
    ]),
  });
}

function eventsCard(events) {
  return card({
    title: 'الجلسات والمواعيد القادمة',
    icon: 'calendar',
    body: events.length
      ? h(
          'ul.list-plain',
          events.map((e) =>
            h(
              'li',
              h(
                'a.event-item.pc-event-link',
                { href: `#/my/matters/${encodeURIComponent(e.matter_id)}`, 'aria-label': `${e.title} — ${dayLabel(e.starts_at)} ${time(e.starts_at)}` },
                eventDateBox(e.starts_at),
                h(
                  'div.event-info',
                  h('div.event-title', e.title || label('event_kind', e.kind)),
                  h(
                    'div.event-meta',
                    h('span', icon('clock', { size: 14 }), `${weekday(e.starts_at)}، ${time(e.starts_at)}`),
                    e.location && h('span', icon('mapPin', { size: 14 }), e.location),
                    h('span', codeTag(e.matter_code)),
                  ),
                ),
              ),
            ),
          ),
        )
      : emptyState('لا توجد جلسات أو مواعيد قادمة مسجلة في ملفاتك المستمرة', null, { compact: true, icon: 'calendar' }),
  });
}

function mattersCard(matters) {
  return card({
    title: 'ملفاتي المستمرة',
    icon: 'gavel',
    actions: matters.length ? button('عرض الكل', { variant: 'link', size: 'sm', href: '#/my/matters' }) : null,
    body: matters.length
      ? h('ul.list-plain', matters.slice(0, 5).map((m) => h('li', matterCard(m, { compact: true }))))
      : emptyState('لا توجد ملفات تمثيل قضائي أو عمل مستمر مسندة إليك حاليًا', null, { compact: true, icon: 'gavel' }),
  });
}

export default async function render(ctx) {
  const firstName = String(ctx.user?.name || '').trim();
  let data;
  try {
    data = await api.get('/lawyer/dashboard');
  } catch (err) {
    return frag(pageHeader({ title: 'إسناداتي', breadcrumbs: CRUMBS }), card({ body: errorState(err, () => ctx.reload()) }));
  }
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const counts = data.counts || {};
  const matters = Array.isArray(data.matters) ? data.matters : [];
  const events = Array.isArray(data.upcoming_events) ? data.upcoming_events : [];
  const metrics = data.metrics || {};

  const today = cairoToday();
  const header = pageHeader({
    title: firstName ? `مرحبًا، ${firstName}` : 'مرحبًا بك',
    subtitle: `هذه مساحة عملك: الإسنادات التي كلّفتك بها ${orgName()}، والمطلوب منك في كل منها.`,
    breadcrumbs: CRUMBS,
    meta: h('span.pc-today', icon('calendar', { size: 15 }), h('time', { datetime: today }, `${weekday(new Date())}، ${date(new Date())}`)),
  });

  // ── بطاقات الأرقام (تعمل كفلاتر) ──
  let filter = FILTERS[ctx.query.filter] ? ctx.query.filter : null;
  const statDefs = [
    { key: 'new', label: 'جديدة لم تُفتح', icon: 'bell', tone: 'info', hint: 'افتحها ليبدأ احتساب العمل' },
    { key: 'returned', label: 'معادة للتعديل', icon: 'refresh', tone: 'danger', hint: 'بملاحظات من الإدارة' },
    { key: 'overdue', label: 'متأخرة', icon: 'clock', tone: 'warning', hint: 'تجاوزت الموعد المطلوب' },
    { key: 'awaiting_review', label: 'بانتظار مراجعة الإدارة', icon: 'queue', tone: 'primary', hint: 'قدّمت رأيك فيها' },
  ];
  const statButtons = statDefs.map((s) => {
    const btn = statCard({
      label: s.label,
      value: num(counts[s.key] || 0),
      hint: s.hint,
      icon: s.icon,
      tone: s.tone,
      onClick: () => setFilter(filter === s.key ? null : s.key),
    });
    btn.dataset.key = s.key;
    btn.classList.add('pc-stat');
    if ((counts[s.key] || 0) > 0 && (s.key === 'overdue' || s.key === 'returned')) btn.classList.add('pc-stat-alert');
    return btn;
  });
  const stats = h('div.stats-grid.pc-stats', { role: 'group', 'aria-label': 'ملخص الإسنادات — اضغط على أي بطاقة لتصفية القائمة' }, statButtons);

  // ── قائمة الإسنادات النشطة ──
  const activeHost = h('div');
  const filterNote = h('div.pc-filter-note', { hidden: true, role: 'status' });

  function drawActive() {
    statButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === filter)));
    const rows = filter ? assignments.filter(FILTERS[filter].test) : assignments;
    if (filter) {
      mount(
        filterNote,
        icon('filter', { size: 16 }),
        h('span', `معروض: ${FILTERS[filter].label} (${num(rows.length)} من ${num(assignments.length)})`),
        button('عرض الكل', { variant: 'link', size: 'sm', onClick: () => setFilter(null) }),
      );
      filterNote.hidden = false;
    } else filterNote.hidden = true;
    mount(
      activeHost,
      assignmentList(rows, ctx, {
        emptyTitle: filter ? 'لا توجد إسنادات مطابقة' : 'لا توجد إسنادات حالية',
        emptyText: filter
          ? 'لا توجد إسنادات في هذه الفئة الآن.'
          : 'سيصلك إشعار عند إسناد ملف جديد إليك من الإدارة، وسيظهر هنا مع المطلوب منك تحديدًا.',
      }),
    );
  }
  function setFilter(f) {
    filter = f;
    drawActive();
  }
  drawActive();

  const listTabs = tabs(
    [
      {
        key: 'active',
        label: 'الإسنادات الحالية',
        icon: 'briefcase',
        count: assignments.length,
        render: () => frag(h('div.pc-tab-pad', filterNote), activeHost),
      },
      {
        key: 'history',
        label: 'الإسنادات السابقة',
        icon: 'clock',
        render: async () => {
          const rows = await api.get('/lawyer/assignments', { scope: 'history' });
          const list = Array.isArray(rows) ? rows : [];
          listTabs.setCount('history', list.length);
          return assignmentList(list, ctx, {
            history: true,
            emptyText: 'لا توجد إسنادات سابقة في سجلك بعد. تظهر هنا الإسنادات التي اعتمدتها الإدارة أو أغلقت ملفاتها.',
          });
        },
      },
    ],
    { className: 'pc-list-tabs' },
  );

  const mainCard = card({
    title: 'إسناداتي',
    subtitle: 'اضغط على أي إسناد لفتح مساحة العمل الخاصة به',
    icon: 'briefcase',
    flush: true,
    body: listTabs,
    footer: h(
      'p.pc-note.pc-note-flush',
      icon('shield', { size: 15 }),
      h('span', 'ترى في كل إسناد ما أتاحته لك الإدارة من الملف فقط. لا تتواصل مع المستفيد/ة مباشرة؛ اطلب أي معلومة أو مستند من داخل الإسناد وستتولى الإدارة التواصل.'),
    ),
  });

  const urgent = [];
  if (counts.returned > 0) {
    urgent.push(
      alertBox(
        `لديك ${count(counts.returned, ['إسناد معاد', 'إسنادان معادان', 'إسنادات معادة', 'إسنادًا معادًا'])} للتعديل بملاحظات من الإدارة.`,
        'danger',
        { icon: 'refresh' },
      ),
    );
  }
  if (counts.overdue > 0) {
    urgent.push(
      alertBox(
        `لديك ${count(counts.overdue, ['إسناد متأخر', 'إسنادان متأخران', 'إسنادات متأخرة', 'إسنادًا متأخرًا'])} عن الموعد المطلوب. إن احتجت مهلة إضافية أو معلومات ناقصة فاطلبها من داخل الإسناد.`,
        'warning',
        { icon: 'clock' },
      ),
    );
  }

  return frag(
    header,
    stats,
    urgent.length ? h('div.stack-sm', urgent) : null,
    mainCard,
    h('div.grid-3.pc-home-side', eventsCard(events), mattersCard(matters), metricsCard(metrics)),
  );
}

