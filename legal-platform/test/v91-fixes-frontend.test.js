// إصلاحات 9.1 (الواجهة): تباين أزرار صفحة المتابعة، الشريط السفلي للمحامي، أهداف اللمس، لوحة الإشعارات على الهاتف،
// وزن الخط 500، شاشة الدخول الخفيفة، فتح «اليوم» دون اتصال داخل نافذة الجلسة فقط، تأكيد واتساب من صفحتها،
// روابط ونصوص الرسائل في صفحتها، مدة التسجيل الصوتي، أسماء صور الطلب، نصوص التذكير، محرر الرد، وحجم JS صفحة المتابعة.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, newCase, assign } from './lane-b-kit.test.js';
import { bottomNavActive } from '../public/assets/js/app/lawyer-shell.js';
import { sessionUntil } from '../public/assets/js/lib/api.js';
import { withoutPortalLinks, glossTerms, glossText } from '../public/assets/js/public/words.js';
import { fixMp4Duration } from '../public/assets/js/public/recorder.js';
import { unansweredClientMessage, answerSteps, resolveAudioDuration } from '../public/assets/js/app/pages/admin/case-detail.js';
import { GENERIC_DOC_NAME } from '../public/assets/js/app/pages/admin/intake-detail.js';
import { paramSentence } from '../public/assets/js/app/pages/admin/automations.js';
import { clientSummary } from '../src/ai/heuristic.js';
import { stripJsCommentLines, preloadClosure, transformAsset, setPublicRoot } from '../src/site-assets.js';
import { LEGACY } from '../public/assets/js/lib/brand-color.js'; // v9.2 (تغيير مقصود): --bp-teal → var(--primary-700)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** كتلة قاعدة CSS (المحددات كما هي) أو '' */
function cssBlock(css, selector) {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i) + 1);
}

/** نسبة التباين WCAG بين لونين #rrggbb */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** مخزن محلي وهمي للدوال التي تقرأ window.localStorage */
function fakeStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// ─────────────────────────────── صفحة المتابعة: التباين ───────────────────────────────

