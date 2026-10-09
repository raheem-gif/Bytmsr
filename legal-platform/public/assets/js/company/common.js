// الإصدار 10 — أجزاء صفحات البوابة المشتركة: العنوان، الهياكل أثناء التحميل، الخطأ، «لا يمكن عرض هذه الصفحة»،
// ورقة «حساب شركتكم في وضع الاطلاع فقط» (U10-79…U10-85).
import { h } from '../lib/h.js';
import { icon, button, modal, errorMessage } from '../lib/ui.js';
import { W } from './words.js';
import { copy } from '../lib/company-ui-core.js';
import { S } from './state.js';

/** رأس الصفحة: H1 يأخذ التركيز عند الوصول (U10-09/U10-94) وسطر يقول ما هنا */
export function pageHead(title, sub = null, { actions = null, className = '' } = {}) {
  return h(
    'header.co-head',
    { class: className },
    h('div.co-head-text', h('h1.co-h1', { tabindex: '-1' }, title), sub ? h('p.co-sub', sub) : null),
    actions ? h('div.co-head-actions', actions) : null,
  );
}

/** هيكل بشكل الصفحة (لا مؤشر دوّار للصفحة كلها) */
export function skeletonBlocks(n = 3, { rows = 3 } = {}) {
  return h(
    'div.co-skeleton',
    { 'aria-busy': 'true', 'aria-label': W.state.loading },
    Array.from({ length: n }, () => h('div.co-skel-card', Array.from({ length: rows }, (_, i) => h('div.skeleton-line', { style: { width: `${[88, 64, 76][i % 3]}%` } })))),
  );
}

/** هيكل المسار أثناء تحميل وحدته وبياناته (route.skeleton)، ومعه بعد 10 ثوانٍ «يستغرق وقتًا أطول…» + إعادة المحاولة */
export const pageSkeleton = (n, rows) => () => {
  const el = h('div.co-page', skeletonBlocks(n, { rows }));
  slowNotice(el, () => window.dispatchEvent(new CustomEvent('co:reload')));
  return el;
};

/** بعد 10 ثوانٍ من التحميل: «يستغرق وقتًا أطول…» + إعادة المحاولة (U10-79) */
export function slowNotice(el, retry) {
  const t = setTimeout(() => {
    if (!el.isConnected) return;
    el.append(h('p.co-slow', { role: 'status' }, W.state.slow, ' ', retry ? button(W.state.retry, { variant: 'link', size: 'sm', onClick: retry }) : null));
  }, 10000);
  return () => clearTimeout(t);
}

/** «لا يمكن عرض هذه الصفحة.» — نفس الشاشة لغير الموجود ولما لا يحق الاطلاع عليه (U10-82) */
export function notFoundView(parent = { label: W.nav.overview, href: '#/overview' }, { title = W.state.not_found, text = W.state.not_found_text } = {}) {
  return h(
    'section.co-state',
    h('span.co-state-icon', { 'aria-hidden': 'true' }, icon('lock', { size: 28 })),
    h('h1.co-h1', { tabindex: '-1' }, title),
    h('p', text),
    button(copy('state.back_to', { parent: parent.label }), { variant: 'secondary', href: parent.href }),
  );
}

/** حالة خطأ التحميل: «تعذر تحميل {الصفحة}.» + إعادة المحاولة؛ 403/404 ← U10-82 */
export function errorView(title, err, retry, parent) {
  if (err && (err.status === 404 || err.status === 403)) return notFoundView(parent);
  return h(
    'section.co-state',
    { role: 'alert' },
    h('span.co-state-icon.is-danger', { 'aria-hidden': 'true' }, icon('alert', { size: 28 })),
    h('h1.co-h1', { tabindex: '-1' }, copy('state.load_error', { title })),
    h('p', errorMessage(err)),
    retry ? button(W.state.retry, { variant: 'primary', icon: 'refresh', onClick: retry }) : null,
  );
}

/** ورقة «حساب شركتكم في وضع الاطلاع فقط» بدل زر يختفي بلا تفسير (U10-85) */
export function readOnlySheet() {
  const name = S.home?.account_manager?.name || null;
  return modal({
    title: W.state.read_only_title,
    sheet: true,
    body: h('p', name ? copy('state.read_only_text', { name }) : W.state.read_only_text_team),
    actions: [{ label: W.state.understood, variant: 'primary' }],
  });
}

/** «صباح الخير» قبل 12:00 بتوقيت القاهرة، وإلا «مساء الخير» */
export function greeting(name) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return copy(hour < 12 ? 'home.morning' : 'home.evening', { name: first });
}

/** حقل في نموذج بسيط داخل ورقة (للصفحات التي لا تحتاج ui.form) */
export const sectionCard = (title, body, { actions = null, className = '', id = null, label = null } = {}) =>
  h('section.co-section', { class: className, id, 'aria-label': label }, title ? h('header.co-section-head', h('h2.co-section-title', title), actions) : null, body);

/**
 * البحث الواحد (L-55) بعد أول رسم: حقل بنفس الشكل فورًا، ثم يحل محله coSearchBox من lib/company-ui.js (يُحمَّل عند
 * الحاجة فلا يدخل حزمة «المتابعة»؛ §8.4). ما كُتب قبل التحميل والتركيز ينتقلان إليه.
 */
export function searchSlot({ compact = false } = {}) {
  const input = h('input.input.co-search-input', { type: 'search', placeholder: W.search.placeholder, 'aria-label': W.search.label, autocomplete: 'off' });
  const ph = h('div.co-search', { class: compact && 'is-compact', role: 'search' }, h('span.co-search-glass', { 'aria-hidden': 'true' }, icon('search', { size: 18 })), input);
  const load = () =>
    import('../lib/company-ui.js')
      .then(({ coSearchBox }) => {
        if (!ph.isConnected && !ph.parentNode) return;
        const box = coSearchBox({ compact });
        const real = box.querySelector('input');
        const focused = document.activeElement === input;
        real.value = input.value;
        ph.replaceWith(box);
        if (focused) {
          real.focus();
          if (real.value) real.dispatchEvent(new Event('input'));
        }
      })
      .catch(() => {});
  input.addEventListener('focus', load, { once: true });
  if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1500);
  return ph;
}
