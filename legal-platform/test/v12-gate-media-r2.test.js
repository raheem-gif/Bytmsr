// v12 gate — media fixer, round 2: SEC-1 (an STT_API_KEY from the environment never goes to a base_url saved in the UI),
// SEC-6 (the STT call connects to the address that was vetted, no second DNS lookup), SEC-3 (lawyer «الأصل» downloads
// lose EXIF/GPS for PNG, WebP and padded JPEG), SEC-4 (big JPEGs decode for OCR; tool exits do not retry), V-14 (OCR text
// direction and Arabic-Indic digits), V-13, JR-09, SEC-7.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { startTestApp } from './helpers.js';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { setFetch, setLookup, setTimeoutMs, pinnedRequest, STT_ENV_KEY_HOST } from '../src/ai/stt.js';
import { parseTesseractTsv, textFromWords, mergeDigits, tidyOcrText, meanConfidence } from '../src/services/ocr-text.js';
import { toolFailure } from '../src/services/media.js';
import { tinyJpeg } from './fixtures/v12-media/fake-convert.mjs';
import { buildPng1 } from '../public/assets/js/lib/scan-core.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = path.join(ROOT, 'test/fixtures/v12-media');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const okBody = (r, status = 200) => {
  assert.equal(r.status, status, `HTTP ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
};
let phoneSeq = 0;
const phone = () => `0101${String(4500000 + ++phoneSeq + (process.pid % 1000) * 100).padStart(7, '0')}`;

/** a tiny OpenAI-compatible server that records each request (and can answer a redirect) */
function mockServer() {
  const seen = [];
  let plan = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      const step = plan.length ? plan.shift() : { status: 200, json: { text: 'نص من الخادم' } };
      if (step.location) res.writeHead(step.status, { location: step.location }).end();
      else if (step.status === 200) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(step.json));
      else res.writeHead(step.status).end('{}');
    });
  });
  return {
    seen,
    plan: (...steps) => (plan = steps),
    start: () => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port))),
    close: () => new Promise((r) => srv.close(r)),
  };
}

describe('v12 gate media r2 — STT key and host (SEC-1, SEC-6)', () => {
  let t;
  let admin;
  let mock;
  let port;
  const saved = {};
  const ENV = ['STT_API_KEY', 'STT_BASE_URL', 'STT_ALLOW_LOCAL', 'STT_PROVIDER'];
  const ogg = () => fs.readFileSync(path.join(FIX, 'wa-like.ogg'));
  const reset = () => {
    t.app.db.run("DELETE FROM integration_secrets WHERE name = 'stt'");
    t.app.settings.set('stt_third_party_since', '');
    delete process.env.STT_API_KEY;
    delete process.env.STT_BASE_URL;
    setFetch(null);
    setLookup(null);
    setTimeoutMs(null);
  };
  const intake = async () => {
    okBody(await t.client().post('/api/public/intake', { name: 'سامية عبد الله', phone: phone(), description: 'زوجي توفي وأريد معرفة نصيبي من الميراث والمعاش.', consent: true, segment: 'paid' }), 201);
    return t.app.db.get('SELECT id, client_id FROM intakes ORDER BY id DESC LIMIT 1');
  };
  const note = (it) => t.app.documents.save({ filename: 'audio-1.ogg', mime: 'audio/ogg', buffer: ogg() }, { intake_id: it.id, client_id: it.client_id }, { kind: 'client' });
  const draft = (id) => t.app.db.get('SELECT * FROM voice_auto_transcripts WHERE document_id = ?', id);
  before(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    process.env.STT_ALLOW_LOCAL = '1';
    delete process.env.STT_PROVIDER;
    mock = mockServer();
    port = await mock.start();
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => {
    if (t) reset();
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await mock.close();
    if (t) await t.close();
  });

  test('SEC-1: with STT_API_KEY in the environment, a base_url typed in the UI is refused and the env key never reaches it', async () => {
    reset();
    process.env.STT_API_KEY = 'sk-ENVKEY-ZZQ-9876';
    const n0 = mock.seen.length;
    // the reviewer's exact request: provider + own server + a new base_url, no api_key in the body
    const r = await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'own_server', base_url: `http://127.0.0.1:${port}` } });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'stt_env_key');
    assert.equal(r.body.error, STT_ENV_KEY_HOST);
    assert.equal(STT_ENV_KEY_HOST, 'المفتاح مضبوط من الخادم؛ غيّر العنوان من الخادم أيضًا.');
    // nothing stored, so the test button has nothing to call
    const tr = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.equal(tr.ok, false);
    assert.equal(mock.seen.length, n0, 'no request reached the new host');
    // the default address (api.openai.com) or a change of other fields is still allowed with the env key
    okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'third_party', vendor_name: 'OpenAI', no_training_attested: 'yes' } }));
    assert.equal(t.app.stt.settings().baseUrl, 'https://api.openai.com');
    assert.equal(t.app.stt.settings().apiKey, 'sk-ENVKEY-ZZQ-9876');
    okBody(await admin.put('/api/admin/integrations/stt', { values: { model: 'whisper-1' } }));
    // switching to an own server address from the UI is refused too
    const r2 = await admin.put('/api/admin/integrations/stt', { values: { hosting: 'own_server', base_url: `http://127.0.0.1:${port}` } });
    assert.equal(r2.status, 400);
    assert.equal(r2.body.code, 'stt_env_key');
  });

  test('SEC-1: a base_url stored before the env key existed never receives it (test button says why; the job sends no Authorization)', async () => {
    reset();
    // saved while no env key was set (a legacy row)
    okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'own_server', base_url: `http://127.0.0.1:${port}`, model: 'whisper-large-v3' } }));
    process.env.STT_API_KEY = 'sk-ENVKEY-ZZQ-9876';
    const s = t.app.stt.settings();
    assert.equal(s.keyWithheld, true);
    assert.equal(s.apiKey, '');
    const n0 = mock.seen.length;
    const tr = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.deepEqual(Object.keys(tr).sort(), ['code', 'latency_ms', 'ok', 'status']);
    assert.equal(tr.ok, false);
    assert.equal(tr.code, 'env_key_host');
    assert.equal(mock.seen.length, n0);
    // the own server still transcribes, but without the server's key
    const it = await intake();
    const id = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(id).state, 'done');
    const req = mock.seen.at(-1);
    assert.equal(req.headers.authorization, undefined, 'no Authorization header on the UI-chosen host');
    assert.ok(!req.body.includes(Buffer.from('ZZQ-9876')));
    for (const x of mock.seen) assert.ok(!String(x.headers.authorization || '').includes('ENVKEY'), 'env key never seen by the mock');
    // the operator sets the address in the environment too → the key goes there
    process.env.STT_BASE_URL = `http://127.0.0.1:${port}`;
    assert.equal(t.app.stt.settings().keyWithheld, false);
    const tr2 = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.equal(tr2.ok, true);
    assert.equal(mock.seen.at(-1).headers.authorization, 'Bearer sk-ENVKEY-ZZQ-9876');
    // the client card knows the new code
    assert.match(read('public/assets/js/app/pages/admin/integrations.js'), /env_key_host: 'المفتاح مضبوط من الخادم؛ غيّر العنوان من الخادم أيضًا'/);
  });

  test('SEC-6: the call connects to the vetted address (the host name is not resolved a second time), Host and SNI keep the name', async () => {
    reset();
    const looked = [];
    // a name that real DNS cannot resolve: if fetch() resolved it again the call would fail with ENOTFOUND
    setLookup(async (host) => (looked.push(host), [{ address: '127.0.0.1', family: 4 }]));
    okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'own_server', base_url: `http://stt-rebind.invalid:${port}`, model: 'whisper-large-v3', api_key: 'sk-own' } }));
    mock.plan({ status: 200, json: { text: 'مرحبا من الخادم المثبّت' } });
    const it = await intake();
    const id = note(it);
    await t.app.media.processDue({ budgetMs: 5000 });
    assert.equal(draft(id).state, 'done', JSON.stringify(draft(id)));
    assert.equal(draft(id).text, 'مرحبا من الخادم المثبّت');
    const req = mock.seen.at(-1);
    assert.equal(req.headers.host, `stt-rebind.invalid:${port}`);
    assert.equal(req.headers.authorization, 'Bearer sk-own');
    assert.match(req.headers['content-type'], /^multipart\/form-data; boundary=/);
    assert.ok(req.body.includes(Buffer.from('name="model"\r\n\r\nwhisper-large-v3')));
    assert.deepEqual(looked, ['stt-rebind.invalid'], 'resolved once, by the check');
    // a rebinding answer for the second lookup is never asked for: the vetted list is what the socket gets
    const r = await pinnedRequest(`http://another-name.invalid:${port}/v1/audio/transcriptions`, { method: 'POST', body: '{}' }, [{ address: '127.0.0.1', family: 4 }]);
    assert.equal(r.status, 200);
    // no vetted address → refused before any socket
    await assert.rejects(pinnedRequest(`http://127.0.0.1:${port}/`, {}, []), /no vetted address/);
  });

  test('SEC-6: redirects are not followed (a 302 to the metadata address stays a failed call)', async () => {
    reset();
    setLookup(async () => [{ address: '127.0.0.1', family: 4 }]);
    okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'own_server', base_url: `http://stt-redirect.invalid:${port}`, api_key: 'sk-own' } }));
    mock.plan({ status: 302, location: 'http://169.254.169.254/latest/meta-data/' });
    const n0 = mock.seen.length;
    const tr = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
    assert.equal(tr.ok, false);
    assert.equal(tr.status, 302);
    assert.equal(tr.code, 'http');
    assert.equal(mock.seen.length - n0, 1, 'one request, no follow-up');
  });

  test('SEC-6: a timeout while waiting for the reply is reported as timeout (not retried)', async () => {
    reset();
    const slow = http.createServer((req, res) => {
      req.resume();
      setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end('{"text":"late"}'), 1500);
    });
    await new Promise((r) => slow.listen(0, '127.0.0.1', r));
    try {
      setTimeoutMs(200);
      const t0 = Date.now();
      await assert.rejects(t.app.stt.transcribe.call(null, {}), /off/);
      setLookup(async () => [{ address: '127.0.0.1', family: 4 }]);
      okBody(await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', hosting: 'own_server', base_url: `http://slow.invalid:${slow.address().port}`, api_key: 'sk-own' } }));
      const tr = okBody(await admin.post('/api/admin/integrations/stt/test', {}));
      assert.equal(tr.code, 'timeout');
      assert.ok(Date.now() - t0 < 1400, 'aborted at the timeout, not at the reply');
    } finally {
      setTimeoutMs(null);
      slow.closeAllConnections?.();
      await new Promise((r) => slow.close(r));
    }
  });
});

