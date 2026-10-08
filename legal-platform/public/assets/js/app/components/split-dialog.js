// v9.2 (admin-ai) — «اعمل منها طلب جديد»: رسالة تحكي مشكلة جديدة في محادثة ملف مفتوح (استشارة أو ملف مستمر)
// تُنقل مع ما يخصها من رسائل إلى طلب جديد يُلخَّص ويُقترح له مسار، بدل أن تضيع داخل الملف القديم.

import { h, frag } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { dateTime, relative } from '../../lib/fmt.js';
import { modal, icon, toast, isAudioDoc } from '../../lib/ui.js';
import { newClientRef } from './call-note.js';

const MAX = 20;
const DAYS_30 = 30 * 24 * 3600 * 1000;

/**
 * رسائل المستفيدة الواردة التي يمكن نقلها (آخر 30 يومًا، ليست مكالمة سجلتها الإدارة).
 * [بوابة 9.2 G6] splitAfter: وقت فتح الملف — حكايتها الأصلية التي فُتح منها الملف لا تُعرض (الخادم يرفضها أيضًا).
 */
export function splittable(messages = [], now = Date.now(), splitAfter = null) {
  return messages.filter(
    (m) => m && m.direction === 'in' && !(m.meta && m.meta.call_note) && now - Date.parse(m.created_at || 0) <= DAYS_30 && !(splitAfter && String(m.created_at || '') <= String(splitAfter)),
  );
}

/**
 * @param {{messages:Array, preselectId?:number, splitAfter?:string|null, onDone?:(res:{intake:{id:number, code:string}})=>void}} opts
 * @returns {Promise<{intake:{id:number, code:string}}|null>}
 */
export function openSplitDialog({ messages = [], preselectId = null, onDone, splitAfter = null } = {}) {
  const list = splittable(messages, Date.now(), splitAfter).slice(-60);
  const chosen = new Set(preselectId != null && list.some((m) => m.id === preselectId) ? [preselectId] : []);
  const clientRef = newClientRef();
  const note = h('p.field-error', { role: 'alert', hidden: true });
  const counter = h('p.small.muted.pa-split-count', { 'aria-live': 'polite' });
  let result = null;

  const items = list.map((m) => {
    const cb = h('input', {
      type: 'checkbox',
      checked: chosen.has(m.id),
      onChange: () => {
        if (cb.checked) {
          if (chosen.size >= MAX) {
            cb.checked = false;
            note.textContent = `يمكن نقل ${MAX} رسالة على الأكثر في المرة الواحدة`;
            note.hidden = false;
            return;
          }
          chosen.add(m.id);
        } else chosen.delete(m.id);
        note.hidden = true;
        sync();
      },
    });
    const docs = (m.documents || []).map((d) => (isAudioDoc(d) ? 'رسالة صوتية' : d.filename || 'مرفق'));
    return h(
      'li.pa-split-item',
      h(
        'label.check.pa-split-check',
        cb,
        h(
          'span.pa-split-text',
          h('span.pa-split-body', { dir: 'auto' }, m.body || (docs.length ? '' : '—')),
          docs.length ? h('span.pa-split-docs', icon('paperclip', { size: 13 }), docs.join('، ')) : null,
          h('time.small.muted', { datetime: m.created_at, title: dateTime(m.created_at) }, relative(m.created_at)),
        ),
      ),
    );
  });

  function sync() {
    counter.textContent = chosen.size ? `المختار: ${chosen.size} من ${list.length}` : 'لم تختر أي رسالة بعد';
  }
  sync();

  // الرسالة التي ضُغط عليها ظاهرة ومحددة عند الفتح (القائمة بترتيب المحادثة، وهي غالبًا الأحدث)
  requestAnimationFrame(() => {
    const on = items.find((li) => li.querySelector('input:checked'));
    if (on) on.scrollIntoView({ block: 'nearest' });
  });
  return new Promise((resolve) => {
    modal({
      sheet: true,
      className: 'pa-split-sheet',
      title: 'طلب جديد من رسائل هذا الملف',
      body: frag(
        h('p.modal-intro', 'اختر الرسائل التي تخص المشكلة الجديدة. ستُنقل من محادثة الملف إلى الطلب الجديد ويُلخَّص.'),
        list.length ? h('ul.pa-split-list', { 'aria-label': 'رسائل المستفيدة في هذا الملف' }, items) : h('p.small.muted', 'لا توجد رسائل واردة منها في آخر 30 يومًا.'),
        counter,
        note,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'اعمل طلب جديد',
          variant: 'primary',
          icon: 'split',
          disabled: !list.length,
          onClick: async () => {
            if (!chosen.size) {
              note.textContent = 'اختر رسالة واحدة على الأقل';
              note.hidden = false;
              return false;
            }
            const res = await api.post('/admin/messages/split', { message_ids: [...chosen], client_ref: clientRef });
            result = res;
            return undefined;
          },
        },
      ],
      onClose: () => {
        resolve(result);
        if (!result || !result.intake) return;
        toast(`أُنشئ الطلب ${result.intake.code}`, 'success', 5000);
        if (onDone) onDone(result);
        else window.location.hash = `#/inbox/${result.intake.id}`;
      },
    });
  });
}
