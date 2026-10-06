// بطاقة المستفيد (البحث الاجتماعي): صفة المستفيد والأبناء (سنة الميلاد والنوع فقط) والدخل والسكن والعمل،
// مع درجة احتياج شفافة وأسبابها واقتراح أولوية الطلب. للإدارة فقط — لا تظهر للمحامين إطلاقًا.
// (الإصدار 9 — وحدة practice)
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, options, date, count, num, percent, toLatinDigits, cairoParts } from '../../lib/fmt.js';
import {
  card, button, asyncButton, badge, icon, kv, emptyState, loading, errorState, alertBox, modal, form, toast, progressBar, uid, errorMessage,
} from '../../lib/ui.js';

const LEVEL_TONE = { severe: 'danger', high: 'warning', medium: 'info', low: 'neutral' };
const SCORE_TONE = { severe: 'danger', high: 'warning', medium: 'info', low: 'primary' };

function childrenText(kids) {
  if (!kids || !kids.length) return null;
  const year = cairoParts(new Date()).year;
  return h(
    'ul.v9p-kids',
    kids.map((k) => {
      const age = k.birth_year ? year - k.birth_year : null;
      return h('li', h('span.ltr', { dir: 'ltr' }, String(k.birth_year)), k.gender ? ` · ${label('child_gender', k.gender)}` : '', age != null ? h('span.muted', ` (${age < 1 ? 'أقل من سنة' : count(age, 'year')})`) : '');
    }),
  );
}

/** محرر قائمة الأبناء: سنة الميلاد والنوع فقط (بلا أسماء) */
function childrenEditor(initial = []) {
  const list = h('ol.v9p-kid-rows');
  const year = cairoParts(new Date()).year;
  let rows = [];
  function addRow(k = {}) {
    const n = rows.length + 1;
    const yId = uid('kid-y');
    const gId = uid('kid-g');
    const yearIn = h('input.input', { id: yId, type: 'text', inputmode: 'numeric', dir: 'ltr', maxlength: 4, placeholder: String(year - 5), value: k.birth_year ? String(k.birth_year) : '' });
    const genderSel = h(
      'select.input',
      { id: gId },
      h('option', { value: '' }, '— النوع —'),
      h('option', { value: 'm' }, 'ذكر'),
      h('option', { value: 'f' }, 'أنثى'),
    );
    genderSel.value = k.gender || '';
    const row = { yearIn, genderSel };
    const removeBtn = button('', {
      size: 'sm',
      variant: 'ghost',
      icon: 'trash',
      title: 'حذف هذا السطر',
      onClick: () => {
        rows = rows.filter((r) => r !== row);
        row.el.remove();
        renumber();
      },
    });
    row.labels = [h('label.sr-only', { htmlFor: yId }), h('label.sr-only', { htmlFor: gId })];
    row.el = h('li.v9p-kid-row', row.labels[0], yearIn, row.labels[1], h('div.select-wrap', genderSel), removeBtn);
    rows.push(row);
    list.append(row.el);
    renumber();
    return row;
  }
  function renumber() {
    rows.forEach((r, i) => {
      r.labels[0].textContent = `سنة ميلاد الابن رقم ${i + 1}`;
      r.labels[1].textContent = `نوع الابن رقم ${i + 1}`;
    });
  }
  (initial || []).forEach((k) => addRow(k));
  const addBtn = button('إضافة ابن أو ابنة', { size: 'sm', icon: 'plus', onClick: () => addRow().yearIn.focus() });
  const errEl = h('p.field-error', { hidden: true, role: 'alert' });
  const el = h(
    'div.field.field-full.v9p-kids-field',
    h('span.field-label', 'الأبناء (سنة الميلاد والنوع فقط)'),
    h('p.field-hint', 'لا تُسجَّل أسماء الأبناء حفاظًا على خصوصيتهم. تُحسب أعمارهم تلقائيًا.'),
    list,
    addBtn,
    errEl,
  );
  return {
    el,
    value() {
      errEl.hidden = true;
      const out = [];
      for (const [i, r] of rows.entries()) {
        const raw = toLatinDigits(r.yearIn.value).trim();
        if (!raw && !r.genderSel.value) continue;
        const y = Number(raw);
        if (!/^\d{4}$/.test(raw) || y > year || y < year - 40) {
          errEl.textContent = `سنة ميلاد الابن رقم ${i + 1} غير صحيحة`;
          errEl.hidden = false;
          r.yearIn.focus();
          throw new Error(`سنة ميلاد الابن رقم ${i + 1} غير صحيحة`);
        }
        out.push({ birth_year: y, gender: r.genderSel.value || null });
      }
      return out;
    },
  };
}

