// إصلاحات ما قبل الإطلاق (الواجهة): نصوص المتابعة، المصطلحات الموحدة («المستفيد/ة» و«الإسناد»)، صيغ العدد،
// صفحة الإعدادات، الجداول والمخططات على الشاشات المختلفة، القائمة الجانبية، رمز الدخول، وسجل الأتمتة.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { statDuration, monthLabel, rating, count } from '../public/assets/js/lib/fmt.js';
import { routeTitle } from '../public/assets/js/app/routes.js';
import { navGroups } from '../public/assets/js/app/shell.js';
import { previewValues } from '../public/assets/js/app/components/quick-replies.js';
import { QUEUE_LABELS, MERGE_LABEL } from '../public/assets/js/app/labels.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'public');
const JS = path.join(PUB, 'assets/js');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.js$/.test(e.name)) yield p;
  }
}

/** النصوص الظاهرة في ملف JS: محتوى النصوص بين علامات الاقتباس فقط (لا التعليقات ولا المعرّفات) */
function visibleStrings(src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    for (const m of line.matchAll(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g)) out.push({ line: i + 1, text: m[0] });
  });
  return out;
}

describe('v9 frontend fixes — formatting helpers', () => {
  test('statDuration always shows a number (no bare «يوم»): hours under 72 h, then days with one decimal', () => {
    assert.equal(statDuration(26 * 3600e3), '26 ساعة');
    assert.equal(statDuration(3600e3), 'ساعة واحدة');
    assert.equal(statDuration(2 * 3600e3), 'ساعتان');
    assert.equal(statDuration(1.5 * 3600e3), '1.5 ساعة');
    assert.equal(statDuration(24 * 3600e3), '24 ساعة');
    assert.equal(statDuration(4 * 86400e3), '4 أيام');
    assert.equal(statDuration(4.5 * 86400e3), '4.5 يوم');
    assert.equal(statDuration(45 * 60e3), '45 دقيقة');
    assert.equal(statDuration(20e3), 'أقل من دقيقة');
    assert.equal(statDuration(null), '—');
    for (const h of [1, 5, 23, 24, 26, 50, 71, 80, 200]) assert.match(statDuration(h * 3600e3), /\d|واحد|ساعتان|يومان/, `${h}h`);
  });

  test('monthLabel turns an accounting month into Arabic words; rating() is «4.1 من 5»', () => {
    assert.equal(monthLabel('2026-10'), 'أكتوبر 2026');
    assert.equal(monthLabel('2026-01'), 'يناير 2026');
    assert.equal(monthLabel('bad'), 'bad');
    assert.equal(monthLabel(''), '—');
    assert.equal(rating(4.123, 5), '4.1 من 5');
    assert.equal(rating(null), '—');
  });

  test('portal summary tiles agree in number with their noun', () => {
    const forms = ['طلب واحد', 'طلبان', 'طلبات', 'طلبًا'];
    assert.equal(count(1, forms), 'طلب واحد');
    assert.equal(count(2, forms), 'طلبان');
    assert.equal(count(5, forms), '5 طلبات');
    assert.equal(count(11, forms), '11 طلبًا');
    const src = read('public/assets/js/public/portal.js');
    assert.ok(!/summaryLink\('#requests', 'message', requests\.filter\(\(r\) => r\.can_reply\)\.length, 'طلبات بانتظار ردك'\)/.test(src), 'no fixed plural label next to a bare count');
    // v9.1 b-portal (تغيير مقصود، B91-02/B91-12): لا مربعات ملخص بعد الآن؛ الأعداد بالعامية عبر countWord،
    // والرقم الوحيد الظاهر هو رقم الطلب REQ («رقم طلبك:») بدل «رقمك لدى المؤسسة»
    assert.match(src, /countWord\(list\.length, \['طلب واحد', 'طلبين', 'طلبات', 'طلب'\]\)/);
    assert.ok(!src.includes('رقم العميل'), 'the beneficiary never sees «رقم العميل»');
    assert.match(src, /'رقم طلبك: '/);
  });
});

