// v10 b2b-staff (STF-9، U10-S22/S23؛ مدير النظام فقط، P0) — في صفحة الإعدادات:
// • b2bSettingsCard «خدمة الشركات» (#/settings?section=b2b): تشغيل البوابة، «رابط شروط الخدمة للشركات»، «مواعيد العمل لمستوى
//   الخدمة» (نفس مواعيد العمل العامة — افتراضي — أو مواعيد مختلفة للشركات، CO-11)، «ساعات الطلبات العاجلة» (L-53)، العطلات،
//   مواعيد المتابعة، «المساحة المتاحة لكل شركة (ميجابايت)»، الأمان والاحتفاظ. بلا حقول فواتير (L-31).
//   يحفظ عبر PUT /api/admin/b2b/settings (لا عبر إعدادات المؤسسة العامة؛ guard #23).
// • companyPlansCard «باقات الشركات» (#/settings?section=plans): قائمة الباقات ومحرر شروطها (+ الطلبات العاجلة في الدورة).

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { count } from '../../lib/fmt.js';
import { card, form, button, badge, icon, alertBox, toast, errorMessage, loading, errorState, modal, table, discardGuard, emptyState } from '../../lib/ui.js';
import { calendarsFromJson, businessHoursText, urgentHoursText } from '../../lib/company-sla.js';
import { termsEditor, termsSummary } from './company-plan-terms.js';

/** أيام الأسبوع بترقيم getDay (0 = الأحد) وبترتيب أسبوع العمل المصري (السبت أولًا) */
export const WEEK = [
  { d: 6, label: 'السبت' },
  { d: 0, label: 'الأحد' },
  { d: 1, label: 'الاثنين' },
  { d: 2, label: 'الثلاثاء' },
  { d: 3, label: 'الأربعاء' },
  { d: 4, label: 'الخميس' },
  { d: 5, label: 'الجمعة' },
];
export const TERMS_URL_HINT = 'يظهر في صفحة قبول الدعوة. اتركه فارغًا إن لم تُعد الشروط بعد.';
const INHERIT = 'نفس مواعيد العمل العامة';
const OVERRIDE = 'مواعيد مختلفة للشركات';
const NUMBER_FIELDS = [
  ['b2b_auto_close_days', 'إغلاق تلقائي بعد التسليم (أيام)', 1, 60],
  ['b2b_revision_window_days', 'مهلة طلب التعديلات (أيام)', 1, 365],
  ['b2b_reminder_after_hours', 'تذكير الشركة بعد (ساعات عمل)', 1, 240],
  ['b2b_max_reminders', 'عدد التذكيرات', 0, 10],
  ['b2b_quote_valid_days', 'صلاحية عرض السعر (أيام)', 1, 90],
  ['b2b_trial_days', 'الفترة التجريبية (أيام)', 1, 120],
  ['b2b_ended_readonly_days', 'الاطلاع بعد انتهاء الاشتراك (أيام)', 0, 365],
];
const LIMIT_FIELDS = [
  ['b2b_storage_mb', 'المساحة المتاحة لكل شركة (ميجابايت)', 50, 102400],
  ['b2b_files_per_day', 'الملفات في اليوم لكل شركة', 10, 10000],
  ['company_session_idle_hours', 'الخروج بعد خمول (ساعات)', 1, 72],
  ['company_session_max_hours', 'أقصى مدة للجلسة (ساعات)', 1, 720],
  ['company_invite_valid_hours', 'صلاحية رابط الدعوة (ساعات)', 1, 336],
  ['company_reset_valid_minutes', 'صلاحية رابط تعيين كلمة المرور (دقائق)', 10, 1440],
  ['company_email_max_per_hour', 'رسائل البريد في الساعة لكل مستخدم', 1, 200],
  ['b2b_outbox_retention_days', 'الاحتفاظ بصادر البريد (أيام)', 7, 3650],
  ['b2b_notifications_retention_days', 'الاحتفاظ بالإشعارات المقروءة (أيام)', 30, 3650],
];
const REMIND_KINDS = [
  ['contract', 'العقود'],
  ['licence', 'التراخيص'],
  ['key_date', 'المواعيد المهمة'],
  ['dispute', 'النزاعات'],
  ['person', 'المفوَّضون'],
  ['other', 'غيرها'],
];

