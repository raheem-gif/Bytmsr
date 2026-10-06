// سجل المسارات الوحيد للتطبيق. كل صفحة وحدة تُحمّل عند الحاجة وتصدّر: export default async function render(ctx)

import { defineRoutes } from './router.js';

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
  { path: '/clients', load: () => import('./pages/admin/clients.js'), roles: STAFF, title: 'العملاء' },
  { path: '/clients/:id', load: () => import('./pages/admin/client-detail.js'), roles: STAFF, title: 'ملف العميل' },
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
  { path: '/quick-replies', load: () => import('./pages/admin/quick-replies.js'), roles: STAFF, title: 'الردود الجاهزة وقوالب واتساب' },
  { path: '/integrations', load: () => import('./pages/admin/integrations.js'), roles: ADMIN, title: 'التكاملات' },
  { path: '/system', load: () => import('./pages/admin/system.js'), roles: ADMIN, title: 'صحة النظام والنسخ الاحتياطي' },
  { path: '/audit', load: () => import('./pages/admin/audit.js'), roles: ADMIN, title: 'سجل الأمان' },
  { path: '/data', load: () => import('./pages/admin/data.js'), roles: ADMIN, title: 'استيراد وتصدير البيانات' },

  // ── بوابة المحامي ──
  { path: '/my', load: () => import('./pages/lawyer/home.js'), roles: LAWYER, title: 'ملفاتي' },
  { path: '/my/assignments/:id', load: () => import('./pages/lawyer/assignment.js'), roles: LAWYER, title: 'تفاصيل الإسناد' },
  { path: '/my/matters', load: () => import('./pages/lawyer/matters.js'), roles: LAWYER, title: 'الملفات المستمرة' },
  { path: '/my/matters/:id', load: () => import('./pages/lawyer/matter.js'), roles: LAWYER, title: 'ملف مستمر' },
  { path: '/my/statement', load: () => import('./pages/lawyer/statement.js'), roles: LAWYER, title: 'كشف حسابي' },
  { path: '/my/calendar', load: () => import('./pages/lawyer/calendar.js'), roles: LAWYER, title: 'تقويمي' },

  // ── مشترك ──
  { path: '/notifications', load: () => import('./pages/notifications.js'), roles: EVERYONE, title: 'الإشعارات' },
  { path: '/account', load: () => import('./pages/account.js'), roles: EVERYONE, title: 'حسابي والأمان' },
  { path: '/print/:kind/:id', load: () => import('./pages/print.js'), roles: EVERYONE, title: 'طباعة' },
];

/** الصفحة الافتراضية حسب الدور. */
export function defaultPath(user) {
  return user && user.role === 'lawyer' ? '/my' : '/dashboard';
}

defineRoutes(routes);
