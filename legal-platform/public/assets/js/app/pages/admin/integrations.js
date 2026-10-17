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
  confirmDialog,
} from '../../../lib/ui.js';
import { emailSettingsCard } from '../../components/email-settings.js'; // v10 b2b-staff (STF-9، U10-S24)
import { tagged } from '../../../lib/h.js'; // v12 media (MD-6): رموز بطاقة تحويل الصوت INT-01…INT-17

const SOURCE_TONE = { env: 'info', db: 'success', default: 'neutral' };
const ICONS = { whatsapp: 'whatsapp', anthropic: 'sparkle' };
const AR_RE = /[؀-ۿ]/;

// v11 segment-staff (ST-6، r2 S3/S4، L11-45): رقم الأفراد والشركات ووضع الرقم الأساسي
export const PAID_VERIFIED_TEXT = 'رقم الأفراد والشركات: تم التحقق';
export const PAID_UNVERIFIED_TEXT = 'رقم الأفراد والشركات: لم يُتحقق بعد — اضغطوا اختبار الاتصال';
export const PAID_ON_MAIN_TEXT = 'استخدام الرقم الأساسي للأفراد والشركات عند عدم وجود رقم مخصص';
export const PAID_GUIDE_TEXT = 'أضيفوا الرقم الثاني من WhatsApp Manager في نفس حساب واتساب للأعمال، ثم الصقوا معرّفه هنا. الرد يخرج دائمًا من الرقم الذي كتب عليه العميل.';
export const MODE_CONFIRM_TITLE = 'تغيير وضع رقم واتساب الأساسي';

/**
 * حفظ تكامل مع تأكيد تغيير الوضع (r2 S3): 409 mode_change_confirm ← نافذة تأكيد بنص الخادم ← إعادة الإرسال بـ confirm:true.
 * الإلغاء يُبقي نافذة التعديل مفتوحة برسالة واضحة. ask قابل للاستبدال في الاختبارات.
 */
export async function saveIntegrationValues(name, patch, { ask = (message) => confirmDialog({ title: MODE_CONFIRM_TITLE, message, confirmLabel: 'تأكيد التغيير', tag: 'INT-18' }) } = {}) {
  try {
    return await api.put(`/admin/integrations/${name}`, { values: patch });
  } catch (err) {
    if (!(err && err.status === 409 && err.code === 'mode_change_confirm')) throw err;
    if (!(await ask(errorMessage(err)))) throw new Error('لم يُحفظ شيء — بقي وضع الرقم الأساسي كما هو.');
    return api.put(`/admin/integrations/${name}`, { values: patch, confirm: true });
  }
}

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
  // قيمة من قائمة محددة: التسمية العربية أولًا والقيمة الخام كرمز صغير (كما تُكتب في متغير البيئة)
  if (f.value_label) return h('span.pf-value-label', f.value_label, ' ', codeTag(f.value, { className: 'pf-raw' }));
  // معرّف تقني (اسم النموذج): رمز لاتيني لا يلتف في منتصفه
  if (f.code) return codeTag(f.value, { className: 'pf-nowrap' });
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
    { title: t.ok ? 'آخر اختبار: ناجح' : 'آخر اختبار: فاشل', tag: 'INT-19' },
  );
}

