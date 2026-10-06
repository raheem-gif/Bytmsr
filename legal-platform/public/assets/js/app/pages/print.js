// طباعة المستندات الرسمية — (الإصدار 9 — وحدة programs)
// #/print/:kind/:id يعرض المستند على ورقة A4 بيضاء بترويسة المؤسسة (الاسم الرسمي، رقم الإشهار، العنوان، الهاتف)،
// وترويسة وتذييل يتكرران في كل صفحة مطبوعة (رقم المستند وتاريخه). البيانات من GET /api/print/:kind/:id
// الذي يفرض نفس صلاحيات البيانات الأصلية. ?auto=1 يُظهر حوار الطباعة تلقائيًا بعد التحميل.

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta, money, num, percent, date, dateTime, count } from '../../lib/fmt.js';
import { button, errorState, icon } from '../../lib/ui.js';
import { printIcon } from '../components/print-button.js';

// ───────────────────────── أدوات العرض ─────────────────────────

const code = (v) => (v == null || v === '' ? '—' : h('span.pr-code', { dir: 'ltr', translate: 'no' }, String(v)));
const ltrText = (v) => h('span', { dir: 'ltr' }, String(v));
const dash = (v) => (v == null || v === '' ? '—' : v);

function section(title, ...children) {
  return h('section.pr-section', title && h('h2.pr-h2', title), children);
}

/** شبكة مفتاح/قيمة مدمجة للطباعة */
function kvGrid(pairs, { cols = 2 } = {}) {
  return h(
    'dl.pr-kv',
    { class: `pr-kv-${cols}` },
    pairs.filter(Boolean).map(([k, v]) => h('div.pr-kv-row', h('dt', k), h('dd', v == null || v === '' ? '—' : v))),
  );
}

/** جدول مطبوع: columns [{ label, render(row), align, width }] */
function prTable(columns, rows, { foot, empty = 'لا توجد بيانات', className } = {}) {
  return h(
    'div.pr-table-wrap',
    h(
      'table.pr-table',
      { class: className },
      h('thead', h('tr', columns.map((c) => h('th', { class: c.align && `al-${c.align}`, style: c.width ? { width: c.width } : null }, c.label)))),
      h(
        'tbody',
        rows.length
          ? rows.map((r) => h('tr', columns.map((c) => h('td', { class: c.align && `al-${c.align}` }, dash(c.render(r))))))
          : h('tr', h('td.pr-empty', { colspan: columns.length }, empty)),
      ),
      foot && h('tfoot', foot),
    ),
  );
}

function paragraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => h('p', { dir: 'auto' }, p));
}

function sumBox(items) {
  return h(
    'div.pr-sums',
    items.filter(Boolean).map(([k, v, tone]) => h('div.pr-sum', { class: tone && `is-${tone}` }, h('span.pr-sum-label', k), h('strong.pr-sum-value', v))),
  );
}

function signatures(items) {
  return h(
    'div.pr-signs',
    items.map(([title, name]) => h('div.pr-sign', h('div.pr-sign-title', title), name && h('div.pr-sign-name', name), h('div.pr-sign-line'))),
  );
}

function stamp(text = 'خاتم المؤسسة') {
  return h('div.pr-stamp', { 'aria-hidden': 'true' }, text);
}

// ───────────────────────── أنواع المستندات ─────────────────────────

