// صفحة تقديم الطلب من الموقع: نموذج منظم أو محادثة خطوة بخطوة، والطريقتان تكتبان في نفس المسودة.

import { h, mount } from '../lib/h.js';
import { api, filesToUploads } from '../lib/api.js';
import { setMeta, areaOptions, areaLabel, governorateOptions, normalizeEgPhone, toLatinDigits, count } from '../lib/fmt.js';
import {
  form,
  tabs,
  button,
  asyncButton,
  icon,
  codeTag,
  copyButton,
  alertBox,
  errorState,
  fileInput,
  progressBar,
  kv,
  errorMessage,
  loading,
  setBusy,
} from '../lib/ui.js';
import { captureAttribution, getAttribution, bindSettings, whatsappUrl, hydrateIcons, setYear } from './common.js';

const UNSURE = 'unsure';
const MIN_DESC = 20;
const MAX_DESC = 5000;
const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const QUICK_GOVS = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية'];
const PHONE_ERROR = 'أدخل رقم موبايل مصري صحيح مثل 01012345678';

const root = document.getElementById('intake-root');
let settings = {};

// مسودة مشتركة بين الطريقتين حتى لا تضيع البيانات عند التبديل
const draft = {
  name: '',
  phone: '',
  email: '',
  governorate: null,
  legal_area: null,
  description: '',
  documents: [],
  consent: false,
};

// حقل المصيدة: يبقى فارغًا عند البشر، مخفي بصريًا وعن قارئات الشاشة
const honeypotInput = h('input', { type: 'text', id: 'hp-website', name: 'website', tabindex: '-1', autocomplete: 'off' });
const honeypot = h('div.honeypot', { 'aria-hidden': 'true' }, h('label', { htmlFor: 'hp-website' }, 'الموقع الإلكتروني'), honeypotInput);

const orgName = () => settings.org_name || 'بيوت مصر';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function areaText(v) {
  if (!v) return 'لم يُحدد';
  return v === UNSURE ? 'لست متأكدًا' : areaLabel(v);
}

function filesText(files) {
  const n = files.length;
  if (!n) return 'لا توجد مستندات حاليًا';
  const names = files.map((f) => f.name).join('، ');
  if (n === 1) return `أرفقت ملفًا واحدًا: ${names}`;
  if (n === 2) return `أرفقت ملفين: ${names}`;
  return `أرفقت ${count(n, 'file')}: ${names}`;
}

// ───────────── الإرسال ─────────────

async function submitIntake(values, mode) {
  const files = values.documents || [];
  if (files.length > MAX_FILES) throw new Error(`يمكنك إرفاق ${count(MAX_FILES, 'file')} كحد أقصى`);
  const documents = await filesToUploads(files, { maxBytes: MAX_BYTES });
  const payload = {
    name: String(values.name || '').trim(),
    phone: normalizeEgPhone(values.phone) || toLatinDigits(values.phone || '').trim(),
    governorate: values.governorate || '',
    legal_area: values.legal_area && values.legal_area !== UNSURE ? values.legal_area : '',
    description: String(values.description || '').trim(),
    documents,
    attribution: getAttribution(),
    mode,
    consent: true,
    website: honeypotInput.value,
  };
  const email = String(values.email || '').trim();
  if (email) payload.email = email;
  const res = await api.post('/public/intake', payload);
  showSuccess(res, payload.name);
}

