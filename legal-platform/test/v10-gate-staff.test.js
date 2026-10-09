// v10 integration gate — staff-area fixes (G-10): quote-approved accepts (K1/J-01), redactor false positives (K2/J-04),
// company shareInfo follow-ups (K3), lawyer-name gates (G7-01/G7-04/K4), document gate on images/text/memory (G7-02),
// reviewer visibility (J-07), prefill sections (J-06), deliverable drafts (J-12), staff desk data (K5), copy and CSS checks.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp, Client } from './helpers.js';
import { seedB2bDemo, COMPANY_DEMO_PASSWORD } from '../src/seed-v10-b2b.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PW = COMPANY_DEMO_PASSWORD;

class CompanyClient extends Client {
  async request(method, url, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
    } else if (method !== 'GET' && method !== 'HEAD') {
      payload = '{}';
      h['content-type'] = 'application/json';
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /bm_csid=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `bm_csid=${m[1]}` : '';
    }
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
  }
  async login(email, password = PW) {
    const r = await this.post('/api/company/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  }
}
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};

/** بيانات الشركات التجريبية + مدير حالات + محامو الشركات (مثل رحلة اختبارات الخادم) */
async function gateApp(config = {}) {
  const t = await startTestApp({ seed: 'none', config });
  await seedB2bDemo(t.app);
  t.app.lawyers.createStaff({ role: 'case_manager', username: 'manager', name: 'منى السيد', password: 'Manager@2026' });
  const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
  const mk = (username, name, latin, specialties = ['COM', 'LAB'], skills = null) => {
    t.app.lawyers.create({ username, name, password: 'Lawyer@2026', title: 'أ.', specialties, capacity: 8, agreement: { type: 'per_case', rate: 900 } }, admin);
    const id = t.app.db.value('SELECT id FROM users WHERE username = ?', username);
    t.app.db.run('UPDATE lawyers SET name_latin = ? WHERE user_id = ?', latin, id);
    if (skills) t.app.db.run('UPDATE lawyers SET skills = ? WHERE user_id = ?', JSON.stringify(skills), id);
    return id;
  };
  t.lawyers = {
    tarek: mk('tarek', 'طارق النجار', 'Tarek El-Naggar', ['COM', 'LAB'], ['contracts', 'commercial_disputes']),
    amr: mk('amr', 'عمرو الشافعي', 'Amr El-Shafei', ['COM', 'CIV'], ['contracts']),
    yasmine: mk('yasmine', 'ياسمين خليل', 'Yasmine Khalil', ['COM', 'LAB'], ['employment']),
  };
  t.company = () => new CompanyClient(t.base);
  t.nfdEntity = t.app.db.value("SELECT id FROM company_entities WHERE company_id = (SELECT id FROM companies WHERE prefix = 'NFD') ORDER BY id LIMIT 1");
  t.req = (code) => t.app.db.get('SELECT * FROM company_requests WHERE code = ?', code);
  t.submit = async (client, body) => ok(await client.post('/api/company/requests', body), 201).request.code;
  t.accept = async (staff, code, body = {}) => {
    const r = t.req(code);
    return staff.post(`/api/admin/company-requests/${r.id}/accept`, { rev: r.rev, brief_for_lawyer: 'ملخص كافٍ للمحامي عن المطلوب في هذا الطلب.', ...body });
  };
  t.quote = async (staff, code, body) => {
    const r = t.req(code);
    return ok(await staff.post(`/api/admin/company-requests/${r.id}/quote`, { rev: r.rev, basis: 'fixed', scope_of_work: 'نطاق العمل المتفق عليه في هذا العرض بالتفصيل.', ...body }), 201);
  };
  t.approve = async (client, code) => {
    const number = ok(await client.get(`/api/company/requests/${code}`)).quote.number;
    return ok(await client.post(`/api/company/requests/${code}/quotes/${number}/approve`, {}));
  };
  return t;
}

const dispute = (t, c, extra = {}) =>
  t.submit(c, { type: 'dispute', description: 'مورد امتنع عن تسليم أجهزة دفعنا ثمنها ونريد رفع دعوى', fields: { counterparty_name: 'مؤسسة الصعيد للتوزيع', dispute_kind: 'owed_to_us', stage: 'lawsuit_filed', desired_outcome: 'استرداد المبلغ', amount: 50000 }, ...extra });

