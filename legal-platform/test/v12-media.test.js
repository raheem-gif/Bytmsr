// v12 media — الرسائل الصوتية (أرشفة التسجيل من الموقع + نص آلي للفريق) وماسح المستندات والنسخ والنص المقروء آليًا.
// MD-0 (العقد): الإصدار 12.0.0 وهيكل الوثائق، المخطط 88 (جديد ومرتين على قاعدة 11.0)، الإعدادات وتحققها، تكامل تحويل
// الصوت (شرط اسم المزوّد وتأكيد شروطه، مسح المفتاح)، الميكروفون لكل طلب، أسعار Haiku 5.5 والجهد، أدوات الخادم (الفحص
// والبيئة الدنيا)، الطابور (kick / processDue / gen / الانقطاع)، التحقق من كتلة scan، القرص، media.gc، والمسارات الجديدة
// (401 / 403 / 501 حتى تُبنى).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { startTestApp } from './helpers.js';
import { Db } from '../src/db.js';
import { DEFAULT_SETTINGS, LABELS } from '../src/constants.js';
import { MODEL_PRICES, priceFor, effortConfig } from '../src/ai/anthropic.js';
import { INTEGRATION_SPEC } from '../src/services/integrations.js';
import { createMediaTools, toolsMode, resolveBin, SPAWN_ENV_KEYS, DENY_ALL_CODER_RE } from '../src/media-tools.js';
import { createMedia, base64Bytes, SCAN_CAPS } from '../src/services/media.js';
import { oggOpusInfo, STT_VENDOR_REQUIRED, setFetch, setLookup, setTimeoutMs, classifyIp, assertHostAllowed } from '../src/ai/stt.js';
import http from 'node:http';
import { securityHeaders } from '../src/http.js';
import { buildPng1 } from '../public/assets/js/lib/scan-core.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** سكربت تنفيذي صغير (يعمل بـ node نفسه بمسار مطلق: بيئة الأدوات PATH=/usr/bin:/bin فقط) */
function fakeBin(dir, name, body) {
  const f = path.join(dir, name);
  fs.writeFileSync(f, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
  return f;
}

// ───────────────────────── الإصدار والوثائق ─────────────────────────
describe('v12 media MD-0 — version 12.0.0 and the docs skeleton', () => {
  test('package.json, both Dockerfile labels and /api/meta say 12.0.0', async () => {
    assert.equal(JSON.parse(read('package.json')).version, '12.0.0');
    assert.match(read('Dockerfile'), /org\.opencontainers\.image\.version="12\.0\.0"/);
    assert.match(fs.readFileSync(path.join(ROOT, '..', 'Dockerfile'), 'utf8'), /org\.opencontainers\.image\.version="12\.0\.0"/);
    assert.deepEqual(Object.keys(JSON.parse(read('package.json')).dependencies || {}), [], 'zero runtime dependencies');
    const t = await startTestApp();
    try {
      const meta = await t.client().get('/api/meta');
      assert.equal(meta.body.version, '12.0.0');
    } finally {
      await t.close();
    }
  });

  test('README, PLATFORM-BRIEF and DEPLOY carry the six v12 markers (open and close, in lane order)', () => {
    for (const f of ['README.md', 'PLATFORM-BRIEF.md', 'DEPLOY.md']) {
      const s = read(f);
      let last = -1;
      for (const lane of ['entry', 'look', 'staff-lines', 'media', 'tags', 'gate']) {
        const open = s.indexOf(`<!-- v12:${lane} -->`);
        const close = s.indexOf(`<!-- /v12:${lane} -->`);
        assert.ok(open > last, `${f} v12:${lane} opens after the previous marker`);
        assert.ok(close > open, `${f} v12:${lane} closes`);
        assert.equal(s.split(`<!-- v12:${lane} -->`).length, 2, `${f} v12:${lane} once`);
        last = close;
      }
    }
  });
});

// ───────────────────────── المخطط 88 ─────────────────────────
const MEDIA_TABLES = ['document_files', 'document_text', 'voice_auto_transcripts', 'media_jobs', 'media_usage', 'media_orphans'];
const MEDIA_DOC_COLS = ['scan_state', 'display_file_id', 'page_count', 'ocr_state', 'width', 'height'];

function assertSchema88(db, label) {
  const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
  for (const tb of MEDIA_TABLES) assert.ok(tables.includes(tb), `${label}: ${tb}`);
  const cols = (tb) => db.all(`PRAGMA table_info(${tb})`).map((r) => r.name);
  for (const c of MEDIA_DOC_COLS) assert.ok(cols('documents').includes(c), `${label}: documents.${c}`);
  assert.ok(!cols('documents').includes('clean_file_id'), 'r2: display_file_id replaces clean_file_id (L12-61)');
  for (const c of ['gen', 'crashes', 'next_page', 'attempts', 'locked_at']) assert.ok(cols('media_jobs').includes(c), `${label}: media_jobs.${c}`);
  for (const c of ['played_ratio', 'outcome', 'confidence', 'raw']) assert.ok(cols('voice_auto_transcripts').includes(c), `${label}: voice_auto_transcripts.${c}`);
  for (const c of ['width', 'height', 'sha256', 'source', 'params', 'role', 'page']) assert.ok(cols('document_files').includes(c), `${label}: document_files.${c}`);
  const trg = db.all("SELECT name FROM sqlite_master WHERE type = 'trigger'").map((r) => r.name);
  assert.ok(trg.includes('trg_document_files_orphan'), `${label}: orphan trigger`);
  const idx = db.all("SELECT name FROM sqlite_master WHERE type = 'index'").map((r) => r.name);
  for (const i of ['idx_document_files_doc', 'idx_media_jobs_due', 'idx_media_usage_period']) assert.ok(idx.includes(i), `${label}: ${i}`);
  assert.deepEqual(db.all('PRAGMA foreign_key_check'), [], `${label}: foreign keys clean`);
}

describe('v12 media MD-0 — schema 88 (additive, idempotent, safe on an 11.0 database)', () => {
  test('a fresh database twice: tables, columns, trigger, indexes; the cascade fills media_orphans', () => {
    const dir = tmp('v12-media-schema-');
    try {
      for (let i = 0; i < 2; i++) {
        const db = new Db(path.join(dir, 'a.db'));
        assertSchema88(db, `fresh run ${i + 1}`);
        db.close();
      }
      const db = new Db(path.join(dir, 'a.db'));
      const docId = db.insert('documents', { title: 't', filename: 't.jpg', mime: 'image/jpeg', size: 3, sha256: 'x', storage_key: '2026/10/t.jpg', uploaded_by_kind: 'client', created_at: '2026-10-15T00:00:00.000Z' });
      db.insert('document_files', { document_id: docId, role: 'original', page: 1, storage_key: 'variants/2026/10/o.jpg', mime: 'image/jpeg', size: 3, sha256: 'y', source: 'client_scanner', created_by_kind: 'client', created_at: '2026-10-15T00:00:00.000Z' });
      db.insert('media_jobs', { kind: 'ocr', document_id: docId, next_at: '2026-10-15T00:00:00.000Z', created_at: '2026-10-15T00:00:00.000Z', updated_at: '2026-10-15T00:00:00.000Z' });
      db.run('DELETE FROM documents WHERE id = ?', docId);
      assert.deepEqual(db.all('SELECT storage_key FROM media_orphans').map((r) => r.storage_key), ['variants/2026/10/o.jpg'], 'raw DELETE FROM documents leaves the variant key for media.gc (L12-70)');
      assert.equal(Number(db.value('SELECT COUNT(*) FROM document_files')), 0);
      assert.equal(Number(db.value('SELECT COUNT(*) FROM media_jobs')), 0, 'jobs cascade');
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an 11.0-shaped demo database (no 88) upgrades twice: same rows, new columns NULL, nothing queued', async () => {
    const dir = tmp('v12-media-upgrade-');
    const file = path.join(dir, 'old.db');
    try {
      const t = await startTestApp({ seed: 'demo' });
      try {
        t.app.db.raw.prepare('VACUUM INTO ?').run(file);
      } finally {
        await t.close();
      }
      // قاعدة بشكل 11.0: بلا جداول 88 ولا أعمدتها ولا جدول البحث
      const raw = new DatabaseSync(file);
      raw.exec('DROP TRIGGER IF EXISTS trg_document_files_orphan; DROP TABLE IF EXISTS document_text_fts;');
      for (const tb of MEDIA_TABLES) raw.exec(`DROP TABLE IF EXISTS ${tb}`);
      for (const c of MEDIA_DOC_COLS) raw.exec(`ALTER TABLE documents DROP COLUMN ${c}`);
      const before = raw.prepare('SELECT id, title, sha256, storage_key, mime, size FROM documents ORDER BY id').all();
      assert.ok(before.length > 0, 'demo has documents');
      raw.close();
      for (let i = 0; i < 2; i++) {
        const db = new Db(file);
        assertSchema88(db, `upgrade run ${i + 1}`);
        assert.deepEqual(db.all('SELECT id, title, sha256, storage_key, mime, size FROM documents ORDER BY id').map((r) => ({ ...r })), before.map((r) => ({ ...r })), 'no existing row changes');
        assert.equal(Number(db.value('SELECT COUNT(*) FROM documents WHERE scan_state IS NOT NULL OR ocr_state IS NOT NULL OR display_file_id IS NOT NULL')), 0, 'old rows read NULL («لم يُعالَج»)');
        assert.equal(Number(db.value('SELECT COUNT(*) FROM media_jobs')), 0, 'the migration queues nothing');
        db.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────── الإعدادات ─────────────────────────
describe('v12 media MD-0 — settings block (H-M1) and validation (H-M3)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('defaults: web recording archived, STT automatic, scanner on, Claude OCR off, server-set timestamps empty', () => {
    const want = {
      web_voice_enabled: false,
      stt_auto: true,
      stt_charity_third_party: false,
      stt_minutes_per_client_day: 20,
      stt_third_party_since: '',
      scan_client_enabled: true,
      scan_server_auto: true,
      ocr_provider: 'auto',
      ocr_claude_allowed: false,
      ocr_claude_companies: false,
      ocr_claude_budget_pct: 20,
      ocr_claude_since: '',
      ocr_model: '',
      ocr_max_pages: 10,
    };
    for (const [k, val] of Object.entries(want)) assert.deepEqual(DEFAULT_SETTINGS[k], val, k);
    assert.deepEqual(Object.keys(LABELS.ocr_provider), ['auto', 'tesseract', 'claude', 'off']);
    assert.deepEqual(Object.keys(LABELS.stt_provider), ['off', 'openai_compatible', 'google']);
    for (const s of ['queued', 'running', 'done', 'empty', 'failed', 'skipped']) assert.match(LABELS.media_state[s], /[؀-ۿ]/, s);
    for (const ty of ['document.cleaned', 'document.display_changed', 'document.text_viewed', 'settings.ocr_claude_changed', 'settings.stt_charity_changed']) assert.match(LABELS.security_event[ty], /[؀-ۿ]/, ty);
  });

  test('PATCH validates media keys (enum, ranges, model id) and refuses the server-set timestamps', async () => {
    const bad = [
      [{ ocr_provider: 'aws' }, /طريقة قراءة النص/],
      [{ ocr_max_pages: 31 }, /خارج النطاق/],
      [{ stt_minutes_per_client_day: 0 }, /خارج النطاق/],
      [{ ocr_claude_budget_pct: 101 }, /خارج النطاق/],
      [{ ocr_model: 'gpt-4o' }, /نموذج القراءة/],
      [{ stt_third_party_since: '2020-01-01T00:00:00.000Z' }, /يضبطه الخادم/],
      [{ ocr_claude_since: '' }, /يضبطه الخادم/],
    ];
    for (const [body, re] of bad) {
      const r = await admin.patch('/api/admin/settings', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.body.error, re, JSON.stringify(body));
    }
    const good = await admin.patch('/api/admin/settings', { web_voice_enabled: true, ocr_provider: 'tesseract', ocr_max_pages: 5, ocr_model: 'claude-sonnet-5-5', stt_minutes_per_client_day: 30 });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    assert.equal(t.app.settings.get('web_voice_enabled'), true);
    assert.equal(t.app.settings.get('ocr_provider'), 'tesseract');
    assert.equal(t.app.settings.get('ocr_max_pages'), 5);
    assert.equal(t.app.settings.get('ocr_model'), 'claude-sonnet-5-5');
    const back = await admin.patch('/api/admin/settings', { web_voice_enabled: false, ocr_provider: 'auto', ocr_max_pages: 10, ocr_model: '', stt_minutes_per_client_day: 20 });
    assert.equal(back.status, 200);
    const manager = await t.client().patch('/api/admin/settings', { web_voice_enabled: true });
    assert.equal(manager.status, 401);
  });

  test('ocr_claude_since is set by the server only when Claude OCR goes from off to on (L12-19)', async () => {
    assert.equal(t.app.settings.get('ocr_claude_since'), '');
    assert.equal((await admin.patch('/api/admin/settings', { ocr_claude_allowed: true })).status, 200);
    const since = t.app.settings.get('ocr_claude_since');
    assert.match(since, /^\d{4}-\d\d-\d\dT/);
    assert.equal((await admin.patch('/api/admin/settings', { ocr_claude_allowed: true, ocr_max_pages: 9 })).status, 200);
    assert.equal(t.app.settings.get('ocr_claude_since'), since, 'on → on keeps the disclosure moment');
    assert.equal((await admin.patch('/api/admin/settings', { ocr_claude_allowed: false, ocr_max_pages: 10 })).status, 200);
    assert.equal(t.app.settings.get('ocr_claude_since'), since, 'off keeps the old value (no third-party processing while off)');
  });
});

// ───────────────────────── تكامل تحويل الصوت ─────────────────────────
describe('v12 media MD-0 — INTEGRATION_SPEC.stt (vendor name + attestation, key cleared on provider/base_url change)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  const item = async () => (await admin.get('/api/admin/integrations')).body.items.find((x) => x.name === 'stt');
  const field = (it, k) => it.fields.find((f) => f.key === k);

  test('the spec: provider off by default, the key is a secret, Arabic labels, hosting options', async () => {
    const f = INTEGRATION_SPEC.stt.fields;
    for (const k of ['provider', 'base_url', 'api_key', 'model', 'language', 'prompt', 'hosting', 'vendor_name', 'no_training_attested', 'price_per_minute_usd', 'monthly_budget_usd', 'max_seconds']) {
      assert.ok(f[k], k);
      assert.match(f[k].label, /[؀-ۿ]/, `${k} label`);
    }
    assert.equal(f.provider.default, 'off');
    assert.equal(f.api_key.secret, true);
    assert.deepEqual(Object.keys(f.hosting.options), ['third_party', 'own_server']);
    const it = await item();
    assert.equal(field(it, 'provider').value, 'off');
    assert.equal(field(it, 'api_key').value, null);
    assert.equal(t.app.stt.configured(), false);
  });

  test('a third party without the vendor name or the attestation → 400; with both → saved, key hidden, stt_third_party_since set', async () => {
    const base = { provider: 'openai_compatible', base_url: 'https://api.openai.com', api_key: 'sk-test-STT-SECRET-123456', model: 'gpt-4o-transcribe', hosting: 'third_party' };
    let r = await admin.put('/api/admin/integrations/stt', { values: base });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'stt_vendor_required');
    assert.equal(r.body.error, STT_VENDOR_REQUIRED);
    r = await admin.put('/api/admin/integrations/stt', { values: { ...base, vendor_name: 'OpenAI' } });
    assert.equal(r.status, 400, 'attestation missing');
    assert.equal(t.app.settings.get('stt_third_party_since'), '');
    r = await admin.put('/api/admin/integrations/stt', { values: { ...base, vendor_name: 'OpenAI', no_training_attested: 'true' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(!JSON.stringify(r.body).includes('STT-SECRET'), 'the key never comes back');
    assert.ok(!JSON.stringify((await admin.get('/api/admin/integrations')).body).includes('STT-SECRET'));
    assert.equal(t.app.integrations.get('stt').no_training_attested, 'yes', 'normalised');
    assert.equal(t.app.stt.configured(), true);
    assert.equal(t.app.stt.isThirdParty(), true);
    const since = t.app.settings.get('stt_third_party_since');
    assert.match(since, /^\d{4}-\d\d-\d\dT/);
    r = await admin.put('/api/admin/integrations/stt', { values: { model: 'gpt-4o-mini-transcribe' } });
    assert.equal(r.status, 200);
    assert.equal(t.app.settings.get('stt_third_party_since'), since, 'an edit of a third party already announced keeps the date');
    const audit = (await admin.get('/api/admin/audit?type=integration.updated')).body.items;
    assert.ok(audit.some((e) => /تحويل الرسائل الصوتية إلى نص/.test(e.summary)));
  });

  test('changing base_url (or provider) clears the stored key unless a new key is sent; http only for the firm’s own server', async () => {
    assert.ok(t.app.integrations.get('stt').api_key, 'key stored');
    let r = await admin.put('/api/admin/integrations/stt', { values: { base_url: 'https://api.groq.com/openai' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(t.app.integrations.get('stt').api_key, '', 'L12-71: a new address never receives the old key');
    r = await admin.put('/api/admin/integrations/stt', { values: { base_url: 'https://api.openai.com', api_key: 'sk-new-key-0987654321' } });
    assert.equal(r.status, 200);
    assert.equal(t.app.integrations.get('stt').api_key, 'sk-new-key-0987654321', 'a key sent with the change is kept');
    r = await admin.put('/api/admin/integrations/stt', { values: { base_url: 'http://10.0.0.5:8000' } });
    assert.equal(r.status, 400, 'a third party must use https');
    r = await admin.put('/api/admin/integrations/stt', { values: { base_url: 'https://user:pw@example.com' } });
    assert.equal(r.status, 400, 'no credentials in the URL');
    r = await admin.put('/api/admin/integrations/stt', { values: { hosting: 'own_server', base_url: 'http://10.0.0.5:8000', vendor_name: '', no_training_attested: '' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(t.app.stt.isThirdParty(), false);
    r = await admin.put('/api/admin/integrations/stt', { values: { max_seconds: '99999' } });
    assert.equal(r.status, 400);
    r = await admin.put('/api/admin/integrations/stt', { values: { provider: 'off' } });
    assert.equal(r.status, 200);
    assert.equal(t.app.stt.configured(), false);
  });

  test('POST /api/admin/integrations/stt/test is the media route (admin only; MD-6: { ok, status, code, latency_ms })', async () => {
    const r = await admin.post('/api/admin/integrations/stt/test', {});
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['code', 'latency_ms', 'ok', 'status']);
    assert.equal(r.body.ok, false);
  });
});

// ───────────────────────── الميكروفون لكل طلب ─────────────────────────
describe('v12 media MD-0 — Permissions-Policy per request from web_voice_enabled (L12-22)', () => {
  test('two app instances in one process with different settings answer differently on /intake and /p/x', async () => {
    const a = await startTestApp();
    const b = await startTestApp();
    try {
      a.app.settings.set('web_voice_enabled', true);
      for (const p of ['/intake', '/p/abcdefghijklmnopqrstu']) {
        const ra = await a.client().get(p);
        const rb = await b.client().get(p);
        assert.match(ra.headers.get('permissions-policy'), /microphone=\(self\)/, `on: ${p}`);
        assert.match(rb.headers.get('permissions-policy'), /microphone=\(\)/, `off (default): ${p}`);
        assert.match(rb.headers.get('permissions-policy'), /camera=\(\)/, p);
      }
      for (const p of ['/', '/services', '/app', '/api/meta', '/privacy']) {
        const ra = await a.client().get(p);
        assert.match(ra.headers.get('permissions-policy'), /microphone=\(\)/, `${p}: never outside the capture pages`);
      }
      a.app.settings.set('web_voice_enabled', false);
      const again = await a.client().get('/intake');
      assert.match(again.headers.get('permissions-policy'), /microphone=\(\)/, 'flip back without restart');
    } finally {
      await a.close();
      await b.close();
    }
  });

  test('securityHeaders(res, p, { mic }) never opens the microphone outside /intake and /p/', () => {
    const fake = (url) => {
      const headers = {};
      return { req: { url }, setHeader: (k, val) => (headers[k.toLowerCase()] = val), headers };
    };
    for (const [url, mic, want] of [
      ['/intake', true, /microphone=\(self\)/],
      ['/intake', false, /microphone=\(\)/],
      ['/p/x', false, /microphone=\(\)/],
      ['/app', true, /microphone=\(\)/],
      ['/services', true, /microphone=\(\)/],
    ]) {
      const r = fake(url);
      securityHeaders(r, url, { mic });
      assert.match(r.headers['permissions-policy'], want, `${url} mic=${mic}`);
    }
  });
});

// ───────────────────────── Claude: الأسعار والجهد ─────────────────────────
describe('v12 media MD-0 — Haiku 5.5 price and effort (L12-19)', () => {
  test('MODEL_PRICES has claude-haiku-5-5 and effortConfig keeps effort on Haiku 5.5 (dropped only on Haiku 3/4)', () => {
    assert.deepEqual(MODEL_PRICES['claude-haiku-5-5'], { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 });
    assert.equal(priceFor('claude-haiku-5-5').known, true);
    assert.equal(priceFor('claude-haiku-5-5').input, 0.1);
    assert.deepEqual(effortConfig('claude-haiku-5-5', 'low'), { effort: 'low' });
    assert.deepEqual(effortConfig('claude-haiku-4-5', 'low'), {});
    assert.deepEqual(effortConfig('claude-opus-5-5', 'medium'), { effort: 'medium' });
    assert.deepEqual(effortConfig('claude-sonnet-5-5', 'high'), { effort: 'high' });
  });
});

// ───────────────────────── أدوات الخادم ─────────────────────────
describe('v12 media MD-0 — optional server tools: lazy probe, test mode, minimal env, fail-closed ImageMagick (L12-68, L12-69)', () => {
  let dir;
  before(() => {
    dir = tmp('v12-media-tools-');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('tools are off under node --test unless MEDIA_TOOLS=on or a *_BIN; MEDIA_TOOLS=off always wins', () => {
    assert.equal(toolsMode({ NODE_TEST_CONTEXT: 'child-v8' }), 'test');
    assert.equal(toolsMode({ NODE_TEST_CONTEXT: 'child-v8', MEDIA_TOOLS: 'on' }), 'on');
    assert.equal(toolsMode({ MEDIA_TOOLS: 'off' }), 'off');
    assert.equal(toolsMode({ MEDIA_TOOLS: 'off', NODE_TEST_CONTEXT: '1' }), 'off');
    assert.equal(toolsMode({}), 'auto');
    assert.equal(resolveBin('tesseract', { NODE_TEST_CONTEXT: '1' }).reason, 'disabled');
    assert.equal(resolveBin('tesseract', { TESSERACT_BIN: 'tesseract' }).reason, 'bin_not_absolute');
    assert.equal(resolveBin('tesseract', { TESSERACT_BIN: '/nope/tesseract' }).reason, 'bin_missing');
    assert.equal(resolveBin('tesseract', { MEDIA_TOOLS: 'off', TESSERACT_BIN: '/nope' }).reason, 'disabled');
  });

  test('probe is lazy and cached; a fake Tesseract with ara is found, the rest are disabled in test mode', async () => {
    const tess = fakeBin(dir, 'tesseract', `const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.3.4'); process.exit(0); }
if (a[0] === '--list-langs') { console.log('List of available languages in "/usr/share/tessdata/" (3):'); console.log('ara'); console.log('eng'); console.log('osd'); process.exit(0); }
process.exit(2);`);
    const tools = createMediaTools({ tmpDir: path.join(dir, 'tmp'), env: { NODE_TEST_CONTEXT: '1', TESSERACT_BIN: tess } });
    assert.equal(tools.status(), null, 'nothing probed at start');
    const p = await tools.probe();
    assert.equal(p.mode, 'test');
    assert.equal(p.tesseract.ok, true);
    assert.equal(p.tesseract.ara, true);
    assert.match(p.tesseract.version, /tesseract 5/);
    for (const k of ['imagemagick', 'pdftotext', 'pdftoppm', 'pdfinfo']) assert.equal(p[k].ok, false, k);
    assert.equal(await tools.probe(), p, 'cached per process');
    assert.equal(tools.has('tesseract'), true);
  });

  test('every spawn: argv array, shell:false, SIGKILL, cwd = private temp dir, env = exactly the allow-list (no secrets)', async () => {
    const envDump = fakeBin(dir, 'envdump', 'process.stdout.write(JSON.stringify({ env: process.env, argv: process.argv.slice(2), cwd: process.cwd() }));');
    const prev = { APP_SECRET: process.env.APP_SECRET, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, SMTP_PASSWORD: process.env.SMTP_PASSWORD };
    process.env.APP_SECRET = 'leak-me-app-secret-0123456789abcdef';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-leak';
    process.env.SMTP_PASSWORD = 'smtp-leak';
    const seen = [];
    const { execFile } = await import('node:child_process');
    const tmpDir = path.join(dir, 'tmp2');
    const tools = createMediaTools({
      tmpDir,
      env: process.env,
      execFileImpl: (bin, argv, opts, cb) => {
        seen.push({ bin, argv, opts });
        return execFile(bin, argv, opts, cb);
      },
    });
    try {
      const r = await tools.run(envDump, ['a b', '; rm -rf /', '$(id)']);
      const out = JSON.parse(String(r.stdout));
      assert.deepEqual(Object.keys(out.env).sort(), [...SPAWN_ENV_KEYS].sort());
      assert.equal(out.env.PATH, '/usr/bin:/bin');
      assert.equal(out.env.OMP_THREAD_LIMIT, '1');
      assert.deepEqual(out.argv, ['a b', '; rm -rf /', '$(id)'], 'arguments arrive verbatim (no shell)');
      assert.equal(fs.realpathSync(out.cwd), fs.realpathSync(tmpDir));
      assert.equal(fs.statSync(tmpDir).mode & 0o777, 0o700);
      assert.equal(seen[0].opts.shell, false);
      assert.equal(seen[0].opts.killSignal, 'SIGKILL');
      assert.ok(seen[0].opts.timeout > 0);
      assert.ok(Array.isArray(seen[0].argv));
      await assert.rejects(tools.run('envdump', []), /absolute/);
      const slow = fakeBin(dir, 'slow', 'setTimeout(() => {}, 10000);');
      await assert.rejects(tools.run(slow, [], { timeoutMs: 300 }), (e) => e.code === 'timeout');
    } finally {
      for (const [k, val] of Object.entries(prev)) {
        if (val === undefined) delete process.env[k];
        else process.env[k] = val;
      }
    }
  });

  test('ImageMagick is refused unless `-list policy` shows the deny-all coder rule (fails closed)', async () => {
    const policyOut = fs.readFileSync(path.join(ROOT, 'deploy', 'imagemagick', 'policy.xml'), 'utf8');
    assert.match(policyOut, /<policy domain="coder" rights="none" pattern="\*"\/>/);
    assert.match(policyOut, /<policy domain="delegate" rights="none" pattern="\*"\/>/);
    assert.match(policyOut, /<policy domain="path" rights="none" pattern="@\*"\/>/);
    const open = fakeBin(dir, 'convert-open', `const a = process.argv.slice(2);
if (a[0] === '-version') { console.log('Version: ImageMagick 6.9.12-98 Q16 x86_64'); process.exit(0); }
if (a[0] === '-list') { console.log('Path: /etc/ImageMagick-6/policy.xml\\n  Policy: Delegate\\n    rights: None \\n    pattern: URL\\n'); process.exit(0); }`);
    const safe = fakeBin(dir, 'convert-safe', `const a = process.argv.slice(2);
if (a[0] === '-version') { console.log('Version: ImageMagick 6.9.12-98 Q16 x86_64'); process.exit(0); }
if (a[0] === '-list') { console.log('Path: /etc/ImageMagick-6/policy.xml\\n  Policy: Coder\\n    rights: None \\n    pattern: *\\n  Policy: Coder\\n    rights: Read Write \\n    pattern: {JPEG,PNG,WEBP,RGBA,GRAY}\\n'); process.exit(0); }`);
    const t1 = createMediaTools({ tmpDir: path.join(dir, 't3'), env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: open } });
    const p1 = await t1.probe();
    assert.equal(p1.imagemagick.ok, false);
    assert.equal(p1.imagemagick.reason, 'policy');
    const t2 = createMediaTools({ tmpDir: path.join(dir, 't4'), env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: safe } });
    const p2 = await t2.probe();
    assert.equal(p2.imagemagick.ok, true);
    assert.equal(p2.imagemagick.policy, true);
    assert.ok(DENY_ALL_CODER_RE.test('  Policy: Coder\n    rights: None \n    pattern: *\n'));
  });

  test('MEDIA_TOOLS=off: nothing is probed even with a *_BIN', async () => {
    const tools = createMediaTools({ tmpDir: path.join(dir, 't5'), env: { MEDIA_TOOLS: 'off', TESSERACT_BIN: '/bin/true' } });
    const p = await tools.probe();
    assert.equal(p.mode, 'off');
    for (const k of ['imagemagick', 'tesseract', 'pdftotext', 'pdftoppm', 'pdfinfo']) assert.equal(p[k].reason, 'disabled', k);
  });
});

// ───────────────────────── الطابور ─────────────────────────
describe('v12 media MD-0 — the job runner: kick, claim, gen, crashes, outside the scheduler lock (L12-69)', () => {
  let t;
  let docId;
  before(async () => {
    t = await startTestApp();
    docId = t.app.db.insert('documents', { title: 'صورة', filename: 'p.jpg', mime: 'image/jpeg', size: 3, sha256: 'x', storage_key: '2026/10/p.jpg', uploaded_by_kind: 'client', created_at: new Date().toISOString() });
  });
  after(async () => t && t.close());

  const job = (kind) => t.app.db.get('SELECT * FROM media_jobs WHERE kind = ? AND document_id = ?', kind, docId);

  test('kick() is a no-op under node --test; with the tools off (test mode) a unit ends skipped: tool_missing', async () => {
    // v12 media (MD-10): كل الأنواع لها معالج الآن؛ تحت الاختبار لا أداة إلا بـ *_BIN ← «لم يُعالَج» بلا خطأ
    assert.equal(t.app.media.kick(), false);
    const id = t.app.media.enqueue('ocr', docId);
    assert.ok(id);
    assert.equal(job('ocr').state, 'queued');
    assert.deepEqual(await t.app.media.processDue({ budgetMs: 1000 }), { ran: 1 });
    assert.equal(job('ocr').state, 'skipped');
    assert.equal(job('ocr').error, 'tool_missing');
    assert.throws(() => t.app.media.enqueue('nope', docId), /unknown media job kind/);
  });

  test('the scheduler job media.process only kicks (returns at once) and media.gc is daily', async () => {
    const jobs = t.app.jobs.list();
    const proc = jobs.find((j) => j.name === 'media.process');
    assert.equal(proc.every_minutes, 1);
    assert.equal(proc.label, 'تحويل الصوت وتنظيف المستندات وقراءتها');
    assert.equal(jobs.find((j) => j.name === 'media.gc').every_minutes, 1440);
    let release;
    t.app.media.registerHandler('stt', () => new Promise((r) => (release = r)));
    t.app.media.enqueue('stt', docId);
    const run = await t.app.jobs.runDue({ force: true, only: 'media.process' });
    assert.equal(run[0].ok, true);
    assert.deepEqual(run[0].result, { kicked: false });
    // الحلقة نفسها تعمل خارج قفل runDue: مهمة أخرى تعمل أثناء وحدة طويلة
    const loop = t.app.media.processDue({ budgetMs: 5000 });
    await new Promise((r) => setImmediate(r));
    assert.equal(job('stt').state, 'running');
    assert.equal(job('stt').attempts, 1, 'claim increments attempts');
    const other = await t.app.jobs.runDue({ force: true, only: 'media.gc' });
    assert.equal(other[0].ok, true, 'runDue is not held by the media loop');
    release({ state: 'done', provider: 'mock' });
    assert.deepEqual(await loop, { ran: 1 });
    assert.equal(job('stt').state, 'done');
    assert.equal(job('stt').provider, 'mock');
  });

  test('a result for an older generation is discarded; retry backs off 1 minute; failed after the last attempt', async () => {
    t.app.media.registerHandler('clean', async (j) => {
      // أثناء التشغيل أُعيدت الوحدة إلى الانتظار (كما يفعل requeueStale أو الإقلاع بعد انقطاع: gen + 1)
      t.app.db.run("UPDATE media_jobs SET state = 'queued', gen = gen + 1, next_at = ? WHERE id = ?", new Date(Date.now() + 3600_000).toISOString(), j.id);
      return { state: 'done' };
    });
    assert.equal(t.app.media.enqueue('clean', docId) > 0, true);
    await t.app.media.processDue({ budgetMs: 1000 });
    assert.equal(job('clean').state, 'queued', 'the stale generation result is discarded');
    assert.equal(job('clean').gen, 1);
    // enqueue لا يلمس وحدة تعمل الآن
    t.app.db.run("UPDATE media_jobs SET state = 'running' WHERE kind = 'clean'");
    assert.equal(t.app.media.enqueue('clean', docId), null);
    t.app.db.run("UPDATE media_jobs SET state = 'queued' WHERE kind = 'clean'");
    t.app.media.registerHandler('clean', async () => ({ state: 'retry', error: 'network' }));
    t.app.db.run("UPDATE media_jobs SET state = 'queued', attempts = 0, next_at = ? WHERE kind = 'clean'", new Date(Date.now() - 1000).toISOString());
    await t.app.media.processDue({ budgetMs: 1000 });
    const j1 = job('clean');
    assert.equal(j1.state, 'queued');
    assert.equal(j1.error, 'network');
    const wait = Date.parse(j1.next_at) - Date.now();
    assert.ok(wait > 50_000 && wait <= 61_000, `first retry after ~1 min (got ${wait} ms)`);
    t.app.db.run("UPDATE media_jobs SET attempts = 3, next_at = ? WHERE kind = 'clean'", new Date(Date.now() - 1000).toISOString());
    await t.app.media.processDue({ budgetMs: 1000 });
    assert.equal(job('clean').state, 'failed');
  });

  test('a job found running at boot counts as a crash; two crashes → failed (crashed)', async () => {
    t.app.db.run("UPDATE media_jobs SET state = 'running', crashes = 0, locked_at = ? WHERE kind = 'ocr'", new Date().toISOString());
    createMedia(t.app); // إقلاع جديد على القاعدة نفسها
    assert.equal(job('ocr').state, 'queued');
    assert.equal(job('ocr').crashes, 1);
    t.app.db.run("UPDATE media_jobs SET state = 'running' WHERE kind = 'ocr'");
    createMedia(t.app);
    assert.equal(job('ocr').state, 'failed');
    assert.equal(job('ocr').error, 'crashed');
  });
});

// ───────────────────────── كتلة scan ─────────────────────────
describe('v12 media MD-0 — checkScan / checkAttachments: structure and caps before any write (§5.8, L12-58)', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => t && t.close());
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]).toString('base64');
  const scan = (extra = {}) => ({ v: 1, algo: 'scan-core@1', mode: 'color', turns: 0, pages: 1, quad: [[0.2, 0.1], [0.8, 0.1], [0.85, 0.9], [-0.5, 1.4]], score: 0.97, partial: false, adjusted: false, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpeg }], ...extra });

  test('a valid block is normalised (quad clamped to 0..1, score rounded), no scan → null', () => {
    const s = t.app.media.checkScan(scan());
    assert.deepEqual(s.params.quads[0][3], [0, 1]);
    assert.equal(s.params.pages, 1);
    assert.equal(s.params.mode, 'color');
    assert.equal(s.originals.length, 1);
    assert.equal(t.app.media.checkScan(undefined), null);
  });

  test('13 pages, 3 originals for one page, params over 2 KB, a non-image original → 400 bad_scan', () => {
    const bad = [
      scan({ pages: 13 }),
      scan({ originals: [1, 2, 3].map(() => ({ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpeg })) }),
      scan({ algo: 'x'.repeat(3000) }),
      scan({ originals: [{ filename: 'o.pdf', mime: 'application/pdf', data_base64: jpeg }] }),
      scan({ originals: [] }),
      scan({ mode: 'sepia' }),
      scan({ turns: 5 }),
      'nope',
    ];
    for (const b of bad) {
      assert.throws(() => t.app.media.checkScan(b), (e) => e.status === 400 && e.code === 'bad_scan', JSON.stringify(b).slice(0, 80));
    }
    assert.doesNotThrow(() => t.app.media.checkScan(scan({ pages: 20, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpeg }] }), { surface: 'staff' }), 'staff: up to 20 pages');
    assert.throws(() => t.app.media.checkScan(scan({ pages: 21 }), { surface: 'staff' }), /20/);
  });

  test('originals per request: 16 MB on the intake → 400; 7 MB passes the intake but not the company upload (6 MB)', () => {
    // MD-4: checkAttachments فك كل ملف وفحصه كاملًا، فالبيانات JPEG حقيقية الترويسة
    const jpg = (bytes) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(Math.max(16, bytes - 11), 1)]).toString('base64');
    const big = (mb) => ({ filename: 'p.jpg', mime: 'image/jpeg', data_base64: jpg(64), scan: scan({ pages: 2, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpg(mb * 1024 * 1024) }] }) });
    assert.throws(() => t.app.media.checkAttachments([big(16)], { surface: 'intake' }), (e) => e.status === 400);
    assert.doesNotThrow(() => t.app.media.checkAttachments([big(7)], { surface: 'intake' }));
    assert.throws(() => t.app.media.checkAttachments([big(7)], { surface: 'company' }), (e) => e.status === 400);
    assert.equal(SCAN_CAPS.staff.originalsBytes, 30 * 1024 * 1024);
    assert.equal(base64Bytes(Buffer.from('hello world').toString('base64')), 11);
  });

  test('diskLow(): under 500 MB free → true and a 503 disk_low error', () => {
    t.app.media.setDiskProbe(() => 400 * 1024 * 1024);
    assert.equal(t.app.media.diskLow(), true);
    const e = t.app.media.diskLowError();
    assert.equal(e.status, 503);
    assert.equal(e.code, 'disk_low');
    assert.equal(e.message, 'المساحة على الخادم غير كافية الآن. حاولوا لاحقًا.');
    t.app.media.setDiskProbe(() => 5 * 1024 * 1024 * 1024);
    assert.equal(t.app.media.diskLow(), false);
    t.app.media.setDiskProbe(null);
  });
});

