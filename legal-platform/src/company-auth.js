// الإصدار 10 — دخول مستخدمي الشركات وجلساتهم وأمان حساباتهم (L-14، L-15، L-16، L-17، L-34، L-60).
// مستخدمو الشركات «جهة» منفصلة تمامًا عن users: جدول company_users، جلسات company_sessions، وكعكة bm_csid على المسار
// /api/company فقط (لا تصل أي مسار للإدارة أو المحامين، ولا تصل كعكة الإدارة bm_sid لأي معالج هنا لأنها لا تُقرأ أصلًا).
// الخوارزمية نفسها في src/auth.js (scrypt، كلمة مرور وهمية لمن لا حساب له، إيقاف لكل (حساب، عنوان IP) يتضاعف حتى 4 ساعات،
// عدادات «أشباح» للبريد غير المسجل، التحقق بخطوتين ورموز الاسترداد) مع:
//  - حد لكل بريد (30 محاولة فاشلة في 15 دقيقة من أي عنوان) يُعدّ الفشل فقط: إن امتلأ تُفحص كلمة المرور مع ذلك، فتنجح الصحيحة
//    ويُرد على الخاطئة 429 (CS-3) — فلا يستطيع من يعرف بريد مدير البوابة أن يمنعه من الدخول.
//  - رموز الدعوة وإعادة التعيين (لمرة واحدة، مُجزّأة)، ورابط إعادة التعيين لا يُدخل صاحبه (L-17).
//  - التحقق من نشاط المستخدم ونافذة الشركة المنتهية مع كل طلب (CS-28).
import { hashPassword, verifyPassword, passwordProblem, RateLimiter, describeUserAgent, AUTH_POLICY, BACKGROUND_HEADER } from './auth.js';
import {
  base32Encode,
  newTotpSecret,
  verifyTotp,
  otpauthUri,
  newRecoveryCode,
  hashRecoveryCode,
  verifyRecoveryCode,
  normalizeRecoveryCode,
  createSealer,
  RECOVERY_CODE_COUNT,
} from './totp.js';
import { loadMasterKey } from './services/accounts.js';
import { nowIso, now, addHours, randomToken, sha256, badRequest, unauthorized, notFound, conflict, ApiError, arabicCount, arabicDate, arabicTime, v } from './util.js';
import { LABELS } from './constants.js';
import { companyActor, plainName } from './services/companies.js';

export const COMPANY_COOKIE = 'bm_csid';
export const COMPANY_COOKIE_PATH = '/api/company';
const SETUP_MINUTES = 30;
const RECENT_AUTH_MS = 10 * 60 * 1000;
const MINUTES = ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'];
const SESSIONS = ['جلسة واحدة', 'جلستين', 'جلسات', 'جلسة'];

/** أخطاء الدخول والروابط بنصوص البوابة (فصحى، جمع؛ U10-14/U10-17 مع إعادة الصياغة في §8.3 وL-50) */
export const COMPANY_AUTH_TEXT = Object.freeze({
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  account_inactive: 'هذا الحساب موقوف. تواصلوا مع مديري البوابة في شركتكم.',
  rate_limited: 'محاولات كثيرة خلال وقت قصير. انتظروا قليلًا ثم أعيدوا المحاولة.',
  challenge_expired: 'انتهت مهلة التحقق. سجّلوا الدخول مرة أخرى.',
  unauthorized: 'انتهت الجلسة لحماية بيانات شركتكم. سجّلوا الدخول للمتابعة.',
  password_change_required: 'اختاروا كلمة مرور جديدة للمتابعة.',
  two_factor_enrollment_required: 'شركتكم تشترط التحقق بخطوتين. فعّلوه الآن للمتابعة.',
  read_only: 'حساب شركتكم في وضع الاطلاع فقط؛ لا يمكن إرسال طلبات أو ردود الآن.',
  admins_only: 'هذا الإجراء متاح لمديري البوابة في شركتكم.',
  viewer: 'حسابكم «اطلاع فقط» لا يتيح هذا الإجراء.',
  terms_required: 'يلزم الموافقة على شروط الاستخدام لتفعيل الحساب.',
  password_mismatch: 'كلمتا المرور غير متطابقتين.',
  current_password: 'كلمة المرور الحالية غير صحيحة.',
  ask_team: 'لا يمكن إرسال الرابط بالبريد الآن. اطلبوا من فريقكم القانوني إرسال رابط جديد.',
});

const LINK_ERRORS = {
  invalid: [404, 'link_invalid', 'الرابط غير صحيح. تأكدوا من نسخه كاملًا.'],
  used: [410, 'link_used', 'استُخدم هذا الرابط من قبل. سجّلوا الدخول ببريدكم الإلكتروني.'],
  revoked: [410, 'link_revoked', 'أُلغي هذا الرابط وصدر رابط أحدث. افتحوا آخر رسالة وصلتكم.'],
  expired_invite: [410, 'link_expired', 'انتهت صلاحية رابط الدعوة. اطلبوا دعوة جديدة من مديري البوابة في شركتكم أو من فريقكم القانوني.'],
  expired_reset: [410, 'link_expired', 'انتهت صلاحية الرابط. اطلبوا رابطًا جديدًا من «نسيت كلمة المرور».'],
  inactive: [403, 'account_inactive', COMPANY_AUTH_TEXT.account_inactive],
};
function linkError(kind) {
  const [status, code, msg] = LINK_ERRORS[kind];
  return new ApiError(status, msg, code);
}

/** «م•••@nilefoods.example» */
export function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '•••';
  return `${s[0]}•••${s.slice(at)}`;
}

const DUMMY_HASH = hashPassword('dummy-company-password-for-timing');

