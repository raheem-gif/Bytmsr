// الإصدار 10 — المحلل المحلي لفرز طلبات الشركات (B10 §10.1، L-29: P0 بلا مفتاح). وحدة نقية بلا قاعدة بيانات:
// تستقبل الطلب وسياقه وتعيد مخرجات بنفس مخطط Claude، ثم تمر المخرجات (من أي مزوّد) بالمعالجة الحتمية postProcessTriage.
// كل ما هنا لفريق المكتب فقط؛ الشركة لا ترى شيئًا منه (INV-3).
import { normalizeArabic } from '../util.js';
import { REQUEST_TYPES, REQUEST_TYPE_KEYS, B2B_SKILLS, RISK_CODES, EXCLUDED_WORK, DELIVERABLE_KINDS, TYPE_FIELDS, MISSING_CHECKLISTS, typeByKey } from '../../public/assets/js/lib/company-catalog-fields.js';
import { AREA_CODES } from '../constants.js';

const SKILL_KEYS = B2B_SKILLS.map((x) => x.key);
const RISK_KEYS = RISK_CODES.map((x) => x.key);
const EXCLUDED_KEYS = EXCLUDED_WORK.map((x) => x.key);
const DELIVERABLE_KEYS = DELIVERABLE_KINDS.map((x) => x.key);
const URGENCY = ['low', 'normal', 'high', 'urgent'];
const SIZES = ['S', 'M', 'L', 'XL'];

/** علامات كل نوع (عربي وإنجليزي) — تُطابق بعد توحيد الحروف */
const TYPE_MARKERS = {
  contract_review: ['عقد', 'مراجعه', 'توقيع', 'بنود', 'contract', 'agreement', 'review'],
  contract_drafting: ['صياغه', 'اعداد عقد', 'كتابه عقد', 'مسوده', 'draft'],
  nda: ['سريه', 'عدم افشاء', 'nda', 'confidential'],
  employment: ['موظف', 'عامل', 'فصل', 'استقاله', 'مرتب', 'راتب', 'انذار للعامل', 'تحقيق اداري', 'جزاء'],
  marketing_review: ['حمله', 'اعلان', 'تسويق', 'سوشيال', 'مسابقه', 'خصم', 'مؤثر'],
  legal_notice: ['انذار', 'اعلان علي يد محضر', 'صحيفه دعوي', 'مطالبه', 'خطاب من'],
  board_resolution: ['مجلس الاداره', 'جمعيه عامه', 'قرار', 'توكيل', 'مفوض'],
  supplier_issue: ['مورد', 'توريد', 'شحنه', 'تاخير', 'تاخر'],
  compliance_question: ['امتثال', 'ترخيص', 'هيئه', 'جهاز', 'حمايه البيانات', 'ضرائب', 'تامينات'],
  renewal_followup: ['تجديد', 'انتهاء', 'ينتهي'],
  dispute: ['نزاع', 'دعوي', 'تحكيم', 'مستحقات', 'مديونيه', 'قضيه'],
};
const AREA_BY_TYPE_FALLBACK = 'COM';

const HOURS_BY_SIZE = { S: [2, 4], M: [4, 10], L: [10, 24], XL: [24, 60] };

/** نص موحَّد للمطابقة */
const norm = (s) => normalizeArabic(String(s ?? '')).replace(/\s+/g, ' ');
const countMarkers = (text, list) => list.filter((m) => text.includes(norm(m))).length;

function daysUntil(dateKey, today) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** إزالة الهواتف والبريد والأرقام القومية وأسماء مستخدمي الشركة من نص يصل للمحامي */
export function scrubForLawyer(text, names = []) {
  let s = String(text ?? '');
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[بريد إلكتروني]');
  s = s.replace(/\b[23]\d{13}\b/g, '[رقم قومي]');
  s = s.replace(/(?:\+|00)?\d[\d\s-]{7,16}\d/g, (m) => {
    const d = m.replace(/\D/g, '').length;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(m.trim()) || d < 8 || d > 15) return m;
    return '[رقم هاتف]';
  });
  for (const n of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    const parts = String(n).trim().split(/\s+/);
    const variants = new Set([parts.join(' ')]);
    if (parts.length >= 2) variants.add(`${parts[0]} ${parts[parts.length - 1]}`);
    for (const v of variants) s = s.split(v).join('[اسم]');
  }
  return s;
}

