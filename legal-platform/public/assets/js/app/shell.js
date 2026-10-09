// هيكل التطبيق: الشريط الجانبي، الشريط العلوي، جرس الإشعارات، ودرج الجوال.

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { label, relative, dateTime, staffChrome } from '../lib/fmt.js';
import { icon, avatar, button, brandMark, loading, emptyState, richText, wordmark } from '../lib/ui.js';
import { notifIcon, notifTone, markRead, followLink } from './notif.js';
import { createSearch } from './components/search.js'; // v9 practice: البحث الشامل Ctrl/⌘+K
import { routeTitle } from './routes.js';
import { enhanceLawyerShell, lawyerNavItems } from './lawyer-shell.js'; // v9.1 l-home: هيكل المحامي على الهاتف

const POLL_MS = 30000;
const DROPDOWN_LIMIT = 8;

/** عنصر قائمة: اسمه عنوان المسار نفسه (routeTitle) فلا تختلف القائمة عن عنوان الصفحة. */
const navItem = (href, iconName, extra = {}) => ({ href, label: routeTitle(href), icon: iconName, ...extra });

/** عناصر القائمة حسب الدور. */
export function navGroups(user, meta) {
  const notifications = navItem('/notifications', 'bell', { notif: true });
  const account = navItem('/account', 'shield');
  if (user.role === 'lawyer') {
    // v9.1 l-home (L-08): أسماء المحامي من words.js («اليوم»، «إسناداتي»، «مستحقاتي»، «حسابي»…)
    const L = lawyerNavItems();
    return [
      { title: 'بوابة المحامي', items: L.work },
      { title: 'عام', items: L.general },
    ];
  }
  const isAdmin = user.role === 'admin';
  const groups = [
    {
      title: 'التشغيل اليومي',
      items: [
        navItem('/dashboard', 'home'),
        navItem('/inbox', 'inbox'),
        navItem('/queue', 'queue'),
        navItem('/cases', 'briefcase'),
        navItem('/matters', 'gavel'),
        navItem('/clients', 'users'),
        navItem('/calendar', 'calendar'),
      ],
    },
    // v10 b2b-staff (H-S2): خدمة الشركات — العدد على «طلبات الشركات» من /admin/b2b/overview مع دورة الإشعارات
    { title: 'خدمة الشركات', items: [navItem('/company-requests', 'inboxStack', { coBadge: true }), navItem('/companies', 'building')] },
    {
      title: 'الشبكة والمالية والبرامج',
      items: [navItem('/lawyers', 'scale'), isAdmin && navItem('/accounting', 'wallet'), navItem('/programs', 'book'), navItem('/conflicts', 'shieldCheck')],
    },
    {
      title: 'الأثر والمعرفة والتواصل',
      items: [navItem('/impact', 'star'), navItem('/automations', 'zap'), navItem('/quick-replies', 'message'), navItem('/knowledge', 'sparkle'), navItem('/analytics', 'chart')],
    },
    {
      title: 'النظام',
      items: [
        meta && meta.demo && navItem('/simulator', 'whatsapp'),
        isAdmin && navItem('/settings', 'settings'),
        isAdmin && navItem('/integrations', 'link'),
        isAdmin && navItem('/system', 'refresh'),
        isAdmin && navItem('/audit', 'lock'),
        isAdmin && navItem('/data', 'download'),
        account,
        notifications,
      ],
    },
  ];
  return groups.map((g) => ({ ...g, items: g.items.filter(Boolean) })).filter((g) => g.items.length);
}

