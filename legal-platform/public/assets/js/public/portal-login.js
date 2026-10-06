// دخول بوابة العملاء برمز يصل عبر واتساب (/portal):
// 1) يكتب العميل رقم الموبايل المسجل لدينا ← 2) يصله رمز من 6 أرقام على واتساب ← 3) يُحوَّل إلى صفحته الخاصة /p/<رمز>.
// الرد على طلب الرمز واحد دائمًا سواء كان الرقم مسجلًا أم لا، حتى لا تكشف الصفحة وجود أي رقم لدينا.

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { setMeta, normalizeEgPhone, toLatinDigits, count } from '../lib/fmt.js';
import { icon, button, alertBox, errorMessage } from '../lib/ui.js';
import { initSiteChrome, whatsappUrl } from './common.js';

const root = document.getElementById('portal-login-root');
let meta = { settings: {} };
let timers = [];

const orgName = () => meta.settings?.org_name || 'بيوت مصر';

function clearTimers() {
  timers.forEach((t) => clearInterval(t));
  timers = [];
}

/** الرقم بصيغة دولية للإرسال (مصري محلي أو دولي يبدأ بـ +) */
function phoneValue(raw) {
  const s = toLatinDigits(String(raw || '')).trim();
  const eg = normalizeEgPhone(s);
  if (eg) return eg;
  const digits = s.replace(/[^\d+]/g, '');
  if (/^(\+|00)\d{8,15}$/.test(digits)) return digits.replace(/^00/, '+');
  return null;
}

function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length > 4 ? `••• ${d.slice(-4)}` : p;
}

