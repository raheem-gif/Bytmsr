// محاكي واتساب (للعرض التجريبي فقط): يبني Webhook مطابقًا لصيغة منصة واتساب للأعمال من Meta
// ويمرره على نفس مسار الاستقبال الحقيقي — نفس تحديد العميل والربط بالطلب أو الملف والتحليل والإشعارات.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { relative, dateTime, normalizeEgPhone, toLatinDigits } from '../../../lib/fmt.js';
import { pageHeader, card, button, badge, icon, codeTag, ltr, form, alertBox, toast, copyButton, kv } from '../../../lib/ui.js';

const INH_CLIENT_PHONE = '+201012345678';

function randomMobile() {
  const prefix = ['010', '011', '012', '015'][Math.floor(Math.random() * 4)];
  let rest = '';
  for (let i = 0; i < 8; i++) rest += Math.floor(Math.random() * 10);
  return `${prefix}${rest}`;
}

/** معاينة شكل الـ Webhook كما تبنيه الخادم (للتوضيح فقط). */
function webhookPreview(v) {
  const phone = (normalizeEgPhone(v.from) ? `20${normalizeEgPhone(v.from).slice(1)}` : toLatinDigits(v.from || '').replace(/\D/g, '')) || '2010XXXXXXXX';
  const msg = { from: phone, id: 'wamid.SIM.…', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: v.text || '' } };
  if (v.is_ad) {
    msg.referral = {
      source_url: v.platform === 'instagram' ? 'https://www.instagram.com/p/sim' : 'https://fb.me/sim-ad',
      source_type: 'ad',
      source_id: v.ad_id || 'ad-…',
      headline: v.headline || 'استشارة قانونية مجانية من بيوت مصر',
      ctwa_clid: '…',
    };
  }
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'SIM',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: 'SIM', phone_number_id: 'SIM' },
              contacts: [{ profile: { name: v.name || 'عميل' }, wa_id: phone }],
              messages: [msg],
            },
          },
        ],
      },
    ],
  };
}