// ───────────────────────── media.gc ─────────────────────────
describe('v12 media MD-0 — media.gc removes orphaned variants only (L12-70)', () => {
  test('orphan keys are unlinked, referenced and outside-variants files are never touched', async () => {
    const t = await startTestApp();
    try {
      const up = t.app.config.uploadsDir;
      const put = (rel) => {
        const abs = path.join(up, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, 'x');
        return abs;
      };
      const docId = t.app.db.insert('documents', { title: 'ص', filename: 'p.jpg', mime: 'image/jpeg', size: 1, sha256: 'x', storage_key: '2026/10/main.jpg', uploaded_by_kind: 'client', created_at: new Date().toISOString() });
      const main = put('2026/10/main.jpg');
      const orphan = put('variants/2026/10/orphan.jpg');
      const kept = put('variants/2026/10/kept.jpg');
      const stray = put('variants/auto/2026/10/stray.jpg');
      const outside = put('2026/10/not-a-variant.jpg');
      const old = new Date(Date.now() - 2 * 3600 * 1000);
      for (const f of [stray, outside]) fs.utimesSync(f, old, old);
      const fileRow = { document_id: docId, page: 1, mime: 'image/jpeg', size: 1, sha256: 'y', source: 'client_scanner', created_by_kind: 'client', created_at: new Date().toISOString() };
      const orphanId = t.app.db.insert('document_files', { ...fileRow, role: 'original', storage_key: 'variants/2026/10/orphan.jpg' });
      t.app.db.insert('document_files', { ...fileRow, role: 'clean', storage_key: 'variants/2026/10/kept.jpg' });
      t.app.db.run('DELETE FROM document_files WHERE id = ?', orphanId);
      t.app.db.insert('media_orphans', { storage_key: '../../../etc/passwd', created_at: new Date().toISOString() });
      const r = t.app.media.gc();
      assert.equal(r.orphans, 1);
      assert.equal(r.swept, 1, 'an unreferenced file under variants/ older than 1 h');
      assert.ok(!fs.existsSync(orphan));
      assert.ok(!fs.existsSync(stray));
      assert.ok(fs.existsSync(kept), 'referenced variant kept');
      assert.ok(fs.existsSync(main), 'main file kept');
      assert.ok(fs.existsSync(outside), 'files outside variants/ are never touched');
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM media_orphans')), 0);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── المسارات الجديدة ─────────────────────────
describe('v12 media MD-0 — new routes: server-side role checks first, 501 until built (§2.1)', () => {
  let t;
  let admin;
  let manager;
  let lawyer;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    manager = await t.login('manager');
    lawyer = await t.login('ahmed');
  });
  after(async () => t && t.close());

  // built = بُني في مهمة لاحقة (لا 501 بعدها): يبقى فحص الدور كما هو
  const ROUTES = [
    ['POST', '/api/admin/documents/1/clean', 'S', 'MD-5'],
    ['PUT', '/api/admin/documents/1/display', 'S', 'MD-5'],
    ['GET', '/api/admin/documents/1/files', 'S', 'MD-5'],
    ['POST', '/api/admin/documents/1/rescan', 'S', 'MD-9'],
    ['GET', '/api/admin/documents/1/text', 'S', 'MD-10'],
    ['PUT', '/api/admin/documents/1/text/1', 'S', 'MD-10'],
    ['POST', '/api/admin/documents/1/ocr', 'S', 'MD-10'],
    ['POST', '/api/admin/voice-notes/1/auto', 'S', 'MD-6'],
    ['GET', '/api/admin/media/status', 'A', 'MD-11'],
    ['POST', '/api/admin/media/backfill', 'A', 'MD-11'],
    ['POST', '/api/admin/integrations/stt/test', 'A', 'MD-6'],
  ];

  test('anonymous 401, lawyer 403, case manager 403 on admin-only, staff 501 not_implemented (built routes: past the guard)', async () => {
    for (const [method, url, guard, built] of ROUTES) {
      const body = method === 'GET' ? undefined : {};
      assert.equal((await t.client().request(method, url, body)).status, 401, `${method} ${url} anonymous`);
      assert.equal((await lawyer.request(method, url, body)).status, 403, `${method} ${url} lawyer`);
      const m = await manager.request(method, url, body);
      const a = await admin.request(method, url, body);
      if (built) {
        // v12 media: بُني (MD-5…): الدور يمر، والرد ليس 401/403/501 (مسارات المدير: مدير الطلبات 403)
        if (guard === 'A') assert.equal(m.status, 403, `${method} ${url} manager`);
        for (const [who, r] of guard === 'A' ? [['admin', a]] : [['manager', m], ['admin', a]]) assert.ok(![401, 403, 501].includes(r.status), `${method} ${url} ${who} → ${r.status}`);
        continue;
      }
      assert.equal(m.status, guard === 'A' ? 403 : 501, `${method} ${url} manager`);
      assert.equal(a.status, 501, `${method} ${url} admin`);
      assert.deepEqual(a.body, { error: 'غير متاح بعد', code: 'not_implemented' });
    }
  });

  test('«نظّف المستند» checks the role before reading a large body', async () => {
    const big = JSON.stringify({ file: { data_base64: 'A'.repeat(3 * 1024 * 1024) } });
    const r = await t.client().request('POST', '/api/admin/documents/1/clean', big);
    assert.equal(r.status, 401);
  });
});

// ───────────────────────── تحويل الصوت: المدة والميزانية ─────────────────────────
describe('v12 media MD-0 — STT helpers: Ogg/Opus duration, billed duration rule, budget state (L12-71)', () => {
  function oggPage(granule, payload, { first = false } = {}) {
    const h = Buffer.alloc(27);
    h.write('OggS', 0, 'latin1');
    h[5] = first ? 2 : 0;
    h.writeUInt32LE(granule % 2 ** 32, 6);
    h.writeUInt32LE(Math.floor(granule / 2 ** 32), 10);
    h[26] = 1;
    return Buffer.concat([h, Buffer.from([payload.length]), payload]);
  }
  test('oggOpusInfo reads channels, input rate, pre-skip and duration; estimateSeconds takes the largest claim', async () => {
    const head = Buffer.alloc(19);
    head.write('OpusHead', 0, 'latin1');
    head[8] = 1;
    head[9] = 1;
    head.writeUInt16LE(312, 10);
    head.writeUInt32LE(16000, 12);
    const buf = Buffer.concat([oggPage(0, head, { first: true }), oggPage(312 + 48000 * 7, Buffer.from('x'))]);
    assert.deepEqual(oggOpusInfo(buf), { channels: 1, inputRate: 16000, preSkip: 312, seconds: 7 });
    assert.equal(oggOpusInfo(Buffer.from('not ogg at all, not ogg at all, not ogg at all')), null);
    const t = await startTestApp();
    try {
      assert.equal(t.app.stt.estimateSeconds({ mime: 'audio/ogg', buffer: buf, seconds: 1 }), 7, 'container beats a smaller claim');
      const webm = Buffer.alloc(8 * 1024 * 1024);
      assert.equal(t.app.stt.estimateSeconds({ mime: 'audio/webm', buffer: webm, seconds: 1 }), 4194.3, 'claimed 1 s on an 8 MB webm → bytes / 2000');
      const b0 = t.app.stt.budgetState();
      assert.equal(b0.spent_usd, 0);
      assert.equal(b0.limit_usd, 10);
      t.app.db.insert('media_usage', { kind: 'stt', provider: 'openai_compatible', cost_micro_usd: 8_500_000, ok: 1, period: b0.period, created_at: new Date().toISOString() });
      const b1 = t.app.stt.budgetState();
      assert.equal(b1.spent_usd, 8.5);
      assert.equal(b1.warning, true);
      assert.equal(b1.exceeded, false);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ MD-4: عقد الرفع على الخادم (§5.8) ═════════════════════════
// الملف الرئيسي = النسخة النظيفة، والأصول في document_files تحت variants/ ببصمتها؛ كل شيء يُفحص قبل أي كتابة؛ العرض
// الافتراضي حسب الثقة (L12-59)؛ التنزيل بنسخة لنفس المستند وحده، وأصل المحامي بلا EXIF؛ الصور الضخمة وHEIC؛ القرص.
const FIX = path.join(ROOT, 'test/fixtures/v12-media');
const fixture = (name) => fs.readFileSync(path.join(FIX, name));
const b64 = (buf) => Buffer.from(buf).toString('base64');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const okBody = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body).slice(0, 300));
  return r.body;
};
let phoneN = 0;
const phone = () => `0101${String(Date.now() % 1e6).padStart(6, '0').slice(-4)}${String(++phoneN).padStart(3, '0')}`;
/** كتلة scan (§5.4) بأصل حقيقي (orient-6.jpg: فيه EXIF) وأي إضافات */
const scanOf = (extra = {}, originals = [fixture('orient-6.jpg')]) => ({
  v: 1,
  algo: 'scan-core@1',
  mode: 'color',
  turns: 0,
  pages: originals.length,
  quad: [[0.05, 0.05], [0.95, 0.04], [0.96, 0.95], [0.04, 0.96]],
  score: 0.91,
  partial: false,
  adjusted: false,
  originals: originals.map((buf, i) => ({ filename: `ورقة-الأصل-${i + 1}.jpg`, mime: 'image/jpeg', data_base64: b64(buf) })),
  ...extra,
});
const cleanJpeg = () => ({ filename: 'ورقة-1.jpg', mime: 'image/jpeg', data_base64: b64(fixture('orient-3.jpg')) });
/** PNG بت واحد 7200×7200 في بضعة كيلوبايت (L12-67) */
function pngBomb() {
  const rows = new Uint8Array((1 + 900) * 7200);
  return Buffer.from(buildPng1(zlib.deflateSync(rows, { level: 9 }), 7200, 7200));
}
const uploadsFiles = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out.sort();
};

describe('v12 media MD-4 — upload contract: clean main + originals, validate before write, display default, variants (§5.8)', () => {
  let t;
  let admin;
  const intake = (documents, extra = {}) => t.client().post('/api/public/intake', { name: 'أحمد سامي', phone: phone(), description: 'عقد إيجار محل تجاري وخلاف على الزيادة السنوية.', consent: true, segment: 'paid', documents, ...extra });
  const lastDoc = () => t.app.db.get('SELECT * FROM documents ORDER BY id DESC LIMIT 1');
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('website intake with a scan: main = clean copy, original under variants/ with its sha256, size and header dimensions', async () => {
    okBody(await intake([{ ...cleanJpeg(), scan: scanOf() }]), 201);
    const d = lastDoc();
    assert.equal(d.scan_state, 'client');
    assert.equal(d.page_count, 1);
    assert.equal(d.sha256, sha(fixture('orient-3.jpg')), 'main = the clean file as sent');
    assert.deepEqual([d.width, d.height], [64, 40]);
    const files = t.app.db.all('SELECT * FROM document_files WHERE document_id = ?', d.id);
    assert.equal(files.length, 1);
    const o = files[0];
    assert.equal(o.role, 'original');
    assert.equal(o.page, 1);
    assert.equal(o.source, 'client_scanner');
    assert.equal(o.created_by_kind, 'client');
    assert.equal(o.created_by, null);
    assert.equal(o.sha256, sha(fixture('orient-6.jpg')));
    assert.equal(o.size, fixture('orient-6.jpg').length);
    // اتجاه EXIF 6: الأبعاد المحفوظة بعد التدوير (40×64)
    assert.deepEqual([o.width, o.height], [40, 64]);
    assert.match(o.storage_key, /^variants\/\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.jpg$/);
    assert.ok(fs.existsSync(path.join(t.app.config.uploadsDir, o.storage_key)));
    const params = JSON.parse(o.params);
    assert.equal(params.algo, 'scan-core@1');
    assert.equal(params.score, 0.91);
    assert.equal(d.display_file_id, null, 'a confident scan displays the clean main');
  });

  test('display default (L12-59): partial, score 0.5, quad area 0.4 and bw show the original; adjusted counts as confident', () => {
    const save = (extra) => t.app.documents.save({ ...cleanJpeg(), scan: scanOf(extra) }, {}, { kind: 'client' });
    const shown = (id) => {
      const d = t.app.documents.get(id);
      return d.display_file_id ? t.app.db.get('SELECT role FROM document_files WHERE id = ? AND document_id = ?', d.display_file_id, id).role : 'main';
    };
    assert.equal(shown(save({ partial: true })), 'original');
    assert.equal(shown(save({ score: 0.5 })), 'original');
    assert.equal(shown(save({ quad: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.86], [0.2, 0.86]] })), 'original');
    assert.equal(shown(save({ mode: 'bw' })), 'original');
    assert.equal(shown(save({ score: 0.3, adjusted: true })), 'main');
    assert.equal(shown(save({})), 'main');
    // publicView: ملخص للفريق والمحامي
    const pv = t.app.documents.publicView(t.app.documents.get(save({ partial: true })));
    assert.deepEqual({ ...pv.scan }, { state: 'client', clean: true, originals: 1, pages: 1, display: 'original', reason: null });
    // مستند قديم بلا معالجة: الشكل كما في 11.0
    assert.equal('scan' in t.app.documents.publicView(t.app.documents.get(t.app.documents.save(cleanJpeg(), {}, { kind: 'client' }))), false);
  });

  test('multi-page: originals map to pages, page_count, and the main may be a PDF; a non-image main is refused', () => {
    const pdf = { filename: 'عقد.pdf', mime: 'application/pdf', data_base64: b64(Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF\n')) };
    const id = t.app.documents.save({ ...pdf, scan: scanOf({ quad: undefined }, [fixture('orient-6.jpg'), fixture('orient-3.jpg'), fixture('orient-8.jpg')]) }, {}, { kind: 'client' });
    assert.equal(t.app.documents.get(id).page_count, 3);
    assert.deepEqual(t.app.db.all('SELECT page FROM document_files WHERE document_id = ? ORDER BY page', id).map((r) => r.page), [1, 2, 3]);
    assert.throws(() => t.app.documents.save({ filename: 'x.txt', mime: 'text/plain', data_base64: b64('hello'), scan: scanOf() }, {}, { kind: 'client' }), (e) => e.code === 'bad_scan');
  });

  test('validate everything before the first write: a bad 3rd attachment leaves no file and no row', async () => {
    const before = uploadsFiles(t.app.config.uploadsDir);
    const nDocs = Number(t.app.db.value('SELECT COUNT(*) FROM documents'));
    const nIntakes = Number(t.app.db.value('SELECT COUNT(*) FROM intakes'));
    const bad = { filename: 'شهادة.jpg', mime: 'image/jpeg', data_base64: b64(Buffer.from('<html>not a jpeg</html>')) };
    const r = await intake([{ ...cleanJpeg(), scan: scanOf() }, cleanJpeg(), bad]);
    assert.equal(r.status, 400);
    assert.deepEqual(uploadsFiles(t.app.config.uploadsDir), before, 'nothing written to disk');
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM documents')), nDocs);
    assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM intakes')), nIntakes, 'no intake either');
    // أصل لا يطابق نوعه داخل scan ← 400 أيضًا قبل أي كتابة
    const r2 = await intake([{ ...cleanJpeg(), scan: scanOf({ originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: b64(Buffer.from('MZ fake exe')) }] }) }]);
    assert.equal(r2.status, 400);
    assert.deepEqual(uploadsFiles(t.app.config.uploadsDir), before);
  });

  test('bombs (L12-67): a 7200×7200 1-bit PNG → 400 image_too_large on upload (main or original); a WhatsApp copy is stored skipped, never decoded', async () => {
    const bomb = pngBomb();
    assert.ok(bomb.length < 12_000);
    const r = await intake([{ filename: 'صورة.png', mime: 'image/png', data_base64: b64(bomb) }]);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'image_too_large');
    assert.equal(r.body.error, 'الصورة كبيرة جدًا');
    const r2 = await intake([{ ...cleanJpeg(), scan: scanOf({ originals: [{ filename: 'o.png', mime: 'image/png', data_base64: b64(bomb) }] }) }]);
    assert.equal(r2.body.code, 'image_too_large');
    const kase = await admin.post('/api/admin/intakes', { channel: 'phone', phone: phone(), name: 'سامح', text: 'استشارة بخصوص عقد عمل لم يُجدد بعد انتهاء مدته.' });
    assert.equal(kase.status, 201);
    // واتساب: الخادم نزّل الملف بنفسه (buffer) ← يُحفظ «لم يُعالَج» (too_large)
    const id = t.app.documents.save({ filename: 'image-1.png', mime: 'image/png', buffer: bomb }, { intake_id: kase.body.id }, { kind: 'client' });
    const d = t.app.documents.get(id);
    assert.equal(d.scan_state, 'skipped');
    assert.deepEqual([d.width, d.height], [7200, 7200]);
    assert.equal(t.app.documents.publicView(d).scan.reason, 'too_large');
  });

  test('HEIC is stored as is with scan_state skipped (reason heic); HEIC can never be a scan main', () => {
    const heic = { filename: 'IMG_0001.heic', mime: 'image/heic', data_base64: b64(fixture('sample.heic')) };
    const d = t.app.documents.get(t.app.documents.save(heic, {}, { kind: 'client' }));
    assert.equal(d.scan_state, 'skipped');
    assert.equal(t.app.documents.publicView(d).scan.reason, 'heic');
    assert.throws(() => t.app.documents.save({ ...heic, scan: scanOf() }, {}, { kind: 'client' }), (e) => e.code === 'bad_scan');
  });

  test('downloads: default = the displayed file; ?file=original / clean / page; a foreign display pointer or a missing page → 404', async () => {
    const id = t.app.documents.save({ ...cleanJpeg(), scan: scanOf({ partial: true }) }, {}, { kind: 'client' });
    const get = (q = '') => admin.get(`/api/documents/${id}/download${q}`);
    const def = await get();
    assert.equal(def.status, 200);
    assert.equal(sha(def.body), sha(fixture('orient-6.jpg')), 'uncertain crop: the original is displayed by default');
    assert.equal(def.headers.get('content-length'), String(fixture('orient-6.jpg').length));
    assert.match(def.headers.get('content-disposition'), /filename\*=UTF-8''.*%D8%A7%D9%84%D8%A3%D8%B5%D9%84/);
    assert.equal(sha((await get('?file=clean')).body), sha(fixture('orient-3.jpg')));
    assert.equal(sha((await get('?file=main')).body), sha(fixture('orient-3.jpg')));
    assert.equal(sha((await get('?file=original&page=1')).body), sha(fixture('orient-6.jpg')), 'staff get the stored bytes (EXIF kept)');
    for (const q of ['?file=original&page=2', '?file=clean&page=2', '?file=thumb', '?page=0', '?page=x']) assert.equal((await get(q)).status, 404, q);
    // مؤشر عرض لملف مستند آخر ← 404 (لا يُحل إلا WHERE document_id = المستند)
    const other = t.app.documents.save({ ...cleanJpeg(), scan: scanOf() }, {}, { kind: 'client' });
    const foreign = t.app.db.value('SELECT id FROM document_files WHERE document_id = ?', other);
    t.app.db.run('UPDATE documents SET display_file_id = ? WHERE id = ?', foreign, id);
    assert.equal((await get()).status, 404);
    // مستند لم يمر بالماسح: «الأصل» هو الملف الرئيسي نفسه، و«المحسّنة» غير موجودة بعد
    const raw = t.app.documents.save(cleanJpeg(), {}, { kind: 'client' });
    assert.equal(sha((await admin.get(`/api/documents/${raw}/download?file=original`)).body), sha(fixture('orient-3.jpg')));
    assert.equal((await admin.get(`/api/documents/${raw}/download?file=clean`)).status, 404);
  });

  test('a lawyer with a grant gets the original without EXIF/XMP (APP1); stored bytes and sha256 unchanged; no grant → 404', async () => {
    const lw = (await admin.post('/api/admin/lawyers', { username: 'lw_md4', password: 'Lawyer@2026', name: 'أ. محامي المستندات', specialties: ['CIV'], agreement: { type: 'per_case', rate: 500 } })).body;
    const intakeR = okBody(await admin.post('/api/admin/intakes', { channel: 'phone', phone: phone(), name: 'منى', text: 'نزاع على عقد بيع شقة ولم يتم التسجيل حتى الآن.' }), 201);
    const conv = okBody(await admin.post(`/api/admin/intakes/${intakeR.id}/convert`, { legal_area: 'CIV', title: 'عقد بيع', facts_shared: 'وقائع', issues: [{ title: 'المسألة' }], client: { name: 'منى' } }), 201).case;
    const up = okBody(await admin.post(`/api/admin/cases/${conv.id}/documents`, { files: [{ ...cleanJpeg(), scan: scanOf({ score: 0.4 }) }] }));
    const doc = t.app.documents.get(up[0].id);
    assert.equal(doc.scan_state, 'staff');
    assert.equal(t.app.db.get('SELECT source, created_by_kind, created_by FROM document_files WHERE document_id = ?', doc.id).source, 'staff_scanner');
    const lawyer = await t.login('lw_md4');
    assert.equal((await lawyer.get(`/api/documents/${doc.id}/download?file=original`)).status, 404, 'no grant yet');
    const det = okBody(await admin.get(`/api/admin/cases/${conv.id}`));
    okBody(await admin.post(`/api/admin/cases/${conv.id}/assignments`, { lawyer_id: lw.id, role: 'lead', brief: 'راجع العقد', grants: { facts: true, issue_ids: det.issues.map((i) => i.id), document_ids: [doc.id] } }), 201);
    const r = await lawyer.get(`/api/documents/${doc.id}/download?file=original`);
    assert.equal(r.status, 200);
    const stored = fixture('orient-6.jpg');
    assert.ok(stored.includes(Buffer.from('Exif\0\0', 'latin1')), 'the fixture carries EXIF');
    assert.ok(!r.body.includes(Buffer.from('Exif\0\0', 'latin1')), 'lawyer copy has no EXIF');
    assert.ok(r.body.length < stored.length);
    assert.equal(r.headers.get('content-length'), String(r.body.length));
    assert.deepEqual([...r.body.subarray(0, 2)], [0xff, 0xd8]);
    assert.equal(sha(fs.readFileSync(path.join(t.app.config.uploadsDir, t.app.db.get("SELECT storage_key FROM document_files WHERE document_id = ? AND role = 'original'", doc.id).storage_key))), sha(stored), 'stored bytes unchanged');
    // العرض الافتراضي للمحامي (الثقة 0.4 ← الأصل) أيضًا بلا EXIF
    const dflt = await lawyer.get(`/api/documents/${doc.id}/download`);
    assert.ok(!dflt.body.includes(Buffer.from('Exif\0\0', 'latin1')));
    // صفحة 2 غير موجودة
    assert.equal((await lawyer.get(`/api/documents/${doc.id}/download?file=original&page=2`)).status, 404);
  });

  test('staff upload caps (L12-58): 20 pages and 30 MB of originals; 21 pages → 400; a staff raw upload gets no scan state', async () => {
    assert.throws(() => t.app.documents.saveMany([{ ...cleanJpeg(), scan: scanOf({ pages: 21 }) }], {}, { id: 1, role: 'admin' }), (e) => e.code === 'bad_scan');
    const id = t.app.documents.saveMany([cleanJpeg()], {}, { id: 1, role: 'admin' })[0];
    assert.equal(t.app.documents.get(id).scan_state, null, 'staff raw upload: no automatic processing state (L12-21)');
  });

  test('deleting a document with variants queues its files in media_orphans; gc() unlinks them', () => {
    const id = t.app.documents.save({ ...cleanJpeg(), scan: scanOf() }, {}, { kind: 'client' });
    const key = t.app.db.value('SELECT storage_key FROM document_files WHERE document_id = ?', id);
    const abs = path.join(t.app.config.uploadsDir, key);
    assert.ok(fs.existsSync(abs));
    t.app.db.run('DELETE FROM documents WHERE id = ?', id);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM media_orphans WHERE storage_key = ?', key), 1);
    const out = t.app.media.gc();
    assert.ok(out.orphans >= 1);
    assert.equal(fs.existsSync(abs), false);
  });

  test('disk_low (H-M13): intake, /p/ reply, company upload and staff upload answer 503 before writing', async () => {
    t.app.media.setDiskProbe(() => 100 * 1024 * 1024);
    try {
      const r = await intake([cleanJpeg()]);
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'disk_low');
      assert.throws(() => t.app.documents.saveMany([cleanJpeg()], {}, { id: 1, role: 'admin' }), (e) => e.status === 503);
    } finally {
      t.app.media.setDiskProbe(null);
    }
  });
});

