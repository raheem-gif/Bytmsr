// مادة معرفية واحدة: مراجعة الإخفاء، تحرير المحتوى المجهّل، رحلة الحالة، تصحيحات الذكاء الاصطناعي،
// ثم الاعتماد (للاسترجاع أو للتدريب) أو الاستبعاد أو إعادة البناء من الملف.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, num, dateTime, relative, toLatinDigits } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  kv,
  chips,
  badge,
  statusBadge,
  button,
  asyncButton,
  emptyState,
  alertBox,
  modal,
  form,
  formDialog,
  confirmDialog,
  toast,
  icon,
  codeTag,
  timeline,
  richText,
} from '../../../lib/ui.js';
import { correctionsList } from './knowledge.js';

const REDACTION_CATEGORIES = {
  names: 'أسماء',
  phones: 'أرقام هواتف',
  national_ids: 'أرقام قومية',
  emails: 'بريد إلكتروني',
  addresses: 'عناوين',
  codes: 'أكواد ملفات ومستفيدين',
  links: 'روابط',
};
const METHOD_LABELS = { heuristic: 'إخفاء آلي بقواعد لغوية عربية', ai: 'إخفاء بمساعدة الذكاء الاصطناعي', manual: 'إخفاء يدوي' };

/** بحث محلي عن بيانات شخصية محتملة لم تُخفَ بعد (تنبيه مساعد للمراجع). */
function residualPii(rec) {
  const text = toLatinDigits([rec.title, rec.facts, ...(rec.issues || []), rec.final_answer, rec.client_answer].filter(Boolean).join('\n'));
  const found = [];
  const add = (kind, re) => {
    for (const m of text.matchAll(re)) found.push({ kind, value: m[0].trim() });
  };
  add('رقم هاتف', /(?:\+?20|0)1[0125][\d\s-]{7,10}\d/g);
  add('رقم قومي', /\b[23]\d{13}\b/g);
  add('بريد إلكتروني', /[\w.+-]+@[\w-]+\.[\w.-]+/g);
  add('كود ملف أو مستفيد/ة', /\b[A-Z]{2,3}-\d{4}-\d{5}\b|\bCL-\d{5}\b/g);
  const seen = new Set();
  return found.filter((f) => (seen.has(f.value) ? false : seen.add(f.value)));
}

const JOURNEY_STYLE = [
  ['intake', 'info', 'inbox'],
  ['ai', 'accent', 'sparkle'],
  ['assignment', 'primary', 'briefcase'],
  ['info_request', 'warning', 'message'],
  ['counsel', 'info', 'users'],
  ['opinion', 'success', 'fileText'],
  ['client_answer', 'success', 'send'],
  ['billing', 'neutral', 'wallet'],
  ['knowledge', 'accent', 'book'],
  ['automation', 'muted', 'zap'],
  ['case', 'neutral', 'flag'],
];

function journeyItem(j) {
  const style = JOURNEY_STYLE.find(([p]) => String(j.type || '').startsWith(`${p}.`)) || [null, 'neutral', 'dot'];
  return { time: j.at, title: j.summary, actor: j.actor, tone: style[1], icon: style[2] };
}

function textBlock(title, body, { empty = 'لا يوجد', collapsible = false } = {}) {
  const content = body ? h('div.pd-kn-text.pre', richText(body)) : h('p.muted', empty);
  if (collapsible && body) {
    return h('details.pd-kn-block.pd-details', h('summary', h('h3', title), h('span.cell-sub', 'عرض')), content);
  }
  return h('section.pd-kn-block', h('h3', title), content);
}

