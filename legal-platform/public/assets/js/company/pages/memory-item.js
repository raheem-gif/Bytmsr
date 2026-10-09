// الإصدار 10 — عنصر في الذاكرة القانونية `#/memory/item/<id>` (U10-61، U10-62): العنوان، النوع (محدد) والحالة (ممتلئة)،
// البيانات بتسميات الكتالوج، «المواعيد» (بدأ ← آخر موعد للإخطار ← ينتهي، وسجل التجديد التلقائي)، الملخص، المستندات (عرض
// وتنزيل، وإضافة لمن يحق له)، الطلبات المرتبطة الظاهرة، مصدر العنصر وسطر التذكير؛ واختصارات «طلب من هذا العنصر» (?from=<id>).
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { icon, button, badge, toast, errorMessage, confirmDialog, kRow } from '../../lib/ui.js';
import { coMemoryFields, coUploader } from '../../lib/company-forms.js';
import { memoryKindByKey } from '../../lib/company-catalog-fields.js';
import { copy, dayText, whenLong, stageBadge } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { canWrite } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';
import { docItems, textSheet, sheetError, showError } from '../page-kit.js';
import { contractBadge } from './memory-list.js';
import { kindIcon } from './memory.js';

const M = W.memory;
const STATUS_TONE = { active: 'success', renewed: 'success', draft: 'info', under_review: 'info', renewal_in_progress: 'info', threatened: 'warning' };

/** اختصارات الطلبات من العنصر (U10-62) */
function shortcuts(item, requests) {
  const id = encodeURIComponent(item.id);
  const nr = (type) => `#/requests/new/${type}?from=${id}`;
  const list = {
    contract: [
      [M.sc_review, nr('contract_review'), 'fileSignature'],
      [M.sc_renewal, nr('renewal_followup'), 'calendarClock'],
      [M.sc_party, nr('supplier_issue'), 'truck'],
    ],
    licence: [[M.sc_licence, nr('renewal_followup'), 'calendarClock']],
    template: [[M.sc_template, nr(/سري|NDA/i.test(`${item.title} ${item.data?.template_kind || ''}`) || item.data?.template_kind === 'nda' ? 'nda' : 'contract_drafting'), 'filePen']],
    person: [[M.sc_person, nr('board_resolution'), 'userCog']],
    dispute: [[M.sc_dispute, requests?.[0] ? `#/requests/${encodeURIComponent(requests[0].code)}?focus=messages` : nr('dispute'), 'scale']],
  }[item.kind];
  return list || [];
}

function datesBlock(item) {
  const d = item.dates || {};
  const rows = [];
  if (d.start_date) rows.push([copy('memory.started', { date: dayText(d.start_date, { year: true }) }), 'checkCircle']);
  if (d.notice_deadline) rows.push([copy('memory.notice', { date: dayText(d.notice_deadline, { year: true }) }), 'alert', 'is-warn']);
  if (d.end_date) rows.push([copy('memory.ends', { date: dayText(d.end_date, { year: true }) }), 'clock']);
  if (d.next_date && !d.end_date && !d.notice_deadline) rows.push([copy('memory.next', { date: dayText(d.next_date, { year: true }) }), 'calendar']);
  for (const x of d.history || []) rows.push([copy('memory.renewed', { to: dayText(x.to, { year: true }), at: dayText(String(x.at || '').slice(0, 10), { year: true }) }), 'refresh']);
  if (!rows.length) return null;
  return sectionCard(
    M.dates_title,
    h(
      'div',
      h('ol.co-mem-dates', rows.map(([t, ic, cls]) => h('li', { class: cls }, h('span.co-mem-date-icon', { 'aria-hidden': 'true' }, icon(ic, { size: 16 })), h('span', t)))),
      item.reminder_text ? h('p.co-muted.co-mem-reminder', icon('bell', { size: 14 }), h('span', item.reminder_text)) : null,
    ),
  );
}

