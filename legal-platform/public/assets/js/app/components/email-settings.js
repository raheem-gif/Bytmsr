// v10 b2b-staff (STF-9، U10-S24؛ مدير النظام فقط، P0 لأن البريد هو قناة الشركات الوحيدة، CO-2):
// • emailSettingsCard — بطاقة «البريد الإلكتروني» في صفحة التكاملات: طريقة الإرسال «بلا إرسال — صندوق صادر فقط» أو «SMTP»،
//   الخادم والمنفذ (25/465/587/2525) والتشفير «STARTTLS» · «TLS» والمستخدم وكلمة المرور وعنوان المرسل واسمه،
//   و«إرسال رسالة تجربة إلى بريدي»، وتنبيه أحمر حين توجد شركات والإرسال صندوق صادر فقط.
// • emailOutboxPanel — تبويب «صادر البريد» في الأتمتة: جدول للقراءة فقط (بلا نصوص الرسائل).
// الأسرار لا تعود من الخادم أبدًا؛ قيم متغيرات البيئة تتقدم على ما يُحفظ هنا (PUT /api/admin/integrations/email).

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { relative, dateTime, count } from '../../lib/fmt.js';
import { card, badge, button, asyncButton, alertBox, modal, form, toast, icon, codeTag, table, filterBar, selectInput, loading, errorState, errorMessage, emptyState } from '../../lib/ui.js';

export const PROVIDERS = [
  { value: 'outbox', label: 'بلا إرسال — صندوق صادر فقط' },
  { value: 'smtp', label: 'SMTP' },
];
export const SMTP_PORTS = ['25', '465', '587', '2525'];
export const SECURITY = [
  { value: 'starttls', label: 'STARTTLS' },
  { value: 'tls', label: 'TLS' },
];
/** تسميات حالة رسائل البريد كما في U10-S24 */
export const OUTBOX_STATUS = {
  sent: { label: 'أُرسل', tone: 'success' },
  queued: { label: 'في الانتظار', tone: 'info' },
  sending: { label: 'جارٍ الإرسال', tone: 'info' },
  failed: { label: 'فشل', tone: 'danger' },
  simulated: { label: 'تجريبي', tone: 'neutral' },
  skipped: { label: 'تُخطّي', tone: 'warning' },
};
export const OUTBOX_RED_NOTE = 'توجد شركات مشتركة والبريد «صندوق صادر فقط»: لا تصل للشركات أسئلة الفريق ولا عروض الأسعار ولا التسليمات بالبريد. اضبط SMTP قبل العمل الفعلي.';
const SOURCE_LABEL = { env: 'من متغير البيئة', db: 'محفوظ هنا', default: 'افتراضي' };

const fieldOf = (item, key) => (item.fields || []).find((f) => f.key === key) || {};

/** يعرض قيمة حقل للقراءة: السر بآخر خاناته فقط */
function shown(f) {
  if (!f.set) return h('span.muted', 'غير مضبوط');
  if (f.secret) return h('span', { dir: 'ltr' }, icon('lock', { size: 14 }), ' ', f.hint || '••••');
  if (f.value_label) return h('span', f.value_label);
  return h('bdi', { dir: 'ltr' }, String(f.value));
}

/**
 * @param {object} item عنصر email من GET /api/admin/integrations
 * @param {object} data استجابة GET /api/admin/integrations كاملة (public_base_url)
 * @param {{reload?: Function, companies?: number}} [o]
 */
