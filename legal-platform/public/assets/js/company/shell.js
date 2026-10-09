// الإصدار 10 — إطار بوابة الشركات (U10-10…U10-13، U10-81، U10-85): الشريط العلوي .k-chrome، شريط التبويب .k-tabbar على
// الهاتف (≤ 1023px)، والتنقل الجانبي الفاتح على الحاسوب (≥ 1024px)، الجرس، قائمة الحساب، البحث الواحد على الحاسوب، زر
// «طلب جديد» الذهبي (العنصر الذهبي الوحيد في الشاشة؛ L-63)، زر الرجوع في شاشات التفاصيل، شريط انقطاع الاتصال، ورابط التخطي.
import { h, mount } from '../lib/h.js';
import { icon, button, brandMark, brandEl, wordmark, avatar, modal, toast, errorMessage } from '../lib/ui.js';
import { api } from '../lib/api.js';
import { relative } from '../lib/fmt.js';
import { MEMORY_KINDS } from '../lib/company-catalog.js';
import { copy } from '../lib/company-ui-core.js';
import { W } from './words.js';
import { S, isAdmin, isViewer, readOnly } from './state.js';
import { readOnlySheet, searchSlot } from './common.js';

const ADMIN_KINDS = new Set(['position', 'person', 'dispute']);
const isDesktop = () => {
  try {
    return window.matchMedia('(min-width: 1024px)').matches;
  } catch {
    return false;
  }
};

/** زر «طلب جديد» الذهبي: للمدير والعضو؛ في شركة للاطلاع فقط يفتح ورقة التفسير (U10-85) */
function newRequestControl({ block = false, className } = {}) {
  if (!S.user || isViewer()) return null;
  if (readOnly()) return button(W.nav.new_request, { variant: 'accent', icon: 'plus', className, block, onClick: () => readOnlySheet() });
  return button(W.nav.new_request, { variant: 'accent', icon: 'plus', className, block, href: '#/requests/new' });
}

/** قائمة منبثقة بسيطة (قائمة الحساب، الجرس على الحاسوب): Esc والنقر خارجها يغلقانها ويعود التركيز إلى زرها */
function popover(trigger, render) {
  const pop = h('div.co-pop', { hidden: true, role: 'dialog' });
  const close = (focus = true) => {
    if (pop.hidden) return;
    pop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    if (focus) trigger.focus();
  };
  const outside = (e) => !pop.contains(e.target) && !trigger.contains(e.target) && close(false);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  const open = async () => {
    pop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    await render(pop, close);
    pop.querySelector('a, button')?.focus();
  };
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.addEventListener('click', () => (pop.hidden ? open() : close()));
  return { pop, close };
}

/** صفوف آخر الإشعارات (الجرس) */
async function notificationList(close) {
  let data;
  try {
    data = await api.get('/company/notifications', { limit: 8 });
  } catch (err) {
    return [h('p.co-pop-empty', errorMessage(err))];
  }
  const items = data?.items || [];
  const rows = items.length
    ? h(
        'ul.co-notif-list',
        items.map((n) =>
          h(
            'li',
            h(
              'a.co-notif-row',
              {
                href: n.link && n.link.startsWith('#/') ? n.link : '#/notifications',
                class: !n.read_at && 'is-unread',
                onClick: () => {
                  // العدّاد في الجرس وعنوان التبويب يتحدث فورًا لا بعد دقيقة
                  if (!n.read_at) api.post(`/company/notifications/${n.id}/read`, {}).then(() => window.dispatchEvent(new CustomEvent('co:notifications'))).catch(() => {});
                  close(false);
                },
              },
              h('span.co-notif-dot', { 'aria-hidden': 'true' }),
              h('span.co-notif-text', h('span.co-notif-title', { dir: 'auto' }, n.title), h('span.co-notif-time', relative(n.created_at))),
            ),
          ),
        ),
      )
    : h('p.co-pop-empty', W.nav.no_notifications);
  return [
    h('div.co-pop-head', h('strong', W.nav.notifications), data?.unread ? button(W.nav.mark_all_read, { variant: 'link', size: 'sm', onClick: async () => { await api.post('/company/notifications/read-all', {}).catch(() => {}); close(); window.dispatchEvent(new CustomEvent('co:notifications')); } }) : null),
    rows,
    h('a.co-pop-foot', { href: '#/notifications', onClick: () => close(false) }, W.nav.all_notifications),
  ];
}