/** الحقول مكتوبة كجمل لملخص المحامي (بالتسميات لا المفاتيح) */
export function fieldsAsText(typeKey, fields = {}) {
  const lines = [];
  for (const f of TYPE_FIELDS[typeKey] || []) {
    const v = fields[f.key];
    if (v === undefined || v === null || v === '' || f.kind === 'memory_ref') continue;
    const opt = (k) => f.options?.find((o) => o.key === k)?.label ?? k;
    const val = Array.isArray(v) ? v.map(opt).join('، ') : f.options ? opt(v) : f.kind === 'money' ? `${Number(v).toLocaleString('en-US')} ${fields.currency || 'EGP'}` : String(v);
    if (f.key === 'currency') continue;
    lines.push(`${f.label}: ${val}`);
  }
  return lines;
}

/**
 * المحلل المحلي. ctx = { request:{type,title,description,priority,urgent_reason,needed_by,visibility}, fields, documents:[{title,filename}],
 *   entityName, today:'YYYY-MM-DD', plan:{scope_types, excluded_work, contract_value_cap_minor, senior_review}, memory:[{ref, kind, title, counterparty}], names:[] }
 */
export function triageHeuristic(ctx) {
  const r = ctx.request;
  const fields = ctx.fields || {};
  const today = ctx.today;
  const text = norm(`${r.title}\n${r.description}\n${Object.values(fields).filter((x) => typeof x === 'string').join(' ')}`);
  const chosen = REQUEST_TYPE_KEYS.includes(r.type) ? r.type : 'other';
  // النوع: اختيار الشركة يفوز ما لم يطابق النص نوعًا آخر بعلامتين على الأقل ولا علامة لاختيارها
  const scores = Object.fromEntries(Object.entries(TYPE_MARKERS).map(([k, list]) => [k, countMarkers(text, list)]));
  let type = chosen;
  let typeReason = 'نوع الطلب كما اختارته الشركة.';
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best && best[0] !== chosen && best[1] >= 2 && (scores[chosen] || 0) === 0 && chosen !== 'other') {
    type = best[0];
    typeReason = `النص يطابق «${typeByKey(best[0])?.label}» أكثر من النوع المختار.`;
  } else if (chosen === 'other' && best && best[1] >= 2) {
    type = best[0];
    typeReason = `النص يطابق «${typeByKey(best[0])?.label}».`;
  }
  const spec = typeByKey(type) || typeByKey(chosen);
  const typeConfidence = type === chosen ? Math.min(0.95, 0.6 + 0.1 * (scores[chosen] || 0)) : 0.55;

  const skills = new Set(spec?.default_skills || []);
  if (/حمايه البيانات|بيانات شخصيه|personal data/.test(text)) skills.add('data_protection');
  if (/علامه تجاريه|حقوق ملكيه|trademark|copyright/.test(text)) skills.add('ip');
  if (/ضريب/.test(text)) skills.add('tax');
  if (/ايجار|عقار/.test(text)) skills.add('real_estate');

  // المواعيد
  const deadlines = [];
  const dateFields = [
    ['needed_by', 'تحتاجه الشركة قبل', r.needed_by],
    ['signing_deadline', 'موعد التوقيع', fields.signing_deadline],
    ['response_deadline', 'آخر موعد للرد على الإنذار', fields.response_deadline],
    ['launch_date', 'موعد إطلاق الحملة', fields.launch_date],
    ['expiry_date', 'تاريخ الانتهاء', fields.expiry_date],
  ];
  let soonest = null;
  for (const [, labelText, d] of dateFields) {
    if (!d) continue;
    deadlines.push({ label: labelText, date: d });
    const n = daysUntil(d, today);
    if (n !== null && (soonest === null || n < soonest)) soonest = n;
  }

  // المخاطر
  const risks = [];
  const value = Number(fields.contract_value ?? fields.amount ?? fields.amount_claimed);
  const add = (code, severity, note) => {
    if (!risks.some((x) => x.code === code)) risks.push({ code, severity, note });
  };
  if (soonest !== null && soonest <= 3) add('tight_deadline', soonest <= 1 ? 'high' : 'medium', 'الموعد خلال 72 ساعة أو أقل.');
  if (Number.isFinite(value) && value > 1000000) add('high_value', 'medium', 'قيمة تتجاوز مليون جنيه.');
  if (/غير محدود|دون حد|بلا حد/.test(text)) add('unlimited_liability', 'high', 'ذُكرت مسؤولية غير محدودة.');
  if (/حصري|عدم منافسه/.test(text)) add('exclusivity_non_compete', 'medium', 'حصرية أو عدم منافسة.');
  if (/تجديد تلقائي/.test(text)) add('auto_renewal_trap', 'medium', 'تجديد تلقائي.');
  if (/بيانات شخصيه|بيانات العملاء|بيانات عملاء/.test(text) || (fields.contains || []).includes?.('personal_data')) add('personal_data', 'medium', 'تتضمن بيانات شخصية.');
  if (/حكومه|حكومي|هيئه|وزاره/.test(text) || fields.notice_kind === 'government') add('government_counterparty', 'medium', 'طرف حكومي أو جهة رسمية.');
  const law = norm(fields.governing_law || '');
  if (law && !/مصر|egypt/.test(law)) add('foreign_law_or_forum', 'medium', 'قانون حاكم غير مصري.');
  if (type === 'contract_review' && !(ctx.documents || []).length) add('missing_contract', 'high', 'لم يُرفق العقد.');
  if (type === 'legal_notice' || /دعوي|مقاضاه|قضيه/.test(text)) add('litigation_threat', type === 'legal_notice' ? 'high' : 'medium', 'احتمال تقاضٍ.');
  if (type === 'employment' && fields.issue_kind === 'termination') add('employee_termination_risk', 'medium', 'إنهاء خدمة موظف.');
  if (type === 'marketing_review' && ((fields.contains || []).includes?.('health_claims') || (fields.contains || []).includes?.('contests'))) add('consumer_claims', 'medium', 'ادعاءات أو مسابقات للمستهلكين.');

  // الأعمال المستبعدة
  let excluded = 'none';
  const stageOpt = (TYPE_FIELDS[type] || []).find((f) => f.key === 'stage')?.options?.find((o) => o.key === fields.stage);
  if (stageOpt?.excluded_work) excluded = stageOpt.excluded_work;
  else if (/تحكيم/.test(text)) excluded = 'arbitration';
  else if (/استحواذ|اندماج/.test(text)) excluded = 'mna';
  else if (type === 'dispute' && /دعوي|محكمه/.test(text)) excluded = 'litigation';

  // النواقص من قائمة النوع
  const docs = ctx.documents || [];
  const missing = [];
  for (const item of MISSING_CHECKLISTS[type] || []) {
    if (item.kind === 'document') {
      if (item.key === 'document' && docs.length) continue;
      if (item.key !== 'document' && docs.some((d) => norm(`${d.title} ${d.filename}`).includes(norm(item.label).split(' ')[0]))) continue;
      if (item.key !== 'document' && docs.length && missing.filter((m) => m.kind === 'document').length >= 1) continue;
      missing.push({ kind: 'document', item: item.label, why: 'يحتاجه المحامي لدراسة الطلب.' });
    } else if (!fields[item.key] && !(item.key === 'counterparty_name' && fields.sender_name)) {
      missing.push({ kind: 'information', item: item.label, why: 'غير مذكور في الطلب.' });
    }
    if (missing.length >= 5) break;
  }

  // الحجم والجهد
  let size = spec?.default_size || 'M';
  if ((Number.isFinite(value) && value > 5000000) || String(r.description || '').length > 4000) size = size === 'S' ? 'M' : 'L';
  const [hmin, hmax] = HOURS_BY_SIZE[size];

  const urgency = r.priority === 'urgent' ? 'urgent' : r.priority === 'high' ? 'high' : 'normal';
  const labelOf = (k, list) => list.find((x) => x.key === k)?.label || k;
  const brief = [
    `نوع الطلب: ${spec?.label || type}.`,
    ctx.entityName ? `الكيان المعني: ${ctx.entityName}.` : null,
    ...fieldsAsText(type, fields).map((l) => `${l}.`),
    deadlines.length ? `مواعيد: ${deadlines.map((d) => `${d.label} ${d.date}`).join('، ')}.` : null,
    '',
    String(r.description || '').trim(),
  ]
    .filter((x) => x !== null)
    .join('\n');
  const questions = missing.slice(0, 5).map((m) => (m.kind === 'document' ? `نرجو إرسال ${m.item}.` : `نرجو إفادتنا بـ${m.item}.`));
  const issues = ISSUES_BY_TYPE[type] ? ISSUES_BY_TYPE[type](fields) : ['ما الموقف القانوني للشركة وما الخطوات الموصى بها؟'];

  const memoryRefs = (ctx.memory || [])
    .slice(0, 5)
    .map((m) => ({ ref: m.ref, why: m.why || 'مرتبط بالطرف الآخر أو بموضوع الطلب.' }));
  const confidence = Math.round(Math.min(0.9, 0.45 + 0.05 * (scores[type] || 0) + (missing.length ? 0 : 0.1)) * 100) / 100;

  return {
    type,
    type_confidence: Math.round(typeConfidence * 100) / 100,
    type_reason: typeReason,
    one_line: `${spec?.label || type}: ${r.title}`.slice(0, 140),
    practice_area: AREA_CODES.includes(spec?.default_area) ? spec.default_area : AREA_BY_TYPE_FALLBACK,
    secondary_areas: [],
    skills: [...skills].filter((s) => SKILL_KEYS.includes(s)),
    urgency,
    urgency_reason: r.priority === 'urgent' ? r.urgent_reason || 'طلبته الشركة عاجلًا.' : soonest !== null ? `أقرب موعد بعد ${soonest} يوم.` : 'لا موعد قريب مذكور.',
    deadlines,
    risk_flags: risks,
    missing_info: missing,
    excluded_work: excluded,
    scope_reason: excluded !== 'none' ? `عمل مستبعد عادةً من الباقة: ${labelOf(excluded, EXCLUDED_WORK)}.` : 'ضمن أنواع العمل المعتادة.',
    effort: { size, hours_min: hmin, hours_max: hmax, reason: `حجم ${size} حسب نوع الطلب${size !== spec?.default_size ? ' وقيمته أو طوله' : ''}.` },
    senior_review_recommended: risks.some((x) => x.severity === 'high') || (Number.isFinite(value) && value > 1000000),
    deliverable_kind: spec?.deliverable_kind || 'memo',
    brief_for_lawyer: brief,
    issues,
    questions_for_company: questions,
    memory_refs: memoryRefs,
    confidence,
  };
}