function keyAlert(data) {
  if (data.key_source === 'ephemeral') {
    return alertBox(
      'لا يوجد مفتاح تشفير دائم: أي أسرار تحفظها من هذه الصفحة ستضيع عند إعادة تشغيل الخادم. اضبط متغير البيئة APP_SECRET (32 حرفًا عشوائيًا على الأقل) ثم أعد التشغيل وأدخل الأسرار من جديد.',
      'danger',
      { title: 'مفتاح التشفير مؤقت', icon: 'alert', tag: 'INT-20' },
    );
  }
  if (data.key_source === 'file') {
    return alertBox(
      h(
        'span',
        'الأسرار مشفرة بمفتاح محفوظ في الملف ',
        codeTag(data.key_file || '.secret-key'),
        '. احفظ هذا الملف مع كل نسخة احتياطية لقاعدة البيانات؛ فبدونه لا يمكن فك تشفير الأسرار بعد نقل المنصة أو استعادتها. البديل الأفضل: ضبط APP_SECRET في متغيرات البيئة.',
      ),
      'warning',
      { title: 'انسخ مفتاح التشفير احتياطيًا', icon: 'lock', tag: 'INT-21' },
    );
  }
  return alertBox('الأسرار مشفرة (AES-256-GCM) بمفتاح من متغير البيئة APP_SECRET خارج قاعدة البيانات.', 'success', { title: 'مفتاح التشفير', icon: 'shieldCheck', tag: 'INT-22' });
}

// ───────── نافذة التعديل ─────────

// v12 tags (TG-6): رمز كل حقل في نافذة التعديل العامة (أوصاف الحقول من الخادم؛ المفتاح نفسه قد يتكرر بين تكاملين)
const EDIT_TAGS = {
  whatsapp: {
    token: { tag: 'INT-68' },
    phone_number_id: { tag: 'INT-69' },
    waba_id: { tag: 'INT-70' },
    app_secret: { tag: 'INT-71' },
    verify_token: { tag: 'INT-72' },
    number: { tag: 'INT-73' },
    api_version: { tag: 'INT-74' },
    segment: { tag: 'INT-75' },
    paid_phone_number_id: { tag: 'INT-76' },
    paid_number: { tag: 'INT-77' },
    __clear: { tag: 'INT-78' },
  },
  anthropic: {
    api_key: { tag: 'INT-79' },
    model: { tag: 'INT-80' },
    effort: { tag: 'INT-81' },
    provider: { tag: 'INT-82' },
    monthly_budget_usd: { tag: 'INT-83' },
    __clear: { tag: 'INT-84' },
  },
  email: {
    provider: { tag: 'INT-85' },
    smtp_host: { tag: 'INT-86' },
    smtp_port: { tag: 'INT-87' },
    smtp_security: { tag: 'INT-88' },
    smtp_user: { tag: 'INT-89' },
    smtp_password: { tag: 'INT-90' },
    from_address: { tag: 'INT-91' },
    from_name: { tag: 'INT-92' },
    __clear: { tag: 'INT-93' },
  },
};
const editTag = (item, key) => EDIT_TAGS[item.name]?.[key]?.tag;

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
        tag: editTag(item, f.key),
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
        tag: editTag(item, f.key),
      });
      initial[f.key] = '';
    } else if (Array.isArray(f.options) && f.options.length) {
      // قيمة من قائمة محددة: اختيار بالتسميات العربية بدل كتابة القيمة الإنجليزية
      const current = f.source === 'db' ? f.value || '' : '';
      const def = f.source === 'default' ? f.options.find((o) => o.value === f.value) : null;
      fields.push({
        name: f.key,
        label: f.label,
        type: 'select',
        placeholder: false,
        options: [{ value: '', label: def ? `الافتراضي: ${def.label}` : 'الافتراضي' }, ...f.options.map((o) => ({ value: o.value, label: o.label }))],
        tag: editTag(item, f.key),
      });
      initial[f.key] = current;
    } else {
      const current = f.source === 'db' ? f.value || '' : '';
      fields.push({ name: f.key, label: f.label, type: 'text', ltr: true, autocomplete: 'off', placeholder: f.source === 'default' ? `الافتراضي: ${f.value}` : '', tag: editTag(item, f.key) });
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
      tag: editTag(item, '__clear'),
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
            tag: 'INT-23',
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
      return saveIntegrationValues(item.name, patch); // v11 segment-staff: تأكيد تغيير وضع الرقم (409 mode_change_confirm)
    },
    tag: 'INT-24',
  });
  if (!res) return;
  toast('تم حفظ الإعدادات بأمان', 'success');
  for (const w of res.warnings || []) toast(w, 'warning', 8000);
  onSaved();
}

