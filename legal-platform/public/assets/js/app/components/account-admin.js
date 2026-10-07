// إدارة حسابات المستخدمين لمدير النظام: الدعوات وروابط إعادة التعيين (مع النسخ والإرسال عبر واتساب)، كلمات المرور المؤقتة،
// رفع الإيقاف المؤقت، إلغاء التحقق بخطوتين، إنهاء الجلسات، سياسة الأمان، وقائمة مستخدمي الإدارة.
// تُستخدم في صفحة الإعدادات (قسم المستخدمين) وصفحة ملف المحامي.
import { h, mount, frag } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, dateTime, relative, count, num } from '../../lib/fmt.js';
import {
  card,
  table,
  kv,
  badge,
  statusBadge,
  button,
  asyncButton,
  alertBox,
  modal,
  formDialog,
  confirmDialog,
  confirmDanger,
  copyButton,
  toast,
  form,
  avatar,
  codeTag,
  ltr,
  emptyState,
  loading,
  errorState,
} from '../../lib/ui.js';
import { passwordProblem, attachStrength, PASSWORD_HINT } from './password.js';

const STATE_TONES = { active: 'success', invite_pending: 'info', locked: 'danger', must_change: 'warning', inactive: 'muted' };
const SEVERITY_TONES = { info: 'neutral', warning: 'warning', critical: 'danger' };
const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

export function accountStateBadge(acc) {
  const st = acc.state || (acc.active ? 'active' : 'inactive');
  return badge(label('account_state', st), STATE_TONES[st] || 'neutral', { dot: true });
}
export function severityBadge(sev) {
  return badge(label('security_severity', sev), SEVERITY_TONES[sev] || 'neutral', { icon: sev === 'critical' ? 'alert' : sev === 'warning' ? 'info' : null });
}
function inviteStatusText(inv) {
  if (!inv) return 'لم تُصدر دعوة';
  if (inv.status === 'active') return `سارية حتى ${dateTime(inv.expires_at)}`;
  if (inv.status === 'expired') return `انتهت صلاحيتها ${relative(inv.expires_at)}`;
  if (inv.status === 'revoked') return 'أُلغيت';
  return 'قُبلت';
}
function inviteTone(inv) {
  return !inv ? 'muted' : inv.status === 'active' ? 'info' : inv.status === 'expired' ? 'warning' : inv.status === 'revoked' ? 'muted' : 'success';
}

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

/** نافذة عرض رابط الدعوة أو إعادة التعيين مع النسخ والإرسال عبر واتساب */
export function showLinkDialog(link, { onClose } = {}) {
  const isInvite = link.kind === 'invite';
  const who = link.user?.display_name || link.user?.name || '';
  const urlInput = h('input.input.acc-link-input', { type: 'text', readonly: true, value: link.url, dir: 'ltr', 'aria-label': isInvite ? 'رابط الدعوة' : 'رابط إعادة التعيين', onFocus: (e) => e.target.select() });
  modal({
    title: isInvite ? `رابط دعوة ${who}` : `رابط إعادة تعيين كلمة مرور ${who}`,
    size: 'md',
    body: h(
      'div.stack',
      h(
        'p.modal-intro',
        isInvite
          ? `أرسل هذا الرابط إلى ${who} ليؤكد اسمه ويختار كلمة المرور ويفعّل حسابه. الرابط صالح للاستخدام مرة واحدة حتى ${dateTime(link.expires_at)}.`
          : `أرسل هذا الرابط إلى ${who} ليختار كلمة مرور جديدة. الرابط صالح للاستخدام مرة واحدة حتى ${dateTime(link.expires_at)}، وعند استخدامه تُنهى كل جلسات الحساب.`,
      ),
      h('div.acc-link-row', urlInput, copyButton(link.url, 'نسخ الرابط', { variant: 'secondary' })),
      h(
        'div.acc-actions-row',
        button('إرسال عبر واتساب', { variant: 'whatsapp', icon: 'whatsapp', href: link.whatsapp_url, target: '_blank' }),
        copyButton(link.message, 'نسخ نص الرسالة', { variant: 'ghost' }),
      ),
      !link.phone_known && h('p.small.muted', 'لا يوجد رقم موبايل مسجل لهذا الحساب؛ سيفتح واتساب لتختار جهة الاتصال بنفسك.'),
      h('details.acc-message-preview', h('summary', 'معاينة نص الرسالة'), h('p.pre', { dir: 'auto' }, link.message)),
      alertBox('لا يُعرض الرابط مرة أخرى بعد إغلاق هذه النافذة. يمكنك إصدار رابط جديد في أي وقت، ويُلغى الرابط السابق تلقائيًا.', 'info'),
    ),
    actions: [{ label: 'تم', variant: 'primary', icon: 'check' }],
    onClose: () => onClose && onClose(),
  });
}

