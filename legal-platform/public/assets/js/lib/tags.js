// v12 tags (TG-1، T12-30…T12-49، L12-43، L12-44): «رموز العناصر» للمالك. طبقة تُظهر رمز كل عنصر مُعلَّم (data-tag) عند زاويته.
// لا تُحمَّل أبدًا للزائر العادي: يستوردها tags-boot.js فقط بعد ?tags=1 أو مفتاح حسابي أو أمر Ctrl+K أو Alt+Shift+T، بمسار
// غير حرفي، فلا تدخل في أي إصدار ولا تحميل مسبق ولا ذاكرة عامل الخدمة (PRECACHE_SKIP في site.js).
// متوافقة مع CSP: لا eval ولا new Function ولا innerHTML ولا معالجات أحداث في النص؛ الأنماط عنصر <style> يسمح به
// style-src 'unsafe-inline' الحالي. الطبقة ثابتة (position: fixed) خارج تدفق الصفحة: لا إزاحة في التخطيط ولا تعديل على
// عناصر الصفحة (لا صنف ولا موضع ولا أبناء).
//
// السلوك: شارة عند زاوية أول نسخة ظاهرة من كل رمز (نسخ القوالب المكررة تظهر شارتها المتقطعة عند المرور)، الضغط على الشارة
// ينسخ الرمز، لسان عند الحافة اليسرى يعرض العدد ويفتح لوحة بحث (S-14 أو s14 أو S-١٤ أو كلمة عربية)، ووضع «غير المرمَّز»
// يحيط العناصر الأساسية التي بلا رمز بإطار أحمر متقطع (لمسح الإكمال). مع نافذة مفتوحة تظهر رموز النافذة وحدها.
//
// إصلاحات النموذج الأولي الأربعة محفوظة (لا تُزَل): (1) Enter في البحث لا يعيد التركيز إلى اللسان فيضغطه (preventDefault،
// والإغلاق بعد القفز بلا إعادة تركيز)؛ (2) شارة القسم لا تُثبَّت أعلى الشاشة تحت الرأس الثابت (الحافة العليا يجب أن تظهر)؛
// (3) الشارات لا تتخلف أثناء التمرير الناعم (تمريرة كاملة بعد 140 ms من توقفه)؛ (4) لا إزاحة جشعة تبعد شارات الرأس عن
// عناصرها (مواضع مرشحة pickSpot بدل الإزاحة).
//
// الواجهة: start({ app, set, focus, toggle, on, device }) · stop() · isOn() · jump(code)؛ ودوال نقية للاختبار:
// normalizeCode · partialCode · compareCodes (من tags-pages.js، مصدر واحد T12-02) · pickSpot.
import { PAGES, normalizeCode, partialCode, compareCodes, foldAr } from './tags-pages.js';

export { normalizeCode, partialCode, compareCodes };

export const LS_KEY = 'bm_tags';

/**
 * مكان الشارة: أول موضع مرشح لا يتقاطع مع شارة وُضعت قبلها، وإلا الموضع الأول (تداخل مقبول).
 * candidates: [{x,y}] بالترتيب المفضل؛ w/h مقاس الشارة؛ placed: مستطيلات موضوعة؛ bounds: {vw,vh}. يعيد {x,y,w,h} داخل الشاشة.
 */
export function pickSpot(candidates, w, h, placed, { vw = Infinity, vh = Infinity } = {}) {
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const clamp = (c) => ({ x: Math.max(2, Math.min(vw - w - 2, c.x)), y: Math.max(2, Math.min(vh - h - 2, c.y)), w, h });
  for (const c of candidates) {
    const r = clamp(c);
    if (!placed.some((p) => hit(r, p))) return r;
  }
  return clamp(candidates[0]);
}

/**
 * صفوف قائمة اللوحة (T12-43): entries = [[code, text, count]] مرتبة. q: جزء رمز (s1 · S 14 · S-١٤) أو كلمات عربية تُطوى
 * همزاتها وتشكيلها (foldAr: «تاسيس» تجد «تأسيس»). يعيد الصفوف المطابقة ومفتاحًا (sig) لا يتغير ما دامت الصفوف كما هي،
 * فلا تُعاد كتابة القائمة في كل تحديث (review: كان التحديث كل ثانية يضيّع التركيز والضغط المطوَّل).
 */
