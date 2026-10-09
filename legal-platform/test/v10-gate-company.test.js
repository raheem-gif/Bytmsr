// v10 integration gate — fixer «company»: regression tests for the gate findings on the company area
// (G7-03, G7-05, G7-06, G-R1, G-R3, G-R4, J-05/C-16, J-09/K8, J-10, J-19/K9/J-22, J-20/K11, K12, C-01…C-15).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { startTestApp, Client, freezeClock, resetClock } from './helpers.js';
import { seedB2bDemo, COMPANY_DEMO_PASSWORD } from '../src/seed-v10-b2b.js';
import { setPublicRoot, preloadClosure } from '../src/site-assets.js';
import { whenText } from '../src/services/company-requests.js';
import { anchorDayOf } from '../src/services/company-memory.js';
import { MEMORY_HIDDEN_TITLE } from '../src/services/company-notify.js';
import * as FIELDS from '../public/assets/js/lib/company-catalog-fields.js';
import * as SLA from '../public/assets/js/lib/company-sla.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');

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
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  }
  async login(email, password = COMPANY_DEMO_PASSWORD) {
    const r = await this.post('/api/company/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  }
}
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body));
  return r.body;
};
async function b2bApp() {
  const t = await startTestApp({ seed: 'none' });
  await seedB2bDemo(t.app);
  t.app.lawyers.createStaff({ role: 'case_manager', username: 'manager', name: 'منى السيد', password: 'Manager@2026' });
  t.company = () => new CompanyClient(t.base);
  t.cu = (email) => t.app.db.get('SELECT * FROM company_users WHERE email = ?', email);
  t.nfd = t.app.db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
  t.tsl = t.app.db.get("SELECT * FROM companies WHERE prefix = 'TSL'");
  return t;
}
/** البيانات التجريبية الكاملة (الذاكرة القانونية ونماذجها) */
async function demoApp() {
  const t = await startTestApp({ seed: 'demo' });
  t.company = () => new CompanyClient(t.base);
  t.cu = (email) => t.app.db.get('SELECT * FROM company_users WHERE email = ?', email);
  t.nfd = t.app.db.get("SELECT * FROM companies WHERE prefix = 'NFD'");
  t.tsl = t.app.db.get("SELECT * FROM companies WHERE prefix = 'TSL'");
  return t;
}

