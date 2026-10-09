// الإصدار 10 — «المتابعة» (U10-21…U10-25 مع §8.3 وL-63): الشريط التنبيهي ← التحية ← «يحتاج انتباهكم» ← «طلبات مفتوحة»
// ← «{الشهر} في باقتكم» ← «مواعيد قادمة» ← مدير العلاقة. صفوف الانتباه بأيقونة تنبيه أو ساعة (لا نقاط)، والزر الذهبي
// الوحيد في الشاشة هو «طلب جديد» في الإطار. البحث الواحد أعلى الصفحة على الهاتف (CO-6). جمل البريد حسب email_enabled.
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta, money, relative, monthLabel, cairoToday } from '../../lib/fmt.js';
import { icon, button, alertBox, kRow, emptyState } from '../../lib/ui.js';
import { REQUEST_TYPES } from '../../lib/company-catalog.js';
import { coRequestRow, coUsageMeter, copy, countOf, whenLong, dayText, typeIcon } from '../../lib/company-ui-core.js';
import { W } from '../words.js';
import { S, isAdmin, isViewer, readOnly, seesMoney, getItem, setItem } from '../state.js';
import { pageHead, greeting, errorView, sectionCard, searchSlot } from '../common.js';

const QUICK = ['contract_review', 'nda', 'employment', 'legal_notice'];
const ORDER = { clarification: 0, quote: 1, overage: 1, deliverable: 2, renewal: 3, charge: 4 };
const MAX_ROWS = 6;

/** C-03: «في الموعد» بعدد ما سُلِّم (واحد / اثنان / أكثر) */
function onTimeText(n, m) {
  if (m >= n) return n === 1 ? W.home.one_on_time : n === 2 ? W.home.both_on_time : W.home.all_on_time;
  if (m <= 0) return n === 1 ? W.home.one_late : n === 2 ? W.home.both_late : W.home.all_late;
  if (n === 2) return W.home.one_of_two_on_time;
  return copy('home.some_on_time', { m: countOf(m, 'delivered') });
}

function afterDays(n) {
  if (n <= 0) return null;
  return `بعد ${countOf(n, 'day_after')}`;
}

/** صف «يحتاج انتباهكم»: أيقونة تنبيه/ساعة بلون التحذير، عنوان، سطر فرعي، وزر واحد */
function attentionRow(a) {
  const code = a.request_code ? h('bdi.co-code', { dir: 'ltr' }, a.request_code) : null;
  const reqHref = a.request_code ? `#/requests/${encodeURIComponent(a.request_code)}` : null;
  let title;
  let sub;
  let action;
  let href = reqHref;
  let ic = 'alert';
  switch (a.kind) {
    case 'clarification':
      title = W.home.clarification;
      sub = [code, ' · ', h('span', { dir: 'auto' }, a.title), ` · ${relative(a.since)}`];
      action = a.can_answer ? W.home.reply : W.home.view;
      href = `${reqHref}?focus=action`;
      break;
    case 'quote':
    case 'overage':
      title = a.kind === 'quote' ? W.home.quote : W.home.overage;
      sub = [code, ` · ${money(a.amount)}`, a.kind === 'quote' ? ` · ${copy('home.quote_valid', { date: whenLong(a.valid_until, { time: false }) })}` : ` · ${W.home.overage_after}`, a.can_approve ? '' : W.home.quote_admins];
      action = a.can_approve ? (a.kind === 'quote' ? W.home.review_quote : W.home.review) : W.home.view;
      href = `${reqHref}?focus=action`;
      break;
    case 'deliverable':
      title = copy('home.deliverable', { title: a.title || '' });
      sub = [code, ` · سُلِّم ${relative(a.released_at)}`];
      action = W.home.open;
      href = `${reqHref}?focus=deliverable`;
      break;
    case 'renewal': {
      ic = 'clock';
      title =
        a.memory_kind === 'contract'
          ? a.date_kind === 'notice'
            ? W.home.renewal_notice
            : W.home.renewal_end
          : a.memory_kind === 'licence'
            ? W.home.renewal_licence
            : a.memory_kind === 'key_date'
              ? W.home.renewal_key_date
              : W.home.renewal_other;
      const after = afterDays(Number(a.days_left));
      sub = [h('span', { dir: 'auto' }, a.title), ` · ${dayText(a.date)} · ${after || 'اليوم'}`];
      action = W.home.view;
      href = `#/memory/item/${encodeURIComponent(a.memory_id)}`;
      break;
    }
    case 'charge':
      title = copy('home.charge', { amount: a.amount_text || money(a.amount) });
      sub = [code || h('span', { dir: 'auto' }, a.description || ''), ` · ${relative(a.since)}`];
      action = W.home.view;
      href = reqHref || '#/plan';
      break;
    default:
      return null;
  }
  const btn = button(action, { variant: 'secondary', size: 'sm', href });
  const row = kRow({
    icon: h('span.co-attn-icon', icon(ic, { size: 20 })),
    title,
    sub,
    trailing: btn,
    className: 'co-attn-row',
  });
  // C-10: «عرض»/«الرد» تُقرأ مع عنوان الصف وسطره («عرض — عرض سعر بانتظار موافقتكم، NFD-0005 · …»)
  const id = `co-attn-${(attentionRow.seq = (attentionRow.seq || 0) + 1)}`;
  const t = row.querySelector('.k-row-title');
  const s = row.querySelector('.k-row-sub');
  if (t) t.id = `${id}-t`;
  if (s) s.id = `${id}-s`;
  btn.setAttribute('aria-describedby', [t && `${id}-t`, s && `${id}-s`].filter(Boolean).join(' '));
  return h('li.co-attn', row);
}

