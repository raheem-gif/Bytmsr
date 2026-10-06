// Lane A — Security basics (requirement 13): authn/authz, role separation, CSRF, login rate limit,
// password secrecy, WhatsApp webhook verification + HMAC signature, duplicate deliveries, delivery-status webhooks.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, waPayload } from './helpers.js';

const ARABIC = /[؀-ۿ]/;
const WA_SECRET_CFG = { whatsapp: { appSecret: 's3cret', verifyToken: 'verify-me', token: '', phoneNumberId: '', numberDigits: '201000000000' } };

function assertApiError(r, status, code) {
  assert.equal(r.status, status, `expected ${status}, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(typeof r.body, 'object', 'errors must be JSON');
  assert.equal(typeof r.body.error, 'string');
  assert.match(r.body.error, ARABIC, 'error messages are Arabic');
  if (code) assert.equal(r.body.code, code);
}

async function raw(t, method, url, { body, headers = {}, cookie } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  const res = await fetch(t.base + url, { method, headers: h, body, redirect: 'manual' });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body: data, headers: res.headers };
}

function sign(rawBody, secret = 's3cret') {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function createLawyer(admin, username = 'lawyer1') {
  const r = await admin.post('/api/admin/lawyers', {
    username,
    password: 'Lawyer@2026',
    name: 'محامٍ اختبار',
    specialties: ['INH'],
    agreement: { type: 'per_case', rate: 500 },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function createManager(admin, username = 'mgr1') {
  const r = await admin.post('/api/admin/users', { role: 'case_manager', username, name: 'مدير حالات', password: 'Manager@2026' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

function assertNoSecrets(body, label) {
  const s = JSON.stringify(body);
  for (const needle of ['scrypt$', 'password_hash', '"password"', 'Admin@2026', 'Lawyer@2026', 'Manager@2026', 'Secret@2026']) {
    assert.ok(!s.includes(needle), `${label} leaks ${needle}`);
  }
}

describe('Req 13 — authentication and role separation', () => {
  let t;
  let admin;
  let lawyer;
  let manager;
  let lawyerRow;
  let managerRow;
  let intakeId;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    lawyerRow = await createLawyer(admin);
    managerRow = await createManager(admin);
    lawyer = await t.login('lawyer1', 'Lawyer@2026');
    manager = await t.login('mgr1', 'Manager@2026');
    await t.client().post('/webhooks/whatsapp', waPayload({ from: '201012340000', text: 'أريد استشارة في قضية ميراث' }));
    intakeId = (await admin.get('/api/admin/intakes')).body.items[0].id;
  });
  after(async () => {
    await t.close();
  });

  test('unauthenticated API calls get 401 JSON (GET and mutating)', async () => {
    const anon = t.client();
    for (const url of ['/api/admin/dashboard', '/api/admin/intakes', `/api/admin/intakes/${intakeId}`, '/api/admin/clients', '/api/admin/accounting/summary', '/api/lawyer/dashboard', '/api/lawyer/assignments', '/api/auth/me', '/api/notifications', '/api/documents/1/download']) {
      assertApiError(await anon.get(url), 401, 'unauthorized');
    }
    assertApiError(await anon.post('/api/admin/intakes', { channel: 'phone', phone: '01011112222', text: 'x' }), 401, 'unauthorized');
    assertApiError(await anon.post(`/api/admin/intakes/${intakeId}/convert`, { legal_area: 'INH', title: 'x' }), 401);
    assertApiError(await anon.post('/api/admin/automations/run', {}), 401);
    assertApiError(await anon.post('/api/notifications/read-all', {}), 401);
    assert.notEqual((await admin.get(`/api/admin/intakes/${intakeId}`)).body.intake.status, 'converted');
    assert.equal((await admin.get('/api/admin/cases')).body.total, 0);
  });

  test('a lawyer calling /api/admin/* gets 403 and nothing changes', async () => {
    const gets = ['/api/admin/dashboard', '/api/admin/queue', '/api/admin/intakes', `/api/admin/intakes/${intakeId}`, '/api/admin/clients', '/api/admin/cases', '/api/admin/lawyers', '/api/admin/users', '/api/admin/settings', '/api/admin/accounting/summary', '/api/admin/ai/metrics', '/api/admin/outbox', '/api/admin/knowledge', '/api/admin/analytics/funnel'];
    for (const url of gets) assertApiError(await lawyer.get(url), 403, 'forbidden');
    const posts = [
      ['/api/admin/intakes', { channel: 'phone', phone: '01011112222', text: 'محاولة' }],
      [`/api/admin/intakes/${intakeId}/convert`, { legal_area: 'INH', title: 'محاولة' }],
      [`/api/admin/intakes/${intakeId}/reply`, { body: 'رسالة من محامٍ مباشرة للعميل' }],
      [`/api/admin/intakes/${intakeId}/archive`, { reason: 'x' }],
      ['/api/admin/automations/run', {}],
      ['/api/admin/lawyers', { username: 'evil', password: 'Lawyer@2026', name: 'x', specialties: ['INH'], agreement: { type: 'per_case', rate: 1 } }],
      ['/api/admin/users', { role: 'admin', username: 'evil2', name: 'x', password: 'Lawyer@2026' }],
    ];
    for (const [url, body] of posts) assertApiError(await lawyer.post(url, body), 403, 'forbidden');
    assertApiError(await lawyer.patch(`/api/admin/intakes/${intakeId}`, { priority: 'urgent' }), 403);
    assertApiError(await lawyer.patch('/api/admin/settings', { org_name: 'x' }), 403);

    const d = (await admin.get(`/api/admin/intakes/${intakeId}`)).body;
    assert.ok(['new', 'in_review'].includes(d.intake.status));
    assert.equal(d.intake.priority === 'urgent', false);
    assert.equal(d.messages.filter((m) => m.direction === 'out').length, 0);
    assert.equal((await admin.get('/api/admin/cases')).body.total, 0);
    const users = (await admin.get('/api/admin/users')).body;
    assert.ok(!users.some((u) => u.username === 'evil2'));
    const lawyers = (await admin.get('/api/admin/lawyers')).body;
    assert.ok(!lawyers.items.some((l) => l.username === 'evil'));
  });

  test('route sweep: EVERY /api/admin/* route answers 401 to anonymous and 403 to a lawyer; EVERY /api/lawyer/* route answers 401/403 to anonymous/staff', async () => {
    const fill = (p) => p.replace(/:key\b/, 'hearing_reminder').replace(/:\w+/g, '1');
    const routes = t.app.router.routes.map((r) => ({ method: r.method, path: fill(r.pattern) }));
    const adminRoutes = routes.filter((r) => r.path.startsWith('/api/admin/'));
    const lawyerRoutes = routes.filter((r) => r.path.startsWith('/api/lawyer/'));
    assert.ok(adminRoutes.length > 50, `expected many admin routes, found ${adminRoutes.length}`);
    assert.ok(lawyerRoutes.length > 5);
    const anon = t.client();
    const bad = [];
    for (const r of adminRoutes) {
      const body = r.method === 'GET' ? undefined : {};
      const a = await anon.request(r.method, r.path, body);
      if (a.status !== 401) bad.push(`anon ${r.method} ${r.path} -> ${a.status}`);
      const l = await lawyer.request(r.method, r.path, body);
      if (l.status !== 403) bad.push(`lawyer ${r.method} ${r.path} -> ${l.status}`);
    }
    for (const r of lawyerRoutes) {
      const body = r.method === 'GET' ? undefined : {};
      const a = await anon.request(r.method, r.path, body);
      if (a.status !== 401) bad.push(`anon ${r.method} ${r.path} -> ${a.status}`);
      const s = await manager.request(r.method, r.path, body);
      if (s.status !== 403) bad.push(`manager ${r.method} ${r.path} -> ${s.status}`);
    }
    assert.deepEqual(bad, []);
  });

  test('staff cannot use the lawyer portal endpoints (403)', async () => {
    assertApiError(await admin.get('/api/lawyer/dashboard'), 403);
    assertApiError(await manager.get('/api/lawyer/assignments'), 403);
  });

  test('a case manager can triage but gets 403 on admin-only actions (accounting, lawyers, users, settings) with no side effects', async () => {
    assert.equal((await manager.get('/api/admin/intakes')).status, 200);
    assert.equal((await manager.get('/api/admin/lawyers')).status, 200);
    assert.equal((await manager.get(`/api/admin/intakes/${intakeId}`)).status, 200);

    const denied = [
      ['GET', '/api/admin/accounting/summary'],
      ['GET', '/api/admin/accounting/ledger'],
      ['POST', '/api/admin/accounting/close-month', { period: '2026-01' }],
      ['POST', '/api/admin/accounting/payouts', { lawyer_id: lawyerRow.id, amount: 100 }],
      ['POST', '/api/admin/accounting/adjustments', { lawyer_id: lawyerRow.id, amount: 1000, note: 'مكافأة' }],
      ['POST', '/api/admin/lawyers', { username: 'mgrmade', password: 'Lawyer@2026', name: 'x', specialties: ['INH'], agreement: { type: 'per_case', rate: 1 } }],
      ['PATCH', `/api/admin/lawyers/${lawyerRow.id}`, { capacity: 99 }],
      ['POST', `/api/admin/lawyers/${lawyerRow.id}/password`, { password: 'Hacked@2026' }],
      ['POST', `/api/admin/lawyers/${lawyerRow.id}/package`, { size: 10, price: 1000 }],
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users', { role: 'admin', username: 'mgrboss', name: 'x', password: 'Manager@2026' }],
      ['PATCH', `/api/admin/users/${managerRow.id}`, { role: 'admin' }],
      ['GET', '/api/admin/settings'],
      ['PATCH', '/api/admin/settings', { org_name: 'مؤسسة أخرى' }],
      ['PATCH', '/api/admin/automations/hearing_reminder', { enabled: false }],
      ['GET', '/api/admin/knowledge/export'],
      ['POST', '/api/admin/matters/1/lawyer-fees', { lawyer_id: lawyerRow.id, amount: 5000, note: 'أتعاب' }],
    ];
    for (const [method, url, body] of denied) {
      const r = await manager.request(method, url, body);
      assertApiError(r, 403, 'forbidden');
    }
    // no side effects
    const users = (await admin.get('/api/admin/users')).body;
    assert.equal(users.find((u) => u.username === 'mgr1').role, 'case_manager', 'case manager must not escalate to admin');
    assert.ok(!users.some((u) => u.username === 'mgrboss'));
    const lw = (await admin.get(`/api/admin/lawyers/${lawyerRow.id}`)).body.lawyer;
    assert.equal(lw.capacity, 10);
    assert.equal((await admin.get('/api/admin/settings')).body.settings.org_name, 'بيوت مصر');
    const rules = (await admin.get('/api/admin/automations')).body.rules;
    assert.ok(JSON.stringify(rules).length > 0);
    assert.equal((await t.client().post('/api/auth/login', { username: 'lawyer1', password: 'Lawyer@2026' })).status, 200, 'lawyer password unchanged');
    const ledger = (await admin.get('/api/admin/accounting/ledger')).body;
    assert.equal((Array.isArray(ledger) ? ledger : ledger.items).length, 0, 'no ledger entries may be created by a case manager');
  });

  test('passwords and hashes are never returned by any user-facing endpoint', async () => {
    const login = await t.client().post('/api/auth/login', { username: 'lawyer1', password: 'Lawyer@2026' });
    assertNoSecrets(login.body, 'login');
    assertNoSecrets((await lawyer.get('/api/auth/me')).body, 'me');
    assertNoSecrets((await lawyer.get('/api/lawyer/dashboard')).body, 'lawyer dashboard');
    assertNoSecrets((await admin.get('/api/admin/users')).body, 'users');
    assertNoSecrets((await admin.get('/api/admin/staff')).body, 'staff');
    assertNoSecrets((await admin.get('/api/admin/lawyers')).body, 'lawyers');
    assertNoSecrets((await admin.get(`/api/admin/lawyers/${lawyerRow.id}`)).body, 'lawyer detail');
    assertNoSecrets((await admin.patch(`/api/admin/lawyers/${lawyerRow.id}`, { notes: 'ملاحظة' })).body, 'lawyer update');
    const created = await admin.post('/api/admin/lawyers', { username: 'lawyer2', password: 'Secret@2026', name: 'محامٍ ثانٍ', specialties: ['FAM'], agreement: { type: 'pro_bono' } });
    assert.equal(created.status, 201);
    assertNoSecrets(created.body, 'lawyer create');
    const staff = await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr2', name: 'مدير ٢', password: 'Secret@2026' });
    assert.equal(staff.status, 201);
    assertNoSecrets(staff.body, 'user create');
    assertNoSecrets((await admin.patch(`/api/admin/users/${staff.body.id}`, { password: 'Secret@2026', name: 'مدير 2' })).body, 'user update');
    assertNoSecrets((await admin.post(`/api/admin/lawyers/${created.body.id}/password`, { password: 'Secret@2026' })).body, 'set password');
    assertNoSecrets((await t.client().get('/api/meta')).body, 'meta (production mode)');
    assertNoSecrets((await admin.get('/api/admin/dashboard')).body, 'dashboard');
  });

  test('session cookie is HttpOnly + SameSite; logout invalidates the session', async () => {
    const c = t.client();
    const res = await fetch(t.base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@2026' }) });
    const cookie = res.headers.get('set-cookie');
    assert.ok(cookie, 'login must set a session cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=(Lax|Strict)/i);
    c.cookie = /bm_sid=[^;]+/.exec(cookie)[0];
    assert.equal((await c.get('/api/auth/me')).status, 200);
    assert.equal((await c.post('/api/auth/logout', {})).status, 200);
    const sid = /bm_sid=[^;]+/.exec(cookie)[0];
    const stale = await raw(t, 'GET', '/api/auth/me', { cookie: sid });
    assert.equal(stale.status, 401, 'a logged-out session token must no longer work');
  });

  test('deactivated users lose access immediately', async () => {
    const u = await createManager(admin, 'mgr_off');
    const c = await t.login('mgr_off', 'Manager@2026');
    assert.equal((await c.get('/api/admin/intakes')).status, 200);
    const off = await admin.patch(`/api/admin/users/${u.id}`, { active: false });
    assert.equal(off.status, 200);
    assertApiError(await c.get('/api/admin/intakes'), 401);
    const relogin = await t.client().post('/api/auth/login', { username: 'mgr_off', password: 'Manager@2026' });
    assert.ok([401, 403].includes(relogin.status));
  });
});

describe('Req 13 — CSRF protections on mutating API calls', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    await t.close();
  });

  const body = JSON.stringify({ channel: 'phone', phone: '01011112222', text: 'طلب عبر نموذج خارجي' });

  test('mutating calls without application/json are rejected with 415 and have no effect', async () => {
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
      const headers = ct ? { 'content-type': ct } : {};
      const r = await raw(t, 'POST', '/api/admin/intakes', { body, headers, cookie: admin.cookie });
      assertApiError(r, 415, 'unsupported_media_type');
    }
    const login = await raw(t, 'POST', '/api/auth/login', { body: JSON.stringify({ username: 'admin', password: 'Admin@2026' }), headers: { 'content-type': 'text/plain' } });
    assertApiError(login, 415);
    const pub = await raw(t, 'POST', '/api/public/intake', {
      body: 'name=x&phone=01011112222&description=aaaaaaaaaaaaaaaaaaaaaaaaaaaa&consent=true',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    assertApiError(pub, 415);
    const patch = await raw(t, 'PATCH', '/api/admin/settings', { body: JSON.stringify({ org_name: 'x' }), headers: { 'content-type': 'text/plain' }, cookie: admin.cookie });
    assertApiError(patch, 415);
    assert.equal((await admin.get('/api/admin/intakes?scope=all')).body.total, 0);
    assert.equal((await admin.get('/api/admin/settings')).body.settings.org_name, 'بيوت مصر');
  });

  test('cross-origin Origin header is rejected with 403 (login, admin mutation, public intake); same origin is accepted', async () => {
    const evil = { 'content-type': 'application/json', origin: 'https://evil.example' };
    assertApiError(await raw(t, 'POST', '/api/admin/intakes', { body, headers: evil, cookie: admin.cookie }), 403, 'forbidden');
    assertApiError(await raw(t, 'POST', '/api/auth/login', { body: JSON.stringify({ username: 'admin', password: 'Admin@2026' }), headers: evil }), 403);
    assertApiError(
      await raw(t, 'POST', '/api/public/intake', { body: JSON.stringify({ name: 'x', phone: '01011112222', description: 'وصف طويل بما يكفي لاجتياز التحقق من الطول', consent: true }), headers: evil }),
      403,
    );
    assertApiError(await raw(t, 'POST', '/api/admin/intakes', { body, headers: { ...evil, origin: `http://127.0.0.1.evil.example:${new URL(t.base).port}` }, cookie: admin.cookie }), 403);
    assert.equal((await admin.get('/api/admin/intakes?scope=all')).body.total, 0, 'rejected requests must not create intakes');

    const same = await raw(t, 'POST', '/api/admin/intakes', { body, headers: { 'content-type': 'application/json', origin: t.base }, cookie: admin.cookie });
    assert.equal(same.status, 201, JSON.stringify(same.body));
  });

  test('an opaque "null" Origin (sandboxed iframe / data: URL) is treated as cross-origin', async () => {
    const r = await raw(t, 'POST', '/api/admin/intakes', {
      body: JSON.stringify({ channel: 'phone', phone: '01011113333', text: 'طلب من إطار معزول' }),
      headers: { 'content-type': 'application/json', origin: 'null' },
      cookie: admin.cookie,
    });
    assert.equal(r.status, 403, `Origin: null must be rejected, got ${r.status}`);
  });
});