// ───────────────────────── G7-03: أماكن الرفع ─────────────────────────
describe('gate G7-03 — upload slots per user and per company, slow bodies cannot hold a slot', () => {
  let t;
  let reqs;
  before(async () => {
    t = await b2bApp();
    reqs = t.app.companyRequests;
  });
  after(async () => t && t.close());

  test('≤ 2 bodies per user and ≤ 3 per company; other companies keep a slot; the global cap stays 4', () => {
    const hossam = t.cu('hossam@nilefoods.example');
    const dina = t.cu('dina@nilefoods.example');
    const mariam = t.cu('mariam@nilefoods.example');
    const sherif = t.cu('sherif@techsol.example');
    const held = [reqs.acquireUploadSlot({ cu: hossam, company: t.nfd }), reqs.acquireUploadSlot({ cu: hossam, company: t.nfd })];
    assert.throws(() => reqs.acquireUploadSlot({ cu: hossam, company: t.nfd }), (e) => e.status === 429 && e.code === 'busy', 'a third body from the same member');
    held.push(reqs.acquireUploadSlot({ cu: dina, company: t.nfd }));
    assert.throws(() => reqs.acquireUploadSlot({ cu: mariam, company: t.nfd }), (e) => e.code === 'busy', 'a fourth body from the same company');
    held.push(reqs.acquireUploadSlot({ cu: sherif, company: t.tsl }));
    assert.equal(reqs.uploadsInFlight(), 4, 'TechSol still got a slot');
    assert.throws(() => reqs.acquireUploadSlot({ cu: t.cu('omar@techsol.example'), company: t.tsl }), (e) => e.code === 'busy', 'global cap 4');
    held.forEach((r) => r());
    held.forEach((r) => r());
    assert.equal(reqs.uploadsInFlight(), 0, 'release is idempotent');
  });

  test('started uploads count towards an hourly cap even when the body never finishes', () => {
    const omar = t.cu('omar@techsol.example');
    const prev = reqs.uploadLimits.startsPerHour;
    reqs.uploadLimits.startsPerHour = 3;
    try {
      for (let i = 0; i < 3; i++) reqs.acquireUploadSlot({ cu: omar, company: t.tsl })();
      assert.throws(() => reqs.acquireUploadSlot({ cu: omar, company: t.tsl }), (e) => e.status === 429 && e.code === 'rate_limited');
    } finally {
      reqs.uploadLimits.startsPerHour = prev;
    }
    assert.equal(reqs.uploadsInFlight(), 0);
  });

  test('a body that stops sending is cut and its slot freed (no 300 s hold); a normal upload still works', async () => {
    const L = reqs.uploadLimits;
    const saved = { ...L };
    Object.assign(L, { watchEveryMs: 50, idleMs: 300, graceMs: 60000, minBps: 0 });
    try {
      const mariam = t.company();
      await mariam.login('mariam@nilefoods.example');
      const url = new URL(`${t.base}/api/company/uploads`);
      const outcome = await new Promise((resolve) => {
        const req = http.request({ host: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': 6 * 1024 * 1024, cookie: mariam.cookie } }, (res) => {
          res.resume();
          resolve({ status: res.statusCode });
        });
        req.on('error', (e) => resolve({ error: e.code || e.message }));
        req.write('{"file":{"name":"a.pdf","mime":"application/pdf","data_base64":"');
        setTimeout(() => resolve({ timeout: true }), 5000);
      });
      assert.ok(!outcome.timeout, `the stalled body was cut (${JSON.stringify(outcome)})`);
      assert.equal(reqs.uploadsInFlight(), 0, 'slot released');
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
      ok(await mariam.post('/api/company/uploads', { file: { name: 'ok.pdf', mime: 'application/pdf', data_base64: pdf.toString('base64') } }), 201);
      assert.equal(reqs.uploadsInFlight(), 0);
    } finally {
      Object.assign(L, saved);
    }
  });

  test('the route passes the session user and company to the gate', () => {
    const src = stripComments(read('src/routes/company.js'));
    assert.match(src, /acquireUploadSlot\(\{ cu, company, req: ctx\.req \}\)/);
  });
});

