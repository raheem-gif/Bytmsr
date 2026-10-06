// صفحة مؤقتة — تُستبدل بالتنفيذ الكامل.
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'كشف حسابي' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
