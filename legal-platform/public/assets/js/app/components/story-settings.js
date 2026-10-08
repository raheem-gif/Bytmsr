// v9.2 (admin-ai) — بطاقة «القصص الواردة على واتساب» في الإعدادات (‎#/settings?section=stories‎):
// متى تُعد القصة مكتملة فيلخّصها الذكاء الاصطناعي، والرسائل الآلية الثابتة (متوقفة افتراضيًا)، ورقم الاتصال بالمستفيدات.

import { h } from '../../lib/h.js';
import { api } from '../../lib/api.js';
import { toLatinDigits, normalizeEgPhone } from '../../lib/fmt.js';
import { card, form, toast, icon } from '../../lib/ui.js';

export const STORY_SETTING_KEYS = ['story_quiet_minutes', 'story_welcome_enabled', 'story_ack_enabled', 'callback_from_number', 'callback_eta_days'];

function fieldError(name, msg) {
  const e = new Error(msg);
  e.details = { fields: { [name]: msg } };
  return e;
}

/** @param {object} settings إعدادات GET /api/admin/settings */
export function storySettingsCard(settings = {}) {
  const f = form(
    [
      {
        name: 'story_quiet_minutes',
        label: 'مدة السكوت قبل التلخيص (بالدقائق)',
        type: 'number',
        integer: true,
        required: true,
        min: 2,
        max: 120,
        hint: 'بعد هذه المدة بلا رسائل جديدة منها، أو عندما تكتب «خلاص»، تُعد القصة مكتملة ويلخّصها الذكاء الاصطناعي.',
      },
      {
        name: 'story_welcome_enabled',
        type: 'checkbox',
        full: true,
        text: 'إرسال ترحيب بقائمة المواضيع لأول رسالة على واتساب',
        hint: 'رسالة آلية ثابتة (ليست من الذكاء الاصطناعي) فيها 8 مواضيع، ويمكنها تجاهلها والكتابة مباشرة.',
      },
      {
        name: 'story_ack_enabled',
        type: 'checkbox',
        full: true,
        text: 'إرسال «وصلتنا حكايتك» ورقم الطلب عندما تكتمل القصة',
        hint: 'قبل التفعيل: عدّلوا جملة "كل رد يصلك يراجعه شخص مختص" في سياسة الخصوصية لتستثني الرسائل الآلية الثابتة (قرار مفتوح 11).',
      },
      {
        name: 'callback_from_number',
        label: 'الرقم الذي نتصل منه بالمستفيدات',
        ltr: true,
        maxLength: 30,
        placeholder: '01211114662',
        hint: 'يظهر لها بعد طلب المكالمة حتى ترد عليه. اتركه فارغًا لاستخدام رقم المؤسسة.',
      },
      { name: 'callback_eta_days', label: 'نتصل خلال (أيام عمل)', type: 'number', integer: true, required: true, min: 1, max: 5 },
    ],
    {
      values: {
        story_quiet_minutes: settings.story_quiet_minutes ?? 10,
        story_welcome_enabled: Boolean(settings.story_welcome_enabled),
        story_ack_enabled: Boolean(settings.story_ack_enabled),
        callback_from_number: settings.callback_from_number || '',
        callback_eta_days: settings.callback_eta_days ?? 1,
      },
      submitLabel: 'حفظ',
      submitIcon: 'check',
      onSubmit: async (v, fapi) => {
        const raw = toLatinDigits(v.callback_from_number || '').trim();
        if (raw && !normalizeEgPhone(raw)) throw fieldError('callback_from_number', 'اكتب رقمًا مصريًا صحيحًا أو اتركه فارغًا');
        const saved = await api.patch('/admin/settings', {
          story_quiet_minutes: v.story_quiet_minutes,
          story_welcome_enabled: Boolean(v.story_welcome_enabled),
          story_ack_enabled: Boolean(v.story_ack_enabled),
          callback_from_number: raw,
          callback_eta_days: v.callback_eta_days,
        });
        if (saved && typeof saved === 'object') {
          const next = {};
          for (const k of STORY_SETTING_KEYS) if (k in saved) next[k] = saved[k];
          fapi.setValues(next);
        }
        toast('تم الحفظ', 'success');
      },
    },
  );
  f.el.classList.add('pa-stset-form');

  const el = card({
    title: 'القصص الواردة على واتساب',
    subtitle: 'متى يلخّص الذكاء الاصطناعي القصة، والرسائل الآلية التي تصل المستفيدة.',
    icon: 'whatsapp',
    className: 'pa-stset',
    body: h('div', h('p.pa-note.small', icon('info', { size: 15 }), h('span', 'الرسائل الآلية هنا نصوص ثابتة لا يكتبها الذكاء الاصطناعي، ولا تصل إلا لمن بدأت المحادثة على واتساب.')), f.el),
  });
  el.id = 'stories';

  // ‎#/settings?section=stories‎ (من تنبيه الجاهزية): التركيز يذهب إلى مفتاح «وصلتنا حكايتك» نفسه لا إلى عنوان البطاقة
  if (/[?&]section=stories(?:&|$)/.test(window.location.hash || '')) {
    const toggle = f.control('story_ack_enabled').input;
    let moved = false;
    el.addEventListener('focusin', (e) => {
      if (moved || e.target === toggle || !/^H[23]$/.test(e.target.tagName)) return;
      moved = true;
      toggle.focus({ preventScroll: true });
      toggle.closest('.field')?.scrollIntoView({ block: 'center' });
    });
  }
  return el;
}
