// بيانات العرض التجريبي لوحدة الرسائل (الإصدار 9): الردود الجاهزة، قوالب واتساب المعتمدة وربطها بالأغراض،
// مستند أرسلته الإدارة للعميل عبر البوابة، واستبيانات رضا عن ملفات أُرسل فيها الرد (تُنشأ عبر نفس خدمات المنصة).
import { addHours, nowIso, normalizePhone } from '../util.js';
import { countTemplateParams } from '../channels/whatsapp.js';

const QUICK_REPLIES = [
  {
    title: 'المستندات المطلوبة لإعلام الوراثة',
    shortcut: '/وثائق',
    category: 'documents',
    uses: 41,
    body:
      'أهلًا {client_name}، لاستخراج إعلام الوراثة نرجو تجهيز المستندات التالية:\n1) شهادة وفاة المورث (مميكنة).\n2) صورة بطاقة الرقم القومي لكل وارث.\n3) شهادات ميلاد الأبناء القُصّر إن وُجدوا، وقسيمة زواج الأرملة.\n4) اسما شاهدين من غير الورثة يعرفان المتوفى وأسرته.\nيمكنكم تصوير المستندات وإرسالها هنا، أو رفعها من صفحة متابعة طلبكم. — {org_name}',
  },
  {
    title: 'متطلبات دعوى النفقة',
    shortcut: '/نفقة',
    category: 'documents',
    uses: 33,
    body:
      'لرفع دعوى النفقة أو المطالبة بالمتجمد نحتاج من حضرتك:\n• صورة قسيمة الزواج أو إشهاد الطلاق.\n• شهادات ميلاد الأطفال.\n• صورة بطاقة الرقم القومي.\n• ما يدل على دخل الأب (جهة عمله أو ممتلكاته أو إيصالات تحويل سابقة).\n• حكم النفقة السابق إن وُجد.\nيُرجى ذكر رقم ملفكم {case_code} عند الإرسال.',
  },
  {
    title: 'الولاية على مال القاصر (النيابة الحسبية)',
    shortcut: '/ولاية',
    category: 'procedures',
    uses: 17,
    body:
      'أموال الأيتام القُصّر لا يجوز التصرف فيها (بيعًا أو صرفًا من البنك) إلا بإذن من محكمة الأسرة بعد عرض الأمر على النيابة الحسبية، ويكون الولي أو الوصي مسؤولًا أمامها عن حفظ المال وتقديم كشف حساب. نرجو إرسال صورة قرار الوصاية إن صدر، وبيان بأموال القُصّر (حساب بنكي، عقار، معاش) حتى يحدد المحامي الخطوة المناسبة في ملفكم {case_code}.',
  },
  {
    title: 'مستندات صرف معاش الأرملة والأيتام',
    shortcut: '/معاش',
    category: 'documents',
    uses: 24,
    body:
      'لصرف المعاش المستحق عن المتوفى نرجو تجهيز: شهادة الوفاة، وقسيمة الزواج، وشهادات ميلاد الأبناء، وبطاقة الرقم القومي للأرملة، وآخر بيان تأميني للمتوفى إن وُجد. يُقدَّم الطلب في مكتب التأمينات الاجتماعية التابع لمحل الإقامة، ويمكننا متابعة أي تعثر في الصرف معكم. وإن كان الطلب لمعاش «تكافل وكرامة» فيُقدَّم في الوحدة الاجتماعية التابعة لكم.',
  },
  {
    title: 'مستندات نزاع الإيجار والسكن',
    shortcut: '/إيجار',
    category: 'documents',
    uses: 9,
    body:
      'لدراسة مشكلة السكن نرجو إرسال: صورة عقد الإيجار، وآخر إيصالات سداد الأجرة، وأي إنذار أو محضر أو حكم يخص الشقة، مع توضيح تاريخ بدء السكن ومن الطرف المتعاقد في العقد. — {org_name}',
  },
  {
    title: 'العنوان وطريقة الحضور',
    shortcut: '/عنوان',
    category: 'appointments',
    uses: 28,
    body:
      'يسعدنا استقبالكم في مقر {org_name}: 44 شارع المحكمة العسكرية، بجوار مدرسة الزهراء، الحي العاشر، مدينة نصر، القاهرة. يُرجى الاتصال على 01211114662 لتحديد موعد قبل الحضور، واصطحاب أصول المستندات وصورها.',
  },
  {
    title: 'شرح صفحة المتابعة',
    shortcut: '/بوابة',
    category: 'portal',
    uses: 36,
    body:
      'يمكنكم متابعة ملفكم {case_code} في أي وقت من صفحة المتابعة الخاصة بكم: افتحوا «متابعة طلبك» على موقعنا واكتبوا رقم الموبايل المسجل لدينا، وسيصلكم رمز دخول على واتساب. من الصفحة تردّون على طلباتنا وترفعون المستندات وتقرؤون الرد القانوني بعد اعتماده.',
  },
  {
    title: 'تأكيد استلام الطلب',
    shortcut: '/استلام',
    category: 'greeting',
    uses: 52,
    body:
      'أهلًا {client_name}، وصلنا طلبكم رقم {request_code} وهو الآن قيد الدراسة لدى فريق الدعم القانوني في {org_name}. سنتواصل معكم قريبًا، ويمكنكم إرسال أي تفاصيل أو مستندات إضافية هنا.',
  },
  {
    title: 'طريقة تصوير المستندات',
    shortcut: '/تصوير',
    category: 'general',
    uses: 14,
    body:
      'حتى تصلنا المستندات واضحة: صوّروا كل ورقة كاملة في إضاءة جيدة ودون ظل، ورقة واحدة في كل صورة، ويُفضّل إرسالها بصيغة PDF إن أمكن. لا ترسلوا أصول المستندات بالبريد.',
  },
  {
    title: 'الختام بعد إرسال الرد',
    shortcut: '/ختام',
    category: 'greeting',
    uses: 19,
    body:
      'شكرًا لثقتكم في {org_name}. نرجو أن يكون الرد في ملفكم {case_code} قد أفادكم، ولا تترددوا في مراسلتنا عند أي مستجد.',
  },
];

