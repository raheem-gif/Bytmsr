// v11 segment-server (SS-8، S11-53) — بيانات العرض لنوعي الخدمة «خيري» و«أفراد وشركات» عبر خدمات المنصة نفسها
// (المحرك، الموقع، القصص، الملفات، الأتعاب، صفحة المتابعة). أشخاص وأرقام وهمية (01092000301…306).
//
//   301 «م. خالد»: رقم الأفراد والشركات (SIM-PAID)، حضانة ومدرسة، 3 رسائل ← paid / wa_line؛ استشارة بأتعاب 2,500 ج.م
//       وافق عليها من صفحة المتابعة، والمحامي الأساسي طارق (سعر العمل المدفوع) — نفس تحليل قصة حضانة خيرية
//   302 «أ. نادية»: الموقع (الأفراد والشركات)، ميراث (بيع شقة موروثة)، حكاية مكتوبة ومكالمة الصبح ← paid / website،
//       بلا بطاقة أسرة، ورقمها غير مؤكد على واتساب (تنبيه «طلبات أفراد بلا واتساب مؤكد» في لوحة المتابعة)
//   303 «شركة الأمل للتجارة» (أ. هشام): نموذج طلب عرض للشركات ← paid / website، requester company
//   304 «أم سلمى»: رقم مشترك (محاكاة)، أزرار نوع الخدمة ← «خيري — مجاني» ← charity / wa_choice
//   305 —: رقم مشترك (محاكاة)، «شركتي عندها عقد توريد…» ولم تُجب الأزرار ← «غير محدد» + اقتراح «أفراد وشركات»
//   306 «أم يحيى»: طلب من صفحات الأفراد والشركات حوّلته الإدارة (manager) إلى «خيري» بسبب «أرملة ودخلها لا يكفي»
//
// إعداد العرض فقط: الرقم الأساسي «الخيري» (كل قصص 9.x تبقى خيري)، رقم الأفراد والشركات SIM-PAID / 201000000002
// مُتحقق منه (العرض فقط — لا إرسال حقيقي)، وأزرار الاختيار مفعّلة (العرض فقط، مثل «وصلتنا حكايتك» في 9.2).

export const SEGMENT_DEMO_PHONES = ['01092000301', '01092000302', '01092000303', '01092000304', '01092000305', '01092000306'];

/**
 * @param {object} app
 * @param {{ at: (daysAgo:number, hour?:number, minute?:number) => void, realNow?: number }} opts
 * @returns {Promise<Record<string, number|null>>} معرّفات الطلبات (للاختبارات)
 */
