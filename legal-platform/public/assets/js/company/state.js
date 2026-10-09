// الإصدار 10 — حالة بوابة الشركات في الذاكرة فقط (L-47، U10-87): لا تُحفظ بيانات الشركة على الجهاز إلا مسودة الطلب
// ek.co.draft:{userId} (الخطوة والنوع ونص الحقول ومعرّفات المرفقات المرفوعة — لا محتوى ملفات؛ 7 أيام)، وصفحة العودة
// ek.co.return (تبدأ بـ #/ فقط)، وإخفاء البطاقات ek.co.setup:/ek.co.intro:، وتفضيلات العرض ek.co.view:.

export const S = { user: null, company: null, session: null, home: null, unread: 0 };
export const DRAFT_PREFIX = 'ek.co.draft:';
export const RETURN_KEY = 'ek.co.return';
const DRAFT_TTL_MS = 7 * 86400000;

export const isAdmin = () => S.user?.role === 'company_admin';
export const isViewer = () => S.user?.role === 'viewer';
export const readOnly = () => !!S.company?.read_only;
/** يرسل ويرد (مدير البوابة أو عضو) في شركة غير موقوفة */
export const canWrite = () => !!S.user && !isViewer() && !readOnly();
/** يرى الأسعار والتكاليف: مدير البوابة أو جهة الفواتير */
export const seesMoney = () => isAdmin() || !!S.user?.billing_contact;

/** وصول آمن للتخزين (نافذة خاصة أو بيانات محجوبة ← null) */
function box(kind) {
  try {
    const s = window[kind];
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}
export function getItem(kind, key) {
  try {
    return box(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
export function setItem(kind, key, value) {
  try {
    box(kind)?.setItem(key, value);
  } catch {
    /* بلا تخزين: تبقى الصفحة صالحة */
  }
}
export function removeItem(kind, key) {
  try {
    box(kind)?.removeItem(key);
  } catch {
    /* لا شيء */
  }
}

/** نظافة التخزين عند الإقلاع (L-47، CS-31): صفحة عودة غريبة تُهمل فورًا؛ وبعد معرفة المستخدم (userId) تُحذف مسودات
 *  المستخدمين الآخرين على هذا الجهاز ومسودته المنتهية */
export function storageHygiene(userId) {
  const ret = getItem('sessionStorage', RETURN_KEY);
  if (ret != null && !safeReturn(ret)) removeItem('sessionStorage', RETURN_KEY);
  if (userId == null) return;
  const ls = box('localStorage');
  if (!ls) return;
  try {
    const keys = [];
    for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
    for (const k of keys) {
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      if (k !== `${DRAFT_PREFIX}${userId}` || !validDraft(parse(ls.getItem(k)))) ls.removeItem(k);
    }
  } catch {
    /* لا شيء */
  }
}

/** صفحة عودة مقبولة: تبدأ بـ #/ ولا تعود إلى شاشات الدخول والروابط */
export function safeReturn(hash) {
  const s = String(hash || '');
  return s.startsWith('#/') && s.length < 300 && !/^#\/(login|forgot|invite|reset)(\/|$|\?)/.test(s);
}
export function rememberReturn(hash = window.location.hash) {
  if (safeReturn(hash)) setItem('sessionStorage', RETURN_KEY, hash);
}
export function takeReturn() {
  const v = getItem('sessionStorage', RETURN_KEY);
  removeItem('sessionStorage', RETURN_KEY);
  return safeReturn(v) ? v : null;
}

const parse = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const validDraft = (d) => !!d && typeof d === 'object' && Number(d.saved_at) > Date.now() - DRAFT_TTL_MS;

export const draftKey = () => (S.user?.id != null ? `${DRAFT_PREFIX}${S.user.id}` : null);
export function readDraft() {
  const k = draftKey();
  const d = k ? parse(getItem('localStorage', k)) : null;
  if (!validDraft(d)) {
    if (k && d) removeItem('localStorage', k);
    return null;
  }
  return d;
}
/** المسودة: { step, type, title, description, fields, uploads:[{upload_id, filename, size, mime, expires_at}], … } — نص فقط */
export function writeDraft(d) {
  const k = draftKey();
  if (!k || !d) return;
  const clean = JSON.stringify({ ...d, saved_at: Date.now() }, (key, v) => (key === 'data_base64' || (typeof Blob !== 'undefined' && v instanceof Blob) ? undefined : v));
  setItem('localStorage', k, clean);
}
export function clearDraft() {
  const k = draftKey();
  if (k) removeItem('localStorage', k);
}

export function setSession(s) {
  S.user = s?.user || null;
  S.company = s?.company || null;
  S.session = s?.session || null;
}
/** الخروج: حذف مسودة المستخدم وكل ما في الذاكرة */
export function clearSession() {
  clearDraft();
  S.user = null;
  S.company = null;
  S.session = null;
  S.home = null;
  S.unread = 0;
}

/**
 * هل يكتب المستخدم شيئًا لم يُرسل؟ (U10-81: «النماذج تحتفظ بكل ما كُتب»؛ L-64) — ورقة مفتوحة، أو صفحة نموذج (route.keep)،
 * أو حقل كتابة عليه التركيز، أو نص في حقل متعدد الأسطر، أو ملف مرفوع لم يُرسل بعد. التحديث التلقائي (العودة إلى التبويب،
 * عودة الاتصال) يعيد رسم الصفحة ويغلق الأوراق، فلا يجري في هذه الحالات.
 */
export function typingInProgress(doc, route) {
  if (!doc) return false;
  if (doc.querySelector('.modal-backdrop:not(.is-leaving)')) return true;
  if (route?.keep) return true;
  const out = doc.querySelector('.co-outlet');
  if (!out) return false;
  const a = doc.activeElement;
  if (a && out.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|email|tel|url|number|date|password)$/.test(a.type || 'text')))) return true;
  if ([...out.querySelectorAll('textarea')].some((t) => String(t.value || '').trim())) return true;
  return !!out.querySelector('.co-up-item');
}
