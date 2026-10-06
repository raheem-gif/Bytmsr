// الأتمتة المرتبطة بما يحدث داخل الملف (وليست رسائل تسويقية عامة):
// تذكير العميل بالجلسات، بالفواتير المتأخرة، بالمستندات الناقصة، وتنبيه الإدارة/المحامي بالمواعيد الإجرائية والتأخير.
import { nowIso, addDays, parseJson, badRequest, notFound, v, arabicDate, arabicTime, fromMinor, truncate } from '../util.js';
import { LABELS, DEFAULT_AUTOMATION_RULES, LEGACY_AUTOMATION_TEMPLATES } from '../constants.js';

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null ? String(values[k]) : m));
}

export function createAutomations(app) {
  const { db } = app;
  let running = false;

  function ensureRules() {
    const t = nowIso();
    for (const [key, def] of Object.entries(DEFAULT_AUTOMATION_RULES)) {
      db.run(
        'INSERT OR IGNORE INTO automation_rules (key, enabled, params, updated_at) VALUES (?, ?, ?, ?)',
        key,
        def.enabled ? 1 : 0,
        JSON.stringify(def.params),
        t,
      );
    }
  }

  function rule(key) {
    const r = db.get('SELECT * FROM automation_rules WHERE key = ?', key);
    if (!r) return null;
    const params = { ...DEFAULT_AUTOMATION_RULES[key].params, ...parseJson(r.params, {}) };
    // قالب افتراضي قديم لم تعدّله الإدارة ← القالب الافتراضي الحالي
    if (params.template && (LEGACY_AUTOMATION_TEMPLATES[key] || []).includes(params.template)) params.template = DEFAULT_AUTOMATION_RULES[key].params.template;
    return { key, enabled: !!r.enabled, params };
  }

  /** اسم المؤسسة لتوقيع رسائل العميل الآلية ({org_name}) */
  const orgName = () => app.settings.get('org_name') || 'بيوت مصر';

  /** تنفيذ مرة واحدة لكل مفتاح (يمنع تكرار التذكير لنفس الحدث) */
  function once(ruleKey, dedupeKey, entityType, entityId, fn) {
    const exists = db.get('SELECT 1 FROM automation_runs WHERE rule_key = ? AND dedupe_key = ?', ruleKey, dedupeKey);
    if (exists) return false;
    let result;
    db.tx(() => {
      result = fn();
      db.insert('automation_runs', {
        rule_key: ruleKey,
        dedupe_key: dedupeKey,
        entity_type: entityType,
        entity_id: entityId,
        result: typeof result === 'string' ? result : JSON.stringify(result ?? 'ok'),
        created_at: nowIso(),
      });
    });
    return true;
  }

  const runners = {
    hearing_reminder(r) {
      const t = nowIso();
      const until = addDays(t, Number(r.params.days_before) || 3);
      const events = db.all(
        `SELECT e.*, m.code AS matter_code, m.court AS matter_court, m.client_id, m.case_id, c.intake_id FROM matter_events e
         JOIN matters m ON m.id = e.matter_id JOIN cases c ON c.id = m.case_id
         WHERE e.status = 'scheduled' AND e.client_attendance_required = 1 AND e.starts_at > ? AND e.starts_at <= ? AND m.status != 'closed'`,
        t,
        until,
      );
      let n = 0;
      for (const e of events) {
        if (!e.client_text_approved) {
          // موعد سجله المحامي أو عدّله: لا يصل للعميل نص من المحامي قبل اعتماد الإدارة، فننبه الإدارة مرة واحدة
          once('hearing_reminder_held', `event:${e.id}:${e.starts_at}`, 'matter_event', e.id, () => {
            app.notifications.notifyStaff({
              type: 'event.reminder_held',
              title: `تذكير العميل بموعد في الملف ${e.matter_code} بانتظار اعتمادك`,
              body: 'سجّل المحامي هذا الموعد أو عدّله، ولن يُرسل التذكير للعميل قبل اعتماد بياناته من صفحة الملف المستمر.',
              link: `#/matters/${e.matter_id}`,
            });
            return 'held';
          });
          continue;
        }
        const did = once('hearing_reminder', `event:${e.id}:${e.starts_at}`, 'matter_event', e.id, () => {
          const vars = {
            event_kind: LABELS.event_kind[e.kind],
            matter_code: e.matter_code,
            date: arabicDate(e.starts_at),
            time: arabicTime(e.starts_at),
            location: e.location || 'المحكمة المختصة',
            title: e.title,
            org_name: orgName(),
          };
          const body = fill(r.params.template, vars);
          const msg = app.engine.sendToClient({
            client_id: e.client_id,
            intake_id: e.intake_id,
            case_id: e.case_id,
            matter_id: e.matter_id,
            body,
            automated: true,
            rule: 'hearing_reminder',
            // متغيرات القالب المربوط بالقاعدة عند الإرسال خارج نافذة الـ 24 ساعة
            meta: { vars },
          });
          app.activity.log({ matter_id: e.matter_id, case_id: e.case_id, actor: { kind: 'system' }, type: 'automation.hearing_reminder', summary: `أُرسل تذكير آلي للعميل بموعد (${LABELS.event_kind[e.kind]} — ${arabicDate(e.starts_at)} الساعة ${arabicTime(e.starts_at)})` });
          return { message_id: msg.id };
        });
        if (did) n++;
      }
      return n;
    },

    invoice_reminder(r) {
      const t = nowIso();
      const every = Number(r.params.repeat_every_days) || 7;
      const max = Number(r.params.max_reminders) || 3;
      const invoices = db.all(
        `SELECT i.*, c.intake_id FROM invoices i LEFT JOIN cases c ON c.id = i.case_id
         WHERE i.status IN ('unpaid','partially_paid') AND i.due_at < ? AND i.reminder_count < ?`,
        t,
        max,
      );
      let n = 0;
      for (const i of invoices) {
        if (i.last_reminder_at && addDays(i.last_reminder_at, every) > t) continue;
        const paid = Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?', i.id));
        const did = once('invoice_reminder', `invoice:${i.id}:${i.reminder_count + 1}`, 'invoice', i.id, () => {
          const vars = {
            invoice_number: i.number,
            amount: fromMinor(i.amount_minor - paid).toLocaleString('en-US'),
            due_date: arabicDate(i.due_at, { weekday: false }),
            org_name: orgName(),
          };
          const body = fill(r.params.template, vars);
          const msg = app.engine.sendToClient({ client_id: i.client_id, intake_id: i.intake_id, case_id: i.case_id, matter_id: i.matter_id, body, automated: true, rule: 'invoice_reminder', meta: { vars } });
          db.update('invoices', i.id, { reminder_count: i.reminder_count + 1, last_reminder_at: t });
          app.activity.log({ matter_id: i.matter_id, case_id: i.case_id, actor: { kind: 'system' }, type: 'automation.invoice_reminder', summary: `أُرسل تذكير آلي بالفاتورة ${i.number}` });
          return { message_id: msg.id };
        });
        if (did) n++;
      }
      return n;
    },

    document_reminder(r) {
      const t = nowIso();
      const after = Number(r.params.after_days) || 2;
      const every = Number(r.params.repeat_every_days) || 3;
      const max = Number(r.params.max_reminders) || 2;
      const list = db.all(
        `SELECT ir.*, c.code AS case_code, c.client_id, c.intake_id FROM info_requests ir JOIN cases c ON c.id = ir.case_id
         WHERE ir.status = 'sent_to_client' AND ir.sent_at <= ? AND ir.reminder_count < ? AND c.status != 'closed'
           -- إذا كتب العميل بعد إرسال الطلب (أو بعد آخر تذكير) فقد يكون ردًا لم تسجله الإدارة بعد: لا نذكّره
           -- (الرسائل المرتبطة صراحة بطلب آخر، كالرد عليه من البوابة، لا تُحتسب)
           AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.client_id = c.client_id AND m.direction = 'in'
                           AND m.created_at > COALESCE(ir.last_reminder_at, ir.sent_at)
                           AND (json_extract(m.meta, '$.info_request_id') IS NULL OR json_extract(m.meta, '$.info_request_id') = ir.id))`,
        addDays(t, -after),
        max,
      );
      let n = 0;
      for (const ir of list) {
        if (ir.last_reminder_at && addDays(ir.last_reminder_at, every) > t) continue;
        const did = once('document_reminder', `inforeq:${ir.id}:${ir.reminder_count + 1}`, 'info_request', ir.id, () => {
          const vars = { case_code: ir.case_code, request: truncate(ir.client_message || ir.question, 200), org_name: orgName() };
          const body = fill(r.params.template, vars);
          const msg = app.engine.sendToClient({ client_id: ir.client_id, intake_id: ir.intake_id, case_id: ir.case_id, body, automated: true, rule: 'document_reminder', meta: { info_request_id: ir.id, vars } });
          db.update('info_requests', ir.id, { reminder_count: ir.reminder_count + 1, last_reminder_at: t });
          app.activity.log({ case_id: ir.case_id, actor: { kind: 'system' }, type: 'automation.document_reminder', summary: `أُرسل تذكير آلي للعميل ب${LABELS.info_request_kind[ir.kind]} لم يرد عليه بعد` });
          return { message_id: msg.id };
        });
        if (did) n++;
      }
      return n;
    },

    procedural_deadline(r) {
      const t = nowIso();
      const until = addDays(t, Number(r.params.days_before) || 3);
      const tasks = db.all(
        `SELECT k.*, m.code AS matter_code, m.responsible_lawyer_id FROM matter_tasks k JOIN matters m ON m.id = k.matter_id
         WHERE k.status = 'open' AND k.procedural = 1 AND k.due_at IS NOT NULL AND k.due_at <= ? AND m.status != 'closed'`,
        until,
      );
      let n = 0;
      for (const k of tasks) {
        const overdue = k.due_at < t;
        const key = `${overdue ? 'overdue' : 'soon'}:task:${k.id}:${k.due_at}`;
        const did = once('procedural_deadline', key, 'matter_task', k.id, () => {
          const title = overdue ? `موعد إجرائي فات دون تسجيل الإجراء: ${truncate(k.title, 80)}` : `موعد إجرائي يقترب: ${truncate(k.title, 80)}`;
          const body = `الملف ${k.matter_code} — الموعد: ${arabicDate(k.due_at)}`;
          const lawyerIds = [k.assignee_user_id, k.responsible_lawyer_id].filter(Boolean);
          for (const uid of new Set(lawyerIds)) {
            const u = db.get('SELECT role, active FROM users WHERE id = ?', uid);
            // لا نرسل تفاصيل الملف لحساب موقوف أو لمحامٍ لم يعد مسؤولًا عن الملف
            if (!u?.active || (u.role === 'lawyer' && uid !== k.responsible_lawyer_id)) continue;
            app.notifications.notify(uid, { type: 'deadline', title, body, link: u?.role === 'lawyer' ? `#/my/matters/${k.matter_id}` : `#/matters/${k.matter_id}` });
          }
          app.notifications.notifyStaff({ type: 'deadline', title, body, link: `#/matters/${k.matter_id}` });
          return 'notified';
        });
        if (did) n++;
      }
      return n;
    },

    assignment_overdue() {
      const t = nowIso();
      const list = db.all(
        `SELECT a.*, c.code AS case_code, c.case_manager_id, u.name AS lawyer_name FROM assignments a
         JOIN cases c ON c.id = a.case_id JOIN users u ON u.id = a.lawyer_id
         WHERE a.status IN ('assigned','in_progress','returned') AND a.due_at < ? AND c.status != 'closed'`,
        t,
      );
      let n = 0;
      for (const a of list) {
        const did = once('assignment_overdue', `assignment:${a.id}:${a.due_at}`, 'assignment', a.id, () => {
          app.notifications.notify(a.lawyer_id, {
            type: 'assignment.overdue',
            title: `تجاوزت المدة المطلوبة للرد في الملف ${a.case_code}`,
            body: 'يرجى تقديم رأيك أو التواصل مع الإدارة لتمديد الموعد.',
            link: `#/my/assignments/${a.id}`,
          });
          app.notifications.notifyStaff(
            { type: 'assignment.overdue', title: `تأخر ${a.lawyer_name} في الملف ${a.case_code}`, body: `الموعد كان ${arabicDate(a.due_at)}`, link: `#/cases/${a.case_id}` },
            { caseManagerId: a.case_manager_id },
          );
          app.activity.log({ case_id: a.case_id, actor: { kind: 'system' }, type: 'automation.assignment_overdue', summary: `نبّه النظام إلى تأخر ${a.lawyer_name} عن الموعد المطلوب` });
          return 'notified';
        });
        if (did) n++;
      }
      return n;
    },

    // (الإصدار 9 — وحدة messaging) استبيان رضا العميل بعد إرسال الرد النهائي؛ التفاصيل في app.messaging.runSurveys
    satisfaction_survey(r) {
      app.messaging.expireSurveys();
      return app.messaging.runSurveys(r.params, { once });
    },
  };

  /** وصف مقروء لمصدر كل تشغيل آلي مع روابط الملف */
  function describeRun(run) {
    let ref = null;
    switch (run.entity_type) {
      case 'matter_event':
        ref = db.get('SELECT m.id AS matter_id, m.code AS entity_code, m.case_id FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE e.id = ?', run.entity_id);
        break;
      case 'matter_task':
        ref = db.get('SELECT m.id AS matter_id, m.code AS entity_code, m.case_id FROM matter_tasks k JOIN matters m ON m.id = k.matter_id WHERE k.id = ?', run.entity_id);
        break;
      case 'invoice':
        ref = db.get('SELECT i.number AS entity_code, i.matter_id, i.case_id FROM invoices i WHERE i.id = ?', run.entity_id);
        break;
      case 'info_request':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, NULL AS matter_id FROM info_requests r JOIN cases c ON c.id = r.case_id WHERE r.id = ?', run.entity_id);
        break;
      case 'assignment':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, NULL AS matter_id FROM assignments a JOIN cases c ON c.id = a.case_id WHERE a.id = ?', run.entity_id);
        break;
      case 'case':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, c.matter_id FROM cases c WHERE c.id = ?', run.entity_id);
        break;
      default:
        break;
    }
    return { ...run, entity_code: ref?.entity_code ?? null, case_id: ref?.case_id ?? null, matter_id: ref?.matter_id ?? null };
  }

  const svc = {
    ensureRules,

    list() {
      ensureRules();
      return Object.keys(DEFAULT_AUTOMATION_RULES).map((key) => {
        const r = rule(key);
        const runs = db.all('SELECT * FROM automation_runs WHERE rule_key = ? ORDER BY created_at DESC LIMIT 10', key).map(describeRun);
        const count = Number(db.value('SELECT COUNT(*) FROM automation_runs WHERE rule_key = ?', key));
        return { ...r, label: LABELS.automation_rule[key], total_runs: count, recent_runs: runs };
      });
    },

    update(key, body, actor) {
      if (!DEFAULT_AUTOMATION_RULES[key]) throw notFound('القاعدة غير موجودة');
      ensureRules();
      const current = rule(key);
      const params = { ...current.params };
      const def = DEFAULT_AUTOMATION_RULES[key].params;
      if (body.params && typeof body.params === 'object') {
        for (const [k, val] of Object.entries(body.params)) {
          if (!(k in def)) continue;
          if (k === 'template') params[k] = v.str(val, 'نص الرسالة', { required: true, max: 1000 });
          else {
            // الصفر كان يعود صامتًا للقيمة الافتراضية؛ إيقاف القاعدة يكون بمفتاح التفعيل
            if (Number(val) === 0) throw badRequest('القيمة يجب أن تكون ١ على الأقل. لإيقاف هذه التذكيرات أوقف القاعدة من مفتاح التفعيل');
            params[k] = v.int(val, 'القيمة', { required: true, min: 1, max: 365 });
          }
        }
      }
      const enabled = body.enabled !== undefined ? (v.bool(body.enabled) ? 1 : 0) : current.enabled ? 1 : 0;
      db.run('UPDATE automation_rules SET enabled = ?, params = ?, updated_by = ?, updated_at = ? WHERE key = ?', enabled, JSON.stringify(params), actor.id, nowIso(), key);
      return rule(key);
    },

    /** تشغيل كل القواعد المفعلة (يُستدعى دوريًا من المجدول أو يدويًا) */
    runAll() {
      if (running) return { skipped: true };
      running = true;
      try {
        ensureRules();
        const summary = {};
        for (const key of Object.keys(runners)) {
          const r = rule(key);
          if (!r?.enabled) {
            summary[key] = 'disabled';
            continue;
          }
          try {
            summary[key] = runners[key](r);
          } catch (e) {
            app.log(`automation ${key} failed`, e);
            summary[key] = 'error';
          }
        }
        return summary;
      } finally {
        running = false;
      }
    },

    outbox({ status, limit = 200 } = {}) {
      const where = ["m.direction = 'out'"];
      const params = [];
      if (status && LABELS.message_status[status]) {
        where.push('m.status = ?');
        params.push(status);
      }
      return db
        .all(
          `SELECT m.*, cl.code AS client_code, cl.name AS client_name, c.code AS case_code, mt.code AS matter_code, u.name AS author_name
           FROM messages m LEFT JOIN clients cl ON cl.id = m.client_id LEFT JOIN cases c ON c.id = m.case_id
           LEFT JOIN matters mt ON mt.id = m.matter_id LEFT JOIN users u ON u.id = m.author_user_id
           WHERE ${where.join(' AND ')} ORDER BY m.id DESC LIMIT ?`,
          ...params,
          Math.min(Number(limit) || 200, 1000),
        )
        .map((m) => ({ ...m, meta: parseJson(m.meta, {}), automated: !!m.automated }));
    },

    validateTemplate(key, template) {
      if (!DEFAULT_AUTOMATION_RULES[key]) throw badRequest('القاعدة غير موجودة');
      return template;
    },
  };
  return svc;
}
