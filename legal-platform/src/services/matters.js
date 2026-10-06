// ملفات العمل القانوني المستمر (Matter): تمثيل قضائي أو عمل مستمر مرتبط بنفس العميل والاستشارة الأصلية.
// محكمة، رقم دعوى، جلسات، مهام ومواعيد إجرائية، أتعاب ومدفوعات ومصروفات.
import { nowIso, cairoYear, badRequest, notFound, conflict, v, fromMinor, truncate, arabicDate, arabicTime, formatEgp } from '../util.js';
import { LABELS, ENUMS, CODE_PREFIX } from '../constants.js';
import { mapMessage } from '../channels/engine.js';

export function createMatters(app) {
  const { db } = app;

  function nextMatterCode(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`matter:${y}`, 1);
    return `${CODE_PREFIX.matter}-${y}-${String(n).padStart(5, '0')}`;
  }
  function nextInvoiceNumber(iso) {
    const y = cairoYear(iso);
    const n = db.nextCounter(`invoice:${y}`, 1);
    return `${CODE_PREFIX.invoice}-${y}-${String(n).padStart(5, '0')}`;
  }
  /**
   * responsible: المحامي المسؤول عن الملف المستمر يجب أن يكون حسابه نشطًا ومفعّلًا؛ حساب أُنشئ بدعوة لم تُقبل بعد
   * (users.invite_pending من وحدة الحسابات) لا يستطيع الدخول ولا الاطلاع على الملف ولا إشعاراته (مثل الإسناد في cases.assign).
   */
  function requireLawyerUser(id, { responsible = false } = {}) {
    const u = db.get("SELECT id, active, invite_pending FROM users WHERE id = ? AND role = 'lawyer'", id);
    if (!u) throw badRequest('المحامي المختار غير موجود');
    if (!u.active) throw badRequest('حساب هذا المحامي موقوف');
    if (responsible && u.invite_pending) {
      throw conflict('لم يفعّل هذا المحامي حسابه من رابط الدعوة بعد، فلا يمكنه الاطلاع على الملف المستمر. أعد إرسال الدعوة إليه أو اختر محاميًا آخر.');
    }
    return u;
  }

  function invoiceView(i) {
    const paid = Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?', i.id));
    return { ...i, amount: fromMinor(i.amount_minor), paid_amount: fromMinor(paid), balance: fromMinor(i.amount_minor - paid) };
  }

  const svc = {
    require(id) {
      const m = db.get('SELECT * FROM matters WHERE id = ?', id);
      if (!m) throw notFound('الملف المستمر غير موجود');
      return m;
    },
    /** المحامي المسؤول فقط يصل إلى الملف المستمر من بوابته */
    requireForLawyer(id, lawyer) {
      const m = db.get('SELECT * FROM matters WHERE id = ? AND responsible_lawyer_id = ?', id, lawyer.id);
      if (!m) throw notFound('الملف غير موجود أو غير مسند إليك');
      return m;
    },

    /** تحويل الاستشارة إلى ملف عمل مستمر دون فقد ما تم */
    createFromCase(caseId, body, actor) {
      const c = app.cases.require(caseId);
      if (c.matter_id) throw conflict('هذا الملف مرتبط بالفعل بملف عمل مستمر', { matter_id: c.matter_id });
      const kind = v.oneOf(body.kind, ENUMS.matter_kind, 'نوع الملف', { required: true });
      const lawyerId = v.int(body.responsible_lawyer_id, 'المحامي المسؤول', { min: 1 });
      if (lawyerId) requireLawyerUser(lawyerId, { responsible: true });
      const t = nowIso();
      const id = db.tx(() => {
        const mid = db.insert('matters', {
          code: nextMatterCode(t),
          case_id: c.id,
          client_id: c.client_id,
          title: v.str(body.title, 'عنوان الملف', { max: 200 }) || c.title,
          kind,
          status: 'open',
          responsible_lawyer_id: lawyerId,
          court: v.str(body.court, 'المحكمة', { max: 150 }),
          circuit: v.str(body.circuit, 'الدائرة', { max: 100 }),
          lawsuit_number: v.str(body.lawsuit_number, 'رقم الدعوى', { max: 60 }),
          lawsuit_year: v.str(body.lawsuit_year, 'سنة الدعوى', { max: 10 }),
          opponent: v.str(body.opponent, 'الخصم', { max: 200 }),
          agreed_fee_minor: v.money(body.agreed_fee, 'الأتعاب المتفق عليها مع العميل'),
          notes: v.str(body.notes, 'ملاحظات وتكليف المحامي', { max: 10000 }),
          opened_at: t,
          created_by: actor.id,
          updated_at: t,
        });
        db.update('cases', c.id, { matter_id: mid, updated_at: t });
        app.practice?.syncMatterOpponent(mid, actor); // v9 practice: فحص تعارض المصالح للخصم
        app.activity.log({
          case_id: c.id,
          matter_id: mid,
          client_id: c.client_id,
          actor,
          type: 'matter.created',
          summary: `تحولت الاستشارة إلى ملف عمل مستمر (${LABELS.matter_kind[kind]})`,
        });
        if (body.close_case && c.status !== 'closed') {
          app.cases.close(c.id, { outcome: 'referred_matter', note: 'تحولت إلى ملف عمل مستمر', force: !!body.force }, actor);
        }
        return mid;
      });
      const m = svc.require(id);
      if (lawyerId) {
        app.notifications.notify(lawyerId, {
          type: 'matter.assigned',
          title: `أُسند إليك الملف المستمر ${m.code} بصفة المحامي المسؤول`,
          body: truncate(m.title, 140),
          link: `#/my/matters/${m.id}`,
        });
      }
      return m;
    },

    list({ status, q, lawyer_id } = {}) {
      const where = ['1=1'];
      const params = [];
      if (status && ENUMS.matter_status.includes(status)) {
        where.push('m.status = ?');
        params.push(status);
      }
      if (lawyer_id) {
        where.push('m.responsible_lawyer_id = ?');
        params.push(Number(lawyer_id));
      }
      if (q) {
        const like = `%${String(q).trim()}%`;
        where.push('(m.code LIKE ? OR m.title LIKE ? OR m.lawsuit_number LIKE ? OR cl.name LIKE ?)');
        params.push(like, like, like, like);
      }
      const t = nowIso();
      return db
        .all(
          `SELECT m.*, cl.name AS client_name, cl.code AS client_code, c.code AS case_code, u.name AS lawyer_name,
             (SELECT MIN(starts_at) FROM matter_events e WHERE e.matter_id = m.id AND e.status = 'scheduled' AND e.starts_at >= ?) AS next_event_at,
             (SELECT COUNT(*) FROM matter_tasks k WHERE k.matter_id = m.id AND k.status = 'open') AS open_tasks,
             (SELECT COUNT(*) FROM matter_tasks k WHERE k.matter_id = m.id AND k.status = 'open' AND k.due_at < ?) AS overdue_tasks,
             (SELECT COUNT(*) FROM invoices i WHERE i.matter_id = m.id AND i.status IN ('unpaid','partially_paid')) AS unpaid_invoices
           FROM matters m JOIN clients cl ON cl.id = m.client_id JOIN cases c ON c.id = m.case_id
           LEFT JOIN users u ON u.id = m.responsible_lawyer_id WHERE ${where.join(' AND ')}
           ORDER BY CASE m.status WHEN 'closed' THEN 1 ELSE 0 END, m.id DESC`,
          t,
          t,
          ...params,
        )
        .map((m) => ({ ...m, agreed_fee: fromMinor(m.agreed_fee_minor), open_tasks: Number(m.open_tasks), overdue_tasks: Number(m.overdue_tasks), unpaid_invoices: Number(m.unpaid_invoices) }));
    },

    detail(id) {
      const m = svc.require(id);
      const client = app.clients.get(m.client_id);
      const invoices = db.all('SELECT * FROM invoices WHERE matter_id = ? ORDER BY id', m.id).map(invoiceView);
      return {
        matter: { ...m, agreed_fee: fromMinor(m.agreed_fee_minor) },
        client: client ? { id: client.id, code: client.code, name: client.name, phone: app.clients.primaryPhone(client.id) } : null,
        case: db.get('SELECT id, code, title, status, legal_area FROM cases WHERE id = ?', m.case_id),
        responsible_lawyer: m.responsible_lawyer_id ? { id: m.responsible_lawyer_id, name: app.cases.lawyerName(m.responsible_lawyer_id) } : null,
        events: db
          .all('SELECT * FROM matter_events WHERE matter_id = ? ORDER BY starts_at', m.id)
          .map((e) => ({ ...e, reminder_pending_approval: !!e.client_attendance_required && !e.client_text_approved && e.status === 'scheduled' })),
        tasks: db.all(
          'SELECT k.*, u.name AS assignee_name FROM matter_tasks k LEFT JOIN users u ON u.id = k.assignee_user_id WHERE k.matter_id = ? ORDER BY k.status, k.due_at',
          m.id,
        ),
        invoices,
        payments: db.all('SELECT p.*, i.number AS invoice_number FROM payments p JOIN invoices i ON i.id = p.invoice_id WHERE i.matter_id = ? ORDER BY p.id', m.id).map((p) => ({ ...p, amount: fromMinor(p.amount_minor) })),
        expenses: db.all('SELECT x.*, u.name AS lawyer_name FROM expenses x LEFT JOIN users u ON u.id = x.lawyer_id WHERE x.matter_id = ? ORDER BY x.id', m.id).map((x) => ({ ...x, amount: fromMinor(x.amount_minor) })),
        lawyer_fees: app.accounting.ledger({ matter_id: m.id }),
        documents: db.all('SELECT * FROM documents WHERE matter_id = ? ORDER BY id', m.id).map((d) => app.documents.publicView(d)),
        messages: (() => {
          const rows = db.all(
            `SELECT * FROM (SELECT m.*, u.name AS author_name FROM messages m LEFT JOIN users u ON u.id = m.author_user_id
             WHERE m.matter_id = ? ORDER BY m.id DESC LIMIT 200) ORDER BY id`,
            m.id,
          );
          const docs = new Map();
          if (rows.length) {
            for (const d of db.all(`SELECT * FROM documents WHERE message_id IN (${rows.map((r) => r.id).join(',')})`)) {
              if (!docs.has(d.message_id)) docs.set(d.message_id, []);
              // مرفقات المحادثة لا يراها المحامي المسؤول إلا إذا أتاحتها الإدارة للملف المستمر
              docs.get(d.message_id).push({ ...app.documents.publicView(d), shared_with_matter: d.matter_id === m.id });
            }
          }
          return rows.map((r) => mapMessage(r, docs));
        })(),
        activity: app.activity.forMatter(m.id),
        totals: {
          invoiced: invoices.filter((i) => i.status !== 'cancelled').reduce((s, i) => s + i.amount, 0),
          paid: invoices.reduce((s, i) => s + i.paid_amount, 0),
          expenses: fromMinor(Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM expenses WHERE matter_id = ?', m.id))),
        },
      };
    },

    /** ما يراه المحامي المسؤول: بيانات الدعوى والجلسات والمهام — دون بيانات اتصال العميل أو الفواتير */
    lawyerView(id, lawyer) {
      const m = svc.requireForLawyer(id, lawyer);
      const client = app.clients.get(m.client_id);
      return {
        matter: {
          id: m.id,
          code: m.code,
          title: m.title,
          kind: m.kind,
          status: m.status,
          court: m.court,
          circuit: m.circuit,
          lawsuit_number: m.lawsuit_number,
          lawsuit_year: m.lawsuit_year,
          opponent: m.opponent,
          notes: m.notes,
          opened_at: m.opened_at,
        },
        client_name: client?.name || 'العميل',
        events: db.all('SELECT id, kind, title, starts_at, location, client_attendance_required, status, notes, outcome FROM matter_events WHERE matter_id = ? ORDER BY starts_at', m.id),
        tasks: db.all('SELECT id, title, details, due_at, procedural, status, done_at, assignee_user_id FROM matter_tasks WHERE matter_id = ? ORDER BY status, due_at', m.id),
        documents: db.all('SELECT * FROM documents WHERE matter_id = ? ORDER BY id', m.id).map((d) => app.documents.publicView(d)),
      };
    },

    listForLawyer(lawyer) {
      const t = nowIso();
      return db.all(
        `SELECT m.id, m.code, m.title, m.kind, m.status, m.court, m.circuit, m.lawsuit_number, m.lawsuit_year,
           (SELECT MIN(starts_at) FROM matter_events e WHERE e.matter_id = m.id AND e.status = 'scheduled' AND e.starts_at >= ?) AS next_event_at,
           (SELECT COUNT(*) FROM matter_tasks k WHERE k.matter_id = m.id AND k.status = 'open') AS open_tasks
         FROM matters m WHERE m.responsible_lawyer_id = ? ORDER BY CASE m.status WHEN 'closed' THEN 1 ELSE 0 END, m.id DESC`,
        t,
        lawyer.id,
      );
    },

    update(id, body, actor) {
      const m = svc.require(id);
      const patch = { updated_at: nowIso() };
      for (const [k, label, max] of [
        ['title', 'العنوان', 200], ['court', 'المحكمة', 150], ['circuit', 'الدائرة', 100], ['lawsuit_number', 'رقم الدعوى', 60],
        ['lawsuit_year', 'سنة الدعوى', 10], ['opponent', 'الخصم', 200], ['notes', 'الملاحظات', 10000],
      ]) {
        if (body[k] !== undefined) patch[k] = v.str(body[k], label, { max, required: k === 'title' });
      }
      if (body.kind !== undefined) patch.kind = v.oneOf(body.kind, ENUMS.matter_kind, 'نوع الملف', { required: true });
      if (body.status !== undefined) {
        patch.status = v.oneOf(body.status, ENUMS.matter_status, 'الحالة', { required: true });
        patch.closed_at = patch.status === 'closed' ? nowIso() : null;
      }
      if (body.agreed_fee !== undefined) patch.agreed_fee_minor = v.money(body.agreed_fee, 'الأتعاب المتفق عليها');
      if (body.responsible_lawyer_id !== undefined) {
        const lid = v.int(body.responsible_lawyer_id, 'المحامي المسؤول', { min: 1 });
        // التحقق عند التغيير فقط: حفظ تعديل آخر في ملف محاميه الحالي أُوقف لاحقًا لا يُرفض بسبب المحامي
        if (lid && lid !== m.responsible_lawyer_id) requireLawyerUser(lid, { responsible: true });
        patch.responsible_lawyer_id = lid;
        if (lid && lid !== m.responsible_lawyer_id) {
          app.notifications.notify(lid, { type: 'matter.assigned', title: `أُسند إليك الملف المستمر ${m.code} بصفة المحامي المسؤول`, link: `#/my/matters/${m.id}` });
        }
      }
      db.tx(() => {
        db.update('matters', m.id, patch);
        if (patch.opponent !== undefined && patch.opponent !== m.opponent) app.practice?.syncMatterOpponent(m.id, actor); // v9 practice
        // المهام المفتوحة للمحامي السابق تنتقل للمحامي الجديد (ولا تبقى إشعاراتها عند من لم يعد له وصول للملف)
        if (patch.responsible_lawyer_id !== undefined && m.responsible_lawyer_id && patch.responsible_lawyer_id !== m.responsible_lawyer_id) {
          db.run(
            "UPDATE matter_tasks SET assignee_user_id = ?, updated_at = ? WHERE matter_id = ? AND status = 'open' AND assignee_user_id = ?",
            patch.responsible_lawyer_id ?? null,
            nowIso(),
            m.id,
            m.responsible_lawyer_id,
          );
        }
      });
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'matter.updated', summary: patch.status ? `تغيرت حالة الملف المستمر إلى «${LABELS.matter_status[patch.status]}»` : 'تم تحديث بيانات الملف المستمر' });
      return svc.require(m.id);
    },

    // ===== الجلسات والمواعيد =====
    addEvent(matterId, body, actor) {
      const m = actor.role === 'lawyer' ? svc.requireForLawyer(matterId, actor) : svc.require(matterId);
      if (m.status === 'closed') throw conflict('الملف المستمر مغلق');
      const kind = v.oneOf(body.kind, ENUMS.event_kind, 'نوع الموعد', { required: true });
      const t = nowIso();
      const id = db.insert('matter_events', {
        matter_id: m.id,
        kind,
        title: v.str(body.title, 'عنوان الموعد', { max: 200 }) || LABELS.event_kind[kind],
        starts_at: v.iso(body.starts_at, 'التاريخ والوقت', { required: true }),
        location: v.str(body.location, 'المكان', { max: 200 }) || m.court || null,
        client_attendance_required: v.bool(body.client_attendance_required) ? 1 : 0,
        status: 'scheduled',
        notes: v.str(body.notes, 'ملاحظات', { max: 3000 }),
        // ما يكتبه المحامي لا يصل للعميل (تذكيرًا أو في البوابة) قبل اعتماد الإدارة
        client_text_approved: actor.role === 'lawyer' ? 0 : 1,
        created_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      const e = db.get('SELECT * FROM matter_events WHERE id = ?', id);
      app.activity.log({
        matter_id: m.id,
        case_id: m.case_id,
        actor,
        type: 'event.added',
        summary: `سُجّل موعد (${LABELS.event_kind[kind]}) بتاريخ ${arabicDate(e.starts_at)} الساعة ${arabicTime(e.starts_at)}${e.client_attendance_required ? ' (يلزم حضور العميل — سيُرسل تذكير آلي)' : ''}`,
      });
      if (actor.role === 'lawyer') {
        app.notifications.notifyStaff({
          type: 'event.added',
          title: `سجّل المحامي موعدًا (${LABELS.event_kind[kind]}) في الملف ${m.code}`,
          body: e.client_attendance_required ? 'يلزم حضور العميل: راجع بيانات الموعد واعتمد تذكير العميل.' : null,
          link: `#/matters/${m.id}`,
        });
      }
      return e;
    },

    updateEvent(eventId, body, actor) {
      const e = db.get('SELECT * FROM matter_events WHERE id = ?', eventId);
      if (!e) throw notFound('الموعد غير موجود');
      const m = actor.role === 'lawyer' ? svc.requireForLawyer(e.matter_id, actor) : svc.require(e.matter_id);
      const patch = { updated_at: nowIso() };
      if (body.kind !== undefined) patch.kind = v.oneOf(body.kind, ENUMS.event_kind, 'نوع الموعد', { required: true });
      if (body.title !== undefined) patch.title = v.str(body.title, 'العنوان', { required: true, max: 200 });
      if (body.starts_at !== undefined) patch.starts_at = v.iso(body.starts_at, 'التاريخ والوقت', { required: true });
      if (body.location !== undefined) patch.location = v.str(body.location, 'المكان', { max: 200 });
      if (body.client_attendance_required !== undefined) patch.client_attendance_required = v.bool(body.client_attendance_required) ? 1 : 0;
      if (body.status !== undefined) patch.status = v.oneOf(body.status, ENUMS.event_status, 'الحالة', { required: true });
      if (body.notes !== undefined) patch.notes = v.str(body.notes, 'ملاحظات', { max: 3000 });
      if (body.outcome !== undefined) patch.outcome = v.str(body.outcome, 'ما تم في الجلسة', { max: 5000 });
      const clientFacing = ['kind', 'title', 'starts_at', 'location', 'client_attendance_required'].some((k) => patch[k] !== undefined && patch[k] !== e[k]);
      if (actor.role !== 'lawyer') patch.client_text_approved = 1; // تعديل الإدارة اعتماد للنص
      else if (clientFacing) patch.client_text_approved = 0;
      db.update('matter_events', e.id, patch);
      if (actor.role === 'lawyer' && clientFacing && (patch.client_attendance_required ?? e.client_attendance_required)) {
        app.notifications.notifyStaff({
          type: 'event.updated',
          title: `عدّل المحامي موعدًا في الملف ${m.code}: يحتاج تذكير العميل إلى اعتماد`,
          link: `#/matters/${m.id}`,
        });
      }
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'event.updated', summary: `تم تحديث موعد (${LABELS.event_kind[e.kind]})${patch.outcome ? ': ' + truncate(patch.outcome, 100) : ''}` });
      return db.get('SELECT * FROM matter_events WHERE id = ?', e.id);
    },

    /** اعتماد الإدارة لنص موعد سجله المحامي حتى يُستخدم في تذكير العميل وبوابته */
    approveEventText(eventId, actor) {
      const e = db.get('SELECT * FROM matter_events WHERE id = ?', eventId);
      if (!e) throw notFound('الموعد غير موجود');
      const m = svc.require(e.matter_id);
      if (e.client_text_approved) return { ok: true };
      db.update('matter_events', e.id, { client_text_approved: 1, updated_at: nowIso() });
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'event.approved', summary: `اعتمدت الإدارة بيانات الموعد «${truncate(e.title, 80)}» لتذكير العميل` });
      return { ok: true };
    },

    // ===== المهام والمواعيد الإجرائية =====
    addTask(matterId, body, actor) {
      const m = actor.role === 'lawyer' ? svc.requireForLawyer(matterId, actor) : svc.require(matterId);
      if (m.status === 'closed') throw conflict('الملف المستمر مغلق');
      let assignee = v.int(body.assignee_user_id, 'المسؤول عن المهمة', { min: 1 });
      if (actor.role === 'lawyer') assignee = actor.id;
      const au = assignee ? db.get('SELECT id, role FROM users WHERE id = ? AND active = 1', assignee) : null;
      if (assignee && !au) throw badRequest('المسؤول عن المهمة غير صالح');
      if (au && au.role === 'lawyer' && au.id !== m.responsible_lawyer_id) throw badRequest('لا يمكن إسناد المهمة لمحامٍ غير المسؤول عن الملف');
      const t = nowIso();
      const id = db.insert('matter_tasks', {
        matter_id: m.id,
        title: v.str(body.title, 'المهمة', { required: true, max: 300 }),
        details: v.str(body.details, 'التفاصيل', { max: 3000 }),
        assignee_user_id: assignee ?? m.responsible_lawyer_id,
        due_at: v.iso(body.due_at, 'الموعد'),
        procedural: v.bool(body.procedural) ? 1 : 0,
        status: 'open',
        created_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'task.added', summary: `أُضيفت مهمة: ${truncate(body.title, 100)}` });
      return db.get('SELECT * FROM matter_tasks WHERE id = ?', id);
    },

    updateTask(taskId, body, actor) {
      const k = db.get('SELECT * FROM matter_tasks WHERE id = ?', taskId);
      if (!k) throw notFound('المهمة غير موجودة');
      const m = actor.role === 'lawyer' ? svc.requireForLawyer(k.matter_id, actor) : svc.require(k.matter_id);
      const patch = { updated_at: nowIso() };
      if (body.title !== undefined) patch.title = v.str(body.title, 'المهمة', { required: true, max: 300 });
      if (body.details !== undefined) patch.details = v.str(body.details, 'التفاصيل', { max: 3000 });
      if (body.due_at !== undefined) patch.due_at = v.iso(body.due_at, 'الموعد');
      if (body.procedural !== undefined) patch.procedural = v.bool(body.procedural) ? 1 : 0;
      if (body.assignee_user_id !== undefined && actor.role !== 'lawyer') {
        const aid = v.int(body.assignee_user_id, 'المسؤول عن المهمة', { min: 1 });
        const au = aid ? db.get('SELECT id, role FROM users WHERE id = ? AND active = 1', aid) : null;
        if (aid && !au) throw badRequest('المسؤول عن المهمة غير صالح');
        // من المحامين لا يُسند إلا للمحامي المسؤول عن الملف؛ غيره لا يملك الوصول إليه
        if (au && au.role === 'lawyer' && au.id !== m.responsible_lawyer_id) throw badRequest('لا يمكن إسناد المهمة لمحامٍ غير المسؤول عن الملف');
        patch.assignee_user_id = aid;
      }
      if (body.status !== undefined) {
        patch.status = v.oneOf(body.status, ENUMS.task_status, 'الحالة', { required: true });
        patch.done_at = patch.status === 'done' ? nowIso() : null;
        patch.done_by = patch.status === 'done' ? actor.id : null;
      }
      db.update('matter_tasks', k.id, patch);
      if (patch.status === 'done') app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'task.done', summary: `أُنجزت المهمة: ${truncate(k.title, 100)}` });
      return db.get('SELECT * FROM matter_tasks WHERE id = ?', k.id);
    },

    // ===== الفواتير والمدفوعات والمصروفات =====
    addInvoice(matterId, body, actor) {
      const m = svc.require(matterId);
      const t = nowIso();
      const id = db.insert('invoices', {
        number: nextInvoiceNumber(t),
        client_id: m.client_id,
        matter_id: m.id,
        case_id: m.case_id,
        description: v.str(body.description, 'البيان', { required: true, max: 300 }),
        amount_minor: v.money(body.amount, 'المبلغ', { required: true, min: 0.01 }),
        due_at: v.iso(body.due_at, 'تاريخ الاستحقاق', { required: true }),
        status: 'unpaid',
        created_by: actor.id,
        created_at: t,
        updated_at: t,
      });
      const inv = db.get('SELECT * FROM invoices WHERE id = ?', id);
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'invoice.created', summary: `أُصدرت الفاتورة ${inv.number} بمبلغ ${formatEgp(inv.amount_minor)}` });
      return invoiceView(inv);
    },

    addPayment(invoiceId, body, actor) {
      const inv = db.get('SELECT * FROM invoices WHERE id = ?', invoiceId);
      if (!inv) throw notFound('الفاتورة غير موجودة');
      if (inv.status === 'cancelled' || inv.status === 'paid') throw conflict('الفاتورة مسددة أو ملغاة');
      const amount = v.money(body.amount, 'المبلغ المدفوع', { required: true, min: 0.01 });
      const paid = Number(db.value('SELECT COALESCE(SUM(amount_minor), 0) FROM payments WHERE invoice_id = ?', inv.id));
      if (paid + amount > inv.amount_minor) throw badRequest(`المبلغ يتجاوز المتبقي من الفاتورة (${formatEgp(inv.amount_minor - paid)})`);
      const t = nowIso();
      db.tx(() => {
        db.insert('payments', {
          invoice_id: inv.id,
          amount_minor: amount,
          paid_at: v.iso(body.paid_at, 'تاريخ الدفع') || t,
          method: v.str(body.method, 'طريقة الدفع', { max: 60 }),
          reference: v.str(body.reference, 'المرجع', { max: 120 }),
          // رقم إيصال الاستلام RCPT-YYYY-NNNNN يُمنح عند التسجيل ويبقى ثابتًا (وحدة programs)
          receipt_number: app.programs?.nextReceiptNumber ? app.programs.nextReceiptNumber(t) : null,
          recorded_by: actor.id,
          created_at: t,
        });
        db.update('invoices', inv.id, { status: paid + amount >= inv.amount_minor ? 'paid' : 'partially_paid', updated_at: t });
      });
      app.activity.log({ matter_id: inv.matter_id, case_id: inv.case_id, actor, type: 'payment.recorded', summary: `سُجلت دفعة ${formatEgp(amount)} على الفاتورة ${inv.number}` });
      return invoiceView(db.get('SELECT * FROM invoices WHERE id = ?', inv.id));
    },

    cancelInvoice(invoiceId, actor) {
      const inv = db.get('SELECT * FROM invoices WHERE id = ?', invoiceId);
      if (!inv) throw notFound('الفاتورة غير موجودة');
      if (Number(db.value('SELECT COUNT(*) FROM payments WHERE invoice_id = ?', inv.id))) throw conflict('لا يمكن إلغاء فاتورة سُجلت عليها مدفوعات');
      db.update('invoices', inv.id, { status: 'cancelled', updated_at: nowIso() });
      app.activity.log({ matter_id: inv.matter_id, case_id: inv.case_id, actor, type: 'invoice.cancelled', summary: `أُلغيت الفاتورة ${inv.number}` });
      return invoiceView(db.get('SELECT * FROM invoices WHERE id = ?', inv.id));
    },

    addExpense(matterId, body, actor) {
      const m = svc.require(matterId);
      const paidBy = v.oneOf(body.paid_by, ENUMS.expense_paid_by, 'الجهة التي دفعت', { required: true });
      const lawyerId = paidBy === 'lawyer' ? v.int(body.lawyer_id, 'المحامي', { required: true, min: 1 }) : null;
      if (lawyerId) requireLawyerUser(lawyerId);
      const t = nowIso();
      const id = db.tx(() => {
        const xid = db.insert('expenses', {
          matter_id: m.id,
          case_id: m.case_id,
          description: v.str(body.description, 'البيان', { required: true, max: 300 }),
          amount_minor: v.money(body.amount, 'المبلغ', { required: true, min: 0.01 }),
          incurred_at: v.iso(body.incurred_at, 'التاريخ') || t,
          paid_by: paidBy,
          lawyer_id: lawyerId,
          recorded_by: actor.id,
          created_at: t,
        });
        app.accounting.reimburseExpense(db.get('SELECT * FROM expenses WHERE id = ?', xid), actor);
        return xid;
      });
      const x = db.get('SELECT * FROM expenses WHERE id = ?', id);
      app.activity.log({ matter_id: m.id, case_id: m.case_id, actor, type: 'expense.added', summary: `سُجلت مصروفات ${formatEgp(x.amount_minor)} (${LABELS.expense_paid_by[paidBy]})` });
      return { ...x, amount: fromMinor(x.amount_minor) };
    },

    sendMessage(matterId, body, actor) {
      const m = svc.require(matterId);
      const c = app.cases.require(m.case_id);
      return app.engine.sendToClient({
        client_id: m.client_id,
        intake_id: c.intake_id,
        case_id: c.id,
        matter_id: m.id,
        body: v.str(body.body, 'نص الرسالة', { required: true, max: 4000 }),
        channel: body.channel || 'auto',
        author: actor,
      });
    },
  };
  return svc;
}
