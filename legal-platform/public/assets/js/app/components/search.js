// البحث الشامل (لوحة الأوامر Ctrl/⌘+K): للإدارة في العملاء والطلبات والملفات والمحامين،
// وللمحامي في إسناداته وملفاته المستمرة فقط (من خادم مستقل بصلاحياته). (الإصدار 9 — وحدة practice)
// v12 media: مجموعة «مستندات» من النص المقروء آليًا للفريق فقط (SRC-01…SRC-04)؛ لا بحث في النص للمحامي (L12-17).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { icon, modal, codeTag, loading, emptyState, uid, errorMessage } from '../../lib/ui.js';
import { count } from '../../lib/fmt.js';
import { tagsToggle } from '../../lib/tags-boot.js'; // v12 tags (H-T، T12-27): أمر «رموز العناصر» للإدارة

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

/**
 * @param {{user:{role:string}}} opts
 * @returns {{button:HTMLElement, open:()=>void, destroy:()=>void}}
 */
export function createSearch({ user }) {
  const isLawyer = user && user.role === 'lawyer';
  const endpoint = isLawyer ? '/lawyer/search' : '/admin/search';
  const shortcut = IS_MAC ? '⌘K' : 'Ctrl+K';
  let handle = null;

  const trigger = h(
    'button.icon-btn.v9p-search-trigger',
    { type: 'button', 'aria-label': `بحث شامل (${shortcut})`, title: `بحث شامل (${shortcut})`, 'aria-haspopup': 'dialog', 'aria-keyshortcuts': IS_MAC ? 'Meta+K' : 'Control+K', tag: 'SRC-06' },
    icon('search', { size: 20 }),
    h('span.v9p-search-label', 'بحث'),
    h('kbd.v9p-kbd', { dir: 'ltr' }, shortcut),
  );
  trigger.addEventListener('click', () => open());

  function open() {
    if (handle) return;
    const listId = uid('search-list');
    const input = h('input.input.v9p-search-input', {
      type: 'search',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': listId,
      'aria-autocomplete': 'list',
      'aria-label': isLawyer ? 'ابحث في إسناداتك وملفاتك المستمرة' : 'ابحث في المستفيدين والطلبات والملفات والمحامين',
      placeholder: isLawyer ? 'كود الملف أو عنوانه أو رقم الدعوى…' : 'اسم، كود، رقم هاتف، رقم دعوى…',
      autocomplete: 'off',
      spellcheck: 'false',
      tag: 'SRC-07',
    });
    const results = h('div.v9p-search-results');
    const status = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
    let options = [];
    let active = -1;
    let timer = null;
    let ctrl = null;
    let lastQ = '';

    // v12 tags (H-T، T12-27): أمر واحد للإدارة يظهر مع التلميح، ومع البحث بكلمة «رموز» أو «tags»
    function tagsCommand() {
      if (isLawyer) return null;
      const on = Boolean(window.__bmTagsOverlay?.isOn?.());
      const item = { run: () => tagsToggle(!on) };
      const el = h(
        'div.v9p-search-item',
        { id: uid('so'), role: 'option', 'aria-selected': 'false', tabindex: '-1', tag: 'SRC-05' },
        h('span.v9p-search-icon', icon('grid', { size: 18 })),
        h('span.v9p-search-text', h('span.v9p-search-title', on ? 'إخفاء رموز العناصر' : 'إظهار رموز العناصر'), h('span.v9p-search-sub', 'رمز قصير بجانب كل عنصر مهم لتذكره في طلب التعديل')),
        h('kbd.v9p-kbd', { dir: 'ltr' }, 'Alt+Shift+T'),
      );
      const idx = options.length;
      el.addEventListener('mousemove', () => active !== idx && setActive(idx));
      el.addEventListener('click', () => go(item));
      options.push({ el, item });
      return h('div.v9p-search-group', { role: 'group', 'aria-label': 'أوامر' }, h('div.v9p-search-group-title', 'أوامر'), el);
    }

    function hint() {
      options = [];
      active = -1;
      const cmd = tagsCommand();
      mount(
        results,
        h(
          'div.v9p-search-hint',
          icon('search', { size: 22 }),
          h('p', isLawyer ? 'ابحث بكود الملف أو عنوانه أو رقم الدعوى أو المحكمة. تظهر ملفاتك فقط.' : 'ابحث باسم المستفيد أو كوده (CL-00881) أو رقم هاتفه، أو بكود الطلب أو الملف أو رقم الدعوى، أو باسم المحامي.'),
          h('p.small.muted', 'تنقّل بالأسهم ↑ ↓ ثم Enter للفتح، وEsc للإغلاق.'),
        ),
        cmd && h('div.v9p-search-groups', { id: listId, role: 'listbox', 'aria-label': 'أوامر' }, cmd),
      );
    }

    function setActive(i) {
      options.forEach((o, k) => {
        o.el.classList.toggle('is-active', k === i);
        o.el.setAttribute('aria-selected', k === i ? 'true' : 'false');
      });
      active = i;
      if (i >= 0 && options[i]) {
        input.setAttribute('aria-activedescendant', options[i].el.id);
        options[i].el.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }

    function go(item) {
      close();
      if (item.run) item.run(); // v12 tags (T12-27): أمر لا رابط
      else window.location.hash = item.href;
    }

    function render(data) {
      options = [];
      // v12 media (H-M7، L12-37): «مستندات» من النص المقروء آليًا (للفريق فقط) مع ملاحظة الاستدعاء
      const docs = !isLawyer && Array.isArray(data.documents) ? data.documents : [];
      const groups = docs.length
        ? [...data.groups, { key: 'documents', label: 'مستندات', tag: 'SRC-01', note: 'البحث في النص المقروء آليًا وقد لا يجد كل الكلمات.', items: docs.map((d) => ({ id: d.id, title: d.title, subtitle: `صفحة ${d.page} · ${d.snippet}`, href: d.href, icon: 'file', tag: 'SRC-02' })) }]
        : data.groups;
      const cmd = /رموز|رمز|tags?/i.test(String(data.q || lastQ)) ? tagsCommand() : null; // v12 tags (T12-27)
      if (!groups.length && cmd) {
        mount(results, h('div.v9p-search-groups', { id: listId, role: 'listbox', 'aria-label': 'أوامر' }, cmd));
        input.setAttribute('aria-expanded', 'true');
        setActive(0);
        status.textContent = 'أمر واحد';
        return;
      }
      if (!groups.length) {
        mount(results, emptyState(`لا توجد نتائج لـ «${data.q}»`, null, { compact: true, icon: 'search', tag: 'SRC-08' }));
        input.setAttribute('aria-expanded', 'false');
        status.textContent = 'لا توجد نتائج';
        return;
      }
      const list = h('div.v9p-search-groups', { id: listId, role: 'listbox', 'aria-label': 'نتائج البحث' }, cmd);
      for (const g of groups) {
        const gid = uid('sg');
        const group = h('div.v9p-search-group', { role: 'group', 'aria-labelledby': gid, tag: g.tag }, h('div.v9p-search-group-title', { id: gid }, g.label), g.note && h('p.small.muted.v9p-search-note', { tag: 'SRC-04' }, g.note));
        for (const it of g.items) {
          if (!it.href) continue;
          const el = h(
            'div.v9p-search-item',
            { id: uid('so'), role: 'option', 'aria-selected': 'false', tabindex: '-1', tag: it.tag },
            h('span.v9p-search-icon', icon(it.icon || 'file', { size: 18 })),
            h('span.v9p-search-text', h('span.v9p-search-title', it.title), it.subtitle && h('span.v9p-search-sub', it.subtitle)),
            it.code && codeTag(it.code),
          );
          const idx = options.length;
          el.addEventListener('mousemove', () => active !== idx && setActive(idx));
          el.addEventListener('click', () => go(it));
          options.push({ el, item: it });
          group.append(el);
        }
        list.append(group);
      }
      mount(results, list);
      input.setAttribute('aria-expanded', 'true');
      setActive(0);
      status.textContent = count(data.total + docs.length, ['نتيجة واحدة', 'نتيجتان', 'نتائج', 'نتيجة']);
    }

    async function run(q) {
      if (ctrl) ctrl.abort();
      if (q.replace(/\s/g, '').length < 2) {
        lastQ = '';
        hint();
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      lastQ = q;
      ctrl = new AbortController();
      mount(results, loading('جارٍ البحث…'));
      try {
        const data = await api.get(endpoint, { q }, { signal: ctrl.signal });
        if (q === lastQ) render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        mount(results, h('p.v9p-search-error', { role: 'alert' }, errorMessage(err)));
      }
    }

    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => run(input.value.trim()), 220);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && options.length) {
        e.preventDefault();
        setActive((active + 1) % options.length);
      } else if (e.key === 'ArrowUp' && options.length) {
        e.preventDefault();
        setActive((active - 1 + options.length) % options.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        if (options[active]) go(options[active].item);
        else run(input.value.trim());
      }
    });

    hint();
    handle = modal({
      title: isLawyer ? 'البحث في إسناداتي وملفاتي المستمرة' : 'البحث الشامل',
      size: 'md',
      className: 'v9p-palette',
      body: h('div.v9p-search', h('div.v9p-search-box', icon('search', { size: 20 }), input), status, results),
      onClose: () => {
        clearTimeout(timer);
        if (ctrl) ctrl.abort();
        handle = null;
      },
      tag: 'SRC-09',
    });
  }

  function close() {
    if (handle) handle.close('navigate');
  }

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k') {
      if (handle) {
        e.preventDefault();
        close();
        return;
      }
      // لا نفتح فوق نافذة حوارية أخرى
      if (document.body.classList.contains('has-modal')) return;
      e.preventDefault();
      open();
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    button: trigger,
    open,
    destroy() {
      document.removeEventListener('keydown', onKey);
      close();
    },
  };
}