describe('v9 frontend fixes — follow-up copy matches what /portal can do', () => {
  // v9.1 b-forms (تغيير مقصود، B91-05): بدل «احفظه… إن فقدته فراسلنا» صارت الشاشة تحفظ الصفحة على الموبايل
  // وتعرض «ابعتي الرابط لنفسك» و«نسخ الرابط»، وتقول ما تذكره المستفيدة لو اتصلت (رقم الطلب القصير).
  test('the intake success screen does not promise follow-up by request number on /portal; it says how to keep and recover the link', () => {
    const src = read('public/assets/js/public/intake.js');
    assert.ok(!src.includes('من صفحة «متابعة طلب» برقم طلبك'), 'no promise /portal cannot keep');
    assert.match(src, /ابعت\{ي\} الرابط لنفسك/);
    assert.match(src, /نسخ الرابط/);
    assert.match(src, /لو كلمت\{ي\}نا قول\{ي\}: طلب رقم/);
  });

  test('landing page, site nav/footer and the /portal page use one name and explain link recovery', async () => {
    const index = read('public/index.html');
    assert.ok(!index.includes('تابع طلبك من هنا'));
    // v9.1 b-site (B91-07): استعادة الرابط صارت سؤالًا في «أسئلة» بالصفحة الرئيسية («ضيّعت رابط طلبي، أعمل إيه؟»)
    assert.match(index, /قدّمتي طلب قبل كده؟<\/strong> تابعيه من هنا/);
    const login = read('public/portal-login.html');
    assert.ok(!/بوابة العملاء/.test(login), 'no «بوابة العملاء» on the beneficiary-facing login page');
    // v11 gate-public (intended: G11-47): العنوان والعنوان الرئيسي مفاتيح بالجانب ({{pl_title}}/{{pl_h1}})؛ نص «خيري» نفسه يُفحص في الصفحة المعروضة أدناه
    assert.match(login, /<title>\{\{pl_title\}\}<\/title>/); // v10 experience (intended, X10-B3 #3): the brand in the title
    // v9.1 b-portal (تغيير مقصود، B91-06): العنوان والكارت بعامية بسيطة
    assert.match(login, /<h1 id="page-title"[^>]*>\{\{pl_h1\}\}<\/h1>/);
    const pl = read('public/assets/js/public/portal-login.js');
    assert.match(pl, /قدّمتي من الموقع ومش لاقية الرابط؟/, 'website-only submitters are told how to get a new link');
    assert.ok(!visibleStrings(pl).some((s) => /عميل|عملاء/.test(s.text)));
    const t = await startTestApp({ seed: 'none' });
    try {
      const html = (await t.client().get('/portal')).body;
      assert.match(html, /<title>متابعة طلبك — Emam Legal and Consultancy<\/title>/); // v11 gate-public (intended): same title, rendered
      assert.match(html, /<h1 id="page-title"[^>]*>تابعي طلبك<\/h1>/); // v11 gate-public (intended): same h1, rendered
      // v9.1 b-site (B91-07): نفس الاسم في القائمة والتذييل بكلام بسيط
      assert.match(html, /<span>تابعي طلبك<\/span>/, 'site nav label');
      assert.match(html, /<a href="\/portal">تابعي طلبك<\/a>/, 'footer label');
      assert.ok(!html.includes('بوابة العملاء'));
      const home = (await t.client().get('/')).body;
      assert.match(home, /ضيّعت رابط طلبي، أعمل إيه؟/);
    } finally {
      await t.close();
    }
  });
});

