// أدوات بناء عناصر DOM بدون أي innerHTML للبيانات.
// h('div.card.big#main', { on: { click } }, 'نص', [عناصر], null)

const SVG_NS = 'http://www.w3.org/2000/svg';

// خصائص منطقية تُضبط كخاصية (property) وليس كسمة نصية
const BOOL_PROPS = {
  disabled: 'disabled',
  checked: 'checked',
  required: 'required',
  hidden: 'hidden',
  selected: 'selected',
  multiple: 'multiple',
  readonly: 'readOnly',
  readOnly: 'readOnly',
  autofocus: 'autofocus',
  open: 'open',
  indeterminate: 'indeterminate',
};

/** يفكك اختصار الوسم 'div.card.big#main' إلى اسم وصنفات ومعرّف. */
function parseTag(tag) {
  const m = String(tag || 'div').match(/^[^.#]*/);
  const name = (m && m[0]) || 'div';
  const classes = [];
  let id = null;
  const re = /([.#])([^.#]+)/g;
  let part;
  while ((part = re.exec(tag))) {
    if (part[1] === '.') classes.push(part[2]);
    else id = part[2];
  }
  return { name, classes, id };
}

function isChildLike(v) {
  return (
    v == null ||
    v === false ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    Array.isArray(v) ||
    (typeof Node !== 'undefined' && v instanceof Node)
  );
}

function classList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flat(Infinity).filter(Boolean).flatMap((c) => String(c).split(/\s+/));
  return String(value).split(/\s+/).filter(Boolean);
}

/** يضيف الأبناء إلى العنصر: نصوص/أرقام كعقد نصية، مصفوفات متداخلة، ويتجاهل null/false. */
export function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
  return el;
}

function applyProps(el, props, isSvg) {
  let deferredValue;
  let hasValue = false;
  for (const [key, val] of Object.entries(props)) {
    if (key === 'class' || key === 'className') {
      const cls = classList(val);
      if (cls.length) el.classList.add(...cls);
    } else if (key === 'style') {
      if (typeof val === 'string') el.style.cssText = val;
      else if (val && typeof val === 'object') {
        for (const [prop, v] of Object.entries(val)) {
          if (v == null || v === false) continue;
          if (prop.startsWith('--') || prop.includes('-')) el.style.setProperty(prop, String(v));
          else el.style[prop] = v;
        }
      }
    } else if (key === 'dataset') {
      if (val) for (const [k, v] of Object.entries(val)) if (v != null) el.dataset[k] = String(v);
    } else if (key === 'on') {
      if (val) for (const [evt, fn] of Object.entries(val)) if (typeof fn === 'function') el.addEventListener(evt, fn);
    } else if (/^on[A-Z]/.test(key)) {
      if (typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'value' && !isSvg) {
      hasValue = true;
      deferredValue = val;
    } else if (key === 'ref') {
      if (typeof val === 'function') val(el);
    } else if (!isSvg && key in BOOL_PROPS) {
      el[BOOL_PROPS[key]] = Boolean(val);
    } else if (key === 'htmlFor') {
      if (val != null) el.setAttribute('for', String(val));
    } else if (val == null || val === false) {
      continue;
    } else if (val === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(val));
    }
  }
  return { hasValue, deferredValue };
}

function build(tag, props, children, isSvg) {
  if (isChildLike(props)) {
    children = [props, ...children];
    props = null;
  }
  const { name, classes, id } = parseTag(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  if (id) el.id = id;
  if (classes.length) el.classList.add(...classes);
  const { hasValue, deferredValue } = props ? applyProps(el, props, isSvg) : { hasValue: false };
  appendChildren(el, children);
  // تُضبط القيمة بعد إضافة الأبناء حتى تعمل مع <select> وخياراته
  if (hasValue) el.value = deferredValue == null ? '' : deferredValue;
  return el;
}

/**
 * ينشئ عنصر HTML.
 * @param {string} tag  مثل 'div.card#main'
 * @param {object|Node|string|Array} [props] خصائص، أو ابن أول إذا لم يكن كائنًا عاديًا
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  return build(tag, props, children, false);
}

/** ينشئ عنصر SVG (نفس توقيع h). */
export function svg(tag, props, ...children) {
  return build(tag, props, children, true);
}

/** ينشئ DocumentFragment من مجموعة أبناء. */
export function frag(...children) {
  return appendChildren(document.createDocumentFragment(), children);
}

/** يفرغ العنصر من كل أبنائه ويعيده. */
export function clear(el) {
  if (el) while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** يفرغ العنصر ثم يضيف الأبناء الجدد. */
export function mount(el, ...children) {
  clear(el);
  return appendChildren(el, children);
}

/** عقدة نصية آمنة. */
export function text(s) {
  return document.createTextNode(s == null ? '' : String(s));
}
