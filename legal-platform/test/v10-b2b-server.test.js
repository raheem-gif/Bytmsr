// v10 b2b-server — خدمة الشركات: المخطط (80–85)، الكتالوج والتسميات والإعدادات، دخول مستخدمي الشركات وأمان حساباتهم،
// والشركات والكيانات والمستخدمين والباقات والاشتراكات (SRV-0 … SRV-5). اختبارات العزل في v10-b2b-server-isolation.test.js
// ومواعيد الخدمة في v10-b2b-server-sla.test.js.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startTestApp, Client, freezeClock, resetClock } from './helpers.js';
import { Db } from '../src/db.js';
import { LABELS, DEFAULT_SETTINGS, CODE_PREFIX } from '../src/constants.js';
import { seedB2bDemo, COMPANY_DEMO_PASSWORD, DEMO_PLANS } from '../src/seed-v10-b2b.js';
import { totp } from '../src/totp.js';
import * as CAT from '../public/assets/js/lib/company-catalog.js';
import * as FIELDS from '../public/assets/js/lib/company-catalog-fields.js';
import { validateTerms } from '../src/services/company-billing.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PW = COMPANY_DEMO_PASSWORD;

/** عميل البوابة: يحفظ كعكة bm_csid ويستطيع انتحال عنوان IP (مع TRUST_PROXY=1) */
class CompanyClient extends Client {
  constructor(base, ip = null) {
    super(base);
    this.ip = ip;
  }
  async request(method, url, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.ip) h['x-forwarded-for'] = this.ip;
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
      this.lastSetCookie = set;
    }
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
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
const companyId = (app, prefix) => app.db.get('SELECT id FROM companies WHERE prefix = ?', prefix).id;
const cuId = (app, email) => app.db.get('SELECT id FROM company_users WHERE email = ?', email).id;

async function b2bApp(config = {}) {
  const t = await startTestApp({ seed: 'none', config });
  await seedB2bDemo(t.app);
  t.app.lawyers.createStaff({ role: 'case_manager', username: 'manager', name: 'منى السيد', password: 'Manager@2026' });
  t.company = (ip) => new CompanyClient(t.base, ip);
  return t;
}

