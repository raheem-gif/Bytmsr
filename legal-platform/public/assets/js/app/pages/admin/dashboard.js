// لوحة المتابعة: نظرة يومية على الوارد، والقرارات المعلقة، وطاقة شبكة المحامين، والمواعيد القادمة، وحجم العمل.

import { h } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { statDuration, count as v9pCount } from '../../../lib/fmt.js'; // v9 practice
import { label, money, num, relative, dateTime, time, calendarParts, cairoParts, percent } from '../../../lib/fmt.js';
import { pageHeader, card, button, badge, statusBadge, statusTone, icon, codeTag, statCard, progressBar, emptyState, avatar, richText } from '../../../lib/ui.js';
import { QUEUE_LABELS } from '../../labels.js';
import { segLabel } from '../../components/segment-ui.js'; // v11 segment-staff (ST-5)

const CASE_ORDER = ['new', 'assigned', 'in_progress', 'under_review', 'approved', 'answered', 'closed'];
// v11 gate fix (K1): أشرطة الحالات بألوان شارات الحالة نفسها (STATUS_TONES) — الأخضر والذهبي لنوع الخدمة وحده
const caseTone = (k) => statusTone('case_status', k);

// المسميات من QUEUE_LABELS: نفس اسم القسم هنا وفي صفحة «بانتظار قرار الإدارة»
// v12 gate (TA-05): رمز لكل قسم (كانت السبعة DSH-34)
const DECISIONS = [
  { key: 'info_requests', icon: 'info', tag: 'DSH-34' },
  { key: 'client_replies', icon: 'message', tag: 'DSH-63' },
  { key: 'counsel_requests', icon: 'users', tag: 'DSH-64' },
  { key: 'opinions', icon: 'fileText', tag: 'DSH-65' },
  { key: 'proposed_issues', icon: 'flag', tag: 'DSH-66' },
  { key: 'approved_unanswered', icon: 'send', tag: 'DSH-67' },
  { key: 'identity_conflicts', icon: 'shield', tag: 'DSH-68' },
].map((d) => ({ ...d, label: QUEUE_LABELS[d.key] }));
// v12 gate (TA-05): رمز لكل حالة في «ملفات الاستشارة حسب الحالة» (كانت السبعة DSH-38) ولكل صف في «حسب نوع الطلب» (DSH-03 ×4)
const CASE_ROW_TAGS = { new: 'DSH-38', assigned: 'DSH-69', in_progress: 'DSH-70', under_review: 'DSH-71', approved: 'DSH-72', answered: 'DSH-73', closed: 'DSH-74' };
const LINE_ROW_TAGS = { consultation: 'DSH-03', litigation: 'DSH-75', company: 'DSH-76', none: 'DSH-77' };

const MONTHS = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** شارة واتساب: «متصل» فقط بعد اختبار اتصال ناجح لبيانات الاعتماد الحالية (الحالة يحسبها الخادم) */
function whatsappBadge(d) {
  const wa = d.whatsapp || { state: d.whatsapp_configured ? 'untested' : 'simulation' };
  if (wa.state === 'connected') return badge('واتساب: متصل', 'success', { icon: 'whatsapp' });
  if (wa.state === 'failed') return badge('واتساب: فشل آخر اختبار للاتصال', 'danger', { icon: 'whatsapp', title: 'راجع بيانات الاعتماد في صفحة التكاملات ثم أعد «اختبار الاتصال»' });
  if (wa.state === 'untested') return badge('واتساب: مضبوط (لم يُختبر)', 'warning', { icon: 'whatsapp', title: 'اضغط «اختبار الاتصال» في صفحة التكاملات للتأكد من صلاحية بيانات الاعتماد' });
  return badge('واتساب: وضع المحاكاة', 'warning', { icon: 'whatsapp', title: 'لم تُضبط بيانات واتساب للأعمال؛ الرسائل الصادرة تُسجل كإرسال تجريبي (محاكاة)' });
}

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
    { tag: 'DSH-05' }, h('summary', { tag: 'DSH-06' }, 'عرض البيانات كجدول'),
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

/**
 * v10 b2b-staff (STF-10، U10-S02، P1): شريط «خدمة الشركات» من GET /api/admin/b2b/overview — كل رقم يفتح القائمة مفلترة.
 * لا «مطالبات متأخرة» (الفواتير مؤجلة، L-31)؛ «الاشتراكات الشهرية» لمدير النظام فقط. يختفي تمامًا حين لا توجد شركات.
 */
