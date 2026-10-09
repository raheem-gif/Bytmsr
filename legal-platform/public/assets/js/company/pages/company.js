// الإصدار 10 — «بيانات الشركة» `#/company` (U10-78 مع §8.3 وL-62): الاسم (يعدّله فريقكم القانوني) والاسم القانوني والسجل
// والبطاقة الضريبية والعنوان والنشاط والحجم والباقة و«مدير علاقتكم لدينا» (الصف يختفي بلا اسم) و«الجهة المتعاقدة»؛ ومدير البوابة
// يعدّل الحقول المسموحة بورقة (P1). «الكيانات ‹» إلى صفحتها.
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { icon, button, kv, field, toast, errorMessage } from '../../lib/ui.js';
import { copy, countOf } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { isAdmin, readOnly } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';
import { textSheet, sheetError, showError } from '../page-kit.js';

const F = W.profile;
const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];

function editSheet(p, ctx) {
  const mk = (v, { dir = 'auto', max = 200 } = {}) => {
    const el = h('input.input', { type: 'text', dir, maxlength: max, autocomplete: 'off' });
    el.value = v || '';
    return el;
  };
  const legal = mk(p.legal_name);
  const cr = mk(p.commercial_registry, { dir: 'ltr', max: 60 });
  const tax = mk(p.tax_id, { dir: 'ltr', max: 60 });
  const address = h('textarea.input', { rows: 2, dir: 'auto', maxlength: 500 });
  address.value = p.address || '';
  const industry = mk(p.industry, { max: 120 });
  const size = h('select.input', h('option', { value: '' }, '—'), SIZES.map((s) => h('option', { value: s }, F.sizes[s])));
  size.value = p.size_band || '';
  const all = [legal, cr, tax, address, industry];
  const initial = JSON.stringify(all.map((x) => x.value));
  const err = sheetError();
  textSheet({
    title: F.edit_title,
    dirty: () => JSON.stringify(all.map((x) => x.value)) !== initial,
    body: h('div.co-sheet-body', field(F.legal_name, legal), field(F.cr, cr), field(F.tax, tax), field(F.address, address, { full: true }), field(F.industry, industry), field(F.size, h('div.select-wrap', size)), err),
    actions: [
      {
        label: F.save,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          try {
            await api.patch('/company/profile', { legal_name: legal.value.trim(), commercial_registry: cr.value.trim(), tax_id: tax.value.trim(), address: address.value.trim(), industry: industry.value.trim(), size_band: size.value || null });
          } catch (e) {
            showError(err, errorMessage(e));
            return false;
          }
          toast(F.saved, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

export default async function companyPage(ctx) {
  let p;
  try {
    p = await api.get('/company/profile');
  } catch (err) {
    return errorView(W.nav.company, err, () => ctx.reload());
  }
  const dash = '—';
  const ltr = (v) => (v ? h('bdi', { dir: 'ltr' }, v) : dash);
  const pairs = [
    [F.name, h('span', h('span', { dir: 'auto' }, p.name), h('span.co-muted', ` — ${F.name_hint}`))],
    [F.legal_name, p.legal_name ? h('span', { dir: 'auto' }, p.legal_name) : dash],
    [F.cr, ltr(p.commercial_registry)],
    [F.tax, ltr(p.tax_id)],
    [F.address, p.address ? h('span', { dir: 'auto' }, p.address) : dash],
    [F.industry, p.industry ? h('span', { dir: 'auto' }, p.industry) : dash],
    [F.size, p.size_band ? F.sizes[p.size_band] || p.size_band : dash],
    [F.plan, p.plan_label ? h('bdi', p.plan_label) : dash],
    [F.status, p.status_label || dash],
  ];
  if (p.account_manager?.name) pairs.push([W.nav.manager_label, p.account_manager.name]);
  const ce = p.contracting_entity;
  const edit = isAdmin() && p.can_edit && !readOnly() ? button(F.edit, { variant: 'secondary', icon: 'edit', onClick: () => editSheet(p, ctx) }) : null;
  return h(
    'div.co-page.co-company',
    pageHead(W.nav.company, F.sub, { actions: edit }),
    sectionCard(null, kv(pairs, { className: 'co-fields-kv' })),
    ce?.legal_name ? h('p.co-contracting', icon('landmark', { size: 16 }), h('span', ce.registration ? copy('plan.contracting', { legal_name: ce.legal_name, registration: ce.registration }) : copy('plan.contracting_plain', { legal_name: ce.legal_name }))) : null,
    h('ul.k-list.co-more-info', h('li', h('a.k-row', { href: '#/memory/entities' }, h('span.k-row-icon', { 'aria-hidden': 'true' }, icon('building', { size: 22 })), h('span.k-row-main', h('span.k-row-title', F.entities), h('span.k-row-sub', countOf(p.entities_count ?? 0, 'entity'))), h('span.k-row-chevron', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 20 }))))),
  );
}
