// v9.1 l-court (L-18) — صندوق الصادر دون اتصال لإجراءات ممر المحكمة: نتيجة الجلسة (POST بمرجع client_ref)
// وتمييز المهمة «تمّت»/إعادة فتحها (PATCH). عند انقطاع الشبكة يُحفظ الإجراء على هذا الجهاز ويُرسل تلقائيًا
// بالترتيب عند عودة الاتصال (حدث online، والعودة إلى التبويب، ومحاولة هادئة كل 20 ثانية ما دام في الصندوق شيء).
//
// التخزين: localStorage بالمفتاح 'bm-outbox:{userId}' (لكل مستخدم على حدة، ويُمسح عند تسجيل الخروج المؤكد).
// لا يُخزَّن فيه إلا ما كتبه المحامي نفسه للإجراء (لا بيانات مستفيد/ة).
//
// الواجهة البرمجية (ثابتة — تستوردها «اليوم» وصفحة الملف المستمر والتقويم وورقة النتيجة):
//   initOutbox(user)                        يربط الصندوق بالمستخدم (lawyer) ويبدأ الاستماع؛ آمن للاستدعاء المتكرر
//   outboxSend({ kind, method, path, body, ref, label })
//        → Promise<{ status:'sent', data } | { status:'queued', item }>
//        يرسل فورًا؛ عند خطأ شبكة فقط يُحفظ في الصندوق. أخطاء الخادم (4xx/5xx) تُرمى كما هي للمستدعي.
//        kind: 'outcome' | 'task'، ref: مفتاح الصف مثل 'event:12' أو 'task:7'، label: وصف قصير للإجراء
//   outboxItems()                           الإجراءات المنتظرة بالترتيب
//   outboxFailures()                        إجراءات رفضها الخادم بعد عودة الاتصال (4xx): { ref, label, error, ... }
//   outboxCount()                           عدد المنتظر
//   outboxStateFor(ref)                     null | { state:'queued', item } | { state:'failed', item }
//   dismissOutboxFailure(id)                إخفاء إشعار الفشل بعد فتحه
//   outboxFlush()                           إرسال المنتظر الآن (يعيد Promise)
//   onOutboxChange(fn)                      fn({ items, failures, sent:[{item,data}], failed:[item] }) — يعيد دالة إلغاء
//   outboxPill({ onClick? })                شارة «{n} بانتظار الإرسال» تتحدث تلقائيًا (مخفية عند 0) — للصفحة الرئيسية
//   outboxLogoutWarning()                   null أو «لديك إجراء واحد لم يُرسل بعد.» (للتأكيد قبل الخروج)
//   clearOutbox()                           مسح صندوق المستخدم الحالي (عند تسجيل الخروج)
//   QUEUED_TEXT                             «بانتظار الاتصال — سيُرسل تلقائيًا»
import { h } from '../../lib/h.js';
import { request } from '../../lib/api.js';
import { icon } from '../../lib/ui.js';
import { count } from '../words.js';

export const QUEUED_TEXT = 'بانتظار الاتصال — سيُرسل تلقائيًا';
const ACTION_UNIT = ['إجراء واحد', 'إجراءان', 'إجراءات', 'إجراءً'];

let userId = null;
let queue = [];
let failures = [];
let flushing = null;
let timer = null;
let listening = false;
// انتهت الجلسة (401): يتوقف الإرسال حتى يدخل المستخدم من جديد (initOutbox) — فلا يُرسل إجراء محامٍ
// بجلسة مستخدم آخر دخل من نفس الجهاز، ولا تتكرر طلبات مرفوضة كل 20 ثانية على شاشة الدخول
let paused = false;
const listeners = new Set();

const keyFor = (id) => `bm-outbox:${id}`;

