// v10 b2b-staff (STF-5، U10-S14؛ مدير النظام فقط) — «عرض سعر للشركة»: عمل خارج الباقة أو طلب إضافي فوقها،
// بمبلغ ثابت أو بحد أقصى فقط (L-31: لا تسعير بالساعة في 10.0). «عند موافقة الشركة» يبدأ العمل تلقائيًا بخطة البدء
// (ورقة القبول في وضع الخطة، L-61) أو يعود الطلب للفريق. المعاينة بمكوّن البوابة نفسه (coQuoteCard).

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { money } from '../../lib/fmt.js';
import { modal, form, button, icon, alertBox, toast, errorMessage, discardGuard } from '../../lib/ui.js';
import { coQuoteCard } from '../../lib/company-ui.js';

const KINDS = [
  { value: 'out_of_scope', label: 'خارج الباقة' },
  { value: 'overage', label: 'تكلفة إضافية' },
];
/** أساسا التسعير الوحيدان (L-31) */
export const QUOTE_BASES = [
  { value: 'fixed', label: 'مبلغ ثابت' },
  { value: 'capped', label: 'بحد أقصى' },
];
const fmtEgp = (n) => money(n);

/**
 * @param {object} o
 * @param {object} o.detail صفحة الطلب للفريق
 * @param {'out_of_scope'|'overage'} [o.kind]
 * @param {number} [o.amount] المبلغ المقترح (سعر الطلب الإضافي في الباقة)
 * @param {object} [o.plan] خطة بدء جاهزة (من ورقة القبول)
 * @param {string} [o.planSummary]
 */
