// الردود الجاهزة وقوالب واتساب — (الإصدار 9 — وحدة messaging)
import { frag } from '../../../lib/h.js';
import { pageHeader, card, emptyState } from '../../../lib/ui.js';

export default async function render() {
  return frag(pageHeader({ title: 'الردود الجاهزة وقوالب واتساب' }), card({ body: emptyState('هذه الصفحة قيد الإنشاء') }));
}
