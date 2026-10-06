// المصادقة: تجزئة كلمات المرور (scrypt)، قواعد قوة كلمة المرور، الدخول على خطوتين (كلمة المرور ثم رمز التحقق)،
// الإيقاف المؤقت بعد المحاولات الفاشلة، الجلسات (مهلة عدم النشاط، آخر نشاط، إنهاء جلسة بعينها)، وحراس الصلاحيات.
import crypto from 'node:crypto';
import { randomToken, sha256, nowIso, now, addHours, unauthorized, forbidden, tooMany, ApiError, arabicCount } from './util.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'bm_sid';
/** كعكة «جهاز معروف»: تُضبط بعد كل دخول ناجح ولا تُرسل إلا لمسارات الدخول (/api/auth) */
export const DEVICE_COOKIE = 'bm_dev';

/** قيمة لا تطابق أي كلمة مرور: للحسابات التي لم تُقبل دعوتها بعد */
export const UNUSABLE_PASSWORD = '!invite-pending';

/** ترويسة طلبات الخلفية من الواجهة (لا تُعد نشاطًا يمدّد مهلة عدم النشاط) — بأحرف صغيرة كما يعرضها Node */
export const BACKGROUND_HEADER = 'x-background-request';

// ===== سياسة الدخول =====
export const AUTH_POLICY = {
  /**
   * عدد المحاولات الفاشلة المتتالية من مصدر واحد (عنوان IP، أو جهاز سبق الدخول منه) قبل إيقاف ذلك المصدر مؤقتًا،
   * ثم يتضاعف زمن الإيقاف مع كل دفعة حتى الحد الأقصى. الإيقاف لا يشمل الحساب كله: لا يستطيع غريب يعرف اسم المستخدم
   * أن يمنع صاحبه من الدخول من جهازه المعتاد أو من شبكة أخرى.
   */
  lockAfter: 5,
  lockBaseMinutes: 15,
  lockMaxMinutes: 4 * 60,
  /** مدة تذكر الجهاز بعد آخر دخول ناجح منه (كعكة bm_dev) */
  deviceDays: 180,
  /** تنبيه حرج للإدارة كل 10 محاولات فاشلة لنفس الحساب */
  alertEvery: 10,
  /** مهلة خطوة رمز التحقق بعد قبول كلمة المرور، وأقصى عدد محاولات للرمز */
  challengeMinutes: 5,
  challengeMaxAttempts: 5,
  /** لا يُحدَّث «آخر نشاط» للجلسة أكثر من مرة كل 5 دقائق */
  lastSeenThrottleMs: 5 * 60 * 1000,
};

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// كلمات مرور شائعة تُرفض أيًا كان طولها (بعد توحيد حالة الأحرف)
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '0123456789', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'qwerty123', 'qwertyuiop',
  'qwerty12', '1qaz2wsx', 'abc12345', 'abcd1234', 'abcdefg1', 'admin123', 'admin1234', 'admin@123', 'admin@1234',
  'iloveyou1', 'welcome1', 'welcome123', 'letmein1', 'changeme1', 'egypt123', 'cairo123', 'misr1234', 'lawyer123',
]);

/**
 * شروط كلمة المرور (تُطبق عند إنشاء الحساب وقبول الدعوة وإعادة التعيين وتغيير كلمة المرور):
 * 8 أحرف على الأقل، تجمع بين الحروف والأرقام، ليست من الكلمات الشائعة، لا تحتوي اسم المستخدم، ولا تتكرر فيها نفس الأحرف.
 * @returns {string|null} رسالة عربية بالمشكلة أو null
 */
export function passwordProblem(password, { username = null } = {}) {
  if (typeof password !== 'string' || password.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف';
  if (password.length > 200) return 'كلمة المرور أطول من المسموح';
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) return 'كلمة المرور يجب أن تجمع بين الحروف والأرقام';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'كلمة المرور شائعة وسهلة التخمين، اختر كلمة مرور أخرى';
  if (new Set(lower).size < 4) return 'كلمة المرور ضعيفة: تتكرر فيها الأحرف نفسها، اختر كلمة مرور أكثر تنوعًا';
  const u = String(username || '').trim().toLowerCase();
  if (u.length >= 3 && lower.includes(u)) return 'كلمة المرور يجب ألا تحتوي على اسم المستخدم';
  return null;
}

/** محدد معدل بسيط في الذاكرة (نافذة منزلقة تقريبية) */
export class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }
  hit(key) {
    const t = Date.now();
    const arr = (this.hits.get(key) || []).filter((x) => t - x < this.windowMs);
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 10000) {
      for (const [k, a] of this.hits) if (!a.length || t - a[a.length - 1] > this.windowMs) this.hits.delete(k);
    }
    if (arr.length > this.max) {
      const err = tooMany();
      // أول تجاوز في النافذة (لتسجيله في سجل الأمان مرة واحدة لا مع كل محاولة)
      err.firstExceed = arr.length === this.max + 1;
      throw err;
    }
  }
  reset(key) {
    this.hits.delete(key);
  }
}