/** أسئلة قانونية مقترحة لكل نوع (≤ 8) */
const ISSUES_BY_TYPE = {
  contract_review: (f) => [
    'هل يحمي العقد مصالح الشركة في الالتزامات الأساسية والسداد والتسليم؟',
    'ما البنود عالية المخاطر (المسؤولية، الإنهاء، الغرامات، التجديد) وما التعديل المقترح لكل منها؟',
    f.governing_law ? 'ما أثر القانون الحاكم وجهة فض النزاع المختارة؟' : 'هل القانون الحاكم وجهة فض النزاع مناسبان؟',
  ],
  contract_drafting: () => ['ما الهيكل والبنود الأساسية للعقد بما يحقق ما اتفق عليه الطرفان؟', 'ما الضمانات وآليات الإنهاء المناسبة لحماية الشركة؟'],
  nda: () => ['ما نطاق المعلومات السرية والاستثناءات المناسبة؟', 'ما مدة الالتزام وسبل الانتصاف عند الإخلال؟'],
  employment: (f) => [`ما الإجراء القانوني السليم في مسألة «${f.issue_kind || 'العمل'}» وفق قانون العمل؟`, 'ما المخاطر على الشركة وكيف تُوثَّق الخطوات؟'],
  marketing_review: () => ['هل تتوافق الحملة مع قانون حماية المستهلك وضوابط الإعلان؟', 'ما التعديلات المطلوبة في الادعاءات والشروط والأحكام؟'],
  legal_notice: () => ['ما مدى صحة الإنذار أو المطالبة شكلًا وموضوعًا؟', 'ما الرد المقترح وموعده والخطوات الوقائية؟'],
  board_resolution: () => ['ما الجهة المختصة بالقرار ونصاب الانعقاد والتصويت؟', 'ما صيغة القرار والإجراءات اللاحقة للتسجيل أو الإخطار؟'],
  supplier_issue: () => ['ما حقوق الشركة في مواجهة المورد وفق العقد؟', 'ما الخطوة التالية المقترحة (إنذار، تفاوض، إنهاء)؟'],
  compliance_question: () => ['ما المتطلبات التنظيمية المنطبقة على الموقف؟', 'ما الإجراءات اللازمة للامتثال ومواعيدها؟'],
  renewal_followup: () => ['ما شروط التجديد أو عدم التجديد ومواعيد الإخطار؟', 'ما الإجراء الموصى به قبل تاريخ الانتهاء؟'],
  dispute: () => ['ما الموقف القانوني للشركة وقوة مستنداتها؟', 'ما المسار المقترح (تسوية، إنذار، تقاضٍ أو تحكيم) وتكلفته التقديرية؟'],
};