const TEMPLATES = [
  {
    id: '1288430915532781',
    name: 'case_update',
    category: 'UTILITY',
    status: 'APPROVED',
    body: 'تحديث بخصوص ملفكم لدى مؤسسة بيوت مصر:\n{{1}}\nللرد يمكنكم مراسلتنا على هذا الرقم.',
    footer: 'مؤسسة بيوت مصر لدعم الأرامل والأيتام',
  },
  {
    id: '1288430915532794',
    name: 'portal_login_code',
    category: 'AUTHENTICATION',
    status: 'APPROVED',
    body: '*{{1}}* هو رمز التحقق الخاص بك. حفاظًا على أمانك، لا تشارك هذا الرمز مع أحد.',
    footer: 'تنتهي صلاحية هذا الرمز خلال 10 دقائق.',
    buttons: [{ type: 'OTP', text: 'نسخ الرمز', otp_type: 'COPY_CODE' }],
  },
  {
    id: '1288430915532807',
    name: 'satisfaction_survey',
    category: 'UTILITY',
    status: 'APPROVED',
    body: 'نرجو أن يكون ردنا في ملفكم رقم {{1}} قد أفادكم. كيف تقيّمون خدمة {{2}}؟ يمكنكم أيضًا الرد برقم من 1 إلى 5.',
    buttons: [
      { type: 'QUICK_REPLY', text: 'ممتاز' },
      { type: 'QUICK_REPLY', text: 'جيد' },
      { type: 'QUICK_REPLY', text: 'غير راضٍ' },
    ],
  },
  {
    id: '1288430915532815',
    name: 'hearing_reminder',
    category: 'UTILITY',
    status: 'APPROVED',
    body: 'تذكير من مؤسسة بيوت مصر: لديكم {{1}} في الملف رقم {{2}} يوم {{3}} الساعة {{4}} في {{5}}، ويلزم حضوركم شخصيًا.',
  },
  {
    id: '1288430915532829',
    name: 'invoice_reminder',
    category: 'UTILITY',
    status: 'PENDING',
    body: 'تذكير بالفاتورة رقم {{1}} بمبلغ {{2}} ج.م المستحقة بتاريخ {{3}}. شكرًا لكم.',
  },
  {
    id: '1288430915532836',
    name: 'ramadan_greeting',
    category: 'MARKETING',
    status: 'REJECTED',
    rejected_reason: 'INVALID_FORMAT',
    body: 'رمضان كريم {{1}}! تابعوا برامج مؤسسة بيوت مصر لدعم الأرامل والأيتام.',
  },
];

