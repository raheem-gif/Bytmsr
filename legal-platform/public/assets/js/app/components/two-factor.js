// معالج تفعيل التحقق بخطوتين (TOTP): كلمة المرور ← رمز QR والمفتاح ← رمز التأكيد ← رموز الاسترداد.
// يُستخدم في صفحة «حسابي والأمان» وفي شاشة الإلزام بعد الدخول لحسابات «إدارة النظام».
import { h, mount, frag } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { dateTime, getMeta } from '../../lib/fmt.js';
import { form, button, asyncButton, alertBox, copyButton, icon, toast } from '../../lib/ui.js';
import { qrSvg } from './qr.js';

const APPS = 'Google Authenticator أو Microsoft Authenticator أو أي تطبيق مصادقة يدعم TOTP';

// v10 b2b-portal (L-16، L-42): نصوص المعالج قابلة للاستبدال (بوابة الشركات تمرر صيغة الجمع من company/words.js)،
// والافتراضي هو نص منصة الفريق كما كان. {apps} و{when} متغيرات.
export const TWO_FACTOR_COPY = Object.freeze({
  apps: APPS,
  steps: ['تأكيد الهوية', 'ربط تطبيق المصادقة', 'رموز الاسترداد'],
  steps_label: 'خطوات التفعيل',
  lead: 'ستحتاج إلى هاتف عليه {apps}. بعد التفعيل يُطلب منك عند كل دخول رمز من ستة أرقام يتغير كل 30 ثانية.',
  password: 'كلمة المرور الحالية',
  password_hint: 'للتأكد من أنك صاحب الحساب قبل تغيير إعدادات الأمان',
  next: 'متابعة',
  start: 'ابدأ الإعداد',
  cancel: 'إلغاء',
  code: 'رمز التحقق من التطبيق',
  code_hint: 'الرقم المكوّن من ستة أرقام الظاهر حاليًا في التطبيق',
  enable: 'تفعيل التحقق بخطوتين',
  phone_title: 'أضف حسابك إلى تطبيق المصادقة',
  open_app: 'افتح تطبيق المصادقة',
  copy_key: 'انسخ المفتاح',
  no_app: 'لا يوجد تطبيق؟ ثبّت Google Authenticator أو Microsoft Authenticator ثم عد إلى هنا.',
  other_device: 'لديك جهاز آخر؟ امسح الرمز',
  howto: ['افتح {apps} على هاتفك.', 'اختر «إضافة حساب» ثم «مسح رمز QR» ووجّه الكاميرا إلى الرمز.', 'أدخل الرمز المكوّن من ستة أرقام الذي يظهر في التطبيق.'],
  manual: 'لا يمكنك مسح الرمز؟ أدخل المفتاح يدويًا',
  finish_before: 'يجب إكمال الإعداد قبل {when}.',
  qr_failed: 'تعذر رسم رمز QR؛ استخدم إدخال المفتاح يدويًا.',
  enabled_title: 'تم التفعيل',
  enabled: 'أصبح حسابك محميًا بالتحقق بخطوتين.',
  codes_title: 'رموز الاسترداد',
  codes_warning: 'احفظ هذه الرموز في مكان آمن خارج الهاتف (ورقة مطبوعة أو مدير كلمات مرور). لن تظهر مرة أخرى، وكل رمز يصلح للدخول مرة واحدة إذا فقدت هاتفك.',
  codes_copy: 'نسخ الرموز',
  codes_copy_phone: 'نسخ الكل',
  codes_download: 'تنزيل كملف نصي',
  codes_download_phone: 'تنزيل ملف نصي',
  codes_saved: 'حفظت رموز الاسترداد في مكان آمن',
  codes_done: 'حفظت الرموز — إنهاء',
  codes_file_title: 'رموز استرداد حساب {account} — منصة {brand} القانونية',
});
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

/** v9.1 l-home (L-11): الإعداد يجري على الهاتف نفسه (لمس وشاشة أضيق من 768px) */
export function isPhoneSetup() {
  try {
    return !!window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 768;
  } catch {
    return false;
  }
}

