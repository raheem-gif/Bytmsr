// شاشة تسجيل الدخول للإدارة والمحامين، مع لوحة الحسابات التجريبية في وضع العرض.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, staffChrome } from '../../lib/fmt.js';
import { form, icon, badge, statusTone, asyncButton, alertBox, avatar, brandMark, wordmark } from '../../lib/ui.js';

/**
 * @param {{meta:object, expired?:boolean, onLogin:(user:object)=>void}} opts
 */
export default function renderLogin({ meta, expired = false, onLogin }) {
  const settings = (meta && meta.settings) || {};
  const org = settings.org_name || 'بيوت مصر';
  const chrome = staffChrome();
  const year = new Date().getFullYear();

  const loginForm = form(
    [
      { name: 'username', label: 'اسم المستخدم', required: true, ltr: true, autocomplete: 'username' },
      { name: 'password', label: 'كلمة المرور', type: 'password', required: true, autocomplete: 'current-password' },
    ],
    {
      columns: 1,
      submitLabel: 'تسجيل الدخول',
      className: 'login-form',
      onSubmit: async (values) => {
        // v9.1 l-home (L-17): «تذكّرني على هذا الجهاز» (يطبقه الخادم على حسابات المحامين فقط)
        const remember = !!rememberBox.checked;
        const res = await api.post('/auth/login', { username: values.username, password: values.password, remember });
        // res قد يطلب خطوة التحقق الثانية (two_factor_required) — يعالجها main.js
        onLogin(res.user, { ...res, remember });
      },
    },
  );
  loginForm.el.querySelector('button[type=submit]')?.classList.add('btn-block', 'btn-lg');
  // v9.1 l-home (L-17): مفعّل افتراضيًا على الهواتف (المؤشر باللمس)
  const rememberBox = h('input', { type: 'checkbox', name: 'remember', checked: !!window.matchMedia?.('(pointer: coarse)').matches });
  const rememberRow = h('label.lh-remember', rememberBox, h('span', 'تذكّرني على هذا الجهاز'));
  const submitBtn = loginForm.el.querySelector('button[type=submit]');
  if (submitBtn) (submitBtn.closest('.form-actions') || submitBtn).before(rememberRow);
  else loginForm.el.append(rememberRow);

  const demoAccounts = meta && meta.demo && Array.isArray(meta.demo_accounts) ? meta.demo_accounts : [];
  const demoPanel = demoAccounts.length
    ? h(
        'section.demo-panel',
        { 'aria-labelledby': 'demo-title' },
        h('h2#demo-title', icon('sparkle', { size: 18 }), 'حسابات تجريبية'),
        h('p', 'هذه نسخة تجريبية ببيانات وهمية. اختر حسابًا للدخول بضغطة واحدة وتجربة صلاحيات كل دور.'),
        h(
          'ul.demo-list',
          demoAccounts.map((acc) =>
            h(
              'li.demo-item',
              avatar(acc.name),
              h(
                'div.demo-info',
                h('span.demo-name', acc.name, badge(label('user_role', acc.role), statusTone('user_role', acc.role))),
                h('span.demo-cred', h('span.ltr.mono', `${acc.username} / ${acc.password}`)),
              ),
              asyncButton(
                'دخول',
                async () => {
                  const res = await api.post('/auth/login', { username: acc.username, password: acc.password });
                  onLogin(res.user, res);
                },
                { variant: 'primary', size: 'sm', ariaLabel: `دخول بحساب ${acc.name}` },
              ),
            ),
          ),
        ),
      )
    : null;

  return h(
    'div.login-page.lh-login',
    h(
      'section.login-brand',
      h(
        'div.brand',
        brandMark({ size: 28 }),
        // v10 experience (L-03): الشعار النصي للمكتب، أو اسم المؤسسة كما في 9.2 حين يُوقف في الإعدادات
        chrome.on
          ? h('span.brand-text', wordmark({ size: 'lg', tone: 'dark', name: chrome.name, short: chrome.short }), h('span.brand-sub', 'منصة الدعم القانوني'))
          : h('span.brand-text', h('span.brand-name', org), h('span.brand-sub', 'منصة الدعم القانوني')),
      ),
      h(
        'div.login-pitch',
        h('h2', 'كل طلب قانوني، من أول رسالة حتى الرد المعتمد، في مكان واحد'),
        h(
          'p',
          'منصة داخلية لفريق الإدارة وشبكة المحامين: استقبال الطلبات من الموقع وواتساب، وإسناد الملفات، ومراجعة الآراء القانونية قبل وصولها إلى المستفيد/ة.',
        ),
        h(
          'ul.login-points',
          [
            ['inbox', 'صندوق وارد موحد لطلبات الموقع وواتساب'],
            ['shield', 'صلاحيات دقيقة لكل محامٍ على كل ملف'],
            ['checkCircle', 'لا يصل أي رد للمستفيد/ة قبل اعتماد الإدارة'],
          ].map(([ic, text]) => h('li', h('span.pt-icon', icon(ic, { size: 18 })), h('span', text))),
        ),
      ),
      h('p.login-foot', `© ${year} ${org}. جميع الحقوق محفوظة.`),
    ),
    h(
      'main.login-main',
      h(
        'div.login-card',
        h('h1', 'تسجيل الدخول'),
        h('p.login-sub', 'لفريق الإدارة والمحامين المعتمدين لدى المؤسسة'),
        expired && h('div.mb-3', alertBox('انتهت جلستك، يرجى تسجيل الدخول مرة أخرى للمتابعة.', 'warning')),
        loginForm.el,
        // v9.1 l-home (L-10/L-21): «نسيت كلمة المرور؟» تفتح ورقة: اتصال بالمؤسسة، واتساب، أو رابط على واتساب للمحامين المشتركين
        h('p.login-forgot', h('button.lh-forgot', { type: 'button', onClick: () => openForgotSheet(meta, loginForm.el) }, 'نسيت كلمة المرور؟')),
      ),
      demoPanel,
      h('a.login-back', { href: '/' }, `العودة إلى موقع ${org}`),
    ),
  );
}

