// الإصدار 10 — دخول بوابة الشركات (U10-14 الدخول، U10-15 التحقق بخطوتين، U10-16 «نسيت كلمة المرور»).
// لا يستخدم صفحات دخول منصة الفريق (L-42). خطأ رمز التحقق 400 (لا انتهاء جلسة؛ CS-27). «تذكر هذا الجهاز» لا يظهر إلا
// حين يرسل الخادم meta.limits.remember_days (CO-21).
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta, count } from '../../lib/fmt.js';
import { icon, button, field, brandLockup, alertBox, toast, uid, setBusy } from '../../lib/ui.js';
import { copy, countOf } from '../../lib/company-ui-core.js';
import { W } from '../words-flows.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** حقل كلمة مرور بزر «إظهار» */
export function passwordInput({ autocomplete = 'current-password', id = uid('pw') } = {}) {
  const input = h('input.input', { id, type: 'password', dir: 'ltr', autocomplete, required: true });
  const toggle = h('button.input-action', { type: 'button', 'aria-pressed': 'false', 'aria-controls': id }, W.login.show);
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.textContent = show ? W.login.hide : W.login.show;
  });
  return { input, el: h('div.input-group.input-group-action', input, toggle) };
}

/** حقل البريد بتحقق عند المغادرة («كافئ مبكرًا، عاقب متأخرًا») */
export function emailField(value = '') {
  const input = h('input.input', { type: 'email', dir: 'ltr', inputmode: 'email', autocomplete: 'username', required: true, placeholder: W.login.email_placeholder, value });
  const wrap = field(W.login.email, input, { required: true });
  let touched = false;
  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (!v && !touched) return;
    touched = true;
    wrap.setError(v && !EMAIL_RE.test(v) ? W.login.email_format : '');
  });
  input.addEventListener('input', () => wrap.classList.contains('has-error') && EMAIL_RE.test(input.value.trim()) && wrap.setError(''));
  return { input, wrap, valid: () => EMAIL_RE.test(input.value.trim()) };
}

/** هيكل شاشات الدخول: نصف بمادة غامقة وشعار على الحاسوب، والنموذج (≤ 400px) */
export function authLayout(...content) {
  return h(
    'div.co-auth',
    h(
      'aside.co-auth-panel',
      // v11 visual (V11-04): الشعار الذهبي الفاتح على أرضية الشعار الغامقة (الحاسوب)، والذهبي الغامق على الأبيض (الهاتف)
      h('div.co-auth-panel-in', brandLockup({ tone: 'bright', width: 280 }), h('p.co-auth-promise', { lang: 'en', dir: 'ltr' }, W.brand.tagline_en), h('ul.co-auth-lines', [W.login.line1, W.login.line2, W.login.line3].map((t) => h('li', icon('check', { size: 18 }), h('span', t))))),
    ),
    h(
      'main.co-auth-main',
      h(
        'div.co-auth-card',
        h('div.co-auth-brand', brandLockup({ width: 220 }), h('p.co-auth-promise', { lang: 'en', dir: 'ltr' }, W.brand.tagline_en), h('p.co-auth-portal', W.brand.portal)),
        ...content,
      ),
    ),
  );
}

function errorText(err) {
  if (!err || !err.status) return W.login.network;
  if (err.code === 'invalid_credentials') return W.login.invalid;
  if (err.code === 'locked') return copy('login.locked', { minutes: count(Number(err.details?.retry_after_minutes) || 15, 'minute') });
  if (err.code === 'account_inactive') return W.login.inactive;
  return err.message || W.login.network;
}

export function renderLogin(root, { notice = null, email = '', onSignedIn } = {}) {
  const em = emailField(email);
  const pw = passwordInput();
  const remember = getMeta()?.limits?.remember_days;
  const rememberBox = remember ? h('input', { type: 'checkbox', id: uid('rem') }) : null;
  const errEl = h('p.co-auth-error', { role: 'alert', hidden: true });
  const submit = button(W.login.submit, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const showError = (msg) => {
    errEl.replaceChildren(icon('alert', { size: 16 }), h('span', msg));
    errEl.hidden = !msg;
  };
  const form = h(
    'form.co-auth-form',
    { novalidate: true },
    notice ? alertBox(notice, 'info') : null,
    em.wrap,
    field(W.login.password, pw.el, { required: true }),
    remember
      ? h('div.co-remember', h('label.check.check-single', { htmlFor: rememberBox.id }, rememberBox, h('span', W.login.remember)), h('p.field-hint', copy('login.remember_hint', { days: count(remember.default || remember, 'day'), days_2fa: count(remember.two_factor || remember, 'day') })))
      : null,
    submit,
    errEl,
    h('p.co-auth-links', h('a', { href: '#/forgot' }, W.login.forgot)),
    h('p.co-auth-staff', h('a', { href: '/app' }, W.login.staff, ' ‹')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.classList.contains('is-loading')) return;
    showError('');
    if (!em.input.value.trim() || !em.valid()) {
      em.wrap.setError(em.input.value.trim() ? W.login.email_format : W.login.required);
      return em.input.focus();
    }
    if (!pw.input.value) return pw.input.focus();
    setBusy(submit, true);
    try {
      const res = await api.post('/company/auth/login', { email: em.input.value.trim(), password: pw.input.value, remember: rememberBox ? rememberBox.checked : undefined });
      if (res?.two_factor_required) return renderTwoFactor(root, { challenge: res.challenge, email: em.input.value.trim(), onSignedIn });
      await onSignedIn(res);
    } catch (err) {
      pw.input.value = '';
      showError(errorText(err));
      pw.input.focus();
    } finally {
      setBusy(submit, false);
    }
  });
  mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.titles.login), form));
  (email ? pw.input : em.input).focus();
}

