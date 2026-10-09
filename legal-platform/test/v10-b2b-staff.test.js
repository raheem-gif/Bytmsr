// v10 b2b-staff — مكتب خدمة الشركات في /app (§9.3): المسارات والقائمة، أيقونات الإشعارات، معاينة «كما تراه الشركة»
// بمكوّنات البوابة نفسها، ترتيب قائمة الطلبات والإجراء الأساسي، ورقة القبول/الاستيضاح/العرض/التسليم (فحص ثابت)،
// وعقد البيانات مع الخادم على بيانات العرض التجريبي (الحقول التي تقرؤها صفحات الفريق موجودة فعلًا).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { routes, routeTitle, STAFF } from '../public/assets/js/app/routes.js';
import { navGroups } from '../public/assets/js/app/shell.js';
import { notifIcon, notifTone } from '../public/assets/js/app/notif.js';
import { ICONS } from '../public/assets/js/lib/ui.js';
import { groupOf, primaryActionOf, hm, hoursPhrase, FLAG_COPY, clockOf } from '../public/assets/js/app/pages/admin/company-requests.js';
import { pendingPhrase, savedGrants, grantsOf } from '../public/assets/js/app/pages/admin/company-request.js';
import { QUOTE_BASES } from '../public/assets/js/app/components/company-quote-sheet.js';
import { companyPeopleIn, removeCompanyPeople } from '../public/assets/js/app/components/company-accept-sheet.js';
import { OFFICE_REVIEW_COPY, authorLine } from '../public/assets/js/app/components/company-deliverable-sheet.js';
import { grantable } from '../public/assets/js/app/components/company-memory-grants.js';
// build-2 (STF-7 … STF-11)
import { PREFIX_COPY, byHealth, healthChips } from '../public/assets/js/app/pages/admin/companies.js';
import { EMAIL_CHANGE_COPY, PURGE_BACKUPS_COPY, memoryValues } from '../public/assets/js/app/pages/admin/company-detail.js';
import { TERMS_BLANK, termsSummary, roundsText, OVERAGE_POLICIES, BASES_NOTE } from '../public/assets/js/app/components/company-plan-terms.js';
import { TERMS_URL_HINT, WEEK } from '../public/assets/js/app/components/company-b2b-settings.js';
import { OUTBOX_RED_NOTE, OUTBOX_STATUS, PROVIDERS, SMTP_PORTS, SECURITY } from '../public/assets/js/app/components/email-settings.js';
import { NAME_LATIN_HINT } from '../public/assets/js/app/pages/admin/lawyer-detail.js';
import { actionCopy, companyParts } from '../public/assets/js/app/words.js';
import { companyOpinionSkeleton, COMPANY_HEADINGS, COMPANY_STEPS_LABEL, COMPANY_WRITE_HINT } from '../public/assets/js/app/pages/lawyer/write.js';
import { COMPANY_NO_CONTEXT, SENIOR_REVIEW_LINE, WORK_FILES_WARNING } from '../public/assets/js/app/pages/lawyer/assignment.js';
import { memoryFields } from '../public/assets/js/lib/company-catalog-fields.js';
import { memoryKindByKey } from '../public/assets/js/lib/company-catalog.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const APP = 'public/assets/js/app/';
const NEW_STAFF_FILES = [
  `${APP}pages/admin/company-requests.js`,
  `${APP}pages/admin/company-request.js`,
  `${APP}pages/admin/companies.js`,
  `${APP}pages/admin/company-detail.js`,
  `${APP}components/company-accept-sheet.js`,
  `${APP}components/company-clarify-sheet.js`,
  `${APP}components/company-quote-sheet.js`,
  `${APP}components/company-deliverable-sheet.js`,
  `${APP}components/company-memory-grants.js`,
  `${APP}components/company-plan-terms.js`, // build-2 (STF-7 … STF-9)
  `${APP}components/company-b2b-settings.js`,
  `${APP}components/email-settings.js`,
];
const TEXT_SHEETS = ['company-accept-sheet.js', 'company-clarify-sheet.js', 'company-quote-sheet.js', 'company-deliverable-sheet.js'];

// ───────────────────────── STF-0: المسارات والقائمة والإشعارات ─────────────────────────