export function createCompanyAuth(app) {
  const { db, config } = app;
  const sealer = createSealer(loadMasterKey(config), 'company-totp');
  // حد لكل (عنوان IP، بريد) — يُفحص أولًا
  const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  // خطوة رمز التحقق: لكل عنوان IP
  const secondFactorLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  // روابط الدعوة وإعادة التعيين: لكل عنوان IP (CS-24)
  const tokenLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  // إعادة إثبات الهوية داخل «حسابي والأمان»: لكل مستخدم (CS-24)
  const reauthLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  // «نسيت كلمة المرور»: 5 في الساعة لكل عنوان IP، و3 لكل بريد (بصمت)
  const forgotIpLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 5 });
  const forgotEmailLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
  // CS-3: سلة فشل لكل بريد (أيًا كان العنوان) — تُعدّ الإخفاقات فقط
  const EMAIL_BUCKET = { windowMs: 15 * 60 * 1000, max: 30 };
  const emailFailures = new Map();
  const ghosts = new Map();

  const settingNum = (key, def, min, max) => {
    const n = Number(app.settings.get(key));
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : def;
  };
  const maxSessionHours = () => settingNum('company_session_max_hours', 72, 1, 24 * 90);
  const idleHours = () => Math.min(settingNum('company_session_idle_hours', 12, 0.25, 24 * 30), maxSessionHours());
  const inviteHours = () => settingNum('company_invite_valid_hours', 72, 1, 24 * 14);
  const resetMinutes = () => settingNum('company_reset_valid_minutes', 60, 10, 24 * 60);

  // ───────── سلة الفشل لكل بريد (CS-3) ─────────
  function bucketCount(email) {
    const t = Date.now();
    const arr = (emailFailures.get(email) || []).filter((x) => t - x < EMAIL_BUCKET.windowMs);
    if (arr.length) emailFailures.set(email, arr);
    else emailFailures.delete(email);
    return arr.length;
  }
  function bucketAdd(email) {
    const t = Date.now();
    const arr = (emailFailures.get(email) || []).filter((x) => t - x < EMAIL_BUCKET.windowMs);
    arr.push(t);
    emailFailures.set(email, arr);
    if (emailFailures.size > 10000) for (const [k, a] of emailFailures) if (!a.length || t - a[a.length - 1] > EMAIL_BUCKET.windowMs) emailFailures.delete(k);
  }

  // ───────── الكعكة ─────────
  function cookieHeader(token, maxAgeSeconds) {
    const parts = [`${COMPANY_COOKIE}=${token}`, `Path=${COMPANY_COOKIE_PATH}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
    if (config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }

  // ───────── الحالة ─────────
  function companyRow(id) {
    return db.get('SELECT * FROM companies WHERE id = ?', id);
  }
  function twoFactorEnabled(cuId) {
    return !!db.get('SELECT 1 FROM company_user_2fa WHERE company_user_id = ? AND enabled_at IS NOT NULL AND secret_enc IS NOT NULL', cuId);
  }
  function twoFactorStatus(cuId) {
    const r = db.get('SELECT * FROM company_user_2fa WHERE company_user_id = ?', cuId);
    const enabled = !!(r && r.enabled_at && r.secret_enc);
    const total = Number(db.value('SELECT COUNT(*) FROM company_recovery_codes WHERE company_user_id = ?', cuId));
    const remaining = Number(db.value('SELECT COUNT(*) FROM company_recovery_codes WHERE company_user_id = ? AND used_at IS NULL', cuId));
    return {
      enabled,
      enabled_at: enabled ? r.enabled_at : null,
      recovery_total: enabled ? total : 0,
      recovery_remaining: enabled ? remaining : 0,
      setup_pending: !!(r && r.pending_secret_enc && Date.parse(r.pending_at) + SETUP_MINUTES * 60000 > now().getTime()),
    };
  }
  /** قيود ما بعد الدخول (L-16): كلمة مرور مؤقتة، أو شركة تشترط التحقق بخطوتين ولم يفعّله المستخدم */
  function restrictionOf(cu, company) {
    if (!cu) return null;
    if (cu.must_change_password) return 'password_change';
    if (company && company.require_2fa && !twoFactorEnabled(cu.id)) return 'two_factor_enrollment';
    return null;
  }
  /** شركة موقوفة أو منتهية (داخل نافذة الاطلاع): للاطلاع فقط (L-34) */
  function isReadOnly(company) {
    return !!company && (company.status === 'suspended' || company.status === 'ended');
  }
  /** شركة انتهت بعد نافذة الاطلاع: لا دخول ولا جلسات (B10-09، CS-28) */
  function pastWindow(company) {
    if (!company || company.status !== 'ended') return false;
    const days = settingNum('b2b_ended_readonly_days', 90, 0, 3650);
    const ended = Date.parse(company.ended_at || company.updated_at || '');
    return Number.isFinite(ended) && ended + days * 86400000 <= now().getTime();
  }

  function publicUser(cu, company = null) {
    if (!cu) return null;
    const c = company || companyRow(cu.company_id);
    return {
      id: cu.id,
      name: cu.name,
      email: cu.email,
      job_title: cu.job_title || null,
      role: cu.role,
      role_label: LABELS.company_user_role?.[cu.role] || cu.role,
      billing_contact: !!cu.billing_contact,
      restricted: restrictionOf(cu, c),
      two_factor: twoFactorEnabled(cu.id),
    };
  }
  function publicCompany(company) {
    if (!company) return null;
    if (app.companies?.publicCompany) return app.companies.publicCompany(company);
    return { id: company.id, name: company.name, prefix: company.prefix, status: company.status, read_only: isReadOnly(company) };
  }

  // ───────── السجل ─────────
  function audit(ctx, cu, company, e) {
    app.audit.log({
      actor: cu ? companyActor(cu, company) : null,
      ctx,
      company_id: company?.id ?? cu?.company_id ?? null,
      company_user_id: cu?.id ?? null,
      ...e,
    });
  }
  function activity(cu, company, e) {
    try {
      app.activity.log({ actor: { kind: 'company' }, company_id: company?.id ?? cu?.company_id ?? null, company_user_id: cu?.id ?? null, ...e, data: { actor_name: cu ? companyActor(cu, company).name : null, ...(e.data || {}) } });
    } catch (err) {
      app.log('company activity', err);
    }
  }
  function notifyStaffAdmins(n) {
    try {
      const ids = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((r) => r.id);
      if (ids.length) app.notifications.notify(ids, { type: 'security', link: '#/audit', ...n });
    } catch (e) {
      app.log('company security notify failed', e);
    }
  }

  // ───────── الإيقاف المؤقت لكل (حساب، عنوان IP) ─────────
  const sourceOf = (ctx) => `ip:${ctx?.ip || 'unknown'}`;
  function lockMinutes(failures) {
    const round = Math.max(1, Math.floor(failures / AUTH_POLICY.lockAfter));
    return Math.min(AUTH_POLICY.lockMaxMinutes, AUTH_POLICY.lockBaseMinutes * 2 ** (round - 1));
  }
  function latestLock(cuId) {
    return db.value('SELECT MAX(locked_until) FROM company_login_locks WHERE company_user_id = ? AND locked_until > ?', cuId, nowIso()) ?? null;
  }
  function lockedUntilOf(cu, account, source) {
    const t = now().getTime();
    if (cu) {
      const r = db.get('SELECT locked_until FROM company_login_locks WHERE company_user_id = ? AND source = ?', cu.id, source);
      return r?.locked_until && Date.parse(r.locked_until) > t ? Date.parse(r.locked_until) : null;
    }
    const g = ghosts.get(`${account}|${source}`);
    return g && g.lockedUntil > t ? g.lockedUntil : null;
  }
  function lockedError(untilMs) {
    const mins = Math.max(1, Math.ceil((untilMs - now().getTime()) / 60000));
    const err = new ApiError(429, `تعذر الدخول مؤقتًا بعد محاولات متكررة. حاولوا بعد ${arabicCount(mins, MINUTES)}، أو استخدموا «نسيت كلمة المرور».`, 'locked');
    err.details = { retry_after_minutes: mins, locked_until: new Date(untilMs).toISOString() };
    return err;
  }
  function recordFailure(ctx, cu, account, reason, source = sourceOf(ctx)) {
    const t = now().getTime();
    if (!cu) {
      const key = `${account}|${source}`;
      const g = ghosts.get(key) || { count: 0, lockedUntil: 0 };
      g.count += 1;
      if (g.count % AUTH_POLICY.lockAfter === 0) g.lockedUntil = t + lockMinutes(g.count) * 60000;
      ghosts.set(key, g);
      if (ghosts.size > 5000) for (const [k, x] of ghosts) if (x.lockedUntil < t) ghosts.delete(k);
      app.audit.log({ ctx, type: 'company_auth.login_failed', summary: `محاولة دخول فاشلة لبوابة الشركات ببريد غير مسجل «${String(account).slice(0, 80)}»`, data: { email: String(account).slice(0, 120), reason: 'unknown_user' } });
      return;
    }
    const company = companyRow(cu.company_id);
    const n = (Number(cu.failed_login_count) || 0) + 1;
    const prev = db.get('SELECT failures FROM company_login_locks WHERE company_user_id = ? AND source = ?', cu.id, source);
    const f = (Number(prev?.failures) || 0) + 1;
    const lockMins = f % AUTH_POLICY.lockAfter === 0 ? lockMinutes(f) : 0;
    const lock = lockMins ? new Date(t + lockMins * 60000).toISOString() : null;
    db.run(
      `INSERT INTO company_login_locks (company_user_id, source, failures, locked_until, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(company_user_id, source) DO UPDATE SET failures = excluded.failures, locked_until = COALESCE(excluded.locked_until, company_login_locks.locked_until), updated_at = excluded.updated_at`,
      cu.id,
      source,
      f,
      lock,
      nowIso(),
    );
    const patch = { failed_login_count: n, last_failed_login_at: nowIso() };
    if (lock) patch.locked_until = latestLock(cu.id);
    db.update('company_users', cu.id, patch);
    const what = reason === '2fa' ? 'رمز تحقق غير صحيح' : 'كلمة مرور غير صحيحة';
    audit(ctx, cu, company, {
      type: reason === '2fa' ? 'company_auth.2fa_failed' : 'company_auth.login_failed',
      summary: `محاولة دخول فاشلة لمستخدم شركة «${cu.email}» (${what}) — المحاولة الفاشلة رقم ${n} على التوالي`,
      data: { reason, consecutive_failures: n, source_failures: f },
    });
    if (lock) {
      audit(ctx, cu, company, {
        type: 'company_auth.lockout',
        severity: 'warning',
        summary: `إيقاف مؤقت لدخول «${cu.email}» من العنوان ${source.slice(3)} لمدة ${arabicCount(lockMins, MINUTES)}`,
        data: { consecutive_failures: n, source_failures: f, locked_until: lock },
      });
    }
    if (n % AUTH_POLICY.alertEvery === 0) {
      audit(ctx, cu, company, {
        type: 'company_auth.login_failed',
        severity: 'critical',
        summary: `تنبيه: ${n} محاولة دخول فاشلة متتالية لمستخدم الشركة «${cu.email}» (${company?.name || ''})`,
        data: { consecutive_failures: n, alert: true },
      });
      notifyStaffAdmins({
        title: `محاولات دخول فاشلة متكررة لمستخدم شركة ${company?.name || ''}`,
        body: `سُجلت ${n} محاولة دخول فاشلة متتالية لحساب «${cu.email}» في بوابة الشركات، آخرها من العنوان ${ctx?.ip || 'غير معروف'}. راجع سجل الأمان.`,
      });
    }
  }

  // ───────── الجلسات ─────────
  function createSession(ctx, cu, method = 'password_only') {
    const token = randomToken(32);
    const created = nowIso();
    const hours = maxSessionHours();
    db.insert('company_sessions', {
      token_hash: sha256(token),
      company_user_id: cu.id,
      company_id: cu.company_id,
      public_id: randomToken(9),
      created_at: created,
      expires_at: addHours(created, hours),
      last_seen_at: created,
      idle_hours: null,
      remember: 0,
      auth_method: method,
      ip: ctx.ip,
      user_agent: String(ctx.req?.headers?.['user-agent'] || '').slice(0, 300),
    });
    db.run('DELETE FROM company_login_locks WHERE company_user_id = ? AND source = ?', cu.id, sourceOf(ctx));
    db.update('company_users', cu.id, { last_login_at: created, failed_login_count: 0, locked_until: latestLock(cu.id) });
    ctx.res.setHeader('Set-Cookie', cookieHeader(token, Math.round(hours * 3600)));
    return db.get('SELECT * FROM company_users WHERE id = ?', cu.id);
  }

  /**
   * الجلسة الحالية من كعكة bm_csid أو null. تُحذف الجلسة إن انتهت أو خملت، أو أُوقف المستخدم، أو انتهت نافذة الشركة
   * (CS-28). طلبات الخلفية لا تمدد مهلة عدم النشاط.
   */
  function fromRequest(ctx) {
    if (ctx._company !== undefined) return ctx._company;
    ctx._company = null;
    const token = ctx.cookies?.[COMPANY_COOKIE];
    if (!token || token.length > 200) return null;
    const th = sha256(token);
    const s = db.get('SELECT * FROM company_sessions WHERE token_hash = ?', th);
    if (!s) return null;
    const cu = db.get('SELECT * FROM company_users WHERE id = ?', s.company_user_id);
    const company = cu ? companyRow(cu.company_id) : null;
    const t = now().getTime();
    const nowI = new Date(t).toISOString();
    const lastSeen = Date.parse(s.last_seen_at || s.created_at);
    const idle = Number(s.idle_hours) > 0 ? Number(s.idle_hours) : idleHours();
    if (!cu || !company || s.company_id !== cu.company_id || !cu.active || cu.invite_pending || s.expires_at <= nowI || t - lastSeen > idle * 3600000 || pastWindow(company)) {
      db.run('DELETE FROM company_sessions WHERE token_hash = ?', th);
      return null;
    }
    const background = String(ctx.req?.headers?.[BACKGROUND_HEADER] || '') === '1';
    if (!background && t - lastSeen > AUTH_POLICY.lastSeenThrottleMs) db.run('UPDATE company_sessions SET last_seen_at = ? WHERE token_hash = ?', nowI, th);
    ctx._company = { cu, company, session: { ...s, token_hash: th } };
    return ctx._company;
  }

  /**
   * الحارس الوحيد لمسارات /api/company/* بعد الدخول (L-14، B10-12). roles: أدوار الشركة المسموح بها،
   * write: يُرفض في الشركة الموقوفة أو المنتهية (L-34)، allowRestricted: صفحات الحساب أثناء القيود.
   * يضبط ctx.companyUser وctx.company ولا يقرأ مستخدم فريق المكتب من السياق أبدًا.
   */
  function require(ctx, { roles = null, write = false, allowRestricted = false } = {}) {
    const s = fromRequest(ctx);
    if (!s) throw new ApiError(401, COMPANY_AUTH_TEXT.unauthorized, 'unauthorized');
    const { cu, company } = s;
    const restricted = restrictionOf(cu, company);
    if (restricted && !allowRestricted) {
      throw restricted === 'password_change'
        ? new ApiError(403, COMPANY_AUTH_TEXT.password_change_required, 'password_change_required')
        : new ApiError(403, COMPANY_AUTH_TEXT.two_factor_enrollment_required, 'two_factor_enrollment_required');
    }
    if (roles && !roles.includes(cu.role)) {
      throw new ApiError(403, roles.length === 1 && roles[0] === 'company_admin' ? COMPANY_AUTH_TEXT.admins_only : COMPANY_AUTH_TEXT.viewer, 'forbidden');
    }
    if (write && isReadOnly(company)) throw new ApiError(403, COMPANY_AUTH_TEXT.read_only, 'company_read_only');
    ctx.companyUser = cu;
    ctx.company = company;
    return { cu, company, session: s.session };
  }

  function listSessions(cuId, currentHash = null) {
    const defaultIdleMs = idleHours() * 3600000;
    const t = now().getTime();
    return db
      .all('SELECT * FROM company_sessions WHERE company_user_id = ? AND expires_at > ? ORDER BY COALESCE(last_seen_at, created_at) DESC', cuId, nowIso())
      .filter((s) => t - Date.parse(s.last_seen_at || s.created_at) <= (Number(s.idle_hours) > 0 ? Number(s.idle_hours) * 3600000 : defaultIdleMs))
      .map((s) => {
        const idleMs = Number(s.idle_hours) > 0 ? Number(s.idle_hours) * 3600000 : defaultIdleMs;
        const ua = describeUserAgent(s.user_agent);
        return {
          id: s.public_id,
          current: !!currentHash && s.token_hash === currentHash,
          device: ua.label,
          mobile: ua.mobile,
          user_agent: s.user_agent || null,
          ip: s.ip || null,
          created_at: s.created_at,
          last_seen_at: s.last_seen_at || s.created_at,
          expires_at: s.expires_at,
          idle_expires_at: new Date(Date.parse(s.last_seen_at || s.created_at) + idleMs).toISOString(),
          auth_method: s.auth_method || 'password_only',
          remember: !!s.remember,
        };
      });
  }
  function revokeUserSessions(cuId, { exceptTokenHash = null } = {}) {
    if (exceptTokenHash) return db.run('DELETE FROM company_sessions WHERE company_user_id = ? AND token_hash != ?', cuId, exceptTokenHash).changes;
    return db.run('DELETE FROM company_sessions WHERE company_user_id = ?', cuId).changes;
  }

  // ───────── التحقق بخطوتين ─────────
  function newRecoveryCodes(cuId) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    const t = nowIso();
    db.run('DELETE FROM company_recovery_codes WHERE company_user_id = ?', cuId);
    for (const c of codes) db.insert('company_recovery_codes', { company_user_id: cuId, code_hash: hashRecoveryCode(c), created_at: t });
    return codes;
  }
  const looksLikeTotp = (c) => /^\d{6}$/.test(String(c ?? '').replace(/[\s-]/g, ''));
  /** رمز TOTP (يُرفض تكرار الخطوة نفسها) أو رمز استرداد (يُستهلك) → 'totp' | 'recovery' | null */
  function verifySecondFactor(cuId, { code, recovery_code: recoveryCode } = {}) {
    const row = db.get('SELECT * FROM company_user_2fa WHERE company_user_id = ?', cuId);
    if (!row || !row.enabled_at || !row.secret_enc) return null;
    const hasRecovery = recoveryCode !== undefined && recoveryCode !== null && recoveryCode !== '';
    const input = hasRecovery ? recoveryCode : code;
    if (input === undefined || input === null || input === '' || String(input).length > 64) return null;
    if (hasRecovery || !looksLikeTotp(input)) {
      if (!normalizeRecoveryCode(input)) return null;
      for (const rc of db.all('SELECT id, code_hash FROM company_recovery_codes WHERE company_user_id = ? AND used_at IS NULL', cuId)) {
        if (verifyRecoveryCode(input, rc.code_hash)) {
          const used = db.run('UPDATE company_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', nowIso(), rc.id).changes;
          return used ? 'recovery' : null;
        }
      }
      return null;
    }
    const secret = sealer.open(row.secret_enc);
    if (!secret) return null;
    const step = verifyTotp(secret, input, { ms: now().getTime(), afterStep: row.last_step });
    if (step === null) return null;
    const updated = db.run('UPDATE company_user_2fa SET last_step = ?, updated_at = ? WHERE company_user_id = ? AND (last_step IS NULL OR last_step < ?)', step, nowIso(), cuId, step).changes;
    return updated ? 'totp' : null;
  }

  // ───────── كلمات المرور ─────────
  function fieldError(field, msg) {
    return badRequest(msg, { fields: { [field]: msg } });
  }
  const localPart = (email) => String(email || '').split('@')[0];
  function checkNewPassword(password, confirm, email, field = 'password') {
    if (typeof password !== 'string' || !password) throw fieldError(field, 'اكتبوا كلمة المرور الجديدة.');
    const problem = passwordProblem(password, { username: localPart(email) });
    if (problem) throw fieldError(field, problem);
    if (confirm !== undefined && confirm !== password) throw fieldError(`${field}_confirm`, COMPANY_AUTH_TEXT.password_mismatch);
    return password;
  }
  function checkCurrentPassword(cu, password, field = 'password') {
    reauthLimiter.hit(`cu${cu.id}`);
    if (typeof password !== 'string' || !password) throw fieldError(field, 'اكتبوا كلمة المرور الحالية للتأكيد.');
    if (!verifyPassword(password, cu.password_hash)) throw fieldError(field, COMPANY_AUTH_TEXT.current_password);
    reauthLimiter.reset(`cu${cu.id}`);
  }

  // ───────── روابط الدعوة وإعادة التعيين ─────────
  function baseUrl(ctx) {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    const origin = ctx?.req?.headers?.origin;
    if (origin && origin !== 'null') return String(origin).replace(/\/+$/, '');
    const host = ctx?.req?.headers?.host;
    return host ? `http://${host}` : '';
  }
  /**
   * رمز جديد (يلغي الرموز المفتوحة من النوع نفسه). by = { kind: 'staff'|'company'|'self'|'seed', user_id?, company_user_id? }.
   * الرمز نفسه لا يُحفظ إلا مُجزّأً، ويُعاد هنا مرة واحدة.
   */
  function issueToken(kind, cuId, by = {}, { validMinutes = null } = {}) {
    const token = randomToken(32);
    const t = nowIso();
    const minutes = validMinutes ?? (kind === 'invite' ? inviteHours() * 60 : resetMinutes());
    const expires = new Date(Date.parse(t) + minutes * 60000).toISOString();
    const id = db.tx(() => {
      db.run('UPDATE company_account_tokens SET revoked_at = ? WHERE company_user_id = ? AND kind = ? AND used_at IS NULL AND revoked_at IS NULL', t, cuId, kind);
      return db.insert('company_account_tokens', {
        kind,
        token_hash: sha256(token),
        company_user_id: cuId,
        created_by_kind: by.kind || 'staff',
        created_by_user_id: by.user_id ?? null,
        created_by_company_user_id: by.company_user_id ?? null,
        created_at: t,
        expires_at: expires,
      });
    });
    return { id, token, expires_at: expires };
  }
  const linkUrl = (base, kind, token) => `${base}/company#/${kind}/${token}`;
  function revokeOpenTokens(cuId, kinds = ['invite', 'reset']) {
    const t = nowIso();
    let n = 0;
    for (const k of kinds) n += db.run('UPDATE company_account_tokens SET revoked_at = ? WHERE company_user_id = ? AND kind = ? AND used_at IS NULL AND revoked_at IS NULL', t, cuId, k).changes;
    return n;
  }
  function findToken(raw, kind = null) {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 200) throw linkError('invalid');
    const row = db.get('SELECT * FROM company_account_tokens WHERE token_hash = ?', sha256(raw));
    if (!row || (kind && row.kind !== kind)) throw linkError('invalid');
    const cu = db.get('SELECT * FROM company_users WHERE id = ?', row.company_user_id);
    if (!cu) throw linkError('invalid');
    if (row.used_at) throw linkError('used');
    if (row.revoked_at) throw linkError('revoked');
    if (row.expires_at <= nowIso()) throw linkError(row.kind === 'invite' ? 'expired_invite' : 'expired_reset');
    if (!cu.active) throw linkError('inactive');
    if (row.kind === 'invite' && !cu.invite_pending) throw linkError('used');
    if (row.kind === 'reset' && cu.invite_pending) throw linkError('invalid');
    return { row, cu, company: companyRow(cu.company_id) };
  }

  /** نص «حتى الأحد 11 أكتوبر 2026 الساعة 3:20 مساءً» */
  const untilText = (iso) => `${arabicDate(iso)} الساعة ${arabicTime(iso)}`;

  /**
   * دعوة مستخدم (أو إعادة إصدارها). يرسلها بالبريد إن أمكن، ويعيد الرابط مرة واحدة لمن أصدرها حين لا يُرسل بالبريد.
   * by: { kind: 'staff'|'company'|'seed', user_id?, company_user_id?, name? } — اسم الداعي من الشركة يظهر في الرسالة.
   */
  function sendInvite(ctx, cu, company, by) {
    const tok = issueToken('invite', cu.id, by);
    const url = linkUrl(baseUrl(ctx), 'invite', tok.token);
    let emailed = false;
    if (app.email?.enabled?.()) {
      const r = app.email.send('invite', {
        to: cu.email,
        name: cu.name,
        company,
        companyUserId: cu.id,
        vars: { inviter: by.kind === 'company' && by.name ? by.name : null, until: untilText(tok.expires_at) },
        secretLink: linkUrl(app.email.linkBase(), 'invite', tok.token),
        security: true,
      });
      emailed = !!r && !['skipped', 'failed'].includes(r.status);
    }
    return { url: emailed ? null : url, expires_at: tok.expires_at, emailed };
  }

  /** رابط إعادة تعيين: من الإدارة (نسخة لمرة واحدة 24 ساعة، ويُرسل بالبريد أيضًا إن أمكن)، أو من مدير البوابة (بالبريد فقط؛ L-60) */
  function sendReset(ctx, cu, company, by) {
    const staff = by.kind === 'staff';
    const tok = issueToken('reset', cu.id, by, { validMinutes: staff ? 24 * 60 : resetMinutes() });
    const url = linkUrl(baseUrl(ctx), 'reset', tok.token);
    let emailed = false;
    if (app.email?.enabled?.()) {
      const r = app.email.send('reset', {
        to: cu.email,
        name: cu.name,
        company,
        companyUserId: cu.id,
        vars: { until: untilText(tok.expires_at) },
        secretLink: linkUrl(app.email.linkBase(), 'reset', tok.token),
        security: true,
      });
      emailed = !!r && !['skipped', 'failed'].includes(r.status);
    }
    return { url: staff && !emailed ? url : null, expires_at: tok.expires_at, emailed };
  }

  // ───────── الواجهة ─────────
  const svc = {
    COMPANY_COOKIE,
    cookieHeader,
    fromRequest,
    require,
    publicUser,
    publicCompany,
    restrictionOf,
    twoFactorEnabled,
    twoFactorStatus,
    isReadOnly,
    pastWindow,
    idleHours,
    maxSessionHours,
    listSessions,
    revokeUserSessions,
    revokeOpenTokens,
    verifySecondFactor,
    sendInvite,
    sendReset,
    issueToken,
    maskEmail,
    audit,
    activity,
    passwordHash: (p) => hashPassword(p),
    checkNewPassword,
    newRecoveryCodes,

    /** للاختبارات والبيانات التجريبية: تفعيل التحقق بخطوتين بسر معروف */
    seedEnableTwoFactor(cuId, secretBuf) {
      const t = nowIso();
      return db.tx(() => {
        db.run(
          `INSERT INTO company_user_2fa (company_user_id, secret_enc, enabled_at, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(company_user_id) DO UPDATE SET secret_enc = excluded.secret_enc, enabled_at = excluded.enabled_at, pending_secret_enc = NULL, pending_at = NULL, updated_at = excluded.updated_at`,
          cuId,
          sealer.seal(secretBuf),
          t,
          t,
        );
        return newRecoveryCodes(cuId);
      });
    },

    // ===== الدخول =====
    login(ctx, body = {}) {
      const account = String(body.email || '').trim().toLowerCase().slice(0, 200);
      const password = typeof body.password === 'string' ? body.password : '';
      const cu = account ? db.get('SELECT * FROM company_users WHERE email = ?', account) : null;
      const source = sourceOf(ctx);
      const key = `${ctx.ip}|${account}`;
      try {
        loginLimiter.hit(key);
      } catch (err) {
        if (err.firstExceed) {
          const company = cu ? companyRow(cu.company_id) : null;
          audit(ctx, cu, company, { type: 'company_auth.rate_limited', severity: 'warning', summary: `تجاوز حد محاولات الدخول لبوابة الشركات بالبريد «${account.slice(0, 80)}» من العنوان ${ctx.ip}`, data: { email: account.slice(0, 120) } });
        }
        throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
      }
      const emailBucketFull = account ? bucketCount(account) >= EMAIL_BUCKET.max : false;
      const locked = lockedUntilOf(cu, account, source);
      if (locked) throw lockedError(locked);
      // نتحقق دائمًا (scrypt) حتى لبريد غير مسجل أو دعوة لم تُقبل، فلا يكشف زمن الرد وجود الحساب
      const usable = !!cu && !cu.invite_pending && typeof cu.password_hash === 'string' && cu.password_hash.startsWith('scrypt$');
      const ok = verifyPassword(password, usable ? cu.password_hash : DUMMY_HASH) && usable;
      if (!ok) {
        if (account) bucketAdd(account);
        recordFailure(ctx, cu, account, 'password', source);
        if (emailBucketFull) throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
        throw new ApiError(401, COMPANY_AUTH_TEXT.invalid_credentials, 'invalid_credentials');
      }
      const company = companyRow(cu.company_id);
      if (!cu.active) {
        audit(ctx, cu, company, { type: 'company_auth.login_failed', severity: 'warning', summary: `محاولة دخول إلى حساب شركة موقوف «${cu.email}»`, data: { reason: 'inactive' } });
        throw new ApiError(403, COMPANY_AUTH_TEXT.account_inactive, 'account_inactive');
      }
      if (pastWindow(company)) {
        audit(ctx, cu, company, { type: 'company_auth.login_failed', severity: 'info', summary: `محاولة دخول بعد انتهاء اشتراك الشركة «${company.name}»`, data: { reason: 'company_ended' } });
        throw new ApiError(403, `انتهى اشتراك شركتكم. تواصلوا مع فريق ${app.companies?.brandIsolated?.() || 'المكتب'} لتجديده.`, 'company_ended');
      }
      loginLimiter.reset(key);
      ghosts.delete(`${account}|${source}`);
      if (twoFactorEnabled(cu.id)) {
        const challenge = randomToken(32);
        const created = nowIso();
        const expires = new Date(now().getTime() + AUTH_POLICY.challengeMinutes * 60000).toISOString();
        db.tx(() => {
          db.run('DELETE FROM company_login_challenges WHERE company_user_id = ? OR expires_at <= ?', cu.id, created);
          db.insert('company_login_challenges', {
            token_hash: sha256(challenge),
            company_user_id: cu.id,
            created_at: created,
            expires_at: expires,
            attempts: 0,
            remember: 0,
            ip: ctx.ip,
            user_agent: String(ctx.req?.headers?.['user-agent'] || '').slice(0, 300),
          });
        });
        return { two_factor_required: true, challenge, expires_at: expires, max_attempts: AUTH_POLICY.challengeMaxAttempts };
      }
      const fresh = createSession(ctx, cu, 'password_only');
      audit(ctx, fresh, company, { type: 'company_auth.login', summary: `دخول إلى بوابة الشركات بكلمة المرور — ${describeUserAgent(ctx.req?.headers?.['user-agent']).label}`, data: { method: 'password_only' } });
      return { user: publicUser(fresh, company), company: publicCompany(company) };
    },

    loginSecondFactor(ctx, body = {}) {
      try {
        secondFactorLimiter.hit(ctx.ip);
      } catch {
        throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
      }
      const c = typeof body.challenge === 'string' && body.challenge.length <= 200 ? body.challenge : '';
      const row = c ? db.get('SELECT * FROM company_login_challenges WHERE token_hash = ?', sha256(c)) : null;
      const expired = () => new ApiError(410, COMPANY_AUTH_TEXT.challenge_expired, 'challenge_expired');
      if (!row || row.expires_at <= nowIso()) {
        if (row) db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
        throw expired();
      }
      const cu = db.get('SELECT * FROM company_users WHERE id = ?', row.company_user_id);
      const company = cu ? companyRow(cu.company_id) : null;
      if (!cu || !cu.active || !company || pastWindow(company)) {
        db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
        throw expired();
      }
      const source = sourceOf(ctx);
      const locked = lockedUntilOf(cu, cu.email, source);
      if (locked) {
        db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
        throw lockedError(locked);
      }
      const method = verifySecondFactor(cu.id, { code: body.code, recovery_code: body.recovery_code });
      if (!method) {
        const attempts = Number(row.attempts) + 1;
        const exhausted = attempts >= AUTH_POLICY.challengeMaxAttempts;
        if (exhausted) db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
        else db.run('UPDATE company_login_challenges SET attempts = ? WHERE token_hash = ?', attempts, row.token_hash);
        recordFailure(ctx, cu, cu.email, '2fa', source);
        const lockedNow = lockedUntilOf(cu, cu.email, source);
        if (lockedNow) {
          db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
          throw lockedError(lockedNow);
        }
        if (exhausted) throw expired();
        const left = AUTH_POLICY.challengeMaxAttempts - attempts;
        const leftText = left === 1 ? 'تبقّت محاولة واحدة' : left === 2 ? 'تبقّت محاولتان' : `تبقّى ${left} محاولات`;
        // 400 لا 401 (CS-27): الواجهة لا تعدّها انتهاء جلسة
        throw new ApiError(400, `الرمز غير صحيح أو انتهت صلاحيته. ${leftText}.`, 'invalid_code', { attempts_left: left });
      }
      db.run('DELETE FROM company_login_challenges WHERE token_hash = ?', row.token_hash);
      const fresh = createSession(ctx, cu, method);
      audit(ctx, fresh, company, { type: 'company_auth.login', summary: `دخول إلى بوابة الشركات بكلمة المرور ${method === 'recovery' ? 'ورمز استرداد' : 'ورمز التحقق'} — ${describeUserAgent(ctx.req?.headers?.['user-agent']).label}`, data: { method } });
      const out = { user: publicUser(fresh, company), company: publicCompany(company) };
      if (method === 'recovery') {
        const remaining = Number(db.value('SELECT COUNT(*) FROM company_recovery_codes WHERE company_user_id = ? AND used_at IS NULL', cu.id));
        out.recovery_codes_remaining = remaining;
        audit(ctx, fresh, company, { type: 'company_auth.2fa_recovery_used', severity: 'warning', summary: `دخول مستخدم شركة «${cu.email}» برمز استرداد — المتبقي ${remaining}`, data: { remaining } });
      }
      return out;
    },

    logout(ctx) {
      const s = fromRequest(ctx);
      const token = ctx.cookies?.[COMPANY_COOKIE];
      if (token && token.length <= 200) db.run('DELETE FROM company_sessions WHERE token_hash = ?', sha256(token));
      if (s) audit(ctx, s.cu, s.company, { type: 'company_auth.logout', summary: 'خروج من بوابة الشركات' });
      // المسار نفسه الذي ضُبطت عليه الكعكة، وإلا بقيت في المتصفح
      ctx.res.setHeader('Set-Cookie', cookieHeader('', 0));
      return { ok: true };
    },

    /** حالة الجلسة (لا 401 أبدًا) */
    session(ctx) {
      const s = fromRequest(ctx);
      if (!s) return { user: null, company: null };
      const idle = Number(s.session.idle_hours) > 0 ? Number(s.session.idle_hours) : idleHours();
      return {
        user: publicUser(s.cu, s.company),
        company: publicCompany(s.company),
        session: { expires_at: s.session.expires_at, idle_hours: idle, last_seen_at: s.session.last_seen_at || s.session.created_at },
      };
    },

    // ===== الروابط =====
    inspectLink(ctx, token) {
      try {
        tokenLimiter.hit(ctx.ip);
      } catch {
        throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
      }
      const { row, cu, company } = findToken(token);
      let inviter = { kind: 'team' };
      if (row.kind === 'invite' && row.created_by_kind === 'company' && row.created_by_company_user_id) {
        const by = db.get('SELECT name FROM company_users WHERE id = ? AND company_id = ?', row.created_by_company_user_id, cu.company_id);
        if (by) inviter = { kind: 'colleague', name: by.name };
      }
      return {
        kind: row.kind,
        expires_at: row.expires_at,
        user: { name: cu.name, email_masked: maskEmail(cu.email) },
        company: { name: company?.name || '' },
        inviter,
        terms_url: row.kind === 'invite' ? String(app.settings.get('b2b_terms_url') || '') || null : undefined,
      };
    },

    acceptInvite(ctx, body = {}) {
      try {
        tokenLimiter.hit(ctx.ip);
      } catch {
        throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
      }
      const { row, cu, company } = findToken(body.token, 'invite');
      // L-34 / CS-28: لا ينضم مستخدمون جدد لشركة موقوفة أو منتهية
      if (isReadOnly(company) || pastWindow(company)) throw new ApiError(403, COMPANY_AUTH_TEXT.read_only, 'company_read_only');
      const name = plainName(body.name ?? cu.name, 'الاسم', { required: true, min: 3, max: 120, plural: true });
      const password = checkNewPassword(body.password, body.password_confirm, cu.email);
      if (body.accept_terms !== true) throw fieldError('accept_terms', COMPANY_AUTH_TEXT.terms_required);
      const t = nowIso();
      db.tx(() => {
        db.update('company_users', cu.id, { name, password_hash: hashPassword(password), invite_pending: 0, must_change_password: 0, password_changed_at: t, terms_accepted_at: t, failed_login_count: 0, locked_until: null, updated_at: t });
        db.run('UPDATE company_account_tokens SET used_at = ?, used_ip = ? WHERE id = ?', t, ctx.ip, row.id);
        db.run("UPDATE company_account_tokens SET revoked_at = ? WHERE company_user_id = ? AND kind = 'invite' AND used_at IS NULL AND revoked_at IS NULL", t, cu.id);
      });
      revokeUserSessions(cu.id);
      const fresh = createSession(ctx, db.get('SELECT * FROM company_users WHERE id = ?', cu.id), 'invite');
      audit(ctx, fresh, company, { type: 'company_auth.invite_accepted', summary: `قبول دعوة بوابة الشركات وتفعيل حساب «${fresh.email}» (${company.name})`, data: { renamed: name !== cu.name } });
      // مَن دعاه: مدير البوابة في الشركة (إشعار في البوابة) أو فريق المكتب (إشعار للإدارة)
      try {
        if (row.created_by_kind === 'company' && row.created_by_company_user_id) {
          app.companyNotify?.notify([row.created_by_company_user_id], { companyId: company.id, type: 'team.invite_accepted', title: `فعّل ${fresh.name} حسابه على البوابة`, link: '#/team' });
        } else if (row.created_by_kind === 'staff') {
          app.notifications.notifyStaff({ type: 'company.user_activated', title: `فعّل ${fresh.name} حسابه في بوابة ${company.name}`, link: `#/companies/${company.id}` }, { caseManagerId: company.account_manager_id });
        }
      } catch (e) {
        app.log('company invite accepted notify', e);
      }
      return { user: publicUser(fresh, company), company: publicCompany(company) };
    },

    /** «نسيت كلمة المرور»: الرد نفسه دائمًا؛ رابط بالبريد فقط إن وُجد حساب نشط والبريد مُعدّ (B10-07) */
    forgot(ctx, body = {}) {
      const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
      const reply = { ok: true };
      try {
        forgotIpLimiter.hit(ctx.ip);
        if (email) forgotEmailLimiter.hit(email);
      } catch {
        return reply;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply;
      const cu = db.get('SELECT * FROM company_users WHERE email = ?', email);
      if (!cu || !cu.active || cu.invite_pending) return reply;
      const company = companyRow(cu.company_id);
      if (!company || pastWindow(company)) return reply;
      if (!app.email?.enabled?.()) return reply;
      sendReset(ctx, cu, company, { kind: 'self', company_user_id: cu.id });
      audit(ctx, cu, company, { type: 'company_auth.reset_requested', summary: `طلب رابط تعيين كلمة المرور من «نسيت كلمة المرور» لحساب «${cu.email}»` });
      return reply;
    },

    /** تعيين كلمة مرور جديدة من الرابط: لا يُدخل صاحبه (L-17)، وينهي كل جلساته */
    resetPassword(ctx, body = {}) {
      try {
        tokenLimiter.hit(ctx.ip);
      } catch {
        throw new ApiError(429, COMPANY_AUTH_TEXT.rate_limited, 'rate_limited');
      }
      const { row, cu, company } = findToken(body.token, 'reset');
      const password = checkNewPassword(body.password, body.password_confirm, cu.email);
      const t = nowIso();
      db.tx(() => {
        db.update('company_users', cu.id, { password_hash: hashPassword(password), must_change_password: 0, password_changed_at: t, failed_login_count: 0, locked_until: null, updated_at: t });
        db.run('UPDATE company_account_tokens SET used_at = ?, used_ip = ? WHERE id = ?', t, ctx.ip, row.id);
        db.run("UPDATE company_account_tokens SET revoked_at = ? WHERE company_user_id = ? AND kind = 'reset' AND used_at IS NULL AND revoked_at IS NULL", t, cu.id);
        db.run('DELETE FROM company_login_locks WHERE company_user_id = ?', cu.id);
      });
      const revoked = revokeUserSessions(cu.id);
      audit(ctx, cu, company, { type: 'company_auth.password_reset', severity: 'warning', summary: `تعيين كلمة مرور «${cu.email}» عبر الرابط${revoked ? ` وإنهاء ${arabicCount(revoked, SESSIONS)}` : ''}`, data: { sessions_revoked: revoked } });
      app.companyNotify?.security(cu, company, 'password_changed');
      return { ok: true, email: cu.email, two_factor_enabled: twoFactorEnabled(cu.id) };
    },

    // ===== حسابي =====
    me(ctx, cu, company) {
      const s = fromRequest(ctx);
      return {
        user: {
          ...publicUser(cu, company),
          phone: cu.phone || null,
          email_pref: cu.email_pref,
          created_at: cu.created_at,
          last_login_at: cu.last_login_at || null,
          password_changed_at: cu.password_changed_at || null,
          terms_accepted_at: cu.terms_accepted_at || null,
        },
        company: publicCompany(company),
        two_factor: twoFactorStatus(cu.id),
        sessions_count: listSessions(cu.id).length,
        current_session: s ? { id: s.session.public_id, auth_method: s.session.auth_method || 'password_only', created_at: s.session.created_at } : null,
        policy: { idle_hours: idleHours(), max_hours: maxSessionHours(), require_2fa: !!company.require_2fa, password_min_length: 8 },
        email_enabled: !!app.email?.enabled?.(),
      };
    },

    updateMe(ctx, cu, company, body = {}) {
      const patch = {};
      if (body.name !== undefined) patch.name = plainName(body.name, 'الاسم', { required: true, min: 3, max: 120, plural: true });
      if (body.job_title !== undefined) patch.job_title = plainName(body.job_title, 'الوظيفة', { max: 120, plural: true });
      if (body.phone !== undefined) patch.phone = v.phone(body.phone, 'رقم الهاتف');
      if (body.email_pref !== undefined) patch.email_pref = v.oneOf(body.email_pref, ['all', 'important', 'none'], 'رسائل البريد الإلكتروني', { required: true });
      const changed = Object.keys(patch).filter((k) => (patch[k] ?? null) !== (cu[k] ?? null));
      if (changed.length) {
        db.update('company_users', cu.id, { ...Object.fromEntries(changed.map((k) => [k, patch[k]])), updated_at: nowIso() });
        activity(cu, company, { type: 'company_user.profile_updated', summary: `عدّل ${cu.name} بياناته في البوابة`, data: { fields: changed } });
      }
      return svc.me(ctx, db.get('SELECT * FROM company_users WHERE id = ?', cu.id), company);
    },

    changePassword(ctx, cu, company, body = {}) {
      checkCurrentPassword(cu, body.current_password, 'current_password');
      const next = checkNewPassword(body.password ?? body.new_password, body.password_confirm ?? body.new_password_confirm, cu.email, body.password !== undefined ? 'password' : 'new_password');
      if (verifyPassword(next, cu.password_hash)) throw fieldError(body.password !== undefined ? 'password' : 'new_password', 'كلمة المرور الجديدة يجب أن تختلف عن الحالية.');
      const wasTemporary = !!cu.must_change_password;
      db.update('company_users', cu.id, { password_hash: hashPassword(next), must_change_password: 0, password_changed_at: nowIso(), updated_at: nowIso() });
      const s = fromRequest(ctx);
      const revoked = revokeUserSessions(cu.id, { exceptTokenHash: s?.session?.token_hash || null });
      audit(ctx, cu, company, { type: 'company_auth.password_changed', summary: `${wasTemporary ? 'استبدال كلمة المرور المؤقتة' : 'تغيير كلمة المرور'} لحساب «${cu.email}»${revoked ? ` وإنهاء ${arabicCount(revoked, SESSIONS)} على أجهزة أخرى` : ''}`, data: { sessions_revoked: revoked } });
      app.companyNotify?.security(cu, company, 'password_changed');
      const fresh = db.get('SELECT * FROM company_users WHERE id = ?', cu.id);
      return { ok: true, other_sessions_revoked: revoked, user: publicUser(fresh, company) };
    },

    setupTwoFactor(ctx, cu, company, body = {}) {
      if (twoFactorStatus(cu.id).enabled) throw conflict('التحقق بخطوتين مفعّل بالفعل لحسابكم.');
      const s = fromRequest(ctx);
      const recent = s && now().getTime() - Date.parse(s.session.created_at) < RECENT_AUTH_MS;
      if (!recent || body.password) checkCurrentPassword(cu, body.password, 'password');
      const secret = newTotpSecret();
      const b32 = base32Encode(secret);
      const t = nowIso();
      db.run(
        `INSERT INTO company_user_2fa (company_user_id, pending_secret_enc, pending_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(company_user_id) DO UPDATE SET pending_secret_enc = excluded.pending_secret_enc, pending_at = excluded.pending_at, updated_at = excluded.updated_at`,
        cu.id,
        sealer.seal(secret),
        t,
        t,
      );
      // L-04: نفس إعداد اسم الجهة في تطبيق المصادقة لفريق المكتب
      const issuer = String(app.settings.get('security_totp_issuer') || app.settings.get('brand_short_name') || 'Legal').slice(0, 60);
      return {
        secret: b32,
        secret_groups: b32.match(/.{1,4}/g),
        otpauth_uri: otpauthUri({ secretB32: b32, account: cu.email, issuer }),
        issuer,
        account: cu.email,
        expires_at: new Date(Date.parse(t) + SETUP_MINUTES * 60000).toISOString(),
      };
    },

    enableTwoFactor(ctx, cu, company, body = {}) {
      const row = db.get('SELECT * FROM company_user_2fa WHERE company_user_id = ?', cu.id);
      if (row && row.enabled_at && row.secret_enc) throw conflict('التحقق بخطوتين مفعّل بالفعل لحسابكم.');
      if (!row || !row.pending_secret_enc) throw badRequest('ابدؤوا إعداد التحقق بخطوتين أولًا.');
      if (Date.parse(row.pending_at) + SETUP_MINUTES * 60000 < now().getTime()) throw badRequest('انتهت مهلة الإعداد. ابدؤوا الإعداد من جديد.');
      const secret = sealer.open(row.pending_secret_enc);
      if (!secret) throw badRequest('تعذرت قراءة إعداد التحقق. ابدؤوا الإعداد من جديد.');
      reauthLimiter.hit(`2fa-enable:${cu.id}`);
      const step = verifyTotp(secret, body.code, { ms: now().getTime() });
      if (step === null) throw fieldError('code', 'رمز التحقق غير صحيح. تأكدوا من ضبط الوقت تلقائيًا في الهاتف واكتبوا الرمز الظاهر حاليًا في التطبيق.');
      reauthLimiter.reset(`2fa-enable:${cu.id}`);
      const t = nowIso();
      const codes = db.tx(() => {
        db.run('UPDATE company_user_2fa SET secret_enc = pending_secret_enc, enabled_at = ?, pending_secret_enc = NULL, pending_at = NULL, last_step = ?, updated_at = ? WHERE company_user_id = ?', t, step, t, cu.id);
        return newRecoveryCodes(cu.id);
      });
      audit(ctx, cu, company, { type: 'company_auth.2fa_enabled', summary: `تفعيل التحقق بخطوتين لحساب «${cu.email}» وإصدار ${codes.length} رموز استرداد` });
      return { enabled: true, recovery_codes: codes, user: publicUser(cu, company), two_factor: twoFactorStatus(cu.id) };
    },

    disableTwoFactor(ctx, cu, company, body = {}) {
      if (!twoFactorStatus(cu.id).enabled) throw conflict('التحقق بخطوتين غير مفعّل لحسابكم.');
      if (company.require_2fa) throw new ApiError(409, 'شركتكم تشترط التحقق بخطوتين.', 'company_requires_2fa');
      checkCurrentPassword(cu, body.password, 'password');
      if (!verifySecondFactor(cu.id, { code: body.code })) throw fieldError('code', 'رمز التحقق أو رمز الاسترداد غير صحيح.');
      db.tx(() => {
        db.run('DELETE FROM company_user_2fa WHERE company_user_id = ?', cu.id);
        db.run('DELETE FROM company_recovery_codes WHERE company_user_id = ?', cu.id);
      });
      audit(ctx, cu, company, { type: 'company_auth.2fa_disabled', severity: 'warning', summary: `إلغاء التحقق بخطوتين لحساب «${cu.email}»` });
      app.companyNotify?.security(cu, company, 'two_factor_disabled');
      return { enabled: false, two_factor: twoFactorStatus(cu.id) };
    },

    regenerateRecoveryCodes(ctx, cu, company, body = {}) {
      if (!twoFactorStatus(cu.id).enabled) throw conflict('فعّلوا التحقق بخطوتين أولًا.');
      checkCurrentPassword(cu, body.password, 'password');
      if (!verifySecondFactor(cu.id, { code: body.code })) throw fieldError('code', 'رمز التحقق أو رمز الاسترداد غير صحيح.');
      const codes = db.tx(() => newRecoveryCodes(cu.id));
      audit(ctx, cu, company, { type: 'company_auth.recovery_codes_regenerated', severity: 'warning', summary: `إصدار رموز استرداد جديدة لحساب «${cu.email}» (أُبطلت الرموز السابقة)` });
      return { recovery_codes: codes, two_factor: twoFactorStatus(cu.id) };
    },

    mySessions(ctx, cu) {
      const s = fromRequest(ctx);
      return { items: listSessions(cu.id, s?.session?.token_hash || null), idle_hours: idleHours(), max_hours: maxSessionHours() };
    },
    revokeMySession(ctx, cu, company, publicId) {
      const s = fromRequest(ctx);
      const row = db.get('SELECT token_hash, user_agent, ip FROM company_sessions WHERE company_user_id = ? AND public_id = ?', cu.id, String(publicId || ''));
      if (!row) throw notFound('الجلسة غير موجودة أو انتهت بالفعل.');
      if (row.token_hash === s?.session?.token_hash) throw badRequest('هذه جلستكم الحالية؛ استخدموا «تسجيل الخروج» لإنهائها.');
      db.run('DELETE FROM company_sessions WHERE company_user_id = ? AND public_id = ?', cu.id, String(publicId));
      audit(ctx, cu, company, { type: 'company_auth.session_revoked', summary: `إنهاء جلسة على ${describeUserAgent(row.user_agent).label}${row.ip ? ` (${row.ip})` : ''}` });
      return svc.mySessions(ctx, cu);
    },
    revokeMyOtherSessions(ctx, cu, company) {
      const s = fromRequest(ctx);
      const n = revokeUserSessions(cu.id, { exceptTokenHash: s?.session?.token_hash || null });
      if (n) audit(ctx, cu, company, { type: 'company_auth.sessions_revoked', summary: `تسجيل الخروج من كل الأجهزة الأخرى (${arabicCount(n, SESSIONS)})`, data: { count: n } });
      return { revoked: n, ...svc.mySessions(ctx, cu) };
    },

    /** تنظيف دوري (مهمة b2b.cleanup): الجلسات والتحديات المنتهية، الرموز القديمة، عدادات الإيقاف القديمة */
    purgeExpired() {
      const nowI = nowIso();
      const idleCut = new Date(now().getTime() - idleHours() * 3600000).toISOString();
      const a = db.run(
        `DELETE FROM company_sessions WHERE expires_at <= ?
           OR (idle_hours IS NULL AND COALESCE(last_seen_at, created_at) < ?)
           OR (idle_hours IS NOT NULL AND (julianday(?) - julianday(COALESCE(last_seen_at, created_at))) * 24 > idle_hours)`,
        nowI,
        idleCut,
        nowI,
      ).changes;
      const b = db.run('DELETE FROM company_login_challenges WHERE expires_at <= ?', nowI).changes;
      const monthAgo = new Date(now().getTime() - 30 * 86400000).toISOString();
      const c = db.run('DELETE FROM company_account_tokens WHERE (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at <= ?) AND created_at < ?', nowI, monthAgo).changes;
      const dayAgo = new Date(now().getTime() - 86400000).toISOString();
      const d = db.run('DELETE FROM company_login_locks WHERE updated_at < ? AND (locked_until IS NULL OR locked_until <= ?)', dayAgo, nowI).changes;
      return { sessions: a, challenges: b, tokens: c, locks: d };
    },

    /** للاختبارات: تفريغ العدادات في الذاكرة */
    _resetLimiters() {
      emailFailures.clear();
      ghosts.clear();
    },
  };
  return svc;
}
