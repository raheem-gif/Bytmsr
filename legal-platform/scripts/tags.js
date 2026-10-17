#!/usr/bin/env node
// v12 tags-core (TG-2، T12-56…T12-60): أداة رموز العناصر — `npm run tags` (أو node scripts/tags.js).
//
//   (بلا أمر) | assign [--dry]   يرقّم كل X-00 بالرقم الحر التالي (خارج النطاقات المحجوزة)، يتحقق، يحدّث الدفتر، يكتب TAGS.md
//   --check                      يتحقق ويقول هل TAGS.md والدفتر محدَّثان، دون كتابة (0 سليم · 1 أخطاء · 2 يحتاج npm run tags)؛
//                                منذ TG-7 يعد عنصرًا أساسيًا بلا رمز (خارج UNTAGGED_BY_DESIGN) خطأً

//   find <رمز أو كلمات>          كل مواقع الرمز ونصه وشاشته (s14 · S 14 · S-١٤ كلها S-14)، أو بحث بالكلمات العربية
//   next <PREFIX>                الرقم الحر التالي، مثل INB-09
//   autotag <file…> [--dry] [--prefix X]   يضيف عناصر نائبة X-00 للعناصر الأساسية بلا رمز (لا يختار أرقامًا)
//   freeze [--force]             يجمّد الدفتر (بوابة 12.0.0): بعده يفشل npm test على أي X-00
//   coverage [--all]             تقرير العناصر الأساسية بلا رمز لكل ملف؛ يفشل (1) على ما ليس بلا رمز عن قصد (TG-7،
//                                TAGS_ENFORCE=0 قبل التجميد يعيده تقريرًا فقط)
//   md [--out FILE]              يطبع TAGS.md (أو يكتبه في FILE) دون لمس المصدر أو الدفتر
//   خيارات عامة: --root DIR (نسخة أخرى من legal-platform، للاختبار)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT as DEFAULT_ROOT, scanSources, autotagSource, coverageReport } from '../src/tags/scan.js';
import {
  PAGES, FILES, LEDGER_FILE, TAGS_MD, SHARED_TEXT, normalizeCode, validate, loadLedger, ledgerText, updateLedger, freezeLedger, planAssignments, applyPlan,
  nextFree, codeOf, reservationOf, prefixesOfFile, homePrefixOf, loadModuleData, buildRegistry, renderMarkdown, stripLines, lastTextFrom, readVersion, searchRegistry,
  countAr, AR, enforceCoverage, coverageGaps, UNTAGGED_BY_DESIGN,
} from '../src/tags/registry.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return false;
  argv.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = argv.indexOf(name);
  if (i < 0 || i === argv.length - 1) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};

const root = path.resolve(option('--root') || DEFAULT_ROOT);
const dry = flag('--dry');
const force = flag('--force');
const all = flag('--all');
const out = option('--out');
const forcedPrefix = option('--prefix');
const check = flag('--check');
const help = flag('--help') || flag('-h');
const cmd = check ? 'check' : argv.shift() || 'assign';

// خرج مقطوع (| head) ليس خطأ
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(process.exitCode || 0);
  throw err;
});
const say = (s = '') => process.stdout.write(`${s}\n`);
const warn = (s) => process.stderr.write(`${s}\n`);
const mdPath = path.join(root, TAGS_MD);
const readMd = () => {
  try {
    return fs.readFileSync(mdPath, 'utf8');
  } catch {
    return null;
  }
};
const codesAr = (n) => countAr(n, AR.code);
const errorsAr = (n) => countAr(n, AR.error);
const placeholdersAr = (n) => countAr(n, AR.placeholder);

function printValidation(v) {
  for (const w of v.warnings) warn(`تنبيه: ${w}`);
  for (const e of v.errors) warn(`خطأ: ${e}`);
}

async function registryFor(scan, ledger) {
  const moduleData = await loadModuleData(root);
  for (const e of moduleData.errors) warn(`تنبيه: ${e}`);
  return buildRegistry(scan, { ledger, moduleData, version: readVersion(root) });
}

