// «إرسال مستند للعميل» (الإصدار 9 — وحدة messaging): يرسل مستندًا من ملف الاستشارة أو الملف المستمر إلى العميل
// عبر واتساب (خلال نافذة الـ 24 ساعة فقط) أو يتيحه في بوابة العملاء، ويسجَّل رسالةً صادرة مرفقًا بها المستند.
//
// الاستخدام في جدول مستندات الملف:
//   import { sendDocumentButton } from '../../components/send-document.js';
//   sendDocumentButton(doc, { onSent: () => refresh('أُرسل المستند للعميل') })

import { api } from '../../lib/api.js';
import { button, formDialog, toast } from '../../lib/ui.js';
// v11 segment-staff (ST-3، r2 P13): نوع الخدمة والنبرة و«سيُرسل من» أعلى نافذة الإرسال
import { sendHeader } from './segment-ui.js';

const CHANNELS = [
  { value: 'auto', label: 'تلقائي: واتساب إن أمكن، وإلا صفحة المتابعة' },
  { value: 'whatsapp', label: 'واتساب (خلال 24 ساعة من آخر رسالة للمستفيد/ة فقط)' },
  { value: 'website', label: 'صفحة المتابعة فقط' },
];

/**
 * يفتح نافذة الإرسال ويعيد نتيجة الخادم أو null عند الإلغاء.
 * @param {{id:number, title?:string, filename?:string}} doc
 * @param {{sendInfo?:{segment?:string|null, tone?:string, sendLine?:{key,label}|null, company?:boolean}}} [opts]
 */
export async function openSendDocumentDialog(doc, { sendInfo = null } = {}) {
  const name = doc.title || doc.filename || 'المستند';
  const result = await formDialog({
    title: 'إرسال مستند للمستفيد/ة',
    intro: `سيصل المستند «${name}» إلى المستفيد/ة ويظهر مرفقًا في المحادثة وفي صفحة المتابعة الخاصة به. لا يُرسل للمحامين شيء.`,
    submitLabel: 'إرسال المستند',
    fields: [
      {
        name: 'channel',
        label: 'طريقة الإرسال',
        type: 'select',
        required: true,
        placeholder: false,
        options: CHANNELS,
        hint: 'لا يسمح واتساب بإرسال المستندات خارج نافذة الـ 24 ساعة من آخر رسالة أرسلها المستفيد/ة؛ في الوضع التلقائي يُتاح المستند في البوابة عندئذٍ.',
      },
      {
        name: 'caption',
        label: 'نص مرافق (اختياري)',
        type: 'textarea',
        rows: 3,
        maxLength: 1000,
        placeholder: 'مثال: مرفق لكم نموذج صحيفة الدعوى، نرجو مراجعته والتوقيع عليه.',
      },
    ],
    values: { channel: 'auto' },
    setup: (f) => {
      if (sendInfo) f.el.prepend(sendHeader(sendInfo));
    },
    onSubmit: (v) => api.post(`/admin/documents/${encodeURIComponent(doc.id)}/send-to-client`, { channel: v.channel || 'auto', caption: v.caption || null }),
  });
  if (!result) return null;
  const via = result.channel === 'whatsapp' ? 'عبر واتساب' : 'في صفحة المتابعة';
  toast(`أُرسل المستند للمستفيد/ة ${via}`, 'success');
  if (result.note) toast(result.note, 'warning', 9000);
  return result;
}

/**
 * زر صغير «إرسال للعميل» لصف مستند.
 * @param {{id:number, title?:string, filename?:string}} doc
 * @param {{onSent?:(result:object)=>void, label?:string, size?:string, variant?:string, sendInfo?:object}} [opts]
 */
export function sendDocumentButton(doc, { onSent, label = 'إرسال للمستفيد/ة', size = 'sm', variant = 'ghost', sendInfo = null } = {}) {
  const btn = button(label, {
    size,
    variant,
    icon: 'send',
    title: `إرسال «${doc.title || doc.filename || 'المستند'}» للمستفيد/ة`,
    onClick: async () => {
      const r = await openSendDocumentDialog(doc, { sendInfo });
      if (r && onSent) onSent(r);
    },
  });
  btn.setAttribute('aria-haspopup', 'dialog');
  return btn;
}

