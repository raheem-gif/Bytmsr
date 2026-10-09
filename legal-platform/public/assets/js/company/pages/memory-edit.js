// الإصدار 10 — إضافة عنصر إلى الذاكرة القانونية أو تعديله (U10-63): نموذج النوع من الكتالوج المشترك (coMemoryForm، نفسه عند
// فريق المكتب)، وتحقق مبكر/متأخر، و«آخر موعد للإخطار» يُحسب أثناء الكتابة للعقود. المستندات عند الإضافة تُرفع على مراحل
// (upload_ids ≤ 5؛ النموذج المعتمد يحتاج ملفه). العضو يضيف العقود والنماذج والتراخيص والمواعيد فقط، و«مَن يراه» لمديري البوابة.
import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toast, field, button } from '../../lib/ui.js';
import { coMemoryForm, coUploader } from '../../lib/company-forms.js';
import { memoryKindBySlug, memoryKindByKey } from '../../lib/company-catalog-fields.js';
import { copy } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { isAdmin } from '../state.js';
import { pageHead, errorView, notFoundView } from '../common.js';

const M = W.memory;

export default async function memoryEdit(ctx) {
  const parent = { label: W.nav.memory, href: '#/memory' };
  const editing = !!ctx.params.id;
  let item = null;
  let kind;
  let ents = [];
  let cps = [];
  try {
    const [it, e, c] = await Promise.all([
      editing ? api.get(`/company/memory/${encodeURIComponent(ctx.params.id)}`).then((r) => r.item) : null,
      api.get('/company/entities').then((r) => r.items || []).catch(() => []),
      api.get('/company/counterparties').then((r) => r.items || []).catch(() => []),
    ]);
    item = it;
    ents = e.filter((x) => x.status !== 'inactive');
    cps = c;
  } catch (err) {
    return errorView(W.nav.memory, err, () => ctx.reload(), parent);
  }
  kind = editing ? memoryKindByKey(item.kind) : memoryKindBySlug(ctx.params.slug);
  if (!kind) return errorView(W.nav.memory, { status: 404 }, null, parent);
  const back = editing ? { label: item.title, href: `#/memory/item/${encodeURIComponent(item.id)}` } : { label: kind.list_label, href: kind.key === 'key_date' ? '#/memory/calendar' : `#/memory/${kind.slug}` };
  window.dispatchEvent(new CustomEvent('co:back', { detail: back }));
  if (editing && !item.can?.edit) return notFoundView(back, { title: W.state.not_found, text: W.state.admins_action });
  if (!editing && !isAdmin() && !kind.member_writable) return notFoundView(back, { title: W.state.not_found, text: M.not_allowed });

  const title = editing ? copy('memory.edit_title', { title: item.title }) : copy('memory.new_title', { label: kind.label });
  ctx.setTitle(title);
  const values = editing ? { ...item, ...(item.dates || {}), entity_id: item.entity?.id ?? '', remind_days: item.remind_days } : { entity_id: ents.length === 1 ? ents[0].id : '', access: kind.default_access || 'all' };
  let up = null;
  if (!editing) up = coUploader({ max: 5, perRequestLeft: 10, capture: true });
  const docsWrap = up ? field(M.documents, up.el, { required: !!kind.requires_document, full: true, group: true }) : null;
  const form = coMemoryForm(kind.key, values, {
    admin: isAdmin(),
    entities: ents,
    counterparties: cps,
    submitLabel: kind.key === 'contract' ? undefined : M.save,
    onSubmit: async (vals, f) => {
      if (up) {
        docsWrap.setError('');
        if (up.pending()) {
          docsWrap.setError(W.uploader.wait);
          throw Object.assign(new Error(W.uploader.wait), { status: 0 });
        }
        if (kind.requires_document && !up.uploadIds().length) {
          docsWrap.setError(M.docs_required);
          throw Object.assign(new Error(M.docs_required), { status: 0 });
        }
      }
      const body = { ...vals };
      if (!isAdmin()) delete body.access;
      let res;
      if (editing) res = await api.patch(`/company/memory/${encodeURIComponent(item.id)}`, body);
      else res = await api.post('/company/memory', { kind: kind.key, ...body, upload_ids: up.uploadIds() });
      toast(M.saved, 'success');
      const id = res?.item?.id || item?.id;
      ctx.navigate(id ? `/memory/item/${id}` : `/memory/${kind.slug}`);
      return f;
    },
  });
  // المستندات قبل زر الحفظ
  if (docsWrap) {
    const actions = form.el.querySelector('.form-actions');
    form.el.insertBefore(docsWrap, actions);
  }
  const cancel = button(M.cancel, { variant: 'ghost', href: back.href });
  form.el.querySelector('.form-actions')?.append(cancel);
  return h('div.co-page.co-mem-edit', pageHead(h('span', { dir: 'auto' }, title)), h('section.co-section.co-mem-form', form.el));
}
