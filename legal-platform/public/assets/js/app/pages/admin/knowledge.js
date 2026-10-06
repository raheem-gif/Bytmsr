// المعرفة المؤسسية والذكاء الاصطناعي: قاعدة المعرفة المجهّلة المعتمدة، البحث بالمعنى، التصدير للتدريب،
// وأداء الذكاء الاصطناعي المقاس من تصحيحات الإدارة والمحامين (كل تصحيح تغذية راجعة جديدة).

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, num, count, percent, dateTime, relative, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  statCard,
  table,
  tabs,
  filterBar,
  selectInput,
  searchInput,
  chips,
  badge,
  statusBadge,
  button,
  asyncButton,
  emptyState,
  errorState,
  loading,
  alertBox,
  toast,
  icon,
  codeTag,
  kv,
  richText,
} from '../../../lib/ui.js';
import { replaceQuery } from './lawyers.js';
// v9 (وحدة ai): الاستهلاك والتكلفة وسقف الإنفاق، حالة المزود واختبار الاتصال، وتحليلات المستندات
import { aiStatusCard, aiUsageSection, recentDocAnalyses } from '../../components/ai-usage.js';

const MONTH_FMT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  return y && m ? MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 15))) : String(ym || '—');
};

const PROVIDER_LABELS = { anthropic: 'Claude (Anthropic)', heuristic: 'المحلل المحلي (بدون إنترنت)' };
const KIND_LABELS = {
  intake_analysis: 'تحليل الطلبات الواردة وتصنيفها',
  issues: 'اقتراح المسائل القانونية',
  draft: 'مسودة أولية للمحامي',
  client_version: 'صياغة نسخة الرد للمستفيد',
  reply: 'الردود المقترحة على المستفيد',
};
const VERDICT_ORDER = ['accepted', 'corrected', 'rejected', 'missed'];
const VERDICT_COLORS = { accepted: 'var(--success-600)', corrected: 'var(--warning-500)', rejected: 'var(--danger-600)', missed: 'var(--pd-c3)' };

/** يحوّل قيمة اقتراح/قرار (نص أو JSON) إلى عرض مقروء، مع ترجمة أكواد المجالات. */
export function valueNodes(field, raw) {
  let v = raw;
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try {
      v = JSON.parse(v);
    } catch {
      /* نص عادي */
    }
  }
  const show = (x) => {
    const s = String(x ?? '').trim();
    if (/^[A-Z]{3}$/.test(s) && (field === 'legal_area' || field === 'specialist_needed')) return areaLabel(s);
    if (s === 'true') return 'نعم';
    if (s === 'false') return 'لا';
    return s;
  };
  if (Array.isArray(v)) {
    if (!v.length) return h('span.muted', 'لا شيء');
    return h('ul.pd-corr-list', v.map((x) => h('li', richText(show(typeof x === 'object' ? JSON.stringify(x) : x)))));
  }
  if (v && typeof v === 'object') return h('p.pre', JSON.stringify(v, null, 1));
  const s = show(v);
  return s ? h('p.pre', richText(s)) : h('span.muted', 'لا شيء');
}

/** عنصر تصحيح واحد: اقتراح الذكاء الاصطناعي مقابل القرار النهائي. */
export function correctionItem(c, { showCase = true } = {}) {
  const actor = c.actor_name ? `${c.actor_name} (${label('user_role', c.actor_role)})` : c.by || (c.actor_role ? label('user_role', c.actor_role) : null);
  return h(
    'li.pd-corr',
    h(
      'div.pd-corr-head',
      badge(c.field_label || label('ai_field', c.field), 'neutral'),
      statusBadge('ai_verdict', c.verdict),
      showCase && c.case_code ? h('a', { href: `#/cases/${c.case_id}` }, codeTag(c.case_code)) : null,
      actor && h('span.cell-sub', `بواسطة ${actor}`),
      c.created_at && h('time.cell-sub', { datetime: c.created_at, title: dateTime(c.created_at) }, relative(c.created_at)),
    ),
    h(
      'div.pd-corr-diff',
      h('div.pd-corr-col.is-ai', h('div.pd-corr-label', icon('sparkle', { size: 14 }), 'اقتراح الذكاء الاصطناعي'), valueNodes(c.field, c.ai_value)),
      h(
        'div.pd-corr-col.is-final',
        h('div.pd-corr-label', icon('checkCircle', { size: 14 }), c.verdict === 'missed' ? 'ما أضافه الإنسان ولم يلتقطه' : 'القرار النهائي'),
        valueNodes(c.field, c.final_value),
      ),
    ),
    c.note && h('p.cell-sub', c.note),
  );
}

