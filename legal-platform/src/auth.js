// المصادقة: تجزئة كلمات المرور (scrypt)، الجلسات عبر كعكة HttpOnly، تحديد معدل المحاولات، وحراس الصلاحيات.
import crypto from 'node:crypto';
import { randomToken, sha256, nowIso, addHours, unauthorized, forbidden, tooMany } from './util.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_COOKIE = 'bm_sid';

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

/** شروط كلمة المرور: 8 أحرف على الأقل */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف';
  if (password.length > 200) return 'كلمة المرور أطول من المسموح';
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
    if (arr.length > this.max) throw tooMany();
  }
  reset(key) {
    this.hits.delete(key);
  }
}

export function createAuth(app) {
  const { db, config } = app;
  const loginLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  // حد ثانٍ لكل حساب أيًا كان عنوان IP، حتى لا يُخمَّن كلمة مرور حساب واحد بتدوير العناوين
  const accountLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });

  function cookieHeader(token, maxAgeSeconds) {
    const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (config.cookieSecure) parts.push('Secure');
    return parts.join('; ');
  }

  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, role: u.role, name: u.name, username: u.username, email: u.email || null };
  }

  return {
    publicUser,

    login(ctx, username, password) {
      const account = String(username || '').trim().toLowerCase();
      const key = `${ctx.ip}|${account}`;
      loginLimiter.hit(key);
      accountLimiter.hit(account);
      const user = db.get('SELECT * FROM users WHERE username = ?', String(username || '').trim());
      // نتحقق دائمًا من كلمة المرور حتى لو لم يوجد المستخدم لتقليل تسريب المعلومات عبر التوقيت
      const ok = verifyPassword(password || '', user ? user.password_hash : DUMMY_HASH);
      if (!user || !ok) throw unauthorized('اسم المستخدم أو كلمة المرور غير صحيحة');
      if (!user.active) throw forbidden('هذا الحساب موقوف، يرجى التواصل مع الإدارة');
      loginLimiter.reset(key);
      accountLimiter.reset(account);
      const token = randomToken(32);
      const created = nowIso();
      db.insert('sessions', {
        token_hash: sha256(token),
        user_id: user.id,
        created_at: created,
        expires_at: addHours(created, config.sessionTtlHours),
        ip: ctx.ip,
        user_agent: String(ctx.req.headers['user-agent'] || '').slice(0, 300),
      });
      db.update('users', user.id, { last_login_at: created });
      ctx.res.setHeader('Set-Cookie', cookieHeader(token, Math.round(config.sessionTtlHours * 3600)));
      return publicUser(user);
    },

    logout(ctx) {
      const token = ctx.cookies[SESSION_COOKIE];
      if (token) db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
      ctx.res.setHeader('Set-Cookie', cookieHeader('', 0));
    },

    /** المستخدم الحالي من الكعكة (أو null) */
    userFromRequest(ctx) {
      const token = ctx.cookies[SESSION_COOKIE];
      if (!token || token.length > 200) return null;
      const row = db.get(
        `SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
        sha256(token),
      );
      if (!row) return null;
      if (row.session_expires <= nowIso() || !row.active) {
        db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
        return null;
      }
      return row;
    },

    revokeUserSessions(userId) {
      db.run('DELETE FROM sessions WHERE user_id = ?', userId);
    },

    purgeExpired() {
      db.run('DELETE FROM sessions WHERE expires_at <= ?', nowIso());
    },
  };
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

// ===== حراس الصلاحيات =====
export function requireUser(ctx) {
  if (!ctx.user) throw unauthorized();
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
  if (u.role !== 'admin') throw forbidden('هذا الإجراء متاح لمدير النظام فقط');
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
