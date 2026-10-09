// v10 b2b-server — العزل بين جهات الدخول وبين الشركات (INV-B1، INV-B1b، INV-B2؛ B10-12؛ §7.3-1، §7.3-2، §7.3-10).
// مسح جدول المسارات في الاتجاهين: كل مسار /api/company/* (عدا مسارات الدخول) يرد 401 بلا كعكة الشركة أو بكعكة فريق المكتب وحدها،
// وكل مسار /api/admin|lawyer|account|notifications|documents|print يرد 401 بكعكة الشركة وحدها؛ ومع الكعكتين معًا يُعامل كل
// طرف بكعكته هو فقط.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { seedB2bDemo, COMPANY_DEMO_PASSWORD } from '../src/seed-v10-b2b.js';
import { COMPANY_PUBLIC_ROUTES } from '../src/routes/company.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** طلب بكعكات صريحة (لا يحفظ شيئًا) */
async function call(base, method, url, { cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload;
  if (method !== 'GET' && method !== 'HEAD') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body ?? {});
  }
  const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body: data, headers: res.headers };
}

/** دخول بوابة الشركات وإرجاع الكعكة «bm_csid=…» */
async function companyLogin(base, email, password = COMPANY_DEMO_PASSWORD) {
  const res = await fetch(`${base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const set = res.headers.get('set-cookie') || '';
  const m = /bm_csid=([^;]+)/.exec(set);
  if (res.status !== 200 || !m) throw new Error(`company login failed for ${email}: ${res.status} ${await res.text()}`);
  return `bm_csid=${m[1]}`;
}

/** قيم معاملات المسار: معرّفات غير موجودة حتى لا يُعدَّل شيء حقيقي أثناء المسح */
function fill(pattern) {
  return pattern
    .replace(':code', 'NFD-9999')
    .replace(':number', 'NFD-Q-999')
    .replace(':messageId', '999999')
    .replace(':sid', 'no-such-session')
    .replace(':kind', 'invoice')
    .replace(':file', 'no-such-file')
    .replace(':entity', 'clients')
    .replace(/:[a-zA-Z]+/g, '999999');
}

describe('v10 isolation — route scan in both directions (B10-12, INV-B2)', () => {
  let t;
  let staffCookie;
  let companyCookie;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    await seedB2bDemo(t.app);
    const admin = await t.login('admin');
    staffCookie = admin.cookie;
    companyCookie = await companyLogin(t.base, 'mariam@nilefoods.example');
  });
  after(async () => t && t.close());

  const routes = () => t.app.router.routes.map((r) => ({ method: r.method, pattern: r.pattern, key: `${r.method} ${r.pattern}` }));

  test('the company route table is registered in full (§4.5) and every company handler is behind the guard', async () => {
    const company = routes().filter((r) => r.pattern.startsWith('/api/company/'));
    assert.ok(company.length >= 60, `expected the full §4.5 table, found ${company.length}`);
    for (const must of [
      'GET /api/company/home',
      'GET /api/company/plan',
      'POST /api/company/uploads',
      'POST /api/company/requests',
      'POST /api/company/requests/:code/clarifications/:messageId/reply',
      'POST /api/company/requests/:code/quotes/:number/approve',
      'POST /api/company/requests/:code/escalate',
      'GET /api/company/documents/:id/download',
      'GET /api/company/search',
      'GET /api/company/charges',
      'GET /api/company/colleagues',
      'PATCH /api/company/team/:uid',
      'POST /api/company/notifications/:id/read',
    ]) {
      assert.ok(company.some((r) => r.key === must), `missing ${must}`);
    }
    for (const r of company) {
      if (COMPANY_PUBLIC_ROUTES.includes(r.key)) continue;
      const url = fill(r.pattern);
      const none = await call(t.base, r.method, url);
      assert.equal(none.status, 401, `${r.key} without a cookie → 401 (got ${none.status})`);
      const staffOnly = await call(t.base, r.method, url, { cookie: staffCookie });
      assert.equal(staffOnly.status, 401, `${r.key} with only a staff cookie → 401 (got ${staffOnly.status})`);
      const withCompany = await call(t.base, r.method, url, { cookie: companyCookie });
      assert.notEqual(withCompany.status, 401, `${r.key} with a company cookie reaches the handler (got 401: ${JSON.stringify(withCompany.body)})`);
    }
  });

  test('a company cookie alone never reaches staff, lawyer, account, notification, document or print routes', async () => {
    const scoped = routes().filter((r) => /^\/api\/(admin|lawyer|account|notifications|documents|print)(\/|$)/.test(r.pattern));
    assert.ok(scoped.length >= 150, `scanner found ${scoped.length} staff/lawyer routes`);
    for (const r of scoped) {
      const res = await call(t.base, r.method, fill(r.pattern), { cookie: companyCookie });
      assert.equal(res.status, 401, `${r.key} with only a company cookie → 401 (got ${res.status} ${JSON.stringify(res.body).slice(0, 120)})`);
    }
  });

  test('with both cookies each side sees only its own principal', async () => {
    const both = `${staffCookie}; ${companyCookie}`;
    const me = await call(t.base, 'GET', '/api/company/me', { cookie: both });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'mariam@nilefoods.example');
    const session = await call(t.base, 'GET', '/api/company/auth/session', { cookie: both });
    assert.equal(session.body.user.email, 'mariam@nilefoods.example');
    const staffMe = await call(t.base, 'GET', '/api/auth/me', { cookie: both });
    assert.equal(staffMe.status, 200);
    assert.equal(staffMe.body.user.username, 'admin');
    const list = await call(t.base, 'GET', '/api/admin/companies', { cookie: both });
    assert.equal(list.status, 200);
    // كعكة الإدارة وحدها لا تفتح حساب الشركة حتى مع الكعكتين في طلب لمسار إدارة ثم شركة
    const staffSession = await call(t.base, 'GET', '/api/company/auth/session', { cookie: staffCookie });
    assert.deepEqual([staffSession.body.user, staffSession.body.company], [null, null]);
  });

  test('login sets bm_csid on /api/company only (HttpOnly, SameSite=Strict); logout clears it on the same path', async () => {
    const res = await fetch(`${t.base}/api/company/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'sherif@techsol.example', password: COMPANY_DEMO_PASSWORD }) });
    const set = res.headers.get('set-cookie');
    assert.match(set, /^bm_csid=[^;]+; Path=\/api\/company; HttpOnly; SameSite=Strict; Max-Age=\d+/);
    const cookie = `bm_csid=${/bm_csid=([^;]+)/.exec(set)[1]}`;
    const out = await fetch(`${t.base}/api/company/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie'), /^bm_csid=; Path=\/api\/company; HttpOnly; SameSite=Strict; Max-Age=0/);
    const after = await call(t.base, 'GET', '/api/company/me', { cookie });
    assert.equal(after.status, 401);
  });
});

describe('v10 isolation — cross-tenant and intra-tenant (INV-B1, INV-B1b) on the routes that exist in build-1', () => {
  let t;
  let mariam;
  let sherif;
  let dina;
  let ids;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    await seedB2bDemo(t.app);
    mariam = await companyLogin(t.base, 'mariam@nilefoods.example');
    sherif = await companyLogin(t.base, 'sherif@techsol.example');
    dina = await companyLogin(t.base, 'dina@nilefoods.example');
    const db = t.app.db;
    ids = {
      omar: db.get("SELECT id FROM company_users WHERE email = 'omar@techsol.example'").id,
      hossam: db.get("SELECT id FROM company_users WHERE email = 'hossam@nilefoods.example'").id,
      tslEntity: db.get("SELECT e.id FROM company_entities e JOIN companies c ON c.id = e.company_id WHERE c.prefix = 'TSL'").id,
    };
  });
  after(async () => t && t.close());

  test('another company’s user, entity and notification ids are 404 with the body of «does not exist»', async () => {
    const missing = await call(t.base, 'PATCH', '/api/company/team/999999', { cookie: mariam, body: { role: 'viewer' } });
    const cross = await call(t.base, 'PATCH', `/api/company/team/${ids.omar}`, { cookie: mariam, body: { role: 'viewer' } });
    assert.equal(cross.status, 404);
    assert.deepEqual(cross.body, missing.body, 'not-yours and does-not-exist look the same');
    for (const [m, u, b] of [
      ['POST', `/api/company/team/${ids.omar}/invite`, {}],
      ['POST', `/api/company/team/${ids.omar}/reset-link`, {}],
      ['POST', `/api/company/team/${ids.omar}/sessions/revoke`, {}],
      ['PATCH', `/api/company/entities/${ids.tslEntity}`, { name: 'اختراق' }],
    ]) {
      const r = await call(t.base, m, u, { cookie: mariam, body: b });
      assert.equal(r.status, 404, `${m} ${u} → 404 (got ${r.status})`);
    }
    assert.equal(t.app.db.get('SELECT role FROM company_users WHERE id = ?', ids.omar).role, 'member', 'nothing changed in TechSol');
    // إشعار يخص مستخدمًا آخر
    const n = t.app.db.insert('company_notifications', { company_user_id: ids.omar, company_id: t.app.db.get("SELECT id FROM companies WHERE prefix='TSL'").id, type: 'x', title: 'سري', created_at: new Date().toISOString() });
    const read = await call(t.base, 'POST', `/api/company/notifications/${n}/read`, { cookie: mariam });
    assert.equal(read.status, 404);
    const list = await call(t.base, 'GET', '/api/company/notifications', { cookie: mariam });
    assert.ok(!JSON.stringify(list.body).includes('سري'));
    // الزملاء والفريق والكيانات من الشركة نفسها فقط
    const col = await call(t.base, 'GET', '/api/company/colleagues', { cookie: sherif });
    assert.deepEqual(col.body.items.map((x) => x.name).sort(), ['شريف حمدي', 'عمر خالد'].sort());
    assert.ok(col.body.items.every((x) => !('email' in x)), 'no e-mails in the colleague list');
    const ents = await call(t.base, 'GET', '/api/company/entities', { cookie: sherif });
    assert.ok(ents.body.items.every((e) => e.id === ids.tslEntity));
  });

  test('roles: a viewer cannot write and a member cannot manage the team (403), billing data needs admin or billing contact', async () => {
    for (const [m, u, b] of [
      ['GET', '/api/company/team'],
      ['POST', '/api/company/team/invite', { name: 'زميل', email: 'x@nilefoods.example' }],
      ['POST', '/api/company/entities', { name: 'كيان' }],
      ['PATCH', '/api/company/profile', { address: 'عنوان' }],
      ['POST', '/api/company/requests', {}],
      ['POST', '/api/company/uploads', {}],
    ]) {
      const r = await call(t.base, m, u, { cookie: dina, body: b });
      assert.equal(r.status, 403, `viewer ${m} ${u} → 403 (got ${r.status})`);
    }
    const hossam = await companyLogin(t.base, 'hossam@nilefoods.example');
    const team = await call(t.base, 'GET', '/api/company/team', { cookie: hossam });
    assert.equal(team.status, 403);
    assert.equal(team.body.error, 'هذا الإجراء متاح لمديري البوابة في شركتكم.');
    const charges = await call(t.base, 'GET', '/api/company/charges', { cookie: hossam });
    assert.equal(charges.status, 403);
    const ok = await call(t.base, 'GET', '/api/company/charges', { cookie: mariam });
    assert.equal(ok.status, 200);
    // مدير البوابة لا يغيّر دوره أو يوقف نفسه من صفحة الفريق
    const self = await call(t.base, 'PATCH', `/api/company/team/${t.app.db.get("SELECT id FROM company_users WHERE email='mariam@nilefoods.example'").id}`, { cookie: mariam, body: { role: 'member' } });
    assert.equal(self.status, 403);
  });

  test('the plan shows prices only to admins and billing contacts; the contract value cap and contracting entity to everyone', async () => {
    const hossam = await companyLogin(t.base, 'hossam@nilefoods.example');
    const pm = await call(t.base, 'GET', '/api/company/plan', { cookie: hossam });
    assert.equal(pm.status, 200);
    assert.ok(!('price' in pm.body.plan) && !('renews' in pm.body.plan));
    assert.ok(!('overage_price' in pm.body.quota));
    assert.ok('contract_value_cap' in pm.body);
    assert.ok(pm.body.contracting_entity.legal_name);
    const pa = await call(t.base, 'GET', '/api/company/plan', { cookie: mariam });
    assert.equal(pa.body.plan.price, 35000);
    assert.equal(pa.body.quota.overage_price, 2500);
  });
});

describe('v10 isolation — b2b_enabled switch and static checks (§7.3-1, §7.3-2, §7.3-10, G-2)', () => {
  test('b2b_enabled=false: every company route is 404 like an unknown path, meta says enabled:false, staff routes keep working', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await seedB2bDemo(t.app);
      const cookie = await companyLogin(t.base, 'mariam@nilefoods.example');
      t.app.settings.set('b2b_enabled', false);
      const meta = await call(t.base, 'GET', '/api/company/meta');
      assert.equal(meta.status, 200);
      assert.equal(meta.body.enabled, false);
      const unknown = await call(t.base, 'GET', '/api/no-such-route');
      for (const [m, u] of [
        ['GET', '/api/company/me'],
        ['GET', '/api/company/auth/session'],
        ['POST', '/api/company/auth/login'],
        ['GET', '/api/company/plan'],
      ]) {
        const r = await call(t.base, m, u, { cookie });
        assert.equal(r.status, 404, `${m} ${u}`);
        assert.deepEqual(r.body, unknown.body);
      }
      const admin = await t.login('admin');
      assert.equal((await admin.get('/api/admin/companies')).status, 200);
    } finally {
      await t.close();
    }
  });

  test('company code never reads ctx.user; routes/company.js holds no request/memory SQL of its own', () => {
    const files = ['src/routes/company.js', 'src/company-auth.js', 'src/services/companies.js', 'src/services/email.js', ...fs.readdirSync(path.join(ROOT, 'src/services')).filter((f) => f.startsWith('company-')).map((f) => `src/services/${f}`)];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/ctx\.user\b/.test(src), `${f} must not read ctx.user`);
    }
    const routes = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
    assert.ok(!/FROM company_requests|FROM company_memory/.test(routes), 'requests and memory are read only through the service predicates (L-51)');
  });

  test('no company-user object is passed to the audit log or documents.save as an actor (L-19, §7.3-3)', () => {
    for (const f of fs.readdirSync(path.join(ROOT, 'src'), { recursive: true }).filter((x) => String(x).endsWith('.js'))) {
      const src = fs.readFileSync(path.join(ROOT, 'src', String(f)), 'utf8');
      assert.ok(!/audit\.log\(\{\s*actor:\s*cu\s*[,}]/.test(src), `${f}: audit actor must be companyActor(cu, company)`);
      assert.ok(!/documents\.save\([^)]*,\s*cu\s*\)/.test(src), `${f}: documents.save uploader must not be a company user`);
    }
  });
});

// ═════════════════════════ SRV-16: المصفوفات الكاملة على العرض التجريبي (المرحلة 2) ═════════════════════════

const pdfB64 = () => Buffer.from('%PDF-1.4\n1 0 obj\n<< /Producer (x)>>\nendobj\n%%EOF\n', 'latin1').toString('base64');

describe('v10 isolation — the full cross-tenant and intra-tenant matrix on the demo (INV-B1, INV-B1b, §7.3-11)', () => {
  let t;
  let ck;
  let q;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    ck = {};
    for (const [k, e] of [['mariam', 'mariam@nilefoods.example'], ['hossam', 'hossam@nilefoods.example'], ['dina', 'dina@nilefoods.example'], ['sherif', 'sherif@techsol.example'], ['omar', 'omar@techsol.example']]) ck[k] = await companyLogin(t.base, e);
    const db = t.app.db;
    const req = (code) => db.get('SELECT * FROM company_requests WHERE code = ?', code);
    const co = (p) => db.get('SELECT * FROM companies WHERE prefix = ?', p);
    q = {
      req,
      nfd: co('NFD'),
      tsl: co('TSL'),
      tslDoc: db.value("SELECT id FROM documents WHERE company_id = (SELECT id FROM companies WHERE prefix = 'TSL') ORDER BY id LIMIT 1"),
      tslDeliverable: db.value("SELECT id FROM company_deliverables WHERE request_id = ?", req('TSL-0001').id),
      tslMemory: db.all("SELECT id FROM company_memory WHERE company_id = (SELECT id FROM companies WHERE prefix = 'TSL')").map((r) => r.id),
      nfdQuote: db.get("SELECT * FROM company_quotes WHERE request_id = ?", req('NFD-0005').id),
      nfdDeliverable: db.value("SELECT id FROM company_deliverables WHERE request_id = ?", req('NFD-0001').id),
      privClarification: db.value("SELECT id FROM company_messages WHERE request_id = ? AND kind = 'clarification'", req('NFD-0002').id),
      privDoc: db.value("SELECT id FROM documents WHERE company_request_id = ? ORDER BY id LIMIT 1", req('NFD-0002').id),
      adminsMemory: db.all("SELECT id, title FROM company_memory WHERE company_id = (SELECT id FROM companies WHERE prefix = 'NFD') AND access = 'admins'"),
    };
  });
  after(async () => t && t.close());

  test('cross-tenant: Nile Foods never reaches TechSol requests, threads, deliverables, documents, memory or search — and back (404 like «does not exist»)', async () => {
    const missing = await call(t.base, 'GET', '/api/company/requests/NFD-9999', { cookie: ck.mariam });
    const cross = await call(t.base, 'GET', '/api/company/requests/TSL-0001', { cookie: ck.mariam });
    assert.equal(cross.status, 404);
    assert.deepEqual(cross.body, missing.body);
    const upMariam = (await call(t.base, 'POST', '/api/company/uploads', { cookie: ck.mariam, body: { file: { name: 'm.pdf', mime: 'application/pdf', data_base64: pdfB64() } } })).body.upload_id;
    const upSherif = (await call(t.base, 'POST', '/api/company/uploads', { cookie: ck.sherif, body: { file: { name: 's.pdf', mime: 'application/pdf', data_base64: pdfB64() } } })).body.upload_id;
    assert.ok(upMariam && upSherif);
    const rows = [
      [ck.mariam, 'POST', '/api/company/requests/TSL-0002/messages', { body: 'رسالة إلى شركة أخرى' }],
      [ck.mariam, 'POST', '/api/company/requests/TSL-0002/documents', { upload_ids: [upMariam] }],
      [ck.mariam, 'POST', '/api/company/requests/TSL-0002/cancel', {}],
      [ck.mariam, 'POST', '/api/company/requests/TSL-0002/escalate', { reason: 'x' }],
      [ck.mariam, 'PUT', '/api/company/requests/TSL-0002/watchers', { user_ids: [] }],
      [ck.mariam, 'POST', `/api/company/requests/TSL-0001/deliverables/${q.tslDeliverable}/accept`, { rating: 5 }],
      [ck.mariam, 'POST', `/api/company/requests/NFD-0004/deliverables/${q.tslDeliverable}/accept`, { rating: 5 }],
      [ck.mariam, 'POST', `/api/company/requests/TSL-0001/deliverables/${q.tslDeliverable}/request-changes`, { reason: 'تعديل مطلوب في البند الثالث' }],
      [ck.mariam, 'GET', `/api/company/documents/${q.tslDoc}/download`],
      [ck.sherif, 'GET', '/api/company/requests/NFD-0005'],
      [ck.sherif, 'POST', `/api/company/requests/NFD-0005/quotes/${q.nfdQuote.number}/approve`, {}],
      [ck.sherif, 'POST', `/api/company/requests/TSL-0002/quotes/${q.nfdQuote.number}/approve`, {}],
      [ck.sherif, 'POST', `/api/company/requests/NFD-0005/quotes/${q.nfdQuote.number}/reject`, { reason: 'x' }],
      [ck.sherif, 'POST', `/api/company/requests/NFD-0002/clarifications/${q.privClarification}/reply`, { body: 'رد' }],
      [ck.sherif, 'POST', `/api/company/requests/TSL-0002/clarifications/${q.privClarification}/reply`, { body: 'رد' }],
      [ck.sherif, 'GET', `/api/company/documents/${q.privDoc}/download`],
    ];
    for (const id of q.tslMemory) {
      rows.push([ck.mariam, 'GET', `/api/company/memory/${id}`]);
      rows.push([ck.mariam, 'PATCH', `/api/company/memory/${id}`, { title: 'اختراق' }]);
      rows.push([ck.mariam, 'POST', `/api/company/memory/${id}/documents`, { upload_ids: [upMariam] }]);
      rows.push([ck.mariam, 'POST', `/api/company/memory/${id}/archive`, {}]);
    }
    for (const [cookie, m, u, b] of rows) {
      const r = await call(t.base, m, u, { cookie, body: b });
      assert.equal(r.status, 404, `${m} ${u} → 404 (got ${r.status} ${JSON.stringify(r.body).slice(0, 120)})`);
    }
    // ملف مرحلي لشركة أخرى في طلب جديد
    const nfdEntity = t.app.db.value('SELECT id FROM company_entities WHERE company_id = ? ORDER BY id LIMIT 1', q.nfd.id);
    const sub = await call(t.base, 'POST', '/api/company/requests', { cookie: ck.mariam, body: { type: 'other', entity_id: nfdEntity, description: 'طلب بملف شركة أخرى', fields: {}, upload_ids: [upSherif] } });
    assert.equal(sub.status, 404);
    // لا شيء تغيّر لدى TechSol
    assert.equal(q.req('TSL-0002').status, 'in_progress');
    assert.equal(t.app.db.value('SELECT status FROM company_quotes WHERE id = ?', q.nfdQuote.id), 'sent');
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM company_messages WHERE request_id = ? AND direction = ?', q.req('TSL-0002').id, 'in'), 0);
    // القوائم والبحث والمواعيد والأطراف والتكاليف لا تحمل شيئًا من الشركة الأخرى
    const tslTitles = t.app.db.all('SELECT title FROM company_requests WHERE company_id = ?', q.tsl.id).map((r) => r.title);
    const tslMemTitles = t.app.db.all('SELECT title FROM company_memory WHERE company_id = ?', q.tsl.id).map((r) => r.title);
    const tslCps = t.app.db.all('SELECT name FROM company_counterparties WHERE company_id = ?', q.tsl.id).map((r) => r.name);
    for (const u of ['/api/company/requests?state=all', '/api/company/memory', '/api/company/key-dates?from=2026-01-01&to=2027-12-31', '/api/company/counterparties', '/api/company/charges', '/api/company/home', '/api/company/notifications', `/api/company/search?q=${encodeURIComponent('TSL')}`, `/api/company/search?q=${encodeURIComponent('اتفاقية')}`]) {
      const r = await call(t.base, 'GET', u, { cookie: ck.mariam });
      assert.equal(r.status, 200, u);
      const raw = JSON.stringify(r.body);
      assert.ok(!/TSL-\d{4}/.test(raw), `${u} has no TechSol code`);
      for (const s of [...tslTitles, ...tslMemTitles, ...tslCps]) assert.ok(!raw.includes(s), `${u} leaks «${s}»`);
    }
    const charges = await call(t.base, 'GET', '/api/company/charges', { cookie: ck.sherif });
    assert.equal(charges.status, 200);
    assert.ok(!JSON.stringify(charges.body).includes('2,500') && (charges.body.items || []).length === 0, 'the Nile Foods overage charge is not TechSol’s');
  });

  test('intra-tenant (INV-B1b): the private employment request and admins-only memory stay invisible to the member and the viewer by every path', async () => {
    for (const who of ['hossam', 'dina']) {
      const cookie = ck[who];
      const rows = [
        ['GET', '/api/company/requests/NFD-0002'],
        ['GET', `/api/company/documents/${q.privDoc}/download`],
        ...(who === 'hossam'
          ? [
              ['POST', '/api/company/requests/NFD-0002/messages', { body: 'رسالة' }],
              ['POST', `/api/company/requests/NFD-0002/clarifications/${q.privClarification}/reply`, { body: 'رد' }],
              // رمز مرئي مع معرّف من طلب خاص أو طلب آخر
              ['POST', `/api/company/requests/NFD-0004/clarifications/${q.privClarification}/reply`, { body: 'رد' }],
              ['POST', `/api/company/requests/NFD-0004/deliverables/${q.nfdDeliverable}/accept`, { rating: 4 }],
              ['POST', `/api/company/requests/NFD-0004/quotes/${q.nfdQuote.number}/approve`, {}],
            ]
          : []),
      ];
      for (const m of q.adminsMemory) rows.push(['GET', `/api/company/memory/${m.id}`]);
      for (const [m, u, b] of rows) {
        const r = await call(t.base, m, u, { cookie, body: b });
        assert.equal(r.status, 404, `${who} ${m} ${u} → 404 (got ${r.status})`);
      }
      const privTitle = q.req('NFD-0002').title;
      for (const u of ['/api/company/requests?state=all', '/api/company/memory', '/api/company/home', '/api/company/counterparties', '/api/company/key-dates?from=2026-01-01&to=2027-12-31', `/api/company/search?q=${encodeURIComponent('عقد عمل')}`, `/api/company/search?q=${encodeURIComponent('الفجر')}`]) {
        const raw = JSON.stringify((await call(t.base, 'GET', u, { cookie })).body);
        assert.ok(!raw.includes('NFD-0002') && !raw.includes(privTitle), `${who} ${u} shows the private request`);
        // («مريم عادل» عنصر «مفوَّضون» لمديري البوابة وهي أيضًا زميلة ظاهرة بالاسم؛ العبرة بالعنصر لا بالاسم)
        const colleagues = new Set(t.app.db.all('SELECT name FROM company_users WHERE company_id = ?', q.nfd.id).map((x) => x.name));
        for (const m of q.adminsMemory) if (!colleagues.has(m.title)) assert.ok(!raw.includes(m.title), `${who} ${u} shows admins-only «${m.title}»`);
        for (const m of q.adminsMemory) assert.ok(!raw.includes(`"id":${m.id},"kind":"`), `${who} ${u} lists admins-only item ${m.id}`);
      }
    }
    // عنصر لمديري البوابة كنموذج سرية في طلب عضو ← 400 memory_not_found (لا 403 يكشف وجوده)
    const tpl = t.app.db.value("SELECT id FROM company_memory WHERE company_id = ? AND access = 'admins' ORDER BY id LIMIT 1", q.nfd.id);
    const nfdEntity = t.app.db.value('SELECT id FROM company_entities WHERE company_id = ? ORDER BY id LIMIT 1', q.nfd.id);
    const r = await call(t.base, 'POST', '/api/company/requests', { cookie: ck.hossam, body: { type: 'nda', entity_id: nfdEntity, description: 'اتفاقية سرية مع مورد جديد', fields: { counterparty_name: 'مورد', direction: 'mutual', purpose: 'تقييم', template_memory_id: tpl } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'memory_not_found');
    // الاطلاع على التكاليف لمديري البوابة وجهات الفوترة فقط
    assert.equal((await call(t.base, 'GET', '/api/company/charges', { cookie: ck.dina })).status, 403);
    assert.equal((await call(t.base, 'GET', '/api/company/charges', { cookie: ck.hossam })).status, 403);
    const own = await call(t.base, 'GET', '/api/company/charges', { cookie: ck.mariam });
    assert.equal(own.status, 200);
    assert.ok(own.body.items.length >= 1, 'the seeded overage charge');
  });

  test('lawyers and company memory documents: no assignment → 404; a grant opens the file; 8 days after the case closes → 404 again (B10-36, CS-11d)', async () => {
    const db = t.app.db;
    const memDoc = db.get("SELECT md.document_id AS doc, m.id AS mid FROM company_memory_documents md JOIN company_memory m ON m.id = md.memory_id WHERE m.company_id = ? AND m.kind = 'contract' ORDER BY md.document_id LIMIT 1", q.nfd.id);
    assert.ok(memDoc);
    const caseId = q.req('NFD-0002').case_id;
    const asg = db.get("SELECT a.id, u.username FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ? AND a.role = 'lead'", caseId);
    const yas = await t.login(asg.username);
    const other = await t.login('ahmed');
    assert.equal((await other.get(`/api/documents/${memDoc.doc}/download`)).status, 404);
    assert.equal((await yas.get(`/api/documents/${memDoc.doc}/download`)).status, 404, 'no grant yet');
    const staff = await t.login('admin');
    const g = await staff.put(`/api/admin/assignments/${asg.id}/memory-grants`, { memory_ids: [memDoc.mid] });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.equal((await yas.get(`/api/documents/${memDoc.doc}/download`)).status, 200);
    assert.equal((await other.get(`/api/documents/${memDoc.doc}/download`)).status, 404);
    const c0 = db.get('SELECT status, closed_at FROM cases WHERE id = ?', caseId);
    try {
      db.run("UPDATE cases SET closed_at = ? WHERE id = ?", new Date(Date.now() - 6 * 86400000).toISOString(), caseId);
      assert.equal((await yas.get(`/api/documents/${memDoc.doc}/download`)).status, 200, 'still open 6 days after closing');
      db.run("UPDATE cases SET closed_at = ? WHERE id = ?", new Date(Date.now() - 8 * 86400000).toISOString(), caseId);
      assert.equal((await yas.get(`/api/documents/${memDoc.doc}/download`)).status, 404, 'closed 8 days ago');
    } finally {
      db.run('UPDATE cases SET status = ?, closed_at = ? WHERE id = ?', c0.status, c0.closed_at, caseId);
      await staff.put(`/api/admin/assignments/${asg.id}/memory-grants`, { memory_ids: [] });
    }
  });
});

