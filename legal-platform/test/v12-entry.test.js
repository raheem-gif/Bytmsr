// v12 entry lane (§7.3): الشجرة، الصفحة الأولى، أرشفة «خيري» على الموقع، /services، الطلب المختصر، ومسار الطلب.
// EN-0 (العقد): بيانات entry-tree.js (منطق validate.mjs كاختبارات)، pathways.js، schema 87، إعدادات v12-entry، bm-public.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startTestApp } from './helpers.js';
import { Db } from '../src/db.js';
import { DEFAULT_SETTINGS, LEGAL_AREAS, AREA_CODES } from '../src/constants.js';
import { TOPICS, QUESTIONS, ALIASES, topicByKey } from '../public/assets/js/public/topics.js';
import { PAID_GENERIC, paidPrefillOf, paidWaPrefill, PAID_TOPICS } from '../public/assets/js/public/segment.js';
import * as ET from '../public/assets/js/public/entry-tree.js';
import { NO_PATHWAY_LABEL } from '../src/services/pathways.js';

const {
  TREE,
  LINES,
  TREE_QUESTIONS,
  PLACEHOLDERS,
  TOPIC_TO_PATH,
  AREA_TO_PATH,
  RETIRED,
  QUESTION_TAGS,
  ANSWER_TAGS,
  PAID_EXTRA_ANSWERS,
  PAID_QUESTIONS,
  DOCS_SUB,
  PATHWAY_SOURCES,
  resolvePath,
  pageOf,
  leafOf,
  flowForPath,
  sanitizePathAnswers,
  trail,
  prefillFor,
  pathFromPrefill,
  lineFromText,
  rowFromText,
  allPages,
  allLeaves,
  allTags,
  bmPathFor,
  isUrgent,
  pagesAr,
  staffAnswerLines,
} = ET;

