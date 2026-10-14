// تقرير الأثر — (الإصدار 9 — وحدة practice)
// للمجلس والجهات المانحة ووزارة التضامن: الأسر المخدومة، الأرامل والأبناء، نتائج الملفات، قيمة الحقوق المستردة،
// التوزيع حسب المجال والمحافظة والشهر، قيمة العمل التطوعي، زمن الاستجابة، ورضا المستفيدين. قابل للطباعة والتصدير CSV.
import { h, svg, mount } from '../../../lib/h.js';
import { api, downloadFile } from '../../../lib/api.js';
import { num, money, percent, count, hours, date, dateTime, statDuration, rating, areaOptions, governorateOptions, cairoToday, cairoDateToIso, isoToCairoDate, relative } from '../../../lib/fmt.js';
import {
  pageHeader, card, button, statCard, emptyState, loading, errorState, alertBox, form, selectInput, toast, formDialog, badge, codeTag, errorMessage, overflowCue,
} from '../../../lib/ui.js';

// ───────────── المخططات (SVG بسيط بلا مكتبات) ─────────────

/** أعمدة أفقية لسلسلة واحدة مع قيم مباشرة وتلميح عند المرور وجدول بديل */
function hbars({ caption, items, format = num, empty = 'لا توجد بيانات' }) {
  const rows = items.filter((x) => Number(x.value) > 0);
  if (!rows.length) return emptyState(empty, null, { compact: true, icon: 'chart' });
  const max = Math.max(...rows.map((x) => Number(x.value)));
  const summary = `${caption}: ${rows.map((x) => `${x.label} ${format(x.value)}`).join('، ')}`;
  return h(
    'figure.v9p-chart',
    h(
      'div.v9p-hbars',
      { role: 'img', 'aria-label': summary },
      rows.map((x) => {
        const pct = Math.max(1.5, (Number(x.value) / max) * 100);
        return h(
          'div.v9p-hbar',
          h('span.v9p-hbar-label', { title: x.label }, x.label),
          svg(
            'svg',
            { class: 'v9p-hbar-svg', width: '100%', height: 14, 'aria-hidden': 'true', focusable: 'false' },
            svg('rect', { class: 'v9p-hbar-track', x: '0', y: 5, width: '100%', height: 4, rx: 2 }),
            svg('rect', { class: 'v9p-hbar-fill', x: `${(100 - pct).toFixed(2)}%`, y: 1, width: `${pct.toFixed(2)}%`, height: 12, rx: 4 }, svg('title', `${x.label}: ${format(x.value)}`)),
          ),
          h('span.v9p-hbar-val', format(x.value)),
        );
      }),
    ),
    h('details.v9p-table-view', h('summary', 'عرض البيانات كجدول'), h('div.table-wrap', h('table.table', h('caption.sr-only', caption), h('tbody', rows.map((x) => h('tr', h('th', { scope: 'row' }, x.label), h('td.align-end', format(x.value)))))))),
  );
}

