// الإصدار 10 — «حسابي والأمان» `#/account` (U10-75 مع §8.3 وL-16): بياناتي (البريد يغيّره فريقكم القانوني فقط، L-60)، رسائل
// البريد الإلكتروني (تختفي حين لا يكون البريد مُعدًّا، CO-2)، كلمة المرور، التحقق بخطوتين بنفس معالج منصة الفريق (base
// '/company/me' ونصوص الجمع)، الأجهزة المسجّل منها الدخول (P1)، وتسجيل الخروج.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { getMeta, relative } from '../../lib/fmt.js';
import { icon, button, badge, field, choiceTiles, toast, errorMessage, setBusy } from '../../lib/ui.js';
import { ensureStyles } from '../../app/router.js';
import { copy, countOf, whenLong } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { S } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';
import { textSheet, sheetError, showError } from '../page-kit.js';
import { passwordInput } from './login.js';

const A = W.account;

function profileCard(me, ctx) {
  const u = me.user;
  const mk = (v, { dir = 'auto', max = 120, type = 'text' } = {}) => {
    const el = h('input.input', { type, dir, maxlength: max, autocomplete: 'off' });
    el.value = v || '';
    return el;
  };
  const name = mk(u.name);
  const job = mk(u.job_title);
  const phone = mk(u.phone, { dir: 'ltr', max: 30, type: 'tel' });
  const nameWrap = field(A.name, name, { required: true });
  const phoneWrap = field(A.phone, phone, { hint: A.phone_hint });
  const err = sheetError();
  const save = button(A.save, { variant: 'primary', type: 'submit' });
  const form = h(
    'form.co-account-form',
    { novalidate: true },
    nameWrap,
    field(A.job, job),
    phoneWrap,
    field(A.email, h('bdi.co-readonly', { dir: 'ltr' }, u.email), { hint: A.email_hint }),
    err,
    h('div.form-actions', save),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(err, '');
    if (!name.value.trim()) return nameWrap.setError(W.newRequest.required);
    setBusy(save, true);
    try {
      const res = await api.patch('/company/me', { name: name.value.trim(), job_title: job.value.trim(), phone: phone.value.trim() || null });
      if (res?.user?.name) S.user = { ...S.user, name: res.user.name };
      toast(A.saved, 'success');
    } catch (ex) {
      const f = ex?.details?.fields || {};
      if (f.name) nameWrap.setError(f.name);
      if (f.phone) phoneWrap.setError(f.phone);
      if (!Object.keys(f).length) showError(err, errorMessage(ex));
    } finally {
      setBusy(save, false);
    }
  });
  return sectionCard(A.me, form, { id: 'me' });
}

function mailCard(me) {
  if (!getMeta()?.email_enabled) return null;
  const tiles = choiceTiles({
    label: null,
    value: me.user.email_pref || 'important',
    columns: 1,
    options: [
      { value: 'all', label: A.mail_all },
      { value: 'important', label: A.mail_important },
      { value: 'none', label: A.mail_none },
    ],
    onChange: async (v) => {
      try {
        await api.patch('/company/me', { email_pref: v });
        toast(A.saved, 'success');
      } catch (e) {
        toast(errorMessage(e), 'danger', 6000);
      }
    },
  });
  return sectionCard(copy('account.mail'), h('div', tiles, h('p.field-hint', A.mail_note)), { id: 'mail' });
}