/** وصف مختصر للجهاز من ترويسة المتصفح: «Chrome على Windows» */
export function describeUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return { label: 'جهاز غير معروف', browser: null, os: null, mobile: false };
  // أوامر الخادم (npm run admin / backup / restore) تسجل «cli (اسم مستخدم النظام)»
  if (/^cli\b/i.test(s)) return { label: 'سطر أوامر الخادم', browser: null, os: null, mobile: false };
  let browser = null;
  if (/Edg\//.test(s)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
  else if (/SamsungBrowser/.test(s)) browser = 'Samsung Internet';
  else if (/Firefox\//.test(s)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
  else if (/Safari\//.test(s)) browser = 'Safari';
  else if (/node|undici|curl|wget|python|okhttp/i.test(s)) browser = 'برنامج آلي';
  let os = '';
  if (/iPhone/.test(s)) os = 'iPhone';
  else if (/iPad/.test(s)) os = 'iPad';
  else if (/Android/.test(s)) os = 'Android';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Linux/.test(s)) os = 'Linux';
  const mobile = /Mobile|iPhone|Android/.test(s);
  // برنامج لا نتعرف عليه: لا نسميه «متصفحًا»
  const label = browser ? (os ? `${browser} على ${os}` : browser) : os ? `جهاز ${os}` : 'غير معروف';
  return { label, browser, os: os || null, mobile };
}

const MINUTE_FORMS = ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'];
/** القيمة الافتراضية لـ sessionTtlHours في src/config.js (أي قيمة أخرى تعني ضبطًا صريحًا من الخادم) */
const DEFAULT_SESSION_TTL_HOURS = 12;
const ATTEMPTS = ['محاولة فاشلة واحدة', 'محاولتين فاشلتين', 'محاولات فاشلة', 'محاولة فاشلة'];

export function createAuth(app) {
  const { db, config } = app;
  const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  // حد ثانٍ لكل حساب أيًا كان عنوان IP، حتى لا يُخمَّن كلمة مرور حساب واحد بتدوير العناوين
  const accountLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  // خطوة رمز التحقق: حد لكل عنوان IP
  const secondFactorLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  // أسماء مستخدمين غير موجودة: نفس منطق الإيقاف في الذاكرة حتى لا يُعرف وجود الحساب من سلوك الإيقاف
  const ghosts = new Map();

  const setting = (key, def, { min, max }) => {
    const n = Number(app.settings.get(key));
    if (!Number.isFinite(n) || n <= 0) return def;
    return Math.min(max, Math.max(min, n));
  };
  /**
   * عمر الجلسة مضبوط على مستوى الخادم (SESSION_TTL_HOURS أو قيمة صريحة في الإعدادات البرمجية غير الافتراضية):
   * عندها يكون هو العمر الثابت للجلسة ومهلة عدم النشاط معًا، ولا تُستخدم إعدادات لوحة الإدارة.
   */
  const ttlOverride = () => {
    const n = Number(config.sessionTtlHours);
    if (!Number.isFinite(n) || n <= 0) return null;
    return process.env.SESSION_TTL_HOURS || n !== DEFAULT_SESSION_TTL_HOURS ? n : null;
  };
  /** الحد الأقصى لعمر الجلسة بالساعات (إعداد session_max_hours، الافتراضي 72) */
  const maxSessionHours = () => ttlOverride() ?? setting('session_max_hours', 72, { min: 1, max: 24 * 90 });
  /** مهلة عدم النشاط بالساعات (إعداد session_idle_hours، الافتراضي 12) */
  const idleHours = () => ttlOverride() ?? Math.min(setting('session_idle_hours', 12, { min: 0.25, max: 24 * 30 }), maxSessionHours());

  function cookieHeader(token, maxAgeSeconds) {
    const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }

  function twoFactorEnabled(userId) {
    return !!db.get('SELECT 1 FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL AND secret_enc IS NOT NULL', userId);
  }

  /** قيود ما بعد الدخول: تغيير كلمة المرور إلزاميًا، أو تفعيل التحقق بخطوتين لحسابات إدارة النظام حسب السياسة */
  function restrictionOf(u) {
    if (!u) return null;
    if (u.must_change_password) return 'password_change';
    if (u.role === 'admin' && app.settings.get('security_require_2fa_admins') === true && !twoFactorEnabled(u.id)) return 'two_factor_enrollment';
    return null;
  }

  function publicUser(u) {
    if (!u) return null;
    return {
      id: u.id,
      role: u.role,
      name: u.name,
      username: u.username,
      email: u.email || null,
      restricted: u.restricted !== undefined ? u.restricted : restrictionOf(u),
    };
  }

  function lockMinutes(failures) {
    const round = Math.max(1, Math.floor(failures / AUTH_POLICY.lockAfter));
    return Math.min(AUTH_POLICY.lockMaxMinutes, AUTH_POLICY.lockBaseMinutes * 2 ** (round - 1));
  }

  // ───── الأجهزة المعروفة ومصدر المحاولة ─────
  function deviceToken(ctx) {
    const v = ctx?.cookies?.[DEVICE_COOKIE];
    return typeof v === 'string' && v.length >= 20 && v.length <= 200 && /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
  }
  /** معرّف الجهاز إن كانت الكعكة لجهاز سبق أن أتم منه هذا المستخدم الدخول، وإلا null */
  function trustedDeviceId(ctx, user) {
    if (!user) return null;
    const tok = deviceToken(ctx);
    if (!tok) return null;
    const cutoff = new Date(now().getTime() - AUTH_POLICY.deviceDays * 86400000).toISOString();
    const row = db.get('SELECT id FROM login_devices WHERE user_id = ? AND token_hash = ? AND COALESCE(last_used_at, created_at) >= ?', user.id, sha256(tok), cutoff);
    return row ? row.id : null;
  }
  /** مصدر المحاولة: الجهاز المعروف لهذا المستخدم، وإلا عنوان IP */
  const sourceOf = (ctx, deviceId) => (deviceId ? `dev:${deviceId}` : `ip:${ctx?.ip || 'unknown'}`);
  const sourceLabel = (source) => (source.startsWith('dev:') ? 'جهاز سبق الدخول منه' : `العنوان ${source.slice(3)}`);

  function deviceCookieHeader(token) {
    const parts = [`${DEVICE_COOKIE}=${token}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Strict', `Max-Age=${AUTH_POLICY.deviceDays * 86400}`];
    if (config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }

  /** بعد دخول ناجح: تذكر هذا الجهاز لهذا المستخدم (أو تحديث آخر استخدام) وإعادة ضبط الكعكة لتمديد صلاحيتها */
  function rememberDevice(ctx, user, existingId) {
    const t = nowIso();
    const presented = deviceToken(ctx);
    if (existingId && presented) {
      db.run('UPDATE login_devices SET last_used_at = ? WHERE id = ?', t, existingId);
      return deviceCookieHeader(presented);
    }
    // متصفح مشترك يحمل كعكة جهاز لمستخدم آخر: نعيد استخدامها؛ أما قيمة لا نعرفها فلا نعتمدها ونصدر قيمة جديدة
    const known = presented && db.get('SELECT 1 FROM login_devices WHERE token_hash = ?', sha256(presented));
    const tok = known ? presented : randomToken(32);
    db.run(
      'INSERT OR IGNORE INTO login_devices (user_id, token_hash, created_at, last_used_at, user_agent) VALUES (?, ?, ?, ?, ?)',
      user.id,
      sha256(tok),
      t,
      t,
      String(ctx?.req?.headers?.['user-agent'] || '').slice(0, 300),
    );
    db.run('UPDATE login_devices SET last_used_at = ? WHERE user_id = ? AND token_hash = ?', t, user.id, sha256(tok));
    // أحدث 20 جهازًا فقط لكل مستخدم
    db.run(
      'DELETE FROM login_devices WHERE user_id = ? AND id NOT IN (SELECT id FROM login_devices WHERE user_id = ? ORDER BY COALESCE(last_used_at, created_at) DESC, id DESC LIMIT 20)',
      user.id,
      user.id,
    );
    return deviceCookieHeader(tok);
  }

  /** آخر إيقاف ساري لأي مصدر (يُعرض للإدارة في حالة الحساب فقط؛ لا يمنع الدخول من مصدر آخر) */
  function latestLock(userId) {
    return db.value('SELECT MAX(locked_until) FROM login_locks WHERE user_id = ? AND locked_until > ?', userId, nowIso()) ?? null;
  }

  function lockedUntilOf(user, account, source) {
    const t = now().getTime();
    if (user) {
      const r = db.get('SELECT locked_until FROM login_locks WHERE user_id = ? AND source = ?', user.id, source);
      return r?.locked_until && Date.parse(r.locked_until) > t ? Date.parse(r.locked_until) : null;
    }
    const g = ghosts.get(`${account}|${source}`);
    return g && g.lockedUntil > t ? g.lockedUntil : null;
  }

  function lockedError(untilMs) {
    const mins = Math.max(1, Math.ceil((untilMs - now().getTime()) / 60000));
    const err = new ApiError(
      429,
      `تم إيقاف محاولات الدخول من هذا الجهاز أو الشبكة مؤقتًا بسبب محاولات دخول فاشلة متكررة. حاول مرة أخرى بعد ${arabicCount(mins, MINUTE_FORMS)}، أو ادخل من جهاز سبق أن دخلت منه، أو تواصل مع الإدارة.`,
      'rate_limited',
    );
    err.details = { locked_until: new Date(untilMs).toISOString() };
    return err;
  }

  function notifyAdmins(n) {
    try {
      const ids = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((r) => r.id);
      app.notifications.notify(ids, { type: 'security', link: '#/audit', ...n });
    } catch (e) {
      app.log('security notify failed', e);
    }
  }

  /**
   * تسجيل محاولة فاشلة (كلمة مرور أو رمز تحقق) مع إيقاف مصدرها مؤقتًا والتنبيه عند التكرار.
   * source: «ip:<العنوان>» أو «dev:<معرّف الجهاز المعروف>» — الإيقاف يخص هذا المصدر وحده، لا الحساب كله،
   * والمحاولات أثناء الإيقاف تُرفض قبل فحص كلمة المرور فلا تطيل الإيقاف.
   */
  function recordFailure(ctx, user, account, reason, source = sourceOf(ctx, null)) {
    const t = now().getTime();
    if (!user) {
      // أسماء مستخدمين غير موجودة: نفس السلوك تمامًا (في الذاكرة) حتى لا يُعرف وجود الحساب من الإيقاف
      const key = `${account}|${source}`;
      const g = ghosts.get(key) || { count: 0, lockedUntil: 0 };
      g.count += 1;
      if (g.count % AUTH_POLICY.lockAfter === 0) g.lockedUntil = t + lockMinutes(g.count) * 60000;
      ghosts.set(key, g);
      if (ghosts.size > 5000) for (const [k, x] of ghosts) if (x.lockedUntil < t) ghosts.delete(k);
      app.audit.log({ ctx, type: 'auth.login_failed', severity: 'info', summary: `محاولة دخول فاشلة باسم مستخدم غير موجود «${String(account).slice(0, 60)}»`, data: { username: String(account).slice(0, 100), reason: 'unknown_user' } });
      return;
    }
    // n: المحاولات الفاشلة المتتالية على الحساب من كل المصادر (للتنبيه)، f: من هذا المصدر (للإيقاف)
    const n = (Number(user.failed_login_count) || 0) + 1;
    const prev = db.get('SELECT failures FROM login_locks WHERE user_id = ? AND source = ?', user.id, source);
    const f = (Number(prev?.failures) || 0) + 1;
    const lockMins = f % AUTH_POLICY.lockAfter === 0 ? lockMinutes(f) : 0;
    const lock = lockMins ? new Date(t + lockMins * 60000).toISOString() : null;
    db.run(
      `INSERT INTO login_locks (user_id, source, failures, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, source) DO UPDATE SET failures = excluded.failures, locked_until = COALESCE(excluded.locked_until, login_locks.locked_until), updated_at = excluded.updated_at`,
      user.id,
      source,
      f,
      lock,
      nowIso(),
    );
    const patch = { failed_login_count: n, last_failed_login_at: nowIso() };
    if (lock) patch.locked_until = latestLock(user.id);
    db.update('users', user.id, patch);
    const what = reason === '2fa' ? 'رمز تحقق غير صحيح' : 'كلمة مرور غير صحيحة';
    app.audit.log({
      actor: user,
      ctx,
      type: reason === '2fa' ? 'auth.2fa_failed' : 'auth.login_failed',
      severity: 'info',
      summary: `محاولة دخول فاشلة لحساب «${user.username}» (${what}) — المحاولة الفاشلة رقم ${n} على التوالي`,
      data: { username: String(account).slice(0, 100), reason, consecutive_failures: n, source_failures: f, source_kind: source.startsWith('dev:') ? 'device' : 'ip' },
    });
    if (lock) {
      app.audit.log({
        actor: user,
        ctx,
        type: 'auth.lockout',
        severity: 'warning',
        summary: `إيقاف مؤقت لمحاولات الدخول إلى حساب «${user.username}» من ${sourceLabel(source)} لمدة ${arabicCount(lockMins, MINUTE_FORMS)} بعد ${arabicCount(f, ATTEMPTS)} متتالية (يبقى الدخول من الأجهزة المعروفة والمصادر الأخرى متاحًا)`,
        data: { username: user.username, consecutive_failures: n, source_failures: f, source_kind: source.startsWith('dev:') ? 'device' : 'ip', locked_until: lock },
      });
    }
    if (n % AUTH_POLICY.alertEvery === 0) {
      app.audit.log({
        actor: user,
        ctx,
        type: 'auth.login_failed',
        severity: 'critical',
        summary: `تنبيه: ${arabicCount(n, ['محاولة دخول فاشلة', 'محاولتا دخول فاشلتان', 'محاولات دخول فاشلة', 'محاولة دخول فاشلة'])} متتالية لحساب «${user.username}» (${user.name}) — قد تكون محاولة تخمين لكلمة المرور`,
        data: { username: user.username, consecutive_failures: n, alert: true },
      });
      notifyAdmins({
        title: `محاولات دخول فاشلة متكررة لحساب ${user.name}`,
        body: `سُجلت ${arabicCount(n, ['محاولة دخول فاشلة', 'محاولتا دخول فاشلتان', 'محاولات دخول فاشلة', 'محاولة دخول فاشلة'])} متتالية لحساب «${user.username}»، آخرها من العنوان ${ctx?.ip || 'غير معروف'}. تُوقف المحاولات من كل مصدر يكررها مؤقتًا، ويبقى دخول صاحب الحساب من أجهزته المعروفة متاحًا؛ راجع سجل الأمان.`,
      });
    }
  }

  /** إنشاء جلسة جديدة وضبط الكعكة */
  function createSession(ctx, user, method = 'password_only') {
    const token = randomToken(32);
    const created = nowIso();
    const hours = maxSessionHours();
    db.insert('sessions', {
      token_hash: sha256(token),
      user_id: user.id,
      created_at: created,
      expires_at: addHours(created, hours),
      ip: ctx.ip,
      user_agent: String(ctx.req?.headers?.['user-agent'] || '').slice(0, 300),
      public_id: randomToken(9),
      last_seen_at: created,
      auth_method: method,
    });
    // نجاح من هذا المصدر يصفّر محاولاته الفاشلة؛ إيقاف مصدر آخر (مثل عنوان من يخمّن كلمة المرور) يبقى ساريًا
    const deviceId = trustedDeviceId(ctx, user);
    db.run('DELETE FROM login_locks WHERE user_id = ? AND source = ?', user.id, sourceOf(ctx, deviceId));
    const deviceCookie = rememberDevice(ctx, user, deviceId);
    db.update('users', user.id, { last_login_at: created, failed_login_count: 0, locked_until: latestLock(user.id) });
    ctx.res.setHeader('Set-Cookie', [cookieHeader(token, Math.round(hours * 3600)), deviceCookie].filter(Boolean));
    const fresh = db.get('SELECT * FROM users WHERE id = ?', user.id);
    return publicUser(fresh);
  }

  function auditLogin(ctx, user, method) {
    const how = { password_only: 'بكلمة المرور', totp: 'بكلمة المرور ورمز التحقق', recovery: 'بكلمة المرور ورمز استرداد', invite: 'بعد قبول الدعوة' }[method] || '';
    app.audit.log({ actor: user, ctx, type: 'auth.login', severity: 'info', summary: `تسجيل دخول ناجح ${how} — ${describeUserAgent(ctx.req?.headers?.['user-agent']).label}`, data: { method } });
  }

  const svc = {
    publicUser,
    restrictionOf,
    twoFactorEnabled,
    createSession,
    recordFailure,
    notifyAdmins,
    idleHours,
    maxSessionHours,
    /** هل عمر الجلسة مضبوط من الخادم (متغير البيئة) بدل إعدادات لوحة الإدارة */
    sessionTtlFromServer: () => ttlOverride() !== null,

    /**
     * الخطوة الأولى للدخول. يعيد { user } أو { two_factor_required, challenge, expires_at } لحسابات التحقق بخطوتين.
     */
    loginStep(ctx, username, password) {
      const raw = String(username || '').trim().slice(0, 100);
      const account = raw.toLowerCase();
      const user = raw ? db.get('SELECT * FROM users WHERE username = ?', raw) : null;
      // جهاز سبق أن أتم منه هذا المستخدم الدخول: له عداد مستقل، ولا يخضع لحد الحساب العام
      // (فلا يستطيع من يخمّن كلمة المرور من مكان آخر أن يمنع صاحب الحساب من الدخول من جهازه)
      const deviceId = trustedDeviceId(ctx, user);
      const source = sourceOf(ctx, deviceId);
      const key = `${deviceId ? `dev:${deviceId}` : ctx.ip}|${account}`;
      try {
        loginLimiter.hit(key);
        if (!deviceId) accountLimiter.hit(account);
      } catch (err) {
        if (err.firstExceed) {
          app.audit.log({ actor: user ? { id: user.id, name: user.name, username: user.username } : null, ctx, type: 'auth.rate_limited', severity: 'warning', summary: `تجاوز حد محاولات الدخول لاسم المستخدم «${raw.slice(0, 60)}» من العنوان ${ctx.ip}`, data: { username: raw.slice(0, 100) } });
        }
        throw err;
      }
      const locked = lockedUntilOf(user, account, source);
      if (locked) throw lockedError(locked);
      // نتحقق دائمًا من كلمة المرور (scrypt) حتى لو لم يوجد المستخدم أو لم يقبل دعوته بعد (قيمة غير قابلة للاستخدام)،
      // حتى لا يكشف زمن الرد وجود الحساب أو حالته
      const usable = !!user && typeof user.password_hash === 'string' && user.password_hash.startsWith('scrypt$');
      const ok = verifyPassword(password || '', usable ? user.password_hash : DUMMY_HASH) && usable;
      if (!user || !ok) {
        recordFailure(ctx, user, account, 'password', source);
        throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
      }
      if (!user.active) {
        app.audit.log({ actor: user, ctx, type: 'auth.login_failed', severity: 'warning', summary: `محاولة دخول إلى حساب موقوف «${user.username}»`, data: { username: user.username, reason: 'inactive' } });
        throw forbidden('هذا الحساب موقوف، يرجى التواصل مع الإدارة');
      }
      loginLimiter.reset(key);
      if (!deviceId) accountLimiter.reset(account);
      ghosts.delete(`${account}|${source}`);
      if (twoFactorEnabled(user.id)) {
        const challenge = randomToken(32);
        const created = nowIso();
        const expires = new Date(now().getTime() + AUTH_POLICY.challengeMinutes * 60000).toISOString();
        db.tx(() => {
          db.run('DELETE FROM login_challenges WHERE user_id = ? OR expires_at <= ?', user.id, created);
          db.insert('login_challenges', {
            token_hash: sha256(challenge),
            user_id: user.id,
            created_at: created,
            expires_at: expires,
            attempts: 0,
            ip: ctx.ip,
            user_agent: String(ctx.req?.headers?.['user-agent'] || '').slice(0, 300),
          });
        });
        return { two_factor_required: true, challenge, expires_at: expires, max_attempts: AUTH_POLICY.challengeMaxAttempts };
      }
      const pu = createSession(ctx, user, 'password_only');
      auditLogin(ctx, user, 'password_only');
      return { user: pu };
    },

    /** واجهة متوافقة مع الإصدارات السابقة: تعيد المستخدم مباشرة (للحسابات بدون تحقق بخطوتين) */
    login(ctx, username, password) {
      const r = svc.loginStep(ctx, username, password);
      if (r.two_factor_required) throw new ApiError(401, 'هذا الحساب يتطلب رمز التحقق بخطوتين', 'two_factor_required');
      return r.user;
    },

    /** الخطوة الثانية: رمز تطبيق المصادقة أو رمز استرداد */
    loginSecondFactor(ctx, { challenge, code, recovery_code: recoveryCode } = {}) {
      secondFactorLimiter.hit(ctx.ip);
      const c = typeof challenge === 'string' && challenge.length <= 200 ? challenge : '';
      const row = c ? db.get('SELECT * FROM login_challenges WHERE token_hash = ?', sha256(c)) : null;
      if (!row || row.expires_at <= nowIso()) {
        if (row) db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
        throw new ApiError(401, 'انتهت مهلة التحقق، يرجى تسجيل الدخول من جديد', 'challenge_expired');
      }
      const user = db.get('SELECT * FROM users WHERE id = ?', row.user_id);
      if (!user || !user.active) {
        db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
        throw new ApiError(401, 'انتهت مهلة التحقق، يرجى تسجيل الدخول من جديد', 'challenge_expired');
      }
      const source = sourceOf(ctx, trustedDeviceId(ctx, user));
      const locked = lockedUntilOf(user, user.username.toLowerCase(), source);
      if (locked) {
        db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
        throw lockedError(locked);
      }
      const method = app.accounts.verifySecondFactor(user.id, { code, recovery_code: recoveryCode });
      if (!method) {
        const attempts = Number(row.attempts) + 1;
        const exhausted = attempts >= AUTH_POLICY.challengeMaxAttempts;
        if (exhausted) db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
        else db.run('UPDATE login_challenges SET attempts = ? WHERE token_hash = ?', attempts, row.token_hash);
        recordFailure(ctx, user, user.username.toLowerCase(), '2fa', source);
        const lockedNow = lockedUntilOf(user, user.username.toLowerCase(), source);
        if (lockedNow) {
          db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
          throw lockedError(lockedNow);
        }
        if (exhausted) throw new ApiError(401, 'تجاوزت عدد المحاولات المسموح لرمز التحقق، يرجى تسجيل الدخول من جديد', 'challenge_expired');
        const left = AUTH_POLICY.challengeMaxAttempts - attempts;
        throw new ApiError(400, recoveryCode ? 'رمز الاسترداد غير صحيح أو سبق استخدامه' : 'رمز التحقق غير صحيح، تأكد من الرمز الحالي في تطبيق المصادقة', 'invalid_code', { attempts_left: left });
      }
      db.run('DELETE FROM login_challenges WHERE token_hash = ?', row.token_hash);
      const pu = createSession(ctx, user, method);
      auditLogin(ctx, user, method);
      const out = { user: pu };
      if (method === 'recovery') {
        const remaining = app.accounts.recoveryRemaining(user.id);
        out.recovery_codes_remaining = remaining;
        app.audit.log({ actor: user, ctx, type: 'auth.2fa_recovery_used', severity: 'warning', summary: `دخول إلى حساب «${user.username}» برمز استرداد — المتبقي ${arabicCount(remaining, ['رمز واحد', 'رمزان', 'رموز', 'رمزًا'])}`, data: { remaining } });
        app.notifications.notify(user.id, {
          type: 'security',
          title: 'تم الدخول إلى حسابك برمز استرداد',
          body: `استُخدم أحد رموز الاسترداد للدخول إلى حسابك. إن لم تكن أنت فغيّر كلمة المرور فورًا وتواصل مع الإدارة. المتبقي: ${remaining} من 10.`,
          link: '#/account',
        });
      }
      return out;
    },

    logout(ctx) {
      const token = ctx.cookies[SESSION_COOKIE];
      if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
      if (ctx.user) app.audit.log({ actor: ctx.user, ctx, type: 'auth.logout', severity: 'info', summary: 'تسجيل خروج' });
      ctx.res.setHeader('Set-Cookie', cookieHeader('', 0));
    },

    /** المستخدم الحالي من الكعكة (أو null) — مع مهلة عدم النشاط وتحديث آخر نشاط وقيود ما بعد الدخول */
    userFromRequest(ctx) {
      const token = ctx.cookies[SESSION_COOKIE];
      if (!token || token.length > 200) return null;
      const th = sha256(token);
      const row = db.get(
        `SELECT u.*, s.expires_at AS session_expires, s.created_at AS session_created, s.last_seen_at AS session_last_seen,
                s.public_id AS session_public_id, s.auth_method AS session_auth_method
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
        th,
      );
      if (!row) return null;
      const t = now().getTime();
      const nowI = new Date(t).toISOString();
      const lastSeen = Date.parse(row.session_last_seen || row.session_created);
      if (row.session_expires <= nowI || !row.active || t - lastSeen > idleHours() * 3600000) {
        db.run('DELETE FROM sessions WHERE token_hash = ?', th);
        return null;
      }
      // طلبات الخلفية (تحديث الإشعارات الدوري، فحص الجلسة عند العودة للتبويب) ليست نشاطًا من المستخدم:
      // لا تمدّد مهلة عدم النشاط، وإلا بقيت الجلسة حية ما دام التبويب مفتوحًا على جهاز متروك
      const background = String(ctx.req?.headers?.[BACKGROUND_HEADER] || '') === '1';
      if (!background && t - lastSeen > AUTH_POLICY.lastSeenThrottleMs) db.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', nowI, th);
      row.session_token_hash = th;
      row.restricted = restrictionOf(row);
      return row;
    },

    /** إنهاء كل جلسات مستخدم (مع استثناء الجلسة الحالية اختياريًا). يعيد عدد الجلسات المنهاة. */
    revokeUserSessions(userId, { exceptTokenHash = null } = {}) {
      if (exceptTokenHash) return db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, exceptTokenHash).changes;
      // إنهاء كل الجلسات (إيقاف الحساب، كلمة مرور مؤقتة، فقدان الهاتف): تُنسى الأجهزة المعروفة أيضًا
      db.run('DELETE FROM login_devices WHERE user_id = ?', userId);
      return db.run('DELETE FROM sessions WHERE user_id = ?', userId).changes;
    },

    /** رفع الإيقاف المؤقت عن كل مصادر المحاولات لهذا المستخدم (رفع الإيقاف من الإدارة) */
    clearLoginLocks(userId) {
      return db.run('DELETE FROM login_locks WHERE user_id = ?', userId).changes;
    },

    /** المصادر الموقوفة حاليًا لهذا المستخدم (لصفحة الحساب عند الإدارة) */
    loginLocks(userId) {
      return db
        .all('SELECT source, failures, locked_until, updated_at FROM login_locks WHERE user_id = ? AND locked_until > ? ORDER BY locked_until DESC', userId, nowIso())
        .map((r) => ({
          kind: r.source.startsWith('dev:') ? 'device' : 'ip',
          ip: r.source.startsWith('ip:') ? r.source.slice(3) : null,
          failures: Number(r.failures) || 0,
          locked_until: r.locked_until,
          last_attempt_at: r.updated_at,
        }));
    },

    /** عدد الأجهزة المعروفة لهذا المستخدم */
    knownDevices(userId) {
      return Number(db.value('SELECT COUNT(*) FROM login_devices WHERE user_id = ?', userId));
    },

    /** الجلسات النشطة لمستخدم (بدون أي رموز) */
    listSessions(userId, currentTokenHash = null) {
      db.run("UPDATE sessions SET public_id = lower(hex(randomblob(9))) WHERE user_id = ? AND public_id IS NULL", userId);
      const idleMs = idleHours() * 3600000;
      const t = now().getTime();
      return db
        .all('SELECT token_hash, public_id, created_at, expires_at, last_seen_at, ip, user_agent, auth_method FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY COALESCE(last_seen_at, created_at) DESC', userId, nowIso())
        .filter((s) => t - Date.parse(s.last_seen_at || s.created_at) <= idleMs)
        .map((s) => {
          const ua = describeUserAgent(s.user_agent);
          return {
            id: s.public_id,
            current: !!currentTokenHash && s.token_hash === currentTokenHash,
            device: ua.label,
            mobile: ua.mobile,
            user_agent: s.user_agent || null,
            ip: s.ip || null,
            created_at: s.created_at,
            last_seen_at: s.last_seen_at || s.created_at,
            expires_at: s.expires_at,
            idle_expires_at: new Date(Date.parse(s.last_seen_at || s.created_at) + idleMs).toISOString(),
            auth_method: s.auth_method || 'password_only',
          };
        });
    },

    revokeSession(userId, publicId) {
      return db.run('DELETE FROM sessions WHERE user_id = ? AND public_id = ?', userId, String(publicId || '')).changes;
    },

    /** تنظيف دوري: الجلسات المنتهية أو الخاملة، وتحديات الدخول المنتهية */
    purgeExpired() {
      const nowI = nowIso();
      const idleCut = new Date(now().getTime() - idleHours() * 3600000).toISOString();
      const a = db.run('DELETE FROM sessions WHERE expires_at <= ? OR COALESCE(last_seen_at, created_at) < ?', nowI, idleCut).changes;
      const b = db.run('DELETE FROM login_challenges WHERE expires_at <= ?', nowI).changes;
      // عدادات المصادر بعد يوم بلا محاولات (وانتهاء إيقافها)، والأجهزة غير المستخدمة منذ مدة التذكر
      const dayAgo = new Date(now().getTime() - 24 * 3600000).toISOString();
      db.run('DELETE FROM login_locks WHERE updated_at < ? AND (locked_until IS NULL OR locked_until <= ?)', dayAgo, nowI);
      db.run('DELETE FROM login_devices WHERE COALESCE(last_used_at, created_at) < ?', new Date(now().getTime() - AUTH_POLICY.deviceDays * 86400000).toISOString());
      return { sessions: a, challenges: b };
    },
  };
  return svc;
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ===== حراس الصلاحيات =====
const RESTRICTED_MESSAGES = {
  password_change: ['يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام المنصة', 'password_change_required'],
  two_factor_enrollment: ['سياسة المؤسسة تلزم حسابات «إدارة النظام» بتفعيل التحقق بخطوتين قبل متابعة استخدام المنصة', 'two_factor_enrollment_required'],
};

