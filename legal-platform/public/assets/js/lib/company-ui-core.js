// الإصدار 10 — نواة مكونات بوابة الشركات (جزء من عقد lib/company-ui.js، POR-0): النصوص والمواعيد والنوع والمرحلة والوعد وصف
// الطلب ومقياس الاستخدام ونموذج «أين وصل طلبكم؟» والمخاطر وصوت الفريق. منفصلة لتبقى حزمة الدخول (المتابعة) ضمن ميزانيتها
// (§8.4)؛ lib/company-ui.js يعيد تصديرها كلها مع البطاقات والبحث — استوردوا من lib/company-ui.js خارج حزمة دخول البوابة.
import { h } from './h.js';
import { icon, badge, kRow } from './ui.js';
import { getMeta, count, money, weekday, shortDate, date as fmtDate, time as fmtTime, isoToCairoDate, cairoToday } from './fmt.js';
import { typeByKey, stageByKey, RISK_LEVELS } from './company-catalog.js';
import { W } from '../company/words.js';

// ───────────────────────── النصوص ─────────────────────────
const MAIL_CLAUSE = /⟦([^⟧]*)⟧/g;
function lookup(key) {
  let v = W;
  for (const p of String(key).split('.')) v = v == null ? undefined : v[p];
  return v;
}
const mailOn = () => !!getMeta()?.email_enabled;

