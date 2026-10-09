// الإصدار 10 — «الكيانات» `#/memory/entities` (U10-65): الاسم · الشكل القانوني · العلاقة · السجل التجاري، والعدّاد «{n} من
// {max} في باقتكم». مدير البوابة يضيف ويعدّل بورقة (تسأل قبل تجاهل ما كُتب)؛ عند الحد الأقصى جملة تواصل بدل الزر.
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta } from '../../lib/fmt.js';
import { button, badge, kRow, field, toast, errorMessage, emptyState } from '../../lib/ui.js';
import { copy } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { S, isAdmin, readOnly } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';
import { textSheet, sheetError, showError } from '../page-kit.js';

const M = W.memory;
const labels = (g) => getMeta()?.constants?.LABELS?.[g] || {};

function entitySheet(entity, all, ctx) {
  const editing = !!entity;
  const input = (v = '', opts = {}) => {
    const el = h('input.input', { type: 'text', dir: 'auto', maxlength: opts.max || 200, autocomplete: 'off' });
    el.value = v || '';
    return el;
  };
  const select = (opts, v, { none = false } = {}) => {
    const el = h('select.input', none ? h('option', { value: '' }, M.e_none) : null, opts.map(([k, l]) => h('option', { value: String(k) }, l)));
    el.value = v == null ? '' : String(v);
    return h('div.select-wrap', el);
  };
  const name = input(entity?.name);
  const nameWrap = field(M.e_name, name, { required: true });
  name.setAttribute('aria-required', 'true');
  const form = select(Object.entries(labels('legal_form')), entity?.legal_form || 'llc');
  const relOpts = Object.entries(labels('company_entity_relation')).filter(([k]) => (entity?.relation === 'parent' ? k === 'parent' : k !== 'parent'));
  const rel = select(relOpts, entity?.relation || 'subsidiary');
  const parentSel = select(all.filter((e) => e.id !== entity?.id).map((e) => [e.id, e.name]), entity?.parent_entity_id ?? '', { none: true });
  const cr = input(entity?.commercial_registry, { max: 60 });
  const tax = input(entity?.tax_id, { max: 60 });
  const jur = input(entity?.jurisdiction, { max: 100 });
  for (const el of [cr, tax]) el.setAttribute('dir', 'ltr');
  const err = sheetError();
  // J-20/K11: القوائم (الشكل القانوني والعلاقة والكيان الأم) جزء من فحص «تجاهل ما كتبتموه؟» كالحقول النصية
  const snapshot = () => JSON.stringify([name.value, cr.value, tax.value, jur.value, ...[form, rel, parentSel].map((w) => w.querySelector('select').value)]);
  const initial = snapshot();
  textSheet({
    title: editing ? M.entity_edit : M.entity_sheet,
    dirty: () => snapshot() !== initial,
    body: h('div.co-sheet-body', nameWrap, field(M.e_form, form), field(M.e_relation, rel), entity?.relation === 'parent' ? null : field(M.e_parent, parentSel), field(M.e_cr, cr), field(M.e_tax, tax), field(M.e_jurisdiction, jur), err),
    actions: [
      {
        label: M.save,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (!name.value.trim()) {
            nameWrap.setError(M.e_name_required);
            name.focus();
            return false;
          }
          const body = {
            name: name.value.trim(),
            legal_form: form.querySelector('select').value || null,
            commercial_registry: cr.value.trim(),
            tax_id: tax.value.trim(),
            jurisdiction: jur.value.trim(),
          };
          if (entity?.relation !== 'parent') {
            body.relation = rel.querySelector('select').value;
            body.parent_entity_id = parentSel.querySelector('select').value ? Number(parentSel.querySelector('select').value) : null;
          }
          try {
            if (editing) await api.patch(`/company/entities/${encodeURIComponent(entity.id)}`, body);
            else await api.post('/company/entities', body);
          } catch (e) {
            const f = e?.details?.fields || {};
            if (f.name) nameWrap.setError(f.name);
            showError(err, errorMessage(e));
            return false;
          }
          toast(M.saved, 'success');
          ctx.reload();
          return true;
        },
      },
    ],
  });
}

export default async function entities(ctx) {
  const parent = { label: W.nav.memory, href: '#/memory' };
  let res;
  try {
    res = await api.get('/company/entities');
  } catch (err) {
    return errorView(W.nav.entities, err, () => ctx.reload(), parent);
  }
  const items = res.items || [];
  const max = res.max_entities;
  const active = items.filter((e) => e.status !== 'inactive').length;
  const atMax = max != null && active >= max;
  const admin = isAdmin() && !readOnly();
  const counter = h('p.co-muted.num', copy('memory.entities_line', { n: active, max: max ?? '—' }));
  const add = admin && !atMax ? button(M.add_entity, { variant: 'secondary', icon: 'plus', onClick: () => entitySheet(null, items, ctx) }) : null;
  const rows = items.map((e) =>
    h(
      'li',
      kRow({
        icon: 'building',
        title: h('span', { dir: 'auto' }, e.name),
        sub: [e.legal_form_label || '', e.commercial_registry ? ` · ${copy('memory.e_cr_line', { cr: e.commercial_registry })}` : '', e.jurisdiction ? ` · ${e.jurisdiction}` : ''],
        badges: badge(e.relation_label || e.relation, 'primary', { className: 'co-badge' }),
        trailing: admin ? button(M.edit, { variant: 'ghost', size: 'sm', onClick: () => entitySheet(e, items, ctx), ariaLabel: `${M.edit}: ${e.name}` }) : null,
        className: 'co-row',
      }),
    ),
  );
  const mgr = S.home?.account_manager?.name;
  return h(
    'div.co-page.co-entities',
    pageHead(W.nav.entities, M.entities_sub, { actions: add }),
    counter,
    admin && atMax ? h('p.co-card-note', h('span', mgr ? M.at_max : M.at_max_team)) : null,
    sectionCard(null, items.length ? h('ul.k-list', rows) : emptyState(M.empty_list, null, { icon: 'building' })),
  );
}