function passwordCard(me) {
  const cur = passwordInput({ autocomplete: 'current-password' });
  const next = passwordInput({ autocomplete: 'new-password' });
  const conf = passwordInput({ autocomplete: 'new-password' });
  const curWrap = field(A.current, cur.el, { required: true });
  const nextWrap = field(A.new, next.el, { required: true, hint: W.link.password_hint });
  const confWrap = field(A.confirm, conf.el, { required: true });
  import('../../app/components/password.js').then(({ attachStrength }) => attachStrength({ control: () => ({ input: next.input, wrap: nextWrap }) }, 'password', () => String(me.user.email || '').split('@')[0])).catch(() => {});
  const err = sheetError();
  const submit = button(A.change, { variant: 'primary', type: 'submit' });
  const form = h('form.co-account-form', { novalidate: true }, curWrap, nextWrap, confWrap, h('p.field-hint', A.change_note), err, h('div.form-actions', submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(err, '');
    for (const w of [curWrap, nextWrap, confWrap]) w.setError('');
    if (!cur.input.value) return cur.input.focus();
    if (!next.input.value) return next.input.focus();
    if (conf.input.value !== next.input.value) {
      confWrap.setError(W.link.mismatch);
      return conf.input.focus();
    }
    setBusy(submit, true);
    try {
      await api.post('/company/me/password', { current_password: cur.input.value, password: next.input.value, password_confirm: conf.input.value });
      for (const x of [cur, next, conf]) x.input.value = '';
      toast(A.changed, 'success');
    } catch (ex) {
      const f = ex?.details?.fields || {};
      if (f.current_password) curWrap.setError(f.current_password);
      if (f.password || f.new_password) nextWrap.setError(f.password || f.new_password);
      if (f.password_confirm) confWrap.setError(f.password_confirm);
      if (!Object.keys(f).length) showError(err, errorMessage(ex));
    } finally {
      setBusy(submit, false);
    }
  });
  return sectionCard(A.password, form, { id: 'password' });
}

/** ورقة كلمة المرور + رمز التطبيق (إيقاف التحقق بخطوتين، رموز استرداد جديدة) */
function reauthSheet({ title, text, label, path, onDone }) {
  const pw = passwordInput({ autocomplete: 'current-password' });
  const code = h('input.input', { type: 'text', inputmode: 'numeric', dir: 'ltr', autocomplete: 'one-time-code', maxlength: 8 });
  const err = sheetError();
  const body = h('div.co-sheet-body', text ? h('p.co-sheet-lead', text) : null, field(A.current, pw.el, { required: true }), field(A.tfa_code, code, { required: true }), err);
  const sh = textSheet({
    title,
    dirty: () => !!(pw.input.value || code.value),
    body,
    actions: [
      { label: A.cancel, variant: 'ghost' },
      {
        label,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          if (!pw.input.value) return pw.input.focus(), false;
          if (!code.value.trim()) return code.focus(), false;
          let res;
          try {
            res = await api.post(path, { password: pw.input.value, code: code.value.trim() });
          } catch (e) {
            showError(err, errorMessage(e));
            return false;
          }
          return onDone(res, sh, body);
        },
      },
    ],
  });
  return sh;
}

