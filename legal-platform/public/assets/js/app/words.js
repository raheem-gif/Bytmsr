// v9.1 l-home — كلمات واجهة المحامي (خريطة مسميات خاصة بالمحامين؛ مسميات الإدارة LABELS تبقى كما هي).
// عربية مهنية موجزة، «المستفيد/ة» دائمًا (لا تسمية تجارية لصاحب الطلب)، بلا ضمائر تفترض جنس المستفيد/ة، وصيغ عدد سليمة.
//
// الواجهة البرمجية (ثابتة — تستوردها صفحات المحامي الأخرى):
//   BENEFICIARY, BRAND, NAV                       ثوابت نصية
//   UNITS                                          صيغ العدد [مفرد، مثنى، جمع 3–10، تمييز 11–99] (مرفوعة)
//   count(n, unit)                                 عدد مع معدوده: مفتاح من UNITS أو من وحدات fmt.count أو مصفوفة صيغ
//   assignmentStatus(s), ASSIGNMENT_STATUS         كلمة حالة الإسناد للمحامي («جديد»، «قيد العمل»…)
//   requestStatus(s, note?), REQUEST_STATUS        حالة طلب المعلومات/المستند كما يراها المحامي
//   counselStatus(s), COUNSEL_STATUS               حالة طلب مساعدة محامٍ
//   taskStatus(s), matterStatus(s)                 حالات المهام والملفات المستمرة
//   dayWord(iso)                                   «اليوم» | «غدًا» | «أمس» | null
//   dayDate(iso)                                   «الأربعاء 7 أكتوبر»
//   when(iso)                                      «اليوم 6:00 م» / «غدًا 9:30 ص» / «الجمعة 6:00 م» / «الجمعة 9 أكتوبر 6:00 م»
//   deadline(iso)                                  «الجمعة 9 أكتوبر، 6:00 م» (موعد التسليم كاملًا)
//   monthName(isoOrYm)                             «أكتوبر»
//   todayHeading(n)                                «مطلوب منك أمر واحد» … أو «لا شيء مطلوب منك الآن»
//   actionCopy(action)                             نص صف «اليوم» من عنصر /api/lawyer/today:
//                                                   { title, sub:[...أجزاء], tone:'red'|'amber'|'teal', button?, chevron? }

import { count as fmtCount, weekday, shortDate, time, isoToCairoDate, num } from '../lib/fmt.js';

export const BENEFICIARY = 'المستفيد/ة';
export const BRAND = 'منصة الدعم القانوني';

/** أسماء أقسام بوابة المحامي (القائمة، الشريط السفلي، عناوين الصفحات). */
export const NAV = Object.freeze({
  today: 'اليوم',
  assignments: 'إسناداتي',
  matters: 'الملفات المستمرة',
  calendar: 'تقويمي',
  statement: 'مستحقاتي',
  notifications: 'الإشعارات',
  account: 'حسابي',
  more: 'المزيد',
  logout: 'تسجيل الخروج',
  back: 'رجوع',
});

/** صيغ العدد بالرفع (مبتدأ/فاعل/عنوان): [مفرد، مثنى، جمع 3–10، تمييز 11–99]. */
export const UNITS = Object.freeze({
  thing: ['أمر واحد', 'أمران', 'أمور', 'أمرًا'],
  note: ['ملاحظة واحدة', 'ملاحظتان', 'ملاحظات', 'ملاحظة'],
  action: ['إجراء واحد', 'إجراءان', 'إجراءات', 'إجراءً'],
  hearing: ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'],
  assignment: ['إسناد واحد', 'إسنادان', 'إسنادات', 'إسنادًا'],
  task: ['مهمة واحدة', 'مهمتان', 'مهام', 'مهمة'],
  document: ['مستند واحد', 'مستندان', 'مستندات', 'مستندًا'],
  issue: ['مسألة واحدة', 'مسألتان', 'مسائل', 'مسألة'],
  request: ['طلب واحد', 'طلبان', 'طلبات', 'طلبًا'],
  reply: ['رد واحد', 'ردان', 'ردود', 'ردًا'],
  approved_consultation: ['استشارة معتمدة', 'استشارتان معتمدتان', 'استشارات معتمدة', 'استشارة معتمدة'],
  contribution: ['مساهمة واحدة', 'مساهمتان', 'مساهمات', 'مساهمة'],
  word: ['كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة'],
  day: ['يوم واحد', 'يومان', 'أيام', 'يومًا'],
});

/**
 * عدد مع معدوده بصيغة سليمة. unit: مفتاح من UNITS (بالرفع)، أو مفتاح من وحدات fmt.count (بالنصب/الجر مثل 'day')،
 * أو مصفوفة صيغ. count(1,'thing') → «أمر واحد»، count(2,'thing') → «أمران»، count(5,'thing') → «5 أمور»،
 * count(12,'thing') → «12 أمرًا».
 */
