// v9.1 b-portal — أدوات صغيرة لصفحة المتابعة ودخولها (بلا مكتبة مكونات المنصة الثقيلة):
// أيقونات، أزرار، تنبيه قصير، لوحة سفلية، طلبات JSON، قائمة رأس الموقع، وبيانات التواصل من الصفحة نفسها.
//
// API (ثابت؛ تستخدمه portal.js وportal-login.js):
//   ic(name, size) → <svg>                          أيقونة خطية (phone, whatsapp, camera, image, check, chevron, back, …)
//   btn(label, { kind: 'primary'|'secondary'|'whatsapp'|'text'|'ghost', icon, href, onClick, type, block, attrs })
//   toast(text, tone = 'ok'|'info'|'warn')         تنبيه قصير أسفل الشاشة (aria-live)
//   sheet({ title, body, onClose }) → { close }    لوحة سفلية بسيطة (حوار مع حبس التركيز وEscape)؛ تتبع الإصبع بعد تحميل الحركة
//   haptic(kind) → اهتزاز خفيف (commit|success|…) بعد تحميل الوحدة في الخلفية، وإلا لا شيء (v10)
//   getJson(url) / postJson(url, body)              fetch بصيغة JSON؛ الخطأ يحمل status وcode ورسالة الخادم العربية
//   pageContact() → { phone, phoneHref, waDigits }  رقم المؤسسة وواتساب من رأس الموقع وتذييله (بلا طلب شبكة)
//   waUrl(digits, text) → رابط wa.me أو null        (الرقم التوضيحي 201000000000 لا يُنتج رابطًا أبدًا)
//   initMenu()                                      قائمة رأس الموقع على الهاتف
//   storage.get(key) / storage.set(key, value) / storage.del(key)   localStorage داخل try/catch
//   savedPortal() → { url, ref } | null   ·   SAVED_KEY = 'bm_portal'   ·   SAVED_OFF_KEY = 'bm_portal_off'

import { h, svg, mount } from '../lib/h.js';

