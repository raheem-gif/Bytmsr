// الملف المستمر للإدارة: بيانات الدعوى، الجلسات والمواعيد (مع تذكير العميل آليًا)، المهام الإجرائية،
// الفواتير والمدفوعات، المصروفات، أتعاب المحامي، المستندات، الرسائل، والسجل.

import { h, frag } from '../../../lib/h.js';
import { api, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, options, money, date, dateTime, relative, calendarParts, weekday, time, cairoToday } from '../../../lib/fmt.js';
import {
  icon,
  button,
  asyncButton,
  badge,
  statusBadge,
  dueBadge,
  toast,
  table,
  tabs,
  card,
  kv,
  emptyState,
  alertBox,
  pageHeader,
  copyButton,
  codeTag,
  ltr,
  statCard,
  progressBar,
} from '../../../lib/ui.js';
import { formModal, confirmAction, CHANNEL_OPTIONS, messageThread, messageComposer, activityTimeline, uploadPanel, textBlock } from './case-detail.js';
import { docAnalysisStore, docAiBadge, docAiAction, docAiResultsCard } from './case-detail.js'; // v9 ai: تحليل المستندات
import { printButton } from '../../components/print-button.js';
import { sendDocumentButton } from '../../components/send-document.js'; // v9 messaging
import { partiesCard } from '../../components/parties.js'; // v9 practice
import { outcomeCard } from '../../components/outcome.js'; // v9 practice

const TAB_KEYS = ['events', 'tasks', 'invoices', 'expenses', 'fees', 'documents', 'messages', 'activity'];