async function cmdAssign() {
  const ledger = loadLedger(root);
  let scan = scanSources({ root });
  const v = validate(scan, { ledger, root });
  printValidation(v);
  if (v.errors.length) {
    warn(`لم يُكتب شيء: ${errorsAr(v.errors.length)}.`);
    return 1;
  }
  const plan = planAssignments(scan, ledger);
  if (dry) {
    for (const a of plan) say(`${a.file}:${a.line}  ${a.from} → ${a.to}`);
    say(plan.length ? `سيُرقَّم ${codesAr(plan.length)} (تجربة، لم يُكتب شيء).` : 'لا عناصر نائبة X-00.');
    return 0;
  }
  if (plan.length) {
    applyPlan(plan, { root });
    scan = scanSources({ root });
    const v2 = validate(scan, { ledger, root });
    if (v2.errors.length) {
      printValidation(v2);
      return 1;
    }
  }
  const before = readMd();
  const version = readVersion(root);
  const next = updateLedger(ledger, scan, { version, lastText: lastTextFrom(before) });
  const newlyRetired = Object.entries(next.prefixes).flatMap(([p, e]) => Object.keys(e.retired || {}).filter((n) => !ledger.prefixes?.[p]?.retired?.[n]).map((n) => codeOf(p, n)));
  fs.writeFileSync(path.join(root, LEDGER_FILE), ledgerText(next));
  const reg = await registryFor(scan, next);
  fs.writeFileSync(out ? path.resolve(out) : mdPath, renderMarkdown(reg));
  for (const a of plan) say(`${a.file}:${a.line}  ${a.from} → ${a.to}`);
  say(plan.length ? `رُقِّم ${codesAr(plan.length)}.` : 'لا عناصر نائبة X-00.');
  if (newlyRetired.length) say(`تقاعد ${codesAr(newlyRetired.length)}: ${newlyRetired.join('، ')}.`);
  const bySurface = new Map();
  for (const it of reg.items) bySurface.set(it.surface, (bySurface.get(it.surface) || 0) + 1);
  say([...bySurface].map(([s, n]) => `${s}: ${n}`).join(' · '));
  say(`كُتب ${path.relative(process.cwd(), out ? path.resolve(out) : mdPath) || TAGS_MD} و${LEDGER_FILE}: ${codesAr(reg.total)}.`);
  return 0;
}

async function cmdCheck() {
  const ledger = loadLedger(root);
  const scan = scanSources({ root });
  const v = validate(scan, { ledger, root });
  // TG-7 (T12-94): عنصر أساسي بلا رمز خارج UNTAGGED_BY_DESIGN خطأ ما دام الفرض قائمًا
  if (enforceCoverage(ledger)) for (const g of coverageGaps(coverageReport({ root }))) v.errors.push(`${g.file}: ${countAr(g.untagged, AR.element)} بلا رمز (${g.sample.join(' ')}); npm run tags -- autotag ${g.file}`);
  printValidation(v);
  if (v.errors.length) {
    warn(`${errorsAr(v.errors.length)}.`);
    return 1;
  }
  const stale = [];
  if (scan.placeholders.length) stale.push(`${placeholdersAr(scan.placeholders.length)} بلا رقم (X-00)`);
  const next = updateLedger(ledger, scan, { version: readVersion(root), lastText: lastTextFrom(readMd()) });
  if (ledgerText(next) !== ledgerText(ledger)) stale.push(`${LEDGER_FILE} غير محدَّث`);
  const md = readMd();
  if (md == null) stale.push(`${TAGS_MD} غير موجود بعد`);
  else {
    const reg = await registryFor(scan, ledger);
    if (stripLines(renderMarkdown(reg)) !== stripLines(md)) stale.push(`${TAGS_MD} غير محدَّث`);
  }
  if (stale.length) {
    say(`سليم، لكن: ${stale.join('؛ ')}. شغّلوا npm run tags.`);
    return 2;
  }
  // عدد الرموز لا عدد مواضع تعريفها (للرمز الواحد صيغ في أكثر من موضع)، كما في TAGS.md وصفحة الرموز (review)
  say(`سليم ومحدَّث (${codesAr(new Set(scan.defs.map((d) => d.code)).size)}).`);
  return 0;
}

