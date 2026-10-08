// v9.2 (admin-ai) — المكالمة مع المستفيدة: «تسجيل المكالمة» (ما قالته يدخل قصتها ويُلخَّص) و«لم ترد» (محاولة اتصال لم تنجح)
// و«إغلاق: تعذّر الوصول إليها» بعد 3 محاولات في يومين مختلفين. لا رسالة تُرسل لها من هنا، ولا يتأكد رقمها إلا بعلامة صريحة.

import { h, frag } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { label, relative, dateTime, orgName, count } from '../../lib/fmt.js';
import { modal, field, button, icon, toast, confirmDialog, confirmDanger, alertBox, ltr, uid } from '../../lib/ui.js';

/** معرّف جديد لكل فتح للنافذة: نقرتان على «حفظ» = مكالمة واحدة (يتجاهل الخادم التكرار) */
export function newClientRef() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    /* متصفح قديم */
  }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** رقم الطلب كما تسمعه المستفيدة («طلب رقم 29») */
export function refNumber(code) {
  const m = /^[A-Z]+-\d{4}-0*(\d+)$/.exec(String(code || ''));
  return m ? m[1] : String(code || '');
}

/** سطر بداية المكالمة للموظف (§6.4) */
export function callIntroText(code) {
  return `قل: معاكي ${orgName()} بخصوص طلب رقم ${refNumber(code)}. اتأكد إنك بتكلمها هي قبل أي تفاصيل، ولا تذكر الموضوع لغيرها.`;
}

/**
 * «تسجيل المكالمة»: ما قالته المستفيدة في المكالمة ← رسالة «مكالمة — كتبتها الإدارة» في قصتها ثم تلخيص فوري.
 * @param {{intake:{id:number, code:string, phone?:string|null, unconfirmed?:boolean, callIntro?:string|null}, script?:string|null}} opts
 *   script: الرد المقترح أو الأسئلة («قل لها:») حين يكون الاتصال هو الطريق إليها
 * @returns {Promise<{message_id:number, story:object, proposal:object}|null>}
 */
export function openCallNote({ intake, script = null } = {}) {
  const clientRef = newClientRef();
  const taId = uid('call-text');
  const ta = h('textarea.input.pa-call-input', { id: taId, rows: 6, maxlength: 5000, dir: 'auto', required: true });
  const wrap = field('ما قالته المستفيدة في المكالمة', ta, { required: true, hint: 'اكتب كلامها كما قالته قدر الإمكان، بلا تحليل. لا تكتب أرقامًا لا تحتاجها.' });
  const confirmCb = intake.unconfirmed ? h('input', { type: 'checkbox' }) : null;
  let result = null;
  return new Promise((resolve) => {
    modal({
      sheet: true,
      className: 'pa-call-sheet',
      title: 'تسجيل المكالمة',
      subtitle: intake.code,
      body: frag(
        h('div.pa-call-script', icon('phone', { size: 18 }), h('p', intake.callIntro || callIntroText(intake.code))),
        script && h('div.pa-call-say', h('strong', 'قل لها:'), h('p.pa-call-say-text', { dir: 'auto' }, script)),
        intake.phone && h('p.pa-call-phone', h('span', 'رقمها: '), h('a', { href: `tel:${intake.phone}` }, ltr(intake.phone))),
        wrap,
        confirmCb &&
          h(
            'div.pa-call-identity',
            h('p.field-hint', icon('shield', { size: 14 }), ' ', 'اسألها: الرقم ده عليه واتساب؟ لو أكدت أنها صاحبته علّم تأكيد الهوية.'),
            h('label.check', confirmCb, h('span', 'تأكدت أثناء المكالمة أنها صاحبة الرقم المسجل (تأكيد الهوية)')),
          ),
      ),
      beforeClose: async () => {
        if (!ta.value.trim()) return true;
        return confirmDialog({
          title: 'تجاهل ما كتبته؟',
          message: 'لم تُحفظ المكالمة بعد. إغلاق النافذة يمسح ما كتبته.',
          confirmLabel: 'تجاهل وإغلاق',
          cancelLabel: 'رجوع للكتابة',
        });
      },
      actions: [
        { label: 'إلغاء', variant: 'ghost', onClick: () => (result = null) },
        {
          label: 'حفظ وتلخيص',
          variant: 'primary',
          icon: 'check',
          onClick: async () => {
            const text = ta.value.trim();
            if (!text) {
              wrap.setError('اكتب ما قالته المستفيدة في المكالمة');
              ta.focus();
              return false;
            }
            wrap.setError('');
            result = await api.post(`/admin/intakes/${encodeURIComponent(intake.id)}/call-note`, {
              text,
              client_ref: clientRef,
              confirm_identity: confirmCb ? confirmCb.checked : undefined,
            });
            toast('حُفظت المكالمة — جارٍ تلخيص الطلب', 'success');
            return undefined;
          },
        },
      ],
      onClose: () => resolve(result),
    });
    requestAnimationFrame(() => ta.focus({ preventScroll: true }));
  });
}