// ───────────────────────── G7-05 / G7-06: الحسابات ─────────────────────────
describe('gate G7-05/G7-06 — ended companies with 0 read-only days; reset links after a password change', () => {
  let t;
  before(async () => {
    t = await b2bApp();
  });
  after(async () => {
    resetClock();
    await t?.close();
  });

  test('G7-05: b2b_ended_readonly_days = 0 ends sessions and logins at once (not 90 days)', async () => {
    const admin = await t.login('admin');
    const omar = t.company();
    await omar.login('omar@techsol.example');
    ok(await omar.get('/api/company/home'));
    ok(await admin.put('/api/admin/b2b/settings', { b2b_ended_readonly_days: 0 }));
    t.app.db.run("UPDATE companies SET status = 'ended', ended_at = ? WHERE id = ?", new Date(Date.now() - 60000).toISOString(), t.tsl.id);
    assert.equal((await omar.get('/api/company/home')).status, 401, 'live session ends');
    const again = await t.company().post('/api/company/auth/login', { email: 'omar@techsol.example', password: COMPANY_DEMO_PASSWORD });
    assert.equal(again.status, 403);
    assert.equal(again.body.code, 'company_ended');
    // the default (unset → 90 days) still keeps the read-only window
    ok(await admin.put('/api/admin/b2b/settings', { b2b_ended_readonly_days: 90 }));
    ok(await t.company().post('/api/company/auth/login', { email: 'omar@techsol.example', password: COMPANY_DEMO_PASSWORD }));
    t.app.db.run("UPDATE companies SET status = 'active', ended_at = NULL WHERE id = ?", t.tsl.id);
  });

  test('G7-06 (company): a reset link issued before «تغيير كلمة المرور» is revoked by it', async () => {
    const hossam = t.cu('hossam@nilefoods.example');
    const mariam = t.cu('mariam@nilefoods.example');
    const { token } = t.app.companyAuth.issueToken('reset', hossam.id, { kind: 'company', company_user_id: mariam.id });
    const c = t.company();
    await c.login('hossam@nilefoods.example');
    ok(await c.post('/api/company/me/password', { current_password: COMPANY_DEMO_PASSWORD, password: 'Fresh#Pass2027', password_confirm: 'Fresh#Pass2027' }));
    const link = await t.company().post('/api/company/auth/link', { token });
    assert.notEqual(link.status, 200, 'the old link no longer opens');
    const reset = await t.company().post('/api/company/auth/reset', { token, password: 'Other#Pass2027', password_confirm: 'Other#Pass2027' });
    assert.notEqual(reset.status, 200, 'and cannot set a password');
    ok(await t.company().post('/api/company/auth/login', { email: 'hossam@nilefoods.example', password: 'Fresh#Pass2027' }));
  });

  test('G7-06 (staff accounts.changePassword): the same rule', async () => {
    const adminRow = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    const mgr = t.app.db.get("SELECT * FROM users WHERE username = 'manager'");
    const link = t.app.accounts.issueResetLink(mgr.id, adminRow, { req: { headers: { host: 'x' } }, ip: '127.0.0.1' });
    const token = /#\/reset\/([^/?#]+)/.exec(link.url)[1];
    const m = await t.login('manager');
    ok(await m.post('/api/account/password', { current_password: 'Manager@2026', new_password: 'Strong#Pass2027', new_password_confirm: 'Strong#Pass2027' }));
    const r = await new Client(t.base).post('/api/auth/reset', { token, new_password: 'Other#Pass2028', new_password_confirm: 'Other#Pass2028', password: 'Other#Pass2028', password_confirm: 'Other#Pass2028' });
    assert.notEqual(r.status, 200, 'the staff reset link issued before the change is revoked');
    assert.ok(t.app.db.get("SELECT 1 FROM account_tokens WHERE user_id = ? AND kind = 'reset' AND revoked_at IS NOT NULL", mgr.id));
  });
});

// ───────────────────────── G-R4: انتهاء العرض مع استيضاح مفتوح ─────────────────────────
describe('gate G-R4 — an expired quote with an open clarification keeps the request on the company', () => {
  let t;
  before(async () => {
    t = await b2bApp();
  });
  after(async () => t && t.close());

  test('expireQuotes: awaiting_company / waiting_on info / no confirm deadline (like withdrawQuote)', async () => {
    const mariam = t.company();
    await mariam.login('mariam@nilefoods.example');
    const entity = t.app.db.value('SELECT id FROM company_entities WHERE company_id = ? ORDER BY id LIMIT 1', t.nfd.id);
    const code = ok(await mariam.post('/api/company/requests', { type: 'other', entity_id: entity, description: 'سؤال عن شرط جزائي في عقد توريد قائم', fields: {} }), 201).request.code;
    const row = () => t.app.db.get('SELECT * FROM company_requests WHERE code = ?', code);
    const staff = await t.login('admin');
    ok(await staff.post(`/api/admin/company-requests/${row().id}/clarify`, { rev: row().rev, body: 'نحتاج نسخة العقد الحالي من فضلكم.' }));
    ok(await staff.post(`/api/admin/company-requests/${row().id}/quote`, { rev: row().rev, kind: 'out_of_scope', basis: 'fixed', amount: 5000, scope_of_work: 'مراجعة شاملة لعقد التوريد وإعداد مذكرة.' }), 201);
    assert.equal(row().waiting_on, 'quote');
    t.app.db.run("UPDATE company_quotes SET valid_until = '2000-01-01T00:00:00.000Z' WHERE request_id = ?", row().id);
    assert.equal(t.app.companyRequests.expireQuotes(), 1);
    const r = row();
    assert.equal(r.status, 'awaiting_company');
    assert.equal(r.waiting_on, 'info');
    assert.equal(r.confirm_due_at, null, 'no confirm deadline runs against the firm');
  });
});

