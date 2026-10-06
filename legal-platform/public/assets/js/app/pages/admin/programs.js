// البرامج والتمويل — (الإصدار 9 — وحدة programs)
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'البرامج والتمويل' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
