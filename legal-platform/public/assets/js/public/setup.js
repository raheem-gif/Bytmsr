// معالج الإعداد الأول للمنصة (/setup) — يعمل مرة واحدة فقط عند أول تشغيل في الإنتاج.
// الخطوات: رمز الإعداد ← ملف المؤسسة ← حساب مدير النظام ← التكاملات (اختياري) ← المراجعة والإنهاء.
// رمز الإعداد يُقرأ من جزء الرابط (#token=…) ثم يُحذف فورًا من شريط العنوان، ولا يُخزن في المتصفح.
// (الإصدار 9 — وحدة platform)

import { h, mount } from '../lib/h.js';
import { api } from '../lib/api.js';
import { form, button, alertBox, icon, copyButton, loading, errorMessage, kv, ltr, badge } from '../lib/ui.js';
import { count } from '../lib/fmt.js';
import { hydrateIcons } from './common.js';

// أسماء القوائم الإنجليزية معزولة الاتجاه حتى تُقرأ الأسهم «←» بينها من اليمين داخل النص العربي
const en = (s) => `⁦${s}⁩`;
const menu = (...parts) => parts.map(en).join(' ← ');

const root = document.getElementById('setup-root');
hydrateIcons();

const STEPS = [
  { key: 'token', title: 'رمز الإعداد' },
  { key: 'org', title: 'ملف المؤسسة' },
  { key: 'admin', title: 'مدير النظام' },
  { key: 'integrations', title: 'التكاملات' },
  { key: 'review', title: 'الإنهاء' },
];

const WA_FIELDS = ['token', 'phone_number_id', 'waba_id', 'app_secret', 'verify_token', 'number'];
const AI_FIELDS = ['api_key'];
const PLACEHOLDER_WA = /100\s*000\s*0000/;

let token = '';
let info = null;
let step = 0;
const forms = {};
const panels = {};
let stepperEl = null;
let liveEl = null;

function takeTokenFromUrl() {
  const m = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash || '');
  if (!m) return;
  try {
    token = decodeURIComponent(m[1]).trim();
  } catch {
    token = m[1].trim();
  }
  // لا نترك الرمز في شريط العنوان أو سجل المتصفح
  window.history.replaceState(null, '', window.location.pathname);
}

// ───────── فحص كلمة المرور في المتصفح (نفس قواعد الخادم تقريبًا؛ الخادم هو الحكم النهائي) ─────────
function passwordChecks(pw, username) {
  const classes = [/[\p{Ll}\p{Lo}]/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) => re.test(pw)).length;
  const u = String(username || '').trim().toLowerCase();
  return [
    { ok: pw.length >= 10, text: '10 أحرف على الأقل' },
    { ok: classes >= 3, text: 'ثلاثة أنواع على الأقل من: حروف صغيرة، حروف كبيرة، أرقام، رموز' },
    { ok: pw.length > 0 && !(u.length >= 3 && pw.toLowerCase().includes(u)), text: 'لا تحتوي على اسم المستخدم' },
  ];
}

function randomSecret(len = 32) {
  const bytes = new Uint8Array(len);
  window.crypto.getRandomValues(bytes);
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

/**
 * Enter داخل حقل نصي ينتقل إلى الخطوة التالية (بعد التحقق). النماذج بلا زر إرسال وفيها أكثر من حقل
 * لا يرسلها المتصفح عند Enter، فنلتقط المفتاح بأنفسنا.
 */
function onEnter(formEl, fn) {
  formEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT' || ['checkbox', 'radio', 'button', 'submit'].includes(e.target.type)) return;
    e.preventDefault();
    fn();
  });
}

function announce(text) {
  if (liveEl) liveEl.textContent = text;
}

// ───────── الخطوات ─────────