// ───────────────────────── SRV-0: المخطط ─────────────────────────
describe('v10 schema 80–85 — additive and idempotent (SRV-0, INV-8, G-4 rehearsal)', () => {
  test('two starts on a fresh database: every table exists once, foreign keys clean, users and its CHECK untouched', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-schema-'));
    try {
      for (let i = 0; i < 2; i++) {
        const db = new Db(path.join(dir, 'a.db'));
        const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
        for (const tname of ['companies', 'company_entities', 'company_users', 'company_team', 'company_sessions', 'company_login_challenges', 'company_user_2fa', 'company_recovery_codes', 'company_account_tokens', 'company_login_locks', 'company_requests', 'company_request_watchers', 'company_messages', 'company_message_documents', 'company_request_notes', 'company_quotes', 'company_deliverables', 'company_deliverable_documents', 'company_sla_pauses', 'company_request_alerts', 'company_request_memory', 'assignment_memory_grants', 'company_uploads', 'company_counterparties', 'company_memory', 'company_memory_documents', 'company_memory_reminders', 'company_plans', 'company_subscriptions', 'company_charges', 'company_notifications', 'email_outbox']) {
          assert.ok(tables.includes(tname), `${tname} exists`);
        }
        for (const gone of ['company_invoices', 'company_payments', 'company_login_devices']) assert.ok(!tables.includes(gone), `${gone} is deferred (L-15/L-31)`);
        assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
        const cols = (tb) => db.all(`PRAGMA table_info(${tb})`).map((r) => r.name);
        for (const [tb, c] of [['documents', 'assignment_id'], ['documents', 'company_user_id'], ['lawyers', 'name_latin'], ['cases', 'company_request_id'], ['clients', 'company_id'], ['knowledge_records', 'scope'], ['company_requests', 'confirm_due_at'], ['company_requests', 'accept_plan_error'], ['company_requests', 'priority_changed_reason'], ['company_requests', 'memory_item_id'], ['company_charges', 'replaces_charge_id']]) {
          assert.ok(cols(tb).includes(c), `${tb}.${c}`);
        }
        assert.ok(!cols('company_charges').includes('invoice_id'), 'invoice_id arrives in 10.1');
        assert.match(db.value("SELECT sql FROM sqlite_master WHERE name = 'users'"), /CHECK \(role IN \('admin','case_manager','lawyer'\)\)/);
        db.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a 9.2-shaped database (no 80–85) with documents, activity, security events and a saved TOTP issuer upgrades twice cleanly', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-upgrade-'));
    const file = path.join(dir, 'old.db');
    try {
      // قاعدة 9.2: المخطط الأساسي وملفات schema.d قبل 80 فقط
      const raw = new DatabaseSync(file);
      raw.exec('PRAGMA foreign_keys = ON;');
      raw.exec(fs.readFileSync(path.join(ROOT, 'src/schema.sql'), 'utf8'));
      const files = fs.readdirSync(path.join(ROOT, 'src/schema.d')).filter((f) => Number(f.slice(0, 2)) < 80).sort();
      for (const f of files.filter((x) => x.endsWith('.columns.json'))) {
        for (const [tb, col, ddl] of JSON.parse(fs.readFileSync(path.join(ROOT, 'src/schema.d', f), 'utf8'))) {
          const have = raw.prepare(`PRAGMA table_info(${tb})`).all().map((r) => r.name);
          if (have.length && !have.includes(col)) raw.exec(`ALTER TABLE ${tb} ADD COLUMN ${col} ${ddl}`);
        }
      }
      for (const f of files.filter((x) => x.endsWith('.sql'))) raw.exec(fs.readFileSync(path.join(ROOT, 'src/schema.d', f), 'utf8'));
      const t = new Date().toISOString();
      raw.prepare("INSERT INTO users (role, username, name, password_hash, created_at) VALUES ('admin','old','مدير قديم','x',?)").run(t);
      raw.prepare("INSERT INTO clients (code, name, created_at, updated_at) VALUES ('CL-00001','عميلة',?,?)").run(t, t);
      raw.prepare("INSERT INTO documents (client_id, title, filename, mime, size, sha256, storage_key, uploaded_by_kind, created_at) VALUES (1,'مستند','a.pdf','application/pdf',1,'x','k','client',?)").run(t);
      raw.prepare("INSERT INTO activity (actor_kind, type, summary, created_at) VALUES ('staff','x','نشاط',?)").run(t);
      raw.prepare("INSERT INTO security_events (type, user_id, summary, created_at) VALUES ('auth.login',1,'دخول',?)").run(t);
      raw.prepare("INSERT INTO settings (key, value) VALUES ('security_totp_issuer', '\"Saved Issuer\"')").run();
      raw.close();
      for (let i = 0; i < 2; i++) {
        const db = new Db(file);
        // عمودا الشركة على سجل الأمان يضيفهما createAudit() عند تشغيل التطبيق
        const { createAudit } = await import('../src/services/platform.js');
        createAudit({ db, log: () => {} });
        assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
        assert.equal(db.value("SELECT value FROM settings WHERE key = 'security_totp_issuer'"), '"Saved Issuer"', 'saved issuer kept');
        assert.equal(Number(db.value('SELECT COUNT(*) FROM documents')), 1);
        assert.equal(db.get('SELECT company_id FROM documents').company_id, null);
        assert.ok(db.all('PRAGMA table_info(security_events)').map((r) => r.name).includes('company_id'));
        assert.equal(Number(db.value('SELECT COUNT(*) FROM security_events')), 1);
        assert.ok(db.get("SELECT 1 FROM sqlite_master WHERE name = 'company_requests'"));
        db.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────── SRV-1: الكتالوج والتسميات والإعدادات ─────────────────────────
describe('v10 catalogue, labels and settings (SRV-1, L-24, L-50, L-57, L-63)', () => {
  test('12 request types in the user’s order with UX §5.6 labels, ≤ 4 required main fields, title templates and documents rules', () => {
    assert.deepEqual(CAT.REQUEST_TYPE_KEYS, ['contract_review', 'contract_drafting', 'nda', 'employment', 'marketing_review', 'legal_notice', 'board_resolution', 'supplier_issue', 'compliance_question', 'renewal_followup', 'dispute', 'other']);
    assert.equal(CAT.typeByKey('contract_review').company_label, 'مراجعة عقد');
    assert.equal(CAT.typeByKey('legal_notice').company_label, 'إنذار أو مطالبة وصلتكم');
    assert.deepEqual(CAT.REQUEST_TYPES.filter((x) => x.requires_document).map((x) => x.key), ['contract_review', 'legal_notice']);
    assert.equal(CAT.typeByKey('employment').default_visibility, 'private');
    for (const ty of FIELDS.REQUEST_TYPES) {
      const main = ty.fields.filter((f) => f.visible === 'main' && f.required);
      assert.ok(main.length <= 4, `${ty.key}: ${main.length} required main fields`);
      assert.ok(!ty.fields.some((f) => f.key === 'deadline'), `${ty.key}: type deadline fields are replaced by needed_by`);
      for (const f of ty.fields) assert.equal(f.dir, 'auto');
    }
    assert.equal(FIELDS.renderTitle('contract_review', { contract_kind: 'supply', counterparty_name: 'الدلتا للتغليف' }), 'مراجعة عقد توريد مع الدلتا للتغليف');
    assert.equal(FIELDS.renderTitle('nda', {}), 'اتفاقية سرية');
    assert.ok(FIELDS.TYPE_FIELDS.nda.some((f) => f.key === 'template_memory_id' && f.kind === 'memory_ref'));
    assert.ok(FIELDS.COMMON_FIELDS.some((f) => f.key === 'output_language' && f.default === 'ar'));
  });

  test('stage tones and icons (L-63): delivered = warning + checkCircle, closed = success, every warning stage has an icon', () => {
    const s = Object.fromEntries(CAT.STAGES.map((x) => [x.key, x]));
    assert.equal(s.delivered.tone, 'warning');
    assert.equal(s.delivered.icon, 'checkCircle');
    assert.equal(s.closed.tone, 'success');
    assert.equal(s.delivered.company_label, 'تم التسليم — بانتظار اعتمادكم');
    for (const st of CAT.STAGES.filter((x) => x.tone === 'warning')) assert.ok(st.icon, `${st.key} has an icon`);
    assert.deepEqual(Object.keys(LABELS.company_stage), CAT.STAGES.map((x) => x.key));
  });

  test('memory kinds: lawyer whitelist per L-57, people never grantable, member-writable kinds per B10-39', () => {
    const k = (key) => CAT.memoryKindByKey(key);
    assert.deepEqual([...k('contract').lawyer_fields], ['our_role', 'contract_kind', 'renewal_type', 'term_months', 'notice_days', 'governing_law', 'signed', 'signed_at', 'key_terms']);
    assert.deepEqual([...k('position').lawyer_fields], ['topic', 'decision', 'decided_at', 'applies_to']);
    assert.equal(k('person').grantable, false);
    assert.deepEqual([...k('person').lawyer_fields], []);
    assert.deepEqual([...CAT.MEMBER_MEMORY_KINDS].sort(), ['contract', 'key_date', 'licence', 'template']);
    assert.equal(CAT.memoryKindBySlug('key-dates').key, 'key_date');
    assert.deepEqual(FIELDS.lawyerMemoryData('position', { topic: 'سقف', decision: 'x', decided_by_text: 'مريم عادل — مديرة الموارد البشرية' }), { topic: 'سقف', decision: 'x' });
    assert.deepEqual(FIELDS.lawyerMemoryData('person', { person_name: 'س' }), {});
    const dates = FIELDS.computeMemoryDates('contract', { end_date: '2026-12-31', data: { renewal_type: 'auto', notice_days: 30 } }, { today: '2026-10-08' });
    assert.deepEqual(dates, { notice_deadline: '2026-12-01', next_date: '2026-12-01' });
  });

  test('shared validation: required, options, past dates, money, conditional requirements', () => {
    const r = FIELDS.validateFields('contract_review', { counterparty_name: 'الدلتا', contract_kind: 'nope', contract_value: '12,000.50', signing_deadline: '2020-01-01' }, { today: '2026-10-08' });
    assert.equal(r.errors.contract_kind, 'اختاروا من القائمة.');
    assert.equal(r.errors.our_role, 'هذا الحقل مطلوب.');
    assert.equal(r.errors.signing_deadline, 'اختاروا تاريخًا من اليوم أو بعده.');
    assert.equal(r.values.contract_value, 12000.5);
    assert.equal(r.values.currency, 'EGP');
    assert.equal(r.values.output_language, 'ar');
    assert.equal(FIELDS.validateFields('contract_review', { contract_value: '12k' }).errors.contract_value, 'اكتبوا رقمًا فقط، مثل 1200000.');
    const ren = FIELDS.validateFields('renewal_followup', { action: 'renew', memory_id: 4 });
    assert.deepEqual(ren.errors, {}, 'a memory item replaces the name and expiry date');
    assert.equal(FIELDS.validateMemory('contract', { title: 'عقد', counterparty_name: 'س', start_date: '2026-05-01', end_date: '2026-04-01' }).errors.end_date, 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.');
  });

  test('company-facing copy: MSA register, L-50 vocabulary, no hourly basis (G-2), no invoices', () => {
    const files = ['public/assets/js/lib/company-catalog.js', 'public/assets/js/lib/company-catalog-fields.js', 'public/assets/js/lib/company-sla.js', 'src/services/company-notify.js', 'src/services/email.js', 'src/company-auth.js'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/مسؤول(و)? (ال)?حساب/.test(src), `${f}: L-50 role names`);
      for (const w of ['مش ', 'عايز', 'دلوقتي', 'إزاي', 'حضرتك']) assert.ok(!src.includes(w), `${f}: colloquial «${w.trim()}»`);
      if (f.includes('company-catalog')) assert.ok(!/hourly/.test(src), `${f}: no hourly quotes in 10.0`);
    }
    assert.deepEqual(CAT.QUOTE_BASES.map((x) => x.key), ['fixed', 'capped']);
    assert.equal(LABELS.company_user_role.company_admin, 'مدير البوابة');
    assert.ok(!('company_invoice_status' in LABELS));
  });

  test('labels: every company audit type is labelled (and merged into security_event); new code prefixes', () => {
    for (const k of Object.keys(LABELS.company_security_event)) {
      assert.ok(/^(company|company_auth|email)\./.test(k), `${k} uses the three L-20 prefixes`);
      assert.equal(LABELS.security_event[k], LABELS.company_security_event[k]);
    }
    assert.equal(CODE_PREFIX.company, 'CO');
    assert.equal(CODE_PREFIX.quote, 'Q');
    assert.equal(LABELS.actor_kind.company, 'الشركة');
    assert.equal(LABELS.channel.company_portal, 'بوابة الشركة');
    assert.ok(LABELS.ai_feature.company_triage && LABELS.ai_field.company_type && LABELS.ai_doc_type.nda);
  });

  test('settings defaults (§4.9) and guard #23: b2b_*/company_* are not writable through PATCH /api/admin/settings', async () => {
    assert.equal(DEFAULT_SETTINGS.b2b_business_hours, null);
    assert.deepEqual(DEFAULT_SETTINGS.b2b_urgent_hours, { days: [0, 1, 2, 3, 4, 5, 6], from: '08:00', to: '22:00' });
    assert.equal(DEFAULT_SETTINGS.b2b_storage_mb, 2048);
    assert.equal(DEFAULT_SETTINGS.b2b_terms_url, '');
    assert.equal(DEFAULT_SETTINGS.b2b_notifications_retention_days, 180);
    for (const gone of ['b2b_invoice_due_days', 'b2b_invoice_title', 'b2b_tax_rate_bp', 'b2b_auto_issue_invoices', 'company_totp_issuer']) assert.ok(!(gone in DEFAULT_SETTINGS), gone);
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      ok(await admin.patch('/api/admin/settings', { b2b_enabled: false, company_session_idle_hours: 1, b2b_storage_mb: 1 }));
      assert.equal(t.app.settings.get('b2b_enabled'), true);
      assert.equal(t.app.settings.get('company_session_idle_hours'), 12);
      assert.equal(t.app.settings.get('b2b_storage_mb'), 2048);
    } finally {
      await t.close();
    }
  });

  test('demo plan terms pass validation; bad terms are refused with field errors', () => {
    for (const p of DEMO_PLANS) assert.equal(validateTerms(p.terms).tier, p.key);
    assert.throws(() => validateTerms({ sla: { normal: { first_response_hours: 0, delivery_hours: 5, clock: 'business' } } }), /مواعيد/);
    assert.throws(() => validateTerms({ scope_types: ['no_such_type'] }), /غير صالحة/);
    assert.throws(() => validateTerms({ size_factor: { S: 9 } }), /معامل الحجم/);
    assert.throws(() => validateTerms({ overage_policy: 'bill', overage_price_minor: null }), /سعر الطلب الإضافي/);
  });
});

// ───────────────────────── SRV-2: دخول مستخدمي الشركات ─────────────────────────
describe('v10 company auth (SRV-2, L-15 … L-17, L-34, CS-3, CS-24, CS-27, CS-28)', () => {
  let t;
  let prevTrust;
  before(async () => {
    prevTrust = process.env.TRUST_PROXY;
    process.env.TRUST_PROXY = '1';
    t = await b2bApp();
  });
  after(async () => {
    if (prevTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrust;
    resetClock();
    await t.close();
  });

  test('wrong password, unknown e-mail and a pending invite all get the same generic 401', async () => {
    const c = t.company('10.0.0.1');
    const a = await c.post('/api/company/auth/login', { email: 'mariam@nilefoods.example', password: 'Wrong#Pass1' });
    const b = await c.post('/api/company/auth/login', { email: 'nobody@nilefoods.example', password: 'Wrong#Pass1' });
    assert.equal(a.status, 401);
    assert.deepEqual(a.body, b.body);
    assert.deepEqual(a.body, { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.', code: 'invalid_credentials' });
    // دعوة لم تُقبل
    const admin = await t.login('admin');
    ok(await admin.post(`/api/admin/companies/${companyId(t.app, 'NFD')}/users`, { name: 'مدعو جديد', email: 'pending@nilefoods.example', role: 'member' }), 201);
    const p = await c.post('/api/company/auth/login', { email: 'pending@nilefoods.example', password: '!invite-pending' });
    assert.deepEqual(p.body, a.body);
  });

  test('lockout is per (account, IP): 5 failures lock that IP only; the owner still signs in from another network', async () => {
    const bad = t.company('10.0.1.1');
    for (let i = 0; i < 5; i++) assert.equal((await bad.post('/api/company/auth/login', { email: 'omar@techsol.example', password: `Wrong#${i}x` })).status, 401);
    const locked = await bad.post('/api/company/auth/login', { email: 'omar@techsol.example', password: PW });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'locked');
    assert.ok(locked.body.details.retry_after_minutes >= 1);
    assert.match(locked.body.error, /حاولوا بعد .*«نسيت كلمة المرور»/);
    ok(await t.company('10.0.1.2').login('omar@techsol.example'));
    const ev = t.app.db.get("SELECT * FROM security_events WHERE type = 'company_auth.lockout' ORDER BY id DESC LIMIT 1");
    assert.equal(ev.user_id, null, 'no company id in the staff user column (L-19)');
    assert.equal(ev.company_user_id, cuId(t.app, 'omar@techsol.example'));
  });

  test('CS-3: 40 bad logins from 40 IPs fill only the failures bucket — the correct password still signs in', async () => {
    let tooMany = 0;
    for (let i = 0; i < 40; i++) {
      const r = await t.company(`10.1.${i}.1`).post('/api/company/auth/login', { email: 'hossam@nilefoods.example', password: `Nope#${i}abc` });
      assert.ok([401, 429].includes(r.status));
      if (r.status === 429) {
        tooMany += 1;
        assert.equal(r.body.code, 'rate_limited');
      }
    }
    assert.ok(tooMany >= 9, `wrong passwords past 30 failures get 429 (${tooMany})`);
    ok(await t.company('10.2.0.1').login('hossam@nilefoods.example'));
    // 10 إخفاقات متتالية ← تنبيه حرج وإشعار لمديري النظام
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company_auth.login_failed' AND severity = 'critical' AND company_user_id = ?", cuId(t.app, 'hossam@nilefoods.example')));
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'security' AND title LIKE '%مستخدم شركة%'"));
  });

  test('2FA: challenge, wrong code = 400 invalid_code with attempts_left, replay refused, recovery code single use', async () => {
    const id = cuId(t.app, 'sherif@techsol.example');
    const secret = Buffer.from('12345678901234567890');
    const codes = t.app.companyAuth.seedEnableTwoFactor(id, secret);
    const c = t.company('10.3.0.1');
    const step1 = await c.post('/api/company/auth/login', { email: 'sherif@techsol.example', password: PW });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.two_factor_required, true);
    assert.ok(!c.cookie, 'no session before the second factor');
    const wrong = await c.post('/api/company/auth/login/2fa', { challenge: step1.body.challenge, code: '000000' === totp(secret) ? '111111' : '000000' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, 'invalid_code');
    assert.equal(wrong.body.details.attempts_left, 4);
    const code = totp(secret, Date.now());
    const good = await c.post('/api/company/auth/login/2fa', { challenge: step1.body.challenge, code });
    assert.equal(good.status, 200);
    assert.equal(good.body.user.two_factor, true);
    assert.ok(c.cookie);
    // نفس الرمز مرة أخرى
    const c2 = t.company('10.3.0.2');
    const s2 = await c2.post('/api/company/auth/login', { email: 'sherif@techsol.example', password: PW });
    const replay = await c2.post('/api/company/auth/login/2fa', { challenge: s2.body.challenge, code });
    assert.equal(replay.status, 400);
    const rec = await c2.post('/api/company/auth/login/2fa', { challenge: s2.body.challenge, recovery_code: codes[0] });
    assert.equal(rec.status, 200);
    assert.equal(rec.body.recovery_codes_remaining, 9);
    const c3 = t.company('10.3.0.3');
    const s3 = await c3.post('/api/company/auth/login', { email: 'sherif@techsol.example', password: PW });
    assert.equal((await c3.post('/api/company/auth/login/2fa', { challenge: s3.body.challenge, recovery_code: codes[0] })).status, 400, 'used recovery code');
    // تحدٍّ غير معروف
    const gone = await c3.post('/api/company/auth/login/2fa', { challenge: 'x'.repeat(40), code: '123456' });
    assert.equal(gone.status, 410);
    assert.equal(gone.body.code, 'challenge_expired');
  });

  test('require_2fa restricts the account (403 two_factor_enrollment_required) until enrolment; disabling is refused (409)', async () => {
    const nfd = companyId(t.app, 'NFD');
    const admin = await t.login('admin');
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { require_2fa: true }));
    const c = t.company('10.4.0.1');
    const r = await c.login('dina@nilefoods.example');
    assert.equal(r.body.user.restricted, 'two_factor_enrollment');
    const plan = await c.get('/api/company/plan');
    assert.equal(plan.status, 403);
    assert.equal(plan.body.code, 'two_factor_enrollment_required');
    ok(await c.get('/api/company/me'));
    const setup = ok(await c.post('/api/company/me/2fa/setup', {}));
    assert.equal(setup.issuer, t.app.settings.get('security_totp_issuer'), 'one issuer setting (L-04)');
    assert.equal(setup.account, 'dina@nilefoods.example');
    const { base32Decode } = await import('../src/totp.js');
    const en = ok(await c.post('/api/company/me/2fa/enable', { code: totp(base32Decode(setup.secret), Date.now()) }));
    assert.equal(en.recovery_codes.length, 10);
    ok(await c.get('/api/company/plan'));
    const dis = await c.post('/api/company/me/2fa/disable', { password: PW, code: en.recovery_codes[0] });
    assert.equal(dis.status, 409);
    assert.equal(dis.body.code, 'company_requires_2fa');
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { require_2fa: false }));
  });

  test('invite link: inspect (masked e-mail, inviter), weak password and missing terms refused, reuse 410, re-issue revokes', async () => {
    const nfd = companyId(t.app, 'NFD');
    const admin = await t.login('admin');
    const inv = ok(await admin.post(`/api/admin/companies/${nfd}/users`, { name: 'سلمى جاد', email: 'salma@nilefoods.example', role: 'member' }), 201);
    assert.equal(inv.invite.emailed, false, 'outbox provider: copy-once link');
    const token1 = inv.invite.url.split('/invite/')[1];
    const c = t.company('10.5.0.1');
    const look = ok(await c.post('/api/company/auth/link', { token: token1 }));
    assert.equal(look.kind, 'invite');
    assert.equal(look.user.email_masked, 's•••@nilefoods.example');
    assert.deepEqual(look.inviter, { kind: 'team' });
    assert.equal(look.company.name, 'شركة النيل للأغذية');
    const re = ok(await admin.post(`/api/admin/company-users/${inv.user.id}/invite`));
    const token2 = re.invite.url.split('/invite/')[1];
    const revoked = await c.post('/api/company/auth/link', { token: token1 });
    assert.equal(revoked.status, 410);
    assert.equal(revoked.body.code, 'link_revoked');
    const weak = await c.post('/api/company/auth/invite/accept', { token: token2, name: 'سلمى جاد', password: '12345678', password_confirm: '12345678', accept_terms: true });
    assert.equal(weak.status, 400);
    const noTerms = await c.post('/api/company/auth/invite/accept', { token: token2, name: 'سلمى جاد', password: PW, password_confirm: PW });
    assert.equal(noTerms.status, 400);
    assert.equal(noTerms.body.details.fields.accept_terms, 'يلزم الموافقة على شروط الاستخدام لتفعيل الحساب.');
    const crlf = await c.post('/api/company/auth/invite/accept', { token: token2, name: 'سلمى\r\nBcc: x@evil.example', password: PW, password_confirm: PW, accept_terms: true });
    assert.equal(crlf.status, 400, 'CR/LF in a name that reaches e-mail headers (CS-4)');
    const done = ok(await c.post('/api/company/auth/invite/accept', { token: token2, name: 'سلمى جاد', password: PW, password_confirm: PW, accept_terms: true }));
    assert.equal(done.user.email, 'salma@nilefoods.example');
    assert.ok(c.cookie, 'invite acceptance signs in');
    assert.ok(t.app.db.get('SELECT terms_accepted_at FROM company_users WHERE email = ?', 'salma@nilefoods.example').terms_accepted_at);
    const again = await t.company('10.5.0.2').post('/api/company/auth/invite/accept', { token: token2, name: 'x', password: PW, password_confirm: PW, accept_terms: true });
    assert.equal(again.status, 410);
    assert.equal(again.body.code, 'link_used');
  });

  test('forgot always answers the same; without an e-mail provider no link is issued; a staff reset link does not sign in and revokes sessions (L-17)', async () => {
    const c = t.company('10.6.0.1');
    const before = Number(t.app.db.value("SELECT COUNT(*) FROM company_account_tokens WHERE kind = 'reset'"));
    assert.deepEqual(ok(await c.post('/api/company/auth/forgot', { email: 'mariam@nilefoods.example' })), { ok: true });
    assert.deepEqual(ok(await c.post('/api/company/auth/forgot', { email: 'nobody@x.example' })), { ok: true });
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM company_account_tokens WHERE kind = 'reset'")), before, 'outbox provider: nothing issued');
    const live = t.company('10.6.0.2');
    await live.login('mariam@nilefoods.example');
    const admin = await t.login('admin');
    const r = ok(await admin.post(`/api/admin/company-users/${cuId(t.app, 'mariam@nilefoods.example')}/reset-link`));
    assert.match(r.reset.url, /\/company#\/reset\//);
    const token = r.reset.url.split('/reset/')[1];
    const res = await c.post('/api/company/auth/reset', { token, password: 'Nile#Foods2026', password_confirm: 'Nile#Foods2026' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, email: 'mariam@nilefoods.example', two_factor_enabled: false });
    assert.ok(!c.cookie, 'no session from a reset link');
    assert.equal((await live.get('/api/company/me')).status, 401, 'every session revoked');
    ok(await t.company('10.6.0.3').login('mariam@nilefoods.example', 'Nile#Foods2026'));
    assert.ok(t.app.db.get("SELECT 1 FROM company_notifications WHERE type = 'security.password_changed' AND company_user_id = ?", cuId(t.app, 'mariam@nilefoods.example')));
    // ونعيد كلمة المرور الموحدة لبقية الاختبارات
    const cu = t.app.db.get('SELECT id FROM company_users WHERE email = ?', 'mariam@nilefoods.example');
    t.app.db.update('company_users', cu.id, { password_hash: t.app.companyAuth.passwordHash(PW) });
  });

  test('password change: wrong current refused, success revokes other sessions and sends a security notice (portal + e-mail row)', async () => {
    const a = t.company('10.7.0.1');
    const b = t.company('10.7.0.2');
    await a.login('omar@techsol.example');
    await b.login('omar@techsol.example');
    const wrong = await a.post('/api/company/me/password', { current_password: 'Wrong#123x', password: 'Tech#Sol2027', password_confirm: 'Tech#Sol2027' });
    assert.equal(wrong.status, 400);
    const res = ok(await a.post('/api/company/me/password', { current_password: PW, password: 'Tech#Sol2027', password_confirm: 'Tech#Sol2027' }));
    assert.ok(res.other_sessions_revoked >= 1);
    assert.equal((await b.get('/api/company/me')).status, 401);
    ok(await a.get('/api/company/me'));
    const mail = t.app.db.get("SELECT * FROM email_outbox WHERE purpose = 'security' AND to_address = 'omar@techsol.example' ORDER BY id DESC");
    assert.ok(mail);
    assert.match(mail.body_text, /إن لم تكونوا أنتم فتواصلوا مع مديري البوابة في شركتكم فورًا/);
    const sessions = ok(await a.get('/api/company/me/sessions'));
    assert.equal(sessions.items.length, 1);
    assert.equal(sessions.items[0].current, true);
    t.app.db.update('company_users', cuId(t.app, 'omar@techsol.example'), { password_hash: t.app.companyAuth.passwordHash(PW) });
  });

  test('a deactivated user and an ended company lose their live sessions on the next request (CS-28); read-only allows only the allow-list (L-34)', async () => {
    const admin = await t.login('admin');
    const c = t.company('10.8.0.1');
    await c.login('omar@techsol.example');
    ok(await admin.patch(`/api/admin/company-users/${cuId(t.app, 'omar@techsol.example')}`, { active: false }));
    assert.equal((await c.get('/api/company/me')).status, 401);
    const blocked = await c.post('/api/company/auth/login', { email: 'omar@techsol.example', password: PW });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'account_inactive');
    ok(await admin.patch(`/api/admin/company-users/${cuId(t.app, 'omar@techsol.example')}`, { active: true }));

    const tsl = companyId(t.app, 'TSL');
    const s = t.company('10.8.0.2');
    await s.login('omar@techsol.example');
    ok(await admin.post(`/api/admin/companies/${tsl}/status`, { status: 'suspended', reason: 'انتهت الفترة التجريبية' }));
    ok(await s.get('/api/company/plan')); // reads keep working
    const w = await s.patch('/api/company/me', { job_title: 'وظيفة' });
    assert.equal(w.status, 200, 'me/* stays writable');
    const sherif = t.company('10.8.0.3');
    const lg = await sherif.post('/api/company/auth/login', { email: 'sherif@techsol.example', password: PW });
    assert.equal(lg.status, 200);
    if (lg.body.two_factor_required) {
      t.app.db.run('DELETE FROM company_user_2fa WHERE company_user_id = ?', cuId(t.app, 'sherif@techsol.example'));
      await sherif.login('sherif@techsol.example');
    }
    const inv = await sherif.post('/api/company/team/invite', { name: 'جديد', email: 'new@techsol.example' });
    assert.equal(inv.status, 403);
    assert.equal(inv.body.code, 'company_read_only');
    assert.equal(inv.body.error, 'حساب شركتكم في وضع الاطلاع فقط؛ لا يمكن إرسال طلبات أو ردود الآن.');
    // دعوة صدرت قبل الإيقاف لا تُقبل أثناءه
    t.app.db.run('UPDATE companies SET status = ? WHERE id = ?', 'active', tsl);
    const pending = ok(await admin.post(`/api/admin/companies/${tsl}/users`, { name: 'لاحق', email: 'later@techsol.example', role: 'viewer' }), 201);
    t.app.db.run('UPDATE companies SET status = ? WHERE id = ?', 'suspended', tsl);
    const acc = await t.company('10.8.0.4').post('/api/company/auth/invite/accept', { token: pending.invite.url.split('/invite/')[1], name: 'لاحق', password: PW, password_confirm: PW, accept_terms: true });
    assert.equal(acc.status, 403);
    assert.equal(acc.body.code, 'company_read_only');
    // منتهية بعد نافذة الاطلاع: لا دخول، والجلسات تسقط
    t.app.db.run("UPDATE companies SET status = 'ended', ended_at = ? WHERE id = ?", new Date(Date.now() - 100 * 86400000).toISOString(), tsl);
    assert.equal((await s.get('/api/company/me')).status, 401);
    const ended = await t.company('10.8.0.5').post('/api/company/auth/login', { email: 'omar@techsol.example', password: PW });
    assert.equal(ended.status, 403);
    assert.equal(ended.body.code, 'company_ended');
    t.app.db.run("UPDATE companies SET status = 'trial', ended_at = NULL WHERE id = ?", tsl);
  });

  test('idle timeout ends a session; background requests do not extend it', async () => {
    const c = t.company('10.9.0.1');
    await c.login('mariam@nilefoods.example');
    const base = Date.now();
    freezeClock(new Date(base + 6 * 3600000).toISOString());
    ok(await c.get('/api/company/me', { 'x-background-request': '1' }));
    freezeClock(new Date(base + 12.5 * 3600000).toISOString());
    assert.equal((await c.get('/api/company/me')).status, 401, 'idle 12 h since the last real activity');
    resetClock();
  });

  test('company auth events carry company ids and never a staff user id; every type is labelled', () => {
    const rows = t.app.db.all("SELECT type, user_id, actor_name, company_id, company_user_id FROM security_events WHERE type LIKE 'company_auth.%'");
    assert.ok(rows.length > 10);
    const staff = new Map(t.app.db.all('SELECT id, name FROM users').map((u) => [u.id, u.name]));
    for (const r of rows) {
      // user_id يحمل فقط حساب الإدارة الذي قام بالفعل (مثل رابط إعادة التعيين)، ولا يحمل رقم مستخدم شركة أبدًا (L-19)
      if (r.user_id !== null) assert.equal(r.actor_name, staff.get(r.user_id), `${r.type}: user_id is a staff actor`);
      assert.ok(LABELS.security_event[r.type], `${r.type} labelled`);
    }
    for (const r of rows.filter((x) => /^company_auth\.(login|login_failed|lockout|logout|password_changed|2fa_)/.test(x.type))) assert.equal(r.user_id, null, `${r.type}: user_id NULL`);
    assert.ok(rows.filter((r) => r.type === 'company_auth.login').every((r) => r.company_id && r.company_user_id));
  });
});

// ───────────────────────── SRV-4: الشركات والكيانات والمستخدمون ─────────────────────────
describe('v10 companies, entities, users, plans and subscriptions (SRV-4, L-60, L-62, CS-6, CS-7, CS-28, CS-34)', () => {
  let t;
  let admin;
  let cm;
  before(async () => {
    t = await b2bApp();
    admin = await t.login('admin');
    cm = await t.login('manager');
  });
  after(async () => t && t.close());

  test('create (admin only): shadow client marked with company_id, CO- code, parent entity, subscription, copy-once invite, non-blocking conflicts', async () => {
    const body = { name: 'الدلتا للمقاولات', prefix: 'DLT', status: 'active', account_manager_id: t.app.db.get("SELECT id FROM users WHERE username='manager'").id, plan_id: t.app.db.get("SELECT id FROM company_plans WHERE key='starter'").id, first_admin: { name: 'نادر سالم', email: 'nader@delta.example' } };
    assert.equal((await cm.post('/api/admin/companies', body)).status, 403);
    const r = ok(await admin.post('/api/admin/companies', body), 201);
    assert.match(r.company.code, /^CO-\d{5}$/);
    assert.equal(r.invite.emailed, false);
    assert.match(r.invite.url, /\/company#\/invite\//);
    assert.ok(Array.isArray(r.conflicts));
    const c = t.app.db.get('SELECT * FROM companies WHERE prefix = ?', 'DLT');
    assert.equal(t.app.db.get('SELECT company_id FROM clients WHERE id = ?', c.client_id).company_id, c.id);
    assert.equal(t.app.db.get("SELECT relation FROM company_entities WHERE company_id = ?", c.id).relation, 'parent');
    assert.equal(r.subscription.plan_key, 'starter');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.created' AND company_id = ?", c.id));
    // البادئات: محجوزة، مستخدمة، غير صالحة
    for (const [p, reason] of [['COM', 'reserved'], ['KR', 'reserved'], ['NFD', 'taken'], ['n1', 'invalid']]) {
      assert.equal(ok(await admin.get(`/api/admin/companies/prefix-check?prefix=${p}`)).reason, reason, p);
      const bad = await admin.post('/api/admin/companies', { ...body, prefix: p, first_admin: { name: 'س', email: `x${p}@y.example` } });
      assert.equal(bad.status, 400, p);
    }
    // مدير العلاقة: حساب إدارة نشط فقط
    const lawyer = t.app.lawyers.create({ username: 'tarek', name: 'طارق النجار', password: 'Lawyer@2026', title: 'أ.', specialties: ['COM'], capacity: 6, agreement: { type: 'pro_bono', notional_value: 600 } }, t.app.db.get("SELECT * FROM users WHERE username='admin'"));
    const badMgr = await admin.post('/api/admin/companies', { ...body, prefix: 'ZZZ', account_manager_id: lawyer.id, first_admin: { name: 'س', email: 'z@z.example' } });
    assert.equal(badMgr.status, 400);
  });

  test('prefix is immutable once the company has a request (CS-34)', async () => {
    const nfd = companyId(t.app, 'NFD');
    const t0 = new Date().toISOString();
    t.app.db.insert('company_requests', { company_id: nfd, number: 1, code: 'NFD-0001', type: 'other', title: 'طلب', description: 'وصف الطلب', submitted_by: cuId(t.app, 'mariam@nilefoods.example'), created_at: t0, updated_at: t0 });
    const r = await admin.patch(`/api/admin/companies/${nfd}`, { prefix: 'NLF' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'prefix_locked');
    t.app.db.run('DELETE FROM company_requests WHERE company_id = ?', nfd);
  });

  test('L-60: a case manager cannot change an e-mail or promote to «مدير البوابة»; an admin e-mail change revokes sessions and tokens and warns the old address', async () => {
    const hossam = cuId(t.app, 'hossam@nilefoods.example');
    let r = await cm.patch(`/api/admin/company-users/${hossam}`, { email: 'h2@nilefoods.example' });
    assert.equal(r.status, 403);
    r = await cm.patch(`/api/admin/company-users/${hossam}`, { role: 'company_admin' });
    assert.equal(r.status, 403);
    ok(await cm.patch(`/api/admin/company-users/${hossam}`, { job_title: 'مدير المشتريات والعقود' })); // other fields are S
    const live = t.company();
    await live.login('hossam@nilefoods.example');
    t.app.companyAuth.issueToken('reset', hossam, { kind: 'staff' });
    ok(await admin.patch(`/api/admin/company-users/${hossam}`, { email: 'hossam.f@nilefoods.example' }));
    assert.equal((await live.get('/api/company/me')).status, 401);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_account_tokens WHERE company_user_id = ? AND used_at IS NULL AND revoked_at IS NULL', hossam)), 0);
    const old = t.app.db.get("SELECT * FROM email_outbox WHERE purpose = 'security_old_email' ORDER BY id DESC");
    assert.equal(old.to_address, 'hossam@nilefoods.example');
    assert.ok(t.app.db.get("SELECT 1 FROM company_notifications WHERE type = 'team.changed_by_staff' AND company_user_id = ?", cuId(t.app, 'mariam@nilefoods.example')), 'company admins are told');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.user_email_changed'"));
    ok(await admin.patch(`/api/admin/company-users/${hossam}`, { email: 'hossam@nilefoods.example' }));
    // دعوة «مدير بوابة» لشركة لها مدير نشط: لمدير النظام فقط
    const cmInvite = await cm.post(`/api/admin/companies/${companyId(t.app, 'NFD')}/users`, { name: 'مدير ثان', email: 'admin2@nilefoods.example', role: 'company_admin' });
    assert.equal(cmInvite.status, 403);
  });

  test('last-admin rule for staff and company admins alike', async () => {
    const tslAdmin = cuId(t.app, 'sherif@techsol.example');
    const r = await admin.patch(`/api/admin/company-users/${tslAdmin}`, { role: 'member' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'last_admin');
    assert.equal((await admin.patch(`/api/admin/company-users/${tslAdmin}`, { active: false })).status, 409);
  });

  test('company admin team management: cross-company invite → 200 pending_review with no distinct error; colleague reset is e-mail only (409 ask_team)', async () => {
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const before = Number(t.app.db.value('SELECT COUNT(*) FROM company_users'));
    const cross = ok(await mariam.post('/api/company/team/invite', { name: 'عمر', email: 'omar@techsol.example', role: 'member' }), 201);
    assert.deepEqual(cross.invite, { url: null, expires_at: null, emailed: false, pending_review: true });
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_users')), before, 'nobody created');
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company.invite_conflict'"), 'staff review it');
    const same = await mariam.post('/api/company/team/invite', { name: 'دينا', email: 'dina@nilefoods.example', role: 'member' });
    assert.equal(same.status, 409, 'a colleague already in the company is a plain 409');
    const reset = await mariam.post(`/api/company/team/${cuId(t.app, 'dina@nilefoods.example')}/reset-link`);
    assert.equal(reset.status, 409);
    assert.equal(reset.body.code, 'ask_team');
    assert.equal(reset.body.error, 'لا يمكن إرسال الرابط بالبريد الآن. اطلبوا من فريقكم القانوني إرسال رابط جديد.');
    assert.ok(!JSON.stringify(reset.body).includes('/reset/'));
    const inv = ok(await mariam.post('/api/company/team/invite', { name: 'كريم فؤاد', email: 'karim.f@nilefoods.example', role: 'viewer', billing_contact: true }), 201);
    assert.equal(inv.invite.emailed, false);
    assert.match(inv.invite.url, /\/company#\/invite\//, 'copy-once link for the inviter when not e-mailed');
    const look = ok(await t.company().post('/api/company/auth/link', { token: inv.invite.url.split('/invite/')[1] }));
    assert.deepEqual(look.inviter, { kind: 'colleague', name: 'مريم عادل' });
    const role = ok(await mariam.patch(`/api/company/team/${inv.user.id}`, { role: 'member', billing_contact: false }));
    assert.equal(role.user.role, 'member');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.user_role_changed' AND user_id IS NULL"));
  });

  test('20 invites + links per company per day (L-60): re-sending an invite counts; the 21st is refused (429)', async () => {
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const pending = t.app.db.get("SELECT id FROM company_users WHERE email = 'karim.f@nilefoods.example'").id;
    let sent = 0;
    let refused = null;
    for (let i = 0; i < 25 && !refused; i++) {
      const r = await mariam.post(`/api/company/team/${pending}/invite`);
      if (r.status === 200) sent += 1;
      else refused = r;
    }
    assert.ok(refused, 'the daily cap is reached');
    assert.equal(refused.status, 429);
    assert.equal(refused.body.code, 'rate_limited');
    const used = Number(t.app.db.value("SELECT COUNT(*) FROM company_account_tokens t JOIN company_users u ON u.id = t.company_user_id WHERE u.company_id = ? AND t.created_by_kind = 'company'", companyId(t.app, 'NFD')));
    const conflicts = Number(t.app.db.value("SELECT COUNT(*) FROM activity WHERE company_id = ? AND type = 'company.invite_conflict'", companyId(t.app, 'NFD')));
    assert.equal(used + conflicts, 20, `${sent} re-sends before the cap`);
    // فريق المكتب غير مقيد بحد الشركة
    ok(await admin.post(`/api/admin/company-users/${pending}/invite`));
  });

  test('plan limits: users (company admins blocked, staff override is admin-only) and entities (409 max_entities, staff override with a reason)', async () => {
    const tsl = companyId(t.app, 'TSL'); // Starter: 3 مستخدمين، كيان واحد
    const sherif = t.company();
    const lg = await sherif.post('/api/company/auth/login', { email: 'sherif@techsol.example', password: PW });
    if (lg.body.two_factor_required) {
      t.app.db.run('DELETE FROM company_user_2fa WHERE company_user_id = ?', cuId(t.app, 'sherif@techsol.example'));
      await sherif.login('sherif@techsol.example');
    }
    const used = Number(t.app.db.value('SELECT COUNT(*) FROM company_users WHERE company_id = ? AND active = 1', tsl));
    for (let i = used; i < 3; i++) ok(await sherif.post('/api/company/team/invite', { name: `زميل ${i}`, email: `colleague${i}@techsol.example`, role: 'viewer' }), 201);
    const full = await sherif.post('/api/company/team/invite', { name: 'زيادة', email: 'extra@techsol.example', role: 'viewer' });
    assert.equal(full.status, 409);
    assert.equal(full.body.code, 'max_users');
    assert.match(full.body.error, /مدير علاقتكم لدينا/);
    assert.equal((await cm.post(`/api/admin/companies/${tsl}/users`, { name: 'زيادة', email: 'extra@techsol.example', role: 'viewer', override: true })).status, 403);
    ok(await admin.post(`/api/admin/companies/${tsl}/users`, { name: 'زيادة', email: 'extra@techsol.example', role: 'viewer', override: true }), 201);
    const ent = await sherif.post('/api/company/entities', { name: 'فرع الإسكندرية', relation: 'branch' });
    assert.equal(ent.status, 409);
    assert.equal(ent.body.code, 'max_entities');
    assert.equal((await cm.post(`/api/admin/companies/${tsl}/entities`, { name: 'فرع الإسكندرية', relation: 'branch', override: true, override_reason: 'اتفاق خاص' })).status, 403);
    const okEnt = ok(await admin.post(`/api/admin/companies/${tsl}/entities`, { name: 'فرع الإسكندرية', relation: 'branch', override: true, override_reason: 'اتفاق خاص' }), 201);
    assert.equal(okEnt.entity.relation_label, 'فرع');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.entity_override'"));
  });

  test('names that reach headers, notifications or e-mail reject control and format characters (CS-4, brand.isPlainName)', async () => {
    const nfd = companyId(t.app, 'NFD');
    for (const name of ['سارة\r\nBcc: a@b.example', 'سارة‮معكوس', 'سارة<script>', 'سارة‏']) {
      const r = await admin.post(`/api/admin/companies/${nfd}/users`, { name, email: `s${Math.random().toString(36).slice(2, 8)}@nilefoods.example` });
      assert.equal(r.status, 400, JSON.stringify(name));
    }
    assert.equal((await admin.post(`/api/admin/companies/${nfd}/entities`, { name: 'كيان\nجديد' })).status, 400);
  });

  test('account manager: visible to the company by setting; a deactivated manager falls back to the first active admin with a notification (CS-28)', async () => {
    const nfd = companyId(t.app, 'NFD');
    const mgr = t.app.db.get("SELECT id FROM users WHERE username='manager'").id;
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { account_manager_id: mgr }));
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    assert.deepEqual(ok(await mariam.get('/api/company/profile')).account_manager, { name: 'منى السيد' });
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { settings: { show_account_manager: false } }));
    assert.equal(ok(await mariam.get('/api/company/profile')).account_manager, null);
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { settings: { show_account_manager: true } }));
    t.app.db.run('UPDATE users SET active = 0 WHERE id = ?', mgr);
    const view = ok(await admin.get(`/api/admin/companies/${nfd}`));
    assert.equal(view.company.account_manager.name, t.app.db.get("SELECT name FROM users WHERE username='admin'").name);
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company.manager_reassigned'"));
    t.app.db.run('UPDATE users SET active = 1 WHERE id = ?', mgr);
    ok(await admin.patch(`/api/admin/companies/${nfd}`, { account_manager_id: mgr }));
    // الجهة المتعاقدة: الكيان القانوني للمكتب (L-62)
    assert.equal(ok(await mariam.get('/api/company/plan')).contracting_entity.legal_name, t.app.settings.get('org_legal_name'));
  });

  test('plans and subscriptions: admin-only writes, one active subscription, change = end + start, next period computed', async () => {
    assert.equal((await cm.post('/api/admin/company-plans', { key: 'pro', name: 'Pro', terms: {} })).status, 403);
    assert.equal(ok(await cm.get('/api/admin/company-plans')).items.length, 3);
    const bad = await admin.post('/api/admin/company-plans', { key: 'pro', name: 'Pro', terms: { sla: { urgent: { first_response_hours: 900, delivery_hours: 9, clock: 'calendar' } } } });
    assert.equal(bad.status, 400);
    const pro = ok(await admin.post('/api/admin/company-plans', { key: 'pro', name: 'Pro', terms: { tier: 'custom', included_requests: 25, max_entities: 5 } }), 201);
    const nfd = companyId(t.app, 'NFD');
    assert.equal((await cm.put(`/api/admin/companies/${nfd}/subscription`, { plan_id: pro.id })).status, 403);
    const sub = ok(await admin.put(`/api/admin/companies/${nfd}/subscription`, { plan_id: pro.id, starts_on: '2026-09-15', renews: 'manual' }));
    assert.equal(sub.plan_key, 'pro');
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM company_subscriptions WHERE company_id = ? AND status = 'active'", nfd)), 1);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM company_subscriptions WHERE company_id = ? AND status = 'ended'", nfd)), 1);
    assert.ok(/^\d{4}-\d{2}-15$/.test(sub.next_period_starts));
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const plan = ok(await mariam.get('/api/company/plan'));
    assert.equal(plan.included_requests, 25);
    assert.equal(plan.plan.renews, 'manual');
    assert.equal(plan.quota.cycle_start.slice(8), '15', 'usage cycle anchored on starts_on');
    ok(await admin.put(`/api/admin/companies/${nfd}/subscription`, { plan_id: t.app.db.get("SELECT id FROM company_plans WHERE key='growth'").id, starts_on: '2026-08-05' }));
  });

  test('status: suspended companies are read-only and their admins are told; the staff role matrix holds on the built routes', async () => {
    const dlt = companyId(t.app, 'DLT');
    assert.equal((await cm.post(`/api/admin/companies/${dlt}/status`, { status: 'suspended' })).status, 403);
    const v = ok(await admin.post(`/api/admin/companies/${dlt}/status`, { status: 'suspended', reason: 'تأخر السداد' }));
    assert.equal(v.company.read_only, true);
    const A_ONLY = [
      ['PATCH', `/api/admin/companies/${dlt}`, { notes_internal: 'x' }],
      ['GET', '/api/admin/companies/prefix-check?prefix=ABC'],
      ['POST', `/api/admin/company-users/${cuId(t.app, 'dina@nilefoods.example')}/reset-link`, {}],
      ['POST', `/api/admin/company-users/${cuId(t.app, 'dina@nilefoods.example')}/2fa/reset`, {}],
      ['POST', `/api/admin/company-users/${cuId(t.app, 'dina@nilefoods.example')}/unlock`, {}],
      ['POST', `/api/admin/company-users/${cuId(t.app, 'dina@nilefoods.example')}/sessions/revoke`, {}],
      ['PATCH', `/api/admin/company-plans/1`, { name: 'x' }],
    ];
    for (const [m, u, b] of A_ONLY) assert.equal((await cm.request(m, u, b)).status, 403, `${m} ${u} is admin-only`);
    const S_OK = [
      ['GET', '/api/admin/companies'],
      ['GET', `/api/admin/companies/${dlt}`],
      ['GET', `/api/admin/companies/${dlt}/users`],
      ['GET', `/api/admin/companies/${dlt}/team`],
      ['GET', '/api/admin/company-plans'],
      ['GET', `/api/admin/companies/${dlt}/usage`],
    ];
    for (const [m, u] of S_OK) assert.equal((await cm.request(m, u)).status, 200, `${m} ${u} for case managers`);
    const lawyer = await t.login('tarek', 'Lawyer@2026');
    assert.equal((await lawyer.get('/api/admin/companies')).status, 403);
    // الفريق المفضل للإدارة فقط
    const pod = ok(await cm.put(`/api/admin/companies/${dlt}/team`, { items: [{ lawyer_id: lawyer.user.id, role: 'excluded', note: 'تعارض سابق' }] }));
    assert.equal(pod.items[0].role_label, 'مستبعد لهذه الشركة');
  });

  test('staff list and company view: health counters, users with contacts for staff only, money for admins only', async () => {
    const list = ok(await cm.get('/api/admin/companies'));
    const nfd = list.items.find((c) => c.prefix === 'NFD');
    for (const k of ['open_requests', 'at_risk', 'late', 'awaiting_company', 'renewals_30d', 'users']) assert.ok(k in nfd, k);
    const cmView = ok(await cm.get(`/api/admin/companies/${nfd.id}`));
    assert.equal(cmView.billing, null);
    assert.ok(!('price_minor' in cmView.subscription.terms), 'prices are admin-only');
    assert.ok(cmView.users.every((u) => 'phone' in u));
    const adView = ok(await admin.get(`/api/admin/companies/${nfd.id}`));
    assert.ok(adView.subscription.terms.price_minor > 0);
    assert.ok(adView.billing);
    // الشركة لا ترى هواتف زملائها ولا الفريق المفضل
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const team = ok(await mariam.get('/api/company/team'));
    assert.ok(team.items.every((u) => !('phone' in u)));
    assert.ok(!JSON.stringify(team).includes('preferred_lead'));
  });
});

