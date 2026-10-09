// v10 b2b-staff (STF-3، U10-S11/S12) — «بدء العمل على الطلب»: ورقة القبول معبأة من الفرز، كل حقل قابل للتعديل.
// التصنيف · الموعد (سطر حي) · الباقة · الجودة · ما يراه المحامي · الفريق · رسالة للشركة. كل 409 يُعالج داخل الورقة دون
// فقد القيم، والإغلاق بإيماءة يسأل «تجاهل ما كتبته؟» إن تغيّر نص (L-64). وضع «خطة البدء» (planMode) يعيد الجسم دون إرسال
// (لعرض السعر، L-61). الخادم ينقّي ما يصل المحامي من بيانات موظفي الشركة؛ الورقة تنبّه قبل الإرسال أيضًا.

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, areaOptions, isoToCairoDate, money } from '../../lib/fmt.js';
import { modal, form, button, badge, icon, alertBox, toast, errorMessage, discardGuard, setBusy } from '../../lib/ui.js';
import { REQUEST_TYPES, B2B_SKILLS, typeByKey, PRIORITIES as CAT_PRIORITIES, labelOf } from '../../lib/company-catalog.js';
import { calendars, calendarsFromJson, dueAt } from '../../lib/company-sla.js';
import { haptic } from '../../lib/haptics.js';
import { whenText, hoursPhrase } from '../pages/admin/company-requests.js';

