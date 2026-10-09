// الإصدار 10 — «الإشعارات» `#/notifications` (U10-74): «اليوم» / «سابقًا»؛ الصف: أيقونة النوع، العنوان (من الخادم، ومعه كود الطلب)،
// الوقت النسبي، ونقطة غير المقروء؛ الضغط يفتح الرابط ويعلّمه مقروءًا، و«تعليم الكل كمقروء». الخادم يحذف أجسام إشعارات الطلبات
// التي لم تعد ظاهرة للمستخدم (L-51).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative } from '../../lib/fmt.js';
import { icon, button, emptyState, toast, errorMessage } from '../../lib/ui.js';
import { W } from '../words-pages.js';
import { pageHead, errorView, sectionCard } from '../common.js';

const N = W.notif;
const ICON = [
  [/clarification/, 'alert'],
  [/quote|charge|overage/, 'wallet'],
  [/deliverable|delivered/, 'checkCircle'],
  [/renewal|memory|key_date/, 'calendarClock'],
  [/security|password|2fa/, 'lock'],
  [/team|invite|user/, 'users'],
  [/company\.|trial|suspended/, 'building'],
];
const iconOf = (type) => (ICON.find(([re]) => re.test(String(type || ''))) || [null, 'inbox'])[1];
const dayKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(iso));

export default async function notificationsPage(ctx) {
  let res;
  try {
    res = await api.get('/company/notifications', { limit: 100 });
  } catch (err) {
    return errorView(W.nav.notifications, err, () => ctx.reload());
  }
  const items = res.items || [];
  const today = dayKey(new Date().toISOString());
  const row = (n) =>
    h(
      'li',
      h(
        'a.co-notif-row.co-notif-page-row',
        {
          href: n.link && n.link.startsWith('#/') ? n.link : '#/notifications',
          class: !n.read_at && 'is-unread',
          onClick: () => {
            if (!n.read_at) api.post(`/company/notifications/${encodeURIComponent(n.id)}/read`, {}).then(() => window.dispatchEvent(new CustomEvent('co:notifications'))).catch(() => {});
          },
        },
        h('span.co-notif-ic', { 'aria-hidden': 'true' }, icon(iconOf(n.type), { size: 20 })),
        h(
          'span.co-notif-text',
          h('span.co-notif-title', { dir: 'auto' }, n.title),
          n.body ? h('span.co-notif-body', { dir: 'auto' }, n.body) : null,
          h('span.co-notif-time', relative(n.created_at), !n.read_at ? h('span.sr-only', ` · ${N.unread}`) : null),
        ),
        h('span.co-notif-dot', { 'aria-hidden': 'true' }),
      ),
    );
  const groups = [
    [N.today, items.filter((n) => dayKey(n.created_at) === today)],
    [N.earlier, items.filter((n) => dayKey(n.created_at) !== today)],
  ].filter(([, list]) => list.length);
  const listEl = h('div');
  mount(listEl, groups.length ? groups.map(([title, list]) => sectionCard(title, h('ul.co-notif-list.co-notif-page', list.map(row)))) : sectionCard(null, emptyState(W.nav.no_notifications, null, { icon: 'bell' })));
  const markAll = res.unread
    ? button(W.nav.mark_all_read, {
        variant: 'secondary',
        icon: 'check',
        onClick: async () => {
          try {
            await api.post('/company/notifications/read-all', {});
          } catch (e) {
            return toast(errorMessage(e), 'danger');
          }
          window.dispatchEvent(new CustomEvent('co:notifications'));
          ctx.reload();
        },
      })
    : null;
  return h('div.co-page.co-notifications', pageHead(W.nav.notifications, N.sub, { actions: markAll }), listEl);
}