export function panelRows(entries, q = '') {
  const query = String(q || '').trim();
  const part = partialCode(query);
  const words = foldAr(query).split(/\s+/).filter(Boolean);
  const rows = [];
  for (const [code, text, count] of entries) {
    if (query) {
      const [pre, num] = code.split('-');
      const want = part && Number(part.digits);
      const codeHit = part ? (part.digits && want ? pre === part.prefix && String(Number(num)).startsWith(String(want)) : pre.startsWith(part.prefix)) : false;
      const hay = foldAr(text);
      if (!codeHit && !words.every((w) => hay.includes(w))) continue;
    }
    rows.push([code, text, count]);
  }
  return { rows, sig: [query, ...rows.slice(0, 300).map((r) => r.join('|'))].join('\n') };
}

/**
 * ينادي done() حين يثبت read() (موضع العنصر) frames لقطات متتالية، أو بعد max لقطة. raf = جدولة اللقطة التالية.
 * القفز يومض بعد أن يتوقف التمرير الناعم (review: كان الوميض بعد 350 ms ثابتة فيخفيه مستمع التمرير في منتصف الطريق).
 */
export function whenStill(read, done, { raf = (f) => requestAnimationFrame(f), frames = 3, max = 120, alive = () => true } = {}) {
  let last;
  let still = 0;
  let n = 0;
  const tick = () => {
    if (!alive()) return;
    const at = read();
    still = n && at === last ? still + 1 : 0;
    last = at;
    n++;
    if (still >= frames || n >= max) done();
    else raf(tick);
  };
  raf(tick);
}

