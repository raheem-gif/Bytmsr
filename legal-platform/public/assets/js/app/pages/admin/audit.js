// سجل الأمان — (الإصدار 9 — وحدة accounts)
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'سجل الأمان' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
