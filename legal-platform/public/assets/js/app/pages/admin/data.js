// استيراد وتصدير البيانات — (الإصدار 9 — وحدة practice)
// تصدير CSV (UTF-8 مع BOM ليفتحه Excel بالعربية) لكل البيانات الأساسية، واستيراد المحامين والعملاء/المستفيدين
// بخطوة معاينة: يُتحقق من كل صف وتظهر أخطاؤه، ثم تُضاف الصفوف السليمة فقط في معاملة واحدة. كل تصدير واستيراد يُسجل في سجل الأمان.
import { h, mount } from '../../../lib/h.js';
import { api, downloadFile } from '../../../lib/api.js';
import { label, num, count, relative, dateTime } from '../../../lib/fmt.js';
import {
  pageHeader, card, button, asyncButton, badge, icon, emptyState, loading, errorState, alertBox, tabs, table, toast, confirmDialog, selectInput, uid, errorMessage, kv,
} from '../../../lib/ui.js';

const ENTITY_INFO = {
  clients: { icon: 'users', text: 'المستفيدون ووسائل التواصل وبطاقات البحث الاجتماعي ودرجة الاحتياج.', sensitive: true },
  intakes: { icon: 'inbox', text: 'الطلبات الواردة بالقناة والمصدر والحالة وزمن أول رد (بلا أرقام هواتف).' },
  cases: { icon: 'briefcase', text: 'ملفات الاستشارات بالنتيجة والأثر المتحقق والمحامي الأساسي.' },
  matters: { icon: 'gavel', text: 'الملفات المستمرة بالمحكمة والدعوى والفواتير والأثر.' },
  lawyers: { icon: 'scale', text: 'المحامون وتخصصاتهم واتفاقاتهم وطاقتهم الاستيعابية.' },
  ledger: { icon: 'wallet', text: 'دفتر مستحقات المحامين (للمراجعة المالية).' },
};

const IMPORT_GUIDE = {
  lawyers: [
    'الأعمدة المطلوبة: الاسم، اسم المستخدم (حروف لاتينية)، التخصصات، نوع الاتفاق.',
    'التخصصات: أكواد مثل INH أو أسماء المجالات، مفصولة بـ «؛» أو «|».',
    'نوع الاتفاق: بالقطعة، شهري، شهري بحصة، باقة، تطوعي، مسؤولية مجتمعية. «المبلغ» = أجر الاستشارة أو المبلغ الشهري أو قيمة الباقة أو القيمة التقديرية للتطوع، و«عدد الاستشارات» = الحصة الشهرية أو حجم الباقة أو التزام المكتب السنوي.',
    'تُنشأ الحسابات «بانتظار الدعوة» دون كلمة مرور صالحة: أصدر لكل محامٍ رابط دعوة من صفحته ليختار كلمة مروره بنفسه، أو عيّن له كلمة مرور مؤقتة.',
  ],
  clients: [
    'العمود المطلوب: الاسم. يُرفض الصف إذا كان الهاتف أو الرقم القومي مسجلًا لمستفيد/ة آخر (لا تكرار).',
    'صفة المستفيد: أرملة، وصي أو كافل أيتام، مطلقة معيلة، زوجة، أخرى.',
    'سنوات ميلاد الأبناء: مثل «2014 ذكر، 2017 أنثى» — بلا أسماء الأبناء.',
    'الدخل الشهري: رقم بالجنيه (يُحوَّل لشريحة) أو اسم الشريحة. السكن: مملوك، إيجار قديم، إيجار جديد، إقامة لدى الأسرة، بلا سكن مستقر.',
    '«تم التحقق» = نعم إذا كانت البيانات من بحث اجتماعي موثّق لدى المؤسسة.',
  ],
};

