// ملف المحامي: البيانات والاتفاق ومؤشرات الأداء والملفات وكشف الحساب، مع إجراءات مدير النظام.

import { h, frag } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, num, count, percent, money, date, relative, dateTime } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  tabs,
  kv,
  chips,
  badge,
  statusBadge,
  dueBadge,
  progressBar,
  button,
  asyncButton,
  alertBox,
  formDialog,
  confirmDialog,
  toast,
  icon,
  avatar,
  codeTag,
  ltr,
  richText,
} from '../../../lib/ui.js';
import {
  isPeriod,
  currentPeriod,
  periodLabel,
  periodSelect,
  replaceQuery,
  qualityText,
  hoursText,
  openLawyerDialog,
  activeBadge,
  describeAgreement,
  PAID_TYPES,
} from './lawyers.js';
import { accountSecurityCard } from '../../components/account-admin.js';
import { B2B_SKILLS } from '../../../lib/company-catalog.js'; // v10 b2b-staff (STF-11، L-56)

/** v10 b2b-staff (L-56): تلميح «الاسم بالإنجليزية» — يفحص به الخادم التسليمات والملفات قبل وصولها للشركات */
export const NAME_LATIN_HINT = 'يُستخدم للتأكد من عدم ظهور اسمك في ملفات الشركات وتسليماتها.';

const ACTIVE_ASSIGNMENT = ['assigned', 'in_progress', 'returned'];
// v11 segment-staff (ST-6، L11-24): b2b_rate هو سعر كل عمل مدفوع — طلبات الشركات وملفات الأفراد بأتعاب
export const PAID_RATE_LABEL = 'سعر العمل المدفوع (أفراد وشركات)';

/** مبلغ لبطاقة رقمية: الرقم كبير والعملة أصغر. */
function moneyValue(n) {
  return h('span.nowrap', num(Number(n) || 0), h('span.pd-unit', ' ج.م'));
}

function timeCell(iso) {
  return iso ? h('time.nowrap', { datetime: iso, title: dateTime(iso) }, date(iso)) : h('span.muted', '—');
}

