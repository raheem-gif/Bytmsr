// صفحة متابعة المستفيد/ة /p/<رمز> — الإصدار 9.1 (مسار b-portal):
// شاشة واحدة تقول «إيه المطلوب مني دلوقتي؟» و«طلبك وصل لفين؟» بكلام بسيط، ثم صفحات فرعية بالروابط (#answer، #events،
// #event/<id>، #money، #messages، #papers، #request/<id>، #todo) بزر «رجوع» وزر الرجوع في المتصفح.
// خفيفة على موبايل بسيط ونت ضعيف: لا مكتبة مكونات المنصة ولا طلب /api/meta — كل ما تحتاجه يأتي من /api/portal/<رمز>.
//
// تعتمد على: h.js، portal-ui.js (هذا المسار)، words.js (b-site)، upload.js وrecorder.js وdrafts.js (b-forms).

import { h, mount } from '../lib/h.js';
import { ic, btn, toast, sheet, getJson, postJson, waUrl, pageContact, initMenu, storage, savedPortal, forgetThisPhone, SAVED_KEY, SAVED_OFF_KEY, savedWaConfirm, WA_CONFIRM_KEY, haptic } from './portal-ui.js';
import { addressName, say, genderize, spokenTime, spokenDate, dayWord, countWord, withoutPortalLinks, brandName } from './words.js';

// (إصلاح 9.1، B91-11/B91-20) الكاميرا والتسجيل ومسودات الإرسال (upload.js وrecorder.js وdrafts.js ≈ 18 KB مضغوطة)
// تُحمَّل أول مرة تفتح فيها صفحة فيها إرسال (#request و#messages)، لا مع الصفحة الرئيسية على نت ضعيف.
let CAP = null; // { photoPicker, sendWithProgress, uploadProgress, friendlyError, voiceRecorder, blobToUpload, draftStore }
let capReq = null;
const CAPTURE_VIEWS = new Set(['request', 'messages']);
/** ملف تنسيق مكوّنات التصوير والتسجيل (لم يعد في <head> الصفحة): يُضاف ويُنتظر قبل أول عرض لها فلا تظهر بلا تنسيق */
function formsCss() {
  return new Promise((resolve) => {
    let link = document.querySelector('link[data-bmf-css], link[href*="v91-b-forms.css"]');
    if (link && link.sheet) return resolve();
    if (!link) {
      link = h('link', { rel: 'stylesheet', href: '/assets/css/v91-b-forms.css', 'data-bmf-css': '1' });
      document.head.append(link);
    }
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    setTimeout(resolve, 10000);
  });
}
function loadCapture() {
  if (CAP) return Promise.resolve(CAP);
  if (!capReq) {
    capReq = Promise.all([import('./upload.js'), import('./recorder.js'), import('./drafts.js'), formsCss()]).then(
      ([u, r, d]) => (CAP = { ...u, ...r, ...d }),
      (err) => {
        capReq = null;
        throw err;
      },
    );
  }
  return capReq;
}
// تُستدعى فقط بعد loadCapture() (render ينتظرها لصفحات CAPTURE_VIEWS)
const draftStore = (...a) => CAP.draftStore(...a);
const photoPicker = (...a) => CAP.photoPicker(...a);
const voiceRecorder = (...a) => CAP.voiceRecorder(...a);
const blobToUpload = (...a) => CAP.blobToUpload(...a);
const uploadProgress = (...a) => CAP.uploadProgress(...a);
const sendWithProgress = (...a) => CAP.sendWithProgress(...a);
/** رسالة الخطأ المفهومة (upload.js)، وفي صفحة بلا إرسال (موافقة، ميعاد، مكالمة) نفس كلامها دون تحميل الوحدة */
function friendlyError(err, address = 'f') {
  if (CAP) return CAP.friendlyError(err, address);
  const t = (s) => genderize(s, address);
  if (err && err.status === 429) return err.message || t('بعت{ي} كتير في وقت قصير. استن{ي} شوية وجرب{ي} تاني.');
  if (!err || err.code === 'network_error' || err.status === 0 || err.status >= 500) return t('ما اتبعتش. اتأكد{ي} إن النت شغال وجرب{ي} تاني.');
  return err.message || t('ما اتبعتش. اتأكد{ي} إن النت شغال وجرب{ي} تاني.');
}

const root = document.getElementById('portal-root');
const token = (() => {
  const seg = window.location.pathname.split('/').filter(Boolean)[1] || '';
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
})();
const API = `/api/portal/${encodeURIComponent(token)}`;
const docHref = (id) => `${API}/documents/${encodeURIComponent(id)}`;
// مفتاح قصير لهذا الرابط (بصمة لا الرمز نفسه): ما رأته ومسودة رسالتها لا يختلطان بصفحة شخص تاني على نفس الموبايل
const LINK_KEY = (() => {
  let x = 2166136261;
  for (let i = 0; i < token.length; i++) {
    x ^= token.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(36);
})();
/** مفتاح منع التكرار لإرسال واحد (يبقى هو هو في «حاولي تاني» فلا تتسجل الرسالة مرتين) */
function newClientRef() {
  try {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, '0');
  }
}

const state = {
  data: null,
  form: 'f',
  view: 'home',
  param: null,
  story: 0,
  homeScroll: 0,
  depth: 0,
  composer: { text: '', answerId: null, invoiceNumber: null, focus: false },
  retry: null, // آخر إرسال فشل بسبب النت: { run, label }
  busy: false,
};

// ───────────── الكلمات حسب المخاطبة ─────────────

const g = (text) => genderize(text, state.form);
const s = (word) => say(word, state.form);
const money = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function shortDate(iso) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'numeric' }).formatToParts(new Date(iso));
  const d = Number(p.find((x) => x.type === 'day')?.value);
  const m = Number(p.find((x) => x.type === 'month')?.value);
  return d && m ? `${d} ${AR_MONTHS[m - 1]}` : '';
}
/** «اليوم 3:15 العصر» / «إمبارح 10 الصبح» / «7 أكتوبر» */
function whenSent(iso) {
  const d = dayWord(iso);
  if (d === 'النهارده') return `النهارده ${spokenTime(iso)}`;
  if (d === 'إمبارح') return `إمبارح ${spokenTime(iso)}`;
  return shortDate(iso);
}
/**
 * نص فيه أرقام لاتينية (REQ-2026-00029 أو INV-…) أو رابط داخل جملة عربية: كل منها في <bdi dir=ltr> حتى لا ينقلب
 * ترتيبه — الرقم لا ينكسر على سطرين (bp-ref-inline)، والرابط الطويل ينكسر أينما لزم (bp-url-inline).
 */
function rich(text) {
  return String(text ?? '')
    .split(/(\b(?:REQ|INV|RCPT)-\d{4}-\d+\b|https?:\/\/\S+)/)
    .filter((x) => x !== '')
    .map((part) =>
      /^(?:REQ|INV|RCPT)-\d{4}-\d+$/.test(part)
        ? h('bdi.bp-ref-inline', { dir: 'ltr' }, part)
        : /^https?:\/\//.test(part)
          ? h('bdi.bp-url-inline', { dir: 'ltr' }, part)
          : part,
    );
}
const spoken = (ref) => (/^REQ-\d{4}-(\d+)$/.exec(ref || '') ? String(Number(/^REQ-\d{4}-(\d+)$/.exec(ref)[1])) : '');

// ───────────── ما رأته على هذا الجهاز (الرد الجديد والرسائل الجديدة) ─────────────

