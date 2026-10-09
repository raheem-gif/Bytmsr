// «تابعي طلبك» /portal — الإصدار 9.1 (مسار b-portal، B91-06): بلا طريق مسدود لأي مستفيدة.
// 1) لو صفحتها محفوظة على الموبايل ده: «افتحي صفحة طلبك» أول حاجة.
// 2) «بتكلمينا من رقم عليه واتساب؟» ← كود من 6 أرقام (للأرقام المؤكدة فقط؛ الرد واحد للمسجل وغيره فلا يُكشف وجود أي رقم).
// 3) «قدّمتي من الموقع ومش لاقية الرابط؟» ← اتصلي بينا / واتساب، وهنبعت الرابط بعد ما نتأكد إنها صاحبة الطلب.
// بعد 60 ثانية بلا دخول تظهر للجميع «ما وصلكيش الكود؟» مع التليفون وواتساب.

import { h, mount } from '../lib/h.js';
import { ic, btn, getJson, postJson, waUrl, initMenu, savedPortal, forgetThisPhone } from './portal-ui.js';
import { publicData } from './words.js';

const root = document.getElementById('portal-login-root');
// v11 gate-public (G11-47، P1): نصوص الأفراد والشركات (bm-copy) حين يكون جانب الزائر «أفراد وشركات» — P(المفتاح، نص «خيري»)
let PC = null;
try {
  PC = JSON.parse(document.getElementById('bm-copy')?.textContent || 'null');
} catch {
  PC = null;
}
const P = (k, f) => (PC && typeof PC[k] === 'string' ? PC[k] : f);
const titleEl = document.getElementById('page-title');
let meta = { org: '', phone: '', phoneHref: '', wa: '', hours: '', otp: true, demo: false, setup_required: false };
let timers = [];

function clearTimers() {
  timers.forEach((t) => clearInterval(t));
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}

const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** الرقم بصيغة دولية للإرسال (مصري محلي أو دولي يبدأ بـ +) */
function phoneValue(raw) {
  const s = toLatin(raw).trim().replace(/[\s-]/g, '');
  if (/^01[0125]\d{8}$/.test(s)) return `+2${s}`;
  if (/^(?:\+?20|0020)1[0125]\d{8}$/.test(s)) return `+20${s.replace(/^(?:\+?20|0020)/, '')}`;
  const digits = s.replace(/[^\d+]/g, '');
  if (/^(\+|00)\d{8,15}$/.test(digits)) return digits.replace(/^00/, '+');
  return null;
}

function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 4 ? `••• ${d.slice(-4)}` : p;
}

const callBtn = (kind = 'secondary') => (meta.phoneHref ? btn(P('call', 'اتصلي بينا'), { kind, icon: 'phone', href: meta.phoneHref, block: true }) : null);
const waBtn = (text, kind = 'whatsapp') => {
  const u = waUrl(meta.wa, text);
  return u ? btn('واتساب', { kind, icon: 'whatsapp', href: u, block: true }) : null;
};
const hoursLine = () => (meta.hours ? h('p.bp-hint', P('hours', 'بنرد {h}').replace('{h}', meta.hours)) : null);

// ───────────── الصفحة المحفوظة على الموبايل ده ─────────────

function savedCard() {
  const saved = savedPortal();
  if (!saved) return null;
  const card = h(
    'section.bp-card.bp-saved',
    { 'aria-labelledby': 'bp-saved-title' },
    h('h2#bp-saved-title', P('savedT', 'عندك طلب عندنا')),
    btn(P('savedOpen', 'افتحي صفحة طلبك'), { kind: 'primary', icon: 'file', href: saved.url, block: true, attrs: { 'data-saved': '1' } }),
    h(
      'p.bp-new',
      h(
        'button.bp-linkbtn',
        {
          type: 'button',
          onClick: async () => {
            await forgetThisPhone();
            card.remove();
          },
        },
        P('savedForget', 'مش موبايلك؟ امسحي'),
      ),
    ),
  );
  return card;
}

// ───────────── «قدّمتي من الموقع ومش لاقية الرابط؟» ─────────────

