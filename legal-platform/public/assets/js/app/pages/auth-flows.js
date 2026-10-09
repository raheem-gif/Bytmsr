// شاشات الدخول الإضافية خارج هيكل التطبيق (وحدة accounts):
//  - تفعيل الحساب من رابط الدعوة، وتعيين كلمة مرور جديدة من رابط إعادة التعيين.
//  - الخطوة الثانية للدخول (رمز تطبيق المصادقة أو رمز استرداد).
//  - شاشات الإلزام بعد الدخول: تغيير كلمة المرور المؤقتة، وتفعيل التحقق بخطوتين لحسابات «إدارة النظام».
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, dateTime, count, staffChrome } from '../../lib/fmt.js';
import { form, button, alertBox, loading, brandMark, icon, toast, errorMessage, copyButton, wordmark, brandEl } from '../../lib/ui.js';
import { attachStrength, passwordProblem, PASSWORD_HINT } from '../components/password.js';
import { twoFactorWizard } from '../components/two-factor.js';

/** v9.1 l-home (L-10): رسالة التعهد الناقص كما في المواصفة (بدل «يجب الموافقة للمتابعة» العامة) */
export const PLEDGE_REQUIRED = 'يلزم الإقرار بسرية بيانات المستفيدين لتفعيل الحساب.';

function orgOf(meta) {
  // v10 experience (L-03): عناوين التبويب باسم المكتب المختصر حين يظهر في منصة الفريق، وإلا اسم المؤسسة كما في 9.2
  const c = staffChrome();
  return c.on ? c.short : (meta && meta.settings && meta.settings.org_name) || 'بيوت مصر';
}

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

/** إطار موحد للشاشات: شعار المؤسسة ثم بطاقة في المنتصف */
function screen(meta, { wide = false } = {}, ...children) {
  const cardEl = h('main.auth-card', { class: wide && 'auth-card-wide', tabindex: '-1' }, children);
  return h(
    'div.auth-screen',
    staffChrome().on
      ? h('header.auth-brand', brandMark({ size: 22 }), h('span.auth-brand-text', wordmark({ size: 'md', tone: 'light', name: staffChrome().name, short: staffChrome().short }), h('span', 'منصة الدعم القانوني')))
      : h('header.auth-brand', brandMark({ size: 22 }), h('span.auth-brand-text', h('strong', orgOf(meta)), h('span', 'منصة الدعم القانوني'))),
    cardEl,
    staffChrome().on ? h('a.auth-back', { href: '/' }, 'العودة إلى موقع ', brandEl()) : h('a.auth-back', { href: '/' }, `العودة إلى موقع ${orgOf(meta)}`),
  );
}

function heading(iconName, title, sub) {
  return h('div.auth-head', h('span.auth-head-icon', icon(iconName, { size: 22 })), h('h1', title), sub && h('p.auth-sub', sub));
}

/**
 * رابط الدعوة أو إعادة التعيين.
 * @param {{kind:'invite'|'reset', token:string, meta:object, onLoggedIn:(user:object)=>void, onGoLogin:(opts?:object)=>void}} opts
 */
