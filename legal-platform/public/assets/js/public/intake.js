// v9.2 public — «احكيلنا مشكلتك» بالصور (P8): سؤال واحد في كل شاشة، والإجابة بضغطة على صورة.
//   الموضوع (8 مربعات) ← سؤال أو اتنين بالصور (وكل سؤال فيه «مش عارفة») ← «احكيلنا» (صوت أولًا) ← رقم الموبايل.
//   «إحنا نكلمك» (?mode=callback): شاشة الرقم وحدها، والموضوع اختياري — مكالمة مجانية بلا حكاية.
// كل شاشة لها مكان في سجل المتصفح (زر الرجوع في الموبايل = الشاشة السابقة)، والعنوان يأخذ التركيز.
// «اسمعي» (listen.js) يقرأ كل شاشة جديدة لو شغّلته مرة، ولا يتكلم أبدًا بلا ضغطة.
// الضغطة المزدوجة لا تجاوب سؤالين: الضغطات تُهمل 450ms بعد ظهور الشاشة، وبعد أول ضغطة مسجّلة حتى الشاشة التالية.
// المسودة (النصوص والإجابات والصور والتسجيلات) تبقى على الموبايل لو اتقفلت الصفحة، وتُمسح بعد الإرسال.
// بيانات المؤسسة من كتلة bm-public المضمّنة في الصفحة (بلا طلب /api/meta)، وإلا من /api/meta.

import { h, svg, mount } from '../lib/h.js';
// v9.2 مراجعة: menu.js وsaved.js مباشرة (محمّلان من الصفحة الرئيسية)، وwords.js وcommon.js بعد أول شاشة (loadExtras):
// أول سؤال يحتاج 6 طلبات جديدة فقط على نت 3G بطيء (الموبايل يفتح 6 اتصالات بالموقع في نفس الوقت)
import { captureAttribution, initSiteChrome } from './menu.js';
import { savedCard, rememberPortal, forgetSaved } from './saved.js';
import { draftStore, clearAllDrafts } from './drafts.js';
import { TOPICS, QUESTIONS, UNKNOWN, CALLBACK_WHEN, topicByKey, flowFor, sanitizeAnswers, infer, waPrefill } from './topics.js';
import { PICTOS } from './pictos.js';

// [R2-B23] الصفحة اشتغلت: نشيل «الصفحة بتحمّل ببطء» قبل أي انتظار
document.querySelector('[data-slow]')?.remove();

// recorder.js (التسجيل) وupload.js (التصوير والإرسال) يُحمّلان بعد ظهور الشاشة الأولى حتى لا يزاحماها على نت ضعيف
let R = null;
let recorderLoading = null;
const loadRecorder = () =>
  (recorderLoading ??= import('./recorder.js').then((m) => {
    R = m;
    return m;
  }));
let U = null;
let uploadLoading = null;
// فشل التحميل (نت متقطع) لا يُحفظ: «حاولي تاني» تحمّل من جديد
const loadUpload = () =>
  (uploadLoading ??= import('./upload.js').then(
    (m) => (U = m),
    (e) => {
      uploadLoading = null;
      throw e;
    },
  ));
// صيغة الكلام (شاشة «وصلنا طلبك») ومصدر الزيارة (الإرسال): تُحمّل في الخلفية بعد أول شاشة، ويُنتظران قبل الإرسال
let W = null;
let C = null;
let extrasLoading = null;
const loadExtras = () =>
  (extrasLoading ??= Promise.all([import('./words.js'), import('./common.js')]).then(
    ([w, c]) => {
      W = w;
      C = c;
    },
    (e) => {
      extrasLoading = null;
      throw e;
    },
  ));

const MIN_CHARS = 10; // حروف بلا مسافات، حين لا توجد رسالة صوتية
const MAX_DESC = 5000;
const MAX_PHOTOS = 5;
const MAX_VOICES = 3;
const MAX_VOICE_SECONDS = 180;
const DRAFT_KEY = 'intake';
// [R2-B3] الضغطة المزدوجة: مهلة بعد ظهور الشاشة، ووقت إظهار الضغطة قبل الانتقال
const TAP_GUARD_MS = 450;
const PRESS_MS = 150;
const ABOUT_DELAY_MS = 15000;
const CONSENT_V = 1; // [R2-B6] نص الموافقة الذي رأته (سطر فوق زر الإرسال، بلا مربع)
// [R2-B14] متصفح فيسبوك/إنستجرام داخل التطبيق: الميكروفون والصوت والتخزين غير مضمونة
const IN_APP_RE = /FBAN|FBAV|FB_IAB|Instagram|; wv\)/;

// «كمان سؤالين» بعد الإرسال: الصفة (نفس قيم 9.1)
const RELATIONS = [
  { value: 'widow', label: 'أرملة' },
  { value: 'orphan_guardian', label: 'وصية على أيتام' },
  { value: 'divorced', label: 'مطلقة' },
  { value: 'other', label: 'غير كده' },
];
const OTHER_GOV = 'محافظة تانية';

const MSG = {
  problem: 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.',
  name: 'اكتبي اسمك كامل، أو سيبيه فاضي.',
  phoneEmpty: 'اكتبي رقم موبايلك.',
  phoneBad: 'الرقم ده مش مظبوط. اكتبيه كده: 01012345678',
  net: 'ما اتبعتش. اتأكدي إن النت شغال وجربي تاني.',
};

const COPY = {
  topicH1: 'مشكلتك في إيه؟',
  trust: 'مجاني وسرّي. المحامي مش بيشوف رقمك.',
  storyH1: 'احكيلنا مشكلتك',
  storySubMic: 'اضغطي على الميكروفون واتكلمي بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
  storySubText: 'اكتبي جملة أو اتنين بكلامك العادي. احكي كل حاجة، حتى لو أكتر من مشكلة.',
  storyOther: 'أي مشكلة، وإحنا نوجّهك.',
  micHint: 'اختاري أول اختيار: "السماح…" (Allow)',
  writeInstead: 'اكتبي بدل الصوت',
  okNext: 'كده تمام — كمّلي',
  next: 'التالي',
  moreVoice: 'سجّلي رسالة كمان',
  photo: 'صوّري ورقة',
  photoFirst: 'صوّري ورقة (لو عندك)',
  photoHint: 'زي شهادة الوفاة أو عقد. ممكن تبعتيه بعدين.',
  callbackBtn: 'مش عارفة تحكي؟ سيبي رقمك وإحنا نكلمك',
  inAppWa: 'ابعتي رسالة صوتية على واتساب',
  inAppOr: 'أو سجّلي هنا',
  phoneH1: 'رقم موبايلك',
  phoneSub: 'عشان نكلمك ونبعتلك الرد.',
  cbH1: 'إحنا نكلمك',
  cbSub: 'اكتبي رقمك، وإحنا نتصل بيكي ببلاش.',
  cbTopics: 'الموضوع (لو تحبي)',
  cbCallUs: 'أو اتصلي إنتي: ',
  closed: 'مقفولين دلوقتي',
  phoneOk: 'الرقم مظبوط',
  phoneHear: 'اسمعي رقمك',
  forgot: 'مش فاكرة رقمك؟',
  forgotText: 'ابعتيلنا على واتساب من موبايلك، وإحنا ناخد الرقم منها',
  openWa: 'افتحي واتساب',
  when: 'إمتى يناسبك نكلمك؟',
  nameLabel: 'اسمك (لو تحبي)',
  namePh: 'زي: أم محمد أو أبو محمد',
  consent: 'لما تضغطي "ابعتي طلبك"، بتوافقي إن المؤسسة تستخدم كلامك ورقمك عشان تساعدك بس.',
  consentCb: 'لما تضغطي "اطلبي مكالمة"، بتوافقي إن المؤسسة تستخدم رقمك وكلامك عشان تساعدك بس.',
  more: 'اعرفي أكتر',
  send: 'ابعتي طلبك',
  sendCb: 'اطلبي مكالمة',
  sumLabel: 'مشكلتك: ',
  sumText: 'كتابة',
  sumCb: 'هنسمعها منك في المكالمة',
  edit: 'تعديل',
  listen: 'اسمعي',
  listenStop: 'وقّفي',
  listenResume: 'اسمعي السؤال',
};
// أوقات المكالمة بصورها
const WHEN_PICTO = { morning: 'sunrise', noon: 'sun', any: 'clock' };

const root = document.getElementById('intake-root');
const store = draftStore(DRAFT_KEY);
const page = {
  orgPhone: root?.dataset.orgPhone || '',
  orgPhoneHref: root?.dataset.orgPhoneHref || '',
  closed: root?.dataset.officeClosed === '1',
};
let org = {};
let areaCodes = new Set();

