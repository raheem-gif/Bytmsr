// «صفحة طلبك محفوظة على الموبايل ده» (الإصدار 9.1 — مسار b-site لـ B91-06/B91-07): بلا أي import.
// المفتاح bm_portal = { url, ref, saved_at } تكتبه شاشة نجاح الطلب وصفحة المتابعة، وbm_portal_off = '1' إذا مسحتها المستفيدة.
// لا يُعرض الاسم أبدًا في الصفحات العامة، ولا يُقبل إلا رابط صفحة متابعة على نفس الموقع (/p/<رمز>).
//
// الواجهة: readSaved() · rememberPortal({ url, ref }, { force }) · forgetSaved() · savedCard({ onForget, headingLevel })

const KEY = 'bm_portal';
const OFF = 'bm_portal_off';
const PATH_RE = /^\/p\/[A-Za-z0-9_-]{20,100}$/;

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** مسار صفحة المتابعة من رابط محفوظ (نفس الموقع فقط) أو null */
function portalPath(url) {
  try {
    const u = new URL(String(url || ''), window.location.origin);
    return PATH_RE.test(u.pathname) ? u.pathname : null;
  } catch {
    return null;
  }
}

/** الصفحة المحفوظة على هذا الموبايل: { url (مسار /p/…)، ref، saved_at } أو null */
export function readSaved() {
  const s = store();
  if (!s) return null;
  try {
    const data = JSON.parse(s.getItem(KEY) || 'null');
    const path = data && portalPath(data.url);
    if (!path) return null;
    return { url: path, ref: typeof data.ref === 'string' ? data.ref.slice(0, 20) : null, saved_at: data.saved_at || null };
  } catch {
    return null;
  }
}

/**
 * حفظ صفحة المتابعة على هذا الموبايل. لا يحفظ إن مسحتها المستفيدة من قبل (bm_portal_off) إلا مع force
 * (مثل تقديم طلب جديد من نفس الموبايل). يعيد true إذا حُفظت.
 */
export function rememberPortal({ url, ref = null } = {}, { force = false } = {}) {
  const s = store();
  const path = portalPath(url);
  if (!s || !path) return false;
  try {
    if (s.getItem(OFF) === '1' && !force) return false;
    if (force) s.removeItem(OFF);
    s.setItem(KEY, JSON.stringify({ url: new URL(path, window.location.origin).href, ref: ref || null, saved_at: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

/** «مش موبايلك؟ امسحي»: يمسح الصفحة المحفوظة ولا يعيد حفظها تلقائيًا على هذا المتصفح */
export function forgetSaved() {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(KEY);
    s.setItem(OFF, '1');
  } catch {
    /* التخزين غير متاح */
  }
}

/**
 * بطاقة «عندك طلب عندنا» بزر «افتحي صفحة طلبك» (56px) ورابط «مش موبايلك؟ امسحي» (15px).
 * تعيد null إن لم توجد صفحة محفوظة.
 */
export function savedCard({ onForget, headingLevel = 2, t } = {}) {
  // v11 gate-public: t = نصوص الأفراد والشركات ({ title, open, forget }) من صفحة /intake لهم
  const saved = readSaved();
  if (!saved) return null;
  const card = document.createElement('section');
  card.className = 'pub-saved';
  card.setAttribute('aria-label', t?.title || 'عندك طلب عندنا');
  card.dataset.saved = '';
  const title = document.createElement(`h${Math.min(6, Math.max(2, headingLevel))}`);
  title.textContent = t?.title || 'عندك طلب عندنا';
  const open = document.createElement('a');
  open.className = 'pub-btn pub-btn-teal pub-btn-primary';
  open.href = saved.url;
  open.textContent = t?.open || 'افتحي صفحة طلبك';
  const forget = document.createElement('button');
  forget.type = 'button';
  forget.className = 'pub-saved-forget';
  forget.textContent = t?.forget || 'مش موبايلك؟ امسحي';
  forget.addEventListener('click', () => {
    forgetSaved();
    card.remove();
    if (typeof onForget === 'function') onForget();
  });
  card.append(title, open, forget);
  return card;
}