export default async function render(ctx) {
  const history = [];
  const resultHost = h('div', { 'aria-live': 'polite' });
  const previewPre = h('pre.pa-code', { dir: 'ltr', tabindex: '0' });

  const f = form(
    [
      { name: 'from', label: 'رقم المرسل', type: 'phone', required: true, hint: 'رقم موبايل مصري؛ نفس الرقم يعني نفس العميل' },
      { name: 'name', label: 'اسم المرسل كما يظهر في واتساب', maxLength: 100 },
      { name: 'text', label: 'نص الرسالة', type: 'textarea', required: true, maxLength: 4000, rows: 5 },
      {
        name: 'is_ad',
        type: 'checkbox',
        text: 'جاءت الرسالة من إعلان ممول (Click-to-WhatsApp)',
        full: true,
        onChange: (on) => toggleAd(on),
      },
      {
        name: 'platform',
        label: 'منصة الإعلان',
        type: 'select',
        placeholder: false,
        options: [
          { value: 'facebook', label: 'فيسبوك' },
          { value: 'instagram', label: 'إنستجرام' },
        ],
      },
      { name: 'headline', label: 'عنوان الإعلان', maxLength: 150 },
      { name: 'ad_id', label: 'رقم الإعلان (اختياري)', ltr: true, maxLength: 60 },
    ],
    {
      values: { platform: 'facebook' },
      submitLabel: 'إرسال عبر المحاكي',
      submitIcon: 'send',
      onSubmit: async (v) => {
        const body = { from: v.from, name: v.name || undefined, text: v.text };
        if (v.is_ad) body.ad = { platform: v.platform || 'facebook', headline: v.headline || undefined, ad_id: v.ad_id || undefined };
        mount(previewPre, JSON.stringify(webhookPreview(v), null, 2));
        const res = await api.post('/admin/simulate/whatsapp', body);
        showResult(res, v);
      },
    },
  );
  f.el.classList.add('pa-sim-form');
  const submitBtn = f.el.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.classList.remove('btn-primary');
    submitBtn.classList.add('btn-whatsapp');
  }

  const adFields = ['platform', 'headline', 'ad_id'].map((n) => f.control(n).wrap);
  function toggleAd(on) {
    adFields.forEach((w) => (w.hidden = !on));
  }
  toggleAd(false);

  function fill(values) {
    f.clearErrors();
    f.setValues({ name: '', is_ad: false, headline: '', ad_id: '', platform: 'facebook', ...values });
    toggleAd(Boolean(values.is_ad));
    mount(previewPre, JSON.stringify(webhookPreview(f.getValues()), null, 2));
    const t = f.control('text');
    if (t && t.input) t.input.focus();
    toast('جُهزت الرسالة — راجعها ثم اضغط «إرسال عبر المحاكي»', 'info', 2500);
  }

  function showResult(res, v) {
    const entry = { at: new Date().toISOString(), from: v.from, text: v.text, res };
    history.unshift(entry);
    let tone = 'success';
    let title = 'وصلت الرسالة إلى محرك الاستقبال';
    let text;
    if (res.duplicates) {
      tone = 'warning';
      title = 'رسالة مكررة';
      text = 'تجاهل المحرك الرسالة لأنها وصلت من قبل بنفس المعرّف.';
    } else if (res.failed) {
      tone = 'danger';
      title = 'تعذر استقبال الرسالة';
      text = 'راجع سجل الخادم لمعرفة السبب.';
    } else if (res.case_id) {
      text = 'وصلت من رقم عميل لديه ملف مفتوح، فأُلحقت بالملف نفسه بدل إنشاء طلب جديد، وأُبلغت الإدارة.';
    } else if (res.intake_id) {
      text = 'سُجلت في صندوق الوارد الموحد: طلب جديد أو طلب مفتوح لنفس العميل. يحلل الذكاء الاصطناعي الطلب خلال لحظات.';
    } else {
      text = 'استُقبلت الرسالة.';
    }
    mount(
      resultHost,
      card({
        title: 'نتيجة المحاكاة',
        icon: 'checkCircle',
        className: 'pa-sim-result',
        body: h(
          'div.stack',
          alertBox(text, tone, { title }),
          h(
            'div.btn-group',
            res.intake_id && button('فتح الطلب في صندوق الوارد', { variant: 'primary', icon: 'inbox', href: `#/inbox/${res.intake_id}` }),
            res.case_id && button('فتح الملف', { icon: 'briefcase', href: `#/cases/${res.case_id}` }),
          ),
          kv(
            [
              ['رسائل مستلمة', String(res.received ?? 0)],
              ['مكررة', String(res.duplicates ?? 0)],
              ['تعذر استقبالها', String(res.failed ?? 0)],
            ],
            { columns: 3 },
          ),
        ),
      }),
      history.length > 1 &&
        card({
          title: 'رسائل هذه الجلسة',
          icon: 'clock',
          body: h(
            'ul.pa-sim-history',
            history.map((x) =>
              h(
                'li',
                h('span.pa-sim-h-head', ltr(x.from), h('time.small.muted', { datetime: x.at, title: dateTime(x.at) }, relative(x.at))),
                h('span.pa-sim-h-text', { dir: 'auto' }, x.text),
                h(
                  'span.row',
                  x.res.intake_id && h('a', { href: `#/inbox/${x.res.intake_id}` }, 'الطلب'),
                  x.res.case_id && h('a', { href: `#/cases/${x.res.case_id}` }, 'الملف'),
                ),
              ),
            ),
          ),
        }),
    );
    toast('وصلت الرسالة عبر المحاكي', 'success');
    resultHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ───────────── السيناريوهات الجاهزة ─────────────
  const reqInput = h('input.input', { type: 'text', dir: 'ltr', placeholder: 'REQ-2026-00020', maxlength: 20, 'aria-label': 'رقم الطلب من الموقع', autocomplete: 'off' });
  const diffCb = h('input', { type: 'checkbox' });
  const reqNote = h('p.field-error', { hidden: true, role: 'alert' });

  async function prepareFollowUp() {
    reqNote.hidden = true;
    const code = toLatinDigits(reqInput.value).trim().toUpperCase();
    if (!/^REQ-\d{4}-\d{5}$/.test(code)) {
      reqNote.textContent = 'اكتب رقم الطلب بالصيغة REQ-2026-00020';
      reqNote.hidden = false;
      reqInput.focus();
      return;
    }
    let phone = null;
    let name = '';
    if (!diffCb.checked) {
      try {
        const list = await api.get('/admin/intakes', { q: code, scope: 'all', limit: 5 });
        const found = (list.items || []).find((x) => x.code === code);
        if (found && found.client_code) {
          const cl = await api.get('/admin/clients', { q: found.client_code, limit: 5 });
          const c = (cl.items || []).find((x) => x.code === found.client_code);
          if (c && c.phone) {
            phone = c.phone;
            name = c.name || found.contact_name || '';
          }
        }
        if (!found) toast('لم نجد طلبًا بهذا الرقم؛ ستصل الرسالة كطلب جديد', 'warning');
      } catch (err) {
        toast(err.message, 'danger');
      }
    }
    fill({
      from: phone || randomMobile(),
      name: diffCb.checked ? 'قريب صاحب الطلب' : name,
      text: diffCb.checked
        ? `السلام عليكم بخصوص الطلب ${code}، أنا قريب صاحب الطلب وعايز أعرف وصلتوا لإيه؟`
        : `مرحبًا بيوت مصر، رقم طلبي ${code} وأريد استكمال طلبي عبر واتساب.`,
    });
  }

  const presets = [
    {
      icon: 'flag',
      title: 'رسالة ميراث من إعلان فيسبوك',
      text: 'رقم جديد يضغط على إعلان ممول فيبدأ محادثة واتساب: المصدر «إعلان فيسبوك» والقناة «واتساب».',
      action: () =>
        fill({
          from: randomMobile(),
          name: 'أبو أحمد',
          text: 'السلام عليكم، والدي اتوفى من شهرين وساب شقة في شبرا وحتة أرض في المنوفية، وإخواتي البنات عايزين نصيبهم وأخويا الكبير رافض يقسم. نعمل إيه؟',
          is_ad: true,
          platform: 'facebook',
          headline: 'استشارة مجانية في قضايا الميراث وتقسيم التركات',
          ad_id: `ad-fb-${Math.floor(Math.random() * 90000) + 10000}`,
        }),
    },
    {
      icon: 'globe',
      title: 'متابعة طلب من الموقع',
      text: 'عميل قدّم طلبًا على الموقع ثم يكمل على واتساب بذكر رقم طلبه — يُلحق بنفس الطلب ولا يُنشأ طلب جديد.',
      extra: h(
        'div.pa-preset-extra',
        h('div.pa-url-row', reqInput, button('تجهيز', { size: 'sm', icon: 'check', onClick: prepareFollowUp })),
        h('label.check.small', diffCb, h('span', 'من رقم مختلف عن صاحب الطلب (لتجربة تنبيه التحقق من الهوية)')),
        reqNote,
      ),
    },
    {
      icon: 'briefcase',
      title: 'رد من عميل ملف قائم',
      text: 'عميلة الملف INH-2026-00482 ترد على طلب المستند — تصل الرسالة إلى الملف نفسه.',
      action: () =>
        fill({
          from: INH_CLIENT_PHONE,
          name: 'سامية محمود',
          text: 'أرسلت صورة إعلام الوراثة، وكمان عندي صورة عقد الشقة لو محتاجينها.',
        }),
    },
    {
      icon: 'userPlus',
      title: 'رسالة من رقم جديد',
      text: 'عميل لم يتواصل من قبل ودون إعلان: يُنشأ له رقم عميل وطلب جديد في صندوق الوارد.',
      action: () =>
        fill({
          from: randomMobile(),
          name: '',
          text: 'مساء الخير، صاحب الشغل فصلني من غير أي إنذار بعد 7 سنين شغل ومش راضي يديني مستحقاتي ولا شهادة الخبرة. ممكن أعرف حقوقي؟',
        }),
    },
  ];

  const presetsCard = card({
    title: 'سيناريوهات جاهزة',
    subtitle: 'اختر سيناريو لتعبئة النموذج، ثم عدّل ما تشاء قبل الإرسال',
    icon: 'zap',
    body: h(
      'ul.pa-presets',
      presets.map((p) =>
        h(
          'li.pa-preset',
          p.action
            ? h(
                'button.pa-preset-btn',
                { type: 'button', onClick: p.action },
                h('span.pa-preset-icon', icon(p.icon, { size: 18 })),
                h('span.pa-preset-text', h('strong', p.title), h('span', richish(p.text))),
              )
            : h(
                'div.pa-preset-btn.is-static',
                h('span.pa-preset-icon', icon(p.icon, { size: 18 })),
                h('span.pa-preset-text', h('strong', p.title), h('span', p.text), p.extra),
              ),
        ),
      ),
    ),
  });

  function richish(text) {
    const m = /(INH-\d{4}-\d{5})/.exec(text);
    if (!m) return text;
    const [before, after] = text.split(m[1]);
    return [before, codeTag(m[1]), after];
  }

  const pipeline = [
    ['تحديد العميل', 'من رقم الهاتف: الرقم نفسه من الموقع أو واتساب يعني العميل نفسه ورقم العميل نفسه.'],
    ['ربط الرسالة', 'رقم طلب مذكور ← نفس الطلب؛ طلب مفتوح ← يُلحق به؛ ملف مفتوح ← يُلحق بالملف؛ غير ذلك ← طلب جديد.'],
    ['المصدر', 'بيانات الإعلان (referral) تحدد المصدر والحملة، مستقلة عن القناة.'],
    ['التحليل والإشعار', 'يحلل الذكاء الاصطناعي الطلب ويُبلغ الإدارة؛ ولا يصبح الطلب ملفًا إلا بقرارها.'],
  ];
  const pipelineCard = card({
    title: 'ماذا يحدث للرسالة؟',
    icon: 'info',
    body: h(
      'ol.pa-steps',
      pipeline.map(([t, x], i) => h('li', h('span.pa-step-n', String(i + 1)), h('span.pa-step-text', h('strong', t), h('span', x)))),
    ),
  });

  const envs = [
    ['WHATSAPP_TOKEN', 'رمز الوصول الدائم لتطبيق Meta'],
    ['WHATSAPP_PHONE_NUMBER_ID', 'معرّف رقم المؤسسة في واتساب للأعمال'],
    ['WHATSAPP_VERIFY_TOKEN', 'رمز التحقق عند تسجيل الـ Webhook لدى Meta'],
    ['WHATSAPP_APP_SECRET', 'سر التطبيق للتحقق من توقيع الرسائل الواردة'],
  ];
  const prodCard = card({
    title: 'الربط الفعلي مع واتساب',
    icon: 'link',
    body: h(
      'div.stack-sm',
      h('p.small.muted', 'في التشغيل الفعلي ترسل Meta الرسائل إلى هذا المسار، وتمر بنفس المحرك المستخدم هنا:'),
      h('div.pa-url-row', codeTag('/webhooks/whatsapp', { className: 'pa-code-inline' }), copyButton('/webhooks/whatsapp', '')),
      h('h3.pa-mini-h', 'متغيرات البيئة المطلوبة'),
      h('ul.pa-envs', envs.map(([k, x]) => h('li', codeTag(k), h('span.small', x)))),
      h('p.pa-note', icon('info', { size: 15 }), h('span', 'بدون هذه البيانات تُسجل الرسائل الصادرة كـ «إرسال تجريبي (محاكاة)» ولا تُرسل فعليًا.')),
    ),
  });

  const previewCard = h(
    'details.pa-details.pa-preview',
    h('summary', 'عرض شكل الـ Webhook المرسل (صيغة Meta)'),
    previewPre,
  );
  mount(previewPre, JSON.stringify(webhookPreview({ from: '', text: '' }), null, 2));

  return h(
    'div.pa-page.pa-page-simulator',
    pageHeader({
      title: 'محاكي واتساب',
      subtitle:
        'يبني المحاكي رسالة Webhook مطابقة لصيغة منصة واتساب للأعمال من Meta ويمررها على نفس مسار الاستقبال الحقيقي.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'محاكي واتساب' }],
      meta: [badge('للعرض التجريبي فقط', 'warning', { icon: 'alert' }), badge('نفس محرك الاستقبال الحقيقي', 'success', { icon: 'checkCircle' })],
      actions: button('صندوق الوارد', { variant: 'ghost', icon: 'inbox', href: '#/inbox' }),
    }),
    h(
      'div.detail-layout',
      h(
        'div.detail-main',
        presetsCard,
        card({ title: 'رسالة واتساب واردة', icon: 'whatsapp', body: h('div.stack', f.el, previewCard) }),
        resultHost,
      ),
      h('div.detail-side', pipelineCard, prodCard),
    ),
  );
}