/** التفضيل المحفوظ: on → sessionStorage (أو localStorage لمفتاح حسابي على هذا الجهاز)؛ off → يُنسى الاثنان. */
function remember(on, device) {
  try {
    if (on) (device ? localStorage : sessionStorage).setItem(LS_KEY, '1');
    else {
      sessionStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // التخزين غير متاح (وضع خاص): للصفحة الحالية فقط
  }
}

const CSS = `
.bmt-layer{position:fixed;inset:0;z-index:2147483600;pointer-events:none;contain:strict;direction:ltr}
.bmt-badge,.bmt-ghost{position:absolute;top:0;left:0;pointer-events:auto;box-sizing:border-box;height:18px;min-width:30px;padding:0 5px;margin:0;
 display:inline-flex;align-items:center;justify-content:center;border-radius:9px;font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace;letter-spacing:.01em;
 white-space:nowrap;cursor:copy;user-select:none;-webkit-user-select:none;border:1px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.35);
 background:#15181d;color:#ffd54a;text-align:center;direction:ltr;unicode-bidi:isolate;transition:transform .12s}
.bmt-badge::after,.bmt-ghost::after{content:"";position:absolute;inset:-6px}
.bmt-badge[hidden],.bmt-ghost[hidden],.bmt-box[hidden],.bmt-tip[hidden]{display:none}
.bmt-badge.is-box{background:#ffd54a;color:#15181d}
.bmt-badge.is-copied{background:#0b7a43;color:#fff}
.bmt-badge.is-pending,.bmt-ghost.is-pending{background:#b42318;color:#fff}
.bmt-badge:hover,.bmt-badge:focus-visible{transform:scale(1.15);outline:none;z-index:2}
.bmt-badge:focus-visible{box-shadow:0 0 0 2px #ffd54a,0 0 0 4px #15181d}
.bmt-ghost{border-style:dashed;opacity:.92}
.bmt-box{position:absolute;top:0;left:0;pointer-events:none;border:2px solid #ffb300;border-radius:6px;box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 0 9999px rgba(10,14,20,.08)}
.bmt-box.is-flash{animation:bmt-flash 1.4s ease-out 1}
@keyframes bmt-flash{0%{box-shadow:0 0 0 2px #fff,0 0 0 9999px rgba(10,14,20,.28)}100%{box-shadow:0 0 0 2px rgba(255,255,255,.85),0 0 0 9999px rgba(10,14,20,0)}}
.bmt-miss{position:absolute;top:0;left:0;pointer-events:none;border:1.5px dashed #d92d20;border-radius:4px;background:rgba(217,45,32,.06)}
.bmt-tip{position:absolute;top:0;left:0;max-width:260px;pointer-events:none;background:#15181d;color:#fff;border-radius:8px;padding:6px 8px;
 font:500 12px/1.5 "IBM Plex Sans Arabic",system-ui,sans-serif;direction:rtl;text-align:right;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.bmt-tip b{font:600 11px ui-monospace,Menlo,monospace;color:#ffd54a;direction:ltr;unicode-bidi:isolate}
.bmt-fab{position:fixed;left:0;top:42%;z-index:2147483601;display:flex;align-items:center;gap:6px;height:44px;padding:0 10px 0 8px;opacity:.94;
 border:1px solid #fff;border-left:0;border-radius:0 22px 22px 0;background:#15181d;color:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 4px 14px rgba(0,0,0,.25);
 font:600 13px/1 "IBM Plex Sans Arabic",system-ui,sans-serif;direction:rtl;cursor:pointer;margin:0}
.bmt-fab b{font:700 12px ui-monospace,Menlo,monospace;color:#ffd54a}
.bmt-fab:focus-visible,.bmt-panel button:focus-visible,.bmt-panel input:focus-visible{outline:2px solid #ffd54a;outline-offset:2px}
.bmt-panel{position:fixed;left:8px;top:64px;z-index:2147483602;width:min(340px,calc(100vw - 16px));max-height:calc(100vh - 128px);display:flex;flex-direction:column;
 background:#fff;color:#15181d;border-radius:14px;box-shadow:0 0 0 1px rgba(0,0,0,.12),0 18px 48px rgba(0,0,0,.28);
 font:400 14px/1.5 "IBM Plex Sans Arabic",system-ui,sans-serif;direction:rtl;text-align:right;overflow:hidden}
.bmt-panel[hidden]{display:none}
.bmt-head{display:flex;align-items:center;gap:8px;padding:12px 12px 8px}
.bmt-head h2{margin:0;font-size:15px;font-weight:700;flex:1;color:inherit;font-family:inherit}
.bmt-x,.bmt-off,.bmt-tg{border:0;background:#f1f2f4;color:#15181d;border-radius:8px;min-height:44px;padding:0 12px;font:inherit;font-size:13px;cursor:pointer;margin:0}
.bmt-off{background:#fde8e7;color:#a5180e}
.bmt-search{margin:0 12px 8px;height:44px;border:1.5px solid #c9ccd1;border-radius:10px;padding:0 10px;font:inherit;font-size:16px;direction:rtl;background:#fff;color:#15181d}
.bmt-row-tools{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px}
.bmt-tg[aria-pressed=true]{background:#15181d;color:#ffd54a}
.bmt-legend{margin:0 12px 6px;color:#5b616b;font-size:12px}
.bmt-list{list-style:none;margin:0;padding:0 6px 8px;overflow:auto;flex:1}
.bmt-list li{margin:0}
.bmt-list li button{display:flex;gap:10px;align-items:baseline;width:100%;min-height:44px;border:0;background:none;text-align:right;padding:7px 8px;border-radius:8px;font:inherit;color:inherit;cursor:pointer}
.bmt-list li button:hover{background:#f4f5f7}
.bmt-list code{font:600 12px ui-monospace,Menlo,monospace;direction:ltr;unicode-bidi:isolate;min-width:58px;color:#15181d;background:#ffd54a;border-radius:6px;padding:1px 5px;text-align:center}
.bmt-list span{color:#3c424b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.bmt-list em{font-style:normal;color:#5b616b;font-size:12px;margin-inline-start:auto}
.bmt-note{margin:0 12px 10px;font-size:12px;color:#5b616b}
.bmt-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483603;background:#15181d;color:#fff;border-radius:10px;padding:8px 14px;
 font:600 13px "IBM Plex Sans Arabic",system-ui,sans-serif;direction:rtl;pointer-events:none}
@media (prefers-reduced-motion:reduce){.bmt-badge{transition:none}.bmt-badge:hover,.bmt-badge:focus-visible{transform:none}.bmt-box.is-flash{animation:none}}
@media (forced-colors:active){.bmt-badge,.bmt-ghost,.bmt-fab{forced-color-adjust:none;background:Canvas;color:CanvasText;border:2px solid Highlight}}
@media print{.bmt-layer,.bmt-fab,.bmt-panel,.bmt-toast{display:none!important}}
`;

// العناصر «الأساسية» التي يجب أن تحمل رمزًا (لوضع «غير المرمَّز» فقط، T12-44). الروابط داخل فقرات النص مستثناة.
const KEY_SEL = 'main section, header, footer, nav, h1, h2, h3, button, a[href], [role=button], [role=tab], summary, input:not([type=hidden]), select, textarea, [role=dialog]';
const BOX_TAGS = new Set(['SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FORM', 'UL', 'OL', 'TABLE', 'DIALOG', 'DETAILS', 'MAIN', 'ARTICLE', 'FIELDSET']);

let state = null;
let legendNames = Object.fromEntries(Object.entries(PAGES).map(([p, v]) => [p, v.name]));

/** نص مختصر يصف العنصر (للتلميح والقائمة) */
function describe(n) {
  const own = n.getAttribute('aria-label') || n.getAttribute('placeholder') || n.getAttribute('alt') || '';
  const head = n.querySelector?.('h1,h2,h3,legend');
  // innerText يفصل الأسطر (عنوان المربع ثم وصفه) بدل لصقها كما يفعل textContent
  let t = own || (head && head.innerText) || n.innerText || n.textContent || n.value || '';
  t = String(t).replace(/\s*\n+\s*/g, ' · ').replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 68)}…` : t;
}

function isBox(n) {
  return BOX_TAGS.has(n.tagName) || n.getAttribute('role') === 'dialog' || n.querySelector('[data-tag]') !== null;
}

function topModal() {
  const ms = [...document.querySelectorAll('[aria-modal="true"]')].filter((m) => m.isConnected && m.getClientRects().length);
  return ms.length ? ms[ms.length - 1] : null;
}

/** هل يظهر جزء من العنصر فعلًا (غير مغطى برأس ثابت أو خلفية نافذة، وغير مقصوص بحاوية تمرير)؟ */
function seen(n, r, vw, vh) {
  if (n.checkVisibility && !n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const pts = [
    [r.left + Math.min(8, r.width / 2), r.top + Math.min(8, r.height / 2)],
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.right - Math.min(8, r.width / 2), r.top + Math.min(8, r.height / 2)],
  ];
  for (const [x, y] of pts) {
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit) continue;
    if (hit === n || n.contains(hit) || hit.contains(n)) return true;
  }
  return false;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function toast(msg) {
  const t = el('div', 'bmt-toast', msg);
  t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'bmt-copy';
    ta.style.setProperty('position', 'fixed');
    ta.style.setProperty('top', '-100px');
    ta.style.setProperty('opacity', '0');
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function isOn() {
  return Boolean(state);
}

/** القفز إلى رمز (يفتح <details> المغلقة حوله ويومض). يعيد false إن لم تكن الرموز ظاهرة. */
export function jump(code) {
  if (!state) return false;
  state.jump(normalizeCode(code));
  return true;
}

/**
 * يشغّل الطبقة (أو يبدّلها). o.app: جدول بادئات المنصة والشركات (tags-pages-app.js، يُحمَّل عند الحاجة)؛
 * o.set: '1' يتذكر في هذا التبويب · '0' ينسى ويطفئ؛ o.focus: رمز يُقفز إليه (?tag=S-14)؛
 * o.toggle: تبديل (o.on: true/false صريحة، o.device: مفتاح حسابي على هذا الجهاز). يعيد الحالة بعد الاستدعاء.
 */
export function start(o = {}) {
  if (typeof document === 'undefined' || !document.body) return false;
  let { focus = null } = o;
  if (o.toggle) {
    const want = o.on == null ? !state : Boolean(o.on);
    remember(want, o.device);
    if (!want) {
      stop();
      return false;
    }
  } else if (String(o.set) === '0') {
    remember(false);
    stop();
    return false;
  } else if (String(o.set) === '1') remember(true);
  try {
    focus = focus ? decodeURIComponent(focus) : null;
  } catch {
    focus = null;
  }
  if (o.app) {
    import('./tags-pages-app.js').then(
      (m) => {
        legendNames = Object.fromEntries(Object.entries(m.PAGES).map(([p, v]) => [p, v.name]));
        state?.refresh();
      },
      () => {},
    );
  }
  if (state) {
    if (focus) state.jump(normalizeCode(focus));
    return true;
  }
  build();
  if (focus) {
    const c = normalizeCode(focus);
    if (c) setTimeout(() => state?.jump(c), 400);
  }
  return true;
}

function build() {
  const style = el('style');
  style.textContent = CSS;
  style.dataset.bmTags = '1';
  document.head.appendChild(style);

  const layer = el('div', 'bmt-layer');
  layer.setAttribute('role', 'region');
  layer.setAttribute('aria-label', 'رموز العناصر');
  const box = el('div', 'bmt-box');
  box.hidden = true;
  const tip = el('div', 'bmt-tip');
  tip.hidden = true;
  layer.append(box, tip);

  const fab = el('button', 'bmt-fab');
  fab.type = 'button';
  fab.setAttribute('aria-expanded', 'false');
  const fabCount = el('b', null, '0');
  fab.append(el('span', null, 'الرموز'), fabCount);

  const panel = el('section', 'bmt-panel');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'رموز العناصر في هذه الصفحة');
  const head = el('div', 'bmt-head');
  const h2 = el('h2', null, 'رموز العناصر');
  const off = el('button', 'bmt-off', 'إخفاء الرموز');
  off.type = 'button';
  const close = el('button', 'bmt-x', 'إغلاق');
  close.type = 'button';
  head.append(h2, off, close);
  const search = el('input', 'bmt-search');
  search.type = 'search';
  search.placeholder = 'ابحث برمز مثل S-14 أو بكلمة';
  search.setAttribute('aria-label', 'بحث في الرموز');
  search.setAttribute('autocomplete', 'off');
  search.setAttribute('dir', 'auto');
  const tools = el('div', 'bmt-row-tools');
  const tgAll = el('button', 'bmt-tg', 'كل النسخ');
  const tgMiss = el('button', 'bmt-tg', 'غير المرمَّز');
  for (const b of [tgAll, tgMiss]) {
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
  }
  tools.append(tgAll, tgMiss);
  const legendEl = el('p', 'bmt-legend');
  const list = el('ul', 'bmt-list');
  const note = el('p', 'bmt-note', 'اضغط الشارة لنسخ الرمز، ثم اكتب مثلًا: «غيّر S-14 إلى …».');
  panel.append(head, search, tools, legendEl, list, note);

  document.body.append(layer, fab, panel);
  const ours = (n) => n === layer || n === fab || n === panel || layer.contains(n) || panel.contains(n) || fab.contains(n);

  const s = (state = {
    style, layer, fab, panel,
    els: [], badges: new Map(), ghost: null, misses: [], showAll: false, showMiss: false,
    raf: 0, mo: null, timer: 0, dirty: true, missCount: 0, items: [], missEls: [], scrolling: false, settle: 0, codes: new Map(),
    fabRect: null, listSig: '', jumpSeq: 0, boxTimer: 0,
  });

  const schedule = (collect = false) => {
    if (collect) s.dirty = true;
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  };
  s.refresh = () => schedule(true);

  function collectEls() {
    s.els = [...document.querySelectorAll('[data-tag]')].filter((n) => !ours(n));
    s.dirty = false;
  }

  function badgeFor(code, kind) {
    let b = s.badges.get(`${kind}:${code}`);
    if (!b) {
      b = el('button', kind === 'ghost' ? 'bmt-ghost' : 'bmt-badge', code);
      b.type = 'button';
      b.dataset.code = code;
      b.setAttribute('aria-label', `رمز العنصر ${code}، اضغط للنسخ`);
      layer.appendChild(b);
      if (/-00$/.test(code)) {
        // T12-10: رمز بلا رقم بعد (npm run tags يرقّمه)
        b.classList.add('is-pending');
        b.title = 'بلا رقم، شغّل npm run tags';
      }
      b._w = 0; // يُقاس مع بقية الشارات الجديدة دفعة واحدة (measure())
      s.badges.set(`${kind}:${code}`, b);
    }
    return b;
  }

  // review (T12-46، frame ≤ 16 ms): عرض الشارة يُقرأ مرة واحدة لكل الشارات الجديدة بعد إنشائها كلها، لا قراءة بعد كل إنشاء
  // (كانت كل قراءة offsetWidth تفرض تخطيطًا كاملًا: 20–41 ms لأول تمريرة على /services)
  const measure = (list) => {
    for (const b of list) if (!b._w) b._w = b.offsetWidth || 8 + b.dataset.code.length * 7;
  };

  function frame() {
    s.raf = 0;
    const full = s.dirty || !s.scrolling;
    if (s.dirty) collectEls();
    // بعد فتح نافذة: ui.js يجعل كل أبناء body خاملين (inert)؛ الطبقة واللوحة تبقيان قابلتين للضغط (وهي فوق كل شيء بـ z-index)
    for (const n of [layer, fab, panel]) if (n.inert) n.inert = false;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    let items;
    if (full) {
      // تمريرة كاملة: من الظاهر فعلًا؟ (اختبار التغطية elementFromPoint) — لا تُجرى أثناء التمرير
      const scope = topModal();
      layer.style.visibility = 'hidden';
      fab.style.visibility = 'hidden';
      panel.style.visibility = 'hidden';
      items = [];
      const done = new Set();
      const codes = new Map();
      for (const n of s.els) {
        const code = n.dataset.tag;
        if (!code || (scope && !scope.contains(n))) continue;
        if (!codes.has(code)) codes.set(code, n);
        if (!s.showAll && done.has(code)) continue;
        const r = n.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        // الحافة العليا يجب أن تظهر (قسم بدأ فوق الشاشة لا تُعلَّق شارته أعلى الصفحة تحت الرأس الثابت)
        if (r.top < 0 || r.top > vh - 6 || r.right < 0 || r.left > vw) continue;
        if (!seen(n, r, vw, vh)) continue;
        done.add(code);
        items.push({ n, code, r, boxy: isBox(n) });
      }
      const misses = [];
      if (s.showMiss) {
        for (const n of document.querySelectorAll(KEY_SEL)) {
          if (n.hasAttribute('data-tag') || n.closest('[data-notag]') || ours(n)) continue;
          if (n.tagName === 'A' && n.closest('p')) continue; // رابط داخل فقرة نص: ليس عنصرًا أساسيًا (T12-09)
          if (scope && !scope.contains(n)) continue;
          const r = n.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
          if (!seen(n, r, vw, vh)) continue;
          misses.push(n);
        }
      }
      // لسان «الرموز» عند الحافة: لا توضع شارة تحته (review: كان يخفي INB-01 على /app#/inbox بعرض 1366)
      const fr = fab.getBoundingClientRect();
      s.fabRect = fr.width ? { x: fr.left - 2, y: fr.top - 2, w: fr.width + 4, h: fr.height + 4 } : null;
      layer.style.visibility = '';
      fab.style.visibility = '';
      panel.style.visibility = '';
      s.items = items;
      s.missEls = misses;
      s.codes = codes;
    } else {
      // أثناء التمرير: نفس العناصر، مواضع جديدة فقط (رخيص)
      items = s.items.filter((it) => it.n.isConnected).map((it) => ({ ...it, r: it.n.getBoundingClientRect() }));
    }

    // الحاويات أولًا (شارتها داخل الزاوية العليا عند نهاية السطر)، ثم العناصر (شارتها على الحد العلوي عند بداية السطر)
    items.sort((a, b) => (a.boxy === b.boxy ? a.r.top - b.r.top : a.boxy ? -1 : 1));
    const shown = items.filter((it) => !(it.r.top < 0 || it.r.top > vh - 6));
    measure(shown.map((it) => badgeFor(it.code, 'badge')));
    const placed = s.fabRect ? [s.fabRect] : [];
    const used = new Set();
    for (const it of shown) {
      const b = badgeFor(it.code, 'badge');
      b.classList.toggle('is-box', it.boxy);
      const w = b._w;
      const h = 18;
      const { left, right, top, bottom } = it.r;
      const startX = rtl ? right - w + 6 : left - 6; // بداية السطر (يمين الصفحة العربية)
      const endX = rtl ? left - 6 : right - w + 6;
      const inStart = rtl ? right - w - 4 : left + 4;
      const inEnd = rtl ? left + 4 : right - w - 4;
      const cands = it.boxy
        ? [{ x: inEnd, y: top + 4 }, { x: inStart, y: top + 4 }, { x: inEnd, y: bottom - h - 4 }]
        : [{ x: startX, y: top - h / 2 }, { x: endX, y: top - h / 2 }, { x: startX, y: bottom - h / 2 }, { x: endX, y: bottom - h / 2 }, { x: inStart, y: top + 2 }];
      const spot = pickSpot(cands, w + 2, h + 2, placed, { vw, vh });
      placed.push(spot);
      b.style.transform = `translate(${Math.round(spot.x)}px, ${Math.round(spot.y)}px)`;
      b.hidden = false;
      b._target = it.n;
      used.add(`badge:${it.code}`);
    }
    for (const [k, b] of s.badges) if (!used.has(k) && b !== s.ghost) b.hidden = true;

    // إطارات غير المرمَّز
    const missRects = s.showMiss ? s.missEls.filter((n) => n.isConnected).map((n) => n.getBoundingClientRect()) : [];
    while (s.misses.length > missRects.length) s.misses.pop().remove();
    missRects.forEach((r, i) => {
      let m = s.misses[i];
      if (!m) {
        m = el('div', 'bmt-miss');
        layer.appendChild(m);
        s.misses.push(m);
      }
      m.style.transform = `translate(${Math.round(r.left - 2)}px, ${Math.round(r.top - 2)}px)`;
      m.style.width = `${r.width + 4}px`;
      m.style.height = `${r.height + 4}px`;
    });
    s.missCount = missRects.length;

    const n = s.codes.size;
    fabCount.textContent = String(n);
    fab.setAttribute('aria-label', `رموز العناصر: ${n}${s.showMiss ? `، غير المرمَّز الظاهر: ${s.missCount}` : ''}`);
    if (full && !panel.hidden) renderList();
  }

  function showBoxFor(target, code, { flash = false } = {}) {
    const r = target.getBoundingClientRect();
    box.style.transform = `translate(${Math.round(r.left - 4)}px, ${Math.round(r.top - 4)}px)`;
    box.style.width = `${r.width + 8}px`;
    box.style.height = `${r.height + 8}px`;
    box.hidden = false;
    box.classList.remove('is-flash');
    if (flash) {
      void box.offsetWidth; // إعادة تشغيل الوميض
      box.classList.add('is-flash');
    }
    const text = describe(target);
    tip.replaceChildren(el('b', null, code), document.createTextNode(text ? ` ${text}` : ''));
    tip.hidden = false;
    const below = r.bottom + 8 + 40 < window.innerHeight;
    tip.style.transform = `translate(${Math.round(Math.max(4, Math.min(window.innerWidth - 264, r.left)))}px, ${Math.round(below ? r.bottom + 8 : Math.max(4, r.top - 44))}px)`;
  }
  function hideBox() {
    box.hidden = true;
    tip.hidden = true;
  }

  // ضغط الشارة = نسخ الرمز (T12-41)
  layer.addEventListener('click', async (e) => {
    const b = e.target.closest('.bmt-badge, .bmt-ghost');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const code = b.dataset.code;
    const ok = await copyText(code);
    b.classList.add('is-copied');
    b.textContent = ok ? 'نُسخ' : code;
    setTimeout(() => {
      b.classList.remove('is-copied');
      b.textContent = code;
    }, 900);
    toast(ok ? `نُسخ الرمز ${code}` : `الرمز ${code} (انسخه يدويًا)`);
  });
  layer.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.bmt-badge, .bmt-ghost');
    if (b && b._target) showBoxFor(b._target, b.dataset.code);
  });
  layer.addEventListener('pointerout', (e) => {
    if (e.target.closest('.bmt-badge, .bmt-ghost')) hideBox();
  });
  layer.addEventListener('focusin', (e) => {
    const b = e.target.closest('.bmt-badge, .bmt-ghost');
    if (b && b._target) showBoxFor(b._target, b.dataset.code);
  });
  layer.addEventListener('focusout', hideBox);

  // نسخ القوالب المكررة: المرور على أي نسخة يُظهر شارتها مؤقتًا (شارة متقطعة، T12-39)
  const onOver = (e) => {
    if (ours(e.target)) return;
    const t = e.target.closest?.('[data-tag]');
    if (!t) return;
    const scope = topModal();
    if (scope && !scope.contains(t)) return;
    const code = t.dataset.tag;
    const main = s.badges.get(`badge:${code}`);
    if (main && !main.hidden && main._target === t) return;
    const g = badgeFor(code, 'ghost');
    measure([g]);
    const r = t.getBoundingClientRect();
    g.style.transform = `translate(${Math.round(Math.max(2, r.right - g._w + 6))}px, ${Math.round(Math.max(2, r.top - 9))}px)`;
    g.hidden = false;
    g._target = t;
    s.ghost = g;
  };
  document.addEventListener('pointerover', onOver, true);
  s.onOver = onOver;

  // اللوحة (T12-43)
  function renderList() {
    const q = search.value.trim();
    const counts = new Map();
    for (const x of s.els) counts.set(x.dataset.tag, (counts.get(x.dataset.tag) || 0) + 1);
    const entries = [...s.codes].sort((a, b) => compareCodes(a[0], b[0])).map(([code, n]) => [code, describe(n), counts.get(code) || 0]);
    const { rows, sig } = panelRows(entries, q);
    const prefixes = [...new Set([...s.codes.keys()].map((c) => c.split('-')[0]))].sort();
    const legend = prefixes.map((p) => (legendNames[p] ? `${p} = ${legendNames[p]}` : p)).join(' · ');
    if (legendEl.textContent !== legend) legendEl.textContent = legend;
    const tip = s.showMiss ? `غير المرمَّز الظاهر الآن: ${s.missCount}` : 'اضغط الشارة لنسخ الرمز، ثم اكتب مثلًا: «غيّر S-14 إلى …».';
    if (note.textContent !== tip) note.textContent = tip;
    // review: لا تُعاد كتابة القائمة إلا إن تغيّر ما تعرضه. التحديث كل ثانية كان يستبدل كل الصفوف، فيضيع تركيز لوحة المفاتيح
    // ولا يصير الضغط المطوَّل (أو لمسة بين تحديثين) نقرة.
    if (sig === s.listSig) return;
    s.listSig = sig;
    const focused = document.activeElement?.closest?.('.bmt-list button')?.dataset.code;
    list.replaceChildren(
      ...rows.slice(0, 300).map(([code, text, count]) => {
        const li = el('li');
        const btn = el('button');
        btn.type = 'button';
        btn.dataset.code = code;
        btn.append(el('code', null, code), el('span', null, text || '—'), count > 1 ? el('em', null, `×${count}`) : '');
        btn.addEventListener('click', () => jumpTo(code, s.codes.get(code)));
        li.appendChild(btn);
        return li;
      }),
    );
    if (!rows.length) list.replaceChildren(el('li', 'bmt-note', q ? `لا يوجد «${q}» في هذه الصفحة` : 'لا توجد رموز في هذه الصفحة بعد'));
    if (focused) list.querySelector(`button[data-code="${focused}"]`)?.focus({ preventScroll: true });
  }

  function jumpTo(code, n) {
    if (!code) return;
    let t = n;
    if (!t || !t.isConnected) t = s.els.find((x) => x.dataset.tag === code) || document.querySelector(`[data-tag="${code}"]`);
    if (!t || ours(t)) {
      toast(`الرمز ${code} غير موجود في هذه الصفحة`);
      return;
    }
    for (let d = t.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) d.open = true;
    t.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    // على الهاتف تغطي اللوحة العنصر: تُغلق بلا إعادة التركيز إلى اللسان (Enter كان سيضغطه، إصلاح 1)
    if (window.innerWidth < 700 && !panel.hidden) setPanel(false, false);
    // review: الإطار والوميض بعد أن يتوقف التمرير الناعم (يثبت موضع العنصر ثلاث لقطات)، لا بعد 350 ms ثابتة: كان مستمع
    // التمرير يخفي الإطار في منتصف الطريق، فلا وميض عند القفز من أسفل الصفحة (s14 ثم Enter)
    const go = ++s.jumpSeq;
    const read = () => {
      const r = t.getBoundingClientRect();
      return `${Math.round(r.top)},${Math.round(r.left)}`;
    };
    const flash = () => {
      if (!t.getClientRects().length) toast(`${code} موجود لكنه مخفي الآن (خطوة أو تبويب آخر)`);
      else showBoxFor(t, code, { flash: true });
      clearTimeout(s.boxTimer);
      s.boxTimer = setTimeout(hideBox, 1600);
    };
    setTimeout(() => whenStill(read, flash, { alive: () => state === s && go === s.jumpSeq }), 60);
  }
  s.jump = (code) => jumpTo(code, s.codes.get(code));

  const setPanel = (open, refocus = true) => {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    if (open) {
      renderList();
      setTimeout(() => search.focus(), 0);
    } else if (refocus) fab.focus();
  };
  fab.addEventListener('click', () => setPanel(panel.hidden));
  close.addEventListener('click', () => setPanel(false));
  off.addEventListener('click', () => {
    remember(false);
    stop();
  });
  search.addEventListener('input', renderList);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const c = normalizeCode(search.value);
      if (c) jumpTo(c, s.codes.get(c));
    }
  });
  for (const [b, key] of [[tgAll, 'showAll'], [tgMiss, 'showMiss']]) {
    b.addEventListener('click', () => {
      s[key] = !s[key];
      b.setAttribute('aria-pressed', String(s[key]));
      schedule(true);
    });
  }
  s.onKey = (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      e.stopPropagation();
      setPanel(false);
    }
  };
  document.addEventListener('keydown', s.onKey, true);

  // تحديث: تغيّرات DOM (صفحات SPA)، التمرير (كل الحاويات)، تغيّر المقاس، ومؤقت خفيف للحركات بلا تغيّر DOM (T12-45)
  s.mo = new MutationObserver((recs) => {
    if (recs.every((r) => ours(r.target))) return;
    schedule(true);
  });
  s.mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tag', 'class', 'hidden', 'open', 'style', 'aria-expanded', 'aria-hidden', 'aria-modal'] });
  s.onScroll = () => {
    hideBox();
    if (s.ghost) s.ghost.hidden = true;
    s.scrolling = true;
    clearTimeout(s.settle);
    s.settle = setTimeout(() => {
      s.scrolling = false;
      schedule(false);
    }, 140);
    schedule(false);
  };
  document.addEventListener('scroll', s.onScroll, { capture: true, passive: true });
  window.addEventListener('resize', s.onScroll, { passive: true });
  s.timer = setInterval(() => {
    if (!document.hidden) schedule(false);
  }, 1000);
  schedule(true);
  window.__bmTagsOverlay = { start, stop, isOn, jump };
  notify(true);
}

// مفاتيح «إظهار رموز العناصر» (حسابي، صفحة الرموز) تتبع الحالة من هذا الحدث
const notify = (on) => dispatchEvent(new CustomEvent('bm:tags', { detail: { on } }));

/** يطفئ الطبقة ويزيل كل عقدها ومستمعيها (لا يمس التخزين؛ «إخفاء الرموز» وstart({ set: '0' }) ينسيان التفضيل). */
export function stop() {
  const s = state;
  if (!s) return;
  state = null;
  if (s.raf) cancelAnimationFrame(s.raf);
  clearInterval(s.timer);
  s.mo?.disconnect();
  document.removeEventListener('scroll', s.onScroll, { capture: true });
  window.removeEventListener('resize', s.onScroll);
  document.removeEventListener('keydown', s.onKey, true);
  document.removeEventListener('pointerover', s.onOver, true);
  clearTimeout(s.settle);
  clearTimeout(s.boxTimer);
  s.layer.remove();
  s.fab.remove();
  s.panel.remove();
  s.style.remove();
  notify(false);
}