function load() {
  queue = [];
  failures = [];
  if (userId == null) return;
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    if (raw && Array.isArray(raw.items)) queue = raw.items.filter((x) => x && x.path && x.method);
    if (raw && Array.isArray(raw.failures)) failures = raw.failures.filter(Boolean).slice(-20);
  } catch {
    /* التخزين غير متاح: يعمل الصندوق في الذاكرة فقط */
  }
}

/**
 * تبويب آخر للمستخدم نفسه غيّر الصندوق (أرسل أو أضاف): نأخذ نسخة التخزين حتى لا يُعيد هذا التبويب
 * كتابة إجراءات أُرسلت بالفعل (فتُرسل مرة أخرى أو تعكس «إعادة فتح» مهمة). لا شيء يتغير إن تعذرت القراءة.
 */
function syncFromStorage() {
  if (userId == null) return false;
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || 'null');
    queue = raw && Array.isArray(raw.items) ? raw.items.filter((x) => x && x.path && x.method) : [];
    failures = raw && Array.isArray(raw.failures) ? raw.failures.filter(Boolean).slice(-20) : [];
    return true;
  } catch {
    return false;
  }
}

function save() {
  if (userId == null) return;
  try {
    if (!queue.length && !failures.length) localStorage.removeItem(keyFor(userId));
    else localStorage.setItem(keyFor(userId), JSON.stringify({ items: queue, failures }));
  } catch {
    /* تجاهل */
  }
}

function emit(extra = {}) {
  const payload = { items: queue.slice(), failures: failures.slice(), sent: [], failed: [], ...extra };
  for (const fn of listeners) {
    try {
      fn(payload);
    } catch {
      /* مستمع معطوب لا يوقف الآخرين */
    }
  }
}

function schedule() {
  if (timer || !queue.length) return;
  timer = setInterval(() => {
    if (!queue.length) {
      clearInterval(timer);
      timer = null;
      return;
    }
    outboxFlush();
  }, 20000);
}

const isNetworkError = (err) => err && (err.status === 0 || err.code === 'network_error');
/** أخطاء مؤقتة لا تُخرج الإجراء من الصندوق: انتهاء الجلسة، القيود، الضغط، أعطال الخادم */
const isTransient = (err) =>
  isNetworkError(err) || err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500 || (err.status === 403 && /required$/.test(err.code || ''));

/** يربط الصندوق بالمستخدم الحالي ويبدأ الاستماع للشبكة (مرة واحدة) */
export function initOutbox(user) {
  const id = user && user.id != null ? user.id : null;
  paused = false; // دخول (أو عودة) المستخدم: يُستأنف الإرسال
  if (id !== userId) {
    userId = id;
    load();
    emit();
  }
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('online', () => outboxFlush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') outboxFlush();
    });
    window.addEventListener('storage', (e) => {
      if (userId == null || e.key !== keyFor(userId) || flushing) return;
      if (syncFromStorage()) {
        if (queue.length) schedule();
        emit();
      }
    });
  }
  if (queue.length) {
    schedule();
    if (typeof navigator === 'undefined' || navigator.onLine !== false) outboxFlush();
  }
}

export function outboxItems() {
  return queue.slice();
}
export function outboxFailures() {
  return failures.slice();
}
export function outboxCount() {
  return queue.length;
}

export function outboxStateFor(ref) {
  if (!ref) return null;
  const q = queue.find((x) => x.ref === ref);
  if (q) return { state: 'queued', item: q };
  const f = [...failures].reverse().find((x) => x.ref === ref);
  if (f) return { state: 'failed', item: f };
  return null;
}

export function dismissOutboxFailure(id) {
  const before = failures.length;
  failures = failures.filter((x) => x.id !== id);
  if (failures.length !== before) {
    save();
    emit();
  }
}

