// منتقي الردود الجاهزة (الإصدار 9 — وحدة messaging): زر يفتح نافذة بحث في الردود الجاهزة،
// ويدرج النص بعد ملء المتغيرات ({client_name} {case_code} {request_code} {org_name}) من سياق المحادثة.
//
// الاستخدام في محرر رسالة (صفحة الطلب أو الملف):
//   import { quickReplyPicker, bindQuickReplyShortcuts } from '../../components/quick-replies.js';
//   const picker = quickReplyPicker({
//     context: { client_name: data.client?.name, case_code: c.code, request_code: data.intake?.code, case_id: c.id },
//     onPick: (text) => insertAtCursor(textarea, text),
//   });
//   bindQuickReplyShortcuts(textarea, { context });   // اختياري: «/وثائق» ثم مسافة يوسّع الرد

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, options, orgName } from '../../lib/fmt.js';
import { modal, button, icon, toast, emptyState, loading, errorState, badge, errorMessage, uid } from '../../lib/ui.js';

const VAR_LABELS = {
  client_name: 'اسم المستفيد',
  case_code: 'كود الملف',
  request_code: 'رقم الطلب',
  org_name: 'اسم المؤسسة',
};

function varLabel(k) {
  return label('quick_reply_variable', k) || VAR_LABELS[k] || k;
}

/** نص الرد مع إبراز المتغيرات {client_name} كرموز ملونة. */
export function templateNodes(text, { values = {} } = {}) {
  return String(text || '')
    .split(/(\{\w+\})/g)
    .filter((p) => p !== '')
    .map((p) => {
      const m = /^\{(\w+)\}$/.exec(p);
      if (!m) return p;
      const v = values[m[1]];
      return v ? h('mark.qr-filled', { title: varLabel(m[1]) }, v) : h('code.qr-tok', { dir: 'ltr', title: varLabel(m[1]) }, p);
    });
}

/**
 * قيم معاينة المتغيرات في نافذة الاختيار: سياق المحادثة + اسم المؤسسة من الإعدادات
 * (يملؤه الخادم دائمًا عند الإدراج، فيجب أن تظهر المعاينة مطابقة لما سيُدرج).
 */
export function previewValues(context = {}) {
  return { org_name: orgName(), ...(context || {}) };
}

/** سياق المتغيرات المرسل للخادم (الحقول النصية + معرفات الملف/الطلب إن وُجدت). */
function contextPayload(context = {}) {
  const c = context || {};
  const out = { context: {} };
  for (const k of ['client_name', 'case_code', 'request_code']) if (c[k]) out.context[k] = String(c[k]);
  if (c.case_id) out.case_id = c.case_id;
  if (c.intake_id) out.intake_id = c.intake_id;
  if (c.client_id) out.client_id = c.client_id;
  return out;
}

/** يستدعي الخادم لملء المتغيرات وزيادة عداد الاستخدام، ويعيد النص الجاهز. */
export async function useQuickReply(reply, context) {
  const r = await api.post(`/admin/quick-replies/${encodeURIComponent(reply.id)}/use`, contextPayload(context));
  if (r.missing && r.missing.length) {
    toast(`راجع النص قبل الإرسال: لم تُملأ ${r.missing.map(varLabel).join('، ')}`, 'warning', 6000);
  }
  return r.text;
}

let cache = { at: 0, items: null };
async function loadReplies({ fresh = false } = {}) {
  if (!fresh && cache.items && Date.now() - cache.at < 60000) return cache.items;
  const d = await api.get('/admin/quick-replies');
  cache = { at: Date.now(), items: Array.isArray(d.items) ? d.items : [] };
  return cache.items;
}

