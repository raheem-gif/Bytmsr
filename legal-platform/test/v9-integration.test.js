// v9 — فجوات بين الوحدات (المُدمِج ب): صفحة بوابة العميل بقالب الموقع العام، رقم واتساب التوضيحي،
// تسميات أحداث سجل الأمان، أيقونات الإشعارات، والمحامي المسؤول عن الملف المستمر.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { ok, createLawyer, newCase } from './lane-b-kit.test.js';
import { DEFAULT_SETTINGS, LABELS } from '../src/constants.js';
import { WA_PLACEHOLDER_DIGITS, publicWhatsAppDigits, isPlaceholderWhatsApp } from '../src/channels/whatsapp.js';
import { notifIcon, notifTone } from '../public/assets/js/app/notif.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DESC = 'توفي زوجي منذ ستة أشهر ولم يُصرف معاش الأبناء حتى الآن رغم تقديم الأوراق للتأمينات الاجتماعية.';
const NO_WA = { whatsapp: { token: '', phoneNumberId: '', wabaId: '', verifyToken: 'verify-me', appSecret: '', numberDigits: '' } };
const STRONG = 'Nile#Delta-Garden7';

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(f));
    else if (e.name.endsWith('.js')) out.push(f);
  }
  return out;
}

/** نص وسيطات الاستدعاء: من القوس الافتتاحي حتى المغلق المطابق */
function callArgs(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx);
}

/** القيم النصية في تعبير «type: …» (حرفية أو داخل شرط ثلاثي) */
function typeLiterals(args) {
  const m = /\btype\s*:\s*([^,\n}]+)/.exec(args);
  if (!m) return [];
  // في الشرط الثلاثي (cond ? 'a' : 'b') تُؤخذ النتيجتان فقط لا قيم المقارنة في الشرط
  const expr = m[1].includes('?') ? m[1].slice(m[1].indexOf('?') + 1) : m[1];
  return [...expr.matchAll(/'([a-z0-9_]+(?:\.[a-z0-9_]+)*)'/g)].map((x) => x[1]);
}