describe('v10 b2b-staff — routes, navigation and notification icons (STF-0)', () => {
  test('the four company routes exist for staff only (roles STAFF) with the exact titles', () => {
    const want = {
      '/company-requests': 'طلبات الشركات',
      '/company-requests/:id': 'طلب شركة',
      '/companies': 'الشركات العميلة',
      '/companies/:id': 'شركة عميلة',
    };
    for (const [p, title] of Object.entries(want)) {
      const r = routes.find((x) => x.path === p);
      assert.ok(r, p);
      assert.equal(r.roles, STAFF, `${p} roles`);
      assert.deepEqual([...r.roles].sort(), ['admin', 'case_manager']);
      assert.equal(routeTitle(p), title);
      assert.equal(typeof r.load, 'function');
      assert.ok(fs.existsSync(path.join(ROOT, APP, /import\('\.\/(pages\/admin\/[\w-]+\.js)'\)/.exec(String(r.load))[1])), `${p} page file`);
    }
  });

  test('«خدمة الشركات» sits right after «التشغيل اليومي» for staff, never for lawyers', () => {
    for (const role of ['admin', 'case_manager']) {
      const groups = navGroups({ role }, { demo: true });
      const i = groups.findIndex((g) => g.title === 'خدمة الشركات');
      assert.equal(i, 1, `${role}: group position`);
      assert.equal(groups[0].title, 'التشغيل اليومي');
      assert.deepEqual(groups[i].items.map((x) => [x.href, x.icon, x.label]), [
        ['/company-requests', 'inboxStack', 'طلبات الشركات'],
        ['/companies', 'building', 'الشركات العميلة'],
      ]);
      assert.equal(groups[i].items[0].coBadge, true, 'badge on «طلبات الشركات»');
    }
    const lawyer = navGroups({ role: 'lawyer' }, {});
    assert.ok(!lawyer.some((g) => g.title === 'خدمة الشركات'));
    assert.ok(!lawyer.flatMap((g) => g.items).some((x) => /company|companies/.test(x.href)));
  });

  test('the sidebar badge comes from /admin/b2b/overview with the notifications poll, as a background request', () => {
    const shell = read(`${APP}shell.js`);
    assert.match(shell, /api\.get\('\/admin\/b2b\/overview', undefined, \{ background: true \}\)/);
    assert.match(shell, /Number\(o && o\.badge\)/);
    assert.match(read('public/app.html'), /<link rel="stylesheet" href="\/assets\/css\/v10-experience\.css" \/>\n {4}<link rel="stylesheet" href="\/assets\/css\/v10-desk\.css" \/>/);
  });

  test('every staff notification type the server sends for companies maps to a real icon; escalation, SLA late and plan error are danger', () => {
    const types = new Set();
    for (const f of ['src/services/company-requests.js', 'src/services/companies.js', 'src/services/company-memory.js', 'src/services/company-billing.js', 'src/services/email.js']) {
      for (const m of read(f).matchAll(/type:\s*'((?:company_request|company|email)\.[a-z_]+)'/g)) types.add(m[1]);
    }
    for (const t of ['company_request.new', 'company_request.escalated', 'company_request.sla_late', 'company_request.sla_at_risk', 'company_request.plan_error', 'company_request.memory_pending', 'company.renewal', 'company.subscription_ended', 'company.invite_conflict', 'company.manager_reassigned', 'email.failed']) types.add(t);
    for (const t of types) {
      const name = notifIcon(t);
      assert.ok(ICONS[name], `${t} → «${name}» is an icon`);
      assert.notEqual(name, 'message', `${t} is not shown as a chat message`);
    }
    for (const t of ['company_request.escalated', 'company_request.sla_late', 'company_request.plan_error']) {
      assert.equal(notifIcon(t), 'alert', t);
      assert.equal(notifTone(t), 'is-danger', t);
    }
    assert.equal(notifIcon('company_request.sla_at_risk'), 'clock');
    assert.equal(notifTone('company_request.sla_at_risk'), 'is-warning');
    assert.equal(notifIcon('company.renewal'), 'calendarClock');
    assert.equal(notifIcon('company.created'), 'building');
    assert.equal(notifIcon('email.failed'), 'alert');
    assert.equal(notifTone('email.failed'), 'is-warning');
    assert.equal(ICONS[notifIcon('company_request.new')], ICONS.inboxStack, 'company requests use the inboxStack glyph');
  });

  test('v10-desk.css: tokens only (no colour literals), no transition: all, no letter-spacing', () => {
    const css = read('public/assets/css/v10-desk.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = css
      .split('\n')
      .filter((l) => !/^\s*--[\w-]+\s*:/.test(l))
      .filter((l) => /#[0-9a-f]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(|(?<![-\w])(?:white|black)(?![-\w])/i.test(l));
    assert.deepEqual(bad, []);
    assert.ok(!/transition:\s*all/.test(css));
    assert.ok(!/letter-spacing/.test(css));
  });
});

// ───────────────────────── STF-1: قائمة الطلبات ─────────────────────────

describe('v10 b2b-staff — the queue (STF-1)', () => {
  const item = (o) => ({ id: 1, status: 'submitted', flags: [], escalated: false, sla: { state: 'on_track' }, ai: null, ...o });

  test('cards are grouped escalated → late → plan error → at risk → new → needs you → working → awaiting (A16, J3)', () => {
    assert.equal(groupOf(item({ escalated: true, sla: { state: 'late' } })), 'escalated');
    assert.equal(groupOf(item({ status: 'in_progress', sla: { state: 'late' } })), 'late');
    assert.equal(groupOf(item({ flags: ['plan_error', 'quote_approved'] })), 'plan_error');
    assert.equal(groupOf(item({ sla: { state: 'at_risk' } })), 'at_risk');
    assert.equal(groupOf(item({})), 'new');
    assert.equal(groupOf(item({ status: 'in_progress', flags: ['clarification_answered'] })), 'needs');
    assert.equal(groupOf(item({ status: 'in_progress' })), 'working');
    assert.equal(groupOf(item({ status: 'awaiting_company', sla: { state: 'paused' } })), 'awaiting');
    const src = read(`${APP}pages/admin/company-requests.js`);
    const order = [...src.matchAll(/^\s*\['(\w+)', '[^']+'\],$/gm)].map((m) => m[1]);
    assert.deepEqual(order, ['escalated', 'late', 'plan_error', 'at_risk', 'new', 'needs', 'working', 'awaiting', 'closed']);
    for (const t of ['مصعّدة', 'متأخرة', 'يقترب موعدها', 'جديدة — بانتظار الفرز', 'تحتاج إجراءً منكم', 'قيد العمل', 'بانتظار الشركة']) assert.ok(src.includes(`'${t}'`), t);
  });

  test('one primary action per card (U10-S05), and a case manager never gets a quote button', () => {
    const admin = { role: 'admin' };
    const cm = { role: 'case_manager' };
    assert.equal(primaryActionOf(item({}), cm).label, 'فرز وبدء العمل');
    const out = item({ ai: { scope: 'out_of_scope' } });
    assert.equal(primaryActionOf(out, admin).label, 'إعداد عرض سعر');
    assert.deepEqual([primaryActionOf(out, cm).label, primaryActionOf(out, cm).disabled], ['يحتاج عرض سعر من مدير النظام', true]);
    assert.equal(primaryActionOf(item({ flags: ['clarification_answered'] }), cm).label, 'مراجعة رد الشركة');
    assert.equal(primaryActionOf(item({ flags: ['quote_approved'] }), cm).label, 'بدء العمل — وافقت الشركة على العرض');
    assert.equal(primaryActionOf(item({ status: 'in_progress', flags: ['opinion_approved_not_delivered'] }), cm).label, 'إعداد التسليم');
    assert.equal(primaryActionOf(item({ status: 'in_progress', flags: ['changes_requested'] }), cm).label, 'متابعة التعديلات');
    assert.equal(primaryActionOf(item({ escalated: true }), cm).label, 'الاطلاع على التصعيد');
    assert.equal(primaryActionOf(item({ status: 'in_progress' }), cm).label, 'فتح');
  });

  test('flag chips carry the exact copy; the view choice is remembered in bm.coq.view; SLA numbers are tabular and the phase is named', () => {
    assert.equal(FLAG_COPY.company_not_emailed[0], 'لم تُبلَّغ الشركة بالبريد — اتصلوا بها');
    assert.equal(FLAG_COPY.company_not_emailed[1], 'warning');
    assert.equal(FLAG_COPY.memory_pending[0], 'عقد بانتظار المراجعة في الذاكرة');
    assert.deepEqual(FLAG_COPY.plan_error.slice(0, 2), ['تعذّر بدء العمل تلقائيًا', 'danger']);
    const src = read(`${APP}pages/admin/company-requests.js`);
    assert.match(src, /const VIEW_KEY = 'bm\.coq\.view';/);
    assert.match(src, /h\('span\.num', hm\(v\)\)/);
    assert.match(src, /phase_label/);
    assert.equal(hm(105), '1:45');
    assert.equal(hm(-75), '1:15');
    assert.equal(hoursPhrase(1), 'ساعة عمل');
    assert.equal(hoursPhrase(2), 'ساعتي عمل');
    assert.equal(hoursPhrase(3), '3 ساعات عمل');
    assert.equal(hoursPhrase(12), '12 ساعة عمل');
    assert.equal(hoursPhrase(9.5), '9.5 ساعة عمل');
    assert.equal(hoursPhrase(2, 'calendar'), 'ساعتين');
  });
});

// ───────────────────────── STF-2 … STF-6: الصفحة والأوراق ─────────────────────────

describe('v10 b2b-staff — request page and sheets (STF-2 … STF-6)', () => {
  test('«as the company sees it» uses the portal renderers (lib/company-ui.js), not a staff copy', () => {
    const imports = (f) => read(`${APP}components/${f}`);
    assert.match(imports('company-clarify-sheet.js'), /import \{ coClarificationCard \} from '\.\.\/\.\.\/lib\/company-ui\.js';/);
    assert.match(imports('company-quote-sheet.js'), /import \{ coQuoteCard \} from '\.\.\/\.\.\/lib\/company-ui\.js';/);
    assert.match(imports('company-deliverable-sheet.js'), /import \{ coDeliverableCard \} from '\.\.\/\.\.\/lib\/company-ui\.js';/);
    const page = read(`${APP}pages/admin/company-request.js`);
    assert.match(page, /import \{ promiseText, teamAuthor \} from '\.\.\/\.\.\/\.\.\/lib\/company-ui\.js';/);
    assert.match(page, /import \{ coRequestFields \} from '\.\.\/\.\.\/\.\.\/lib\/company-forms\.js';/);
    assert.match(page, /ما تراه الشركة: /);
  });

  test('every staff company sheet with a text field asks «تجاهل ما كتبته؟» before a gesture closes it (L-64)', () => {
    for (const f of TEXT_SHEETS) {
      const src = read(`${APP}components/${f}`);
      assert.match(src, /beforeClose: discardGuard\([^)]*\{ singular: true \}\)|beforeClose: discardGuard\(isDirty, STAFF_DISCARD\)/, f);
      assert.match(src, /sheet: true/, f);
    }
    assert.match(read(`${APP}components/company-accept-sheet.js`), /const STAFF_DISCARD = \{ singular: true \};/);
  });

  test('copy: no «مسؤول الحساب» anywhere in the new staff files (L-50); the quote sheet offers fixed and capped only (L-31)', () => {
    for (const f of NEW_STAFF_FILES) assert.ok(!/مسؤول(و)? (ال)?حساب/.test(read(f)), f);
    assert.deepEqual(QUOTE_BASES.map((b) => [b.value, b.label]), [
      ['fixed', 'مبلغ ثابت'],
      ['capped', 'بحد أقصى'],
    ]);
    const q = read(`${APP}components/company-quote-sheet.js`).replace(/\/\/.*$/gm, ''); // بلا التعليقات
    assert.ok(!/hourly|بالساعة/.test(q));
  });

  test('accept sheet: in-sheet handling of every U10-S12 conflict, server warnings, haptic on success, person items never offered', () => {
    const src = read(`${APP}components/company-accept-sheet.js`);
    for (const code of ['request_changed', 'conflict_review_required', 'overage_approval_required', 'quota_blocked', 'out_of_scope_requires_quote', 'already_accepted']) assert.ok(src.includes(`case '${code}'`), code);
    for (const t of [
      'تغيّر الطلب بعد فتح هذه النافذة (ردّت الشركة أو أُضيف مستند).',
      'مراجعة التغييرات',
      'متابعة رغم ذلك',
      'تعارض مصالح محتمل',
      'راجعت التعارض وأقرر المتابعة',
      'بدء العمل رغم التعارض',
      'استخدمت الشركة كل الطلبات المشمولة هذا الشهر وتشترط باقتها موافقتها على التكلفة الإضافية.',
      'إرسال طلب موافقة للشركة',
      'يرسل مدير النظام طلب الموافقة.',
      'باقة الشركة لا تسمح بطلبات إضافية هذا الشهر.',
      'مجانًا — بقرار الإدارة',
      'هذا الطلب خارج باقة الشركة؛ أرسل عرض سعر أولًا.',
      'بدأ زميل العمل على هذا الطلب للتو.',
      'لا تذكر أسماء موظفي الشركة أو بريدهم أو هواتفهم. يرى المحامي اسم الشركة.',
      'بدء العمل وإبلاغ الشركة',
      'موعده الافتراضي قبل موعد الشركة بـ 25٪.',
      'حدد موعد التسليم يدويًا للطلبات الكبيرة جدًا.',
    ]) assert.ok(src.includes(t), t);
    assert.match(src, /haptic\('success'\)/);
    assert.match(src, /toast\(`بدأ العمل على \$\{r\.code\} — أُبلغت الشركة\.`/);
    assert.match(src, /m\.kind !== 'person'/);
    // review: البريد والهاتف أولًا ثم صيغ الاسم من الأطول (تغيّر الترتيب عمدًا مع كشف الاسم الأول)
    assert.deepEqual(companyPeopleIn('تواصلوا مع مريم عادل على mariam@nilefoods.example', [{ name: 'مريم عادل', email: 'mariam@nilefoods.example', phone: null }, { name: 'دينا سمير' }]), ['mariam@nilefoods.example', 'مريم عادل']);
    assert.equal(grantable('person'), false);
    assert.equal(grantable('contract'), true);
  });

  test('clarify: first-response line before acceptance, the paused-delivery line after; queue and case page route company info requests to the portal', () => {
    const src = read(`${APP}components/company-clarify-sheet.js`);
    assert.ok(src.includes('الرد الأول يُحتسب بهذا الاستيضاح. '));
    assert.ok(src.includes('يعود الطلب إلى الفرز عند رد الشركة.'));
    assert.ok(src.includes('يتوقف موعد التسليم حتى ترد الشركة (المتبقي الآن: '));
    assert.ok(src.includes("const DEFAULT_TEXT = 'لاستكمال الطلب نحتاج منكم:';"));
    for (const f of ['pages/admin/queue.js', 'pages/admin/case-detail.js']) {
      const s = read(`${APP}${f}`);
      assert.ok(s.includes('يصل إلى: الشركة (عبر بوابتها).'), f);
      assert.ok(s.includes('تُحذف أسماء موظفي الشركة وبياناتهم تلقائيًا قبل وصول الرد إلى المحامي.'), f);
    }
  });

  test('deliverable: deterministic prefill button, live precheck debounced 600 ms, Office/PDF review copy, file-author line, send disabled until gates pass', () => {
    const src = read(`${APP}components/company-deliverable-sheet.js`);
    assert.ok(src.includes('تعبئة من الرأي المعتمد'));
    assert.ok(src.includes('/deliverables/prefill'));
    assert.ok(src.includes('مسودة مقترحة — راجِعها قبل الإرسال'));
    assert.match(src, /const DEBOUNCE_MS = 600;/);
    assert.equal(OFFICE_REVIEW_COPY, 'ملفات Word وExcel وPDF قد تحمل اسم كاتبها في خصائصها وفي التعديلات المتعقَّبة والتعليقات؛ راجعتُ الملفات وتأكدت من خلوّها من أسماء المحامين.');
    assert.equal(authorLine('redline.docx', 'tarek'), 'الملف redline.docx يحمل اسم tarek في بياناته — احفظه من جديد بلا اسم الكاتب ثم ارفعه');
    assert.match(src, /sendBtn\.disabled = !pass;/);
    for (const t of ['رأي معتمد في ملف العمل', 'لا يوجد رأي معتمد بعد', 'مراجعة نهائية معتمدة', 'المراجعة النهائية لم تُعتمد بعد', 'لا أسماء محامين في النص', 'كل الملفات من هذا الطلب', 'معاينة كما ستراه الشركة', 'حفظ مسودة', 'إرسال للشركة']) assert.ok(src.includes(t), t);
    assert.ok(src.includes('أُرسل التسليم إلى ${d.company.name}.'));
  });

  test('request page: handler PATCH carries rev; decline/close/reopen dialogs and the escalation acknowledgement use the exact labels', () => {
    const src = read(`${APP}pages/admin/company-request.js`);
    assert.match(src, /api\.patch\(`\/admin\/company-requests\/\$\{d\.request\.id\}`, \{ rev: d\.rev, handler_id/);
    for (const t of ['اعتذار عن الطلب', 'إرسال الاعتذار للشركة', 'نعتذر عن هذا الطلب لوجود تعارض مصالح يمنعنا من العمل عليه.', 'إغلاق الطلب', 'إعادة فتح الطلب', 'تم الاطلاع', 'ملاحظة المتابعة', 'الفرز المقترح', 'فحص الباقة', 'الطلب كما أرسلته الشركة', 'للإدارة فقط — لا تُشارك بيانات موظفي الشركة مع المحامين.', 'المحادثة مع الشركة', 'رسالة للشركة', 'ملاحظة داخلية', 'ملاحظة داخلية — لا تراها الشركة', 'ملف العمل الداخلي: ', 'صلاحيات الذاكرة', 'التسليمات', 'عروض الأسعار والرسوم', 'مراجعة العقد في الذاكرة', 'لم تُبلَّغ الشركة بالبريد — اتصلوا بها.', 'تعديل موعد التسليم']) assert.ok(src.includes(t), t);
    assert.ok(src.includes('الرسالة تحتوي اسم محامٍ من فريق العمل («${name}»). الشركة لا ترى أسماء المحامين — احذف الاسم أو أعد الصياغة.'));
  });
});

// ───────────────────────── عقد البيانات مع الخادم (العرض التجريبي) ─────────────────────────

describe('v10 b2b-staff — the fields the staff pages read exist in the server responses (demo seed)', () => {
  let t;
  let admin;
  let cm;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    cm = await t.login('manager');
  });
  after(async () => t && t.close());
  const has = (obj, keys, where) => {
    for (const k of keys) assert.ok(obj && Object.prototype.hasOwnProperty.call(obj, k), `${where}: ${k}`);
  };

  test('queue items, request detail, company view, overview', async () => {
    const q = await cm.get('/api/admin/company-requests?status=all');
    assert.equal(q.status, 200);
    assert.ok(q.body.items.length >= 9);
    for (const it of q.body.items) {
      has(it, ['id', 'code', 'company', 'type', 'type_label', 'title', 'priority', 'status', 'status_label', 'stage', 'stage_label', 'flags', 'sla', 'handler', 'lead_name', 'ai', 'escalated', 'staff_unread', 'updated_at'], it.code);
      has(it.sla, ['phase', 'phase_label', 'due_at', 'state', 'business_minutes_left'], `${it.code}.sla`);
      has(it.company, ['id', 'name', 'prefix'], `${it.code}.company`);
    }
    const withAi = q.body.items.find((x) => x.ai);
    assert.ok(withAi, 'at least one queue item carries the AI line (D10)');
    has(withAi.ai, ['one_line', 'type', 'area', 'size', 'scope', 'excluded_work', 'senior_review', 'confidence', 'provider'], 'ai');
    const nfd6 = q.body.items.find((x) => x.code === 'NFD-0006');
    const d = (await cm.get(`/api/admin/company-requests/${nfd6.id}`)).body;
    has(d, ['rev', 'request', 'timeline', 'company', 'submitter', 'triage', 'scope_check', 'case', 'notes', 'messages', 'documents', 'watchers', 'memory_refs', 'memory_item', 'sla', 'quotes', 'deliverables', 'charges', 'activity'], 'detail');
    has(d.request, ['id', 'code', 'title', 'type', 'type_label', 'description', 'fields', 'entity', 'priority', 'requested_priority', 'urgent_reason', 'needed_by', 'visibility', 'status', 'status_label', 'stage', 'flags', 'escalation', 'accept_plan', 'accept_plan_error', 'handler_id', 'revisions', 'remaining_business_hours', 'first_response_kind', 'requires_senior_review', 'risk_level', 'skills', 'practice_area', 'size'], 'detail.request');
    has(d.sla, ['phase', 'state', 'first_response_due_at', 'first_response_at', 'confirm_due_at', 'delivery_due_at', 'delivery_due_original_at', 'delivery_due_reason', 'paused_minutes_total', 'pauses', 'company_sees'], 'detail.sla');
    has(d.scope_check, ['in_plan', 'reason_labels', 'quota', 'would_be'], 'scope_check');
    has(d.company, ['id', 'name', 'prefix', 'read_only', 'account_manager', 'plan', 'email_enabled'], 'detail.company');
    has(d.submitter, ['name', 'email', 'phone', 'job_title', 'role_label'], 'submitter');
    has(d.triage.output, ['one_line', 'type', 'practice_area', 'skills', 'urgency', 'effort', 'risk_flags', 'missing_info', 'excluded_work', 'memory_refs', 'questions_for_company', 'brief_for_lawyer', 'issues'], 'triage');
    assert.equal(d.charges, null, 'charges are admin only');
    const co = (await cm.get(`/api/admin/companies/${d.company.id}`)).body;
    has(co.subscription.terms, ['sla', 'size_factor', 'senior_review'], 'terms');
    has(co.subscription.terms.sla.normal, ['first_response_hours', 'delivery_hours', 'clock'], 'terms.sla');
    assert.ok(Array.isArray(co.users) && co.users.every((u) => 'name' in u && 'email' in u), 'company users for the employee-name warning');
    const mem = (await cm.get(`/api/admin/companies/${d.company.id}/memory`)).body;
    for (const m of mem.items) has(m, ['id', 'kind', 'kind_label', 'title'], 'memory');
    const sl = (await cm.get(`/api/admin/company-requests/${nfd6.id}/suggest-lawyers?role=lead`)).body;
    has(sl, ['items', 'excluded'], 'suggest');
    for (const l of sl.items) has(l, ['id', 'name', 'reasons', 'over_capacity', 'b2b_rate', 'skills'], 'suggest item');
    const ov = (await cm.get('/api/admin/b2b/overview')).body;
    assert.equal(typeof ov.badge, 'number');
    const adminDetail = (await admin.get(`/api/admin/company-requests/${nfd6.id}`)).body;
    assert.ok(Array.isArray(adminDetail.charges), 'admin sees charges');
  });

  test('deliverable precheck (incl. file_authors) and deterministic prefill; the lawyer view of tarek carries the company block', async () => {
    const q = (await admin.get('/api/admin/company-requests?status=all')).body.items;
    let found = null;
    for (const it of q) {
      const d = (await admin.get(`/api/admin/company-requests/${it.id}`)).body;
      const approved = d.case && d.case.opinions.find((o) => o.status === 'approved');
      if (approved && d.deliverables.length) {
        found = { d, approved };
        break;
      }
    }
    assert.ok(found, 'a demo request with an approved opinion and a deliverable');
    const pc = (await admin.get(`/api/admin/company-deliverables/${found.d.deliverables[0].id}/precheck`)).body;
    has(pc, ['approved_opinion', 'senior_review', 'lawyer_names', 'file_authors', 'office_docs', 'foreign_docs', 'docs_reviewed'], 'precheck');
    const pf = await admin.post(`/api/admin/company-requests/${found.d.request.id}/deliverables/prefill`, { opinion_id: found.approved.id });
    assert.equal(pf.status, 200, JSON.stringify(pf.body));
    has(pf.body, ['summary', 'recommendations', 'risk_level', 'body', 'opinion_id'], 'prefill');
    has(found.d.case, ['id', 'code', 'status_label', 'team', 'opinions', 'work_files'], 'case');
    for (const a of found.d.case.team) has(a, ['assignment_id', 'lawyer_id', 'lawyer_name', 'role', 'role_label', 'status', 'status_label', 'due_at'], 'team');
    has(found.d.deliverables[0], ['id', 'version', 'kind_label', 'title', 'final', 'status', 'status_label', 'decision', 'rating', 'feedback', 'documents', 'docs_reviewed', 'opinion_id'], 'deliverable');

    const tarek = await t.login('tarek');
    const list = (await tarek.get('/api/lawyer/assignments')).body;
    const items = Array.isArray(list) ? list : list.items || [];
    const co = items.find((x) => x.company);
    assert.ok(co, 'tarek has a company assignment');
    const view = (await tarek.get(`/api/lawyer/assignments/${co.id}`)).body;
    has(view.company, ['name', 'entity', 'request_type', 'request_type_label', 'priority', 'output_language', 'delivery_due_at', 'requires_senior_review', 'context'], 'lawyer company block');
  });
});

// ───────────────────────── build-2: STF-7 … STF-11 ─────────────────────────

describe('v10 b2b-staff — companies, company page, settings and e-mail (STF-7 … STF-9)', () => {
  test('companies list: health chips and «من يحتاج انتباهًا أولًا» ordering (T16); the column is «مدير العلاقة»', () => {
    const rows = [
      { name: 'ب', late: 0, at_risk: 0, awaiting_company: 2 },
      { name: 'أ', late: 0, at_risk: 1, awaiting_company: 0 },
      { name: 'ج', late: 1, at_risk: 0, awaiting_company: 0 },
      { name: 'د', late: 0, at_risk: 0, awaiting_company: 0 },
    ];
    assert.deepEqual([...rows].sort(byHealth).map((r) => r.name), ['ج', 'أ', 'ب', 'د']);
    assert.equal(typeof healthChips, 'function');
    const src = read(`${APP}pages/admin/companies.js`);
    for (const t of ['badge(`متأخرة ${c.late}`, \'danger\'', 'badge(`يقترب موعدها ${c.at_risk}`, \'warning\'', 'badge(`بانتظار الشركة ${c.awaiting_company}`, \'info\')', "badge('سليمة', 'neutral')"]) assert.ok(src.includes(t), t);
    assert.ok(src.includes("label: 'مدير العلاقة'"));
    assert.ok(src.includes("'مدير العلاقة (من فريقنا)'"));
    assert.ok(src.includes("sec('أول مستخدم — مدير بوابة الشركة'"));
    assert.ok(src.includes("'إنشاء الشركة وإرسال الدعوة'"));
    assert.ok(src.includes('تشابه أسماء محتمل: ${matchText || conflicts.length} — راجعها قبل بدء العمل.'));
    assert.ok(src.includes("'البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط.'"));
    assert.ok(src.includes("'فتح صفحة الشركة'"));
    assert.match(src, /api\.get\('\/admin\/companies\/prefix-check', \{ prefix: value/);
    assert.deepEqual(PREFIX_COPY, { ok: 'متاحة ✓', taken: 'مستخدمة لشركة أخرى', reserved: 'محجوزة للنظام', invalid: 'حروف لاتينية كبيرة من 2 إلى 5', locked: 'لا تتغير البادئة بعد أول طلب للشركة.' });
    assert.match(src, /'أول طلب: '/);
  });

  test('plan terms: urgent allowance per cycle, no hourly rate, quotes fixed or capped; summaries agree in number and noun', () => {
    const src = read(`${APP}components/company-plan-terms.js`).replace(/\/\/.*$/gm, '');
    assert.ok(src.includes("'الطلبات العاجلة في الدورة'"));
    assert.ok(!/hourly|سعر الساعة/.test(src), 'no hourly basis (L-31)');
    assert.equal(BASES_NOTE, 'عروض الأسعار للأعمال خارج الباقة: «مبلغ ثابت» أو «بحد أقصى» فقط.');
    assert.deepEqual(OVERAGE_POLICIES.map((p) => p.value), ['approve', 'bill', 'block']);
    assert.ok(!OVERAGE_POLICIES.some((p) => /مطالبة/.test(p.label)), 'no invoice wording (L-31)');
    assert.equal(TERMS_BLANK.urgent_per_month, 1);
    assert.ok(!('hourly_rate_minor' in TERMS_BLANK));
    assert.equal(termsSummary({ ...TERMS_BLANK, included_requests: 15, urgent_per_month: 3, max_users: 10, max_entities: 3, price_minor: null }), '15 طلبًا في الدورة · 3 طلبات عاجلة · 10 مستخدمين · 3 كيانات');
    assert.equal(termsSummary({ ...TERMS_BLANK, included_requests: null, urgent_per_month: null, max_users: null, max_entities: 1, price_minor: null }), 'طلبات غير محدودة · العاجل غير محدود · مستخدمون بلا حد · كيان واحد');
    assert.equal(termsSummary({ ...TERMS_BLANK, included_requests: 2, urgent_per_month: 2, max_users: 11, max_entities: 2, price_minor: null }), 'طلبين في الدورة · طلبين عاجلين · 11 مستخدمًا · كيانين');
    assert.deepEqual([roundsText(0), roundsText(1), roundsText(2), roundsText(3)], ['بلا جولات تعديل', 'جولة تعديل واحدة', 'جولتي تعديل', '3 جولات تعديل']);
  });

  test('company page: tabs per U10-S21 with «الباقة والتكاليف» (no invoices), A-only gates, the L-60 user copy and the purge sentence', () => {
    const src = read(`${APP}pages/admin/company-detail.js`);
    for (const t of ['نظرة عامة', 'الطلبات', 'المستخدمون', 'الكيانات والأطراف', 'الباقة والتكاليف', 'الذاكرة القانونية', 'الفريق المفضل', 'السجل']) assert.ok(src.includes(`label: '${t}'`), t);
    assert.ok(!/الباقة والفواتير|إنشاء مطالبة|تسجيل دفعة|invoice/.test(src.replace(/\/\/.*$/gm, '')), 'no invoice UI (L-31)');
    assert.match(src, /isAdmin \? \{ key: 'plan', label: 'الباقة والتكاليف'/);
    assert.match(src, /isAdmin \? \{ key: 'log', label: 'السجل'/);
    assert.equal(EMAIL_CHANGE_COPY, 'سيُرسل إشعار أمني إلى البريد القديم ويُسجَّل خروج المستخدم من كل الأجهزة.');
    assert.equal(PURGE_BACKUPS_COPY, 'تبقى نسخ من البيانات المحذوفة في النسخ الاحتياطية حتى تُستبدل.');
    assert.ok(src.includes("const ADMIN_ONLY = 'للمدير فقط';"));
    assert.match(src, /disabled: !isAdmin,\s*\n\s*hint: isAdmin \? EMAIL_CHANGE_COPY : `تغيير البريد: \$\{ADMIN_ONLY\}\.`/, 'T22: e-mail field disabled for a case manager');
    assert.match(src, /disabled: r === 'company_admin' && !canPromote/, 'T22: «مدير البوابة» disabled for a case manager');
    for (const t of ['رابط تعيين كلمة مرور', 'إلغاء التحقق بخطوتين', 'فك القفل', 'تسجيل الخروج من كل الأجهزة', 'الإيقاف يجعل البوابة للاطلاع فقط للشركة.', 'اكتب اسم العنصر للتأكيد', 'تصدير CSV', 'استبدال بمبلغ أقل', 'محظور التعامل', 'يُستخدم في ترتيب المحامين المقترحين. لا تراه الشركة ولا المحامون.']) assert.ok(src.includes(t), t);
    assert.match(src, /if \(isAdmin\) btns\.push\(button\('أمان الحساب'/);
    assert.match(src, /isAdmin \? button\('حذف نهائي'/);
    assert.match(src, /api\.del\(`\/admin\/company-memory\/\$\{it\.id\}\?purge=1`\)/);
    assert.match(src, /downloadFile\('\/admin\/company-charges\.csv', \{ cycle: cycle \|\| undefined, company_id: co\.id \}/);
    // L-55 (P0): the memory_pending confirmation uses the portal form with staff:true from the request page
    assert.match(src, /coMemoryForm\(it\.kind, values, \{ staff: true/);
    assert.match(read(`${APP}pages/admin/company-request.js`), /const \{ openMemoryItem \} = await import\('\.\/company-detail\.js'\);/);
    assert.ok(src.includes("'حفظ وتأكيد'"));
  });

  test('memory form values map column-backed fields (counterparty, entity, value, key-date) from the staff item view', () => {
    const it = { kind: 'key_date', title: 'تجديد السجل', start_date: '2026-12-15', counterparty: null, entity: { id: 3 }, value: null, data: { recurrence: 'yearly' }, remind_days: [14, 1], access: 'all' };
    const v = memoryValues(it, memoryFields('key_date'));
    assert.equal(v.date, '2026-12-15');
    assert.equal(v.recurrence, 'yearly');
    assert.equal(v.title, 'تجديد السجل');
    const c = memoryValues({ kind: 'contract', title: 'عقد', counterparty: { name: 'الدلتا' }, entity: { id: 1 }, value: 2400000, end_date: '2027-01-02', data: { renewal_type: 'auto', notice_days: 60 } }, memoryFields('contract'));
    assert.deepEqual([c.counterparty_name, c.entity_id, c.value, c.end_date, c.renewal_type, c.notice_days], ['الدلتا', 1, 2400000, '2027-01-02', 'auto', 60]);
  });

  test('settings «خدمة الشركات» and «باقات الشركات» are admin-only cards; e-mail card and «صادر البريد» use the exact copy', () => {
    const settings = read(`${APP}pages/admin/settings.js`);
    assert.match(settings, /me\.role === 'admin' \? b2bSettingsCard\(\) : null/);
    assert.match(settings, /me\.role === 'admin' \? companyPlansCard\(\) : null/);
    const b2b = read(`${APP}components/company-b2b-settings.js`);
    assert.equal(TERMS_URL_HINT, 'يظهر في صفحة قبول الدعوة. اتركه فارغًا إن لم تُعد الشروط بعد.');
    for (const t of ['رابط شروط الخدمة للشركات', 'مواعيد العمل لمستوى الخدمة', 'نفس مواعيد العمل العامة', 'مواعيد مختلفة للشركات', 'ساعات الطلبات العاجلة', 'المساحة المتاحة لكل شركة (ميجابايت)', 'تشغيل بوابة الشركات', 'باقات الشركات']) assert.ok(b2b.includes(t), t);
    assert.ok(!/b2b_invoice|b2b_tax_rate|auto_issue/.test(b2b), 'no invoice settings (L-31)');
    assert.match(b2b, /el\.id = 'b2b';/);
    assert.match(b2b, /el\.id = 'plans';/);
    assert.match(b2b, /api\.put\('\/admin\/b2b\/settings', body\)/);
    assert.deepEqual(WEEK.map((w) => w.d), [6, 0, 1, 2, 3, 4, 5]);
    assert.deepEqual(PROVIDERS.map((p) => p.label), ['بلا إرسال — صندوق صادر فقط', 'SMTP']);
    assert.deepEqual(SMTP_PORTS, ['25', '465', '587', '2525']);
    assert.deepEqual(SECURITY.map((p) => p.label), ['STARTTLS', 'TLS']);
    assert.match(OUTBOX_RED_NOTE, /توجد شركات مشتركة والبريد «صندوق صادر فقط»/);
    assert.deepEqual(Object.fromEntries(Object.entries(OUTBOX_STATUS).map(([k, v]) => [k, v.label])), { sent: 'أُرسل', queued: 'في الانتظار', sending: 'جارٍ الإرسال', failed: 'فشل', simulated: 'تجريبي', skipped: 'تُخطّي' });
    const email = read(`${APP}components/email-settings.js`);
    assert.ok(email.includes("'إرسال رسالة تجربة إلى بريدي'"));
    assert.match(email, /api\.post\('\/admin\/integrations\/email\/test', \{\}\)/);
    assert.match(read(`${APP}pages/admin/integrations.js`), /item\.name === 'email' \? emailSettingsCard\(item, data, \{ reload: load, companies \}\)/);
    assert.match(read(`${APP}pages/admin/automations.js`), /isAdmin \? \{ key: 'email', label: 'صادر البريد', icon: 'mail', render: \(\) => emailOutboxPanel\(\) \} : null/);
  });

  test('every new staff sheet with text fields asks before a gesture closes it (L-64; §9.3-10)', () => {
    for (const f of ['pages/admin/companies.js', 'pages/admin/company-detail.js', 'components/company-b2b-settings.js', ...TEXT_SHEETS.map((x) => `components/${x}`)]) {
      const src = read(`${APP}${f}`);
      const sheets = (src.match(/sheet: true/g) || []).length;
      const guards = (src.match(/beforeClose: discardGuard\(/g) || []).length;
      assert.ok(sheets > 0, f);
      assert.equal(guards, sheets, `${f}: ${guards} guards for ${sheets} sheets`);
    }
  });
});

describe('v10 b2b-staff — engine pages for company work (STF-10)', () => {
  const cd = read(`${APP}pages/admin/case-detail.js`);

  test('case page of a company case: banner, no WhatsApp/beneficiary/programme/client-answer/send-document controls (U10-S10, §9.3-4)', () => {
    assert.ok(cd.includes('ملف عمل لطلب شركة — ${company.name}${company.request ? ` · ${company.request.code}` : \'\'}. التواصل مع الشركة والتسليم من صفحة طلب الشركة.'));
    assert.match(cd, /function renderConversation\(\) \{\n[^\n]*\n\s*if \(company\) return card\(\{ title: 'المحادثة'/, 'conversation composer replaced');
    assert.match(cd, /if \(company\) return h\('div\.stack-lg', opinionGroups\(\), card\(\{ title: 'التسليم للشركة'/, 'client-answer composer replaced (opinion review stays)');
    assert.match(cd, /company \? null : \['برنامج التمويل', caseProgramField/);
    assert.match(cd, /company \? null : sendDocumentButton\(/);
    assert.match(cd, /!company && data\.satisfaction/);
    assert.match(cd, /const clientCard = company\s*\n\s*\? card\(\{\s*\n\s*title: 'الشركة'/, 'beneficiary card replaced');
    assert.match(cd, /if \(!company\) acts\.push\(button\('تسجيل رد المستفيد\/ة'/);
  });

  test('no generic «إغلاق الملف» / «إعادة فتح الملف» on a company case (L-65, §9.3-9)', () => {
    const m = /if \(company\) \{\n\s*return \[([\s\S]*?)\];\n\s*\}/.exec(cd);
    assert.ok(m, 'company branch in headerActions');
    assert.ok(!/openCloseDialog|openReopenDialog|openMessageDialog|إغلاق الملف|رسالة للمستفيد/.test(m[1]), m[1]);
    assert.ok(m[1].includes('تُغلق من صفحة طلب الشركة'));
    assert.match(cd, /if \(c\.status === 'answered' && !company\)/);
  });

  test('shadow client page, cases filter and dashboard strip', () => {
    const client = read(`${APP}pages/admin/client-detail.js`);
    assert.ok(client.includes('هذا حساب داخلي لشركة عميلة — ${co.name}'));
    assert.ok(client.includes("button('فتح صفحة الشركة'"));
    const cases = read(`${APP}pages/admin/cases.js`);
    // v11 segment-staff (intended, ST-4): «الأفراد · الشركات» صار مفتاح «الكل · خيري · أفراد · شركات» (شركات = line=b2b)،
    // وشارة «شركة» الرمادية صارت رقاقة النوع الخضراء بمبنى (L11-16)
    assert.match(cases, /caseSegmentSwitch\(/);
    assert.match(read(`${APP}components/segment-ui.js`), /\{ key: 'company', label: 'شركات', icon: 'building', query: \{ line: 'b2b' \} \}/);
    assert.match(cases, /line: state\.line \|\| undefined/);
    assert.match(cases, /segmentChip\('paid', \{ company: true \}\)/);
    const dash = read(`${APP}pages/admin/dashboard.js`).replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
    for (const t of ['بانتظار الفرز', 'يقترب موعدها', 'متأخرة', 'بانتظار الشركات', 'تجديدات خلال 30 يومًا', 'الاشتراكات الشهرية']) assert.ok(dash.includes(`label: '${t}'`), t);
    assert.ok(!dash.includes('مطالبات متأخرة'));
    assert.match(dash, /if \(!o \|\| !Number\(o\.companies\?\.total\)\) return;/, 'hidden without companies');
    assert.match(dash, /user\.role === 'admin' && o\.mrr_minor != null/);
  });
});

describe('v10 b2b-staff — lawyers and company work (STF-11)', () => {
  const LAWYER = `${APP}pages/lawyer/`;
  const lawyerFiles = fs.readdirSync(path.join(ROOT, LAWYER)).filter((f) => f.endsWith('.js'));
  // §4.7: the only keys of assignment.company a lawyer page may read
  const COMPANY_KEYS = new Set(['name', 'entity', 'request_type', 'request_type_label', 'priority', 'output_language', 'delivery_due_at', 'requires_senior_review', 'context']);
  const ITEM_KEYS = new Set(['id', 'kind', 'kind_label', 'title', 'summary', 'dates', 'data', 'documents']);

  test('«اليوم»: «شركة» chip after the case code, company name when granted, reviewer reads «مراجعة نهائية: …» with «راجِع» (U10-L01)', () => {
    const due = new Date(Date.now() + 3 * 3600e3).toISOString();
    const r = actionCopy({ kind: 'assignment_new', case_code: 'CIV-1', case_title: 'مطالبة', due_at: due, company: true, company_name: 'النيل', review: true });
    assert.equal(r.title, 'مراجعة نهائية: مطالبة');
    assert.deepEqual(r.button, { label: 'راجِع', kind: 'primary' });
    assert.deepEqual(r.sub.slice(0, 3), [{ code: 'CIV-1' }, { chip: 'شركة' }, 'النيل']);
    const lead = actionCopy({ kind: 'assignment_due_soon', case_code: 'CIV-1', case_title: 'مطالبة', due_at: due, company: true, company_name: null });
    assert.ok(lead.title.startsWith('سلّم رأيك '));
    assert.deepEqual(lead.sub.slice(0, 2), [{ code: 'CIV-1' }, { chip: 'شركة' }]);
    assert.match(lead.title, /\d:\d\d [صم]/, 'company deadlines always carry the hour');
    const b2c = actionCopy({ kind: 'assignment_new', case_code: 'CIV-1', case_title: 'مطالبة' });
    assert.ok(!b2c.sub.some((x) => x && x.chip));
    assert.deepEqual(companyParts({ company: false }), []);
    const home = read(`${LAWYER}home.js`);
    assert.match(home, /p\.chip\) out\.push\(h\('span\.lh-co-chip', p\.chip\)\)/);
    const list = read(`${LAWYER}assignments.js`);
    assert.ok(list.includes("'طلبات الشركات'"));
    assert.ok(list.includes("h('span.lh-co-chip', 'شركة')"));
  });

  test('lawyer pages read only the §4.7 company keys and never submitter, request code, company e-mails or phones (§9.3-5)', () => {
    for (const f of lawyerFiles) {
      const src = read(`${LAWYER}${f}`).replace(/\/\/.*$/gm, '');
      assert.ok(!/submitter|request_code|request\.code|company_user/.test(src), `${f}: forbidden key`);
      for (const m of src.matchAll(/(?:view|assignment|v|\bco)\.company\??\.(\w+)/g)) assert.ok(COMPANY_KEYS.has(m[1]), `${f}: view.company.${m[1]}`);
    }
    const asg = read(`${LAWYER}assignment.js`);
    const fn = /export function companyContextSection\(co[\s\S]*?\n\}\n/.exec(asg)[0];
    for (const m of fn.matchAll(/\bco\.(\w+)/g)) assert.ok(COMPANY_KEYS.has(m[1]), `co.${m[1]}`);
    for (const m of fn.matchAll(/\bm\.(\w+)/g)) assert.ok(ITEM_KEYS.has(m[1]), `m.${m[1]}`);
    assert.ok(!/email|phone|decided_by/.test(fn));
    assert.equal(COMPANY_NO_CONTEXT, 'لم تُشارك معك عناصر من ذاكرة الشركة.');
    assert.equal(SENIOR_REVIEW_LINE, 'يراجع عملك مراجع نهائي قبل تسليمه للشركة.');
    assert.ok(fn.includes("'سياق الشركة'") && fn.includes('من ذاكرة الشركة ('));
    // U10-L06: the company is asked, never a person
    assert.ok(asg.includes('سُئلت الشركة في ${shortDate(r.sent_at)}'));
    assert.ok(asg.includes("'يصل إلى الشركة عبر الإدارة'"));
  });

  test('no AI draft control on company assignments; company opinion labels and skeleton (L-29, L-58, §9.3-9)', () => {
    const w = read(`${LAWYER}write.js`);
    assert.match(w, /claude && !view\.company \? item\('مسودة أولية آلية'/);
    assert.ok(!/ai\/draft/.test(read(`${LAWYER}assignment.js`)), 'no draft call from the assignment page');
    assert.deepEqual(COMPANY_HEADINGS, ['الخلاصة التنفيذية', 'المخاطر الرئيسية ودرجتها', 'التوصيات', 'التحليل القانوني']);
    assert.equal(COMPANY_STEPS_LABEL, 'خطوات للشركة');
    assert.equal(COMPANY_WRITE_HINT, 'تصيغ الإدارة التسليم النهائي للشركة. لا تذكر اسمك داخل النص أو في الملفات.');
    const sk = companyOpinionSkeleton([{ number: 1, title: 'البند', status: 'active' }, { number: 2, title: 'مقترحة', status: 'proposed' }], 'contract_review').split('\n');
    assert.equal(sk[0], 'الخلاصة التنفيذية', 'the prefill reads this heading (L-58)');
    assert.ok(sk.includes('المسألة 1: البند') && !sk.includes('المسألة 2: مقترحة'));
    assert.equal(sk[sk.length - 1], 'التعديلات المقترحة على البنود');
    assert.ok(!companyOpinionSkeleton([], 'employment').includes('التعديلات المقترحة'));
    assert.equal(WORK_FILES_WARNING, 'احذف اسمك من خصائص ملف Word ومن أسماء التعديلات المتتبَّعة، أو أرفق PDF.');
    assert.equal(NAME_LATIN_HINT, 'يُستخدم للتأكد من عدم ظهور اسمك في ملفات الشركات وتسليماتها.');
  });
});

describe('v10 b2b-staff — build-2 contract with the server (demo seed)', () => {
  let t;
  let admin;
  let cm;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    cm = await t.login('manager');
  });
  after(async () => t && t.close());
  const has = (obj, keys, where) => {
    for (const k of keys) assert.ok(obj && Object.prototype.hasOwnProperty.call(obj, k), `${where}: ${k}`);
  };

  test('create a company with the custom terms the editor sends; prefix check; staff view and users for the company page', async () => {
    const pc = (p) => admin.get(`/api/admin/companies/prefix-check?prefix=${p}`).then((r) => r.body.reason);
    assert.deepEqual(await Promise.all(['KR', 'NFD', 'A1', 'DLT'].map(pc)), ['reserved', 'taken', 'invalid', null]);
    const staff = (await cm.get('/api/admin/staff')).body;
    const terms = { ...TERMS_BLANK, price_minor: 1200000, overage_price_minor: 200000 };
    const res = await admin.post('/api/admin/companies', {
      name: 'شركة الدلتا للتجارة',
      prefix: 'DLT',
      status: 'trial',
      trial_days: 14,
      renews: 'auto',
      account_manager_id: staff.find((x) => x.role === 'case_manager').id,
      entity: {},
      first_admin: { name: 'سامي فؤاد', email: 'sami@delta-trade.example', billing_contact: true },
      terms,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    has(res.body, ['company', 'subscription', 'invite', 'conflicts'], 'create');
    has(res.body.invite, ['url', 'expires_at', 'emailed'], 'invite');
    assert.equal(res.body.subscription.terms.urgent_per_month, 1);
    const id = res.body.company.id;
    const cmCreate = await cm.post('/api/admin/companies', { name: 'x', prefix: 'XYZ' });
    assert.equal(cmCreate.status, 403, 'create is admin only');
    const v = (await cm.get(`/api/admin/companies/${id}`)).body;
    has(v.company, ['id', 'code', 'prefix', 'prefix_locked', 'name', 'status', 'status_label', 'read_only', 'settings', 'notes_internal', 'account_manager', 'client_id', 'email_enabled', 'trial_ends_at'], 'staff company');
    has(v, ['subscription', 'entities', 'users', 'quota', 'requests', 'memory', 'conflicts'], 'staff view');
    const users = (await cm.get(`/api/admin/companies/${id}/users`)).body.items;
    has(users[0], ['id', 'name', 'email', 'phone', 'job_title', 'role', 'role_label', 'billing_contact', 'active', 'state', 'state_label', 'two_factor', 'last_login_at', 'locked_until'], 'user row');
    // T22 / L-60: a case manager cannot change an e-mail or promote to «مدير البوابة»
    const nfdUsers = (await cm.get('/api/admin/companies/1/users')).body.items;
    const member = nfdUsers.find((u) => u.role === 'member');
    assert.equal((await cm.patch(`/api/admin/company-users/${member.id}`, { email: 'x@nilefoods.example' })).status, 403);
    assert.equal((await cm.patch(`/api/admin/company-users/${member.id}`, { role: 'company_admin' })).status, 403);
    // list rows the companies page reads
    const list = (await cm.get('/api/admin/companies')).body.items;
    for (const c of list) has(c, ['id', 'prefix', 'name', 'status', 'status_label', 'plan_name', 'account_manager', 'users', 'open_requests', 'awaiting_company', 'at_risk', 'late', 'renewals_30d', 'trial_ends_at'], 'list row');
  });

  test('plan & costs, memory, b2b settings, e-mail outbox and integrations shapes; CSV export link', async () => {
    const u = (await admin.get('/api/admin/companies/1/usage')).body;
    has(u.usage, ['cycles', 'requests', 'sla', 'satisfaction', 'upcoming_renewals'], 'usage');
    has(u.usage.sla, ['first_response_met_rate', 'delivery_met_rate'], 'usage.sla');
    const ch = (await admin.get(`/api/admin/companies/1/charges?cycle=${u.usage.cycles[1].start}`)).body;
    has(ch, ['items', 'total_unvoided'], 'charges');
    for (const x of ch.items) has(x, ['id', 'kind_label', 'description', 'amount', 'amount_text', 'request_id', 'request_code', 'quote_number', 'quote_basis', 'cap', 'voided', 'void_reason', 'replaces_charge_id', 'created_at'], 'charge');
    const csv = await admin.post('/api/admin/company-charges.csv', { cycle: u.usage.cycles[1].start, company_id: 1 });
    assert.equal(csv.status, 200);
    assert.match(csv.body.url, /^\/api\//);
    const mem = (await cm.get('/api/admin/companies/1/memory')).body;
    has(mem, ['items', 'under_review'], 'memory');
    const item = (await cm.get(`/api/admin/company-memory/${mem.items[0].id}`)).body;
    has(item, ['item', 'documents', 'requests', 'reminders', 'grants'], 'memory item');
    has(item.item, ['staff_notes', 'access', 'status', 'under_review', 'remind_days', 'data', 'created_by', 'reviewed_at', 'source_request', 'grantable', 'archived'], 'memory item.item');
    const st = (await admin.get('/api/admin/b2b/settings')).body;
    has(st, ['values', 'office_hours_schedule'], 'b2b settings');
    const { values } = st;
    const body = { ...values, b2b_business_hours: { days: [6, 0, 1, 2, 3, 4], from: '09:00', to: '17:00' }, b2b_terms_url: 'https://example.com/terms' };
    delete body.company_remember_days;
    delete body.company_remember_days_2fa;
    const put = await admin.put('/api/admin/b2b/settings', body);
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.values.b2b_terms_url, 'https://example.com/terms');
    assert.equal((await admin.put('/api/admin/b2b/settings', { ...body, b2b_business_hours: null })).body.values.b2b_business_hours, null);
    assert.equal((await cm.get('/api/admin/b2b/settings')).status, 403);
    const ob = (await admin.get('/api/admin/email-outbox?limit=5')).body;
    has(ob, ['provider', 'counts', 'items'], 'outbox');
    for (const m of ob.items) has(m, ['to_address', 'purpose_label', 'status', 'error', 'attempts', 'created_at'], 'outbox row');
    const integ = (await admin.get('/api/admin/integrations')).body;
    const email = integ.items.find((x) => x.name === 'email');
    assert.deepEqual(email.fields.map((f) => f.key), ['provider', 'smtp_host', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password', 'from_address', 'from_name']);
    has(integ, ['public_base_url'], 'integrations');
    const plans = (await admin.get('/api/admin/company-plans')).body.items;
    has(plans[0], ['id', 'key', 'name', 'description', 'active', 'terms', 'companies'], 'plan');
  });

  test('engine pages and lawyer: case company block, cases line filter, shadow client, lawyer profile fields and the lawyer view whitelist', async () => {
    const cases = (await cm.get('/api/admin/cases?line=b2b')).body.items;
    assert.ok(cases.length && cases.every((c) => c.company_id && c.company_name));
    const b2c = (await cm.get('/api/admin/cases?line=b2c')).body.items;
    assert.ok(b2c.every((c) => !c.company_id));
    const cd = (await cm.get(`/api/admin/cases/${cases[0].id}`)).body;
    has(cd.company, ['id', 'name', 'request'], 'case.company');
    has(cd.company.request, ['id', 'code', 'status_label'], 'case.company.request');
    const shadow = (await cm.get(`/api/admin/clients/${cd.case.client_id}`)).body;
    has(shadow.company, ['id', 'name'], 'shadow client');
    const tarekRow = (await admin.get('/api/admin/lawyers')).body.items.find((l) => l.username === 'tarek');
    const pl = await admin.patch(`/api/admin/lawyers/${tarekRow.id}`, { name_latin: 'Tarek El-Naggar', skills: ['contracts'], b2b_rate: 1500 });
    assert.equal(pl.status, 200, JSON.stringify(pl.body));
    const lv = (await admin.get(`/api/admin/lawyers/${tarekRow.id}`)).body;
    const lawyer = lv.lawyer || lv;
    assert.equal(lawyer.name_latin, 'Tarek El-Naggar');
    assert.deepEqual(lawyer.skills, ['contracts']);
    assert.equal(lawyer.b2b_rate, 1500);
    // lawyer view whitelist (§4.7) with a granted position and contract (T17 set-up)
    const tarek = await t.login('tarek');
    const today = (await tarek.get('/api/lawyer/today')).body;
    const act = today.actions.find((a) => a.company);
    has(act, ['company', 'company_name', 'review', 'case_code', 'case_title', 'assignment_id'], 'today action');
    const asgs = (await cm.get(`/api/admin/company-requests/${cd.company.request.id}`)).body.case.team;
    const mine = asgs.find((a) => a.lawyer_name && a.lawyer_id === tarekRow.id) || asgs[0];
    const memItems = (await cm.get(`/api/admin/companies/${cd.company.id}/memory`)).body.items;
    const ids = memItems.filter((m) => ['position', 'contract'].includes(m.kind)).map((m) => m.id);
    assert.equal((await cm.put(`/api/admin/assignments/${mine.assignment_id}/memory-grants`, { memory_ids: ids })).status, 200);
    const who = mine.lawyer_id === tarekRow.id ? tarek : await t.login((await admin.get(`/api/admin/lawyers/${mine.lawyer_id}`)).body.lawyer?.username || 'tarek');
    const view = (await who.get(`/api/lawyer/assignments/${mine.assignment_id}`)).body;
    for (const k of Object.keys(view.company)) assert.ok(['name', 'entity', 'request_type', 'request_type_label', 'priority', 'priority_label', 'output_language', 'delivery_due_at', 'requires_senior_review', 'context'].includes(k), `company.${k}`);
    assert.ok(view.company.context.length >= 1, 'granted memory reaches the lawyer');
    for (const m of view.company.context) {
      for (const k of Object.keys(m)) assert.ok(['id', 'kind', 'kind_label', 'title', 'summary', 'dates', 'data', 'documents'].includes(k), `context.${k}`);
      for (const k of Object.keys(m.data || {})) assert.ok(memoryKindByKey(m.kind).lawyer_fields.includes(k), `${m.kind}.data.${k}`);
    }
    const txt = JSON.stringify(view);
    for (const u of (await cm.get(`/api/admin/companies/${cd.company.id}/users`)).body.items) {
      assert.ok(!txt.includes(u.email), 'no company e-mail');
      assert.ok(!txt.includes(u.name), `no company user name (${u.name})`);
    }
    assert.ok(!txt.includes(cd.company.request.code), 'no request code');
  });
});

// ───────────────────────── مراجعة b2b-staff: اختبار انحدار لكل خلل وُجد ─────────────────────────

describe('v10 b2b-staff review — regressions', () => {
  test('F1 accept sheet: employee first names are caught on Arabic word boundaries and removed as whole words only', () => {
    const people = [{ name: 'حسام الدين فوزي', email: 'hossam@nilefoods.example', phone: '+201001234567' }, { name: 'مريم عادل' }, { name: 'محمد علي' }];
    const text = 'يمكن التواصل مع مريم أو حسام. أرسل لي حسام الدين فوزي المسودة على hossam@nilefoods.example. ومريمة ليست اسمًا. الحسامي كلمة. محمد يحضر.';
    const hits = companyPeopleIn(text, people);
    assert.deepEqual(hits, ['hossam@nilefoods.example', 'حسام الدين فوزي', 'حسام', 'مريم']);
    const clean = removeCompanyPeople(text, hits);
    for (const x of ['مريم أو', 'حسام.', 'حسام الدين', 'hossam@']) assert.ok(!clean.includes(x), x);
    assert.ok(clean.includes('ومريمة ليست اسمًا') && clean.includes('الحسامي كلمة') && clean.includes('محمد يحضر'), 'other words untouched');
    assert.ok(clean.includes('[بريد إلكتروني]') && clean.includes('موظف في الشركة'));
    // tolerant spelling ة/ه and أ/ا like the server redactor
    assert.deepEqual(companyPeopleIn('أرسلت أسامه الملف', [{ name: 'أسامة حلمي' }]), ['أسامه']);
  });

  test('F2 memory grants: the saved grants of an assignment are kept for the session and reopen the sheet with them', () => {
    savedGrants.clear();
    assert.equal(grantsOf({ assignment_id: 25 }), undefined);
    savedGrants.set(25, [1, 2]);
    assert.deepEqual(grantsOf({ assignment_id: 25 }), [1, 2]);
    assert.deepEqual(grantsOf({ assignment_id: 25, memory_ids: [7] }), [7], 'server value wins when present');
    savedGrants.clear();
    const src = read(`${APP}pages/admin/company-request.js`);
    assert.match(src, /assignment: \{ \.\.\.a, memory_ids: grantsOf\(a\) \}/);
    assert.match(src, /savedGrants\.set\(a\.assignment_id, saved\.memory_ids\)/);
  });

  test('F3 company case page: no impact card and no beneficiary wording in the info-request flow', () => {
    const src = read(`${APP}pages/admin/case-detail.js`);
    assert.match(src, /company \? null : outcomeCard\(/);
    assert.match(src, /const WHO = company \? 'الشركة' : 'المستفيد\/ة'/);
    for (const t of ['أُرسل للشركة — بانتظار ردها', 'ردّت الشركة — بانتظار مراجعة الإدارة', ' اطلبه من الشركة بـ«سؤال للشركة» في صفحة طلب الشركة.']) assert.ok(src.includes(t), t);
    for (const t of ["'موافقة الإدارة والإرسال للمستفيد/ة', 'رد المستفيد/ة'", "textBlock('رد المستفيد/ة', r.client_reply", "textBlock('الرسالة التي أُرسلت للمستفيد/ة'", "subtitle: 'كل طلب يمر بالإدارة قبل أن يصل للمستفيد/ة"]) assert.ok(!src.includes(t), `still fixed to the beneficiary: ${t}`);
  });

  test('F4 phone tap targets: segmented buttons, filters, chips and check rows of the company desk are ≥ 44px', () => {
    const css = read('public/assets/css/v10-desk.css');
    const block = css.slice(css.indexOf('b2b-staff review: أهداف اللمس'));
    assert.match(block, /@media \(max-width: 640px\), \(pointer: coarse\)/);
    for (const sel of ['.cq-page .seg', '.cr-page .seg', '.cs-sheet .seg', '.cq-page .filter-bar .input', '.cr-page .input:not(textarea)', '.cs-sheet .chip-toggle', '.cs-sheet label.check', "[id='b2b'] label.check", "[id='plans'] .input:not(textarea)", '.es-card .input:not(textarea)']) assert.ok(block.includes(sel), sel);
    assert.match(block, /min-height: 44px/);
  });

  test('F13 sharing a company reply never creates the automatic follow-up (it never reaches the portal): request_rest false', () => {
    const cd = read(`${APP}pages/admin/case-detail.js`);
    assert.match(cd, /\(r\.items_needed \|\| \[\]\)\.length > 0 && !company && \{ name: 'request_rest'/);
    assert.match(cd, /request_rest: \(r\.items_needed \|\| \[\]\)\.length \? \(company \? false : !!v\.request_rest\) : undefined/);
    const q = read(`${APP}pages/admin/queue.js`);
    assert.match(q, /\.\.\.\(r\.company_request \? \{ request_rest: false \} : \{\}\)/);
  });

  test('F12 tall company sheets on phones: grip, header and footer never shrink (the title was clipped above the sheet edge)', () => {
    const css = read('public/assets/css/v10-desk.css');
    assert.match(css, /\.cs-sheet > \.modal-grip,\s*\.cs-sheet > \.modal-header,\s*\.cs-sheet > \.modal-footer \{ flex-shrink: 0; \}/);
    assert.match(css, /\.cs-sheet > \.modal-body \{ min-height: 0; \}/);
  });

  test('F5 companies list fits 1366: the trial end sits under the status, no separate column', () => {
    const src = read(`${APP}pages/admin/companies.js`);
    assert.ok(!src.includes("label: 'تنتهي التجربة'"), 'no trial column');
    assert.match(src, /'انتهت التجربة' : 'تنتهي التجربة'/);
  });

  test('F6 SLA chip: the urgent (calendar) clock reads «س», business hours read «س عمل»', () => {
    assert.equal(clockOf({ priority: 'urgent', sla: { state: 'on_track' } }), 'calendar');
    assert.equal(clockOf({ priority: 'normal', sla: { clock: 'calendar' } }), 'calendar');
    assert.equal(clockOf({ priority: 'high', sla: {} }), 'business');
    const src = read(`${APP}pages/admin/company-requests.js`);
    assert.match(src, /const unit = \(sla\.clock \|\| clock\) === 'calendar' \? ' س' : ' س عمل';/);
    assert.ok(!/n\(left\), ' س عمل'\]/.test(src), 'no hard-coded business unit');
  });

  test('F7–F11: focus applied once, decline from quota_blocked, admin calendar preview, quota agreement, clarify dirty-check', () => {
    const page = read(`${APP}pages/admin/company-request.js`);
    assert.match(page, /const focus = focused \? null : ctx\.query\.focus;/);
    assert.match(page, /onDecline: \(\) => decline\(\)/);
    const accept = read(`${APP}components/company-accept-sheet.js`);
    assert.match(accept, /finished\.decline && onDecline/);
    assert.match(accept, /isAdmin \? api\.get\('\/admin\/b2b\/settings'/);
    assert.match(accept, /calendars\(b2b && b2b\.values \?/);
    assert.equal(pendingPhrase(1), 'طلب واحد');
    assert.equal(pendingPhrase(2), 'طلبان');
    assert.equal(pendingPhrase(4), '4 طلبات');
    assert.equal(pendingPhrase(12), '12 طلبًا');
    assert.match(page, /\(و\$\{pendingPhrase\(q\.pending\)\} بانتظار الاحتساب\)/);
    const clar = read(`${APP}components/company-clarify-sheet.js`);
    assert.match(clar, /const initialItems = cleanItems\(\)\.join\('\\n'\);/);
  });
});