function linkCard() {
  return h(
    'section.bp-card',
    { 'aria-labelledby': 'bp-lost-title' },
    h('h2#bp-lost-title', P('lostT', 'قدّمتي من الموقع ومش لاقية الرابط؟')),
    h('p', P('lostX', 'كلمينا وهنبعتلك الرابط بعد ما نتأكد إنك صاحبة الطلب.')),
    h('div.bp-actions', callBtn('secondary'), waBtn(P('lostWa', 'السلام عليكم، ضاع مني رابط متابعة طلبي. اسمي: '))),
    hoursLine(),
  );
}

function demoNote() {
  if (!meta.demo) return null;
  return h(
    'details.bp-demo',
    h('summary', 'للتجربة'),
    h('p', 'في الوضع التجريبي ما بتتبعتش رسايل واتساب فعلية: الكود بيظهر في «صندوق الصادر» بصفحة الأتمتة والرسائل في منصة الإدارة. جرّبي الرقم 01012345678.'),
  );
}

const safety = () => h('p.bp-safety', ic('shield', 20), h('span', P('safety', 'محدش من عندنا هيطلب منك الكود ده أبدًا.')));

// ───────────── الخطوة 1: رقم الموبايل ─────────────

function phoneStep(prefill = '') {
  clearTimers();
  titleEl.textContent = P('h1', 'تابعي طلبك');
  document.title = `${titleEl.textContent} — ${meta.org || 'المؤسسة'}`;
  const input = h('input.bp-input', {
    id: 'pl-phone',
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'tel',
    dir: 'ltr',
    required: true,
    placeholder: '01XXXXXXXXX',
    value: prefill,
    'aria-describedby': 'pl-phone-hint pl-phone-err',
  });
  const err = h('p.bp-error#pl-phone-err', { role: 'alert' });
  const submit = btn(P('send', 'ابعتولي كود على واتساب'), { kind: 'whatsapp', icon: 'whatsapp', type: 'submit', block: true });
  const form = h(
    'form',
    { novalidate: true },
    h('div.bp-field', h('label.bp-label', { htmlFor: 'pl-phone' }, P('phone', 'رقم موبايلك')), input, h('p.bp-hint#pl-phone-hint', P('phoneHint', 'نفس الرقم اللي كلمتينا منه أو أكّدتيه معانا'))),
    err,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const phone = phoneValue(input.value);
    if (!phone) {
      err.textContent = P('badPhone', 'اكتبي رقم موبايل صحيح، زي 01012345678.');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    submit.disabled = true;
    try {
      const r = await postJson('/api/public/portal-login/request', { phone });
      codeStep({ phone, challenge: r.challenge, message: r.message, expiresIn: r.expires_in, resendAfter: r.resend_after });
    } catch (e2) {
      err.textContent = !e2.status ? P('offline', 'مفيش إنترنت. جربي تاني.') : e2.message || 'حصلت مشكلة. جربي تاني.';
      submit.disabled = false;
    }
  });
  const cards = [
    savedCard(),
    meta.otp ? h('section.bp-card', { 'aria-labelledby': 'bp-wa-title' }, h('h2#bp-wa-title', P('sub', 'بتكلمينا من رقم عليه واتساب؟')), form) : null,
    linkCard(),
    safety(),
    demoNote(),
    h('p.bp-new', h('a', { href: P('newHref', '/intake') }, P('newReq', 'عندك مشكلة جديدة؟ احكيلنا من هنا'))),
  ];
  mount(root, cards);
}

// ───────────── الخطوة 2: الكود ─────────────

