// الإصدار 10 — روابط الدعوة وتعيين كلمة المرور (U10-17، U10-18 مع L-17 وL-49 و§8.3).
// الرمز يُقرأ من الرابط ثم يُحذف منه فورًا (history.replaceState؛ CS-31) ويبقى في الذاكرة فقط. قبول الدعوة يُدخل صاحبها؛
// تعيين كلمة المرور لا يُدخل أحدًا: يعود إلى الدخول بالبريد معبأً وملاحظة «سُجّل خروجكم من كل الأجهزة».
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta } from '../../lib/fmt.js';
import { icon, button, field, brandEl, alertBox, setBusy, uid } from '../../lib/ui.js';
import { attachStrength } from '../../app/components/password.js';
import { copyParts, copy, whenLong } from '../../lib/company-ui-core.js';
import { W } from '../words-flows.js';
import { authLayout, passwordInput } from './login.js';

function failure(root, err, kind, onLogin) {
  const code = err?.code || '';
  const text =
    code === 'link_expired'
      ? kind === 'invite'
        ? W.link.expired_invite
        : W.link.expired_reset
      : code === 'link_used'
        ? W.link.used
        : code === 'link_revoked'
          ? W.link.revoked
          : code === 'link_invalid'
            ? W.link.invalid
            : err?.message || W.login.network;
  const action = code === 'link_expired' ? W.link.to_login : code === 'link_used' ? W.link.login : null;
  mount(
    root,
    authLayout(
      h('h1.co-auth-title', { tabindex: '-1' }, kind === 'invite' ? W.titles.invite : W.link.reset_title),
      alertBox(text, 'warning'),
      action ? button(action, { variant: 'primary', block: true, onClick: () => onLogin(null) }) : h('p.co-auth-links', h('a', { href: '#/login', onClick: (e) => { e.preventDefault(); onLogin(null); } }, W.login.back_to_login)),
    ),
  );
}