/**
 * يبني الإطار داخل root. onLogout() يبدأ الخروج (مع تأكيد المسودة في main.js).
 * → { outlet, focusTarget, onRoute(ctx), setUnread(n), setHome(home), refresh() }
 */
export function mountShell(root, { onLogout } = {}) {
  // مستمعو النافذة لهذا الإطار فقط: تُزال عند الخروج (destroy) فلا تتراكم مع كل دخول جديد
  const life = new AbortController();
  const on = { signal: life.signal };
  const outlet = h('div.co-outlet');
  // C-02: مسار التنقل على الحاسوب في شاشات التفاصيل («الطلبات › NFD-0004»، «الذاكرة القانونية › العقود › {العنوان}»)
  const crumbs = h('nav.co-crumbs', { 'aria-label': W.nav.crumbs, hidden: true });
  const main = h('main.co-main#co-main', { tabindex: '-1' }, crumbs, outlet);
  const offline = h('div.co-offline', { role: 'status', hidden: navigator.onLine !== false }, icon('alert', { size: 16 }), h('span', W.state.offline));
  const back = h('a.co-back', { href: '#/overview', hidden: true }, icon('chevronRight', { size: 22 }), h('span.co-back-label', ''));
  const brandLink = h(
    'a.co-brand',
    { href: '#/overview' },
    h('span.co-brand-phone', brandMark({ size: 20 }), brandEl({ short: true })),
    h('span.co-brand-desk', wordmark({ size: 'md', tone: 'light', descriptor: W.brand.tagline_ar })),
  );
  const companyLine = h('span.co-chrome-company');
  const bellBadge = h('span.co-bell-badge.num', { hidden: true });
  const bell = h('button.icon-btn.co-bell', { type: 'button', 'aria-label': W.nav.bell }, icon('bell', { size: 22 }), bellBadge);
  const bellPop = popover(bell, async (pop, close) => mount(pop, ...(await notificationList(close))));
  bellPop.pop.classList.add('co-pop-bell');
  bellPop.pop.setAttribute('aria-label', W.nav.notifications);
  // على الهاتف: الجرس يفتح ورقة سفلية بدل القائمة المنبثقة
  bell.addEventListener(
    'click',
    async (e) => {
      if (isDesktop()) return;
      e.stopImmediatePropagation();
      const sheet = modal({ title: W.nav.notifications, sheet: true, body: h('div.co-notif-sheet', h('p', W.state.loading)) });
      const nodes = await notificationList(() => sheet.close('action'));
      mount(sheet.body, h('div.co-notif-sheet', ...nodes));
    },
    true,
  );
  const userBtn = h('button.co-user', { type: 'button', 'aria-label': W.nav.user_menu }, avatar(S.user?.name || '', { size: 'sm' }), h('span.co-user-name', S.user?.name || ''), icon('chevronDown', { size: 16 }));
  const userPop = popover(userBtn, (pop, close) =>
    mount(
      pop,
      h(
        'ul.co-menu',
        h('li', h('a.co-menu-item', { href: '#/account', onClick: () => close(false) }, icon('lock', { size: 18 }), W.nav.account)),
        h('li', h('a.co-menu-item', { href: '#/notifications', onClick: () => close(false) }, icon('bell', { size: 18 }), W.nav.notifications)),
        h('li', h('button.co-menu-item.is-danger', { type: 'button', onClick: () => { close(false); onLogout?.(); } }, icon('logout', { size: 18 }), W.nav.logout)),
      ),
    ),
  );
  userPop.pop.classList.add('co-pop-user');
  userPop.pop.setAttribute('aria-label', W.nav.user_menu);
  const pillSlot = h('span.co-pill-slot');
  const search = h('div.co-chrome-search', searchSlot({ compact: true }));
  const chrome = h(
    'header.k-chrome.co-chrome',
    h('div.k-chrome-start', back, brandLink, companyLine),
    h('div.k-chrome-end', search, h('span.co-pop-anchor', bell, bellPop.pop), h('span.co-pop-anchor.co-user-wrap', userBtn, userPop.pop), pillSlot),
  );

  // ── التنقل الجانبي (الحاسوب) ──
  const sideNew = h('div.co-side-new');
  const sideLinks = h('ul.co-side-list');
  const sideMemory = h('ul.co-side-sub', { hidden: true });
  const sideAccount = h('ul.co-side-list');
  const sideFoot = h('div.co-side-foot');
  const side = h('nav.co-side', { 'aria-label': W.nav.main_label }, sideNew, sideLinks, h('p.co-side-group', W.nav.account_group), sideAccount, sideFoot);

  // ── شريط التبويب (الهاتف) ──
  const tabBadge = h('span.k-tab-badge', { hidden: true });
  const tabs = [
    ['overview', '#/overview', 'grid', W.nav.overview, tabBadge],
    ['requests', '#/requests', 'inbox', W.nav.requests],
    ['memory', '#/memory', 'bookOpen', W.nav.memory_short],
    ['more', '#/more', 'moreHorizontal', W.nav.more],
  ].map(([key, href, ic, label, extra]) => h('a.k-tab', { href, dataset: { nav: key } }, icon(ic, { size: 24 }), h('span.k-tab-label', label), extra || null));
  const tabbar = h('nav.k-tabbar', { 'aria-label': W.nav.main_label }, tabs);

  const sideItem = (key, href, ic, label, extra = null) => h('li', h('a.co-side-link', { href, dataset: { nav: key } }, icon(ic, { size: 20 }), h('span', label), extra));
  const sideBadge = h('span.co-side-badge.num', { hidden: true });
  function renderNav() {
    mount(sideNew, newRequestControl({ block: true, className: 'co-new-side' }));
    mount(
      sideLinks,
      sideItem('overview', '#/overview', 'grid', W.nav.overview, sideBadge),
      sideItem('requests', '#/requests', 'inbox', W.nav.requests),
      h('li', h('a.co-side-link', { href: '#/memory', dataset: { nav: 'memory' } }, icon('bookOpen', { size: 20 }), h('span', W.nav.memory)), sideMemory),
    );
    mount(
      sideMemory,
      MEMORY_KINDS.filter((k) => isAdmin() || !ADMIN_KINDS.has(k.key)).map((k) => h('li', h('a.co-side-sublink', { href: k.key === 'key_date' ? '#/memory/calendar' : `#/memory/${k.slug}` }, k.key === 'key_date' ? W.nav.calendar : k.list_label))),
      h('li', h('a.co-side-sublink', { href: '#/memory/entities' }, W.nav.entities)),
      h('li', h('a.co-side-sublink', { href: '#/memory/counterparties' }, W.nav.counterparties)),
    );
    mount(
      sideAccount,
      isAdmin() ? sideItem('team', '#/team', 'users', W.nav.team) : null,
      sideItem('plan', '#/plan', 'chart', W.nav.plan),
      sideItem('company', '#/company', 'building', W.nav.company),
    );
    // C-10: الرابط الجانبي على الحاسوب بتسمية التبويب نفسها («المتابعة، يحتاج انتباهكم: 5» لا «المتابعة 5»)
    const attn = (S.home?.attention || []).length;
    const sideOverview = sideLinks.querySelector('a[data-nav="overview"]');
    if (sideOverview && attn) sideOverview.setAttribute('aria-label', `${W.nav.overview}، ${copy('nav.attention_badge', { n: attn })}`);
    const mgr = S.home?.account_manager?.name;
    mount(sideFoot, mgr ? [h('span.co-side-foot-label', W.nav.manager_label), h('span.co-side-foot-name', mgr)] : null);
    mount(companyLine, S.company ? [h('span', { dir: 'auto' }, S.company.name), S.company.plan_label ? [' · باقة ', h('bdi', S.company.plan_label)] : null] : null);
  }

  let current = null;
  /** زر الرجوع الذي حددته الصفحة (co:back) وعنوانها الحالي — لمسار التنقل */
  let backDetail = null;
  let pageTitle = '';
  const deeper = (d, parent) => !!(d && parent && d.href && parent.href && d.href.startsWith(`${parent.href}/`));
  function renderCrumbs() {
    const r = current?.route || {};
    if (!r.parent) {
      crumbs.hidden = true;
      mount(crumbs);
      return;
    }
    const trail = backDetail ? (deeper(backDetail, r.parent) ? [r.parent, backDetail] : [backDetail]) : [r.parent];
    const here = pageTitle || r.title || '';
    crumbs.hidden = false;
    mount(crumbs, h('ol.co-crumbs-list', trail.map((c) => h('li', h('a', { href: c.href }, c.label))), here ? h('li', h('span', { 'aria-current': 'page', dir: 'auto' }, here)) : null));
  }
  /** C-02: الرابط الفرعي في «الذاكرة القانونية» للصفحة الحالية (أو للقائمة التي تتبعها صفحة العنصر) */
  function markSub() {
    const r = current?.route || {};
    const here = current ? `#${current.path}` : '';
    const listHref = backDetail && deeper(backDetail, r.parent) ? backDetail.href : null;
    for (const a of sideMemory.querySelectorAll('a.co-side-sublink')) {
      const href = a.getAttribute('href');
      if (href === here) a.setAttribute('aria-current', 'page');
      else if (href === listHref) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }
  function onRoute(ctx) {
    if (ctx !== current) {
      backDetail = null;
      pageTitle = '';
    }
    current = ctx;
    const r = ctx.route || {};
    const nav = r.nav || null;
    for (const a of [...side.querySelectorAll('[data-nav]'), ...tabs]) {
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
      a.classList.toggle('is-active', a.dataset.nav === nav);
    }
    sideMemory.hidden = nav !== 'memory';
    const detail = !!r.parent;
    document.body.classList.toggle('co-detail', detail);
    back.hidden = !detail;
    if (detail) {
      back.href = r.parent.href;
      back.querySelector('.co-back-label').textContent = r.parent.label;
      back.setAttribute('aria-label', `${W.nav.back}: ${r.parent.label}`);
    }
    mount(pillSlot, r.pill === false ? null : newRequestControl({ className: 'co-pill' }));
    sideNew.hidden = r.pill === false;
    renderCrumbs();
    markSub();
  }
  /** عنوان الصفحة الحالية (من setTitle في main.js) — آخر عنصر في مسار التنقل */
  function setPageTitle(t) {
    pageTitle = t || '';
    renderCrumbs();
  }
  function setUnread(n) {
    const v = Math.max(0, Number(n) || 0);
    bellBadge.hidden = !v;
    bellBadge.textContent = v > 99 ? '99+' : String(v);
    bell.setAttribute('aria-label', v ? copy('nav.bell_unread', { n: v }) : W.nav.bell);
  }
  function setHome(home) {
    S.home = home || S.home;
    const n = (home?.attention || []).length;
    for (const b of [tabBadge, sideBadge]) {
      b.hidden = !n;
      b.textContent = n > 99 ? '99+' : String(n);
    }
    tabs[0].setAttribute('aria-label', n ? `${W.nav.overview}، ${copy('nav.attention_badge', { n })}` : W.nav.overview);
    renderNav();
    if (current) onRoute(current);
  }

  // صفحة تغيّر زر الرجوع لشاشتها (مثل «‹ التفاصيل» في الخطوة الثانية من طلب جديد)
  window.addEventListener(
    'co:back',
    (e) => {
      const d = e.detail;
      backDetail = d && current?.route?.parent ? d : null;
      if (!d || !current?.route?.parent) return current && onRoute(current);
      renderCrumbs();
      markSub();
      back.hidden = false;
      back.href = d.href;
      back.querySelector('.co-back-label').textContent = d.label;
      back.setAttribute('aria-label', `${W.nav.back}: ${d.label}`);
    },
    on,
  );

  // لوحة المفاتيح مفتوحة ← يختفي شريط التبويب (U10-11)
  const vv = window.visualViewport;
  if (vv) vv.addEventListener('resize', () => document.body.classList.toggle('k-keyboard', vv.height < window.innerHeight * 0.75), on);
  window.addEventListener('offline', () => (offline.hidden = false), on);
  window.addEventListener('online', () => (offline.hidden = true), on);

  renderNav();
  const skip = h('a.co-skip', { href: '#co-main', onClick: (e) => { e.preventDefault(); main.focus(); } }, W.nav.skip);
  mount(root, skip, chrome, offline, h('div.co-body', side, main), tabbar);
  document.body.classList.add('co-shell');
  return {
    outlet,
    focusTarget: { focus: (o) => (outlet.querySelector('h1') || main).focus(o) },
    onRoute,
    setPageTitle,
    setUnread,
    setHome,
    refresh: renderNav,
    toastError: (err) => toast(errorMessage(err), 'danger'),
    destroy: () => {
      life.abort();
      bellPop.close(false);
      userPop.close(false);
      document.body.classList.remove('k-keyboard');
    },
  };
}