// ───────────────────────── البيانات التجريبية (المرحلة 1) ─────────────────────────
describe('v10 demo seed stage 1 (SRV-3)', () => {
  test('demo: three plans, Nile Foods (Growth, active, from the 5th) and TechSol (Starter trial ending in 10 days) with their users; every login works', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      assert.deepEqual(db.all('SELECT key FROM company_plans ORDER BY id').map((r) => r.key), ['starter', 'growth', 'enterprise']);
      const nfd = db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
      const tsl = db.get("SELECT * FROM companies WHERE prefix = 'TSL'");
      assert.equal(nfd.status, 'active');
      assert.equal(db.get('SELECT username FROM users WHERE id = ?', nfd.account_manager_id).username, 'manager');
      assert.equal(db.get('SELECT username FROM users WHERE id = ?', tsl.account_manager_id).username, 'admin');
      assert.equal(tsl.status, 'trial');
      const days = (Date.parse(tsl.trial_ends_at) - Date.now()) / 86400000;
      assert.ok(days > 9 && days <= 11, `trial ends in ~10 days (${days})`); // يُنشأ قبل 4 أيام ظهرًا بتوقيت القاهرة
      const sub = db.get("SELECT * FROM company_subscriptions WHERE company_id = ? AND status = 'active'", nfd.id);
      assert.match(sub.starts_on, /-05$/);
      assert.equal(Number(db.value('SELECT COUNT(*) FROM company_entities WHERE company_id = ?', nfd.id)), 2);
      const users = Object.fromEntries(db.all('SELECT email, role, billing_contact, invite_pending FROM company_users').map((u) => [u.email, u]));
      assert.equal(users['mariam@nilefoods.example'].role, 'company_admin');
      assert.equal(users['mariam@nilefoods.example'].billing_contact, 1);
      assert.equal(users['hossam@nilefoods.example'].role, 'member');
      assert.equal(users['dina@nilefoods.example'].role, 'viewer');
      assert.equal(users['sherif@techsol.example'].role, 'company_admin');
      assert.equal(users['omar@techsol.example'].role, 'member');
      for (const email of Object.keys(users)) {
        assert.equal(users[email].invite_pending, 0);
        const c = new CompanyClient(t.base);
        ok(await c.login(email));
      }
      assert.equal(db.get("SELECT name FROM company_users WHERE email = 'sherif@techsol.example'").name, 'شريف حمدي');
      // البريد في العرض التجريبي: في الصادر فقط (محاكاة)
      assert.ok(db.all('SELECT status FROM email_outbox').every((r) => r.status === 'simulated'));
      const meta = await (await fetch(`${t.base}/api/company/meta`)).json();
      assert.equal(meta.email_enabled, true, 'demo promises e-mail (simulated outbox)');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ SRV-6 … SRV-11: الطلبات والفرز والقبول والاستيضاح والعروض والتسليمات ═════════════════════════
import zlib from 'node:zlib';
import { normalizeForNames, findLawyerNames, authorMatches, officeAuthors, pdfAuthors, readZipEntries } from '../src/services/company-doc-gate.js';
import { triageHeuristic, postProcessTriage } from '../src/ai/company-heuristic.js';
import { setSdkLoader } from '../src/ai/anthropic.js';

/** ملف ZIP صغير (deflate) لبناء docx في الذاكرة */
function zipOf(files) {
  const locals = [];
  const central = [];
  let off = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const nameB = Buffer.from(name, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, nameB);
    off += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(Object.keys(files).length, 8);
  e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const docxBuf = ({ creator = 'Office', author = null } = {}) =>
  zipOf({
    '[Content_Types].xml': '<Types/>',
    'docProps/core.xml': `<cp:coreProperties><dc:creator>${creator}</dc:creator><cp:lastModifiedBy>${creator}</cp:lastModifiedBy></cp:coreProperties>`,
    'word/document.xml': `<w:document><w:body>${author ? `<w:ins w:id="1" w:author="${author}"><w:r><w:t>تعديل</w:t></w:r></w:ins>` : ''}<w:p/></w:body></w:document>`,
  });
const pdfBuf = (author = null) => Buffer.from(`%PDF-1.4\n1 0 obj\n<<${author ? ` /Author (${author})` : ''} /Producer (x)>>\nendobj\n%%EOF\n`, 'latin1');
const file64 = (name, mime, buf) => ({ filename: name, name, mime, data_base64: buf.toString('base64') });

/** تطبيق للرحلة: بيانات الشركات + مدير حالات + محامو الشركات (طارق على اتفاق مسؤولية مجتمعية، وعمرو ويسمين) */
async function journeyApp(config = {}) {
  const t = await b2bApp(config);
  const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
  const mk = (username, name, latin, agreement) => {
    t.app.lawyers.create({ username, name, password: 'Lawyer@2026', title: 'أ.', specialties: ['COM', 'LAB'], capacity: 8, agreement }, admin);
    const id = t.app.db.value('SELECT id FROM users WHERE username = ?', username);
    t.app.db.run('UPDATE lawyers SET name_latin = ? WHERE user_id = ?', latin, id);
    return id;
  };
  t.lawyers = {
    tarek: mk('tarek', 'طارق النجار', 'Tarek El-Naggar', { type: 'csr', csr_firm: 'مكتب النجار', csr_cases_commitment: 10, notional_value: 800 }),
    amr: mk('amr', 'عمرو الشافعي', 'Amr El-Shafei', { type: 'per_case', rate: 900 }),
    yasmine: mk('yasmine', 'ياسمين خليل', 'Yasmine Khalil', { type: 'per_case', rate: 700 }),
  };
  t.nfdEntity = t.app.db.value("SELECT id FROM company_entities WHERE company_id = (SELECT id FROM companies WHERE prefix = 'NFD') ORDER BY id LIMIT 1");
  t.req = (code) => t.app.db.get('SELECT * FROM company_requests WHERE code = ?', code);
  t.stage = async (client, name, mime, buf) => ok(await client.post('/api/company/uploads', { file: { name, mime, data_base64: buf.toString('base64') } }), 201).upload_id;
  t.submit = async (client, body) => ok(await client.post('/api/company/requests', body), 201).request.code;
  t.accept = async (staff, code, body) => {
    const r = t.req(code);
    return staff.post(`/api/admin/company-requests/${r.id}/accept`, { rev: r.rev, brief_for_lawyer: 'ملخص كافٍ للمحامي عن المطلوب في هذا الطلب.', ...body });
  };
  /** المحامي يكتب الرأي ويقدمه، والإدارة تعتمده — يعيد معرف الرأي */
  t.opinion = async (username, assignmentId, body) => {
    const l = await t.login(username);
    ok(await l.post(`/api/lawyer/assignments/${assignmentId}/open`, {}));
    ok(await l.put(`/api/lawyer/assignments/${assignmentId}/draft`, { body, client_steps: ['تعديل بند المسؤولية', 'التوقيع بعد التعديل'] }));
    ok(await l.post(`/api/lawyer/assignments/${assignmentId}/submit`, {}));
    const op = t.app.db.value("SELECT id FROM opinions WHERE assignment_id = ? AND status = 'submitted'", assignmentId);
    const s = await t.login('admin');
    ok(await s.post(`/api/admin/opinions/${op}/approve`, {}));
    return op;
  };
  return t;
}

describe('v10 company requests — staged uploads (SRV-6, L-27)', () => {
  let t;
  let mariam;
  let hossam;
  before(async () => {
    t = await journeyApp();
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    hossam = t.company();
    await hossam.login('hossam@nilefoods.example');
  });
  after(async () => t && t.close());

  test('one file per call; audio/video refused before documents.save; staged files are not downloadable; size limit', async () => {
    const docs = Number(t.app.db.value('SELECT COUNT(*) FROM documents'));
    const r = await mariam.post('/api/company/uploads', { file: { name: 'تسجيل.ogg', mime: 'audio/ogg', data_base64: Buffer.from('OggS....').toString('base64') } });
    assert.equal(r.status, 400);
    const v2 = await mariam.post('/api/company/uploads', { file: { name: 'clip.mp4', mime: 'video/mp4', data_base64: Buffer.from('xxxxftypisom').toString('base64') } });
    assert.equal(v2.status, 400);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM documents')), docs, 'nothing saved for audio/video');
    const up = ok(await mariam.post('/api/company/uploads', { file: { name: 'عقد.pdf', mime: 'application/pdf', data_base64: pdfBuf().toString('base64') } }), 201);
    assert.ok(up.upload_id && up.expires_at && up.filename === 'عقد.pdf');
    const doc = t.app.db.get('SELECT d.* FROM company_uploads u JOIN documents d ON d.id = u.document_id WHERE u.id = ?', up.upload_id);
    assert.equal(doc.uploaded_by_kind, 'client');
    assert.equal(doc.uploaded_by_user_id, null, 'L-19: never a users(id)');
    assert.equal(doc.company_request_id, null);
    assert.equal((await mariam.get(`/api/company/documents/${doc.id}/download`)).status, 404, 'staged file is not downloadable');
    const big = await mariam.post('/api/company/uploads', { file: { name: 'big.pdf', mime: 'application/pdf', data_base64: Buffer.alloc(Math.round(8.5 * 1024 * 1024), 65).toString('base64') } });
    assert.equal(big.status, 413);
    // «اطلاع فقط» لا يرفع
    const dina = t.company();
    await dina.login('dina@nilefoods.example');
    assert.equal((await dina.post('/api/company/uploads', { file: { name: 'a.pdf', mime: 'application/pdf', data_base64: pdfBuf().toString('base64') } })).status, 403);
  });

  test('upload_ids: another user of the same company → 404; used → 409 upload_unavailable; expired → 409; more than 5 → 400', async () => {
    const mine = await t.stage(mariam, 'a.pdf', 'application/pdf', pdfBuf());
    const his = await t.stage(hossam, 'b.pdf', 'application/pdf', pdfBuf());
    const base = { type: 'contract_review', entity_id: t.nfdEntity, description: 'مراجعة عقد توريد قبل التوقيع', fields: { counterparty_name: 'شركة الاختبار', contract_kind: 'supply', our_role: 'buyer' } };
    const r1 = await mariam.post('/api/company/requests', { ...base, upload_ids: [his] });
    assert.equal(r1.status, 404, 'another user’s staged file is invisible');
    const code = ok(await mariam.post('/api/company/requests', { ...base, upload_ids: [mine] }), 201).request.code;
    const r2 = await mariam.post(`/api/company/requests/${code}/documents`, { upload_ids: [mine] });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.code, 'upload_unavailable');
    const old = await t.stage(mariam, 'c.pdf', 'application/pdf', pdfBuf());
    t.app.db.run("UPDATE company_uploads SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", old);
    assert.equal((await mariam.post(`/api/company/requests/${code}/documents`, { upload_ids: [old] })).body.code, 'upload_unavailable');
    const r3 = await mariam.post(`/api/company/requests/${code}/documents`, { upload_ids: [1, 2, 3, 4, 5, 6] });
    assert.equal(r3.status, 400);
    // تنظيف: الملفات المنتهية غير المستخدمة تُحذف مع ملفاتها
    assert.ok(t.app.companyRequests.purgeExpiredUploads() >= 1);
    assert.ok(!t.app.db.get('SELECT 1 FROM company_uploads WHERE id = ?', old));
  });

  test('4 upload bodies in flight → 429 busy (checked before the body is read); a rolled-back write leaves no file on disk', async () => {
    const slots = [1, 2, 3, 4].map(() => t.app.companyRequests.acquireUploadSlot());
    const r = await mariam.post('/api/company/uploads', { file: { name: 'x.pdf', mime: 'application/pdf', data_base64: pdfBuf().toString('base64') } });
    assert.equal(r.status, 429);
    assert.equal(r.body.code, 'busy');
    slots.forEach((release) => release());
    assert.equal(t.app.companyRequests.uploadsInFlight(), 0);
    // معاملة تتراجع بعد كتابة الملف ← يُحذف الملف
    const dir = t.app.config.uploadsDir;
    const count = () => {
      let n = 0;
      const walk = (d) => {
        for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) e.isDirectory() ? walk(path.join(d, e.name)) : (n += 1);
      };
      walk(dir);
      return n;
    };
    const before = count();
    const orig = t.app.db.insert.bind(t.app.db);
    t.app.db.insert = (table, obj) => {
      if (table === 'company_uploads') throw new Error('boom');
      return orig(table, obj);
    };
    try {
      const fail = await mariam.post('/api/company/uploads', { file: { name: 'y.pdf', mime: 'application/pdf', data_base64: pdfBuf().toString('base64') } });
      assert.equal(fail.status, 500);
    } finally {
      t.app.db.insert = orig;
    }
    assert.equal(count(), before, 'the written file was unlinked');
    assert.equal(t.app.companyRequests.uploadsInFlight(), 0, 'slot released after an error');
  });
});

describe('v10 company requests — submit, list, search, home, visibility (SRV-6, L-51, L-54, L-55)', () => {
  let t;
  let mariam;
  let hossam;
  let dina;
  let sherif;
  let privateCode;
  before(async () => {
    t = await journeyApp();
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    hossam = t.company();
    await hossam.login('hossam@nilefoods.example');
    dina = t.company();
    await dina.login('dina@nilefoods.example');
    sherif = t.company();
    await sherif.login('sherif@techsol.example');
  });
  after(async () => t && t.close());

  test('validation: document required for contract_review, entity of another company 400, memory ref outside readable memory 400 memory_not_found', async () => {
    const base = { type: 'contract_review', entity_id: t.nfdEntity, description: 'مراجعة عقد توريد قبل التوقيع', fields: { counterparty_name: 'شركة', contract_kind: 'supply', our_role: 'buyer' } };
    const r1 = await mariam.post('/api/company/requests', base);
    assert.equal(r1.status, 400);
    assert.ok(r1.body.details.fields.upload_ids);
    const otherEntity = t.app.db.value("SELECT id FROM company_entities WHERE company_id = (SELECT id FROM companies WHERE prefix = 'TSL')");
    const r2 = await mariam.post('/api/company/requests', { ...base, entity_id: otherEntity, upload_ids: [await t.stage(mariam, 'a.pdf', 'application/pdf', pdfBuf())] });
    assert.equal(r2.status, 400);
    assert.ok(r2.body.details.fields.entity_id);
    const tslMem = t.app.db.insert('company_memory', { company_id: t.app.db.value("SELECT id FROM companies WHERE prefix = 'TSL'"), kind: 'template', title: 'نموذج', status: 'active', data: '{}', tags: '[]', access: 'all', created_by_kind: 'staff', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const r3 = await mariam.post('/api/company/requests', { type: 'nda', entity_id: t.nfdEntity, description: 'اتفاقية سرية مع مورد جديد', fields: { counterparty_name: 'مورد', direction: 'mutual', purpose: 'تقييم', template_memory_id: tslMem } });
    assert.equal(r3.status, 400);
    assert.equal(r3.body.code, 'memory_not_found');
  });

  test('client_ref replay returns the same request (200) before any document is linked; urgent above the plan allowance is stored high with the notice', async () => {
    const body = { type: 'other', entity_id: t.nfdEntity, description: 'سؤال قانوني عام عن عقد إيجار المخزن', fields: {}, client_ref: 'ref-abcdefghijklmnop' };
    const a = await mariam.post('/api/company/requests', body);
    assert.equal(a.status, 201);
    const b = await mariam.post('/api/company/requests', body);
    assert.equal(b.status, 200);
    assert.equal(b.body.request.code, a.body.request.code);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM company_requests WHERE client_ref = 'ref-abcdefghijklmnop'")), 1);
    // Starter: طلب عاجل واحد في الدورة؛ تنبيه البريد لمدير العلاقة ومديري النظام ذوي البريد
    t.app.db.run("UPDATE users SET email = 'admin@firm.example' WHERE username = 'admin'");
    const urgent = (n) => sherif.post('/api/company/requests', { type: 'other', description: `طلب عاجل رقم ${n} عن مسألة في العقد`, fields: {}, priority: 'urgent', urgent_reason: 'موعد التوقيع غدًا' });
    const u1 = ok(await urgent(1), 201);
    assert.equal(u1.request.priority, 'urgent');
    assert.ok(!u1.notice);
    const staffAlerts = t.app.db.all("SELECT * FROM email_outbox WHERE purpose = 'staff_alert'");
    assert.equal(staffAlerts.length, 1);
    assert.equal(staffAlerts[0].to_address, 'admin@firm.example');
    assert.match(staffAlerts[0].subject, /^طلب عاجل من تك سوليوشنز — TSL-\d{4}$/);
    assert.ok(!staffAlerts[0].body_text.includes('طلب عاجل رقم'), 'staff alert carries no request title');
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company_request.new'"), 'staff notified');
    const u2 = ok(await urgent(2), 201);
    assert.equal(u2.request.priority, 'high');
    assert.equal(u2.request.requested_priority, 'urgent');
    assert.equal(u2.notice, 'urgent_allowance');
    assert.equal(u2.notice_text, 'استخدمتم الطلبات العاجلة المتاحة في باقتكم لهذه الدورة (1)؛ سُجّل الطلب بأولوية «مرتفع».');
  });

  test('preview parity: the first-response due stored at submit equals /plan.promise_preview computed at the same instant (L-54)', async () => {
    freezeClock('2026-10-08T12:59:00Z'); // الخميس 15:59 بتوقيت القاهرة
    try {
      const plan = ok(await mariam.get('/api/company/plan'));
      const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن شرط في عقد العمل', fields: {} });
      assert.equal(t.req(code).first_response_due_at, plan.promise_preview.normal.first_response_by);
    } finally {
      resetClock();
    }
  });

  test('intra-company visibility (INV-B1b): a private employment request is invisible to the member and the viewer by every path', async () => {
    privateCode = await t.submit(mariam, { type: 'employment', entity_id: t.nfdEntity, description: 'موظف في المخزن تغيب أسبوعين ونريد إنهاء خدمته', fields: { employee_role: 'أمين مخزن', issue_kind: 'termination' } });
    assert.equal(t.req(privateCode).visibility, 'private', 'employment is private by default');
    for (const c of [hossam, dina]) {
      assert.equal((await c.get(`/api/company/requests/${privateCode}`)).status, 404);
      assert.ok(!ok(await c.get('/api/company/requests?state=all')).items.some((x) => x.code === privateCode));
      assert.ok(!ok(await c.get('/api/company/search?q=' + encodeURIComponent('أمين مخزن'))).requests.length);
      assert.ok(!ok(await c.get('/api/company/home')).open_requests.some((x) => x.code === privateCode));
      assert.equal((await c.post(`/api/company/requests/${privateCode}/messages`, { body: 'سؤال' })).status, c === dina ? 403 : 404);
    }
    // التصعيد من غير المرسل والمدير ← 403؛ والمشاهد يُضاف متابعًا فيراه
    ok(await mariam.put(`/api/company/requests/${privateCode}/watchers`, { company_user_ids: [cuId(t.app, 'hossam@nilefoods.example')] }));
    assert.equal((await hossam.get(`/api/company/requests/${privateCode}`)).status, 200);
    assert.equal((await hossam.post(`/api/company/requests/${privateCode}/escalate`, { reason: 'تأخير' })).status, 403);
    // شركة أخرى ← 404 بنفس الجسم
    const other = await sherif.get(`/api/company/requests/${privateCode}`);
    const none = await sherif.get('/api/company/requests/NFD-9999');
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, none.body);
  });

  test('list: code cursor, a non-empty q searches every state, closed state filter', async () => {
    for (let i = 0; i < 3; i++) await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: `طلب للقائمة رقم ${i} عن عقد`, fields: {}, title: `طلب القائمة ${i}` });
    const p1 = ok(await mariam.get('/api/company/requests?limit=2'));
    assert.equal(p1.items.length, 2);
    assert.ok(p1.next_before);
    const p2 = ok(await mariam.get(`/api/company/requests?limit=2&before=${p1.next_before}`));
    assert.ok(p2.items.every((x) => !p1.items.some((y) => y.code === x.code)));
    // طلب ملغى يظهر في البحث رغم أن الحالة المفتوحة هي الافتراضية
    const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'طلب سيُلغى عن مؤسسة الفجر', fields: {}, title: 'استفسار عن مؤسسة الفجر' });
    ok(await mariam.post(`/api/company/requests/${code}/cancel`, {}));
    assert.ok(!ok(await mariam.get('/api/company/requests')).items.some((x) => x.code === code));
    const s = ok(await mariam.get('/api/company/requests?q=' + encodeURIComponent('الفَجر')));
    assert.ok(s.searched && s.items.some((x) => x.code === code));
    assert.ok(ok(await mariam.get('/api/company/requests?state=closed')).items.some((x) => x.code === code));
  });

  test('messages 120/h and escalation once per 24 h (P0, CO-18); escalation notifies the account manager and admins', async () => {
    const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'طلب للتصعيد والرسائل', fields: {} });
    ok(await mariam.post(`/api/company/requests/${code}/escalate`, { reason: 'تأخر الرد' }));
    const again = await mariam.post(`/api/company/requests/${code}/escalate`, { reason: 'مرة أخرى' });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'escalation_throttled');
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company_request.escalated'"));
    const r = t.req(code);
    const now = new Date().toISOString();
    for (let i = 0; i < 120; i++) t.app.db.insert('company_messages', { company_id: r.company_id, request_id: r.id, direction: 'in', kind: 'message', body: 'x', author_company_user_id: r.submitted_by, created_at: now });
    const m = await mariam.post(`/api/company/requests/${code}/messages`, { body: 'رسالة زائدة' });
    assert.equal(m.status, 429);
  });

  test('submit is limited to 30 per hour per user', async () => {
    const uid = cuId(t.app, 'hossam@nilefoods.example');
    const cid = companyId(t.app, 'NFD');
    const now = new Date().toISOString();
    for (let i = 0; i < 30; i++) {
      const n = t.app.db.nextCounter(`company_request:${cid}`, 1);
      t.app.db.insert('company_requests', { company_id: cid, number: n, code: `NFD-${String(n).padStart(4, '0')}`, type: 'other', title: 'x', description: 'xxxxxxxxxx', submitted_by: uid, created_at: now, updated_at: now });
    }
    const r = await hossam.post('/api/company/requests', { type: 'other', entity_id: t.nfdEntity, description: 'طلب بعد الحد', fields: {} });
    assert.equal(r.status, 429);
  });
});

