// المحاسبة (لمدير النظام): اتفاق كل محامٍ يحدد ما يحدث ماليًا عند تحقق واقعة الاستحقاق.
// ملخص الفترة، دفتر المستحقات والصرف والتسويات، وتكلفة الملفات المغلقة حسب المجال.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, options, num, money, percent, date, dateTime, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  tabs,
  filterBar,
  selectInput,
  badge,
  statusBadge,
  statusTone,
  progressBar,
  button,
  asyncButton,
  emptyState,
  errorState,
  loading,
  alertBox,
  modal,
  form,
  formDialog,
  confirmDialog,
  toast,
  icon,
  codeTag,
  richText,
} from '../../../lib/ui.js';
import { isPeriod, currentPeriod, shiftPeriod, periodLabel, periodSelect, recentPeriods, replaceQuery } from './lawyers.js';

const TABS = ['summary', 'ledger', 'costs'];
const PAY_METHODS = ['تحويل بنكي', 'إنستاباي (InstaPay)', 'محفظة إلكترونية', 'نقدًا', 'شيك'];

function moneyCell(n, { strong = false, zeroMuted = true } = {}) {
  const v = Number(n) || 0;
  if (!v && zeroMuted) return h('span.muted.nowrap', money(0));
  return h(strong ? 'strong.nowrap.pd-amount' : 'span.nowrap.pd-amount', { class: v < 0 ? 'pd-text-danger' : null }, money(v));
}

/** مبلغ لبطاقة رقمية: الرقم كبير والعملة أصغر. */
function moneyValue(n) {
  return h('span.nowrap', num(Number(n) || 0), h('span.pd-unit', ' ج.م'));
}

function timeCell(iso) {
  return iso ? h('time.nowrap', { datetime: iso, title: dateTime(iso) }, date(iso)) : h('span.muted', '—');
}