function listBlock(title, items, empty) {
  return h('section.pd-kn-block', h('h3', title), items && items.length ? h('ol.pd-kn-list', items.map((x) => h('li', richText(x)))) : h('p.muted', empty));
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const rec = await api.get(`/admin/knowledge/${encodeURIComponent(id)}`);
  ctx.setTitle(`مادة معرفية — ${rec.case_code || rec.id}`);
  const rr = rec.redaction_report || {};
  const counts = rr.counts || {};
  const pii = residualPii(rec);
  const isApproved = rec.status === 'approved';

  // ───────────── الإجراءات ─────────────
  function openApprove() {
    const f = form(
      [
        {
          name: 'usage',
          label: 'نطاق الاستخدام',
          type: 'select',
          required: true,
          placeholder: false,
          options: options('knowledge_usage').filter((o) => o.value !== 'none'),
          hint: 'التدريب يعني دخول الحالة في ملف التصدير وقياس أداء الذكاء الاصطناعي، إضافة إلى ظهورها كحالة مشابهة.',
          full: true,
        },
        {
          name: 'confirm',
          type: 'checkbox',
          required: true,
          text: 'راجعتُ إخفاء البيانات الشخصية، وأؤكد أن النص لا يكشف هوية المستفيد/ة أو أطراف الملف',
          full: true,
        },
        { name: 'note', label: 'ملاحظة المراجعة (اختياري)', type: 'textarea', rows: 3, maxLength: 2000 },
      ],
      { footer: false, values: { usage: rec.usage && rec.usage !== 'none' ? rec.usage : 'knowledge' } },
    );
    modal({
      title: isApproved ? 'تعديل نطاق استخدام الحالة' : 'اعتماد الحالة في المعرفة المؤسسية',
      size: 'md',
      body: frag(
        h('p.modal-intro', 'بعد الاعتماد تظهر الحالة للمحامين كحالة مشابهة مجهّلة الهوية، ويستفيد منها الذكاء الاصطناعي في الاقتراحات.'),
        pii.length
          ? alertBox(`عُثر في النص على ${num(pii.length)} من البيانات التي قد تكشف الهوية ولم تُخفَ بعد (${[...new Set(pii.map((p) => p.kind))].join('، ')}). يُفضّل تعديل النص قبل الاعتماد.`, 'warning', {
              title: 'تحقق قبل الاعتماد',
            })
          : null,
        f.el,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: isApproved ? 'حفظ نطاق الاستخدام' : 'اعتماد الحالة',
          variant: 'primary',
          icon: 'shieldCheck',
          onClick: async () => {
            if (!f.validate()) return false;
            const v = f.getValues();
            try {
              await api.post(`/admin/knowledge/${encodeURIComponent(rec.id)}/approve`, { usage: v.usage, confirm_redaction: true, note: v.note || null });
            } catch (err) {
              f.showError(err);
              return false;
            }
            toast(`اعتُمدت الحالة: ${label('knowledge_usage', v.usage)}`, 'success');
            ctx.reload();
            return undefined;
          },
        },
      ],
    });
  }

  async function openExclude() {
    const res = await formDialog({
      title: 'استبعاد الحالة من المعرفة المؤسسية',
      intro: 'لن تظهر الحالة كحالة مشابهة ولن تدخل في التدريب. يمكن إعادتها للمراجعة لاحقًا بإعادة بنائها من الملف.',
      submitLabel: 'استبعاد الحالة',
      fields: [{ name: 'note', label: 'سبب الاستبعاد', type: 'textarea', rows: 3, required: true, maxLength: 2000, placeholder: 'مثال: الوقائع غير مكتملة أو يصعب إخفاء هوية الأطراف' }],
      onSubmit: (v) => api.post(`/admin/knowledge/${encodeURIComponent(rec.id)}/exclude`, { note: v.note }),
    });
    if (res) {
      toast('استُبعدت الحالة من المعرفة المؤسسية', 'success');
      ctx.reload();
    }
  }

  const actions = [];
  if (rec.status !== 'approved') actions.push(button('اعتماد', { variant: 'primary', icon: 'shieldCheck', onClick: openApprove }));
  else actions.push(button('تعديل نطاق الاستخدام', { icon: 'shieldCheck', onClick: openApprove }));
  if (rec.status !== 'excluded') actions.push(button('استبعاد', { variant: 'ghost', icon: 'eyeOff', onClick: openExclude }));
  if (rec.status !== 'approved' && rec.case_id) {
    actions.push(
      asyncButton(
        'إعادة البناء من الملف',
        async () => {
          const ok = await confirmDialog({
            title: 'إعادة بناء السجل من الملف',
            message: 'سيُعاد بناء السجل من بيانات الملف الحالية ويُطبَّق الإخفاء الآلي من جديد، وستُفقد أي تعديلات يدوية على المحتوى. يعود السجل إلى «بانتظار المراجعة».',
            confirmLabel: 'إعادة البناء',
            danger: true,
          });
          if (!ok) return;
          await api.post(`/admin/knowledge/${encodeURIComponent(rec.id)}/rebuild`);
          toast('أُعيد بناء السجل من الملف', 'success');
          ctx.reload();
        },
        { variant: 'ghost', icon: 'refresh' },
      ),
    );
  }

  // ───────────── الإخفاء ─────────────
  const countEntries = Object.entries(counts).filter(([, n]) => n > 0);
  const redactionCard = card({
    title: 'إخفاء البيانات الشخصية',
    subtitle: METHOD_LABELS[rr.method] || rr.method || 'إخفاء آلي',
    icon: 'eyeOff',
    actions: rr.reviewed
      ? badge(`تمت مراجعة الإخفاء${rr.reviewed_at ? ` — ${relative(rr.reviewed_at)}` : ''}`, 'success', { icon: 'checkCircle', title: rr.reviewed_at ? dateTime(rr.reviewed_at) : null })
      : badge('لم تُراجع بعد', 'warning', { icon: 'alert' }),
    body: h(
      'div.stack',
      h(
        'div.pd-redact-counts',
        Object.entries(REDACTION_CATEGORIES)
          .filter(([k]) => k !== 'links' || counts.links)
          .map(([k, lbl]) => h('div.pd-redact', { class: counts[k] ? 'has-value' : null }, h('strong', num(counts[k] || 0)), h('span', lbl))),
      ),
      h('p.cell-sub', countEntries.length ? 'أعداد ما استُبدل آليًا بعلامات مثل [اسم] و[رقم هاتف] قبل حفظ السجل.' : 'لم يعثر الإخفاء الآلي على بيانات شخصية في النص.'),
      !rr.reviewed || rec.status === 'pending_review'
        ? alertBox('راجع النص للتأكد من إخفاء كل البيانات الشخصية قبل الاعتماد؛ الإخفاء الآلي أولي وقد يفوته اسم أو عنوان مكتوب بصيغة غير معتادة.', 'warning', { icon: 'eye' })
        : null,
      pii.length
        ? alertBox(
            h(
              'div.stack-sm',
              h('span', 'وجدنا في النص ما قد يكشف الهوية ولم يُخفَ بعد — عدّل المحتوى لإخفائه:'),
              h('div.pd-badges', pii.slice(0, 12).map((p) => badge(`${p.kind}: ${p.value}`, 'danger'))),
            ),
            'danger',
            { title: 'بيانات محتملة غير مخفية' },
          )
        : null,
    ),
  });

  // ───────────── المحتوى (عرض/تحرير) ─────────────
  const contentHost = h('div');
  let editing = false;

  function viewContent() {
    return h(
      'div.stack-lg',
      textBlock('الوقائع', rec.facts, { empty: 'لا توجد وقائع مسجلة' }),
      listBlock('المسائل القانونية', rec.issues, 'لم تُسجل مسائل'),
      textBlock('الإجابة المعتمدة (رأي المحامين بعد مراجعة الإدارة)', rec.final_answer, { empty: 'لا توجد إجابة معتمدة' }),
      textBlock('نسخة الرد التي أُرسلت للمستفيد/ة', rec.client_answer, { empty: 'لم يُرسل رد للمستفيد/ة', collapsible: true }),
      h('section.pd-kn-block', h('h3', 'الوسوم'), rec.tags && rec.tags.length ? chips(rec.tags) : h('p.muted', 'لا توجد وسوم')),
    );
  }

  function editContent() {
    const original = {
      title: rec.title || '',
      legal_area: rec.legal_area || '',
      facts: rec.facts || '',
      issues: (rec.issues || []).join('\n'),
      final_answer: rec.final_answer || '',
      client_answer: rec.client_answer || '',
      tags: (rec.tags || []).join('، '),
    };
    const f = form(
      [
        { name: 'title', label: 'العنوان', required: true, maxLength: 300, full: true },
        { name: 'legal_area', label: 'المجال القانوني', type: 'select', required: true, placeholder: false, options: areaOptions() },
        { name: 'tags', label: 'الوسوم', maxLength: 600, hint: 'افصل بين الوسوم بفاصلة، مثل: قسمة رضائية، إعلام وراثة' },
        { name: 'facts', label: 'الوقائع (مجهّلة)', type: 'textarea', rows: 6, required: true, minLength: 20, maxLength: 20000 },
        { name: 'issues', label: 'المسائل القانونية', type: 'textarea', rows: 4, hint: 'اكتب كل مسألة في سطر مستقل' },
        { name: 'final_answer', label: 'الإجابة المعتمدة', type: 'textarea', rows: 10, maxLength: 60000 },
        { name: 'client_answer', label: 'نسخة الرد للمستفيد/ة', type: 'textarea', rows: 6, maxLength: 10000 },
      ],
      { footer: false, values: original },
    );
    const save = asyncButton(
      'حفظ التعديلات',
      async () => {
        if (!f.validate()) return;
        const v = f.getValues();
        const issues = v.issues
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);
        if (issues.some((x) => x.length > 500)) {
          f.setErrors({ issues: 'كل مسألة يجب ألا تزيد على 500 حرف' });
          return;
        }
        const tags = v.tags
          .split(/[,،\n]/)
          .map((x) => x.trim())
          .filter(Boolean);
        if (tags.length > 20 || tags.some((x) => x.length > 50)) {
          f.setErrors({ tags: 'حتى 20 وسمًا، وكل وسم لا يزيد على 50 حرفًا' });
          return;
        }
        const patch = {};
        if (v.title !== original.title) patch.title = v.title;
        if (v.legal_area !== original.legal_area) patch.legal_area = v.legal_area;
        if (v.facts !== original.facts.trim()) patch.facts = v.facts;
        if (issues.join('\n') !== (rec.issues || []).join('\n')) patch.issues = issues;
        if (v.final_answer !== original.final_answer.trim()) patch.final_answer = v.final_answer;
        if (v.client_answer !== original.client_answer.trim()) patch.client_answer = v.client_answer;
        if (tags.join('|') !== (rec.tags || []).join('|')) patch.tags = tags;
        if (!Object.keys(patch).length) {
          toast('لا توجد تغييرات للحفظ', 'info');
          return;
        }
        const contentChanged = ['title', 'facts', 'issues', 'final_answer', 'client_answer'].some((k) => k in patch);
        if (isApproved && contentChanged) {
          const ok = await confirmDialog({
            title: 'تعديل سجل معتمد',
            message: 'تعديل محتوى سجل معتمد يعيده إلى «بانتظار المراجعة» ويوقف استخدامه حتى يُعتمد من جديد. هل تريد المتابعة؟',
            confirmLabel: 'حفظ وإعادة للمراجعة',
          });
          if (!ok) return;
        }
        try {
          await api.patch(`/admin/knowledge/${encodeURIComponent(rec.id)}`, patch);
        } catch (err) {
          f.showError(err);
          return;
        }
        toast(isApproved && contentChanged ? 'حُفظت التعديلات وعاد السجل إلى المراجعة' : 'حُفظت التعديلات', 'success');
        ctx.reload();
      },
      { variant: 'primary', icon: 'check' },
    );
    return h(
      'div.stack',
      isApproved ? alertBox('هذا السجل معتمد: تعديل العنوان أو الوقائع أو المسائل أو الإجابات يعيده إلى المراجعة ويوقف استخدامه حتى يُعتمد من جديد.', 'warning') : null,
      f.el,
      h('div.form-actions', save, button('إلغاء', { variant: 'ghost', onClick: () => setEditing(false) })),
    );
  }

  const editBtn = button('تعديل المحتوى', { size: 'sm', icon: 'edit', onClick: () => setEditing(!editing) });
  function setEditing(on) {
    editing = on;
    editBtn.querySelector('.btn-label').textContent = on ? 'إلغاء التعديل' : 'تعديل المحتوى';
    editBtn.setAttribute('aria-expanded', String(on));
    mount(contentHost, on ? editContent() : viewContent());
    if (on) contentHost.querySelector('input, textarea')?.focus();
  }
  editBtn.setAttribute('aria-expanded', 'false');
  mount(contentHost, viewContent());

  // ───────────── العمود الجانبي ─────────────
  const reviewCard = card({
    title: 'المراجعة والاستخدام',
    icon: 'shieldCheck',
    body: kv([
      ['الحالة', statusBadge('knowledge_status', rec.status)],
      ['نطاق الاستخدام', statusBadge('knowledge_usage', rec.usage, { dot: false })],
      ['راجعه', rec.reviewed_by_name],
      ['تاريخ المراجعة', rec.reviewed_at ? h('time', { datetime: rec.reviewed_at, title: dateTime(rec.reviewed_at) }, dateTime(rec.reviewed_at)) : null],
      ['ملاحظة المراجعة', rec.review_note ? h('span.pre', rec.review_note) : null],
      ['نتيجة الملف', rec.outcome ? label('case_outcome', rec.outcome) : null],
      ['أُنشئ', rec.created_at ? relative(rec.created_at) : null],
      ['آخر تحديث', rec.updated_at ? relative(rec.updated_at) : null],
    ]),
  });

  const requestsCard = card({
    title: 'ما طُلب من المستفيد/ة أثناء الدراسة',
    icon: 'message',
    body: h(
      'div.stack',
      listBlock('معلومات طُلبت', rec.info_requested, 'لم تُطلب معلومات إضافية'),
      listBlock('مستندات طُلبت', rec.documents_requested, 'لم تُطلب مستندات'),
    ),
  });

  const specialists = Array.isArray(rec.specialists) ? rec.specialists : [];
  const specialistsCard = card({
    title: 'المتخصصون المشاركون',
    icon: 'users',
    body: specialists.length
      ? h(
          'ul.pd-spec-list',
          specialists.map((s) =>
            h(
              'li',
              h('div.pd-badges', badge(s.kind_label || label('counsel_kind', s.kind), 'info'), s.specialty ? badge(s.specialty_label || areaLabel(s.specialty), 'primary') : null),
              s.reason ? h('p.cell-sub', richText(s.reason)) : null,
            ),
          ),
        )
      : h('p.muted', 'لم تحتج الحالة إلى متخصص إضافي'),
  });

  const corrections = Array.isArray(rec.ai_corrections) ? rec.ai_corrections : [];
  const journey = Array.isArray(rec.journey) ? rec.journey : [];

  return frag(
    pageHeader({
      title: h('span', richText(rec.title)),
      subtitle: `${rec.legal_area_label || areaLabel(rec.legal_area)}${rec.outcome ? ` — ${label('case_outcome', rec.outcome)}` : ''}`,
      breadcrumbs: [
        { label: 'لوحة المتابعة', href: '#/dashboard' },
        { label: 'المعرفة المؤسسية', href: '#/knowledge' },
        { label: rec.case_code ? `سجل الملف ${rec.case_code}` : `سجل رقم ${rec.id}` },
      ],
      meta: [
        statusBadge('knowledge_status', rec.status),
        rec.status === 'approved' ? statusBadge('knowledge_usage', rec.usage, { dot: false }) : null,
        rec.case_id ? h('a.pd-meta-link', { href: `#/cases/${rec.case_id}`, title: 'فتح ملف الاستشارة الأصلي (للإدارة فقط)' }, icon('briefcase', { size: 14 }), codeTag(rec.case_code)) : null,
      ],
      actions,
    }),
    redactionCard,
    h(
      'div.detail-layout',
      h(
        'div.detail-main',
        card({ title: 'المحتوى المجهّل', subtitle: 'هذا ما يُستخدم في المعرفة والتدريب بعد الاعتماد', icon: 'fileText', actions: editBtn, body: contentHost }),
        card({
          title: 'تصحيحات الذكاء الاصطناعي في هذه الحالة',
          subtitle: 'ما اقترحه الذكاء الاصطناعي وما قررته الإدارة أو المحامي',
          icon: 'sparkle',
          body: corrections.length ? correctionsList(corrections, { limit: 4, showCase: false }) : emptyState('قبلت الإدارة والمحامون اقتراحات الذكاء الاصطناعي كما هي في هذه الحالة', null, { compact: true, icon: 'checkCircle' }),
        }),
        card({
          title: 'رحلة الحالة: من الرسالة الأولى حتى الإجابة المعتمدة',
          subtitle: 'كما سُجلت في الملف بعد إخفاء البيانات الشخصية',
          icon: 'clock',
          body: timeline(journey.map(journeyItem), { empty: 'لا توجد أحداث مسجلة لهذه الحالة' }),
        }),
      ),
      h('div.detail-side', reviewCard, specialistsCard, requestsCard),
    ),
  );
}