function companyStrip(user) {
  const host = h('section.cd-dash-strip', { hidden: true, 'aria-label': 'خدمة الشركات', tag: 'DSH-07' });
  api
    .get('/admin/b2b/overview', null, { background: true })
    .then((o) => {
      if (!o || !Number(o.companies?.total)) return;
      const q = o.queue || {};
      const sla = o.sla || {};
      host.append(
        card({
          title: 'خدمة الشركات',
          icon: 'building',
          actions: button('طلبات الشركات', { variant: 'ghost', size: 'sm', href: '#/company-requests', tag: 'DSH-08' }),
          body: h(
            'div.stats-grid.cd-dash-stats',
            statCard({ label: 'بانتظار الفرز', value: num(q.submitted), icon: 'inboxStack', tone: q.submitted ? 'info' : 'neutral', href: '#/company-requests?status=submitted', tag: 'DSH-09' }),
            statCard({ label: 'يقترب موعدها', value: num(sla.at_risk), icon: 'clock', tone: sla.at_risk ? 'warning' : 'neutral', href: '#/company-requests?sla=at_risk', tag: 'DSH-10' }),
            statCard({ label: 'متأخرة', value: num(sla.late), icon: 'alert', tone: sla.late ? 'danger' : 'neutral', href: '#/company-requests?sla=late', tag: 'DSH-11' }),
            statCard({ label: 'بانتظار الشركات', value: num(q.awaiting_company), icon: 'building', tone: 'neutral', href: '#/company-requests?status=awaiting_company', tag: 'DSH-12' }),
            statCard({ label: 'تجديدات خلال 30 يومًا', value: num(o.renewals_30d), icon: 'calendarClock', tone: o.renewals_30d ? 'accent' : 'neutral', href: '#/companies', tag: 'DSH-13' }),
            user.role === 'admin' && o.mrr_minor != null ? statCard({ label: 'الاشتراكات الشهرية', value: money(Number(o.mrr_minor) / 100), icon: 'wallet', tone: 'primary', href: '#/companies', tag: 'DSH-14' }) : null,
          ),
          titleTag: 'DSH-15',
          tag: 'DSH-16',
        }),
      );
      host.hidden = false;
    })
    .catch(() => {});
  return host;
}

/**
 * v11 segment-staff (ST-5، S11-37 + r2 S9/S10): «حسب نوع الخدمة» — صف «خيري» وصف «أفراد وشركات» (جديد اليوم · مفتوح، وإيرادات
 * الأفراد لمدير النظام)، ثم صفوف تنبيه حين توجد: «غير محدد» و«أفراد بلا واتساب مؤكد». قائمة مجمّعة واحدة بدل بطاقات بحدود؛
 * الذهبي = خيري والأخضر = أفراد وشركات (نفس لون الرقاقة في كل مكان)، والبرتقالي للتنبيه وحده.
 */
