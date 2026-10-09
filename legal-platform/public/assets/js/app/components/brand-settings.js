// الإصدار 9.2 — بطاقة «ألوان المؤسسة» في صفحة الإعدادات (لمدير النظام وحده).
// لونان يختارهما المدير (أو يقترحهما من صورة الشعار على جهازه؛ لا تُرفع الصورة)، ومعاينة حية بنفس الوحدة التي يولّد
// بها الخادم الدرجات (lib/brand-color.js)، ثم «حفظ الألوان» فتتلوّن الصفحة الحالية فورًا دون إعادة تحميل.
// لا innerHTML: الأنماط المولّدة تُكتب في <style> بـ textContent بعد التحقق من شكلها، وصور المعاينة تُبنى بـ DOMParser.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toLatinDigits, orgName, date as fmtDate, ltr as ltrText } from '../../lib/fmt.js';
import { card, button, toast, confirmDialog, badge, setBusy } from '../../lib/ui.js';
import { normHex, buildTheme, previewVars, dominantColors, DEFAULT_PRIMARY, DEFAULT_ACCENT } from '../../lib/brand-color.js';
import { refreshAppShellCache } from '../theme-sync.js'; // v9.2 بوابة G2

/** نفس فحص الخادم (src/brand.js): لا يُطبَّق على الصفحة إلا متغيرات ألوان بهذا الشكل */
export const THEME_CSS_RE = /^html:root\{(--[a-z0-9-]+:[#0-9a-f ]+;?)+\}$/;
/** أكبر صورة تُقرأ لاقتراح الألوان (أكبر منها تُرفض برسالة «لم نجد ألوانًا…» دون قراءتها) */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const SAMPLE = 200;

const T = {
  title: 'ألوان المؤسسة',
  subtitle: 'تظهر في الموقع وصفحة متابعة المستفيدين والمنصة. اختر لونين، وتُضبط بقية الدرجات تلقائيًا بحيث تبقى الكتابة واضحة.',
  help: 'لا تعرف ألوان المؤسسة بالضبط؟ اختر صورة الشعار (مثل صورة صفحة المؤسسة على فيسبوك) واضغط على لون من الألوان المقترحة منها.',
  image: 'اختر صورة الشعار لاقتراح الألوان',
  imageNote: 'الصورة لا تُرفع ولا تُحفظ؛ تُستخدم على جهازك لاقتراح الألوان فقط.',
  fromImage: 'من الصورة:',
  swatch: (hex) => `استخدم اللون ${hex}`,
  none: 'لم نجد ألوانًا واضحة في هذه الصورة. جرّب صورة أخرى أو اكتب كود اللون.',
  primary: { label: 'اللون الأساسي', hint: 'للأزرار الرئيسية ورأس الصفحات والقائمة الجانبية.', pick: 'اختيار اللون الأساسي', code: 'كود اللون الأساسي' },
  accent: { label: 'اللون الثاني', hint: 'لأهم زر في الموقع («احكيلنا مشكلتك») والمربعات المميزة.', pick: 'اختيار اللون الثاني', code: 'كود اللون الثاني' },
  preview: 'معاينة',
  previewCaption: 'هكذا ستظهر الألوان للمستفيدات وفريق العمل.',
  cta: 'احكيلنا مشكلتك',
  tileA: 'ورث',
  tileB: 'معاش',
  send: 'ابعتي',
  inbox: 'صندوق الوارد',
  adjTitle: 'عدّلنا الدرجة حتى تبقى الكتابة واضحة',
  adj: {
    'primary:darkened': (f, t) => `اللون الأساسي فاتح على الكتابة البيضاء، فستُستخدم درجة أغمق منه: من ${f} إلى ${t}`,
    'primary:lightened': (f, t) => `اللون الأساسي غامق جدًا، فستُستخدم درجة أفتح منه قليلًا: من ${f} إلى ${t}`,
    'accent:lightened': (f, t) => `اللون الثاني غامق على الكتابة الداكنة فوقه، فستُستخدم درجة أفتح منه: من ${f} إلى ${t}`,
    'accent:darkened': (f, t) => `اللون الثاني فاتح جدًا، فستُستخدم درجة أغمق منه قليلًا: من ${f} إلى ${t}`,
  },
  minor: ' (فرق بسيط لا يكاد يُلاحظ)',
  adjFooter: 'اختر لونًا آخر إن أردت، أو احفظ بهذه الدرجة.',
  statusDefault: 'الألوان الحالية: الألوان الأصلية للمنصة؛ لم تُضبط ألوان المؤسسة بعد.',
  statusSetting: (d) => `الألوان الحالية: ألوان المؤسسة — آخر تعديل ${d}.`,
  dirty: 'تغييرات غير محفوظة',
  save: 'حفظ الألوان',
  saved: 'تم حفظ ألوان المؤسسة، وظهرت في الموقع والمنصة.',
  reset: 'رجوع للألوان الأصلية',
  resetTitle: 'الرجوع للألوان الأصلية؟',
  resetMessage: 'ستعود ألوان الموقع والمنصة إلى الأخضر الملكي والذهبي.', // v10: الافتراضي صار أخضر وذهبيًا
  resetDone: 'عادت الألوان الأصلية.',
  hexError: 'اكتب اللون بصيغة ‎#RRGGBB‎، مثل ‎#0b5a3c‎',
  unreadable: 'تعذّر تجهيز ألوان مقروءة من هذا الاختيار. جرّب لونًا آخر.',
  loadError: 'تعذّر تحميل ألوان المؤسسة. أعد تحميل الصفحة.',
};

/** يطبّق كتلة الألوان على الصفحة الحالية (أو يزيلها للألوان الأصلية) دون إعادة تحميل */
export function applyThemeToDocument(theme) {
  if (typeof document === 'undefined' || !theme) return false;
  const css = String(theme.css || '');
  const old = document.getElementById('bm-theme');
  if (!css) {
    if (old) old.remove();
  } else {
    if (!THEME_CSS_RE.test(css)) return false;
    const el = document.createElement('style');
    el.id = 'bm-theme';
    el.dataset.v = String(theme.v || '');
    el.textContent = css;
    if (old) old.replaceWith(el);
    else document.head.appendChild(el);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && /^#[0-9a-f]{6}$/.test(String(theme.theme_color || ''))) meta.setAttribute('content', theme.theme_color);
  return true;
}

/** يقرأ صورة على الجهاز ويقترح منها حتى 4 ألوان (لا رفع ولا تخزين). [] عند الفشل أو صورة أكبر من 15 ميجابايت */
export async function suggestFromImage(file) {
  if (!file || !(file.size > 0) || file.size > MAX_IMAGE_BYTES) return [];
  let source = null;
  let url = null;
  try {
    if (typeof createImageBitmap === 'function' && !/svg/i.test(file.type || '')) {
      try {
        source = await createImageBitmap(file, { resizeWidth: SAMPLE, resizeHeight: SAMPLE, resizeQuality: 'low' });
      } catch {
        source = null;
      }
    }
    if (!source) {
      url = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image'));
        img.src = url;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return [];
    g.drawImage(source, 0, 0, SAMPLE, SAMPLE);
    let data;
    try {
      data = g.getImageData(0, 0, SAMPLE, SAMPLE).data;
    } catch {
      return [];
    }
    return dominantColors(data);
  } catch {
    return [];
  } finally {
    if (source && typeof source.close === 'function') source.close();
    if (url) URL.revokeObjectURL(url);
  }
}

// صور المعاينة من وحدة صور الموقع نفسها (تُحمَّل عند الحاجة؛ بدونها تبقى المعاينة بلا صور)
let pictosPromise = null;
function loadPictos() {
  if (!pictosPromise) pictosPromise = import('../../public/pictos.js').then((m) => m.PICTOS || {}).catch(() => ({}));
  return pictosPromise;
}
function pictoNode(inner) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'brp-pic');
  if (!inner) return svg;
  try {
    const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svg;
    for (const n of [...doc.documentElement.childNodes]) svg.appendChild(document.importNode(n, true));
  } catch {
    /* بلا صورة */
  }
  return svg;
}

const sameHex = (a, b) => normHex(a) === normHex(b);

/**
 * @param {{ user?: object }} [opts]
 * @returns {HTMLElement} البطاقة (id="brand")، تحمّل حالتها من GET /api/admin/brand
 */
export function brandSettingsCard({ user } = {}) {
  if (user && user.role && user.role !== 'admin') return null;
  const state = {
    live: null, // آخر payload من الخادم
    values: { primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT }, // آخر قيمة صالحة لكل حقل (تعرضها المعاينة)
    suggestions: [],
    raf: 0,
  };

  // ── الحقلان ──
  const fields = {};
  const buildField = (role) => {
    const copy = T[role];
    const hexId = `brp-${role}-hex`;
    const errId = `brp-${role}-err`;
    const color = h('input.brp-color', { type: 'color', 'aria-label': copy.pick, value: state.values[role] });
    const hex = h('input.input.brp-hex', {
      id: hexId,
      type: 'text',
      dir: 'ltr',
      maxlength: '7',
      inputmode: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': copy.code,
      'aria-describedby': errId,
      value: state.values[role],
    });
    const err = h('p.field-error.brp-err', { id: errId, hidden: true });
    const sugg = h('div.brp-sugg', { hidden: true });
    const setError = (msg) => {
      err.textContent = msg || '';
      err.hidden = !msg;
      if (msg) hex.setAttribute('aria-invalid', 'true');
      else hex.removeAttribute('aria-invalid');
    };
    const accept = (value, { fromColor = false } = {}) => {
      const v = normHex(toLatinDigits(value));
      if (!v) return false;
      state.values[role] = v;
      if (!fromColor) color.value = v;
      if (hex.value !== v && document.activeElement !== hex) hex.value = v;
      setError('');
      schedule();
      return true;
    };
    color.addEventListener('input', () => {
      hex.value = color.value;
      accept(color.value, { fromColor: true });
    });
    hex.addEventListener('input', () => {
      const raw = toLatinDigits(hex.value).trim();
      if (normHex(raw) && (raw.replace('#', '').length === 6 || raw.replace('#', '').length === 3)) accept(raw);
      else if (raw.replace('#', '').length >= 6) setError(T.hexError);
      else setError('');
    });
    hex.addEventListener('change', () => {
      if (!accept(hex.value)) setError(T.hexError);
      else hex.value = state.values[role];
    });
    fields[role] = {
      color,
      hex,
      sugg,
      setError,
      set(v) {
        state.values[role] = v;
        color.value = v;
        hex.value = v;
        setError('');
      },
      pick(v) {
        accept(v);
        hex.value = state.values[role];
      },
    };
    return h(
      'div.brp-field',
      h('label.field-label', { for: hexId }, copy.label),
      h('p.field-hint', copy.hint),
      h('div.brp-inputs', color, hex),
      err,
      sugg,
    );
  };

  // ── اقتراح من صورة الشعار ──
  const fileInput = h('input.brp-file', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
  const emptyMsg = h('p.brp-empty', { role: 'status', hidden: true }, T.none);
  const helpLine = h('p.brp-help', T.help);
  const imageBtn = button(T.image, { variant: 'secondary', icon: 'file', className: 'brp-image-btn', onClick: () => fileInput.click() });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    emptyMsg.hidden = true;
    if (!file) return;
    setBusy(imageBtn, true);
    let colors = [];
    try {
      colors = await suggestFromImage(file);
    } finally {
      setBusy(imageBtn, false);
    }
    state.suggestions = colors;
    renderSuggestions();
    emptyMsg.hidden = colors.length > 0;
  });
  const renderSuggestions = () => {
    for (const role of ['primary', 'accent']) {
      const box = fields[role].sugg;
      box.replaceChildren();
      box.hidden = !state.suggestions.length;
      if (!state.suggestions.length) continue;
      box.append(
        h('span.brp-sugg-label', T.fromImage),
        ...state.suggestions.map((hex) =>
          h('button.brp-swatch', {
            type: 'button',
            'aria-label': T.swatch(hex),
            title: hex,
            style: { background: hex },
            dataset: { hex, role },
            onClick: () => fields[role].pick(hex),
          }),
        ),
      );
    }
  };

  // ── المعاينة ──
  const tileA = h('div.brp-tile', h('span.brp-tile-pic'), h('span.brp-tile-label', T.tileA));
  const tileB = h('div.brp-tile.is-selected', h('span.brp-tile-pic'), h('span.brp-tile-label', T.tileB));
  loadPictos().then((P) => {
    tileA.querySelector('.brp-tile-pic').replaceChildren(pictoNode(P.inh));
    tileB.querySelector('.brp-tile-pic').replaceChildren(pictoNode(P.pen));
  });
  const previewFrame = h(
    'div.brp-frame',
    { 'aria-hidden': 'true' },
    h('div.brp-header', h('span.brp-org', orgName()), h('span.brp-cta', T.cta)),
    h('div.brp-main', h('div.brp-tiles', tileA, tileB), h('span.brp-send', T.send)),
    h('div.brp-side', h('span.brp-nav', h('span.brp-nav-label', T.inbox), h('span.brp-count', '3'))),
  );
  const adjBox = h('div.brp-adj', { role: 'status', hidden: true });
  const preview = h('div.brp-preview', h('h3.brp-preview-title', T.preview), h('p.field-hint', T.previewCaption), previewFrame, adjBox);

  const renderAdjustments = (theme) => {
    const list = (theme && theme.adjustments) || [];
    adjBox.replaceChildren();
    adjBox.hidden = !list.length;
    if (!list.length) return;
    adjBox.append(
      h('strong.brp-adj-title', T.adjTitle),
      h(
        'ul.brp-adj-list',
        list.map((a) => {
          const text = (T.adj[`${a.role}:${a.reason}`] || T.adj[`${a.role}:darkened`])(ltrText(a.from), ltrText(a.to));
          return h(
            'li',
            h('span.brp-adj-sw', { style: { background: a.from }, 'aria-hidden': 'true' }),
            h('span.brp-adj-arrow', { 'aria-hidden': 'true' }, '←'),
            h('span.brp-adj-sw', { style: { background: a.to }, 'aria-hidden': 'true' }),
            h('span', `${text}${a.minor ? T.minor : ''}`),
          );
        }),
      ),
      h('p.brp-adj-footer', T.adjFooter),
    );
  };

  // ── الحالة والأزرار ──
  const statusLine = h('p.brp-status');
  const dirtyBadge = badge(T.dirty, 'warning', { icon: 'edit' });
  dirtyBadge.hidden = true;
  const saveBtn = button(T.save, { variant: 'primary', icon: 'check', className: 'brp-save', onClick: () => save() });
  const resetBtn = button(T.reset, { variant: 'ghost', icon: 'refresh', className: 'brp-reset', onClick: () => reset() });
  resetBtn.hidden = true;

  const update = () => {
    state.raf = 0;
    let theme = null;
    try {
      theme = buildTheme(state.values.primary, state.values.accent);
    } catch {
      theme = null;
    }
    if (theme) {
      for (const [k, v] of previewVars(theme)) preview.style.setProperty(k, v);
    }
    renderAdjustments(theme);
    const live = state.live && state.live.inputs;
    dirtyBadge.hidden = !live || (sameHex(live.primary, state.values.primary) && sameHex(live.accent, state.values.accent));
  };
  function schedule() {
    if (state.raf) return;
    state.raf = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 0))(update);
  }

  const showLive = (payload) => {
    state.live = payload;
    const i = payload.inputs || {};
    fields.primary.set(normHex(i.primary) || DEFAULT_PRIMARY);
    fields.accent.set(normHex(i.accent) || DEFAULT_ACCENT);
    const isSetting = i.source === 'setting';
    statusLine.textContent = isSetting ? T.statusSetting(i.updated_at ? fmtDate(i.updated_at) : '—') : T.statusDefault;
    helpLine.hidden = isSetting;
    resetBtn.hidden = !isSetting;
    update();
  };

  const fieldErrors = (err) => {
    const f = err && err.details && err.details.fields;
    if (!f) return false;
    for (const role of ['primary', 'accent']) if (f[role]) fields[role].setError(f[role]);
    return true;
  };

  async function save() {
    for (const role of ['primary', 'accent']) {
      const v = normHex(toLatinDigits(fields[role].hex.value));
      if (!v) {
        fields[role].setError(T.hexError);
        fields[role].hex.focus();
        return;
      }
      state.values[role] = v;
    }
    setBusy(saveBtn, true);
    try {
      const payload = await api.put('/admin/brand/colors', { primary: state.values.primary, accent: state.values.accent });
      applyThemeToDocument(payload.theme);
      // [بوابة 9.2 G2] نسخة /app في مخزن عامل الخدمة تُحدَّث قبل رسالة «ظهرت في … المنصة» (وإلا فتحت أول مرة بالألوان القديمة)
      await refreshAppShellCache();
      showLive(payload);
      toast(T.saved, 'success', 5000);
    } catch (err) {
      if (!fieldErrors(err)) toast(err && err.code === 'brand_unreadable' ? T.unreadable : (err && err.message) || T.unreadable, 'danger');
    } finally {
      setBusy(saveBtn, false);
    }
  }

  async function reset() {
    const ok = await confirmDialog({ title: T.resetTitle, message: T.resetMessage, confirmLabel: T.reset });
    if (!ok) return;
    setBusy(resetBtn, true);
    try {
      const payload = await api.del('/admin/brand/colors');
      applyThemeToDocument(payload.theme);
      await refreshAppShellCache(); // [بوابة 9.2 G2]
      showLive(payload);
      toast(T.resetDone, 'success');
    } catch (err) {
      toast((err && err.message) || T.loadError, 'danger');
    } finally {
      setBusy(resetBtn, false);
    }
  }

  const body = h(
    'div.brp',
    h('div.brp-statusrow', statusLine, dirtyBadge),
    h(
      'div.brp-logo',
      helpLine,
      h('div.brp-image-row', imageBtn, fileInput),
      h('p.field-hint', T.imageNote),
      emptyMsg,
    ),
    h('div.brp-grid', h('div.brp-fields', buildField('primary'), buildField('accent')), preview),
    h('div.brp-actions', saveBtn, resetBtn),
  );
  const el = card({ title: T.title, subtitle: T.subtitle, icon: 'flag', body, className: 'brp-card' });
  el.id = 'brand';
  update();

  api
    .get('/admin/brand')
    .then(showLive)
    .catch(() => {
      statusLine.textContent = T.loadError;
      saveBtn.disabled = true;
    });
  return el;
}