describe('v10 isolation — the shadow client and company cases in B2C paths (B10 §12 guards, L-33)', () => {
  let t;
  let staff;
  let shadow;
  let caseId;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    staff = await t.login('admin');
    shadow = t.app.db.value("SELECT client_id FROM companies WHERE prefix = 'NFD'");
    caseId = t.app.db.value("SELECT case_id FROM company_requests WHERE code = 'NFD-0002'");
  });
  after(async () => t && t.close());

  test('absent from client lists and staff search; portal link, identity, merge, intake link and the beneficiary card are refused', async () => {
    const shadows = t.app.db.all('SELECT id, name FROM clients WHERE company_id IS NOT NULL');
    assert.ok(shadows.length >= 2);
    const list = (await staff.get('/api/admin/clients?limit=500')).body;
    assert.ok(!list.items.some((c) => shadows.some((s) => s.id === c.id)), 'guard #9');
    for (const s of shadows) {
      const search = (await staff.get(`/api/admin/search?q=${encodeURIComponent(s.name)}`)).body;
      const hits = search.groups.find((g) => g.key === 'clients')?.items || [];
      assert.ok(!hits.some((c) => c.id === s.id), `guard #5: «${s.name}» is not a client search hit`);
    }
    const b2c = t.app.db.value('SELECT id FROM clients WHERE company_id IS NULL AND merged_into IS NULL ORDER BY id LIMIT 1');
    const intake = t.app.db.value('SELECT id FROM intakes ORDER BY id LIMIT 1');
    for (const [m, u, b, code] of [
      ['post', `/api/admin/clients/${shadow}/portal-link`, {}, 'company_client'],
      ['post', `/api/admin/clients/${shadow}/identities`, { kind: 'phone', value: '01012345670' }, 'company_client'],
      ['post', `/api/admin/clients/${b2c}/merge`, { other_client_id: shadow }, 'company_client'],
      ['post', `/api/admin/clients/${shadow}/merge`, { other_client_id: b2c }, 'company_client'],
      ['post', `/api/admin/intakes/${intake}/link-client`, { client_id: shadow }, 'company_client'],
    ]) {
      const r = await staff[m](u, b);
      assert.equal(r.status, 409, `${u} → 409 (got ${r.status} ${JSON.stringify(r.body)})`);
      assert.equal(r.body.code, code);
    }
    assert.equal((await staff.get(`/api/admin/clients/${shadow}/beneficiary`)).status, 404, 'guard #7');
    assert.equal((await staff.put(`/api/admin/clients/${shadow}/beneficiary`, { relation: 'self' })).status, 404);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM client_identities WHERE client_id = ?', shadow), 0, 'no phone or e-mail identity ever');
  });

  test('B2C channels refuse company cases: client answer, case message, document send, programme link; automated sends are skipped and logged once', async () => {
    const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    const codeOf = (fn) => {
      try {
        fn();
        return null;
      } catch (e) {
        return `${e.status}:${e.code}`;
      }
    };
    assert.equal(codeOf(() => t.app.opinions.saveClientAnswer(caseId, admin, { body: 'رد للعميل' })), '409:company_case_use_deliverables');
    assert.equal(codeOf(() => t.app.cases.sendMessage(caseId, { body: 'رسالة' }, admin)), '409:company_case_use_thread');
    const docId = t.app.db.value('SELECT id FROM documents WHERE case_id = ? ORDER BY id LIMIT 1', caseId);
    assert.equal(codeOf(() => t.app.messaging.sendDocument(docId, {}, admin)), '409:company_document');
    const prog = t.app.db.value('SELECT id FROM programs ORDER BY id LIMIT 1');
    if (prog) assert.equal(codeOf(() => t.app.programs.linkCase(caseId, prog, admin)), '409:company_case_no_program');
    assert.equal(codeOf(() => t.app.engine.sendToClient({ client_id: shadow, case_id: caseId, body: 'رسالة' })), '409:company_client');
    const a = t.app.engine.sendToClient({ client_id: shadow, case_id: caseId, body: 'تذكير', automated: true, rule: 'document_reminder' });
    const b = t.app.engine.sendToClient({ client_id: shadow, case_id: caseId, body: 'تذكير', automated: true, rule: 'document_reminder' });
    assert.equal(a.skipped, 'company_client');
    assert.equal(b.skipped, 'company_client');
    assert.equal(t.app.db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key = 'company_client_skip'"), 1, 'logged once');
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM messages m JOIN clients c ON c.id = m.client_id WHERE c.company_id IS NOT NULL'), 0);
  });

  test('CS-8: automations after the B2B seed create no message for a shadow client, and a company hearing ordered first does not stop a B2C reminder', async () => {
    const db = t.app.db;
    const t0 = new Date().toISOString();
    const inTwoDays = new Date(Date.now() + 2 * 86400000).toISOString();
    const shadowCase = db.get('SELECT * FROM cases WHERE id = ?', caseId);
    const cm = db.insert('matters', { code: 'MAT-B2B-T', case_id: caseId, client_id: shadowCase.client_id, title: 'ملف شركة', kind: 'lawsuit', status: 'active', opened_at: t0, updated_at: t0 });
    const ce = db.insert('matter_events', { matter_id: cm, kind: 'hearing', title: 'جلسة لملف شركة', starts_at: inTwoDays, client_attendance_required: 1, status: 'scheduled', client_text_approved: 1, created_at: t0, updated_at: t0 });
    // أقرب ملف مستمر للأفراد لعميل مؤكد الرقم
    const b2c = db.get(
      `SELECT m.id, m.client_id FROM matters m JOIN cases c ON c.id = m.case_id
       WHERE c.company_id IS NULL AND m.status != 'closed' AND EXISTS (SELECT 1 FROM client_identities i WHERE i.client_id = m.client_id AND i.kind = 'phone')
       ORDER BY m.id LIMIT 1`,
    );
    assert.ok(b2c, 'a B2C matter with a phone exists in the demo');
    const be = db.insert('matter_events', { matter_id: b2c.id, kind: 'hearing', title: 'جلسة أفراد للاختبار', starts_at: inTwoDays, client_attendance_required: 1, status: 'scheduled', client_text_approved: 1, created_at: t0, updated_at: t0 });
    assert.ok(ce < be, 'the company event is scanned first');
    const before = Number(db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key = 'hearing_reminder' AND entity_id = ?", be));
    t.app.automations.runAll();
    assert.equal(Number(db.value('SELECT COUNT(*) FROM messages m JOIN clients c ON c.id = m.client_id WHERE c.company_id IS NOT NULL')), 0, 'no messages row for a shadow client');
    assert.equal(Number(db.value("SELECT COUNT(*) FROM automation_runs WHERE entity_id = ? AND entity_type = 'matter_event'", ce)), 0, 'the company hearing is not even considered');
    const after = Number(db.value("SELECT COUNT(*) FROM automation_runs WHERE rule_key IN ('hearing_reminder','hearing_reminder_unconfirmed') AND entity_id IN (?, (SELECT intake_id FROM cases WHERE id = (SELECT case_id FROM matters WHERE id = ?)))", be, b2c.id));
    assert.ok(after > before, 'the B2C hearing was handled in the same run');
  });
});