export function renderLinkFlow({ kind, token, meta, onLoggedIn, onGoLogin }) {
  const host = h('div', loading('جارٍ التحقق من الرابط…'));
  const root = screen(meta, {}, host);
  document.title = kind === 'invite' ? `تفعيل الحساب — ${orgOf(meta)}` : `تعيين كلمة مرور جديدة — ${orgOf(meta)}`;

  function failed(err) {
    mount(
      host,
      heading('alert', kind === 'invite' ? 'تعذر تفعيل الحساب' : 'تعذر استخدام رابط إعادة التعيين'),
      alertBox(errorMessage(err), 'danger'),
      h('p.auth-sub', `يمكنك التواصل مع إدارة ${orgOf(meta)} لإرسال رابط جديد.`),
      h('div.auth-actions', button('الذهاب إلى تسجيل الدخول', { variant: 'primary', icon: 'arrowLeft', onClick: () => onGoLogin() })),
    );
  }

  (async () => {
    let info;
    try {
      info = await api.post('/auth/link', { token });
      if (info.kind !== kind) throw new Error('الرابط غير صالح. تأكد من نسخه كاملًا، أو اطلب رابطًا جديدًا من الإدارة.');
    } catch (err) {
      failed(err);
      return;
    }
    const u = info.user;
    const isInvite = kind === 'invite';
    // v9.1 l-home (L-10): شاشة التفعيل في أقل من 60 كلمة — حقلان للكتابة ولمستان (التعهد ثم الزر)
    const fields = [
      isInvite && { name: 'name', label: 'الاسم الكامل', required: true, minLength: 3, maxLength: 120, autocomplete: 'name' },
      {
        name: 'username',
        label: isInvite ? 'اسم الدخول' : 'اسم المستخدم للدخول',
        type: 'static',
        value: u.username,
        render: (x) => h('span.lh-copy-row', h('bdi.ltr.mono', { dir: 'ltr' }, x), copyButton(x, '', { size: 'sm', variant: 'ghost' })),
      },
      { name: 'password', label: isInvite ? 'كلمة المرور' : 'كلمة المرور الجديدة', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: isInvite ? '8 أحرف على الأقل، حروف وأرقام' : PASSWORD_HINT },
      { name: 'password_confirm', label: 'تأكيد كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' },
      isInvite && {
        name: 'pledge',
        type: 'checkbox',
        required: true,
        text: 'أتعهد بالحفاظ على سرية بيانات المستفيدين وعدم استخدامها خارج عمل المؤسسة.',
        requiredMessage: PLEDGE_REQUIRED,
        checkClass: 'lh-pledge',
        full: true,
      },
    ].filter(Boolean);
    const f = form(fields, {
      columns: 1,
      values: isInvite ? { name: u.name } : {},
      submitLabel: isInvite ? 'تفعيل والدخول' : 'حفظ كلمة المرور الجديدة',
      submitIcon: isInvite ? 'checkCircle' : 'lock',
      onSubmit: async (v) => {
        const p = passwordProblem(v.password, u.username);
        if (p) throw fieldError('password', p);
        if (v.password !== v.password_confirm) throw fieldError('password_confirm', 'كلمتا المرور غير متطابقتين');
        if (isInvite) {
          if (!v.pledge) throw fieldError('pledge', PLEDGE_REQUIRED);
          // v9.1 l-home: على الهاتف يبقى الدخول على هذا الجهاز (تذكّرني) كما في شاشة الدخول؛ ولا تنبيه منبثق بعد التفعيل
          const remember = !!window.matchMedia?.('(pointer: coarse)').matches;
          const res = await api.post('/auth/invite/accept', { token, name: v.name, password: v.password, password_confirm: v.password_confirm, pledge: true, remember });
          onLoggedIn(res.user);
        } else {
          const res = await api.post('/auth/reset', { token, password: v.password, password_confirm: v.password_confirm });
          mount(
            host,
            heading('checkCircle', 'تم تعيين كلمة المرور الجديدة', 'أُنهيت كل الجلسات السابقة على حسابك. سجّل الدخول الآن بكلمة المرور الجديدة.'),
            res.two_factor_enabled ? alertBox('التحقق بخطوتين ما زال مفعّلًا لحسابك؛ جهّز تطبيق المصادقة أو أحد رموز الاسترداد.', 'info') : null,
            h('div.auth-actions', button('تسجيل الدخول', { variant: 'primary', icon: 'arrowLeft', onClick: () => onGoLogin({ username: res.username }) })),
          );
        }
      },
    });
    f.el.querySelector('button[type=submit]')?.classList.add('btn-block', 'btn-lg');
    attachStrength(f, 'password', () => u.username);
    mount(
      host,
      isInvite
        ? heading('userPlus', 'تفعيل حسابك', `مرحبًا ${u.display_name}، اختر كلمة مرور لتبدأ.`)
        : heading('lock', 'تعيين كلمة مرور جديدة', `مرحبًا ${u.display_name}، اختر كلمة مرور جديدة لحسابك.`),
      h('p.auth-expiry', icon('clock', { size: 15 }), isInvite ? `الرابط صالح حتى ${dateTime(info.expires_at)}` : `الرابط صالح للاستخدام مرة واحدة حتى ${dateTime(info.expires_at)}`),
      f.el,
    );
  })();
  return root;
}

/**
 * الخطوة الثانية للدخول.
 * @param {{meta:object, challenge:string, expiresAt?:string, maxAttempts?:number, onSuccess:(user:object)=>void, onCancel:(opts?:object)=>void}} opts
 */
