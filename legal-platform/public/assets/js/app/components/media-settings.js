// v12 media (MD-11، H-M4، §10.2) — بطاقة «المستندات والصوت» في الإعدادات (‎#/settings?section=media‎، لمدير النظام).
// الرسائل الصوتية من الموقع وصفحة المتابعة (مؤرشفة افتراضيًا)، تحويل الرسائل الصوتية إلى نص، تحسين صور المستندات على جهاز
// المرسل وعلى الخادم، وقراءة نص المستندات (Tesseract على الخادم أو Claude بشروطه). مفاتيح الخصوصية (تحويل صوت «خيري» عند جهة
// خارجية، إرسال صور المستندات إلى Claude، ومستندات الشركات) تطلب تأكيدًا يذكر تغيّر سياسة الخصوصية، ويُسجَّل تغييرها.
// التاريخان «معلن منذ» يضبطهما الخادم وحده ويظهران للقراءة فقط. الرموز SET-20…SET-35.
import { h, tagged } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { date } from '../../lib/fmt.js';
import { card, form, toast, confirmDialog, icon } from '../../lib/ui.js';

export const MEDIA_SETTING_KEYS = [
  'web_voice_enabled',
  'stt_auto',
  'stt_charity_third_party',
  'stt_minutes_per_client_day',
  'scan_client_enabled',
  'scan_server_auto',
  'ocr_provider',
  'ocr_claude_allowed',
  'ocr_claude_companies',
  'ocr_claude_budget_pct',
  'ocr_model',
  'ocr_max_pages',
];

export const MEDIA_COPY = {
  title: 'المستندات والصوت',
  web_voice: 'الرسائل الصوتية من الموقع وصفحة المتابعة',
  web_voice_hint: 'رسائل واتساب الصوتية تصل دائمًا، والنص الآلي يعمل عليها.',
  stt_auto: 'تحويل الرسائل الصوتية إلى نص تلقائيًا',
  stt_auto_hint: 'يعمل بعد ضبط الخدمة في «التكاملات». النص مسودة يراجعها الفريق.',
  stt_charity: 'تحويل صوت المستفيدات من «خيري» عند جهة خارجية',
  stt_charity_hint: 'متوقف افتراضيًا. الخادم الخاص بالمكتب يعمل للجميع.',
  stt_minutes: 'أقصى دقائق تحويل لكل شخص في اليوم',
  scan_client: 'تحسين صور المستندات على جهاز المرسل',
  scan_server: 'تحسين الصور الواردة على الخادم',
  scan_server_hint: 'لصور واتساب والصور المرفوعة دون تحسين. يحتاج ImageMagick على الخادم.',
  ocr: 'قراءة نص المستندات',
  ocr_claude: 'السماح بإرسال صور المستندات إلى Claude لقراءتها',
  ocr_claude_confirm: 'ستضيف سياسة الخصوصية أن صور المستندات قد تُرسل إلى Anthropic لقراءة النص فقط. هل تريدون المتابعة؟',
  ocr_companies: 'السماح بقراءة مستندات الشركات بـ Claude',
  ocr_companies_confirm: 'ستُرسل صور مستندات الشركات أيضًا إلى Anthropic لقراءة النص.',
  ocr_budget: 'نسبة ميزانية الذكاء الاصطناعي المتاحة لقراءة المستندات (%)',
  ocr_model: 'نموذج القراءة',
  ocr_model_hint: 'فارغ = نموذج تكامل الذكاء الاصطناعي.',
  ocr_pages: 'أقصى عدد صفحات تُقرأ من المستند',
};
const OCR_OPTIONS = [
  { value: 'auto', label: 'تلقائي' },
  { value: 'tesseract', label: 'Tesseract على الخادم' },
  { value: 'claude', label: 'Claude' },
  { value: 'off', label: 'متوقفة' },
];

/** تأكيد تحويل صوت «خيري» عند جهة خارجية (L12-62)، باسم المزوّد من «التكاملات» */
export function charityConfirmText(vendor) {
  const who = String(vendor || '').trim() || 'جهة تقنية خارجية';
  return `سيُرسل صوت المستفيدات من «خيري» إلى ${who} لتحويله إلى نص، وقد يُعالج خارج مصر. هل تريدون المتابعة؟`;
}