function showSuccess(res, name) {
  const ref = res && res.reference;
  const heading = h('h2#success-title', { tabindex: '-1' }, 'تم استلام طلبك بنجاح');
  mount(
    root,
    h(
      'section.intake-card.success-card',
      { 'aria-labelledby': 'success-title' },
      h('span.success-icon', icon('check', { size: 36 })),
      heading,
      h('p.muted', `شكرًا لك${firstName(name) ? ` يا ${firstName(name)}` : ''}. سيراجع فريق ${orgName()} طلبك ويتواصل معك قريبًا.`),
      ref &&
        h(
          'div.ref-box',
          h('span.ref-label', 'رقم طلبك'),
          codeTag(ref, { className: 'code-lg' }),
          copyButton(ref, 'نسخ الرقم', { variant: 'secondary' }),
        ),
      h('p', h('strong', 'احتفظ برقم طلبك؛ '), 'ستحتاجه عند المتابعة معنا عبر الموقع أو واتساب.'),
      h(
        'div.cta-row',
        res && res.portal_url && button('متابعة طلبك ورفع المستندات', { variant: 'primary', size: 'lg', icon: 'upload', href: res.portal_url }),
        res &&
          res.whatsapp_url &&
          button('أكمل عبر واتساب', { variant: 'whatsapp', size: 'lg', icon: 'whatsapp', href: res.whatsapp_url, target: '_blank' }),
      ),
      h(
        'ul.next-steps',
        [
          'رابط المتابعة خاص بك وحدك؛ احفظه لتعود إليه وترفع أي مستندات إضافية في أي وقت.',
          'قد نطلب منك معلومة أو مستندًا ناقصًا قبل إحالة طلبك إلى المحامي المختص.',
          `يصلك الرد بعد مراجعته واعتماده من إدارة ${orgName()}.`,
        ].map((t) => h('li', icon('checkCircle', { size: 18 }), h('span', t))),
      ),
    ),
  );
  window.scrollTo({ top: 0, behavior: 'smooth' });
  heading.focus({ preventScroll: true });
}

// ───────────── النموذج المنظم ─────────────