describe('v9.1 fixes — portal link-buttons keep their colours (contrast ≥ 4.5)', () => {
  test('the public link colour rule skips .bp-btn and .bp-row, so an <a> button is not teal on teal/green', () => {
    const css = read('public/assets/css/public-site.css');
    const rules = css.split('\n').filter((l) => l.startsWith('body.pub a:where('));
    assert.equal(rules.length, 2, 'link + hover rules');
    for (const r of rules) {
      assert.match(r, /:not\(\.bp-btn\)/, r);
      assert.match(r, /:not\(\.bp-row\)/, r);
    }
  });

  test('primary and WhatsApp buttons: white on their background ≥ 4.5; secondary/text teal on white ≥ 4.5', () => {
    const css = read('public/assets/css/v91-portal.css');
    // v9.2 (تغيير مقصود): --bp-teal صار var(--primary-700) (ألوان المؤسسة)؛ يُحل إلى قيمته الافتراضية LEGACY.primary[700]
    const LEGACY_VARS = { 'primary-700': LEGACY.primary[700], 'primary-900': LEGACY.primary[900], 'primary-50': LEGACY.primary[50], 'accent-500': LEGACY.accent[500] };
    const v = (name) => {
      const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6}|var\\(--([a-z0-9-]+)\\))`).exec(css);
      return m ? (m[2] ? LEGACY_VARS[m[2]] : m[1]) : undefined;
    };
    const teal = v('bp-teal');
    const wa = v('bp-wa');
    assert.ok(teal && wa, 'tokens found');
    assert.match(cssBlock(css, '.bp-btn--primary'), /color: #fff/);
    assert.match(cssBlock(css, '.bp-btn--whatsapp'), /color: #fff/);
    assert.ok(contrast('#ffffff', teal) >= 4.5, `primary ${contrast('#ffffff', teal)}`);
    assert.ok(contrast('#ffffff', wa) >= 4.5, `whatsapp ${contrast('#ffffff', wa)}`);
    assert.ok(contrast(teal, '#ffffff') >= 4.5, 'secondary/text');
    // ما كان يحدث: لون الرابط #145d6f على خلفية الزر
    assert.ok(contrast('#145d6f', teal) < 1.5 && contrast('#145d6f', wa) < 1.5, 'the old link colour was unreadable on these buttons');
  });
});

// ─────────────────────────────── المحامي: الشريط السفلي ───────────────────────────────

describe('v9.1 fixes — lawyer bottom nav (L-16)', () => {
  const tabs = ['/my', '/my/assignments', '/my/calendar'];
  test('«اليوم» lights up for /my only; «المزيد» for matters, statement, notifications and account', () => {
    assert.deepEqual(bottomNavActive('/my', tabs), { tab: '/my', more: false });
    assert.deepEqual(bottomNavActive('/my/assignments', tabs), { tab: '/my/assignments', more: false });
    assert.deepEqual(bottomNavActive('/my/assignments/16/write', tabs), { tab: '/my/assignments', more: false });
    assert.deepEqual(bottomNavActive('/my/calendar', tabs), { tab: '/my/calendar', more: false });
    for (const p of ['/my/matters', '/my/matters/2', '/my/statement', '/notifications', '/account']) assert.deepEqual(bottomNavActive(p, tabs), { tab: null, more: true }, p);
    assert.deepEqual(bottomNavActive('/print/statement/3', tabs), { tab: null, more: false });
  });
});

// ─────────────────────────────── أهداف اللمس ───────────────────────────────

describe('v9.1 fixes — tap targets', () => {
  test('lawyer calendar on phones: event title links ≥ 44px; month-view day buttons fill the cell (≥ 44px)', () => {
    const css = read('public/assets/css/v91-l-court.css');
    const phone = css.slice(css.indexOf('@media (max-width: 640px) {\n  .lc-cal-lawyer'));
    assert.match(cssBlock(phone, '.lc-cal-lawyer .v9p-cal-title a'), /min-height: 44px/);
    assert.match(cssBlock(phone, '.lc-cal-lawyer .v9p-day-num'), /min-height: 44px/);
    assert.match(cssBlock(phone, '.lc-cal-lawyer .v9p-day-num'), /width: 100%/);
    assert.match(cssBlock(phone, '.lc-cal-lawyer .v9p-month'), /margin-inline: -16px/, '7 × 44px fit at 360px');
  });

  test('writing-mode save chip 44px; print toolbar buttons 44px on phones', () => {
    assert.match(cssBlock(read('public/assets/css/v91-lawyer-work.css'), '.lw-savechip'), /min-height: 44px/);
    const prog = read('public/assets/css/v9-programs.css');
    const at = prog.indexOf('.print-toolbar .btn,');
    assert.ok(at > 0 && prog.lastIndexOf('@media (max-width: 640px)', at) > prog.lastIndexOf('}\n\n/*', at) - 2000);
    assert.match(prog.slice(at, prog.indexOf('}', at)), /min-height: 44px/);
  });

  test('beneficiary pages: help phone/WhatsApp, «وكمان…», «عندك مشكلة جديدة؟» and legal TOC links are 48px', () => {
    const forms = read('public/assets/css/v91-b-forms.css');
    const i = forms.indexOf('.bmf-contact a,\n.bmf-fine a {');
    assert.ok(i > 0);
    assert.match(forms.slice(i, forms.indexOf('}', i)), /min-height: 48px/);
    const portal = read('public/assets/css/v91-portal.css');
    assert.match(cssBlock(portal, '.bp-more a'), /min-height: 48px/);
    assert.match(cssBlock(portal, '.bp-new a'), /min-height: 48px/);
    assert.match(cssBlock(read('public/assets/css/public-site.css'), 'body.pub .pub-toc a'), /min-height: 48px/);
  });
});

// ─────────────────────────────── فريق العمل: الإشعارات والخط ───────────────────────────────

describe('v9.1 fixes — staff notification panel and the 500 weight', () => {
  test('on phones the bell dropdown is pinned 8px from both edges for every role (not only lawyers)', () => {
    const css = read('public/assets/css/app.css');
    const i = css.indexOf('.dropdown-anchor > .dropdown {');
    assert.ok(i > 0);
    assert.ok(css.lastIndexOf('@media (max-width: 640px) {', i) > css.indexOf('.dropdown-foot {'), 'inside a phone media query');
    const block = css.slice(i, css.indexOf('}', i));
    assert.match(block, /position: fixed/);
    assert.match(block, /inset-inline: 8px/);
    assert.match(block, /width: auto/);
  });

  test('font-weight 500 resolves to the 600 face (as in 9.0), no extra font file', () => {
    const css = read('public/assets/css/app.css');
    const faces = [...css.matchAll(/@font-face \{[^}]*font-weight: ([\d ]+);[^}]*url\("\/assets\/fonts\/(plex-[a-z]+-\d+)\.woff2"\)/g)].map((m) => [m[2], m[1].trim()]);
    assert.deepEqual(faces.filter(([f]) => f.endsWith('-600')).map(([, w]) => w), ['500 600', '500 600']);
    assert.equal(faces.length, 6);
    assert.equal(fs.existsSync(path.join(PUB, 'assets/fonts/plex-arabic-500.woff2')), false);
  });
});

// ─────────────────────────────── شاشة الدخول (L-07) ───────────────────────────────

describe('v9.1 fixes — cold login stays light (L-07)', () => {
  test('the login screen uses only 400/700 (no 500/600 file) and does not fetch the full /api/meta before login', () => {
    const lh = read('public/assets/css/v91-l-home.css');
    const i = lh.indexOf('.login-page :is(');
    assert.ok(i > 0);
    const block = lh.slice(i, lh.indexOf('}', i));
    for (const sel of ['.field-label', '.btn', '.lh-forgot', '.demo-name', '.badge', '.field-error']) assert.ok(block.includes(sel), sel);
    assert.match(block, /font-weight: 700/);
    const main = read('public/assets/js/app/main.js');
    assert.equal(/showLogin\(\)\.then\(loadFullMetaSoon\)/.test(main), false, 'no background full meta on the login screen');
    assert.match(main, /\[\{ createShell \}\] = await Promise\.all\(\[loadShell\(\), loadFullMeta\(\)\]\)/, 'full meta comes with the shell after login');
  });
});

// ─────────────────────────────── فتح «اليوم» دون اتصال ───────────────────────────────

describe('v9.1 fixes — offline «اليوم» only inside the server session window', () => {
  let t;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
  });
  after(async () => {
    await t.close();
  });

  test('sessionUntil: the earlier of expiry and last activity + idle limit, minus a 10-minute margin', () => {
    const at = Date.parse('2026-10-07T10:00:00Z');
    assert.equal(sessionUntil({ expires_at: '2026-10-14T10:00:00Z', idle_hours: 72 }, at), at + 72 * 3600e3 - 10 * 60e3);
    assert.equal(sessionUntil({ expires_at: '2026-10-07T12:00:00Z', idle_hours: 72 }, at), Date.parse('2026-10-07T12:00:00Z'));
    assert.equal(sessionUntil(null, at), 0);
    assert.equal(sessionUntil({ expires_at: 'x', idle_hours: 12 }, at), 0);
    assert.equal(sessionUntil({ expires_at: '2026-10-14T10:00:00Z', idle_hours: 0 }, at), 0);
  });

  test('/api/auth/session carries the window for a signed-in user (idle limit of a remembered lawyer) and nothing for a guest', async () => {
    const anon = ok(await t.client().get('/api/auth/session'));
    assert.equal(anon.session, undefined);
    const admin = ok(await (await t.login('admin')).get('/api/auth/session'));
    assert.ok(Date.parse(admin.session.expires_at) > Date.now());
    assert.equal(admin.session.idle_hours, t.app.auth.idleHours());
    assert.ok(admin.session.last_seen_at);
    const c = t.client();
    ok(await c.post('/api/auth/login', { username: 'rania', password: 'Lawyer@2026', remember: true }));
    const rania = ok(await c.get('/api/auth/session'));
    assert.equal(rania.user.username, 'rania');
    assert.ok(rania.session.idle_hours > t.app.auth.idleHours(), 'remembered lawyer: longer idle limit');
    assert.equal(Object.keys(rania.session).sort().join(','), 'expires_at,idle_hours,last_seen_at', 'only the window, no token');
  });

  test('main.js: offline boot needs an unexpired window; 401/user=null clears the cached «اليوم» and the last lawyer', () => {
    const main = read('public/assets/js/app/main.js');
    assert.match(main, /function lastLawyer\(\) \{\s*const u = readLastUser\(\);\s*return u && Number\(u\.until\) > Date\.now\(\) \? u : null;/);
    assert.match(main, /if \(currentUser\) saveSessionWindow\(currentUser, res\.session\);/);
    assert.match(main, /const ended = readLastUser\(\);\s*sessionEnded\(\);/);
    assert.match(main, /window\.addEventListener\('auth:expired', \(\) => \{\s*if \(!currentUser\) return;\s*sessionEnded\(\);/);
    assert.match(main, /function sessionEnded\(\) \{\s*clearUserCaches\(null\);/);
    // clearUserCaches يمسح bm-last-user ونسخ «اليوم»
    assert.match(main, /store\.remove\(LAST_USER_KEY\);[\s\S]{0,400}k\.startsWith\('bm-today:'\) \|\| k === 'bm-today-count'/);
  });

  test('draft-store: another account signing in removes the previous lawyer’s unsent drafts; own drafts stay', async () => {
    const prev = globalThis.window;
    const ls = fakeStorage();
    globalThis.window = { localStorage: ls, sessionStorage: fakeStorage() };
    try {
      const m = await import('../public/assets/js/app/components/draft-store.js');
      ls.setItem('bm-draft:9:16', JSON.stringify({ body: 'نص الرأي', at: Date.now() }));
      ls.setItem('bm-notes:9:4', JSON.stringify({ checked: [1] }));
      ls.setItem('bm-draft:19:2', JSON.stringify({ body: 'رأي آخر', at: Date.now() }));
      ls.setItem('bm-today:9', '{}');
      assert.equal(m.hasAnyPendingDraft(), true);
      assert.equal(m.clearOtherUsersDrafts(19), 2);
      assert.equal(ls.getItem('bm-draft:9:16'), null);
      assert.equal(ls.getItem('bm-notes:9:4'), null);
      assert.ok(ls.getItem('bm-draft:19:2'));
      assert.ok(ls.getItem('bm-today:9'), 'only drafts are touched here');
    } finally {
      globalThis.window = prev;
    }
  });
});

// ─────────────────────────────── تأكيد الرقم على واتساب (B91-01) ───────────────────────────────

describe('v9.1 fixes — honest WhatsApp promise and a second chance to confirm', () => {
  test('success screen step 3 promises WhatsApp only once she sends the number', () => {
    const intake = read('public/assets/js/public/intake.js');
    assert.ok(intake.includes("!confirmUrl ? 'على صفحتك' : sent ? 'على واتساب وعلى صفحتك' : g('على صفحتك، وعلى واتساب لو بعت{ي}لنا رقم الطلب')"));
    assert.match(intake, /if \(sent\) paintStep3\(true\);/);
    assert.match(intake, /localStorage\.setItem\('bm_wa_confirm', JSON\.stringify\(\{ ref, url: confirmUrl, at: new Date\(\)\.toISOString\(\) \}\)\)/);
    assert.match(intake, /localStorage\.removeItem\('bm_wa_confirm'\)/, '«مش موبايلك؟ امسحيها» clears it too');
  });

  test('portal: the saved confirmation link is offered for this request only, for 30 days, never after confirmation', async () => {
    const prev = globalThis.window;
    globalThis.window = { localStorage: fakeStorage() };
    try {
      const ui = await import('../public/assets/js/public/portal-ui.js');
      const url = 'https://wa.me/201011112222?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85';
      window.localStorage.setItem(ui.WA_CONFIRM_KEY, JSON.stringify({ ref: 'REQ-2026-00037', url, at: new Date().toISOString() }));
      assert.equal(ui.savedWaConfirm(['REQ-2026-00037']), url);
      assert.equal(ui.savedWaConfirm(['REQ-2026-00036']), null, 'another request');
      window.localStorage.setItem(ui.WA_CONFIRM_KEY, JSON.stringify({ ref: 'REQ-2026-00037', url: 'https://evil.example/?text=x', at: new Date().toISOString() }));
      assert.equal(ui.savedWaConfirm(['REQ-2026-00037']), null, 'only wa.me links');
      window.localStorage.setItem(ui.WA_CONFIRM_KEY, JSON.stringify({ ref: 'REQ-2026-00037', url, at: new Date(Date.now() - 31 * 86400e3).toISOString() }));
      assert.equal(ui.savedWaConfirm(['REQ-2026-00037']), null, 'expired with the code');
      assert.equal(window.localStorage.getItem(ui.WA_CONFIRM_KEY), null);
    } finally {
      globalThis.window = prev;
    }
    const portal = read('public/assets/js/public/portal.js');
    assert.match(portal, /function waConfirmCard\(\) \{\s*const home = state\.data\.home;\s*if \(home\.whatsapp_confirmed\) \{\s*storage\.del\(WA_CONFIRM_KEY\);\s*return null;/);
    assert.ok(portal.includes("g('عايز{ة} يوصلك الجديد على واتساب؟')"));
    assert.match(read('public/assets/js/public/portal-ui.js'), /storage\.del\(WA_CONFIRM_KEY\);/, 'forgetThisPhone clears it');
  });
});

// ─────────────────────────────── الرسائل في صفحتها ───────────────────────────────

describe('v9.1 fixes — message bubbles: no portal links, isolated codes and file names', () => {
  test('withoutPortalLinks drops the «صفحتك» link line or label, keeps everything else', () => {
    assert.equal(withoutPortalLinks('ردّنا جاهز.\nالرد كامل على صفحتك: /p/dRuxY0IcrrppoZDh3mnP-bZBew7VCxqs'), 'ردّنا جاهز.');
    assert.equal(withoutPortalLinks('محتاجين صورة الورقة.\nصوّري الورقة وابعتيها هنا، أو من صفحتك: https://bm.org/p/dRuxY0IcrrppoZDh3mnP-bZBew7VCxqs'), 'محتاجين صورة الورقة.\nصوّري الورقة وابعتيها هنا.');
    assert.equal(withoutPortalLinks('رقم طلبك REQ-2026-00032\nشوفي https://example.org/help'), 'رقم طلبك REQ-2026-00032\nشوفي https://example.org/help');
    assert.equal(withoutPortalLinks(''), '');
  });

  test('portal.js: codes nowrap, URLs and file names isolated LTR, link lines stripped in bubbles; audio shows its length', () => {
    const portal = read('public/assets/js/public/portal.js');
    assert.match(portal, /h\('bdi\.bp-ref-inline', \{ dir: 'ltr' \}, part\)/);
    assert.match(portal, /h\('bdi\.bp-url-inline', \{ dir: 'ltr' \}, part\)/);
    assert.match(portal, /h\('bdi\.bp-fname', \{ dir: 'ltr' \}, d\.filename\)/);
    assert.match(portal, /withoutPortalLinks\(m\.body\)/);
    assert.match(portal, /h\('audio', \{ controls: true, preload: 'metadata', src: docHref\(d\.id\)/);
    const css = read('public/assets/css/v91-portal.css');
    assert.match(cssBlock(css, '.bp-ref-inline'), /white-space: nowrap/);
  });

  test('#papers with no papers keeps its title and offers a way to send one', () => {
    const portal = read('public/assets/js/public/portal.js');
    const i = portal.indexOf('function papersView()');
    const body = portal.slice(i, portal.indexOf('\n}\n', i));
    assert.ok(!body.includes("notFoundView('لسه مفيش ورق.')"));
    assert.match(body, /backBar\('الورق'\),\s*h\('section\.bp-card', h\('p\.bp-empty', 'لسه مفيش ورق\.'\)/);
  });
});

// ─────────────────────────────── التسجيل الصوتي ───────────────────────────────

/** MP4 مجزّأ صغير كما يكتبه MediaRecorder: mvhd بمدة 0، وأجزاء moof/mdat */
function fragmentedMp4({ timescale = 48000, fragments = [[960, 960, 960], [960, 480]], v1 = true } = {}) {
  const box = (type, ...parts) => {
    const body = Buffer.concat(parts);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body]);
  };
  const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  const u64 = (n) => Buffer.concat([u32(Math.floor(n / 2 ** 32)), u32(n % 2 ** 32)]);
  const full = (version, flags) => u32((version << 24) | flags);
  const time = v1 ? Buffer.concat([u64(0), u64(0)]) : Buffer.concat([u32(0), u32(0)]);
  const dur = (n) => (v1 ? u64(n) : u32(n));
  const mvhd = box('mvhd', full(v1 ? 1 : 0, 0), time, u32(1000), dur(0), Buffer.alloc(80));
  const tkhd = box('tkhd', full(v1 ? 1 : 0, 3), time, u32(1), u32(0), dur(0), Buffer.alloc(60));
  const mdhd = box('mdhd', full(v1 ? 1 : 0, 0), time, u32(timescale), dur(1041), Buffer.alloc(4));
  const moov = box('moov', mvhd, box('trak', tkhd, box('mdia', mdhd)), box('mvex', box('trex', full(0, 0), u32(1), u32(1), u32(0), u32(0), u32(0))));
  let t = 0;
  const frags = [];
  for (const samples of fragments) {
    const tfhd = box('tfhd', full(0, 0x020000), u32(1));
    const tfdt = box('tfdt', full(1, 0), u64(t));
    const trun = box('trun', full(0, 0x000301), u32(samples.length), u32(0), ...samples.map((d) => Buffer.concat([u32(d), u32(10)])));
    frags.push(box('moof', box('mfhd', full(0, 0), u32(frags.length + 1)), box('traf', tfhd, tfdt, trun)), box('mdat', Buffer.alloc(10 * samples.length)));
    t += samples.reduce((a, b) => a + b, 0);
  }
  return { bytes: new Uint8Array(Buffer.concat([box('ftyp', Buffer.from('iso5')), moov, ...frags])), total: t, timescale };
}

describe('v9.1 fixes — voice notes show their real length', () => {
  test('fixMp4Duration writes the fragments’ total into mvhd/tkhd/mdhd in place (v0 and v1), and only once', () => {
    for (const v1 of [true, false]) {
      const f = fragmentedMp4({ v1 });
      const r = fixMp4Duration(f.bytes);
      assert.ok(r, `v1=${v1}`);
      assert.equal(r.bytes.length, f.bytes.length, 'same size');
      assert.equal(r.seconds, f.total / f.timescale);
      const b = Buffer.from(r.bytes);
      const at = (type) => b.indexOf(Buffer.from(type, 'latin1')) + 4; // بداية جسم الصندوق
      const read = (p) => (v1 ? Number(b.readBigUInt64BE(p)) : b.readUInt32BE(p));
      assert.equal(read(at('mvhd') + (v1 ? 24 : 16)), Math.round((f.total * 1000) / f.timescale));
      assert.equal(read(at('tkhd') + (v1 ? 28 : 20)), Math.round((f.total * 1000) / f.timescale));
      assert.equal(read(at('mdhd') + (v1 ? 24 : 16)), f.total);
      assert.equal(fixMp4Duration(r.bytes), null, 'already written');
      // الصوت نفسه لم يتغير: كل البايتات بعد moov كما هي
      const moovEnd = b.indexOf(Buffer.from('moof', 'latin1')) - 4;
      assert.ok(Buffer.from(f.bytes).subarray(moovEnd).equals(b.subarray(moovEnd)));
    }
    assert.equal(fixMp4Duration(new Uint8Array([0, 0, 0, 8, 0x77, 0x65, 0x62, 0x6d])), null, 'not an MP4');
    assert.equal(fixMp4Duration(new Uint8Array(3)), null);
  });

  test('staff players: a WebM without a duration (Infinity) seeks to its end once, then back to the start', () => {
    const listeners = {};
    const a = {
      tagName: 'AUDIO',
      classList: { contains: (c) => c === 'doc-audio-player' },
      duration: Infinity,
      dataset: {},
      currentTime: 0,
      addEventListener: (n, f) => (listeners[n] = f),
      removeEventListener: (n) => delete listeners[n],
    };
    resolveAudioDuration({ target: a });
    assert.equal(a.currentTime, 1e101);
    a.duration = 2.94;
    listeners.durationchange();
    assert.equal(a.currentTime, 0);
    assert.equal(listeners.durationchange, undefined);
    a.currentTime = 1;
    resolveAudioDuration({ target: a });
    assert.equal(a.currentTime, 1, 'once per player; a known duration is left alone');
  });

  test('the recorder writes it before saving; staff players load metadata so the length shows before playing', () => {
    assert.match(read('public/assets/js/public/recorder.js'), /if \(b && seconds >= MIN_SECONDS\) \{\s*b = await withMp4Duration\(b\);/);
    for (const f of ['public/assets/js/app/pages/admin/case-detail.js', 'public/assets/js/app/pages/admin/intake-detail.js']) {
      assert.match(read(f), /h\('audio\.doc-audio-player', \{ controls: true, preload: 'metadata'/, f);
    }
  });
});

// ─────────────────────────────── أسماء صور الطلب ───────────────────────────────

describe('v9.1 fixes — «ورقة 1» tells the lawyer nothing', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => {
    await t.close();
  });

  test('generic names are recognised so triage can rename them', () => {
    for (const s of ['ورقة 1', 'ورقة-2.jpg', 'صورة 3', 'IMG_2041.jpg', 'WhatsApp Image 2026-10-01 at 10.22.33.jpeg', 'ورقة']) assert.ok(GENERIC_DOC_NAME.test(s), s);
    for (const s of ['شهادة الوفاة', 'إعلام وراثة.pdf', 'قسيمة الزواج.jpg']) assert.equal(GENERIC_DOC_NAME.test(s), false, s);
    const src = read('public/assets/js/app/pages/admin/intake-detail.js');
    assert.match(src, /api\.patch\(`\/admin\/documents\/\$\{doc\.id\}`, \{ title: v\.title \}\)/);
    assert.match(src, /button\('تسمية'/);
  });

  test('a granted «ورقة 1» analysed as a death certificate keeps «شهادة الوفاة» out of the suggestions', async () => {
    const admin = await t.login('admin');
    const lawyer = await createLawyer(admin, { specialties: ['INH'] });
    const lc = await t.login(lawyer.username);
    const k = await newCase(admin, { legal_area: 'INH', title: 'ورث', docs: ['ورقة 1.pdf'] });
    const doc = k.docs[0] || ok(await admin.get(`/api/admin/cases/${k.id}`)).documents[0];
    const a = await assign(admin, k.id, { lawyer_id: lawyer.id, role: 'lead', grants: { facts: true, document_ids: [doc.id] } });
    const labels = async () => ok(await lc.get(`/api/lawyer/assignments/${a.id}/suggested-documents`)).items.map((x) => x.label);
    assert.ok((await labels()).includes('شهادة الوفاة'), 'unnamed, unanalysed paper: still suggested');
    t.app.db.insert('document_ai', { document_id: doc.id, case_id: k.id, provider: 'heuristic', doc_type: 'death_certificate', result: '{}', created_at: new Date().toISOString() });
    const after = await labels();
    assert.ok(!after.includes('شهادة الوفاة'), after.join('|'));
    assert.ok(after.length > 0);
  });
});

// ─────────────────────────────── نصوص الإدارة والمحامي ───────────────────────────────

describe('v9.1 fixes — staff and lawyer copy', () => {
  test('hearing reminders: «قبل الموعد بثلاثة أيام ثم قبله بيوم» everywhere; the admin alert is not masculine-only', () => {
    const lawyer = read('public/assets/js/app/pages/lawyer/matter.js');
    assert.ok(lawyer.includes('تذكير آلي قبل الموعد بثلاثة أيام ثم قبله بيوم'));
    assert.ok(lawyer.includes('تذكير آلي قبلها بثلاثة أيام ثم قبلها بيوم'));
    const admin = read('public/assets/js/app/pages/admin/matter-detail.js');
    assert.ok(admin.includes('يُرسَل للمستفيد/ة بشأنها تذكير آلي عبر واتساب قبل الموعد بثلاثة أيام ثم قبله بيوم'));
    assert.ok(!/يُرسَل له بشأنها/.test(admin));
    assert.equal(paramSentence('days_before', 3, 'hearing_reminder'), 'قبل الموعد بـ 3 أيام ثم قبله بيوم');
    assert.equal(paramSentence('days_before', 1, 'hearing_reminder'), 'قبل الموعد بيوم واحد');
    assert.equal(paramSentence('days_before', 3, 'procedural_deadline'), 'قبل الموعد بـ 3 أيام');
  });

  test('request dialogs no longer promise a case number; they say what is really added', () => {
    const src = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.equal(/سيُضاف تلقائيًا رقم الملف|تلقائيًا رقم الملف/.test(src), false);
    assert.equal((src.match(/اسم المستفيد\/ة ورقم طلبه\/ا ورابط صفحة المتابعة وطريقة الرد/g) || []).length, 2);
  });

  test('beneficiary-facing leftovers: privacy page and the demo message are plain', () => {
    assert.ok(!read('public/privacy.html').includes('تحديد الاستحقاق'));
    assert.ok(!read('src/seed.js').includes('تحية طيبة أستاذة سامية'));
  });
});

// ─────────────────────────────── محرر الرد (B91-08/B91-16) ───────────────────────────────

describe('v9.1 fixes — answer composer', () => {
  test('the local summary comes from the conclusion only, never from «الوقائع»', () => {
    const facts = 'أولًا: الوقائع. توفي الزوج في فبراير 2026 وترك زوجة وطفلين قاصرين (ابن وبنت)، وشقة الزوجية مسجلة باسمه.\n\nثانيًا: الأنصبة. للزوجة الثمن.';
    assert.equal(clientSummary({ opinion: facts }).summary, '');
    assert.equal(clientSummary({ opinion: 'أولًا: كذا.\nالتوصية: نرفع دعوى نفقة فورًا.' }).summary, 'نرفع دعوى نفقة فورًا.');
    assert.equal(clientSummary({ opinion: 'أولًا: الوقائع المؤثرة\nكذا\nثالثًا: الرأي في المسائل\nمن حقك نفقة للعيال. ارفعي دعوى.' }).summary, 'من حقك نفقة للعيال. ارفعي دعوى.');
    assert.match(clientSummary({ opinion: 'الرأي القانوني: للعميل الحق في المطالبة.' }).summary, /^للعميل الحق/);
  });

  test('glossary warning catches «قاصرين» even when a bracket follows it; plain text passes', () => {
    assert.deepEqual(glossTerms('وطفلين قاصرين (ابن وبنت)').map((x) => x.term), ['قاصرين']);
    assert.deepEqual(glossTerms('عندك جلسة (ميعاد في المحكمة) يوم الجمعة'), []);
    assert.deepEqual(glossTerms('هنرفع قضية في المحكمة'), []);
    assert.equal(glossText('عندك جلسة يوم الجمعة'), 'عندك جلسة (ميعاد في المحكمة) يوم الجمعة');
    assert.match(read('public/assets/js/app/pages/admin/case-detail.js'), /const \{ glossTerms \} = await import\('\.\.\/\.\.\/\.\.\/public\/words\.js'\);/);
  });

  test('steps follow the chosen opinion until edited; the send dialog shows the numbered steps', () => {
    const src = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.match(src, /if \(o && \(!curSteps \|\| \(autoSteps !== null && curSteps === autoSteps\.trim\(\)\)\)\) \{\s*autoSteps = o\.client_steps \? stepsText\(o\.client_steps\) : '';\s*stepsCtl\.set\(autoSteps\);/);
    assert.match(src, /autoSteps = answer \? null : initialOp\?\.client_steps \? stepsText\(initialOp\.client_steps\) : '';/);
    assert.match(src, /h\('div\.pb-preview-steps', h\('strong', 'الخطوات المطلوبة منها:'\), h\('ol', steps\.map\(\(s\) => h\('li', s\)\)\)\)/);
    assert.deepEqual(answerSteps('["هاتي البطاقة","احضري الجلسة"]'), ['هاتي البطاقة', 'احضري الجلسة']);
    assert.deepEqual(answerSteps('أ\n\nب'), ['أ', 'ب']);
    assert.deepEqual(answerSteps(null), []);
  });

  test('an unanswered beneficiary message warns before closing or converting, and unticks «إغلاق ملف الاستشارة»', () => {
    const m = (id, direction, at, extra = {}) => ({ id, direction, created_at: at, body: `m${id}`, ...extra });
    assert.equal(unansweredClientMessage([m(1, 'out', '2026-10-07T10:00:00Z'), m(2, 'in', '2026-10-07T12:43:00Z')]).id, 2);
    assert.equal(unansweredClientMessage([m(2, 'in', '2026-10-07T12:43:00Z'), m(3, 'out', '2026-10-07T13:00:00Z')]), null);
    assert.equal(unansweredClientMessage([m(2, 'in', '2026-10-07T12:43:00Z'), m(3, 'out', '2026-10-07T13:00:00Z', { automated: 1 })]).id, 2, 'an automatic reminder is not an answer');
    assert.equal(unansweredClientMessage([m(2, 'in', '2026-10-07T12:43:00Z'), m(3, 'out', '2026-10-07T13:00:00Z', { status: 'failed' })]).id, 2, 'a failed send is not an answer');
    assert.equal(unansweredClientMessage([]), null);
    assert.equal(unansweredClientMessage([m(1, 'in', '2026-09-28T10:00:00Z')], { since: '2026-09-29T08:00:00Z' }), null, 'the request itself (before the case) is not a pending question');
    assert.equal(unansweredClientMessage([m(1, 'in', '2026-09-28T10:00:00Z'), m(2, 'in', '2026-10-07T12:43:00Z')], { since: '2026-09-29T08:00:00Z' }).id, 2);
    const src = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.match(src, /before: unansweredNotice\(\),\s*danger: true,/);
    assert.match(src, /close_case: !pendingMsg,/);
    assert.ok(src.includes('`فيه رسالة من المستفيد/ة لم يُرد عليها ('));
    assert.ok(src.includes("'افتح المحادثة ورد عليها'"));
  });
});

