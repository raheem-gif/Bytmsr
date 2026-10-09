// الإصدار 10 — «الفريق» (U10-67…U10-70 مع L-50 وL-60 و§8.3): مَن يستخدم البوابة، والعدّاد «{n} من {max} في باقتكم».
// الصف: الاسم والوظيفة والبريد، الدور (محدد)، الحالة (ممتلئة)، «التكاليف الإضافية»، التحقق بخطوتين، آخر دخول، وقائمة إجراءات
// (منبثقة على الحاسوب، ورقة على الهاتف). «دعوة زميل»: الرابط يُعرض مرة واحدة للداعي فقط حين لا يُرسل بالبريد؛ ورابط كلمة مرور
// الزميل بالبريد فقط (لا رابط أبدًا؛ ask_team)؛ ودعوة بريد لدى شركة أخرى «للمراجعة» بنفس الشكل.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative } from '../../lib/fmt.js';
import { icon, button, badge, avatar, table, kRow, field, choiceTiles, toast, errorMessage, confirmDanger, modal } from '../../lib/ui.js';
import { copy, countOf, whenLong } from '../../lib/company-ui.js';
import { W } from '../words-pages.js';
import { readOnly } from '../state.js';
import { pageHead, errorView, sectionCard } from '../common.js';
import { textSheet, menuButton, sheetError, showError } from '../page-kit.js';

const T = W.team;
const ROLES = ['company_admin', 'member', 'viewer'];
const STATE_TONE = { active: 'success', invite_pending: 'warning', inactive: 'neutral', locked: 'danger' };
const STATE_ICON = { invite_pending: 'clock', locked: 'lock' };
const roleLabel = (r) => ({ company_admin: 'مدير البوابة', member: 'عضو', viewer: 'اطلاع فقط' })[r] || r;
const desktop = () => {
  try {
    return window.matchMedia('(min-width: 1024px)').matches;
  } catch {
    return false;
  }
};

function roleTiles(value, onChange) {
  return choiceTiles({ label: T.role, value, columns: 1, options: ROLES.map((r) => ({ value: r, label: roleLabel(r), hint: T[`role_${r}`] })), onChange });
}

/** الرابط للنسخ مرة واحدة (الدعوة حين لا تُرسل بالبريد) */
function copyOnce(invite, name) {
  const link = h('input.input.co-copy-link', { type: 'text', readonly: true, dir: 'ltr', value: invite.url, 'aria-label': T.copy_link });
  return h(
    'div.co-copy-once',
    { role: 'status' },
    h('p', copy('team.copy_once', { name })),
    link,
    h(
      'div.co-row-actions',
      button(T.copy_link, {
        variant: 'primary',
        icon: 'copy',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(invite.url);
            toast(T.copied, 'success');
          } catch {
            link.select();
          }
        },
      }),
    ),
    invite.expires_at ? h('p.co-muted', copy('team.valid_until', { when: whenLong(invite.expires_at) })) : null,
  );
}

function inviteSheet(ctx, team) {
  const name = h('input.input', { type: 'text', dir: 'auto', maxlength: 120, autocomplete: 'off', 'aria-required': 'true' });
  const email = h('input.input', { type: 'email', dir: 'ltr', maxlength: 200, autocomplete: 'off', 'aria-required': 'true', placeholder: 'name@company.com' });
  const job = h('input.input', { type: 'text', dir: 'auto', maxlength: 120, autocomplete: 'off' });
  let role = 'member';
  const billing = h('input', { type: 'checkbox', id: 'co-inv-billing' });
  const nameWrap = field(T.name, name, { required: true });
  const emailWrap = field(T.email, email, { required: true });
  const err = sheetError();
  const result = h('div.co-invite-result');
  const form = h(
    'div.co-sheet-body',
    nameWrap,
    emailWrap,
    field(T.job, job),
    roleTiles(role, (v) => (role = v || 'member')),
    h('label.check.check-single', { htmlFor: billing.id }, billing, h('span', T.billing)),
    err,
  );
  let done = false;
  const sh = textSheet({
    title: T.invite,
    dirty: () => !done && !!(name.value.trim() || email.value.trim() || job.value.trim()),
    body: h('div', form, result),
    onClose: () => done && ctx.reload(),
    actions: [
      {
        label: T.send,
        variant: 'primary',
        onClick: async () => {
          showError(err, '');
          nameWrap.setError('');
          emailWrap.setError('');
          if (!name.value.trim()) {
            nameWrap.setError(T.name_required);
            name.focus();
            return false;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
            emailWrap.setError(T.email_invalid);
            email.focus();
            return false;
          }
          let res;
          try {
            res = await api.post('/company/team/invite', { name: name.value.trim(), email: email.value.trim(), job_title: job.value.trim() || undefined, role, billing_contact: billing.checked });
          } catch (e) {
            const f = e?.details?.fields || {};
            if (f.name) nameWrap.setError(f.name);
            if (f.email) emailWrap.setError(f.email);
            showError(err, errorMessage(e));
            return false;
          }
          done = true;
          const inv = res.invite || {};
          if (inv.pending_review) {
            toast(T.pending_review, 'info', 6000);
            ctx.reload();
            return true;
          }
          if (inv.emailed || !inv.url) {
            toast(copy('team.sent', { email: email.value.trim() }), 'success', 6000);
            ctx.reload();
            return true;
          }
          // لم يُرسل بالبريد: الورقة تبقى بالرابط للنسخ مرة واحدة
          form.hidden = true;
          mount(result, copyOnce(inv, name.value.trim()));
          sh.buttons?.forEach((b) => (b.hidden = true));
          // «إغلاق» بدل تذييل فارغ
          sh.buttons?.[0]?.parentElement?.append(button(T.close, { variant: 'secondary', onClick: () => sh.requestDismiss('button') }));
          return false;
        },
      },
    ],
  });
}

