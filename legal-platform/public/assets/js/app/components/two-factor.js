// معالج تفعيل التحقق بخطوتين (TOTP): كلمة المرور ← رمز QR والمفتاح ← رمز التأكيد ← رموز الاسترداد.
// يُستخدم في صفحة «حسابي والأمان» وفي شاشة الإلزام بعد الدخول لحسابات «إدارة النظام».
import { h, mount, frag } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { dateTime, getMeta } from '../../lib/fmt.js';
import { form, button, asyncButton, alertBox, copyButton, icon, toast } from '../../lib/ui.js';
import { qrSvg } from './qr.js';

const APPS = 'Google Authenticator أو Microsoft Authenticator أو أي تطبيق مصادقة يدعم TOTP';

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
export function recoveryCodesPanel(codes, { username = '', onDone, doneLabel = 'حفظت الرموز — إنهاء' } = {}) {
  const org = getMeta()?.settings?.org_name || 'بيوت مصر';
  const text = [
    `رموز استرداد حساب ${username} — منصة ${org} القانونية`,
    `أُصدرت: ${dateTime(new Date().toISOString())}`,
    'كل رمز يُستخدم مرة واحدة فقط بدل رمز تطبيق المصادقة عند فقدان الهاتف.',
    '',
    ...codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`),
  ].join('\n');
  const confirm = h('input', { type: 'checkbox', id: 'acc-rc-confirm' });
  const doneBtn = button(doneLabel, { variant: 'primary', icon: 'check', disabled: true, onClick: () => onDone && onDone() });
  confirm.addEventListener('change', () => (doneBtn.disabled = !confirm.checked));
  return h(
    'div.acc-recovery',
    alertBox('احفظ هذه الرموز في مكان آمن خارج الهاتف (ورقة مطبوعة أو مدير كلمات مرور). لن تظهر مرة أخرى، وكل رمز يصلح للدخول مرة واحدة إذا فقدت هاتفك.', 'warning', { title: 'رموز الاسترداد' }),
    h('ol.acc-codes', { dir: 'ltr', 'aria-label': 'رموز الاسترداد' }, codes.map((c) => h('li', h('code', c)))),
    h(
      'div.acc-actions-row',
      copyButton(codes.join('\n'), 'نسخ الرموز', { variant: 'secondary' }),
      button('تنزيل كملف نصي', { variant: 'secondary', size: 'sm', icon: 'download', onClick: () => downloadText(`recovery-codes-${username || 'account'}.txt`, text) }),
    ),
    onDone && h('label.check.check-single.acc-confirm', { htmlFor: 'acc-rc-confirm' }, confirm, h('span', 'حفظت رموز الاسترداد في مكان آمن')),
    onDone && h('div.acc-actions-row', doneBtn),
  );
}

/**
 * معالج التفعيل.
 * @param {{username:string, askPassword?:boolean, onEnabled:(result:object)=>void, onCancel?:()=>void}} opts
 */
export function twoFactorWizard({ username, askPassword = true, onEnabled, onCancel }) {
  const root = h('div.acc-2fa-wizard');
  const steps = h('ol.acc-steps', { 'aria-label': 'خطوات التفعيل' });
  const body = h('div.acc-wizard-body');
  const STEP_LABELS = ['تأكيد الهوية', 'ربط تطبيق المصادقة', 'رموز الاسترداد'];
  function setStep(n) {
    mount(
      steps,
      STEP_LABELS.map((l, i) => h('li', { class: [i === n && 'is-current', i < n && 'is-done'], 'aria-current': i === n ? 'step' : null }, h('span.acc-step-num', i < n ? icon('check', { size: 14 }) : String(i + 1)), h('span', l))),
    );
  }
  mount(root, steps, body);

  async function start(password) {
    const setup = await api.post('/account/2fa/setup', password ? { password } : {});
    showScan(setup);
  }

  function showPassword() {
    setStep(0);
    const f = form([{ name: 'password', label: 'كلمة المرور الحالية', type: 'password', required: true, autocomplete: 'current-password', hint: 'للتأكد من أنك صاحب الحساب قبل تغيير إعدادات الأمان' }], {
      columns: 1,
      submitLabel: 'متابعة',
      submitIcon: 'arrowLeft',
      cancel: onCancel,
      onSubmit: async (v) => start(v.password),
    });
    mount(body, h('p.acc-lead', `ستحتاج إلى هاتف عليه ${APPS}. بعد التفعيل يُطلب منك عند كل دخول رمز من ستة أرقام يتغير كل 30 ثانية.`), f.el);
  }

  function showScan(setup) {
    setStep(1);
    const codeForm = form(
      [
        {
          name: 'code',
          label: 'رمز التحقق من التطبيق',
          required: true,
          ltr: true,
          autocomplete: 'one-time-code',
          placeholder: '123456',
          maxLength: 7,
          hint: 'الرقم المكوّن من ستة أرقام الظاهر حاليًا في التطبيق',
        },
      ],
      {
        columns: 1,
        submitLabel: 'تفعيل التحقق بخطوتين',
        submitIcon: 'shieldCheck',
        cancel: onCancel,
        onSubmit: async (v) => {
          const res = await api.post('/account/2fa/enable', { code: String(v.code).replace(/\s/g, '') });
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
      qr = alertBox('تعذر رسم رمز QR؛ استخدم إدخال المفتاح يدويًا.', 'warning');
    }
    mount(
      body,
      h(
        'div.acc-scan',
        h('div.acc-qr', qr),
        h(
          'div.acc-scan-text',
          h('ol.acc-howto', h('li', `افتح ${APPS} على هاتفك.`), h('li', 'اختر «إضافة حساب» ثم «مسح رمز QR» ووجّه الكاميرا إلى الرمز.'), h('li', 'أدخل الرمز المكوّن من ستة أرقام الذي يظهر في التطبيق.')),
          h(
            'details.acc-manual',
            h('summary', 'لا يمكنك مسح الرمز؟ أدخل المفتاح يدويًا'),
            h('p.small.muted', `اسم الحساب: ${setup.issuer} (${setup.account}) — النوع: حسب الوقت`),
            h('div.acc-secret', { dir: 'ltr', translate: 'no', 'aria-label': 'المفتاح السري' }, setup.secret_groups.map((g) => h('span', g))),
            h('div.acc-actions-row', copyButton(setup.secret, 'نسخ المفتاح', { variant: 'secondary' }), button('فتح في تطبيق المصادقة', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: setup.otpauth_uri })),
          ),
          h('p.small.muted', `يجب إكمال الإعداد قبل ${dateTime(setup.expires_at)}.`),
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
      alertBox('أصبح حسابك محميًا بالتحقق بخطوتين.', 'success', { title: 'تم التفعيل' }),
      recoveryCodesPanel(res.recovery_codes, { username, onDone: () => onEnabled && onEnabled(res) }),
    );
  }

  if (askPassword) showPassword();
  else {
    setStep(0);
    mount(
      body,
      h('p.acc-lead', `ستحتاج إلى هاتف عليه ${APPS}. بعد التفعيل يُطلب منك عند كل دخول رمز من ستة أرقام يتغير كل 30 ثانية.`),
      h(
        'div.acc-actions-row',
        asyncButton('ابدأ الإعداد', () => start(null).catch((err) => {
          // الجلسة ليست حديثة بما يكفي: نطلب كلمة المرور
          if (err && err.status === 400) {
            showPassword();
            return;
          }
          throw err;
        }), { variant: 'primary', icon: 'shieldCheck' }),
        onCancel && button('إلغاء', { variant: 'ghost', onClick: onCancel }),
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