/** نافذة كلمة المرور المؤقتة */
export function openTempPasswordDialog(acc, onDone) {
  return formDialog({
    title: `كلمة مرور مؤقتة لحساب ${acc.display_name || acc.name}`,
    intro: 'سيُطلب من المستخدم تغيير هذه الكلمة فور دخوله، وتُنهى جلساته الحالية. سلّمها له بطريقة آمنة (ويُفضَّل استخدام «رابط إعادة التعيين» بدلًا منها).',
    submitLabel: 'تعيين كلمة المرور المؤقتة',
    fields: [
      { name: 'password', label: 'كلمة المرور المؤقتة', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: PASSWORD_HINT },
      { name: 'confirm', label: 'تأكيد كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' },
    ],
    setup: (f) => attachStrength(f, 'password', () => acc.username),
    onSubmit: async (v) => {
      const p = passwordProblem(v.password, acc.username);
      if (p) throw fieldError('password', p);
      if (v.password !== v.confirm) throw fieldError('confirm', 'كلمتا المرور غير متطابقتين');
      return api.post(`/admin/accounts/${encodeURIComponent(acc.id)}/temp-password`, { password: v.password });
    },
  }).then((res) => {
    if (!res) return;
    toast('عُيّنت كلمة المرور المؤقتة وأُنهيت جلسات المستخدم', 'success');
    if (onDone) onDone(res);
  });
}

/**
 * أزرار إجراءات الأمان لحساب حسب حالته.
 * @param {object} acc ملخص الحساب من /admin/accounts
 * @param {{me:object, onChanged:()=>void}} opts
 */
