// هيكل التطبيق: الشريط الجانبي، الشريط العلوي، جرس الإشعارات، ودرج الجوال.

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { label, relative, dateTime } from '../lib/fmt.js';
import { icon, avatar, button, brandMark, loading, emptyState, richText } from '../lib/ui.js';
import { notifIcon, markRead, followLink } from './notif.js';
import { createSearch } from './components/search.js'; // v9 practice: البحث الشامل Ctrl/⌘+K

const POLL_MS = 30000;
const DROPDOWN_LIMIT = 8;

/** عناصر القائمة حسب الدور. */
export function navGroups(user, meta) {
  const notifications = { href: '/notifications', label: 'الإشعارات', icon: 'bell', notif: true };
  const account = { href: '/account', label: 'حسابي والأمان', icon: 'shield' };
  if (user.role === 'lawyer') {
    return [
      {
        title: 'بوابة المحامي',
        items: [
          { href: '/my', label: 'ملفاتي', icon: 'briefcase' },
          { href: '/my/matters', label: 'الملفات المستمرة', icon: 'gavel' },
          { href: '/my/calendar', label: 'تقويمي', icon: 'calendar' },
          { href: '/my/statement', label: 'كشف حسابي', icon: 'wallet' },
        ],
      },
      { title: 'عام', items: [notifications, account] },
    ];
  }
  const isAdmin = user.role === 'admin';
  const groups = [
    {
      title: 'التشغيل اليومي',
      items: [
        { href: '/dashboard', label: 'لوحة المتابعة', icon: 'home' },
        { href: '/inbox', label: 'صندوق الوارد الموحد', icon: 'inbox' },
        { href: '/queue', label: 'بانتظار قرار الإدارة', icon: 'queue' },
        { href: '/cases', label: 'ملفات الاستشارات', icon: 'briefcase' },
        { href: '/matters', label: 'الملفات المستمرة', icon: 'gavel' },
        { href: '/clients', label: 'العملاء والمستفيدون', icon: 'users' },
        { href: '/calendar', label: 'التقويم', icon: 'calendar' },
      ],
    },
    {
      title: 'الشبكة والمالية والبرامج',
      items: [
        { href: '/lawyers', label: 'شبكة المحامين', icon: 'scale' },
        isAdmin && { href: '/accounting', label: 'المحاسبة', icon: 'wallet' },
        { href: '/programs', label: 'البرامج والتمويل', icon: 'book' },
        { href: '/conflicts', label: 'فحص تعارض المصالح', icon: 'shieldCheck' },
      ],
    },
    {
      title: 'الأثر والمعرفة والتواصل',
      items: [
        { href: '/impact', label: 'تقرير الأثر', icon: 'star' },
        { href: '/automations', label: 'الأتمتة والرسائل', icon: 'zap' },
        { href: '/quick-replies', label: 'الردود الجاهزة والقوالب', icon: 'message' },
        { href: '/knowledge', label: 'المعرفة المؤسسية والذكاء الاصطناعي', icon: 'sparkle' },
        { href: '/analytics', label: 'التسويق والتحليلات', icon: 'chart' },
      ],
    },
    {
      title: 'النظام',
      items: [
        meta && meta.demo && { href: '/simulator', label: 'محاكي واتساب', icon: 'whatsapp' },
        isAdmin && { href: '/settings', label: 'الإعدادات والمستخدمون', icon: 'settings' },
        isAdmin && { href: '/integrations', label: 'التكاملات', icon: 'link' },
        isAdmin && { href: '/system', label: 'صحة النظام والنسخ الاحتياطي', icon: 'refresh' },
        isAdmin && { href: '/audit', label: 'سجل الأمان', icon: 'lock' },
        isAdmin && { href: '/data', label: 'استيراد وتصدير البيانات', icon: 'download' },
        account,
        notifications,
      ],
    },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length);
}

/**
 * يبني هيكل التطبيق.
 * @returns {{el:HTMLElement, outlet:HTMLElement, main:HTMLElement, setTitle:(t:string)=>void,
 *            setActive:(path:string)=>void, refresh:()=>Promise<void>, destroy:()=>void}}
 */
