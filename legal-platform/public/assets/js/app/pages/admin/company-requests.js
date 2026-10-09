// v10 b2b-staff (STF-1، U10-S04…S06) — «طلبات الشركات»: كل طلبات الشركات العميلة مرتبة حسب أقرب موعد.
// بطاقات مجمّعة حسب الاستعجال (لكل بطاقة إجراء أساسي واحد) أو قائمة، مع فلاتر الحالة والشركة والموعد والمسؤول والنوع.
// تصدّر أيضًا أدوات مشتركة لصفحة الطلب وأوراق الشركات: شريحة الموعد، شارات الأعلام، سطر الفرز المقترح،
// ومحمّل مكونات البوابة (lib/company-ui.js) التي تعرض «كما ستراه الشركة» بنفس كود البوابة.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, relative, dateTime, date, time, weekday, percent, count, num } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  asyncButton,
  badge,
  icon,
  codeTag,
  emptyState,
  errorState,
  loading,
  filterBar,
  searchInput,
  selectInput,
  table,
  toast,
} from '../../../lib/ui.js';
import { REQUEST_TYPES, typeByKey, stageByKey } from '../../../lib/company-catalog.js';

// ───────────────────────── «كما تراه الشركة» ─────────────────────────
// المصدر الوحيد لمعاينة ما تراه الشركة هو مكوّنات البوابة نفسها (lib/company-ui.js و lib/company-forms.js، POR-0):
// صفحة الطلب وأوراق الشركات تستوردها مباشرة، فلا نص ولا شكل مختلف بين ما يراه الفريق في المعاينة وما تراه الشركة.

/** «الخميس 8 أكتوبر 2026، 4:00 م» */
export function whenText(iso) {
  return iso ? `${weekday(iso)} ${date(iso)}، ${time(iso)}` : '—';
}

// ───────────────────────── أدوات مشتركة لصفحات الشركات ─────────────────────────

/** عدد ساعات بصيغة عربية سليمة: «ساعة عمل»، «ساعتي عمل»، «3 ساعات عمل»، «12 ساعة عمل»، «9.5 ساعة عمل» (calendar: بلا «عمل») */
export function hoursPhrase(hours, clock = 'business') {
  const n = Number(hours) || 0;
  const forms = clock === 'calendar' ? ['ساعة', 'ساعتين', 'ساعات', 'ساعة'] : ['ساعة عمل', 'ساعتي عمل', 'ساعات عمل', 'ساعة عمل'];
  return Number.isInteger(n) ? count(n, forms) : `${num(n)} ${forms[3]}`;
}