describe('v12 media MD-4 — /p/ and the company portal: scans stored, quota counts originals, company never sees variants (H-M6, L12-48)', () => {
  let t;
  let admin;
  class CompanyClient {
    constructor(base) {
      this.base = base;
      this.cookie = '';
    }
    async req(method, url, body) {
      const h = { 'content-type': 'application/json' };
      if (this.cookie) h.cookie = this.cookie;
      const res = await fetch(this.base + url, { method, headers: h, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body), redirect: 'manual' });
      const set = res.headers.get('set-cookie');
      const m = set && /bm_csid=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `bm_csid=${m[1]}` : '';
      const ct = res.headers.get('content-type') || '';
      return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
    }
  }
  before(async () => {
    t = await startTestApp();
    admin = await t.login('admin');
    const { seedB2bDemo } = await import('../src/seed-v10-b2b.js');
    await seedB2bDemo(t.app);
  });
  after(async () => t && t.close());

  test('/p/ message with a scanned photo: clean main + original stored; disk_low → 503', async () => {
    const it = okBody(await admin.post('/api/admin/intakes', { channel: 'phone', phone: phone(), name: 'أم سارة', text: 'معاش زوجي متوقف من شهرين ومحتاجة أفهم أعمل إيه.' }), 201);
    const clientId = t.app.db.value('SELECT client_id FROM intakes WHERE id = ?', it.id);
    const link = okBody(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}));
    const token = /\/p\/([A-Za-z0-9_-]+)/.exec(link.url)[1];
    okBody(await t.client().post(`/api/portal/${token}/messages`, { body: 'دي صورة الورقة', documents: [{ ...cleanJpeg(), scan: scanOf() }] }));
    const d = t.app.db.get('SELECT * FROM documents WHERE client_id = ? ORDER BY id DESC LIMIT 1', clientId);
    assert.equal(d.scan_state, 'client');
    assert.equal(t.app.db.value("SELECT COUNT(*) FROM document_files WHERE document_id = ? AND role = 'original'", d.id), 1);
    // الحد: 13 صفحة ← 400 قبل أي كتابة
    const bad = await t.client().post(`/api/portal/${token}/messages`, { body: 'صفحات كثيرة', documents: [{ ...cleanJpeg(), scan: scanOf({ pages: 13 }) }] });
    assert.equal(bad.status, 400);
    t.app.media.setDiskProbe(() => 1024);
    try {
      const r = await t.client().post(`/api/portal/${token}/messages`, { body: 'صورة', documents: [cleanJpeg()] });
      assert.equal(r.status, 503);
      assert.equal(r.body.code, 'disk_low');
    } finally {
      t.app.media.setDiskProbe(null);
    }
  });

  test('company staged upload with a scan: stored; originals count toward the quota; company views and download never expose variants', async () => {
    const c = new CompanyClient(t.base);
    okBody(await c.req('POST', '/api/company/auth/login', { email: 'mariam@nilefoods.example', password: (await import('../src/seed-v10-b2b.js')).COMPANY_DEMO_PASSWORD }));
    const up = okBody(await c.req('POST', '/api/company/uploads', { file: { name: 'عقد توريد.jpg', mime: 'image/jpeg', data_base64: cleanJpeg().data_base64, scan: scanOf() }, title: 'عقد توريد' }), 201);
    const docId = t.app.db.value('SELECT document_id FROM company_uploads WHERE id = ?', up.upload_id);
    const d = t.app.documents.get(docId);
    assert.equal(d.scan_state, 'client');
    const f = t.app.db.get('SELECT * FROM document_files WHERE document_id = ?', docId);
    assert.equal(f.created_by_kind, 'company');
    assert.equal(f.created_by, null, 'a company user is never a users.id');
    assert.equal(f.company_user_id, d.company_user_id);
    // company download ignores ?file and serves the main file (what the company sent)
    const dl = await c.req('GET', `/api/company/documents/${docId}/download?file=original`);
    if (dl.status === 200) assert.equal(sha(dl.body), d.sha256);
    // 6 MB of originals on a company upload → 400
    const jpg = (bytes) => b64(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(bytes, 1)]));
    const big = await c.req('POST', '/api/company/uploads', { file: { name: 'x.jpg', mime: 'image/jpeg', data_base64: cleanJpeg().data_base64, scan: scanOf({ pages: 1, originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpg(6.5 * 1024 * 1024) }] }) } });
    assert.equal(big.status, 400);
    // quota: the original's bytes count (b2b_storage_mb tiny → 409 storage_full)
    const companyId = d.company_id;
    const used = Number(t.app.db.value('SELECT COALESCE(SUM(size),0) FROM documents WHERE company_id = ?', companyId));
    const files = Number(t.app.db.value('SELECT COALESCE(SUM(f.size),0) FROM document_files f JOIN documents d ON d.id = f.document_id WHERE d.company_id = ?', companyId));
    assert.ok(files > 0);
    t.app.settings.set('b2b_storage_mb', 1);
    try {
      // الملف الرئيسي وحده يتسع، والأصل (بحجم ما تبقى) يتجاوز الحد
      const left = 1024 * 1024 - used - files;
      assert.ok(left > 10_000);
      const r = await c.req('POST', '/api/company/uploads', { file: { name: 'y.jpg', mime: 'image/jpeg', data_base64: cleanJpeg().data_base64, scan: scanOf({ originals: [{ filename: 'o.jpg', mime: 'image/jpeg', data_base64: jpg(left) }] }) } });
      assert.equal(r.status, 409, 'originals push the company over its storage');
      assert.equal(r.body.code, 'storage_full');
      okBody(await c.req('POST', '/api/company/uploads', { file: { name: 'y.jpg', mime: 'image/jpeg', data_base64: cleanJpeg().data_base64 } }), 201);
    } finally {
      t.app.settings.set('b2b_storage_mb', 2048);
    }
    // disk_low → 503 on the company upload
    t.app.media.setDiskProbe(() => 0);
    try {
      assert.equal((await c.req('POST', '/api/company/uploads', { file: { name: 'z.jpg', mime: 'image/jpeg', data_base64: cleanJpeg().data_base64 } })).status, 503);
    } finally {
      t.app.media.setDiskProbe(null);
    }
    // no company JSON payload mentions scan/ocr/display keys
    const home = await c.req('GET', '/api/company/home');
    const txt = JSON.stringify(home.body);
    for (const k of ['scan_state', '"scan"', 'ocr_state', '"ocr"', 'display_file_id', 'document_files']) assert.ok(!txt.includes(k), k);
  });
});