// bm_seen = { <بصمة الرابط>: { a: [أرقام الردود اللي فتحتها], m: آخر رسالة شافتها } } — لكل رابط حالته
function seenAll() {
  const v = storage.json('bm_seen', {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
function seen() {
  const v = seenAll()[LINK_KEY] || {};
  return { a: Array.isArray(v.a) ? v.a.map(Number) : [], m: Number(v.m) || 0 };
}
function markSeen({ answer, msg } = {}) {
  const v = seen();
  if (answer && !v.a.includes(answer)) v.a.push(answer);
  if (msg && msg > v.m) v.m = msg;
  const all = seenAll();
  delete all[LINK_KEY];
  // أحدث 5 روابط على الأكثر (الأقدم يُحذف)
  const keep = Object.entries(all).filter(([, x]) => x && typeof x === 'object' && !Array.isArray(x)).slice(-4);
  storage.set('bm_seen', JSON.stringify(Object.fromEntries([...keep, [LINK_KEY, { a: v.a.slice(-50), m: v.m }]])));
}
const unseenAnswer = (a) => !seen().a.includes(a.id);
const lastOutId = () => Math.max(0, ...(state.data?.messages || []).filter((m) => m.direction === 'out').map((m) => m.id));
const newMessages = () => (state.data?.messages || []).filter((m) => m.direction === 'out' && m.id > seen().m).length;

// ───────────── التواصل ─────────────

function contact() {
  const c = state.data?.home?.contact || {};
  const fallback = pageContact();
  return {
    // v10 experience (X10-B3 #8): الاسم المختصر للمكتب (عنوان الصفحة واسم المرسل في الرسائل)
    org: brandName({ short: true }) || c.org_name || 'المؤسسة',
    phone: c.phone || fallback.phone,
    tel: c.phone_e164 || c.phone ? `tel:${c.phone_e164 || c.phone}` : fallback.phoneHref,
    wa: c.whatsapp_digits !== undefined ? c.whatsapp_digits : fallback.waDigits,
    hours: c.office_hours || '',
    open: c.open_now,
  };
}
const callBtn = (kind = 'secondary', extra = {}) => {
  const c = contact();
  return c.tel ? btn(`${s('اتصلي')} بينا`, { kind, icon: 'phone', href: c.tel, ...extra }) : null;
};
function waLink(text) {
  return waUrl(contact().wa, text);
}

// ───────────── التنقل بين الصفحات الفرعية ─────────────

function go(hash) {
  if (state.view === 'home') state.homeScroll = window.scrollY;
  state.depth += 1;
  window.location.hash = hash;
}
function back() {
  if (state.depth > 0) {
    state.depth -= 1;
    window.history.back();
  } else {
    window.location.hash = '';
  }
}
function parseHash() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [view, param] = raw.split('/');
  const known = ['answer', 'events', 'event', 'money', 'messages', 'papers', 'request', 'todo'];
  return known.includes(view) ? { view, param: param || null } : { view: 'home', param: null };
}
window.addEventListener('hashchange', () => {
  const prev = state.view;
  const next = parseHash();
  if (prev !== 'home' && next.view === 'home' && state.depth > 0) state.depth -= 1;
  state.view = next.view;
  state.param = next.param;
  render({ from: prev });
});

function backBar(title) {
  return h(
    'div.bp-viewhead',
    h('button.bp-back', { type: 'button', onClick: back }, ic('back', 22), h('span', 'رجوع')),
    title ? h('h1.bp-viewtitle', { tabindex: '-1' }, title) : null,
  );
}

// ───────────── «إيه المطلوب مني دلوقتي؟» ─────────────

/** ما ينتظرها بترتيب الخادم، بعد استبعاد الرد والرسالة اللذين فتحتهما على هذا الجهاز */
function pending() {
  const d = state.data;
  const out = [];
  for (const n of d.home?.next || []) {
    if (n.kind === 'request') {
      const r = d.requests.find((x) => x.id === n.id);
      if (r && r.can_reply) out.push({ ...n, r });
    } else if (n.kind === 'hearing') {
      const e = d.events.find((x) => x.id === n.id);
      if (e) out.push({ ...n, e });
    } else if (n.kind === 'answer') {
      const a = d.answers.find((x) => x.id === n.id);
      if (a && unseenAnswer(a)) out.push({ ...n, a });
    } else if (n.kind === 'reply') {
      // الإدارة سألتها في رسالة ومستنيين ردها: يفضل ظاهرًا لحد ما ترد (مش بحسب «شافته ولا لأ»)
      out.push(n);
    } else if (n.kind === 'message') {
      if (n.id > seen().m) out.push(n);
    }
  }
  return out;
}

function neededItems(r) {
  return r.items.length ? r.items.filter((i) => i.status === 'needed').map((i) => i.label) : [];
}

function hearingTitle(e) {
  const day = e.spoken?.day || dayWord(e.starts_at);
  const rel = day && !day.startsWith('يوم') ? ` (${day})` : '';
  return `عندك ${e.kind_label || 'موعد'} يوم ${e.spoken?.date || spokenDate(e.starts_at)} الساعة ${e.spoken?.time || spokenTime(e.starts_at)}${rel}`;
}

/** بطاقة واحدة لما ينتظرها (تُستخدم في «الآن» وفي #todo) */
function nowCard(item) {
  if (item.kind === 'request') {
    const r = item.r;
    const isDoc = r.kind === 'document';
    const names = neededItems(r);
    const cam = isDoc ? hiddenPicker(r, 'camera') : null;
    const gal = isDoc ? hiddenPicker(r, 'gallery') : null;
    return h(
      'section.bp-now',
      { 'aria-labelledby': `now-${r.id}` },
      h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), 'مطلوب منك'),
      h('h2.bp-now-title', { id: `now-${r.id}` }, names.length ? 'محتاجين منك:' : isDoc ? 'محتاجين منك ورقة' : 'محتاجين ردّك'),
      names.length
        ? h('ol.bp-now-list', names.map((n) => h('li', n)))
        : h('p.bp-now-text.bp-clamp', rich(r.message || '')),
      isDoc
        ? [
            btn(g('صوّر{ي} الورقة'), { kind: 'primary', icon: 'camera', block: true, onClick: () => cam.open() }),
            h('p.bp-now-alt', h('button.bp-linkbtn', { type: 'button', onClick: () => gal.open() }, g('أو اختار{ي} صورة من الموبايل'))),
            cam.input,
            gal.input,
          ]
        : btn(g('ردّ{ي} علينا'), { kind: 'primary', icon: 'message', block: true, onClick: () => go(`#request/${r.id}`) }),
    );
  }
  if (item.kind === 'hearing') {
    const e = item.e;
    return h(
      'section.bp-now',
      { 'aria-labelledby': `now-e${e.id}` },
      h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), g('لازم تحضر{ي} بنفسك')),
      h('h2.bp-now-title', { id: `now-e${e.id}` }, hearingTitle(e)),
      e.location ? h('p.bp-now-text', e.location) : null,
      btn('إيه المطلوب مني؟', { kind: 'primary', block: true, onClick: () => go(`#event/${e.id}`) }),
    );
  }
  if (item.kind === 'reply') {
    return h(
      'section.bp-now',
      { 'aria-labelledby': 'now-reply' },
      h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), 'مطلوب منك'),
      h('h2.bp-now-title', { id: 'now-reply' }, 'محتاجين ردّك'),
      item.text ? h('p.bp-now-text.bp-clamp', rich(item.text)) : null,
      btn(g('ردّ{ي} علينا'), { kind: 'primary', icon: 'message', block: true, onClick: () => openComposer({}) }),
    );
  }
  if (item.kind === 'answer') {
    return h(
      'section.bp-now',
      h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), 'وصلك ردّنا'),
      h('h2.bp-now-title', 'ردّنا على مشكلتك جاهز'),
      btn(`${s('اقري')} الرد`, { kind: 'primary', icon: 'file', block: true, onClick: () => go('#answer') }),
    );
  }
  return h(
    'section.bp-now',
    h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), 'رسالة جديدة'),
    h('h2.bp-now-title.bp-clamp', item.text || 'وصلتك رسالة مننا'),
    btn(`${s('اقري')} الرسالة`, { kind: 'primary', icon: 'message', block: true, onClick: () => go('#messages') }),
  );
}

/**
 * زر «صوّري الورقة» في البطاقة الرئيسية يفتح الكاميرا فورًا (نفس لمسة المستخدم)، والصور المختارة تنتقل
 * لصفحة الطلب جاهزة للإرسال على أول ورقة لسه ناقصة.
 */