/** دقائق عمل ← «h:mm» */
export function hm(min) {
  const m = Math.max(0, Math.round(Math.abs(Number(min) || 0)));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

const SLA_TONE = { on_track: 'neutral', at_risk: 'warning', late: 'danger', paused: 'info', met: 'success', missed: 'warning' };
const SLA_ICON = { on_track: 'clock', at_risk: 'clock', late: 'alert', paused: 'clock', met: 'checkCircle', missed: 'alert' };

/**
 * شريحة الموعد (U10-S05): حالة ممتلئة بأيقونة ونص وأرقام جدولية، والمرحلة «أول رد · تأكيد الموعد · التسليم».
 * sla = { phase, phase_label, due_at, state, business_minutes_left, paused }
 */
export function slaChip(sla, { withDue = true, compact = false, clock } = {}) {
  if (!sla || !sla.state) return null;
  const phase = compact ? '' : sla.phase_label || (sla.phase ? label('company_sla_phase', sla.phase) : '');
  const left = sla.business_minutes_left;
  const n = (v) => h('span.num', hm(v));
  // review: ساعة «الطلبات العاجلة» (calendar) ليست ساعات عمل — «س» وحدها
  const unit = (sla.clock || clock) === 'calendar' ? ' س' : ' س عمل';
  let parts;
  switch (sla.state) {
    case 'on_track':
      parts = [phase ? `${phase}: باقٍ ` : 'باقٍ ', n(left), unit];
      break;
    case 'at_risk':
      parts = [phase ? `${phase} · يقترب الموعد: باقٍ ` : 'يقترب الموعد: باقٍ ', n(left), ' س'];
      break;
    case 'late':
      parts = [phase ? `${phase} · متأخر ` : 'متأخر ', n(left), unit];
      break;
    case 'paused':
      parts = ['متوقف — بانتظار الشركة'];
      break;
    case 'met':
      parts = ['سُلِّم في الموعد'];
      break;
    case 'missed':
      parts = ['سُلِّم بعد الموعد'];
      break;
    default:
      parts = [sla.state_label || sla.state];
  }
  if (left == null && ['on_track', 'at_risk', 'late'].includes(sla.state)) parts = [`${phase}: ${sla.state_label || ''}`];
  const due = withDue && sla.due_at && ['on_track', 'at_risk', 'late'].includes(sla.state) ? h('span.cq-sla-due', ` — حتى ${weekday(sla.due_at)} `, h('span.num', time(sla.due_at))) : null;
  return h(
    'span.badge.cq-sla',
    { class: `badge-${SLA_TONE[sla.state] || 'neutral'}`, title: [compact ? sla.phase_label : null, sla.due_at ? dateTime(sla.due_at) : null].filter(Boolean).join(' — ') || null },
    icon(SLA_ICON[sla.state] || 'clock', { size: 13 }),
    h('span', parts, due),
  );
}

/** ساعة الموعد لعنصر في القائمة: من الخادم إن أرسلها، وإلا العاجل على ساعة «الطلبات العاجلة» (L-53) */
export const clockOf = (it) => (it && it.sla && it.sla.clock) || (it && it.priority === 'urgent' ? 'calendar' : 'business');

/** نص الأعلام وألوانها (U10-S05، STF-1) */
export const FLAG_COPY = Object.freeze({
  escalated: ['مصعّد من الشركة', 'danger', 'alert'],
  plan_error: ['تعذّر بدء العمل تلقائيًا', 'danger', 'alert'],
  company_not_emailed: ['لم تُبلَّغ الشركة بالبريد — اتصلوا بها', 'warning', 'mailWarning'],
  memory_pending: ['عقد بانتظار المراجعة في الذاكرة', 'info', 'bookOpen'],
  clarification_answered: ['ردّت الشركة على الاستيضاح', 'info', 'message'],
  quote_approved: ['وافقت الشركة على العرض', 'success', 'checkCircle'],
  changes_requested: ['طلبت الشركة تعديلات', 'warning', 'edit'],
  opinion_approved_not_delivered: ['رأي معتمد لم يُسلَّم بعد', 'info', 'fileText'],
  deadline_conflict: ['موعد الشركة قبل موعد التسليم', 'warning', 'calendarClock'],
});

export function flagChips(flags = [], { staffUnread = 0, skip = [] } = {}) {
  const list = (flags || []).filter((f) => FLAG_COPY[f] && !skip.includes(f));
  const out = list.map((f) => badge(FLAG_COPY[f][0], FLAG_COPY[f][1], { icon: FLAG_COPY[f][2] }));
  if (staffUnread > 0) out.push(badge(count(staffUnread, ['رسالة جديدة من الشركة', 'رسالتان جديدتان من الشركة', 'رسائل جديدة من الشركة', 'رسالة جديدة من الشركة']), 'info', { icon: 'message' }));
  return out;
}

/** النوع شارة مُحددة (فئة = إطار، L-10) */
export function typeBadge(typeKey, text) {
  const t = typeByKey(typeKey);
  return badge(text || t?.label || typeKey, 'primary', { icon: t?.icon || null });
}

const PROVIDER = { heuristic: 'المحلل المحلي', anthropic: 'Claude', claude: 'Claude' };
export const providerLabel = (p) => PROVIDER[p] || label('ai_provider', p) || p || '';

/** سطر «المقترح» من الفرز (D10) */
export function aiLine(ai, item = {}) {
  if (!ai) return null;
  const bits = [];
  if (ai.area) bits.push(areaLabel(ai.area));
  if (ai.size) bits.push(`حجم ${ai.size}`);
  if (ai.scope) bits.push(ai.scope === 'out_of_scope' ? 'خارج الباقة' : 'ضمن الباقة');
  if (ai.excluded_work) bits.push(`عمل مستبعد: ${label('company_excluded_work', ai.excluded_work)}`);
  if (ai.senior_review != null) bits.push(`مراجعة نهائية: ${ai.senior_review ? 'نعم' : 'لا'}`);
  const other = ai.type && item.type && ai.type !== item.type ? typeByKey(ai.type)?.label || ai.type : null;
  return h(
    'div.cq-ai',
    h('p.cq-ai-line', icon('sparkle', { size: 14 }), h('span', `المقترح: ${bits.join(' · ')}`)),
    other && h('p.cq-ai-sub', `يرى الفرز أنه «${other}»`),
    h('p.cq-ai-sub', ai.confidence != null ? h('span', 'ثقة ', h('span.num', percent(ai.confidence))) : null, ai.confidence != null ? ' · ' : null, providerLabel(ai.provider)),
  );
}

/** المرحلة كما يراها الفريق (شارة ممتلئة) */
const STAGE_TONE = { received: 'info', needs_you: 'warning', approval: 'warning', working: 'accent', final_review: 'accent', delivered: 'warning', closed: 'success', declined: 'muted', cancelled: 'muted' };
export function stageBadgeStaff(item) {
  return badge(stageByKey(item.stage)?.staff_label || item.stage_label || item.status_label || item.status, STAGE_TONE[item.stage] || 'neutral', { dot: true });
}

/** الإجراء الأساسي الواحد لكل بطاقة (U10-S05) → { key, label, icon, disabled?, hint? } */
export function primaryActionOf(it, user) {
  const f = new Set(it.flags || []);
  const isAdmin = user && user.role === 'admin';
  if (it.escalated) return { key: 'open', label: 'الاطلاع على التصعيد', icon: 'alert', focus: 'escalation' };
  if (f.has('quote_approved') || f.has('plan_error')) return { key: 'accept', label: 'بدء العمل — وافقت الشركة على العرض', icon: 'briefcase', plan: true };
  if (f.has('clarification_answered')) return { key: 'open', label: 'مراجعة رد الشركة', icon: 'message', focus: 'thread' };
  if (f.has('changes_requested')) return { key: 'open', label: 'متابعة التعديلات', icon: 'edit' };
  if (f.has('opinion_approved_not_delivered')) return { key: 'deliverable', label: 'إعداد التسليم', icon: 'send' };
  if (it.status === 'submitted') {
    const out = it.ai && (it.ai.scope === 'out_of_scope' || it.ai.excluded_work);
    if (out) return isAdmin ? { key: 'quote', label: 'إعداد عرض سعر', icon: 'wallet' } : { key: 'none', label: 'يحتاج عرض سعر من مدير النظام', icon: 'lock', disabled: true };
    return { key: 'accept', label: 'فرز وبدء العمل', icon: 'briefcase' };
  }
  if (f.has('memory_pending')) return { key: 'open', label: 'مراجعة العقد في الذاكرة', icon: 'bookOpen', focus: 'memory' };
  return { key: 'open', label: 'فتح', icon: 'chevronLeft' };
}

/**
 * ينفّذ إجراءً من البطاقة أو الصفحة: يجلب صفحة الطلب للفريق ثم يفتح الورقة المناسبة.
 * onDone(res) بعد نجاح الورقة.
 */
export async function runRequestAction(action, id, { user, navigate, onDone } = {}) {
  if (action.key === 'open' || action.key === 'none') {
    navigate(`/company-requests/${id}${action.focus ? `?focus=${action.focus}` : ''}`);
    return;
  }
  const detail = await api.get(`/admin/company-requests/${encodeURIComponent(id)}`);
  if (action.key === 'accept') {
    const { openAcceptSheet } = await import('../../components/company-accept-sheet.js');
    await openAcceptSheet({ detail, user, plan: action.plan ? detail.request.accept_plan : null, onDone });
  } else if (action.key === 'quote') {
    const { openQuoteSheet } = await import('../../components/company-quote-sheet.js');
    await openQuoteSheet({ detail, user, onDone });
  } else if (action.key === 'deliverable') {
    const { openDeliverableSheet } = await import('../../components/company-deliverable-sheet.js');
    await openDeliverableSheet({ detail, user, onDone });
  }
}

// ───────────────────────── الصفحة ─────────────────────────

const VIEW_KEY = 'bm.coq.view';
function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}
function saveView(v) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* تخزين المتصفح غير متاح: يبقى الاختيار لهذه الزيارة فقط */
  }
}

