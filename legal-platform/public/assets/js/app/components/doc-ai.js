// تحليل المستندات بالذكاء الاصطناعي (الإصدار 9 — وحدة ai).
//
// الاستخدام (يركّبه المسؤول عن صفحات التفاصيل بجوار كل مستند):
//   import { docAiButton, docAiPanel } from '../../components/doc-ai.js';
//   docAiButton({ documentId: d.id, onDone: (analysis) => {...} })            // للإدارة
//   docAiButton({ documentId: d.id, scope: 'lawyer' })                        // للمحامي (المستندات المتاحة له فقط)
//   docAiPanel(analysis)  // عرض نتيجة تحليل محفوظة (من GET /api/admin/ai/documents/:id أو قائمة ?case_id=)
//
// إن وُجد تحليل سابق يُعرض أولًا مع زر «إعادة التحليل»؛ وإلا يُحلَّل المستند فورًا.
import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, percent, dateTime, relative } from '../../lib/fmt.js';
import { button, modal, badge, loading, errorState, alertBox, icon, chips, toast, setBusy, errorMessage } from '../../lib/ui.js';

const FLAG_ICON = { expired: 'clock', illegible: 'eyeOff', missing_pages: 'fileText', inconsistent: 'alert', unverified: 'shield', other: 'info' };

function section(title, iconName, body) {
  return h('section.doc-ai-section', h('h3.doc-ai-title', icon(iconName, { size: 16 }), title), body);
}

/**
 * عرض نتيجة تحليل مستند.
 * @param {object} analysis كائن التحليل كما يعيده الخادم ({ doc_type, provider, result: {...} })
 * @param {{compact?:boolean}} [opts]
 */
export function docAiPanel(analysis, { compact = false, onRequestDoc = null } = {}) {
  if (!analysis) return h('p.muted', 'لم يُحلَّل هذا المستند بعد.');
  const r = analysis.result || analysis;
  const ai = analysis.provider === 'anthropic';
  const facts = Array.isArray(r.key_facts) ? r.key_facts : [];
  const proves = Array.isArray(r.proves) ? r.proves : [];
  const flags = Array.isArray(r.red_flags) ? r.red_flags : [];
  const missing = Array.isArray(r.missing_related) ? r.missing_related : [];
  return h(
    'div.doc-ai',
    { class: compact && 'is-compact' },
    h(
      'div.doc-ai-head',
      h('span.doc-ai-type', icon('fileText', { size: 18 }), h('strong', analysis.doc_type_label || label('ai_doc_type', analysis.doc_type))),
      ai ? badge('تحليل Claude', 'accent', { icon: 'sparkle' }) : badge('تحليل مبدئي', 'neutral', { icon: 'info' }),
      r.confidence != null && ai ? h('span.cell-sub', 'درجة الثقة: ', h('bdi', percent(r.confidence))) : null,
      analysis.created_at ? h('time.cell-sub', { datetime: analysis.created_at, title: dateTime(analysis.created_at) }, relative(analysis.created_at)) : null,
    ),
    analysis.stale ? alertBox('استُبدل ملف المستند بعد هذا التحليل؛ أعد التحليل للحصول على نتيجة محدثة.', 'warning') : null,
    !ai && r.note ? alertBox(String(r.note).replace(/^تحليل مبدئي دون ذكاء اصطناعي:\s*/, ''), 'info', { title: 'تحليل مبدئي دون ذكاء اصطناعي' }) : null,
    r.fallback_reason ? h('p.cell-sub.doc-ai-fallback', icon('alert', { size: 14 }), ` سبب عدم استخدام Claude: ${r.fallback_reason}`) : null,
    r.summary ? h('p.doc-ai-summary', r.summary) : null,
    facts.length
      ? section(
          'الوقائع الرئيسية في المستند',
          'search',
          h(
            'dl.doc-ai-facts',
            facts.map((f) => h('div.doc-ai-fact', h('dt', f.label || label('ai_fact_kind', f.kind)), h('dd', h('bdi', f.value)))),
          ),
        )
      : null,
    proves.length ? section('ما يثبته المستند للملف', 'checkCircle', h('ul.doc-ai-list.is-proves', proves.map((p) => h('li', p)))) : null,
    flags.length
      ? section(
          'ملاحظات تحتاج إلى انتباه',
          'alert',
          h(
            'ul.doc-ai-list.is-flags',
            flags.map((f) => h('li', h('span.doc-ai-flag-kind', icon(FLAG_ICON[f.kind] || 'info', { size: 14 }), label('ai_red_flag', f.kind)), h('span', f.text))),
          ),
        )
      : null,
    missing.length
      ? section(
          'مستندات مرتبطة يُستحسن طلبها',
          'paperclip',
          // v9.1 l-work (L-23): مع Claude ولدى المحامي، كل شريحة تفتح «اطلب» بنص «صورة {المستند}»
          ai && onRequestDoc
            ? h(
                'div.doc-ai-request-chips',
                missing.map((m) =>
                  h('button.lw-chip.doc-ai-request-chip', { type: 'button', onClick: () => onRequestDoc(`صورة ${String(m).replace(/\s*\([^)]*\)\s*/g, ' ').trim()}`) }, icon('plus', { size: 14 }), h('span', m)),
                ),
              )
            : chips(missing.map((m) => ({ label: m, tone: 'primary' }))),
        )
      : null,
    ai ? h('p.cell-sub.doc-ai-disclaimer', 'نتيجة آلية للمساعدة؛ يُرجع دائمًا إلى أصل المستند قبل الاعتماد عليها.') : null,
  );
}