/** محرر أيام وساعات: { el, get() → {days, from, to}, set(v), check() } */
function hoursEditor(value, { allDayOption = false, label: aria = 'المواعيد' } = {}) {
  const v = value || { days: [6, 0, 1, 2, 3, 4], from: '10:00', to: '16:00' };
  const boxes = WEEK.map((w) => {
    const cb = h('input', { type: 'checkbox', value: String(w.d), checked: v.days.includes(w.d) });
    return { w, cb, el: h('label.check.cs-day', cb, h('span', w.label)) };
  });
  const allDay = allDayOption ? h('input', { type: 'checkbox', checked: v.from === '00:00' && v.to === '24:00' }) : null;
  const from = h('input.input', { type: 'time', value: v.from === '24:00' ? '23:59' : v.from, 'aria-label': `${aria}: من`, dir: 'ltr' });
  const to = h('input.input', { type: 'time', value: v.to === '24:00' ? '23:59' : v.to, 'aria-label': `${aria}: إلى`, dir: 'ltr' });
  const err = h('p.field-error', { hidden: true });
  const times = h('div.cs-times', h('label.cs-time', h('span', 'من'), from), h('label.cs-time', h('span', 'إلى'), to));
  const syncAll = () => {
    if (allDay) times.hidden = allDay.checked;
  };
  allDay?.addEventListener('change', syncAll);
  syncAll();
  const el = h('div.cs-hours', { role: 'group', 'aria-label': aria }, h('div.cs-days', boxes.map((b) => b.el)), allDay ? h('label.check', allDay, h('span', 'على مدار اليوم')) : null, times, err);
  return {
    el,
    get() {
      const days = boxes.filter((b) => b.cb.checked).map((b) => b.w.d);
      if (allDay?.checked) return { days, from: '00:00', to: '24:00' };
      return { days, from: from.value, to: to.value };
    },
    check() {
      const x = this.get();
      let msg = '';
      if (!x.days.length) msg = 'اختر يومًا واحدًا على الأقل';
      else if (!/^\d{2}:\d{2}$/.test(x.from) || !/^\d{2}:\d{2}$/.test(x.to) || (x.to !== '24:00' && x.from >= x.to)) msg = 'البداية قبل النهاية';
      err.textContent = msg;
      err.hidden = !msg;
      return !msg;
    },
    setError(msg) {
      err.textContent = msg || '';
      err.hidden = !msg;
    },
  };
}