const norm = (s) =>
  String(s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();

/**
 * زر «ردود جاهزة» يفتح نافذة بحث واختيار.
 * @param {{context?:{client_name?:string, case_code?:string, request_code?:string, case_id?:number, intake_id?:number},
 *          onPick:(text:string)=>void, label?:string, size?:'sm'|'md', variant?:string}} opts
 * @returns {HTMLButtonElement}
 */
export function quickReplyPicker({ context = {}, onPick, label: btnLabel = 'ردود جاهزة', size = 'sm', variant = 'secondary' } = {}) {
  const btn = button(btnLabel, {
    size,
    variant,
    icon: 'zap',
    title: 'إدراج رد جاهز في الرسالة',
    onClick: () => openPicker({ context, onPick }),
  });
  btn.setAttribute('aria-haspopup', 'dialog');
  return btn;
}

/** يفتح نافذة اختيار الرد مباشرة (دون زر). */
export function openPicker({ context = {}, onPick } = {}) {
  const listId = uid('qr-list');
  const state = { q: '', category: '', items: [], active: 0 };
  const search = h('input.input', {
    type: 'search',
    placeholder: 'ابحث بالعنوان أو النص أو الاختصار مثل /وثائق',
    'aria-label': 'بحث في الردود الجاهزة',
    'aria-controls': listId,
    autocomplete: 'off',
  });
  const cats = h('div.qr-cats', { role: 'group', 'aria-label': 'تصنيف الرد' });
  const listHost = h('div.qr-pick-list', { id: listId, role: 'listbox', 'aria-label': 'الردود الجاهزة' });
  const hint = h('p.qr-pick-hint.small.muted', 'تُملأ المتغيرات تلقائيًا من بيانات المحادثة، ويمكنك تعديل النص قبل الإرسال.');
  let m = null;

  function filtered() {
    const q = norm(state.q.trim());
    return state.items.filter(
      (r) => (!state.category || r.category === state.category) && (!q || [r.title, r.shortcut, r.body].some((x) => norm(x).includes(q))),
    );
  }

  async function pick(r) {
    try {
      const text = await useQuickReply(r, context);
      cache.at = 0;
      if (m) m.close('action');
      if (onPick) onPick(text, r);
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  }

  function draw() {
    const items = filtered();
    if (state.active >= items.length) state.active = Math.max(0, items.length - 1);
    if (!state.items.length) {
      mount(
        listHost,
        emptyState('لا توجد ردود جاهزة بعد', button('إضافة ردود من صفحة الردود الجاهزة', { variant: 'link', href: '#/quick-replies', onClick: () => m && m.close('navigation') }), {
          icon: 'zap',
          compact: true,
        }),
      );
      return;
    }
    if (!items.length) {
      mount(listHost, emptyState('لا توجد ردود مطابقة للبحث', null, { icon: 'search', compact: true }));
      return;
    }
    mount(
      listHost,
      items.map((r, i) =>
        h(
          'button.qr-pick-item',
          {
            type: 'button',
            role: 'option',
            id: `${listId}-${r.id}`,
            'aria-selected': i === state.active ? 'true' : 'false',
            class: i === state.active && 'is-active',
            onClick: () => pick(r),
            onMouseenter: () => {
              state.active = i;
              listHost.querySelectorAll('.qr-pick-item').forEach((el, k) => {
                el.classList.toggle('is-active', k === i);
                el.setAttribute('aria-selected', k === i ? 'true' : 'false');
              });
            },
          },
          h(
            'span.qr-pick-head',
            h('span.qr-pick-title', r.title),
            r.shortcut ? h('code.qr-shortcut', { dir: 'auto' }, r.shortcut) : null,
            badge(r.category_label || label('quick_reply_category', r.category), 'neutral'),
          ),
          h('span.qr-pick-body', { dir: 'auto' }, templateNodes(r.body.length > 220 ? `${r.body.slice(0, 220)}…` : r.body, { values: previewValues(context) })),
        ),
      ),
    );
    const activeEl = listHost.querySelector('.qr-pick-item.is-active');
    if (activeEl) search.setAttribute('aria-activedescendant', activeEl.id);
  }

  function drawCats() {
    const opts = [{ value: '', label: 'الكل' }, ...options('quick_reply_category')];
    mount(
      cats,
      opts.map((o) =>
        h(
          'button.chip-toggle',
          {
            type: 'button',
            'aria-pressed': state.category === o.value ? 'true' : 'false',
            class: state.category === o.value && 'is-on',
            onClick: () => {
              state.category = o.value;
              state.active = 0;
              drawCats();
              draw();
            },
          },
          h('span', o.label),
        ),
      ),
    );
  }

  search.addEventListener('input', () => {
    state.q = search.value;
    state.active = 0;
    draw();
  });
  search.addEventListener('keydown', (e) => {
    const items = filtered();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.active = Math.min(items.length - 1, state.active + 1);
      draw();
      listHost.querySelector('.qr-pick-item.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.active = Math.max(0, state.active - 1);
      draw();
      listHost.querySelector('.qr-pick-item.is-active')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[state.active]) pick(items[state.active]);
    }
  });

  m = modal({
    title: 'إدراج رد جاهز',
    size: 'lg',
    className: 'qr-pick-modal',
    body: h('div.qr-pick', h('div.search-input', icon('search', { size: 18 }), search), cats, hint, listHost),
  });
  drawCats();
  mount(listHost, loading('جارٍ تحميل الردود الجاهزة…'));
  loadReplies({ fresh: true })
    .then((items) => {
      state.items = items;
      draw();
      search.focus();
    })
    .catch((err) => mount(listHost, errorState(err, () => openPicker({ context, onPick }))));
  return m;
}

/**
 * توسيع الاختصارات داخل حقل نص: اكتب «/وثائق» ثم مسافة أو Enter أو Tab ليُستبدل بنص الرد بعد ملء متغيراته.
 * @param {HTMLTextAreaElement|HTMLInputElement} field
 * @param {{context?:object, onExpanded?:(reply:object)=>void}} [opts]
 * @returns {()=>void} دالة لإلغاء الربط
 */
export function bindQuickReplyShortcuts(field, { context = {}, onExpanded } = {}) {
  if (!field) return () => {};
  let busy = false;
  // تحميل مسبق صامت حتى يكون التوسيع فوريًا
  loadReplies().catch(() => {});
  async function onKey(e) {
    if (busy || !['Enter', 'Tab', ' '].includes(e.key) || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const pos = field.selectionStart ?? field.value.length;
    if (pos !== (field.selectionEnd ?? pos)) return;
    const before = field.value.slice(0, pos);
    const m = /(^|\s)(\/[^\s/]{2,31})$/u.exec(before);
    if (!m) return;
    const items = cache.items || [];
    const reply = items.find((r) => r.shortcut && r.shortcut.toLowerCase() === m[2].toLowerCase());
    if (!reply) return;
    e.preventDefault();
    busy = true;
    try {
      const text = await useQuickReply(reply, context);
      const start = pos - m[2].length;
      field.value = field.value.slice(0, start) + text + field.value.slice(pos);
      const caret = start + text.length;
      field.setSelectionRange(caret, caret);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      if (onExpanded) onExpanded(reply);
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      busy = false;
    }
  }
  field.addEventListener('keydown', onKey);
  return () => field.removeEventListener('keydown', onKey);
}

/** إدراج نص في موضع المؤشر داخل حقل نص (مساعد للمحررات). */
export function insertAtCursor(field, text) {
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const sep = start > 0 && !/\s$/.test(field.value.slice(0, start)) ? '\n' : '';
  field.value = field.value.slice(0, start) + sep + text + field.value.slice(end);
  const caret = start + sep.length + text.length;
  field.focus();
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

