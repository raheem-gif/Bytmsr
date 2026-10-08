// الإصدار 10 — إشعارات بوابة الشركات وبريدها (U10-88، U10-89، L-50، L-51).
// كل عنوان ≤ 70 حرفًا ويحمل رمز الطلب؛ الجسم داخل البوابة فقط ويُخفى عند القراءة إن لم يعد الطلب ظاهرًا للمستخدم (L-51).
// البريد قصير بلا محتوى قانوني (src/services/email.js) ويحترم تفضيل المستخدم email_pref عدا رسائل الأمان.
// تنبيهات الشركة التي لا طلب لها (الفترة التجريبية، الإيقاف، انتهاء الاشتراك…) تُكرر مرة واحدة عبر automation_runs (CS-16).
import { nowIso, now } from '../util.js';
import { visibleRequestSql } from './companies.js';

const TITLE_MAX = 70;
const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** أهمية البريد لكل نوع إشعار: important = يصل لمن اختار «المهم فقط»، all = لمن اختار «كل جديد» فقط */
const EMAIL_LEVEL = {
  'request.accepted': 'important',
  'request.clarification': 'important',
  'request.quote': 'important',
  'request.deliverable': 'important',
  'request.declined': 'important',
  'request.closed': 'important',
  'request.message': 'all',
  'request.due_changed': 'all',
  'request.quote_decided': 'all',
  'memory.renewal': 'important',
  'charge.added': 'important',
  'company.trial_ending': 'important',
  'company.suspended': 'important',
};