function renderInvoice(doc) {
  const inv = doc.invoice;
  const m = doc.matter;
  return [
    h(
      'div.pr-parties',
      h('div.pr-party', h('div.pr-party-label', 'فاتورة إلى'), h('div.pr-party-name', doc.client?.name || 'المستفيد'), doc.client && h('div.pr-party-sub', 'كود المستفيد: ', code(doc.client.code))),
      h(
        'div.pr-party',
        h('div.pr-party-label', 'بيانات الملف'),
        m ? h('div.pr-party-name', m.title) : doc.case ? h('div.pr-party-name', doc.case.title) : '—',
        m && h('div.pr-party-sub', 'الملف المستمر: ', code(m.code)),
        doc.case && h('div.pr-party-sub', 'ملف الاستشارة: ', code(doc.case.code)),
        m && m.court && h('div.pr-party-sub', `${m.court}${m.circuit ? ` — ${m.circuit}` : ''}`),
        m && m.lawsuit_number && h('div.pr-party-sub', `الدعوى رقم ${m.lawsuit_number}${m.lawsuit_year ? ` لسنة ${m.lawsuit_year}` : ''}`),
      ),
    ),
    kvGrid([
      ['تاريخ الإصدار', date(inv.issued_at)],
      ['تاريخ الاستحقاق', date(inv.due_at)],
      ['حالة الفاتورة', inv.status_label],
    ], { cols: 3 }),
    prTable(
      [
        { label: 'م', render: () => '1', width: '8%', align: 'center' },
        { label: 'البيان', render: () => h('span', { dir: 'auto' }, inv.description) },
        { label: 'المبلغ', render: () => money(inv.amount), align: 'end', width: '24%' },
      ],
      [inv],
      {
        foot: [
          h('tr', h('th', { colspan: 2 }, 'الإجمالي'), h('th.al-end', money(inv.amount))),
          h('tr', h('td', { colspan: 2 }, 'المسدد'), h('td.al-end', money(inv.paid))),
          h('tr.pr-total', h('th', { colspan: 2 }, 'المتبقي'), h('th.al-end', money(inv.balance))),
        ],
      },
    ),
    h('p.pr-words', h('strong', 'المبلغ بالحروف: '), inv.amount_words),
    doc.payments.length > 0 &&
      section(
        'المدفوعات المسجلة على الفاتورة',
        prTable(
          [
            { label: 'رقم الإيصال', render: (p) => code(p.receipt_number) },
            { label: 'تاريخ الدفع', render: (p) => date(p.paid_at) },
            { label: 'طريقة الدفع', render: (p) => p.method },
            { label: 'المرجع', render: (p) => (p.reference ? ltrText(p.reference) : null) },
            { label: 'المبلغ', render: (p) => money(p.amount), align: 'end' },
          ],
          doc.payments,
        ),
      ),
    doc.note && h('p.pr-note', icon('info', { size: 14 }), ' ', doc.note),
    signatures([['المحاسب'], ['اعتماد الإدارة']]),
    stamp(),
  ];
}

function renderReceipt(doc) {
  const r = doc.receipt;
  const inv = doc.invoice;
  return [
    h(
      'div.pr-receipt',
      h('div.pr-receipt-amount', h('span', 'المبلغ'), h('strong', money(r.amount))),
      h(
        'div.pr-receipt-lines',
        h('p', 'استلمنا من السيد/السيدة: ', h('strong', doc.client?.name || '—'), doc.client ? [' (كود المستفيد ', code(doc.client.code), ')'] : null),
        h('p', 'مبلغًا وقدره: ', h('strong', money(r.amount)), ' — ', h('span.pr-words-inline', r.amount_words)),
        h('p', 'وذلك عن: ', h('span', { dir: 'auto' }, inv.description), ' — فاتورة رقم ', code(inv.number), doc.matter ? [' — الملف ', code(doc.matter.code)] : doc.case_code ? [' — الملف ', code(doc.case_code)] : null),
        h('p', 'طريقة الدفع: ', h('strong', r.method || 'نقدًا'), r.reference ? [' — المرجع: ', ltrText(r.reference)] : null),
        h('p', 'تاريخ الدفع: ', h('strong', date(r.paid_at))),
      ),
    ),
    sumBox([
      ['قيمة الفاتورة', money(inv.amount)],
      ['إجمالي المسدد حتى هذا الإيصال', money(inv.paid_to_date)],
      ['المتبقي بعد هذا الإيصال', money(inv.balance_after), inv.balance_after > 0 ? 'warning' : 'success'],
    ]),
    signatures([['المستلم', r.recorded_by], ['اعتماد الإدارة']]),
    stamp(),
    h('p.pr-note', 'هذا الإيصال لا يُعتد به إلا بعد ختمه بخاتم المؤسسة. يُرجى الاحتفاظ به.'),
  ];
}