export default async function render(ctx) {
  const period = isPeriod(ctx.query.period) ? ctx.query.period : currentPeriod();
  const summary = await api.get('/admin/accounting/summary', { period });
  const lawyers = Array.isArray(summary.lawyers) ? summary.lawyers : [];
  const t = summary.totals || {};
  const pl = periodLabel(summary.period || period);

  const ledger = {
    lawyer_id: lawyers.some((l) => String(l.lawyer_id) === String(ctx.query.lawyer_id)) ? String(ctx.query.lawyer_id) : '',
    status: options('ledger_status').some((o) => o.value === ctx.query.status) ? ctx.query.status : '',
    period: isPeriod(ctx.query.lperiod) ? ctx.query.lperiod : '',
    selected: new Set(),
    rendered: false,
  };
  let activeTab = TABS.includes(ctx.query.tab) ? ctx.query.tab : 'summary';

  function syncUrl() {
    replaceQuery('/accounting', {
      period: period === currentPeriod() ? '' : period,
      tab: activeTab === 'summary' ? '' : activeTab,
      lawyer_id: activeTab === 'ledger' ? ledger.lawyer_id : '',
      status: activeTab === 'ledger' ? ledger.status : '',
      lperiod: activeTab === 'ledger' ? ledger.period : '',
    });
  }

  const lawyerName = (id) => lawyers.find((l) => String(l.lawyer_id) === String(id))?.name || '—';

  // ───────────── إصدار المبالغ الشهرية ─────────────
  const closeMonthBtn = asyncButton(
    'إصدار المبالغ الشهرية لهذا الشهر',
    async () => {
      const ok = await confirmDialog({
        title: `إصدار المبالغ الشهرية — ${pl}`,
        message: `سيُسجَّل المبلغ الشهري الثابت كمستحق لكل محامٍ باتفاق شهري لم يُصدر له مبلغ ${pl} بعد. العملية آمنة ولا تُكرر أي قيد صدر من قبل.`,
        confirmLabel: 'إصدار المبالغ',
      });
      if (!ok) return;
      const res = await api.post('/admin/accounting/close-month', { period });
      const created = Array.isArray(res?.created) ? res.created : [];
      modal({
        title: created.length ? 'تم إصدار المبالغ الشهرية' : 'لا توجد مبالغ جديدة',
        size: 'md',
        body: created.length
          ? frag(
              h('p.modal-intro', `أُصدرت المبالغ التالية عن ${pl} وأُضيفت إلى دفتر المستحقات:`),
              table({
                caption: 'المبالغ الشهرية التي صدرت',
                rows: created,
                columns: [
                  { key: 'name', label: 'المحامي', render: (r) => h('span.cell-title', r.name) },
                  { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => moneyCell(r.amount, { strong: true }) },
                ],
              }),
              h('p.pd-footnote.mt-2', `الإجمالي: ${money(created.reduce((s, r) => s + (Number(r.amount) || 0), 0))}`),
            )
          : h('p.confirm-message', `كل المبالغ الشهرية عن ${pl} صادرة بالفعل، أو لا يوجد محامون باتفاق شهري في هذه الفترة.`),
        actions: [{ label: 'تم', variant: 'primary' }],
        onClose: () => ctx.reload(),
      });
    },
    { variant: 'primary', icon: 'calendar' },
  );

  const needsClosing = lawyers.filter((l) => l.needs_month_closing);

  // ───────────── تبويب: المحامون والاتفاقات ─────────────
  function usageCell(l) {
    if (l.quota) {
      const over = l.quota.used > l.quota.included;
      return h(
        'div.pd-usage',
        progressBar(Math.min(l.quota.used, l.quota.included), l.quota.included || 1, over ? 'danger' : 'primary', { label: `الحصة الشهرية: ${l.quota.used} من ${l.quota.included}`, visibleLabel: false }),
        h('span.cell-sub', `الحصة الشهرية: ${num(l.quota.used)} من ${num(l.quota.included)}`, over ? ` (زيادة ${num(l.quota.used - l.quota.included)})` : ''),
      );
    }
    if (l.package_remaining != null) {
      return badge(`المتبقي في الباقة: ${num(l.package_remaining)} حالة`, l.package_remaining > 0 ? 'primary' : 'danger');
    }
    if (l.csr) {
      const c = l.csr;
      const per = c.period === 'month' ? 'هذا الشهر' : 'هذا العام';
      return h(
        'div.pd-usage',
        c.cases_commitment
          ? frag(
              progressBar(Math.min(c.cases_used, c.cases_commitment), c.cases_commitment, 'success', { label: `القضايا: ${c.cases_used} من ${c.cases_commitment}`, visibleLabel: false }),
              h('span.cell-sub', `القضايا ${per}: ${num(c.cases_used)} من ${num(c.cases_commitment)}`),
            )
          : null,
        c.hours_commitment
          ? frag(
              progressBar(Math.min(c.hours_used, c.hours_commitment), c.hours_commitment, 'success', { label: `الساعات: ${c.hours_used} من ${c.hours_commitment}`, visibleLabel: false }),
              h('span.cell-sub', `الساعات ${per}: ${num(c.hours_used)} من ${num(c.hours_commitment)}`),
            )
          : null,
      );
    }
    return h('span.muted', '—');
  }

  function treatmentCell(l) {
    const entries = Object.entries(l.by_treatment || {});
    return h(
      'div.pd-cell-stack',
      h('span.nowrap', l.events ? `${num(l.events)} ${l.events === 1 ? 'واقعة' : 'وقائع'}` : h('span.muted', 'لا وقائع')),
      entries.length ? h('div.pd-badges', entries.map(([k, n]) => badge(`${label('treatment', k)}: ${num(n)}`, statusTone('treatment', k)))) : null,
    );
  }

  function summaryPanel() {
    if (!lawyers.length) return emptyState('لا يوجد محامون في الشبكة بعد', button('شبكة المحامين', { href: '#/lawyers', icon: 'scale' }), { icon: 'wallet' });
    return h(
      'div.stack',
      needsClosing.length
        ? alertBox(
            h(
              'span',
              `لم يُصدر المبلغ الشهري عن ${pl} لكل من: ${needsClosing.map((l) => l.name).join('، ')}. استخدم زر «إصدار المبالغ الشهرية لهذا الشهر» أعلى الصفحة.`,
            ),
            'warning',
            { title: 'مبالغ شهرية لم تُصدر بعد' },
          )
        : null,
      table({
        className: 'pd-table-tight',
        caption: `ملخص المحاسبة حسب المحامي عن ${pl}`,
        rows: lawyers,
        rowClass: (l) => !l.active && 'is-muted',
        columns: [
          {
            key: 'name',
            label: 'المحامي والاتفاق',
            className: 'pd-col-lawyer',
            render: (l) =>
              h(
                'div.pd-cell-stack',
                h('a.cell-title', { href: `#/lawyers/${l.lawyer_id}` }, l.name),
                h('span.cell-sub', l.agreement_text),
                h(
                  'div.pd-badges',
                  !l.active && badge('موقوف', 'muted'),
                  l.needs_month_closing && badge('يحتاج إصدار المبلغ الشهري', 'warning', { icon: 'alert' }),
                ),
              ),
          },
          { key: 'events', label: `وقائع ${pl}`, render: treatmentCell },
          { key: 'usage', label: 'الاستهلاك', render: usageCell, className: 'pd-col-usage' },
          { key: 'period_amount', label: 'مستحقات الفترة', align: 'end', render: (l) => moneyCell(l.period_amount, { strong: true }) },
          {
            key: 'unpaid',
            label: 'رصيد غير مصروف',
            align: 'end',
            render: (l) => (Number(l.unpaid_balance) ? h('span.pd-text-warning', moneyCell(l.unpaid_balance)) : moneyCell(0)),
          },
          { key: 'contribution', label: 'قيمة المساهمة', align: 'end', render: (l) => (Number(l.contribution_value) ? moneyCell(l.contribution_value) : h('span.muted', '—')) },
          {
            key: 'actions',
            label: '',
            render: (l) =>
              button('القيود', {
                size: 'sm',
                variant: 'ghost',
                icon: 'fileText',
                title: `عرض قيود ${l.name} في دفتر المستحقات`,
                onClick: () => openLedgerFor(l.lawyer_id),
              }),
          },
        ],
      }),
      h(
        'p.pd-footnote',
        'مستحقات الفترة: مجموع القيود غير الملغاة عن الشهر المختار. الرصيد غير المصروف: كل القيود المستحقة التي لم تُصرف بعد أيًا كانت فترتها. قيمة المساهمة: القيمة التقديرية للاستشارات التطوعية وبرامج CSR.',
      ),
    );
  }

  // ───────────── تبويب: دفتر المستحقات ─────────────
  const ledgerHost = h('div.stack');
  let ledgerRows = [];
  let ledgerSeq = 0;

  function openLedgerFor(lawyerId) {
    ledger.lawyer_id = String(lawyerId);
    ledger.status = '';
    ledger.period = '';
    ledger.selected.clear();
    const wasRendered = ledger.rendered;
    tabsEl.setActive('ledger');
    if (wasRendered) tabsEl.refresh('ledger');
    activeTab = 'ledger';
    syncUrl();
    tabsEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function loadLedger() {
    const my = ++ledgerSeq;
    mount(ledgerHost, loading());
    try {
      const rows = await api.get('/admin/accounting/ledger', { lawyer_id: ledger.lawyer_id, status: ledger.status, period: ledger.period });
      if (my !== ledgerSeq) return;
      ledgerRows = Array.isArray(rows) ? rows : [];
      ledger.selected = new Set([...ledger.selected].filter((id) => ledgerRows.some((r) => r.id === id && r.status === 'accrued')));
      drawLedger();
    } catch (err) {
      if (my !== ledgerSeq) return;
      mount(ledgerHost, errorState(err, loadLedger));
    }
  }

  function selectedTotal() {
    return ledgerRows.filter((r) => ledger.selected.has(r.id)).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  }

  function drawLedger() {
    const single = Boolean(ledger.lawyer_id);
    const accrued = ledgerRows.filter((r) => r.status === 'accrued');
    const selCount = ledger.selected.size;
    const selTotal = selectedTotal();

    const payBtn = button(selCount ? `صرف المحدد (${num(selCount)})` : 'صرف المحدد', {
      variant: 'primary',
      icon: 'wallet',
      disabled: !single || !selCount,
      title: !single ? 'اختر محاميًا أولًا' : !selCount ? 'حدد القيود المستحقة المراد صرفها' : null,
      onClick: openPayout,
    });

    let headCheck = null;
    if (single && accrued.length) {
      headCheck = h('input', {
        type: 'checkbox',
        'aria-label': 'تحديد كل القيود المستحقة المعروضة',
        checked: accrued.every((r) => ledger.selected.has(r.id)),
        onChange: (e) => {
          if (e.target.checked) accrued.forEach((r) => ledger.selected.add(r.id));
          else ledger.selected.clear();
          drawLedger();
        },
      });
      headCheck.indeterminate = selCount > 0 && selCount < accrued.length;
    }

    const columns = [
      single && {
        key: 'sel',
        label: headCheck || '',
        className: 'pd-col-check',
        render: (r) =>
          r.status === 'accrued'
            ? h('input', {
                type: 'checkbox',
                'aria-label': `تحديد القيد ${r.description}`,
                checked: ledger.selected.has(r.id),
                onChange: (e) => {
                  if (e.target.checked) ledger.selected.add(r.id);
                  else ledger.selected.delete(r.id);
                  drawLedger();
                },
              })
            : h('span.pd-check-placeholder', { 'aria-hidden': 'true' }),
      },
      {
        key: 'created_at',
        label: 'التاريخ والفترة',
        render: (r) => h('div.pd-cell-stack', timeCell(r.created_at), h('span.cell-sub.nowrap', `فترة ${periodLabel(r.period)}`)),
      },
      !single && { key: 'lawyer', label: 'المحامي', render: (r) => h('a', { href: `#/lawyers/${r.lawyer_id}` }, lawyerName(r.lawyer_id) !== '—' ? lawyerName(r.lawyer_id) : r.lawyer_name) },
      { key: 'kind', label: 'النوع', render: (r) => badge(label('ledger_kind', r.kind), r.kind === 'adjustment' ? 'accent' : 'neutral') },
      { key: 'description', label: 'البيان', className: 'col-wide', render: (r) => h('span', richText(r.description)) },
      {
        key: 'case',
        label: 'الملف',
        render: (r) =>
          r.case_code || r.matter_code
            ? h(
                'div.pd-cell-stack',
                r.case_code && h('a', { href: `#/cases/${r.case_id}` }, codeTag(r.case_code)),
                r.matter_code && h('a', { href: `#/matters/${r.matter_id}` }, codeTag(r.matter_code)),
              )
            : null,
      },
      { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => moneyCell(r.amount, { strong: true, zeroMuted: false }) },
      {
        key: 'status',
        label: 'الحالة',
        render: (r) =>
          h(
            'div.pd-cell-stack',
            statusBadge('ledger_status', r.status),
            r.status === 'accrued' ? button('إلغاء القيد', { size: 'sm', variant: 'link', className: 'pd-link-danger', onClick: () => openVoid(r) }) : null,
          ),
      },
    ].filter(Boolean);

    const totalShown = ledgerRows.filter((r) => r.status !== 'void').reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const totalAccrued = accrued.reduce((s, r) => s + (Number(r.amount) || 0), 0);

    mount(
      ledgerHost,
      h(
        'div.pd-toolbar',
        h(
          'div.pd-toolbar-text',
          single
            ? h('span', 'دفتر ', h('strong', lawyerName(ledger.lawyer_id)), ` — ${num(ledgerRows.length)} قيد، المستحق غير المصروف ${money(totalAccrued)}`)
            : h('span', `${num(ledgerRows.length)} قيد معروض — إجمالي غير الملغى ${money(totalShown)}`),
        ),
        h('div.pd-toolbar-actions', button('قيد يدوي / تسوية', { icon: 'plus', onClick: openAdjustment }), payBtn),
      ),
      !single && alertBox('لصرف مستحقات، اختر محاميًا من القائمة أولًا ثم حدد القيود المستحقة؛ تُصرف قيود محامٍ واحد في كل عملية صرف.', 'info'),
      single && selCount
        ? h(
            'div.pd-selection',
            { role: 'status' },
            icon('checkCircle', { size: 18 }),
            h('span', `تم تحديد ${num(selCount)} من القيود بإجمالي `, h('strong', money(selTotal))),
            button('إلغاء التحديد', {
              size: 'sm',
              variant: 'link',
              onClick: () => {
                ledger.selected.clear();
                drawLedger();
              },
            }),
          )
        : null,
      table({
        className: 'pd-table-tight',
        caption: 'دفتر المستحقات',
        rows: ledgerRows,
        empty: 'لا توجد قيود مطابقة للتصفية الحالية',
        rowClass: (r) => (r.status === 'void' ? 'is-muted' : ledger.selected.has(r.id) ? 'is-highlight' : null),
        columns,
      }),
    );
  }

  function openPayout() {
    const rows = ledgerRows.filter((r) => ledger.selected.has(r.id));
    const total = selectedTotal();
    if (!rows.length) return;
    if (total <= 0) {
      toast('إجمالي القيود المحددة يجب أن يكون أكبر من صفر', 'warning');
      return;
    }
    const today = cairoToday();
    formDialog({
      title: 'صرف مستحقات المحامي',
      intro: `سيتم صرف ${num(rows.length)} من القيود بإجمالي ${money(total)} للمحامي ${lawyerName(ledger.lawyer_id)}، وتتحول حالتها إلى «تم الصرف» ويصله إشعار بذلك.`,
      submitLabel: `تأكيد صرف ${money(total)}`,
      fields: [
        { name: 'method', label: 'طريقة الصرف', type: 'select', required: true, options: PAY_METHODS.map((m) => ({ value: m, label: m })) },
        { name: 'reference', label: 'رقم المرجع / الإيصال', ltr: true, maxLength: 120, hint: 'رقم التحويل أو الإيصال للمراجعة لاحقًا' },
        { name: 'paid_at', label: 'تاريخ الصرف', type: 'date', required: true, max: today },
        { name: 'note', label: 'ملاحظة', type: 'textarea', rows: 2, maxLength: 500 },
      ],
      values: { paid_at: today },
      onSubmit: (v) =>
        api.post('/admin/accounting/payouts', {
          lawyer_id: Number(ledger.lawyer_id),
          entry_ids: rows.map((r) => r.id),
          method: v.method,
          reference: v.reference || null,
          paid_at: v.paid_at,
          note: v.note || null,
        }),
    }).then((res) => {
      if (!res) return;
      toast(`تم صرف ${money(res.amount ?? total)} للمحامي ${lawyerName(ledger.lawyer_id)}`, 'success');
      ledger.selected.clear();
      loadLedger();
    });
  }

  function openVoid(r) {
    formDialog({
      title: 'إلغاء قيد مستحق',
      intro: `سيُلغى القيد «${r.description}» بمبلغ ${money(r.amount)} ولن يُحتسب ضمن المستحقات. لا يمكن التراجع عن الإلغاء؛ لتصحيح المبلغ أضف قيد تسوية بدلًا منه.`,
      submitLabel: 'إلغاء القيد نهائيًا',
      fields: [{ name: 'note', label: 'سبب الإلغاء', type: 'textarea', rows: 3, required: true, maxLength: 300 }],
      onSubmit: (v) => api.post(`/admin/accounting/entries/${encodeURIComponent(r.id)}/void`, { note: v.note }),
    }).then((res) => {
      if (!res) return;
      toast('تم إلغاء القيد', 'success');
      ledger.selected.delete(r.id);
      loadLedger();
    });
  }

  function openAdjustment() {
    let m = null;
    let caseSeq = 0;
    const f = form(
      [
        {
          name: 'lawyer_id',
          label: 'المحامي',
          type: 'select',
          required: true,
          options: lawyers.map((l) => ({ value: String(l.lawyer_id), label: l.name })),
          onChange: (v) => loadCases(v),
        },
        { name: 'amount', label: 'المبلغ', type: 'money', required: true, hint: 'مبلغ موجب يُضاف لمستحقات المحامي، أو سالب (مثل -200) للخصم' },
        { name: 'description', label: 'البيان', required: true, maxLength: 300, full: true, placeholder: 'مثال: مقابل حضور جلسة إضافية في ملف…' },
        { name: 'case_id', label: 'الملف المرتبط (اختياري)', type: 'select', placeholder: '— بدون ملف —', options: [], full: true, hint: 'تظهر ملفات المحامي المختار فقط' },
      ],
      { footer: false, values: { lawyer_id: ledger.lawyer_id || null } },
    );
    const caseSelect = f.control('case_id').input;

    async function loadCases(lawyerId) {
      const my = ++caseSeq;
      mount(caseSelect, h('option', { value: '' }, lawyerId ? 'جارٍ تحميل الملفات…' : '— اختر المحامي أولًا —'));
      caseSelect.disabled = true;
      if (!lawyerId) return;
      try {
        const res = await api.get('/admin/cases', { lawyer_id: lawyerId, limit: 200 });
        if (my !== caseSeq) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        mount(
          caseSelect,
          h('option', { value: '' }, items.length ? '— بدون ملف —' : '— لا توجد ملفات لهذا المحامي —'),
          items.map((c) => h('option', { value: String(c.id) }, `${c.code} — ${c.title}`)),
        );
        caseSelect.disabled = !items.length;
      } catch {
        if (my !== caseSeq) return;
        mount(caseSelect, h('option', { value: '' }, '— تعذر تحميل الملفات —'));
      }
    }
    loadCases(ledger.lawyer_id);

    m = modal({
      title: 'قيد يدوي / تسوية',
      size: 'md',
      body: frag(h('p.modal-intro', 'يُسجَّل القيد في دفتر المستحقات بحالة «مستحق — لم يُصرف» عن الشهر الحالي، ويظهر في كشف حساب المحامي.'), f.el),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'تسجيل القيد',
          variant: 'primary',
          icon: 'check',
          onClick: async () => {
            if (!f.validate()) return false;
            const v = f.getValues();
            if (!v.amount) {
              f.setErrors({ amount: 'المبلغ لا يمكن أن يكون صفرًا' });
              return false;
            }
            try {
              await api.post('/admin/accounting/adjustments', {
                lawyer_id: Number(v.lawyer_id),
                amount: v.amount,
                description: v.description,
                case_id: v.case_id ? Number(v.case_id) : null,
              });
            } catch (err) {
              f.showError(err);
              return false;
            }
            toast(`تم تسجيل القيد للمحامي ${lawyerName(v.lawyer_id)}`, 'success');
            if (ledger.rendered) loadLedger();
            return undefined;
          },
        },
      ],
    });
    return m;
  }

  function ledgerPanel() {
    ledger.rendered = true;
    const lawyerSel = selectInput({
      label: 'المحامي',
      allLabel: 'كل المحامين',
      value: ledger.lawyer_id,
      options: lawyers.map((l) => ({ value: String(l.lawyer_id), label: l.name })),
      onChange: (v) => {
        ledger.lawyer_id = v;
        ledger.selected.clear();
        syncUrl();
        loadLedger();
      },
    });
    const statusSel = selectInput({
      label: 'حالة القيد',
      allLabel: 'كل الحالات',
      value: ledger.status,
      options: options('ledger_status'),
      onChange: (v) => {
        ledger.status = v;
        syncUrl();
        loadLedger();
      },
    });
    const periodSel = selectInput({
      label: 'فترة القيد',
      allLabel: 'كل الفترات',
      value: ledger.period,
      options: recentPeriods(18, ledger.period).map((p) => ({ value: p, label: periodLabel(p) })),
      onChange: (v) => {
        ledger.period = v;
        syncUrl();
        loadLedger();
      },
    });
    loadLedger();
    return h('div.stack', filterBar([lawyerSel, statusSel, periodSel]), ledgerHost);
  }

  // ───────────── تبويب: تكلفة الملفات ─────────────
  function costsPanel() {
    const closed = [...(summary.closed_cases || [])].sort((a, b) => (b.total || 0) - (a.total || 0));
    const byArea = [...(summary.by_area || [])].sort((a, b) => (b.average || 0) - (a.average || 0));
    const intro = h(
      'p.pd-section-hint.pd-intro',
      'التكلفة الفعلية لكل ملف أُغلق خلال الفترة: أتعاب مباشرة + مصروفات دفعتها المؤسسة + حصة تقديرية من المبالغ الشهرية والباقات، مع قيمة المساهمات التطوعية منفصلة.',
    );
    if (!closed.length) {
      return h(
        'div.stack',
        intro,
        emptyState(
          `لم يُغلق أي ملف خلال ${pl}`,
          button(`عرض ${periodLabel(shiftPeriod(period, -1))}`, {
            icon: 'arrowRight',
            href: `#/accounting?period=${shiftPeriod(period, -1)}&tab=costs`,
          }),
          { icon: 'briefcase' },
        ),
      );
    }
    const totalCost = closed.reduce((s, c) => s + (Number(c.total) || 0), 0);
    const totalPb = closed.reduce((s, c) => s + (Number(c.pro_bono_value) || 0), 0);
    const multiCount = closed.filter((c) => c.team_size > 1).length;
    const topCost = byArea[0];
    const topMulti = [...byArea].filter((a) => a.multi_specialty > 0).sort((a, b) => b.multi_specialty / b.cases - a.multi_specialty / a.cases || b.cases - a.cases)[0];
    const maxAvg = Math.max(...byArea.map((a) => Number(a.average) || 0), 1);

    const insight = (iconName, title, value, sub, tone) =>
      h('div.pd-insight', { class: `tone-${tone}` }, h('span.pd-insight-icon', icon(iconName, { size: 18 })), h('div', h('div.pd-insight-title', title), h('div.pd-insight-value', value), sub && h('div.cell-sub', sub)));

    return h(
      'div.stack-lg',
      intro,
      h(
        'div.pd-insights',
        insight('wallet', 'إجمالي تكلفة الملفات المغلقة', money(totalCost), `${num(closed.length)} ملفات — متوسط ${money(totalCost / closed.length)} للملف`, 'primary'),
        topCost && insight('alert', 'الأعلى تكلفة في المتوسط', areaLabel(topCost.legal_area), `${money(topCost.average)} للملف الواحد`, 'warning'),
        topMulti
          ? insight('users', 'الأكثر احتياجًا لتعدد التخصصات', areaLabel(topMulti.legal_area), `${num(multiCount)} من ${num(closed.length)} ملفات مغلقة احتاجت فريقًا متعدد التخصصات`, 'accent')
          : insight('users', 'تعدد التخصصات', 'لا يوجد', 'لم يحتج أي ملف مغلق إلى أكثر من محامٍ', 'neutral'),
        insight('shieldCheck', 'قيمة المساهمات التطوعية', money(totalPb), 'القيمة التقديرية لعمل المتطوعين في هذه الملفات', 'success'),
      ),
      h(
        'section.section',
        h('h2.section-title', 'حسب المجال القانوني'),
        table({
          className: 'pd-table-tight',
          caption: 'تكلفة الملفات المغلقة حسب المجال',
          rows: byArea,
          columns: [
            { key: 'area', label: 'المجال', render: (a) => h('span.cell-title', areaLabel(a.legal_area)) },
            { key: 'cases', label: 'الملفات', align: 'center', render: (a) => num(a.cases) },
            { key: 'total', label: 'إجمالي التكلفة', align: 'end', render: (a) => moneyCell(a.total) },
            {
              key: 'average',
              label: 'متوسط تكلفة الملف',
              className: 'pd-col-bar',
              render: (a) =>
                h(
                  'div.pd-hbar',
                  h('div.pd-hbar-track', h('div.pd-hbar-fill', { style: { width: `${Math.max(2, ((Number(a.average) || 0) / maxAvg) * 100)}%` } })),
                  h('span.pd-hbar-val', money(a.average)),
                ),
            },
            {
              key: 'multi',
              label: 'تحتاج أكثر من تخصص',
              render: (a) =>
                h(
                  'div.pd-cell-stack',
                  h('span.nowrap', `${num(a.multi_specialty)} من ${num(a.cases)}`, ' ', h('bdi.muted', { dir: 'ltr' }, `(${percent(a.cases ? a.multi_specialty / a.cases : 0)})`)),
                  a.multi_specialty ? badge('متعدد التخصصات', 'accent') : null,
                ),
            },
          ],
        }),
      ),
      h(
        'section.section',
        h('h2.section-title', `الملفات المغلقة خلال ${pl}`),
        table({
          className: 'pd-table-tight',
          caption: 'تكلفة كل ملف مغلق',
          rows: closed,
          onRowClick: (c) => ctx.navigate(`/cases/${c.id}`),
          columns: [
            {
              key: 'code',
              label: 'الملف',
              className: 'col-wide',
              render: (c) => h('div', h('a', { href: `#/cases/${c.id}` }, codeTag(c.code)), h('div.cell-sub', c.title)),
            },
            { key: 'area', label: 'المجال', render: (c) => h('span.nowrap', areaLabel(c.legal_area)) },
            { key: 'direct', label: 'أتعاب مباشرة', align: 'end', render: (c) => moneyCell(c.direct) },
            { key: 'expenses', label: 'مصروفات', align: 'end', render: (c) => moneyCell(c.expenses) },
            { key: 'allocated', label: 'محمّل تقديريًا', align: 'end', render: (c) => moneyCell(c.allocated) },
            { key: 'total', label: 'الإجمالي', align: 'end', render: (c) => moneyCell(c.total, { strong: true, zeroMuted: false }) },
            { key: 'pb', label: 'قيمة تطوعية', align: 'end', render: (c) => (Number(c.pro_bono_value) ? moneyCell(c.pro_bono_value) : h('span.muted', '—')) },
            {
              key: 'team',
              label: 'الفريق',
              render: (c) => h('div.pd-cell-stack', h('span.nowrap', `${num(c.team_size)} ${c.team_size === 1 ? 'محامٍ' : 'محامين'}`), c.team_size > 1 ? badge('متعدد التخصصات', 'accent') : null),
            },
          ],
        }),
      ),
    );
  }

  const tabsEl = tabs(
    [
      { key: 'summary', label: 'المحامون والاتفاقات', icon: 'users', count: lawyers.length, render: summaryPanel },
      { key: 'ledger', label: 'دفتر المستحقات', icon: 'fileText', render: ledgerPanel },
      { key: 'costs', label: 'تكلفة الملفات', icon: 'chart', count: (summary.closed_cases || []).length, render: costsPanel },
    ],
    {
      active: activeTab,
      onChange: (key) => {
        activeTab = key;
        syncUrl();
      },
    },
  );

  const periodSel = periodSelect({
    label: 'الفترة المحاسبية',
    value: period,
    onChange: (v) => {
      replaceQuery('/accounting', { period: v === currentPeriod() ? '' : v, tab: activeTab === 'summary' ? '' : activeTab });
      ctx.reload();
    },
  });

  return frag(
    pageHeader({
      title: 'المحاسبة',
      subtitle: 'تعمل المحاسبة داخل نفس المنظومة: اتفاق كل محامٍ يحدد ما يحدث ماليًا عند تحقق واقعة الاستحقاق — دون إدخال يدوي للأتعاب.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'المحاسبة' }],
      actions: [h('div.pd-period-pick', h('span.pd-period-label', icon('calendar', { size: 16 }), 'الفترة'), periodSel), closeMonthBtn],
    }),
    h(
      'div.stats-grid.pd-stats-3',
      statCard({ label: `مستحقات ${pl}`, value: moneyValue(t.period_amount), hint: 'قيود الفترة غير الملغاة', icon: 'wallet', tone: 'primary' }),
      statCard({
        label: 'رصيد غير مصروف',
        value: moneyValue(t.unpaid_balance),
        hint: 'كل المستحقات التي لم تُصرف',
        icon: 'clock',
        tone: t.unpaid_balance > 0 ? 'warning' : 'neutral',
        onClick: () => {
          ledger.status = 'accrued';
          ledger.lawyer_id = '';
          ledger.period = '';
          const wasRendered = ledger.rendered;
          tabsEl.setActive('ledger');
          if (wasRendered) tabsEl.refresh('ledger');
          activeTab = 'ledger';
          syncUrl();
          tabsEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },
      }),
      statCard({ label: 'المصروف خلال الفترة', value: moneyValue(t.paid_in_period), hint: `عمليات الصرف في ${pl}`, icon: 'checkCircle', tone: 'success' }),
      statCard({ label: 'وقائع الاستحقاق', value: num(t.events), hint: 'مهام معتمدة خلال الفترة', icon: 'zap', tone: 'info' }),
      statCard({ label: 'وقائع تطوعية و CSR', value: num(t.pro_bono_events), hint: 'استشارات بلا مقابل مالي', icon: 'shieldCheck', tone: 'accent' }),
      statCard({ label: 'قيمة المساهمات', value: moneyValue(t.contribution_value), hint: 'القيمة التقديرية للعمل التطوعي', icon: 'star', tone: 'success' }),
    ),
    card({ body: tabsEl }),
  );
}