// ── طي مجموعات القائمة ──
// على الشاشات القصيرة (1366×768 مثلًا) لا تتسع القائمة لكل العناصر: تُطوى المجموعات غير الحالية تلقائيًا،
// وتبقى المجموعة التي فيها الصفحة الحالية مفتوحة دائمًا. اختيار المستخدم (فتح/طي) يُحفظ في هذا المتصفح فقط.
const NAV_STATE_KEY = 'bm-nav-groups';
function readNavState() {
  try {
    const v = JSON.parse(window.localStorage.getItem(NAV_STATE_KEY) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeNavState(state) {
  try {
    window.localStorage.setItem(NAV_STATE_KEY, JSON.stringify(state));
  } catch {
    /* تخزين المتصفح غير متاح: يبقى الاختيار لهذه الجلسة فقط */
  }
}

/**
 * يبني هيكل التطبيق.
 * @returns {{el:HTMLElement, outlet:HTMLElement, main:HTMLElement, setTitle:(t:string)=>void,
 *            setActive:(path:string)=>void, refresh:()=>Promise<void>, destroy:()=>void}}
 */
export function createShell({ user, meta, onLogout }) {
  const settings = (meta && meta.settings) || {};
  const orgName = settings.org_name || 'بيوت مصر';
  // v10 experience (L-03): اسم المكتب في القائمة الجانبية وعنوان التبويب (وإلا اسم المؤسسة كما في 9.2)
  const chrome = staffChrome();
  let unread = 0;
  let pollTimer = null;
  let destroyed = false;
  let latest = [];

  // ── الشريط الجانبي ──
  const navLinks = [];
  const navCounts = [];
  let coBadgeEl = null; // v10 b2b-staff (H-S2): عدد «طلبات الشركات» التي تحتاج الفريق
  const groups = navGroups(user, meta);
  const navState = readNavState(); // { [عنوان المجموعة]: true مفتوحة | false مطوية } باختيار المستخدم
  const groupCtl = []; // { title, el, links, set(open), userSet }
  const nav = h(
    'nav.nav',
    { 'aria-label': 'القائمة الرئيسية' },
    groups.map((g) => {
      const uidPart = Math.random().toString(36).slice(2, 8);
      const titleId = `nav-g-${uidPart}`;
      const listId = `nav-l-${uidPart}`;
      const groupLinks = [];
      // عنوان المجموعة زر طي/فتح (يُعلن حالته لقارئات الشاشة)
      const toggle = h(
        'button.nav-group-title.nav-group-toggle',
        { type: 'button', id: titleId, 'aria-expanded': 'true', 'aria-controls': listId },
        h('span', g.title),
        icon('chevronDown', { size: 14, className: 'nav-group-chev' }),
      );
      const ctl = { title: g.title, links: groupLinks, userSet: Object.prototype.hasOwnProperty.call(navState, g.title) };
      ctl.set = (open) => {
        ctl.open = open;
        toggle.setAttribute('aria-expanded', String(open));
        ctl.el.classList.toggle('is-collapsed', !open);
        list.hidden = !open;
      };
      toggle.addEventListener('click', () => {
        // المجموعة التي فيها الصفحة الحالية لا تُطوى (تبقى الصفحة الحالية ظاهرة في القائمة)
        if (ctl.open && groupLinks.some((a) => a.classList.contains('is-active'))) return;
        ctl.set(!ctl.open);
        ctl.userSet = true;
        navState[g.title] = ctl.open;
        writeNavState(navState);
        updateNavFade();
      });
      const list = h(
          'ul',
          { id: listId, 'aria-labelledby': titleId },
          g.items.map((item) => {
            const countEl = item.notif || item.coBadge ? h('span.nav-count', { hidden: true, 'aria-hidden': 'true' }) : null;
            if (countEl && item.notif) navCounts.push(countEl);
            if (countEl && item.coBadge) coBadgeEl = countEl; // v10 b2b-staff (H-S2)
            const a = h(
              'a.nav-link',
              { href: `#${item.href}`, dataset: { path: item.href } },
              icon(item.icon, { size: 19 }),
              h('span.nav-label', item.label),
              countEl,
            );
            a.addEventListener('click', () => closeDrawer(false));
            navLinks.push(a);
            groupLinks.push(a);
            return h('li', a);
          }),
      );
      ctl.el = h('div.nav-group', toggle, list);
      ctl.set(ctl.userSet ? navState[g.title] !== false : true);
      groupCtl.push(ctl);
      return ctl.el;
    }),
  );

  // تلاشي حافة القائمة حين يختفي جزء منها أسفل (أو أعلى) منطقة العرض: إشارة إلى أن فيها المزيد
  let navFadeRaf = 0;
  function updateNavFade() {
    if (navFadeRaf) return;
    navFadeRaf = requestAnimationFrame(() => {
      navFadeRaf = 0;
      const more = nav.scrollHeight - nav.clientHeight;
      nav.classList.toggle('more-below', more > 2 && nav.scrollTop < more - 2);
      nav.classList.toggle('more-above', more > 2 && nav.scrollTop > 2);
    });
  }
  nav.addEventListener('scroll', updateNavFade, { passive: true });
  let activeLink = null;
  let lastNavHeight = 0;
  // تغيّر ارتفاع النافذة (أو ظهور القائمة لأول مرة) يعيد حساب المجموعات المطوية
  const navResize =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (nav.clientHeight !== lastNavHeight) {
            lastNavHeight = nav.clientHeight;
            syncNavGroups(activeLink);
          } else updateNavFade();
        })
      : null;
  if (navResize) navResize.observe(nav);

  /**
   * يضبط المجموعات المفتوحة لصفحة جديدة: مجموعة الصفحة الحالية مفتوحة دائمًا، والمجموعات التي لم يخترها المستخدم
   * تُطوى (من الأسفل، عدا الأولى «التشغيل اليومي») فقط إن كانت القائمة لا تتسع لكل شيء (الشاشات القصيرة).
   */
  function syncNavGroups(activeLink) {
    const current = activeLink ? groupCtl.find((c) => c.links.includes(activeLink)) : null;
    if (current && !current.open) current.set(true);
    if (!nav.isConnected || nav.clientHeight === 0) {
      updateNavFade();
      return;
    }
    // افتح ما لم يختر المستخدم طيّه، ثم اطوِ (من الأسفل) ما لم يختره حتى تتسع القائمة
    groupCtl.forEach((c) => {
      if (!c.userSet && !c.open) c.set(true);
    });
    const auto = groupCtl.filter((c) => !c.userSet && c !== current && c !== groupCtl[0]).reverse();
    for (const c of auto) {
      if (nav.scrollHeight <= nav.clientHeight) break;
      c.set(false);
    }
    updateNavFade();
  }

  const sidebar = h(
    'aside.sidebar#app-sidebar',
    { 'aria-label': 'التنقل' },
    h(
      'a.brand',
      { href: '#/' },
      brandMark({ size: 24 }),
      // v9.1 l-home (L-08): اسم واحد للمنصة في كل مكان؛ v10: الشعار النصي للمكتب على سطرين
      chrome.on
        ? h('span.brand-text', wordmark({ size: 'md', tone: 'light', name: chrome.name, short: chrome.short }), h('span.brand-sub', 'منصة الدعم القانوني')) // v11 visual: القائمة الجانبية فاتحة الآن (الاسم النصي لقارئ الشاشة بجوار العلامة)
        : h('span.brand-text', h('span.brand-name', orgName), h('span.brand-sub', 'منصة الدعم القانوني')),
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
    'button.icon-btn.topbar-logout',
    {
      type: 'button',
      'aria-label': 'تسجيل الخروج',
      title: 'تسجيل الخروج',
      // v9.1 l-home (L-08): المحامي يؤكد الخروج أولًا (لمسة خاطئة تكلفه دخولًا جديدًا على شبكة بطيئة)
      onClick: () => (lawyerUi ? lawyerUi.confirmLogout() : onLogout && onLogout()),
    },
    icon('logout', { size: 20 }),
  );
  let lawyerUi = null;

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

  // v9.1 l-home (L-08/L-16): هيكل المحامي على الهاتف — زر رجوع، شريط سفلي، الخروج من القائمة بتأكيد
  if (user.role === 'lawyer') {
    lawyerUi = enhanceLawyerShell({ el, mainCol, menuBtn, sidebar, user, openDrawer, closeDrawer, onLogout });
    dropdown.classList.add('lh-notif-panel');
  }

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
              h('span.notif-icon', { class: notifTone(n.type) }, icon(notifIcon(n.type), { size: 18 })),
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
    // v10 b2b-staff (H-S2): عدد «طلبات الشركات» (جديدة + تحتاج الفريق + متأخرة) — طلب خلفية مع نفس الدورة
    if (coBadgeEl && !destroyed) {
      try {
        const o = await api.get('/admin/b2b/overview', undefined, { background: true });
        const n = Math.max(0, Number(o && o.badge) || 0);
        coBadgeEl.textContent = n > 99 ? '99+' : String(n);
        coBadgeEl.hidden = n === 0;
        coBadgeEl.closest('a')?.setAttribute('aria-label', n ? `طلبات الشركات، تحتاج إجراءً: ${n}` : 'طلبات الشركات');
      } catch {
        /* الدورة التالية */
      }
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
      if (lawyerUi) lawyerUi.renderTitle(titleEl, t);
      else titleEl.textContent = t || '';
      document.title = chrome.on ? (t ? `${t} — ${chrome.short}` : chrome.short) : t ? `${t} — ${orgName}` : `منصة ${orgName} القانونية`;
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
      activeLink = best;
      syncNavGroups(best);
      closeDropdown(false);
      if (lawyerUi) lawyerUi.setActive(path);
    },
    refresh: poll,
    destroy() {
      destroyed = true;
      clearInterval(pollTimer);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      globalSearch.destroy();
      if (lawyerUi) lawyerUi.destroy();
      mobileQuery.removeEventListener('change', onMediaChange);
      if (navResize) navResize.disconnect();
    },
  };
}