const hasGreeting = (text) => /تحية طيبة|السلام عليكم|تحية وتقدير/.test(String(text || '').slice(0, 200));
const hasClosing = (text) => /(مع خالص التحية|وتفضلوا بقبول|مع أطيب التمنيات|مع تمنياتنا|وتفضلوا بقبول فائق)/.test(String(text || '').slice(-260));

/**
 * موضوع خطاب الإفادة: «إفادة قانونية بشأن نفقة الأبناء»، أما العنوان الذي يتضمن «بشأن» أو «بخصوص» أو يبدأ بـ«حول/عن»
 * (كثير من العناوين المقترحة آليًا مثل «نزاع بشأن تركة…») فيُفصل بشرطة حتى لا تتكرر «بشأن».
 */
export function answerSubject(title) {
  const t = String(title || '').trim();
  if (!t) return 'إفادة قانونية';
  if (/(^|\s)(بشأن|بخصوص|شأن)(\s|$)/.test(t) || /^(حول|عن)\s/.test(t)) return `إفادة قانونية — ${t}`;
  return `إفادة قانونية بشأن ${t}`;
}

function renderAnswer(doc, data) {
  const lh = data.letterhead;
  return [
    doc.is_draft && h('p.pr-draft-note', icon('alert', { size: 14 }), ' مسودة لم تُرسل للمستفيد بعد — غير معتمدة للتسليم.'),
    kvGrid([
      ['رقم الملف', code(doc.case.code)],
      ['المجال', doc.case.legal_area_label],
    ]),
    h('div.pr-letter', h('p.pr-to', 'إلى: ', h('strong', doc.recipient?.name || 'صاحب الشأن')), doc.recipient && h('p.pr-to-sub', 'كود المستفيد: ', code(doc.recipient.code))),
    h('p.pr-subject', h('strong', 'الموضوع: '), answerSubject(doc.case.title)),
    // نص الرد قد يتضمن تحيته وختامه (صيغ لإرساله عبر واتساب)؛ لا نكررهما في الخطاب
    !hasGreeting(doc.body) && h('p.pr-greeting', 'تحية طيبة وبعد،'),
    h('div.pr-letter-body', paragraphs(doc.body)),
    !hasClosing(doc.body) && h('p.pr-closing', 'وتفضلوا بقبول فائق الاحترام والتقدير،'),
    h('div.pr-org-sign', h('div.pr-org-sign-name', lh.org_legal_name), h('div', lh.program_name), stamp()),
    doc.disclaimer && h('p.pr-note.pr-disclaimer', doc.disclaimer),
  ];
}

