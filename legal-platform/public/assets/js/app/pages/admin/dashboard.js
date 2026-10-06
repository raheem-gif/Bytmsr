// لوحة المتابعة: نظرة يومية على الوارد، والقرارات المعلقة، وطاقة شبكة المحامين، والمواعيد القادمة، وحجم العمل.

import { h } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { duration as v9pDuration, count as v9pCount } from '../../../lib/fmt.js'; // v9 practice
import { label, money, num, relative, dateTime, time, calendarParts, cairoParts, percent } from '../../../lib/fmt.js';
import { pageHeader, card, button, badge, statusBadge, icon, codeTag, statCard, progressBar, emptyState, avatar, richText } from '../../../lib/ui.js';

const CASE_ORDER = ['new', 'assigned', 'in_progress', 'under_review', 'approved', 'answered', 'closed'];
const CASE_TONES = { new: 'info', assigned: 'primary', in_progress: 'accent', under_review: 'warning', approved: 'success', answered: 'success', closed: 'muted' };

const DECISIONS = [
  { key: 'info_requests', label: 'طلبات معلومات من المحامين', icon: 'info' },
  { key: 'client_replies', label: 'ردود عملاء بانتظار المراجعة', icon: 'message' },
  { key: 'counsel_requests', label: 'طلبات مساعدة محامٍ', icon: 'users' },
  { key: 'opinions', label: 'آراء مقدمة بانتظار المراجعة', icon: 'fileText' },
  { key: 'proposed_issues', label: 'مسائل اقترحها المحامون', icon: 'flag' },
  { key: 'approved_unanswered', label: 'ملفات معتمدة لم يُرسل ردها للعميل', icon: 'send' },
  { key: 'identity_conflicts', label: 'رسائل تحتاج تحققًا من الهوية', icon: 'shield' },
];

const MONTHS = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function greeting() {
  const hr = cairoParts(new Date()).hour;
  return hr >= 4 && hr < 12 ? 'صباح الخير' : 'مساء الخير';
}

function periodLabel(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  return m ? MONTHS.format(new Date(Date.UTC(+m[1], +m[2] - 1, 1))) : period || '';
}

function weekLabel(isoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay || '');
  return m ? SHORT.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))) : isoDay;
}

/** مخطط أعمدة مجمعة متاح لقارئات الشاشة: سلسلتان (الطلبات الواردة والملفات المفتوحة) لكل أسبوع. */
function weeklyChart(weeks) {
  const series = [
    { key: 'intakes', label: 'طلبات واردة', cls: 'is-a' },
    { key: 'cases', label: 'ملفات استشارة فُتحت', cls: 'is-b' },
  ];
  const max = Math.max(1, ...weeks.flatMap((w) => series.map((s) => Number(w[s.key]) || 0)));
  const totals = series.map((s) => weeks.reduce((n, w) => n + (Number(w[s.key]) || 0), 0));
  const summary = `آخر 12 أسبوعًا — الطلبات الواردة: ${totals[0]}، ملفات الاستشارة: ${totals[1]}. أعلى قيمة أسبوعية: ${max}.`;
  const legend = h(
    'ul.pa-legend',
    series.map((s, i) => h('li', h('span.pa-swatch', { class: s.cls, 'aria-hidden': 'true' }), `${s.label} (${totals[i]})`)),
  );
  const plot = h(
    'div.pa-chart-plot',
    { role: 'img', 'aria-label': summary },
    weeks.map((w) =>
      h(
        'div.pa-chart-group',
        { title: `أسبوع ${weekLabel(w.week_start)} — طلبات واردة: ${w.intakes}، ملفات: ${w.cases}` },
        h(
          'div.pa-chart-bars',
          series.map((s) => {
            const v = Number(w[s.key]) || 0;
            return h(
              'div.pa-bar-col',
              h('span.pa-bar-val', { 'aria-hidden': 'true' }, v ? String(v) : ''),
              h('span.pa-bar', { class: [s.cls, !v && 'is-zero'], style: v ? { height: `calc((100% - 18px) * ${(v / max).toFixed(4)})` } : null }),
            );
          }),
        ),
        h('span.pa-chart-x', { 'aria-hidden': 'true' }, weekLabel(w.week_start).split(' ').map((p) => h('span', p))),
      ),
    ),
  );
  const tableView = h(
    'details.pa-details',
    h('summary', 'عرض البيانات كجدول'),
    h(
      'div.table-wrap',
      h(
        'table.table',
        h('caption.sr-only', 'الحجم الأسبوعي للطلبات والملفات'),
        h('thead', h('tr', h('th', { scope: 'col' }, 'الأسبوع (يبدأ في)'), series.map((s) => h('th', { scope: 'col', class: 'align-center' }, s.label)), h('th', { scope: 'col', class: 'align-center' }, 'ملفات أُغلقت'))),
        h(
          'tbody',
          weeks.map((w) =>
            h('tr', h('td', weekLabel(w.week_start)), series.map((s) => h('td', { class: 'align-center' }, String(w[s.key] || 0))), h('td', { class: 'align-center' }, String(w.closed || 0))),
          ),
        ),
      ),
    ),
  );
  return h('figure.pa-chart', legend, h('div.pa-chart-scroll', plot), h('figcaption.pa-chart-cap', 'من الأقدم (يمينًا) إلى الأحدث (يسارًا). القيم فوق الأعمدة.'), tableView);
}