function notes() {
  const wa = whatsappUrl(meta.settings?.whatsapp_number_digits, `مرحبًا ${orgName()}، لا يصلني رمز الدخول إلى بوابة العملاء.`);
  return h(
    'ul.pl-notes',
    h('li', icon('shieldCheck', { size: 16 }), h('span', 'لا نُظهر لأحد هل الرقم مسجل لدينا أم لا؛ يصل الرمز فقط إلى رقم سبق أن تواصل معنا عبر واتساب أو سجّله فريقنا.')),
    h('li', icon('lock', { size: 16 }), h('span', 'لا تشارك الرمز مع أي شخص؛ لن يطلبه منك أحد من فريقنا أبدًا.')),
    h(
      'li',
      icon('whatsapp', { size: 16 }),
      h(
        'span',
        'لم يصلك الرمز؟ تأكد أنك كتبت الرقم المسجل لدينا والمرتبط بواتساب',
        wa ? [' أو ', h('a', { href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'راسلنا عبر واتساب'), ' لنرسل لك رابط صفحتك.'] : '.',
      ),
    ),
    h('li', icon('send', { size: 16 }), h('span', 'ليس لديك طلب بعد؟ ', h('a', { href: '/intake' }, 'قدّم طلبك من الموقع'))),
  );
}

function demoNote() {
  if (!meta.demo) return null;
  return h(
    'div.pl-demo',
    alertBox('في الوضع التجريبي لا تُرسل رسائل واتساب فعلية: يظهر رمز الدخول في «صندوق الصادر» بصفحة الأتمتة والرسائل داخل منصة الإدارة. جرّب الرقم 01012345678.', 'info', {
      title: 'الوضع التجريبي',
      icon: 'info',
    }),
  );
}

function statusLine() {
  return h('p.pl-status', { role: 'status', 'aria-live': 'polite' });
}

function showError(host, err) {
  mount(host, alertBox(errorMessage(err), 'danger', { icon: 'alert' }));
}

// ───────────── الخطوة 1: رقم الموبايل ─────────────
function phoneStep(prefill = '') {
  clearTimers();
  const input = h('input.input.pl-phone-input', {
    id: 'pl-phone',
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'tel',
    dir: 'ltr',
    required: true,
    placeholder: '01XXXXXXXXX',
    value: prefill,
    'aria-describedby': 'pl-phone-hint',
  });
  const errHost = h('div', { 'aria-live': 'assertive' });
  const submit = button('أرسل رمز الدخول عبر واتساب', { variant: 'whatsapp', icon: 'whatsapp', type: 'submit', block: true });
  const form = h(
    'form.pl-form',
    { novalidate: true },
    h(
      'div.field',
      h('label.field-label', { htmlFor: 'pl-phone' }, 'رقم الموبايل المسجل لدينا', h('span.req', { 'aria-hidden': 'true' }, '*')),
      input,
      h('p.field-hint', { id: 'pl-phone-hint' }, 'اكتب الرقم الذي تراسلنا منه على واتساب، مثل 01012345678.'),
    ),
    errHost,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mount(errHost);
    const phone = phoneValue(input.value);
    if (!phone) {
      mount(errHost, alertBox('اكتب رقم موبايل صحيحًا مثل 01012345678', 'danger', { icon: 'alert' }));
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    submit.disabled = true;
    submit.classList.add('is-loading');
    try {
      const r = await api.post('/public/portal-login/request', { phone });
      codeStep({ phone, challenge: r.challenge, message: r.message, expiresIn: r.expires_in, resendAfter: r.resend_after });
    } catch (err) {
      showError(errHost, err);
      submit.disabled = false;
      submit.classList.remove('is-loading');
    }
  });
  mount(
    root,
    h('span.pl-icon', { 'aria-hidden': 'true' }, icon('whatsapp', { size: 28 })),
    h('h2#pl-title', 'ادخل إلى صفحتك'),
    h('p.pl-lead', `سنرسل رمز دخول من 6 أرقام إلى رقمك على واتساب، ثم تنتقل إلى صفحتك لدى ${orgName()}.`),
    form,
    demoNote(),
    notes(),
  );
  input.focus();
}

// ───────────── الخطوة 2: الرمز ─────────────
function codeStep({ phone, challenge, message, expiresIn = 600, resendAfter = 60 }) {
  clearTimers();
  let currentChallenge = challenge;
  let expiresAt = Date.now() + expiresIn * 1000;
  let resendAt = Date.now() + resendAfter * 1000;
  const input = h('input.input.pl-code-input', {
    id: 'pl-code',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: 6,
    dir: 'ltr',
    required: true,
    'aria-describedby': 'pl-code-hint pl-expiry',
  });
  const errHost = h('div', { 'aria-live': 'assertive' });
  const status = statusLine();
  const expiry = h('span#pl-expiry');
  const resend = h('button.pl-link-btn', { type: 'button', disabled: true });
  const change = h('button.pl-link-btn', { type: 'button', onClick: () => phoneStep(phone) }, 'تغيير الرقم');
  const submit = button('دخول', { variant: 'primary', icon: 'lock', type: 'submit', block: true });
  let busy = false;

  function tick() {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expiry.textContent = left
      ? `الرمز صالح لمدة ${left >= 60 ? count(Math.ceil(left / 60), 'minute') : count(left, 'second')}`
      : 'انتهت صلاحية الرمز، اطلب رمزًا جديدًا';
    const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    resend.disabled = wait > 0;
    resend.textContent = wait > 0 ? `إعادة إرسال الرمز بعد ${count(wait, 'second')}` : 'إعادة إرسال الرمز';
  }

  resend.addEventListener('click', async () => {
    if (resend.disabled) return;
    resend.disabled = true;
    mount(errHost);
    try {
      const r = await api.post('/public/portal-login/request', { phone });
      currentChallenge = r.challenge;
      expiresAt = Date.now() + (r.expires_in || 600) * 1000;
      resendAt = Date.now() + (r.resend_after || 60) * 1000;
      input.value = '';
      status.textContent = 'أُرسل رمز جديد إن كان الرقم مسجلًا لدينا؛ الرمز السابق لم يعد صالحًا.';
      input.focus();
    } catch (err) {
      showError(errHost, err);
      if (err?.details?.retry_after) resendAt = Date.now() + err.details.retry_after * 1000;
    }
    tick();
  });

  async function verify() {
    if (busy) return;
    mount(errHost);
    const code = toLatinDigits(input.value).replace(/\D/g, '');
    if (code.length !== 6) {
      mount(errHost, alertBox('أدخل الرمز المكون من 6 أرقام كما وصلك', 'danger', { icon: 'alert' }));
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    busy = true;
    submit.disabled = true;
    submit.classList.add('is-loading');
    status.textContent = 'جارٍ التحقق من الرمز…';
    try {
      const r = await api.post('/public/portal-login/verify', { challenge: currentChallenge, code });
      status.textContent = 'تم التحقق، جارٍ فتح صفحتك…';
      clearTimers();
      window.location.replace(r.redirect);
    } catch (err) {
      status.textContent = '';
      showError(errHost, err);
      input.setAttribute('aria-invalid', 'true');
      input.select();
      submit.disabled = false;
      submit.classList.remove('is-loading');
      busy = false;
    }
  }

  input.addEventListener('input', () => {
    const v = toLatinDigits(input.value).replace(/\D/g, '').slice(0, 6);
    if (input.value !== v) input.value = v;
    input.removeAttribute('aria-invalid');
    if (v.length === 6) verify();
  });
  const form = h(
    'form.pl-form',
    { novalidate: true, onSubmit: (e) => { e.preventDefault(); verify(); } },
    h(
      'div.field',
      h('label.field-label', { htmlFor: 'pl-code' }, 'رمز الدخول'),
      input,
      h('p.field-hint', { id: 'pl-code-hint' }, `أرسلنا الرمز عبر واتساب إلى الرقم `, h('bdi', { dir: 'ltr' }, maskPhone(phone)), ' إن كان مسجلًا لدينا.'),
    ),
    errHost,
    status,
    submit,
    h('div.pl-meta', expiry, h('span.row', resend, h('span.muted', { 'aria-hidden': 'true' }, '·'), change)),
  );
  mount(
    root,
    h('span.pl-icon', { 'aria-hidden': 'true' }, icon('lock', { size: 26 })),
    h('h2#pl-title', 'أدخل رمز الدخول'),
    h('p.pl-lead', message || 'إذا كان هذا الرقم مسجلًا لدينا فسيصلك رمز من 6 أرقام عبر واتساب.'),
    form,
    demoNote(),
    notes(),
  );
  tick();
  timers.push(setInterval(tick, 1000));
  input.focus();
}

function disabledView() {
  const wa = whatsappUrl(meta.settings?.whatsapp_number_digits, `مرحبًا ${orgName()}، أريد رابط صفحتي لمتابعة طلبي.`);
  mount(
    root,
    h('span.pl-icon', { 'aria-hidden': 'true' }, icon('info', { size: 26 })),
    h('h2#pl-title', 'الدخول برمز واتساب غير متاح حاليًا'),
    h('p.pl-lead', 'يمكنك متابعة طلبك من الرابط الخاص الذي أرسلناه لك، أو مراسلتنا لنرسل لك رابطًا جديدًا.'),
    wa ? button('راسلنا عبر واتساب', { variant: 'whatsapp', icon: 'whatsapp', href: wa, target: '_blank', block: true }) : null,
  );
}

async function init() {
  try {
    initSiteChrome();
  } catch {
    /* رأس الموقع اختياري */
  }
  try {
    meta = setMeta(await api.get('/meta'));
  } catch {
    /* تعمل الصفحة بالقيم الافتراضية إن تعذر تحميل الإعدادات */
  }
  if (meta.messaging && meta.messaging.portal_otp_enabled === false) {
    disabledView();
    return;
  }
  const prefill = new URLSearchParams(window.location.search).get('phone') || '';
  phoneStep(/^[\d+\s]{0,20}$/.test(prefill) ? prefill : '');
}

init();
