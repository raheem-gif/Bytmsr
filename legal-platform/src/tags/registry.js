// v12 tags-core (TG-0/TG-2، T12-50…T12-61، L12-43، L12-82): سجل رموز العناصر على الخادم وحده.
// هنا فقط مسارات الملفات لكل بادئة (لا تصل إلى أي صفحة عامة)، والتحقق (الصيغة، التفرّد، المكان، النطاقات المحجوزة،
// الرموز المتقاعدة)، والترقيم التالي، وبناء السجل وTAGS.md. يقرؤه scripts/tags.js والاختبارات ونقطة /api/admin/tags (مسار tags).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, scanSources, cleanText } from './scan.js';
import { PAGES, SURFACES, FORBIDDEN_PREFIXES, CODE_RE, compareCodes, normalizeCode } from '../../public/assets/js/lib/tags-pages-app.js';
import { PAGES as PUBLIC_PAGES, foldAr } from '../../public/assets/js/lib/tags-pages.js';

export { PAGES, SURFACES, FORBIDDEN_PREFIXES, CODE_RE, compareCodes, normalizeCode, PUBLIC_PAGES };

export const LEDGER_FILE = 'src/tags/ledger.json';
export const TAGS_MD = 'TAGS.md';

const JS = 'public/assets/js';
const PUB = `${JS}/public`;
const APP = `${JS}/app`;
const ADM = `${APP}/pages/admin`;
const LAW = `${APP}/pages/lawyer`;
const CMP = `${APP}/components`;
const CO = `${JS}/company`;
const LIB = `${JS}/lib`;

/**
 * الملفات التي يجوز أن تعرّف رموز كل بادئة (T12-03، T12-72 «المكان»). ملف قد يخدم أكثر من بادئة
 * (src/site.js: H وF وS وL وNF وKH). ملف جديد لشاشة قائمة = سطر هنا؛ شاشة جديدة = بادئة في tags-pages*.js + سطر هنا.
 */
export const FILES = Object.freeze({
  // الموقع
  L: ['public/entry.html', 'src/site.js', `${PUB}/entry.js`, `${PUB}/landing.js`, `${PUB}/listen.js`, 'public/intake.html', `${PUB}/intake.js`],
  T: [`${PUB}/entry-tree.js`],
  S: ['public/services.html', 'src/site.js', 'src/site-copy-paid.js'],
  H: ['src/site.js', 'src/site-copy-paid.js'],
  F: ['src/site.js', 'src/site-copy-paid.js'],
  KH: ['public/khayri-paused.html', 'src/site.js', 'public/index.html', `${PUB}/segment.js`],
  AB: ['public/about.html'],
  PV: ['public/privacy.html', 'src/services/media.js', 'src/site.js'],
  TM: ['public/terms.html'],
  DD: ['public/data-deletion.html', 'src/services/media.js'],
  NF: ['public/404.html', 'src/site.js'],
  SU: ['public/setup.html', `${PUB}/setup.js`],
  // الطلب والمتابعة
  I: [`${PUB}/intake.js`, 'public/intake.html', `${PUB}/drafts.js`, `${PUB}/saved.js`, `${PUB}/topics.js`, `${PUB}/words.js`, `${PUB}/common.js`, `${PUB}/entry-tree.js`, 'src/site.js', 'src/site-copy-paid.js'],
  IC: [`${PUB}/intake-company.js`, 'public/intake.html', 'src/site.js', 'src/site-copy-paid.js'],
  UP: [`${PUB}/upload.js`],
  SC: [`${LIB}/scan-sheet.js`, `${LIB}/scanner.js`],
  RV: [`${PUB}/recorder.js`],
  P: ['public/portal.html', `${PUB}/portal.js`, `${PUB}/portal-ui.js`, 'src/site.js'],
  PL: ['public/portal-login.html', `${PUB}/portal-login.js`, 'src/site.js'],
  // بوابة الشركات
  CC: [`${CO}/shell.js`, `${CO}/main.js`, `${CO}/common.js`, `${CO}/routes.js`, `${CO}/pages/more.js`],
  CS: [`${CO}/pages/login.js`, `${CO}/pages/link.js`, `${CO}/pages/gate.js`],
  CW: [`${CO}/pages/welcome.js`],
  CH: [`${CO}/pages/overview.js`],
  CR: [`${CO}/pages/requests.js`],
  CN: [`${CO}/pages/new-request.js`],
  CK: [`${LIB}/company-catalog.js`, `${LIB}/company-catalog-fields.js`, `${LIB}/company-forms.js`],
  CQ: [`${CO}/pages/request.js`],
  CU: [`${LIB}/company-ui.js`, `${LIB}/company-ui-core.js`, `${CO}/page-kit.js`],
  CM: [`${CO}/pages/memory.js`, `${CO}/pages/memory-list.js`],
  CD: [`${CO}/pages/calendar.js`],
  CG: [`${CO}/pages/entities.js`],
  CX: [`${CO}/pages/counterparties.js`],
  CI: [`${CO}/pages/memory-item.js`],
  CE: [`${CO}/pages/memory-edit.js`],
  CT: [`${CO}/pages/team.js`],
  CP: [`${CO}/pages/plan.js`],
  CF: [`${CO}/pages/company.js`],
  CA: [`${CO}/pages/account.js`],
  CB: [`${CO}/pages/notifications.js`],
  // المنصة
  NAV: [`${APP}/shell.js`, `${APP}/lawyer-shell.js`, `${APP}/notif.js`, `${APP}/router.js`, `${APP}/main.js`],
  LGN: [`${APP}/pages/login.js`, `${APP}/pages/auth-flows.js`, `${APP}/lh-reauth.js`, `${APP}/main.js`],
  KIT: [`${LIB}/ui.js`],
  SRC: [`${CMP}/search.js`],
  DSH: [`${ADM}/dashboard.js`],
  INB: [`${ADM}/inbox.js`],
  RQT: [`${ADM}/intake-detail.js`],
  PTH: [`${CMP}/pathway-ui.js`, `${ADM}/inbox.js`, `${ADM}/intake-detail.js`],
  STY: [`${CMP}/story-sheet.js`, `${CMP}/story-settings.js`],
  CNT: [`${CMP}/call-note.js`],
  SPL: [`${CMP}/split-dialog.js`],
  SEG: [`${CMP}/segment-ui.js`],
  QUE: [`${ADM}/queue.js`],
  CSL: [`${ADM}/cases.js`],
  CSF: [`${ADM}/case-detail.js`],
  PTY: [`${CMP}/parties.js`],
  MTL: [`${ADM}/matters.js`],
  MTF: [`${ADM}/matter-detail.js`],
  OUT: [`${CMP}/outcome-sheet.js`, `${CMP}/outcome.js`],
  CLI: [`${ADM}/clients.js`],
  CLF: [`${ADM}/client-detail.js`, `${CMP}/beneficiary.js`],
  LWL: [`${ADM}/lawyers.js`],
  LWF: [`${ADM}/lawyer-detail.js`],
  ACC: [`${ADM}/accounting.js`],
  AUT: [`${ADM}/automations.js`, `${CMP}/outbox.js`],
  QRP: [`${ADM}/quick-replies.js`, `${CMP}/quick-replies.js`],
  KNL: [`${ADM}/knowledge.js`, `${CMP}/ai-usage.js`],
  KNF: [`${ADM}/knowledge-detail.js`],
  AIR: [`${CMP}/ai-reply.js`],
  DAI: [`${CMP}/doc-ai.js`],
  DOC: [`${CMP}/doc-viewer.js`, `${CMP}/send-document.js`, `${CMP}/doc-clean.js`],
  VTR: [`${CMP}/voice-transcript.js`],
  ANL: [`${ADM}/analytics.js`],
  SIM: [`${ADM}/simulator.js`],
  SET: [`${ADM}/settings.js`, `${CMP}/site-settings.js`, `${CMP}/story-settings.js`, `${CMP}/brand-settings.js`, `${CMP}/email-settings.js`, `${CMP}/company-b2b-settings.js`, `${CMP}/company-plan-terms.js`, `${CMP}/account-admin.js`, `${CMP}/media-settings.js`],
  INT: [`${ADM}/integrations.js`],
  SYS: [`${ADM}/system.js`],
  AUD: [`${ADM}/audit.js`],
  DAT: [`${ADM}/data.js`],
  CAL: [`${ADM}/calendar.js`],
  IMP: [`${ADM}/impact.js`],
  CNF: [`${ADM}/conflicts.js`],
  PRG: [`${ADM}/programs.js`, `${CMP}/program-picker.js`],
  CRL: [`${ADM}/company-requests.js`],
  CRF: [`${ADM}/company-request.js`, `${CMP}/company-accept-sheet.js`, `${CMP}/company-clarify-sheet.js`, `${CMP}/company-quote-sheet.js`, `${CMP}/company-deliverable-sheet.js`, `${CMP}/company-memory-grants.js`],
  COL: [`${ADM}/companies.js`],
  COF: [`${ADM}/company-detail.js`],
  NTF: [`${APP}/pages/notifications.js`],
  PRF: [`${APP}/pages/account.js`, `${CMP}/two-factor.js`, `${CMP}/password.js`, `${CMP}/qr.js`],
  TGS: [`${ADM}/tags.js`],
  RSH: [`${CMP}/request-sheet.js`],
  DRF: [`${CMP}/draft-store.js`, `${CMP}/text-diff.js`],
  TDY: [`${LAW}/home.js`],
  ASL: [`${LAW}/assignments.js`],
  ASG: [`${LAW}/assignment.js`],
  WRT: [`${LAW}/write.js`],
  LMT: [`${LAW}/matters.js`],
  LMF: [`${LAW}/matter.js`],
  STM: [`${LAW}/statement.js`],
  LCA: [`${LAW}/calendar.js`],
  // الرسائل والمطبوعات
  W: ['src/constants.js', 'src/services/lawyer-alerts.js'],
  E: ['src/services/email.js'],
  D: [`${APP}/pages/print.js`, `${CMP}/print-button.js`],
  B: [`${APP}/notif.js`],
});

