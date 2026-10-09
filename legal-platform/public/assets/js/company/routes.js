// الإصدار 10 — مسارات بوابة الشركات (U10-08 بلا «الفواتير» وسجل الدخول — مؤجلة إلى 10.1؛ L-31، L-36).
// roles: أدوار الشركة المسموح لها (بلا roles = الكل)؛ الصفحة الممنوعة تعرض حالة U10-82/83 لا صفحة فارغة.
// nav: عنصر التنقل النشط · parent: زر الرجوع في شاشات التفاصيل (ويختفي معه شريط التبويب) · pill:false يخفي «طلب جديد».
// keep: صفحة نموذج — التحديث التلقائي (العودة إلى التبويب بعد دقيقة، أو عودة الاتصال) لا يعيد رسمها فلا يضيع ما كُتب (U10-81).
// «#/» يحوّلها الموجّه المشترك إلى /overview («المتابعة»).

import * as OVERVIEW from './pages/overview.js';
import { pageSkeleton, notFoundView } from './common.js';

const ADMIN = ['company_admin'];
const WRITERS = ['company_admin', 'member'];
const REQUESTS = { label: 'الطلبات', href: '#/requests' };
const MEMORY = { label: 'الذاكرة القانونية', href: '#/memory' };
const MORE = { label: 'المزيد', href: '#/more' };
// «المتابعة» (الوجهة الافتراضية) في الحزمة الثابتة: تُحمَّل مسبقًا مع الصفحة (modulepreload) فلا تنتظر الجلسة (§8.4)
// أنماط الصفحات التي تُحمَّل عند الحاجة (v10-company-pages.css)
const PAGES_CSS = ['v10-company-pages'];
// هياكل بشكل الصفحة أثناء التحميل (U10-79؛ لا مؤشر دوّار للصفحة كلها)، وبعد 10 ثوانٍ «يستغرق وقتًا أطول…»
const LIST = pageSkeleton(1, 6);
const CARDS = pageSkeleton(3, 3);

export const COMPANY_ROUTES = [
  { path: '/overview', title: 'المتابعة', nav: 'overview', skeleton: CARDS, load: async () => OVERVIEW, prefetchGet: () => '/company/home' },
  { path: '/requests', title: 'الطلبات', nav: 'requests', skeleton: LIST, load: () => import('./pages/requests.js') },
  { path: '/requests/new', title: 'طلب جديد', nav: 'requests', roles: WRITERS, write: true, pill: false, keep: true, css: PAGES_CSS, parent: { label: 'المتابعة', href: '#/overview' }, load: () => import('./pages/new-request.js') },
  { path: '/requests/new/:type', title: 'طلب جديد', nav: 'requests', roles: WRITERS, write: true, pill: false, keep: true, css: PAGES_CSS, parent: { label: 'نوع الطلب', href: '#/requests/new' }, load: () => import('./pages/new-request.js') },
  { path: '/requests/:code', title: 'الطلب', nav: 'requests', parent: REQUESTS, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/request.js') },
  { path: '/memory', title: 'الذاكرة القانونية', nav: 'memory', css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/memory.js') },
  { path: '/memory/calendar', title: 'المواعيد المهمة', nav: 'memory', parent: MEMORY, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/calendar.js') },
  { path: '/memory/entities', title: 'الكيانات', nav: 'memory', parent: MEMORY, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/entities.js') },
  { path: '/memory/counterparties', title: 'الأطراف المتعاملة', nav: 'memory', parent: MEMORY, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/counterparties.js') },
  { path: '/memory/item/:id', title: 'عنصر في الذاكرة القانونية', nav: 'memory', parent: MEMORY, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/memory-item.js') },
  { path: '/memory/new/:slug', title: 'إضافة إلى الذاكرة القانونية', nav: 'memory', roles: WRITERS, write: true, keep: true, parent: MEMORY, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/memory-edit.js') },
  { path: '/memory/item/:id/edit', title: 'تعديل عنصر في الذاكرة القانونية', nav: 'memory', roles: WRITERS, write: true, keep: true, parent: MEMORY, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/memory-edit.js') },
  { path: '/memory/:slug', title: 'الذاكرة القانونية', nav: 'memory', parent: MEMORY, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/memory-list.js') },
  { path: '/team', title: 'الفريق', nav: 'team', roles: ADMIN, parent: MORE, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/team.js') },
  { path: '/plan', title: 'الباقة والاستخدام', nav: 'plan', parent: MORE, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/plan.js') },
  { path: '/company', title: 'بيانات الشركة', nav: 'company', parent: MORE, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/company.js') },
  { path: '/notifications', title: 'الإشعارات', nav: 'notifications', parent: MORE, css: PAGES_CSS, skeleton: LIST, load: () => import('./pages/notifications.js') },
  { path: '/account', title: 'حسابي والأمان', nav: 'account', keep: true, parent: MORE, css: PAGES_CSS, skeleton: CARDS, load: () => import('./pages/account.js') },
  { path: '/more', title: 'المزيد', nav: 'more', load: () => import('./pages/more.js') },
  { path: '/welcome', title: 'مرحبًا بكم', nav: 'overview', roles: ADMIN, pill: false, keep: true, css: PAGES_CSS, load: () => import('./pages/welcome.js') },
  // رابط غير معروف ← نفس شاشة U10-82 («لا يمكن عرض هذه الصفحة.») لا صفحة الموجّه العامة
  ...['/:a', '/:a/:b', '/:a/:b/:c', '/:a/:b/:c/:d', '/:a/:b/:c/:d/:e'].map((path) => ({ path, title: 'لا يمكن عرض هذه الصفحة', load: async () => ({ default: () => notFoundView() }) })),
];

/** شاشات بلا جلسة (main.js) */
export const AUTH_SCREENS = Object.freeze(['/login', '/login/2fa', '/forgot', '/invite/:token', '/reset/:token']);