describe('v10 isolation — B2C reports are byte-identical with more B2B data present (INV-B7, CO-8, INV-B12)', () => {
  test('impact, funnel, areas, dashboard (month incl.), clients, intakes, SLA, accounting summary (CSR usage, pro bono events) and the B2C case list do not move', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const s = await t.login('admin');
      const strip = (u, b) => {
        const x = JSON.parse(JSON.stringify(b));
        if (u.startsWith('/api/admin/impact')) {
          delete x.to;
          delete x.generated_at;
        }
        if (u.startsWith('/api/admin/analytics/funnel')) {
          delete x.from;
          delete x.to;
        }
        if (u === '/api/admin/dashboard') {
          delete x.pending_decisions; // طابور عمل الفريق: عناصر الشركات تظهر فيه عمدًا (CS-8)
          delete x.capacity; // سعة المحامين تشمل إسنادات الشركات عمدًا
          delete x.user;
        }
        return x;
      };
      const urls = ['/api/admin/impact', '/api/admin/analytics/funnel', '/api/admin/analytics/areas', '/api/admin/analytics/spend', '/api/admin/dashboard', '/api/admin/clients?limit=500', '/api/admin/intakes?limit=500', '/api/admin/sla', '/api/admin/accounting/summary', '/api/admin/cases?line=b2c&limit=500'];
      const snap = async () => {
        const out = {};
        for (const u of urls) {
          const r = await s.get(u);
          assert.equal(r.status, 200, u);
          out[u] = JSON.stringify(strip(u, r.body));
        }
        return out;
      };
      const a = await snap();
      const before = Number(t.app.db.value('SELECT COUNT(*) FROM cases WHERE company_id IS NOT NULL'));
      await seedB2bDemo(t.app, { extra: true });
      const added = Number(t.app.db.value('SELECT COUNT(*) FROM cases WHERE company_id IS NOT NULL')) - before;
      assert.ok(added >= 1, 'the extra company has accepted work');
      assert.ok(t.app.db.get("SELECT 1 FROM billable_events b JOIN cases c ON c.id = b.case_id WHERE c.company_id IS NOT NULL AND b.treatment = 'payable'"), 'paid company work is recorded as payable (guard #26)');
      assert.equal(t.app.db.get("SELECT 1 FROM billable_events b JOIN cases c ON c.id = b.case_id WHERE c.company_id IS NOT NULL AND b.treatment IN ('csr','pro_bono')"), undefined, 'never CSR or pro bono (INV-B12)');
      const b = await snap();
      for (const u of urls) assert.equal(b[u], a[u], `${u} changed after adding B2B data`);
    } finally {
      await t.close();
    }
  });
});

