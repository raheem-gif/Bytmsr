// الإعدادات والمستخدمون (لمدير النظام): إعدادات المؤسسة، حالة التكاملات (واتساب والذكاء الاصطناعي)، وحسابات الإدارة.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, getMeta, relative, dateTime, toLatinDigits } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  form,
  formDialog,
  table,
  kv,
  badge,
  statusBadge,
  button,
  copyButton,
  alertBox,
  toast,
  codeTag,
  ltr,
  avatar,
} from '../../../lib/ui.js';

const ENV_VARS = [
  { name: 'WHATSAPP_TOKEN', desc: 'رمز الوصول الدائم من Meta (System User Token) لإرسال الرسائل', group: 'wa' },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', desc: 'معرّف رقم الهاتف في WhatsApp Business (Phone number ID)', group: 'wa' },
  { name: 'WHATSAPP_VERIFY_TOKEN', desc: 'نص سري تختاره أنت وتكتبه في Meta عند تسجيل الـ Webhook', group: 'verify' },
  { name: 'WHATSAPP_APP_SECRET', desc: 'المفتاح السري للتطبيق (App Secret) للتحقق من توقيع كل رسالة واردة', group: 'secret' },
  { name: 'WHATSAPP_NUMBER', desc: 'رقم واتساب الظاهر للعملاء بصيغة دولية أرقامًا فقط، مثل 201000000000 (لروابط wa.me)', group: 'number' },
  { name: 'ANTHROPIC_API_KEY', desc: 'مفتاح Claude لتفعيل التحليل المتقدم (اختياري — بدونه يعمل المحلل المحلي)', group: 'ai' },
  { name: 'AI_MODEL', desc: 'اسم نموذج Claude المستخدم (اختياري)', group: 'ai_model' },
  { name: 'PUBLIC_BASE_URL', desc: 'الرابط العام للمنصة بصيغة https://… لروابط بوابة العملاء والـ Webhook', group: 'url' },
];

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

