// الإصدار 9.1 — مسار l-home (L-12): نصوص إشعارات المحامي التي تقول ماذا تغيّر بالضبط وتفتح المكان الصحيح.
// تُبنى على الخادم بصيغ عدد سليمة (arabicCount) ومواعيد بتوقيت القاهرة: «الجمعة 9 أكتوبر، 6:00 م».
import { cairoParts, arabicCount, truncate } from '../util.js';

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// صيغ «أتاح … جديدًا» (مفعول به منصوب)
export const NEW_DOCUMENTS = ['مستندًا جديدًا', 'مستندين جديدين', 'مستندات جديدة', 'مستندًا جديدًا'];
export const NEW_ISSUES = ['مسألة جديدة', 'مسألتين جديدتين', 'مسائل جديدة', 'مسألة جديدة'];
export const NEW_REPLIES = ['ردًا جديدًا', 'ردين جديدين', 'ردود جديدة', 'ردًا جديدًا'];

/** «الجمعة 9 أكتوبر، 6:00 م» */
export function deadlineText(iso) {
  if (!iso) return '';
  const p = cairoParts(iso);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${AR_DAYS[dow]} ${p.day} ${AR_MONTHS[p.month - 1]}، ${h12}:${String(p.minute).padStart(2, '0')} ${p.hour < 12 ? 'ص' : 'م'}`;
}

/** نص إشعار الإسناد الجديد: الموعد أولًا ثم المطلوب مختصرًا */
export function newAssignmentBody(dueAt, brief) {
  const parts = [];
  if (dueAt) parts.push(`سلّم رأيك قبل ${deadlineText(dueAt)}.`);
  if (brief) parts.push(truncate(String(brief), 140));
  return parts.join(' ') || null;
}

/**
 * إشعار تعديل الإتاحة من الفرق بين ما كان متاحًا وما أصبح متاحًا.
 * @param {object} before grantsPublic قبل التعديل
 * @param {object} after grantsPublic بعده
 * @param {string} code كود الملف
 * @param {(kind:'document'|'issue', ids:number[])=>string[]} titlesOf عناوين العناصر المضافة (للمتن)
 * @returns {{title:string, body:string|null}|null} null إن لم يتغير شيء
 */
export function grantsNotification(before, after, code, titlesOf = () => []) {
  const b = before || {};
  const a = after || {};
  const added = (k) => (a[k] || []).filter((x) => !(b[k] || []).includes(x));
  const removed = (k) => (b[k] || []).filter((x) => !(a[k] || []).includes(x));
  const docs = added('document_ids');
  const issues = added('issue_ids');
  const opinions = added('opinion_assignment_ids');
  const replies = added('info_request_ids');
  const factsAdded = !!a.facts && !b.facts;
  const groups = [docs.length, issues.length, opinions.length, replies.length, factsAdded ? 1 : 0].filter(Boolean).length;
  const anyRemoved =
    removed('document_ids').length || removed('issue_ids').length || removed('opinion_assignment_ids').length || removed('info_request_ids').length || (!!b.facts && !a.facts) || (!!b.client_name && !a.client_name);
  if (!groups) {
    if (anyRemoved || !!a.client_name !== !!b.client_name) return { title: `تغيّر ما يمكنك الاطلاع عليه في ${code}`, body: null };
    return null;
  }
  const titles = [...titlesOf('document', docs), ...titlesOf('issue', issues)].filter(Boolean).slice(0, 3);
  const body = titles.length ? titles.map((t) => truncate(t, 60)).join('، ') : null;
  if (groups > 1) return { title: `أتاحت لك الإدارة إضافات جديدة في ${code}`, body };
  if (docs.length) return { title: `أتاحت لك الإدارة ${arabicCount(docs.length, NEW_DOCUMENTS)} في ${code}`, body };
  if (issues.length) return { title: `أتاحت لك الإدارة ${arabicCount(issues.length, NEW_ISSUES)} في ${code}`, body };
  if (opinions.length) return { title: `أتاحت لك الإدارة ${opinions.length > 1 ? 'آراء زملاء' : 'رأي زميل'} في ${code}`, body: null };
  if (replies.length) return { title: `أتاحت لك الإدارة ${arabicCount(replies.length, NEW_REPLIES)} في ${code}`, body: null };
  return { title: `أتاحت لك الإدارة ملخص الوقائع في ${code}`, body: null };
}
