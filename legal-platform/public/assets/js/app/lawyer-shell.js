// v9.1 l-home — هيكل المحامي على الهاتف (L-08 / L-16): لا يغيّر شيئًا في واجهة الإدارة.
//  - الشريط العلوي على الهاتف: [☰ أو «رجوع»] [العنوان] [البحث] [الجرس]؛ صورة الحساب وزر الخروج خارجه.
//  - «رجوع» في صفحات التفاصيل (الإسناد، الكتابة، الملف المستمر): يعود خطوة في المنصة أو للصفحة الأم.
//  - الأكواد في العنوان كاملة داخل <bdi dir=ltr> بلا بادئة («INH-2026-00482»).
//  - الخروج من أسفل القائمة ومن «حسابي»، بتأكيد «تسجيل الخروج من هذا الجهاز؟» وتحذير النص غير المحفوظ.
//  - شريط سفلي على الهاتف: «اليوم» (بشارة عدد المطلوب) و«إسناداتي» و«تقويمي» و«المزيد».
//
// الواجهة: enhanceLawyerShell(parts) → { renderTitle(t), setActive(path), confirmLogout(), destroy() }
//          lawyerNavItems() → عناصر القائمة الجانبية للمحامي

import { h, mount } from '../lib/h.js';
import { icon, modal } from '../lib/ui.js';
import { NAV } from './words.js';
import { lawyerDetailParent } from './routes.js';
import { navigate } from './router.js';

export const TODAY_COUNT_KEY = 'bm-today-count';
const CODE_RE = /\b([A-Z]{2,5}-\d{4}-\d{3,6}|[A-Z]{2,4}-\d{3,6})\b/;

/** عناصر قائمة المحامي (الترتيب والأسماء من words.js) */
export function lawyerNavItems() {
  return {
    work: [
      { href: '/my', label: NAV.today, icon: 'home' },
      { href: '/my/assignments', label: NAV.assignments, icon: 'briefcase' },
      { href: '/my/matters', label: NAV.matters, icon: 'gavel' },
      { href: '/my/calendar', label: NAV.calendar, icon: 'calendar' },
      { href: '/my/statement', label: NAV.statement, icon: 'wallet' },
    ],
    general: [
      { href: '/notifications', label: NAV.notifications, icon: 'bell', notif: true },
      { href: '/account', label: NAV.account, icon: 'shield' },
    ],
  };
}

const MORE_PATHS = ['/my/matters', '/my/statement', '/notifications', '/account'];

/**
 * أي زر في الشريط السفلي يُضاء لمسار ما: «اليوم» (/my) لمساره هو فقط — وإلا أضاء لكل /my/... («ملفاتي» و«مستحقاتي»)
 * ولم يُضأ «المزيد» أبدًا؛ بقية الأزرار لمسارها وما تحته (الأطول تطابقًا يفوز).
 * @returns {{tab: string|null, more: boolean}}
 */
export function bottomNavActive(path, tabPaths) {
  let tab = null;
  for (const p of tabPaths) {
    const hit = p === '/my' ? path === '/my' : path === p || path.startsWith(`${p}/`);
    if (hit && (!tab || p.length > tab.length)) tab = p;
  }
  const more = !tab && MORE_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  return { tab, more };
}

