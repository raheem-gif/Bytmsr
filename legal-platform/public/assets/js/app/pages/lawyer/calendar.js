// تقويمي — (الإصدار 9 — وحدة practice)
// جلسات الملفات المستمرة المسندة للمحامي ومهامها ومواعيد تسليم إسناداته فقط (بلا فواتير ولا بيانات اتصال للعملاء).
import { calendarPage } from '../admin/calendar.js';

export default async function render(ctx) {
  return calendarPage(ctx, { mode: 'lawyer' });
}
