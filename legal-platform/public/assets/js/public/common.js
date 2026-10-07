// أدوات مشتركة للموقع العام: مصدر الزيارة (UTM)، روابط واتساب، قائمة الرأس على الهاتف، وربط إعدادات المؤسسة بالصفحة.
// الرأس والتذييل يولّدهما الخادم (src/site.js) لكل صفحات الموقع؛ هذا الملف يضيف السلوك فقط.
// v9.1 (B91-20): بلا أي استيراد لمكتبة المكونات — القائمة في menu.js، والأيقونات تُحمّل عند الحاجة فقط (hydrateIcons).

import { captureAttribution, withCampaignParams, initSiteChrome, initMenu } from './menu.js';

export { captureAttribution, withCampaignParams, initSiteChrome, initMenu };
// v9.1: «صفحة طلبك محفوظة على الموبايل ده» (B91-06) وبيانات الصفحة المضمّنة bm-public (B91-11)
export { readSaved, rememberPortal, forgetSaved, savedCard } from './saved.js';
export { publicData } from './words.js';

const KEY = 'bm_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const EMPTY = {
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
  utm_term: '',
  ref: '',
  referrer: '',
  landing_path: '',
};

function externalReferrer() {
  const r = document.referrer || '';
  if (!r) return '';
  try {
    return new URL(r).origin === window.location.origin ? '' : r.slice(0, 500);
  } catch {
    return '';
  }
}

function paramsFromUrl() {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  for (const k of [...UTM_KEYS, 'ref']) {
    const v = p.get(k);
    if (v) out[k] = v.trim().slice(0, 200);
  }
  return out;
}

function readStored() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** مصدر الزيارة المدمج: المحفوظ في الجلسة + معاملات الرابط الحالي (الأحدث يتقدم). */
export function getAttribution() {
  const stored = readStored() || {};
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) if (typeof stored[k] === 'string') out[k] = stored[k];
  Object.assign(out, paramsFromUrl());
  if (!out.referrer) out.referrer = externalReferrer();
  if (!out.landing_path) out.landing_path = window.location.pathname;
  return out;
}

// الرقم التوضيحي (+20 100 000 0000) ليس رقم المؤسسة: لا يُبنى منه رابط أبدًا (يرفضه الخادم كذلك)
const PLACEHOLDER_WA = '201000000000';

/** رابط واتساب مع رسالة جاهزة، أو null إن لم يكن للمؤسسة رقم واتساب مضبوط. */
export function whatsappUrl(digits, text) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length < 8 || d.length > 15 || d === PLACEHOLDER_WA) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** يملأ العناصر ذات data-bind بقيم إعدادات المؤسسة. */
export function bindSettings(settings = {}) {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const v = settings[el.dataset.bind];
    if (v) el.textContent = v;
  });
}

/** رابط صفحة الطلب مع الحفاظ على معاملات الرابط الحالي (UTM). */
export function intakeHref() {
  return withCampaignParams('/intake');
}

const BIG_ICON_SLOTS = ['brand-mark', 'door-icon', 'privacy-icon'];

/**
 * يستبدل العناصر ذات data-icon في HTML الثابت بأيقونات SVG.
 * v9.1: مكتبة الأيقونات تُحمّل عند الحاجة فقط (لا تثقل الصفحات التي لا تستخدمها). تعيد Promise.
 */
export function hydrateIcons(scope = document) {
  const slots = [...scope.querySelectorAll('[data-icon]')];
  if (!slots.length) return Promise.resolve();
  return Promise.all([import('../lib/ui.js'), import('../lib/h.js')]).then(([{ icon }, { h }]) => {
    for (const slot of slots) {
      if (!slot.isConnected) continue;
      const classes = [...slot.classList];
      const big = classes.some((c) => BIG_ICON_SLOTS.includes(c));
      const svgIcon = icon(slot.dataset.icon, { size: big ? 24 : 18 });
      slot.replaceWith(classes.length ? h(`span.${classes.join('.')}`, { 'aria-hidden': 'true' }, svgIcon) : svgIcon);
    }
  });
}

/** يضبط سنة حقوق النشر في التذييل. */
export function setYear() {
  document.querySelectorAll('[data-slot="year"]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
}