describe('v10 document gate — author metadata and lawyer names (SRV-11, L-56)', () => {
  const lawyers = [{ name: 'طارق النجار', username: 'tarek', name_latin: 'Tarek El-Naggar' }];
  test('docx: tracked change by the lawyer’s username and core.xml creator in Arabic are found; a clean file reports Office metadata only', () => {
    const a = officeAuthors(docxBuf({ author: 'tarek' }));
    assert.ok(a.names.includes('tarek'));
    assert.ok(a.hasMeta && !a.corrupt);
    const b = officeAuthors(docxBuf({ creator: 'طارق النجار' }));
    assert.ok(b.names.includes('طارق النجار'));
    const clean = officeAuthors(docxBuf({ creator: 'Office' }));
    assert.deepEqual(clean.names.filter((n) => findLawyerNames(n, lawyers).length), []);
    assert.equal(readZipEntries(docxBuf(), (n) => n === 'word/document.xml').entries.size, 1);
  });
  test('PDF: /Author literal, hex UTF-16 and XMP dc:creator; a corrupt ZIP is treated as carrying metadata', () => {
    assert.deepEqual(pdfAuthors(pdfBuf('Tarek El-Naggar')).names, ['Tarek El-Naggar']);
    const utf16 = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('طارق النجار', 'utf16le').swap16()]).toString('hex').toUpperCase();
    const hex = pdfAuthors(Buffer.from(`%PDF-1.4\n<< /Author <${utf16}> >>\n%%EOF`, 'latin1'));
    assert.deepEqual(hex.names, ['طارق النجار']);
    const xmp = pdfAuthors(Buffer.from('%PDF-1.4\n<x:xmpmeta><dc:creator><rdf:Seq><rdf:li>Tarek El-Naggar</rdf:li></rdf:Seq></dc:creator></x:xmpmeta>\n%%EOF', 'utf8'));
    assert.deepEqual(xmp.names, ['Tarek El-Naggar']);
    assert.equal(pdfAuthors(pdfBuf()).hasMeta, false);
    const bad = officeAuthors(Buffer.from('PK\u0003\u0004 this is not really a zip file at all', 'latin1'));
    assert.ok(bad.corrupt && bad.hasMeta);
  });
  test('fixture files (test/fixtures/v10-doc-gate): each lawyer fixture is caught, the clean ones are not', () => {
    const dir = path.join(ROOT, 'test/fixtures/v10-doc-gate');
    const read = (f) => fs.readFileSync(path.join(dir, f));
    const hit = (names) => names.some((n) => authorMatches(n, lawyers));
    assert.ok(hit(officeAuthors(read('tracked-change-tarek.docx')).names));
    assert.ok(hit(officeAuthors(read('creator-arabic.docx')).names));
    assert.ok(!hit(officeAuthors(read('clean.docx')).names));
    assert.ok(hit(pdfAuthors(read('author-latin.pdf')).names));
    assert.equal(pdfAuthors(read('clean.pdf')).hasMeta, false);
    const bad = officeAuthors(read('corrupt.docx'));
    assert.ok(bad.corrupt && bad.hasMeta);
  });

  test('names in text: Arabic with title and diacritics, Latin with and without the hyphen, never a different person', () => {
    assert.deepEqual(findLawyerNames('أعدّه الأستاذ طارِق النّجّار بعد مراجعة البنود', lawyers), ['طارق النجار']);
    assert.deepEqual(findLawyerNames('Prepared by Tarek ElNaggar', lawyers), ['طارق النجار']);
    assert.deepEqual(findLawyerNames('Prepared by tarek el-naggar.', lawyers), ['طارق النجار']);
    assert.deepEqual(findLawyerNames('اتصلوا بطارق بن زياد', lawyers), []);
    assert.equal(normalizeForNames('النَّجّار'), normalizeForNames('النجار'));
  });
});

