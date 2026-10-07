// v9.1 l-work — نص رأي المحامي لا يضيع (L-03): نسخة احتياطية على الجهاز + محرك حفظ تلقائي بإعادة محاولة.
//
// الواجهة البرمجية:
//   draftKey(userId, assignmentId)              'bm-draft:{userId}:{assignmentId}'
//   createDraftStore({ userId, assignmentId, code })
//       → { load(), write({ body, base_updated_at, version }), clear(), mode }
//       النسخة: { body, at, base_updated_at, version, code } في localStorage، وإن تعذر ففي sessionStorage
//       (mode: 'local' | 'session' | 'none' — حتى تقول حالة الحفظ الحقيقة دائمًا)
//   decideRestore(server, local) → { action: 'server' | 'restore' | 'conflict' }
//       server: { body, updated_at } | null — local: نسخة الجهاز | null
//   listUserDrafts(userId) → [{ key, assignmentId, code, body, at }]
//   clearUserDrafts(userId)                    يحذف نسخ المستخدم وعلامات ملاحظات الإدارة (عند الخروج)
//   purgeOldDrafts(maxAgeDays = 30)            يحذف النسخ الأقدم من 30 يومًا (عند بدء التطبيق)
//   loadNoteChecks(userId, opinionId) / saveNoteChecks(userId, opinionId, indices)
//   wordCount(text)
//   createAutosaver({ save, onState, delay, backoff })
//       → { setBody(body), markSaved(body), flush({ keepalive }), retryNow(), pause(), resume(), destroy(), get pending() }
//       save(body, { keepalive }) يُرجع Promise؛ onState(state, info) بالحالات:
//       'dirty' | 'saving' | 'saved' | 'offline' | 'error' | 'expired' | 'conflict' | 'gone'

export const DRAFT_PREFIX = 'bm-draft:';
export const NOTES_PREFIX = 'bm-notes:';
const DAY_MS = 86400000;

// بعد الخروج لا تكتب أي نسخة أُنشئت قبله (صفحة كتابة ما زالت معلّقة تحفظ عند blur أو إعادة المحاولة):
// كل مخزن يعرف «جيله»، وclearUserDrafts يرفع جيل المستخدم فتُرفض كتابة المخازن الأقدم.
let GENERATION = 0;
const clearedAt = new Map();

function store(kind) {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage;
    return s || null;
  } catch {
    return null;
  }
}

function readKey(s, key) {
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function keysOf(s) {
  const out = [];
  if (!s) return out;
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k) out.push(k);
    }
  } catch {
    /* التخزين غير متاح */
  }
  return out;
}

function removeKey(s, key) {
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* لا شيء */
  }
}

export function draftKey(userId, assignmentId) {
  return `${DRAFT_PREFIX}${userId}:${assignmentId}`;
}

