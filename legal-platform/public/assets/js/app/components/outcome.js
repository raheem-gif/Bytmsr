// قيمة الأثر المتحقق لملف استشارة أو ملف مستمر: نوع الأثر والحقوق المستردة (دفعة واحدة وشهريًا) — لتقرير الأثر.
// (الإصدار 9 — وحدة practice)
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { options, label, money, dateTime } from '../../lib/fmt.js';
import { card, button, kv, emptyState, loading, errorState, formDialog, toast, badge } from '../../lib/ui.js';

/** حقول الأثر لاستخدامها داخل نوافذ أخرى (مثل نافذة إغلاق الملف) */
export function outcomeFields({ required = false } = {}) {
  return [
    {
      name: 'outcome_kind',
      label: 'الأثر المتحقق للمستفيد',
      type: 'select',
      required,
      options: options('outcome_kind'),
      placeholder: '— لم يُحدَّد بعد —',
      hint: 'يُستخدم في تقرير الأثر للمجلس والجهات المانحة ووزارة التضامن.',
    },
    { name: 'recovered_one_time', label: 'حقوق مستردة دفعة واحدة', type: 'money', min: 0, hint: 'مثل نصيب ميراث أو متجمد نفقة أو تعويض.' },
    { name: 'recovered_monthly', label: 'حقوق شهرية مستردة', type: 'money', min: 0, hint: 'مثل نفقة شهرية أو معاش أو تكافل وكرامة.' },
    { name: 'outcome_notes', label: 'ملاحظات الأثر', type: 'textarea', rows: 2, maxLength: 2000 },
  ];
}

/** يحوّل قيم الحقول إلى جسم الطلب (أو undefined إن لم يُختر نوع أثر ولم تُدخل قيم) */
export function outcomePayload(v) {
  const any = v.outcome_kind || v.recovered_one_time || v.recovered_monthly || v.outcome_notes;
  if (!any) return undefined;
  return {
    outcome_kind: v.outcome_kind || null,
    recovered_one_time: v.recovered_one_time ?? null,
    recovered_monthly: v.recovered_monthly ?? null,
    notes: v.outcome_notes || null,
  };
}

/**
 * بطاقة الأثر المتحقق. kind: 'case' | 'matter'
 * @returns {HTMLElement}
 */
export function outcomeCard({ kind, id, title = 'الأثر المتحقق للمستفيد' }) {
  const base = kind === 'matter' ? `/admin/matters/${id}/outcome-value` : `/admin/cases/${id}/outcome-value`;
  const body = h('div.v9p-outcome', loading());
  const editBtn = button('تسجيل الأثر', { size: 'sm', icon: 'edit', onClick: () => edit() });
  const el = card({ title, subtitle: 'الحقوق التي استردها المستفيد بفضل الخدمة', icon: 'star', actions: editBtn, body, className: 'v9p-outcome-card' });
  let current = null;

  async function load() {
    mount(body, loading());
    try {
      current = await api.get(base);
      render();
    } catch (err) {
      mount(body, errorState(err, load));
    }
  }

  function render() {
    const o = current;
    editBtn.querySelector('.btn-label').textContent = o.outcome_kind ? 'تعديل' : 'تسجيل الأثر';
    if (!o.outcome_kind) {
      mount(
        body,
        emptyState(
          o.closed ? 'لم يُسجَّل الأثر المتحقق لهذا الملف بعد. سجّله ليُحتسب في تقرير الأثر.' : 'يُسجَّل الأثر عادةً عند إغلاق الملف، ويمكن تسجيله أو تعديله في أي وقت.',
          null,
          { compact: true, icon: 'star' },
        ),
      );
      return;
    }
    mount(
      body,
      h(
        'div.stack-sm',
        h('div.row', badge(label('outcome_kind', o.outcome_kind), 'success', { icon: 'checkCircle' })),
        kv([
          ['دفعة واحدة', o.recovered_one_time != null ? money(o.recovered_one_time) : null],
          ['شهريًا', o.recovered_monthly != null ? money(o.recovered_monthly) : null],
          ['القيمة السنوية التقديرية', o.annualized ? h('strong', money(o.annualized)) : null],
          o.notes && ['ملاحظات', h('span.pre', o.notes)],
          ['آخر تحديث', o.recorded_at ? dateTime(o.recorded_at) : null],
        ]),
      ),
    );
  }

  async function edit() {
    const o = current || {};
    const res = await formDialog({
      title: 'الأثر المتحقق للمستفيد',
      intro: 'سجّل ما استرده المستفيد فعليًا (بالجنيه المصري). القيمة السنوية = الدفعة الواحدة + الشهري × 12.',
      fields: outcomeFields(),
      values: { outcome_kind: o.outcome_kind, recovered_one_time: o.recovered_one_time, recovered_monthly: o.recovered_monthly, outcome_notes: o.notes },
      onSubmit: (v) =>
        api.put(base, {
          outcome_kind: v.outcome_kind || null,
          recovered_one_time: v.recovered_one_time ?? null,
          recovered_monthly: v.recovered_monthly ?? null,
          notes: v.outcome_notes || null,
        }),
    });
    if (res) {
      current = res;
      render();
      toast(res.outcome_kind ? 'حُفظ الأثر المتحقق' : 'أُزيل تسجيل الأثر', 'success');
    }
  }

  load();
  return el;
}
