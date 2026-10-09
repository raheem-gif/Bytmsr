// الإصدار 10 — شاشات الإلزام بعد الدخول (U10-76): شركة تشترط التحقق بخطوتين ولم يفعّله المستخدم، أو كلمة مرور مؤقتة.
// لا شيء آخر متاح حتى يكتمل الإجراء (الخادم يرد 403 بنفس رموز منصة الفريق؛ L-16). المعالج نفسه بمسار /company/me ونصوص الجمع.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { button, field, setBusy, icon } from '../../lib/ui.js';
import { twoFactorWizard } from '../../app/components/two-factor.js';
import { attachStrength } from '../../app/components/password.js';
import { W } from '../words-flows.js';
import { S } from '../state.js';
import { authLayout, passwordInput } from './login.js';

export function renderGate(root, { onDone, onLogout }) {
  const logout = h('p.co-auth-links', button(W.nav.logout, { variant: 'link', onClick: () => onLogout?.() }));
  if (S.user?.restricted === 'two_factor_enrollment') {
    const wizard = twoFactorWizard({ username: S.user.email, askPassword: false, base: '/company/me', copy: W.twoFactor, onEnabled: () => onDone?.() });
    mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.gate.tfa_title), h('p.co-auth-sub', W.gate.tfa_text), h('div.co-gate-wizard', wizard), logout));
    root.querySelector('h1')?.focus();
    return;
  }
  const cur = passwordInput({ autocomplete: 'current-password' });
  const next = passwordInput({ autocomplete: 'new-password' });
  const conf = passwordInput({ autocomplete: 'new-password' });
  const curWrap = field(W.gate.current, cur.el, { required: true });
  const nextWrap = field(W.gate.new, next.el, { required: true, hint: W.link.password_hint });
  const confWrap = field(W.gate.confirm, conf.el, { required: true });
  attachStrength({ control: () => ({ input: next.input, wrap: nextWrap }) }, 'password', () => String(S.user?.email || '').split('@')[0]);
  const errEl = h('p.co-auth-error', { role: 'alert', hidden: true });
  const submit = button(W.gate.save, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const form = h('form.co-auth-form', { novalidate: true }, curWrap, nextWrap, confWrap, submit, errEl);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    if (!cur.input.value) return cur.input.focus();
    if (!next.input.value) return next.input.focus();
    if (conf.input.value !== next.input.value) {
      confWrap.setError(W.link.mismatch);
      return conf.input.focus();
    }
    setBusy(submit, true);
    try {
      await api.post('/company/me/password', { current_password: cur.input.value, password: next.input.value, password_confirm: conf.input.value });
      await onDone?.();
    } catch (err) {
      const f = err?.details?.fields || {};
      if (f.current_password) curWrap.setError(f.current_password);
      if (f.password) nextWrap.setError(f.password);
      if (f.password_confirm) confWrap.setError(f.password_confirm);
      if (!Object.keys(f).length) {
        errEl.replaceChildren(icon('alert', { size: 16 }), h('span', err?.message || W.login.network));
        errEl.hidden = false;
      }
    } finally {
      setBusy(submit, false);
    }
  });
  mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.gate.password_title), form, logout));
  cur.input.focus();
}