function showLinkSheet(inv, user, ctx) {
  modal({ title: T.resend, sheet: true, body: copyOnce(inv, user.name), actions: [{ label: T.close, variant: 'secondary' }], onClose: () => ctx.reload() });
}

async function patchUser(u, body, ctx, okText = T.saved) {
  try {
    await api.patch(`/company/team/${encodeURIComponent(u.id)}`, body);
  } catch (e) {
    return toast(e?.code === 'last_admin' ? T.last_admin : errorMessage(e), 'danger', 6000);
  }
  toast(okText, 'success');
  ctx.reload();
}

function roleSheet(u, ctx) {
  let role = u.role;
  modal({
    title: copy('team.actions', { name: u.name }),
    sheet: true,
    body: h('div.co-sheet-body', roleTiles(role, (v) => (role = v || u.role))),
    actions: [
      {
        label: T.save,
        variant: 'primary',
        onClick: async () => {
          if (role === u.role) return true;
          await patchUser(u, { role }, ctx);
          return true;
        },
      },
    ],
  });
}

function actionsOf(u, ctx) {
  if (u.me || readOnly()) return [];
  const id = encodeURIComponent(u.id);
  const items = [];
  if (u.active) items.push({ label: T.change_role, icon: 'userCog', onClick: () => roleSheet(u, ctx) });
  if (u.active) items.push({ label: u.billing_contact ? T.billing_off : T.billing_on, icon: 'wallet', onClick: () => patchUser(u, { billing_contact: !u.billing_contact }, ctx) });
  if (u.active && u.state !== 'invite_pending') {
    items.push({
      label: T.reset,
      icon: 'mail',
      onClick: async () => {
        try {
          await api.post(`/company/team/${id}/reset-link`, {});
        } catch (e) {
          return toast(errorMessage(e), 'warning', 8000);
        }
        toast(copy('team.reset_sent', { email: u.email }), 'success', 6000);
      },
    });
  }
  if (u.active && u.state === 'invite_pending') {
    items.push({
      label: T.resend,
      icon: 'send',
      onClick: async () => {
        let res;
        try {
          res = await api.post(`/company/team/${id}/invite`, {});
        } catch (e) {
          return toast(errorMessage(e), 'danger', 6000);
        }
        const inv = res.invite || {};
        if (!inv.emailed && inv.url) return showLinkSheet(inv, u, ctx);
        toast(copy('team.sent', { email: u.email }), 'success', 6000);
      },
    });
  }
  if (u.active && u.state !== 'invite_pending') {
    items.push({
      label: T.revoke,
      icon: 'logout',
      onClick: async () => {
        try {
          await api.post(`/company/team/${id}/sessions/revoke`, {});
        } catch (e) {
          return toast(errorMessage(e), 'danger', 6000);
        }
        toast(T.revoked, 'success');
      },
    });
  }
  if (u.active) {
    items.push({
      label: T.deactivate,
      icon: 'x',
      danger: true,
      onClick: async () => {
        const ok = await confirmDanger({ title: copy('team.deactivate_title', { name: u.name }), message: T.deactivate_text, confirmLabel: T.deactivate, cancelLabel: W.state.cancel });
        if (ok) patchUser(u, { active: false }, ctx, T.deactivated);
      },
    });
  } else items.push({ label: T.reactivate, icon: 'refresh', onClick: () => patchUser(u, { active: true }, ctx, T.reactivated) });
  return items;
}