export async function seedSegmentDemo(app, { at, realNow = Date.now() }) {
  const { db } = app;
  if (!app.segments || typeof app.publicIntake !== 'function') return {};
  const user = (u) => db.get('SELECT * FROM users WHERE username = ?', u);
  const manager = user('manager') || db.get("SELECT * FROM users WHERE role IN ('admin','case_manager') ORDER BY id LIMIT 1");
  const tarek = user('tarek');
  const ids = {};

  // ── إعداد العرض: رقم الأفراد والشركات في نفس الحساب، مُتحقق منه، وأزرار الاختيار على الرقم المشترك ──
  try {
    app.integrations.set('whatsapp', { paid_phone_number_id: 'SIM-PAID', paid_number: '201000000002' }, null, null, { confirm: true });
    app.segments.markPaidVerified('SIM-PAID', '201000000002');
  } catch (e) {
    app.log?.('seed-v11-segment: demo paid number', e);
  }
  app.settings.set('wa_segment_choice_enabled', true);
  const lines = app.segments.lines();
  const paidLine = lines.find((l) => l.key === 'paid') || { key: 'paid', pid: 'SIM-PAID', digits: '', mode: 'paid', verified: true };
  // رقم مشترك للمحاكاة فقط (الإعداد الحقيقي للعرض يبقى «الخيري»)
  const sharedLine = { ...lines[0], key: 'main', mode: 'shared' };

  let n = 0;
  const wa = (phone, name, text, { line, pid = null, extra = {} } = {}) =>
    app.engine.receive({
      channel: 'whatsapp',
      external_id: `wamid.SEED.v11.${++n}`,
      from_phone: phone,
      contact_name: name,
      text,
      line,
      business_phone_number_id: pid,
      ...extra,
    });
  const settle = async (id) => {
    app.ai.cancelTimers(id);
    await app.ai.analyzeIntake(id);
    app.ai.cancelTimers(id);
  };
  const site = (body) => {
    try {
      return app.publicIntake({ consent: true, consent_v: 1, attribution: { landing_path: '/services', utm_source: 'google', utm_medium: 'organic' }, ...body });
    } catch (e) {
      app.log?.('seed-v11-segment: public intake', e);
      return null;
    }
  };
  const intakeOf = (res) => (res?.body?.reference ? db.get('SELECT * FROM intakes WHERE code = ?', res.body.reference) : null);

  // ── 301 «م. خالد» — رقم الأفراد والشركات: حضانة ومدرسة ──
  at(3, 10, 5);
  const p1 = '01092000301';
  let r = wa(p1, 'م. خالد', 'مساء الخير، عندي استفسار بخصوص حضانة ابني بعد الطلاق', { line: paidLine, pid: paidLine.pid });
  ids.s301 = r.intake?.id ?? null;
  at(3, 10, 7);
  wa(p1, 'م. خالد', 'والدته عايزة تنقله من مدرسته في القاهرة لمدرسة في الإسكندرية من غير ما ترجعلي، وأنا اللي بدفع مصاريف المدرسة كلها', { line: paidLine, pid: paidLine.pid });
  at(3, 10, 9);
  wa(p1, 'م. خالد', 'عايز أعرف حقي في الولاية التعليمية وإزاي أوقف النقل ده', { line: paidLine, pid: paidLine.pid });
  if (ids.s301) {
    app.stories.markReady(ids.s301, 'quiet', null, { analyze: false });
    await settle(ids.s301);
    at(2, 11, 30);
    try {
      const prop = app.stories.proposal(ids.s301);
      await app.stories.accept(
        ids.s301,
        {
          track: 'consultation',
          force: true,
          case: { legal_area: 'FAM', title: 'الولاية التعليمية ونقل الابن المحضون إلى مدرسة في محافظة أخرى' },
          reply: { send: true, text: prop.drafts.consultation.reply.text },
        },
        manager,
      );
      const caseId = db.value('SELECT case_id FROM intakes WHERE id = ?', ids.s301);
      ids.case301 = caseId ?? null;
      if (caseId) {
        at(2, 11, 40);
        const inv = app.matters.addCaseInvoice(
          caseId,
          { amount: 2500, description: 'أتعاب استشارة قانونية — الحضانة والولاية التعليمية', due_at: new Date(realNow + 7 * 24 * 3600 * 1000).toISOString() },
          manager,
        );
        ids.invoice301 = inv.id;
        at(2, 19, 15);
        const client = app.clients.get(db.value('SELECT client_id FROM cases WHERE id = ?', caseId));
        app.portal.invoiceResponse(client, null, inv.number, { answer: 'agree' });
        if (tarek) {
          at(1, 9, 30);
          app.cases.assign(caseId, { lawyer_id: tarek.id, role: 'lead', fee_mode: 'agreement', brief: 'المطلوب: رأي في حق الأب في الاعتراض على نقل الابن المحضون إلى مدرسة في محافظة أخرى (الولاية التعليمية)، والخطوات العملية.' }, manager);
        }
      }
    } catch (e) {
      app.log?.('seed-v11-segment: 301 accept', e);
    }
  }

  // ── 302 «أ. نادية» — الموقع (الأفراد والشركات): بيع شقة موروثة، مكالمة الصبح، رقم غير مؤكد ──
  at(1, 8, 50);
  const r302 = site({
    segment: 'paid',
    name: 'أ. نادية',
    phone: '01092000302',
    topic: 'inh',
    description: 'توفي والدي وترك شقة باسمه، ونحن ثلاثة ورثة. أحد إخوتي يريد بيع الشقة ونحن نرفض البيع الآن. ما حقوقنا وكيف نتصرف قانونيًا؟',
    callback: 'morning',
    entry: 'direct',
    mode: 'form',
    submission_id: 'seed_v11_segment_0302',
  });
  ids.s302 = intakeOf(r302)?.id ?? null;

  // ── 303 «شركة الأمل للتجارة» — نموذج طلب عرض للشركات ──
  at(1, 12, 10);
  const r303 = site({
    segment: 'paid',
    name: 'أ. هشام',
    phone: '01092000303',
    entry: 'company_band',
    mode: 'form',
    requester: { kind: 'company', company_name: 'شركة الأمل للتجارة', job_title: 'المدير المالي', email: 'hesham@alamal.example', employees: '11-50', needs: ['contracts', 'employees'] },
    submission_id: 'seed_v11_segment_0303',
  });
  ids.s303 = intakeOf(r303)?.id ?? null;

  // ── 304 «أم سلمى» — رقم مشترك: الأزرار ← «خيري — مجاني» ──
  at(0, 9, 12);
  const p4 = '01092000304';
  r = wa(p4, 'أم سلمى', 'السلام عليكم، محتاجة أسأل على حاجة', { line: sharedLine, pid: sharedLine.pid || 'SIM' });
  ids.s304 = r.intake?.id ?? null;
  at(0, 9, 14);
  wa(p4, 'أم سلمى', 'خيري — مجاني', { line: sharedLine, pid: sharedLine.pid || 'SIM', extra: { reply: { kind: 'interactive', id: 'seg:charity', title: 'خيري — مجاني' } } });
  at(0, 9, 17);
  wa(p4, 'أم سلمى', 'جوزي اتوفى من سنة وأهله واخدين الشقة ومش عايزين يدونا نصيب العيال، ومعايا تلات عيال صغيرين', { line: sharedLine, pid: sharedLine.pid || 'SIM' });
  if (ids.s304) {
    app.stories.markReady(ids.s304, 'quiet', null, { analyze: false });
    await settle(ids.s304);
  }

  // ── 305 — رقم مشترك: قصة شركة، لم تُجب الأزرار ← «غير محدد» مع اقتراح «أفراد وشركات» ──
  at(0, 10, 40);
  const p5 = '01092000305';
  r = wa(p5, 'عميل', 'شركتي عندها عقد توريد مع مورد مش ملتزم بمواعيد التسليم، والموظفين عندنا متعطلين بسببه. عايز أعرف أفسخ العقد إزاي وأطالب بتعويض', { line: sharedLine, pid: sharedLine.pid || 'SIM' });
  ids.s305 = r.intake?.id ?? null;
  if (ids.s305) {
    app.stories.markReady(ids.s305, 'quiet', null, { analyze: false });
    await settle(ids.s305);
  }

  // ── 306 «أم يحيى» — من صفحات الأفراد والشركات، حوّلتها الإدارة إلى «خيري» ──
  at(0, 11, 5);
  const r306 = site({
    segment: 'paid',
    name: 'أم يحيى',
    phone: '01092000306',
    topic: 'pen',
    description: 'جوزي اتوفى من 6 شهور ومعاشه لسه ما اتصرفش، ومعايا ولدين في المدرسة ومش لاقية مصاريفهم',
    entry: 'direct',
    mode: 'form',
    submission_id: 'seed_v11_segment_0306',
  });
  ids.s306 = intakeOf(r306)?.id ?? null;
  if (ids.s306 && manager) {
    at(0, 11, 40);
    try {
      app.segments.setIntake(ids.s306, 'charity', { actor: manager, reason: 'أرملة ودخلها لا يكفي', reasonCode: 'wrong_choice' });
    } catch (e) {
      app.log?.('seed-v11-segment: 306 override', e);
    }
  }
  return ids;
}