const STATUS_FILTERS = [
  { value: 'open', label: 'المفتوحة' },
  { value: 'submitted', label: 'جديدة' },
  { value: 'awaiting_company', label: 'بانتظار الشركة' },
  { value: 'in_progress', label: 'قيد العمل' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'closed', label: 'مغلقة' },
];
const SLA_FILTERS = [
  { value: 'late', label: 'متأخرة' },
  { value: 'at_risk', label: 'يقترب موعدها' },
  { value: 'paused', label: 'متوقفة' },
];
const NEEDS_FLAGS = ['clarification_answered', 'quote_approved', 'changes_requested', 'opinion_approved_not_delivered', 'memory_pending'];
/** المجموعات بترتيب العرض (A16: المصعّد ← المتأخر ← … ← يقترب الموعد ← الجديد) */
const GROUPS = [
  ['escalated', 'مصعّدة'],
  ['late', 'متأخرة'],
  ['plan_error', 'تعذّر بدء العمل تلقائيًا'],
  ['at_risk', 'يقترب موعدها'],
  ['new', 'جديدة — بانتظار الفرز'],
  ['needs', 'تحتاج إجراءً منكم'],
  ['working', 'قيد العمل'],
  ['awaiting', 'بانتظار الشركة'],
  ['closed', 'مغلقة'],
];
export function groupOf(it) {
  const f = it.flags || [];
  if (it.escalated) return 'escalated';
  if (it.sla && it.sla.state === 'late') return 'late';
  if (f.includes('plan_error')) return 'plan_error';
  if (it.sla && it.sla.state === 'at_risk') return 'at_risk';
  if (['closed', 'declined', 'cancelled'].includes(it.status)) return 'closed';
  if (NEEDS_FLAGS.some((x) => f.includes(x))) return 'needs';
  if (it.status === 'submitted') return 'new';
  if (it.status === 'awaiting_company') return 'awaiting';
  return 'working';
}