export function segmentStrip(seg) {
  if (!seg || !seg.charity || !seg.paid) return null;
  const c = seg.charity;
  const p = seg.paid;
  const row = ({ href, ico, tone, title, sub, extra, data, tag }) =>
    h(
      'li',
      h(
        'a.g-row.pa-seg-row',
        { href, dataset: data, tag },
        h('span.g-ico', { class: tone, 'aria-hidden': 'true' }, icon(ico, { className: data.seg ? 'seg-glyph' : null })),
        h('span.g-main', h('span.g-title', title), sub ? h('span.g-sub.pa-seg-line', sub) : null, extra || null),
        h('span.g-trail', icon('chevronLeft', { size: 16 })),
      ),
    );
  const line = (d) => ['جديد اليوم ', h('strong', num(d.new_today)), ' · مفتوح ', h('strong', num(d.open))];
  const rows = [
    // v12 gate (TA-05): رمز لكل صف (كانت الأربعة DSH-17)
    row({ href: '#/inbox?segment=charity', ico: 'heart', tone: 'is-gold', title: segLabel('segment', 'charity'), sub: line(c), data: { seg: 'charity' }, tag: 'DSH-17' }),
    row({
      href: '#/inbox?segment=paid',
      ico: 'briefcase',
      tone: null,
      title: segLabel('segment', 'paid'),
      sub: line(p),
      // P1 (S11-33): لمدير النظام فقط (الخادم لا يرسل الرقم لغيره)
      extra: p.revenue_month != null ? h('span.g-sub.pa-seg-rev', 'إيرادات الأفراد هذا الشهر: ', h('strong', money(p.revenue_month))) : null,
      data: { seg: 'paid' },
      tag: 'DSH-78',
    }),
  ];
  if (Number(seg.unset_open) > 0)
    rows.push(row({ href: '#/inbox?segment=unset', ico: 'helpCircle', tone: 'is-warn', title: `طلبات نوع خدمتها غير محدد: ${num(seg.unset_open)}`, sub: 'اختاروا النوع من صفحة كل طلب.', data: { alert: 'unset' }, tag: 'DSH-79' }));
  // r2 S9: طلبات أفراد من الموقع بلا واتساب مؤكد — قائمة المكالمات
  if (Number(p.unconfirmed_wa) > 0)
    rows.push(row({ href: '#/inbox?segment=paid&channel=website', ico: 'phone', tone: 'is-warn', title: `طلبات أفراد بلا واتساب مؤكد: ${num(p.unconfirmed_wa)}`, sub: 'لم يؤكدوا رقمهم على واتساب — اتصلوا بهم.', data: { alert: 'unconfirmed_wa' }, tag: 'DSH-80' }));
  const moved = Number(seg.ineligible_overrides) || 0;
  return h(
    'section.g-section.pa-seg-strip',
    { 'aria-labelledby': 'pa-seg-strip-h', tag: 'DSH-18' },
    h('div.g-head', h('h2#pa-seg-strip-h', { tag: 'DSH-19' }, 'حسب نوع الخدمة')),
    h('ul.g-list.has-icons', rows),
    // P1 (S11-37/C-8): طلبات وملفات حُوّلت من «خيري» إلى «أفراد وشركات» هذا الشهر
    moved ? h('p.g-foot', `حُوّلت من خيري إلى أفراد وشركات هذا الشهر: ${num(moved)}`) : null,
  );
}

/**
 * v12 staff-lines (SL-2، E12-53): «حسب نوع الطلب» — استشارة · دعوى قضائية · شركات · لم يُحدَّد النوع، لكل صف «جديد اليوم» و«مفتوح»
 * ورابط إلى صندوق الوارد مصفّى بالنوع (?line=). كلمات محايدة بلا ألوان نوع الخدمة ولا أيقونات.
 */