export function createShell({ user, meta, onLogout }) {
  const settings = (meta && meta.settings) || {};
  const orgName = settings.org_name || 'بيوت مصر';
  let unread = 0;
  let pollTimer = null;
  let destroyed = false;
  let latest = [];

  // ── الشريط الجانبي ──
  const navLinks = [];
  const navCounts = [];
  const groups = navGroups(user, meta);
  const nav = h(
    'nav.nav',
    { 'aria-label': 'القائمة الرئيسية' },
    groups.map((g) => {
      const titleId = `nav-g-${Math.random().toString(36).slice(2, 8)}`;
      return h(
        'div.nav-group',
        h('div.nav-group-title', { id: titleId }, g.title),
        h(
          'ul',
          { 'aria-labelledby': titleId },
          g.items.map((item) => {
            const countEl = item.notif ? h('span.nav-count', { hidden: true, 'aria-hidden': 'true' }) : null;
            if (countEl) navCounts.push(countEl);
            const a = h(
              'a.nav-link',
              { href: `#${item.href}`, dataset: { path: item.href } },
              icon(item.icon, { size: 19 }),
              h('span.nav-label', item.label),
              countEl,
            );
            a.addEventListener('click', () => closeDrawer(false));
            navLinks.push(a);
            return h('li', a);
          }),
        ),
      );
    }),
  );

  const sidebar = h(
    'aside.sidebar#app-sidebar',
    { 'aria-label': 'التنقل' },
    h(
      'a.brand',
      { href: '#/' },
      brandMark({ size: 24 }),
      h('span.brand-text', h('span.brand-name', orgName), h('span.brand-sub', 'منصة التشغيل القانوني')),
    ),
    nav,
    h(
      'div.sidebar-footer',
      h('div', meta && meta.demo ? 'نسخة تجريبية — البيانات المعروضة وهمية' : settings.org_tagline || orgName),
      // رقم الإصدار (وحدة platform): «الإصدار 9.0» من app.version في /api/meta
      h('div.sidebar-version', { title: meta && meta.version ? `الإصدار ${meta.version}` : null }, `الإصدار ${String((meta && meta.version) || '9.0').split('.').slice(0, 2).join('.')}`),
    ),
  );
  const backdrop = h('div.sidebar-backdrop', { onClick: () => closeDrawer(true) });

  // ── الشريط العلوي ──
  const menuBtn = h(
    'button.icon-btn.topbar-menu',
    { type: 'button', 'aria-label': 'فتح القائمة', 'aria-controls': 'app-sidebar', 'aria-expanded': 'false' },
    icon('menu', { size: 22 }),
  );
  const titleEl = h('div.topbar-title');
  const bellCount = h('span.bell-count', { hidden: true, 'aria-hidden': 'true' });
  const bellBtn = h(
    'button.icon-btn',
    { type: 'button', 'aria-label': 'الإشعارات', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'notif-dropdown' },
    icon('bell', { size: 21 }),
    bellCount,
  );
  const ddBody = h('div.dropdown-body');
  const markAllBtn = button('تحديد الكل كمقروء', { variant: 'link', size: 'sm', onClick: markAll });
  const dropdown = h(
    'section.dropdown#notif-dropdown',
    { hidden: true, 'aria-label': 'أحدث الإشعارات' },
    h('div.dropdown-head', h('h2.dropdown-title', 'الإشعارات'), markAllBtn),
    ddBody,
    h(
      'div.dropdown-foot',
      button('عرض الكل', { variant: 'ghost', size: 'sm', href: '#/notifications', block: true, onClick: () => closeDropdown(false) }),
    ),
  );
  const bellWrap = h('div.dropdown-anchor', bellBtn, dropdown);

  const logoutBtn = h(
    'button.icon-btn',
    { type: 'button', 'aria-label': 'تسجيل الخروج', title: 'تسجيل الخروج', onClick: () => onLogout && onLogout() },
    icon('logout', { size: 20 }),
  );

  const globalSearch = createSearch({ user });
  const topbar = h(
    'header.topbar',
    menuBtn,
    titleEl,
    h(
      'div.topbar-actions',
      globalSearch.button,
      bellWrap,
      h(
        'div.user-chip',
        avatar(user.name, { size: 'md' }),
        h('div.user-meta', h('span.user-name', user.name), h('span.user-role', label('user_role', user.role))),
      ),
      logoutBtn,
    ),
  );

  const outlet = h('div.page');
  const main = h('main.content#main', { tabindex: '-1' }, outlet);
  const mainCol = h('div.main-col', topbar, main);
  const skip = h('button.skip-link', { type: 'button', onClick: () => main.focus() }, 'تخطَّ إلى المحتوى');
  const el = h('div.app-shell', skip, sidebar, backdrop, mainCol);

  // ── درج الجوال ──
  const mobileQuery = window.matchMedia('(max-width: 1024px)');
  function openDrawer() {
    el.classList.add('drawer-open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'إغلاق القائمة');
    mainCol.inert = true;
    const active = sidebar.querySelector('.nav-link.is-active') || sidebar.querySelector('.nav-link');
    if (active) setTimeout(() => active.focus(), 50);
  }
  function closeDrawer(restoreFocus) {
    if (!el.classList.contains('drawer-open')) return;
    el.classList.remove('drawer-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'فتح القائمة');
    mainCol.inert = false;
    if (restoreFocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => (el.classList.contains('drawer-open') ? closeDrawer(true) : openDrawer()));
  const onMediaChange = () => {
    if (!mobileQuery.matches) closeDrawer(false);
  };
  mobileQuery.addEventListener('change', onMediaChange);

  // ── الإشعارات ──
  function setUnread(n) {
    unread = Math.max(0, Number(n) || 0);
    const text = unread > 99 ? '99+' : String(unread);
    bellCount.textContent = text;
    bellCount.hidden = unread === 0;
    bellBtn.setAttribute('aria-label', unread ? `الإشعارات، غير المقروءة: ${unread}` : 'الإشعارات');
    navCounts.forEach((c) => {
      c.textContent = text;
      c.hidden = unread === 0;
    });
    markAllBtn.hidden = unread === 0;
  }

  function renderDropdown() {
    if (!latest.length) {
      mount(ddBody, emptyState('لا توجد إشعارات حتى الآن', null, { compact: true, icon: 'bell' }));
      return;
    }
    mount(
      ddBody,
      h(
        'ul.notif-list',
        latest.slice(0, DROPDOWN_LIMIT).map((n) =>
          h(
            'li',
            h(
              'button.notif-item',
              { type: 'button', class: !n.read_at && 'is-unread', onClick: () => openItem(n) },
              h('span.notif-icon', icon(notifIcon(n.type), { size: 18 })),
              h(
                'span.notif-text',
                h('span.notif-title', richText(n.title)),
                n.body && h('span.notif-body', richText(n.body)),
                h('time.notif-time', { datetime: n.created_at, title: dateTime(n.created_at) }, relative(n.created_at)),
              ),
              !n.read_at && h('span.unread-dot', h('span.sr-only', 'غير مقروء')),
            ),
          ),
        ),
      ),
    );
  }

  async function poll() {
    if (destroyed) return;
    try {
      // طلب خلفية: لا يمدّد مهلة عدم النشاط للجلسة (وحدة الحسابات)
      const data = await api.get('/notifications', undefined, { background: true });
      if (destroyed) return;
      latest = Array.isArray(data && data.items) ? data.items : [];
      setUnread(data && data.unread != null ? data.unread : latest.filter((n) => !n.read_at).length);
      if (!dropdown.hidden) renderDropdown();
    } catch {
      /* يُعاد المحاولة في الدورة التالية؛ 401 يُعالج عبر auth:expired */
    }
  }

  async function openItem(n) {
    closeDropdown(false);
    await markRead(n);
    setUnread(latest.filter((x) => !x.read_at).length);
    if (!followLink(n.link)) followLink('#/notifications');
  }

  async function markAll() {
    try {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      latest.forEach((n) => (n.read_at = n.read_at || now));
      setUnread(0);
      renderDropdown();
    } catch {
      /* يظهر الخطأ عند المحاولة التالية */
    }
  }

  function openDropdown() {
    dropdown.hidden = false;
    bellBtn.setAttribute('aria-expanded', 'true');
    if (latest.length) renderDropdown();
    else mount(ddBody, loading());
    poll();
  }

  function closeDropdown(restoreFocus) {
    if (dropdown.hidden) return;
    dropdown.hidden = true;
    bellBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) bellBtn.focus();
  }

  bellBtn.addEventListener('click', () => (dropdown.hidden ? openDropdown() : closeDropdown(false)));

  const onDocClick = (e) => {
    if (!dropdown.hidden && !bellWrap.contains(e.target)) closeDropdown(false);
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!dropdown.hidden) closeDropdown(true);
    else if (el.classList.contains('drawer-open')) closeDrawer(true);
  };
  const onVisibility = () => {
    if (!document.hidden) poll();
  };
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  pollTimer = setInterval(() => {
    if (!document.hidden) poll();
  }, POLL_MS);
  poll();

  return {
    el,
    outlet,
    main,
    setTitle(t) {
      titleEl.textContent = t || '';
      document.title = t ? `${t} — ${orgName}` : `منصة ${orgName} القانونية`;
    },
    setActive(path) {
      let best = null;
      for (const a of navLinks) {
        const p = a.dataset.path;
        if ((path === p || path.startsWith(`${p}/`)) && (!best || p.length > best.dataset.path.length)) best = a;
      }
      navLinks.forEach((a) => {
        const on = a === best;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      closeDropdown(false);
    },
    refresh: poll,
    destroy() {
      destroyed = true;
      clearInterval(pollTimer);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      globalSearch.destroy();
      mobileQuery.removeEventListener('change', onMediaChange);
    },
  };
}