/** كل أنواع أحداث سجل الأمان التي يكتبها الخادم وسطر الأوامر: { type → [file:line] } */
function scanAuditTypes() {
  const found = new Map();
  const add = (type, where) => found.set(type, [...(found.get(type) || []), where]);
  for (const file of [...jsFiles(path.join(ROOT, 'src')), ...jsFiles(path.join(ROOT, 'scripts'))]) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    const lineOf = (i) => src.slice(0, i).split('\n').length;
    // app.audit.log({...}) و app.audit?.log({...}) والغلاف audit({...}) في وحدة الحسابات
    for (const m of src.matchAll(/\b(?:audit\??\.log|audit)\s*\(\s*\{/g)) {
      const open = m.index + m[0].indexOf('(');
      for (const t of typeLiterals(callArgs(src, open))) add(t, `${rel}:${lineOf(m.index)}`);
    }
    // الكتابة المباشرة في الجدول (سطر الأوامر والاستعادة)
    for (const m of src.matchAll(/insert\(\s*'security_events'\s*,\s*\{/g)) {
      for (const t of typeLiterals(callArgs(src, m.index + m[0].indexOf('(')))) add(t, `${rel}:${lineOf(m.index)}`);
    }
    for (const m of src.matchAll(/INSERT INTO security_events[^`'"]*?VALUES\s*\(\s*'([a-z0-9_.]+)'/g)) add(m[1], `${rel}:${lineOf(m.index)}`);
  }
  return found;
}

/** أنواع الإشعارات التي يرسلها الخادم */
function scanNotificationTypes() {
  const found = new Set();
  for (const file of jsFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:notify|notifyStaff|notifyAdmins)\s*\(/g)) {
      for (const t of typeLiterals(callArgs(src, m.index + m[0].length - 1))) found.add(t);
    }
  }
  return found;
}

// ───────────────────────── بوابة العميل بقالب الموقع العام ─────────────────────────

describe('v9 integration — client portal page /p/<token> uses the public site template', () => {
  let t;
  let token;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    const r = ok(await t.client().post('/api/public/intake', { name: 'سعاد محمود', phone: '01012345678', description: DESC, consent: true }), 201);
    token = r.portal_url.split('/p/')[1];
  });
  after(async () => t && t.close());

  test('shared header/footer and SEO head, private-page headers, no token anywhere in the HTML, portal script kept', async () => {
    const r = await t.client().get(`/p/${token}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const html = r.body;
    assert.match(html, /class="pub-header"/);
    assert.match(html, /class="pub-footer"/);
    // v9.1 b-portal (تغيير مقصود، B91-02): نفس قالب الموقع مع فئات الصفحة الجديدة
    assert.match(html, /<body class="site pub v91 bp-portal">/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
    assert.equal((html.match(/<meta name="robots"/g) || []).length, 1, 'a single robots tag');
    assert.match(html, /<meta name="referrer" content="no-referrer" \/>/);
    assert.match(html, /<title>متابعة طلبك — مؤسسة بيوت مصر<\/title>/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/portal" \/>/);
    // (إصلاحات الإطلاق) روابط CSS/JS تحمل رقم إصدار الملف ?v=… للتخزين الطويل في المتصفح
    assert.match(html, /<script type="module" src="\/assets\/js\/public\/portal\.js(\?v=[A-Za-z0-9_-]+)?"><\/script>/);
    assert.match(html, /id="portal-root"/);
    assert.match(html, /\/assets\/css\/public-site\.css/);
    // «متابعة طلب» هي الصفحة الحالية في القائمة
    assert.match(html, /href="\/portal" aria-current="page"/);
    assert.ok(!html.includes(token), 'the secret token must not be written into the page (canonical, og:url, JSON-LD)');
    // v9.1 b-site (تغيير مقصود، B91-11): كتلة بيانات JSON ‎#bm-public‎ غير تنفيذية تُستثنى مثل ld+json
    const withoutLd = html.replace(/<script type="application\/(?:ld\+)?json"[^>]*>[\s\S]*?<\/script>/g, '');
    assert.ok(!/\{\{|\}\}|<!--#if|<!--\/if|<!--site:head-->/.test(withoutLd), 'no unrendered template tokens');
    // CSP: لا سكربتات تنفيذية مضمّنة
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].filter((m) => !/application\/(?:ld\+)?json/.test(m[1]));
    assert.equal(inline.length, 0);
  });

  test('truncated /p/ links open the follow-up page (it explains the link is invalid); /portal.html is not served directly', async () => {
    // (إصلاحات الإطلاق) رابط مقطوع عند نسخه من واتساب يفتح صفحة المتابعة بهويتها ورقم المؤسسة و«الدخول برقم الموبايل»
    const short = await t.client().get('/p/short');
    assert.equal(short.status, 200);
    assert.match(short.body, /id="portal-root"/);
    assert.equal((await t.client().get('/api/portal/short')).status, 404);
    assert.equal((await t.client().get('/p/a/b')).status, 404);
    assert.equal((await t.client().get('/portal.html')).status, 404);
  });
});

// ───────────────────────── رقم واتساب التوضيحي ─────────────────────────

describe('v9 integration — the placeholder WhatsApp number never reaches the public site', () => {
  test('helpers: the placeholder (any spelling) and empty values are «not configured»', () => {
    assert.equal(DEFAULT_SETTINGS.whatsapp_display_number, '', 'no placeholder default');
    assert.equal(WA_PLACEHOLDER_DIGITS, '201000000000');
    for (const p of ['+20 100 000 0000', '201000000000', '01000000000', '+201000000000', '٠١٠٠٠٠٠٠٠٠٠', '', null, undefined, '12']) {
      assert.equal(publicWhatsAppDigits(p), '', String(p));
    }
    assert.ok(isPlaceholderWhatsApp('+20 100 000 0000'));
    assert.ok(!isPlaceholderWhatsApp(''));
    assert.equal(publicWhatsAppDigits('01211114662'), '201211114662');
    assert.equal(publicWhatsAppDigits('+20 121 111 4662'), '201211114662');
  });

  async function assertNoWhatsApp(t, label) {
    const c = t.client();
    const meta = ok(await c.get('/api/meta'));
    assert.equal(meta.settings.whatsapp_number_digits, '', `${label}: meta digits`);
    assert.equal(meta.settings.whatsapp_display_number, '', `${label}: meta display number`);
    for (const p of ['/', '/intake', '/about', '/privacy', '/terms', '/data-deletion', '/portal']) {
      const html = (await c.get(p)).body;
      assert.ok(!html.includes('wa.me'), `${label}: ${p} has no wa.me link`);
      assert.ok(!/100 000 0000|201000000000|01000000000/.test(html), `${label}: ${p} never shows the placeholder`);
    }
    // البدائل: الهاتف ومتابعة الطلب
    const home = (await c.get('/')).body;
    assert.match(home, /href="tel:\+201211114662"/);
    assert.match(home, /href="\/portal"/);
    assert.ok(!home.includes('data-cta="whatsapp"'), `${label}: no WhatsApp CTA buttons`);
    // v9.1 b-site (B91-07): بلا واتساب يأخذ زر «اتصال» العرض كله، ولا كلمة «واتساب» في «إزاي بنشتغل؟»
    assert.match(home, /<div class="pub-contact-buttons is-single"><a class="pub-btn pub-btn-call" href="tel:\+201211114662">/);
    assert.ok(!/<ol class="pub-how">[\s\S]*?واتساب[\s\S]*?<\/ol>/.test(home), `${label}: how-it-works does not promise WhatsApp`);
    const del = (await c.get('/data-deletion')).body;
    assert.match(del, /href="tel:\+201211114662"/);
    const sub = ok(await c.post('/api/public/intake', { name: 'منى عبد الله', phone: '01098765432', description: DESC, consent: true }), 201);
    assert.equal(sub.whatsapp_url, null, `${label}: intake returns no wa.me link`);
    assert.match(sub.portal_url, /\/p\/[A-Za-z0-9_-]{20,}$/);
    const portal = (await c.get(`/p/${sub.portal_url.split('/p/')[1]}`)).body;
    assert.ok(!portal.includes('wa.me'), `${label}: portal page has no wa.me link`);
  }

  test('fresh install (nothing configured): no WhatsApp buttons/links, phone and portal shown instead', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      await assertNoWhatsApp(t, 'fresh');
    } finally {
      await t.close();
    }
  });

  test('legacy database still holding «+20 100 000 0000», or the placeholder in WHATSAPP_NUMBER, is treated as not configured', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      t.app.settings.set('whatsapp_display_number', '+20 100 000 0000');
      await assertNoWhatsApp(t, 'legacy setting');
    } finally {
      await t.close();
    }
    const t2 = await startTestApp({ seed: 'none', config: { whatsapp: { ...NO_WA.whatsapp, numberDigits: WA_PLACEHOLDER_DIGITS } } });
    try {
      await assertNoWhatsApp(t2, 'placeholder env');
    } finally {
      await t2.close();
    }
  });

  test('a real number from settings, then from the integrations page (which takes precedence), drives every wa.me link', async () => {
    const t = await startTestApp({ seed: 'none', config: NO_WA });
    try {
      const admin = await t.login('admin');
      // الرقم التوضيحي مرفوض صراحة، والفراغ مقبول (لا رقم واتساب بعد)
      let r = await admin.patch('/api/admin/settings', { whatsapp_display_number: '+20 100 000 0000' });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /رقم توضيحي/);
      ok(await admin.patch('/api/admin/settings', { whatsapp_display_number: '' }));
      assert.equal(t.app.settings.get('whatsapp_display_number'), '');
      r = await admin.put('/api/admin/integrations/whatsapp', { values: { number: '+20 100 000 0000' } });
      assert.equal(r.status, 400);

      ok(await admin.patch('/api/admin/settings', { whatsapp_display_number: '+20 121 111 4662' }));
      let meta = ok(await t.client().get('/api/meta'));
      assert.equal(meta.settings.whatsapp_number_digits, '201211114662');
      assert.equal(meta.settings.whatsapp_display_number, '+20 121 111 4662');
      assert.match((await t.client().get('/')).body, /https:\/\/wa\.me\/201211114662\?text=/);

      ok(await admin.put('/api/admin/integrations/whatsapp', { values: { number: '01155556666' } }));
      meta = ok(await t.client().get('/api/meta'));
      assert.equal(meta.settings.whatsapp_number_digits, '201155556666', 'the integrations number is the source of truth');
      const home = (await t.client().get('/')).body;
      assert.match(home, /https:\/\/wa\.me\/201155556666\?text=/);
      assert.ok(!home.includes('wa.me/201211114662'));
      const sub = ok(await t.client().post('/api/public/intake', { name: 'هدى سالم', phone: '01011112222', description: DESC, consent: true }), 201);
      assert.match(sub.whatsapp_url, /^https:\/\/wa\.me\/201155556666\?text=/);
    } finally {
      await t.close();
    }
  });

  test('setup wizard: the placeholder is refused, and the number typed in the organisation profile becomes the integrations number', async () => {
    const t = await startTestApp({ config: { adminUsername: '', adminPassword: '', ...NO_WA } });
    try {
      const anon = t.client();
      const { token } = t.app.system.beginSetup();
      const st = ok(await anon.get('/api/setup/status'));
      assert.equal(st.defaults.whatsapp_display_number, '', 'the wizard never pre-fills the placeholder');
      const admin = { name: 'هالة عبد الرحمن', username: 'director', password: STRONG, password_confirm: STRONG };
      let r = await anon.post('/api/setup/complete', { token, org: { ...st.defaults, whatsapp_display_number: '+20 100 000 0000' }, admin });
      assert.equal(r.status, 400);
      assert.ok(r.body.details.fields.whatsapp_display_number);
      assert.equal(Number(t.app.db.value('SELECT COUNT(*) FROM users')), 0);

      r = await anon.post('/api/setup/complete', { token, org: { ...st.defaults, whatsapp_display_number: '01211114662' }, admin });
      ok(r, 201);
      const wa = t.app.integrations.status('whatsapp').fields.number;
      assert.equal(wa.value, '201211114662');
      assert.equal(wa.source, 'db');
      assert.equal(ok(await t.client().get('/api/meta')).settings.whatsapp_number_digits, '201211114662');
    } finally {
      await t.close();
    }
  });

  test('client helper whatsappUrl() refuses the placeholder too', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/public/common.js'), 'utf8');
    assert.match(src, /PLACEHOLDER_WA = '201000000000'/);
    assert.match(src, /d === PLACEHOLDER_WA\) return null/);
  });
});