// ───────────────────────── K12 / J-19 / K9 / J-22 / C-06 / J-05: نصوص الخادم ─────────────────────────
describe('gate K12, J-19/K9/J-22, C-06, J-05 — server copy and views', () => {
  let t;
  before(async () => {
    t = await demoApp();
  });
  after(async () => t && t.close());

  test('K12a: a renewal notification about an item the user can no longer read shows a neutral title', async () => {
    const hossam = t.cu('hossam@nilefoods.example');
    const hidden = t.app.db.get("SELECT * FROM company_memory WHERE company_id = ? AND access = 'admins' ORDER BY id LIMIT 1", t.nfd.id);
    const open = t.app.db.get("SELECT * FROM company_memory WHERE company_id = ? AND access = 'all' ORDER BY id LIMIT 1", t.nfd.id);
    assert.ok(hidden && open);
    t.app.companyNotify.notify([hossam.id], { companyId: t.nfd.id, type: 'memory.renewal', title: `موعد يقترب: ${hidden.title}`, body: 'تاريخ الانتهاء', link: `#/memory/item/${hidden.id}` });
    t.app.companyNotify.notify([hossam.id], { companyId: t.nfd.id, type: 'memory.renewal', title: `موعد يقترب: ${open.title}`, body: 'تاريخ الانتهاء', link: `#/memory/item/${open.id}` });
    const c = t.company();
    await c.login('hossam@nilefoods.example');
    const items = ok(await c.get('/api/company/notifications')).items.filter((n) => n.type === 'memory.renewal');
    const h = items.find((n) => n.title === MEMORY_HIDDEN_TITLE);
    assert.ok(h, 'neutral title for the admins-only item');
    assert.equal(h.body, null);
    assert.equal(h.link, '#/memory');
    assert.ok(!JSON.stringify(items).includes(hidden.title), 'the admins-only title never reaches a member');
    assert.ok(items.some((n) => n.title.includes(open.title)), 'readable items keep their title');
  });

  test('K12c: the company redactor keeps contract/registry numbers, still hides phones', () => {
    const red = t.app.companyRequests.lawyerRedactor(t.nfd.id);
    assert.equal(red('عقد توريد رقم 2026123456 لسنة 2026'), 'عقد توريد رقم 2026123456 لسنة 2026');
    assert.match(red('اتصلوا على 01012345678'), /\[رقم هاتف\]/);
  });

  test('J-19/K9/J-22: invite e-mail names the brand once and uses a gender-neutral sentence', () => {
    const company = t.nfd;
    const staffMail = t.app.email.render('invite', { name: 'ليلى', company, vars: { until: 'الغد' } }).text;
    const brand = 'Emam Legal and Consultancy';
    const line = staffMail.split('\n').find((l) => l.includes('بوابة'));
    assert.match(line, /^تلقّيتم دعوة من فريقكم القانوني للانضمام إلى بوابة /);
    assert.equal(line.split(brand).length - 1, 1, `brand once in the invite sentence: ${line}`);
    assert.doesNotMatch(staffMail, /دعاكم/);
    const colleague = t.app.email.render('invite', { name: 'ليلى', company, vars: { inviter: 'مريم عادل', until: 'الغد' } }).text;
    assert.match(colleague, /تلقّيتم دعوة من مريم عادل للانضمام/);
    const flows = read('public/assets/js/company/words-flows.js');
    assert.match(flows, /invited: 'تلقّيتم دعوة من \{inviter\} للانضمام إلى بوابة \{company\} لدى \{brand\}\.'/);
    assert.match(flows, /inviter_team: 'فريقكم القانوني'/);
  });

  test('C-06: dates written into company messages follow U10-06 («ص/م», no «مساءً» at noon, year only when not this year)', () => {
    const at = new Date('2026-10-09T08:00:00Z');
    assert.equal(whenText('2026-09-28T09:00:00Z', { at }), 'الاثنين 28 سبتمبر، 12:00 م');
    assert.equal(whenText('2026-10-10T06:47:00Z', { at }), 'السبت 10 أكتوبر، 9:47 ص');
    assert.equal(whenText('2027-01-04T14:30:00Z', { at }), 'الاثنين 4 يناير 2027، 4:30 م');
    assert.doesNotMatch(whenText('2026-10-10T10:30:00Z', { at }), /مساءً|صباحًا/);
  });

  test('J-05/C-16: the memory list carries template_kind; the NDA form offers NDA templates only', async () => {
    const sherif = t.company();
    await sherif.login('sherif@techsol.example');
    const items = ok(await sherif.get('/api/company/memory?kind=contract,licence,template&limit=300')).items;
    const tpl = items.filter((m) => m.kind === 'template');
    assert.ok(tpl.length && tpl.every((m) => 'template_kind' in m));
    assert.ok(!tpl.some((m) => m.template_kind === 'nda'), 'TechSol has no NDA template in the demo');
    const forms = stripComments(read('public/assets/js/lib/company-forms.js'));
    assert.doesNotMatch(forms, /\|\|\s*ts\[0\]/, 'no «first template» fallback');
    assert.match(forms, /template_kind === 'nda'/);
  });
});

