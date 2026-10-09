// الإصدار 10 — أدوات صفحات البوابة التي تُحمَّل عند الحاجة (صفحة الطلب، الذاكرة، الفريق، الحساب…):
//   textSheet()   ورقة فيها حقل كتابة: تمر دائمًا على «تجاهل ما كتبتموه؟» قبل الإغلاق بإيماءة أو ✕ أو Esc (L-64)
//   menuButton()  زر «⋯» بقائمة منبثقة (عناصر لا يحق للدور استخدامها لا تُمرَّر أصلًا؛ U10-43)
//   docItems()    صفوف مستندات: «عرض» (PDF والصور، بعارض المستندات المشترك برابط البوابة) و«تنزيل» صريح (L-42، L-52)
//   starsInput()  تقييم من 5 نجوم كمجموعة اختيار (أسهم لوحة المفاتيح، 44px؛ U10-49)
//   chipFill()    شرائح سبب جاهزة تملأ حقل النص (U10-47/U10-56)
// لا تخزين على الجهاز هنا (L-47).
import { h, mount } from '../lib/h.js';
import { icon, button, modal, uid, discardGuard, field } from '../lib/ui.js';
import { formatBytes } from '../lib/api.js';
import { ensureStyles } from '../app/router.js';
import { copy, whenShort } from '../lib/company-ui-core.js';
import { W } from './words-pages.js';

// ───────────────────────── الأوراق ─────────────────────────
/** ورقة بحقل كتابة: dirty() → هل كُتب شيء؟ (يسأل «تجاهل ما كتبتموه؟» قبل الإغلاق) */
export function textSheet({ title, body, actions = [], dirty = () => false, className, onClose, subtitle } = {}) {
  return modal({ title, subtitle, body, actions, className, onClose, sheet: true, beforeClose: discardGuard(dirty, W.discard) });
}

// ───────────────────────── قائمة «⋯» ─────────────────────────
/**
 * items: [{ label, icon, onClick, danger, disabled, hint }] — العنصر المعطّل يظهر بنصه (مثل «متاح بعد …»).
 * → زر يفتح قائمة منبثقة؛ Esc والنقر خارجها يغلقانها ويعود التركيز إلى الزر.
 */
