// الحسابات والأمان: الدعوات وروابط إعادة تعيين كلمة المرور (للاستخدام مرة واحدة)، كلمات المرور المؤقتة،
// التحقق بخطوتين (TOTP + رموز الاسترداد)، الملف الشخصي، الجلسات، وسجل الأمان (عرض وتصفية وتصدير CSV).
// (الإصدار 9 — وحدة accounts)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  v,
  nowIso,
  now,
  addHours,
  randomToken,
  sha256,
  badRequest,
  notFound,
  conflict,
  ApiError,
  arabicCount,
  arabicDate,
  arabicTime,
  cairoParts,
  parseJson,
} from '../util.js';
import { LABELS } from '../constants.js';
import { hashPassword, verifyPassword, passwordProblem, describeUserAgent, RateLimiter, UNUSABLE_PASSWORD } from '../auth.js';
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
} from '../totp.js';

const CODES = ['رمز واحد', 'رمزان', 'رموز', 'رمزًا'];
// صيغة المجرور/المضاف إليه («وإنهاء جلستين») وصيغة الرفع للعدد المستقل بين قوسين («(جلستان)»)
const SESSIONS = ['جلسة واحدة', 'جلستين', 'جلسات', 'جلسة'];
const SESSIONS_NOM = ['جلسة واحدة', 'جلستان', 'جلسات', 'جلسة'];
/** مهلة إكمال إعداد التحقق بخطوتين بعد عرض الرمز */
const SETUP_MINUTES = 30;
/** «إثبات حديث للهوية»: جلسة أُنشئت خلال هذه المدة لا تحتاج إعادة كلمة المرور لبدء إعداد التحقق بخطوتين */
const RECENT_AUTH_MS = 10 * 60 * 1000;

/** المفتاح الرئيسي للمنصة (نفس مصدر مفتاح أسرار التكاملات): APP_SECRET أو data/.secret-key */
function loadMasterKey(config) {
  const fromEnv = process.env.APP_SECRET || config.appSecret;
  if (fromEnv && String(fromEnv).length >= 32) return crypto.createHash('sha256').update(String(fromEnv)).digest();
  const dir = config.dataDir || path.dirname(config.dbPath || '.');
  const file = path.join(dir, '.secret-key');
  try {
    if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const k = crypto.randomBytes(32);
    fs.writeFileSync(file, k.toString('hex'), { mode: 0o600 });
    return k;
  } catch {
    return crypto.randomBytes(32);
  }
}

