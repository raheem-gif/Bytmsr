// تقرير الأثر — (الإصدار 9 — وحدة practice)
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'تقرير الأثر' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
