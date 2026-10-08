// v9.2 public — بيانات العرض لشاشة البداية بالمربعات ونموذج الطلب بالصور:
//   1) «أم يوسف»: ورث، طلبت مكالمة الصبح بلا حكاية (جوزي · إعلام الوراثة: مش عارفة)
//   2) «أم ريم»: سكن وإيجار بحكاية مكتوبة (إيجار قديم · فيه حد عايز يطلّعها)
//   3) بلا اسم ولا موضوع: «إحنا نكلمك» من الصفحة الرئيسية، أي وقت
// تمر كلها بنفس قواعد POST /api/public/intake (app.publicIntake) فتظهر للإدارة كما تظهر الطلبات الحقيقية.

const ATTR = { landing_path: '/', utm_source: 'facebook', utm_medium: 'social' };

/**
 * @param {object} app
 * @param {{ at: (daysAgo:number, hour?:number, minute?:number) => void }} ctx  ساعة البيانات التجريبية من seed.js
 */
export function seedPublicDemo(app, { at }) {
  if (typeof app.publicIntake !== 'function') return;
  const send = (daysAgo, hour, minute, body) => {
    at(daysAgo, hour, minute);
    try {
      return app.publicIntake({ consent: true, consent_v: 1, attribution: ATTR, ...body });
    } catch (e) {
      app.log?.('seed-v92-public', e);
      return null;
    }
  };
  // 1) ورث — مكالمة الصبح بلا حكاية
  send(0, 8, 20, {
    name: 'أم يوسف',
    phone: '01092000101',
    topic: 'inh',
    answers: { 'inh.deceased': 'husband', 'inh.certificate': 'unknown' },
    callback: 'morning',
    entry: 'home_tile',
    mode: 'callback',
    submission_id: 'seed_v92_public_0001',
  });
  // 2) سكن وإيجار — حكاية مكتوبة
  send(0, 7, 45, {
    name: 'أم ريم',
    phone: '01092000102',
    topic: 'rent',
    answers: { 'rent.home': 'rented_old', 'rent.evict': 'yes' },
    description: 'صاحب البيت بعتلنا إنذار وعايز يطلّعنا من الشقة، وجوزي متوفي من سنة',
    entry: 'home_tile',
    mode: 'tiles',
    submission_id: 'seed_v92_public_0002',
  });
  // 3) «إحنا نكلمك» من الصفحة الرئيسية — بلا اسم ولا موضوع
  send(0, 9, 5, {
    phone: '01092000103',
    callback: 'any',
    entry: 'home_callback',
    mode: 'callback',
    submission_id: 'seed_v92_public_0003',
  });
}