/** تنزيل نص كملف (رموز الاسترداد) */
export function downloadText(filename, text) {
  const blob = new Blob([`﻿${text}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

/**
 * لوحة رموز الاسترداد (تُعرض مرة واحدة فقط) مع النسخ والتنزيل وتأكيد الحفظ.
 * @param {string[]} codes
 * @param {{username?:string, onDone?:()=>void, doneLabel?:string}} opts
 */
export function recoveryCodesPanel(codes, { username = '', onDone, doneLabel, copy = {} } = {}) {
  const c = { ...TWO_FACTOR_COPY, ...(copy || {}) };
  // CO-14: اسم المكتب أولًا (meta.brand)، ثم اسم المؤسسة
  const org = getMeta()?.brand?.name || getMeta()?.settings?.org_name || 'بيوت مصر';
  const text = [
    fill(c.codes_file_title, { account: username, brand: org }),
    `أُصدرت: ${dateTime(new Date().toISOString())}`,
    'كل رمز يُستخدم مرة واحدة فقط بدل رمز تطبيق المصادقة عند فقدان الهاتف.',
    '',
    ...codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`),
  ].join('\n');
  const confirm = h('input', { type: 'checkbox', id: 'acc-rc-confirm' });
  const doneBtn = button(doneLabel || c.codes_done, { variant: 'primary', icon: 'check', disabled: true, onClick: () => onDone && onDone() });
  confirm.addEventListener('change', () => (doneBtn.disabled = !confirm.checked));
  return h(
    'div.acc-recovery',
    alertBox(c.codes_warning, 'warning', { title: c.codes_title }),
    h('ol.acc-codes', { dir: 'ltr', 'aria-label': 'رموز الاسترداد' }, codes.map((c) => h('li', h('code', c)))),
    h(
      'div.acc-actions-row',
      copyButton(codes.join('\n'), isPhoneSetup() ? c.codes_copy_phone : c.codes_copy, { variant: 'secondary' }),
      button(isPhoneSetup() ? c.codes_download_phone : c.codes_download, { variant: 'secondary', size: 'sm', icon: 'download', onClick: () => downloadText(`recovery-codes-${username || 'account'}.txt`, text) }),
    ),
    onDone && h('label.check.check-single.acc-confirm', { htmlFor: 'acc-rc-confirm' }, confirm, h('span', c.codes_saved)),
    onDone && h('div.acc-actions-row', doneBtn),
  );
}

/**
 * معالج التفعيل.
 * v10 b2b-portal: base = بادئة مسارات الحساب ('/account' لمنصة الفريق، '/company/me' لبوابة الشركات)، copy = نصوص بديلة.
 * @param {{username:string, askPassword?:boolean, onEnabled:(result:object)=>void, onCancel?:()=>void, base?:string, copy?:object}} opts
 */
