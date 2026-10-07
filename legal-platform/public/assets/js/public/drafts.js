// v9.1 b-forms — مسودات تبقى على الموبايل لو اتقفلت الصفحة (موبايل بذاكرة 2 جيجا يقفل التبويب عند فتح واتساب).
//
// API (ثابت؛ يستخدمه نموذج الطلب وصفحة المتابعة):
//   draftStore(key) → { load(), save(obj), clear(), saveSoon(obj, ms = 500), flush() }
//     - IndexedDB «bm-drafts» (مخزن drafts، المفتاح key مثل 'intake' أو 'request-12'): النصوص والصور والتسجيلات (Blob/File).
//     - نسخة نصية فقط في localStorage باسم bm_<key>_draft (bm_intake_draft للنموذج): تعمل حتى بلا IndexedDB.
//     - load() → Promise<obj | null>؛ المسودة الأقدم من 7 أيام تُحذف. يضيف للنتيجة _savedAt (ms) و _blobsLost (true إن ضاعت
//       الصور/التسجيلات لأن IndexedDB غير متاح، فتقول الواجهة «الصور والتسجيل محتاجين يتعملوا تاني.»).
//     - save(obj) → Promise<boolean> (true إن حُفظت الملفات أيضًا). الحد الأقصى للملفات 20 ميجابايت للمسودة الواحدة
//       (ما زاد لا يُحفظ ويُضاف _truncated)، والنسخة النصية حتى 100 ألف حرف.
//     - clear() → Promise (عند نجاح الإرسال).
//   clearAllDrafts() → Promise   كل المسودات على هذا الموبايل («مش موبايلك؟ امسحي»).
//
// كل شيء داخل try/catch: الصفحة تعمل طبيعيًا لو التخزين ممنوع (وضع التصفح الخاص مثلًا).

const DB_NAME = 'bm-drafts';
const STORE = 'drafts';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BLOB_BYTES = 20 * 1024 * 1024;
const MAX_LS_CHARS = 100000;

// بعض المتصفحات (WebKit قديم) يعلق فيها indexedDB.open بلا أي رد: لا ننتظر أكثر من هذا ثم نكمل بدون التخزين
const OPEN_TIMEOUT_MS = 3000;
const OP_TIMEOUT_MS = 8000;

const lsKey = (key) => `bm_${key}_draft`;
const isBlob = (v) => typeof Blob !== 'undefined' && v instanceof Blob;

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const timer = setTimeout(() => {
      dbPromise = null; // نحاول مرة أخرى في العملية التالية
      resolve(null);
    }, OPEN_TIMEOUT_MS);
    const done = (db) => {
      clearTimeout(timer);
      resolve(db);
    };
    try {
      if (typeof indexedDB === 'undefined') return done(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        } catch {
          /* لا شيء */
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        done(db);
      };
      req.onerror = () => done(null);
      req.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
  return dbPromise;
}

function idb(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((res) => {
        if (!db) return res({ ok: false });
        // معاملة لا تكتمل أبدًا لا توقف الصفحة (إرسال الطلب ينتظر مسح المسودة)
        const timer = setTimeout(() => res({ ok: false, error: new Error('timeout') }), OP_TIMEOUT_MS);
        const resolve = (v) => {
          clearTimeout(timer);
          res(v);
        };
        let tx;
        try {
          tx = db.transaction(STORE, mode);
        } catch {
          return resolve({ ok: false });
        }
        let value;
        try {
          const req = fn(tx.objectStore(STORE));
          if (req) req.onsuccess = () => (value = req.result);
        } catch (e) {
          try {
            tx.abort();
          } catch {
            /* لا شيء */
          }
          return resolve({ ok: false, error: e });
        }
        tx.oncomplete = () => resolve({ ok: true, value });
        tx.onerror = () => resolve({ ok: false, error: tx.error });
        tx.onabort = () => resolve({ ok: false, error: tx.error });
      }),
  );
}

/** نسخة من الكائن مع تطبيق دالة على كل Blob (عميق، للمصفوفات والكائنات العادية فقط) */
function mapBlobs(value, fn) {
  if (isBlob(value)) return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapBlobs(v, fn));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapBlobs(v, fn);
    return out;
  }
  return value;
}

function hasBlobs(value) {
  let found = false;
  mapBlobs(value, (b) => {
    found = true;
    return b;
  });
  return found;
}

/** حد الحجم: الملفات بعد 20 ميجابايت لا تُحفظ (تصبح null) */
function capBlobs(value) {
  let total = 0;
  let truncated = false;
  const data = mapBlobs(value, (b) => {
    if (total + b.size > MAX_BLOB_BYTES) {
      truncated = true;
      return null;
    }
    total += b.size;
    return b;
  });
  return { data, truncated };
}

