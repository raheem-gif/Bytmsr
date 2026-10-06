// البرامج والتمويل — (الإصدار 9 — وحدة programs)
// مصادر تمويل برنامج الدعم القانوني (منح، زكاة «نماء»، شراكات مسؤولية مجتمعية، تبرعات، موارد ذاتية):
// الميزانية مقابل الإنفاق الفعلي، معدل الإنفاق، الأسر والملفات المستفيدة، النتائج، وتقرير مطبوع للجهة الممولة.
// العرض وربط الملفات للإدارة كلها؛ الإنشاء والتعديل والإغلاق والحذف لمدير النظام فقط.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, options, money, num, percent, count, date, dateTime, areaLabel, areaOptions, governorateOptions, toLatinDigits } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  tabs,
  kv,
  chips,
  badge,
  statusBadge,
  button,
  asyncButton,
  alertBox,
  formDialog,
  confirmDialog,
  confirmDanger,
  modal,
  toast,
  icon,
  codeTag,
  emptyState,
  errorMessage,
  searchInput,
  selectInput,
  filterBar,
  loading,
  richText,
} from '../../../lib/ui.js';
import { printButton } from '../../components/print-button.js';
import { funderBadge, programStatusBadge, FORECAST_TONES, linkWithConfirm } from '../../components/program-picker.js';

const STATUS_FILTERS = [
  { value: 'open', label: 'البرامج الجارية (غير المغلقة)' },
  { value: 'active', label: 'النشطة فقط' },
  { value: 'planned', label: 'لم تبدأ بعد' },
  { value: 'suspended', label: 'الموقوفة مؤقتًا' },
  { value: 'closed', label: 'المغلقة' },
  { value: 'all', label: 'كل البرامج' },
];

/** نطاق تواريخ البرنامج */
function dateRange(p) {
  return `${date(p.start_date)} — ${p.end_date ? date(p.end_date) : 'مدة مفتوحة'}`;
}

/** مدة بالأشهر قد تكون كسرية: أقل من شهر بالأيام، والصحيحة بصيغة العدد («3 أشهر»)، والكسرية بالمفرد («2.5 شهر») */
function monthsText(m) {
  if (m == null || Number.isNaN(Number(m))) return '—';
  const v = Number(m);
  if (v < 1) return count(Math.max(1, Math.round(v * 30.4)), 'day');
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? count(r, 'month') : `${num(r)} شهر`;
}

function utilTone(u) {
  if (u == null) return 'muted';
  if (u >= 1) return 'danger';
  if (u >= 0.8) return 'warning';
  return 'success';
}

/** مقياس الميزانية مع علامة عتبة التنبيه الأولى (80% افتراضيًا) */
function budgetMeter(stats, { threshold = 80, compact = false } = {}) {
  const u = stats.utilization;
  const pct = u == null ? 0 : Math.min(100, Math.max(0, u * 100));
  const tone = utilTone(u);
  return h(
    'div.pg-meter-wrap',
    { class: compact && 'is-compact' },
    h(
      'div.pg-meter-label',
      h('span', h('strong', money(stats.spend)), ` من ${money(stats.budget)}`),
      h('span.pg-meter-pct', { class: `pg-tone-${tone}` }, u == null ? 'بلا ميزانية' : percent(u)),
    ),
    h(
      'div.pg-meter',
      {
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(pct),
        'aria-label': `نسبة الإنفاق من الميزانية${u == null ? '' : ` ${Math.round(u * 100)}`}`,
      },
      h('span.pg-meter-fill', { class: `pg-fill-${tone}`, style: { width: `${pct}%` } }),
      threshold < 100 && h('span.pg-meter-mark', { style: { insetInlineStart: `${threshold}%` }, title: `عتبة التنبيه ${threshold}%` }),
    ),
  );
}

function forecastBadge(stats) {
  return badge(stats.forecast_label || stats.forecast, FORECAST_TONES[stats.forecast] || 'neutral', { icon: stats.forecast === 'exhausted' || stats.forecast === 'overspend_risk' ? 'alert' : 'chart' });
}

// ───────────────────────── نموذج البرنامج ─────────────────────────

