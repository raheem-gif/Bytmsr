// اختبارات وحدة practice (الإصدار 9): بطاقة المستفيد، عقد نموذج الموقع، درجة الاحتياج، تقرير الأثر وقيمة الحقوق المستردة،
// تعارض المصالح، التقويم واشتراك ICS، التصدير والاستيراد CSV، مهلة أول رد (SLA)، والبحث الشامل وصلاحياته.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, newCase, createLawyer, assign, uniquePhone, LAWYER_PASSWORD, assertNoLeak } from './lane-b-kit.test.js';
import { normalizeName, compareNames, vulnerabilityScore, parseCsv, toCsv, csvCell, icsFold, buildIcs } from '../src/services/practice-lib.js';

const DESC = 'زوجي توفي من ستة أشهر ولم أستطع صرف المعاش لي وللأبناء حتى الآن، وأحتاج مساعدة قانونية.';

async function publicIntake(t, body) {
  const c = t.client();
  return c.post('/api/public/intake', { consent: true, name: 'وفاء عبد الستار', phone: uniquePhone(), description: DESC, ...body });
}

/** مسار مع معاملات استعلام (Client.get يأخذ الترويسات وسيطًا ثانيًا لا الاستعلام) */
function qs(path, params = {}) {
  const u = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}

/** الاستجابة الخام (بايتات) للتحقق من BOM — fetch().text() يحذف BOM تلقائيًا */
async function rawBytes(t, client, url) {
  const res = await fetch(t.base + url, { headers: client.cookie ? { cookie: client.cookie } : {} });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}
const hasBom = (buf) => buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

function intakeByCode(t, code) {
  return t.app.db.get('SELECT * FROM intakes WHERE code = ?', code);
}

// ───────────────────────── وحدات نقية ─────────────────────────
describe('practice-lib (pure helpers)', () => {
  test('normalizeName unifies Arabic spelling variants, titles and «عبد ال…»', () => {
    assert.equal(normalizeName('السيدة/ فاطمة إبراهيم'), normalizeName('فاطمه ابراهيم'));
    assert.equal(normalizeName('عبد الله محمد'), normalizeName('عبدالله محمد'));
    assert.equal(normalizeName('أ. أحمد'), 'احمد');
    assert.equal(compareNames(normalizeName('حسن محمود عبد الحميد'), normalizeName('حسن محمود عبدالحميد')), 'exact');
    assert.equal(compareNames(normalizeName('محمد أحمد'), normalizeName('محمد احمد علي')), 'partial');
    assert.equal(compareNames(normalizeName('محمد'), normalizeName('محمد احمد')), null, 'single token is never a partial match');
    assert.equal(compareNames(normalizeName('المطلق'), normalizeName('المطلق')), null, 'generic descriptions never match');
  });

  test('vulnerabilityScore is transparent and capped at 100', () => {
    const year = 2026;
    const s = vulnerabilityScore({ relation: 'widow', children: [{ birth_year: 2016 }, { birth_year: 2022 }, { birth_year: 2004 }], monthly_income_band: 'none', housing: 'none', employment: 'none', has_disability: true }, { year });
    assert.equal(s.score, 100);
    assert.equal(s.level, 'severe');
    assert.equal(s.suggested_priority, 'urgent');
    assert.equal(s.minors, 2, 'only children under 18 count');
    assert.ok(s.reasons.some((r) => r.text.includes('أرملة')));
    assert.ok(s.reasons.every((r) => r.points > 0));
    const low = vulnerabilityScore({ relation: 'other', monthly_income_band: 'gt_7000', housing: 'owned', employment: 'employed' }, { year });
    assert.equal(low.level, 'low');
    assert.equal(low.suggested_priority, 'normal');
  });

  test('CSV writer adds BOM, quotes and neutralises formula injection; reader round-trips', () => {
    const csv = toCsv([{ a: 'نص, بفاصلة', b: '=HYPERLINK("x")', c: 'سطر\nثانٍ', d: 12.5 }], [
      { key: 'a', label: 'أ' }, { key: 'b', label: 'ب' }, { key: 'c', label: 'ج' }, { key: 'd', label: 'د' },
    ]);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.ok(csv.includes('"نص, بفاصلة"'));
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.equal(csvCell(-5), '-5', 'numbers are not escaped');
    const parsed = parseCsv(csv);
    assert.deepEqual(parsed.header, ['أ', 'ب', 'ج', 'د']);
    assert.equal(parsed.rows[0].cells[0], 'نص, بفاصلة');
    assert.equal(parsed.rows[0].cells[2], 'سطر\nثانٍ');
    // فاصلة منقوطة (إعداد Excel العربي)
    const semi = parseCsv('الاسم;الهاتف\r\nسعاد;01011112222\r\n');
    assert.deepEqual(semi.rows[0].cells, ['سعاد', '01011112222']);
    assert.throws(() => parseCsv('"غير مغلق'), /علامة اقتباس/);
  });

  test('ICS lines are folded at 75 octets without splitting UTF-8 characters', () => {
    const long = `SUMMARY:${'جلسة نظر الدعوى '.repeat(10)}`;
    const folded = icsFold(long);
    for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
    assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long);
    const ics = buildIcs({ name: 'تقويم', events: [{ uid: 'x@y', summary: 'أ, ب; ج', start: '2026-10-08T08:00:00.000Z' }], now: '2026-10-06T00:00:00.000Z' });
    assert.ok(ics.includes('DTSTART:20261008T080000Z'));
    assert.ok(ics.includes('SUMMARY:أ\\, ب\\; ج'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  });

  // ── مراجعة ما قبل الإطلاق ──
  test('CSV formula injection: leading spaces, bidi marks and full-width variants are neutralised', () => {
    for (const evil of [' =1+1', '\u200f=HYPERLINK("x")', '\uff1d1+1', '\uff0b1', '\t=1', '\n=1', '@SUM(A1)']) {
      assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), `not escaped: ${JSON.stringify(evil)}`);
    }
    assert.equal(csvCell('نص عادي'), 'نص عادي');
    assert.equal(csvCell('2026-10-06'), '2026-10-06', 'dates are untouched');
  });

  test('ICS text cannot inject properties through lone CR or control characters', () => {
    const ics = buildIcs({ name: 'تقويم', events: [{ uid: 'x@y', summary: 'جلسة\rATTENDEE:mailto:evil@example.org\u0000', description: 'سطر\r\nثانٍ', start: '2026-10-08T08:00:00.000Z' }], now: '2026-10-06T00:00:00.000Z' });
    const lines = ics.split('\r\n');
    assert.ok(!lines.some((l) => l.startsWith('ATTENDEE')), 'no injected property line');
    assert.ok(!/\r(?!\n)/.test(ics), 'no bare CR');
    assert.ok(!ics.includes('\u0000'));
    assert.ok(ics.includes('SUMMARY:جلسة\\nATTENDEE:mailto:evil@example.org'));
  });

  test('vulnerability reasons use gender-neutral, correctly declined Arabic', () => {
    const s = vulnerabilityScore({ relation: 'orphan_guardian', children: [{ birth_year: 2016 }, { birth_year: 2018 }] }, { year: 2026 });
    assert.ok(s.reasons.some((r) => r.text === 'الأسرة تعول طفلين دون 18 سنة'), JSON.stringify(s.reasons));
    const one = vulnerabilityScore({ relation: 'widow', children_count: 1 }, { year: 2026 });
    assert.ok(one.reasons.some((r) => r.text === 'الأسرة تعول طفلًا واحدًا دون 18 سنة'), JSON.stringify(one.reasons));
  });
});

