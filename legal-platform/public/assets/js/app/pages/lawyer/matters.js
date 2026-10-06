// بوابة المحامي — الملفات المستمرة: التمثيل القضائي والعمل القانوني المستمر المسند للمحامي.
// تُصدِّر أيضًا أدوات عرض صغيرة تستخدمها صفحتا «ملفاتي» و«ملف مستمر».

import { h, frag } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { calendarParts, dateTime, relative, time, dayLabel, num } from '../../../lib/fmt.js';
import { pageHeader, card, table, statusBadge, badge, codeTag, ltr, emptyState, errorState, alertBox, icon } from '../../../lib/ui.js';

// ───────────── أدوات مشتركة لصفحات المحامي ─────────────

/**
 * نص عربي يحتوي مصطلحًا إنجليزيًا بين قوسين مثل «المحامي الأساسي (Lead Counsel)»:
 * يُعزل الجزء الإنجليزي باتجاه LTR ولا يُكسر بين سطرين حتى لا تنقلب الأقواس.
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
  return h(
    'div.event-date',
    { class: muted && 'pc-date-muted', 'aria-hidden': 'true' },
    h('span.d', p.day),
    h('span.m', p.month),
  );
}

/** «رقم الدعوى 1874 لسنة 2026» مع عزل الأرقام. */
export function lawsuitRef(m) {
  if (!m || !m.lawsuit_number) return null;
  return h('span.pc-lawsuit', 'رقم ', ltr(m.lawsuit_number), m.lawsuit_year ? [' لسنة ', ltr(m.lawsuit_year)] : null);
}

/** الموعد القادم بصيغة مختصرة: «اليوم، 10:00 ص — بعد 3 ساعات». */
export function nextEventText(iso) {
  if (!iso) return h('span.muted', 'لا يوجد موعد قادم مسجل');
  return h(
    'span.pc-next',
    h('time', { datetime: iso, title: dateTime(iso) }, `${dayLabel(iso)}، ${time(iso)}`),
    h('span.pc-next-rel', relative(iso)),
  );
}

/** بطاقة ملف مستمر مختصرة (للجوال وللعمود الجانبي). */
export function matterCard(m, { compact = false } = {}) {
  return h(
    'a.pc-item-card',
    { href: `#/my/matters/${encodeURIComponent(m.id)}`, 'aria-label': `فتح الملف المستمر ${m.code}: ${m.title}` },
    h(
      'div.pc-item-head',
      codeTag(m.code),
      !compact && statusBadge('matter_kind', m.kind),
      m.status !== 'open' && statusBadge('matter_status', m.status),
    ),
    h('div.pc-item-title', m.title),
    h(
      'div.pc-item-meta',
      m.court && h('span', icon('scale', { size: 14 }), m.court),
      !compact && m.lawsuit_number && h('span', icon('fileText', { size: 14 }), lawsuitRef(m)),
    ),
    h(
      'div.pc-item-foot',
      h('span', icon('calendar', { size: 14 }), nextEventText(m.next_event_at)),
      Number(m.open_tasks) > 0 && badge(`مهام مفتوحة: ${num(m.open_tasks)}`, 'info', { icon: 'check' }),
    ),
  );
}

// ───────────── الصفحة ─────────────

const CRUMBS = [{ label: 'بوابة المحامي', href: '#/my' }, { label: 'الملفات المستمرة' }];

export default async function render(ctx) {
  let rows;
  try {
    rows = await api.get('/lawyer/matters');
  } catch (err) {
    return frag(pageHeader({ title: 'الملفات المستمرة', breadcrumbs: CRUMBS }), card({ body: errorState(err, () => ctx.reload()) }));
  }
  rows = Array.isArray(rows) ? rows : [];
  const open = rows.filter((m) => m.status !== 'closed');
  const closed = rows.filter((m) => m.status === 'closed');

  const header = pageHeader({
    title: 'الملفات المستمرة',
    subtitle: 'ملفات التمثيل القضائي والعمل القانوني المستمر المسندة إليك بصفتك المحامي المسؤول.',
    breadcrumbs: CRUMBS,
  });

  const note = alertBox(
    'سجّل الجلسات والمواعيد والمهام الإجرائية أولًا بأول. تتولى بيوت مصر التواصل مع العميل، ويرسل النظام له تذكيرًا آليًا قبل أي موعد يلزم حضوره فيه.',
    'info',
    { icon: 'zap' },
  );

  if (!rows.length) {
    return frag(
      header,
      note,
      card({
        body: emptyState(
          'عندما تتحول استشارة إلى تمثيل أمام القضاء أو عمل قانوني مستمر وتسندك الإدارة إليه، سيظهر الملف هنا.',
          null,
          { icon: 'gavel', title: 'لا توجد ملفات مستمرة مسندة إليك' },
        ),
      }),
    );
  }

  const go = (m) => ctx.navigate(`/my/matters/${m.id}`);
  const columns = [
    {
      key: 'code',
      label: 'الملف',
      render: (m) => h('div.pc-cell-stack', codeTag(m.code), h('span.cell-title', m.title)),
      className: 'col-wide',
    },
    { key: 'kind', label: 'النوع', render: (m) => statusBadge('matter_kind', m.kind) },
    { key: 'court', label: 'المحكمة / رقم الدعوى', render: (m) => h('div.pc-cell-stack', h('span', m.court || '—'), m.lawsuit_number && h('span.cell-sub', lawsuitRef(m))) },
    { key: 'next', label: 'الموعد القادم', render: (m) => nextEventText(m.next_event_at) },
    { key: 'tasks', label: 'مهام مفتوحة', align: 'center', render: (m) => (Number(m.open_tasks) ? badge(num(m.open_tasks), 'info') : h('span.muted', '0')) },
    { key: 'status', label: 'الحالة', render: (m) => statusBadge('matter_status', m.status) },
  ];

  const block = (list, title, emptyText) =>
    card({
      title,
      subtitle: list.length ? `عدد الملفات: ${num(list.length)}` : null,
      icon: 'gavel',
      flush: true,
      body: list.length
        ? frag(
            h('div.pc-only-desktop', table({ columns, rows: list, onRowClick: go, caption: title })),
            h('ul.pc-card-list.pc-only-mobile', list.map((m) => h('li', matterCard(m)))),
          )
        : h('div.card-body', emptyState(emptyText, null, { compact: true, icon: 'gavel' })),
    });

  return frag(
    header,
    note,
    block(open, 'الملفات الجارية', 'لا توجد ملفات جارية حاليًا'),
    closed.length ? block(closed, 'ملفات منتهية', '') : null,
  );
}
