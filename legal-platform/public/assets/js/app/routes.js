// سجل المسارات الوحيد للتطبيق. كل صفحة وحدة تُحمّل عند الحاجة وتصدّر: export default async function render(ctx)

import { defineRoutes } from './router.js';

// ───────── v9.1 l-home (L-07): طلبات مبكرة أثناء الإقلاع ─────────
// تبدأ قبل اكتمال التحقق من الجلسة ثم تأخذها الصفحة بدل طلب جديد (مثل «اليوم» للمحامي بالتوازي مع /api/auth/session).
// هنا لا في وحدة مستقلة: طلب أقل على شبكة بطيئة.
const earlyPending = new Map(); // المفتاح ← { promise, at }
const EARLY_MAX_AGE_MS = 15000;
/** يسجل طلبًا مبكرًا (Promise) بمفتاح */
export function putEarly(key, promise) {
  if (!promise) return;
  promise.catch(() => {}); // لا رفض غير معالج إن لم تأخذه صفحة
  earlyPending.set(key, { promise, at: Date.now() });
}
/** يأخذ الطلب المبكر مرة واحدة (أو null إن لم يوجد أو قدُم) */
export function takeEarly(key) {
  const e = earlyPending.get(key);
  earlyPending.delete(key);
  if (!e || Date.now() - e.at > EARLY_MAX_AGE_MS) return null;
  return e.promise;
}
/** يلغي كل الطلبات المبكرة (عند تسجيل الخروج أو تغيّر المستخدم) */
export function clearEarly() {
  earlyPending.clear();
}

export const STAFF = ['admin', 'case_manager'];
export const ADMIN = ['admin'];
export const LAWYER = ['lawyer'];
export const EVERYONE = ['admin', 'case_manager', 'lawyer'];

