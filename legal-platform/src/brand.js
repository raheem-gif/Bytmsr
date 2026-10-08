// الإصدار 9.2 — «ألوان المؤسسة»: لونان تختارهما الإدارة، وتُولَّد منهما كل الدرجات بنفس الوحدة التي تستخدمها المعاينة
// في المتصفح (public/assets/js/lib/brand-color.js)، مع ضمان تباين WCAG AA لكل زوج نص/خلفية في أوراق الأنماط.
// التخزين: صف الإعدادات brand_colors = {primary, accent, updated_at, updated_by} (ليس في DEFAULT_SETTINGS، فلا يغيّره
// PATCH /api/admin/settings العام). الألوان الافتراضية لا تُخرج أي كتلة أنماط: الصفحات كما كانت في 9.1 حرفيًا.
import { createHash } from 'node:crypto';
import { DEFAULT_PRIMARY, DEFAULT_ACCENT, LEGACY, normHex, buildTheme, themeCss, checkContract } from '../public/assets/js/lib/brand-color.js';
import { ApiError, badRequest, nowIso } from './util.js';

export const BRAND_SETTING = 'brand_colors';
/** شكل الكتلة المضمّنة المسموح وحده (يُتحقق منه قبل إدراجها في أي صفحة، وفي المتصفح قبل التطبيق الحي) */
export const THEME_CSS_RE = /^html:root\{(--[a-z0-9-]+:[#0-9a-f ]+;?)+\}$/;
export const HEX_ERROR = 'اكتب اللون بصيغة ‎#RRGGBB‎، مثل ‎#0f4c5c‎';
export const UNREADABLE_ERROR = 'تعذّر تجهيز ألوان مقروءة من هذا الاختيار. جرّب لونًا آخر.';
const ADJUSTED_SUFFIX = ' (عُدّلت الدرجة لوضوح الكتابة)';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const ltr = (s) => `${LRI}${s}${PDI}`;

const DEFAULTS = Object.freeze({ primary: DEFAULT_PRIMARY, accent: DEFAULT_ACCENT });
const LEGACY_THEME = Object.freeze({
  primary: { ...LEGACY.primary },
  accent: { ...LEGACY.accent },
  adjustments: [],
  legacy: true,
  css: '',
  v: 'default',
});

export function createBrand(app) {
  const { db } = app;
  const warned = new Set();
  const warnOnce = (key, msg, err) => {
    if (warned.has(key)) return;
    warned.add(key);
    app.log(msg, err);
  };
  let memo = null; // { key, theme }

  /** المدخلات الفعلية: صف الإعدادات إن كان سليمًا، وإلا الألوان الأصلية (صف تالف لا يُسقط أي صفحة) */
  function inputs() {
    try {
      const row = app.settings.get(BRAND_SETTING);
      if (row == null) return { ...DEFAULTS, source: 'default', updated_at: null };
      const primary = row && typeof row === 'object' ? normHex(row.primary) : null;
      const accent = row && typeof row === 'object' ? normHex(row.accent) : null;
      if (!primary || !accent) {
        warnOnce(`row:${typeof row === 'string' ? row.slice(0, 80) : JSON.stringify(row).slice(0, 80)}`, 'brand: brand_colors setting is unreadable; using the default colours');
        return { ...DEFAULTS, source: 'default', updated_at: null };
      }
      return { primary, accent, source: 'setting', updated_at: typeof row.updated_at === 'string' ? row.updated_at : null };
    } catch (e) {
      warnOnce('read', 'brand: reading brand_colors failed; using the default colours', e);
      return { ...DEFAULTS, source: 'default', updated_at: null };
    }
  }

  /** الدرجات المولّدة + كتلة CSS ورقم إصدارها؛ محفوظة في الذاكرة حسب الزوج */
  function themeFor(primary, accent) {
    const key = `${primary}|${accent}`;
    if (memo && memo.key === key) return memo.theme;
    let theme = LEGACY_THEME;
    try {
      const t = buildTheme(primary, accent);
      if (t && !t.legacy) {
        const css = themeCss(t);
        if (!THEME_CSS_RE.test(css)) throw new Error('brand: generated css failed the shape check');
        const v = createHash('sha256').update(css).digest('base64url').slice(0, 10);
        theme = Object.freeze({ primary: t.primary, accent: t.accent, adjustments: t.adjustments, legacy: false, css, v });
      } else if (!t) {
        warnOnce(`null:${key}`, `brand: no readable theme for ${key}; using the default colours`);
      }
    } catch (e) {
      warnOnce(`build:${key}`, `brand: building the theme for ${key} failed; using the default colours`, e);
      theme = LEGACY_THEME;
    }
    memo = { key, theme };
    return theme;
  }

  function theme() {
    const i = inputs();
    return themeFor(i.primary, i.accent);
  }

  /** الكتلة المضمّنة في رأس كل صفحة ('' للألوان الأصلية) */
  function headStyle() {
    try {
      const t = theme();
      if (t.legacy || !t.css || !THEME_CSS_RE.test(t.css)) return '';
      return `<style id="bm-theme" data-v="${t.v}">${t.css}</style>`;
    } catch (e) {
      warnOnce('head', 'brand: headStyle failed', e);
      return '';
    }
  }

  function themeColor() {
    try {
      return theme().primary[700] || DEFAULT_PRIMARY;
    } catch {
      return DEFAULT_PRIMARY;
    }
  }

  function payload() {
    const i = inputs();
    const t = themeFor(i.primary, i.accent);
    return {
      inputs: i,
      defaults: { ...DEFAULTS },
      theme: {
        v: t.v,
        theme_color: t.primary[700],
        primary: { ...t.primary },
        accent: { ...t.accent },
        adjustments: t.adjustments.map((a) => ({ ...a })),
        css: t.css,
      },
      contract: checkContract(t),
    };
  }

  function deleteRow() {
    db.run('DELETE FROM settings WHERE key = ?', BRAND_SETTING);
  }

  function setColors(body, actor, ctx) {
    const b = body && typeof body === 'object' ? body : {};
    const primary = normHex(typeof b.primary === 'string' ? b.primary : '');
    const accent = normHex(typeof b.accent === 'string' ? b.accent : '');
    const fields = {};
    if (!primary) fields.primary = HEX_ERROR;
    if (!accent) fields.accent = HEX_ERROR;
    if (Object.keys(fields).length) throw badRequest(HEX_ERROR, { fields });
    let built = null;
    try {
      built = buildTheme(primary, accent);
    } catch {
      built = null;
    }
    if (!built) throw new ApiError(422, UNREADABLE_ERROR, 'brand_unreadable');
    const from = inputs();
    if (primary === DEFAULTS.primary && accent === DEFAULTS.accent) deleteRow();
    else app.settings.set(BRAND_SETTING, { primary, accent, updated_at: nowIso(), updated_by: actor?.id ?? null });
    const adjustments = built.adjustments || [];
    app.audit.log({
      actor,
      ctx,
      type: 'brand.colors_updated',
      summary: `تعديل ألوان المؤسسة: الأساسي ${ltr(primary)} والثاني ${ltr(accent)}${adjustments.length ? ADJUSTED_SUFFIX : ''}`,
      data: { from: { primary: from.primary, accent: from.accent, source: from.source }, to: { primary, accent }, adjustments },
    });
    return payload();
  }

  function resetColors(actor, ctx) {
    const from = inputs();
    deleteRow();
    app.audit.log({
      actor,
      ctx,
      type: 'brand.colors_reset',
      summary: 'إرجاع ألوان المؤسسة الأصلية',
      data: { from: { primary: from.primary, accent: from.accent, source: from.source } },
    });
    return payload();
  }

  /** بند «ألوان المؤسسة» في قائمة جاهزية الإطلاق (المستوى ok في الحالتين) */
  function readiness() {
    const i = inputs();
    if (i.source === 'setting') {
      return { title: 'ألوان المؤسسة مضبوطة', detail: `اللون الأساسي ${ltr(i.primary)} والثاني ${ltr(i.accent)}.`, href: '#/settings?section=brand' };
    }
    return {
      title: 'ألوان المؤسسة: الألوان الأصلية للمنصة',
      detail: 'لم تُضبط ألوان المؤسسة بعد. اخترها في دقيقة من «الإعدادات ← ألوان المؤسسة».',
      href: '#/settings?section=brand',
    };
  }

  return { inputs, theme, headStyle, themeColor, payload, setColors, resetColors, readiness, defaults: () => ({ ...DEFAULTS }) };
}
