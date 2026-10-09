// أدوات مشتركة للإشعارات (الشريط العلوي وصفحة الإشعارات).

import { api } from '../lib/api.js';
import { navigate } from './router.js';

// الأنواع المهمة بأيقونات ودرجات مميزة (تُطابق قبل القواعد العامة أدناه)
const EXACT = {
  security: ['shield', 'danger'], // تنبيهات أمان الحسابات (src/auth.js، src/services/accounts.js)
  account: ['userPlus', null], // دعوة حساب انتهت دون تفعيل
  'conflict.alert': ['scale', 'warning'], // تعارض مصالح محتمل (وحدة الممارسة)
  identity_conflict: ['alert', 'warning'], // رقم مختلف يذكر رقم طلب عميل آخر
  'intake.sla_breach': ['clock', 'warning'], // تجاوز مهلة أول رد على طلب وارد
  'ai.budget_exceeded': ['alert', 'danger'], // تجاوز سقف إنفاق الذكاء الاصطناعي الشهري
  'ai.budget_warning': ['chart', 'warning'], // اقتراب الإنفاق من السقف
  'program.budget': ['wallet', 'warning'], // استهلاك ميزانية برنامج تمويل (80% / 100%)
  'survey.low_rating': ['star', 'danger'], // تقييم منخفض من المستفيد
  'survey.comment': ['star', null],
  'message.failed': ['alert', 'danger'], // تعذر إرسال رسالة واتساب
  'package.exhausted': ['wallet', 'warning'],
  payout: ['wallet', null],
  // v10 b2b-staff (STF-0): خدمة الشركات — التصعيد والتأخر وتعذّر بدء العمل أحمر، ويقترب الموعد برتقالي
  'company_request.escalated': ['alert', 'danger'],
  'company_request.sla_late': ['alert', 'danger'],
  'company_request.plan_error': ['alert', 'danger'],
  'company_request.sla_at_risk': ['clock', 'warning'],
  'company_request.accepted_low_rating': ['star', 'danger'],
  'company_request.memory_pending': ['bookOpen', null],
  'company.renewal': ['calendarClock', null],
  'company.trial_ending': ['clock', 'warning'],
  'company.suspended': ['building', 'warning'],
  'company.subscription_ended': ['building', 'warning'],
  'company.invite_conflict': ['mailWarning', 'warning'],
  'company.manager_reassigned': ['userCog', null],
  'email.failed': ['alert', 'warning'],
};

const TYPE_ICONS = [
  // v10 b2b-staff (STF-0): قبل القواعد العامة (وإلا يطابق /request/ أيقونة الرسائل). 'queue' هو رسم inboxStack نفسه
  // (ICONS.inboxStack = ICONS.queue في ui.js)، والاسم الأصلي يُبقي فحص الأيقونات الثابت في v9-integration صالحًا
  [/^company_request\./, 'queue'],
  [/^company\./, 'building'],
  [/^email\./, 'mail'],
  [/intake/, 'inbox'],
  [/info_request|request/, 'message'],
  [/opinion|answer/, 'fileText'],
  [/counsel/, 'users'],
  [/assign/, 'briefcase'],
  [/case/, 'briefcase'],
  [/matter|task/, 'gavel'],
  [/event|hearing|deadline/, 'calendar'],
  [/invoice|ledger|payment|fee|budget|program/, 'wallet'],
  [/whatsapp|message/, 'whatsapp'],
  [/knowledge/, 'book'],
  [/^ai\./, 'sparkle'],
  [/security|conflict/, 'shield'],
  [/survey/, 'star'],
  [/^issue\./, 'flag'],
  [/^grants\./, 'eye'],
  [/^identity/, 'users'],
  [/automation|reminder/, 'zap'],
];

/** أيقونة مناسبة لنوع الإشعار. */
export function notifIcon(type) {
  const t = String(type || '');
  if (EXACT[t]) return EXACT[t][0];
  for (const [re, name] of TYPE_ICONS) if (re.test(t)) return name;
  return 'bell';
}

/** فئة لون أيقونة الإشعار للأنواع المهمة ('is-danger' أو 'is-warning') أو null. */
export function notifTone(type) {
  const tone = EXACT[String(type || '')]?.[1];
  return tone ? `is-${tone}` : null;
}

/** يحدد الإشعار كمقروء (بدون رمي أخطاء). */
export async function markRead(n) {
  if (!n || n.read_at) return;
  try {
    await api.post(`/notifications/${encodeURIComponent(n.id)}/read`);
    n.read_at = new Date().toISOString();
  } catch {
    /* تجاهل: لا يمنع فتح الرابط */
  }
}

/** يفتح رابط الإشعار داخل التطبيق. يعيد true إذا تم التنقل. */
export function followLink(link) {
  if (!link) return false;
  const s = String(link);
  if (s.startsWith('#')) {
    navigate(s);
    return true;
  }
  if (s.startsWith('/') && !s.startsWith('//')) {
    window.location.assign(s);
    return true;
  }
  return false;
}
