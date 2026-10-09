// بوابة المحامي — «اليوم» (الإصدار 9.1 — مسار l-home، L-01): قائمة واحدة مرتبة بما يجب فعله الآن، لكل صف زره.
// بلا عدادات ولا مسار تنقل ولا نصوص تعريفية متكررة. البيانات من /api/lawyer/today (بيانات المحامي نفسه فقط، بلا أي
// بيانات اتصال أو هوية للمستفيد/ة)، والنصوص من app/words.js.
//
// الحالات: تحميل (صفوف رمادية) · بلا اتصال مع نسخة محفوظة (≤ 24 ساعة) · خطأ بلا نسخة · لا شيء مطلوب · أول استخدام
// (بطاقة «جهّز هاتفك في دقيقة» — L-10). يُحدَّث عند العودة للصفحة إن مرّت أكثر من 60 ثانية على آخر تحميل.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { time, shortDate, money, num, normalizeEgPhone } from '../../../lib/fmt.js';
import { button, icon, toast, modal, errorMessage, asyncButton } from '../../../lib/ui.js';
import { withPasswordConfirm, REAUTH_CANCELLED } from '../../lh-reauth.js';
import { haptic } from '../../../lib/haptics.js'; // v10 experience (H-E5)
import {
  NAV,
  count,
  dayDate,
  when,
  todayHeading,
  actionCopy,
  assignmentStatus,
  matterStatus,
  monthName,
  companyParts, // v10 b2b-staff (U10-L01)
} from '../../words.js';

const CACHE_TTL_MS = 24 * 3600 * 1000;
const REFRESH_AFTER_MS = 60 * 1000;
const MAX_ROWS = 8;
const COUNT_KEY = 'bm-today-count';

const cacheKey = (userId) => `bm-today:${userId}`;
const setupKey = (userId) => `bm-setup-dismissed:${userId}`;

function readStore(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function writeStore(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* التخزين غير متاح: تعمل الصفحة دون نسخة محفوظة */
  }
}

/** يعلن عدد «مطلوب الآن» لشارة «اليوم» في الشريط السفلي */
function announceCount(n) {
  writeStore(COUNT_KEY, String(n));
  window.dispatchEvent(new CustomEvent('bm:today', { detail: { count: n } }));
}

/** الاسم الأول بلا اللقب («أ. هاني رمزي» → «هاني») */
function firstName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter((p) => p && !p.endsWith('.'));
  return parts[0] || '';
}

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** يختصر نصًا حرًا عند حد كلمة بنقاط في نهايته («استدعاء للنيابة في…») */
function clip(text, n) {
  // على الشاشات الواسعة مساحة أكبر للنص
  const max = typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches ? Math.round(n * 2.2) : n;
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const i = cut.lastIndexOf(' ');
  return `${(i > max * 0.5 ? cut.slice(0, i) : cut).trim()}…`;
}

/** أجزاء السطر الثانوي: النصوص كما هي، والأكواد داخل <bdi dir=ltr> بلا التفاف */
function subLine(parts) {
  const out = [];
  parts.forEach((p, i) => {
    if (i) out.push(h('span.lh-sep', { 'aria-hidden': 'true' }, ' · '));
    if (p && typeof p === 'object' && p.chip) out.push(h('span.lh-co-chip', p.chip)); // v10 b2b-staff (U10-L01): «شركة»
    else if (p && typeof p === 'object' && p.code) out.push(h('bdi.lh-code', { dir: 'ltr' }, p.code));
    else if (p && typeof p === 'object' && p.keep) out.push(h('span.lh-keep', String(p.keep)));
    else out.push(h('span.lh-sub-text', String(p)));
  });
  return out;
}