/** قائمة تصحيحات تعرض أول عدد منها مع زر لعرض الباقي. */
export function correctionsList(items, { limit = 6, showCase = true } = {}) {
  const list = h('ul.pd-corrs', items.slice(0, limit).map((c) => correctionItem(c, { showCase })));
  if (items.length <= limit) return list;
  const more = button(`عرض كل التصحيحات (${num(items.length)})`, {
    variant: 'ghost',
    icon: 'chevronDown',
    onClick: () => {
      list.append(...items.slice(limit).map((c) => correctionItem(c, { showCase })));
      more.remove();
    },
  });
  return h('div.stack', list, more);
}

function pipeline() {
  const steps = [
    { icon: 'briefcase', title: 'إغلاق الملف', text: 'يُبنى سجل يحفظ رحلة الحالة كاملة: الوقائع، المسائل، ما طُلب من المستفيد/ة، المتخصصون، التصحيحات، والإجابة المعتمدة.' },
    { icon: 'eyeOff', title: 'إخفاء البيانات الشخصية', text: 'تُخفى الأسماء والهواتف والأرقام القومية والعناوين والأكواد آليًا قبل أي استخدام.' },
    { icon: 'shieldCheck', title: 'مراجعة واعتماد', text: 'تراجع الإدارة الإخفاء وتحدد الاستخدام: للاسترجاع المعرفي فقط، أو للتدريب وقياس الأداء أيضًا.' },
  ];
  return h(
    'ol.pd-pipeline',
    { 'aria-label': 'مراحل بناء المعرفة المؤسسية' },
    steps.map((s, i) =>
      h('li.pd-step', h('span.pd-step-icon', icon(s.icon, { size: 20 })), h('div.pd-step-text', h('h3', h('span.pd-step-num', `${i + 1}`), s.title), h('p', s.text))),
    ),
  );
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export default async function render(ctx) {
  const isAdmin = ctx.user?.role === 'admin';
  const statuses = options('knowledge_status').map((o) => o.value);
  const usages = options('knowledge_usage').map((o) => o.value);
  const areas = areaOptions().map((a) => a.value);
  const state = {
    status: statuses.includes(ctx.query.status) ? ctx.query.status : '',
    area: areas.includes(ctx.query.area) ? ctx.query.area : '',
    usage: usages.includes(ctx.query.usage) ? ctx.query.usage : '',
    q: String(ctx.query.q || '').slice(0, 200),
  };
  let activeTab = ctx.query.tab === 'ai' ? 'ai' : 'kb';
  let data = await api.get('/admin/knowledge', { status: state.status, area: state.area, usage: state.usage, q: state.q });

  function syncUrl() {
    replaceQuery('/knowledge', activeTab === 'ai' ? { tab: 'ai' } : { status: state.status, area: state.area, usage: state.usage, q: state.q });
  }

  // ───────────── قاعدة المعرفة ─────────────
  const statsHost = h('div.stack-sm');
  const listHost = h('div');
  let seq = 0;
  let selects = {};

  async function refetch() {
    const my = ++seq;
    syncUrl();
    mount(listHost, loading());
    try {
      const d = await api.get('/admin/knowledge', { status: state.status, area: state.area, usage: state.usage, q: state.q });
      if (my !== seq) return;
      data = d;
      drawStats();
      drawList();
    } catch (err) {
      if (my !== seq) return;
      mount(listHost, errorState(err, refetch));
    }
  }

  function setStatus(v) {
    state.status = v;
    if (selects.status) selects.status.querySelector('select').value = v;
    refetch();
  }

  function drawStats() {
    const s = data.stats || {};
    const byArea = Array.isArray(s.by_area) ? s.by_area : [];
    mount(
      statsHost,
      h(
        'div.stats-grid.pd-stats-5',
        statCard({ label: 'إجمالي السجلات', value: num(s.total), hint: 'من الملفات المغلقة', icon: 'book', tone: 'primary', onClick: () => setStatus('') }),
        statCard({
          label: 'بانتظار المراجعة',
          value: num(s.pending_review),
          hint: s.pending_review ? 'راجع الإخفاء واعتمدها' : 'لا يوجد ما ينتظر',
          icon: 'clock',
          tone: s.pending_review ? 'warning' : 'neutral',
          onClick: () => setStatus('pending_review'),
        }),
        statCard({ label: 'معتمدة', value: num(s.approved), hint: 'متاحة كحالات مشابهة مجهّلة', icon: 'checkCircle', tone: 'success', onClick: () => setStatus('approved') }),
        statCard({ label: 'معتمدة للتدريب', value: num(s.training), hint: 'تدخل في التصدير وقياس الأداء', icon: 'sparkle', tone: 'accent' }),
        statCard({ label: 'مستبعدة', value: num(s.excluded), hint: 'لا تُستخدم إطلاقًا', icon: 'eyeOff', tone: 'muted', onClick: () => setStatus('excluded') }),
      ),
      byArea.length
        ? h(
            'div.pd-area-strip',
            h('span.cell-sub', 'المعتمد حسب المجال:'),
            chips(byArea.map((a) => ({ label: `${a.label || areaLabel(a.legal_area)}: ${num(a.n)}`, tone: 'primary' }))),
          )
        : null,
    );
  }

  function drawList() {
    const items = Array.isArray(data.items) ? data.items : [];
    const filtered = state.status || state.area || state.usage || state.q;
    if (!items.length) {
      mount(
        listHost,
        emptyState(
          filtered ? 'لا توجد سجلات مطابقة للتصفية الحالية' : 'لا توجد سجلات معرفية بعد؛ تُنشأ تلقائيًا عند إغلاق ملفات الاستشارات',
          filtered ? button('مسح التصفية', { icon: 'x', onClick: clearFilters }) : null,
          { icon: 'book' },
        ),
      );
      return;
    }
    mount(
      listHost,
      table({
        className: 'pd-table-tight',
        caption: 'سجلات المعرفة المؤسسية',
        rows: items,
        onRowClick: (r) => ctx.navigate(`/knowledge/${r.id}`),
        rowClass: (r) => r.status === 'excluded' && 'is-muted',
        columns: [
          {
            key: 'title',
            label: 'العنوان',
            className: 'col-wide',
            render: (r) => h('div.pd-cell-stack', h('a.cell-title', { href: `#/knowledge/${r.id}` }, richText(r.title)), h('span.cell-sub', r.legal_area_label || areaLabel(r.legal_area))),
          },
          { key: 'case', label: 'الملف', render: (r) => (r.case_code ? codeTag(r.case_code) : null) },
          {
            key: 'status',
            label: 'الحالة والاستخدام',
            render: (r) => h('div.pd-cell-stack', statusBadge('knowledge_status', r.status), r.status === 'approved' ? statusBadge('knowledge_usage', r.usage, { dot: false }) : null),
          },
          {
            key: 'counts',
            label: 'طلبات المساعدة / التصحيحات',
            render: (r) =>
              h(
                'div.pd-cell-stack',
                h('span.nowrap', icon('users', { size: 14 }), ` ${r.specialists_count ? count(r.specialists_count, ['طلب مساعدة واحد', 'طلبا مساعدة', 'طلبات مساعدة', 'طلب مساعدة']) : 'لا طلبات مساعدة'}`),
                h('span.nowrap', icon('sparkle', { size: 14 }), ` ${r.corrections_count ? count(r.corrections_count, ['تصحيح واحد', 'تصحيحان', 'تصحيحات', 'تصحيحًا']) : 'لا تصحيحات'} للذكاء الاصطناعي`),
              ),
          },
          { key: 'outcome', label: 'النتيجة', render: (r) => (r.outcome ? h('span', label('case_outcome', r.outcome)) : null) },
          { key: 'updated', label: 'آخر تحديث', render: (r) => h('time.nowrap', { datetime: r.updated_at, title: dateTime(r.updated_at) }, relative(r.updated_at)) },
        ],
      }),
    );
  }

  function clearFilters() {
    state.status = '';
    state.area = '';
    state.usage = '';
    state.q = '';
    for (const sel of Object.values(selects)) {
      const el = sel.querySelector('select, input');
      if (el) el.value = '';
    }
    refetch();
  }

  // البحث بالمعنى في المعرفة المعتمدة
  const searchResults = h('div.pd-search-results', { 'aria-live': 'polite' });
  const semInput = h('input.input', {
    type: 'search',
    placeholder: 'صف المشكلة بكلمات المستفيد/ة، مثل: أخي يرفض تقسيم شقة والدنا المتوفى…',
    'aria-label': 'نص البحث بالمعنى في الحالات المعتمدة',
    maxlength: 2000,
  });
  async function runSemantic() {
    const q = semInput.value.trim();
    if (q.length < 3) {
      mount(searchResults, h('p.field-error', icon('alert', { size: 14 }), h('span', 'اكتب ثلاثة أحرف على الأقل للبحث')));
      semInput.focus();
      return;
    }
    mount(searchResults, loading('جارٍ البحث في الحالات المعتمدة…'));
    try {
      const res = await api.get('/admin/knowledge/search', { q });
      const items = Array.isArray(res?.items) ? res.items : [];
      if (!items.length) {
        mount(searchResults, emptyState('لم نجد حالات معتمدة مشابهة بما يكفي. جرّب صياغة أخرى أو كلمات أكثر تحديدًا.', null, { compact: true, icon: 'search' }));
        return;
      }
      mount(
        searchResults,
        h('p.cell-sub', `عدد النتائج المشابهة: ${num(res.total ?? items.length)}${res.total > items.length ? ` (يُعرض أعلى ${num(items.length)})` : ''}`),
        h(
          'ol.pd-sem-list',
          items.map((it) =>
            h(
              'li.pd-sem-item',
              h(
                'div.pd-sem-head',
                h('span.pd-score', { title: 'درجة التشابه مع نص البحث' }, h('bdi', { dir: 'ltr' }, percent(it.score)), ' تشابه'),
                h('a.cell-title', { href: `#/knowledge/${it.id}` }, richText(it.title)),
                h('span.cell-sub', areaLabel(it.legal_area)),
              ),
              it.issues && it.issues.length ? chips(it.issues.slice(0, 4), { className: 'pd-spec-chips' }) : null,
              it.key_points && h('p.pd-sem-points', richText(it.key_points)),
            ),
          ),
        ),
      );
    } catch (err) {
      mount(searchResults, errorState(err, runSemantic));
    }
  }
  semInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSemantic();
    }
  });

  function kbPanel() {
    selects = {
      q: searchInput({
        placeholder: 'ابحث في العناوين والوقائع والإجابات…',
        label: 'بحث نصي في سجلات المعرفة',
        value: state.q,
        onSearch: (q) => {
          state.q = q;
          refetch();
        },
      }),
      status: selectInput({
        label: 'حالة المراجعة',
        allLabel: 'كل الحالات',
        value: state.status,
        options: options('knowledge_status'),
        onChange: (v) => {
          state.status = v;
          refetch();
        },
      }),
      area: selectInput({
        label: 'المجال',
        allLabel: 'كل المجالات',
        value: state.area,
        options: areaOptions(),
        onChange: (v) => {
          state.area = v;
          refetch();
        },
      }),
      usage: selectInput({
        label: 'نطاق الاستخدام',
        allLabel: 'كل الاستخدامات',
        value: state.usage,
        options: options('knowledge_usage'),
        onChange: (v) => {
          state.usage = v;
          refetch();
        },
      }),
    };
    drawStats();
    drawList();
    return h(
      'div.stack-lg',
      statsHost,
      h(
        'section.pd-sem',
        h('h2.section-title', icon('search', { size: 18 }), 'البحث بالمعنى في المعرفة المعتمدة'),
        h('p.pd-section-hint', 'يبحث في الحالات المعتمدة فقط — وهي نفسها التي تظهر للمحامين كحالات مشابهة مجهّلة الهوية.'),
        h('div.pd-sem-bar', semInput, button('ابحث', { variant: 'primary', icon: 'search', onClick: runSemantic })),
        searchResults,
      ),
      h(
        'section.section',
        h('h2.section-title', 'سجلات المعرفة'),
        filterBar([selects.q, selects.status, selects.area, selects.usage]),
        card({ body: listHost, flush: true }),
      ),
    );
  }

  // ───────────── أداء الذكاء الاصطناعي ─────────────
  function fieldCard(f) {
    const segs = VERDICT_ORDER.filter((k) => f[k] > 0);
    const summary = VERDICT_ORDER.map((k) => `${label('ai_verdict', k)}: ${f[k] || 0}`).join('، ');
    return h(
      'article.pd-field',
      h('div.pd-field-head', h('h3', f.label || label('ai_field', f.field)), h('span.cell-sub', count(f.total, ['مراجعة واحدة', 'مراجعتان', 'مراجعات', 'مراجعة']))),
      h(
        'div.pd-field-acc',
        h('span.pd-field-pct', { dir: 'ltr' }, f.accuracy == null ? '—' : percent(f.accuracy)),
        h('span.cell-sub', 'دقة (نسبة ما قُبل كما هو)'),
      ),
      h(
        'div.pd-stack-bar',
        { role: 'img', 'aria-label': `توزيع قرارات المراجعة لـ ${f.label}: ${summary}` },
        segs.map((k) => h('span.pd-seg', { style: { flexGrow: String(f[k]), background: VERDICT_COLORS[k] }, title: `${label('ai_verdict', k)}: ${f[k]}` })),
      ),
      h(
        'ul.pd-legend-list',
        VERDICT_ORDER.map((k) =>
          h('li', { class: !f[k] && 'is-zero' }, h('span.pd-swatch', { style: { background: VERDICT_COLORS[k] }, 'aria-hidden': 'true' }), h('span', label('ai_verdict', k)), h('strong', num(f[k] || 0))),
        ),
      ),
    );
  }

  async function aiPanel() {
    // الاستهلاك وتحليلات المستندات لا تمنع عرض مؤشرات الدقة إن تعذر تحميلها
    const [m, usage, docAnalyses] = await Promise.all([
      api.get('/admin/ai/metrics'),
      api.get('/admin/ai/usage').catch((err) => ({ __error: err })),
      api.get('/admin/ai/documents', { limit: 8 }).catch(() => null),
    ]);
    const fields = Array.isArray(m.fields) ? [...m.fields].sort((a, b) => b.total - a.total) : [];
    const monthly = Array.isArray(m.monthly) ? m.monthly : [];
    const providers = Array.isArray(m.providers) ? m.providers : [];
    const recent = Array.isArray(m.recent_corrections) ? m.recent_corrections : [];
    const st = m.status || {};

    const months = [...new Set(monthly.map((r) => r.month))].sort().reverse();
    const pivotFields = [...new Set(monthly.map((r) => r.field))];
    const cell = (month, field) => monthly.find((r) => r.month === month && r.field === field);

    return h(
      'div.stack-lg',
      alertBox(
        frag(
          h('p', 'الذكاء الاصطناعي مساعد لا يقرر: يلخص ويصنف ويقترح النواقص والمسائل والحالات المشابهة والمسودات الأولى، والقرار دائمًا للإدارة والمحامي.'),
          h('p', h('strong', 'كل تصحيح من المحامي أو الإدارة تغذية راجعة جديدة: '), 'يُسجَّل القبول والتصحيح والرفض وما فات الذكاء الاصطناعي، ومنه تُقاس الدقة هنا وتُحسَّن مع الوقت.'),
        ),
        'info',
        { title: 'كيف نقيس أداء الذكاء الاصطناعي؟', icon: 'sparkle' },
      ),
      aiStatusCard(usage && !usage.__error ? usage.status : st, { isAdmin }),
      aiUsageSection(usage, { isAdmin }),
      h(
        'section.section',
        h('h2.section-title', 'الدقة حسب نوع الاقتراح'),
        fields.length ? h('div.pd-fields', fields.map(fieldCard)) : emptyState('لا توجد مراجعات مسجلة بعد لقياس الدقة', null, { icon: 'sparkle', compact: true }),
      ),
      months.length
        ? h(
            'section.section',
            h('h2.section-title', 'تطور الدقة شهريًا'),
            h('p.pd-section-hint', 'نسبة الاقتراحات المقبولة كما هي من إجمالي ما رُوجع في كل شهر.'),
            table({
              className: 'pd-table-tight',
              caption: 'الدقة الشهرية حسب نوع الاقتراح',
              rows: months,
              columns: [
                { key: 'month', label: 'الشهر', render: (mo) => h('span.cell-title.nowrap', monthLabel(mo)) },
                ...pivotFields.map((fk) => ({
                  key: fk,
                  label: label('ai_field', fk),
                  align: 'center',
                  render: (mo) => {
                    const c = cell(mo, fk);
                    if (!c || !c.total) return h('span.muted', '—');
                    const acc = c.accuracy ?? c.accepted / c.total;
                    return h(
                      'div.pd-acc-cell',
                      h('strong', { dir: 'ltr', class: acc >= 0.75 ? 'pd-text-success' : acc < 0.4 ? 'pd-text-danger' : 'pd-text-warning' }, percent(acc)),
                      h('span.cell-sub', `${num(c.accepted)} من ${num(c.total)}`),
                    );
                  },
                })),
              ],
            }),
          )
        : null,
      h(
        'div.pd-two-col',
        h(
          'section.section',
          h('h2.section-title', 'الاستخدام حسب المزود'),
          table({
            caption: 'عدد الاقتراحات حسب المزود والنوع',
            rows: providers,
            empty: 'لم تُستخدم أي اقتراحات بعد',
            columns: [
              { key: 'provider', label: 'المزود', render: (p) => PROVIDER_LABELS[p.provider] || p.provider },
              { key: 'kind', label: 'نوع الاقتراح', render: (p) => KIND_LABELS[p.kind] || p.kind },
              { key: 'n', label: 'العدد', align: 'end', render: (p) => h('strong', num(p.n)) },
            ],
          }),
        ),
        h(
          'section.section',
          h('h2.section-title', 'ملخص المراجعات'),
          table({
            caption: 'ملخص قرارات المراجعة',
            rows: VERDICT_ORDER.map((k) => ({ k, n: fields.reduce((s, f) => s + (f[k] || 0), 0) })),
            columns: [
              { key: 'k', label: 'القرار', render: (r) => statusBadge('ai_verdict', r.k) },
              { key: 'n', label: 'العدد', align: 'end', render: (r) => h('strong', num(r.n)) },
            ],
          }),
        ),
      ),
      h(
        'section.section',
        h('h2.section-title', 'أحدث التصحيحات'),
        h('p.pd-section-hint', 'كل تصحيح من المحامي أو الإدارة تغذية راجعة جديدة تدخل في قياس الأداء — وعند اعتماد الحالة تصبح جزءًا من بيانات التدريب المجهّلة.'),
        recent.length ? correctionsList(recent) : emptyState('لا توجد تصحيحات بعد', null, { icon: 'sparkle', compact: true }),
      ),
      docAnalyses ? recentDocAnalyses(docAnalyses) : null,
    );
  }

  const tabsEl = tabs(
    [
      { key: 'kb', label: 'قاعدة المعرفة', icon: 'book', count: data.stats?.pending_review || null, render: kbPanel },
      { key: 'ai', label: 'أداء الذكاء الاصطناعي', icon: 'sparkle', render: aiPanel },
    ],
    {
      active: activeTab,
      onChange: (key) => {
        activeTab = key;
        syncUrl();
      },
    },
  );

  const exportBtn = isAdmin
    ? asyncButton(
        'تصدير بيانات التدريب (JSON)',
        async () => {
          const res = await api.get('/admin/knowledge/export');
          const n = Array.isArray(res?.records) ? res.records.length : 0;
          downloadJson(res, `knowledge-training-${cairoToday()}.json`);
          toast(n ? `تم تصدير ${count(n, ['حالة معتمدة واحدة', 'حالتين معتمدتين', 'حالات معتمدة', 'حالة معتمدة'])} للتدريب (مجهّلة)` : 'لا توجد حالات معتمدة للتدريب بعد؛ صُدّر ملف فارغ', n ? 'success' : 'warning');
        },
        { icon: 'download', title: 'يصدّر الحالات المعتمدة للتدريب فقط، بعد إخفاء البيانات الشخصية' },
      )
    : null;

  return frag(
    pageHeader({
      title: 'المعرفة المؤسسية والذكاء الاصطناعي',
      subtitle: 'لا نحفظ الإجابة النهائية فقط، بل رحلة الحالة كاملة — ولا تُستخدم أي حالة إلا بعد إخفاء بياناتها الشخصية واعتمادها.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'المعرفة المؤسسية' }],
      actions: exportBtn,
    }),
    pipeline(),
    card({ body: tabsEl }),
  );
}