const MAPPINGS = [
  ['case_update', 'case_update', ['body']],
  ['otp', 'portal_login_code', ['code']],
  ['survey', 'satisfaction_survey', ['case_code', 'org_name']],
  ['rule:hearing_reminder', 'hearing_reminder', ['event_kind', 'matter_code', 'date', 'time', 'location']],
];

// ردود العملاء على استبيان الرضا (بالترتيب الزمني لإرسال الرد في الملف)
const SURVEY_REPLIES = [
  { phone: '01112223344', button: 5 },
  { phone: '01223334455', text: '4 — الرد كان واضحًا ومرتبًا وفهمت منه حقي وحق أخواتي' },
  { phone: '01234567890', button: 5 },
  { phone: '01098765432', button: 5 },
  { phone: '01155667788', button: 3 },
  { phone: '01011112222', text: '4' },
  { phone: '01288990011', text: 'ممتاز' },
  { phone: '01066778899', text: '2', comment: 'الرد اتأخر أكتر من أسبوع، ولما اتصلت أسأل محدش كان عارف الملف وصل لفين' },
  { phone: '01144556677', none: true },
  { phone: '01000111222', button: 5 },
  { phone: '01277788899', button: 3 },
];

function smallPdf(title) {
  const text = String(title).replace(/[()\\]/g, '');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\n% ${text}\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
    'latin1',
  ).toString('base64');
}

