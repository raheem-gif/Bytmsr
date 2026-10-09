// v10 integration gate — public-area fixes (G-10): demo seed due times from the SLA calendar (J-25), the B2C inbox
// channel filter without «بوابة الشركة» (J-25), the /app login back link named like the staff chrome with a 44 px
// hit area (C-14), and the /p/ contact bar wrapping instead of clipping «اكتبيلنا» at 200 % zoom (C-17).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { setClock, cairoParts, cairoLocalToIso } from '../src/util.js';
import { seedB2bDemo } from '../src/seed-v10-b2b.js';
import { whenText } from '../src/services/company-requests.js';
import { calendars, isOpen } from '../public/assets/js/lib/company-sla.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HOUR = 3600000;

/** داخل ساعات التقويم أو عند نهايتها تمامًا (addBusinessMinutes تعيد نهاية اليوم حين تنتهي الدقائق عندها) */
function withinHours(iso, cal) {
  if (isOpen(iso, cal)) return true;
  const p = cairoParts(iso);
  return p.hour * 60 + p.minute === cal.toMin && cal.days.includes(new Date(cairoLocalToIso(p.year, p.month, p.day, 12, 0)).getUTCDay());
}

/** تطبيق فارغ + مدير حالات ومحامو L-38، ثم بذرة الشركات كاملة (المرحلتان) على ساعة عرض «الآن» = realNow */
async function seedAt(realNow) {
  const t = await startTestApp({ seed: 'none' });
  let T = realNow;
  const tick = () => setClock(() => new Date(T));
  const at = (daysAgo, hour = 10, minute = 0) => {
    const p = cairoParts(new Date(realNow - daysAgo * 24 * HOUR));
    T = new Date(cairoLocalToIso(p.year, p.month, p.day, hour, minute)).getTime();
    if (T > realNow) T = realNow - 5 * 60 * 1000;
    tick();
  };
  at(90, 9);
  t.app.lawyers.createStaff({ role: 'case_manager', username: 'manager', name: 'منى السيد', password: 'Manager@2026' });
  const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
  for (const [username, name] of [['tarek', 'طارق النجار'], ['yasmine', 'ياسمين خليل'], ['amr', 'عمرو الشافعي']]) {
    t.app.lawyers.create({ username, name, password: 'Lawyer@2026', title: 'أ.', specialties: ['COM', 'LAB', 'CIV'], capacity: 8, agreement: { type: 'per_case', rate: 900 } }, admin);
  }
  await seedB2bDemo(t.app, { at, realNow, setNow: (ms) => { T = Math.min(ms, realNow - 60 * 1000); tick(); } });
  setClock(() => new Date(realNow));
  return t;
}