/** ملفات 12.0 الجديدة التي تكتبها المسارات الآن: غيابها مسموح حتى تجميد السجل */
export const PLANNED_FILES = Object.freeze(
  new Set([
    'public/entry.html',
    'public/khayri-paused.html',
    `${PUB}/entry-tree.js`,
    `${PUB}/entry.js`,
    `${LIB}/scan-sheet.js`,
    `${LIB}/scanner.js`,
    'src/services/media.js',
    `${CMP}/pathway-ui.js`,
    `${CMP}/doc-clean.js`,
    `${CMP}/media-settings.js`,
    `${ADM}/tags.js`,
  ]),
);

/**
 * ملفات كل مسار (ملكيته في §6.1 مع ملفات مقاطعه المسموحة في §6.2): رمز داخل نطاق محجوز لمسار (ledger.json)
 * يجب أن يُعرَّف في ملفات ذلك المسار (spec §11.2).
 */
export const LANE_FILES = Object.freeze({
  entry: [
    `${PUB}/entry-tree.js`, `${PUB}/entry.js`, 'public/entry.html', 'public/khayri-paused.html', 'src/services/pathways.js', 'src/seed-v12-entry.js',
    'src/site.js', 'src/site-copy-paid.js', 'src/site-assets.js', 'src/routes/public.js', 'src/seed.js',
    'public/index.html', 'public/services.html', 'public/intake.html', 'public/portal.html', 'public/portal-login.html', 'public/404.html', 'public/about.html', 'public/privacy.html', 'public/terms.html', 'public/data-deletion.html',
    `${PUB}/landing.js`, `${PUB}/intake.js`, `${PUB}/intake-company.js`, `${PUB}/drafts.js`, `${PUB}/saved.js`, `${PUB}/menu.js`, `${PUB}/common.js`, `${PUB}/segment.js`, `${PUB}/words.js`, `${PUB}/portal-ui.js`, `${PUB}/portal-login.js`,
    // مقاطع H-E1…H-E3
    'src/app.js', `${PUB}/portal.js`, 'src/constants.js',
  ],
  'staff-lines': [
    'src/constants.js', 'src/services/segments.js', 'src/services/intakes.js', 'src/services/stories.js', 'src/services/analytics.js', 'src/channels/engine.js', 'src/routes/admin.js', 'src/seed-v12-lines.js',
    `${ADM}/inbox.js`, `${ADM}/intake-detail.js`, `${ADM}/dashboard.js`, `${ADM}/analytics.js`, `${ADM}/simulator.js`, `${ADM}/settings.js`,
    `${CMP}/site-settings.js`, `${CMP}/story-settings.js`, `${CMP}/segment-ui.js`, `${CMP}/pathway-ui.js`, `${APP}/labels.js`, `${APP}/words.js`,
    // مقطع H-E4
    'src/seed.js',
  ],
  media: [
    `${LIB}/scan-core.js`, `${LIB}/scanner.js`, `${LIB}/scan-worker.js`, `${LIB}/scan-sheet.js`, 'src/ai/stt.js', 'src/services/media.js', 'src/media-tools.js', 'src/media-child.js', 'src/routes/media.js', 'src/seed-v12-media.js',
    `${CMP}/doc-clean.js`, `${CMP}/media-settings.js`, 'src/services/documents.js', 'src/services/voice.js', 'src/services/integrations.js', 'src/services/portal-v91.js', 'src/http.js', 'src/app.js', 'src/ai/anthropic.js', 'src/ai/index.js',
    `${PUB}/upload.js`, `${PUB}/portal.js`, `${LIB}/company-forms.js`, `${LIB}/ui.js`, `${CMP}/voice-transcript.js`, `${CMP}/doc-viewer.js`, `${CMP}/search.js`, `${ADM}/integrations.js`, `${ADM}/system.js`,
    // مقاطع H-M1…H-M13
    'src/constants.js', 'src/routes/public.js', 'src/routes/admin.js', `${ADM}/settings.js`, 'src/site-assets.js', 'src/services/company-requests.js', 'src/services/practice.js', `${APP}/labels.js`, 'src/services/system.js', 'src/site.js', 'src/services/company-doc-gate.js',
  ],
  look: [`${APP}/shell.js`, `${APP}/lawyer-shell.js`, `${CO}/shell.js`, `${CO}/words.js`, `${CO}/words-pages.js`, `${CO}/words-flows.js`, 'public/app.html', 'public/company.html', 'public/setup.html'],
});