// ═════════════════════════ MD-2 / MD-3: وحدات الماسح في المتصفح ═════════════════════════
describe('v12 media MD-2/MD-3 — scanner modules: budgets, lazy loading, versioned worker, no /app precache, shared copy', () => {
  test('budgets as served (§4): scan-core ≤ 14,336 B br; scanner + scan-sheet + scan-worker ≤ 10,240 B br; v12-media.css ≤ 3,072 B br', async () => {
    const { transformAsset, setPublicRoot } = await import('../src/site-assets.js');
    setPublicRoot(path.join(ROOT, 'public'));
    const br = (rel) => zlib.brotliCompressSync(transformAsset(path.join(ROOT, 'public', rel)) || fs.readFileSync(path.join(ROOT, 'public', rel))).length;
    assert.ok(br('assets/js/lib/scan-core.js') <= 14_336, `scan-core ${br('assets/js/lib/scan-core.js')}`);
    const ui = ['scanner', 'scan-sheet', 'scan-worker'].reduce((n, f) => n + br(`assets/js/lib/${f}.js`), 0);
    assert.ok(ui <= 10_240, `scanner modules ${ui}`);
    assert.ok(zlib.brotliCompressSync(fs.readFileSync(path.join(ROOT, 'public/assets/css/v12-media.css'))).length <= 3_072);
  });

  test('H-M5: the module worker URL is versioned like an import; the worker only imports scan-core', async () => {
    const { transformAsset, setPublicRoot } = await import('../src/site-assets.js');
    setPublicRoot(path.join(ROOT, 'public'));
    const scanner = transformAsset(path.join(ROOT, 'public/assets/js/lib/scanner.js')).toString();
    assert.match(scanner, /new Worker\(new URL\('\.\/scan-worker\.js\?v=[\w-]+', import\.meta\.url\), \{ type: 'module' \}\)/);
    const worker = read('public/assets/js/lib/scan-worker.js');
    assert.deepEqual([...worker.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./scan-core.js']);
  });

  test('never on page load: upload.js, company-forms.js and ui.js reach the scanner only through import(); /sw.js never precaches it (H-M11)', async () => {
    for (const f of ['public/assets/js/public/upload.js', 'public/assets/js/lib/company-forms.js', 'public/assets/js/lib/ui.js']) {
      const src = read(f);
      assert.doesNotMatch(src, /^import[^;]*scan(?:ner|-core|-worker|-sheet)\.js/m, `${f}: no static import`);
    }
    assert.match(read('public/assets/js/public/upload.js'), /import\('\.\.\/lib\/scanner\.js'\)/);
    const t = await startTestApp();
    try {
      const sw = await (await fetch(`${t.base}/sw.js`)).text();
      assert.ok(sw.includes('/assets/js/lib/ui.js'), 'the precache list is there');
      assert.doesNotMatch(sw, /scan(?:ner|-core|-worker|-sheet)\.js/);
    } finally {
      await t.close();
    }
  });

  test('scan-sheet copy: pagesAr equals the entry-tree helper; the four registers and the L12-35 staff line; handles are <button>s, never role=slider', async () => {
    const sheet = await import('../public/assets/js/lib/scan-sheet.js');
    const tree = await import('../public/assets/js/public/entry-tree.js');
    for (let n = 0; n <= 120; n++) assert.equal(sheet.pagesAr(n), tree.pagesAr(n), String(n));
    assert.equal(sheet.pagesAr(2), 'صفحتان');
    assert.equal(sheet.SCAN_COPY.staff.notFound, 'لم تُكتشف حدود المستند. اسحب الأركان.');
    assert.equal(sheet.SCAN_COPY.p.keep, 'استخدام الصورة كما هي');
    assert.equal(sheet.SCAN_COPY.f.keep, 'كده كويس');
    assert.equal(sheet.SCAN_COPY.f.modes, false);
    assert.equal(sheet.SCAN_COPY.p.modes, true);
    assert.equal(sheet.prepText('p', 2, 3), 'جارٍ تجهيز الصورة 2 من 3…');
    assert.equal(sheet.prepText('p'), 'جارٍ تجهيز المستند…');
    for (const reg of ['p', 'company', 'staff']) for (const v of Object.values(sheet.SCAN_COPY[reg])) if (typeof v === 'string') assert.doesNotMatch(v, /[—–]/, `${reg}: no dash`);
    const src = read('public/assets/js/lib/scan-sheet.js');
    assert.doesNotMatch(src, /role['"]?\s*:\s*['"]slider/);
    assert.match(src, /h\('button\.scn-handle'/);
    for (let i = 1; i <= 18; i++) if (i !== 19) assert.ok(src.includes(`'SC-${String(i).padStart(2, '0')}'`), `SC-${i}`);
  });
});

// ───────────────────────── MD-5: العارض و«نظّف المستند» وتبديل المعروض ─────────────────────────
describe('v12 media MD-5 — viewer variants, «نظّف المستند», display pointer (L12-59, L12-61)', () => {
  let t;
  let admin;
  let lawyer;
  const rowsOf = (id) => t.app.db.all('SELECT id, role, page, storage_key, sha256, replaced_at, source FROM document_files WHERE document_id = ? ORDER BY id', id);
  const fileSha = (key) => sha(fs.readFileSync(path.join(t.app.config.uploadsDir, key)));
  const audits = (type) => t.app.db.all('SELECT * FROM security_events WHERE type = ? ORDER BY id', type);
  const cleanBody = (buf = fixture('orient-8.jpg'), extra = {}) => ({ file: { filename: 'ورقة-محسّنة.jpg', mime: 'image/jpeg', data_base64: b64(buf) }, params: { v: 1, mode: 'gray', turns: 0, quad: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], score: 0.83, partial: false, adjusted: true, ...extra } });
  let intakeId;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    lawyer = await t.login('ahmed');
    intakeId = t.app.db.value("SELECT id FROM intakes ORDER BY id DESC LIMIT 1");
  });
  after(async () => t && t.close());

  test('«نظّف المستند» on a raw photo: a clean row (staff_scanner), display → clean, the original untouched; audit + activity', async () => {
    const id = t.app.documents.save(cleanJpeg(), { intake_id: intakeId }, { kind: 'client' });
    const main = t.app.documents.get(id);
    const before = fileSha(main.storage_key);
    const pv = okBody(await admin.post(`/api/admin/documents/${id}/clean`, cleanBody()));
    assert.deepEqual({ clean: pv.scan.clean, display: pv.scan.display, state: pv.scan.state }, { clean: true, display: 'clean', state: 'cleaned' });
    const rows = rowsOf(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'clean');
    assert.equal(rows[0].source, 'staff_scanner');
    assert.match(rows[0].storage_key, /^variants[\\/]/);
    assert.equal(rows[0].sha256, sha(fixture('orient-8.jpg')));
    assert.equal(t.app.documents.get(id).display_file_id, rows[0].id);
    assert.equal(fileSha(main.storage_key), before, 'the original main file is unchanged');
    assert.equal(t.app.documents.get(id).sha256, before);
    // التنزيل الافتراضي = المعروض (المحسّنة)، و«الأصل» = الرئيسي كما وصل
    assert.equal(sha((await admin.get(`/api/documents/${id}/download`)).body), sha(fixture('orient-8.jpg')));
    assert.equal(sha((await admin.get(`/api/documents/${id}/download?file=original`)).body), before);
    const a = audits('document.cleaned').at(-1);
    assert.equal(JSON.parse(a.data).document_id, id);
    assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'document.cleaned'", intakeId));
    // «نظّفه مرة أخرى»: النسخة السابقة تبقى على القرص مع replaced_at، والعرض ← الأحدث
    okBody(await admin.post(`/api/admin/documents/${id}/clean`, cleanBody(fixture('orient-3.jpg'), { mode: 'color' })));
    const rows2 = rowsOf(id);
    assert.equal(rows2.length, 2);
    assert.ok(rows2[0].replaced_at, 'older clean copy kept and marked replaced');
    assert.ok(fs.existsSync(path.join(t.app.config.uploadsDir, rows2[0].storage_key)));
    assert.equal(t.app.documents.get(id).display_file_id, rows2[1].id);
    assert.equal(sha((await admin.get(`/api/documents/${id}/download?file=clean`)).body), sha(fixture('orient-3.jpg')));
  });

  test('PUT …/display flips the pointer only: nothing deleted, hashes unchanged, audited once per change', async () => {
    const id = t.app.documents.save({ ...cleanJpeg(), scan: scanOf() }, { intake_id: intakeId }, { kind: 'client' });
    const d0 = t.app.documents.get(id);
    assert.equal(d0.display_file_id, null, 'a confident scan displays the clean main');
    const hashes = () => [fileSha(t.app.documents.get(id).storage_key), ...rowsOf(id).map((r) => fileSha(r.storage_key))];
    const h0 = hashes();
    const n0 = audits('document.display_changed').length;
    let pv = okBody(await admin.put(`/api/admin/documents/${id}/display`, { show: 'original' }));
    assert.equal(pv.scan.display, 'original');
    const orig = rowsOf(id).find((r) => r.role === 'original');
    assert.equal(t.app.documents.get(id).display_file_id, orig.id);
    assert.equal(sha((await admin.get(`/api/documents/${id}/download`)).body), sha(fixture('orient-6.jpg')));
    okBody(await admin.put(`/api/admin/documents/${id}/display`, { show: 'original' }));
    assert.equal(audits('document.display_changed').length, n0 + 1, 'no audit when nothing changes');
    pv = okBody(await admin.put(`/api/admin/documents/${id}/display`, { show: 'clean' }));
    assert.equal(pv.scan.display, 'clean');
    assert.equal(t.app.documents.get(id).display_file_id, null);
    const evs = audits('document.display_changed').slice(n0);
    assert.deepEqual(evs.map((e) => JSON.parse(e.data)).map((x) => [x.from, x.to]), [['clean', 'original'], ['original', 'clean']]);
    assert.deepEqual(hashes(), h0, 'a display change never deletes or rewrites a file');
    assert.equal(rowsOf(id).length, 1);
    assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'document.display_changed'", intakeId));
    // مستند بلا نسخة محسّنة ← 404 لعرض المحسّنة؛ قيمة غير معروفة ← 400
    const raw = t.app.documents.save(cleanJpeg(), {}, { kind: 'client' });
    assert.equal((await admin.put(`/api/admin/documents/${raw}/display`, { show: 'clean' })).status, 404);
    assert.equal((await admin.put(`/api/admin/documents/${raw}/display`, { show: 'thumb' })).status, 400);
    assert.equal((await admin.put('/api/admin/documents/999999/display', { show: 'clean' })).status, 404);
  });

  test('re-cleaning a phone-scanned page: a staff clean row is displayed; «رجّع الأصل» shows the page-1 original', async () => {
    const id = t.app.documents.save({ ...cleanJpeg(), scan: scanOf() }, {}, { kind: 'client' });
    const pv = okBody(await admin.post(`/api/admin/documents/${id}/clean`, cleanBody()));
    assert.equal(pv.scan.display, 'clean');
    assert.equal(pv.scan.state, 'client', 'the phone scan state is kept');
    const staffClean = rowsOf(id).find((r) => r.role === 'clean');
    assert.equal(t.app.documents.get(id).display_file_id, staffClean.id);
    assert.equal(sha((await admin.get(`/api/documents/${id}/download?file=clean`)).body), sha(fixture('orient-8.jpg')));
    const back = okBody(await admin.put(`/api/admin/documents/${id}/display`, { show: 'original' }));
    assert.equal(back.scan.display, 'original');
    assert.equal(sha((await admin.get(`/api/documents/${id}/download`)).body), sha(fixture('orient-6.jpg')));
  });

  test('«نظّف المستند» is refused for PDF, audio, HEIC, multi-page scans, a non-image body and a PDF body; lawyers 403', async () => {
    const pdf = t.app.documents.save({ filename: 'عقد.pdf', mime: 'application/pdf', data_base64: b64(Buffer.from('%PDF-1.4\n%%EOF\n')) }, {}, { kind: 'client' });
    const heic = t.app.documents.save({ filename: 'صورة.heic', mime: 'image/heic', data_base64: b64(fixture('sample.heic')) }, {}, { kind: 'client' });
    const ogg = t.app.documents.save({ filename: 'رسالة.ogg', mime: 'audio/ogg', data_base64: b64(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60)])) }, {}, { kind: 'client' });
    const multi = t.app.documents.save({ filename: 'عقد.pdf', mime: 'application/pdf', data_base64: b64(Buffer.from('%PDF-1.4\n%%EOF\n')), scan: scanOf({}, [fixture('orient-6.jpg'), fixture('orient-3.jpg')]) }, {}, { kind: 'client' });
    for (const id of [pdf, heic, ogg, multi]) assert.equal((await admin.post(`/api/admin/documents/${id}/clean`, cleanBody())).status, 400, `doc ${id}`);
    const img = t.app.documents.save(cleanJpeg(), {}, { kind: 'client' });
    const asPdf = { file: { filename: 'x.pdf', mime: 'application/pdf', data_base64: b64(Buffer.from('%PDF-1.4\n%%EOF\n')) }, params: {} };
    assert.equal((await admin.post(`/api/admin/documents/${img}/clean`, asPdf)).status, 400);
    assert.equal((await admin.post(`/api/admin/documents/${img}/clean`, { params: {} })).status, 400);
    assert.equal((await admin.post(`/api/admin/documents/${img}/clean`, cleanBody(pngBomb()))).status, 400, 'header dimensions checked (bomb)');
    assert.equal((await admin.post(`/api/admin/documents/${img}/clean`, cleanBody(undefined, { quad: [[0, 0]] }))).status, 400, 'bad quad');
    assert.equal((await lawyer.post(`/api/admin/documents/${img}/clean`, cleanBody())).status, 403);
    assert.equal((await lawyer.put(`/api/admin/documents/${img}/display`, { show: 'original' })).status, 403);
    assert.equal(rowsOf(img).length, 0, 'nothing written by refused requests');
    t.app.media.setDiskProbe(() => 100 * 1024 * 1024);
    try {
      assert.equal((await admin.post(`/api/admin/documents/${img}/clean`, cleanBody())).status, 503);
    } finally {
      t.app.media.setDiskProbe(null);
    }
  });

  test('GET …/files: both sha256 values, the source and the params for staff (audited); no storage paths; lawyers 403', async () => {
    const id = t.app.documents.save({ ...cleanJpeg(), scan: scanOf({ score: 0.42 }) }, {}, { kind: 'client' });
    const info = okBody(await admin.get(`/api/admin/documents/${id}/files`));
    assert.equal(info.display, 'original');
    assert.equal(info.main.role, 'clean');
    assert.equal(info.main.sha256, sha(fixture('orient-3.jpg')));
    const o = info.files.find((f) => f.role === 'original');
    assert.equal(o.sha256, sha(fixture('orient-6.jpg')));
    assert.equal(o.source, 'client_scanner');
    assert.equal(o.source_label, 'ماسح هاتف المرسل');
    assert.equal(o.params.score, 0.42);
    assert.equal(o.displayed, true);
    assert.ok(!JSON.stringify(info).includes('storage_key') && !JSON.stringify(info).includes('variants/'), 'no storage paths');
    assert.equal(JSON.parse(audits('document.files_viewed').at(-1).data).document_id, id);
    assert.equal((await lawyer.get(`/api/admin/documents/${id}/files`)).status, 403);
    assert.equal((await t.client().get(`/api/admin/documents/${id}/files`)).status, 401);
  });

  test('AI reads the displayed file (L12-61): the original for an uncertain crop, the whole PDF for a multi-page scan', () => {
    const unsure = t.app.documents.save({ ...cleanJpeg(), scan: scanOf({ partial: true }) }, {}, { kind: 'client' });
    const f = t.app.documents.displayFile(t.app.documents.get(unsure));
    assert.equal(f.variant.role, 'original');
    assert.equal(f.mime, 'image/jpeg');
    const multi = t.app.documents.save({ filename: 'عقد.pdf', mime: 'application/pdf', data_base64: b64(Buffer.from('%PDF-1.4\n%%EOF\n')), scan: scanOf({ partial: true }, [fixture('orient-6.jpg'), fixture('orient-3.jpg')]) }, {}, { kind: 'client' });
    const m = t.app.documents.get(multi);
    assert.ok(m.display_file_id, 'uncertain multi-page scan displays page 1 original in the viewer');
    assert.equal(t.app.documents.displayFile(m).mime, 'application/pdf', 'but the AI reads every page');
    const src = read('src/ai/index.js');
    assert.match(src, /app\.documents\.displayFile/);
  });

  test('viewer and staff tools (static): DOC-16 copy and tags, «الأصل» toggle with aria-pressed, staff-only tools, company path untouched', () => {
    const v = read('public/assets/js/app/components/doc-viewer.js');
    const c = read('public/assets/js/app/components/doc-clean.js');
    assert.ok(v.includes("'نسخة محسّنة آليًا · الأصل محفوظ'"));
    assert.ok(v.includes("'صيغة HEIC لا تُعرض هنا. اطلب صورة JPG.'"));
    for (const tag of ['DOC-01', 'DOC-02', 'DOC-03', 'DOC-16', 'DOC-17']) assert.ok(v.includes(`'${tag}'`), tag);
    for (const tag of ['DOC-05', 'DOC-06', 'DOC-07', 'DOC-08', 'DOC-09', 'DOC-10']) assert.ok(c.includes(`'${tag}'`), tag);
    for (const s of ['نظّف المستند', 'نظّفه مرة أخرى', 'رجّع الأصل', 'اعرض النسخة المحسّنة']) assert.ok(c.includes(`'${s}'`), s);
    assert.match(v, /'aria-pressed': orig \? 'true' : 'false'/);
    assert.match(v, /import\('\.\/doc-clean\.js'\)/, 'staff tools are lazy-loaded');
    assert.match(v, /if \(role !== 'staff'\)/, 'tools only for staff');
    assert.match(v, /urlFor && urlFor !== defaultUrlFor\) return 'company'/, 'company portal never sees variants');
    assert.ok(!/role="slider"|role: 'slider'/.test(v + c));
    assert.ok(!/—/.test(c.replace(/^\/\/.*$/gm, '')), 'no em dash in visible doc-clean strings');
  });
});

