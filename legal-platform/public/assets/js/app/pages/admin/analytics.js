// التسويق والتحليلات: مصدر العميل يختلف عن قناة التواصل — نقيس ماذا حدث فعلًا لكل رسالة جاءت من كل مصدر.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, num, money, percent, cairoToday, cairoDateToIso, shortDate, date } from '../../../lib/fmt.js';
import { pageHeader, card, statCard, table, field, button, emptyState, errorState, loading, alertBox, icon, badge } from '../../../lib/ui.js';
import { replaceQuery } from './lawyers.js';

const GROUPS = {
  source: { label: 'المصدر', col: 'مصدر العميل', hint: 'من أين عرفنا العميل: إعلان ممول، بحث جوجل، إحالة…' },
  channel: { label: 'القناة', col: 'قناة التواصل', hint: 'من أي باب دخل: واتساب أو الموقع أو غيرهما' },
  campaign: { label: 'الحملة', col: 'الحملة الإعلانية', hint: 'عنوان الإعلان أو اسم الحملة إن وُجد' },
};

const SERIES = [
  { key: 'intakes', label: 'طلبات واردة', color: 'var(--pd-c1)' },
  { key: 'cases', label: 'ملفات فُتحت', color: 'var(--pd-c2)' },
  { key: 'closed', label: 'ملفات أُغلقت', color: 'var(--pd-c3)' },
];

/** مبلغ لبطاقة رقمية: الرقم كبير والعملة أصغر. */
function moneyValue(n) {
  return h('span.nowrap', num(Number(n) || 0), h('span.pd-unit', ' ج.م'));
}

function isoDay(d) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : null;
}

function addDaysStr(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function groupLabel(group, item) {
  if (group === 'campaign' && (item.key === '—' || !item.key)) return 'بدون حملة محددة';
  if (group === 'source') return label('source', item.key) || item.label;
  if (group === 'channel') return label('channel', item.key) || item.label;
  return item.label || item.key;
}

/** قمع أفقي: مراحل متتالية بلون واحد وعرض نسبي للأساس. */
function funnelBars(stages, base, { compact = false } = {}) {
  const max = Math.max(base, 1);
  return h(
    'div.pd-funnel',
    { class: compact && 'is-compact' },
    stages.map((s) =>
      h(
        'div.pd-funnel-row',
        h('span.pd-funnel-label', s.label),
        h(
          'span.pd-funnel-track',
          h('span.pd-funnel-fill', { style: { width: `${s.value ? Math.max(2, (s.value / max) * 100) : 0}%` }, title: `${s.label}: ${s.value}` }),
        ),
        h(
          'span.pd-funnel-val',
          h('strong', num(s.value)),
          !compact && base ? h('bdi.cell-sub', { dir: 'ltr' }, percent(s.value / base)) : null,
        ),
      ),
    ),
  );
}

function weeklyChart(weeks) {
  const max = Math.max(1, ...weeks.flatMap((w) => SERIES.map((s) => Number(w[s.key]) || 0)));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4 / 5) * 5;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const peak = weeks.reduce((best, w, i) => ((Number(w.intakes) || 0) > (Number(weeks[best]?.intakes) || 0) ? i : best), 0);
  return h(
    'figure.pd-chart',
    h(
      'div.pd-chart-legend',
      SERIES.map((s) => h('span.pd-legend-item', h('span.pd-swatch', { style: { background: s.color }, 'aria-hidden': 'true' }), s.label)),
    ),
    h(
      'div.pd-chart-plot',
      { role: 'img', 'aria-label': 'حجم الطلبات والملفات أسبوعيًا خلال آخر 12 أسبوعًا — التفاصيل في الجدول أسفل الرسم' },
      h(
        'div.pd-chart-grid',
        { 'aria-hidden': 'true' },
        ticks.map((v) => h('div.pd-chart-gridline', { style: { bottom: `${(v / top) * 100}%` } }, h('span', num(v)))),
      ),
      h(
        'div.pd-chart-cols',
        weeks.map((w, i) => {
          const desc = `أسبوع ${shortDate(w.week_start)}: ${SERIES.map((s) => `${s.label} ${w[s.key]}`).join('، ')}`;
          return h(
            'div.pd-chart-col',
            { tabindex: '0', title: desc, 'aria-label': desc, class: [i % 2 && 'is-odd', i % 3 && 'is-third'] },
            h(
              'div.pd-chart-bars',
              SERIES.map((s) => {
                const v = Number(w[s.key]) || 0;
                return h(
                  'span.pd-chart-bar',
                  { style: { height: `${(v / top) * 100}%`, background: s.color }, class: !v && 'is-zero' },
                  i === peak && s.key === 'intakes' && v ? h('span.pd-chart-val', num(v)) : null,
                );
              }),
            ),
            h('span.pd-chart-x', shortDate(w.week_start)),
          );
        }),
      ),
    ),
    h('figcaption.cell-sub', 'كل عمود أسبوع، الأحدث على اليسار. مرّر المؤشر أو انتقل بلوحة المفاتيح على أي أسبوع لعرض أرقامه.'),
    h(
      'details.pd-details.pd-table-toggle',
      h('summary', h('span', 'عرض البيانات كجدول')),
      table({
        caption: 'الحجم الأسبوعي',
        rows: [...weeks].reverse(),
        columns: [
          { key: 'week_start', label: 'الأسبوع الذي يبدأ في', render: (w) => date(w.week_start) },
          ...SERIES.map((s) => ({ key: s.key, label: s.label, align: 'center', render: (w) => num(w[s.key]) })),
        ],
      }),
    ),
  );
}

