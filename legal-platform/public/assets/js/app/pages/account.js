// حسابي والأمان — (الإصدار 9 — وحدة accounts)
import { frag } from '../../lib/h.js';
import { pageHeader, card, emptyState } from '../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'حسابي والأمان' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