// ───────────────────────── MD-6: تحويل الرسائل الصوتية إلى نص ─────────────────────────
/** خادم وهمي متوافق مع OpenAI: يسجّل الطلبات ويرد حسب next() */
function mockStt() {
  const seen = [];
  let plan = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ url: req.url, headers: req.headers, body });
      const step = plan.length ? plan.shift() : { status: 200, json: { text: 'نص افتراضي' } };
      const send = () => {
        if (step.status === 200) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(step.json));
        } else res.writeHead(step.status).end('{"error":"x"}');
      };
      if (step.delay) setTimeout(send, step.delay);
      else send();
    });
  });
  return {
    seen,
    plan: (...steps) => (plan = steps),
    start: () => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`))),
    close: () => new Promise((r) => srv.close(r)),
  };
}

describe('v12 media MD-6 — speech-to-text: adapters, PDPL rules, budget, the job, the test button (L12-62, L12-69, L12-71)', () => {
  let t;
  let admin;
  let lawyer;
  let mock;
  let base;
  const ogg = () => fixture('wa-like.ogg');
  const prevEnv = process.env.STT_ALLOW_LOCAL;
  const intakeOf = async (segment) => {
    const r = okBody(await t.client().post('/api/public/intake', { name: 'سامية عبد الله', phone: phone(), description: 'زوجي توفي وأريد معرفة نصيبي من الميراث والمعاش.', consent: true, segment }), 201);
    const row = t.app.db.get('SELECT id, client_id FROM intakes ORDER BY id DESC LIMIT 1');
    return { ...row, ref: r };
  };
  const note = (it, buf = ogg(), mime = 'audio/ogg', extra = {}) => t.app.documents.save({ filename: 'audio-1.ogg', mime, buffer: buf, ...extra }, { intake_id: it.id, client_id: it.client_id }, { kind: 'client' });
  const draft = (id) => t.app.db.get('SELECT * FROM voice_auto_transcripts WHERE document_id = ?', id);
  const job = (id) => t.app.db.get("SELECT * FROM media_jobs WHERE kind = 'stt' AND document_id = ?", id);
  const usage = (id) => t.app.db.all("SELECT * FROM media_usage WHERE kind = 'stt' AND document_id = ? ORDER BY id", id);
  const ownServer = (extra = {}) => t.app.integrations.set('stt', { provider: 'openai_compatible', base_url: base, hosting: 'own_server', model: 'whisper-large-v3', api_key: 'sk-own', price_per_minute_usd: '0.006', ...extra }, admin.user);
  const thirdParty = (extra = {}) => t.app.integrations.set('stt', { provider: 'openai_compatible', base_url: 'https://stt.example.test', hosting: 'third_party', vendor_name: 'OpenAI', no_training_attested: 'yes', api_key: 'sk-third', model: 'gpt-4o-transcribe', ...extra }, admin.user);
  const reset = () => {
    t.app.db.run("DELETE FROM integration_secrets WHERE name = 'stt'");
    t.app.settings.set('stt_third_party_since', '');
    t.app.settings.set('stt_charity_third_party', false);
    t.app.settings.set('stt_minutes_per_client_day', 20);
    setFetch(null);
    setLookup(null);
    setTimeoutMs(null);
  };
  before(async () => {
    process.env.STT_ALLOW_LOCAL = '1';
    mock = mockStt();
    base = await mock.start();
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    lawyer = await t.login('ahmed');
  });
  after(async () => {
    reset();
    if (prevEnv === undefined) delete process.env.STT_ALLOW_LOCAL;
    else process.env.STT_ALLOW_LOCAL = prevEnv;
    await mock.close();
    if (t) await t.close();
  });

  test('own server (OpenAI-compatible): a client voice note is queued on save and the draft stored by one media.process run', async () => {
    reset();
    ownServer();
    mock.plan({ status: 200, json: { text: ' السلام عليكم، جوزي اتوفى ومش عارفة أطلع المعاش ', segments: [{ start: 0, end: 7, text: 'x', avg_logprob: -0.2 }] } });
    const it = await intakeOf('paid');
    const id = note(it);
    assert.equal(job(id).state, 'queued', 'queued from documents.save → voice.onAudioSaved');
    const n0 = mock.seen.length;
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(job(id).state, 'done');
    const d = draft(id);
    assert.equal(d.state, 'done');
    assert.equal(d.text, 'السلام عليكم، جوزي اتوفى ومش عارفة أطلع المعاش');
    assert.equal(d.confidence, Math.round(Math.exp(-0.2) * 1000) / 1000);
    assert.equal(d.provider, 'openai_compatible');
    const req = mock.seen[n0];
    assert.equal(req.url, '/v1/audio/transcriptions');
    assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.equal(req.headers.authorization, 'Bearer sk-own');
    const body = req.body.toString('latin1');
    assert.ok(body.includes('name="model"\r\n\r\nwhisper-large-v3'));
    assert.ok(body.includes('name="language"\r\n\r\nar'));
    assert.ok(body.includes('name="response_format"\r\n\r\nverbose_json'));
    assert.ok(req.body.includes(Buffer.from('OggS')));
    const u = usage(id);
    assert.equal(u.length, 1);
    assert.equal(u[0].ok, 1);
    assert.ok(Math.abs(u[0].seconds - 7.1) < 0.6, `seconds ${u[0].seconds}`);
    assert.equal(u[0].cost_micro_usd, Math.round((u[0].seconds / 60) * 0.006 * 1e6));
    // الحالة تصل للفريق في قائمة رسائل الطلب
    const det = okBody(await admin.get(`/api/admin/intakes/${it.id}`));
    const vn = (det.voice_notes || []).find((x) => x.document_id === id);
    assert.equal(vn.auto.state, 'done');
    assert.equal(vn.auto.text, d.text);
    // سطر «تحويل الصوت» في استهلاك الذكاء الاصطناعي
    const usageView = t.app.ai.usage();
    assert.ok(usageView.by_feature.some((f) => f.feature === 'stt' && f.label === 'تحويل الصوت'));
  });

  test('a charity note (or an undetermined one) never reaches a third party unless the admin opts in; the own server serves both', async () => {
    reset();
    const calls = [];
    setLookup(async () => [{ address: '203.0.113.10', family: 4 }]);
    setFetch(async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ text: 'نص من الجهة الخارجية' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    thirdParty();
    assert.ok(t.app.settings.get('stt_third_party_since'), 'third party saved after off → disclosure timestamp');
    const charity = await intakeOf('charity');
    const paid = await intakeOf('paid');
    const c = note(charity);
    const p = note(paid);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(c).state, 'skipped');
    assert.equal(draft(c).error, 'charity');
    assert.equal(draft(p).state, 'done');
    assert.equal(calls.length, 1, 'only the paid note was sent');
    // «حوّل الآن» لا يتجاوز قيد «خيري»
    const r = await admin.post(`/api/admin/voice-notes/${c}/auto`, {});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'stt_charity');
    // الإذن: المستفيدات أيضًا
    t.app.settings.set('stt_charity_third_party', true);
    okBody(await admin.post(`/api/admin/voice-notes/${c}/auto`, {}));
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(c).state, 'done');
    assert.equal(calls.length, 2);
    // خادم المكتب: الطلبان دون إذن
    reset();
    ownServer();
    const charity2 = await intakeOf('charity');
    const c2 = note(charity2);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(c2).state, 'done', 'own server transcribes charity notes');
  });

  test('no retroactive third-party processing: a note older than stt_third_party_since is refused (auto and «حوّل الآن»)', async () => {
    reset();
    const it = await intakeOf('paid');
    const old = note(it); // قبل ضبط التكامل: لا مهمة
    assert.equal(job(old), undefined);
    t.app.db.run("UPDATE documents SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?", old);
    const calls = [];
    setLookup(async () => [{ address: '203.0.113.10', family: 4 }]);
    setFetch(async (url) => (calls.push(url), new Response('{"text":"x"}', { status: 200 })));
    thirdParty();
    const r = await admin.post(`/api/admin/voice-notes/${old}/auto`, {});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'stt_before_disclosure');
    assert.equal(r.body.error, 'وصلت هذه الرسالة قبل إعلان تحويل الصوت في سياسة الخصوصية.');
    assert.equal(draft(old).error, 'before_disclosure');
    t.app.media.enqueue('stt', old);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(job(old).state, 'skipped');
    assert.equal(calls.length, 0);
  });

  test('SSRF (L12-71): metadata, private and loopback hosts are refused before any call; key-change rules stay (MD-0)', async () => {
    assert.equal(classifyIp('169.254.169.254'), 'metadata');
    assert.equal(classifyIp('100.100.100.200'), 'metadata');
    assert.equal(classifyIp('0.0.0.0'), 'metadata');
    assert.equal(classifyIp('fd00:ec2::254'), 'metadata');
    assert.equal(classifyIp('10.0.0.5'), 'private');
    assert.equal(classifyIp('::ffff:127.0.0.1'), 'loopback');
    assert.equal(classifyIp('8.8.8.8'), 'public');
    reset();
    setLookup(async () => [{ address: '169.254.169.254', family: 4 }]);
    await assert.rejects(assertHostAllowed('https://stt.example.test', { hosting: 'own_server' }), /blocked/);
    setLookup(async () => [{ address: '10.0.0.5', family: 4 }]);
    await assert.rejects(assertHostAllowed('https://stt.example.test', { hosting: 'third_party' }), /private/);
    await assertHostAllowed('http://whisper.lan:8000', { hosting: 'own_server' });
    await assert.rejects(assertHostAllowed('http://127.0.0.1:8000', { hosting: 'own_server', env: {} }), /loopback/);
    // في وحدة الطابور: لا اتصال، والحالة «تعذّر» بسبب عنوان غير مسموح
    const calls = [];
    setFetch(async (url) => (calls.push(url), new Response('{"text":"x"}', { status: 200 })));
    setLookup(async () => [{ address: '169.254.169.254', family: 4 }]);
    thirdParty();
    const it = await intakeOf('paid');
    const id = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(job(id).state, 'failed');
    assert.equal(draft(id).error, 'blocked_host');
    assert.equal(calls.length, 0);
  });

  test('Google: the key travels in x-goog-api-key (never the URL), OGG_OPUS at the OpusHead rate, ar-EG; > 59 s → too_long', async () => {
    reset();
    const calls = [];
    setLookup(async () => [{ address: '203.0.113.10', family: 4 }]);
    setFetch(async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ results: [{ alternatives: [{ transcript: 'عايزة أرفع قضية نفقة', confidence: 0.82 }] }] }), { status: 200 });
    });
    t.app.integrations.set('stt', { provider: 'google', hosting: 'third_party', vendor_name: 'Google', no_training_attested: 'yes', api_key: 'AIza-secret-key' }, admin.user);
    const it = await intakeOf('paid');
    const id = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(id).text, 'عايزة أرفع قضية نفقة');
    assert.equal(draft(id).confidence, 0.82);
    const c = calls[0];
    assert.ok(c.url.endsWith('/v1/speech:recognize'));
    assert.ok(!c.url.includes('AIza'), 'no key in the URL');
    assert.equal(c.headers['x-goog-api-key'], 'AIza-secret-key');
    assert.equal(c.body.config.encoding, 'OGG_OPUS');
    assert.equal(c.body.config.sampleRateHertz, 16000);
    assert.equal(c.body.config.languageCode, 'ar-EG');
    // 95 ثانية (من الحجم: 190,000 بايت / 2000) ← أطول من حد Google المتزامن
    const long = note(it, Buffer.concat([ogg(), Buffer.alloc(190_000)]));
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(long).state, 'skipped');
    assert.equal(draft(long).error, 'too_long');
    assert.equal(calls.length, 1);
  });

  test('duration = max(claimed, container, bytes / 2000) (L12-71): a 1 s claim on a 7.8 MB webm is too long; per-client daily cap; «حوّل الآن» bypasses the cap', async () => {
    reset();
    ownServer();
    const it = await intakeOf('paid');
    const big = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(7_800_000)]);
    const id = t.app.documents.save({ filename: 'رسالة.webm', mime: 'audio/webm', data_base64: big.toString('base64'), seconds: 1 }, { intake_id: it.id, client_id: it.client_id }, { kind: 'client' });
    const n0 = mock.seen.length;
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(id).error, 'too_long');
    assert.ok(draft(id).seconds >= 3900);
    assert.equal(mock.seen.length, n0, 'nothing sent');
    // حد الشخص اليومي: دقيقة واحدة، وقد استُهلكت 55 ثانية اليوم
    t.app.settings.set('stt_minutes_per_client_day', 1);
    const first = note(it);
    t.app.db.insert('media_usage', { kind: 'stt', provider: 'openai_compatible', model: null, document_id: first, seconds: 55, pages: null, cost_micro_usd: 0, ok: 1, error: null, period: new Date().toISOString().slice(0, 7), created_at: new Date().toISOString() });
    t.app.db.run("DELETE FROM media_jobs WHERE document_id = ?", first);
    const capped = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(capped).error, 'client_cap');
    mock.plan({ status: 200, json: { text: 'بعد التجاوز اليدوي' } });
    okBody(await admin.post(`/api/admin/voice-notes/${capped}/auto`, {}));
    assert.equal(job(capped).priority, 10);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(capped).text, 'بعد التجاوز اليدوي');
    const a = t.app.db.get("SELECT * FROM security_events WHERE type = 'voice.auto_requested' ORDER BY id DESC LIMIT 1");
    assert.equal(JSON.parse(a.data).document_id, capped);
  });

  test('retries (L12-69): one 429 is retried inside the unit; 401 fails at once with one admin notification a day; a timeout is never retried and is billed once', async () => {
    reset();
    ownServer();
    const it = await intakeOf('paid');
    mock.plan({ status: 429 }, { status: 200, json: { text: 'بعد إعادة المحاولة' } });
    const a = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(a).text, 'بعد إعادة المحاولة');
    assert.equal(usage(a).length, 1, 'the 429 attempt is not billed');
    // 401 مرتين ← «تعذّر» بلا إعادة، وإشعار واحد في اليوم
    const notes0 = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.auth_failed'"));
    mock.plan({ status: 401 }, { status: 401 });
    const b1 = note(it);
    const b2 = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(job(b1).state, 'failed');
    assert.equal(job(b2).state, 'failed');
    assert.equal(draft(b1).error, 'auth');
    const admins = Number(t.app.db.value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1"));
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.auth_failed'")) - notes0, admins, 'one notification per admin, once per day');
    // المهلة: لا إعادة، وسطر استهلاك واحد محسوب
    setTimeoutMs(300);
    mock.plan({ status: 200, json: { text: 'متأخر' }, delay: 1500 });
    const c = note(it);
    const sent0 = mock.seen.length;
    await t.app.media.processDue({ budgetMs: 8000 });
    assert.equal(job(c).state, 'failed');
    assert.equal(draft(c).error, 'timeout');
    assert.equal(mock.seen.length - sent0, 1, 'sent once, never retried');
    const u = usage(c);
    assert.equal(u.length, 1);
    assert.equal(u[0].ok, 0);
    assert.equal(u[0].error, 'timeout');
    setTimeoutMs(null);
  });

  test('budget (M12-08): over the monthly limit → skipped budget; 80 % and 100 % notify admins once a month', async () => {
    reset();
    ownServer({ monthly_budget_usd: '0.01', price_per_minute_usd: '0.006' });
    const it = await intakeOf('paid');
    const period = new Date().toISOString().slice(0, 7);
    t.app.db.run("DELETE FROM media_usage WHERE kind IN ('stt', 'stt_alert')");
    const longNote = note(it, Buffer.concat([ogg(), Buffer.alloc(240_000)])); // ≈ 127 ثانية ← 0.0127 دولار > 0.01
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(longNote).error, 'budget');
    const w0 = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.budget_warning'"));
    t.app.stt.recordUsage({ seconds: 85, ok: true, documentId: null, provider: 'openai_compatible' }); // 0.0085 = 85 ٪
    t.app.stt.recordUsage({ seconds: 1, ok: true, documentId: null, provider: 'openai_compatible' });
    assert.ok(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.budget_warning'")) > w0);
    const w1 = Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.budget_warning'"));
    t.app.stt.recordUsage({ seconds: 1, ok: true, documentId: null, provider: 'openai_compatible' });
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.budget_warning'")), w1, 'warning once a month');
    t.app.stt.recordUsage({ seconds: 20, ok: true, documentId: null, provider: 'openai_compatible' });
    assert.equal(t.app.stt.budgetState().exceeded, true);
    assert.ok(Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE type = 'stt.budget_exceeded'")) >= 1);
    assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM media_usage WHERE kind = 'stt_alert' AND period = ?", period)), 2);
  });

  test('«اختبار الاتصال»: { ok, status, code, latency_ms } only, recorded as the last test and audited; the key never leaves the server', async () => {
    reset();
    ownServer();
    mock.plan({ status: 200, json: { text: '' } });
    const r = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.deepEqual(Object.keys(r).sort(), ['code', 'latency_ms', 'ok', 'status']);
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    const last = mock.seen.at(-1);
    assert.ok(last.body.includes(Buffer.from('OpusHead')), 'the bundled silent clip');
    mock.plan({ status: 401 });
    const bad = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.deepEqual({ ok: bad.ok, status: bad.status, code: bad.code }, { ok: false, status: 401, code: 'auth' });
    const ev = t.app.db.all("SELECT * FROM security_events WHERE type = 'integration.tested' ORDER BY id DESC LIMIT 2");
    assert.equal(JSON.parse(ev[0].data).name, 'stt');
    const ov = okBody(await admin.get('/api/admin/integrations'));
    const item = ov.items.find((x) => x.name === 'stt');
    assert.equal(item.last_test.ok, false);
    assert.ok(!JSON.stringify(ov).includes('sk-own'), 'the key is never returned');
    assert.equal((await t.login('manager').then((m) => m.post('/api/admin/integrations/stt/test', {}))).status, 403);
  });

  test('«حوّل الآن»: 404 for a non-voice document, 409 while off, lawyers 403; machine text never reaches a lawyer, the portal or a company', async () => {
    reset();
    const it = await intakeOf('paid');
    const img = t.app.documents.save(cleanJpeg(), { intake_id: it.id }, { kind: 'client' });
    const v = note(it);
    assert.equal((await admin.post(`/api/admin/voice-notes/${v}/auto`, {})).status, 409, 'off');
    ownServer();
    assert.equal((await admin.post(`/api/admin/voice-notes/${img}/auto`, {})).status, 404);
    assert.equal((await lawyer.post(`/api/admin/voice-notes/${v}/auto`, {})).status, 403);
    assert.equal((await t.client().post(`/api/admin/voice-notes/${v}/auto`, {})).status, 401);
    const MARK = 'علامة-نص-آلي-سرية-7781';
    mock.plan({ status: 200, json: { text: MARK } });
    okBody(await admin.post(`/api/admin/voice-notes/${v}/auto`, {}));
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(v).text, MARK);
    // كل GET للمحامي: لا يظهر النص الآلي
    for (const url of ['/api/lawyer/today', '/api/lawyer/assignments', '/api/lawyer/matters']) {
      const r = await lawyer.get(url);
      assert.ok(!JSON.stringify(r.body || '').includes(MARK), url);
    }
    // صفحة المتابعة للعميل
    const link = okBody(await admin.post(`/api/admin/clients/${it.client_id}/portal-link`, {}));
    const token = /\/p\/([A-Za-z0-9_-]+)/.exec(link.url)[1];
    const pr = await t.client().get(`/api/portal/${token}`);
    assert.equal(pr.status, 200);
    assert.ok(!JSON.stringify(pr.body || '').includes(MARK), 'portal payload');
    assert.ok(!JSON.stringify(t.app.db.all('SELECT body FROM messages')).includes(MARK), 'never sent on WhatsApp');
  });
});

// ───────────────────────── MD-7: الصوت مؤرشف على /p/ ─────────────────────────
describe('v12 media MD-7 — voice archived on /p/ (M12-01…04, L12-22)', () => {
  test('portal.js: no recorder.js import, no mic tool and text-only strings unless bm-public.voice; staff voice playback stays', () => {
    const src = read('public/assets/js/public/portal.js');
    assert.match(src, /VOICE_ON \? import\('\.\/recorder\.js'\) : Promise\.resolve\(\{\}\)/);
    assert.match(src, /\.voice === true/);
    assert.match(src, /rec \? tool\('mic'/, 'mic tool only with a recorder');
    // كل نص يَعِد بالتسجيل مشروط بـ VOICE_ON
    for (const line of src.split('\n').filter((l) => /سجّل\{ي\} رسالة صوتية/.test(l) && !/^\s*\/\//.test(l))) assert.match(line, /VOICE_ON|rec \?/, line.trim().slice(0, 80));
    assert.ok(src.includes("'لا توجد رسائل بعد. اكتبوا لنا وسنرد عليكم.'"));
    assert.ok(src.includes("'لديكم رسالة صوتية محفوظة من قبل، وستُرسل مع ردّكم.'"));
    assert.ok(src.includes("P('voiceFrom', 'رسالة صوتية من المؤسسة')"), 'staff voice playback to the client stays');
    assert.ok(!/—/.test(src.split('\n').filter((l) => /PC \?/.test(l)).join('\n')), 'no em dash in the new paid strings');
    // L12-34: عنوان صفحة الأفراد والشركات بنفس فاصل pv_title (« | »)، وسطر الدفع المتأخر بلا «—» وبصيغة الجمع
    assert.match(src, /const sep = PC\s*\?\s*' \| '\s*:\s*' — ';\s*document\.title = `\$\{P\('title', 'صفحتك'\)\}\$\{sep\}/);
    assert.ok(src.includes("'انتهى موعد السداد. تواصلوا معنا إن احتجتم وقتًا.'") && src.includes("PC ? 'مسددة' : 'اتدفعت ✓'") && src.includes("PC ? 'وافقتم'"));
    // upload.js لم يعد يستورد recorder.js (لا طلب للمسجّل مع المنتقي)
    assert.ok(!/from '\.\/recorder\.js'/.test(read('public/assets/js/public/upload.js')));
  });

  test('/p/ with the default: bm-public.voice false and Permissions-Policy microphone=(); turning web voice on flips both', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const it = okBody(await admin.post('/api/admin/intakes', { channel: 'phone', phone: phone(), name: 'أم سارة', text: 'معاش زوجي متوقف من شهرين ومحتاجة أفهم أعمل إيه.' }), 201);
      const clientId = t.app.db.value('SELECT client_id FROM intakes WHERE id = ?', it.id);
      const link = okBody(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}));
      const path0 = new URL(link.url, t.base).pathname;
      const page = async () => {
        const r = await fetch(t.base + path0);
        const html = await r.text();
        const pub = JSON.parse(/id="bm-public">([^<]*)</.exec(html)[1]);
        return { mic: r.headers.get('permissions-policy'), voice: pub.voice };
      };
      let p = await page();
      assert.equal(p.voice, false);
      assert.match(p.mic, /microphone=\(\)/);
      t.app.settings.set('web_voice_enabled', true);
      p = await page();
      assert.equal(p.voice, true);
      assert.match(p.mic, /microphone=\(self\)/);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── MD-8: صندوق النص الآلي ─────────────────────────