const SIZES = [
  { value: 'S', label: 'S — صغير' },
  { value: 'M', label: 'M — متوسط' },
  { value: 'L', label: 'L — كبير' },
  { value: 'XL', label: 'XL — كبير جدًا' },
];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
const PARTY_ROLES = [
  { value: 'related', label: 'طرف ذو صلة' },
  { value: 'opponent', label: 'خصم' },
];
const CP_FIELDS = ['counterparty_name', 'sender_name', 'supplier_name'];
/** gate J-02: أسباب الفرز التي تبرر الاختيار المسبق (src/ai/company.js MEMORY_WHY) */
const STRONG_WHY = new Set(['نفس الطرف الآخر', 'نموذج معتمد لنفس النوع']);
/** مفتاح الطرف للمقارنة (مثل counterpartyNorm على الخادم): توحيد الحروف وحذف «شركة/مؤسسة/ش م م» */
export function cpKey(name) {
  const s = ` ${String(name || '')
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  return s.replace(/ (?:شركه|مؤسسه|ش م م)(?= )/gu, ' ').replace(/\s+/g, ' ').trim();
}
const STAFF_DISCARD = { singular: true };
/** قيم الورقة بعد «مراجعة التغييرات» تبقى لهذه الجلسة فقط (لا تخزين في المتصفح) */
const drafts = new Map();
/** أخطاء الإسناد بعد قبول ناجح (U10-S11): تبقى ظاهرة في صفحة الطلب حتى تُغلق — requestId → [{role, lawyer_name, error}] */
export const assignNotices = new Map();

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// review: نفس صيغ الاسم التي ينقّيها الخادم (src/ai/redact.js): الاسم الكامل، والاسم الثنائي، والاسم الأول (4 حروف فأكثر
// وليس جزءًا شائعًا مثل «محمد» و«عبد»)، مع تسامح ة/ه وأ/إ/آ/ا وى/ي، وحدود كلمة عربية (لا يطابق داخل كلمة أخرى).
const STOP_NAME_PARTS = new Set(['عبد', 'على', 'علي', 'ابو', 'أبو', 'بن', 'بنت', 'ال', 'الله', 'محمد', 'احمد', 'أحمد']);
const tolerant = (s) => esc(s).replace(/[ةه]/g, '[ةه]').replace(/[اأإآ]/g, '[اأإآ]').replace(/[ىي]/g, '[ىي]').replace(/\s+/g, '\\s*');
function nameVariants(full) {
  const clean = String(full || '').replace(/^(?:أ\.|د\.|م\.|الأستاذ|الاستاذ|الأستاذة|الاستاذة)\s*/, '').trim();
  if (!clean) return [];
  const parts = clean.split(/\s+/);
  const out = [clean];
  if (parts.length >= 2) out.push(parts.slice(0, 2).join(' '));
  if (parts[0].length >= 4 && !STOP_NAME_PARTS.has(parts[0])) out.push(parts[0]);
  return [...new Set(out)];
}
/**
 * نمط يطابق الاسم كلمةً مستقلة (مع حرف عطف/جر ملتصق: «وحسام»، «لمريم عادل») — اسم المجموعة الأولى ما قبله.
 * gate K2/J-04: الاسم الأول وحده يقبل حرف العطف (و/ف) فقط كما في الخادم: «لدينا» ليست «ل» + «دينا».
 */
const nameRe = (v, flags = 'u') => {
  const c = /\s/.test(v) ? '[وفبل]' : '[وف]';
  return new RegExp(`(^|[^\\p{L}\\p{M}]${c}?|^${c})${tolerant(v)}(?=$|[^\\p{L}\\p{M}])`, flags);
};
/**
 * أسماء موظفي الشركة وبريدهم وهواتفهم الظاهرة في نص (تنبيه مسبق؛ الخادم ينقّي على أي حال، L-57).
 * يعيد النصوص كما وردت في النص (لتُحذف بنقرة)، الأطول أولًا.
 */
export function companyPeopleIn(text, people = []) {
  let rest = String(text || '');
  const hits = [];
  for (const p of people) {
    for (const v of [p.email, p.phone]) {
      const s = String(v || '').trim();
      if (s.length >= 3 && new RegExp(esc(s), 'i').test(rest)) {
        hits.push(s);
        rest = rest.replace(new RegExp(esc(s), 'gi'), ' ');
      }
    }
  }
  // الأطول أولًا، ويُحذف ما وُجد من النص قبل فحص الأقصر: «مريم عادل» وحدها لا تُعد مرة أخرى «مريم»
  const variants = people.flatMap((p) => nameVariants(p.name)).sort((a, b) => b.length - a.length);
  for (const v of [...new Set(variants)]) {
    const m = nameRe(v).exec(rest);
    if (!m) continue;
    hits.push(m[0].slice(m[1].length).trim());
    rest = rest.replace(nameRe(v, 'gu'), (x, pre) => `${pre} `);
  }
  return [...new Set(hits)];
}
/** يحذف ما وجده companyPeopleIn: الاسم ← «موظف في الشركة»، البريد والهاتف ← وسم عام (بحدود الكلمة للأسماء) */
export function removeCompanyPeople(text, hits = []) {
  let s = String(text || '');
  for (const x of hits) {
    if (x.includes('@')) s = s.replace(new RegExp(esc(x), 'gi'), '[بريد إلكتروني]');
    else if (/^\+?\d[\d\s-]*$/.test(x)) s = s.split(x).join('[رقم هاتف]');
    else s = s.replace(nameRe(x, 'gu'), (m, pre) => `${pre}موظف في الشركة`);
  }
  return s;
}

/**
 * @param {object} o
 * @param {object} o.detail صفحة الطلب للفريق (GET /admin/company-requests/:id)
 * @param {object} o.user المستخدم الحالي
 * @param {object} [o.plan] خطة بدء محفوظة تُعبأ منها الورقة
 * @param {boolean} [o.planMode] «حفظ الخطة» بدل الإرسال — onPlanSaved(body, summary)
 * @param {(res:object)=>void} [o.onDone]
 */
export async function openAcceptSheet({ detail, user = {}, plan = null, planMode = false, onDone, onPlanSaved, onDecline } = {}) {
  let d = detail;
  const r = d.request;
  const isAdmin = user.role === 'admin';
  const t = (d.triage && d.triage.output) || {};
  const [lead, reviewer, companyView, staff, memory, b2b] = await Promise.all([
    api.get(`/admin/company-requests/${r.id}/suggest-lawyers`, { role: 'lead' }).catch(() => ({ items: [], excluded: [] })),
    api.get(`/admin/company-requests/${r.id}/suggest-lawyers`, { role: 'reviewer' }).catch(() => ({ items: [], excluded: [] })),
    api.get(`/admin/companies/${d.company.id}`).catch(() => null),
    api.get('/admin/staff').catch(() => []),
    api.get(`/admin/companies/${d.company.id}/memory`).catch(() => ({ items: [] })),
    // gate K5: تقويم خدمة الشركات الفعلي يصل مع صفحة الطلب (d.calendar) لكل فريق المكتب؛ إعدادات مدير النظام احتياط لخادم أقدم
    !detail.calendar && isAdmin ? api.get('/admin/b2b/settings', null, { background: true }).catch(() => null) : null,
  ]);
  const terms = (companyView && companyView.subscription && companyView.subscription.terms) || {};
  const people = (companyView && companyView.users) || (d.submitter ? [d.submitter] : []);
  const saved = drafts.get(r.id) || null;
  const p = saved || plan || {};
  const fields = r.fields || {};
  const spec = typeByKey(r.type) || {};

  // ── قيم البداية ──
  const triageMemIds = (t.memory_refs || []).map((x) => /^M-(\d+)$/.exec(x.ref || '')).filter(Boolean).map((m) => Number(m[1]));
  const linkedIds = (d.memory_refs || []).map((m) => m.id);
  const memItems = (memory.items || []).filter((m) => m.kind !== 'person' && !m.archived);
  const whyOf = new Map((t.memory_refs || []).map((x) => [x.ref, x.why]));
  const offered = new Set(memItems.map((m) => m.id)); // «المفوَّضون» والمؤرشف لا يُعرضون ولا يُرسلون (L-57)
  // gate J-02: يُختار مسبقًا ما ربطته الشركة بالطلب، وما يخص الطرف الآخر نفسه، والنموذج المعتمد لنفس النوع فقط؛
  // باقي اقتراحات الفرز تظهر بسببها دون اختيار (يصل للمحامي ما يختاره الفريق صراحةً)
  const reqCps = new Set(CP_FIELDS.map((k) => fields[k]).filter(Boolean).map(cpKey));
  const cpMatch = (m) => !!(m.counterparty && m.counterparty.name && reqCps.has(cpKey(m.counterparty.name)));
  const strongTriage = (t.memory_refs || []).filter((x) => STRONG_WHY.has(String(x.why || '').replace(/[.\s]+$/, ''))).map((x) => /^M-(\d+)$/.exec(x.ref || '')).filter(Boolean).map((m) => Number(m[1]));
  const preselect = [...new Set([...linkedIds, ...memItems.filter(cpMatch).map((m) => m.id), ...strongTriage])];
  const initialMem = (p.memory_ids ? p.memory_ids.map(Number) : preselect).filter((mid) => offered.has(mid));
  const whyFor = (m) => whyOf.get(`M-${m.id}`) || (linkedIds.includes(m.id) ? 'ربطته الشركة بالطلب' : cpMatch(m) ? 'نفس الطرف الآخر' : null);
  void triageMemIds;
  const parties = Array.isArray(p.counterparties)
    ? p.counterparties.map((x) => ({ ...x }))
    : CP_FIELDS.filter((k) => fields[k]).map((k) => ({ name: String(fields[k]), role: spec.party_role === 'opponent' ? 'opponent' : 'related' }));
  const requestDocs = (d.documents || []).filter((x) => x.company_request_id === r.id);
  const initialDocs = p.document_ids ? p.document_ids.map(Number) : requestDocs.map((x) => x.id);
  const handlerDefault = p.handler_id || r.handler_id || d.company.account_manager?.id || user.id || '';
  const v0 = {
    type: p.type || r.type,
    practice_area: p.practice_area || r.practice_area || t.practice_area || spec.default_area,
    skills: p.skills || (r.skills && r.skills.length ? r.skills : t.skills) || spec.default_skills || [],
    size: p.size || r.size || t.effort?.size || spec.default_size || 'M',
    priority: p.priority || r.priority || 'normal',
    requires_senior_review: p.requires_senior_review ?? (r.requires_senior_review || !!(t.senior_review ?? t.senior_review_recommended)),
    risk_level: p.risk_level || r.risk_level || '',
    case_title: p.case_title || r.title,
    brief_for_lawyer: p.brief_for_lawyer || t.brief_for_lawyer || '',
    issues: (Array.isArray(p.issues) ? p.issues : t.issues || []).slice(0, 8).join('\n'),
    note_to_company: p.note_to_company || '',
    handler_id: handlerDefault ? String(handlerDefault) : '',
  };
  const textKeys = ['case_title', 'brief_for_lawyer', 'issues', 'note_to_company'];

  let leadId = p.assign?.lead?.lawyer_id ? Number(p.assign.lead.lawyer_id) : lead.items?.[0]?.id || null;
  let reviewerId = p.assign?.reviewer?.lawyer_id ? Number(p.assign.reviewer.lawyer_id) : null;
  let force = { lead: !!p.assign?.lead?.force, reviewer: !!p.assign?.reviewer?.force };
  let manualDue = !!p.delivery_due_at;
  let conflictAck = !!p.conflict_ack;
  let free = p.quota === 'free';
  const selectedMem = new Set(initialMem);
  const selectedDocs = new Set(initialDocs);
  let handle = null;
  let finished = null;

  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });

  // ── التصنيف ──
  const fClass = form(
    [
      { name: 'type', label: 'النوع', type: 'select', required: true, placeholder: false, options: REQUEST_TYPES.map((x) => ({ value: x.key, label: x.label })) },
      { name: 'practice_area', label: 'المجال', type: 'select', required: true, placeholder: false, options: areaOptions() },
      { name: 'skills', label: 'المهارات', type: 'multiselect', options: B2B_SKILLS.map((s) => ({ value: s.key, label: s.label })), full: true },
      {
        name: 'size',
        label: 'الحجم',
        type: 'select',
        required: true,
        placeholder: false,
        options: SIZES,
        hint: t.effort ? `الفرز: ≈ ${t.effort.hours_min}–${t.effort.hours_max} ساعات عمل (${t.effort.size})` : null,
        onChange: () => drawDue(),
      },
      // gate C-12: كلمات الاستعجال نفسها التي تراها الشركة (الكتالوج): عاجل · مرتفع · عادي · منخفض
      { name: 'priority', label: 'الاستعجال', type: 'select', required: true, placeholder: false, options: PRIORITIES.map((k) => ({ value: k, label: labelOf(CAT_PRIORITIES, k) })), onChange: () => drawDue() },
    ],
    { values: v0, footer: false },
  );

  // ── الموعد ──
  const dueLine = h('p.cs-due-line', { 'aria-live': 'polite' });
  const fDue = form(
    [
      { name: 'delivery_due_at', label: 'موعد التسليم (يدويًا)', type: 'datetime' },
      { name: 'due_reason', label: 'السبب', type: 'text', maxLength: 300, hint: 'يراه فريق العمل والشركة مع الموعد.' },
    ],
    { values: { delivery_due_at: p.delivery_due_at || null, due_reason: p.due_reason || '' }, footer: false },
  );
  const manualToggle = h('input', {
    type: 'checkbox',
    checked: manualDue,
    onChange: () => {
      manualDue = manualToggle.checked;
      drawDue();
    },
  });
  const cals = d.calendar ? calendarsFromJson(d.calendar) : calendars(b2b && b2b.values ? { ...b2b.values, office_hours_schedule: b2b.office_hours_schedule } : {});
  function computedDue() {
    const vals = fClass.getValues();
    const sla = terms.sla && terms.sla[vals.priority];
    if (!sla || vals.size === 'XL') return null;
    const factor = Number(terms.size_factor?.[vals.size] ?? 1) || 1;
    const hours = Math.round(Number(sla.delivery_hours) * factor * 100) / 100;
    return { at: dueAt(new Date().toISOString(), hours, sla.clock, cals), base: Number(sla.delivery_hours), factor, clock: sla.clock, hours };
  }
  function drawDue() {
    const size = fClass.getValues().size;
    const xl = size === 'XL';
    if (xl && !manualDue) {
      manualDue = true;
      manualToggle.checked = true;
    }
    fDue.el.hidden = !manualDue;
    const c = computedDue();
    const lines = [];
    if (manualDue) {
      const at = fDue.getValues().delivery_due_at;
      lines.push(h('span', at ? `موعد التسليم للشركة: ${whenText(at)} (محدد يدويًا)` : 'حدد موعد التسليم يدويًا.'));
      if (xl) lines.push(h('span.cs-note', 'حدد موعد التسليم يدويًا للطلبات الكبيرة جدًا.'));
    } else if (c) {
      lines.push(h('span', `موعد التسليم للشركة: ${whenText(c.at)} (${hoursPhrase(c.base, c.clock)} × `, h('span.num', String(c.factor)), ')'));
    } else lines.push(h('span.muted', 'يُحسب الموعد عند بدء العمل.'));
    const due = manualDue ? fDue.getValues().delivery_due_at : c && c.at;
    if (r.needed_by && due && isoToCairoDate(due) > r.needed_by) {
      lines.push(h('span.cs-warn', icon('alert', { size: 14 }), ` الموعد الذي طلبته الشركة (${r.needed_by}) قبل موعد التسليم المحسوب (${whenText(due)}).`));
    }
    mount(dueLine, lines);
    drawPreview();
  }
  fDue.el.addEventListener('change', drawDue);

  // ── الباقة ──
  const sc = d.scope_check || {};
  const q = sc.quota || {};
  const quotaLine = h('p.cs-quota');
  const freeBox = isAdmin
    ? h(
        'label.check',
        h('input', {
          type: 'checkbox',
          checked: free,
          onChange: (e) => {
            free = e.target.checked;
            drawQuota();
          },
        }),
        h('span', 'مجانًا — بقرار الإدارة'),
      )
    : null;
  // gate J-01/K1: عرض سعر وافقت عليه الشركة يحدد الاحتساب (الخادم يلتزم به في كل مسار؛ لا «مجانًا» ولا طلب مشمول فوقه)
  const approvedQuote = ['out_of_scope', 'overage'].includes(r.quota_kind) ? [...(d.quotes || [])].reverse().find((x) => x.status === 'approved') || null : null;
  if (approvedQuote && freeBox) freeBox.hidden = true;
  function drawQuota() {
    let text;
    if (approvedQuote) {
      text = `${r.quota_kind === 'overage' ? 'طلب إضافي فوق الباقة' : 'خارج الباقة'} — وفق عرض السعر المعتمد ${approvedQuote.number}، ولا يُحتسب من الطلبات المشمولة`;
      mount(quotaLine, h('strong', 'النطاق: '), r.quota_kind === 'out_of_scope' ? 'خارج الباقة' : 'ضمن الباقة', ' · ', h('strong', 'الاحتساب: '), text);
      return;
    }
    if (free) text = 'مجانًا — بقرار الإدارة (يُسجَّل في سجل الأمان)';
    else if (!sc.in_plan) text = `خارج الباقة: ${(sc.reason_labels || []).join('، ')}`;
    else if (q.unlimited) text = 'من الطلبات المشمولة (غير محدودة)';
    else if (sc.would_be === 'overage') text = 'تكلفة إضافية — استنفدت الشركة الطلبات المشمولة في دورتها';
    else text = `من الطلبات المشمولة (${(Number(q.used) || 0) + 1} من ${q.included ?? '—'} بعد هذا الطلب)`;
    mount(quotaLine, h('strong', 'النطاق: '), sc.in_plan ? 'ضمن الباقة' : 'خارج الباقة', ' · ', h('strong', 'الاحتساب: '), text);
  }

  // ── الجودة ──
  const fQuality = form(
    [
      {
        name: 'requires_senior_review',
        type: 'checkbox',
        label: 'مراجعة نهائية مطلوبة',
        full: true,
        hint: `الباقة: ${label('company_senior_review', terms.senior_review) || '—'}${t.senior_review ?? t.senior_review_recommended ? ' · الفرز: مقترحة' : ''}`,
        onChange: () => drawTeam(),
      },
      { name: 'risk_level', label: 'درجة المخاطر', type: 'select', options: ['low', 'medium', 'high'].map((k) => ({ value: k, label: label('company_risk_level', k) })) },
    ],
    { values: v0, footer: false },
  );

  // ── ما يراه المحامي ──
  const peopleWarn = h('div.cs-people', { 'aria-live': 'polite' });
  const fLawyer = form(
    [
      { name: 'case_title', label: 'عنوان ملف العمل', type: 'text', required: true, maxLength: 200, full: true },
      { name: 'brief_for_lawyer', label: 'ملخص للمحامي', type: 'textarea', required: true, minLength: 20, maxLength: 20000, rows: 7, full: true, dir: 'auto' },
      { name: 'issues', label: 'المسائل القانونية', type: 'textarea', rows: 4, full: true, hint: 'مسألة في كل سطر (حتى 8).', dir: 'auto' },
    ],
    { values: v0, footer: false },
  );
  const lawyerWarn = h('p.cs-lawyer-warn', icon('lock', { size: 15 }), 'لا تذكر أسماء موظفي الشركة أو بريدهم أو هواتفهم. يرى المحامي اسم الشركة.');
  fLawyer.el.querySelector('.form-grid')?.children[1]?.before(lawyerWarn, peopleWarn);
  function checkPeople() {
    const v = fLawyer.getValues();
    const hits = companyPeopleIn(`${v.case_title}\n${v.brief_for_lawyer}\n${v.issues}`, people);
    if (!hits.length) {
      mount(peopleWarn);
      return;
    }
    // حذف بنقرة: الاسم ← «موظف في الشركة»، البريد والهاتف ← وسم عام (الخادم ينقّي أيضًا عند القبول، L-57)
    const fix = button('حذفها من النص', {
      size: 'sm',
      variant: 'secondary',
      onClick: () => {
        const clean = (t) => removeCompanyPeople(t, hits);
        const cur = fLawyer.getValues();
        fLawyer.setValues({ case_title: clean(cur.case_title), brief_for_lawyer: clean(cur.brief_for_lawyer), issues: clean(cur.issues) });
        checkPeople();
      },
    });
    mount(peopleWarn, alertBox(h('div.stack-sm', h('span', `يذكر النص «${hits.join('»، «')}» من موظفي الشركة؛ سيُحذف تلقائيًا قبل وصوله للمحامي. احذفه أو أعد الصياغة.`), fix), 'warning'));
  }
  fLawyer.el.addEventListener('input', checkPeople);

  const docsBox = requestDocs.length
    ? h(
        'div.cs-checklist',
        requestDocs.map((x) =>
          h('label.check', h('input', { type: 'checkbox', checked: selectedDocs.has(x.id), onChange: (e) => (e.target.checked ? selectedDocs.add(x.id) : selectedDocs.delete(x.id)) }), h('span', { dir: 'auto' }, x.title || x.filename)),
        ),
      )
    : h('p.muted', 'لا مستندات في الطلب.');

  const partiesHost = h('div.cs-parties');
  function drawParties() {
    mount(
      partiesHost,
      parties.map((x, i) =>
        h(
          'div.cs-party',
          h('input.input', { type: 'text', value: x.name, 'aria-label': `اسم الطرف ${i + 1}`, maxlength: 150, onInput: (e) => (x.name = e.target.value) }),
          h(
            'div.select-wrap',
            h('select.input', { 'aria-label': `صفة الطرف ${i + 1}`, onChange: (e) => (x.role = e.target.value) }, PARTY_ROLES.map((o) => h('option', { value: o.value, selected: x.role === o.value }, o.label))),
          ),
          button('', { variant: 'ghost', size: 'sm', icon: 'x', ariaLabel: `حذف الطرف ${i + 1}`, onClick: () => (parties.splice(i, 1), drawParties()) }),
        ),
      ),
      button('إضافة طرف', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: () => (parties.push({ name: '', role: 'related' }), drawParties()) }),
    );
  }
  drawParties();

  const memBox = memItems.length
    ? h(
        'div.cs-checklist',
        memItems.map((m) =>
          h(
            'label.check',
            h('input', { type: 'checkbox', checked: selectedMem.has(m.id), onChange: (e) => (e.target.checked ? selectedMem.add(m.id) : selectedMem.delete(m.id)) }),
            h(
              'span',
              `${m.kind_label} · `,
              h('span', { dir: 'auto' }, m.title),
              // gate C-13/J-02: لا شارة تكرر النوع؛ تنبيه لعناصر «مديرو البوابة فقط»، وسبب الاقتراح إن وُجد
              m.access === 'admins' ? badge(m.access_label || 'مديرو البوابة فقط', 'warning') : null,
              whyFor(m) ? h('span.muted', ` — ${whyFor(m)}`) : null,
            ),
          ),
        ),
      )
    : h('p.muted', 'لا عناصر في ذاكرة الشركة بعد.');

  // ── الفريق ──
  const handlerSel = h(
    'select.input',
    { 'aria-label': 'المسؤول عن الطلب', id: 'cs-handler' },
    (Array.isArray(staff) ? staff : []).map((s) => h('option', { value: String(s.id), selected: String(s.id) === v0.handler_id }, s.name)),
  );
  const teamHost = h('div.cs-team');
  function lawyerOption(role, l, current) {
    const id = `cs-${role}-${l.id}`;
    const pref = (l.reasons || []).find((x) => /مفضل/.test(x));
    return h(
      'label.cs-lawyer',
      { htmlFor: id, class: current === l.id && 'is-on' },
      h('input', {
        type: 'radio',
        id,
        name: `cs-${role}-${r.id}`,
        checked: current === l.id,
        onChange: () => {
          if (role === 'lead') {
            leadId = l.id;
            if (reviewerId === l.id) reviewerId = null;
          } else reviewerId = l.id;
          drawTeam();
        },
      }),
      h(
        'span.cs-lawyer-body',
        h('strong', l.name),
        pref ? badge('مفضل لهذه الشركة', 'success') : null,
        l.over_capacity ? badge('فوق طاقته الآن', 'warning') : null,
        (l.skills || []).length ? h('span.cs-lawyer-skills', l.skills.filter((s) => (fClass.getValues().skills || []).includes(s)).map((s) => badge(label('b2b_skill', s), 'primary'))) : null,
        (l.reasons || []).length ? h('span.cs-lawyer-why', l.reasons.filter((x) => !/مفضل/.test(x)).join(' · ')) : null,
        l.b2b_rate != null ? h('span.cs-lawyer-rate', h('span.num', money(l.b2b_rate)), ' — سعر طلبات الشركات لهذا المحامي') : null,
      ),
    );
  }
  function drawTeam() {
    const needsReviewer = fQuality.getValues().requires_senior_review;
    const revItems = (reviewer.items || []).filter((l) => l.id !== leadId);
    if (!needsReviewer) reviewerId = null;
    mount(
      teamHost,
      h('div.field', h('label.field-label', { htmlFor: 'cs-handler' }, 'المسؤول عن الطلب'), h('div.select-wrap', handlerSel)),
      h(
        'fieldset.cs-fieldset',
        h('legend', 'المحامي الرئيسي'),
        (lead.items || []).length ? h('div.cs-lawyers', lead.items.map((l) => lawyerOption('lead', l, leadId))) : h('p.muted', 'لا يوجد محامٍ مقترح لهذا المجال.'),
        h('p.cs-note', 'موعده الافتراضي قبل موعد الشركة بـ 25٪.'),
        (lead.excluded || []).length ? h('details.cs-excluded', h('summary', `مستبعد لهذه الشركة (${lead.excluded.length})`), h('ul', lead.excluded.map((x) => h('li', x.name)))) : null,
      ),
      needsReviewer
        ? h(
            'fieldset.cs-fieldset',
            h('legend', 'المراجع النهائي'),
            revItems.length ? h('div.cs-lawyers', revItems.map((l) => lawyerOption('reviewer', l, reviewerId))) : h('p.muted', 'لا يوجد مراجع مقترح غير المحامي الرئيسي.'),
          )
        : null,
    );
  }

  // ── رسالة للشركة ──
  const fNote = form([{ name: 'note_to_company', label: 'نص الرسالة', type: 'textarea', maxLength: 1000, rows: 2, full: true, dir: 'auto' }], { values: v0, footer: false });
  const preview = h('p.cs-preview', { 'aria-live': 'polite' });
  function drawPreview() {
    const c = computedDue();
    const due = manualDue ? fDue.getValues().delivery_due_at : c && c.at;
    const note = fNote.getValues().note_to_company;
    mount(preview, icon('eye', { size: 14 }), h('span', `ما تراه الشركة: «بدأ فريقكم القانوني العمل على الطلب. موعد التسليم المتوقع: ${due ? whenText(due) : '—'}.${note ? ` ${note}` : ''}»`));
  }
  fNote.el.addEventListener('input', drawPreview);

  const sec = (title, ...children) => h('section.cs-section', h('h3.cs-section-title', title), children);

  // ── الجسم ──
  function bodyOf(extra = {}) {
    const c = fClass.getValues();
    const qv = fQuality.getValues();
    const lv = fLawyer.getValues();
    const due = fDue.getValues();
    const body = {
      rev: d.rev,
      type: c.type,
      practice_area: c.practice_area,
      skills: c.skills || [],
      priority: c.priority,
      size: c.size,
      scope: sc.in_plan === false || (approvedQuote && r.quota_kind === 'out_of_scope') ? 'out_of_scope' : 'in_scope',
      requires_senior_review: !!qv.requires_senior_review,
      risk_level: qv.risk_level || undefined,
      case_title: lv.case_title,
      brief_for_lawyer: lv.brief_for_lawyer,
      issues: String(lv.issues || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8),
      document_ids: [...selectedDocs],
      counterparties: parties.filter((x) => String(x.name || '').trim().length >= 2).map((x) => ({ name: String(x.name).trim(), role: x.role })),
      memory_ids: [...selectedMem],
      handler_id: handlerSel.value ? Number(handlerSel.value) : undefined,
      note_to_company: fNote.getValues().note_to_company || undefined,
      ai_suggestion_id: d.triage ? d.triage.id : undefined,
      assign: {},
    };
    if (free && !approvedQuote) body.quota = 'free';
    if (manualDue && due.delivery_due_at) {
      body.delivery_due_at = due.delivery_due_at;
      body.due_reason = due.due_reason || undefined;
    }
    if (leadId) body.assign.lead = { lawyer_id: leadId, ...(force.lead ? { force: true } : {}) };
    if (reviewerId && qv.requires_senior_review) body.assign.reviewer = { lawyer_id: reviewerId, ...(force.reviewer ? { force: true } : {}) };
    if (conflictAck) body.conflict_ack = true;
    return { ...body, ...extra };
  }
  function snapshot() {
    drafts.set(r.id, bodyOf());
  }
  function validate() {
    mount(alertHost);
    let ok = true;
    for (const f of [fClass, fQuality, fLawyer]) ok = f.validate() && ok;
    if (manualDue) {
      const due = fDue.getValues();
      const errs = {};
      if (!due.delivery_due_at) errs.delivery_due_at = 'حدد موعد التسليم';
      if (!due.due_reason) errs.due_reason = 'اكتب السبب';
      if (Object.keys(errs).length) {
        fDue.setErrors(errs);
        ok = false;
      }
    }
    if (!leadId) {
      mount(alertHost, alertBox('اختر المحامي الرئيسي.', 'danger'));
      ok = false;
    }
    return ok;
  }
  function summary() {
    const leadName = (lead.items || []).find((l) => l.id === leadId)?.name || '—';
    const revName = reviewerId ? (reviewer.items || []).find((l) => l.id === reviewerId)?.name : null;
    const c = computedDue();
    return `المحامي الرئيسي ${leadName}${revName ? ` · مراجعة نهائية ${revName}` : ''} · التسليم بعد ${c ? hoursPhrase(c.hours, c.clock) : '—'} من الموافقة`;
  }

  /** 409 داخل الورقة (U10-S12) — القيم تبقى كما هي */
  function showConflict(err) {
    const det = err.details || {};
    const box = (title, text, ...btns) => mount(alertHost, alertBox(h('div.stack-sm', text ? h('p', text) : null, btns.filter(Boolean).length ? h('div.btn-group', btns) : null), 'warning', { title }));
    switch (err.code) {
      case 'request_changed':
        box(
          'تغيّر الطلب',
          'تغيّر الطلب بعد فتح هذه النافذة (ردّت الشركة أو أُضيف مستند).',
          button('مراجعة التغييرات', {
            size: 'sm',
            icon: 'eye',
            onClick: () => {
              snapshot();
              finished = { review: true };
              handle.close('action');
            },
          }),
          button('متابعة رغم ذلك', {
            size: 'sm',
            variant: 'primary',
            onClick: async (e) => {
              const b = e.currentTarget;
              setBusy(b, true);
              try {
                d = await api.get(`/admin/company-requests/${r.id}`);
                await submit();
              } finally {
                setBusy(b, false);
              }
            },
          }),
        );
        return true;
      case 'conflict_review_required': {
        const cb = h('input', { type: 'checkbox', onChange: () => (conflictAck = cb.checked, syncSubmit()) });
        mount(
          alertHost,
          alertBox(
            h(
              'div.stack-sm',
              h('ul.cs-matches', (det.matches || []).map((m) => h('li', h('strong', m.name || m.subject || '—'), m.role ? ` · ${label('party_role', m.role) || m.role}` : '', m.case_code ? ` · ${m.case_code}` : '', m.link ? h('a', { href: m.link }, ' فتح') : null))),
              h('label.check', cb, h('span', 'راجعت التعارض وأقرر المتابعة')),
            ),
            'warning',
            { title: 'تعارض مصالح محتمل' },
          ),
        );
        return true;
      }
      case 'overage_approval_required':
        box(
          'موافقة الشركة على التكلفة الإضافية',
          'استخدمت الشركة كل الطلبات المشمولة هذا الشهر وتشترط باقتها موافقتها على التكلفة الإضافية.',
          isAdmin
            ? button('إرسال طلب موافقة للشركة', { size: 'sm', variant: 'primary', icon: 'send', onClick: () => toQuote('overage', det.overage_price) })
            : h('span.muted', 'يرسل مدير النظام طلب الموافقة.'),
        );
        return true;
      case 'quota_blocked':
        box(
          'لا طلبات إضافية',
          'باقة الشركة لا تسمح بطلبات إضافية هذا الشهر.',
          isAdmin
            ? button('مجانًا — بقرار الإدارة', {
                size: 'sm',
                variant: 'primary',
                onClick: async () => {
                  free = true;
                  drawQuota();
                  await submit();
                },
              })
            : null,
          button('اعتذار عن الطلب', { size: 'sm', onClick: () => ((finished = { decline: true }), handle.close('action')) }),
        );
        return true;
      case 'out_of_scope_requires_quote':
        box('خارج الباقة', 'هذا الطلب خارج باقة الشركة؛ أرسل عرض سعر أولًا.', isAdmin ? button('إعداد عرض سعر', { size: 'sm', variant: 'primary', icon: 'wallet', onClick: () => toQuote('out_of_scope') }) : h('span.muted', 'يرسل مدير النظام عرض السعر.'));
        return true;
      case 'already_accepted':
        box('بدأ العمل بالفعل', 'بدأ زميل العمل على هذا الطلب للتو.', button('فتح الطلب', { size: 'sm', variant: 'primary', onClick: () => ((finished = { review: true }), handle.close('action')) }));
        return true;
      case 'lawyer_excluded_for_company': {
        const role = Object.keys(det.fields || {})[0]?.includes('reviewer') ? 'reviewer' : 'lead';
        box('محامٍ مستبعد', errorMessage(err), button('الإسناد رغم الاستبعاد', { size: 'sm', onClick: async () => ((force[role] = true), await submit()) }));
        return true;
      }
      default:
        return false;
    }
  }

  async function toQuote(kind, price) {
    const planBody = bodyOf();
    delete planBody.rev;
    snapshot();
    finished = { quote: { kind, amount: price ?? null, plan: planBody, summary: summary() } };
    handle.close('action');
  }

  let submitting = false;
  async function submit() {
    if (submitting) return false;
    if (!validate()) return false;
    if (planMode) {
      const planBody = bodyOf();
      delete planBody.rev;
      finished = { plan: planBody, summary: summary() };
      handle.close('action');
      return true;
    }
    submitting = true;
    handle.el.classList.add('is-busy');
    handle.el.querySelectorAll('input, select, textarea, button:not(.modal-close)').forEach((x) => x.setAttribute('data-was-disabled', x.disabled ? '1' : ''));
    handle.el.querySelectorAll('input, select, textarea').forEach((x) => (x.disabled = true));
    try {
      const res = await api.post(`/admin/company-requests/${r.id}/accept`, bodyOf());
      drafts.delete(r.id);
      finished = { res };
      handle.close('action');
      return true;
    } catch (err) {
      if (err && err.status === 409 && showConflict(err)) {
        alertHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return false;
      }
      const fieldsMap = err && err.details && err.details.fields;
      if (fieldsMap) {
        for (const f of [fClass, fDue, fQuality, fLawyer, fNote]) {
          const mine = Object.fromEntries(Object.entries(fieldsMap).filter(([k]) => f.control(k)));
          if (Object.keys(mine).length) f.setErrors(mine);
        }
      }
      mount(alertHost, alertBox(errorMessage(err), 'danger'));
      alertHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return false;
    } finally {
      submitting = false;
      if (handle && handle.el.isConnected) {
        handle.el.classList.remove('is-busy');
        handle.el.querySelectorAll('input, select, textarea').forEach((x) => (x.disabled = x.getAttribute('data-was-disabled') === '1'));
      }
    }
  }

  const isDirty = () => {
    const now = { ...fLawyer.getValues(), ...fNote.getValues() };
    return textKeys.some((k) => String(now[k] ?? '') !== String(v0[k] ?? '')) || !!fDue.getValues().due_reason;
  };

  const submitLabel = planMode ? 'حفظ الخطة' : 'بدء العمل وإبلاغ الشركة';
  handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-accept',
    title: planMode ? 'خطة البدء' : 'بدء العمل على الطلب',
    subtitle: `${r.code} — ${d.company.name}`,
    beforeClose: discardGuard(isDirty, STAFF_DISCARD),
    body: h(
      'div.cs-body',
      planMode ? alertBox('تُحفظ الخطة مع عرض السعر، ويبدأ العمل بها تلقائيًا عند موافقة الشركة.', 'info') : null,
      alertHost,
      sec('التصنيف', fClass.el),
      sec('الموعد', dueLine, h('label.check', manualToggle, h('span', 'تعديل الموعد يدويًا')), fDue.el),
      sec('الباقة', quotaLine, freeBox),
      sec('الجودة', fQuality.el),
      sec('ما يراه المحامي', fLawyer.el, h('div.field', h('span.field-label', 'المستندات المشاركة'), docsBox), h('div.field', h('span.field-label', 'الأطراف'), partiesHost), h('div.field', h('span.field-label', 'من ذاكرة الشركة'), memBox)),
      sec('الفريق', teamHost),
      sec('رسالة للشركة (اختياري)', fNote.el, preview),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      { label: submitLabel, variant: 'primary', icon: planMode ? 'check' : 'briefcase', onClick: async () => ((await submit()) ? undefined : false) },
    ],
    onClose: async () => {
      if (!finished) return;
      if (finished.plan) {
        if (onPlanSaved) onPlanSaved(finished.plan, finished.summary);
        return;
      }
      if (finished.res) {
        const res = finished.res;
        haptic('success');
        toast(`بدأ العمل على ${r.code} — أُبلغت الشركة.`, 'success', 6000);
        for (const w of res.warnings || []) toast(typeof w === 'string' ? w : w.text || '', 'warning', 9000);
        if ((res.assign_errors || []).length) {
          const nameOf = (id) => [...(lead.items || []), ...(reviewer.items || [])].find((l) => l.id === id)?.name || '';
          assignNotices.set(r.id, { caseId: res.case && res.case.id, items: res.assign_errors.map((e) => ({ ...e, lawyer_name: nameOf(e.lawyer_id) })) });
          if (!window.location.hash.startsWith(`#/company-requests/${r.id}`)) {
            window.location.hash = `#/company-requests/${r.id}`;
            return;
          }
        }
        if (onDone) onDone(res);
        return;
      }
      if (finished.quote) {
        const { openQuoteSheet } = await import('./company-quote-sheet.js');
        await openQuoteSheet({ detail: d, user, kind: finished.quote.kind, amount: finished.quote.amount, plan: finished.quote.plan, planSummary: finished.quote.summary, onDone });
        return;
      }
      // review: «اعتذار عن الطلب» من لوحة quota_blocked يفتح نافذة الاعتذار مباشرة حين تُتاح (صفحة الطلب)
      if (finished.decline && onDecline) {
        onDecline();
        return;
      }
      if (finished.decline || finished.review) {
        if (onDone) onDone(null);
        if (finished.decline && !window.location.hash.startsWith(`#/company-requests/${r.id}`)) window.location.hash = `#/company-requests/${r.id}`;
        if (finished.review && !window.location.hash.startsWith(`#/company-requests/${r.id}`)) window.location.hash = `#/company-requests/${r.id}`;
      }
    },
  });
  const submitBtn = handle.buttons[1];
  function syncSubmit() {
    const lbl = submitBtn.querySelector('.btn-label');
    if (lbl && !planMode) lbl.textContent = conflictAck ? 'بدء العمل رغم التعارض' : submitLabel;
  }
  drawQuota();
  drawTeam();
  drawDue();
  checkPeople();
  syncSubmit();
  return handle;
}
