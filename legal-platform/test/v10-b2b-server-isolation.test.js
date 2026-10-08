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
