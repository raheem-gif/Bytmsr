// الإصدار 9 — وحدة programs: البرامج والتمويل، احتساب الإنفاق، تنبيهات الميزانية، الإيصالات، والمستندات المطبوعة.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, newCase, assign, submitAndApprove, uniquePhone } from './lane-b-kit.test.js';
import { amountInWords, numberToArabicWords } from '../src/services/programs.js';

const thisYear = new Date().getUTCFullYear();
const YEAR_START = `${thisYear}-01-01`;
const YEAR_END = `${thisYear}-12-31`;

async function programmeNotifications(c) {
  const items = ok(await c.get('/api/notifications?limit=200'), 200, 'notifications').items;
  return items.filter((n) => n.type === 'program.budget');
}

describe('v9 programs — tafqeet (amount in words)', () => {
  test('Arabic amount in words follows number–noun agreement', () => {
    assert.equal(amountInWords(150000), 'فقط ألف وخمسمائة جنيه مصري لا غير');
    assert.equal(amountInWords(15000), 'فقط مائة وخمسون جنيهًا مصريًا لا غير');
    assert.equal(amountInWords(20000), 'فقط مائتا جنيه مصري لا غير');
    assert.equal(amountInWords(200000), 'فقط ألفا جنيه مصري لا غير');
    assert.equal(amountInWords(335000), 'فقط ثلاثة آلاف وثلاثمائة وخمسون جنيهًا مصريًا لا غير');
    assert.equal(amountInWords(1200000), 'فقط اثنا عشر ألف جنيه مصري لا غير');
    assert.equal(amountInWords(1550000), 'فقط خمسة عشر ألفًا وخمسمائة جنيه مصري لا غير');
    assert.equal(amountInWords(500), 'فقط خمسة جنيهات مصرية لا غير');
    assert.equal(amountInWords(100), 'فقط جنيه مصري واحد لا غير');
    assert.equal(amountInWords(25050), 'فقط مائتان وخمسون جنيهًا مصريًا وخمسون قرشًا لا غير');
    assert.equal(numberToArabicWords(2500000), 'مليونان وخمسمائة ألف');
    assert.equal(numberToArabicWords(120000), 'مائة وعشرون ألفًا');
  });
});

