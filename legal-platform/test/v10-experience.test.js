// v10.0 — مسار experience: الأخضر الملكي والذهبي، اسم المكتب «Emam Legal and Consultancy» في واجهات المستخدمين وحدها،
// ومكونات التصميم المشتركة (النوابض، الورقة السفلية، الاهتزاز، wordmark/stepTracker/kRow/confirmDiscard، إغلاق L-64).
// المرجع: scratchpad/v10-spec.md §4.1، §4.2، §6.4.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { startTestApp } from './helpers.js';
import { ok } from './lane-b-kit.test.js';
import { DEFAULT_SETTINGS, CLIENT_TEXTS } from '../src/constants.js';
import { isPlainName, wordmarkParts, PLAIN_NAME_ERROR } from '../src/brand.js';
import { ROBOTS_DISALLOW } from '../src/site.js';
import { setPublicRoot, transformAsset, preloadClosure } from '../src/site-assets.js';
import * as B from '../public/assets/js/lib/brand-color.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
const served = (rel) => br(transformAsset(path.join(PUB, rel)));
const BRAND = 'Emam Legal and Consultancy';
const SHORT = 'Emam Legal';
const titleOf = (html) => (/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || '';
const themeOf = (html) => (/<meta name="theme-color" content="([^"]+)"/.exec(html) || [])[1];

// ───────────────────────── EXP-0 ─────────────────────────

describe('v10 experience — version and docs skeleton (EXP-0)', () => {
  test('10.0.0 in package.json and both Dockerfile labels; the four lane markers in README, PLATFORM-BRIEF and DEPLOY', () => {
    // v11 visual (intended): the version is 11.0.0 now (package.json and both Dockerfile labels); the v10 markers stay
    assert.equal(JSON.parse(read('package.json')).version, '11.0.0');
    assert.match(read('Dockerfile'), /org\.opencontainers\.image\.version="11\.0\.0"/);
    assert.match(fs.readFileSync(path.join(ROOT, '..', 'Dockerfile'), 'utf8'), /org\.opencontainers\.image\.version="11\.0\.0"/);
    for (const f of ['README.md', 'PLATFORM-BRIEF.md', 'DEPLOY.md']) {
      const s = read(f);
      for (const lane of ['experience', 'b2b-server', 'b2b-portal', 'b2b-staff']) assert.ok(s.includes(`<!-- v10:${lane} -->`), `${f} ${lane}`);
    }
    assert.match(read('PLATFORM-BRIEF.md'), /\*\*Version 10\.0:\*\*/);
  });
});

// ───────────────────────── §6.4-1 الألوان ─────────────────────────

describe('v10 experience — royal green and gold (EXP-3, X10-C)', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
  });
  after(async () => t && t.close());

  test('the default pair is #0b3d29/#cca454: buildTheme returns LEGACY (legacy:true, no adjustments) and all 29 contract rows pass', () => {
    // v11 visual (intended): the logo colours (V11-01) replace the v10 royal green/gold pair
    assert.equal(B.DEFAULT_PRIMARY, '#0b3d29');
    assert.equal(B.DEFAULT_ACCENT, '#cca454');
    const t0 = B.buildTheme(B.DEFAULT_PRIMARY, B.DEFAULT_ACCENT);
    assert.deepEqual(t0.primary, { ...B.LEGACY.primary });
    assert.deepEqual(t0.accent, { ...B.LEGACY.accent });
    assert.equal(t0.legacy, true);
    assert.deepEqual(B.buildTheme('#0b3d29', '#cca454').adjustments, []); // v11 visual (intended)
    assert.deepEqual(B.checkContract(B.LEGACY).filter((r) => !r.ok).map((r) => r.id), []);
    // X10-C1: the generated scale verbatim — v11 visual (intended): the V11-01 scale
    assert.deepEqual({ ...B.LEGACY.primary }, { 50: '#eff6f2', 100: '#dfece5', 200: '#bfd8ca', 300: '#8ab59e', 500: '#26684c', 600: '#175139', 700: '#0b3d29', 800: '#082e1e', 900: '#052015' });
    assert.deepEqual({ ...B.LEGACY.accent }, { 50: '#fbf7ef', 100: '#f6ecda', 300: '#dabe89', 400: '#d4ad5f', 500: '#cca454', 600: '#93712b', 700: '#74581f', 800: '#5e4716' });
    // a neighbour of the default goes through the generator and lands on the same scale: no adjustment
    const near = B.buildTheme('#0b3d2a', '#cca455'); // v11 visual (intended)
    assert.deepEqual(near.adjustments, []);
    assert.equal(near.primary[700], '#0b3d2a');
  });

  test('every theme colour of the platform is LEGACY.primary[700]: app.html, setup.html, /app, /, both manifests, the offline page', async () => {
    const want = B.LEGACY.primary[700];
    assert.equal(themeOf(read('public/app.html')), want);
    assert.equal(themeOf(read('public/setup.html')), want);
    assert.equal(themeOf((await t.client().get('/app')).body), want);
    assert.equal(themeOf((await t.client().get('/')).body), want);
    for (const m of ['/manifest.webmanifest', '/company.webmanifest']) assert.equal(JSON.parse((await t.client().get(m)).body).theme_color, want, m);
    const sw = read('public/sw.js');
    assert.ok(sw.includes(`<meta name="theme-color" content="${want}">`));
    assert.ok(sw.includes('#cca454') && sw.includes('#032516')); // v11 visual (intended): offline page = gold on the logo ground
    assert.ok(read('src/routes/lawyer-home.js').includes(`'<meta name="theme-color" content="${want}" />'`), 'the /app replace literal matches app.html');
  });

  test('no 9.x teal/gold literal (#0f4c5c/#b8862e) under public/ or src/ except the allow-list', () => {
    const allowed = (rel, line) => (rel === 'public/assets/js/lib/brand-color.js' && /\/\/|\/\*|‎/.test(line)) || (rel === 'public/assets/css/pages-d.css' && /--pd-c2: #b8862e; \/\* @brand-exempt/.test(line));
    const bad = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(js|mjs|css|html|svg|webmanifest|json)$/.test(e.name)) {
          fs.readFileSync(path.join(ROOT, rel), 'utf8')
            .split('\n')
            .forEach((line, i) => {
              if (/#0f4c5c|#b8862e/i.test(line) && !allowed(rel, line)) bad.push(`${rel}:${i + 1}`);
            });
        }
      }
    };
    walk('public');
    walk('src');
    assert.deepEqual(bad, []);
  });

  test('X10-C4: .badge-primary is outlined; the three scrims use --scrim; the «إحنا نكلمك» tile is gold with on-accent ink', () => {
    const app = read('public/assets/css/app.css');
    assert.match(app, /\.badge-primary \{ --tone-bg: var\(--surface\); --tone-fg: var\(--primary-700\); box-shadow: inset 0 0 0 1px var\(--primary-300\); \}/);
    assert.match(app, /--scrim: rgb\(var\(--primary-900-rgb\) \/ 0\.48\);/);
    // EXP-7: the dialog scrim is its own layer (.modal-scrim, opacity follows the sheet/dialog spring); the container is clear
    assert.match(app, /\.modal-scrim \{[^}]*z-index: -1;[^}]*background: var\(--scrim\);/);
    assert.match(app, /\.modal-backdrop \{[^}]*background: none;/);
    assert.match(app, /\.sidebar-backdrop \{[^}]*background: var\(--scrim\);/);
    const portal = read('public/assets/css/v91-portal.css');
    assert.match(portal, /--scrim: rgb\(var\(--primary-900-rgb\) \/ 0\.48\);/);
    assert.match(portal, /\.bp-sheet-scrim \{[^}]*z-index: -1;[^}]*background: var\(--scrim\);/);
    const pub = read('public/assets/css/public-site.css');
    assert.match(pub, /body\.pub \.pub-pick-way--callback \{\s*background: var\(--accent-500\);\s*border-color: var\(--accent-600\);\s*color: var\(--on-accent\);/);
    assert.match(pub, /\.pub-pick-way--callback \.pa,\s*\.pub-pick-way--callback \.pb \{\s*fill: var\(--on-accent\);/);
  });

  test('the scales mark: favicon.svg (green tile, a300 glyph, brand label), brand-mark.svg, public header glyph and the offline page', async () => {
    // v11 visual (intended): favicon = the logo's interlocking-diamond ornament in gold on the logo ground, no label (L11-58)
    const fav = read('public/assets/img/favicon.svg');
    assert.match(fav, /<rect width="64" height="64" rx="14" fill="#032516"\/>/);
    assert.match(fav, /stroke="url\(#g\)"/);
    assert.ok(!/aria-label|<title/.test(fav), 'no artwork label');
    assert.ok(fav.includes('M18.7 15.3 15 19 6 10 15 1 24 10 21.3 12.7'), 'ornament');
    assert.ok(read('public/assets/img/brand-mark.svg').includes('M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2'));
    const home = (await t.client().get('/')).body;
    assert.ok(/<img class="pub-mark" src="\/assets\/img\/emam-mark-green\.svg\?v=[^"]+" width="99" height="19" alt=""/.test(home)); // v11 gate-public (intended)
    assert.ok(!home.includes('M8 30 32 10.5 56 30'), 'no house glyph left');
    assert.ok(!read('public/sw.js').includes('M8 30 32 10.5 56 30'));
  });
});

// ───────────────────────── §6.4-2 الاسم ─────────────────────────

