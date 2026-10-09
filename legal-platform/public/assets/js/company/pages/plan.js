// الإصدار 10 — «الباقة والاستخدام» `#/plan` (U10-71 مع §8.3، CO-20، CO-26، L-62): الباقة وفترتها (والسعر والتجديد لمديري
// البوابة وجهة الفواتير فقط)، «بداية الفترة القادمة»، مقياس الطلبات المشمولة، ما تشمله الباقة (ومنه الطلبات العاجلة في كل دورة)،
// «خارج الباقة — بعرض سعر قبل أي عمل»، «الجهة المتعاقدة»، «مواعيدنا معكم» بنفس حساب الخادم (company-sla.js)، الاستخدام لكل
// دورة، و«التكاليف الإضافية المعتمدة» لمن يرى المال. أعلى الصفحة يجيب «كم تبقّى؟ وهل الدعوى مشمولة؟» بلا تمرير على الحاسوب (T10).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { money, percent } from '../../lib/fmt.js';
import { icon, table, emptyState } from '../../lib/ui.js';
import { REQUEST_TYPES, EXCLUDED_WORK } from '../../lib/company-catalog.js';
import { calendarsFromJson, durationText, hoursText, dayLength } from '../../lib/company-sla.js';
import { copy, countOf, coUsageMeter, dayText } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { S, seesMoney } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';

const P = W.plan;
const PRIORITY = { urgent: W.newRequest.urgent, high: W.newRequest.high, normal: W.newRequest.normal };

function contracting(plan) {
  const ce = plan.contracting_entity;
  if (!ce?.legal_name) return null;
  return h('p.co-contracting', icon('landmark', { size: 16 }), h('span', ce.registration ? copy('plan.contracting', { legal_name: ce.legal_name, registration: ce.registration }) : copy('plan.contracting_plain', { legal_name: ce.legal_name })));
}

function planCard(plan) {
  const p = plan.plan || {};
  const money_ = seesMoney() && p.price != null;
  const per = { monthly: P.per_monthly, quarterly: P.per_quarterly, annual: P.per_annual }[p.period] || '';
  return sectionCard(
    copy('plan.line', { name: p.name || '—', period: p.period_label || '' }),
    h(
      'div.co-plan-card',
      money_ ? h('p.co-plan-price.num', `${money(p.price)} ${per}`) : null,
      money_ && p.renews ? h('p.co-muted', p.renews === 'auto' ? P.renews_auto : P.renews_manual) : null,
      p.next_period_starts ? h('p.co-muted', copy('plan.next', { date: dayText(p.next_period_starts, { year: true }) })) : null,
      coUsageMeter(plan.quota, { showPrices: seesMoney(), hasManager: !!S.home?.account_manager }),
      contracting(plan),
    ),
    { className: 'co-plan-main' },
  );
}

function includesCard(plan) {
  const rows = [
    plan.included_requests == null ? P.unlimited : copy('plan.requests', { n: countOf(plan.included_requests, 'request') }),
    plan.urgent_per_month == null ? P.urgent_unlimited : copy('plan.urgent', { m: plan.urgent_per_month }),
    plan.max_entities != null ? copy('plan.entities', { n: countOf(plan.max_entities, 'entity') }) : null,
    plan.max_users != null ? copy('plan.users', { n: countOf(plan.max_users, 'user') }) : null,
    plan.revision_rounds != null ? copy('plan.revisions', { n: countOf(plan.revision_rounds, 'revision_round') }) : null,
    plan.senior_review && plan.senior_review !== 'never' ? plan.senior_review_label : null,
    plan.contract_value_cap ? copy('plan.value_cap', { amount: money(plan.contract_value_cap) }) : null,
  ].filter(Boolean);
  const scope = new Set(plan.scope_types || []);
  const types = REQUEST_TYPES.filter((t) => !scope.size || scope.has(t.key));
  return sectionCard(
    P.includes,
    h(
      'div',
      h('ul.co-checks', rows.map((t) => h('li', icon('check', { size: 16 }), h('span', t)))),
      h('details.co-details.co-plan-types', h('summary', P.types), h('ul.co-checks', types.map((t) => h('li', icon('check', { size: 16 }), h('span', t.company_label))))),
    ),
  );
}

function excludedCard(plan) {
  const ex = EXCLUDED_WORK.filter((w) => (plan.excluded_work || []).includes(w.key));
  if (!ex.length) return null;
  return sectionCard(P.excluded, h('ul.co-checks.is-out', ex.map((w) => h('li', icon('x', { size: 16 }), h('span', w.label)))));
}

/** اليوم السابق لتاريخ YYYY-MM-DD */
const dayBefore = (key) => (key ? new Date(Date.parse(`${key}T12:00:00Z`) - 86400000).toISOString().slice(0, 10) : key);

function slaCard(plan) {
  if (!plan.sla_table?.length || !plan.calendar) return null;
  const cals = calendarsFromJson(plan.calendar);
  const m = Number(plan.size_factor?.M) || 1;
  const order = ['urgent', 'high', 'normal'];
  const rows = [...plan.sla_table].filter((r) => order.includes(r.priority)).sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority));
  // C-03: خلايا الجدول قيم قائمة بذاتها ← صيغة الرفع («ساعتان»، «يوما عمل»)
  const fmt = (hours, clock) => (clock === 'calendar' ? `${hoursText(hours, { standalone: true })} ${copy('plan.urgent_window', { window: plan.urgent_hours_text || '' })}` : durationText(hours, cals.business, { standalone: true }));
  return sectionCard(
    P.sla,
    h(
      'div',
      table({
        caption: P.sla,
        stack: true,
        rows,
        columns: [
          { key: 'priority', label: P.col_priority, render: (r) => PRIORITY[r.priority] || r.priority },
          { key: 'first', label: P.col_first, render: (r) => h('span.num', fmt(r.first_response_hours, r.clock)) },
          { key: 'delivery', label: P.col_delivery, render: (r) => h('span.num', fmt(Math.round(Number(r.delivery_hours) * m * 10) / 10, r.clock)) },
        ],
      }),
      h('p.co-muted.co-plan-foot', copy('plan.footnote', { hours: plan.business_hours_text || '' })),
    ),
  );
}

