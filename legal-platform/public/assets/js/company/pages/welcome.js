// الإصدار 10 — الترحيب `#/welcome` (U10-19، P1): أول مدير بوابة، مرة واحدة، وكل خطوة يمكن تخطيها («لاحقًا» يترك الباقي بطاقة
// إعداد على «المتابعة»). الخطوة في رابط الصفحة (?step=) فيعيد زر الرجوع في المتصفح الخطوة السابقة. 0 الترحيب ← 1 بيانات الشركة ←
// 2 الكيانات ← 3 دعوة الزملاء ← «جاهزون.». الدعوات التي لا تُرسل بالبريد تُعرض روابطها مرة واحدة للنسخ.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta } from '../../lib/fmt.js';
import { icon, button, badge, field, toast, errorMessage, setBusy, wordmark } from '../../lib/ui.js';
import { copy } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { S, setItem } from '../state.js';
import { errorView } from '../common.js';
import { sheetError, showError } from '../page-kit.js';

const WL = W.welcome;
const SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];
const ROLES = ['company_admin', 'member', 'viewer'];
const roleLabel = (r) => ({ company_admin: 'مدير البوابة', member: 'عضو', viewer: 'اطلاع فقط' })[r] || r;
const seenKey = () => `ek.co.setup:${S.user?.id}:welcome`;

/** «لاحقًا»/الانتهاء: لا يعود الترحيب تلقائيًا (بطاقة الإعداد على «المتابعة» تكمل الباقي) */
function finish(ctx, to = '/overview') {
  setItem('localStorage', seenKey(), '1');
  ctx.navigate(to);
}

const input = (v = '', { dir = 'auto', max = 200, type = 'text' } = {}) => {
  const el = h('input.input', { type, dir, maxlength: max, autocomplete: 'off' });
  el.value = v || '';
  return el;
};

function frame(step, title, ...children) {
  return h(
    'div.co-page.co-welcome',
    h(
      'section.co-welcome-card',
      step > 0 ? h('p.co-welcome-progress.num', copy('welcome.progress', { i: step })) : h('div.co-welcome-brand', wordmark({ size: 'lg', tone: 'light', descriptor: W.brand.tagline_ar })),
      h('h1.co-h1', { tabindex: '-1' }, title),
      ...children,
    ),
  );
}

async function stepCompany(ctx, go) {
  let p;
  try {
    p = await api.get('/company/profile');
  } catch (err) {
    return errorView(WL.s1, err, () => ctx.reload());
  }
  const F = W.profile;
  const legal = input(p.legal_name);
  const cr = input(p.commercial_registry, { dir: 'ltr', max: 60 });
  const tax = input(p.tax_id, { dir: 'ltr', max: 60 });
  const address = input(p.address, { max: 500 });
  const industry = input(p.industry, { max: 120 });
  const size = h('select.input', h('option', { value: '' }, '—'), SIZES.map((s) => h('option', { value: s }, F.sizes[s])));
  size.value = p.size_band || '';
  const all = [legal, cr, tax, address, industry, size];
  const initial = JSON.stringify(all.map((x) => x.value));
  const err = sheetError();
  const primary = button(WL.correct, { variant: 'primary', size: 'lg' });
  const sync = () => {
    const edited = JSON.stringify(all.map((x) => x.value)) !== initial;
    primary.querySelector('.btn-label').textContent = edited ? WL.save_next : WL.correct;
  };
  for (const x of all) x.addEventListener('input', sync);
  size.addEventListener('change', sync);
  primary.addEventListener('click', async () => {
    showError(err, '');
    if (JSON.stringify(all.map((x) => x.value)) !== initial) {
      setBusy(primary, true);
      try {
        await api.patch('/company/profile', { legal_name: legal.value.trim(), commercial_registry: cr.value.trim(), tax_id: tax.value.trim(), address: address.value.trim(), industry: industry.value.trim(), size_band: size.value || null });
      } catch (e) {
        showError(err, errorMessage(e));
        return;
      } finally {
        setBusy(primary, false);
      }
    }
    go(2);
  });
  return frame(
    1,
    WL.s1,
    h('p.co-muted', WL.s1_hint),
    h('div.co-welcome-form', field(F.legal_name, legal), field(F.cr, cr), field(F.tax, tax), field(F.address, address), field(F.industry, industry), field(F.size, h('div.select-wrap', size)), err),
    h('div.co-welcome-actions', primary, button(WL.later, { variant: 'ghost', onClick: () => finish(ctx) })),
  );
}