describe('v10 experience — the brand name in the user experience only (EXP-1/4/5/6)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('defaults and the single accessor: brand settings, app.brand.displayName/shortName/wordmarkParts/staffChromeName, TOTP issuer', () => {
    assert.equal(DEFAULT_SETTINGS.brand_name, BRAND);
    assert.equal(DEFAULT_SETTINGS.brand_short_name, SHORT);
    assert.equal(DEFAULT_SETTINGS.brand_in_staff_app, true);
    assert.equal(DEFAULT_SETTINGS.security_totp_issuer, 'Emam Legal');
    assert.equal(DEFAULT_SETTINGS.org_name, 'مؤسسة بيوت مصر', 'org_name is not renamed');
    assert.equal(t.app.brand.displayName(), BRAND);
    assert.equal(t.app.brand.shortName(), SHORT);
    assert.deepEqual(t.app.brand.wordmarkParts(), { lead: 'Emam Legal', rest: 'and Consultancy' });
    assert.deepEqual(t.app.brand.staffChromeName(), { name: BRAND, short: SHORT });
    // no literal brand in src/ outside DEFAULT_SETTINGS (gate G-2)
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (rel.endsWith('.js') && rel !== 'src/constants.js' && read(rel).includes('Emam Legal')) hits.push(rel);
      }
    };
    walk('src');
    assert.deepEqual(hits, []);
  });

  test('wordmarkParts: prefix match (case-insensitive), no match, custom short', () => {
    assert.deepEqual(wordmarkParts(BRAND, SHORT), { lead: 'Emam Legal', rest: 'and Consultancy' });
    assert.deepEqual(wordmarkParts('emam legal & partners', 'Emam Legal'), { lead: 'emam legal', rest: '& partners' });
    assert.deepEqual(wordmarkParts('Nile Counsel', 'Emam Legal'), { lead: 'Nile Counsel', rest: '' });
    assert.deepEqual(wordmarkParts('Emam  Legal   Group', 'Emam Legal'), { lead: 'Emam Legal', rest: 'Group' });
    assert.deepEqual(wordmarkParts(BRAND, BRAND), { lead: BRAND, rest: '' });
  });

  test('isPlainName rejects control and every invisible format character and angle brackets (CS-26); settings validation and empty → default', async () => {
    for (const bad of ['a؜b', 'a​b', 'a⁠b', '﻿Emam', 'a\rb', 'a\nb', 'a‮b', 'a⁦b⁩', 'Emam <b>', 'x>y', 'a\u0000b']) assert.equal(isPlainName(bad), false, JSON.stringify(bad));
    for (const good of [BRAND, 'إمام للمحاماة والاستشارات', 'Emam & Co. (Cairo)']) assert.equal(isPlainName(good), true, good);
    for (const bad of ['Emam​Legal', 'Emam <b>', 'A\nB', '﻿Emam']) {
      const r = await admin.patch('/api/admin/settings', { brand_name: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, PLAIN_NAME_ERROR);
      assert.equal(r.body.details.fields.brand_name, 'اكتب الاسم بحروف عادية بلا رموز تحكم أو أقواس');
    }
    assert.equal((await admin.patch('/api/admin/settings', { brand_short_name: 'x'.repeat(25) })).status, 400, 'short name ≤ 24');
    assert.equal((await admin.patch('/api/admin/settings', { brand_name: 'x'.repeat(61) })).status, 400, 'name ≤ 60');
    assert.equal((await admin.patch('/api/admin/settings', { brand_name: '' })).status, 400, 'required');
    ok(await admin.patch('/api/admin/settings', { brand_name: '  Nile   Counsel  ' }));
    assert.equal(t.app.settings.get('brand_name'), 'Nile Counsel', 'trimmed and collapsed');
    assert.match(titleOf((await t.client().get('/')).body), /— Nile Counsel$/);
    t.app.settings.set('brand_name', '');
    assert.equal(t.app.brand.displayName(), BRAND, 'an emptied value renders the default');
    t.app.settings.set('brand_name', 'Bad​Name');
    assert.equal(t.app.brand.displayName(), BRAND, 'an unreadable stored value renders the default');
    t.app.settings.set('brand_name', BRAND);
    // audited like every settings change
    assert.ok(t.app.db.get("SELECT id FROM security_events WHERE type = 'settings.updated' ORDER BY id DESC LIMIT 1") || t.app.db.get("SELECT id FROM activity WHERE type LIKE 'settings%' ORDER BY id DESC LIMIT 1"));
  });

  test('public titles end with «— Emam Legal and Consultancy»; the header lockup is a <bdi lang="en">; legal-entity lines stay on org_legal_name', async () => {
    const legal = DEFAULT_SETTINGS.org_legal_name;
    const portal = ok(await admin.post(`/api/admin/clients/${t.app.db.value('SELECT id FROM clients ORDER BY id LIMIT 1')}/portal-link`, {}));
    const pPath = new URL(portal.url, t.base).pathname;
    // v11 gate-public (intended): + /services and /khayri (same «— Emam Legal and Consultancy» suffix)
    for (const p of ['/', '/khayri', '/services', '/intake', '/about', '/privacy', '/terms', '/data-deletion', '/portal', pPath, '/no-such-page-v10']) {
      const html = (await t.client().get(p)).body;
      assert.match(titleOf(html), /— Emam Legal and Consultancy$/, p);
      assert.ok(html.includes('<bdi class="pub-wordmark" dir="ltr" lang="en"><b>Emam Legal</b> <span>and Consultancy</span></bdi>'), `${p} lockup`);
      assert.ok(html.includes(`aria-label="${BRAND} — الصفحة الرئيسية"`), `${p} aria-label`);
      assert.match(html, new RegExp(`© \\d{4} ${legal}\\. جميع الحقوق محفوظة\\.`), `${p} ©`);
      assert.ok(html.includes('<meta property="og:site_name" content="Emam Legal and Consultancy" />'), `${p} og:site_name`);
    }
    for (const p of ['/privacy', '/terms', '/about']) assert.ok((await t.client().get(p)).body.includes(legal), `${p} keeps the legal entity`);
    const home = (await t.client().get('/khayri')).body; // v11 gate-public (intended): the charity LegalService/NGO graph lives on /khayri (the gated / carries Organization only)
    assert.ok(home.includes('<span class="pub-sr">مساعدة قانونية مجانية من <bdi class="wordmark" dir="ltr" lang="en">Emam Legal and Consultancy</bdi>. </span>'));
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)[1])['@graph'];
    const org = ld.find((x) => x['@type'] === 'NGO');
    assert.equal(org.name, legal, 'JSON-LD Organization = legal entity');
    assert.equal(org.alternateName, BRAND);
    const svc = ld.find((x) => x['@type'] === 'LegalService');
    assert.equal(svc.name, BRAND);
    assert.deepEqual(svc.brand, { '@type': 'Brand', name: BRAND });
    assert.equal(ld.find((x) => x['@type'] === 'WebPage').isPartOf.name, BRAND);
    // bm-public carries the brand (≤ 3 KB)
    const bm = /<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(home)[1];
    assert.ok(Buffer.byteLength(bm) <= 3072);
    assert.deepEqual(JSON.parse(bm).brand, { name: BRAND, short: SHORT });
    // «بيوت مصر» appears only through the legal entity (© / JSON-LD / description) and the foundation-mission sentence on /about
    for (const p of ['/', '/intake', '/portal', pPath]) {
      const visible = (await t.client().get(p)).body
        .replace(/<script\b[\s\S]*?<\/script>/g, '')
        .split(legal)
        .join('');
      assert.ok(!visible.includes('بيوت مصر'), `${p}: ${visible.slice(Math.max(0, visible.indexOf('بيوت مصر') - 80), visible.indexOf('بيوت مصر') + 40)}`);
    }
  });

  test('/api/meta.brand = { name, short, staff_chrome } (no colour block for the defaults); fmt.orgName() follows it', async () => {
    const meta = ok(await t.client().get('/api/meta'));
    assert.deepEqual(meta.brand, { name: BRAND, short: SHORT, staff_chrome: { name: BRAND, short: SHORT } });
    assert.equal(meta.site.site_name, BRAND);
    const loginMeta = ok(await t.client().get('/api/meta?part=login'));
    assert.equal(loginMeta.brand.name, BRAND);
    const fmt = await import('../public/assets/js/lib/fmt.js');
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' } });
    assert.equal(fmt.orgName(), 'مؤسسة بيوت مصر');
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' }, brand: meta.brand });
    assert.equal(fmt.orgName(), BRAND);
    assert.deepEqual(fmt.staffChrome(), { on: true, name: BRAND, short: SHORT });
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' }, brand: { name: BRAND, short: SHORT, staff_chrome: { name: 'مؤسسة بيوت مصر', short: 'مؤسسة بيوت مصر' } } });
    assert.deepEqual(fmt.staffChrome(), { on: false, name: 'مؤسسة بيوت مصر', short: 'مؤسسة بيوت مصر' });
  });

  test('client texts: RLM before a Latin signature line only; story_welcome_header starts with Arabic; OTP and portal texts carry the brand', async () => {
    const e = t.app.engine;
    const filled = e.fillClientText('أهلًا يا {first_name}.\n— {org_name}', { first_name: 'هبة', org_name: BRAND }, 'f');
    assert.ok(filled.includes('\n‏— Emam Legal and Consultancy'), JSON.stringify(filled));
    assert.ok(!e.fillClientText('شكرًا.\n— {org_name}', { org_name: 'مؤسسة بيوت مصر' }, 'f').includes('‏'), 'an Arabic name gets no RLM');
    assert.equal(CLIENT_TEXTS.story_welcome_header, 'الدعم القانوني — {org_name}');
    assert.match(e.fillClientText(CLIENT_TEXTS.story_welcome_header, { org_name: t.app.brand.displayName() }), /^الدعم القانوني — Emam Legal and Consultancy$/);
    assert.ok(e.fillClientText(CLIENT_TEXTS.story_welcome_header, { org_name: BRAND }).length <= 60);
    assert.ok(!/[⁦-⁩]/.test(filled), 'no isolate characters in WhatsApp texts');
    assert.match(e.fillClientText(CLIENT_TEXTS.otp, { org_name: t.app.brand.displayName(), code: '123456' }), /Emam Legal and Consultancy/);
    // the staff «portal link» message (admin.js:209) is filled with the brand
    const clientId = t.app.db.value("SELECT client_id FROM client_identities WHERE kind = 'phone' ORDER BY id LIMIT 1");
    const r = ok(await admin.post(`/api/admin/clients/${clientId}/portal-link`, { send: true }));
    assert.ok(r.message_id);
    const msg = t.app.db.get('SELECT body, meta FROM messages WHERE id = ?', r.message_id);
    assert.match(`${msg.body}\n${msg.meta}`, /Emam Legal and Consultancy/);
    // services that fill {org_name} use the single accessor (G-2 style source check)
    for (const [file, re] of [
      ['src/services/automations.js', /const orgName = \(\) => app\.brand\.displayName\(\);/],
      ['src/services/messaging.js', /const orgName = \(\) => app\.brand\.displayName\(\);/],
      ['src/services/practice.js', /const org = app\.brand\.shortName\(\);/],
      ['src/routes/admin.js', /`استشارة قانونية مجانية من \$\{app\.brand\.displayName\(\)\}`/],
      ['src/routes/admin.js', /org_name: app\.brand\.displayName\(\) \}, w\.form\)/],
      ['src/routes/public.js', /`مرحبًا \$\{app\.brand\.displayName\(\)\}، رقم طلبي/],
      ['src/services/stories.js', /org_name: app\.brand\.displayName\(\),/],
      ['src/channels/engine.js', /org_name: app\.brand\.displayName\(\) \}/],
    ]) assert.match(read(file), re, file);
  });

  test('the public intake WhatsApp prefill and the generic greeting', async () => {
    const T = await import('../public/assets/js/public/topics.js');
    assert.equal(T.waPrefill(null), 'السلام عليكم، عايزة أحكيلكم مشكلتي.');
    assert.equal(T.waPrefill('inh'), 'السلام عليكم، عندي مشكلة في الورث.'.replace('في الورث', T.TOPICS.find((x) => x.key === 'inh').wa_phrase));
    const intake = read('public/assets/js/public/intake.js');
    assert.ok(!intake.includes('مؤسسة بيوت مصر'));
    // v11 gate-public (intended: r2 S16): «وصلنا طلبك» في COPY.done، والعنوان «… — اسم المكتب»
    assert.match(intake, /`\$\{COPY\.done\} — \$\{brandName\(\)\}`/);
    assert.ok(intake.includes("done: 'وصلنا طلبك'"));
  });

  test('the local analyser strips the brand and «إمام» from greetings (storyLine, meaningfulLetters); skeleton drafts with a RLM signature', async () => {
    const H = await import('../src/ai/heuristic.js');
    assert.equal(H.meaningfulLetters('السلام عليكم Emam Legal and Consultancy'), 0);
    assert.equal(H.meaningfulLetters('مرحبا إمام'), H.meaningfulLetters('مرحبا'));
    const r = H.recommendTrack('مرحبا إمام، جوزي اتوفى من شهرين ومش عارفة اطلع المعاش بتاعه ازاي', { title: 'x', summary: 's', facts: [] }, {});
    assert.match(r.one_line, /^جوزي اتوفى/);
    const S = await import('../src/services/stories.js');
    assert.equal(S.isSkeletonDraft('أهلًا يا هبة،\n\n‏— Emam Legal and Consultancy', [BRAND, SHORT]), true);
    assert.equal(S.isSkeletonDraft('أهلًا يا هبة، ابعتي صورة الإعلام.\n‏— Emam Legal and Consultancy', [BRAND, SHORT]), false);
    assert.equal(S.spokenScript('اعرفي حقك\n‏— Emam Legal'), 'اعرفي حقك');
    const replies = H.suggestReplies({ kind: 'intake', intent: 'status', code: 'REQ-2026-00001', org_name: BRAND });
    assert.ok(replies.every((x) => !x.text.includes('بيوت مصر')));
  });

  test('/app chrome: <title> and apple-mobile-web-app-title = the short brand; manifests; sw offline name; ROBOTS_DISALLOW /company', async () => {
    const html = (await t.client().get('/app')).body;
    assert.match(html, /<title>Emam Legal<\/title>/);
    assert.match(html, /<meta name="apple-mobile-web-app-title" content="Emam Legal" \/>/);
    const m = await t.client().get('/manifest.webmanifest');
    assert.match(m.headers.get('content-type'), /application\/manifest\+json/);
    const man = JSON.parse(m.body);
    assert.equal(man.name, 'Emam Legal — منصة فريق العمل والمحامين');
    assert.equal(man.short_name, 'Emam Legal');
    assert.equal(man.description, 'منصة فريق العمل والمحامين لمتابعة الطلبات والملفات.');
    assert.equal(man.scope, '/app');
    const etag = m.headers.get('etag');
    assert.ok(etag);
    assert.equal((await t.client().request('GET', '/manifest.webmanifest', undefined, { 'if-none-match': etag })).status, 304);
    const co = JSON.parse((await t.client().get('/company.webmanifest')).body);
    assert.equal(co.name, 'Emam Legal — إدارتكم القانونية');
    assert.equal(co.short_name, 'Emam Legal');
    assert.equal(co.description, 'Your Virtual Legal Department — بوابة الشركات');
    assert.equal(co.scope, '/company');
    assert.equal(co.start_url, '/company#/');
    assert.equal(co.id, '/company');
    assert.equal(co.shortcuts, undefined);
    for (const i of co.icons) assert.equal((await t.client().get(i.src)).status, 200, i.src);
    assert.match((await t.client().get('/sw.js')).body, /const ORG_NAME = "Emam Legal";/);
    assert.ok(ROBOTS_DISALLOW.includes('/company'));
    assert.match((await t.client().get('/robots.txt')).body, /Disallow: \/company/);
  });

  test('brand_in_staff_app=false restores the 9.2 names in /app (HTML, manifest, meta.staff_chrome, sw) while / and the company manifest keep the brand (J6)', async () => {
    const before = (await t.client().get('/api/meta')).headers.get('etag');
    ok(await admin.patch('/api/admin/settings', { brand_in_staff_app: false }));
    try {
      const html = (await t.client().get('/app')).body;
      assert.match(html, /<title>منصة بيوت مصر القانونية<\/title>/);
      assert.match(html, /<meta name="apple-mobile-web-app-title" content="بيوت مصر" \/>/);
      const man = JSON.parse((await t.client().get('/manifest.webmanifest')).body);
      assert.equal(man.name, 'منصة الدعم القانوني — مؤسسة بيوت مصر');
      assert.equal(man.short_name, 'بيوت مصر');
      const meta = ok(await t.client().get('/api/meta'));
      assert.deepEqual(meta.brand.staff_chrome, { name: 'مؤسسة بيوت مصر', short: 'مؤسسة بيوت مصر' });
      assert.equal(meta.brand.name, BRAND);
      assert.notEqual((await t.client().get('/api/meta')).headers.get('etag'), before, 'meta ETag changes');
      assert.match(titleOf((await t.client().get('/')).body), /— Emam Legal and Consultancy$/);
      assert.equal(JSON.parse((await t.client().get('/company.webmanifest')).body).short_name, SHORT);
      assert.match((await t.client().get('/sw.js')).body, /const ORG_NAME = "مؤسسة بيوت مصر";/);
    } finally {
      ok(await admin.patch('/api/admin/settings', { brand_in_staff_app: true }));
    }
    assert.match((await t.client().get('/app')).body, /<title>Emam Legal<\/title>/);
  });

  test('the settings card: two brand fields and the staff-app checkbox with the exact copy (EXP-1)', () => {
    const s = read('public/assets/js/app/components/site-settings.js');
    for (const copy of [
      "label: 'اسم المكتب كما يراه العملاء'",
      "hint: 'يظهر في رأس الموقع وعناوين الصفحات وتوقيع الرسائل وبوابة الشركات. الاسم القانوني للجهة في «ملف المؤسسة».'",
      "label: 'الاسم المختصر'",
      "hint: 'للمساحات الضيقة: أيقونة الهاتف وعنوان التبويب.'",
      "label: 'إظهار اسم المكتب في منصة فريق العمل والمحامين'",
      "hint: 'عند إيقافه تبقى صفحة الدخول والقائمة الجانبية باسم المؤسسة كما كانت.'",
    ]) assert.ok(s.includes(copy), copy);
    assert.ok(s.includes("'brand_name',") && s.includes("'brand_short_name',"));
  });
});

// ───────────────────────── §6.4-3 الحركة (دوال نقية) ─────────────────────────

describe('v10 experience — springs, sheet motion and haptics modules (EXP-2)', () => {
  let clock = 0;
  const frames = [];
  const realPerf = globalThis.performance;
  before(() => {
    // ساعة ومؤقت إطارات يدويان: كل tick يقدّم الوقت 16ms وينفّذ إطارًا واحدًا
    Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true, writable: true });
    globalThis.requestAnimationFrame = (fn) => frames.push(fn);
    globalThis.cancelAnimationFrame = () => {};
  });
  after(() => {
    Object.defineProperty(globalThis, 'performance', { value: realPerf, configurable: true, writable: true });
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
    delete globalThis.matchMedia;
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      clock += 16;
      const list = frames.splice(0);
      for (const f of list) f();
    }
  };

  test('project(1000) = 499 and rubberband(100, 600) ≈ 50.4 (Apple formulas)', async () => {
    const S = await import('../public/assets/js/lib/spring.js');
    assert.ok(Math.abs(S.project(1000) - 499) < 1e-9);
    assert.ok(Math.abs(S.rubberband(100, 600) - 50.38) < 0.01);
    assert.ok(Math.abs(S.rubberband(-100, 600) + 50.38) < 0.01);
    assert.deepEqual(Object.keys(S.SPRING), ['ui', 'move', 'sheet', 'press']);
  });

  test('a critically damped spring never overshoots and rests on the target; retarget mid-flight has no jump; stop() resolves false', async () => {
    const S = await import('../public/assets/js/lib/spring.js');
    const seen = [];
    const sp = S.spring({ from: 0, to: 400, ...S.SPRING.ui, onUpdate: (v) => seen.push(v) });
    let done = null;
    sp.done.then((x) => (done = x));
    tick(60);
    await Promise.resolve();
    assert.ok(seen.every((v) => v <= 400 + 1e-9), 'no overshoot');
    assert.equal(seen.at(-1), 400);
    assert.equal(done, true);
    // retarget while moving: the presented value does not jump
    const sp2 = S.spring({ from: 0, to: 400, ...S.SPRING.sheet });
    tick(10);
    const v0 = sp2.value();
    sp2.retarget(100);
    assert.ok(Math.abs(sp2.value() - v0) < 1e-6);
    let r2 = null;
    sp2.done.then((x) => (r2 = x));
    sp2.stop();
    await Promise.resolve();
    assert.equal(r2, false, 'stop() resolves the pending promise with false');
    // retarget after rest arms a fresh done promise
    const sp3 = S.spring({ from: 0, to: 10, ...S.SPRING.press });
    tick(40);
    const first = sp3.done;
    sp3.retarget(50);
    assert.notEqual(sp3.done, first);
    let r3 = null;
    sp3.done.then((x) => (r3 = x));
    tick(60);
    await Promise.resolve();
    assert.equal(r3, true);
    assert.equal(sp3.value(), 50);
  });

  test('review: stop() freezes at the presented value — value() and a later retarget() start there (no jump to the old target)', async () => {
    const S = await import('../public/assets/js/lib/spring.js');
    const sp = S.spring({ from: 0, to: 400, ...S.SPRING.ui });
    tick(4);
    const at = sp.stop();
    assert.ok(at > 0 && at < 400, `mid-flight ${at}`);
    assert.equal(sp.value(), at, 'value() after stop() is the stopped value, not the target');
    tick(3);
    assert.equal(sp.value(), at, 'still frozen');
    sp.retarget(0);
    assert.ok(Math.abs(sp.value() - at) < 1e-6, 'retarget after stop() starts from the stopped value');
    let ok = null;
    sp.done.then((x) => (ok = x));
    tick(80);
    await Promise.resolve();
    assert.equal(ok, true);
    assert.equal(sp.value(), 0);
  });

  test('review: grabbing a moving sheet keeps it exactly where it is painted (hold, drag 1:1 from there); destroy() settles a pending exit', async () => {
    const { attachSheet } = await import('../public/assets/js/lib/sheet-motion.js');
    const on = {};
    const handle = { contains: (t) => t === handle, closest: () => null };
    const panel = {
      style: {},
      addEventListener: (t, f) => (on[t] = f),
      removeEventListener: (t) => delete on[t],
      getBoundingClientRect: () => ({ height: 400 }),
      setPointerCapture() {},
    };
    const ty = () => Number((/translate3d\(0,([-\d.e]+)px,0\)/.exec(panel.style.transform) || [0, 0])[1]);
    const s = attachSheet({ panel, scrim: null, handles: [handle] });
    s.enter();
    tick(10);
    const painted = ty();
    assert.ok(painted > 0 && painted < 400, `entering ${painted}`);
    clock += 10; // the finger lands between two frames
    on.pointerdown({ pointerId: 1, button: 0, clientY: 500, target: handle });
    assert.equal(ty(), painted, 'no repaint on grab');
    tick(6);
    assert.equal(ty(), painted, 'frozen while held');
    on.pointermove({ pointerId: 1, clientY: 520, target: handle });
    assert.ok(Math.abs(ty() - (painted + 20)) < 1e-9, `drag continues 1:1 from the painted position (${ty()} vs ${painted + 20})`);
    on.pointerup({ pointerId: 1, type: 'pointerup', clientY: 520 });
    tick(80);
    assert.equal(panel.style.transform, '', 'settles open');
    const p = s.exit('dismiss', { interruptible: true });
    tick(2);
    s.destroy();
    assert.equal(await p, false, 'a destroyed sheet resolves its pending exit (no awaiting caller left hanging)');
    assert.equal(on.pointerdown, undefined, 'listeners removed');
  });

  test('review: with reduced motion a sheet fades out from the opacity it shows now (an unfinished fade-in does not flash back to 1)', async () => {
    globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
    globalThis.getComputedStyle = () => ({ opacity: '0.4' });
    try {
      const { attachSheet } = await import('../public/assets/js/lib/sheet-motion.js');
      const panel = { style: {}, addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ height: 400 }) };
      const s = attachSheet({ panel, scrim: null, handles: [] });
      const p = s.exit('dismiss');
      assert.equal(panel.style.opacity, '0.4', 'starts where it is');
      tick(2);
      assert.equal(panel.style.opacity, '0');
      await new Promise((r) => setTimeout(r, 180));
      assert.equal(await p, true);
      assert.equal(panel.style.transition, '', 'no transition left after the fade');
      assert.equal(panel.style.transform ?? '', '', 'no slide with reduced motion');
    } finally {
      delete globalThis.matchMedia;
      delete globalThis.getComputedStyle;
    }
  });

  test('reduced motion forces damping 1 (no overshoot even for SPRING.sheet)', async () => {
    globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {} });
    const S = await import('../public/assets/js/lib/spring.js');
    assert.equal(S.reducedMotion(), true);
    const seen = [];
    S.spring({ from: 0, to: 300, damping: 0.3, response: 0.3, onUpdate: (v) => seen.push(v) });
    tick(80);
    assert.ok(seen.every((v) => v <= 300 + 1e-9));
    delete globalThis.matchMedia;
    assert.equal(S.reducedMotion(), false);
  });

  test('haptic(): silent false without navigator.vibrate, the X10-M6 patterns otherwise', async () => {
    const { haptic } = await import('../public/assets/js/lib/haptics.js');
    const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
      assert.equal(haptic('success'), false);
      const calls = [];
      Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => (calls.push(p), true) }, configurable: true });
      haptic();
      haptic('success');
      haptic('error');
      assert.deepEqual(calls, [12, [12, 60, 18], [24, 50, 24, 50, 24]]);
      Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => true, userActivation: { hasBeenActive: false } }, configurable: true });
      assert.equal(haptic(), false, 'no vibration before a user gesture');
    } finally {
      if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc);
      else delete globalThis.navigator;
    }
  });

  test('sizes as served (comment lines stripped): spring.js ≤ 1 KB br, sheet-motion.js ≤ 1.8 KB br, haptics.js ≤ 0.3 KB br, v10-experience.css ≤ 4 KB br; neither motion module in the / or /intake closure', () => {
    setPublicRoot(PUB);
    assert.ok(served('assets/js/lib/spring.js') <= 1024, `spring ${served('assets/js/lib/spring.js')}`);
    assert.ok(served('assets/js/lib/sheet-motion.js') <= 1.8 * 1024, `sheet ${served('assets/js/lib/sheet-motion.js')}`);
    assert.ok(served('assets/js/lib/haptics.js') <= 0.3 * 1024, `haptics ${served('assets/js/lib/haptics.js')}`);
    assert.ok(served('assets/css/v10-experience.css') <= 4 * 1024, `css ${served('assets/css/v10-experience.css')}`);
    for (const entry of ['assets/js/public/landing.js', 'assets/js/public/intake.js']) {
      const c = preloadClosure(path.join(PUB, entry), PUB).join(' ');
      assert.ok(!/spring|sheet-motion/.test(c), `${entry}: ${c}`);
    }
    // the beneficiary page closure stays the same four files (L-11)
    const pc = preloadClosure(path.join(PUB, 'assets/js/public/portal.js'), PUB).map((u) => path.basename(u.split('?')[0])).sort();
    assert.deepEqual(pc, ['h.js', 'portal-ui.js', 'words.js']);
  });
});

// ───────────────────────── §6.4-4 المكونات (DOM مصغّر) ─────────────────────────

/** DOM مصغّر يكفي h() وui.modal/kRow/stepTracker/wordmark (بلا مكتبة) */
function installDom() {
  class FakeNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
    }
    get isConnected() {
      let n = this;
      while (n) {
        if (n === globalThis.document.body) return true;
        n = n.parentNode;
      }
      return false;
    }
    appendChild(c) {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    }
    append(...cs) {
      for (const c of cs) this.appendChild(typeof c === 'string' ? globalThis.document.createTextNode(c) : c);
    }
    removeChild(c) {
      this.childNodes = this.childNodes.filter((x) => x !== c);
      c.parentNode = null;
      return c;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(globalThis.document.createTextNode(v));
    }
  }
  class FakeText extends FakeNode {
    constructor(t) {
      super();
      this.data = String(t);
    }
    get textContent() {
      return this.data;
    }
  }
  class FakeEl extends FakeNode {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      this.attrs = {};
      this.listeners = {};
      this.dataset = {};
      this.style = { setProperty() {} };
      const set = new Set();
      this.classList = {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        contains: (c) => set.has(c),
        toggle: (c, f) => ((f ?? !set.has(c)) ? set.add(c) : set.delete(c)),
        values: () => [...set],
      };
    }
    get children() {
      return this.childNodes.filter((c) => c instanceof FakeEl);
    }
    get className() {
      return this.classList.values().join(' ');
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }
    dispatch(type, extra = {}) {
      const e = { type, target: this, preventDefault() {}, ...extra };
      for (const f of [...(this.listeners[type] || [])]) f(e);
    }
    click() {
      this.dispatch('click');
    }
    focus() {
      if (globalThis.document) globalThis.document.activeElement = this;
    }
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 390, height: 300 };
    }
    contains(n) {
      while (n) {
        if (n === this) return true;
        n = n.parentNode;
      }
      return false;
    }
    all() {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(sel.trim());
      if (!m) return [];
      const cls = m[2].split('.').filter(Boolean);
      return this.all().filter((e) => (!m[1] || e.tagName === m[1].toUpperCase()) && cls.every((c) => e.classList.contains(c)));
    }
  }
  const body = new FakeEl('body');
  const doc = {
    body,
    activeElement: body,
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
  };
  globalThis.document = doc;
  globalThis.Node = FakeNode;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  return { doc, body };
}

describe('v10 experience — kit components and L-64 close semantics (EXP-2, EXP-7a)', () => {
  let ui;
  let dom;
  before(async () => {
    dom = installDom();
    ui = await import('../public/assets/js/lib/ui.js');
    const fmt = await import('../public/assets/js/lib/fmt.js');
    fmt.setMeta({ settings: { org_name: 'مؤسسة بيوت مصر' }, brand: { name: BRAND, short: SHORT, staff_chrome: { name: BRAND, short: SHORT } } });
  });
  after(async () => {
    await new Promise((r) => setTimeout(r, 250)); // focus and exit timers of the last modals
    delete globalThis.document;
    delete globalThis.Node;
    delete globalThis.requestAnimationFrame;
  });
  const leaving = () => dom.body.children.filter((c) => c.classList.contains('modal-backdrop') && c.classList.contains('is-leaving'));

  test('a programmatic close runs onClose synchronously, releases the scroll lock, and the leaving node is inert, aria-hidden and .is-leaving at once', () => {
    let reason = null;
    const m = ui.modal({ title: 'x', body: 'y', onClose: (r) => (reason = r) });
    assert.ok(dom.body.classList.contains('has-modal'));
    m.close();
    assert.equal(reason, 'close', 'onClose ran inside close()');
    assert.equal(dom.body.classList.contains('has-modal'), false);
    const l = leaving().at(-1);
    assert.ok(l, 'still in the DOM while it animates out');
    assert.equal(l.inert, true);
    assert.equal(l.getAttribute('aria-hidden'), 'true');
  });

  test('the scroll lock is a counter: closing one modal while another is open (or opening one right after) keeps it', async () => {
    const a = ui.modal({ title: 'a', body: '' });
    const b = ui.modal({ title: 'b', body: '' });
    a.close();
    assert.ok(dom.body.classList.contains('has-modal'), 'b is still open');
    b.close();
    assert.equal(dom.body.classList.contains('has-modal'), false);
    const c = ui.modal({ title: 'c', body: '' });
    c.close();
    const d = ui.modal({ title: 'd', body: '' });
    await new Promise((r) => setTimeout(r, 200)); // c's exit removal timer has run
    assert.ok(dom.body.classList.contains('has-modal'), 'd keeps the lock after c finished leaving');
    d.close();
    ui.closeAllModals();
    assert.equal(dom.body.classList.contains('has-modal'), false);
  });

  test('closeAllModals() is instant (no leaving node); beforeClose may return a Promise and runs for user dismissals only', async () => {
    const x = ui.modal({ title: 'x', body: '' });
    const before = leaving().length;
    ui.closeAllModals();
    assert.equal(leaving().length, before, 'removed at once');
    assert.equal(x.el.isConnected, false);
    let asked = 0;
    let closed = false;
    const m = ui.modal({ title: 's', body: '', sheet: true, beforeClose: async () => (asked += 1, false), onClose: () => (closed = true) });
    await m.requestDismiss('dismiss');
    assert.equal(asked, 1);
    assert.equal(closed, false, 'beforeClose → false keeps it open');
    m.close();
    assert.equal(asked, 1, 'a programmatic close does not ask');
    assert.equal(closed, true);
    // the sheet grip is decorative and the ✕ is always there
    const s = ui.modal({ title: 's2', body: '', sheet: true });
    assert.equal(s.el.querySelector('.modal-grip').getAttribute('aria-hidden'), 'true');
    assert.ok(s.el.querySelector('.modal-close'));
    s.close();
    assert.equal(String(ui.modal).split(')')[0].replace(/\s+/g, ' '), 'function modal({ title, body, actions = [], size = \'md\', onClose, dismissible = true, className, sheet = false, subtitle, beforeClose } = {}', 'signature unchanged');
  });

  test('confirmDiscard: «تجاهل ما كتبتموه؟» [«تجاهل»] [«متابعة الكتابة»] → true/false; singular copy; discardGuard closes clean sheets directly', async () => {
    const p = ui.confirmDiscard();
    const dlg = dom.body.children.filter((c) => !c.classList.contains('is-leaving')).at(-1);
    assert.equal(dlg.querySelector('.modal-title').textContent, 'تجاهل ما كتبتموه؟');
    const btns = dlg.querySelectorAll('.btn');
    assert.deepEqual(btns.map((b) => b.textContent), ['تجاهل', 'متابعة الكتابة']);
    btns[0].click();
    assert.equal(await p, true);
    const p2 = ui.confirmDiscard({ singular: true });
    const dlg2 = dom.body.children.filter((c) => !c.classList.contains('is-leaving')).at(-1);
    assert.equal(dlg2.querySelector('.modal-title').textContent, 'تجاهل ما كتبته؟');
    dlg2.querySelectorAll('.btn')[1].click();
    assert.equal(await p2, false);
    assert.equal(await ui.discardGuard(() => false)(), true);
  });

  test('kRow renders <a> with href, <button type="button"> with only onClick, <div> otherwise; chevron on tappable rows', () => {
    const a = ui.kRow({ icon: 'building', title: 'بيانات الشركة', sub: 'سطر', href: '#/x' });
    assert.equal(a.tagName, 'A');
    assert.equal(a.getAttribute('href'), '#/x');
    assert.ok(a.querySelector('.k-row-chevron'));
    const b = ui.kRow({ title: 't', onClick: () => {} });
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('type'), 'button');
    const d = ui.kRow({ title: 't', trailing: 'x' });
    assert.equal(d.tagName, 'DIV');
    assert.equal(d.querySelector('.k-row-chevron'), null);
    assert.ok(ui.kRow({ title: 't', href: '#', dimOnly: false }).classList.contains('k-row-scale'));
  });

  test('stepTracker: aria-current on the current step, SR suffixes, the waiting state with its note, all done when current = length', () => {
    const steps = [{ title: 'تم الاستلام', at: '2026-10-06T09:30:00Z' }, { title: 'دراسة الطلب', hint: 'يحدد فريقكم' }, { title: 'العمل القانوني' }];
    const el = ui.stepTracker(steps, { current: 1, state: 'waiting', note: 'بانتظار ردكم', label: 'أين وصل طلبكم؟' });
    assert.equal(el.tagName, 'OL');
    assert.ok(el.classList.contains('step-tracker'));
    assert.equal(el.getAttribute('aria-label'), 'أين وصل طلبكم؟');
    const lis = el.children;
    assert.ok(lis[0].classList.contains('is-done'));
    assert.ok(lis[1].classList.contains('is-current') && lis[1].classList.contains('is-waiting'));
    assert.equal(lis[1].getAttribute('aria-current'), 'step');
    assert.ok(lis[1].textContent.includes('يحدد فريقكم') && lis[1].textContent.includes('بانتظار ردكم') && lis[1].textContent.includes(' (المرحلة الحالية)'));
    assert.ok(lis[0].textContent.includes(' (اكتملت)'));
    assert.equal(lis[2].getAttribute('aria-current'), null);
    const all = ui.stepTracker(steps, { current: 3 });
    assert.ok(all.children.every((li) => li.classList.contains('is-done')));
  });

  test('wordmark() / brandEl(): <bdi dir="ltr" lang="en"> from meta.brand, stacked lockup with an Arabic descriptor; the 14 L-45 icons exist', () => {
    const w = ui.wordmark({ size: 'md', tone: 'light', descriptor: 'إدارتكم القانونية' });
    assert.ok(w.classList.contains('wordmark-lockup'));
    const bdi = w.children[0];
    assert.equal(bdi.tagName, 'BDI');
    assert.equal(bdi.getAttribute('dir'), 'ltr');
    assert.equal(bdi.getAttribute('lang'), 'en');
    assert.deepEqual(bdi.className.split(' ').sort(), ['wordmark', 'wordmark-light', 'wordmark-md']);
    assert.equal(bdi.children[0].textContent, 'Emam Legal');
    assert.equal(bdi.children[1].textContent, 'and Consultancy');
    assert.equal(w.children[1].textContent, 'إدارتكم القانونية');
    const e = ui.brandEl();
    assert.equal(e.textContent, BRAND);
    assert.equal(ui.brandEl({ short: true }).textContent, SHORT);
    for (const n of ['fileSignature', 'filePen', 'fileLock', 'userCog', 'megaphone', 'mailWarning', 'landmark', 'truck', 'calendarClock', 'helpCircle', 'building', 'inboxStack', 'bookOpen', 'moreHorizontal']) assert.ok(ui.iconNames.includes(n), n);
  });

  // ───── EXP-7 (X10-M2/M3, L-12): الحركة في «متصفح» مصغّر (matchMedia + rAF) ─────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = () => dom.body.children.filter((c) => c.classList.contains('modal-backdrop') && !c.classList.contains('is-leaving'));

  test('EXP-7 phone sheet: enters from its own bottom edge; a ✕ dismissal exits first and closes after (interruptible); a programmatic close stays synchronous', async () => {
    globalThis.matchMedia = (q) => ({ matches: /max-width: 640px/.test(q) });
    try {
      let closed = 0;
      const m = ui.modal({ title: 'ورقة', body: 'نص', sheet: true, onClose: () => (closed += 1) });
      const backdrop = visible().at(-1);
      assert.equal(backdrop.children[0].classList.contains('modal-scrim'), true, 'the scrim is its own layer');
      assert.equal(backdrop.children[0].getAttribute('aria-hidden'), 'true');
      assert.match(m.el.style.transform, /^translate3d\(0,300px,0\)$/, 'starts one panel height below');
      await sleep(700);
      assert.equal(m.el.style.transform, '', 'at rest: no transform left (fixed children stay fixed)');
      const p = m.requestDismiss('dismiss');
      await sleep(0);
      assert.equal(closed, 0, 'the logical close waits for the exit (a grab could still cancel it)');
      await p;
      assert.equal(closed, 1);
      assert.equal(backdrop.isConnected, false, 'removed as soon as it is off screen');
      assert.equal(dom.body.classList.contains('has-modal'), false);
      const m2 = ui.modal({ title: 'ورقة', body: '', sheet: true, onClose: () => (closed += 1) });
      const b2 = visible().at(-1);
      m2.close();
      assert.equal(closed, 2, 'programmatic: onClose ran inside close()');
      assert.ok(b2.isConnected && b2.inert && b2.classList.contains('is-leaving'), 'still animating out, inert');
      await sleep(800);
      assert.equal(b2.isConnected, false);
    } finally {
      delete globalThis.matchMedia;
    }
  });

  test('EXP-7 dialogs materialise from their trigger (X10-M3): scale(0.94) → none, origin at the trigger; reduced motion = opacity only', async () => {
    globalThis.matchMedia = () => ({ matches: false });
    try {
      const m = ui.modal({ title: 'نافذة', body: 'نص' });
      assert.match(m.el.style.transform, /^scale\(0\.94/);
      assert.equal(m.el.style.opacity, '0.000');
      await sleep(700);
      assert.equal(m.el.style.transform, '');
      assert.equal(m.el.style.opacity, '');
      let closed = false;
      const m2 = ui.modal({ title: 'نافذة', body: '', onClose: () => (closed = true) });
      m2.close();
      assert.equal(closed, true);
      await sleep(800);
      assert.equal(m2.el.isConnected, false);
      globalThis.matchMedia = (q) => ({ matches: /reduce/.test(q) });
      const m3 = ui.modal({ title: 'نافذة', body: '' });
      assert.equal(m3.el.style.transform, '', 'reduced motion: no scale on any frame');
      await sleep(250);
      assert.equal(m3.el.style.transform, '');
      assert.equal(m3.el.style.opacity, '');
      m3.close();
      await sleep(250);
    } finally {
      delete globalThis.matchMedia;
    }
  });

  test('review: a dialog materialises all the way (no snap from half-way to 1) and fades out all the way before it is removed', async () => {
    globalThis.matchMedia = () => ({ matches: false });
    try {
      const trace = async (el, ms) => {
        const seen = [];
        const end = Date.now() + ms;
        while (Date.now() < end && el.isConnected) {
          seen.push(el.style.opacity);
          await sleep(2);
        }
        return seen;
      };
      const m = ui.modal({ title: 'نافذة', body: 'نص' });
      const open = await trace(m.el, 900);
      const nums = open.filter((x) => x !== '').map(Number);
      assert.equal(open.at(-1), '', 'at rest');
      assert.ok(nums.at(-1) > 0.95, `last frame before rest was ${nums.at(-1)} (the unit spring used to stop near 0.5 and jump)`);
      let removedAt = null;
      m.close();
      const out = await trace(m.el, 900);
      removedAt = out.filter((x) => x !== '').map(Number).at(-1);
      assert.equal(m.el.isConnected, false);
      assert.ok(removedAt <= 0.1, `removed at opacity ${removedAt} (used to vanish from ~0.4)`);
    } finally {
      delete globalThis.matchMedia;
    }
  });

  test('EXP-7 toast (X10-F1): enters from its edge (.is-shown) and leaves along the same path, removed on transitionend', async () => {
    const t1 = ui.toast('حُفظ', 'success', 0);
    assert.ok(t1.el.classList.contains('toast') && t1.el.classList.contains('is-shown'));
    t1.close();
    assert.ok(t1.el.classList.contains('is-leaving') && !t1.el.classList.contains('is-shown'));
    t1.el.dispatch('transitionend');
    assert.equal(t1.el.isConnected, false, 'gone on transitionend (no 200 ms timer while the next toast waits)');
    // review: a child's transition (the ✕ button hover/press) bubbles up — it is not the toast's own exit
    const t2 = ui.toast('حُفظ', 'success', 0);
    t2.close();
    t2.el.dispatch('transitionend', { target: t2.el.querySelector('.toast-close') });
    assert.equal(t2.el.isConnected, true, "a child's transitionend does not cut the exit short");
    t2.el.dispatch('transitionend');
    assert.equal(t2.el.isConnected, false);
  });

  test('EXP-7 form() X10-F2: no red on the first pass through an empty field; an error appears on leaving a wrong value and clears on the keystroke that fixes it', () => {
    for (const k of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) globalThis[k] = class {};
    try {
      const f = ui.form([{ name: 'email', type: 'email', label: 'البريد', required: true }], { values: { email: '' }, footer: false });
      const c = f.control('email');
      const el = c.focusEl();
      el.dispatch('blur');
      assert.equal(c.wrap.classList.contains('has-error'), false, 'untouched and empty: flagged on submit only');
      el.value = 'x@';
      el.dispatch('input');
      assert.equal(c.wrap.classList.contains('has-error'), false, 'not while typing');
      el.dispatch('blur');
      assert.equal(c.wrap.classList.contains('has-error'), true, 'punish late: on leaving the field');
      el.value = 'x@example.com';
      el.dispatch('input');
      assert.equal(c.wrap.classList.contains('has-error'), false, 'reward early: the fixing keystroke clears it');
      el.value = '';
      el.dispatch('input');
      el.dispatch('blur');
      assert.equal(c.wrap.classList.contains('has-error'), true, 'touched and emptied: the required message');
    } finally {
      for (const k of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) delete globalThis[k];
    }
  });
});

// ───────────────────────── EXP-7…EXP-10: الحركة والضغط والمواد والاهتزاز والصور (statics) ─────────────────────────

describe('v10 experience — motion, press, materials, haptics and images (EXP-7…EXP-10)', () => {
  const cssNoComments = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
  const pubCss = read('public/assets/css/public-site.css');
  const critical = pubCss.slice(pubCss.indexOf('/* @critical-start'), pubCss.indexOf('/* @critical-end */'));
  const nonCritical = pubCss.slice(pubCss.indexOf('/* @critical-end */'));

  test('ui.js imports sheet-motion.js and spring.js statically; .modal-sheet has no CSS transition; the grip is a 44 px handle; no pop-in/fade/toast-in keyframes left', () => {
    const uiSrc = read('public/assets/js/lib/ui.js');
    assert.match(uiSrc, /^import \{ attachSheet \} from '\.\/sheet-motion\.js';$/m);
    assert.match(uiSrc, /^import \{ spring, SPRING, reducedMotion \} from '\.\/spring\.js';$/m);
    assert.match(uiSrc, /attachSheet\(\{\s*panel: dialog,\s*scrim,/);
    assert.match(uiSrc, /motion\.exit\(reason, \{ interruptible: true \}\)/, 'user dismissals are interruptible');
    assert.match(uiSrc, /motion\.exit\(reason, \{ interruptible: false \}\)/, 'programmatic exits are not');
    const app = cssNoComments('public/assets/css/app.css');
    for (const m of app.matchAll(/([^{}]*\.modal-sheet[^{}]*)\{([^}]*)\}/g)) assert.ok(!/transition/.test(m[2]), m[1]);
    assert.match(app, /\.modal-sheet \.modal-grip \{[^}]*height: 44px;/);
    assert.match(app, /\.modal-sheet \.modal-grip,\s*\.modal-sheet \.modal-header \{\s*touch-action: none;/);
    assert.ok(!/@keyframes (pop-in|fade-in|fade-out|toast-in)\b/.test(app));
    assert.ok(!/animation: (pop-in|fade-in|fade-out|toast-in)\b/.test(app));
    assert.match(app, /\.toast\.is-leaving \{[^}]*transition-timing-function: var\(--ease-in-mirror/);
    assert.match(read('public/assets/css/v91-l-home.css'), /--toast-from: 12px;/, 'the lawyer phone toasts come from the bottom edge');
  });

  test('the beneficiary sheet loads its motion after first paint (L-11): dynamic import only, skipped on saveData or 2G (CS-32); grip, scrim layer, synchronous programmatic close', () => {
    const src = read('public/assets/js/public/portal-ui.js');
    assert.match(src, /import\('\.\.\/lib\/sheet-motion\.js'\)/);
    assert.match(src, /import\('\.\.\/lib\/haptics\.js'\)/);
    assert.ok(!/^import [^\n]*(sheet-motion|haptics|spring)\.js/m.test(src), 'no static import');
    assert.match(src, /c\.saveData === true \|\| \/2g\$\/\.test\(c\.effectiveType/);
    assert.match(src, /requestIdleCallback/);
    assert.match(src, /h\('div\.bp-sheet-grip', \{ 'aria-hidden': 'true' \}\)/);
    assert.match(src, /motion\.exit\('dismiss', \{ interruptible: true \}\)/);
    const css = read('public/assets/css/v91-portal.css');
    assert.match(css, /\.bp-sheet-grip \{[^}]*height: 44px;/);
    assert.match(css, /\.bp-sheet-wrap\.is-leaving \{\s*pointer-events: none;/);
  });

  test('sheet-motion: a finger that rested before lifting carries no momentum (no accidental dismiss)', () => {
    assert.match(read('public/assets/js/lib/sheet-motion.js'), /t - samples\[samples\.length - 1\]\[0\] > 100\) return 0;/);
  });

  test('X10-P2 pressables: /app + company in v10-experience.css, the home tiles in the critical CSS, the rest of the public site, /intake and the portal', () => {
    const v10 = read('public/assets/css/v10-experience.css');
    for (const sel of ['.btn,', '.icon-btn,', '.choice-tile,', '.tab,', '.chip:is(a, button),', '.copy-btn,', '.lh-tab,', '.nav-link,', '.k-row:is(a, button):active', '.lh-row-main:active', '.table tr.is-clickable:active > td']) assert.ok(v10.includes(sel), sel);
    assert.match(critical, /body\.pub \.pub-pick-tile:active,\s*body\.pub \.pub-pick-way:active \{\s*transform: scale\(var\(--press-scale\)\);/);
    assert.match(critical, /--press-scale: 0\.97;/);
    // EXP-8 critical-CSS fallback steps 1 and 2: the press transitions of both tile kinds live in the non-critical part
    assert.ok(!/body\.pub \.pub-pick-(tile|way) \{[^}]*transition:/.test(critical));
    assert.match(nonCritical, /body\.pub \.pub-pick-tile,\s*body\.pub \.pub-pick-way,\s*\.pub-btn,/);
    assert.match(critical, /:root \{\s*--press-scale: 1;\s*\}/, 'reduced motion keeps only the dim (critical part)');
    for (const sel of ['.pub-btn:active:not(:disabled)', 'body.pub .pub-tile-link:active', 'body.pub .pub-returning:active', '.pub-menu-toggle:active', '.pub-head-contact:active', 'body.pub .pub-listen:active']) assert.ok(nonCritical.includes(sel), sel);
    const forms = read('public/assets/css/v91-b-forms.css');
    for (const sel of ['.bmf-btn:active:not(:disabled)', '.bmf-topic:active', '.bmf-answer:active', '.bmf-topic-chip-btn:active', '.bmf-about-tile:active', '.bmf-when-chip:active']) assert.ok(forms.includes(sel), sel);
    const portal = read('public/assets/css/v91-portal.css');
    for (const sel of ['.bp-btn:active:not(:disabled)', '.bp-icon-btn:active', '.bp-choices button:active']) assert.ok(portal.includes(sel), sel);
    assert.match(portal, /\.bp-row:active \{\s*background-image: linear-gradient\(var\(--press-dim\), var\(--press-dim\)\);\s*\}/, 'rows dim only');
    // X10-P3: one touchstart enabler per surface (CSP-safe, no inline handler)
    for (const f of ['public/assets/js/public/menu.js', 'public/assets/js/public/portal-ui.js', 'public/assets/js/app/main.js']) assert.match(read(f), /document\.addEventListener\('touchstart', \(\) => \{\}, \{ passive: true \}\);/, f);
  });

  test('X10-L materials: frosted header/topbar/bottom bars with a solid fallback; the scroll edge lives in the non-critical part', () => {
    // #ffffffdb = white at 0.86 (shorter in the 12 KB critical block)
    assert.match(critical, /\.pub-header \{[^}]*background: #ffffffdb;[^}]*-webkit-backdrop-filter: saturate\(1\.8\) blur\(20px\);[^}]*backdrop-filter: saturate\(1\.8\) blur\(20px\);/);
    // v11 visual (intended): the wordmark is visually hidden in the header at every width (the mark image carries the brand;
    // the text stays for screen readers), so at 200 % zoom on a 360 px phone the mark is still alone
    assert.match(critical, /\.pub-sr,\s*\.pub-header \.pub-wordmark \{\s*position: absolute !important;[^}]*clip-path: inset\(50%\);/, 'wordmark visually hidden at every width');
    assert.ok(!critical.includes('animation-timeline'), 'the scroll edge is not critical');
    assert.match(nonCritical, /@supports \(animation-timeline: scroll\(\)\) \{\s*\.pub-header \{/);
    assert.match(nonCritical, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
    assert.match(read('public/assets/css/v91-portal.css'), /\.bp-bar \{\s*background: rgb\(255 255 255 \/ 0\.86\);/);
  });

  test('X10-A: the new reduced-motion rule (opacity/colour cross-fade 150 ms, transforms snap) in app.css and the public non-critical part; transparency, contrast and forced-colors blocks', () => {
    const app = cssNoComments('public/assets/css/app.css');
    assert.match(app, /transition-property: opacity, color, background-color, border-color, box-shadow !important;\s*transition-duration: 150ms !important;/);
    assert.ok(!/transition-duration: 0\.01ms/.test(app), 'the 9.2 "kill everything" rule is gone from /app');
    assert.match(nonCritical, /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*transition-property: opacity, color, background-color, border-color, box-shadow !important;\s*transition-duration: 150ms !important;/);
    for (const q of ['@media (prefers-reduced-transparency: reduce)', '@media (prefers-contrast: more)', '@media (forced-colors: active)']) {
      assert.ok(nonCritical.includes(q), `public-site.css ${q}`);
      assert.ok(read('public/assets/css/v91-portal.css').includes(q), `v91-portal.css ${q}`);
    }
  });

  test('X10-T1 and restraint: no letter-spacing on .sidebar-version, inputs 16 px on touch, tabular numbers; no transition: all in any stylesheet this lane changed', () => {
    for (const f of ['public/assets/css/v91-l-home.css', 'public/assets/css/v9-platform.css']) assert.match(read(f), /\.sidebar-version \{[^}]*letter-spacing: 0;/, f);
    const app = read('public/assets/css/app.css');
    assert.match(app, /@media \(max-width: 640px\), \(pointer: coarse\) \{\s*\.input,\s*select\.input,\s*textarea\.input \{\s*font-size: 16px;/);
    assert.match(app, /\.code-tag,\s*\.bell-count,\s*\.table td\.align-end,\s*\.char-count \{\s*font-variant-numeric: tabular-nums;/);
    for (const f of ['app.css', 'public-site.css', 'v91-b-forms.css', 'v91-portal.css', 'v91-l-home.css', 'v9-platform.css', 'pages-d.css', 'v10-experience.css']) {
      assert.ok(!/transition:\s*all\b/.test(cssNoComments(`public/assets/css/${f}`)), f);
    }
  });

  test('X10-M6 haptics only on real commits: intake send (success/error, loaded after the first screen so cold /intake stays ≤ 6 files), portal, outcome sheet, «اعمله طلب», lawyer task «تم» and opinion submit (H-E5)', () => {
    const intake = read('public/assets/js/public/intake.js');
    assert.ok(!/^import [^\n]*haptics\.js/m.test(intake), 'not in the static closure (R1)');
    assert.match(intake, /import\('\.\.\/lib\/haptics\.js'\)/);
    assert.match(intake, /showSuccess\(res \|\| \{\}, nameInput\.value\.trim\(\), sent\);\s*haptic\('success'\);/);
    assert.equal((intake.match(/haptic\('success'\)/g) || []).length, 1, 'exactly one success per send');
    assert.match(intake, /haptic\('error'\);/);
    const portal = read('public/assets/js/public/portal.js');
    assert.match(portal, /haptic\('success'\); \/\/ v10 \(X10-M6\): الورق وصل فعلًا/);
    assert.equal((portal.match(/haptic\('commit'\)/g) || []).length, 2, 'RSVP and «موافقة»');
    assert.match(read('public/assets/js/app/components/outcome-sheet.js'), /m\.close\('saved'\);\s*haptic\('success'\);/);
    // v11 gate (J-13): acceptToast also takes the address form for the toast pronoun; the haptic stays its first statement
    assert.match(read('public/assets/js/app/components/story-sheet.js'), /export function acceptToast\(res[^)]*\) \{\s*haptic\('success'\);/);
    assert.match(read('public/assets/js/app/pages/lawyer/home.js'), /import \{ haptic \} from '\.\.\/\.\.\/\.\.\/lib\/haptics\.js';/);
    assert.match(read('public/assets/js/app/pages/lawyer/home.js'), /haptic\('commit'\);[^\n]*\n\s*const t = toast\('سُجّلت المهمة منجزة'/);
    assert.match(read('public/assets/js/app/pages/lawyer/write.js'), /haptic\('success'\);[^\n]*\n\s*toast\(`قُدّم رأيك/);
    // never on open/close: the modal/sheet code has no haptic call
    assert.ok(!/haptic\(/.test(read('public/assets/js/lib/ui.js')));
    assert.ok(!/buzz\(|haptic\(/.test(read('public/assets/js/public/portal-ui.js').replace(/^\s*\/\/.*$/gm, '').replace(/export const haptic = [^\n]+/, '')));
  });

  test('intake phone field: inline validation on leaving the field, the error clears when the number is fixed (X10-F2)', () => {
    const intake = read('public/assets/js/public/intake.js');
    assert.match(intake, /phoneInput\.addEventListener\('blur', \(\) => \{\s*if \(phoneInput\.value\.trim\(\) && !normalizeEgPhone\(phoneInput\.value\)\) phoneField\.setError\(MSG\.phoneBad\);/);
    assert.match(intake, /if \(phoneMsg !== MSG\.phoneBad \|\| !phoneInput\.value\.trim\(\)\) phoneField\.setError\(''\);/);
  });

  test('X10-C5 images: favicon.ico holds the 16/32/48 scales mark as PNG; og-image ≤ 300 KB; the public footer links «دخول الشركات» once the portal exists', async () => {
    const ico = fs.readFileSync(path.join(PUB, 'favicon.ico'));
    assert.equal(ico.readUInt16LE(2), 1);
    const n = ico.readUInt16LE(4);
    const sizes = [];
    for (let i = 0; i < n; i += 1) {
      sizes.push(ico.readUInt8(6 + 16 * i));
      const off = ico.readUInt32LE(6 + 16 * i + 12);
      assert.equal(ico.slice(off + 1, off + 4).toString(), 'PNG');
    }
    assert.deepEqual(sizes, [16, 32, 48]);
    assert.ok(fs.statSync(path.join(PUB, 'assets/img/og-image.png')).size < 300 * 1024);
    // review: the link appears only while the company service is on and its page exists (never a link to a 404)
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-exp-pub-'));
    for (const e of fs.readdirSync(PUB)) if (e !== 'company.html') fs.symlinkSync(path.join(PUB, e), path.join(tmp, e));
    fs.writeFileSync(path.join(tmp, 'company.html'), '<!doctype html><title>{{brand_short}}</title><!--bm:head-->');
    const real = await startTestApp({ seed: 'none' });
    const t = await startTestApp({ seed: 'none', config: { publicDir: tmp } });
    try {
      const realHome = (await real.client().get('/')).body;
      assert.equal(/href="\/company"/.test(realHome), fs.existsSync(path.join(PUB, 'company.html')), 'this tree: link iff public/company.html exists');
      const home = (await t.client().get('/')).body;
      assert.match(home, /<a href="\/company" class="pub-staff-link">دخول الشركات<\/a>/);
      assert.match(home, /<li><a href="\/company">دخول الشركات<\/a><\/li>/);
      t.app.settings.set('b2b_enabled', false);
      const off = (await t.client().get('/')).body;
      assert.doesNotMatch(off, /href="\/company"/, 'company service off: no link');
      assert.match(off, /<a href="\/app" class="pub-staff-link">دخول فريق العمل والمحامين<\/a>/);
    } finally {
      await t.close();
      await real.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ───────────────────────── v10-experience.css ─────────────────────────

describe('v10 experience — the shared stylesheet (EXP-2)', () => {
  const css = read('public/assets/css/v10-experience.css');
  test('linked last in app.html (after app.css); every kit class of §4.2 is defined', () => {
    const html = read('public/app.html');
    const links = [...html.matchAll(/href="\/assets\/css\/([\w.-]+)\.css"/g)].map((m) => m[1]);
    assert.ok(links.indexOf('v10-experience') > links.indexOf('app'));
    for (const sel of ['.k-chrome', '.k-chrome-start', '.k-chrome-end', '.k-tabbar', '.k-tab', '.k-tab-badge', '.k-tab.is-active', 'body.k-keyboard .k-tabbar', '.k-row', '.k-list', '.step-tracker', '.step-tracker-step.is-done', '.step-tracker-step.is-current', '.step-tracker-step.is-waiting', '.wordmark', '.wordmark-md', '.wordmark-lg', '.wordmark-light', '.wordmark-dark', '.wordmark-desc', '.num', '.k-solid-chrome .k-chrome', '.modal-backdrop.is-leaving']) assert.ok(css.includes(sel), sel);
    for (const tok of ['--press-scale:', '--press-dim:', '--ease-out:', '--ease-in-mirror:', '--dur-press:', '--dur-release:', '--dur-fade:', '--mat-chrome:', '--t-display:', '--t-title1:', '--t-title2:', '--t-headline:', '--t-body:', '--t-callout:', '--t-footnote:', '--t-caption:']) assert.ok(css.includes(tok), tok);
    for (const q of ['@media (prefers-reduced-motion: reduce)', '@media (prefers-reduced-transparency: reduce)', '@media (prefers-contrast: more)', '@media (forced-colors: active)']) assert.ok(css.includes(q), q);
  });
  test('no colour literals outside custom-property declarations, no transition: all, no letter-spacing on Arabic', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = body
      .split('\n')
      .filter((l) => !/^\s*--[\w-]+\s*:/.test(l))
      .filter((l) => /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(|(?<![-\w])(?:white|black)(?![-\w])/i.test(l));
    assert.deepEqual(bad, []);
    assert.ok(!/transition:\s*all/.test(body));
    for (const m of body.matchAll(/([^{}]+)\{[^}]*letter-spacing:[^}]*\}/g)) assert.match(m[1], /wordmark|:lang\(en\)|\bb\b/, m[1]);
  });
});

// ───────────────────────── مراجعة المسار (review step) ─────────────────────────

describe('v10 experience — review fixes', () => {
  const lum = (hex) => {
    const [r, g, b] = (typeof hex === 'string' ? B.hexToRgb(hex) : hex).map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // «كروم» شفاف 0.86 فوق محتوى غامق (أسوأ حالة: فوق الأسود)
  const CHROME_WORST = [219, 219, 219];

  test('a brand name written in Arabic keeps its own direction and language (brand_inline, header/footer lockup)', async () => {
    const { nameDirAttrs, wordmarkHtml } = await import('../src/site.js');
    assert.equal(nameDirAttrs(BRAND), 'dir="ltr" lang="en"');
    assert.equal(nameDirAttrs('إمام للمحاماة والاستشارات'), 'dir="rtl" lang="ar"');
    assert.match(wordmarkHtml('إمام للمحاماة والاستشارات', 'إمام'), /^<bdi class="pub-wordmark" dir="rtl" lang="ar"><b>إمام<\/b> <span>للمحاماة والاستشارات<\/span><\/bdi>$/);
    assert.match(read('src/site.js'), /brand_inline: `<bdi class="wordmark" \$\{nameDirAttrs\(brandName\)\}>/);
    assert.ok(read('public/assets/js/public/intake.js').includes("h('bdi', /[\\u0600-\\u06FF]/.test(brandName()) ? { dir: 'rtl', lang: 'ar' } : { dir: 'ltr', lang: 'en' }, brandName())"), 'intake preparing card');
  });

  test('hostile colours: frosted chrome and the gold login line are kept only where the contract guarantees AA; custom colours get solid chrome', () => {
    // الأخضر الملكي والذهبي: الدرجة 700 على «كروم» شفاف فوق محتوى غامق ≥ 4.5، والذهبي 300 على لوحة الدخول (700) ≥ 4.5
    assert.ok(ratio(B.LEGACY.primary[700], CHROME_WORST) >= 4.5, `p700 on chrome ${ratio(B.LEGACY.primary[700], CHROME_WORST)}`);
    assert.ok(ratio(B.LEGACY.accent[300], B.LEGACY.primary[700]) >= 4.5, `a300 on p700 ${ratio(B.LEGACY.accent[300], B.LEGACY.primary[700])}`);
    // ألوان مخصصة تستوفي عقد التباين كاملًا قد تنزل تحت 4.5 على الشفاف وعلى لوحة الدخول — لذلك تصبح الأشرطة صلبة
    const t = B.buildTheme('#44b172', '#feb990');
    assert.ok(B.checkContract(t).every((c) => c.ok), 'the generator contract holds');
    assert.ok(ratio(t.primary[700], CHROME_WORST) < 4.5, 'but p700 on frosted chrome can fail');
    assert.ok(ratio(t.primary[700], '#ffffff') >= 4.5, 'while p700 on solid white passes (T1)');
    const t2 = B.buildTheme('#e40606', '#8b894d');
    assert.ok(ratio(t2.accent[300], t2.primary[700]) < 4.5 && ratio('#ffffff', t2.primary[700]) >= 4.5, 'gold 300 on the login panel can fail, white cannot');
    const solid = (file, sels) => {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const sel of sels) assert.match(css, new RegExp(`html:has\\(#bm-theme\\) ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*backdrop-filter: none;`), `${file}: ${sel}`);
    };
    solid('public/assets/css/v10-experience.css', ['.topbar', '.is-lawyer .lh-bottom-nav', '.k-chrome', '.k-tabbar']);
    solid('public/assets/css/public-site.css', ['.pub-header']);
    solid('public/assets/css/v91-portal.css', ['.bp-bar']);
    assert.match(read('public/assets/css/v10-experience.css'), /html:has\(#bm-theme\) \.wordmark-dark span,\s*html:has\(#bm-theme\) \.wordmark-dark \+ \.wordmark-desc \{\s*color: var\(--surface\);/);
    // white is guaranteed on every dark step the dark wordmark can sit on (T1/T2/T3)
    for (const k of [700, 800, 900]) assert.ok(ratio('#ffffff', t2.primary[k]) >= 4.5, `white on p${k}`);
    // the solid-chrome rule is not in the critical part of public-site.css (budget) — it follows the non-critical v10 block
    const pub = read('public/assets/css/public-site.css');
    assert.ok(pub.indexOf('html:has(#bm-theme) .pub-header') > pub.indexOf('v10 experience — الضغط والمواد والإتاحة'));
  });

  test('the /app login footer line reads ≥ 4.5:1 over the gold glow on royal green (was 4.39 at 0.6 alpha)', () => {
    const css = read('public/assets/css/app.css');
    const a = Number((/\.login-foot \{[^}]*color: rgba\(255, 255, 255, ([\d.]+)\)/.exec(css) || [])[1]);
    assert.ok(a >= 0.72, `alpha ${a}`);
    const glow = [50, 81, 47]; // measured pixel under the line (Playwright, 1366×768)
    const fg = glow.map((c) => 255 * a + c * (1 - a));
    assert.ok(ratio(fg, glow) >= 4.5, `${ratio(fg, glow)}`);
  });
});

describe('v10 experience — gate greps this lane owns (G-2, raw text incl. comments)', () => {
  test('no "transition: all" anywhere in v10-*.css (comments too); no literal brand in src/ outside constants.js', () => {
    for (const f of fs.readdirSync(path.join(PUB, 'assets/css')).filter((x) => /^v10-.*\.css$/.test(x))) {
      assert.ok(!read(`public/assets/css/${f}`).includes('transition: all'), f);
    }
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const hits = walk(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js') && !f.endsWith(`${path.sep}constants.js`) && fs.readFileSync(f, 'utf8').includes('Emam Legal'));
    assert.deepEqual(hits.map((f) => path.relative(ROOT, f)), []);
  });
});