// ───────────────────────── K1 / J-01: عرض سعر معتمد ← «بدء العمل» ─────────────────────────
describe('gate K1/J-01 — an approved quote decides the quota in every accept path', () => {
  let t;
  let sherif;
  let mariam;
  let staff;
  before(async () => {
    t = await gateApp();
    sherif = t.company();
    await sherif.login('sherif@techsol.example');
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    staff = await t.login('admin');
  });
  after(async () => t && t.close());

  const included = (prefix) => Number(t.app.db.value("SELECT COUNT(*) FROM company_requests r JOIN companies c ON c.id = r.company_id WHERE c.prefix = ? AND r.quota_kind = 'included'", prefix));

  test('out-of-scope quote approved with no start plan → staff accept 201, quota_kind out_of_scope, no included request used', async () => {
    const code = await dispute(t, sherif);
    assert.equal((await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } })).body.code, 'out_of_scope_requires_quote');
    await t.quote(staff, code, { kind: 'out_of_scope', amount: 12000 });
    await t.approve(sherif, code);
    const before = included('TSL');
    const r = t.req(code);
    assert.equal(r.quota_kind, 'out_of_scope');
    // الواجهة ترسل scope حسب فحص الباقة؛ حتى «in_scope» لا يحوّل الطلب إلى «مشمول»
    const res = await t.accept(staff, code, { scope: 'in_scope', assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const after = t.req(code);
    assert.equal(after.quota_kind, 'out_of_scope');
    assert.equal(after.scope, 'out_of_scope');
    assert.equal(after.quota_period, r.quota_period);
    assert.equal(included('TSL'), before, 'no included request consumed on top of the quote charge');
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_charges WHERE request_id = ?', after.id)), 1, 'only the quote charge');
  });

  test('plan_error path: start plan failed → manual «بدء العمل» keeps out_of_scope', async () => {
    const code = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'supplier_issue', description: 'مورد تأخر في التسليم ونحتاج خطابًا وتقييمًا للموقف', fields: { supplier_name: 'شركة المستقبل للتجارة', issue_kind: 'late_delivery' } });
    await t.quote(staff, code, { kind: 'out_of_scope', amount: 30000, accept_plan: { brief_for_lawyer: 'تقييم موقف تأخر المورد وإعداد خطاب.', assign: { lead: { lawyer_id: t.lawyers.yasmine } } } });
    t.app.db.run('UPDATE users SET active = 0 WHERE id = ?', t.lawyers.yasmine);
    try {
      await t.approve(mariam, code);
    } finally {
      t.app.db.run('UPDATE users SET active = 1 WHERE id = ?', t.lawyers.yasmine);
    }
    assert.ok(JSON.parse(t.req(code).flags || '[]').includes('plan_error'));
    const before = included('NFD');
    const res = await t.accept(staff, code, { scope: 'in_scope', assign: { lead: { lawyer_id: t.lawyers.tarek } } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(t.req(code).quota_kind, 'out_of_scope');
    assert.equal(t.req(code).scope, 'out_of_scope');
    assert.equal(included('NFD'), before);
  });

  test('a plan saved with an out-of-scope quote on an in-plan type stores scope out_of_scope', async () => {
    const code = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'supplier_issue', description: 'مورد سلّم بضاعة معيبة ونحتاج خطابًا ورأيًا قانونيًا', fields: { supplier_name: 'شركة الدلتا للتغليف', issue_kind: 'quality' } });
    await t.quote(staff, code, { kind: 'out_of_scope', amount: 20000, accept_plan: { scope: 'in_scope', brief_for_lawyer: 'خطاب للمورد ورأي في التعويض عن العيوب.', assign: { lead: { lawyer_id: t.lawyers.tarek } } } });
    const before = included('NFD');
    const a = await t.approve(mariam, code);
    assert.equal(a.request.status, 'in_progress');
    assert.equal(t.req(code).quota_kind, 'out_of_scope');
    assert.equal(t.req(code).scope, 'out_of_scope');
    assert.equal(included('NFD'), before);
  });

  test('overage quote approved with no plan → staff accept 201 as overage, no second overage charge', async () => {
    // استنفاد الطلبات المشمولة لتك سوليوشنز (سياسة approve)
    const co = t.app.db.get("SELECT * FROM companies WHERE prefix = 'TSL'");
    const sub = t.app.companyBilling.activeSubscription(co.id);
    const used = Number(t.app.companyBilling.quota(co).used);
    t.app.db.run('UPDATE company_subscriptions SET terms = ? WHERE id = ?', JSON.stringify({ ...sub.terms, included_requests: used, overage_policy: 'approve' }), sub.id);
    const code = await t.submit(sherif, { type: 'nda', description: 'اتفاقية عدم إفصاح مع شريك برمجي جديد قبل الاجتماع', fields: { counterparty_name: 'Orbit Software LLC', direction: 'mutual', purpose: 'تبادل معلومات فنية قبل شراكة' } });
    const blocked = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(blocked.body.code, 'overage_approval_required');
    await t.quote(staff, code, { kind: 'overage', amount: 3000 });
    await t.approve(sherif, code);
    const res = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = t.req(code);
    assert.equal(r.quota_kind, 'overage');
    assert.equal(r.scope, 'in_scope');
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_charges WHERE request_id = ?', r.id)), 1, 'only the approved quote charge');
  });
});

