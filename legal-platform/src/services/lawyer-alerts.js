// الإصدار 9.1 — مسار l-home: تنبيهات تصل إلى هاتف المحامي على واتساب (L-06) — اشتراك اختياري، مغلق افتراضيًا.
//
// - تُنشأ من إشعارات المنصة نفسها (notifications.notify → onNotify) لأنواع محددة فقط: إسناد جديد، رأي معاد، موعد يقترب،
//   تأخر، جلسة بلا نتيجة، رد من الإدارة؛ إضافة إلى ملخص صباحي في الثامنة إن وُجد ما هو مطلوب.
// - النص يُبنى من الأكواد والتواريخ ورابط المنصة فقط: لا اسم مستفيد/ة ولا هاتف ولا سؤال ولا وقائع (اختبار يتحقق من ذلك).
// - تنبيه واحد لكل (محامٍ، نوع، عنصر) [UNIQUE في lawyer_alerts]، و6 تنبيهات بحد أقصى لكل محامٍ في اليوم،
//   ولا إرسال بين 10 م و8 ص بتوقيت القاهرة: ما يقع فيها يُرسل في الثامنة صباحًا.
// - الإرسال بقالب واتساب المربوط بغرض «lawyer_alert» فقط (لا يُستخدم قالب تحديثات الملف الموجه للمستفيدين)، ويُسجَّل
//   في صندوق الصادر المعتاد؛ في وضع المحاكاة (النسخة التجريبية) يُسجَّل دون إرسال.
import { nowIso, addHours, addDays, cairoParts, cairoDayKey, cairoLocalToIso, arabicCount, badRequest, ApiError, isEgyptianMobile, normalizePhone } from '../util.js';
import { RateLimiter } from '../auth.js';