/** نص من words.js بمتغيراته؛ جمل البريد (⟦…⟧) تُحذف حين لا يكون البريد مُعدًّا (CO-2) */
export function copy(key, vars = {}) {
  const v = lookup(key);
  if (typeof v !== 'string') return typeof v === 'number' ? String(v) : String(key);
  const on = mailOn();
  return v.replace(MAIL_CLAUSE, (m, inner) => (on ? inner : '')).replace(/\{([a-z_0-9]+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

/** مثل copy() لكن المتغيرات قد تكون عناصر (اسم المكتب في <bdi>، كود طلب): مصفوفة أبناء لـ h() */
export function copyParts(key, vars = {}) {
  const text = copy(key, Object.fromEntries(Object.entries(vars).filter(([, x]) => !(x instanceof Node))));
  const out = [];
  let last = 0;
  text.replace(/\{([a-z_0-9]+)\}/g, (m, k, at) => {
    if (vars[k] instanceof Node) {
      out.push(text.slice(last, at), vars[k]);
      last = at + m.length;
    }
    return m;
  });
  out.push(text.slice(last));
  return out.filter((x) => x !== '');
}

const units = (k) => W.units[k];
export const countOf = (n, unit) => count(n, units(unit) || unit);

// ───────────────────────── المواعيد (U10-06) ─────────────────────────
const DAY_MS = 86400000;
const toIso = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? `${x}T10:00:00Z` : x);

/** «الأحد 11 أكتوبر، 3:20 م» خلال 14 يومًا، وإلا «31 ديسمبر 2026» */
export function whenLong(iso, { time = true } = {}) {
  if (!iso) return '—';
  const diff = Date.parse(iso) - Date.now();
  if (diff > -DAY_MS && diff < 14 * DAY_MS) return time ? `${weekday(iso)} ${shortDate(iso)}، ${fmtTime(iso)}` : `${weekday(iso)} ${shortDate(iso)}`;
  return fmtDate(iso);
}
/** للصفوف: «اليوم، قبل 5:00 م» في اليوم نفسه، وإلا مثل whenLong */
export function whenShort(iso) {
  if (!iso) return '—';
  if (isoToCairoDate(iso) === cairoToday()) return copy('promise.today_before', { time: fmtTime(iso) });
  return whenLong(iso);
}
/** تاريخ YYYY-MM-DD («5 نوفمبر») */
export function dayText(key, { year = false } = {}) {
  if (!key) return '—';
  return year ? fmtDate(toIso(key)) : shortDate(toIso(key));
}
/** الأيام الباقية حتى تاريخ YYYY-MM-DD بتقويم القاهرة */
export function daysUntil(key) {
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${cairoToday()}T00:00:00Z`)) / DAY_MS);
}

// ───────────────────────── النوع والمرحلة ─────────────────────────
export function typeLabel(key) {
  return typeByKey(key)?.company_label || getMeta()?.constants?.LABELS?.company_request_type?.[key] || String(key || '');
}
export function typeIcon(key, { size = 22 } = {}) {
  return icon(typeByKey(key)?.icon || 'fileText', { size });
}
/** تسمية المرحلة كما تراها الشركة (short: «تم التسليم» بدل «تم التسليم — بانتظار اعتمادكم») */
export function stageLabel(stage, { short = false } = {}) {
  const s = stageByKey(stage);
  if (!s) return String(stage || '');
  return short && s.company_short ? s.company_short : s.company_label;
}

/** شارة الحالة (ممتلئة؛ X10-C4). كل شارة تحذير تحمل أيقونتها (L-63)، و«متأخر» بأيقونة الساعة */
export function stageBadge(stage, { late = false, short = false } = {}) {
  const s = stageByKey(stage);
  const tone = s?.tone || 'neutral';
  const withIcon = tone === 'warning' || tone === 'success';
  return h(
    'span.co-stage',
    badge(stageLabel(stage, { short }), tone, { icon: withIcon ? s.icon : null, className: 'co-badge' }),
    late ? lateBadge() : null,
  );
}
const lateBadge = () => badge(W.stage.late, 'danger', { icon: 'clock', className: 'co-badge' });

// ───────────────────────── الوعد (U10-44 + §8.3) ─────────────────────────
const FINAL = ['closed', 'declined', 'cancelled'];
/**
 * نص الوعد ودرجته. promise من صف الطلب أو صفحته: { first_response_by, confirm_by, delivery_by, delivered_at, state, paused,
 * changed_reason }. الشركة لا ترى «يقترب موعده» (الخادم يحوّلها إلى في الموعد).
 */
export function promiseText(p, { stage, short = false, remainingHours = null } = {}) {
  const none = { text: '', tone: null, icon: null };
  if (!p || FINAL.includes(stage)) return none;
  const st = p.state;
  if (st === 'met' || st === 'missed') {
    const at = p.delivered_at || p.delivery_by;
    if (short) return { text: st === 'met' ? W.promise.short_met : copy('promise.short_missed', { when: whenShort(at) }), tone: st === 'met' ? 'success' : 'neutral', icon: 'checkCircle' };
    return { text: copy(st === 'met' ? 'promise.met' : 'promise.missed', { when: whenLong(at) }), tone: st === 'met' ? 'success' : 'neutral', icon: 'checkCircle' };
  }
  if (st === 'paused' || p.paused) {
    if (short) return { text: W.promise.short_paused, tone: 'warning', icon: 'clock' };
    const left = Number(remainingHours) > 0 ? countOf(Math.max(1, Math.round(Number(remainingHours))), 'business_hour') : null;
    return { text: left ? copy('promise.paused_left', { left }) : W.promise.paused, tone: 'warning', icon: 'clock' };
  }
  if (st === 'late') {
    const before = !p.delivery_by || p.confirm_by || p.first_response_by;
    if (short) return { text: W.promise.short_late, tone: 'danger', icon: 'alert' };
    return { text: before ? W.promise.late_first : copy('promise.late', { when: whenLong(p.delivery_by) }), tone: 'danger', icon: 'alert' };
  }
  if (p.delivery_by) {
    if (short) return { text: copy('promise.short_delivery', { when: whenShort(p.delivery_by) }), tone: 'info', icon: 'clock' };
    return { text: copy('promise.on_track', { when: whenLong(p.delivery_by) }), tone: 'info', icon: 'clock' };
  }
  const by = p.confirm_by || p.first_response_by;
  if (by) {
    if (short) return { text: copy('promise.short_confirm', { when: whenShort(by) }), tone: 'neutral', icon: 'clock' };
    return { text: copy(p.confirm_by ? 'promise.confirm' : 'promise.first_response', { when: whenLong(by) }), tone: 'neutral', icon: 'clock' };
  }
  return { text: short ? W.promise.short_studying : W.promise.studying, tone: 'neutral', icon: 'clock' };
}

/** صندوق الوعد: جملة واحدة (لا عدّاد للشركة) + سطر تعديل الموعد + إجراء اختياري (تصعيد عند التأخر) */
export function coPromise(p, { stage, remainingHours = null, action = null, typical = null } = {}) {
  const t = promiseText(p, { stage, remainingHours });
  if (!t.text) return h('div.co-promise', { hidden: true });
  return h(
    'div.co-promise',
    { class: `tone-${t.tone}` },
    h('span.co-promise-icon', { 'aria-hidden': 'true' }, icon(t.icon || 'clock', { size: 18 })),
    h(
      'div.co-promise-text',
      h('p', t.text),
      typical ? h('p.co-promise-sub', typical) : null,
      p?.changed_reason ? h('p.co-promise-sub', copy('promise.changed', { reason: p.changed_reason })) : null,
      action,
    ),
  );
}

// ───────────────────────── صف الطلب (U10-27) ─────────────────────────
/** item: صف من /api/company/requests أو /home (code, type, title, stage, needs_you, promise) */
export function coRequestRow(item, { href } = {}) {
  const pr = promiseText(item.promise, { stage: item.stage, short: true });
  const late = item.promise?.state === 'late';
  // الحالة في السطر الفرعي، إلا حين تظهر شارتها تحته (بانتظار ردكم/موافقتكم/اعتمادكم) فلا تتكرر
  const sub = [h('bdi.co-code', { dir: 'ltr' }, item.code), item.needs_you ? '' : ` · ${stageLabel(item.stage, { short: true })}`, pr.text ? ` · ${pr.text}` : ''];
  const badges = item.needs_you ? stageBadge(item.stage, { late, short: true }) : late ? h('span.co-stage', lateBadge()) : null;
  return kRow({
    icon: typeIcon(item.type, { size: 22 }),
    title: h('span', { dir: 'auto' }, item.title || typeLabel(item.type)),
    sub,
    badges,
    href: href || `#/requests/${encodeURIComponent(item.code)}`,
    className: 'co-row',
  });
}

// ───────────────────────── الاستخدام (U10-24 + §8.3) ─────────────────────────
export function coUsageMeter(quota, { showPrices = false, policy, price, hasManager = true, newRequest = false } = {}) {
  if (!quota) return h('div.co-meter', { hidden: true });
  const pol = policy || quota.policy || quota.overage_policy || 'approve';
  const pr = price ?? quota.overage_price;
  const priceText = pr != null && pr !== '' ? money(pr) : '';
  const used = Number(quota.used) || 0;
  if (quota.unlimited || quota.included == null) {
    return h('div.co-meter', h('p.co-meter-line', copy('usage.unlimited', { n: countOf(used, 'request') })));
  }
  const included = Number(quota.included) || 0;
  const pct = included > 0 ? Math.min(1, used / included) : 1;
  const atLimit = used >= included;
  const tone = atLimit ? 'danger' : pct >= 0.8 ? 'warning' : 'primary';
  let note = null;
  if (atLimit) {
    const key =
      pol === 'bill' ? (showPrices && priceText ? 'usage.limit_bill' : 'usage.limit_bill_member') : pol === 'block' ? (hasManager ? 'usage.limit_block' : 'usage.limit_block_team') : showPrices && priceText ? 'usage.limit_approve' : 'usage.limit_approve_member';
    note = h('p.co-meter-note.is-limit', icon('alert', { size: 16 }), h('span', copy(key, { price: priceText })));
  } else if (pct >= 0.8) {
    note = h('p.co-meter-note', icon('alert', { size: 16 }), h('span', copy('usage.left', { n: countOf(included - used, 'included') })));
  }
  const pending = newRequest && !atLimit && used + (Number(quota.pending) || 0) + 1 > included;
  return h(
    'div.co-meter',
    // v11 visual (V11-44): النص نفسه، والعدد المستخدم كبير (b.co-meter-big)
    h('p.co-meter-line.num', copyParts('usage.used', { used: h('b.co-meter-big', String(used)), included, date: dayText(quota.cycle_end) })),
    h(
      'div.progress',
      { class: `tone-${tone}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': included, 'aria-valuenow': Math.min(used, included), 'aria-label': W.usage.meter_label },
      h('div.progress-bar', { style: { width: `${Math.round(pct * 100)}%` } }),
    ),
    note,
    pending ? h('p.co-meter-note', icon('alert', { size: 16 }), h('span', W.usage.pending)) : null,
  );
}

// ───────────────────────── «أين وصل طلبكم؟» (U10-45، L-25) ─────────────────────────
/**
 * الخطوة الحالية من المرحلة وحدها (CS-21)؛ تواريخ الدورة الحالية تسميات فقط. بعد «طلب تعديلات» يعود العمل إلى «جارٍ العمل».
 * → { steps:[{title, at, hint}], current (من صفر؛ 5 = اكتملت كلها), state: 'normal'|'waiting', note, hidden }
 */
export function coStepper(stage, timeline = []) {
  const at = (k) => (Array.isArray(timeline) ? timeline.find((x) => x.stage === k)?.at : null) || null;
  const titles = W.stepper.steps;
  const steps = titles.map((title, i) => ({ title, at: [at('received'), null, at('working'), at('final_review'), at('delivered')][i], hint: W.stepper.hints[i] || null }));
  const hidden = stage === 'declined' || stage === 'cancelled';
  let current = 1;
  let state = 'normal';
  let note = null;
  if (stage === 'working') current = 2;
  else if (stage === 'final_review') current = 3;
  else if (stage === 'delivered') current = 4;
  else if (stage === 'closed') current = 5;
  else if (stage === 'needs_you' || stage === 'approval') {
    // لا رجوع داخل الدورة: الانتظار يقف عند أبعد خطوة بلغتها الدورة الحالية
    current = at('final_review') ? 3 : at('working') ? 2 : 1;
    state = 'waiting';
    note = stage === 'needs_you' ? W.stepper.needs_you : W.stepper.approval;
  }
  return { steps, current, state, note, hidden };
}

// ───────────────────────── المخاطر وصوت الفريق ─────────────────────────
export function riskBadge(level) {
  const r = RISK_LEVELS.find((x) => x.key === level);
  if (!r) return null;
  return h('span.co-risk', h('span.co-risk-label', W.risk.label), badge(r.label, r.tone, { icon: r.key === 'low' ? 'checkCircle' : 'alert', className: 'co-badge' }));
}

/** «فريقكم القانوني» بعلامة المكتب — صوت واحد لكل ما يكتبه الفريق (L-22) */
export function teamAuthor() {
  const brand = getMeta()?.brand?.name || 'Emam Legal and Consultancy';
  return h('span.co-team', h('span.co-team-mark', { 'aria-hidden': 'true' }, icon('scale', { size: 16 })), h('span', W.brand.team), h('span.sr-only', ' في ', h('bdi', { lang: 'en', dir: 'ltr' }, brand)));
}