async function cmdFind() {
  const q = argv.join(' ').trim();
  if (!q) {
    warn('الاستعمال: npm run tags -- find S-14');
    return 1;
  }
  const ledger = loadLedger(root);
  const scan = scanSources({ root });
  const reg = await registryFor(scan, ledger);
  const code = normalizeCode(q);
  const show = (it) => {
    say(`${it.code} · ${it.kind} · ${it.screen}${PAGES[it.prefix]?.url ? ` (${PAGES[it.prefix].url})` : ''}`);
    say(`  «${it.text}»`);
    say(`  ${it.file}${it.line ? `:${it.line}` : ''}`);
    for (const x of it.variants) say(`  ${x.file}:${x.line}${x.label ? `  (${x.label})` : '  (صيغة أخرى)'}`);
    for (const x of it.pointers) say(`  ${x.file}:${x.line}  (@tag-src)`);
    if (it.shared.length) say(`  يظهر النص نفسه أيضًا في: ${it.shared.map((s) => (s.where ? `${s.code} (${s.where})` : s.code)).join('، ')}`);
    if (it.setting) say(`  يُعدَّل من الإعدادات ← ${it.setting}`);
    if (it.reserved) say(`  (نطاق محجوز لمسار ${it.reserved})`);
  };
  if (code) {
    const it = reg.items.find((x) => x.code === code);
    if (it) {
      show(it);
      return 0;
    }
    const [prefix, num] = code.split('-');
    const ph = scan.placeholders.filter((p) => p.prefix === prefix);
    const res = PAGES[prefix] ? reservationOf(ledger, prefix, num) : null;
    if (!PAGES[prefix]) {
      warn(`${code}: البادئة ${prefix} غير معروفة.`);
      return 1;
    }
    say(`${code}: غير معرَّف في المصدر بعد · ${PAGES[prefix].name}${PAGES[prefix].url ? ` (${PAGES[prefix].url})` : ''}`);
    if (res) say(`  محجوز لمسار ${res.lane}: ${res.what}`);
    const group = SHARED_TEXT.find((g) => g.codes.some(([c]) => c === code));
    if (group) {
      const text = (await loadModuleData(root)).lines?.[group.line]?.label || group.fallback;
      say(`  النص من ${group.source}: «${text}»`);
      say(`  يظهر النص نفسه أيضًا في: ${group.codes.filter(([c]) => c !== code).map(([c, w]) => (w ? `${c} (${w})` : c)).join('، ')}`);
    }
    const retired = ledger.prefixes?.[prefix]?.retired?.[String(Number(num))];
    if (retired) say(`  متقاعد: ${typeof retired === 'string' ? retired : `${retired.was || ''} ${retired.in ? `(${retired.in})` : ''}`}`);
    if (ph.length) say(`  في هذه البادئة ${placeholdersAr(ph.length)} بلا رقم بعد (npm run tags يرقّمها).`);
    return res || group || retired ? 0 : 1;
  }
  const hits = searchRegistry(reg, q);
  if (!hits.length) {
    warn(`لا نتائج لـ «${q}».`);
    return 1;
  }
  for (const it of hits.slice(0, 50)) say(`${it.code.padEnd(8)} ${it.file}${it.line ? `:${it.line}` : ''}  «${it.text}»`);
  if (hits.length > 50) say(`… و${hits.length - 50} أخرى`);
  return 0;
}

async function cmdNext() {
  const prefix = String(argv[0] || '').trim().toUpperCase();
  if (!PAGES[prefix]) {
    warn(prefix ? `البادئة ${prefix} غير معروفة.` : 'الاستعمال: npm run tags -- next INB');
    return 1;
  }
  const scan = scanSources({ root });
  say(codeOf(prefix, nextFree(prefix, scan, loadLedger(root))));
  return 0;
}