// ───────── V-14: Arabic-Indic digits and line direction in the OCR text ─────────
const TSV_HEAD = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const row = (block, par, line, word, x, y, w, h, conf, text) => ['5', '1', block, par, line, word, x, y, w, h, conf, text].join('\t');
/** the reviewer's header line: «رقم القيد: ٤٥٢٨ / ٢٠٢٦» as ara reads it, and as the Arabic script model reads it */
const ARA_TSV = [TSV_HEAD,
  row(1, 1, 1, 1, 313, 120, 33, 28, 96.8, 'رقم'), row(1, 1, 1, 2, 254, 121, 49, 24, 92.1, 'القيد:'), row(1, 1, 1, 3, 200, 121, 44, 19, 41.2, '\u200eEOPA\u200f'),
  row(1, 1, 1, 4, 179, 111, 12, 41, 92.3, '/'), row(1, 1, 1, 5, 130, 121, 115, 19, 58.8, 'دم.م'),
  row(2, 1, 1, 1, 900, 300, 80, 30, 93.1, 'عقد'), row(2, 1, 1, 2, 800, 300, 95, 30, 93.0, 'إيجار'),
  row(2, 1, 2, 1, 900, 350, 70, 30, 91.0, 'الطرف'), row(2, 1, 2, 2, 830, 350, 60, 30, 95.5, 'الأول'), row(2, 1, 2, 3, 760, 350, 40, 30, 71, 'رقم7')].join('\n');