function inline(...children) {
  return h('span.pb-inline', children);
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const isAdmin = ctx.user && ctx.user.role === 'admin';
  const [d, staff] = await Promise.all([api.get(`/admin/matters/${encodeURIComponent(id)}`), api.get('/admin/staff').catch(() => [])]);
  const m = d.matter;
  const closed = m.status === 'closed';
  ctx.setTitle(`${m.code} — ملف مستمر`);

  const events = d.events || [];
  const tasks = d.tasks || [];
  const invoices = d.invoices || [];
  const payments = d.payments || [];
  const expenses = d.expenses || [];
  const fees = d.lawyer_fees || [];
  const documents = d.documents || [];
  const messages = [...(d.messages || [])].sort((a, b) => a.id - b.id);
  const now = Date.now();
  let tabsEl = null;

  // ── التبويبات والتحديث ──
  function syncTab(key) {
    const qs = key && key !== 'events' ? `?tab=${key}` : '';
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/matters/${id}${qs}`);
    } catch {
      /* لا شيء */
    }
  }
  function goTab(key) {
    if (!tabsEl) return;
    tabsEl.setActive(key);
    syncTab(key);
    tabsEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function refresh(msg, { tab } = {}) {
    if (msg) toast(msg, 'success');
    if (tab) syncTab(tab);
    ctx.refreshShell();
    await ctx.reload();
  }
  async function activeLawyers() {
    const res = await api.get('/admin/lawyers', { active: 'true' });
    // من لم يفعّل حسابه من رابط الدعوة بعد لا يصلح محاميًا مسؤولًا (يرفضه الخادم كذلك)
    return ((res && res.items) || []).filter((l) => !l.invite_pending).map((l) => ({ value: l.id, label: l.display_name || l.name }));
  }

  // ───────────────────────── الترويسة والملخص ─────────────────────────

  const header = pageHeader({
    title: m.title,
    breadcrumbs: [{ label: 'الملفات المستمرة', href: '#/matters' }, { label: m.code }],
    meta: [codeTag(m.code, { className: 'pb-code-lg' }), statusBadge('matter_status', m.status), statusBadge('matter_kind', m.kind)],
    actions: [
      d.case && button('الاستشارة الأصلية', { icon: 'briefcase', href: `#/cases/${d.case.id}` }),
      button('رسالة للمستفيد/ة', { icon: 'message', onClick: () => goTab('messages') }),
      asyncButton(
        'تعديل بيانات الملف',
        async () => {
          const lawyers = await activeLawyers();
          openEditDialog(lawyers);
        },
        { icon: 'edit', variant: 'primary' },
      ),
    ],
  });

  const nextEvent = events
    .filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  const openTasks = tasks.filter((t) => t.status === 'open');
  const overdueTasks = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const totals = d.totals || { invoiced: 0, paid: 0, expenses: 0 };
  const balance = Math.max(0, Math.round(((totals.invoiced || 0) - (totals.paid || 0)) * 100) / 100);

  const stats = h(
    'div.stats-grid',
    statCard({
      label: 'الموعد القادم',
      value: nextEvent ? date(nextEvent.starts_at) : '—',
      hint: nextEvent ? `${label('event_kind', nextEvent.kind)} · ${relative(nextEvent.starts_at)}` : 'لا مواعيد مجدولة',
      icon: 'calendar',
      tone: nextEvent ? 'accent' : 'muted',
      onClick: () => goTab('events'),
    }),
    statCard({
      label: 'مهام مفتوحة',
      value: openTasks.length,
      hint: overdueTasks.length ? `متأخرة: ${overdueTasks.length}` : 'لا مهام متأخرة',
      icon: 'check',
      tone: overdueTasks.length ? 'danger' : 'info',
      onClick: () => goTab('tasks'),
    }),
    statCard({
      label: 'المتبقي على المستفيد/ة',
      value: money(balance),
      hint: `فُوتر ${money(totals.invoiced)} · حُصّل ${money(totals.paid)}`,
      icon: 'wallet',
      tone: balance > 0 ? 'warning' : 'success',
      onClick: () => goTab('invoices'),
    }),
    statCard({ label: 'المصروفات', value: money(totals.expenses), hint: 'كل ما سُجل على الملف', icon: 'fileText', tone: 'neutral', onClick: () => goTab('expenses') }),
  );

  // «رقم 1874 لسنة 2026» كما تُكتب أرقام الدعاوى في مصر (وكما تعرضها بوابة المحامي)
  const lawsuit = m.lawsuit_number ? h('span', 'رقم ', ltr(m.lawsuit_number), m.lawsuit_year ? [' لسنة ', ltr(m.lawsuit_year)] : null) : null;
  const summary = h(
    'div.grid-2.pb-summary',
    card({
      title: 'بيانات الدعوى',
      icon: 'gavel',
      body: h(
        'div.stack',
        kv([
          ['نوع الملف', label('matter_kind', m.kind)],
          ['المحكمة', m.court],
          ['الدائرة', m.circuit],
          ['الدعوى', lawsuit],
          ['الخصم', m.opponent],
          ['الأتعاب المتفق عليها مع المستفيد/ة', m.agreed_fee != null ? money(m.agreed_fee) : null],
          ['تاريخ الفتح', date(m.opened_at)],
          m.closed_at && ['تاريخ الإغلاق', date(m.closed_at)],
        ]),
        textBlock('ملاحظات وتكليف المحامي', m.notes, { iconName: 'fileText' }),
      ),
    }),
    card({
      title: 'المستفيد/ة والمحامي المسؤول',
      icon: 'users',
      body: h(
        'div.stack',
        kv([
          ['المستفيد/ة', d.client ? inline(h('a', { href: `#/clients/${d.client.id}` }, d.client.name || 'بدون اسم'), codeTag(d.client.code)) : null],
          ['الهاتف (للإدارة فقط)', d.client && d.client.phone ? inline(ltr(d.client.phone), copyButton(d.client.phone, '')) : null],
          ['المحامي المسؤول', d.responsible_lawyer ? h('a', { href: `#/lawyers/${d.responsible_lawyer.id}` }, d.responsible_lawyer.name) : h('span.muted', 'لم يُحدَّد بعد')],
          [
            'الاستشارة الأصلية',
            d.case
              ? h('span.stack-sm', inline(h('a.pb-code-link', { href: `#/cases/${d.case.id}` }, codeTag(d.case.code)), statusBadge('case_status', d.case.status)), h('span.cell-sub', d.case.title))
              : null,
          ],
        ]),
        h('p.small.muted.pb-note', icon('lock', { size: 14 }), h('span', 'يرى المحامي المسؤول بيانات الدعوى والجلسات والمهام والمستندات فقط — دون بيانات تواصل المستفيد/ة أو الفواتير.')),
      ),
    }),
  );

  // ───────────────────────── الجلسات والمواعيد ─────────────────────────

  const eventFields = (forEdit) => [
    !forEdit && { name: 'kind', label: 'نوع الموعد', type: 'select', required: true, placeholder: false, options: options('event_kind') },
    { name: 'title', label: 'العنوان', type: 'text', required: forEdit, maxLength: 200, placeholder: 'مثال: الجلسة الثانية — تقديم حافظة المستندات' },
    { name: 'starts_at', label: 'التاريخ والوقت', type: 'datetime', required: true },
    { name: 'location', label: 'المكان', type: 'text', maxLength: 200 },
    forEdit && { name: 'status', label: 'الحالة', type: 'select', required: true, placeholder: false, options: options('event_status') },
    {
      name: 'client_attendance_required',
      type: 'checkbox',
      text: 'يلزم حضور المستفيد/ة شخصيًا',
      hint: 'سيرسل النظام تذكيرًا آليًا للمستفيد/ة عبر واتساب قبل الموعد.',
      full: true,
    },
    // v9.1 b-portal (B91-13): ما تحضره معها، يظهر لها في صفحة المتابعة (الافتراضي: بطاقتك الشخصية وأي ورق يخص القضية)
    { name: 'client_note', label: 'هاتي معاكي (للمستفيد/ة، بند في كل سطر)', type: 'textarea', rows: 2, maxLength: 400, placeholder: 'بطاقتك الشخصية\nشهادات ميلاد الأولاد', hint: 'اختياري. ويمكن كتابة «المحامي هيقابلك عند…». لا تكتب اسم المحامي.' },
    forEdit && { name: 'outcome', label: 'ما تم في الجلسة / القرار', type: 'textarea', rows: 3, maxLength: 5000 },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, maxLength: 3000 },
  ];

  async function openAddEvent() {
    const res = await formModal({
      title: 'إضافة جلسة أو موعد',
      fields: eventFields(false),
      values: { kind: 'hearing', location: [m.court, m.circuit].filter(Boolean).join(' — ') },
      submitLabel: 'إضافة الموعد',
      submitIcon: 'plus',
      onSubmit: (v) =>
        api.post(`/admin/matters/${id}/events`, {
          kind: v.kind,
          title: v.title || null,
          starts_at: v.starts_at,
          location: v.location || null,
          client_attendance_required: Boolean(v.client_attendance_required),
          client_note: v.client_note || null, // v9.1 b-portal
          notes: v.notes || null,
        }),
    });
    if (res) await refresh(res.client_attendance_required ? 'أُضيف الموعد، وسيُذكَّر المستفيد/ة آليًا قبله' : 'أُضيف الموعد', { tab: 'events' });
  }

  async function openEditEvent(e) {
    const res = await formModal({
      title: `تعديل ${label('event_kind', e.kind)}`,
      intro: e.reminder_pending_approval
        ? 'أضاف المحامي هذا الموعد أو عدّله ولم يُعتمد تذكير المستفيد/ة بعد. حفظ التعديل يعتمد التذكير، فراجع العنوان والمكان كما سيصلان للمستفيد/ة.'
        : null,
      fields: eventFields(true),
      values: { ...e, client_attendance_required: Boolean(e.client_attendance_required) },
      onSubmit: (v) =>
        api.patch(`/admin/matter-events/${e.id}`, {
          title: v.title,
          starts_at: v.starts_at,
          location: v.location || null,
          status: v.status,
          client_attendance_required: Boolean(v.client_attendance_required),
          client_note: v.client_note || null, // v9.1 b-portal
          outcome: v.outcome || null,
          notes: v.notes || null,
        }),
    });
    if (res) await refresh('تم تحديث الموعد', { tab: 'events' });
  }

  async function openRecordOutcome(e) {
    const res = await formModal({
      title: `تسجيل ما تم — ${e.title}`,
      intro: 'سجّل نتيجة الموعد. إن تأجلت الجلسة أضف موعدها التالي ليُجدول تلقائيًا بنفس المكان وإعداد حضور المستفيد/ة.',
      fields: [
        { name: 'status', label: 'الحالة', type: 'select', required: true, placeholder: false, options: options('event_status').filter((o) => o.value !== 'scheduled') },
        { name: 'next_starts_at', label: 'موعد الجلسة التالية (اختياري)', type: 'datetime' },
        { name: 'outcome', label: 'ما تم في الجلسة / القرار', type: 'textarea', required: true, rows: 4, maxLength: 5000 },
      ],
      values: { status: 'done' },
      submitLabel: 'حفظ',
      submitIcon: 'check',
      onSubmit: async (v) => {
        const updated = await api.patch(`/admin/matter-events/${e.id}`, { status: v.status, outcome: v.outcome });
        if (v.next_starts_at) {
          await api.post(`/admin/matters/${id}/events`, {
            kind: e.kind,
            title: `${label('event_kind', e.kind)} — الموعد التالي`,
            starts_at: v.next_starts_at,
            location: e.location || null,
            client_attendance_required: Boolean(e.client_attendance_required),
          });
        }
        return { updated, scheduledNext: Boolean(v.next_starts_at) };
      },
    });
    if (res) await refresh(res.scheduledNext ? 'سُجل ما تم وجُدول الموعد التالي' : 'سُجل ما تم في الموعد', { tab: 'events' });
  }

  // نص المحامي لا يصل للعميل قبل مراجعة الإدارة: تذكير الموعد ينتظر الاعتماد
  async function approveReminder(e) {
    const ok = await confirmAction({
      title: 'اعتماد تذكير المستفيد/ة',
      message: `سيُرسل للمستفيد/ة تذكير آلي قبل الموعد يتضمن: «${e.title}» يوم ${weekday(e.starts_at)} ${date(e.starts_at)}، ${time(e.starts_at)}${e.location ? ` في «${e.location}»` : ''}. إن احتاج النص تعديلًا فاستخدم «تعديل» بدلًا من ذلك (حفظ التعديل يعتمد التذكير أيضًا).`,
      confirmLabel: 'اعتماد التذكير',
      danger: false,
    });
    if (!ok) return;
    await api.post(`/admin/matter-events/${e.id}/approve-reminder`);
    await refresh('اعتُمد تذكير المستفيد/ة بهذا الموعد', { tab: 'events' });
  }

  function eventItem(e) {
    const p = calendarParts(e.starts_at);
    const past = new Date(e.starts_at).getTime() < now;
    const pendingReminder = Boolean(e.reminder_pending_approval);
    const acts = !closed
      ? h(
          'div.btn-group.mt-2',
          pendingReminder && e.status === 'scheduled' && asyncButton('اعتماد تذكير المستفيد/ة', () => approveReminder(e), { size: 'sm', variant: 'primary', icon: 'checkCircle' }),
          e.status === 'scheduled' && button('تسجيل ما تم', { size: 'sm', variant: past ? 'primary' : 'secondary', icon: 'check', onClick: () => openRecordOutcome(e) }),
          button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openEditEvent(e) }),
        )
      : null;
    return h(
      'article.event-item.pb-event',
      { class: [e.client_attendance_required && e.status === 'scheduled' && 'is-required', e.status !== 'scheduled' && 'is-past'] },
      h('div.event-date', { 'aria-hidden': 'true' }, h('span.d', p.day), h('span.m', p.month)),
      h(
        'div.event-info',
        h('div.event-title', e.title),
        h(
          'div.event-meta',
          h('span', icon('clock', { size: 14 }), `${weekday(e.starts_at)} ${date(e.starts_at)}، ${time(e.starts_at)}`),
          e.location && h('span', icon('mapPin', { size: 14 }), e.location),
        ),
        h(
          'div.row.mt-2',
          statusBadge('event_kind', e.kind),
          statusBadge('event_status', e.status),
          e.client_attendance_required
            ? pendingReminder
              ? badge('يلزم حضور المستفيد/ة', 'accent', { icon: 'user' })
              : badge('يلزم حضور المستفيد/ة — تذكير آلي عبر واتساب', 'accent', { icon: 'zap' })
            : null,
          pendingReminder
            ? badge('تذكير المستفيد/ة بانتظار الاعتماد', 'warning', {
                icon: 'clock',
                title: 'أضاف المحامي هذا الموعد أو عدّله، ولن يُرسل التذكير للمستفيد/ة قبل أن تعتمده الإدارة',
              })
            : null,
          e.status === 'scheduled' && past && badge('مضى موعده ولم تُسجَّل نتيجته', 'warning', { icon: 'alert' }),
          // v9.1 b-portal (B91-13): ردها من صفحة المتابعة أو زر واتساب
          e.client_response === 'yes' && badge('ردّت: هتحضر', 'success', { icon: 'checkCircle' }),
          e.client_response === 'no' && badge('ردّت: مش هتقدر تحضر', 'warning', { icon: 'alert' }),
          e.client_response === 'question' && badge('عندها سؤال على الموعد', 'info', { icon: 'message' }),
        ),
        e.outcome && h('div.mt-2', textBlock('ما تم', e.outcome, { iconName: 'checkCircle' })),
        e.notes && h('div.mt-2', textBlock('ملاحظات', e.notes)),
        acts,
      ),
    );
  }

  function renderEvents() {
    const upcoming = events.filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const rest = events.filter((e) => !upcoming.includes(e)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    const pendingReminders = events.filter((e) => e.reminder_pending_approval && e.status === 'scheduled').length;
    return h(
      'div.stack',
      alertBox('المواعيد التي يلزم فيها حضور المستفيد/ة يُرسَل للمستفيد/ة بشأنها تذكير آلي عبر واتساب قبل الموعد بثلاثة أيام ثم قبله بيوم. بدون بيانات اعتماد واتساب تُسجَّل الرسائل «إرسال تجريبي (محاكاة)».', 'info', { icon: 'zap' }),
      pendingReminders > 0 &&
        alertBox('أضاف المحامي مواعيد يلزم فيها حضور المستفيد/ة أو عدّلها، ولن يُرسل تذكيرها للمستفيد/ة قبل اعتماد الإدارة. راجع العنوان والمكان ثم اضغط «اعتماد تذكير المستفيد/ة».', 'warning', {
          title: 'تذكيرات بانتظار الاعتماد',
          icon: 'alert',
        }),
      card({
        title: 'المواعيد القادمة',
        icon: 'calendar',
        actions: !closed && button('إضافة جلسة أو موعد', { size: 'sm', variant: 'primary', icon: 'plus', onClick: openAddEvent }),
        body: upcoming.length ? h('div.stack-sm', upcoming.map(eventItem)) : emptyState('لا توجد مواعيد قادمة مجدولة', null, { compact: true, icon: 'calendar' }),
      }),
      rest.length > 0 && card({ title: 'مواعيد سابقة أو منتهية', icon: 'clock', body: h('div.stack-sm', rest.map(eventItem)) }),
    );
  }

  // ───────────────────────── المهام ─────────────────────────

  const assigneeOptions = [
    d.responsible_lawyer && { value: d.responsible_lawyer.id, label: `${d.responsible_lawyer.name} (المحامي المسؤول)` },
    ...(staff || []).map((s) => ({ value: s.id, label: `${s.name} (${label('user_role', s.role)})` })),
  ].filter(Boolean);

  const proceduralField = {
    name: 'procedural',
    type: 'checkbox',
    text: 'موعد إجرائي (مثل ميعاد طعن أو تقديم مذكرة)',
    hint: 'يُنبَّه المسؤول والإدارة آليًا قبل الموعد الإجرائي إن لم يُسجَّل الإجراء.',
    full: true,
  };

  async function openAddTask() {
    const res = await formModal({
      title: 'إضافة مهمة أو موعد إجرائي',
      fields: [
        { name: 'title', label: 'المهمة', type: 'text', required: true, maxLength: 300, full: true },
        { name: 'due_at', label: 'الموعد', type: 'datetime' },
        assigneeOptions.length > 0 && { name: 'assignee_user_id', label: 'المسؤول عن المهمة', type: 'select', options: assigneeOptions },
        proceduralField,
        { name: 'details', label: 'تفاصيل', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      values: { assignee_user_id: d.responsible_lawyer ? d.responsible_lawyer.id : null },
      submitLabel: 'إضافة المهمة',
      submitIcon: 'plus',
      onSubmit: (v) =>
        api.post(`/admin/matters/${id}/tasks`, {
          title: v.title,
          details: v.details || null,
          due_at: v.due_at || null,
          procedural: Boolean(v.procedural),
          assignee_user_id: v.assignee_user_id || null,
        }),
    });
    if (res) await refresh('أُضيفت المهمة', { tab: 'tasks' });
  }

  async function openEditTask(t) {
    const res = await formModal({
      title: 'تعديل المهمة',
      fields: [
        { name: 'title', label: 'المهمة', type: 'text', required: true, maxLength: 300, full: true },
        { name: 'due_at', label: 'الموعد', type: 'datetime' },
        { name: 'status', label: 'الحالة', type: 'select', required: true, placeholder: false, options: options('task_status') },
        proceduralField,
        { name: 'details', label: 'تفاصيل', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      values: { ...t, procedural: Boolean(t.procedural) },
      onSubmit: (v) =>
        api.patch(`/admin/matter-tasks/${t.id}`, {
          title: v.title,
          details: v.details || null,
          due_at: v.due_at || null,
          procedural: Boolean(v.procedural),
          status: v.status,
        }),
    });
    if (res) await refresh('تم تحديث المهمة', { tab: 'tasks' });
  }

  async function setTaskStatus(t, status, msg) {
    await api.patch(`/admin/matter-tasks/${t.id}`, { status });
    await refresh(msg, { tab: 'tasks' });
  }

  function renderTasks() {
    const order = { open: 0, done: 1, cancelled: 2 };
    const rows = [...tasks].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')));
    const columns = [
      {
        key: 'title',
        label: 'المهمة',
        className: 'col-wide',
        render: (t) =>
          h(
            'div',
            h('div.cell-title', t.title),
            t.details && h('div.cell-sub', t.details),
            t.procedural ? h('div.mt-1', badge('موعد إجرائي', 'accent', { icon: 'flag' })) : null,
          ),
      },
      {
        key: 'due',
        label: 'الموعد',
        render: (t) => (t.due_at ? h('div.stack-sm', h('span.small.nowrap', dateTime(t.due_at)), t.status === 'open' && dueBadge(t.due_at)) : h('span.small.muted', 'بدون موعد')),
      },
      { key: 'assignee', label: 'المسؤول', render: (t) => t.assignee_name || null },
      { key: 'status', label: 'الحالة', render: (t) => h('div.stack-sm', statusBadge('task_status', t.status), t.done_at && h('span.cell-sub', `أُنجزت ${relative(t.done_at)}`)) },
      {
        key: 'actions',
        label: 'إجراءات',
        render: (t) =>
          closed
            ? null
            : h(
                'div.btn-group.pb-table-actions',
                t.status === 'open' && asyncButton('تم الإنجاز', () => setTaskStatus(t, 'done', 'سُجلت المهمة منجزة'), { size: 'sm', variant: 'primary', icon: 'check' }),
                button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openEditTask(t), ariaLabel: `تعديل المهمة ${t.title}` }),
                t.status === 'open' &&
                  asyncButton(
                    'إلغاء',
                    async () => {
                      const ok = await confirmAction({ title: 'إلغاء المهمة', message: `سيتم إلغاء المهمة «${t.title}» ولن تصدر بشأنها تنبيهات. هل تريد المتابعة؟`, confirmLabel: 'نعم، إلغاء المهمة' });
                      if (ok) await setTaskStatus(t, 'cancelled', 'أُلغيت المهمة');
                    },
                    { size: 'sm', variant: 'ghost', icon: 'x' },
                  ),
                t.status !== 'open' && asyncButton('إعادة فتح', () => setTaskStatus(t, 'open', 'أُعيد فتح المهمة'), { size: 'sm', variant: 'ghost', icon: 'refresh' }),
              ),
      },
    ];
    return card({
      title: 'المهام والمواعيد الإجرائية',
      subtitle: 'المواعيد الإجرائية تولّد تنبيهات آلية قبل حلولها إن لم يُسجَّل الإجراء',
      icon: 'check',
      flush: true,
      actions: !closed && button('إضافة مهمة', { size: 'sm', variant: 'primary', icon: 'plus', onClick: openAddTask }),
      body: table({
        columns,
        rows,
        caption: 'مهام الملف المستمر',
        empty: 'لا توجد مهام مسجلة',
        rowClass: (t) => (t.status !== 'open' ? 'is-muted' : t.due_at && new Date(t.due_at).getTime() < now ? 'is-highlight' : null),
      }),
    });
  }

  // ───────────────────────── الفواتير والمدفوعات ─────────────────────────

  async function openAddInvoice() {
    const res = await formModal({
      title: 'إصدار فاتورة للمستفيد/ة',
      intro: 'إن تأخر السداد بعد تاريخ الاستحقاق يُرسل النظام تذكيرًا آليًا للمستفيد/ة.',
      fields: [
        { name: 'description', label: 'البيان', type: 'text', required: true, maxLength: 300, full: true },
        { name: 'amount', label: 'المبلغ', type: 'money', required: true, min: 0.01 },
        { name: 'due_at', label: 'تاريخ الاستحقاق', type: 'date', required: true, endOfDay: true },
      ],
      values: { due_at: cairoToday() },
      submitLabel: 'إصدار الفاتورة',
      submitIcon: 'plus',
      onSubmit: (v) => api.post(`/admin/matters/${id}/invoices`, { description: v.description, amount: v.amount, due_at: v.due_at }),
    });
    if (res) await refresh(`أُصدرت الفاتورة ${res.number || ''}`.trim(), { tab: 'invoices' });
  }

  async function openPayment(inv) {
    const res = await formModal({
      title: `تسجيل دفعة على الفاتورة ${inv.number}`,
      intro: `المتبقي على هذه الفاتورة: ${money(inv.balance)}.`,
      fields: [
        { name: 'amount', label: 'المبلغ المدفوع', type: 'money', required: true, min: 0.01, max: inv.balance },
        { name: 'paid_at', label: 'تاريخ الدفع', type: 'date' },
        { name: 'method', label: 'طريقة الدفع', type: 'text', maxLength: 60, placeholder: 'نقدًا / تحويل بنكي / إنستاباي' },
        { name: 'reference', label: 'رقم مرجعي', type: 'text', maxLength: 120, ltr: true },
      ],
      values: { amount: inv.balance, paid_at: cairoToday() },
      submitLabel: 'تسجيل الدفعة',
      submitIcon: 'check',
      onSubmit: (v) =>
        api.post(`/admin/invoices/${inv.id}/payments`, { amount: v.amount, paid_at: v.paid_at || null, method: v.method || null, reference: v.reference || null }),
    });
    if (res) await refresh(res.status === 'paid' ? 'سُجلت الدفعة وسُددت الفاتورة بالكامل' : 'سُجلت الدفعة', { tab: 'invoices' });
  }

  async function cancelInvoice(inv) {
    const ok = await confirmAction({
      title: `إلغاء الفاتورة ${inv.number}`,
      message: 'ستُلغى الفاتورة وتتوقف التذكيرات الآلية بشأنها. لا يمكن التراجع عن هذا الإجراء.',
      confirmLabel: 'نعم، إلغاء الفاتورة',
    });
    if (!ok) return;
    await api.post(`/admin/invoices/${inv.id}/cancel`);
    await refresh('أُلغيت الفاتورة', { tab: 'invoices' });
  }

  function renderInvoices() {
    const columns = [
      { key: 'number', label: 'رقم الفاتورة', render: (i) => codeTag(i.number) },
      { key: 'description', label: 'البيان', className: 'col-wide' },
      { key: 'amount', label: 'المبلغ', align: 'end', render: (i) => h('span.nowrap', money(i.amount)) },
      { key: 'paid', label: 'المدفوع', align: 'end', render: (i) => h('span.nowrap', money(i.paid_amount)) },
      { key: 'balance', label: 'المتبقي', align: 'end', render: (i) => h('strong.nowrap', money(i.status === 'cancelled' ? 0 : i.balance)) },
      {
        key: 'due',
        label: 'الاستحقاق',
        render: (i) =>
          h(
            'div.stack-sm',
            h('span.small.nowrap', date(i.due_at)),
            ['unpaid', 'partially_paid'].includes(i.status) && new Date(i.due_at).getTime() < now && badge('متأخرة السداد', 'danger', { icon: 'clock' }),
          ),
      },
      {
        key: 'status',
        label: 'الحالة',
        render: (i) =>
          h(
            'div.stack-sm',
            statusBadge('invoice_status', i.status),
            i.reminder_count > 0 && h('span.cell-sub', `تذكيرات آلية: ${i.reminder_count}`),
            // v9.1 b-portal (B91-18): موافقة المستفيد/ة أو ردها من صفحة المتابعة (التذكير الآلي لا يُرسل قبل موافقتها)
            i.client_response === 'cannot_pay'
              ? badge('طلبت إعفاء: «مش قادرة أدفع»', 'warning', { icon: 'alert' })
              : i.client_agreed_at
                ? h('span.cell-sub', `وافقت المستفيدة ${date(i.client_agreed_at)}`)
                : i.client_response === 'question'
                  ? h('span.cell-sub', 'عندها سؤال على المبلغ (في الرسائل)')
                  : ['unpaid', 'partially_paid'].includes(i.status) && !(i.paid_amount > 0) && h('span.cell-sub', 'لم توافق المستفيدة بعد — لا تذكير آلي'),
          ),
      },
      {
        key: 'actions',
        label: 'إجراءات',
        render: (i) =>
          h(
            'div.btn-group.pb-table-actions',
            ['unpaid', 'partially_paid'].includes(i.status) && button('تسجيل دفعة', { size: 'sm', variant: 'primary', icon: 'wallet', onClick: () => openPayment(i) }),
            i.status === 'unpaid' && !(i.paid_amount > 0) && asyncButton('إلغاء', () => cancelInvoice(i), { size: 'sm', variant: 'ghost', icon: 'x' }),
            printButton({ kind: 'invoice', id: i.id, label: 'طباعة', variant: 'ghost', title: `طباعة الفاتورة ${i.number}` }),
          ),
      },
    ];
    const agreed = Number(m.agreed_fee) || 0;
    return h(
      'div.stack',
      h(
        'div.stats-grid',
        statCard({ label: 'إجمالي الفواتير', value: money(totals.invoiced), icon: 'fileText', tone: 'primary', hint: 'باستثناء الملغاة' }),
        statCard({ label: 'المحصّل', value: money(totals.paid), icon: 'checkCircle', tone: 'success' }),
        statCard({ label: 'المتبقي', value: money(balance), icon: 'wallet', tone: balance > 0 ? 'warning' : 'muted' }),
        statCard({ label: 'الأتعاب المتفق عليها', value: m.agreed_fee != null ? money(m.agreed_fee) : '—', icon: 'scale', tone: 'neutral' }),
      ),
      agreed > 0 &&
        card({
          body: progressBar(Math.min(totals.paid || 0, agreed), agreed, 'success', { label: `المحصّل من الأتعاب المتفق عليها (${money(totals.paid)} من ${money(agreed)})` }),
        }),
      card({
        title: 'الفواتير',
        icon: 'fileText',
        flush: true,
        actions: button('إصدار فاتورة', { size: 'sm', variant: 'primary', icon: 'plus', onClick: openAddInvoice }),
        body: table({ columns, rows: invoices, caption: 'فواتير الملف المستمر', empty: 'لم تصدر فواتير لهذا الملف بعد', rowClass: (i) => (i.status === 'cancelled' ? 'is-muted' : null) }),
      }),
      card({
        title: 'المدفوعات',
        icon: 'checkCircle',
        flush: true,
        body: table({
          columns: [
            { key: 'receipt', label: 'رقم الإيصال', render: (p) => (p.receipt_number ? codeTag(p.receipt_number) : null) },
            { key: 'invoice', label: 'الفاتورة', render: (p) => codeTag(p.invoice_number) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (p) => h('strong.nowrap', money(p.amount)) },
            { key: 'paid_at', label: 'تاريخ الدفع', render: (p) => h('span.small.nowrap', date(p.paid_at)) },
            { key: 'method', label: 'الطريقة', render: (p) => p.method },
            { key: 'reference', label: 'المرجع', render: (p) => (p.reference ? ltr(p.reference) : null) },
            { key: 'print', label: '', render: (p) => printButton({ kind: 'receipt', id: p.id, label: 'إيصال', variant: 'ghost', title: `طباعة إيصال الاستلام${p.receipt_number ? ` ${p.receipt_number}` : ''}` }) },
          ],
          rows: payments,
          caption: 'المدفوعات المسجلة',
          empty: 'لا توجد مدفوعات مسجلة',
        }),
      }),
    );
  }

  // ───────────────────────── المصروفات ─────────────────────────

  async function openAddExpense(lawyerOptions) {
    const res = await formModal({
      title: 'تسجيل مصروفات على الملف',
      fields: [
        { name: 'description', label: 'البيان', type: 'text', required: true, maxLength: 300, full: true, placeholder: 'مثال: رسوم قيد الدعوى' },
        { name: 'amount', label: 'المبلغ', type: 'money', required: true, min: 0.01 },
        { name: 'incurred_at', label: 'التاريخ', type: 'date' },
        {
          name: 'paid_by',
          label: 'من دفعها',
          type: 'select',
          required: true,
          options: options('expense_paid_by'),
          onChange: (v, fapi) => {
            fapi.control('lawyer_id').wrap.hidden = v !== 'lawyer';
          },
        },
        { name: 'lawyer_id', label: 'المحامي الذي دفعها', type: 'select', options: lawyerOptions, hint: 'يُضاف المبلغ تلقائيًا لمستحقات المحامي (استرداد مصروفات).' },
      ],
      values: { paid_by: 'organization', incurred_at: cairoToday(), lawyer_id: d.responsible_lawyer ? d.responsible_lawyer.id : null },
      setup: (f) => {
        f.control('lawyer_id').wrap.hidden = true;
      },
      submitLabel: 'تسجيل المصروفات',
      submitIcon: 'plus',
      onSubmit: (v, fapi) => {
        if (v.paid_by === 'lawyer' && !v.lawyer_id) {
          fapi.setErrors({ lawyer_id: 'اختر المحامي الذي دفع المصروفات' });
          throw new Error('اختر المحامي الذي دفع المصروفات');
        }
        return api.post(`/admin/matters/${id}/expenses`, {
          description: v.description,
          amount: v.amount,
          incurred_at: v.incurred_at || null,
          paid_by: v.paid_by,
          lawyer_id: v.paid_by === 'lawyer' ? v.lawyer_id : null,
        });
      },
    });
    if (res) await refresh(res.paid_by === 'lawyer' ? 'سُجلت المصروفات وأُضيفت لمستحقات المحامي' : 'سُجلت المصروفات', { tab: 'expenses' });
  }

  function renderExpenses() {
    const total = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return card({
      title: 'المصروفات',
      subtitle: `الإجمالي: ${money(total)} — ما يدفعه المحامي يُضاف تلقائيًا لمستحقاته، وما تدفعه المؤسسة يدخل في تكلفة الملف`,
      icon: 'wallet',
      flush: true,
      actions: asyncButton(
        'تسجيل مصروفات',
        async () => {
          const lawyers = await activeLawyers();
          openAddExpense(lawyers);
        },
        { size: 'sm', variant: 'primary', icon: 'plus' },
      ),
      body: table({
        columns: [
          { key: 'description', label: 'البيان', className: 'col-wide' },
          { key: 'amount', label: 'المبلغ', align: 'end', render: (x) => h('strong.nowrap', money(x.amount)) },
          { key: 'paid_by', label: 'من دفعها', render: (x) => statusBadge('expense_paid_by', x.paid_by) },
          { key: 'lawyer', label: 'المحامي', render: (x) => x.lawyer_name || null },
          { key: 'date', label: 'التاريخ', render: (x) => h('span.small.nowrap', date(x.incurred_at)) },
        ],
        rows: expenses,
        caption: 'مصروفات الملف المستمر',
        empty: 'لا توجد مصروفات مسجلة',
      }),
    });
  }

  // ───────────────────────── أتعاب المحامي (مدير النظام) ─────────────────────────

  async function openAddFee(lawyerOptions) {
    const res = await formModal({
      title: 'تسجيل أتعاب للمحامي عن هذا الملف',
      intro: 'يُقيَّد المبلغ في كشف حساب المحامي كمستحق، ويُصرف لاحقًا من صفحة المحاسبة.',
      fields: [
        { name: 'lawyer_id', label: 'المحامي', type: 'select', required: true, options: lawyerOptions },
        { name: 'amount', label: 'المبلغ', type: 'money', required: true, min: 0.01 },
        { name: 'description', label: 'البيان', type: 'text', required: true, maxLength: 300, full: true },
      ],
      values: { lawyer_id: d.responsible_lawyer ? d.responsible_lawyer.id : null, description: `أتعاب ${label('matter_kind', m.kind)} — ${m.code}` },
      submitLabel: 'تسجيل الأتعاب',
      submitIcon: 'plus',
      onSubmit: (v) => api.post(`/admin/matters/${id}/lawyer-fees`, { lawyer_id: v.lawyer_id, amount: v.amount, description: v.description }),
    });
    if (res) await refresh('قُيدت الأتعاب في كشف حساب المحامي', { tab: 'fees' });
  }

  function renderFees() {
    const total = fees.filter((f) => f.status !== 'void').reduce((s, f) => s + (Number(f.amount) || 0), 0);
    return h(
      'div.stack',
      alertBox('أتعاب المحامي عن الملف المستمر تُقيَّد في كشف حسابه وتُصرف من صفحة المحاسبة. استرداد المصروفات التي دفعها المحامي يُضاف هنا تلقائيًا.', 'info', { icon: 'wallet' }),
      card({
        title: 'أتعاب ومستحقات المحامين',
        subtitle: `إجمالي القيود غير الملغاة: ${money(total)}`,
        icon: 'wallet',
        flush: true,
        actions: [
          button('المحاسبة', { size: 'sm', variant: 'ghost', icon: 'externalLink', href: '#/accounting' }),
          asyncButton(
            'تسجيل أتعاب',
            async () => {
              const lawyers = await activeLawyers();
              openAddFee(lawyers);
            },
            { size: 'sm', variant: 'primary', icon: 'plus' },
          ),
        ],
        body: table({
          columns: [
            { key: 'lawyer', label: 'المحامي', render: (f) => f.lawyer_name },
            { key: 'kind', label: 'النوع', render: (f) => badge(label('ledger_kind', f.kind), f.kind === 'reimbursement' ? 'info' : 'primary') },
            { key: 'description', label: 'البيان', className: 'col-wide' },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (f) => h('strong.nowrap', money(f.amount)) },
            { key: 'period', label: 'الشهر', render: (f) => (f.period ? ltr(f.period) : null) },
            { key: 'status', label: 'الحالة', render: (f) => statusBadge('ledger_status', f.status) },
            { key: 'date', label: 'التاريخ', render: (f) => h('span.small.nowrap', date(f.created_at)) },
          ],
          rows: fees,
          caption: 'قيود أتعاب المحامين على الملف',
          empty: 'لا توجد قيود أتعاب لهذا الملف بعد',
          rowClass: (f) => (f.status === 'void' ? 'is-muted' : null),
        }),
      }),
    );
  }

  // ───────────────────────── المستندات والرسائل والسجل ─────────────────────────

  function renderDocuments() {
    // (v9 ai) آخر تحليل لكل مستند: مستندات الملف المستمر، وما حُلل منها ضمن الاستشارة الأصلية
    const analyses = docAnalysisStore([{ matter_id: m.id }, d.case && d.case.id && { case_id: d.case.id }]);
    return h(
      'div.stack',
      card({
        title: 'مستندات الملف المستمر',
        subtitle: 'يراها المحامي المسؤول من بوابته',
        icon: 'paperclip',
        flush: true,
        body: table({
          columns: [
            {
              key: 'title',
              label: 'المستند',
              className: 'col-wide',
              render: (x) =>
                h(
                  'div',
                  h('div.cell-title', { dir: 'auto' }, x.title),
                  x.filename !== x.title && h('div.cell-sub', { dir: 'auto' }, x.filename),
                  docAiBadge(analyses, x.id),
                ),
            },
            { key: 'by', label: 'أضافه', render: (x) => statusBadge('actor_kind', x.uploaded_by_kind) },
            { key: 'date', label: 'التاريخ', render: (x) => h('span.small.nowrap', dateTime(x.created_at)) },
            { key: 'size', label: 'الحجم', render: (x) => h('span.small.nowrap', formatBytes(x.size)) },
            {
              key: 'dl',
              label: 'إجراءات',
              render: (x) =>
                h(
                  'div.btn-group',
                  button('تنزيل', { size: 'sm', variant: 'ghost', icon: 'download', href: downloadUrl(x.id), target: '_blank', ariaLabel: `تنزيل ${x.title}` }),
                  // (v9 messaging) إرسال المستند للعميل عبر واتساب (داخل نافذة الـ 24 ساعة) أو بوابة العملاء
                  sendDocumentButton(x, { onSent: () => refresh(null, { tab: 'documents' }) }),
                  // (v9 ai) تحليل المستند؛ النتيجة تظهر في «نتائج تحليل المستندات» أدناه
                  docAiAction(analyses, x),
                ),
            },
          ],
          rows: documents,
          caption: 'مستندات الملف المستمر',
          empty: 'لا توجد مستندات في هذا الملف بعد',
        }),
      }),
      docAiResultsCard(analyses, documents),
      card({
        title: 'رفع مستندات',
        icon: 'upload',
        body: uploadPanel({
          onUpload: async (payload) => {
            await api.post(`/admin/matters/${id}/documents`, payload);
            await refresh('رُفعت المستندات إلى الملف المستمر', { tab: 'documents' });
          },
        }),
      }),
    );
  }

  // مرفقات العميل لا تصل للمحامي المسؤول تلقائيًا: تتيحها الإدارة (أو تسحبها) مرفقًا مرفقًا
  function attachmentShareControls(thread) {
    const bubbles = thread.querySelectorAll('.msg');
    messages.forEach((msg, i) => {
      const docs = msg.direction === 'in' ? msg.documents || [] : [];
      const bubble = docs.length && bubbles[i] ? bubbles[i].querySelector('.msg-bubble') : null;
      if (!bubble) return;
      bubble.append(
        h(
          'div.pb-msg-extra.pb-msg-shares',
          docs.map((doc) => {
            const shared = Boolean(doc.shared_with_matter);
            return h(
              'div.pb-msg-share',
              h('span.pb-msg-share-name', { dir: 'auto' }, icon('paperclip', { size: 13 }), doc.filename || doc.title || `مستند #${doc.id}`),
              shared ? badge('متاح للمحامي', 'success', { icon: 'eye' }) : null,
              asyncButton(
                shared ? 'سحب من المحامي' : 'إتاحة للمحامي المسؤول',
                async () => {
                  await api.patch(`/admin/documents/${doc.id}`, { matter_id: shared ? null : m.id });
                  await refresh(shared ? 'سُحب المرفق من المحامي المسؤول' : 'أصبح المرفق متاحًا للمحامي المسؤول', { tab: 'messages' });
                },
                {
                  size: 'sm',
                  variant: shared ? 'ghost' : 'secondary',
                  icon: shared ? 'eyeOff' : 'eye',
                  title: !shared && !d.responsible_lawyer ? 'لم يُحدَّد محامٍ مسؤول بعد؛ سيراه المحامي عند تحديده' : null,
                },
              ),
            );
          }),
        ),
      );
    });
    return thread;
  }

  function renderMessages() {
    return h(
      'div.stack',
      alertBox('سجل الرسائل المرتبطة بهذا الملف، بما فيها التذكيرات الآلية بالجلسات والفواتير (آخر 50 رسالة). مرفقات المستفيد/ة لا يراها المحامي المسؤول إلا بعد أن تتيحها الإدارة.', 'info', { icon: 'message' }),
      attachmentShareControls(
        messageThread(messages, {
          inLabel: d.client ? d.client.name : 'المستفيد/ة',
          outLabel: 'المؤسسة',
          onRetry: async (msg) => {
            await api.post(`/admin/messages/${msg.id}/retry`);
            await refresh('أُعيدت محاولة إرسال الرسالة', { tab: 'messages' });
          },
        }),
      ),
      messageComposer({
        // v9.1 b-site (B91-01): «واتساب + صفحة المتابعة» أو «صفحة المتابعة فقط — الرقم غير مؤكد»
        hint: `${d.reply_channel ? `تصل الرسالة: ${d.reply_channel.text}. ` : ''}بدون بيانات اعتماد واتساب تُسجَّل الرسائل «إرسال تجريبي (محاكاة)».`,
        // (v9) ردود جاهزة بمتغيرات الملف (كود الاستشارة الأصلية إن وُجدت)، واقتراح رد بالذكاء الاصطناعي
        quickReplies: {
          client_name: d.client?.name || undefined,
          case_code: d.case?.code || m.code,
          case_id: d.case?.id || undefined,
          client_id: d.client?.id || undefined,
        },
        aiTarget: { matterId: m.id },
        onSend: async ({ body, channel }) => {
          await api.post(`/admin/matters/${id}/messages`, { body, channel });
          await refresh('أُرسلت الرسالة للمستفيد/ة', { tab: 'messages' });
        },
      }),
    );
  }

  // ───────────────────────── تعديل بيانات الملف ─────────────────────────

  async function openEditDialog(activeOptions) {
    // محامٍ مسؤول موقوف لا يظهر بين المحامين النشطين: نُبقيه خيارًا حتى لا يُمسح بحفظ تعديل آخر
    const lawyerOptions = [...(activeOptions || [])];
    if (m.responsible_lawyer_id && !lawyerOptions.some((o) => o.value === m.responsible_lawyer_id)) {
      lawyerOptions.unshift({ value: m.responsible_lawyer_id, label: `${d.responsible_lawyer?.name || 'المحامي الحالي'} (حساب غير نشط)` });
    }
    const res = await formModal({
      title: 'تعديل بيانات الملف المستمر',
      size: 'lg',
      fields: [
        { name: 'title', label: 'العنوان', type: 'text', required: true, maxLength: 200, full: true },
        { name: 'kind', label: 'نوع الملف', type: 'select', required: true, placeholder: false, options: options('matter_kind') },
        { name: 'status', label: 'الحالة', type: 'select', required: true, placeholder: false, options: options('matter_status'), hint: 'إغلاق الملف المستمر يوقف إضافة المواعيد والمهام الجديدة.' },
        { name: 'responsible_lawyer_id', label: 'المحامي المسؤول', type: 'select', options: lawyerOptions, hint: 'يُبلَّغ المحامي الجديد ويرى الملف من بوابته.' },
        { name: 'agreed_fee', label: 'الأتعاب المتفق عليها مع المستفيد/ة', type: 'money', min: 0 },
        { name: 'court', label: 'المحكمة', type: 'text', maxLength: 150 },
        { name: 'circuit', label: 'الدائرة', type: 'text', maxLength: 100 },
        { name: 'lawsuit_number', label: 'رقم الدعوى', type: 'text', maxLength: 60, ltr: true },
        { name: 'lawsuit_year', label: 'سنة الدعوى', type: 'text', maxLength: 10, ltr: true },
        { name: 'opponent', label: 'الخصم', type: 'text', maxLength: 200, full: true },
        { name: 'notes', label: 'ملاحظات وتكليف المحامي', type: 'textarea', rows: 4, maxLength: 10000 },
      ],
      values: { ...m },
      onSubmit: async (v) => {
        if (v.status === 'closed' && m.status !== 'closed') {
          const ok = await confirmAction({
            title: 'إغلاق الملف المستمر',
            message: 'بعد الإغلاق لن تُضاف مواعيد أو مهام جديدة لهذا الملف. هل تريد المتابعة؟',
            confirmLabel: 'نعم، إغلاق الملف',
          });
          if (!ok) throw new Error('لم يُحفظ التعديل: اختر حالة أخرى أو أكّد الإغلاق.');
        }
        // يُرسل المحامي المسؤول فقط إن تغيّر: الخادم يرفض إعادة إرسال حساب موقوف
        const lid = v.responsible_lawyer_id || null;
        return api.patch(`/admin/matters/${id}`, {
          title: v.title,
          kind: v.kind,
          status: v.status,
          responsible_lawyer_id: lid !== (m.responsible_lawyer_id || null) ? lid : undefined,
          agreed_fee: v.agreed_fee ?? null,
          court: v.court || null,
          circuit: v.circuit || null,
          lawsuit_number: v.lawsuit_number || null,
          lawsuit_year: v.lawsuit_year || null,
          opponent: v.opponent || null,
          notes: v.notes || null,
        });
      },
    });
    if (res) await refresh('تم تحديث بيانات الملف المستمر');
  }

  // ───────────────────────── التجميع ─────────────────────────

  const nz = (n) => (n > 0 ? n : null);
  const items = [
    { key: 'events', label: 'الجلسات والمواعيد', icon: 'calendar', count: nz(events.filter((e) => e.status === 'scheduled').length), render: renderEvents },
    { key: 'tasks', label: 'المهام الإجرائية', icon: 'check', count: nz(openTasks.length), render: renderTasks },
    { key: 'invoices', label: 'الفواتير والمدفوعات', icon: 'fileText', count: nz(invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status)).length), render: renderInvoices },
    { key: 'expenses', label: 'المصروفات', icon: 'wallet', count: nz(expenses.length), render: renderExpenses },
    isAdmin && { key: 'fees', label: 'أتعاب المحامي', icon: 'scale', count: nz(fees.length), render: renderFees },
    { key: 'documents', label: 'المستندات', icon: 'paperclip', count: nz(documents.length), render: renderDocuments },
    { key: 'messages', label: 'الرسائل', icon: 'message', count: nz(messages.length), render: renderMessages },
    { key: 'activity', label: 'السجل', icon: 'clock', render: () => card({ title: 'السجل الزمني للملف المستمر', icon: 'clock', body: activityTimeline(d.activity || []) }) },
  ].filter(Boolean);
  const requested = TAB_KEYS.includes(ctx.query.tab) && items.some((i) => i.key === ctx.query.tab) ? ctx.query.tab : 'events';
  tabsEl = tabs(items, { active: requested, onChange: (key) => syncTab(key), className: 'pb-case-tabs' });

  return frag(
    header,
    closed && alertBox(`الملف المستمر مغلق منذ ${date(m.closed_at)}. يمكنك إعادة فتحه بتعديل الحالة.`, 'info', { icon: 'lock' }),
    stats,
    summary,
    // v9 practice: أطراف الدعوى وتعارض المصالح، والأثر المتحقق للمستفيد
    h('div.grid-2.v9p-grid', partiesCard({ matterId: m.id }), outcomeCard({ kind: 'matter', id: m.id })),
    tabsEl,
  );
}