/**
 * L12-82: نص واحد في مصدر واحد تقرؤه عدة عناصر برموزها. السجل وTAGS.md يكتبان عند كل رمز «يظهر النص نفسه أيضًا في: …».
 * line = مفتاح في LINES (entry-tree.js)؛ where = أين يظهر النص داخل العنصر.
 */
export const SHARED_TEXT = Object.freeze([
  {
    source: 'LINES.consultation',
    line: 'consultation',
    fallback: 'استشارة',
    codes: [['T-02', ''], ['S-12', ''], ['W-01', 'الزر الأول'], ['I-57', 'الخيار الأول'], ['PTH-01', '']],
  },
  {
    source: 'LINES.litigation',
    line: 'litigation',
    fallback: 'رفع دعوى قضائية',
    codes: [['T-40', ''], ['S-13', ''], ['W-01', 'الزر الثاني'], ['I-57', 'الخيار الثاني'], ['PTH-01', '']],
  },
  {
    source: 'LINES.company',
    line: 'company',
    fallback: 'تأسيس شركات',
    codes: [['T-53', ''], ['S-14', ''], ['W-01', 'الزر الثالث'], ['I-57', 'الخيار الثالث'], ['PTH-01', '']],
  },
]);

/**
 * L12-82: نصوص تأتي من الإعدادات، فتعديلها من بطاقة لا من الكود: «يُعدَّل من الإعدادات ← {card}».
 * المسارات تضيف ما يخصها بتعليق «@tag-setting X-NN البطاقة» فوق الكود (يقرؤه الماسح) أو هنا.
 */
export const SETTINGS_SOURCES = Object.freeze({
  'F-20': 'الصفحة الأولى ← الاسم القانوني للمكتب',
  'F-02': 'الصفحة الأولى ← عن المكتب (المدينة)',
  'S-45': 'الصفحة الأولى ← عن المكتب',
  'S-46': 'الصفحة الأولى ← عن المكتب',
  'S-47': 'الصفحة الأولى ← عن المكتب',
  'W-01': 'الصفحة الأولى ← الاسم القانوني للمكتب',
  'KH-02': 'التكاملات ← رقم واتساب «خيري»',
});

/**
 * v12 tags (TG-7، T12-94، T12-76، T12-22): فرض التغطية. مفتاح واحد: TAGS_ENFORCE = '1' منذ TG-7، ويبقى دائمًا بعد
 * `npm run tags -- freeze` (الدفتر المجمَّد يفرضها مهما كان المتغير). TAGS_ENFORCE=0 في البيئة يعيد وضع التقرير قبل التجميد.
 */
export const TAGS_ENFORCE = '1';
export const enforceCoverage = (ledger, env = process.env) => Boolean(ledger?.frozen) || String(env.TAGS_ENFORCE ?? TAGS_ENFORCE) === '1';

/**
 * عناصر أساسية بلا رمز عن قصد (تُذكر في تقرير البوابة «محجوزة، بلا رمز عن قصد»): شاشات «خيري» المؤرشفة تبقى بصيغة 11.0
 * وبصمتها (T12-22، T12-76؛ KH-05… محجوزة لـ 12.1)، والمسجّل المؤرشف (RV). max = أقصى عدد في الملف، null = الملف كله.
 * أي عنصر بلا رمز خارج هذه القائمة يُفشل `npm run tags -- --check` وtest/v12-tags.test.js ما دام الفرض قائمًا.
 */
export const UNTAGGED_BY_DESIGN = Object.freeze({
  'public/about.html': { max: null, why: 'صفحة «عن البرنامج» لـ«خيري» وحده (تُعرض فقط حين يُعاد «خيري»)' },
  'public/index.html': { max: null, why: 'صفحة «خيري» الرئيسية /khayri (تُعرض فقط حين يُعاد «خيري»)' },
  'public/assets/js/public/recorder.js': { max: null, why: 'مسجّل الصوت على الموقع مؤرشف (RV، لا يظهر في 12.0)' },
  'public/intake.html': { max: 3, why: 'بدائل «خيري» حين يبطئ النت أو بلا JavaScript (بصمة /intake الخيرية)' },
  'public/khayri-paused.html': { max: 1, why: 'عنوان إشعار «خيري» المتوقف؛ KH-05… محجوزة لـ 12.1' },
});

/** صفوف تقرير التغطية التي تتجاوز المسموح (TG-7): [{ file, keys, untagged, allowed, sample }] */
export function coverageGaps(report) {
  return report.rows
    .filter((r) => r.untagged)
    .map((r) => ({ ...r, allowed: UNTAGGED_BY_DESIGN[r.file] ? (UNTAGGED_BY_DESIGN[r.file].max ?? Infinity) : 0 }))
    .filter((r) => r.untagged > r.allowed);
}

/**
 * العدد مع المعدود بقواعد العربية: 1 «رمز واحد» · 2 «رمزان» · 3–10 «رموز» · 11–99 «رمزًا» · 100، 101، 102… «رمز».
 * forms = { zero, one, two, few, many, hundred }
 */
export function countAr(n, forms) {
  const k = Number(n) || 0;
  if (k === 0) return forms.zero;
  if (k === 1) return forms.one;
  if (k === 2) return forms.two;
  const r = k % 100;
  if (r >= 3 && r <= 10) return `${k} ${forms.few}`;
  if (r >= 11 && r <= 99) return `${k} ${forms.many}`;
  return `${k} ${forms.hundred}`;
}
export const AR = Object.freeze({
  code: { zero: 'لا رموز', one: 'رمز واحد', two: 'رمزان', few: 'رموز', many: 'رمزًا', hundred: 'رمز' },
  screen: { zero: 'لا شاشات', one: 'شاشة واحدة', two: 'شاشتان', few: 'شاشات', many: 'شاشة', hundred: 'شاشة' },
  placeholder: { zero: 'لا عناصر نائبة', one: 'عنصر نائب واحد', two: 'عنصران نائبان', few: 'عناصر نائبة', many: 'عنصرًا نائبًا', hundred: 'عنصر نائب' },
  error: { zero: 'لا أخطاء', one: 'خطأ واحد', two: 'خطآن', few: 'أخطاء', many: 'خطأً', hundred: 'خطأ' },
  element: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: 'عناصر', many: 'عنصرًا', hundred: 'عنصر' },
});

const SURFACE_ORDER = Object.keys(SURFACES);
const PREFIX_ORDER = Object.keys(PAGES);
const pad = (n) => String(n).padStart(2, '0');
export const codeOf = (prefix, n) => `${prefix}-${pad(n)}`;

// ───────────────────────── الدفتر (ledger) ─────────────────────────

export function loadLedger(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, LEDGER_FILE), 'utf8'));
  } catch {
    return { version: 1, frozen: false, prefixes: {} };
  }
}