const SCRIPT_TSV = [TSV_HEAD,
  row(1, 1, 1, 1, 313, 120, 33, 28, 90, 'رقم'), row(1, 1, 1, 2, 202, 120, 42, 20, 83.5, '\u200e٤0۲۸\u200f'), row(1, 1, 1, 3, 132, 120, 110, 20, 80.2, '۲۰۲۶'),
  row(2, 1, 2, 2, 832, 350, 58, 30, 88, '١٢'), row(2, 1, 2, 3, 761, 350, 40, 30, 66, '7')].join('\n');

describe('v12 gate media r2 — OCR text (V-14): ara words + Arabic-script digits, tidy text, per-line direction', () => {
  test('pure: TSV parse, digits replace the junk under them (Persian digits → Arabic-Indic), a confident Arabic word is kept', () => {
    assert.equal(parseTesseractTsv('plain text\nno header'), null);
    const a = parseTesseractTsv(ARA_TSV);
    assert.equal(a.length, 10);
    assert.equal(a[2].text, 'EOPA', 'bidi marks dropped');
    const merged = mergeDigits(a, parseTesseractTsv(SCRIPT_TSV));
    const text = tidyOcrText(textFromWords(merged));
    assert.equal(text.split('\n')[0], 'رقم القيد: ٤٥٢٨ / ٢٠٢٦');
    assert.ok(!/EOPA|دم\.م/.test(text));
    assert.match(text, /\n\nعقد إيجار\nالطرف الأول/, 'line and paragraph breaks kept');
    assert.ok(text.includes('الأول'), 'a confident word (95.5) under a digit box is never replaced');
    assert.ok(merged.find((w) => w.text === '٤٥٢٨').digits);
    assert.ok(meanConfidence(a) > 50 && meanConfidence(a) < 95);
    assert.equal(tidyOcrText('\u200eجمہوریة\u200f ۱۲ کتاب\f'), 'جمهورية ١٢ كتاب');
  });

  let t;
  let dir;
  let admin;
  const job = (id) => t.app.db.get("SELECT * FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", id);
  const runAll = async (id) => {
    for (let i = 0; i < 6; i++) {
      const j = job(id);
      if (!j || !['queued', 'running'].includes(j.state)) break;
      t.app.db.run("UPDATE media_jobs SET next_at = ? WHERE document_id = ? AND state = 'queued'", new Date(Date.now() - 1000).toISOString(), id);
      await t.app.media.processDue({ budgetMs: 20_000 });
    }
    return job(id);
  };
  const fake = (name, body) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    return f;
  };
  const logOf = () => (fs.existsSync(path.join(dir, 'argv.log')) ? fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-r2-ocr-'));
    fs.writeFileSync(path.join(dir, 'ara.tsv'), ARA_TSV);
    fs.writeFileSync(path.join(dir, 'script.tsv'), SCRIPT_TSV);
    const english = [TSV_HEAD, ['5', '1', '1', '1', '1', '1', '10', '10', '50', '20', '96', 'SERVICE'].join('\t'), ['5', '1', '1', '1', '1', '2', '70', '10', '80', '20', '95', 'AGREEMENT'].join('\t')].join('\n');
    const garbage = [TSV_HEAD, ['5', '1', '1', '1', '1', '1', '10', '10', '50', '20', '22', 'داعع'].join('\t'), ['5', '1', '1', '1', '1', '2', '70', '10', '80', '20', '31', 'لاع'].join('\t')].join('\n');
    fs.writeFileSync(path.join(dir, 'eng.tsv'), english);
    fs.writeFileSync(path.join(dir, 'garbage.tsv'), garbage);
    const log = JSON.stringify(path.join(dir, 'argv.log'));
    const logLine = `require('fs').appendFileSync(${log}, JSON.stringify([require('path').basename(process.argv[1]), ...process.argv.slice(2)]) + '\\n');`;
    const env = {
      NODE_TEST_CONTEXT: '1',
      TESSERACT_BIN: fake(
        'tesseract',
        `${logLine}
const fs = require('fs');
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.3.4'); process.exit(0); }
if (a[0] === '--list-langs') { console.log('List of available languages (4):\\nArabic\\nara\\neng\\nosd'); process.exit(0); }
const lang = a[a.indexOf('-l') + 1];
const dir = ${JSON.stringify(dir)};
const mode = fs.existsSync(dir + '/mode') ? fs.readFileSync(dir + '/mode', 'utf8') : 'arabic';
const file = mode === 'english' ? (lang === 'eng' ? 'eng.tsv' : 'garbage.tsv') : lang === 'ara' ? 'ara.tsv' : 'script.tsv';
process.stdout.write(fs.readFileSync(dir + '/' + file, 'utf8'));`,
      ),
    };
    t.app.media.tools.configure({ env });
    t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
  });
  after(async () => {
    if (t) await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the job: ara (TSV) then the Arabic script model for digits; stored text has «٤٥٢٨ / ٢٠٢٦», no Latin junk, and a confidence', async () => {
    fs.writeFileSync(path.join(dir, 'mode'), 'arabic');
    const id = t.app.documents.save({ filename: 'عقد.jpg', mime: 'image/jpeg', buffer: tinyJpeg(1000, 1400) }, { intake_id: 1 }, { kind: 'staff' });
    const j = await runAll(id);
    assert.equal(j.state, 'done', JSON.stringify(j));
    const r = t.app.db.get('SELECT * FROM document_text WHERE document_id = ? AND page = 1', id);
    assert.equal(r.provider, 'tesseract');
    assert.equal(r.text.split('\n')[0], 'رقم القيد: ٤٥٢٨ / ٢٠٢٦');
    assert.ok(!/[A-Za-z]/.test(r.text), r.text);
    assert.ok(r.confidence > 0.5 && r.confidence < 1, String(r.confidence));
    const calls = logOf().filter((x) => x[0] === 'tesseract' && x[2] === 'stdout');
    assert.deepEqual(calls.map((x) => x[x.indexOf('-l') + 1]), ['ara', 'Arabic'], 'ara first, then the digits pass; no ara+eng, no eng on a confident Arabic page');
    assert.ok(calls.every((x) => x.at(-1) === 'tsv'));
    // search finds the number in either digit form (the FTS norm folds Arabic-Indic digits)
    assert.ok(t.app.media.searchStaff('4528').some((d) => (d.document_id ?? d.id) === id), 'search 4528');
    assert.ok(t.app.media.searchStaff('٤٥٢٨').some((d) => (d.document_id ?? d.id) === id), 'search ٤٥٢٨');
    const panel = okBody(await admin.get(`/api/admin/documents/${id}/text`));
    assert.equal(panel.pages[0].confidence, r.confidence);
  });

  test('an English page (ara confidence low) is read with eng instead', async () => {
    fs.writeFileSync(path.join(dir, 'mode'), 'english');
    fs.rmSync(path.join(dir, 'argv.log'), { force: true });
    const id = t.app.documents.save({ filename: 'agreement.jpg', mime: 'image/jpeg', buffer: tinyJpeg(1000, 1400) }, { intake_id: 1 }, { kind: 'staff' });
    const j = await runAll(id);
    assert.equal(j.state, 'done', JSON.stringify(j));
    assert.equal(t.app.db.value('SELECT text FROM document_text WHERE document_id = ? AND page = 1', id), 'SERVICE AGREEMENT');
    assert.deepEqual(logOf().filter((x) => x[0] === 'tesseract' && x[2] === 'stdout').map((x) => x[x.indexOf('-l') + 1]), ['ara', 'eng']);
  });

  test('the text panel draws one block per line with its own direction and marks machine-read numbers (source)', () => {
    const src = read('public/assets/js/app/components/doc-clean.js');
    assert.match(src, /export const lineDir = /);
    assert.match(src, /h\('span\.ocr-panel__line', \{ dir \}/);
    assert.match(src, /mark\.ocr-doubt/);
    assert.match(src, /الأرقام والكلمات المظللة غير مؤكدة: طابقها مع الصورة\./);
    assert.match(src, /p\.provider === 'tesseract' && p\.status !== 'corrected'/, 'only machine Tesseract pages are marked');
    const css = read('public/assets/css/v12-media.css');
    assert.match(css, /\.ocr-panel__line\{display:block/);
    assert.match(css, /\.ocr-panel__edit\{[^}]*unicode-bidi:plaintext/);
    assert.ok(zlib.brotliCompressSync(Buffer.from(css)).length <= 3072, 'v12-media.css ≤ 3,072 B br (§4)');
  });

  test('real Tesseract (when installed with Arabic): the lease fixture has no Latin junk and keeps «١١»', { skip: !fs.existsSync('/usr/bin/tesseract') }, async () => {
    const langs = execFileSync('/usr/bin/tesseract', ['--list-langs'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    if (!/^ara$/m.test(langs)) return;
    t.app.media.tools.configure({ env: { NODE_TEST_CONTEXT: '1', TESSERACT_BIN: '/usr/bin/tesseract' } });
    await t.app.media.tools.probe({ force: true });
    const id = t.app.documents.save({ filename: 'عقد-إيجار.jpg', mime: 'image/jpeg', buffer: fs.readFileSync(path.join(FIX, 'ocr-lease-lines.jpg')) }, {}, { kind: 'staff' });
    const j = await runAll(id);
    assert.equal(j.state, 'done', JSON.stringify(j));
    const r = t.app.db.get('SELECT text, confidence FROM document_text WHERE document_id = ? AND page = 1', id);
    assert.ok(!/[A-Za-z]{2,}/.test(r.text), `no Latin junk: ${r.text}`);
    assert.ok(!/[\u200e\u200f]/.test(r.text), 'no bidi marks');
    assert.ok(r.text.includes('١١'), r.text);
    assert.ok(r.confidence > 0.6, String(r.confidence));
    const hits = ['الخميس', 'الموافق', 'الرحمن', 'ويحمل', 'بطاقة', 'السيدة', 'إبراهيم', 'المقيمة', 'النزهة', 'مستأجرة'].filter((w) => r.text.includes(w));
    assert.ok(hits.length >= 8, `words read: ${hits.join('، ')}`);
  });
});

// ───────── SEC-3: a lawyer's «الأصل» download loses EXIF/GPS for PNG, WebP and a padded JPEG too ─────────
const MARK = 'ZZQGPS-30.0444N-31.2357E';
const be32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const le32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
/** JPEG: SOI, APP1 «Exif» with the marker, one stray 0x00 (libjpeg skips it), APP13 + COM with the marker, then the image */
function exifJpeg(base) {
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from(MARK, 'latin1')]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
  const iptc = Buffer.from(`Photoshop 3.0\0${MARK}`, 'latin1');
  const app13 = Buffer.concat([Buffer.from([0xff, 0xed]), Buffer.from([(iptc.length + 2) >> 8, (iptc.length + 2) & 255]), iptc]);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([(MARK.length + 2) >> 8, (MARK.length + 2) & 255]), Buffer.from(MARK, 'latin1')]);
  const app12 = Buffer.concat([Buffer.from([0xff, 0xec]), Buffer.from([0, MARK.length + 7]), Buffer.from(`Ducky${MARK}`, 'latin1')]);
  // a phone's MPF secondary image appended after the primary EOI, with its own EXIF
  const tail = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])]);
  return Buffer.concat([base.subarray(0, 2), app1, Buffer.from([0x00]), app13, app12, com, base.subarray(2), tail]);
}
/** PNG: eXIf + tEXt + iTXt with the marker after IHDR */
function exifPng(base) {
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    return Buffer.concat([be32(data.length), td, be32(zlib.crc32 ? zlib.crc32(td) : 0)]);
  };
  const ihdrEnd = 8 + 12 + base.readUInt32BE(8);
  return Buffer.concat([base.subarray(0, ihdrEnd), chunk('eXIf', Buffer.from(`MM\0*${MARK}`, 'latin1')), chunk('tEXt', Buffer.from(`GPS\0${MARK}`, 'latin1')), chunk('iTXt', Buffer.from(`XML:com.adobe.xmp\0\0\0\0\0${MARK}`, 'latin1')), base.subarray(ihdrEnd)]);
}
/** WebP: VP8X (EXIF + XMP flags) + the VP8L image + EXIF and XMP chunks with the marker */
function exifWebp(vp8l) {
  const img = vp8l.subarray(12);
  const w = 1;
  const h = 1;
  const vp8x = Buffer.concat([Buffer.from('VP8X', 'latin1'), le32(10), Buffer.from([0x0c, 0, 0, 0]), Buffer.from([(w - 1) & 255, 0, 0, (h - 1) & 255, 0, 0])]);
  const pad = (b) => (b.length & 1 ? Buffer.concat([b, Buffer.from([0])]) : b);
  const exif = Buffer.concat([Buffer.from('EXIF', 'latin1'), le32(MARK.length + 4), pad(Buffer.from(`MM\0*${MARK}`, 'latin1'))]);
  const xmp = Buffer.concat([Buffer.from('XMP ', 'latin1'), le32(MARK.length), pad(Buffer.from(MARK, 'latin1'))]);
  const body = Buffer.concat([vp8x, img, exif, xmp]);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), le32(body.length + 4), Buffer.from('WEBP', 'latin1'), body]);
}