function renderStatement(doc) {
  const t = doc.totals;
  const totalEntries = doc.entries.reduce((s, e) => s + Number(e.amount || 0), 0);
  return [
    kvGrid([
      ['المحامي', h('strong', doc.lawyer.name)],
      ['رقم القيد بالنقابة', doc.lawyer.bar_number ? ltrText(doc.lawyer.bar_number) : null],
      ['الفترة', doc.period_label],
      ['نوع الاتفاق', doc.agreement_type_label],
      ['الاتفاق', doc.agreement_text],
      doc.package_remaining != null && ['الرصيد المتبقي من الباقة', count(doc.package_remaining, 'consultation')],
    ]),
    sumBox([
      ['الرصيد الافتتاحي', money(t.opening)],
      ['المستحق خلال الفترة', money(t.accrued)],
      ['المصروف خلال الفترة', money(t.paid)],
      ['الرصيد الختامي المستحق', money(t.closing), t.closing > 0 ? 'warning' : 'success'],
    ]),
    t.closing_words && h('p.pr-words', h('strong', 'الرصيد الختامي بالحروف: '), t.closing_words),
    section(
      'قيود المستحقات خلال الفترة',
      prTable(
        [
          { label: 'التاريخ', render: (e) => date(e.date) },
          { label: 'البيان', render: (e) => h('span', { dir: 'auto' }, e.description) },
          { label: 'الملف', render: (e) => (e.matter_code ? code(e.matter_code) : e.case_code ? code(e.case_code) : null) },
          { label: 'النوع', render: (e) => e.kind_label },
          { label: 'الحالة', render: (e) => e.status_label },
          { label: 'المبلغ', render: (e) => money(e.amount), align: 'end' },
        ],
        doc.entries,
        { empty: 'لا توجد قيود خلال هذه الفترة', foot: doc.entries.length ? h('tr.pr-total', h('th', { colspan: 5 }, 'إجمالي القيود'), h('th.al-end', money(totalEntries))) : null },
      ),
    ),
    section(
      'المبالغ المصروفة خلال الفترة',
      prTable(
        [
          { label: 'تاريخ الصرف', render: (p) => date(p.paid_at) },
          { label: 'طريقة الصرف', render: (p) => p.method },
          { label: 'المرجع', render: (p) => (p.reference ? ltrText(p.reference) : null) },
          { label: 'المبلغ', render: (p) => money(p.amount), align: 'end' },
        ],
        doc.payouts,
        { empty: 'لم تُصرف مبالغ خلال هذه الفترة' },
      ),
    ),
    kvGrid([
      ['الاستشارات المعتمدة خلال الفترة', num(doc.approved_consultations)],
      ['المساهمات التطوعية', doc.contributions.count ? `${count(doc.contributions.count, 'consultation')} بقيمة تقديرية ${money(doc.contributions.value)}` : 'لا توجد'],
    ]),
    h('p.pr-note', 'الرصيد الختامي = الرصيد الافتتاحي + المستحق خلال الفترة − المصروف خلال الفترة. القيود الملغاة لا تظهر في الكشف.'),
    signatures([['المحاسب'], ['توقيع المحامي بالاستلام']]),
  ];
}

