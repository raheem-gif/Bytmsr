// v12 staff-lines (SL-10، E12-59) — بيانات العرض لقائمة الخدمات على واتساب ومسار الطلب، عبر محرك الاستقبال نفسه
// (رقم الأفراد والشركات، الأزرار W-01، القوائم W-02…W-04، W-05/W-06، كلمة الإيقاف). أشخاص وأرقام وهمية (01092000401…404).
//
//   401 «أ. سامح»: «مرحبا» ← الأزرار ← «رفع دعوى قضائية» ← القائمة ← «الرد على دعوى مرفوعة» ← W-05، ثم الحكاية
//       ← المسار litigation/defend «من قائمة واتساب»؛ قبلته الإدارة استشارة وأسندتها لأحمد (المحامي لا يرى المسار)
//   402 «أ. منى» (شركة): «السلام عليكم» ← الأزرار ← «تأسيس شركات» ← القائمة ← «مستشار قانوني للشركة» ← W-06
//       ← المسار company/counsel «من قائمة واتساب»
//   403 «أ. ريهام»: رسالة طويلة أولى (لا قائمة) بلا مسار، مجالها «أسرة» ← «مقترح: …» + «تأكيد» في صندوق الوارد
//   404 «أ. وليد»: «مرحبا» ← الأزرار، ثم «إيقاف» ← أوقف الرسائل الآلية (الشارة + «إلغاء الإيقاف»)، ثم حكايته بلا أي رد آلي
//
// إعداد العرض فقط: wa_lines_menu_enabled = true (الافتراضي في الإنتاج متوقف، L12-26). لا firm_partners ولا firm_founded
// ولا firm_city (L12-41: لا أشخاص وهميون في صفحة المكتب). لا يُرسل شيء فعليًا (وضع المحاكاة).

export const LINES_DEMO_PHONES = ['01092000401', '01092000402', '01092000403', '01092000404'];

/**
 * @param {object} app
 * @param {{ at?: (daysAgo:number, hour?:number, minute?:number) => void, realNow?: number }} [opts]
 * @returns {Promise<Record<string, number|null>>} معرّفات الطلبات (للاختبارات)
 */