// ───────────────────────── G-R3: مرساة التواريخ المتكررة ─────────────────────────
describe('gate G-R3 — recurring legal-memory dates keep their anchor day', () => {
  let t;
  before(async () => {
    t = await b2bApp();
  });
  after(async () => {
    resetClock();
    await t?.close();
  });

  test('addMonthsKey + anchorDayOf: 31 Jan → 28 Feb → 31 Mar; 29 Feb returns in leap years', () => {
    const roll = (start, months, n) => {
      let d = {};
      let k = start;
      const out = [k];
      for (let i = 0; i < n; i++) {
        const a = anchorDayOf(d, k);
        k = FIELDS.addMonthsKey(k, months, a);
        d = { anchor_day: a };
        out.push(k);
      }
      return out;
    };
    assert.deepEqual(roll('2026-01-31', 1, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    assert.deepEqual(roll('2025-08-31', 6, 3), ['2025-08-31', '2026-02-28', '2026-08-31', '2027-02-28']);
    assert.deepEqual(roll('2024-02-29', 12, 4), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    // a date the user typed (not a clamped month end) becomes the new anchor
    assert.equal(anchorDayOf({ anchor_day: 31 }, '2026-03-15'), 15);
    assert.equal(FIELDS.addMonthsKey('2026-01-31', 1), '2026-02-28', 'without an anchor: the old clamping');
  });

  test('the reminders job rolls a monthly key date from 31 Jan through February back to 31 March', () => {
    const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    freezeClock('2026-01-20T08:00:00Z');
    const item = t.app.companyMemory.staffCreate(t.nfd.id, { kind: 'key_date', title: 'إقرار شهري للضرائب', date: '2026-01-31', recurrence: 'monthly' }, admin);
    const id = item.id ?? item.item?.id;
    const row = () => t.app.db.get('SELECT * FROM company_memory WHERE id = ?', id);
    freezeClock('2026-02-02T08:00:00Z');
    t.app.companyMemory.runReminders({ today: '2026-02-02' });
    assert.equal(row().start_date, '2026-02-28');
    freezeClock('2026-03-02T08:00:00Z');
    t.app.companyMemory.runReminders({ today: '2026-03-02' });
    assert.equal(row().start_date, '2026-03-31', 'the 31st is not lost after February');
    resetClock();
  });
});

// ───────────────────────── واجهة البوابة (ثابتة) ─────────────────────────
describe('gate — portal client fixes (static and pure checks)', () => {
  before(() => setPublicRoot(PUB));

  test('G-R1: every copy() key used in the entry closure (main.js + static imports + overview.js) resolves in words.js', async () => {
    const files = new Set([path.join(PUB, 'assets/js/company/main.js'), path.join(PUB, 'assets/js/company/pages/overview.js')]);
    for (const entry of [...files]) for (const u of preloadClosure(entry, PUB)) files.add(path.join(PUB, u.split('?')[0]));
    const { W } = await import('../public/assets/js/company/words.js');
    const lookup = (k) => k.split('.').reduce((v, p) => (v == null ? undefined : v[p]), W);
    let n = 0;
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8');
      for (const m of s.matchAll(/\bcopy(?:Parts)?\(\s*'([a-z_0-9]+\.[a-z_0-9.]+)'/gi)) {
        n++;
        assert.equal(typeof lookup(m[1]), 'string', `${path.relative(PUB, f)}: copy('${m[1]}') does not resolve before the lazy word files load`);
      }
    }
    assert.ok(n > 10);
    const ov = read('public/assets/js/company/pages/overview.js');
    assert.doesNotMatch(ov, /copy\('quote\.valid_until'/);
  });

  test('J-09/K8: boot requests start before the module graph (async classic script); no font preload; splash text uses the system font', () => {
    const html = read('public/company.html');
    assert.match(html, /<script src="\/assets\/js\/lib\/company-boot-early\.js" async fetchpriority="high"><\/script>/);
    assert.ok(html.indexOf('company-boot-early.js') < html.indexOf('app.css'), 'first in the head');
    assert.doesNotMatch(html, /rel="preload"[^>]*plex-arabic/);
    const boot = read('public/assets/js/lib/company-boot-early.js');
    for (const u of ['/api/company/meta', '/api/company/auth/session', '/api/company/home']) assert.ok(boot.includes(`'${u}'`), u);
    assert.doesNotMatch(boot, /^\s*(?:import|export)\b/m, 'a classic script');
    assert.doesNotMatch(boot, /setItem|removeItem/, 'reads the sign-in hint only');
    assert.match(read('public/assets/css/v10-company.css'), /\.boot-splash \{\s*font-family: "Segoe UI", Tahoma, system-ui, sans-serif;/);
  });

  test('J-10: the conversation opens on the newest messages (older behind «عرض الرسائل الأقدم», no inner scroll on phones)', () => {
    const req = read('public/assets/js/company/pages/request.js');
    assert.match(req, /const THREAD_RECENT = 6;/);
    assert.match(req, /list\.scrollTop = list\.scrollHeight/);
    assert.match(read('public/assets/js/company/words-pages.js'), /earlier: 'عرض الرسائل الأقدم \(\{n\}\)'/);
    assert.match(read('public/assets/css/v10-company-pages.css'), /@media \(max-width: 1023px\) \{\s*\.co-thread \{\s*max-height: none;\s*overflow: visible;/);
  });

  test('J-20/K11: entity selects in the dirty check; role sheet stays open on failure; every request uploader knows the 30-file limit', () => {
    assert.match(read('public/assets/js/company/pages/entities.js'), /\[form, rel, parentSel\]\.map\(\(w\) => w\.querySelector\('select'\)\.value\)/);
    const team = stripComments(read('public/assets/js/company/pages/team.js'));
    assert.match(team, /return patchUser\(u, \{ role \}, ctx, T\.saved, \{ errEl: err \}\);/);
    assert.match(team, /return false;\s*\}\s*toast\(okText, 'success'\);\s*ctx\.reload\(\);\s*return true;/);
    const req = stripComments(read('public/assets/js/company/pages/request.js'));
    const calls = [...req.matchAll(/coUploader\(\{(.*?)\}\)/g)];
    assert.ok(calls.length >= 3);
    for (const [, args] of calls) assert.match(args, /perRequestLeft: docsLeft\(view\)/, `coUploader({${args}})`);
  });

  test('J-22/C-05/C-03/C-04/C-15: copy fixes', async () => {
    const all = ['words.js', 'words-flows.js', 'words-pages.js'].map((f) => read(`public/assets/js/company/${f}`)).join('\n');
    for (const bad of ['سأرفقه', 'سنخبر فريقكم القانوني', 'دعاكم', 'الاثنتان', "'عرض {n} أخرى'", 'من زملائكم لم يفعّلوه']) assert.ok(!all.includes(bad), bad);
    assert.ok(!read('public/assets/js/lib/company-catalog.js').includes('الاثنتان'));
    const { W } = await import('../public/assets/js/company/words-pages.js');
    await import('../public/assets/js/company/words-flows.js');
    assert.equal(W.clarification.will_attach, 'سنرفقه');
    assert.match(W.account.mail_important, /تكلفة إضافية$/, 'C-15: a charge, not «مطالبة مالية» (invoices are deferred)');
    assert.equal(W.newRequest.review_send, 'راجعوا {n} قبل الإرسال.');
    assert.equal(W.changesSheet.left_all, 'تبقّت لكم {left} حتى {date}.');
    assert.equal(W.team.tfa_pending_one, 'زميل واحد لم يفعّله بعد.');
    assert.equal(W.team.tfa_pending_two, 'زميلان لم يفعّلاه بعد.');
    assert.match(W.quoteSheet.approve_text_capped, /بحد أقصى \{amount\}/);
    assert.equal(W.quote.approvers_one, 'يوافق على عروض الأسعار مدير البوابة في شركتكم: {names}.');
    const { count } = await import('../public/assets/js/lib/fmt.js');
    assert.equal(`عرض ${count(1, W.units.attn_more)}`, 'عرض عنصر آخر');
    assert.equal(`عرض ${count(2, W.units.attn_more)}`, 'عرض عنصرين آخرين');
    assert.equal(`عرض ${count(3, W.units.attn_more)}`, 'عرض 3 عناصر أخرى');
    assert.equal(count(2, W.units.entity_nom), 'كيانان');
    // C-03: standalone table cells use the nominative («ساعتان», «يوما عمل»); «خلال …» keeps the genitive
    assert.equal(SLA.hoursText(2, { standalone: true }), 'ساعتان');
    assert.equal(SLA.hoursText(2), 'ساعتين');
    const business = SLA.calendars({}).business;
    const len = SLA.dayLength(business);
    assert.equal(SLA.durationText(len * 2, business, { standalone: true }), 'يوما عمل');
    assert.equal(SLA.durationText(len * 2, business), 'يومي عمل');
    // C-15: the read view drops «(بالأشهر)/(بالأيام)»; the cycle ends the day before the next one starts
    assert.match(read('public/assets/js/lib/company-forms.js'), /بالأشهر\|بالأيام/);
    assert.match(read('public/assets/js/company/pages/plan.js'), /to: dayText\(dayBefore\(c\.end\), \{ year: true \}\)/);
  });

  test('C-01/C-02/C-09/C-10: back after sending, desktop breadcrumbs, link titles and focus, attention-row names', () => {
    const nr = read('public/assets/js/company/pages/new-request.js');
    assert.match(nr, /mount\(page\.parentElement, confirmation\(ctx, res\)\);\s*\/\/[^\n]*\n\s*window\.dispatchEvent\(new CustomEvent\('co:back', \{ detail: \{ label: W\.nav\.requests, href: '#\/requests' \} \}\)\);/);
    const shell = read('public/assets/js/company/shell.js');
    assert.match(shell, /h\('nav\.co-crumbs', \{ 'aria-label': W\.nav\.crumbs, hidden: true \}\)/);
    assert.match(shell, /a\.setAttribute\('aria-current', 'page'\)/);
    assert.match(shell, /sideOverview\.setAttribute\('aria-label'/);
    const main = stripComments(read('public/assets/js/company/main.js'));
    const auth = main.slice(main.indexOf('async function renderAuth'), main.indexOf('function showLogin'));
    assert.ok(auth.indexOf('setTitle(title)') < auth.indexOf("import('./pages/link.js')"), 'title set before the link page renders and returns');
    assert.match(read('public/assets/js/company/pages/link.js'), /root\.querySelector\('h1\.co-auth-title'\)\?\.focus/);
    assert.match(read('public/assets/js/company/pages/overview.js'), /btn\.setAttribute\('aria-describedby'/);
  });

  test('C-07/C-08/C-11: touch targets, forced colours and placeholder contrast in v10-company.css', () => {
    const css = read('public/assets/css/v10-company.css');
    assert.match(css, /@media \(pointer: coarse\) \{\s*\.input \{\s*min-height: 48px;/);
    assert.match(css, /\.modal-close \{\s*width: 44px;\s*height: 44px;/);
    assert.match(css, /@media \(forced-colors: active\) \{[\s\S]*?\[aria-pressed="true"\][\s\S]*?outline: 2px solid Highlight;/);
    assert.match(css, /\.co-search input::placeholder,[\s\S]*?color: var\(--gray-500\);/);
  });
});