describe('v9 frontend fixes — terminology', () => {
  // v10 (intended): exact v10 strings where «العملاء» means the firm's clients/the people who see the brand (spec copy), not beneficiaries
  const V10_CLIENT_WORDS = [/اسم المكتب كما يراه العملاء/, /^'الشركات العميلة'$/, /^'مثل: بيانات عملاء، أسعار، خطط منتج\.'$/]; // v10: +2 company spec strings (audit group «الشركات العميلة», nda hint) (intended)
  V10_CLIENT_WORDS.push(/^'شركة عميلة'$/, /^'كل طلبات الشركات العميلة مرتبة حسب أقرب موعد\.'$/); // v10: +2 b2b-staff spec strings (route title STF-0, queue subtitle U10-S04) (intended)
  V10_CLIENT_WORDS.push(/^`هذا حساب داخلي لشركة عميلة — \$\{co\.name\}`$/); // v10: +1 b2b-staff spec string (shadow client, STF-10) (intended)
  // v11 segment-staff (intended): exact v11 spec strings (§10.1/§10.2, S11-39, r2 P5) where «العميل» is the paying client of «أفراد وشركات»
  V10_CLIENT_WORDS.push(/^'لن يُطلب أي مبلغ إلا بموافقة صريحة من العميل على صفحة طلبه\.'$/, /^'لم يوافق العميل على الأتعاب بعد'$/, /^'إرسال رسالة للعميل'$/, /^'إرسال للعميل للموافقة'$/, /^'إضافة كشركة عميلة'$/);
  // v11 segment-staff (intended, build-2): the exact L11-45/S11-42 integrations guide line (ST-6)
  V10_CLIENT_WORDS.push(/^'أضيفوا الرقم الثاني من WhatsApp Manager في نفس حساب واتساب للأعمال، ثم الصقوا معرّفه هنا\. الرد يخرج دائمًا من الرقم الذي كتب عليه العميل\.'$/);
  test('no visible «عميل/عملاء» string anywhere in the SPA, the public scripts or the public HTML', () => {
    const hits = [];
    for (const f of walk(JS)) {
      for (const s of visibleStrings(fs.readFileSync(f, 'utf8'))) if (/عميل|عملاء/.test(s.text) && !V10_CLIENT_WORDS.some((re) => re.test(s.text))) hits.push(`${path.relative(ROOT, f)}:${s.line} ${s.text.slice(0, 80)}`);
    }
    for (const f of fs.readdirSync(PUB).filter((x) => x.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(PUB, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      if (/عميل|عملاء/.test(html)) hits.push(f);
    }
    assert.deepEqual(hits, []);
  });

  test('display labels from the server use «المستفيد/ة» and «صفحة المتابعة»', async () => {
    const { LABELS } = await import('../src/constants.js');
    for (const [group, key] of [['source', 'returning'], ['case_status', 'answered'], ['case_status', 'approved'], ['actor_kind', 'client'], ['automation_rule', 'portal_otp'], ['wa_template_purpose', 'otp'], ['wa_template_purpose', 'survey']]) {
      const v = LABELS[group]?.[key];
      assert.ok(v, `${group}.${key}`);
      assert.ok(!/عميل|عملاء/.test(v), `${group}.${key}: ${v}`);
    }
  });

  test('route titles are the sidebar labels (one name per page): «المستفيدون», «ملف المستفيد/ة», «إسناداتي»', () => {
    assert.equal(routeTitle('/clients'), 'المستفيدون');
    assert.equal(routeTitle('/clients/:id'), 'ملف المستفيد/ة');
    // v9.1 l-home (L-01): /my أصبحت «اليوم»، وقائمة الإسنادات انتقلت إلى /my/assignments «إسناداتي»
    assert.equal(routeTitle('/my'), 'اليوم');
    assert.equal(routeTitle('/my/assignments'), 'إسناداتي');
    for (const role of ['admin', 'case_manager', 'lawyer']) {
      for (const g of navGroups({ role }, { demo: true })) {
        for (const item of g.items) assert.equal(item.label, routeTitle(item.href, role), `${role} ${item.href}`); // v9.1 l-home: lawyerTitle للمحامي
      }
    }
    const staff = navGroups({ role: 'admin' }, { demo: true }).flatMap((g) => g.items.map((i) => i.label));
    assert.ok(staff.includes('الردود الجاهزة وقوالب واتساب'));
    assert.ok(!staff.includes('العملاء والمستفيدون'));
  });

  test('the lawyer portal calls its work «إسنادات», never «ملفاتي»', () => {
    // v9.1 l-home (L-01): القائمة (الحالية/السابقة) في صفحة «إسناداتي» (assignments.js)، و«اليوم» يربط بالسابقة
    const home = read('public/assets/js/app/pages/lawyer/home.js');
    const list = read('public/assets/js/app/pages/lawyer/assignments.js');
    const strings = visibleStrings(home + '\n' + list).map((s) => s.text).join('\n');
    assert.ok(!/ملفاتي(?! المستمرة)/.test(strings), 'no «ملفاتي» except «ملفاتي المستمرة»');
    for (const s of ['الإسنادات الحالية', 'الإسنادات السابقة', 'إسناداتي']) assert.ok(strings.includes(s), s);
    // v9.1 l-work (L-04/L-08): عنوان الشريط العلوي كود الملف كاملًا بلا بادئة «إسناد»
    assert.match(read('public/assets/js/app/pages/lawyer/assignment.js'), /ctx\.setTitle\(view\.case\.code\)/);
    const lawyerNav = navGroups({ role: 'lawyer' }, {}).flatMap((g) => g.items.map((i) => i.label));
    assert.equal(lawyerNav[0], 'اليوم'); // v9.1 l-home (L-01)
    assert.equal(lawyerNav[1], 'إسناداتي');
  });

  test('shared labels: queue sections and the merge action have one name on every page', () => {
    assert.equal(QUEUE_LABELS.identity_conflicts, 'رسائل تحتاج تحققًا من الهوية');
    const dash = read('public/assets/js/app/pages/admin/dashboard.js');
    const queue = read('public/assets/js/app/pages/admin/queue.js');
    assert.match(dash, /label: QUEUE_LABELS\[d\.key\]/);
    for (const k of Object.keys(QUEUE_LABELS)) assert.ok(queue.includes(`title: QUEUE_LABELS.${k}`), `queue section ${k}`);
    assert.ok(MERGE_LABEL);
    assert.match(read('public/assets/js/app/pages/admin/client-detail.js'), /button\(MERGE_LABEL/);
    assert.match(read('public/assets/js/app/pages/admin/intake-detail.js'), /button\(MERGE_LABEL/);
    // عنوان صفحة الطلب ثابت: «الطلب REQ-…»، والموضوع تحته
    assert.match(read('public/assets/js/app/pages/admin/intake-detail.js'), /title: `الطلب \$\{it\.code\}`/);
  });
});

describe('v9 frontend fixes — settings and system pages', () => {
  test('the settings integrations card is a 3-row summary linking to #/integrations (no .env steps, no env table)', () => {
    const src = read('public/assets/js/app/pages/admin/settings.js');
    const shown = visibleStrings(src).map((s) => s.text).join('\n');
    for (const gone of ['.env', 'أعد تشغيل المنصة', 'WHATSAPP_TOKEN', 'متغيرات البيئة على الخادم، ولا تُحفظ']) assert.ok(!shown.includes(gone), `removed: ${gone}`);
    assert.ok(!src.includes('ENV_VARS'), 'the env-var table is gone');
    assert.match(src, /button\('إدارة التكاملات', \{[^}]*href: '#\/integrations'/);
    assert.match(src, /'واتساب للأعمال'/);
    assert.match(src, /'الذكاء الاصطناعي'/);
    assert.match(src, /'Webhook \(الرسائل الواردة\)'/);
    assert.match(src, /label: 'قالب احتياطي \(للتوافق\)'/);
    assert.match(src, /#\/quick-replies\?tab=templates/);
    assert.ok(!src.includes("placeholder: '+20 12 1111 4662'"), 'no value-like placeholder');
  });

  test('the system page shows the real key path from the API, never a hard-coded data/.secret-key', async () => {
    assert.ok(!read('public/assets/js/app/pages/admin/system.js').includes('data/.secret-key'));
    const { LABELS } = await import('../src/constants.js');
    assert.ok(!LABELS.key_source.file.includes('data/.secret-key'));
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const h = (await admin.get('/api/admin/system/health')).body;
      assert.ok('key_file' in h.integrations, 'health exposes key_file');
      if (h.integrations.key_source === 'file') assert.match(h.integrations.key_file, /\.secret-key$/);
      else assert.equal(h.integrations.key_file, null);
    } finally {
      await t.close();
    }
  });
});

describe('v9 frontend fixes — layout', () => {
  test('tables get a scroll cue, can stack on phones, and the matters list fits 1366px', () => {
    const ui = read('public/assets/js/lib/ui.js');
    assert.match(ui, /export function overflowCue\(el, \{ startAtEnd = false \} = \{\}\)/);
    assert.match(ui, /return overflowCue\(h\('div\.table-wrap'/);
    const css = read('public/assets/css/v9-fixes.css');
    assert.match(css, /\.has-overflow\.more-end/);
    assert.match(css, /@media \(max-width: 1439px\)[\s\S]*\.col-hide-lg/);
    assert.match(css, /\.table-stack/);
    assert.match(read('public/app.html'), /\/assets\/css\/v9-fixes\.css/);
    const matters = read('public/assets/js/app/pages/admin/matters.js');
    assert.match(matters, /label: 'المحكمة والدعوى'/);
    assert.ok(!/key: 'status', label: 'الحالة'/.test(matters), 'status moved next to the code');
    assert.ok(!/key: 'lawsuit'/.test(matters), 'court and lawsuit merged');
    assert.match(read('public/assets/js/app/pages/admin/cases.js'), /className: 'col-hide-lg'/);
  });

  test('impact month charts open on the newest months; first-response KPI uses statDuration; satisfaction «من 5»', () => {
    const src = read('public/assets/js/app/pages/admin/impact.js');
    assert.match(src, /overflowCue\(h\(\s*'div\.v9p-vbars-scroll'[\s\S]*?\{ startAtEnd: true \}\)/);
    assert.ok(!/duration\(resp\.first_response_avg_minutes/.test(src));
    assert.match(src, /statDuration\(resp\.first_response_avg_minutes \* 60000\)/);
    assert.match(src, /rating\(r\.satisfaction\.average, r\.satisfaction\.scale\)/);
    assert.ok(!src.includes('`${num(r.satisfaction.average)} / ${r.satisfaction.scale}`'));
    assert.match(read('public/assets/js/app/pages/admin/dashboard.js'), /statDuration\(d\.sla\.avg_minutes \* 60000\)/);
  });

  test('sidebar groups collapse (current group stays open) and the nav fades when it overflows', () => {
    const shell = read('public/assets/js/app/shell.js');
    assert.match(shell, /'aria-expanded': 'true', 'aria-controls': listId/);
    assert.match(shell, /syncNavGroups\(best\)/);
    assert.match(shell, /nav\.classList\.toggle\('more-below'/);
    assert.match(read('public/assets/css/v9-fixes.css'), /\.nav\.more-below/);
  });

  test('minor polish: avatar outside <h1>, one CTA on an empty beneficiary card, wrapping chip, no retry on 403/404', () => {
    assert.match(read('public/assets/js/app/pages/admin/lawyer-detail.js'), /titleMedia: avatar\(l\.display_name/);
    assert.match(read('public/assets/js/lib/ui.js'), /titleMedia \? h\('div\.page-title-row', titleMedia, h\('h1\.page-title', title\)\)/);
    const ben = read('public/assets/js/app/components/beneficiary.js');
    assert.match(ben, /editable && p && button\('تعديل'/);
    assert.match(ben, /className: 'badge-wrap'/);
    assert.match(read('public/assets/js/lib/ui.js'), /retry && !\[401, 403, 404, 410\]\.includes\(status\)/);
  });
});

describe('v9 frontend fixes — portal OTP, quick replies, automations, language', () => {
  test('a rejected OTP is cleared and never re-sent unchanged; «دخول» stays disabled until a new 6-digit code', () => {
    const src = read('public/assets/js/public/portal-login.js');
    assert.match(src, /submit\.disabled = busy \|\| locked \|\| v\.length !== 6 \|\| v === rejected;/);
    assert.match(src, /if \(code === rejected\) \{/);
    assert.match(src, /if \(v\.length === 6 && v !== rejected\) verify\(\);/);
    assert.match(src, /rejected = code;\s*input\.value = '';/);
  });

  test('the quick-reply preview fills {org_name} like the inserted text does', () => {
    const v = previewValues({ client_name: 'سامية' });
    assert.equal(v.client_name, 'سامية');
    assert.ok(v.org_name, 'org_name is always present in the preview');
    assert.equal(previewValues({ org_name: 'x' }).org_name, 'x', 'explicit context wins');
  });

  test('automation run history shows codes and names with links, not internal ids', async () => {
    const src = read('public/assets/js/app/pages/admin/automations.js');
    assert.ok(!src.includes('رقم ${run.entity_id}'));
    assert.match(src, /runEntity\(run\)/);
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const { rules } = (await admin.get('/api/admin/automations')).body;
      const runs = rules.flatMap((r) => r.recent_runs || []);
      assert.ok(runs.length > 0, 'demo has automation runs');
      for (const run of runs) {
        assert.ok('entity_code' in run && 'client_name' in run, 'entity_code and client_name returned');
        if (run.entity_code) assert.match(run.entity_code, /^[A-Z]{2,4}-\d{4}-\d{3,5}$/);
      }
      assert.ok(runs.some((r) => r.client_name), 'at least one run names its beneficiary');
    } finally {
      await t.close();
    }
  });

  test('language polish: month label, colon-form calendar summary, whole-pound KPI, numeric bar labels, team count', () => {
    const cd = read('public/assets/js/app/pages/admin/case-detail.js');
    assert.match(cd, /`عن \$\{monthLabel\(b\.period\)\}`/);
    assert.ok(!cd.includes("'عن شهر ', ltr(b.period)"));
    assert.match(cd, /count\(activeTeam\.length, \['محامٍ واحد', 'محاميان', 'محامين', 'محاميًا'\]\)/);
    const cal = read('public/assets/js/app/pages/admin/calendar.js');
    assert.match(cal, /`\$\{TYPE_PLURAL\[t\]\}: \$\{n\}`/);
    const prog = read('public/assets/js/app/pages/admin/programs.js');
    assert.match(prog, /money\(Math\.round\(s\.cost_per_case\)\)/);
    assert.ok(!/valueText: \(r\) => count\(r\.value, 'case'\)/.test(prog), 'bar values are numerals');
  });
});
