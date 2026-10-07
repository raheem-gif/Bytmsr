// v9.1 b-forms — «احكيلنا مشكلتك»: طلب الدعم القانوني في 3 خطوات قصيرة (B91-04/05/17).
//   1) المشكلة: رسالة صوتية أولًا (حتى 3)، أو كتابة بكلامها العادي، والموضوع اختياري.
//   2) الورق: «صوّري ورقة» أولًا ثم «من الموبايل»، والصور تُصغَّر على الموبايل.
//   3) إزاي نوصلّك: الاسم والموبايل والمحافظة وسؤالين اختياريين والموافقة، ثم إرسال بنسبة ظاهرة وإعادة محاولة.
// المسودة (النصوص والصور والتسجيلات) تبقى على الموبايل لو اتقفلت الصفحة، وتُمسح بعد الإرسال.
// بيانات المؤسسة من كتلة bm-public المضمّنة في الصفحة (بلا طلب /api/meta)، وإلا من /api/meta.

import { h, svg, mount } from '../lib/h.js';
import { captureAttribution, getAttribution, whatsappUrl, initSiteChrome, savedCard, rememberPortal, forgetSaved } from './common.js';
import { addressName, addressForm, genderize, countWord, publicData } from './words.js';
import { voiceRecorder, blobToUpload, canRecord, clock } from './recorder.js';
// upload.js (التصوير والإرسال) يُحمَّل بعد ظهور الخطوة الأولى حتى لا يزاحمها على نت ضعيف
let U = null;
let uploadLoading = null;
const loadUpload = () =>
  (uploadLoading ??= import('./upload.js').then((m) => {
    U = m;
    return m;
  }));
import { draftStore, clearAllDrafts } from './drafts.js';

const MIN_CHARS = 10; // حروف بلا مسافات، حين لا توجد رسالة صوتية
const MAX_DESC = 5000;
const MAX_PHOTOS = 5;
const MAX_VOICES = 3;
const MAX_VOICE_SECONDS = 180;
const DRAFT_KEY = 'intake';