/** @param {object} settings إعدادات GET /api/admin/settings */
export function mediaSettingsCard(settings = {}) {
  let vendor = '';
  const sinceLine = (k, text) => (settings[k] ? `${text} ${date(settings[k])}` : '');
  const sttSince = h('p.pa-note.small.field-full', { tag: 'SET-24', hidden: !settings.stt_third_party_since }, sinceLine('stt_third_party_since', 'تحويل الصوت عند جهة خارجية معلن منذ'));
  const ocrSince = h('p.pa-note.small.field-full', { tag: 'SET-33', hidden: !settings.ocr_claude_since }, sinceLine('ocr_claude_since', 'قراءة المستندات بـ Claude معلنة منذ'));
  const initial = {
    web_voice_enabled: settings.web_voice_enabled === true,
    stt_auto: settings.stt_auto !== false,
    stt_charity_third_party: settings.stt_charity_third_party === true,
    stt_minutes_per_client_day: settings.stt_minutes_per_client_day ?? 20,
    scan_client_enabled: settings.scan_client_enabled !== false,
    scan_server_auto: settings.scan_server_auto !== false,
    ocr_provider: settings.ocr_provider || 'auto',
    ocr_claude_allowed: settings.ocr_claude_allowed === true,
    ocr_claude_companies: settings.ocr_claude_companies === true,
    ocr_claude_budget_pct: settings.ocr_claude_budget_pct ?? 20,
    ocr_model: settings.ocr_model || '',
    ocr_max_pages: settings.ocr_max_pages ?? 10,
  };
  let current = { ...initial };

  const f = form(
    [
      { name: 'web_voice_enabled', type: 'checkbox', full: true, text: MEDIA_COPY.web_voice, hint: MEDIA_COPY.web_voice_hint, tag: 'SET-305' },
      { name: 'stt_auto', type: 'checkbox', full: true, text: MEDIA_COPY.stt_auto, hint: MEDIA_COPY.stt_auto_hint, tag: 'SET-306' },
      { name: 'stt_charity_third_party', type: 'checkbox', full: true, text: MEDIA_COPY.stt_charity, hint: MEDIA_COPY.stt_charity_hint, tag: 'SET-307' },
      { name: 'stt_minutes_per_client_day', label: MEDIA_COPY.stt_minutes, type: 'number', integer: true, required: true, min: 1, max: 240, tag: 'SET-308' },
      { name: 'scan_client_enabled', type: 'checkbox', full: true, text: MEDIA_COPY.scan_client, tag: 'SET-309' },
      { name: 'scan_server_auto', type: 'checkbox', full: true, text: MEDIA_COPY.scan_server, hint: MEDIA_COPY.scan_server_hint, tag: 'SET-310' },
      { name: 'ocr_provider', label: MEDIA_COPY.ocr, type: 'select', placeholder: false, options: OCR_OPTIONS, tag: 'SET-311' },
      { name: 'ocr_claude_allowed', type: 'checkbox', full: true, text: MEDIA_COPY.ocr_claude, tag: 'SET-312' },
      { name: 'ocr_claude_companies', type: 'checkbox', full: true, text: MEDIA_COPY.ocr_companies, tag: 'SET-313' },
      { name: 'ocr_claude_budget_pct', label: MEDIA_COPY.ocr_budget, type: 'number', integer: true, required: true, min: 0, max: 100, tag: 'SET-314' },
      { name: 'ocr_model', label: MEDIA_COPY.ocr_model, ltr: true, maxLength: 44, hint: MEDIA_COPY.ocr_model_hint, tag: 'SET-315' },
      { name: 'ocr_max_pages', label: MEDIA_COPY.ocr_pages, type: 'number', integer: true, required: true, min: 1, max: 30, tag: 'SET-316' },
    ],
    {
      values: initial,
      submitLabel: 'حفظ',
      submitIcon: 'check',
      onSubmit: async (v, fapi) => {
        const next = {
          web_voice_enabled: Boolean(v.web_voice_enabled),
          stt_auto: Boolean(v.stt_auto),
          stt_charity_third_party: Boolean(v.stt_charity_third_party),
          stt_minutes_per_client_day: v.stt_minutes_per_client_day,
          scan_client_enabled: Boolean(v.scan_client_enabled),
          scan_server_auto: Boolean(v.scan_server_auto),
          ocr_provider: v.ocr_provider || 'auto',
          ocr_claude_allowed: Boolean(v.ocr_claude_allowed),
          ocr_claude_companies: Boolean(v.ocr_claude_companies),
          ocr_claude_budget_pct: v.ocr_claude_budget_pct,
          ocr_model: String(v.ocr_model || '').trim(),
          ocr_max_pages: v.ocr_max_pages,
        };
        // مفاتيح الخصوصية: التفعيل يطلب تأكيدًا يذكر ما يتغير في سياسة الخصوصية (L12-19، L12-62)
        const turnsOn = (k) => next[k] && !current[k];
        const ask = async (message) => confirmDialog({ title: 'تأكيد', message, confirmLabel: 'تفعيل', cancelLabel: 'إلغاء', tag: 'SET-215' });
        if (turnsOn('stt_charity_third_party') && !(await ask(charityConfirmText(vendor)))) return;
        if (turnsOn('ocr_claude_allowed') && !(await ask(MEDIA_COPY.ocr_claude_confirm))) return;
        if (turnsOn('ocr_claude_companies') && !(await ask(MEDIA_COPY.ocr_companies_confirm))) return;
        const saved = await api.patch('/admin/settings', next);
        if (saved && typeof saved === 'object') {
          const values = {};
          for (const k of MEDIA_SETTING_KEYS) if (k in saved) values[k] = saved[k];
          fapi.setValues(values);
          current = { ...current, ...values };
          if (saved.ocr_claude_since) {
            ocrSince.textContent = `قراءة المستندات بـ Claude معلنة منذ ${date(saved.ocr_claude_since)}`;
            ocrSince.hidden = false;
          }
        } else current = { ...current, ...next };
        toast('تم الحفظ', 'success');
      },
      submitTag: 'SET-317',
      tag: 'SET-318',
    },
  );
  f.el.classList.add('pa-stset-form');
  // الرموز على غلاف كل حقل (T12-15): SET-20…SET-32، وزر الحفظ SET-35
  tagged('SET-20', f.control('web_voice_enabled')?.wrap);
  tagged('SET-21', f.control('stt_auto')?.wrap);
  tagged('SET-22', f.control('stt_charity_third_party')?.wrap);
  tagged('SET-23', f.control('stt_minutes_per_client_day')?.wrap);
  tagged('SET-25', f.control('scan_client_enabled')?.wrap);
  tagged('SET-26', f.control('scan_server_auto')?.wrap);
  tagged('SET-27', f.control('ocr_provider')?.wrap);
  tagged('SET-28', f.control('ocr_claude_allowed')?.wrap);
  tagged('SET-29', f.control('ocr_claude_companies')?.wrap);
  tagged('SET-30', f.control('ocr_claude_budget_pct')?.wrap);
  tagged('SET-31', f.control('ocr_model')?.wrap);
  tagged('SET-32', f.control('ocr_max_pages')?.wrap);
  const submit = f.el.querySelector('button[type="submit"]');
  if (submit) tagged('SET-35', submit);
  // السطران «معلن منذ» تحت المفتاحين
  f.control('stt_charity_third_party')?.wrap?.after(sttSince);
  f.control('ocr_claude_companies')?.wrap?.after(ocrSince);

  // اسم المزوّد لنص التأكيد (من «التكاملات»؛ بلا مفتاح ولا سر)
  api
    .get('/admin/integrations', null, { background: true })
    .then((d) => {
      const stt = (d && Array.isArray(d.items) ? d.items : []).find((x) => x.name === 'stt');
      const vn = stt && (stt.fields || []).find((x) => x.key === 'vendor_name');
      vendor = vn && typeof vn.value === 'string' ? vn.value : '';
    })
    .catch(() => {});

  const el = card({
    title: MEDIA_COPY.title,
    subtitle: 'الرسائل الصوتية، وتحسين صور المستندات، وقراءة نصها. النص الآلي مسودة يراجعها الفريق قبل أي استخدام.',
    icon: 'fileText',
    className: 'pa-stset',
    body: h('div', h('p.pa-note.small', icon('info', { size: 15 }), h('span', 'تحويل الصوت عند جهة خارجية وإرسال الصور إلى Claude يظهران في سياسة الخصوصية فور التفعيل.')), f.el),
    titleTag: 'SET-216',
    tag: 'SET-217',
  });
  el.id = 'media';
  return tagged('SET-34', el);
}