describe('Req 13 — login rate limiting and enumeration resistance', () => {
  test('repeated failed logins are rate-limited (429), even for the right password afterwards; other accounts unaffected', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await createManager(admin, 'victim');
      const c = t.client();
      const unknown = await c.post('/api/auth/login', { username: 'nobody', password: 'whatever1' });
      const wrong = await c.post('/api/auth/login', { username: 'victim', password: 'wrong-pass' });
      assertApiError(unknown, 401);
      assertApiError(wrong, 401);
      assert.equal(unknown.body.error, wrong.body.error, 'unknown user and wrong password must be indistinguishable');

      let limitedAt = null;
      for (let i = 2; i <= 15; i++) {
        const r = await c.post('/api/auth/login', { username: 'victim', password: `wrong-${i}` });
        if (r.status === 429) {
          limitedAt = i;
          assertApiError(r, 429, 'rate_limited');
          break;
        }
        assert.equal(r.status, 401);
      }
      assert.ok(limitedAt !== null, 'login must be rate-limited after repeated failures');
      const right = await c.post('/api/auth/login', { username: 'victim', password: 'Manager@2026' });
      assert.equal(right.status, 429, 'while limited, even the right password is refused');
      assert.equal(right.headers.get('set-cookie'), null);
      assert.equal((await t.client().post('/api/auth/login', { username: 'admin', password: 'Admin@2026' })).status, 200, 'other accounts keep working');
    } finally {
      await t.close();
    }
  });
});

