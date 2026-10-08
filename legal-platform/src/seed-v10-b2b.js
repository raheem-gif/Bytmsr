// الإصدار 10 — بيانات العرض لخدمة الشركات (B10 §18 مع L-38 وCO-27). تمر كلها بالخدمات الحقيقية (إنشاء الشركة،
// الدعوات وقبولها، الاشتراكات) فتظهر للإدارة وللبوابة كما تظهر البيانات الحقيقية. أسماء خيالية ونطاق .example المحجوز.
// كلمة مرور كل مستخدمي الشركات: Company@2026.
//
// المرحلة 1 (SRV-3): الباقات الثلاث، شركة النيل للأغذية (NFD، Growth، نشطة، مدير العلاقة manager، الاشتراك من يوم 5 في شهر
// سابق فلا تطابق دورة الاستخدام الشهر الميلادي)، وتك سوليوشنز (TSL، Starter، فترة تجريبية تنتهي بعد 10 أيام، مدير العلاقة admin)،
// والكيانات والمستخدمون: مريم (مديرة البوابة + جهة الفواتير)، حسام (عضو)، دينا (اطلاع فقط)، شريف حمدي (مدير البوابة)، عمر (عضو).
// المرحلة 2 (SRV-15، بعد حراس الأفراد SRV-14): طلبات NFD-0001…0006 وTSL-0001…0003 بمحامي L-38 (طارق، ياسمين، عمرو)،
// والذاكرة القانونية والأطراف، وتكلفة إضافية في الدورة السابقة. تعمل فقط في العرض الكامل (حين يوجد المحامون)، مرة واحدة.
import { cairoParts, cairoLocalToIso, cairoDayKey } from './util.js';
import { usageCycle } from '../public/assets/js/lib/company-sla.js';

export const COMPANY_DEMO_PASSWORD = 'Company@2026';

/** الشروط الافتراضية لباقات العرض (أسعار خيالية؛ قرار مفتوح O-3) — ساعات العمل على يوم من 6 ساعات (10–4) */
export const DEMO_PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    description: 'للشركات الصغيرة: خمسة طلبات شهريًا ورد خلال يوم عمل.',
    terms: {
      tier: 'starter',
      billing_period: 'monthly',
      price_minor: 1500000,
      included_requests: 5,
      urgent_per_month: 1,
      max_entities: 1,
      max_users: 3,
      overage_policy: 'approve',
      overage_price_minor: 300000,
      contract_value_cap_minor: 100000000,
      scope_types: ['contract_review', 'contract_drafting', 'nda', 'employment', 'marketing_review', 'legal_notice', 'supplier_issue', 'compliance_question', 'renewal_followup', 'other'],
      excluded_work: ['litigation', 'arbitration', 'mna', 'criminal', 'debt_collection', 'due_diligence'],
      sla: {
        urgent: { first_response_hours: 2, delivery_hours: 8, clock: 'calendar' },
        high: { first_response_hours: 4, delivery_hours: 18, clock: 'business' },
        normal: { first_response_hours: 6, delivery_hours: 24, clock: 'business' },
        low: { first_response_hours: 12, delivery_hours: 36, clock: 'business' },
      },
      size_factor: { S: 0.5, M: 1, L: 2 },
      senior_review: 'never',
      revision_rounds: 1,
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'للشركات المتوسطة: 15 طلبًا شهريًا، ثلاثة كيانات، ومراجعة ثانية للطلبات عالية المخاطر.',
    terms: {
      tier: 'growth',
      billing_period: 'monthly',
      price_minor: 3500000,
      included_requests: 15,
      urgent_per_month: 3,
      max_entities: 3,
      max_users: 10,
      overage_policy: 'approve',
      overage_price_minor: 250000,
      contract_value_cap_minor: null,
      scope_types: ['contract_review', 'contract_drafting', 'nda', 'employment', 'marketing_review', 'legal_notice', 'board_resolution', 'supplier_issue', 'compliance_question', 'renewal_followup', 'dispute', 'other'],
      excluded_work: ['litigation', 'arbitration', 'mna', 'criminal', 'debt_collection', 'due_diligence'],
      sla: {
        urgent: { first_response_hours: 2, delivery_hours: 8, clock: 'calendar' },
        high: { first_response_hours: 3, delivery_hours: 12, clock: 'business' },
        normal: { first_response_hours: 6, delivery_hours: 18, clock: 'business' },
        low: { first_response_hours: 12, delivery_hours: 30, clock: 'business' },
      },
      size_factor: { S: 0.5, M: 1, L: 2 },
      senior_review: 'high_risk',
      revision_rounds: 2,
    },
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'للمجموعات: 40 طلبًا شهريًا، طلبات عاجلة بلا حد، ومراجعة ثانية لكل طلب.',
    terms: {
      tier: 'enterprise',
      billing_period: 'monthly',
      price_minor: 8000000,
      included_requests: 40,
      urgent_per_month: null,
      max_entities: 10,
      max_users: null,
      overage_policy: 'bill',
      overage_price_minor: 200000,
      contract_value_cap_minor: null,
      scope_types: ['contract_review', 'contract_drafting', 'nda', 'employment', 'marketing_review', 'legal_notice', 'board_resolution', 'supplier_issue', 'compliance_question', 'renewal_followup', 'dispute', 'other'],
      excluded_work: ['litigation', 'arbitration', 'mna', 'criminal'],
      sla: {
        urgent: { first_response_hours: 1, delivery_hours: 6, clock: 'calendar' },
        high: { first_response_hours: 3, delivery_hours: 12, clock: 'business' },
        normal: { first_response_hours: 6, delivery_hours: 18, clock: 'business' },
        low: { first_response_hours: 12, delivery_hours: 24, clock: 'business' },
      },
      size_factor: { S: 0.5, M: 1, L: 2 },
      senior_review: 'always',
      revision_rounds: 3,
    },
  },
];