// ───────────────────────── K2 / J-03 / J-04 / K12c: المنقّي ─────────────────────────
describe('gate K2/J-03/J-04 — redactor false positives', () => {
  test('«ش.م.م.» / «ش.ذ.م.م.» endings are company forms, not the «م.» title; a title never swallows the next line', async () => {
    const { redact } = await import('../src/ai/redact.js');
    const names = ['مريم عادل', 'حسام الدين فوزي', 'دينا سمير'];
    for (const s of [
      'الطرف الأول: النيل للأغذية ش.م.م.\nالطرف الآخر: شركة الدلتا للتغليف',
      'النيل للأغذية ش.م.م. الطرف الآخر',
      'شركة ش.م.م.\nالمطلوب مراجعة العقد',
      'شركة ش.ذ.م.م. المطلوب مراجعته',
      'المهندس\nالطرف الآخر: شركة',
    ]) {
      const out = redact(s, { names });
      assert.equal(out.text, s, s);
      assert.equal(out.counts.names || 0, 0, s);
    }
    // the title rule still works on a real title + name on the same line
    assert.equal(redact('تواصل مع م. أحمد سعيد بخصوص الموقع').text, 'تواصل مع م. [اسم] بخصوص الموقع');
    assert.equal(redact('أخويا محمود عنده المستندات').text, 'أخويا [اسم] عنده المستندات');
  });

  test('a lone first name never matches behind an attached preposition: «لدينا» stays, «ودينا»/full names still redacted', async () => {
    const { redact } = await import('../src/ai/redact.js');
    const names = ['مريم عادل', 'دينا سمير'];
    assert.equal(redact('غير متوفر لدينا: محضر التحقيق الإداري مع الموظف', { names }).text, 'غير متوفر لدينا: محضر التحقيق الإداري مع الموظف');
    assert.equal(redact('لدينا عقد توريد', { names }).text, 'لدينا عقد توريد');
    assert.equal(redact('أرسلت دينا الملف ومريم وافقت', { names }).text, 'أرسلت [اسم] الملف و[اسم] وافقت');
    assert.equal(redact('أرسلنا لمريم عادل النسخة', { names }).text, 'أرسلنا ل[اسم] النسخة');
    // B2C v9.1 behaviour kept: «يوسف ومريم»
    assert.ok(!/يوسف|مريم/.test(redact('القسمة بين يوسف ومريم: يوسف ياخد الضعف ومريم تاخد النص', { names: ['يوسف', 'مريم'] }).text));
  });

  test('strictPhones (company files): invoice numbers stay, phone-shaped numbers go', async () => {
    const { redact } = await import('../src/ai/redact.js');
    assert.equal(redact('مراجعة فاتورة رقم 20261234567', { strictPhones: true }).text, 'مراجعة فاتورة رقم 20261234567');
    assert.equal(redact('مراجعة فاتورة رقم 20261234567').text, 'مراجعة فاتورة رقم [رقم هاتف]', 'B2C default unchanged');
    for (const p of ['01001234567', '+201001234567', '00201001234567', '201001234567', '0223456789']) assert.equal(redact(`اتصل على ${p}`, { strictPhones: true }).text, 'اتصل على [رقم هاتف]', p);
  });

  test('accept sheet pre-check mirrors the server: «لدينا» is not «دينا»', async () => {
    const { companyPeopleIn } = await import('../public/assets/js/app/components/company-accept-sheet.js');
    const people = [{ name: 'دينا سمير' }, { name: 'مريم عادل' }];
    assert.deepEqual(companyPeopleIn('غير متوفر لدينا حاليًا', people), []);
    assert.deepEqual(companyPeopleIn('أرسلت دينا الملف', people), ['دينا']);
    assert.deepEqual(companyPeopleIn('أرسلنا لمريم عادل النسخة', people), ['مريم عادل']);
  });
});

describe('gate K2/J-03 — accept on a «ش.م.م.» brief: no false warning, nothing eaten', () => {
  let t;
  before(async () => {
    t = await gateApp();
  });
  after(async () => t && t.close());

  test('brief with legal forms and «لدينا» passes intact; a real employee name still warns', async () => {
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const staff = await t.login('admin');
    const code = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'nda', description: 'اتفاقية عدم إفصاح مع شريك جديد قبل بدء التفاوض', fields: { counterparty_name: 'Orbit Software LLC', direction: 'mutual', purpose: 'تبادل معلومات فنية' } });
    const brief = 'الكيان المعني: النيل للأغذية ش.م.م.\nالطرف الآخر: Orbit Software LLC.\nلدينا نموذج سرية معتمد.';
    const res = ok(await t.accept(staff, code, { brief_for_lawyer: brief, case_title: 'مراجعة فاتورة رقم 20261234567', assign: { lead: { lawyer_id: t.lawyers.tarek } } }), 201);
    assert.ok(!res.warnings.some((w) => /موظفي الشركة/.test(w)), JSON.stringify(res.warnings));
    const c = t.app.db.get('SELECT * FROM cases WHERE id = ?', res.case.id);
    assert.equal(c.facts_shared, brief);
    assert.equal(c.title, 'مراجعة فاتورة رقم 20261234567');
    const code2 = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'nda', description: 'اتفاقية عدم إفصاح ثانية مع شريك آخر قبل التفاوض', fields: { counterparty_name: 'Nova Labs', direction: 'mutual', purpose: 'تبادل معلومات' } });
    const res2 = ok(await t.accept(staff, code2, { brief_for_lawyer: 'أرسلت مريم عادل نسخة العقد وتطلب مراجعته سريعًا.', assign: { lead: { lawyer_id: t.lawyers.tarek } } }), 201);
    assert.ok(res2.warnings.some((w) => /موظفي الشركة/.test(w)));
    assert.ok(!t.app.db.value('SELECT facts_shared FROM cases WHERE id = ?', res2.case.id).includes('مريم'));
  });
});

// ───────────────────────── رحلة الفريق: القبول ← الرأي ← التسليم (J-06, J-07, J-12, J-23, G7-01, G7-02, K4, K5) ─────────────────────────
const pdfBuf = (author = null) => Buffer.from(`%PDF-1.4\n1 0 obj\n<<${author ? ` /Author (${author})` : ''} /Producer (x)>>\nendobj\n%%EOF\n`, 'latin1');
/** JPEG صغير يحمل EXIF Artist (ASCII) و XPAuthor (UTF-16LE) */
const jpegWithArtist = (artist) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40]),
    Buffer.from('Exif\0\0II*\0\x08\0\0\0', 'latin1'),
    Buffer.from(`${artist}\0`, 'latin1'),
    Buffer.from(`${artist}\0`, 'utf16le'),
    Buffer.alloc(64, 0x11),
    Buffer.from([0xff, 0xd9]),
  ]);