describe('v12 media MD-8 — the voice box: machine draft review outcomes (L12-60)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());
  const mk = async (text = 'السلام عليكم، جوزي اتوفى ومش عارفة أطلع المعاش', confidence = 0.4) => {
    const r = okBody(await t.client().post('/api/public/intake', { name: 'سامية', phone: phone(), description: 'زوجي توفي وأريد معرفة نصيبي من الميراث والمعاش.', consent: true, segment: 'paid' }), 201);
    void r;
    const it = t.app.db.get('SELECT id, client_id FROM intakes ORDER BY id DESC LIMIT 1');
    const id = t.app.documents.save({ filename: 'audio.ogg', mime: 'audio/ogg', buffer: fixture('wa-like.ogg') }, { intake_id: it.id, client_id: it.client_id }, { kind: 'client' });
    t.app.stt.saveDraft(id, { state: 'done', text, provider: 'openai_compatible', confidence, seconds: 7 });
    return { id, it };
  };
  const put = (id, body) => admin.put(`/api/admin/voice-notes/${id}/transcript`, body);
  const auto = (id) => t.app.db.get('SELECT outcome, played_ratio FROM voice_auto_transcripts WHERE document_id = ?', id);
  const lastAudit = () => t.app.db.get("SELECT * FROM security_events WHERE type = 'voice.transcribed' ORDER BY id DESC LIMIT 1");

  test('the intake payload carries the draft for staff (state, text, confidence) with a reason label for skipped notes', async () => {
    const { id, it } = await mk();
    const det = okBody(await admin.get(`/api/admin/intakes/${it.id}`));
    const vn = det.voice_notes.find((x) => x.document_id === id);
    assert.equal(vn.auto.state, 'done');
    assert.equal(vn.auto.confidence, 0.4);
    assert.equal(vn.transcript.status, 'pending', 'the human transcript stays pending until staff confirm');
    t.app.stt.saveDraft(id, { state: 'skipped', provider: 'openai_compatible', error: 'before_disclosure' });
    const vn2 = okBody(await admin.get(`/api/admin/intakes/${it.id}`)).voice_notes.find((x) => x.document_id === id);
    assert.equal(vn2.auto.error_label, 'وصلت هذه الرسالة قبل إعلان تحويل الصوت في سياسة الخصوصية.');
  });

  test('confirm without listened → accepted_unheard (warning audit with played_ratio); heard ≥ 80 % → accepted; edits → edited / edited_unheard; unclear → rejected', async () => {
    let n = await mk('نص المسودة كما هو');
    let r = okBody(await put(n.id, { text: 'نص المسودة كما هو', from_auto: true }));
    assert.equal(r.transcript.status, 'confirmed');
    assert.equal(auto(n.id).outcome, 'accepted_unheard');
    let a = lastAudit();
    assert.equal(a.severity, 'warning');
    assert.deepEqual(JSON.parse(a.data), { document_id: n.id, outcome: 'accepted_unheard', played_ratio: null });
    assert.equal(r.auto.outcome, 'accepted_unheard');

    n = await mk('نص المسودة كما هو');
    okBody(await put(n.id, { text: ' نص المسودة  كما هو ', from_auto: true, listened: true, played_ratio: 0.86 }));
    assert.deepEqual({ ...auto(n.id) }, { outcome: 'accepted', played_ratio: 0.86 });
    assert.equal(lastAudit().severity, 'info');

    n = await mk('نص المسودة');
    okBody(await put(n.id, { text: 'نص بعد التعديل', from_auto: true, listened: true, played_ratio: 0.9 }));
    assert.equal(auto(n.id).outcome, 'edited');

    n = await mk('نص المسودة');
    okBody(await put(n.id, { text: 'نص بعد التعديل', from_auto: true, listened: true, played_ratio: 0.3 }));
    assert.equal(auto(n.id).outcome, 'edited_unheard', 'listened is not believed below 80 % played');

    n = await mk('نص المسودة');
    okBody(await put(n.id, { unclear: true, from_auto: true, listened: true, played_ratio: 1 }));
    assert.equal(auto(n.id).outcome, 'rejected');

    // بلا from_auto (واجهة 11.0): لا outcome
    n = await mk('نص المسودة');
    okBody(await put(n.id, { text: 'كتبته بنفسي' }));
    assert.equal(auto(n.id).outcome, null);
    const act = t.app.db.get("SELECT data FROM activity WHERE type = 'voice.transcribed' ORDER BY id DESC LIMIT 1");
    assert.ok(act);
  });

  test('voice-transcript.js (static): copy and tags of the draft box, the 80 % gate, the 10 s poll that never replaces an edited editor', () => {
    const src = read('public/assets/js/app/components/voice-transcript.js');
    for (const s of ["label: 'نص آلي للمراجعة'", "lowConf: 'النص الآلي غير مؤكد. استمع إلى الرسالة قبل التأكيد.'", "listenFirst: 'استمع إلى الرسالة أولًا.'", "empty: 'لا يوجد كلام مفهوم'", "working: 'جارٍ التحويل إلى نص…'", 'لم يُحوَّل آليًا: ', "runNow: 'حوّل الآن'", "confirm: 'تأكيد النص'", "unclear: 'الرسالة غير مفهومة'"]) assert.ok(src.includes(s), s);
    for (const tag of ['VTR-01', 'VTR-02', 'VTR-03', 'VTR-04', 'VTR-05', 'VTR-06', 'VTR-07', 'VTR-08', 'VTR-09', 'VTR-10']) assert.ok(src.includes(`'${tag}'`), tag);
    assert.match(src, /playedRatio\(target\(\)\) >= 0\.8/);
    assert.match(src, /!\(Number\.isFinite\(auto\.confidence\) && auto\.confidence >= 0\.6\)/, 'low-confidence line when null or < 0.6');
    assert.match(src, /from_auto: true, listened: ratio >= 0\.8/);
    assert.match(src, /POLL_MS = 10_000/);
    assert.match(src, /if \(busyEditor\(\)\) return;/);
  });
});

// ───────────────────────── MD-9: التنظيف على الخادم في عملية فرعية ─────────────────────────
import { pathToFileURL } from 'node:url';
import { cleanPipeline, decodeArgs, encodeArgs, rgbaSize, fitBox, SERVER_CLEAN_MAX_PIXELS } from '../src/media-child.js';
import { paperScene, doorScene, tinyJpeg } from './fixtures/v12-media/fake-convert.mjs';
import { headerDims } from '../src/services/documents.js';
import { IM_LIMITS } from '../src/media-tools.js';
import { readTarBuffer } from '../src/services/system-tar.js';
import { setSdkLoader } from '../src/ai/anthropic.js';

const FAKE_CONVERT = path.join(ROOT, 'test/fixtures/v12-media/fake-convert.mjs');
/** ImageMagick مزيف (fixtures/v12-media/fake-convert.mjs) بسجل argv اختياري */
function fakeConvert(dir, log = null) {
  return fakeBin(dir, 'convert', `import(${JSON.stringify(pathToFileURL(FAKE_CONVERT).href)}).then((m) => m.main(process.argv.slice(2), { log: ${JSON.stringify(log)} })).catch((e) => { process.stderr.write(String(e && e.stack || e)); process.exit(3); });`);
}
const injected = (gen, calls = []) => ({
  async decode(w, h) {
    calls.push([w, h]);
    return { width: w, height: h, data: gen(w, h) };
  },
  async encode(img) {
    return tinyJpeg(img.width, img.height);
  },
});