describe('v12 gate media r2 — metadata stripped from every image a lawyer downloads (SEC-3)', async () => {
  const { stripJpegApp1, stripPngMeta, stripWebpMeta, stripImageMetadata } = await import('../src/services/documents.js');
  const has = (buf) => Buffer.from(buf).includes(Buffer.from(MARK, 'latin1'));
  const realJpeg = () => (fs.existsSync('/usr/bin/convert') ? execFileSync('/usr/bin/convert', ['-size', '16x12', 'xc:#c8b48c', 'jpeg:-']) : tinyJpeg(16, 12));
  const realPng = () => (fs.existsSync('/usr/bin/convert') ? execFileSync('/usr/bin/convert', ['-size', '16x12', 'xc:#c8b48c', 'png:-']) : Buffer.from(buildPng1(zlib.deflateSync(Buffer.alloc(16 * 12 / 8 + 12)), 16, 12)));

  test('pure: JPEG (stray byte after APP1, APP13, COM), PNG (eXIf/tEXt/iTXt), WebP (EXIF/XMP + VP8X flags) all lose the marker', () => {
    const j = exifJpeg(realJpeg());
    assert.ok(has(j));
    const js = stripJpegApp1(j);
    assert.ok(js, 'the stray 0x00 is skipped like libjpeg does, not a reason to send the file as is');
    assert.ok(!has(js));
    assert.equal(js[0], 0xff);
    assert.equal(js[1], 0xd8);
    assert.equal(js.at(-2), 0xff);
    assert.equal(js.at(-1), 0xd9);
    assert.equal(js.indexOf(Buffer.from([0xff, 0xd8]), 2), -1, 'nothing after the first image (MPF secondary images carry their own EXIF)');
    const p = exifPng(realPng());
    const ps = stripPngMeta(p);
    assert.ok(ps && !has(ps));
    assert.ok(!/eXIf|tEXt|iTXt/.test(ps.toString('latin1')));
    assert.match(ps.toString('latin1'), /IHDR[\s\S]*IDAT[\s\S]*IEND/);
    const wb = exifWebp(fs.readFileSync(path.join(FIX, 'lossless.webp')));
    const ws = stripWebpMeta(wb);
    assert.ok(ws && !has(ws));
    assert.equal(ws.readUInt32LE(4), ws.length - 8, 'RIFF size fixed');
    assert.equal(ws.toString('latin1', 12, 16), 'VP8X');
    assert.equal(ws[20] & 0x0c, 0, 'EXIF and XMP flags cleared');
    assert.ok(ws.includes(Buffer.from('VP8L', 'latin1')));
    // anything else (HEIC, a broken structure) → null: the caller refuses instead of sending it unstripped
    assert.equal(stripImageMetadata('image/heic', Buffer.from('....ftypheic')), null);
    assert.equal(stripImageMetadata('image/png', Buffer.from('not a png')), null);
    assert.equal(stripJpegApp1(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null);
  });

  test('real decoders still open the stripped files (ImageMagick, when installed)', { skip: !fs.existsSync('/usr/bin/identify') }, () => {
    const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-sec3-'));
    try {
      for (const [ext, buf] of [['jpg', stripJpegApp1(exifJpeg(realJpeg()))], ['png', stripPngMeta(exifPng(realPng()))]]) {
        const f = path.join(tmpd, `x.${ext}`);
        fs.writeFileSync(f, buf);
        const out = execFileSync('/usr/bin/identify', ['-format', '%w %h', f], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        assert.equal(out.trim(), '16 12', ext);
      }
    } finally {
      fs.rmSync(tmpd, { recursive: true, force: true });
    }
  });

  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
  });
  after(async () => {
    if (t) await t.close();
  });
  const fakeRes = () => ({
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b) {
      this.body = b;
    },
  });

  test('downloadVariant for a lawyer: «الأصل» of a scanned JPEG/PNG/WebP has no marker; staff get the stored bytes; HEIC is refused for the lawyer', async () => {
    const lawyer = { id: 3, role: 'lawyer' };
    const scanFor = (mime, buf) => {
      const main = Buffer.from(stripImageMetadata(mime, buf) || buf);
      return t.app.documents.save({ filename: `مستند.${mime.split('/')[1]}`, mime, buffer: main }, { case_id: 1 }, { kind: 'staff' });
    };
    for (const [mime, buf] of [['image/jpeg', exifJpeg(realJpeg())], ['image/png', exifPng(realPng())], ['image/webp', exifWebp(fs.readFileSync(path.join(FIX, 'lossless.webp')))]]) {
      const id = scanFor(mime, buf);
      // the original row (a scanned page's untouched photo) holds the marker on disk
      const key = `variants/sec3-${id}.${mime.split('/')[1]}`;
      fs.mkdirSync(path.join(t.app.config.uploadsDir, 'variants'), { recursive: true });
      fs.writeFileSync(path.join(t.app.config.uploadsDir, key), buf);
      t.app.db.insert('document_files', { document_id: id, role: 'original', page: 1, storage_key: key, mime, size: buf.length, sha256: 'x', width: 16, height: 12, source: 'staff_scanner', params: null, created_by_kind: 'staff', created_by: null, company_user_id: null, replaced_at: null, created_at: new Date().toISOString() });
      t.app.db.run("UPDATE documents SET scan_state = 'staff' WHERE id = ?", id);
      const doc = t.app.documents.get(id);
      const res = fakeRes();
      t.app.media.downloadVariant(doc, lawyer, { file: 'original', res });
      assert.ok(res.body, mime);
      assert.ok(!has(res.body), `${mime}: no EXIF/GPS for the lawyer`);
      assert.equal(Number(res.headers['content-length']), res.body.length);
      assert.ok(has(fs.readFileSync(path.join(t.app.config.uploadsDir, key))), 'the stored original is never changed');
    }
    // HEIC (or a structure the stripper does not understand) carrying EXIF: refused for the lawyer, never sent unstripped
    const heic = Buffer.concat([fs.readFileSync(path.join(FIX, 'sample.heic')), Buffer.from(`Exif\0\0${MARK}`, 'latin1')]);
    const hid = t.app.documents.save({ filename: 'photo.heic', mime: 'image/heic', buffer: heic }, { case_id: 1 }, { kind: 'staff' });
    const res = fakeRes();
    assert.throws(() => t.app.media.downloadVariant(t.app.documents.get(hid), lawyer, { file: 'main', res }), (e) => e.status === 409 && e.code === 'strip_failed');
    assert.equal(res.body, null);
    // …and one with no trace of metadata (an 11.0-era truncated JPEG, a plain HEIC) is sent as stored
    for (const [mime, buf] of [['image/heic', fs.readFileSync(path.join(FIX, 'sample.heic'))], ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])]]) {
      const id = t.app.documents.save({ filename: `x.${mime.split('/')[1]}`, mime, buffer: buf }, { case_id: 1 }, { kind: 'staff' });
      const r2 = fakeRes();
      t.app.media.downloadVariant(t.app.documents.get(id), lawyer, { file: 'main', res: r2 });
      assert.ok(Buffer.from(r2.body).equals(buf), mime);
    }
  });
});