export function lineStrip(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  // tags:skip القسم يُعرف بعنوانه DSH-01 وقائمته DSH-02، وكل صف برمزه (LINE_ROW_TAGS)
  return h(
    'section.g-section.pa-line-strip',
    { 'aria-labelledby': 'pa-line-strip-h' },
    h('div.g-head', h('h2#pa-line-strip-h', { tag: 'DSH-01' }, 'حسب نوع الطلب')),
    h(
      'ul.g-list',
      { tag: 'DSH-02' },
      lines.map((l) =>
        h(
          'li',
          h(
            'a.g-row.pa-line-row',
            // review (F1): الأعداد لطلبات «أفراد وشركات» وحدها، فالرابط يفتح صندوق الوارد على النطاق نفسه (لا على آخر نوع خدمة محفوظ)
            // review-2 (T12-78): صف النوع رابط أساسي برمز واحد لموضعه (DSH-03؛ كلماته من LABELS.service_line)
            { href: `#/inbox?segment=paid&line=${encodeURIComponent(l.line)}`, dataset: { line: l.line }, tag: LINE_ROW_TAGS[l.line] },
            h(
              'span.g-main',
              h('span.g-title', l.label),
              h('span.g-sub', 'جديد اليوم ', h('strong', num(l.new_today)), ' · مفتوح ', h('strong', num(l.open))),
            ),
            h('span.g-trail', icon('chevronLeft', { size: 16 })),
          ),
        ),
      ),
    ),
  );
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
  // v11 segment-staff (ST-5، r2 S10): الأرقام التي ما زالت تجمع الجانبين تحمل «يشمل الخيري والأفراد»
  const scope = d.cases_scope_label || null;

  // ───────────── الترويسة ─────────────
  const header = pageHeader({
    title: `${greeting()}، ${(user.name || '').split(' ')[0] || ''}`.replace(/،\s*$/, ''),
    subtitle: 'هذه نظرة اليوم على ما يصلنا وما ينتظر قرارك.', // v12 gate (V-08): بلا «المؤسسة» (المكتب يخدم الأفراد والشركات)
    meta: [
      badge(`الذكاء الاصطناعي: ${ai.label || '—'}`, ai.provider === 'anthropic' ? 'info' : 'neutral', { icon: 'sparkle', title: ai.model || '' }),
      whatsappBadge(d),
    ],
    actions: [
      button('بانتظار قرارك', { icon: 'queue', href: '#/queue', tag: 'DSH-20' }),
      button('صندوق الوارد', { variant: 'primary', icon: 'inbox', href: '#/inbox', tag: 'DSH-21' }),
    ],
    titleTag: 'DSH-22',
    tag: 'DSH-23',
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
      tag: 'DSH-24',
    }),
    statCard({
      label: 'عاجلة أو عالية الأولوية',
      value: num(intakes.urgent),
      hint: 'طلبات مفتوحة لم يُبت فيها',
      icon: 'flag',
      tone: intakes.urgent ? 'danger' : 'neutral',
      href: '#/inbox?priority=high_or_urgent',
      tag: 'DSH-25',
    }),
    statCard({ label: 'ملفات مفتوحة', value: num(d.open_cases), hint: scope ? `ملفات استشارة لم تُغلق · ${scope}` : 'ملفات استشارة لم تُغلق', icon: 'briefcase', tone: 'primary', href: '#/cases', tag: 'DSH-26' }),
    statCard({
      label: 'قرارات بانتظار الإدارة',
      value: num(pendingTotal),
      hint: pendingTotal ? 'طلبات وآراء تنتظر موافقتك' : 'لا شيء معلّق',
      icon: 'queue',
      tone: pendingTotal ? 'warning' : 'success',
      href: '#/queue',
      tag: 'DSH-27',
    }),
    statCard({
      label: 'إسنادات متأخرة',
      value: num(d.overdue_assignments),
      hint: 'تجاوزت موعد الرد المحدد',
      icon: 'clock',
      tone: d.overdue_assignments ? 'danger' : 'neutral',
      href: '#/queue?section=overdue_assignments',
      tag: 'DSH-28',
    }),
    // v9 practice: زمن أول رد ومستوى الخدمة (طلبات واتساب والموقع، آخر 30 يومًا)
    d.sla &&
      statCard({
        label: 'متوسط زمن أول رد',
        value: d.sla.avg_minutes != null ? statDuration(d.sla.avg_minutes * 60000) : '—',
        // الفترة صريحة في التلميح: تقرير الأثر يحسب المؤشر نفسه لفترة يختارها المستخدم فلا تُقارن القيمتان دون انتباه
        hint: d.sla.within_sla_rate != null ? `آخر 30 يومًا — ضمن مهلة ${v9pCount(d.sla.hours, 'hour')}: ${percent(d.sla.within_sla_rate)}` : 'لا ردود خلال آخر 30 يومًا',
        icon: 'message',
        tone: 'info',
        href: '#/impact',
        tag: 'DSH-29',
      }),
    d.sla &&
      statCard({
        label: 'متأخرة عن مستوى الخدمة',
        value: num(d.sla.overdue_now),
        hint: d.sla.overdue_now ? `طلبات بلا رد منذ أكثر من ${v9pCount(d.sla.hours, 'hour')}` : `لا توجد طلبات تجاوزت مهلة ${v9pCount(d.sla.hours, 'hour')} دون رد`,
        icon: 'clock',
        tone: d.sla.overdue_now ? 'danger' : 'success',
        href: d.sla.overdue_now && d.sla.overdue[0] ? `#/inbox/${d.sla.overdue[0].id}` : '#/inbox',
        tag: 'DSH-30',
      }),
    statCard({
      label: 'فواتير متأخرة',
      value: num(d.overdue_invoices),
      hint: 'مستحقة ولم تُسدد',
      icon: 'wallet',
      tone: d.overdue_invoices ? 'warning' : 'neutral',
      // لا توجد قائمة فواتير مفلترة بالمتأخر بعد، فالبطاقة للعرض فقط بدل رابط لا يعرض ما تعدّه,
      tag: 'DSH-31'
    }),
    statCard({
      label: 'رسائل فشل إرسالها',
      value: num(d.failed_messages),
      hint: d.failed_messages ? 'تحتاج إعادة محاولة' : 'كل الرسائل وصلت أو سُجلت',
      icon: 'alert',
      tone: d.failed_messages ? 'danger' : 'neutral',
      href: '#/automations?tab=outbox&status=failed',
      tag: 'DSH-32',
    }),
    statCard({
      label: 'مواد معرفة بانتظار المراجعة',
      value: num(d.knowledge_pending),
      hint: 'سجلات مجهّلة من ملفات مغلقة',
      icon: 'book',
      tone: d.knowledge_pending ? 'accent' : 'neutral',
      href: '#/knowledge?status=pending_review',
      tag: 'DSH-33',
    }),
  );

  // ───────────── بانتظار قرارك ─────────────
  const decisionsCard = card({
    title: 'بانتظار قرارك',
    subtitle: 'لا يصل شيء لصاحب الطلب أو للمحامي قبل قرار الإدارة', // v12 gate (V-08)
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
            { href: `#/queue?section=${x.key}`, class: n ? 'is-pending' : 'is-zero', tag: x.tag },
            h('span.pa-dlist-icon', icon(x.icon, { size: 16 })),
            h('span.pa-dlist-label', x.label),
            h('span.pa-dlist-n', String(n)),
            icon('chevronLeft', { size: 16, className: 'pa-dlist-go' }),
          ),
        );
      }),
    ),
    titleTag: 'DSH-35',
    tag: 'DSH-36',
  });

  // ───────────── الملفات حسب الحالة ─────────────
  const caseCounts = d.cases || {};
  const caseMax = Math.max(1, ...CASE_ORDER.map((k) => Number(caseCounts[k]) || 0));
  const casesCard = card({
    title: 'ملفات الاستشارة حسب الحالة',
    subtitle: scope, // v11 segment-staff (ST-5)
    icon: 'briefcase',
    actions: button('كل الملفات', { variant: 'ghost', size: 'sm', href: '#/cases', tag: 'DSH-37' }),
    body: h(
      'ul.pa-hbars',
      CASE_ORDER.map((k) => {
        const n = Number(caseCounts[k]) || 0;
        return h(
          'li',
          h(
            'a.pa-hbar',
            { href: `#/cases?status=${k}`, class: !n && 'is-zero', tag: CASE_ROW_TAGS[k] },
            h('span.pa-hbar-label', label('case_status', k)),
            h('span.pa-hbar-n', String(n)),
            h('span.pa-hbar-track', { 'aria-hidden': 'true' }, n ? h('span.pa-hbar-fill', { class: `tone-${caseTone(k)}`, style: { width: `${Math.max(2, (n / caseMax) * 100)}%` } }) : null),
          ),
        );
      }),
    ),
    titleTag: 'DSH-39',
    tag: 'DSH-40',
  });

  // ───────────── الطاقة القانونية ─────────────
  const capPct = cap.capacity ? (cap.open_assignments || 0) / cap.capacity : 0;
  const capacityCard = card({
    title: 'الطاقة القانونية',
    subtitle: 'الإسنادات المفتوحة مقارنة بالطاقة الاستيعابية لشبكة المحامين',
    icon: 'scale',
    actions: button('شبكة المحامين', { variant: 'ghost', size: 'sm', href: '#/lawyers', tag: 'DSH-41' }),
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
            h('h3.pa-mini-h', { tag: 'DSH-42' }, 'الأعلى تحميلًا'),
            h(
              'ul.pa-load',
              cap.top_loaded.map((l) => {
                const ratio = l.capacity ? l.open / l.capacity : 0;
                return h(
                  'li',
                  h(
                    'a.pa-load-row',
                    { href: `#/lawyers/${l.id}`, tag: 'DSH-43' },
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
    titleTag: 'DSH-44',
    tag: 'DSH-45',
  });

  // ───────────── المواعيد القادمة ─────────────
  const events = d.upcoming_events || [];
  const eventsCard = card({
    title: 'مواعيد الأيام السبعة القادمة',
    subtitle: 'تذكير صاحب الطلب آليًا قبل 3 أيام من أي موعد يلزم حضوره',
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
                { href: `#/matters/${e.matter_id}`, tag: 'DSH-46' },
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
                  e.client_attendance_required ? badge('يلزم حضور صاحب الطلب', 'warning', { icon: 'user' }) : null,
                ),
              ),
            );
          }),
        )
      : emptyState('لا توجد جلسات أو مواعيد خلال الأيام السبعة القادمة', null, { compact: true, icon: 'calendar', tag: 'DSH-47' }),
      titleTag: 'DSH-48',
      tag: 'DSH-49',
  });

  // ───────────── تنبيهات الحالات المشابهة ─────────────
  const alerts = d.similar_alerts || [];
  const similarCard = card({
    title: 'تنبيهات الحالات المشابهة',
    subtitle: 'طلبات مفتوحة تشبه حالات تعاملنا معها من قبل',
    icon: 'sparkle',
    body: alerts.length
      ? h(
          'ul.pa-alerts',
          alerts.map((a) =>
            h(
              'li',
              h(
                'a.pa-alert-link',
                { href: `#/inbox/${a.intake_id}`, tag: 'DSH-50' },
                codeTag(a.code),
                h('span.pa-alert-text', richText(a.summary)),
                h('time.small.muted', { datetime: a.created_at, title: dateTime(a.created_at) }, relative(a.created_at)),
              ),
            ),
          ),
        )
      : emptyState('لا توجد تنبيهات تشابه للطلبات المفتوحة حاليًا', null, { compact: true, icon: 'sparkle', tag: 'DSH-51' }),
      titleTag: 'DSH-52',
      tag: 'DSH-53',
  });

  // ───────────── هذا الشهر ─────────────
  // v11 segment-staff (ST-5، r2 S10): «الخيري» (أرقام البرنامج، كما يحسبها الخادم للخيري وحده) ثم «الأفراد والشركات» من month.paid
  const mp = month.paid || null;
  const charityMonth = h(
    'div.pa-month',
    h('div', h('span', 'ملفات فُتحت'), h('strong', num(month.cases_opened))),
    h('div', h('span', 'ملفات أُغلقت'), h('strong', num(month.cases_closed))),
    h('div', h('span', 'تكلفة المحامين'), h('strong', money(month.lawyer_cost))),
    h('div', h('span', 'استشارات تطوعية'), h('strong', num(month.pro_bono))),
  );
  const monthCard = card({
    title: `هذا الشهر — ${periodLabel(month.period)}`,
    icon: 'chart',
    body: mp
      ? h(
          'div.stack.pa-month-split',
          h('section', { 'aria-label': 'الخيري', tag: 'DSH-54' }, h('h3.pa-mini-h', { tag: 'DSH-55' }, 'الخيري'), charityMonth),
          h(
            'section',
            { 'aria-label': 'الأفراد والشركات', tag: 'DSH-56' },
            h('h3.pa-mini-h', { tag: 'DSH-57' }, 'الأفراد والشركات'),
            h(
              'div.pa-month',
              { dataset: { seg: 'paid' } },
              h('div', h('span', 'ملفات فُتحت'), h('strong', num(mp.cases_opened))),
              h('div', h('span', 'ملفات أُغلقت'), h('strong', num(mp.cases_closed))),
              h('div', h('span', 'تكلفة المحامين'), h('strong', money(mp.lawyer_cost))),
            ),
            h('p.small.muted', 'الشركات المتعاقدة في «خدمة الشركات».'),
          ),
        )
      : charityMonth,
      titleTag: 'DSH-58',
      tag: 'DSH-59',
  });

  const weeklyCard = card({
    title: 'الحجم الأسبوعي',
    subtitle: scope ? `الطلبات الواردة من كل القنوات مقابل ما تحول منها إلى ملفات استشارة — ${scope}` : 'الطلبات الواردة من كل القنوات مقابل ما تحول منها إلى ملفات استشارة',
    icon: 'chart',
    actions: button('التحليلات', { variant: 'ghost', size: 'sm', href: '#/analytics', tag: 'DSH-60' }),
    body: weeklyChart(d.weekly || []),
    titleTag: 'DSH-61',
    tag: 'DSH-62',
  });

  const page = h(
    'div.pa-page.pa-page-dashboard',
    header,
    segmentStrip(d.segments), // v11 segment-staff (ST-5): «حسب نوع الخدمة» — قبل الأرقام لأن صفوف التنبيه تحتاج قرارًا اليوم
    lineStrip(d.lines), // v12 staff-lines (SL-2): «حسب نوع الطلب»
    stats,
    companyStrip(user), // v10 b2b-staff (STF-10، U10-S02): «خدمة الشركات» — مخفي إن لم توجد شركات
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