function editDialog(view, onSaved) {
  const p = view.profile || {};
  const f = form(
    [
      { name: 'relation', label: 'صفة المستفيد', type: 'select', options: options('beneficiary_relation') },
      { name: 'children_count', label: 'عدد الأبناء', type: 'number', integer: true, min: 0, max: 30 },
      { name: 'monthly_income_band', label: 'الدخل الشهري للأسرة', type: 'select', options: options('income_band') },
      { name: 'housing', label: 'السكن', type: 'select', options: options('housing') },
      { name: 'employment', label: 'العمل', type: 'select', options: options('employment') },
      { name: 'foundation_file_number', label: 'رقم الملف لدى المؤسسة', ltr: true, maxLength: 40, hint: 'إن كانت الأسرة مسجلة في أحد برامج المؤسسة (نجاح، المائدة، سلامة …)' },
      { name: 'is_foundation_beneficiary', type: 'checkbox', text: 'الأسرة مستفيدة من برامج المؤسسة الأخرى', full: true },
      { name: 'has_disability', type: 'checkbox', text: 'في الأسرة إعاقة أو مرض مزمن', full: true },
      { name: 'notes', label: 'ملاحظات البحث الاجتماعي', type: 'textarea', rows: 3, maxLength: 3000, hint: 'للإدارة فقط — لا تظهر للمحامين ولا للمستفيد' },
      {
        name: 'verify',
        type: 'checkbox',
        text: 'تم التحقق من هذه البيانات (زيارة أو مستندات أو بحث اجتماعي)',
        full: true,
        hint: p.verified ? 'حفظ التعديل يُسقط التحقق السابق ما لم تؤكده من جديد هنا.' : null,
      },
    ],
    {
      // التأكيد قرار واعٍ في كل حفظ: لا يُحدَّد مسبقًا حتى لا يُعاد توثيق بيانات عُدّلت دون مراجعة
      values: { ...p, verify: false },
      footer: false,
    },
  );
  const kids = childrenEditor(p.children || []);
  f.el.querySelector('.form-grid').insertBefore(kids.el, f.control('monthly_income_band').wrap);
  return modal({
    title: view.profile ? 'تعديل بطاقة المستفيد' : 'إضافة بطاقة المستفيد',
    size: 'lg',
    body: h('div.stack', h('p.modal-intro', 'بيانات البحث الاجتماعي تساعد في ترتيب الأولويات وفي تقرير الأثر، ولا يطّلع عليها المحامون.'), f.el),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'حفظ البطاقة',
        variant: 'primary',
        icon: 'check',
        onClick: async () => {
          if (!f.validate()) return false;
          let children;
          try {
            children = kids.value();
          } catch {
            return false;
          }
          const v = f.getValues();
          if (v.children_count != null && v.children_count < children.length) {
            f.setErrors({ children_count: 'عدد الأبناء أقل من عدد السطور المسجلة' });
            return false;
          }
          try {
            const res = await api.put(`/admin/clients/${view.client.id}/beneficiary`, {
              relation: v.relation || null,
              children_count: v.children_count ?? (children.length || null),
              children,
              monthly_income_band: v.monthly_income_band || null,
              housing: v.housing || null,
              employment: v.employment || null,
              foundation_file_number: v.foundation_file_number || null,
              is_foundation_beneficiary: !!v.is_foundation_beneficiary,
              has_disability: !!v.has_disability,
              notes: v.notes || null,
              verify: !!v.verify,
            });
            toast('حُفظت بطاقة المستفيد', 'success');
            onSaved(res);
            return undefined;
          } catch (err) {
            f.showError(err);
            return false;
          }
        },
      },
    ],
  });
}