/**
 * «لم ترد»: نتيجة محاولة اتصال لم تنجح (لم ترد · مشغول · رقم خطأ · ردّ شخص آخر).
 * @returns {Promise<{count:number, days:number, can_close_unreachable:boolean, items:any[]}|null>}
 */
export function openCallAttempt({ intakeId, code } = {}) {
  const clientRef = newClientRef();
  let attempts = null;
  return new Promise((resolve) => {
    let handle = null;
    let busy = false;
    const outcomes = ['no_answer', 'busy', 'wrong_number', 'someone_else'];
    const btns = outcomes.map((o) =>
      button(label('call_outcome', o), {
        variant: 'secondary',
        block: true,
        className: 'pa-call-outcome',
        icon: o === 'no_answer' ? 'phone-off' : o === 'busy' ? 'clock' : o === 'wrong_number' ? 'x' : 'user',
        onClick: async (e) => {
          if (busy) return;
          busy = true;
          btns.forEach((b) => (b.disabled = true));
          e.currentTarget.classList.add('is-loading');
          try {
            const res = await api.post(`/admin/intakes/${encodeURIComponent(intakeId)}/call-attempt`, { outcome: o, client_ref: clientRef });
            attempts = res.attempts || null;
            toast(`سُجّلت محاولة الاتصال: ${label('call_outcome', o)}${attempts ? ` — ${attemptsCountText(attempts.count)}` : ''}`, 'success');
            handle.close('action');
          } catch (err) {
            toast(err.message, 'danger');
            busy = false;
            btns.forEach((b) => (b.disabled = false));
            e.currentTarget.classList.remove('is-loading');
          }
        },
      }),
    );
    handle = modal({
      sheet: true,
      className: 'pa-call-sheet',
      title: 'لم ترد — ماذا حدث؟',
      subtitle: code || '',
      body: frag(h('p.modal-intro', 'اختر نتيجة الاتصال. تُسجَّل المحاولة فقط، ولا يصلها شيء.'), h('div.pa-call-outcomes', btns)),
      onClose: () => resolve(attempts),
    });
  });
}

/** «محاولات الاتصال: 3» بصيغة سليمة */
export function attemptsCountText(n) {
  return `محاولات الاتصال: ${Number(n) || 0}`;
}

/** قائمة المحاولات: «لم ترد — منى السيد منذ ساعتين» */
export function attemptsList(items = []) {
  if (!items.length) return null;
  return h(
    'ul.pa-call-attempts',
    { 'aria-label': 'محاولات الاتصال' },
    items.map((a) =>
      h(
        'li',
        icon('phone-off', { size: 14 }),
        h('span', `${a.outcome_label || label('call_outcome', a.outcome)} — ${a.user_name || 'الإدارة'} `),
        h('time.small.muted', { datetime: a.created_at, title: dateTime(a.created_at) }, relative(a.created_at)),
      ),
    ),
  );
}

/** «إغلاق: تعذّر الوصول إليها» (بعد 3 محاولات في يومين مختلفين؛ يتحقق الخادم من القاعدة) */
export async function closeUnreachable({ intakeId, attempts }) {
  const n = attempts ? Number(attempts.count) || 0 : 0;
  const ok = await confirmDanger({
    title: 'إغلاق: تعذّر الوصول إليها',
    message: `حاولتم الاتصال بها ${count(n, ['مرة واحدة', 'مرتين', 'مرات', 'مرة'])} دون رد. يُغلق الطلب ولا يُؤرشف: رابط متابعتها يبقى، ولو كتبت لنا بعد ذلك يُفتح طلبها من جديد.`,
    confirmLabel: 'إغلاق الطلب',
  });
  if (!ok) return null;
  const res = await api.post(`/admin/intakes/${encodeURIComponent(intakeId)}/close-unreachable`, {});
  toast('أُغلق الطلب: تعذّر الوصول إليها', 'success');
  return res;
}

/** بطاقة «طلبت مكالمة» داخل الطلب (أو جزء منها): التعليمات + الأزرار + المحاولات */
export function callbackAlert({ phone, when }) {
  return alertBox(
    h('span', 'اتصل على ', phone ? h('a', { href: `tel:${phone}` }, ltr(phone)) : 'رقمها', when ? ` (${when})` : '', ' واسمع مشكلتها، ثم سجّل ما قالته هنا ليُلخَّص الطلب.'),
    'info',
    { icon: 'phone' },
  );
}