/** قائمة الإجراءات: منبثقة على الحاسوب، وورقة على الهاتف */
function rowMenu(u, ctx) {
  const items = actionsOf(u, ctx);
  if (!items.length) return u.me ? h('a.co-link', { href: '#/account' }, T.my_account) : null;
  if (desktop()) return menuButton(copy('team.actions', { name: u.name }), items);
  return h(
    'button.icon-btn.co-more-btn',
    {
      type: 'button',
      'aria-label': copy('team.actions', { name: u.name }),
      onClick: () => {
        const sheet = modal({
          title: u.name,
          sheet: true,
          body: h(
            'ul.k-list.co-sheet-menu',
            items.map((it) => h('li', kRow({ icon: it.icon, title: it.label, className: it.danger ? 'is-danger' : '', chevron: false, onClick: () => { sheet.close('action'); it.onClick(); } }))),
          ),
        });
      },
    },
    icon('moreHorizontal', { size: 22 }),
  );
}

const stateBadge = (u) => badge(u.state_label || u.state, STATE_TONE[u.state] || 'neutral', { className: 'co-badge', icon: STATE_ICON[u.state] || (STATE_TONE[u.state] === 'success' ? 'checkCircle' : null) });
const roleBadge = (u) => badge(u.role_label || roleLabel(u.role), 'primary', { className: 'co-badge' });
const tfa = (u) => copy('team.tfa_line', { state: u.two_factor ? T.tfa_on : T.tfa_off });
const lastLogin = (u) => (u.last_login_at ? relative(u.last_login_at) : T.never);

function twoFactorCard(profile, items, ctx) {
  if (!profile || readOnly()) return null;
  const pending = items.filter((u) => u.active && u.state !== 'invite_pending' && !u.two_factor && !u.me).length;
  const sw = h('input', { type: 'checkbox', role: 'switch', id: 'co-req-2fa', checked: !!profile.require_2fa });
  sw.addEventListener('change', async () => {
    sw.disabled = true;
    try {
      await api.patch('/company/profile', { require_2fa: sw.checked });
      toast(T.saved, 'success');
    } catch (e) {
      sw.checked = !sw.checked;
      toast(errorMessage(e), 'danger', 6000);
    } finally {
      sw.disabled = false;
    }
    ctx.reload();
  });
  return sectionCard(
    T.tfa_card,
    h(
      'div.co-sheet-body',
      h('label.check.check-single.co-switch', { htmlFor: sw.id }, sw, h('span', T.tfa_switch)),
      h('p.field-hint', T.tfa_hint),
      h('p.co-muted', pending ? copy('team.tfa_pending', { n: pending }) : T.tfa_all),
    ),
  );
}

export default async function team(ctx) {
  let res;
  let profile = null;
  try {
    [res, profile] = await Promise.all([api.get('/company/team'), api.get('/company/profile').catch(() => null)]);
  } catch (err) {
    return errorView(W.nav.team, err, () => ctx.reload());
  }
  const items = res.items || [];
  const activeCount = items.filter((u) => u.active).length;
  const counter = h('p.co-muted.num', copy('team.counter', { n: activeCount, max: res.max_users != null ? countOf(res.max_users, 'user') : '—' }));
  const invite = !readOnly() ? button(T.invite, { variant: 'secondary', icon: 'userPlus', onClick: () => inviteSheet(ctx, res) }) : null;
  const nameCell = (u) =>
    h(
      'span.co-member',
      avatar(u.name, { size: 'sm' }),
      h(
        'span.co-member-text',
        h('span.co-member-name', { dir: 'auto' }, u.name, u.me ? h('span.co-muted', ` (${T.me})`) : null),
        u.job_title ? h('span.co-muted', { dir: 'auto' }, u.job_title) : null,
        h('bdi.co-muted.co-member-email', { dir: 'ltr' }, u.email),
        u.billing_contact ? badge(T.billing_chip, 'neutral', { className: 'co-badge', icon: 'wallet' }) : null,
      ),
    );
  let list;
  if (desktop()) {
    list = table({
      caption: W.nav.team,
      rows: items,
      columns: [
        { key: 'name', label: T.col_name, render: nameCell },
        { key: 'role', label: T.col_role, render: roleBadge },
        { key: 'state', label: T.col_state, render: stateBadge },
        { key: 'tfa', label: T.col_2fa, render: (u) => (u.two_factor ? T.tfa_on : T.tfa_off) },
        { key: 'login', label: T.col_login, render: (u) => h('span.num', lastLogin(u)) },
        { key: 'menu', label: '', render: (u) => rowMenu(u, ctx) },
      ],
    });
  } else {
    list = h(
      'ul.k-list.co-team-rows',
      items.map((u) =>
        h(
          'li.co-team-row',
          h('div.co-team-main', nameCell(u), h('div.co-badges', roleBadge(u), stateBadge(u)), h('p.co-muted.co-team-meta', `${tfa(u)} · ${copy('team.last_login', { when: lastLogin(u) })}`)),
          h('div.co-team-menu', rowMenu(u, ctx)),
        ),
      ),
    );
  }
  return h('div.co-page.co-team-page', pageHead(W.nav.team, T.sub, { actions: invite }), counter, sectionCard(null, list), twoFactorCard(profile, items, ctx));
}

