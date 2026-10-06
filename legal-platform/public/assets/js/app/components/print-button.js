// زر الطباعة الموحد — (الإصدار 9 — وحدة programs)
// printButton({ kind, id, label }) يفتح المستند في تبويب جديد على #/print/:kind/:id ويظهر فيه حوار الطباعة تلقائيًا.
// الأنواع: invoice | receipt | answer | statement | case-summary | programme
// الصلاحيات تُفرض في الخادم (GET /api/print/:kind/:id)؛ الزر مجرد رابط.

import { h, svg } from '../../lib/h.js';

/** أيقونة طابعة خطية (نفس أسلوب أيقونات ui.js). */
export function printIcon(size = 18) {
  return svg(
    'svg',
    {
      class: 'icon icon-printer',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      'aria-hidden': 'true',
    },
    svg('polyline', { points: '6 9 6 2 18 2 18 9' }),
    svg('path', { d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' }),
    svg('rect', { x: 6, y: 14, width: 12, height: 8 }),
  );
}

/** رابط صفحة الطباعة داخل التطبيق: '#/print/invoice/12?auto=1' */
export function printHref(kind, id, query = {}) {
  const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v != null && v !== '')).toString();
  return `#/print/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
}

/**
 * زر «طباعة» يفتح المستند في تبويب جديد.
 * @param {{kind:string, id:number|string, label?:string, query?:object, size?:'sm'|'md'|'lg',
 *          variant?:string, auto?:boolean, title?:string, className?:string}} opts
 *   auto=true (الافتراضي): يظهر حوار الطباعة فور تحميل المستند. query: معاملات إضافية (مثل from/to لكشف الحساب).
 */
export function printButton({ kind, id, label = 'طباعة', query, size = 'sm', variant = 'secondary', auto = true, title, className } = {}) {
  const q = { ...(query || {}) };
  if (auto) q.auto = '1';
  const hasLabel = label != null && label !== '';
  const hint = `${title || (hasLabel ? label : 'طباعة')} — يفتح في تبويب جديد`;
  return h(
    'a',
    {
      class: ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, !hasLabel && 'btn-icon', 'no-print', 'print-btn', className],
      href: printHref(kind, id, q),
      target: '_blank',
      rel: 'noopener',
      title: hint,
      'aria-label': hint,
    },
    printIcon(size === 'sm' ? 16 : size === 'lg' ? 20 : 18),
    hasLabel && h('span.btn-label', label),
  );
}