export async function openQuoteSheet({ detail, user = {}, kind, amount = null, plan = null, planSummary = '', onDone } = {}) {
  const d = detail;
  const r = d.request;
  let basis = 'fixed';
  let acceptPlan = plan || null;
  let summary = planSummary || '';
  let auto = true;
  let result = null;
  let handle = null;
  const defKind = kind || (d.scope_check && d.scope_check.in_plan === false ? 'out_of_scope' : d.scope_check?.would_be === 'overage' ? 'overage' : 'out_of_scope');
  const v0 = { kind: defKind, amount: amount ?? null, scope_of_work: '', assumptions: '', excluded: '', valid_days: 14, message: '' };

  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });
  const f = form(
    [
      { name: 'kind', label: 'النوع', type: 'select', required: true, placeholder: false, options: KINDS, onChange: () => drawPreview() },
      { name: 'amount', label: 'المبلغ', type: 'money', required: true, min: 1, onChange: () => drawPreview() },
      { name: 'scope_of_work', label: 'نطاق العمل', type: 'textarea', required: true, minLength: 10, maxLength: 3000, rows: 4, full: true, dir: 'auto' },
      { name: 'assumptions', label: 'الافتراضات', type: 'textarea', maxLength: 2000, rows: 2, full: true, dir: 'auto' },
      { name: 'excluded', label: 'غير مشمول', type: 'textarea', maxLength: 2000, rows: 2, full: true, dir: 'auto' },
      { name: 'valid_days', label: 'صالح لمدة (يومًا)', type: 'number', integer: true, min: 1, max: 90, required: true },
      { name: 'message', label: 'رسالة مع العرض', type: 'textarea', maxLength: 2000, rows: 2, full: true, dir: 'auto' },
    ],
    { values: v0, footer: false },
  );
  f.el.addEventListener('input', () => drawPreview());

  // «أساس التسعير» مبلغ ثابت · بحد أقصى
  const seg = h('div.segmented.cs-basis', { role: 'group', 'aria-label': 'أساس التسعير' });
  function drawSeg() {
    mount(
      seg,
      QUOTE_BASES.map((b) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(basis === b.value),
            onClick: () => {
              basis = b.value;
              drawSeg();
              drawPreview();
            },
          },
          b.label,
        ),
      ),
    );
    const lbl = f.control('amount')?.wrap?.querySelector('.field-label, label');
    if (lbl && lbl.firstChild) lbl.firstChild.textContent = basis === 'capped' ? 'الحد الأقصى' : 'المبلغ';
  }

  // «عند موافقة الشركة»
  const planHost = h('div.cs-plan');
  const radio = (val, text) =>
    h(
      'label.check.cs-radio',
      h('input', {
        type: 'radio',
        name: `cs-plan-${r.id}`,
        checked: auto === val,
        onChange: () => {
          auto = val;
          drawPlan();
        },
      }),
      h('span', text),
    );
  function drawPlan() {
    mount(
      planHost,
      radio(true, 'يبدأ العمل تلقائيًا بخطة البدء'),
      auto
        ? h(
            'div.cs-plan-box',
            acceptPlan ? h('p', icon('check', { size: 14 }), ` ${summary || 'خطة البدء جاهزة'}`) : h('p.muted', 'لم تُعدّ خطة البدء بعد.'),
            button(acceptPlan ? 'تعديل خطة البدء' : 'إعداد خطة البدء', { variant: 'secondary', size: 'sm', icon: 'briefcase', onClick: setupPlan }),
          )
        : null,
      radio(false, 'يعود الطلب إليّ لأبدأ العمل'),
    );
  }
  async function setupPlan() {
    const { openAcceptSheet } = await import('./company-accept-sheet.js');
    await openAcceptSheet({
      detail: d,
      user,
      plan: acceptPlan,
      planMode: true,
      onPlanSaved: (body, s) => {
        acceptPlan = body;
        summary = s;
        auto = true;
        drawPlan();
      },
    });
  }

  const previewHost = h('div.cs-preview-card');
  function drawPreview() {
    const v = f.getValues();
    const amountText = fmtEgp(v.amount);
    const until = new Date(Date.now() + (Number(v.valid_days) || 14) * 86400000).toISOString();
    mount(
      previewHost,
      coQuoteCard(
        {
          number: `${d.company.prefix}-Q-…`,
          kind: v.kind,
          kind_label: KINDS.find((k) => k.value === v.kind)?.label,
          basis,
          basis_label: QUOTE_BASES.find((b) => b.value === basis)?.label,
          amount: basis === 'fixed' ? v.amount : null,
          cap: basis === 'capped' ? v.amount : null,
          amount_text: amountText,
          currency: 'EGP',
          scope_of_work: v.scope_of_work,
          assumptions: v.assumptions || null,
          excluded: v.excluded || null,
          valid_until: until,
          status: 'sent',
          status_label: 'بانتظار الموافقة',
        },
        {},
      ),
    );
  }

  async function submit() {
    mount(alertHost);
    if (!f.validate()) return false;
    if (auto && !acceptPlan) {
      mount(alertHost, alertBox('أعدّ خطة البدء، أو اختر «يعود الطلب إليّ لأبدأ العمل».', 'danger'));
      return false;
    }
    const v = f.getValues();
    const body = {
      rev: d.rev,
      kind: v.kind,
      basis,
      scope_of_work: v.scope_of_work,
      assumptions: v.assumptions || undefined,
      excluded: v.excluded || undefined,
      valid_days: v.valid_days,
      message: v.message || undefined,
      accept_plan: auto ? acceptPlan : undefined,
    };
    if (basis === 'capped') body.cap = v.amount;
    else body.amount = v.amount;
    try {
      result = await api.post(`/admin/company-requests/${r.id}/quote`, body);
      return true;
    } catch (err) {
      f.showError(err);
      mount(alertHost, alertBox(errorMessage(err), 'danger'));
      return false;
    }
  }

  const isDirty = () => {
    const v = f.getValues();
    return ['scope_of_work', 'assumptions', 'excluded', 'message'].some((k) => String(v[k] || '') !== '');
  };
  handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-quote',
    title: 'عرض سعر للشركة',
    subtitle: `${r.code} — ${d.company.name}`,
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body.cs-two',
      h(
        'div.cs-col',
        alertHost,
        h('div.field', h('span.field-label', 'أساس التسعير'), seg),
        f.el,
        h('div.field', h('span.field-label', 'عند موافقة الشركة'), planHost),
      ),
      h('div.cs-col', h('h3.cs-section-title', 'كما ستراه الشركة'), previewHost),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      { label: 'إرسال العرض للشركة', variant: 'primary', icon: 'send', onClick: async () => ((await submit()) ? undefined : false) },
    ],
    onClose: () => {
      if (!result) return;
      toast(`أُرسل عرض السعر إلى ${d.company.name}.`, 'success');
      if (onDone) onDone(result);
    },
  });
  drawSeg();
  drawPlan();
  drawPreview();
  return handle;
}