function programFields() {
  return [
    { name: 'name', label: 'اسم البرنامج', required: true, minLength: 3, maxLength: 200, full: true },
    { name: 'funder_name', label: 'الجهة الممولة', required: true, maxLength: 200 },
    { name: 'funder_type', label: 'نوع التمويل', type: 'select', required: true, options: options('funder_type') },
    { name: 'agreement_ref', label: 'رقم الاتفاقية أو المرجع', maxLength: 100, ltr: true, hint: 'مثل رقم اتفاقية المنحة أو قرار مجلس الإدارة' },
    { name: 'budget', label: 'الميزانية', type: 'money', required: true, min: 0 },
    { name: 'start_date', label: 'تاريخ البدء', type: 'date', required: true },
    { name: 'end_date', label: 'تاريخ الانتهاء', type: 'date', endOfDay: true, hint: 'اتركه فارغًا إن كان البرنامج مفتوح المدة' },
    {
      name: 'status',
      label: 'الحالة',
      type: 'select',
      placeholder: false,
      options: options('program_status').filter((o) => o.value !== 'closed'),
      hint: 'الإغلاق إجراء مستقل يحفظ تاريخه وسببه',
    },
    { name: 'funder_contact', label: 'التواصل مع الجهة الممولة (داخلي)', maxLength: 500 },
    { name: 'eligible_areas', label: 'المجالات القانونية المشمولة', type: 'multiselect', options: areaOptions(), hint: 'إن لم تحدد شيئًا فكل المجالات مشمولة' },
    { name: 'eligible_governorates', label: 'المحافظات المشمولة', type: 'multiselect', options: governorateOptions(), hint: 'إن لم تحدد شيئًا فالبرنامج على مستوى الجمهورية' },
    { name: 'restrictions', label: 'قيود الصرف وشروط الجهة الممولة', type: 'textarea', rows: 3, maxLength: 5000, hint: 'مثل: «أموال زكاة تُصرف في مصارفها الشرعية فقط»' },
    { name: 'description', label: 'وصف البرنامج', type: 'textarea', rows: 3, maxLength: 5000 },
  ];
}

async function openProgramDialog(ctx, program = null) {
  const values = program
    ? {
        ...program,
        eligible_areas: program.eligible_areas || [],
        eligible_governorates: program.eligible_governorates || [],
      }
    : { funder_type: 'grant', status: 'active', eligible_areas: [], eligible_governorates: [] };
  const res = await formDialog({
    title: program ? `تعديل البرنامج ${program.code}` : 'برنامج تمويل جديد',
    intro: program ? null : 'سجّل مصدر التمويل وميزانيته ومدته ونطاق أهليته، ثم اربط به ملفات المستفيدين ليُحتسب إنفاقها عليه.',
    size: 'lg',
    fields: programFields(),
    values,
    submitLabel: program ? 'حفظ التعديلات' : 'إنشاء البرنامج',
    onSubmit: (v) => {
      const body = {
        name: v.name,
        funder_name: v.funder_name,
        funder_type: v.funder_type,
        agreement_ref: v.agreement_ref || null,
        budget: v.budget,
        start_date: v.start_date,
        end_date: v.end_date || null,
        status: v.status || 'active',
        funder_contact: v.funder_contact || null,
        eligible_areas: v.eligible_areas || [],
        eligible_governorates: v.eligible_governorates || [],
        restrictions: v.restrictions || null,
        description: v.description || null,
      };
      return program ? api.patch(`/programs/${program.id}`, body) : api.post('/programs', body);
    },
  });
  if (!res) return;
  toast(program ? 'تم حفظ بيانات البرنامج' : `أُنشئ البرنامج ${res.program.code}`, 'success');
  if (program) await ctx.reload();
  else ctx.navigate(`/programs/${res.program.id}`);
}