// ───────── v9.1 l-home: «نسيت كلمة المرور؟» ─────────
async function openForgotSheet(meta, formEl) {
  const { modal, button, toast, errorMessage } = await import('../../lib/ui.js');
  const site = (meta && meta.site) || {};
  const settings = (meta && meta.settings) || {};
  const phone = String(site.org_phone_e164 || site.org_phone || '').replace(/[^\d+]/g, '');
  const wa = String(settings.whatsapp_number_digits || '').replace(/\D/g, '');
  const typed = formEl?.querySelector('input[name=username]')?.value || '';
  const userInput = h('input.input#lh-reset-user', { type: 'text', dir: 'ltr', autocomplete: 'username', value: typed, autocapitalize: 'off', spellcheck: false });
  const result = h('p.lh-muted', { role: 'status', hidden: true });
  const sendBtn = button('أرسل رابطًا إلى واتساب', { variant: 'secondary', icon: 'whatsapp' });
  sendBtn.addEventListener('click', async () => {
    const username = userInput.value.trim();
    if (!username) {
      userInput.focus();
      return;
    }
    sendBtn.disabled = true;
    try {
      const r = await api.post('/auth/reset-request', { username });
      result.textContent = (r && r.message) || 'إن كان الحساب مسجلًا برقم واتساب فسيصله رابط خلال دقيقة.';
      result.hidden = false;
    } catch (err) {
      toast(errorMessage(err), 'danger');
      sendBtn.disabled = false;
    }
  });
  modal({
    title: 'اطلب رابطًا جديدًا من الإدارة',
    sheet: true,
    className: 'lh-forgot-sheet',
    body: h(
      'div',
      h('div.lh-sheet-actions', phone && button('اتصل بالمؤسسة', { variant: 'primary', icon: 'phone', href: `tel:${phone}` }), wa && button('واتساب', { variant: 'secondary', icon: 'whatsapp', href: `https://wa.me/${wa}`, target: '_blank' })),
      h(
        'div.lh-reset-form',
        h('label', { for: 'lh-reset-user' }, 'للمحامين المشتركين في تنبيهات واتساب: اسم المستخدم'),
        userInput,
        sendBtn,
        result,
      ),
    ),
  });
}