// ───────────────────────── تسميات سجل الأمان ─────────────────────────

describe('v9 integration — every security-log event type has an Arabic label', () => {
  test('static scan of src/ and scripts/: each audit type passed to the audit log is labelled in LABELS.security_event', () => {
    const found = scanAuditTypes();
    assert.ok(found.size >= 60, `scanner found ${found.size} types — the scan patterns are probably broken`);
    for (const known of ['auth.login', 'system.setup_completed', 'backup.created', 'system.admin_cli_reset', 'system.restore', 'portal.otp_login', 'ai.budget_exceeded', 'data.imported', 'print.denied']) {
      assert.ok(found.has(known), `scanner should find ${known}`);
    }
    const missing = [...found.keys()].filter((t) => !LABELS.security_event[t]).map((t) => `${t} (${found.get(t)[0]})`);
    assert.deepEqual(missing, [], `audit types without an Arabic label: ${missing.join('، ')}`);
    for (const t of found.keys()) assert.match(LABELS.security_event[t], /[؀-ۿ]/, `${t} label is Arabic`);
  });

  test('the /audit page has an Arabic group name for every event prefix', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/app/pages/admin/audit.js'), 'utf8');
    const block = /const GROUP_LABELS = \{([\s\S]*?)\};/.exec(src);
    assert.ok(block, 'GROUP_LABELS block');
    const groups = new Set([...block[1].matchAll(/^\s*([a-z_]+):\s*'/gm)].map((m) => m[1]));
    const prefixes = new Set([...scanAuditTypes().keys(), ...Object.keys(LABELS.security_event)].map((t) => t.split('.')[0]));
    const missing = [...prefixes].filter((p) => !groups.has(p));
    assert.deepEqual(missing, [], `event groups without a label on /audit: ${missing.join('، ')}`);
  });

  test('labels reach the audit page (facets and CSV) without raw keys', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      t.app.audit.log({ type: 'backup.created', summary: 'نسخة اختبار' });
      t.app.audit.log({ type: 'system.job_run', summary: 'مهمة اختبار' });
      const facets = ok(await admin.get('/api/admin/audit/facets'));
      for (const ty of facets.types) assert.notEqual(ty.label, ty.value, `${ty.value} shows a raw key`);
      const ev = ok(await admin.get('/api/admin/audit?type=backup'));
      assert.ok(ev.items.length >= 1);
      for (const e of ev.items) assert.equal(e.type_label, LABELS.security_event[e.type]);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── أيقونات الإشعارات ─────────────────────────

describe('v9 integration — notification icons', () => {
  const ICON_NAMES = (() => {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/lib/ui.js'), 'utf8');
    const block = /const ICONS = \{([\s\S]*?)\n\};/.exec(src);
    return new Set([...block[1].matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]));
  })();

  test('important alert types have a dedicated icon and colour; every type sent by the server maps to a real icon', () => {
    const IMPORTANT = {
      security: 'shield',
      'conflict.alert': 'scale',
      'intake.sla_breach': 'clock',
      'ai.budget_exceeded': 'alert',
      'ai.budget_warning': 'chart',
      'program.budget': 'wallet',
      'survey.low_rating': 'star',
    };
    const sent = scanNotificationTypes();
    assert.ok(sent.size >= 40, `scanner found ${sent.size} notification types`);
    for (const [type, iconName] of Object.entries(IMPORTANT)) {
      assert.ok(sent.has(type), `the server still sends «${type}»`);
      assert.equal(notifIcon(type), iconName, type);
      assert.ok(notifTone(type), `${type} is highlighted`);
    }
    for (const type of sent) {
      const name = notifIcon(type);
      assert.ok(ICON_NAMES.has(name) || name === 'bell', `${type} → «${name}» is not an icon in ui.js`);
    }
    // تعابير عامة لا تلتقط أنواعًا غير مقصودة
    assert.equal(notifIcon('detail.updated'), 'bell');
    assert.equal(notifTone('case.closed'), null);
  });
});

// ───────────────────────── المحامي المسؤول عن الملف المستمر ─────────────────────────

describe('v9 integration — a matter responsible lawyer must be an active, activated account', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => t && t.close());

  test('invite-pending and inactive lawyers are refused on create and on change; unchanged edits still save', async () => {
    const invited = ok(await admin.post('/api/admin/lawyers', { username: 'invited', name: 'سارة المدعوة', specialties: ['FAM'], agreement: { type: 'pro_bono' } }), 201);
    assert.equal(invited.invite_pending, true);
    const active = await createLawyer(admin, { name: 'محمود النشط' });
    const other = await createLawyer(admin, { name: 'ريم البديلة' });

    const c1 = await newCase(admin, {});
    let r = await admin.post(`/api/admin/cases/${c1.id}/matter`, { kind: 'litigation', responsible_lawyer_id: invited.id });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /لم يفعّل هذا المحامي حسابه من رابط الدعوة/);
    assert.equal(t.app.db.get('SELECT matter_id FROM cases WHERE id = ?', c1.id).matter_id, null, 'nothing created');

    const m = ok(await admin.post(`/api/admin/cases/${c1.id}/matter`, { kind: 'litigation', responsible_lawyer_id: active.id }), 201);
    r = await admin.patch(`/api/admin/matters/${m.id}`, { responsible_lawyer_id: invited.id });
    assert.equal(r.status, 409);
    assert.equal(t.app.db.get('SELECT responsible_lawyer_id FROM matters WHERE id = ?', m.id).responsible_lawyer_id, active.id);
    assert.equal(
      Number(t.app.db.value("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'matter.assigned'", invited.id)),
      0,
      'no notification for an account that cannot sign in',
    );

    // حساب موقوف: مرفوض عند الإسناد إليه
    ok(await admin.patch(`/api/admin/lawyers/${other.id}`, { active: false }));
    r = await admin.patch(`/api/admin/matters/${m.id}`, { responsible_lawyer_id: other.id });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /موقوف/);

    // إيقاف المحامي الحالي لا يمنع تعديل بيانات أخرى في ملفه ولو أُعيد إرسال نفس المحامي
    ok(await admin.patch(`/api/admin/lawyers/${active.id}`, { active: false }));
    const saved = ok(await admin.patch(`/api/admin/matters/${m.id}`, { court: 'محكمة الأسرة بمدينة نصر', responsible_lawyer_id: active.id }));
    assert.equal(saved.court, 'محكمة الأسرة بمدينة نصر');
  });
});