function banners(home) {
  const c = { ...(S.company || {}), ...(home.company || {}) };
  const mgr = home.account_manager?.name;
  const out = [];
  if (c.status === 'trial' && c.trial_ends_at) {
    const days = Math.max(0, Math.round((Date.parse(c.trial_ends_at) - Date.now()) / 86400000));
    out.push(alertBox(copy(mgr ? 'home.trial' : 'home.trial_team', { date: whenLong(c.trial_ends_at, { time: false }), days: afterDays(days) || 'اليوم' }), 'info'));
  }
  if (c.status === 'past_due' && seesMoney()) out.push(alertBox(W.home.past_due, 'warning'));
  if (c.read_only) out.push(alertBox(mgr ? W.home.read_only : W.home.read_only_team, 'warning'));
  return out;
}

/** بطاقة إعداد البوابة (مدير البوابة) أو «كيف تعمل البوابة؟» (أول زيارة) — P1 (U10-20) */
function introCard(home) {
  const uid = S.user?.id;
  if (isAdmin() && home.setup) {
    const key = `ek.co.setup:${uid}`;
    if (getItem('localStorage', key)) return null;
    const s = home.setup;
    const items = [
      [W.home.setup_profile, s.profile_complete, '#/company'],
      [W.home.setup_entities, s.entities > 1, '#/memory/entities'],
      [W.home.setup_team, s.users_active + s.invites_pending > 1, '#/team'],
      [W.home.setup_memory, s.memory_items > 0, '#/memory/new/contracts'],
      [W.home.setup_2fa, s.two_factor_self, '#/account'],
    ];
    const done = items.filter((x) => x[1]).length;
    if (done === items.length) return null;
    const card = sectionCard(
      copy('home.setup_title', { done }),
      h('ul.k-list', items.filter((x) => !x[1]).map(([label, , href]) => h('li', kRow({ icon: icon('clock', { size: 20 }), title: label, href })))),
      { actions: button(W.home.hide, { variant: 'link', size: 'sm', onClick: () => { setItem('localStorage', key, '1'); card.remove(); } }), className: 'co-setup' },
    );
    return card;
  }
  if (!home.first_login) return null;
  const key = `ek.co.intro:${uid}`;
  if (getItem('localStorage', key)) return null;
  const lines = isViewer() ? [W.home.intro_viewer] : [W.home.intro_1, W.home.intro_2, W.home.intro_3];
  const card = sectionCard(W.home.intro_title, h('div.co-intro', lines.map((t) => h('p', t)), button(W.state.understood, { variant: 'secondary', size: 'sm', onClick: () => { setItem('localStorage', key, '1'); card.remove(); } })), { className: 'co-intro-card' });
  return card;
}

/** «{الشهر} في باقتكم»: المقياس + سطر التسليمات من /usage بعد أول رسم */
function planCard(home) {
  if (!home.usage) return null;
  const month = monthLabel(cairoToday().slice(0, 7)).split(' ')[0];
  const extra = h('div.co-meter-extra');
  const meter = h('div', coUsageMeter(home.usage, { showPrices: false, hasManager: !!home.account_manager }));
  const card = sectionCard(copy('home.in_plan', { month }), h('div', meter, extra), { actions: h('a.co-link', { href: '#/plan' }, W.home.plan_link, ' ‹') });
  const atLimit = !home.usage.unlimited && home.usage.used >= home.usage.included;
  const later = () => {
    api
      .get('/company/usage', undefined, { background: true })
      .then((u) => {
        const n = Number(u?.requests?.delivered) || 0;
        if (!n) return;
        const m = Number(u?.sla?.delivered_on_time) || 0;
        extra.replaceChildren(h('p.co-meter-line', copy(n <= 2 ? 'home.delivered_one' : 'home.delivered_many', { n: countOf(n, 'delivered'), ontime: onTimeText(n, m) })));
      })
      .catch(() => {});
    if (atLimit && seesMoney()) {
      api
        .get('/company/plan', undefined, { background: true })
        .then((p) => meter.replaceChildren(coUsageMeter(p.quota || home.usage, { showPrices: true, hasManager: !!home.account_manager })))
        .catch(() => {});
    }
  };
  if (window.requestIdleCallback) window.requestIdleCallback(later, { timeout: 1500 });
  else setTimeout(later, 50);
  return card;
}