function renderCaseSummary(doc) {
  const c = doc.case;
  return [
    h('p.pr-confidential', icon('lock', { size: 14 }), ' سري — للاستخدام الداخلي في ملفات المؤسسة فقط. لا يُسلَّم للمستفيد ولا للمحامين.'),
    kvGrid([
      ['رقم الملف', code(c.code)],
      ['العنوان', c.title],
      ['المجال القانوني', c.legal_area_label],
      ['الحالة', c.status_label],
      ['الأولوية', c.priority_label],
      ['مدير الحالة', c.case_manager],
      ['المستفيد', doc.client ? h('span', doc.client.name || '—', ' — ', code(doc.client.code)) : null],
      ['المحافظة', doc.client?.governorate],
      ['تاريخ الفتح', date(c.created_at)],
      ['الموعد المستهدف', c.due_at ? date(c.due_at) : null],
      c.closed_at && ['تاريخ الإغلاق', date(c.closed_at)],
      c.outcome_label && ['النتيجة', c.outcome_label],
      ['مصدر المستفيد', c.source_label],
      ['قناة الوصول', c.channel_label],
      ['برنامج التمويل', doc.program ? h('span', code(doc.program.code), ' ', doc.program.name) : 'غير مرتبط ببرنامج'],
      ['الملف المستمر', doc.matter ? h('span', code(doc.matter.code), ` — ${doc.matter.status_label}`) : null],
    ]),
    section('ملخص الوقائع (المتاح للمحامين)', c.facts_shared ? h('div.pr-text', paragraphs(c.facts_shared)) : h('p.pr-muted', 'لم يُكتب ملخص.')),
    c.facts_internal && section('ملاحظات داخلية', h('div.pr-text', paragraphs(c.facts_internal))),
    section(
      'المسائل القانونية',
      doc.issues.length
        ? h('ol.pr-issues', doc.issues.map((i) => h('li', h('strong', i.title), i.status !== 'active' ? ` (${i.status_label})` : '', i.legal_area_label ? ` — ${i.legal_area_label}` : '', i.details && h('div.pr-muted', { dir: 'auto' }, i.details))))
        : h('p.pr-muted', 'لا توجد مسائل مسجلة.'),
    ),
    section(
      'فريق العمل',
      prTable(
        [
          { label: 'المحامي', render: (a) => a.lawyer_name },
          { label: 'الدور', render: (a) => a.role_label },
          { label: 'الحالة', render: (a) => a.status_label },
          { label: 'الإسناد', render: (a) => date(a.assigned_at) },
          { label: 'التقديم', render: (a) => (a.submitted_at ? date(a.submitted_at) : null) },
          { label: 'الاعتماد', render: (a) => (a.approved_at ? date(a.approved_at) : null) },
          { label: 'المقابل', render: (a) => a.fee_mode_label },
        ],
        doc.team,
        { empty: 'لم يُسند الملف لأي محامٍ' },
      ),
    ),
    doc.requests.length > 0 &&
      section(
        'طلبات المعلومات والمستندات',
        prTable(
          [
            { label: 'النوع', render: (r) => r.kind_label },
            { label: 'الطلب', render: (r) => h('span', { dir: 'auto' }, r.question) },
            { label: 'الحالة', render: (r) => r.status_label },
            { label: 'التاريخ', render: (r) => date(r.created_at) },
          ],
          doc.requests,
        ),
      ),
    doc.answers.length > 0 &&
      section(
        'الردود على المستفيد',
        prTable(
          [
            { label: 'الحالة', render: (a) => a.status_label },
            { label: 'تاريخ الإرسال', render: (a) => (a.sent_at ? dateTime(a.sent_at) : null) },
            { label: 'القناة', render: (a) => a.channel_label },
          ],
          doc.answers,
        ),
      ),
    doc.documents.length > 0 &&
      section(
        `المستندات (${count(doc.documents.length, 'document')})`,
        prTable(
          [
            { label: 'المستند', render: (d) => h('span', { dir: 'auto' }, d.title) },
            { label: 'المصدر', render: (d) => d.by },
            { label: 'التاريخ', render: (d) => date(d.created_at) },
          ],
          doc.documents,
        ),
      ),
    doc.cost &&
      section(
        'تكلفة الملف',
        sumBox([
          ['مباشرة', money(doc.cost.direct)],
          ['مصروفات', money(doc.cost.expenses)],
          ['حصة تقديرية', money(doc.cost.allocated)],
          ['الإجمالي', money(doc.cost.total), 'warning'],
          doc.cost.pro_bono_value ? ['قيمة المساهمات التطوعية', money(doc.cost.pro_bono_value), 'success'] : null,
        ]),
      ),
    section(
      doc.timeline_total > doc.timeline.length ? `السجل الزمني (أحدث ${num(doc.timeline.length)} من ${count(doc.timeline_total, ['حدث', 'حدثين', 'أحداث', 'حدثًا'])})` : 'السجل الزمني',
      prTable(
        [
          { label: 'التاريخ', render: (e) => dateTime(e.at), width: '22%' },
          { label: 'الحدث', render: (e) => h('span', { dir: 'auto' }, e.summary) },
          { label: 'الفاعل', render: (e) => e.actor, width: '22%' },
        ],
        doc.timeline,
        { empty: 'لا توجد أحداث', className: 'pr-table-compact' },
      ),
    ),
  ];
}