describe('v10 company AI triage (SRV-7, L-29, CS-13)', () => {
  let t;
  let mariam;
  let sherif;
  let staff;
  before(async () => {
    t = await journeyApp();
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    sherif = t.company();
    await sherif.login('sherif@techsol.example');
    staff = await t.login('admin');
  });
  after(async () => t && t.close());

  const waitFor = async (fn, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (fn()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };

  test('auto triage after submit is stored for staff and never reaches any company response', async () => {
    const up = await t.stage(mariam, 'عقد.pdf', 'application/pdf', pdfBuf());
    const code = await t.submit(mariam, { type: 'contract_review', entity_id: t.nfdEntity, description: 'مراجعة عقد توريد مواد تغليف مع شركة الدلتا قبل التوقيع يوم الأحد. تواصلوا معي مريم عادل', fields: { counterparty_name: 'شركة الدلتا للتغليف', contract_kind: 'supply', our_role: 'buyer', contract_value: 2400000 }, upload_ids: [up] });
    assert.ok(await waitFor(() => t.req(code).ai_suggestion_id), 'triage ran in the background');
    const r = t.req(code);
    const tri = ok(await staff.get(`/api/admin/company-requests/${r.id}/triage`));
    assert.equal(tri.triage.output.type, 'contract_review');
    assert.ok(tri.triage.output.brief_for_lawyer && !tri.triage.output.brief_for_lawyer.includes('مريم عادل'), 'company staff names scrubbed from the brief');
    assert.ok(tri.scope_check);
    const detail = ok(await staff.get(`/api/admin/company-requests/${r.id}`));
    assert.ok(detail.triage && detail.triage.output.type === 'contract_review');
    for (const body of [ok(await mariam.get(`/api/company/requests/${code}`)), ok(await mariam.get('/api/company/requests?state=all')), ok(await mariam.get('/api/company/home'))]) {
      const s = JSON.stringify(body);
      for (const banned of ['ai_suggestion', 'triage', 'brief_for_lawyer', 'heuristic', 'risk_flags', 'senior_review']) assert.ok(!s.includes(banned), `company JSON has no ${banned}`);
    }
  });

  test('automatic triage is capped at 3 per request per 24 h from saved ai_usage rows; staff reruns are capped at 20 per hour', async () => {
    const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن تجديد ترخيص المخزن', fields: {} });
    const r = t.req(code);
    await new Promise((res) => setTimeout(res, 500));
    const now = new Date().toISOString();
    const autos = Number(t.app.db.value("SELECT COUNT(*) FROM ai_usage WHERE feature = 'company_triage' AND entity_id = ? AND user_id IS NULL", r.id));
    const period = now.slice(0, 7);
    for (let i = autos; i < 3; i++) t.app.db.insert('ai_usage', { feature: 'company_triage', entity_type: 'company_request', entity_id: r.id, provider: 'heuristic', period, created_at: now });
    assert.equal(await t.app.ai.triageCompanyRequest(r.id), null, 'fourth automatic run in 24 h is skipped');
    const before = t.req(code).ai_suggestion_id;
    const rerun = ok(await staff.post(`/api/admin/company-requests/${r.id}/triage`, {}));
    assert.ok(rerun.triage.id !== before, 'a staff rerun is not limited by the automatic cap');
    const adminId = t.app.db.value("SELECT id FROM users WHERE username = 'admin'");
    for (let i = 0; i < 20; i++) t.app.db.insert('ai_usage', { feature: 'company_triage', entity_type: 'company_request', entity_id: r.id, provider: 'heuristic', user_id: adminId, period, created_at: now });
    const limited = await staff.post(`/api/admin/company-requests/${r.id}/triage`, {});
    assert.equal(limited.status, 429);
  });

  test('CS-13: the company context and triage memory references never cross companies', async () => {
    const nfd = companyId(t.app, 'NFD');
    const tsl = companyId(t.app, 'TSL');
    const now = new Date().toISOString();
    const mem = (company, title) => {
      const cp = t.app.companyMemory.upsertCounterparty(company, 'شركة الدلتا للتغليف', { kind: 'supplier' });
      return t.app.db.insert('company_memory', { company_id: company, kind: 'contract', title, counterparty_id: cp, status: 'active', data: '{}', tags: '[]', access: 'all', created_by_kind: 'staff', created_at: now, updated_at: now });
    };
    const mine = mem(nfd, 'عقد توريد الدلتا للنيل');
    const theirs = mem(tsl, 'عقد خدمات الدلتا لتك سوليوشنز');
    const ctxN = t.app.ai.companyContext(nfd, { text: 'عقد توريد مع الدلتا للتغليف', counterparties: ['شركة الدلتا للتغليف'] });
    assert.ok(ctxN.some((x) => x.ref === `M-${mine}`));
    assert.ok(!ctxN.some((x) => x.ref === `M-${theirs}`));
    const nfdCodes = new Set(t.app.db.all('SELECT code FROM company_requests WHERE company_id = ?', nfd).map((x) => `R-${x.code}`));
    assert.ok(ctxN.filter((x) => x.kind === 'request').every((x) => nfdCodes.has(x.ref)));
    const ctxT = t.app.ai.companyContext(tsl, { text: 'عقد الدلتا', counterparties: ['شركة الدلتا للتغليف'] });
    assert.ok(ctxT.every((x) => x.ref !== `M-${mine}` && !nfdCodes.has(x.ref)));
    // فرز طلب لتك سوليوشنز لا يشير إلا لذاكرتها
    const code = await t.submit(sherif, { type: 'nda', description: 'اتفاقية سرية مع شركة الدلتا للتغليف قبل مشاركة بيانات', fields: { counterparty_name: 'شركة الدلتا للتغليف', direction: 'mutual', purpose: 'تقييم' } });
    const sug = await t.app.ai.triageCompanyRequest(t.req(code).id, t.app.db.get("SELECT * FROM users WHERE username = 'manager'"));
    const out = typeof sug.output === 'string' ? JSON.parse(sug.output) : sug.output;
    assert.ok(out.memory_refs.every((x) => x.ref === `M-${theirs}` || /^R-TSL-/.test(x.ref)), JSON.stringify(out.memory_refs));
  });

  test('postProcessTriage: memory refs limited to the context, enums clamped, deterministic scope check, names scrubbed', () => {
    const ctx = {
      request: { type: 'contract_review', title: 'مراجعة', description: 'مراجعة عقد', priority: 'normal' },
      fields: { contract_value: 2000000 },
      documents: [],
      today: '2026-10-08',
      plan: { scope_types: ['contract_review'], excluded_work: [], contract_value_cap_minor: 100000000, senior_review: 'high_risk' },
      memory: [{ ref: 'M-1' }],
      names: ['مريم عادل'],
    };
    const o = postProcessTriage({ type: 'nope', urgency: 'whenever', memory_refs: [{ ref: 'M-1', why: 'x' }, { ref: 'M-999', why: 'y' }], brief_for_lawyer: 'تتابع معكم مريم عادل على الرقم 01012345678', issues: ['سؤال مريم عادل'] }, ctx);
    assert.equal(o.type, 'contract_review');
    assert.equal(o.urgency, 'normal');
    assert.deepEqual(o.memory_refs.map((x) => x.ref), ['M-1']);
    assert.deepEqual(o.scope_check, { in_plan: false, reasons: ['value_above_cap'] });
    assert.equal(o.senior_review, true);
    assert.ok(!o.brief_for_lawyer.includes('مريم') && !o.brief_for_lawyer.includes('01012345678'));
    assert.ok(!o.issues[0].includes('مريم'));
    const h = triageHeuristic({ ...ctx, request: { ...ctx.request, needed_by: '2026-10-09' } });
    assert.equal(h.type, 'contract_review');
  });
});

describe('v10 accept, lawyer privacy, clarifications, deliverables and closing (SRV-8, SRV-9, SRV-11)', () => {
  let t;
  let mariam;
  let hossam;
  let staff;
  let code;
  let rid;
  let caseId;
  let leadAsg;
  let reviewerAsg;
  before(async () => {
    t = await journeyApp();
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    hossam = t.company();
    await hossam.login('hossam@nilefoods.example');
    staff = await t.login('admin');
    const up = await t.stage(mariam, 'عقد-الدلتا.pdf', 'application/pdf', pdfBuf());
    code = await t.submit(mariam, {
      type: 'contract_review',
      entity_id: t.nfdEntity,
      description: 'مراجعة عقد توريد مواد تغليف مع الدلتا. تواصلوا مع مريم عادل على mariam@nilefoods.example أو مع حسام الدين فوزي. مرجعنا الداخلي NFD-0001',
      fields: { counterparty_name: 'شركة الدلتا للتغليف', contract_kind: 'supply', our_role: 'buyer', contract_value: 2400000 },
      upload_ids: [up],
    });
    rid = t.req(code).id;
  });
  after(async () => t && t.close());

  test('pre-acceptance clarification: no B2C messages row, waiting on the company, reply moves to the confirm phase; another request’s message id → 404', async () => {
    const b2cMessages = Number(t.app.db.value('SELECT COUNT(*) FROM messages'));
    const r0 = t.req(code);
    ok(await staff.post(`/api/admin/company-requests/${rid}/clarify`, { rev: r0.rev, body: 'نحتاج نسخة العقد الإطاري السابق إن وُجدت.', items: [{ label: 'العقد الإطاري السابق' }] }));
    let r = t.req(code);
    assert.equal(r.status, 'awaiting_company');
    assert.equal(r.waiting_on, 'info');
    assert.ok(r.first_response_at, 'a clarification is a first response');
    assert.equal(r.first_response_kind, 'clarify');
    const view = ok(await mariam.get(`/api/company/requests/${code}`));
    const clar = view.messages.find((m) => m.kind === 'clarification');
    assert.ok(clar && clar.items.length === 1);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM messages')), b2cMessages, 'company clarifications never use the B2C messages table');
    const other = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'طلب آخر للاختبار', fields: {} });
    assert.equal((await mariam.post(`/api/company/requests/${other}/clarifications/${clar.id}/reply`, { body: 'رد' })).status, 404);
    const rep = ok(await mariam.post(`/api/company/requests/${code}/clarifications/${clar.id}/reply`, { body: 'لا يوجد عقد سابق.', missing_items: [0] }));
    r = t.req(code);
    assert.equal(r.status, 'submitted');
    assert.ok(r.confirm_due_at, 'confirm phase after the reply');
    assert.ok(rep.request);
  });

  test('accept: pod exclusion 409, then a case with company fields, redacted brief, documents and a lead + reviewer', async () => {
    const now = new Date().toISOString();
    const nfd = companyId(t.app, 'NFD');
    t.app.db.run("INSERT INTO company_team (company_id, lawyer_id, role, created_at) VALUES (?, ?, 'excluded', ?)", nfd, t.lawyers.yasmine, now);
    const ex = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.yasmine } } });
    assert.equal(ex.status, 409);
    assert.equal(ex.body.code, 'lawyer_excluded_for_company');
    const res = await t.accept(staff, code, {
      brief_for_lawyer: 'مراجعة عقد توريد مواد تغليف. تواصل مع مريم عادل على mariam@nilefoods.example أو 01011112222 بخصوص NFD-0001',
      issues: ['بند المسؤولية — كما طلبت مريم عادل'],
      assign: { lead: { lawyer_id: t.lawyers.tarek }, reviewer: { lawyer_id: t.lawyers.amr } },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.warnings.length, 'staff warned that the brief was redacted');
    assert.deepEqual(res.body.assign_errors, []);
    caseId = res.body.case.id;
    const c = t.app.db.get('SELECT * FROM cases WHERE id = ?', caseId);
    assert.equal(c.company_id, nfd);
    assert.equal(c.company_request_id, rid);
    assert.equal(t.req(code).status, 'in_progress');
    assert.equal(t.req(code).case_id, caseId);
    assert.ok(t.app.db.value('SELECT COUNT(*) FROM documents WHERE case_id = ?', caseId) >= 1, 'request documents attached to the case');
    leadAsg = t.app.db.value("SELECT id FROM assignments WHERE case_id = ? AND role = 'lead'", caseId);
    reviewerAsg = t.app.db.value("SELECT id FROM assignments WHERE case_id = ? AND role = 'reviewer'", caseId);
    assert.ok(leadAsg && reviewerAsg);
    const again = await t.accept(staff, code, {});
    assert.equal(again.status, 409);
    // الشركة: «بدأ فريقكم القانوني العمل على الطلب» بلا أسماء المحامين
    const cv = JSON.stringify(ok(await mariam.get(`/api/company/requests/${code}`)));
    for (const n of ['طارق', 'عمرو', 'tarek', 'amr']) assert.ok(!cv.includes(n), `company view has no lawyer name ${n}`);
  });

  test('INV-B6: the lawyer view and list carry no company user names, e-mails, phones or request codes; AI draft 409; generic close 409; cases.list line filter', async () => {
    const lt = await t.login('tarek');
    const view = ok(await lt.get(`/api/lawyer/assignments/${leadAsg}`));
    const s = JSON.stringify(view);
    for (const banned of ['مريم', 'حسام', 'nilefoods', '01011112222', code]) assert.ok(!s.includes(banned), `lawyer view has no ${banned}`);
    assert.ok(view.company && view.company.name, 'the lawyer sees the company block');
    const list = JSON.stringify(ok(await lt.get('/api/lawyer/assignments')));
    for (const banned of ['مريم', 'nilefoods', code]) assert.ok(!list.includes(banned));
    const ai = await lt.post(`/api/lawyer/assignments/${leadAsg}/ai/draft`, {});
    assert.equal(ai.status, 409);
    assert.equal(ai.body.code, 'company_case_no_ai_draft');
    const close = await staff.post(`/api/admin/cases/${caseId}/close`, { outcome: 'answered' });
    assert.equal(close.status, 409);
    assert.equal(close.body.code, 'company_case_use_request');
    const b2c = ok(await staff.get('/api/admin/cases?line=b2c'));
    assert.ok(!(b2c.items || b2c).some((x) => x.id === caseId));
    const b2b = ok(await staff.get('/api/admin/cases?line=b2b'));
    assert.ok((b2b.items || b2b).some((x) => x.id === caseId && x.company_id));
  });

  test('memory grants: «المفوَّضون بالتوقيع» is never grantable (400)', async () => {
    const now = new Date().toISOString();
    const person = t.app.db.insert('company_memory', { company_id: companyId(t.app, 'NFD'), kind: 'person', title: 'مفوض بالتوقيع', status: 'active', data: '{}', tags: '[]', access: 'admins', created_by_kind: 'staff', created_at: now, updated_at: now });
    const r = await staff.put(`/api/admin/assignments/${leadAsg}/memory-grants`, { memory_ids: [person] });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'memory_kind_not_grantable');
  });

  let keptWorkFile;
  test('lawyer work files (D3, P1): company cases only, ≤ 5 live, deletable until approval, never downloadable by the company', async () => {
    const lt = await t.login('tarek');
    const up = ok(await lt.post(`/api/lawyer/assignments/${leadAsg}/work-files`, { files: [file64('ملاحظات المراجعة.pdf', 'application/pdf', pdfBuf()), file64('جدول البنود.pdf', 'application/pdf', pdfBuf())] }), 201);
    assert.equal(up.documents.length, 2);
    keptWorkFile = up.documents[0].id;
    const doc = t.app.db.get('SELECT * FROM documents WHERE id = ?', keptWorkFile);
    assert.equal(doc.uploaded_by_kind, 'lawyer');
    assert.equal(doc.assignment_id, leadAsg);
    assert.equal(doc.company_id, null, 'not counted in the company storage and never matched by rule (a)');
    const view = ok(await lt.get(`/api/lawyer/assignments/${leadAsg}`));
    assert.deepEqual(view.work_files.map((x) => x.id).sort(), up.documents.map((x) => x.id).sort());
    const detail = ok(await staff.get(`/api/admin/company-requests/${rid}`));
    assert.ok(detail.case.work_files.some((x) => x.id === keptWorkFile));
    assert.equal((await mariam.get(`/api/company/documents/${keptWorkFile}/download`)).status, 404, 'L-52');
    assert.equal((await lt.post(`/api/lawyer/assignments/${leadAsg}/work-files`, { files: [file64('a.ogg', 'audio/ogg', Buffer.from('OggS'))] })).status, 400);
    const many = Array.from({ length: 4 }, (_, i) => file64(`f${i}.pdf`, 'application/pdf', pdfBuf()));
    const lim = await lt.post(`/api/lawyer/assignments/${leadAsg}/work-files`, { files: many });
    assert.equal(lim.status, 409);
    assert.equal(lim.body.code, 'work_files_limit');
    const amr = await t.login('amr');
    assert.equal((await amr.del(`/api/lawyer/work-files/${up.documents[1].id}`)).status, 404, 'another lawyer’s file');
    assert.equal((await amr.post(`/api/lawyer/assignments/${leadAsg}/work-files`, { files: [file64('x.pdf', 'application/pdf', pdfBuf())] })).status, 404, 'not their assignment');
    ok(await lt.del(`/api/lawyer/work-files/${up.documents[1].id}`));
    assert.ok(!t.app.db.get('SELECT 1 FROM documents WHERE id = ?', up.documents[1].id));
  });

  test('post-acceptance clarification through the lawyer’s info request: company clarification, SLA paused, reply resumes and extends the due date', async () => {
    const lt = await t.login('tarek');
    const ir = ok(await lt.post(`/api/lawyer/assignments/${leadAsg}/info-requests`, { kind: 'information', question: 'هل وقّعت الشركة عقدًا سابقًا مع الدلتا؟' }), 201);
    const dueBefore = t.req(code).delivery_due_at;
    ok(await staff.post(`/api/admin/info-requests/${ir.id}/approve`, { client_message: 'هل سبق توقيع عقد مع الدلتا؟' }));
    const r = t.req(code);
    assert.equal(r.waiting_on, 'info');
    assert.ok(t.app.db.get('SELECT 1 FROM company_sla_pauses WHERE request_id = ? AND ended_at IS NULL', rid), 'the delivery clock is paused');
    const view = ok(await mariam.get(`/api/company/requests/${code}`));
    assert.equal(view.request.promise.paused, true);
    const clar = view.messages.filter((m) => m.kind === 'clarification').pop();
    freezeClock(new Date(Date.now() + 3 * 3600000).toISOString());
    try {
      ok(await mariam.post(`/api/company/requests/${code}/clarifications/${clar.id}/reply`, { body: 'نعم، عقد 2024 لكنه انتهى. تواصلوا مع مريم عادل' }));
    } finally {
      resetClock();
    }
    const after = t.req(code);
    assert.ok(!after.waiting_on);
    assert.ok(!t.app.db.get('SELECT 1 FROM company_sla_pauses WHERE request_id = ? AND ended_at IS NULL', rid));
    assert.ok(after.delivery_due_at >= dueBefore, 'the due date moves by the paused time');
    // المحامي يرى الرد بعد مشاركة الإدارة، منقحًا
    ok(await staff.post(`/api/admin/info-requests/${ir.id}/share`, { response_text: 'نعم، عقد 2024 لكنه انتهى. تواصلوا مع مريم عادل على mariam@nilefoods.example' }));
    const stored = t.app.db.value('SELECT response_text FROM info_requests WHERE id = ?', ir.id);
    assert.ok(stored.includes('عقد 2024') && !stored.includes('مريم') && !stored.includes('nilefoods'), stored);
    const lv = JSON.stringify(ok(await lt.get(`/api/lawyer/assignments/${leadAsg}`)));
    assert.ok(lv.includes('عقد 2024') && !lv.includes('مريم') && !lv.includes('nilefoods'));
  });

  test('release gates: approved opinion required, senior review required, lawyer names in text and author metadata in files', async () => {
    // مسودة قبل اعتماد أي رأي
    const d0 = ok(await staff.post(`/api/admin/company-requests/${rid}/deliverables`, { title: 'مراجعة عقد الدلتا', summary: 'العقد مقبول بعد تعديل بند المسؤولية.' }), 201);
    const g0 = await staff.post(`/api/admin/company-deliverables/${d0.deliverable.id}/release`, {});
    assert.equal(g0.status, 409);
    assert.equal(g0.body.code, 'approved_opinion_required');
    const opLead = await t.opinion('tarek', leadAsg, 'الخلاصة التنفيذية\nالعقد مقبول مع تعديل بند المسؤولية. ننصح بالتوقيع بعد التعديل.\n\nالتحليل\nتفاصيل البنود.');
    // المراجع لم يعتمد بعد ← مراجعة ثانية مطلوبة (الطلب عالي القيمة/المراجع مُسند)
    const g1 = await staff.post(`/api/admin/company-deliverables/${d0.deliverable.id}/release`, {});
    assert.equal(g1.status, 409);
    assert.equal(g1.body.code, 'senior_review_required');
    await t.opinion('amr', reviewerAsg, 'مراجعة ثانية: أوافق على الخلاصة مع تشديد بند التعويض.');
    const locked = await (await t.login('tarek')).del(`/api/lawyer/work-files/${keptWorkFile}`);
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'work_file_locked');
    // التعبئة الحتمية من الرأي
    const pf = ok(await staff.post(`/api/admin/company-requests/${rid}/deliverables/prefill`, { opinion_id: opLead }));
    assert.match(pf.summary, /العقد مقبول مع تعديل بند المسؤولية/);
    assert.deepEqual(pf.recommendations.map((x) => x.text ?? x), ['تعديل بند المسؤولية', 'التوقيع بعد التعديل']);
    // ملخص التسليم بالذكاء الاصطناعي (P1) بلا مفتاح ← المحلل المحلي = التعبئة الحتمية، اقتراح للفريق فقط
    const ai = ok(await staff.post(`/api/admin/company-requests/${rid}/ai/deliverable`, { opinion_id: opLead }));
    assert.equal(ai.provider, 'heuristic');
    assert.equal(ai.summary, pf.summary.slice(0, 600));
    assert.deepEqual(ai.lawyer_names, []);
    assert.equal(t.app.db.value("SELECT kind FROM ai_suggestions WHERE id = ?", ai.suggestion_id), 'deliverable_summary');
    assert.equal((await staff.post(`/api/admin/company-requests/${rid}/ai/deliverable`, { opinion_id: 999999 })).status, 400);
    // اسم المحامي في النص (عربي ولاتيني) ← lawyer_names؛ ملف كتبه طارق ← file_author_names
    ok(await staff.patch(`/api/admin/company-deliverables/${d0.deliverable.id}`, { summary: 'أعدّه الأستاذ طارق النجار (Tarek El-Naggar): العقد مقبول بعد التعديل.', opinion_id: opLead, files: [file64('عقد-معدل.docx', DOCX_MIME, docxBuf({ author: 'tarek' }))] }));
    const g2 = await staff.post(`/api/admin/company-deliverables/${d0.deliverable.id}/release`, {});
    assert.equal(g2.status, 409);
    assert.equal(g2.body.code, 'file_author_names');
    assert.ok(g2.body.details.file_authors.length && g2.body.details.lawyer_names.length);
    // تجاوز الأسماء لا يتجاوز بيانات الملف
    const g3 = await staff.post(`/api/admin/company-deliverables/${d0.deliverable.id}/release`, { allow_names: true, override_reason: 'طلب العميل', docs_reviewed: true });
    assert.equal(g3.body.code, 'file_author_names');
    const dl = t.app.db.get('SELECT * FROM company_deliverables WHERE id = ?', d0.deliverable.id);
    const docs = t.app.db.all('SELECT document_id FROM company_deliverable_documents WHERE deliverable_id = ?', dl.id).map((x) => x.document_id);
    ok(await staff.patch(`/api/admin/company-deliverables/${dl.id}`, { document_ids: docs.filter((id) => !/docx$/.test(t.app.db.value('SELECT filename FROM documents WHERE id = ?', id))), files: [file64('عقد-معدل.docx', DOCX_MIME, docxBuf({ creator: 'Office' }))] }));
    const g4 = await staff.post(`/api/admin/company-deliverables/${dl.id}/release`, { docs_reviewed: false });
    assert.equal(g4.body.code, 'lawyer_names');
    ok(await staff.patch(`/api/admin/company-deliverables/${dl.id}`, { summary: 'العقد مقبول بعد تعديل بند المسؤولية.' }));
    const g5 = await staff.post(`/api/admin/company-deliverables/${dl.id}/release`, { docs_reviewed: false });
    assert.equal(g5.body.code, 'office_docs_review_required');
    // رسالة خارجية بملف كتبه المحامي ← 409 ولا يُحفظ شيء
    const msgs = Number(t.app.db.value('SELECT COUNT(*) FROM company_messages WHERE request_id = ?', rid));
    const sm = await staff.post(`/api/admin/company-requests/${rid}/messages`, { body: 'مرفق العقد', files: [file64('مسودة.docx', DOCX_MIME, docxBuf({ creator: 'طارق النجار' }))] });
    assert.equal(sm.status, 409);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_messages WHERE request_id = ?', rid)), msgs);
    // التسليم المعتمد بعد مراجعة الملفات
    const rel = ok(await staff.post(`/api/admin/company-deliverables/${dl.id}/release`, { docs_reviewed: true }));
    assert.equal(t.req(code).status, 'delivered');
    assert.ok(rel);
  });

  test('L-52 downloads: released deliverable files and the company’s own files only; a lawyer work file never; withdrawn → 404', async () => {
    const view = ok(await mariam.get(`/api/company/requests/${code}`));
    const del = view.deliverables[0];
    assert.ok(del.documents.length);
    for (const d of del.documents) assert.equal((await mariam.get(`/api/company/documents/${d.id}/download`)).status, 200);
    // ملف عمل المحامي في ملف الطلب
    const work = t.app.documents.save({ filename: 'ملاحظات.pdf', mime: 'application/pdf', data_base64: pdfBuf().toString('base64') }, { case_id: caseId, company_id: companyId(t.app, 'NFD') }, t.app.db.get("SELECT * FROM users WHERE username = 'tarek'"));
    t.app.db.run('UPDATE documents SET company_request_id = ?, assignment_id = ? WHERE id = ?', rid, leadAsg, work);
    assert.equal((await mariam.get(`/api/company/documents/${work}/download`)).status, 404);
    // شركة أخرى ← 404
    const sherif = t.company();
    await sherif.login('sherif@techsol.example');
    assert.equal((await sherif.get(`/api/company/documents/${del.documents[0].id}/download`)).status, 404);
    // INV-B4: لا هاتف ولا اسم محامٍ في أي رد للشركة
    const s = JSON.stringify(view);
    for (const banned of ['طارق', 'عمرو', 'tarek', 'Lawyer']) assert.ok(!s.includes(banned), banned);
  });

  test('request changes resets the timeline to a new cycle; the revision limit is enforced', async () => {
    const view = ok(await mariam.get(`/api/company/requests/${code}`));
    const del = view.deliverables[0];
    ok(await hossam.get(`/api/company/requests/${code}`));
    assert.equal((await hossam.post(`/api/company/requests/${code}/deliverables/${del.id}/request-changes`, { comment: 'تعديل' })).status, 403, 'a colleague who is not the submitter or a watcher');
    const rc = ok(await mariam.post(`/api/company/requests/${code}/deliverables/${del.id}/request-changes`, { comment: 'نرجو إضافة بند غرامة التأخير.' }));
    assert.equal(rc.request.status, 'in_progress');
    assert.equal(t.req(code).revision_count, 1);
    // L-25: دورة جديدة — «المراجعة النهائية» و«التسليم» فارغتان، والدورة السابقة في السجل
    assert.equal(rc.timeline.find((s) => s.stage === 'delivered').at, null, JSON.stringify(rc.timeline));
    assert.equal(rc.timeline.find((s) => s.stage === 'final_review').at, null);
    assert.equal(rc.timeline_history.length, 1);
    // تسليم ثانٍ ثم استنفاد جولات التعديل (Growth: جولتان)
    t.app.db.run('UPDATE company_requests SET revision_count = 2 WHERE id = ?', rid);
    const d2 = ok(await staff.post(`/api/admin/company-requests/${rid}/deliverables`, { title: 'مراجعة معدلة', summary: 'أضفنا بند غرامة التأخير كما طلبتم.' }), 201);
    ok(await staff.post(`/api/admin/company-deliverables/${d2.deliverable.id}/release`, {}));
    const lim = await mariam.post(`/api/company/requests/${code}/deliverables/${d2.deliverable.id}/request-changes`, { comment: 'مرة أخرى' });
    assert.equal(lim.status, 409);
    assert.equal(lim.body.code, 'revision_limit');
  });

  test('accept: closes request and case (system actor), contract saved to memory under review, knowledge stays company-only and cannot be approved or exported', async () => {
    const view = ok(await mariam.get(`/api/company/requests/${code}`));
    const del = view.deliverables.filter((d) => !d.decision).sort((a, b) => b.version - a.version)[0];
    const acc = ok(await mariam.post(`/api/company/requests/${code}/deliverables/${del.id}/accept`, { rating: 5, comment: 'ممتاز', record_decision: { topic: 'سقف المسؤولية مع الموردين', decision: 'لا نقبل مسؤولية غير محدودة في عقود التوريد.' } }));
    assert.equal(acc.request.status, 'closed');
    const pos = t.app.db.get("SELECT * FROM company_memory WHERE kind = 'position' AND source_request_id = ?", rid);
    assert.ok(pos && pos.access === 'admins', 'P1 record_decision → a position item for portal admins');
    const qrow = ok(await staff.get('/api/admin/company-requests?status=all')).items.find((x) => x.code === code);
    assert.ok(qrow.flags.includes('memory_pending'), JSON.stringify(qrow.flags));
    const r = t.req(code);
    const c = t.app.db.get('SELECT status, closed_by FROM cases WHERE id = ?', caseId);
    assert.equal(c.status, 'closed');
    assert.equal(c.closed_by, null, 'L-19: system actor');
    const m = t.app.db.get('SELECT * FROM company_memory WHERE id = ?', r.memory_item_id);
    assert.equal(m.kind, 'contract');
    assert.equal(m.status, 'under_review');
    assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company_request.memory_pending'"));
    const k = t.app.db.get('SELECT * FROM knowledge_records WHERE case_id = ?', caseId);
    assert.ok(k, 'a knowledge record is built on close');
    assert.equal(k.scope, 'company');
    assert.equal(k.status, 'company_only');
    assert.equal(k.company_id, companyId(t.app, 'NFD'));
    const ap = await staff.post(`/api/admin/knowledge/${k.id}/approve`, {});
    assert.equal(ap.status, 409);
    assert.equal(ap.body.code, 'company_knowledge_not_shareable');
    // حتى لو تغيرت حالته يدويًا، لا يخرج في ملف التدريب (#28)
    t.app.db.run("UPDATE knowledge_records SET status = 'approved', usage = 'knowledge_training' WHERE id = ?", k.id);
    assert.ok(!t.app.knowledge.exportTraining().some((x) => x.id === k.id), 'never exported for training');
    t.app.db.run("UPDATE knowledge_records SET status = 'company_only', usage = 'none' WHERE id = ?", k.id);
    // التكرار بعد الإغلاق 200 (لا خطأ)
    assert.equal((await mariam.post(`/api/company/requests/${code}/deliverables/${del.id}/accept`, { rating: 5 })).status, 200);
    // المحاسبة: واقعة الاستحقاق على ملف شركة «مستحقة» (#26)
    const ev = t.app.db.all('SELECT treatment FROM billable_events WHERE case_id = ?', caseId);
    assert.ok(ev.length && ev.every((e) => e.treatment === 'payable'), JSON.stringify(ev));
    // إعادة الفتح خلال 30 يومًا تعيد فتح الملف
    const re = ok(await staff.post(`/api/admin/company-requests/${rid}/reopen`, { rev: t.req(code).rev, reason: 'ملاحظة متأخرة من الشركة' }));
    assert.equal(re.status ?? re.request?.status ?? t.req(code).status, 'in_progress');
    assert.equal(t.app.db.value('SELECT status FROM cases WHERE id = ?', caseId) === 'closed', false);
  });

  test('decline after acceptance returns the request to the plan balance; auto-close after the delivery window', async () => {
    const c2 = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن لائحة الجزاءات', fields: {} });
    ok(await t.accept(staff, c2, { assign: { lead: { lawyer_id: t.lawyers.amr } } }), 201);
    assert.equal(t.req(c2).quota_kind, 'included');
    ok(await staff.post(`/api/admin/company-requests/${t.req(c2).id}/decline`, { rev: t.req(c2).rev, kind: 'conflict', reason_for_company: 'تبين وجود تعارض مصالح يمنعنا من العمل على الطلب.' }));
    assert.equal(t.req(c2).status, 'declined');
    assert.equal(t.req(c2).quota_kind, 'free');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.quota_released'"));
    // إغلاق تلقائي
    const c3 = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال سريع عن إجازة الوضع', fields: {} });
    ok(await t.accept(staff, c3, { assign: { lead: { lawyer_id: t.lawyers.amr } } }), 201);
    t.app.db.run("UPDATE company_requests SET status = 'delivered', delivered_at = '2026-01-01T10:00:00.000Z' WHERE code = ?", c3);
    assert.ok(t.app.companyRequests.autoClose() >= 1);
    assert.equal(t.req(c3).status, 'closed');
    assert.equal(t.req(c3).resolution, 'auto_closed');
    assert.equal(t.app.db.value('SELECT status FROM cases WHERE id = ?', t.req(c3).case_id), 'closed');
  });

  test('CS-9: company accept after a staff close → 200 (rating kept, still closed); an engine case already closed counts as success', async () => {
    const deliver = async (c) => {
      ok(await t.accept(staff, c, { assign: { lead: { lawyer_id: t.lawyers.amr } } }), 201);
      const r = t.req(c);
      const d = ok(await staff.post(`/api/admin/company-requests/${r.id}/deliverables`, { title: 'رأي مكتوب', summary: 'الإجراء سليم مع إخطار الموظف كتابيًا.' }), 201);
      ok(await staff.post(`/api/admin/company-deliverables/${d.deliverable.id}/release`, { override_reason: 'تسليم شفهي سابق موثق' }));
      assert.equal(t.req(c).status, 'delivered');
      assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.deliverable_released_override'"));
      return d.deliverable.id;
    };
    const c4 = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن إنذار موظف متغيب', fields: {} });
    const d4 = await deliver(c4);
    ok(await staff.post(`/api/admin/company-requests/${t.req(c4).id}/close`, { rev: t.req(c4).rev, outcome: 'delivered', note_for_company: 'أغلقنا الطلب بعد التسليم.' }));
    assert.equal(t.req(c4).status, 'closed');
    const a4 = ok(await mariam.post(`/api/company/requests/${c4}/deliverables/${d4}/accept`, { rating: 4 }));
    assert.equal(a4.request.status, 'closed');
    assert.equal(t.req(c4).rating, 4);
    assert.equal(t.app.db.value('SELECT decision FROM company_deliverables WHERE id = ?', d4), 'accepted');
    // ملف المحرك مغلق مسبقًا (قبل الحارس) ← اعتماد الشركة ينجح
    const c5 = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن ساعات العمل الإضافية', fields: {} });
    const d5 = await deliver(c5);
    t.app.db.run("UPDATE cases SET status = 'closed', closed_at = ? WHERE id = ?", new Date().toISOString(), t.req(c5).case_id);
    const a5 = ok(await mariam.post(`/api/company/requests/${c5}/deliverables/${d5}/accept`, { rating: 5 }));
    assert.equal(a5.request.status, 'closed');
  });
});