// ───────────────────────── J-25: مواعيد بذرة العرض من تقويم مستوى الخدمة ─────────────────────────
describe('gate J-25 — demo seed due times come from the SLA calendar and match the «بدأ العمل» message', () => {
  // الحالة المبلّغ عنها (جمعة 5:55 ص قبل العمل وقبل نافذة العاجل)، مساء قرب إغلاق نافذة العاجل، ومنتصف يوم عمل قبل العطلة
  const RUNS = [
    ['Friday 05:55 (before both windows)', cairoLocalToIso(2026, 10, 9, 5, 55)],
    ['Wednesday 21:45 (late evening)', cairoLocalToIso(2026, 10, 7, 21, 45)],
    ['Thursday 13:30 (mid business day)', cairoLocalToIso(2026, 10, 8, 13, 30)],
  ];
  for (const [label, iso] of RUNS) {
    test(`seeded at ${label}: NFD-0002 inside business hours, NFD-0003 inside the urgent window, messages = promise`, async () => {
      const realNow = Date.parse(iso);
      const t = await seedAt(realNow);
      try {
        const { db } = t.app;
        const cals = calendars(t.app.settings.all());
        for (const [code, cal, label2] of [['NFD-0002', cals.business, 'business'], ['NFD-0003', cals.urgent, 'urgent']]) {
          const r = db.get('SELECT * FROM company_requests WHERE code = ?', code);
          assert.ok(r, `${code} seeded`);
          assert.equal(r.status, 'in_progress', code);
          assert.ok(r.delivery_due_at > new Date(realNow).toISOString(), `${code} due is still ahead of «now»`);
          assert.ok(withinHours(r.delivery_due_at, cal), `${code} due ${r.delivery_due_at} outside the ${label2} hours`);
          // الإيقاف أثناء الاستيضاح لم يحرك الموعد: ما في الرسالة هو ما في مربع الوعد
          assert.equal(r.delivery_due_at, r.delivery_due_original_at, `${code} due moved after it was announced`);
          const msg = db.value("SELECT body FROM company_messages WHERE request_id = ? AND body LIKE 'بدأ فريقكم القانوني العمل على الطلب.%' ORDER BY id LIMIT 1", r.id);
          assert.ok(msg, `${code} has the accepted message`);
          assert.ok(msg.includes(whenText(r.delivery_due_at, { at: new Date(r.accepted_at) })), `${code}: «${msg}» ≠ ${whenText(r.delivery_due_at, { at: new Date(r.accepted_at) })}`);
        }
        // NFD-0002: الاستيضاح أُجيب عليه والموعد يسري (لا إيقاف معلّق)، ومجموع دقائق الإيقاف صفر
        const n2 = db.get("SELECT * FROM company_requests WHERE code = 'NFD-0002'");
        assert.equal(n2.sla_paused_at, null);
        assert.equal(Number(n2.sla_paused_minutes_total) || 0, 0);
        assert.equal(Number(db.value("SELECT COUNT(*) FROM company_messages WHERE request_id = ? AND kind = 'clarification' AND answered_at IS NULL", n2.id)), 0);
      } finally {
        await t.close();
      }
    });
  }

  test('the seed no longer builds due times from raw clock offsets', () => {
    const src = read('src/seed-v10-b2b.js');
    assert.doesNotMatch(src, /delivery_due_at:\s*new Date\(realNow/);
    assert.match(src, /delivery_due_at: dueOn\(2, 4, cals\.business\)/);
    assert.match(src, /delivery_due_at: dueOn\(1, 6, cals\.urgent\)/);
  });

  test('the B2C inbox channel filter leaves out «بوابة الشركة» (company_portal never matches an intake)', () => {
    const src = read('public/assets/js/app/pages/admin/inbox.js');
    assert.match(src, /options\('channel'\)\.filter\(\(o\) => o\.value !== 'company_portal'\)/);
    // لا قائمة قنوات أخرى في صندوق الأفراد تعرضها كاملة
    assert.equal((src.match(/options\('channel'\)/g) || []).length, 1);
  });
});

// ───────────────────────── C-14: رابط «العودة إلى الموقع» في دخول /app ─────────────────────────
describe('gate C-14 — /app login back link uses the staff-chrome name and a 44 px hit area', () => {
  test('login.js names the site with staffChrome().name (brand when on, org_name as in 9.2 when off)', () => {
    const src = read('public/assets/js/app/pages/login.js');
    assert.doesNotMatch(src, /`العودة إلى موقع \$\{org\}`/);
    assert.match(src, /h\('a\.login-back', \{ href: '\/' \}, 'العودة إلى موقع ', h\('bdi', chrome\.name\)\)/);
  });

  test('.login-back has a 44 px minimum height and keeps its place (negative block margin)', () => {
    const css = read('public/assets/css/app.css');
    const rule = /\.login-back \{([^}]*)\}/.exec(css)?.[1] || '';
    assert.match(rule, /min-height: 44px/);
    assert.match(rule, /display: inline-block/); // لا flex: النص والاسم يلتفان كجملة واحدة
    assert.match(rule, /padding: 10px 8px/);
    assert.match(rule, /margin-block: -10px/);
  });

  test('meta.brand.staff_chrome follows brand_in_staff_app (the name the link shows)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const c = t.client();
      const on = (await c.get('/api/meta')).body.brand;
      assert.equal(on.staff_chrome.name, on.name, 'brand in staff chrome by default');
      t.app.settings.set('brand_in_staff_app', false);
      const off = (await t.client().get('/api/meta')).body;
      assert.equal(off.brand.staff_chrome.name, off.settings.org_name, 'org_name as in 9.2 when the setting is off');
      assert.notEqual(off.brand.staff_chrome.name, on.name);
    } finally {
      await t.close();
    }
  });
});

// ───────────────────────── C-17: شريط التواصل في /p/ عند تكبير 200% ─────────────────────────
describe('gate C-17 — the /p/ contact bar wraps instead of clipping at narrow widths', () => {
  const css = read('public/assets/css/v91-portal.css');

  test('.bp-bar-btns wraps (each button keeps its full label as its minimum width)', () => {
    const rules = [...css.matchAll(/(^|\n)\.bp-bar-btns \{([^}]*)\}/g)].map((m) => m[2]).join('\n');
    assert.match(rules, /flex-wrap: wrap/);
    assert.match(css, /\.bp-bar-btns \.bp-btn \{\s*white-space: nowrap;/);
  });

  test('under 280 CSS px: the bar joins the page flow, 44 px buttons, a tighter hours line, and section rows that wrap', () => {
    const block = /@media \(max-width: 279\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] || '';
    // الشريط في آخر الصفحة (لا يغطي أكثر من نصف الشاشة مع الرأس الثابت عند تكبير 200%)
    assert.match(block, /\.bp-bar \{\s*position: static;/);
    assert.match(block, /\.bp-bar-btns > \* \{\s*min-height: 44px;/);
    assert.match(block, /\.bp-row \{\s*flex-wrap: wrap;/);
    assert.match(block, /\.bp-bar \.bp-hours \{[^}]*font-size: 14px/);
    assert.match(block, /\.bp-row > \.bp-pill \{\s*white-space: normal;/);
  });

  test('portal.js keeps --bp-bar-space in step with the bar height (ResizeObserver)', () => {
    const src = read('public/assets/js/public/portal.js');
    assert.match(src, /new ResizeObserver\(barSpace\)\.observe\(bar\)/);
    // لا مساحة محجوزة حين يكون الشريط في مكانه من الصفحة (غير ثابت)
    assert.match(src, /getComputedStyle\(bar\)\.position === 'fixed' \? bar\.offsetHeight : 0/);
    assert.match(src, /requestAnimationFrame\(barSpace\)/);
  });
});