export function accountActions(acc, { me, onChanged }) {
  const id = encodeURIComponent(acc.id);
  const self = me && me.id === acc.id;
  const changed = () => onChanged && onChanged();
  const out = [];
  if (!acc.active) return out;
  if (acc.invite_pending) {
    out.push(
      asyncButton(acc.invite && acc.invite.status === 'active' ? 'إعادة إصدار الدعوة' : 'إصدار دعوة جديدة', async () => {
        const link = await api.post(`/admin/accounts/${id}/invite`);
        showLinkDialog(link);
        changed();
      }, { variant: 'primary', size: 'sm', icon: 'send' }),
    );
    if (acc.invite && acc.invite.status === 'active') {
      out.push(
        asyncButton('إلغاء الدعوة', async () => {
          const ok = await confirmDanger({ title: 'إلغاء الدعوة', message: `سيتوقف رابط الدعوة المرسل إلى ${acc.display_name || acc.name} عن العمل فورًا. يمكنك إصدار دعوة جديدة لاحقًا.`, confirmLabel: 'إلغاء الدعوة' });
          if (!ok) return;
          await api.post(`/admin/accounts/${id}/invite/revoke`);
          toast('أُلغيت الدعوة', 'success');
          changed();
        }, { variant: 'ghost', size: 'sm', icon: 'x' }),
      );
    }
    return out;
  }
  out.push(
    asyncButton('رابط إعادة تعيين كلمة المرور', async () => {
      const ok = await confirmDialog({
        title: 'إصدار رابط إعادة تعيين',
        message: `سيُصدر رابط للاستخدام مرة واحدة يتيح لـ${acc.display_name || acc.name} اختيار كلمة مرور جديدة، ويلغي أي رابط سابق. عند استخدامه تُنهى كل جلسات الحساب.`,
        confirmLabel: 'إصدار الرابط',
      });
      if (!ok) return;
      showLinkDialog(await api.post(`/admin/accounts/${id}/reset-link`));
      changed();
    }, { variant: 'secondary', size: 'sm', icon: 'link' }),
  );
  if (acc.reset_link) {
    out.push(
      asyncButton('إلغاء رابط إعادة التعيين', async () => {
        await api.post(`/admin/accounts/${id}/reset-link/revoke`);
        toast('أُلغي رابط إعادة التعيين', 'success');
        changed();
      }, { variant: 'ghost', size: 'sm', icon: 'x' }),
    );
  }
  if (!self) out.push(button('كلمة مرور مؤقتة', { variant: 'ghost', size: 'sm', icon: 'lock', onClick: () => openTempPasswordDialog(acc, changed) }));
  if (acc.state === 'locked') {
    out.push(
      asyncButton('رفع الإيقاف المؤقت', async () => {
        await api.post(`/admin/accounts/${id}/unlock`);
        toast('رُفع الإيقاف المؤقت عن الحساب', 'success');
        changed();
      }, { variant: 'secondary', size: 'sm', icon: 'refresh' }),
    );
  }
  if (acc.two_factor_enabled && !self) {
    out.push(
      asyncButton('إلغاء التحقق بخطوتين', async () => {
        const ok = await confirmDanger({
          title: 'إلغاء التحقق بخطوتين',
          message: `استخدم هذا الإجراء فقط إذا فقد ${acc.display_name || acc.name} هاتفه ورموز الاسترداد معًا، بعد التحقق من هويته. ستُنهى جلساته ويُسجل الإجراء في سجل الأمان.`,
          confirmLabel: 'إلغاء التحقق بخطوتين',
        });
        if (!ok) return;
        await api.post(`/admin/accounts/${id}/2fa/reset`);
        toast('أُلغي التحقق بخطوتين لهذا الحساب', 'success');
        changed();
      }, { variant: 'ghost', size: 'sm', icon: 'shield' }),
    );
  }
  if (acc.sessions > 0 && !self) {
    out.push(
      asyncButton('إنهاء كل الجلسات', async () => {
        const feedNote = acc.calendar_feed && acc.calendar_feed.active ? ' ويتوقف رابط اشتراك التقويم الخاص به' : '';
        const ok = await confirmDanger({ title: 'إنهاء الجلسات', message: `سيُسجَّل خروج ${acc.display_name || acc.name} من كل الأجهزة (${count(acc.sessions, ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'])})${feedNote}.`, confirmLabel: 'إنهاء الجلسات' });
        if (!ok) return;
        const r = await api.post(`/admin/accounts/${id}/sessions/revoke`);
        toast(`${r.revoked ? `أُنهيت ${count(r.revoked, ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'])}` : 'لا توجد جلسات نشطة'}${r.calendar_feed_revoked ? ' وأُلغي رابط التقويم' : ''}`, 'success');
        changed();
      }, { variant: 'ghost', size: 'sm', icon: 'logout' }),
    );
  }
  if (acc.calendar_feed && acc.calendar_feed.active) {
    out.push(
      asyncButton('إلغاء رابط التقويم', async () => {
        const ok = await confirmDanger({
          title: 'إلغاء رابط اشتراك التقويم',
          message: `سيتوقف فورًا رابط التقويم الذي يعرض مواعيد ${acc.display_name || acc.name} في تطبيقات التقويم على أجهزته، ويستطيع إصدار رابط جديد بعد الدخول.`,
          confirmLabel: 'إلغاء الرابط',
        });
        if (!ok) return;
        await api.post(`/admin/accounts/${id}/calendar-feed/revoke`);
        toast('أُلغي رابط اشتراك التقويم', 'success');
        changed();
      }, { variant: 'ghost', size: 'sm', icon: 'calendar' }),
    );
  }
  return out;
}

/** تفاصيل أمان حساب واحد (حالة، تحقق بخطوتين، جلسات، دعوة، آخر الأحداث) */
export function accountSecurityPanel(acc, { me, onChanged, events = acc.recent_events } = {}) {
  const twoFa = acc.two_factor_enabled
    ? badge(`مفعّل — المتبقي ${count(acc.recovery_remaining, ['رمز استرداد واحد', 'رمزا استرداد', 'رموز استرداد', 'رمز استرداد'])}`, 'success', { icon: 'shieldCheck' })
    : badge('غير مفعّل', acc.role === 'admin' ? 'warning' : 'muted', { icon: 'shield' });
  const actions = accountActions(acc, { me, onChanged });
  return h(
    'div.stack.acc-panel',
    acc.state === 'locked' &&
      alertBox(
        `أُوقفت محاولات الدخول مؤقتًا حتى ${dateTime(acc.locked_until)} من ${(() => {
          const n = Array.isArray(acc.login_locks) ? acc.login_locks.length : 0;
          if (n === 2) return 'مصدرين تكررت منهما';
          if (n > 2) return `${count(n, ['مصدر واحد', 'مصدرين', 'مصادر', 'مصدرًا'])} تكررت منها`;
          return 'المصدر الذي تكررت منه';
        })()} المحاولات الفاشلة (${count(acc.failed_login_count, ['محاولة فاشلة واحدة', 'محاولتين فاشلتين', 'محاولات فاشلة', 'محاولة فاشلة'])} متتالية على الحساب). يستطيع صاحب الحساب الدخول من جهاز سبق أن دخل منه أو من شبكة أخرى.`,
        'danger',
        { title: 'محاولات دخول موقوفة مؤقتًا' },
      ),
    acc.invite_pending &&
      alertBox(
        acc.invite?.status === 'active'
          ? `لم يفعّل المستخدم حسابه بعد. الدعوة ${inviteStatusText(acc.invite)}${acc.invite.reissued ? ` (أُعيد إصدارها ${count(acc.invite.reissued, ['مرة واحدة', 'مرتين', 'مرات', 'مرة'])})` : ''}.`
          : `لم يفعّل المستخدم حسابه، والدعوة ${inviteStatusText(acc.invite)}. أصدر دعوة جديدة وأرسلها إليه.`,
        acc.invite?.status === 'active' ? 'info' : 'warning',
        { title: 'بانتظار قبول الدعوة' },
      ),
    acc.password_change_required && !acc.invite_pending && alertBox('عُيّنت لهذا الحساب كلمة مرور مؤقتة، وسيُطلب منه تغييرها فور الدخول.', 'warning'),
    kv(
      [
        ['حالة الحساب', accountStateBadge(acc)],
        ['التحقق بخطوتين', twoFa],
        ['الجلسات النشطة', acc.sessions ? count(acc.sessions, ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة']) : 'لا توجد'],
        ['آخر دخول', acc.last_login_at ? h('time', { datetime: acc.last_login_at, title: dateTime(acc.last_login_at) }, relative(acc.last_login_at)) : h('span.muted', 'لم يدخل بعد')],
        ['آخر تغيير لكلمة المرور', acc.password_changed_at ? dateTime(acc.password_changed_at) : null],
        acc.confidentiality_pledged_at ? ['التعهد بسرية بيانات المستفيدين', `أُقرّ عند التفعيل في ${dateTime(acc.confidentiality_pledged_at)}`] : null,
        acc.failed_login_count ? ['محاولات فاشلة متتالية', num(acc.failed_login_count)] : null,
        acc.calendar_feed && acc.calendar_feed.active
          ? [
              'رابط اشتراك التقويم',
              `ساري — أُصدر ${relative(acc.calendar_feed.created_at)}${acc.calendar_feed.last_used_at ? `، آخر استخدام ${relative(acc.calendar_feed.last_used_at)}` : '، لم يُستخدم بعد'}${acc.calendar_feed.hint ? ` (ينتهي بـ ⁦${acc.calendar_feed.hint}⁩)` : ''}`,
            ]
          : null,
        acc.reset_link ? ['رابط إعادة تعيين ساري', `حتى ${dateTime(acc.reset_link.expires_at)}`] : null,
      ],
      { columns: 2 },
    ),
    actions.length ? h('div.acc-actions-row', actions) : null,
    Array.isArray(events) && events.length
      ? h(
          'details.acc-events',
          h('summary', `آخر أحداث الأمان (${num(events.length)})`),
          h(
            'ul.acc-event-list',
            events.map((e) =>
              h(
                'li',
                h('span.acc-event-head', severityBadge(e.severity), h('span.acc-event-type', e.type_label), h('time.small.muted', { datetime: e.created_at, title: dateTime(e.created_at) }, relative(e.created_at))),
                h('span.small', e.summary),
              ),
            ),
          ),
          h('a.small', { href: `#/audit?user_id=${encodeURIComponent(acc.id)}` }, 'عرض كل أحداث هذا الحساب في سجل الأمان'),
        )
      : null,
  );
}

/** بطاقة «الحساب والأمان» (لملف المحامي) — لمدير النظام فقط */
export function accountSecurityCard({ userId, me }) {
  const host = h('div', loading());
  async function load() {
    try {
      const acc = await api.get(`/admin/accounts/${encodeURIComponent(userId)}`);
      mount(host, accountSecurityPanel(acc, { me, onChanged: load }));
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }
  load();
  return card({ title: 'الحساب والأمان', subtitle: 'الدخول، الدعوة، التحقق بخطوتين، والجلسات', icon: 'shield', body: host, className: 'acc-security-card' });
}

/** نافذة تفاصيل الأمان لحساب (من جدول المستخدمين) */
export function openAccountDialog(userId, { me, onChanged, name = null } = {}) {
  const host = h('div', loading());
  let changedOnce = false;
  async function load() {
    try {
      const acc = await api.get(`/admin/accounts/${encodeURIComponent(userId)}`);
      mount(host, accountSecurityPanel(acc, { me, onChanged: () => { changedOnce = true; load(); } }));
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }
  modal({ title: name ? `أمان حساب ${name}` : 'أمان الحساب', size: 'lg', body: host, actions: [{ label: 'إغلاق', variant: 'ghost' }], onClose: () => changedOnce && onChanged && onChanged() });
  load();
}

// ───────────── قسم المستخدمين في صفحة الإعدادات ─────────────

function openAddUser(onCreated) {
  formDialog({
    title: 'إضافة مستخدم للإدارة',
    intro: 'دور «إدارة النظام» يملك كل الصلاحيات بما فيها المحاسبة والإعدادات؛ ودور «إدارة الحالات» يدير الوارد والملفات والمحامين دون المحاسبة والإعدادات. يُنصح بالدعوة: يختار المستخدم كلمة مروره بنفسه عبر رابط للاستخدام مرة واحدة.',
    submitLabel: 'إضافة المستخدم',
    size: 'lg',
    fields: [
      { name: 'role', label: 'الدور', type: 'select', required: true, placeholder: false, options: [{ value: 'case_manager', label: label('user_role', 'case_manager') }, { value: 'admin', label: label('user_role', 'admin') }] },
      { name: 'name', label: 'الاسم', required: true, maxLength: 120 },
      { name: 'username', label: 'اسم المستخدم', required: true, ltr: true, minLength: 3, maxLength: 40, autocomplete: 'off', hint: 'حروف لاتينية وأرقام فقط' },
      { name: 'phone', label: 'رقم الموبايل', type: 'phone', hint: 'لإرسال رابط الدعوة عبر واتساب' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
      {
        name: 'method',
        label: 'طريقة تفعيل الحساب',
        type: 'select',
        required: true,
        placeholder: false,
        options: [
          { value: 'invite', label: 'رابط دعوة يختار به المستخدم كلمة المرور (موصى به)' },
          { value: 'password', label: 'كلمة مرور مؤقتة أسلّمها له بنفسي' },
        ],
        onChange: (val, f) => {
          const c = f.control('password');
          if (c && c.wrap) c.wrap.hidden = val !== 'password';
        },
      },
      { name: 'password', label: 'كلمة المرور المؤقتة', type: 'password', minLength: 8, autocomplete: 'new-password', hint: `${PASSWORD_HINT}. سيُطلب تغييرها عند أول دخول.` },
    ],
    values: { role: 'case_manager', method: 'invite' },
    setup: (f) => {
      const c = f.control('password');
      if (c && c.wrap) c.wrap.hidden = true;
      attachStrength(f, 'password', () => f.getValues().username);
    },
    onSubmit: async (v) => {
      if (!USERNAME_RE.test(v.username)) throw fieldError('username', 'اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط');
      const payload = { role: v.role, name: v.name, username: v.username, email: v.email || null, phone: v.phone || null };
      if (v.method === 'password') {
        const p = passwordProblem(v.password, v.username);
        if (p) throw fieldError('password', p);
        payload.password = v.password;
        payload.temporary_password = true;
      }
      return api.post('/admin/users', payload);
    },
  }).then((res) => {
    if (!res) return;
    toast(`تمت إضافة ${res.name} (${label('user_role', res.role)})`, 'success');
    if (res.invite) showLinkDialog(res.invite);
    if (onCreated) onCreated(res);
  });
}

function openEditUser(u, me, onSaved) {
  const self = u.id === me.id;
  formDialog({
    title: `تعديل حساب ${u.name}`,
    intro: self ? 'هذا حسابك: لا يمكنك إيقافه أو خفض صلاحياتك بنفسك، حتى لا تبقى المنصة بلا حساب بدور «إدارة النظام». لتغيير كلمة مرورك استخدم صفحة «حسابي والأمان».' : 'لتغيير كلمة المرور استخدم «رابط إعادة التعيين» أو «كلمة مرور مؤقتة» من نافذة أمان الحساب.',
    submitLabel: 'حفظ التعديلات',
    fields: [
      { name: 'name', label: 'الاسم', required: true, maxLength: 120 },
      {
        name: 'role',
        label: 'الدور',
        type: 'select',
        required: true,
        placeholder: false,
        disabled: self,
        options: [
          { value: 'admin', label: label('user_role', 'admin') },
          { value: 'case_manager', label: label('user_role', 'case_manager') },
        ],
      },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
      { name: 'phone', label: 'رقم الموبايل', type: 'phone' },
      {
        name: 'active',
        type: 'checkbox',
        text: self ? 'الحساب نشط (لا يمكنك إيقاف حسابك)' : 'الحساب نشط ويمكنه الدخول — أزل العلامة لإيقافه وإنهاء جلساته',
        disabled: self,
        full: true,
      },
    ],
    values: { name: u.name, role: u.role, email: u.email, phone: u.phone, active: Boolean(u.active) },
    onSubmit: async (v) => {
      const patch = { name: v.name, email: v.email || null, phone: v.phone || null };
      if (!self) {
        if (v.role !== u.role) {
          if (v.role === 'admin') {
            const ok = await confirmDialog({ title: 'منح صلاحية «إدارة النظام»', message: `سيحصل ${u.name} على كل الصلاحيات بما فيها المحاسبة والإعدادات وإدارة الحسابات وسجل الأمان. يُسجَّل هذا الإجراء ويُنبَّه بقية مديري النظام.`, confirmLabel: 'منح الصلاحية' });
            if (!ok) throw fieldError('role', 'لم يُغيَّر الدور');
          }
          patch.role = v.role;
        }
        if (v.active !== Boolean(u.active)) patch.active = v.active;
      }
      return api.patch(`/admin/users/${encodeURIComponent(u.id)}`, patch);
    },
  }).then((res) => {
    if (!res) return;
    toast('تم حفظ بيانات المستخدم', 'success');
    if (onSaved) onSaved(res);
  });
}

/** بطاقة الدعوات المعلقة (محامون وإدارة) */
export function pendingInvitesCard({ me, onChanged } = {}) {
  const host = h('div', loading());
  async function load() {
    try {
      const { items } = await api.get('/admin/accounts/invites');
      if (!items.length) {
        mount(host, emptyState('لا توجد دعوات معلقة؛ كل الحسابات المدعوة فُعّلت.', null, { compact: true, icon: 'checkCircle' }));
        return;
      }
      mount(
        host,
        table({
          caption: 'الدعوات المعلقة',
          className: 'acc-table',
          rows: items,
          columns: [
            {
              key: 'name',
              label: 'المستخدم',
              render: (x) =>
                h('div.acc-person', avatar(x.name, { size: 'sm' }), h('div', x.role === 'lawyer' ? h('a.cell-title', { href: `#/lawyers/${x.id}` }, x.display_name) : h('span.cell-title', x.display_name), h('div.cell-sub', codeTag(x.username)))),
            },
            { key: 'role', label: 'الدور', render: (x) => statusBadge('user_role', x.role, { dot: false }) },
            { key: 'invite', label: 'الدعوة', render: (x) => badge(inviteStatusText(x.invite), inviteTone(x.invite), { icon: 'clock' }) },
            { key: 'by', label: 'أصدرها', render: (x) => (x.invite?.created_by_name ? h('span', x.invite.created_by_name, h('div.cell-sub', relative(x.invite.created_at))) : null) },
            {
              key: 'actions',
              label: '',
              render: (x) => h('div.acc-actions-row', accountActions({ ...x, active: true, invite_pending: true }, { me, onChanged: () => { load(); if (onChanged) onChanged(); } })),
            },
          ],
        }),
      );
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }
  load();
  const el = card({ title: 'الدعوات المعلقة', subtitle: 'حسابات أُنشئت بدعوة ولم تُفعَّل بعد (محامون وإدارة)', icon: 'send', body: host });
  el.reload = load;
  return el;
}

/** بطاقة سياسة الأمان */
export function securityPolicyCard({ me }) {
  const host = h('div', loading());
  async function load() {
    try {
      const [p, mine] = await Promise.all([api.get('/admin/security/policy'), api.get('/account')]);
      const myTwoFa = mine.two_factor?.enabled;
      const f = form(
        [
          {
            name: 'security_require_2fa_admins',
            type: 'checkbox',
            text: 'إلزام كل حسابات «إدارة النظام» بالتحقق بخطوتين (من لم يفعّله يُطلب منه ذلك فور الدخول)',
            full: true,
            disabled: !myTwoFa && !p.security_require_2fa_admins,
          },
          { name: 'session_idle_hours', label: 'إنهاء الجلسة بعد عدم النشاط', type: 'number', required: true, min: 0.25, max: 720, suffix: 'ساعة', disabled: p.session_ttl_from_env, hint: p.session_ttl_from_env ? 'عمر الجلسة مضبوط من متغير البيئة SESSION_TTL_HOURS على الخادم' : 'يُسجَّل خروج المستخدم تلقائيًا إذا لم يستخدم المنصة طوال هذه المدة' },
          { name: 'session_max_hours', label: 'الحد الأقصى لعمر الجلسة', type: 'number', integer: true, required: true, min: 1, max: 2160, suffix: 'ساعة', disabled: p.session_ttl_from_env, hint: p.session_ttl_from_env ? 'مضبوط من متغير البيئة SESSION_TTL_HOURS على الخادم' : 'بعدها يلزم تسجيل الدخول من جديد أيًا كان النشاط' },
          // v9.1 fixes: «تذكّرني على هذا الجهاز» للمحامين قرار صريح بجانب سياسة الجلسات
          {
            name: 'lawyer_remember',
            label: '«تذكّرني على هذا الجهاز» للمحامين',
            type: 'select',
            required: true,
            placeholder: false,
            disabled: p.session_ttl_from_env,
            options: [
              { value: 'all', label: 'متاح لكل المحامين' },
              { value: 'with_2fa', label: 'لمن فعّل التحقق بخطوتين فقط' },
              { value: 'off', label: 'مطفأ (تسري مدة الجلسة أعلاه)' },
            ],
            hint: p.lawyer_remember_capped
              ? 'مطفأ لأن عمر الجلسة أو مهلة عدم النشاط أقصر من الافتراضي. اختر «متاح» لتسمح به رغم ذلك.'
              : 'جلسة «تذكّرني» أطول من مدة الجلسة أعلاه، حتى لو ضاع الهاتف. يمكن إنهاؤها من «الجلسات النشطة».',
          },
          { name: 'lawyer_remember_days', label: 'مدة «تذكّرني» بلا تحقق بخطوتين', type: 'number', integer: true, required: true, min: 1, max: 30, suffix: 'يوم', disabled: p.session_ttl_from_env },
          { name: 'lawyer_remember_days_2fa', label: 'مدة «تذكّرني» مع التحقق بخطوتين', type: 'number', integer: true, required: true, min: 1, max: 90, suffix: 'يوم', disabled: p.session_ttl_from_env },
          { name: 'invite_valid_hours', label: 'صلاحية رابط الدعوة', type: 'number', integer: true, required: true, min: 1, max: 336, suffix: 'ساعة' },
          { name: 'reset_valid_hours', label: 'صلاحية رابط إعادة التعيين', type: 'number', integer: true, required: true, min: 1, max: 168, suffix: 'ساعة' },
          { name: 'security_audit_retention_days', label: 'مدة الاحتفاظ بأحداث سجل الأمان', type: 'number', integer: true, required: true, min: 30, max: 3650, suffix: 'يوم', hint: 'التحذيرات والأحداث الحرجة تُحفظ ضعف هذه المدة' },
        ],
        {
          values: p,
          submitLabel: 'حفظ سياسة الأمان',
          submitIcon: 'shieldCheck',
          onSubmit: async (v) => {
            const payload = { ...v };
            if (p.session_ttl_from_env) {
              delete payload.session_max_hours;
              delete payload.session_idle_hours;
              delete payload.lawyer_remember;
              delete payload.lawyer_remember_days;
              delete payload.lawyer_remember_days_2fa;
            }
            const saved = await api.patch('/admin/security/policy', payload);
            f.setValues(saved);
            toast('حُفظت سياسة الأمان', 'success');
          },
        },
      );
      mount(
        host,
        !myTwoFa && alertBox(h('span', 'لتفعيل إلزام مديري النظام بالتحقق بخطوتين فعّله لحسابك أولًا من ', h('a', { href: '#/account' }, 'صفحة حسابي والأمان'), '.'), 'info'),
        f.el,
      );
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }
  load();
  return card({ title: 'سياسة الأمان', subtitle: 'الجلسات، التحقق بخطوتين، وصلاحية روابط الدعوة وإعادة التعيين', icon: 'shieldCheck', body: host });
}

/**
 * قسم «المستخدمون» الكامل لصفحة الإعدادات: بطاقة المستخدمين + الدعوات المعلقة + سياسة الأمان.
 * @param {{me:object}} opts
 */
export function usersAdminSection({ me }) {
  const usersHost = h('div', loading());
  const summaryHost = h('div.acc-summary-row');
  let invitesCard = null;

  async function reload() {
    try {
      const { items, counts } = await api.get('/admin/accounts', { role: 'staff' });
      mount(
        summaryHost,
        badge(`${count(counts.total, ['مستخدم واحد', 'مستخدمان', 'مستخدمين', 'مستخدمًا'])}`, 'neutral', { icon: 'users' }),
        counts.invite_pending ? badge(`بانتظار قبول الدعوة: ${num(counts.invite_pending)}`, 'info') : null,
        counts.locked ? badge(`موقوف مؤقتًا: ${num(counts.locked)}`, 'danger') : null,
        counts.without_2fa_admins ? badge(`مديرو نظام بدون تحقق بخطوتين: ${num(counts.without_2fa_admins)}`, 'warning', { icon: 'shield' }) : null,
      );
      mount(
        usersHost,
        table({
          className: 'acc-table',
          caption: 'مستخدمو الإدارة',
          rows: items,
          empty: 'لا يوجد مستخدمون',
          rowClass: (u) => !u.active && 'is-muted',
          columns: [
            {
              key: 'name',
              label: 'الاسم',
              render: (u) => h('div.acc-person', avatar(u.name, { size: 'sm' }), h('div', h('span.cell-title', u.name), h('div.cell-sub', codeTag(u.username), u.id === me.id ? badge('أنت', 'primary') : null))),
            },
            { key: 'role', label: 'الدور', render: (u) => statusBadge('user_role', u.role, { dot: false }) },
            { key: 'state', label: 'الحالة', render: (u) => accountStateBadge(u) },
            {
              key: 'twofa',
              label: 'التحقق بخطوتين',
              render: (u) => (u.invite_pending ? h('span.muted', '—') : u.two_factor_enabled ? badge('مفعّل', 'success', { icon: 'shieldCheck' }) : badge('غير مفعّل', u.role === 'admin' ? 'warning' : 'muted')),
            },
            {
              key: 'contact',
              label: 'التواصل',
              render: (u) => (u.email || u.phone ? h('div.acc-cell-stack', u.email ? ltr(u.email) : null, u.phone ? ltr(u.phone) : null) : null),
            },
            {
              key: 'last_login',
              label: 'آخر دخول',
              render: (u) => (u.last_login_at ? h('time.nowrap', { datetime: u.last_login_at, title: dateTime(u.last_login_at) }, relative(u.last_login_at)) : h('span.muted', 'لم يدخل بعد')),
            },
            {
              key: 'actions',
              label: '',
              render: (u) =>
                h(
                  'div.acc-actions-row',
                  button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openEditUser(u, me, reload) }),
                  button('الأمان', { size: 'sm', variant: 'ghost', icon: 'shield', ariaLabel: `أمان حساب ${u.name}`, onClick: () => openAccountDialog(u.id, { me, onChanged: reload, name: u.name }) }),
                ),
            },
          ],
        }),
      );
      if (invitesCard) invitesCard.reload();
    } catch (err) {
      mount(usersHost, errorState(err, reload));
    }
  }

  const usersCard = card({
    title: 'المستخدمون',
    subtitle: 'حسابات فريق الإدارة (إدارة النظام وإدارة الحالات) وحالة أمانها',
    icon: 'users',
    actions: button('إضافة مستخدم', { variant: 'primary', size: 'sm', icon: 'userPlus', onClick: () => openAddUser(reload) }),
    body: h(
      'div.stack',
      summaryHost,
      usersHost,
      h('p.acc-footnote', 'حسابات المحامين تُدار من ', h('a', { href: '#/lawyers' }, 'شبكة المحامين'), ' مع تخصصاتهم واتفاقاتهم المالية، وتظهر دعواتهم المعلقة أدناه. كل إجراءات الحسابات تُسجَّل في ', h('a', { href: '#/audit' }, 'سجل الأمان'), '.'),
    ),
  });
  invitesCard = pendingInvitesCard({ me, onChanged: reload });
  reload();
  return frag(usersCard, invitesCard, securityPolicyCard({ me }));
}