async function cmdAutotag() {
  const files = argv.map((f) => path.relative(root, path.resolve(root, f)).split(path.sep).join('/'));
  if (!files.length) {
    warn('الاستعمال: npm run tags -- autotag public/assets/js/app/pages/admin/inbox.js [--dry] [--prefix INB]');
    return 1;
  }
  let code = 0;
  for (const rel of files) {
    if (rel.startsWith('..') || rel.startsWith('src/tags/') || rel.startsWith('scripts/') || rel.startsWith('test/')) {
      warn(`${rel}: خارج نطاق الأداة.`);
      code = 1;
      continue;
    }
    const home = forcedPrefix ? forcedPrefix.toUpperCase() : homePrefixOf(rel);
    const prefixes = home ? [home] : prefixesOfFile(rel);
    if (prefixes.length !== 1 || !PAGES[prefixes[0]]) {
      warn(`${rel}: ${prefixes.length ? `يخدم ${prefixes.join(' و')}؛ اختاروا --prefix أو رمّزوه باليد` : 'لا بادئة له في FILES'}.`);
      code = 1;
      continue;
    }
    if (forcedPrefix && !FILES[prefixes[0]]?.includes(rel)) warn(`تنبيه: ${rel} ليس في ملفات ${prefixes[0]}؛ أضيفوه إلى FILES وإلا فشل التحقق.`);
    const full = path.join(root, rel);
    const src = fs.readFileSync(full, 'utf8');
    const r = autotagSource(rel, src, prefixes[0]);
    for (const x of r.inserted) say(`${rel}:${x.line}  + ${prefixes[0]}-00  ${x.what}`);
    for (const x of r.skipped) warn(`${rel}:${x.line}  تُرك: ${x.reason}`);
    if (!dry && r.out !== src) fs.writeFileSync(full, r.out);
    say(`${rel}: ${placeholdersAr(r.inserted.length)}${dry ? ' (تجربة)' : ''}${r.skipped.length ? `، و${r.skipped.length} للمراجعة باليد` : ''}.`);
  }
  return code;
}

async function cmdFreeze() {
  const ledger = loadLedger(root);
  const scan = scanSources({ root });
  const v = validate(scan, { ledger, root });
  printValidation(v);
  if (v.errors.length) return 1;
  if (scan.placeholders.length && !force) {
    warn(`لا تجميد: ${placeholdersAr(scan.placeholders.length)} بلا رقم. شغّلوا npm run tags أولًا (أو --force).`);
    return 1;
  }
  const version = readVersion(root);
  const next = freezeLedger(ledger, scan, version);
  fs.writeFileSync(path.join(root, LEDGER_FILE), ledgerText(next));
  const reg = await registryFor(scan, next);
  fs.writeFileSync(mdPath, renderMarkdown(reg));
  say(`جُمِّد الدفتر في ${version}: ${codesAr(reg.total)}. من الآن يفشل npm test على أي X-00 وعلى رمز يُحذف دون تقاعد.`);
  return 0;
}

async function cmdCoverage() {
  const r = coverageReport({ root });
  const by = (f) => (UNTAGGED_BY_DESIGN[f] ? `  (عن قصد: ${UNTAGGED_BY_DESIGN[f].why})` : '');
  for (const row of all ? r.rows : r.rows.filter((x) => x.untagged).slice(0, 40)) say(`${String(row.untagged).padStart(4)} / ${String(row.keys).padEnd(4)} ${row.file}  ${row.sample.join(' ')}${by(row.file)}`);
  const gaps = coverageGaps(r);
  const missing = gaps.reduce((n, g) => n + g.untagged - (Number.isFinite(g.allowed) ? g.allowed : 0), 0);
  const enforced = enforceCoverage(loadLedger(root));
  say(`عناصر أساسية: ${r.total} · بلا رمز: ${r.untagged} · مرمَّزة: ${r.tagged} · بلا رمز خارج المسموح: ${missing}${enforced ? '' : ' (تقرير فقط: TAGS_ENFORCE=0)'}.`);
  return enforced && gaps.length ? 1 : 0;
}

async function cmdMd() {
  const ledger = loadLedger(root);
  const scan = scanSources({ root });
  const text = renderMarkdown(await registryFor(scan, ledger));
  if (out) fs.writeFileSync(path.resolve(out), text);
  else process.stdout.write(text);
  return 0;
}

const COMMANDS = { assign: cmdAssign, check: cmdCheck, find: cmdFind, next: cmdNext, autotag: cmdAutotag, freeze: cmdFreeze, coverage: cmdCoverage, md: cmdMd };

if (help || cmd === 'help' || !COMMANDS[cmd]) {
  const text = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n');
  say(text);
  process.exitCode = help || cmd === 'help' ? 0 : 1;
} else {
  try {
    process.exitCode = await COMMANDS[cmd]();
  } catch (err) {
    warn(`خطأ: ${err.message}`);
    process.exitCode = 1;
  }
}