/** سياق طلب بسيط للخدمات (عنوان IP ومتصفح للسجل، ولا كعكات تُرسل لأحد) */
function seedCtx() {
  return { ip: '127.0.0.1', req: { headers: { 'user-agent': 'seed (demo data)', host: 'localhost' } }, res: { setHeader() {}, getHeader() {} }, cookies: {}, body: {}, query: {} };
}

/** PDF صغير صالح بلا بيانات كاتب (Author) — ملفات العرض لا تحمل أسماء */
function tinyPdf(label) {
  const text = String(label).replace(/[^\x20-\x7e]/g, '').replace(/[()\\]/g, '') || 'Document';
  const stream = `BT /F1 16 Tf 72 720 Td (${text}) Tj ET`;
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
const PDF = 'application/pdf';
/** ملف PDF للإدارة (base64 بنمط مسارات الإدارة) */
const staffPdf = (filename, title, latin) => ({ filename, name: filename, mime: PDF, title, data_base64: tinyPdf(latin) });

/**
 * @param {object} app
 * @param {{ at?: (daysAgo:number, hour?:number, minute?:number) => void, realNow?: number, setNow?: (ms:number) => void, extra?: boolean, requests?: boolean }} opts
 *   requests: المرحلة 2 (الطلبات والذاكرة والتكاليف) — تعمل فقط حين يوجد المحامون طارق وياسمين وعمرو (العرض التجريبي الكامل).
 *   extra: شركة ثالثة بطلبات مغلقة ومفتوحة لاختبار ثبات تقارير الأفراد (B10 §17.5) — تُضاف وحدها إن وُجدت الشركتان.
 */
export async function seedB2bDemo(app, { at = null, realNow = Date.now(), setNow = null, extra = false, requests = true } = {}) {
  const { db } = app;
  const user = (username) => db.get('SELECT * FROM users WHERE username = ?', username);
  const admin = user('admin');
  const manager = user('manager') || admin;
  if (!admin) return null;
  const when = (daysAgo, hour = 10, minute = 0) => {
    if (at) at(daysAgo, hour, minute);
  };
  const ctx = seedCtx();
  const userByEmail = (email) => db.get('SELECT * FROM company_users WHERE email = ?', email);

  /** قبول دعوة مستخدم بكلمة المرور الموحدة عبر خدمة الدعوات نفسها */
  function activate(uid) {
    const tok = app.companyAuth.issueToken('invite', uid, { kind: 'seed' });
    const c = seedCtx();
    const cu = db.get('SELECT * FROM company_users WHERE id = ?', uid);
    app.companyAuth.acceptInvite(c, { token: tok.token, name: cu.name, password: COMPANY_DEMO_PASSWORD, password_confirm: COMPANY_DEMO_PASSWORD, accept_terms: true });
    app.companyAuth.revokeUserSessions(uid);
    return db.get('SELECT * FROM company_users WHERE id = ?', uid);
  }
  function invite(companyId, by, body) {
    const r = app.companies.inviteUser(companyId, body, { cu: by, ctx });
    return r.user.id;
  }

  // ── الباقات ──
  const plans = {};
  const havePlans = DEMO_PLANS.every((p) => db.get('SELECT 1 FROM company_plans WHERE key = ?', p.key));
  if (!havePlans) when(80, 9);
  for (const p of DEMO_PLANS) {
    const existing = db.get('SELECT id FROM company_plans WHERE key = ?', p.key);
    plans[p.key] = existing ? existing.id : app.companyBilling.createPlan(p, admin, ctx).id;
  }

  // ── المرحلة 1: الشركتان ومستخدموهما (مرة واحدة) ──
  let nfd = db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
  let tsl = db.get("SELECT * FROM companies WHERE prefix = 'TSL'");
  const p = cairoParts(new Date(realNow));
  const startMonth = p.month - 2 <= 0 ? p.month + 10 : p.month - 2;
  const startYear = p.month - 2 <= 0 ? p.year - 1 : p.year;
  const nfdStartsOn = `${startYear}-${String(startMonth).padStart(2, '0')}-05`;
  const nfdDaysAgo = Math.max(1, Math.round((realNow - Date.parse(cairoLocalToIso(startYear, startMonth, 5, 10, 0))) / 86400000));
  if (!nfd) {
    // شركة النيل للأغذية (Growth، نشطة) — الاشتراك من يوم 5 في شهر سابق فلا تطابق دورة الاستخدام الشهر الميلادي
    when(nfdDaysAgo, 10);
    nfd = app.companies.create(
      {
        name: 'شركة النيل للأغذية',
        legal_name: 'شركة النيل للأغذية ش.م.م',
        prefix: 'NFD',
        industry: 'تصنيع وتوزيع المواد الغذائية',
        size_band: '51-200',
        commercial_registry: '118432',
        tax_id: '512-884-301',
        address: '12 شارع المنطقة الصناعية الثانية، مدينة السادس من أكتوبر، الجيزة',
        status: 'active',
        account_manager_id: manager.id,
        plan_id: plans.growth,
        starts_on: nfdStartsOn,
        entity: { name: 'النيل للأغذية ش.م.م', legal_form: 'llc' },
        first_admin: { name: 'مريم عادل', email: 'mariam@nilefoods.example', job_title: 'مديرة الموارد البشرية والشؤون الإدارية', billing_contact: true },
      },
      admin,
      ctx,
    ).company;
    const mariam = activate(userByEmail('mariam@nilefoods.example').id);
    app.companies.createEntity(nfd.id, { name: 'النيل للتوزيع ش.م.م', legal_form: 'llc', relation: 'subsidiary', commercial_registry: '120977', jurisdiction: 'القاهرة' }, { cu: mariam, ctx });
    when(nfdDaysAgo - 1, 11);
    activate(invite(nfd.id, mariam, { name: 'حسام الدين فوزي', email: 'hossam@nilefoods.example', role: 'member', job_title: 'مدير المشتريات' }));
    activate(invite(nfd.id, mariam, { name: 'دينا سمير', email: 'dina@nilefoods.example', role: 'viewer', job_title: 'محاسبة' }));
  }
  if (!tsl) {
    // تك سوليوشنز (Starter، فترة تجريبية 30 يومًا بدأت قبل 20 يومًا فتنتهي بعد 10 أيام)
    when(20, 12);
    tsl = app.companies.create(
      {
        name: 'تك سوليوشنز',
        legal_name: 'تك سوليوشنز للبرمجيات ش.م.م',
        prefix: 'TSL',
        industry: 'برمجيات وخدمات سحابية',
        size_band: '11-50',
        status: 'trial',
        trial_days: 30,
        account_manager_id: admin.id,
        plan_id: plans.starter,
        entity: { name: 'تك سوليوشنز للبرمجيات ش.م.م', legal_form: 'llc' },
        first_admin: { name: 'شريف حمدي', email: 'sherif@techsol.example', job_title: 'المدير المالي', billing_contact: true },
      },
      admin,
      ctx,
    ).company;
    const sherif = activate(userByEmail('sherif@techsol.example').id);
    when(19, 13);
    activate(invite(tsl.id, sherif, { name: 'عمر خالد', email: 'omar@techsol.example', role: 'member', job_title: 'مدير المنتج' }));
  }

  // ── المرحلة 2 (SRV-15): الطلبات والذاكرة والتكاليف بمسار الخدمات الحقيقي ──
  const lawyersReady = ['tarek', 'yasmine', 'amr'].every((u) => user(u));
  if (requests && lawyersReady && !db.get('SELECT 1 FROM company_requests WHERE company_id = ?', nfd.id)) {
    await seedStage2(app, { when, realNow, ctx, admin, manager, nfd, tsl, nfdStartsOn });
    // b2b.memory وb2b.sla مرة واحدة بالساعة الحقيقية (تذكيرات الذاكرة وتنبيهات المواعيد تظهر في العرض)
    if (setNow) setNow(realNow);
    app.companyMemory.runReminders();
    app.companyRequests.runSla();
  }

  // ── شركة ثالثة لاختبار ثبات تقارير الأفراد (extra) ──
  let third = db.get("SELECT * FROM companies WHERE prefix = 'UTD'");
  if (extra && !third) {
    when(20, 10);
    third = app.companies.create(
      {
        name: 'المتحدة للتجارة',
        prefix: 'UTD',
        status: 'active',
        account_manager_id: manager.id,
        plan_id: plans.enterprise,
        first_admin: { name: 'هالة منصور', email: 'hala@united.example', job_title: 'المديرة التنفيذية' },
      },
      admin,
      ctx,
    ).company;
    activate(userByEmail('hala@united.example').id);
    if (lawyersReady) await seedExtraRequests(app, { ctx, admin, manager, company: third });
  }

  return { plans, nfd: nfd.id, tsl: tsl.id, third: third?.id ?? null };
}

// ───────────────────────── أدوات المرحلة 2 ─────────────────────────
function helpers(app, ctx) {
  const { db } = app;
  const reqs = app.companyRequests;
  const lawyer = (username) => db.get('SELECT * FROM users WHERE username = ?', username);
  const cu = (email) => db.get('SELECT * FROM company_users WHERE email = ?', email);
  const company = (id) => db.get('SELECT * FROM companies WHERE id = ?', id);
  const rq = (code) => db.get('SELECT * FROM company_requests WHERE code = ?', code);
  const h = {
    lawyer,
    cu,
    rq,
    /** رفع ملف على مراحل من مستخدم الشركة ← معرف الرفع */
    upload(u, name, title, latin) {
      return reqs.stageUpload(u, company(u.company_id), { file: { name, mime: PDF, data_base64: tinyPdf(latin) }, title }).upload_id;
    },
    submit(u, body) {
      return reqs.create(u, company(u.company_id), body, null).request.code;
    },
    accept(code, body, actor) {
      const r = rq(code);
      return reqs.accept(r.id, { rev: r.rev, conflict_ack: true, ...body }, actor, ctx);
    },
    assignment(code, role = 'lead') {
      return db.get("SELECT * FROM assignments WHERE case_id = ? AND role = ? AND status != 'withdrawn' ORDER BY id DESC LIMIT 1", rq(code).case_id, role);
    },
    /** المحامي يفتح الإسناد ويقدم رأيه (وتعتمده الإدارة إن approve) — يعيد معرف الرأي */
    opinion(code, role, username, body, { steps = [], approve = true, approver } = {}) {
      const a = h.assignment(code, role);
      const l = lawyer(username);
      app.visibility.markOpened(a.id, l);
      app.opinions.submit(a.id, l, { body, client_steps: steps, hours_spent: 2 });
      const op = db.get("SELECT * FROM opinions WHERE assignment_id = ? AND status = 'submitted' ORDER BY id DESC LIMIT 1", a.id);
      if (approve) app.opinions.approve(op.id, approver, { quality_score: 5 });
      return op.id;
    },
    /** تسليم نهائي من الرأي المعتمد (التعبئة الحتمية) ثم إرساله بعد مراجعة الملفات */
    deliver(code, opinionId, { title, files = [], actor, risk = 'low' }) {
      const r = rq(code);
      const pf = reqs.prefill(r.id, { opinion_id: opinionId });
      const d = reqs.createDeliverable(r.id, { title, summary: pf.summary, recommendations: pf.recommendations, risk_level: risk, opinion_id: opinionId, files, final: true }, actor).deliverable;
      reqs.releaseDeliverable(d.id, { docs_reviewed: true }, actor, ctx);
      return d.id;
    },
    view(u, code) {
      return reqs.view(u, company(u.company_id), code);
    },
  };
  return h;
}

/**
 * قصة العرض (B10 §18 مع L-38): NFD-0001…0006 وTSL-0001…0003، الذاكرة والأطراف، وتكلفة إضافية في الدورة السابقة.
 * كل خطوة عبر الخدمات الحقيقية (رفع، إرسال، قبول، آراء المحامين، تسليم، اعتماد) وفي وقتها من الماضي.
 */
async function seedStage2(app, { when, realNow, ctx, admin, manager, nfd, tsl, nfdStartsOn }) {
  const { db } = app;
  const h = helpers(app, ctx);
  const reqs = app.companyRequests;
  const mem = app.companyMemory;
  const tarek = h.lawyer('tarek');
  const yasmine = h.lawyer('yasmine');
  const amr = h.lawyer('amr');
  const mariam = h.cu('mariam@nilefoods.example');
  const hossam = h.cu('hossam@nilefoods.example');
  const sherif = h.cu('sherif@techsol.example');
  const omar = h.cu('omar@techsol.example');
  const nfdParent = db.value("SELECT id FROM company_entities WHERE company_id = ? AND relation = 'parent' ORDER BY id LIMIT 1", nfd.id);
  const nfdDist = db.value("SELECT id FROM company_entities WHERE company_id = ? AND relation != 'parent' ORDER BY id LIMIT 1", nfd.id);
  const DAY = 86400000;
  const keyIn = (days) => cairoDayKey(new Date(realNow + days * DAY));

  // محامو الشركات: الاسم بالإنجليزية (L-56) والمهارات وسعر طلبات الشركات
  when(60, 9);
  app.lawyers.update(tarek.id, { name_latin: 'Tarek El-Naggar', skills: ['contracts', 'corporate_governance', 'real_estate'], b2b_rate: 1500 }, admin);
  app.lawyers.update(yasmine.id, { name_latin: 'Yasmine Khalil', skills: ['employment', 'data_protection', 'regulatory'], b2b_rate: 1200 }, admin);
  app.lawyers.update(amr.id, { name_latin: 'Amr El-Shafei', skills: ['disputes', 'real_estate'], b2b_rate: 1300 }, admin);

  // الدورة السابقة لنيل للأغذية (L-28): من بداية الدورة الحالية نعود أيامًا
  const cyc = usageCycle(nfdStartsOn, new Date(realNow));
  const curStartAgo = Math.max(0, Math.round((realNow - Date.parse(`${cyc.start}T10:00:00Z`)) / DAY));
  const P = curStartAgo + 3; // داخل الدورة السابقة

  // ═════ NFD-0001: مراجعة عقد توريد مع شركة الدلتا للتغليف — مكتمل بتقييم 5 وحُفظ العقد في الذاكرة ═════
  when(P + 8, 10, 15);
  const up1 = h.upload(mariam, 'عقد توريد مواد التغليف - شركة الدلتا للتغليف.pdf', 'عقد توريد مواد التغليف — شركة الدلتا للتغليف', 'Supply agreement - Delta Packaging');
  const n1 = h.submit(mariam, {
    type: 'contract_review',
    entity_id: nfdParent,
    description: 'نرجو مراجعة عقد توريد مواد التغليف المقترح من شركة الدلتا للتغليف قبل توقيعه، خاصة بنود المسؤولية والتعويض ومدة التجديد.',
    fields: { counterparty_name: 'شركة الدلتا للتغليف', contract_kind: 'supply', our_role: 'buyer', contract_value: 2400000, currency: 'EGP', governing_law: 'القانون المصري' },
    upload_ids: [up1],
  });
  when(P + 8, 12);
  h.accept(n1, {
    risk_level: 'medium',
    brief_for_lawyer: 'مراجعة عقد توريد مواد تغليف لشركة أغذية (الشركة مشترية). المطلوب: بنود المسؤولية والتعويض، التجديد التلقائي ومهلة الإخطار، وشروط الجودة والتسليم.',
    issues: ['سقف المسؤولية والتعويض', 'التجديد التلقائي ومهلة الإخطار', 'شروط الجودة والتسليم'],
    assign: { lead: { lawyer_id: tarek.id, fee_mode: 'agreement' } },
  }, manager);
  when(P + 7, 11);
  const op1 = h.opinion(n1, 'lead', 'tarek', 'الخلاصة التنفيذية\nالعقد مقبول بعد تعديل بند المسؤولية بحيث لا تتجاوز قيمة العقد، وتقصير مهلة الإخطار بعدم التجديد إلى 60 يومًا.\n\nالتحليل\nالبند 9 يجعل مسؤولية المشتري غير محدودة، والبند 14 يجدد العقد تلقائيًا ما لم يُخطر الطرف الآخر قبل 120 يومًا.\n\nالتوصيات\nتعديل البندين قبل التوقيع.', { steps: ['تعديل بند المسؤولية (البند 9) ليكون بحد أقصى قيمة العقد', 'تقصير مهلة الإخطار بعدم التجديد إلى 60 يومًا', 'التوقيع بعد التعديل'], approver: manager });
  when(P + 6, 11);
  const d1 = h.deliver(n1, op1, { title: 'مراجعة عقد توريد مواد التغليف — شركة الدلتا للتغليف', files: [staffPdf('عقد الدلتا للتغليف - نسخة مراجعة.pdf', 'عقد الدلتا للتغليف — نسخة بالملاحظات', 'Delta Packaging - reviewed')], actor: manager });
  when(P + 6, 15);
  reqs.acceptDeliverable(mariam, nfd, n1, d1, { rating: 5, comment: 'مراجعة واضحة وسريعة.', save_to_memory: true, record_decision: { topic: 'سقف المسؤولية في عقود التوريد', decision: 'لا نقبل مسؤولية غير محدودة في عقود التوريد؛ الحد الأقصى قيمة العقد.' } });
  // تأكيد الفريق لعقد الدلتا في الذاكرة مع تواريخه (آخر موعد للإخطار بعد 25 يومًا)
  when(P + 5, 10);
  const deltaId = h.rq(n1).memory_item_id;
  mem.staffUpdate(deltaId, { status: 'active', start_date: keyIn(-280), end_date: keyIn(85), renewal_type: 'auto', term_months: 12, notice_days: 60, signed: true, signed_at: keyIn(-282), key_terms: 'توريد مواد تغليف شهريًا؛ مسؤولية بحد أقصى قيمة العقد؛ تجديد تلقائي سنوي ما لم يُخطر أي طرف قبل 60 يومًا.' }, manager);
  const posId = db.value("SELECT id FROM company_memory WHERE company_id = ? AND kind = 'position' AND source_request_id = ?", nfd.id, h.rq(n1).id);
  if (posId) mem.staffUpdate(posId, { decided_by_text: 'مريم عادل — مديرة الموارد البشرية' }, manager);

  // تكلفة إضافية في الدورة السابقة (طلب فوق المشمول) مع إشعارها (INV-B10)
  when(Math.max(curStartAgo + 1, 1), 13);
  app.companyBilling.staffAddCharge(nfd.id, { kind: 'overage', description: 'طلب إضافي فوق الطلبات المشمولة في الدورة', amount: 2500 }, admin, ctx);

  // ═════ NFD-0002: موضوع موظف (خاص) — جارٍ العمل مع ياسمين، واستيضاح أُجيب عليه ═════
  when(9, 10, 30);
  const n2 = h.submit(mariam, {
    type: 'employment',
    entity_id: nfdParent,
    visibility: 'private',
    description: 'موظف مبيعات تغيّب أكثر من 20 يومًا متقطعة خلال السنة دون إذن. نريد معرفة الإجراء الصحيح قبل إنهاء العقد وتجنب أي مطالبة بالتعويض.',
    fields: { employee_role: 'مندوب مبيعات', issue_kind: 'termination', written_contract: 'yes' },
  });
  when(9, 13);
  h.accept(n2, {
    brief_for_lawyer: 'إنهاء عقد مندوب مبيعات بسبب الغياب المتكرر دون إذن. المطلوب: الشروط القانونية للفصل والإجراءات والإنذارات اللازمة وتقدير مخاطر المطالبة بالتعويض.',
    issues: ['شروط الفصل للغياب', 'الإنذارات والإجراءات', 'مخاطر التعويض'],
    assign: { lead: { lawyer_id: yasmine.id } },
  }, manager);
  when(8, 11);
  const a2 = h.assignment(n2);
  app.visibility.markOpened(a2.id, yasmine);
  const ir2 = app.requests.createInfoByLawyer(a2.id, yasmine, { kind: 'document', question: 'نحتاج سجل الحضور والإنذارات السابقة الموجهة للموظف إن وُجدت.' });
  when(8, 12);
  app.requests.approveInfo(ir2.id, manager, { client_message: 'نرجو إرسال سجل حضور الموظف خلال السنة، وأي إنذارات كتابية سابقة وُجهت إليه.', items: ['سجل الحضور خلال السنة', 'الإنذارات الكتابية السابقة'] });
  when(7, 10);
  const clar2 = db.get("SELECT * FROM company_messages WHERE request_id = ? AND kind = 'clarification' ORDER BY id DESC LIMIT 1", h.rq(n2).id);
  const up2 = h.upload(mariam, 'سجل الحضور 2026.pdf', 'سجل الحضور 2026', 'Attendance 2026');
  reqs.replyClarification(mariam, nfd, n2, clar2.id, { body: 'مرفق سجل الحضور. لم نوجّه إليه إنذارات كتابية من قبل، وكانت التنبيهات شفهية فقط.\nمريم عادل', upload_ids: [up2], missing_items: [1] });
  when(7, 12);
  app.requests.shareInfo(ir2.id, manager, { response_text: 'أرسلت الشركة سجل الحضور خلال السنة. لم يُوجَّه للموظف إنذار كتابي من قبل، وكانت التنبيهات شفهية فقط.\nمريم عادل' });

  // ═════ NFD-0003: إنذار من مؤسسة الفجر للتجارة (عاجل) — قدّم عمرو رأيه، والمراجعة الثانية مع طارق ═════
  when(2, 11);
  const up3 = h.upload(mariam, 'إنذار مؤسسة الفجر للتجارة.pdf', 'إنذار مؤسسة الفجر للتجارة', 'Notice - Al Fajr Trading');
  const n3 = h.submit(mariam, {
    type: 'legal_notice',
    entity_id: nfdDist,
    priority: 'urgent',
    urgent_reason: 'مهلة الرد على الإنذار ثلاثة أيام فقط.',
    description: 'وصلنا إنذار على يد محضر من مؤسسة الفجر للتجارة تطالب فيه بمستحقات توريد متأخرة وتهدد برفع دعوى. نحتاج الرد خلال المهلة.',
    fields: { sender_name: 'مؤسسة الفجر للتجارة', notice_kind: 'demand_letter', received_at: keyIn(-2), response_deadline: keyIn(3), amount_claimed: 380000, currency: 'EGP' },
    upload_ids: [up3],
  });
  when(2, 12);
  h.accept(n3, {
    risk_level: 'high',
    requires_senior_review: true,
    delivery_due_at: new Date(realNow + 26 * 3600000).toISOString(),
    due_reason: 'الرد قبل انتهاء مهلة الإنذار بيومين',
    brief_for_lawyer: 'إنذار بمطالبة بمستحقات توريد متأخرة (380 ألف جنيه) مع تهديد برفع دعوى. المطلوب: تقييم المطالبة وصياغة رد قانوني خلال المهلة.',
    issues: ['صحة المطالبة وسندها', 'الرد على الإنذار', 'مخاطر الدعوى'],
    assign: { lead: { lawyer_id: amr.id }, reviewer: { lawyer_id: tarek.id } },
  }, manager);
  when(1, 14);
  h.opinion(n3, 'lead', 'amr', 'الخلاصة التنفيذية\nالمطالبة مبالغ فيها: الثابت بالفواتير 210 ألف جنيه فقط، والباقي غرامات تأخير لم يُتفق عليها. نوصي برد يقر بالمبلغ الثابت ويعرض جدول سداد.\n\nالتحليل\nمراجعة الفواتير وأوامر التوريد.', { steps: ['إرسال الرد خلال المهلة', 'عرض جدول سداد للمبلغ الثابت'], approve: false });

  // ═════ NFD-0004: مراجعة حملة إعلانية — بانتظار الشركة (استيضاح قبل القبول) ═════
  when(3, 10);
  const n4 = h.submit(hossam, {
    type: 'marketing_review',
    entity_id: nfdDist,
    description: 'نطلق حملة خصومات على منتجات العصائر عبر وسائل التواصل والإعلانات الخارجية، ونريد التأكد من سلامة الصياغة وشروط المسابقة.',
    fields: { campaign_name: 'صيف النيل', channels: ['social', 'outdoor'], launch_date: keyIn(12), contains: ['prices_discounts', 'contests'] },
  });
  when(3, 13);
  reqs.clarify(h.rq(n4).id, { rev: h.rq(n4).rev, body: 'أرسلوا التصميم النهائي للإعلان وشروط المسابقة كما ستُنشر.', items: ['التصميم النهائي للإعلان', 'شروط المسابقة'] }, manager);

  // ═════ NFD-0005: نزاع مع موزّع (دعوى 1.2 مليون) — بانتظار موافقة على عرض سعر ثابت ═════
  when(4, 10);
  const n5 = h.submit(mariam, {
    type: 'dispute',
    entity_id: nfdParent,
    description: 'موزّع الوجه القبلي توقف عن سداد مستحقات بضاعة استلمها منذ ستة أشهر. نريد رفع دعوى لاسترداد المبلغ وفسخ عقد التوزيع.',
    fields: { counterparty_name: 'الشركة المتحدة للتوزيع بالصعيد', dispute_kind: 'owed_to_us', stage: 'demand_sent', desired_outcome: 'استرداد المستحقات وفسخ عقد التوزيع', amount: 1200000, currency: 'EGP' },
  });
  when(4, 14);
  reqs.sendQuote(h.rq(n5).id, {
    rev: h.rq(n5).rev,
    kind: 'out_of_scope',
    basis: 'fixed',
    amount: 45000,
    scope_of_work: 'رفع دعوى مطالبة بمستحقات توريد (1.2 مليون جنيه) وفسخ عقد التوزيع أمام المحكمة الاقتصادية حتى صدور حكم أول درجة، شاملًا المذكرات وحضور الجلسات.',
    assumptions: 'لا يشمل الرسوم القضائية ولا الخبراء ولا الاستئناف.',
    valid_days: 14,
    message: 'التقاضي خارج باقتكم؛ أرسلنا عرض سعر ثابتًا لهذه الدعوى.',
    accept_plan: {
      brief_for_lawyer: 'رفع دعوى مطالبة بمستحقات توريد متأخرة (1.2 مليون جنيه) على موزّع وفسخ عقد التوزيع. المطلوب: صحيفة الدعوى والمستندات المؤيدة.',
      issues: ['المطالبة بالمستحقات', 'فسخ عقد التوزيع'],
      assign: { lead: { lawyer_id: amr.id } },
      quota: 'out_of_scope',
    },
  }, admin, ctx);

  // ═════ NFD-0006: اتفاقية سرية — وصلت للتو، وفرزها المحلل المحلي ═════
  when(0, 9, 40);
  const n6 = h.submit(hossam, {
    type: 'nda',
    entity_id: nfdParent,
    description: 'نتفاوض مع شركة أوربت للبرمجيات على نظام لإدارة المخازن، ونحتاج اتفاقية سرية متبادلة قبل مشاركة بيانات التشغيل.',
    fields: { counterparty_name: 'شركة أوربت للبرمجيات', direction: 'mutual', purpose: 'تقييم نظام لإدارة المخازن', duration_months: 24 },
  });
  app.ai?.companyAi?.cancelTimers?.();
  await app.ai?.triageCompanyRequest?.(h.rq(n6).id, null, { reason: 'seed' });

  // ═════ تك سوليوشنز ═════
  // TSL-0003: قرار مجلس لفتح حساب بنكي — سُلِّم ثم أُغلق تلقائيًا قبل 9 أيام (طلب خارج الباقة احتُسب «دون احتساب» للفترة التجريبية)
  when(18, 11);
  const t3 = h.submit(sherif, {
    type: 'board_resolution',
    description: 'نحتاج نموذج قرار مجلس إدارة بفتح حساب بنكي جديد بالدولار وتحديد المفوضين بالتوقيع.',
    fields: { body: 'board', subject: 'bank_account', meeting_date: keyIn(-15) },
  });
  when(18, 13);
  h.accept(t3, {
    quota: 'free',
    brief_for_lawyer: 'إعداد نموذج قرار مجلس إدارة بفتح حساب بنكي بالدولار وتحديد المفوضين بالتوقيع ومستويات الصلاحية.',
    assign: { lead: { lawyer_id: yasmine.id } },
  }, admin);
  when(17, 11);
  const opT3 = h.opinion(t3, 'lead', 'yasmine', 'الخلاصة التنفيذية\nأعددنا نموذج القرار متضمنًا فتح الحساب وتحديد مفوضَين اثنين بالتوقيع المشترك فوق 100 ألف دولار.\n\nالتحليل\nمتطلبات البنوك المصرية لفتح حسابات الشركات.', { steps: ['اعتماد القرار في اجتماع المجلس', 'تقديم القرار للبنك مع السجل التجاري'], approver: admin });
  when(17, 14);
  h.deliver(t3, opT3, { title: 'نموذج قرار مجلس الإدارة بفتح حساب بنكي', files: [staffPdf('قرار مجلس الإدارة - فتح حساب بنكي.pdf', 'نموذج قرار مجلس الإدارة', 'Board resolution - bank account')], actor: admin });
  when(9, 10);
  reqs.autoClose();

  // TSL-0001: صياغة عقد خدمات برمجية (SaaS MSA) — سُلِّم الإصدار الأول بانتظار قرار الشركة
  when(6, 10);
  const t1 = h.submit(sherif, {
    type: 'contract_drafting',
    description: 'نريد اتفاقية خدمات رئيسية (MSA) لعملاء منصتنا السحابية تشمل مستوى الخدمة وحماية البيانات وحدود المسؤولية.',
    fields: { counterparty_name: 'عملاء منصة تك كلاود', contract_kind: 'service', our_role: 'service_provider', key_terms: 'اشتراك سنوي، مستوى خدمة 99.5%، حماية بيانات العملاء، حد المسؤولية رسوم 12 شهرًا.' },
  });
  when(6, 12);
  h.accept(t1, {
    brief_for_lawyer: 'صياغة اتفاقية خدمات رئيسية لمنصة برمجيات سحابية: مستوى الخدمة، حماية البيانات، حدود المسؤولية، الإنهاء.',
    assign: { lead: { lawyer_id: tarek.id } },
  }, admin);
  when(4, 11);
  const opT1 = h.opinion(t1, 'lead', 'tarek', 'الخلاصة التنفيذية\nأعددنا مسودة اتفاقية خدمات رئيسية متوازنة مع ملحق لمستوى الخدمة وملحق لمعالجة البيانات.\n\nالتحليل\nالبنود الأساسية وحدود المسؤولية.', { steps: ['مراجعة ملحق مستوى الخدمة مع الفريق الفني', 'اعتماد المسودة'], approver: admin });
  when(3, 15);
  h.deliver(t1, opT1, { title: 'مسودة اتفاقية الخدمات الرئيسية (MSA) — الإصدار الأول', files: [staffPdf('اتفاقية الخدمات الرئيسية - مسودة 1.pdf', 'اتفاقية الخدمات الرئيسية — مسودة 1', 'Master services agreement - draft 1')], actor: admin });

  // TSL-0002: سؤال امتثال عن بيانات العملاء الشخصية — جارٍ العمل مع ياسمين
  when(2, 10);
  const t2 = h.submit(omar, {
    type: 'compliance_question',
    description: 'هل يلزمنا قانون حماية البيانات الشخصية بالحصول على ترخيص لتخزين بيانات عملائنا على خوادم خارج مصر؟',
    fields: { area: 'data_protection' },
  });
  when(2, 12);
  h.accept(t2, {
    brief_for_lawyer: 'سؤال امتثال: تخزين بيانات العملاء الشخصية على خوادم خارج مصر — متطلبات الترخيص والنقل عبر الحدود وفق قانون حماية البيانات الشخصية.',
    assign: { lead: { lawyer_id: yasmine.id } },
  }, admin);

  // ═════ الذاكرة القانونية (B10 §18) ═════
  when(30, 10);
  mem.create(mariam, nfd, { kind: 'contract', title: 'عقد إيجار مخزن العاشر من رمضان', counterparty_name: 'شركة القاهرة للخدمات اللوجستية', entity_id: nfdDist, contract_kind: 'lease', our_role: 'tenant', start_date: keyIn(-290), end_date: keyIn(75), renewal_type: 'manual', value: '540000', governing_law: 'القانون المصري' });
  mem.staffCreate(nfd.id, { kind: 'contract', title: 'عقد توزيع منتجات الوجه القبلي', counterparty_name: 'الشركة المتحدة للتوزيع بالصعيد', entity_id: nfdDist, contract_kind: 'distribution', our_role: 'seller', start_date: keyIn(-400), end_date: keyIn(330), renewal_type: 'none', staff_notes: 'متعثر في السداد — راجع NFD-0005.' }, manager);
  mem.staffCreate(nfd.id, { kind: 'template', title: 'نموذج اتفاقية سرية معتمد', template_kind: 'nda', version: '2026.1', approved_at: keyIn(-120), approved_by_text: 'الإدارة القانونية', files: [staffPdf('نموذج اتفاقية سرية معتمد.pdf', 'نموذج اتفاقية سرية معتمد', 'Approved NDA template')] }, manager);
  mem.staffCreate(nfd.id, { kind: 'licence', title: 'الترخيص الصناعي لمصنع السادس من أكتوبر', issuer: 'الهيئة العامة للتنمية الصناعية', licence_number: 'IDA-2024-55871', entity_id: nfdParent, end_date: keyIn(40), renewal_lead_days: 30 }, manager);
  mem.staffCreate(nfd.id, { kind: 'resolution', title: 'قرار تحديد المفوضين بالتوقيع على الحسابات البنكية 2026', body: 'board', meeting_date: keyIn(-200), subject: 'تحديد المفوضين بالتوقيع على الحسابات البنكية', entity_id: nfdParent }, manager);
  mem.staffCreate(nfd.id, { kind: 'person', person_name: 'مريم عادل', person_title: 'مديرة الموارد البشرية والشؤون الإدارية', authority: 'signatory', limit: '500000', end_date: keyIn(160), entity_id: nfdParent }, manager);
  mem.staffCreate(nfd.id, { kind: 'person', person_name: 'خالد عبد الرحمن', person_title: 'العضو المنتدب', authority: 'board_member', entity_id: nfdParent }, manager);
  mem.staffCreate(nfd.id, { kind: 'dispute', title: 'مطالبة مؤسسة الفجر للتجارة', counterparty_name: 'مؤسسة الفجر للتجارة', forum: 'negotiation', our_role: 'respondent', stage: 'إنذار على يد محضر', next_event_date: keyIn(3) }, manager, { sourceRequest: h.rq(n3) });
  // تك سوليوشنز
  mem.staffCreate(tsl.id, { kind: 'template', title: 'شروط الاستخدام لعملاء المنصة', template_kind: 'service', version: '1.0', files: [staffPdf('شروط الاستخدام لعملاء المنصة.pdf', 'شروط الاستخدام لعملاء المنصة', 'Customer terms of use')] }, admin);
  mem.create(sherif, tsl, { kind: 'key_date', title: 'تجديد تسجيل العلامة التجارية «تك كلاود»', date: keyIn(120), recurrence: 'none', note: 'تجديد لدى جهاز تنمية التجارة الداخلية.' });
  mem.create(sherif, tsl, { kind: 'position', topic: 'الضمانات الشخصية', decision: 'لا يقدم الشركاء أي ضمانات شخصية في عقود التمويل أو التوريد.', decided_at: keyIn(-10) });

  app.ai?.companyAi?.cancelTimers?.();
  void tarek;
  void realNow;
}

/** شركة ثالثة (extra): طلب مغلق بتسليم مقبول، وطلب جارٍ مع طلب معلومات، وطلب بانتظار الشركة — بالساعة الحالية */
async function seedExtraRequests(app, { ctx, admin, manager, company }) {
  const { db } = app;
  const h = helpers(app, ctx);
  const reqs = app.companyRequests;
  const hala = h.cu('hala@united.example');
  const tarek = h.lawyer('tarek');
  const yasmine = h.lawyer('yasmine');
  const up = h.upload(hala, 'عقد وكالة تجارية.pdf', 'عقد وكالة تجارية', 'Agency agreement');
  const c1 = h.submit(hala, {
    type: 'contract_review',
    description: 'مراجعة عقد وكالة تجارية مع مورد أجنبي قبل التوقيع.',
    fields: { counterparty_name: 'Global Foods Ltd', contract_kind: 'agency', our_role: 'buyer' },
    upload_ids: [up],
  });
  h.accept(c1, { brief_for_lawyer: 'مراجعة عقد وكالة تجارية مع مورد أجنبي: الحصرية والإنهاء والقانون الحاكم.', assign: { lead: { lawyer_id: tarek.id, fee_mode: 'agreement' } } }, manager);
  const op = h.opinion(c1, 'lead', 'tarek', 'الخلاصة التنفيذية\nالعقد مقبول بعد تعديل بند الحصرية وتحديد القانون الحاكم.\n\nالتحليل\nتفاصيل البنود.', { steps: ['تعديل بند الحصرية', 'التوقيع'], approver: admin });
  const d = h.deliver(c1, op, { title: 'مراجعة عقد الوكالة التجارية', files: [], actor: manager });
  reqs.acceptDeliverable(hala, company, c1, d, { rating: 4, save_to_memory: false });
  const c2 = h.submit(hala, { type: 'compliance_question', description: 'متطلبات الإفصاح عن الأسعار في المتاجر الإلكترونية.', fields: { area: 'consumer_protection' } });
  h.accept(c2, { brief_for_lawyer: 'متطلبات الإفصاح عن الأسعار والعروض في المتاجر الإلكترونية وفق قانون حماية المستهلك.', assign: { lead: { lawyer_id: yasmine.id } } }, manager);
  const a2 = h.assignment(c2);
  app.visibility.markOpened(a2.id, yasmine);
  app.requests.createInfoByLawyer(a2.id, yasmine, { kind: 'information', question: 'هل تبيع الشركة لمستهلكين أفراد أم لشركات فقط؟' });
  const c3 = h.submit(hala, { type: 'other', description: 'استفسار عن تسجيل علامة تجارية جديدة للمنتجات.', fields: {} });
  reqs.clarify(h.rq(c3).id, { rev: h.rq(c3).rev, body: 'أرسلوا شعار العلامة وفئات المنتجات المطلوب تسجيلها.', items: ['الشعار', 'فئات المنتجات'] }, manager);
  app.ai?.companyAi?.cancelTimers?.();
  void db;
}