// ───────── بطاقة كل تكامل ─────────

/**
 * v11 segment-staff (ST-6): قسم «رقم الأفراد والشركات» داخل بطاقة واتساب — حالة التحقق (paid_verified_at)، ومفتاح
 * wa_paid_on_main (إعداد يُحفظ عبر PATCH /api/admin/settings فورًا)، وسطر الإرشاد.
 */
export function paidLineSection(item, settings = {}) {
  const pid = (item.fields || []).find((f) => f.key === 'paid_phone_number_id');
  const hasPaid = Boolean(pid && pid.set && pid.value);
  const state = hasPaid
    ? item.paid_verified_at
      ? h('div.pf-paid-state', { dataset: { verified: 'true' } }, alertBox(PAID_VERIFIED_TEXT, 'success', { icon: 'checkCircle', tag: 'INT-25' }))
      : h('div.pf-paid-state', { dataset: { verified: 'false' } }, alertBox(PAID_UNVERIFIED_TEXT, 'warning', { icon: 'alert', tag: 'INT-26' }))
    : null;
  const cb = h('input', { type: 'checkbox', checked: settings.wa_paid_on_main !== false, tag: 'INT-27' });
  cb.addEventListener('change', async () => {
    const want = cb.checked;
    cb.disabled = true;
    try {
      await api.patch('/admin/settings', { wa_paid_on_main: want });
      toast(want ? 'يستخدم الأفراد والشركات الرقم الأساسي حين لا يوجد رقم مخصص' : 'لن يظهر واتساب للأفراد والشركات إلا برقم مخصص متحقق منه', 'success', 5000);
    } catch (err) {
      cb.checked = !want;
      toast(errorMessage(err), 'danger');
    } finally {
      cb.disabled = false;
    }
  });
  return h(
    'section.pf-paid-line',
    { 'aria-label': 'رقم الأفراد والشركات', tag: 'INT-28' },
    h('h3.pf-subtitle', { tag: 'INT-29' }, 'رقم الأفراد والشركات'),
    state,
    h('label.check.check-single.pf-paid-on-main', cb, h('span', PAID_ON_MAIN_TEXT)),
    h('p.pf-muted', icon('info', { size: 14 }), ' ', PAID_GUIDE_TEXT),
  );
}

