// أدوات مشتركة للإشعارات (الشريط العلوي وصفحة الإشعارات).

import { api } from '../lib/api.js';
import { navigate } from './router.js';

const TYPE_ICONS = [
  [/intake/, 'inbox'],
  [/info_request|request/, 'message'],
  [/opinion|answer/, 'fileText'],
  [/counsel/, 'users'],
  [/assign/, 'briefcase'],
  [/case/, 'briefcase'],
  [/matter|task/, 'gavel'],
  [/event|hearing|deadline/, 'calendar'],
  [/invoice|ledger|payment|fee/, 'wallet'],
  [/whatsapp|message/, 'whatsapp'],
  [/knowledge/, 'book'],
  [/ai/, 'sparkle'],
  [/automation|reminder/, 'zap'],
];

/** أيقونة مناسبة لنوع الإشعار. */
export function notifIcon(type) {
  const t = String(type || '');
  for (const [re, name] of TYPE_ICONS) if (re.test(t)) return name;
  return 'bell';
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