function addDocsSheet(item, ctx) {
  const left = Math.max(0, 10 - (item.documents_count || 0));
  const up = coUploader({ max: 5, perRequestLeft: left, capture: true });
  const err = sheetError();
  textSheet({
    title: M.add_docs,
    dirty: () => up.uploadIds().length > 0 || up.pending() > 0,
    body: h('div.co-sheet-body', up.el, err),
    actions: [
      {
        label: W.docs.upload,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (up.pending()) {
            showError(err, W.uploader.wait);
            return false;
          }
          if (!up.uploadIds().length) return false;
          try {
            await api.post(`/company/memory/${encodeURIComponent(item.id)}/documents`, { upload_ids: up.uploadIds() });
          } catch (e) {
            showError(err, errorMessage(e));
            return false;
          }
          toast(W.docs.added, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

export default async function memoryItem(ctx) {
  const parent = { label: W.nav.memory, href: '#/memory' };
  let res;
  try {
    res = await api.get(`/company/memory/${encodeURIComponent(ctx.params.id)}`);
  } catch (err) {
    return errorView(W.nav.memory, err, () => ctx.reload(), parent);
  }
  const item = res.item;
  const kind = memoryKindByKey(item.kind);
  ctx.setTitle(item.title);
  if (kind) window.dispatchEvent(new CustomEvent('co:back', { detail: { label: kind.list_label, href: item.kind === 'key_date' ? '#/memory/calendar' : `#/memory/${kind.slug}` } }));
  const can = item.can || {};
  const writable = canWrite();
  const actions = writable
    ? [
        can.edit ? button(M.edit, { variant: 'secondary', icon: 'edit', href: `#/memory/item/${encodeURIComponent(item.id)}/edit` }) : null,
        can.archive
          ? button(M.archive, {
              variant: 'ghost',
              onClick: async () => {
                const ok = await confirmDialog({ title: copy('memory.archive_title', { title: item.title }), message: M.archive_text, confirmLabel: M.archive, cancelLabel: M.cancel, danger: true });
                if (!ok) return;
                try {
                  await api.post(`/company/memory/${encodeURIComponent(item.id)}/archive`, {});
                } catch (e) {
                  return toast(errorMessage(e), 'danger', 6000);
                }
                toast(M.archived_toast, 'success');
                ctx.navigate(kind ? `/memory/${kind.slug}` : '/memory');
              },
            })
          : null,
      ].filter(Boolean)
    : [];
  const badges = h(
    'div.co-badges',
    badge(item.kind_label, 'primary', { className: 'co-badge' }),
    badge(item.status_label || item.status, STATUS_TONE[item.status] || 'neutral', { className: 'co-badge', icon: STATUS_TONE[item.status] === 'warning' ? 'alert' : null }),
    item.kind === 'contract' ? contractBadge(item) : null,
    item.archived ? badge(M.archived, 'neutral', { className: 'co-badge' }) : null,
    item.access === 'admins' ? badge(item.access_label, 'neutral', { className: 'co-badge', icon: 'lock' }) : null,
  );
  const prov = item.created_by?.kind === 'user' ? copy('memory.by_user', { name: item.created_by.name, date: whenLong(item.created_at, { time: false }) }) : copy('memory.by_team', { date: whenLong(item.created_at, { time: false }) });
  const source = item.source_request?.code ? h('span', ' · ', M.from_request, ' ', h('a.co-link', { href: `#/requests/${encodeURIComponent(item.source_request.code)}` }, h('bdi', { dir: 'ltr' }, item.source_request.code))) : null;
  const sc = writable && can.start_request ? shortcuts(item, res.requests) : [];
  const docsAdd = writable && can.add_documents && (item.documents_count || 0) < 10 ? button(M.add_docs, { variant: 'secondary', size: 'sm', icon: 'plus', onClick: () => addDocsSheet(item, ctx) }) : null;
  const main = h(
    'div.co-col-main',
    item.status === 'under_review' ? h('div.co-state-note', icon('info', { size: 18 }), h('p', M.under_review)) : null,
    sectionCard(M.details, h('div', coMemoryFields(item), item.summary ? [h('p.co-card-label', M.summary), h('p.co-desc', { dir: 'auto' }, item.summary)] : null)),
    sectionCard(M.documents, docItems(res.documents || [], { origin: (d) => (d.from === 'company' ? W.docs.from_company : W.docs.from_team), empty: W.docs.empty }), { actions: docsAdd }),
    res.requests?.length
      ? sectionCard(M.requests, h('ul.k-list', res.requests.map((r) => h('li', kRow({ icon: 'inbox', title: h('span', { dir: 'auto' }, r.title), sub: h('bdi', { dir: 'ltr' }, r.code), badges: stageBadge(r.stage, { short: true }), href: `#/requests/${encodeURIComponent(r.code)}`, className: 'co-row' })))))
      : null,
  );
  const aside = h(
    'aside.co-col-aside',
    datesBlock(item),
    sc.length ? sectionCard(M.shortcuts, h('ul.k-list', sc.map(([label, href, ic]) => h('li', kRow({ icon: ic, title: label, href }))))) : null,
  );
  return h(
    'div.co-page.co-mem-item',
    pageHead(h('span', { dir: 'auto' }, item.title), null, { actions: actions.length ? h('div.co-row-actions', actions) : null }),
    h('div.co-mem-head', h('span.co-mem-kind-icon', { 'aria-hidden': 'true' }, kindIcon(item.kind)), badges),
    h('p.co-muted.co-mem-prov', prov, source),
    h('div.co-columns', main, aside),
  );
}
