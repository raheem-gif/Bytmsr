// بوابة المحامي — الملفات المستمرة (الإصدار 9.1 — مسار l-court).
// قائمة واحدة من البطاقات (هاتفًا وحاسوبًا): الكود، العنوان، المحكمة ورقم الدعوى في سطر، الجلسة القادمة،
// وتنبيه «جلسة بلا نتيجة» حين تنتظر جلسة انعقدت تسجيل نتيجتها.
// تُصدِّر أيضًا أدوات عرض صغيرة تستخدمها صفحات المحامي الأخرى (الواجهة ثابتة):
//   bidiText(text), eventDateBox(iso, {muted}), lawsuitRef(m, {prefix}), nextEventText(iso), matterCard(m, {compact})

import { h } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { calendarParts, dateTime, relative, time, dayLabel, num } from '../../../lib/fmt.js';
import { card, badge, codeTag, ltr, emptyState, errorState, icon } from '../../../lib/ui.js';
import { count, matterStatus } from '../../words.js';

// ───────────── أدوات مشتركة لصفحات المحامي ─────────────

/**
 * نص عربي قد يحتوي مصطلحًا لاتينيًا بين قوسين (مثل اسم مكتب محاماة بالإنجليزية):
 * يُعزل الجزء اللاتيني باتجاه LTR ولا يُكسر بين سطرين حتى لا تنقلب الأقواس.
 */
export function bidiText(text) {
  const s = String(text ?? '');
  return s
    .split(/(\([A-Za-z][^()]*\))/)
    .filter((p) => p !== '')
    .map((p) => (/^\([A-Za-z]/.test(p) ? h('span.nowrap', { dir: 'ltr' }, p) : p));
}

/** مربع تاريخ صغير (اليوم والشهر) لبطاقات الجلسات. */
export function eventDateBox(iso, { muted = false } = {}) {
  const p = calendarParts(iso);
  return h('div.event-date', { class: muted && 'pc-date-muted', 'aria-hidden': 'true' }, h('span.d', p.day), h('span.m', p.month));
}

/** «رقم 1874 لسنة 2026» مع عزل الأرقام (prefix=false يحذف كلمة «رقم»). */
export function lawsuitRef(m, { prefix = true } = {}) {
  if (!m || !m.lawsuit_number) return null;
  return h('span.pc-lawsuit', prefix ? 'رقم ' : null, ltr(m.lawsuit_number), m.lawsuit_year ? [' لسنة ', ltr(m.lawsuit_year)] : null);
}

/** الموعد القادم بصيغة مختصرة: «اليوم، 10:00 ص — بعد 3 ساعات». */
export function nextEventText(iso) {
  if (!iso) return h('span.muted', 'لا توجد جلسة قادمة مسجلة');
  return h('span.pc-next', h('time', { datetime: iso, title: dateTime(iso) }, `${dayLabel(iso)}، ${time(iso)}`), h('span.pc-next-rel', relative(iso)));
}

/** بطاقة ملف مستمر مختصرة (للقوائم والصفحة الرئيسية). */
export function matterCard(m, { compact = false } = {}) {
  const pendingN = Number(m.pending_outcomes) || 0;
  return h(
    'a.pc-item-card.lc-matter-card',
    { href: `#/my/matters/${encodeURIComponent(m.id)}`, 'aria-label': `فتح الملف المستمر ${m.code}: ${m.title}` },
    h('div.pc-item-head', codeTag(m.code), m.status !== 'open' && badge(matterStatus(m.status), m.status === 'closed' ? 'neutral' : 'warning')),
    h('div.pc-item-title', m.title),
    h(
      'div.pc-item-meta',
      m.court && h('span', icon('scale', { size: 14 }), m.court),
      !compact && m.lawsuit_number && h('span', icon('fileText', { size: 14 }), lawsuitRef(m)),
    ),
    pendingN ? h('div.lc-card-alert', icon('alert', { size: 14 }), pendingN > 1 ? `${count(pendingN, 'hearing')} بلا نتيجة` : 'جلسة بلا نتيجة — سجّل النتيجة') : null,
    h(
      'div.pc-item-foot',
      h('span', icon('calendar', { size: 14 }), nextEventText(m.next_event_at)),
      Number(m.open_tasks) > 0 && badge(count(m.open_tasks, 'task'), 'info', { icon: 'check' }),
    ),
  );
}

// ───────────── الصفحة ─────────────

export default async function render(ctx) {
  let rows;
  try {
    rows = await api.get('/lawyer/matters');
  } catch (err) {
    return h('div.lc-page', h('h1.page-title', 'الملفات المستمرة'), card({ body: errorState(err, () => ctx.reload()) }));
  }
  rows = Array.isArray(rows) ? rows : [];
  const open = rows.filter((m) => m.status !== 'closed');
  const closed = rows.filter((m) => m.status === 'closed');
  // ما يحتاج تسجيل نتيجة أولًا، ثم الأقرب جلسةً
  open.sort((a, b) => (Number(b.pending_outcomes) > 0) - (Number(a.pending_outcomes) > 0) || String(a.next_event_at || '9').localeCompare(String(b.next_event_at || '9')));

  const header = h('header.lc-head', h('h1.page-title.lc-title', 'الملفات المستمرة'));

  if (!rows.length) {
    return h(
      'div.lc-page',
      header,
      card({
        body: emptyState('عندما تسند إليك الإدارة تمثيلًا أمام القضاء أو عملًا قانونيًا مستمرًا يظهر الملف هنا.', null, { icon: 'gavel', title: 'لا توجد ملفات مستمرة مسندة إليك' }),
      }),
    );
  }

  const list = (items) => h('ul.lc-matter-list', items.map((m) => h('li', matterCard(m))));
  return h(
    'div.lc-page.lc-matters',
    header,
    open.length ? list(open) : card({ body: emptyState('لا توجد ملفات جارية حاليًا.', null, { compact: true, icon: 'gavel' }) }),
    closed.length
      ? h('details.lc-details.lc-closed', h('summary', h('span', `ملفات منتهية (${num(closed.length)})`), icon('chevronDown', { size: 18, className: 'lc-chev' })), h('div.lc-details-body', list(closed)))
      : null,
  );
}