// ───────────────────────── عبر HTTP ─────────────────────────
describe('practice lane (HTTP)', () => {
  let t;
  let admin;
  let manager;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'cm1', name: 'مديرة حالات', password: 'Manager@2026' }), 201, 'create case manager');
    manager = await t.login('cm1', 'Manager@2026');
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  describe('beneficiary profile', () => {
    test('validation, save, score, verification and staff-only access', async () => {
      const c = await newCase(admin, { clientName: 'نجلاء عبد الرحمن', legal_area: 'FAM' });
      const base = `/api/admin/clients/${c.clientId}/beneficiary`;
      let r = await admin.put(base, { relation: 'queen' });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /صفة المستفيد/);
      r = await admin.put(base, { children: [{ birth_year: 1900 }] });
      assert.equal(r.status, 400, 'birth year out of range');
      r = await admin.put(base, { children_count: 1, children: [{ birth_year: 2015 }, { birth_year: 2018 }] });
      assert.equal(r.status, 400, 'count smaller than listed children');
      r = await admin.put(base, { children: [{ name: 'يوسف', birth_year: 2016, gender: 'm' }] });
      ok(r, 200);
      assert.equal(JSON.stringify(r.body).includes('يوسف'), false, 'children names are never stored');

      const saved = ok(await manager.put(base, {
        relation: 'widow', children: [{ birth_year: 2014, gender: 'm' }, { birth_year: 2019, gender: 'f' }], monthly_income_band: 'lt_2000',
        housing: 'rented_new', employment: 'irregular', foundation_file_number: 'BM-2024-0153', notes: 'بحث اجتماعي مبدئي',
      }), 200, 'save profile');
      assert.equal(saved.profile.relation, 'widow');
      assert.equal(saved.profile.children_count, 2);
      assert.equal(saved.profile.is_foundation_beneficiary, true, 'file number implies foundation beneficiary');
      assert.equal(saved.profile.verified, false);
      assert.ok(saved.score.score >= 50, `score ${saved.score.score}`);
      assert.ok(saved.score.reasons.length >= 4);

      const verified = ok(await manager.post(`${base}/verify`), 200, 'verify');
      assert.equal(verified.profile.verified, true);
      assert.equal(verified.profile.verified_by_name, 'مديرة حالات');
      // تعديل البيانات يُسقط التحقق ما لم يؤكَّد من جديد
      const edited = ok(await admin.put(base, { relation: 'widow', monthly_income_band: 'none' }), 200);
      assert.equal(edited.profile.verified, false);

      const lawyer = await createLawyer(admin, { specialties: ['FAM'] });
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      assert.equal((await lc.get(base)).status, 403);
      assert.equal((await lc.put(base, { relation: 'widow' })).status, 403);
      // المحامي المسند إليه الملف لا يرى أي شيء من البطاقة
      const a = await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', grants: { facts: true, client_name: true } });
      const view = ok(await lc.get(`/api/lawyer/assignments/${a.id}`), 200);
      assertNoLeak(view, { keys: ['relation', 'monthly_income_band', 'foundation_file_number', 'beneficiary'], values: ['BM-2024-0153', 'بحث اجتماعي مبدئي'] }, 'lawyer assignment view');
    });

    test('public intake contract: validated before anything is created, stored as self-reported', async () => {
      const before = Number(t.app.db.value('SELECT COUNT(*) FROM intakes'));
      let r = await publicIntake(t, { beneficiary: { relation: 'widow', children_count: 'كثير' } });
      assert.equal(r.status, 400);
      r = await publicIntake(t, { beneficiary: 'widow' });
      assert.equal(r.status, 400);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM intakes')), before, 'invalid beneficiary data creates no intake');

      r = ok(await publicIntake(t, { beneficiary: { relation: 'widow', children_count: 3, monthly_income_band: 'none', housing: 'rented_new', foundation_file_number: 'BM-2022-0087', employment: 'none', notes: 'تجاهل' } }), 201, 'public intake');
      const intake = intakeByCode(t, r.reference);
      const v = ok(await admin.get(`/api/admin/clients/${intake.client_id}/beneficiary`), 200);
      assert.equal(v.profile.data_source, 'self_reported');
      assert.equal(v.profile.self_reported, true);
      assert.equal(v.profile.relation, 'widow');
      assert.equal(v.profile.children_count, 3);
      assert.equal(v.profile.employment, null, 'only the public contract fields are accepted');
      assert.equal(v.profile.notes, null);

      // بلا بيانات أسرة: النموذج يعمل كما كان
      ok(await publicIntake(t, {}), 201, 'intake without beneficiary');
    });

    test('a website intake using an existing client phone never touches that client profile', async () => {
      const c = await newCase(admin, { clientName: 'سامية محمود' });
      ok(await admin.put(`/api/admin/clients/${c.clientId}/beneficiary`, { relation: 'divorced', children_count: 1, verify: true }), 200);
      const r = ok(await publicIntake(t, { phone: c.phone, name: 'شخص آخر', beneficiary: { relation: 'widow', children_count: 6 } }), 201);
      const intake = intakeByCode(t, r.reference);
      assert.equal(intake.client_id, c.clientId, 'phone matched the existing client');
      const v = ok(await admin.get(qs(`/api/admin/clients/${c.clientId}/beneficiary`, { intake_id: intake.id })), 200);
      assert.equal(v.profile.relation, 'divorced', 'profile untouched');
      assert.equal(v.profile.children_count, 1);
      assert.equal(v.profile.verified, true);
      assert.equal(v.intake.submission.data.relation, 'widow', 'kept as a pending submission on the intake');
      const applied = ok(await admin.post(`/api/admin/beneficiary-submissions/${v.intake.submission.id}/apply`), 200);
      assert.equal(applied.profile.relation, 'divorced', 'apply fills only empty fields');
      // لا حقول فارغة تُملأ ← يبقى التحقق؛ (حالة الملء الفعلي مختبرة أدناه)
      assert.equal(applied.profile.verified, true, 'nothing filled, verification kept');
      assert.equal((await admin.post(`/api/admin/beneficiary-submissions/${v.intake.submission.id}/apply`)).status, 409);
    });

    test('triage: the score suggests raising (never lowering) intake priority', async () => {
      const r = ok(await publicIntake(t, { beneficiary: { relation: 'widow', children_count: 4, monthly_income_band: 'none', housing: 'none' } }), 201);
      const intake = intakeByCode(t, r.reference);
      let v = ok(await admin.get(qs(`/api/admin/clients/${intake.client_id}/beneficiary`, { intake_id: intake.id })), 200);
      assert.equal(v.intake.priority, 'normal');
      assert.ok(['high', 'urgent'].includes(v.priority_suggestion.to), JSON.stringify(v.priority_suggestion));
      ok(await admin.patch(`/api/admin/intakes/${intake.id}`, { priority: 'urgent' }), 200);
      v = ok(await admin.get(qs(`/api/admin/clients/${intake.client_id}/beneficiary`, { intake_id: intake.id })), 200);
      assert.equal(v.priority_suggestion, null);
    });
  });

  describe('outcome value and impact report', () => {
    test('close validation, totals, annualisation, filters, CSV and permissions', async () => {
      const r0 = ok(await admin.get('/api/admin/impact'), 200);
      const c1 = await newCase(admin, { clientName: 'هدى شوقي', legal_area: 'FAM' });
      const c2 = await newCase(admin, { clientName: 'صفاء حسين', legal_area: 'INH' });
      ok(await admin.put(`/api/admin/clients/${c1.clientId}/beneficiary`, { relation: 'widow', children_count: 2 }), 200);

      let r = await admin.post(`/api/admin/cases/${c1.id}/close`, { outcome: 'resolved', outcome_value: { outcome_kind: 'lottery' } });
      assert.equal(r.status, 400);
      r = await admin.post(`/api/admin/cases/${c1.id}/close`, { outcome: 'resolved', outcome_value: { outcome_kind: 'advice_only', recovered_one_time: 100 } });
      assert.equal(r.status, 400);
      r = await admin.post(`/api/admin/cases/${c1.id}/close`, { outcome: 'resolved', outcome_value: { recovered_monthly: 100 } });
      assert.equal(r.status, 400, 'values without a kind');
      assert.equal(t.app.db.value('SELECT status FROM cases WHERE id = ?', c1.id), 'new', 'a rejected close leaves the case open');

      ok(await admin.post(`/api/admin/cases/${c1.id}/close`, { outcome: 'resolved', outcome_value: { outcome_kind: 'alimony_judgment', recovered_one_time: 7200, recovered_monthly: 1800, notes: 'حكم نفقة صغار' } }), 200, 'close with value');
      ok(await manager.post(`/api/admin/cases/${c2.id}/close`, { outcome: 'answered' }), 200, 'close without value');
      const ov = ok(await manager.put(`/api/admin/cases/${c2.id}/outcome-value`, { outcome_kind: 'inheritance_share', recovered_one_time: 150000.5 }), 200, 'record later');
      assert.equal(ov.recovered_one_time, 150000.5);
      const cv = ok(await admin.get(`/api/admin/cases/${c1.id}/outcome-value`), 200);
      assert.equal(cv.annualized, 7200 + 1800 * 12);
      const act = t.app.db.get("SELECT summary FROM activity WHERE case_id = ? AND type = 'outcome.value'", c1.id);
      assert.match(act.summary, /حكم نفقة/);

      const r1 = ok(await manager.get('/api/admin/impact'), 200, 'impact (case manager)');
      assert.equal(r1.value.one_time - r0.value.one_time, 7200 + 150000.5);
      assert.equal(r1.value.monthly - r0.value.monthly, 1800);
      assert.equal(r1.value.annualized - r0.value.annualized, 7200 + 150000.5 + 1800 * 12);
      assert.ok(r1.totals.families_served >= 2);
      assert.ok(r1.beneficiaries.widows >= 1);
      assert.ok(r1.outcomes.find((o) => o.key === 'resolved').count >= 1);
      assert.ok(r1.by_month.length >= 1);
      assert.equal(r1.org.legal_name.includes('بيوت مصر'), true);

      const fam = ok(await admin.get(qs('/api/admin/impact', { area: 'FAM' })), 200);
      assert.ok(fam.value.by_kind.every((k) => k.key !== 'inheritance_share'), 'area filter applies to values');
      assert.equal((await admin.get('/api/admin/impact?area=XXX')).status, 400);
      assert.equal((await admin.get('/api/admin/impact?from=2026-05-01&to=2026-01-01')).status, 400);

      const csv = await manager.get('/api/admin/impact/export');
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type'), /text\/csv/);
      assert.ok(hasBom((await rawBytes(t, manager, '/api/admin/impact/export')).bytes), 'UTF-8 BOM');
      assert.ok(csv.body.includes('القيمة السنوية للحقوق المستردة'));
      assert.ok(!csv.body.includes(c1.phone.slice(-6)), 'aggregates only — no phones');

      const lawyer = await createLawyer(admin);
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      assert.equal((await lc.get('/api/admin/impact')).status, 403);
      assert.equal((await lc.get(`/api/admin/cases/${c1.id}/outcome-value`)).status, 403);
    });
  });

  describe('conflict of interest', () => {
    test('opponent matching a client (spelling variants and national id) is flagged and logged', async () => {
      const existing = await newCase(admin, { clientName: 'عبد الله محمد أحمد', national_id: '28501011234567' });
      const c = await newCase(admin, { clientName: 'منى فتحي' });
      const p1 = ok(await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'opponent', name: 'عبدالله محمد احمد' }), 201, 'add opponent');
      assert.equal(p1.matches[0].level, 'high');
      assert.equal(p1.matches[0].match, 'exact');
      assert.equal(p1.matches[0].client.id, existing.clientId);
      const p2 = ok(await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'opponent', name: 'شخص باسم مختلف تماما', national_id: '٢٨٥٠١٠١١٢٣٤٥٦٧' }), 201);
      assert.equal(p2.matches[0].match, 'national_id', 'Arabic-Indic digits are normalised');
      assert.equal(p2.matches[0].level, 'high');
      const p3 = ok(await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'witness', name: 'عبدالله محمد' }), 201);
      assert.equal(p3.matches.find((m) => m.target === 'client').match, 'partial');
      const p4 = ok(await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'related', name: 'المطلق' }), 201);
      assert.deepEqual(p4.matches, [], 'generic descriptions are not matched');
      assert.equal((await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'opponent', name: 'عبد الله محمد أحمد' })).status, 409, 'duplicate party');
      assert.equal((await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'judge', name: 'س' })).status, 400);
      assert.equal((await admin.post(`/api/admin/cases/${c.id}/parties`, { role: 'opponent', name: 'اسم', national_id: '123' })).status, 400);

      const logs = t.app.db.all("SELECT summary, data FROM activity WHERE case_id = ? AND type = 'conflict.check' ORDER BY id", c.id);
      assert.ok(logs.some((l) => /تعارض محتمل/.test(l.summary)));
      const list = ok(await admin.get(`/api/admin/cases/${c.id}/parties`), 200);
      assert.equal(list.items.length, 4);
      ok(await admin.patch(`/api/admin/parties/${p4.id}`, { name: 'أيمن فاروق' }), 200);
      ok(await admin.del(`/api/admin/parties/${p4.id}`), 200);
      assert.equal(ok(await admin.get(`/api/admin/cases/${c.id}/parties`), 200).items.length, 3);

      // التحويل: المستفيد الجديد خصم في ملف آخر ← تنبيه في السجل وإشعار للإدارة
      const newcomer = await newCase(admin, { clientName: 'عبد الله محمد احمد', phone: uniquePhone() });
      const alert = t.app.db.get("SELECT summary, data FROM activity WHERE case_id = ? AND type = 'conflict.check'", newcomer.id);
      assert.match(alert.summary, /تعارض محتمل/);
      assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'conflict.alert'"));

      // بحث يدوي من صفحة تعارض المصالح (يُسجل)
      const s = ok(await manager.post('/api/admin/conflicts/check', { name: 'عبدالله محمد أحمد', as: 'client' }), 200);
      assert.ok(s.matches.some((m) => m.level === 'high' && m.target === 'party'));
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE type = 'conflict.search'"));
      assert.equal((await admin.post('/api/admin/conflicts/check', {})).status, 400);
      const recent = ok(await admin.get('/api/admin/conflicts/recent'), 200);
      assert.ok(recent.items.length >= 1);

      const lawyer = await createLawyer(admin);
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      assert.equal((await lc.get(`/api/admin/cases/${c.id}/parties`)).status, 403);
      assert.equal((await lc.post('/api/admin/conflicts/check', { name: 'عبدالله' })).status, 403);
    });

    test('matter opponent is synced to parties and checked on create and edit', async () => {
      await newCase(admin, { clientName: 'كريمة السيد عثمان' });
      const c = await newCase(admin, { clientName: 'رحاب عادل' });
      const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', opponent: 'المطلق' }), 201, 'matter');
      let parties = ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200);
      assert.equal(parties.items.length, 1);
      assert.equal(parties.items[0].origin, 'matter_opponent');
      assert.deepEqual(parties.items[0].matches, []);
      ok(await admin.patch(`/api/admin/matters/${m.id}`, { opponent: 'كريمة السيد عثمان' }), 200);
      parties = ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200);
      assert.equal(parties.items.length, 1, 'updated in place');
      assert.equal(parties.items[0].matches[0].level, 'high');
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE matter_id = ? AND type = 'conflict.check' AND summary LIKE '%تعارض محتمل%'", m.id));
      ok(await admin.patch(`/api/admin/matters/${m.id}`, { opponent: null }), 200);
      assert.equal(ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200).items.length, 0);
    });
  });

  describe('calendar and ICS feed', () => {
    let lawyerA;
    let lawyerB;
    let lcA;
    let matter;
    let caseB;
    before(async () => {
      lawyerA = await createLawyer(admin, { name: 'رانيا التقويم', specialties: ['FAM'] });
      lawyerB = await createLawyer(admin, { name: 'هاني التقويم', specialties: ['FAM'] });
      lcA = await t.login(lawyerA.username, LAWYER_PASSWORD);
      const cA = await newCase(admin, { clientName: 'عميلة التقويم', legal_area: 'FAM' });
      matter = ok(await admin.post(`/api/admin/cases/${cA.id}/matter`, { kind: 'litigation', responsible_lawyer_id: lawyerA.id, court: 'محكمة الأسرة بالمعادي' }), 201);
      const soon = new Date(Date.now() + 2 * 86400000).toISOString();
      ok(await admin.post(`/api/admin/matters/${matter.id}/events`, { kind: 'hearing', title: 'جلسة نفقة الصغار', starts_at: soon, client_attendance_required: true }), 200, 'event');
      ok(await admin.post(`/api/admin/matters/${matter.id}/tasks`, { title: 'تقديم حافظة المستندات', due_at: soon, procedural: true }), 200, 'task');
      ok(await admin.post(`/api/admin/matters/${matter.id}/invoices`, { description: 'رسوم إدارية', amount: 300, due_at: soon }), 200, 'invoice');
      await assign(admin, cA.id, { lawyer_id: lawyerA.id, role: 'lead', due_at: soon });
      caseB = await newCase(admin, { clientName: 'عميلة محامٍ آخر', legal_area: 'FAM' });
      await assign(admin, caseB.id, { lawyer_id: lawyerB.id, role: 'lead', due_at: soon });
    });

    test('staff calendar includes every type and filters by lawyer', async () => {
      const r = ok(await manager.get('/api/admin/calendar'), 200);
      const types = new Set(r.items.map((i) => i.type));
      for (const tp of ['event', 'task', 'assignment', 'invoice']) assert.ok(types.has(tp), `missing ${tp}`);
      const onlyB = ok(await admin.get(qs('/api/admin/calendar', { lawyer_id: lawyerB.id })), 200);
      assert.ok(onlyB.items.length >= 1);
      assert.ok(onlyB.items.every((i) => i.lawyer?.id === lawyerB.id || i.type === 'task'));
      const onlyEvents = ok(await admin.get(qs('/api/admin/calendar', { types: 'event' })), 200);
      assert.ok(onlyEvents.items.every((i) => i.type === 'event'));
      assert.equal((await admin.get('/api/admin/calendar?from=2026-01-01&to=2028-01-01')).status, 400, 'range cap');
    });

    test('lawyer calendar is scoped to own matters and assignments, without invoices or client data', async () => {
      const r = ok(await lcA.get('/api/lawyer/calendar'), 200);
      assert.ok(r.items.some((i) => i.type === 'event' && i.title === 'جلسة نفقة الصغار'));
      assert.ok(r.items.some((i) => i.type === 'assignment'));
      assert.ok(r.items.every((i) => i.type !== 'invoice'));
      assert.ok(!JSON.stringify(r).includes(caseB.code), 'other lawyers’ assignments are hidden');
      assertNoLeak(r, { keys: ['phone', 'client_name', 'amount'], values: ['عميلة التقويم'] }, 'lawyer calendar');
      assert.ok(r.items.every((i) => i.link.startsWith('#/my/')));
      assert.equal((await lcA.get('/api/admin/calendar')).status, 403);
      assert.equal((await admin.get('/api/lawyer/calendar')).status, 403);
    });

    test('ICS feed: per-user secret token, RFC 5545 content, scoping, regeneration and revocation', async () => {
      assert.equal((await t.client().get('/api/calendar/feed')).status, 401);
      const st = ok(await lcA.get('/api/calendar/feed'), 200);
      assert.equal(st.active, false);
      const issued = ok(await lcA.post('/api/calendar/feed'), 200);
      assert.ok(issued.url.endsWith('.ics'));
      assert.ok(issued.webcal_url.startsWith('webcal://'));
      const path = new URL(issued.url).pathname;
      const ics = await t.client().get(path);
      assert.equal(ics.status, 200);
      assert.match(ics.headers.get('content-type'), /text\/calendar/);
      assert.ok(ics.body.startsWith('BEGIN:VCALENDAR\r\n'));
      assert.ok(ics.body.includes('VERSION:2.0'));
      assert.ok(ics.body.includes('BEGIN:VEVENT'));
      assert.ok(ics.body.includes('جلسة نفقة الصغار'));
      assert.match(ics.body, /DTSTART:\d{8}T\d{6}Z/);
      assert.ok(ics.body.includes('BEGIN:VALARM'));
      assert.ok(!ics.body.includes(caseB.code), 'no other lawyer items');
      assert.ok(!ics.body.includes('INV-'), 'no invoices for lawyers');
      assert.ok(!ics.body.includes('عميلة التقويم'), 'no client names');
      for (const line of ics.body.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line too long: ${line}`);
      assert.equal(ok(await lcA.get('/api/calendar/feed'), 200).use_count, 1);

      // إعادة الإصدار تُبطل الرابط القديم
      const again = ok(await lcA.post('/api/calendar/feed'), 200);
      assert.equal((await t.client().get(path)).status, 404);
      const path2 = new URL(again.url).pathname;
      assert.equal((await t.client().get(path2)).status, 200);
      // الإدارة: الفواتير ضمن التقويم
      const staffFeed = ok(await admin.post('/api/calendar/feed'), 200);
      const sics = await t.client().get(new URL(staffFeed.url).pathname);
      assert.ok(sics.body.includes('INV-'));
      // إيقاف الحساب يُبطل الرابط
      ok(await admin.patch(`/api/admin/lawyers/${lawyerA.id}`, { active: false }), 200);
      assert.equal((await t.client().get(path2)).status, 404);
      ok(await admin.patch(`/api/admin/lawyers/${lawyerA.id}`, { active: true }), 200);
      const lcA2 = await t.login(lawyerA.username, LAWYER_PASSWORD);
      ok(await lcA2.del('/api/calendar/feed'), 200);
      assert.equal((await t.client().get(path2)).status, 404);
      assert.equal((await t.client().get('/api/calendar/not-a-real-token-at-all-xyz.ics')).status, 404);
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'calendar.feed_issued'"));
    });
  });

  describe('CSV export and import', () => {
    test('exports are admin-only, Excel-friendly (BOM) and audit-logged as warnings', async () => {
      for (const entity of ['clients', 'intakes', 'cases', 'matters', 'lawyers', 'ledger']) {
        const r = await rawBytes(t, admin, `/api/admin/data/export/${entity}`);
        assert.equal(r.status, 200, entity);
        assert.match(r.headers.get('content-type'), /text\/csv/);
        assert.match(r.headers.get('content-disposition'), /attachment/);
        assert.ok(hasBom(r.bytes), `${entity} BOM`);
      }
      const clients = await admin.get('/api/admin/data/export/clients');
      assert.ok(clients.body.split('\r\n')[0].includes('صفة المستفيد'));
      const ev = t.app.db.get("SELECT * FROM security_events WHERE type = 'data.exported' ORDER BY id DESC");
      assert.equal(ev.severity, 'warning');
      assert.equal((await manager.get('/api/admin/data/export/clients')).status, 403);
      const lawyer = await createLawyer(admin);
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      assert.equal((await lc.get('/api/admin/data/export/clients')).status, 403);
      assert.equal((await t.client().get('/api/admin/data/export/clients')).status, 401);
      assert.equal((await admin.get('/api/admin/data/export/passwords')).status, 404);
      const tpl = await admin.get('/api/admin/data/template/lawyers');
      assert.equal(tpl.status, 200);
      assert.ok(tpl.body.includes('اسم المستخدم'));
    });

    test('client import: per-row preview errors, then only valid rows committed in one transaction', async () => {
      const taken = await newCase(admin, { clientName: 'عميلة مسجلة' });
      const csv = [
        'الاسم,الهاتف,الرقم القومي,المحافظة,صفة المستفيد,عدد الأبناء,سنوات ميلاد الأبناء,الدخل الشهري,السكن,تم التحقق',
        'نجوى عبد الحليم,01033221144,,القاهرة,أرملة,3,"2012 ذكر، 2015 أنثى، 2019 أنثى",1800,إيجار جديد,نعم',
        `مكررة,${taken.phone},,الجيزة,أرملة,,,,,`,
        'سعاد,0101,,المريخ,مجهولة,,,,,',
        'صفاء محمود,01155443300,,الجيزة,وصي,2,,أقل من 2000,مع الأسرة,لا',
      ].join('\r\n');
      const p = ok(await admin.post('/api/admin/data/import/clients/preview', { csv }), 200, 'preview');
      assert.equal(p.total, 4);
      assert.equal(p.valid, 2);
      assert.equal(p.invalid, 2);
      const dup = p.rows.find((r) => r.line === 3);
      assert.ok(dup.errors.some((e) => e.includes(taken.detail.client.code)), JSON.stringify(dup.errors));
      const bad = p.rows.find((r) => r.line === 4);
      assert.ok(bad.errors.length >= 3, JSON.stringify(bad.errors));
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM clients WHERE name = 'نجوى عبد الحليم'")), 0, 'preview writes nothing');

      assert.equal((await admin.post('/api/admin/data/import/clients/commit', { csv, expected_valid: 3 })).status, 409, 'stale preview');
      const res = ok(await admin.post('/api/admin/data/import/clients/commit', { csv, expected_valid: 2 }), 200, 'commit');
      assert.equal(res.created, 2);
      assert.equal(res.skipped, 2);
      const najwa = t.app.db.get("SELECT * FROM clients WHERE name = 'نجوى عبد الحليم'");
      const prof = t.app.db.get('SELECT * FROM beneficiary_profiles WHERE client_id = ?', najwa.id);
      assert.equal(prof.relation, 'widow');
      assert.equal(prof.monthly_income_band, 'lt_2000');
      assert.equal(prof.data_source, 'import');
      assert.ok(prof.verified_at);
      assert.equal(JSON.parse(prof.children).length, 3);
      const safaa = t.app.db.get("SELECT p.* FROM beneficiary_profiles p JOIN clients c ON c.id = p.client_id WHERE c.name = 'صفاء محمود'");
      assert.equal(safaa.relation, 'orphan_guardian');
      assert.equal(safaa.monthly_income_band, 'lt_2000');
      assert.equal(safaa.housing, 'family');
      assert.ok(t.app.db.get("SELECT 1 FROM client_identities WHERE value = '+201033221144'"));
      assert.equal(t.app.db.get("SELECT severity FROM security_events WHERE type = 'data.imported' ORDER BY id DESC").severity, 'warning');

      assert.equal((await admin.post('/api/admin/data/import/clients/preview', { csv: 'عمود,آخر\r\nس,ص' })).status, 400, 'missing required columns');
      assert.equal((await manager.post('/api/admin/data/import/clients/preview', { csv })).status, 403);
    });

    test('lawyer import validates agreements and creates accounts', async () => {
      const csv = '﻿الاسم,اسم المستخدم,الهاتف,التخصصات,نوع الاتفاق,المبلغ,الطاقة الاستيعابية\r\n'
        + 'أحمد سمير,ahmed.samir,01012340000,INH؛ FAM,بالقطعة,400,12\r\n'
        + 'منى الشاذلي,mona.sh,,أحوال شخصية وأسرة,تطوعي,500,\r\n'
        + 'بدون اتفاق,no.agreement,,INH,سحري,,\r\n'
        + 'مكرر,ahmed.samir,,INH,بالقطعة,300,\r\n'
        + 'بلا مبلغ,no.rate,,TAX,بالقطعة,,\r\n';
      const p = ok(await admin.post('/api/admin/data/import/lawyers/preview', { csv }), 200);
      assert.equal(p.valid, 2, JSON.stringify(p.rows.map((r) => r.errors)));
      assert.ok(p.rows[2].errors.some((e) => e.includes('سحري')));
      assert.ok(p.rows[3].errors.some((e) => e.includes('مكرر')));
      const res = ok(await admin.post('/api/admin/data/import/lawyers/commit', { csv }), 200);
      assert.equal(res.created, 2);
      const l = ok(await admin.get('/api/admin/lawyers'), 200).items.find((x) => x.username === 'ahmed.samir');
      assert.ok(l, 'lawyer created');
      assert.deepEqual(l.specialties.sort(), ['FAM', 'INH']);
      assert.equal(l.capacity, 12);
      // كلمة المرور عشوائية ولا تُعرض: لا يمكن الدخول قبل الدعوة أو تعيين كلمة مرور
      assert.equal((await t.client().post('/api/auth/login', { username: 'ahmed.samir', password: LAWYER_PASSWORD })).status, 401);
      // الحساب «بانتظار الدعوة» كما في وحدة الحسابات، فتستطيع الإدارة إصدار دعوة له فعلًا
      const row = t.app.db.get('SELECT invite_pending, password_hash FROM users WHERE id = ?', l.id);
      assert.equal(row.invite_pending, 1);
      assert.ok(!row.password_hash.startsWith('scrypt$'), 'no usable password exists');
      const inv = ok(await admin.post(`/api/admin/accounts/${l.id}/invite`), 200, 'admin can issue an invite to an imported lawyer');
      assert.ok(inv.url, 'invite link returned');
    });
  });

  describe('first-response SLA', () => {
    test('job alerts staff once per intake beyond the SLA and ignores answered intakes', async () => {
      const now = Date.now();
      const at = (hoursAgo) => freezeClock(new Date(now - hoursAgo * 3600000).toISOString());
      try {
        at(10);
        const a = ok(await publicIntake(t, {}), 201);
        const b = ok(await publicIntake(t, {}), 201);
        const ia = intakeByCode(t, a.reference);
        const ib = intakeByCode(t, b.reference);
        at(9);
        ok(await manager.post(`/api/admin/intakes/${ib.id}/reply`, { body: 'أهلًا بحضرتك، استلمنا طلبك وسنتواصل معك قريبًا.' }), 200, 'reply');
        at(7);
        assert.equal(t.app.practice.sla.run().alerted, 0, 'still within SLA (3 hours)');
      } finally {
        resetClock();
      }
      const a = t.app.db.get("SELECT * FROM intakes WHERE first_channel = 'website' ORDER BY created_at LIMIT 1");
      const first = t.app.practice.sla.run();
      assert.ok(first.alerted >= 1);
      const alerted = t.app.db.all('SELECT id FROM intakes WHERE sla_alerted_at IS NOT NULL').map((r) => r.id);
      assert.ok(alerted.includes(a.id));
      const replied = t.app.db.get("SELECT i.id FROM intakes i JOIN messages m ON m.intake_id = i.id AND m.direction = 'out' AND m.automated = 0 AND m.author_user_id IS NOT NULL WHERE i.first_channel = 'website' ORDER BY i.created_at LIMIT 1");
      assert.ok(!alerted.includes(replied.id), 'answered intake not alerted');
      const n1 = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'intake.sla_breach' AND link = ?", `#/inbox/${a.id}`));
      assert.ok(n1 >= 1);
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'intake.sla_breach'", a.id));
      assert.equal(t.app.practice.sla.run().alerted, 0, 'once only');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'intake.sla_breach' AND link = ?", `#/inbox/${a.id}`)), n1);

      const s = ok(await manager.get('/api/admin/sla'), 200);
      assert.ok(s.overdue.some((i) => i.id === a.id));
      assert.ok(!s.overdue.some((i) => i.id === replied.id));
      assert.ok(s.avg_minutes !== null, 'average first response computed');
      const dash = ok(await manager.get('/api/admin/dashboard'), 200);
      assert.ok(dash.sla.overdue_now >= 1);
      assert.equal(dash.sla.hours, 4);

      ok(await admin.patch('/api/admin/settings', { sla_alerts_enabled: false }), 200);
      assert.equal(t.app.practice.sla.run().skipped, 'disabled');
      ok(await admin.patch('/api/admin/settings', { sla_alerts_enabled: true, sla_first_response_hours: 12 }), 200);
      const s12 = ok(await admin.get('/api/admin/sla'), 200);
      assert.equal(s12.hours, 12);
      assert.ok(!s12.overdue.some((i) => i.id === a.id), '10 hours is within a 12-hour SLA');
      ok(await admin.patch('/api/admin/settings', { sla_first_response_hours: 4 }), 200);
      assert.ok(t.app.jobs.list().some((j) => j.name === 'practice.sla' && j.every_minutes === 15));
      const r = await t.app.jobs.runDue({ force: true, only: 'practice.sla' });
      assert.equal(r[0].ok, true);
    });
  });

  describe('global search', () => {
    test('staff search covers clients (name variants, code, phone), cases, matters and lawyers', async () => {
      const c = await newCase(admin, { clientName: 'فاطمة إبراهيم البحث', title: 'ملف بحث شامل' });
      let r = ok(await manager.get(qs('/api/admin/search', { q: 'فاطمه ابراهيم' })), 200);
      assert.ok(r.groups.find((g) => g.key === 'clients').items.some((i) => i.id === c.clientId), 'Arabic spelling variants');
      r = ok(await admin.get(qs('/api/admin/search', { q: c.phone })), 200);
      const hit = r.groups.find((g) => g.key === 'clients').items.find((i) => i.id === c.clientId);
      assert.ok(hit);
      assert.ok(!JSON.stringify(r.groups).includes(c.phone.slice(1)), 'phones are masked in results');
      r = ok(await admin.get(qs('/api/admin/search', { q: c.code })), 200);
      assert.ok(r.groups.find((g) => g.key === 'cases').items.some((i) => i.code === c.code));
      r = ok(await admin.get(qs('/api/admin/search', { q: 'ا' })), 200);
      assert.equal(r.total, 0, 'too short');
    });

    test('lawyer search is limited to own assignments and matters, never client phones', async () => {
      const lawyer = await createLawyer(admin, { specialties: ['CIV'] });
      const other = await createLawyer(admin, { specialties: ['CIV'] });
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      const mine = await newCase(admin, { clientName: 'عميل المحامي الأول', title: 'نزاع إيجار المحل التجاري' });
      const theirs = await newCase(admin, { clientName: 'عميل المحامي الثاني', title: 'نزاع إيجار الشقة السكنية' });
      await assign(admin, mine.id, { lawyer_id: lawyer.id, role: 'lead' });
      await assign(admin, theirs.id, { lawyer_id: other.id, role: 'lead' });
      let r = ok(await lc.get(qs('/api/lawyer/search', { q: 'نزاع ايجار' })), 200);
      const found = r.groups.flatMap((g) => g.items);
      assert.ok(found.some((i) => i.code === mine.code));
      assert.ok(!found.some((i) => i.code === theirs.code), 'cannot find other lawyers’ cases');
      r = ok(await lc.get(qs('/api/lawyer/search', { q: theirs.code })), 200);
      assert.equal(r.total, 0);
      r = ok(await lc.get(qs('/api/lawyer/search', { q: mine.phone })), 200);
      assert.equal(r.total, 0, 'phone search yields nothing for lawyers');
      r = ok(await lc.get(qs('/api/lawyer/search', { q: 'عميل المحامي' })), 200);
      assert.equal(r.total, 0, 'client names are not searchable by lawyers');
      assertNoLeak(ok(await lc.get(qs('/api/lawyer/search', { q: mine.code })), 200), { keys: ['phone', 'client_name'], values: [mine.phone, 'عميل المحامي الأول'] }, 'lawyer search');
      assert.equal((await lc.get(qs('/api/admin/search', { q: mine.code }))).status, 403);
      assert.equal((await admin.get(qs('/api/lawyer/search', { q: 'x' }))).status, 403);
    });
  });

  // ───────── إصلاحات مراجعة ما قبل الإطلاق ─────────
  describe('pre-launch review fixes', () => {
    test('security-log labels exist for every audit event this lane writes', async () => {
      const { LABELS } = await import('../src/constants.js');
      for (const k of ['data.exported', 'data.imported', 'impact.exported', 'calendar.feed_issued', 'calendar.feed_revoked']) {
        assert.ok(LABELS.security_event[k], `missing security_event label: ${k}`);
      }
      const ev = t.app.db.get("SELECT summary FROM security_events WHERE type = 'data.imported' AND summary LIKE '%العملاء%' ORDER BY id DESC");
      assert.ok(ev, 'import was audit-logged');
      assert.ok(ev.summary.includes('أُضيف صفان'), `dual subject is nominative: ${ev.summary}`);
      assert.ok(!ev.summary.includes('صفين'), ev.summary);
    });

    test('calendar feed stops after a password change or a temporary password, and answers HEAD', async () => {
      const lawyer = await createLawyer(admin, { specialties: ['FAM'] });
      const lc = await t.login(lawyer.username, LAWYER_PASSWORD);
      const issued = ok(await lc.post('/api/calendar/feed'), 200);
      const path = new URL(issued.url).pathname;
      const head = await fetch(t.base + path, { method: 'HEAD' });
      assert.equal(head.status, 200, 'HEAD is supported for calendar clients');
      assert.match(head.headers.get('content-type'), /text\/calendar/);
      assert.equal((await head.arrayBuffer()).byteLength, 0, 'HEAD has no body');
      assert.equal((await t.client().get(path)).status, 200);

      const NEW_PASSWORD = 'Taqweem#2026-Safe';
      ok(await lc.post('/api/account/password', { current_password: LAWYER_PASSWORD, new_password: NEW_PASSWORD, new_password_confirm: NEW_PASSWORD }), 200, 'change password');
      assert.equal((await t.client().get(path)).status, 404, 'old feed link stops after the password change');
      const st = ok(await lc.get('/api/calendar/feed'), 200);
      assert.equal(st.active, false);

      // رابط جديد بعد تغيير كلمة المرور يعمل، ثم يتوقف عند تعيين كلمة مرور مؤقتة (استعادة حساب)
      const again = ok(await lc.post('/api/calendar/feed'), 200);
      const path2 = new URL(again.url).pathname;
      assert.equal((await t.client().get(path2)).status, 200);
      t.app.db.run('UPDATE users SET must_change_password = 1 WHERE id = ?', lawyer.id);
      assert.equal((await t.client().get(path2)).status, 404, 'temporary password pauses the feed');
      t.app.db.run('UPDATE users SET must_change_password = 0 WHERE id = ?', lawyer.id);
      assert.equal((await t.client().get(path2)).status, 404, 'and the link stays revoked');

      // إلزام مديري النظام بالتحقق بخطوتين: رابط مدير لم يفعّله يتوقف مؤقتًا حتى يستوفي الشرط
      const adminFeed = ok(await admin.post('/api/calendar/feed'), 200);
      const adminPath = new URL(adminFeed.url).pathname;
      assert.equal((await t.client().get(adminPath)).status, 200);
      t.app.settings.set('security_require_2fa_admins', true);
      try {
        assert.equal((await t.client().get(adminPath)).status, 404, 'restricted admin feed is paused');
      } finally {
        t.app.settings.set('security_require_2fa_admins', false);
      }
      assert.equal((await t.client().get(adminPath)).status, 200, 'resumes once the restriction is lifted');

      // الرابط المُبطل بتغيير كلمة المرور يظهر سببه في حالة الاشتراك
      const third = ok(await lc.post('/api/calendar/feed'), 200);
      t.app.db.run('UPDATE users SET password_changed_at = ? WHERE id = ?', new Date(Date.now() + 60000).toISOString(), lawyer.id);
      const st2 = ok(await lc.get('/api/calendar/feed'), 200);
      assert.equal(st2.active, false);
      assert.equal(st2.invalidated, 'password_changed');
      assert.equal((await t.client().get(new URL(third.url).pathname)).status, 404);
    });

    test('the matter opponent party stays in sync with the matter and cannot be detached from it', async () => {
      const c = await newCase(admin, { clientName: 'إيمان رفعت' });
      const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', opponent: 'رامز عبد الغني' }), 201);
      const party = ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200).items[0];
      assert.equal(party.origin, 'matter_opponent');
      assert.equal((await admin.patch(`/api/admin/parties/${party.id}`, { role: 'witness' })).status, 400, 'role is fixed');
      assert.equal((await admin.del(`/api/admin/parties/${party.id}`)).status, 409, 'cannot delete while the matter names it');
      ok(await admin.patch(`/api/admin/parties/${party.id}`, { name: 'رامز عبد الغني سليمان' }), 200);
      assert.equal(t.app.db.value('SELECT opponent FROM matters WHERE id = ?', m.id), 'رامز عبد الغني سليمان', 'name synced back to the matter');
      const parties = ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200).items;
      assert.equal(parties.length, 1, 'no duplicate party after the sync');
      // حذف الخصم من بيانات الدعوى يحذف الطرف
      ok(await admin.patch(`/api/admin/matters/${m.id}`, { opponent: null }), 200);
      assert.equal(ok(await admin.get(`/api/admin/matters/${m.id}/parties`), 200).items.length, 0);
    });

    test('impact never counts the same recovered right twice (consultation + its matter)', async () => {
      const r0 = ok(await admin.get('/api/admin/impact'), 200);
      const c = await newCase(admin, { clientName: 'ثناء عبد المنعم', legal_area: 'FAM' });
      const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation' }), 201);
      ok(await admin.post(`/api/admin/cases/${c.id}/close`, { outcome: 'resolved', force: true, outcome_value: { outcome_kind: 'alimony_judgment', recovered_monthly: 1500 } }), 200);
      let r1 = ok(await admin.get('/api/admin/impact'), 200);
      assert.equal(r1.value.monthly - r0.value.monthly, 1500, 'consultation value counted while the matter has none');
      ok(await admin.put(`/api/admin/matters/${m.id}/outcome-value`, { outcome_kind: 'alimony_judgment', recovered_monthly: 1500, recovered_one_time: 9000 }), 200);
      r1 = ok(await admin.get('/api/admin/impact'), 200);
      assert.equal(r1.value.monthly - r0.value.monthly, 1500, 'the matter value supersedes the consultation value');
      assert.equal(r1.value.one_time - r0.value.one_time, 9000);
      assert.equal(r1.value.records - r0.value.records, 1);
    });

    test('SLA job batches alerts after the first ten in a run', async () => {
      const now = Date.now();
      try {
        freezeClock(new Date(now - 30 * 3600000).toISOString());
        for (let i = 0; i < 13; i++) ok(await publicIntake(t, {}), 201);
      } finally {
        resetClock();
      }
      const r = t.app.practice.sla.run();
      assert.ok(r.alerted >= 13, JSON.stringify(r));
      assert.equal(r.notified, 11, 'ten individual alerts and one digest');
      const digest = t.app.db.get("SELECT * FROM notifications WHERE type = 'intake.sla_breach' AND link = '#/inbox' ORDER BY id DESC");
      assert.ok(digest, 'digest notification');
      assert.match(digest.title, /طلبات أخرى بلا رد/);
      assert.equal(t.app.practice.sla.run().alerted, 0, 'still once per intake');
    });

    test('applying unverified website data to a verified card clears the verification', async () => {
      const c = await newCase(admin, { clientName: 'سهام فاروق' });
      ok(await admin.put(`/api/admin/clients/${c.clientId}/beneficiary`, { relation: 'widow', verify: true }), 200);
      const r = ok(await publicIntake(t, { phone: c.phone, beneficiary: { relation: 'divorced', housing: 'rented_new', children_count: 2 } }), 201);
      const intake = intakeByCode(t, r.reference);
      const v = ok(await admin.get(qs(`/api/admin/clients/${c.clientId}/beneficiary`, { intake_id: intake.id })), 200);
      assert.equal(v.profile.verified, true);
      const applied = ok(await admin.post(`/api/admin/beneficiary-submissions/${v.intake.submission.id}/apply`), 200);
      assert.equal(applied.profile.relation, 'widow', 'staff data kept');
      assert.equal(applied.profile.housing, 'rented_new', 'empty field filled');
      assert.equal(applied.profile.verified, false, 'verification must be re-confirmed after unverified data entered the card');
    });

    test('merging a duplicate client carries its beneficiary card to the primary client', async () => {
      const primary = await newCase(admin, { clientName: 'منال صبحي' });
      const dup = await newCase(admin, { clientName: 'منال صبحي محمد' });
      ok(await admin.put(`/api/admin/clients/${dup.clientId}/beneficiary`, { relation: 'widow', children_count: 3, monthly_income_band: 'none' }), 200);
      ok(await admin.post(`/api/admin/clients/${primary.clientId}/merge`, { other_client_id: dup.clientId }), 200, 'merge');
      assert.equal(t.app.db.value('SELECT client_id FROM beneficiary_profiles WHERE relation = ? AND client_id IN (?, ?)', 'widow', primary.clientId, dup.clientId), primary.clientId);
      const v = ok(await admin.post(`/api/admin/clients/${primary.clientId}/beneficiary/verify`), 200, 'verify after merge');
      assert.equal(v.profile.verified, true);
      assert.equal(v.profile.children_count, 3);
      const csv = await admin.get('/api/admin/data/export/clients');
      const line = csv.body.split('\r\n').find((l) => l.includes(primary.detail.client.code));
      assert.ok(line && line.includes('أرملة'), 'export shows the carried-over card');
    });

    test('a failure while saving self-reported family data never breaks the public intake', async () => {
      t.app.db.run('ALTER TABLE beneficiary_submissions RENAME TO beneficiary_submissions_off');
      try {
        const r = ok(await publicIntake(t, { beneficiary: { relation: 'widow', children_count: 2 } }), 201, 'intake still created');
        assert.ok(r.reference && r.portal_url, 'reference and portal link returned');
      } finally {
        t.app.db.run('ALTER TABLE beneficiary_submissions_off RENAME TO beneficiary_submissions');
      }
    });
  });
});