/** بطاقة «خدمة الشركات» */
export function b2bSettingsCard() {
  const host = h('div');
  const el = card({
    title: 'خدمة الشركات',
    subtitle: 'مواعيد مستوى الخدمة وساعات الطلبات العاجلة وحدود الملفات وشروط الخدمة لبوابة الشركات. لا تراها الشركات إلا كنتائجها (المواعيد والوعود).',
    icon: 'building',
    body: host,
  });
  el.id = 'b2b';
  async function load() {
    mount(host, loading());
    let data;
    try {
      data = await api.get('/admin/b2b/settings');
    } catch (err) {
      mount(host, errorState(err, load));
      return;
    }
    draw(data);
  }
  function draw(data) {
    const val = data.values || {};
    const office = data.office_hours_schedule || { days: [6, 0, 1, 2, 3, 4], from: '10:00', to: '16:00' };
    let officeText = '';
    try {
      officeText = businessHoursText(calendarsFromJson({ business: office }).business);
    } catch {
      officeText = '';
    }
    const enabled = h('input', { type: 'checkbox', checked: val.b2b_enabled !== false });
    const terms = form([{ name: 'b2b_terms_url', label: 'رابط شروط الخدمة للشركات', type: 'text', ltr: true, maxLength: 500, placeholder: 'https://', hint: TERMS_URL_HINT }], { values: val, footer: false, columns: 1 });
    // مواعيد العمل لمستوى الخدمة (CO-11)
    let mode = val.b2b_business_hours ? 'override' : 'inherit';
    const bh = hoursEditor(val.b2b_business_hours || office, { label: 'مواعيد العمل للشركات' });
    const bhBox = h('div.cs-hours-box', bh.el);
    const modeRadio = (m, text, sub) =>
      h('label.check.cs-radio', h('input', { type: 'radio', name: 'b2b-hours-mode', value: m, checked: mode === m, onChange: () => ((mode = m), (bhBox.hidden = mode !== 'override')) }), h('span', text, sub ? h('span.muted', ` — ${sub}`) : null));
    bhBox.hidden = mode !== 'override';
    // ساعات الطلبات العاجلة (L-53)
    const uh = hoursEditor(val.b2b_urgent_hours, { allDayOption: true, label: 'ساعات الطلبات العاجلة' });
    let urgentText = '';
    try {
      urgentText = urgentHoursText(calendarsFromJson({ business: office, urgent: val.b2b_urgent_hours }).urgent);
    } catch {
      urgentText = '';
    }
    // العطلات الرسمية (≤ 60)
    let holidays = [...(val.b2b_holidays || [])];
    const holHost = h('div');
    const holInput = h('input.input', { type: 'date', dir: 'ltr', 'aria-label': 'تاريخ عطلة' });
    const drawHol = () =>
      mount(
        holHost,
        holidays.length
          ? h(
              'ul.cs-holidays',
              holidays.map((d, i) => h('li.chip', h('bdi.num', { dir: 'ltr' }, d), h('button.chip-remove', { type: 'button', 'aria-label': `حذف ${d}`, onClick: () => ((holidays = holidays.filter((_, j) => j !== i)), drawHol()) }, icon('x', { size: 14 })))),
            )
          : h('p.muted', 'لا عطلات مسجلة.'),
      );
    drawHol();
    const addHol = button('إضافة', {
      variant: 'secondary',
      size: 'sm',
      icon: 'plus',
      onClick: () => {
        const d = holInput.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || holidays.includes(d)) return;
        if (holidays.length >= 60) return toast('60 عطلة على الأكثر.', 'warning');
        holidays = [...holidays, d].sort();
        holInput.value = '';
        drawHol();
      },
    });
    const follow = form(
      NUMBER_FIELDS.map(([name, lbl, min, max]) => ({ name, label: lbl, type: 'number', integer: true, required: true, min, max })),
      { values: val, footer: false },
    );
    const limits = form(
      LIMIT_FIELDS.map(([name, lbl, min, max]) => ({ name, label: lbl, type: 'number', integer: true, required: true, min, max })),
      { values: val, footer: false },
    );
    const remind = val.b2b_memory_remind_days || {};
    const remindForm = form(
      REMIND_KINDS.map(([k, lbl]) => ({ name: `remind_${k}`, label: `تذكير ${lbl} قبل (أيام)`, ltr: true, maxLength: 40, placeholder: '60، 30، 7' })),
      { values: Object.fromEntries(REMIND_KINDS.map(([k]) => [`remind_${k}`, (remind[k] || []).join('، ')])), footer: false },
    );
    const alertHost = h('div.cs-alert');
    const parseList = (s) =>
      String(s || '')
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .split(/[,،\s]+/)
        .filter(Boolean)
        .map(Number);
    const save = button('حفظ إعدادات خدمة الشركات', {
      variant: 'primary',
      icon: 'check',
      onClick: async () => {
        mount(alertHost, null);
        let ok = terms.validate() & follow.validate() & limits.validate() & uh.check();
        const url = String(terms.getValues().b2b_terms_url || '').trim();
        if (url && !/^https:\/\/[^\s<>"']+$/i.test(url)) {
          terms.setErrors({ b2b_terms_url: 'رابط يبدأ بـ https:// أو اتركه فارغًا' });
          ok = false;
        }
        if (mode === 'override') ok = bh.check() && ok;
        const rv = remindForm.getValues();
        const remindOut = {};
        for (const [k] of REMIND_KINDS) {
          const list = parseList(rv[`remind_${k}`]);
          if (list.some((n) => !Number.isInteger(n) || n < 0 || n > 365) || list.length > 6) {
            remindForm.setErrors({ [`remind_${k}`]: 'حتى 6 أعداد من 0 إلى 365، تفصلها فاصلة' });
            ok = false;
          }
          remindOut[k] = list;
        }
        if (!ok) return;
        const fv = follow.getValues();
        const lv = limits.getValues();
        if (lv.company_session_max_hours < lv.company_session_idle_hours) {
          limits.setErrors({ company_session_max_hours: 'أقصى مدة للجلسة لا تقل عن مدة الخمول' });
          return;
        }
        const body = {
          b2b_enabled: enabled.checked,
          b2b_terms_url: terms.getValues().b2b_terms_url || '',
          b2b_business_hours: mode === 'override' ? bh.get() : null,
          b2b_urgent_hours: uh.get(),
          b2b_holidays: holidays,
          b2b_memory_remind_days: remindOut,
          ...fv,
          ...lv,
        };
        save.disabled = true;
        try {
          const res = await api.put('/admin/b2b/settings', body);
          toast('حُفظت إعدادات خدمة الشركات.', 'success');
          draw(res);
        } catch (err) {
          mount(alertHost, alertBox(errorMessage(err), 'danger'));
          const f = err?.details?.fields || {};
          terms.setErrors(f);
          follow.setErrors(f);
          limits.setErrors(f);
          if (f.b2b_business_hours) bh.setError(f.b2b_business_hours);
          if (f.b2b_urgent_hours) uh.setError(f.b2b_urgent_hours);
        } finally {
          save.disabled = false;
        }
      },
    });
    const sec = (title, ...kids) => h('section.cs-section', h('h3.cs-section-title', title), ...kids);
    mount(
      host,
      h(
        'div.cs-body',
        alertHost,
        sec(
          'بوابة الشركات',
          h('label.check.check-single', enabled, h('span', 'تشغيل بوابة الشركات')),
          h('p.field-hint', 'عند الإيقاف لا تفتح البوابة لأي شركة، ويستمر عمل فريق المكتب على الطلبات القائمة.'),
          terms.el,
        ),
        sec(
          'مواعيد العمل لمستوى الخدمة',
          h('div.cs-plan', modeRadio('inherit', INHERIT, officeText), modeRadio('override', OVERRIDE, null)),
          bhBox,
          h('p.field-hint', 'تُحسب بها مواعيد الرد الأول والتسليم بساعات العمل، وتراها الشركة في «الباقة والاستخدام».'),
        ),
        sec('ساعات الطلبات العاجلة', urgentText ? h('p.cs-note', icon('clock', { size: 16 }), `الآن: ${urgentText}`) : null, uh.el, h('p.field-hint', 'لا تُحتسب مهلة الطلب العاجل إلا داخل هذه الساعات؛ ويُبلَّغ مدير العلاقة ومديرو النظام بكل طلب عاجل.')),
        sec('العطلات الرسمية', holHost, h('div.cs-hol-add', holInput, addHol), h('p.field-hint', `حتى ${count(60, ['عطلة', 'عطلتين', 'عطلات', 'عطلة'])}. لا تُحتسب ساعات العمل فيها.`)),
        sec('مواعيد المتابعة', follow.el),
        sec('تذكيرات الذاكرة القانونية', remindForm.el),
        sec('الملفات والجلسات والاحتفاظ', limits.el),
        h('div.form-actions', save),
      ),
    );
  }
  load();
  return el;
}

