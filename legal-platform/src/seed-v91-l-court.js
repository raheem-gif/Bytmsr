// الإصدار 9.1 — مسار l-court: بيانات تجريبية لنتيجة الجلسة من ممر المحكمة (L-02) و«مستحقاتي» (L-09).
// تُستدعى من src/seed.js (علامة <seed:v91-l-court>) عبر نفس خدمات التشغيل الفعلي.
//
// ملف الجنحة MTR-…-00002 (المحامي هاني رمزي):
//   - جلسة سابقة قبل نحو أسبوع سُجّلت نتيجتها «تأجّلت … — للاطلاع» فأنشأت الجلسة التالية تلقائيًا؛
//   - تلك الجلسة التالية انعقدت صباح اليوم الساعة 9:30 (أو أمس إن شُغّل العرض قبل العاشرة) وما زالت بلا نتيجة،
//     فتظهر «جلسة بلا نتيجة» في صفحة الملف وتقويمه و«اليوم»؛
//   - واعتمدت الإدارة نص الجلسة التالية لتذكير المستفيد/ة (المسار العادي بعد مراجعتها).
import { cairoLocalToIso, cairoParts, cairoDayKey } from './util.js';

const HOUR = 3600 * 1000;

/**
 * @param {object} app
 * @param {{ matterId:number, lawyer:object, manager:object, realNow:number, setNow:(ms:number)=>void }} ctx
 */
export function seedCourtDemo(app, { matterId, lawyer, manager, realNow, setNow }) {
  const { db } = app;
  if (!matterId || !lawyer) return;
  const m = db.get('SELECT * FROM matters WHERE id = ?', matterId);
  if (!m || m.status === 'closed') return;

  const nowParts = cairoParts(new Date(realNow));
  // الجلسة «بلا نتيجة»: اليوم 9:30 إن كانت الساعة الآن بعد العاشرة بتوقيت القاهرة، وإلا أمس 9:30
  const pendingDay = nowParts.hour >= 10 ? new Date(realNow) : new Date(realNow - 24 * HOUR);
  const pd = cairoParts(pendingDay);
  const pendingKey = cairoDayKey(pendingDay);
  // الجلسة السابقة قبل 9 أيام من الجلسة المعلقة (وبعد فتح الملف بيوم على الأقل)
  const opened = m.opened_at ? Date.parse(m.opened_at) : 0;
  let prevMs = Date.parse(cairoLocalToIso(pd.year, pd.month, pd.day, 12, 0)) - 9 * 24 * HOUR;
  if (prevMs < opened + 24 * HOUR) prevMs = opened + 24 * HOUR;
  const pp = cairoParts(new Date(prevMs));
  const prevIso = cairoLocalToIso(pp.year, pp.month, pp.day, 9, 30);
  if (cairoDayKey(prevIso) >= pendingKey) return;

  // سجّلها المحامي بعد فتح الملف
  setNow(Math.max(opened + HOUR, Date.parse(prevIso) - 5 * 24 * HOUR));
  const prev = app.matters.addEvent(m.id, { kind: 'hearing', title: 'جلسة نظر جنحة التبديد', starts_at: prevIso, location: m.court || null, client_attendance_required: true }, lawyer);
  app.matters.approveEventText(prev.id, manager);

  // بعد الجلسة بساعتين: «تأجّلت» للاطلاع إلى يوم الجلسة المعلقة (نفس الساعة 9:30)
  setNow(Date.parse(prevIso) + 3 * HOUR);
  const res = app.matters.recordOutcome(
    prev.id,
    { result: 'adjourned', reason: 'review', next_date: pendingKey, client_ref: `seed-court-${prev.id}-adjourned`, decision: 'قدّمنا حافظة مستندات وطلب الدفاع أجلًا للاطلاع على تقرير الخبير.' },
    lawyer,
  );
  // راجعت الإدارة الجلسة التالية واعتمدت تذكير المستفيد/ة بها
  setNow(Date.parse(prevIso) + 26 * HOUR);
  if (res.next_event) app.matters.approveEventText(res.next_event.id, manager);

  // موعد الصرف المعتاد كما يظهر للمحامين في «مستحقاتي» (إعداد تضبطه الإدارة؛ فارغ في التثبيت الجديد)
  if (!app.settings.get('lawyer_payout_note')) app.settings.set('lawyer_payout_note', 'من 5 إلى 10 من الشهر التالي، بتحويل بنكي');
}
