// بوابة المحامي — «إسناداتي» (الإصدار 9.1 — مسار l-home، L-01): قائمة الإسنادات الحالية والسابقة،
// نُقلت من الصفحة الرئيسية بعد أن صارت «اليوم» قائمة بما هو مطلوب الآن. إسنادات المحامي نفسه فقط.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, date, num } from '../../../lib/fmt.js';
import { card, table, tabs, statusBadge, badge, codeTag, emptyState, errorState, icon } from '../../../lib/ui.js';
import { assignmentStatus, when, count } from '../../words.js';
import { bidiText } from './matters.js';

const TONE = { assigned: 'info', in_progress: 'primary', submitted: 'neutral', returned: 'danger', approved: 'success', withdrawn: 'muted' };

/** شارات قصيرة لكل إسناد حالي (بلا تكرار لكلمة الحالة) */
function flags(a, { history = false } = {}) {
  const out = [];
  if (!history) {
    const fresh = Number(a.unseen_shared_info_requests) || 0;
    if (fresh > 0) out.push(badge(fresh > 1 ? `وصلتك ${count(fresh, ['رد', 'ردان', 'ردود', 'ردًا'])}` : 'وصلك رد', 'success', { icon: 'checkCircle' }));
    if (Number(a.open_info_requests) > 0) out.push(badge(`طلبات عند الإدارة: ${num(a.open_info_requests)}`, 'warning', { icon: 'message' }));
    if (Number(a.open_counsel_requests) > 0) out.push(badge('طلب مساعدة زميل قيد الإجراء', 'accent', { icon: 'users' }));
  }
  if (a.priority === 'urgent' || a.priority === 'high') out.push(statusBadge('priority', a.priority, { icon: 'flag', dot: false }));
  if (a.case_state === 'closed') out.push(badge('الملف مغلق', 'muted', { icon: 'lock' }));
  return out;
}

function statusWord(a) {
  return badge(assignmentStatus(a.status), TONE[a.status] || 'neutral');
}

function dueLine(a) {
  if (!a.due_at) return null;
  return h('span.lh-due', { class: a.overdue && 'is-overdue' }, icon('clock', { size: 14 }), a.overdue ? `كان مطلوبًا ${when(a.due_at)}` : `سلّم قبل ${when(a.due_at)}`);
}

function assignmentCard(a, { history = false } = {}) {
  const f = flags(a, { history });
  return h(
    'a.pc-item-card',
    { href: `#/my/assignments/${encodeURIComponent(a.id)}`, class: a.overdue && 'is-overdue' },
    h('div.pc-item-head', codeTag(a.case_code), statusWord(a)),
    h('div.pc-item-title', a.case_title),
    h('div.pc-item-meta', h('span', icon('book', { size: 14 }), a.legal_area_label || areaLabel(a.legal_area)), h('span', icon('user', { size: 14 }), bidiText(a.role_label || label('assignment_role', a.role)))),
    (!history && a.due_at) || f.length ? h('div.pc-item-foot', !history && dueLine(a), f) : null,
  );
}

function list(rows, ctx, { history = false } = {}) {
  if (!rows.length) {
    return h(
      'div.card-body',
      emptyState(history ? 'لا توجد إسنادات سابقة بعد. تظهر هنا الإسنادات التي اعتمدتها الإدارة أو أغلقت ملفاتها.' : 'لا توجد إسنادات حالية.', null, { icon: history ? 'clock' : 'briefcase', compact: history }),
    );
  }
  const columns = [
    { key: 'case', label: 'الملف', className: 'col-wide', render: (a) => h('div.pc-cell-stack', codeTag(a.case_code), h('span.cell-title', a.case_title)) },
    { key: 'role', label: 'دوري', render: (a) => h('span.pc-role', bidiText(a.role_label || label('assignment_role', a.role))) },
    { key: 'status', label: 'الحالة', render: (a) => statusWord(a) },
    history
      ? { key: 'assigned', label: 'تاريخ الإسناد', render: (a) => h('span.nowrap', date(a.assigned_at)) }
      : { key: 'due', label: 'الموعد', render: (a) => dueLine(a) || h('span.muted', 'بدون موعد') },
    { key: 'flags', label: 'تنبيهات', render: (a) => { const f = flags(a, { history }); return f.length ? h('div.pc-flags', f) : h('span.muted', '—'); } },
  ];
  return frag(
    h('div.pc-only-desktop', table({ columns, rows, onRowClick: (a) => ctx.navigate(`/my/assignments/${a.id}`), rowClass: (a) => (a.overdue ? 'pc-row-overdue' : null), caption: history ? 'الإسنادات السابقة' : 'الإسنادات الحالية' })),
    h('ul.pc-card-list.pc-only-mobile', rows.map((a) => h('li', assignmentCard(a, { history })))),
  );
}

export default async function render(ctx) {
  let active;
  try {
    active = await api.get('/lawyer/assignments', { scope: 'active' });
  } catch (err) {
    return h('div.page', card({ body: errorState(err, () => ctx.reload()) }));
  }
  const rows = Array.isArray(active) ? active : [];
  const t = tabs(
    [
      { key: 'active', label: 'الحالية', icon: 'briefcase', count: rows.length, render: () => list(rows, ctx) },
      {
        key: 'history',
        label: 'السابقة',
        icon: 'clock',
        render: async () => {
          const hist = await api.get('/lawyer/assignments', { scope: 'history' });
          const items = Array.isArray(hist) ? hist : [];
          t.setCount('history', items.length);
          return list(items, ctx, { history: true });
        },
      },
    ],
    { className: 'pc-list-tabs', active: ctx.query.tab === 'history' ? 'history' : 'active' },
  );
  const page = h('div.page.lh-assignments');
  mount(page, h('h1.lh-h1.lh-page-h1', 'إسناداتي'), card({ flush: true, body: t }));
  return page;
}