/** نص الدفتر كما يُكتب (ثابت الترتيب) */
export function ledgerText(ledger) {
  const prefixes = {};
  for (const p of Object.keys(ledger.prefixes || {}).sort((a, b) => orderOf(a) - orderOf(b) || (a < b ? -1 : 1))) {
    const e = ledger.prefixes[p];
    const out = { next: e.next };
    if (e.reserved?.length) out.reserved = e.reserved;
    out.retired = Object.fromEntries(Object.keys(e.retired || {}).sort((a, b) => Number(a) - Number(b)).map((k) => [k, e.retired[k]]));
    if (e.known) out.known = e.known;
    prefixes[p] = out;
  }
  const doc = { version: ledger.version ?? 1, frozen: Boolean(ledger.frozen) };
  if (ledger.frozen_in) doc.frozen_in = ledger.frozen_in;
  if (ledger.note) doc.note = ledger.note;
  doc.prefixes = prefixes;
  // صف واحد لكل نطاق محجوز (قراءة أسهل في المراجعة)
  return `${JSON.stringify(doc, null, 2).replace(/\{\n\s+"from": (\d+),\n\s+"to": (\d+),\n\s+"lane": ("[^"]*"),\n\s+"what": ("(?:[^"\\]|\\.)*")\n\s+\}/g, '{ "from": $1, "to": $2, "lane": $3, "what": $4 }')}\n`;
}

const orderOf = (p) => {
  const i = PREFIX_ORDER.indexOf(p);
  return i < 0 ? 1e6 : i;
};

/** النطاق المحجوز الذي يقع فيه الرقم (أو null) */
export function reservationOf(ledger, prefix, num) {
  const n = Number(num);
  return (ledger.prefixes?.[prefix]?.reserved || []).find((r) => n >= r.from && n <= r.to) || null;
}