export default async function render(ctx) {
  const me = ctx.user || {};
  const [data, usersRes] = await Promise.all([api.get('/admin/settings'), api.get('/admin/users')]);
  const settings = data.settings || {};
  const integ = data.integrations || {};
  let users = Array.isArray(usersRes) ? usersRes : [];

  // ───────────── إعدادات المؤسسة ─────────────
  const orgForm = form(
    [
      { name: 'org_name', label: 'اسم المؤسسة', required: true, maxLength: 100 },
      { name: 'org_tagline', label: 'الشعار التعريفي', maxLength: 200 },
      {
        name: 'privacy_notice',
        label: 'نص الخصوصية الظاهر للعملاء',
        type: 'textarea',
        rows: 3,
        required: true,
        maxLength: 2000,
        counter: true,
        hint: 'يظهر في نموذج الطلب على الموقع وفي بوابة العميل',
      },
      { name: 'whatsapp_display_number', label: 'رقم واتساب الظاهر للعملاء', ltr: true, required: true, maxLength: 30, placeholder: '+20 100 000 0000' },
      {
        name: 'whatsapp_template_name',
        label: 'اسم قالب واتساب المعتمد',
        ltr: true,
        maxLength: 100,
        hint: 'يُستخدم خارج نافذة الـ 24 ساعة؛ يجب أن يطابق اسم القالب المعتمد في Meta',
      },
      { name: 'whatsapp_template_language', label: 'لغة القالب', ltr: true, maxLength: 10, hint: 'كود اللغة كما في Meta، مثل ar أو en_US' },
      {
        name: 'default_assignment_days',
        label: 'المدة الافتراضية لرد المحامي',
        type: 'number',
        integer: true,
        required: true,
        min: 1,
        max: 60,
        suffix: 'يوم',
        hint: 'تُقترح تلقائيًا كموعد مطلوب عند إسناد الملفات',
      },
      {
        name: 'similarity_threshold',
        label: 'حد التشابه للحالات المشابهة',
        type: 'number',
        required: true,
        min: 0.05,
        max: 0.9,
        hint: 'بين 0.05 و0.9 — كلما قلّ ظهرت حالات أكثر وأقل دقة. الافتراضي 0.15',
      },
    ],
    {
      values: settings,
      submitLabel: 'حفظ الإعدادات',
      submitIcon: 'check',
      onSubmit: async (v, f) => {
        const digits = toLatinDigits(v.whatsapp_display_number).replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) throw fieldError('whatsapp_display_number', 'أدخل رقمًا صحيحًا بصيغة دولية مثل +20 100 000 0000');
        if (v.whatsapp_template_language && !/^[a-zA-Z_]{2,10}$/.test(v.whatsapp_template_language)) throw fieldError('whatsapp_template_language', 'كود اللغة حروف لاتينية فقط، مثل ar أو en_US');
        const saved = await api.patch('/admin/settings', {
          org_name: v.org_name,
          org_tagline: v.org_tagline || '',
          privacy_notice: v.privacy_notice,
          whatsapp_display_number: v.whatsapp_display_number,
          whatsapp_template_name: v.whatsapp_template_name || '',
          whatsapp_template_language: v.whatsapp_template_language || '',
          default_assignment_days: v.default_assignment_days,
          similarity_threshold: v.similarity_threshold,
        });
        const meta = getMeta();
        if (meta && meta.settings && saved) {
          for (const k of ['org_name', 'org_tagline', 'privacy_notice', 'whatsapp_display_number']) if (k in saved) meta.settings[k] = saved[k];
        }
        if (saved) f.setValues(saved);
        toast('تم حفظ إعدادات المؤسسة — يظهر اسم المؤسسة الجديد في القائمة بعد إعادة تحميل الصفحة', 'success', 5000);
      },
    },
  );

  // ───────────── حالة التكاملات ─────────────
  const webhookUrl = `${window.location.origin}${integ.webhook_path || '/webhooks/whatsapp'}`;
  const isHttps = window.location.protocol === 'https:';
  const aiOn = integ.ai && integ.ai.provider === 'anthropic';
  const envStatus = (g) => {
    switch (g) {
      case 'wa':
        return integ.whatsapp_configured;
      case 'verify':
        return integ.whatsapp_verify_token_set;
      case 'secret':
        return integ.whatsapp_app_secret_set;
      case 'ai':
        return aiOn;
      default:
        return null;
    }
  };
  const okBadge = (on, yes = 'مضبوط', no = 'غير مضبوط') => (on ? badge(yes, 'success', { icon: 'checkCircle' }) : badge(no, 'warning', { icon: 'alert' }));

  const integrationsCard = card({
    title: 'حالة التكاملات',
    subtitle: 'تُضبط بيانات الاعتماد في متغيرات البيئة على الخادم، ولا تُحفظ أو تُعرض في الواجهة',
    icon: 'link',
    body: h(
      'div.stack-lg',
      kv([
        [
          'WhatsApp Business API',
          integ.whatsapp_configured ? badge('متصل — الإرسال حقيقي', 'success', { icon: 'whatsapp' }) : badge('غير مضبوط — وضع المحاكاة', 'warning', { icon: 'whatsapp' }),
        ],
        ['رمز التحقق (Verify Token)', okBadge(integ.whatsapp_verify_token_set)],
        [
          'المفتاح السري (App Secret)',
          integ.whatsapp_app_secret_set ? badge('مضبوط — يُتحقق من توقيع كل طلب وارد', 'success', { icon: 'shieldCheck' }) : badge('غير مضبوط — لا يُتحقق من التوقيع', 'warning', { icon: 'alert' }),
        ],
        ['رابط Webhook', h('div.pd-copy-row', h('code.pd-url', { dir: 'ltr' }, webhookUrl), copyButton(webhookUrl, 'نسخ الرابط'))],
        ['الذكاء الاصطناعي', h('span.pd-inline-k', integ.ai?.label || '—', ' ', aiOn ? badge('Claude متصل', 'success') : badge('يعمل محليًا', 'info'))],
        ['الوضع التجريبي', integ.demo ? badge('مفعّل — بيانات وحسابات تجريبية ومحاكي واتساب', 'accent') : badge('غير مفعّل', 'muted')],
      ]),
      !isHttps ? alertBox('تقبل Meta روابط Webhook عامة بصيغة HTTPS فقط. عند التشغيل الفعلي استخدم نطاق المنصة العام (PUBLIC_BASE_URL) بدل هذا الرابط المحلي.', 'warning') : null,
      h(
        'section.section',
        h('h3.pd-subhead', 'خطوات ربط واتساب'),
        h(
          'ol.pd-steps-list',
          h('li', 'أنشئ تطبيقًا في Meta for Developers وأضف إليه منتج WhatsApp، ثم انسخ رمز الوصول الدائم ومعرّف رقم الهاتف.'),
          h('li', 'اضبط متغيرات البيئة الموضحة أدناه في ملف ', codeTag('.env'), ' على الخادم، ثم أعد تشغيل المنصة.'),
          h('li', 'من لوحة Meta › WhatsApp › Configuration: الصق «رابط Webhook» أعلاه، واكتب نفس قيمة ', codeTag('WHATSAPP_VERIFY_TOKEN'), '، ثم اشترك في الحقل ', codeTag('messages'), '.'),
          h('li', 'أنشئ قالب رسالة واعتمده من Meta بالاسم المحدد في «اسم قالب واتساب المعتمد» ليُستخدم خارج نافذة الـ 24 ساعة.'),
        ),
      ),
      h(
        'section.section',
        h('h3.pd-subhead', 'متغيرات البيئة'),
        table({
          className: 'pd-table-tight',
          caption: 'متغيرات البيئة المطلوبة للتكاملات',
          rows: ENV_VARS,
          columns: [
            { key: 'name', label: 'المتغير', render: (e) => codeTag(e.name) },
            { key: 'desc', label: 'الغرض', className: 'col-wide', render: (e) => e.desc },
            {
              key: 'status',
              label: 'الحالة',
              render: (e) => {
                const st = envStatus(e.group);
                return st == null ? h('span.cell-sub', 'يُراجع على الخادم') : okBadge(st);
              },
            },
          ],
        }),
      ),
    ),
  });

  // ───────────── المستخدمون ─────────────
  const usersHost = h('div');

  async function reloadUsers() {
    users = await api.get('/admin/users');
    drawUsers();
  }

  function openAddUser() {
    formDialog({
      title: 'إضافة مستخدم للإدارة',
      intro: 'مدير النظام يملك كل الصلاحيات بما فيها المحاسبة والإعدادات؛ مدير الحالات يدير الوارد والملفات والمحامين دون المحاسبة والإعدادات.',
      submitLabel: 'إضافة المستخدم',
      fields: [
        {
          name: 'role',
          label: 'الدور',
          type: 'select',
          required: true,
          options: [
            { value: 'case_manager', label: label('user_role', 'case_manager') },
            { value: 'admin', label: label('user_role', 'admin') },
          ],
        },
        { name: 'name', label: 'الاسم', required: true, maxLength: 120 },
        { name: 'username', label: 'اسم المستخدم', required: true, ltr: true, minLength: 3, maxLength: 40, autocomplete: 'off', hint: 'حروف لاتينية وأرقام فقط' },
        { name: 'password', label: 'كلمة المرور المبدئية', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', hint: 'ثمانية أحرف على الأقل' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
        { name: 'phone', label: 'رقم الموبايل', type: 'phone' },
      ],
      values: { role: 'case_manager' },
      onSubmit: async (v) => {
        if (!USERNAME_RE.test(v.username)) throw fieldError('username', 'اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط');
        return api.post('/admin/users', { role: v.role, name: v.name, username: v.username, password: v.password, email: v.email || null, phone: v.phone || null });
      },
    }).then(async (res) => {
      if (!res) return;
      toast(`تمت إضافة ${res.name} (${label('user_role', res.role)})`, 'success');
      await reloadUsers();
    });
  }

  function openEditUser(u) {
    const self = u.id === me.id;
    formDialog({
      title: `تعديل حساب ${u.name}`,
      intro: self ? 'هذا حسابك: لا يمكنك إيقافه أو خفض صلاحياتك بنفسك، حتى لا تبقى المنصة بلا مدير نظام.' : null,
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
          name: 'password',
          label: 'كلمة مرور جديدة (اختياري)',
          type: 'password',
          minLength: 8,
          autocomplete: 'new-password',
          hint: 'اتركها فارغة للإبقاء على كلمة المرور الحالية؛ تغييرها يُنهي جلسات المستخدم',
        },
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
          if (v.role !== u.role) patch.role = v.role;
          if (v.active !== Boolean(u.active)) patch.active = v.active;
        }
        if (v.password) patch.password = v.password;
        return api.patch(`/admin/users/${encodeURIComponent(u.id)}`, patch);
      },
    }).then(async (res) => {
      if (!res) return;
      toast('تم حفظ بيانات المستخدم', 'success');
      await reloadUsers();
    });
  }

  function drawUsers() {
    mount(
      usersHost,
      table({
        className: 'pd-table-tight',
        caption: 'مستخدمو الإدارة',
        rows: users,
        empty: 'لا يوجد مستخدمون',
        rowClass: (u) => !u.active && 'is-muted',
        columns: [
          {
            key: 'name',
            label: 'الاسم',
            render: (u) =>
              h('div.pd-person', avatar(u.name, { size: 'sm' }), h('div.pd-person-text', h('span.cell-title', u.name), u.id === me.id ? h('div', badge('أنت', 'primary')) : null)),
          },
          { key: 'username', label: 'اسم المستخدم', render: (u) => codeTag(u.username) },
          { key: 'role', label: 'الدور', render: (u) => statusBadge('user_role', u.role, { dot: false }) },
          {
            key: 'contact',
            label: 'التواصل',
            render: (u) => (u.email || u.phone ? h('div.pd-cell-stack', u.email ? ltr(u.email) : null, u.phone ? ltr(u.phone) : null) : null),
          },
          { key: 'active', label: 'الحالة', render: (u) => (u.active ? badge('نشط', 'success', { dot: true }) : badge('موقوف', 'muted', { dot: true })) },
          {
            key: 'last_login',
            label: 'آخر دخول',
            render: (u) => (u.last_login_at ? h('time.nowrap', { datetime: u.last_login_at, title: dateTime(u.last_login_at) }, relative(u.last_login_at)) : h('span.muted', 'لم يدخل بعد')),
          },
          { key: 'actions', label: '', render: (u) => button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openEditUser(u) }) },
        ],
      }),
    );
  }
  drawUsers();

  const usersCard = card({
    title: 'المستخدمون',
    subtitle: 'حسابات الإدارة ومديري الحالات',
    icon: 'users',
    actions: button('إضافة مستخدم', { variant: 'primary', size: 'sm', icon: 'userPlus', onClick: openAddUser }),
    body: h(
      'div.stack',
      usersHost,
      h('p.pd-footnote', 'حسابات المحامين تُدار من ', h('a', { href: '#/lawyers' }, 'شبكة المحامين'), ' مع تخصصاتهم واتفاقاتهم المالية.'),
    ),
  });

  return frag(
    pageHeader({
      title: 'الإعدادات والمستخدمون',
      subtitle: 'إعدادات المؤسسة العامة، وحالة ربط واتساب والذكاء الاصطناعي، وحسابات فريق الإدارة.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'الإعدادات والمستخدمون' }],
    }),
    card({ title: 'إعدادات المؤسسة', subtitle: 'تظهر للعملاء في الموقع والبوابة ورسائل واتساب', icon: 'settings', body: orgForm.el }),
    integrationsCard,
    usersCard,
  );
}