function buildForm() {
  const f = form(
    [
      { name: 'name', label: 'الاسم', required: true, autocomplete: 'name', maxLength: 120, placeholder: 'الاسم الذي تحب أن نناديك به' },
      { name: 'phone', label: 'رقم الموبايل', type: 'phone', required: true, hint: 'يُفضَّل أن يكون عليه واتساب لنتواصل معك بسهولة' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email', hint: 'اختياري' },
      { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions(), placeholder: '— اختر المحافظة —' },
      {
        name: 'legal_area',
        label: 'نوع المسألة القانونية',
        type: 'select',
        options: [...areaOptions(), { value: UNSURE, label: 'لست متأكدًا' }],
        placeholder: '— اختر نوع المسألة —',
        hint: 'إن لم تكن متأكدًا اختر «لست متأكدًا» وسنصنفها نحن',
        full: true,
      },
      {
        name: 'description',
        label: 'اشرح مشكلتك',
        type: 'textarea',
        required: true,
        rows: 7,
        minLength: MIN_DESC,
        maxLength: MAX_DESC,
        placeholder: 'ماذا حدث؟ ومتى؟ ومن الأطراف؟ وما الذي تريد الوصول إليه؟',
        hint: 'كلما كانت التفاصيل أوضح، كان الرد أدق وأسرع.',
      },
      {
        name: 'documents',
        label: 'المستندات',
        type: 'file',
        multiple: true,
        maxFiles: MAX_FILES,
        maxBytes: MAX_BYTES,
        hint: 'اختياري: صور العقود أو الإيصالات أو الأحكام أو أي مستند متعلق بالمسألة.',
      },
      {
        name: 'consent',
        type: 'checkbox',
        required: true,
        label: 'أوافق على استخدام بياناتي لتقديم الخدمة القانونية المطلوبة',
        hint: settings.privacy_notice,
      },
    ],
    {
      values: draft,
      submitLabel: 'إرسال الطلب',
      submitIcon: 'send',
      onSubmit: async (values) => {
        Object.assign(draft, values);
        await submitIntake(values, 'form');
      },
    },
  );
  f.el.querySelector('button[type=submit]')?.classList.add('btn-lg');
  return f;
}

// ───────────── المحادثة خطوة بخطوة ─────────────

function createWizard() {
  let step = 0;
  const el = h('div.wizard');
  const live = h('p.sr-only', { 'aria-live': 'polite' });

  const navButtons = ({ onNext, nextLabel = 'التالي', skip, nextIcon = 'arrowLeft' } = {}) => {
    const next = onNext ? button(nextLabel, { variant: 'primary', iconEnd: nextIcon, onClick: onNext }) : null;
    return {
      next,
      row: h(
        'div.wizard-actions',
        step > 0 ? button('رجوع', { variant: 'ghost', icon: 'arrowRight', onClick: back }) : h('span'),
        h('div.btn-group', skip && button(skip.label, { variant: 'secondary', onClick: skip.onClick }), next),
      ),
    };
  };

  const errorLine = () => {
    const e = h('p.field-error', { hidden: true, role: 'alert' }, icon('alert', { size: 14 }), h('span'));
    e.show = (msg) => {
      e.lastChild.textContent = msg || '';
      e.hidden = !msg;
    };
    return e;
  };

  function advance() {
    step = Math.min(step + 1, STEPS.length - 1);
    render(true);
  }

  function back() {
    step = Math.max(step - 1, 0);
    render(true);
  }

  // سؤال بإجابة نصية قصيرة
  function textComposer({ key, type = 'text', label, placeholder, autocomplete, validate, normalize }) {
    const input = h('input.input', {
      type,
      id: `wz-${key}`,
      value: draft[key] || '',
      placeholder,
      autocomplete,
      dir: type === 'tel' ? 'ltr' : null,
      inputmode: type === 'tel' ? 'tel' : null,
    });
    const err = errorLine();
    const submit = () => {
      const v = input.value.trim();
      const msg = validate(v);
      if (msg) {
        err.show(msg);
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      draft[key] = normalize ? normalize(v) : v;
      advance();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    const { row } = navButtons({ onNext: submit });
    return { node: [h('label.field-label', { htmlFor: input.id }, label), input, err, row], focus: input };
  }

  const STEPS = [
    {
      key: 'name',
      ask: () => `أهلًا بك في ${orgName()}. سنطرح عليك بعض الأسئلة القصيرة لنفهم مشكلتك جيدًا. ما اسمك؟`,
      answer: () => draft.name,
      composer: () =>
        textComposer({
          key: 'name',
          label: 'اسمك',
          placeholder: 'الاسم الذي تحب أن نناديك به',
          autocomplete: 'name',
          validate: (v) => (v.length < 2 ? 'اكتب اسمك من فضلك' : null),
        }),
    },
    {
      key: 'phone',
      ask: () => `تشرّفنا بك${firstName(draft.name) ? ` يا ${firstName(draft.name)}` : ''}. ما رقم موبايلك؟ يُفضَّل أن يكون عليه واتساب لنتواصل معك بسهولة.`,
      answer: () => draft.phone,
      composer: () =>
        textComposer({
          key: 'phone',
          type: 'tel',
          label: 'رقم الموبايل',
          placeholder: '01XXXXXXXXX',
          autocomplete: 'tel',
          validate: (v) => (normalizeEgPhone(v) ? null : PHONE_ERROR),
          normalize: (v) => normalizeEgPhone(v),
        }),
    },
    {
      key: 'governorate',
      ask: () => 'في أي محافظة تقيم؟',
      answer: () => draft.governorate || 'أفضّل عدم التحديد',
      composer: () => {
        const pick = (g) => {
          draft.governorate = g;
          advance();
        };
        const quick = h(
          'div.chip-select',
          { role: 'group', 'aria-label': 'محافظات شائعة' },
          QUICK_GOVS.filter((g) => governorateOptions().some((o) => o.value === g)).map((g) =>
            h('button.chip-toggle', { type: 'button', 'aria-pressed': String(draft.governorate === g), onClick: () => pick(g) }, icon('check', { size: 14 }), h('span', g)),
          ),
        );
        const select = h(
          'select.input',
          { id: 'wz-gov', value: draft.governorate || '' },
          h('option', { value: '' }, '— محافظة أخرى —'),
          governorateOptions().map((o) => h('option', { value: o.value }, o.label)),
        );
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            if (!select.value) {
              err.show('اختر محافظتك من القائمة أو اضغط «تخطَّ»');
              return;
            }
            pick(select.value);
          },
          skip: { label: 'تخطَّ', onClick: () => pick(null) },
        });
        return {
          node: [quick, h('label.field-label', { htmlFor: 'wz-gov' }, 'أو اختر من كل المحافظات'), h('div.select-wrap', select), err, row],
          focus: quick.querySelector('button'),
        };
      },
    },
    {
      key: 'legal_area',
      ask: () => 'ما نوع المسألة القانونية؟ اختر الأقرب لمشكلتك، وإن لم تكن متأكدًا فلا بأس.',
      answer: () => areaText(draft.legal_area),
      composer: () => {
        const opts = [...areaOptions(), { value: UNSURE, label: 'لست متأكدًا' }];
        const group = h(
          'div.chip-select',
          { role: 'group', 'aria-label': 'نوع المسألة القانونية' },
          opts.map((o) =>
            h(
              'button.chip-toggle',
              {
                type: 'button',
                'aria-pressed': String(draft.legal_area === o.value),
                onClick: () => {
                  draft.legal_area = o.value;
                  advance();
                },
              },
              icon('check', { size: 14 }),
              h('span', o.label),
            ),
          ),
        );
        const { row } = navButtons();
        return { node: [group, row], focus: group.querySelector('[aria-pressed="true"]') || group.querySelector('button') };
      },
    },
    {
      key: 'description',
      ask: () => 'احكِ لنا المشكلة بالتفصيل: ماذا حدث؟ ومتى؟ ومن الأطراف؟ وما الذي تريد الوصول إليه؟',
      answer: () => draft.description,
      composer: () => {
        const ta = h('textarea.input', { id: 'wz-desc', rows: 6, maxlength: MAX_DESC, value: draft.description || '', placeholder: 'اكتب التفاصيل هنا…' });
        const counter = h('span.char-count', { 'aria-live': 'polite' });
        const update = () => {
          const n = ta.value.trim().length;
          counter.textContent = n < MIN_DESC ? `عدد الأحرف: ${n} — الحد الأدنى ${count(MIN_DESC, 'char')}` : `عدد الأحرف: ${n}`;
          counter.classList.toggle('is-ok', n >= MIN_DESC);
        };
        ta.addEventListener('input', update);
        update();
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            const v = ta.value.trim();
            if (v.length < MIN_DESC) {
              err.show(`اكتب ${count(MIN_DESC, 'char')} على الأقل حتى نفهم مشكلتك`);
              ta.focus();
              return;
            }
            draft.description = v;
            advance();
          },
        });
        return { node: [h('label.field-label', { htmlFor: 'wz-desc' }, 'تفاصيل المشكلة'), h('div.textarea-wrap', ta, counter), err, row], focus: ta };
      },
    },
    {
      key: 'documents',
      ask: () => 'هل لديك مستندات تريد إرفاقها؟ مثل عقد أو إيصال أو حكم. هذه الخطوة اختيارية ويمكنك إرسالها لاحقًا.',
      answer: () => filesText(draft.documents || []),
      composer: () => {
        let nav = null;
        const fi = fileInput({
          maxFiles: MAX_FILES,
          maxBytes: MAX_BYTES,
          onChange: (files) => {
            draft.documents = files;
            mount(nav.next, h('span.btn-label', files.length ? 'التالي' : 'تخطَّ، لا توجد مستندات'), icon('arrowLeft', { size: 18 }));
          },
        });
        fi.setFiles(draft.documents || []);
        nav = navButtons({
          onNext: () => {
            draft.documents = fi.getFiles();
            advance();
          },
          nextLabel: (draft.documents || []).length ? 'التالي' : 'تخطَّ، لا توجد مستندات',
        });
        return { node: [fi.el, nav.row], focus: fi.input };
      },
    },
    {
      key: 'consent',
      ask: () => `قبل الإرسال، نطمئنك: ${settings.privacy_notice || 'بياناتك تُستخدم فقط لتقديم الخدمة القانونية المطلوبة.'}`,
      answer: () => 'أوافق على استخدام بياناتي لتقديم الخدمة',
      composer: () => {
        const cb = h('input', { type: 'checkbox', id: 'wz-consent', checked: Boolean(draft.consent) });
        const err = errorLine();
        const { row } = navButtons({
          onNext: () => {
            if (!cb.checked) {
              err.show('يجب الموافقة للمتابعة');
              cb.focus();
              return;
            }
            draft.consent = true;
            advance();
          },
        });
        cb.addEventListener('change', () => (draft.consent = cb.checked));
        return {
          node: [h('label.check.check-single', { htmlFor: 'wz-consent' }, cb, h('span', 'أوافق على استخدام بياناتي لتقديم الخدمة القانونية المطلوبة')), err, row],
          focus: cb,
        };
      },
    },
    {
      key: 'review',
      ask: () => 'راجع بياناتك قبل الإرسال. يمكنك الضغط على «رجوع» لتعديل أي إجابة.',
      answer: () => '',
      composer: () => {
        const alertHost = h('div');
        const docs = draft.documents || [];
        const summary = kv(
          [
            ['الاسم', draft.name],
            ['رقم الموبايل', h('span.ltr', draft.phone)],
            ['المحافظة', draft.governorate || '—'],
            ['نوع المسألة', areaText(draft.legal_area)],
            ['المستندات', docs.length ? filesText(docs) : 'لا توجد'],
            ['التفاصيل', h('span.pre', draft.description)],
          ],
          { className: 'review-list' },
        );
        const sendBtn = button('إرسال الطلب', { variant: 'primary', icon: 'send', size: 'lg' });
        sendBtn.addEventListener('click', async () => {
          if (sendBtn.classList.contains('is-loading')) return;
          mount(alertHost);
          setBusy(sendBtn, true);
          try {
            await submitIntake(draft, 'guided');
          } catch (err) {
            mount(alertHost, alertBox(errorMessage(err), 'danger'));
          } finally {
            setBusy(sendBtn, false);
          }
        });
        const row = h(
          'div.wizard-actions',
          button('رجوع', { variant: 'ghost', icon: 'arrowRight', onClick: back }),
          h('div.btn-group', sendBtn),
        );
        return { node: [summary, alertHost, row], focus: sendBtn };
      },
    },
  ];

  const bot = (text) =>
    h('div.msg.msg-start', h('div.msg-bubble', h('div.msg-meta', h('span.msg-author', orgName())), h('div.msg-body', text)));
  const mine = (text) => h('div.msg.msg-end', h('div.msg-bubble', h('div.msg-body', { dir: 'auto' }, text)));

  function render(focus = false) {
    const thread = h('div.chat', { role: 'log', 'aria-label': 'المحادثة' });
    for (let i = 0; i < step; i += 1) {
      thread.append(bot(STEPS[i].ask()));
      const a = STEPS[i].answer();
      if (a) thread.append(mine(a));
    }
    const current = STEPS[step];
    thread.append(bot(current.ask()));
    const { node, focus: focusEl } = current.composer();
    mount(
      el,
      h(
        'div.wizard-progress',
        h('span.nowrap', `الخطوة ${step + 1} من ${STEPS.length}`),
        progressBar(step + 1, STEPS.length, 'primary', { label: 'تقدم الإجابة على الأسئلة', visibleLabel: false }),
      ),
      thread,
      h('div.wizard-composer', node),
      live,
    );
    live.textContent = current.ask();
    thread.scrollTop = thread.scrollHeight;
    if (focus && focusEl) focusEl.focus({ preventScroll: true });
    if (focus) el.querySelector('.wizard-composer').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return { el, render };
}