describe('v10 isolation — a beneficiary portal token never reaches company data (review, INV-B2)', () => {
  test('a valid B2C portal link gets 404 for company documents and 401 on the company API; the shadow client never gets a portal link', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      const b2c = db.value('SELECT id FROM clients WHERE company_id IS NULL AND merged_into IS NULL ORDER BY id LIMIT 1');
      const tok = t.app.clients.issuePortalToken(b2c, {});
      assert.ok(tok, 'a B2C portal token');
      assert.equal((await call(t.base, 'GET', `/api/portal/${tok}`)).status, 200, 'the B2C portal link works');
      const companyDocs = db.all('SELECT id FROM documents WHERE company_id IS NOT NULL').map((x) => x.id);
      assert.ok(companyDocs.length > 0);
      for (const d of companyDocs) assert.equal((await call(t.base, 'GET', `/api/portal/${tok}/documents/${d}`)).status, 404, `company document ${d} via a B2C portal link`);
      for (const url of ['/api/company/home', '/api/company/requests', `/api/company/documents/${companyDocs[0]}/download`]) {
        assert.equal((await call(t.base, 'GET', `${url}?token=${tok}`)).status, 401, url);
        assert.equal((await call(t.base, 'GET', url, { cookie: `bm_portal=${tok}; bm_csid=${tok}` })).status, 401, `${url} with the token as a cookie`);
      }
      const shadow = db.value("SELECT client_id FROM companies WHERE prefix = 'NFD'");
      assert.throws(() => t.app.clients.issuePortalToken(shadow, {}), (e) => e.code === 'company_client');
    } finally {
      await t.close();
    }
  });
});
