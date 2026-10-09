// v10 b2b-staff (STF-2، U10-S08 «العمل») — «صلاحيات الذاكرة»: عناصر الذاكرة القانونية للشركة التي يراها المحامي في
// «سياق الشركة». عناصر «المفوَّضون بالتوقيع أو التمثيل» لا تُعرض هنا أبدًا (L-57: لا تُتاح للمحامين)، والمحامي يرى من كل
// عنصر الحقول المسموحة فقط ومستنداته ما دام الإسناد قائمًا وحتى 7 أيام بعد إغلاق الملف.

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { modal, badge, alertBox, toast, errorMessage, loading } from '../../lib/ui.js';
import { memoryKindByKey } from '../../lib/company-catalog.js';

/** هل يُتاح نوع العنصر للمحامين؟ (person أبدًا) */
export const grantable = (kind) => kind !== 'person' && memoryKindByKey(kind)?.grantable !== false;

/**
 * @param {object} o
 * @param {object} o.detail صفحة الطلب للفريق
 * @param {object} o.assignment صف الفريق { assignment_id, lawyer_name, role_label, memory_ids? }
 */
export async function openMemoryGrants({ detail, assignment, onDone } = {}) {
  const d = detail;
  const known = Array.isArray(assignment.memory_ids);
  const selected = new Set(known ? assignment.memory_ids.map(Number) : (d.memory_refs || []).filter((m) => grantable(m.kind)).map((m) => m.id));
  const listHost = h('div.cs-checklist', loading('جارٍ تحميل الذاكرة القانونية…'));
  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });
  let saved = null;

  const handle = modal({
    sheet: true,
    className: 'cs-sheet cs-grants',
    title: 'صلاحيات الذاكرة',
    subtitle: `${assignment.lawyer_name} — ${assignment.role_label || ''}`,
    body: h(
      'div.stack',
      h('p.cs-note', 'يرى المحامي من كل عنصر الحقول المسموحة فقط ومستنداته، ما دام الإسناد قائمًا وحتى 7 أيام بعد إغلاق الملف. لا تُتاح عناصر «المفوَّضون بالتوقيع أو التمثيل» للمحامين.'),
      known ? null : h('p.cs-note', 'الاختيار المبدئي: عناصر الذاكرة المرتبطة بالطلب. يحل حفظك محل ما أُتيح لهذا المحامي من قبل.'),
      alertHost,
      listHost,
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'حفظ الصلاحيات',
        variant: 'primary',
        icon: 'check',
        onClick: async () => {
          try {
            saved = await api.put(`/admin/assignments/${assignment.assignment_id}/memory-grants`, { memory_ids: [...selected] });
            return undefined;
          } catch (err) {
            mount(alertHost, alertBox(errorMessage(err), 'danger'));
            return false;
          }
        },
      },
    ],
    onClose: () => {
      if (!saved) return;
      toast(`حُفظت صلاحيات الذاكرة (${saved.memory_ids.length}).`, 'success');
      if (onDone) onDone(saved);
    },
  });

  try {
    const mem = await api.get(`/admin/companies/${d.company.id}/memory`);
    const items = (mem.items || []).filter((m) => grantable(m.kind) && !m.archived);
    mount(
      listHost,
      items.length
        ? items.map((m) =>
            h(
              'label.check',
              h('input', { type: 'checkbox', checked: selected.has(m.id), onChange: (e) => (e.target.checked ? selected.add(m.id) : selected.delete(m.id)) }),
              h('span', `${m.kind_label} · `, h('span', { dir: 'auto' }, m.title), m.kind === 'position' ? badge('موقف معتمد', 'info') : null, m.under_review ? badge('قيد المراجعة', 'warning') : null),
            ),
          )
        : h('p.muted', 'لا عناصر في ذاكرة الشركة يمكن إتاحتها للمحامين.'),
    );
  } catch (err) {
    mount(listHost, alertBox(errorMessage(err), 'danger'));
  }
  return handle;
}