/**
 * المستخدم الحالي أو خطأ 401. الحسابات المقيدة (كلمة مرور مؤقتة، أو إلزام بالتحقق بخطوتين) تُمنع من كل المسارات
 * عدا مسارات الحساب التي تمرر allowRestricted.
 */
export function requireUser(ctx, { allowRestricted = false } = {}) {
  if (!ctx.user) throw unauthorized();
  if (ctx.user.restricted && !allowRestricted) {
    const [msg, code] = RESTRICTED_MESSAGES[ctx.user.restricted] || RESTRICTED_MESSAGES.password_change;
    throw new ApiError(403, msg, code);
  }
  return ctx.user;
}
/** الإدارة: مدير النظام أو مدير الحالات */
export function requireStaff(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin' && u.role !== 'case_manager') throw forbidden('هذه الصفحة متاحة للإدارة فقط');
  return u;
}
export function requireAdmin(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'admin') throw forbidden('هذا الإجراء متاح لدور «إدارة النظام» فقط');
  return u;
}
export function requireLawyer(ctx) {
  const u = requireUser(ctx);
  if (u.role !== 'lawyer') throw forbidden('هذه الصفحة متاحة للمحامين فقط');
  return u;
}
export function isStaff(user) {
  return !!user && (user.role === 'admin' || user.role === 'case_manager');
}