function twoFactorCard(me, ctx) {
  const t = me.two_factor || {};
  const body = h('div.co-2fa');
  const requireIt = !!me.policy?.require_2fa || !!me.company?.require_2fa;
  async function openWizard() {
    const [{ twoFactorWizard }] = await Promise.all([import('../../app/components/two-factor.js'), ensureStyles(['v9-accounts'])]);
    mount(
      body,
      twoFactorWizard({
        username: me.user.email,
        askPassword: true,
        base: '/company/me',
        copy: W.twoFactor,
        onEnabled: () => {
          toast(A.tfa_enabled, 'success');
          ctx.reload();
        },
        onCancel: () => ctx.reload(),
      }),
    );
  }
  if (!t.enabled) {
    mount(body, h('p.co-muted', A.tfa_off), button(A.tfa_enable, { variant: 'primary', icon: 'shield', onClick: openWizard }));
  } else {
    const codes = button(A.tfa_new_codes, {
      variant: 'secondary',
      onClick: () =>
        reauthSheet({
          title: A.tfa_codes_title,
          text: A.tfa_codes_text,
          label: A.confirm_btn,
          path: '/company/me/2fa/recovery-codes',
          onDone: async (res, sh, sheetBody) => {
            const [{ recoveryCodesPanel }] = await Promise.all([import('../../app/components/two-factor.js'), ensureStyles(['v9-accounts'])]);
            mount(sheetBody, recoveryCodesPanel(res.recovery_codes || [], { username: me.user.email, copy: W.twoFactor, onDone: () => { sh.close('action'); ctx.reload(); } }));
            sh.buttons?.forEach((b) => (b.hidden = true));
            return false;
          },
        }),
    });
    const disable = requireIt
      ? h('p.co-card-note', icon('lock', { size: 16 }), h('span', A.tfa_required))
      : button(A.tfa_disable, {
          variant: 'ghost',
          onClick: () =>
            reauthSheet({
              title: A.tfa_disable,
              label: A.tfa_disable,
              path: '/company/me/2fa/disable',
              onDone: () => {
                toast(A.tfa_disabled, 'success');
                ctx.reload();
                return true;
              },
            }),
        });
    mount(
      body,
      h('p', badge(A.tfa_badge, 'success', { className: 'co-badge', icon: 'checkCircle' }), ' ', t.enabled_at ? copy('account.tfa_since', { date: whenLong(t.enabled_at, { time: false }) }) : ''),
      t.recovery_total ? h('p.co-muted', copy('account.tfa_codes_left', { codes: countOf(t.recovery_remaining, 'recovery') })) : null,
      h('div.co-row-actions', codes, disable),
    );
  }
  return sectionCard(A.tfa, body, { id: 'tfa' });
}

function devicesCard(sessions, ctx) {
  const items = sessions?.items || [];
  if (!items.length) return null;
  const others = items.filter((s) => !s.current);
  const rows = items.map((s) =>
    h(
      'li.co-device',
      h('span.co-device-icon', { 'aria-hidden': 'true' }, icon(s.mobile ? 'phone' : 'globe', { size: 20 })),
      h('span.co-device-main', h('span.co-device-name', s.device || s.user_agent || '—', s.current ? [' ', badge(A.this_device, 'primary', { className: 'co-badge' })] : null), h('span.co-muted', copy('account.last_active', { when: relative(s.last_seen_at || s.created_at) }))),
      s.current
        ? null
        : button(A.sign_out, {
            variant: 'ghost',
            size: 'sm',
            ariaLabel: copy('account.sign_out_device', { device: s.device || '' }),
            onClick: async () => {
              try {
                await api.del(`/company/me/sessions/${encodeURIComponent(s.id)}`);
              } catch (e) {
                return toast(errorMessage(e), 'danger');
              }
              toast(A.signed_out, 'success');
              ctx.reload();
            },
          }),
    ),
  );
  const all = others.length
    ? button(A.sign_out_others, {
        variant: 'secondary',
        icon: 'logout',
        onClick: async () => {
          try {
            await api.post('/company/me/sessions/revoke-others', {});
          } catch (e) {
            return toast(errorMessage(e), 'danger');
          }
          toast(A.signed_out_others, 'success');
          ctx.reload();
        },
      })
    : h('p.co-muted', A.no_others);
  return sectionCard(A.devices, h('div', h('ul.co-devices', rows), all), { id: 'devices' });
}

export default async function account(ctx) {
  let me;
  let sessions = null;
  try {
    [me, sessions] = await Promise.all([api.get('/company/me'), api.get('/company/me/sessions').catch(() => null)]);
  } catch (err) {
    return errorView(W.nav.account, err, () => ctx.reload());
  }
  return h(
    'div.co-page.co-account',
    pageHead(W.nav.account, A.sub),
    h(
      'div.co-columns',
      h('div.co-col-main', profileCard(me, ctx), mailCard(me), passwordCard(me)),
      h('aside.co-col-aside', twoFactorCard(me, ctx), devicesCard(sessions, ctx), h('div.co-account-logout', button(A.sign_out, { variant: 'danger', icon: 'logout', block: true, onClick: () => window.dispatchEvent(new CustomEvent('co:logout')) }))),
    ),
  );
}