/** «1-16,20» ← [1..16, 20] */
export function compactNums(nums) {
  const s = [...new Set(nums.map(Number))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(',');
}
export function expandNums(text) {
  const out = [];
  for (const part of String(text || '').split(',').filter(Boolean)) {
    const [a, b] = part.split('-').map(Number);
    for (let n = a; n <= (b || a); n++) out.push(n);
  }
  return out;
}

// ───────────────────────── التحقق (T12-70…T12-73) ─────────────────────────

/** خريطة الملف ← البادئات التي يخدمها */
export function prefixesOfFile(rel) {
  return Object.keys(FILES).filter((p) => FILES[p].includes(rel));
}

/** بادئة الملف «الأصلية» لأداة autotag: التي يأتي الملف أولًا في ملفاتها، أو الوحيدة. وإلا null (يُرمَّز باليد أو بـ --prefix) */
export function homePrefixOf(rel) {
  let all = prefixesOfFile(rel);
  // بادئات الرسائل (W/E/D/B) تُكتب في خرائطها؛ عناصر الشاشة في الملف نفسه لبادئة الشاشة
  if (all.length > 1) all = all.filter((p) => PAGES[p].surface !== 'msg');
  if (all.length === 1) return all[0];
  const first = all.filter((p) => FILES[p][0] === rel);
  return first.length === 1 ? first[0] : null;
}

/**
 * يتحقق من المسح: { errors:[نص]، warnings:[نص] }.
 * opts.extraForbidden: بادئات محظورة إضافية (CODE_PREFIX ومجالات العمل من constants.js في الاختبار).
 */
export function validate(scan, { ledger = loadLedger(scan.root), extraForbidden = [], root = scan.root || ROOT, laneFiles = LANE_FILES } = {}) {
  const errors = [];
  const warnings = [];
  const forbidden = new Set([...FORBIDDEN_PREFIXES, ...extraForbidden]);
  // جدول البادئات نفسه
  for (const p of Object.keys(PAGES)) {
    const pg = PAGES[p];
    if (!/^[A-Z]{1,3}$/.test(p)) errors.push(`prefix ${p}: must be 1–3 capital Latin letters`);
    if (forbidden.has(p)) errors.push(`prefix ${p}: forbidden (record or area code, T12-04)`);
    if (!pg || !SURFACES[pg.surface] || !pg.name || typeof pg.url !== 'string') errors.push(`prefix ${p}: needs surface, name and url`);
    if (!FILES[p]?.length) errors.push(`prefix ${p}: no files in src/tags/registry.js FILES`);
  }
  for (const p of Object.keys(FILES)) {
    if (!PAGES[p]) errors.push(`FILES has ${p}, which is not in tags-pages*.js`);
    for (const f of FILES[p]) {
      if (fs.existsSync(path.join(root, f))) continue;
      const msg = `${p}: listed file ${f} does not exist`;
      if (ledger.frozen) errors.push(msg);
      else if (!PLANNED_FILES.has(f)) warnings.push(msg);
    }
  }
  const all = [...scan.defs, ...(scan.generated || [])];
  const primaries = new Map();
  for (const d of all) {
    const where = `${d.file}:${d.line}`;
    if (!CODE_RE.test(d.code)) {
      errors.push(`${d.code} (${where}): bad format; a code is PREFIX-NN, 1–3 capital letters and 01–999 (T12-01)`);
      continue;
    }
    if (forbidden.has(d.prefix)) errors.push(`${d.code} (${where}): prefix ${d.prefix} is forbidden (T12-04)`);
    if (!PAGES[d.prefix]) {
      errors.push(`${d.code} (${where}): unknown prefix ${d.prefix}; add it to tags-pages.js (public) or tags-pages-app.js and to FILES`);
      continue;
    }
    if (!FILES[d.prefix].includes(d.file)) errors.push(`${d.code} (${where}): ${d.file} may not define ${d.prefix} codes (allowed: ${FILES[d.prefix].join(', ')}) (T12-72)`);
    const res = reservationOf(ledger, d.prefix, d.num);
    if (res && !(laneFiles[res.lane] || []).includes(d.file)) errors.push(`${d.code} (${where}): ${d.prefix}-${pad(res.from)}…${d.prefix}-${pad(res.to)} is reserved for the ${res.lane} lane (${res.what}); define it in that lane's files`);
    if (ledger.prefixes?.[d.prefix]?.retired?.[String(Number(d.num))] !== undefined || ledger.prefixes?.[d.prefix]?.retired?.[d.num] !== undefined) errors.push(`${d.code} (${where}): retired code reused; take ${'`'}npm run tags -- next ${d.prefix}${'`'} (T12-06)`);
    if (d.variant) continue;
    const prev = primaries.get(d.code);
    if (prev) errors.push(`${d.code} defined twice: ${prev.file}:${prev.line} and ${where}. Give one a new number (or X-00), factor both into one helper, or mark the second as the same element worded differently with a «tags:variant» comment on its line or the line above (T12-71)`);
    else primaries.set(d.code, d);
  }
  for (const d of all) if (d.variant && !primaries.has(d.code)) warnings.push(`${d.code} (${d.file}:${d.line}): marked tags:variant but no primary definition`);
  for (const p of scan.placeholders || []) {
    const where = `${p.file}:${p.line}`;
    if (!PAGES[p.prefix]) errors.push(`${p.code} (${where}): unknown prefix ${p.prefix}`);
    else if (!FILES[p.prefix].includes(p.file)) errors.push(`${p.code} (${where}): ${p.file} may not define ${p.prefix} codes (T12-72)`);
    if (ledger.frozen) errors.push(`${p.code} (${where}): placeholder after the freeze; run npm run tags (T12-10)`);
  }
  return { errors, warnings };
}

// ───────────────────────── الترقيم ─────────────────────────

/** الرقم التالي الحر لبادئة: من ledger.next، خارج النطاقات المحجوزة، غير مستعمل ولا متقاعد */
export function nextFree(prefix, scan, ledger = loadLedger(scan.root), taken = new Set()) {
  const used = new Set([...scan.defs, ...(scan.generated || [])].filter((d) => d.prefix === prefix).map((d) => Number(d.num)));
  const retired = new Set(Object.keys(ledger.prefixes?.[prefix]?.retired || {}).map(Number));
  let n = Math.max(1, Number(ledger.prefixes?.[prefix]?.next) || 1);
  while (used.has(n) || retired.has(n) || taken.has(n) || reservationOf(ledger, prefix, n)) n++;
  return n;
}

/** خطة ترقيم العناصر النائبة: [{ file, line, from:'X-00', to:'X-NN' }] بترتيب ملفات البادئة ثم السطر (T12-56) */
export function planAssignments(scan, ledger = loadLedger(scan.root)) {
  const byPrefix = new Map();
  for (const p of scan.placeholders || []) {
    if (!byPrefix.has(p.prefix)) byPrefix.set(p.prefix, []);
    byPrefix.get(p.prefix).push(p);
  }
  const plan = [];
  for (const [prefix, list] of byPrefix) {
    const files = FILES[prefix] || [];
    list.sort((a, b) => (files.indexOf(a.file) - files.indexOf(b.file)) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line);
    const taken = new Set();
    for (const p of list) {
      const n = nextFree(prefix, scan, ledger, taken);
      taken.add(n);
      plan.push({ file: p.file, line: p.line, prefix, from: p.code, to: codeOf(prefix, n), num: n });
    }
  }
  return plan;
}

/** يطبّق الخطة على نصوص الملفات: يستبدل X-00 الأول المتبقي في السطر المعني (لكل عنصر نائب) */
export function applyPlan(plan, { root = ROOT, write = true } = {}) {
  const byFile = new Map();
  for (const a of plan) {
    if (!byFile.has(a.file)) byFile.set(a.file, []);
    byFile.get(a.file).push(a);
  }
  const changed = [];
  for (const [file, list] of byFile) {
    const full = path.join(root, file);
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    for (const a of list) {
      const i = a.line - 1;
      // v12 tags (TG-6): also a guarded literal (tag: X && 'I-00' · tag: PC ? 'P-00' : null), as the scanner reads it
      const re = new RegExp(`(data-tag\\s*=\\s*\\\\?["']|(?:tag|qtag|data-tag|[a-z][A-Za-z0-9]*Tag)['"]?\\s*:\\s*(?:!?[\\w$.]+(?:\\([^()]*\\))?\\s*(?:&&|\\?)\\s*)?['"\`]|tagged\\(\\s*['"\`]|dataset\\.tag\\s*=\\s*['"]|['"]data-tag['"]\\s*,\\s*['"]|:\\s*['"])${a.from}(?=\\\\?['"\`])`);
      if (!re.test(lines[i])) throw new Error(`${file}:${a.line}: ${a.from} not found where the scan saw it`);
      lines[i] = lines[i].replace(re, `$1${a.to}`);
    }
    if (write) fs.writeFileSync(full, lines.join('\n'));
    changed.push(file);
  }
  return changed;
}

/**
 * الدفتر بعد المسح: next = أعلى رقم معرَّف + 1 (لا ينقص أبدًا)؛ بعد التجميد يُسجَّل كل رمز معروف اختفى متقاعدًا بنصه الأخير.
 * opts.lastText(code): آخر نص معروف (من TAGS.md السابق).
 */
export function updateLedger(ledger, scan, { version = '', lastText = () => '' } = {}) {
  const next = JSON.parse(JSON.stringify(ledger));
  next.prefixes ||= {};
  const byPrefix = new Map();
  for (const d of [...scan.defs, ...(scan.generated || [])]) {
    if (!CODE_RE.test(d.code)) continue;
    if (!byPrefix.has(d.prefix)) byPrefix.set(d.prefix, new Set());
    byPrefix.get(d.prefix).add(Number(d.num));
  }
  for (const [prefix, nums] of byPrefix) {
    const e = (next.prefixes[prefix] ||= { next: 1, retired: {} });
    e.retired ||= {};
    e.next = Math.max(Number(e.next) || 1, Math.max(...nums) + 1);
  }
  if (next.frozen) {
    for (const [prefix, e] of Object.entries(next.prefixes)) {
      const now = byPrefix.get(prefix) || new Set();
      const known = new Set(expandNums(e.known));
      for (const n of known) {
        if (now.has(n) || e.retired?.[String(n)]) continue;
        e.retired[String(n)] = { in: version, was: lastText(codeOf(prefix, n)) || '' };
      }
      const keep = [...new Set([...known, ...now])].filter((n) => !e.retired?.[String(n)]);
      if (keep.length) e.known = compactNums(keep);
    }
  }
  return next;
}

/** تجميد الدفتر (بوابة 12.0.0، T12-95): يحفظ الأرقام المعروفة لاكتشاف ما يُحذف لاحقًا */
export function freezeLedger(ledger, scan, version = '') {
  const next = updateLedger(ledger, scan, { version });
  next.frozen = true;
  next.frozen_in = version;
  const byPrefix = new Map();
  for (const d of [...scan.defs, ...(scan.generated || [])]) {
    if (!CODE_RE.test(d.code)) continue;
    if (!byPrefix.has(d.prefix)) byPrefix.set(d.prefix, []);
    byPrefix.get(d.prefix).push(Number(d.num));
  }
  for (const [prefix, nums] of byPrefix) next.prefixes[prefix].known = compactNums(nums);
  return next;
}

// ───────────────────────── بيانات الوحدات (نصوص لا يراها المسح الثابت) ─────────────────────────

const textOf = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'function') return '(نص متغير)';
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(' · ');
  if (typeof v === 'object') {
    const parts = [v.header, v.body ?? v.text ?? v.title ?? v.template, ...(Array.isArray(v.buttons) ? v.buttons.map((b) => (typeof b === 'string' ? b : b?.title)) : [])];
    const known = parts.map(textOf).filter(Boolean);
    // v12 tags (TG-4): مجموعة نصوص بلا مفاتيح معروفة (أزرار WA_BUTTON_TEXTS) ← كل قيمها
    return (known.length ? known : Object.values(v).map(textOf).filter(Boolean)).join(' · ');
  }
  return String(v);
};

async function importFresh(root, rel) {
  const full = path.join(root, rel);
  const st = fs.statSync(full);
  return import(`${pathToFileURL(full).href}?v=${Math.floor(st.mtimeMs)}-${st.size}`);
}

/**
 * يستورد الوحدات التي تحمل نصوص الرموز (بلا آثار عند الاستيراد): allTags() وLINES من entry-tree.js، ونصوص الرسائل
 * من constants.js لمفاتيح TEXT_TAGS. أي فشل يُسجَّل في errors ولا يوقف السجل.
 */