const handoff = new Map(); // requestId → File[]
function hiddenPicker(r, mode) {
  const input = h('input.bp-hidden-file', {
    type: 'file',
    accept: mode === 'camera' ? 'image/*' : 'image/*,application/pdf',
    capture: mode === 'camera' ? 'environment' : null,
    multiple: mode !== 'camera',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  input.addEventListener('change', () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    handoff.set(r.id, files);
    go(`#request/${r.id}`);
  });
  return { input, open: () => input.click() };
}

// ───────────── الصفحة الرئيسية ─────────────

function greeting() {
  const home = state.data.home;
  const name = home.name || addressName(state.data.client?.name);
  return h(
    'header.bp-greet',
    h('h1', name ? `أهلًا يا ${name}` : g('أهلًا بيك{ي}')),
    h('p.bp-sub', 'دي صفحتك. محدش غيرك يقدر يشوفها.'),
    h('div.bp-greet-contact', contactButtons()),
  );
}

function contactButtons() {
  const c = contact();
  const ref = state.data?.home?.ref;
  const wa = waLink(`السلام عليكم، بتابع طلبي${ref ? ` رقم ${ref}` : ''}`);
  return [
    c.tel ? btn(`${s('اتصلي')} بينا`, { kind: 'secondary', icon: 'phone', href: c.tel, className: 'bp-bar-call' }) : null,
    wa
      ? btn('واتساب', { kind: 'whatsapp', icon: 'whatsapp', href: wa, className: 'bp-bar-wa' })
      : btn(g('اكتب{ي}لنا'), { kind: 'whatsapp', icon: 'message', className: 'bp-bar-wa', onClick: () => openComposer({}) }),
  ];
}

function hoursLine() {
  const c = contact();
  if (c.open === false && c.hours) return h('p.bp-hours.is-closed', g(`إحنا مقفولين دلوقتي. بنرد ${c.hours}. سيب{ي}لنا رسالة وهنرد أول ما نفتح.`));
  return c.hours ? h('p.bp-hours', `بنرد ${c.hours}`) : null;
}

function stories() {
  const list = state.data.home.stories || [];
  if (list.length < 2) return null;
  return h(
    'section.bp-card.bp-stories',
    { 'aria-label': 'طلباتك' },
    h('h2.bp-card-title', `عندك ${countWord(list.length, ['طلب واحد', 'طلبين', 'طلبات', 'طلب'])}`),
    h(
      'ul.bp-rows',
      list.map((st, i) =>
        h(
          'li',
          h(
            'button.bp-row',
            { type: 'button', 'aria-pressed': String(i === state.story), class: i === state.story ? 'is-on' : null, onClick: () => ((state.story = i), render()) },
            h('span.bp-row-main', h('span.bp-row-title', /^REQ-/.test(st.ref) ? ['طلب ', h('bdi', { dir: 'ltr' }, st.ref)] : 'طلبك'), h('span.bp-row-sub', st.stage.title)),
            i === state.story ? ic('check', 20) : ic('chevron', 20),
          ),
        ),
      ),
    ),
  );
}

function tracker() {
  const st = (state.data.home.stories || [])[state.story] || (state.data.home.stories || [])[0];
  if (!st) return null;
  return h(
    'section.bp-card.bp-track',
    { 'aria-labelledby': 'bp-track-title' },
    h('h2.bp-card-title#bp-track-title', 'طلبك وصل لفين؟'),
    h(
      'ol.bp-steps',
      st.stage.steps.map((x) =>
        h(
          'li.bp-step',
          { class: `is-${x.state}`, 'aria-current': x.state === 'current' ? 'step' : null },
          h('span.bp-step-dot', { 'aria-hidden': 'true' }, x.state === 'done' ? ic('check', 16) : String(x.n)),
          h('span.bp-step-text', h('span.bp-step-title', x.title), x.hint && (x.state === 'current' || x.n === st.stage.step) ? h('span.bp-step-hint', x.hint) : null, h('span.bp-sr', x.state === 'done' ? ' (خلص)' : x.state === 'current' ? ' (إحنا هنا دلوقتي)' : '')),
        ),
      ),
    ),
  );
}

function sectionList() {
  const d = state.data;
  const rows = [];
  const pill = (text, tone = '') => h('span.bp-pill', { class: tone ? `is-${tone}` : null }, text);
  if (d.answers.length) rows.push(['#answer', 'file', g('ردّنا عليك{ي}'), d.answers.some(unseenAnswer) ? pill('جديد', 'ok') : null]);
  if (d.events.length) rows.push(['#events', 'calendar', 'مواعيدك', pill(spokenDate(d.events[0].starts_at))]);
  if (d.invoices.length) {
    const m = d.home.money || {};
    rows.push(['#money', 'wallet', 'مصاريف', m.needs_agreement ? pill('محتاجين موافقتك', 'amber') : m.unpaid_total > 0 ? pill(money(m.unpaid_total), 'amber') : pill('مفيش مبالغ', 'ok')]);
  }
  const fresh = newMessages();
  rows.push(['#messages', 'message', 'الرسائل', fresh ? pill(`${fresh} جديدة`, 'ok') : null]);
  if (papers().length) rows.push(['#papers', 'file', 'الورق', pill(String(papers().length))]);
  return h(
    'nav.bp-card.bp-list',
    { 'aria-label': 'أقسام صفحتك' },
    h(
      'ul.bp-rows',
      rows.map(([href, icon, label, p]) =>
        h('li', h('a.bp-row', { href, onClick: (e) => (e.preventDefault(), go(href)) }, ic(icon, 22), h('span.bp-row-main', h('span.bp-row-title', label)), p, ic('chevron', 20))),
      ),
    ),
  );
}

function refLine() {
  const ref = state.data.home.ref;
  if (!ref || !/^REQ-/.test(ref)) return null;
  const n = state.data.home.spoken_ref || spoken(ref);
  // B91-21: رقم تقدر تقوله في التليفون («طلب رقم 29») بجانب الرقم الكامل
  return h(
    'p.bp-ref',
    'رقم طلبك: ',
    h('bdi.bp-code', { dir: 'ltr' }, ref),
    n ? [g(' — لو كلمت{ي}نا قول{ي}: '), h('strong', `طلب رقم ${n}`)] : g(' — قول{ي}ه لو كلمت{ي}نا'),
  );
}

function homeView() {
  const items = pending();
  const first = items[0];
  const rest = items.length - 1;
  let now;
  if (first) {
    now = nowCard(first);
    // «وكمان {2} حاجات تانية» تحت الزر داخل نفس البطاقة (#todo فيها كل المطلوب)
    if (rest > 0) now.append(h('p.bp-more', h('a', { href: '#todo', onClick: (e) => (e.preventDefault(), go('#todo')) }, `وكمان ${countWord(rest, ['حاجة تانية', 'حاجتين تانيين', 'حاجات تانية', 'حاجة تانية'])}`)));
  } else {
    now = h(
      'section.bp-now.is-calm',
      h('span.bp-calm-ic', ic('checkCircle', 28)),
      h('div', h('h2.bp-now-title', 'مفيش حاجة مطلوبة منك دلوقتي.'), h('p.bp-now-text', state.data.home.whatsapp_confirmed ? 'هنبعتلك على واتساب أول ما يجدّ جديد.' : g('ادخل{ي} على الصفحة دي كل كام يوم عشان تشوف{ي} الجديد.'))),
    );
  }
  return [
    greeting(),
    now,
    waConfirmCard(),
    stories(),
    tracker(),
    sectionList(),
    h('div.bp-callback', btn(`${s('اطلبي')} مكالمة`, { kind: 'secondary', icon: 'phone', block: true, onClick: openCallback })),
    refLine(),
  ];
}

/**
 * (إصلاح 9.1، B91-01) لم تؤكد رقمها على واتساب بعد: بطاقة ثانوية تعرض رسالة التأكيد مرة تانية (الرابط نفسه من شاشة
 * «وصلنا طلبك» على هذا الموبايل). بعد التأكيد تختفي ويُمسح الرابط.
 */
function waConfirmCard() {
  const home = state.data.home;
  if (home.whatsapp_confirmed) {
    storage.del(WA_CONFIRM_KEY);
    return null;
  }
  const url = savedWaConfirm([home.ref, ...(home.stories || []).map((x) => x.ref)].filter(Boolean));
  if (!url) return null;
  return h(
    'section.bp-card.bp-waconfirm',
    { 'aria-labelledby': 'bp-wa-title' },
    h('h2.bp-card-title#bp-wa-title', g('عايز{ة} يوصلك الجديد على واتساب؟')),
    h('p.bp-hint', g('ابعت{ي}لنا رقم طلبك برسالة واحدة على واتساب، وبعدها هنبعتلك كل جديد هناك.')),
    btn(g('ابعت{ي} رقم طلبك'), { kind: 'whatsapp', icon: 'whatsapp', href: url, block: true }),
  );
}

function forgetLine() {
  return h(
    'p.bp-forget',
    h(
      'button.bp-linkbtn',
      {
        type: 'button',
        onClick: async () => {
          await forgetThisPhone();
          toast(g('مسحنا الصفحة من الموبايل ده. الرابط نفسه لسه شغال لو احتجتيه.'), 'info');
        },
      },
      g('مش موبايلك؟ امسح{ي} الصفحة من الموبايل ده'),
    ),
  );
}

// ───────────── الورق المطلوب (#request/<id>) ─────────────

function requestView(id) {
  const r = state.data.requests.find((x) => String(x.id) === String(id));
  if (!r) return notFoundView('الطلب ده خلص أو مش موجود.');
  const isDoc = r.kind === 'document';
  const draft = draftStore(`request-${r.id}`);
  const pickers = new Map(); // رقم البند (أو -1 للطلب بلا بنود) → منتقي الصور
  let note = '';
  let voice = null;
  const errBox = h('div.bp-send-error', { hidden: true, role: 'alert' });
  const progressHost = h('div');
  const restoreHost = h('div');

  const saveDraft = () => {
    const photos = {};
    for (const [k, p] of pickers) if (p.getFiles().length) photos[k] = p.getFiles();
    const hasAny = Object.keys(photos).length || note.trim() || voice;
    if (!hasAny) draft.clear();
    else draft.saveSoon({ note, photos, voice });
  };

  let tipShown = 0;
  const rows = (r.items.length ? r.items : [{ label: null, status: r.files.length ? 'received' : 'needed', files: r.files }]).map((it, idx) => {
    const key = r.items.length ? idx : -1;
    const label = it.label || 'الورقة المطلوبة';
    const statusPill =
      it.status === 'received'
        ? h('span.bp-pill.is-ok', `وصلتنا ✓ ${it.files.length ? whenSent(it.files[it.files.length - 1].at) : ''}`.trim())
        : it.status === 'missing'
          ? h('span.bp-pill', g('قلت{ي} إنها مش موجودة'))
          : h('span.bp-pill', 'لسه');
    const canAdd = r.can_reply && (it.status !== 'received' || !r.items.length) && isDoc;
    let picker = null;
    if (canAdd) {
      picker = photoPicker({
        label: s('صوّري'),
        variant: 'row',
        max: 5,
        address: state.form,
        namePrefix: label,
        // نصيحة التصوير تحت الزر لا قبله: أول ما تصل له بالتنقل هو «صوّري»
        tip: false,
        onChange: () => {
          saveDraft();
          syncSend();
        },
      });
      pickers.set(key, picker);
    }
    const files = it.files.length
      ? h(
          'ul.bp-sent-files',
          it.files.map((f, i) => h('li', h('a', { href: docHref(f.id), target: '_blank', rel: 'noopener noreferrer' }, ic(/^image\//.test(f.mime || '') ? 'image' : 'file', 18), `صورة ${i + 1} · ${shortDate(f.at)}`))),
        )
      : null;
    const missingBtn =
      r.items.length && it.status === 'needed' && r.can_reply
        ? h('button.bp-linkbtn.bp-missing', { type: 'button', onClick: () => markMissing(r, idx, label) }, `مش ${state.form === 'm' ? 'لاقي' : 'لاقية'} الورقة دي`)
        : null;
    return h('li.bp-item', { class: `is-${it.status}` }, h('div.bp-item-head', h('span.bp-item-name', label), statusPill), picker, picker && !tipShown++ ? photoTip() : null, files, missingBtn);
  });

  // ملاحظة اختيارية: نص أو رسالة صوتية
  const ta = h('textarea.bp-input', {
    id: `req-note-${r.id}`,
    rows: 3,
    maxlength: 5000,
    placeholder: g('اكتب{ي} هنا…'),
    onInput: () => {
      note = ta.value;
      saveDraft();
      syncSend();
    },
  });
  const rec = voiceRecorder({
    maxSeconds: 180,
    variant: 'compact',
    address: state.form,
    whatsappUrl: waLink('السلام عليكم، هبعتلكم رسالة صوتية على طلبي'),
    onChange: (blob, meta) => {
      voice = blob ? { blob, seconds: meta?.seconds || 0 } : null;
      saveDraft();
      syncSend();
    },
  });
  const noteBlock = isDoc
    ? h('details.bp-note', h('summary', g('عايز{ة} تقول{ي} حاجة؟')), h('label.bp-sr', { htmlFor: ta.id }, 'ملاحظة'), ta, rec)
    : h('div.bp-note.is-open', h('label.bp-label', { htmlFor: ta.id }, g('اكتب{ي} ردّك أو سجّل{ي} رسالة صوتية')), rec, ta);

  // صور لطلب «معلومة» (اختيارية)
  let infoPicker = null;
  if (!isDoc && r.can_reply) {
    infoPicker = photoPicker({ label: g('صوّر{ي} ورقة (لو حاب{ة})'), variant: 'row', max: 5, address: state.form, namePrefix: 'ورقة', onChange: () => (saveDraft(), syncSend()) });
    pickers.set(-1, infoPicker);
  }

  const sendBtn = btn(isDoc ? g('ابعت{ي} الورق') : g('ابعت{ي} ردّك'), { kind: 'primary', icon: 'send', block: true, onClick: () => submit() });
  const hint = h('p.bp-send-hint', { role: 'status', 'aria-live': 'polite' });
  function hasContent() {
    for (const p of pickers.values()) if (p.getFiles().length) return true;
    return !!note.trim() || !!voice;
  }
  function syncSend() {
    sendBtn.classList.toggle('is-soft', !hasContent());
    if (hasContent()) hint.textContent = '';
  }

  async function submit(retryBody) {
    if (state.busy) return;
    if (!retryBody && !hasContent()) {
      hint.textContent = isDoc ? g('صوّر{ي} ورقة الأول') : g('اكتب{ي} ردّك أو سجّل{ي} رسالة صوتية الأول');
      return;
    }
    errBox.hidden = true;
    let body = retryBody;
    if (!body) {
      const documents = [];
      for (const [k, p] of pickers) {
        const ups = await p.getUploads();
        for (const u of ups) documents.push(k >= 0 ? { ...u, item: k } : u);
      }
      if (voice?.blob) documents.push(await blobToUpload(voice.blob, 'رسالة-صوتية'));
      body = { body: note.trim(), documents, client_ref: newClientRef() };
    }
    await runSend(`${API}/requests/${r.id}/reply`, body, {
      host: progressHost,
      lock: (on) => {
        for (const p of pickers.values()) p.setDisabled?.(on);
        rec.setDisabled?.(on);
        ta.disabled = on;
        sendBtn.disabled = on;
      },
      errBox,
      onDone: async () => {
        await draft.clear();
        haptic('success'); // v10 (X10-M6): الورق وصل فعلًا
        toast(isDoc ? 'وصلنا الورق. شكرًا!' : 'وصلنا ردّك. شكرًا!');
        await refresh();
      },
      retry: (b) => submit(b),
    });
  }

  // صور اختارتها من البطاقة الرئيسية ← أول ورقة ناقصة
  const handed = handoff.get(r.id);
  if (handed) {
    handoff.delete(r.id);
    const firstNeeded = r.items.length ? r.items.findIndex((i) => i.status !== 'received') : -1;
    const p = pickers.get(firstNeeded) || pickers.values().next().value;
    if (p) {
      // نفس معالجة الاختيار من المنتقي (التصغير والتسمية)
      const input = p.querySelector('input[type=file]:not([capture])') || p.querySelector('input[type=file]');
      try {
        const dt = new DataTransfer();
        handed.forEach((f) => dt.items.add(f));
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      } catch {
        p.setFiles?.(handed);
      }
    }
  } else {
    // مسودة لم تُرسل (اتقفلت الصفحة أو قطع النت)
    draft.load().then((dr) => {
      if (!dr) return;
      const photos = dr.photos || {};
      const count = Object.values(photos).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
      if (!count && !dr.voice && !(dr.note || '').trim()) return;
      for (const [k, list] of Object.entries(photos)) pickers.get(Number(k))?.setFiles?.(list);
      if (dr.note) {
        ta.value = dr.note;
        note = dr.note;
      }
      if (dr.voice?.blob) {
        rec.setRecording?.(dr.voice);
        voice = dr.voice;
      }
      syncSend();
      mount(
        restoreHost,
        h(
          'div.bp-restore',
          { role: 'status' },
          h('p', dr._blobsLost ? 'الصور والتسجيل محتاجين يتعملوا تاني.' : g('صورك اللي ما اتبعتتش لسه موجودة.')),
          h(
            'div.bp-actions',
            btn(g('ابعت{ي}ها'), { kind: 'primary', onClick: () => (mount(restoreHost), submit()) }),
            btn(g('امسح{ي}ها'), {
              kind: 'secondary',
              onClick: async () => {
                for (const p of pickers.values()) p.clear?.();
                rec.reset?.();
                ta.value = '';
                note = '';
                voice = null;
                await draft.clear();
                mount(restoreHost);
                syncSend();
              },
            }),
          ),
        ),
      );
    });
  }

  const allDone = r.items.length && r.all_done;
  const intro = r.message ? h('p.bp-msg.bp-clamp3', rich(r.message)) : null;
  const more = r.message && r.message.length > 140 ? h('button.bp-linkbtn', { type: 'button', onClick: (e) => (intro.classList.remove('bp-clamp3'), e.currentTarget.remove()) }, `${s('اقري')} أكتر`) : null;
  syncSend();
  return [
    backBar(isDoc ? 'محتاجين منك' : 'محتاجين ردّك'),
    h('section.bp-card.bp-request', intro, more, restoreHost, h('ul.bp-items', rows)),
    allDone ? h('p.bp-done', ic('checkCircle', 22), g('بعت{ي}لنا كل الورق المطلوب. شكرًا!')) : null,
    r.can_reply ? h('section.bp-card', infoPicker, noteBlock, errBox, progressHost, hint, sendBtn) : !allDone ? h('p.bp-done', ic('checkCircle', 22), 'وصلنا ردّك، وفريقنا بيراجعه.') : null,
  ];
}

/** «حطي الورقة على ترابيزة…» مرة واحدة على الموبايل (نفس مفتاح upload.js)، وتختفي بـ«تمام» */
function photoTip() {
  if (storage.get('bm_photo_tip_off') === '1') return null;
  const tip = h(
    'div.bp-tip',
    h('p', g('حط{ي} الورقة على ترابيزة في مكان منوّر، وخل{ي} الأربع أركان باينين.')),
    h('button.bp-linkbtn', { type: 'button', onClick: () => (storage.set('bm_photo_tip_off', '1'), tip.remove()) }, 'تمام'),
  );
  return tip;
}

async function markMissing(r, idx, label) {
  if (state.busy) return;
  try {
    state.busy = true;
    await postJson(`${API}/requests/${r.id}/reply`, { missing_items: [idx] });
    toast('تمام، عرّفنا الفريق. هنكلمك لو في حل تاني.');
    await refresh();
  } catch (err) {
    toast(friendlyError(err, state.form), 'warn');
  } finally {
    state.busy = false;
  }
  void label;
}

/**
 * إرسال بنسبة تقدم وزر «وقّفي»؛ الفشل يُبقي الملفات ويعرض «ما اتبعتش… حاولي تاني»،
 * وعودة النت تعرض «النت رجع. تحبي تبعتي دلوقتي؟».
 */
async function runSend(url, body, { host, lock, errBox, onDone, retry }) {
  state.busy = true;
  const ctrl = new AbortController();
  const bar = uploadProgress({ address: state.form, onCancel: () => ctrl.abort() });
  mount(host, bar);
  lock(true);
  try {
    await sendWithProgress(url, body, { onProgress: (f) => bar.set(f), signal: ctrl.signal });
    state.retry = null;
    mount(host);
    lock(false);
    state.busy = false;
    await onDone();
  } catch (err) {
    mount(host);
    lock(false);
    state.busy = false;
    const net = err && (err.code === 'network_error' || err.status === 0);
    const msg = err?.code === 'aborted' ? friendlyError(err, state.form) : net ? g('ما اتبعتش. النت ضعيف؟ جرب{ي} تاني.') : friendlyError(err, state.form);
    mount(errBox, h('p', msg), btn(g('حاول{ي} تاني'), { kind: 'secondary', onClick: () => retry(body) }));
    errBox.hidden = false;
    if (net) state.retry = { run: () => retry(body) };
  }
}

window.addEventListener('online', () => {
  if (!state.data) {
    load();
    return;
  }
  if (state.retry) {
    const t = toast(g('النت رجع. تحب{ي} تبعت{ي} دلوقتي؟'), 'info', 10000);
    const run = state.retry.run;
    t.append(h('button.bp-toast-btn', { type: 'button', onClick: () => (t.remove(), run()) }, g('ابعت{ي}')));
  }
});

// ───────────── الرد (#answer) ─────────────

let speaking = null;
function arabicVoice() {
  try {
    return (window.speechSynthesis?.getVoices() || []).find((v) => /^ar/i.test(v.lang)) || null;
  } catch {
    return null;
  }
}

function listenButton(a) {
  if (!a.summary || !('speechSynthesis' in window) || !arabicVoice()) return null;
  const b = btn(g('اسمع{ي} الرد'), { kind: 'secondary', icon: 'speaker' });
  b.addEventListener('click', () => {
    const synth = window.speechSynthesis;
    if (speaking === a.id) {
      synth.cancel();
      speaking = null;
      b.querySelector('span').textContent = g('اسمع{ي} الرد');
      return;
    }
    synth.cancel();
    const steps = (a.steps || []).map((x, i) => `${i + 1}. ${x}`).join('. ');
    const u = new SpeechSynthesisUtterance(`${a.summary}${steps ? `. تعمل${state.form === 'm' ? '' : 'ي'} إيه دلوقتي: ${steps}` : ''}`);
    const v = arabicVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = 0.9;
    u.onend = () => {
      speaking = null;
      b.querySelector('span').textContent = g('اسمع{ي} الرد');
    };
    speaking = a.id;
    b.querySelector('span').textContent = g('وقّف{ي}');
    synth.speak(u);
  });
  return b;
}

function fullText(body) {
  const paras = String(body || '')
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.map((p) => (/^التوصية/.test(p) ? h('p.bp-strong', rich(p)) : h('p', rich(p))));
}

function stepsList(a) {
  if (!a.steps?.length) return null;
  const key = `bm_steps_${a.id}`;
  const done = new Set(storage.json(key, []));
  return h(
    'section.bp-steps-todo',
    h('h3', g('تعمل{ي} إيه دلوقتي؟')),
    h(
      'ol',
      a.steps.map((st, i) => {
        const id = `step-${a.id}-${i}`;
        const cb = h('input', {
          type: 'checkbox',
          id,
          checked: done.has(i),
          onChange: () => {
            if (cb.checked) done.add(i);
            else done.delete(i);
            storage.set(key, JSON.stringify([...done]));
            li.classList.toggle('is-done', cb.checked);
          },
        });
        const li = h('li.bp-todo', { class: done.has(i) ? 'is-done' : null }, h('span.bp-todo-n', String(i + 1)), h('span.bp-todo-text', st), h('label.bp-todo-check', { htmlFor: id }, cb, h('span', 'خلّصتها')));
        return li;
      }),
    ),
  );
}

function answerView() {
  const answers = [...state.data.answers].sort((x, y) => String(y.sent_at).localeCompare(String(x.sent_at)));
  if (!answers.length) return notFoundView('لسه مفيش رد. أول ما يجهز هيظهر هنا.');
  answers.forEach((a) => markSeen({ answer: a.id }));
  return [
    backBar(g('ردّنا عليك{ي}')),
    ...answers.map((a) =>
      h(
        'article.bp-card.bp-answer',
        h('p.bp-meta', `اتبعت ${shortDate(a.sent_at)}`),
        a.voice ? h('div.bp-voice', h('p', 'رسالة صوتية من المؤسسة'), h('audio', { controls: true, preload: 'none', src: docHref(a.voice.id) })) : null,
        listenButton(a),
        a.summary ? h('section.bp-summary', h('h3', 'الخلاصة'), h('p', a.summary)) : null,
        stepsList(a),
        a.summary ? h('details.bp-full', h('summary', `${s('اقري')} الرد كامل`), h('div.bp-fulltext', fullText(a.body))) : h('div.bp-fulltext.is-open', fullText(a.body)),
        h(
          'div.bp-actions',
          btn(state.form === 'm' ? 'مش فاهم حاجة؟ اسألنا' : 'مش فاهمة حاجة؟ اسألينا', {
            kind: 'secondary',
            icon: 'message',
            block: true,
            onClick: () => openComposer({ text: 'عندي سؤال على الرد: ', answerId: a.id }),
          }),
          callBtn('ghost', { block: true }),
        ),
      ),
    ),
  ];
}

// ───────────── المواعيد (#events و #event/<id>) ─────────────

function eventsView() {
  const ev = state.data.events;
  if (!ev.length) return notFoundView('مفيش مواعيد جاية.');
  return [
    backBar('مواعيدك'),
    h(
      'ul.bp-cards',
      ev.map((e) =>
        h(
          'li',
          h(
            'a.bp-card.bp-event-link',
            { href: `#event/${e.id}`, onClick: (x) => (x.preventDefault(), go(`#event/${e.id}`)) },
            h('span.bp-event-date', h('span', spokenDate(e.starts_at)), h('span.bp-meta', `الساعة ${spokenTime(e.starts_at)} (${e.spoken?.day || dayWord(e.starts_at)})`)),
            h('span.bp-event-what', e.kind_label, e.client_attendance_required ? h('span.bp-pill.is-amber', g('لازم تحضر{ي}')) : null),
            e.location ? h('span.bp-meta', e.location) : null,
            e.client_response ? h('span.bp-pill.is-ok', `ردّك: ${responseText(e.client_response)}`) : null,
          ),
        ),
      ),
    ),
  ];
}

function responseText(v) {
  return v === 'yes' ? 'هحضر ✓' : v === 'no' ? (state.form === 'm' ? 'مش هقدر أحضر' : 'مش هقدر أحضر') : 'عندي سؤال';
}

function calendarUrl(e) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(e.starts_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const text = `${e.kind_label || 'موعد'}${e.location ? ` — ${e.location}` : ''}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${fmt(start)}/${fmt(end)}${e.location ? `&location=${encodeURIComponent(e.location)}` : ''}`;
}

function eventView(id) {
  const e = state.data.events.find((x) => String(x.id) === String(id));
  if (!e) return notFoundView('الميعاد ده عدّى أو مش موجود.');
  // «هاتي معاكي» لميعاد لازم تحضره بنفسها (أو لو الإدارة كتبت لها حاجة تجيبها)، لا لمواعيد المحامي وحده
  const bring = e.client_note?.length ? e.client_note : e.client_attendance_required ? ['بطاقتك الشخصية', 'أي ورق يخص القضية'] : [];
  const host = h('div.bp-respond');
  let editing = !e.client_response;
  const respond = async (answer) => {
    if (state.busy) return;
    state.busy = true;
    try {
      await postJson(`${API}/events/${e.id}/response`, { answer });
      if (answer !== 'question') haptic('commit'); // v10 (X10-M6): «هحضر» / «مش هقدر»
      e.client_response = answer;
      editing = false;
      toast(answer === 'yes' ? 'تمام، عرّفنا الفريق.' : answer === 'no' ? 'تمام، هنكلمك بخصوص الميعاد.' : g('تمام. اكتب{ي} سؤالك وهنرد عليك{ي}.'));
      paint();
      if (answer === 'question') openComposer({ text: `عندي سؤال على ${e.kind_label} يوم ${spokenDate(e.starts_at)}: ` });
      refresh({ quiet: true });
    } catch (err) {
      toast(friendlyError(err, state.form), 'warn');
    } finally {
      state.busy = false;
    }
  };
  function paint() {
    if (!e.client_attendance_required) return mount(host);
    if (!editing && e.client_response) {
      return mount(
        host,
        h('p.bp-response', ic('checkCircle', 22), h('span', `ردّك: ${responseText(e.client_response)}`), h('button.bp-linkbtn', { type: 'button', onClick: () => ((editing = true), paint()) }, g('غيّر{ي} الرد'))),
      );
    }
    return mount(
      host,
      btn('هحضر إن شاء الله', { kind: 'primary', block: true, onClick: () => respond('yes') }),
      btn('مش هقدر أحضر', { kind: 'secondary', block: true, onClick: () => respond('no') }),
      btn('عندي سؤال', { kind: 'text', block: true, onClick: () => respond('question') }),
    );
  }
  paint();
  return [
    backBar(`${e.kind_label} يوم ${spokenDate(e.starts_at)}`),
    h(
      'section.bp-card.bp-event',
      h('p.bp-line', ic('clock', 22), h('span', `الساعة ${spokenTime(e.starts_at)} (${e.spoken?.day || dayWord(e.starts_at)})`)),
      e.location ? h('p.bp-line', ic('pin', 22), h('span', `المكان: ${e.location}`)) : null,
      e.map_url ? btn(g('افتح{ي} الخريطة'), { kind: 'ghost', icon: 'map', href: e.map_url }) : null,
      bring.length ? h('div.bp-bring', h('h3', g('هات{ي} معاك{ي}')), h('ul', bring.map((x) => h('li', x)))) : null,
      e.meet_note ? h('div.bp-meet', h('h3', 'المحامي هيقابلك فين؟'), h('p', e.meet_note.replace(/^المحامي\s+\S+\s+/, '').trim() || e.meet_note)) : null,
      host,
      h('p.bp-cal', h('a', { href: calendarUrl(e), target: '_blank', rel: 'noopener noreferrer' }, ic('calendar', 18), g('ضيف{ي}ها لتقويم الموبايل'))),
    ),
  ];
}

// ───────────── المصاريف (#money) ─────────────

function moneyView() {
  const inv = state.data.invoices;
  if (!inv.length) return notFoundView('مفيش مصاريف.');
  const m = state.data.home.money || {};
  const agreeCard = (i) =>
    h(
      'section.bp-card.bp-consent',
      h('p.bp-kicker', h('span.bp-dot', { 'aria-hidden': 'true' }), g('محتاجين موافقتك')),
      h('h2.bp-now-title', `مصاريف للقضية: ${money(i.amount)} (${i.description})`),
      h('p', 'الاستشارة نفسها مجانية. المبلغ ده مصاريف المحكمة.'),
      btn('موافقة', { kind: 'primary', block: true, onClick: () => invoiceAnswer(i, 'agree') }),
      btn('عندي سؤال', { kind: 'secondary', block: true, onClick: () => openComposer({ text: `عندي سؤال على مبلغ ${money(i.amount)}: `, invoiceNumber: i.number }) }),
      btn(state.form === 'm' ? 'مش قادر أدفع' : 'مش قادرة أدفع', { kind: 'text', block: true, onClick: () => invoiceAnswer(i, 'cannot_pay') }),
    );
  const card = (i) => {
    const remaining = Math.max(0, Number(i.amount) - Number(i.paid_amount || 0));
    const pill =
      i.status === 'paid'
        ? h('span.bp-pill.is-ok', 'اتدفعت ✓')
        : i.status === 'partially_paid'
          ? h('span.bp-pill.is-amber', `اتدفع ${money(i.paid_amount)} من ${money(i.amount)}`)
          : h('span.bp-pill.is-amber', 'لسه ما اتدفعتش');
    return h(
      'article.bp-card.bp-invoice',
      h('p.bp-inv-desc', i.description),
      h('p.bp-inv-amount', money(i.amount)),
      pill,
      i.status !== 'paid' && i.due_at
        ? i.days_overdue > 0
          ? h('p.bp-inv-due.is-past', g('الميعاد عدّى — كلمينا لو محتاج{ة} وقت').replace('كلمينا', s('كلمينا')))
          : h('p.bp-inv-due', `آخر ميعاد: ${shortDate(i.due_at)}`)
        : null,
      i.client_agreed_at ? h('p.bp-meta', `${state.form === 'm' ? 'وافقت' : 'وافقتي'} يوم ${shortDate(i.client_agreed_at)}`) : null,
      i.client_response === 'cannot_pay' ? h('p.bp-meta', g('وصلنا إنك مش قادر{ة} تدفع{ي}. هنكلمك ونشوف إزاي نساعدك.')) : null,
      i.status !== 'paid'
        ? btn('عندي سؤال على المبلغ', { kind: 'secondary', block: true, onClick: () => openComposer({ text: `عندي سؤال على مبلغ ${money(remaining || i.amount)}`, invoiceNumber: i.number }) })
        : null,
      h('p.bp-small', 'رقم الفاتورة: ', h('bdi', { dir: 'ltr' }, i.number), ' (لو احتجتيه)'.replace('احتجتيه', state.form === 'm' ? 'احتجته' : 'احتجتيه')),
    );
  };
  return [
    backBar('مصاريف قضيتك'),
    h(
      'section.bp-info',
      h('p', 'الاستشارة نفسها مجانية. المبالغ دي مصاريف خاصة بالقضية في المحكمة.'),
      h('p', g(`لو مش قادر{ة} تدفع{ي} أو عندك سؤال، ${s('كلمينا')} قبل ما تدفع{ي} أي حاجة.`)),
      h('p', g('ادفع{ي} للمؤسسة بس، وخد{ي} إيصال دايمًا.')),
    ),
    ...inv.filter((i) => i.needs_agreement).map(agreeCard),
    ...inv.map(card),
    m.payment_instructions ? h('details.bp-card.bp-howpay', h('summary', 'إزاي أدفع؟'), h('p', m.payment_instructions)) : null,
  ];
}

async function invoiceAnswer(i, answer) {
  if (state.busy) return;
  state.busy = true;
  try {
    await postJson(`${API}/invoices/${encodeURIComponent(i.number)}/response`, { answer });
    if (answer === 'agree') haptic('commit'); // v10 (X10-M6): «موافقة»
    toast(answer === 'agree' ? 'تمام، وصلتنا موافقتك.' : 'وصلنا. هنكلمك ونشوف إزاي نساعدك.');
    await refresh();
  } catch (err) {
    toast(friendlyError(err, state.form), 'warn');
  } finally {
    state.busy = false;
  }
}

// ───────────── الرسائل (#messages) ─────────────

const CHANNEL = { whatsapp: 'واتساب', website: 'صفحتك', phone: 'تليفون', walk_in: 'في المؤسسة', email: 'بريد' };

function bubble(m) {
  const mine = m.direction === 'in';
  // (إصلاح 9.1) نسخة واتساب فيها «الرد كامل على صفحتك: /p/…»: على صفحتها نفسها يُحذف سطر الرابط (رابط آخر لنفس الصفحة)
  const body = m.body && !/^\[(مرفقات|مستند مرفق ردًا على الطلب)\]$/.test(m.body) ? withoutPortalLinks(m.body) : '';
  return h(
    'li.bp-bubble',
    { class: mine ? 'is-mine' : 'is-ours' },
    h('p.bp-bubble-who', mine ? s('إنتي') : h('bdi', /[؀-ۿ]/.test(contact().org) ? null : { dir: 'ltr', lang: 'en' }, contact().org), h('span.bp-bubble-ch', ` · ${CHANNEL[m.channel] || ''}`)),
    body ? h('p.bp-bubble-text', { dir: 'auto' }, rich(body)) : null,
    (m.documents || []).map((d) =>
      /^audio\//.test(d.mime || '')
        ? h('audio', { controls: true, preload: 'metadata', src: docHref(d.id), 'aria-label': 'رسالة صوتية' })
        : // اسم الملف («ورقة-1.jpg») في <bdi dir=ltr>: كان يظهر «jpg.1-ورقة»
          h('a.bp-doc', { href: docHref(d.id), target: '_blank', rel: 'noopener noreferrer' }, ic(/^image\//.test(d.mime || '') ? 'image' : 'file', 18), h('bdi.bp-fname', { dir: 'ltr' }, d.filename)),
    ),
    h('p.bp-bubble-time', whenSent(m.created_at)),
  );
}

function messagesView() {
  const msgs = state.data.messages || [];
  markSeen({ msg: lastOutId() });
  const thread = msgs.length
    ? h('ol.bp-thread', msgs.map(bubble))
    : h('p.bp-empty', g('لسه مفيش رسايل. اكتب{ي}لنا أو سجّل{ي} رسالة صوتية، وهنرد عليك{ي}.'));
  return [backBar('الرسائل'), h('section.bp-card.bp-chat', thread), composer(), h('div.bp-callback', btn(`${s('اطلبي')} مكالمة`, { kind: 'secondary', icon: 'phone', block: true, onClick: openCallback }))];
}

function composer() {
  const c = state.composer;
  const draft = draftStore(`portal-message-${LINK_KEY}`);
  let voice = null;
  const ta = h('textarea.bp-input.bp-compose-text', {
    id: 'bp-compose',
    rows: 2,
    maxlength: 5000,
    placeholder: g('اكتب{ي} رسالتك هنا…'),
    value: c.text || '',
    onInput: () => {
      c.text = ta.value;
      grow();
      draft.saveSoon({ text: ta.value });
    },
  });
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 5 * 30 + 20)}px`;
  };
  const recHost = h('div.bp-compose-rec', { hidden: true });
  const camHost = h('div.bp-compose-cam', { hidden: true });
  const rec = voiceRecorder({
    maxSeconds: 180,
    variant: 'compact',
    address: state.form,
    onChange: (blob, meta) => (voice = blob ? { blob, seconds: meta?.seconds || 0 } : null),
  });
  recHost.append(rec);
  const picker = photoPicker({ label: g('صوّر{ي} ورقة'), variant: 'compact', max: 5, address: state.form, namePrefix: 'صورة', messages: { tooMany: () => g('تقدر{ي} تبعت{ي} لحد 5 صور في الرسالة') } });
  camHost.append(picker);
  const ctxChip = () =>
    c.answerId || c.invoiceNumber
      ? h('p.bp-compose-ctx', ic('info', 18), h('span', c.answerId ? 'سؤال على الرد' : 'سؤال على المبلغ'), h('button.bp-icon-btn', { type: 'button', 'aria-label': 'إلغاء', onClick: () => ((c.answerId = null), (c.invoiceNumber = null), ctxHost.replaceChildren()) }, ic('x', 18)))
      : null;
  const ctxHost = h('div', ctxChip());
  const errBox = h('div.bp-send-error', { hidden: true, role: 'alert' });
  const progressHost = h('div');
  const sendBtn = btn('إرسال', { kind: 'primary', icon: 'send', className: 'bp-compose-send' });
  const lock = (on) => {
    ta.disabled = on;
    sendBtn.disabled = on;
    picker.setDisabled?.(on);
    rec.setDisabled?.(on);
  };
  const send = async (retryBody) => {
    if (state.busy) return;
    let body = retryBody;
    if (!body) {
      const text = ta.value.trim();
      const docs = await picker.getUploads();
      if (voice?.blob) docs.push(await blobToUpload(voice.blob, 'رسالة-صوتية'));
      if (!text && !docs.length) {
        toast(g('اكتب{ي} رسالتك أو سجّل{ي} رسالة صوتية الأول'), 'info');
        ta.focus();
        return;
      }
      body = { body: text, documents: docs, client_ref: newClientRef() };
      if (c.answerId) body.answer_id = c.answerId;
      if (c.invoiceNumber) body.invoice_number = c.invoiceNumber;
    }
    errBox.hidden = true;
    await runSend(`${API}/messages`, body, {
      host: progressHost,
      lock,
      errBox,
      onDone: async () => {
        Object.assign(c, { text: '', answerId: null, invoiceNumber: null });
        await draft.clear();
        toast('وصلت رسالتك. هنرد عليك' + (state.form === 'm' ? '.' : 'ي.'));
        await refresh();
        requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      },
      retry: (b) => send(b),
    });
  };
  sendBtn.addEventListener('click', () => send());
  const tool = (icon, label, host) => h('button.bp-icon-btn.bp-tool', { type: 'button', 'aria-label': label, title: label, 'aria-expanded': 'false', onClick: (e) => {
    host.hidden = !host.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!host.hidden));
  } }, ic(icon, 24));
  if (!c.text) draft.load().then((d) => d?.text && !ta.value && ((ta.value = d.text), (c.text = d.text), grow()));
  if (c.focus) {
    c.focus = false;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      grow();
    });
  }
  return h(
    'section.bp-composer',
    { 'aria-label': 'رسالة جديدة' },
    ctxHost,
    h('label.bp-sr', { htmlFor: 'bp-compose' }, 'رسالتك'),
    ta,
    recHost,
    camHost,
    errBox,
    progressHost,
    h('div.bp-compose-row', tool('mic', g('سجّل{ي} رسالة صوتية'), recHost), tool('camera', g('صوّر{ي} ورقة'), camHost), sendBtn),
  );
}

/** يفتح الرسائل وفيها نص جاهز (وسؤال على رد أو مبلغ بعينه) */
function openComposer({ text = '', answerId = null, invoiceNumber = null } = {}) {
  Object.assign(state.composer, { text: text || state.composer.text, answerId, invoiceNumber, focus: true });
  if (state.view === 'messages') render();
  else go('#messages');
}

// ───────────── الورق (#papers) ─────────────

function papers() {
  const out = [];
  const seenIds = new Set();
  for (const m of state.data?.messages || []) {
    for (const d of m.documents || []) {
      if (seenIds.has(d.id) || /^audio\//.test(d.mime || '')) continue;
      seenIds.add(d.id);
      out.push({ ...d, at: m.created_at, mine: m.direction === 'in' });
    }
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function papersView() {
  const list = papers();
  // (إصلاح 9.1) بلا ورق: عنوان الصفحة نفسه، وطريقة تبعت بيها ورقة (من الرسائل)، بدل سطر وحيد بلا عنوان
  if (!list.length) {
    return [
      backBar('الورق'),
      h('section.bp-card', h('p.bp-empty', 'لسه مفيش ورق.'), btn(g('صوّر{ي} ورقة وابعت{ي}ها'), { kind: 'secondary', icon: 'camera', block: true, onClick: () => go('#messages') })),
    ];
  }
  // اسم الملف («ورقة-1.jpg») في <bdi dir=ltr> حتى لا يظهر «jpg.1-ورقة»
  const row = (d) => h('li', h('a.bp-row', { href: docHref(d.id), target: '_blank', rel: 'noopener noreferrer' }, ic(/^image\//.test(d.mime || '') ? 'image' : 'file', 22), h('span.bp-row-main', h('span.bp-row-title', h('bdi.bp-fname', { dir: 'ltr' }, d.filename)), h('span.bp-row-sub', shortDate(d.at))), ic('chevron', 20)));
  const mine = list.filter((d) => d.mine);
  const ours = list.filter((d) => !d.mine);
  return [
    backBar('الورق'),
    ours.length ? h('section.bp-card', h('h2.bp-card-title', g('ورق بعتناهولك')), h('ul.bp-rows', ours.map(row))) : null,
    mine.length ? h('section.bp-card', h('h2.bp-card-title', g('ورق بعت{ي}هولنا')), h('ul.bp-rows', mine.map(row))) : null,
  ];
}

// ───────────── كل المطلوب (#todo) ─────────────

function todoView() {
  const items = pending();
  return [backBar('المطلوب منك'), items.length ? items.map((it) => nowCard(it)) : h('p.bp-empty', 'مفيش حاجة مطلوبة منك دلوقتي.')];
}

function notFoundView(text) {
  return [backBar(''), h('p.bp-empty', text)];
}

// ───────────── طلب مكالمة ─────────────

function openCallback() {
  let when = 'any';
  const choices = [
    ['morning', 'الصبح'],
    ['noon', 'الضهر'],
    ['any', 'أي وقت'],
  ];
  const group = h(
    'div.bp-choices',
    { role: 'radiogroup', 'aria-label': 'الوقت المناسب' },
    choices.map(([v, label]) =>
      h('button.bp-choice', { type: 'button', role: 'radio', 'aria-checked': String(v === when), onClick: (e) => {
        when = v;
        group.querySelectorAll('.bp-choice').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
      } }, label),
    ),
  );
  const status = h('p.bp-send-hint', { role: 'status', 'aria-live': 'polite' });
  const go2 = btn(`${s('اطلبي')} المكالمة`, { kind: 'primary', block: true });
  const sh = sheet({ title: 'إمتى يناسبك نكلمك؟', body: [group, status, go2] });
  go2.addEventListener('click', async () => {
    if (go2.disabled) return;
    go2.disabled = true;
    try {
      await postJson(`${API}/callback`, { when });
      sh.close();
      toast('تمام، هنكلمك على رقمك اللي في الطلب خلال يوم شغل.');
      refresh({ quiet: true });
    } catch (err) {
      status.textContent = err.status === 429 ? err.message : friendlyError(err, state.form);
      go2.disabled = false;
    }
  });
}

// ───────────── الشريط السفلي ─────────────

let bar = null;
// المساحة المحجوزة أسفل الصفحة بقدر الشريط الثابت (تحت 280 بكسل يصير الشريط في آخر الصفحة فلا مساحة)
const barSpace = () =>
  bar && document.documentElement.style.setProperty('--bp-bar-space', `${getComputedStyle(bar).position === 'fixed' ? bar.offsetHeight : 0}px`);
function bottomBar() {
  if (!bar) {
    bar = h('div.bp-bar', { role: 'region', 'aria-label': 'كلمنا' });
    document.body.append(bar);
    // (v10 gate C-17) الشريط يتغير ارتفاعه بعد العرض (تكبير الصفحة، الخط، التفاف الزرين): المساحة تتبعه
    if (typeof ResizeObserver === 'function') new ResizeObserver(barSpace).observe(bar);
  }
  mount(bar, hoursLine(), h('div.bp-bar-btns', contactButtons()));
  // مساحة أسفل الصفحة بقدر الشريط الفعلي (سطر مواعيد العمل قد يلتف لسطرين)
  requestAnimationFrame(barSpace);
}

// ───────────── العرض ─────────────

function render({ from } = {}) {
  if (!state.data) return;
  // (إصلاح 9.1) صفحة فيها إرسال: وحدات الكاميرا والتسجيل أولًا (مرة واحدة، ومن الذاكرة بعدها)
  if (CAPTURE_VIEWS.has(state.view) && !CAP) {
    const view = state.view;
    mount(root, h('div.bp-page.bp-skeleton', { 'aria-busy': 'true' }, backBar(view === 'messages' ? 'الرسائل' : ''), h('p.bp-empty', { role: 'status' }, 'لحظة…')));
    bottomBar();
    loadCapture().then(
      () => state.view === view && render({ from }),
      () => {
        if (state.view !== view) return;
        mount(root, h('div.bp-page', backBar(''), h('p.bp-empty', { role: 'alert' }, g('الصفحة دي ما فتحتش. اتأكد{ي} إن النت شغال وجرب{ي} تاني.')), btn(g('جرب{ي} تاني'), { kind: 'secondary', block: true, onClick: () => render({ from }) })));
      },
    );
    return;
  }
  let content;
  switch (state.view) {
    case 'answer':
      content = answerView();
      break;
    case 'events':
      content = eventsView();
      break;
    case 'event':
      content = eventView(state.param);
      break;
    case 'money':
      content = moneyView();
      break;
    case 'messages':
      content = messagesView();
      break;
    case 'papers':
      content = papersView();
      break;
    case 'request':
      content = requestView(state.param);
      break;
    case 'todo':
      content = todoView();
      break;
    default:
      content = homeView();
  }
  mount(root, h('div.bp-page', { class: `bp-view-${state.view}` }, content));
  bottomBar();
  // بلا تمرير ناعم (public-site.css يجعله ناعمًا للروابط الداخلية): الانتقال بين الصفحات فوري
  const jump = (top) => window.scrollTo({ top, left: 0, behavior: 'instant' });
  if (state.view === 'home') {
    document.title = `صفحتك — ${brandName() || contact().org}`;
    if (from && from !== 'home') requestAnimationFrame(() => jump(state.homeScroll || 0));
  } else if (from !== undefined || state.view === 'messages') {
    requestAnimationFrame(() => jump(state.view === 'messages' ? document.documentElement.scrollHeight : 0));
    if (from !== undefined) root.querySelector('.bp-viewtitle')?.focus({ preventScroll: true });
  }
}

// ───────────── التحميل والحالات ─────────────

function skeleton() {
  mount(
    root,
    h(
      'div.bp-page.bp-skeleton',
      { 'aria-busy': 'true' },
      h('p.bp-sr', { role: 'status' }, 'بنجهّز صفحتك…'),
      h('div.bp-sk.bp-sk-h1'),
      h('div.bp-sk.bp-sk-line'),
      h('div.bp-sk.bp-sk-card'),
      h('div.bp-sk.bp-sk-card.is-short'),
    ),
  );
}

function stateCard({ icon, title, text, actions }) {
  if (bar) bar.remove();
  bar = null;
  mount(root, h('div.bp-page', h('section.bp-card.bp-state', h('span.bp-state-ic', ic(icon, 30)), h('h1', title), text ? h('p', text) : null, h('div.bp-actions', actions))));
}

function offlineState() {
  stateCard({
    icon: 'wifiOff',
    title: 'مفيش إنترنت دلوقتي',
    text: 'أول ما يرجع هنفتح الصفحة لوحدنا.',
    actions: [btn('حاولي تاني', { kind: 'primary', block: true, onClick: () => load() }), callBtn('secondary', { block: true })],
  });
}

function serverErrorState() {
  stateCard({
    icon: 'info',
    title: 'حصلت مشكلة عندنا، مش منك',
    text: 'جربي كمان شوية.',
    actions: [btn('حاولي تاني', { kind: 'primary', block: true, onClick: () => load() }), callBtn('secondary', { block: true })],
  });
}

function invalidState() {
  document.title = 'الرابط ده مش شغال';
  const saved = savedPortal();
  const other = saved && saved.url !== window.location.pathname ? saved : null;
  const wa = waLink('السلام عليكم، رابط متابعة طلبي مش شغال. اسمي: ');
  stateCard({
    icon: 'link',
    title: 'الرابط ده مش شغال',
    text: 'ممكن يكون ناقص أو قديم. كلمينا وهنبعتلك رابط جديد.',
    actions: [
      other ? btn('افتحي آخر صفحة محفوظة', { kind: 'primary', block: true, href: other.url }) : null,
      callBtn(other ? 'secondary' : 'primary', { block: true }),
      wa ? btn('واتساب', { kind: 'whatsapp', icon: 'whatsapp', block: true, href: wa }) : null,
      h('p.bp-new', h('a', { href: '/intake' }, 'عندك مشكلة جديدة؟ احكيلنا من هنا')),
    ],
  });
}

function rememberPage(home) {
  if (storage.get(SAVED_OFF_KEY) === '1') return;
  storage.set(SAVED_KEY, JSON.stringify({ url: window.location.pathname, ref: home?.ref || '' }));
}

async function refresh({ quiet = false } = {}) {
  try {
    const data = await getJson(API);
    state.data = data;
    state.form = data.home?.address === 'm' ? 'm' : 'f';
    if (!quiet || state.view === 'home') render();
  } catch {
    /* تحديث صامت: تبقى الصفحة كما هي */
  }
}

/**
 * بيانات الصفحة المضمّنة في HTML (كتلة JSON) — تُقرأ مرة واحدة ثم تُحذف من الصفحة.
 * { invalid: true } لرابط منتهٍ أو ملغى (يعرض «تعذر فتح صفحة المتابعة» دون طلب).
 */
function embeddedData() {
  const el = document.getElementById('bm-portal-data');
  if (!el) return null;
  el.remove();
  try {
    const v = JSON.parse(el.textContent || 'null');
    if (v && v.invalid === true) {
      const err = new Error('invalid');
      err.status = 404;
      throw err;
    }
    return v && typeof v === 'object' && v.home ? v : null;
  } catch (err) {
    if (err && err.status) throw err;
    return null;
  }
}

async function load() {
  // رابط مقطوع أو مشوّه: لا داعي لسؤال الخادم (الرموز الصحيحة 20–100 حرف لاتيني)
  if (!token || token.length < 20 || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    invalidState();
    return;
  }
  if (navigator.onLine === false) {
    offlineState();
    return;
  }
  if (!state.data) skeleton();
  try {
    // (إصلاح 9.1) أول مرة: البيانات داخل الصفحة نفسها (الخادم يضعها مع /p/<رمز>)، وإلا من /api/portal
    const data = embeddedData() || (await getJson(API));
    state.data = data;
    state.form = data.home?.address === 'm' ? 'm' : 'f';
    document.documentElement.dataset.address = state.form;
    rememberPage(data.home);
    const p = parseHash();
    state.view = p.view;
    state.param = p.param;
    render({ from: undefined });
  } catch (err) {
    if (!err.status) offlineState();
    else if ([401, 403, 404, 410].includes(err.status)) invalidState();
    else serverErrorState();
  }
}

try {
  initMenu();
} catch {
  /* رأس الموقع اختياري */
}
// صوت عربي يظهر بعد تحميل الأصوات في بعض المتصفحات
try {
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => state.view === 'answer' && render());
} catch {
  /* لا شيء */
}
load();
