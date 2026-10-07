// بيانات العرض التجريبي: تُنشأ عبر نفس خدمات المنصة (وليس بإدخال مباشر) حتى تكون الأرقام والحالات متسقة تمامًا.
// تعيد تمثيل السيناريو الكامل: إعلان فيسبوك ← واتساب ← فرز ← INH-2026-00482 ← محامٍ أساسي ← طلب معلومات ← متخصص ضرائب ...
import { setClock, cairoLocalToIso, cairoParts, addDays } from './util.js';
import { sourceFromReferral } from './channels/whatsapp.js';
import { sourceFromWebAttribution } from './channels/engine.js';
import { seedCourtDemo } from './seed-v91-l-court.js'; // v9.1 l-court
import { seedHomeDemo } from './seed-v91-l-home.js'; // v9.1 l-home
import { seedWorkDemo } from './seed-v91-l-work.js'; // v9.1 l-work
import { seedFormsDemo } from './seed-v91-b-forms.js'; // v9.1 b-forms
import { seedSiteDemo } from './seed-v91-b-site.js'; // v9.1 b-site
import { seedPortalDemo } from './seed-v91-b-portal.js'; // v9.1 b-portal

const HOUR = 3600 * 1000;

/** ملف PDF صغير صالح (للعرض فقط) */
function tinyPdf(title) {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
}
const pdf = (filename, title) => ({ filename, mime: 'application/pdf', data_base64: tinyPdf(title) });