// بعض المتصفحات القديمة (سفاري قديم) لا تخزن Blob في IndexedDB: نحفظ بياناته الخام ونعيد بناءه عند القراءة
async function blobsToRaw(value) {
  const jobs = [];
  const data = mapBlobs(value, (b) => {
    const slot = { __bm_raw: null, type: b.type || '', name: typeof b.name === 'string' ? b.name : null };
    jobs.push(b.arrayBuffer().then((buf) => (slot.__bm_raw = buf)));
    return slot;
  });
  await Promise.all(jobs);
  return data;
}

function rawToBlobs(value) {
  if (value && typeof value === 'object' && value.__bm_raw instanceof ArrayBuffer) {
    const blob = new Blob([value.__bm_raw], { type: value.type || '' });
    if (value.name) {
      try {
        return new File([blob], value.name, { type: value.type || '' });
      } catch {
        blob.name = value.name;
      }
    }
    return blob;
  }
  if (Array.isArray(value)) return value.map(rawToBlobs);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rawToBlobs(v);
    return out;
  }
  return value;
}

function lsRead(key) {
  try {
    const raw = localStorage.getItem(lsKey(key));
    const rec = raw ? JSON.parse(raw) : null;
    return rec && typeof rec === 'object' && rec.data && typeof rec.data === 'object' ? rec : null;
  } catch {
    return null;
  }
}

function lsWrite(key, rec) {
  try {
    const s = JSON.stringify(rec);
    if (s.length > MAX_LS_CHARS) return false;
    localStorage.setItem(lsKey(key), s);
    return true;
  } catch {
    return false;
  }
}

function lsRemove(key) {
  try {
    localStorage.removeItem(lsKey(key));
  } catch {
    /* لا شيء */
  }
}

/**
 * مسودة باسم key.
 * @param {string} key  مثل 'intake' أو 'request-12'
 */
export function draftStore(key) {
  const k = String(key || 'draft').replace(/[^\w.-]/g, '_').slice(0, 60);
  let timer = null;
  let pendingObj = null;
  let chain = Promise.resolve(true);

  async function write(obj) {
    const savedAt = Date.now();
    const blobs = hasBlobs(obj);
    // النسخة النصية: الملفات تُستبدل بـ null، وتسجَّل أنها كانت موجودة
    lsWrite(k, { v: 1, saved_at: savedAt, had_blobs: blobs, data: mapBlobs(obj, () => null) });
    const { data, truncated } = capBlobs(obj);
    const rec = { v: 1, saved_at: savedAt, truncated, data };
    let res = await idb('readwrite', (s) => s.put(rec, k));
    if (!res.ok && blobs) {
      try {
        const raw = { ...rec, data: await blobsToRaw(data) };
        res = await idb('readwrite', (s) => s.put(raw, k));
      } catch {
        res = { ok: false };
      }
    }
    return res.ok;
  }

  const api = {
    async load() {
      const ls = lsRead(k);
      let rec = null;
      try {
        const r = await idb('readonly', (s) => s.get(k));
        rec = r.ok && r.value && typeof r.value === 'object' ? r.value : null;
      } catch {
        rec = null;
      }
      const now = Date.now();
      const fresh = (x) => x && Number(x.saved_at) > now - MAX_AGE_MS && Number(x.saved_at) <= now + 60000;
      // الأحدث يكسب (لو فشلت كتابة IndexedDB الأخيرة نأخذ النص الأحدث ونعلن ضياع الملفات)
      if (fresh(rec) && (!ls || Number(rec.saved_at) >= Number(ls.saved_at) - 2000)) {
        return { ...rawToBlobs(rec.data), _savedAt: Number(rec.saved_at), _blobsLost: false, _truncated: !!rec.truncated };
      }
      if (fresh(ls)) return { ...ls.data, _savedAt: Number(ls.saved_at), _blobsLost: !!ls.had_blobs, _truncated: false };
      if (rec || ls) await api.clear();
      return null;
    },
    save(obj) {
      clearTimeout(timer);
      timer = null;
      pendingObj = null;
      chain = chain.then(() => write(obj)).catch(() => false);
      return chain;
    },
    /** حفظ مؤجل (يُستدعى مع كل حرف) */
    saveSoon(obj, ms = 500) {
      pendingObj = obj;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const o = pendingObj;
        pendingObj = null;
        timer = null;
        if (o) api.save(o);
      }, ms);
    },
    /** يكتب الحفظ المؤجل فورًا (عند إخفاء الصفحة مثلًا) */
    flush() {
      if (pendingObj) return api.save(pendingObj);
      return chain;
    },
    async clear() {
      clearTimeout(timer);
      timer = null;
      pendingObj = null;
      lsRemove(k);
      await chain.catch(() => {});
      await idb('readwrite', (s) => s.delete(k));
    },
  };
  return api;
}

/** يمسح كل المسودات على هذا الموبايل (النصوص والصور والتسجيلات) */
export async function clearAllDrafts() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /^bm_.+_draft$/.test(key)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* لا شيء */
  }
  await idb('readwrite', (s) => s.clear());
}