export default async function render(ctx) {
  const d = await api.get('/admin/dashboard');
  const intakes = d.intakes || {};
  const pd = d.pending_decisions || {};
  const pendingTotal = Object.values(pd).reduce((s, n) => s + (Number(n) || 0), 0);
  const cap = d.capacity || {};
  const month = d.month || {};
  const user = d.user || ctx.user || {};
  const ai = d.ai || {};

  // ───────────── الترويسة ─────────────
  const header = pageHeader({
    title: `${greeting()}، ${(user.name || '').split(' ')[0] || ''}`.replace(/،\s*$/, ''),
    subtitle: 'هذه نظرة اليوم على ما يصل إلى المؤسسة وما ينتظر قرارك.',
    meta: [
      badge(`الذكاء الاصطناعي: ${ai.label || '—'}`, ai.provider === 'anthropic' ? 'accent' : 'neutral', { icon: 'sparkle', title: ai.model || '' }),
      d.whatsapp_configured
        ? badge('واتساب: متصل', 'success', { icon: 'whatsapp' })
        : badge('واتساب: وضع المحاكاة', 'warning', { icon: 'whatsapp', title: 'لم تُضبط بيانات واتساب للأعمال؛ الرسائل الصادرة تُسجل كإرسال تجريبي (محاكاة)' }),
    ],
    actions: [
      button('بانتظار قرارك', { icon: 'queue', href: '#/queue' }),
      button('صندوق الوارد', { variant: 'primary', icon: 'inbox', href: '#/inbox' }),
    ],
  });

  // ───────────── الأرقام ─────────────
  const stats = h(
    'div.stats-grid.pa-stats',
    statCard({
      label: 'طلبات جديدة',
      value: num(intakes.new),
      hint: `خلال آخر 24 ساعة: ${num(intakes.today)} · قيد الفرز: ${num(intakes.in_review)}`,
      icon: 'inbox',
      tone: 'info',
      href: '#/inbox?status=new',
    }),
    statCard({
      label: 'عاجلة أو عالية الأولوية',
      value: num(intakes.urgent),
      hint: 'طلبات مفتوحة لم يُبت فيها',
      icon: 'flag',
      tone: intakes.urgent ? 'danger' : 'neutral',
      href: '#/inbox?priority=high_or_urgent',
    }),
    statCard({ label: 'ملفات مفتوحة', value: num(d.open_cases), hint: 'ملفات استشارة لم تُغلق', icon: 'briefcase', tone: 'primary', href: '#/cases' }),
    statCard({
      label: 'قرارات بانتظار الإدارة',
      value: num(pendingTotal),
      hint: pendingTotal ? 'طلبات وآراء تنتظر موافقتك' : 'لا شيء معلّق',
      icon: 'queue',
      tone: pendingTotal ? 'warning' : 'success',
      href: '#/queue',
    }),
    statCard({
      label: 'إسنادات متأخرة',
      value: num(d.overdue_assignments),
      hint: 'تجاوزت موعد الرد المحدد',
      icon: 'clock',
      tone: d.overdue_assignments ? 'danger' : 'neutral',
      href: '#/queue?section=overdue_assignments',
    }),
    // v9 practice: زمن أول رد ومستوى الخدمة (طلبات واتساب والموقع، آخر 30 يومًا)
    d.sla &&
      statCard({
        label: 'متوسط زمن أول رد',
        value: d.sla.avg_minutes != null ? v9pDuration(d.sla.avg_minutes * 60000) : '—',
        hint: d.sla.within_sla_rate != null ? `ضمن مهلة ${v9pCount(d.sla.hours, 'hour')}: ${percent(d.sla.within_sla_rate)} (آخر 30 يومًا)` : 'لا ردود خلال آخر 30 يومًا',
        icon: 'message',
        tone: 'info',
        href: '#/impact',
      }),
    d.sla &&
      statCard({
        label: 'متأخرة عن مستوى الخدمة',
        value: num(d.sla.overdue_now),
        hint: d.sla.overdue_now ? `طلبات بلا رد منذ أكثر من ${v9pCount(d.sla.hours, 'hour')}` : `لا توجد طلبات تجاوزت مهلة ${v9pCount(d.sla.hours, 'hour')} دون رد`,
        icon: 'clock',
        tone: d.sla.overdue_now ? 'danger' : 'success',
        href: d.sla.overdue_now && d.sla.overdue[0] ? `#/inbox/${d.sla.overdue[0].id}` : '#/inbox',
      }),
    statCard({
      label: 'فواتير متأخرة',
      value: num(d.overdue_invoices),
      hint: 'مستحقة ولم تُسدد',
      icon: 'wallet',
      tone: d.overdue_invoices ? 'warning' : 'neutral',
      // لا توجد قائمة فواتير مفلترة بالمتأخر بعد، فالبطاقة للعرض فقط بدل رابط لا يعرض ما تعدّه
    }),
    statCard({
      label: 'رسائل فشل إرسالها',
      value: num(d.failed_messages),
      hint: d.failed_messages ? 'تحتاج إعادة محاولة' : 'كل الرسائل وصلت أو سُجلت',
      icon: 'alert',
      tone: d.failed_messages ? 'danger' : 'neutral',
      href: '#/automations?tab=outbox&status=failed',
    }),
    statCard({
      label: 'مواد معرفة بانتظار المراجعة',
      value: num(d.knowledge_pending),
      hint: 'سجلات مجهّلة من ملفات مغلقة',
      icon: 'book',
      tone: d.knowledge_pending ? 'accent' : 'neutral',
      href: '#/knowledge?status=pending_review',
    }),
  );

  // ───────────── بانتظار قرارك ─────────────
  const decisionsCard = card({
    title: 'بانتظار قرارك',
    subtitle: 'لا يصل شيء للعميل أو للمحامي قبل قرار الإدارة',
    icon: 'queue',
    actions: badge(String(pendingTotal), pendingTotal ? 'warning' : 'success'),
    body: h(
      'ul.pa-dlist',
      DECISIONS.map((x) => {
        const n = Number(pd[x.key]) || 0;
        return h(
          'li',
          h(
            'a.pa-dlist-row',
            { href: `#/queue?section=${x.key}`, class: n ? 'is-pending' : 'is-zero' },
            h('span.pa-dlist-icon', icon(x.icon, { size: 16 })),
            h('span.pa-dlist-label', x.label),
            h('span.pa-dlist-n', String(n)),
            icon('chevronLeft', { size: 16, className: 'pa-dlist-go' }),
          ),
        );
      }),
    ),
  });

  // ───────────── الملفات حسب الحالة ─────────────
  const caseCounts = d.cases || {};
  const caseMax = Math.max(1, ...CASE_ORDER.map((k) => Number(caseCounts[k]) || 0));
  const casesCard = card({
    title: 'ملفات الاستشارة حسب الحالة',
    icon: 'briefcase',
    actions: button('كل الملفات', { variant: 'ghost', size: 'sm', href: '#/cases' }),
    body: h(
      'ul.pa-hbars',
      CASE_ORDER.map((k) => {
        const n = Number(caseCounts[k]) || 0;
        return h(
          'li',
          h(
            'a.pa-hbar',
            { href: `#/cases?status=${k}`, class: !n && 'is-zero' },
            h('span.pa-hbar-label', label('case_status', k)),
            h('span.pa-hbar-n', String(n)),
            h('span.pa-hbar-track', { 'aria-hidden': 'true' }, n ? h('span.pa-hbar-fill', { class: `tone-${CASE_TONES[k]}`, style: { width: `${Math.max(2, (n / caseMax) * 100)}%` } }) : null),
          ),
        );
      }),
    ),
  });

  // ───────────── الطاقة القانونية ─────────────
  const capPct = cap.capacity ? (cap.open_assignments || 0) / cap.capacity : 0;
  const capacityCard = card({
    title: 'الطاقة القانونية',
    subtitle: 'الإسنادات المفتوحة مقارنة بالطاقة الاستيعابية لشبكة المحامين',
    icon: 'scale',
    actions: button('شبكة المحامين', { variant: 'ghost', size: 'sm', href: '#/lawyers' }),
    body: h(
      'div.stack',
      progressBar(cap.open_assignments || 0, cap.capacity || 0, capPct >= 0.85 ? 'danger' : capPct >= 0.6 ? 'warning' : 'success', {
        label: `الإشغال ${percent(capPct)} — الإسنادات المفتوحة: ${num(cap.open_assignments)} من طاقة ${num(cap.capacity)}`,
      }),
      h(
        'div.pa-mini-stats',
        h('div', h('strong', num(cap.active)), h('span', 'محامٍ نشط')),
        h('div', { class: cap.overdue ? 'is-danger' : '' }, h('strong', num(cap.overdue)), h('span', 'إسنادات متأخرة')),
        h('div', h('strong', num(cap.completed_in_period)), h('span', 'أُنجزت هذا الشهر')),
        h('div', h('strong', num(cap.pro_bono_in_period)), h('span', 'استشارات تطوعية')),
      ),
      (cap.top_loaded || []).length
        ? h(
            'div',
            h('h3.pa-mini-h', 'الأعلى تحميلًا'),
            h(
              'ul.pa-load',
              cap.top_loaded.map((l) => {
                const ratio = l.capacity ? l.open / l.capacity : 0;
                return h(
                  'li',
                  h(
                    'a.pa-load-row',
                    { href: `#/lawyers/${l.id}` },
                    avatar(l.name, { size: 'sm' }),
                    h(
                      'span.pa-load-main',
                      h('span.pa-load-head', h('span.pa-load-name', l.name), h('span.pa-load-n.ltr', `${l.open} / ${l.capacity}`)),
                      progressBar(l.open, l.capacity || 0, ratio >= 0.85 ? 'danger' : ratio >= 0.6 ? 'warning' : 'primary', {
                        label: `${l.name}: الإسنادات المفتوحة ${l.open} من ${l.capacity}`,
                        visibleLabel: false,
                      }),
                    ),
                    l.overdue ? badge(`متأخرة: ${l.overdue}`, 'danger', { icon: 'clock', title: 'إسنادات تجاوزت الموعد المطلوب' }) : null,
                  ),
                );
              }),
            ),
          )
        : null,
    ),
  });

  // ───────────── المواعيد القادمة ─────────────
  const events = d.upcoming_events || [];
  const eventsCard = card({
    title: 'مواعيد الأيام السبعة القادمة',
    subtitle: 'تذكير العميل آليًا قبل 3 أيام من أي موعد يلزم حضوره',
    icon: 'calendar',
    body: events.length
      ? h(
          'ul.pa-events',
          events.map((e) => {
            const p = calendarParts(e.starts_at);
            return h(
              'li',
              h(
                'a.pa-event',
                { href: `#/matters/${e.matter_id}` },
                h('span.pa-event-date', { 'aria-hidden': 'true' }, h('strong', p.day), h('span', p.month)),
                h(
                  'span.pa-event-main',
                  h('span.pa-event-title', e.title),
                  h(
                    'span.pa-event-meta',
                    statusBadge('event_kind', e.kind, { dot: false }),
                    codeTag(e.matter_code),
                    h('time.small.muted', { datetime: e.starts_at, title: dateTime(e.starts_at) }, `${p.weekday} ${time(e.starts_at)} · ${relative(e.starts_at)}`),
                  ),
                  e.client_attendance_required ? badge('يلزم حضور العميل', 'warning', { icon: 'user' }) : null,
                ),
              ),
            );
          }),
        )
      : emptyState('لا توجد جلسات أو مواعيد خلال الأيام السبعة القادمة', null, { compact: true, icon: 'calendar' }),
  });

  // ───────────── تنبيهات الحالات المشابهة ─────────────
  const alerts = d.similar_alerts || [];
  const similarCard = card({
    title: 'تنبيهات الحالات المشابهة',
    subtitle: 'طلبات مفتوحة تشبه حالات تعاملت معها المؤسسة من قبل',
    icon: 'sparkle',
    body: alerts.length
      ? h(
          'ul.pa-alerts',
          alerts.map((a) =>
            h(
              'li',
              h(
                'a.pa-alert-link',
                { href: `#/inbox/${a.intake_id}` },
                codeTag(a.code),
                h('span.pa-alert-text', richText(a.summary)),
                h('time.small.muted', { datetime: a.created_at, title: dateTime(a.created_at) }, relative(a.created_at)),
              ),
            ),
          ),
        )
      : emptyState('لا توجد تنبيهات تشابه للطلبات المفتوحة حاليًا', null, { compact: true, icon: 'sparkle' }),
  });

  // ───────────── هذا الشهر ─────────────
  const monthCard = card({
    title: `هذا الشهر — ${periodLabel(month.period)}`,
    icon: 'chart',
    body: h(
      'div.pa-month',
      h('div', h('span', 'ملفات فُتحت'), h('strong', num(month.cases_opened))),
      h('div', h('span', 'ملفات أُغلقت'), h('strong', num(month.cases_closed))),
      h('div', h('span', 'تكلفة المحامين'), h('strong', money(month.lawyer_cost))),
      h('div', h('span', 'استشارات تطوعية'), h('strong', num(month.pro_bono))),
    ),
  });

  const weeklyCard = card({
    title: 'الحجم الأسبوعي',
    subtitle: 'الطلبات الواردة من كل القنوات مقابل ما تحول منها إلى ملفات استشارة',
    icon: 'chart',
    actions: button('التحليلات', { variant: 'ghost', size: 'sm', href: '#/analytics' }),
    body: weeklyChart(d.weekly || []),
  });

  const page = h(
    'div.pa-page.pa-page-dashboard',
    header,
    stats,
    h('div.pa-dash-grid', decisionsCard, capacityCard, eventsCard, casesCard, similarCard, monthCard),
    weeklyCard,
  );
  // على الشاشات الضيقة يُمرَّر المخطط أفقيًا: نبدأ بأحدث الأسابيع (يسار المخطط)
  requestAnimationFrame(() => {
    const sc = page.querySelector('.pa-chart-scroll');
    if (sc && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = -(sc.scrollWidth - sc.clientWidth);
  });
  return page;
}