export const routes = [
  // ── الإدارة ──
  { path: '/dashboard', load: () => import('./pages/admin/dashboard.js'), roles: STAFF, title: 'لوحة المتابعة' },
  { path: '/inbox', load: () => import('./pages/admin/inbox.js'), roles: STAFF, title: 'صندوق الوارد الموحد' },
  { path: '/inbox/:id', load: () => import('./pages/admin/intake-detail.js'), roles: STAFF, title: 'تفاصيل الطلب الوارد' },
  { path: '/queue', load: () => import('./pages/admin/queue.js'), roles: STAFF, title: 'بانتظار قرار الإدارة' },
  { path: '/cases', load: () => import('./pages/admin/cases.js'), roles: STAFF, title: 'ملفات الاستشارات' },
  { path: '/cases/:id', load: () => import('./pages/admin/case-detail.js'), roles: STAFF, title: 'ملف استشارة' },
  { path: '/matters', load: () => import('./pages/admin/matters.js'), roles: STAFF, title: 'الملفات المستمرة' },
  { path: '/matters/:id', load: () => import('./pages/admin/matter-detail.js'), roles: STAFF, title: 'ملف مستمر' },
  { path: '/clients', load: () => import('./pages/admin/clients.js'), roles: STAFF, title: 'المستفيدون' },
  { path: '/clients/:id', load: () => import('./pages/admin/client-detail.js'), roles: STAFF, title: 'ملف المستفيد/ة' },
  { path: '/lawyers', load: () => import('./pages/admin/lawyers.js'), roles: STAFF, title: 'شبكة المحامين' },
  { path: '/lawyers/:id', load: () => import('./pages/admin/lawyer-detail.js'), roles: STAFF, title: 'ملف المحامي' },
  { path: '/accounting', load: () => import('./pages/admin/accounting.js'), roles: ADMIN, title: 'المحاسبة' },
  { path: '/automations', load: () => import('./pages/admin/automations.js'), roles: STAFF, title: 'الأتمتة والرسائل' },
  { path: '/knowledge', load: () => import('./pages/admin/knowledge.js'), roles: STAFF, title: 'المعرفة المؤسسية والذكاء الاصطناعي' },
  { path: '/knowledge/:id', load: () => import('./pages/admin/knowledge-detail.js'), roles: STAFF, title: 'مادة معرفية' },
  { path: '/analytics', load: () => import('./pages/admin/analytics.js'), roles: STAFF, title: 'التسويق والتحليلات' },
  {
    path: '/simulator',
    load: () => import('./pages/admin/simulator.js'),
    roles: STAFF,
    title: 'محاكي واتساب',
    guard: (ctx) => Boolean(ctx.meta && ctx.meta.demo),
  },
  { path: '/settings', load: () => import('./pages/admin/settings.js'), roles: ADMIN, title: 'الإعدادات والمستخدمون' },
  // ── الإصدار 9 ──
  { path: '/calendar', load: () => import('./pages/admin/calendar.js'), roles: STAFF, title: 'التقويم' },
  { path: '/impact', load: () => import('./pages/admin/impact.js'), roles: STAFF, title: 'تقرير الأثر' },
  { path: '/conflicts', load: () => import('./pages/admin/conflicts.js'), roles: STAFF, title: 'فحص تعارض المصالح' },
  { path: '/programs', load: () => import('./pages/admin/programs.js'), roles: STAFF, title: 'البرامج والتمويل' },
  { path: '/programs/:id', load: () => import('./pages/admin/programs.js'), roles: STAFF, title: 'برنامج تمويل' },
  { path: '/quick-replies', load: () => import('./pages/admin/quick-replies.js'), roles: STAFF, title: 'الردود الجاهزة وقوالب واتساب' },
  { path: '/integrations', load: () => import('./pages/admin/integrations.js'), roles: ADMIN, title: 'التكاملات' },
  { path: '/system', load: () => import('./pages/admin/system.js'), roles: ADMIN, title: 'صحة النظام والنسخ الاحتياطي' },
  { path: '/audit', load: () => import('./pages/admin/audit.js'), roles: ADMIN, title: 'سجل الأمان' },
  { path: '/data', load: () => import('./pages/admin/data.js'), roles: ADMIN, title: 'استيراد وتصدير البيانات' },

  // ── بوابة المحامي ──
  // «الإسناد» ما تكلّف به الإدارة المحامي؛ «الملف» ملف المؤسسة نفسه
  // v9.1 l-home (L-01): «اليوم» قائمة واحدة بما هو مطلوب الآن؛ قائمة الإسنادات (الحالية والسابقة) في /my/assignments.
  // prefetch يطلب /api/lawyer/today بالتوازي مع تحميل وحدة الصفحة، وskeleton يعرض صفوفًا رمادية بدل مؤشر التحميل.
  {
    path: '/my',
    load: () => import('./pages/lawyer/home.js'),
    roles: LAWYER,
    title: 'اليوم',
    prefetch: () => takeEarly('today') || import('../lib/api.js').then(({ api }) => api.get('/lawyer/today')),
    skeleton: () => todaySkeleton(),
  },
  { path: '/my/assignments', load: () => import('./pages/lawyer/assignments.js'), roles: LAWYER, title: 'إسناداتي' },
  { path: '/my/assignments/:id', load: () => import('./pages/lawyer/assignment.js'), roles: LAWYER, title: 'تفاصيل الإسناد' },
  // v9.1 l-work (L-03): وضع الكتابة المركّز «رأيي»
  { path: '/my/assignments/:id/write', load: () => import('./pages/lawyer/write.js'), roles: LAWYER, title: 'رأيي' },
  { path: '/my/matters', load: () => import('./pages/lawyer/matters.js'), roles: LAWYER, title: 'الملفات المستمرة' },
  { path: '/my/matters/:id', load: () => import('./pages/lawyer/matter.js'), roles: LAWYER, title: 'ملف مستمر' },
  { path: '/my/statement', load: () => import('./pages/lawyer/statement.js'), roles: LAWYER, title: 'مستحقاتي' },
  { path: '/my/calendar', load: () => import('./pages/lawyer/calendar.js'), roles: LAWYER, title: 'تقويمي' },

  // ── مشترك ──
  { path: '/notifications', load: () => import('./pages/notifications.js'), roles: EVERYONE, title: 'الإشعارات' },
  { path: '/account', load: () => import('./pages/account.js'), roles: EVERYONE, title: 'حسابي والأمان', lawyerTitle: 'حسابي' },
  { path: '/print/:kind/:id', load: () => import('./pages/print.js'), roles: EVERYONE, title: 'طباعة', css: ['v9-programs'] },
];