export function createCompanyNotify(app) {
  const { db } = app;

  function companyRow(id) {
    return db.get('SELECT * FROM companies WHERE id = ?', id);
  }
  const activeUsers = (companyId) => db.all('SELECT * FROM company_users WHERE company_id = ? AND active = 1 AND invite_pending = 0', companyId);

  const svc = {
    /** مديرو البوابة النشطون */
    admins(companyId) {
      return activeUsers(companyId).filter((u) => u.role === 'company_admin');
    },
    /** مديرو البوابة + جهات الفواتير (لكل تكلفة إضافية؛ INV-B10) */
    billingRecipients(companyId) {
      return activeUsers(companyId).filter((u) => u.role === 'company_admin' || u.billing_contact);
    },

    /**
     * إشعار في البوابة لمستخدمين من الشركة نفسها فقط. email: { template, vars } (اختياري) يُرسل حسب email_pref.
     * يعيد عدد الإشعارات المُنشأة وآخر صف بريد (لعلامة «لم تُبلَّغ الشركة بالبريد»).
     */
    notify(userIds, { companyId, type, title, body = null, link = null, requestId = null, email = null }) {
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(Number))];
      if (!ids.length) return { count: 0, email: null };
      const t = nowIso();
      const company = companyRow(companyId);
      let lastEmail = null;
      let count = 0;
      for (const uid of ids) {
        const u = db.get('SELECT * FROM company_users WHERE id = ? AND company_id = ? AND active = 1', uid, companyId);
        if (!u) continue;
        db.insert('company_notifications', { company_user_id: u.id, company_id: companyId, type, title: clip(title, TITLE_MAX), body: body ? String(body).slice(0, 2000) : null, link, request_id: requestId, created_at: t });
        count += 1;
        if (email && app.email && !u.invite_pending) {
          const level = EMAIL_LEVEL[type] || 'all';
          const pref = u.email_pref || 'important';
          if (pref === 'none' || (pref === 'important' && level !== 'important')) continue;
          const r = app.email.send(email.template, { to: u.email, name: u.name, company, companyUserId: u.id, vars: email.vars || {} });
          if (r) lastEmail = r;
        }
      }
      return { count, email: lastEmail };
    },

    /** رسائل الأمان: إشعار في البوابة + بريد دائمًا (U10-88) */
    security(cu, company, kind) {
      const titles = {
        password_changed: 'تم تغيير كلمة المرور لحسابكم',
        two_factor_disabled: 'أُوقف التحقق بخطوتين لحسابكم',
      };
      const title = titles[kind] || 'تغيّرت إعدادات الأمان لحسابكم';
      try {
        db.insert('company_notifications', {
          company_user_id: cu.id,
          company_id: company.id,
          type: `security.${kind}`,
          title,
          body: 'إن لم تكونوا أنتم فتواصلوا مع مديري البوابة في شركتكم فورًا.',
          link: '#/account',
          created_at: nowIso(),
        });
        app.email?.send('security', { to: cu.email, name: cu.name, company, companyUserId: cu.id, vars: { event: title }, security: true });
      } catch (e) {
        app.log('company security notify', e);
      }
    },

    /** عدّل فريق المكتب بيانات مستخدم: إشعار لكل مديري البوابة (L-60) */
    teamChangedByStaff(companyId, name) {
      return svc.notify(
        svc.admins(companyId).map((u) => u.id),
        { companyId, type: 'team.changed_by_staff', title: `عدّل فريقكم القانوني بيانات مستخدم: ${name}`, link: '#/team' },
      );
    },

    /** تنبيه على مستوى الشركة مرة واحدة لكل مفتاح (CS-16) — يعيد false إن سبق */
    once(ruleKey, dedupeKey, fn) {
      const t = nowIso();
      const r = db.run('INSERT OR IGNORE INTO automation_runs (rule_key, dedupe_key, entity_type, created_at) VALUES (?, ?, ?, ?)', ruleKey, dedupeKey, 'company', t);
      if (!r.changes) return false;
      fn();
      return true;
    },

    // ───────── قائمة الإشعارات للبوابة ─────────
    list(cu, { limit = 50 } = {}) {
      const n = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const rows = db.all(
        'SELECT id, type, title, body, link, request_id, read_at, created_at FROM company_notifications WHERE company_user_id = ? AND company_id = ? ORDER BY id DESC LIMIT ?',
        cu.id,
        cu.company_id,
        n,
      );
      const vis = visibleRequestSql(cu, 'r');
      const items = rows.map((r) => {
        let body = r.body;
        if (r.request_id) {
          const visible = db.get(`SELECT 1 FROM company_requests r WHERE r.id = ? AND ${vis.sql}`, r.request_id, ...vis.params);
          if (!visible) body = null; // L-51: العنوان فقط إن لم يعد الطلب ظاهرًا
        }
        return { id: r.id, type: r.type, title: r.title, body, link: r.link, read_at: r.read_at, created_at: r.created_at };
      });
      const unread = Number(db.value('SELECT COUNT(*) FROM company_notifications WHERE company_user_id = ? AND read_at IS NULL', cu.id));
      return { items, unread };
    },
    markRead(cu, id) {
      const r = db.run('UPDATE company_notifications SET read_at = ? WHERE id = ? AND company_user_id = ? AND read_at IS NULL', nowIso(), Number(id) || 0, cu.id);
      if (!r.changes && !db.get('SELECT 1 FROM company_notifications WHERE id = ? AND company_user_id = ?', Number(id) || 0, cu.id)) return null;
      return { ok: true };
    },
    markAllRead(cu) {
      db.run('UPDATE company_notifications SET read_at = ? WHERE company_user_id = ? AND read_at IS NULL', nowIso(), cu.id);
      return { ok: true };
    },

    /** الإشعارات المقروءة الأقدم من مدة الاحتفاظ (CS-30؛ مهمة b2b.cleanup) */
    purgeOld() {
      const days = Math.max(30, Number(app.settings.get('b2b_notifications_retention_days')) || 180);
      const cutoff = new Date(now().getTime() - days * 86400000).toISOString();
      return db.run('DELETE FROM company_notifications WHERE read_at IS NOT NULL AND read_at < ?', cutoff).changes;
    },
  };

  /**
   * b2b.cleanup (كل 15 دقيقة): جلسات الشركات وتحدياتها ورموزها وأقفالها المنتهية، والملفات المرحلية غير المستخدمة وملفاتها،
   * والإشعارات المقروءة الأقدم من 180 يومًا، وصندوق البريد الصادر الأقدم من 90 يومًا (CS-30). تعمل حتى مع إيقاف البوابة.
   */
  app.jobs?.register('b2b.cleanup', {
    everyMinutes: 15,
    label: 'خدمة الشركات: تنظيف الجلسات والروابط والملفات المرحلية والإشعارات القديمة',
    run: async () => {
      const out = {};
      try {
        out.auth = app.companyAuth?.purgeExpired?.() ?? null;
      } catch (e) {
        app.log('b2b.cleanup auth', e);
      }
      out.uploads = app.companyRequests?.purgeExpiredUploads?.() ?? 0;
      out.notifications = svc.purgeOld();
      out.outbox = app.email?.purgeOld?.() ?? 0;
      return out;
    },
  });
  return svc;
}