/**
 * زر تحليل مستند: يعرض التحليل السابق إن وُجد، وإلا يحلل المستند ويعرض النتيجة.
 * @param {{documentId:number, onDone?:(analysis:object)=>void, scope?:'admin'|'lawyer', label?:string, size?:string, variant?:string}} opts
 */
export function docAiButton({ documentId, onDone, scope = 'admin', label: text = 'تحليل المستند', size = 'sm', variant = 'ghost', onView = null, onRequestDoc = null } = {}) {
  const btn = button(text, {
    variant,
    size,
    icon: 'sparkle',
    className: 'doc-ai-btn',
    title: 'تحليل نوع المستند ووقائعه وما يثبته والملاحظات عليه',
    onClick: () => openDocAi({ documentId, onDone, scope, onView, onRequestDoc }),
  });
  if (!documentId) btn.disabled = true;
  return btn;
}

/**
 * v9.1 l-work: فتح نافذة التحليل مباشرة (من قائمة ⋯ للمستند).
 * onView(): زر «عرض المستند» أعلى النافذة (L-05)، onRequestDoc(text): الشرائح المرتبطة تفتح «اطلب» (L-23، مع Claude فقط).
 */
export function openDocAi({ documentId, onDone, scope = 'admin', onView = null, onRequestDoc = null } = {}) {
  const base = scope === 'lawyer' ? '/lawyer/ai/documents' : '/admin/ai/documents';
  let m = null;
  open();

  function open() {
    const body = h('div.doc-ai-modal-body', { 'aria-live': 'polite' }, loading('جارٍ التحميل…'));
    let busy = false;

    async function analyze(trigger) {
      if (busy) return;
      busy = true;
      if (trigger) setBusy(trigger, true);
      mount(body, loading('جارٍ تحليل المستند… قد يستغرق ذلك دقيقة'));
      try {
        const a = await api.post(`${base}/${documentId}/analyze`, {});
        show(a);
        if (onDone) onDone(a);
        toast(a.provider === 'anthropic' ? 'اكتمل تحليل المستند' : 'اكتمل التصنيف المبدئي للمستند', 'success');
      } catch (err) {
        mount(body, errorState(err, () => analyze()));
      } finally {
        busy = false;
        if (trigger) setBusy(trigger, false);
      }
    }

    function show(a) {
      const again = button('إعادة التحليل', { variant: 'secondary', size: 'sm', icon: 'refresh', onClick: (e) => analyze(e.currentTarget) });
      const request = onRequestDoc
        ? (text) => {
            if (m) m.close('action');
            onRequestDoc(text);
          }
        : null;
      mount(body, docAiPanel(a, { onRequestDoc: request }), h('div.doc-ai-again', again));
    }

    // v9.1 l-work (L-05): «عرض المستند» أعلى النافذة
    const viewTop = onView ? h('div.doc-ai-view-top', button('عرض المستند', { variant: 'secondary', size: 'sm', icon: 'eye', onClick: () => onView() })) : null;
    m = modal({ title: 'تحليل المستند', size: 'lg', className: 'doc-ai-modal', body: viewTop ? h('div', viewTop, body) : body, actions: [{ label: 'إغلاق', variant: 'ghost' }] });
    api
      .get(`${base}/${documentId}`)
      .then((res) => (res && res.analysis ? show(res.analysis) : analyze()))
      .catch((err) => {
        if (err && err.status === 404) mount(body, errorState(err));
        else mount(body, alertBox(errorMessage(err), 'danger'));
      });
  }
  return m;
}

export default docAiButton;