describe('Req 13 — WhatsApp webhook verification and signatures', () => {
  test('GET verification echoes hub.challenge only for the right verify token', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const ok = await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444');
      assert.equal(ok.status, 200);
      assert.equal(ok.body, '1158201444');
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status, 403);
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.verify_token=verify-me&hub.challenge=1')).status, 403);
      assert.equal((await raw(t, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=1')).status, 403);
    } finally {
      await t.close();
    }
    const t2 = await startTestApp({ seed: 'none', config: { whatsapp: { appSecret: '', verifyToken: '', token: '', phoneNumberId: '', numberDigits: '' } } });
    try {
      assert.equal((await raw(t2, 'GET', '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=&hub.challenge=1')).status, 403, 'an unset verify token must never verify');
    } finally {
      await t2.close();
    }
  });

  test('with an app secret configured, POST requires a valid X-Hub-Signature-256 over the raw body', async () => {
    const t = await startTestApp({ seed: 'none', config: WA_SECRET_CFG });
    try {
      const admin = await t.login('admin');
      const count = async () => (await admin.get('/api/admin/intakes?scope=all')).body.total;
      const post = (rawBody, sig) => raw(t, 'POST', '/webhooks/whatsapp', { body: rawBody, headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) } });

      const body1 = JSON.stringify(waPayload({ from: '201011100001', text: 'رسالة بدون توقيع' }));
      assert.equal((await post(body1)).status, 403, 'missing signature');
      assert.equal((await post(body1, sign(body1, 'other-secret'))).status, 403, 'wrong secret');
      assert.equal((await post(body1, 'sha1=' + crypto.createHmac('sha1', 's3cret').update(body1).digest('hex'))).status, 403, 'sha1 is not accepted');
      const tampered = body1.replace('رسالة بدون توقيع', 'رسالة معدلة بعد التوقيع');
      assert.equal((await post(tampered, sign(body1))).status, 403, 'body modified after signing');
      assert.equal(await count(), 0, 'rejected deliveries must not create intakes');

      // exact raw bytes (pretty-printed with Arabic) are what is signed
      const pretty = JSON.stringify(waPayload({ from: '201011100002', text: 'رسالة موقعة صحيحة' }), null, 2);
      const good = await post(pretty, sign(pretty));
      assert.equal(good.status, 200, JSON.stringify(good.body));
      assert.equal(await count(), 1);
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      assert.equal(it.last_message, 'رسالة موقعة صحيحة');
    } finally {
      await t.close();
    }
  });

  test('a malformed signature header (non-hex of the right length) is rejected with 403, not a server error', async () => {
    const t = await startTestApp({ seed: 'none', config: WA_SECRET_CFG });
    try {
      const body = JSON.stringify(waPayload({ from: '201011100003', text: 'توقيع تالف' }));
      const r = await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + 'z'.repeat(64) } });
      assert.equal(r.status, 403, `got ${r.status} ${JSON.stringify(r.body)}`);
      const r2 = await raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + 'ab'.repeat(31) + 'g0' } });
      assert.equal(r2.status, 403, `got ${r2.status}`);
    } finally {
      await t.close();
    }
  });

  test('without an app secret, unsigned deliveries are accepted (verification is enforced only when configured)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const r = await raw(t, 'POST', '/webhooks/whatsapp', { body: JSON.stringify(waPayload({ from: '201011100004', text: 'مرحبا' })), headers: { 'content-type': 'application/json' } });
      assert.equal(r.status, 200);
    } finally {
      await t.close();
    }
  });
});