// ─────────────────────────────── حجم صفحة المتابعة (B91-11/B91-20) ───────────────────────────────

describe('v9.1 fixes — /p/<token> stays under its JS budget', () => {
  test('camera, voice and drafts load on first use; the b-forms stylesheet and the Latin font files are not in the first paint', () => {
    const portal = read('public/assets/js/public/portal.js');
    assert.equal(/^import [^\n]*from '\.\/(upload|recorder|drafts)\.js'/m.test(portal), false, 'no static import of capture modules');
    for (const f of ['upload', 'recorder', 'drafts']) assert.ok(portal.includes(`import('./${f}.js')`), f);
    assert.match(portal, /if \(CAPTURE_VIEWS\.has\(state\.view\) && !CAP\) \{/);
    assert.ok(!read('public/portal.html').includes('<link rel="stylesheet" href="/assets/css/v91-b-forms.css"'));
    assert.ok(!/@font-face/.test(read('public/assets/css/v91-portal.css')), 'the portal sheet adds no font files (public-site.css has the Arabic ones)');
  });

  test('/p/<token> carries its own data (no second round trip); bad tokens get none; «<» cannot close the block', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const token = ok(await admin.post('/api/admin/clients/3/portal-link', {})).url.split('/p/')[1];
      const res = await fetch(`${t.base}/p/${token}`);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const html = await res.text();
      const m = /<script type="application\/json" id="bm-portal-data">([^<]*)<\/script>/.exec(html);
      assert.ok(m, 'embedded data block');
      const embedded = JSON.parse(m[1]);
      const api = ok(await t.client().get(`/api/portal/${token}`));
      assert.equal(embedded.home.ref, api.home.ref);
      assert.deepEqual(Object.keys(embedded).sort(), Object.keys(api).sort());
      assert.equal(embedded.messages.length, api.messages.length);
      assert.match(res.headers.get('content-security-policy'), /script-src 'self'(;|$)/, 'CSP unchanged (application/json is data)');
      // نص فيه «</script>» من المستفيدة لا يكسر الكتلة
      ok(await t.client().post(`/api/portal/${token}/messages`, { body: 'سؤال </script><script>alert(1)</script>', client_ref: 'x'.repeat(24) }));
      const html2 = await (await fetch(`${t.base}/p/${token}`)).text();
      const block = /<script type="application\/json" id="bm-portal-data">([\s\S]*?)<\/script>/.exec(html2)[1];
      assert.ok(!block.includes('<'), 'no raw < inside the block');
      assert.ok(JSON.parse(block).messages.some((x) => String(x.body).includes('</script>')));
      const bad = await (await fetch(`${t.base}/p/${'a'.repeat(30)}`)).text();
      assert.match(bad, /<script type="application\/json" id="bm-portal-data">\{"invalid":true\}<\/script>/, 'an expired/unknown link: only a marker (no 404 request from the page)');
      assert.ok(!(await (await fetch(`${t.base}/p/short`)).text()).includes('bm-portal-data'), 'malformed links: nothing');
      assert.match(read('public/assets/js/public/portal.js'), /const data = embeddedData\(\) \|\| \(await getJson\(API\)\);/);
    } finally {
      await t.close();
    }
  });

  test('served JS (versioned) without comment lines: portal home closure ≤ 30 KB gzip', () => {
    setPublicRoot(PUB);
    const entry = path.join(PUB, 'assets/js/public/portal.js');
    const files = [entry, ...preloadClosure(entry, PUB).map((u) => path.join(PUB, u.split('?')[0]))];
    assert.deepEqual(files.map((f) => path.basename(f)).sort(), ['h.js', 'portal-ui.js', 'portal.js', 'words.js']);
    const total = files.reduce((n, f) => n + zlib.gzipSync(transformAsset(f)).length, 0);
    assert.ok(total <= 30 * 1024, `${total} bytes gzip`);
  });

  test('stripJsCommentLines removes only whole comment lines, and every served module still parses', () => {
    assert.equal(stripJsCommentLines('// a\nconst x = 1; // b\n/**\n * c\n */\nconst y = `\n// not a comment\n* still text\n`;\n/* d */ const z = 2;'), 'const x = 1; // b\nconst y = `\n// not a comment\n* still text\n`;\n/* d */ const z = 2;');
    assert.equal(stripJsCommentLines("const re = /\\/\\//g;\n// x\nconst s = '//';"), "const re = /\\/\\//g;\nconst s = '//';");
    assert.equal(stripJsCommentLines('/* a\n b */ const q = 1;'), ' const q = 1;');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-strip-'));
    try {
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
      const files = walk(path.join(PUB, 'assets/js'));
      assert.ok(files.length > 50);
      for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        const out = stripJsCommentLines(src);
        // كل سطر محذوف سطر تعليق، والباقي بالترتيب نفسه
        const a = src.split('\n');
        const b = out.split('\n');
        let j = 0;
        for (const line of a) {
          if (j < b.length && line === b[j]) j += 1;
          else assert.match(line.trim(), /^(\/\/|\/\*|\*)/, `${path.relative(PUB, f)}: «${line.trim().slice(0, 60)}»`);
        }
        assert.equal(j, b.length, path.relative(PUB, f));
        const isModule = /^\s*(import|export)\b/m.test(src);
        const dest = path.join(tmp, `${path.relative(PUB, f).replace(/[\\/]/g, '__')}.${isModule ? 'mjs' : 'cjs'}`);
        fs.writeFileSync(dest, out);
      }
      // فحص الصياغة دفعة واحدة (عملية واحدة لكل الملفات)
      const checker = path.join(tmp, 'check.cjs');
      fs.writeFileSync(checker, `const { execFileSync } = require('node:child_process'); const fs = require('node:fs'); const path = require('node:path');
        const bad = []; for (const f of fs.readdirSync(${JSON.stringify(tmp)})) { if (f === 'check.cjs') continue; try { execFileSync(process.execPath, ['--check', path.join(${JSON.stringify(tmp)}, f)], { stdio: 'pipe' }); } catch (e) { bad.push(f + ': ' + String(e.stderr).split('\\n').slice(0, 4).join(' ')); } } process.stdout.write(JSON.stringify(bad));`);
      const bad = JSON.parse(execFileSync(process.execPath, [checker], { encoding: 'utf8', timeout: 120000 }));
      assert.deepEqual(bad, []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