export function menuButton(label, items = []) {
  const list = items.filter(Boolean);
  if (!list.length) return null;
  const id = uid('co-menu');
  const btn = h('button.icon-btn.co-more-btn', { type: 'button', 'aria-label': label, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': id }, icon('moreHorizontal', { size: 22 }));
  const pop = h('div.co-pop.co-pop-menu', { id, hidden: true, role: 'menu', 'aria-label': label });
  const close = (focus = true) => {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    if (focus) btn.focus();
  };
  // القائمة ثابتة الموضع بجوار زرها: لا يقصّها جدول قابل للتمرير (صف «الفريق» الأخير)، وتنفتح للأعلى إن لم يتسع أسفلها
  const place = () => {
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    pop.classList.add('is-fixed');
    pop.style.top = '';
    pop.style.bottom = '';
    const ph = pop.offsetHeight;
    const pw = pop.offsetWidth;
    if (vh - r.bottom < ph + 16 && r.top > vh - r.bottom) pop.style.bottom = `${Math.round(vh - r.top + 8)}px`;
    else pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, vw - pw - 8)))}px`;
  };
  const onScroll = (e) => !pop.contains(e.target) && close(false);
  const outside = (e) => !pop.contains(e.target) && !btn.contains(e.target) && close(false);
  const onKey = (e) => {
    const opts = [...pop.querySelectorAll('[role=menuitem]:not([disabled])')];
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const i = opts.indexOf(document.activeElement);
      opts[(i + (e.key === 'ArrowDown' ? 1 : opts.length - 1) + opts.length) % opts.length]?.focus();
    }
  };
  mount(
    pop,
    h(
      'ul.co-menu',
      { role: 'none' },
      list.map((it) =>
        h(
          'li',
          { role: 'none' },
          h(
            'button.co-menu-item',
            {
              type: 'button',
              role: 'menuitem',
              disabled: it.disabled || null,
              class: it.danger && 'is-danger',
              onClick: () => {
                close(false);
                it.onClick?.();
              },
            },
            it.icon ? icon(it.icon, { size: 18 }) : null,
            h('span', it.label),
          ),
        ),
      ),
    ),
  );
  btn.addEventListener('click', () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    pop.querySelector('[role=menuitem]:not([disabled])')?.focus({ preventScroll: true });
  });
  return h('span.co-pop-anchor.co-menu-anchor', btn, pop);
}

// ───────────────────────── المستندات ─────────────────────────
/** رابط البوابة للعرض أو التنزيل (L-52؛ الخادم يقرر ما يحق للمستخدم) */
export const companyUrlFor = (d, { inline = false } = {}) => `${d.url || `/api/company/documents/${encodeURIComponent(d.id)}/download`}${inline ? '?inline=1' : ''}`;
const viewable = (d) => d.kind === 'pdf' || d.kind === 'image' || /^(application\/pdf|image\/(jpeg|png|webp))$/.test(String(d.mime || ''));

/** «عرض»: الصور في العارض المدمج، وPDF في عارض المتصفح (doc-viewer.js برابط البوابة) */
export async function viewDoc(d) {
  const kind = d.kind === 'image' || /^image\//.test(String(d.mime || '')) ? 'image' : 'pdf';
  const [dv] = await Promise.all([import('../app/components/doc-viewer.js'), kind === 'image' ? ensureStyles(['v91-lawyer-work']) : null]);
  dv.openDocument(d, { urlFor: companyUrlFor });
}

/**
 * صفوف مستندات: أيقونة · العنوان · المصدر والتاريخ · «عرض» · «تنزيل».
 * origin(d) → نص المصدر («أرسلتموه» / «من فريقكم القانوني») أو null.
 */
export function docItems(docs = [], { origin = null, empty = null } = {}) {
  if (!docs.length) return empty ? h('p.co-muted', empty) : null;
  return h(
    'ul.co-docs',
    docs.map((d) => {
      const name = d.title || d.filename || '';
      const ext = (String(d.filename || '').split('.').pop() || '').toUpperCase().slice(0, 4);
      const meta = [origin ? origin(d) : null, d.created_at ? whenShort(d.created_at) : null, d.size ? formatBytes(d.size) : null].filter(Boolean).join(' · ');
      return h(
        'li.co-doc',
        { dataset: { docId: d.id } },
        h('bdi.co-file-type', { dir: 'ltr' }, ext || 'FILE'),
        h('span.co-doc-main', h('span.co-doc-name', { dir: 'auto' }, name), meta ? h('span.co-doc-meta', meta) : null),
        h(
          'span.co-file-actions',
          viewable(d) ? button(W.docs.view, { variant: 'ghost', size: 'sm', onClick: () => viewDoc(d), ariaLabel: copy('docs.view_name', { name }) }) : null,
          h('a.btn.btn-secondary.btn-sm', { href: companyUrlFor(d), download: '', 'aria-label': copy('docs.download_name', { name }) }, icon('download', { size: 16 }), h('span', W.docs.download)),
        ),
      );
    }),
  );
}

// ───────────────────────── التقييم بالنجوم ─────────────────────────
/** مجموعة اختيار من 5 نجوم (U10-49): كل نجمة زر 44px، والأسهم تتنقل وتختار، والتسمية تُقرأ («ممتاز»…) */
export function starsInput({ label, value = 0, onChange } = {}) {
  let v = value;
  const id = uid('co-stars');
  const stars = W.stars.map((name, i) =>
    h(
      'button.co-star',
      { type: 'button', role: 'radio', 'aria-label': `${i + 1} — ${name}`, 'aria-checked': 'false', tabindex: '-1', onClick: () => set(i + 1, true) },
      icon('star', { size: 26 }),
    ),
  );
  const caption = h('span.co-stars-caption', { 'aria-hidden': 'true' });
  const group = h('div.co-stars', { role: 'radiogroup', id, 'aria-label': label || null }, stars, caption);
  function set(n, focus = false) {
    v = Math.max(1, Math.min(5, n));
    stars.forEach((s, i) => {
      s.setAttribute('aria-checked', i + 1 === v ? 'true' : 'false');
      s.tabIndex = i + 1 === v ? 0 : -1;
      s.classList.toggle('is-on', i < v);
    });
    caption.textContent = W.stars[v - 1];
    if (focus) stars[v - 1].focus();
    onChange?.(v);
  }
  group.addEventListener('keydown', (e) => {
    // RTL: السهم الأيسر يتقدم والأيمن يتراجع، والأعلى/الأسفل كذلك
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    set((v || 0) + step || 1, true);
  });
  if (v) set(v);
  else stars[0].tabIndex = 0;
  return { el: group, value: () => v };
}

// ───────────────────────── شرائح السبب ─────────────────────────
/** شرائح نصوص جاهزة: الضغط يملأ الحقل (ويبقى قابلًا للتعديل) */
export function chipFill(texts = [], input) {
  return h(
    'div.co-chip-row',
    texts.map((t) =>
      h(
        'button.chip-toggle',
        {
          type: 'button',
          onClick: () => {
            input.value = t;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
          },
        },
        t,
      ),
    ),
  );
}

/** حقل نص متعدد الأسطر داخل ورقة (dir=auto) */
export function textareaField(label, { required = false, max = 3000, rows = 4, hint, value = '' } = {}) {
  const input = h('textarea.input', { rows, dir: 'auto', maxlength: max, 'aria-required': required ? 'true' : null });
  input.value = value;
  const wrap = field(label, input, { required, hint, full: true });
  return { input, wrap, value: () => input.value.trim() };
}

/** شريط إجراء بسيط داخل الورقة (زر رئيسي + خطأ) */
export const sheetError = () => h('p.co-send-error', { role: 'alert', hidden: true });
export function showError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}
