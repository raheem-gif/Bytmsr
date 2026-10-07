// بوابة المحامي — «مستحقاتي» (الإصدار 9.1 — مسار l-court، L-09): كم لي هذا الشهر، ومتى.
// الترتيب على الهاتف: هذا الشهر ← لم يُصرف بعد (وموعد الصرف وآخر دفعة) ← الأشهر السابقة ← اتفاقك ← أدائي ← طباعة الكشف.
// بلا جداول عريضة ولا مصطلحات محاسبية. الأرقام للاطلاع فقط ولا تُعدَّل من البوابة.

import { h } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, money, date, percent, monthLabel, hours, num } from '../../../lib/fmt.js';
import { card, errorState, icon, codeTag } from '../../../lib/ui.js';
import { bidiText } from './matters.js';
import { printButton } from '../../components/print-button.js';
import { count } from '../../words.js';

const STATUS_WORD = { paid: 'صُرف', unpaid: 'لم يُصرف', partial: 'صُرف جزئيًا' };
const STATUS_TONE = { paid: 'is-paid', unpaid: 'is-unpaid', partial: 'is-partial' };
const VOLUNTEER = ['pro_bono', 'csr'];
const MONTHLY = ['monthly', 'monthly_quota'];
const APPROVED = ['استشارة معتمدة واحدة', 'استشارتان معتمدتان', 'استشارات معتمدة', 'استشارة معتمدة'];

/** سطر «تسمية — مبلغ» مع ملاحظة اختيارية */
function moneyLine(labelNode, amount, note, { muted = false } = {}) {
  return h(
    'li.lc-line',
    { class: muted && 'is-muted' },
    h('span.lc-line-label', labelNode),
    h('span.lc-line-amount', money(amount)),
    note ? h('span.lc-line-note', note) : null,
  );
}

const codes = (l) => [l.matter_code && codeTag(l.matter_code), !l.matter_code && l.case_code && codeTag(l.case_code)].filter(Boolean);

/** متوسط زمن تقديم الرأي: «25 ساعة» أو «يومان» */
function responseTime(hrs) {
  if (hrs == null) return '—';
  const n = Number(hrs);
  if (n >= 48) return count(Math.round(n / 24), ['يوم واحد', 'يومان', 'أيام', 'يومًا']);
  return hours(Math.round(n));
}