const file64 = (name, mime, buf) => ({ filename: name, name, mime, data_base64: buf.toString('base64') });

describe('gate staff journey — accept, reviewer, opinion prefill, deliverable gates', () => {
  let t;
  let mariam;
  let staff;
  let manager;
  let code;
  let rid;
  let caseId;
  let leadA;
  let revA;
  before(async () => {
    t = await gateApp();
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    staff = await t.login('admin');
    manager = await t.login('manager');
    // المراجع بلا تخصص «تجاري وشركات» حتى يظهر تنبيه التخصص باسمه (J-23)
    t.app.db.run('UPDATE lawyers SET specialties = ? WHERE user_id = ?', JSON.stringify(['CIV']), t.lawyers.amr);
    code = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'nda', description: 'اتفاقية عدم إفصاح مع شريك برمجي قبل بدء التفاوض على المشروع', fields: { counterparty_name: 'Orbit Software LLC', direction: 'mutual', purpose: 'تبادل معلومات فنية' } });
    rid = t.req(code).id;
    const res = ok(await t.accept(staff, code, { requires_senior_review: true, assign: { lead: { lawyer_id: t.lawyers.tarek }, reviewer: { lawyer_id: t.lawyers.amr } } }), 201);
    caseId = res.case.id;
    leadA = res.assignments.find((a) => a.role === 'lead').assignment_id;
    revA = res.assignments.find((a) => a.role === 'reviewer').assignment_id;
    t.acceptRes = res;
  });
  after(async () => t && t.close());

  test('J-23: the speciality warning names the lawyer and the role', () => {
    const w = t.acceptRes.warnings.find((x) => /تخصصات/.test(x));
    assert.ok(w, JSON.stringify(t.acceptRes.warnings));
    assert.match(w, /عمرو الشافعي/);
    assert.match(w, /\(.+\)/);
  });

  test('J-07: the reviewer is granted the lead opinion and sees it once submitted; the lead is not granted the reviewer opinion', async () => {
    const g = t.app.visibility.grantsPublic(revA);
    assert.deepEqual(g.opinion_assignment_ids, [leadA]);
    assert.deepEqual(t.app.visibility.grantsPublic(leadA).opinion_assignment_ids, []);
    const { companyOpinionSkeleton } = await import('../public/assets/js/app/pages/lawyer/write.js');
    const body = companyOpinionSkeleton([], 'nda')
      .replace('الخلاصة التنفيذية', 'الخلاصة التنفيذية\nالاتفاقية مقبولة بعد تعديلين بسيطين، والمخاطر محدودة.')
      .replace('المخاطر الرئيسية ودرجتها', 'المخاطر الرئيسية ودرجتها\nمنخفضة: تعريف المعلومات السرية واسع بما يكفي.')
      .replace('التوصيات', 'التوصيات\n- تقييد مدة السرية بسنتين\n- إضافة بند القانون الحاكم')
      .replace('التحليل القانوني', 'التحليل القانوني\nتحليل البنود الأساسية في الاتفاقية.');
    const tarek = await t.login('tarek');
    ok(await tarek.post(`/api/lawyer/assignments/${leadA}/open`, {}));
    ok(await tarek.put(`/api/lawyer/assignments/${leadA}/draft`, { body, client_steps: [] }));
    ok(await tarek.post(`/api/lawyer/assignments/${leadA}/submit`, {}));
    const amr = await t.login('amr');
    const view = ok(await amr.get(`/api/lawyer/assignments/${revA}`));
    const lead = (view.team || []).find((x) => x.assignment_id === leadA);
    assert.ok(lead && lead.opinion && /الخلاصة التنفيذية/.test(lead.opinion.body), JSON.stringify(view.team));
    const op = t.app.db.value("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", leadA);
    ok(await staff.post(`/api/admin/opinions/${op}/approve`, {}));
    t.opinionId = op;
    // المراجعة النهائية: يقدّم المراجع رأيه وتعتمده الإدارة (حتى تمر ضوابط الإرسال الأخرى في الاختبارات التالية)
    ok(await amr.post(`/api/lawyer/assignments/${revA}/open`, {}));
    ok(await amr.put(`/api/lawyer/assignments/${revA}/draft`, { body: 'راجعت رأي المحامي الأساسي وأوافق عليه مع تعديل صياغة بند المدة.', client_steps: [] }));
    ok(await amr.post(`/api/lawyer/assignments/${revA}/submit`, {}));
    ok(await staff.post(`/api/admin/opinions/${t.app.db.value("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", revA)}/approve`, {}));
  });

  test('J-06: «تعبئة من الرأي المعتمد» takes only the executive summary section of the company skeleton', async () => {
    const p = ok(await staff.post(`/api/admin/company-requests/${rid}/deliverables/prefill`, { opinion_id: t.opinionId }));
    assert.equal(p.summary, 'الاتفاقية مقبولة بعد تعديلين بسيطين، والمخاطر محدودة.');
    assert.deepEqual(p.recommendations, ['تقييد مدة السرية بسنتين', 'إضافة بند القانون الحاكم']);
  });

  test('K4/G7-04: precheck reports the text actually found (Latin, username, honorific + first name)', async () => {
    const d = ok(await staff.post(`/api/admin/company-requests/${rid}/deliverables`, { title: 'Memo by Tarek El-Naggar', summary: 'Reviewed by amr and the team before sending.', body: 'مع تحيات أ. طارق' }), 201);
    t.draftId = d.deliverable.id;
    const names = d.precheck.lawyer_names;
    assert.deepEqual(names.find((n) => n.field === 'title'), { field: 'title', name: 'طارق النجار', matched: 'Tarek El-Naggar' });
    assert.equal(names.find((n) => n.field === 'summary').matched, 'amr');
    assert.equal(names.find((n) => n.field === 'body').matched, 'أ. طارق');
    const rel = await staff.post(`/api/admin/company-deliverables/${t.draftId}/release`, {});
    assert.equal(rel.status, 409);
    assert.match(rel.body.error, /«Tarek El-Naggar» \(طارق النجار\)/);
  });

  test('J-12: a second «إعداد تسليم» while a draft is open → 409 with the open draft id', async () => {
    const again = await staff.post(`/api/admin/company-requests/${rid}/deliverables`, { title: 'تسليم آخر', summary: 'خلاصة أخرى كافية للطول.' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'deliverable_draft_open');
    assert.equal(again.body.details.deliverable_id, t.draftId);
  });

  test('G7-02: an image with EXIF Artist and a text file naming the lawyer are author hits (no release)', async () => {
    const upd = ok(await staff.patch(`/api/admin/company-deliverables/${t.draftId}`, { title: 'مراجعة اتفاقية السرية', summary: 'الاتفاقية مقبولة بعد تعديلين بسيطين.', body: '', files: [file64('scan.jpg', 'image/jpeg', jpegWithArtist('Tarek El-Naggar')), file64('notes.txt', 'text/plain', Buffer.from('Prepared by Tarek El-Naggar for the company.', 'utf8'))] }));
    const fa = upd.precheck.file_authors;
    assert.equal(fa.length, 2, JSON.stringify(upd.precheck));
    assert.deepEqual(fa.map((x) => x.source).sort(), ['image', 'text']);
    assert.ok(fa.every((x) => x.names.includes('Tarek El-Naggar')));
    const rel = await staff.post(`/api/admin/company-deliverables/${t.draftId}/release`, { docs_reviewed: true, override_reason: 'اختبار', allow_names: true });
    assert.equal(rel.status, 409);
    assert.equal(rel.body.code, 'file_author_names');
    // staff message with the same photo is refused too
    const msg = await staff.post(`/api/admin/company-requests/${rid}/messages`, { body: 'مرفق صورة المستند.', files: [file64('photo.jpg', 'image/jpeg', jpegWithArtist('Tarek El-Naggar'))], docs_reviewed: true });
    assert.equal(msg.status, 409);
    assert.equal(msg.body.code, 'file_author_names');
    // a clean image passes the scan
    const clean = ok(await staff.patch(`/api/admin/company-deliverables/${t.draftId}`, { document_ids: [], files: [file64('clean.jpg', 'image/jpeg', jpegWithArtist('Office Scanner'))] }));
    assert.deepEqual(clean.precheck.file_authors, []);
  });

  test('G7-01: the release message and every quote text pass the lawyer-name gate', async () => {
    const rel = await staff.post(`/api/admin/company-deliverables/${t.draftId}/release`, { docs_reviewed: true, message: 'أعد هذا التسليم الأستاذ طارق النجار (Tarek El-Naggar).' });
    assert.equal(rel.status, 409);
    assert.equal(rel.body.code, 'lawyer_names');
    assert.equal(t.app.db.value("SELECT status FROM company_deliverables WHERE id = ?", t.draftId), 'draft');
    assert.ok(!t.app.db.get("SELECT 1 FROM company_messages WHERE request_id = ? AND body LIKE '%طارق%'", rid));
    // quote: scope_of_work naming the planned lead
    const code2 = await dispute(t, mariam, { entity_id: t.nfdEntity });
    const r2 = t.req(code2);
    const q = await staff.post(`/api/admin/company-requests/${r2.id}/quote`, { rev: r2.rev, kind: 'out_of_scope', basis: 'fixed', amount: 9000, scope_of_work: 'يتولى المحامي عمرو الشافعي رفع الدعوى حتى الحكم.', accept_plan: { brief_for_lawyer: 'رفع دعوى استرداد ثمن الأجهزة.', assign: { lead: { lawyer_id: t.lawyers.amr } } } });
    assert.equal(q.status, 409);
    assert.equal(q.body.code, 'lawyer_names');
    const q2 = await staff.post(`/api/admin/company-requests/${r2.id}/quote`, { rev: r2.rev, kind: 'out_of_scope', basis: 'fixed', amount: 9000, scope_of_work: 'رفع دعوى استرداد حتى حكم أول درجة.', message: 'سيتولى الأستاذ عمرو الملف.', accept_plan: { brief_for_lawyer: 'رفع دعوى استرداد ثمن الأجهزة.', assign: { lead: { lawyer_id: t.lawyers.amr } } } });
    assert.equal(q2.status, 409);
  });

  test('K5: queue sla has a clock; detail carries the calendar and team memory_ids; GET memory-grants for the case manager', async () => {
    const q = ok(await manager.get('/api/admin/company-requests?status=all'));
    assert.ok(q.items.length && q.items.every((x) => ['business', 'calendar'].includes(x.sla.clock)), JSON.stringify(q.items.map((x) => x.sla)));
    const d = ok(await manager.get(`/api/admin/company-requests/${rid}`));
    assert.ok(d.calendar && d.calendar.business && Array.isArray(d.calendar.business.days));
    assert.ok(d.case.team.every((x) => Array.isArray(x.memory_ids)));
    const g = ok(await manager.get(`/api/admin/assignments/${leadA}/memory-grants`));
    assert.deepEqual(g.memory_ids, d.case.team.find((x) => x.assignment_id === leadA).memory_ids);
    const lawyer = await t.login('tarek');
    assert.equal((await lawyer.get(`/api/admin/assignments/${leadA}/memory-grants`)).status, 403);
  });

  test('K5: suggest-lawyers lists company-skilled lawyers before the others and marks the others', async () => {
    const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    t.app.lawyers.create({ username: 'plain', name: 'محمد فؤاد', password: 'Lawyer@2026', title: 'أ.', specialties: ['COM'], capacity: 20, agreement: { type: 'per_case', rate: 500 } }, admin);
    const code3 = await t.submit(mariam, { entity_id: t.nfdEntity, type: 'nda', description: 'اتفاقية سرية ثانية مع مورد جديد للتغليف قبل التفاوض', fields: { counterparty_name: 'Nova Packaging', direction: 'mutual', purpose: 'تبادل الأسعار' } });
    for (const role of ['lead', 'reviewer']) {
      const s = ok(await manager.get(`/api/admin/company-requests/${t.req(code3).id}/suggest-lawyers?role=${role}`));
      const firstPlain = s.items.findIndex((x) => !x.b2b);
      assert.ok(firstPlain === -1 || s.items.slice(firstPlain).every((x) => !x.b2b), `${role}: b2b first`);
      const plain = s.items.find((x) => x.name === 'محمد فؤاد');
      assert.ok(plain && plain.reasons.includes('بلا تخصص شركات'));
    }
  });

  test('G7-02: staff memory files pass the gate; document_ids only for files the company already sees', async () => {
    const co = t.app.db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
    const bad = await staff.post(`/api/admin/companies/${co.id}/memory`, { kind: 'template', title: 'نموذج سرية', access: 'all', data: { template_kind: 'nda' }, files: [file64('nda.pdf', 'application/pdf', pdfBuf('Tarek El-Naggar'))] });
    assert.equal(bad.status, 409, JSON.stringify(bad.body));
    assert.equal(bad.body.code, 'file_author_names');
    const okItem = ok(await staff.post(`/api/admin/companies/${co.id}/memory`, { kind: 'template', title: 'نموذج سرية معتمد 2', access: 'all', data: { template_kind: 'nda' }, files: [file64('nda.pdf', 'application/pdf', pdfBuf('Legal Dept'))] }), 201);
    // a file of the un-released draft deliverable cannot be attached to memory
    const draftDoc = t.app.db.value('SELECT document_id FROM company_deliverable_documents WHERE deliverable_id = ? LIMIT 1', t.draftId);
    const att = await staff.post(`/api/admin/company-memory/${okItem.id}/documents`, { document_ids: [draftDoc] });
    assert.equal(att.status, 400, JSON.stringify(att.body));
    // a file the company uploaded itself is fine
    const own = t.app.db.value("SELECT id FROM documents WHERE uploaded_by_kind = 'client' AND company_id = ? AND company_user_id IS NOT NULL AND (company_request_id IS NULL OR company_request_id IN (SELECT id FROM company_requests WHERE visibility != 'private')) LIMIT 1", co.id);
    if (own) assert.equal((await staff.post(`/api/admin/company-memory/${okItem.id}/documents`, { document_ids: [own] })).status, 201);
  });

  test('J-24: the company-only knowledge record keeps neither the Latin name nor the username of the lawyer', () => {
    t.app.db.run("UPDATE opinions SET body = body || ? WHERE id = ?", '\nراجع الأستاذ طارق النجار (Tarek El-Naggar) المسودة، وأرسلها tarek.', t.opinionId);
    const rec = t.app.knowledge.buildFromCase(caseId);
    const s = JSON.stringify(rec);
    assert.ok(!/Tarek|tarek|طارق النجار/.test(s), s.slice(0, 400));
  });
});

