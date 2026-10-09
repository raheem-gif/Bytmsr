// v10 b2b-staff (STF-4، U10-S13) — «سؤال للشركة»: استيضاح يصل الشركة عبر بوابتها ببنود (حتى 5) تجيب عنها أو تعلّمها
// «غير متوفر لدينا». معاينة «كما ستراها الشركة» بمكوّن البوابة نفسه (coClarificationCard). قبل القبول يُحتسب الاستيضاح
// ردًا أول (الرسالة العادية لا تُحتسب، CO-3)؛ بعده يتوقف موعد التسليم حتى ترد الشركة.

import { h, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { modal, button, icon, alertBox, toast, errorMessage, discardGuard } from '../../lib/ui.js';
import { coClarificationCard } from '../../lib/company-ui.js';
import { hm } from '../pages/admin/company-requests.js';

const MAX_ITEMS = 5;
const DEFAULT_TEXT = 'لاستكمال الطلب نحتاج منكم:';

/**
 * @param {object} o
 * @param {object} o.detail صفحة الطلب للفريق
 * @param {string[]} [o.items] بنود معبأة مسبقًا («ينقصه» المحددة أو أسئلة الفرز)
 * @param {(res:object)=>void} [o.onDone]
 */
export async function openClarifySheet({ detail, items = [], onDone } = {}) {
  const d = detail;
  const r = d.request;
  const accepted = !!d.case && ['in_progress', 'delivered'].includes(r.status);
  const rows = (items || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, MAX_ITEMS);
  if (!rows.length) rows.push('');
  let handle = null;
  let result = null;

  const alertHost = h('div.cs-alert', { 'aria-live': 'assertive' });
  const ta = h('textarea.input#cs-clar-body', { rows: 4, maxlength: 3000, dir: 'auto', required: true });
  ta.value = DEFAULT_TEXT;
  const itemsHost = h('ol.cs-items');
  const previewHost = h('div.cs-preview-card');

  function drawItems() {
    mount(
      itemsHost,
      rows.map((v, i) =>
        h(
          'li.cs-item',
          h('input.input', {
            type: 'text',
            value: v,
            maxlength: 200,
            dir: 'auto',
            'aria-label': `البند ${i + 1}`,
            placeholder: 'مثل: نسخة العقد الموقعة',
            onInput: (e) => {
              rows[i] = e.target.value;
              drawPreview();
            },
          }),
          button('', { variant: 'ghost', size: 'sm', icon: 'x', ariaLabel: `حذف البند ${i + 1}`, onClick: () => (rows.splice(i, 1), drawItems(), drawPreview()) }),
        ),
      ),
    );
    addBtn.disabled = rows.length >= MAX_ITEMS;
  }
  const addBtn = button('إضافة بند', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: () => (rows.push(''), drawItems(), itemsHost.querySelector('li:last-child input')?.focus()) });

  function cleanItems() {
    return rows.map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  function drawPreview() {
    const card = coClarificationCard({ id: 0, direction: 'out', kind: 'clarification', body: ta.value.trim(), items: cleanItems().map((label) => ({ label })), author: { kind: 'team' } }, {});
    mount(previewHost, card);
  }
  ta.addEventListener('input', drawPreview);

  const slaText = accepted
    ? `يتوقف موعد التسليم حتى ترد الشركة (المتبقي الآن: ${hm(d.sla?.business_minutes_left)} س عمل).`
    : `${d.sla?.first_response_at ? '' : 'الرد الأول يُحتسب بهذا الاستيضاح. '}يعود الطلب إلى الفرز عند رد الشركة.`;

  async function submit() {
    mount(alertHost);
    const body = ta.value.trim();
    if (body.length < 5) {
      mount(alertHost, alertBox('اكتب نص الرسالة.', 'danger'));
      ta.focus();
      return false;
    }
    try {
      result = await api.post(`/admin/company-requests/${r.id}/clarify`, { rev: d.rev, body, items: cleanItems() });
      return true;
    } catch (err) {
      const det = err && err.details;
      const msg = err && err.code === 'lawyer_names' && det && det.lawyer_names && det.lawyer_names[0]
        ? `الرسالة تحتوي اسم محامٍ من فريق العمل («${det.lawyer_names[0].name}»). الشركة لا ترى أسماء المحامين — احذف الاسم أو أعد الصياغة.`
        : err && err.code === 'request_changed'
          ? 'تغيّر الطلب بعد فتح هذه النافذة (ردّت الشركة أو أُضيف مستند). أغلق النافذة لمراجعة التغييرات؛ يبقى ما كتبته هنا حتى تغلقها.'
          : errorMessage(err);
      mount(alertHost, alertBox(msg, 'danger'));
      return false;
    }
  }

  // review: يُقارن بالبنود كما عُبئت بعد التنظيف نفسه (مسافات زائدة في بنود الفرز لا تجعل الورقة «معدّلة»)
  const initialItems = cleanItems().join('\n');
  const isDirty = () => ta.value.trim() !== DEFAULT_TEXT || cleanItems().join('\n') !== initialItems;
  handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-clarify',
    title: 'سؤال للشركة',
    subtitle: `${r.code} — ${d.company.name}`,
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body.cs-two',
      h(
        'div.cs-col',
        alertHost,
        h('div.field', h('label.field-label', { htmlFor: 'cs-clar-body' }, 'الرسالة', h('span.req', { 'aria-hidden': 'true' }, '*')), ta),
        h('div.field', h('span.field-label', `المطلوب (حتى ${MAX_ITEMS})`), itemsHost, addBtn),
        h('p.cs-sla', icon('clock', { size: 15 }), h('span', slaText)),
      ),
      h('div.cs-col', h('h3.cs-section-title', 'كما ستراها الشركة'), previewHost),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      { label: 'إرسال للشركة', variant: 'primary', icon: 'send', onClick: async () => ((await submit()) ? undefined : false) },
    ],
    onClose: () => {
      if (!result) return;
      toast(`أُرسل السؤال إلى ${d.company.name}.`, 'success');
      if (onDone) onDone(result);
    },
  });
  drawItems();
  drawPreview();
  return handle;
}