function upcomingCard(home) {
  const items = home.upcoming || [];
  if (!items.length) return null;
  return sectionCard(
    W.home.upcoming,
    h(
      'ul.k-list.co-dates',
      items.map((u) => h('li', kRow({ icon: h('span.co-date-chip.num', dayText(u.date)), title: h('span', { dir: 'auto' }, u.title), sub: u.kind_label, href: `#/memory/item/${encodeURIComponent(u.memory_id)}` }))),
    ),
    { actions: h('a.co-link', { href: '#/memory/calendar' }, W.home.calendar_link, ' ‹') },
  );
}

function quickCard() {
  if (isViewer() || readOnly()) return null;
  const tiles = QUICK.map((k) => REQUEST_TYPES.find((t) => t.key === k)).filter(Boolean);
  return sectionCard(
    W.home.quick,
    h('div.co-quick', tiles.map((t) => h('a.co-quick-tile', { href: `#/requests/new/${t.key}` }, typeIcon(t.key, { size: 22 }), h('span', t.company_label)))),
    { actions: h('a.co-link', { href: '#/requests/new' }, W.home.all_types, ' ‹'), className: 'co-quick-card' },
  );
}

export default async function overview(ctx) {
  let home;
  try {
    home = await api.get('/company/home');
  } catch (err) {
    return errorView(W.nav.overview, err, () => ctx.reload());
  }
  S.home = home;
  window.dispatchEvent(new CustomEvent('co:home', { detail: home }));
  // أول دخول لمدير البوابة: الترحيب مرة واحدة (U10-19؛ «لاحقًا» يتركه بطاقة إعداد هنا)
  if (isAdmin() && home.first_login && !getItem('localStorage', `ek.co.setup:${S.user?.id}:welcome`)) {
    ctx.navigate('/welcome', { replace: true });
    return h('div');
  }

  const att = [...(home.attention || [])].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || (a.kind === 'renewal' ? a.days_left - b.days_left : 0));
  const rows = att.map(attentionRow).filter(Boolean);
  const list = h('ul.k-list.co-attn-list', rows.slice(0, MAX_ROWS));
  const more = rows.length > MAX_ROWS ? button(copy('home.attention_more', { n: countOf(rows.length - MAX_ROWS, 'attn_more') }), { variant: 'link', onClick: (e) => { list.append(...rows.slice(MAX_ROWS)); e.currentTarget.remove(); } }) : null;
  const attention = sectionCard(
    rows.length ? [W.home.attention, ' ', h('span.co-count.num', `(${rows.length})`)] : W.home.attention,
    rows.length ? h('div', list, more) : h('div.co-empty-attn', h('span.co-empty-icon', { 'aria-hidden': 'true' }, icon('checkCircle', { size: 28 })), h('div', h('p.co-empty-title', W.home.empty_title), h('p.co-empty-text', copy('home.empty_text')))),
    { className: 'co-attention', label: W.home.attention },
  );

  const open = (home.open_requests || []).slice(0, 5);
  const openCard = sectionCard(
    home.counts?.open ? [W.home.open_requests, ' ', h('span.co-count.num', `(${home.counts.open})`)] : W.home.open_requests,
    open.length
      ? h('ul.k-list', open.map((r) => h('li', coRequestRow(r))))
      : emptyState(W.requests.empty_text, isViewer() || readOnly() ? null : button(W.nav.new_request, { variant: 'secondary', icon: 'plus', href: '#/requests/new' }), { title: W.requests.empty_title, compact: true, icon: 'inbox' }),
    { actions: open.length ? h('a.co-link', { href: '#/requests' }, W.home.all_requests, ' ‹') : null },
  );

  const plan = home.company?.plan?.name || S.company?.plan_label;
  const manager = home.account_manager?.name ? h('p.co-manager', icon('user', { size: 18 }), h('span', copy('nav.manager', { name: home.account_manager.name }))) : null;
  const head = pageHead(greeting(S.user?.name), [h('span', { dir: 'auto' }, home.company?.name || S.company?.name || ''), plan ? [' · باقة ', h('bdi', plan)] : null]);

  return h(
    'div.co-page.co-overview',
    banners(home),
    head,
    h('div.co-phone-search', searchSlot()),
    h(
      'div.co-columns',
      h('div.co-col-main', attention, openCard, introCard(home)),
      h('aside.co-col-aside', planCard(home), upcomingCard(home), quickCard(), manager),
    ),
  );
}