function usageBody(u, plan) {
  const r = u.requests || {};
  const stat = (label, n) => h('div.co-stat', h('span.co-stat-num.num', String(n ?? 0)), h('span.co-stat-label', label));
  const types = Object.entries(r.by_type || {}).sort((a, b) => b[1].count - a[1].count);
  const max = Math.max(1, ...types.map(([, t]) => t.count));
  const cal = plan?.calendar ? calendarsFromJson(plan.calendar).business : null;
  const turn = u.sla?.avg_turnaround_business_hours;
  const days = turn != null && cal ? Math.max(1, Math.ceil(Number(turn) / dayLength(cal))) : null;
  const lines = [
    r.included_limit != null ? copy('plan.included_used', { used: r.included_used ?? 0, included: r.included_limit }) : null,
    r.overage ? copy('plan.overage', { n: r.overage }) : null,
    r.out_of_scope ? copy('plan.out_of_scope', { n: r.out_of_scope }) : null,
    u.sla?.delivery_met_rate != null ? copy('plan.on_time', { pct: percent(u.sla.delivery_met_rate) }) : null,
    days ? copy('plan.turnaround', { n: countOf(days, 'business_day') }) : null,
    u.satisfaction?.count ? copy('plan.rating', { avg: Math.round(Number(u.satisfaction.avg_rating) * 10) / 10, n: countOf(u.satisfaction.count, 'rating') }) : null,
  ].filter(Boolean);
  return h(
    'div.co-usage',
    h('div.co-stats', stat(P.submitted, r.submitted), stat(P.accepted, r.accepted), stat(P.delivered, r.delivered), stat(P.closed, r.closed)),
    lines.length ? h('ul.co-usage-lines', lines.map((t) => h('li', t))) : null,
    types.length
      ? h(
          'div.co-bars',
          h('p.co-card-label', P.by_type),
          types.map(([key, t]) => h('div.co-bar', { dataset: { type: key } }, h('span.co-bar-label', t.label), h('span.co-bar-track', h('span.co-bar-fill', { style: { width: `${Math.round((t.count / max) * 100)}%` } })), h('span.co-bar-num.num', String(t.count)))),
        )
      : h('p.co-muted', P.no_data),
  );
}

function usageCard(usage, plan) {
  const body = h('div', usageBody(usage, plan));
  const cycles = usage.cycles || [];
  let picker = null;
  if (cycles.length > 1) {
    const sel = h(
      'select.input',
      {
        'aria-label': P.cycle,
        onChange: async () => {
          body.setAttribute('aria-busy', 'true');
          try {
            const u = await api.get('/company/usage', { cycle: sel.value });
            mount(body, usageBody(u, plan));
          } catch {
            /* تبقى الدورة السابقة معروضة */
          } finally {
            body.removeAttribute('aria-busy');
          }
        },
      },
      // C-15: نهاية الدورة = اليوم السابق لبداية الدورة التالية («5 أكتوبر – 4 نوفمبر 2026»)
      cycles.map((c) => h('option', { value: c.start }, copy('plan.cycle_label', { from: dayText(c.start), to: dayText(dayBefore(c.end), { year: true }) }))),
    );
    sel.value = usage.cycle?.start || cycles[0].start;
    picker = h('div.select-wrap.co-mem-select', sel);
  }
  return sectionCard(P.usage, body, { actions: picker });
}

function chargesCard(ch) {
  if (!ch) return null;
  const items = ch.items || [];
  return sectionCard(
    P.charges,
    h(
      'div',
      items.length
        ? table({
            caption: P.charges,
            stack: true,
            rows: items,
            rowClass: (c) => (c.voided ? 'is-voided' : ''),
            columns: [
              { key: 'description', label: P.col_desc, render: (c) => h('span', { dir: 'auto' }, c.description || c.kind_label || '') },
              { key: 'request', label: P.col_req, render: (c) => (c.request_code ? h('a', { href: `#/requests/${encodeURIComponent(c.request_code)}` }, h('bdi', { dir: 'ltr' }, c.request_code)) : '—') },
              { key: 'cycle', label: P.col_period, render: (c) => (c.cycle ? dayText(c.cycle, { year: true }) : '—') },
              { key: 'amount', label: P.col_amount, render: (c) => h('span.num', c.amount_text || money(c.amount), c.voided ? h('span.co-muted', ` (${P.voided})`) : null) },
            ],
          })
        : emptyState(P.charges_empty, null, { icon: 'wallet', compact: true }),
      items.length ? h('p.co-muted', copy('plan.total', { amount: money(ch.total_unvoided) })) : null,
      h('p.co-muted.co-plan-foot', P.charges_foot),
    ),
  );
}

export default async function planPage(ctx) {
  let plan;
  let usage;
  let charges = null;
  try {
    [plan, usage, charges] = await Promise.all([api.get('/company/plan'), api.get('/company/usage'), seesMoney() ? api.get('/company/charges').catch(() => null) : null]);
  } catch (err) {
    return errorView(W.nav.plan, err, () => ctx.reload());
  }
  return h(
    'div.co-page.co-plan',
    pageHead(W.nav.plan, P.sub),
    h('div.co-plan-top', planCard(plan), includesCard(plan), excludedCard(plan)),
    slaCard(plan),
    usageCard(usage, plan),
    chargesCard(charges),
  );
}