const PATHS = {
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21', 'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  image: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  check: ['M20 6 9 17l-5-5'],
  checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  chevron: ['M15 18l-6-6 6-6'],
  back: ['M5 12h14', 'M12 5l7 7-7 7'],
  calendar: ['M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  pin: ['M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  map: ['M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z', 'M8 2v16', 'M16 6v16'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  wallet: ['M20 12V8H6a2 2 0 0 1 0-4h12v4', 'M4 6v12a2 2 0 0 0 2 2h14v-4', 'M18 12a2 2 0 0 0 0 4h4v-4z'],
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  speaker: ['M11 5 6 9H2v6h4l5 4z', 'M15.54 8.46a5 5 0 0 1 0 7.07', 'M19.07 4.93a10 10 0 0 1 0 14.14'],
  stop: ['M7 7h10v10H7z'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  wifiOff: ['M1 1l22 22', 'M16.72 11.06A10.94 10.94 0 0 1 19 12.55', 'M5 12.55a10.94 10.94 0 0 1 5.17-2.39', 'M10.71 5.05A16 16 0 0 1 22.58 9', 'M1.42 9a15.91 15.91 0 0 1 4.7-2.88', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  plus: ['M12 5v14', 'M5 12h14'],
  lock: ['M5 11h14v11H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
};
const FILLED = new Set(['stop']);

/** أيقونة خطية بحجم معين (للتزيين: aria-hidden دائمًا) */
export function ic(name, size = 22) {
  return svg(
    'svg',
    {
      class: `bp-ic bp-ic-${name}`,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: FILLED.has(name) ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    (PATHS[name] || PATHS.info).map((d) => svg('path', { d })),
  );
}

/**
 * زر أو رابط بشكل زر. kind: primary (أساسي 56px) | secondary (محدد 48–52px) | whatsapp | text | ghost.
 */
export function btn(label, { kind = 'secondary', icon, href, onClick, type = 'button', block = false, attrs = {}, className = '' } = {}) {
  const cls = ['bp-btn', `bp-btn--${kind}`, block && 'bp-btn--block', className].filter(Boolean);
  const kids = [icon ? ic(icon, kind === 'primary' ? 24 : 22) : null, h('span', label)];
  if (href) {
    const ext = /^https?:/.test(href);
    return h('a', { class: cls, href, ...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {}), ...attrs, onClick }, ...kids);
  }
  return h('button', { class: cls, type, ...attrs, onClick }, ...kids);
}

// ───────────── v10 experience: حركة الأوراق والاهتزاز (L-11، X10-M2/M6، CS-32) ─────────────
// الصفحة تُرسم أولًا بحزمتها الثابتة (h.js، portal-ui.js، portal.js، words.js ≤ 30 KB)، ثم في أول لحظة فراغ تُحمَّل وحدة
// الورقة والاهتزاز ديناميكيًا؛ قبلها تفتح الأوراق وتُغلق فورًا كما في 9.1. لا تُحمَّل أبدًا مع «توفير البيانات» أو على 2G.
let SM = null;
let buzz = null;
const lite = () => {
  const c = globalThis.navigator?.connection;
  return !!c && (c.saveData === true || /2g$/.test(c.effectiveType || ''));
};
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const warm = () =>
    Promise.all([import('../lib/sheet-motion.js'), import('../lib/haptics.js')]).then(
      ([m, hp]) => ((SM = m), (buzz = hp.haptic)),
      () => {},
    );
  const idle = () => (window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 1500));
  if (!lite()) document.readyState === 'complete' ? idle() : window.addEventListener('load', idle, { once: true });
  // X10-P3: iOS Safari لا يطبّق :active (ضغط الأزرار) إلا بمستمع touchstart في الصفحة
  document.addEventListener('touchstart', () => {}, { passive: true });
}
/** اهتزاز خفيف عند إجراء تم فعلًا (لا عند الفتح أو الإغلاق أو الكتابة) */
export const haptic = (kind = 'commit') => (buzz ? buzz(kind) : false);

let toastHost = null;
/** تنبيه قصير يُقرأ لقارئ الشاشة ويختفي وحده؛ يدخل من الحافة السفلية ويخرج من نفس المسار (X10-F1) */
export function toast(text, tone = 'ok', ms = 4000) {
  if (!toastHost || !document.body.contains(toastHost)) {
    toastHost = h('div.bp-toasts', { 'aria-live': 'polite', role: 'status' });
    document.body.append(toastHost);
  }
  const t = h('div.bp-toast', { class: `is-${tone}` }, ic(tone === 'ok' ? 'checkCircle' : 'info', 20), h('span', text));
  toastHost.append(t);
  void t.offsetWidth;
  t.classList.add('is-in');
  setTimeout(() => {
    t.classList.add('is-out');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  }, ms);
  return t;
}

// v10 experience (L-64): قفل التمرير عدّاد (لوحة تُغلق وأخرى تُفتح لا تفتح التمرير خلف الباقية)
let noScroll = 0;
const scrollLock = (on) => {
  noScroll = Math.max(0, noScroll + (on ? 1 : -1));
  document.documentElement.classList.toggle('bp-noscroll', noScroll > 0);
};

/**
 * لوحة سفلية (حوار) بسيطة: العنوان والمحتوى، تُغلق بزر × أو Escape أو بالضغط خارجها.
 * بعد تحميل الحركة: تدخل من أسفل وتتبع الإصبع من المقبض أو الترويسة (رمية أو سحب بعد المنتصف يغلق، والتراجع يبقيها).
 * close() البرمجي ينفّذ الإغلاق المنطقي فورًا (L-64)؛ الإغلاق الذي يبدؤه المستخدم يمكن إيقافه بالإمساك أثناء الخروج.
 */
export function sheet({ title, body, onClose } = {}) {
  const prev = document.activeElement;
  const titleId = `bp-sheet-${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;
  let motion = null;
  let exiting = false;
  const close = (exited = false) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrollLock(false);
    // العقدة المغادرة خارج التفاعل وقارئات الشاشة فورًا، وحركة الخروج تكمل وحدها
    wrap.inert = true;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.classList.add('is-leaving');
    behind.forEach((c) => (c.inert = false));
    const m = motion;
    const rm = () => (m?.destroy(), wrap.remove());
    if (m && exited !== true) {
      m.exit('close').then(rm);
      setTimeout(rm, 700);
    } else rm();
    try {
      prev?.focus?.();
    } catch {
      /* لا شيء */
    }
    onClose?.();
  };
  const dismiss = async () => {
    if (closed || exiting) return;
    if (!motion) return close();
    exiting = true;
    const out = await motion.exit('dismiss', { interruptible: true });
    exiting = false;
    if (out) close(true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') dismiss();
    if (e.key === 'Tab') {
      const f = [...panel.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  const grip = SM ? h('div.bp-sheet-grip', { 'aria-hidden': 'true' }) : null;
  const head = h('div.bp-sheet-head', h('h2', { id: titleId }, title), h('button.bp-icon-btn', { type: 'button', 'aria-label': 'إغلاق', onClick: dismiss }, ic('x', 22)));
  const panel = h('div.bp-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, grip, head, h('div.bp-sheet-body', body));
  const scrim = h('div.bp-sheet-scrim', { 'aria-hidden': 'true' });
  const wrap = h('div.bp-sheet-wrap', { onClick: (e) => (e.target === wrap || e.target === scrim) && dismiss() }, scrim, panel);
  // v10 (مراجعة): الصفحة خلف اللوحة خارج قارئ الشاشة ولوحة المفاتيح (aria-modal وحده لا يكفي في Safari القديم)؛ التنبيهات تبقى مسموعة
  const behind = [...document.body.children].filter((c) => !c.inert && c !== toastHost && c.tagName !== 'SCRIPT');
  behind.forEach((c) => (c.inert = true));
  document.body.append(wrap);
  scrollLock(true);
  document.addEventListener('keydown', onKey);
  if (SM) {
    motion = SM.attachSheet({ panel, scrim, handles: [grip, head], onDismissed: () => close(true) });
    motion.enter();
  }
  requestAnimationFrame(() => (panel.querySelector('button:not(.bp-icon-btn), a[href], input, textarea') || panel.querySelector('button'))?.focus());
  return { close: () => close(), panel };
}

/** خطأ طلب: status = 0 لانقطاع الشبكة، وإلا رمز HTTP مع رسالة الخادم العربية */
export class PortalError extends Error {
  constructor(message, { status = 0, code = 'network_error', details } = {}) {
    super(message);
    this.name = 'PortalError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new PortalError('network', { status: 0, code: 'network_error' });
  }
  let data = null;
  try {
    data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  } catch {
    if (res.ok) throw new PortalError('network', { status: 0, code: 'network_error' });
  }
  if (!res.ok) throw new PortalError((data && data.error) || 'error', { status: res.status, code: (data && data.code) || `http_${res.status}`, details: data && data.details });
  return data;
}
export const getJson = (url) => request('GET', url);
export const postJson = (url, body) => request('POST', url, body);

// الرقم التوضيحي ليس رقم المؤسسة: لا يُبنى منه رابط واتساب أبدًا
const PLACEHOLDER_WA = '201000000000';
export function waUrl(digits, text) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 15 || d === PLACEHOLDER_WA) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** رقم المؤسسة وواتساب كما يعرضهما رأس الموقع وتذييله (يولّدهما الخادم من الإعدادات) — بلا طلب شبكة */
export function pageContact() {
  const tel = document.querySelector('.pub-footer a[href^="tel:"], .pub-header a[href^="tel:"], a[href^="tel:"]');
  const wa = document.querySelector('a[href^="https://wa.me/"]');
  const phone = tel ? (tel.textContent || '').replace(/[^\d+]/g, '') || tel.getAttribute('href').slice(4) : '';
  const waDigits = wa ? (/wa\.me\/(\d+)/.exec(wa.getAttribute('href')) || [])[1] || '' : '';
  return { phone, phoneHref: tel ? tel.getAttribute('href') : '', waDigits };
}

/** قائمة رأس الموقع على الهاتف: فتح وإغلاق باللمس ولوحة المفاتيح */
export function initMenu() {
  const toggle = document.querySelector('[data-pub-menu]');
  const nav = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!toggle || !nav || toggle.dataset.ready) return;
  toggle.dataset.ready = '1';
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    const sr = toggle.querySelector('.pub-sr');
    if (sr) sr.textContent = open ? 'إغلاق القائمة' : 'القائمة';
    nav.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) nav.querySelector('a')?.focus();
  });
  nav.addEventListener('click', (e) => e.target.closest('a') && setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (toggle.getAttribute('aria-expanded') === 'true' && !e.target.closest('[data-pub-header]')) setOpen(false);
  });
}

export const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  del(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* لا شيء */
    }
  },
  json(key, fallback) {
    try {
      const v = JSON.parse(window.localStorage.getItem(key) || 'null');
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
};

export const SAVED_KEY = 'bm_portal';
export const SAVED_OFF_KEY = 'bm_portal_off';

/** صفحة المتابعة المحفوظة على هذا الموبايل: { url, ref } أو null (الرابط من نفس الموقع فقط) */
export function savedPortal() {
  const v = storage.json(SAVED_KEY, null);
  if (!v || typeof v.url !== 'string') return null;
  try {
    const u = new URL(v.url, window.location.origin);
    if (u.origin !== window.location.origin || !/^\/p\/[A-Za-z0-9_-]{20,100}$/.test(u.pathname)) return null;
    return { url: u.pathname, ref: typeof v.ref === 'string' ? v.ref.slice(0, 20) : '' };
  } catch {
    return null;
  }
}

// (إصلاح 9.1، B91-01 «قنوات صادقة») رابط تأكيد الرقم على واتساب من شاشة «وصلنا طلبك» على هذا الموبايل:
// { ref, url: https://wa.me/<رقم>?text=…, at }. صفحتها تعرضه مرة تانية ما دام الرقم لم يتأكد (الكود صالح 30 يومًا).
export const WA_CONFIRM_KEY = 'bm_wa_confirm';
const WA_CONFIRM_DAYS = 30;
/** رابط التأكيد المحفوظ لأحد أرقام الطلبات المعطاة، أو null */
export function savedWaConfirm(refs) {
  const v = storage.json(WA_CONFIRM_KEY, null);
  if (!v || typeof v.url !== 'string' || typeof v.ref !== 'string') return null;
  if (!/^https:\/\/wa\.me\/\d{8,15}\?text=[^\s]+$/.test(v.url)) return null;
  const at = Date.parse(v.at || '');
  if (!Number.isFinite(at) || Date.now() - at > WA_CONFIRM_DAYS * 86400000) {
    storage.del(WA_CONFIRM_KEY);
    return null;
  }
  return (Array.isArray(refs) ? refs : [refs]).includes(v.ref) ? v.url : null;
}

/** مسح الصفحة المحفوظة ومسودات الصور والتسجيلات من هذا الموبايل («مش موبايلك؟ امسحي») */
export async function forgetThisPhone() {
  storage.del(SAVED_KEY);
  storage.set(SAVED_OFF_KEY, '1');
  storage.del('bm_seen');
  storage.del(WA_CONFIRM_KEY);
  try {
    const { clearAllDrafts } = await import('./drafts.js');
    await clearAllDrafts();
  } catch {
    /* المسودات اختيارية */
  }
}

/** يفرغ العنصر ويضع الأبناء الجدد (إعادة تصدير لتقليل الاستيراد في الصفحات) */
export { mount, h };