export function emailSettingsCard(item, data = {}, { reload, companies = 0 } = {}) {
  const provider = fieldOf(item, 'provider').value || 'outbox';
  const isOutbox = provider !== 'smtp';
  const result = h('div.pf-test-result', item.last_test ? lastTest(item.last_test) : h('p.pf-muted', icon('info', { size: 16 }), ' لم تُرسل رسالة تجربة بعد.'));
  const notes = [];
  if (companies > 0 && isOutbox) notes.push(alertBox(OUTBOX_RED_NOTE, 'danger', { title: 'البريد غير مُعدّ للشركات', icon: 'mailWarning' }));
  if (!data.public_base_url) notes.push(alertBox('PUBLIC_BASE_URL غير مضبوط على الخادم: لا تُرسل روابط الدعوات وتعيين كلمة المرور بالبريد حتى يُضبط.', companies > 0 ? 'danger' : 'warning', { icon: 'alert' }));
  if (item.undecryptable) notes.push(alertBox('تغيّر مفتاح التشفير بعد حفظ كلمة مرور SMTP فلم يعد ممكنًا فك تشفيرها. أعد إدخالها.', 'danger'));
  const rows = ['provider', 'smtp_host', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password', 'from_address', 'from_name']
    .map((k) => fieldOf(item, k))
    .filter((f) => f.key && (f.key === 'provider' || !isOutbox || f.key.startsWith('from')));
  const test = asyncButton(
    'إرسال رسالة تجربة إلى بريدي',
    async () => {
      try {
        const r = await api.post('/admin/integrations/email/test', {});
        mount(result, lastTest({ ...r, tested_at: new Date().toISOString() }));
        toast(r.message || (r.ok ? 'أُرسلت رسالة التجربة.' : 'تعذّر الإرسال.'), r.ok ? 'success' : 'danger', 6000);
      } catch (err) {
        mount(result, alertBox(errorMessage(err), 'danger'));
      }
    },
    { variant: 'secondary', size: 'sm', icon: 'send' },
  );
  return card({
    title: 'البريد الإلكتروني',
    subtitle: 'رسائل بوابة الشركات: الدعوات وروابط كلمة المرور وأسئلة الفريق وعروض الأسعار والتسليمات. لا تحمل الرسائل محتوى قانونيًا.',
    icon: 'mail',
    className: 'pf-integration es-card',
    actions: h('div.pf-card-actions', test, button('تعديل', { variant: 'primary', size: 'sm', icon: 'edit', onClick: () => editEmail(item, reload) })),
    body: h(
      'div.stack',
      h(
        'div.pf-badges',
        isOutbox ? badge('صندوق صادر فقط — لا يُرسل شيء', 'warning', { icon: 'alert' }) : item.configured ? badge('SMTP مضبوط', 'success', { icon: 'check' }) : badge('SMTP غير مكتمل', 'warning', { icon: 'alert' }),
        companies ? badge(`${count(companies, ['شركة واحدة', 'شركتين', 'شركات', 'شركة'])} على المنصة`, 'neutral', { className: 'badge-outline' }) : null,
        item.updated_at ? h('span.pf-muted', `آخر تعديل ${relative(item.updated_at)}${item.updated_by_name ? ` — ${item.updated_by_name}` : ''}`) : null,
      ),
      notes,
      h(
        'ul.pf-fields',
        rows.map((f) => h('li.pf-field', h('div.pf-field-label', f.label), h('div.pf-field-value', shown(f)), h('div.pf-field-meta', f.source ? badge(SOURCE_LABEL[f.source] || f.source, f.source === 'env' ? 'info' : f.source === 'db' ? 'success' : 'neutral') : null, f.env ? codeTag(f.env, { className: 'pf-env' }) : null))),
      ),
      h('div', h('h3.pf-subtitle', 'رسالة التجربة'), result),
      h('p.pf-muted', icon('info', { size: 14 }), ' للتسليم الموثوق اضبط سجلات SPF وDKIM وDMARC لنطاق عنوان المرسل.'),
    ),
  });
}

function lastTest(t) {
  const when = t.tested_at ? ` (${relative(t.tested_at)}${t.tested_by_name ? ` — ${t.tested_by_name}` : ''})` : '';
  return alertBox(h('span', t.message || (t.ok ? 'أُرسلت رسالة التجربة.' : 'تعذّر الإرسال.'), h('span.pf-muted', when)), t.ok ? 'success' : 'danger', { title: t.ok ? 'آخر تجربة: ناجحة' : 'آخر تجربة: فاشلة' });
}

/** نافذة ضبط البريد: الحقول حسب طريقة الإرسال؛ ما يأتي من متغيرات البيئة للقراءة فقط */
export function editEmail(item, onSaved) {
  const fv = (k) => fieldOf(item, k);
  const locked = (k) => fv(k).source === 'env';
  const cur = (k) => (fv(k).source === 'db' || fv(k).source === 'default' ? fv(k).value ?? '' : '');
  let provider = cur('provider') || 'outbox';
  const radios = h(
    'div.es-providers',
    { role: 'radiogroup', 'aria-label': 'طريقة الإرسال' },
    PROVIDERS.map((p) =>
      h(
        'label.check.cs-radio',
        h('input', { type: 'radio', name: 'es-provider', value: p.value, checked: p.value === provider, disabled: locked('provider'), onChange: () => ((provider = p.value), sync()) }),
        h('span', p.label),
      ),
    ),
  );
  const pw = fv('smtp_password');
  const f = form(
    [
      { name: 'smtp_host', label: 'خادم SMTP', ltr: true, maxLength: 200, readonly: locked('smtp_host'), placeholder: 'smtp.example.com' },
      { name: 'smtp_port', label: 'المنفذ', type: 'select', placeholder: false, disabled: locked('smtp_port'), options: SMTP_PORTS.map((p) => ({ value: p, label: p })) },
      { name: 'smtp_security', label: 'التشفير', type: 'select', placeholder: false, disabled: locked('smtp_security'), options: SECURITY, hint: 'STARTTLS على 587 عادةً، وTLS على 465. لا إرسال دون تشفير.' },
      { name: 'smtp_user', label: 'اسم المستخدم', ltr: true, maxLength: 200, readonly: locked('smtp_user'), autocomplete: 'off' },
      {
        name: 'smtp_password',
        label: 'كلمة المرور',
        type: 'password',
        autocomplete: 'new-password',
        readonly: locked('smtp_password'),
        placeholder: pw.set ? `محفوظة (${pw.hint || '••••'}) — اتركها فارغة للإبقاء عليها` : 'غير مضبوطة',
      },
      { name: 'from_address', label: 'عنوان المرسل', type: 'email', readonly: locked('from_address'), placeholder: 'legal@example.com', hint: 'عنوان فقط، مثل legal@example.com' },
      { name: 'from_name', label: 'اسم المرسل', maxLength: 120, readonly: locked('from_name'), hint: 'اتركه فارغًا لاسم المكتب.' },
    ],
    {
      values: {
        smtp_host: cur('smtp_host'),
        smtp_port: String(cur('smtp_port') || '587'),
        smtp_security: cur('smtp_security') || 'starttls',
        smtp_user: cur('smtp_user'),
        smtp_password: '',
        from_address: cur('from_address'),
        from_name: cur('from_name'),
      },
      footer: false,
    },
  );
  const smtpOnly = ['smtp_host', 'smtp_port', 'smtp_security', 'smtp_user', 'smtp_password'];
  function sync() {
    for (const k of smtpOnly) f.control(k).wrap.hidden = provider !== 'smtp';
  }
  const alertHost = h('div.cs-alert');
  let saved = null;
  const handle = modal({
    title: 'ضبط البريد الإلكتروني',
    size: 'lg',
    body: h(
      'div.stack',
      h('p.modal-intro', 'كلمة المرور لا تُعرض بعد حفظها. القيم الآتية من متغيرات البيئة تُعدَّل على الخادم.'),
      alertHost,
      h('div.field', h('span.field-label', 'طريقة الإرسال'), radios),
      f.el,
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'حفظ الإعدادات',
        variant: 'primary',
        onClick: async () => {
          mount(alertHost, null);
          if (provider === 'smtp' && !f.validate()) return false;
          const v = f.getValues();
          const patch = {};
          if (!locked('provider') && provider !== (cur('provider') || 'outbox')) patch.provider = provider;
          const keys = provider === 'smtp' ? [...smtpOnly, 'from_address', 'from_name'] : ['from_address', 'from_name'];
          for (const k of keys) {
            if (locked(k)) continue;
            const val = typeof v[k] === 'string' ? v[k].trim() : v[k] == null ? '' : String(v[k]);
            if (k === 'smtp_password') {
              if (val) patch[k] = val;
            } else if (val !== String(cur(k) ?? '')) patch[k] = val;
          }
          if (provider === 'smtp' && !(v.smtp_host || '').trim() && !locked('smtp_host')) {
            f.setErrors({ smtp_host: 'اكتب عنوان خادم SMTP' });
            return false;
          }
          if (!Object.keys(patch).length) {
            mount(alertHost, alertBox('لم تغيّر أي قيمة.', 'info'));
            return false;
          }
          try {
            saved = await api.put('/admin/integrations/email', { values: patch });
            return undefined;
          } catch (err) {
            f.showError(err);
            mount(alertHost, alertBox(errorMessage(err), 'danger'));
            return false;
          }
        },
      },
    ],
    onClose: () => {
      if (!saved) return;
      toast('حُفظت إعدادات البريد. أرسل رسالة تجربة للتأكد.', 'success', 6000);
      for (const w of saved.warnings || []) toast(w, 'warning', 8000);
      if (onSaved) onSaved();
    },
  });
  sync();
  return handle;
}