describe('v10 quotes, charges and the accept plan (SRV-10, L-31, L-61, INV-B10)', () => {
  let t;
  let sherif;
  let omar;
  let staff;
  before(async () => {
    t = await journeyApp();
    t.app.db.run("UPDATE users SET email = 'admin@firm.example' WHERE username = 'admin'");
    sherif = t.company();
    await sherif.login('sherif@techsol.example');
    omar = t.company();
    await omar.login('omar@techsol.example');
    staff = await t.login('admin');
  });
  after(async () => t && t.close());

  const dispute = (c) => t.submit(c, { type: 'dispute', description: 'مورد امتنع عن تسليم أجهزة دفعنا ثمنها ونريد رفع دعوى', fields: { counterparty_name: 'مؤسسة الصعيد للتوزيع', dispute_kind: 'owed_to_us', stage: 'lawsuit_filed', desired_outcome: 'استرداد المبلغ', amount: 50000 } });

  test('out of scope: accept 409, hourly 400, member approval 403, admin approval creates one charge, notifies billing contacts by e-mail with amount and code only, and runs the accept plan', async () => {
    const code = await dispute(omar);
    const r = t.req(code);
    const oos = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(oos.status, 409);
    assert.equal(oos.body.code, 'out_of_scope_requires_quote');
    const hourly = await staff.post(`/api/admin/company-requests/${r.id}/quote`, { rev: r.rev, kind: 'out_of_scope', basis: 'hourly', amount: 1, scope_of_work: 'رفع دعوى' });
    assert.equal(hourly.status, 400);
    assert.equal(hourly.body.code, 'basis_not_available');
    const q = ok(await staff.post(`/api/admin/company-requests/${r.id}/quote`, { rev: t.req(code).rev, kind: 'out_of_scope', basis: 'fixed', amount: 45000, scope_of_work: 'رفع دعوى استرداد أمام المحكمة الاقتصادية حتى حكم أول درجة.', accept_plan: { brief_for_lawyer: 'دعوى استرداد ثمن أجهزة لم تُسلَّم؛ تقييم الموقف وإعداد الصحيفة.', assign: { lead: { lawyer_id: t.lawyers.amr } } } }), 201);
    assert.ok(q);
    const cv = ok(await omar.get(`/api/company/requests/${code}`));
    const number = cv.quote.number;
    assert.match(number, /^TSL-Q-\d{3}$/);
    const m = await omar.post(`/api/company/requests/${code}/quotes/${number}/approve`, {});
    assert.equal(m.status, 403, 'a member who is not allowed to approve');
    const a = ok(await sherif.post(`/api/company/requests/${code}/quotes/${number}/approve`, {}));
    assert.equal(a.request.status, 'in_progress', 'the accept plan ran');
    assert.ok(t.req(code).case_id);
    ok(await sherif.post(`/api/company/requests/${code}/quotes/${number}/approve`, {}));
    const charges = t.app.db.all('SELECT * FROM company_charges WHERE request_id = ?', r.id);
    assert.equal(charges.length, 1, 'idempotent');
    assert.equal(charges[0].amount_minor, 4500000);
    assert.ok(t.app.db.get("SELECT 1 FROM company_notifications WHERE type = 'charge.added'"));
    const mail = t.app.db.all("SELECT * FROM email_outbox WHERE purpose = 'charge_added'");
    assert.ok(mail.length >= 1);
    assert.ok(mail.every((e) => e.body_text.includes(code) && !e.body_text.includes('مؤسسة الصعيد') && !e.body_text.includes('دعوى')), 'amount and code only');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.charge_created'"));
  });

  test('plan_error: the lawyer was deactivated before approval → the company click still succeeds, the request stays new and is flagged', async () => {
    const code = await dispute(sherif);
    const r = t.req(code);
    ok(await staff.post(`/api/admin/company-requests/${r.id}/quote`, { rev: r.rev, kind: 'out_of_scope', basis: 'fixed', amount: 30000, scope_of_work: 'إنذار رسمي ثم دعوى إن لزم الأمر بعد الإنذار.', accept_plan: { brief_for_lawyer: 'إنذار رسمي ثم دعوى إن لزم.', assign: { lead: { lawyer_id: t.lawyers.yasmine } } } }), 201);
    t.app.db.run('UPDATE users SET active = 0 WHERE id = ?', t.lawyers.yasmine);
    try {
      const number = ok(await sherif.get(`/api/company/requests/${code}`)).quote.number;
      const a = await sherif.post(`/api/company/requests/${code}/quotes/${number}/approve`, {});
      assert.equal(a.status, 200);
      const after = t.req(code);
      assert.equal(after.status, 'submitted');
      assert.equal(after.case_id, null);
      assert.ok(JSON.parse(after.flags || '[]').includes('plan_error'));
      assert.match(after.accept_plan_error, /موقوف/);
      assert.ok(t.app.db.get("SELECT 1 FROM notifications WHERE type = 'company_request.plan_error'"));
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM company_charges WHERE request_id = ?', after.id)), 1, 'the approval and its charge stand');
      const row = ok(await staff.get('/api/admin/company-requests?status=all')).items.find((x) => x.code === code);
      assert.ok(row.flags.includes('plan_error'));
    } finally {
      t.app.db.run('UPDATE users SET active = 1 WHERE id = ?', t.lawyers.yasmine);
    }
  });

  test('reject cancels the request; an expired quote → 409 and the request returns to new', async () => {
    const c1 = await dispute(sherif);
    ok(await staff.post(`/api/admin/company-requests/${t.req(c1).id}/quote`, { rev: t.req(c1).rev, kind: 'out_of_scope', basis: 'fixed', amount: 1000, scope_of_work: 'نطاق عمل محدد للاختبار هنا.' }), 201);
    const n1 = ok(await sherif.get(`/api/company/requests/${c1}`)).quote.number;
    assert.equal((await sherif.post(`/api/company/requests/${c1}/quotes/${n1}/reject`, {})).status, 400);
    ok(await sherif.post(`/api/company/requests/${c1}/quotes/${n1}/reject`, { reason: 'السعر أعلى من الميزانية' }));
    assert.equal(t.req(c1).status, 'cancelled');
    const c2 = await dispute(sherif);
    ok(await staff.post(`/api/admin/company-requests/${t.req(c2).id}/quote`, { rev: t.req(c2).rev, kind: 'out_of_scope', basis: 'fixed', amount: 1000, scope_of_work: 'نطاق عمل محدد للاختبار هنا.' }), 201);
    const n2 = ok(await sherif.get(`/api/company/requests/${c2}`)).quote.number;
    t.app.db.run("UPDATE company_quotes SET valid_until = '2026-01-01T00:00:00.000Z' WHERE number = ?", n2);
    const ex = await sherif.post(`/api/company/requests/${c2}/quotes/${n2}/approve`, {});
    assert.equal(ex.status, 409);
    assert.equal(ex.body.code, 'quote_expired');
    assert.equal(t.req(c2).status, 'submitted');
    assert.ok(!t.app.db.get('SELECT 1 FROM company_charges WHERE request_id = ?', t.req(c2).id));
  });

  test('capped quote: the charge equals the cap; a replacement above the cap → 409; a lower one voids the original', async () => {
    const code = await dispute(sherif);
    ok(await staff.post(`/api/admin/company-requests/${t.req(code).id}/quote`, { rev: t.req(code).rev, kind: 'out_of_scope', basis: 'capped', cap: 20000, scope_of_work: 'تفاوض وتسوية ودية بحد أقصى للأتعاب.' }), 201);
    const n = ok(await sherif.get(`/api/company/requests/${code}`)).quote.number;
    ok(await sherif.post(`/api/company/requests/${code}/quotes/${n}/approve`, {}));
    const ch = t.app.db.get('SELECT * FROM company_charges WHERE request_id = ?', t.req(code).id);
    assert.equal(ch.amount_minor, 2000000);
    const tsl = companyId(t.app, 'TSL');
    const up = await staff.post(`/api/admin/companies/${tsl}/charges`, { replaces_charge_id: ch.id, amount: 25000, description: 'التكلفة الفعلية' });
    assert.equal(up.status, 409);
    assert.equal(up.body.code, 'charge_exceeds_cap');
    ok(await staff.post(`/api/admin/companies/${tsl}/charges`, { replaces_charge_id: ch.id, amount: 15000, description: 'التكلفة الفعلية' }), 201);
    assert.ok(t.app.db.value('SELECT voided_at FROM company_charges WHERE id = ?', ch.id));
    const manager = await t.login('manager');
    assert.equal((await manager.post(`/api/admin/companies/${tsl}/charges`, { amount: 10, description: 'x' })).status, 403, 'charges are admin only');
  });

  test('conflict of interest: an opponent named like an existing individual client → 409 conflict_review_required, then accepted with conflict_ack and audited', async () => {
    const now = new Date().toISOString();
    t.app.db.insert('clients', { code: 'CL-09001', name: 'مؤسسة الفجر للتوريدات العمومية', created_at: now, updated_at: now });
    const code = await t.submit(sherif, { type: 'supplier_issue', description: 'المورد تأخر في تسليم الأجهزة ونريد إنذاره رسميًا', fields: { supplier_name: 'مؤسسة الفجر للتوريدات العمومية', issue_kind: 'late_delivery' } });
    const c1 = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(c1.status, 409, JSON.stringify(c1.body));
    assert.equal(c1.body.code, 'conflict_review_required');
    assert.ok(c1.body.details.matches.length);
    assert.equal(t.req(code).case_id, null, 'nothing created');
    ok(await t.accept(staff, code, { conflict_ack: true, assign: { lead: { lawyer_id: t.lawyers.amr } } }), 201);
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'company.conflict_acknowledged'"));
    const party = t.app.db.get("SELECT * FROM case_parties WHERE case_id = ? AND name = 'مؤسسة الفجر للتوريدات العمومية'", t.req(code).case_id);
    assert.ok(party, 'the counterparty is a party on the case');
  });

  test('overage: approval policy → 409 overage_approval_required; bill policy → a charge at acceptance; CSV export has the subscription line', async () => {
    const tsl = companyId(t.app, 'TSL');
    const company = t.app.db.get('SELECT * FROM companies WHERE id = ?', tsl);
    const period = t.app.companyBilling.classify(company).quota_period;
    const used = Number(t.app.db.value("SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND quota_kind = 'included' AND quota_period = ?", tsl, period));
    for (let i = used; i < 5; i++) {
      const c = await t.submit(sherif, { type: 'other', description: `طلب لاستهلاك الباقة ${i}`, fields: {} });
      t.app.db.run("UPDATE company_requests SET quota_kind = 'included', quota_period = ? WHERE code = ?", period, c);
    }
    const code = await t.submit(sherif, { type: 'other', description: 'طلب فوق الباقة', fields: {} });
    const ov = await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } });
    assert.equal(ov.status, 409);
    assert.equal(ov.body.code, 'overage_approval_required');
    const sub = t.app.db.get("SELECT id, terms FROM company_subscriptions WHERE company_id = ? ORDER BY id DESC LIMIT 1", tsl);
    t.app.db.run('UPDATE company_subscriptions SET terms = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(sub.terms), overage_policy: 'bill' }), sub.id);
    ok(await t.accept(staff, code, { assign: { lead: { lawyer_id: t.lawyers.amr } } }), 201);
    const ch = t.app.db.get('SELECT * FROM company_charges WHERE request_id = ?', t.req(code).id);
    assert.equal(ch.kind, 'overage');
    assert.equal(ch.amount_minor, 300000);
    const link = ok(await staff.post('/api/admin/company-charges.csv', { company_id: tsl }));
    const res = await staff.get(link.url);
    assert.equal(res.status, 200);
    const csv = typeof res.body === 'string' ? res.body : String(res.body);
    assert.match(csv, /اشتراك|Starter/);
    assert.ok(csv.includes(code));
  });
});