export async function seedDemo(app) {
  const { db } = app;
  const realNow = Date.now();
  let T = realNow;
  const tick = () => setClock(() => new Date(T));
  const at = (daysAgo, hour = 10, minute = 0) => {
    const p = cairoParts(new Date(realNow - daysAgo * 24 * HOUR));
    T = new Date(cairoLocalToIso(p.year, p.month, p.day, hour, minute)).getTime();
    if (T > realNow) T = realNow - 5 * 60 * 1000;
    tick();
  };
  const adv = (hours) => {
    T = Math.min(T + hours * HOUR, realNow - 60 * 1000);
    tick();
  };
  const user = (username) => db.get('SELECT * FROM users WHERE username = ?', username);
  let wamid = 0;
  const wa = (phone, name, text, { referral = null, attachments = [] } = {}) =>
    app.engine.receive({
      channel: 'whatsapp',
      external_id: `wamid.SEED.${++wamid}`,
      from_phone: phone,
      contact_name: name,
      text,
      attachments,
      referral,
      attribution: referral ? sourceFromReferral(referral) : null,
    });
  const web = (phone, name, gov, text, attribution, { area = null, attachments = [] } = {}) => {
    const r = app.engine.receive({
      channel: 'website',
      from_phone: phone,
      contact_name: name,
      governorate: gov,
      text,
      attachments,
      attribution: sourceFromWebAttribution(attribution),
      legal_area_hint: area,
      force_new_intake: true,
      intake_kind: 'consultation',
    });
    app.clients.issuePortalToken(r.client.id, { intakeId: r.intake.id });
    return r;
  };
  const fbAd = (headline) => ({ source_url: 'https://fb.me/bayoutmasr-legal', source_type: 'ad', source_id: '120208877001', headline, ctwa_clid: 'seed' });
  const igAd = (headline) => ({ source_url: 'https://www.instagram.com/p/bayoutmasr', source_type: 'ad', source_id: '120208877002', headline, ctwa_clid: 'seed' });

  try {
    // ================= المستخدمون =================
    at(150);
    db.setCounter('client', 860);
    const adminU = app.lawyers.createStaff({ role: 'admin', username: 'admin', name: 'كريم منصور', password: 'Admin@2026', email: 'admin@example.org' });
    const managerU = app.lawyers.createStaff({ role: 'case_manager', username: 'manager', name: 'منى السيد', password: 'Manager@2026' });
    const admin = user('admin');
    const manager = user('manager');
    const L = (o) => app.lawyers.create({ password: 'Lawyer@2026', title: 'أ.', ...o }, admin);
    L({ username: 'ahmed', name: 'أحمد عبد العظيم', specialties: ['INH', 'FAM', 'PRP'], capacity: 15, bar_level: 'استئناف', bar_number: '48213', agreement: { type: 'per_case', rate: 500, billable_event: 'on_approval' } });
    L({ username: 'mohamed', name: 'محمد فؤاد', specialties: ['TAX', 'COM'], capacity: 10, bar_level: 'نقض', bar_number: '30117', agreement: { type: 'per_case', rate: 500, billable_event: 'on_approval' } });
    L({ username: 'salwa', title: 'د.', name: 'سلوى الشريف', specialties: ['INH', 'FAM', 'CIV'], capacity: 8, bar_level: 'نقض', agreement: { type: 'pro_bono', notional_value: 600 }, notes: 'تتطوع بالمراجعة النهائية لملفات الأسرة والمواريث.' });
    L({ username: 'hany', name: 'هاني رمزي', specialties: ['CRM', 'CIV'], capacity: 20, bar_level: 'استئناف', agreement: { type: 'monthly', monthly_fee: 8000, billable_event: 'on_approval' } });
    L({ username: 'yasmine', name: 'ياسمين خليل', specialties: ['LAB', 'ADM'], capacity: 15, agreement: { type: 'monthly_quota', monthly_fee: 6000, quota: 12, overage_rate: 400, billable_event: 'on_approval' } });
    L({ username: 'tarek', name: 'طارق النجار', specialties: ['COM', 'CIV', 'PRP'], capacity: 6, firm: 'مكتب النجار وشركاه للمحاماة', agreement: { type: 'csr', csr_firm: 'مكتب النجار وشركاه للمحاماة', csr_cases_commitment: 24, csr_hours_commitment: 120, csr_period: 'year', notional_value: 800 } });
    L({ username: 'rania', name: 'رانيا عبد الله', specialties: ['FAM'], capacity: 12, agreement: { type: 'package', package_size: 20, package_price: 7000, overage_rate: 400, billable_event: 'on_approval' } });
    L({ username: 'amr', name: 'عمرو الشافعي', specialties: ['PRP', 'CIV'], capacity: 10, agreement: { type: 'per_case', rate: 450, billable_event: 'on_close' } });
    void adminU;
    void managerU;
    const U = Object.fromEntries(['ahmed', 'mohamed', 'salwa', 'hany', 'yasmine', 'tarek', 'rania', 'amr'].map((u) => [u, user(u)]));

    // ================= دورة كاملة لملف تاريخي =================
    async function fullCase(spec) {
      at(spec.daysAgo, 11);
      let r;
      for (const [i, m] of spec.messages.entries()) {
        r = spec.channel === 'website' && i === 0
          ? web(spec.phone, spec.name, spec.gov, m, spec.attribution || {}, { area: spec.hint })
          : wa(spec.phone, spec.name, m, { referral: i === 0 ? spec.referral : null });
        adv(0.1);
      }
      const intakeId = r.intake.id;
      await app.ai.analyzeIntake(intakeId);
      adv(2);
      app.intakes.markSeen(intakeId, manager);
      adv(1);
      const c = app.intakes.convert(
        intakeId,
        {
          legal_area: spec.area,
          title: spec.title,
          facts_shared: spec.facts,
          facts_internal: spec.internal || null,
          issues: spec.issues.map((t) => ({ title: t })),
          case_manager_id: manager.id,
          priority: spec.priority || 'normal',
          client: { name: spec.name, governorate: spec.gov },
        },
        manager,
      );
      adv(1);
      const lead = U[spec.lead];
      const { assignment } = app.cases.assign(c.id, { lawyer_id: lead.id, role: 'lead', brief: spec.brief || 'دراسة الوقائع وإبداء الرأي القانوني في المسائل المحددة.', due_at: addDays(new Date(T).toISOString(), 3) }, manager);
      adv(spec.openAfter ?? 5);
      app.visibility.markOpened(assignment.id, lead);
      if (spec.info) {
        adv(2);
        const ir = app.requests.createInfoByLawyer(assignment.id, lead, { kind: 'information', question: spec.info.q });
        adv(1);
        app.requests.approveInfo(ir.id, manager, { client_message: spec.info.clientMsg || spec.info.q });
        adv(14);
        const reply = wa(spec.phone, spec.name, spec.info.reply);
        adv(2);
        app.requests.recordReply(ir.id, manager, { message_ids: [reply.message_id] });
        app.requests.shareInfo(ir.id, manager, { response_text: spec.info.reply });
      }
      let specialistAssignment = null;
      if (spec.specialist) {
        adv(3);
        const issue = db.get('SELECT id FROM case_issues WHERE case_id = ? AND number = ?', c.id, spec.specialist.issue);
        const cr = app.requests.createCounsel(assignment.id, lead, { kind: 'specialist_input', specialty: spec.specialist.specialty, issue_ids: [issue.id], description: spec.specialist.description });
        adv(2);
        const res = app.requests.assignCounsel(cr.id, manager, {
          lawyer_id: U[spec.specialist.lawyer].id,
          fee_mode: spec.specialist.fee ? 'custom' : 'agreement',
          fee_amount: spec.specialist.fee,
          grants: { facts: true, issue_ids: [issue.id], document_ids: [] },
        });
        specialistAssignment = res.assignment;
        adv(6);
        app.visibility.markOpened(res.assignment.id, U[spec.specialist.lawyer]);
        adv(10);
        app.opinions.submit(res.assignment.id, U[spec.specialist.lawyer], { body: spec.specialist.opinion, hours_spent: 2 });
        adv(2);
        const op = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", res.assignment.id);
        app.opinions.approve(op.id, manager, { quality_score: 5 });
      }
      adv(spec.draftAfter ?? 20);
      if (spec.returnOnce) {
        app.opinions.submit(assignment.id, lead, { body: spec.firstDraft || spec.opinion.split('\n').slice(0, 3).join('\n'), hours_spent: 1.5 });
        adv(4);
        const op = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", assignment.id);
        app.opinions.returnToLawyer(op.id, manager, { note: spec.returnNote });
        adv(10);
      }
      app.opinions.submit(assignment.id, lead, { body: spec.opinion, hours_spent: spec.hours ?? 3 });
      if (spec.reviewer) {
        adv(2);
        const rv = app.cases.assign(c.id, {
          lawyer_id: U[spec.reviewer].id,
          role: 'reviewer',
          fee_mode: 'pro_bono',
          brief: 'مراجعة نهائية للرأي قبل اعتماده من الإدارة.',
          grants: { facts: true, opinion_assignment_ids: [assignment.id], issue_ids: db.all('SELECT id FROM case_issues WHERE case_id = ?', c.id).map((x) => x.id) },
        }, manager).assignment;
        adv(5);
        app.visibility.markOpened(rv.id, U[spec.reviewer]);
        app.opinions.submit(rv.id, U[spec.reviewer], { body: spec.reviewNote || 'راجعت الرأي وأوافق على ما انتهى إليه، مع التأكيد على ضرورة استيفاء المستندات قبل اتخاذ أي إجراء.', hours_spent: 1 });
        adv(2);
        const rop = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", rv.id);
        app.opinions.approve(rop.id, manager, { quality_score: 5 });
      }
      adv(3);
      const op = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", assignment.id);
      app.opinions.approve(op.id, manager, { quality_score: spec.quality ?? 4, note: spec.approveNote || null });
      if (spec.stopAt === 'approved') return { case: c, assignment, specialistAssignment };
      adv(2);
      const sug = await app.ai.clientVersion(c.id, op.id, manager);
      const ans = app.opinions.saveClientAnswer(c.id, manager, { opinion_id: op.id, body: spec.clientAnswer || sug.output.text });
      app.opinions.sendClientAnswer(ans.id, manager, {});
      adv(spec.closeAfter ?? 24);
      if (spec.matter) return { case: c, assignment, specialistAssignment };
      app.cases.close(c.id, { outcome: spec.outcome || 'answered', note: spec.closeNote || null }, manager);
      if (spec.knowledge) {
        const k = db.get('SELECT id FROM knowledge_records WHERE case_id = ?', c.id);
        if (k) app.knowledge.approve(k.id, { usage: spec.knowledge, confirm_redaction: true, note: 'تمت مراجعة الإخفاء.' }, admin);
      }
      return { case: c, assignment, specialistAssignment };
    }

    // ================= ملفات تاريخية مغلقة (تكوّن المعرفة المؤسسية) =================
    await fullCase({
      daysAgo: 118,
      channel: 'whatsapp',
      referral: fbAd('هل لك حق في ميراث؟ استشارة قانونية من بيوت مصر'),
      phone: '01112223344',
      name: 'فاطمة إبراهيم السيد',
      gov: 'القاهرة',
      messages: [
        'السلام عليكم، أمي الله يرحمها توفيت من 4 شهور وسابت شقة في شبرا وحساب في البنك. إحنا بنتين وولد، وأخويا عايز ياخد الشقة لوحده ويقول إن البنت ليها نص الولد. عايزة أعرف نصيب كل واحد فينا وإزاي نطلع إعلام الوراثة.',
      ],
      area: 'INH',
      title: 'تقسيم تركة تتضمن شقة وحسابًا بنكيًا بين الأبناء',
      facts: 'توفيت والدة صاحبة الطلب منذ نحو أربعة أشهر، وتركت شقة سكنية بشبرا وحسابًا مصرفيًا. الورثة الظاهرون: ابنتان وابن. يرغب الابن في الاستئثار بالشقة. لم يُستخرج إعلام الوراثة بعد.',
      issues: ['تحديد الورثة الشرعيين وأنصبتهم', 'إجراءات استخراج إعلام الوراثة', 'قسمة الشقة رضائيًا أو بدعوى فرز وتجنيب'],
      lead: 'ahmed',
      info: { q: 'هل زوج المتوفاة أو أي من والديها على قيد الحياة؟', clientMsg: 'برجاء إفادتنا: هل والد حضرتك (زوج المرحومة) أو جد وجدة حضرتك لأمك على قيد الحياة؟', reply: 'لا، والدي متوفي من سنين وجدي وجدتي كمان متوفيين.' },
      opinion:
        'أولًا: الورثة وأنصبتهم — بافتراض صحة ما أفادت به العميلة من وفاة الزوج والأبوين، ينحصر الإرث في الأولاد (ابن وبنتان) ويرثون التركة كلها تعصيبًا للذكر مثل حظ الأنثيين: للابن النصف، ولكل بنت الربع.\nثانيًا: إعلام الوراثة — يُستخرج بطلب أمام محكمة الأسرة المختصة بموطن المتوفاة مرفقًا به شهادة الوفاة وما يثبت صلة القرابة، ويُستعان بشاهدين.\nثالثًا: الشقة — لا يجوز لأحد الورثة الاستئثار بها؛ والأصل القسمة الرضائية (بيع وتوزيع الثمن أو تخارج بمقابل)، فإن تعذرت جاز رفع دعوى فرز وتجنيب، وإن تعذرت القسمة عينًا تُباع بالمزاد ويوزع الثمن.\nرابعًا: الحساب المصرفي — يُصرف للورثة بموجب إعلام الوراثة وفق الأنصبة السابقة.',
      quality: 5,
      knowledge: 'knowledge_training',
    });

    await fullCase({
      daysAgo: 96,
      channel: 'website',
      attribution: { utm_source: 'google', utm_medium: 'organic', referrer: 'https://www.google.com/', landing_path: '/' },
      phone: '01223334455',
      name: 'منى محمود حسن',
      gov: 'الجيزة',
      hint: 'INH',
      messages: [
        'توفي والدي وترك قطعة أرض زراعية مساحتها ثلاثة أفدنة في البدرشين وبيتًا. نحن ثلاث بنات ووالدتي على قيد الحياة. أعمامي يقولون إن لهم نصيبًا لأننا بنات فقط. هل يرث الأعمام معنا فعلًا؟ وهل نستطيع تسجيل الأرض بأسمائنا؟',
      ],
      area: 'INH',
      title: 'نصيب الأعمام في تركة لم يترك فيها المتوفى أبناءً ذكورًا',
      facts: 'توفي والد صاحبة الطلب وترك أرضًا زراعية (ثلاثة أفدنة) وبيتًا. الورثة: الزوجة وثلاث بنات، وللمتوفى إخوة أشقاء (أعمام صاحبة الطلب) يطالبون بنصيب.',
      issues: ['تحديد أنصبة الزوجة والبنات', 'نصيب الإخوة الأشقاء بالتعصيب', 'تسجيل الأرض الزراعية الموروثة'],
      lead: 'salwa',
      opinion:
        'أولًا: للزوجة الثمن فرضًا لوجود الفرع الوارث، وللبنات الثلاث الثلثان فرضًا يقسم بينهن بالتساوي.\nثانيًا: الباقي بعد الفروض (خمسة من أربعة وعشرين سهمًا) يستحقه الإخوة الأشقاء للمتوفى تعصيبًا، لعدم وجود ابن أو أب، فمطالبة الأعمام لها سند قانوني بشرط ثبوت كونهم إخوة أشقاء أو لأب وعدم وجود من يحجبهم.\nثالثًا: يلزم إعلام وراثة يحدد الورثة جميعًا، ثم يمكن تسجيل الأرض بأسماء الورثة بحسب أنصبتهم، أو قسمتها رضائيًا بعقد قسمة.\nملاحظة: إن كان والد المتوفى (الجد) حيًا تغيرت الأنصبة ويُعاد الحساب.',
      quality: 5,
      knowledge: 'knowledge',
    });

    const h3 = await fullCase({
      daysAgo: 85,
      channel: 'whatsapp',
      referral: fbAd('نفقة الأطفال حق — اسأل محامي مجانًا'),
      phone: '01234567890',
      name: 'نهى سمير عبد الفتاح',
      gov: 'القليوبية',
      messages: [
        'انا مطلقة من سنة ومعايا ولدين 5 و7 سنين، طليقي بطل يدفع النفقة من 4 شهور وبيهددني ياخد الولاد مني. اعمل ايه؟',
        'وكمان عنده حكم رؤية ومش بيلتزم بيه وبيجي يقف تحت البيت ويعمل مشاكل',
      ],
      area: 'FAM',
      title: 'نفقة صغار متجمدة ونزاع على الحضانة والرؤية',
      facts: 'صاحبة الطلب مطلقة منذ عام وحاضنة لطفلين (5 و7 سنوات). توقف المطلق عن سداد النفقة منذ أربعة أشهر ويهدد بنزع الحضانة، وله حكم رؤية لا يلتزم بمواعيده.',
      issues: ['المطالبة بنفقة الصغار المتجمدة وتنفيذها', 'ثبوت الحضانة للأم وحدود حق الأب', 'تنظيم الرؤية'],
      lead: 'rania',
      reviewer: 'salwa',
      returnOnce: true,
      returnNote: 'يرجى توضيح طريق التنفيذ العملي لأحكام النفقة وذكر سن انتهاء حضانة النساء.',
      opinion:
        'أولًا: الحضانة ثابتة للأم حتى بلوغ الصغير أو الصغيرة سن الخامسة عشرة، ولا يملك الأب نزعها إلا بحكم قضائي لأسباب جدية تتعلق بمصلحة المحضون، والتهديد وحده لا أثر له.\nثانيًا: يحق للحاضنة رفع دعوى نفقة صغار (أو زيادة إن كان هناك حكم سابق) أمام محكمة الأسرة، والمطالبة بالمتجمد، ويمكن تنفيذ حكم النفقة عبر بنك ناصر الاجتماعي، ويجوز اتخاذ إجراءات الحبس عند الامتناع عن السداد بعد ثبوت القدرة.\nثالثًا: الرؤية تكون وفق الحكم في المكان والموعد المحددين، وتجاوز الأب لذلك أو التعرض للحاضنة يجيز تحرير محضر وإثباته.\nالتوصية: البدء بدعوى النفقة فورًا مع حفظ ما يثبت التهديدات.',
      quality: 4,
      matter: true,
    });

    await fullCase({
      daysAgo: 72,
      channel: 'whatsapp',
      referral: igAd('حقك في ميراث جدك — اعرف إزاي'),
      phone: '01098765432',
      name: 'خالد عبد الرحيم',
      gov: 'الإسكندرية',
      messages: ['جدي توفى من شهرين وابويا كان متوفي قبله بخمس سنين، أعمامي بيقولوا ملناش حق في الميراث عشان ابويا مات قبل جدي. هل احنا مالناش حاجة فعلا؟ احنا 2 ولاد وبنت'],
      area: 'INH',
      title: 'استحقاق أحفاد الابن المتوفى قبل أبيه للوصية الواجبة',
      facts: 'توفي جد صاحب الطلب، وكان والد صاحب الطلب قد توفي قبل الجد. للمتوفى أبناء أحياء (أعمام صاحب الطلب). يدعي الأعمام أن أبناء الابن المتوفى لا يستحقون شيئًا.',
      issues: ['مدى استحقاق أبناء الابن المتوفى قبل أبيه للوصية الواجبة', 'طريقة احتساب الوصية الواجبة وحدها الأقصى'],
      lead: 'ahmed',
      opinion:
        'أولًا: أبناء الابن الذي توفي قبل أبيه لا يرثون بالفرض أو التعصيب مع وجود أعمامهم، لكن قانون الوصية المصري يوجب لهم «وصية واجبة» في تركة الجد بمقدار ما كان أبوهم سيرثه لو كان حيًا، في حدود ثلث التركة.\nثانيًا: تُقسم الوصية الواجبة بين الأحفاد للذكر مثل حظ الأنثيين، وتُقدَّم على الميراث، ولا تحتاج إلى أن يكون الجد قد أوصى بها فعلًا ما لم يكن قد أعطاهم بغير عوض ما يعادلها في حياته.\nثالثًا: يجب أن يتضمن إعلام الوراثة الإشارة إلى المستحقين للوصية الواجبة، وإلا أمكن التظلم منه أو رفع دعوى بإثبات الاستحقاق.',
      quality: 5,
      knowledge: 'knowledge_training',
    });

    await fullCase({
      daysAgo: 64,
      channel: 'website',
      attribution: { referrer: '', landing_path: '/' },
      phone: '01155667788',
      name: 'سيد عبد الفتاح',
      gov: 'الشرقية',
      messages: ['اشتغلت في مصنع 9 سنين والمدير فصلني فجأة من غير تحقيق ومش عايز يديني مستحقاتي، ومش متأمن عليا غير من 3 سنين بس. مرتبي كان 7000 جنيه.'],
      area: 'LAB',
      title: 'فصل من العمل دون تحقيق والمطالبة بالمستحقات وإثبات مدة الخدمة',
      facts: 'عمل صاحب الطلب لدى مصنع تسع سنوات بأجر شهري 7000 جنيه، وأُنهيت خدمته فجأة دون تحقيق، ولم يُؤمَّن عليه إلا عن آخر ثلاث سنوات.',
      issues: ['مدى مشروعية إنهاء الخدمة دون تحقيق', 'المستحقات العمالية والتعويض', 'إثبات مدة الخدمة غير المؤمن عليها'],
      lead: 'yasmine',
      opinion:
        'أولًا: إنهاء صاحب العمل لعقد العمل دون مبرر مشروع ودون اتباع إجراءات التحقيق يعد فصلًا تعسفيًا يرتب للعامل الحق في التعويض أمام المحكمة العمالية.\nثانيًا: يستحق العامل أجره حتى تاريخ الإنهاء، ومقابل رصيد الإجازات، وأي مستحقات متفق عليها، بالإضافة إلى التعويض الذي تقدره المحكمة.\nثالثًا: مدة الخدمة غير المؤمن عليها يمكن إثباتها بكل طرق الإثبات (شهود، كشوف صرف، مراسلات)، ويُقدم بلاغ لهيئة التأمينات الاجتماعية لإلزام صاحب العمل بالاشتراكات عن المدة الفعلية.\nالتوصية: تقديم شكوى لمكتب العمل المختص أولًا للتسوية الودية، ثم اللجوء للمحكمة العمالية خلال المواعيد المقررة.',
      quality: 4,
      knowledge: 'knowledge',
    });

    const h6 = await fullCase({
      daysAgo: 52,
      channel: 'whatsapp',
      referral: null,
      phone: '01011112222',
      name: 'رامي فوزي',
      gov: 'القاهرة',
      messages: ['مضيت إيصال أمانة لتاجر بـ 50 ألف جنيه ضمان لبضاعة، ودلوقتي عامل عليا محضر تبديد. عندي جلسة الشهر الجاي. اعمل ايه؟'],
      area: 'CRM',
      title: 'جنحة تبديد عن إيصال أمانة محرر ضمانًا لتعامل تجاري',
      facts: 'وقّع صاحب الطلب إيصال أمانة بمبلغ 50 ألف جنيه لصالح تاجر ضمانًا لتوريد بضاعة، وحرر التاجر ضده محضر تبديد وتحدد لنظر الجنحة جلسة الشهر القادم.',
      issues: ['التكييف القانوني لإيصال الأمانة المحرر ضمانًا لدين تجاري', 'أوجه الدفاع في جنحة التبديد', 'إمكانية التصالح وأثره'],
      lead: 'hany',
      opinion:
        'أولًا: جريمة خيانة الأمانة تقتضي تسليم المال على سبيل الأمانة (وديعة أو وكالة ...)، فإذا ثبت أن الإيصال حُرر ضمانًا لثمن بضاعة في تعامل تجاري فإن العلاقة مدنية وتنتفي أركان الجريمة.\nثانيًا: الدفاع يقوم على إثبات حقيقة العلاقة بكل طرق الإثبات (فواتير، مراسلات، شهود)، والدفع بانتفاء ركن التسليم على سبيل الأمانة.\nثالثًا: التصالح أو السداد يؤثر في مسار الدعوى ويُطلب إثباته رسميًا أمام المحكمة.\nالتوصية: حضور الجلسة بمحامٍ، وتجهيز حافظة مستندات بما يثبت التعامل التجاري.',
      quality: 4,
      matter: true,
    });

    await fullCase({
      daysAgo: 45,
      channel: 'website',
      attribution: { ref: 'jamaiyat-alamal', utm_campaign: 'partners-2026', landing_path: '/intake' },
      phone: '01288990011',
      name: 'عزة مصطفى',
      gov: 'الجيزة',
      messages: ['أنا ساكنة في شقة إيجار قديم من 1985 باسم والدي الله يرحمه، وكنت ساكنة معاه طول عمري، وصاحب البيت عايز يطردني بعد وفاة والدي. هل ليا حق أكمل في الشقة؟'],
      area: 'PRP',
      title: 'امتداد عقد إيجار قديم لابنة المستأجر المقيمة معه',
      facts: 'استأجر والد صاحبة الطلب شقة سكنية منذ عام 1985 بنظام الإيجار القديم، وكانت تقيم معه إقامة مستقرة حتى وفاته، ويطالبها المالك بالإخلاء.',
      issues: ['امتداد عقد الإيجار للأقارب المقيمين مع المستأجر', 'أثر التعديلات التشريعية الأخيرة على عقود الإيجار القديم'],
      lead: 'amr',
      opinion:
        'أولًا: الأصل أن عقد الإيجار السكني الخاضع لقوانين الإيجار الاستثنائية يمتد لأقارب المستأجر من الدرجة الأولى المقيمين معه إقامة مستقرة حتى الوفاة، ويكون الامتداد لمرة واحدة.\nثانيًا: يجب إثبات الإقامة المستقرة بالمستندات (بطاقة الرقم القومي بالعنوان، فواتير، شهود).\nثالثًا: صدرت تعديلات تشريعية حديثة تنظم عقود الإيجار القديم وتضع فترات انتقالية؛ لذا يلزم مراجعة أحكامها السارية وتطبيقها على هذا العقد قبل أي إجراء.\nالتوصية: عدم ترك الشقة، والاستمرار في سداد الأجرة بإنذار عرض إن رفض المالك الاستلام.',
      quality: 4,
    });

    await fullCase({
      daysAgo: 36,
      channel: 'whatsapp',
      referral: fbAd('مشكلة مع شريكك؟ استشر بيوت مصر'),
      phone: '01066778899',
      name: 'شريف عادل',
      gov: 'القاهرة',
      messages: ['أنا وشريكي عاملين شركة توصية بسيطة، وهو بيسحب فلوس من حساب الشركة من غير ما يرجعلي، ومصلحة الضرايب باعتة لنا إخطار بفحص ضريبي عن 3 سنين. عايز أفض الشراكة.'],
      area: 'COM',
      title: 'خلاف بين الشركاء في شركة توصية بسيطة وإخطار بفحص ضريبي',
      facts: 'صاحب الطلب شريك في شركة توصية بسيطة، ويسحب الشريك الآخر أموالًا من حساب الشركة دون موافقته، وتلقت الشركة إخطارًا بفحص ضريبي عن ثلاث سنوات.',
      issues: ['حقوق الشريك وحل الشركة', 'محاسبة الشريك عن المسحوبات', 'الموقف من إخطار الفحص الضريبي'],
      lead: 'tarek',
      specialist: {
        lawyer: 'mohamed',
        specialty: 'TAX',
        issue: 3,
        fee: 250,
        description: 'أطلب رأيًا متخصصًا في الموقف من إخطار الفحص الضريبي ومدى مسؤولية كل شريك (المسألة رقم 3).',
        opinion: 'يتعين الرد على إخطار الفحص خلال الميعاد المحدد به وتقديم الدفاتر والمستندات المؤيدة، ويُنصح بعدم حل الشركة قبل تسوية الموقف الضريبي حتى لا تتعقد المحاسبة. الشريك المتضامن مسؤول عن ديون الشركة بما فيها الضريبية في أمواله الخاصة، بخلاف الشريك الموصي في حدود حصته. يمكن الطعن على تقديرات الفحص أمام لجان الطعن المختصة في المواعيد القانونية.',
      },
      opinion:
        'أولًا: لصاحب الطلب أن يطلب حل الشركة قضائيًا لإخلال الشريك بالتزاماته، أو الاتفاق على التخارج بتقييم عادل للحصص.\nثانيًا: يحق له مطالبة الشريك بتقديم حساب عن المسحوبات وردها إلى الشركة، مع إمكانية طلب تعيين حارس قضائي عند الخشية من الإضرار بأموال الشركة.\nثالثًا: بشأن الفحص الضريبي يُعتمد ما ورد برأي المتخصص الضريبي المرفق، مع تقديم ذلك على أي إجراء لحل الشركة.',
      quality: 5,
      knowledge: 'knowledge_training',
    });

    await fullCase({
      daysAgo: 27,
      channel: 'website',
      attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'egypt-legal-search', referrer: 'https://www.google.com/' },
      phone: '01144556677',
      name: 'عبد الله حمدي',
      gov: 'أسيوط',
      messages: ['صدر قرار إزالة لدور بنيته فوق بيتي من الحي، وعندي طلب تصالح متقدم من سنة ولسه ماتردش عليه. أعمل ايه قبل ما ينفذوا؟'],
      area: 'ADM',
      title: 'قرار إزالة مخالفة بناء رغم وجود طلب تصالح قائم',
      facts: 'صدر لصاحب الطلب قرار إزالة لدور مبني فوق منزله، رغم تقدمه بطلب تصالح على المخالفة منذ عام لم يُبت فيه.',
      issues: ['مدى جواز تنفيذ الإزالة أثناء نظر طلب التصالح', 'الطعن على قرار الإزالة ومواعيده'],
      lead: 'yasmine',
      opinion:
        'أولًا: تقديم طلب التصالح وفق قانون التصالح في مخالفات البناء يترتب عليه وقف الإجراءات المتخذة بشأن المخالفة لحين البت في الطلب، ما لم يكن الطلب قد رُفض أو كانت المخالفة مستثناة من التصالح.\nثانيًا: يمكن الطعن على قرار الإزالة أمام محكمة القضاء الإداري مع طلب وقف التنفيذ بصفة مستعجلة، خلال ستين يومًا من تاريخ العلم بالقرار.\nالتوصية: الحصول على ما يثبت تقديم طلب التصالح وسداد جدية التصالح، وتقديم تظلم فوري للجهة الإدارية بالتوازي مع الطعن.',
      quality: 4,
    });

    await fullCase({
      daysAgo: 21,
      channel: 'whatsapp',
      referral: igAd('خلع ولا طلاق للضرر؟ اعرفي حقوقك'),
      phone: '01000111222',
      name: 'مروة جمال',
      gov: 'المنوفية',
      messages: ['عايزة أخلع جوزي، هو بيضربني ومش عايزة أي حاجة منه. إيه الإجراءات وهرجعله المهر كله؟'],
      area: 'FAM',
      title: 'الاختيار بين دعوى الخلع والتطليق للضرر',
      facts: 'تتعرض صاحبة الطلب للضرب من زوجها وترغب في إنهاء العلاقة الزوجية، وتسأل عن إجراءات الخلع وما يلزمها رده.',
      issues: ['إجراءات دعوى الخلع وشروطها', 'رد مقدم الصداق والتنازل عن الحقوق المالية', 'التطليق للضرر كبديل يحفظ الحقوق المالية'],
      lead: 'rania',
      opinion:
        'أولًا: الخلع يقتضي تنازل الزوجة عن جميع حقوقها المالية الشرعية ورد مقدم الصداق الذي دفعه الزوج، وتُعرض محاولة الصلح قبل الحكم، والحكم فيه نهائي.\nثانيًا: بما أن الزوجة تتعرض للضرب، فلها بدلًا من ذلك طلب التطليق للضرر مع الاحتفاظ بحقوقها المالية (مؤخر الصداق ونفقة العدة والمتعة)، بشرط إثبات الضرر بالمحاضر والتقارير الطبية والشهود.\nالتوصية: تحرير محضر وتقرير طبي عند أي اعتداء، ثم المفاضلة بين الطريقين وفق قوة أدلة الضرر.',
      quality: 5,
      knowledge: 'knowledge',
    });

    await fullCase({
      daysAgo: 14,
      channel: 'website',
      attribution: { utm_source: 'google', utm_medium: 'organic', referrer: 'https://www.google.com/' },
      phone: '01277788899',
      name: 'حسام الدين يوسف',
      gov: 'الدقهلية',
      messages: ['والدي توفي وعليه ديون للبنك، هل الورثة ملزمين يسددوا الديون من فلوسهم الخاصة؟ والتركة فيها عربية وشقة'],
      area: 'INH',
      title: 'مسؤولية الورثة عن ديون المورث قبل قسمة التركة',
      facts: 'توفي والد صاحب الطلب وعليه مديونية لبنك، وتشمل التركة سيارة وشقة.',
      issues: ['مسؤولية الورثة عن ديون المورث في حدود التركة', 'أولوية سداد الديون قبل تقسيم التركة'],
      lead: 'ahmed',
      opinion:
        'أولًا: القاعدة أنه «لا تركة إلا بعد سداد الديون»، فتُسدد ديون المتوفى من أموال التركة أولًا قبل توزيعها على الورثة.\nثانيًا: لا يُلزم الورثة بسداد ديون مورثهم من أموالهم الخاصة، ومسؤوليتهم محدودة بما آل إليهم من التركة.\nثالثًا: يُنصح بحصر التركة ومخاطبة البنك للوقوف على قيمة المديونية وأي تأمين عليها (فبعض القروض مغطاة بوثيقة تأمين على الحياة تسددها عند الوفاة).',
      quality: 5,
      knowledge: 'knowledge',
    });

    // ================= ملفات العمل المستمر (Matters) =================
    adv(2);
    const m1 = app.matters.createFromCase(h3.case.id, {
      kind: 'litigation',
      title: 'دعوى نفقة صغار ومتجمد نفقة — محكمة الأسرة',
      responsible_lawyer_id: U.rania.id,
      court: 'محكمة الأسرة ببنها',
      circuit: 'الدائرة الثالثة',
      lawsuit_number: '1874',
      lawsuit_year: '2026',
      opponent: 'المطلق',
      agreed_fee: 300,
      notes: 'رفع دعوى نفقة صغار ومتجمد عن أربعة أشهر، وإثبات عدم التزام الأب بمواعيد الرؤية.',
      close_case: true,
    }, manager);
    adv(1);
    app.matters.addTask(m1.id, { title: 'تقديم حافظة مستندات بإثبات الدخل وشهادات ميلاد الأطفال', due_at: addDays(new Date(T).toISOString(), 4), procedural: true }, manager);
    app.matters.addExpense(m1.id, { description: 'رسوم قيد الدعوى', amount: 150, paid_by: 'lawyer', lawyer_id: U.rania.id }, manager);
    app.matters.addInvoice(m1.id, { description: 'رسوم إدارية رمزية لملف التقاضي', amount: 300, due_at: addDays(new Date(T).toISOString(), 10) }, manager);

    const m2 = app.matters.createFromCase(h6.case.id, {
      kind: 'litigation',
      title: 'الدفاع في جنحة تبديد إيصال أمانة',
      responsible_lawyer_id: U.hany.id,
      court: 'محكمة جنح مدينة نصر',
      circuit: 'الدائرة 12 جنح',
      lawsuit_number: '25416',
      lawsuit_year: '2026',
      opponent: 'التاجر الشاكي',
      notes: 'تقديم ما يثبت أن الإيصال حُرر ضمانًا لتعامل تجاري.',
      close_case: true,
    }, manager);

    // ================= السيناريو الرئيسي: INH-2026-00482 =================
    at(6, 10, 15);
    db.setCounter('case:INH:' + cairoParts(new Date(T)).year, 481);
    db.setCounter('client', 880);
    const sPhone = '01012345678';
    const sName = 'سامية محمود عبد الحميد';
    const r1 = wa(sPhone, sName, 'السلام عليكم، والدي الله يرحمه اتوفى من سنة ونص وساب شقة في المعادي ومحل في السيدة زينب. احنا 3 اخوات، وأخويا الكبير واضع إيده على المحل ورافض القسمة. وفيه ولاد أخويا اللي اتوفى قبل والدي، قصر عندهم 8 و11 سنة. عايزة أعرف حقوقنا وإزاي نقسم من غير مشاكل.', { referral: fbAd('هل لك حق في ميراث؟ استشارة قانونية من بيوت مصر') });
    adv(0.05);
    wa(sPhone, sName, 'وكمان سمعت إن في ضريبة على بيع الشقة لو بعناها؟ احنا بنفكر نبيعها ونقسم الفلوس');
    adv(0.1);
    const dDeath = wa(sPhone, sName, '[مستند: شهادة الوفاة]', { attachments: [pdf('شهادة_الوفاة.pdf', 'Death certificate - sample')] });
    adv(0.02);
    wa(sPhone, sName, '[مستند: عقد شراء الشقة]', { attachments: [pdf('عقد_شراء_شقة_المعادي.pdf', 'Apartment purchase contract - sample')] });
    adv(0.02);
    wa(sPhone, sName, '[مستند: عقد إيجار المحل]', { attachments: [pdf('عقد_إيجار_المحل.pdf', 'Shop lease contract - sample')] });
    void dDeath;
    const nIntake = r1.intake.id;
    await app.ai.analyzeIntake(nIntake);
    adv(2.5);
    app.intakes.markSeen(nIntake, manager);
    adv(1);
    const nCase = app.intakes.convert(
      nIntake,
      {
        legal_area: 'INH',
        title: 'نزاع بشأن تركة تتضمن عقارًا ومحلًا وحقوق قاصرين',
        facts_shared:
          'توفي المورث منذ نحو عام ونصف، وترك شقة سكنية بالمعادي (عقد شراء ابتدائي) ومحلًا تجاريًا بالسيدة زينب (مؤجر للمورث بعقد إيجار). الورثة الظاهرون: ثلاثة أبناء (ابنان وبنت)، بالإضافة إلى ابني ابن توفي قبل المورث، وهما قاصران (8 و11 سنة). يضع الابن الأكبر يده على المحل ويرفض القسمة. يفكر الورثة في بيع الشقة وتقسيم ثمنها.',
        facts_internal: 'جاءت العميلة من إعلان فيسبوك عن المواريث. تفضل التواصل مساءً عبر واتساب. أرسلت شهادة الوفاة وعقد شراء الشقة وعقد إيجار المحل.',
        issues: [
          { title: 'تحديد الورثة وأنصبتهم، ومدى استحقاق ابني الابن المتوفى للوصية الواجبة' },
          { title: 'حماية حقوق القاصرين والولاية على أموالهم عند القسمة أو البيع' },
          { title: 'الأثر الضريبي لانتقال الشقة بالميراث ثم بيعها' },
          { title: 'امتناع الأخ الأكبر عن القسمة ووضع يده على المحل' },
        ],
        priority: 'high',
        case_manager_id: manager.id,
        client: { name: sName, governorate: 'القاهرة' },
      },
      manager,
    );
    adv(1);
    const lead = app.cases.assign(nCase.id, {
      lawyer_id: U.ahmed.id,
      role: 'lead',
      brief: 'دراسة الوقائع وإبداء الرأي في المسائل الأربع، مع خطة عملية للقسمة تحفظ حقوق القاصرين.',
      due_at: addDays(new Date(realNow).toISOString(), 2),
    }, manager).assignment;
    adv(16);
    app.visibility.markOpened(lead.id, U.ahmed);
    adv(2);
    const ir1 = app.requests.createInfoByLawyer(lead.id, U.ahmed, { kind: 'information', question: 'هل صدر قرار من محكمة الأسرة بتعيين وصي على ابني الأخ المتوفى القاصرين؟ ومن هو الوصي؟' });
    adv(1.5);
    // (إصلاح 9.1، B91-10) بكلام بسيط كما تصلها الرسائل الآن (لا «تحية طيبة» ولا «ملفكم»)
    app.requests.approveInfo(ir1.id, manager, { client_message: 'يا ترى محكمة الأسرة عيّنت حد وصي على ولاد أخوكي الله يرحمه؟ ومين هو الوصي؟' });
    adv(9);
    const rep = wa(sPhone, sName, 'أيوه، مرات أخويا الله يرحمه (أم الولاد) هي الوصية بقرار من محكمة الأسرة سنة 2023');
    adv(13);
    app.requests.recordReply(ir1.id, manager, { message_ids: [rep.message_id] });
    app.requests.shareInfo(ir1.id, manager, { response_text: 'أفادت المستفيدة بأن أم القاصرين (أرملة الابن المتوفى) هي الوصية عليهما بقرار من محكمة الأسرة صادر عام 2023.' });
    adv(3);
    // v9.1 l-work: طلبته الإدارة نفسها من المستفيدة (لا المحامي)، فيظهر للمحامي في «مطلوب بالفعل من المستفيد/ة»
    const ir2 = app.requests.createInfoByStaff(nCase.id, manager, { kind: 'document', question: 'صورة إعلام الوراثة إن كان قد صدر، وإن لم يصدر نرجو إفادتنا بذلك.', send: false });
    const docs = db.all('SELECT id, filename FROM documents WHERE case_id = ? ORDER BY id', nCase.id);
    const deathDoc = docs.find((d) => d.filename.includes('الوفاة'));
    const flatDoc = docs.find((d) => d.filename.includes('شقة'));
    adv(1);
    const issue3 = db.get('SELECT id FROM case_issues WHERE case_id = ? AND number = 3', nCase.id);
    const cr = app.requests.createCounsel(lead.id, U.ahmed, {
      kind: 'specialist_input',
      specialty: 'TAX',
      issue_ids: [issue3.id],
      document_ids: [deathDoc.id, flatDoc.id],
      description: 'أطلب رأيًا متخصصًا في الأثر الضريبي المتعلق بانتقال الأصل محل التركة، وبالأخص المسألة رقم 3.',
    });
    adv(14);
    app.requests.approveInfo(ir2.id, manager, { client_message: 'برجاء إرسال صورة إعلام الوراثة إن كان قد صدر، وإن لم يصدر بعد نرجو إفادتنا بذلك.' });
    adv(1);
    const spec = app.requests.assignCounsel(cr.id, manager, {
      lawyer_id: U.mohamed.id,
      fee_mode: 'custom',
      fee_amount: 250,
      due_at: addDays(new Date(T).toISOString(), 2),
      brief: 'رأي متخصص في الأثر الضريبي لانتقال الشقة بالميراث ثم بيعها (المسألة رقم 3 فقط).',
      grants: { facts: true, issue_ids: [issue3.id], document_ids: [deathDoc.id, flatDoc.id] },
    }).assignment;
    adv(5);
    app.visibility.markOpened(spec.id, U.mohamed);
    adv(18);
    app.opinions.submit(spec.id, U.mohamed, {
      hours_spent: 2.5,
      body:
        'بشأن المسألة رقم 3 (الأثر الضريبي):\n1) انتقال ملكية الشقة إلى الورثة بطريق الميراث لا يُعد تصرفًا خاضعًا لضريبة التصرفات العقارية، ولا توجد في مصر حاليًا ضريبة على التركات.\n2) عند بيع الورثة للشقة لاحقًا تُستحق ضريبة التصرفات العقارية وفقًا لقانون الضريبة على الدخل بالنسبة المقررة حاليًا (2.5% من إجمالي قيمة التصرف دون خصم)، ويُراعى التحقق من عدم تعديل النسبة وقت البيع.\n3) يُستحسن تسجيل انتقال الملكية للورثة أو على الأقل إعداد عقد بيع يوقعه جميع الورثة، مع الحصول على إذن محكمة الأسرة بالنسبة لنصيب القاصرين قبل البيع.\n4) تخضع الشقة للضريبة السنوية على العقارات المبنية إذا تجاوزت قيمتها حد الإعفاء المقرر للمسكن الخاص، ويُراجع الموقف لدى مأمورية الضرائب العقارية المختصة.',
    });
    adv(3);
    const specOp = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", spec.id);
    app.opinions.approve(specOp.id, manager, { quality_score: 5, note: 'رأي واضح ومحدد، شكرًا.' });
    adv(4);
    app.opinions.saveDraft(lead.id, U.ahmed, {
      body:
        'أولًا: الورثة وأنصبتهم\n- يرث الأبناء الثلاثة (ابنان وبنت) التركة تعصيبًا للذكر مثل حظ الأنثيين، بعد إخراج الوصية الواجبة.\n- يستحق ابنا الابن المتوفى قبل أبيه وصية واجبة بمقدار ما كان سيرثه أبوهما لو كان حيًا، في حدود الثلث.\n\nثانيًا: حقوق القاصرين\n- [قيد الصياغة] أي قسمة أو بيع يشمل نصيب القاصرين يحتاج إذن محكمة الأسرة (نيابة شؤون الأسرة للولاية على المال)...',
    });

    // ================= ملفات مفتوحة أخرى بحالات مختلفة =================
    // ملف أحوال شخصية بانتظار مراجعة الإدارة (رأي المحامي + المراجع الأول)
    at(9, 13);
    const f1 = wa('01015556677', 'هبة ناصر', 'طليقي رافض يدفع نفقة بنتي (4 سنين) وعايز يطردنا من شقة الزوجية اللي عايشين فيها، مع إني أنا الحاضنة. أعمل إيه؟', { referral: fbAd('نفقة الأطفال حق — اسأل محامي مجانًا') });
    await app.ai.analyzeIntake(f1.intake.id);
    adv(3);
    app.intakes.markSeen(f1.intake.id, manager);
    const fc = app.intakes.convert(f1.intake.id, {
      legal_area: 'FAM',
      title: 'نفقة صغيرة وحق الحاضنة في مسكن الزوجية',
      facts_shared: 'صاحبة الطلب مطلقة وحاضنة لابنة عمرها أربع سنوات، ويمتنع المطلق عن النفقة ويطالب بإخلاء مسكن الزوجية الذي تقيم فيه الحاضنة مع الصغيرة.',
      issues: [{ title: 'استحقاق نفقة الصغيرة وتقديرها' }, { title: 'حق الحاضنة في الاستقلال بمسكن الزوجية أو أجر مسكن' }],
      case_manager_id: manager.id,
      client: { name: 'هبة ناصر', governorate: 'الجيزة' },
    }, manager);
    adv(1);
    const fLead = app.cases.assign(fc.id, { lawyer_id: U.rania.id, role: 'lead', due_at: addDays(new Date(T).toISOString(), 4) }, manager).assignment;
    adv(20);
    app.visibility.markOpened(fLead.id, U.rania);
    at(1, 12);
    app.opinions.submit(fLead.id, U.rania, {
      hours_spent: 3,
      body:
        'أولًا: نفقة الصغيرة واجبة على الأب الموسر، وتشمل المأكل والملبس والمسكن والتعليم والعلاج، وتُقدر بحسب يسار الأب، ويجوز طلب نفقة مؤقتة لحين الفصل.\nثانيًا: للحاضنة الاستقلال مع المحضونة بمسكن الزوجية طوال مدة الحضانة ما لم يهيئ المطلق مسكنًا آخر مناسبًا، ولا يجوز طردها منه؛ وإن خُيّرت فلها أجر مسكن حضانة.\nالتوصية: رفع دعوى نفقة صغيرة مع طلب تمكين من مسكن الحضانة، وتحرير محضر عند أي محاولة طرد بالقوة.',
    });
    adv(1);
    const fRev = app.cases.assign(fc.id, {
      lawyer_id: U.salwa.id,
      role: 'reviewer',
      fee_mode: 'pro_bono',
      brief: 'مراجعة نهائية لرأي المحامية قبل اعتماده.',
      grants: { facts: true, opinion_assignment_ids: [fLead.id], issue_ids: db.all('SELECT id FROM case_issues WHERE case_id = ?', fc.id).map((x) => x.id) },
    }, manager).assignment;
    adv(4);
    app.visibility.markOpened(fRev.id, U.salwa);
    app.opinions.submit(fRev.id, U.salwa, { hours_spent: 1, body: 'راجعت الرأي وأوافق عليه، وأقترح إضافة التنبيه على أن حق الحاضنة في مسكن الزوجية ينتهي بانتهاء مدة الحضانة، وأن تحتفظ بإيصالات المصروفات لإثبات حاجة الصغيرة عند تقدير النفقة.' });

    // ملف عمالي جديد لم يفتحه المحامي بعد
    at(2, 15);
    const l1 = web('01009998877', 'أشرف عبد الحكيم', 'الإسكندرية', 'الشركة اللي بشتغل فيها من 4 سنين وقفت صرف مرتبي من شهرين وبيقولوا ظروف، ومش عارف أعمل إيه، هل ليا حق أسيب الشغل وآخد مستحقاتي؟', { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'labor-rights-oct' });
    await app.ai.analyzeIntake(l1.intake.id);
    adv(2);
    app.intakes.markSeen(l1.intake.id, manager);
    const lc = app.intakes.convert(l1.intake.id, {
      legal_area: 'LAB',
      title: 'امتناع صاحب العمل عن صرف الأجر لمدة شهرين',
      facts_shared: 'يعمل صاحب الطلب لدى شركة منذ أربع سنوات، وتوقفت الشركة عن صرف أجره منذ شهرين بحجة الظروف المالية.',
      issues: [{ title: 'حق العامل في الأجر المتأخر وطرق المطالبة به' }, { title: 'مدى اعتبار التوقف عن الأجر مبررًا لإنهاء العامل للعقد مع الاحتفاظ بحقوقه' }],
      case_manager_id: manager.id,
      client: { name: 'أشرف عبد الحكيم', governorate: 'الإسكندرية' },
    }, manager);
    adv(1);
    app.cases.assign(lc.id, { lawyer_id: U.yasmine.id, role: 'lead', due_at: addDays(new Date(realNow).toISOString(), 1) }, manager);

    // ملف جنائي متأخر عن موعده
    at(6, 11);
    const k1 = wa('01120003344', 'وليد منصور', 'اتعمل عليا محضر سب وقذف من جاري بسبب خناقة على ركنة العربية، والنيابة طلبتني. أروح ولا لأ؟ ومحتاج محامي معايا؟');
    await app.ai.analyzeIntake(k1.intake.id);
    adv(2);
    app.intakes.markSeen(k1.intake.id, manager);
    const kc = app.intakes.convert(k1.intake.id, {
      legal_area: 'CRM',
      title: 'استدعاء للنيابة في محضر سب وقذف بين جيران',
      facts_shared: 'حرر جار صاحب الطلب محضر سب وقذف ضده إثر مشاجرة، واستدعته النيابة لسماع أقواله.',
      issues: [{ title: 'الموقف من استدعاء النيابة وحق الاستعانة بمحامٍ' }, { title: 'أوجه الدفاع في تهمة السب والقذف' }],
      priority: 'high',
      case_manager_id: manager.id,
      client: { name: 'وليد منصور', governorate: 'القاهرة' },
    }, manager);
    const kLead = app.cases.assign(kc.id, { lawyer_id: U.hany.id, role: 'lead', due_at: addDays(new Date(realNow).toISOString(), -1) }, manager).assignment;
    adv(20);
    app.visibility.markOpened(kLead.id, U.hany);
    app.opinions.saveDraft(kLead.id, U.hany, { body: 'أولًا: يحق للمستدعى الحضور أمام النيابة بصحبة محامٍ...' });

    // ملف عقاري معتمد بانتظار إرسال الرد للعميل (المحامي يُحاسَب عند الإغلاق)
    at(5, 10);
    const p1 = web('01233221100', 'سهير كمال', 'القاهرة', 'اشتريت شقة بعقد ابتدائي من 3 سنين والبائع رافض يكمل إجراءات التسجيل في الشهر العقاري، وبقيت خايفة يبيعها لحد تاني. أعمل إيه؟', { utm_source: 'google', utm_medium: 'organic', referrer: 'https://www.google.com/' });
    await app.ai.analyzeIntake(p1.intake.id);
    adv(2);
    app.intakes.markSeen(p1.intake.id, manager);
    const pc = app.intakes.convert(p1.intake.id, {
      legal_area: 'PRP',
      title: 'امتناع البائع عن إتمام تسجيل شقة مبيعة بعقد ابتدائي',
      facts_shared: 'اشترت صاحبة الطلب شقة بعقد ابتدائي منذ ثلاث سنوات، ويمتنع البائع عن إتمام إجراءات التسجيل، وتخشى بيعها للغير.',
      issues: [{ title: 'دعوى صحة ونفاذ عقد البيع وتسجيل صحيفتها' }, { title: 'حماية المشترية من تصرف البائع للغير' }],
      case_manager_id: manager.id,
      client: { name: 'سهير كمال', governorate: 'القاهرة' },
    }, manager);
    const pLead = app.cases.assign(pc.id, { lawyer_id: U.amr.id, role: 'lead' }, manager).assignment;
    adv(6);
    app.visibility.markOpened(pLead.id, U.amr);
    adv(20);
    app.opinions.submit(pLead.id, U.amr, {
      hours_spent: 2,
      body: 'أولًا: الطريق القانوني هو رفع دعوى صحة ونفاذ عقد البيع الابتدائي، وتسجيل صحيفتها في الشهر العقاري، فيكون للحكم الصادر فيها أثر رجعي من تاريخ تسجيل الصحيفة في مواجهة أي مشترٍ لاحق.\nثانيًا: يُنصح بإنذار البائع رسميًا بإتمام التسجيل، والتحقق من سلامة سند ملكية البائع وتسلسل الملكية.\nالتوصية: البدء فورًا في إجراءات الدعوى وتسجيل صحيفتها لحماية الحق من أي تصرف لاحق.',
    });
    adv(5);
    const pOp = db.get("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", pLead.id);
    app.opinions.approve(pOp.id, manager, { quality_score: 4 });

    // ================= صندوق الوارد: طلبات بانتظار الفرز =================
    at(1, 20, 30);
    const i1 = wa('01556667788', 'أم يوسف', 'طليقي مش بيدفع نفقة العيال بقاله 6 شهور ومعايا حكم نفقة، أعمل إيه عشان آخد الفلوس؟', { referral: igAd('نفقة الأطفال حق — اسألي محامية مجانًا') });
    await app.ai.analyzeIntake(i1.intake.id);
    at(0, 9, 40);
    const i2 = web('01099887766', 'محمد السعيد', 'سوهاج', 'أنا عامل في شركة مقاولات من 6 سنين والشركة فصلتني من غير أي سبب ومن غير ما تديني إنذار، ومش عايزين يدوني شهادة خبرة. مرتبي 5500 جنيه. مرفق صورة عقد العمل.', { utm_source: 'google', utm_medium: 'organic', referrer: 'https://www.google.com/' }, { attachments: [pdf('عقد_العمل.pdf', 'Employment contract - sample')] });
    await app.ai.analyzeIntake(i2.intake.id);
    at(3, 18);
    const i3 = wa('01277766655', 'إيمان', 'عندي مشكلة في إيصال أمانة');
    await app.ai.analyzeIntake(i3.intake.id);
    adv(1);
    app.intakes.markSeen(i3.intake.id, manager);
    app.intakes.reply(i3.intake.id, { body: 'أهلًا بحضرتك، يسعدنا مساعدتك. برجاء توضيح: هل حضرتك من حررت الإيصال أم صاحبة الحق فيه؟ وهل تم تحرير محضر أو صدر حكم؟', await_client: true }, manager);

    // الانتقال من الموقع إلى واتساب بنفس الرقم ونفس رقم الطلب ← نفس العميل ونفس الطلب
    at(2, 11);
    const i4 = web('01144433322', 'عادل مرسي', 'القاهرة', 'أنا مالك عمارة قديمة وفيها شقة مؤجرة إيجار قديم والمستأجر مسافر بره مصر من 5 سنين وقافل الشقة. هل ينفع أسترد الشقة؟', { ref: 'hayah-foundation', utm_campaign: 'partner-referrals' });
    adv(3);
    wa('01144433322', 'عادل مرسي', `مرحبًا بيوت مصر، رقم طلبي ${i4.intake.code} وأريد استكمال طلبي عبر واتساب. نسيت أقول إن عندي ما يثبت إن المستأجر مسافر.`);
    await app.ai.analyzeIntake(i4.intake.id);
    adv(1);
    app.intakes.markSeen(i4.intake.id, manager);
    // رقم مختلف يذكر نفس رقم الطلب ← لا دمج تلقائي، بل تنبيه للإدارة (حماية للخصوصية)
    adv(5);
    wa('01500011122', 'رقم غير معروف', `السلام عليكم بخصوص الطلب ${i4.intake.code}، أنا ابن الأستاذ عادل وعايز أعرف وصلتوا لإيه؟`);

    // استفسار بسيط تعاملت معه الإدارة داخليًا دون شراء وقت محامٍ
    at(4, 12);
    const i5 = wa('01033344455', 'سلمى', 'هل الاستشارة عندكم بفلوس؟ ومواعيدكم إمتى؟');
    await app.ai.analyzeIntake(i5.intake.id);
    adv(1);
    app.intakes.markSeen(i5.intake.id, manager);
    app.intakes.handleInternally(i5.intake.id, { resolution_note: 'استفسار عام عن الخدمة وتمت الإجابة عنه.', legal_area: 'GEN', reply: 'أهلًا بحضرتك، الاستشارة الأولى مجانية، ويمكنك إرسال تفاصيل مشكلتك هنا في أي وقت وسيتواصل معك فريقنا.' }, manager);

    // رسالة غير ذات صلة ← أرشفة
    at(3, 2);
    const i6 = wa('01222200011', null, 'مبروك ربحت جايزة 10000 جنيه اضغط على الرابط لاستلامها');
    await app.ai.analyzeIntake(i6.intake.id);
    adv(5);
    app.intakes.archive(i6.intake.id, { reason: 'رسالة دعائية غير ذات صلة' }, manager);

    // نموذج الموقع برقم عميلة مسجلة (سامية): الرقم غير موثّق، فيظهر تنبيه للإدارة ولا تصل رسائل واتساب صاحبة الرقم إلى هذا الطلب
    at(0, 13, 15);
    const i7 = web('01012345678', 'هبة', 'الجيزة', 'أنا بنت الحاجة سامية وعايزة أعرف وصلتوا لإيه في موضوع ورث جدي، وهل محتاجين مني أي ورق؟', { utm_source: 'facebook', utm_medium: 'social' });
    await app.ai.analyzeIntake(i7.intake.id);

    // ================= مواعيد ملفات العمل المستمر (تشغل الأتمتة) =================
    T = realNow - 10 * 60 * 1000;
    tick();
    const nowIsoStr = new Date(T).toISOString();
    const p = cairoParts(new Date(realNow));
    const in2 = cairoParts(new Date(realNow + 2 * 24 * HOUR));
    const e1 = app.matters.addEvent(m1.id, { kind: 'hearing', title: 'الجلسة الأولى لدعوى النفقة', starts_at: cairoLocalToIso(in2.year, in2.month, in2.day, 10, 0), location: 'محكمة الأسرة ببنها — الدائرة الثالثة', client_attendance_required: true }, U.rania);
    // ما يسجله المحامي لا يصل للعميل قبل اعتماد الإدارة: اعتمدت مديرة الحالات بيانات الجلسة الأولى،
    // بينما تبقى جلسة الملف الثاني بانتظار الاعتماد (لعرض المسارين)
    app.matters.approveEventText(e1.id, manager);
    // جلسة يوم 15 من الشهر القادم (كما في المثال: «جلسة يوم 15 نوفمبر وحضور العميل مطلوب»)
    const nm = p.month === 12 ? 1 : p.month + 1;
    const ny = p.month === 12 ? p.year + 1 : p.year;
    app.matters.addEvent(m2.id, { kind: 'hearing', title: 'جلسة نظر جنحة التبديد', starts_at: cairoLocalToIso(ny, nm, 15, 9, 30), location: 'محكمة جنح مدينة نصر', client_attendance_required: true, notes: 'يلزم حضور المستفيد/ة شخصيًا.' }, U.hany);
    app.matters.addTask(m2.id, { title: 'تقديم حافظة مستندات تثبت الطبيعة التجارية للتعامل', due_at: addDays(nowIsoStr, 2), procedural: true }, U.hany);
    const inv = db.get('SELECT id FROM invoices WHERE matter_id = ?', m1.id);
    db.update('invoices', inv.id, { due_at: addDays(nowIsoStr, -9) });

    // ================= المحاسبة =================
    const prev = p.month === 1 ? `${p.year - 1}-12` : `${p.year}-${String(p.month - 1).padStart(2, '0')}`;
    app.accounting.closeMonth(prev, admin);
    const ahmedPaid = db.all("SELECT id FROM ledger_entries WHERE lawyer_id = ? AND status = 'accrued' AND period < ?", U.ahmed.id, `${p.year}-${String(p.month).padStart(2, '0')}`).map((x) => x.id);
    if (ahmedPaid.length) app.accounting.payout({ lawyer_id: U.ahmed.id, entry_ids: ahmedPaid, method: 'تحويل بنكي', reference: 'TRX-2041' }, admin);

    // ================= الإنفاق الإعلاني (لحساب تكلفة اكتساب الملف) =================
    const curPeriod = `${p.year}-${String(p.month).padStart(2, '0')}`;
    for (const [period, source, campaign, amount] of [
      [prev, 'facebook_ad', 'هل لك حق في ميراث؟ استشارة قانونية من بيوت مصر', 4200],
      [prev, 'facebook_ad', 'نفقة الأطفال حق — اسأل محامي مجانًا', 2600],
      [prev, 'instagram_ad', 'حقك في ميراث جدك — اعرف إزاي', 1800],
      [prev, 'google', 'egypt-legal-search', 2400],
      [curPeriod, 'facebook_ad', 'هل لك حق في ميراث؟ استشارة قانونية من بيوت مصر', 1500],
      [curPeriod, 'instagram_ad', 'نفقة الأطفال حق — اسألي محامية مجانًا', 900],
    ]) {
      app.analytics.saveSpend({ period, source, campaign, amount }, admin);
    }

    // ================= بيانات تجريبية لوحدات الإصدار 9 (كل وحدة تضيف كتلتها تحت علامتها فقط) =================
    // <seed:platform>
    // صحة النظام: النسخة الاحتياطية التجريبية تُنشأ في src/bootstrap.js بعد اكتمال كل البيانات التجريبية
    // (app.system.demoBackup) حتى تطابق اللقطة ما يراه المستخدم إذا نزّلها أو استعادها.
    // <seed:accounts>
    // الحسابات والأمان: دعوة سارية لمحامية متطوعة وأخرى منتهية، مسؤولة امتثال بتحقق بخطوتين، جلسات، وسجل أمان (src/services/accounts-seed.js)
    await (await import('./services/accounts-seed.js')).seedAccountsDemo(app, { at, adv, user });
    // <seed:messaging>
    // الردود الجاهزة، قوالب واتساب المعتمدة وربطها، واستبيانات رضا مُجابة عن ملفات أُرسل فيها الرد (src/services/messaging-seed.js)
    await (await import('./services/messaging-seed.js')).seedMessagingDemo(app, {
      setTime: (iso) => {
        T = Math.min(Date.parse(iso), realNow - 60 * 1000);
        tick();
      },
      at,
      admin,
      manager,
    });
    // <seed:practice>
    // بطاقات المستفيدين، أطراف الملفات وتعارض المصالح (ومنه تنبيه حقيقي: خصم مسجل مستفيدًا لدى المؤسسة)،
    // الأثر المتحقق للملفات المغلقة، وطلب من الموقع لأرملة مع بيانات أسرتها (غير موثّقة).
    {
      const savedT = T;
      const P = app.practice;
      const yr = cairoParts(new Date(realNow)).year;
      const clientByName = (name) => db.get('SELECT id FROM clients WHERE name = ? AND merged_into IS NULL ORDER BY id LIMIT 1', name);
      const caseOf = (clientName) => db.get('SELECT c.* FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.name = ? ORDER BY c.id LIMIT 1', clientName);
      const ben = (name, data, { verify = false, daysAgo = 3 } = {}) => {
        const c = clientByName(name);
        if (!c) return null;
        at(daysAgo, 12);
        P.beneficiary.save(c.id, { ...data, verify }, manager);
        return c.id;
      };
      ben('سامية محمود عبد الحميد', {
        relation: 'widow', children: [{ birth_year: yr - 17, gender: 'f' }, { birth_year: yr - 13, gender: 'm' }], monthly_income_band: '2000_4000', housing: 'rented_old',
        employment: 'irregular', foundation_file_number: 'BM-2023-0418', is_foundation_beneficiary: true,
        notes: 'أرملة منذ 2021، ابنتها في برنامج «نجاح» التعليمي. تعمل خياطة من المنزل بدخل غير منتظم.',
      }, { verify: true, daysAgo: 5 });
      ben('نهى سمير عبد الفتاح', {
        relation: 'divorced', children: [{ birth_year: yr - 7, gender: 'm' }, { birth_year: yr - 5, gender: 'm' }], monthly_income_band: 'lt_2000', housing: 'family',
        employment: 'irregular', notes: 'مقيمة مع أسرتها بعد الطلاق، والمطلق متوقف عن النفقة منذ أربعة أشهر.',
      }, { verify: true, daysAgo: 80 });
      ben('هبة ناصر', { relation: 'divorced', children: [{ birth_year: yr - 4, gender: 'f' }], monthly_income_band: 'none', housing: 'rented_old', employment: 'none' }, { daysAgo: 8 });
      ben('أم يوسف', { relation: 'divorced', children: [{ birth_year: yr - 9, gender: 'm' }, { birth_year: yr - 6, gender: 'f' }, { birth_year: yr - 2, gender: 'f' }], monthly_income_band: 'lt_2000', housing: 'rented_new', employment: 'none', notes: 'بيانات من مكالمة هاتفية — تحتاج زيارة بحث اجتماعي.' }, { daysAgo: 0 });
      ben('فاطمة إبراهيم السيد', { relation: 'wife', children_count: 2, monthly_income_band: '4000_7000', housing: 'owned', employment: 'employed' }, { verify: true, daysAgo: 115 });
      ben('منى محمود حسن', { relation: 'other', children_count: 0, monthly_income_band: '2000_4000', housing: 'family', employment: 'employed', notes: 'ابنة المتوفى؛ والدتها الأرملة شريكة في التركة.' }, { daysAgo: 95 });
      ben('عزة مصطفى', { relation: 'other', children_count: 0, monthly_income_band: 'lt_2000', housing: 'rented_old', employment: 'pension', has_disability: true, notes: 'تتقاضى معاش والدها، ولديها مرض مزمن.' }, { verify: true, daysAgo: 44 });
      ben('مروة جمال', { relation: 'wife', children: [{ birth_year: yr - 3, gender: 'm' }], monthly_income_band: 'none', housing: 'family', employment: 'none' }, { daysAgo: 20 });

      // خصم في ملف الميراث الرئيسي سبق تسجيله مستفيدًا من برنامج «نماء» (بصيغة كتابة مختلفة للاسم) ← تنبيه تعارض مصالح
      at(30, 11);
      const hasan = app.clients.create({ name: 'حسن محمود عبدالحميد', governorate: 'القاهرة', notes: 'مستورد من سجلات برنامج «نماء» (زكاة المال).' });
      app.clients.addIdentity(hasan.id, 'phone', '01288334455');
      db.insert('beneficiary_profiles', {
        client_id: hasan.id, relation: 'other', children_count: 3, children: '[]', monthly_income_band: '2000_4000', housing: 'rented_new', employment: 'irregular',
        has_disability: 0, foundation_file_number: 'BM-2021-0233', is_foundation_beneficiary: 1, data_source: 'import', updated_by: admin.id,
        created_at: new Date(T).toISOString(), updated_at: new Date(T).toISOString(),
      });
      app.activity.log({ client_id: hasan.id, actor: admin, type: 'client.imported', summary: `أُضيف العميل ${hasan.code} من ملف استيراد مع بطاقة المستفيد` });
      const main = db.get("SELECT * FROM cases WHERE code LIKE 'INH-%-00482'");
      if (main) {
        at(4, 13);
        P.parties.add({ caseId: main.id }, { role: 'opponent', name: 'حسن محمود عبد الحميد', notes: 'الأخ الأكبر — واضع يده على المحل ويرفض القسمة.' }, manager);
        adv(0.2);
        P.parties.add({ caseId: main.id }, { role: 'related', name: 'نادية فتحي السيد', notes: 'أرملة الابن المتوفى والوصية على القاصرين بقرار محكمة الأسرة (2023).' }, manager);
      }
      // الملفات المستمرة: أسماء الخصوم الحقيقية بدل الوصف العام، وشاهد هو عميل سابق (يحتاج مراجعة)
      at(3, 10);
      app.matters.update(m1.id, { opponent: 'أيمن فاروق عبد الله' }, manager);
      app.matters.update(m2.id, { opponent: 'مصطفى كامل الشريف' }, manager);
      adv(0.5);
      P.parties.add({ matterId: m2.id }, { role: 'witness', name: 'سيد عبد الفتاح', notes: 'زميل سابق شهد تسليم البضاعة.' }, manager);

      // الأثر المتحقق للملفات المغلقة (لتقرير الأثر)
      const value = (clientName, v) => {
        const c = caseOf(clientName);
        if (!c || c.status !== 'closed') return;
        T = Math.min(Date.parse(c.closed_at) + 2 * HOUR, realNow - 30 * 60 * 1000);
        tick();
        P.outcome.save('case', c.id, P.outcome.parse(v), manager);
      };
      value('فاطمة إبراهيم السيد', { outcome_kind: 'inheritance_share', recovered_one_time: 285000, notes: 'قسمة رضائية للشقة بعد الاستشارة: بيعت ووُزع الثمن بالأنصبة الشرعية (نصيب العميلة الربع).' });
      value('منى محمود حسن', { outcome_kind: 'document_issued', notes: 'صدر إعلام الوراثة متضمنًا الزوجة والبنات والإخوة الأشقاء.' });
      value('خالد عبد الرحيم', { outcome_kind: 'inheritance_share', recovered_one_time: 120000, notes: 'ثبتت الوصية الواجبة للأحفاد الثلاثة في إعلام الوراثة.' });
      value('سيد عبد الفتاح', { outcome_kind: 'settlement', recovered_one_time: 42000, notes: 'تسوية ودية بمكتب العمل شملت الأجر المتأخر ومقابل الإجازات، وإلزام صاحب العمل بالتأمين عن المدة الفعلية.' });
      value('عزة مصطفى', { outcome_kind: 'other', recovered_monthly: 2500, notes: 'امتد عقد الإيجار القديم للابنة المقيمة؛ القيمة الشهرية = الفرق التقديري عن الإيجار السوقي الذي تجنبته الأسرة.' });
      value('حسام الدين يوسف', { outcome_kind: 'advice_only' });
      value('شريف عادل', { outcome_kind: 'advice_only' });

      // طلب من الموقع لأرملة مع بيانات أسرتها (يذكرها مقدم الطلب) ← بطاقة «غير موثّقة» بانتظار تحقق الإدارة
      at(0, 9, 5);
      const w = web(
        '01068443322',
        'وفاء عبد الستار',
        'المنيا',
        'زوجي الله يرحمه توفى من 8 شهور وكان شغال في شركة خاصة ومأمن عليه، ولحد دلوقتي معرفتش أصرف المعاش ليا وللعيال. التأمينات بتطلب ورق كتير ومش فاهمة أعمل إيه، ومعايا 3 عيال في المدارس.',
        { utm_source: 'facebook', utm_medium: 'social', referrer: 'https://www.facebook.com/' },
        { area: 'LAB' },
      );
      P.beneficiary.savePublic(w.intake, w.client, P.beneficiary.validatePublic({ relation: 'widow', children_count: 3, monthly_income_band: 'none', housing: 'rented_new', foundation_file_number: 'BM-2022-0087' }), { createdClient: !!w.created_client });
      // نموذج الموقع برقم سامية (غير موثّق): البيانات تبقى مقترحة على الطلب ولا تمس بطاقة صاحبة الرقم
      const i7row = db.get("SELECT id FROM intakes WHERE contact_name = 'هبة' AND first_channel = 'website' ORDER BY id DESC LIMIT 1");
      if (i7row) {
        const ir = db.get('SELECT * FROM intakes WHERE id = ?', i7row.id);
        P.beneficiary.savePublic(ir, app.clients.get(ir.client_id), P.beneficiary.validatePublic({ relation: 'other', children_count: 1, monthly_income_band: 'lt_2000', housing: 'family' }), { createdClient: false });
      }
      T = savedT;
      tick();
    }
    // <seed:ai>
    // الذكاء الاصطناعي: مجالا المؤسسة الجديدان في صندوق الوارد (معاش أرملة، أموال قاصرين تحت إشراف النيابة الحسبية)،
    // تصنيف مبدئي لمستندات الملف الرئيسي، ورد مقترح لطلب المستندات استخدمته مديرة الحالات.
    {
      at(1, 11, 5);
      const penIntake = wa('01093216540', 'أم مريم', 'السلام عليكم، جوزي الله يرحمه اتوفى من 3 شهور وكان شغال في شركة خاصة ومتأمن عليه، وعندي بنتين في ابتدائي. رحت مكتب التأمينات قالولي محتاجين إعلام وراثة. أعمل إيه عشان أصرف معاشه؟', { referral: fbAd('حقك في معاش زوجك — اسألي بيوت مصر') });
      await app.ai.analyzeIntake(penIntake.intake.id);
      adv(2.5);
      const grdIntake = web('01284460931', 'نجلاء عبد الفتاح', 'الجيزة', 'زوجي توفي من سنة وترك لأولادي الثلاثة (9 و12 و15 سنة) نصيبًا في شقة ومبلغًا في البنك. البنك يقول إن الفلوس تحت إشراف النيابة الحسبية ولا أستطيع الصرف منها لمصاريف المدارس، وجد الأولاد يريد أن يكون هو الوصي. ما الإجراءات؟', { utm_source: 'facebook', utm_medium: 'social' });
      await app.ai.analyzeIntake(grdIntake.intake.id);
      at(0, 9, 10);
      for (const d of [deathDoc, flatDoc]) if (d) await app.ai.analyzeDocument(d.id, manager);
      adv(0.4);
      const suggested = await app.ai.suggestReply({ case_id: nCase.id, intent: 'ask_documents' }, manager);
      if (suggested.suggestions[0]) app.ai.replyFeedback(suggested.id, { index: 0, action: 'sent', final_text: suggested.suggestions[0].text }, manager);
    }
    // <seed:programs>
    // البرامج ومصادر التمويل: منحة (أسرة وميراث)، زكاة «نماء» (الغارمون والأسر المستحقة)، شراكة مسؤولية مجتمعية (عمل ومعاشات)،
    // وبرنامج مخطط للعام القادم. تواريخ نسبية حتى يبقى السيناريو متسقًا أيًا كان تاريخ التشغيل.
    {
      const nowParts = cairoParts(new Date(realNow));
      const monthStart = (offset) => {
        const d = new Date(Date.UTC(nowParts.year, nowParts.month - 1 + offset, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
      };
      const monthEnd = (offset) => {
        const d = new Date(Date.UTC(nowParts.year, nowParts.month + offset, 0));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };
      const caseOf = (clientName) => db.value('SELECT c.id FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.name = ? ORDER BY c.id LIMIT 1', clientName);
      const link = (clientName, prg) => {
        const cid = caseOf(clientName);
        if (cid) app.programs.linkCase(cid, prg.id, manager, { confirm: true });
        return cid;
      };

      at(150, 9);
      const prgFamily = app.programs.create(
        {
          name: 'الدعم القانوني للأرامل والأيتام في قضايا الأسرة والميراث',
          funder_name: 'شريك تنموي — منحة مقيدة لدعم الأسر الأولى بالرعاية',
          funder_type: 'grant',
          agreement_ref: `GR-${nowParts.year}/014`,
          funder_contact: 'مسؤولة المنح لدى الشريك — يُراسَل عبر البريد الرسمي للمؤسسة',
          description: 'تمويل الاستشارات والتمثيل القضائي للأرامل والأيتام في دعاوى النفقة والحضانة والميراث والولاية على المال بمحافظات القاهرة الكبرى.',
          restrictions: 'تُصرف المنحة على أتعاب المحامين ومصروفات التقاضي فقط، ولا تشمل المصروفات الإدارية للمؤسسة. يُقدَّم تقرير ربع سنوي بعدد الأسر المستفيدة والنتائج دون أي بيانات شخصية.',
          start_date: monthStart(-5),
          end_date: monthEnd(6),
          budget: 25000,
          eligible_governorates: ['القاهرة', 'الجيزة', 'القليوبية'],
          eligible_areas: ['FAM', 'INH'],
        },
        admin,
      ).program;
      at(125, 11);
      const prgZakat = app.programs.create(
        {
          name: 'نماء — زكاة المال للتمثيل القضائي للغارمين والأسر المستحقة',
          funder_name: 'صندوق نماء للزكاة — مؤسسة بيوت مصر',
          funder_type: 'zakat',
          agreement_ref: `NAMAA-${nowParts.year}-LEGAL`,
          description: 'مخصص من أموال الزكاة لتغطية مصروفات التقاضي وأتعاب الحضور للأسر المستحقة والغارمين المهددين بالحبس أو الطرد.',
          restrictions: 'أموال زكاة: تُصرف في مصارفها الشرعية فقط (الفقراء والمساكين والغارمون) بعد بحث اجتماعي يثبت الاستحقاق، ولا يجوز صرفها على أجور العاملين الإداريين أو التسويق.',
          start_date: monthStart(-4),
          end_date: monthEnd(2),
          budget: 4000,
        },
        admin,
      ).program;
      at(120, 12);
      const prgCsr = app.programs.create(
        {
          name: 'شراكة المسؤولية المجتمعية — حقوق العمل والمعاشات',
          funder_name: 'مجموعة صناعية خاصة (برنامج المسؤولية المجتمعية)',
          funder_type: 'csr',
          agreement_ref: `CSR-${nowParts.year}-07`,
          description: 'دعم الاستشارات العمالية ومطالبات المعاشات والتأمينات للأرامل وأبناء العمال المتوفين.',
          restrictions: 'لا يُذكر اسم الشريك علنًا إلا بموافقته، ولا يُستخدم التمويل في نزاعات ضد الشركات التابعة له.',
          start_date: monthStart(-4),
          end_date: monthEnd(5),
          budget: 6000,
          eligible_areas: ['LAB', 'ADM'],
        },
        admin,
      ).program;
      app.programs.create(
        {
          name: 'الولاية على المال وحماية أنصبة القُصَّر في التركات',
          funder_name: 'موارد ذاتية — فائض حملة رمضان',
          funder_type: 'internal',
          description: 'برنامج مخطط لمتابعة طلبات الولاية على المال أمام نيابة شؤون الأسرة وحماية أنصبة الأيتام في التركات.',
          start_date: monthStart(3),
          end_date: monthEnd(14),
          budget: 30000,
          status: 'planned',
          eligible_areas: ['INH', 'FAM'],
        },
        admin,
      );

      // ربط الملفات بالبرامج (كل ملف ببرنامج واحد على الأكثر)
      T = realNow - 30 * 60 * 1000;
      tick();
      for (const n of ['فاطمة إبراهيم السيد', 'منى محمود حسن', 'نهى سمير عبد الفتاح', 'هبة ناصر', 'سامية محمود عبد الحميد']) link(n, prgFamily);
      for (const n of ['رامي فوزي', 'عزة مصطفى']) link(n, prgZakat);
      const sayedCase = link('سيد عبد الفتاح', prgCsr);
      link('أشرف عبد الحكيم', prgCsr);
      link('عبد الله حمدي', prgCsr);

      // الإنفاق الفعلي على مدى الأشهر: مصروفات دفعتها المؤسسة وأتعاب مباشرة على ملفات البرامج
      at(70, 12);
      app.matters.addExpense(m1.id, { description: 'رسوم إعلان صحيفة دعوى النفقة', amount: 120, paid_by: 'organization' }, manager);
      at(41, 13);
      app.matters.addExpense(m1.id, { description: 'أمانة خبير حسابات لتقدير دخل المطلق', amount: 750, paid_by: 'organization' }, manager);
      at(30, 10);
      app.accounting.addAdjustment({ kind: 'matter_fee', matter_id: m1.id, lawyer_id: U.rania.id, amount: 1500, description: 'أتعاب مباشرة دعوى النفقة — المرحلة الأولى' }, admin);
      at(3, 11);
      app.accounting.addAdjustment({ case_id: nCase.id, lawyer_id: U.ahmed.id, amount: 1200, description: 'أتعاب إضافية: حضور جلسة نيابة شؤون الأسرة لإثبات حقوق القاصرين' }, admin);

      at(36, 12);
      app.matters.addExpense(m2.id, { description: 'رسوم استخراج صور رسمية من محضر التبديد', amount: 180, paid_by: 'organization' }, manager);
      at(30, 10);
      const zInv = app.matters.addInvoice(m2.id, { description: 'رسوم إدارية رمزية — ملف الجنحة', amount: 200, due_at: addDays(new Date(T).toISOString(), 14) }, manager);
      at(28, 13);
      app.matters.addPayment(zInv.id, { amount: 200, method: 'نقدًا بمقر المؤسسة' }, manager);
      at(21, 11);
      app.accounting.addAdjustment({ kind: 'matter_fee', matter_id: m2.id, lawyer_id: U.hany.id, amount: 2500, description: 'أتعاب حضور جلسات الجنحة (خارج الاتفاق الشهري)' }, admin);
      at(8, 12);
      app.matters.addExpense(m2.id, { description: 'رسوم إعلان شاهد النفي', amount: 220, paid_by: 'organization' }, manager);
      at(2, 10);
      app.matters.addExpense(m2.id, { description: 'مستخرجات السجل التجاري لإثبات طبيعة التعامل', amount: 450, paid_by: 'organization' }, manager);

      at(50, 12);
      if (sayedCase) app.accounting.addAdjustment({ case_id: sayedCase, lawyer_id: U.yasmine.id, amount: 400, description: 'بدل انتقال لمكتب العمل بالزقازيق' }, admin);
      at(1, 16);
      if (lc) app.accounting.addAdjustment({ case_id: lc.id, lawyer_id: U.yasmine.id, amount: 900, description: 'صياغة إنذار رسمي لصاحب العمل بصرف الأجور المتأخرة' }, admin);

      // فحص الميزانيات الآن: برنامج «نماء» تجاوز 80% فيصل تنبيه للإدارة (مرة واحدة)
      T = realNow - 10 * 60 * 1000;
      tick();
      app.programs.checkBudget();
    }

    // <seed:v91-l-court> جلسة سابقة بنتيجة «تأجّلت» وجلسة اليوم بلا نتيجة في ملف الجنحة، وموعد الصرف المعتاد
    seedCourtDemo(app, { matterId: m2.id, lawyer: U.hany, manager, realNow, setNow: (ms) => { T = Math.min(ms, realNow - 60 * 1000); tick(); } });

    // <seed:v91-b-forms> طلبان من نموذج الموقع الجديد برسالة صوتية (وصورة ورقة)، كما ترسلهما أغلب المستفيدات
    seedFormsDemo(app, { at });

    // <seed:v91-b-site> طلب من الموقع تأكد رقمه بنقرة واحدة على واتساب، وطلب رقمه غير مؤكد (صفحة المتابعة فقط)
    seedSiteDemo(app, { at, manager });

    // <seed:v91-l-home> هاني مشترك في تنبيهات واتساب، وإسناد جديد له (محامٍ مشارك) في ملف الميراث الرئيسي يُسلَّم بعد يومين
    seedHomeDemo(app, { lawyer: U.hany, manager, caseId: nCase.id, realNow, setNow: (ms) => { T = Math.min(ms, realNow - 60 * 1000); tick(); } });

    // <seed:v91-l-work> أعادت الإدارة رأي رانيا (النفقة ومسكن الحضانة) بثلاث ملاحظات، ونسخة العمل عالجت الأولى
    seedWorkDemo(app, { lawyer: U.rania, manager, assignmentId: fLead.id, inhCaseId: nCase.id, inhLeadId: lead.id, realNow, setNow: (ms) => { T = Math.min(ms, realNow - 60 * 1000); tick(); } });

    // <seed:v91-b-portal> رد نهى بخلاصة وخطوات، «هاتي معاكي» لجلستها، طلب ورق ببندين لسامية، وتعليمات الدفع
    seedPortalDemo(app, { manager });

    // ================= تشغيل الأتمتة على الوضع الحالي =================
    T = realNow;
    tick();
    for (const r of db.all("SELECT i.id FROM intakes i WHERE NOT EXISTS (SELECT 1 FROM ai_suggestions s WHERE s.entity_type = 'intake' AND s.entity_id = i.id)")) {
      await app.ai.analyzeIntake(r.id);
    }
    app.automations.runAll();
  } finally {
    setClock(null);
    app.ai.cancelTimers();
  }
  // الإشعارات القديمة تُعد مقروءة حتى تبقى الحديثة واضحة في العرض
  db.run('UPDATE notifications SET read_at = created_at WHERE created_at < ?', new Date(realNow - 2 * 24 * HOUR).toISOString());
}