// الموضوع: كلام الناس ← مجال الإدارة. يُقبل المجال فقط إن كان معرّفًا في بيانات المنصة (areaCodes)
const TOPICS = [
  { key: 'inh', label: 'ورث', area: 'INH' },
  { key: 'pen', label: 'معاش', area: 'PEN' },
  { key: 'alimony', label: 'نفقة ومصاريف العيال', area: 'FAM' },
  { key: 'custody', label: 'حضانة ورؤية', area: 'FAM' },
  { key: 'rent', label: 'سكن وإيجار', area: 'PRP' },
  { key: 'guardianship', label: 'فلوس الأيتام والوصاية', area: 'GRD' },
  { key: 'papers', label: 'ورق رسمي', area: 'ADM' },
  { key: 'other', label: 'حاجة تانية / مش عارفة', area: null },
];
const QUICK_GOVS = ['القاهرة', 'الجيزة', 'القليوبية', 'الإسكندرية', 'الشرقية', 'الدقهلية'];
// بيانات الأسرة الاختيارية: الصفة وعدد الأطفال فقط (الخادم ما زال يقبل الباقي من قنوات أخرى)
const RELATIONS = [
  { value: 'widow', label: 'أرملة' },
  { value: 'orphan_guardian', label: 'وصية على أيتام' },
  { value: 'divorced', label: 'مطلقة' },
  { value: 'other', label: 'غير كده' },
];
const CHILDREN = [
  { value: 0, label: 'لأ' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4 أو أكتر' },
];

const MSG = {
  problem: 'سجّلي رسالة صوتية أو اكتبي جملة أو اتنين عن مشكلتك.',
  name: 'اكتبي اسمك.',
  phoneEmpty: 'اكتبي رقم موبايلك.',
  phoneBad: 'الرقم ده مش مظبوط. اكتبيه كده: 01012345678',
  consent: 'لازم توافقي عشان نقدر نساعدك.',
  net: 'ما اتبعتش. اتأكدي إن النت شغال وجربي تاني.',
};

const root = document.getElementById('intake-root');
const store = draftStore(DRAFT_KEY);
let org = {};
let areaCodes = new Set();

// ───────── أيقونات ─────────
const PATHS = {
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
  check: ['M20 6 9 17l-5-5'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21', 'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 22V12h6v10'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
};
function ic(name, size = 20, cls = '') {
  return svg(
    'svg',
    { class: `bmf-ic bmf-ic-${name} ${cls}`.trim(), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    PATHS[name].map((d) => svg('path', { d })),
  );
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
  let d = toLatinDigits(input).replace(/[\s\-().\u200e\u200f\u202a-\u202e]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (/^1[0125]\d{8}$/.test(d)) d = `0${d}`;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
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

async function loadMeta() {
  const p = publicData();
  if (p && p.org_name && Array.isArray(p.governorates) && Array.isArray(p.areas)) return fromPublic(p);
  const res = await fetch('/api/meta', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  if (!res.ok) throw new Error('meta');
  return fromMeta(await res.json());
}

const orgName = () => org.org_name || 'مؤسسة بيوت مصر';
const waLink = (text) => whatsappUrl(org.whatsapp_digits, text);
const greetingWa = () => waLink(`السلام عليكم ${orgName()}، عايزة أحكيلكم مشكلتي.`);

function contactLine() {
  const wa = greetingWa();
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
  step: 1,
  description: '',
  topic: null,
  name: '',
  phone: '',
  governorate: null,
  govOther: false,
  relation: null,
  children: null,
  consent: false,
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
  const t = TOPICS.find((x) => x.key === state.topic);
  return t && t.area && areaCodes.has(t.area) ? t.area : null;
};

function draftObject() {
  return {
    step: state.step,
    description: state.description,
    topic: state.topic,
    name: state.name,
    phone: state.phone,
    governorate: state.governorate,
    govOther: state.govOther,
    relation: state.relation,
    children: state.children,
    sid: state.sid,
    sentFp: state.sentFp,
    voices: voices().map((v) => ({ kind: 'audio', blob: v.blob, seconds: v.seconds })),
    photos: photos().map((f) => ({ kind: 'image', blob: f, name: f.name })),
  };
}

function meaningful() {
  return nonSpace(state.description) > 0 || voices().length > 0 || photos().length > 0 || state.name.trim() || state.phone.trim();
}

function changed({ now = false } = {}) {
  builtBody = null;
  if (state.step > 3) return;
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
  if (document.visibilityState === 'hidden' && !sending && state.step <= 3) store.flush();
});
window.addEventListener('pagehide', () => {
  if (!sending && state.step <= 3) store.flush();
});

// ───────── عناصر مشتركة ─────────

function errorLine() {
  const el = h('p.bmf-error', { role: 'alert', hidden: true });
  el.show = (msg) => {
    mount(el, msg ? [ic('alert', 18), h('span', msg)] : []);
    el.hidden = !msg;
  };
  return el;
}

function pressable(cls, { label, pressed, onToggle }) {
  return h(
    `button.${cls}`,
    { type: 'button', 'aria-pressed': String(!!pressed), onClick: onToggle },
    ic('check', 16),
    h('span', label),
  );
}

function header(step, title, sub) {
  const heading = h('h1.bmf-title', { tabindex: '-1', id: `bmf-step-${step}-title` }, title);
  return {
    heading,
    el: h(
      'div.bmf-head',
      h('p.bmf-trust', ic('lock', 18), h('span', 'مجاني وسرّي. المحامي مش بيشوف رقمك.')),
      h(
        'div.bmf-steprow',
        step > 1 && h('button.bmf-btn.bmf-btn-text.bmf-back', { type: 'button', onClick: () => goBack() }, ic('arrowRight', 20), h('span', 'رجوع')),
        h('ol.bmf-steps', { 'aria-hidden': 'true' }, [1, 2, 3].map((n) => h('li', { class: n <= step && 'is-on' }))),
        h('span.bmf-stepno', `خطوة ${step} من 3`),
      ),
      heading,
      sub && h('p.bmf-sub', sub),
    ),
  };
}

// بطاقة «عندك طلب عندنا» (B91-06) من saved.js المشترك مع الصفحة الرئيسية؛ تُبنى مرة واحدة وتبقى فوق الخطوات
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

// ───────── الخطوات ─────────

let current = null; // { el, heading }

function show(step, { focus = true, push = true } = {}) {
  if (step > 1 && !U) {
    loadUpload().then(() => show(step, { focus, push }), () => errorView(() => window.location.reload()));
    return;
  }
  state.step = step;
  if (push && history.state?.bmfStep !== step) {
    try {
      history.pushState({ bmfStep: step }, '', window.location.href);
    } catch {
      /* لا شيء */
    }
  }
  const view = step === 1 ? stepProblem() : step === 2 ? stepPapers() : stepContact();
  current = view;
  mount(root, topCards(), view.el, honeypot);
  changed();
  if (focus) {
    view.heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function goBack() {
  if (history.state?.bmfStep > 1) history.back();
  else show(Math.max(1, state.step - 1), { push: false });
}

window.addEventListener('popstate', (e) => {
  if (state.step > 3) return; // بعد الإرسال لا نرجع للنموذج
  const step = e.state?.bmfStep || 1;
  if (step !== state.step) show(step, { push: false });
});

// ═════ الخطوة 1: احكيلنا مشكلتك ═════

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

function addRecorder(initial = null) {
  const el = voiceRecorder({
    maxSeconds: MAX_VOICE_SECONDS,
    whatsappUrl: greetingWa(),
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
    },
  });
  voiceEls.push(el);
  return el;
}

let voicesBox = null;
let clearProblemError = null;
function paintVoices() {
  if (!voicesBox) return;
  if (!voiceEls.length) addRecorder();
  const all = voiceEls.every((el) => el.getBlob());
  const more =
    all && voiceEls.length < MAX_VOICES && canRecord()
      ? h(
          'button.bmf-btn.bmf-btn-text.bmf-more-voice',
          {
            type: 'button',
            onClick: () => {
              const el = addRecorder();
              paintVoices();
              el.querySelector('.bmf-rec-start')?.click();
            },
          },
          'سجّلي رسالة كمان',
        )
      : null;
  // إعادة تركيب العناصر تُفقدها التركيز (زر «اسمعيها» بعد «خلّصت» مثلًا): نعيده لنفس الزر
  const active = document.activeElement;
  mount(voicesBox, voiceEls, more);
  if (active && active !== document.activeElement && active.isConnected && voicesBox.contains(active)) active.focus({ preventScroll: true });
}

function stepProblem() {
  const { el: head, heading } = header(1, 'احكيلنا مشكلتك', 'بكلامك العادي. مش لازم تعرفي أي كلام قانوني.');
  const err = errorLine();
  const canVoice = canRecord();
  voicesBox = h('div.bmf-voices');
  paintVoices();

  const ta = h('textarea.bmf-textarea', {
    id: 'bmf-desc',
    rows: 4,
    maxlength: MAX_DESC,
    value: state.description,
    placeholder: 'مثلًا: جوزي اتوفى من 8 شهور، وعايزة أطلّع معاشه ونصيبنا في الشقة.',
    'aria-labelledby': 'bmf-desc-label',
  });
  clearProblemError = () => {
    err.show('');
    ta.removeAttribute('aria-invalid');
  };
  ta.addEventListener('input', () => {
    state.description = ta.value;
    clearProblemError();
    changed();
  });

  const tiles = h(
    'div.bmf-tiles',
    TOPICS.map((t) =>
      pressable('bmf-tile', {
        label: t.label,
        pressed: state.topic === t.key,
        onToggle: (e) => {
          state.topic = state.topic === t.key ? null : t.key;
          tiles.querySelectorAll('.bmf-tile').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          if (state.topic) e.currentTarget.setAttribute('aria-pressed', 'true');
          changed();
        },
      }),
    ),
  );

  const next = h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block', { type: 'button' }, h('span', 'التالي'), ic('arrowLeft', 20));
  next.addEventListener('click', async () => {
    await stopRecordings();
    state.description = ta.value;
    if (!voices().length && nonSpace(state.description) < MIN_CHARS) {
      err.show(MSG.problem);
      ta.setAttribute('aria-invalid', 'true');
      ta.focus();
      return;
    }
    show(2);
  });

  const el = h(
    'section.bmf-step',
    { 'aria-labelledby': heading.id },
    head,
    h(
      'div.bmf-body',
      voicesBox,
      canVoice || greetingWa() ? h('p.bmf-or', { id: 'bmf-desc-label' }, 'أو اكتبي هنا') : h('label.bmf-label', { id: 'bmf-desc-label', htmlFor: 'bmf-desc' }, 'اكتبي مشكلتك هنا'),
      ta,
      h('fieldset.bmf-group', h('legend', 'الموضوع عن إيه؟ (لو تعرفي)'), tiles),
      h('div.bmf-actions', err, next, contactLine()),
    ),
  );
  return { el, heading };
}

// ═════ الخطوة 2: الورق ═════

function stepPapers() {
  const { el: head, heading } = header(2, 'عندك ورق يخص المشكلة؟', 'زي شهادة الوفاة أو عقد أو حكم. مش لازم دلوقتي، تقدري تبعتيه بعدين.');
  const next = h('button.bmf-btn.bmf-btn-lg.bmf-btn-block', { type: 'button' });
  const paintNext = () => {
    const has = photos().length > 0;
    next.className = `bmf-btn bmf-btn-lg bmf-btn-block ${has ? 'bmf-btn-gold' : 'bmf-btn-outline'}`;
    mount(next, h('span', has ? 'التالي' : 'مفيش ورق دلوقتي — التالي'), ic('arrowLeft', 20));
  };
  ensurePicker();
  onPhotosChanged = paintNext;
  paintNext();
  next.addEventListener('click', async () => {
    await picker.ready();
    show(3);
  });
  const el = h('section.bmf-step', { 'aria-labelledby': heading.id }, head, h('div.bmf-body', picker, h('div.bmf-actions', next)));
  return { el, heading };
}

// ═════ الخطوة 3: إزاي نوصلّك ═════

function problemSummary() {
  const v = voices();
  const total = v.reduce((s, x) => s + (x.seconds || 0), 0);
  const parts = [];
  if (v.length === 1) parts.push(`رسالة صوتية (${clock(total)})`);
  else if (v.length === 2) parts.push(`رسالتين صوتيتين (${clock(total)})`);
  else if (v.length > 2) parts.push(`${v.length} رسايل صوتية (${clock(total)})`);
  const text = String(state.description || '').trim();
  if (text) parts.push(v.length ? 'وكلام مكتوب' : `«${text.length > 40 ? `${text.slice(0, 40)}…` : text}»`);
  return parts.join(' ');
}

function field({ id, label, hint, input }) {
  const err = h('p.bmf-error', { id: `${id}-err`, hidden: true });
  const hintEl = hint ? h('p.bmf-hint', { id: `${id}-hint` }, hint) : null;
  input.id = id;
  input.setAttribute('aria-describedby', [hintEl && `${id}-hint`, `${id}-err`].filter(Boolean).join(' '));
  const wrap = h('div.bmf-field', h('label.bmf-label', { htmlFor: id }, label), input, hintEl, err);
  wrap.setError = (msg) => {
    mount(err, msg ? [ic('alert', 18), h('span', msg)] : []);
    err.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  };
  return wrap;
}

function stepContact() {
  const { el: head, heading } = header(3, 'إزاي نوصلّك؟');
  const err = errorLine();
  const status = h('div.bmf-send-status');

  const summary = h(
    'ul.bmf-summary',
    { 'aria-label': 'طلبك لحد دلوقتي' },
    h(
      'li',
      h('span.bmf-summary-text', h('strong', 'مشكلتك: '), problemSummary()),
      h('button.bmf-btn.bmf-btn-text', { type: 'button', onClick: () => show(1), 'aria-label': 'تعديل المشكلة' }, 'تعديل'),
    ),
    h(
      'li',
      h('span.bmf-summary-text', h('strong', 'الورق: '), photos().length ? U.photosText(photos().length) : 'مفيش دلوقتي'),
      h('button.bmf-btn.bmf-btn-text', { type: 'button', onClick: () => show(2), 'aria-label': 'تعديل الورق' }, 'تعديل'),
    ),
  );

  const nameInput = h('input.bmf-input', { type: 'text', autocomplete: 'name', maxlength: 120, value: state.name });
  const nameField = field({ id: 'bmf-name', label: 'اسمك', hint: 'أو الاسم اللي تحبي نناديكي بيه، زي «أم محمد»', input: nameInput });
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    nameField.setError('');
    changed();
  });

  const phoneInput = h('input.bmf-input', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr', maxlength: 20, placeholder: '01XXXXXXXXX', value: state.phone });
  const phoneField = field({ id: 'bmf-phone', label: 'رقم موبايلك', hint: 'يفضّل يكون عليه واتساب.', input: phoneInput });
  phoneInput.addEventListener('input', () => {
    state.phone = phoneInput.value;
    phoneField.setError('');
    changed();
  });

  // المحافظة: أشهر 6 كأزرار، و«محافظة تانية» تفتح القائمة كاملة
  const govs = org.governorates || [];
  const quick = QUICK_GOVS.filter((g) => govs.includes(g));
  const select = h(
    'select.bmf-select',
    { id: 'bmf-gov', 'aria-label': 'اختاري المحافظة' },
    h('option', { value: '' }, 'اختاري المحافظة'),
    govs.map((g) => h('option', { value: g, selected: state.governorate === g }, g)),
  );
  select.value = state.governorate && !quick.includes(state.governorate) ? state.governorate : '';
  const govChips = h('div.bmf-chips');
  const paintGov = () => {
    const otherOn = state.govOther || (state.governorate && !quick.includes(state.governorate));
    mount(
      govChips,
      quick.map((g) =>
        pressable('bmf-chip', {
          label: g,
          pressed: state.governorate === g,
          onToggle: () => {
            state.governorate = state.governorate === g ? null : g;
            state.govOther = false;
            paintGov();
            changed();
          },
        }),
      ),
      pressable('bmf-chip', {
        label: 'محافظة تانية',
        pressed: otherOn,
        onToggle: () => {
          state.govOther = !otherOn;
          if (!state.govOther && state.governorate && !quick.includes(state.governorate)) state.governorate = null;
          if (state.govOther && quick.includes(state.governorate)) state.governorate = null;
          paintGov();
          changed();
          if (state.govOther) select.focus();
        },
      }),
    );
    select.hidden = !otherOn;
    select.value = otherOn && state.governorate ? state.governorate : '';
  };
  select.addEventListener('change', () => {
    state.governorate = select.value || null;
    changed();
  });
  paintGov();

  const choiceGroup = (legend, list, key) => {
    const box = h('div.bmf-chips');
    const paint = () =>
      mount(
        box,
        list.map((o) =>
          pressable('bmf-chip', {
            label: o.label,
            pressed: state[key] === o.value,
            onToggle: () => {
              state[key] = state[key] === o.value ? null : o.value;
              paint();
              changed();
            },
          }),
        ),
      );
    paint();
    return h('fieldset.bmf-group', h('legend', legend), box);
  };

  const consentCb = h('input', { type: 'checkbox', id: 'bmf-consent', checked: state.consent });
  const consentLabel = h('label.bmf-consent', { htmlFor: 'bmf-consent' }, consentCb, h('span', 'موافقة إن المؤسسة تستخدم بياناتي عشان تساعدني بس.'));
  const consentErr = h('p.bmf-error', { id: 'bmf-consent-err', hidden: true });
  consentCb.setAttribute('aria-describedby', 'bmf-consent-err');
  consentCb.addEventListener('change', () => {
    state.consent = consentCb.checked;
    consentLabel.classList.remove('is-invalid');
    consentErr.hidden = true;
  });

  const submit = h('button.bmf-btn.bmf-btn-gold.bmf-btn-lg.bmf-btn-block.bmf-submit', { type: 'button' }, h('span', 'إرسال الطلب'), ic('send', 20, 'bmf-flip'));

  function validate() {
    const problems = [];
    const name = nameInput.value.trim();
    if (name.length < 2) {
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
    if (!consentCb.checked) {
      consentLabel.classList.add('is-invalid');
      mount(consentErr, ic('alert', 18), h('span', MSG.consent));
      consentErr.hidden = false;
      problems.push([MSG.consent, consentCb]);
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
    for (let i = 0; i < vs.length; i += 1) documents.push(await blobToUpload(vs[i].blob, `رسالة-صوتية-${i + 1}`));
    const payload = {
      name: nameInput.value.trim(),
      phone: normalizeEgPhone(phoneInput.value) || toLatinDigits(phoneInput.value).trim(),
      governorate: state.governorate || '',
      legal_area: topicArea() || '',
      description: String(state.description || '').trim(),
      documents,
      attribution: getAttribution(),
      mode: new URLSearchParams(window.location.search).get('mode') === 'guided' ? 'guided' : 'form',
      consent: true,
      website: honeypotInput.value,
      submission_id: state.sid,
    };
    const beneficiary = {};
    if (state.relation) beneficiary.relation = state.relation;
    if (Number.isInteger(state.children)) beneficiary.children_count = state.children;
    if (Object.keys(beneficiary).length) payload.beneficiary = beneficiary;
    // بصمة المحتوى بدون معرّف الإرسال
    const fp = fingerprint(JSON.stringify({ ...payload, submission_id: undefined }));
    return { payload, fp };
  }
  let lastFp = null;

  function setBusy(busy) {
    sending = busy;
    submit.disabled = busy;
    [nameInput, phoneInput, consentCb, select].forEach((x) => (x.disabled = busy));
    current?.el.querySelectorAll('.bmf-chip, .bmf-summary button, .bmf-back').forEach((b) => (b.disabled = busy));
  }

  async function send() {
    if (sending) return;
    hideToast();
    if (!validate()) return;
    state.name = nameInput.value;
    state.phone = phoneInput.value;
    setBusy(true);
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
        status.append(h('button.bmf-btn.bmf-btn-text', { type: 'button', onClick: () => show(1) }, 'ارجعي للمشكلة'));
      }
      return;
    }
    sending = false;
    failedOffline = false;
    // الطلب وصل: نمسح المسودة، لكن لا نؤخر شاشة «وصلنا طلبك» أكثر من ثانيتين لو التخزين بطيء
    // (لو ما اتمسحتش، إعادة إرسالها بنفس submission_id ترجع نفس الطلب ولا تكرره)
    await Promise.race([store.clear().catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
    voiceEls.forEach((v) => v.destroy());
    voiceEls = [];
    showSuccess(res || {}, nameInput.value.trim());
  }
  submit.addEventListener('click', send);
  retrySend = send;

  const el = h(
    'section.bmf-step',
    { 'aria-labelledby': heading.id },
    head,
    h(
      'div.bmf-body',
      summary,
      nameField,
      phoneField,
      h('fieldset.bmf-group', h('legend', 'ساكنة فين؟ (اختياري)'), govChips, select),
      h(
        'section.bmf-optional',
        { 'aria-label': 'سؤالين اختياريين' },
        h('p.bmf-optional-title', 'سؤالين اختياريين يساعدونا نفهم ظروفك'),
        choiceGroup('انتي:', RELATIONS, 'relation'),
        choiceGroup('عندك أطفال تحت 18 سنة؟', CHILDREN, 'children'),
      ),
      h('div.bmf-field', consentLabel, h('p.bmf-consent-more', h('a', { href: '/privacy#summary', target: '_blank', rel: 'noopener' }, 'اعرفي أكتر')), consentErr),
      h('div.bmf-actions', err, submit, status),
    ),
  );
  return { el, heading };
}

// ───────── رجوع النت بعد فشل الإرسال ─────────

let retrySend = null;
let toastEl = null;
function hideToast() {
  toastEl?.remove();
  toastEl = null;
}
window.addEventListener('online', () => {
  if (!failedOffline || sending || state.step !== 3 || !retrySend) return;
  hideToast();
  toastEl = h(
    'div.bmf-toast',
    { role: 'status' },
    h('p', 'النت رجع. تحبي تبعتي دلوقتي؟'),
    h('button.bmf-btn.bmf-btn-gold', { type: 'button', onClick: () => retrySend() }, 'ابعتي'),
  );
  document.body.append(toastEl);
});

// ───────── شاشة «وصلنا طلبك» (B91-05) ─────────

function refNumber(ref) {
  const m = /^REQ-\d{4}-0*(\d+)$/.exec(String(ref || ''));
  return m ? m[1] : '';
}

function showSuccess(res, name) {
  state.step = 4;
  hideToast();
  // زر الرجوع في الموبايل يخرج من الصفحة مباشرة (بدل ضغطتين بلا أي تغيير على خطوتي 2 و3 المحفوظتين في السجل)
  const doneUrl = window.location.pathname + window.location.search;
  const markDone = () => {
    try {
      history.replaceState({ bmfDone: true }, '', doneUrl);
    } catch {
      /* لا شيء */
    }
  };
  const depth = Number(history.state?.bmfStep) || 1;
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
  const form = addressForm(name);
  const g = (s) => genderize(s, form);
  const who = addressName(name);
  const portal = res.portal_url ? new URL(res.portal_url, window.location.origin).href : null;
  const confirmUrl = typeof res.confirm_url === 'string' && /^https:\/\/wa\.me\/\d+\?text=/.test(res.confirm_url) ? res.confirm_url : null;
  document.title = `وصلنا طلبك — ${org.site_name || orgName()}`;

  // نحفظ صفحة الطلب على هذا الموبايل (B91-06)؛ طلب جديد من نفس الموبايل يلغي «امسحي» السابقة
  const savedHere = portal ? rememberPortal({ url: portal, ref }, { force: true }) : false;

  const heading = h('h1#success-title', { tabindex: '-1' }, 'وصلنا طلبك');

  // البطاقة أ: تأكيد الرقم برسالة واتساب واحدة
  let cardA = null;
  if (confirmUrl) {
    let clicked = false;
    let away = false;
    const body = h('div.bmf-card-body');
    const paintA = (sent) =>
      mount(
        body,
        sent
          ? [
              h('p.bmf-sent', ic('check', 22), h('span', g('بعت{ي}ها؟ هيوصلك رد مننا على واتساب.'))),
              h('a.bmf-btn.bmf-btn-text', { href: confirmUrl, target: '_blank', rel: 'noopener noreferrer', onClick: () => (clicked = true) }, g('لسه ما بعت{ي}هاش؟ ابعت{ي}ها تاني')),
            ]
          : [
              h('p.bmf-kicker', 'خطوة أخيرة مهمة'),
              h('p.bmf-card-text', g('ابعت{ي}لنا رقم طلبك على واتساب، عشان نقدر نرد عليك{ي} هناك.')),
              h(
                'a.bmf-btn.bmf-btn-wa.bmf-btn-lg.bmf-btn-block.bmf-confirm',
                { href: confirmUrl, target: '_blank', rel: 'noopener noreferrer', onClick: () => (clicked = true) },
                ic('whatsapp', 22),
                h('span', g('ابعت{ي} رقم الطلب على واتساب')),
              ),
            ],
      );
    paintA(false);
    document.addEventListener('visibilitychange', () => {
      if (!clicked) return;
      if (document.visibilityState === 'hidden') away = true;
      else if (away) paintA(true);
    });
    cardA = h('section.bmf-card.is-gold', { 'aria-label': 'تأكيد الرقم على واتساب' }, body);
  }

  // البطاقة ب: احفظي صفحة طلبك
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
        },
      },
      g('مش موبايلك؟ امسح{ي}ها'),
    );
    cardB = h(
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
    );
  }

  const days = Math.max(1, Number(res.eta_review_days) || 2);
  const next = h(
    'section.bmf-next',
    { 'aria-labelledby': 'bmf-next-title' },
    h('h2', { id: 'bmf-next-title' }, 'هيحصل إيه بعد كده؟'),
    h(
      'ol',
      h('li', `فريقنا هيقرا طلبك — غالبًا خلال ${countWord(days, ['يوم', 'يومين', 'أيام', 'يوم'])} شغل.`),
      h('li', 'ممكن نطلب منك ورقة أو معلومة.'),
      h('li', `محامي هيدرس مشكلتك، وهنبعتلك الرد ${confirmUrl ? 'على واتساب وعلى صفحتك' : 'على صفحتك'}.`),
    ),
  );

  const num = refNumber(ref);
  // رقم واحد تقوله في التليفون (B91-21): «طلب رقم 29» بدل تعليمتين متتاليتين بقيمتين مختلفتين
  const fine = h(
    'div.bmf-fine',
    h('p', 'رقم طلبك: ', h('span.bmf-ref.bmf-ltr', ref), num ? '' : g(' — قول{ي}ه لو كلمت{ي}نا.')),
    num && h('p', g(`لو كلمت{ي}نا قول{ي}: طلب رقم ${num}`)),
    org.phone &&
      h('p', g('لو حد طلب منك فلوس باسمنا، بلغ{ي}نا فورًا: '), h('a', { href: `tel:${org.phone_e164 || org.phone}`, dir: 'ltr' }, org.phone)),
  );

  mount(
    root,
    h(
      'section.bmf-success',
      { 'aria-labelledby': 'success-title' },
      h('span.bmf-done-icon', ic('check', 36)),
      heading,
      h('p.bmf-thanks', who ? `شكرًا يا ${who}.` : 'شكرًا.'),
      h('p.bmf-reassure', ic('shield', 20), h('span', 'الخدمة مجانية، ومحدش هيطلب منك فلوس.')),
      cardA,
      cardB,
      next,
      fine,
    ),
  );
  window.scrollTo({ top: 0, behavior: 'instant' });
  heading.focus({ preventScroll: true });
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

async function restoreDraft() {
  let d = null;
  try {
    d = await store.load();
  } catch {
    d = null;
  }
  if (!d) return false;
  const vs = Array.isArray(d.voices) ? d.voices.filter((v) => v && v.blob instanceof Blob) : [];
  const ps = Array.isArray(d.photos) ? d.photos.filter((p) => p && p.blob instanceof Blob) : [];
  const meaningful = nonSpace(d.description) > 0 || vs.length || ps.length || String(d.name || '').trim() || String(d.phone || '').trim();
  if (!meaningful) return false;
  for (const k of ['description', 'name', 'phone']) if (typeof d[k] === 'string') state[k] = d[k].slice(0, MAX_DESC);
  if (TOPICS.some((t) => t.key === d.topic)) state.topic = d.topic;
  if (typeof d.governorate === 'string' && (org.governorates || []).includes(d.governorate)) state.governorate = d.governorate;
  state.govOther = !!d.govOther;
  if (RELATIONS.some((r) => r.value === d.relation)) state.relation = d.relation;
  if (CHILDREN.some((c) => c.value === d.children)) state.children = d.children;
  if (typeof d.sid === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(d.sid)) state.sid = d.sid;
  if (typeof d.sentFp === 'string' && d.sentFp.length <= 40) state.sentFp = d.sentFp;
  voiceEls = [];
  for (const v of vs.slice(0, MAX_VOICES)) addRecorder({ blob: v.blob, seconds: Number(v.seconds) || 0 });
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
  const step = [1, 2, 3].includes(d.step) ? d.step : 1;
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
            await store.clear();
            voiceEls.forEach((v) => v.destroy());
            voiceEls = [];
            picker = null;
            Object.assign(state, { description: '', topic: null, name: '', phone: '', governorate: null, govOther: false, relation: null, children: null, consent: false, sid: newSubmissionId(), sentFp: null });
            preselectArea();
            banner = null;
            show(1, { push: false });
          },
        },
        'ابدئي من الأول',
      ),
    ),
  );
  return step;
}