export async function loadModuleData(root = ROOT) {
  const out = { tree: [], lines: {}, texts: {}, words: {}, errors: [] };
  // review: نصوص «W.…» (كلمات بوابة الشركات، words-pages.js يجمع الثلاثة) و«COPY.…» (نموذج الطلب بصيغة الأفراد والشركات)
  // لتعريفات نصها من وحدة كلمات لا نص حرفي، فيقرأ المالك النص في TAGS.md وصفحة الرموز بدل «(نص متغير)»
  try {
    out.words.W = (await importFresh(root, `${JS}/company/words-pages.js`)).W || null;
  } catch (err) {
    out.errors.push(`${JS}/company/words-pages.js: ${err.message}`);
  }
  // عناوين مسارات المنصة (navItem يأخذ اسمه من routeTitle): قراءة ثابتة لـ routes.js
  try {
    const src = fs.readFileSync(path.join(root, `${JS}/app/routes.js`), 'utf8');
    out.words.ROUTE = Object.fromEntries([...src.matchAll(/\{\s*path:\s*'([^']+)'[^\n]*?\btitle:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  } catch (err) {
    out.errors.push(`${JS}/app/routes.js: ${err.message}`);
  }
  try {
    const paid = (await importFresh(root, 'src/site-copy-paid.js')).intakePaidCopy?.({ voice: false });
    if (paid) out.words.COPY = { ...paid.COPY, ...paid.SUCCESS };
  } catch (err) {
    out.errors.push(`src/site-copy-paid.js: ${err.message}`);
  }
  const treeRel = `${PUB}/entry-tree.js`;
  if (fs.existsSync(path.join(root, treeRel))) {
    try {
      const m = await importFresh(root, treeRel);
      const list = typeof m.allTags === 'function' ? m.allTags() : [];
      out.tree = (Array.isArray(list) ? list : Object.entries(list || {}).map(([tag, label]) => ({ tag, label })))
        .map((x) => ({ code: x.tag || x.code, label: textOf(x.label ?? x.text ?? x.q ?? ''), kind: x.kind || '' }))
        .filter((x) => x.code);
      for (const [k, v] of Object.entries(m.LINES || {})) out.lines[k] = { label: v.label, chip: v.chip, tag: v.tag };
    } catch (err) {
      out.errors.push(`${treeRel}: ${err.message}`);
    }
  }
  try {
    const c = await importFresh(root, 'src/constants.js');
    const objects = [
      ['CLIENT_TEXTS', 'خيري'],
      ['CLIENT_TEXTS_PAID', 'أفراد وشركات'],
      ['CLIENT_TEXTS_CHARITY_EXTRA', 'خيري'],
      ['SEGMENT_CHOICE_TEXTS', 'محايد'],
      ['SEGMENT_CHANGE_TEXTS', 'تغيير النوع'],
      ['LINES_MENU_TEXTS', 'أفراد وشركات'],
      ['WA_BUTTON_TEXTS', 'أزرار'], // v12 tags (TG-4): أزرار تفاعلية نُقلت من الكود بنصها
    ];
    for (const key of Object.keys(c.TEXT_TAGS || {})) {
      const variants = [];
      if (key.startsWith('rule:')) {
        const rule = c.DEFAULT_AUTOMATION_RULES?.[key.slice(5)];
        if (rule?.params?.template) variants.push({ label: 'خيري', text: textOf(rule.params.template) });
        if (rule?.params?.template_paid) variants.push({ label: 'أفراد وشركات', text: textOf(rule.params.template_paid) });
      } else {
        for (const [name, label] of objects) if (c[name] && key in c[name]) variants.push({ label, text: textOf(c[name][key]) });
      }
      out.texts[key] = variants;
    }
  } catch (err) {
    out.errors.push(`src/constants.js: ${err.message}`);
  }
  // v12 tags (TG-4): نصوص تنبيهات المحامين (ALERT_TAGS) بقيم مثال؛ الدوال نقية
  try {
    const la = await importFresh(root, 'src/services/lawyer-alerts.js');
    const sample = { code: 'CS-2026-00012', due: '2026-10-20T10:00:00.000Z', at: null, sendAt: null, n: 3 };
    for (const key of Object.keys(la.ALERT_TAGS || {})) {
      const f = la.ALERT_TEXT?.[key];
      if (typeof f === 'function') out.texts[`alert:${key}`] = [{ label: 'المحامي', text: String(f(sample)) }];
    }
  } catch (err) {
    out.errors.push(`src/services/lawyer-alerts.js: ${err.message}`);
  }
  // v12 tags (TG-4): موضوع كل قالب بريد (EMAIL_TAGS) وسطرا التحية والتذييل، قراءة ثابتة لـ email.js (render يحتاج التطبيق)
  try {
    Object.assign(out.texts, emailTexts(root));
  } catch (err) {
    out.errors.push(`src/services/email.js: ${err.message}`);
  }
  return out;
}

const literalText = (lit) => String(lit || '').replace(/\$\{([^}]*)\}/g, (m, e) => (/vars\.(subject|line)|inviter/.test(e) ? '(نص متغير)' : '…')).replace(/\s+/g, ' ').trim();

/** { key: [{ label, text }] } لمفاتيح EMAIL_TAGS: الموضوع من «case 'key'» والتحية والتذييل من تعريفهما */
export function emailTexts(root = ROOT) {
  const rel = 'src/services/email.js';
  let src = '';
  try {
    src = fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return {};
  }
  const lines = src.split('\n');
  const map = /export const EMAIL_TAGS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(src);
  if (!map) return {};
  const keys = [...map[1].matchAll(/([A-Za-z_]+)\s*:\s*'[A-Z]{1,3}-\d+'/g)].map((m) => m[1]);
  const out = {};
  for (const key of keys) {
    if (key === 'hello' || key === 'footer') {
      const m = new RegExp(`const ${key} = \`([^\`]*)\``).exec(src);
      if (m) out[key] = [{ label: key === 'hello' ? 'التحية' : 'التذييل', text: literalText(m[1]) }];
      continue;
    }
    const at = lines.findIndex((l) => new RegExp(`\\bcase\\s+'${key}'`).test(l));
    if (at < 0) continue;
    for (let i = at; i < Math.min(lines.length, at + 10); i++) {
      // أول نص حرفي بعد «subject:» في السطر (قد يسبقه vars.x ? … أو vars.subject ||)، وإلا موضوع متغير
      const m = /subject:[^'`\n]*?(['`])((?:(?!\1).)*)\1/.exec(lines[i]) || (/subject:/.test(lines[i]) ? [null, '', '(نص متغير)'] : null);
      if (m) {
        out[key] = [{ label: 'الموضوع', text: literalText(m[2]) }];
        break;
      }
      if (i > at && /\bcase\s+'/.test(lines[i])) break;
    }
  }
  return out;
}

// ───────────────────────── السجل ─────────────────────────

const MESSAGE_MAPS = new Set(['TEXT_TAGS', 'EMAIL_TAGS', 'NOTIF_TAGS', 'ALERT_TAGS']);
const KIND_BY_TREE = { question: 'سؤال', option: 'خيار', restored: 'رابط', intake_question: 'سؤال', intake_answer: 'خيار' };

/** مواقع النصوص البديلة لمفتاح خريطة *_TAGS في الملف نفسه (كائنات *_TEXTS وحالات case 'key') */
function variantLocations(root, file, key, cacheMap) {
  if (!cacheMap.has(file)) {
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    } catch {
      /* ملف غير موجود */
    }
    // اسم الكائن المحيط بكل سطر (export const NAME = {)
    const owner = [];
    let current = null;
    for (const line of lines) {
      const m = /^export const ([A-Z][A-Z0-9_]*)\s*=/.exec(line);
      if (m) current = m[1];
      owner.push(current);
    }
    cacheMap.set(file, { lines, owner });
  }
  const { lines, owner } = cacheMap.get(file);
  const out = [];
  const k = key.startsWith('rule:') ? key.slice(5) : key;
  const re = new RegExp(`^\\s*(?:['"]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]|${/^[A-Za-z_$][\w$]*$/.test(k) ? k : '\\u0000'})\\s*:|\\bcase\\s+['"]${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  lines.forEach((line, i) => {
    if (re.test(line) && !/_TAGS$/.test(owner[i] || '')) out.push({ file, line: i + 1, label: owner[i] || '' });
  });
  return out;
}

/** نص مرجع كلمات (W.account.name في ملفات بوابة الشركات، COPY.done في intake.js) أو '' */
export function resolveRef(words, file, ref) {
  if (String(ref).startsWith('ROUTE:')) return cleanText(words?.ROUTE?.[String(ref).slice(6)] || '');
  const [root, ...keys] = String(ref || '').split('.');
  let v = null;
  if (root === 'W' && /^public\/assets\/js\/(?:company\/|lib\/company-)/.test(file)) v = words?.W;
  else if (root === 'COPY' && file === `${PUB}/intake.js`) v = words?.COPY;
  for (const k of keys) v = v != null && typeof v === 'object' ? v[k] : null;
  if (Array.isArray(v)) v = v.find((x) => typeof x === 'string');
  return typeof v === 'string' ? cleanText(v.replace(/[⟦⟧]/g, '')) : '';
}

/**
 * يبني السجل: { version, total, prefixes:[{prefix, surface, name, url, count}], items:[…], placeholders, retired, reserved }.
 * item = { code, prefix, num, surface, screen, kind, text, file, line, variants:[{file,line,label,text}], pointers:[{file,line}],
 *          shared:[{code, where}], sharedText, setting, reserved }
 */
export function buildRegistry(scan, { ledger = loadLedger(scan.root), moduleData = null, version = readVersion(scan.root) } = {}) {
  const root = scan.root || ROOT;
  const items = new Map();
  const variantCache = new Map();
  const md = moduleData || { tree: [], lines: {}, texts: {} };
  const treeByCode = new Map(md.tree.map((x) => [x.code, x]));
  for (const d of scan.defs) {
    if (!CODE_RE.test(d.code) || !PAGES[d.prefix]) continue;
    const existing = items.get(d.code);
    if (existing && (d.variant || !existing.variantOnly)) {
      existing.variants.push({ file: d.file, line: d.line, label: '', text: d.text || '' });
      continue;
    }
    // تعريف أساسي بعد صيغة بديلة سبقته في ترتيب المسح: تصبح السابقة موقعًا بديلًا
    if (existing) existing.variants.unshift({ file: existing.file, line: existing.line, label: '', text: existing.text || '' });
    const pg = PAGES[d.prefix];
    const item = {
      code: d.code,
      prefix: d.prefix,
      num: Number(d.num),
      surface: pg.surface,
      screen: pg.name,
      kind: d.prefix === 'D' ? 'مستند مطبوع' : d.kind,
      text: d.text || '',
      file: d.file,
      line: d.line,
      variants: existing ? existing.variants : [],
      pointers: [],
      shared: [],
      sharedText: '',
      setting: SETTINGS_SOURCES[d.code] || '',
      reserved: reservationOf(ledger, d.prefix, d.num)?.lane || '',
    };
    if (d.form === 'map') item.key = d.key; // v12 tags (TG-5): مفتاح الرسالة في خريطتها (لنصوصها في /app#/tags)
    if (d.variant) item.variantOnly = true;
    const fromTree = treeByCode.get(d.code);
    if (fromTree) {
      if (!item.text || item.text === '(نص متغير)') item.text = fromTree.label;
      if (KIND_BY_TREE[fromTree.kind]) item.kind = KIND_BY_TREE[fromTree.kind];
    }
    if (d.form === 'map') {
      const texts = md.texts[d.map === 'ALERT_TAGS' ? `alert:${d.key}` : d.key];
      if (texts?.length) {
        item.text = texts.map((v) => `${v.label}: «${shorten(v.text)}»`).join(' · ');
      } else if (!item.text) item.text = d.key;
      if (MESSAGE_MAPS.has(d.map)) for (const loc of variantLocations(root, d.file, d.key, variantCache)) item.variants.push({ file: loc.file, line: loc.line, label: loc.label, text: '' });
    }
    if (!item.text && d.ref) item.text = resolveRef(md.words, d.file, d.ref);
    if (!item.text) item.text = '(نص متغير)';
    items.set(d.code, item);
  }
  // رموز تنتجها الوحدات ولا يراها المسح الثابت (مثلًا رموز تُبنى بحلقة)
  for (const x of md.tree) {
    if (items.has(x.code) || !CODE_RE.test(x.code)) continue;
    const prefix = x.code.split('-')[0];
    if (!PAGES[prefix]) continue;
    items.set(x.code, {
      code: x.code, prefix, num: Number(x.code.split('-')[1]), surface: PAGES[prefix].surface, screen: PAGES[prefix].name,
      kind: KIND_BY_TREE[x.kind] || 'خيار', text: x.label || '(نص متغير)', file: `${PUB}/entry-tree.js`, line: 0,
      variants: [], pointers: [], shared: [], sharedText: '', setting: SETTINGS_SOURCES[x.code] || '', reserved: reservationOf(ledger, prefix, x.code.split('-')[1])?.lane || '', generated: true,
    });
  }
  for (const p of scan.pointers || []) items.get(p.code)?.pointers.push({ file: p.file, line: p.line });
  for (const s of scan.settings || []) {
    const it = items.get(s.code);
    if (it && !it.setting) it.setting = s.card;
  }
  // L12-82: نص واحد يقرؤه أكثر من رمز
  for (const g of SHARED_TEXT) {
    const text = md.lines?.[g.line]?.label || g.fallback;
    for (const [code] of g.codes) {
      const it = items.get(code);
      if (!it) continue;
      it.sharedText = `${g.source} «${text}»`;
      for (const [other, where] of g.codes) if (other !== code && !it.shared.some((x) => x.code === other)) it.shared.push({ code: other, where });
    }
  }
  const list = [...items.values()].map(({ variantOnly, ...rest }) => rest);
  list.sort((a, b) => SURFACE_ORDER.indexOf(a.surface) - SURFACE_ORDER.indexOf(b.surface) || orderOf(a.prefix) - orderOf(b.prefix) || a.num - b.num);
  const counts = new Map();
  for (const it of list) counts.set(it.prefix, (counts.get(it.prefix) || 0) + 1);
  const prefixes = PREFIX_ORDER.map((p) => ({ prefix: p, surface: PAGES[p].surface, name: PAGES[p].name, url: PAGES[p].url, count: counts.get(p) || 0 })).sort(
    (a, b) => SURFACE_ORDER.indexOf(a.surface) - SURFACE_ORDER.indexOf(b.surface) || orderOf(a.prefix) - orderOf(b.prefix),
  );
  const retired = [];
  for (const [prefix, e] of Object.entries(ledger.prefixes || {})) {
    for (const [n, r] of Object.entries(e.retired || {})) retired.push({ code: codeOf(prefix, n), prefix, in: r?.in || '', was: typeof r === 'string' ? r : r?.was || '', moved: r?.moved || '' });
  }
  retired.sort((a, b) => orderOf(a.prefix) - orderOf(b.prefix) || compareCodes(a.code, b.code));
  const reserved = [];
  for (const [prefix, e] of Object.entries(ledger.prefixes || {})) for (const r of e.reserved || []) reserved.push({ prefix, from: codeOf(prefix, r.from), to: codeOf(prefix, r.to), lane: r.lane, what: r.what || '' });
  reserved.sort((a, b) => orderOf(a.prefix) - orderOf(b.prefix) || compareCodes(a.from, b.from));
  const placeholders = (scan.placeholders || []).map((p) => ({ code: p.code, file: p.file, line: p.line, kind: p.kind, text: p.text })).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
  return { version, total: list.length, screens: prefixes.filter((p) => p.count).length, prefixes, items: list, placeholders, retired, reserved, frozen: Boolean(ledger.frozen) };
}

const shorten = (s, max = 90) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
};

export function readVersion(root = ROOT) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || '';
  } catch {
    return '';
  }
}

/** البحث في السجل (CLI find، /app#/tags): رمز مطبَّع أو جزء رمز أو كلمات عربية */
export function searchRegistry(registry, q) {
  const raw = String(q || '').trim();
  if (!raw) return registry.items;
  const code = normalizeCode(raw);
  if (code) {
    const exact = registry.items.filter((it) => it.code === code);
    if (exact.length) return exact;
  }
  // كلمات عربية بلا همزات أو تشكيل تكفي: «تاسيس» تجد «تأسيس» (foldAr، review)
  const words = raw.split(/\s+/).filter(Boolean);
  return registry.items.filter((it) => {
    const hay = foldAr(`${it.text} ${it.screen}`);
    return words.every((w) => hay.includes(foldAr(w)) || it.code === w.toUpperCase());
  });
}

// ───────────────────────── TAGS.md (T12-61) ─────────────────────────

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const loc = (file, line) => (line ? `${file}:${line}` : file);

/** نص TAGS.md الحتمي (بلا طوابع زمنية): يقارن اختبار التزامن النصين بعد حذف أرقام الأسطر */
export function renderMarkdown(reg) {
  const out = [];
  out.push('# رموز العناصر (Element tags registry)');
  out.push('');
  out.push(`> يولّده \`npm run tags\` من المصدر، فلا يُعدَّل باليد. الإصدار ${reg.version || '؟'} · ${countAr(reg.total, AR.code)} · ${countAr(reg.screens, AR.screen)}.`);
  out.push('> الاستعمال: شغّلوا الرموز (`?tags=1`، أو حسابي ← رموز العناصر، أو Ctrl+K «رموز العناصر»، أو Alt+Shift+T)، اضغطوا الشارة لنسخ الرمز، ثم اكتبوا مثلًا «غيّر S-14 …».');
  out.push('> للمهندسين: `npm run tags -- find S-14` يطبع الملف والسطر والنص.');
  out.push('');
  out.push('## الشاشات (Screens)');
  out.push('');
  out.push('| Prefix | Surface | Screen | URL | Codes |');
  out.push('|---|---|---|---|---|');
  for (const p of reg.prefixes) out.push(`| ${p.prefix} | ${cell(SURFACES[p.surface])} | ${cell(p.name)} | ${cell(p.url)} | ${p.count} |`);
  const byPrefix = new Map();
  for (const it of reg.items) {
    if (!byPrefix.has(it.prefix)) byPrefix.set(it.prefix, []);
    byPrefix.get(it.prefix).push(it);
  }
  for (const p of reg.prefixes) {
    const list = byPrefix.get(p.prefix);
    if (!list?.length) continue;
    out.push('');
    out.push(`## ${p.prefix}: ${p.name}${p.url ? ` (\`${p.url}\`)` : ''}`);
    out.push('');
    out.push('| Code | Kind | Text | Where |');
    out.push('|---|---|---|---|');
    for (const it of list) {
      const notes = [];
      if (it.shared.length) notes.push(`يظهر النص نفسه أيضًا في: ${it.shared.map((s) => (s.where ? `${s.code} (${s.where})` : s.code)).join('، ')}`);
      if (it.setting) notes.push(`يُعدَّل من الإعدادات ← ${it.setting}`);
      const text = [cell(it.text), ...notes.map(cell)].join('<br>');
      const where = [loc(it.file, it.line), ...it.variants.map((v) => `${loc(v.file, v.line)}${v.label ? ` (${v.label})` : ''}`), ...it.pointers.map((x) => `${loc(x.file, x.line)} (@tag-src)`)].join(' · ');
      out.push(`| ${it.code} | ${cell(it.kind)} | ${text} | ${cell(where)} |`);
    }
  }
  if (reg.placeholders.length) {
    out.push('');
    out.push('## بلا رقم بعد (X-00)');
    out.push('');
    out.push('| Placeholder | Kind | Text | Where |');
    out.push('|---|---|---|---|');
    for (const p of reg.placeholders) out.push(`| ${p.code} | ${cell(p.kind)} | ${cell(p.text)} | ${loc(p.file, p.line)} |`);
  }
  out.push('');
  out.push('## النطاقات المحجوزة (Reserved ranges)');
  out.push('');
  out.push('| Range | Lane | What |');
  out.push('|---|---|---|');
  for (const r of reg.reserved) out.push(`| ${r.from}…${r.to} | ${cell(r.lane)} | ${cell(r.what)} |`);
  out.push('');
  out.push('## الرموز المتقاعدة (Retired codes)');
  out.push('');
  out.push('| Code | Retired in | Was | Moved to |');
  out.push('|---|---|---|---|');
  if (!reg.retired.length) out.push('| — | — | — | — |');
  for (const r of reg.retired) out.push(`| ${r.code} | ${cell(r.in)} | ${cell(r.was)} | ${cell(r.moved || '—')} |`);
  out.push('');
  return out.join('\n');
}

/** يقارن نصين من TAGS.md دون أرقام الأسطر (T12-74) */
export const stripLines = (md) => String(md || '').replace(/(\.(?:js|mjs|html|json)):\d+/g, '$1');

/** آخر نص لرمز في TAGS.md سابق (للرموز المتقاعدة بعد التجميد) */
export function lastTextFrom(md) {
  const map = new Map();
  for (const line of String(md || '').split('\n')) {
    const m = /^\| ([A-Z]{1,3}-\d{2,3}) \| [^|]* \| (.*?) \| [^|]* \|$/.exec(line);
    if (m) map.set(m[1], m[2].split('<br>')[0]);
  }
  return (code) => map.get(code) || '';
}

/** كل شيء دفعة واحدة: المسح + بيانات الوحدات + السجل (للـ CLI والاختبارات) */
export async function registryNow({ root = ROOT } = {}) {
  const scan = scanSources({ root });
  const moduleData = await loadModuleData(root);
  const ledger = loadLedger(root);
  return { scan, moduleData, ledger, registry: buildRegistry(scan, { ledger, moduleData, version: readVersion(root) }) };
}