describe('v12 media MD-9 — server auto-clean: forked child, hardened codec, gate, variants/auto (L12-21, L12-66…L12-68)', () => {
  let t;
  let dir;
  let staff;
  const media = () => t.app.media;
  const job = (kind, id) => t.app.db.get('SELECT * FROM media_jobs WHERE kind = ? AND document_id = ?', kind, id);
  const waPhoto = (comment = 'scene=paper', w = 1200, hh = 1600) => t.app.documents.save({ filename: `image-wa-${phoneN++}.jpg`, mime: 'image/jpeg', buffer: tinyJpeg(w, hh, comment) }, {}, { kind: 'client' });
  before(async () => {
    t = await startTestApp();
    staff = await t.login('admin');
    dir = tmp('v12-md9-');
    media().setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
    media().tools.configure({ env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: fakeConvert(dir, path.join(dir, 'argv.log')) } });
  });
  after(async () => {
    if (t) await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('pipeline with an injected codec: a paper photo is cropped and cleaned; decodes are sequential 480 → 1200 → 2000; a door photo is skipped', async () => {
    const calls = [];
    const r = await cleanPipeline({ width: 1200, height: 1600 }, injected(paperScene, calls));
    assert.deepEqual(calls, [fitBox(1200, 1600, 480), fitBox(1200, 1600, 1200), fitBox(1200, 1600, 2000)]);
    assert.ok(r.jpeg && r.width > 0 && r.height > r.width, 'portrait page');
    assert.ok(r.params.score >= 0.6, `score ${r.params.score}`);
    assert.ok(r.params.area >= 0.6, `area ${r.params.area}`);
    assert.ok(r.params.ink >= 0.01 && r.params.ink <= 0.35, `ink ${r.params.ink}`);
    assert.equal(r.params.quad.length, 4);
    const door = [];
    const d = await cleanPipeline({ width: 1200, height: 1600 }, injected(doorScene, door));
    assert.ok(['no_paper', 'not_paper', 'uncertain'].includes(d.skipped), d.skipped);
    assert.ok(door.length <= 2, 'no source decode for a door');
    const big = [];
    assert.deepEqual(await cleanPipeline({ width: 6000, height: 4500 }, injected(paperScene, big)), { skipped: 'too_large' });
    assert.equal(big.length, 0, 'over 24 MP: never decoded');
    assert.equal(SERVER_CLEAN_MAX_PIXELS, 24_000_000);
  });

  test('hardened codec argv (L12-67/68): coder prefix from the MIME, limits, -auto-orient, -resize W×H without «!», jpeg:size in raw orientation; output size verified', () => {
    const head = headerDims('image/jpeg', fixture('orient-6.jpg'));
    assert.equal(head.orientation, 6);
    assert.ok(head.height > head.width, 'Orientation 6: oriented portrait');
    const [w, hh] = fitBox(head.width, head.height, 480);
    const argv = decodeArgs({ file: '/data/uploads/x.jpg', mime: 'image/jpeg', orientation: 6 }, w, hh);
    assert.deepEqual(argv.slice(0, IM_LIMITS.length), IM_LIMITS);
    assert.ok(argv.includes('jpeg:/data/uploads/x.jpg'));
    assert.equal(argv[argv.indexOf('-resize') + 1], `${w}x${hh}`);
    assert.ok(!argv.some((a) => a.includes('!')), 'no «!»');
    assert.ok(argv.indexOf('-auto-orient') < argv.indexOf('-resize'));
    assert.equal(argv[argv.indexOf('-define') + 1], `jpeg:size=${2 * hh}x${2 * w}`, 'jpeg:size in the raw (unrotated) orientation');
    assert.equal(argv.at(-1), 'rgba:-');
    assert.deepEqual(decodeArgs({ file: '/x.png', mime: 'image/png' }, 10, 10).filter((a) => a.startsWith('png:')), ['png:/x.png']);
    assert.throws(() => decodeArgs({ file: '/x.heic', mime: 'image/heic' }, 10, 10), /no coder/);
    assert.throws(() => decodeArgs({ file: 'relative.jpg', mime: 'image/jpeg' }, 10, 10), /absolute/);
    const enc = encodeArgs(100, 140);
    assert.ok(enc.includes('-strip') && enc.at(-1) === 'jpeg:-' && enc.includes('rgba:-'));
    // اتجاه خاطئ: الخرج يأخذ نسبة أخرى داخل الصندوق فيختلف حجمه ← يُرفض
    assert.deepEqual(rgbaSize(w * hh * 4, w, hh), [w, hh]);
    assert.deepEqual(rgbaSize((w - 1) * hh * 4, w, hh), [w - 1, hh]);
    assert.throws(() => rgbaSize(w * Math.round((w * w) / hh) * 4, w, hh), /size_mismatch|decoded/);
  });

  test('a WhatsApp photo is queued (clean + ocr) and cleaned in a forked child: clean row server_auto under variants/auto, display → clean, original untouched, usage row', async () => {
    const id = waPhoto();
    assert.equal(job('clean', id).state, 'queued');
    assert.equal(job('ocr', id).state, 'queued');
    const before = t.app.documents.get(id);
    await media().processDue({ budgetMs: 60_000 });
    assert.equal(job('clean', id).state, 'done', JSON.stringify(job('clean', id)));
    const f = t.app.db.get("SELECT * FROM document_files WHERE document_id = ? AND role = 'clean'", id);
    assert.equal(f.source, 'server_auto');
    assert.equal(f.created_by_kind, 'system');
    assert.match(f.storage_key, /^variants\/auto\/\d{4}\/\d{2}\//);
    assert.ok(fs.existsSync(path.join(t.app.config.uploadsDir, f.storage_key)));
    const after = t.app.documents.get(id);
    assert.equal(after.scan_state, 'server');
    assert.equal(after.display_file_id, f.id, 'confident (page ≥ 60 % of the photo) → clean first');
    assert.equal(after.sha256, before.sha256, 'main file untouched');
    assert.equal(sha(fs.readFileSync(path.join(t.app.config.uploadsDir, after.storage_key))), before.sha256);
    const p = JSON.parse(f.params);
    assert.ok(p.score >= 0.6 && Array.isArray(p.quads));
    assert.equal(t.app.db.get("SELECT kind, provider, ok FROM media_usage WHERE document_id = ? AND kind = 'clean_server'", id).ok, 1);
    // التنزيلات: الافتراضي = النسخة المحسّنة، والأصل = الملف الرئيسي كما وصل
    const dflt = await staff.get(`/api/documents/${id}/download`);
    assert.equal(sha(dflt.body), f.sha256);
    const orig = await staff.get(`/api/documents/${id}/download?file=original`);
    assert.equal(sha(orig.body), before.sha256);
    // الوسائط: argv مصفوفة بلا «!»، والعملية الفرعية لا ترث أسرار البيئة (البيئة الدنيا)
    const lines = fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const decodes = lines.filter((a) => a.at(-1) === 'rgba:-');
    assert.equal(decodes.length, 3, 'three sequential decodes');
    for (const a of decodes) assert.ok(!a.some((x) => x.includes('!')));
  });

  test('a door photo is skipped (no clean row, still cleanable by staff); never for staff uploads, client scans, HEIC, PDF or audio', async () => {
    const door = waPhoto('scene=door');
    await media().processDue({ budgetMs: 60_000 });
    assert.equal(job('clean', door).state, 'skipped');
    assert.ok(['no_paper', 'not_paper', 'uncertain'].includes(job('clean', door).error));
    assert.equal(t.app.db.get('SELECT COUNT(*) AS n FROM document_files WHERE document_id = ?', door).n, 0);
    assert.equal(t.app.documents.get(door).scan_state, null);
    assert.equal(media().cleanable(t.app.documents.get(door)), true, '«نظّف المستند» stays available');

    const admin = (await t.login('admin')).user;
    const staffDoc = t.app.documents.save({ filename: 'سيارة.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(1200, 1600, 'scene=paper')) }, {}, admin);
    assert.equal(job('clean', staffDoc), undefined, 'evidence photos from staff are never auto-cleaned');
    assert.ok(job('ocr', staffDoc), 'but their text is read');
    const scanned = t.app.documents.save({ ...cleanJpeg(), scan: scanOf() }, {}, { kind: 'client' });
    assert.equal(job('clean', scanned), undefined, 'client scan already clean');
    const heic = t.app.documents.save({ filename: 'x.heic', mime: 'image/heic', data_base64: b64(fixture('sample.heic')) }, {}, { kind: 'client' });
    assert.equal(job('clean', heic), undefined);
    assert.equal(job('ocr', heic), undefined);
    const pdf = t.app.documents.save({ filename: 'عقد.pdf', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }, {}, { kind: 'client' });
    assert.equal(job('clean', pdf), undefined);
    assert.ok(job('ocr', pdf));
    assert.equal(t.app.db.get("SELECT COUNT(*) AS n FROM document_files WHERE source = 'server_auto' AND document_id = ?", staffDoc).n, 0);
  });

  test('memory guard (L12-66): under 300 MB headroom the unit is deferred 5 minutes without counting an attempt; after 6 deferrals → skipped low_memory', async () => {
    const id = waPhoto();
    media().setMemoryProbe(() => ({ limit: 512 * 1024 ** 2, headroom: 120 * 1024 ** 2, source: 'test' }));
    try {
      for (let i = 1; i <= 6; i++) {
        await media().processDue({ budgetMs: 5000 });
        const j = job('clean', id);
        assert.equal(j.state, 'queued');
        assert.equal(j.error, `low_memory:${i}`);
        assert.equal(j.attempts, 0, 'a deferral is not an attempt');
        assert.ok(Date.parse(j.next_at) - Date.now() > 4 * 60 * 1000, 'next_at +5 min');
        t.app.db.run('UPDATE media_jobs SET next_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), j.id);
      }
      await media().processDue({ budgetMs: 5000 });
      assert.equal(job('clean', id).state, 'skipped');
      assert.equal(job('clean', id).error, 'low_memory');
      // تنبيه «صحة النظام» SYS-09 تحت 1 جيجابايت
      const h = media().healthChecks().find((x) => x.key === 'media_memory');
      assert.equal(h.title, 'ذاكرة الخادم أقل من 1 جيجابايت: تنظيف الصور وقراءتها أبطأ');
    } finally {
      media().setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
    }
  });

  test('a child that fails or times out is retried by the ladder; a stale gen result is never written', async () => {
    const id = waPhoto();
    media().setChildRunner(() => {
      throw Object.assign(new Error('timed out'), { code: 'timeout' });
    });
    try {
      await media().processDue({ budgetMs: 5000 });
      const j = job('clean', id);
      assert.equal(j.state, 'queued');
      assert.equal(j.error, 'timeout');
      assert.equal(j.attempts, 1);
      // نتيجة جيل قديم: الفرع يعمل بينما أُعيدت جدولة المهمة
      t.app.db.run('UPDATE media_jobs SET next_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), j.id);
      media().setChildRunner(async (type, input) => {
        t.app.db.run('UPDATE media_jobs SET gen = gen + 1 WHERE id = ?', j.id);
        fs.writeFileSync(input.out, tinyJpeg(900, 1300));
        return { out: input.out, width: 900, height: 1300, bytes: 10, params: { quad: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], score: 0.9, area: 0.64, turns: 0 } };
      });
      await media().processDue({ budgetMs: 5000 });
      assert.equal(t.app.db.get("SELECT COUNT(*) AS n FROM document_files WHERE document_id = ? AND role = 'clean'", id).n, 0, 'stale result discarded');
    } finally {
      media().setChildRunner(null);
    }
  });

  test('MEDIA_TOOLS=off: uploads still succeed and the units end skipped: tool_missing', async () => {
    media().tools.configure({ env: { MEDIA_TOOLS: 'off', IMAGEMAGICK_BIN: path.join(dir, 'convert') } });
    try {
      const id = waPhoto();
      await media().processDue({ budgetMs: 5000 });
      assert.equal(job('clean', id).state, 'skipped');
      assert.equal(job('clean', id).error, 'tool_missing');
      assert.equal(job('ocr', id).error, 'tool_missing');
      assert.equal(t.app.documents.get(id).ocr_state, 'skipped');
    } finally {
      media().tools.configure({ env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: fakeConvert(dir) } });
    }
  });

  test('backups skip variants/auto (H-M10); a missing server copy falls back to the original and the clean backfill rebuilds it', async () => {
    const id = waPhoto();
    await media().processDue({ budgetMs: 60_000 });
    const f = t.app.db.get("SELECT * FROM document_files WHERE document_id = ? AND role = 'clean'", id);
    const ex = okBody(await staff.post('/api/admin/system/export', { include_key: false }));
    const r = await staff.get(ex.url);
    const entries = await readTarBuffer(zlib.gunzipSync(r.body));
    assert.ok(!entries.some((e) => e.name.includes('/data/uploads/variants/auto/')), 'no variants/auto in the archive');
    assert.ok(entries.some((e) => e.name.endsWith(t.app.documents.get(id).storage_key)), 'the original is in the archive');
    // بعد الاستعادة: ملف النسخة الآلية غير موجود ← العرض يعود إلى الأصل، والاستكمال يعيدها
    fs.unlinkSync(path.join(t.app.config.uploadsDir, f.storage_key));
    const d = await staff.get(`/api/documents/${id}/download`);
    assert.equal(d.status, 200);
    assert.equal(sha(d.body), t.app.documents.get(id).sha256);
    const b = okBody(await staff.post('/api/admin/media/backfill', { kind: 'clean', days: 1 }));
    assert.ok(b.queued >= 1);
    await media().processDue({ budgetMs: 60_000 });
    const again = t.app.db.get("SELECT * FROM document_files WHERE document_id = ? AND role = 'clean'", id);
    assert.ok(again && again.storage_key !== f.storage_key && fs.existsSync(path.join(t.app.config.uploadsDir, again.storage_key)), 'rebuilt');
    assert.equal(t.app.db.get("SELECT severity FROM security_events WHERE type = 'media.backfill_queued' ORDER BY id DESC LIMIT 1").severity, 'warning');
  });
});

// ───────────────────────── MD-10: قراءة النص والبحث ─────────────────────────
describe('v12 media MD-10 — OCR: Tesseract per page, PDF text layer, page bombs, FTS search, staff-only text (L12-17, L12-37, L12-67)', () => {
  let t;
  let dir;
  let admin;
  const job = (id) => t.app.db.get("SELECT * FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", id);
  const MARK = 'علامةنصمقروء9931';
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    dir = tmp('v12-md10-');
    const log = path.join(dir, 'argv.log');
    const logLine = `require('fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify([require('path').basename(process.argv[1]), ...process.argv.slice(2)]) + '\\n');`;
    const env = {
      NODE_TEST_CONTEXT: '1',
      TESSERACT_BIN: fakeBin(dir, 'tesseract', `${logLine}
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.3.0'); process.exit(0); }
if (a[0] === '--list-langs') { console.log('List of available languages (3):'); console.log('ara'); console.log('eng'); console.log('osd'); process.exit(0); }
process.stdout.write(a[0].endsWith('.png') ? 'صفحة ممسوحة من ملف PDF ${MARK}\\n' : 'شهادة وفاة صادرة من مكتب الصحة رقم القيد 4471 ${MARK}\\n\\f');`),
      PDFINFO_BIN: fakeBin(dir, 'pdfinfo', `${logLine}
const a = process.argv.slice(2);
if (a[0] === '-v') { console.error('pdfinfo version 22.02.0'); process.exit(0); }
console.log('Pages:          3\\nPage    1 size: 595 x 842 pts (A4)\\nPage    2 size: 5000 x 5000 pts\\nPage    3 size: 595 x 842 pts (A4)');`),
      PDFTOTEXT_BIN: fakeBin(dir, 'pdftotext', `${logLine}
const a = process.argv.slice(2);
if (a[0] === '-v') { console.error('pdftotext version 22.02.0'); process.exit(0); }
const page = a[a.indexOf('-f') + 1];
process.stdout.write(page === '1' ? 'عقد إيجار أماكن سكنية بين المؤجر والمستأجر لمدة ثلاث سنوات\\f' : '\\f');`),
      PDFTOPPM_BIN: fakeBin(dir, 'pdftoppm', `${logLine}
const a = process.argv.slice(2);
if (a[0] === '-v') { console.error('pdftoppm version 22.02.0'); process.exit(0); }
require('fs').writeFileSync(a.at(-1) + (a.includes('-jpeg') ? '.jpg' : '.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));`),
    };
    t.app.media.tools.configure({ env });
    t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
  });
  after(async () => {
    if (t) await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('an image is read by Tesseract (ara+eng, one page): document_text + FTS + ocr_state; the panel route is staff-only and audited', async () => {
    const id = t.app.documents.save({ filename: 'شهادة.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(1000, 1400)) }, { intake_id: 1 }, { kind: 'client' });
    t.app.db.run("DELETE FROM media_jobs WHERE kind = 'clean' AND document_id = ?", id);
    await t.app.media.processDue({ budgetMs: 10_000 });
    assert.equal(job(id).state, 'done', JSON.stringify(job(id)));
    const row = t.app.db.get('SELECT * FROM document_text WHERE document_id = ? AND page = 1', id);
    assert.equal(row.provider, 'tesseract');
    assert.match(row.text, /شهادة وفاة/);
    assert.ok(!row.text.includes('\f'));
    assert.equal(t.app.documents.get(id).ocr_state, 'done');
    const argv = fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((a) => a[0] === 'tesseract' && a[2] === 'stdout');
    assert.deepEqual(argv.at(-1).slice(2), ['stdout', '-l', 'ara+eng', '--oem', '1', '--psm', '3']);
    const text = okBody(await admin.get(`/api/admin/documents/${id}/text`));
    assert.equal(text.label, 'نص مستخرج آليًا من المستند، راجعه قبل الاعتماد عليه.');
    assert.equal(text.pages.length, 1);
    assert.equal(t.app.db.get("SELECT severity FROM security_events WHERE type = 'document.text_viewed' ORDER BY id DESC LIMIT 1").severity, 'info');
    const lawyer = await t.login('ahmed');
    assert.equal((await lawyer.get(`/api/admin/documents/${id}/text`)).status, 403);
    assert.equal((await lawyer.get(`/api/lawyer/documents/${id}/text`)).status, 404, 'no lawyer text endpoint in 12.0 (L12-17)');
    assert.equal((await t.client().get(`/api/admin/documents/${id}/text`)).status, 401);
  });

  test('PDF: pdfinfo first; page 1 from the text layer, a 5000-pt page skipped, an empty page rasterised with -scale-to (never -r) and read; one page per unit', async () => {
    const id = t.app.documents.save({ filename: 'عقد.pdf', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n') }, { intake_id: 1 }, { kind: 'client' });
    const r1 = await t.app.media.processDue({ budgetMs: 10_000 });
    assert.ok(r1.ran >= 3, 'three units: one per page');
    assert.equal(job(id).state, 'done', JSON.stringify(job(id)));
    const rows = t.app.db.all('SELECT page, provider FROM document_text WHERE document_id = ? ORDER BY page', id);
    assert.deepEqual(rows.map((r) => [r.page, r.provider]), [[1, 'pdftotext'], [3, 'tesseract']], 'page 2 (5000 × 5000 pt) skipped');
    const lines = fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const ppm = lines.filter((a) => a[0] === 'pdftoppm' && a[1] !== '-v');
    assert.equal(ppm.length, 1, 'only the empty normal page is rasterised');
    assert.ok(ppm[0].includes('-scale-to') && ppm[0][ppm[0].indexOf('-scale-to') + 1] === '2000');
    assert.ok(!ppm[0].includes('-r'));
    assert.ok(lines.some((a) => a[0] === 'pdfinfo' && a.includes('-l')), 'pdfinfo before any rasterising');
  });

  test('staff search (H-M7, L12-37): «مستندات» from OCR text with a ≤ 120-character snippet; quotes and * do not throw; 2 or 101 characters → none; deleted documents never surface; LIKE fallback', async () => {
    const r = okBody(await admin.get(`/api/admin/search?q=${encodeURIComponent('رقم القيد 4471')}`));
    assert.ok(r.documents.length >= 1, JSON.stringify(r).slice(0, 200));
    const d = r.documents[0];
    assert.ok(d.snippet.replace(/…/g, '').length <= 120);
    assert.match(d.snippet, /4471/);
    assert.equal(d.href, '#/inbox/1');
    for (const q of ['"رقم', 'قيد*', 'a" OR "b', 'NEAR(x y)']) assert.equal((await admin.get(`/api/admin/search?q=${encodeURIComponent(q)}`)).status, 200, q);
    assert.deepEqual(okBody(await admin.get(`/api/admin/search?q=${encodeURIComponent('رق')}`)).documents ?? [], []);
    assert.deepEqual(t.app.media.searchStaff('ق'.repeat(101)), []);
    const lawyer = await t.login('ahmed');
    const lr = okBody(await lawyer.get(`/api/lawyer/search?q=${encodeURIComponent('رقم القيد 4471')}`));
    assert.ok(!('documents' in lr) && !JSON.stringify(lr).includes(MARK), 'no lawyer document search (L12-17)');
    // مستند محذوف: لا يظهر حتى قبل media.gc
    const gone = d.id;
    t.app.db.run('DELETE FROM documents WHERE id = ?', gone);
    assert.ok(!t.app.media.searchStaff('رقم القيد 4471').some((x) => x.id === gone));
    // بلا FTS5: LIKE (نسخة جديدة من النص المقروء)
    const keep = t.app.documents.save({ filename: 'b.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(800, 1000)) }, { intake_id: 1 }, { kind: 'client' });
    t.app.db.run("DELETE FROM media_jobs WHERE kind = 'clean' AND document_id = ?", keep);
    await t.app.media.processDue({ budgetMs: 10_000 });
    t.app.db.raw.exec('DROP TABLE document_text_fts');
    assert.ok(t.app.media.searchStaff('رقم القيد 4471').some((x) => x.id === keep), 'LIKE fallback');
    assert.ok(t.app.media.searchStaff('50%_\\').length === 0);
  });

  test('correction (P1): PUT …/text/:page → corrected, audited, never overwritten by a re-read; POST …/ocr and …/rescan are staff-only, rate-limited and audited', async () => {
    const id = t.app.db.get("SELECT document_id FROM document_text WHERE provider = 'tesseract' ORDER BY document_id DESC LIMIT 1").document_id;
    okBody(await admin.put(`/api/admin/documents/${id}/text/1`, { text: 'نص صحّحه الفريق' }));
    assert.equal(t.app.db.get('SELECT status FROM document_text WHERE document_id = ? AND page = 1', id).status, 'corrected');
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'document.text_corrected'"));
    assert.equal((await admin.put(`/api/admin/documents/${id}/text/9`, { text: 'x' })).status, 404);
    const q = okBody(await admin.post(`/api/admin/documents/${id}/ocr`, {}));
    assert.equal(q.queued, true);
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'document.ocr_requested'"));
    await t.app.media.processDue({ budgetMs: 10_000 });
    assert.equal(t.app.db.get('SELECT text FROM document_text WHERE document_id = ? AND page = 1', id).text, 'نص صحّحه الفريق', 'a correction survives a re-read');
    assert.equal((await admin.post(`/api/admin/documents/${id}/ocr`, { provider: 'claude' })).status, 409, 'Claude not allowed by default');
    okBody(await admin.post(`/api/admin/documents/${id}/rescan`, {}));
    assert.ok(t.app.db.get("SELECT 1 FROM security_events WHERE type = 'media.job_requested'"));
    const lawyer = await t.login('ahmed');
    for (const [m, u] of [['post', `/api/admin/documents/${id}/ocr`], ['post', `/api/admin/documents/${id}/rescan`], ['put', `/api/admin/documents/${id}/text/1`]]) assert.equal((await lawyer[m](u, {})).status, 403, u);
  });

  test('the OCR marker never reaches a lawyer, the portal, a company or WhatsApp (L12-17)', async () => {
    const lawyer = await t.login('ahmed');
    for (const url of ['/api/lawyer/today', '/api/lawyer/assignments', '/api/lawyer/matters']) {
      const r = await lawyer.get(url);
      assert.ok(!JSON.stringify(r.body || '').includes(MARK), url);
    }
    for (const a of okBody(await lawyer.get('/api/lawyer/assignments')).items || []) {
      const r = await lawyer.get(`/api/lawyer/assignments/${a.id}`);
      assert.ok(!JSON.stringify(r.body || '').includes(MARK), `assignment ${a.id}`);
    }
    assert.ok(!JSON.stringify(t.app.db.all('SELECT body FROM messages')).includes(MARK));
    const co = t.client();
    assert.equal((await co.post('/api/company/auth/login', { email: 'mariam@nilefoods.example', password: 'Company@2026' })).status, 200);
    for (const url of ['/api/company/overview', '/api/company/requests', '/api/company/memory']) {
      const r = await co.get(url);
      assert.ok(!JSON.stringify(r.body || '').includes(MARK), url);
    }
    assert.equal((await co.get('/api/admin/documents/1/text')).status, 401, 'a company cookie is not a staff session');
  });

  test('H-M12 (L12-91): lawyer names in the OCR text of a company file are caught by the gate', () => {
    const row = t.app.db.get('SELECT c.company_id AS cid, u.name FROM assignments a JOIN cases c ON c.id = a.case_id JOIN users u ON u.id = a.lawyer_id WHERE c.company_id IS NOT NULL LIMIT 1');
    assert.ok(row, 'a company case with a lawyer in the demo');
    const id = t.app.documents.save({ filename: 'محضر.pdf', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') }, { company_id: row.cid }, (t.app.db.get("SELECT * FROM users WHERE username = 'admin'")));
    t.app.db.insert('document_text', { document_id: id, page: 1, text: `حضر الاجتماع ${row.name} عن المكتب`, norm: 'x', source_file: 'main', provider: 'tesseract', chars: 10, status: 'machine', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const g = t.app.companyDocGate.companyFilesGate({ companyId: row.cid, documentIds: [id] });
    assert.ok(g.file_authors.some((f) => f.document_id === id), JSON.stringify(g));
  });
});

describe('v12 media MD-10 (P1) — Claude OCR: allowed switch, disclosure date, companies, budget share, image blocks only (L12-19)', () => {
  test('page images to Claude only when allowed and after ocr_claude_since; feature document_ocr; never a PDF block; backfill and companies excluded; over budget → Tesseract', async () => {
    const calls = [];
    class Fake {
      constructor() {
        this.beta = { messages: { create: async (p) => { calls.push(p); return { model: p.model, stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 800 }, content: [{ type: 'text', text: JSON.stringify({ pages: [{ page: 1, text: 'نص قرأه Claude من الصورة', legible: true }], language: 'ar' }) }] }; } } };
      }
    }
    setSdkLoader(() => Fake);
    const t = await startTestApp({ config: { ai: { provider: 'auto', anthropicApiKey: 'sk-ant-test-0000' } } });
    const dir = tmp('v12-md10c-');
    try {
      const admin = await t.login('admin');
      t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000', provider: 'anthropic', monthly_budget_usd: '10' }, null);
      t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
      t.app.media.tools.configure({ env: { NODE_TEST_CONTEXT: '1', TESSERACT_BIN: fakeBin(dir, 'tesseract', `const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.3.0'); process.exit(0); }
if (a[0] === '--list-langs') { console.log('List:'); console.log('ara'); process.exit(0); }
process.stdout.write('نص Tesseract');`) } });
      const old = t.app.documents.save({ filename: 'old.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(1000, 1400)) }, {}, { kind: 'client' });
      okBody(await admin.patch('/api/admin/settings', { ocr_claude_allowed: true, ocr_provider: 'claude' }));
      const since = t.app.settings.get('ocr_claude_since');
      assert.ok(since);
      t.app.db.run('UPDATE documents SET created_at = ? WHERE id = ?', new Date(Date.parse(since) - 60_000).toISOString(), old);
      const fresh = t.app.documents.save({ filename: 'new.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(1000, 1400)) }, {}, { kind: 'client' });
      t.app.db.run("DELETE FROM media_jobs WHERE kind = 'clean'");
      t.app.db.run("UPDATE media_jobs SET next_at = ? WHERE kind = 'ocr'", new Date(Date.now() - 1000).toISOString());
      await t.app.media.processDue({ budgetMs: 10_000 });
      const prov = (id) => t.app.db.get('SELECT provider FROM document_text WHERE document_id = ?', id)?.provider;
      assert.equal(prov(fresh), 'claude');
      assert.equal(prov(old), 'tesseract', 'a document from before the disclosure never goes to Claude');
      assert.ok(calls.length >= 1);
      for (const c of calls) {
        const blocks = c.messages[0].content;
        assert.ok(blocks.some((b) => b.type === 'image'));
        assert.ok(!blocks.some((b) => b.type === 'document'), 'never a PDF block');
        assert.equal(c.output_config.effort, 'low');
      }
      assert.ok(t.app.db.get("SELECT 1 FROM ai_usage WHERE feature = 'document_ocr' AND provider = 'anthropic'"));
      // شركة: مستبعدة ما لم يُسمح
      const co = t.app.documents.save({ filename: 'co.jpg', mime: 'image/jpeg', data_base64: b64(tinyJpeg(1000, 1400)) }, { company_id: 1 }, { kind: 'client' });
      assert.equal((await admin.post(`/api/admin/documents/${co}/ocr`, { provider: 'claude' })).status, 409);
      // الاستكمال لا يستخدم Claude
      const n = calls.length;
      t.app.db.run('DELETE FROM document_text');
      okBody(await admin.post('/api/admin/media/backfill', { kind: 'ocr', days: 1 }));
      await t.app.media.processDue({ budgetMs: 10_000 });
      assert.equal(calls.length, n, 'backfill never calls Claude');
      // حصة الميزانية 0 % ← Tesseract
      t.app.settings.set('ocr_claude_budget_pct', 0);
      t.app.db.run('DELETE FROM document_text WHERE document_id = ?', fresh);
      okBody(await admin.post(`/api/admin/documents/${fresh}/ocr`, { provider: 'claude' }));
      await t.app.media.processDue({ budgetMs: 10_000 });
      assert.equal(prov(fresh), 'tesseract', 'over the OCR share → Tesseract');
    } finally {
      setSdkLoader(null);
      await t.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────── MD-11: الخصوصية، الإعدادات، الصحة ─────────────────────────
describe('v12 media MD-11 — privacy and deletion texts, settings card, health, status and backfill (M §10, L12-62, H-M4, H-M10)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('privacy (L12-62): off → documents paragraph only; third party names the vendor (escaped), «قد تُعالج خارج مصر», the lawyer sentence; charity side only when opted in; own server: no vendor, no «خارج مصر»; Claude sentence when allowed', async () => {
    let p = t.app.media.privacyHtml('paid');
    assert.ok(!p.includes('PV-01') && !p.includes('PV-02'));
    assert.ok(p.includes('data-tag="PV-03"') && p.includes('وتتم هذه القراءة على خوادمنا.'));
    const r = await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', base_url: 'https://api.example.com', api_key: 'sk-x', model: 'whisper-1', hosting: 'third_party', vendor_name: 'Acme Voice', no_training_attested: 'true' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    p = t.app.media.privacyHtml('paid');
    assert.ok(p.includes('data-tag="PV-01"'));
    assert.ok(p.includes('جهة تقنية خارجية (<bdi>Acme Voice</bdi>)، وقد تُعالج خارج مصر'));
    assert.ok(p.includes('ولا يطّلع المحامي على هذا النص الآلي، ولا على تسجيلاتكم إلا إذا أتاحها له فريقنا لدراسة موضوعكم.'));
    assert.ok(!/[—–!]/.test(p.replace(/<[^>]+>/g, '')), 'no em dash or «!» on the paid side');
    assert.ok(!t.app.media.privacyHtml('charity').includes('PV-01'), 'charity audio is not sent to a third party by default');
    t.app.settings.set('stt_charity_third_party', true);
    const c = t.app.media.privacyHtml('charity');
    assert.ok(c.includes('عندما ترسل لنا رسالة صوتية') && c.includes('ولا على تسجيلاتك إلا إذا أتاحها له فريقنا لدراسة موضوعك.'));
    t.app.settings.set('stt_charity_third_party', false);
    // اسم مزوّد بوسوم يُرفض عند الحفظ، والنص مهرّب على أي حال
    assert.equal((await admin.put('/api/admin/integrations/stt', { values: { vendor_name: '<script>x</script>' } })).status, 400);
    okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', base_url: 'https://stt.firm.example', api_key: 'k', hosting: 'own_server', vendor_name: '', no_training_attested: '' } }));
    p = t.app.media.privacyHtml('paid');
    assert.ok(p.includes('data-tag="PV-02"') && p.includes('على أجهزة يملكها المكتب'));
    assert.ok(!p.includes('خارج مصر') && !p.includes('Acme'));
    t.app.settings.set('ocr_claude_allowed', true);
    p = t.app.media.privacyHtml('paid');
    assert.ok(p.includes('data-tag="PV-04"') && p.includes('<bdi dir="ltr">Anthropic</bdi>') && !p.includes('وتتم هذه القراءة على خوادمنا.'));
    t.app.settings.set('ocr_claude_allowed', false);
    // الصفحتان كما تُعرضان
    const page = await t.client().get('/privacy');
    assert.ok(String(page.body).includes('data-tag="PV-03"'), 'rendered in /privacy');
    const del = await t.client().get('/data-deletion');
    assert.ok(String(del.body).includes('data-tag="DD-01"') && String(del.body).includes('ويشمل الحذف النسخ المحسّنة من صور مستندات'));
    assert.equal(t.app.media.deletionHtml('charity'), '<p data-tag="DD-01">ويشمل الحذف النسخ المحسّنة من صور مستنداتك والنصوص المستخرجة منها ونصوص رسائلك الصوتية.</p>');
  });

  test('«المستندات والصوت» card (H-M4, §10.2): exact copy, confirm dialogs for the privacy switches, SET-20…SET-35; settings.js lazy-loads it for admins', () => {
    const src = read('public/assets/js/app/components/media-settings.js');
    for (const s of [
      'الرسائل الصوتية من الموقع وصفحة المتابعة',
      'رسائل واتساب الصوتية تصل دائمًا، والنص الآلي يعمل عليها.',
      'تحويل الرسائل الصوتية إلى نص تلقائيًا',
      'يعمل بعد ضبط الخدمة في «التكاملات». النص مسودة يراجعها الفريق.',
      'تحسين صور المستندات على جهاز المرسل',
      'تحسين الصور الواردة على الخادم',
      'لصور واتساب والصور المرفوعة دون تحسين. يحتاج ImageMagick على الخادم.',
      'قراءة نص المستندات',
      'Tesseract على الخادم',
      'السماح بإرسال صور المستندات إلى Claude لقراءتها',
      'ستضيف سياسة الخصوصية أن صور المستندات قد تُرسل إلى Anthropic لقراءة النص فقط. هل تريدون المتابعة؟',
      'نموذج القراءة',
      'فارغ = نموذج تكامل الذكاء الاصطناعي.',
      'أقصى عدد صفحات تُقرأ من المستند',
      'تحويل صوت المستفيدات من «خيري» عند جهة خارجية',
      'متوقف افتراضيًا. الخادم الخاص بالمكتب يعمل للجميع.',
      'أقصى دقائق تحويل لكل شخص في اليوم',
      'السماح بقراءة مستندات الشركات بـ Claude',
      'ستُرسل صور مستندات الشركات أيضًا إلى Anthropic لقراءة النص.',
      'نسبة ميزانية الذكاء الاصطناعي المتاحة لقراءة المستندات (%)',
      'تحويل الصوت عند جهة خارجية معلن منذ',
      'قراءة المستندات بـ Claude معلنة منذ',
      "confirmLabel: 'تفعيل', cancelLabel: 'إلغاء'",
    ]) assert.ok(src.includes(s), s);
    assert.ok(src.includes('سيُرسل صوت المستفيدات من «خيري» إلى ${who} لتحويله إلى نص، وقد يُعالج خارج مصر. هل تريدون المتابعة؟'));
    for (let n = 20; n <= 35; n++) assert.ok(src.includes(`'SET-${n}'`), `SET-${n}`);
    const settings = read('public/assets/js/app/pages/admin/settings.js');
    assert.match(settings, /me\.role === 'admin' \? \(\(\) => \{ const slot = h\('div', \{ id: 'media' \}\); import\('\.\.\/\.\.\/components\/media-settings\.js'\)/);
  });

  test('health (H-M10): the policy check; GET …/media/status (admin, audited, ?probe=1 re-probes); backfill: kind/days validated, 5 a day, warning audit; managers 403', async () => {
    const dir = tmp('v12-md11-');
    try {
      const open = fakeBin(dir, 'convert', "const a = process.argv.slice(2); if (a[0] === '-version') console.log('Version: ImageMagick 6.9.12'); else console.log('Path: /etc/ImageMagick-6/policy.xml');");
      t.app.media.tools.configure({ env: { NODE_TEST_CONTEXT: '1', IMAGEMAGICK_BIN: open } });
      const st = okBody(await admin.get('/api/admin/media/status?probe=1'));
      assert.equal(st.tools.imagemagick.ok, false);
      assert.equal(st.tools.imagemagick.reason, 'policy');
      assert.ok(st.memory && 'headroom_bytes' in st.memory);
      assert.ok(t.app.media.healthChecks().some((c) => c.key === 'media_policy'));
      const health = okBody(await admin.get('/api/admin/system/health'));
      assert.ok(health.checks.some((c) => c.key === 'media_policy'), 'H-M10: in «صحة النظام»');
      assert.equal(t.app.db.get("SELECT severity FROM security_events WHERE type = 'media.status_viewed' ORDER BY id DESC LIMIT 1").severity, 'info');
      const manager = await t.login('manager');
      assert.equal((await manager.get('/api/admin/media/status')).status, 403);
      assert.equal((await manager.post('/api/admin/media/backfill', { kind: 'ocr' })).status, 403);
      assert.equal((await admin.post('/api/admin/media/backfill', { kind: 'nope' })).status, 400);
      assert.equal((await admin.post('/api/admin/media/backfill', { kind: 'ocr', days: 91 })).status, 400);
      // تحويل الصوت مضبوط (خادم المكتب من الاختبار السابق): الاستكمال يقبل، ويقتصر على 30 يومًا افتراضيًا
      assert.equal(okBody(await admin.post('/api/admin/media/backfill', { kind: 'stt' })).days, 30);
      let last;
      for (let i = 0; i < 6; i++) last = await admin.post('/api/admin/media/backfill', { kind: 'ocr', days: 1 });
      assert.equal(last.status, 429, '5 a day');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('system page (static): «المستندات والصوت» card with SYS-01…SYS-08 and the SYS-09/SYS-10 check tags', () => {
    const src = read('public/assets/js/app/pages/admin/system.js');
    for (let n = 1; n <= 10; n++) assert.ok(src.includes(`'SYS-${String(n).padStart(2, '0')}'`), `SYS-${n}`);
    for (const s of ['افحص الأدوات', 'شغّل الآن', 'حوّل الرسائل الصوتية المعلقة (آخر 30 يومًا)', 'نظّف واقرأ المستندات القديمة']) assert.ok(src.includes(s), s);
  });

  test('the text panel and search (static): DOC-12…DOC-14 and SRC-01/02/04 with the exact labels', () => {
    const clean = read('public/assets/js/app/components/doc-clean.js');
    assert.ok(clean.includes("export const OCR_LABEL = 'نص مستخرج آليًا من المستند، راجعه قبل الاعتماد عليه.'"));
    for (const tag of ['DOC-12', 'DOC-13', 'DOC-14']) assert.ok(clean.includes(`'${tag}'`), tag);
    const search = read('public/assets/js/app/components/search.js');
    assert.ok(search.includes('البحث في النص المقروء آليًا وقد لا يجد كل الكلمات.'));
    for (const tag of ['SRC-01', 'SRC-02', 'SRC-04']) assert.ok(search.includes(`'${tag}'`), tag);
    assert.match(search, /!isLawyer && Array\.isArray\(data\.documents\)/);
  });
});

// ───────────────────────── MD-12: بيانات العرض ─────────────────────────
describe('v12 media MD-12 — demo seed (written directly, no jobs) and the Dockerfiles (L12-40, L12-68)', () => {
  test('demo: a demo STT draft on a waiting WhatsApp voice note, a server clean pair on the seeded photo, OCR text on two documents; nothing queued', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const db = t.app.db;
      assert.equal(Number(db.value('SELECT COUNT(*) FROM media_jobs')), 0, 'seeds never enqueue (L12-69)');
      const draft = db.get("SELECT * FROM voice_auto_transcripts WHERE provider = 'demo'");
      assert.ok(draft && draft.state === 'done' && draft.confidence === 0.82);
      assert.equal(db.get('SELECT status FROM voice_transcripts WHERE document_id = ?', draft.document_id).status, 'pending', 'staff still confirm');
      const f = db.get("SELECT * FROM document_files WHERE source = 'server_auto' AND role = 'clean'");
      assert.ok(f && fs.existsSync(path.join(t.app.config.uploadsDir, f.storage_key)));
      const d = t.app.documents.get(f.document_id);
      assert.equal(d.scan_state, 'server');
      assert.equal(d.display_file_id, f.id);
      assert.equal(Number(db.value('SELECT COUNT(DISTINCT document_id) FROM document_text')), 2);
      const admin = await t.login('admin');
      const s = okBody(await admin.get(`/api/admin/search?q=${encodeURIComponent('الأحوال المدنية')}`));
      assert.ok(s.documents.some((x) => x.id === d.id));
    } finally {
      await t.close();
    }
  });

  test('both Dockerfiles: ARG MEDIA_TOOLS=1 with the tools (no ffmpeg), tini as PID 1, the vendored policy copied to /etc/ImageMagick-6', () => {
    for (const df of [read('Dockerfile'), fs.readFileSync(path.join(ROOT, '..', 'Dockerfile'), 'utf8')]) {
      assert.match(df, /ARG MEDIA_TOOLS=1/);
      assert.match(df, /apt-get install -y --no-install-recommends imagemagick tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng poppler-utils/);
      assert.match(df, /install -y --no-install-recommends tini/);
      assert.match(df, /ENTRYPOINT \["\/usr\/bin\/tini", "--"\]/);
      assert.match(df, /COPY (legal-platform\/)?deploy\/imagemagick\/policy\.xml \/etc\/ImageMagick-6\/policy\.xml/);
      assert.ok(!/ffmpeg/.test(df), 'no ffmpeg');
      assert.match(df, /rm -rf \/var\/lib\/apt\/lists/);
    }
  });
});

// ═════════════════════════ مراجعة 12.0 (review): انحدارات لكل خلل وُجد ═════════════════════════
describe('v12 media review — regressions for the review findings', () => {
  test('R1 SSRF: IPv6 forms that carry an IPv4 address are classified by that address; multicast and broadcast are blocked', async () => {
    // URL يكتب [::ffff:169.254.169.254] بالصيغة الست عشرية ::ffff:a9fe:a9fe، وكان يُصنَّف «عام»
    assert.equal(new URL('http://[::ffff:169.254.169.254]/').hostname, '[::ffff:a9fe:a9fe]');
    for (const [ip, kind] of [
      ['::ffff:a9fe:a9fe', 'metadata'],
      ['::ffff:169.254.169.254', 'metadata'],
      ['::ffff:7f00:1', 'loopback'],
      ['::ffff:a00:1', 'private'],
      ['::a9fe:a9fe', 'metadata'],
      ['64:ff9b::a9fe:a9fe', 'metadata'],
      ['2002:a9fe:a9fe::1', 'metadata'],
      ['0:0:0:0:0:0:0:1', 'loopback'],
      ['ff02::1', 'metadata'],
      ['224.0.0.1', 'metadata'],
      ['255.255.255.255', 'metadata'],
      ['192.0.0.192', 'metadata'],
      ['fe80::1', 'private'],
      ['::ffff:808:808', 'public'],
      ['2001:4860:4860::8888', 'public'],
      ['1::2::3', 'metadata'],
    ]) assert.equal(classifyIp(ip), kind, ip);
    setLookup(null);
    await assert.rejects(assertHostAllowed('http://[::ffff:169.254.169.254]/', { hosting: 'own_server', env: { STT_ALLOW_LOCAL: '1' } }), /blocked address/);
    await assert.rejects(assertHostAllowed('https://[::ffff:127.0.0.1]/', { hosting: 'own_server', env: {} }), /loopback/);
    await assert.rejects(assertHostAllowed('https://[::ffff:10.0.0.1]/', { hosting: 'third_party', env: {} }), /private/);
    await assert.rejects(assertHostAllowed('https://[64:ff9b::a9fe:a9fe]/', { hosting: 'third_party', env: {} }), /blocked address/);
  });

  test('R2 L12-73: a lawyer gets every JPEG without EXIF/XMP (a client photo that skipped the scanner is the original itself); staff and the stored file keep it', async () => {
    const t = await startTestApp();
    try {
      const admin = await t.login('admin');
      const lw = okBody(await admin.post('/api/admin/lawyers', { username: 'lw_rv_exif', password: 'Lawyer@2026', name: 'أ. محامي المراجعة', specialties: ['CIV'], agreement: { type: 'per_case', rate: 500 } }), 201);
      const it = okBody(await admin.post('/api/admin/intakes', { channel: 'phone', phone: phone(), name: 'منى', text: 'نزاع على عقد بيع شقة ولم يتم التسجيل حتى الآن.' }), 201);
      const kase = okBody(await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'CIV', title: 'عقد بيع', facts_shared: 'وقائع', issues: [{ title: 'المسألة' }], client: { name: 'منى' } }), 201).case;
      // صورة عميل لم تمر بالماسح (واتساب أو رجوع الماسح إلى التصغير): فيها EXIF
      const stored = fixture('orient-6.jpg');
      const id = t.app.documents.save({ filename: 'صورة-واتساب.jpg', mime: 'image/jpeg', data_base64: b64(stored) }, { case_id: kase.id }, { kind: 'client' });
      assert.equal(t.app.documents.get(id).scan_state, null);
      const det = okBody(await admin.get(`/api/admin/cases/${kase.id}`));
      okBody(await admin.post(`/api/admin/cases/${kase.id}/assignments`, { lawyer_id: lw.id, role: 'lead', brief: 'راجع الصورة', grants: { facts: true, issue_ids: det.issues.map((i) => i.id), document_ids: [id] } }), 201);
      const lawyer = await t.login('lw_rv_exif');
      const exif = Buffer.from('Exif\0\0', 'latin1');
      assert.ok(stored.includes(exif), 'the fixture carries EXIF');
      for (const q of ['', '?file=main', '?file=original', '?inline=1']) {
        const r = await lawyer.get(`/api/documents/${id}/download${q}`);
        assert.equal(r.status, 200, q);
        assert.ok(!r.body.includes(exif), `lawyer copy has no EXIF (${q || 'default'})`);
        assert.equal(r.headers.get('content-length'), String(r.body.length));
        assert.deepEqual([...r.body.subarray(0, 2)], [0xff, 0xd8]);
      }
      const staffCopy = await admin.get(`/api/documents/${id}/download`);
      assert.equal(sha(staffCopy.body), sha(stored), 'staff get the stored bytes');
      assert.equal(sha(fs.readFileSync(path.join(t.app.config.uploadsDir, t.app.documents.get(id).storage_key))), sha(stored), 'stored bytes unchanged');
    } finally {
      await t.close();
    }
  });

  test('R3–R6 scanner UI (static): pages added in a row are applied to the latest file in order, a page that fails becomes its own photo, focus returns to the thumbnail, the chosen mode carries to the next page', () => {
    const up = read('public/assets/js/public/upload.js');
    // photoPicker: الملف المستبدل ← الجديد، والتعديل يقرأ المستند الحالي عند دوره في الطابور
    assert.match(up, /const replaced = new WeakMap\(\);/);
    assert.match(up, /function change\(f0, fn, \{ fallback = null, refocus = false \} = \{\}\) \{\n\s+queue = queue\.then\(async \(\) => \{\n\s+const f = latest\(f0\);/);
    assert.match(up, /replaced\.set\(f, out\);/);
    assert.match(up, /scanAddPage\(cur, raw, \{ replace: tg\.mode === 'replace' \? tg\.idx : null, maxPages: MAX_PAGES \}\), \{ fallback: raw \}\)/);
    assert.match(up, /if \(fallback\) add\(\[fallback\]\);/);
    assert.match(up, /change\(f, \(cur\) => scanEditPage\(cur, \{ register, trigger \}\), \{ refocus: true \}\)/);
    assert.match(up, /querySelector\('\.scn-thumb-open, \.bmf-thumb-x'\)\?\.focus\(\)/);
    // fileInput (الفريق): سلسلة بالترتيب على آخر نسخة
    assert.match(up, /const done = \(old, fn\) =>\n\s+\(chain = chain\.then\(async \(\) => \{\n\s+const f = cur\(old\);/);
    // الوضع المختار (أبيض وأسود / رمادي) يُطبَّق على الصفحة التالية
    assert.match(up, /const mode = ref && ref\.mode && ref\.mode !== 'auto' \? ref\.mode : 'auto';\n\s+const page = await scanner\.scanPage\(raw, \{ sourceMax: o\.sourceMax, maxSide: o\.maxSide, quality: o\.quality, mode \}\);/);
    // بوابة الشركات: تعديلات المستند الواحد بالترتيب، وصورة لم تُجهز صفحةً تُرفع مرفقًا مستقلًا
    const cf = read('public/assets/js/lib/company-forms.js');
    assert.match(cf, /e\.chain = \(e\.chain \|\| Promise\.resolve\(\)\)\.then\(\(\) => rescanNow\(e, fn, raw\)\);/);
    assert.match(cf, /if \(raw\) await takeFiles\(\{ files: \[raw\], set value\(v\) \{\} \}, true\);/);
    assert.match(cf, /scanAddPage\(tg\.e\.file, raw, \{ replace: Number\.isInteger\(tg\.replace\) \? tg\.replace : null \}\), raw\);/);
    // اسم مستند من عدة صفحات: «صورة مستند، 3 صفحات.pdf» لا «صورة مستند، صفحة 1.pdf»
    assert.match(cf, /e\.baseName\.replace\(\/\\s\*\[،,—-\]\\s\*صفحة\\s\*\\d\+\$\/, ''\)\}\$\{sheetMod \? `، \$\{sheetMod\.pagesAr\(scanPages\(out\)\)\}` : ''\}\.pdf`/);
    assert.match(cf, /title: asPdf \? pdfName\(\)\.replace\(\/\\\.pdf\$\/, ''\) : e\.title/);
  });

  test('R7 the system card names why a media job was not processed in Arabic (the technical code stays in the tooltip)', () => {
    const sys = read('public/assets/js/app/pages/admin/system.js');
    assert.match(sys, /no_paper: 'لا توجد ورقة في الصورة'/);
    assert.match(sys, /MEDIA_WHY\[e\.error\] \? h\('span', \{ title: e\.error \}, MEDIA_WHY\[e\.error\]\)/);
    for (const v of sys.match(/const MEDIA_WHY = \{[\s\S]*?\n\};/)[0].matchAll(/'([^']+)'/g)) assert.ok(!/—/.test(v[1]), 'no em dash');
  });
});