export async function seedV12Lines(app, { at = () => {}, realNow = Date.now() } = {}) {
  const { db } = app;
  const ids = {};
  if (!app.segments?.maybeLinesMenu || !app.pathways) return ids;
  app.settings.set('wa_lines_menu_enabled', true);
  const lines = app.segments.lines();
  const paidLine = lines.find((l) => l.key === 'paid');
  if (!paidLine) return ids; // بلا رقم أفراد وشركات لا قائمة (القائمة على خط الأفراد والشركات فقط)
  const user = (u) => db.get('SELECT * FROM users WHERE username = ?', u);
  const manager = user('manager') || db.get("SELECT * FROM users WHERE role IN ('admin','case_manager') ORDER BY id LIMIT 1");
  const ahmed = user('ahmed');

  let n = 0;
  const wa = (phone, name, text, reply = null) => {
    try {
      return app.engine.receive({
        channel: 'whatsapp',
        external_id: `wamid.SEED.v12.${++n}`,
        from_phone: phone,
        contact_name: name,
        text,
        line: paidLine,
        business_phone_number_id: paidLine.pid,
        ...(reply ? { reply: { kind: 'interactive', id: reply.id, title: reply.title } } : {}),
      });
    } catch (e) {
      app.log?.('seed-v12-lines: receive', e);
      return null;
    }
  };
  const settle = async (id) => {
    app.ai.cancelTimers?.(id);
    await app.ai.analyzeIntake(id);
    app.ai.cancelTimers?.(id);
  };

  // ── 401 «أ. سامح» — القائمة حتى الصف، ثم الحكاية؛ استشارة أُسندت لأحمد ──
  at(2, 9, 10);
  const p1 = LINES_DEMO_PHONES[0];
  let r = wa(p1, 'أ. سامح', 'مرحبا');
  ids.l401 = r?.intake?.id ?? null;
  at(2, 9, 11);
  wa(p1, 'أ. سامح', 'رفع دعوى قضائية', { id: 'line:litigation', title: 'رفع دعوى قضائية' });
  at(2, 9, 12);
  wa(p1, 'أ. سامح', 'الرد على دعوى مرفوعة', { id: 'path:litigation/defend', title: 'الرد على دعوى مرفوعة' });
  at(2, 9, 16);
  wa(p1, 'أ. سامح', 'وصلني إعلان بدعوى مرفوعة عليّ من شريكي السابق يطالب فيها بمبلغ عشرين ألف جنيه، والجلسة الأولى بعد أسبوعين. عندي إيصالات تثبت أني دفعت نصيبي.');
  at(2, 9, 18);
  wa(p1, 'أ. سامح', 'خلاص');
  if (ids.l401) {
    await settle(ids.l401);
    at(1, 12, 20);
    try {
      const prop = app.stories.proposal(ids.l401);
      await app.stories.accept(
        ids.l401,
        {
          track: 'consultation',
          force: true,
          case: { legal_area: 'CIV', title: 'الرد على دعوى مطالبة مالية من شريك سابق' },
          reply: { send: true, text: prop?.drafts?.consultation?.reply?.text || 'وصلنا موضوعكم، وسيتواصل معكم أحد المحامين قبل موعد الجلسة.' },
        },
        manager,
      );
      const caseId = db.value('SELECT case_id FROM intakes WHERE id = ?', ids.l401);
      ids.case401 = caseId ?? null;
      if (caseId && ahmed) {
        at(1, 12, 40);
        app.cases.assign(caseId, { lawyer_id: ahmed.id, role: 'lead', fee_mode: 'agreement', brief: 'المطلوب: رأي في الرد على دعوى مطالبة مالية من شريك سابق، والمستندات المطلوبة قبل الجلسة الأولى.' }, manager);
      }
    } catch (e) {
      app.log?.('seed-v12-lines: 401 accept', e);
    }
  }

  // ── 402 «أ. منى» — شركة: القائمة حتى «مستشار قانوني للشركة» (W-06) ──
  at(1, 10, 30);
  const p2 = LINES_DEMO_PHONES[1];
  r = wa(p2, 'أ. منى', 'السلام عليكم');
  ids.l402 = r?.intake?.id ?? null;
  at(1, 10, 31);
  wa(p2, 'أ. منى', 'تأسيس شركات', { id: 'line:company', title: 'تأسيس شركات' });
  at(1, 10, 33);
  wa(p2, 'أ. منى', 'مستشار قانوني للشركة', { id: 'path:company/counsel', title: 'مستشار قانوني للشركة' });
  at(1, 10, 40);
  wa(p2, 'أ. منى', 'شركتنا للمقاولات فيها أربعون موظفًا، ونحتاج مستشارًا قانونيًا لمراجعة العقود مع الموردين وعقود العمل شهريًا.');

  // ── 403 «أ. ريهام» — بلا مسار، مجال «أسرة» ← «مقترح» في صندوق الوارد ──
  at(0, 9, 5);
  const p3 = LINES_DEMO_PHONES[2];
  r = wa(p3, 'أ. ريهام', 'مساء الخير، طليقي متوقف عن دفع نفقة الأولاد منذ ستة أشهر، وعندي حكم نفقة سابق. ما الإجراء المطلوب الآن؟');
  ids.l403 = r?.intake?.id ?? null;
  if (ids.l403) {
    db.run("UPDATE intakes SET legal_area = 'FAM' WHERE id = ? AND pathway IS NULL", ids.l403);
  }

  // ── 404 «أ. وليد» — كلمة الإيقاف بعد الأزرار، ثم الحكاية بلا رد آلي ──
  at(0, 11, 0);
  const p4 = LINES_DEMO_PHONES[3];
  r = wa(p4, 'أ. وليد', 'مرحبا');
  ids.l404 = r?.intake?.id ?? null;
  at(0, 11, 2);
  wa(p4, 'أ. وليد', 'إيقاف');
  at(0, 11, 10);
  wa(p4, 'أ. وليد', 'عندي مشكلة في عقد إيجار محل تجاري، المالك يرفض تجديد العقد رغم أني أدفع الإيجار بانتظام.');
  ids.client404 = ids.l404 ? db.value('SELECT client_id FROM intakes WHERE id = ?', ids.l404) ?? null : null;

  void realNow;
  return ids;
}
