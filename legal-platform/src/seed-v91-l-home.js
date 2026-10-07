// الإصدار 9.1 — مسار l-home: بيانات تجريبية لصفحة «اليوم» (L-01) وتنبيهات المحامي على واتساب (L-06).
// تُستدعى من src/seed.js (علامة <seed:v91-l-home>) عبر نفس خدمات التشغيل الفعلي.
//
// المحامي هاني رمزي (hany): اشترك في تنبيهات واتساب برقمه، ثم أسندت إليه الإدارة الملف INH-…-00482 بصفة «محامٍ مشارك»
// مع موعد تسليم بعد يومين الساعة 6 مساءً — فيظهر في «اليوم» صف «إسناد جديد» إلى جانب الرأي المتأخر وجلسة اليوم بلا
// نتيجة ومهمة بعد يومين، ويظهر في صندوق الصادر تنبيه واتساب للمحامي (محاكاة) بنص بلا أي بيانات عن المستفيدة.
import { cairoLocalToIso, cairoParts } from './util.js';

const HOUR = 3600 * 1000;
const HANY_PHONE = '+201001112233';

/**
 * @param {object} app
 * @param {{ lawyer:object, manager:object, caseCode?:string, realNow:number, setNow:(ms:number)=>void }} ctx
 */
export function seedHomeDemo(app, { lawyer, manager, caseId = null, realNow, setNow }) {
  const { db } = app;
  if (!lawyer || !manager) return;
  // اشتراك المحامي في التنبيهات (كما يفعله من «حسابي» أو بطاقة «جهّز هاتفك»)
  db.update('users', lawyer.id, { phone: HANY_PHONE, alert_whatsapp: 1 });

  const c = caseId ? db.get("SELECT * FROM cases WHERE id = ? AND status != 'closed'", caseId) : null;
  if (!c) return;
  if (db.get('SELECT 1 FROM assignments WHERE case_id = ? AND lawyer_id = ?', c.id, lawyer.id)) return;
  // أسندته الإدارة قبل ساعتين تقريبًا (خارج ساعات الهدوء إن أمكن، فيُرسل التنبيه فورًا)
  let assignedAt = realNow - 2 * HOUR;
  const p = cairoParts(new Date(assignedAt));
  if (p.hour < 8 || p.hour >= 22) assignedAt = realNow - 60 * 1000;
  setNow(assignedAt);
  const d = cairoParts(new Date(realNow + 2 * 24 * HOUR));
  const due = cairoLocalToIso(d.year, d.month, d.day, 18, 0);
  try {
    app.cases.assign(
      c.id,
      {
        lawyer_id: lawyer.id,
        role: 'co_counsel',
        due_at: due,
        brief: 'مراجعة الشق الجنائي المحتمل: هل يمثل امتناع أحد الورثة عن تسليم نصيب القاصرين في ريع المحل جريمة يمكن تحريكها، وما أثر ذلك على دعوى القسمة؟',
      },
      manager,
    );
  } catch (e) {
    app.log?.('seed l-home assignment skipped', e);
  }
}