function dismissBanner() {
  banner?.remove();
  banner = null;
  current?.heading.focus();
}

// ?topic=custody (مفاتيح بطاقات «بنساعد في إيه؟» في الصفحة الرئيسية) يحدد الموضوع بدقة حين يشترك موضوعان في مجال واحد
const TOPIC_ALIASES = { inheritance: 'inh', pensions: 'pen', housing: 'rent', documents: 'papers' };

function preselectArea() {
  if (state.topic) return;
  const params = new URLSearchParams(window.location.search);
  const rawTopic = String(params.get('topic') || '').toLowerCase();
  const byTopic = TOPICS.find((x) => x.key === (TOPIC_ALIASES[rawTopic] || rawTopic));
  if (byTopic && (!byTopic.area || areaCodes.has(byTopic.area))) {
    state.topic = byTopic.key;
    return;
  }
  // ?area=INH من بطاقات المجالات (يُقبل فقط إن كان مجالًا معرّفًا)
  const area = String(params.get('area') || '').toUpperCase();
  if (!area || !areaCodes.has(area)) return;
  const t = TOPICS.find((x) => x.area === area);
  if (t) state.topic = t.key;
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
  const step = await restoreDraft();
  preselectArea();
  try {
    // نحن نرجع لأول الصفحة مع كل خطوة؛ استعادة المتصفح لمكان التمرير القديم تنزل شاشة النجاح أو الخطوة لتحت
    history.scrollRestoration = 'manual';
    history.replaceState({ bmfStep: 1 }, '', window.location.href);
  } catch {
    /* لا شيء */
  }
  if (step && step > 1) {
    // نعيد بناء سجل الخطوات حتى يعمل زر الرجوع في الموبايل
    for (let s = 2; s <= step; s += 1) {
      try {
        history.pushState({ bmfStep: s }, '', window.location.href);
      } catch {
        /* لا شيء */
      }
    }
  }
  show(step || 1, { push: false, focus: false });
  // نجهّز وحدة التصوير والإرسال في الخلفية بعد ظهور الخطوة الأولى
  setTimeout(() => loadUpload().catch(() => {}), 0);
}

init();
