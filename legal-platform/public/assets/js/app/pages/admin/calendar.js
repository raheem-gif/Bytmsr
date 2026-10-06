// التقويم — (الإصدار 9 — وحدة practice)
// عرض شهري وجدول مواعيد للجلسات والمواعيد الإجرائية ومواعيد تسليم الإسنادات واستحقاق الفواتير،
// مع رابط اشتراك ICS لتقويم الهاتف. نفس الوحدة تخدم «تقويمي» في بوابة المحامي (ملفاته فقط، بلا فواتير).
import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, time, date, dayLabel, relative, money, count, isoToCairoDate, cairoDateToIso, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader, card, button, asyncButton, badge, statusBadge, icon, codeTag, emptyState, loading, errorState, alertBox, modal,
  selectInput, toast, copyButton, confirmDanger, tabs, uid,
} from '../../../lib/ui.js';

const TYPE_ICON = { event: 'gavel', task: 'check', assignment: 'briefcase', invoice: 'wallet' };
const TYPE_SHORT = { event: 'جلسة / موعد', task: 'موعد إجرائي', assignment: 'تسليم إسناد', invoice: 'فاتورة' };
// ملخص الشهر بصيغة «التسمية: العدد» (بالجمع) حتى لا يأتي الرقم بعد اسم مفرد («تسليم إسناد 5»)
const TYPE_PLURAL = { event: 'الجلسات والمواعيد', task: 'المواعيد الإجرائية', assignment: 'تسليم الإسنادات', invoice: 'استحقاق الفواتير' };
const WEEKDAYS = [
  ['السبت', 'سبت'], ['الأحد', 'أحد'], ['الاثنين', 'اثنين'], ['الثلاثاء', 'ثلاثاء'], ['الأربعاء', 'أربعاء'], ['الخميس', 'خميس'], ['الجمعة', 'جمعة'],
];
const MONTH_FMT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FMT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const pad = (n) => String(n).padStart(2, '0');
function parseMonth(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(s || '');
  if (m && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] };
  const t = cairoToday().split('-').map(Number);
  return { y: t[0], m: t[1] };
}
const monthKey = ({ y, m }) => `${y}-${pad(m)}`;
const shiftMonth = ({ y, m }, d) => {
  const n = y * 12 + (m - 1) + d;
  return { y: Math.floor(n / 12), m: (n % 12) + 1 };
};
const dayKeyOf = (utcMs) => {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const keyToUtc = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** شبكة الشهر: تبدأ الأسابيع يوم السبت كما في التقويم المصري */
function monthGrid({ y, m }) {
  const first = Date.UTC(y, m - 1, 1);
  const idx = (new Date(first).getUTCDay() + 1) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((idx + days) / 7);
  const start = first - idx * 86400000;
  const cells = Array.from({ length: weeks * 7 }, (_, i) => dayKeyOf(start + i * 86400000));
  return { cells, from: cells[0], toExclusive: dayKeyOf(start + weeks * 7 * 86400000) };
}

function itemLabel(it) {
  if (it.type === 'event') return label('event_kind', it.kind);
  if (it.type === 'task') return it.kind === 'procedural' ? 'موعد إجرائي' : 'مهمة';
  return TYPE_SHORT[it.type];
}

/** نص مختصر لشريحة اليوم في العرض الشهري */
function chipText(it) {
  if (it.type === 'assignment') {
    const who = it.lawyer?.name ? it.lawyer.name.replace(/^(أ\.|د\.|م\.)\s*/, '') : null;
    return who ? `تسليم: ${who}` : `تسليم: ${it.ref?.code || ''}`;
  }
  if (it.type === 'invoice') return `فاتورة ${it.ref?.code || ''}`.trim();
  return it.title;
}

function statusOf(it) {
  if (it.type === 'event') return statusBadge('event_status', it.status);
  if (it.type === 'task') return statusBadge('task_status', it.status);
  if (it.type === 'assignment') return statusBadge('assignment_status', it.status);
  if (it.type === 'invoice') return statusBadge('invoice_status', it.status);
  return null;
}

function itemRow(it, { showDate = false, isLawyer = false } = {}) {
  const when = it.all_day ? 'طوال اليوم' : time(it.starts_at);
  return h(
    'li.v9p-cal-item',
    { class: [`v9p-t-${it.type}`, it.overdue && 'is-overdue', ['done', 'cancelled'].includes(it.status) && 'is-done'] },
    h('span.v9p-cal-bar', { 'aria-hidden': 'true' }),
    h('div.v9p-cal-when', showDate && h('span.v9p-cal-date', date(it.starts_at)), h('span', when)),
    h(
      'div.v9p-cal-main',
      h(
        'div.v9p-cal-title',
        h('span.v9p-cal-type', icon(TYPE_ICON[it.type], { size: 14 }), itemLabel(it)),
        it.link ? h('a', { href: it.link }, it.title) : h('span', it.title),
      ),
      h(
        'div.v9p-cal-meta',
        it.ref?.code && codeTag(it.ref.code),
        statusOf(it),
        it.overdue && badge('متأخر', 'danger', { icon: 'clock' }),
        it.client_attendance_required && badge(isLawyer ? 'يلزم حضور صاحب الشأن' : 'يلزم حضور المستفيد/ة', 'warning', { icon: 'user' }),
        it.location && h('span.v9p-cal-loc', icon('mapPin', { size: 13 }), it.location),
        !isLawyer && it.lawyer?.name && h('span.v9p-cal-loc', icon('scale', { size: 13 }), it.lawyer.name),
        it.amount != null && h('span.nowrap', `المتبقي: ${money(it.amount)}`),
      ),
    ),
  );
}

/** نافذة «اشترك في تقويم هاتفك» */
export async function openSubscribeDialog() {
  const body = h('div.v9p-sub', loading());
  modal({ title: 'اشترك في تقويم هاتفك', size: 'lg', body, actions: [{ label: 'إغلاق', variant: 'ghost' }] });
  let status;
  try {
    status = await api.get('/calendar/feed');
  } catch (err) {
    mount(body, errorState(err));
    return;
  }

  function instructions(url) {
    const steps = (list) => h('ol.v9p-steps', list.map((s) => h('li', s)));
    return tabs(
      [
        {
          key: 'iphone',
          label: 'آيفون',
          render: () =>
            h(
              'div.stack-sm',
              steps([
                'انسخ رابط الاشتراك أعلاه.',
                'افتح «الإعدادات» ← «التقويم» ← «الحسابات» ← «إضافة حساب» ← «آخر».',
                'اختر «إضافة تقويم مشترك» والصق الرابط ثم «التالي» و«حفظ».',
                'أو اضغط زر «فتح في تطبيق التقويم» مباشرة من الآيفون.',
              ]),
            ),
        },
        {
          key: 'google',
          label: 'تقويم Google / أندرويد',
          render: () =>
            h(
              'div.stack-sm',
              steps([
                'من متصفح الحاسوب افتح calendar.google.com وسجّل الدخول بحسابك.',
                'بجوار «تقويمات أخرى» اضغط «+» ثم «من عنوان URL».',
                'الصق رابط الاشتراك واضغط «إضافة تقويم».',
                'يظهر التقويم على هاتف أندرويد تلقائيًا بعد المزامنة (قد يستغرق التحديث عدة ساعات حسب Google).',
              ]),
              h('p.small.muted', 'يتطلب تقويم Google أن تكون المنصة منشورة على رابط عام يبدأ بـ https.'),
            ),
        },
        {
          key: 'outlook',
          label: 'Outlook',
          render: () => h('div.stack-sm', steps(['من Outlook على الويب: «إضافة تقويم» ← «الاشتراك من الويب».', 'الصق الرابط واختر اسمًا للتقويم ثم «استيراد».'])),
        },
      ],
      { className: 'tabs-pills v9p-sub-tabs' },
    );
  }

  function render(issued = null) {
    const parts = [
      h(
        'p',
        status.scope === 'lawyer'
          ? 'يضيف هذا الرابط جلسات ملفاتك المستمرة ومهامها ومواعيد تسليم إسناداتك إلى تقويم هاتفك، ويتحدث تلقائيًا.'
          : 'يضيف هذا الرابط جلسات الملفات المستمرة والمواعيد الإجرائية ومواعيد تسليم الإسنادات واستحقاق الفواتير إلى تقويم هاتفك، ويتحدث تلقائيًا.',
      ),
      alertBox('الرابط سري: من يملكه يرى مواعيدك. لا تشاركه مع أحد. لا يتضمن التقويم أرقام هواتف أو بيانات اتصال المستفيدين. يتوقف الرابط تلقائيًا عند تغيير كلمة المرور أو إيقاف الحساب.', 'warning', { title: 'خصوصية', icon: 'lock' }),
    ];
    if (!issued && !status.active && status.invalidated === 'password_changed') {
      parts.push(alertBox('أُوقف رابط الاشتراك السابق لأن كلمة مرور الحساب تغيّرت بعد إصداره. أنشئ رابطًا جديدًا وأضفه إلى تقويمك من جديد.', 'info', { title: 'توقف الرابط السابق', icon: 'info' }));
    }
    if (issued) {
      const inputId = uid('feed');
      parts.push(
        h(
          'div.field.field-full',
          h('label.field-label', { htmlFor: inputId }, 'رابط الاشتراك (يظهر الآن فقط — انسخه واحفظه في التقويم)'),
          h('div.v9p-feed-url', h('input.input', { id: inputId, type: 'text', dir: 'ltr', readonly: true, value: issued.url, onFocus: (e) => e.target.select() }), copyButton(issued.url, 'نسخ الرابط', { variant: 'secondary', size: 'md' })),
        ),
        h('div.row', button('فتح في تطبيق التقويم', { variant: 'primary', icon: 'calendar', href: issued.webcal_url })),
        instructions(issued.url),
      );
    } else if (status.active) {
      parts.push(
        alertBox(
          `يوجد رابط اشتراك مفعّل منذ ${date(status.created_at)} (ينتهي بـ ${status.hint})${status.last_used_at ? `، آخر مزامنة ${relative(status.last_used_at)}` : '، ولم يُستخدم بعد'}. لا يمكن عرض الرابط مرة أخرى لأنه مخزن مشفّرًا؛ أصدر رابطًا جديدًا إن احتجت إليه (يتوقف الرابط القديم فورًا).`,
          'info',
          { title: 'الاشتراك مفعّل', icon: 'checkCircle' },
        ),
      );
    }
    parts.push(
      h(
        'div.row',
        asyncButton(
          status.active || issued ? 'إصدار رابط جديد' : 'إنشاء رابط الاشتراك',
          async () => {
            if (status.active || issued) {
              const ok = await confirmDanger({ title: 'إصدار رابط جديد', message: 'سيتوقف الرابط الحالي فورًا في كل التقويمات المشتركة به، وستحتاج لإضافة الرابط الجديد. هل تريد المتابعة؟', confirmLabel: 'إصدار رابط جديد' });
              if (!ok) return;
            }
            const res = await api.post('/calendar/feed');
            status = res;
            render(res);
            toast('أُنشئ رابط اشتراك جديد', 'success');
          },
          { variant: status.active || issued ? 'secondary' : 'primary', icon: 'link' },
        ),
        (status.active || issued) &&
          asyncButton(
            'إلغاء الاشتراك',
            async () => {
              const ok = await confirmDanger({ title: 'إلغاء رابط التقويم', message: 'سيتوقف التقويم المشترك عن التحديث في كل الأجهزة. هل تريد المتابعة؟', confirmLabel: 'إلغاء الرابط' });
              if (!ok) return;
              status = await api.del('/calendar/feed');
              render(null);
              toast('أُلغي رابط اشتراك التقويم', 'success');
            },
            { variant: 'ghost', icon: 'trash' },
          ),
      ),
    );
    mount(body, h('div.stack', parts));
  }
  render(null);
}

/**
 * واجهة التقويم المشتركة.
 * @param {object} ctx سياق الصفحة
 * @param {{mode:'staff'|'lawyer'}} opts
 */
export async function calendarPage(ctx, { mode = 'staff' } = {}) {
  const isLawyer = mode === 'lawyer';
  const endpoint = isLawyer ? '/lawyer/calendar' : '/admin/calendar';
  const basePath = isLawyer ? '/my/calendar' : '/calendar';
  const allTypes = isLawyer ? ['event', 'task', 'assignment'] : ['event', 'task', 'assignment', 'invoice'];
  const q = ctx.query || {};
  const state = {
    view: q.view === 'agenda' ? 'agenda' : 'month',
    month: parseMonth(q.month),
    lawyer: !isLawyer && q.lawyer ? String(q.lawyer) : '',
    types: q.types ? q.types.split(',').filter((t) => allTypes.includes(t)) : [...allTypes],
    day: /^\d{4}-\d{2}-\d{2}$/.test(q.day || '') ? q.day : null,
  };
  if (!state.types.length) state.types = [...allTypes];
  let data = null;
  let lawyers = [];

  const content = h('div.v9p-cal-content', loading());
  const monthTitle = h('h2.v9p-cal-month', { 'aria-live': 'polite' });
  const viewBtns = {};

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.view !== 'month') params.set('view', state.view);
    params.set('month', monthKey(state.month));
    if (state.lawyer) params.set('lawyer', state.lawyer);
    if (state.types.length !== allTypes.length) params.set('types', state.types.join(','));
    if (state.day) params.set('day', state.day);
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${basePath}?${params}`);
    } catch {
      /* لا شيء */
    }
  }

  async function load() {
    const grid = monthGrid(state.month);
    monthTitle.textContent = MONTH_FMT.format(new Date(Date.UTC(state.month.y, state.month.m - 1, 1)));
    mount(content, loading());
    syncUrl();
    try {
      data = await api.get(endpoint, {
        from: cairoDateToIso(grid.from),
        to: cairoDateToIso(grid.toExclusive),
        types: state.types.join(','),
        lawyer_id: state.lawyer || undefined,
      });
      if (data.lawyers) lawyers = data.lawyers;
      render(grid);
    } catch (err) {
      mount(content, errorState(err, load));
    }
  }

  function byDay(items) {
    const map = new Map();
    for (const it of items) {
      const k = isoToCairoDate(it.starts_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return map;
  }

  function overdueBox() {
    const list = data.overdue || [];
    if (!list.length) return null;
    return h(
      'details.v9p-overdue',
      h('summary', icon('alert', { size: 16 }), h('span', `متأخرات تجاوزت تاريخها دون إنجاز: ${count(list.length, ['موعد واحد', 'موعدان', 'مواعيد', 'موعدًا'])}`)),
      h('ul.v9p-cal-list', list.map((it) => itemRow(it, { showDate: true, isLawyer }))),
    );
  }

  function dayPanel(key, items) {
    const title = DAY_FMT.format(new Date(keyToUtc(key)));
    return card({
      title: key === cairoToday() ? `اليوم — ${title}` : title,
      icon: 'calendar',
      className: 'v9p-day-panel',
      body: items.length ? h('ul.v9p-cal-list', items.map((it) => itemRow(it, { isLawyer }))) : emptyState('لا توجد مواعيد في هذا اليوم', null, { compact: true, icon: 'calendar' }),
    });
  }

  function renderMonth(grid, map) {
    const today = cairoToday();
    const inMonth = (k) => k.startsWith(monthKey(state.month));
    const selected = state.day && grid.cells.includes(state.day) ? state.day : grid.cells.includes(today) ? today : grid.cells.find(inMonth);
    const panelHost = h('div.v9p-day-host');
    const cells = grid.cells.map((k) => {
      const items = map.get(k) || [];
      const n = items.length;
      const dayNum = Number(k.slice(8));
      const pick = () => {
        state.day = k;
        cellEls.forEach((c) => {
          c.el.classList.toggle('is-selected', c.key === k);
          c.btn.setAttribute('aria-pressed', c.key === k ? 'true' : 'false');
        });
        mount(panelHost, dayPanel(k, items));
        syncUrl();
      };
      const btn = h(
        'button.v9p-day-num',
        {
          type: 'button',
          'aria-pressed': k === selected ? 'true' : 'false',
          'aria-label': `${DAY_FMT.format(new Date(keyToUtc(k)))}${n ? ` — ${count(n, ['موعد واحد', 'موعدان', 'مواعيد', 'موعدًا'])}` : ' — لا مواعيد'}`,
          onClick: pick,
        },
        String(dayNum),
      );
      const el = h(
        'div.v9p-day',
        { class: [!inMonth(k) && 'is-out', k === today && 'is-today', k === selected && 'is-selected', n && 'has-items', items.some((i) => i.overdue) && 'has-overdue'] },
        btn,
        n
          ? h(
              'div.v9p-day-items',
              items.slice(0, 3).map((it) =>
                h(
                  it.link ? 'a.v9p-chip-item' : 'span.v9p-chip-item',
                  { class: `v9p-t-${it.type}`, href: it.link || null, title: `${itemLabel(it)}: ${it.title}${it.all_day ? '' : ` — ${time(it.starts_at)}`}` },
                  !it.all_day && h('span.v9p-chip-time', time(it.starts_at)),
                  h('span.v9p-chip-text', chipText(it)),
                ),
              ),
              n > 3 && h('button.v9p-more', { type: 'button', onClick: pick }, `+${n - 3} أخرى`),
            )
          : null,
        n ? h('div.v9p-dots', { 'aria-hidden': 'true' }, [...new Set(items.map((i) => i.type))].map((t) => h('span.v9p-dot', { class: `v9p-t-${t}` }))) : null,
      );
      return { key: k, el, btn };
    });
    const cellEls = cells;
    if (selected) mount(panelHost, dayPanel(selected, map.get(selected) || []));
    return h(
      'div.v9p-month-wrap',
      h(
        'div.v9p-month',
        { role: 'group', 'aria-label': `تقويم ${monthTitle.textContent}` },
        WEEKDAYS.map(([full, short]) => h('div.v9p-wd', { 'aria-hidden': 'true' }, h('span.v9p-wd-full', full), h('span.v9p-wd-short', short))),
        cells.map((c) => c.el),
      ),
      panelHost,
    );
  }

  function renderAgenda(map) {
    const keys = [...map.keys()].filter((k) => k.startsWith(monthKey(state.month))).sort();
    if (!keys.length) return emptyState('لا توجد مواعيد في هذا الشهر حسب التصفية الحالية', null, { icon: 'calendar' });
    const today = cairoToday();
    return h(
      'div.v9p-agenda',
      keys.map((k) =>
        h(
          'section.v9p-agenda-day',
          { class: [k === today && 'is-today', k < today && 'is-past'] },
          h('h3.v9p-agenda-head', dayLabel(new Date(keyToUtc(k) + 12 * 3600000).toISOString()), k === today ? null : h('span.muted.small', ` · ${DAY_FMT.format(new Date(keyToUtc(k)))}`)),
          h('ul.v9p-cal-list', map.get(k).map((it) => itemRow(it, { isLawyer }))),
        ),
      ),
    );
  }

  function render(grid) {
    const map = byDay(data.items || []);
    const inMonth = (data.items || []).filter((it) => isoToCairoDate(it.starts_at).startsWith(monthKey(state.month)));
    const summary = h(
      'p.v9p-cal-summary.small.muted',
      inMonth.length ? `في هذا الشهر: ${allTypes.map((t) => [t, inMonth.filter((i) => i.type === t).length]).filter(([, n]) => n).map(([t, n]) => `${TYPE_PLURAL[t]}: ${n}`).join(' · ')}` : 'لا توجد مواعيد في هذا الشهر حسب التصفية الحالية.',
    );
    mount(content, overdueBox(), summary, state.view === 'month' ? renderMonth(grid, map) : renderAgenda(map));
    Object.entries(viewBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', k === state.view ? 'true' : 'false'));
  }

  // ── شريط التحكم ──
  const nav = h(
    'div.v9p-cal-nav',
    button('', { icon: 'chevronRight', variant: 'ghost', title: 'الشهر السابق', onClick: () => { state.month = shiftMonth(state.month, -1); state.day = null; load(); } }),
    monthTitle,
    button('', { icon: 'chevronLeft', variant: 'ghost', title: 'الشهر التالي', onClick: () => { state.month = shiftMonth(state.month, 1); state.day = null; load(); } }),
    button('اليوم', { size: 'sm', onClick: () => { state.month = parseMonth(''); state.day = cairoToday(); load(); } }),
  );
  const views = h(
    'div.v9p-seg',
    { role: 'group', 'aria-label': 'طريقة العرض' },
    [['month', 'الشهر', 'calendar'], ['agenda', 'جدول المواعيد', 'menu']].map(([k, lbl, ic]) => {
      const b = h('button.v9p-seg-btn', { type: 'button', 'aria-pressed': k === state.view ? 'true' : 'false', onClick: () => { state.view = k; if (data) render(monthGrid(state.month)); syncUrl(); } }, icon(ic, { size: 16 }), h('span', lbl));
      viewBtns[k] = b;
      return b;
    }),
  );
  const typeToggles = h(
    'div.v9p-type-toggles',
    { role: 'group', 'aria-label': 'أنواع المواعيد' },
    allTypes.map((t) =>
      h(
        'button.chip-toggle.v9p-type-toggle',
        {
          type: 'button',
          class: [`v9p-t-${t}`, state.types.includes(t) && 'is-on'],
          'aria-pressed': state.types.includes(t) ? 'true' : 'false',
          onClick: (e) => {
            const on = state.types.includes(t);
            if (on && state.types.length === 1) return toast('اختر نوعًا واحدًا على الأقل', 'info');
            state.types = on ? state.types.filter((x) => x !== t) : [...state.types, t];
            e.currentTarget.classList.toggle('is-on', !on);
            e.currentTarget.setAttribute('aria-pressed', !on ? 'true' : 'false');
            load();
          },
        },
        h('span.v9p-dot', { class: `v9p-t-${t}`, 'aria-hidden': 'true' }),
        icon(TYPE_ICON[t], { size: 14 }),
        h('span', label('calendar_type', t)),
      ),
    ),
  );

  let lawyerFilter = null;
  if (!isLawyer) {
    // قائمة المحامين تأتي مع أول تحميل
    lawyerFilter = h('div.v9p-lawyer-filter');
  }

  const header = pageHeader({
    title: isLawyer ? 'تقويمي' : 'التقويم',
    subtitle: isLawyer
      ? 'جلسات ملفاتك المستمرة ومهامها ومواعيد تسليم إسناداتك.'
      : 'الجلسات والمواعيد الإجرائية ومواعيد تسليم الإسنادات واستحقاق الفواتير في مكان واحد.',
    actions: [button('اشترك في تقويم هاتفك', { icon: 'link', variant: 'primary', onClick: () => openSubscribeDialog() })],
  });

  await load();
  if (lawyerFilter) {
    mount(
      lawyerFilter,
      selectInput({
        label: 'المحامي',
        allLabel: 'كل المحامين',
        value: state.lawyer,
        options: lawyers.map((l) => ({ value: l.id, label: l.name })),
        onChange: (val) => {
          state.lawyer = val;
          load();
        },
      }),
    );
  }

  return h(
    'div.v9p-page.v9p-calendar',
    header,
    card({
      className: 'v9p-cal-card',
      body: h(
        'div.stack',
        h('div.v9p-cal-toolbar', nav, h('div.v9p-cal-tools', views, lawyerFilter)),
        typeToggles,
        content,
      ),
    }),
  );
}

export default async function render(ctx) {
  return calendarPage(ctx, { mode: 'staff' });
}

