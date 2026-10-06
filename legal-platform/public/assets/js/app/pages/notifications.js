// صفحة الإشعارات: قائمة كاملة، تحديد كمقروء، تحديد الكل، وفتح الرابط المرتبط.

import { h, frag, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative, dateTime } from '../../lib/fmt.js';
import { pageHeader, card, emptyState, asyncButton, icon, toast, richText } from '../../lib/ui.js';
import { notifIcon, notifTone, markRead, followLink } from '../notif.js';

export default async function render(ctx) {
  const data = await api.get('/notifications');
  const items = Array.isArray(data && data.items) ? data.items : [];
  let filter = ctx.query.filter === 'unread' ? 'unread' : 'all';

  const listHost = h('div');
  const subtitle = h('p.page-subtitle');
  const unreadCount = () => items.filter((n) => !n.read_at).length;

  const markAllBtn = asyncButton(
    'تحديد الكل كمقروء',
    async () => {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      items.forEach((n) => (n.read_at = n.read_at || now));
      draw();
      ctx.refreshShell();
      toast('تم تحديد كل الإشعارات كمقروءة', 'success');
    },
    { icon: 'check', variant: 'secondary' },
  );

  const segAll = h('button.seg', { type: 'button', onClick: () => setFilter('all') });
  const segUnread = h('button.seg', { type: 'button', onClick: () => setFilter('unread') });
  const segmented = h('div.segmented', { role: 'group', 'aria-label': 'تصفية الإشعارات' }, segAll, segUnread);

  function setFilter(f) {
    filter = f;
    draw();
  }

  async function open(n) {
    const wasUnread = !n.read_at;
    await markRead(n);
    if (wasUnread) ctx.refreshShell();
    if (!followLink(n.link)) draw();
  }

  async function markOne(n) {
    await api.post(`/notifications/${encodeURIComponent(n.id)}/read`);
    n.read_at = new Date().toISOString();
    draw();
    ctx.refreshShell();
  }

  function row(n) {
    const unread = !n.read_at;
    return h(
      'li.notif-row',
      { class: unread && 'is-unread' },
      h(
        'button.notif-item',
        { type: 'button', class: unread && 'is-unread', onClick: () => open(n) },
        h('span.notif-icon', { class: notifTone(n.type) }, icon(notifIcon(n.type), { size: 18 })),
        h(
          'span.notif-text',
          h('span.notif-title', richText(n.title)),
          n.body && h('span.notif-body', richText(n.body)),
          h('time.notif-time', { datetime: n.created_at, title: dateTime(n.created_at) }, `${relative(n.created_at)} · ${dateTime(n.created_at)}`),
        ),
        unread && h('span.unread-dot', h('span.sr-only', 'غير مقروء')),
      ),
      unread &&
        h(
          'div.notif-row-actions',
          asyncButton('', () => markOne(n), { variant: 'ghost', size: 'sm', icon: 'check', title: 'تحديد كمقروء' }),
        ),
    );
  }

  function draw() {
    const unread = unreadCount();
    subtitle.textContent = unread ? `عدد الإشعارات غير المقروءة: ${unread}` : 'لا توجد إشعارات غير مقروءة';
    markAllBtn.hidden = unread === 0;
    mount(segAll, 'الكل', h('span.tab-count', String(items.length)));
    mount(segUnread, 'غير المقروءة', h('span.tab-count', String(unread)));
    segAll.setAttribute('aria-pressed', String(filter === 'all'));
    segUnread.setAttribute('aria-pressed', String(filter === 'unread'));

    const shown = filter === 'unread' ? items.filter((n) => !n.read_at) : items;
    if (!shown.length) {
      mount(
        listHost,
        emptyState(filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات حتى الآن', null, { icon: 'bell' }),
      );
      return;
    }
    mount(listHost, h('ul.notif-list', shown.map(row)));
  }

  draw();
  const header = pageHeader({ title: 'الإشعارات', actions: markAllBtn });
  header.querySelector('.page-header-text').append(subtitle);
  return frag(header, segmented, card({ body: listHost, flush: true }));
}
