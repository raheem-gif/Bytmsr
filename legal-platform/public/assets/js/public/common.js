// أدوات مشتركة للموقع العام: مصدر الزيارة (UTM)، روابط واتساب، وربط إعدادات المؤسسة بالصفحة.

import { h } from '../lib/h.js';
import { icon } from '../lib/ui.js';

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

/** رابط واتساب مع رسالة جاهزة. */
export function whatsappUrl(digits, text) {
  const d = String(digits || '').replace(/\D/g, '');
  if (!d) return null;
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
  return `/intake${window.location.search || ''}`;
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