// ───────── أيقونات ─────────
const PATHS = {
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
  check: ['M20 6 9 17l-5-5'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21', 'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1'],
  phone: ['M5 2h3.5l2 5-2.6 1.6a12 12 0 0 0 7.5 7.5L17 13.5l5 2V19a2 2 0 0 1-2 2A18 18 0 0 1 3 4a2 2 0 0 1 2-2z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  pencil: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  speaker: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'],
};
function ic(name, size = 20, cls = '') {
  return svg(
    'svg',
    { class: `bmf-ic bmf-ic-${name} ${cls}`.trim(), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    PATHS[name].map((d) => svg('path', { d })),
  );
}

/** صورة موضوع أو إجابة (رسومات ثابتة من pictos.js، زخرفية: الكلمة بجانبها هي الاسم) */
function pic(id, cls = 'pub-pic') {
  const el = svg('svg', { class: cls, viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false' });
  el.innerHTML = PICTOS[id] || '';
  return el;
}

function newSubmissionId() {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `w${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const nonSpace = (s) => String(s || '').replace(/\s/gu, '').length;

/** بصمة قصيرة لنص الإرسال (FNV-1a 32 + الطول) لمعرفة إن كان المحتوى تغيّر بعد إرسال غير مؤكد */
function fingerprint(s) {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return `${s.length.toString(36)}-${x.toString(36)}`;
}

// أرقام الموبايل: تُقبل الأرقام العربية (٠١٢…) والمسافات والشرطات و+20 (نفس قواعد fmt.js دون تحميله على الصفحة العامة)
function toLatinDigits(v) {
  return String(v ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
function normalizeEgPhone(input) {
  let d = toLatinDigits(input).replace(/[\s\-().‎‏‪-‮]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (/^1[0125]\d{8}$/.test(d)) d = `0${d}`;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
}

/** 0:45 · 3:00 (نفس عدّاد المسجّل، دون تحميله قبل الحاجة) */
function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** هل يستطيع هذا المتصفح التسجيل؟ (نفس فحص recorder.js، دون تحميله) */
function canRecordHere() {
  try {
    return !!(window.isSecureContext !== false && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder === 'function');
  } catch {
    return false;
  }
}

// ───────── بيانات المؤسسة ─────────

function fromPublic(p) {
  return {
    org_name: p.org_name,
    site_name: p.site_name,
    phone: p.phone,
    phone_e164: p.phone_e164,
    whatsapp_digits: p.whatsapp_digits,
    office_hours: p.office_hours,
    governorates: Array.isArray(p.governorates) ? p.governorates : [],
    areas: Array.isArray(p.areas) ? p.areas : [],
    setup_required: !!p.setup_required,
  };
}

function fromMeta(m) {
  const s = m.settings || {};
  const site = m.site || {};
  const c = m.constants || {};
  return {
    org_name: site.org_name || s.org_name,
    site_name: site.site_name,
    phone: site.org_phone,
    phone_e164: site.org_phone_e164,
    whatsapp_digits: s.whatsapp_number_digits,
    office_hours: site.office_hours,
    governorates: Array.isArray(c.GOVERNORATES) ? c.GOVERNORATES : [],
    areas: Array.isArray(c.LEGAL_AREAS) ? c.LEGAL_AREAS : [],
    setup_required: !!m.setup_required,
  };
}

/** بيانات الصفحة المضمّنة bm-public (نفس publicData في words.js، دون تحميله قبل أول سؤال) */
function pageData() {
  try {
    return JSON.parse(document.getElementById('bm-public')?.textContent || 'null');
  } catch {
    return null;
  }
}

/** رابط واتساب بنص جاهز (نفس whatsappUrl في common.js): الرقم التوضيحي ليس رقم المؤسسة */
function whatsappUrl(digits, text) {
  const d = String(digits || '').replace(/\D/g, '');
  return d.length < 8 || d.length > 15 || d === '201000000000' ? null : `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

async function loadMeta() {
  const p = pageData();
  if (p && p.org_name && Array.isArray(p.governorates) && Array.isArray(p.areas)) return fromPublic(p);
  const res = await fetch('/api/meta', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw new Error('meta');
  return fromMeta(await res.json());
}

const orgName = () => org.org_name || 'مؤسسة بيوت مصر';
const waLink = (text) => whatsappUrl(org.whatsapp_digits, text);
const greetingWa = () => waLink(waPrefill(null, orgName()));
const topicWa = () => waLink(waPrefill(state.topic, orgName()));

/** «تحبي تحكيلنا على واتساب؟ افتحي واتساب» (بنص جاهز للموضوع)، وإلا رقم التليفون */
function contactLine(wa = greetingWa()) {
  if (wa) {
    return h('p.bmf-contact', 'تحبي تحكيلنا على واتساب؟ ', h('a', { href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'افتحي واتساب'));
  }
  if (!org.phone) return null;
  return h(
    'p.bmf-contact',
    'أو اتصلي بينا: ',
    h('a', { href: `tel:${org.phone_e164 || org.phone}`, dir: 'ltr' }, org.phone),
    org.office_hours ? ` — ${org.office_hours}` : '',
  );
}

// ───────── حالة الطلب ─────────

const state = {
  screen: 'topic', // topic | q:<سؤال> | story | phone | done
  topic: null,
  answers: {},
  callback: null, // morning | noon | any (شاشة «إحنا نكلمك» فقط)
  callbackMode: false,
  cbDirect: false, // دخلت من «إحنا نكلمك» مباشرة (?mode=callback): بلا أسئلة ولا حكاية
  entry: 'direct',
  description: '',
  name: '',
  phone: '',
  sid: newSubmissionId(),
  sentFp: null, // بصمة آخر إرسال فشل والنت مقطوع (يمكن يكون وصل الخادم)
};
let voiceEls = [];
let picker = null;
let builtBody = null; // جسم الإرسال الجاهز (نفس الملفات عند «حاولي تاني»)
let sending = false;
let failedOffline = false;
let banner = null;

const honeypotInput = h('input', { type: 'text', id: 'hp-website', name: 'website', tabindex: '-1', autocomplete: 'off' });
const honeypot = h('div.bmf-honeypot', { 'aria-hidden': 'true' }, h('label', { htmlFor: 'hp-website' }, 'الموقع الإلكتروني'), honeypotInput);

let onPhotosChanged = null;
function ensurePicker() {
  if (!picker) {
    picker = U.photoPicker({
      max: MAX_PHOTOS,
      tip: true,
      namePrefix: 'ورقة',
      onChange: () => {
        changed({ now: true });
        onPhotosChanged?.();
      },
    });
  }
  return picker;
}

const voices = () => voiceEls.filter((el) => el.getBlob()).map((el) => ({ blob: el.getBlob(), seconds: el.getSeconds() }));
const photos = () => (picker ? picker.getFiles() : []);
const topicArea = () => {
  const t = topicByKey(state.topic);
  return t && t.area && areaCodes.has(t.area) ? t.area : null;
};
const firstScreenOf = (key) => {
  const f = flowFor(key);
  return f.length ? `q:${f[0]}` : 'story';
};

function draftObject() {
  return {
    v: 2,
    screen: state.screen,
    topic: state.topic,
    answers: state.answers,
    callback: state.callback,
    callbackMode: state.callbackMode,
    cbDirect: state.cbDirect,
    entry: state.entry,
    description: state.description,
    name: state.name,
    phone: state.phone,
    sid: state.sid,
    sentFp: state.sentFp,
    voices: voices().map((v) => ({ kind: 'audio', blob: v.blob, seconds: v.seconds })),
    photos: photos().map((f) => ({ kind: 'image', blob: f, name: f.name })),
  };
}

function meaningful() {
  return (
    nonSpace(state.description) > 0 ||
    voices().length > 0 ||
    photos().length > 0 ||
    state.name.trim() ||
    state.phone.trim() ||
    Object.keys(state.answers).length > 0
  );
}

function changed({ now = false } = {}) {
  builtBody = null;
  if (state.screen === 'done') return;
  // لا نكتب مسودة فاضية (زيارة بلا كتابة)، ونمسحها لو اتمسح كل شيء
  if (!meaningful()) {
    store.clear();
    return;
  }
  if (now) store.save(draftObject());
  else store.saveSoon(draftObject(), 500);
}

// الموبايل قد يقفل الصفحة في الخلفية: نكتب المسودة فورًا عند إخفائها
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !sending && state.screen !== 'done') store.flush();
});
window.addEventListener('pagehide', () => {
  if (!sending && state.screen !== 'done') store.flush();
});

// ───────── «اسمعي» (listen.js) ─────────

let L = null; // الوحدة بعد التأكد من وجود صوت عربي
let speakingNow = false;
let firstAfterLoad = true; // أول شاشة بعد فتح الصفحة: لا كلام بلا ضغطة
if ('speechSynthesis' in window) {
  import('./listen.js')
    .then(async (m) => {
      if (!(await m.canListen())) return;
      L = m;
      paintListen();
    })
    .catch(() => {});
}

function listenFail(why) {
  speakingNow = false;
  if (why === 'not-allowed') {
    firstAfterLoad = true; // يحتاج ضغطة: الزر «اسمعي السؤال» والسماع ما زال شغالًا
  } else if (why) {
    // صوت عربي مذكور لكنه غير محمّل على الموبايل: نخفي الزر ونطفي السماع
    L?.setListen(false);
    L = null;
  }
  paintListen();
}

function speakItems(items) {
  if (!L) return;
  speakingNow = true;
  paintListen();
  L.speak(items, {
    onEnd: () => {
      speakingNow = false;
      paintListen();
    },
    onFail: listenFail,
  });
}

function speakScreen(view) {
  if (!L || !view) return;
  firstAfterLoad = false;
  speakItems(typeof view.say === 'function' ? view.say() : view.say || []);
}

/** زر «اسمعي» في رأس كل شاشة: مخفي حتى يتأكد وجود صوت عربي */
function listenButton() {
  const btn = h('button.bmf-listen', { type: 'button', hidden: true, 'aria-pressed': 'false' }, ic('speaker', 20), h('span'));
  btn.addEventListener('click', () => {
    if (!L) return;
    if (speakingNow) {
      L.stop();
      L.setListen(false);
      speakingNow = false;
      paintListen();
      return;
    }
    L.setListen(true);
    speakScreen(current);
  });
  return btn;
}

function paintListen() {
  const btn = current?.listen;
  if (!btn) return;
  btn.hidden = !L;
  if (!L) return;
  const on = L.listenOn();
  const resume = !speakingNow && on && firstAfterLoad;
  btn.setAttribute('aria-pressed', String(speakingNow || resume));
  btn.classList.toggle('is-on', speakingNow || resume);
  // الاسم المسموع = الكلمة المكتوبة على الزر («اسمعي السؤال» لازم تكون جوه الاسم)، وأثناء الكلام «وقّفي الصوت»
  if (speakingNow) btn.setAttribute('aria-label', 'وقّفي الصوت');
  else btn.removeAttribute('aria-label');
  btn.querySelector('span').textContent = speakingNow ? COPY.listenStop : resume ? COPY.listenResume : COPY.listen;
}

// أي ضغطة توقف الكلام الجاري (الشاشة التالية تبدأ قراءتها بنفسها)
document.addEventListener(
  'pointerdown',
  (e) => {
    if (!L || !speakingNow || e.target.closest?.('.bmf-listen')) return;
    L.stop();
    speakingNow = false;
    paintListen();
  },
  true,
);

// ───────── الضغطة المزدوجة [R2-B3] ─────────

let screenShownAt = 0;
let tapLocked = false;
const tapOk = () => !tapLocked && performance.now() - screenShownAt >= TAP_GUARD_MS;
function pressThen(btn, fn) {
  tapLocked = true;
  btn.classList.add('is-pressed');
  btn.setAttribute('aria-pressed', 'true');
  setTimeout(fn, PRESS_MS);
}

// ───────── عناصر مشتركة ─────────

function errorLine() {
  const el = h('p.bmf-error', { role: 'alert', hidden: true });
  el.show = (msg) => {
    mount(el, msg ? [ic('alert', 18), h('span', msg)] : []);
    el.hidden = !msg;
  };
  return el;
}

const trustLine = () => h('p.bmf-trust', ic('lock', 18), h('span', COPY.trust));

/** رأس الشاشة: «رجوع» + شارة الموضوع + «2 من 4»، ثم العنوان وزر «اسمعي»، ثم السطر الشارح */
function chrome({ title, sub, idx = 0, total = 0, trust = false, before = null }) {
  const heading = h('h1.bmf-title', { tabindex: '-1', id: 'bmf-screen-title' }, title);
  const listen = listenButton();
  const t = topicByKey(state.topic);
  const subEl = sub ? h('p.bmf-sub', sub) : null;
  const el = h(
    'div.bmf-head',
    trust && trustLine(),
    h(
      'div.bmf-qbar',
      h('button.bmf-btn.bmf-btn-text.bmf-back', { type: 'button', onClick: () => goBack() }, ic('arrowRight', 20), h('span', 'رجوع')),
      t && state.screen !== 'topic' && h('span.bmf-topic-chip', { role: 'img', 'aria-label': `الموضوع: ${t.label}` }, pic(t.picto, 'pub-pic bmf-chip-pic'), h('span', { 'aria-hidden': 'true' }, t.label)),
      total ? h('span.bmf-stepno', `${idx} من ${total}`) : null,
    ),
    before,
    h('div.bmf-headrow', heading, listen),
    subEl,
  );
  return { el, heading, listen, subEl };
}

// بطاقة «عندك طلب عندنا» (B91-06) من saved.js المشترك مع الصفحة الرئيسية؛ تُبنى مرة واحدة وتبقى فوق الشاشات
let savedEl;
function topCards() {
  if (savedEl === undefined) {
    savedEl = savedCard({
      headingLevel: 2,
      onForget: () => {
        savedEl = null;
        current?.heading.focus();
        // ننتظر أي حفظ جارٍ للمسودة ثم نمسح كل المسودات على الموبايل
        store.clear().finally(() => clearAllDrafts());
      },
    });
  }
  return [savedEl, banner];
}

// ───────── الشاشات ─────────

let current = null; // { el, heading, listen, say }

function build(screen) {
  if (screen === 'story') return storyScreen();
  if (screen === 'phone') return phoneScreen();
  if (screen.startsWith('q:') && QUESTIONS[screen.slice(2)]) return questionScreen(screen.slice(2));
  return topicScreen();
}

function show(screen, { focus = true, push = true, speak = true } = {}) {
  if (push && history.state?.bmfScreen !== screen) {
    try {
      history.pushState({ bmfScreen: screen, bmfDepth: (Number(history.state?.bmfDepth) || 0) + 1 }, '', window.location.href);
    } catch {
      /* لا شيء */
    }
  }
  state.screen = screen;
  if (L && speakingNow) {
    L.stop();
    speakingNow = false;
  }
  const view = build(screen);
  current = view;
  screenShownAt = performance.now();
  tapLocked = false;
  mount(root, topCards(), view.el, honeypot);
  changed();
  paintListen();
  if (focus) {
    view.heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  // [R2-B5] شاشة جديدة بعد ضغطة والسماع شغال: تُقرأ وحدها
  if (speak && L && L.listenOn()) speakScreen(view);
  // التسجيل يُجهَّز من أول سؤال (ليس من الشاشة الأولى ولا شاشة «إحنا نكلمك»)
  if (screen === 'story' || screen.startsWith('q:')) loadRecorder().catch(() => {});
}

const go = (screen) => show(screen);

function goBack() {
  if (Number(history.state?.bmfDepth) > 0) history.back();
  else if (state.screen !== 'topic' && !state.cbDirect) show('topic');
  else window.location.href = '/';
}

window.addEventListener('popstate', (e) => {
  if (state.screen === 'done') return; // بعد الإرسال لا نرجع للنموذج
  const screen = e.state?.bmfScreen;
  if (screen && screen !== state.screen) show(screen, { push: false });
});

// ═════ الموضوع ═════

function topicTile(t, onPick) {
  return h(
    'button.bmf-topic',
    { type: 'button', 'aria-pressed': String(state.topic === t.key), onClick: (e) => onPick(t, e.currentTarget) },
    pic(t.picto),
    h('b', t.label),
    t.sub && h('small', t.sub),
  );
}

function topicScreen() {
  const { el: head, heading, listen } = chrome({ title: COPY.topicH1 });
  const tiles = TOPICS.map((t) =>
    topicTile(t, (topic, btn) => {
      if (!tapOk()) return;
      pressThen(btn, () => {
        if (state.topic !== topic.key) state.answers = {};
        state.topic = topic.key;
        state.entry = 'intake_tiles';
        state.callbackMode = false;
        state.callback = null;
        go(firstScreenOf(topic.key));
      });
    }),
  );
  const el = h('section.bmf-step', { 'aria-labelledby': heading.id }, head, h('div.bmf-body', h('div.bmf-topics', tiles), h('div.bmf-actions', contactLine())));
  const say = () => [{ text: COPY.topicH1, el: heading }, ...tiles.map((b, i) => ({ text: TOPICS[i].say, el: b }))];
  return { el, heading, listen, say };
}

// ═════ أسئلة الصور ═════

function questionScreen(qid) {
  const q = QUESTIONS[qid];
  const flow = flowFor(state.topic);
  const { el: head, heading, listen, subEl } = chrome({ title: q.h1, sub: q.sub, idx: flow.indexOf(qid) + 1, total: flow.length + 2 });
  const tile = (a, cls) =>
    h(
      `button.bmf-answer${cls}`,
      {
        type: 'button',
        'aria-pressed': String(state.answers[qid] === a.value),
        onClick: (e) => {
          if (!tapOk()) return;
          const btn = e.currentTarget;
          pressThen(btn, () => {
            state.answers[qid] = a.value;
            changed({ now: true });
            const i = flow.indexOf(qid);
            go(i >= 0 && i + 1 < flow.length ? `q:${flow[i + 1]}` : 'story');
          });
        },
      },
      pic(a.picto),
      h('span', a.label),
    );
  const tiles = q.answers.map((a) => tile(a, ''));
  const dontKnow = tile(UNKNOWN, '.bmf-dontknow');
  const el = h(
    'section.bmf-step',
    { 'aria-labelledby': heading.id },
    head,
    h('div.bmf-body', h('fieldset.bmf-answers-set', h('legend.pub-sr', q.h1), h('div.bmf-answers', tiles), dontKnow)),
  );
  const say = () => [
    { text: q.h1, el: heading },
    q.sub && { text: q.sub, el: subEl },
    ...tiles.map((b, i) => ({ text: q.answers[i].label, el: b })),
    { text: UNKNOWN.label, el: dontKnow },
  ];
  return { el, heading, listen, say };
}

// ═════ «احكيلنا» ═════

function stopRecordings() {
  const live = voiceEls.filter((el) => el.isRecording());
  if (!live.length) return Promise.resolve();
  return new Promise((resolve) => {
    let left = live.length;
    const t = setTimeout(resolve, 2000);
    live.forEach((el) => {
      el.addEventListener(
        'bmf-recorded',
        () => {
          left -= 1;
          if (!left) {
            clearTimeout(t);
            resolve();
          }
        },
        { once: true },
      );
      el.stop();
    });
  });
}

let onVoicesChanged = null;
function addRecorder(initial = null) {
  const el = R.voiceRecorder({
    maxSeconds: MAX_VOICE_SECONDS,
    whatsappUrl: topicWa() || greetingWa(),
    permissionHint: COPY.micHint,
    initial,
    onChange: () => {
      el.dispatchEvent(new Event('bmf-recorded'));
      // رسالة صوتية تكفي: نشيل خطأ «سجّلي رسالة صوتية أو اكتبي…» لو كان ظاهرًا
      if (el.getBlob()) clearProblemError?.();
      // تسجيل اتمسح (وفيه تسجيلات تانية): نشيل خانته
      if (!el.getBlob() && voiceEls.length > 1 && !el.isRecording()) {
        voiceEls = voiceEls.filter((x) => x !== el);
        el.destroy();
      }
      changed({ now: true });
      paintVoices();
      onVoicesChanged?.();
    },
  });
  voiceEls.push(el);
  return el;
}

let voicesBox = null;
let clearProblemError = null;
function paintVoices() {
  if (!voicesBox) return;
  if (!R) {
    mount(voicesBox, h('p.bmf-loading-line', { role: 'status' }, 'لحظة…'));
    return;
  }
  if (!voiceEls.length) addRecorder();
  // إعادة تركيب العناصر تُفقدها التركيز (زر «اسمعيها» بعد «خلّصت» مثلًا): نعيده لنفس الزر
  const active = document.activeElement;
  mount(voicesBox, voiceEls);
  if (active && active !== document.activeElement && active.isConnected && voicesBox.contains(active)) active.focus({ preventScroll: true });
}

function storyScreen() {
  const t = topicByKey(state.topic);
  const flow = flowFor(state.topic);
  const mic = canRecordHere();
  const sub = `${!t || t.key === 'other' ? `${COPY.storyOther} ` : ''}${mic ? COPY.storySubMic : COPY.storySubText}`;
  const { el: head, heading, listen, subEl } = chrome({ title: COPY.storyH1, sub, idx: flow.length + 1, total: flow.length + 2, trust: true });
  const err = errorLine();
  voicesBox = h('div.bmf-voices');
  paintVoices();
  if (!R) {
    loadRecorder()
      .then(() => {
        if (state.screen === 'story') {
          paintVoices();
          paint();
        }
      })
      .catch(() => {});
  }

  let typing = !mic || nonSpace(state.description) > 0;
  let photosOpen = photos().length > 0;
  const ta = h('textarea.bmf-textarea', {
    id: 'bmf-desc',
    rows: 4,
    maxlength: MAX_DESC,
    value: state.description,
    placeholder: (t || TOPICS[TOPICS.length - 1]).placeholder,
    'aria-label': 'اكتبي مشكلتك هنا',
  });
  const taWrap = h('div.bmf-field', ta);
  clearProblemError = () => {
    err.show('');
    ta.removeAttribute('aria-invalid');
  };
  const write = h(
    'button.bmf-btn.bmf-btn-outline.bmf-btn-block.bmf-write',
    {
      type: 'button',
      onClick: () => {
        typing = true;
        paint();
        ta.focus();
      },
    },
    ic('pencil', 20),
    h('span', COPY.writeInstead),
  );
  const nextLabel = h('span');
  const next = h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block.bmf-go', { type: 'button' }, nextLabel, ic('arrowLeft', 20));
  const moreVoice = h(
    'button.bmf-btn.bmf-btn-text.bmf-more-voice',
    {
      type: 'button',
      onClick: () => {
        const el = addRecorder();
        paintVoices();
        paint();
        el.querySelector('.bmf-rec-start')?.click();
      },
    },
    COPY.moreVoice,
  );
  const photoLabel = h('span');
  const photoBox = h('div.bmf-photos');
  const photoBtn = h(
    'button.bmf-btn.bmf-btn-text.bmf-photo-btn',
    {
      type: 'button',
      onClick: async () => {
        photosOpen = true;
        paint();
        try {
          await loadUpload();
        } catch {
          return;
        }
        onPhotosChanged = paint;
        mount(photoBox, ensurePicker());
        paint();
      },
    },
    ic('camera', 20),
    photoLabel,
  );
  const photoHint = h('p.bmf-hint', COPY.photoHint);
  const cbBtn = h(
    'button.bmf-btn.bmf-btn-outline.bmf-btn-block.bmf-cb-btn',
    {
      type: 'button',
      onClick: async () => {
        await stopRecordings();
        state.description = ta.value;
        state.callbackMode = true;
        state.callback = state.callback || 'any';
        go('phone');
      },
    },
    ic('phone', 20),
    h('span', COPY.callbackBtn),
  );
  const waLine = contactLine(topicWa() || greetingWa());
  // [R2-B14] داخل فيسبوك/إنستجرام: واتساب أولًا والتسجيل تحته
  const waStory = topicWa();
  const inApp = IN_APP_RE.test(navigator.userAgent || '') && !!waStory;
  const inAppBox = inApp
    ? h(
        'div.bmf-inapp',
        h('a.bmf-btn.bmf-btn-wa.bmf-btn-lg.bmf-btn-block', { href: waStory, target: '_blank', rel: 'noopener noreferrer' }, ic('whatsapp', 22), h('span', COPY.inAppWa)),
        h('p.bmf-or', COPY.inAppOr),
      )
    : null;

  ta.addEventListener('input', () => {
    state.description = ta.value;
    clearProblemError();
    changed();
    paint();
  });

  // [R2-B13] بعد التسجيل: زر ذهبي واحد «كده تمام — كمّلي»، و«سجّلي رسالة كمان» و«صوّري ورقة» أزرار نصية صغيرة تحته
  function paint() {
    const hasVoice = voices().length > 0;
    const chars = nonSpace(ta.value);
    const told = hasVoice || chars >= MIN_CHARS;
    taWrap.hidden = !typing;
    write.hidden = typing || !mic || hasVoice;
    next.hidden = !hasVoice && chars === 0;
    nextLabel.textContent = hasVoice ? COPY.okNext : COPY.next;
    const allRecorded = voiceEls.length > 0 && voiceEls.every((x) => x.getBlob());
    moreVoice.hidden = !(hasVoice && allRecorded && voiceEls.length < MAX_VOICES && mic);
    const showPhoto = hasVoice || chars >= 1 || photosOpen;
    photoBtn.hidden = !showPhoto || photosOpen;
    photoHint.hidden = !showPhoto;
    photoLabel.textContent = hasVoice ? COPY.photo : COPY.photoFirst;
    photoBox.hidden = !photosOpen;
    cbBtn.hidden = told;
    // داخل فيسبوك/إنستجرام زر واتساب الكبير فوق أصلًا: سطر واتساب تاني تحت تكرار
    if (waLine) waLine.hidden = told || inApp;
  }
  onVoicesChanged = paint;
  if (photosOpen && U) {
    onPhotosChanged = paint;
    mount(photoBox, ensurePicker());
  }
  paint();

  next.addEventListener('click', async () => {
    await stopRecordings();
    state.description = ta.value;
    if (!voices().length && nonSpace(state.description) < MIN_CHARS) {
      err.show(MSG.problem);
      typing = true;
      paint();
      ta.setAttribute('aria-invalid', 'true');
      ta.focus();
      return;
    }
    await picker?.ready();
    state.callbackMode = false;
    state.callback = null;
    go('phone');
  });

  const el = h(
    'section.bmf-step',
    { 'aria-labelledby': heading.id },
    head,
    h('div.bmf-body', inAppBox, voicesBox, write, taWrap, h('div.bmf-actions', err, next, moreVoice, photoBtn, photoHint, photoBox, cbBtn, waLine)),
  );
  const say = () => [
    { text: COPY.storyH1, el: heading },
    { text: sub, el: subEl },
    inApp && { text: COPY.inAppWa, el: inAppBox.firstChild },
    voicesBox.querySelector('.bmf-rec-hint') && { text: COPY.micHint, el: voicesBox.querySelector('.bmf-rec-hint') },
    !write.hidden && { text: COPY.writeInstead, el: write },
    !cbBtn.hidden && { text: COPY.callbackBtn, el: cbBtn },
  ];
  return { el, heading, listen, say };
}

// ═════ رقم الموبايل (و«إحنا نكلمك») ═════

function problemSummary() {
  const v = voices();
  const total = v.reduce((s, x) => s + (x.seconds || 0), 0);
  const parts = [];
  if (v.length === 1) parts.push(`رسالة صوتية (${clock(total)})`);
  else if (v.length === 2) parts.push(`رسالتين صوتيتين (${clock(total)})`);
  else if (v.length > 2) parts.push(`${v.length} رسايل صوتية (${clock(total)})`);
  // كلمتين قبل «سيبي رقمك» (أقل من 10 حروف بلا صوت) مش حكاية: هنسمعها منها في المكالمة (والخادم يسجلها طلب مكالمة)
  const typed = nonSpace(state.description);
  if (typed && (v.length || typed >= MIN_CHARS)) parts.push(v.length ? 'وكلام مكتوب' : COPY.sumText);
  return parts.join(' ') || COPY.sumCb;
}

function field({ id, label, hint, input }) {
  const err = h('p.bmf-error', { id: `${id}-err`, hidden: true });
  const hintEl = hint ? h('p.bmf-hint', { id: `${id}-hint` }, hint) : null;
  input.id = id;
  input.setAttribute('aria-describedby', [hintEl && `${id}-hint`, `${id}-err`].filter(Boolean).join(' '));
  const wrap = h('div.bmf-field', label && h('label.bmf-label', { htmlFor: id }, label), input, hintEl, err);
  wrap.setError = (msg) => {
    mount(err, msg ? [ic('alert', 18), h('span', msg)] : []);
    err.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  return wrap;
}

function phoneScreen() {
  const cb = state.callbackMode;
  const flow = flowFor(state.topic);
  const total = state.cbDirect ? 0 : flow.length + 2;
  const title = cb ? COPY.cbH1 : COPY.phoneH1;
  const sub = cb ? COPY.cbSub : COPY.phoneSub;
  // الملخص في سطر واحد فوق العنوان (مسار الحكاية فقط)
  const summary = state.cbDirect
    ? null
    : h(
        'p.bmf-summary-line',
        h('strong', COPY.sumLabel),
        h('span', problemSummary()),
        ' — ',
        h('button.bmf-btn.bmf-btn-text.bmf-edit', { type: 'button', onClick: () => go('story'), 'aria-label': 'تعديل المشكلة' }, COPY.edit),
      );
  const { el: head, heading, listen, subEl } = chrome({ title, sub, idx: total, total, trust: true, before: summary });
  const err = errorLine();
  const status = h('div.bmf-send-status');

  const phoneInput = h('input.bmf-input.bmf-phone-big', {
    type: 'tel',
    inputmode: 'numeric',
    autocomplete: 'tel-national',
    enterkeyhint: 'next',
    dir: 'ltr',
    maxlength: 20,
    placeholder: '01xxxxxxxxx',
    value: state.phone,
    'aria-label': 'رقم موبايلك',
  });
  const phoneField = field({ id: 'bmf-phone', input: phoneInput });
  const okLine = h('p.bmf-phone-ok', { hidden: true }, ic('check', 18), h('span', COPY.phoneOk));
  const hear = h(
    'button.bmf-btn.bmf-btn-text.bmf-hear',
    {
      type: 'button',
      hidden: true,
      onClick: () => {
        const d = normalizeEgPhone(phoneInput.value);
        if (L && d) speakItems([{ text: L.spellPhone(d), el: phoneInput }]);
      },
    },
    ic('speaker', 18),
    h('span', COPY.phoneHear),
  );
  const paintPhone = () => {
    const raw = toLatinDigits(phoneInput.value).replace(/\D/g, '');
    const good = !!normalizeEgPhone(phoneInput.value);
    okLine.hidden = !good;
    hear.hidden = !good || !L;
    if (good) phoneField.setError('');
    else if (raw.length >= 11) phoneField.setError(MSG.phoneBad);
  };
  phoneInput.addEventListener('input', () => {
    state.phone = phoneInput.value;
    phoneField.setError('');
    paintPhone();
    changed();
  });
  phoneInput.addEventListener('blur', () => submit.scrollIntoView?.({ block: 'nearest' }));
  paintPhone();

  // [R2-B16] «مش فاكرة رقمك؟»: من واتساب على موبايلها ناخد الرقم (المسودة تفضل)
  const waNum = topicWa() || greetingWa();
  let forgot = null;
  if (waNum) {
    const panel = h(
      'div.bmf-forgot-panel',
      { hidden: true },
      h('p.bmf-card-text', COPY.forgotText),
      h('a.bmf-btn.bmf-btn-wa.bmf-btn-block', { href: waNum, target: '_blank', rel: 'noopener noreferrer' }, ic('whatsapp', 20), h('span', COPY.openWa)),
    );
    const btn = h(
      'button.bmf-btn.bmf-btn-text.bmf-forgot',
      {
        type: 'button',
        'aria-expanded': 'false',
        onClick: () => {
          panel.hidden = !panel.hidden;
          btn.setAttribute('aria-expanded', String(!panel.hidden));
        },
      },
      COPY.forgot,
    );
    forgot = h('div.bmf-forgot-wrap', btn, panel);
  }

  // «إمتى يناسبك نكلمك؟» (مسار المكالمة فقط) — «أي وقت» مختار من الأول
  let whenBox = null;
  let whenChips = [];
  if (cb) {
    if (!CALLBACK_WHEN[state.callback]) state.callback = 'any';
    const chips = Object.entries(CALLBACK_WHEN).map(([k, w]) =>
      h(
        'button.bmf-when-chip',
        {
          type: 'button',
          'aria-pressed': String(state.callback === k),
          onClick: () => {
            state.callback = k;
            chips.forEach((c, i) => c.setAttribute('aria-pressed', String(Object.keys(CALLBACK_WHEN)[i] === k)));
            changed();
          },
        },
        pic(WHEN_PICTO[k]),
        h('span', w.label),
      ),
    );
    whenChips = chips;
    whenBox = h('fieldset.bmf-when', h('legend', COPY.when), h('div.bmf-when-chips', chips));
  }

  // «الموضوع (لو تحبي)»: من «إحنا نكلمك» مباشرة فقط — اختيار واحد، ومفيش حاجة إجبارية
  let topicsBox = null;
  if (cb && state.cbDirect) {
    let lastTap = 0;
    const chips = TOPICS.map((t) =>
      h(
        'button.bmf-topic-chip-btn',
        {
          type: 'button',
          'aria-pressed': String(state.topic === t.key),
          onClick: () => {
            const now = performance.now();
            if (now - screenShownAt < TAP_GUARD_MS || now - lastTap < TAP_GUARD_MS) return;
            lastTap = now;
            state.topic = state.topic === t.key ? null : t.key;
            state.answers = {};
            chips.forEach((c, i) => c.setAttribute('aria-pressed', String(state.topic === TOPICS[i].key)));
            changed();
          },
        },
        pic(t.picto),
        h('span', t.label),
      ),
    );
    topicsBox = h('fieldset.bmf-topic-chips', h('legend', COPY.cbTopics), h('div.bmf-topic-chips-row', chips));
  }

  const nameInput = h('input.bmf-input', { type: 'text', autocomplete: 'name', enterkeyhint: 'done', maxlength: 120, value: state.name, placeholder: COPY.namePh });
  const nameField = field({ id: 'bmf-name', label: COPY.nameLabel, input: nameInput });
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    nameField.setError('');
    changed();
  });

  // [R2-B6] الموافقة بالفعل: سطر فوق زر الإرسال (يُقرأ بصوت)، بلا مربع
  const consentText = cb ? COPY.consentCb : COPY.consent;
  const consentLine = h('p.bmf-consent-line', h('span', consentText), ' ', h('a', { href: '/privacy#summary', target: '_blank', rel: 'noopener' }, COPY.more));
  const submit = h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block.bmf-submit', { type: 'button' }, h('span', cb ? COPY.sendCb : COPY.send), ic('send', 20, 'bmf-flip'));

  // تحت زر «اطلبي مكالمة»: رقمنا لمن تحب تتصل بنفسها، و«مقفولين دلوقتي» خارج المواعيد
  let under = null;
  const tel = page.orgPhone || org.phone;
  if (cb && tel) {
    under = h(
      'div.bmf-under-send',
      h('p', COPY.cbCallUs, h('a', { href: `tel:${page.orgPhoneHref || org.phone_e164 || tel}`, dir: 'ltr', class: 'bmf-ltr' }, tel)),
      page.closed && h('p.bmf-closed', COPY.closed),
    );
  }

  function validate() {
    const problems = [];
    const name = nameInput.value.trim();
    if (name && name.length < 2) {
      nameField.setError(MSG.name);
      problems.push([MSG.name, nameInput]);
    }
    const rawPhone = phoneInput.value.trim();
    if (!rawPhone) {
      phoneField.setError(MSG.phoneEmpty);
      problems.push([MSG.phoneEmpty, phoneInput]);
    } else if (!normalizeEgPhone(rawPhone)) {
      phoneField.setError(MSG.phoneBad);
      problems.push([MSG.phoneBad, phoneInput]);
    }
    if (problems.length) {
      err.show(problems[0][0]);
      problems[0][1].focus();
      return false;
    }
    err.show('');
    return true;
  }

  async function buildBody() {
    if (builtBody) return builtBody;
    const { payload, fp } = await buildPayload();
    // الإرسال السابق فشل والنت مقطوع: يمكن يكون وصلنا. لو غيّرت حاجة بعدها (صورة زيادة، تصحيح الرقم…)
    // نستخدم معرّف إرسال جديد، وإلا رجّع الخادم الطلب الأول وضاع التعديل بصمت. بلا تغيير: نفس المعرّف (طلب واحد فقط).
    if (state.sentFp && fp !== state.sentFp) {
      state.sid = newSubmissionId();
      payload.submission_id = state.sid;
      state.sentFp = null;
      store.save(draftObject());
    }
    lastFp = fp;
    builtBody = JSON.stringify(payload);
    return builtBody;
  }

  async function buildPayload() {
    await picker?.ready();
    const documents = [];
    for (const f of photos()) documents.push(await U.fileToUpload(f));
    const vs = voices();
    if (vs.length) await loadRecorder();
    for (let i = 0; i < vs.length; i += 1) documents.push({ ...(await R.blobToUpload(vs[i].blob, `رسالة-صوتية-${i + 1}`)), seconds: Math.round(vs[i].seconds || 0) });
    const payload = {
      // الاسم اختياري: فاضي = لا يُرسل
      name: nameInput.value.trim() || undefined,
      phone: normalizeEgPhone(phoneInput.value) || toLatinDigits(phoneInput.value).trim(),
      governorate: '',
      legal_area: topicArea() || '',
      description: String(state.description || '').trim(),
      documents,
      attribution: C.getAttribution(),
      topic: state.topic || null,
      answers: sanitizeAnswers(state.topic, state.answers),
      callback: cb ? state.callback || 'any' : null,
      entry: state.entry,
      mode: cb ? 'callback' : 'tiles',
      consent: true,
      consent_v: CONSENT_V,
      website: honeypotInput.value,
      submission_id: state.sid,
    };
    // بصمة المحتوى بدون معرّف الإرسال
    const fp = fingerprint(JSON.stringify({ ...payload, submission_id: undefined }));
    return { payload, fp };
  }
  let lastFp = null;

  function setBusy(busy) {
    sending = busy;
    submit.disabled = busy;
    [nameInput, phoneInput].forEach((x) => (x.disabled = busy));
    current?.el.querySelectorAll('.bmf-when-chip, .bmf-topic-chip-btn, .bmf-edit, .bmf-back').forEach((b) => (b.disabled = busy));
  }

  async function send() {
    if (sending) return;
    hideToast();
    if (!validate()) return;
    state.name = nameInput.value;
    state.phone = phoneInput.value;
    setBusy(true);
    try {
      // شاشة «وصلنا طلبك» تحتاج words.js: لا نرسل قبل ما يكون جاهز (وإلا وصل الطلب وما ظهرش رقمه)
      await Promise.all([loadUpload(), loadExtras()]);
    } catch {
      setBusy(false);
      err.show(MSG.net);
      return;
    }
    const progress = U.uploadProgress({ text: 'بنبعت طلبك…' });
    mount(status, progress);
    let res;
    try {
      const body = await buildBody();
      res = await U.sendWithProgress('/api/public/intake', body, { onProgress: (f) => progress.set(f) });
    } catch (e) {
      setBusy(false);
      const network = !e || e.code === 'network_error' || !e.status || e.status >= 500;
      failedOffline = network;
      // ما نعرفش إن كان وصل: نحفظ بصمة ما أُرسل (في المسودة كمان، لو اتقفلت الصفحة)
      if (network && lastFp) {
        state.sentFp = lastFp;
        store.save(draftObject());
      }
      const msg = network ? MSG.net : U.friendlyError(e);
      mount(
        status,
        h(
          'div.bmf-alert',
          { class: network ? '' : 'is-error', role: 'alert' },
          h('p', msg),
          network && h('button.bmf-btn.bmf-btn-outline', { type: 'button', onClick: send }, ic('refresh', 18), h('span', 'حاولي تاني')),
        ),
      );
      if (e && e.details && e.details.fields && e.details.fields.description) {
        status.append(h('button.bmf-btn.bmf-btn-text', { type: 'button', onClick: () => go('story') }, 'ارجعي للمشكلة'));
      }
      if (e && e.details && e.details.fields && e.details.fields.name) nameField.setError(MSG.name);
      return;
    }
    sending = false;
    failedOffline = false;
    const sent = { answers: { ...state.answers }, callbackMode: cb };
    // الطلب وصل: نمسح المسودة، لكن لا نؤخر شاشة «وصلنا طلبك» أكثر من ثانيتين لو التخزين بطيء
    // (لو ما اتمسحتش، إعادة إرسالها بنفس submission_id ترجع نفس الطلب ولا تكرره)
    await Promise.race([store.clear().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    voiceEls.forEach((v) => v.destroy());
    voiceEls = [];
    showSuccess(res || {}, nameInput.value.trim(), sent);
  }
  submit.addEventListener('click', send);
  retrySend = send;

  const el = h(
    'section.bmf-step',
    { 'aria-labelledby': heading.id },
    head,
    h(
      'div.bmf-body',
      phoneField,
      h('div.bmf-phone-row', okLine, hear),
      forgot,
      whenBox,
      topicsBox,
      nameField,
      h('div.bmf-actions', consentLine, err, submit, status, under),
    ),
  );
  const say = () => [
    { text: title, el: heading },
    { text: sub, el: subEl },
    whenBox && { text: COPY.when, el: whenBox },
    // [مراجعة] الاختيارات نفسها كمان («الصبح»، «الضهر»، «أي وقت»): من غير قراية
    ...whenChips.map((c) => ({ text: c.textContent, el: c })),
    { text: consentText, el: consentLine },
    { text: cb ? COPY.sendCb : COPY.send, el: submit },
  ];
  return { el, heading, listen, say };
}

// ───────── رجوع النت بعد فشل الإرسال ─────────

let retrySend = null;
let toastEl = null;
function hideToast() {
  toastEl?.remove();
  toastEl = null;
}
window.addEventListener('online', () => {
  if (!failedOffline || sending || state.screen !== 'phone' || !retrySend) return;
  hideToast();
  toastEl = h(
    'div.bmf-toast',
    { role: 'status' },
    h('p', 'النت رجع. تحبي تبعتي دلوقتي؟'),
    h('button.bmf-btn.bmf-btn-gold', { type: 'button', onClick: () => retrySend() }, 'ابعتي'),
  );
  document.body.append(toastEl);
});

// ───────── شاشة «وصلنا طلبك» (B91-05؛ v9.2: الترتيب [R2-B9/B17/B18]) ─────────

function refNumber(ref) {
  const m = /^REQ-\d{4}-0*(\d+)$/.exec(String(ref || ''));
  return m ? m[1] : '';
}

/** «خلال يوم شغل» · «خلال يومين شغل» · «خلال 3 أيام شغل» */
function etaWords(n) {
  const k = Math.min(5, Math.max(1, Math.round(Number(n) || 1)));
  return k === 1 ? 'خلال يوم شغل' : k === 2 ? 'خلال يومين شغل' : `خلال ${k} أيام شغل`;
}

function showSuccess(res, name, sent = {}) {
  state.screen = 'done';
  hideToast();
  if (L && speakingNow) {
    L.stop();
    speakingNow = false;
  }
  // زر الرجوع في الموبايل يخرج من الصفحة مباشرة (بدل ضغطات بلا أي تغيير على الشاشات المحفوظة في السجل)
  const doneUrl = window.location.pathname + window.location.search;
  const markDone = () => {
    try {
      history.replaceState({ bmfDone: true }, '', doneUrl);
    } catch {
      /* لا شيء */
    }
  };
  const depth = (Number(history.state?.bmfDepth) || 0) + 1;
  if (depth > 1) {
    window.addEventListener('popstate', markDone, { once: true });
    try {
      history.go(-(depth - 1));
    } catch {
      window.removeEventListener('popstate', markDone);
      markDone();
    }
  } else markDone();
  const ref = res.reference;
  if (!ref) {
    // حقل الفخ أو رد بلا رقم: شكر بسيط
    const heading = h('h1', { tabindex: '-1' }, 'وصلنا رسالتك. شكرًا!');
    mount(root, h('section.bmf-success', heading, h('a.bmf-btn.bmf-btn-outline.bmf-btn-lg', { href: '/' }, ic('home', 20), h('span', 'الصفحة الرئيسية'))));
    heading.focus();
    return;
  }
  const form = W.addressForm(name);
  const g = (s) => W.genderize(s, form);
  const who = W.addressName(name);
  const portal = res.portal_url ? new URL(res.portal_url, window.location.origin).href : null;
  const confirmUrl = typeof res.confirm_url === 'string' && /^https:\/\/wa\.me\/\d+\?text=/.test(res.confirm_url) ? res.confirm_url : null;
  const callback = res.callback && CALLBACK_WHEN[res.callback] ? res.callback : null;
  document.title = `وصلنا طلبك — ${org.site_name || orgName()}`;
  const num = refNumber(ref);

  // نحفظ صفحة الطلب على هذا الموبايل (B91-06)؛ طلب جديد من نفس الموبايل يلغي «امسحي» السابقة
  const savedHere = portal ? rememberPortal({ url: portal, ref }, { force: true }) : false;

  const heading = h('h1#success-title', { tabindex: '-1' }, 'وصلنا طلبك');

  // (إصلاح 9.1، B91-01) الخطوة 3 لا تعد بواتساب إلا لو بعتت رقم الطلب فعلًا
  const step3 = h('li');
  const paintStep3 = (sent) =>
    mount(
      step3,
      callback && confirmUrl && !sent
        ? g('ولو بعت{ي}لنا على واتساب، هنبعتلك هناك كمان.')
        : `محامي هيدرس مشكلتك، وهنبعتلك الرد ${!confirmUrl ? 'على صفحتك' : sent ? 'على واتساب وعلى صفحتك' : g('على صفحتك، وعلى واتساب لو بعت{ي}لنا رقم الطلب')}.`,
    );
  paintStep3(false);

  // [R2-B9] بطاقة «هنكلمك»: إمتى، ومن أنهي رقم (كبير ومن الشمال لليمين)، وإزاي تعرف إنه إحنا
  let cbCard = null;
  let cbText = '';
  let cbSay = () => cbText;
  if (callback) {
    const when = callback === 'any' ? '' : ` ${CALLBACK_WHEN[callback].label}`;
    const from = String(res.callback_from || '').trim();
    const lead = `هنكلمك ${etaWords(res.callback_eta_days)}${when}`;
    const rest = g(`أول ما ترد{ي} هنقولك "طلب رقم ${num}" عشان تعرف{ي} إنه إحنا. لو ما رديت{ي}ش هنكلمك تاني.`);
    cbText = `${lead}${from ? `، من الرقم ده: ${from}` : ''}. ${rest}`;
    // المسموع: الرقم رقمًا رقمًا (الصوت يقرا «01211114662» رقمًا واحدًا كبيرًا لا يُفهم)؛ المكتوب كما هو
    cbSay = () => `${lead}${from ? `، من الرقم ده: ${L ? L.spellPhone(from) : from}` : ''}. ${rest}`;
    const numEl = from ? h('span.bmf-cb-num', { dir: 'ltr' }, from) : null;
    const hearNum = from
      ? h(
          'button.bmf-btn.bmf-btn-text.bmf-hear',
          { type: 'button', hidden: !L, onClick: () => L && speakItems([{ text: L.spellPhone(from), el: numEl }]) },
          ic('speaker', 18),
          h('span', g('اسمع{ي} الرقم')),
        )
      : null;
    cbCard = h(
      'section.bmf-card.bmf-cb-card',
      { 'aria-label': 'هنكلمك' },
      h('p.bmf-card-text', ic('phone', 20), h('span', `${lead}${from ? '، من الرقم ده:' : '.'}`)),
      numEl,
      hearNum,
      h('p.bmf-card-text', rest),
      org.office_hours && h('p.bmf-note', `بنرد ${org.office_hours}`),
    );
  }

  // البطاقة أ: تأكيد الرقم برسالة واتساب واحدة (في طلب المكالمة: بطاقة ثانوية بعد «هنكلمك»)
  let cardA = null;
  let cardAText = '';
  let reveal = () => {};
  if (confirmUrl) {
    // صفحتها تعرض رسالة التأكيد نفسها مرة تانية لو ما بعتتهاش (portal-ui.js: bm_wa_confirm، 30 يومًا كالكود)
    try {
      window.localStorage.setItem('bm_wa_confirm', JSON.stringify({ ref, url: confirmUrl, at: new Date().toISOString() }));
    } catch {
      /* التخزين غير متاح */
    }
    let clicked = false;
    let away = false;
    const body = h('div.bmf-card-body');
    cardAText = callback ? g('لو عندك واتساب على الرقم ده، ابعت{ي}لنا الرسالة دي عشان نبعتلك كمان هناك') : g('ابعت{ي}لنا رقم طلبك على واتساب، عشان نقدر نرد عليك{ي} هناك.');
    const paintA = (sent) => {
      if (sent) paintStep3(true);
      return mount(
        body,
        sent
          ? [
              h('p.bmf-sent', ic('check', 22), h('span', g('بعت{ي}ها؟ هيوصلك رد مننا على واتساب.'))),
              h('a.bmf-btn.bmf-btn-text', { href: confirmUrl, target: '_blank', rel: 'noopener noreferrer', onClick: () => (clicked = true) }, g('لسه ما بعت{ي}هاش؟ ابعت{ي}ها تاني')),
            ]
          : [
              callback ? h('p.bmf-kicker', cardAText) : h('p.bmf-kicker', 'خطوة أخيرة مهمة'),
              !callback && h('p.bmf-card-text', g('ابعت{ي}لنا رقم طلبك على واتساب، عشان نقدر نرد عليك{ي} هناك.')),
              h(
                'a.bmf-btn.bmf-btn-wa.bmf-btn-lg.bmf-btn-block.bmf-confirm',
                { href: confirmUrl, target: '_blank', rel: 'noopener noreferrer', onClick: () => (clicked = true) },
                ic('whatsapp', 22),
                h('span', g('ابعت{ي} رقم الطلب على واتساب')),
              ),
            ],
      );
    };
    paintA(false);
    document.addEventListener('visibilitychange', () => {
      if (!clicked) return;
      if (document.visibilityState === 'hidden') away = true;
      else if (away) {
        paintA(true);
        reveal(); // رجعت من واتساب: وقت «كمان سؤالين»
      }
    });
    cardA = h('section.bmf-card', { class: callback ? 'is-outline' : 'is-gold', 'aria-label': 'تأكيد الرقم على واتساب' }, body);
  }

  // البطاقة ب: صفحة طلبها — مطوية تحت «صفحة طلبك» (والمربع في الصفحة الرئيسية يرجّعها كمان)
  let cardB = null;
  if (portal) {
    const shareText = `صفحة طلبي عند ${orgName()}: ${portal}`;
    const shareHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const live = h('span.bmf-sr', { 'aria-live': 'polite' });
    const copyBtn = h('button.bmf-btn.bmf-btn-text', { type: 'button' }, ic('copy', 18), h('span', 'نسخ الرابط'));
    copyBtn.addEventListener('click', async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(portal);
        ok = true;
      } catch {
        try {
          const tmp = h('textarea', { style: 'position:fixed;opacity:0;inset-block-start:0', readonly: true }, portal);
          document.body.append(tmp);
          tmp.select();
          ok = document.execCommand('copy');
          tmp.remove();
        } catch {
          ok = false;
        }
      }
      mount(copyBtn, ic(ok ? 'check' : 'copy', 18), h('span', ok ? 'اتنسخ' : 'نسخ الرابط'));
      live.textContent = ok ? 'اتنسخ الرابط' : '';
      setTimeout(() => mount(copyBtn, ic('copy', 18), h('span', 'نسخ الرابط')), 2500);
    });
    const shareBtn = h('a.bmf-btn.bmf-btn-outline.bmf-btn-block', { href: shareHref, target: '_blank', rel: 'noopener noreferrer' }, ic('share', 20), h('span', g('ابعت{ي} الرابط لنفسك')));
    shareBtn.addEventListener('click', async (e) => {
      if (typeof navigator.share !== 'function') return;
      e.preventDefault();
      try {
        await navigator.share({ text: shareText });
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        window.open(shareHref, '_blank', 'noopener');
      }
    });
    const savedLine = h('p.bmf-note', { hidden: !savedHere }, 'اتحفظت كمان على الموبايل ده. ');
    const forget = h(
      'button.bmf-btn.bmf-btn-text.bmf-small-link',
      {
        type: 'button',
        hidden: !savedHere,
        onClick: () => {
          forgetSaved();
          savedLine.hidden = false;
          mount(savedLine, 'اتمسحت من الموبايل ده.');
          forget.hidden = true;
          savedLine.setAttribute('role', 'status');
          clearAllDrafts();
          try {
            window.localStorage.removeItem('bm_wa_confirm');
          } catch {
            /* التخزين غير متاح */
          }
        },
      },
      g('مش موبايلك؟ امسح{ي}ها'),
    );
    cardB = h(
      'details.bmf-details',
      h('summary', 'صفحة طلبك'),
      h(
        'section.bmf-card',
        { 'aria-labelledby': 'bmf-save-title' },
        h('h2', { id: 'bmf-save-title' }, g('احفظ{ي} صفحة طلبك')),
        h('p.bmf-card-text', g('من الصفحة دي هتعرف{ي} كل جديد، وتبعت{ي} الورق.')),
        h(
          'a.bmf-btn.bmf-btn-block.bmf-open-portal',
          { href: portal, class: confirmUrl ? 'bmf-btn-outline' : 'bmf-btn-primary bmf-btn-lg' },
          h('span', g('افتح{ي} صفحة طلبك')),
          ic('arrowLeft', 20),
        ),
        shareBtn,
        copyBtn,
        live,
        h('p.bmf-note', g('ابعت{ي}ه لنفسك بس، مش لحد تاني.')),
        savedLine,
        forget,
      ),
    );
  }

  const days = Math.max(1, Number(res.eta_review_days) || 2);
  const next = h(
    'section.bmf-next',
    { 'aria-labelledby': 'bmf-next-title' },
    h('h2', { id: 'bmf-next-title' }, 'هيحصل إيه بعد كده؟'),
    h(
      'ol',
      h('li', callback ? 'هنكلمك ونسمع مشكلتك.' : `فريقنا هيقرا طلبك — غالبًا خلال ${W.countWord(days, ['يوم', 'يومين', 'أيام', 'يوم'])} شغل.`),
      h('li', 'ممكن نطلب منك ورقة أو معلومة.'),
      step3,
    ),
  );

  // رقم واحد تقوله في التليفون (B91-21): «طلب رقم 29» بدل تعليمتين متتاليتين بقيمتين مختلفتين
  const fine = h(
    'div.bmf-fine',
    h('p', 'رقم طلبك: ', h('span.bmf-ref.bmf-ltr', ref), num ? '' : g(' — قول{ي}ه لو كلمت{ي}نا.')),
    num && h('p', g(`لو كلمت{ي}نا قول{ي}: طلب رقم ${num}`)),
    org.phone &&
      h('p', g('لو حد طلب منك فلوس باسمنا، بلغ{ي}نا فورًا: '), h('a', { href: `tel:${org.phone_e164 || org.phone}`, dir: 'ltr' }, org.phone)),
  );

  // «كمان سؤالين — لو تحبي»: بعد ما ترجع من واتساب أو بعد 15 ثانية
  const about = portal ? aboutCard(res, portal, form, sent.answers || {}) : null;
  // ظهر الكارت والسماع شغال: الزر يبقى «اسمعي السؤال»، وضغطة واحدة تقرا الكارت الجديد وحده (لا الصفحة كلها من الأول)
  let aboutFresh = false;
  if (about) {
    let shown = false;
    reveal = () => {
      if (shown) return;
      shown = true;
      about.hidden = false;
      if (L && L.listenOn()) {
        aboutFresh = true;
        firstAfterLoad = true;
      }
      paintListen();
    };
    setTimeout(reveal, ABOUT_DELAY_MS);
  }

  const listen = listenButton();
  mount(
    root,
    h(
      'section.bmf-success',
      { 'aria-labelledby': 'success-title' },
      h('span.bmf-done-icon', ic('check', 36)),
      h('div.bmf-headrow', heading, listen),
      h('p.bmf-thanks', who ? `شكرًا يا ${who}.` : 'شكرًا.'),
      h('p.bmf-reassure', ic('shield', 20), h('span', 'الخدمة مجانية، ومحدش هيطلب منك فلوس.')),
      cbCard,
      cardA,
      next,
      cardB,
      about,
      fine,
    ),
  );
  const spoken = () => (L && num ? `وصلنا طلبك. رقم طلبك ${L.numberWords(num)}.` : 'وصلنا طلبك.');
  current = {
    heading,
    listen,
    say: () => {
      const aboutItems = about ? about.sayItems() : [];
      if (aboutFresh && aboutItems.length) {
        aboutFresh = false;
        return aboutItems;
      }
      return [{ text: spoken(), el: heading }, cbText && { text: cbSay(), el: cbCard }, cardAText && { text: cardAText, el: cardA }, ...aboutItems];
    },
  };
  paintListen();
  window.scrollTo({ top: 0, behavior: 'instant' });
  heading.focus({ preventScroll: true });
  if (L && L.listenOn()) speakScreen(current);
}

/** «كمان سؤالين»: المحافظة (الأكثر طلبًا + «محافظة تانية») ثم الصفة لو مش معروفة من الإجابات. كل ضغطة تتسجل فورًا */
function aboutCard(res, portal, form, answers) {
  const g = (s) => W.genderize(s, form);
  const token = (/\/p\/([A-Za-z0-9_-]{20,100})/.exec(portal) || [])[1];
  if (!token) return null;
  const quick = (Array.isArray(res.about_governorates) ? res.about_governorates : []).filter((x) => x !== OTHER_GOV && (org.governorates || []).includes(x)).slice(0, 6);
  const steps = ['gov'];
  // الصفة معروفة من الإجابات (جوزي اتوفى…) أو الكلام لراجل: لا نسأل
  if (!infer(answers).relation && form !== 'm') steps.push('rel');
  const body = h('div.bmf-about-body');
  // العنوان على عدد الأسئلة فعلًا (سؤال واحد لما الصفة معروفة أو الكلام لراجل) وبنوع الخطاب
  const title = steps.length > 1 ? 'كمان سؤالين — لو تحبي' : g('سؤال كمان — لو تحب{ي}');
  const titleEl = h('h2', { id: 'bmf-about-title' }, title);
  const card = h('section.bmf-card.bmf-about-card', { hidden: true, 'aria-labelledby': 'bmf-about-title' }, titleEl, body);
  // «اسمعي»: العنوان، والسؤال الحالي، وكل اختيار، و«تخطي» (أو «شكرًا، كده تمام.») — لمن لا تقرأ
  card.sayItems = () => {
    if (card.hidden) return [];
    const items = [{ text: title, el: titleEl }];
    for (const el of body.querySelectorAll('.bmf-about-q, .bmf-about-tile, .bmf-skip, .bmf-sent')) {
      if (!el.hidden && el.textContent.trim()) items.push({ text: el.textContent.trim(), el });
    }
    return items;
  };
  // بعد كل ضغطة والسماع شغال: السؤال التالي يتقري لوحده (زي باقي الشاشات)
  const readNext = () => {
    if (L && L.listenOn() && !card.hidden) speakItems(card.sayItems().slice(1));
  };
  let failed = false;
  const post = (data) => {
    const once = () =>
      fetch(`/api/portal/${token}/about`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok && r.status >= 500) throw new Error('retry');
        if (!r.ok) failed = true;
      });
    return once()
      .catch(() => once())
      .catch(() => {
        failed = true;
      });
  };
  const pending = [];
  let i = 0;
  let shownAt = 0;
  let locked = false;
  const choose = (btn, data) => {
    if (locked || performance.now() - shownAt < TAP_GUARD_MS) return;
    locked = true;
    btn.classList.add('is-pressed');
    btn.setAttribute('aria-pressed', 'true');
    pending.push(post(data));
    setTimeout(() => {
      i += 1;
      paint();
    }, PRESS_MS);
  };
  const skip = () =>
    h(
      'button.bmf-btn.bmf-btn-text.bmf-skip',
      {
        type: 'button',
        onClick: () => {
          i += 1;
          paint();
        },
      },
      'تخطي',
    );
  function paint() {
    shownAt = performance.now();
    locked = false;
    const step = steps[i];
    if (step === 'gov') {
      const select = h(
        'select.bmf-select',
        { 'aria-label': g('اختار{ي} المحافظة'), hidden: true },
        h('option', { value: '' }, g('اختار{ي} المحافظة')),
        (org.governorates || []).map((x) => h('option', { value: x }, x)),
      );
      select.addEventListener('change', () => select.value && choose(select, { governorate: select.value }));
      const tiles = quick.map((x) => h('button.bmf-about-tile', { type: 'button', 'aria-pressed': 'false', onClick: (e) => choose(e.currentTarget, { governorate: x }) }, x));
      const other = h(
        'button.bmf-about-tile',
        {
          type: 'button',
          'aria-pressed': 'false',
          onClick: () => {
            select.hidden = false;
            select.focus();
          },
        },
        OTHER_GOV,
      );
      mount(body, h('p.bmf-about-q', { tabindex: '-1' }, g('إنت{ي} من أنهي محافظة؟')), h('div.bmf-about-tiles', tiles, other), select, skip());
    } else if (step === 'rel') {
      mount(
        body,
        h('p.bmf-about-q', { tabindex: '-1' }, 'إنتي…؟'),
        h(
          'div.bmf-about-tiles',
          RELATIONS.map((r) => h('button.bmf-about-tile', { type: 'button', 'aria-pressed': 'false', onClick: (e) => choose(e.currentTarget, { relation: r.value }) }, r.label)),
        ),
        skip(),
      );
    } else {
      mount(body, h('p.bmf-note', { role: 'status', tabindex: '-1' }, 'لحظة…'));
      Promise.all(pending).then(() => {
        mount(body, h('p.bmf-sent', { role: 'status', tabindex: '-1' }, ic('check', 22), h('span', failed ? g('ما اتسجلش. مش مشكلة، تقدر{ي} تقول{ي}لنا بعدين.') : 'شكرًا، كده تمام.')));
        body.firstChild.focus({ preventScroll: true });
        readNext();
      });
    }
    // بعد كل إجابة: التركيز على السؤال التالي (لا يضيع لأول الصفحة مع لوحة المفاتيح وقارئ الشاشة)
    if (i) body.firstChild.focus({ preventScroll: true });
    if (i && step) readNext();
  }
  paint();
  return card;
}

// ───────── الموقع قيد التجهيز ─────────

function preparingView() {
  const wa = greetingWa();
  const phone = org.phone;
  mount(
    root,
    h(
      'section.bmf-card',
      { role: 'status' },
      h('h1', 'الموقع قيد التجهيز'),
      h('p.bmf-card-text', `بنجهّز استقبال الطلبات على موقع ${orgName()}. ممكن تكلمينا دلوقتي وهنساعدك.`),
      wa && h('a.bmf-btn.bmf-btn-wa.bmf-btn-lg.bmf-btn-block', { href: wa, target: '_blank', rel: 'noopener noreferrer' }, ic('whatsapp', 22), h('span', 'كلمينا على واتساب')),
      phone && h('a.bmf-btn.bmf-btn-lg.bmf-btn-block', { class: wa ? 'bmf-btn-outline' : 'bmf-btn-primary', href: `tel:${org.phone_e164 || phone}` }, ic('phone', 20), h('span', 'اتصلي بينا: '), h('span.bmf-ltr', phone)),
    ),
  );
}

function errorView(retry) {
  mount(
    root,
    h(
      'section.bmf-card',
      { role: 'alert' },
      h('h1', 'الصفحة ما فتحتش'),
      h('p.bmf-card-text', 'اتأكدي إن النت شغال وجربي تاني.'),
      h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block', { type: 'button', onClick: retry }, ic('refresh', 20), h('span', 'جربي تاني')),
    ),
  );
}

// ───────── استعادة المسودة ─────────

/** الشاشة المحفوظة إن كانت صالحة لهذا الموضوع، وإلا أقرب شاشة صالحة */
function validScreen(screen) {
  if (screen === 'phone' || screen === 'story') return screen;
  if (typeof screen === 'string' && screen.startsWith('q:') && flowFor(state.topic).includes(screen.slice(2))) return screen;
  return state.topic ? firstScreenOf(state.topic) : 'topic';
}

async function restoreDraft() {
  let d = null;
  try {
    d = await store.load();
  } catch {
    d = null;
  }
  if (!d) return null;
  const vs = Array.isArray(d.voices) ? d.voices.filter((v) => v && v.blob instanceof Blob) : [];
  const ps = Array.isArray(d.photos) ? d.photos.filter((p) => p && p.blob instanceof Blob) : [];
  const ans = d.answers && typeof d.answers === 'object' ? d.answers : {};
  const meaningfulDraft = nonSpace(d.description) > 0 || vs.length || ps.length || String(d.name || '').trim() || String(d.phone || '').trim() || Object.keys(ans).length;
  if (!meaningfulDraft) return null;
  for (const k of ['description', 'name', 'phone']) if (typeof d[k] === 'string') state[k] = d[k].slice(0, MAX_DESC);
  const t = topicByKey(d.topic);
  if (t) state.topic = t.key;
  state.answers = sanitizeAnswers(state.topic, ans);
  if (CALLBACK_WHEN[d.callback]) state.callback = d.callback;
  state.callbackMode = !!d.callbackMode;
  state.cbDirect = !!d.cbDirect;
  if (typeof d.entry === 'string') state.entry = d.entry;
  if (typeof d.sid === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(d.sid)) state.sid = d.sid;
  if (typeof d.sentFp === 'string' && d.sentFp.length <= 40) state.sentFp = d.sentFp;
  voiceEls = [];
  if (vs.length) {
    try {
      await loadRecorder();
      for (const v of vs.slice(0, MAX_VOICES)) addRecorder({ blob: v.blob, seconds: Number(v.seconds) || 0 });
    } catch {
      /* التسجيل يتعمل تاني */
    }
  }
  if (ps.length) {
    await loadUpload();
    ensurePicker().setFiles(
      ps.slice(0, MAX_PHOTOS).map((p) => {
        if (p.blob instanceof File) return p.blob;
        try {
          return new File([p.blob], p.name || 'ورقة.jpg', { type: p.blob.type });
        } catch {
          return p.blob;
        }
      }),
    );
  }
  // مسودة 9.1 (خطوات): 1 و2 ← «احكيلنا» (الصور فيها الآن)، 3 ← رقم الموبايل
  const screen = d.v === 2 ? validScreen(d.screen) : d.step === 3 ? 'phone' : 'story';
  // [R2-B19] بلا اسم الموضوع (ابنها ممكن يكون ماسك الموبايل)
  banner = h(
    'section.bmf-banner',
    { role: 'status' },
    h('p', 'كنتي بدأتي طلب قبل كده.'),
    d._blobsLost && h('p.bmf-banner-note', 'الصور والتسجيل محتاجين يتعملوا تاني.'),
    h(
      'div.bmf-banner-actions',
      h('button.bmf-btn.bmf-btn-primary', { type: 'button', onClick: () => dismissBanner() }, 'كمّلي'),
      h(
        'button.bmf-btn.bmf-btn-outline',
        {
          type: 'button',
          onClick: async () => {
            // من الأول: الإجابات ووقت المكالمة والتسجيلات والصور تتمسح من الموبايل
            await store.clear();
            voiceEls.forEach((v) => v.destroy());
            voiceEls = [];
            picker = null;
            Object.assign(state, { description: '', topic: null, answers: {}, callback: null, callbackMode: false, cbDirect: false, name: '', phone: '', sid: newSubmissionId(), sentFp: null });
            banner = null;
            show(entryScreen(), { push: false });
          },
        },
        'ابدئي من الأول',
      ),
    ),
  );
  return screen;
}

function dismissBanner() {
  banner?.remove();
  banner = null;
  current?.heading.focus();
}

// ?topic=custody (مربعات الشاشة الأولى و«بنساعد في إيه؟») أو اسم قديم (inheritance…) يحدد الموضوع بدقة حين يشترك موضوعان في مجال واحد
function preselectTopic() {
  if (state.topic) return;
  const params = new URLSearchParams(window.location.search);
  const byTopic = topicByKey(params.get('topic'));
  if (byTopic && (!byTopic.area || areaCodes.has(byTopic.area))) {
    state.topic = byTopic.key;
    return;
  }
  // ?area=INH من روابط قديمة (يُقبل فقط إن كان مجالًا معرّفًا)
  const area = String(params.get('area') || '').toUpperCase();
  if (!area || !areaCodes.has(area)) return;
  const t = TOPICS.find((x) => x.area === area);
  if (t) state.topic = t.key;
}

/** من أين بدأت؟ مربع في الصفحة الرئيسية، «إحنا نكلمك» فيها، أو رابط مباشر (لإعادة ترتيب المربعات بعد 3 شهور) */
function entryFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('entry') === 'home_callback') return 'home_callback';
  if (params.get('topic') || params.get('area')) {
    try {
      const r = new URL(document.referrer);
      if (r.origin === window.location.origin && r.pathname === '/') return 'home_tile';
    } catch {
      /* بلا مصدر */
    }
  }
  return 'direct';
}

