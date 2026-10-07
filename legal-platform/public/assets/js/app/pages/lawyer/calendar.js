// تقويمي — (الإصدار 9 — وحدة practice؛ الإصدار 9.1 — مسار l-court، L-15)
// جلسات الملفات المستمرة المسندة للمحامي ومهامها ومواعيد تسليم إسناداته فقط (بلا فواتير ولا بيانات اتصال المستفيدين).
// على الهاتف يبدأ بجدول المواعيد: «بانتظار النتيجة» (مع «سجّل النتيجة») ثم اليوم وغدًا وهذا الأسبوع ثم بالتاريخ.
import { calendarPage } from '../admin/calendar.js';

export default async function render(ctx) {
  return calendarPage(ctx, { mode: 'lawyer' });
}
