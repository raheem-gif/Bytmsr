// الإصدار 10 — «المزيد» على الهاتف (U10-77 مع §8.3): الفريق (مدير البوابة) · الباقة والاستخدام · بيانات الشركة والكيانات ·
// الإشعارات · حسابي والأمان · «مدير علاقتكم لدينا: {الاسم}» (أو لا شيء) · تسجيل الخروج. لا «الفواتير» ولا «سجل الدخول» (L-31، L-36).
import { h } from '../../lib/h.js';
import { getMeta } from '../../lib/fmt.js';
import { icon, kRow } from '../../lib/ui.js';
import { copy, copyParts } from '../../lib/company-ui-core.js';
import { W } from '../words.js';
import { S, isAdmin } from '../state.js';
import { pageHead } from '../common.js';

export default function more() {
  const unread = S.unread ? h('span.co-side-badge.num', String(S.unread)) : null;
  const mgr = S.home?.account_manager?.name;
  const meta = getMeta() || {};
  return h(
    'div.co-page.co-more',
    pageHead(W.nav.more),
    h(
      'ul.k-list',
      isAdmin() ? h('li', kRow({ icon: 'users', title: W.nav.team, href: '#/team' })) : null,
      h('li', kRow({ icon: 'chart', title: W.nav.plan, href: '#/plan' })),
      h('li', kRow({ icon: 'building', title: W.nav.company_more, href: '#/company' })),
      h('li', kRow({ icon: 'bell', title: W.nav.notifications, badges: unread, href: '#/notifications' })),
      h('li', kRow({ icon: 'lock', title: W.nav.account, href: '#/account' })),
    ),
    mgr ? h('ul.k-list.co-more-info', h('li', kRow({ icon: 'user', title: copy('nav.manager', { name: mgr }) }))) : null,
    h('ul.k-list.co-more-logout', h('li', kRow({ icon: icon('logout', { size: 22 }), title: W.nav.logout, onClick: () => window.dispatchEvent(new CustomEvent('co:logout')), className: 'is-danger', chevron: false }))),
    h('p.co-more-foot', copyParts('brand.version', { short: h('bdi', { dir: 'ltr', lang: 'en' }, meta.brand?.short || ''), version: String(meta.version || '').replace(/\.0$/, '') })),
  );
}
