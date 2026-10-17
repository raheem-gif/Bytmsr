// v12 integration gate (L12-92, §13.1 steps 4–5): schema forward and rollback on an 11.0-shaped database, the §2.1 role ×
// route matrix for the new and changed endpoints, and lawyer / company GET marker scans. Added by the gate fixer-server (R-07):
// the forward/rollback checks had only been run by hand (scratchpad/v12-gate-regression/mig/).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { startTestApp } from './helpers.js';
import { Db } from '../src/db.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_D = path.join(ROOT, 'src/schema.d');
const V12_FILES = (f) => /^(?:87|88|89)-/.test(f);

/** ما أضافه 12.0 إلى المخطط: الجداول والفهارس والمشغّلات من ملفات 87–89، والأعمدة من *.columns.json */
function v12Additions() {
  const files = fs.readdirSync(SCHEMA_D).filter(V12_FILES);
  const sql = files.filter((f) => f.endsWith('.sql')).map((f) => fs.readFileSync(path.join(SCHEMA_D, f), 'utf8')).join('\n');
  const objects = (kind) => [...sql.matchAll(new RegExp(`CREATE\\s+(?:VIRTUAL\\s+)?${kind}\\s+IF\\s+NOT\\s+EXISTS\\s+([A-Za-z_][\\w]*)`, 'gi'))].map((m) => m[1]);
  const columns = files.filter((f) => f.endsWith('.columns.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(SCHEMA_D, f), 'utf8')));
  return { tables: objects('TABLE'), indexes: objects('INDEX'), triggers: objects('TRIGGER'), columns };
}

/** مخطط 11.0 كما يطبّقه Db في 11.0: schema.sql + ترحيلات الأعمدة + schema.d بلا ملفات 87–89 */
function apply110Schema(raw) {
  raw.exec(fs.readFileSync(path.join(ROOT, 'src/schema.sql'), 'utf8'));
  const files = fs.readdirSync(SCHEMA_D).sort().filter((f) => !V12_FILES(f));
  const cols = files.filter((f) => f.endsWith('.columns.json')).flatMap((f) => JSON.parse(fs.readFileSync(path.join(SCHEMA_D, f), 'utf8')));
  for (const [table, column, ddl] of cols) {
    const have = raw.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
    if (!have.includes(column)) raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
  for (const f of files.filter((x) => x.endsWith('.sql'))) raw.exec(fs.readFileSync(path.join(SCHEMA_D, f), 'utf8'));
}

const tablesOf = (raw) => raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name").all().map((r) => r.name).filter((n) => !/_fts(?:_|$)/.test(n));
const colsOf = (raw, t) => raw.prepare(`PRAGMA table_info(${t})`).all().map((r) => r.name);
/** بصمة صفوف جدول بأعمدة بعينها (ترتيب rowid) */
function hashRows(raw, table, cols) {
  const h = crypto.createHash('sha256');
  const list = cols.map((c) => `"${c}"`).join(', ');
  for (const r of raw.prepare(`SELECT ${list} FROM "${table}" ORDER BY rowid`).all()) h.update(JSON.stringify(cols.map((c) => (r[c] instanceof Uint8Array ? Buffer.from(r[c]).toString('base64') : r[c]))));
  return h.digest('hex');
}

describe('v12 gate — schema forward and rollback on an 11.0-shaped database (R-07, §13.1 step 4)', () => {
  let dir;
  let file;
  let baseline;
  let old;
  before(async () => {
    // قاعدة بيانات عرض 12.0 كاملة، ثم تُعاد إلى شكل 11.0 بحذف ما أضافته ملفات 87–89 (بيانات واقعية في الجداول القديمة)
    const t = await startTestApp({ seed: 'demo' });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-schema-'));
    file = path.join(dir, 'v110.db');
    try {
      t.app.db.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      t.app.db.raw.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    } finally {
      await t.close();
    }
    const raw = new DatabaseSync(file);
    const add = v12Additions();
    raw.exec('PRAGMA foreign_keys = OFF');
    for (const tr of add.triggers) raw.exec(`DROP TRIGGER IF EXISTS ${tr}`);
    for (const ix of add.indexes) raw.exec(`DROP INDEX IF EXISTS ${ix}`);
    for (const tb of [...add.tables].reverse()) raw.exec(`DROP TABLE IF EXISTS ${tb}`);
    for (const [table, column] of add.columns) if (colsOf(raw, table).includes(column)) raw.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    apply110Schema(raw); // يجب ألا يعيد أي شيء من 12.0
    for (const tb of add.tables) assert.ok(!tablesOf(raw).includes(tb), `${tb} gone from the 11.0 copy`);
    old = Object.fromEntries(tablesOf(raw).map((tb) => [tb, colsOf(raw, tb)]));
    baseline = Object.fromEntries(Object.entries(old).map(([tb, cols]) => [tb, hashRows(raw, tb, cols)]));
    assert.ok(Number(raw.prepare('SELECT COUNT(*) AS n FROM intakes').get().n) > 10, 'demo rows in the 11.0 copy');
    raw.close();
  });
  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  test('opened twice by 12.0: every new table and column present, old rows byte-identical, new columns NULL, FK and integrity clean', () => {
    const add = v12Additions();
    for (let round = 1; round <= 2; round++) {
      const db = new Db(file);
      try {
        const raw = db.raw;
        for (const tb of add.tables) assert.ok(tablesOf(raw).includes(tb) || raw.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(tb), `round ${round}: ${tb}`);
        for (const [table, column] of add.columns) {
          assert.ok(colsOf(raw, table).includes(column), `round ${round}: ${table}.${column}`);
          assert.equal(Number(raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} IS NOT NULL`).get().n), 0, `round ${round}: ${table}.${column} stays NULL on old rows`);
        }
        for (const [tb, cols] of Object.entries(old)) assert.equal(hashRows(raw, tb, cols), baseline[tb], `round ${round}: ${tb} rows unchanged`);
        assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), [], `round ${round}: foreign keys`);
        assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      } finally {
        db.close();
      }
    }
  });

  test('rollback: the 11.0 schema applies cleanly on the migrated database and the 11.0 reads still work', () => {
    const copy = path.join(dir, 'rollback.db');
    fs.copyFileSync(file, copy);
    const raw = new DatabaseSync(copy);
    try {
      raw.exec('PRAGMA foreign_keys = ON');
      apply110Schema(raw); // 11.0 يبدأ على قاعدة 12.0: CREATE IF NOT EXISTS وALTER المشروط فقط
      // قراءات 11.0 الأساسية (قائمة الطلبات، تفاصيل طلب، تنزيل مستند: صف المستند ومساره المخزّن)
      const intake = raw.prepare("SELECT i.*, c.name AS client_name FROM intakes i LEFT JOIN clients c ON c.id = i.client_id ORDER BY i.id DESC LIMIT 1").get();
      assert.ok(intake && intake.code);
      const list = raw.prepare("SELECT id, code, status, segment, priority FROM intakes WHERE status IN ('new','in_review','awaiting_client') ORDER BY id DESC LIMIT 50").all();
      assert.ok(list.length > 0);
      const doc = raw.prepare('SELECT id, storage_key, mime, size, sha256 FROM documents ORDER BY id LIMIT 1').get();
      assert.ok(doc && doc.storage_key && doc.sha256, 'documents keep their 11.0 main file (the clean copy of a scanned upload)');
      assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(raw.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally {
      raw.close();
    }
  });
});

describe('v12 gate — §2.1 role × route matrix and lawyer / company marker scans (§13.1 step 5)', () => {
  let t;
  let admin;
  let manager;
  let lawyer;
  let company;
  let anon;
  let docId;
  let intakeId;
  let clientId;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    manager = await t.login('manager');
    lawyer = await t.login('ahmed');
    anon = t.client();
    // جلسة بوابة شركات (كعكة bm_csid)
    let cookie = '';
    const req = async (method, url, body) => {
      const h = cookie ? { cookie } : {};
      if (method !== 'GET') h['content-type'] = 'application/json';
      const res = await fetch(t.base + url, { method, headers: h, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body), redirect: 'manual' });
      const m = /bm_csid=([^;]*)/.exec(res.headers.get('set-cookie') || '');
      if (m) cookie = m[1] ? `bm_csid=${m[1]}` : '';
      const ct = res.headers.get('content-type') || '';
      return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
    };
    company = { get: (u) => req('GET', u), post: (u, b) => req('POST', u, b), put: (u, b) => req('PUT', u, b), patch: (u, b) => req('PATCH', u, b), delete: (u) => req('DELETE', u) };
    const r = await company.post('/api/company/auth/login', { email: 'mariam@nilefoods.example', password: 'Company@2026' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    docId = t.app.db.value("SELECT id FROM documents WHERE company_id IS NULL AND mime LIKE 'image/%' ORDER BY id LIMIT 1");
    intakeId = t.app.db.value("SELECT id FROM intakes WHERE segment = 'paid' ORDER BY id DESC LIMIT 1");
    clientId = t.app.db.value('SELECT client_id FROM intakes WHERE id = ?', intakeId);
  });
  after(async () => {
    await t?.close();
  });

  const call = (who, method, url, body) => (method === 'DELETE' ? (who.del || who.delete).call(who, url, body) : who[method.toLowerCase()](url, body));

  test('anonymous → 401, company session → 401, lawyer → 403, case manager per guard (S ok / A 403), admin ok', async () => {
    // [method, url, guard, body]
    const routes = [
      ['GET', '/api/admin/intakes?line=litigation', 'S'],
      ['GET', `/api/admin/intakes/${intakeId}`, 'S'],
      ['PUT', `/api/admin/intakes/${intakeId}/pathway`, 'S', { path: 'litigation/defend/family', reason: 'مراجعة' }],
      ['DELETE', `/api/admin/clients/${clientId}/auto-opt-out`, 'S'],
      ['GET', '/api/admin/analytics/entry-tree', 'S'],
      ['GET', '/api/admin/analytics/funnel?line=consultation', 'S'],
      ['PATCH', '/api/admin/settings', 'A', { wa_lines_menu_enabled: false }],
      ['GET', `/api/admin/documents/${docId}/text`, 'S'],
      ['PUT', `/api/admin/documents/${docId}/display`, 'S', { show: 'original' }],
      ['GET', '/api/admin/media/status', 'A'],
      ['GET', '/api/admin/search?q=عقد', 'S'],
      ['GET', '/api/admin/tags?q=S-14', 'S'],
    ];
    for (const [method, url, guard, body] of routes) {
      const a = await call(anon, method, url, body);
      assert.equal(a.status, 401, `anonymous ${method} ${url}`);
      const c = await call(company, method, url, body);
      assert.equal(c.status, 401, `company session ${method} ${url}`);
      const l = await call(lawyer, method, url, body);
      assert.equal(l.status, 403, `lawyer ${method} ${url}`);
      const m = await call(manager, method, url, body);
      if (guard === 'A') assert.equal(m.status, 403, `case manager ${method} ${url}`);
      else assert.ok(m.status < 400 || m.status === 404 || m.status === 409 || m.status === 400, `case manager ${method} ${url}: ${m.status} ${JSON.stringify(m.body).slice(0, 160)}`);
      const ad = await call(admin, method, url, body);
      assert.ok(ad.status < 500 && ad.status !== 401 && ad.status !== 403, `admin ${method} ${url}: ${ad.status}`);
    }
    // صفوف السجل للعرض والتغيير
    const types = new Set(t.app.db.all('SELECT DISTINCT type FROM security_events').map((r) => r.type));
    for (const ty of ['tags.registry_viewed', 'document.text_viewed', 'analytics.viewed']) assert.ok(types.has(ty), `audit row ${ty}`);
  });

  test('the lawyer never receives pathway labels, machine drafts, OCR text, scan internals or the returning-charity flag; the company never receives lawyer names or scan/OCR data', async () => {
    const lawyerGets = ['/api/lawyer/assignments', '/api/lawyer/matters', '/api/lawyer/today'];
    for (const m of t.app.db.all('SELECT id FROM matters WHERE responsible_lawyer_id = (SELECT id FROM users WHERE username = ?)', 'ahmed')) lawyerGets.push(`/api/lawyer/matters/${m.id}`);
    for (const a of t.app.db.all("SELECT id FROM assignments WHERE lawyer_id = (SELECT id FROM users WHERE username = 'ahmed') AND status != 'withdrawn'")) lawyerGets.push(`/api/lawyer/assignments/${a.id}`);
    for (const u of lawyerGets) {
      const r = await lawyer.get(u);
      if (r.status !== 200) continue;
      const s = JSON.stringify(r.body);
      for (const marker of ['"pathway"', '"pathway_labels"', '"service_line"', 'returning_charity', 'auto_transcript', '"ocr_text"', 'document_text', 'segment_hint']) assert.ok(!s.includes(marker), `${u}: ${marker}`);
    }
    const lawyerNames = t.app.db.all("SELECT name FROM users WHERE role = 'lawyer'").map((x) => x.name).filter((n) => n && n.length > 4);
    for (const u of ['/api/company/overview', '/api/company/requests', '/api/company/plan', '/api/company/company', '/api/company/meta']) {
      const r = await company.get(u);
      if (r.status !== 200) continue;
      const s = JSON.stringify(r.body);
      for (const n of lawyerNames) assert.ok(!s.includes(n), `${u}: lawyer name ${n}`);
      for (const marker of ['"ocr"', '"scan_state"', 'document_text', 'auto_transcript']) assert.ok(!s.includes(marker), `${u}: ${marker}`);
    }
  });
});