export default async function render(ctx) {
  const today = cairoToday();
  const state = {
    group: GROUPS[ctx.query.group] ? ctx.query.group : 'source',
    from: isoDay(ctx.query.from) || addDaysStr(today, -90),
    to: isoDay(ctx.query.to) || today,
  };
  const [initialFunnel, areas] = await Promise.all([
    api.get('/admin/analytics/funnel', { group: state.group, from: cairoDateToIso(state.from), to: cairoDateToIso(state.to, true) }),
    api.get('/admin/analytics/areas'),
  ]);

  const funnelHost = h('div.stack-lg');
  const rangeError = h('p.field-error', { hidden: true, role: 'alert' });
  let seq = 0;

  function syncUrl() {
    const defaults = state.from === addDaysStr(today, -90) && state.to === today;
    replaceQuery('/analytics', { group: state.group === 'source' ? '' : state.group, from: defaults ? '' : state.from, to: defaults ? '' : state.to });
  }

  async function refetch() {
    if (state.from > state.to) {
      rangeError.replaceChildren(icon('alert', { size: 14 }), h('span', 'تاريخ البداية يجب أن يسبق تاريخ النهاية'));
      rangeError.hidden = false;
      return;
    }
    rangeError.hidden = true;
    const my = ++seq;
    syncUrl();
    mount(funnelHost, loading());
    try {
      const d = await api.get('/admin/analytics/funnel', { group: state.group, from: cairoDateToIso(state.from), to: cairoDateToIso(state.to, true) });
      if (my !== seq) return;
      drawFunnel(d);
    } catch (err) {
      if (my !== seq) return;
      mount(funnelHost, errorState(err, refetch));
    }
  }

  function drawFunnel(d) {
    const t = d.totals || {};
    const items = Array.isArray(d.items) ? d.items : [];
    const g = GROUPS[state.group];
    const conv = t.intakes ? t.cases / t.intakes : 0;
    if (!t.intakes) {
      mount(funnelHost, card({ body: emptyState('لا توجد طلبات واردة في الفترة المختارة', button('آخر 90 يومًا', { icon: 'calendar', onClick: resetRange }), { icon: 'chart' }) }));
      return;
    }
    const maxIntakes = Math.max(1, ...items.map((x) => x.intakes));
    mount(
      funnelHost,
      h(
        'div.stats-grid.pd-stats-5',
        statCard({ label: 'رسائل واردة', value: num(t.messages), hint: 'من العملاء عبر كل القنوات', icon: 'message', tone: 'primary' }),
        statCard({ label: 'طلبات واردة', value: num(t.intakes), hint: 'محادثات أو نماذج مستقلة', icon: 'inbox', tone: 'info' }),
        statCard({ label: 'استشارات قانونية', value: num(t.consultations), hint: 'طلبات تحتاج رأيًا قانونيًا', icon: 'scale', tone: 'accent' }),
        statCard({ label: 'عولجت داخليًا', value: num(t.handled_internally), hint: 'دون فتح ملف', icon: 'checkCircle', tone: 'success' }),
        statCard({ label: 'تحولت إلى ملفات', value: num(t.cases), hint: h('span', 'معدل التحويل ', h('bdi', { dir: 'ltr' }, percent(conv))), icon: 'briefcase', tone: 'primary' }),
        statCard({ label: 'احتاجت محاميًا', value: num(t.needed_lawyer), hint: 'أُسندت لمحامٍ واحد على الأقل', icon: 'user', tone: 'info' }),
        statCard({ label: 'فريق متعدد التخصصات', value: num(t.multi_lawyer), hint: 'أكثر من محامٍ في الملف', icon: 'users', tone: 'accent' }),
        statCard({ label: 'ملفات عمل مستمرة', value: num(t.matters), hint: 'تمثيل قضائي أو عمل مستمر', icon: 'gavel', tone: 'warning' }),
        statCard({ label: 'ملفات أُغلقت', value: num(t.closed), hint: 'من ملفات هذه الفترة', icon: 'flag', tone: 'neutral' }),
        statCard({ label: 'تكلفة الملفات', value: moneyValue(t.cost), hint: t.cases ? `متوسط ${money(Math.round(t.cost / t.cases))} للملف` : 'أتعاب ومصروفات', icon: 'wallet', tone: 'primary' }),
      ),
      card({
        title: 'ماذا حدث للطلبات الواردة؟',
        subtitle: `من ${date(cairoDateToIso(state.from))} إلى ${date(cairoDateToIso(state.to))} — النسبة من إجمالي الطلبات`,
        icon: 'filter',
        body: funnelBars(
          [
            { label: 'طلبات واردة', value: t.intakes },
            { label: 'استشارات قانونية', value: t.consultations },
            { label: 'تحولت إلى ملفات', value: t.cases },
            { label: 'احتاجت محاميًا', value: t.needed_lawyer },
            { label: 'فريق متعدد التخصصات', value: t.multi_lawyer },
            { label: 'ملفات عمل مستمرة', value: t.matters },
          ],
          t.intakes,
        ),
      }),
      card({
        title: `النتائج حسب ${g.label}`,
        subtitle: g.hint,
        icon: 'chart',
        flush: true,
        body: table({
          className: 'pd-table-tight',
          caption: `قمع التحويل حسب ${g.label}`,
          rows: items,
          columns: [
            {
              key: 'label',
              label: g.col,
              className: 'pd-col-group',
              render: (x) =>
                h(
                  'div.pd-cell-stack',
                  h('span.cell-title', { dir: 'auto' }, groupLabel(state.group, x)),
                  h('div.pd-mini-bar', h('span', { style: { width: `${(x.intakes / maxIntakes) * 100}%` } })),
                ),
            },
            {
              key: 'volume',
              label: 'الحجم',
              render: (x) => h('div.pd-cell-stack', h('span.nowrap', h('strong', num(x.intakes)), ' طلب'), h('span.cell-sub.nowrap', `${num(x.messages)} رسالة واردة`)),
            },
            {
              key: 'funnel',
              label: 'مسار الطلبات',
              className: 'pd-col-funnel',
              render: (x) =>
                funnelBars(
                  [
                    { label: 'استشارات', value: x.consultations },
                    { label: 'ملفات', value: x.cases },
                    { label: 'احتاجت محاميًا', value: x.needed_lawyer },
                    { label: 'مستمرة', value: x.matters },
                  ],
                  x.intakes,
                  { compact: true },
                ),
            },
            {
              key: 'other',
              label: 'نتائج أخرى',
              render: (x) =>
                h(
                  'ul.pd-mini-list',
                  h('li', 'عولجت داخليًا: ', h('strong', num(x.handled_internally))),
                  h('li', 'فريق متعدد: ', h('strong', num(x.multi_lawyer))),
                  h('li', 'أُغلقت: ', h('strong', num(x.closed))),
                ),
            },
            {
              key: 'conv',
              label: 'التحويل إلى ملف',
              align: 'center',
              render: (x) =>
                h(
                  'strong.pd-conv',
                  { dir: 'ltr', class: x.conversion_rate >= 0.66 ? 'pd-text-success' : x.conversion_rate < 0.34 ? 'pd-text-warning' : null },
                  percent(x.conversion_rate),
                ),
            },
            {
              key: 'cost',
              label: 'التكلفة',
              align: 'end',
              render: (x) =>
                h(
                  'div.pd-cell-stack.pd-align-end',
                  h('strong.nowrap', money(x.cost)),
                  h('span.cell-sub.nowrap', x.cost_per_case == null ? 'لا ملفات' : `${money(Math.round(x.cost_per_case))} للملف`),
                ),
            },
          ],
        }),
      }),
      h(
        'p.pd-footnote',
        'التكلفة هنا تكلفة خدمة الملفات الناتجة (أتعاب المحامين المباشرة والحصص التقديرية من الاتفاقات الشهرية والباقات ومصروفات المؤسسة)، وليست تكلفة الإعلان نفسه.',
      ),
    );
  }

  function resetRange() {
    state.from = addDaysStr(today, -90);
    state.to = today;
    fromInput.value = state.from;
    toInput.value = state.to;
    refetch();
  }

  // ── عناصر التحكم ──
  const segBtns = {};
  const segmented = h(
    'div.segmented',
    { role: 'group', 'aria-label': 'تجميع النتائج حسب' },
    Object.entries(GROUPS).map(([k, g]) => {
      segBtns[k] = h(
        'button.seg',
        {
          type: 'button',
          'aria-pressed': String(state.group === k),
          onClick: () => {
            if (state.group === k) return;
            state.group = k;
            for (const [kk, b] of Object.entries(segBtns)) b.setAttribute('aria-pressed', String(kk === k));
            refetch();
          },
        },
        `حسب ${g.label}`,
      );
      return segBtns[k];
    }),
  );
  const fromInput = h('input.input', { type: 'date', dir: 'ltr', value: state.from, max: today });
  const toInput = h('input.input', { type: 'date', dir: 'ltr', value: state.to, max: today });
  fromInput.addEventListener('change', () => {
    if (!fromInput.value) return;
    state.from = fromInput.value;
    refetch();
  });
  toInput.addEventListener('change', () => {
    if (!toInput.value) return;
    state.to = toInput.value;
    refetch();
  });
  const controls = h(
    'div.filter-bar.pd-analytics-controls',
    { role: 'search' },
    h('div.pd-control', h('span.field-label', 'تجميع حسب'), segmented),
    field('من تاريخ', fromInput, { className: 'pd-date-field' }),
    field('إلى تاريخ', toInput, { className: 'pd-date-field' }),
    h('div.pd-control.pd-control-end', button('آخر 90 يومًا', { variant: 'ghost', icon: 'refresh', onClick: resetRange })),
    rangeError,
  );

  drawFunnel(initialFunnel);

  // ── حسب المجال والحجم الأسبوعي ──
  const areaItems = Array.isArray(areas.items) ? areas.items : [];
  const weekly = Array.isArray(areas.weekly) ? areas.weekly : [];
  const maxCases = Math.max(1, ...areaItems.map((a) => a.cases));
  const topMulti = [...areaItems].filter((a) => a.multi).sort((a, b) => b.multi / b.cases - a.multi / a.cases)[0];

  const areasCard = card({
    title: 'الملفات حسب المجال القانوني',
    subtitle: 'كل الملفات منذ البداية — أيها يحتاج أكثر من تخصص ويتحول إلى عمل مستمر',
    icon: 'scale',
    body: h(
      'div.stack',
      topMulti ? alertBox(`أكثر المجالات احتياجًا لفريق متعدد التخصصات: ${topMulti.label || areaLabel(topMulti.legal_area)} (${num(topMulti.multi)} من ${num(topMulti.cases)} ملفات).`, 'info', { icon: 'users' }) : null,
      table({
        className: 'pd-table-tight',
        caption: 'الملفات حسب المجال',
        rows: areaItems,
        empty: 'لا توجد ملفات بعد',
        columns: [
          { key: 'area', label: 'المجال', render: (a) => h('span.cell-title', a.label || areaLabel(a.legal_area)) },
          {
            key: 'cases',
            label: 'الملفات',
            className: 'pd-col-bar',
            render: (a) => h('div.pd-hbar', h('div.pd-hbar-track', h('div.pd-hbar-fill', { style: { width: `${(a.cases / maxCases) * 100}%` } })), h('span.pd-hbar-val', num(a.cases))),
          },
          { key: 'closed', label: 'مغلقة', align: 'center', render: (a) => num(a.closed) },
          {
            key: 'multi',
            label: 'متعددة التخصصات',
            render: (a) =>
              h('span.nowrap', num(a.multi), ' ', h('bdi.cell-sub', { dir: 'ltr' }, `(${percent(a.cases ? a.multi / a.cases : 0)})`), a.multi && a.multi / a.cases >= 0.5 ? [' ', badge('مرتفع', 'accent')] : null),
          },
          { key: 'matters', label: 'تحولت لعمل مستمر', align: 'center', render: (a) => num(a.matters) },
        ],
      }),
    ),
  });

  const weeklyCard = card({
    title: 'الحجم الأسبوعي — آخر 12 أسبوعًا',
    subtitle: 'لمتابعة أثر الحملات على الطلبات وما يتحول منها إلى ملفات',
    icon: 'calendar',
    body: weekly.length ? weeklyChart(weekly) : emptyState('لا توجد بيانات أسبوعية بعد', null, { icon: 'chart', compact: true }),
  });

  return frag(
    pageHeader({
      title: 'التسويق والتحليلات',
      subtitle: 'مصدر العميل يختلف عن قناة التواصل: نقيس ماذا حدث فعلًا لكل رسالة جاءت من كل مصدر — كم صار استشارة، وكم احتاج محاميًا، وكم صار ملفًا، وكم كلّف.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'التسويق والتحليلات' }],
    }),
    controls,
    funnelHost,
    weeklyCard,
    areasCard,
  );
}