export function twoFactorWizard({ username, askPassword = true, onEnabled, onCancel, base = '/account', copy = {} }) {
  const c = { ...TWO_FACTOR_COPY, ...(copy || {}) };
  const apps = c.apps;
  const root = h('div.acc-2fa-wizard');
  const steps = h('ol.acc-steps', { 'aria-label': c.steps_label });
  const body = h('div.acc-wizard-body');
  const STEP_LABELS = c.steps;
  function setStep(n) {
    mount(
      steps,
      STEP_LABELS.map((l, i) => h('li', { class: [i === n && 'is-current', i < n && 'is-done'], 'aria-current': i === n ? 'step' : null }, h('span.acc-step-num', i < n ? icon('check', { size: 14 }) : String(i + 1)), h('span', l))),
    );
  }
  mount(root, steps, body);

  async function start(password) {
    const setup = await api.post(`${base}/2fa/setup`, password ? { password } : {});
    showScan(setup);
  }

  function showPassword() {
    setStep(0);
    const f = form([{ name: 'password', label: c.password, type: 'password', required: true, autocomplete: 'current-password', hint: c.password_hint }], {
      columns: 1,
      submitLabel: c.next,
      cancelLabel: c.cancel,
      submitIcon: 'arrowLeft',
      cancel: onCancel,
      onSubmit: async (v) => start(v.password),
    });
    mount(body, h('p.acc-lead', fill(c.lead, { apps })), f.el);
  }

  function showScan(setup) {
    setStep(1);
    const codeForm = form(
      [
        {
          name: 'code',
          label: c.code,
          required: true,
          ltr: true,
          autocomplete: 'one-time-code',
          placeholder: '123456',
          maxLength: 7,
          hint: c.code_hint,
        },
      ],
      {
        columns: 1,
        submitLabel: c.enable,
        cancelLabel: c.cancel,
        submitIcon: 'shieldCheck',
        cancel: onCancel,
        onSubmit: async (v) => {
          const res = await api.post(`${base}/2fa/enable`, { code: String(v.code).replace(/\s/g, '') });
          showCodes(res);
        },
      },
    );
    const codeInput = codeForm.control('code')?.input;
    if (codeInput) {
      codeInput.setAttribute('inputmode', 'numeric');
      codeInput.classList.add('acc-otp-input');
    }
    let qr;
    try {
      qr = qrSvg(setup.otpauth_uri, { size: 196, label: 'رمز QR لإضافة الحساب إلى تطبيق المصادقة' });
    } catch {
      qr = alertBox(c.qr_failed, 'warning');
    }
    // v9.1 l-home (L-11): على الهاتف نفسه لا يمكن مسح رمز معروض عليه — فتح التطبيق مباشرة أو نسخ المفتاح أولًا،
    // والرمز تحت «لديك جهاز آخر؟». الحاسوب بلا تغيير (الرمز أولًا).
    if (isPhoneSetup()) {
      const groups = String(setup.secret || '').replace(/\s+/g, '').match(/.{1,4}/g) || setup.secret_groups || [];
      mount(
        body,
        h(
          'div.lh-2fa-phone',
          h('h3.acc-lead', c.phone_title),
          button(c.open_app, { variant: 'primary', icon: 'externalLink', href: setup.otpauth_uri, block: true }),
          h('div.lh-2fa-key', { dir: 'ltr', translate: 'no', 'aria-label': 'المفتاح السري' }, groups.join(' ')),
          copyButton(setup.secret, c.copy_key, { variant: 'secondary', size: 'md' }),
          h('p.lh-2fa-tip', c.no_app),
          h('details.lh-2fa-other', h('summary', c.other_device), h('div.acc-qr', qr)),
          h('p.small.muted', fill(c.finish_before, { when: dateTime(setup.expires_at) })),
        ),
        codeForm.el,
      );
      return;
    }
    mount(
      body,
      h(
        'div.acc-scan',
        h('div.acc-qr', qr),
        h(
          'div.acc-scan-text',
          h('ol.acc-howto', c.howto.map((x) => h('li', fill(x, { apps })))),
          h(
            'details.acc-manual',
            h('summary', c.manual),
            h('p.small.muted', `اسم الحساب: ${setup.issuer} (${setup.account}) — النوع: حسب الوقت`),
            h('div.acc-secret', { dir: 'ltr', translate: 'no', 'aria-label': 'المفتاح السري' }, setup.secret_groups.map((g) => h('span', g))),
            h('div.acc-actions-row', copyButton(setup.secret, 'نسخ المفتاح', { variant: 'secondary' }), button('فتح في تطبيق المصادقة', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: setup.otpauth_uri })),
          ),
          h('p.small.muted', fill(c.finish_before, { when: dateTime(setup.expires_at) })),
        ),
      ),
      codeForm.el,
    );
    requestAnimationFrame(() => codeInput && codeInput.focus());
  }

  function showCodes(res) {
    setStep(2);
    mount(
      body,
      alertBox(c.enabled, 'success', { title: c.enabled_title }),
      recoveryCodesPanel(res.recovery_codes, { username, copy, onDone: () => onEnabled && onEnabled(res) }),
    );
  }

  if (askPassword) showPassword();
  else {
    setStep(0);
    mount(
      body,
      h('p.acc-lead', fill(c.lead, { apps })),
      h(
        'div.acc-actions-row',
        asyncButton(c.start, () => start(null).catch((err) => {
          // الجلسة ليست حديثة بما يكفي: نطلب كلمة المرور
          if (err && err.status === 400) {
            showPassword();
            return;
          }
          throw err;
        }), { variant: 'primary', icon: 'shieldCheck' }),
        onCancel && button(c.cancel, { variant: 'ghost', onClick: onCancel }),
      ),
    );
  }
  return root;
}

/** صف تعليمات قصيرة (يُعاد استخدامه في الصفحات) */
export function twoFactorExplainer() {
  return frag(
    h('p.acc-lead', 'التحقق بخطوتين يحمي حسابك حتى لو عرف أحد كلمة مرورك: عند الدخول يُطلب رمز مؤقت من تطبيق على هاتفك.'),
  );
}

export function notifyCopied() {
  toast('تم النسخ إلى الحافظة', 'success', 2000);
}