// ───────────────────────── «صادر البريد» (U10-S24) ─────────────────────────

/** تبويب «صادر البريد» للقراءة فقط: الوقت · إلى · الغرض · الحالة · السبب (لا نصوص رسائل) */
export function emailOutboxPanel({ status: initial = '' } = {}) {
  const host = h('div');
  let status = OUTBOX_STATUS[initial] ? initial : '';
  async function load() {
    mount(host, loading());
    try {
      const res = await api.get('/admin/email-outbox', { status: status || undefined, limit: 200 });
      const counts = res.counts || {};
      mount(
        host,
        h(
          'div.stack',
          res.provider === 'outbox' ? alertBox('الإرسال الآن «صندوق صادر فقط»: تُسجَّل الرسائل هنا ولا تصل إلى أحد. اضبط SMTP من صفحة «التكاملات».', 'warning', { icon: 'mailWarning' }) : null,
          h(
            'div.pf-badges',
            Object.entries(counts).map(([k, n]) => badge(`${OUTBOX_STATUS[k]?.label || k}: ${n}`, OUTBOX_STATUS[k]?.tone || 'neutral')),
          ),
          (res.items || []).length
            ? table({
                caption: 'صادر البريد',
                stack: true,
                rows: res.items,
                columns: [
                  { key: 'time', label: 'الوقت', render: (m) => h('time', { datetime: m.created_at, title: dateTime(m.created_at) }, relative(m.created_at)) },
                  { key: 'to', label: 'إلى', render: (m) => h('bdi', { dir: 'ltr' }, m.to_address) },
                  { key: 'purpose', label: 'الغرض', render: (m) => m.purpose_label || m.purpose },
                  { key: 'status', label: 'الحالة', render: (m) => badge(OUTBOX_STATUS[m.status]?.label || m.status_label || m.status, OUTBOX_STATUS[m.status]?.tone || 'neutral') },
                  { key: 'error', label: 'السبب', render: (m) => (m.error ? h('span', { dir: 'auto' }, m.error) : m.attempts ? h('span.muted', `${count(m.attempts, ['محاولة واحدة', 'محاولتين', 'محاولات', 'محاولة'])}`) : '—') },
                ],
              })
            : emptyState('لا رسائل بريد بهذا الاختيار.', null, { compact: true, icon: 'mail' }),
        ),
      );
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }
  load();
  return h(
    'div.stack.es-outbox',
    h('p.pd-section-hint.pd-intro', 'رسائل البريد الصادرة لمستخدمي بوابة الشركات ولفريق المكتب، بحالتها. لا تُعرض نصوص الرسائل هنا.'),
    filterBar([
      selectInput({
        label: 'الحالة',
        allLabel: 'كل الحالات',
        options: Object.entries(OUTBOX_STATUS).map(([value, x]) => ({ value, label: x.label })),
        value: status,
        onChange: (v) => ((status = v), load()),
      }),
      button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: load }),
    ]),
    host,
  );
}