// ───────────────────────── K3 / J-08: لا متابعة «لسه محتاجين» على ملف شركة ─────────────────────────
describe('gate K3/J-08 — shareInfo never creates a website follow-up on a company case', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
  });
  after(async () => t && t.close());

  test('the demo seed holds no website follow-up on company cases', () => {
    const rows = t.app.db.all("SELECT ir.* FROM info_requests ir JOIN cases c ON c.id = ir.case_id WHERE c.company_id IS NOT NULL AND (ir.sent_channel = 'website' OR ir.client_message LIKE 'لسه محتاجين%')");
    assert.deepEqual(rows, []);
  });

  test('sharing a partial company reply with request_rest:true still creates no follow-up', async () => {
    const db = t.app.db;
    const c = db.get("SELECT c.* FROM cases c JOIN company_requests r ON r.id = c.company_request_id WHERE c.status != 'closed' AND r.status = 'in_progress' ORDER BY c.id LIMIT 1");
    const a = db.get("SELECT * FROM assignments WHERE case_id = ? AND status != 'withdrawn' ORDER BY id LIMIT 1", c.id);
    const lawyer = db.get('SELECT * FROM users WHERE id = ?', a.lawyer_id);
    const manager = db.get("SELECT * FROM users WHERE username = 'manager'");
    const ir = t.app.requests.createInfoByLawyer(a.id, lawyer, { kind: 'document', question: 'نحتاج نسخة العقد وملحقاته الموقعة.' });
    t.app.requests.approveInfo(ir.id, manager, { client_message: 'نرجو إرسال نسخة العقد وملحقاته الموقعة.', items: ['نسخة العقد', 'الملحقات الموقعة'] });
    db.run("UPDATE info_requests SET status = 'client_replied', client_reply = 'مرفق العقد.' WHERE id = ?", ir.id);
    const before = Number(db.value('SELECT COUNT(*) FROM info_requests WHERE case_id = ?', c.id));
    const res = t.app.requests.shareInfo(ir.id, manager, { response_text: 'أرسلت الشركة نسخة العقد.', request_rest: true });
    assert.equal(res.follow_up_id, null);
    assert.deepEqual(res.follow_up_items, []);
    assert.equal(Number(db.value('SELECT COUNT(*) FROM info_requests WHERE case_id = ?', c.id)), before);
  });
});

