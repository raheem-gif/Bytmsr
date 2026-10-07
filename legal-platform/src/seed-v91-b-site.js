// v9.1 b-site — بيانات تجريبية لقاعدة القناة الواحدة وتأكيد الرقم بنقرة واحدة (B91-01) وصياغة الرسائل (B91-10):
//  1) «أم يوسف» قدّمت من الموقع ثم ضغطت «ابعتي رقم الطلب على واتساب»: وصلت رسالتها برقم الطلب وكود التأكيد،
//     فتأكد رقمها تلقائيًا ووصلها رد واتساب برابط صفحتها، وردود الإدارة بعدها تصلها على واتساب.
//  2) «منى» قدّمت من الموقع ولم تؤكد رقمها: رد الإدارة وطلب الورقة في صفحة المتابعة فقط، وتذكير الورقة لا يُرسل
//     لرقمها (تصل الإدارة رسالة «لم يُرسل التذكير: رقم المستفيد/ة … غير مؤكد» عند تشغيل الأتمتة في آخر البيانات التجريبية).
//  3) قالب ميتا «portal_update» (بلا تفاصيل) قيد مراجعة ميتا في صفحة القوالب — بند مفتوح قبل الإطلاق.
import crypto from 'node:crypto';
import { sha256, parseJson, addDays, nowIso } from './util.js';
import { sourceFromWebAttribution } from './channels/engine.js';
import { countTemplateParams } from './channels/whatsapp.js';

/** طلب من نموذج الموقع بنفس مسار POST /api/public/intake (رابط مقصور على الطلب + كود تأكيد مُجزّأ لمدة 30 يومًا) */
function websiteIntake(app, { phone, name, gov, area, text }) {
  const attribution = sourceFromWebAttribution({ landing_path: '/intake', utm_source: 'facebook', utm_medium: 'social' });
  attribution.detail = { ...attribution.detail, intake_mode: 'form' };
  const r = app.engine.receive({
    channel: 'website',
    from_phone: phone,
    contact_name: name,
    governorate: gov,
    text,
    attribution,
    legal_area_hint: area,
    force_new_intake: true,
    intake_kind: 'consultation',
  });
  app.clients.issuePortalToken(r.client.id, { intakeId: r.intake.id });
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const sd = parseJson(app.db.value('SELECT source_detail FROM intakes WHERE id = ?', r.intake.id), {});
  sd.confirm_hash = sha256(code);
  sd.confirm_expires_at = addDays(nowIso(), 30);
  sd.confirm_failures = 0;
  app.db.update('intakes', r.intake.id, { source_detail: JSON.stringify(sd) });
  return { ...r, code };
}

/**
 * @param {object} app
 * @param {{ at: (daysAgo:number, hour?:number, minute?:number) => void, manager: object }} ctx
 */
export function seedSiteDemo(app, { at, manager }) {
  const { db } = app;

  // 1) تأكيد بنقرة واحدة من شاشة النجاح
  at(3, 11, 5);
  const confirmed = websiteIntake(app, {
    phone: '01077001122',
    name: 'أم يوسف حسن',
    gov: 'الجيزة',
    area: 'PEN',
    text: 'جوزي اتوفى من 4 شهور وكان شغال في شركة، ومش عارفة أطلّع معاشه أنا والعيال. قالولي محتاجة ورق كتير.',
  });
  at(3, 11, 7);
  app.engine.receive({
    channel: 'whatsapp',
    external_id: 'wamid.v91-site-confirm-1',
    from_phone: '+201077001122',
    contact_name: 'أم يوسف',
    text: `السلام عليكم، ده رقم طلبي ${confirmed.intake.code} وكود التأكيد ${confirmed.code}`,
  });
  at(3, 13, 20);
  app.intakes.reply(confirmed.intake.id, { body: 'أهلًا يا أم يوسف، وصلنا طلبك. محتاجين صورة شهادة الوفاة وبطاقتك، وهنكلمك بكرة عشان نشرح لك خطوات المعاش.', await_client: true }, manager);

  // 2) رقم غير مؤكد: كل شيء في صفحة المتابعة فقط
  at(5, 18, 40);
  const unconfirmed = websiteIntake(app, {
    phone: '01093104455',
    name: 'منى عبد الحميد',
    gov: 'القاهرة',
    area: 'FAM',
    text: 'أبو العيال سايبنا من سنة ومش بيصرف عليهم خالص، وعايزة أرفع نفقة بس مش عارفة أبدأ منين.',
  });
  at(5, 20, 0);
  app.intakes.reply(unconfirmed.intake.id, { body: 'أهلًا يا منى، وصلنا طلبك. هنراجعه ونرد عليكي هنا في صفحة طلبك.' }, manager);
  at(4, 12, 0);
  const kase = app.intakes.convert(
    unconfirmed.intake.id,
    {
      legal_area: 'FAM',
      title: 'نفقة صغار — امتناع الأب عن الإنفاق',
      facts_shared: 'الأم حاضنة لطفلين، والأب ممتنع عن الإنفاق منذ عام تقريبًا.',
      issues: [{ title: 'استحقاق نفقة الصغار وتقديرها' }],
      case_manager_id: manager.id,
      client: { name: 'منى عبد الحميد', governorate: 'القاهرة' },
    },
    manager,
  );
  at(4, 12, 30);
  app.requests.createInfoByStaff(kase.id, manager, {
    kind: 'document',
    question: 'شهادات ميلاد العيال، وقسيمة الجواز أو الطلاق لو موجودة.',
    client_message: 'محتاجين منك صورة شهادات ميلاد العيال، وقسيمة الجواز أو الطلاق لو معاكي.',
  });

  // 3) قالب «في جديد في طلبك» بلا تفاصيل — قُدّم لميتا وينتظر الاعتماد
  at(1, 9, 0);
  if (!db.get("SELECT 1 FROM wa_templates WHERE name = 'portal_update' AND language = 'ar'")) {
    const body = 'أهلًا يا {{1}}، في جديد في طلبك عند {{2}}.\nافتحي صفحتك من هنا: {{3}}';
    db.insert('wa_templates', {
      external_id: '1288430915532901',
      name: 'portal_update',
      language: 'ar',
      category: 'UTILITY',
      status: 'PENDING',
      header_text: null,
      body_text: body,
      footer_text: null,
      param_count: countTemplateParams(body),
      header_param_count: 0,
      buttons: '[]',
      rejected_reason: null,
      synced_at: nowIso(),
    });
  }
  return { confirmedIntakeId: confirmed.intake.id, unconfirmedIntakeId: unconfirmed.intake.id, caseId: kase.id };
}