describe('v9 programs — programmes, spend, alerts and printing', () => {
  let t;
  let admin;
  let manager;
  let lawyerA;
  let lawyerB;
  let lawA;
  let lawB;
  let prog;
  let caseFam;
  let matter;
  let invoice;

  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'pmgr', name: 'مديرة البرامج', password: 'Manager@2026' }), 201, 'create manager');
    manager = await t.login('pmgr', 'Manager@2026');
    lawA = await createLawyer(admin, { name: 'محامية البرنامج', specialties: ['FAM'], agreement: { type: 'per_case', rate: 500 } });
    lawB = await createLawyer(admin, { name: 'محامٍ آخر', specialties: ['CIV'], agreement: { type: 'per_case', rate: 400 } });
    lawyerA = await t.login(lawA.username);
    lawyerB = await t.login(lawB.username);
  });
  after(async () => {
    await t?.close();
  });

  test('programme CRUD is admin-only; staff can view; lawyers cannot', async () => {
    const body = {
      name: 'برنامج دعم الأرامل في قضايا الأسرة',
      funder_name: 'جهة مانحة للاختبار',
      funder_type: 'grant',
      agreement_ref: 'GR-2026/14',
      start_date: YEAR_START,
      end_date: YEAR_END,
      budget: 1000,
      eligible_governorates: ['القاهرة', 'الجيزة'],
      eligible_areas: ['FAM', 'INH'],
      restrictions: 'تُصرف على الأرامل والأيتام فقط',
    };
    assert.equal((await manager.post('/api/programs', body)).status, 403, 'case manager cannot create');
    assert.equal((await lawyerA.get('/api/programs')).status, 403, 'lawyer cannot list');
    assert.equal((await lawyerA.get('/api/programs/options')).status, 403, 'lawyer cannot see options');

    // التحقق من المدخلات
    assert.equal((await admin.post('/api/programs', { ...body, name: '' })).status, 400);
    assert.equal((await admin.post('/api/programs', { ...body, funder_type: 'loan' })).status, 400);
    assert.equal((await admin.post('/api/programs', { ...body, end_date: `${thisYear - 1}-06-01` })).status, 400, 'end before start');
    assert.equal((await admin.post('/api/programs', { ...body, eligible_governorates: ['أتلانتس'] })).status, 400);
    assert.equal((await admin.post('/api/programs', { ...body, budget: -5 })).status, 400);

    const created = ok(await admin.post('/api/programs', body), 201, 'create');
    prog = created.program;
    assert.match(prog.code, new RegExp(`^PRG-${thisYear}-\\d{3}$`));
    assert.equal(prog.status, 'active');
    assert.equal(prog.budget, 1000);
    assert.deepEqual(prog.eligible_areas, ['FAM', 'INH']);
    assert.equal(created.stats.spend, 0);

    const list = ok(await manager.get('/api/programs'), 200, 'manager list');
    assert.ok(list.items.some((p) => p.id === prog.id));
    ok(await manager.get(`/api/programs/${prog.id}`), 200, 'manager detail');

    assert.equal((await manager.patch(`/api/programs/${prog.id}`, { budget: 5 })).status, 403);
    assert.equal((await admin.patch(`/api/programs/${prog.id}`, { status: 'closed' })).status, 400, 'close only via action');
    const upd = ok(await admin.patch(`/api/programs/${prog.id}`, { description: 'وصف محدث' }), 200);
    assert.equal(upd.program.description, 'وصف محدث');
    const audit = t.app.db.get("SELECT * FROM security_events WHERE type = 'program.updated' ORDER BY id DESC");
    assert.ok(audit, 'programme update is audited');

    // برنامج فارغ يمكن حذفه، والمرتبط بملفات لا يُحذف (يُختبر لاحقًا)
    const tmp = ok(await admin.post('/api/programs', { ...body, name: 'برنامج مؤقت للحذف' }), 201).program;
    assert.equal((await manager.del(`/api/programs/${tmp.id}`)).status, 403);
    ok(await admin.del(`/api/programs/${tmp.id}`), 200, 'delete empty programme');
    assert.equal((await admin.get(`/api/programs/${tmp.id}`)).status, 404);
  });

  test('linking cases: eligibility, one programme per case, intake conversion, unlink', async () => {
    caseFam = await newCase(admin, { legal_area: 'FAM', title: 'نفقة صغار متجمدة', clientName: 'أرملة الاختبار' });
    ok(await admin.patch(`/api/admin/clients/${caseFam.clientId}`, { governorate: 'القاهرة' }), 200, 'set governorate');
    const civ = await newCase(admin, { legal_area: 'CIV', title: 'نزاع مدني خارج نطاق البرنامج' });

    // خارج المجالات المشمولة ← 409 مع الأسباب، ثم ربط بعد تأكيد الإدارة
    const r1 = await manager.post(`/api/programs/${prog.id}/cases`, { case_id: civ.id });
    assert.equal(r1.status, 409);
    assert.equal(r1.body.details.reason, 'ineligible');
    assert.ok(r1.body.details.reasons.some((x) => x.includes('مجال الملف')));
    ok(await manager.post(`/api/programs/${prog.id}/cases`, { case_id: civ.id, confirm_ineligible: true }), 201, 'link with override');

    // مدير الحالات يربط ملفًا مؤهلًا
    const linked = ok(await manager.post(`/api/programs/${prog.id}/cases`, { case_id: caseFam.id }), 201, 'link eligible');
    assert.equal(linked.program.id, prog.id);
    assert.equal((await lawyerA.post(`/api/programs/${prog.id}/cases`, { case_id: caseFam.id })).status, 403);

    // الملف ينتمي لبرنامج واحد: ربطه ببرنامج آخر يحتاج «نقل» صريح
    const other = ok(await admin.post('/api/programs', { name: 'برنامج زكاة للاختبار', funder_name: 'نماء', funder_type: 'zakat', start_date: YEAR_START, budget: 500 }), 201).program;
    const r2 = await manager.post(`/api/programs/${other.id}/cases`, { case_id: civ.id });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.details.reason, 'already_linked');
    ok(await manager.post(`/api/programs/${other.id}/cases`, { case_id: civ.id, move: true }), 201, 'move');
    assert.equal(t.app.db.value('SELECT program_id FROM cases WHERE id = ?', civ.id), other.id);

    // من صفحة الملف: إلغاء الربط ثم إعادة الربط
    const un = ok(await manager.put(`/api/programs/case/${civ.id}`, { program_id: null }), 200);
    assert.equal(un.program, null);
    assert.equal((await manager.del(`/api/programs/${prog.id}/cases/${civ.id}`)).status, 404, 'not linked');
    const fc = ok(await manager.get(`/api/programs/case/${caseFam.id}`), 200);
    assert.equal(fc.program.code, prog.code);
    assert.deepEqual(fc.eligibility, []);

    // التحويل من الطلب الوارد مع اختيار البرنامج
    const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: uniquePhone(), name: 'مستفيدة جديدة', text: 'زوجي توفي وأريد معرفة نصيب أولادي القصر في الميراث' }), 201);
    const conv = ok(await manager.post(`/api/admin/intakes/${intake.id}/convert`, { legal_area: 'INH', title: 'ميراث قاصرين', issues: [], program_id: prog.id }), 201).case;
    assert.equal(t.app.db.value('SELECT program_id FROM cases WHERE id = ?', conv.id), prog.id);
    const act = t.app.db.get("SELECT * FROM activity WHERE case_id = ? AND type = 'program.linked'", conv.id);
    assert.ok(act, 'link is in the case timeline');

    // برنامج مغلق لا يقبل ملفات جديدة، ولا يُغلق إلا بقرار مدير النظام
    assert.equal((await manager.post(`/api/programs/${other.id}/close`, {})).status, 403);
    ok(await admin.post(`/api/programs/${other.id}/close`, { note: 'انتهت المنحة' }), 200);
    assert.equal((await manager.post(`/api/programs/${other.id}/cases`, { case_id: civ.id })).status, 409);
    const intake2 = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: uniquePhone(), name: 'مستفيد آخر', text: 'مشكلة في معاش الوالد المتوفى وصرفه للأبناء' }), 201);
    assert.equal((await manager.post(`/api/admin/intakes/${intake2.id}/convert`, { legal_area: 'LAB', title: 'معاش', issues: [], program_id: other.id })).status, 409, 'conversion rolls back');
    assert.equal(t.app.db.value('SELECT status FROM intakes WHERE id = ?', intake2.id) !== 'converted', true);
    ok(await admin.post(`/api/programs/${other.id}/reopen`), 200);
    // لا يُحذف برنامج مرتبط بملفات
    ok(await manager.post(`/api/programs/${other.id}/cases`, { case_id: civ.id }), 201);
    assert.equal((await admin.del(`/api/programs/${other.id}`)).status, 409);
  });

  test('spend = lawyer ledger (fees + reimbursements) + organisation-paid expenses within dates', async () => {
    const a = await assign(admin, caseFam.id, { lawyer_id: lawA.id, role: 'lead' });
    await submitAndApprove(admin, lawyerA, a.id);
    matter = ok(await admin.post(`/api/admin/cases/${caseFam.id}/matter`, { kind: 'litigation', title: 'دعوى نفقة', responsible_lawyer_id: lawA.id }), 201);
    ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'رسوم قيد الدعوى', amount: 300, paid_by: 'organization' }), 200);
    ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'صور رسمية', amount: 150, paid_by: 'lawyer', lawyer_id: lawA.id }), 200);
    ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'دفعها العميل', amount: 999, paid_by: 'client' }), 200);
    // قيد قديم خارج مدة البرنامج لا يُحتسب
    t.app.db.run(
      "INSERT INTO ledger_entries (lawyer_id, kind, amount_minor, case_id, period, description, status, created_at) VALUES (?, 'adjustment', 77700, ?, ?, 'قيد قديم', 'accrued', ?)",
      lawA.id,
      caseFam.id,
      `${thisYear - 1}-06`,
      `${thisYear - 1}-06-15T10:00:00.000Z`,
    );

    const d = ok(await manager.get(`/api/programs/${prog.id}`), 200);
    assert.equal(d.stats.by_category.lawyer_fees, 500);
    assert.equal(d.stats.by_category.reimbursements, 150);
    assert.equal(d.stats.by_category.expenses, 300);
    assert.equal(d.stats.spend, 950);
    assert.equal(d.stats.remaining, 50);
    assert.ok(Math.abs(d.stats.utilization - 0.95) < 1e-9);
    assert.ok(d.stats.families >= 2);
    assert.ok(d.spend.monthly.length >= 1);
    const famRow = d.cases.find((c) => c.id === caseFam.id);
    assert.equal(famRow.spend, 950);

    // القيد الملغى لا يُحتسب
    const fee = t.app.db.get("SELECT id FROM ledger_entries WHERE case_id = ? AND kind = 'fee'", caseFam.id);
    ok(await admin.post(`/api/admin/accounting/entries/${fee.id}/void`, { note: 'اختبار' }), 200);
    assert.equal(ok(await manager.get(`/api/programs/${prog.id}`), 200).stats.spend, 450);
    t.app.db.run("UPDATE ledger_entries SET status = 'accrued' WHERE id = ?", fee.id);
  });

  test('budget alerts fire once per threshold (80% then 100%) and re-arm when the budget changes', async () => {
    const before = (await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`);
    // ربط الملفات وتعديل البرنامج يشغلان الفحص فورًا؛ هنا نشغل المهمة الدورية نفسها
    await t.app.jobs.runDue({ force: true, only: 'programs.budget_alerts' });
    let mine = (await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`);
    assert.equal(mine.length, before.length + (before.length ? 0 : 1), '80% alert exactly once');
    assert.ok(mine.some((n) => n.title.includes('80%')));
    await t.app.jobs.runDue({ force: true, only: 'programs.budget_alerts' });
    t.app.programs.checkBudget(prog.id);
    assert.equal((await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`).length, mine.length, 'no duplicate');

    ok(await admin.post(`/api/admin/matters/${matter.id}/expenses`, { description: 'أتعاب خبير', amount: 100, paid_by: 'organization' }), 200);
    t.app.programs.checkBudget();
    mine = (await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`);
    assert.ok(mine.some((n) => n.title.includes('استُنفدت')), '100% alert');
    const count100 = mine.length;
    t.app.programs.checkBudget();
    assert.equal((await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`).length, count100);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM program_alerts WHERE program_id = ?', prog.id), 2);

    // زيادة الميزانية: لا تنبيه تحت العتبة، ثم تنبيه جديد عند 80% من الميزانية الجديدة
    ok(await admin.patch(`/api/programs/${prog.id}`, { budget: 4000 }), 200);
    assert.equal((await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`).length, count100);
    ok(await admin.patch(`/api/programs/${prog.id}`, { budget: 1200 }), 200);
    assert.equal((await programmeNotifications(manager)).filter((n) => n.link === `#/programs/${prog.id}`).length, count100 + 1);
    // الإشعار للإدارة فقط
    assert.equal((await programmeNotifications(lawyerA)).length, 0);
  });

  test('receipt numbering: assigned at payment creation, unique, stable, backfilled', async () => {
    invoice = ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'رسوم إدارية رمزية', amount: 600, due_at: new Date(Date.now() + 86400000).toISOString() }), 200);
    ok(await admin.post(`/api/admin/invoices/${invoice.id}/payments`, { amount: 200, method: 'نقدًا' }), 200);
    ok(await admin.post(`/api/admin/invoices/${invoice.id}/payments`, { amount: 150, method: 'تحويل بنكي', reference: 'TRX-1' }), 200);
    const pays = t.app.db.all('SELECT id, receipt_number FROM payments WHERE invoice_id = ? ORDER BY id', invoice.id);
    assert.equal(pays.length, 2);
    for (const p of pays) assert.match(p.receipt_number, new RegExp(`^RCPT-${thisYear}-\\d{5}$`));
    assert.notEqual(pays[0].receipt_number, pays[1].receipt_number);

    const r1 = ok(await admin.get(`/api/print/receipt/${pays[0].id}`), 200);
    const r2 = ok(await manager.get(`/api/print/receipt/${pays[0].id}`), 200);
    assert.equal(r1.number, pays[0].receipt_number);
    assert.equal(r2.number, r1.number, 'stable across prints');
    assert.equal(r1.document.receipt.amount, 200);
    assert.equal(r1.document.receipt.amount_words, 'فقط مائتا جنيه مصري لا غير');
    assert.equal(r1.document.invoice.balance_after, 400);
    const second = ok(await admin.get(`/api/print/receipt/${pays[1].id}`), 200);
    assert.equal(second.document.invoice.balance_after, 250);

    // دفعة قديمة بلا رقم ← الترقيم الاستدراكي يمنحها رقمًا فريدًا مرة واحدة
    t.app.db.run('UPDATE payments SET receipt_number = NULL WHERE id = ?', pays[1].id);
    assert.equal(t.app.programs.backfillReceipts(), 1);
    const fresh = t.app.db.value('SELECT receipt_number FROM payments WHERE id = ?', pays[1].id);
    assert.match(fresh, /^RCPT-/);
    assert.notEqual(fresh, pays[0].receipt_number);
    assert.equal(t.app.programs.backfillReceipts(), 0);
    const all = t.app.db.all('SELECT receipt_number FROM payments').map((r) => r.receipt_number);
    assert.equal(new Set(all).size, all.length, 'unique');
    // الفهرس الفريد يمنع التكرار على مستوى قاعدة البيانات
    assert.throws(() => t.app.db.run('UPDATE payments SET receipt_number = ? WHERE id = ?', pays[0].receipt_number, pays[1].id));
  });

  test('print endpoints enforce the same permissions as the data', async () => {
    // غير مسجل
    assert.equal((await t.client().get(`/api/print/invoice/${invoice.id}`)).status, 401);
    // نوع غير معروف
    assert.equal((await admin.get(`/api/print/passport/${invoice.id}`)).status, 404);

    // الفاتورة
    const inv = ok(await manager.get(`/api/print/invoice/${invoice.id}`), 200);
    assert.equal(inv.number, invoice.number);
    assert.equal(inv.document.invoice.amount, 600);
    assert.equal(inv.document.invoice.paid, 350);
    assert.equal(inv.document.payments.length, 2);
    assert.ok(inv.letterhead.org_legal_name);
    assert.equal((await lawyerA.get(`/api/print/invoice/${invoice.id}`)).status, 404, 'lawyer cannot print invoices');
    assert.equal((await lawyerA.get(`/api/print/receipt/${t.app.db.value('SELECT id FROM payments LIMIT 1')}`)).status, 404);

    // الإفادة القانونية الموجهة للعميل
    const op = t.app.db.get("SELECT id, body FROM opinions WHERE case_id = ? AND status = 'approved'", caseFam.id);
    const answerText = 'تحية طيبة، بعد دراسة ما عرضتموه نفيدكم بأن لكم الحق في المطالبة بنفقة الصغار المتجمدة أمام محكمة الأسرة المختصة.';
    const ans = ok(await admin.post(`/api/admin/cases/${caseFam.id}/client-answers`, { opinion_id: op.id, body: answerText }), 200);
    const draft = ok(await admin.get(`/api/print/answer/${ans.id}`), 200);
    assert.equal(draft.document.is_draft, true);
    ok(await admin.post(`/api/admin/client-answers/${ans.id}/send`, {}), 200);
    const letter = ok(await manager.get(`/api/print/answer/${ans.id}`), 200);
    assert.equal(letter.title, 'إفادة قانونية');
    assert.equal(letter.document.is_draft, false);
    assert.equal(letter.document.body, answerText);
    assert.equal(letter.document.case.code, caseFam.code);
    assert.equal(letter.number, `${caseFam.code}/1`);
    assert.equal(letter.document.recipient.name, 'أرملة الاختبار');
    const s = JSON.stringify(letter);
    assert.ok(!s.includes('محامية البرنامج'), 'answer is signed by the organisation, never by a lawyer');
    assert.ok(!s.includes(caseFam.phone.slice(-6)), 'no client phone');
    assert.equal((await lawyerA.get(`/api/print/answer/${ans.id}`)).status, 404, 'lawyer cannot print answers even on own case');

    // ملخص الملف الداخلي
    const sum = ok(await manager.get(`/api/print/case-summary/${caseFam.id}`), 200);
    assert.equal(sum.number, caseFam.code);
    assert.ok(sum.document.team.some((m) => m.lawyer_name.includes('محامية البرنامج')));
    assert.ok(sum.document.issues.length >= 1);
    assert.equal(sum.document.program.code, prog.code);
    assert.equal((await lawyerA.get(`/api/print/case-summary/${caseFam.id}`)).status, 404);

    // تقرير البرنامج للجهة الممولة: بلا أسماء مستفيدين
    const rep = ok(await manager.get(`/api/print/programme/${prog.id}`), 200);
    assert.equal(rep.document.program.code, prog.code);
    assert.ok(rep.document.cases.some((c) => c.code === caseFam.code));
    assert.ok(!JSON.stringify(rep).includes('أرملة الاختبار'), 'funder report has no beneficiary names');
    assert.equal(rep.document.stats.spend, 1050);
    assert.equal((await lawyerA.get(`/api/print/programme/${prog.id}`)).status, 404);

    // كشف حساب المحامي: لنفسه فقط، ومدير النظام لأي محامٍ
    const own = ok(await lawyerA.get(`/api/print/statement/${lawA.id}`), 200);
    assert.ok(own.document.lawyer.name.includes('محامية البرنامج'));
    const tt = own.document.totals;
    assert.equal(Math.round((tt.opening + tt.accrued - tt.paid) * 100), Math.round(tt.closing * 100));
    assert.ok(own.document.entries.some((e) => e.amount === 500));
    assert.equal((await lawyerB.get(`/api/print/statement/${lawA.id}`)).status, 404, 'lawyer cannot print another lawyer statement');
    assert.equal((await manager.get(`/api/print/statement/${lawA.id}`)).status, 403, 'case manager cannot print statements');
    const forAdmin = ok(await admin.get(`/api/print/statement/${lawA.id}?from=${thisYear}-01&to=${thisYear}-12`), 200);
    assert.equal(forAdmin.document.from, `${thisYear}-01`);
    // القيد القديم (السنة الماضية) يظهر في الرصيد الافتتاحي لا في القيود
    assert.equal(forAdmin.document.totals.opening, 777);
    assert.equal((await admin.get(`/api/print/statement/${lawA.id}?from=${thisYear}-05&to=${thisYear}-02`)).status, 400);
    assert.equal((await admin.get(`/api/print/statement/${lawA.id}?from=bad`)).status, 400);
    assert.equal((await admin.get(`/api/print/statement/${admin.user.id}`)).status, 404, 'not a lawyer');

    // كل طباعة تُسجل في سجل الأمان
    assert.ok(Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'print.document'")) >= 8);
  });

  test('recovered value from the practice lane (if present) appears in the programme impact', async () => {
    const cols = t.app.db.all('PRAGMA table_info(cases)').map((r) => r.name);
    if (!cols.includes('recovered_monthly_minor')) {
      const d = ok(await manager.get(`/api/programs/${prog.id}`), 200);
      assert.equal(d.impact.external, null);
      return;
    }
    t.app.db.run("UPDATE cases SET outcome_kind = 'alimony_judgment', recovered_one_time_minor = 600000, recovered_monthly_minor = 150000 WHERE id = ?", caseFam.id);
    const d = ok(await manager.get(`/api/programs/${prog.id}`), 200);
    assert.equal(d.impact.external.totals.one_time, 6000);
    assert.equal(d.impact.external.totals.monthly, 1500);
    assert.equal(d.impact.external.totals.annualized, 24000);
    const rep = ok(await manager.get(`/api/print/programme/${prog.id}`), 200);
    assert.ok(rep.document.impact.external.items.length >= 4);
  });

  test('programme list totals and options for pickers', async () => {
    const list = ok(await manager.get('/api/programs', { }), 200);
    assert.ok(list.totals.budget > 0);
    assert.ok(list.totals.cases >= 3);
    const opts = ok(await manager.get('/api/programs/options'), 200);
    assert.ok(opts.every((o) => o.status !== 'closed'));
    assert.ok(opts.some((o) => o.id === prog.id && o.utilization > 0));
    const filtered = ok(await manager.get('/api/programs?funder_type=zakat'), 200);
    assert.ok(filtered.items.every((p) => p.funder_type === 'zakat'));
  });
});