// ───────────────────────── G7-07 / G-R2: البريد ─────────────────────────
describe('gate G7-07/G-R2 — SMTP STARTTLS injection and stale «sending» rows', () => {
  test('a reply pipelined with «220» before TLS aborts the connection (permanent), nothing is read as the post-TLS EHLO', async () => {
    const net = await import('node:net');
    const { SmtpConnection } = await import('../src/services/email.js');
    const log = [];
    const server = net.createServer((s) => {
      let buf = '';
      s.on('data', (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const l = buf.slice(0, i).replace(/\r$/, '');
          buf = buf.slice(i + 1);
          log.push(l);
          if (/^EHLO/i.test(l)) s.write('250-fake\r\n250 STARTTLS\r\n');
          else if (/^STARTTLS/i.test(l)) s.write('220 go ahead\r\n250 INJECTED-BEFORE-TLS\r\n');
        }
      });
      s.on('error', () => {});
      s.write('220 fake ESMTP\r\n');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const conn = new SmtpConnection({ host: '127.0.0.1', port: 587, connectPort: server.address().port, security: 'starttls', timeoutMs: 2000 });
      await assert.rejects(() => conn.open(), (e) => e.permanent === true && /قبل بدء التشفير/.test(e.message));
      assert.deepEqual(log.filter((l) => /^EHLO/i.test(l)).length, 1, 'no second EHLO');
    } finally {
      server.close();
    }
  });

  test('a row claimed more than 10 minutes ago is requeued by the next flush without a restart; a fresh claim is left alone', async () => {
    const t = await startTestApp({ seed: 'none', config: { publicBaseUrl: 'https://legal.example.org' } });
    try {
      await seedB2bDemo(t.app);
      const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      t.app.integrations.set('email', { provider: 'smtp', smtp_host: 'localhost', smtp_port: '587', smtp_security: 'starttls', smtp_user: 'm', smtp_password: 'p', from_address: 'legal@example.com', from_name: '' }, admin);
      const company = t.app.db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
      const cu = t.app.db.get("SELECT * FROM company_users WHERE email = 'mariam@nilefoods.example'");
      const old = t.app.email.send('request_update', { to: cu.email, name: cu.name, company, companyUserId: cu.id, vars: { code: 'NFD-0001' } });
      const fresh = t.app.email.send('request_update', { to: cu.email, name: cu.name, company, companyUserId: cu.id, vars: { code: 'NFD-0002' } });
      const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
      t.app.db.run("UPDATE email_outbox SET status = 'sending', next_attempt_at = ? WHERE id = ?", ago(11), old.id);
      t.app.db.run("UPDATE email_outbox SET status = 'sending', next_attempt_at = ? WHERE id = ?", ago(2), fresh.id);
      await t.app.email.flush({ smtp: { connectPort: 1, timeoutMs: 300 } });
      assert.notEqual(t.app.db.value('SELECT status FROM email_outbox WHERE id = ?', old.id), 'sending');
      assert.equal(t.app.db.value('SELECT status FROM email_outbox WHERE id = ?', fresh.id), 'sending');
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── J-02 / C-13: اقتراحات الذاكرة ─────────────────────────
describe('gate J-02/C-13 — triage memory suggestions carry a specific reason and skip unrelated items', () => {
  test('demo: a dispute with an unknown counterparty gets no unrelated contracts; a known counterparty gets «نفس الطرف الآخر»', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const nfd = t.app.db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
      const ctx = (text, cps, type) => t.app.ai.companyContext(nfd.id, { text, counterparties: cps, type, minScore: 0.2 });
      const unrelated = ctx('نزاع مع شركة المستقبل للتجارة على مبالغ مستحقة لنا عن توريدات سابقة', ['شركة المستقبل للتجارة'], 'dispute');
      assert.ok(!unrelated.some((m) => m.ref.startsWith('M-') && m.kind === 'contract' && /الدلتا|إيجار/.test(m.title)), JSON.stringify(unrelated.map((m) => m.title)));
      const same = ctx('مراجعة عقد توريد جديد', ['شركة الدلتا للتغليف'], 'contract_review');
      const delta = same.find((m) => /الدلتا/.test(m.title) && m.kind === 'contract');
      assert.equal(delta.reason, 'counterparty');
      const { MEMORY_WHY } = await import('../src/ai/company.js');
      assert.equal(MEMORY_WHY.counterparty, 'نفس الطرف الآخر');
      assert.equal(MEMORY_WHY.template, 'نموذج معتمد لنفس النوع');
    } finally {
      await t.close();
    }
  });

  test('accept sheet: pre-selection only for company links, the same counterparty and the approved template; no redundant «موقف معتمد» badge', () => {
    const src = read('public/assets/js/app/components/company-accept-sheet.js');
    assert.match(src, /const preselect = \[\.\.\.new Set\(\[\.\.\.linkedIds, \.\.\.memItems\.filter\(cpMatch\)/);
    assert.ok(!/badge\('موقف معتمد'/.test(src));
    assert.ok(!/badge\('موقف معتمد'/.test(read('public/assets/js/app/pages/admin/company-request.js')));
    assert.match(src, /m\.access === 'admins' \? badge\(/);
  });
});

// ───────────────────────── نصوص وواجهات (J-11, J-13, K10, C-12, K6, K7) ─────────────────────────
describe('gate staff copy and UI checks', () => {
  test('K10/J-07: lawyer company context — company date relabelled and hidden when closed; reviewer line for the reviewer', async () => {
    const { REVIEWER_LINE, COMPANY_DUE_LABEL, SENIOR_REVIEW_LINE } = await import('../public/assets/js/app/pages/lawyer/assignment.js');
    assert.equal(REVIEWER_LINE, 'أنت المراجع النهائي لهذا العمل قبل تسليمه للشركة.');
    assert.equal(COMPANY_DUE_LABEL, 'موعد تسليم الإدارة للشركة');
    assert.equal(SENIOR_REVIEW_LINE, 'يراجع عملك مراجع نهائي قبل تسليمه للشركة.');
    const src = read('public/assets/js/app/pages/lawyer/assignment.js');
    assert.ok(!src.includes('`سلّم قبل: ${deadline(co.delivery_due_at)}`'));
    assert.match(src, /co\.delivery_due_at && !closed/);
    assert.match(src, /role === 'reviewer'/);
  });

  test('J-13: company wording on the approve dialog and the queue share dialog; company chip on queue cards', async () => {
    const cd = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.match(cd, /intro: company\s*\? `الاعتماد يعني أن الرأي سليم مهنيًا، ولا يصل للشركة إلا في تسليم/);
    const q = read('public/assets/js/app/pages/admin/queue.js');
    assert.match(q, /label: `المطلوب من \$\{whoOf\(r\)\}`/);
    assert.match(q, /label: `مرفقات \$\{whoOf\(r\)\} التي تُتاح مع الرد`/);
    assert.match(q, /head: \[caseLink\(r, 'requests'\), companyChip\(r\)/);
    const { QUEUE_LABELS } = await import('../public/assets/js/app/labels.js');
    assert.equal(QUEUE_LABELS.client_replies, 'ردود المستفيدين والشركات بانتظار المراجعة');
  });

  test('J-11: the deliverable sheet re-checks «إرسال للشركة» after modal() re-enables its buttons', () => {
    const src = read('public/assets/js/app/components/company-deliverable-sheet.js');
    assert.match(src, /new MutationObserver\(\(\) => \{\s*if \(!sendBtn\.disabled && !sendBtn\.classList\.contains\('is-loading'\) && !gatesPass\(\)\) syncSend\(\);/);
  });

  test('C-12: staff company surfaces use the catalogue priority words', async () => {
    const { PRIORITIES, labelOf } = await import('../public/assets/js/lib/company-catalog.js');
    assert.deepEqual(['urgent', 'high', 'normal', 'low'].map((k) => labelOf(PRIORITIES, k)), ['عاجل', 'مرتفع', 'عادي', 'منخفض']);
    assert.match(read('public/assets/js/app/components/company-accept-sheet.js'), /label: labelOf\(CAT_PRIORITIES, k\)/);
    assert.ok(!/label\('priority'/.test(read('public/assets/js/app/pages/admin/company-request.js')));
  });

  test('K6/K7: phone sheets never shrink their header; 44 px touch targets for .seg, filters and the toast close; swipe exit is not asked twice', () => {
    const css = read('public/assets/css/app.css');
    assert.match(css, /\.modal-sheet > \.modal-grip,\s*\.modal-sheet > \.modal-header,\s*\.modal-sheet > \.modal-footer \{\s*flex-shrink: 0;/);
    assert.match(css, /@media \(pointer: coarse\) \{\s*\.seg \{\s*min-height: 44px;/);
    assert.match(css, /\.toast-close::before \{\s*content: '';\s*position: absolute;\s*inset: -8px;/);
    const ui = read('public/assets/js/lib/ui.js');
    assert.match(ui, /if \(ok\) exiting = true;/);
    assert.match(ui, /onExitCancelled: \(\) => \{\s*exiting = false;/);
    assert.match(read('public/assets/js/lib/sheet-motion.js'), /else onExitCancelled\('swipe'\);/);
    // toasts move above an open dialog on the lawyer phone UI (they sit at the bottom otherwise)
    assert.match(read('public/assets/css/v10-desk.css'), /html\.lh-lawyer-ui body\.has-modal \.toast-region \{\s*inset-block-start: calc\(12px/);
  });
});