function scoreBlock(score) {
  if (!score) return null;
  const tone = SCORE_TONE[score.level] || 'primary';
  return h(
    'div.v9p-score',
    { class: `is-${score.level}` },
    h(
      'div.v9p-score-head',
      h('div.v9p-score-num', h('span.v9p-score-val', num(score.score)), h('span.v9p-score-max', '/ 100')),
      h('div.stack-sm', badge(label('vulnerability_level', score.level), LEVEL_TONE[score.level] || 'neutral', { icon: 'flag' }), h('span.small.muted', 'درجة الاحتياج (تقديرية)')),
    ),
    progressBar(score.score, 100, tone, { label: 'درجة الاحتياج', visibleLabel: false }),
    score.reasons.length
      ? h('details.v9p-reasons', h('summary', 'كيف حُسبت الدرجة؟'), h('ul', score.reasons.map((r) => h('li', h('span.v9p-pts', `+${r.points}`), h('span', r.text)))))
      : h('p.small.muted', 'لا توجد بيانات كافية لحساب الدرجة بعد.'),
    score.completeness < 1 && h('p.small.muted', `اكتمال البيانات: ${percent(score.completeness)} — أكمل البطاقة لتكون الدرجة أدق.`),
  );
}

/**
 * بطاقة المستفيد القابلة لإعادة الاستخدام (ملف العميل وشاشة فرز الطلب).
 * @param {{clientId:number, editable?:boolean, intakeId?:number|null, onChange?:()=>void}} opts
 * @returns {HTMLElement}
 */
