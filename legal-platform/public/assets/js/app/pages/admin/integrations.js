// التكاملات: واتساب للأعمال (WhatsApp Cloud API) والذكاء الاصطناعي (Claude) — (الإصدار 9 — وحدة platform)
// • لكل حقل: مصدره (متغيرات البيئة / لوحة الإدارة / افتراضي). الأسرار لا تُعرض أبدًا بعد حفظها (آخر 4 خانات فقط).
// • قيمة متغير البيئة تتقدم دائمًا على القيمة المحفوظة من هنا.
// • «اختبار الاتصال» يستدعي اختبار كل خدمة على الخادم ويُسجَّل في سجل الأمان.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, dateTime, relative, duration } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  badge,
  button,
  asyncButton,
  alertBox,
  formDialog,
  toast,
  icon,
  copyButton,
  codeTag,
  ltr,
  errorState,
  errorMessage,
} from '../../../lib/ui.js';

const SOURCE_TONE = { env: 'info', db: 'success', default: 'neutral' };
const ICONS = { whatsapp: 'whatsapp', anthropic: 'sparkle' };
const AR_RE = /[؀-ۿ]/;

// ── اتجاه النص المختلط ──
// أسماء القوائم الإنجليزية تُعزل (LRI…PDI) حتى تتبع الأسهم «←» بينها اتجاه الفقرة العربية فيُقرأ المسار من اليمين:
// «Business Settings ← Users ← System Users» بدل أن ينقلب ترتيبه داخل سطر عربي.
const LRI = '⁦';
const PDI = '⁩';
const en = (s) => `${LRI}${s}${PDI}`;
const menu = (...parts) => parts.map(en).join(' ← ');

/** «واتساب للأعمال (WhatsApp Cloud API)» ← الجزء بين القوسين معزول باتجاهه حتى لا تنقلب الأقواس عند التفاف السطر */
function bidiTitle(text) {
  const m = /^(.*?)\s*(\([^()]*\))\s*$/.exec(String(text || ''));
  if (!m) return text;
  return h('span', m[1], ' ', h('bdi', { dir: AR_RE.test(m[2]) ? 'rtl' : 'ltr' }, m[2]));
}

function sourceBadge(source) {
  if (!source) return badge('غير مضبوط', 'muted');
  return badge(label('integration_source', source), SOURCE_TONE[source] || 'neutral', { title: label('integration_source', source) });
}