function codeStep({ phone, challenge, message, expiresIn = 600, resendAfter = 60 }) {
  clearTimers();
  titleEl.textContent = P('codeH1', 'اكتبي الكود');
  document.title = `${titleEl.textContent} — ${meta.org || 'المؤسسة'}`;
  let currentChallenge = challenge;
  let resendAt = Date.now() + resendAfter * 1000;
  const input = h('input.bp-input.bp-code-input', {
    id: 'pl-code',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: 6,
    dir: 'ltr',
    required: true,
    'aria-describedby': 'pl-code-hint pl-code-err',
  });
  const err = h('p.bp-error#pl-code-err', { role: 'alert' });
  const status = h('p.bp-hint', { role: 'status', 'aria-live': 'polite' });
  const submit = btn(P('confirm', 'دخول'), { kind: 'primary', icon: 'lock', type: 'submit', block: true });
  const help = h('div');
  let busy = false;
  // كل إرسال للكود يستهلك محاولة من المحاولات الخمس: الكود الذي رفضه الخادم لا يُرسل ثانيةً دون تغيير،
  // وزر «دخول» معطل حتى يكتمل كود جديد من 6 أرقام.
  let rejected = '';
  let locked = false;
  const typed = () => toLatin(input.value).replace(/\D/g, '');
  function syncSubmit() {
    const v = typed();
    submit.disabled = busy || locked || v.length !== 6 || v === rejected;
  }

  async function resend() {
    const wait = Math.ceil((resendAt - Date.now()) / 1000);
    if (wait > 0) {
      status.textContent = `تقدري تطلبي كود جديد بعد ${wait} ثانية.`;
      return;
    }
    err.textContent = '';
    try {
      const r = await postJson('/api/public/portal-login/request', { phone });
      currentChallenge = r.challenge;
      resendAt = Date.now() + (r.resend_after || 60) * 1000;
      input.value = '';
      rejected = '';
      locked = false;
      input.disabled = false;
      input.removeAttribute('aria-invalid');
      syncSubmit();
      status.textContent = 'بعتنا كود جديد لو رقمك متسجل عندنا. الكود القديم مبقاش شغال.';
      input.focus();
    } catch (e) {
      err.textContent = !e.status ? P('offline', 'مفيش إنترنت. جربي تاني.') : e.message;
      if (e?.details?.retry_after) resendAt = Date.now() + e.details.retry_after * 1000;
    }
  }

  async function verify() {
    if (busy || locked) return;
    const code = typed();
    if (code.length !== 6) {
      err.textContent = P('badCode', 'اكتبي الكود اللي فيه 6 أرقام زي ما وصلك.');
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    // الكود نفسه الذي رُفض للتو: لا نرسله (يستهلك محاولة دون فائدة) ونُبقي رسالة الخطأ السابقة ظاهرة
    if (code === rejected) {
      input.focus();
      return;
    }
    err.textContent = '';
    busy = true;
    syncSubmit();
    status.textContent = 'بنتأكد من الكود…';
    try {
      const r = await postJson('/api/public/portal-login/verify', { challenge: currentChallenge, code });
      status.textContent = 'تمام، بنفتح صفحتك…';
      clearTimers();
      window.location.replace(r.redirect);
    } catch (e) {
      status.textContent = '';
      err.textContent = !e.status ? P('offline', 'مفيش إنترنت. جربي تاني.') : e.message || 'الكود ده مش صح.';
      input.setAttribute('aria-invalid', 'true');
      // رفض الخادم الكود (غلط أو انتهى وقته): يُمسح الحقل ليكتب الكود من جديد. أما خطأ الشبكة أو كثرة المحاولات
      // فيبقى الكود كما هو ليُعاد إرساله.
      const refused = e && e.status >= 400 && e.status < 500 && e.status !== 429;
      if (refused) {
        rejected = code;
        input.value = '';
        if (e.details && e.details.attempts_left === 0) {
          locked = true;
          input.disabled = true;
        }
      }
      busy = false;
      syncSubmit();
      if (!locked) input.focus();
    }
  }

  input.addEventListener('input', () => {
    const v = typed().slice(0, 6);
    if (input.value !== v) input.value = v;
    input.removeAttribute('aria-invalid');
    syncSubmit();
    if (v.length === 6 && v !== rejected) verify();
  });

  // بعد 60 ثانية بلا دخول: للجميع (لا يكشف هل الرقم مسجل) — اتصلي بينا أو واتساب
  function showHelp() {
    mount(
      help,
      h(
        'section.bp-card.bp-nocode',
        { 'aria-labelledby': 'bp-nocode-title' },
        h('h2#bp-nocode-title', P('noCodeT', 'ما وصلكيش الكود؟')),
        h('p', P('noCodeX', 'غالبًا رقمك لسه مش متأكد عندنا. كلمينا وهنبعتلك الرابط.')),
        h('div.bp-actions', callBtn('secondary'), waBtn(P('noCodeWa', 'السلام عليكم، ما وصلنيش كود الدخول لصفحة طلبي. اسمي: '))),
        h('div.bp-row-links', h('button.bp-linkbtn', { type: 'button', onClick: resend }, P('resend', 'ابعتي كود تاني')), h('button.bp-linkbtn', { type: 'button', onClick: () => phoneStep(phone) }, P('change', 'غيّري الرقم'))),
      ),
    );
  }
  timers.push(setTimeout(showHelp, 60 * 1000));

  const form = h(
    'form',
    { novalidate: true, onSubmit: (e) => (e.preventDefault(), verify()) },
    h('p', message || 'لو رقمك متسجل عندنا، هيوصلك كود من 6 أرقام على واتساب خلال دقيقة.'),
    h('div.bp-field', h('label.bp-label', { htmlFor: 'pl-code' }, P('code', 'الكود')), input, h('p.bp-hint#pl-code-hint', 'على الرقم ', h('bdi', { dir: 'ltr' }, maskPhone(phone)))),
    err,
    status,
    submit,
  );
  mount(
    root,
    h('section.bp-card', form, h('div.bp-row-links', h('button.bp-linkbtn', { type: 'button', onClick: () => phoneStep(phone) }, P('change', 'غيّري الرقم')))),
    help,
    safety(),
    demoNote(),
  );
  syncSubmit();
  input.focus();
  void expiresIn;
}

/** «الموقع قيد التجهيز»: المنصة في وضع الإعداد الأول ولا تستقبل الطلبات أو الدخول بعد */
function preparingView() {
  titleEl.textContent = 'الموقع قيد التجهيز';
  mount(
    root,
    h(
      'section.bp-card',
      h('h2', 'الموقع قيد التجهيز'),
      h('p', { role: 'status' }, meta.wa || meta.phoneHref ? 'متابعة الطلبات من الموقع لسه مش متاحة. للسؤال عن طلبك كلمينا على طول.' : 'متابعة الطلبات من الموقع لسه مش متاحة. جربي تاني بعدين.'),
      h('div.bp-actions', waBtn('السلام عليكم، عايزة أسأل عن طلبي.'), callBtn('secondary')),
    ),
  );
}

async function loadMeta() {
  const pd = publicData();
  if (pd && Object.keys(pd).length && pd.org_name) {
    meta = {
      // v10 experience (X10-B3 #9): اسم المكتب كما يراه الناس
      org: pd.brand?.name || pd.org_name,
      phone: pd.phone || '',
      phoneHref: pd.phone_e164 || pd.phone ? `tel:${pd.phone_e164 || pd.phone}` : '',
      wa: pd.whatsapp_digits || '',
      hours: pd.office_hours || '',
      otp: pd.portal_otp_enabled !== false,
      demo: !!pd.demo,
      setup_required: !!pd.setup_required,
    };
    return;
  }
  try {
    const m = await getJson('/api/meta');
    meta = {
      org: m.brand?.name || m.settings?.org_name || m.site?.org_name || '',
      phone: m.site?.org_phone || '',
      phoneHref: m.site?.org_phone_e164 || m.site?.org_phone ? `tel:${m.site.org_phone_e164 || m.site.org_phone}` : '',
      wa: m.settings?.whatsapp_number_digits || '',
      hours: m.site?.office_hours || '',
      otp: !(m.messaging && m.messaging.portal_otp_enabled === false),
      demo: !!m.demo,
      setup_required: !!m.setup_required,
    };
  } catch {
    /* تعمل الصفحة بالقيم الافتراضية: بطاقة التواصل تبقى ظاهرة */
    const tel = document.querySelector('a[href^="tel:"]');
    meta.phoneHref = tel ? tel.getAttribute('href') : '';
  }
}

async function init() {
  try {
    initMenu();
  } catch {
    /* رأس الموقع اختياري */
  }
  // الصفحة المحفوظة تظهر فورًا قبل أي طلب شبكة
  const early = savedCard();
  if (early) mount(root, early);
  await loadMeta();
  if (meta.setup_required) {
    preparingView();
    return;
  }
  const prefill = new URLSearchParams(window.location.search).get('phone') || '';
  phoneStep(/^[\d+\s]{0,20}$/.test(prefill) ? prefill : '');
}

init();