function amountCell(n) {
  const v = Number(n) || 0;
  return h('span.nowrap.pd-amount', { class: v < 0 ? 'pd-text-danger' : null }, money(v));
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const isAdmin = ctx.user?.role === 'admin';
  const period = isPeriod(ctx.query.period) ? ctx.query.period : currentPeriod();
  const data = await api.get(`/admin/lawyers/${encodeURIComponent(id)}`, { period });
  const l = data.lawyer;
  const m = l.metrics || {};
  const ag = l.agreement || {};
  const pl = periodLabel(period);
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const matters = Array.isArray(data.matters) ? data.matters : [];
  const st = data.statement || {};
  ctx.setTitle(l.display_name);

  // ── الإجراءات (مدير النظام) ──
  const actions = [];
  if (isAdmin) {
    actions.push(
      button('تعديل البيانات والاتفاق', {
        variant: 'primary',
        icon: 'edit',
        onClick: () =>
          openLawyerDialog({
            lawyer: l,
            onSaved: () => {
              toast('تم حفظ بيانات المحامي واتفاقه', 'success');
              ctx.reload();
            },
          }),
      }),
    );
    if (ag.type === 'package') {
      actions.push(
        button('تجديد الباقة', {
          icon: 'refresh',
          onClick: async () => {
            const res = await formDialog({
              title: 'تجديد باقة المحامي',
              intro: `يُضاف عدد الاستشارات إلى الرصيد الحالي (المتبقي الآن ${count(l.package_remaining || 0, 'consultation')})، وتُسجَّل قيمة الباقة كمستحق للمحامي في دفتر المحاسبة.`,
              submitLabel: 'تجديد الباقة',
              fields: [
                { name: 'size', label: 'عدد استشارات الباقة الجديدة', type: 'number', integer: true, required: true, min: 1, max: 100000, suffix: 'استشارة' },
                { name: 'price', label: 'قيمة الباقة', type: 'money', required: true, min: 0 },
              ],
              values: { size: ag.package_size, price: ag.package_price },
              onSubmit: (v) => api.post(`/admin/lawyers/${encodeURIComponent(l.id)}/package`, { size: v.size, price: v.price }),
            });
            if (res) {
              toast(`تم تجديد الباقة؛ الرصيد الآن ${count(res.package_remaining ?? 0, 'consultation')}`, 'success');
              ctx.reload();
            }
          },
        }),
      );
    }
    actions.push(
      button('كلمة مرور مؤقتة', {
        icon: 'lock',
        onClick: async () => {
          const res = await formDialog({
            title: 'تعيين كلمة مرور مؤقتة',
            intro: `ستُغلق كل جلسات ${l.display_name} الحالية، ويُطلب منه تغيير هذه الكلمة فور دخوله. الأفضل إرسال «رابط إعادة التعيين» من بطاقة «الحساب والأمان» حتى يختار كلمة مروره بنفسه.`,
            submitLabel: 'تعيين كلمة المرور المؤقتة',
            fields: [
              { name: 'password', label: 'كلمة المرور المؤقتة', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: 'ثمانية أحرف على الأقل تجمع بين الحروف والأرقام' },
              { name: 'confirm', label: 'تأكيد كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' },
            ],
            onSubmit: async (v) => {
              if (v.password !== v.confirm) {
                const e = new Error('كلمتا المرور غير متطابقتين');
                e.details = { fields: { confirm: 'كلمتا المرور غير متطابقتين' } };
                throw e;
              }
              await api.post(`/admin/lawyers/${encodeURIComponent(l.id)}/password`, { password: v.password });
              return true;
            },
          });
          if (res) {
            toast('عُيّنت كلمة المرور المؤقتة وأُنهيت الجلسات السابقة', 'success');
            ctx.reload();
          }
        },
      }),
    );
    actions.push(
      asyncButton(
        l.active ? 'إيقاف الحساب' : 'تفعيل الحساب',
        async () => {
          const ok = await confirmDialog(
            l.active
              ? {
                  title: 'إيقاف حساب المحامي',
                  message: `لن يتمكن ${l.display_name} من الدخول إلى المنصة، وستُغلق جلساته الحالية فورًا. لا تُسحب الملفات المسندة إليه تلقائيًا${m.open_assignments ? ` — الإسنادات المفتوحة لديه: ${num(m.open_assignments)}، ويُنصح بإعادة إسنادها` : ''}.`,
                  confirmLabel: 'نعم، إيقاف الحساب',
                  danger: true,
                }
              : {
                  title: 'تفعيل حساب المحامي',
                  message: `سيتمكن ${l.display_name} من الدخول مجددًا، ويظهر ضمن المقترحين عند إسناد الملفات.`,
                  confirmLabel: 'تفعيل الحساب',
                },
          );
          if (!ok) return;
          await api.patch(`/admin/lawyers/${encodeURIComponent(l.id)}`, { active: !l.active });
          toast(l.active ? 'تم إيقاف حساب المحامي' : 'تم تفعيل حساب المحامي', 'success');
          ctx.reload();
        },
        { variant: l.active ? 'danger' : 'secondary', icon: l.active ? 'x' : 'check' },
      ),
    );
  }

  // ── مؤشرات الأداء ──
  const capRatio = l.capacity ? m.open_assignments / l.capacity : 0;
  const metrics = [
    statCard({
      label: 'الإسنادات المفتوحة',
      value: h('span.nowrap', `${num(m.open_assignments)} من ${num(l.capacity)}`),
      hint: h(
        'div.pd-cell-stack',
        progressBar(Math.min(m.open_assignments, l.capacity || 1), l.capacity || 1, capRatio > 1 ? 'danger' : capRatio >= 0.8 ? 'warning' : 'primary', { label: 'نسبة استخدام الطاقة', visibleLabel: false }),
        h('span', capRatio > 1 ? 'تجاوز الطاقة: ' : 'المستخدم من الطاقة: ', h('bdi', { dir: 'ltr' }, percent(capRatio))),
      ),
      icon: 'briefcase',
      tone: capRatio > 1 ? 'danger' : capRatio >= 0.8 ? 'warning' : 'info',
    }),
    statCard({ label: 'متأخرة الآن', value: num(m.overdue), hint: m.overdue ? 'إسنادات تجاوزت الموعد المطلوب' : 'لا توجد إسنادات متأخرة', icon: 'clock', tone: m.overdue ? 'danger' : 'success' }),
    statCard({ label: 'تقديمات بعد الموعد', value: num(m.late_submissions), hint: 'إجمالي ما قُدّم بعد الموعد المطلوب', icon: 'alert', tone: m.late_submissions ? 'warning' : 'neutral' }),
    statCard({ label: 'متوسط زمن أول تقديم', value: hoursText(m.avg_response_hours), hint: 'من الإسناد حتى تقديم الرأي', icon: 'zap', tone: 'primary' }),
    statCard({ label: 'إسنادات معتمدة', value: num(m.completed_in_period), hint: `خلال ${pl} — الإجمالي ${num(m.completed_total)}`, icon: 'checkCircle', tone: 'success' }),
    statCard({ label: 'نسبة الإعادة للتعديل', value: percent(m.returned_rate), hint: 'من الآراء التي راجعتها الإدارة', icon: 'refresh', tone: m.returned_rate >= 0.3 ? 'warning' : 'neutral' }),
    statCard({ label: 'متوسط الجودة', value: qualityText(m.avg_quality), hint: 'تقييم الإدارة عند الاعتماد', icon: 'star', tone: 'accent' }),
    // (v9 messaging) رضا العملاء من استبيان ما بعد الرد في الملفات التي اعتُمد فيها رأيه
    m.avg_client_satisfaction !== undefined &&
      statCard({ label: 'رضا المستفيدين', value: qualityText(m.avg_client_satisfaction), hint: m.client_ratings ? `من ${count(m.client_ratings, ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييمًا'])} للملفات التي اعتُمد فيها رأيه` : 'لا تقييمات من المستفيدين بعد', icon: 'star', tone: m.avg_client_satisfaction != null && m.avg_client_satisfaction < 3 ? 'warning' : 'success' }),
    statCard({ label: 'استشارات تطوعية', value: num(m.pro_bono_in_period), hint: `خلال ${pl} — الإجمالي ${num(m.pro_bono_total)}`, icon: 'shieldCheck', tone: 'success' }),
  ];
  if (isAdmin) {
    metrics.push(
      statCard({ label: 'المستحق عن الشهر', value: moneyValue(m.earned_in_period), hint: `قيود ${pl} غير الملغاة`, icon: 'wallet', tone: 'primary' }),
      statCard({
        label: 'رصيد غير مصروف',
        value: moneyValue(m.unpaid_balance),
        hint: 'عرض القيود في دفتر المستحقات',
        icon: 'wallet',
        tone: m.unpaid_balance > 0 ? 'warning' : 'neutral',
        href: `#/accounting?tab=ledger&lawyer_id=${encodeURIComponent(l.id)}&status=accrued`,
      }),
    );
  }

  const metricsCard = card({
    title: 'مؤشرات الأداء',
    subtitle: `الأرقام الشهرية عن ${pl}، والبقية تراكمية`,
    icon: 'chart',
    actions: periodSelect({
      label: 'شهر المؤشرات',
      value: period,
      onChange: (v) => {
        replaceQuery(`/lawyers/${l.id}`, { period: v === currentPeriod() ? '' : v });
        ctx.reload();
      },
    }),
    body: h('div.stats-grid.pd-stats-compact', metrics),
  });

  // ── الملفات ──
  const caseIdByCode = new Map(assignments.map((a) => [a.case_code, a.case_id]));
  let filter = 'all';
  const isOpen = (a) => ACTIVE_ASSIGNMENT.includes(a.status) || a.status === 'submitted';
  const assignHost = h('div.stack');
  const segBtns = {};
  function drawAssignments() {
    for (const [k, b] of Object.entries(segBtns)) b.setAttribute('aria-pressed', String(k === filter));
    const rows = assignments.filter((a) => (filter === 'open' ? isOpen(a) : filter === 'done' ? !isOpen(a) : true));
    assignHost.replaceChildren(
      table({
        caption: 'إسنادات المحامي',
        rows,
        empty: filter === 'all' ? 'لم يُسند أي ملف لهذا المحامي بعد' : 'لا توجد إسنادات في هذا التصنيف',
        onRowClick: (a) => ctx.navigate(`/cases/${a.case_id}`),
        rowClass: (a) => a.status === 'withdrawn' && 'is-muted',
        columns: [
          {
            key: 'case',
            label: 'الملف',
            className: 'col-wide',
            render: (a) => h('div', h('a', { href: `#/cases/${a.case_id}` }, codeTag(a.case_code)), h('div.cell-sub', a.case_title)),
          },
          { key: 'role', label: 'الدور', render: (a) => statusBadge('assignment_role', a.role) },
          {
            key: 'status',
            label: 'الحالة',
            render: (a) =>
              h(
                'div.pd-cell-stack',
                h('span.pd-inline-k', h('span.cell-sub', 'الإسناد: '), statusBadge('assignment_status', a.status)),
                h('span.pd-inline-k', h('span.cell-sub', 'الملف: '), statusBadge('case_status', a.case_status)),
              ),
          },
          {
            key: 'due',
            label: 'الموعد المطلوب',
            render: (a) => (ACTIVE_ASSIGNMENT.includes(a.status) && a.case_status !== 'closed' ? dueBadge(a.due_at) : timeCell(a.due_at)),
          },
          {
            key: 'dates',
            label: 'التواريخ',
            render: (a) =>
              h(
                'dl.pd-dates',
                h('div', h('dt', 'الإسناد'), h('dd', timeCell(a.assigned_at))),
                h(
                  'div',
                  h('dt', 'أول تقديم'),
                  h('dd', timeCell(a.first_submitted_at), a.due_at && a.first_submitted_at && a.first_submitted_at > a.due_at ? badge('بعد الموعد', 'warning') : null),
                ),
                h('div', h('dt', 'الاعتماد'), h('dd', timeCell(a.approved_at))),
              ),
          },
        ],
      }),
    );
  }
  function assignmentsPanel() {
    const counts = { all: assignments.length, open: assignments.filter(isOpen).length };
    counts.done = counts.all - counts.open;
    const labels = { all: 'الكل', open: 'المفتوحة', done: 'المنتهية' };
    const seg = h(
      'div.segmented',
      { role: 'group', 'aria-label': 'تصفية الإسنادات' },
      Object.keys(labels).map((k) => {
        segBtns[k] = h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': 'false',
            onClick: () => {
              filter = k;
              drawAssignments();
            },
          },
          labels[k],
          h('span.tab-count', String(counts[k])),
        );
        return segBtns[k];
      }),
    );
    drawAssignments();
    return h('div.stack', seg, assignHost);
  }

  function mattersPanel() {
    return table({
      caption: 'الملفات المستمرة التي يتولاها المحامي',
      rows: matters,
      empty: 'لا يتولى هذا المحامي أي ملف مستمر حاليًا',
      onRowClick: (x) => ctx.navigate(`/matters/${x.id}`),
      columns: [
        { key: 'code', label: 'الكود', render: (x) => h('a', { href: `#/matters/${x.id}` }, codeTag(x.code)) },
        { key: 'title', label: 'الموضوع', className: 'col-wide', render: (x) => h('span.cell-title', x.title) },
        { key: 'status', label: 'الحالة', render: (x) => statusBadge('matter_status', x.status) },
      ],
    });
  }

  function statementPanel() {
    const entries = st.entries || [];
    const events = st.events || [];
    const payouts = st.payouts || [];
    return h(
      'div.stack-lg',
      h(
        'div.stats-grid.pd-stats-compact',
        statCard({ label: 'رصيد غير مصروف', value: moneyValue(st.unpaid_balance), icon: 'wallet', tone: st.unpaid_balance > 0 ? 'warning' : 'neutral' }),
        statCard({ label: 'إجمالي ما صُرف', value: moneyValue(st.paid_total), icon: 'checkCircle', tone: 'success' }),
        statCard({ label: 'مساهمات تطوعية', value: num(st.pro_bono_count), hint: 'استشارات بلا مقابل مالي', icon: 'shieldCheck', tone: 'accent' }),
        st.package_remaining != null && statCard({ label: 'المتبقي في الباقة', value: count(st.package_remaining, 'consultation'), icon: 'briefcase', tone: st.package_remaining > 0 ? 'primary' : 'danger' }),
      ),
      h(
        'section.section',
        h('div.row-between', h('h2.section-title', 'قيود الحساب'), button('فتح في دفتر المستحقات', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: `#/accounting?tab=ledger&lawyer_id=${encodeURIComponent(l.id)}` })),
        table({
          caption: 'قيود حساب المحامي',
          rows: entries,
          empty: 'لا توجد قيود في حساب هذا المحامي بعد',
          rowClass: (e) => e.status === 'void' && 'is-muted',
          columns: [
            { key: 'created_at', label: 'التاريخ', render: (e) => timeCell(e.created_at) },
            { key: 'kind', label: 'النوع', render: (e) => badge(e.kind_label || label('ledger_kind', e.kind), 'neutral') },
            { key: 'description', label: 'البيان', className: 'col-wide', render: (e) => h('span', richText(e.description)) },
            {
              key: 'case',
              label: 'الملف',
              render: (e) =>
                e.case_code || e.matter_code
                  ? h(
                      'div.pd-cell-stack',
                      e.case_code && h('a', { href: `#/cases/${e.case_id}` }, codeTag(e.case_code)),
                      e.matter_code && h('a', { href: `#/matters/${e.matter_id}` }, codeTag(e.matter_code)),
                    )
                  : null,
            },
            { key: 'period', label: 'الفترة', render: (e) => h('span.nowrap', periodLabel(e.period)) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (e) => amountCell(e.amount) },
            { key: 'status', label: 'الحالة', render: (e) => statusBadge('ledger_status', e.status) },
          ],
        }),
      ),
      h(
        'section.section',
        h('h2.section-title', 'وقائع الاستحقاق'),
        h('p.pd-section-hint', 'كل استشارة معتمدة تُسجَّل مرة واحدة كواقعة استحقاق، ويحدد اتفاق المحامي معالجتها المالية تلقائيًا.'),
        table({
          caption: 'وقائع الاستحقاق',
          rows: events,
          empty: 'لا توجد وقائع استحقاق بعد',
          columns: [
            { key: 'created_at', label: 'التاريخ', render: (e) => timeCell(e.created_at) },
            {
              key: 'case',
              label: 'الملف',
              render: (e) => (caseIdByCode.has(e.case_code) ? h('a', { href: `#/cases/${caseIdByCode.get(e.case_code)}` }, codeTag(e.case_code)) : codeTag(e.case_code)),
            },
            { key: 'role', label: 'الدور', render: (e) => statusBadge('assignment_role', e.role) },
            { key: 'treatment', label: 'المعالجة المالية', render: (e) => statusBadge('treatment', e.treatment) },
            { key: 'amount', label: 'المبلغ المستحق', align: 'end', render: (e) => (Number(e.amount) ? amountCell(e.amount) : h('span.muted', '—')) },
            { key: 'notional', label: 'القيمة التقديرية', align: 'end', render: (e) => (Number(e.notional) ? h('span.nowrap', money(e.notional)) : h('span.muted', '—')) },
          ],
        }),
      ),
      h(
        'section.section',
        h('h2.section-title', 'عمليات الصرف'),
        table({
          caption: 'عمليات صرف المستحقات',
          rows: payouts,
          empty: 'لم تُصرف أي مبالغ لهذا المحامي بعد',
          columns: [
            { key: 'paid_at', label: 'تاريخ الصرف', render: (p) => timeCell(p.paid_at) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (p) => amountCell(p.amount) },
            { key: 'method', label: 'طريقة الصرف', render: (p) => p.method || null },
            { key: 'reference', label: 'المرجع', render: (p) => (p.reference ? ltr(p.reference) : null) },
          ],
        }),
      ),
    );
  }

  const tabItems = [
    { key: 'assignments', label: 'الملفات', icon: 'briefcase', count: assignments.length, render: assignmentsPanel },
    { key: 'matters', label: 'الملفات المستمرة', icon: 'gavel', count: matters.length, render: mattersPanel },
  ];
  if (isAdmin) tabItems.push({ key: 'statement', label: 'كشف الحساب', icon: 'wallet', render: statementPanel });
  const activeTab = tabItems.some((t) => t.key === ctx.query.tab) ? ctx.query.tab : 'assignments';
  const tabsEl = tabs(tabItems, {
    active: activeTab,
    onChange: (key) => replaceQuery(`/lawyers/${l.id}`, { period: period === currentPeriod() ? '' : period, tab: key === 'assignments' ? '' : key }),
  });

  // ── العمود الجانبي ──
  const profileCard = card({
    title: 'بيانات المحامي',
    icon: 'user',
    body: frag(
      kv(
        [
        ['اسم المستخدم', codeTag(l.username)],
        ['الموبايل', l.phone ? ltr(l.phone) : null],
        ['البريد الإلكتروني', l.email ? ltr(l.email) : null],
        ['رقم القيد', l.bar_number ? ltr(l.bar_number) : null],
        ['درجة القيد', l.bar_level],
        ['مكتب المحاماة', l.firm || 'محامٍ مستقل'],
        ['الطاقة الاستيعابية', `${count(l.capacity, ['إسناد مفتوح', 'إسنادان مفتوحان', 'إسنادات مفتوحة', 'إسنادًا مفتوحًا'])} كحد أقصى`],
        ['التخصصات', chips(l.specialties_labels || (l.specialties || []).map(areaLabel))],
        ['آخر دخول', l.last_login_at ? h('time', { datetime: l.last_login_at, title: dateTime(l.last_login_at) }, relative(l.last_login_at)) : h('span.muted', 'لم يسجل الدخول بعد')],
        ['تاريخ الانضمام', date(l.created_at)],
        ],
        { columns: 2 },
      ),
      l.notes && h('div.pd-note', h('div.pd-note-title', icon('info', { size: 15 }), 'ملاحظات داخلية'), h('p.pre', l.notes)),
    ),
  });

  // v10 b2b-staff (STF-11): «خدمة الشركات» — الاسم بالإنجليزية (P0، فحص التسليمات)، مهارات طلبات الشركات وسعرها (P1)
  const companyCard = card({
    title: 'خدمة الشركات',
    icon: 'building',
    actions: isAdmin
      ? button('تعديل', {
          size: 'sm',
          icon: 'edit',
          onClick: async () => {
            const res = await formDialog({
              title: 'خدمة الشركات',
              fields: [
                { name: 'name_latin', label: 'الاسم بالإنجليزية', ltr: true, maxLength: 80, placeholder: 'Tarek El-Naggar', hint: NAME_LATIN_HINT },
                { name: 'skills', label: 'مهارات طلبات الشركات', type: 'multiselect', options: B2B_SKILLS.map((x) => ({ value: x.key, label: x.label })) },
                // v11 segment-staff (ST-6، L11-24، P1): السعر نفسه يُستخدم لعمل الأفراد والشركات المدفوع
                { name: 'b2b_rate', label: PAID_RATE_LABEL, type: 'money', min: 0, hint: 'أتعاب المحامي عن طلب شركة أو ملف أفراد بأتعاب متوسط الحجم (ما لم يُتفق على أتعاب خاصة بالإسناد)؛ يظهر للإدارة عند اختيار المحامي.' },
              ],
              values: { name_latin: l.name_latin || '', skills: l.skills || [], b2b_rate: l.b2b_rate },
              onSubmit: (v) => {
                if (v.name_latin && !/^[A-Za-z][A-Za-z .'-]*$/.test(v.name_latin)) {
                  const e = new Error('الاسم بالإنجليزية يُكتب بحروف لاتينية ومسافات فقط');
                  e.details = { fields: { name_latin: 'حروف لاتينية ومسافات فقط، مثل Tarek El-Naggar' } };
                  throw e;
                }
                return api.patch(`/admin/lawyers/${encodeURIComponent(l.id)}`, { name_latin: v.name_latin || null, skills: v.skills || [], b2b_rate: v.b2b_rate ?? null });
              },
            });
            if (res) {
              toast('حُفظت بيانات خدمة الشركات', 'success');
              ctx.reload();
            }
          },
        })
      : null,
    body: kv([
      ['الاسم بالإنجليزية', l.name_latin ? h('bdi', { dir: 'ltr', lang: 'en' }, l.name_latin) : h('span.muted', 'غير مسجل — سجّله ليُفحص في ملفات التسليم')],
      ['مهارات طلبات الشركات', (l.skills || []).length ? chips((l.skills || []).map((k) => ({ label: B2B_SKILLS.find((x) => x.key === k)?.label || k }))) : h('span.muted', 'لم تُحدَّد')],
      [PAID_RATE_LABEL, l.b2b_rate != null ? money(l.b2b_rate) : h('span.muted', 'لم يُحدَّد')],
    ]),
  });

  const agreementBody = [
    h('div.pd-agreement-head', statusBadge('agreement_type', ag.type, { dot: false })),
    h('p.pd-agreement-text', describeAgreement(ag)),
    kv([
      PAID_TYPES.includes(ag.type) && ['واقعة الاستحقاق', label('billable_trigger', ag.billable_event || 'on_approval')],
      ag.type === 'monthly_quota' && ['الحصة الشهرية', count(ag.quota, 'consultation')],
      ag.type === 'monthly_quota' && ['سعر الزيادة', money(ag.overage_rate)],
      ag.type === 'package' && ['سعر بعد نفاد الباقة', ag.overage_rate ? money(ag.overage_rate) : 'غير محدد'],
      (ag.type === 'pro_bono' || ag.type === 'csr') && ['القيمة التقديرية للاستشارة', ag.notional_value ? money(ag.notional_value) : 'غير محددة'],
      ag.type === 'csr' && ['مكتب المحاماة', ag.csr_firm],
      ag.type === 'csr' && ['فترة الالتزام', ag.csr_period === 'month' ? 'شهريًا' : 'سنويًا'],
      isAdmin && ['رصيد غير مصروف', money(m.unpaid_balance)],
    ]),
  ];
  if (ag.type === 'package') {
    const remaining = Number(l.package_remaining) || 0;
    const size = Number(ag.package_size) || remaining || 1;
    agreementBody.push(
      h(
        'div.pd-package',
        progressBar(Math.min(remaining, size), size, remaining === 0 ? 'danger' : remaining <= size * 0.2 ? 'warning' : 'primary', {
          label: remaining > size ? `المتبقي في الباقة: ${count(remaining, 'consultation')} (أكثر من حجم الباقة الأساسية ${num(size)} بعد التجديد)` : `المتبقي في الباقة: ${num(remaining)} من ${count(size, 'consultation')}`,
        }),
        remaining === 0 && h('p.pd-text-danger.small', ag.overage_rate ? `نفدت الباقة؛ تُحاسب الاستشارات الجديدة بسعر ${money(ag.overage_rate)} حتى التجديد.` : 'نفدت الباقة؛ يُنصح بتجديدها.'),
      ),
    );
  }
  const agreementCard = card({ title: 'اتفاق المحاسبة', icon: 'wallet', body: agreementBody });

  const specialtiesText = (l.specialties_labels || (l.specialties || []).map(areaLabel)).join('، ');
  return frag(
    pageHeader({
      // الصورة الرمزية خارج <h1>: نص العنوان هو اسم المحامي فقط
      title: l.display_name,
      titleMedia: avatar(l.display_name, { size: 'lg' }),
      subtitle: specialtiesText ? `التخصصات: ${specialtiesText}` : null,
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'شبكة المحامين', href: '#/lawyers' }, { label: l.display_name }],
      meta: [activeBadge(l.active), statusBadge('agreement_type', ag.type, { dot: false }), m.overdue ? badge(`إسنادات متأخرة: ${num(m.overdue)}`, 'danger', { icon: 'clock' }) : null],
      actions: actions.length ? actions : null,
    }),
    !l.active && alertBox('هذا الحساب موقوف: لا يستطيع المحامي الدخول، ولا يظهر ضمن المقترحين عند إسناد الملفات.', 'warning', { title: 'الحساب موقوف' }),
    l.active && l.invite_pending && alertBox('لم يفعّل المحامي حسابه بعد من رابط الدعوة، ولن يظهر ضمن المقترحين عند الإسناد حتى يفعّله. يمكنك إعادة إرسال الدعوة من بطاقة «الحساب والأمان».', 'info', { title: 'بانتظار قبول الدعوة' }),
    metricsCard,
    h('div.pd-detail-top', profileCard, agreementCard),
    companyCard, // v10 b2b-staff
    // وحدة الحسابات: حالة الدخول والدعوة والتحقق بخطوتين والجلسات (لمدير النظام)
    isAdmin ? accountSecurityCard({ userId: l.id, me: ctx.user }) : null,
    card({ body: tabsEl, className: 'pd-tabs-card' }),
  );
}