export function beneficiaryCard({ clientId, editable = true, intakeId = null, onChange = null } = {}) {
  const body = h('div.v9p-beneficiary', loading());
  const actions = h('div.card-actions-inner.row');
  const el = card({
    title: 'بطاقة المستفيد',
    subtitle: 'البحث الاجتماعي — للإدارة فقط ولا تظهر للمحامين',
    icon: 'users',
    actions,
    body,
    className: 'v9p-beneficiary-card',
  });
  el.setAttribute('aria-live', 'polite');
  let view = null;

  async function load() {
    try {
      view = await api.get(`/admin/clients/${clientId}/beneficiary`, intakeId ? { intake_id: intakeId } : undefined);
      render();
    } catch (err) {
      mount(body, errorState(err, load));
    }
  }

  function saved() {
    load();
  }

  function submissionBox(s, { forIntake }) {
    const d = s.data || {};
    const rows = [
      d.relation && ['صفة المستفيد', label('beneficiary_relation', d.relation)],
      d.children_count != null && ['عدد الأبناء', num(d.children_count)],
      d.monthly_income_band && ['الدخل الشهري', label('income_band', d.monthly_income_band)],
      d.housing && ['السكن', label('housing', d.housing)],
      d.foundation_file_number && ['رقم الملف لدى المؤسسة', h('span.ltr', { dir: 'ltr' }, d.foundation_file_number)],
    ].filter(Boolean);
    return h(
      'div.v9p-submission',
      h('div.v9p-subhead', icon('globe', { size: 16 }), h('span', forIntake ? 'ذكر مقدم الطلب في نموذج الموقع (غير موثّق):' : `بيانات ذكرها مقدم الطلب ${s.intake_code || ''} (غير موثّقة):`)),
      kv(rows),
      s.applied_at
        ? h('p.small.muted', 'اعتُمدت في البطاقة.')
        : editable &&
            asyncButton(
              'اعتماد في البطاقة',
              async () => {
                const res = await api.post(`/admin/beneficiary-submissions/${s.id}/apply`);
                toast('اعتُمدت البيانات في البطاقة — تحقق منها قبل تأكيدها', 'success');
                saved(res);
              },
              { size: 'sm', icon: 'check', title: 'تُملأ الحقول الفارغة فقط ولا يُستبدل ما سجلته الإدارة' },
            ),
    );
  }

  function render() {
    const p = view.profile;
    mount(
      actions,
      // قبل وجود بطاقة: زر «إضافة البيانات» واحد فقط داخل الحالة الفارغة (لا زر مكرر في رأس البطاقة)
      editable && p && button('تعديل', { size: 'sm', icon: 'edit', onClick: () => editDialog(view, saved) }),
      editable &&
        p &&
        !p.verified &&
        asyncButton(
          'تأكيد التحقق',
          async () => {
            const res = await api.post(`/admin/clients/${clientId}/beneficiary/verify`);
            toast('أُكّد التحقق من بيانات البحث الاجتماعي', 'success');
            saved(res);
          },
          { size: 'sm', variant: 'ghost', icon: 'shieldCheck' },
        ),
    );
    const parts = [];
    const sug = view.priority_suggestion;
    if (sug && editable && view.intake) {
      parts.push(
        h(
          'div.v9p-suggest',
          alertBox(`درجة الاحتياج تقترح رفع أولوية الطلب من «${label('priority', sug.from)}» إلى «${label('priority', sug.to)}».`, 'warning', { title: 'اقتراح أولوية', icon: 'flag' }),
          asyncButton(
            'تطبيق الأولوية المقترحة',
            async () => {
              await api.patch(`/admin/intakes/${view.intake.id}`, { priority: sug.to });
              toast(`رُفعت أولوية الطلب إلى «${label('priority', sug.to)}»`, 'success');
              if (onChange) onChange();
              else load();
            },
            { size: 'sm', variant: 'primary', icon: 'flag' },
          ),
        ),
      );
    }
    if (view.intake?.submission && !view.intake.submission.applied_at) parts.push(submissionBox(view.intake.submission, { forIntake: true }));
    for (const s of view.pending_submissions || []) {
      if (view.intake?.submission && s.id === view.intake.submission.id) continue;
      parts.push(submissionBox(s, { forIntake: false }));
    }
    if (!p) {
      parts.unshift(
        emptyState(
          'لم تُسجَّل بيانات البحث الاجتماعي لهذه الأسرة بعد. تساعد البطاقة في ترتيب الأولويات وفي تقرير الأثر.',
          editable ? button('إضافة البيانات', { size: 'sm', variant: 'primary', icon: 'plus', onClick: () => editDialog(view, saved) }) : null,
          { compact: true, icon: 'users' },
        ),
      );
      mount(body, parts);
      return;
    }
    const status = p.verified
      ? badge(`تم التحقق${p.verified_by_name ? ` — ${p.verified_by_name}` : ''}${p.verified_at ? ` في ${date(p.verified_at)}` : ''}`, 'success', { icon: 'shieldCheck' })
      : p.self_reported
        ? badge('ذكره مقدم الطلب — لم يُتحقق منه', 'warning', { icon: 'alert' })
        : badge('لم يُؤكَّد التحقق بعد', 'muted', { icon: 'info' });
    // الحالة والدرجة أولًا، ثم اقتراح الأولوية (إن وُجد)، ثم البيانات المقترحة، ثم تفاصيل البطاقة
    parts.unshift(h('div.row', status), scoreBlock(view.score));
    parts.push(
      kv([
        ['صفة المستفيد', p.relation ? label('beneficiary_relation', p.relation) : null],
        ['عدد الأبناء', p.children_count != null ? num(p.children_count) : null],
        p.children?.length && ['الأبناء', childrenText(p.children)],
        ['الدخل الشهري للأسرة', p.monthly_income_band ? label('income_band', p.monthly_income_band) : null],
        ['السكن', p.housing ? label('housing', p.housing) : null],
        ['العمل', p.employment ? label('employment', p.employment) : null],
        ['إعاقة أو مرض مزمن', p.has_disability ? 'نعم' : 'لا'],
        ['رقم الملف لدى المؤسسة', p.foundation_file_number ? h('span.ltr', { dir: 'ltr' }, p.foundation_file_number) : null],
        ['برامج المؤسسة الأخرى', p.is_foundation_beneficiary ? badge('الأسرة مستفيدة من برامج المؤسسة', 'accent', { title: 'الأسرة مستفيدة من برامج المؤسسة', className: 'badge-wrap' }) : 'لا'],
        p.notes && ['ملاحظات', h('span.pre', p.notes)],
      ]),
    );
    mount(body, parts);
  }

  load().catch((err) => mount(body, h('p', errorMessage(err))));
  return el;
}
