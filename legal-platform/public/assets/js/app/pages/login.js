// شاشة تسجيل الدخول للإدارة والمحامين، مع لوحة الحسابات التجريبية في وضع العرض.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label } from '../../lib/fmt.js';
import { form, icon, badge, statusTone, asyncButton, alertBox, avatar, brandMark } from '../../lib/ui.js';

/**
 * @param {{meta:object, expired?:boolean, onLogin:(user:object)=>void}} opts
 */
export default function renderLogin({ meta, expired = false, onLogin }) {
  const settings = (meta && meta.settings) || {};
  const org = settings.org_name || 'بيوت مصر';
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
        const res = await api.post('/auth/login', { username: values.username, password: values.password });
        onLogin(res.user);
      },
    },
  );
  loginForm.el.querySelector('button[type=submit]')?.classList.add('btn-block', 'btn-lg');

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
                  onLogin(res.user);
                },
                { variant: 'primary', size: 'sm', ariaLabel: `دخول بحساب ${acc.name}` },
              ),
            ),
          ),
        ),
      )
    : null;

  return h(
    'div.login-page',
    h(
      'section.login-brand',
      h(
        'div.brand',
        brandMark({ size: 28 }),
        h('span.brand-text', h('span.brand-name', org), h('span.brand-sub', 'منصة التشغيل القانوني')),
      ),
      h(
        'div.login-pitch',
        h('h2', 'كل طلب قانوني، من أول رسالة حتى الرد المعتمد، في مكان واحد'),
        h(
          'p',
          'منصة داخلية لفريق الإدارة وشبكة المحامين: استقبال الطلبات من الموقع وواتساب، وإحالة الملفات، ومراجعة الآراء القانونية قبل وصولها إلى العميل.',
        ),
        h(
          'ul.login-points',
          [
            ['inbox', 'صندوق وارد موحد لطلبات الموقع وواتساب'],
            ['shield', 'صلاحيات دقيقة لكل محامٍ على كل ملف'],
            ['checkCircle', 'لا يصل أي رد للعميل قبل اعتماد الإدارة'],
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
      ),
      demoPanel,
      h('a.login-back', { href: '/' }, `العودة إلى موقع ${org}`),
    ),
  );
}
