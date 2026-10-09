// الأتمتة المرتبطة بما يحدث داخل الملف (وليست رسائل تسويقية عامة):
// تذكير العميل بالجلسات، بالفواتير المتأخرة، بالمستندات الناقصة، وتنبيه الإدارة/المحامي بالمواعيد الإجرائية والتأخير.
import { nowIso, addDays, parseJson, badRequest, notFound, v, arabicDate, arabicTime, fromMinor, truncate } from '../util.js';
import { spokenTime } from '../util.js'; // v9.1 b-site (B91-10)
import { withClientNote } from './portal-v91.js'; // v9.1 fixes: «هاتي معاكي» المعتمدة في نص التذكير
import { LABELS, DEFAULT_AUTOMATION_RULES, LEGACY_AUTOMATION_TEMPLATES } from '../constants.js';
import { STORY_AUTO_RULES } from '../constants.js'; // v9.2 بوابة K7

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
  const orgName = () => app.brand.displayName(); // v10 experience (H-E3): اسم المكتب كما يراه العملاء

  // ───────────── v9.1 b-site (B91-01/B91-10) ─────────────
  /**
   * نص رسالة المستفيد/ة من قالب القاعدة: {first_name} بالكنية، {ref} رقم الطلب REQ، {portal_link} رابط صفحتها
   * (يُصدر فقط إن احتاجه القالب وكانت القصة مؤكدة)، ورموز النوع {ي}/{ة} حسب صيغة المخاطبة.
   */
  /**
   * v11 segment-server (S11 §10.3، L11-25): نص القاعدة بنبرة القصة — الأفراد والشركات (أو «غير محدد») ← template_paid،
   * ولا يصلهم نص الخيري أبدًا.
   */
  function templateFor(r, story) {
    const tone = app.engine.storyTone ? app.engine.storyTone(story) : 'charity';
    if (tone === 'charity') return r.params.template;
    return r.params.template_paid || DEFAULT_AUTOMATION_RULES[r.key]?.params?.template_paid || r.params.template;
  }

  function clientText(template, story, vars) {
    const words = app.engine.clientWords(story);
    const values = { ...vars, first_name: words.first_name, ref: words.ref || vars.ref || '' };
    // رقم واحد تراه المستفيدة (B91-10): {case_code}/{matter_code} في القوالب التي عدّلتها الإدارة أو القوالب المربوطة
    // اسمان بديلان لرقم الطلب REQ، فلا يصل رقمها كود ملف داخلي (INH-/MTR-) أبدًا
    if (words.ref) for (const k of ['case_code', 'matter_code']) if (k in values) values[k] = words.ref;
    // v9.1 fixes: الرابط لا يُصدر هنا ولا يُحفظ في نص الرسالة ولا متغيراتها: {portal_link} يبقى في نص واتساب (wa_text)
    // ويُصدر رابط جديد عند الإرسال الفعلي فقط (engine.renderLinks / messaging.templatePlan) — وللقصة المؤكدة فقط
    delete values.portal_link;
    const text = app.engine.fillClientText(template, values, words.form);
    // النص المحفوظ (للإدارة وصفحة المتابعة) بلا الرابط وعنوانه
    const body = app.engine.withoutLinkLines(text);
    const withLink = /\{portal_link\}/.test(text) && app.engine.isStoryConfirmed(story);
    return { body, wa_text: withLink ? text.trim() : null, vars: { ...values, form: words.form } };
  }

  /**
   * القصة غير مؤكدة الرقم: لا يُرسل التذكير (ولا يصل الرقم أي شيء)، ويُسجَّل التخطي وتُنبَّه الإدارة مرة واحدة لكل (قاعدة، طلب).
   * @returns {boolean} true إذا تُخطي التذكير
   */
  function skipUnconfirmed(ruleKey, story) {
    if (app.engine.isStoryConfirmed(story)) return false;
    const words = app.engine.clientWords(story);
    const intakeId = story.intakeId || null;
    once(ruleKey, `unconfirmed:${ruleKey}:${intakeId ?? `case-${story.caseId ?? '-'}`}`, 'intake', intakeId, () => {
      app.notifications.notifyStaff({
        type: 'automation.unconfirmed',
        title: `لم يُرسل التذكير: رقم المستفيد/ة في الطلب ${words.ref || '—'} غير مؤكد`,
        body: `لم يُرسل التذكير: رقم المستفيد/ة في الطلب ${words.ref || '—'} غير مؤكد. اتصلوا به/بها ثم اضغطوا «تأكيد الهوية».`,
        link: intakeId ? `#/inbox/${intakeId}` : story.caseId ? `#/cases/${story.caseId}` : '#/automations',
      });
      app.activity.log({
        intake_id: intakeId,
        case_id: story.caseId || null,
        matter_id: story.matterId || null,
        client_id: story.clientId,
        actor: { kind: 'system' },
        type: 'automation.skipped_unconfirmed',
        summary: `لم يُرسل تذكير آلي (${LABELS.automation_rule[ruleKey] || ruleKey}) لأن رقم المستفيد/ة غير مؤكد`,
      });
      return 'skipped_unconfirmed';
    });
    return true;
  }

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
      // v9.1 b-portal (B91-13): تذكيران على الأكثر لكل موعد — قبله بـ days_before (3 افتراضيًا) ثم قبله بيوم.
      // days_before رقم (يعدّله مدير النظام) أو مصفوفة مثل [3, 1]؛ لكل مهلة مفتاح once() خاص فلا يتكرر أي منهما.
      const offsets = [...new Set((Array.isArray(r.params.days_before) ? r.params.days_before : [Number(r.params.days_before) || 3, 1]).map(Number).filter((x) => x > 0))].sort((a, b) => b - a);
      const first = offsets[0] || 3;
      const until = addDays(t, first);
      const events = db.all(
        `SELECT e.*, m.code AS matter_code, m.court AS matter_court, m.client_id, m.case_id, c.intake_id FROM matter_events e
         JOIN matters m ON m.id = e.matter_id JOIN cases c ON c.id = m.case_id
         WHERE e.status = 'scheduled' AND e.client_attendance_required = 1 AND e.starts_at > ? AND e.starts_at <= ? AND m.status != 'closed'
           AND c.company_id IS NULL`, // v10 b2b-server (حارس #1): لا تذكير واتساب لملفات الشركات
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
        // v9.1 b-site (B91-01): رقم غير مؤكد ← لا تذكير على واتساب، وتنبيه الإدارة مرة واحدة للقصة
        if (skipUnconfirmed('hearing_reminder', { clientId: e.client_id, intakeId: e.intake_id, caseId: e.case_id, matterId: e.matter_id })) continue;
        // أقرب مهلة دخل فيها الموعد: تذكير «قبلها بيوم» لموعد بعد أقل من يوم، وإلا التذكير الأول (مفتاحه القديم كما هو)
        const offset = [...offsets].reverse().find((d) => e.starts_at <= addDays(t, d)) ?? first;
        if (offset !== first && app.portal?.dayBeforeReminder) {
          const did2 = once('hearing_reminder', `event:${e.id}:${e.starts_at}:d${offset}`, 'matter_event', e.id, () => app.portal.dayBeforeReminder(e, r.params));
          if (did2) n++;
          continue;
        }
        const did = once('hearing_reminder', `event:${e.id}:${e.starts_at}`, 'matter_event', e.id, () => {
          // v9.1 b-site (B91-10): «أهلًا يا {first_name}، عندك جلسة يوم … الساعة 10 الصبح» + رابط صفحتها، بلا أكواد داخلية
          const story = { clientId: e.client_id, intakeId: e.intake_id, caseId: e.case_id, matterId: e.matter_id };
          const filled = clientText(templateFor(r, story), story, {
            event_kind: LABELS.event_kind[e.kind],
            matter_code: e.matter_code, // للقوالب القديمة التي عدّلتها الإدارة فقط
            date: arabicDate(e.starts_at),
            time: arabicTime(e.starts_at),
            time_spoken: spokenTime(e.starts_at),
            location: e.location || e.matter_court || 'المحكمة المختصة',
            title: e.title,
            org_name: orgName(),
          });
          const vars = filled.vars;
          // v9.1 fixes: قائمة «هاتي معاكي» وسطر اللقاء المعتمدان من الإدارة (ملاحظة الموعد) بدل «هاتي معاكي بطاقتك» وحدها
          const eTone = app.engine.storyTone ? app.engine.storyTone(story) : 'charity'; // v11 segment-server
          const body = withClientNote(filled.body, e, vars.form, eTone);
          const waText = filled.wa_text ? withClientNote(filled.wa_text, e, vars.form, eTone) : null;
          const msg = app.engine.sendToClient({
            client_id: e.client_id,
            intake_id: e.intake_id,
            case_id: e.case_id,
            matter_id: e.matter_id,
            body,
            automated: true,
            rule: 'hearing_reminder',
            // متغيرات القالب المربوط بالقاعدة عند الإرسال خارج نافذة الـ 24 ساعة
            meta: { vars, ...(waText ? { wa_text: waText } : {}) },
          });
          if (msg.skipped) return 'skipped_unconfirmed';
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
         WHERE i.status IN ('unpaid','partially_paid') AND i.due_at < ? AND i.reminder_count < ?
           AND (i.client_agreed_at IS NOT NULL OR EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id))
           AND NOT EXISTS (SELECT 1 FROM clients x WHERE x.id = i.client_id AND x.company_id IS NOT NULL)`, // v9.1 b-portal (B91-18): لا تذكير بمبلغ لم توافق عليه المستفيدة (دفع جزء منه موافقة) · v10 b2b-server (حارس #2)
        t,
        max,
      );
      let n = 0;
      for (const i of invoices) {
        if (i.last_reminder_at && addDays(i.last_reminder_at, every) > t) continue;
        // v9.1 b-site (B91-01): رقم غير مؤكد ← لا تذكير على واتساب، وتنبيه الإدارة مرة واحدة للقصة
        const story = { clientId: i.client_id, intakeId: i.intake_id, caseId: i.case_id, matterId: i.matter_id };
        if (skipUnconfirmed('invoice_reminder', story)) continue;
        const paid = Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?', i.id));
        const did = once('invoice_reminder', `invoice:${i.id}:${i.reminder_count + 1}`, 'invoice', i.id, () => {
          // v9.1 b-site (B91-10): المبلغ وسببه بكلمات بسيطة و«ردّي علينا قبل ما تدفعي»
          const filled = clientText(templateFor(r, story), story, {
            invoice_number: i.number,
            amount: fromMinor(i.amount_minor - paid).toLocaleString('en-US'),
            description: i.description || 'مصاريف القضية',
            due_date: arabicDate(i.due_at, { weekday: false }),
            org_name: orgName(),
          });
          const vars = filled.vars;
          const body = filled.body;
          const msg = app.engine.sendToClient({ client_id: i.client_id, intake_id: i.intake_id, case_id: i.case_id, matter_id: i.matter_id, body, automated: true, rule: 'invoice_reminder', meta: { vars, ...(filled.wa_text ? { wa_text: filled.wa_text } : {}) } });
          if (msg.skipped) return 'skipped_unconfirmed';
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
           AND c.company_id IS NULL -- v10 b2b-server (حارس #3): استيضاحات الشركات عبر بوابتها
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
        // v9.1 b-site (B91-01): رقم غير مؤكد ← لا تذكير على واتساب (نص الطلب لا يصل رقمًا ربما كُتب خطأً)، وتنبيه الإدارة مرة واحدة
        const story = { clientId: ir.client_id, intakeId: ir.intake_id, caseId: ir.case_id };
        if (skipUnconfirmed('document_reminder', story)) continue;
        const did = once('document_reminder', `inforeq:${ir.id}:${ir.reminder_count + 1}`, 'info_request', ir.id, () => {
          // v9.1 b-site (B91-10): {ref} رقم الطلب بدل كود الملف ({case_code} يبقى للقوالب القديمة المعدّلة)
          // (v9.1 fixes: طلب المتابعة «لسه محتاجين: …» يُذكر ببنوده فقط بعد «لسه مستنيين منك:»)
          const filled = clientText(templateFor(r, story), story, { case_code: ir.case_code, request: truncate(String(ir.client_message || ir.question).replace(/^لسه محتاجين:\s*/, ''), 200), org_name: orgName() });
          const vars = filled.vars;
          const body = filled.body;
          const msg = app.engine.sendToClient({ client_id: ir.client_id, intake_id: ir.intake_id, case_id: ir.case_id, body, automated: true, rule: 'document_reminder', meta: { info_request_id: ir.id, vars, ...(filled.wa_text ? { wa_text: filled.wa_text } : {}) } });
          if (msg.skipped) return 'skipped_unconfirmed';
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
            // v9.1 l-home (L-12): طلب المهلة صار من داخل الإسناد (L-04)
            body: 'قدّم رأيك أو اطلب مهلة من داخل الإسناد.',
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

    // v9.1 l-court: جلسة انعقدت دون تسجيل نتيجتها ← تنبيه المحامي المسؤول (15:00 يوم الجلسة، ثم 10:00 اليوم التالي)
    hearing_outcome_missing(r) {
      return app.matters.runOutcomeMissing(r.params, { once });
    },
  };

  /** وصف مقروء لمصدر كل تشغيل آلي مع روابط الملف */
  function describeRun(run) {
    let ref = null;
    switch (run.entity_type) {
      case 'matter_event':
        ref = db.get('SELECT m.id AS matter_id, m.code AS entity_code, m.case_id, cl.name AS client_name FROM matter_events e JOIN matters m ON m.id = e.matter_id LEFT JOIN clients cl ON cl.id = m.client_id WHERE e.id = ?', run.entity_id);
        break;
      case 'matter_task':
        ref = db.get('SELECT m.id AS matter_id, m.code AS entity_code, m.case_id, cl.name AS client_name FROM matter_tasks k JOIN matters m ON m.id = k.matter_id LEFT JOIN clients cl ON cl.id = m.client_id WHERE k.id = ?', run.entity_id);
        break;
      case 'invoice':
        ref = db.get('SELECT i.number AS entity_code, i.matter_id, i.case_id, cl.name AS client_name FROM invoices i LEFT JOIN clients cl ON cl.id = i.client_id WHERE i.id = ?', run.entity_id);
        break;
      case 'info_request':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, NULL AS matter_id, cl.name AS client_name FROM info_requests r JOIN cases c ON c.id = r.case_id LEFT JOIN clients cl ON cl.id = c.client_id WHERE r.id = ?', run.entity_id);
        break;
      case 'assignment':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, NULL AS matter_id, cl.name AS client_name FROM assignments a JOIN cases c ON c.id = a.case_id LEFT JOIN clients cl ON cl.id = c.client_id WHERE a.id = ?', run.entity_id);
        break;
      case 'case':
        ref = db.get('SELECT c.code AS entity_code, c.id AS case_id, c.matter_id, cl.name AS client_name FROM cases c LEFT JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?', run.entity_id);
        break;
      case 'intake': // v9.1 b-site: تذكير تُخطي لأن رقم الطلب غير مؤكد
        ref = db.get('SELECT i.code AS entity_code, i.case_id, NULL AS matter_id, i.contact_name AS client_name FROM intakes i WHERE i.id = ?', run.entity_id);
        break;
      default:
        break;
    }
    // client_name: اسم المستفيد/ة لعرض «الفاتورة INV-2026-00001 — نهى سمير» في سجل التنفيذ (صفحة الإدارة فقط)
    return { ...run, entity_code: ref?.entity_code ?? null, case_id: ref?.case_id ?? null, matter_id: ref?.matter_id ?? null, client_name: ref?.client_name ?? null };
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
          if (k === 'template') params[k] = v.str(val, 'نص الرسالة', { required: true, max: 600 }); // v9.1 b-site: رسائل قصيرة (B91-10)
          else if (k === 'template_paid') params[k] = v.str(val, 'نص الأفراد والشركات', { required: true, max: 600 }); // v11 segment-server (S11 §10.3)
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

    /**
     * معاينة «تشغيل القواعد الآن» دون تنفيذ: تُشغَّل القواعد داخل معاملة يُتراجع عنها بالكامل ولا يُرسل شيء،
     * ويُعاد عدد الرسائل التي كانت ستُرسل للمستفيدين (وعدد تنبيهات الفريق) لعرضه في نافذة التأكيد.
     */
    preview() {
      if (running) return { skipped: true };
      const ROLLBACK = new Error('automation preview rollback');
      const beforeMsg = Number(db.value('SELECT COALESCE(MAX(id), 0) FROM messages'));
      const beforeNote = Number(db.value('SELECT COALESCE(MAX(id), 0) FROM notifications'));
      let out = null;
      app.engine.dryRun = true;
      try {
        db.tx(() => {
          const summary = svc.runAll();
          const rows = db.all("SELECT channel, automation_rule FROM messages WHERE id > ? AND direction = 'out'", beforeMsg);
          const byRule = {};
          for (const r of rows) {
            const k = r.automation_rule || 'other';
            byRule[k] = (byRule[k] || 0) + 1;
          }
          out = {
            summary,
            messages: rows.length,
            whatsapp: rows.filter((r) => r.channel === 'whatsapp').length,
            portal: rows.filter((r) => r.channel === 'website').length,
            by_rule: byRule,
            staff_notifications: Number(db.value('SELECT COUNT(*) FROM notifications WHERE id > ?', beforeNote)),
          };
          throw ROLLBACK;
        });
      } catch (e) {
        if (e !== ROLLBACK) throw e;
      } finally {
        app.engine.dryRun = false;
      }
      return { ...out, live: !!app.whatsapp.configured };
    },

    outbox({ status, limit = 200 } = {}) {
      const where = ["m.direction = 'out'"];
      const params = [];
      if (status && LABELS.message_status[status]) {
        where.push('m.status = ?');
        params.push(status);
        // [بوابة 9.2 K7] فلتر «فاشلة» = ما يمكن إعادة إرساله: رسائل القصة الآلية الفاشلة خارج النافذة لا تُعاد [R2-A19]
        if (status === 'failed') where.push(`COALESCE(m.automation_rule, '') NOT IN (${STORY_AUTO_RULES.map((r) => `'${r}'`).join(', ')})`);
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