function readCount() {
  try {
    const n = Number(window.localStorage.getItem(TODAY_COUNT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {{el:HTMLElement, mainCol:HTMLElement, menuBtn:HTMLElement, sidebar:HTMLElement, user:object,
 *          openDrawer:()=>void, closeDrawer:(restore:boolean)=>void, onLogout:()=>void}} parts
 */
export function enhanceLawyerShell({ el, mainCol, menuBtn, sidebar, user, openDrawer, closeDrawer, onLogout }) {
  el.classList.add('is-lawyer');
  // التنبيهات المنبثقة على الهاتف أسفل الشاشة (فوق الشريط السفلي) لا فوق الشريط العلوي — للمحامي فقط
  document.documentElement.classList.add('lh-lawyer-ui');
  let backMode = false;
  let inAppSteps = 0; // عدد التنقلات داخل المنصة منذ الفتح (لـ«رجوع» آمن لا يخرج من المنصة)
  let currentPath = '';
  const menuIcon = menuBtn.innerHTML;

  // ── زر «رجوع» بدل القائمة في صفحات التفاصيل ──
  function setBackMode(on) {
    if (on === backMode) return;
    backMode = on;
    menuBtn.classList.toggle('lh-back', on);
    if (on) {
      menuBtn.setAttribute('aria-label', NAV.back);
      menuBtn.removeAttribute('aria-expanded');
      // السهم يشير يمينًا في الاتجاه من اليمين لليسار (اتجاه «الخلف»)
      mount(menuBtn, icon('arrowRight', { size: 22 }));
    } else {
      menuBtn.setAttribute('aria-label', 'فتح القائمة');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.innerHTML = menuIcon;
    }
  }
  const onMenuClick = (e) => {
    if (!backMode) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (inAppSteps > 1 && window.history.length > 1) window.history.back();
    else navigate(lawyerDetailParent(currentPath) || '/my');
  };
  menuBtn.addEventListener('click', onMenuClick, true);

  // ── تسجيل الخروج من أسفل القائمة ──
  const drawerLogout = h(
    'button.lh-drawer-logout',
    { type: 'button' },
    icon('logout', { size: 19 }),
    h('span', NAV.logout),
  );
  drawerLogout.addEventListener('click', () => {
    closeDrawer(false);
    confirmLogout();
  });
  const footer = sidebar.querySelector('.sidebar-footer');
  if (footer) footer.before(h('div.lh-drawer-foot', drawerLogout));
  else sidebar.append(h('div.lh-drawer-foot', drawerLogout));

  // ── الشريط السفلي (الهاتف) ──
  const badge = h('span.lh-tab-badge', { hidden: true, 'aria-hidden': 'true' });
  const tabs = [
    { path: '/my', label: NAV.today, icon: 'home', badge },
    { path: '/my/assignments', label: NAV.assignments, icon: 'briefcase' },
    { path: '/my/calendar', label: NAV.calendar, icon: 'calendar' },
  ];
  const tabEls = tabs.map((t) =>
    h('a.lh-tab', { href: `#${t.path}`, dataset: { path: t.path } }, h('span.lh-tab-icon', icon(t.icon, { size: 22 }), t.badge || null), h('span.lh-tab-label', t.label)),
  );
  const moreBtn = h('button.lh-tab', { type: 'button', 'aria-label': `${NAV.more}: ${NAV.matters}، ${NAV.statement}، ${NAV.notifications}، ${NAV.account}` }, h('span.lh-tab-icon', icon('menu', { size: 22 })), h('span.lh-tab-label', NAV.more));
  moreBtn.addEventListener('click', () => openDrawer());
  const bottomNav = h('nav.lh-bottom-nav', { 'aria-label': 'التنقل السريع' }, tabEls, moreBtn);
  el.append(bottomNav);

  function setBadge(n) {
    const v = Math.max(0, Number(n) || 0);
    badge.textContent = v > 99 ? '99+' : String(v);
    badge.hidden = v === 0;
    tabEls[0].setAttribute('aria-label', v ? `${NAV.today}، مطلوب منك: ${v}` : NAV.today);
  }
  setBadge(readCount());
  const onToday = (e) => setBadge(e.detail && e.detail.count);
  window.addEventListener('bm:today', onToday);
  // زر «تسجيل الخروج» في «حسابي» يمر بنفس التأكيد
  const onLogoutRequest = () => confirmLogout();
  window.addEventListener('bm:logout-request', onLogoutRequest);

  // لوحة المفاتيح مفتوحة (حقل نص في المقدمة) → يختفي الشريط السفلي
  const vv = window.visualViewport;
  const onViewport = () => {
    const open = !!vv && vv.height < window.innerHeight * 0.75;
    el.classList.toggle('lh-keyboard', open);
  };
  const onFocusIn = (e) => {
    if (e.target && e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable="true"]')) el.classList.add('lh-typing');
  };
  const onFocusOut = () => el.classList.remove('lh-typing');
  if (vv) vv.addEventListener('resize', onViewport);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);

  // ── تأكيد الخروج ──
  async function confirmLogout() {
    const warnings = [];
    try {
      const ob = await import('./components/outbox.js');
      const w = ob.outboxLogoutWarning && ob.outboxLogoutWarning();
      if (w) warnings.push(w);
    } catch {
      /* الوحدة غير موجودة */
    }
    let drafts = null;
    try {
      drafts = await import('./components/draft-store.js');
      const w = drafts.pendingDraftWarning && drafts.pendingDraftWarning(user.id);
      if (w && w.text) warnings.push(w.text);
    } catch {
      drafts = null;
    }
    let ok = false;
    await new Promise((resolve) => {
      modal({
        title: 'تسجيل الخروج من هذا الجهاز؟',
        sheet: true,
        className: 'lh-logout-sheet',
        body: warnings.length ? h('div.lh-logout-warn', warnings.map((w) => h('p', icon('alert', { size: 16 }), h('span', w)))) : h('p.confirm-message.lh-logout-msg', 'ستحتاج إلى اسم المستخدم وكلمة المرور للدخول مرة أخرى.'),
        actions: [
          { label: 'إلغاء', variant: 'ghost', onClick: () => { ok = false; } },
          { label: 'سجّل الخروج', variant: 'danger', icon: 'logout', onClick: () => { ok = true; } },
        ],
        onClose: () => resolve(),
      });
    });
    if (!ok) return false;
    try {
      if (drafts && drafts.clearUserDrafts) drafts.clearUserDrafts(user.id);
      const ob = await import('./components/outbox.js');
      if (ob.clearOutbox) ob.clearOutbox();
    } catch {
      /* تجاهل */
    }
    if (onLogout) onLogout();
    return true;
  }

  return {
    confirmLogout,
    /** العنوان: كود الملف كاملًا داخل <bdi dir=ltr> بلا بادئة؛ وغيره نص ينتهي بنقاط عند الضيق */
    renderTitle(titleEl, t) {
      const text = String(t || '');
      const m = CODE_RE.exec(text);
      if (m && text.replace(m[1], '').trim().split(/\s+/).length <= 2) {
        mount(titleEl, h('bdi.lh-title-code', { dir: 'ltr' }, m[1]));
        titleEl.setAttribute('title', text);
      } else {
        mount(titleEl, h('span.lh-title-text', text));
        titleEl.removeAttribute('title');
      }
    },
    setActive(path) {
      if (currentPath && currentPath !== path) inAppSteps += 1;
      else if (!currentPath) inAppSteps = 1;
      currentPath = path;
      const detail = !!lawyerDetailParent(path);
      setBackMode(detail);
      el.classList.toggle('lh-detail', detail);
      const active = bottomNavActive(path, tabs.map((t) => t.path));
      const best = tabEls.find((a) => a.dataset.path === active.tab) || null;
      tabEls.forEach((a) => {
        a.classList.toggle('is-active', a === best);
        if (a === best) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      moreBtn.classList.toggle('is-active', active.more);
    },
    setBadge,
    destroy() {
      document.documentElement.classList.remove('lh-lawyer-ui');
      bottomNav.remove();
      menuBtn.removeEventListener('click', onMenuClick, true);
      window.removeEventListener('bm:today', onToday);
      window.removeEventListener('bm:logout-request', onLogoutRequest);
      if (vv) vv.removeEventListener('resize', onViewport);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (mainCol) mainCol.inert = false;
    },
  };
}