/** تنزيل قالب استيراد (أعمدة ومثال بلا بيانات شخصية) من مسار GET مع عرض أخطاء الخادم بالعربية */
async function download(path, fallbackName) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!res.ok) {
    let msg = 'تعذر تنزيل الملف';
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* لا شيء */
    }
    throw new Error(msg);
  }
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const blob = await res.blob();
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** قراءة ملف CSV: UTF-8 أولًا، ثم Windows-1256 (ملفات Excel العربية القديمة) */
async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1256').decode(buf);
  }
}

export default async function render(ctx) {
  const summary = await api.get('/admin/data/summary');

  // ───────────── التصدير ─────────────
  function exportPanel() {
    return h(
      'div.stack',
      alertBox('ملفات التصدير تحتوي بيانات شخصية للمستفيدين والمحامين. يُسجل كل تصدير في سجل الأمان. احفظ الملفات في مكان آمن واحذفها بعد الاستخدام، ولا ترسلها عبر وسائل غير مؤمنة.', 'warning', { title: 'تنبيه خصوصية', icon: 'lock' }),
      h(
        'div.v9p-export-grid',
        summary.entities.map((key) => {
          const info = ENTITY_INFO[key] || { icon: 'file', text: '' };
          const n = summary.counts[key] ?? 0;
          return h(
            'section.v9p-export-item',
            h('div.v9p-export-head', h('span.card-icon', icon(info.icon, { size: 18 })), h('h3', label('data_entity', key)), info.sensitive && badge('بيانات حساسة', 'warning')),
            h('p.small.muted', info.text),
            h('div.row-between', h('span.small', count(n, ['صف واحد', 'صفان', 'صفوف', 'صفًا'])), asyncButton('تنزيل CSV', async () => {
              // ملف ببيانات شخصية: رابط تنزيل لمرة واحدة يصدره الخادم بطلب POST (لا يُفتح بطلب GET من موقع آخر)
              await downloadFile(`/admin/data/export/${key}`, {}, { fallbackName: `${key}.csv` });
              toast(`نُزّل ملف «${label('data_entity', key)}»`, 'success');
              loadHistory();
            }, { size: 'sm', icon: 'download', variant: n ? 'primary' : 'secondary', disabled: !n })),
          );
        }),
      ),
    );
  }

  // ───────────── الاستيراد ─────────────
  function importPanel() {
    let entity = summary.importable.includes(ctx.query.entity) ? ctx.query.entity : 'clients';
    let csvText = null;
    let fileName = '';
    let preview = null;
    const guide = h('div');
    const result = h('div.v9p-import-result', { 'aria-live': 'polite' });
    const fileId = uid('csv');
    const fileInput = h('input.file-native', { id: fileId, type: 'file', accept: '.csv,text/csv' });
    const fileLabel = h('span.v9p-file-name.muted', 'لم يُختر ملف');
    const previewBtn = asyncButton('معاينة والتحقق', () => runPreview(), { variant: 'primary', icon: 'search', disabled: true });

    function renderGuide() {
      mount(
        guide,
        h(
          'div.stack-sm',
          h('ul.v9p-how', (IMPORT_GUIDE[entity] || []).map((t) => h('li', t))),
          h('div.row', asyncButton('تنزيل القالب', async () => download(`/admin/data/template/${entity}`, `template-${entity}.csv`), { size: 'sm', icon: 'download' })),
        ),
      );
    }

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      preview = null;
      mount(result);
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) {
        toast('حجم الملف أكبر من 3 ميجابايت. قسّمه إلى ملفات أصغر.', 'danger');
        fileInput.value = '';
        return;
      }
      try {
        csvText = await readCsvFile(f);
        fileName = f.name;
        fileLabel.textContent = f.name;
        fileLabel.classList.remove('muted');
        previewBtn.disabled = false;
      } catch (err) {
        toast(errorMessage(err), 'danger');
      }
    });

    async function runPreview() {
      if (!csvText) return;
      mount(result, loading('جارٍ التحقق من كل صف…'));
      try {
        preview = await api.post(`/admin/data/import/${entity}/preview`, { csv: csvText });
        showPreview();
      } catch (err) {
        mount(result, errorState(err));
      }
    }

    function showPreview() {
      const p = preview;
      const previewCols = Object.keys((p.rows.find((r) => r.preview) || {}).preview || {});
      const colLabels = { name: 'الاسم', username: 'اسم المستخدم', specialties: 'التخصصات', agreement: 'الاتفاق', phone: 'الهاتف', governorate: 'المحافظة', relation: 'صفة المستفيد', children: 'الأبناء' };
      mount(
        result,
        h(
          'div.stack',
          h(
            'div.v9p-import-stats',
            h('div', h('span.small.muted', 'صفوف الملف'), h('strong', num(p.total))),
            h('div.is-ok', h('span.small.muted', 'سليمة'), h('strong', num(p.valid))),
            h('div.is-bad', h('span.small.muted', 'بها أخطاء'), h('strong', num(p.invalid))),
          ),
          p.unknown_headers.length ? alertBox(`أعمدة غير معروفة ستُتجاهل: ${p.unknown_headers.join('، ')}`, 'info') : null,
          kv([['الأعمدة', h('div.chips', p.columns.map((c) => h('span.chip', { class: c.found ? 'chip-success' : c.required ? 'chip-danger' : null }, c.label)))]]),
          table({
            caption: 'نتيجة التحقق من كل صف',
            className: 'v9p-import-table',
            rowClass: (r) => (r.ok ? null : 'v9p-row-bad'),
            columns: [
              { key: 'line', label: 'السطر', render: (r) => h('span.ltr', String(r.line)) },
              { key: 'ok', label: 'الحالة', render: (r) => (r.ok ? badge('سليم', 'success', { icon: 'check' }) : badge('به أخطاء', 'danger', { icon: 'alert' })) },
              ...previewCols.map((k) => ({ key: k, label: colLabels[k] || k, render: (r) => (r.preview?.[k] == null || r.preview[k] === '' ? null : String(r.preview[k])) })),
              {
                key: 'errors',
                label: 'الملاحظات',
                render: (r) =>
                  r.errors.length || r.warnings.length
                    ? h('ul.v9p-row-msgs', r.errors.map((e) => h('li.is-error', e)), r.warnings.map((w) => h('li.is-warning', w)))
                    : null,
              },
            ],
            rows: p.rows,
          }),
          p.valid
            ? h(
                'div.row',
                asyncButton(`استيراد ${count(p.valid, ['صف سليم واحد', 'صفين سليمين', 'صفوف سليمة', 'صفًا سليمًا'])}`, () => commit(), { variant: 'primary', icon: 'upload' }),
                p.invalid ? h('span.small.muted', `لن تُستورد الصفوف التي بها أخطاء (${num(p.invalid)}) — صححها في الملف وأعد رفعه لاحقًا.`) : null,
              )
            : alertBox('لا توجد صفوف سليمة للاستيراد. صحح الأخطاء الموضحة ثم أعد رفع الملف.', 'danger'),
        ),
      );
    }

    async function commit() {
      const ok = await confirmDialog({
        title: 'تأكيد الاستيراد',
        message: `ستُضاف الصفوف السليمة (${num(preview.valid)}) من الملف «${fileName}» إلى «${label('data_entity', entity)}» دفعة واحدة. لا يمكن التراجع تلقائيًا. هل تريد المتابعة؟`,
        confirmLabel: 'استيراد',
      });
      if (!ok) return;
      const r = await api.post(`/admin/data/import/${entity}/commit`, { csv: csvText, expected_valid: preview.valid });
      toast(`أُضيف ${count(r.created, ['صف واحد', 'صفان', 'صفوف', 'صفًا'])} بنجاح`, 'success');
      csvText = null;
      preview = null;
      fileInput.value = '';
      fileLabel.textContent = 'لم يُختر ملف';
      fileLabel.classList.add('muted');
      previewBtn.disabled = true;
      mount(
        result,
        h(
          'div.stack',
          alertBox(`تم الاستيراد: أُضيف ${count(r.created, ['صف واحد', 'صفان', 'صفوف', 'صفًا'])}${r.skipped ? `، وتُركت الصفوف التي بها أخطاء (${num(r.skipped)})` : ''}.`, 'success', { title: 'اكتمل الاستيراد', icon: 'checkCircle' }),
          h(
            'ul.v9p-created',
            r.items.slice(0, 50).map((x) => h('li', h('a', { href: entity === 'lawyers' ? `#/lawyers/${x.id}` : `#/clients/${x.id}` }, x.label))),
          ),
        ),
      );
      loadHistory();
    }

    const entitySel = selectInput({
      label: 'نوع البيانات المستوردة',
      allLabel: null,
      value: entity,
      options: summary.importable.map((k) => ({ value: k, label: label('data_entity', k) })),
      onChange: (val) => {
        entity = val;
        preview = null;
        mount(result);
        renderGuide();
      },
    });
    renderGuide();
    return h(
      'div.stack',
      h(
        'ol.v9p-import-steps',
        h('li', h('h3', 'اختر نوع البيانات وراجع الأعمدة'), h('div.v9p-import-sel', entitySel), guide),
        h('li', h('h3', 'ارفع ملف CSV'), h('div.v9p-file-pick', fileInput, h('label.btn.btn-secondary', { htmlFor: fileId }, icon('upload', { size: 18 }), h('span', 'اختيار ملف CSV')), fileLabel), h('p.small.muted', 'احفظ الملف من Excel بصيغة «CSV UTF-8». تُقبل الفاصلة أو الفاصلة المنقوطة، وحتى 2000 صف.')),
        h('li', h('h3', 'عاين النتيجة ثم استورد الصفوف السليمة'), previewBtn),
      ),
      result,
    );
  }

  // ───────────── السجل ─────────────
  const historyBody = h('div', loading());
  async function loadHistory() {
    try {
      const s = await api.get('/admin/data/summary');
      Object.assign(summary.counts, s.counts);
      if (!s.history.length) {
        mount(historyBody, emptyState('لم يُصدَّر أو يُستورد أي ملف بعد.', null, { compact: true, icon: 'clock' }));
        return;
      }
      mount(
        historyBody,
        table({
          caption: 'آخر عمليات التصدير والاستيراد',
          columns: [
            { key: 'created_at', label: 'الوقت', render: (r) => h('time', { datetime: r.created_at, title: dateTime(r.created_at) }, relative(r.created_at)) },
            { key: 'type', label: 'العملية', render: (r) => (r.type === 'data.imported' ? badge('استيراد', 'info', { icon: 'upload' }) : badge('تصدير', 'warning', { icon: 'download' })) },
            { key: 'summary', label: 'التفاصيل' },
            { key: 'actor', label: 'بواسطة' },
          ],
          rows: s.history,
        }),
      );
    } catch (err) {
      mount(historyBody, errorState(err, loadHistory));
    }
  }
  loadHistory();

  const initial = ['export', 'import', 'history'].includes(ctx.query.tab) ? ctx.query.tab : 'export';
  return h(
    'div.v9p-page.v9p-data',
    pageHeader({
      title: 'استيراد وتصدير البيانات',
      subtitle: 'ملفات CSV متوافقة مع Excel بالعربية — لنقل بيانات المؤسسة من الجداول القديمة ولإعداد التقارير.',
    }),
    tabs(
      [
        { key: 'export', label: 'تصدير', icon: 'download', render: () => card({ body: exportPanel() }) },
        { key: 'import', label: 'استيراد', icon: 'upload', render: () => card({ body: importPanel() }) },
        { key: 'history', label: 'السجل', icon: 'clock', render: () => card({ title: 'آخر العمليات', subtitle: 'من سجل الأمان', body: historyBody }) },
      ],
      { active: initial, className: 'v9p-data-tabs' },
    ),
  );
}