function integrationCard(item, data, reload, settings = {}) {
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
          mount(resultSlot, alertBox(errorMessage(err), 'info', { title: 'اختبار الاتصال غير متاح', tag: 'INT-30' }));
          return;
        }
        throw err;
      }
    },
    { variant: 'secondary', icon: 'zap', size: 'sm', tag: 'INT-31' },
  );
  const edit = button('تعديل', { variant: 'primary', icon: 'edit', size: 'sm', onClick: () => editIntegration(item, reload), tag: 'INT-32' });

  const statusBadges = h(
    'div.pf-badges',
    item.configured ? badge('مضبوط', 'success', { icon: 'check' }) : badge('غير مضبوط', 'warning', { icon: 'alert' }),
    item.runtime ? badge(item.runtime.label, item.runtime.live ? 'info' : 'muted') : null,
    item.updated_at ? h('span.pf-muted', `آخر تعديل ${relative(item.updated_at)}${item.updated_by_name ? ` — ${item.updated_by_name}` : ''}`) : null,
  );

  const extras = [];
  if (item.undecryptable) {
    extras.push(alertBox('تغيّر مفتاح التشفير بعد حفظ هذه الأسرار فلم يعد ممكنًا فك تشفيرها. أعد إدخال القيم السرية.', 'danger', { title: 'تعذر فك تشفير القيم المحفوظة', tag: 'INT-33' }));
  }
  if (item.name === 'whatsapp') {
    if (item.configured && !item.app_secret_set) {
      extras.push(alertBox('بدون «سر التطبيق» يرفض النظام كل رسائل Webhook الواردة من ميتا حمايةً من الرسائل المزورة.', 'danger', { title: 'سر التطبيق غير مضبوط', tag: 'INT-34' }));
    }
    extras.push(
      h(
        'div.pf-webhook',
        h('strong', 'رابط Webhook (Callback URL)'),
        h('div.pf-webhook-row', h('code.pf-code', { dir: 'ltr' }, data.webhook_url), copyButton(data.webhook_url, 'نسخ', { tag: 'INT-35' })),
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
    extras.push(paidLineSection(item, settings)); // v11 segment-staff (ST-6)
  }

  return card({
    title: bidiTitle(item.label),
    icon: ICONS[item.name] || 'link',
    className: 'pf-integration',
    actions: h('div.pf-card-actions', test, edit),
    body: h('div.stack', statusBadges, extras, fieldList(item), h('div', h('h3.pf-subtitle', { tag: 'INT-36' }, 'نتيجة اختبار الاتصال'), resultSlot)),
    titleTag: 'INT-37',
    tag: 'INT-38',
  });
}

// ───────── v12 media (MD-6، M12-06، L12-62، L12-71): بطاقة «تحويل الرسائل الصوتية إلى نص» ─────────
export const STT_VENDOR_REQUIRED = 'اكتب اسم المزوّد وأكّد شروطه قبل الحفظ.';
export const STT_KEY_NOTE = 'تغيير المزوّد أو العنوان يمسح المفتاح المحفوظ.';
const STT_PRESETS = [
  { id: 'openai', label: 'OpenAI', provider: 'openai_compatible', base_url: 'https://api.openai.com', model: 'gpt-4o-transcribe', hosting: 'third_party', vendor_name: 'OpenAI', price_per_minute_usd: '0.006' },
  { id: 'groq', label: 'Groq', provider: 'openai_compatible', base_url: 'https://api.groq.com/openai', model: 'whisper-large-v3', hosting: 'third_party', vendor_name: 'Groq', price_per_minute_usd: '0.00185' },
  { id: 'own_whisper', label: 'خادم Whisper خاص بالمكتب', provider: 'openai_compatible', base_url: 'http://127.0.0.1:8000', model: 'Systran/faster-whisper-large-v3', hosting: 'own_server', vendor_name: '', price_per_minute_usd: '0' },
  { id: 'google', label: 'Google Speech-to-Text', provider: 'google', base_url: '', model: '', hosting: 'third_party', vendor_name: 'Google', price_per_minute_usd: '0.016' },
];
const STT_TEST_TEXT = {
  auth: 'رفض المزوّد المفتاح',
  timeout: 'انتهت المهلة دون رد',
  network: 'تعذر الاتصال بالمزوّد',
  blocked_host: 'عنوان الخدمة غير مسموح',
  // v12 gate fixer-server (JR-11): العلاج لخادم Whisper على الجهاز نفسه
  blocked_local: 'عنوان على الجهاز نفسه غير مسموح افتراضيًا. شغّلوا المنصة بـ STT_ALLOW_LOCAL=1 لخادم على الجهاز نفسه، أو اكتبوا عنوانه في شبكة المكتب',
  http: 'رفض المزوّد الطلب',
  off: 'التحويل متوقف',
  not_configured: 'الإعدادات ناقصة',
  too_big: 'المقطع أكبر من المسموح',
  no_clip: 'مقطع الاختبار غير موجود على الخادم',
  env_key_host: 'المفتاح مضبوط من الخادم؛ غيّر العنوان من الخادم أيضًا',
};
const sttVal = (item) => Object.fromEntries((item.fields || []).map((f) => [f.key, f]));

/** هل التحويل مضبوط؟ (نفس شرط الخادم: المزوّد، العنوان أو المفتاح، واسم المزوّد وتأكيد شروطه للجهة الخارجية) */
export function sttConfigured(item) {
  const v = sttVal(item);
  const p = v.provider?.value || 'off';
  if (p === 'off') return false;
  const third = (v.hosting?.value || 'third_party') !== 'own_server';
  if (p === 'google' && !v.api_key?.set) return false;
  if (p === 'openai_compatible' && !v.base_url?.value) return false;
  if (third && (!v.api_key?.set || !v.vendor_name?.value || v.no_training_attested?.value !== 'yes')) return false;
  return true;
}

function sttResultBox(r) {
  if (!r) return h('p.pf-muted', icon('info', { size: 16 }), ' لم يُختبر الاتصال بعد.');
  if (r.message) return testResultBox(r);
  const text = r.ok ? `نجح الاتصال (${r.latency_ms} مللي ثانية)` : `فشل الاتصال: ${STT_TEST_TEXT[r.code] || 'تعذر الاختبار'}${r.status && !r.ok ? ` (${r.status})` : ''}`;
  return alertBox(text, r.ok ? 'success' : 'danger', { title: r.ok ? 'آخر اختبار: ناجح' : 'آخر اختبار: فاشل', tag: 'INT-39' });
}

async function editStt(item, onSaved) {
  const v = sttVal(item);
  if (Object.values(v).some((f) => f.source === 'env')) return editIntegration(item, onSaved); // قيم من البيئة: النموذج العام يعرضها ثابتة
  const cur = (k) => (v[k] && v[k].source === 'db' ? v[k].value || '' : '');
  const initial = {
    preset: '',
    provider: cur('provider') || 'off',
    base_url: cur('base_url'),
    api_key: '',
    model: cur('model'),
    language: cur('language'),
    prompt: cur('prompt'),
    hosting: cur('hosting') || 'third_party',
    vendor_name: cur('vendor_name'),
    no_training_attested: v.no_training_attested?.value === 'yes',
    price_per_minute_usd: cur('price_per_minute_usd'),
    monthly_budget_usd: cur('monthly_budget_usd'),
    max_seconds: cur('max_seconds'),
  };
  const opt = (k) => (v[k]?.options || []).map((o) => ({ value: o.value, label: o.label }));
  const def = (k) => (v[k] && v[k].source === 'default' ? `الافتراضي: ${v[k].value}` : '');
  const fields = [
    { name: 'preset', label: 'نوع الخدمة', type: 'select', placeholder: false, options: [{ value: '', label: 'بلا قالب (يدوي)' }, ...STT_PRESETS.map((p) => ({ value: p.id, label: p.label }))], hint: 'يملأ الحقول بقيم الخدمة المختارة، وتبقى قابلة للتعديل.', full: true, tag: 'INT-55' },
    { name: 'provider', label: 'مزوّد التحويل', type: 'select', placeholder: false, options: opt('provider'), tag: 'INT-56' },
    { name: 'hosting', label: 'مكان التشغيل', type: 'select', placeholder: false, options: opt('hosting'), tag: 'INT-57' },
    { name: 'base_url', label: 'عنوان الخدمة', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('base_url'), hint: STT_KEY_NOTE, full: true, tag: 'INT-58' },
    { name: 'api_key', label: 'المفتاح', type: 'password', autocomplete: 'new-password', placeholder: v.api_key?.set ? `محفوظ (${v.api_key.hint || '••••'}) — اتركه فارغًا للإبقاء عليه` : 'غير مضبوط', full: true, tag: 'INT-59' },
    { name: 'vendor_name', label: 'اسم المزوّد', type: 'text', maxLength: 60, autocomplete: 'off', hint: 'مطلوب للجهة الخارجية، ويظهر في سياسة الخصوصية.', tag: 'INT-60' },
    { name: 'model', label: 'النموذج', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('model'), tag: 'INT-61' },
    { name: 'language', label: 'اللغة', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('language'), tag: 'INT-62' },
    { name: 'no_training_attested', label: 'شروط المزوّد تمنع استخدام التسجيلات في التدريب، ومدة الاحتفاظ بها لا تزيد على 30 يومًا', type: 'checkbox', full: true, tag: 'INT-63' },
    { name: 'prompt', label: 'توجيه النموذج', type: 'textarea', rows: 3, maxLength: 1000, placeholder: def('prompt'), tag: 'INT-64' },
    { name: 'price_per_minute_usd', label: 'السعر لكل دقيقة (دولار)', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('price_per_minute_usd'), tag: 'INT-65' },
    { name: 'monthly_budget_usd', label: 'حد الإنفاق الشهري (دولار)', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('monthly_budget_usd'), tag: 'INT-66' },
    { name: 'max_seconds', label: 'أقصى مدة للرسالة (ثانية)', type: 'text', ltr: true, autocomplete: 'off', placeholder: def('max_seconds'), tag: 'INT-67' },
  ];
  const TAGS = { preset: 'INT-06', provider: 'INT-07', base_url: 'INT-08', api_key: 'INT-09', model: 'INT-10', language: 'INT-11', prompt: 'INT-12', hosting: 'INT-13', price_per_minute_usd: 'INT-14', monthly_budget_usd: 'INT-15', vendor_name: 'INT-16', no_training_attested: 'INT-17' };
  const res = await formDialog({
    title: h('span', 'تعديل ', bidiTitle(item.label)),
    size: 'lg',
    intro: 'النص الآلي مسودة يراجعها الفريق قبل الاعتماد عليها. المفتاح لا يُعرض بعد حفظه.',
    fields,
    values: initial,
    submitLabel: 'حفظ الإعدادات',
    setup: (f) => {
      for (const [k, code] of Object.entries(TAGS)) tagged(code, f.control(k)?.wrap);
      const preset = f.control('preset');
      preset?.input?.addEventListener('change', () => {
        const p = STT_PRESETS.find((x) => x.id === preset.get());
        if (!p) return;
        f.setValues({ provider: p.provider, base_url: p.base_url, model: p.model, hosting: p.hosting, vendor_name: p.vendor_name, price_per_minute_usd: p.price_per_minute_usd });
      });
    },
    onSubmit: async (vals, f) => {
      const third = vals.provider !== 'off' && vals.hosting !== 'own_server';
      if (third && (!String(vals.vendor_name || '').trim() || !vals.no_training_attested)) {
        f.setErrors({ vendor_name: STT_VENDOR_REQUIRED });
        throw new Error(STT_VENDOR_REQUIRED);
      }
      const patch = {};
      for (const k of Object.keys(initial)) {
        if (k === 'preset') continue;
        if (k === 'api_key') {
          if (String(vals.api_key || '').trim()) patch.api_key = String(vals.api_key).trim();
          continue;
        }
        const nv = k === 'no_training_attested' ? (vals[k] ? 'yes' : '') : String(vals[k] ?? '').trim();
        const ov = k === 'no_training_attested' ? (initial[k] ? 'yes' : '') : String(initial[k] ?? '').trim();
        if (nv !== ov) patch[k] = nv;
      }
      if (!Object.keys(patch).length) throw new Error('لم تغيّر أي قيمة.');
      return api.put('/admin/integrations/stt', { values: patch });
    },
    tag: 'INT-40',
  });
  if (!res) return;
  toast('تم حفظ إعدادات تحويل الصوت', 'success');
  onSaved();
}

function sttCard(item, reload, settings = {}) {
  const v = sttVal(item);
  const ok = sttConfigured(item);
  const third = (v.hosting?.value || 'third_party') !== 'own_server';
  const resultSlot = tagged('INT-05', h('div.pf-test-result', sttResultBox(item.last_test)));
  const test = tagged(
    'INT-04',
    asyncButton(
      'اختبار الاتصال',
      async () => {
        const r = await api.post('/admin/integrations/stt/test');
        mount(resultSlot, sttResultBox(r));
        toast(r.ok ? 'نجح الاتصال' : `فشل الاتصال: ${STT_TEST_TEXT[r.code] || 'تعذر الاختبار'}`, r.ok ? 'success' : 'danger');
      },
      { variant: 'secondary', icon: 'zap', size: 'sm' },
    ),
  );
  const edit = tagged('INT-03', button('تعديل', { variant: 'primary', icon: 'edit', size: 'sm', onClick: () => editStt(item, reload) }));
  const since = settings.stt_third_party_since;
  const where = (v.provider?.value || 'off') === 'off' ? 'متوقف' : third ? `جهة خارجية${v.vendor_name?.value ? `: ${v.vendor_name.value}` : ''}` : 'خادم المكتب';
  const status = tagged(
    'INT-02',
    h(
      'div.pf-badges',
      ok ? badge('مضبوط', 'success', { icon: 'check' }) : badge('غير مضبوط', 'warning', { icon: 'alert' }),
      h('span.pf-muted', `مكان التشغيل: ${where}`),
      since && third ? h('span.pf-muted', `تحويل الصوت عند جهة خارجية معلن منذ ${dateTime(since)}`) : null,
      item.updated_at ? h('span.pf-muted', `آخر تعديل ${relative(item.updated_at)}${item.updated_by_name ? ` (${item.updated_by_name})` : ''}`) : null,
    ),
  );
  const extras = [];
  if (item.undecryptable) extras.push(alertBox('تغيّر مفتاح التشفير بعد حفظ هذه الأسرار فلم يعد ممكنًا فك تشفيرها. أعد إدخال المفتاح.', 'danger', { title: 'تعذر فك تشفير القيم المحفوظة', tag: 'INT-41' }));
  if (third && (v.provider?.value || 'off') !== 'off' && (!v.vendor_name?.value || v.no_training_attested?.value !== 'yes')) extras.push(alertBox(STT_VENDOR_REQUIRED, 'warning', { tag: 'INT-42' }));
  extras.push(h('p.pf-muted', icon('info', { size: 14 }), ' النص الآلي مسودة للفريق وحده، لا يراه المحامي ولا صاحب الرسالة. طلبات «خيري» لا تُرسل إلى جهة خارجية إلا بإذن من «الإعدادات ← المستندات والصوت».'));
  return tagged(
    'INT-01',
    card({
      title: bidiTitle(item.label),
      icon: 'mic',
      className: 'pf-integration',
      actions: h('div.pf-card-actions', test, edit),
      // توجيه النموذج نص طويل: يُعرض في نافذة التعديل لا في القائمة (سطر «افتراضي / مخصص» فقط)
      body: h(
        'div.stack',
        status,
        extras,
        fieldList({ ...item, fields: (item.fields || []).filter((f) => f.key !== 'prompt') }),
        h('p.pf-muted', `توجيه النموذج: ${v.prompt && v.prompt.source === 'db' ? 'مخصص' : 'الافتراضي'}`),
        h('div', h('h3.pf-subtitle', { tag: 'INT-43' }, 'نتيجة اختبار الاتصال'), resultSlot),
      ),
      titleTag: 'INT-44',
    }),
  );
}

// ───────── الأدلة المختصرة ─────────

function guide(title, steps, open = false) {
  return h('details.pf-guide', { open, tag: 'INT-45' }, h('summary', { tag: 'INT-46' }, icon('book', { size: 18 }), h('span', bidiTitle(title))), h('ol.pf-guide-steps', steps.map((s) => h('li', s))));
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
      guide('ربط تحويل الرسائل الصوتية إلى نص', [
        'الأنسب خادم Whisper على جهاز يملكه المكتب: لا يخرج الصوت من المكتب، ويعمل لكل الطلبات. اختر «خادم Whisper خاص بالمكتب» من «نوع الخدمة» واكتب عنوانه.',
        `أو جهة خارجية (${en('OpenAI')} أو ${en('Groq')} أو ${en('Google')}): أنشئ مفتاحًا من لوحة المزوّد، واكتب اسمه، وأكّد أن شروطه تمنع التدريب على التسجيلات وأن مدة الاحتفاظ لا تزيد على 30 يومًا.`,
        'اضبط السعر لكل دقيقة وحد الإنفاق الشهري، ثم اضغط «اختبار الاتصال».',
        'تبدأ الرسائل الجديدة بعد الحفظ في الوصول بمسودة نصية يراجعها الفريق. الجهة الخارجية لا تتلقى صوت طلبات «خيري» إلا بإذن من الإعدادات.',
      ]),
      guide('الحصول على مفتاح Claude من Anthropic', [
        `ادخل ${en('console.anthropic.com')} وأنشئ حسابًا باسم المؤسسة (أو ادخل بحسابها الحالي).`,
        `من ${menu('Settings', 'Billing')} أضف وسيلة دفع أو رصيدًا مسبقًا، ومن ${menu('Settings', 'Limits')} اضبط حدًا شهريًا للإنفاق يناسب ميزانية البرنامج.`,
        `من ${menu('Settings', 'API Keys')} اضغط «${en('Create Key')}»، وسمِّه مثل ${en('beyoot-legal-production')}، ثم انسخه فورًا (يظهر مرة واحدة ويبدأ بـ ${en('sk-ant-')}).`,
        'الصق المفتاح في حقل «مفتاح Anthropic API» من زر «تعديل» في بطاقة Claude، ويمكنك ضبط «سقف الإنفاق الشهري» هنا أيضًا.',
        'اضغط «اختبار الاتصال». عند أي تعذر في الخدمة تعود المنصة تلقائيًا إلى المحلل المحلي دون توقف العمل.',
        'إذا تسرب المفتاح: احذفه فورًا من console.anthropic.com وأنشئ مفتاحًا جديدًا وأدخله هنا.',
      ]),
    ),
    titleTag: 'INT-47',
    tag: 'INT-48',
  });
}