// ───────── SEC-4: big JPEGs decode for OCR; a tool that exits with an error does not retry ─────────
describe('v12 gate media r2 — OCR tool failures (SEC-4)', () => {
  test('toolFailure: timeouts and crashes retry; exit codes do not, and say why', () => {
    assert.deepEqual(toolFailure(Object.assign(new Error('x'), { code: 'timeout' })), { retry: true, code: 'timeout' });
    assert.deepEqual(toolFailure(Object.assign(new Error('Command failed'), { code: 1 })), { retry: false, code: 'tool_error' });
    assert.deepEqual(toolFailure(Object.assign(new Error('Command failed: convert'), { code: 1, stderr: Buffer.from("convert: cache resources exhausted `big.jpg' @ error/cache.c/OpenPixelCache/4095.") })), { retry: false, code: 'too_large' });
    assert.deepEqual(toolFailure(Object.assign(new Error('media child failed'), { code: '1' })), { retry: false, code: 'tool_error' });
    assert.deepEqual(toolFailure(Object.assign(new Error('x'), { code: 'child_killed' })), { retry: true, code: 'child_killed' });
  });

  let t;
  let dir;
  const job = (id) => t.app.db.get("SELECT * FROM media_jobs WHERE kind = 'ocr' AND document_id = ?", id);
  const fake = (name, body) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
    return f;
  };
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-r2-sec4-'));
    const log = JSON.stringify(path.join(dir, 'argv.log'));
    const logLine = `require('fs').appendFileSync(${log}, JSON.stringify([require('path').basename(process.argv[1]), ...process.argv.slice(2)]) + '\\n');`;
    t.app.media.tools.configure({
      env: {
        NODE_TEST_CONTEXT: '1',
        // ImageMagick that, like the real one under the vendored limits, runs out of pixel cache on a full-size decode
        IMAGEMAGICK_BIN: fake(
          'convert',
          `${logLine}
const a = process.argv.slice(2);
if (a[0] === '-version') { console.log('Version: ImageMagick 6.9.12-98 Q16 x86_64'); process.exit(0); }
if (a[0] === '-list') { console.log('Path: /etc/ImageMagick-6/policy.xml\\n  Policy: Coder\\n    rights: None \\n    pattern: *\\n'); process.exit(0); }
if (!a.some((x) => /^jpeg:size=/.test(x))) { console.error('convert: cache resources exhausted /x/big.jpg @ error/cache.c/OpenPixelCache/4095.'); process.exit(1); }
require('fs').writeFileSync(a.at(-1).replace(/^png:/, ''), Buffer.from([0x89, 0x50, 0x4e, 0x47]));`,
        ),
        TESSERACT_BIN: fake(
          'tesseract',
          `${logLine}
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('tesseract 5.3.4'); process.exit(0); }
if (a[0] === '--list-langs') { console.log('List of available languages (2):\\nara\\nosd'); process.exit(0); }
process.stdout.write('شهادة ميلاد كبيرة الحجم مقروءة');`,
        ),
        PDFINFO_BIN: fake(
          'pdfinfo',
          `${logLine}
const a = process.argv.slice(2);
if (a[0] === '-v') { console.error('pdfinfo version 22.02.0'); process.exit(0); }
console.error('Syntax Error: Could not read xref table'); process.exit(1);`,
        ),
      },
    });
    t.app.media.setMemoryProbe(() => ({ limit: 4 * 1024 ** 3, headroom: 2 * 1024 ** 3, source: 'test' }));
  });
  after(async () => {
    if (t) await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a 39.7 MP JPEG is decoded for OCR with -define jpeg:size=2000x2000 and read (no cache exhaustion, no retries)', async () => {
    const id = t.app.documents.save({ filename: 'big.jpg', mime: 'image/jpeg', buffer: tinyJpeg(6300, 6300) }, {}, { kind: 'staff' });
    await t.app.media.processDue({ budgetMs: 20_000 });
    const j = job(id);
    assert.equal(j.state, 'done', JSON.stringify(j));
    assert.equal(j.attempts, 1);
    const im = fs.readFileSync(path.join(dir, 'argv.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x[0] === 'convert' && x[1] !== '-version' && x[1] !== '-list');
    const argv = im.at(-1);
    assert.equal(argv[argv.indexOf('-define') + 1], 'jpeg:size=2000x2000');
    assert.ok(argv.indexOf('-define') < argv.findIndex((x) => x.startsWith('jpeg:/')), 'the size hint comes before the input');
  });

  test('a 30 MP PNG is not decoded for OCR: skipped «too_large» at once (one attempt, no retry)', async () => {
    const png = Buffer.from(buildPng1(zlib.deflateSync(Buffer.alloc(10)), 6000, 5000));
    const id = t.app.documents.save({ filename: 'big.png', mime: 'image/png', buffer: png }, {}, { kind: 'staff' });
    await t.app.media.processDue({ budgetMs: 20_000 });
    const j = job(id);
    assert.equal(j.state, 'skipped', JSON.stringify(j));
    assert.equal(j.error, 'too_large');
    assert.equal(j.attempts, 1);
    assert.equal(t.app.documents.get(id).ocr_state, 'skipped');
  });

  test('a malformed PDF (pdfinfo exit 1) ends «failed: tool_error» after one attempt instead of 4 retries over 36 minutes', async () => {
    const id = t.app.documents.save({ filename: 'poly.pdf', mime: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n') }, {}, { kind: 'staff' });
    await t.app.media.processDue({ budgetMs: 20_000 });
    const j = job(id);
    assert.equal(j.state, 'failed', JSON.stringify(j));
    assert.equal(j.error, 'tool_error');
    assert.equal(j.attempts, 1);
    assert.equal(t.app.documents.get(id).ocr_state, 'failed');
    // the panel and the system card name it in Arabic
    assert.match(read('public/assets/js/app/components/doc-clean.js'), /tool_error: 'لم تستطع أداة القراءة فتح الملف\. قد يكون تالفًا\.'/);
    assert.match(read('public/assets/js/app/pages/admin/system.js'), /tool_error: 'لم تستطع الأداة فتح الملف'/);
  });
});

// ───────── lows: JR-09 (page hint + file names), V-13 (voice box spacing), SEC-7 (re-encoded «الأصل» labelled) ─────────
describe('v12 gate media r2 — lows (JR-09, V-13, SEC-7)', () => {
  test('JR-09: «صفحة ثانية من نفس المستند؟» beside «صفحة أخرى» after the first page; paid files named «مستند-N»', () => {
    const sheet = read('public/assets/js/lib/scan-sheet.js');
    assert.match(sheet, /addHint: 'صفحة ثانية من نفس المستند؟'/);
    assert.match(sheet, /export function addPageButton\(\{ register = 'p', onClick, disabled = false, hint = false \} = \{\}\)/);
    assert.match(sheet, /h\('div\.scn-add-row', h\('span\.scn-add__hint', \{ tag: 'SC-21' \}, t\.addHint\), btn\)/);
    assert.ok(!/addHint/.test(sheet.slice(sheet.indexOf('  f: {'), sheet.indexOf('  p: P,'))), 'the charity registers (single page) have no hint');
    const up = read('public/assets/js/public/upload.js');
    assert.match(up, /hint: lastDoc\.pages\.length === 1,/);
    assert.match(read('public/assets/js/public/intake.js'), /namePrefix: COPY\.docName,/);
    assert.match(read('src/site-copy-paid.js'), /docName: 'مستند',/);
    assert.match(read('public/assets/css/v12-media.css'), /\.scn-add-row\{display:flex;flex-wrap:wrap/);
    assert.match(read('TAGS.md'), /\| SC-21 \|/);
  });

  test('V-13: 14 px between the field and the actions; a disabled «تأكيد النص» is an outline, not a tinted block', () => {
    const css = read('public/assets/css/v9-messaging.css');
    assert.match(css, /\.pa-vt-edit \{\n  display: grid;\n  gap: 6px;/);
    assert.match(css, /\.pa-vt-edit > \.pa-vt-actions \{\n  margin-top: 8px;/);
    assert.match(css, /\.pa-vt \.pa-vt-edit \.btn\.pa-vt-save:disabled \{\n  border-color: var\(--rule-2\);\n  background: none;/);
    assert.match(read('public/assets/js/app/components/voice-transcript.js'), /listenFirst: 'استمع إلى الرسالة أولًا\.'/);
  });

  test('SEC-7: the scan block says the phone re-encoded the original; the server keeps it and the staff info line says so', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const jpeg = fs.readFileSync(path.join(FIX, 'orient-6.jpg'));
      const scan = (extra) => ({ v: 1, algo: 'scan-core@1', mode: 'color', turns: 0, pages: 1, quad: [[0.05, 0.05], [0.95, 0.04], [0.96, 0.95], [0.04, 0.96]], score: 0.91, partial: false, adjusted: false, originals: [{ filename: 'مستند-1-الأصل.jpg', mime: 'image/jpeg', data_base64: jpeg.toString('base64') }], ...extra });
      const clean = { filename: 'مستند-1.jpg', mime: 'image/jpeg', data_base64: fs.readFileSync(path.join(FIX, 'orient-3.jpg')).toString('base64') };
      const a = t.app.documents.save({ ...clean, scan: scan({ reencoded: true }) }, {}, { kind: 'staff' });
      const b = t.app.documents.save({ ...clean, scan: scan({}) }, {}, { kind: 'staff' });
      const info = okBody(await admin.get(`/api/admin/documents/${a}/files`));
      const orig = info.files.find((f) => f.role === 'original');
      assert.equal(orig.params.reencoded, true);
      assert.equal(okBody(await admin.get(`/api/admin/documents/${b}/files`)).files.find((f) => f.role === 'original').params.reencoded, false, 'an untouched camera file (or an 11.0-era row) is not marked');
      assert.equal(JSON.parse(t.app.db.value("SELECT params FROM document_files WHERE document_id = ? AND role = 'original'", b)).reencoded, undefined, 'false is not stored');
      // the client side: the worker reports it, the scanner page and the scan block carry it, the info line reads it
      assert.match(read('public/assets/js/lib/scan-worker.js'), /original, reencoded: !kept \};/);
      assert.match(read('public/assets/js/lib/scanner.js'), /reencoded: pages\.some\(\(p\) => p\.reencoded\),/);
      assert.match(read('public/assets/js/app/components/doc-clean.js'), /reduced \? 'الأصل المحفوظ \(صورة الهاتف مصغّرة\): ' : 'الأصل: '/);
    } finally {
      await t.close();
    }
  });
});