describe('v10 company triage through Claude (SRV-7 P1, fake SDK — never the real API)', () => {
  let t;
  let mariam;
  const calls = [];
  let output = null;
  before(async () => {
    class FakeAnthropic {
      constructor() {
        this.beta = {
          messages: {
            create: async (params) => {
              calls.push(params);
              return { id: `msg_${calls.length}`, model: params.model, stop_reason: 'end_turn', content: [{ type: 'text', text: output === undefined ? '{not json' : JSON.stringify(output) }], usage: { input_tokens: 1200, output_tokens: 300 } };
            },
          },
        };
      }
    }
    setSdkLoader(() => FakeAnthropic);
    t = await journeyApp({ ai: { provider: 'auto', anthropicApiKey: '' } });
    t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000' }, null);
    mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
  });
  after(async () => {
    setSdkLoader(null);
    if (t) await t.close();
  });

  test('SYSTEM_B2B + company_triage schema; no company-employee contacts sent; output post-processed and stored for staff; usage counted', async () => {
    const code = await t.submit(mariam, {
      type: 'other',
      entity_id: t.nfdEntity,
      description: 'نريد مراجعة سياسة الخصوصية لتطبيق التوصيل قبل الإطلاق. تتابع معكم مريم عادل على mariam@nilefoods.example أو 01011112222',
      fields: {},
    });
    const r = t.req(code);
    t.app.ai.companyAi.cancelTimers();
    output = {
      type: 'compliance_question', type_confidence: 0.9, type_reason: 'سؤال امتثال لحماية البيانات', one_line: 'مراجعة سياسة خصوصية قبل الإطلاق',
      practice_area: 'COM', secondary_areas: ['NOPE'], skills: ['data_protection', 'bogus'], urgency: 'normal', urgency_reason: 'لا موعد',
      deadlines: [], risk_flags: [{ code: 'personal_data', severity: 'high', note: 'بيانات عملاء' }], missing_info: [], excluded_work: 'none', scope_reason: 'ضمن الباقة',
      effort: { size: 'M', hours_min: 4, hours_max: 8, reason: 'متوسط' }, senior_review_recommended: true, deliverable_kind: 'memo',
      brief_for_lawyer: 'مراجعة سياسة خصوصية؛ تواصل مع مريم عادل', issues: ['أساس المعالجة'], questions_for_company: ['هل يجمع التطبيق الموقع؟'],
      memory_refs: [{ ref: 'M-999', why: 'مختلق' }], confidence: 0.8,
    };
    const staffUser = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    const sug = await t.app.ai.triageCompanyRequest(r.id, staffUser);
    assert.equal(sug.provider, 'anthropic');
    const params = calls.at(-1);
    assert.match(params.system[0].text, /إدارةً قانونية خارجية/);
    assert.ok(!params.system[0].text.includes('الأرامل'), 'the B2C system prompt is untouched and unused');
    assert.match(params.system[1].text, /فرز طلب وارد من شركة/);
    const content = String(params.messages[0].content);
    for (const banned of ['مريم عادل', 'mariam@', '01011112222']) assert.ok(!content.includes(banned), `not sent to Claude: ${banned}`);
    assert.ok(params.output_config.format.schema.properties.memory_refs);
    const out = typeof sug.output === 'string' ? JSON.parse(sug.output) : sug.output;
    assert.equal(out.type, 'compliance_question');
    assert.deepEqual(out.secondary_areas, []);
    assert.deepEqual(out.skills, ['data_protection']);
    assert.deepEqual(out.memory_refs, [], 'references outside the provided context are dropped');
    assert.ok(!out.brief_for_lawyer.includes('مريم'));
    assert.equal(out.senior_review, true, 'Growth high_risk policy with a high risk flag');
    const use = t.app.db.get("SELECT * FROM ai_usage WHERE feature = 'company_triage' AND provider = 'anthropic' AND entity_id = ?", r.id);
    assert.ok(use && use.user_id === staffUser.id && use.input_tokens === 1200);
    // الشركة لا ترى شيئًا من ذلك
    assert.ok(!JSON.stringify(ok(await mariam.get(`/api/company/requests/${code}`))).includes('compliance_question'));
  });

  test('deliverable summary through Claude: SYSTEM_B2B, lawyer names removed before and after, stored as a staff suggestion', async () => {
    const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن فصل موظف متغيب', fields: {} });
    t.app.ai.companyAi.cancelTimers();
    const acc = await t.accept(await t.login('admin'), code, { assign: { lead: { lawyer_id: t.lawyers.tarek } } });
    assert.equal(acc.status, 201, JSON.stringify(acc.body));
    const asg = acc.body.assignments[0].assignment_id;
    output = undefined; // أي استدعاء آخر لـ Claude أثناء ذلك يعود للمحلل المحلي
    const op = await t.opinion('tarek', asg, 'الخلاصة التنفيذية\nيجوز الفصل بعد إنذار كتابي. أعده طارق النجار.\n\nالتحليل\nتفاصيل.');
    output = { summary: 'يجوز الفصل بعد إنذار كتابي — طارق النجار', recommendations: ['أرسلوا إنذارًا كتابيًا', 'Tarek El-Naggar يتابع'], risk_level: 'medium', body: 'نص للشركة كتبه tarek' };
    const before = calls.length;
    const staff = await t.login('admin');
    const ai = ok(await staff.post(`/api/admin/company-requests/${t.req(code).id}/ai/deliverable`, { opinion_id: op }));
    assert.equal(ai.provider, 'anthropic');
    const params = calls.slice(before).find((c) => c.output_config?.format?.schema?.properties?.body);
    assert.ok(params, 'the deliverable schema was used');
    assert.match(params.system[0].text, /إدارةً قانونية خارجية/);
    assert.ok(!String(params.messages[0].content).includes('طارق النجار'), 'lawyer names are not sent');
    const all = JSON.stringify(ai);
    for (const n of ['طارق النجار', 'Tarek El-Naggar', 'tarek']) assert.ok(!all.includes(n), `removed: ${n}`);
    assert.equal(ai.risk_level, 'medium');
    assert.ok(!JSON.stringify(ok(await mariam.get(`/api/company/requests/${code}`))).includes('إنذار كتابي'), 'never reaches the company until staff release a deliverable');
  });

  test('a provider failure falls back to the local analyser and counts as one automatic run', async () => {
    const code = await t.submit(mariam, { type: 'other', entity_id: t.nfdEntity, description: 'سؤال عن لائحة العمل الداخلية', fields: {} });
    const r = t.req(code);
    t.app.ai.companyAi.cancelTimers();
    output = undefined;
    const before = calls.length;
    const sug = await t.app.ai.triageCompanyRequest(r.id);
    assert.ok(calls.length > before);
    assert.equal(sug.provider, 'heuristic', 'invalid JSON → heuristic fallback');
    assert.equal(t.app.ai.companyAi.autoRunsLastDay(r.id), 1);
  });
});