// ───────── الصفحة ─────────

export default async function render() {
  const host = h('div.page.pf-page');
  async function load() {
    let data;
    let companies = 0; // v10 b2b-staff: تنبيه البريد الأحمر حين توجد شركات والإرسال صندوق صادر فقط
    let settings = {}; // v11 segment-staff: wa_paid_on_main
    try {
      [data, companies, settings] = await Promise.all([
        api.get('/admin/integrations'),
        api.get('/admin/b2b/overview', null, { background: true }).then((o) => Number(o?.companies?.total) || 0).catch(() => 0),
        api.get('/admin/settings', null, { background: true }).then((d) => (d && d.settings) || {}).catch(() => ({})),
      ]);
    } catch (err) {
      mount(host, pageHeader({ title: 'التكاملات', titleTag: 'INT-49', tag: 'INT-50' }), errorState(err, load));
      return;
    }
    mount(
      host,
      pageHeader({
        title: 'التكاملات',
        subtitle: 'ربط واتساب للأعمال والذكاء الاصطناعي (Claude) وتحويل الرسائل الصوتية إلى نص. تُحفظ الأسرار مشفرة ولا تُعرض بعد حفظها، وقيم متغيرات البيئة تتقدم على ما يُحفظ هنا.',
        actions: button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: load, tag: 'INT-51' }),
        titleTag: 'INT-52',
        tag: 'INT-53',
      }),
      h(
        'div.stack',
        keyAlert(data),
        h('div.pf-integrations-grid', data.items.map((item) => (item.name === 'email' ? emailSettingsCard(item, data, { reload: load, companies }) : item.name === 'stt' ? sttCard(item, load, settings) : integrationCard(item, data, load, settings)))),
        guides(data),
        h(
          'p.pf-muted',
          icon('info', { size: 14 }),
          ' كل حفظ أو اختبار يُسجَّل في ',
          h('a', { href: '#/audit', tag: 'INT-54' }, 'سجل الأمان'),
          '. آخر تحديث للصفحة: ',
          dateTime(new Date().toISOString()),
        ),
      ),
    );
  }
  await load();
  return frag(host);
}