// ───────── v9.1 l-home (L-07): أوراق أنماط الإدارة تُحمَّل عند الحاجة لا في كل فتح للمنصة ─────────
/** أوراق الأنماط الخاصة بصفحات الإدارة (لا يحتاجها المحامي): تُحمَّل لأي صفحة إدارة ولكل مستخدم من الإدارة */
export const STAFF_CSS = ['pages-a', 'pages-b', 'pages-d', 'v9-platform', 'v9-programs', 'v9-messaging'];
for (const r of routes) {
  if (r.roles === STAFF || r.roles === ADMIN) r.css = [...new Set([...(r.css || []), ...STAFF_CSS])];
}

// v9.1 l-home (L-07): بيانات صفحات المحامي تُطلب بالتوازي مع تحميل وحدة الصفحة (api.prefetchGet)، فرابط إشعار يُفتح
// على شبكة بطيئة لا ينتظر الوحدة ثم البيانات على التوالي. الرابط هو نفسه ما تطلبه الصفحة (وإلا لا يُستعمل الطلب المبكر).
const LAWYER_DATA = {
  '/my/assignments/:id': (ctx) => `/lawyer/assignments/${encodeURIComponent(ctx.params.id)}`,
  '/my/assignments/:id/write': (ctx) => `/lawyer/assignments/${encodeURIComponent(ctx.params.id)}`,
  '/my/matters': () => '/lawyer/matters',
  '/my/matters/:id': (ctx) => `/lawyer/matters/${encodeURIComponent(ctx.params.id)}`,
  '/my/statement': () => '/lawyer/statement',
};
for (const r of routes) {
  if (LAWYER_DATA[r.path] && !r.prefetchGet) r.prefetchGet = LAWYER_DATA[r.path];
}

/** أوراق إضافية حسب الدور: الإدارة تحمّل أوراقها كلها مع أول صفحة فيبقى شكل صفحاتها كما كان تمامًا */
export function roleCss(user) {
  return user && user.role !== 'lawyer' ? STAFF_CSS : [];
}

/**
 * v9.1 l-home (L-08): صفحات التفاصيل للمحامي (يظهر فيها زر «رجوع» بدل القائمة ويختفي الشريط السفلي)
 * والصفحة الأم لكل منها (عند فتحها مباشرة من رابط أو إشعار).
 */
export function lawyerDetailParent(path) {
  const p = String(path || '');
  let m = /^\/my\/assignments\/([^/]+)\/write$/.exec(p);
  if (m) return `/my/assignments/${m[1]}`;
  if (/^\/my\/assignments\/[^/]+$/.test(p)) return '/my';
  if (/^\/my\/matters\/[^/]+$/.test(p)) return '/my/matters';
  return null;
}

/** صفوف رمادية تُعرض أثناء تحميل «اليوم» (بدل مؤشر صفحة كاملة) */
export function todaySkeleton() {
  const el = document.createElement('div');
  el.className = 'page lh-today lh-loading';
  el.setAttribute('aria-busy', 'true');
  el.innerHTML =
    '<div class="lh-today-head"><div class="lh-sk lh-sk-date"></div><div class="lh-sk lh-sk-h1"></div></div>' +
    '<section class="lh-now card"><div class="lh-sk-row"></div><div class="lh-sk-row"></div><div class="lh-sk-row"></div></section>' +
    '<span class="sr-only" role="status">جارٍ تحميل مهامك…</span>';
  return el;
}

/**
 * عنوان صفحة المسار — المصدر الوحيد لاسم الصفحة: يظهر في الشريط العلوي وعنوان المتصفح وعنصر القائمة الجانبية.
 * @param {string} path مسار ثابت مثل '/quick-replies'
 */
export function routeTitle(path) {
  const r = routes.find((x) => x.path === path);
  return (r && r.title) || '';
}

/** الصفحة الافتراضية حسب الدور. */
export function defaultPath(user) {
  return user && user.role === 'lawyer' ? '/my' : '/dashboard';
}

defineRoutes(routes);
