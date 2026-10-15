// v12 tags (TG-4، T12-19): رمز الرسالة الصادرة للعرض فقط. صندوق الصادر والمحاكي وبطاقات الأتمتة يعرضون رمز W (واتساب) أو
// E (البريد) للنص الذي أنتج الرسالة، فيقول المالك «غيّر W-26». هذه «استعمالات» لرموز معرَّفة في constants.js وemail.js
// وlawyer-alerts.js، لا تعريفات جديدة. الرمز لا يُكتب في الرسالة ولا يُرسل أبدًا (L12-88)؛ يُضاف إلى استجابة الواجهة وحدها.
import { TEXT_TAGS, CLIENT_TEXTS, CLIENT_TEXTS_PAID, CLIENT_TEXTS_CHARITY_EXTRA, LINES_MENU_TEXTS } from '../constants.js';
import { EMAIL_TAGS } from '../services/email.js';
import { ALERT_TAGS } from '../services/lawyer-alerts.js';

/** قاعدة الرسالة (messages.automation_rule) ← مفاتيح نصوصها في TEXT_TAGS بالترتيب (الأول افتراضي) */
const RULE_KEYS = Object.freeze({
  story_welcome: ['story_welcome'],
  story_topic_nudge: ['story_topic_nudge'],
  story_ack: ['story_ack'],
  segment_choice: ['segment_choice'],
  segment_chosen: ['segment_chosen_paid', 'segment_chosen_charity'],
  lines_menu: ['lines_menu'],
  lines_list: ['lines_list_consultation', 'lines_list_litigation', 'lines_list_company'],
  lines_next: ['lines_next', 'lines_counsel'],
  portal_otp: ['otp'],
  identity_confirm: ['confirm_reply'],
  satisfaction_survey: ['survey_question', 'rule:satisfaction_survey'],
  hearing_reminder: ['rule:hearing_reminder'],
  invoice_reminder: ['rule:invoice_reminder'],
  document_reminder: ['rule:document_reminder'],
});
const SOURCES = [CLIENT_TEXTS, CLIENT_TEXTS_PAID, CLIENT_TEXTS_CHARITY_EXTRA, LINES_MENU_TEXTS];
/** بداية النص الثابتة قبل أول متغير (للتمييز بين نصوص القاعدة الواحدة) */
const head = (t) => (typeof t === 'string' ? t.split('{')[0].trim().slice(0, 24) : '');

/**
 * رمز W لرسالة واتساب صادرة: rule = automation_rule، body = نص الرسالة، wa = meta.wa (شكلها التفاعلي)، meta = بيانات الرسالة
 * (تنبيه المحامي: meta.lawyer_alert.type). null إن لم يُعرف.
 * رسائل الفريق المكتوبة باليد بلا قاعدة لا رمز لها.
 */
export function messageTag(rule, { body = '', wa = null, meta = null } = {}) {
  if (rule === 'lawyer_alert') return ALERT_TAGS[meta?.lawyer_alert?.type] || null;
  const keys = RULE_KEYS[rule];
  if (!keys) return null;
  if (rule === 'satisfaction_survey') return TEXT_TAGS[wa && wa.type === 'buttons' ? 'survey_question' : 'rule:satisfaction_survey'] || null;
  if (keys.length > 1) {
    const b = String(body || '');
    for (const k of keys) for (const src of SOURCES) if (head(src[k]) && b.startsWith(head(src[k]))) return TEXT_TAGS[k] || null;
  }
  return TEXT_TAGS[keys[0]] || null;
}

/** رمز E لرسالة بريد صادرة من غرضها (purpose = اسم القالب في email.render) */
export const emailTag = (purpose) => EMAIL_TAGS[purpose] || null;

/** رمز W لقاعدة أتمتة (بطاقات صفحة الأتمتة): نص القاعدة الافتراضي 'rule:<key>' */
export const ruleTag = (key) => TEXT_TAGS[`rule:${key}`] || null;

/** رمز W لتنبيه محامٍ على واتساب من نوعه */
export const alertTag = (type) => ALERT_TAGS[type] || null;