const len = (s) => [...String(s ?? '')].length;
// نفس تطبيع segment.js (N): للتحقق من تفرد جمل واتساب الجاهزة
const N = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[ً-ٰٟـ​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
// قواعد صوت المكتب (§5.11): بلا «—/–» ولا «!» ولا كلمات «خيري» ولا أفعال مؤنثة
const DASH = /[—–]/;
const BANNED = /مجان|ببلاش|المؤسسة|إدارة قانونية افتراضية|الأرامل|الأيتام|مؤسسة بيوت مصر/;
const FEM = /اكتبي|ابعتي|صوّري|اختاري|سجّلي|اضغطي|قولي|تقدري|حاولي|ارجعي|تابعي|كمّلي|ابدئي|اتصلي|افتحي|كلمينا|تحبي|إنتي|كنتي|اسمعي|جربي|اتأكدي|بيكي|سيبي|اطلبي|\{ي\}|\{ة\}/;
const CTX_OFF = { b2b: false };
const CTX_CLOSED = { b2b: true, portal: false };
const codeNum = (t) => Number(String(t).split('-')[1]);

/** كل عقد الشجرة (مع القائمة المشتركة مرة واحدة) */
function allNodes() {
  const out = [];
  const walk = (n) => {
    for (const k of n.children || []) {
      out.push(k);
      walk(k);
    }
  };
  walk(TREE);
  for (const k of TREE.shared['litigation-types'].children) out.push(k);
  return out;
}
/** كل نصوص الشجرة الظاهرة (بلا صف «خيري» المستعاد) */
function treeStrings() {
  const s = [TREE.q];
  for (const n of allNodes()) s.push(n.label, n.hint, n.hint_b2b_off, n.wa, n.wa_desc, n.say, n.q, n.staff, n.chip, n.head, n.to?.docs_sub);
  s.push(TREE.shared['litigation-types'].q);
  for (const q of Object.values(TREE_QUESTIONS)) s.push(q.h1, q.staff_title, ...q.answers.flatMap((a) => [a.label, a.staff]));
  for (const q of Object.values(PAID_QUESTIONS)) s.push(q.h1, q.sub, ...q.a);
  for (const rows of Object.values(PAID_EXTRA_ANSWERS)) for (const r of rows) s.push(r[1], r[2]);
  s.push(...Object.values(PLACEHOLDERS), ...Object.values(DOCS_SUB), ...Object.values(PATHWAY_SOURCES), ET.PAID_UNKNOWN.label);
  return s.filter((x) => typeof x === 'string' && x);
}

describe('v12 entry EN-0: entry-tree.js data (validate.mjs as tests)', () => {
  test('E12-T01: 17 pages of 2–6 options, ids unique among siblings, depth ≤ 3, 69 intake leaves + 1 exit', () => {
    const pages = allPages();
    assert.equal(pages.length, 17);
    for (const p of pages) {
      assert.ok(p.options.length >= 2 && p.options.length <= 6, `${p.path || '/'}: ${p.options.length}`);
      assert.equal(new Set(p.options.map((o) => o.id)).size, p.options.length, `dup id under ${p.path}`);
      for (const o of p.options) assert.match(o.id, /^[a-z0-9-]+$/);
      assert.ok(p.depth >= 1 && p.depth <= 3);
      assert.ok(p.q && p.qtag, `page ${p.path} has a question`);
    }
    const leaves = allLeaves();
    assert.equal(leaves.length, 70);
    assert.equal(leaves.filter((l) => !l.exit).length, 69);
    assert.deepEqual(
      leaves.filter((l) => l.exit).map((l) => [l.path, l.href]),
      [['company/counsel/account', '/company']],
    );
    for (const l of leaves) assert.ok(l.depth >= 2 && l.depth <= 3, l.path);
    // كل صفحة لها مخرج («موضوع آخر…»، «نوع آخر»، «ورقة من المحكمة أو القسم»، «لم نحدد بعد»، أو الحساب/العرض)
    assert.equal(pageOf('').options.length, 3);
    assert.deepEqual(
      pageOf('').options.map((o) => [o.label, o.href]),
      [
        ['استشارة', '/start/consultation'],
        ['رفع دعوى قضائية', '/start/litigation'],
        ['تأسيس شركات', '/start/company'],
      ],
    );
  });

  test('E12-T02: labels ≤ 30, hints ≤ 40, WhatsApp titles L1 ≤ 20 / L2 ≤ 24, descriptions ≤ 72, ≤ 10 list rows', () => {
    for (const n of allNodes()) {
      assert.ok(len(n.label) <= 30, `label ${n.label}`);
      if (n.hint) assert.ok(len(n.hint) <= 40, `hint ${n.hint}`);
      if (n.hint_b2b_off) assert.ok(len(n.hint_b2b_off) <= 40);
      if (n.wa_desc) assert.ok(len(n.wa_desc) <= 72, `wa_desc ${n.wa_desc}`);
    }
    for (const o of pageOf('').options) assert.ok(len(o.wa || o.label) <= 20, `L1 ${o.label}`);
    for (const line of Object.keys(LINES)) {
      const p = pageOf(line);
      assert.ok(p.options.length <= 10);
      for (const o of p.options) {
        assert.ok(len(o.wa || o.label) <= 24, `L2 ${o.label}`);
        assert.ok(len(o.wa_desc || '') <= 72, `L2 desc ${o.wa_desc}`);
      }
    }
  });

  test('E12-T03: T-01…T-83 unique and all present; every page has a qtag; I-codes in the reserved ranges', () => {
    const t = [TREE.qtag, TREE.restored.tag];
    for (const n of allNodes()) {
      t.push(n.tag);
      if (n.qtag) t.push(n.qtag);
    }
    t.push(TREE.shared['litigation-types'].qtag);
    for (const c of t) assert.match(c, /^T-\d{2}$/);
    assert.equal(new Set(t).size, t.length, 'no duplicate T- code');
    for (let i = 1; i <= 83; i++) assert.ok(t.includes(`T-${String(i).padStart(2, '0')}`), `T-${i}`);
    assert.equal(t.length, 83);
    const tags = allTags();
    const codes = tags.map((x) => x.tag);
    assert.equal(new Set(codes).size, codes.length, 'allTags() unique');
    for (const c of codes) assert.match(c, /^(T-(0[1-9]|[1-7]\d|8[0-3])|I-(1[1-9]|2[0-5]|[89]\d|1[0-4]\d))$/, c);
    assert.equal(codes.filter((c) => c.startsWith('T-')).length, 83);
    // أسئلة الطلب I-11…I-25 وصفوفها I-80… متتالية بترتيب QUESTIONS ثم TREE_QUESTIONS (الإضافية أولًا و«لا أعرف» أخيرًا)
    assert.deepEqual(Object.values(QUESTION_TAGS), Array.from({ length: 15 }, (_, i) => `I-${11 + i}`));
    const order = [];
    for (const id of [...Object.keys(QUESTIONS), ...Object.keys(TREE_QUESTIONS)]) {
      for (const [v] of PAID_EXTRA_ANSWERS[id] || []) order.push(`${id}:${v}`);
      for (const a of (TREE_QUESTIONS[id] || QUESTIONS[id]).answers) order.push(`${id}:${a.value}`);
      order.push(`${id}:unknown`);
    }
    assert.deepEqual(Object.keys(ANSWER_TAGS), order);
    assert.deepEqual(Object.values(ANSWER_TAGS), order.map((_, i) => `I-${80 + i}`));
    assert.ok(codeNum(Object.values(ANSWER_TAGS).at(-1)) <= 149);
    for (const [id, q] of Object.entries(TREE_QUESTIONS)) assert.equal(q.tag, QUESTION_TAGS[id]);
    // لا رمز داخل تعليق أو نص مكرر في الملف: كل رمز يظهر حرفيًا مرة واحدة (السجل يجده في مكانه)
    const src = fs.readFileSync(new URL('../public/assets/js/public/entry-tree.js', import.meta.url), 'utf8');
    for (const c of codes) assert.equal(src.split(`'${c}'`).length - 1, 1, `${c} literal once`);
  });

  test('E12-T04: leaf topic/area/ask/pre are valid and the tree never asks what it answered', () => {
    const topics = new Set(TOPICS.map((t) => t.key));
    for (const l of allLeaves()) {
      if (l.exit) continue;
      assert.ok(l.topic === null || topics.has(l.topic), `${l.path} topic ${l.topic}`);
      assert.ok(l.area === null || AREA_CODES.includes(l.area), `${l.path} area ${l.area}`);
      assert.ok(l.ask.length <= 3, l.path);
      for (const id of l.ask) {
        assert.ok(QUESTIONS[id] || TREE_QUESTIONS[id], `${l.path} ask ${id}`);
        assert.ok(QUESTION_TAGS[id], `${id} tagged`);
        assert.ok(TREE_QUESTIONS[id] || PAID_QUESTIONS[id], `${id} has paid wording`);
        assert.ok(!Object.hasOwn(l.pre, id), `${l.path}: ${id} pre-answered and asked`);
      }
      for (const [qid, v] of Object.entries(l.pre)) assert.ok(QUESTIONS[qid].answers.some((a) => a.value === v), `${qid}=${v}`);
      assert.ok(l.ph === null || PLACEHOLDERS[l.ph], `${l.path} ph`);
      assert.ok(l.lead || l.ph, `${l.path} has a story placeholder`);
      assert.ok(l.docs_sub || l.lead, `${l.path} docs sub-line`);
    }
    for (const [id, q] of Object.entries(PAID_QUESTIONS)) assert.equal(q.a.length, QUESTIONS[id].answers.length, id);
    assert.deepEqual(Object.keys(PAID_QUESTIONS).sort(), Object.keys(QUESTIONS).sort());
  });

  test('E12-T05: TOPIC_TO_PATH covers the 8 topics and legacy aliases; AREA_TO_PATH every legal area; all resolve', () => {
    for (const t of TOPICS) assert.ok(TOPIC_TO_PATH[t.key], t.key);
    for (const alias of Object.keys(ALIASES)) assert.ok(TOPIC_TO_PATH[topicByKey(alias).key], alias);
    for (const a of LEGAL_AREAS) assert.ok(AREA_TO_PATH[a.code], a.code);
    for (const p of [...Object.values(TOPIC_TO_PATH), ...Object.values(AREA_TO_PATH)]) assert.ok(resolvePath(p), p);
    assert.equal(resolvePath(TOPIC_TO_PATH.rent).leaf, false, 'rent opens the property page (old or new rent)');
    assert.deepEqual(RETIRED, {});
  });

  test('E12-T06: resolvePath: leaf, node, exit; rejects malformed input', () => {
    assert.deepEqual(
      (({ path, leaf, exit, depth }) => ({ path, leaf, exit, depth }))(resolvePath('consultation/family/divorce')),
      { path: 'consultation/family/divorce', leaf: true, exit: false, depth: 3 },
    );
    assert.equal(resolvePath('consultation').leaf, false);
    assert.equal(resolvePath('consultation/other').leaf, true);
    assert.equal(resolvePath('litigation/paper').leaf, true);
    assert.equal(resolvePath('company/other').leaf, true);
    assert.equal(resolvePath('company/counsel/account').exit, true);
    for (const bad of ['', '/x', 'x//y', 'Consultation', '..', 'consultation/..', 'consultation/family/divorce/x', 'a'.repeat(81), 'consultation/', '/consultation', 'consultation/family/nope', 'nope', null, undefined, 7, {}, ['consultation']]) {
      assert.equal(resolvePath(bad), null, String(bad));
    }
  });

  test('E12-T07: 69 WhatsApp sentences, unique after normalisation, parse back; v11 sentences and PAID_GENERIC', () => {
    const intake = allLeaves().filter((l) => !l.exit);
    const seen = new Map();
    for (const l of intake) {
      const s = prefillFor(l.path);
      assert.ok(s.startsWith(LINES[l.line].head) && s.endsWith('.'), s);
      const k = N(s);
      assert.ok(!seen.has(k), `dup ${s}`);
      seen.set(k, l.path);
      assert.deepEqual(pathFromPrefill(s), { path: l.path, rest: '' });
      assert.deepEqual(pathFromPrefill(`${s}\nوالباقي قصة`), { path: l.path, rest: 'والباقي قصة' });
    }
    assert.equal(seen.size, 69);
    assert.equal(prefillFor('consultation/family/alimony'), 'مرحبًا، أرغب في حجز استشارة قانونية بخصوص النفقة.');
    assert.equal(prefillFor('consultation/family/alimony'), paidWaPrefill('alimony'), 'byte-equal to the v11 sentence');
    assert.equal(prefillFor('litigation/defend/family'), 'مرحبًا، أحتاج محاميًا في قضية بخصوص الرد على دعوى مرفوعة، أسرة وميراث.');
    assert.equal(prefillFor('litigation/paper'), 'مرحبًا، أحتاج محاميًا في قضية بخصوص ورقة من المحكمة أو القسم.');
    assert.equal(prefillFor('company/new/llc'), 'مرحبًا، أرغب في خدمة قانونية لشركة بخصوص تأسيس شركة جديدة، ذات مسؤولية محدودة.');
    assert.equal(prefillFor('company/contracts/trademark'), 'مرحبًا، أرغب في خدمة قانونية لشركة بخصوص علامة تجارية.');
    assert.equal(prefillFor('company/counsel/account'), null, 'the exit has no sentence');
    assert.equal(LINES.consultation.head, 'مرحبًا، أرغب في حجز استشارة قانونية');
    // v11: جملة الموضوع ما زالت تُفهم كما هي (الترتيب في segments.tagOf: الشجرة أولًا)
    for (const k of Object.keys(PAID_TOPICS)) assert.equal(paidPrefillOf(paidWaPrefill(k)).topic, PAID_TOPICS[k].wa_phrase ? k : null);
    // الجملة العامة: «أفراد وشركات» بلا مسار (لا تطابق جملة ورقة ولا جملة موضوع v11)
    assert.equal(PAID_GENERIC, 'مرحبًا، أرغب في التواصل بخصوص خدمة قانونية.');
    assert.equal(pathFromPrefill(PAID_GENERIC), null);
    assert.equal(paidPrefillOf(PAID_GENERIC), null);
    assert.equal(pathFromPrefill('مرحبا عايز محامي'), null);
  });

  test('E12-T08: firm voice in every tree string (no dash, no «!», no charity words, no feminine imperative)', () => {
    for (const s of treeStrings()) {
      assert.ok(!DASH.test(s), `dash: ${s}`);
      assert.ok(!/!/.test(s), `exclamation: ${s}`);
      assert.ok(!BANNED.test(s), `banned: ${s}`);
      assert.ok(!FEM.test(s), `feminine: ${s}`);
    }
    // صف «خيري» المستعاد هو الاستثناء الوحيد (يظهر فقط حين تُعاد الخدمة الخيرية)
    assert.deepEqual(TREE.restored, { tag: 'T-81', text: 'تبحثون عن مساعدة قانونية مجانية؟', go: 'خيري', href: '/khayri' });
  });

  test('r2 data (L12-50…L12-55): hints on every first-page row, new rows, label edits, rewritten paid questions', () => {
    assert.deepEqual(
      pageOf('').options.map((o) => o.hint),
      ['أسرة، ميراث، إيجار، عمل، عقود', 'أو الرد على دعوى مرفوعة عليكم', 'ومستشار قانوني لشركتكم'],
    );
    assert.equal(LINES.company.hint_b2b_off, 'وتعديلها، وعقودها وتراخيصها');
    const lit = pageOf('litigation');
    assert.equal(lit.q, 'ما وضع القضية؟');
    assert.equal(lit.qtag, 'T-41');
    assert.deepEqual(
      lit.options.map((o) => [o.tag, o.label, o.hint]),
      [
        ['T-42', 'رفع دعوى جديدة', null],
        ['T-43', 'الرد على دعوى مرفوعة', 'وصلكم إعلان أو رُفعت عليكم دعوى'],
        ['T-44', 'قضية أمام المحكمة الآن', null],
        ['T-45', 'صدر حكم', 'تنفيذه أو الطعن عليه'],
        ['T-83', 'ورقة من المحكمة أو القسم', 'ولا تعرفون ما المطلوب'],
      ],
    );
    assert.equal(lit.options[4].href, '/intake?path=litigation/paper');
    const paper = leafOf('litigation/paper');
    assert.deepEqual([paper.topic, paper.area, paper.ask, paper.urgent_unknown, paper.ph, paper.docs_sub], [null, null, ['case.next'], ['case.next'], 'paper', 'صوّروا الورقة كما هي.']);
    assert.equal(PLACEHOLDERS.paper, 'ما الورقة التي وصلتكم، ومتى وصلت؟');
    const co = pageOf('company');
    assert.equal(co.options.length, 5);
    assert.deepEqual(co.options.at(-1), {
      id: 'other',
      path: 'company/other',
      label: 'موضوع آخر للشركة',
      hint: 'عمال، ضرائب، تحصيل مستحقات، وغيرها',
      tag: 'T-82',
      href: '/intake?path=company/other',
      kind: 'leaf',
      wa: null,
      wa_desc: 'نزاع عمالي، ضرائب، تحصيل مستحقات، أو غير ذلك',
    });
    const other = leafOf('company/other');
    assert.deepEqual([other.area, other.ask, other.ph, other.company_name], ['COM', [], 'co_contracts', true]);
    assert.equal(pageOf('consultation/property').options.find((o) => o.id === 'dispute').label, 'نزاع على ملكية أو وضع يد');
    assert.equal(pageOf('consultation/government').options.find((o) => o.id === 'other').label, 'جهة حكومية أخرى');
    assert.deepEqual(flowForPath('consultation/family/alimony'), ['alimony.for', 'children']);
    assert.deepEqual(flowForPath('consultation/property/old-rent'), ['rent.side']);
    assert.deepEqual(flowForPath('consultation/property/new-rent'), ['rent.side']);
    assert.deepEqual(flowForPath('litigation/judgment/civil'), ['judgment.when']);
    assert.deepEqual(flowForPath('litigation/defend/family'), ['case.next']);
    assert.deepEqual(flowForPath('litigation/ongoing/labour'), ['case.next']);
    assert.deepEqual(flowForPath('litigation/new/family'), []);
    assert.deepEqual(TREE_QUESTIONS['judgment.when'].answers.map((a) => [a.value, a.label, a.staff, !!a.urgent]), [
      ['recent', 'خلال آخر أسبوعين', 'خلال 14 يومًا', true],
      ['mid', 'من أسبوعين إلى 40 يومًا', 'من 15 إلى 40 يومًا', true],
      ['old', 'منذ أكثر من 40 يومًا', 'أكثر من 40 يومًا', false],
    ]);
    assert.equal(TREE_QUESTIONS['judgment.when'].h1, 'متى صدر الحكم؟');
    assert.equal(TREE_QUESTIONS['alimony.for'].h1, 'النفقة لمن؟');
    assert.deepEqual(TREE_QUESTIONS['alimony.for'].answers.map((a) => a.label), ['للزوجة', 'للأبناء', 'للزوجة والأبناء', 'مطلوب منّا دفعها']);
    assert.equal(TREE_QUESTIONS['rent.side'].h1, 'أنتم المالك أم المستأجر؟');
    assert.deepEqual(TREE_QUESTIONS['rent.side'].answers.map((a) => a.label), ['المالك', 'المستأجر']);
    assert.equal(TREE_QUESTIONS['case.next'].answers.find((a) => a.value === 'soon').urgent, true);
    assert.deepEqual(PAID_EXTRA_ANSWERS, { children: [['none', 'لا يوجد', 'لا يوجد']] });
    assert.deepEqual(DOCS_SUB, { consultation: 'عقد أو إيصال أو أي ورقة تخص الموضوع.', litigation: 'صحيفة الدعوى أو الإعلان أو الحكم.', company: 'السجل التجاري أو العقد أو الترخيص.' });
    assert.deepEqual(PATHWAY_SOURCES, { website: 'من الموقع', wa_menu: 'من قائمة واتساب', wa_tag: 'من رسالة واتساب الجاهزة', staff: 'عدّله الفريق' });
  });

  test('LINES come from the tree (one source of words, L12-82)', () => {
    assert.deepEqual(Object.keys(LINES), ['consultation', 'litigation', 'company']);
    for (const n of TREE.children) {
      assert.equal(LINES[n.id].label, n.label);
      assert.equal(LINES[n.id].tag, n.tag);
    }
    assert.deepEqual(
      Object.values(LINES).map((l) => [l.label, l.staff, l.chip]),
      [
        ['استشارة', 'استشارة', 'استشارة'],
        ['رفع دعوى قضائية', 'دعوى قضائية', 'دعوى'],
        ['تأسيس شركات', 'شركات', 'شركات'],
      ],
    );
    assert.ok(Object.isFrozen(TREE) && Object.isFrozen(TREE.children[0]) && Object.isFrozen(LINES.consultation));
  });

  test('pageOf: trail, back, options and data-depth for L2/L3 pages', () => {
    const p = pageOf('litigation/defend');
    assert.equal(p.depth, 3);
    assert.equal(p.q, 'ما نوع القضية؟');
    assert.equal(p.qtag, 'T-46');
    assert.deepEqual(p.trail, [
      { id: 'litigation', label: 'رفع دعوى قضائية', tag: 'T-40' },
      { id: 'defend', label: 'الرد على دعوى مرفوعة', tag: 'T-43' },
    ]);
    assert.equal(p.back, '/start/litigation');
    assert.deepEqual(p.options.map((o) => o.href), ['family', 'property', 'labour', 'civil', 'criminal', 'other'].map((x) => `/intake?path=litigation/defend/${x}`));
    assert.deepEqual(p.options.map((o) => o.tag), pageOf('litigation/new').options.map((o) => o.tag), 'shared list: same codes on the four pages');
    const c = pageOf('consultation');
    assert.equal(c.depth, 2);
    assert.equal(c.back, '/');
    assert.equal(c.options.at(-1).href, '/intake?path=consultation/other');
    assert.equal(pageOf('').depth, 1);
    assert.equal(pageOf('').back, null);
    assert.equal(pageOf('consultation/family/divorce'), null, 'a leaf is not a page');
    assert.equal(pageOf('nope'), null);
    const counsel = pageOf('company/counsel');
    assert.deepEqual(counsel.options.map((o) => [o.label, o.href]), [
      ['نعم، الدخول إلى بوابة الشركات', '/company'],
      ['لا، نريد عرضًا', '/intake?path=company/counsel/proposal'],
    ]);
  });

  test('E12-T56 (data, L12-63): B2B off hides counsel and swaps the hint; portal closed skips the account question', () => {
    assert.equal(pageOf('', CTX_OFF).options[2].hint, 'وتعديلها، وعقودها وتراخيصها');
    const off = pageOf('company', CTX_OFF);
    assert.equal(off.options.length, 4);
    assert.ok(!off.options.some((o) => o.tag === 'T-63'));
    assert.equal(pageOf('company/counsel', CTX_OFF), null);
    assert.equal(resolvePath('company/counsel', CTX_OFF), null);
    assert.equal(resolvePath('company/counsel/proposal', CTX_OFF), null);
    assert.equal(bmPathFor('company/counsel/proposal', CTX_OFF), null);
    assert.equal(allPages(CTX_OFF).length, 16);
    const closed = pageOf('company', CTX_CLOSED);
    assert.equal(closed.options.find((o) => o.tag === 'T-63').href, '/intake?path=company/counsel/proposal');
    assert.equal(pageOf('company/counsel', CTX_CLOSED), null);
    assert.equal(resolvePath('company/counsel', CTX_CLOSED).path, 'company/counsel/proposal');
    assert.equal(resolvePath('company/counsel/account', CTX_CLOSED), null);
    assert.equal(bmPathFor('company/counsel/proposal', CTX_CLOSED).back, '/start/company');
    assert.equal(bmPathFor('company/counsel/proposal').back, '/start/company/counsel');
    assert.equal(rowFromText('company', '4', CTX_OFF), 'company/other', 'list numbers follow the visible rows');
    assert.equal(rowFromText('company', '4'), 'company/contracts');
  });

  test('E12-T57 (data) + bm-path budget: paid questions, «لا يوجد» first, rent.side only; ≤ 1,024 B for every leaf', () => {
    const j = bmPathFor('litigation/judgment/family');
    assert.deepEqual(j.ask.map((q) => q.id), ['judgment.when']);
    assert.deepEqual(j.ask[0].answers.at(-1), ['unknown', 'لا أعرف', 'I-138']);
    const a = bmPathFor('consultation/family/alimony');
    assert.deepEqual(a.ask.map((q) => [q.id, q.tag, q.h1]), [
      ['alimony.for', 'I-24', 'النفقة لمن؟'],
      ['children', 'I-18', 'كم عدد الأبناء أقل من 18 سنة؟'],
    ]);
    assert.deepEqual(a.ask[1].answers[0], ['none', 'لا يوجد', 'I-112']);
    assert.deepEqual(a.ask[1].answers.map((x) => x[0]), ['none', '1', '2', '3', '4', 'unknown']);
    const r = bmPathFor('consultation/property/old-rent');
    assert.deepEqual(r.ask.map((q) => q.id), ['rent.side']);
    assert.deepEqual(r.pre, { 'rent.home': 'rented_old' });
    const inh = bmPathFor('consultation/family/inheritance');
    assert.equal(inh.ask[1].sub, 'حكم من المحكمة يحدد الورثة');
    assert.deepEqual(inh.ask[0].answers.map((x) => x[1]), ['الزوج أو الزوجة', 'أحد الوالدين', 'ابن أو ابنة', 'شخص آخر', 'لا أعرف']);
    assert.equal(bmPathFor('consultation/government/pension').ask[0].answers[3][1], 'معاشي أو غير ذلك', 'E12-41 neutral wording');
    const d = bmPathFor('litigation/defend/family');
    assert.deepEqual(
      { path: d.path, line: d.line, trail: d.trail, tags: d.tags, back: d.back, ph: d.ph, wa: d.wa, name_prefix: d.name_prefix, docs_sub: d.docs_sub },
      {
        path: 'litigation/defend/family',
        line: 'litigation',
        trail: ['رفع دعوى قضائية', 'الرد على دعوى مرفوعة', 'أسرة وميراث'],
        tags: ['T-40', 'T-43', 'T-47'],
        back: '/start/litigation/defend',
        ph: 'case',
        wa: 'مرحبًا، أحتاج محاميًا في قضية بخصوص الرد على دعوى مرفوعة، أسرة وميراث.',
        name_prefix: 'أسرة وميراث',
        docs_sub: undefined,
      },
    );
    assert.equal(bmPathFor('litigation/paper').docs_sub, 'صوّروا الورقة كما هي.', 'docs_sub only when the leaf overrides the line');
    const lead = bmPathFor('company/counsel/proposal');
    assert.equal(lead.lead, true);
    assert.equal(lead.ph, null);
    assert.equal(bmPathFor('company/change/capital').company_name, true);
    assert.equal(bmPathFor('company/new/llc').company_name, undefined);
    assert.equal(bmPathFor('company/counsel/account'), null);
    assert.equal(bmPathFor('consultation'), null);
    for (const l of allLeaves()) {
      if (l.exit) continue;
      const b = bmPathFor(l.path);
      const bytes = Buffer.byteLength(JSON.stringify(b));
      assert.ok(bytes <= 1024, `${l.path}: ${bytes} B`);
      // لا يُسأل ما أجابته الشجرة، ولا سؤال خارج QUESTIONS ∪ TREE_QUESTIONS (E12-45)
      for (const q of b.ask) {
        assert.ok(!Object.hasOwn(b.pre || {}, q.id));
        assert.ok(QUESTIONS[q.id] || TREE_QUESTIONS[q.id]);
        assert.equal(q.answers.at(-1)[0], 'unknown');
        for (const [v, label, tag] of q.answers) {
          assert.ok(label, `${q.id}:${v}`);
          assert.equal(tag, ANSWER_TAGS[`${q.id}:${v}`]);
        }
      }
      for (const s of [b.ph && PLACEHOLDERS[b.ph], b.docs_sub, ...b.trail, ...b.ask.flatMap((q) => [q.h1, q.sub, ...q.answers.map((x) => x[1])])].filter(Boolean)) {
        assert.ok(!DASH.test(s) && !BANNED.test(s) && !FEM.test(s), s);
      }
    }
  });

  test('E12-T50 (data): every code a page or bm-path can render is listed by allTags()', () => {
    const listed = new Set(allTags().map((t) => t.tag));
    for (const p of allPages()) {
      assert.ok(listed.has(p.qtag), p.qtag);
      for (const o of p.options) assert.ok(listed.has(o.tag), o.tag);
    }
    for (const l of allLeaves()) {
      if (l.exit) continue;
      for (const q of bmPathFor(l.path).ask) {
        assert.ok(listed.has(q.tag));
        for (const a of q.answers) assert.ok(listed.has(a[2]), a[2]);
      }
    }
    const byCode = Object.fromEntries(allTags().map((t) => [t.tag, t]));
    assert.equal(byCode['T-01'].label, 'كيف نساعدكم؟');
    assert.equal(byCode['T-53'].label, 'تأسيس شركات');
    assert.equal(byCode['T-81'].kind, 'restored');
    assert.equal(byCode['I-23'].label, 'متى صدر الحكم؟');
    assert.equal(byCode['I-112'].label, 'لا يوجد');
  });

  test('E12-T24 (data, L12-52): isUrgent matrix', () => {
    const cases = [
      ['litigation/defend/family', { 'case.next': 'soon' }, true],
      ['litigation/ongoing/civil', { 'case.next': 'soon' }, true],
      ['litigation/paper', { 'case.next': 'soon' }, true],
      ['litigation/defend/family', { 'case.next': 'unknown' }, true],
      ['litigation/paper', { 'case.next': 'unknown' }, true],
      ['litigation/ongoing/civil', { 'case.next': 'unknown' }, false],
      ['litigation/defend/family', { 'case.next': 'later' }, false],
      ['litigation/defend/family', { 'case.next': 'none' }, false],
      ['litigation/judgment/civil', { 'judgment.when': 'recent' }, true],
      ['litigation/judgment/civil', { 'judgment.when': 'mid' }, true],
      ['litigation/judgment/civil', { 'judgment.when': 'unknown' }, true],
      ['litigation/judgment/civil', { 'judgment.when': 'old' }, false],
      ['litigation/judgment/civil', { 'case.next': 'soon' }, false],
      ['litigation/new/family', { 'case.next': 'soon' }, false],
      ['consultation/family/alimony', { 'alimony.for': 'unknown', children: 'unknown' }, false],
      ['litigation/defend/family', {}, false],
      ['litigation/defend/family', null, false],
      ['nope', { 'case.next': 'soon' }, false],
    ];
    for (const [p, a, want] of cases) assert.equal(isUrgent(p, a), want, `${p} ${JSON.stringify(a)}`);
  });

  test('sanitizePathAnswers: ask ids only, known values or unknown, pre merged; staff lines in staff wording', () => {
    assert.deepEqual(sanitizePathAnswers('consultation/property/old-rent', { 'rent.side': 'tenant', 'rent.evict': 'yes', 'rent.home': 'owned', x: 1 }), { 'rent.side': 'tenant', 'rent.home': 'rented_old' });
    assert.deepEqual(sanitizePathAnswers('consultation/family/alimony', { 'alimony.for': 'both', children: 'none' }), { 'alimony.for': 'both', children: 'none' });
    assert.deepEqual(sanitizePathAnswers('consultation/family/custody', { children: 'none', 'custody.issue': 'bogus' }), { children: 'none' });
    assert.deepEqual(sanitizePathAnswers('litigation/judgment/family', { 'judgment.when': { x: 1 }, 'case.next': 'soon' }), {});
    assert.deepEqual(sanitizePathAnswers('nope', { a: 1 }), {});
    assert.deepEqual(sanitizePathAnswers('consultation/family/divorce', ['x']), {});
    assert.deepEqual(staffAnswerLines('litigation/judgment/family', { 'judgment.when': 'mid' }), ['تاريخ صدور الحكم: من 15 إلى 40 يومًا']);
    assert.deepEqual(staffAnswerLines('consultation/family/alimony', { 'alimony.for': 'both', children: 'none' }), ['النفقة مطلوبة لـ: الزوجة والأبناء', 'عدد الأبناء أقل من 18 سنة: لا يوجد']);
    assert.deepEqual(staffAnswerLines('litigation/defend/family', { 'case.next': 'unknown' }), ['أقرب جلسة أو موعد: لا يعرف']);
  });

  test('trail and staff wording: «دعوى › الرد على دعوى مرفوعة › أسرة وميراث»; company proposal in staff words', () => {
    assert.deepEqual(trail('litigation/defend/family'), ['رفع دعوى قضائية', 'الرد على دعوى مرفوعة', 'أسرة وميراث']);
    assert.deepEqual(trail('litigation/defend/family', { staff: true }), ['دعوى', 'الرد على دعوى مرفوعة', 'أسرة وميراث']);
    assert.deepEqual(trail('consultation/family/inheritance', { staff: true }), ['استشارة', 'الأسرة والميراث', 'الميراث']);
    assert.deepEqual(trail('company/counsel/proposal', { staff: true }), ['شركات', 'مستشار قانوني', 'طلب عرض']);
    assert.deepEqual(trail('litigation/paper', { staff: true }), ['دعوى', 'ورقة من المحكمة أو القسم']);
    assert.deepEqual(trail('litigation'), ['رفع دعوى قضائية']);
    assert.deepEqual(trail('nope'), []);
  });

  test('E12-84: typed answers to the WhatsApp lines menu and its lists', () => {
    for (const [t, want] of [
      ['1', 'consultation'],
      ['١', 'consultation'],
      ['استشارة', 'consultation'],
      ['2', 'litigation'],
      ['٢', 'litigation'],
      ['دعوى', 'litigation'],
      ['قضية', 'litigation'],
      ['رفع دعوى قضائية', 'litigation'],
      ['محامي', 'litigation'],
      ['3', 'company'],
      ['٣', 'company'],
      ['شركة', 'company'],
      ['تأسيس شركات.', 'company'],
      ['تاسيس', 'company'],
      ['عايزة أعرف نصيبي في الورث من جوزي', null],
      ['4', null],
      ['', null],
    ]) {
      assert.equal(lineFromText(t), want, t);
    }
    assert.equal(rowFromText('litigation', '2'), 'litigation/defend');
    assert.equal(rowFromText('litigation', 'الرد على دعوى مرفوعة'), 'litigation/defend');
    assert.equal(rowFromText('litigation', '٥'), 'litigation/paper');
    assert.equal(rowFromText('company', 'عقود وتراخيص وعلامات'), 'company/contracts');
    assert.equal(rowFromText('consultation', 'المعاش والجهات الحكوميه'), 'consultation/government');
    assert.equal(rowFromText('consultation', '9'), null);
    assert.equal(rowFromText('consultation', 'قصة طويلة لا تطابق أي صف في القائمة'), null);
    assert.equal(rowFromText('', '1'), null);
  });

  test('E12-T60 (L12-86): pagesAr agreement', () => {
    assert.deepEqual([1, 2, 3, 10, 11, 25].map(pagesAr), ['صفحة واحدة', 'صفحتان', '3 صفحات', '10 صفحات', '11 صفحة', '25 صفحة']);
    assert.deepEqual([100, 101, 102, 103, 110, 111].map(pagesAr), ['100 صفحة', '101 صفحة', '102 صفحة', '103 صفحات', '110 صفحات', '111 صفحة']);
  });

  test('entry-tree.js stays pure: imports topics.js only, no DOM', () => {
    const src = fs.readFileSync(new URL('../public/assets/js/public/entry-tree.js', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
    assert.deepEqual(imports, ['./topics.js']);
    assert.ok(!/\b(document|window|localStorage|fetch)\b/.test(src.replace(/\/\/.*$/gm, '')));
  });
});

describe('v12 entry EN-0: settings, PAID_GENERIC, schema 87, app.pathways', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => {
    await t.close();
  });

  const paidIntake = async (phone, extra = {}) => {
    const r = await t.client().post('/api/public/intake', { consent: true, phone, description: 'موضوع قانوني للاختبار يكفي للوصف', segment: 'paid', ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.body.reference);
  };

  test('settings block <settings:v12-entry> (§5.4) with its defaults; site_gate_enabled kept and marked retired', () => {
    assert.equal(DEFAULT_SETTINGS.charity_public, false);
    assert.equal(DEFAULT_SETTINGS.firm_legal_name, '');
    assert.equal(DEFAULT_SETTINGS.charity_archived_landing, 'notice');
    assert.equal(DEFAULT_SETTINGS.firm_city, '');
    assert.equal(DEFAULT_SETTINGS.firm_founded, '');
    assert.deepEqual(DEFAULT_SETTINGS.firm_partners, []);
    assert.equal(DEFAULT_SETTINGS.site_gate_enabled, true);
    const src = fs.readFileSync(new URL('../src/constants.js', import.meta.url), 'utf8');
    assert.match(src, /\/\/ <settings:v12-entry>/);
    assert.match(src, /site_gate_enabled: true, \/\/ متقاعد في 12\.0، لا يُقرأ/);
    assert.equal(t.app.settings.get('charity_public'), false);
  });

  test('§5.4 validation of the v12-entry keys through PATCH /api/admin/settings (admin only)', async () => {
    const admin = await t.login('admin');
    let r = await admin.patch('/api/admin/settings', {
      firm_legal_name: '  إمام   وشركاه ',
      firm_city: 'مدينة 6 أكتوبر',
      firm_founded: '١٩٩٨',
      firm_partners: [{ name: 'أحمد إمام', title: 'محامٍ بالنقض', photo: 'x.jpg' }, { name: 'سارة <b>علي</b>' }].slice(0, 1),
      charity_archived_landing: 'redirect',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(t.app.settings.get('firm_legal_name'), 'إمام وشركاه');
    assert.equal(t.app.settings.get('firm_city'), 'مدينة 6 أكتوبر');
    assert.equal(t.app.settings.get('firm_founded'), '1998');
    assert.deepEqual(t.app.settings.get('firm_partners'), [{ name: 'أحمد إمام', title: 'محامٍ بالنقض' }], 'unknown keys dropped');
    assert.equal(t.app.settings.get('charity_archived_landing'), 'redirect');
    for (const [k, val] of [
      ['firm_legal_name', 'https://emam.example'],
      ['firm_legal_name', '0123456789'],
      ['firm_legal_name', 'ا'.repeat(81)],
      ['firm_city', 'www.cairo.eg'],
      ['firm_founded', '1850'],
      ['firm_founded', String(new Date().getFullYear() + 1)],
      ['firm_founded', '98'],
      ['firm_partners', Array.from({ length: 9 }, (_, i) => ({ name: `شريك رقم ${i + 1}` }))],
      ['firm_partners', [{ name: 'أ' }]],
      ['firm_partners', [{ name: '<script>' }]],
      ['firm_partners', [{ name: 'أحمد', title: 'emam.com/team' }]],
      ['firm_partners', [{ name: '٠١٠١٢٣٤٥٦٧٨' }]],
      ['firm_partners', { name: 'أحمد' }],
      ['charity_archived_landing', 'home'],
    ]) {
      r = await admin.patch('/api/admin/settings', { [k]: val });
      assert.equal(r.status, 400, `${k}=${JSON.stringify(val)}`);
      assert.ok(r.body.details?.fields?.[k] || r.body.fields?.[k] || r.body.error, k);
    }
    assert.equal(t.app.settings.get('firm_founded'), '1998', 'nothing saved on a refused value');
    r = await admin.patch('/api/admin/settings', { firm_legal_name: '', firm_city: '', firm_founded: '', firm_partners: [], charity_archived_landing: 'notice', charity_public: false });
    assert.equal(r.status, 200);
    assert.deepEqual(t.app.settings.get('firm_partners'), []);
    const u = await admin.post('/api/admin/users', { role: 'case_manager', username: 'cm-entry', name: 'مدير حالات', password: 'Manager@2026' });
    assert.equal(u.status, 201, JSON.stringify(u.body));
    const manager = await t.login('cm-entry', 'Manager@2026');
    assert.equal((await manager.patch('/api/admin/settings', { firm_legal_name: 'مكتب', charity_public: true })).status, 403);
    assert.equal(t.app.settings.get('charity_public'), false);
  });

  test('schema 87: columns, index and entry_tree_daily on a fresh DB', () => {
    const cols = t.app.db.all('PRAGMA table_info(intakes)').map((r) => r.name);
    for (const c of ['service_line', 'pathway', 'pathway_source', 'pathway_set_at', 'lines_menu_sent_at']) assert.ok(cols.includes(c), c);
    assert.ok(t.app.db.get("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_intakes_service_line'"));
    assert.deepEqual(
      t.app.db.all('PRAGMA table_info(entry_tree_daily)').map((r) => r.name),
      ['day', 'node', 'views'],
    );
  });

  test('E12-T48 (schema): 87 is additive and idempotent on an existing DB (old rows NULL, nothing else changed)', () => {
    const file = path.join(t.dir, 'old.db');
    let db = new Db(file);
    db.raw.exec('DROP INDEX IF EXISTS idx_intakes_service_line; DROP TABLE IF EXISTS entry_tree_daily;');
    for (const c of ['service_line', 'pathway', 'pathway_source', 'pathway_set_at', 'lines_menu_sent_at']) db.raw.exec(`ALTER TABLE intakes DROP COLUMN ${c}`);
    const now = new Date().toISOString();
    db.insert('intakes', { code: 'REQ-OLD-1', first_channel: 'website', status: 'new', created_at: now, updated_at: now });
    const before = db.get('SELECT COUNT(*) AS n, MAX(updated_at) AS u FROM intakes');
    db.close();
    for (let i = 0; i < 2; i++) {
      db = new Db(file);
      const row = db.get("SELECT * FROM intakes WHERE code = 'REQ-OLD-1'");
      assert.equal(row.service_line, null);
      assert.equal(row.pathway, null);
      assert.equal(row.lines_menu_sent_at, null);
      assert.deepEqual(db.get('SELECT COUNT(*) AS n, MAX(updated_at) AS u FROM intakes'), before);
      assert.equal(db.value('SELECT COUNT(*) FROM entry_tree_daily'), 0);
      assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
      db.close();
    }
  });

  test('bm-public gains charity and voice (L12-45), both false by default', async () => {
    const pub = async () => {
      const r = await t.client().get('/services');
      assert.equal(r.status, 200);
      const m = /<script type="application\/json" id="bm-public">([^<]*)<\/script>/.exec(r.body);
      assert.ok(m, 'bm-public present');
      return JSON.parse(m[1]);
    };
    let b = await pub();
    assert.equal(b.charity, false);
    assert.equal(b.voice, false);
    t.app.settings.set('charity_public', true);
    try {
      b = await pub();
      assert.equal(b.charity, true);
    } finally {
      t.app.settings.set('charity_public', false);
    }
  });

  test('app.pathways is wired (H-E1) and treeCtx follows the B2B setting', () => {
    assert.equal(typeof t.app.pathways.set, 'function');
    assert.deepEqual(t.app.pathways.treeCtx(), { b2b: true, portal: !!t.app.site.companyPortalOpen() });
    t.app.settings.set('b2b_enabled', false);
    try {
      assert.deepEqual(t.app.pathways.treeCtx(), { b2b: false, portal: false });
    } finally {
      t.app.settings.set('b2b_enabled', true);
    }
    assert.ok(t.app.jobs.list().some((j) => j.name === 'entry_tree.purge'));
  });

  test('L12-76: classify is the only parser; canonical targets are internal (crawl + fuzz)', () => {
    const P = t.app.pathways;
    const c = (raw, ctx) => P.classify(raw, ctx);
    assert.deepEqual(c('/'), { kind: 'page', canonical: '/', path: '' });
    assert.deepEqual(c('/start'), { kind: 'root', canonical: '/', path: '' });
    assert.deepEqual(c('/start/'), { kind: 'root', canonical: '/', path: '' });
    assert.deepEqual(c('/start/consultation'), { kind: 'page', canonical: '/start/consultation', path: 'consultation' });
    assert.deepEqual(c('/start/consultation/'), { kind: 'page', canonical: '/start/consultation', path: 'consultation' });
    assert.deepEqual(c('/start/consultation/other'), { kind: 'leaf', canonical: '/intake?path=consultation/other', path: 'consultation/other' });
    assert.deepEqual(c('/start/litigation/defend/family'), { kind: 'leaf', canonical: '/intake?path=litigation/defend/family', path: 'litigation/defend/family' });
    assert.deepEqual(c('/start/company/counsel/account'), { kind: 'exit', canonical: '/company', path: 'company/counsel/account' });
    assert.deepEqual(c('/start/consultation/foo'), { kind: 'ancestor', canonical: '/start/consultation', path: 'consultation' });
    assert.deepEqual(c('/start/foo'), { kind: 'ancestor', canonical: '/', path: '' });
    assert.deepEqual(c('/start/consultation/family/divorce/x'), { kind: 'ancestor', canonical: '/intake?path=consultation/family/divorce', path: 'consultation/family/divorce' });
    // ?path= المجردة (serveIntake)
    assert.deepEqual(c('consultation/family/divorce'), { kind: 'leaf', canonical: '/intake?path=consultation/family/divorce', path: 'consultation/family/divorce' });
    assert.deepEqual(c('litigation'), { kind: 'page', canonical: '/start/litigation', path: 'litigation' });
    assert.deepEqual(c(''), { kind: 'root', canonical: '/', path: '' });
    assert.deepEqual(c(undefined), { kind: 'root', canonical: '/', path: '' });
    // L12-63
    assert.deepEqual(c('/start/company/counsel', CTX_OFF), { kind: 'ancestor', canonical: '/start/company', path: 'company' });
    assert.deepEqual(c('/start/company/counsel/proposal', CTX_OFF), { kind: 'ancestor', canonical: '/start/company', path: 'company' });
    assert.deepEqual(c('/start/company/counsel', CTX_CLOSED), { kind: 'leaf', canonical: '/intake?path=company/counsel/proposal', path: 'company/counsel/proposal' });
    assert.deepEqual(c('company/counsel/proposal', CTX_CLOSED), { kind: 'leaf', canonical: '/intake?path=company/counsel/proposal', path: 'company/counsel/proposal' });
    // كل صفحة وورقة ومخرج: canonical يُحل إلى نفسه
    for (const p of allPages()) {
      const k = c(p.path ? `/start/${p.path}` : '/');
      assert.equal(k.kind, 'page', p.path);
      assert.equal(k.canonical, p.path ? `/start/${p.path}` : '/');
    }
    for (const l of allLeaves()) {
      const k = c(`/start/${l.path}`);
      assert.equal(k.kind, l.exit ? 'exit' : 'leaf', l.path);
      assert.equal(c(l.path).canonical, k.canonical);
    }
    const fuzz = ['/start//evil.com', '/start/%5C%5Cevil.com', '/start/x/..%2F..%2F', `/start/${'a'.repeat(200)}`, '/start/استشارة', '/start/%D8%A7', '/start/%00', '/start/consultation/%00', '/start/consultation//family', '/start/CONSULTATION', '/start/a/b/c/d/e/f/g/h/i/j', '//evil.com', '/\\evil.com', 'consultation/family/divorce?x=1', 'https://evil.com', '/start/consultation/family/divorce/extra/more'];
    for (const raw of fuzz) {
      const k = c(raw);
      assert.ok(['ancestor', 'root', 'page', 'leaf'].includes(k.kind), raw);
      assert.match(k.canonical, /^\/(?![/\\])/, `${raw} → ${k.canonical}`);
      assert.ok(k.canonical === '/' || k.canonical.startsWith('/start/') || k.canonical.startsWith('/intake?path='), `${raw} → ${k.canonical}`);
      // الوجهة نفسها تُحل في خطوة واحدة (سلسلة ≤ 2)
      const next = k.canonical.startsWith('/intake?path=') ? c(k.canonical.slice(13)) : c(k.canonical);
      assert.equal(next.canonical, k.canonical, raw);
    }
  });

  test('E12-T55: set (website) writes once with the snapshot; exit/invalid → null; charity intake untouched unless staff', async () => {
    const P = t.app.pathways;
    const i1 = await paidIntake('01011112201');
    assert.equal(i1.segment, 'paid');
    assert.equal(P.set(i1.id, 'company/counsel/account', { source: 'website', onlyIfEmpty: true }), null, 'exit');
    assert.equal(P.set(i1.id, 'nope/x', { source: 'website', onlyIfEmpty: true }), null, 'invalid');
    assert.equal(P.set(i1.id, '../x', { source: 'website', onlyIfEmpty: true }), null);
    const r = P.set(i1.id, 'litigation/defend/family', { source: 'website', onlyIfEmpty: true });
    assert.equal(r.changed, true);
    assert.equal(r.to, 'litigation/defend/family');
    const row = t.app.db.get('SELECT * FROM intakes WHERE id = ?', i1.id);
    assert.equal(row.service_line, 'litigation');
    assert.equal(row.pathway, 'litigation/defend/family');
    assert.equal(row.pathway_source, 'website');
    assert.ok(row.pathway_set_at);
    assert.deepEqual(JSON.parse(row.form_answers).pathway, { v: 1, path: 'litigation/defend/family', labels: ['دعوى', 'الرد على دعوى مرفوعة', 'أسرة وميراث'] });
    const act = t.app.db.get("SELECT * FROM activity WHERE intake_id = ? AND type = 'intake.pathway_set'", i1.id);
    assert.equal(act.summary, 'اختار/ت «رفع دعوى قضائية › الرد على دعوى مرفوعة › أسرة وميراث» من الموقع');
    assert.equal(act.actor_kind, 'client');
    // مرة واحدة فقط (onlyIfEmpty)، ولا قائمة واتساب فوق قيمة الموقع
    assert.equal(P.set(i1.id, 'consultation/other', { source: 'website', onlyIfEmpty: true }), null);
    assert.equal(P.set(i1.id, 'litigation/defend', { source: 'wa_menu' }), null);
    assert.equal(t.app.db.get('SELECT pathway FROM intakes WHERE id = ?', i1.id).pathway, 'litigation/defend/family');
    // «خيري»: لا شيء إلا بيد الفريق
    const ch = await t.client().post('/api/public/intake', { consent: true, phone: '01011112202', description: 'مشكلة في الورث محتاجة مساعدة', segment: 'charity' });
    const charity = t.app.db.get('SELECT * FROM intakes WHERE code = ?', ch.body.reference);
    assert.equal(charity.segment, 'charity');
    for (const source of ['website', 'wa_menu', 'wa_tag']) assert.equal(P.set(charity.id, 'consultation/family/divorce', { source }), null, source);
    assert.equal(t.app.db.get('SELECT pathway FROM intakes WHERE id = ?', charity.id).pathway, null);
    const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    const s = P.set(charity.id, 'consultation/family/divorce', { source: 'staff', actor: admin, reason: 'من المكالمة' });
    assert.equal(s.changed, true);
    assert.equal(P.storyLine(t.app.db.get('SELECT * FROM intakes WHERE id = ?', charity.id)), null, 'never an AI context line on a charity request');
    assert.throws(() => P.set(i1.id, 'consultation/other', { source: 'robot' }), /unknown source/);
  });

  test('set (staff): change and clear with activity + audit; wa_menu never overwrites staff; block/rowFields/storyLine', async () => {
    const P = t.app.pathways;
    const admin = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
    const i = await paidIntake('01011112203');
    assert.equal(P.block(i), null);
    assert.deepEqual(P.rowFields(i), { service_line: null, pathway: null, pathway_labels: null });
    // قائمة واتساب: الخط ثم الصف
    assert.equal(P.set(i.id, 'litigation', { source: 'wa_menu' }).to, 'litigation');
    assert.equal(P.set(i.id, 'litigation/defend', { source: 'wa_menu' }).to, 'litigation/defend');
    let row = t.app.db.get('SELECT * FROM intakes WHERE id = ?', i.id);
    assert.equal(row.form_answers && JSON.parse(row.form_answers).pathway, undefined, 'snapshot only for the website');
    assert.deepEqual(P.block(row), {
      path: 'litigation/defend',
      line: 'litigation',
      labels: ['رفع دعوى قضائية', 'الرد على دعوى مرفوعة'],
      staff_labels: ['دعوى', 'الرد على دعوى مرفوعة'],
      tags: ['T-40', 'T-43'],
      source: 'wa_menu',
      source_label: 'من قائمة واتساب',
      set_at: row.pathway_set_at,
    });
    // الفريق يغيّر
    const ctxReq = { ip: '127.0.0.9', req: { headers: { 'user-agent': 'test' } } };
    const r = P.set(i.id, 'litigation/defend/family', { source: 'staff', actor: admin, ctx: ctxReq, reason: 'من المكالمة' });
    assert.deepEqual([r.changed, r.from, r.to, r.line], [true, 'litigation/defend', 'litigation/defend/family', 'litigation']);
    assert.equal(r.block.source_label, 'عدّله الفريق');
    const audit = t.app.db.get("SELECT * FROM security_events WHERE type = 'intake.pathway_changed' ORDER BY id DESC LIMIT 1");
    assert.ok(audit);
    assert.deepEqual(JSON.parse(audit.data), { entity: 'intake', id: i.id, code: i.code, from: 'litigation/defend', to: 'litigation/defend/family', source: 'staff', reason: 'من المكالمة' });
    assert.equal(audit.ip, '127.0.0.9');
    const act = t.app.db.get("SELECT * FROM activity WHERE intake_id = ? AND type = 'intake.pathway_changed' ORDER BY id DESC LIMIT 1", i.id);
    assert.match(act.summary, /مسار الطلب من «دعوى › الرد على دعوى مرفوعة» إلى «دعوى › الرد على دعوى مرفوعة › أسرة وميراث»: من المكالمة$/);
    assert.equal(act.actor_kind, 'staff');
    // قيمة الفريق تغلب: لا قائمة ولا رسالة جاهزة فوقها
    assert.equal(P.set(i.id, 'consultation', { source: 'wa_menu' }), null);
    assert.equal(P.set(i.id, 'consultation/other', { source: 'wa_tag' }), null);
    // نفس المسار من الفريق: بلا كتابة
    const same = P.set(i.id, 'litigation/defend/family', { source: 'staff', actor: admin });
    assert.equal(same.changed, false);
    row = t.app.db.get('SELECT * FROM intakes WHERE id = ?', i.id);
    assert.deepEqual(P.rowFields(row), { service_line: 'litigation', pathway: 'litigation/defend/family', pathway_labels: ['دعوى', 'الرد على دعوى مرفوعة', 'أسرة وميراث'] });
    assert.equal(P.storyLine(row), '[المسار الذي اختاره: دعوى › الرد على دعوى مرفوعة › أسرة وميراث]');
    // مسح المسار (الفريق فقط)
    assert.equal(P.set(i.id, null, { source: 'wa_menu' }), null);
    const cleared = P.set(i.id, null, { source: 'staff', actor: admin, reason: 'خطأ' });
    assert.deepEqual([cleared.changed, cleared.to, cleared.block], [true, null, null]);
    row = t.app.db.get('SELECT * FROM intakes WHERE id = ?', i.id);
    assert.deepEqual([row.service_line, row.pathway, row.pathway_source], [null, null, 'staff']);
    assert.match(t.app.db.get("SELECT summary FROM activity WHERE intake_id = ? AND type = 'intake.pathway_changed' ORDER BY id DESC LIMIT 1", i.id).summary, new RegExp(`إلى «${NO_PATHWAY_LABEL}»`));
    assert.equal(P.set(i.id, 'litigation', { source: 'wa_menu' }), null, 'a staff clear is not refilled by the menu');
  });

  test('block falls back to the stored snapshot labels when a stored path no longer resolves', () => {
    const P = t.app.pathways;
    const row = { pathway: 'litigation/retired-x', service_line: 'litigation', pathway_source: 'website', pathway_set_at: '2026-10-01T10:00:00.000Z', segment: 'paid', form_answers: JSON.stringify({ pathway: { v: 1, path: 'litigation/retired-x', labels: ['دعوى', 'قديم'] } }) };
    assert.deepEqual(P.block(row), { path: 'litigation/retired-x', line: 'litigation', labels: ['دعوى', 'قديم'], staff_labels: ['دعوى', 'قديم'], tags: [], source: 'website', source_label: 'من الموقع', set_at: '2026-10-01T10:00:00.000Z' });
    assert.deepEqual(P.rowFields(row).pathway_labels, ['دعوى', 'قديم']);
  });

  test('lineSql / lineCounts over open requests under the other filters', async () => {
    const P = t.app.pathways;
    assert.deepEqual(P.lineSql('company'), { sql: 'i.service_line = ?', params: ['company'] });
    assert.deepEqual(P.lineSql('none', 'x'), { sql: 'x.service_line IS NULL', params: [] });
    assert.equal(P.lineSql('nope'), null);
    assert.equal(P.lineSql('company', 'i; DROP TABLE x').sql, 'i.service_line = ?');
    const before = P.lineCounts();
    const i = await paidIntake('01011112204');
    P.set(i.id, 'company/new/llc', { source: 'website', onlyIfEmpty: true });
    const afterCounts = P.lineCounts();
    assert.equal(afterCounts.company, before.company + 1);
    assert.equal(afterCounts.none, before.none);
    const only = P.lineCounts('i.id = ?', [i.id]);
    assert.deepEqual(only, { consultation: 0, litigation: 0, company: 1, none: 0 });
    t.app.db.run("UPDATE intakes SET status = 'closed' WHERE id = ?", i.id);
    assert.equal(P.lineCounts('i.id = ?', [i.id]).company, 0, 'open requests only');
    const { sql, params } = P.lineSql('company');
    assert.ok(t.app.db.value(`SELECT COUNT(*) FROM intakes i WHERE ${sql}`, ...params) >= 1);
  });

  test('E12-T18 / L12-80: countView in memory (GET only, no HEAD/prefetch/bot/unknown), flushed on demand and on close', () => {
    const P = t.app.pathways;
    const req = (o = {}) => ({ method: 'GET', headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' }, ...o });
    assert.equal(P.countView('', req()), true);
    assert.equal(P.countView('litigation/defend', req()), true);
    assert.equal(P.countView('litigation/defend', req()), true);
    assert.equal(P.countView('khayri', req()), true);
    assert.equal(P.countView('litigation/defend', req({ method: 'HEAD' })), false);
    assert.equal(P.countView('', req({ headers: { 'sec-purpose': 'prefetch' } })), false);
    assert.equal(P.countView('', req({ headers: { 'user-agent': 'Googlebot/2.1' } })), false);
    assert.equal(P.countView('', req({ headers: { 'user-agent': 'WhatsApp/2.23' } })), false);
    assert.equal(P.countView('consultation/family/divorce', req()), false, 'a leaf is not a page');
    assert.equal(P.countView('nope', req()), false);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM entry_tree_daily'), 0, 'no write per view');
    assert.equal(P.flushViews(), 3);
    const rows = Object.fromEntries(t.app.db.all('SELECT node, views FROM entry_tree_daily').map((r) => [r.node, r.views]));
    assert.deepEqual(rows, { '': 1, 'litigation/defend': 2, khayri: 1 });
    assert.equal(P.countView('', req()), true);
    P.flushViews();
    assert.equal(t.app.db.value("SELECT views FROM entry_tree_daily WHERE node = ''"), 2);
    // حذف ما مضى عليه أكثر من 730 يومًا
    t.app.db.run("INSERT INTO entry_tree_daily (day, node, views) VALUES ('2020-01-01', '', 5)");
    assert.equal(P.purgeViews(), 1);
    assert.equal(t.app.db.value("SELECT COUNT(*) FROM entry_tree_daily WHERE day = '2020-01-01'"), 0);
  });

  test('countView pending rows are written when the app closes', async () => {
    const t2 = await startTestApp();
    const file = t2.app.config.dbPath;
    t2.app.pathways.countView('company', { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' } });
    t2.app.db.close(); // ما يفعله app.close()
    const db = new Db(file);
    try {
      assert.equal(db.value("SELECT views FROM entry_tree_daily WHERE node = 'company'"), 1);
    } finally {
      db.close();
    }
    await t2.close();
  });
});

// ───────────────────────── EN-1…EN-4: الصفحات والتحويلات، الأرشفة، /services والرأس والتذييل ─────────────────────────

/** نص ظاهر تقريبي: بلا سكربتات وأنماط ووسوم */
const visibleText = (html) =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');
const titleOf = (h) => (/<title>([^<]*)<\/title>/.exec(h) || [])[1];
const tagsIn = (h) => [...String(h).matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1]);
const brSize = async (s) => (await import('node:zlib')).brotliCompressSync(Buffer.from(s)).length;
const mainOf = (h) => (/<main class="lh">[\s\S]*<\/main>/.exec(h) || [''])[0];
/** جسم الصفحة بلا الأنماط والسكربتات (الأنماط الحرجة تذكر أسماء أصناف قديمة) */
const bodyOf = (h) => String(h).slice(String(h).indexOf('<body')).replace(/<script[\s\S]*?<\/script>/g, '');
const optsOf = (h) => [...mainOf(h).matchAll(/<a class="opt" href="([^"]*)" data-tag="([^"]+)"><span class="opt__main"><span class="opt__t">([^<]*)<\/span>(?:<span class="opt__s">([^<]*)<\/span>)?/g)].map((m) => ({ href: m[1].replace(/&amp;/g, '&'), tag: m[2], label: m[3], hint: m[4] || null }));
/** §5.9: نطاقات entry المحجوزة لصفحاتها */
const IN_RANGE = {
  T: (n) => n >= 1 && n <= 83,
  L: (n) => n >= 1 && n <= 11,
  H: (n) => n >= 1 && n <= 11,
  F: (n) => (n >= 1 && n <= 16) || n === 20,
  S: (n) => (n >= 10 && n <= 16) || (n >= 20 && n <= 23) || (n >= 30 && n <= 37) || (n >= 40 && n <= 47) || (n >= 50 && n <= 55) || (n >= 60 && n <= 62) || (n >= 65 && n <= 69),
  KH: (n) => n >= 1 && n <= 4,
};

describe('v12 entry EN-1…EN-4: the tree pages, redirects, charity archive, /services, header and footer', () => {
  let t;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => {
    await t.close();
  });
  const get = async (u, headers = {}, method = 'GET') => {
    const r = await fetch(t.base + u, { method, redirect: 'manual', headers });
    return { status: r.status, headers: r.headers, body: await r.text(), loc: r.headers.get('location') };
  };
  const setS = (k, v) => t.app.settings.set(k, v);
  /** يتبع التحويلات حتى 200 (≤ max قفزات) ← { status, hops, path } */
  const follow = async (u, max = 3) => {
    let cur = u;
    for (let hops = 0; hops <= max; hops++) {
      const r = await get(cur);
      if (r.status !== 301 && r.status !== 302) return { status: r.status, hops, path: cur, body: r.body };
      assert.ok(r.loc && r.loc.startsWith('/') && !r.loc.startsWith('//') && !r.loc.startsWith('/\\'), `${u} → ${r.loc}`);
      assert.equal(r.headers.get('cache-control'), 'no-cache', `${cur} redirect no-cache`);
      cur = r.loc;
    }
    return { status: 0, hops: max + 1, path: cur };
  };

  test('E12-T10: «/» = logo + «كيف نساعدكم؟» + three hinted rows + the quiet footer; no gate, no charity, no cookie; CSP/Vary/Cache-Control/HEAD parity; ≤ 10,240 B br', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    const h = r.body;
    assert.equal(titleOf(h), 'Emam Legal and Consultancy | محاماة واستشارات قانونية');
    assert.equal((h.match(/<h1\b/g) || []).length, 1);
    assert.match(h, /<h1 class="q__title" id="q" data-tag="T-01">كيف نساعدكم؟<\/h1>/);
    const opts = optsOf(h);
    assert.deepEqual(opts.map((o) => o.href), ['/start/consultation', '/start/litigation', '/start/company']);
    assert.deepEqual(opts.map((o) => o.label), ['استشارة', 'رفع دعوى قضائية', 'تأسيس شركات']);
    assert.deepEqual(opts.map((o) => o.hint), ['أسرة، ميراث، إيجار، عمل، عقود', 'أو الرد على دعوى مرفوعة عليكم', 'ومستشار قانوني لشركتكم']);
    assert.deepEqual(opts.map((o) => o.tag), ['T-02', 'T-40', 'T-53']);
    // الشعار الكبير ← /services (عن المكتب)، والتذييل L-04…L-11 مع «نتصل بكم» ← /intake?mode=callback (L12-64)
    assert.match(h, /<a class="lh__logo" href="\/services" aria-label="Emam Legal and Consultancy: عن المكتب" data-tag="L-01">/);
    const foot = (/<footer class="lh__foot"[\s\S]*?<\/footer>/.exec(h) || [''])[0];
    assert.deepEqual(tagsIn(foot), ['L-04', 'L-05', 'L-06', 'L-07', 'L-08', 'L-09', 'L-10', 'L-11']);
    assert.match(foot, /<a href="\/intake\?mode=callback" data-tag="L-07">نتصل بكم<\/a>/);
    assert.match(foot, /href="\/portal" data-follow data-tag="L-06">متابعة طلب</);
    assert.ok(decodeURIComponent(/href="(https:\/\/wa\.me\/[^"]+)"[^>]*data-tag="L-08"/.exec(foot)[1]).includes(PAID_GENERIC), 'WhatsApp = PAID_GENERIC');
    // بلا شاشة اختيار ولا نقاط ولا «خيري»
    assert.ok(!/gate|e-dots|class="trail"/.test(mainOf(h)));
    assert.ok(!/الخطوة|خيري|مجان|تغيير نوع الخدمة/.test(visibleText(h)));
    assert.ok(!/<p class="lh__alt"/.test(h), 'restored row only when charity is public');
    // ثوابت v11 (L12-90): CSP، Vary، Cache-Control، بلا Set-Cookie، canonical، LegalService
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.equal(r.headers.get('vary'), 'Accept-Encoding, Cookie');
    assert.equal(r.headers.get('cache-control'), 'private, no-cache');
    assert.equal(r.headers.get('set-cookie'), null);
    assert.match(h, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/" \/>/);
    assert.ok(!/<meta name="robots"/.test(h), '/ is indexable');
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1]);
    assert.ok(ld['@graph'].some((n) => n['@type'] === 'LegalService') && ld['@graph'].some((n) => n['@type'] === 'WebPage'));
    assert.ok(!ld['@graph'].some((n) => n['@type'] === 'FAQPage' || n['@type'] === 'NGO'));
    // سكربتات: module وJSON فقط؛ لا سكربت مضمّن قابل للتنفيذ
    for (const m of h.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /type="(module|application\/json|application\/ld\+json)"/, m[0]);
    assert.match(h, /<script type="module" src="\/assets\/js\/public\/entry\.js\?v=[^"]+"><\/script>/);
    assert.ok((await brSize(h)) <= 10240, `${await brSize(h)} B br`);
    const head = await get('/', {}, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    for (const k of ['content-type', 'cache-control', 'vary', 'content-security-policy']) assert.equal(head.headers.get(k), r.headers.get(k), k);
    // صفوف «/» بلا JSON-LD للخطوات، وبلا bm-public (لا تحتاجه الصفحة)
    assert.ok(!/id="bm-public"/.test(h));
  });

  test('E12-T11: a stale bm_seg cookie is cleared on GET / and /services while archived; HEAD and prefetch never clear; the body is identical', async () => {
    for (const u of ['/', '/services']) {
      const plain = await get(u);
      const r = await get(u, { cookie: 'bm_seg=charity' });
      assert.match(r.headers.get('set-cookie') || '', /^bm_seg=; Path=\/; Max-Age=0; SameSite=Lax$/);
      assert.equal(r.body.replace(/\?v=[^"]+/g, ''), plain.body.replace(/\?v=[^"]+/g, ''), `${u}: same body`);
      assert.equal((await get(u, { cookie: 'bm_seg=charity' }, 'HEAD')).headers.get('set-cookie'), null);
      assert.equal((await get(u, { cookie: 'bm_seg=charity', 'sec-purpose': 'prefetch' })).headers.get('set-cookie'), null);
      assert.equal(plain.headers.get('set-cookie'), null, `${u}: no cookie for a clean visitor`);
    }
  });

  test('E12-T12/T13/T14: level 2 and 3 pages: back + trail (no dots), the question with its T- code, rows to the next page or the intake; noindex; titles', async () => {
    let r = await get('/start/consultation');
    assert.equal(r.status, 200);
    let h = r.body;
    assert.equal(optsOf(h).length, 6);
    assert.match(h, /<a class="trail__back" href="\/" data-tag="L-02">رجوع<span class="pub-sr"> إلى الصفحة الأولى<\/span><\/a>/);
    assert.match(h, /<span class="trail__path" data-tag="L-03"><span class="pub-sr">اخترتم: <\/span>استشارة<\/span>/);
    assert.match(h, /<a class="lh__mark" href="\/" aria-label="Emam Legal and Consultancy: الصفحة الأولى" data-tag="L-01">/);
    assert.match(h, /<h1 class="q__title" id="q" data-tag="T-03">في أي مجال؟<\/h1>/);
    assert.match(h, /<meta name="robots" content="noindex, follow" \/>/);
    assert.match(h, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/start\/consultation" \/>/);
    assert.equal(titleOf(h), 'استشارة: في أي مجال؟ | Emam Legal and Consultancy');
    assert.match(h, /data-depth="2"/);
    assert.ok(!/e-dots|الخطوة \d/.test(h), 'no dots (L12-03)');
    const foot = (/<footer class="lh__foot"[\s\S]*?<\/footer>/.exec(h) || [''])[0];
    assert.deepEqual(tagsIn(foot), ['L-04', 'L-05', 'L-06', 'L-07', 'L-08'], 'L2/L3: footer row 1 only');
    // المستوى الثالث: الرد على دعوى (T-46) وأنواعها إلى /intake?path=litigation/defend/<type>
    r = await get('/start/litigation/defend');
    h = r.body;
    assert.match(h, /<h1 class="q__title" id="q" data-tag="T-46">ما نوع القضية؟<\/h1>/);
    assert.match(h, /data-depth="3"/);
    assert.match(h, /data-prefetch="\/assets\/js\/public\/intake\.js\?v=/, 'L3 prefetches the intake (E12-25)');
    const defend = optsOf(h);
    assert.equal(defend.length, 6);
    for (const o of defend) assert.match(o.href, /^\/intake\?path=litigation\/defend\/[a-z-]+$/);
    assert.match(h, /رجوع<span class="pub-sr"> إلى «رفع دعوى قضائية»<\/span>/);
    assert.match(h, /اخترتم: <\/span>رفع دعوى قضائية · الرد على دعوى مرفوعة</);
    const neu = optsOf((await get('/start/litigation/new')).body);
    assert.deepEqual(neu.map((o) => o.tag), defend.map((o) => o.tag), 'one shared list, the same codes');
    // مستشار قانوني للشركة: نعم ← /company، لا ← طلب عرض
    const counsel = optsOf((await get('/start/company/counsel')).body);
    assert.deepEqual(counsel.map((o) => o.href), ['/company', '/intake?path=company/counsel/proposal']);
  });

  test('E12-T50 + T03 (pages): every tree page renders its h1 qtag and each option tag from the data; allTags ⊇ rendered; I/L/H/F/S/KH codes in §5.9 ranges and unique per page', async () => {
    const known = new Set(allTags().map((x) => x.tag));
    for (const page of allPages()) {
      const u = page.path ? `/start/${page.path}` : '/';
      const r = await get(u);
      assert.equal(r.status, 200, u);
      assert.match(r.body, new RegExp(`<h1 class="q__title" id="q" data-tag="${page.qtag}">`), u);
      assert.deepEqual(optsOf(r.body).map((o) => o.tag), page.options.map((o) => o.tag), u);
      const tags = tagsIn(r.body);
      assert.equal(new Set(tags).size, tags.length, `${u}: unique codes`);
      for (const c of tags) {
        const [pre, n] = c.split('-');
        if (pre === 'T') assert.ok(known.has(c), `${u} ${c}`);
        assert.ok(IN_RANGE[pre]?.(Number(n)), `${u} ${c} in range`);
      }
    }
    for (const u of ['/services', '/privacy', '/portal', '/nope-404', '/khayri']) {
      const tags = tagsIn((await get(u)).body);
      const dupes = tags.filter((x, i) => tags.indexOf(x) !== i && !/^F-(08|10|11|12|16)$/.test(x)); // روابط «روابط مهمة» على الهاتف صيغ بديلة (tags:variant)
      assert.deepEqual(dupes, [], `${u}: unique codes`);
      for (const c of tags) {
        const [pre, n] = c.split('-');
        if (IN_RANGE[pre]) assert.ok(IN_RANGE[pre](Number(n)), `${u} ${c} in range`);
      }
    }
  });

  test('E12-T15: campaign parameters ride on every option, back, logo and footer link and survive redirects; others are dropped', async () => {
    const q = 'utm_source=fb&utm_campaign=x';
    const h = (await get(`/start/consultation/family?${q}&evil=1`)).body;
    const main = mainOf(h);
    for (const o of optsOf(h)) assert.ok(o.href.endsWith(`?${q}`) || o.href.endsWith(`&${q}`), o.href);
    assert.match(main, /class="trail__back" href="\/start\/consultation\?utm_source=fb&amp;utm_campaign=x"/);
    assert.match(main, /class="lh__mark" href="\/\?utm_source=fb&amp;utm_campaign=x"/);
    assert.match(main, /href="\/intake\?mode=callback&amp;utm_source=fb&amp;utm_campaign=x" data-tag="L-07"/);
    assert.ok(!/evil/.test(main));
    const r = await get(`/start/consultation/other?${q}&evil=1`);
    assert.equal(r.status, 302);
    assert.equal(r.loc, `/intake?path=consultation/other&${q}`);
    assert.equal((await get(`/start/?${q}`)).loc, `/?${q}`);
    assert.equal((await get(`/start/foo?${q}`)).loc, `/?${q}`);
  });

  test('E12-T16 + L12-76: redirect matrix (301 structural, 302 archive/leaf/ancestor), GET and HEAD alike; crawl + fuzz end in 200 within 2 hops', async () => {
    const rows = [
      ['/start', 301, '/'],
      ['/start/', 301, '/'],
      ['/start/consultation/', 301, '/start/consultation'],
      ['/start/consultation/family/', 301, '/start/consultation/family'],
      ['/start/consultation/other', 302, '/intake?path=consultation/other'],
      ['/start/consultation/family/divorce', 302, '/intake?path=consultation/family/divorce'],
      ['/start/company/counsel/account', 302, '/company'],
      ['/start/consultation/foo', 302, '/start/consultation'],
      ['/start/foo', 302, '/'],
      ['/?gate=1', 301, '/'],
      ['/?topic=inh', 302, '/intake?path=consultation/family/inheritance'],
      ['/index.html', 301, '/'],
      ['/intake', 302, '/'],
      ['/intake?seg=paid', 302, '/'],
      ['/intake?path=consultation', 302, '/start/consultation'],
      ['/intake?path=consultation/zzz', 302, '/start/consultation'],
      ['/intake?path=company/counsel/account', 302, '/company'],
      ['/intake?seg=paid&mode=company&entry=company_band', 302, '/intake?path=company/counsel/proposal&entry=company_band'],
      ['/intake?topic=rent&seg=paid', 302, TOPIC_TO_PATH.rent.split('/').length === 3 ? `/intake?path=${TOPIC_TO_PATH.rent}` : `/start/${TOPIC_TO_PATH.rent}`],
      ['/intake?area=LAB', 302, `/start/${AREA_TO_PATH.LAB}`],
      ['/about', 302, '/services'],
      ['/khairy', 301, '/khayri'],
      ['/istishara', 301, '/start/consultation'],
      ['/%D8%AF%D8%B9%D9%88%D9%89', 301, '/start/litigation'],
      ['/%d8%aa%d8%a3%d8%b3%d9%8a%d8%b3/', 301, '/start/company/new'],
    ];
    for (const [u, code, loc] of rows) {
      for (const method of ['GET', 'HEAD']) {
        const r = await get(u, {}, method);
        assert.equal(r.status, code, `${method} ${u}`);
        assert.equal(r.loc, loc, `${method} ${u}`);
        assert.equal(r.headers.get('cache-control'), 'no-cache', `${method} ${u}`);
      }
    }
    // كل صفحة وورقة ومخرج، ثم مسارات عدائية: كل سلسلة تنتهي بـ 200 في قفزتين على الأكثر
    const urls = [];
    for (const p of allPages()) if (p.path) urls.push(`/start/${p.path}`, `/start/${p.path}/`);
    for (const l of allLeaves()) urls.push(`/start/${l.path}`, `/intake?path=${l.path}`);
    urls.push('/start//evil.com', '/start/%5C%5Cevil.com', '/start/x/..%2F..%2F', `/start/${'a'.repeat(200)}`, '/start/%D8%B4%D8%B1%D9%83%D8%A7%D8%AA', '/start/consultation/%00', '/start/Consultation', '/start/consultation/family/divorce/extra', '/intake?path=//evil.com', '/intake?path=%5C%5Cevil', '/intake?path=../../etc');
    for (const u of urls) {
      const f = await follow(u, 2);
      assert.equal(f.status, 200, `${u} → ${f.path}`);
      assert.ok(f.hops <= 2, `${u}: ${f.hops} hops`);
    }
  });

  test('E12-T17 + E12-T53: every /start page ≤ 10,240 B br, first <style> ≤ 12,288 B, no inline executable script, no http(s) resource URL, no style="" attribute', async () => {
    for (const page of allPages()) {
      const u = page.path ? `/start/${page.path}` : '/';
      const h = (await get(u)).body;
      assert.ok((await brSize(h)) <= 10240, `${u} ${await brSize(h)}`);
      const style = (/<style>([\s\S]*?)<\/style>/.exec(h) || [, ''])[1];
      assert.ok(style.length > 0 && Buffer.byteLength(style) <= 12288, `${u} style ${Buffer.byteLength(style)}`);
      assert.ok(!/<script(?![^>]*type="(?:module|application\/json|application\/ld\+json)")[^>]*>/.test(h), u);
      assert.ok(!/\sstyle="/.test(h), `${u}: style attribute`);
      assert.ok(!/(?:src|href)="https?:\/\/(?!wa\.me\/)/.test(h.replace(/<link rel="canonical"[^>]*>|<meta[^>]*>/g, '')), `${u}: external resource`);
    }
    const s = (await get('/services')).body;
    assert.ok(!/\sstyle="/.test(s), '/services: style attribute');
    assert.ok((await brSize(s)) <= 16384, `/services ${await brSize(s)} B br`);
    assert.ok(Buffer.byteLength((/<style>([\s\S]*?)<\/style>/.exec(s) || [, ''])[1]) <= 12288);
  });

  test('E12-T18 (HTTP, L12-80): GET of a tree page and the KH notice is counted in memory; HEAD, prefetch and bots are not', async () => {
    t.app.pathways.flushViews();
    t.app.db.run('DELETE FROM entry_tree_daily');
    await get('/start/litigation');
    await get('/start/litigation');
    await get('/start/litigation', {}, 'HEAD');
    await get('/start/litigation', { 'sec-purpose': 'prefetch' });
    await get('/start/litigation', { 'user-agent': 'Googlebot/2.1' });
    await get('/khayri');
    await get('/start/foo');
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM entry_tree_daily'), 0, 'nothing written per request');
    t.app.pathways.flushViews();
    const rows = Object.fromEntries(t.app.db.all('SELECT node, views FROM entry_tree_daily').map((x) => [x.node, x.views]));
    assert.deepEqual(rows, { litigation: 2, khayri: 1 });
  });

  test('E12-T56 (pages, L12-63): B2B off hides the counsel row and swaps the hint; counsel → 302 /start/company; portal closed → the proposal form directly', async () => {
    setS('b2b_enabled', false);
    try {
      const home = optsOf((await get('/')).body);
      assert.equal(home[2].hint, LINES.company.hint_b2b_off);
      const co = optsOf((await get('/start/company')).body);
      assert.ok(!co.some((o) => o.tag === 'T-63'), 'no counsel row');
      assert.equal(co.length, 4);
      for (const u of ['/start/company/counsel', '/start/company/counsel/proposal', '/intake?path=company/counsel/proposal']) {
        const r = await get(u);
        assert.equal(r.status, 302, u);
        assert.equal(r.loc, '/start/company', u);
      }
      assert.ok(!/مستشار قانوني للشركة/.test(visibleText((await get('/services')).body)), 'B2B off: no counsel wording on /services');
      assert.ok(!/id="companies"/.test((await get('/services')).body), 'band hidden');
    } finally {
      setS('b2b_enabled', true);
    }
    // البوابة مغلقة (بلا صفحة /company): «مستشار قانوني للشركة» يفتح طلب العرض مباشرة
    const handler = t.app.pageHandlers.get('/company');
    t.app.pageHandlers.delete('/company');
    try {
      const co = optsOf((await get('/start/company')).body);
      assert.equal(co.find((o) => o.tag === 'T-63').href, '/intake?path=company/counsel/proposal');
      const r = await get('/start/company/counsel');
      assert.equal(r.status, 302);
      assert.equal(r.loc, '/intake?path=company/counsel/proposal');
      assert.ok(!/data-tag="L-11"/.test((await get('/')).body), 'no «دخول الشركات» while the portal is closed');
    } finally {
      if (handler) t.app.pageHandlers.set('/company', handler);
    }
  });

  test('E12-T32 + E12-T34 + E12-T33: archived matrix (KH notice), redirect option, via=p charity form, sitemap, then restore and archive again in one request', async () => {
    const khBody = async (u) => {
      const r = await get(u);
      assert.equal(r.status, 200, u);
      const h = r.body;
      assert.match(h, /<meta name="robots" content="noindex, follow" \/>/, u);
      assert.deepEqual(tagsIn(h.slice(h.indexOf('<main'))), ['KH-01', 'KH-02', 'KH-03', 'KH-04'], u);
      assert.match(h, /class="site pub pub-charity kh-paused"/);
      assert.ok(!/الأتعاب|ابدأوا طلبكم|pub-nav/.test(bodyOf(h)), `${u}: no fees, no paid header, no menu`);
      assert.match(visibleText(h), /خدمة «خيري» لا تستقبل طلبات جديدة من الموقع حاليًا\./);
      assert.equal(r.headers.get('set-cookie'), null);
      return h;
    };
    await khBody('/khayri');
    const viaAlias = await follow('/khairy');
    assert.equal(viaAlias.status, 200);
    assert.equal(viaAlias.path, '/khayri');
    const kh = await khBody('/intake?seg=charity&topic=inh&utm_source=qr');
    assert.match(kh, /href="\/portal\?utm_source=qr" data-tag="KH-03"/);
    assert.match(kh, /href="\/privacy\?side=charity&amp;utm_source=qr"/);
    assert.match(kh, /href="https:\/\/wa\.me\/201000000001\?text=[^"]+"[^>]*data-tag="KH-02"/, 'the charity WhatsApp line (main number)');
    // via=p: نموذج «خيري» لصفحة متابعة خيرية (L12-08)
    const vp = await get('/intake?seg=charity&via=p');
    assert.equal(vp.status, 200);
    assert.match(vp.body, /data-side="charity"/);
    assert.ok(!/id="bm-copy"/.test(vp.body));
    // charity_archived_landing = redirect (سلوك D2)
    setS('charity_archived_landing', 'redirect');
    try {
      for (const u of ['/khayri', '/intake?seg=charity']) assert.deepEqual([(await get(u)).status, (await get(u)).loc], [302, '/'], u);
    } finally {
      setS('charity_archived_landing', 'notice');
    }
    const locs = (x) => [...x.matchAll(/<loc>[^<]*?(\/[^<]*)<\/loc>/g)].map((m) => m[1].replace(/^\/\/[^/]+/, ''));
    const sm = (await get('/sitemap.xml')).body;
    assert.deepEqual(locs(sm).map((l) => new URL(l, 'http://x').pathname), ['/', '/services', '/privacy', '/terms', '/data-deletion']);
    // الاستعادة: /khayri صفحة «خيري» الرئيسية، و«/» يعرض سطر «خيري» تحت الاختيارات، وتذييل الأفراد فيه «خيري»
    setS('charity_public', true);
    try {
      const k = await get('/khayri');
      assert.equal(k.status, 200);
      assert.match(k.body, /مشكلتك في إيه؟/);
      assert.match(k.headers.get('set-cookie') || '', /^bm_seg=charity;/);
      assert.ok(!/pub-seg-pill|تغيير نوع الخدمة|اختيار نوع الخدمة|gate/.test(bodyOf(k.body)), 'no pill, no gate link');
      assert.match(k.body, /<style>/);
      const home = (await get('/')).body;
      assert.match(home, /<\/ul><p class="lh__alt" data-tag="T-81">تبحثون عن مساعدة قانونية مجانية؟ <a href="\/khayri">خيري<\/a><\/p>/);
      assert.equal(optsOf(home).length, 3, 'still three rows');
      assert.match((await get('/services')).body, /<a href="\/khayri" data-tag="F-16">خيري<\/a>/);
      assert.equal((await get('/about')).status, 200);
      assert.equal((await get('/intake?seg=charity')).status, 200);
      const sm2 = locs((await get('/sitemap.xml')).body).map((l) => new URL(l, 'http://x').pathname);
      assert.deepEqual(sm2, ['/', '/khayri', '/services', '/about', '/privacy', '/terms', '/data-deletion']);
    } finally {
      setS('charity_public', false);
    }
    await khBody('/khayri');
    assert.equal((await get('/about')).loc, '/services');
    assert.ok(!/lh__alt/.test((await get('/')).body));
  });

  test('E12-T30 + E12-T52 + E12-T54: /services keeps every section, three rows from LINES, no charity/dash/banned words, © = firm name in plain <bdi>, FAQ JSON-LD = visible FAQ, paid og alt and bm-public', async () => {
    const h = (await get('/services')).body;
    assert.equal(titleOf(h), 'استشارات وقضايا وتأسيس شركات | Emam Legal and Consultancy');
    for (const id of ['services', 'topics', 'how', 'companies', 'trust', 'faq', 'contact']) assert.match(h, new RegExp(`id="${id}"`), id);
    assert.ok(!/id="partners"/.test(h), 'no partners without settings');
    const order = ['id="services"', 'id="how"', 'id="companies"', 'id="trust"', 'id="faq"', 'id="contact"'].map((x) => h.indexOf(x));
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'sections in E12-60 order');
    const rows = [...h.matchAll(/<a class="svc" href="([^"]+)" data-tag="(S-1[234])"><span class="svc__t">([^<]+)<\/span><span class="svc__d">([^<]+)<\/span>/g)];
    assert.deepEqual(rows.map((m) => m[1]), ['/start/consultation', '/start/litigation', '/start/company']);
    assert.deepEqual(rows.map((m) => m[3]), ['consultation', 'litigation', 'company'].map((l) => LINES[l].label));
    const vis = visibleText(h);
    assert.ok(!/خيري|مجان|تغيير نوع الخدمة|اختيار نوع الخدمة|إدارة قانونية افتراضية|جاهزون لمساعدتكم/.test(vis), vis.match(/خيري|مجان|تغيير نوع الخدمة|اختيار نوع الخدمة|إدارة قانونية افتراضية|جاهزون/)?.[0]);
    assert.ok(!DASH.test(vis), 'no dash in visible /services text');
    assert.ok(!/!/.test(vis));
    assert.ok(!/pub-cross|pub-seg-pill|pub-co-row|topic-list/.test(bodyOf(h)));
    assert.match(h, /<p class="pub-legal" data-tag="F-20">© \d{4} <bdi>Emam Legal and Consultancy<\/bdi>\. جميع الحقوق محفوظة\.<\/p>/);
    // الرأس: الشعار ← «/»، الخدمات · كيف نعمل · للشركات · أسئلة · متابعة طلب · ابدأوا طلبكم، وكلمة «القائمة»
    const header = (/<header class="pub-header"[\s\S]*?<\/header>/.exec(h) || [''])[0];
    assert.match(header, /<a class="pub-brand" href="\/" aria-label="Emam Legal and Consultancy: الصفحة الأولى" data-tag="H-01">/);
    assert.deepEqual([...header.matchAll(/<a class="pub-nav-link" href="([^"]+)" data-tag="(H-0\d)">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]), [
      ['#services', 'H-02', 'الخدمات'],
      ['#how', 'H-03', 'كيف نعمل'],
      ['#companies', 'H-04', 'للشركات'],
      ['#faq', 'H-05', 'أسئلة'],
    ]);
    assert.match(header, /<a class="pub-btn pub-btn-gold pub-nav-cta" href="\/" data-cta="intake" data-tag="H-07"><span>ابدأوا طلبكم<\/span><\/a>/);
    assert.match(header, /<span class="pub-menu-word">القائمة<\/span>/);
    assert.match(h, /<a class="skip-link" href="#main" data-tag="H-10">/);
    // FAQPage = الأسئلة الظاهرة، وLegalService بلا اسم المؤسسة
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1]);
    const faqLd = ld['@graph'].find((n) => n['@type'] === 'FAQPage').mainEntity.map((q) => q.name);
    const faqVis = [...h.matchAll(/<details class="pub-faq-item faq__item" data-tag="S-5\d">\s*<summary><span>([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(faqLd, faqVis);
    assert.equal(faqVis.length, 5);
    const svc = ld['@graph'].find((n) => n['@type'] === 'LegalService');
    assert.ok(svc.knowsAbout.includes('مستشار قانوني للشركات') && svc.knowsAbout.includes('رفع الدعاوى ومتابعتها'));
    assert.equal(svc.legalName, undefined);
    assert.match(h, /<meta property="og:image:alt" content="Emam Legal and Consultancy: محاماة واستشارات قانونية" \/>/);
    const pub = JSON.parse(/<script type="application\/json" id="bm-public">([\s\S]*?)<\/script>/.exec(h)[1]);
    assert.equal(pub.org_name, 'Emam Legal and Consultancy');
    for (const part of [h.match(/<meta[^>]+>/g).join(' '), JSON.stringify(pub), JSON.stringify(ld)]) assert.ok(!BANNED.test(part), part.match(BANNED)?.[0]);
    // اسم المكتب القانوني حين يُكتب: ©، bm-public، og:image:alt، legalName
    setS('firm_legal_name', 'إمام وشركاه');
    try {
      const h2 = (await get('/services')).body;
      assert.match(h2, /© \d{4} <bdi>إمام وشركاه<\/bdi>\. جميع الحقوق محفوظة\./);
      assert.ok(!/<bdi dir="ltr">إمام/.test(h2));
      assert.match(h2, /og:image:alt" content="إمام وشركاه: محاماة واستشارات قانونية"/);
      assert.equal(JSON.parse(/id="bm-public">([\s\S]*?)<\/script>/.exec(h2)[1]).org_name, 'إمام وشركاه');
      assert.equal(JSON.parse(/application\/ld\+json">([\s\S]*?)<\/script>/.exec(h2)[1])['@graph'][0].legalName, 'إمام وشركاه');
      for (const u of ['/privacy', '/terms', '/data-deletion', '/portal', '/nope-404']) assert.match((await get(u)).body, /<bdi>إمام وشركاه<\/bdi>/, u);
    } finally {
      setS('firm_legal_name', '');
    }
  });

  test('E12-T59 (pages, L12-56): «الشركاء» only when filled (escaped), F-02 city and JSON-LD addressLocality', async () => {
    setS('firm_partners', [{ name: 'أحمد <b>إمام</b>', title: 'محامٍ بالنقض' }, { name: 'سارة علي', title: '' }]);
    setS('firm_founded', '1998');
    setS('firm_city', 'القاهرة');
    try {
      const h = (await get('/services')).body;
      assert.match(h, /<section class="pub-section partners" id="partners"/);
      assert.match(h, /<h2 id="partners-title" data-tag="S-45">الشركاء<\/h2>/);
      assert.match(h, /<span class="partners__name" dir="auto">أحمد &lt;b&gt;إمام&lt;\/b&gt;<\/span>، <span class="partners__title">محامٍ بالنقض<\/span>/);
      assert.match(h, /<li><span class="partners__name" dir="auto">سارة علي<\/span><\/li>/);
      assert.match(h, /<p class="partners__since" data-tag="S-47">تأسس المكتب عام 1998 في القاهرة\.<\/p>/);
      assert.ok(h.indexOf('id="partners"') > h.indexOf('id="trust"') && h.indexOf('id="partners"') < h.indexOf('id="faq"'));
      assert.match(h, /<p class="pub-footer-desktop" data-tag="F-02">محاماة واستشارات قانونية للأفراد والشركات في القاهرة\.<\/p>/);
      const svc = JSON.parse(/application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1])['@graph'][0];
      assert.equal(svc.address.addressLocality, 'القاهرة');
      assert.equal(svc.foundingDate, '1998');
      setS('firm_partners', []);
      assert.match((await get('/services')).body, /<p class="partners__since" data-tag="S-47">تأسس المكتب عام 1998 في القاهرة\.<\/p>/);
    } finally {
      setS('firm_partners', []);
      setS('firm_founded', '');
      setS('firm_city', '');
    }
    assert.ok(!/id="partners"/.test((await get('/services')).body));
  });

  test('E12-T31 + E12-73 (L12-74): legal pages, /portal and 404 are paid even with bm_seg=charity; ?side=charity honoured (noindex); charity /p/ keeps its tone with pruned links; paid /p/ has the fixed ©', async () => {
    for (const u of ['/privacy', '/terms', '/data-deletion', '/portal', '/nothing-here']) {
      const r = await get(u, { cookie: 'bm_seg=charity' });
      assert.match(r.body, /data-side="paid"/, u);
      assert.match(r.body, /data-tag="F-20"/, u);
      assert.ok(!/pub-seg-pill|تغيير نوع الخدمة|اختيار نوع الخدمة|href="\/khayri/.test(bodyOf(r.body)), u);
    }
    const nf = (await get('/nothing-here')).body;
    assert.match(nf, /<a class="pub-btn pub-btn-outline" href="\/" data-cta="intake">طلب جديد<\/a>/);
    assert.match(nf, /<a class="pub-btn pub-btn-outline" href="\/">الصفحة الأولى<\/a>/);
    assert.equal(titleOf(nf), 'الصفحة غير موجودة | Emam Legal and Consultancy');
    const side = await get('/privacy?side=charity');
    assert.match(side.body, /data-side="charity"/);
    assert.match(side.body, /<meta name="robots" content="noindex, follow" \/>/);
    const post = (segment, phone, sid) => t.client().post('/api/public/intake', { phone, segment, description: 'نزاع على عقد إيجار محل تجاري مع المالك', consent: true, consent_v: 1, submission_id: sid });
    const charity = await post('charity', '01055560002', 'wv12entrycharityp0001');
    assert.equal(charity.status, 201, JSON.stringify(charity.body));
    const ch = (await get(new URL(charity.body.portal_url, t.base).pathname, { cookie: 'bm_seg=paid' })).body;
    assert.match(ch, /data-side="charity"/);
    const chrome = (/<header[\s\S]*?<\/header>/.exec(ch) || [''])[0] + (/<footer class="pub-footer"[\s\S]*?<\/footer>/.exec(ch) || [''])[0];
    assert.ok(!/href="\/khayri|href="\/about"|href="\/intake|href="\/services"|احكيلنا مشكلتك|اختيار نوع الخدمة|\/\?gate/.test(chrome), 'no link that bounces');
    for (const p of ['/privacy?side=charity', '/terms?side=charity', '/data-deletion?side=charity']) assert.ok(chrome.includes(`href="${p}"`), p);
    assert.match(chrome, /href="\/portal"/);
    assert.match(chrome, /<span class="pub-brand" data-tag="H-01">/, 'brand without a link');
    const paid = await post('paid', '01055560001', 'wv12entrypaidp000001');
    const ph = (await get(new URL(paid.body.portal_url, t.base).pathname, { cookie: 'bm_seg=charity' })).body;
    assert.match(ph, /data-side="paid"/);
    assert.match(ph, /<p class="pub-legal" data-tag="F-20">© \d{4} <bdi>Emam Legal and Consultancy<\/bdi>/);
    // H-E2: «طلب جديد» في صفحة متابعة: الأفراد ← «/»، «خيري» ← via=p ما دام متوقفًا
    const src = fs.readFileSync(path.join(t.app.config.publicDir, 'assets/js/public/portal.js'), 'utf8');
    assert.match(src, /'\/intake\?seg=charity&via=p'/);
    assert.match(JSON.parse(/id="bm-copy">([\s\S]*?)<\/script>/.exec(ph)[1]).newHref, /^\/$/);
  });

  test('EN-3: no gate code left (site.js, templates, landing.js); the paid intake bm-copy has no CROSS row; KH notice template carries KH-01…KH-04', async () => {
    const intake = (await get('/intake?path=consultation/family/divorce')).body;
    const copy = JSON.parse(/id="bm-copy">([\s\S]*?)<\/script>/.exec(intake)[1]);
    assert.ok(copy.COPY && !('CROSS' in copy), 'E12-71 #9');
    const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
    const site = fs.readFileSync(path.join(root, 'src/site.js'), 'utf8');
    for (const w of ['gateLayerHtml', 'GATE_COPY', 'GATE_PICTOS', 'GATE_ORDER', 'segPillHtml', 'paidCrossHtml', 'paidTopicsHtml', 'paidCoRowHtml', "get('site_gate_enabled')"]) assert.ok(!site.includes(w), w);
    const landing = fs.readFileSync(path.join(root, 'public/assets/js/public/landing.js'), 'utf8');
    assert.ok(!/initGate|getElementById\('gate'\)/.test(landing));
    const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    assert.ok(!/gate_layer|site_inert|gate_preload/.test(index));
    assert.match(index, /<!--site:critical-css:charity-->/);
    const kh = fs.readFileSync(path.join(root, 'public/khayri-paused.html'), 'utf8');
    for (const c of ['KH-01', 'KH-02', 'KH-03', 'KH-04']) assert.ok(kh.includes(`data-tag="${c}"`), c);
  });

  test('entry.js: tiny (≤ 1,536 B br), no imports, no inline handlers; captures attribution, swaps the saved follow-up link, L3 prefetch, 3 s double-tap guard', async () => {
    const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
    const src = fs.readFileSync(path.join(root, 'public/assets/js/public/entry.js'), 'utf8');
    assert.ok((await brSize(src)) <= 1536, `${await brSize(src)} B br`);
    assert.ok(!/^\s*import\b/m.test(src));
    for (const s of ['bm_attribution', 'bm_portal', 'data-follow', "'3'", 'prefetch', 'opt--going', 'aria-busy', '3000', 'pageshow']) assert.ok(src.includes(s), s);
  });

  test('SVC_ROWS registry labels equal LINES (one source of words, L12-82)', async () => {
    const { SVC_ROWS } = await import('../src/site.js');
    for (const r of SVC_ROWS) assert.equal(r.label, LINES[r.line].label, r.tag);
  });

  test('E12-T35: site_gate_enabled has no effect; charity_public and firm_legal_name change only by an admin and are audited', async () => {
    setS('site_gate_enabled', true);
    const on = await get('/');
    setS('site_gate_enabled', false);
    const off = await get('/');
    setS('site_gate_enabled', true);
    assert.equal(off.status, 200);
    assert.equal(off.body, on.body, 'the retired gate setting changes nothing on «/»');
    assert.equal(off.headers.get('set-cookie'), null);
    assert.equal(t.app.settings.get('charity_public'), false);
    const admin = await t.login('admin');
    assert.equal((await t.client().patch('/api/admin/settings', { charity_public: true })).status, 401, 'anonymous');
    let r = await admin.patch('/api/admin/settings', { charity_public: true, firm_legal_name: 'إمام وشركاه' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ev = t.app.db.get("SELECT * FROM security_events WHERE type = 'settings.updated' ORDER BY id DESC LIMIT 1");
    assert.ok(ev && ev.summary.includes('charity_public') && ev.summary.includes('firm_legal_name'), ev?.summary);
    assert.equal((await get('/khayri')).body.includes('data-tag="KH-01"'), false, 'restored: the charity home, not the notice');
    r = await admin.patch('/api/admin/settings', { charity_public: false, firm_legal_name: '' });
    assert.equal(r.status, 200);
    assert.ok((await get('/khayri')).body.includes('data-tag="KH-01"'), 'archived again: the notice');
  });

  test('E12-13: « | » title separator on every paid page (legal pages included); the charity side keeps «—»', async () => {
    const title = (h) => (/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '';
    for (const [p, want] of [
      ['/privacy', 'سياسة الخصوصية | '],
      ['/terms', 'شروط الاستخدام | '],
      ['/data-deletion', 'طلب حذف البيانات | '],
      ['/portal', 'متابعة طلبكم | '],
      ['/services', 'استشارات وقضايا وتأسيس شركات | '],
    ]) {
      const h = (await get(p)).body;
      assert.ok(title(h).startsWith(want), `${p}: ${title(h)}`);
      assert.ok(!title(h).includes('—'), `${p}: no dash`);
    }
    assert.ok(title((await get('/no-such-page-v12')).body).startsWith('الصفحة غير موجودة | '));
    for (const p of ['/privacy?side=charity', '/terms?side=charity', '/data-deletion?side=charity']) assert.match(title((await get(p)).body), / — /, p);
  });
});

// ───────────────────────── EN-5…EN-9: الطلب المختصر، POST بالمسار، الصفحات القانونية، صوت المكتب، بيانات العرض ─────────────────────────

const ROOT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const readSrc = (f) => fs.readFileSync(path.join(ROOT_DIR, f), 'utf8');
const bmJson = (h, id) => {
  const m = new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(h);
  return m ? JSON.parse(m[1]) : null;
};
/** §5.9: نطاقات I (الطلب) وIC (طلب عرض الشركات) المحجوزة لـ entry */
const IN_RANGE_I = (n) => (n >= 1 && n <= 4) || (n >= 11 && n <= 25) || (n >= 30 && n <= 34) || (n >= 40 && n <= 43) || (n >= 50 && n <= 58) || (n >= 60 && n <= 68) || (n >= 80 && n <= 149);

describe('v12 entry EN-5…EN-9: the minimal paid intake, POST with a pathway, legal pages, firm voice, demo data', () => {
  let t;
  let n = 0;
  before(async () => {
    t = await startTestApp();
  });
  after(async () => {
    await t.close();
  });
  const get = async (u, headers = {}) => {
    const r = await fetch(t.base + u, { redirect: 'manual', headers });
    return { status: r.status, headers: r.headers, body: await r.text() };
  };
  const post = (body) => t.client().post('/api/public/intake', { consent: true, consent_v: 1, description: 'وصف كاف للموضوع هنا للاختبار.', submission_id: `wv12entry${String(++n).padStart(12, '0')}`, ...body });
  const row = (ref) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', ref);
  const phone = () => `0101${String(4000000 + n).padStart(7, '0')}`;

  test('E12-T20 + E12-31: /intake?path=<leaf> is the paid minimal page — tree chrome (I-04 mark, I-03 رجوع → the L3 page, I-01 trail), tree footer, no site header, bm-path, noindex, « | » title; ≤ 16,384 B br', async () => {
    const r = await get('/intake?path=consultation/family/divorce&utm_source=fb');
    assert.equal(r.status, 200);
    const h = r.body;
    assert.equal(titleOf(h), 'الطلاق أو الخلع | Emam Legal and Consultancy');
    assert.match(h, /<meta name="robots" content="noindex, follow" \/>/);
    assert.match(h, /<body class="site pub v91 bmf-page" data-side="paid">/);
    assert.ok(!/class="pub-header"|class="pub-footer"|class="skip-link"/.test(h), 'no site header/footer on the paid intake');
    const main = /<main id="main" class="lh" tabindex="-1">[\s\S]*<\/main>/.exec(h)[0];
    assert.match(main, /<a class="lh__mark" href="\/\?utm_source=fb" aria-label="Emam Legal and Consultancy: الصفحة الأولى" data-tag="I-04">/);
    assert.match(main, /<a class="trail__back" href="\/start\/consultation\/family\?utm_source=fb" data-tag="I-03">رجوع<span class="pub-sr"> إلى «الأسرة والميراث»<\/span><\/a>/);
    assert.match(main, /<span class="trail__path" data-tag="I-01"><span class="pub-sr">اخترتم: <\/span>استشارة · الأسرة والميراث · الطلاق أو الخلع<\/span>/);
    assert.match(main, /<div id="intake-root" /);
    assert.deepEqual(tagsIn(/<footer class="lh__foot"[\s\S]*?<\/footer>/.exec(main)[0]), ['L-04', 'L-05', 'L-06', 'L-07', 'L-08']);
    assert.match(main, /href="\/intake\?mode=callback&amp;utm_source=fb" data-tag="L-07">نتصل بكم</);
    const bm = bmJson(h, 'bm-path');
    assert.deepEqual([bm.path, bm.line, bm.ask, bm.name_prefix, bm.back], ['consultation/family/divorce', 'consultation', [], 'الطلاق أو الخلع', '/start/consultation/family']);
    const copy = bmJson(h, 'bm-copy');
    assert.ok(copy.COPY && !('CROSS' in copy) && !('QUESTIONS' in copy) && !('TOPICS' in copy));
    assert.ok((await brSize(h)) <= 16384, `${await brSize(h)} B br`);
    assert.ok(Buffer.byteLength(JSON.stringify(bm)) <= 1024);
    // «نتصل بكم» (?mode=callback): نفس الإطار، والمسار كلمته، و«رجوع» ← «/»
    const cb = (await get('/intake?mode=callback')).body;
    assert.match(cb, /<a class="trail__back" href="\/" data-tag="I-03">رجوع<span class="pub-sr"> إلى الصفحة الأولى<\/span><\/a>/);
    assert.match(cb, /<span class="pub-sr">اخترتم: <\/span>نتصل بكم<\/span>/);
    assert.equal(bmJson(cb, 'bm-path'), null);
    // طلب عرض الشركات (E12-43): المسار «تأسيس شركات · مستشار قانوني للشركة» فوق العنوان
    const lead = (await get('/intake?path=company/counsel/proposal')).body;
    assert.match(lead, /اخترتم: <\/span>تأسيس شركات · مستشار قانوني للشركة<\/span>/);
    assert.equal(bmJson(lead, 'bm-path').lead, true);
    // «خيري» (via=p) كما هو: رأس الموقع وتذييله، بلا bm-path، وصوره (pictos.js) تُحمَّل مسبقًا في صفحته وحدها
    const ch = (await get('/intake?seg=charity&via=p')).body;
    assert.match(ch, /<main id="main" class="site-main bmf-main" tabindex="-1">/);
    assert.equal(bmJson(ch, 'bm-path'), null);
    assert.match(ch, /<link rel="modulepreload" href="\/assets\/js\/public\/pictos\.js\?v=[^"]+" \/>/);
    assert.ok(!/pictos\.js/.test(h), 'the paid page never downloads the charity pictures');
  });

  test('E12-T21 + E12-T57 + E12-45: bm-path per leaf — defend asks case.next; old-rent rent.side with rent.home pre-answered; judgment asks judgment.when; alimony asks alimony.for then children («لا يوجد» first); never a question the tree answered', async () => {
    const bmOf = async (p) => bmJson((await get(`/intake?path=${p}`)).body, 'bm-path');
    assert.deepEqual((await bmOf('litigation/defend/family')).ask.map((q) => q.id), ['case.next']);
    const rent = await bmOf('consultation/property/old-rent');
    assert.deepEqual(rent.ask.map((q) => q.id), ['rent.side']);
    assert.deepEqual(rent.pre, { 'rent.home': 'rented_old' });
    assert.deepEqual((await bmOf('litigation/judgment/family')).ask.map((q) => q.id), ['judgment.when']);
    const al = await bmOf('consultation/family/alimony');
    assert.deepEqual(al.ask.map((q) => q.id), ['alimony.for', 'children']);
    assert.deepEqual(al.ask[1].answers[0], ['none', 'لا يوجد', ANSWER_TAGS['children:none']]);
    assert.deepEqual(al.ask.map((q) => q.tag), ['I-24', 'I-18']);
    for (const q of al.ask) assert.deepEqual(q.answers.at(-1).slice(0, 2), ['unknown', 'لا أعرف'], 'لا أعرف last');
    for (const leaf of allLeaves().filter((l) => !l.exit)) {
      const bm = bmPathFor(leaf.path);
      for (const q of bm.ask) {
        assert.ok(!Object.hasOwn(bm.pre || {}, q.id), `${leaf.path} asks ${q.id} again`);
        assert.ok(QUESTIONS[q.id] || TREE_QUESTIONS[q.id], `${leaf.path}: ${q.id}`);
        assert.ok(IN_RANGE_I(codeNum(q.tag)), q.tag);
        for (const a of q.answers) assert.ok(IN_RANGE_I(codeNum(a[2])), a[2]);
      }
    }
    // «خيري» يحتفظ بأسئلته كما هي (topics.js لا يُمس): النفقة «الأب» والإخلاء
    assert.equal(QUESTIONS['alimony.father'].answers.length, 4);
    assert.ok(QUESTIONS['rent.evict']);
  });

  test('E12-T22: intake.js — with bm-path no topic screen, rows without aria-pressed, aria-current on return, focus on the new h1, a polite step line; L11-53 guarded; no entry-tree.js; no way back to «خيري» (deleted-test mapping: v11-gate-public 59, v11-gate-public-fixes J-18/V12)', () => {
    const src = readSrc('public/assets/js/public/intake.js');
    assert.match(src, /if \(P\) return screen === 'docs' \? docsScreen\(\) : askOf\(screen\.slice\(2\)\) \? pathQuestion\(askOf\(screen\.slice\(2\)\)\) : storyScreen\(\);/);
    const pq = src.slice(src.indexOf('function pathQuestion('), src.indexOf('function docsScreen('));
    assert.ok(!/aria-pressed/.test(pq), 'no aria-pressed on one-shot answers (L12-04)');
    assert.match(pq, /'aria-current': state\.answers\[q\.id\] === v && 'true'/);
    assert.match(pq, /h\('div\.opts', \{ role: 'group', 'aria-labelledby': heading\.id \}/);
    assert.match(pq, /button\.opt\.opt--choice/);
    assert.match(pq, /v === 'unknown' && 'opt--unknown'/);
    assert.match(src, /h\('p\.step', \{ 'aria-live': 'polite', tag: 'I-02' \}/);
    assert.match(src, /stepEl\.querySelector\('i'\)\.style\.setProperty\('--p'/, 'CSSOM fill, no style attribute (L12-14)');
    assert.match(src, /view\.heading\.focus\(\{ preventScroll: true \}\)/);
    assert.match(src, /if \(PUB\.charity && !P && !params\.get\('seg'\)/, 'L11-53 only while «خيري» is public and never on a leaf (E12-40)');
    assert.ok(!/entry-tree\.js/.test(src), 'never imports entry-tree.js');
    assert.ok(!/crossRow|crossing|pub-cross/.test(src), 'no way back to «خيري» on the paid form (E12-71 #9)');
    assert.match(src, /path: P\?\.path,/, 'drafts keyed on path (E12-40)');
    assert.match(src, /const samePath = !P \|\| d\.path === P\.path;/);
    assert.match(src, /pages: !!P,/, 'multi-page documents on the paid intake (L12-38)');
    assert.match(src, /namePrefix: P\?\.name_prefix \|\| COPY\.docName,/);
    // رموز الطلب في نطاقات entry
    for (const c of new Set([...src.matchAll(/'(I|IC)-(\d+)'/g)].map((m) => `${m[1]}-${m[2]}`))) assert.ok(c.startsWith('I-') ? IN_RANGE_I(codeNum(c)) : false, c);
    const co = readSrc('public/assets/js/public/intake-company.js');
    const ic = [...co.matchAll(/'IC-(\d+)'/g)].map((m) => Number(m[1]));
    assert.deepEqual([...new Set(ic)].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i + 1), 'IC-01…IC-16');
  });

  test('E12-T51 (L12-22): web voice archived by default — no recording words in the paid bm-copy, bm-public.voice false, recorder.js outside the static closure; on → the v11 voice words return', async () => {
    const { preloadClosure } = await import('../src/site-assets.js');
    const closure = preloadClosure(path.join(ROOT_DIR, 'public/assets/js/public/intake.js'), path.join(ROOT_DIR, 'public'));
    assert.ok(!closure.some((u) => /recorder\.js|entry-tree\.js|pictos\.js/.test(u)), closure.join(' '));
    const off = (await get('/intake?path=litigation/defend/family')).body;
    assert.equal(bmJson(off, 'bm-public').voice, false);
    assert.ok(!/recorder\.js/.test(off));
    const copyOff = bmJson(off, 'bm-copy');
    assert.ok(!/سجّل|تسجيل/.test(JSON.stringify(copyOff)), 'no recording words');
    assert.equal(copyOff.MSG.problem, 'اكتبوا الموضوع في جملة أو اثنتين.');
    assert.ok(!/سجّل/.test(visibleText(off)) && !/سجّل/.test(/<meta name="description" content="([^"]*)"/.exec(off)[1]));
    const src = readSrc('public/assets/js/public/intake.js');
    assert.match(src, /const VOICE = PUB\.voice === true;/);
    assert.match(src, /if \(!VOICE\) return false;/, 'canRecordHere');
    assert.match(src, /if \(VOICE && \(screen === 'story' \|\| screen\.startsWith\('q:'\)\)\) loadRecorder\(\)/);
    assert.ok(src.includes("heldV: 'فيه رسالة صوتية محفوظة من قبل، هتتبعت مع الطلب.'") && src.includes("heldX: 'امسحيها'"));
    t.app.settings.set('web_voice_enabled', true);
    try {
      const on = (await get('/intake?path=litigation/defend/family')).body;
      assert.equal(bmJson(on, 'bm-public').voice, true);
      const copyOn = bmJson(on, 'bm-copy');
      assert.equal(copyOn.COPY.orVoice, 'أو سجّلوا رسالة صوتية');
      assert.equal(copyOn.MSG.problem, 'اكتبوا موضوعكم في جملة أو اثنتين، أو سجّلوا رسالة صوتية.');
    } finally {
      t.app.settings.set('web_voice_enabled', false);
    }
    const copyPaid = await import('../src/site-copy-paid.js');
    assert.equal(copyPaid.INTAKE_COPY.heldV, 'لديكم رسالة صوتية محفوظة من قبل، وستُرسل مع الطلب.');
    assert.equal(copyPaid.INTAKE_COPY.heldX, 'حذفها');
  });

  test('E12-T23 + E12-T24: POST with a leaf pathway → paid (even with segment:charity), service_line/pathway «من الموقع», topic and area from the leaf, answers = ask + pre, snapshot labels, urgent hint', async () => {
    const r = await post({ phone: phone(), segment: 'charity', topic: 'inh', pathway: 'consultation/property/old-rent', answers: { 'rent.side': 'tenant', 'inh.deceased': 'husband', bogus: 'x' }, entry: 'tree' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.segment, 'paid');
    const i = row(r.body.reference);
    assert.deepEqual([i.segment, i.service_line, i.pathway, i.pathway_source, i.topic, i.legal_area], ['paid', 'consultation', 'consultation/property/old-rent', 'website', 'rent', 'PRP']);
    const fa = JSON.parse(i.form_answers);
    assert.deepEqual(fa.answers, { 'rent.side': 'tenant', 'rent.home': 'rented_old' });
    assert.equal(fa.entry, 'tree');
    assert.deepEqual(fa.pathway, { v: 1, path: 'consultation/property/old-rent', labels: trail('consultation/property/old-rent', { staff: true }) });
    const u = await post({ phone: phone(), pathway: 'litigation/defend/family', answers: { 'case.next': 'soon' } });
    assert.equal(u.body.urgent, true);
    assert.equal(JSON.parse(row(u.body.reference).form_answers).inferred.urgent_hint, true);
    const c = await post({ phone: phone(), pathway: 'consultation/family/alimony', answers: { 'alimony.for': 'payer', children: 'none' } });
    assert.equal(JSON.parse(row(c.body.reference).form_answers).inferred.children_count, 0, '«لا يوجد» → 0 (L12-55)');
  });

  test('E12-T58 (L12-65): 201 urgent for case.next=soon, «لا أعرف» on defend/paper, judgment recent/mid/unknown; false otherwise; call_now only inside office hours with a paid phone', async () => {
    const urgent = async (pathway, answers) => (await post({ phone: phone(), pathway, answers })).body.urgent;
    assert.equal(await urgent('litigation/defend/labour', { 'case.next': 'soon' }), true);
    assert.equal(await urgent('litigation/defend/labour', { 'case.next': 'unknown' }), true);
    assert.equal(await urgent('litigation/paper', { 'case.next': 'unknown' }), true);
    assert.equal(await urgent('litigation/new/family', { 'case.next': 'unknown' }), false);
    assert.equal(await urgent('litigation/defend/labour', { 'case.next': 'later' }), false);
    for (const w of ['recent', 'mid', 'unknown']) assert.equal(await urgent('litigation/judgment/civil', { 'judgment.when': w }), true, w);
    assert.equal(await urgent('litigation/judgment/civil', { 'judgment.when': 'old' }), false);
    assert.equal(await urgent('consultation/family/divorce', {}), false);
    t.app.settings.set('office_hours_schedule', { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' });
    t.app.settings.set('org_phone_paid', '01099998888');
    try {
      const open = await post({ phone: phone(), pathway: 'litigation/defend/labour', answers: { 'case.next': 'soon' } });
      assert.equal(open.body.call_now, '01099998888');
      t.app.settings.set('office_hours_schedule', { days: [], from: '10:00', to: '16:00' });
      assert.equal((await post({ phone: phone(), pathway: 'litigation/defend/labour', answers: { 'case.next': 'soon' } })).body.call_now, null);
      t.app.settings.set('charity_public', true);
      t.app.settings.set('office_hours_schedule', { days: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '23:59' });
      assert.equal((await post({ phone: phone(), segment: 'charity', topic: 'inh' })).body.call_now, null, 'charity requests never get it');
    } finally {
      t.app.settings.set('charity_public', false);
      t.app.settings.set('office_hours_schedule', DEFAULT_SETTINGS.office_hours_schedule);
      t.app.settings.set('org_phone_paid', DEFAULT_SETTINGS.org_phone_paid ?? '');
    }
  });

  test('E12-T25 + E12-T26 + E12-T27 + E12-T28: invalid/exit pathway dropped (pathway_invalid); company_name only on the company line; the company proposal through the tree; a line-only pathway from «نتصل بكم»; entry tree', async () => {
    for (const bad of ['company/counsel/account', 'nope/x', 'a'.repeat(81), 12]) {
      const r = await post({ phone: phone(), pathway: bad, segment: 'paid' });
      assert.equal(r.status, 201, String(bad));
      const i = row(r.body.reference);
      assert.equal(i.pathway, null);
      assert.equal(JSON.parse(i.source_detail || '{}').pathway_invalid ?? JSON.parse(i.source_detail || '{}').detail?.pathway_invalid ?? /pathway_invalid/.test(i.source_detail || ''), true, String(bad));
    }
    const co = await post({ phone: phone(), pathway: 'company/change/capital', company_name: '  شركة النيل  للتجارة ' });
    assert.equal(JSON.parse(row(co.body.reference).form_answers).company_name, 'شركة النيل للتجارة');
    const notCo = await post({ phone: phone(), pathway: 'consultation/family/divorce', company_name: 'شركة النيل' });
    assert.equal(JSON.parse(row(notCo.body.reference).form_answers).company_name, undefined);
    const short = await post({ phone: phone(), pathway: 'company/change/capital', company_name: 'ش' });
    assert.equal(JSON.parse(row(short.body.reference).form_answers).company_name, undefined);
    const lead = await post({ phone: phone(), name: 'منى عادل', pathway: 'company/counsel/proposal', requester: { kind: 'company', company_name: 'شركة الدلتا' }, description: '' });
    assert.equal(lead.status, 201, JSON.stringify(lead.body));
    const li = row(lead.body.reference);
    assert.deepEqual([li.segment, li.segment_source, li.pathway, li.service_line], ['paid', 'company_lead', 'company/counsel/proposal', 'company']);
    const cb = await post({ phone: phone(), pathway: 'litigation', callback: 'any', description: '', mode: 'callback' });
    assert.equal(cb.status, 201, JSON.stringify(cb.body));
    const ci = row(cb.body.reference);
    assert.deepEqual([ci.service_line, ci.pathway, ci.segment], ['litigation', 'litigation', 'paid']);
  });

  test('E12-T55 (L12-27): a thrown pathways.set never fails the POST; a website POST without segment is paid while «خيري» is archived (L12-09)', async () => {
    const orig = t.app.pathways.set;
    t.app.pathways.set = () => {
      throw new Error('boom');
    };
    try {
      const r = await post({ phone: phone(), pathway: 'consultation/family/divorce' });
      assert.equal(r.status, 201);
      assert.equal(row(r.body.reference).pathway, null);
    } finally {
      t.app.pathways.set = orig;
    }
    const plain = await post({ phone: phone() });
    assert.equal(row(plain.body.reference).segment, 'paid');
  });

  test('E12-T53 + E12-T54 + E12-T60: paid intake pages and copy — no external resource, no style="", no dash/«!»/charity words/feminine imperatives in visible text, meta, bm-public, bm-copy, bm-path; no «إدارة قانونية افتراضية» on any paid page', async () => {
    const pages = ['/', '/start/consultation', '/start/litigation/defend', '/start/company', '/services', '/intake?path=consultation/family/alimony', '/intake?path=company/counsel/proposal', '/intake?path=litigation/paper', '/intake?mode=callback', '/portal', '/no-such-page-v12'];
    for (const p of pages) {
      const h = (await get(p)).body;
      const visible = visibleText(h);
      const metas = [...h.matchAll(/<meta [^>]*content="([^"]*)"/g)].map((m) => m[1]).join(' ');
      const json = [...h.matchAll(/<script type="application\/(?:json|ld\+json)"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' ');
      for (const [where, s] of [['visible', visible], ['meta', metas], ['json', json]]) {
        assert.ok(!DASH.test(s), `${p} ${where}: dash`);
        assert.ok(!/!/.test(s.replace(/<!--[\s\S]*?-->/g, '')), `${p} ${where}: «!»`);
        assert.ok(!BANNED.test(s), `${p} ${where}: ${BANNED.exec(s)?.[0]}`);
        assert.ok(!FEM.test(s), `${p} ${where}: ${FEM.exec(s)?.[0]}`);
      }
      if (p.startsWith('/intake')) {
        assert.ok(!/style="/.test(h), `${p}: style attribute`);
        const ext = [...h.replace(/<link rel="canonical"[^>]*>/g, '').matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith(t.base) && !/^https:\/\/(wa\.me|www\.google\.com\/maps)\//.test(u));
        assert.deepEqual(ext, [], `${p}: external resource`);
      }
    }
    for (const v of Object.values(PLACEHOLDERS)) assert.ok(!DASH.test(v) && !BANNED.test(v) && !FEM.test(v), v);
  });

  test('EN-7 (E12-69, L12-77, L12-29): privacy discloses the automated fixed messages per side and the stop word; bm_seg sentence archived/restored; the «خيري» terms bullet only when restored; media paragraphs at the two placeholders', async () => {
    const paid = (await get('/privacy')).body;
    assert.ok(paid.includes('الرسائل الثابتة مثل الترحيب وقائمة الخدمات تُرسل آليًا، وكل رد على موضوعكم يكتبه أو يراجعه شخص مختص قبل إرساله.'));
    assert.ok(!paid.includes('كل رد يصلك يراجعه شخص مختص ويعتمده'));
    assert.ok(paid.includes('ولإيقاف الرسائل الآلية وحدها أرسل كلمة «توقف».'));
    assert.ok(paid.includes('قد يكون في متصفحكم ملف ارتباط قديم اسمه bm_seg من زيارة سابقة. لم نعد نستخدمه، ونحذفه عند زيارتكم التالية.'));
    const ch = (await get('/privacy?side=charity')).body;
    assert.ok(ch.includes('الرسائل الثابتة مثل الترحيب وقائمة الخدمات تُرسل آليًا، وكل رد على موضوعك يكتبه أو يراجعه شخص مختص قبل إرساله.'));
    assert.ok(!(await get('/terms')).body.includes('المساعدة القانونية المجانية («خيري»)'));
    t.app.settings.set('charity_public', true);
    try {
      assert.ok((await get('/terms')).body.includes('المساعدة القانونية المجانية («خيري»)'));
      assert.ok((await get('/privacy')).body.includes('نحفظ اختيارك لنوع الخدمة («خيري» أو «خدمات الأفراد والشركات») في ملف ارتباط ضروري اسمه bm_seg'));
    } finally {
      t.app.settings.set('charity_public', false);
    }
    assert.match(readSrc('public/privacy.html'), /\{\{\{media_privacy\}\}\}/);
    assert.match(readSrc('public/data-deletion.html'), /\{\{\{media_deletion\}\}\}/);
    const media = t.app.media;
    const orig = { p: media?.privacyHtml, d: media?.deletionHtml };
    try {
      media.privacyHtml = (side) => `<p data-tag="PV-01">media-privacy-${side}</p>`;
      media.deletionHtml = (side) => `<p data-tag="DD-01">media-deletion-${side}</p>`;
      assert.ok((await get('/privacy')).body.includes('<p data-tag="PV-01">media-privacy-paid</p>'));
      assert.ok((await get('/privacy?side=charity')).body.includes('media-privacy-charity'));
      assert.ok((await get('/data-deletion')).body.includes('<p data-tag="DD-01">media-deletion-paid</p>'));
      assert.ok(!(await get('/terms')).body.includes('media-privacy'));
    } finally {
      media.privacyHtml = orig.p;
      media.deletionHtml = orig.d;
    }
  });

  test('§4 budgets (entry rows): /intake closure ≤ 32,768 B br and intake.js ≤ 11.0 + 2,048 B br; intake-company.js ≤ 4,096 B br; bm-copy ≤ 12,288 B raw', async () => {
    const { preloadClosure, transformAsset } = await import('../src/site-assets.js');
    const zlib = await import('node:zlib');
    const PUBD = path.join(ROOT_DIR, 'public');
    const br = (buf) => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }).length;
    const served = (u) => br(transformAsset(path.join(PUBD, u.split('?')[0])));
    const closure = ['/assets/js/public/intake.js', ...preloadClosure(path.join(PUBD, 'assets/js/public/intake.js'), PUBD)];
    const total = closure.reduce((s, u) => s + served(u), 0);
    assert.ok(total <= 32768, `closure ${total}`);
    assert.ok(served('/assets/js/public/intake.js') <= 19101 + 2048, `intake.js ${served('/assets/js/public/intake.js')}`);
    assert.ok(served('/assets/js/public/intake-company.js') <= 4096);
    const raw = /id="bm-copy">([\s\S]*?)<\/script>/.exec((await get('/intake?path=consultation/family/alimony')).body)[1];
    assert.ok(Buffer.byteLength(raw) <= 12288, `bm-copy ${Buffer.byteLength(raw)}`);
  });
});

describe('v12 entry EN-9: demo data (E12-59, L12-41)', () => {
  test('six tree requests (paid, «من الموقع», two per line, urgent defend + judgment, the company proposal), a week of view counters, firm_legal_name «إمام وشركاه», never partners/year/city; the 9.2 website demo stays charity', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const { ENTRY_DEMO_PHONES } = await import('../src/seed-v12-entry.js');
      const rows = t.app.db.all(`SELECT * FROM intakes WHERE contact_phone IN (${ENTRY_DEMO_PHONES.map(() => '?').join(',')}) ORDER BY id`, ...ENTRY_DEMO_PHONES.map((p) => `+2${p}`));
      assert.equal(rows.length, 6);
      for (const r of rows) assert.deepEqual([r.segment, r.pathway_source], ['paid', 'website'], r.code);
      const lines = rows.map((r) => r.service_line);
      for (const l of ['consultation', 'litigation', 'company']) assert.equal(lines.filter((x) => x === l).length, 2, l);
      const urgent = rows.filter((r) => JSON.parse(r.form_answers).inferred?.urgent_hint).map((r) => r.pathway);
      assert.deepEqual(urgent.sort(), ['litigation/defend/labour', 'litigation/judgment/family']);
      assert.ok(rows.some((r) => r.pathway === 'company/counsel/proposal' && r.segment_source === 'company_lead'));
      assert.equal(t.app.settings.get('firm_legal_name'), 'إمام وشركاه');
      assert.deepEqual([t.app.settings.get('firm_partners'), t.app.settings.get('firm_founded'), t.app.settings.get('firm_city')], [[], '', '']);
      assert.equal(t.app.settings.get('charity_public'), false);
      const days = t.app.db.get('SELECT COUNT(DISTINCT day) d, COUNT(*) n FROM entry_tree_daily');
      assert.ok(days.d >= 7 && days.n >= 7 * 10, JSON.stringify(days));
      for (const p of ['+201092000101', '+201092000102', '+201092000103']) assert.equal(t.app.db.value('SELECT segment FROM intakes WHERE contact_phone = ?', p), 'charity', p);
      assert.equal(t.app.db.value('SELECT COUNT(*) FROM media_jobs'), 0, 'seeds never enqueue media jobs (L12-69)');
    } finally {
      await t.close();
    }
  });
});
