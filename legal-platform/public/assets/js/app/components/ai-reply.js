// الردود المقترحة بالذكاء الاصطناعي للإدارة (الإصدار 9 — وحدة ai).
//
// الاستخدام (يركّبه المسؤول عن صفحات التفاصيل بجوار خانة كتابة الرسالة):
//   import { aiReplyButton } from '../../components/ai-reply.js';
//   const btn = aiReplyButton({ caseId: c.id, onText: (text, meta) => { textarea.value = text; textarea.focus(); } });
//   // اختياري بعد الإرسال الفعلي: meta.reportFinal(النص المرسل) لتسجيل ما إذا عُدّل المقترح (تغذية راجعة)
//
// مرّر واحدًا فقط من: intakeId أو caseId أو matterId. الخادم يبني الرد من المحادثة وتحليل الفرز والطلبات المرسلة
// والرد المعتمد فقط، ولا يذكر أسماء المحامين أو الملاحظات الداخلية. بدون onText يُنسخ النص إلى الحافظة.
import { h, frag, mount } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, count } from '../../lib/fmt.js';
import { button, modal, badge, loading, errorState, emptyState, alertBox, icon, toast, errorMessage } from '../../lib/ui.js';
// v11 segment-staff (r2 P13): نوع الخدمة والنبرة و«سيُرسل من» في رأس النافذة
import { sendHeader } from './segment-ui.js';

const INTENTS = [
  { key: 'answer', icon: 'message' },
  { key: 'ask_documents', icon: 'paperclip' },
  { key: 'reassure', icon: 'shieldCheck' },
  { key: 'schedule', icon: 'calendar' },
];
const CHARS = ['حرف واحد', 'حرفان', 'أحرف', 'حرفًا'];

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' }, readonly: true, value: text });
    document.body.append(ta);
    ta.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    ta.remove();
    return done;
  }
}

function sendFeedback(suggestionId, body) {
  return api.post(`/admin/ai/suggestions/${suggestionId}/feedback`, body).catch(() => null);
}

/**
 * نافذة الردود المقترحة.
 * @param {{target:{intake_id?:number, case_id?:number, matter_id?:number}, onText?:(text:string, meta:object)=>void, intent?:string,
 *          sendInfo?:{segment?:string|null, tone?:string, sendLine?:{key,label}|null, company?:boolean}}} opts
 */