function goTo(index, { focus = true } = {}) {
  step = Math.max(0, Math.min(STEPS.length - 1, index));
  STEPS.forEach((s, i) => {
    panels[s.key].hidden = i !== step;
  });
  if (stepperEl) {
    [...stepperEl.children].forEach((li, i) => {
      li.classList.toggle('is-done', i < step);
      li.classList.toggle('is-current', i === step);
      if (i === step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }
  if (STEPS[step].key === 'review') renderReview();
  announce(`الخطوة ${step + 1} من ${STEPS.length}: ${STEPS[step].title}`);
  if (focus) {
    const heading = panels[STEPS[step].key].querySelector('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function stepActions({ back = true, nextLabel = 'التالي', onNext, nextIcon = 'arrowLeft' } = {}) {
  return h(
    'div.pf-setup-actions',
    back ? button('السابق', { variant: 'ghost', icon: 'arrowRight', onClick: () => goTo(step - 1) }) : h('span'),
    onNext && button(nextLabel, { variant: 'primary', iconEnd: nextIcon, onClick: onNext }),
  );
}

function panel(key, title, intro, ...children) {
  const el = h('section.pf-setup-panel', { 'aria-labelledby': `pf-step-${key}` }, h('h2.pf-setup-title', { id: `pf-step-${key}` }, title), intro && h('p.pf-setup-intro', intro), children);
  panels[key] = el;
  return el;
}

// 1) رمز الإعداد
function tokenPanel() {
  const status = h('div.pf-setup-status');
  const f = form(
    [
      {
        name: 'token',
        label: 'رمز الإعداد',
        type: 'text',
        required: true,
        ltr: true,
        autocomplete: 'off',
        hint: 'يظهر في سجل تشغيل الخادم (Logs) بعد ‎#token=‎ في رابط الإعداد. الرابط صالح لمرة واحدة.',
        full: true,
      },
    ],
    { values: { token }, footer: false, columns: 1 },
  );
  forms.token = f;
  const verify = async () => {
    if (!f.validate()) return;
    const value = String(f.getValues().token || '').replace(/^.*#token=/, '').trim();
    mount(status, loading('جارٍ التحقق من الرمز…'));
    try {
      await api.post('/setup/verify', { token: value });
      token = value;
      mount(status);
      goTo(1);
    } catch (err) {
      if (err.status === 404) return renderAlreadyDone();
      mount(status, alertBox(errorMessage(err), 'danger'));
    }
  };
  f.el.addEventListener('submit', (e) => {
    e.preventDefault();
    verify();
  });
  const expires = info.token_expires_at
    ? new Date(info.token_expires_at).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', dateStyle: 'full', timeStyle: 'short' })
    : null;
  return panel(
    'token',
    'تأكيد رمز الإعداد',
    'هذه الصفحة تعمل مرة واحدة فقط لإعداد المنصة بعد تثبيتها. للتأكد من أنك مالك الخادم، أدخل رمز الإعداد الذي طُبع في سجل التشغيل.',
    expires && h('p.pf-muted', icon('clock', { size: 16 }), ` الرمز صالح حتى ${expires} بتوقيت القاهرة.`),
    f.el,
    status,
    stepActions({ back: false, nextLabel: 'تحقق من الرمز', onNext: verify, nextIcon: 'shieldCheck' }),
    token ? null : alertBox('لم نجد الرمز في الرابط. انسخ رابط الإعداد كاملًا من سجل تشغيل الخادم، أو الصق الرمز هنا.', 'info'),
  );
}

// 2) ملف المؤسسة
function orgPanel() {
  const d = { ...(info.defaults || {}) };
  if (!d.whatsapp_display_number || PLACEHOLDER_WA.test(d.whatsapp_display_number)) d.whatsapp_display_number = d.org_phone || '';
  const typeOf = (key) => (key === 'org_phone' || key === 'whatsapp_display_number' || key === 'org_facebook_url' ? { type: 'text', ltr: true } : { type: 'text' });
  const hints = {
    org_name: 'يظهر في رأس المنصة والموقع ورسائل واتساب، مثل «بيوت مصر».',
    org_legal_name: 'الاسم كما في قرار الإشهار؛ يظهر في التقارير والإيصالات.',
    org_phone: 'رقم التواصل الرسمي، مثل 01211114662.',
    whatsapp_display_number: 'الرقم الذي يراسله المستفيدون على واتساب ويظهر في الموقع.',
    org_facebook_url: 'مثل https://www.facebook.com/Beyootmisr/',
  };
  const fields = (info.org_fields || []).map((f) => ({
    name: f.key,
    label: f.label,
    required: !!f.required,
    maxLength: f.max,
    hint: hints[f.key],
    full: f.key === 'org_address' || f.key === 'org_legal_name' || f.key === 'org_facebook_url',
    autocomplete: f.key === 'org_phone' ? 'tel' : 'off',
    ...typeOf(f.key),
  }));
  const f = form(fields, { values: d, footer: false });
  forms.org = f;
  onEnter(f.el, () => f.validate() && goTo(2));
  return panel(
    'org',
    'ملف المؤسسة',
    'بيانات المؤسسة كما تظهر للمستفيدين في الموقع والرسائل والتقارير. القيم المعبأة هي بيانات مؤسسة بيوت مصر؛ راجعها وعدّل ما يلزم.',
    f.el,
    stepActions({ onNext: () => f.validate() && goTo(2) }),
  );
}

// 3) حساب مدير النظام
function adminPanel() {
  const f = form(
    [
      { name: 'name', label: 'الاسم الكامل', required: true, maxLength: 100, autocomplete: 'name', hint: 'يظهر في سجل الأمان وسجل الإجراءات.' },
      { name: 'username', label: 'اسم المستخدم', required: true, maxLength: 40, ltr: true, autocomplete: 'username', hint: 'حروف لاتينية وأرقام ونقطة وشرطة فقط، مثل director.' },
      { name: 'email', label: 'البريد الإلكتروني (اختياري)', type: 'email', maxLength: 200 },
      { name: 'password', label: 'كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' },
      { name: 'password_confirm', label: 'تأكيد كلمة المرور', type: 'password', required: true, autocomplete: 'new-password' },
    ],
    { footer: false },
  );
  forms.admin = f;
  const list = h('ul.pf-pw-checks', { 'aria-live': 'polite' });
  const refresh = () => {
    const v = f.getValues();
    mount(
      list,
      passwordChecks(v.password || '', v.username).map((c) =>
        h('li', { class: c.ok ? 'is-ok' : null }, icon(c.ok ? 'checkCircle' : 'dot', { size: 16 }), h('span', c.text), h('span.sr-only', c.ok ? ' (متحقق)' : ' (غير متحقق)')),
      ),
    );
  };
  f.el.addEventListener('input', refresh);
  refresh();
  const next = () => {
    if (!f.validate()) return;
    const v = f.getValues();
    const failed = passwordChecks(v.password, v.username).find((c) => !c.ok);
    if (failed) {
      f.setErrors({ password: `كلمة المرور لا تستوفي الشرط: ${failed.text}` });
      return;
    }
    if (v.password !== v.password_confirm) {
      f.setErrors({ password_confirm: 'تأكيد كلمة المرور غير مطابق' });
      return;
    }
    goTo(3);
  };
  onEnter(f.el, next);
  return panel(
    'admin',
    'حساب مدير النظام الأول',
    'هذا الحساب يملك كل الصلاحيات: إدارة المستخدمين والمحامين والإعدادات والنسخ الاحتياطي. أضف بقية فريق العمل من داخل المنصة بعد الإعداد.',
    f.el,
    h('div.pf-pw-box', h('strong', 'شروط كلمة المرور'), list),
    stepActions({ onNext: next }),
  );
}

// 4) التكاملات (اختياري)
function integrationFields(name, keys, extra = {}) {
  const spec = info.integrations?.[name];
  if (!spec) return [];
  return keys
    .map((k) => spec.fields.find((f) => f.key === k))
    .filter(Boolean)
    .map((f) =>
      f.from_env
        ? { name: f.key, label: f.label, type: 'static', value: 'مضبوط من متغيرات البيئة على الخادم', hint: `المتغير ${f.env}` }
        : {
            name: f.key,
            label: f.label,
            type: f.secret ? 'password' : 'text',
            ltr: true,
            autocomplete: f.secret ? 'new-password' : 'off',
            hint: extra[f.key],
            full: f.secret,
          },
    );
}

function integrationsPanel() {
  const waHints = {
    token: `من ${menu('Business Settings', 'System Users', 'Generate token')} (صلاحيتا ${en('whatsapp_business_messaging')} و${en('whatsapp_business_management')}).`,
    phone_number_id: `من ${menu('WhatsApp', 'API Setup')} في تطبيق ميتا.`,
    waba_id: `${en('WhatsApp Business Account ID')} من نفس الصفحة.`,
    app_secret: `من ${menu('App Settings', 'Basic', 'App Secret')}. يُستخدم للتحقق من توقيع كل رسالة واردة.`,
    verify_token: 'نص سري تختاره أنت وتكتبه أيضًا في إعدادات Webhook على ميتا.',
    number: 'رقم واتساب المؤسسة بالصيغة الدولية، مثل 201211114662.',
  };
  const wa = form(integrationFields('whatsapp', WA_FIELDS, waHints), { footer: false });
  const ai = form(
    integrationFields('anthropic', AI_FIELDS, { api_key: `من ${menu('console.anthropic.com', 'API Keys', 'Create Key')}. يبدأ بـ ${en('sk-ant-')}` }),
    { footer: false, columns: 1 },
  );
  forms.whatsapp = wa;
  forms.anthropic = ai;
  const toReview = () => wa.validate() && ai.validate() && goTo(4);
  onEnter(wa.el, toReview);
  onEnter(ai.el, toReview);

  const verifyCtl = wa.control('verify_token');
  const genBtn =
    verifyCtl && verifyCtl.input
      ? button('توليد رمز تحقق عشوائي', {
          size: 'sm',
          variant: 'secondary',
          icon: 'refresh',
          onClick: () => {
            verifyCtl.set(randomSecret(32));
            verifyCtl.input.type = 'text';
            announce('تم توليد رمز تحقق جديد؛ انسخه واحفظه لاستخدامه في إعدادات Webhook على ميتا.');
          },
        })
      : null;
  // الزر بجوار حقل «رمز التحقق» نفسه لا في آخر النموذج
  const genInField = !!(genBtn && verifyCtl.wrap);
  if (genInField) verifyCtl.wrap.append(h('div.pf-inline-actions', genBtn));

  return panel(
    'integrations',
    'التكاملات (اختياري)',
    'يمكنك تخطي هذه الخطوة الآن وإضافة المفاتيح لاحقًا من صفحة «التكاملات» داخل المنصة. تُحفظ الأسرار مشفرة ولا تُعرض مرة أخرى.',
    h(
      'fieldset.pf-fieldset',
      h('legend', icon('whatsapp', { size: 18 }), ' واتساب للأعمال (WhatsApp Cloud API)'),
      h(
        'div.pf-webhook',
        h('span.pf-muted', 'رابط Webhook الذي تضعه في إعدادات تطبيق ميتا:'),
        h('div.pf-webhook-row', h('code.pf-code', { dir: 'ltr' }, info.webhook_url), copyButton(info.webhook_url, 'نسخ')),
      ),
      wa.el,
      genBtn && !genInField ? h('div.pf-inline-actions', genBtn) : null,
    ),
    h('fieldset.pf-fieldset', h('legend', icon('sparkle', { size: 18 }), ' الذكاء الاصطناعي (Claude من Anthropic)'), ai.el),
    stepActions({ onNext: toReview, nextLabel: 'التالي: المراجعة' }),
  );
}

// 5) المراجعة والإنهاء
const reviewBody = h('div.pf-review');
const submitStatus = h('div.pf-setup-status');

function filled(f, keys) {
  if (!f) return {};
  const v = f.getValues();
  const out = {};
  for (const k of keys) {
    const val = typeof v[k] === 'string' ? v[k].trim() : v[k];
    if (val && f.control(k)?.type !== 'static') out[k] = val;
  }
  return out;
}

function renderReview() {
  const org = forms.org.getValues();
  const admin = forms.admin.getValues();
  const wa = filled(forms.whatsapp, WA_FIELDS);
  const ai = filled(forms.anthropic, AI_FIELDS);
  const label = (key) => (info.org_fields || []).find((f) => f.key === key)?.label || key;
  mount(
    reviewBody,
    h('h3.pf-review-title', 'ملف المؤسسة'),
    kv(
      (info.org_fields || []).map((f) => [label(f.key), org[f.key] ? (/phone|number|url/.test(f.key) ? ltr(org[f.key]) : org[f.key]) : null]),
      { columns: 1 },
    ),
    h('h3.pf-review-title', 'حساب مدير النظام'),
    kv([
      ['الاسم', admin.name],
      ['اسم المستخدم', ltr(admin.username)],
      ['البريد الإلكتروني', admin.email ? ltr(admin.email) : null],
    ]),
    h('h3.pf-review-title', 'التكاملات'),
    kv([
      ['واتساب', Object.keys(wa).length ? badge(`ستُحفظ ${count(Object.keys(wa).length, ['قيمة واحدة', 'قيمتان', 'قيم', 'قيمة'])}`, 'success') : badge('لاحقًا (وضع المحاكاة)', 'muted')],
      ['Claude', ai.api_key ? badge('سيُحفظ المفتاح مشفرًا', 'success') : badge('لاحقًا (المحلل المحلي)', 'muted')],
    ]),
  );
}

async function submit(btn) {
  btn.disabled = true;
  btn.classList.add('is-loading');
  mount(submitStatus, loading('جارٍ إنشاء الحساب وحفظ الإعدادات…'));
  const integrations = {};
  const wa = filled(forms.whatsapp, WA_FIELDS);
  const ai = filled(forms.anthropic, AI_FIELDS);
  if (Object.keys(wa).length) integrations.whatsapp = wa;
  if (Object.keys(ai).length) integrations.anthropic = ai;
  try {
    const res = await api.post('/setup/complete', {
      token,
      org: forms.org.getValues(),
      admin: forms.admin.getValues(),
      integrations,
    });
    renderDone(res);
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    mount(submitStatus);
    const d = err.details || {};
    if (err.status === 404) return renderAlreadyDone();
    if (err.status === 403) {
      goTo(0);
      return mount(panels.token.querySelector('.pf-setup-status'), alertBox(errorMessage(err), 'danger'));
    }
    const target = d.step === 'integrations' ? forms[d.integration] || forms.whatsapp : d.step === 'admin' ? forms.admin : d.fields && Object.keys(d.fields).some((k) => k.startsWith('org_') || k === 'whatsapp_display_number') ? forms.org : null;
    if (target) {
      const idx = target === forms.org ? 1 : target === forms.admin ? 2 : 3;
      goTo(idx, { focus: false });
      target.showError(err);
      return;
    }
    mount(submitStatus, alertBox(errorMessage(err), 'danger'));
  }
}

function reviewPanel() {
  const finish = button('إنهاء الإعداد وإنشاء الحساب', { variant: 'primary', icon: 'check', onClick: () => submit(finish) });
  return panel(
    'review',
    'المراجعة والإنهاء',
    'راجع البيانات ثم اضغط «إنهاء الإعداد». بعد الإنهاء يُلغى رمز الإعداد نهائيًا ولا تعود هذه الصفحة متاحة.',
    reviewBody,
    submitStatus,
    h('div.pf-setup-actions', button('السابق', { variant: 'ghost', icon: 'arrowRight', onClick: () => goTo(3) }), finish),
  );
}

// ───────── الحالات النهائية ─────────

function renderDone(res) {
  const loggedIn = !!(res && res.user);
  mount(
    root,
    h(
      'div.pf-setup-card.pf-setup-done',
      h('span.pf-done-icon', icon('checkCircle', { size: 40 })),
      h('h1.pf-setup-h1', 'تم إعداد المنصة بنجاح'),
      h('p.pf-setup-intro', 'أُنشئ حساب مدير النظام وأُلغي رمز الإعداد نهائيًا. الخطوات المقترحة الآن:'),
      h(
        'ol.pf-next-steps',
        h('li', 'افتح صفحة «التكاملات» واضغط «اختبار الاتصال» لواتساب وClaude.'),
        h('li', 'أضف فريق الإدارة والمحامين من «الإعدادات والمستخدمون» و«شبكة المحامين».'),
        h('li', 'راجع «صحة النظام والنسخ الاحتياطي» وأنشئ أول نسخة احتياطية ونزّلها خارج الخادم.'),
        h('li', 'فعّل التحقق بخطوتين لحسابك من «حسابي والأمان».'),
      ),
      h(
        'div.pf-setup-actions.pf-center',
        button(loggedIn ? 'الدخول إلى المنصة' : 'الانتقال إلى صفحة الدخول', { variant: 'primary', icon: 'arrowLeft', href: loggedIn ? '/app#/integrations' : '/app' }),
      ),
    ),
  );
  document.title = 'تم الإعداد — منصة الدعم القانوني';
}

function renderAlreadyDone() {
  mount(
    root,
    h(
      'div.pf-setup-card.pf-setup-done',
      h('span.pf-done-icon', icon('lock', { size: 36 })),
      h('h1.pf-setup-h1', 'تم إعداد المنصة بالفعل'),
      h('p.pf-setup-intro', 'معالج الإعداد يعمل مرة واحدة فقط. ادخل إلى المنصة بحساب مدير النظام. إذا فقدت كلمة المرور، يمكن لمسؤول الخادم إعادة تعيينها بالأمر: npm run admin'),
      h('div.pf-setup-actions.pf-center', button('الدخول إلى المنصة', { variant: 'primary', href: '/app' })),
    ),
  );
}

// ───────── التشغيل ─────────

async function start() {
  takeTokenFromUrl();
  try {
    info = await api.get('/setup/status');
  } catch (err) {
    if (err.status === 404) return renderAlreadyDone();
    mount(root, alertBox(errorMessage(err), 'danger', { title: 'تعذر تحميل معالج الإعداد' }), h('p', button('إعادة المحاولة', { icon: 'refresh', onClick: () => start() })));
    return;
  }
  liveEl = h('p.sr-only', { 'aria-live': 'polite' });
  stepperEl = h(
    'ol.pf-stepper',
    STEPS.map((s, i) => h('li', h('span.pf-step-num', { 'aria-hidden': 'true' }, String(i + 1)), h('span.pf-step-label', s.title))),
  );
  const card = h(
    'div.pf-setup-card',
    h(
      'div.pf-setup-head',
      h('h1.pf-setup-h1', 'إعداد منصة الدعم القانوني'),
      h('p.pf-setup-sub', `الإصدار ${info.version || ''} — خمس خطوات قصيرة لتجهيز المنصة للعمل.`),
    ),
    h('nav', { 'aria-label': 'خطوات الإعداد' }, stepperEl),
    liveEl,
    tokenPanel(),
    orgPanel(),
    adminPanel(),
    integrationsPanel(),
    reviewPanel(),
  );
  mount(root, card);
  goTo(0, { focus: false });
  if (token) {
    // تحقق تلقائي إذا جاء الرمز في الرابط
    const status = panels.token.querySelector('.pf-setup-status');
    mount(status, loading('جارٍ التحقق من الرمز…'));
    try {
      await api.post('/setup/verify', { token });
      mount(status);
      goTo(1, { focus: false });
    } catch (err) {
      if (err.status === 404) return renderAlreadyDone();
      mount(status, alertBox(errorMessage(err), 'danger'));
    }
  }
}

start();