/** أول شاشة حسب الرابط */
function entryScreen() {
  const params = new URLSearchParams(window.location.search);
  state.entry = entryFromUrl();
  if (params.get('mode') === 'callback') {
    // [R2-B2] «إحنا نكلمك»: شاشة الرقم مباشرة — بلا أسئلة ولا حكاية
    state.cbDirect = true;
    state.callbackMode = true;
    state.callback = state.callback || 'any';
    return 'phone';
  }
  preselectTopic();
  return state.topic ? firstScreenOf(state.topic) : 'topic';
}

/**
 * v9.2 مراجعة: مسودة قديمة على الموبايل وضغطت دلوقتي مربع موضوع تاني (أو «إحنا نكلمك») في الصفحة الرئيسية:
 * الضغطة الجديدة هي اللي تفتح (مش سؤال الموضوع القديم)، والكلام والتسجيلات والصور والرقم يفضلوا من المسودة.
 */
function tappedOverDraft(screen) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'callback') return state.cbDirect ? screen : entryScreen();
  const t = topicByKey(params.get('topic'));
  if (!t || (t.key === state.topic && !state.callbackMode)) return screen;
  Object.assign(state, { topic: null, answers: t.key === state.topic ? state.answers : {}, callback: null, callbackMode: false, cbDirect: false });
  return entryScreen();
}

// ───────── التهيئة ─────────

async function init() {
  captureAttribution();
  initSiteChrome();
  let meta;
  try {
    meta = await loadMeta();
  } catch {
    errorView(init);
    return;
  }
  org = meta;
  areaCodes = new Set((meta.areas || []).map((a) => a.code));
  if (meta.setup_required) {
    preparingView();
    return;
  }
  const restored = await restoreDraft();
  const first = restored ? tappedOverDraft(restored) : entryScreen();
  try {
    // نحن نرجع لأول الصفحة مع كل شاشة؛ استعادة المتصفح لمكان التمرير القديم تنزل شاشة النجاح أو الشاشة لتحت
    history.scrollRestoration = 'manual';
    history.replaceState({ bmfScreen: first, bmfDepth: 0 }, '', window.location.href);
  } catch {
    /* لا شيء */
  }
  show(first, { push: false, focus: false, speak: false });
  // نجهّز وحدة التصوير والإرسال (وصيغة الكلام ومصدر الزيارة) في الخلفية بعد ظهور الشاشة الأولى
  setTimeout(() => {
    loadUpload().catch(() => {});
    loadExtras().catch(() => {});
  }, 0);
}

init();