function renderProgramme(doc) {
  const p = doc.program;
  const s = doc.stats;
  const im = doc.impact || {};
  const pct = s.utilization == null ? 0 : Math.min(100, s.utilization * 100);
  return [
    kvGrid([
      ['البرنامج', h('strong', p.name)],
      ['رقم البرنامج', code(p.code)],
      ['الجهة الممولة', p.funder_name],
      ['نوع التمويل', p.funder_type_label],
      ['رقم الاتفاقية', p.agreement_ref ? code(p.agreement_ref) : null],
      ['المدة', `${date(p.start_date)} — ${p.end_date ? date(p.end_date) : 'مفتوحة'}`],
      ['الحالة', p.status_label],
      ['التقرير حتى تاريخ', date(doc.date)],
      ['المجالات المشمولة', p.eligible_areas.length ? p.eligible_areas.join('، ') : 'كل المجالات'],
      ['النطاق الجغرافي', p.eligible_governorates.length ? p.eligible_governorates.join('، ') : 'على مستوى الجمهورية'],
    ]),
    p.description && h('div.pr-text', paragraphs(p.description)),
    section(
      'الموقف المالي',
      sumBox([
        ['الميزانية', money(s.budget)],
        ['الإنفاق الفعلي', money(s.spend)],
        ['المتبقي', money(s.remaining), s.remaining < 0 ? 'danger' : 'success'],
        ['نسبة الإنفاق', s.utilization == null ? '—' : percent(s.utilization)],
        ['معدل الإنفاق الشهري', money(s.burn_rate_monthly)],
        s.projected_total != null && ['المتوقع حتى نهاية المدة', money(s.projected_total)],
      ]),
      h('div.pr-meter', h('span.pr-meter-fill', { style: { width: `${pct}%` } })),
      h('p.pr-muted', `${s.forecast_label}${s.elapsed_ratio != null ? ` — انقضى ${percent(s.elapsed_ratio)} من مدة البرنامج` : ''}.`),
      prTable(
        [
          { label: 'البند', render: (r) => r.label },
          { label: 'المبلغ', render: (r) => money(r.amount), align: 'end' },
          { label: 'النسبة', render: (r) => (s.spend > 0 ? percent(r.amount / s.spend) : '—'), align: 'end' },
        ],
        doc.by_category,
        { foot: h('tr.pr-total', h('th', 'الإجمالي'), h('th.al-end', money(s.spend)), h('th.al-end', s.spend > 0 ? percent(1) : '—')) },
      ),
      s.in_kind_count > 0 && h('p.pr-muted', `إضافة إلى ذلك قدّم محامون متطوعون وشركاء مسؤولية مجتمعية ${count(s.in_kind_count, 'consultation')} بقيمة تقديرية ${money(s.in_kind_value)} دون خصم من الميزانية.`),
    ),
    doc.monthly.length > 0 &&
      section(
        'الإنفاق الشهري',
        prTable(
          [
            { label: 'الشهر', render: (m) => m.label },
            { label: 'الإنفاق', render: (m) => money(m.amount), align: 'end' },
            { label: 'الإجمالي التراكمي', render: (m) => money(m.cumulative), align: 'end' },
          ],
          doc.monthly,
          { className: 'pr-table-compact' },
        ),
      ),
    section(
      'المستفيدون والنتائج',
      sumBox([
        ['الأسر المستفيدة', num(s.families)],
        ['الملفات', num(s.cases)],
        ['المغلقة', num(s.closed_cases)],
        ['أُرسل فيها رد للمستفيد', num(s.answered)],
        ['ملفات مستمرة (تقاضٍ)', num(s.matters)],
        ['جلسات حُضرت', num(im.hearings_attended || 0)],
      ]),
      h(
        'div.pr-cols',
        prTable([{ label: 'نتيجة الملفات المغلقة', render: (o) => o.label }, { label: 'العدد', render: (o) => num(o.count), align: 'end' }], im.outcomes || [], { empty: 'لم يُغلق أي ملف بعد', className: 'pr-table-compact' }),
        prTable([{ label: 'المجال القانوني', render: (o) => o.label }, { label: 'الملفات', render: (o) => num(o.cases), align: 'end' }], im.by_area || [], { className: 'pr-table-compact' }),
        prTable([{ label: 'المحافظة', render: (o) => o.label }, { label: 'الأسر', render: (o) => num(o.families), align: 'end' }], im.by_governorate || [], { className: 'pr-table-compact' }),
      ),
      im.external && Array.isArray(im.external.items) && im.external.items.length > 0 && kvGrid(im.external.items.map((x) => [x.label, x.value == null ? '—' : String(x.value)])),
    ),
    section(
      'الملفات الممولة من البرنامج',
      prTable(
        [
          { label: 'الملف', render: (c) => code(c.code) },
          { label: 'المجال', render: (c) => c.legal_area_label },
          { label: 'المحافظة', render: (c) => c.governorate },
          { label: 'الحالة', render: (c) => c.outcome_label || c.status_label },
          { label: 'تاريخ الفتح', render: (c) => date(c.opened_at) },
          { label: 'الإنفاق', render: (c) => money(c.spend), align: 'end' },
        ],
        doc.cases,
        { empty: 'لا توجد ملفات مرتبطة بالبرنامج', className: 'pr-table-compact' },
      ),
    ),
    p.restrictions && section('قيود الصرف وشروط الجهة الممولة', h('div.pr-text', paragraphs(p.restrictions))),
    h('p.pr-note', 'أُعد هذا التقرير آليًا من منصة التشغيل القانوني. لا يتضمن أسماء المستفيدين أو بيانات التواصل معهم حفاظًا على خصوصيتهم؛ وتحتفظ المؤسسة بالمستندات المؤيدة للإنفاق لدى الإدارة المالية.'),
    signatures([['مدير البرنامج'], ['المدير المالي'], ['اعتماد الإدارة التنفيذية']]),
  ];
}