export async function renderLink(root, { kind, token, onSignedIn, onLogin }) {
  // CS-31: لا يبقى الرمز في شريط العنوان ولا في سجل المتصفح
  window.history.replaceState(null, '', `#/${kind}`);
  mount(root, authLayout(h('div.co-auth-loading', { role: 'status' }, h('span.spinner', { 'aria-hidden': 'true' }), h('span', kind === 'invite' ? W.link.loading : W.link.loading_reset))));
  let info;
  try {
    info = await api.post('/company/auth/link', { token });
    if (info.kind !== kind) throw Object.assign(new Error(W.link.invalid), { code: 'link_invalid' });
  } catch (err) {
    return failure(root, err, kind, onLogin);
  }
  const email = info.user?.email_masked || '';
  const name = h('input.input', { type: 'text', dir: 'auto', autocomplete: 'name', required: true, maxlength: 120, value: info.user?.name || '' });
  const pw = passwordInput({ autocomplete: 'new-password' });
  const pw2 = passwordInput({ autocomplete: 'new-password' });
  const pwWrap = field(W.link.password, pw.el, { required: true, hint: W.link.password_hint });
  const pw2Wrap = field(W.link.password_confirm, pw2.el, { required: true });
  attachStrength({ control: () => ({ input: pw.input, wrap: pwWrap }) }, 'password', () => email.split('@')[0] || '');
  const nameWrap = field(W.link.name, name, { required: true });
  const errEl = h('p.co-auth-error', { role: 'alert', hidden: true });
  const showError = (msg) => {
    errEl.replaceChildren(icon('alert', { size: 16 }), h('span', msg || ''));
    errEl.hidden = !msg;
  };
  pw2.input.addEventListener('blur', () => pw2.input.value && pw2Wrap.setError(pw2.input.value !== pw.input.value ? W.link.mismatch : ''));
  pw2.input.addEventListener('input', () => pw2Wrap.classList.contains('has-error') && pw2.input.value === pw.input.value && pw2Wrap.setError(''));

  if (kind === 'invite') {
    const termsUrl = info.terms_url || getMeta()?.terms_url || null;
    const terms = h('input', { type: 'checkbox', id: uid('terms'), required: true });
    const termsWrap = h(
      'div.field.co-terms',
      h('label.check.check-single', { htmlFor: terms.id }, terms, h('span', termsUrl ? W.link.terms : W.link.terms_plain)),
      termsUrl ? h('a.co-terms-link', { href: termsUrl, target: '_blank', rel: 'noopener noreferrer' }, W.link.terms_read) : null,
      h('p.field-error', { hidden: true }, icon('alert', { size: 14 }), h('span', W.link.terms_required)),
    );
    const termsErr = termsWrap.querySelector('.field-error');
    terms.addEventListener('change', () => terms.checked && (termsErr.hidden = true));
    const inviter = info.inviter?.kind === 'colleague' && info.inviter.name ? info.inviter.name : null;
    const submit = button(W.link.activate, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
    const form = h('form.co-auth-form', { novalidate: true }, h('p.co-auth-email', copy('link.email', { email })), nameWrap, pwWrap, pw2Wrap, termsWrap, submit, errEl, info.expires_at ? h('p.co-auth-sub', copy('link.valid_until', { when: whenLong(info.expires_at) })) : null);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showError('');
      if (name.value.trim().length < 3) {
        nameWrap.setError(W.login.required);
        return name.focus();
      }
      if (!pw.input.value) return pw.input.focus();
      if (pw2.input.value !== pw.input.value) {
        pw2Wrap.setError(W.link.mismatch);
        return pw2.input.focus();
      }
      if (!terms.checked) {
        termsErr.hidden = false;
        return terms.focus();
      }
      setBusy(submit, true);
      try {
        const res = await api.post('/company/auth/invite/accept', { token, name: name.value.trim(), password: pw.input.value, password_confirm: pw2.input.value, accept_terms: true });
        window.history.replaceState(null, '', '#/overview');
        await onSignedIn(res);
      } catch (err) {
        const f = err?.details?.fields || {};
        if (f.password) pwWrap.setError(f.password);
        if (f.password_confirm) pw2Wrap.setError(f.password_confirm);
        if (f.name) nameWrap.setError(f.name);
        if (f.accept_terms) termsErr.hidden = false;
        if (err?.code && /^link_/.test(err.code)) return failure(root, err, kind, onLogin);
        if (!Object.keys(f).length) showError(err?.message || W.login.network);
      } finally {
        setBusy(submit, false);
      }
    });
    mount(
      root,
      authLayout(
        h('h1.co-auth-title', { tabindex: '-1' }, W.link.welcome),
        h('p.co-auth-sub', ...copyParts('link.invited', { inviter: inviter || h('span', ...copyParts('link.inviter_team', { brand: brandEl() })), company: info.company?.name || '', brand: brandEl() })),
        form,
      ),
    );
    name.focus();
    return;
  }

  // تعيين كلمة مرور جديدة (لا دخول؛ L-17)
  const submit = button(W.link.reset_submit, { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const form = h('form.co-auth-form', { novalidate: true }, h('p.co-auth-sub', copy('link.reset_text', { email })), pwWrap, pw2Wrap, submit, errEl);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    if (!pw.input.value) return pw.input.focus();
    if (pw2.input.value !== pw.input.value) {
      pw2Wrap.setError(W.link.mismatch);
      return pw2.input.focus();
    }
    setBusy(submit, true);
    try {
      const res = await api.post('/company/auth/reset', { token, password: pw.input.value, password_confirm: pw2.input.value });
      onLogin(W.login.reset_done, res?.email || '');
    } catch (err) {
      const f = err?.details?.fields || {};
      if (f.password) pwWrap.setError(f.password);
      if (f.password_confirm) pw2Wrap.setError(f.password_confirm);
      if (err?.code && /^link_/.test(err.code)) return failure(root, err, kind, onLogin);
      if (!Object.keys(f).length) showError(err?.message || W.login.network);
    } finally {
      setBusy(submit, false);
    }
  });
  mount(root, authLayout(h('h1.co-auth-title', { tabindex: '-1' }, W.link.reset_title), form));
  pw.input.focus();
}
