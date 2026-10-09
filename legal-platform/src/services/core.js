// خدمات أساسية مشتركة: سجل النشاط، الإشعارات، الإعدادات، ناقل الأحداث الداخلي.
import { nowIso, parseJson } from '../util.js';
import { DEFAULT_SETTINGS } from '../constants.js';

/** ناقل أحداث متزامن: المعالجات تعمل داخل نفس المعاملة لضمان الاتساق */
export function createEvents(log) {
  const handlers = new Map();
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    log,
  };
}

/** وصف الفاعل للسجل */
export function actorOf(user) {
  if (!user) return { actor_user_id: null, actor_kind: 'system' };
  if (user.kind) return { actor_user_id: null, actor_kind: user.kind };
  return { actor_user_id: user.id, actor_kind: user.role === 'lawyer' ? 'lawyer' : 'staff' };
}

export function createActivity(app) {
  const { db } = app;
  return {
    /**
     * تسجيل حدث في السجل الزمني.
     * @param {object} e { case_id, intake_id, matter_id, client_id, actor (user | {kind}), type, summary, data }
     */
    log(e) {
      const a = actorOf(e.actor);
      db.insert('activity', {
        case_id: e.case_id ?? null,
        intake_id: e.intake_id ?? null,
        matter_id: e.matter_id ?? null,
        client_id: e.client_id ?? null,
        actor_user_id: a.actor_user_id,
        actor_kind: a.actor_kind,
        type: e.type,
        summary: e.summary,
        data: JSON.stringify(e.data || {}),
        // v10 b2b-server (L-20): ربط اختياري بالشركة وطلبها ومستخدمها (فاعل الشركة { kind: 'company' } بلا معرّف مستخدم)
        company_id: e.company_id ?? undefined,
        company_request_id: e.company_request_id ?? undefined,
        company_user_id: e.company_user_id ?? undefined,
        created_at: nowIso(),
      });
    },
    forCase(caseId, intakeId) {
      const rows = db.all(
        `SELECT a.*, u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.case_id = ? OR (? IS NOT NULL AND a.intake_id = ?) ORDER BY a.id`,
        caseId,
        intakeId ?? null,
        intakeId ?? null,
      );
      return rows.map(mapActivity);
    },
    forIntake(intakeId) {
      return db
        .all(
          `SELECT a.*, u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id
           WHERE a.intake_id = ? ORDER BY a.id`,
          intakeId,
        )
        .map(mapActivity);
    },
    forMatter(matterId) {
      return db
        .all(
          `SELECT a.*, u.name AS actor_name FROM activity a LEFT JOIN users u ON u.id = a.actor_user_id
           WHERE a.matter_id = ? ORDER BY a.id`,
          matterId,
        )
        .map(mapActivity);
    },
  };
}

function mapActivity(r) {
  return {
    id: r.id,
    type: r.type,
    summary: r.summary,
    actor_kind: r.actor_kind,
    actor_name: r.actor_name || null,
    data: parseJson(r.data, {}),
    created_at: r.created_at,
  };
}

export function createNotifications(app) {
  const { db } = app;
  const svc = {
    /** إشعار لمستخدم أو أكثر */
    notify(userIds, { type, title, body = null, link = null }) {
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
      const t = nowIso();
      for (const uid of ids) {
        db.insert('notifications', { user_id: uid, type, title, body, link, created_at: t });
      }
      // v9.1 l-home: تنبيه المحامي على واتساب/جهازه لأنواع محددة (نص بلا بيانات مستفيدين) — لا يكسر الإشعار أبدًا
      if (app.lawyerAlerts && ids.length) {
        try {
          app.lawyerAlerts.onNotify(ids, { type, title, body, link });
        } catch (e) {
          app.log?.('lawyer alerts hook', e);
        }
      }
    },
    /** إشعار للإدارة: مدير الحالة المسؤول إن وُجد، وإلا كل مستخدمي الإدارة النشطين */
    notifyStaff(n, { caseManagerId = null, exceptUserId = null } = {}) {
      let ids;
      if (caseManagerId) {
        ids = [caseManagerId, ...db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((r) => r.id)];
      } else {
        ids = db.all("SELECT id FROM users WHERE role IN ('admin','case_manager') AND active = 1").map((r) => r.id);
      }
      svc.notify(ids.filter((id) => id !== exceptUserId), n);
    },
    list(userId, { limit = 50 } = {}) {
      const items = db.all(
        'SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?',
        userId,
        Math.min(Number(limit) || 50, 200),
      );
      const unread = db.value('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', userId);
      return { items, unread: Number(unread) };
    },
    markRead(userId, id) {
      db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL', nowIso(), id, userId);
    },
    markAllRead(userId) {
      db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', nowIso(), userId);
    },
  };
  return svc;
}

export function createSettings(app) {
  const { db } = app;
  return {
    all() {
      const out = { ...DEFAULT_SETTINGS };
      for (const r of db.all('SELECT key, value FROM settings')) out[r.key] = parseJson(r.value, r.value);
      return out;
    },
    get(key) {
      const r = db.get('SELECT value FROM settings WHERE key = ?', key);
      return r ? parseJson(r.value, r.value) : DEFAULT_SETTINGS[key];
    },
    set(key, value) {
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      );
    },
  };
}
