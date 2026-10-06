// بوابة المحامي — ملف مستمر (تمثيل قضائي أو عمل مستمر): بيانات الدعوى، الجلسات والمواعيد، المهام الإجرائية، والمستندات.
// المحامي يسجل الجلسات والمهام؛ والتواصل مع العميل (ومنه التذكير الآلي بالمواعيد) تتولاه المؤسسة.

import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, options, date, shortDate, dateTime, time, weekday, relative, num, orgName } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  alertBox,
  badge,
  statusBadge,
  dueBadge,
  codeTag,
  button,
  asyncButton,
  toast,
  modal,
  formDialog,
  form,
  emptyState,
  errorState,
  icon,
  kv,
  richText,
  statCard,
  errorMessage,
} from '../../../lib/ui.js';
import { eventDateBox, lawsuitRef } from './matters.js';

/** يغلف معالج نقر غير متزامن: أي خطأ يظهر في رسالة بدل أن يضيع. */
const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    toast(errorMessage(err), 'danger');
  }
};

const REMINDER_HINT = 'عند التفعيل يرسل النظام تذكيرًا آليًا للمستفيد/ة قبل الموعد بثلاثة أيام عبر قناة المؤسسة.';

export default async function render(ctx) {
  const id = ctx.params.id;
  const base = `/lawyer/matters/${encodeURIComponent(id)}`;
  const crumbs = (code) => [
    { label: 'بوابة المحامي', href: '#/my' },
    { label: 'الملفات المستمرة', href: '#/my/matters' },
    { label: code || `#${id}` },
  ];

  let data;
  try {
    data = await api.get(base);
  } catch (err) {
    return frag(pageHeader({ title: 'ملف مستمر', breadcrumbs: crumbs() }), card({ body: errorState(err, () => ctx.reload()) }));
  }
  ctx.setTitle(`ملف ${data.matter.code}`);

  const hosts = { header: h('div'), stats: h('div'), events: h('div'), tasks: h('div') };
  Object.values(hosts).forEach((el) => {
    el.setAttribute('tabindex', '-1');
    el.classList.add('pc-focus-host');
  });

  async function refresh() {
    data = await api.get(base);
    draw();
  }

  const isClosed = () => data.matter.status === 'closed';

  // ───────────── الترويسة والملخص ─────────────

  function headerNode() {
    const m = data.matter;
    return pageHeader({
      title: m.title,
      breadcrumbs: crumbs(m.code),
      actions: isClosed()
        ? null
        : frag(
            button('تسجيل جلسة/موعد', { variant: 'primary', icon: 'calendar', onClick: safe(addEvent) }),
            button('إضافة مهمة', { variant: 'secondary', icon: 'plus', onClick: safe(addTask) }),
          ),
      meta: h('div.pc-meta-row', codeTag(m.code), statusBadge('matter_kind', m.kind), statusBadge('matter_status', m.status)),
    });
  }

  function statsNode() {
    const now = Date.now();
    const upcoming = data.events.filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now);
    const next = upcoming[0];
    const openTasks = data.tasks.filter((t) => t.status === 'open');
    const overdue = openTasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
    const pendingOutcome = data.events.filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() < now);
    return h(
      'div.stats-grid.pc-stats',
      statCard({
        label: 'الموعد القادم',
        value: next ? h('time.pc-stat-small', { datetime: next.starts_at, title: dateTime(next.starts_at) }, `${shortDate(next.starts_at)}، ${time(next.starts_at)}`) : '—',
        hint: next ? `${next.title || label('event_kind', next.kind)} — ${relative(next.starts_at)}` : 'لا يوجد موعد قادم',
        icon: 'calendar',
        tone: 'primary',
      }),
      statCard({ label: 'مهام مفتوحة', value: num(openTasks.length), hint: overdue.length ? `منها ${num(overdue.length)} متأخرة` : 'لا توجد مهام متأخرة', icon: 'check', tone: overdue.length ? 'danger' : 'info' }),
      statCard({ label: 'جلسات بانتظار تسجيل ما تم', value: num(pendingOutcome.length), hint: 'سجّل ما تم بعد كل جلسة', icon: 'edit', tone: pendingOutcome.length ? 'warning' : 'success' }),
    );
  }

  // ───────────── الجلسات والمواعيد ─────────────

  function eventItem(e) {
    const past = new Date(e.starts_at).getTime() < Date.now();
    const needsOutcome = e.status === 'scheduled' && past;
    return h(
      'li.event-item.pc-event',
      { class: [e.client_attendance_required && e.status === 'scheduled' && !past && 'is-required', e.status !== 'scheduled' && 'is-past'] },
      eventDateBox(e.starts_at, { muted: e.status === 'cancelled' }),
      h(
        'div.event-info',
        h('div.pc-event-head', h('span.event-title', e.title || label('event_kind', e.kind)), statusBadge('event_kind', e.kind, { dot: false }), statusBadge('event_status', e.status)),
        h(
          'div.event-meta',
          h('span', icon('clock', { size: 14 }), h('time', { datetime: e.starts_at, title: relative(e.starts_at) }, `${weekday(e.starts_at)}، ${date(e.starts_at)} — ${time(e.starts_at)}`)),
          e.location && h('span', icon('mapPin', { size: 14 }), e.location),
        ),
        e.client_attendance_required
          ? h(
              'div.pc-reminder',
              icon('zap', { size: 14 }),
              h('span', e.status === 'scheduled' && !past ? 'يلزم حضور المستفيد/ة — يُرسل له تذكير آلي قبل الموعد بثلاثة أيام' : 'كان يلزم حضور المستفيد/ة'),
            )
          : null,
        e.notes && h('p.pc-event-notes', richText(e.notes)),
        e.outcome && h('div.pc-outcome', h('strong', 'ما تم: '), richText(e.outcome)),
        needsOutcome && h('div.mt-1', badge('بانتظار تسجيل ما تم في الجلسة', 'warning', { icon: 'alert' })),
        !isClosed() &&
          h(
            'div.pc-event-actions',
            button(e.status === 'scheduled' ? 'تسجيل ما تم / تحديث الحالة' : 'تعديل النتيجة', {
              variant: needsOutcome ? 'primary' : 'ghost',
              size: 'sm',
              icon: 'edit',
              onClick: () => updateEvent(e),
            }),
          ),
      ),
    );
  }

  function eventsCard() {
    const now = Date.now();
    const upcoming = data.events.filter((e) => e.status === 'scheduled' && new Date(e.starts_at).getTime() >= now);
    const rest = data.events.filter((e) => !upcoming.includes(e)).sort((a, b) => String(b.starts_at).localeCompare(String(a.starts_at)));
    return card({
      title: 'الجلسات والمواعيد',
      icon: 'calendar',
      subtitle: 'الجلسات التي يلزم فيها حضور المستفيد/ة يُذكَّر بها آليًا عبر قناة المؤسسة',
      actions: isClosed() ? null : button('تسجيل جلسة/موعد', { variant: 'secondary', size: 'sm', icon: 'plus', onClick: safe(addEvent) }),
      body: data.events.length
        ? frag(
            h('h3.pc-subhead', 'القادمة'),
            upcoming.length ? h('ul.list-plain', upcoming.map(eventItem)) : h('p.muted.small', 'لا توجد مواعيد قادمة مسجلة.'),
            rest.length ? frag(h('h3.pc-subhead.mt-3', 'السابقة'), h('ul.list-plain', rest.map(eventItem))) : null,
          )
        : emptyState('لم تُسجَّل جلسات أو مواعيد في هذا الملف بعد.', isClosed() ? null : button('تسجيل أول جلسة', { variant: 'primary', icon: 'calendar', onClick: safe(addEvent) }), { compact: true, icon: 'calendar' }),
    });
  }

  async function addEvent() {
    const m = data.matter;
    const res = await formDialog({
      title: 'تسجيل جلسة أو موعد',
      submitLabel: 'تسجيل الموعد',
      values: { kind: 'hearing', client_attendance_required: false },
      fields: [
        { name: 'kind', label: 'نوع الموعد', type: 'select', required: true, options: options('event_kind'), placeholder: false },
        { name: 'starts_at', label: 'التاريخ والوقت (بتوقيت القاهرة)', type: 'datetime', required: true },
        { name: 'title', label: 'العنوان', placeholder: 'مثال: جلسة المرافعة الثانية', maxLength: 200, hint: 'اتركه فارغًا لاستخدام نوع الموعد عنوانًا.' },
        { name: 'location', label: 'المكان', placeholder: m.court ? `${m.court}${m.circuit ? ` — ${m.circuit}` : ''}` : 'مثال: محكمة الأسرة ببنها', maxLength: 200, hint: m.court ? 'اتركه فارغًا لاستخدام المحكمة المسجلة في الملف.' : null },
        { name: 'client_attendance_required', type: 'checkbox', text: 'يلزم حضور المستفيد/ة شخصيًا', hint: REMINDER_HINT, full: true },
        { name: 'notes', label: 'ملاحظات (اختياري)', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      onSubmit: async (vals) => {
        if (vals.starts_at && new Date(vals.starts_at).getTime() < Date.now() - 60000) {
          const err = new Error('موعد الجلسة الجديدة في الماضي. لتسجيل جلسة سابقة سجّلها ثم حدّث ما تم فيها.');
          throw err;
        }
        return api.post(`${base}/events`, {
          kind: vals.kind,
          starts_at: vals.starts_at,
          title: vals.title || undefined,
          location: vals.location || undefined,
          client_attendance_required: Boolean(vals.client_attendance_required),
          notes: vals.notes || undefined,
        });
      },
    });
    if (!res) return;
    toast(res.client_attendance_required ? 'سُجّل الموعد، وسيُرسل للمستفيد/ة تذكير آلي قبله بثلاثة أيام.' : 'سُجّل الموعد في الملف.', 'success', 5000);
    await refresh();
  }

  function updateEvent(e) {
    const f = form(
      [
        { name: 'status', label: 'الحالة', type: 'select', required: true, options: options('event_status'), placeholder: false, onChange: (v, api2) => toggleNext(api2, v) },
        { name: 'outcome', label: 'ما تم في الجلسة / القرار', type: 'textarea', rows: 4, maxLength: 5000, placeholder: 'مثال: قررت المحكمة التأجيل لجلسة 20 ديسمبر للاطلاع وتقديم المستندات.' },
        { name: 'next_starts_at', label: 'موعد الجلسة التالية (اختياري)', type: 'datetime', hint: 'عند تحديده يُسجَّل موعد جديد بنفس البيانات، ويُذكَّر المستفيد/ة آليًا إن كان حضوره لازمًا.' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea', rows: 2, maxLength: 3000 },
      ],
      {
        footer: false,
        values: { status: e.status === 'scheduled' && new Date(e.starts_at).getTime() < Date.now() ? 'done' : e.status, outcome: e.outcome || '', notes: e.notes || '' },
        onSubmit: async (vals) => {
          if (vals.next_starts_at && new Date(vals.next_starts_at).getTime() <= new Date(e.starts_at).getTime()) {
            throw new Error('موعد الجلسة التالية يجب أن يكون بعد موعد هذه الجلسة');
          }
          await api.patch(`/lawyer/matter-events/${encodeURIComponent(e.id)}`, {
            status: vals.status,
            outcome: vals.outcome || null,
            notes: vals.notes || null,
          });
          if (vals.next_starts_at && vals.status === 'postponed') {
            await api.post(`${base}/events`, {
              kind: e.kind,
              title: e.title || undefined,
              starts_at: vals.next_starts_at,
              location: e.location || undefined,
              client_attendance_required: Boolean(e.client_attendance_required),
            });
          }
        },
      },
    );
    function toggleNext(api2, status) {
      const c = api2.control('next_starts_at');
      if (c && c.wrap) c.wrap.hidden = status !== 'postponed';
    }
    toggleNext(f, f.getValues().status);
    modal({
      title: `تحديث: ${e.title || label('event_kind', e.kind)}`,
      size: 'md',
      body: frag(h('p.modal-intro', `${weekday(e.starts_at)}، ${dateTime(e.starts_at)}${e.location ? ` — ${e.location}` : ''}`), f.el),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حفظ',
          variant: 'primary',
          onClick: async () => {
            const ok = await f.submit();
            if (!ok) return false;
            toast('تم تحديث الموعد', 'success');
            await refresh();
            return undefined;
          },
        },
      ],
    });
  }

  // ───────────── المهام ─────────────

  function taskItem(t) {
    const done = t.status === 'done';
    const cancelled = t.status === 'cancelled';
    return h(
      'li.pc-task',
      { class: [done && 'is-done', cancelled && 'is-cancelled'] },
      h('span.pc-task-icon', { class: done ? 'tone-success' : t.procedural ? 'tone-warning' : 'tone-info', 'aria-hidden': 'true' }, icon(done ? 'checkCircle' : t.procedural ? 'flag' : 'check', { size: 16 })),
      h(
        'div.pc-task-body',
        h('div.pc-task-title', richText(t.title)),
        t.details && h('p.pc-task-details', richText(t.details)),
        h(
          'div.pc-task-meta',
          t.procedural ? badge('موعد إجرائي', 'warning', { icon: 'flag' }) : null,
          statusBadge('task_status', t.status),
          !done && !cancelled && t.due_at ? dueBadge(t.due_at) : null,
          !done && t.due_at ? h('span.muted.small', date(t.due_at)) : null,
          done && t.done_at ? h('span.muted.small', `أُنجزت ${date(t.done_at)}`) : null,
        ),
      ),
      !isClosed() &&
        !cancelled &&
        h(
          'div.pc-task-actions',
          done
            ? asyncButton(
                'إعادة فتح',
                async () => {
                  await api.patch(`/lawyer/matter-tasks/${encodeURIComponent(t.id)}`, { status: 'open' });
                  toast('أُعيد فتح المهمة', 'success');
                  await refresh();
                },
                { variant: 'ghost', size: 'sm', icon: 'refresh' },
              )
            : asyncButton(
                'تمييز كمنجزة',
                async () => {
                  await api.patch(`/lawyer/matter-tasks/${encodeURIComponent(t.id)}`, { status: 'done' });
                  toast('سُجّلت المهمة كمنجزة', 'success');
                  await refresh();
                },
                { variant: 'secondary', size: 'sm', icon: 'check' },
              ),
        ),
    );
  }

  function tasksCard() {
    const order = { open: 0, done: 1, cancelled: 2 };
    const tasks = [...data.tasks].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || String(a.due_at || '9').localeCompare(String(b.due_at || '9')));
    return card({
      title: 'المهام والمواعيد الإجرائية',
      icon: 'check',
      subtitle: 'المواعيد الإجرائية يتابعها النظام وينبّه قبل حلولها',
      actions: isClosed() ? null : button('إضافة مهمة', { variant: 'secondary', size: 'sm', icon: 'plus', onClick: safe(addTask) }),
      body: tasks.length
        ? h('ul.pc-tasks', tasks.map(taskItem))
        : emptyState('لا توجد مهام مسجلة في هذا الملف.', null, { compact: true, icon: 'check' }),
    });
  }

  async function addTask() {
    const res = await formDialog({
      title: 'إضافة مهمة',
      submitLabel: 'إضافة المهمة',
      fields: [
        { name: 'title', label: 'المهمة', required: true, maxLength: 300, placeholder: 'مثال: تقديم مذكرة بالدفاع قبل الجلسة', full: true },
        { name: 'due_at', label: 'الموعد النهائي', type: 'datetime' },
        { name: 'procedural', type: 'checkbox', text: 'موعد إجرائي (مثل ميعاد طعن أو تقديم مذكرة)', hint: 'ينبّه النظام قبل حلول الموعد الإجرائي بثلاثة أيام إن لم يُسجَّل الإجراء.' },
        { name: 'details', label: 'تفاصيل (اختياري)', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      onSubmit: (vals) => {
        if (vals.procedural && !vals.due_at) throw new Error('حدد الموعد النهائي للموعد الإجرائي حتى يتمكن النظام من التنبيه قبله');
        return api.post(`${base}/tasks`, {
          title: vals.title,
          due_at: vals.due_at || undefined,
          procedural: Boolean(vals.procedural),
          details: vals.details || undefined,
        });
      },
    });
    if (!res) return;
    toast('أُضيفت المهمة', 'success');
    await refresh();
  }

  // ───────────── البيانات والمستندات ─────────────

  function infoCard() {
    const m = data.matter;
    return card({
      title: 'بيانات الملف',
      icon: 'scale',
      body: frag(
        kv(
          [
            ['المستفيد/ة', data.client_name],
            ['نوع الملف', label('matter_kind', m.kind)],
            ['المحكمة', m.court],
            ['الدائرة', m.circuit],
            ['رقم الدعوى', lawsuitRef(m, { prefix: false })],
            ['الخصم', m.opponent],
            ['تاريخ فتح الملف', m.opened_at && date(m.opened_at)],
          ],
          { columns: 1 },
        ),
        m.notes && h('div.pc-assign-notes', h('h3.pc-subhead', icon('flag', { size: 16 }), 'تكليف الإدارة وملاحظاتها'), h('p.pre', richText(m.notes))),
      ),
    });
  }

  function docsCard() {
    const docs = data.documents || [];
    return card({
      title: 'المستندات',
      icon: 'paperclip',
      body: docs.length
        ? h(
            'ul.pc-docs',
            docs.map((d) => {
              const name = d.title || d.filename;
              const link = button('تنزيل', { variant: 'ghost', size: 'sm', icon: 'download', href: downloadUrl(d.id), ariaLabel: `تنزيل ${name}` });
              link.setAttribute('download', d.filename || '');
              return h(
                'li.pc-doc',
                h('span.pc-doc-icon', icon('fileText', { size: 18 })),
                h('div.pc-doc-text', h('span.pc-doc-name', { dir: 'auto', title: name }, name), h('span.pc-doc-meta', `${formatBytes(d.size)} · ${date(d.created_at)}`)),
                link,
              );
            }),
          )
        : emptyState('لا توجد مستندات مرفقة بهذا الملف. تضيف الإدارة مستندات الدعوى عند استلامها.', null, { compact: true, icon: 'paperclip' }),
    });
  }

  function automationCard() {
    return card({
      title: 'ما يتولاه النظام آليًا',
      icon: 'zap',
      body: h(
        'ul.pc-auto-list',
        h('li', icon('calendar', { size: 16 }), h('span', 'تذكير المستفيد/ة بالجلسات التي يلزم حضوره فيها قبل الموعد بثلاثة أيام عبر قناة المؤسسة.')),
        h('li', icon('flag', { size: 16 }), h('span', 'تنبيهك والإدارة قبل حلول المواعيد الإجرائية بثلاثة أيام إن لم يُسجَّل الإجراء.')),
        h('li', icon('shield', { size: 16 }), h('span', 'التواصل مع المستفيد/ة والفواتير من مسؤولية الإدارة؛ لا تُعرض بيانات الاتصال في بوابتك.')),
      ),
    });
  }

  function draw() {
    const active = document.activeElement;
    const owner = active ? Object.values(hosts).find((x) => x !== active && x.contains(active)) : null;
    mount(hosts.header, headerNode());
    mount(hosts.stats, statsNode());
    mount(hosts.events, eventsCard());
    mount(hosts.tasks, tasksCard());
    if (owner && !active.isConnected && owner.isConnected) owner.focus({ preventScroll: true });
  }
  draw();

  return frag(
    hosts.header,
    isClosed()
      ? alertBox('هذا الملف المستمر مغلق — العرض للقراءة فقط.', 'warning', { icon: 'lock' })
      : alertBox(`سجّل كل جلسة وما تم فيها أولًا بأول. تتولى ${orgName()} التواصل مع المستفيد/ة وتذكيره آليًا بالمواعيد التي يلزم حضوره فيها.`, 'info', { icon: 'shield' }),
    hosts.stats,
    h('div.detail-layout', h('div.detail-main', hosts.events, hosts.tasks), h('div.detail-side', infoCard(), docsCard(), automationCard())),
  );
}
