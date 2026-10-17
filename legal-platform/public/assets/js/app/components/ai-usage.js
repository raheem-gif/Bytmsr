// لوحة استهلاك الذكاء الاصطناعي وتكلفته وسقف الإنفاق، وبطاقة حالة المزود، وآخر تحليلات المستندات
// (الإصدار 9 — وحدة ai). تُعرض في تبويب «أداء الذكاء الاصطناعي» بصفحة المعرفة المؤسسية.
import { h, frag, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, num, count, percent, dateTime, relative } from '../../lib/fmt.js';
import { card, kv, badge, codeTag, statCard, table, alertBox, emptyState, asyncButton, button, toast, icon, modal, progressBar, errorState, richText } from '../../lib/ui.js';
import { docAiPanel } from './doc-ai.js';

const CALLS = ['استدعاء واحد', 'استدعاءان', 'استدعاءات', 'استدعاءً'];
const ERRORS = ['خطأ واحد', 'خطآن', 'أخطاء', 'خطأً'];

/** مبلغ بالدولار الأمريكي (تكلفة تقديرية) */
export function usd(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0 دولار';
  if (v < 0.01) return 'أقل من 0.01 دولار';
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} دولار`;
}
/** سعر بالدولار مع مطابقة العدد والمعدود للأعداد الصحيحة («4 دولارات»، «20 دولارًا»)؛ الكسور بالمفرد («0.2 دولار») */
function dollars(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? count(v, ['دولار واحد', 'دولاران', 'دولارات', 'دولارًا']) : `${v} دولار`;
}
function seconds(ms) {
  if (ms == null) return '—';
  const s = Number(ms) / 1000;
  return s < 1 ? 'أقل من ثانية' : `${s.toLocaleString('en-US', { maximumFractionDigits: 1 })} ث`;
}
function tokensPair(r) {
  return h('span.nowrap', { dir: 'ltr' }, `${num(r.input_tokens + r.cache_read_tokens + r.cache_write_tokens)} / ${num(r.output_tokens)}`);
}

/** شريط تنبيه سقف الإنفاق (يُعرض أيضًا في أي صفحة تملك حالة الذكاء الاصطناعي) */
export function aiBudgetBanner(budget, { isAdmin = false } = {}) {
  if (!budget || !budget.limit_usd) return null;
  const link = isAdmin ? h('a', { href: '#/integrations', tag: 'KNL-68' }, 'صفحة التكاملات') : 'صفحة التكاملات (مدير النظام)';
  if (budget.exceeded) {
    return alertBox(
      h('span', `بلغ الإنفاق التقديري هذا الشهر ${usd(budget.spent_usd)} من سقف ${usd(budget.limit_usd)}. يعمل النظام الآن بالمحلل المحلي حتى بداية الشهر القادم أو رفع السقف من `, link, '.'),
      'danger',
      { title: 'تجاوز إنفاق الذكاء الاصطناعي السقف الشهري', icon: 'wallet', tag: 'KNL-69' },
    );
  }
  if (budget.warning) {
    return alertBox(
      `بلغ الإنفاق التقديري ${usd(budget.spent_usd)} (${percent(budget.ratio)} من السقف ${usd(budget.limit_usd)}). عند بلوغ السقف يعود النظام تلقائيًا إلى المحلل المحلي.`,
      'warning',
      { title: 'اقترب الإنفاق من السقف الشهري', icon: 'wallet', tag: 'KNL-70' },
    );
  }
  return null;
}

/** بطاقة حالة المزود مع زر اختبار الاتصال لمدير النظام */
export function aiStatusCard(st = {}, { isAdmin = false } = {}) {
  const resultHost = h('div.ai-test-result', { 'aria-live': 'polite' });
  const testBtn = isAdmin
    ? asyncButton(
        'اختبار الاتصال',
        async () => {
          const r = await api.post('/admin/ai/test');
          mount(
            resultHost,
            r.ok
              ? alertBox(h('span', 'نجح الاتصال بالنموذج ', codeTag(r.model), ` خلال ${seconds(r.latency_ms)}.`), 'success', { tag: 'KNL-71' })
              : alertBox(r.error || 'تعذر الاتصال', 'danger', { title: 'فشل اختبار الاتصال', tag: 'KNL-72' }),
          );
          toast(r.ok ? 'نجح اختبار الاتصال بخدمة Claude' : r.error || 'فشل اختبار الاتصال', r.ok ? 'success' : 'danger');
        },
        { icon: 'zap', size: 'sm', title: 'يرسل طلبًا صغيرًا حقيقيًا للتحقق من المفتاح والنموذج', tag: 'KNL-73' },
      )
    : null;
  const active = st.provider === 'anthropic';
  const blocked = st.configured && !active;
  let note;
  if (active) note = 'عند تعذر الاتصال يعود النظام تلقائيًا للمحلل المحلي حتى لا يتوقف العمل.';
  else if (blocked) note = 'المفتاح مضبوط، لكن الطلبات تُخدم محليًا لتجاوز سقف الإنفاق الشهري.';
  else if (st.mode === 'heuristic') note = 'المزوّد مضبوط على «المحلل المحلي فقط».';
  else note = isAdmin ? h('span', 'لتفعيل Claude أدخل مفتاح Anthropic API من ', h('a', { href: '#/integrations', tag: 'KNL-74' }, 'صفحة التكاملات'), '.') : 'لتفعيل Claude يضبط مدير النظام مفتاح Anthropic API من صفحة التكاملات.';
  return card({
    title: 'مزود التحليل الحالي',
    icon: 'settings',
    actions: testBtn,
    body: frag(
      kv(
        [
          ['المزود', h('span.ai-status-line', st.label || label('ai_provider', st.provider), badge(active ? 'متصل' : blocked ? 'متوقف مؤقتًا' : 'يعمل محليًا', active ? 'success' : blocked ? 'danger' : 'info'))],
          // النموذج لا يُستخدم إلا مع Claude: مع المحلل المحلي يُعرض كإعداد للمستقبل لا كمزود فعلي
          [active ? 'النموذج' : 'النموذج عند تفعيل Claude', st.configured_model ? codeTag(st.configured_model) : st.model ? codeTag(st.model) : null],
          st.mode ? ['وضع التشغيل', label('ai_mode', st.mode)] : null,
          st.effort ? ['مستوى الجهد', label('ai_effort', st.effort)] : null,
          ['ملاحظة', note],
        ],
        { columns: 1 },
      ),
      resultHost,
    ),
    titleTag: 'KNL-75',
    tag: 'KNL-76',
  });
}

/** قسم الاستهلاك والتكلفة لهذا الشهر */
export function aiUsageSection(u, { isAdmin = false } = {}) {
  if (!u) return null;
  if (u.__error) return h('section.section', { tag: 'KNL-77' }, h('h2.section-title', { tag: 'KNL-78' }, 'الاستهلاك والتكلفة'), errorState(u.__error));
  const t = u.totals || {};
  const b = u.budget || {};
  const features = Array.isArray(u.by_feature) ? u.by_feature : [];
  const monthly = Array.isArray(u.monthly) ? u.monthly : [];
  const errors = Array.isArray(u.recent_errors) ? u.recent_errors : [];
  const price = u.status?.price;
  const model = u.status?.configured_model;
  const local = t.heuristic_calls || 0;

  const budgetBlock = b.limit_usd
    ? h(
        'div.ai-budget',
        h('div.ai-budget-head', h('span', icon('wallet', { size: 16 }), ' سقف الإنفاق الشهري'), h('strong', `${usd(b.spent_usd)} من ${usd(b.limit_usd)}`)),
        progressBar(Math.min(b.spent_usd, b.limit_usd), b.limit_usd, b.exceeded ? 'danger' : b.warning ? 'warning' : 'success', { label: 'نسبة استهلاك السقف الشهري', visibleLabel: false }),
        h('p.cell-sub', b.exceeded ? 'تجاوز السقف: الطلبات تُخدم بالمحلل المحلي.' : `المتبقي: ${usd(Math.max(0, b.limit_usd - b.spent_usd))}`),
      )
    : h('p.cell-sub.ai-budget-none', icon('info', { size: 14 }), ' لم يُحدد سقف شهري للإنفاق. ', isAdmin ? h('a', { href: '#/integrations', tag: 'KNL-79' }, 'حدده من صفحة التكاملات') : null);

  return h(
    'section.section.ai-usage',
    { tag: 'KNL-80' }, h('h2.section-title', { tag: 'KNL-81' }, icon('chart', { size: 18 }), `الاستهلاك والتكلفة — ${u.period_label || u.period}`),
    aiBudgetBanner(b, { isAdmin }),
    h(
      'div.stats-grid.ai-usage-stats',
      statCard({ label: 'التكلفة التقديرية هذا الشهر', value: usd(t.cost_usd), hint: 'بأسعار Anthropic المعلنة', icon: 'wallet', tone: b.exceeded ? 'danger' : 'primary', tag: 'KNL-82' }),
      statCard({ label: 'استدعاءات Claude', value: num(t.claude_calls || 0), hint: t.avg_latency_ms != null ? `متوسط زمن الاستجابة ${seconds(t.avg_latency_ms)}` : 'لا استدعاءات بعد', icon: 'sparkle', tone: 'accent', tag: 'KNL-83' }),
      statCard({ label: 'خدمها المحلل المحلي', value: num(local), hint: t.fallbacks ? `منها ${count(t.fallbacks, CALLS)} بسبب تعذر أو تجاوز السقف` : 'دون تكلفة', icon: 'fileText', tone: 'neutral', tag: 'KNL-84' }),
      statCard({ label: 'الأخطاء', value: num(t.errors || 0), hint: t.errors ? 'راجع أحدث الأخطاء أدناه' : 'لا أخطاء هذا الشهر', icon: 'alert', tone: t.errors ? 'warning' : 'success', tag: 'KNL-85' }),
    ),
    budgetBlock,
    h(
      'div.ai-usage-tables',
      h(
        'div.ai-usage-block',
        h('h3.ai-usage-title', { tag: 'KNL-86' }, 'الاستدعاءات حسب الوظيفة'),
        table({
          className: 'pd-table-tight',
          caption: 'استدعاءات الذكاء الاصطناعي حسب الوظيفة هذا الشهر',
          rows: features,
          empty: 'لم تُستخدم وظائف الذكاء الاصطناعي هذا الشهر بعد',
          columns: [
            { key: 'label', label: 'الوظيفة', render: (r) => h('span.cell-title', r.label || label('ai_feature', r.feature)), tag: 'KNL-87' },
            { key: 'claude', label: 'Claude', align: 'end', render: (r) => num(r.claude_calls), tag: 'KNL-88' },
            { key: 'local', label: 'محليًا', align: 'end', className: 'ai-col-opt', render: (r) => num(r.heuristic_calls), tag: 'KNL-89' },
            { key: 'errors', label: 'أخطاء', align: 'end', className: 'ai-col-opt', render: (r) => (r.errors ? h('strong.pd-text-danger', num(r.errors)) : num(0)), tag: 'KNL-90' },
            { key: 'tokens', label: 'الرموز (إدخال / إخراج)', align: 'end', className: 'ai-col-opt', render: (r) => (r.claude_calls ? tokensPair(r) : h('span.muted', '—')), tag: 'KNL-91' },
            { key: 'cost', label: 'التكلفة', align: 'end', render: (r) => h('span.nowrap', usd(r.cost_usd)), tag: 'KNL-92' },
          ],
          rowTag: 'KNL-93',
          tag: 'KNL-94',
        }),
      ),
      monthly.length > 1
        ? h(
            'div.ai-usage-block',
            h('h3.ai-usage-title', { tag: 'KNL-95' }, 'آخر الأشهر'),
            table({
              className: 'pd-table-tight',
              caption: 'التكلفة والاستدعاءات شهريًا',
              rows: monthly,
              columns: [
                { key: 'label', label: 'الشهر', render: (r) => h('span.nowrap', r.label), tag: 'KNL-96' },
                { key: 'claude', label: 'Claude', align: 'end', render: (r) => num(r.claude_calls), tag: 'KNL-97' },
                { key: 'errors', label: 'أخطاء', align: 'end', className: 'ai-col-opt', render: (r) => num(r.errors), tag: 'KNL-98' },
                { key: 'cost', label: 'التكلفة', align: 'end', render: (r) => h('span.nowrap', usd(r.cost_usd)), tag: 'KNL-99' },
              ],
              rowTag: 'KNL-100',
              tag: 'KNL-101',
            }),
          )
        : null,
    ),
    errors.length
      ? h(
          'div.ai-usage-block',
          h('h3.ai-usage-title', { tag: 'KNL-102' }, `أحدث الأخطاء (${count(errors.length, ERRORS)})`),
          h(
            'ul.ai-errors',
            errors.map((e) =>
              h(
                'li.ai-error',
                h('div.ai-error-head', badge(e.label || label('ai_feature', e.feature), 'neutral'), e.model ? codeTag(e.model) : null, h('time.cell-sub', { datetime: e.created_at, title: dateTime(e.created_at) }, relative(e.created_at))),
                h('p', e.error || '—'),
              ),
            ),
          ),
        )
      : null,
    h(
      'p.cell-sub.ai-price-note',
      icon('info', { size: 14 }),
      price && model
        ? h('span', ' التكلفة تقديرية بأسعار نموذج ', codeTag(model), ` لكل مليون رمز: الإدخال ${dollars(price.input)}، والإخراج ${dollars(price.output)}، والقراءة من الذاكرة المؤقتة ${dollars(price.cache_read)}. الفاتورة الرسمية في لوحة Anthropic هي المرجع.`)
        : ' التكلفة تقديرية؛ الفاتورة الرسمية في لوحة Anthropic هي المرجع.',
    ),
  );
}

/** آخر تحليلات المستندات مع عرض النتيجة في نافذة */
export function recentDocAnalyses(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const view = (r) =>
    modal({
      title: `تحليل المستند: ${r.document?.title || r.document?.filename || ''}`,
      size: 'lg',
      className: 'doc-ai-modal',
      body: docAiPanel(r),
      actions: [{ label: 'إغلاق', variant: 'ghost', tag: 'KNL-103' }],
      tag: 'KNL-104',
    });
  return h(
    'section.section',
    { tag: 'KNL-105' }, h('h2.section-title', { tag: 'KNL-106' }, icon('fileText', { size: 18 }), 'أحدث تحليلات المستندات'),
    h('p.pd-section-hint', 'يحلل الذكاء الاصطناعي نوع المستند ووقائعه وما يثبته والملاحظات عليه عند طلب الإدارة أو المحامي المتاح له المستند. بدون ربط Claude يُصنَّف المستند مبدئيًا من اسمه فقط.'),
    items.length
      ? table({
          className: 'pd-table-tight',
          caption: 'أحدث تحليلات المستندات',
          rows: items,
          onRowClick: view,
          columns: [
            { key: 'doc', label: 'المستند', className: 'col-wide', render: (r) => h('div.pd-cell-stack', h('span.cell-title', richText(r.document?.title || r.document?.filename || '—')), h('span.cell-sub', r.doc_type_label)), tag: 'KNL-107' },
            { key: 'case', label: 'الملف', render: (r) => (r.case_code ? h('a', { href: `#/cases/${r.case_id}`, tag: 'KNL-108' }, codeTag(r.case_code)) : null), tag: 'KNL-109' },
            { key: 'provider', label: 'نوع التحليل', render: (r) => (r.provider === 'anthropic' ? badge('Claude', 'accent', { icon: 'sparkle' }) : badge('مبدئي', 'neutral')), tag: 'KNL-110' },
            { key: 'at', label: 'التاريخ', render: (r) => h('time.nowrap', { datetime: r.created_at, title: dateTime(r.created_at) }, relative(r.created_at)), tag: 'KNL-111' },
            { key: 'open', label: '', align: 'end', render: (r) => button('عرض', { size: 'sm', variant: 'ghost', icon: 'eye', ariaLabel: `عرض تحليل ${r.document?.title || 'المستند'}`, onClick: () => view(r), tag: 'KNL-112' }), tag: 'KNL-113' },
          ],
          rowTag: 'KNL-114',
          tag: 'KNL-115',
        })
      : emptyState('لم يُحلَّل أي مستند بعد. يمكن طلب التحليل من صفحة الملف بجوار كل مستند.', null, { compact: true, icon: 'fileText', tag: 'KNL-116' }),
  );
}