// ───────────── التهيئة ─────────────

function renderIntake() {
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('mode') === 'guided' ? 'guided' : 'form';
  const formApi = buildForm();
  const wizard = createWizard();

  const t = tabs(
    [
      { key: 'form', label: 'نموذج منظم', icon: 'fileText', render: () => formApi.el },
      {
        key: 'guided',
        label: 'احكِ مشكلتك خطوة بخطوة',
        icon: 'message',
        render: () => {
          wizard.render(false);
          return wizard.el;
        },
      },
    ],
    {
      active: initial,
      className: 'tabs-pills',
      onChange: (key, prev) => {
        if (prev === 'form') Object.assign(draft, formApi.getValues());
        if (key === 'form') formApi.setValues(draft);
        if (key === 'guided') wizard.render(true);
      },
    },
  );

  const wa = whatsappUrl(settings.whatsapp_number_digits, `مرحبًا ${orgName()}، أود الحصول على استشارة قانونية.`);
  mount(
    root,
    h(
      'div.intake-head',
      h('h1', 'ابدأ استشارتك القانونية'),
      h(
        'p',
        `اكتب لنا مشكلتك بالطريقة التي تناسبك، وسيراجعها فريق ${orgName()} ثم يحيلها إلى محامٍ متخصص. يمكنك المتابعة لاحقًا من الموقع أو من واتساب على نفس الملف.`,
      ),
      wa &&
        h(
          'p.wa-alt',
          icon('whatsapp', { size: 18 }),
          h('span', 'تفضّل واتساب؟'),
          h('a', { href: wa, target: '_blank', rel: 'noopener noreferrer' }, 'راسلنا مباشرة'),
        ),
    ),
    h('section.intake-card', { 'aria-label': 'نموذج الطلب' }, t, honeypot),
  );
}

async function init() {
  captureAttribution();
  hydrateIcons();
  setYear();
  mount(root, loading());
  try {
    const meta = setMeta(await api.get('/meta'));
    settings = meta.settings || {};
    bindSettings(settings);
    if (settings.org_name) document.title = `ابدأ استشارتك — ${settings.org_name}`;
  } catch (err) {
    mount(root, errorState(err, init));
    return;
  }
  renderIntake();
}

init();