export function wordCount(text) {
  const t = String(text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** نسخة الجهاز الاحتياطية لمسودة إسناد واحد */
export function createDraftStore({ userId, assignmentId, code = null }) {
  const key = draftKey(userId, assignmentId);
  const born = ++GENERATION;
  const revoked = () => (clearedAt.get(String(userId)) || 0) > born;
  const api = {
    mode: 'local',
    key,
    code, // كود الملف يُحفظ مع النسخة لرسالة حارس الخروج
    load() {
      const local = readKey(store('local'), key);
      if (local && typeof local.body === 'string') return { ...local, where: 'local' };
      const session = readKey(store('session'), key);
      if (session && typeof session.body === 'string') return { ...session, where: 'session' };
      return null;
    },
    /** كتابة متزامنة؛ تُرجع مكان الحفظ الفعلي ('local' | 'session' | 'none') */
    write({ body, base_updated_at = null, version = null, steps = undefined }) {
      // سجّل المستخدم الخروج بعد إنشاء هذا المخزن: لا نعيد ما حُذف عمدًا
      if (revoked()) return api.mode;
      const value = JSON.stringify({ body: String(body ?? ''), steps, at: Date.now(), base_updated_at, version, code: api.code });
      const local = store('local');
      try {
        if (!local) throw new Error('no localStorage');
        local.setItem(key, value);
        removeKey(store('session'), key);
        api.mode = 'local';
        return 'local';
      } catch {
        const session = store('session');
        try {
          if (!session) throw new Error('no sessionStorage');
          session.setItem(key, value);
          api.mode = 'session';
          return 'session';
        } catch {
          api.mode = 'none';
          return 'none';
        }
      }
    },
    clear() {
      removeKey(store('local'), key);
      removeKey(store('session'), key);
    },
  };
  return api;
}

/**
 * ماذا نعرض عند فتح الكتابة؟ (S نص المنصة، L نسخة الجهاز)
 *  - لا L، أو L.body === S.body → نص المنصة
 *  - L مبنية على آخر نسخة على المنصة (L.base_updated_at === S.updated_at) → نستعيد L تلقائيًا ونحفظها
 *  - غير ذلك → نصّان مختلفان: يختار المحامي
 */
export function decideRestore(server, local) {
  if (!local || typeof local.body !== 'string' || !local.body.trim()) return { action: 'server' };
  const sBody = server && typeof server.body === 'string' ? server.body : '';
  const sAt = server && server.updated_at ? server.updated_at : null;
  if (local.body === sBody) return { action: 'server' };
  if ((local.base_updated_at || null) === sAt) return { action: 'restore' };
  if (!sBody.trim()) return { action: 'restore' };
  return { action: 'conflict' };
}

function userKeys(prefix, userId) {
  const p = `${prefix}${userId}:`;
  return [store('local'), store('session')].flatMap((s) => keysOf(s).filter((k) => k.startsWith(p)).map((k) => ({ s, k })));
}

export function listUserDrafts(userId) {
  return userKeys(DRAFT_PREFIX, userId)
    .map(({ s, k }) => {
      const v = readKey(s, k);
      if (!v || typeof v.body !== 'string' || !v.body.trim()) return null;
      return { key: k, assignmentId: k.split(':').pop(), code: v.code || null, body: v.body, at: v.at || null, base_updated_at: v.base_updated_at || null, steps: v.steps };
    })
    .filter(Boolean);
}

export function clearUserDrafts(userId) {
  clearedAt.set(String(userId), ++GENERATION);
  if (syncRetry) syncRetry.stop();
  for (const { s, k } of [...userKeys(DRAFT_PREFIX, userId), ...userKeys(NOTES_PREFIX, userId)]) removeKey(s, k);
}

/**
 * v9.1 l-work (L-03): نص كُتب دون اتصال يصل للمنصة دون فتح المحرر — عند دخول التطبيق وعند عودة الشبكة.
 * لكل نسخة على الجهاز: PUT بنفس أساسها (base_updated_at، أو 'none' إن بدأت قبل وجود مسودة على المنصة)، فلا يكتب
 * فوق نص أحدث من جهاز آخر (409 draft_conflict ← تبقى النسخة ويختار المحامي في المحرر). لا تُحذف النسخة إلا بعد
 * تأكيد الخادم حفظ النص نفسه. صفحة الكتابة المفتوحة تتولى نسختها بنفسها.
 * @param {{id:number}} user
 * @param {{ request?: (path:string, body:object)=>Promise<any>, notify?: (text:string)=>void }} [opts]
 * @returns {Promise<{saved:string[], pending:number}>}
 */
let syncing = null;
let syncRetry = null;
export function syncPendingDrafts(user, opts = {}) {
  if (!user || !user.id) return Promise.resolve({ saved: [], pending: 0 });
  if (syncing) return syncing;
  syncing = (async () => {
    const saved = [];
    let offline = false;
    const put = opts.request || (async (path, body) => (await import('../../lib/api.js')).api.put(path, body, { background: true }));
    const openWrite = (typeof window !== 'undefined' && /^#\/my\/assignments\/(\d+)\/write(?:[/?]|$)/.exec(String(window.location.hash))) || null;
    for (const d of listUserDrafts(user.id)) {
      if (openWrite && openWrite[1] === String(d.assignmentId)) continue;
      const lines = typeof d.steps === 'string' ? d.steps.split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8).map((x) => x.slice(0, 300)) : [];
      try {
        const res = await put(`/lawyer/assignments/${encodeURIComponent(d.assignmentId)}/draft`, { body: d.body, base_updated_at: d.base_updated_at || 'none', client_steps: lines });
        // نحذف فقط إن لم تتغير النسخة أثناء الطلب (نافذة أخرى تكتب) وتأكد حفظ النص نفسه
        const now = listUserDrafts(user.id).find((x) => x.key === d.key);
        if (res && res.length === d.body.length && now && now.body === d.body) {
          for (const s of [store('local'), store('session')]) removeKey(s, d.key);
          saved.push(d.code || String(d.assignmentId));
        }
      } catch (err) {
        if (err && err.status === 0) {
          offline = true;
          break;
        }
        if (err && err.status === 401) break;
        // 409 (تعارض أو قُدّم الرأي) أو 404: تبقى النسخة ويقرر المحامي عند فتح المحرر
      }
    }
    const pending = listUserDrafts(user.id).length;
    if (saved.length && opts.notify !== null) {
      const text = `حُفظ نص رأيك في ${saved.join('، ')} على المنصة.`;
      if (opts.notify) opts.notify(text);
      else import('../../lib/ui.js').then((m) => m.toast(text, 'success', 5000)).catch(() => {});
    }
    if (offline) scheduleSyncRetry(user, opts);
    return { saved, pending };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** إعادة المحاولة عند عودة الشبكة: حدث online، أو فحص خفيف كل 5 ثوانٍ (لا يطلق بعض المتصفحات online لصفحة فُتحت دون اتصال) */
function scheduleSyncRetry(user, opts) {
  if (typeof window === 'undefined' || syncRetry) return;
  const stop = () => {
    window.removeEventListener('online', go);
    clearInterval(timer);
    syncRetry = null;
  };
  const go = () => {
    stop();
    syncPendingDrafts(user, opts);
  };
  window.addEventListener('online', go);
  const timer = setInterval(() => {
    if (!listUserDrafts(user.id).length) return stop();
    if (document.visibilityState === 'hidden') return undefined;
    fetch('/healthz', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.ok && go())
      .catch(() => {});
    return undefined;
  }, 5000);
  syncRetry = { stop };
}

/** يوقف أي إعادة محاولة معلّقة (عند الخروج) */
export function stopDraftSync() {
  if (syncRetry) syncRetry.stop();
}

/**
 * تحذير الخروج: { text, drafts } أو null. النص: «لديك نص لم يُحفظ على المنصة بعد في {INH-2026-00482}. إن سجّلت الخروج سيُحذف من هذا الجهاز.»
 */
export function pendingDraftWarning(userId) {
  const drafts = listUserDrafts(userId);
  if (!drafts.length) return null;
  const codes = [...new Set(drafts.map((d) => d.code).filter(Boolean))];
  const where = codes.length ? codes.join('، ') : 'أحد إسناداتك';
  return { text: `لديك نص لم يُحفظ على المنصة بعد في ${where}. إن سجّلت الخروج سيُحذف من هذا الجهاز.`, drafts };
}

/**
 * حارس الخروج (L-03): إن وُجد نص غير محفوظ تظهر لوحة [«ارجع واحفظ»] [«سجّل الخروج»].
 * يُرجع true للمتابعة بالخروج (وتُحذف نسخ المستخدم من هذا الجهاز)، وfalse للرجوع (وينتقل إلى صفحة الكتابة).
 * @param {{id:number}} user
 * @param {{navigate?:(path:string)=>void}} [opts]
 */
export async function confirmLogoutWithDrafts(user, { navigate } = {}) {
  if (!user) return true;
  const w = pendingDraftWarning(user.id);
  if (!w) {
    clearUserDrafts(user.id);
    return true;
  }
  const [{ modal }, { h }] = await Promise.all([import('../../lib/ui.js'), import('../../lib/h.js')]);
  return new Promise((resolve) => {
    let result = false;
    let chosen = false;
    modal({
      title: 'نص لم يُحفظ بعد',
      size: 'sm',
      sheet: true, className: 'lw-sheet lw-logout-guard',
      body: h('p.confirm-message', w.text),
      actions: [
        { label: 'ارجع واحفظ', variant: 'primary', onClick: () => { chosen = true; result = false; } },
        { label: 'سجّل الخروج', variant: 'danger', onClick: () => { chosen = true; result = true; } },
      ],
      onClose: () => {
        if (result) clearUserDrafts(user.id);
        else if (chosen && navigate && w.drafts[0]) navigate(`/my/assignments/${w.drafts[0].assignmentId}/write`);
        resolve(result);
      },
    });
  });
}

export function purgeOldDrafts(maxAgeDays = 30) {
  const limit = Date.now() - maxAgeDays * DAY_MS;
  for (const s of [store('local'), store('session')]) {
    for (const k of keysOf(s)) {
      if (!k.startsWith(DRAFT_PREFIX) && !k.startsWith(NOTES_PREFIX)) continue;
      const v = readKey(s, k);
      if (!v || !(Number(v.at) > limit)) removeKey(s, k);
    }
  }
}

export function loadNoteChecks(userId, opinionId) {
  const v = readKey(store('local'), `${NOTES_PREFIX}${userId}:${opinionId}`);
  return new Set(Array.isArray(v?.checked) ? v.checked.map(Number) : []);
}

export function saveNoteChecks(userId, opinionId, indices) {
  const s = store('local');
  if (!s) return;
  try {
    s.setItem(`${NOTES_PREFIX}${userId}:${opinionId}`, JSON.stringify({ checked: [...indices], at: Date.now() }));
  } catch {
    /* تفضيل على الجهاز فقط */
  }
}

/**
 * ملاحظات الإدارة عند الإعادة مقسّمة بنودًا: الأسطر المرقّمة («1.» «١-» «-» «•») بنود مستقلة،
 * والأسطر التالية بلا ترقيم تُلحق بالبند السابق؛ وإن لم يوجد ترقيم فكل سطر بند.
 */
export function parseReviewNotes(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  const BULLET = /^(?:[-•*–]|\(?[0-9٠-٩]{1,2}[.)\-–:]|[أ-ي][.)\-–])\s*/;
  const hasBullets = lines.some((l) => BULLET.test(l));
  if (!hasBullets) return lines;
  const out = [];
  for (const l of lines) {
    if (BULLET.test(l) || !out.length) out.push(l.replace(BULLET, '').trim() || l);
    else out[out.length - 1] += ` ${l}`;
  }
  return out;
}

/** تصنيف خطأ الحفظ */
export function classifySaveError(err) {
  if (!err) return 'error';
  if (err.status === 0 || err.code === 'network_error' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'offline';
  if (err.status === 401) return 'expired';
  if (err.status === 409 && err.code === 'draft_conflict') return 'conflict';
  if (err.status === 409 || err.status === 404) return 'gone'; // قُدّم الرأي أو أُغلق الملف أو سُحب الإسناد
  return 'error';
}

/**
 * محرك الحفظ: بعد توقف الكتابة (2.5 ث)، وعند flush (مغادرة الحقل، إخفاء الصفحة، عودة الاتصال)،
 * ومع إعادة محاولة متدرجة عند الفشل: 5 ث، 15 ث، 30 ث، 60 ث، ثم كل 60 ث ما دامت الصفحة ظاهرة.
 */
export function createAutosaver({ save, onState = () => {}, delay = 2500, backoff = [5000, 15000, 30000, 60000], skip = () => false }) {
  let lastSaved = null;
  let current = null;
  let timer = null;
  let retryTimer = null;
  let inflight = null;
  let queued = false;
  let failures = 0;
  let paused = false;
  let destroyed = false;
  let lastKeepalive = false;

  const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

  function scheduleRetry() {
    clearTimeout(retryTimer);
    if (destroyed || paused) return;
    const wait = backoff[Math.min(failures - 1, backoff.length - 1)] ?? 60000;
    retryTimer = setTimeout(function tick() {
      if (destroyed || paused) return;
      // مخفية: ننتظر عودتها (visibilitychange يستدعي flush)
      if (!visible()) return;
      run();
    }, wait);
  }

  async function run({ keepalive = false } = {}) {
    clearTimeout(timer);
    if (destroyed || paused) return false;
    if (current === null || current === lastSaved) return true;
    if (skip(current)) {
      onState('empty');
      return false;
    }
    if (inflight) {
      queued = true;
      lastKeepalive = lastKeepalive || keepalive;
      return inflight;
    }
    const body = current;
    onState('saving');
    inflight = (async () => {
      try {
        const res = await save(body, { keepalive });
        failures = 0;
        clearTimeout(retryTimer);
        lastSaved = body;
        onState(current === body ? 'saved' : 'dirty', res);
        return true;
      } catch (err) {
        const kind = classifySaveError(err);
        failures += 1;
        if (kind === 'expired' || kind === 'conflict' || kind === 'gone') paused = true;
        onState(kind, err);
        if (kind === 'offline' || kind === 'error') scheduleRetry();
        return false;
      } finally {
        inflight = null;
        if (queued && !paused && !destroyed) {
          queued = false;
          const k = lastKeepalive;
          lastKeepalive = false;
          run({ keepalive: k });
        }
      }
    })();
    return inflight;
  }

  const onOnline = () => {
    if (paused || destroyed) return;
    failures = 0;
    run();
  };
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  return {
    setBody(body) {
      current = body;
      if (destroyed || paused) return;
      clearTimeout(timer);
      if (current === lastSaved) {
        onState('saved');
        return;
      }
      if (skip(current)) {
        onState('empty');
        return;
      }
      onState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'dirty');
      clearTimeout(timer);
      timer = setTimeout(() => run(), delay);
    },
    /** نص معروف أنه محفوظ على المنصة (عند الفتح أو بعد حل التعارض) */
    markSaved(body) {
      lastSaved = body;
      if (current === null) current = body;
    },
    flush(opts) {
      return run(opts);
    },
    retryNow() {
      paused = false;
      failures = 0;
      clearTimeout(retryTimer);
      return run();
    },
    pause() {
      paused = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
    },
    resume() {
      paused = false;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
    },
    get pending() {
      return current !== null && current !== lastSaved;
    },
    get inflight() {
      return inflight;
    },
  };
}
