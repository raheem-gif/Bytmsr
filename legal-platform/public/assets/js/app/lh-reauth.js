// v9.1 l-home (L-21) — تأكيد كلمة المرور الحالية عند تغيير موبايل المحامي.
// الموبايل يستقبل تنبيهات واتساب ورابط إعادة تعيين كلمة المرور، فالخادم يطلب كلمة المرور الحالية لتغييره من جلسة
// مضى على دخولها أكثر من 10 دقائق (خطأ حقل current_password). هنا: ورقة صغيرة تطلبها ثم تعيد الطلب نفسه مرة أخرى.
//
// الواجهة: withPasswordConfirm(run) — run(extra) دالة الطلب (extra = {} أولًا، ثم { current_password })،
//          تعيد نتيجة run، أو ترمي الخطأ الأصلي، أو ترمي خطأً code = 'reauth_cancelled' إن أُغلقت الورقة.
import { h } from '../lib/h.js';
import { modal } from '../lib/ui.js';

export const REAUTH_CANCELLED = 'reauth_cancelled';

/** هل يطلب الخادم كلمة المرور الحالية؟ */
export function needsPassword(err) {
  return !!(err && err.status === 400 && err.details && err.details.fields && err.details.fields.current_password);
}

export async function withPasswordConfirm(run) {
  try {
    return await run({});
  } catch (err) {
    if (!needsPassword(err)) throw err;
    return askAndRetry(run, err.details.fields.current_password);
  }
}

function askAndRetry(run, message) {
  return new Promise((resolve, reject) => {
    let done = false;
    const input = h('input.input#lh-reauth-pw', { type: 'password', autocomplete: 'current-password', dir: 'ltr', required: true });
    const err = h('p.field-error', { role: 'alert', hidden: true });
    const showError = (text) => {
      err.textContent = text;
      err.hidden = false;
      input.focus();
    };
    modal({
      title: 'تأكيد كلمة المرور',
      sheet: true,
      className: 'lh-reauth-sheet',
      body: h(
        'div.stack',
        h('p.confirm-message', message || 'أدخل كلمة المرور الحالية لتغيير رقم الموبايل.'),
        h('div.field', h('label.field-label', { for: 'lh-reauth-pw' }, 'كلمة المرور الحالية'), input, err),
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'تأكيد',
          variant: 'primary',
          onClick: async () => {
            const pw = input.value;
            if (!pw) {
              showError('أدخل كلمة المرور الحالية للتأكيد');
              return false;
            }
            try {
              const result = await run({ current_password: pw });
              done = true;
              resolve(result);
              return true;
            } catch (e) {
              if (needsPassword(e)) {
                showError(e.details.fields.current_password);
                return false;
              }
              done = true;
              reject(e);
              return true;
            }
          },
        },
      ],
      onClose: () => {
        if (!done) {
          done = true;
          reject(Object.assign(new Error('لم يُغيَّر رقم الموبايل.'), { code: REAUTH_CANCELLED }));
        }
      },
    });
    requestAnimationFrame(() => input.focus());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.closest('.modal')?.querySelector('.modal-footer .btn-primary')?.click();
      }
    });
  });
}