const RENDERERS = {
  invoice: renderInvoice,
  receipt: renderReceipt,
  answer: renderAnswer,
  statement: renderStatement,
  'case-summary': renderCaseSummary,
  programme: renderProgramme,
};

/** المستندات الموجهة للمستفيد لا يظهر فيها اسم من طبعها */
const CLIENT_FACING = new Set(['invoice', 'receipt', 'answer']);

// ───────────────────────── الترويسة والتذييل ─────────────────────────

function letterheadOf(data) {
  const s = getMeta().settings || {};
  const lh = data && data.letterhead ? data.letterhead : {};
  return {
    org_legal_name: lh.org_legal_name || s.org_legal_name || s.org_name || 'بيوت مصر',
    registration: lh.registration || s.org_registration || '',
    address: lh.address || s.org_address || '',
    phone: lh.phone || s.org_phone || '',
    email: lh.email || s.org_email || '',
    facebook: lh.facebook || s.org_facebook_url || '',
    program_name: lh.program_name || 'برنامج الدعم القانوني',
  };
}

function letterheadEl(data) {
  const lh = letterheadOf(data);
  return h(
    'header.pr-letterhead',
    h(
      'div.pr-brand',
      h('span.pr-logo', { 'aria-hidden': 'true' }, icon('scale', { size: 30 })),
      h('div.pr-brand-text', h('div.pr-org', lh.org_legal_name), lh.registration && h('div.pr-reg', lh.registration), h('div.pr-program', lh.program_name)),
    ),
    h(
      'div.pr-docmeta',
      h('div.pr-doc-row', h('span', 'الرقم: '), code(data.number)),
      h('div.pr-doc-row', h('span', 'التاريخ: '), h('span', date(data.date))),
    ),
  );
}

function footerEl(data, kind) {
  const lh = letterheadOf(data);
  const contact = [lh.address, lh.phone && h('span', 'هاتف: ', ltrText(lh.phone)), lh.email && ltrText(lh.email), lh.facebook && ltrText(lh.facebook.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))].filter(Boolean);
  return h(
    'footer.pr-footer',
    h(
      'div.pr-footer-contact',
      contact.map((c, i) => [i > 0 && h('span.pr-sep', { 'aria-hidden': 'true' }, ' • '), c]),
    ),
    h(
      'div.pr-footer-meta',
      `${data.kind_label} رقم `,
      code(data.number),
      ` — طُبع في ${dateTime(data.printed_at)}`,
      !CLIENT_FACING.has(kind) && data.printed_by ? ` بواسطة ${data.printed_by}` : '',
    ),
  );
}

// ───────────────────────── الصفحة ─────────────────────────

function monthInput(value, labelText) {
  const id = `pr-${labelText === 'من' ? 'from' : 'to'}`;
  const input = h('input.input.pr-month', { type: 'month', id, value: value || '', dir: 'ltr' });
  return { input, el: h('label.pr-period-field', { htmlFor: id }, h('span', labelText), input) };
}