async function stepEntities(ctx, go) {
  let res;
  try {
    res = await api.get('/company/entities');
  } catch (err) {
    return errorView(WL.s2, err, () => ctx.reload());
  }
  const L = getMeta()?.constants?.LABELS || {};
  const list = h('ul.k-list.co-welcome-entities');
  const counter = h('p.co-muted.num');
  const items = [...(res.items || [])];
  const render = () => {
    mount(list, items.map((e) => h('li.co-welcome-entity', h('span', { dir: 'auto' }, e.name), badge(e.relation_label || L.company_entity_relation?.[e.relation] || e.relation, 'primary', { className: 'co-badge' }))));
    counter.textContent = copy('welcome.s2_count', { n: items.length, max: res.max_entities ?? '—' });
    addBox.hidden = res.max_entities != null && items.length >= res.max_entities;
  };
  const name = input('');
  const nameWrap = field(W.memory.e_name, name, { required: true });
  const form = h('select.input', Object.entries(L.legal_form || {}).map(([k, l]) => h('option', { value: k }, l)));
  const rel = h('select.input', ['subsidiary', 'affiliate', 'branch'].map((k) => h('option', { value: k }, L.company_entity_relation?.[k] || k)));
  const cr = input('', { dir: 'ltr', max: 60 });
  const err = sheetError();
  const add = button(W.memory.add_entity, {
    variant: 'secondary',
    icon: 'plus',
    onClick: async () => {
      showError(err, '');
      if (!name.value.trim()) return nameWrap.setError(W.memory.e_name_required);
      setBusy(add, true);
      try {
        const r = await api.post('/company/entities', { name: name.value.trim(), legal_form: form.value, relation: rel.value, commercial_registry: cr.value.trim() });
        items.push(r.entity);
        name.value = '';
        cr.value = '';
        nameWrap.setError('');
        render();
      } catch (e) {
        showError(err, errorMessage(e));
      } finally {
        setBusy(add, false);
      }
    },
  });
  const addBox = h('div.co-welcome-form.co-welcome-add', nameWrap, field(W.memory.e_form, h('div.select-wrap', form)), field(W.memory.e_relation, h('div.select-wrap', rel)), field(W.memory.e_cr, cr), err, h('div', add));
  render();
  return frame(
    2,
    WL.s2,
    h('p', WL.s2_q),
    list,
    counter,
    addBox,
    h('div.co-welcome-actions', button(WL.next, { variant: 'primary', size: 'lg', onClick: () => go(3) }), button(WL.no_entities, { variant: 'ghost', onClick: () => go(3) })),
  );
}

function stepTeam(ctx, go) {
  const rows = [1, 2, 3].map((i) => {
    const name = input('', { max: 120 });
    const email = input('', { dir: 'ltr', type: 'email' });
    email.placeholder = 'name@company.com';
    const role = h('select.input', ROLES.map((r) => h('option', { value: r }, roleLabel(r))));
    role.value = 'member';
    return { name, email, role, el: h('fieldset.co-welcome-row', h('legend', copy('welcome.row', { i })), field(W.team.name, name), field(W.team.email, email), field(W.team.role, h('div.select-wrap', role))) };
  });
  const help = h('details.co-details', h('summary', W.team.roles_help), h('ul.co-checks', ROLES.map((r) => h('li', h('strong', roleLabel(r)), ' — ', W.team[`role_${r}`]))));
  const err = sheetError();
  const links = h('div.co-welcome-links');
  const send = button(WL.send_invites, { variant: 'primary', size: 'lg' });
  send.addEventListener('click', async () => {
    showError(err, '');
    const todo = rows.filter((r) => r.name.value.trim() || r.email.value.trim());
    if (!todo.length) return go(4);
    setBusy(send, true);
    const copies = [];
    for (const r of todo) {
      try {
        const res = await api.post('/company/team/invite', { name: r.name.value.trim(), email: r.email.value.trim(), role: r.role.value });
        if (res.invite && !res.invite.emailed && res.invite.url) copies.push([r.name.value.trim(), res.invite.url]);
        r.el.hidden = true;
      } catch (e) {
        showError(err, `${r.name.value.trim() || r.email.value.trim()}: ${errorMessage(e)}`);
      }
    }
    setBusy(send, false);
    if (copies.length) {
      mount(
        links,
        h('p', WL.copy_links),
        h('ul.co-welcome-copy', copies.map(([n, url]) => h('li', h('span', { dir: 'auto' }, n), h('input.input', { type: 'text', readonly: true, dir: 'ltr', value: url, 'aria-label': n }), button(W.team.copy_link, { variant: 'secondary', size: 'sm', icon: 'copy', onClick: async () => { try { await navigator.clipboard.writeText(url); toast(W.team.copied, 'success'); } catch { /* حدّدوا النص */ } } })))),
        button(WL.next, { variant: 'primary', onClick: () => go(4) }),
      );
      return;
    }
    if (!err.textContent) go(4);
  });
  return frame(3, WL.s3, h('p', WL.s3_text), h('div.co-welcome-form', rows.map((r) => r.el), help, err), links, h('div.co-welcome-actions', send, button(WL.later, { variant: 'ghost', onClick: () => finish(ctx) })));
}

function stepDone(ctx) {
  setItem('localStorage', seenKey(), '1');
  return frame(
    4,
    WL.done,
    h('span.co-done-icon', { 'aria-hidden': 'true' }, icon('checkCircle', { size: 48 })),
    h('p', WL.done_text),
    h(
      'div.co-welcome-actions',
      button(W.nav.new_request, { variant: 'accent', icon: 'plus', size: 'lg', href: '#/requests/new' }),
      button(WL.add_contract, { variant: 'secondary', icon: 'plus', href: '#/memory/new/contracts' }),
      button(WL.to_overview, { variant: 'ghost', href: '#/overview' }),
    ),
  );
}

export default async function welcome(ctx) {
  const step = Math.max(0, Math.min(4, Number(ctx.query.step) || 0));
  const go = (n) => ctx.navigate(`/welcome?step=${n}`);
  if (step === 1) return stepCompany(ctx, go);
  if (step === 2) return stepEntities(ctx, go);
  if (step === 3) return stepTeam(ctx, go);
  if (step === 4) return stepDone(ctx);
  const plan = S.home?.company?.plan?.name || S.company?.plan_label || '';
  return frame(
    0,
    WL.s0_title,
    h('p.co-welcome-plan', copy('welcome.s0_plan', { company: S.company?.name || '', plan })),
    h('p', WL.s0_text),
    h('div.co-welcome-actions', button(WL.start, { variant: 'primary', size: 'lg', onClick: () => go(1) }), button(WL.later, { variant: 'ghost', onClick: () => finish(ctx) })),
  );
}
