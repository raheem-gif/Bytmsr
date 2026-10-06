// بوابة المحامي — كشف الحساب الشخصي: الاتفاق مع المؤسسة، وقائع الاستحقاق، القيود المالية، والمدفوعات.

import { h, frag } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, money, num, date, count, orgName } from '../../../lib/fmt.js';
import { bidiText } from './matters.js';
import { printButton } from '../../components/print-button.js';
import { pageHeader, card, table, tabs, statCard, statusBadge, codeTag, emptyState, errorState, alertBox, kv, progressBar, ltr } from '../../../lib/ui.js';

const CRUMBS = [{ label: 'بوابة المحامي', href: '#/my' }, { label: 'كشف حسابي' }];

const PERIOD_FMT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** '2026-09' → «سبتمبر 2026» */
function periodLabel(p) {
  const m = String(p || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return p || '—';
  return PERIOD_FMT.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)));
}

const TREATMENT_NOTES = {
  per_case: 'كل استشارة معتمدة من الإدارة تُسجَّل واقعة استحقاق بالمبلغ المتفق عليه.',
  monthly: 'تُسجَّل الاستشارات المعتمدة ضمن المبلغ الشهري الثابت، ويُستحق المبلغ الشهري عن كل شهر.',
  monthly_quota: 'الاستشارات المعتمدة ضمن الحصة الشهرية مشمولة في المبلغ الشهري، وما يزيد عليها يُحسب بسعر الزيادة.',
  package: 'كل استشارة معتمدة تُخصم من رصيد الباقة، وبعد نفادها تُحسب بسعر ما بعد الباقة.',
  pro_bono: 'مساهماتك تطوعية بالكامل، وتُسجَّل قيمتها التقديرية لقياس الأثر فقط ولا تُصرف.',
  csr: 'مساهمات مكتبك ضمن برنامج المسؤولية المجتمعية تُسجَّل بقيمتها التقديرية لقياس الأثر فقط.',
};

/** رسم أعمدة أفقي بسيط للمستحقات الشهرية (القيم مكتوبة بجانب كل عمود). */
function monthlyChart(entries) {
  const byPeriod = new Map();
  for (const e of entries) {
    if (e.status === 'void') continue;
    byPeriod.set(e.period, (byPeriod.get(e.period) || 0) + Number(e.amount || 0));
  }
  const rows = [...byPeriod.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).slice(-6);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return card({
    title: 'المستحقات حسب الشهر',
    subtitle: 'آخر ستة أشهر مسجلة (عدا القيود الملغاة)',
    icon: 'chart',
    body: h(
      'ul.pc-bars',
      { 'aria-label': 'المستحقات حسب الشهر' },
      rows.map(([p, v]) =>
        h(
          'li.pc-bar-row',
          h('span.pc-bar-label', periodLabel(p)),
          h('span.pc-bar-track', { 'aria-hidden': 'true' }, h('span.pc-bar-fill', { style: { width: `${Math.max(2, (v / max) * 100)}%` } })),
          h('span.pc-bar-value', money(v)),
        ),
      ),
    ),
  });
}