function toolbar(ctx, { canPrint, kind, id, data }) {
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else {
      window.close();
      setTimeout(() => ctx.navigate('/'), 300);
    }
  };
  const extra = [];
  if (kind === 'statement' && data) {
    const from = monthInput(data.document.from, 'من');
    const to = monthInput(data.document.to, 'إلى');
    extra.push(
      h(
        'form.pr-period',
        {
          onSubmit: (e) => {
            e.preventDefault();
            const q = new URLSearchParams(Object.entries({ from: from.input.value, to: to.input.value }).filter(([, v]) => v)).toString();
            ctx.navigate(`/print/statement/${id}${q ? `?${q}` : ''}`);
          },
        },
        from.el,
        to.el,
        button('تحديث الفترة', { type: 'submit', size: 'sm', icon: 'refresh' }),
      ),
    );
  }
  return h(
    'div.print-toolbar.no-print',
    h(
      'div.print-toolbar-row',
      canPrint &&
        h(
          'button.btn.btn-primary',
          { type: 'button', onClick: () => window.print() },
          printIcon(18),
          h('span.btn-label', 'طباعة أو حفظ PDF'),
        ),
      button('رجوع', { icon: 'arrowRight', variant: 'ghost', onClick: back }),
      canPrint && h('span.print-toolbar-hint', 'لحفظ نسخة إلكترونية اختر «حفظ بتنسيق PDF» من نافذة الطباعة، واضبط الورق على A4.'),
    ),
    extra,
  );
}

export default async function render(ctx) {
  const kind = String(ctx.params.kind || '');
  const id = String(ctx.params.id || '');
  const query = { ...(ctx.query || {}) };
  const auto = query.auto === '1';
  delete query.auto;

  if (!RENDERERS[kind]) {
    ctx.setTitle('مستند غير معروف');
    return h('div.print-root', toolbar(ctx, { canPrint: false, kind, id }), h('div.print-sheet.is-error', errorState({ status: 404, message: 'نوع المستند المطلوب غير معروف' })));
  }

  let data;
  try {
    data = await api.get(`/print/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, query);
  } catch (err) {
    ctx.setTitle('تعذر تحميل المستند');
    return h('div.print-root', toolbar(ctx, { canPrint: false, kind, id }), h('div.print-sheet.is-error', errorState(err, () => ctx.reload())));
  }

  ctx.setTitle(`${data.kind_label} ${data.number}`);
  const doc = data.document;
  const watermark = (kind === 'answer' && doc.is_draft && 'مسودة') || (kind === 'invoice' && doc.invoice.status === 'cancelled' && 'ملغاة') || null;
  const paidStamp = kind === 'invoice' && doc.invoice.status === 'paid';

  const body = h(
    'div.pr-body',
    paidStamp && h('div.pr-paid-stamp', { 'aria-hidden': 'true' }, 'مسددة'),
    h('h1.pr-title', data.title),
    RENDERERS[kind](doc, data),
  );
  const sheet = h(
    'article.print-sheet',
    { class: [`pr-kind-${kind}`, watermark && 'has-watermark'], 'aria-label': `${data.kind_label} رقم ${data.number}` },
    watermark && h('div.pr-watermark', { 'aria-hidden': 'true' }, watermark),
    h(
      'table.print-frame',
      { role: 'presentation' },
      h('thead', h('tr', h('td', letterheadEl(data)))),
      h('tbody', h('tr', h('td', body))),
      h('tfoot', h('tr', h('td', footerEl(data, kind)))),
    ),
  );

  if (auto) {
    // لا يُعاد فتح حوار الطباعة عند تحديث الصفحة
    try {
      const qs = new URLSearchParams(query).toString();
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/print/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
    } catch {
      /* لا شيء */
    }
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => setTimeout(() => {
      if (sheet.isConnected) window.print();
    }, 350));
  }

  return h('div.print-root', toolbar(ctx, { canPrint: true, kind, id, data }), sheet, mount(h('div.sr-only', { role: 'status' }), `المستند جاهز للطباعة: ${data.kind_label}`));
}