export function count(n, unit) {
  if (Array.isArray(unit)) return fmtCount(n, unit);
  return fmtCount(n, UNITS[unit] || unit);
}

/** حالة الإسناد كما يقرؤها المحامي (بدل «مُسند — لم يُفتح بعد» و«مقدَّم للإدارة» في مسميات الإدارة). */
export const ASSIGNMENT_STATUS = Object.freeze({
  assigned: 'جديد',
  in_progress: 'قيد العمل',
  submitted: 'عند الإدارة للمراجعة',
  returned: 'مطلوب تعديله',
  approved: 'اعتمدته الإدارة',
  withdrawn: 'سحبته الإدارة',
});
export function assignmentStatus(s) {
  return ASSIGNMENT_STATUS[s] || (s ? String(s) : '—');
}

/** حالة طلب المعلومات/المستند كما يراها المحامي صاحب الطلب. */
export const REQUEST_STATUS = Object.freeze({
  pending_admin: 'عند الإدارة',
  sent_to_client: 'طُلب من المستفيد/ة',
  client_replied: 'وصل الرد — تراجعه الإدارة',
  shared: 'وصلك الرد',
  rejected: 'لم توافق الإدارة',
  cancelled: 'ألغيته',
});
/** requestStatus('rejected', 'السبب') → «لم توافق الإدارة: السبب» */
export function requestStatus(s, note) {
  const base = REQUEST_STATUS[s] || (s ? String(s) : '—');
  return s === 'rejected' && note ? `${base}: ${note}` : base;
}

export const COUNSEL_STATUS = Object.freeze({
  pending_admin: 'عند الإدارة',
  assigned: 'أُسند لزميل',
  completed: 'قدّم الزميل رأيه',
  rejected: 'لم توافق الإدارة',
  cancelled: 'ألغيته',
});
export function counselStatus(s) {
  return COUNSEL_STATUS[s] || (s ? String(s) : '—');
}

const TASK_STATUS = { open: 'مفتوحة', done: 'تمّت', cancelled: 'أُلغيت' };
export function taskStatus(s) {
  return TASK_STATUS[s] || (s ? String(s) : '—');
}
const MATTER_STATUS = { open: 'جارٍ', on_hold: 'متوقف مؤقتًا', closed: 'مغلق' };
export function matterStatus(s) {
  return MATTER_STATUS[s] || (s ? String(s) : '—');
}

// ───────────── التواريخ ─────────────