export default async function render(ctx) {
  const user = ctx.user || {};
  const page = h('div.page.lh-today');
  const dateLine = h('p.lh-date');
  const heading = h('h1.lh-h1', { tabindex: '-1' });
  const statusLine = h('div.lh-status', { hidden: true, role: 'status' });
  const pillHost = h('div.lh-pill-host');
  const body = h('div.lh-body');
  mount(page, h('header.lh-today-head', dateLine, heading), statusLine, pillHost, body);

  let data = null;
  let loadedAt = 0;
  let loading = false;
  let showAll = false;
  const hiddenTasks = new Set(); // مهام عُلّمت «تمّت» (تُخفى فورًا قبل رد الخادم)
  let alertsJustOn = false; // فُعّلت التنبيهات من بطاقة «جهّز هاتفك» الآن: يظهر «جرّب التنبيه» تحتها

  // ── التحميل ──
  async function load({ initial = false } = {}) {
    if (loading) return;
    loading = true;
    try {
      const req = initial && ctx.prefetched ? ctx.prefetched : api.get('/lawyer/today');
      const fresh = await req;
      if (!fresh || (fresh.user_id != null && user.id != null && fresh.user_id !== user.id)) throw new Error('mismatch');
      data = fresh;
      loadedAt = Date.now();
      writeStore(cacheKey(user.id), { at: new Date().toISOString(), data });
      statusLine.hidden = true;
      draw();
    } catch (err) {
      if (err && err.status === 401) return; // انتهت الجلسة: main.js يعرض شاشة الدخول
      const cached = readStore(cacheKey(user.id));
      if (cached && cached.data && Date.now() - Date.parse(cached.at) <= CACHE_TTL_MS) {
        if (!data) data = cached.data;
        draw();
        mount(
          statusLine,
          icon('alert', { size: 16 }),
          h('span', `لا يوجد اتصال — آخر تحديث ${time(cached.at)}`),
          h('button.lh-link', { type: 'button', onClick: () => load() }, 'إعادة المحاولة'),
        );
        statusLine.hidden = false;
      } else if (!data) {
        heading.textContent = NAV.today;
        mount(
          body,
          h(
            'section.card.lh-error',
            h('p', 'تعذر تحميل مهامك. تحقق من الاتصال ثم أعد المحاولة.'),
            button('إعادة المحاولة', { variant: 'primary', icon: 'refresh', onClick: () => load() }),
          ),
        );
      }
    } finally {
      loading = false;
    }
  }

  // ── العرض ──
  function draw() {
    if (!data) return;
    const actions = (data.actions || []).filter((a) => !(a.task_id && hiddenTasks.has(a.task_id)));
    dateLine.textContent = dayDate(data.now || new Date());
    heading.textContent = todayHeading(actions.length);
    announceCount(actions.length);
    const setup = data.setup || {};
    const checklist = setupCard(setup, actions.length);
    mount(
      body,
      h(
        'div.lh-cols',
        h(
          'div.lh-main',
          actions.length ? nowCard(actions) : checklist || emptyCard(setup),
          actions.length ? checklist : null,
          workSection(data.work || {}),
        ),
        h('div.lh-side', upcomingSection(data.upcoming || []), payRow(data.pay)),
      ),
    );
    drawPill();
  }

  // ── «مطلوب الآن» ──
  function nowCard(actions) {
    const visible = showAll ? actions : actions.slice(0, MAX_ROWS);
    const rest = actions.length - visible.length;
    return h(
      'section.card.lh-now',
      { 'aria-labelledby': 'lh-now-title' },
      h('h2.lh-card-title#lh-now-title', 'مطلوب الآن'),
      h('ul.lh-rows', visible.map((a) => h('li', actionRow(a)))),
      rest > 0 &&
        h('button.lh-more', { type: 'button', onClick: () => { showAll = true; draw(); } }, `عرض ${num(rest)} أخرى`),
    );
  }

  function hrefFor(a) {
    switch (a.kind) {
      case 'hearing_outcome':
        return `#/my/matters/${a.matter_id}?outcome=${a.event_id}`;
      case 'hearing_today':
      case 'task_overdue':
      case 'task_due':
        return `#/my/matters/${a.matter_id}`;
      case 'assignment_returned':
      case 'assignment_due_soon':
        return `#/my/assignments/${a.assignment_id}/write`;
      case 'info_shared':
        return `#/my/assignments/${a.assignment_id}?tab=requests`;
      default:
        return `#/my/assignments/${a.assignment_id}`;
    }
  }

  function actionRow(a) {
    // النص الحر يُختصر هنا (لا بالـ CSS وحده) فيبقى أعلى الصفحة قليل الكلمات؛ النص الكامل في التلميح
    const c = actionCopy({ ...a, case_title: clip(a.case_title, 26), title: clip(a.title, 26), location: clip(a.location, 22) });
    const href = hrefFor(a);
    const isTask = a.kind === 'task_overdue' || a.kind === 'task_due';
    const isOutcome = a.kind === 'hearing_outcome';
    const main = h(
      isOutcome ? 'button.lh-row-main' : 'a.lh-row-main',
      isOutcome ? { type: 'button', title: actionCopy(a).title, onClick: () => openOutcome(a) } : { href, title: actionCopy(a).title },
      h('span.lh-dot', { class: `lh-dot-${c.tone}`, 'aria-hidden': 'true' }),
      h('span.lh-row-text', h('span.lh-row-title', c.title), c.sub.length ? h('span.lh-row-sub', subLine(c.sub)) : null),
      c.chevron && h('span.lh-chev', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 20 })),
    );
    let trailing = null;
    if (c.button) {
      const variant = c.button.kind === 'primary' ? 'primary' : 'secondary';
      if (isOutcome) trailing = button(c.button.label, { variant, className: 'lh-row-btn', onClick: () => openOutcome(a) });
      else if (isTask) trailing = button(c.button.label, { variant, className: 'lh-row-btn', icon: 'check', onClick: (e) => markTaskDone(a, e.currentTarget) });
      else trailing = button(c.button.label, { variant, className: 'lh-row-btn', href });
    }
    const row = h('div.lh-row', { class: [`lh-kind-${a.kind}`, c.chevron && 'lh-row-link'], dataset: { kind: a.kind } }, main, trailing);
    const state = outboxState(a);
    if (state) row.append(h('span.lh-row-state', { class: `is-${state.state}` }, state.text));
    return row;
  }

  // ── ورقة نتيجة الجلسة (L-02 — مسار l-court) تُفتح هنا دون تغيير الرابط ──
  async function openOutcome(a) {
    let mod;
    try {
      mod = await import('../../components/outcome-sheet.js');
    } catch {
      mod = null;
    }
    if (!mod || !mod.openOutcomeSheet) {
      ctx.navigate(`/my/matters/${a.matter_id}?outcome=${a.event_id}`);
      return;
    }
    await mod.openOutcomeSheet({
      event: { id: a.event_id, title: a.title, starts_at: a.at, kind: a.event_kind, client_attendance_required: a.attendance },
      user,
      onSaved: () => {
        data.actions = (data.actions || []).filter((x) => !(x.kind === 'hearing_outcome' && x.event_id === a.event_id));
        draw();
        load();
      },
      onQueued: () => draw(),
    });
  }

  // ── المهمة «تمّت» (طلب واحد، ثم «تراجع» خلال 5 ثوانٍ) ──
  async function send(path, body, ref, label) {
    let ob = null;
    try {
      ob = await import('../../components/outbox.js');
    } catch {
      ob = null; // بلا صندوق صادر: طلب مباشر
    }
    if (!ob || !ob.outboxSend) return { status: 'sent', data: await api.patch(path, body) };
    ob.initOutbox(user);
    return ob.outboxSend({ kind: 'task', method: 'PATCH', path, body, ref, label });
  }
  async function markTaskDone(a, btn) {
    if (btn) btn.disabled = true;
    hiddenTasks.add(a.task_id);
    const row = btn && btn.closest('.lh-row');
    if (row) row.classList.add('is-leaving');
    setTimeout(draw, 180);
    try {
      await send(`/lawyer/matter-tasks/${a.task_id}`, { status: 'done' }, `task:${a.task_id}`, `مهمة: ${a.title || ''}`);
    } catch (err) {
      hiddenTasks.delete(a.task_id);
      draw();
      toast(errorMessage(err), 'danger');
      return;
    }
    haptic('commit'); // v10 experience (H-E5, X10-M6): «تم» سُجّلت
    const t = toast('سُجّلت المهمة منجزة', 'success', 5000);
    const undo = h('button.lh-toast-undo', { type: 'button' }, 'تراجع');
    undo.addEventListener('click', async () => {
      t.close();
      try {
        await send(`/lawyer/matter-tasks/${a.task_id}`, { status: 'open' }, `task:${a.task_id}`, `مهمة: ${a.title || ''}`);
        hiddenTasks.delete(a.task_id);
        draw();
      } catch (err) {
        toast(errorMessage(err), 'danger');
      }
    });
    const closeBtn = t.el.querySelector('.toast-close');
    if (closeBtn) closeBtn.before(undo);
    else t.el.append(undo);
  }

  // حالة صندوق الصادر لصفوف المهام والجلسات (L-18)
  let outbox = null;
  import('../../components/outbox.js')
    .then((m) => {
      outbox = m;
      m.initOutbox(user);
      const off = m.onOutboxChange
        ? m.onOutboxChange((ev) => {
            if (!page.isConnected) {
              off && off();
              return;
            }
            if (ev && ev.sent && ev.sent.length) load();
            else draw();
          })
        : null;
      drawPill();
    })
    .catch(() => {});
  function outboxState(a) {
    if (!outbox || !outbox.outboxStateFor) return null;
    const ref = a.kind === 'hearing_outcome' ? `event:${a.event_id}` : a.task_id ? `task:${a.task_id}` : null;
    const s = ref ? outbox.outboxStateFor(ref) : null;
    if (!s) return null;
    if (s.state === 'queued') return { state: 'queued', text: outbox.QUEUED_TEXT || 'بانتظار الاتصال — سيُرسل تلقائيًا' };
    return { state: 'failed', text: `لم يُحفظ: ${s.item.error || ''}`.trim() };
  }
  function drawPill() {
    if (!outbox || !outbox.outboxPill || pillHost.childElementCount) return;
    pillHost.append(outbox.outboxPill());
  }

  // ── لا شيء مطلوب ──
  function emptyCard(setup) {
    let text;
    let action = null;
    if (setup.alert_whatsapp) text = 'سنرسل لك تنبيهًا على واتساب عند وصول إسناد جديد.';
    else if (setup.alerts_available) {
      text = 'فعّل تنبيهات واتساب لتعرف بالإسناد الجديد فور وصوله.';
      action = button('فعّل التنبيهات', { variant: 'primary', icon: 'whatsapp', href: '#/account?focus=alerts', className: 'lh-empty-btn' });
    } else text = 'ستجد كل جديد هنا وفي الإشعارات داخل المنصة.';
    return h('section.card.lh-empty', icon('checkCircle', { size: 28 }), h('p', text), action);
  }

  // ── «قادم» ──
  function upcomingSection(items) {
    if (!items.length) return null;
    return h(
      'section.lh-section.lh-upcoming',
      h('h2.lh-section-title', 'قادم'),
      h(
        'ul.lh-list',
        items.map((u) => {
          let title;
          let sub;
          let href;
          if (u.kind === 'hearing') {
            title = `جلسة ${shortDate(u.at)} ${time(u.at)}`;
            sub = [clip(u.location || u.title, 22), { code: u.matter_code }].filter(Boolean);
            href = `#/my/matters/${u.matter_id}`;
          } else if (u.kind === 'task') {
            title = `مهمة: ${clip(u.title, 26)}`;
            sub = [{ code: u.matter_code }, dayDate(u.at)];
            href = `#/my/matters/${u.matter_id}`;
          } else {
            title = `موعد تسليم رأيك ${when(u.at)}`;
            sub = [{ code: u.case_code }, ...companyParts(u), clip(u.case_title, 22)].filter(Boolean); // v10 b2b-staff
            href = `#/my/assignments/${u.assignment_id}`;
          }
          return h('li', h('a.lh-line', { href }, h('span.lh-line-text', h('span.lh-line-title', title), h('span.lh-row-sub', subLine(sub))), h('span.lh-chev', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 18 }))));
        }),
      ),
    );
  }

  // ── «عملي الجاري» ──
  function workSection(work) {
    const asg = work.assignments || [];
    const mts = work.matters || [];
    const lines = [
      ...asg.map((a) =>
        h('li', h('a.lh-line', { href: `#/my/assignments/${a.id}` }, h('span.lh-line-text', h('span.lh-line-title.is-parts', subLine([{ code: a.case_code }, ...companyParts(a), clip(a.case_title, 22)]))), h('span.lh-status-word', { class: `is-${a.status}` }, assignmentStatus(a.status)))), // v10 b2b-staff: «شركة»
      ),
      ...mts.map((m) =>
        h('li', h('a.lh-line', { href: `#/my/matters/${m.id}` }, h('span.lh-line-text', h('span.lh-line-title.is-parts', subLine([{ code: m.code }, clip(m.title, 22)]))), h('span.lh-status-word', matterStatus(m.status)))),
      ),
    ];
    return h(
      'section.lh-section.lh-work',
      h('h2.lh-section-title', 'عملي الجاري'),
      lines.length ? h('ul.lh-list', lines) : h('p.lh-muted', 'لا يوجد عمل جارٍ الآن.'),
      h('a.lh-link.lh-history', { href: '#/my/assignments?tab=history' }, 'الإسنادات السابقة ›'),
    );
  }

  // ── المستحقات ──
  function payRow(pay) {
    if (!pay) return null;
    const text = pay.volunteer
      ? `مساهماتك التطوعية هذا الشهر: ${num(pay.contributions || 0)}`
      : `مستحقاتك عن ${monthName(pay.period)}: ${money(pay.amount || 0)}`;
    return h('a.lh-pay', { href: '#/my/statement' }, icon('wallet', { size: 18 }), h('span', text), h('span.lh-chev', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 18 })));
  }

  // ── أول استخدام: «جهّز هاتفك في دقيقة» (L-10) ──
  function setupCard(setup, actionCount) {
    if (readStore(setupKey(user.id))) return null;
    const installed = isStandalone();
    const items = [
      setup.alerts_available && { key: 'alerts', done: !!setup.alert_whatsapp, text: 'تنبيهات واتساب للإسنادات الجديدة', act: 'فعّل', run: alertsInline },
      { key: 'install', done: installed, text: 'أضف المنصة إلى شاشتك الرئيسية', act: 'أضف', run: installApp },
      { key: 'calendar', done: !!setup.calendar_feed_active, text: 'أضف جلساتك إلى تقويم هاتفك', act: 'أضف', run: addCalendar },
      { key: '2fa', done: !!setup.two_factor, text: 'احمِ حسابك بالتحقق بخطوتين (اختياري)', act: 'فعّل', run: () => ctx.navigate('/account') },
    ].filter(Boolean);
    if (items.every((i) => i.done)) return null;
    if (actionCount > 0 && !setup.new_account) return null;
    const dismiss = () => {
      writeStore(setupKey(user.id), new Date().toISOString());
      draw();
    };
    const name = firstName(user.name);
    const inline = h('div.lh-setup-inline');
    return h(
      'section.card.lh-setup',
      { 'aria-labelledby': 'lh-setup-title' },
      h('h2.lh-card-title#lh-setup-title', name ? `أهلًا ${name} — جهّز هاتفك في دقيقة` : 'جهّز هاتفك في دقيقة'),
      h(
        'ul.lh-setup-list',
        items.map((it) =>
          h(
            'li.lh-setup-item',
            { class: it.done && 'is-done', dataset: { key: it.key } },
            h('span.lh-check', { 'aria-hidden': 'true' }, it.done ? icon('checkCircle', { size: 22 }) : h('span.lh-check-empty')),
            h('span.lh-setup-text', it.text, it.done && h('span.sr-only', ' — تم')),
            !it.done && button(it.act, { variant: 'secondary', className: 'lh-row-btn', onClick: () => it.run(inline) }),
          ),
        ),
      ),
      inline,
      alertsJustOn && setup.alert_whatsapp ? alertsDoneRow() : null,
      h('h3.lh-how-title', 'كيف تعمل المنصة؟'),
      h(
        'ul.lh-how',
        h('li', 'تصلك الإسنادات هنا مع المطلوب والموعد.'),
        h('li', 'تكتب رأيك وتقدّمه للإدارة، وهي التي ترد على المستفيد/ة.'),
        h('li', 'تجد أتعابك في «مستحقاتي».'),
      ),
      h('div.lh-setup-actions', button('تم', { variant: 'primary', onClick: dismiss }), button('لاحقًا', { variant: 'ghost', onClick: dismiss })),
    );
  }

  /** بعد التفعيل من البطاقة: تأكيد قصير وزر «جرّب التنبيه» (رسالة تجريبية تصل الآن، ولو في ساعات الهدوء) */
  function alertsDoneRow() {
    return h(
      'div.lh-alerts-done',
      { role: 'status' },
      icon('checkCircle', { size: 18 }),
      h('span', 'ستصلك التنبيهات على واتساب.'),
      asyncButton(
        'جرّب التنبيه',
        async () => {
          const r = await api.post('/account/alerts/test');
          toast(r && r.simulated ? 'سُجّل تنبيه تجريبي (وضع المحاكاة — لا يُرسل فعليًا)' : 'أُرسل تنبيه تجريبي إلى واتساب', 'success');
        },
        { variant: 'secondary', icon: 'whatsapp', className: 'lh-row-btn' },
      ),
    );
  }

  /** تفعيل تنبيهات واتساب من البطاقة نفسها: حقل الموبايل ومفتاح التفعيل */
  async function alertsInline(host) {
    let phone = '';
    try {
      const acc = await api.get('/account');
      phone = acc?.user?.phone || '';
    } catch {
      /* يكمل بحقل فارغ */
    }
    const local = phone ? (normalizeEgPhone(phone) || phone) : '';
    const input = h('input.input#lh-alert-phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', value: local, placeholder: '01xxxxxxxxx' });
    const err = h('p.field-error', { hidden: true, role: 'alert' });
    const save = button('فعّل التنبيهات', { variant: 'primary', icon: 'whatsapp' });
    save.addEventListener('click', async () => {
      const v = normalizeEgPhone(input.value);
      if (!v) {
        err.textContent = 'أدخل رقم الموبايل لتصلك التنبيهات.';
        err.hidden = false;
        input.focus();
        return;
      }
      save.disabled = true;
      try {
        // رقم جديد من جلسة قديمة: تأكيد كلمة المرور الحالية ثم الطلب نفسه (L-21)
        await withPasswordConfirm((extra) => api.patch('/account', { phone: v, alert_whatsapp: true, ...extra }));
        if (data && data.setup) data.setup.alert_whatsapp = true;
        alertsJustOn = true; // التأكيد وزر «جرّب التنبيه» داخل البطاقة نفسها (بلا تنبيه منبثق يكرره)
        draw();
      } catch (e) {
        save.disabled = false;
        if (e && e.code === REAUTH_CANCELLED) return;
        err.textContent = (e.details && e.details.fields && (e.details.fields.phone || e.details.fields.alert_whatsapp)) || errorMessage(e);
        err.hidden = false;
      }
    });
    mount(
      host,
      h(
        'div.lh-inline-form',
        h('label', { for: 'lh-alert-phone' }, 'رقم الموبايل'),
        input,
        err,
        h('p.lh-muted', 'تصلك تنبيهات قصيرة بلا أي بيانات عن المستفيدين. لا نرسل بين 10 م و8 ص.'),
        save,
      ),
    );
    input.focus();
  }

  async function installApp() {
    let pwa = null;
    try {
      pwa = await import('../../../lib/pwa.js');
    } catch {
      pwa = null;
    }
    if (pwa && pwa.promptInstall && (await pwa.promptInstall()) !== 'unavailable') {
      draw();
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (String(navigator.userAgent).includes('Macintosh') && navigator.maxTouchPoints > 1);
    modal({
      title: 'أضف المنصة إلى شاشتك الرئيسية',
      sheet: true,
      body: h('p.confirm-message', ios ? 'اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».' : 'افتح قائمة المتصفح (⋮) ثم اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق».'),
      actions: [{ label: 'حسنًا', variant: 'primary' }],
    });
  }

  async function addCalendar() {
    try {
      const m = await import('../admin/calendar.js');
      if (m.openSubscribeDialog) {
        await m.openSubscribeDialog({});
        try {
          const s = await api.get('/calendar/feed');
          if (data && data.setup && s) data.setup.calendar_feed_active = !!s.active;
        } catch {
          /* تجاهل */
        }
        draw();
        return;
      }
    } catch {
      /* ننتقل لصفحة التقويم */
    }
    ctx.navigate('/my/calendar');
  }

  // ── التحديث عند العودة للصفحة ──
  const onVisible = () => {
    if (!page.isConnected) {
      document.removeEventListener('visibilitychange', onVisible);
      return;
    }
    if (document.visibilityState === 'visible' && Date.now() - loadedAt > REFRESH_AFTER_MS) load();
  };
  document.addEventListener('visibilitychange', onVisible);

  // صفوف رمادية حتى يصل الرد (الرأس يبقى ظاهرًا)
  dateLine.textContent = dayDate(new Date());
  heading.textContent = NAV.today;
  mount(body, h('section.card.lh-now.lh-loading', { 'aria-busy': 'true' }, h('div.lh-sk-row'), h('div.lh-sk-row'), h('div.lh-sk-row')));
  await load({ initial: true });
  return page;
}