describe('Req 13 — duplicate deliveries and delivery-status webhooks', () => {
  test('the same WhatsApp message id delivered several times (incl. inside a batch) creates exactly one message', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const p = waPayload({ from: '201022200001', id: 'wamid.DUP.1', text: 'رسالة أولى' });
      for (let i = 0; i < 3; i++) {
        const r = await t.client().post('/webhooks/whatsapp', p);
        assert.equal(r.status, 200, 'duplicates must still be acknowledged with 200 so Meta stops retrying');
      }
      // Meta retry of a batch: the old message + a new one
      const batch = waPayload({ from: '201022200001', id: 'wamid.DUP.1', text: 'رسالة أولى' });
      batch.entry[0].changes[0].value.messages.push({ from: '201022200001', id: 'wamid.DUP.2', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'رسالة ثانية' } });
      assert.equal((await t.client().post('/webhooks/whatsapp', batch)).status, 200);
      assert.equal((await t.client().post('/webhooks/whatsapp', batch)).status, 200);

      const list = (await admin.get('/api/admin/intakes?scope=all')).body;
      assert.equal(list.total, 1, 'duplicates must not create extra intakes');
      const d = (await admin.get(`/api/admin/intakes/${list.items[0].id}`)).body;
      assert.deepEqual(d.messages.map((m) => m.body), ['رسالة أولى', 'رسالة ثانية']);
    } finally {
      await t.close();
    }
  });

  test('a redelivered message after conversion does not reappear in the case or create a new intake', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const p = waPayload({ from: '201022200002', id: 'wamid.DUP.X', text: 'مشكلة ميراث وأخي يرفض القسمة' });
      await t.client().post('/webhooks/whatsapp', p);
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      const c = (await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'INH', title: 'قسمة' })).body.case;
      await t.client().post('/webhooks/whatsapp', p);
      assert.equal((await admin.get('/api/admin/intakes')).body.total, 0);
      const cd = (await admin.get(`/api/admin/cases/${c.id}`)).body;
      assert.equal(cd.messages.filter((m) => m.direction === 'in').length, 1);
    } finally {
      await t.close();
    }
  });

  test('with WhatsApp configured, outbound messages are sent via the Graph API and status webhooks move them forward (never backwards)', async () => {
    const realFetch = globalThis.fetch;
    const graphCalls = [];
    let nextResponse = () => ({ status: 200, body: { messaging_product: 'whatsapp', messages: [{ id: `wamid.OUT.${graphCalls.length}` }] } });
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://graph.facebook.com/')) {
        graphCalls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : null });
        const r = nextResponse();
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url, init);
    };
    const t = await startTestApp({ seed: 'none', config: { whatsapp: { token: 'test-token', phoneNumberId: '1234567890', verifyToken: 'verify-me', appSecret: 's3cret', numberDigits: '201000000000' } } });
    // with a real token configured, unsigned deliveries are refused, so every webhook here is signed
    const signedPost = (payload) => {
      const body = JSON.stringify(payload);
      return raw(t, 'POST', '/webhooks/whatsapp', { body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(body) } });
    };
    try {
      const admin = await t.login('admin');
      const unsigned = await t.client().post('/webhooks/whatsapp', waPayload({ from: '201022200009', text: 'بدون توقيع' }));
      assert.equal(unsigned.status, 403, 'configured WhatsApp without a valid signature must be refused');
      await signedPost(waPayload({ from: '201022200003', text: 'محتاج مساعدة في قضية نفقة' }));
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      assert.equal((await admin.get('/api/admin/automations')).body.whatsapp_configured, true);

      const reply = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'أهلًا بك، برجاء إرسال صورة الحكم.' });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));
      assert.equal(reply.body.channel, 'whatsapp');
      assert.notEqual(reply.body.status, 'simulated', 'configured WhatsApp must not be simulated');
      const outRow = async () => (await admin.get('/api/admin/outbox')).body.find((m) => m.id === reply.body.id);
      const deadline = Date.now() + 3000;
      let row = await outRow();
      while (row.status === 'queued' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
        row = await outRow();
      }
      assert.equal(row.status, 'sent');
      assert.equal(graphCalls.length, 1);
      assert.match(graphCalls[0].url, /\/1234567890\/messages$/);
      assert.equal(graphCalls[0].init.headers.Authorization, 'Bearer test-token');
      assert.equal(graphCalls[0].body.to, '201022200003');
      assert.equal(graphCalls[0].body.type, 'text', 'inside the 24h window a session text message is sent');
      const wamid = row.external_id;
      assert.ok(wamid);

      const status = (s, extra = {}) => ({
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1234567890' }, statuses: [{ id: wamid, status: s, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '201022200003', ...extra }] } }] }],
      });
      assert.equal((await signedPost(status('delivered'))).status, 200);
      assert.equal((await outRow()).status, 'delivered');
      await signedPost(status('read'));
      assert.equal((await outRow()).status, 'read');
      await signedPost(status('delivered'));
      assert.equal((await outRow()).status, 'read', 'a late "delivered" must not move a read message backwards');
      // unknown message id is ignored gracefully
      const unknown = status('read');
      unknown.entry[0].changes[0].value.statuses[0].id = 'wamid.UNKNOWN';
      assert.equal((await signedPost(unknown)).status, 200);

      // a failed send is recorded and staff are alerted; retry re-sends
      nextResponse = () => ({ status: 400, body: { error: { message: 'Recipient phone number not in allowed list', code: 131030 } } });
      const failing = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'رسالة ستفشل' });
      let frow;
      const d2 = Date.now() + 3000;
      do {
        await new Promise((r) => setTimeout(r, 25));
        frow = (await admin.get('/api/admin/outbox')).body.find((m) => m.id === failing.body.id);
      } while (frow.status === 'queued' && Date.now() < d2);
      assert.equal(frow.status, 'failed');
      assert.ok(frow.error && frow.error.length > 0);
      const notes = (await admin.get('/api/notifications')).body.items;
      assert.ok(notes.some((n) => n.type === 'message.failed'), 'staff must be alerted on a failed WhatsApp send');
      nextResponse = () => ({ status: 200, body: { messages: [{ id: 'wamid.RETRY.1' }] } });
      const retry = await admin.post(`/api/admin/messages/${failing.body.id}/retry`, {});
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      const d3 = Date.now() + 3000;
      do {
        await new Promise((r) => setTimeout(r, 25));
        frow = (await admin.get('/api/admin/outbox')).body.find((m) => m.id === failing.body.id);
      } while (frow.status !== 'sent' && Date.now() < d3);
      assert.equal(frow.status, 'sent');
      assert.equal(frow.external_id, 'wamid.RETRY.1');

      // failed status from Meta after sending
      const failStatus = status('failed', { errors: [{ code: 131047, title: 'Re-engagement message' }] });
      failStatus.entry[0].changes[0].value.statuses[0].id = 'wamid.RETRY.1';
      await signedPost(failStatus);
      frow = (await admin.get('/api/admin/outbox')).body.find((m) => m.id === failing.body.id);
      assert.equal(frow.status, 'failed');
      assert.match(frow.error, /131047/);
    } finally {
      globalThis.fetch = realFetch;
      await t.close();
    }
  });
});

describe('Misc hardening', () => {
  test('API responses carry security headers and unknown API routes return JSON 404', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const r = await raw(t, 'GET', '/api/meta');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.ok(r.headers.get('content-security-policy'));
      const nf = await raw(t, 'GET', '/api/does-not-exist');
      assertApiError(nf, 404);
      const bad = await raw(t, 'POST', '/api/auth/login', { body: '{not json', headers: { 'content-type': 'application/json' } });
      assertApiError(bad, 400);
      const arr = await raw(t, 'POST', '/api/auth/login', { body: '[1,2]', headers: { 'content-type': 'application/json' } });
      assertApiError(arr, 400);
    } finally {
      await t.close();
    }
  });
});