/**
 * المعالجة الحتمية (دائمًا، بعد Claude أو المحلل): قص الأطوال، حذف القيم غير المعروفة، حذف إشارات الذاكرة خارج المجموعة المقدَّمة،
 * حد أدنى للاستعجال من المواعيد، فحص الباقة الحتمي، المراجعة الثانية من الباقة، وإعادة تنقية ملخص المحامي.
 */
export function postProcessTriage(out, ctx) {
  const o = out && typeof out === 'object' ? { ...out } : {};
  const clip = (s, n) => String(s ?? '').slice(0, n);
  const fields = ctx.fields || {};
  o.type = REQUEST_TYPE_KEYS.includes(o.type) ? o.type : ctx.request.type;
  o.type_confidence = clamp01(o.type_confidence);
  o.type_reason = clip(o.type_reason, 300);
  o.one_line = clip(o.one_line || ctx.request.title, 140);
  o.practice_area = AREA_CODES.includes(o.practice_area) ? o.practice_area : typeByKey(o.type)?.default_area || 'COM';
  o.secondary_areas = (Array.isArray(o.secondary_areas) ? o.secondary_areas : []).filter((a) => AREA_CODES.includes(a) && a !== o.practice_area).slice(0, 3);
  o.skills = (Array.isArray(o.skills) ? o.skills : []).filter((s) => SKILL_KEYS.includes(s)).slice(0, 5);
  o.urgency = URGENCY.includes(o.urgency) ? o.urgency : 'normal';
  o.urgency_reason = clip(o.urgency_reason, 300);
  o.deadlines = (Array.isArray(o.deadlines) ? o.deadlines : []).filter((d) => d && typeof d.label === 'string').slice(0, 6).map((d) => ({ label: clip(d.label, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date : '' }));
  o.risk_flags = (Array.isArray(o.risk_flags) ? o.risk_flags : []).filter((x) => x && RISK_KEYS.includes(x.code)).slice(0, 8).map((x) => ({ code: x.code, severity: ['low', 'medium', 'high'].includes(x.severity) ? x.severity : 'medium', note: clip(x.note, 200) }));
  o.missing_info = (Array.isArray(o.missing_info) ? o.missing_info : []).filter((x) => x && typeof x.item === 'string').slice(0, 8).map((x) => ({ kind: x.kind === 'document' ? 'document' : 'information', item: clip(x.item, 200), why: clip(x.why, 200) }));
  o.excluded_work = EXCLUDED_KEYS.includes(o.excluded_work) ? o.excluded_work : 'none';
  o.scope_reason = clip(o.scope_reason, 300);
  const e = o.effort && typeof o.effort === 'object' ? o.effort : {};
  o.effort = { size: SIZES.includes(e.size) ? e.size : typeByKey(o.type)?.default_size || 'M', hours_min: Math.max(0, Number(e.hours_min) || 0), hours_max: Math.max(0, Number(e.hours_max) || 0), reason: clip(e.reason, 200) };
  o.deliverable_kind = DELIVERABLE_KEYS.includes(o.deliverable_kind) ? o.deliverable_kind : typeByKey(o.type)?.deliverable_kind || 'memo';
  o.issues = (Array.isArray(o.issues) ? o.issues : []).map((x) => clip(x, 300)).filter(Boolean).slice(0, 8);
  o.questions_for_company = (Array.isArray(o.questions_for_company) ? o.questions_for_company : []).map((x) => clip(x, 300)).filter(Boolean).slice(0, 5);
  const allowed = new Set((ctx.memory || []).map((m) => m.ref));
  o.memory_refs = (Array.isArray(o.memory_refs) ? o.memory_refs : []).filter((x) => x && allowed.has(x.ref)).slice(0, 8).map((x) => ({ ref: x.ref, why: clip(x.why, 200) }));
  o.confidence = clamp01(o.confidence);
  // حد أدنى للاستعجال من المواعيد: خلال يوم ← عاجل، خلال 3 أيام ← مرتفع
  const dates = [ctx.request.needed_by, fields.response_deadline, fields.launch_date, fields.signing_deadline].filter(Boolean);
  const soon = dates.map((d) => daysUntil(d, ctx.today)).filter((n) => n !== null).sort((a, b) => a - b)[0];
  if (soon !== undefined && soon <= 1 && o.urgency !== 'urgent') o.urgency = 'urgent';
  else if (soon !== undefined && soon <= 3 && (o.urgency === 'normal' || o.urgency === 'low')) o.urgency = 'high';
  // فحص الباقة الحتمي (الذكاء الاصطناعي يقترح فقط)
  const plan = ctx.plan || {};
  const value = Number(fields.contract_value ?? fields.amount ?? fields.amount_claimed);
  const reasons = [];
  if (!(plan.scope_types || []).includes(o.type)) reasons.push('type_not_in_plan');
  if (o.excluded_work !== 'none' && (plan.excluded_work || []).includes(o.excluded_work)) reasons.push(`excluded:${o.excluded_work}`);
  if (plan.contract_value_cap_minor !== null && plan.contract_value_cap_minor !== undefined && Number.isFinite(value) && Math.round(value * 100) > plan.contract_value_cap_minor) reasons.push('value_above_cap');
  o.scope_check = { in_plan: reasons.length === 0, reasons };
  const policy = plan.senior_review || 'never';
  o.senior_review = policy === 'always' ? true : policy === 'never' ? false : o.risk_flags.some((x) => x.severity === 'high') || (Number.isFinite(value) && value > 1000000) || o.excluded_work !== 'none';
  o.senior_review_recommended = !!o.senior_review_recommended;
  o.brief_for_lawyer = scrubForLawyer(clip(o.brief_for_lawyer, 20000), ctx.names || []);
  o.issues = o.issues.map((x) => scrubForLawyer(x, ctx.names || []));
  return o;
}

function clamp01(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, Math.round(x * 100) / 100)) : 0;
}

export { REQUEST_TYPES };
