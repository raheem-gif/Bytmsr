// أدوات مشتركة للموقع العام: مصدر الزيارة (UTM)، روابط واتساب، قائمة الرأس على الهاتف، وربط إعدادات المؤسسة بالصفحة.
// الرأس والتذييل يولّدهما الخادم (src/site.js) لكل صفحات الموقع؛ هذا الملف يضيف السلوك فقط.

import { h } from '../lib/h.js';
import { icon } from '../lib/ui.js';

const KEY = 'bm_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CAMPAIGN_KEYS = [...UTM_KEYS, 'ref', 'fbclid', 'gclid'];
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

/** يلتقط مصدر الزيارة عند أول صفحة يدخلها الزائر (لا يُستبدل بعد ذلك في نفس الجلسة). */
export function captureAttribution() {
  try {
    if (readStored()) return;
    const data = { ...EMPTY, ...paramsFromUrl(), referrer: externalReferrer(), landing_path: window.location.pathname };
    window.sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* التخزين غير متاح (وضع خاص مثلًا) */
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

/**
 * يضيف معاملات الحملة (UTM وref) من الرابط الحالي إلى رابط داخلي دون أن يستبدل معاملاته هو،
 * مثل /intake?area=INH ← /intake?area=INH&utm_source=facebook
 */
export function withCampaignParams(href) {
  let url;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return href;
  }
  if (url.origin !== window.location.origin) return href;
  const current = new URLSearchParams(window.location.search);
  for (const k of CAMPAIGN_KEYS) {
    const v = current.get(k);
    if (v && !url.searchParams.has(k)) url.searchParams.set(k, v.slice(0, 200));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** رابط صفحة الطلب مع الحفاظ على معاملات الرابط الحالي (UTM). */
export function intakeHref() {
  return withCampaignParams('/intake');
}

const BIG_ICON_SLOTS = ['brand-mark', 'door-icon', 'privacy-icon'];

/** يستبدل العناصر ذات data-icon في HTML الثابت بأيقونات SVG. */
export function hydrateIcons(scope = document) {
  scope.querySelectorAll('[data-icon]').forEach((slot) => {
    const classes = [...slot.classList];
    const big = classes.some((c) => BIG_ICON_SLOTS.includes(c));
    const svgIcon = icon(slot.dataset.icon, { size: big ? 24 : 18 });
    slot.replaceWith(classes.length ? h(`span.${classes.join('.')}`, { 'aria-hidden': 'true' }, svgIcon) : svgIcon);
  });
}

/** يضبط سنة حقوق النشر في التذييل. */
export function setYear() {
  document.querySelectorAll('[data-slot="year"]').forEach((el) => (el.textContent = String(new Date().getFullYear())));
}

/** قائمة الرأس على الهاتف: فتح وإغلاق بلوحة المفاتيح واللمس. */
function initMenu() {
  const toggle = document.querySelector('[data-pub-menu]');
  const nav = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
  if (!toggle || !nav || toggle.dataset.ready) return;
  toggle.dataset.ready = '1';
  const setOpen = (open, { focusToggle = false } = {}) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.pub-sr').textContent = open ? 'إغلاق القائمة' : 'القائمة';
    nav.classList.toggle('is-open', open);
    if (!open && focusToggle) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(open);
    if (open) nav.querySelector('a')?.focus();
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setOpen(false, { focusToggle: true });
  });
  document.addEventListener('click', (e) => {
    if (toggle.getAttribute('aria-expanded') === 'true' && !e.target.closest('[data-pub-header]')) setOpen(false);
  });
  // عند تكبير النافذة إلى عرض سطح المكتب تعود القائمة لحالتها الطبيعية
  window.matchMedia('(min-width: 1081px)').addEventListener?.('change', (m) => {
    if (m.matches) setOpen(false);
  });
}

/** سلوك الرأس والتذييل المشترك لكل صفحات الموقع العام. */
export function initSiteChrome() {
  initMenu();
  // روابط البدء تحتفظ بمعاملات الحملة حتى تصل إلى صفحة الطلب
  document.querySelectorAll('a[data-cta="intake"]').forEach((a) => {
    a.setAttribute('href', withCampaignParams(a.getAttribute('href') || '/intake'));
  });
}