// ───────────── مراجعة ما قبل الإطلاق: إصلاحات وحالات حدية ─────────────
describe('v9 programs — review fixes (closed programmes, receipts, totals, settings, audit, live alerts)', () => {
  let t;
  let admin;
  let manager;
  let lawA;
  let lawB;
  let lawyerA;
  let lawyerB;

  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'rmgr', name: 'مدير حالات المراجعة', password: 'Manager@2026' }), 201, 'create manager');
    manager = await t.login('rmgr', 'Manager@2026');
    lawA = await createLawyer(admin, { name: 'محامية المراجعة', specialties: ['FAM'], agreement: { type: 'per_case', rate: 500 } });
    lawB = await createLawyer(admin, { name: 'محامي المراجعة الثاني', specialties: ['CIV'], agreement: { type: 'per_case', rate: 300 } });
    lawyerA = await t.login(lawA.username);
    lawyerB = await t.login(lawB.username);
  });
  after(async () => {
    await t?.close();
  });

  const programme = async (extra = {}) =>
    ok(await admin.post('/api/programs', { name: 'برنامج اختبار المراجعة', funder_name: 'جهة اختبار', funder_type: 'grant', start_date: YEAR_START, end_date: YEAR_END, budget: 10000, ...extra }), 201, 'create programme').program;

  test('a closed programme is a frozen record: its cases cannot be unlinked or moved until it is reopened', async () => {
    const p1 = await programme({ name: 'منحة مغلقة للاختبار' });
    const p2 = await programme({ name: 'منحة أخرى مفتوحة' });
    const c = await newCase(admin, { legal_area: 'FAM', title: 'نفقة أطفال' });
    ok(await manager.post(`/api/programs/${p1.id}/cases`, { case_id: c.id }), 201, 'link');
    ok(await admin.post(`/api/programs/${p1.id}/close`, { note: 'قُدم التقرير الختامي' }), 200, 'close');

    const del = await manager.del(`/api/programs/${p1.id}/cases/${c.id}`);
    assert.equal(del.status, 409, 'cannot unlink from a closed programme');
    assert.equal(del.body.details.reason, 'current_program_closed');
    assert.equal((await manager.put(`/api/programs/case/${c.id}`, { program_id: null })).status, 409, 'cannot unlink from the case page');
    const mv = await manager.post(`/api/programs/${p2.id}/cases`, { case_id: c.id, move: true, confirm_ineligible: true });
    assert.equal(mv.status, 409, 'cannot move out of a closed programme');
    assert.equal(mv.body.details.reason, 'current_program_closed');
    assert.equal((await manager.put(`/api/programs/case/${c.id}`, { program_id: p2.id, confirm_ineligible: true })).status, 409);
    // إعادة إرسال نفس البرنامج لا تُعد تغييرًا
    assert.equal(ok(await manager.put(`/api/programs/case/${c.id}`, { program_id: p1.id }), 200).program.id, p1.id);
    assert.equal(t.app.db.value('SELECT program_id FROM cases WHERE id = ?', c.id), p1.id);

    ok(await admin.post(`/api/programs/${p1.id}/reopen`), 200, 'reopen');
    ok(await manager.del(`/api/programs/${p1.id}/cases/${c.id}`), 200, 'unlink after reopening');
    assert.equal(t.app.db.value('SELECT program_id FROM cases WHERE id = ?', c.id), null);
  });

  test('receipts: paid-to-date follows payment dates; a lazily numbered receipt uses the year it was recorded', async () => {
    const c = await newCase(admin, { legal_area: 'FAM', title: 'دعوى حضانة' });
    const a = await assign(admin, c.id, { lawyer_id: lawA.id, role: 'lead' });
    await submitAndApprove(admin, lawyerA, a.id);
    const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', title: 'دعوى ضم حضانة', responsible_lawyer_id: lawA.id }), 201, 'matter');
    const inv = ok(await admin.post(`/api/admin/matters/${m.id}/invoices`, { description: 'رسوم إدارية', amount: 1000, due_at: new Date(Date.now() + 86400000).toISOString() }), 200, 'invoice');
    // الدفعة الثانية سُجلت لاحقًا لكنها مؤرخة قبل الأولى
    ok(await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 300, method: 'نقدًا', paid_at: new Date().toISOString() }), 200);
    ok(await admin.post(`/api/admin/invoices/${inv.id}/payments`, { amount: 200, method: 'تحويل بنكي', paid_at: new Date(Date.now() - 10 * 86400000).toISOString() }), 200);
    const [later, earlier] = t.app.db.all('SELECT id FROM payments WHERE invoice_id = ? ORDER BY id', inv.id);
    const rEarlier = ok(await admin.get(`/api/print/receipt/${earlier.id}`), 200).document;
    assert.equal(rEarlier.invoice.paid_to_date, 200, 'the earlier-dated payment counts only itself');
    assert.equal(rEarlier.invoice.balance_after, 800);
    const rLater = ok(await admin.get(`/api/print/receipt/${later.id}`), 200).document;
    assert.equal(rLater.invoice.paid_to_date, 500);
    assert.equal(rLater.invoice.balance_after, 500);
    assert.equal(ok(await admin.get(`/api/print/receipt/${later.id}`), 200).title, 'إيصال استلام');

    // دفعة قديمة من السنة الماضية بلا رقم ← رقمها بسنة تسجيلها لا بسنة الطباعة
    t.app.db.run('UPDATE payments SET receipt_number = NULL, created_at = ? WHERE id = ?', `${thisYear - 1}-11-20T09:00:00.000Z`, earlier.id);
    const printed = ok(await manager.get(`/api/print/receipt/${earlier.id}`), 200);
    assert.match(printed.number, new RegExp(`^RCPT-${thisYear - 1}-\\d{5}$`));
    assert.equal(ok(await admin.get(`/api/print/receipt/${earlier.id}`), 200).number, printed.number, 'stable after first print');
  });

  test('list totals follow the active filter; search treats % and _ literally', async () => {
    const z = await programme({ name: 'زكاة للمراجعة', funder_type: 'zakat', budget: 2000 });
    const g = await programme({ name: 'منحة للمراجعة', funder_type: 'grant', budget: 3000 });
    const c1 = await newCase(admin, { legal_area: 'INH', title: 'ميراث 1' });
    const c2 = await newCase(admin, { legal_area: 'INH', title: 'ميراث 2' });
    ok(await manager.post(`/api/programs/${z.id}/cases`, { case_id: c1.id }), 201);
    ok(await manager.post(`/api/programs/${g.id}/cases`, { case_id: c2.id }), 201);

    const zl = ok(await manager.get('/api/programs?funder_type=zakat'), 200);
    const zIds = zl.items.map((x) => x.id);
    const expectFamilies = Number(t.app.db.value(`SELECT COUNT(DISTINCT client_id) FROM cases WHERE program_id IN (${zIds.join(',')})`));
    assert.equal(zl.totals.families, expectFamilies, 'families only from the listed programmes');
    assert.equal(zl.totals.budget, zl.items.reduce((s, x) => s + x.stats.budget, 0));
    assert.equal(zl.totals.cases, zl.items.reduce((s, x) => s + x.stats.cases, 0));

    ok(await admin.post(`/api/programs/${g.id}/close`, {}), 200);
    const closed = ok(await manager.get('/api/programs?status=closed'), 200);
    assert.ok(closed.items.some((x) => x.id === g.id));
    assert.ok(closed.totals.budget >= 3000, 'totals are not zeroed when listing closed programmes');

    assert.equal(ok(await manager.get('/api/programs?status=all&q=%25'), 200).items.length, 0, '% is not a wildcard');
    assert.equal(ok(await manager.get('/api/programs?status=all&q=_'), 200).items.length, 0, '_ is not a wildcard');
    assert.ok(ok(await manager.get(`/api/programs?status=all&q=${encodeURIComponent('زكاة للمراجعة')}`), 200).items.some((x) => x.id === z.id));
  });

  test('alert thresholds and print notes: admin-only settings endpoint with strict validation', async () => {
    assert.equal((await manager.get('/api/programs/settings')).status, 403);
    assert.equal((await lawyerA.get('/api/programs/settings')).status, 403);
    assert.equal((await manager.put('/api/programs/settings', { program_alert_thresholds: [50] })).status, 403);
    const cur = ok(await admin.get('/api/programs/settings'), 200);
    assert.deepEqual(cur.program_alert_thresholds, [80, 100]);
    assert.ok(cur.print_answer_disclaimer.length > 10);

    for (const bad of [[], [0], [80, 80], [10, 20, 30, 40, 50, 60], ['abc'], [250], 'x', [12.5]]) {
      assert.equal((await admin.put('/api/programs/settings', { program_alert_thresholds: bad })).status, 400, `reject ${JSON.stringify(bad)}`);
    }
    assert.equal((await admin.put('/api/programs/settings', { print_invoice_note: 'x'.repeat(501) })).status, 400);

    // برنامج تجاوز 50% ولم يبلغ 80%: بعد خفض العتبة يصل تنبيه فورًا
    const p = await programme({ name: 'برنامج العتبات', budget: 100 });
    const c = await newCase(admin, { legal_area: 'FAM', title: 'عتبات' });
    ok(await manager.post(`/api/programs/${p.id}/cases`, { case_id: c.id }), 201);
    const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', title: 'دعوى' }), 201);
    ok(await admin.post(`/api/admin/matters/${m.id}/expenses`, { description: 'رسوم', amount: 60, paid_by: 'organization' }), 200);
    assert.equal(t.app.programs.checkBudget(p.id).length, 0, 'no alert at 60% with 80/100');

    const saved = ok(await admin.put('/api/programs/settings', { program_alert_thresholds: [100, 50], print_invoice_note: 'ملاحظة مخصصة للفواتير' }), 200);
    assert.deepEqual(saved.program_alert_thresholds, [50, 100]);
    assert.deepEqual(t.app.programs.thresholds(), [50, 100]);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM program_alerts WHERE program_id = ? AND threshold = 50', p.id), 1, 'new threshold applied immediately');
    const audit = t.app.db.get("SELECT * FROM security_events WHERE type = 'settings.updated' ORDER BY id DESC");
    assert.ok(audit.summary.includes('عتبات تنبيه الميزانية'));
    const inv = ok(await admin.post(`/api/admin/matters/${m.id}/invoices`, { description: 'رسوم', amount: 10, due_at: new Date(Date.now() + 86400000).toISOString() }), 200);
    assert.equal(ok(await admin.get(`/api/print/invoice/${inv.id}`), 200).document.note, 'ملاحظة مخصصة للفواتير');
    ok(await admin.put('/api/programs/settings', { program_alert_thresholds: [80, 100] }), 200);
  });

  test('denied print attempts are written to the security log as warnings', async () => {
    const before = Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'print.denied'"));
    const payId = t.app.db.value('SELECT id FROM payments LIMIT 1');
    assert.equal((await lawyerA.get(`/api/print/receipt/${payId}`)).status, 404);
    assert.equal((await lawyerB.get(`/api/print/statement/${lawA.id}`)).status, 404);
    assert.equal((await manager.get(`/api/print/statement/${lawA.id}`)).status, 403);
    const rows = t.app.db.all("SELECT * FROM security_events WHERE type = 'print.denied' ORDER BY id").slice(before);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.severity === 'warning'));
    assert.deepEqual(rows.map((r) => r.user_id), [lawA.id, lawB.id, manager.user.id]);
    // الطباعة المسموح بها لا تُسجل «مرفوضة»
    ok(await lawyerA.get(`/api/print/statement/${lawA.id}`), 200);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'print.denied'")), before + 3);
  });

  test('approving a lawyer opinion on a programme case checks the budget immediately (no wait for the hourly job)', async () => {
    const p = await programme({ name: 'منحة صغيرة', budget: 400, eligible_areas: [] });
    const c = await newCase(admin, { legal_area: 'FAM', title: 'نفقة عاجلة' });
    ok(await manager.post(`/api/programs/${p.id}/cases`, { case_id: c.id }), 201);
    const a = await assign(admin, c.id, { lawyer_id: lawA.id, role: 'lead' });
    await submitAndApprove(admin, lawyerA, a.id); // قيد أتعاب 500 ج.م > الميزانية 400
    let found = 0;
    for (let i = 0; i < 20 && !found; i++) {
      await new Promise((r) => setImmediate(r));
      found = Number(t.app.db.value('SELECT COUNT(*) FROM program_alerts WHERE program_id = ? AND threshold = 100', p.id));
    }
    assert.equal(found, 1, '100% alert recorded right after approval');
    const notes = (ok(await manager.get('/api/notifications?limit=200'), 200).items || []).filter((n) => n.type === 'program.budget' && n.link === `#/programs/${p.id}`);
    assert.equal(notes.length, 1, 'one notification (the highest threshold crossed)');
    assert.ok(notes[0].title.includes('استُنفدت'));
  });

  test('security event labels exist for every programme/print audit type', async () => {
    const { LABELS } = await import('../src/constants.js');
    for (const k of ['program.created', 'program.updated', 'program.closed', 'program.reopened', 'program.deleted', 'print.document', 'print.denied']) {
      assert.ok(LABELS.security_event[k], `label for ${k}`);
    }
    assert.equal(LABELS.print_kind.receipt, 'إيصال استلام');
  });
});