export function openReplyDialog({ target, onText, intent = 'answer', sendInfo = null } = {}) {
  let current = INTENTS.some((x) => x.key === intent) ? intent : 'answer';
  let seq = 0;
  let dialog = null;
  const results = h('div.ai-reply-results', { 'aria-live': 'polite', 'aria-busy': 'false' });

  const intentButtons = INTENTS.map((it) =>
    h(
      'button.ai-intent',
      {
        type: 'button',
        'aria-pressed': String(it.key === current),
        dataset: { intent: it.key },
        onClick: () => {
          if (current === it.key) return;
          current = it.key;
          intentButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.intent === current)));
          load();
        },
      },
      icon(it.icon, { size: 16 }),
      h('span', label('ai_reply_intent', it.key)),
    ),
  );

  async function load() {
    const my = ++seq;
    results.setAttribute('aria-busy', 'true');
    mount(results, loading('جارٍ اقتراح الردود…'));
    try {
      const r = await api.post('/admin/ai/suggest-reply', { ...target, intent: current });
      if (my !== seq) return;
      draw(r);
    } catch (err) {
      if (my !== seq) return;
      mount(results, errorState(err, load));
    } finally {
      if (my === seq) results.setAttribute('aria-busy', 'false');
    }
  }

  function item(r, s, i) {
    const counter = h('span.cell-sub.ai-reply-count');
    const ta = h('textarea.input.ai-reply-text', {
      // ارتفاع مناسب لطول النص (عدد الأسطر أو نحو 48 حرفًا للسطر على الشاشات الصغيرة)
      rows: Math.min(10, Math.max(3, String(s.text).split('\n').length + 1, Math.ceil(String(s.text).length / 48) + 1)),
      maxlength: 4000,
      'aria-label': `نص الرد المقترح رقم ${i + 1} (${label('ai_reply_tone', s.tone)}) — يمكنك تعديله قبل الاستخدام`,
    });
    ta.value = s.text;
    const updateCount = () => (counter.textContent = count(ta.value.trim().length, CHARS));
    ta.addEventListener('input', updateCount);
    updateCount();
    const li = h('li.ai-reply-item');

    const use = button(onText ? 'استخدام' : 'نسخ الرد', {
      variant: 'primary',
      size: 'sm',
      icon: onText ? 'check' : 'copy',
      onClick: async () => {
        const text = ta.value.trim();
        if (!text) {
          toast('نص الرد فارغ', 'warning');
          ta.focus();
          return;
        }
        // تغذية راجعة: استُخدم كما هو أم بعد التعديل (لا تمنع الاستخدام إن فشلت)
        sendFeedback(r.id, { index: i, action: 'used', final_text: text });
        if (onText) {
          onText(text, {
            suggestionId: r.id,
            index: i,
            tone: s.tone,
            intent: r.intent,
            provider: r.provider,
            reportFinal: (finalText) => sendFeedback(r.id, { index: i, action: 'sent', final_text: String(finalText || '').slice(0, 4000) }),
          });
          dialog?.close('action');
          toast('أُدرج الرد المقترح — راجعه قبل الإرسال', 'success');
        } else {
          const ok = await copyToClipboard(text);
          toast(ok ? 'نُسخ الرد إلى الحافظة' : 'تعذر النسخ، انسخ النص يدويًا', ok ? 'success' : 'warning');
        }
      },
    });
    const reject = button('غير مناسب', {
      variant: 'ghost',
      size: 'sm',
      icon: 'x',
      title: 'تسجيل أن هذا الاقتراح غير مناسب (يساعد على تحسين الاقتراحات)',
      onClick: async () => {
        await sendFeedback(r.id, { index: i, action: 'rejected' });
        li.classList.add('is-rejected');
        reject.disabled = true;
        toast('شكرًا، سُجل التقييم', 'info', 2000);
      },
    });
    mount(
      li,
      h('div.ai-reply-head', badge(label('ai_reply_tone', s.tone), 'neutral', { icon: 'message' }), counter),
      ta,
      h('div.ai-reply-actions', use, reject),
    );
    return li;
  }

  function draw(r) {
    const list = Array.isArray(r?.suggestions) ? r.suggestions : [];
    if (!list.length) {
      mount(results, emptyState('لم نتمكن من اقتراح رد مناسب لهذا الغرض. يمكنك كتابة الرد يدويًا.', null, { compact: true, icon: 'message' }));
      return;
    }
    mount(
      results,
      h(
        'div.ai-reply-meta',
        r.provider === 'anthropic' ? badge('اقتراح Claude', 'info', { icon: 'sparkle' }) : badge('قوالب المحلل المحلي', 'neutral', { icon: 'fileText' }),
        Array.isArray(r.grounded_on) && r.grounded_on.length ? h('span.cell-sub', `مبني على: ${r.grounded_on.join('، ')}`) : null,
      ),
      r.fallback_reason ? alertBox(`استُخدمت القوالب المحلية بدل Claude: ${r.fallback_reason}`, 'warning') : null,
      h('ol.ai-reply-list', list.map((s, i) => item(r, s, i))),
      h('div.ai-reply-foot', button('اقتراحات أخرى', { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: load })),
    );
  }

  dialog = modal({
    title: 'ردود مقترحة على المستفيد',
    size: 'lg',
    className: 'ai-reply-modal',
    body: frag(
      sendInfo ? sendHeader(sendInfo) : null,
      h('p.modal-intro', 'اختر الغرض من الرد، ثم راجع النص وعدّله إن لزم قبل استخدامه. لا تتضمن الردود أي رأي قانوني لم تعتمده الإدارة.'),
      h('div.ai-intents', { role: 'group', 'aria-label': 'الغرض من الرد' }, intentButtons),
      results,
    ),
    actions: [{ label: 'إغلاق', variant: 'ghost' }],
  });
  load();
  return dialog;
}

/**
 * زر «اقتراح رد» يفتح نافذة الردود المقترحة.
 * @param {{intakeId?:number, caseId?:number, matterId?:number, onText?:(text:string, meta:object)=>void,
 *          label?:string, intent?:string, size?:string, variant?:string, sendInfo?:object}} opts  sendInfo: رأس الإرسال (segment-ui)
 */
export function aiReplyButton({ intakeId, caseId, matterId, onText, label: text = 'اقتراح رد', intent = 'answer', size = 'sm', variant = 'secondary', sendInfo = null } = {}) {
  const target = intakeId ? { intake_id: Number(intakeId) } : caseId ? { case_id: Number(caseId) } : matterId ? { matter_id: Number(matterId) } : null;
  const btn = button(text, {
    variant,
    size,
    icon: 'sparkle',
    className: 'ai-reply-btn',
    title: 'ردود مقترحة قصيرة جاهزة للإرسال عبر واتساب',
    onClick: () => {
      try {
        openReplyDialog({ target, onText, intent, sendInfo });
      } catch (err) {
        toast(errorMessage(err), 'danger');
      }
    },
  });
  if (!target) btn.disabled = true;
  return btn;
}

export default aiReplyButton;