export function onOutboxChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function newId() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* تجاهل */
  }
  return `ob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * يرسل الإجراء الآن؛ عند خطأ الشبكة يحفظه في الصندوق (بنفس الجسم ونفس client_ref) ويعيد { status:'queued' }.
 * أي إجراء منتظر لنفس الصف (ref) يُستبدل بالأحدث حتى لا يُرسل إجراءان متعارضان.
 */
export async function outboxSend({ kind, method = 'POST', path, body, ref = null, label = '' }) {
  // إن كان في الصندوق ما ينتظر قبله فالترتيب أولًا: يُضاف خلفه ثم يُرسل الكل بالترتيب
  if (queue.length && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    await outboxFlush();
  }
  if (!queue.length) {
    try {
      const data = await request(method, path, { body });
      return { status: 'sent', data };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const item = { id: newId(), kind, method, path, body, ref, label, created_at: new Date().toISOString(), attempts: 0 };
  if (ref) queue = queue.filter((x) => x.ref !== ref);
  if (ref) failures = failures.filter((x) => x.ref !== ref);
  queue.push(item);
  save();
  schedule();
  emit();
  return { status: 'queued', item };
}

/** يرسل المنتظر بالترتيب. يتوقف عند أول خطأ مؤقت (ما زال الاتصال مقطوعًا)، ويُخرج ما يرفضه الخادم (4xx). */
export function outboxFlush() {
  if (flushing) return flushing;
  if (!queue.length || userId == null || paused) return Promise.resolve();
  flushing = (async () => {
    const sent = [];
    const failed = [];
    try {
      while (queue.length) {
        const item = queue[0];
        try {
          item.attempts = (item.attempts || 0) + 1;
          const data = await request(item.method, item.path, { body: item.body });
          queue.shift();
          sent.push({ item, data });
          save();
        } catch (err) {
          if (isTransient(err)) {
            if (err && err.status === 401) paused = true;
            save();
            break;
          }
          queue.shift();
          const f = { ...item, error: (err && err.message) || 'رفض الخادم الإجراء', failed_at: new Date().toISOString() };
          failures.push(f);
          failures = failures.slice(-20);
          failed.push(f);
          save();
        }
      }
    } finally {
      flushing = null;
      if (!queue.length && timer) {
        clearInterval(timer);
        timer = null;
      }
      if (sent.length || failed.length) emit({ sent, failed });
    }
  })();
  return flushing;
}

export function outboxLogoutWarning() {
  const n = queue.length;
  if (!n) return null;
  // مطابقة الفعل للعدد: إجراء واحد لم يُرسل / إجراءان لم يُرسلا / 3 إجراءات لم تُرسل / 11 إجراءً لم يُرسل
  const mod = n % 100;
  const verb = n === 2 ? 'لم يُرسلا' : mod >= 3 && mod <= 10 ? 'لم تُرسل' : 'لم يُرسل';
  return `لديك ${count(n, ACTION_UNIT)} ${verb} بعد.`;
}

export function clearOutbox() {
  queue = [];
  failures = [];
  if (userId != null) {
    try {
      localStorage.removeItem(keyFor(userId));
    } catch {
      /* تجاهل */
    }
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  emit();
}

/** شارة «{n} بانتظار الإرسال» تتحدث تلقائيًا؛ تُزال مستمعاتها حين تُفصل عن الصفحة */
export function outboxPill({ onClick } = {}) {
  const text = h('span');
  const el = h(
    onClick ? 'button.lc-outbox-pill' : 'span.lc-outbox-pill',
    { type: onClick ? 'button' : null, role: onClick ? null : 'status', onClick: onClick || null },
    icon('clock', { size: 14 }),
    text,
  );
  const sync = () => {
    if (!el.isConnected && el.dataset.mounted === '1') {
      off();
      return;
    }
    if (el.isConnected) el.dataset.mounted = '1';
    const n = queue.length;
    el.hidden = n === 0;
    text.textContent = n ? `${count(n, ACTION_UNIT)} بانتظار الإرسال` : '';
  };
  const off = onOutboxChange(sync);
  sync();
  return el;
}