function randomSecret(len = 32) {
  const bytes = new Uint8Array(len);
  window.crypto.getRandomValues(bytes);
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

function valueCell(f) {
  if (!f.set) return h('span.muted', 'غير مضبوط');
  if (f.secret) return h('span.pf-secret', { dir: 'ltr', title: 'القيمة السرية لا تُعرض؛ تظهر آخر أربع خانات فقط' }, icon('lock', { size: 14 }), ' ', f.hint || '••••');
  return ltr(f.value);
}

/** «رمز الوصول الدائم (System User Token)» ← العربي في سطر والمصطلح الإنجليزي في سطر LTR مستقل (يمنع انقلاب الأقواس) */
function fieldLabel(text) {
  const m = /^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/.exec(String(text || ''));
  if (!m) return h('span', text);
  return h('span', h('span', m[1]), h('span.pf-field-en', { dir: 'ltr' }, m[2]));
}

function fieldList(item) {
  return h(
    'ul.pf-fields',
    item.fields.map((f) =>
      h(
        'li.pf-field',
        h('div.pf-field-label', fieldLabel(f.label)),
        h('div.pf-field-value', valueCell(f)),
        h('div.pf-field-meta', f.source ? sourceBadge(f.source) : null, f.env ? codeTag(f.env, { className: 'pf-env' }) : null),
      ),
    ),
  );
}

/** مدة قصيرة: «أقل من ثانية»، «2.4 ثانية»، أو بالدقائق لما هو أطول */
function elapsed(ms) {
  const n = Number(ms) || 0;
  if (n < 1000) return 'أقل من ثانية';
  if (n < 60000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')} ثانية`;
  return duration(n);
}

function testResultBox(t) {
  if (!t) return h('p.pf-muted', icon('info', { size: 16 }), ' لم يُختبر الاتصال بعد.');
  const when = t.tested_at ? `${relative(t.tested_at)}${t.tested_by_name ? ` — ${t.tested_by_name}` : ''}` : '';
  const took = t.duration_ms == null ? '' : `، استغرق ${elapsed(t.duration_ms)}`;
  return alertBox(
    h('span', t.message || (t.ok ? 'نجح الاتصال' : 'فشل الاتصال'), when ? h('span.pf-muted', ` (${when}${took})`) : null),
    t.ok ? 'success' : 'danger',
    { title: t.ok ? 'آخر اختبار: ناجح' : 'آخر اختبار: فاشل' },
  );
}

function keyAlert(data) {
  if (data.key_source === 'ephemeral') {
    return alertBox(
      'لا يوجد مفتاح تشفير دائم: أي أسرار تحفظها من هذه الصفحة ستضيع عند إعادة تشغيل الخادم. اضبط متغير البيئة APP_SECRET (32 حرفًا عشوائيًا على الأقل) ثم أعد التشغيل وأدخل الأسرار من جديد.',
      'danger',
      { title: 'مفتاح التشفير مؤقت', icon: 'alert' },
    );
  }
  if (data.key_source === 'file') {
    return alertBox(
      h(
        'span',
        'الأسرار مشفرة بمفتاح محفوظ في الملف ',
        codeTag(data.key_file || 'data/.secret-key'),
        '. احفظ هذا الملف مع كل نسخة احتياطية لقاعدة البيانات؛ فبدونه لا يمكن فك تشفير الأسرار بعد نقل المنصة أو استعادتها. البديل الأفضل: ضبط APP_SECRET في متغيرات البيئة.',
      ),
      'warning',
      { title: 'انسخ مفتاح التشفير احتياطيًا', icon: 'lock' },
    );
  }
  return alertBox('الأسرار مشفرة (AES-256-GCM) بمفتاح من متغير البيئة APP_SECRET خارج قاعدة البيانات.', 'success', { title: 'مفتاح التشفير', icon: 'shieldCheck' });
}

// ───────── نافذة التعديل ─────────

async function editIntegration(item, onSaved) {
  const initial = {};
  const fields = [];
  for (const f of item.fields) {
    if (f.source === 'env') {
      fields.push({
        name: f.key,
        label: f.label,
        type: 'static',
        value: f.secret ? f.hint || 'مضبوط' : f.value,
        render: (x) => h('span', ltr(x), h('span.pf-muted', ` — من متغير البيئة ${f.env}؛ عدّله على الخادم ثم أعد التشغيل`)),
      });
      continue;
    }
    if (f.secret) {
      fields.push({
        name: f.key,
        label: f.label,
        type: 'password',
        autocomplete: 'new-password',
        placeholder: f.set ? `محفوظ (${f.hint || '••••'}) — اتركه فارغًا للإبقاء عليه` : 'غير مضبوط',
        full: true,
      });
      initial[f.key] = '';
    } else {
      const current = f.source === 'db' ? f.value || '' : '';
      fields.push({ name: f.key, label: f.label, type: 'text', ltr: true, autocomplete: 'off', placeholder: f.source === 'default' ? `الافتراضي: ${f.value}` : '' });
      initial[f.key] = current;
    }
  }
  const clearable = item.fields.filter((f) => f.source === 'db');
  if (clearable.length) {
    fields.push({
      name: '__clear',
      label: 'حذف قيم محفوظة',
      type: 'checkboxes',
      options: clearable.map((f) => ({ value: f.key, label: f.label })),
      hint: 'تُحذف القيمة المحفوظة في لوحة الإدارة (وتعود القيمة الافتراضية إن وجدت).',
    });
  }
  const values = { ...initial, __clear: [] };
  const res = await formDialog({
    title: h('span', 'تعديل إعدادات ', bidiTitle(item.label)),
    size: 'lg',
    intro: 'الحقول السرية لا تُعرض بعد حفظها. اكتب قيمة جديدة فقط إذا أردت استبدالها.',
    fields,
    values,
    submitLabel: 'حفظ الإعدادات',
    setup: (f) => {
      if (item.name !== 'whatsapp') return;
      const c = f.control('verify_token');
      if (!c || !c.input || !c.wrap) return;
      c.wrap.append(
        h(
          'div.pf-inline-actions',
          button('توليد رمز عشوائي', {
            size: 'sm',
            icon: 'refresh',
            onClick: () => {
              c.set(randomSecret(32));
              c.input.type = 'text';
              toast('تم توليد رمز تحقق؛ انسخه الآن لتضعه في إعدادات Webhook على ميتا قبل الحفظ.', 'info', 6000);
            },
          }),
        ),
      );
    },
    onSubmit: async (vals) => {
      const patch = {};
      for (const f of item.fields) {
        if (f.source === 'env' || !(f.key in vals)) continue;
        const v = typeof vals[f.key] === 'string' ? vals[f.key].trim() : vals[f.key];
        if (f.secret) {
          if (v) patch[f.key] = v;
        } else if ((v || '') !== (initial[f.key] || '')) patch[f.key] = v || '';
      }
      for (const k of vals.__clear || []) patch[k] = '';
      if (!Object.keys(patch).length) throw new Error('لم تغيّر أي قيمة.');
      return api.put(`/admin/integrations/${item.name}`, { values: patch });
    },
  });
  if (!res) return;
  toast('تم حفظ الإعدادات بأمان', 'success');
  for (const w of res.warnings || []) toast(w, 'warning', 8000);
  onSaved();
}

// ───────── بطاقة كل تكامل ─────────

function integrationCard(item, data, reload) {
  const resultSlot = h('div.pf-test-result', testResultBox(item.last_test));
  const test = asyncButton(
    'اختبار الاتصال',
    async () => {
      try {
        const r = await api.post(`/admin/integrations/${item.name}/test`);
        mount(resultSlot, testResultBox({ ...r, tested_by_name: null }));
        toast(r.message || (r.ok ? 'نجح الاتصال' : 'فشل الاتصال'), r.ok ? 'success' : 'danger');
      } catch (err) {
        if (err.status === 501) {
          mount(resultSlot, alertBox(errorMessage(err), 'info', { title: 'اختبار الاتصال غير متاح' }));
          return;
        }
        throw err;
      }
    },
    { variant: 'secondary', icon: 'zap', size: 'sm' },
  );
  const edit = button('تعديل', { variant: 'primary', icon: 'edit', size: 'sm', onClick: () => editIntegration(item, reload) });

  const statusBadges = h(
    'div.pf-badges',
    item.configured ? badge('مضبوط', 'success', { icon: 'check' }) : badge('غير مضبوط', 'warning', { icon: 'alert' }),
    item.runtime ? badge(item.runtime.label, item.runtime.live ? 'info' : 'muted') : null,
    item.updated_at ? h('span.pf-muted', `آخر تعديل ${relative(item.updated_at)}${item.updated_by_name ? ` — ${item.updated_by_name}` : ''}`) : null,
  );

  const extras = [];
  if (item.undecryptable) {
    extras.push(alertBox('تغيّر مفتاح التشفير بعد حفظ هذه الأسرار فلم يعد ممكنًا فك تشفيرها. أعد إدخال القيم السرية.', 'danger', { title: 'تعذر فك تشفير القيم المحفوظة' }));
  }
  if (item.name === 'whatsapp') {
    if (item.configured && !item.app_secret_set) {
      extras.push(alertBox('بدون «سر التطبيق» يرفض النظام كل رسائل Webhook الواردة من ميتا حمايةً من الرسائل المزورة.', 'danger', { title: 'سر التطبيق غير مضبوط' }));
    }
    extras.push(
      h(
        'div.pf-webhook',
        h('strong', 'رابط Webhook (Callback URL)'),
        h('div.pf-webhook-row', h('code.pf-code', { dir: 'ltr' }, data.webhook_url), copyButton(data.webhook_url, 'نسخ')),
        !data.public_base_url
          ? h('p.pf-muted', icon('info', { size: 14 }), ' الرابط مبني من عنوان المتصفح الحالي. اضبط PUBLIC_BASE_URL على الخادم ليكون ثابتًا (ويجب أن يبدأ بـ https لتقبله ميتا).')
          : null,
        h(
          'p.pf-muted',
          icon('shield', { size: 14 }),
          item.verify_token_set
            ? ' رمز التحقق (Verify token) مضبوط. اكتب نفس الرمز في خانة Verify token على ميتا، واشترك في حقل messages. لا يُعرض الرمز هنا؛ إن نسيته فولّد رمزًا جديدًا من «تعديل» وضعه في ميتا.'
            : ' لم يُضبط رمز التحقق بعد: اضغط «تعديل» ثم «توليد رمز عشوائي»، وانسخه إلى خانة Verify token في إعدادات Webhook على ميتا قبل الحفظ.',
        ),
      ),
    );
  }

  return card({
    title: bidiTitle(item.label),
    icon: ICONS[item.name] || 'link',
    className: 'pf-integration',
    actions: h('div.pf-card-actions', test, edit),
    body: h('div.stack', statusBadges, extras, fieldList(item), h('div', h('h3.pf-subtitle', 'نتيجة اختبار الاتصال'), resultSlot)),
  });
}

// ───────── الأدلة المختصرة ─────────

function guide(title, steps, open = false) {
  return h('details.pf-guide', { open }, h('summary', icon('book', { size: 18 }), h('span', bidiTitle(title))), h('ol.pf-guide-steps', steps.map((s) => h('li', s))));
}

function guides(data) {
  return card({
    title: 'دليل الربط خطوة بخطوة',
    icon: 'book',
    body: h(
      'div.stack',
      guide('ربط واتساب للأعمال (Meta WhatsApp Cloud API)', [
        `أنشئ حساب أعمال على ${en('business.facebook.com')} باسم المؤسسة، ويُفضّل توثيق المؤسسة (${en('Business Verification')}) لرفع حدود الإرسال.`,
        `من ${menu('developers.facebook.com', 'My Apps', 'Create App')} اختر نوع «Business» ثم أضف منتج WhatsApp إلى التطبيق.`,
        `من ${menu('WhatsApp', 'API Setup')} أضف رقم هاتف المؤسسة وتحقق منه برسالة أو مكالمة (يجب ألا يكون الرقم مفعلًا على تطبيق واتساب العادي).`,
        `انسخ من نفس الصفحة «${en('Phone number ID')}» و«${en('WhatsApp Business Account ID')}» إلى الحقلين المقابلين هنا.`,
        `من ${menu('Business Settings', 'Users', 'System Users')} أنشئ مستخدم نظام بدور Admin، وامنحه التطبيق وحساب واتساب، ثم «${en('Generate new token')}» بلا تاريخ انتهاء مع صلاحيتي ${en('whatsapp_business_messaging')} و${en('whatsapp_business_management')}. هذا هو «رمز الوصول الدائم».`,
        `من ${menu('App Settings', 'Basic')} انسخ «${en('App Secret')}» إلى حقل «سر التطبيق».`,
        h(
          'span',
          `من ${menu('WhatsApp', 'Configuration', 'Webhook')} ضع الرابط `,
          h('code.pf-code', { dir: 'ltr' }, data.webhook_url),
          ` ورمز التحقق نفسه المحفوظ هنا، ثم اضغط «${en('Verify and save')}» واشترك (${en('Subscribe')}) في الحقل ${en('messages')}.`,
        ),
        `من ${menu('WhatsApp Manager', 'Message Templates')} أنشئ قالبًا من فئة ${en('Utility')} باسم ${en('case_update')} بالعربية ونصه متغير واحد ${en('{{1}}')} (تستخدمه المنصة للتذكيرات والردود خارج نافذة الـ 24 ساعة)، وقالبًا من فئة ${en('Authentication')} باسم ${en('portal_login_code')} لرموز دخول المستفيدين إلى بوابتهم (OTP).`,
        'احفظ القيم من زر «تعديل» في بطاقة واتساب، ثم اضغط «اختبار الاتصال»، وأرسل رسالة تجريبية من هاتف إلى رقم المؤسسة لتظهر في صندوق الوارد.',
      ], true),
      guide('الحصول على مفتاح Claude من Anthropic', [
        `ادخل ${en('console.anthropic.com')} وأنشئ حسابًا باسم المؤسسة (أو ادخل بحسابها الحالي).`,
        `من ${menu('Settings', 'Billing')} أضف وسيلة دفع أو رصيدًا مسبقًا، ومن ${menu('Settings', 'Limits')} اضبط حدًا شهريًا للإنفاق يناسب ميزانية البرنامج.`,
        `من ${menu('Settings', 'API Keys')} اضغط «${en('Create Key')}»، وسمِّه مثل ${en('beyoot-legal-production')}، ثم انسخه فورًا (يظهر مرة واحدة ويبدأ بـ ${en('sk-ant-')}).`,
        'الصق المفتاح في حقل «مفتاح Anthropic API» من زر «تعديل» في بطاقة Claude، ويمكنك ضبط «سقف الإنفاق الشهري» هنا أيضًا.',
        'اضغط «اختبار الاتصال». عند أي تعذر في الخدمة تعود المنصة تلقائيًا إلى المحلل المحلي دون توقف العمل.',
        'إذا تسرب المفتاح: احذفه فورًا من console.anthropic.com وأنشئ مفتاحًا جديدًا وأدخله هنا.',
      ]),
    ),
  });
}

// ───────── الصفحة ─────────

export default async function render() {
  const host = h('div.page.pf-page');
  async function load() {
    let data;
    try {
      data = await api.get('/admin/integrations');
    } catch (err) {
      mount(host, pageHeader({ title: 'التكاملات' }), errorState(err, load));
      return;
    }
    mount(
      host,
      pageHeader({
        title: 'التكاملات',
        subtitle: 'ربط واتساب للأعمال والذكاء الاصطناعي (Claude). تُحفظ الأسرار مشفرة ولا تُعرض بعد حفظها، وقيم متغيرات البيئة تتقدم على ما يُحفظ هنا.',
        actions: button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: load }),
      }),
      h(
        'div.stack',
        keyAlert(data),
        h('div.pf-integrations-grid', data.items.map((item) => integrationCard(item, data, load))),
        guides(data),
        h(
          'p.pf-muted',
          icon('info', { size: 14 }),
          ' كل حفظ أو اختبار يُسجَّل في ',
          h('a', { href: '#/audit' }, 'سجل الأمان'),
          '. آخر تحديث للصفحة: ',
          dateTime(new Date().toISOString()),
        ),
      ),
    );
  }
  await load();
  return frag(host);
}