// ───────────────────────── «باقات الشركات» (U10-S23) ─────────────────────────

export function companyPlansCard() {
  const host = h('div');
  const el = card({
    title: 'باقات الشركات',
    subtitle: 'شروط كل باقة تُنسخ إلى اشتراك الشركة عند الاشتراك؛ تعديل الباقة لا يغيّر اشتراكات قائمة.',
    icon: 'fileText',
    actions: button('باقة جديدة', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => editPlan(null) }),
    body: host,
  });
  el.id = 'plans';
  async function load() {
    mount(host, loading());
    try {
      const res = await api.get('/admin/company-plans');
      const items = res.items || [];
      mount(
        host,
        items.length
          ? table({
              caption: 'باقات الشركات',
              stack: true,
              rows: items,
              columns: [
                { key: 'name', label: 'الباقة', render: (p) => h('div.cq-cell-req', h('strong', p.name), h('bdi.muted', { dir: 'ltr' }, p.key)) },
                { key: 'terms', label: 'الشروط', render: (p) => h('span', termsSummary(p.terms || {}, { money: true })) },
                { key: 'companies', label: 'الشركات', render: (p) => h('span.num', String(p.companies ?? 0)) },
                { key: 'active', label: 'الحالة', render: (p) => badge(p.active ? 'متاحة' : 'موقوفة', p.active ? 'success' : 'neutral', { dot: true }) },
                { key: 'a', label: 'إجراءات', render: (p) => button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: () => editPlan(p) }) },
              ],
            })
          : emptyState('لا باقات بعد. أنشئوا باقة قبل إضافة أول شركة، أو استخدموا شروطًا مخصصة عند الإضافة.', null, { compact: true, icon: 'fileText' }),
      );
    } catch (err) {
      mount(host, errorState(err, load));
    }
  }

  function editPlan(p) {
    const isNew = !p;
    const editor = termsEditor(p?.terms || {}, { money: true });
    const f = form(
      [
        { name: 'name', label: 'اسم الباقة', required: true, maxLength: 80 },
        isNew ? { name: 'key', label: 'المفتاح', required: true, ltr: true, maxLength: 40, placeholder: 'growth', hint: 'حروف لاتينية صغيرة وأرقام فقط؛ لا يتغير بعد الإنشاء.' } : null,
        { name: 'description', label: 'الوصف', type: 'textarea', maxLength: 1000, rows: 2 },
        { name: 'active', type: 'checkbox', text: 'متاحة للاشتراكات الجديدة' },
      ].filter(Boolean),
      { values: { name: p?.name || '', key: '', description: p?.description || '', active: p ? p.active : true }, footer: false },
    );
    const alertHost = h('div.cs-alert');
    let done = false;
    const snapshot = JSON.stringify(f.getValues());
    modal({
      sheet: true,
      className: 'cs-sheet cs-sheet-lg',
      title: isNew ? 'باقة جديدة' : `تعديل ${p.name}`,
      subtitle: isNew ? null : `${count(p.companies || 0, ['شركة واحدة', 'شركتين', 'شركات', 'شركة'])} على هذه الباقة — تحتفظ اشتراكاتها بشروطها الحالية.`,
      beforeClose: discardGuard(() => editor.isDirty() || JSON.stringify(f.getValues()) !== snapshot, { singular: true }),
      body: h('div.cs-body', alertHost, f.el, h('h3.cs-section-title', 'الشروط'), editor.el),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: isNew ? 'إنشاء الباقة' : 'حفظ الباقة',
          variant: 'primary',
          icon: 'check',
          onClick: async () => {
            mount(alertHost, null);
            if (!(f.validate() & editor.validate())) return false;
            const v = f.getValues();
            const body = { name: v.name, description: v.description || null, active: !!v.active, terms: editor.getTerms() };
            try {
              if (isNew) await api.post('/admin/company-plans', { ...body, key: String(v.key || '').trim().toLowerCase() });
              else await api.patch(`/admin/company-plans/${p.id}`, body);
              done = true;
              return undefined;
            } catch (err) {
              editor.showError(err);
              f.showError(err);
              mount(alertHost, alertBox(errorMessage(err), 'danger'));
              return false;
            }
          },
        },
      ],
      onClose: () => {
        if (!done) return;
        toast(isNew ? 'أُنشئت الباقة.' : 'حُفظت الباقة.', 'success');
        load();
      },
    });
  }

  load();
  return el;
}