/** قراءة قائمة نسب مثل «80، 100» أو «٨٠ ١٠٠» */
function parseThresholds(text) {
  return toLatinDigits(text)
    .split(/[\s,،؛;%]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
}

function fieldError(name, message) {
  const err = new Error(message);
  err.details = { fields: { [name]: message } };
  return err;
}

/** عتبات تنبيه الميزانية ونصوص المستندات المطبوعة (مدير النظام فقط) */
async function openSettingsDialog() {
  let current;
  try {
    current = await api.get('/programs/settings');
  } catch (err) {
    toast(errorMessage(err), 'danger');
    return;
  }
  const res = await formDialog({
    title: 'إعدادات تنبيهات الميزانية والطباعة',
    intro: 'تصل للإدارة تنبيهات عند بلوغ إنفاق أي برنامج كل نسبة من ميزانيته، مرة واحدة لكل نسبة، وتعود للعمل إذا عُدّلت ميزانية البرنامج. وتُطبع الملاحظتان أسفل الفواتير والإفادات القانونية.',
    fields: [
      {
        name: 'thresholds',
        label: 'نسب التنبيه من الميزانية',
        required: true,
        maxLength: 40,
        hint: 'من نسبة واحدة إلى خمس نسب بين 1 و200، مفصولة بفاصلة، مثل: 80، 100',
        full: true,
      },
      { name: 'print_invoice_note', label: 'ملاحظة أسفل الفواتير المطبوعة', type: 'textarea', rows: 2, maxLength: 500 },
      { name: 'print_answer_disclaimer', label: 'تنبيه أسفل الإفادات القانونية المطبوعة', type: 'textarea', rows: 3, maxLength: 1000 },
    ],
    values: {
      thresholds: (current.program_alert_thresholds || []).join('، '),
      print_invoice_note: current.print_invoice_note || '',
      print_answer_disclaimer: current.print_answer_disclaimer || '',
    },
    submitLabel: 'حفظ الإعدادات',
    onSubmit: (v) => {
      const list = parseThresholds(v.thresholds);
      if (!list.length || list.length > 5) throw fieldError('thresholds', 'اكتب من نسبة واحدة إلى خمس نسب');
      if (list.some((n) => !Number.isInteger(n) || n < 1 || n > 200)) throw fieldError('thresholds', 'كل نسبة عدد صحيح بين 1 و200');
      if (new Set(list).size !== list.length) throw fieldError('thresholds', 'النسب مكررة');
      return api.put('/programs/settings', {
        program_alert_thresholds: list,
        print_invoice_note: v.print_invoice_note || '',
        print_answer_disclaimer: v.print_answer_disclaimer || '',
      });
    },
  });
  if (res) toast('حُفظت إعدادات التنبيهات والطباعة', 'success');
}

// ───────────────────────── قائمة البرامج ─────────────────────────

function programCard(p) {
  const s = p.stats;
  return h(
    'article.card.pg-card',
    h(
      'div.pg-card-head',
      h('a.pg-card-title', { href: `#/programs/${p.id}` }, p.name),
      h('div.pg-card-meta', codeTag(p.code), programStatusBadge(p), funderBadge(p)),
    ),
    h('p.pg-card-funder', icon('users', { size: 15 }), h('span', p.funder_name)),
    budgetMeter(s, { compact: true }),
    h(
      'dl.pg-mini',
      h('div', h('dt', 'المتبقي'), h('dd', { class: s.remaining < 0 ? 'pg-text-danger' : null }, money(s.remaining))),
      h('div', h('dt', 'معدل الإنفاق الشهري'), h('dd', money(s.burn_rate_monthly))),
      h('div', h('dt', 'الأسر المستفيدة'), h('dd', num(s.families))),
      h('div', h('dt', 'الملفات'), h('dd', num(s.cases))),
    ),
    h('div.pg-card-foot', h('span.small.muted', icon('calendar', { size: 14 }), ` ${dateRange(p)}`), p.status !== 'closed' && forecastBadge(s)),
  );
}

async function renderList(ctx) {
  const isAdmin = ctx.user?.role === 'admin';
  const state = {
    status: STATUS_FILTERS.some((f) => f.value === ctx.query.status) ? ctx.query.status : 'open',
    funder: ctx.query.funder || '',
    q: ctx.query.q || '',
  };
  const listHost = h('div.stack');
  const statsHost = h('div');

  function syncUrl() {
    const qs = new URLSearchParams(Object.entries({ status: state.status === 'open' ? '' : state.status, funder: state.funder, q: state.q }).filter(([, v]) => v)).toString();
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/programs${qs ? `?${qs}` : ''}`);
    } catch {
      /* لا شيء */
    }
  }

  async function load() {
    mount(listHost, loading());
    let data;
    try {
      data = await api.get('/programs', { status: state.status === 'all' ? '' : state.status, funder_type: state.funder, q: state.q });
    } catch (err) {
      mount(listHost, card({ body: emptyState(errorMessage(err), button('إعادة المحاولة', { icon: 'refresh', onClick: load }), { icon: 'alert' }) }));
      return;
    }
    const t = data.totals;
    mount(
      statsHost,
      h(
        'div.stats-grid',
        statCard({ label: 'البرامج النشطة', value: num(t.active), hint: `من ${count(t.programs, ['برنامج واحد', 'برنامجين', 'برامج', 'برنامجًا'])} في هذا العرض`, icon: 'book', tone: 'primary' }),
        statCard({ label: 'إجمالي الميزانيات', value: money(t.budget), hint: 'للبرامج المعروضة', icon: 'wallet', tone: 'neutral' }),
        statCard({ label: 'الإنفاق الفعلي', value: money(t.spend), hint: t.budget > 0 ? `${percent(t.spend / t.budget)} من الميزانيات` : null, icon: 'chart', tone: 'accent' }),
        statCard({ label: 'المتبقي', value: money(t.remaining), icon: 'checkCircle', tone: t.remaining < 0 ? 'danger' : 'success' }),
        statCard({ label: 'الأسر المستفيدة', value: num(t.families), hint: `الملفات المرتبطة بالبرامج المعروضة: ${num(t.cases)}`, icon: 'users', tone: 'info' }),
        statCard({
          label: 'ملفات مفتوحة دون برنامج',
          value: num(t.unlinked_open_cases),
          hint: 'اربطها ببرنامج من صفحة الملف',
          icon: 'alert',
          tone: t.unlinked_open_cases ? 'warning' : 'muted',
          href: '#/cases',
        }),
      ),
    );
    if (!data.items.length) {
      const filtered = state.status !== 'open' || state.funder || state.q;
      mount(
        listHost,
        card({
          body: emptyState(
            filtered ? 'لا توجد برامج مطابقة للتصفية الحالية.' : 'لم تُسجَّل برامج تمويل بعد. أضف أول برنامج (منحة أو زكاة أو شراكة مسؤولية مجتمعية) ثم اربط به ملفات المستفيدين.',
            !filtered && isAdmin ? button('برنامج جديد', { variant: 'primary', icon: 'plus', onClick: () => openProgramDialog(ctx) }) : null,
            { icon: 'book' },
          ),
        }),
      );
      return;
    }
    mount(listHost, h('div.pg-grid', data.items.map(programCard)));
  }

  const header = pageHeader({
    title: 'البرامج والتمويل',
    subtitle: 'مصادر تمويل الدعم القانوني — المنح، وأموال الزكاة (نماء)، وشراكات المسؤولية المجتمعية، والتبرعات — والإنفاق الفعلي على كل منها وأثره.',
    actions: isAdmin
      ? [
          button('إعدادات التنبيهات والطباعة', { variant: 'ghost', icon: 'settings', onClick: openSettingsDialog }),
          button('برنامج جديد', { variant: 'primary', icon: 'plus', onClick: () => openProgramDialog(ctx) }),
        ]
      : null,
  });

  const filters = filterBar([
    searchInput({
      placeholder: 'بحث باسم البرنامج أو الجهة الممولة أو الرقم…',
      value: state.q,
      label: 'بحث في البرامج',
      onSearch: (q) => {
        state.q = q;
        syncUrl();
        load();
      },
    }),
    selectInput({
      label: 'حالة البرنامج',
      options: STATUS_FILTERS,
      value: state.status,
      allLabel: null,
      onChange: (v) => {
        state.status = v || 'open';
        syncUrl();
        load();
      },
    }),
    selectInput({
      label: 'نوع التمويل',
      options: options('funder_type'),
      value: state.funder,
      allLabel: 'كل أنواع التمويل',
      onChange: (v) => {
        state.funder = v;
        syncUrl();
        load();
      },
    }),
  ]);

  load();
  return frag(
    header,
    statsHost,
    filters,
    listHost,
    h(
      'p.pg-footnote',
      'الإنفاق الفعلي = أتعاب المحامين المستحقة على ملفات البرنامج (بالقطعة والزيادة والأتعاب المباشرة والتسويات) + استرداد ما دفعه المحامون + المصروفات التي دفعتها المؤسسة مباشرة، خلال مدة البرنامج. لا تُحتسب المبالغ الشهرية الثابتة وقيم الباقات (غير مرتبطة بملف) ولا ما دفعه المستفيد.',
    ),
  );
}

// ───────────────────────── تفاصيل البرنامج ─────────────────────────

/** أشرطة أفقية بسيطة (القيم مكتوبة بجانب كل شريط) */
function bars(rows, { valueText = (r) => num(r.value), empty = 'لا توجد بيانات بعد', ariaLabel } = {}) {
  if (!rows.length) return emptyState(empty, null, { compact: true, icon: 'chart' });
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  return h(
    'ul.pg-bars',
    { 'aria-label': ariaLabel || null },
    rows.map((r) =>
      h(
        'li.pg-bar-row',
        h('span.pg-bar-label', r.label),
        h('span.pg-bar-track', { 'aria-hidden': 'true' }, h('span.pg-bar-fill', { class: r.tone && `pg-fill-${r.tone}`, style: { width: `${Math.max(Number(r.value) > 0 ? 2 : 0, ((Number(r.value) || 0) / max) * 100)}%` } })),
        h('span.pg-bar-value', valueText(r)),
      ),
    ),
  );
}

async function renderDetail(ctx) {
  const id = ctx.params.id;
  const isAdmin = ctx.user?.role === 'admin';
  const d = await api.get(`/programs/${encodeURIComponent(id)}`);
  const p = d.program;
  const s = d.stats;
  const closed = p.status === 'closed';
  const firstThreshold = (d.thresholds || [80]).find((x) => x < 100) || 80;
  ctx.setTitle(`${p.code} — ${p.name}`);

  let tabsEl = null;
  function syncTab(key) {
    const qs = key && key !== 'cases' ? `?tab=${key}` : '';
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/programs/${id}${qs}`);
    } catch {
      /* لا شيء */
    }
  }
  async function refresh(msg, tab) {
    if (msg) toast(msg, 'success');
    if (tab) syncTab(tab);
    ctx.refreshShell();
    await ctx.reload();
  }

  // ── الإجراءات ──
  const actions = [printButton({ kind: 'programme', id: p.id, label: 'تقرير للجهة الممولة', variant: 'secondary', size: 'md' })];
  if (isAdmin) {
    if (!closed) {
      actions.push(button('تعديل', { icon: 'edit', onClick: () => openProgramDialog(ctx, p) }));
      actions.push(
        button('إغلاق البرنامج', {
          icon: 'lock',
          variant: 'danger',
          onClick: async () => {
            const res = await formDialog({
              title: `إغلاق البرنامج ${p.code}`,
              intro: 'بعد الإغلاق لا يقبل البرنامج ربط ملفات جديدة، وتبقى ملفاته وإنفاقه وتقاريره محفوظة. يمكن لمدير النظام إعادة فتحه لاحقًا.',
              fields: [{ name: 'note', label: 'ملاحظة الإغلاق', type: 'textarea', rows: 3, maxLength: 1000, hint: 'مثل: «انتهت مدة المنحة وقُدِّم التقرير الختامي»' }],
              submitLabel: 'إغلاق البرنامج',
              onSubmit: (v) => api.post(`/programs/${p.id}/close`, { note: v.note || null }),
            });
            if (res) await refresh('أُغلق البرنامج');
          },
        }),
      );
    } else {
      actions.push(
        asyncButton(
          'إعادة فتح البرنامج',
          async () => {
            const ok = await confirmDialog({ title: 'إعادة فتح البرنامج', message: `سيعود البرنامج ${p.code} نشطًا ويقبل ربط ملفات جديدة.`, confirmLabel: 'إعادة الفتح' });
            if (!ok) return;
            await api.post(`/programs/${p.id}/reopen`);
            await refresh('أُعيد فتح البرنامج');
          },
          { icon: 'refresh', variant: 'primary' },
        ),
      );
    }
    if (!s.cases) {
      actions.push(
        asyncButton(
          'حذف',
          async () => {
            const ok = await confirmDanger({ title: 'حذف البرنامج', message: `سيُحذف البرنامج ${p.code} «${p.name}» نهائيًا. لا يمكن التراجع عن هذا الإجراء.`, confirmLabel: 'نعم، احذف البرنامج' });
            if (!ok) return;
            await api.del(`/programs/${p.id}`);
            toast('حُذف البرنامج', 'success');
            ctx.navigate('/programs');
          },
          { icon: 'trash', variant: 'ghost' },
        ),
      );
    }
  }

  const header = pageHeader({
    title: p.name,
    breadcrumbs: [{ label: 'البرامج والتمويل', href: '#/programs' }, { label: p.code }],
    meta: [codeTag(p.code), programStatusBadge(p), funderBadge(p), !closed && forecastBadge(s)],
    actions,
  });

  // ── التنبيهات ──
  const notices = [];
  if (closed) notices.push(alertBox(`أُغلق البرنامج ${p.closed_at ? `في ${date(p.closed_at)}` : ''}${p.closed_by_name ? ` بواسطة ${p.closed_by_name}` : ''}${p.close_note ? ` — ${p.close_note}` : ''}. لا يقبل ربط ملفات جديدة.`, 'info', { icon: 'lock' }));
  else {
    if (s.utilization != null && s.utilization >= 1) notices.push(alertBox(`استُنفدت ميزانية البرنامج: المصروف ${money(s.spend)} من ${money(s.budget)}${s.remaining < 0 ? `، بتجاوز ${money(-s.remaining)}` : ''}. راجع ربط ملفات جديدة أو زيادة الميزانية بالاتفاق مع الجهة الممولة.`, 'danger', { title: 'تجاوز الميزانية' }));
    else if (s.utilization != null && s.utilization * 100 >= firstThreshold) notices.push(alertBox(`بلغ الإنفاق ${percent(s.utilization)} من الميزانية، والمتبقي ${money(s.remaining)}${s.runway_months != null ? ` (يكفي المتبقي نحو ${monthsText(s.runway_months)} بمعدل الإنفاق الحالي)` : ''}.`, 'warning', { title: 'اقتراب من حد الميزانية' }));
    if (d.warnings.length) notices.push(alertBox(d.warnings.join(' — '), 'warning'));
  }

  // ── المؤشرات ──
  const statsGrid = h(
    'div.stats-grid',
    statCard({ label: 'الميزانية', value: money(s.budget), icon: 'wallet', tone: 'neutral' }),
    statCard({ label: 'الإنفاق الفعلي', value: money(s.spend), hint: s.utilization != null ? `${percent(s.utilization)} من الميزانية` : null, icon: 'chart', tone: utilTone(s.utilization) === 'success' ? 'accent' : utilTone(s.utilization) }),
    statCard({ label: 'المتبقي', value: money(s.remaining), icon: 'checkCircle', tone: s.remaining < 0 ? 'danger' : 'success' }),
    statCard({ label: 'معدل الإنفاق الشهري', value: money(s.burn_rate_monthly), hint: s.projected_total != null ? `المتوقع حتى نهاية المدة: ${money(s.projected_total)}` : null, icon: 'zap', tone: 'primary' }),
    statCard({ label: 'الأسر المستفيدة', value: num(s.families), hint: `${count(s.cases, 'case')} — المغلق منها ${num(s.closed_cases)}`, icon: 'users', tone: 'info' }),
    statCard({ label: 'متوسط الإنفاق للملف', value: s.cost_per_case != null ? money(s.cost_per_case) : '—', hint: s.in_kind_count ? `مساهمات تطوعية بقيمة ${money(s.in_kind_value)}` : null, icon: 'scale', tone: 'neutral' }),
  );

  const budgetCard = card({
    title: 'الميزانية والإنفاق',
    icon: 'wallet',
    body: frag(
      budgetMeter(s, { threshold: firstThreshold }),
      kv([
        ['المدة المنقضية', s.elapsed_ratio != null ? `${percent(s.elapsed_ratio)} (${count(s.days_elapsed, 'day')} من ${count(s.days_total, 'day')})` : s.started ? count(s.days_elapsed, 'day') : 'لم يبدأ بعد'],
        ['أتعاب المحامين', money(s.by_category.lawyer_fees)],
        ['استرداد مصروفات المحامين', money(s.by_category.reimbursements)],
        ['مصروفات دفعتها المؤسسة', money(s.by_category.expenses)],
        s.projected_total != null && ['الإنفاق المتوقع حتى نهاية المدة', h('span', money(s.projected_total), s.budget > 0 && h('span.small.muted', ` (${percent(s.projected_total / s.budget)} من الميزانية)`))],
        s.runway_months != null && ['تكفي الميزانية المتبقية', `نحو ${monthsText(s.runway_months)} بمعدل الإنفاق الحالي`],
        s.in_kind_count > 0 && ['مساهمات تطوعية (عينية)', `${count(s.in_kind_count, 'consultation')} بقيمة تقديرية ${money(s.in_kind_value)} — لا تُخصم من الميزانية`],
      ]),
      h('p.small.muted', 'تصل للإدارة تنبيهات عند بلوغ الإنفاق ', d.thresholds.map((x) => `${x}%`).join(' و'), ' من الميزانية، مرة واحدة لكل عتبة.'),
    ),
  });

  const infoCard = card({
    title: 'بيانات البرنامج والجهة الممولة',
    icon: 'book',
    body: frag(
      kv([
        ['الجهة الممولة', h('span', p.funder_name, ' ', funderBadge(p))],
        ['رقم الاتفاقية', p.agreement_ref ? codeTag(p.agreement_ref) : null],
        ['التواصل مع الجهة', p.funder_contact],
        ['المدة', dateRange(p)],
        ['المجالات المشمولة', p.eligible_areas.length ? chips(p.eligible_areas.map((a) => ({ label: areaLabel(a), tone: 'info' }))) : h('span.muted', 'كل المجالات')],
        ['النطاق الجغرافي', p.eligible_governorates.length ? chips(p.eligible_governorates) : h('span.muted', 'على مستوى الجمهورية')],
        ['أنشأه', p.created_by_name ? `${p.created_by_name} — ${date(p.created_at)}` : date(p.created_at)],
      ]),
      p.restrictions && h('div.pg-text-block', h('h3.pg-subtitle', icon('shield', { size: 15 }), ' قيود الصرف وشروط الجهة الممولة'), h('p', { dir: 'auto' }, p.restrictions)),
      p.description && h('div.pg-text-block', h('h3.pg-subtitle', 'الوصف'), h('p', { dir: 'auto' }, p.description)),
    ),
  });

  // ── التبويبات ──
  function renderCases() {
    const cols = [
      { key: 'code', label: 'الملف', render: (c) => h('div.stack-sm', h('a.pb-code-link', { href: `#/cases/${c.id}` }, codeTag(c.code)), h('span.cell-sub', richText(c.title))) },
      { key: 'client', label: 'المستفيد', render: (c) => h('div.stack-sm', h('a', { href: `#/clients/${c.client_id}` }, c.client_name || 'دون اسم'), h('span.cell-sub', c.governorate || 'محافظة غير مسجلة')) },
      { key: 'area', label: 'المجال', render: (c) => c.legal_area_label },
      { key: 'status', label: 'الحالة', render: (c) => h('div.stack-sm', statusBadge('case_status', c.status), c.outcome && statusBadge('case_outcome', c.outcome), c.matter_code && h('a.small.nowrap', { href: `#/matters/${c.matter_id}`, title: `فتح الملف المستمر ${c.matter_code}` }, 'ملف مستمر ', h('span', { dir: 'ltr' }, c.matter_code))) },
      { key: 'spend', label: 'الإنفاق', align: 'end', render: (c) => h('span.nowrap', money(c.spend)) },
      {
        key: 'elig',
        label: 'الأهلية',
        render: (c) => (c.eligibility.length ? badge('خارج النطاق', 'warning', { icon: 'alert', title: c.eligibility.join(' — ') }) : badge('مؤهل', 'success', { icon: 'check' })),
      },
      // البرنامج المغلق سجل نهائي: لا يُلغى ربط ملفاته حتى يُعاد فتحه (والخادم يرفض ذلك أيضًا)
      !closed && {
        key: 'actions',
        label: '',
        render: (c) =>
          asyncButton(
            'إلغاء الربط',
            async () => {
              const ok = await confirmDialog({
                title: 'إلغاء ربط الملف بالبرنامج',
                message: `لن يُحتسب إنفاق الملف ${c.code} ضمن هذا البرنامج بعد الآن. يُسجَّل الإجراء في سجل الملف.`,
                confirmLabel: 'إلغاء الربط',
                danger: true,
              });
              if (!ok) return;
              await api.del(`/programs/${p.id}/cases/${c.id}`);
              await refresh(`أُلغي ربط الملف ${c.code}`, 'cases');
            },
            { size: 'sm', variant: 'ghost', icon: 'x' },
          ),
      },
    ].filter(Boolean);
    return card({
      title: 'الملفات المرتبطة بالبرنامج',
      subtitle: closed
        ? 'البرنامج مغلق: قائمة الملفات نهائية ولا تتغير إلا بعد إعادة فتحه'
        : 'الملف ينتمي لبرنامج واحد على الأكثر، وملفه المستمر (إن وُجد) يُحتسب ضمنه تلقائيًا',
      icon: 'briefcase',
      flush: true,
      actions: !closed && button('ربط ملف', { size: 'sm', variant: 'primary', icon: 'plus', onClick: openLinkDialog }),
      body: table({ columns: cols, rows: d.cases, caption: 'الملفات المرتبطة بالبرنامج', empty: 'لا توجد ملفات مرتبطة بهذا البرنامج بعد' }),
    });
  }

  function renderSpend() {
    const monthly = d.spend.monthly || [];
    const lines = d.spend.lines || [];
    const catRows = [
      { label: label('program_spend_kind', 'lawyer_fees'), value: s.by_category.lawyer_fees, tone: 'primary' },
      { label: label('program_spend_kind', 'reimbursements'), value: s.by_category.reimbursements, tone: 'accent' },
      { label: label('program_spend_kind', 'expenses'), value: s.by_category.expenses, tone: 'info' },
    ];
    return h(
      'div.stack',
      h(
        'div.grid-2',
        card({
          title: 'الإنفاق الشهري',
          subtitle: 'المصروف في كل شهر والإجمالي التراكمي',
          icon: 'chart',
          body: bars(
            monthly.map((m) => ({ label: m.label, value: m.amount, cumulative: m.cumulative })),
            { valueText: (r) => h('span', money(r.value), h('span.small.muted.pg-d-block', `تراكمي ${money(r.cumulative)}`)), empty: 'لم يبدأ البرنامج بعد', ariaLabel: 'الإنفاق الشهري' },
          ),
        }),
        card({ title: 'الإنفاق حسب البند', icon: 'wallet', body: bars(catRows, { valueText: (r) => h('span', money(r.value), s.spend > 0 && h('span.small.muted', ` (${percent(r.value / s.spend)})`)), ariaLabel: 'الإنفاق حسب البند' }) }),
      ),
      card({
        title: 'بنود الإنفاق',
        subtitle: d.spend.total_lines > lines.length ? `أحدث ${num(lines.length)} من ${num(d.spend.total_lines)} بندًا` : null,
        icon: 'fileText',
        flush: true,
        body: table({
          caption: 'بنود الإنفاق على البرنامج',
          rows: lines,
          empty: 'لا يوجد إنفاق مسجل على ملفات هذا البرنامج خلال مدته',
          columns: [
            { key: 'at', label: 'التاريخ', render: (l) => h('time.small.nowrap', { datetime: l.at, title: dateTime(l.at) }, date(l.at)) },
            { key: 'description', label: 'البيان', className: 'col-wide', render: (l) => h('div.stack-sm', h('span', { dir: 'auto' }, l.description), l.lawyer_name && h('span.cell-sub', l.lawyer_name)) },
            { key: 'case', label: 'الملف', render: (l) => (l.matter_code ? h('a', { href: `#/matters/${l.matter_id}` }, codeTag(l.matter_code)) : h('a', { href: `#/cases/${l.case_id}` }, codeTag(l.case_code))) },
            { key: 'cat', label: 'البند', render: (l) => h('div.stack-sm', h('span', label('program_spend_kind', l.category)), l.status === 'paid' ? badge('مصروف للمحامي', 'success') : l.status === 'accrued' ? badge('مستحق لم يُصرف', 'warning') : null) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (l) => h('strong.nowrap', { class: l.amount < 0 ? 'pg-text-danger' : null }, money(l.amount)) },
          ],
        }),
      }),
      h('p.pg-footnote', 'تُحتسب أتعاب المحامين المستحقة على ملفات البرنامج (بالقطعة، والزيادة على الحصة، والأتعاب المباشرة للملفات المستمرة، والتسويات) واستردادات مصروفاتهم، والمصروفات التي دفعتها المؤسسة مباشرة — خلال مدة البرنامج فقط. القيود الملغاة لا تُحتسب.'),
    );
  }

  function renderImpact() {
    const im = d.impact || {};
    const ext = im.external;
    return h(
      'div.stack',
      h(
        'div.stats-grid',
        statCard({ label: 'الأسر المستفيدة', value: num(s.families), icon: 'users', tone: 'info' }),
        statCard({ label: 'استشارات أُرسل ردها للمستفيد', value: num(s.answered), icon: 'send', tone: 'success' }),
        statCard({ label: 'ملفات مستمرة (تقاضٍ ومتابعة)', value: num(s.matters), icon: 'gavel', tone: 'accent' }),
        statCard({ label: 'جلسات حُضرت', value: num(im.hearings_attended || 0), icon: 'calendar', tone: 'primary' }),
      ),
      h(
        'div.grid-2',
        card({ title: 'نتائج الملفات المغلقة', icon: 'checkCircle', body: bars((im.outcomes || []).map((o) => ({ label: o.label, value: o.count, tone: 'success' })), { empty: 'لم يُغلق أي ملف في البرنامج بعد', valueText: (r) => count(r.value, 'case') }) }),
        card({ title: 'حالة الملفات', icon: 'briefcase', body: bars((im.by_status || []).map((o) => ({ label: o.label, value: o.count })), { valueText: (r) => count(r.value, 'case') }) }),
        card({ title: 'المجالات القانونية', icon: 'scale', body: bars((im.by_area || []).map((o) => ({ label: o.label, value: o.cases, families: o.families, tone: 'info' })), { valueText: (r) => count(r.value, 'case') }) }),
        card({ title: 'التوزيع الجغرافي (الأسر)', icon: 'mapPin', body: bars((im.by_governorate || []).map((o) => ({ label: o.label, value: o.families, tone: 'accent' })), { valueText: (r) => count(r.value, ['أسرة واحدة', 'أسرتان', 'أسر', 'أسرة']) }) }),
      ),
      ext && Array.isArray(ext.items) && ext.items.length
        ? card({ title: ext.title || 'مؤشرات الأثر', icon: 'star', body: kv(ext.items.map((x) => [x.label, x.value == null ? '—' : String(x.value)]), { columns: 2 }) })
        : null,
    );
  }

  function renderAlerts() {
    return card({
      title: 'تنبيهات الميزانية',
      subtitle: `تُرسل للإدارة مرة واحدة عند بلوغ ${d.thresholds.map((x) => `${x}%`).join(' و')} من الميزانية، وتعود للعمل إذا عُدّلت الميزانية`,
      icon: 'bell',
      body: d.alerts.length
        ? h(
            'ul.pg-alerts',
            d.alerts.map((a) =>
              h(
                'li.pg-alert-item',
                { class: !a.current && 'is-muted' },
                badge(`${a.threshold}%`, a.threshold >= 100 ? 'danger' : 'warning', { icon: 'alert' }),
                h('span', `الإنفاق ${money(a.spend)} من ميزانية ${money(a.budget)}`),
                h('time.small.muted', { datetime: a.created_at }, dateTime(a.created_at)),
                !a.current && h('span.small.muted', '(ميزانية سابقة)'),
              ),
            ),
          )
        : emptyState('لم يصدر أي تنبيه لهذا البرنامج بعد', null, { compact: true, icon: 'bell' }),
    });
  }

  async function openLinkDialog() {
    const resultsHost = h('div.pg-search-results', { 'aria-live': 'polite' });
    let seq = 0;
    async function search(q) {
      const my = ++seq;
      if (!q || q.length < 2) {
        mount(resultsHost, h('p.small.muted', 'اكتب كود الملف (مثل INH-2026) أو اسم المستفيد أو عنوان الملف.'));
        return;
      }
      mount(resultsHost, loading('جارٍ البحث…'));
      try {
        const res = await api.get('/admin/cases', { q, limit: 15 });
        if (my !== seq) return;
        const linkedIds = new Set(d.cases.map((c) => c.id));
        const items = (res.items || []).filter((c) => !linkedIds.has(c.id));
        if (!items.length) {
          mount(resultsHost, emptyState('لا توجد ملفات مطابقة غير مرتبطة بهذا البرنامج', null, { compact: true, icon: 'search' }));
          return;
        }
        mount(
          resultsHost,
          h(
            'ul.pg-result-list',
            items.map((c) =>
              h(
                'li',
                h(
                  'button.pg-result',
                  {
                    type: 'button',
                    onClick: async (e) => {
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      try {
                        const r = await linkWithConfirm((extra) => api.post(`/programs/${p.id}/cases`, { case_id: c.id, ...extra }));
                        if (!r) return;
                        m.close('done');
                        await refresh(`رُبط الملف ${c.code} بالبرنامج`, 'cases');
                      } catch (err) {
                        toast(errorMessage(err), 'danger');
                      } finally {
                        btn.disabled = false;
                      }
                    },
                  },
                  codeTag(c.code),
                  h('span.pg-result-title', c.title),
                  h('span.small.muted', `${c.client_name || 'دون اسم'} — ${areaLabel(c.legal_area)}`),
                  statusBadge('case_status', c.status),
                ),
              ),
            ),
          ),
        );
      } catch (err) {
        if (my === seq) mount(resultsHost, h('p.small.pg-text-danger', errorMessage(err)));
      }
    }
    const m = modal({
      title: `ربط ملف ببرنامج ${p.code}`,
      size: 'md',
      body: h(
        'div.stack',
        h('p.modal-intro', 'ابحث عن ملف الاستشارة واختره. يتحقق النظام من مجال الملف ومحافظة المستفيد مقابل نطاق البرنامج، ويطلب تأكيدك قبل ربط ملف خارج النطاق أو نقله من برنامج آخر.'),
        searchInput({ placeholder: 'كود الملف أو اسم المستفيد…', label: 'البحث عن ملف', onSearch: search }),
        resultsHost,
      ),
      actions: [{ label: 'إغلاق', variant: 'ghost' }],
    });
    search('');
  }

  const initialTab = ['cases', 'spend', 'impact', 'alerts'].includes(ctx.query.tab) ? ctx.query.tab : 'cases';
  tabsEl = tabs(
    [
      { key: 'cases', label: 'الملفات', icon: 'briefcase', count: d.cases.length, render: renderCases },
      { key: 'spend', label: 'الإنفاق', icon: 'wallet', render: renderSpend },
      { key: 'impact', label: 'النتائج والأثر', icon: 'star', render: renderImpact },
      { key: 'alerts', label: 'التنبيهات', icon: 'bell', count: d.alerts.filter((a) => a.current).length || null, render: renderAlerts },
    ],
    { active: initialTab, onChange: (key) => syncTab(key) },
  );

  return frag(header, notices.length ? h('div.stack', notices) : null, statsGrid, h('div.grid-2.pg-detail-cards', budgetCard, infoCard), tabsEl);
}

export default async function render(ctx) {
  if (ctx.params && ctx.params.id) return renderDetail(ctx);
  return renderList(ctx);
}