export default async function render(ctx) {
  let s;
  try {
    s = await api.get('/lawyer/statement');
  } catch (err) {
    return frag(pageHeader({ title: 'كشف حسابي', breadcrumbs: CRUMBS }), card({ body: errorState(err, () => ctx.reload()) }));
  }
  const ag = s.agreement || {};
  const entries = Array.isArray(s.entries) ? s.entries : [];
  const events = Array.isArray(s.events) ? s.events : [];
  const payouts = Array.isArray(s.payouts) ? s.payouts : [];
  const volunteer = ag.type === 'pro_bono' || ag.type === 'csr';

  const header = pageHeader({
    title: 'كشف حسابي',
    subtitle: `اتفاقك مع ${orgName()}، وما استُحق لك وما صُرف، ومساهماتك التطوعية.`,
    breadcrumbs: CRUMBS,
    actions: ctx.user ? [printButton({ kind: 'statement', id: ctx.user.id, label: 'طباعة كشف الحساب', size: 'md' })] : null,
  });

  // ── الاتفاق ──
  const agreementCard = card({
    title: 'اتفاقك مع المؤسسة',
    icon: 'fileText',
    body: frag(
      h('p.pc-agreement-text', bidiText(s.agreement_text || label('agreement_type', ag.type))),
      kv(
        [
          ['نوع الاتفاق', ag.type ? statusBadge('agreement_type', ag.type, { dot: false }) : null],
          ['متى يُسجَّل الاستحقاق', ag.billable_event ? label('billable_trigger', ag.billable_event) : null],
          ag.type === 'package' && ['حجم الباقة', count(ag.package_size, ['استشارة واحدة', 'استشارتان', 'استشارات', 'استشارة'])],
          volunteer && ag.notional_value != null && ['القيمة التقديرية للمساهمة', h('span', money(ag.notional_value), h('span.muted.small', ' — لقياس الأثر فقط'))],
        ],
        { columns: 1 },
      ),
      TREATMENT_NOTES[ag.type] && h('p.field-hint.mt-2', TREATMENT_NOTES[ag.type]),
    ),
  });

  // ── الأرقام ──
  const statItems = [
    statCard({ label: 'مستحق لم يُصرف بعد', value: money(s.unpaid_balance), icon: 'wallet', tone: Number(s.unpaid_balance) > 0 ? 'warning' : 'neutral', hint: 'قيود بحالة «مستحق»' }),
    statCard({ label: 'إجمالي ما صُرف لك', value: money(s.paid_total), icon: 'checkCircle', tone: 'success', hint: payouts.length ? `عدد الدفعات: ${num(payouts.length)}` : 'لا توجد دفعات بعد' }),
    statCard({ label: 'مساهمات تطوعية', value: num(s.pro_bono_count), icon: 'star', tone: 'accent', hint: Number(s.pro_bono_count) > 0 ? 'تطوعية أو ضمن مسؤولية مجتمعية — شكرًا لك' : 'تطوعية أو ضمن مسؤولية مجتمعية' }),
  ];
  if (s.package_remaining != null) {
    const size = Number(ag.package_size) || 0;
    const remaining = Number(s.package_remaining) || 0;
    statItems.push(
      h(
        'div.stat-card.tone-primary.pc-package',
        h('div.stat-body', h('div.stat-label', 'المتبقي من الباقة'), h('div.stat-value', `${num(remaining)} من ${num(size)}`), progressBar(size - remaining, size || 1, 'primary', { label: 'المستخدم من الباقة', visibleLabel: false })),
      ),
    );
  }
  const stats = h('div.stats-grid.pc-money-stats', statItems);

  // ── الجداول ──
  const eventsTable = () =>
    events.length
      ? table({
          caption: 'وقائع الاستحقاق',
          rows: events,
          columns: [
            { key: 'case', label: 'الملف', render: (e) => codeTag(e.case_code) },
            { key: 'role', label: 'الدور', render: (e) => h('span', bidiText(e.role_label || label('assignment_role', e.role))) },
            { key: 'treatment', label: 'المعاملة', render: (e) => statusBadge('treatment', e.treatment) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (e) => (Number(e.amount) > 0 ? h('span.nowrap', money(e.amount)) : h('span.muted', '—')) },
            { key: 'notional', label: 'القيمة التقديرية', align: 'end', render: (e) => (Number(e.notional) > 0 ? h('span.nowrap', money(e.notional)) : h('span.muted', '—')) },
            { key: 'period', label: 'الفترة', render: (e) => h('span.nowrap', periodLabel(e.period)) },
            { key: 'date', label: 'التاريخ', render: (e) => h('span.nowrap', date(e.created_at)) },
          ],
        })
      : h('div.pc-tab-pad', emptyState('لا توجد وقائع استحقاق بعد. تُسجَّل الواقعة عند اعتماد الإدارة لرأيك (أو عند إغلاق الملف بحسب اتفاقك).', null, { compact: true, icon: 'fileText' }));

  const entriesTable = () =>
    entries.length
      ? table({
          caption: 'القيود المالية',
          rows: entries,
          rowClass: (e) => (e.status === 'void' ? 'is-muted' : null),
          columns: [
            {
              key: 'desc',
              label: 'البيان',
              className: 'col-wide',
              render: (e) => h('div.pc-cell-stack', h('span', e.description || e.kind_label), (e.case_code || e.matter_code) && h('span.row', e.case_code && codeTag(e.case_code), e.matter_code && codeTag(e.matter_code))),
            },
            { key: 'kind', label: 'النوع', render: (e) => e.kind_label || label('ledger_kind', e.kind) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (e) => h('span.nowrap', money(e.amount)) },
            { key: 'status', label: 'الحالة', render: (e) => statusBadge('ledger_status', e.status) },
            { key: 'period', label: 'الفترة', render: (e) => h('span.nowrap', periodLabel(e.period)) },
          ],
        })
      : h('div.pc-tab-pad', emptyState('لا توجد قيود مالية مسجلة لك بعد.', null, { compact: true, icon: 'wallet' }));

  const payoutsTable = () =>
    payouts.length
      ? table({
          caption: 'المدفوعات',
          rows: payouts,
          columns: [
            { key: 'date', label: 'تاريخ الصرف', render: (p) => h('span.nowrap', date(p.paid_at)) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (p) => h('span.nowrap', money(p.amount)) },
            { key: 'method', label: 'الطريقة', render: (p) => p.method || '—' },
            { key: 'ref', label: 'المرجع', render: (p) => (p.reference ? ltr(p.reference) : '—') },
          ],
        })
      : h('div.pc-tab-pad', emptyState('لم تُصرف لك دفعات بعد.', null, { compact: true, icon: 'wallet' }));

  const detailTabs = tabs(
    [
      { key: 'events', label: 'وقائع الاستحقاق', icon: 'fileText', count: events.length, render: eventsTable },
      { key: 'entries', label: 'القيود المالية', icon: 'wallet', count: entries.length, render: entriesTable },
      { key: 'payouts', label: 'المدفوعات', icon: 'checkCircle', count: payouts.length, render: payoutsTable },
    ],
    { active: ['events', 'entries', 'payouts'].includes(ctx.query.tab) ? ctx.query.tab : 'events', className: 'pc-list-tabs' },
  );

  const chart = monthlyChart(entries);

  return frag(
    header,
    stats,
    h('div.pc-statement-top', { class: !chart && 'is-single' }, agreementCard, chart),
    card({ title: 'التفاصيل', subtitle: 'كل ما سُجّل لك في دفاتر المؤسسة', icon: 'wallet', flush: true, body: detailTabs }),
    alertBox(
          volunteer
            ? 'شكرًا لمساهمتك. تُستخدم القيمة التقديرية لقياس أثر العمل التطوعي في تقارير المؤسسة فقط.'
            : `للاستفسار عن أي قيد أو دفعة تواصل مع إدارة ${orgName()}. الأرقام هنا للاطلاع ولا تُعدَّل من بوابتك.`,
          'info',
          { icon: volunteer ? 'star' : 'info' },
    ),
  );
}