const DAY_MS = 86400000;
function toDate(iso) {
  if (iso == null || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** فرق الأيام التقويمية (بتوقيت القاهرة) بين اليوم والتاريخ المعطى: 0 اليوم، 1 غدًا، -1 أمس. */
function dayDiff(d, now = Date.now()) {
  const a = isoToCairoDate(d);
  const b = isoToCairoDate(new Date(now));
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);
}

/** «اليوم» | «غدًا» | «أمس» أو null. */
export function dayWord(iso, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return null;
  const diff = dayDiff(d, now);
  return diff === 0 ? 'اليوم' : diff === 1 ? 'غدًا' : diff === -1 ? 'أمس' : null;
}

/** «الأربعاء 7 أكتوبر» */
export function dayDate(iso) {
  const d = toDate(iso);
  return d ? `${weekday(d)} ${shortDate(d)}` : '—';
}

/** موعد مختصر: «اليوم 6:00 م»، «الجمعة 6:00 م» (خلال الأسبوع)، وإلا «الجمعة 9 أكتوبر 6:00 م». */
export function when(iso, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return '—';
  const w = dayWord(d, now);
  if (w) return `${w} ${time(d)}`;
  const diff = dayDiff(d, now);
  if (diff > 1 && diff < 7) return `${weekday(d)} ${time(d)}`;
  return `${dayDate(d)} ${time(d)}`;
}

/** موعد التسليم كاملًا: «الجمعة 9 أكتوبر، 6:00 م» */
export function deadline(iso) {
  const d = toDate(iso);
  return d ? `${dayDate(d)}، ${time(d)}` : '—';
}

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** اسم الشهر من 'YYYY-MM' أو تاريخ ISO: «أكتوبر» */
export function monthName(v) {
  const m = /^(\d{4})-(\d{2})/.exec(String(v || ''));
  if (m && typeof v === 'string' && v.length <= 7) return AR_MONTHS[+m[2] - 1] || '—';
  const d = toDate(v);
  if (!d) return '—';
  return AR_MONTHS[Number(isoToCairoDate(d).slice(5, 7)) - 1];
}

// ───────────── «اليوم» ─────────────

/** عنوان صفحة «اليوم» حسب عدد الأمور المطلوبة. */
export function todayHeading(n) {
  const k = Math.max(0, Math.round(Number(n) || 0));
  return k ? `مطلوب منك ${count(k, 'thing')}` : 'لا شيء مطلوب منك الآن';
}

/** ترتيب أنواع صفوف «مطلوب الآن» (الأعلى أولًا). */
export const ACTION_ORDER = Object.freeze([
  'hearing_outcome',
  'assignment_overdue',
  'assignment_returned',
  'task_overdue',
  'hearing_today',
  'assignment_due_soon',
  'assignment_new',
  'info_shared',
  'task_due',
]);

/**
 * نص صف «مطلوب الآن» لعنصر من /api/lawyer/today.
 * @returns {{title:string, sub:Array<string|{code:string}>, tone:'red'|'amber'|'teal', button?:{label:string, kind:'primary'|'secondary'}, chevron?:boolean}}
 * عناصر sub: النص العادي (يُختصر بنقاط عند الضيق)، و{code} داخل <bdi dir=ltr> لا يُقطع أبدًا، و{keep} نص لا يُقطع (موعد/عدد).
 */
export function actionCopy(a, now = Date.now()) {
  const code = (c) => (c ? { code: c } : null);
  const keep = (t) => (t ? { keep: t } : null);
  const clean = (arr) => arr.filter((x) => x != null && x !== '');
  switch (a.kind) {
    case 'hearing_outcome': {
      const today = dayWord(a.at, now) === 'اليوم';
      return {
        title: today ? 'سجّل نتيجة جلسة اليوم' : `سجّل نتيجة جلسة ${dayDate(a.at)}`,
        sub: clean([a.title, keep(time(a.at)), code(a.matter_code)]),
        tone: 'red',
        button: { label: 'سجّل', kind: 'primary' },
      };
    }
    case 'assignment_overdue':
      return {
        title: `رأي متأخر: ${a.case_title || a.case_code || ''}`,
        sub: clean([code(a.case_code), keep(`كان مطلوبًا ${when(a.due_at || a.at, now)}`)]),
        tone: 'red',
        button: { label: 'افتح', kind: 'secondary' },
      };
    case 'assignment_returned':
      return {
        title: 'أعادت الإدارة رأيك بملاحظات',
        sub: clean([code(a.case_code), Number(a.notes_count) > 0 ? keep(count(a.notes_count, 'note')) : a.case_title]),
        tone: 'red',
        button: { label: 'عدّل', kind: 'primary' },
      };
    case 'task_overdue':
    case 'task_due':
      return {
        title: `مهمة: ${a.title || ''}`,
        sub: clean([code(a.matter_code), keep(dayDate(a.due_at || a.at))]),
        tone: a.kind === 'task_overdue' || dayWord(a.due_at || a.at, now) === 'اليوم' ? 'red' : 'amber',
        button: { label: 'تمّت', kind: 'secondary' },
      };
    case 'hearing_today': {
      const w = dayWord(a.at, now) || dayDate(a.at);
      return {
        title: `جلسة ${w} ${time(a.at)}`,
        sub: clean([a.location || a.title, code(a.matter_code), a.attendance ? `يلزم حضور ${BENEFICIARY}` : null]),
        tone: 'teal',
        chevron: true,
      };
    }
    case 'assignment_due_soon': {
      const w = dayWord(a.due_at || a.at, now);
      return {
        title: `سلّم رأيك ${w ? `${w} ${time(a.due_at || a.at)}` : when(a.due_at || a.at, now)}`,
        sub: clean([code(a.case_code), a.case_title]),
        tone: w === 'اليوم' ? 'red' : 'amber',
        button: { label: 'اكتب', kind: 'primary' },
      };
    }
    case 'assignment_new':
      return {
        title: `إسناد جديد: ${a.case_title || a.case_code || ''}`,
        sub: clean([code(a.case_code), a.due_at ? keep(`سلّم قبل ${when(a.due_at, now)}`) : null]),
        tone: 'amber',
        button: { label: 'افتح', kind: 'secondary' },
      };
    case 'info_shared':
      return {
        // v9.1 fixes: رد وصل بعد تقديم الرأي (للعلم: إن غيّر رأيك اطلب من الإدارة إعادته)
        title: a.after_submit ? 'وصلك رد بعد تقديم رأيك' : 'وصلك رد على طلبك',
        sub: clean([code(a.case_code), Number(a.count) > 1 ? keep(count(a.count, 'reply')) : null]),
        tone: 'teal',
        chevron: true,
      };
    default:
      return { title: a.title || '', sub: clean([code(a.case_code || a.matter_code)]), tone: 'teal', chevron: true };
  }
}

/** رقم بفواصل الآلاف (إعادة تصدير لتبقى صفحات المحامي على مصدر واحد). */
export { num };
