// صفحة مؤقتة — تُستبدل بالتنفيذ الكامل.
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render(ctx) {
  return frag(pageHeader({ title: 'ملف المحامي', breadcrumbs: [{ label: 'شبكة المحامين', href: '#/lawyers' }, { label: `#${ctx.params.id}` }] }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