export default async function render(ctx) {
  const user = ctx.user || {};
  const state = {
    status: STATUS_FILTERS.some((s) => s.value === ctx.query.status) ? ctx.query.status : 'open',
    company: ctx.query.company_id || '',
    sla: SLA_FILTERS.some((s) => s.value === ctx.query.sla) ? ctx.query.sla : '',
    handler: ctx.query.handler_id || '',
    type: REQUEST_TYPES.some((t) => t.key === ctx.query.type) ? ctx.query.type : '',
    flag: ctx.query.flag || '',
    q: ctx.query.q || '',
    view: readView(),
  };
  const query = () => ({ status: state.status, company_id: state.company, sla: state.sla, handler_id: state.handler, type: state.type, flag: state.flag, q: state.q });
  const [first, companies, staff] = await Promise.all([
    api.get('/admin/company-requests', query()),
    api.get('/admin/companies').catch(() => ({ items: [] })),
    api.get('/admin/staff').catch(() => []),
  ]);
  let data = first;
  let seq = 0;

  const listHost = h('div.cq-list');
  const info = h('p.cq-info', { 'aria-live': 'polite' });
  const viewSwitch = h('div.segmented.cq-viewswitch', { role: 'group', 'aria-label': 'طريقة العرض' });

  function syncUrl() {
    const qs = new URLSearchParams(
      Object.entries({ status: state.status === 'open' ? '' : state.status, company_id: state.company, sla: state.sla, handler_id: state.handler, type: state.type, flag: state.flag, q: state.q }).filter(([, v]) => v),
    ).toString();
    const hash = `#/company-requests${qs ? `?${qs}` : ''}`;
    if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  async function load() {
    const my = ++seq;
    syncUrl();
    mount(listHost, loading('جارٍ تحميل الطلبات…'));
    try {
      const res = await api.get('/admin/company-requests', query());
      if (my !== seq) return;
      data = res;
      draw();
    } catch (err) {
      if (my !== seq) return;
      mount(listHost, errorState(err, load));
    }
  }

  async function act(it, action, btn) {
    try {
      await runRequestAction(action, it.id, { user, navigate: ctx.navigate, onDone: () => load() });
    } catch (err) {
      toast(err.message, 'danger');
    }
    void btn;
  }

  function cardOf(it) {
    const action = primaryActionOf(it, user);
    const titleId = `cq-${it.id}`;
    const primary =
      action.disabled
        ? button(action.label, { variant: 'secondary', icon: action.icon, disabled: true, className: 'cq-primary' })
        : action.key === 'open'
          ? button(action.label, { variant: action.label === 'فتح' ? 'secondary' : 'primary', icon: action.icon, href: `#/company-requests/${it.id}${action.focus ? `?focus=${action.focus}` : ''}`, className: 'cq-primary' })
          : asyncButton(action.label, (e) => act(it, action, e), { variant: 'primary', icon: action.icon, className: 'cq-primary' });
    return h(
      'li',
      h(
        'article.cq-card',
        { class: [`is-${groupOf(it)}`, it.staff_unread > 0 && 'is-unread'], 'aria-labelledby': titleId, dataset: { id: String(it.id) } },
        h(
          'div.cq-card-head',
          h('span.cq-company', it.company.name),
          codeTag(it.code),
          h('span.cq-card-badges', typeBadge(it.type, it.type_label), stageBadgeStaff(it)),
        ),
        h('h3.cq-card-title', h('a', { id: titleId, href: `#/company-requests/${it.id}`, dir: 'auto' }, it.title)),
        h('div.cq-card-sla', slaChip(it.sla, { clock: clockOf(it) }), it.priority && it.priority !== 'normal' && badge(it.priority_label || label('priority', it.priority), it.priority === 'urgent' ? 'danger' : it.priority === 'low' ? 'muted' : 'warning', { icon: 'flag' })),
        aiLine(it.ai, it),
        h('div.cq-flags', flagChips(it.flags, { staffUnread: it.staff_unread, skip: ['escalated'] })),
        h(
          'div.cq-card-foot',
          h('span.cq-meta', it.handler ? `المسؤول: ${it.handler.name}` : 'بلا مسؤول بعد', it.lead_name ? ` · المحامي الرئيسي: ${it.lead_name}` : ''),
          action.disabled ? h('span.cq-hint', 'يرسل مدير النظام عرض السعر') : null,
          primary,
        ),
      ),
    );
  }

  function drawCards(items) {
    const groups = new Map(GROUPS.map(([k]) => [k, []]));
    for (const it of items) groups.get(groupOf(it)).push(it);
    return GROUPS.filter(([k]) => groups.get(k).length).map(([k, title]) =>
      h(
        'section.cq-group',
        { class: `cq-group-${k}`, 'aria-label': title },
        h('h2.cq-group-title', h('span', title), h('span.cq-group-count.num', String(groups.get(k).length))),
        h('ul.cq-cards', groups.get(k).map(cardOf)),
      ),
    );
  }

  function drawList(items) {
    return card({
      flush: true,
      body: table({
        caption: 'طلبات الشركات',
        stack: true,
        rows: items,
        onRowClick: (r) => ctx.navigate(`/company-requests/${r.id}`),
        empty: 'لا توجد طلبات شركات مفتوحة.',
        columns: [
          { key: 'code', label: 'الطلب', render: (r) => h('div.cq-cell-req', codeTag(r.code), h('a', { href: `#/company-requests/${r.id}`, dir: 'auto' }, r.title)) },
          { key: 'company', label: 'الشركة', className: 'cq-col-co', render: (r) => r.company.name },
          { key: 'type', label: 'النوع', render: (r) => r.type_label },
          { key: 'status', label: 'الحالة', render: (r) => h('div.cq-cell-st', stageBadgeStaff(r), flagChips(r.flags, { skip: ['deadline_conflict'] })) },
          { key: 'sla', label: 'الموعد', className: 'cq-col-sla', render: (r) => slaChip(r.sla, { withDue: false, compact: true, clock: clockOf(r) }) },
          { key: 'handler', label: 'المسؤول', render: (r) => (r.handler ? r.handler.name : null) },
          { key: 'lead', label: 'المحامي الرئيسي', render: (r) => r.lead_name },
          { key: 'updated_at', label: 'آخر تحديث', render: (r) => h('time', { datetime: r.updated_at, title: dateTime(r.updated_at) }, relative(r.updated_at)) },
        ],
      }),
    });
  }

  function hasFilters() {
    return Boolean(state.company || state.sla || state.handler || state.type || state.flag || state.q);
  }

  function draw() {
    const items = data.items || [];
    info.textContent = items.length ? `عدد الطلبات: ${data.total ?? items.length}` : '';
    if (!items.length) {
      const text = hasFilters() ? 'لا توجد طلبات تطابق البحث أو الفلاتر المختارة.' : state.status === 'open' ? 'لا توجد طلبات شركات مفتوحة.' : 'لا توجد طلبات في هذه الحالة.';
      mount(listHost, card({ body: emptyState(text, null, { icon: 'inboxStack' }) }));
      return;
    }
    mount(listHost, state.view === 'cards' ? drawCards(items) : drawList(items));
  }

  function drawViewSwitch() {
    mount(
      viewSwitch,
      [
        ['cards', 'بطاقات', 'grid'],
        ['list', 'قائمة', 'list'],
      ].map(([v, text, ic]) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(state.view === v),
            onClick: () => {
              if (state.view === v) return;
              state.view = v;
              saveView(v);
              drawViewSwitch();
              draw();
            },
          },
          icon(ic, { size: 16 }),
          text,
        ),
      ),
    );
  }

  // «المسؤول»: «طلباتي» أولًا ثم فريق الإدارة
  const handlerOptions = [
    ...(user.id ? [{ value: String(user.id), label: 'طلباتي' }] : []),
    ...(Array.isArray(staff) ? staff : []).filter((s) => s.id !== user.id).map((s) => ({ value: String(s.id), label: s.name })),
  ];
  const filters = filterBar([
    searchInput({
      placeholder: 'رقم الطلب أو العنوان أو الشركة',
      label: 'بحث في طلبات الشركات',
      value: state.q,
      onSearch: (v) => {
        state.q = v;
        load();
      },
    }),
    selectInput({ label: 'الحالة', allLabel: null, options: STATUS_FILTERS, value: state.status, onChange: (v) => ((state.status = v || 'open'), load()) }),
    selectInput({ label: 'الشركة', allLabel: 'كل الشركات', options: (companies.items || []).map((c) => ({ value: String(c.id), label: c.name })), value: state.company, onChange: (v) => ((state.company = v), load()) }),
    selectInput({ label: 'الموعد', allLabel: 'كل المواعيد', options: SLA_FILTERS, value: state.sla, onChange: (v) => ((state.sla = v), load()) }),
    selectInput({ label: 'المسؤول', allLabel: 'كل المسؤولين', options: handlerOptions, value: state.handler, onChange: (v) => ((state.handler = v), load()) }),
    selectInput({ label: 'النوع', allLabel: 'كل الأنواع', options: REQUEST_TYPES.map((t) => ({ value: t.key, label: t.label })), value: state.type, onChange: (v) => ((state.type = v), load()) }),
  ]);
  const flagNote = state.flag && FLAG_COPY[state.flag]
    ? h(
        'p.cq-flag-filter',
        badge(FLAG_COPY[state.flag][0], FLAG_COPY[state.flag][1], { icon: FLAG_COPY[state.flag][2] }),
        button('إزالة هذا الفلتر', {
          variant: 'link',
          size: 'sm',
          onClick: (e) => {
            state.flag = '';
            e.currentTarget.closest('.cq-flag-filter')?.remove();
            load();
          },
        }),
      )
    : null;

  drawViewSwitch();
  draw();

  return h(
    'div.cq-page',
    pageHeader({
      title: 'طلبات الشركات',
      subtitle: 'كل طلبات الشركات العميلة مرتبة حسب أقرب موعد.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'طلبات الشركات' }],
      actions: [button('تحديث', { variant: 'ghost', icon: 'refresh', onClick: () => load() })],
    }),
    filters,
    flagNote,
    h('div.cq-bar', info, viewSwitch),
    listHost,
  );
}