export function renderTwoFactor(root, { challenge, email, onSignedIn }) {
  if (window.location.hash !== '#/login/2fa') window.history.replaceState(null, '', '#/login/2fa');
  let recovery = false;
  const input = h('input.input.num.co-otp', { type: 'text', dir: 'ltr', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, required: true });
  const wrap = field(W.login.tfa_code, input, { required: true });
  const lead = h('p.co-auth-sub', W.login.tfa_text);
  const errEl = h('p.co-auth-error', { role: 'alert', hidden: true });
  const submit = button(W.login.tfa_confirm, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const swap = button(W.login.tfa_use_recovery, { variant: 'link', onClick: () => setMode(!recovery) });
  function setMode(r) {
    recovery = r;
    input.value = '';
    input.setAttribute('inputmode', r ? 'text' : 'numeric');
    input.setAttribute('autocomplete', r ? 'off' : 'one-time-code');
    input.maxLength = r ? 14 : 6;
    input.classList.toggle('co-otp', !r);
    wrap.querySelector('.field-label').firstChild.textContent = r ? W.login.tfa_recovery : W.login.tfa_code;
    lead.textContent = r ? W.login.tfa_recovery_text : W.login.tfa_text;
    swap.querySelector('.btn-label').textContent = r ? W.login.tfa_use_code : W.login.tfa_use_recovery;
    errEl.hidden = true;
    input.focus();
  }
  const form = h('form.co-auth-form', { novalidate: true }, lead, wrap, submit, errEl, h('p.co-auth-links', swap, ' · ', h('a', { href: '#/login' }, W.login.tfa_back)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.replace(/\s/g, '');
    if (!v) return input.focus();
    setBusy(submit, true);
    try {
      const res = await api.post('/company/auth/login/2fa', recovery ? { challenge, recovery_code: v } : { challenge, code: v });
      if (res?.recovery_codes_remaining != null) {
        const n = Number(res.recovery_codes_remaining);
        toast(copy('login.tfa_remaining', { codes: countOf(n, 'recovery') }), n <= 3 ? 'warning' : 'info', 8000);
      }
      await onSignedIn(res);
    } catch (err) {
      input.value = '';
      if (err?.code === 'challenge_expired' || err?.status === 410) {
        errEl.replaceChildren(icon('alert', { size: 16 }), h('span', W.login.tfa_expired));
        errEl.hidden = false;
        submit.disabled = true;
        return;
      }
      errEl.replaceChildren(icon('alert', { size: 16 }), h('span', errorText(err)));
      errEl.hidden = false;
      input.focus();
    } finally {
      setBusy(submit, false);
    }
  });
  mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.login.tfa_title), h('p.co-auth-email', { dir: 'ltr' }, email), form));
  input.focus();
}

export function renderForgot(root, { email = '', onBack } = {}) {
  const em = emailField(email);
  const submit = button(W.login.forgot_submit, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const box = h('div');
  const back = h('p.co-auth-links', h('a', { href: '#/login', onClick: (e) => { e.preventDefault(); onBack?.(); } }, W.login.back_to_login));
  const form = h('form.co-auth-form', { novalidate: true }, h('p.co-auth-sub', W.login.forgot_text), em.wrap, submit, back);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!em.valid()) {
      em.wrap.setError(em.input.value.trim() ? W.login.email_format : W.login.required);
      return em.input.focus();
    }
    setBusy(submit, true);
    try {
      await api.post('/company/auth/forgot', { email: em.input.value.trim() });
    } catch {
      /* الرد نفسه دائمًا */
    }
    setBusy(submit, false);
    mount(box, alertBox(W.login.forgot_sent, 'success'), h('p.co-auth-sub', W.login.forgot_help), back);
    form.replaceWith(box);
    box.querySelector('a')?.focus();
  });
  mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.login.forgot_title), form, box));
  em.input.focus();
}