export default async function render(ctx) {
  ctx.setTitle('مستحقاتي');
  let s;
  try {
    s = await api.get('/lawyer/statement');
  } catch (err) {
    return h('div.lc-page', h('h1.page-title', 'مستحقاتي'), card({ body: errorState(err, () => ctx.reload()) }));
  }
  const ag = s.agreement || {};
  const tm = s.this_month || { period: null, lines: [], expected_total: 0 };
  const volunteer = VOLUNTEER.includes(ag.type);
  const monthly = MONTHLY.includes(ag.type);
  const months = Array.isArray(s.months) ? s.months : [];
  const pastMonths = months.filter((m) => m.period !== tm.period);
  const unpaid = s.unpaid || { total: s.unpaid_balance || 0, periods: [] };

  // ── 1) هذا الشهر ──
  let hero;
  if (volunteer) {
    const v = tm.volunteer || { count: 0, notional: 0 };
    hero = h(
      'section.lc-hero.is-volunteer',
      { 'aria-labelledby': 'lc-hero-title' },
      h('h2#lc-hero-title.lc-hero-period', monthLabel(tm.period)),
      h('p.lc-hero-label', 'مساهماتك التطوعية هذا الشهر'),
      h('p.lc-hero-figure', num(v.count || 0)),
      h('p.lc-hero-sub', Number(v.notional) > 0 ? `قيمتها التقديرية ${money(v.notional)} — لقياس الأثر فقط.` : 'تُسجَّل قيمتها التقديرية لقياس الأثر فقط ولا تُصرف.'),
      tm.lines && tm.lines.length ? h('ul.lc-lines', tm.lines.map((l) => moneyLine(l.label, l.amount))) : null,
      h('p.lc-hero-thanks', icon('star', { size: 16 }), 'شكرًا لك على وقتك وعلمك.'),
    );
  } else {
    const lines = (tm.lines || []).map((l) => {
      if (l.key === 'consultations') {
        const n = Number(l.count) || 0;
        return moneyLine(n ? `${count(n, APPROVED)} هذا الشهر` : 'لا استشارات معتمدة هذا الشهر بعد', l.amount);
      }
      return moneyLine(l.label, l.amount, l.state === 'expected' ? l.note || 'يُسجَّل عند إقفال الشهر' : null, { muted: l.state === 'expected' ? false : Number(l.amount) === 0 });
    });
    hero = h(
      'section.lc-hero',
      { 'aria-labelledby': 'lc-hero-title' },
      h('h2#lc-hero-title.lc-hero-period', monthLabel(tm.period)),
      h('p.lc-hero-figure', money(tm.expected_total)),
      h('p.lc-hero-label', 'المتوقع لك هذا الشهر'),
      lines.length ? h('ul.lc-lines', lines) : null,
      tm.quota ? h('p.lc-hero-sub', `الحصة الشهرية: ${num(tm.quota.used)} من ${count(tm.quota.included, ['استشارة واحدة', 'استشارتين', 'استشارات', 'استشارة'])}`) : null,
      tm.package && tm.package.size ? h('p.lc-hero-sub', `المتبقي من الباقة: ${num(tm.package.remaining ?? 0)} من ${num(tm.package.size)}`) : null,
    );
  }

  // ── 2) لم يُصرف بعد ──
  const lp = s.last_payout;
  const showUnpaid = !volunteer || Number(unpaid.total) > 0;
  const unpaidCard = showUnpaid
    ? h(
        'section.lc-money-card',
        { 'aria-labelledby': 'lc-unpaid-title' },
        h('h2#lc-unpaid-title.lc-card-title', 'لم يُصرف بعد'),
        h('p.lc-money-figure', money(unpaid.total)),
        unpaid.periods && unpaid.periods.length ? h('p.lc-money-for', `عن: ${unpaid.periods.map(monthLabel).join('، ')}`) : h('p.lc-money-for', 'لا مبالغ بانتظار الصرف.'),
        h(
          'ul.lc-facts',
          h('li', icon('calendar', { size: 16 }), s.payout_note ? h('span', 'موعد الصرف المعتاد: ', h('strong', s.payout_note)) : h('span', 'تحدد الإدارة موعد الصرف. للاستفسار تواصل معها.')),
          h('li', icon('checkCircle', { size: 16 }), lp ? h('span', `آخر دفعة: ${date(lp.paid_at)} — `, h('strong', money(lp.amount))) : h('span', 'لم تُصرف لك دفعات بعد.')),
        ),
      )
    : null;

  // ── 3) الأشهر السابقة ──
  const monthsBlock = pastMonths.length
    ? h(
        'section.lc-months',
        h('h2.lc-card-title', 'الأشهر السابقة'),
        h(
          'ul.lc-month-list',
          pastMonths.map((m) =>
            h(
              'li',
              h(
                'details.lc-month',
                h(
                  'summary',
                  h('span.lc-month-name', monthLabel(m.period)),
                  h('span.lc-month-total', money(m.total)),
                  h('span.lc-month-status', { class: STATUS_TONE[m.status] }, STATUS_WORD[m.status] || ''),
                  icon('chevronDown', { size: 18, className: 'lc-chev' }),
                ),
                h(
                  'ul.lc-lines',
                  m.lines.map((l) => moneyLine([l.label, ...codes(l).map((c) => [' ', c])], l.amount, l.note ? bidiText(l.note) : l.status === 'paid' ? 'صُرف' : null)),
                ),
              ),
            ),
          ),
        ),
      )
    : null;

  // ── 4) اتفاقك ──
  const agreementBlock = h(
    'details.lc-details.lc-agreement',
    h('summary', h('span.lc-agree-title', 'اتفاقك'), h('span.lc-agree-text', bidiText(s.agreement_text || label('agreement_type', ag.type))), h('span.lc-agree-more', 'التفاصيل'), icon('chevronDown', { size: 18, className: 'lc-chev' })),
    h(
      'div.lc-details-body',
      h(
        'dl.lc-dl',
        h('div', h('dt', 'نوع الاتفاق'), h('dd', label('agreement_type', ag.type))),
        // «متى يُسجَّل» لا معنى له في الاتفاق الشهري الثابت
        !monthly && !volunteer && ag.billable_event ? h('div', h('dt', 'متى تُحسب الاستشارة'), h('dd', label('billable_trigger', ag.billable_event))) : null,
        ag.type === 'package' && ag.package_size ? h('div', h('dt', 'حجم الباقة'), h('dd', count(ag.package_size, ['استشارة واحدة', 'استشارتان', 'استشارات', 'استشارة']))) : null,
      ),
      h(
        'p.lc-muted-line',
        monthly
          ? 'المبلغ الشهري يُسجَّل لك عند إقفال كل شهر، وما يزيد عليه من أتعاب يظهر في سطر «أتعاب إضافية».'
          : volunteer
            ? 'مساهماتك تطوعية؛ تُسجَّل قيمتها التقديرية لقياس الأثر في تقارير المؤسسة فقط.'
            : 'كل استشارة تعتمدها الإدارة تُسجَّل لك بالمبلغ المتفق عليه.',
      ),
    ),
  );

  // ── 5) أدائي ──
  const p = s.performance;
  const perfBlock = p
    ? h(
        'details.lc-details.lc-perf',
        h('summary', h('span', 'أدائي'), icon('chevronDown', { size: 18, className: 'lc-chev' })),
        h(
          'div.lc-details-body',
          h(
            'dl.lc-dl',
            h('div', h('dt', 'متوسط زمن تقديم الرأي'), h('dd', responseTime(p.avg_response_hours))),
            h('div', h('dt', 'آراء معتمدة هذا الشهر'), h('dd', num(p.approved_this_month || 0))),
            h('div', h('dt', 'نسبة الإعادة للتعديل'), h('dd', p.returned_rate == null ? '—' : percent(p.returned_rate))),
          ),
        ),
      )
    : null;

  // ── 6) طباعة الكشف ──
  const printRow = ctx.user ? h('div.lc-print-row', printButton({ kind: 'statement', id: ctx.user.id, label: 'طباعة الكشف', size: 'md', variant: 'ghost' })) : null;

  return h(
    'div.lc-page.lc-statement',
    h('header.lc-head', h('h1.page-title.lc-title', 'مستحقاتي')),
    h('div.lc-statement-grid', hero, unpaidCard),
    monthsBlock,
    agreementBlock,
    perfBlock,
    printRow,
  );
}