/** أعمدة رأسية شهرية (الأقدم يمينًا كما في القراءة العربية) */
function monthBars({ caption, months, key, format = num }) {
  const vals = months.map((m) => Number(m[key]) || 0);
  if (!vals.some((x) => x > 0)) return emptyState('لا توجد بيانات في هذه الفترة', null, { compact: true, icon: 'chart' });
  const max = Math.max(...vals);
  const n = months.length;
  const slot = 44;
  const W = n * slot;
  const H = 150;
  const top = 18;
  const base = H - 26;
  const barW = Math.min(22, slot - 14);
  const summary = `${caption}: ${months.map((m) => `${m.label} ${format(m[key])}`).join('، ')}`;
  // على الشاشات الضيقة يُمرَّر المخطط أفقيًا: يبدأ العرض بأحدث الأشهر (يسار المخطط) وتتلاشى الحافة التي خلفها أشهر أخرى
  return h(
    'figure.v9p-chart',
    overflowCue(h(
      'div.v9p-vbars-scroll',
      svg(
        'svg',
        { class: 'v9p-vbars', viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': summary, preserveAspectRatio: 'xMidYMax meet', style: { minWidth: `${Math.min(W, 520)}px` } },
        svg('line', { class: 'v9p-axis', x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5 }),
        months.map((m, i) => {
          const v = Number(m[key]) || 0;
          const hgt = v ? Math.max(3, ((base - top) * v) / max) : 0;
          const cx = (n - 1 - i) * slot + slot / 2;
          const short = m.label.split(' ')[0];
          return svg(
            'g',
            {},
            v
              ? svg('rect', { class: 'v9p-vbar', x: cx - barW / 2, y: base - hgt, width: barW, height: hgt, rx: 4 }, svg('title', `${m.label}: ${format(v)}`))
              : null,
            v ? svg('text', { class: 'v9p-vbar-val', x: cx, y: base - hgt - 5, 'text-anchor': 'middle' }, format(v)) : null,
            svg('text', { class: 'v9p-vbar-x', x: cx, y: H - 8, 'text-anchor': 'middle' }, short),
          );
        }),
      ),
    ), { startAtEnd: true }),
    h(
      'details.v9p-table-view',
      h('summary', 'عرض البيانات كجدول'),
      h('div.table-wrap', h('table.table', h('caption.sr-only', caption), h('tbody', months.map((m) => h('tr', h('th', { scope: 'row' }, m.label), h('td.align-end', format(m[key]))))))),
    ),
  );
}

/**
 * عدد أيام قد يكون كسريًا: الصحيح بصيغة العدد العربية («3 أيام»، «يومان»)، والكسري بالمفرد («1.7 يوم»).
 * أقل من يوم (إجابة خلال ساعات) «في اليوم نفسه» بدل «0 يوم» أو «0.3 يوم».
 */
export function days(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  if (x < 1) return 'في اليوم نفسه';
  return Number.isInteger(x) ? count(x, ['يوم واحد', 'يومان', 'أيام', 'يومًا']) : `${num(x)} يوم`;
}

// ───────────── الفترات الجاهزة ─────────────
function presetRange(key) {
  const [y, m] = cairoToday().split('-').map(Number);
  const pad = (x) => String(x).padStart(2, '0');
  const today = cairoToday();
  switch (key) {
    case 'last_12m': {
      const d = new Date(Date.UTC(y, m - 1 - 11, 1));
      return { from: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`, to: today };
    }
    case 'this_quarter': {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${pad(qm)}-01`, to: today };
    }
    case 'last_month': {
      const d = new Date(Date.UTC(y, m - 2, 1));
      const last = new Date(Date.UTC(y, m - 1, 0));
      return { from: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`, to: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}` };
    }
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'this_year':
    default:
      return { from: `${y}-01-01`, to: today };
  }
}

export default async function render(ctx) {
  const isAdmin = ctx.user && ctx.user.role === 'admin';
  const q = ctx.query || {};
  const init = presetRange(q.preset || 'this_year');
  const state = {
    from: /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : init.from,
    to: /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : init.to,
    area: q.area || '',
    governorate: q.governorate || '',
  };
  const out = h('div.v9p-impact-body', loading());

  function params() {
    return {
      from: cairoDateToIso(state.from),
      to: cairoDateToIso(state.to, true),
      area: state.area || undefined,
      governorate: state.governorate || undefined,
    };
  }
  function syncUrl() {
    const p = new URLSearchParams({ from: state.from, to: state.to });
    if (state.area) p.set('area', state.area);
    if (state.governorate) p.set('governorate', state.governorate);
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/impact?${p}`);
    } catch {
      /* لا شيء */
    }
  }

  async function load() {
    mount(out, loading('جارٍ إعداد التقرير…'));
    syncUrl();
    try {
      const r = await api.get('/admin/impact', params());
      mount(out, report(r));
    } catch (err) {
      mount(out, errorState(err, load));
    }
  }

  async function exportCsv(btn) {
    btn.disabled = true;
    try {
      // رابط تنزيل لمرة واحدة بطلب POST (الفلاتر في جسم الطلب)، ثم يُجلب الملف منه
      const filters = Object.fromEntries(Object.entries(params()).filter(([, v]) => v));
      await downloadFile('/admin/impact/export', filters, { fallbackName: `impact-${state.from}_${state.to}.csv` });
      toast('نُزّل ملف التقرير (CSV)', 'success');
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      btn.disabled = false;
    }
  }

  async function editSla(sla) {
    const res = await formDialog({
      title: 'مستوى الخدمة: مهلة أول رد',
      intro: 'المدة القصوى بين وصول طلب عبر واتساب أو الموقع وأول رد من الإدارة. عند تجاوزها يُنبَّه فريق الإدارة مرة واحدة لكل طلب.',
      fields: [
        { name: 'sla_first_response_hours', label: 'مهلة أول رد', type: 'number', required: true, min: 1, max: 168, integer: true, suffix: 'ساعة' },
        { name: 'sla_alerts_enabled', type: 'checkbox', text: 'تنبيه الإدارة عند تجاوز المهلة', full: true },
      ],
      values: { sla_first_response_hours: sla.sla_hours, sla_alerts_enabled: sla.alerts_enabled !== false },
      onSubmit: (v) => api.patch('/admin/settings', { sla_first_response_hours: v.sla_first_response_hours, sla_alerts_enabled: !!v.sla_alerts_enabled }),
    });
    if (res) {
      toast('حُفظ مستوى الخدمة', 'success');
      load();
    }
  }

  function report(r) {
    const t = r.totals;
    const b = r.beneficiaries;
    const val = r.value;
    const resp = r.response;
    const area = state.area ? areaOptions().find((a) => a.value === state.area)?.label : null;

    const printHead = h(
      'header.v9p-report-head',
      h('div.v9p-report-org', h('strong', r.org.legal_name), r.org.registration && h('span', r.org.registration), r.org.address && h('span.small', r.org.address)),
      h(
        'div.v9p-report-meta',
        h('strong', 'تقرير الأثر — برنامج الدعم القانوني'),
        h('span', `الفترة: من ${date(r.from)} إلى ${date(r.to)}`),
        (area || r.filters.governorate) && h('span', [area && `المجال: ${area}`, r.filters.governorate && `المحافظة: ${r.filters.governorate}`].filter(Boolean).join(' — ')),
        h('span.small.muted', `أُعدّ في ${dateTime(r.generated_at)}`),
      ),
    );

    const kpis = h(
      'div.stats-grid.v9p-kpis',
      statCard({ label: 'الأسر المخدومة', value: num(t.families_served), hint: `طلبات واردة: ${num(t.intakes)}`, icon: 'home', tone: 'primary' }),
      statCard({ label: 'أرامل', value: num(b.widows), hint: `أوصياء أو كفلاء أيتام: ${num(b.orphan_guardians)}`, icon: 'users', tone: 'accent' }),
      statCard({ label: 'أبناء في الأسر المخدومة', value: num(b.children), hint: b.minors ? `دون 18 سنة: ${num(b.minors)}` : 'من بطاقات المستفيدين', icon: 'user', tone: 'info' }),
      statCard({ label: 'ملفات استشارة أُغلقت', value: num(t.cases_closed), hint: `فُتح في الفترة: ${num(t.cases_opened)}`, icon: 'briefcase', tone: 'success' }),
      statCard({ label: 'القيمة السنوية للحقوق المستردة', value: money(val.annualized), hint: `دفعة واحدة ${money(val.one_time)} + شهريًا ${money(val.monthly)}`, icon: 'star', tone: 'success' }),
      statCard({ label: 'قيمة العمل التطوعي', value: money(r.volunteer.notional_value), hint: `${count(r.volunteer.consultations, 'consultation')} · ${hours(r.volunteer.hours)}`, icon: 'scale', tone: 'accent' }),
      statCard({ label: 'متوسط زمن أول رد', value: resp.first_response_avg_minutes != null ? statDuration(resp.first_response_avg_minutes * 60000) : '—', hint: resp.within_sla_rate != null ? `ضمن المهلة (${count(resp.sla_hours, 'hour')}): ${percent(resp.within_sla_rate)} — للفترة المختارة` : 'لا توجد ردود في الفترة', icon: 'clock', tone: 'info' }),
      r.satisfaction && r.satisfaction.count
        ? statCard({ label: 'رضا المستفيدين', value: rating(r.satisfaction.average, r.satisfaction.scale), hint: `من ${count(r.satisfaction.count, ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييمًا'])}`, icon: 'checkCircle', tone: 'success' })
        : null,
    );

    const valueCard = card({
      title: 'الحقوق المستردة للمستفيدين',
      subtitle: `الملفات التي سُجّل لها أثر: ${num(val.records)} — القيمة السنوية = الدفعة الواحدة + الشهري × 12`,
      icon: 'star',
      body: val.records
        ? h(
            'div.stack',
            h(
              'div.v9p-value-totals',
              h('div', h('span.small.muted', 'دفعة واحدة'), h('strong', money(val.one_time))),
              h('div', h('span.small.muted', 'شهريًا'), h('strong', money(val.monthly))),
              h('div.is-main', h('span.small.muted', 'القيمة السنوية'), h('strong', money(val.annualized))),
            ),
            hbars({ caption: 'القيمة السنوية حسب نوع الأثر', items: val.by_kind.map((k) => ({ label: `${k.label} (${num(k.count)})`, value: k.annualized })), format: money }),
          )
        : emptyState('لم يُسجَّل أثر مالي للملفات المغلقة في هذه الفترة. سجّله من بطاقة «الأثر المتحقق» في صفحة الملف.', null, { compact: true, icon: 'star' }),
    });

    const outcomesCard = card({
      title: 'الملفات المغلقة حسب النتيجة',
      icon: 'briefcase',
      body: hbars({ caption: 'الملفات المغلقة حسب النتيجة', items: r.outcomes.map((o) => ({ label: o.label, value: o.count })), empty: 'لم تُغلق ملفات في هذه الفترة' }),
    });

    const benCard = card({
      title: 'المستفيدون',
      subtitle: `من بطاقات البحث الاجتماعي: ${num(b.with_profile)} من ${count(t.families_served, ['أسرة واحدة', 'أسرتين', 'أسر', 'أسرة'])} (تحقق منها: ${num(b.verified)})`,
      icon: 'users',
      body: h(
        'div.stack',
        hbars({ caption: 'الأسر حسب صفة المستفيد', items: b.relation.map((x) => ({ label: x.label, value: x.count })), empty: 'لا توجد بطاقات مستفيدين للأسر المخدومة في هذه الفترة' }),
        b.foundation_beneficiaries ? h('p.small', `أسر مستفيدة من برامج المؤسسة الأخرى: ${num(b.foundation_beneficiaries)}`) : null,
      ),
    });

    const areaCard = card({
      title: 'حسب المجال القانوني',
      icon: 'scale',
      body: hbars({ caption: 'الأسر المخدومة حسب المجال القانوني', items: r.by_area.map((x) => ({ label: x.label, value: x.families })) }),
    });
    const govCard = card({
      title: 'حسب المحافظة',
      icon: 'mapPin',
      body: hbars({ caption: 'الأسر المخدومة حسب المحافظة', items: r.by_governorate.map((x) => ({ label: x.label, value: x.families })) }),
    });
    const monthCard = card({
      title: 'الاتجاه الشهري',
      subtitle: 'الأسر المخدومة شهريًا (من الأقدم يمينًا إلى الأحدث يسارًا)',
      icon: 'chart',
      body: h(
        'div.stack',
        monthBars({ caption: 'الأسر المخدومة شهريًا', months: r.by_month, key: 'families' }),
        r.by_month.some((m) => m.annualized) && h('h3.v9p-subhead', 'القيمة السنوية للحقوق المستردة شهريًا'),
        r.by_month.some((m) => m.annualized) && monthBars({ caption: 'القيمة السنوية للحقوق المستردة حسب شهر الإغلاق', months: r.by_month, key: 'annualized', format: (x) => num(Math.round(x)) }),
      ),
    });

    const volCard = card({
      title: 'المحامون المتطوعون وبرامج المسؤولية المجتمعية',
      icon: 'scale',
      body: h(
        'div.v9p-value-totals',
        h('div', h('span.small.muted', 'استشارات معتمدة'), h('strong', num(r.volunteer.consultations))),
        h('div', h('span.small.muted', 'محامون مشاركون'), h('strong', num(r.volunteer.lawyers))),
        h('div', h('span.small.muted', 'ساعات عمل'), h('strong', num(r.volunteer.hours))),
        h('div.is-main', h('span.small.muted', 'القيمة التقديرية'), h('strong', money(r.volunteer.notional_value))),
      ),
    });

    const respCard = card({
      title: 'زمن الاستجابة ومستوى الخدمة',
      icon: 'clock',
      actions: isAdmin ? button('ضبط المهلة', { size: 'sm', icon: 'settings', onClick: () => editSla(resp) }) : null,
      body: h(
        'div.stack',
        h(
          'div.v9p-value-totals',
          h('div', h('span.small.muted', 'متوسط زمن أول رد'), h('strong', resp.first_response_avg_minutes != null ? statDuration(resp.first_response_avg_minutes * 60000) : '—')),
          h('div', h('span.small.muted', `ضمن مهلة ${count(resp.sla_hours, 'hour')}`), h('strong', resp.within_sla_rate != null ? percent(resp.within_sla_rate) : '—')),
          h('div', h('span.small.muted', 'متوسط الوصول لإجابة قانونية'), h('strong', resp.answer_avg_days != null ? days(resp.answer_avg_days) : '—')),
        ),
        slaNow,
      ),
    });

    const notes = card({
      title: 'منهجية الحساب',
      icon: 'info',
      className: 'v9p-notes',
      body: h(
        'ul.v9p-how',
        h('li', 'الأسر المخدومة: كل مستفيد له طلب وارد (غير مؤرشف) أو ملف استشارة في الفترة، ويُحسب مرة واحدة مهما تعددت طلباته.'),
        h('li', 'صفة المستفيد وعدد الأبناء من بطاقات البحث الاجتماعي؛ البيانات التي ذكرها مقدمو الطلبات ولم يُتحقق منها تُحسب ضمن البطاقات وتُميَّز في ملف المستفيد/ة.'),
        h('li', 'قيمة الحقوق المستردة كما سجلتها الإدارة عند إغلاق الملفات (حكم نفقة، نصيب ميراث، معاش …). القيمة السنوية = الدفعة الواحدة + القيمة الشهرية × 12. إذا سُجّل أثر للملف المستمر الناشئ عن استشارة يُعتمد وحده ولا يُحتسب أثر الاستشارة مرة ثانية.'),
        h('li', 'قيمة العمل التطوعي: القيمة التقديرية المتفق عليها لكل استشارة اعتُمدت من محامٍ متطوع أو ضمن برنامج مسؤولية مجتمعية.'),
        h('li', 'لا يتضمن التقرير أي بيانات شخصية للمستفيدين؛ الأرقام مجمعة فقط.'),
      ),
    });

    return h(
      'div.v9p-report',
      printHead,
      kpis,
      h('div.grid-2.v9p-grid', valueCard, outcomesCard),
      h('div.grid-2.v9p-grid', benCard, volCard),
      monthCard,
      h('div.grid-2.v9p-grid', areaCard, govCard),
      respCard,
      notes,
    );
  }

  // مؤشرات اللحظة: طلبات متأخرة عن مهلة أول رد الآن (ليست ضمن فترة التقرير)
  const slaNow = h('div.v9p-sla-now', loading());
  async function loadSla() {
    try {
      const s = await api.get('/admin/sla');
      if (!s.overdue_now) {
        mount(slaNow, alertBox(`لا توجد الآن طلبات تجاوزت مهلة أول رد (${count(s.hours, 'hour')}).`, 'success', { icon: 'checkCircle' }));
        return;
      }
      mount(
        slaNow,
        h(
          'div.stack-sm',
          alertBox(`الآن: ${count(s.overdue_now, 'request')} بلا رد من الإدارة بعد تجاوز مهلة ${count(s.hours, 'hour')}.`, 'warning', { title: 'متأخرة عن مستوى الخدمة', icon: 'alert' }),
          h(
            'ul.v9p-sla-list',
            s.overdue.slice(0, 8).map((i) => h('li', h('a', { href: `#/inbox/${i.id}` }, codeTag(i.code)), h('span', i.title || i.contact_name || 'طلب بدون عنوان'), badge(`وصل ${relative(i.created_at)}`, 'warning', { icon: 'clock' }))),
          ),
        ),
      );
    } catch (err) {
      mount(slaNow, h('p.small.muted', errorMessage(err)));
    }
  }

  // ── شريط الفلاتر ──
  const filters = form(
    [
      { name: 'from', label: 'من تاريخ', type: 'date', required: true },
      { name: 'to', label: 'إلى تاريخ', type: 'date', required: true, endOfDay: true },
      { name: 'area', label: 'المجال القانوني', type: 'select', options: areaOptions(), placeholder: 'كل المجالات' },
      { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions(), placeholder: 'كل المحافظات' },
    ],
    {
      values: { from: state.from, to: state.to, area: state.area, governorate: state.governorate },
      submitLabel: 'عرض التقرير',
      submitIcon: 'chart',
      className: 'v9p-impact-filters',
      onSubmit: async (v) => {
        const from = isoToCairoDate(v.from);
        const to = isoToCairoDate(v.to);
        if (to < from) throw new Error('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
        Object.assign(state, { from, to, area: v.area || '', governorate: v.governorate || '' });
        await load();
      },
    },
  );
  const presets = selectInput({
    label: 'فترة جاهزة',
    allLabel: 'فترة جاهزة…',
    options: [
      { value: 'this_year', label: 'هذا العام' },
      { value: 'last_12m', label: 'آخر 12 شهرًا' },
      { value: 'this_quarter', label: 'الربع الحالي' },
      { value: 'last_month', label: 'الشهر الماضي' },
      { value: 'last_year', label: 'العام الماضي' },
    ],
    onChange: (val) => {
      if (!val) return;
      const r = presetRange(val);
      filters.setValues({ from: r.from, to: r.to });
      Object.assign(state, r);
      load();
    },
  });

  const exportBtn = button('تصدير CSV', { icon: 'download', onClick: (e) => exportCsv(e.currentTarget) });
  const header = pageHeader({
    title: 'تقرير الأثر',
    subtitle: 'للمجلس والجهات المانحة ووزارة التضامن الاجتماعي: من خدمنا وما الحقوق التي استُردت.',
    // v11 segment-staff (ST-5، S11-38): الأرقام كما كانت (الخيري وحده)؛ سطر للفريق على الشاشة، والمطبوع لا يتغير (INV-22)
    meta: h('p.v9p-scope-line.no-print', { dataset: { scope: 'charity' } }, 'تقرير الأثر يخص الخدمة الخيرية فقط.'),
    actions: [exportBtn, button('طباعة التقرير', { variant: 'primary', icon: 'fileText', onClick: () => window.print() })],
  });

  load();
  loadSla();
  return h('div.v9p-page.v9p-impact', header, card({ className: 'v9p-filter-card no-print', body: h('div.stack-sm', h('div.v9p-presets', presets), filters.el) }), out);
}
