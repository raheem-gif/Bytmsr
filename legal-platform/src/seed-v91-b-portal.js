// v9.1 b-portal — بيانات تجريبية لصفحة متابعة المستفيد/ة الجديدة (B91-02/03/08/09/13/18):
// • رد نهى بخلاصة بسيطة وخطوات «تعملي إيه دلوقتي؟»،
// • «هاتي معاكي» معتمدة لجلسة نهى، ومصاريف القضية بانتظار موافقتها (لا تذكير قبلها)،
// • طلب الورق من سامية ببندين (صف «صوّري» لكل ورقة)،
// • مخاطبة بالمذكر للرجال في بيانات التجربة (address_form = 'm')،
// • تعليمات الدفع في الإعدادات.
// كل التعديلات على بيانات أنشأها السيناريو الرئيسي (src/seed.js) عبر الخدمات الفعلية.

/**
 * @param {object} app
 * @param {{ manager: object }} ctx
 */
export function seedPortalDemo(app, { manager } = {}) {
  const { db } = app;
  const clientCase = (name, area) =>
    db.get('SELECT c.* FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE cl.name = ? AND c.legal_area = ? ORDER BY c.id LIMIT 1', name, area);

  // 1) رد نهى: الخلاصة والخطوات (الرد الكامل يبقى كما أُرسل، مطويًا تحت «اقري الرد كامل»)
  const noha = clientCase('نهى سمير عبد الفتاح', 'FAM');
  if (noha) {
    const ans = db.get("SELECT id FROM client_answers WHERE case_id = ? AND status = 'sent' ORDER BY id DESC LIMIT 1", noha.id);
    if (ans) {
      db.update('client_answers', ans.id, {
        summary: 'من حقك تاخدي نفقة للعيال عن الشهور اللي فاتت كمان. الحضانة ليكي لحد ما الولاد يكمّلوا 15 سنة، وتهديده لوحده مالوش أي أثر. هنرفع دعوى نفقة في محكمة الأسرة.',
        steps: JSON.stringify([
          'جهّزي شهادات ميلاد الولدين وصورة بطاقتك.',
          'احتفظي بأي رسايل أو تسجيلات فيها تهديد من طليقك، وما تمسحيهاش.',
          'لو جالك أي ورق من المحكمة، صوّريه وابعتيه لنا من صفحتك.',
        ]),
      });
    }
    // 2) جلستها: «هاتي معاكي» معتمدة (الجلسة نفسها معتمدة من الإدارة في السيناريو الرئيسي)
    const matter = db.get('SELECT id FROM matters WHERE case_id = ?', noha.id);
    const ev = matter && db.get("SELECT id, client_text_approved FROM matter_events WHERE matter_id = ? AND status = 'scheduled' ORDER BY starts_at LIMIT 1", matter.id);
    if (ev) {
      app.matters.updateEvent(ev.id, { client_note: 'بطاقتك الشخصية\nشهادات ميلاد الولدين\nالمحامي هيقابلك قدام باب القاعة الساعة 9 ونص' }, manager);
    }
  }

  // 3) طلب الورق المرسل لسامية: بندان، فيظهر لها صف «صوّري» لكل ورقة
  const samia = clientCase('سامية محمود عبد الحميد', 'INH');
  if (samia) {
    const ir = db.get("SELECT id FROM info_requests WHERE case_id = ? AND kind = 'document' AND status = 'sent_to_client' ORDER BY id DESC LIMIT 1", samia.id);
    if (ir) {
      db.update('info_requests', ir.id, {
        items: JSON.stringify([{ label: 'إعلام الوراثة (لو طلع)' }, { label: 'شهادة وفاة أخوكي اللي اتوفى قبل والدك' }]),
        client_message: 'محتاجين صورة من الورقتين دول عشان نكمّل دراسة الورث وحق ولاد أخوكي.',
      });
    }
  }

  // 4) طريقة المخاطبة للرجال في بيانات التجربة (الافتراضي مؤنث لأن أغلب المستفيدات سيدات):
  //    صفحة خالد وعادل تقول «اقرا الرد» و«اتصل بينا» بدل صيغة المؤنث
  for (const name of ['خالد عبد الرحيم', 'سيد عبد الفتاح', 'رامي فوزي', 'شريف عادل', 'عبد الله حمدي', 'حسام الدين يوسف', 'أشرف عبد الحكيم', 'وليد منصور', 'محمد السعيد', 'عادل مرسي', 'حسن محمود عبدالحميد']) {
    for (const c of db.all('SELECT id FROM clients WHERE name = ? AND address_form IS NULL', name)) db.update('clients', c.id, { address_form: 'm' });
  }

  // 5) تعليمات الدفع (تظهر تحت «إزاي أدفع؟» في «مصاريف قضيتك»)
  if (!app.settings.get('portal_payment_instructions')) {
    app.settings.set(
      'portal_payment_instructions',
      'الدفع في مقر المؤسسة بس (44 شارع المحكمة العسكرية، مدينة نصر) من السبت للخميس، من 10 الصبح لـ 4 العصر. خدي إيصال مختوم دايمًا، وما تدفعيش لأي حد برّه المؤسسة.',
    );
  }
}