export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;
export const DAILY_CAP = 6;
const THINGS = ['أمر واحد', 'أمران', 'أمور', 'أمرًا'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const TEST_TEXT = 'هذا تنبيه تجريبي من منصة الدعم القانوني.';
export const PHONE_REQUIRED = 'أدخل رقم الموبايل لتصلك التنبيهات.';

/** «الجمعة 9 أكتوبر» بتوقيت القاهرة (بلا سنة) */
export function dayMonth(iso) {
  const p = cairoParts(iso);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return `${AR_DAYS[dow]} ${p.day} ${AR_MONTHS[p.month - 1]}`;
}

/** هل اللحظة ضمن ساعات الهدوء؟ وأقرب الثامنة صباحًا بعدها */
export function quietUntil(iso) {
  const p = cairoParts(iso);
  if (p.hour >= QUIET_END_HOUR && p.hour < QUIET_START_HOUR) return null;
  // بعد العاشرة مساءً: ثامنة الغد؛ قبل الثامنة صباحًا: ثامنة اليوم نفسه
  const base = p.hour >= QUIET_START_HOUR ? cairoParts(addHours(iso, 12)) : p;
  return cairoLocalToIso(base.year, base.month, base.day, QUIET_END_HOUR, 0);
}

/** نصوص الرسائل ({link} = الرابط المطلق للمنصة) */
export const ALERT_TEXT = {
  'assignment.new': ({ code, due }) => (due ? `أُسند إليك ملف جديد ${code}. سلّم رأيك قبل ${dayMonth(due)}.` : `أُسند إليك ملف جديد ${code}.`),
  'opinion.returned': ({ code }) => `أعادت الإدارة رأيك في ${code} بملاحظات.`,
  'assignment.due_soon': ({ code }) => `يتبقى يوم على موعد تسليم رأيك في ${code}.`,
  'assignment.overdue': ({ code }) => `تأخر رأيك في ${code}. قدّمه أو اطلب مهلة.`,
  'hearing.outcome_missing': ({ code }) => `لم تُسجَّل نتيجة جلسة اليوم في ${code}.`,
  admin_reply: ({ code }) => `وصلك رد من الإدارة في ${code}.`,
  digest: ({ n }) => `اليوم مطلوب منك ${arabicCount(n, THINGS)}.`,
};

/** أنواع إشعارات «رد من الإدارة»: إتاحة المعلومة، الإجابة عن سؤال، والبت في طلب المهلة (مسار l-work) */
const ADMIN_REPLY_TYPES = /^(info_request\.(shared|answered|extension_(approved|rejected|decided))|extension\.(approved|rejected|decided)|question\.answered)$/;

export function createLawyerAlerts(app) {
  const { db, config } = app;
  const testLimiter = new RateLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
  let lastOrigin = '';

  /** الرابط المطلق للمنصة: PUBLIC_BASE_URL، وفي النسخة التجريبية فقط آخر عنوان فُتحت منه المنصة */
  function baseUrl() {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    return config.demo ? lastOrigin : '';
  }
  function linkFor(path) {
    const b = baseUrl();
    return b ? `${b}/app#${path}` : '';
  }

  function available() {
    if (!app.whatsapp?.configured) return !!config.demo; // محاكاة في النسخة التجريبية فقط (لا وعد بإرسال لن يحدث)
    try {
      const m = (app.messaging?.mappings?.() || []).find((x) => x.purpose === 'lawyer_alert');
      return !!m && m.state === 'ok';
    } catch {
      return false;
    }
  }

  function lawyerRow(id) {
    return db.get("SELECT id, role, active, phone, alert_whatsapp, invite_pending FROM users WHERE id = ? AND role = 'lawyer'", id);
  }

  /** يحوّل إشعارًا داخل المنصة إلى {type, entity, text, path} أو null إن لم يكن من الأنواع المرسلة */
  function fromNotification(n, t) {
    const link = String(n.link || '');
    const asg = /#\/my\/assignments\/(\d+)/.exec(link);
    const assignment = (id) =>
      db.get('SELECT a.id, a.due_at, a.status, c.code FROM assignments a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', Number(id));
    switch (n.type) {
      case 'assignment.new': {
        const a = asg && assignment(asg[1]);
        if (!a) return null;
        return { type: n.type, entity: `assignment:${a.id}`, text: ALERT_TEXT[n.type]({ code: a.code, due: a.due_at }), path: `/my/assignments/${a.id}` };
      }
      case 'opinion.returned': {
        const a = asg && assignment(asg[1]);
        if (!a) return null;
        const v = db.value("SELECT MAX(version) FROM opinions WHERE assignment_id = ? AND status = 'returned'", a.id) || 0;
        return { type: n.type, entity: `assignment:${a.id}:v${v}`, text: ALERT_TEXT[n.type]({ code: a.code }), path: `/my/assignments/${a.id}/write` };
      }
      case 'assignment.due_soon':
      case 'assignment.overdue': {
        const a = asg && assignment(asg[1]);
        if (!a) return null;
        return { type: n.type, entity: `assignment:${a.id}:${a.due_at || ''}`, text: ALERT_TEXT[n.type]({ code: a.code }), path: `/my/assignments/${a.id}` };
      }
      case 'hearing.outcome_missing': {
        const m = /#\/my\/matters\/(\d+)(?:\?outcome=(\d+))?/.exec(link);
        if (!m) return null;
        const matter = db.get('SELECT id, code FROM matters WHERE id = ?', Number(m[1]));
        if (!matter) return null;
        return {
          type: n.type,
          entity: m[2] ? `event:${Number(m[2])}` : `matter:${matter.id}:${cairoDayKey(t)}`,
          text: ALERT_TEXT[n.type]({ code: matter.code }),
          path: `/my/matters/${matter.id}${m[2] ? `?outcome=${Number(m[2])}` : ''}`,
        };
      }
      default: {
        if (!ADMIN_REPLY_TYPES.test(String(n.type || ''))) return null;
        const a = asg && assignment(asg[1]);
        if (!a) return null;
        // رد واحد لكل إسناد في اليوم: تكفي رسالة تدعوه لفتح المنصة
        return { type: 'admin_reply', entity: `assignment:${a.id}:${cairoDayKey(t)}`, text: ALERT_TEXT.admin_reply({ code: a.code }), path: `/my/assignments/${a.id}?tab=requests` };
      }
    }
  }

  function sentToday(userId, t) {
    const p = cairoParts(t);
    const start = cairoLocalToIso(p.year, p.month, p.day, 0, 0);
    return Number(db.value("SELECT COUNT(*) FROM lawyer_alerts WHERE user_id = ? AND status IN ('sent','simulated') AND type != 'test' AND sent_at >= ?", userId, start));
  }

  /** يرسل تنبيهًا مسجلًا (أو يتخطاه) — متزامن؛ الإرسال الفعلي لواتساب يكمل في الخلفية عبر engine.record */
  function deliver(row, { force = false } = {}) {
    const t = nowIso();
    const u = lawyerRow(row.user_id);
    const skip = (error) => {
      db.run("UPDATE lawyer_alerts SET status = 'skipped', error = ?, sent_at = NULL WHERE id = ?", error, row.id);
      return { status: 'skipped', error };
    };
    if (!u || !u.active) return skip('inactive');
    if (!force && !u.alert_whatsapp) return skip('disabled');
    const phone = u.phone && isEgyptianMobile(u.phone) ? u.phone : null;
    if (!phone) return skip('no_phone');
    if (!available()) return skip('unavailable');
    if (!force && row.type !== 'test' && sentToday(u.id, t) >= DAILY_CAP) return skip('daily_cap');
    const link = linkFor(row.link || '/my');
    const body = link ? `${row.body} ${link}` : row.body;
    const msg = app.engine.record({
      client_id: null,
      channel: 'whatsapp',
      to: phone,
      body,
      automated: true,
      rule: 'lawyer_alert',
      meta: { wa: { purpose: 'lawyer_alert', force_template: true }, vars: { body }, lawyer_alert: { alert_id: row.id, type: row.type } },
    });
    const status = msg.status === 'simulated' ? 'simulated' : msg.status === 'failed' ? 'failed' : 'sent';
    db.run('UPDATE lawyer_alerts SET status = ?, message_id = ?, sent_at = ?, error = ? WHERE id = ?', status, msg.id, t, msg.error || null, row.id);
    return { status, message_id: msg.id };
  }

  /** تسجيل تنبيه (مرة واحدة لكل نوع وعنصر) ثم إرساله الآن أو في الثامنة صباحًا */
  function enqueue(userId, a, t = nowIso()) {
    const quiet = quietUntil(t);
    const r = db.run(
      `INSERT OR IGNORE INTO lawyer_alerts (user_id, type, entity, body, link, status, send_after, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`,
      userId,
      a.type,
      a.entity,
      a.text,
      a.path || '/my',
      quiet || t,
      t,
    );
    if (!r.changes) return null; // سبق التنبيه بهذا العنصر
    const row = db.get('SELECT * FROM lawyer_alerts WHERE user_id = ? AND type = ? AND entity = ?', userId, a.type, a.entity);
    if (quiet) return { ...row, queued_until: quiet };
    return { ...row, ...deliver(row) };
  }

  const svc = {
    available,
    quietUntil,
    fromNotification,

    /** يُستدعى من notifications.notify بعد تسجيل الإشعار داخل المنصة (لا يكسر الإشعار أبدًا) */
    onNotify(userIds, n) {
      const t = nowIso();
      for (const uid of userIds) {
        try {
          const u = lawyerRow(uid);
          if (!u || !u.active || u.invite_pending || !u.alert_whatsapp) continue;
          const a = fromNotification(n, t);
          if (!a) continue;
          if (!available()) continue;
          enqueue(u.id, a, t);
        } catch (e) {
          app.log('lawyer alert failed', e);
        }
        try {
          app.webPush?.onNotify?.(uid, n);
        } catch (e) {
          app.log('web push failed', e);
        }
      }
    },

    /** ما يُضاف لاستجابة /api/account لحساب المحامي */
    accountFields(u) {
      if (u.role !== 'lawyer') return {};
      return {
        alert_whatsapp: !!u.alert_whatsapp,
        alerts_available: available(),
        calendar_feed_active: !!db.get('SELECT 1 FROM calendar_feeds WHERE user_id = ?', u.id),
      };
    },

    /**
     * تعديل الاشتراك من PATCH /api/account: للمحامين فقط، ويشترط رقم موبايل مصريًا صحيحًا عند التفعيل.
     * @returns {object} حقول تُضاف إلى patch المستخدم
     */
    profilePatch(u, body, patch) {
      if (body.alert_whatsapp === undefined) return {};
      if (u.role !== 'lawyer') throw badRequest('تنبيهات واتساب متاحة لحسابات المحامين فقط');
      const on = body.alert_whatsapp === true || body.alert_whatsapp === 1 || body.alert_whatsapp === '1' || body.alert_whatsapp === 'true';
      if (!on) return { alert_whatsapp: 0 };
      if (!available()) throw new ApiError(409, 'تنبيهات واتساب غير متاحة حاليًا. ستجد كل التنبيهات داخل المنصة.', 'alerts_unavailable');
      const phone = patch.phone !== undefined ? patch.phone : u.phone;
      if (!phone || !isEgyptianMobile(normalizePhone(phone))) throw badRequest(PHONE_REQUIRED, { fields: { phone: PHONE_REQUIRED } });
      return { alert_whatsapp: 1 };
    },

    /** «جرّب التنبيه»: 3 مرات في الساعة لكل حساب، ويُرسل فورًا ولو في ساعات الهدوء (طلبه صاحب الحساب الآن) */
    sendTest(user) {
      if (user.role !== 'lawyer') throw badRequest('تنبيهات واتساب متاحة لحسابات المحامين فقط');
      testLimiter.hit(`test:${user.id}`);
      const u = lawyerRow(user.id);
      if (!available()) throw new ApiError(409, 'تنبيهات واتساب غير متاحة حاليًا. ستجد كل التنبيهات داخل المنصة.', 'alerts_unavailable');
      if (!u.phone || !isEgyptianMobile(u.phone)) throw badRequest(PHONE_REQUIRED, { fields: { phone: PHONE_REQUIRED } });
      const t = nowIso();
      db.run(
        "INSERT INTO lawyer_alerts (user_id, type, entity, body, link, status, send_after, created_at) VALUES (?, 'test', ?, ?, '/my', 'queued', ?, ?)",
        u.id,
        `test:${t}:${Math.random().toString(36).slice(2, 8)}`,
        TEST_TEXT,
        t,
        t,
      );
      const row = db.get("SELECT * FROM lawyer_alerts WHERE user_id = ? AND type = 'test' ORDER BY id DESC LIMIT 1", u.id);
      const r = deliver(row, { force: true });
      if (r.status === 'skipped') throw new ApiError(409, 'تعذر إرسال التنبيه التجريبي الآن. حاول لاحقًا.', 'alert_failed');
      return { ok: true, status: r.status, simulated: r.status === 'simulated' };
    },

    /** يحفظ آخر عنوان فُتحت منه المنصة (للنسخة التجريبية بلا PUBLIC_BASE_URL فقط) */
    noteRequest(ctx) {
      if (config.publicBaseUrl || !config.demo) return;
      const host = String(ctx?.req?.headers?.host || '');
      if (/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) lastOrigin = `http://${host}`;
    },

    /** تذكير «يتبقى يوم» قبل موعد التسليم بـ 24 ساعة (إشعار داخل المنصة لكل المحامين، وواتساب لمن اشترك) */
    runDueSoon(t = nowIso()) {
      const rows = db.all(
        `SELECT a.id, a.lawyer_id, a.due_at, c.code FROM assignments a JOIN cases c ON c.id = a.case_id JOIN users u ON u.id = a.lawyer_id
         WHERE a.status IN ('assigned','in_progress','returned') AND c.status != 'closed' AND u.active = 1
           AND a.due_at > ? AND a.due_at <= ?`,
        t,
        addHours(t, 24),
      );
      let n = 0;
      for (const a of rows) {
        const key = `assignment:${a.id}:${a.due_at}`;
        if (db.get("SELECT 1 FROM automation_runs WHERE rule_key = 'assignment_due_soon' AND dedupe_key = ?", key)) continue;
        db.tx(() => {
          app.notifications.notify(a.lawyer_id, {
            type: 'assignment.due_soon',
            title: `يتبقى يوم على موعد تسليم رأيك في ${a.code}`,
            body: 'سلّم رأيك أو اطلب مهلة من داخل الإسناد.',
            link: `#/my/assignments/${a.id}`,
          });
          db.insert('automation_runs', { rule_key: 'assignment_due_soon', dedupe_key: key, entity_type: 'assignment', entity_id: a.id, result: 'notified', created_at: t });
        });
        n++;
      }
      return n;
    },

    /** الملخص الصباحي في الثامنة: فقط لمن اشترك وعنده ما هو مطلوب اليوم */
    runDigest(t = nowIso()) {
      const p = cairoParts(t);
      if (p.hour < QUIET_END_HOUR || p.hour >= 12 || !available()) return 0;
      const day = cairoDayKey(t);
      const users = db.all("SELECT id FROM users WHERE role = 'lawyer' AND active = 1 AND alert_whatsapp = 1 AND invite_pending = 0");
      let n = 0;
      for (const u of users) {
        if (db.get("SELECT 1 FROM lawyer_alerts WHERE user_id = ? AND type = 'digest' AND entity = ?", u.id, `day:${day}`)) continue;
        const count = app.lawyerToday ? app.lawyerToday.actionCount({ id: u.id, role: 'lawyer' }) : 0;
        if (!count) continue;
        if (enqueue(u.id, { type: 'digest', entity: `day:${day}`, text: ALERT_TEXT.digest({ n: count }), path: '/my' }, t)) n++;
      }
      return n;
    },

    /** إرسال ما حان موعده من قائمة الانتظار (بعد ساعات الهدوء) */
    flush(t = nowIso()) {
      if (quietUntil(t)) return 0;
      const rows = db.all("SELECT * FROM lawyer_alerts WHERE status = 'queued' AND send_after <= ? ORDER BY id LIMIT 200", t);
      for (const row of rows) deliver(row);
      // ما بقي في الانتظار أكثر من يوم (الخادم كان متوقفًا) لا يُرسل متأخرًا
      db.run("UPDATE lawyer_alerts SET status = 'skipped', error = 'expired' WHERE status = 'queued' AND send_after < ?", addDays(t, -1));
      return rows.length;
    },

    /** المهمة الدورية (كل 5 دقائق): تذكير يتبقى يوم، الملخص الصباحي، ثم إرسال قائمة الانتظار */
    async runScheduled() {
      const t = nowIso();
      return { due_soon: svc.runDueSoon(t), digest: svc.runDigest(t), sent: svc.flush(t) };
    },

    /** سجل تنبيهات المحامي (للاختبارات والتشخيص) */
    history(userId, limit = 20) {
      return db.all('SELECT id, type, entity, body, link, status, send_after, sent_at, error FROM lawyer_alerts WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit);
    },
  };

  app.jobs?.register('lawyer_alerts', { everyMinutes: 5, label: 'تنبيهات المحامين: تذكير قبل الموعد بيوم والملخص الصباحي وقائمة الانتظار', run: () => svc.runScheduled() });
  return svc;
}