export function renderTwoFactorStep({ meta, challenge, expiresAt, onSuccess, onCancel, remember = false }) {
  const host = h('div');
  const root = screen(meta, {}, host);
  document.title = `رمز التحقق — ${orgOf(meta)}`;
  let mode = 'totp';

  function draw() {
    const isTotp = mode === 'totp';
    const f = form(
      [
        isTotp
          ? { name: 'code', label: 'رمز التحقق', required: true, ltr: true, autocomplete: 'one-time-code', placeholder: '123456', maxLength: 7, hint: 'الرمز المكوّن من ستة أرقام الظاهر الآن في تطبيق المصادقة' }
          : { name: 'code', label: 'رمز الاسترداد', required: true, ltr: true, autocomplete: 'off', placeholder: 'xxxxx-xxxxx', maxLength: 20, hint: 'أحد رموز الاسترداد العشرة التي حفظتها عند تفعيل التحقق بخطوتين (يُستخدم مرة واحدة)' },
      ],
      {
        columns: 1,
        submitLabel: 'تحقق ودخول',
        submitIcon: 'shieldCheck',
        onSubmit: async (v) => {
          const code = String(v.code).trim();
          try {
            // v9.1 l-home (L-17): اختيار «تذكّرني» من الخطوة الأولى يُطبَّق عند إنشاء الجلسة هنا
            const res = await api.post('/auth/login/2fa', isTotp ? { challenge, code: code.replace(/\s/g, ''), remember: !!remember } : { challenge, recovery_code: code, remember: !!remember });
            if (res.recovery_codes_remaining !== undefined) {
              toast(
                res.recovery_codes_remaining <= 3
                  ? `دخلت برمز استرداد. تبقّى لك ${count(res.recovery_codes_remaining, ['رمز واحد', 'رمزان', 'رموز', 'رمزًا'])} فقط؛ أصدر رموزًا جديدة من «حسابي والأمان».`
                  : 'دخلت برمز استرداد، ولن يصلح هذا الرمز مرة أخرى.',
                'warning',
                8000,
              );
            }
            onSuccess(res.user);
          } catch (err) {
            if (err && (err.code === 'challenge_expired' || err.status === 429)) {
              onCancel({ message: errorMessage(err) });
              return;
            }
            const left = err?.details?.attempts_left;
            throw Object.assign(new Error(left !== undefined ? `${errorMessage(err)} (المحاولات المتبقية: ${left})` : errorMessage(err)), { details: { fields: { code: errorMessage(err) } } });
          }
        },
      },
    );
    f.el.querySelector('button[type=submit]')?.classList.add('btn-block', 'btn-lg');
    const input = f.control('code')?.input;
    if (input) {
      if (isTotp) input.setAttribute('inputmode', 'numeric');
      input.classList.add('acc-otp-input');
    }
    mount(
      host,
      heading('shieldCheck', 'التحقق بخطوتين', isTotp ? 'افتح تطبيق المصادقة على هاتفك وأدخل الرمز الحالي لحسابك.' : 'أدخل أحد رموز الاسترداد المحفوظة لديك.'),
      expiresAt && h('p.auth-expiry', icon('clock', { size: 15 }), `أكمل هذه الخطوة قبل ${dateTime(expiresAt)}`),
      f.el,
      h(
        'div.auth-links',
        button(isTotp ? 'فقدت هاتفي — استخدام رمز استرداد' : 'استخدام رمز تطبيق المصادقة', { variant: 'link', size: 'sm', onClick: () => { mode = isTotp ? 'recovery' : 'totp'; draw(); } }),
        button('العودة إلى تسجيل الدخول', { variant: 'link', size: 'sm', onClick: () => onCancel() }),
      ),
      !isTotp && h('p.small.muted', 'إن فقدت الهاتف ورموز الاسترداد معًا فتواصل مع الإدارة لإلغاء التحقق بخطوتين بعد التحقق من هويتك.'),
    );
    requestAnimationFrame(() => input && input.focus());
  }
  draw();
  return root;
}

/**
 * شاشات الإلزام بعد الدخول (تُعرض بدل التطبيق حتى تُستوفى).
 * @param {{user:object, meta:object, onDone:(user:object)=>void, onLogout:()=>void}} opts
 */
export function renderRestricted({ user, meta, onDone, onLogout }) {
  const host = h('div');
  const root = screen(meta, { wide: user.restricted === 'two_factor_enrollment' }, host);
  const logout = h('div.auth-links', button('تسجيل الخروج', { variant: 'link', size: 'sm', icon: 'logout', onClick: onLogout }));

  if (user.restricted === 'password_change') {
    document.title = `تغيير كلمة المرور — ${orgOf(meta)}`;
    const f = form(
      [
        { name: 'current_password', label: 'كلمة المرور المؤقتة الحالية', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'new_password', label: 'كلمة المرور الجديدة', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: PASSWORD_HINT },
        { name: 'new_password_confirm', label: 'تأكيد كلمة المرور الجديدة', type: 'password', required: true, autocomplete: 'new-password' },
      ],
      {
        columns: 1,
        submitLabel: 'حفظ ومتابعة',
        submitIcon: 'lock',
        onSubmit: async (v) => {
          const p = passwordProblem(v.new_password, user.username);
          if (p) throw fieldError('new_password', p);
          if (v.new_password !== v.new_password_confirm) throw fieldError('new_password_confirm', 'كلمتا المرور غير متطابقتين');
          const res = await api.post('/account/password', v);
          toast('حُفظت كلمة المرور الجديدة', 'success');
          onDone(res.user);
        },
      },
    );
    f.el.querySelector('button[type=submit]')?.classList.add('btn-block', 'btn-lg');
    attachStrength(f, 'new_password', () => user.username);
    mount(host, heading('lock', 'غيّر كلمة المرور المؤقتة', `مرحبًا ${user.name}، دخلت بكلمة مرور مؤقتة عيّنتها الإدارة. اختر كلمة مرور خاصة بك قبل المتابعة.`), f.el, logout);
    return root;
  }

  document.title = `تفعيل التحقق بخطوتين — ${orgOf(meta)}`;
  mount(
    host,
    heading('shieldCheck', 'فعّل التحقق بخطوتين للمتابعة', `سياسة ${orgOf(meta)} تلزم حسابات «${label('user_role', 'admin')}» بالتحقق بخطوتين لحماية بيانات المستفيدين. يستغرق الإعداد دقيقتين.`),
    twoFactorWizard({
      username: user.username,
      askPassword: false,
      onEnabled: (res) => onDone(res.user),
    }),
    logout,
  );
  return root;
}