export async function seedMessagingDemo(app, { setTime, at, admin, manager }) {
  const { db } = app;

  // ===== الردود الجاهزة (أعدتها إدارة الحالات واستُخدمت على مدى الأشهر الماضية) =====
  at(110, 11);
  for (const q of QUICK_REPLIES) {
    const r = app.messaging.createQuickReply(q, manager);
    // الأكثر استخدامًا استُخدم مؤخرًا (أمس أو قبل أيام)، والأقل استخدامًا قبل أسبوع أو أكثر — قبل «الآن» دائمًا
    const daysAgo = Math.max(1, Math.round(80 / Math.max(1, q.uses)));
    db.update('quick_replies', r.id, { usage_count: q.uses, last_used_at: addHours(nowIso(), 24 * (110 - daysAgo) - 3) });
  }

  // ===== قوالب واتساب كما زامنتها الإدارة من حساب واتساب للأعمال =====
  at(30, 12, 20);
  const syncedAt = nowIso();
  for (const t of TEMPLATES) {
    db.insert('wa_templates', {
      external_id: t.id,
      name: t.name,
      language: 'ar',
      category: t.category,
      status: t.status,
      header_text: null,
      body_text: t.body,
      footer_text: t.footer || null,
      param_count: countTemplateParams(t.body),
      header_param_count: 0,
      buttons: JSON.stringify((t.buttons || []).map((b) => ({ type: b.type, text: b.text, url: null, otp_type: b.otp_type || null }))),
      rejected_reason: t.rejected_reason || null,
      synced_at: syncedAt,
    });
  }
  for (const [purpose, name, params] of MAPPINGS) app.messaging.setMapping(purpose, { template_name: name, language: 'ar', params }, admin);

  // ===== استبيانات الرضا: تُرسل بعد الرد بـ 24 ساعة كما تفعل قاعدة الأتمتة، ثم يرد العملاء =====
  const params = app.automations.list().find((r) => r.key === 'satisfaction_survey')?.params;
  if (params) {
    const once = (ruleKey, dedupeKey, entityType, entityId, fn) => {
      if (db.get('SELECT 1 FROM automation_runs WHERE rule_key = ? AND dedupe_key = ?', ruleKey, dedupeKey)) return false;
      db.tx(() => {
        const result = fn();
        db.insert('automation_runs', { rule_key: ruleKey, dedupe_key: dedupeKey, entity_type: entityType, entity_id: entityId, result: JSON.stringify(result ?? 'ok'), created_at: nowIso() });
      });
      return true;
    };
    const plan = SURVEY_REPLIES.map((s) => {
      const client = app.clients.findByPhone(s.phone);
      const answer = client
        ? db.get(
            "SELECT a.case_id, a.sent_at FROM client_answers a JOIN cases c ON c.id = a.case_id WHERE c.client_id = ? AND a.status = 'sent' ORDER BY a.id DESC LIMIT 1",
            client.id,
          )
        : null;
      return answer ? { ...s, client, answer } : null;
    })
      .filter(Boolean)
      .sort((a, b) => a.answer.sent_at.localeCompare(b.answer.sent_at));
    let n = 0;
    for (const p of plan) {
      setTime(addHours(p.answer.sent_at, 24.25));
      app.messaging.runSurveys(params, { once });
      const survey = db.get('SELECT * FROM case_surveys WHERE case_id = ?', p.answer.case_id);
      if (!survey || p.none) continue;
      setTime(addHours(survey.sent_at, 2 + (n % 5)));
      const from = normalizePhone(p.phone);
      const name = p.client.name;
      if (p.button) {
        const title = { 5: 'ممتاز', 3: 'جيد', 1: 'غير راضٍ' }[p.button];
        app.engine.receive({ channel: 'whatsapp', external_id: `wamid.SEED.SVY.${++n}`, from_phone: from, contact_name: name, text: title, reply: { kind: 'interactive', id: `svy:${survey.id}:${p.button}`, title } });
      } else {
        app.engine.receive({ channel: 'whatsapp', external_id: `wamid.SEED.SVY.${++n}`, from_phone: from, contact_name: name, text: p.text });
      }
      if (p.comment) {
        setTime(addHours(survey.sent_at, 3.5));
        app.engine.receive({ channel: 'whatsapp', external_id: `wamid.SEED.SVY.${++n}`, from_phone: from, contact_name: name, text: p.comment });
      }
    }
  }

  // ===== مستند أرسلته الإدارة للعميلة عبر بوابة العملاء (خارج نافذة واتساب) =====
  const samia = app.clients.findByPhone('01012345678');
  const mainCase = samia ? db.get("SELECT id FROM cases WHERE client_id = ? AND status != 'closed' ORDER BY id LIMIT 1", samia.id) : null;
  if (mainCase) {
    at(2, 12, 40);
    const [doc] = app.cases.addDocuments(
      mainCase.id,
      [{ filename: 'دليل_إجراءات_إعلام_الوراثة.pdf', mime: 'application/pdf', data_base64: smallPdf('Inheritance declaration procedure guide') }],
      manager,
      { title: 'دليل إجراءات استخراج إعلام الوراثة' },
    );
    if (doc) {
      app.messaging.sendDocument(
        doc.id,
        { channel: 'auto', caption: 'أتحنا لكم دليلًا مختصرًا بخطوات استخراج إعلام الوراثة والمستندات المطلوبة، ويمكنكم تنزيله من صفحة متابعة طلبكم. — بيوت مصر' },
        manager,
      );
    }
  }
}