/** خلية CSV آمنة (مع منع حقن الصيغ في برامج الجداول) */
function csvCell(x) {
  let s = x === null || x === undefined ? '' : String(x);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function cairoStamp(iso) {
  const p = cairoParts(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function createAccounts(app) {
  const { db, config } = app;
  const sealer = createSealer(loadMasterKey(config), 'totp');
  // روابط الدعوة وإعادة التعيين (فحص الرابط واستخدامه) — لكل عنوان IP
  const tokenLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
  // التحقق من كلمة المرور الحالية داخل صفحة الحساب — لكل مستخدم
  const reauthLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

  const settingNum = (key, def, min, max) => {
    const n = Number(app.settings.get(key));
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : def;
  };
  const roleLabel = (r) => LABELS.user_role?.[r] || r;
  const typeLabel = (t) => LABELS.security_event?.[t] || t;
  const orgName = () => app.settings.get('org_legal_name') || `مؤسسة ${app.settings.get('org_name') || 'بيوت مصر'}`;

  function userRow(id) {
    const u = db.get('SELECT * FROM users WHERE id = ?', Number(id));
    if (!u) throw notFound('المستخدم غير موجود');
    return u;
  }
  function lawyerTitle(userId) {
    return db.get('SELECT title FROM lawyers WHERE user_id = ?', userId)?.title || null;
  }
  function displayName(u) {
    const t = u.role === 'lawyer' ? lawyerTitle(u.id) : null;
    return `${t ? `${t} ` : ''}${u.name}`;
  }
  const who = (u) => `${u.name} (${u.username})`;

  function audit(e) {
    app.audit.log(e);
  }
  function notifyAdmins(n, { exceptUserId = null } = {}) {
    const ids = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((r) => r.id).filter((x) => x !== exceptUserId);
    if (ids.length) app.notifications.notify(ids, { type: 'security', link: '#/audit', ...n });
  }

  /** حساب جديد بدور «إدارة النظام» يعادل منح الصلاحيات الكاملة: حدث حرج وتنبيه لبقية مديري النظام (مثل الترقية إلى الدور) */
  function alertNewAdmin(u, actor) {
    if (u.role !== 'admin') return;
    notifyAdmins(
      { title: `أُنشئ حساب جديد بصلاحية «إدارة النظام»: ${u.name}`, body: `أنشأ ${actor?.name || 'أحد المسؤولين'} حساب «${u.username}» بصلاحيات «إدارة النظام» الكاملة. إن لم يكن ذلك مقصودًا فأوقف الحساب وراجع سجل الأمان فورًا.` },
      { exceptUserId: actor?.id ?? null },
    );
  }

  function fieldError(field, msg) {
    return badRequest(msg, { fields: { [field]: msg } });
  }
  function checkNewPassword(password, confirm, username, field = 'password') {
    if (typeof password !== 'string' || !password) throw fieldError(field, 'كلمة المرور الجديدة مطلوبة');
    const problem = passwordProblem(password, { username });
    if (problem) throw fieldError(field, problem);
    if (confirm !== undefined && confirm !== password) throw fieldError(`${field}_confirm`, 'كلمتا المرور غير متطابقتين');
    return password;
  }
  function checkCurrentPassword(u, password, field = 'password') {
    reauthLimiter.hit(`u${u.id}`);
    if (typeof password !== 'string' || !password) throw fieldError(field, 'أدخل كلمة المرور الحالية للتأكيد');
    if (!verifyPassword(password, u.password_hash)) throw fieldError(field, 'كلمة المرور الحالية غير صحيحة');
    reauthLimiter.reset(`u${u.id}`);
  }

  // ===================== الروابط ذات الاستخدام الواحد (الدعوة وإعادة التعيين) =====================
  function validHours(kind) {
    return kind === 'invite' ? settingNum('invite_valid_hours', 72, 1, 24 * 14) : settingNum('reset_valid_hours', 24, 1, 24 * 7);
  }

  function issueToken(kind, userId, actor) {
    const token = randomToken(32);
    const t = nowIso();
    const expires = addHours(t, validHours(kind));
    const id = db.tx(() => {
      const prev = db.get('SELECT id FROM account_tokens WHERE user_id = ? AND kind = ? ORDER BY id DESC LIMIT 1', userId, kind);
      db.run('UPDATE account_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL AND revoked_at IS NULL', t, actor?.id ?? null, userId, kind);
      return db.insert('account_tokens', {
        kind,
        token_hash: sha256(token),
        user_id: userId,
        created_by: actor?.id ?? null,
        created_at: t,
        expires_at: expires,
        reissue_of: prev?.id ?? null,
      });
    });
    return { id, token, expires_at: expires };
  }

  function baseUrl(ctx) {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    const origin = ctx?.req?.headers?.origin;
    if (origin && origin !== 'null') return origin.replace(/\/+$/, '');
    const host = ctx?.req?.headers?.host;
    return host ? `http://${host}` : '';
  }

  function messageFor(kind, u, url, expiresAt) {
    const until = `${arabicDate(expiresAt)} الساعة ${arabicTime(expiresAt)}`;
    if (kind === 'invite') {
      const role =
        u.role === 'lawyer' ? 'ضمن شبكة المحامين المتعاونين مع برنامج الدعم القانوني' : u.role === 'admin' ? 'بصلاحية «إدارة النظام» في منصة الدعم القانوني' : 'ضمن فريق إدارة الحالات في منصة الدعم القانوني';
      return [
        `السلام عليكم ${displayName(u)}،`,
        `يسعد ${orgName()} انضمامكم ${role}.`,
        `لتفعيل حسابكم واختيار كلمة المرور الخاصة بكم يُرجى فتح الرابط التالي، وهو صالح للاستخدام مرة واحدة حتى ${until}:`,
        url,
        `اسم المستخدم: ${u.username}`,
      ].join('\n');
    }
    return [
      `السلام عليكم ${displayName(u)}،`,
      `أصدرت إدارة ${orgName()} رابطًا لإعادة تعيين كلمة مرور حسابكم على منصة الدعم القانوني (اسم المستخدم: ${u.username}).`,
      `الرابط صالح للاستخدام مرة واحدة حتى ${until}:`,
      url,
      'إن لم تطلبوا ذلك فيُرجى إبلاغ الإدارة فورًا.',
    ].join('\n');
  }

  /** بيانات الرابط للإدارة: الرابط الكامل، نص الرسالة، ورابط wa.me (لهاتف المستخدم إن كان معروفًا) */
  function linkPayload(kind, u, tok, ctx) {
    const url = `${baseUrl(ctx)}/app#/${kind}/${tok.token}`;
    const message = messageFor(kind, u, url, tok.expires_at);
    const digits = String(u.phone || '').replace(/\D/g, '');
    return {
      kind,
      url,
      expires_at: tok.expires_at,
      valid_hours: validHours(kind),
      message,
      whatsapp_url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
      phone_known: !!digits,
      user: { id: u.id, name: u.name, display_name: displayName(u), username: u.username, role: u.role },
    };
  }

  const LINK_ERRORS = {
    invalid: [404, 'link_invalid', 'الرابط غير صالح. تأكد من نسخه كاملًا، أو اطلب رابطًا جديدًا من الإدارة.'],
    used: [410, 'link_used', 'استُخدم هذا الرابط من قبل ولا يمكن استخدامه مرة أخرى. إن احتجت رابطًا جديدًا فاطلبه من الإدارة.'],
    revoked: [410, 'link_revoked', 'ألغت الإدارة هذا الرابط. اطلب رابطًا جديدًا إن لزم الأمر.'],
    expired: [410, 'link_expired', 'انتهت صلاحية هذا الرابط. اطلب من الإدارة إرسال رابط جديد.'],
    inactive: [403, 'account_inactive', 'هذا الحساب موقوف، يرجى التواصل مع الإدارة.'],
  };
  function linkError(kind) {
    const [status, code, msg] = LINK_ERRORS[kind];
    return new ApiError(status, msg, code);
  }

  function findToken(raw, kind) {
    if (typeof raw !== 'string' || raw.length < 20 || raw.length > 200) throw linkError('invalid');
    const row = db.get(
      `SELECT t.*, u.name, u.username, u.role, u.active, u.invite_pending, u.phone
       FROM account_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`,
      sha256(raw),
    );
    if (!row || (kind && row.kind !== kind)) throw linkError('invalid');
    if (row.used_at) throw linkError('used');
    if (row.revoked_at) throw linkError('revoked');
    if (row.expires_at <= nowIso()) throw linkError('expired');
    if (!row.active) throw linkError('inactive');
    if (row.kind === 'invite' && !row.invite_pending) throw linkError('used');
    return row;
  }

  function inviteState(userId) {
    const t = db.get(
      `SELECT t.*, c.name AS created_by_name FROM account_tokens t LEFT JOIN users c ON c.id = t.created_by
       WHERE t.user_id = ? AND t.kind = 'invite' ORDER BY t.id DESC LIMIT 1`,
      userId,
    );
    if (!t) return null;
    const reissues = Number(db.value("SELECT COUNT(*) FROM account_tokens WHERE user_id = ? AND kind = 'invite'", userId)) - 1;
    const status = t.used_at ? 'accepted' : t.revoked_at ? 'revoked' : t.expires_at <= nowIso() ? 'expired' : 'active';
    return { status, created_at: t.created_at, expires_at: t.expires_at, used_at: t.used_at, revoked_at: t.revoked_at, created_by_name: t.created_by_name || null, reissued: Math.max(0, reissues) };
  }
  function resetState(userId) {
    const t = db.get("SELECT * FROM account_tokens WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1", userId, nowIso());
    return t ? { status: 'active', created_at: t.created_at, expires_at: t.expires_at } : null;
  }

  // ===================== التحقق بخطوتين =====================
  function twoFactorRow(userId) {
    return db.get('SELECT * FROM user_2fa WHERE user_id = ?', userId);
  }
  function twoFactorStatus(userId) {
    const r = twoFactorRow(userId);
    const enabled = !!(r && r.enabled_at && r.secret_enc);
    const total = Number(db.value('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id = ?', userId));
    const remaining = Number(db.value('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL', userId));
    return {
      enabled,
      enabled_at: enabled ? r.enabled_at : null,
      recovery_total: enabled ? total : 0,
      recovery_remaining: enabled ? remaining : 0,
      setup_pending: !!(r && r.pending_secret_enc && Date.parse(r.pending_at) + SETUP_MINUTES * 60000 > now().getTime()),
    };
  }
  function newRecoveryCodes(userId) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    const t = nowIso();
    db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', userId);
    for (const c of codes) db.insert('user_recovery_codes', { user_id: userId, code_hash: hashRecoveryCode(c), created_at: t });
    return codes;
  }
  const looksLikeTotp = (c) => /^\d{6}$/.test(String(c ?? '').replace(/[\s-]/g, ''));

  /** إلغاء رابط اشتراك التقويم لحساب (وحدة practice) مع تسجيله؛ يعيد true إن وُجد رابط */
  function revokeCalendarFeed(userId, actor, ctx, reason) {
    try {
      return !!app.practice?.calendar?.revokeFeedFor?.(userId, actor, ctx, reason);
    } catch (e) {
      app.log('calendar feed revoke failed', e);
      return false;
    }
  }

  // ===================== حالة الحساب =====================
  function stateOf(u) {
    if (!u.active) return 'inactive';
    if (u.invite_pending) return 'invite_pending';
    if (u.locked_until && Date.parse(u.locked_until) > now().getTime()) return 'locked';
    if (u.must_change_password) return 'must_change';
    return 'active';
  }
  function sessionsCount(userId) {
    return app.auth.listSessions(userId).length;
  }
  function accountSummary(u) {
    const tf = twoFactorStatus(u.id);
    return {
      id: u.id,
      role: u.role,
      name: u.name,
      display_name: displayName(u),
      username: u.username,
      email: u.email || null,
      phone: u.phone || null,
      active: !!u.active,
      state: stateOf(u),
      invite_pending: !!u.invite_pending,
      password_change_required: !!u.must_change_password,
      locked_until: u.locked_until && Date.parse(u.locked_until) > now().getTime() ? u.locked_until : null,
      failed_login_count: Number(u.failed_login_count) || 0,
      last_failed_login_at: u.last_failed_login_at || null,
      two_factor_enabled: tf.enabled,
      recovery_remaining: tf.recovery_remaining,
      sessions: sessionsCount(u.id),
      // رابط اشتراك التقويم (يعمل بلا دخول): حالته فقط، بلا الرمز
      calendar_feed: app.practice?.calendar?.feedInfo ? app.practice.calendar.feedInfo(u.id) : { active: false },
      created_at: u.created_at,
      last_login_at: u.last_login_at || null,
      password_changed_at: u.password_changed_at || null,
      confidentiality_pledged_at: u.confidentiality_pledged_at || null,
      invite: u.invite_pending ? inviteState(u.id) : null,
      reset_link: resetState(u.id),
    };
  }

  // ===================== سجل الأمان =====================
  function auditWhere(f = {}) {
    const where = ['1=1'];
    const params = [];
    const type = v.str(f.type, 'النوع', { max: 80 });
    if (type) {
      where.push('(e.type = ? OR e.type LIKE ?)');
      params.push(type, `${type}.%`);
    }
    const severity = v.oneOf(f.severity || null, ['info', 'warning', 'critical'], 'درجة الخطورة');
    if (severity) {
      where.push('e.severity = ?');
      params.push(severity);
    }
    if (f.min_severity === 'warning') where.push("e.severity IN ('warning','critical')");
    const userId = v.int(f.user_id, 'المستخدم', { min: 1 });
    if (userId) {
      where.push("(e.user_id = ? OR json_extract(CASE WHEN json_valid(e.data) THEN e.data END, '$.target_user_id') = ?)");
      params.push(userId, userId);
    }
    const q = v.str(f.q, 'نص البحث', { max: 200 });
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      where.push("(e.summary LIKE ? ESCAPE '\\' OR e.actor_name LIKE ? ESCAPE '\\' OR e.ip LIKE ? ESCAPE '\\' OR e.data LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    const from = v.iso(f.from, 'من تاريخ');
    const to = v.iso(f.to, 'إلى تاريخ');
    if (from) {
      where.push('e.created_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('e.created_at <= ?');
      params.push(to);
    }
    return { sql: `FROM security_events e LEFT JOIN users u ON u.id = e.user_id WHERE ${where.join(' AND ')}`, params };
  }
  function mapEvent(r) {
    const ua = r.user_agent ? describeUserAgent(r.user_agent) : null;
    return {
      id: r.id,
      type: r.type,
      type_label: typeLabel(r.type),
      severity: r.severity,
      user_id: r.user_id,
      actor_name: r.user_name || r.actor_name || null,
      actor_role: r.user_role || null,
      actor_username: r.user_username || null,
      ip: r.ip || null,
      device: ua ? ua.label : null,
      summary: r.summary,
      data: parseJson(r.data, null),
      created_at: r.created_at,
    };
  }

  const svc = {
    stateOf,
    twoFactorStatus,

    // ===================== إنشاء الحسابات بالدعوة =====================
    /**
     * إنشاء محامٍ (kind='lawyer') أو مستخدم إدارة (kind='staff') بدون كلمة مرور، مع رابط دعوة صالح 72 ساعة افتراضيًا.
     * يعيد بيانات الحساب المنشأ + invite { url, expires_at, message, whatsapp_url }.
     */
    createInvitedUser(kind, body, actor, ctx) {
      // كلمة مرور عشوائية تمر بقواعد الإنشاء ثم تُستبدل بقيمة غير قابلة للاستخدام حتى قبول الدعوة
      const placeholder = `${randomToken(24)}9a`;
      const created = kind === 'lawyer' ? app.lawyers.create({ ...body, password: placeholder }, actor) : app.lawyers.createStaff({ ...body, password: placeholder });
      db.update('users', created.id, { password_hash: UNUSABLE_PASSWORD, invite_pending: 1, must_change_password: 0 });
      const u = userRow(created.id);
      const tok = issueToken('invite', u.id, actor);
      audit({ actor, ctx, type: 'user.created', severity: u.role === 'admin' ? 'critical' : 'info', summary: `إنشاء حساب ${roleLabel(u.role)} جديد: ${who(u)} (بدعوة)`, data: { target_user_id: u.id, role: u.role, method: 'invite' } });
      alertNewAdmin(u, actor);
      audit({ actor, ctx, type: 'account.invite_created', summary: `إصدار دعوة تفعيل لحساب ${who(u)} صالحة حتى ${arabicDate(tok.expires_at)}`, data: { target_user_id: u.id, expires_at: tok.expires_at } });
      return { ...created, invite_pending: true, state: 'invite_pending', invite: linkPayload('invite', u, tok, ctx) };
    },

    /** بعد إنشاء حساب بكلمة مرور (المسار القديم): تسجيل الحدث، ووسم كلمة المرور بأنها مؤقتة عند الطلب */
    onUserCreated(userId, actor, ctx, { temporary = false } = {}) {
      const u = userRow(userId);
      if (temporary) db.update('users', u.id, { must_change_password: 1 });
      alertNewAdmin(u, actor);
      audit({ actor, ctx, type: 'user.created', severity: u.role === 'admin' ? 'critical' : 'info', summary:`إنشاء حساب ${roleLabel(u.role)} جديد: ${who(u)}${temporary ? ' بكلمة مرور مؤقتة' : ''}`, data: { target_user_id: u.id, role: u.role, method: temporary ? 'temporary_password' : 'password' } });
    },

    /**
     * يغلّف تعديلات الإدارة على حسابات المستخدمين ويسجل الفروق في سجل الأمان:
     * التفعيل/الإيقاف، تغيير الدور، تعديل البيانات، وتعيين كلمة مرور (تصبح مؤقتة يلزم تغييرها عند أول دخول).
     */
    audited(userId, actor, ctx, fn, { temporaryPassword = true } = {}) {
      const before = db.get('SELECT * FROM users WHERE id = ?', userId);
      const result = fn();
      if (!before) return result;
      const after = db.get('SELECT * FROM users WHERE id = ?', userId);
      if (!after) return result;
      // تغيير الدور أو إيقاف الحساب: رابط التقويم صدر بنطاق الدور السابق فيُلغى (يصدر المستخدم رابطًا جديدًا عند الحاجة)
      if (before.role !== after.role || (before.active && !after.active)) {
        revokeCalendarFeed(after.id, actor, ctx, before.role !== after.role ? 'تغيير دور الحساب' : 'إيقاف الحساب');
      }
      if (!!before.active !== !!after.active) {
        audit({
          actor,
          ctx,
          type: after.active ? 'user.activated' : 'user.deactivated',
          severity: after.active ? 'info' : 'warning',
          summary: `${after.active ? 'إعادة تفعيل' : 'إيقاف'} حساب ${who(after)}${after.active ? '' : ' وإنهاء جلساته'}`,
          data: { target_user_id: after.id, role: after.role },
        });
      }
      if (before.role !== after.role) {
        const elevated = after.role === 'admin';
        audit({
          actor,
          ctx,
          type: 'user.role_changed',
          severity: elevated ? 'critical' : 'warning',
          summary: `تغيير دور ${who(after)} من «${roleLabel(before.role)}» إلى «${roleLabel(after.role)}»`,
          data: { target_user_id: after.id, from: before.role, to: after.role },
        });
        if (elevated) {
          notifyAdmins(
            { title: `مُنح ${after.name} صلاحية «إدارة النظام»`, body: `منح ${actor?.name || 'أحد المسؤولين'} صلاحيات «إدارة النظام» الكاملة لحساب «${after.username}». إن لم يكن ذلك مقصودًا فراجع الحساب فورًا.` },
            { exceptUserId: actor?.id },
          );
        }
      }
      const FIELD_LABELS = { name: 'الاسم', email: 'البريد الإلكتروني', phone: 'رقم الموبايل' };
      const changed = Object.keys(FIELD_LABELS).filter((k) => (before[k] || null) !== (after[k] || null));
      if (changed.length) {
        audit({ actor, ctx, type: 'user.updated', summary: `تعديل بيانات حساب ${who(after)}: ${changed.map((k) => FIELD_LABELS[k]).join('، ')}`, data: { target_user_id: after.id, fields: changed } });
      }
      if (before.password_hash !== after.password_hash) {
        if (actor && after.id !== actor.id && temporaryPassword) {
          db.tx(() => {
            db.update('users', after.id, { must_change_password: 1, invite_pending: 0, failed_login_count: 0, locked_until: null, password_changed_at: nowIso() });
            db.run('UPDATE account_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL', nowIso(), actor.id, after.id);
          });
          audit({ actor, ctx, type: 'account.temp_password_set', severity: 'warning', summary: `تعيين كلمة مرور مؤقتة لحساب ${who(after)} (يلزمه تغييرها عند أول دخول) وإنهاء جلساته`, data: { target_user_id: after.id } });
        } else {
          db.update('users', after.id, { password_changed_at: nowIso() });
          audit({ actor, ctx, type: 'account.password_changed', summary: `تغيير كلمة مرور حساب ${who(after)}`, data: { target_user_id: after.id } });
        }
      }
      return result;
    },

    // ===================== إدارة حسابات المستخدمين (مدير النظام) =====================
    listAccounts({ role = null, state = null } = {}) {
      const roles = role === 'staff' ? ['admin', 'case_manager'] : role ? [role] : ['admin', 'case_manager', 'lawyer'];
      const rows = db.all(`SELECT * FROM users WHERE role IN (${roles.map(() => '?').join(',')}) ORDER BY active DESC, role, name`, ...roles);
      let items = rows.map(accountSummary);
      if (state) items = items.filter((x) => x.state === state);
      return {
        items,
        counts: {
          total: items.length,
          invite_pending: items.filter((x) => x.invite_pending && x.active).length,
          locked: items.filter((x) => x.state === 'locked').length,
          without_2fa_admins: items.filter((x) => x.role === 'admin' && x.active && !x.invite_pending && !x.two_factor_enabled).length,
        },
      };
    },

    /** الدعوات المعلقة (محامون وإدارة) مع حالة آخر رابط */
    pendingInvites() {
      return db
        .all("SELECT * FROM users WHERE invite_pending = 1 AND active = 1 ORDER BY created_at DESC")
        .map((u) => ({ id: u.id, role: u.role, name: u.name, display_name: displayName(u), username: u.username, phone: u.phone || null, created_at: u.created_at, invite: inviteState(u.id) }));
    },

    accountDetail(userId) {
      const u = userRow(userId);
      return {
        ...accountSummary(u),
        session_list: app.auth.listSessions(u.id),
        // المصادر الموقوفة مؤقتًا (الإيقاف يخص المصدر الذي تكررت منه المحاولات، لا الحساب كله)
        login_locks: app.auth.loginLocks ? app.auth.loginLocks(u.id) : [],
        known_devices: app.auth.knownDevices ? app.auth.knownDevices(u.id) : 0,
        recent_events: svc.auditList({ user_id: u.id, page_size: 10 }).items,
      };
    },

    resendInvite(userId, actor, ctx) {
      const u = userRow(userId);
      if (!u.invite_pending) throw conflict('فعّل هذا المستخدم حسابه بالفعل؛ استخدم «رابط إعادة تعيين كلمة المرور» إن احتاج إلى ذلك');
      if (!u.active) throw conflict('الحساب موقوف؛ فعّله أولًا ثم أعد إرسال الدعوة');
      const tok = issueToken('invite', u.id, actor);
      audit({ actor, ctx, type: 'account.invite_resent', summary: `إعادة إصدار دعوة تفعيل لحساب ${who(u)} (أُلغيت الروابط السابقة) صالحة حتى ${arabicDate(tok.expires_at)}`, data: { target_user_id: u.id, expires_at: tok.expires_at } });
      return linkPayload('invite', u, tok, ctx);
    },

    revokeInvite(userId, actor, ctx) {
      const u = userRow(userId);
      const n = db.run("UPDATE account_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND kind = 'invite' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", nowIso(), actor.id, u.id, nowIso()).changes;
      if (!n) throw conflict('لا توجد دعوة سارية لهذا المستخدم');
      audit({ actor, ctx, type: 'account.invite_revoked', severity: 'warning', summary: `إلغاء دعوة تفعيل حساب ${who(u)}`, data: { target_user_id: u.id } });
      return accountSummary(userRow(u.id));
    },

    issueResetLink(userId, actor, ctx) {
      const u = userRow(userId);
      if (u.invite_pending) throw conflict('لم يقبل هذا المستخدم دعوته بعد؛ أعد إرسال الدعوة بدلًا من رابط إعادة التعيين');
      if (!u.active) throw conflict('الحساب موقوف؛ فعّله أولًا ثم أصدر رابط إعادة التعيين');
      const tok = issueToken('reset', u.id, actor);
      audit({ actor, ctx, type: 'account.password_reset_link', severity: 'warning', summary: `إصدار رابط إعادة تعيين كلمة المرور لحساب ${who(u)} صالح حتى ${arabicDate(tok.expires_at)} ${arabicTime(tok.expires_at)}`, data: { target_user_id: u.id, expires_at: tok.expires_at } });
      return linkPayload('reset', u, tok, ctx);
    },

    revokeResetLinks(userId, actor, ctx) {
      const u = userRow(userId);
      const n = db.run("UPDATE account_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", nowIso(), actor.id, u.id, nowIso()).changes;
      if (!n) throw conflict('لا يوجد رابط إعادة تعيين ساري لهذا المستخدم');
      audit({ actor, ctx, type: 'account.password_reset_link', summary: `إلغاء رابط إعادة تعيين كلمة المرور لحساب ${who(u)}`, data: { target_user_id: u.id, revoked: true } });
      return accountSummary(userRow(u.id));
    },

    setTemporaryPassword(userId, password, actor, ctx) {
      const u = userRow(userId);
      if (u.id === actor.id) throw badRequest('لتغيير كلمة مرورك استخدم صفحة «حسابي والأمان»');
      checkNewPassword(password, undefined, u.username);
      db.tx(() => {
        db.update('users', u.id, { password_hash: hashPassword(password), must_change_password: 1, invite_pending: 0, failed_login_count: 0, locked_until: null, password_changed_at: nowIso() });
        db.run('UPDATE account_tokens SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL', nowIso(), actor.id, u.id);
      });
      const revoked = app.auth.revokeUserSessions(u.id);
      audit({ actor, ctx, type: 'account.temp_password_set', severity: 'warning', summary: `تعيين كلمة مرور مؤقتة لحساب ${who(u)} (يلزمه تغييرها عند أول دخول)${revoked ? ` وإنهاء ${arabicCount(revoked, SESSIONS)}` : ''}`, data: { target_user_id: u.id, sessions_revoked: revoked } });
      return accountSummary(userRow(u.id));
    },

    unlock(userId, actor, ctx) {
      const u = userRow(userId);
      db.update('users', u.id, { failed_login_count: 0, locked_until: null });
      // الإيقاف المؤقت لكل مصدر (عنوان IP أو جهاز) تكررت منه المحاولات الفاشلة
      app.auth.clearLoginLocks?.(u.id);
      audit({ actor, ctx, type: 'account.unlocked', summary: `رفع الإيقاف المؤقت عن حساب ${who(u)} وتصفير عداد المحاولات الفاشلة`, data: { target_user_id: u.id } });
      return accountSummary(userRow(u.id));
    },

    resetTwoFactorByAdmin(userId, actor, ctx) {
      const u = userRow(userId);
      if (u.id === actor.id) throw badRequest('لإلغاء التحقق بخطوتين لحسابك استخدم صفحة «حسابي والأمان»');
      if (!twoFactorStatus(u.id).enabled) throw conflict('التحقق بخطوتين غير مفعّل لهذا الحساب');
      db.tx(() => {
        db.run('DELETE FROM user_2fa WHERE user_id = ?', u.id);
        db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', u.id);
      });
      const revoked = app.auth.revokeUserSessions(u.id);
      // الهاتف المفقود هو غالبًا الجهاز المشترك في رابط التقويم: يُلغى الرابط مع الجلسات
      const feedRevoked = revokeCalendarFeed(u.id, actor, ctx, 'إلغاء التحقق بخطوتين (فقدان الهاتف)');
      const isAdmin = u.role === 'admin';
      audit({
        actor,
        ctx,
        type: 'account.2fa_reset_by_admin',
        severity: isAdmin ? 'critical' : 'warning',
        summary: `إلغاء التحقق بخطوتين لحساب ${who(u)} بواسطة الإدارة (فقدان الهاتف) وإنهاء جلساته${feedRevoked ? ' ورابط التقويم' : ''}`,
        data: { target_user_id: u.id, sessions_revoked: revoked, calendar_feed_revoked: feedRevoked },
      });
      app.notifications.notify(u.id, { type: 'security', title: 'ألغت الإدارة التحقق بخطوتين لحسابك', body: 'أُلغي التحقق بخطوتين لحسابك بناءً على طلب الإدارة. ننصحك بإعادة تفعيله من صفحة «حسابي والأمان» فور الدخول.', link: '#/account' });
      if (isAdmin) notifyAdmins({ title: `أُلغي التحقق بخطوتين لحساب ${u.name}`, body: `ألغى ${actor.name} التحقق بخطوتين لحساب «${u.username}» بدور «إدارة النظام».` }, { exceptUserId: actor.id });
      return accountSummary(userRow(u.id));
    },

    revokeAllSessionsByAdmin(userId, actor, ctx) {
      const u = userRow(userId);
      const n = u.id === actor.id ? app.auth.revokeUserSessions(u.id, { exceptTokenHash: ctx.user.session_token_hash }) : app.auth.revokeUserSessions(u.id);
      // رابط التقويم بيانات اعتماد مستقلة عن الجلسات (يعمل بلا دخول): يُلغى معها
      const feedRevoked = revokeCalendarFeed(u.id, actor, ctx, 'إنهاء كل الجلسات');
      audit({
        actor,
        ctx,
        type: 'auth.sessions_revoked',
        severity: 'warning',
        summary: `إنهاء ${n ? arabicCount(n, SESSIONS) : 'كل الجلسات'} لحساب ${who(u)} بواسطة الإدارة${feedRevoked ? ' وإلغاء رابط التقويم' : ''}`,
        data: { target_user_id: u.id, count: n, calendar_feed_revoked: feedRevoked },
      });
      return { revoked: n, calendar_feed_revoked: feedRevoked, account: accountSummary(userRow(u.id)) };
    },

    /** إلغاء رابط اشتراك التقويم لحساب من صفحة الحساب (مدير النظام) */
    revokeCalendarFeedByAdmin(userId, actor, ctx) {
      const u = userRow(userId);
      const revoked = revokeCalendarFeed(u.id, actor, ctx, 'ألغته الإدارة من صفحة الحساب');
      if (!revoked) throw conflict('لا يوجد رابط تقويم ساري لهذا الحساب');
      return { revoked, account: accountSummary(userRow(u.id)) };
    },

    // ===================== روابط الدعوة وإعادة التعيين (بدون دخول) =====================
    inspectLink(ctx, token) {
      tokenLimiter.hit(ctx.ip);
      const row = findToken(token);
      const u = userRow(row.user_id);
      return {
        kind: row.kind,
        expires_at: row.expires_at,
        user: { name: u.name, display_name: displayName(u), username: u.username, role: u.role, role_label: roleLabel(u.role) },
        org: orgName(),
      };
    },

    acceptInvite(ctx, body = {}) {
      tokenLimiter.hit(ctx.ip);
      const row = findToken(body.token, 'invite');
      const name = v.str(body.name, 'الاسم', { required: true, min: 3, max: 120 });
      const password = checkNewPassword(body.password, body.password_confirm, row.username);
      // التعهد بسرية بيانات المستفيدين شرط للتفعيل، ويُحفظ وقته (لا يكفي التحقق في الواجهة)
      if (body.pledge !== true) throw fieldError('pledge', 'يجب الإقرار بالتعهد بالحفاظ على سرية بيانات المستفيدين والمستفيدات قبل تفعيل الحساب');
      const t = nowIso();
      db.tx(() => {
        db.update('users', row.user_id, { name, password_hash: hashPassword(password), invite_pending: 0, must_change_password: 0, password_changed_at: t, failed_login_count: 0, locked_until: null, confidentiality_pledged_at: t });
        db.run('UPDATE account_tokens SET used_at = ?, used_ip = ? WHERE id = ?', t, ctx.ip, row.id);
        db.run("UPDATE account_tokens SET revoked_at = ? WHERE user_id = ? AND kind = 'invite' AND used_at IS NULL AND revoked_at IS NULL", t, row.user_id);
      });
      app.auth.revokeUserSessions(row.user_id);
      const u = userRow(row.user_id);
      const user = app.auth.createSession(ctx, u, 'invite');
      const renamed = name !== row.name;
      audit({
        actor: u,
        ctx,
        type: 'account.invite_accepted',
        summary: `قبول دعوة وتفعيل حساب ${who(u)}${renamed ? ` (صُحح الاسم من «${row.name}»)` : ''}`,
        data: { target_user_id: u.id, renamed, previous_name: renamed ? row.name : undefined, pledge_accepted_at: t },
      });
      const recipients = new Set([row.created_by, ...db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((r) => r.id)].filter(Boolean));
      recipients.delete(u.id);
      if (recipients.size) {
        app.notifications.notify([...recipients], {
          type: 'account',
          title: `فعّل ${displayName(u)} حسابه`,
          body: `قبل ${displayName(u)} دعوة الانضمام إلى المنصة بدور «${roleLabel(u.role)}» واختار كلمة المرور الخاصة به.`,
          link: u.role === 'lawyer' ? `#/lawyers/${u.id}` : '#/settings',
        });
      }
      return { user };
    },

    resetPassword(ctx, body = {}) {
      tokenLimiter.hit(ctx.ip);
      const row = findToken(body.token, 'reset');
      const password = checkNewPassword(body.password, body.password_confirm, row.username);
      const t = nowIso();
      db.tx(() => {
        db.update('users', row.user_id, { password_hash: hashPassword(password), must_change_password: 0, password_changed_at: t, failed_login_count: 0, locked_until: null });
        db.run('UPDATE account_tokens SET used_at = ?, used_ip = ? WHERE id = ?', t, ctx.ip, row.id);
        db.run("UPDATE account_tokens SET revoked_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL AND revoked_at IS NULL", t, row.user_id);
      });
      const revoked = app.auth.revokeUserSessions(row.user_id);
      const u = userRow(row.user_id);
      audit({ actor: u, ctx, type: 'account.password_reset', severity: 'warning', summary: `إعادة تعيين كلمة مرور حساب ${who(u)} عبر الرابط${revoked ? ` وإنهاء ${arabicCount(revoked, SESSIONS)}` : ''}`, data: { target_user_id: u.id, sessions_revoked: revoked } });
      app.notifications.notify(u.id, { type: 'security', title: 'تم تغيير كلمة مرور حسابك', body: 'غُيرت كلمة مرور حسابك عبر رابط إعادة التعيين، وأُنهيت كل الجلسات السابقة. إن لم تكن أنت فتواصل مع الإدارة فورًا.', link: '#/account' });
      return { ok: true, username: u.username, two_factor_enabled: twoFactorStatus(u.id).enabled };
    },

    // ===================== حسابي =====================
    myAccount(ctx) {
      const u = userRow(ctx.user.id);
      const current = db.get('SELECT public_id, auth_method, created_at FROM sessions WHERE token_hash = ?', ctx.user.session_token_hash || '');
      return {
        user: {
          id: u.id,
          role: u.role,
          role_label: roleLabel(u.role),
          name: u.name,
          display_name: displayName(u),
          username: u.username,
          email: u.email || null,
          phone: u.phone || null,
          created_at: u.created_at,
          last_login_at: u.last_login_at || null,
          password_changed_at: u.password_changed_at || null,
          password_change_required: !!u.must_change_password,
          confidentiality_pledged_at: u.confidentiality_pledged_at || null,
          restricted: app.auth.restrictionOf(u),
        },
        editable: { name: u.role !== 'lawyer', email: true, phone: true },
        two_factor: twoFactorStatus(u.id),
        sessions_count: sessionsCount(u.id),
        current_session: current ? { id: current.public_id, auth_method: current.auth_method || 'password_only', created_at: current.created_at } : null,
        policy: {
          require_2fa_admins: app.settings.get('security_require_2fa_admins') === true,
          idle_hours: app.auth.idleHours(),
          max_hours: app.auth.maxSessionHours(),
          password_min_length: 8,
        },
      };
    },

    updateProfile(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      const patch = {};
      if (body.name !== undefined) {
        const name = v.str(body.name, 'الاسم', { required: true, min: 3, max: 120 });
        if (name !== u.name) {
          if (u.role === 'lawyer') throw fieldError('name', 'يُعدَّل اسم المحامي من الإدارة فقط لارتباطه ببيانات القيد والاتفاق المالي');
          patch.name = name;
        }
      }
      if (body.email !== undefined) patch.email = v.email(body.email, 'البريد الإلكتروني');
      if (body.phone !== undefined) patch.phone = v.phone(body.phone, 'رقم الموبايل');
      const FIELD_LABELS = { name: 'الاسم', email: 'البريد الإلكتروني', phone: 'رقم الموبايل' };
      const changed = Object.keys(patch).filter((k) => (patch[k] || null) !== (u[k] || null));
      if (changed.length) {
        db.update('users', u.id, Object.fromEntries(changed.map((k) => [k, patch[k]])));
        audit({ actor: u, ctx, type: 'account.profile_updated', summary: `تعديل بيانات الحساب الشخصية: ${changed.map((k) => FIELD_LABELS[k]).join('، ')}`, data: { target_user_id: u.id, fields: changed } });
      }
      return svc.myAccount(ctx);
    },

    changePassword(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      checkCurrentPassword(u, body.current_password, 'current_password');
      const next = checkNewPassword(body.new_password, body.new_password_confirm, u.username, 'new_password');
      if (verifyPassword(next, u.password_hash)) throw fieldError('new_password', 'كلمة المرور الجديدة يجب أن تختلف عن الحالية');
      const wasTemporary = !!u.must_change_password;
      db.update('users', u.id, { password_hash: hashPassword(next), must_change_password: 0, password_changed_at: nowIso() });
      const revoked = app.auth.revokeUserSessions(u.id, { exceptTokenHash: ctx.user.session_token_hash });
      audit({
        actor: u,
        ctx,
        type: 'account.password_changed',
        summary: `${wasTemporary ? 'استبدال كلمة المرور المؤقتة' : 'تغيير كلمة المرور'} من صفحة الحساب${revoked ? ` وإنهاء ${arabicCount(revoked, SESSIONS)} على أجهزة أخرى` : ''}`,
        data: { target_user_id: u.id, sessions_revoked: revoked, was_temporary: wasTemporary },
      });
      return { ok: true, other_sessions_revoked: revoked, user: app.auth.publicUser(userRow(u.id)) };
    },

    // ----- التحقق بخطوتين -----
    setupTwoFactor(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      if (twoFactorStatus(u.id).enabled) throw conflict('التحقق بخطوتين مفعّل بالفعل لحسابك');
      const sessionCreated = db.value('SELECT created_at FROM sessions WHERE token_hash = ?', ctx.user.session_token_hash || '');
      const recent = sessionCreated && now().getTime() - Date.parse(sessionCreated) < RECENT_AUTH_MS;
      if (!recent || body.password) checkCurrentPassword(u, body.password, 'password');
      const secret = newTotpSecret();
      const b32 = base32Encode(secret);
      const t = nowIso();
      db.run(
        `INSERT INTO user_2fa (user_id, pending_secret_enc, pending_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET pending_secret_enc = excluded.pending_secret_enc, pending_at = excluded.pending_at, updated_at = excluded.updated_at`,
        u.id,
        sealer.seal(secret),
        t,
        t,
      );
      const issuer = String(app.settings.get('security_totp_issuer') || 'Beyoot Misr').slice(0, 60);
      return {
        secret: b32,
        secret_groups: b32.match(/.{1,4}/g),
        otpauth_uri: otpauthUri({ secretB32: b32, account: u.username, issuer }),
        issuer,
        account: u.username,
        expires_at: new Date(Date.parse(t) + SETUP_MINUTES * 60000).toISOString(),
      };
    },

    enableTwoFactor(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      const row = twoFactorRow(u.id);
      if (row && row.enabled_at && row.secret_enc) throw conflict('التحقق بخطوتين مفعّل بالفعل لحسابك');
      if (!row || !row.pending_secret_enc) throw badRequest('ابدأ إعداد التحقق بخطوتين أولًا');
      if (Date.parse(row.pending_at) + SETUP_MINUTES * 60000 < now().getTime()) throw badRequest('انتهت مهلة الإعداد، ابدأ الإعداد من جديد');
      const secret = sealer.open(row.pending_secret_enc);
      if (!secret) throw badRequest('تعذر قراءة إعداد التحقق، ابدأ الإعداد من جديد');
      reauthLimiter.hit(`2fa-enable:${u.id}`);
      const step = verifyTotp(secret, body.code, { ms: now().getTime() });
      if (step === null) throw fieldError('code', 'رمز التحقق غير صحيح. تأكد من ضبط الوقت تلقائيًا في الهاتف وأدخل الرمز الظاهر حاليًا في التطبيق');
      reauthLimiter.reset(`2fa-enable:${u.id}`);
      const t = nowIso();
      const codes = db.tx(() => {
        db.run('UPDATE user_2fa SET secret_enc = pending_secret_enc, enabled_at = ?, pending_secret_enc = NULL, pending_at = NULL, last_step = ?, updated_at = ? WHERE user_id = ?', t, step, t, u.id);
        return newRecoveryCodes(u.id);
      });
      audit({ actor: u, ctx, type: 'account.2fa_enabled', summary: `تفعيل التحقق بخطوتين لحساب ${who(u)} وإصدار ${arabicCount(codes.length, CODES)} استرداد`, data: { target_user_id: u.id } });
      return { enabled: true, recovery_codes: codes, user: app.auth.publicUser(userRow(u.id)), two_factor: twoFactorStatus(u.id) };
    },

    disableTwoFactor(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      if (!twoFactorStatus(u.id).enabled) throw conflict('التحقق بخطوتين غير مفعّل لحسابك');
      if (u.role === 'admin' && app.settings.get('security_require_2fa_admins') === true) {
        throw conflict('سياسة المؤسسة تلزم حسابات «إدارة النظام» بالتحقق بخطوتين، فلا يمكن إلغاؤه ما دامت السياسة مفعّلة');
      }
      checkCurrentPassword(u, body.password, 'password');
      if (!svc.verifySecondFactor(u.id, { code: body.code })) throw fieldError('code', 'رمز التحقق أو رمز الاسترداد غير صحيح');
      db.tx(() => {
        db.run('DELETE FROM user_2fa WHERE user_id = ?', u.id);
        db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', u.id);
      });
      const isAdmin = u.role === 'admin';
      audit({ actor: u, ctx, type: 'account.2fa_disabled', severity: isAdmin ? 'critical' : 'warning', summary: `إلغاء التحقق بخطوتين لحساب ${who(u)}${isAdmin ? ' (حساب بدور «إدارة النظام»)' : ''}`, data: { target_user_id: u.id } });
      if (isAdmin) notifyAdmins({ title: `ألغى ${u.name} التحقق بخطوتين لحسابه`, body: `أُلغي التحقق بخطوتين لحساب «${u.username}» بدور «إدارة النظام». إن لم يكن ذلك متوقعًا فتواصل معه وراجع سجل الأمان.` }, { exceptUserId: u.id });
      return { enabled: false, two_factor: twoFactorStatus(u.id) };
    },

    regenerateRecoveryCodes(ctx, body = {}) {
      const u = userRow(ctx.user.id);
      if (!twoFactorStatus(u.id).enabled) throw conflict('فعّل التحقق بخطوتين أولًا');
      checkCurrentPassword(u, body.password, 'password');
      if (!svc.verifySecondFactor(u.id, { code: body.code })) throw fieldError('code', 'رمز التحقق أو رمز الاسترداد غير صحيح');
      const codes = db.tx(() => newRecoveryCodes(u.id));
      audit({ actor: u, ctx, type: 'account.recovery_codes_regenerated', severity: 'warning', summary: `إصدار ${arabicCount(codes.length, CODES)} استرداد جديدة لحساب ${who(u)} (أُبطلت الرموز السابقة)`, data: { target_user_id: u.id } });
      return { recovery_codes: codes, two_factor: twoFactorStatus(u.id) };
    },

    /**
     * التحقق من العامل الثاني: رمز TOTP (يُرفض تكرار نفس الخطوة الزمنية) أو رمز استرداد (يُستهلك).
     * @returns {'totp'|'recovery'|null}
     */
    verifySecondFactor(userId, { code, recovery_code: recoveryCode } = {}) {
      const row = twoFactorRow(userId);
      if (!row || !row.enabled_at || !row.secret_enc) return null;
      const hasRecovery = recoveryCode !== undefined && recoveryCode !== null && recoveryCode !== '';
      const input = hasRecovery ? recoveryCode : code;
      if (input === undefined || input === null || input === '' || String(input).length > 64) return null;
      if (hasRecovery || !looksLikeTotp(input)) {
        if (!normalizeRecoveryCode(input)) return null;
        for (const rc of db.all('SELECT id, code_hash FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL', userId)) {
          if (verifyRecoveryCode(input, rc.code_hash)) {
            const used = db.run('UPDATE user_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL', nowIso(), rc.id).changes;
            return used ? 'recovery' : null;
          }
        }
        return null;
      }
      const secret = sealer.open(row.secret_enc);
      if (!secret) return null;
      const step = verifyTotp(secret, input, { ms: now().getTime(), afterStep: row.last_step });
      if (step === null) return null;
      const updated = db.run('UPDATE user_2fa SET last_step = ?, updated_at = ? WHERE user_id = ? AND (last_step IS NULL OR last_step < ?)', step, nowIso(), userId, step).changes;
      return updated ? 'totp' : null;
    },

    /** للبيانات التجريبية فقط (لا يوجد مسار HTTP): تفعيل التحقق بخطوتين بسر معروف وإصدار رموز الاسترداد */
    seedEnableTwoFactor(userId, secretBuf) {
      const t = nowIso();
      return db.tx(() => {
        db.run(
          `INSERT INTO user_2fa (user_id, secret_enc, enabled_at, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET secret_enc = excluded.secret_enc, enabled_at = excluded.enabled_at, pending_secret_enc = NULL, pending_at = NULL, updated_at = excluded.updated_at`,
          userId,
          sealer.seal(secretBuf),
          t,
          t,
        );
        return newRecoveryCodes(userId);
      });
    },

    recoveryRemaining(userId) {
      return Number(db.value('SELECT COUNT(*) FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL', userId));
    },

    // ----- الجلسات -----
    mySessions(ctx) {
      return { items: app.auth.listSessions(ctx.user.id, ctx.user.session_token_hash), idle_hours: app.auth.idleHours(), max_hours: app.auth.maxSessionHours() };
    },
    revokeMySession(ctx, publicId) {
      const s = db.get('SELECT token_hash, user_agent, ip FROM sessions WHERE user_id = ? AND public_id = ?', ctx.user.id, String(publicId || ''));
      if (!s) throw notFound('الجلسة غير موجودة أو انتهت بالفعل');
      if (s.token_hash === ctx.user.session_token_hash) throw badRequest('هذه جلستك الحالية؛ استخدم «تسجيل الخروج» لإنهائها');
      app.auth.revokeSession(ctx.user.id, publicId);
      audit({ actor: ctx.user, ctx, type: 'auth.session_revoked', summary: `إنهاء جلسة على ${describeUserAgent(s.user_agent).label}${s.ip ? ` (${s.ip})` : ''}`, data: { target_user_id: ctx.user.id } });
      return svc.mySessions(ctx);
    },
    revokeMyOtherSessions(ctx) {
      const n = app.auth.revokeUserSessions(ctx.user.id, { exceptTokenHash: ctx.user.session_token_hash });
      // رابط التقويم المشترك على جهاز آخر (مثل هاتف مفقود) يتوقف أيضًا؛ يمكن إصدار رابط جديد من صفحة التقويم
      const feedRevoked = revokeCalendarFeed(ctx.user.id, ctx.user, ctx, 'تسجيل الخروج من كل الأجهزة الأخرى');
      if (n) audit({ actor: ctx.user, ctx, type: 'auth.sessions_revoked', summary: `تسجيل الخروج من كل الأجهزة الأخرى (${arabicCount(n, SESSIONS_NOM)})`, data: { target_user_id: ctx.user.id, count: n } });
      return { revoked: n, calendar_feed_revoked: feedRevoked, ...svc.mySessions(ctx) };
    },
    /** أحداث حسابي: ما فعلته أنا، وما فعلته الإدارة على حسابي (دون عنوان IP أو جهاز من قام به) */
    myActivity(ctx) {
      return svc.auditList({ user_id: ctx.user.id, page_size: 15 }).items.map((e) =>
        e.user_id === ctx.user.id
          ? { ...e, data: undefined, by_me: true }
          : { ...e, data: undefined, by_me: false, ip: null, device: null, user_id: null, actor_name: 'الإدارة', actor_role: null, actor_username: null },
      );
    },

    // ===================== سجل الأمان =====================
    auditList(f = {}) {
      const { sql, params } = auditWhere(f);
      const pageSize = Math.min(200, Math.max(5, Number(f.page_size) || 50));
      const total = Number(db.value(`SELECT COUNT(*) ${sql}`, ...params));
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(pages, Math.max(1, Number(f.page) || 1));
      const items = db
        .all(`SELECT e.*, u.name AS user_name, u.role AS user_role, u.username AS user_username ${sql} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize)
        .map(mapEvent);
      return { items, total, page, pages, page_size: pageSize };
    },

    auditFacets() {
      const used = db.all('SELECT type, COUNT(*) AS n FROM security_events GROUP BY type ORDER BY type').map((r) => [r.type, Number(r.n)]);
      const known = Object.keys(LABELS.security_event || {});
      const all = [...new Set([...known, ...used.map(([t]) => t)])];
      const counts = Object.fromEntries(used);
      const groups = [...new Set(all.map((t) => t.split('.')[0]))];
      const users = db.all("SELECT DISTINCT u.id, u.name, u.role FROM users u WHERE EXISTS (SELECT 1 FROM security_events e WHERE e.user_id = u.id) ORDER BY u.role, u.name");
      return { types: all.map((t) => ({ value: t, label: typeLabel(t), count: counts[t] || 0 })), groups, users };
    },

    auditSummary() {
      const day = new Date(now().getTime() - 24 * 3600000).toISOString();
      const week = new Date(now().getTime() - 7 * 24 * 3600000).toISOString();
      const c = (sql, ...p) => Number(db.value(sql, ...p));
      return {
        failed_logins_24h: c("SELECT COUNT(*) FROM security_events WHERE type IN ('auth.login_failed','auth.2fa_failed') AND severity != 'critical' AND created_at >= ?", day),
        logins_24h: c("SELECT COUNT(*) FROM security_events WHERE type = 'auth.login' AND created_at >= ?", day),
        lockouts_7d: c("SELECT COUNT(*) FROM security_events WHERE type = 'auth.lockout' AND created_at >= ?", week),
        critical_7d: c("SELECT COUNT(*) FROM security_events WHERE severity = 'critical' AND created_at >= ?", week),
        locked_accounts: c('SELECT COUNT(*) FROM users WHERE locked_until > ?', nowIso()),
        active_sessions: c('SELECT COUNT(*) FROM sessions WHERE expires_at > ? AND COALESCE(last_seen_at, created_at) >= ?', nowIso(), new Date(now().getTime() - app.auth.idleHours() * 3600000).toISOString()),
        admins_without_2fa: c("SELECT COUNT(*) FROM users u WHERE u.role = 'admin' AND u.active = 1 AND u.invite_pending = 0 AND NOT EXISTS (SELECT 1 FROM user_2fa t WHERE t.user_id = u.id AND t.enabled_at IS NOT NULL)"),
        pending_invites: c('SELECT COUNT(*) FROM users WHERE invite_pending = 1 AND active = 1'),
      };
    },

    /** تصدير CSV (UTF-8 مع BOM ليفتح بالعربية في Excel) */
    /** فلاتر تصدير سجل الأمان من جسم طلب POST: المفاتيح المعروفة فقط، مع التحقق منها (400) قبل إصدار رابط التنزيل */
    auditExportFilters(body = {}) {
      const out = {};
      for (const k of ['type', 'severity', 'user_id', 'q', 'from', 'to']) {
        const val = body?.[k];
        if (val === undefined || val === null || val === '') continue;
        if (typeof val !== 'string' && typeof val !== 'number') throw badRequest('فلاتر التصدير غير صالحة');
        out[k] = String(val).slice(0, 200);
      }
      auditWhere(out);
      return out;
    },

    auditCsv(f = {}, actor, ctx) {
      const { sql, params } = auditWhere(f);
      const rows = db.all(`SELECT e.*, u.name AS user_name, u.role AS user_role, u.username AS user_username ${sql} ORDER BY e.created_at DESC, e.id DESC LIMIT 50000`, ...params).map(mapEvent);
      const header = ['التاريخ والوقت (القاهرة)', 'نوع الحدث', 'الرمز', 'درجة الخطورة', 'المستخدم', 'اسم المستخدم', 'الدور', 'عنوان IP', 'الجهاز', 'الوصف'];
      const lines = [header.map(csvCell).join(',')];
      for (const e of rows) {
        lines.push(
          [cairoStamp(e.created_at), e.type_label, e.type, LABELS.security_severity?.[e.severity] || e.severity, e.actor_name || '', e.actor_username || '', e.actor_role ? roleLabel(e.actor_role) : '', e.ip || '', e.device || '', e.summary]
            .map(csvCell)
            .join(','),
        );
      }
      const filters = Object.fromEntries(Object.entries(f).filter(([k, x]) => x && ['type', 'severity', 'user_id', 'q', 'from', 'to'].includes(k)));
      audit({ actor, ctx, type: 'audit.exported', severity: 'warning', summary: `تصدير سجل الأمان بصيغة CSV (${arabicCount(rows.length, ['حدث واحد', 'حدثان', 'أحداث', 'حدثًا'])})`, data: { rows: rows.length, filters } });
      return { csv: `﻿${lines.join('\r\n')}\r\n`, rows: rows.length };
    },

    // ===================== سياسة الأمان =====================
    policy() {
      return {
        security_require_2fa_admins: app.settings.get('security_require_2fa_admins') === true,
        session_idle_hours: app.auth.idleHours(),
        session_max_hours: app.auth.maxSessionHours(),
        invite_valid_hours: validHours('invite'),
        reset_valid_hours: validHours('reset'),
        security_audit_retention_days: settingNum('security_audit_retention_days', 365, 30, 3650),
        security_totp_issuer: String(app.settings.get('security_totp_issuer') || 'Beyoot Misr'),
        session_ttl_from_env: app.auth.sessionTtlFromServer(),
      };
    },
    /**
     * مفاتيح الإعدادات التي تخص سياسة الأمان: لا تُحفظ إلا عبر updatePolicy (بتحققها وشروطها وتسجيلها في سجل الأمان)،
     * حتى لو أُرسلت إلى PATCH /api/admin/settings العام.
     */
    POLICY_KEYS: ['security_require_2fa_admins', 'session_idle_hours', 'session_max_hours', 'invite_valid_hours', 'reset_valid_hours', 'security_audit_retention_days', 'security_totp_issuer'],
    updatePolicy(body = {}, actor, ctx) {
      const out = {};
      if (body.security_require_2fa_admins !== undefined) out.security_require_2fa_admins = v.bool(body.security_require_2fa_admins);
      if (body.session_idle_hours !== undefined) out.session_idle_hours = v.num(body.session_idle_hours, 'مهلة عدم النشاط', { required: true, min: 0.25, max: 720 });
      if (body.session_max_hours !== undefined) out.session_max_hours = v.num(body.session_max_hours, 'الحد الأقصى لعمر الجلسة', { required: true, min: 1, max: 2160 });
      if (body.invite_valid_hours !== undefined) out.invite_valid_hours = v.int(body.invite_valid_hours, 'صلاحية رابط الدعوة', { required: true, min: 1, max: 336 });
      if (body.reset_valid_hours !== undefined) out.reset_valid_hours = v.int(body.reset_valid_hours, 'صلاحية رابط إعادة التعيين', { required: true, min: 1, max: 168 });
      if (body.security_audit_retention_days !== undefined) out.security_audit_retention_days = v.int(body.security_audit_retention_days, 'مدة الاحتفاظ بسجل الأمان', { required: true, min: 30, max: 3650 });
      if (body.security_totp_issuer !== undefined) {
        // حروف لاتينية فقط: بعض تطبيقات المصادقة لا تعرض غيرها، والنص العربي المرمّز قد يتجاوز سعة رمز QR
        const issuer = v.str(body.security_totp_issuer, 'اسم الجهة في تطبيق المصادقة', { required: true, min: 2, max: 40 });
        if (!/^[A-Za-z0-9 .&_-]+$/.test(issuer)) throw fieldError('security_totp_issuer', 'اسم الجهة في تطبيق المصادقة يقبل الحروف اللاتينية والأرقام والمسافات فقط');
        out.security_totp_issuer = issuer;
      }
      const idle = out.session_idle_hours ?? app.auth.idleHours();
      const max = out.session_max_hours ?? app.auth.maxSessionHours();
      if (idle > max) throw fieldError('session_idle_hours', 'مهلة عدم النشاط يجب ألا تتجاوز الحد الأقصى لعمر الجلسة');
      if (out.security_require_2fa_admins && !twoFactorStatus(actor.id).enabled) {
        throw fieldError('security_require_2fa_admins', 'فعّل التحقق بخطوتين لحسابك أولًا قبل إلزام حسابات «إدارة النظام» به');
      }
      const before = svc.policy();
      for (const [k, val] of Object.entries(out)) app.settings.set(k, val);
      const POLICY_LABELS = {
        security_require_2fa_admins: 'إلزام «إدارة النظام» بالتحقق بخطوتين',
        session_idle_hours: 'مهلة عدم النشاط',
        session_max_hours: 'الحد الأقصى لعمر الجلسة',
        invite_valid_hours: 'صلاحية رابط الدعوة',
        reset_valid_hours: 'صلاحية رابط إعادة التعيين',
        security_audit_retention_days: 'مدة الاحتفاظ بسجل الأمان',
        security_totp_issuer: 'اسم الجهة في تطبيق المصادقة',
      };
      const policyValue = (k, x) => {
        if (typeof x === 'boolean') return x ? 'مفعّل' : 'غير مفعّل';
        if (typeof x === 'string') return x;
        if (k === 'security_audit_retention_days') return arabicCount(x, ['يوم', 'يومين', 'أيام', 'يومًا']);
        return Number.isInteger(x) ? arabicCount(x, ['ساعة', 'ساعتين', 'ساعات', 'ساعة']) : `${x} ساعة`;
      };
      const changed = Object.keys(out).filter((k) => before[k] !== out[k]);
      if (changed.length) {
        // إضعاف السياسة (إلغاء الإلزام، إطالة الجلسات أو صلاحية الروابط، تقصير الاحتفاظ بالسجل) يُسجَّل تحذيرًا
        const longer = (k) => out[k] !== undefined && out[k] > before[k];
        const weakened =
          (changed.includes('security_require_2fa_admins') && !out.security_require_2fa_admins) ||
          ['session_idle_hours', 'session_max_hours', 'invite_valid_hours', 'reset_valid_hours'].some(longer) ||
          (out.security_audit_retention_days !== undefined && out.security_audit_retention_days < before.security_audit_retention_days);
        audit({
          actor,
          ctx,
          type: 'security.policy_updated',
          severity: weakened ? 'warning' : 'info',
          summary: `تعديل سياسة الأمان: ${changed.map((k) => `${POLICY_LABELS[k]} (${policyValue(k, out[k])})`).join('، ')}`,
          data: { changes: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: out[k] }])) },
        });
      }
      return svc.policy();
    },

    // ===================== التنظيف الدوري =====================
    cleanup() {
      const purged = app.auth.purgeExpired();
      const old = new Date(now().getTime() - 30 * 24 * 3600000).toISOString();
      const tokens = db.run('DELETE FROM account_tokens WHERE (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < ?) AND created_at < ?', nowIso(), old).changes;
      const days = settingNum('security_audit_retention_days', 365, 30, 3650);
      const cutInfo = new Date(now().getTime() - days * 24 * 3600000).toISOString();
      const cutOther = new Date(now().getTime() - 2 * days * 24 * 3600000).toISOString();
      const events =
        db.run("DELETE FROM security_events WHERE severity = 'info' AND created_at < ?", cutInfo).changes +
        db.run("DELETE FROM security_events WHERE severity != 'info' AND created_at < ?", cutOther).changes;
      // إعدادات تحقق بخطوتين لم تكتمل
      const stale = db.run('UPDATE user_2fa SET pending_secret_enc = NULL, pending_at = NULL WHERE pending_at IS NOT NULL AND pending_at < ?', new Date(now().getTime() - SETUP_MINUTES * 60000).toISOString()).changes;
      db.run('DELETE FROM user_2fa WHERE enabled_at IS NULL AND pending_secret_enc IS NULL');
      return { ...purged, tokens, events, stale_setups: stale };
    },
  };

  app.jobs.register('accounts.cleanup', {
    everyMinutes: 60,
    label: 'تنظيف الجلسات المنتهية والروابط المستخدمة وأحداث سجل الأمان القديمة',
    run: async () => svc.cleanup(),
  });
  // تذكير يومي للإدارة بالدعوات التي انتهت صلاحيتها دون قبول
  app.jobs.register('accounts.invite_followup', {
    everyMinutes: 24 * 60,
    label: 'متابعة الدعوات المنتهية دون تفعيل',
    run: async () => {
      const since = new Date(now().getTime() - 24 * 3600000).toISOString();
      const expired = db.all(
        `SELECT u.id, u.name, u.role, t.created_by FROM users u JOIN account_tokens t ON t.user_id = u.id AND t.kind = 'invite'
         WHERE u.invite_pending = 1 AND u.active = 1 AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at < ? AND t.expires_at >= ?
           AND t.id = (SELECT MAX(id) FROM account_tokens x WHERE x.user_id = u.id AND x.kind = 'invite')`,
        nowIso(),
        since,
      );
      for (const r of expired) {
        const to = r.created_by || null;
        const n = { type: 'account', title: `انتهت دعوة ${r.name} دون تفعيل`, body: `انتهت صلاحية رابط الدعوة دون أن يفعّل ${r.name} حسابه. يمكنك إعادة إرسال الدعوة من صفحة الحساب.`, link: r.role === 'lawyer' ? `#/lawyers/${r.id}` : '#/settings' };
        if (to) app.notifications.notify(to, n);
        else notifyAdmins(n);
      }
      return { expired_invites: expired.length };
    },
  });

  return svc;
}
