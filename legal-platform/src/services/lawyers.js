// شبكة المحامين ومستخدمو الإدارة: إنشاء الحسابات، التخصصات، الطاقة الاستيعابية، الاتفاقات، ومؤشرات الأداء.
import { nowIso, periodOf, periodRange, isValidPeriod, parseJson, badRequest, notFound, conflict, v, fromMinor, arabicCount, AR_UNITS } from '../util.js';
import { LABELS, LEGAL_AREAS, AREA_CODES } from '../constants.js';
import { hashPassword, passwordProblem } from '../auth.js';
import { validateAgreement, describeAgreement } from './accounting.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

export function createLawyers(app) {
  const { db } = app;

  function validateUsername(u) {
    const s = v.str(u, 'اسم المستخدم', { required: true, min: 3, max: 40 });
    if (!/^[a-zA-Z0-9._-]+$/.test(s)) throw badRequest('اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط');
    if (db.get('SELECT 1 FROM users WHERE username = ?', s)) throw conflict('اسم المستخدم مستخدم بالفعل');
    return s;
  }
  function validatePassword(p) {
    const problem = passwordProblem(p);
    if (problem) throw badRequest(problem);
    return p;
  }
  function specialtiesOf(x) {
    if (!Array.isArray(x) || !x.length) throw badRequest('حدد تخصصًا واحدًا على الأقل');
    const list = [...new Set(x)];
    if (list.some((s) => !AREA_CODES.includes(s))) throw badRequest('تخصص غير معروف');
    return list;
  }

  /** مؤشرات أداء محامٍ واحد */
  function metricsFor(lawyerId, period) {
    const t = nowIso();
    const { start, end } = periodRange(period);
    const open = Number(
      db.value(
        `SELECT COUNT(*) FROM assignments a JOIN cases c ON c.id = a.case_id
         WHERE a.lawyer_id = ? AND a.status IN ('assigned','in_progress','submitted','returned') AND c.status != 'closed'`,
        lawyerId,
      ),
    );
    const overdue = Number(
      db.value(
        `SELECT COUNT(*) FROM assignments a JOIN cases c ON c.id = a.case_id
         WHERE a.lawyer_id = ? AND a.status IN ('assigned','in_progress','returned') AND a.due_at < ? AND c.status != 'closed'`,
        lawyerId,
        t,
      ),
    );
    const resp = db.get(
      `SELECT AVG((julianday(first_submitted_at) - julianday(assigned_at)) * 24) AS h, COUNT(*) AS n
       FROM assignments WHERE lawyer_id = ? AND first_submitted_at IS NOT NULL`,
      lawyerId,
    );
    const late = Number(db.value('SELECT COUNT(*) FROM assignments WHERE lawyer_id = ? AND first_submitted_at IS NOT NULL AND due_at IS NOT NULL AND first_submitted_at > due_at', lawyerId));
    const completedPeriod = Number(db.value('SELECT COUNT(*) FROM assignments WHERE lawyer_id = ? AND approved_at >= ? AND approved_at < ?', lawyerId, start, end));
    const completedTotal = Number(db.value("SELECT COUNT(*) FROM assignments WHERE lawyer_id = ? AND status = 'approved'", lawyerId));
    const reviews = db.get(
      `SELECT SUM(o.status = 'returned') AS returned, SUM(o.status = 'approved') AS approved, AVG(o.quality_score) AS q
       FROM opinions o JOIN assignments a ON a.id = o.assignment_id WHERE a.lawyer_id = ? AND o.status IN ('returned','approved')`,
      lawyerId,
    );
    const proBonoPeriod = Number(db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND period = ? AND treatment IN ('pro_bono','csr')", lawyerId, period));
    const proBonoTotal = Number(db.value("SELECT COUNT(*) FROM billable_events WHERE lawyer_id = ? AND treatment IN ('pro_bono','csr')", lawyerId));
    const earned = Number(db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND period = ? AND status != 'void'", lawyerId, period));
    const unpaid = Number(db.value("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE lawyer_id = ? AND status = 'accrued'", lawyerId));
    const returned = Number(reviews?.returned || 0);
    const approved = Number(reviews?.approved || 0);
    return {
      open_assignments: open,
      overdue,
      late_submissions: late,
      avg_response_hours: resp?.n ? Math.round(resp.h * 10) / 10 : null,
      completed_in_period: completedPeriod,
      completed_total: completedTotal,
      returned_rate: returned + approved ? Math.round((returned / (returned + approved)) * 1000) / 1000 : null,
      avg_quality: reviews?.q ? Math.round(reviews.q * 10) / 10 : null,
      pro_bono_in_period: proBonoPeriod,
      pro_bono_total: proBonoTotal,
      earned_in_period: fromMinor(earned),
      unpaid_balance: fromMinor(unpaid),
    };
  }

  function mapLawyer(r, period) {
    const ag = parseJson(r.agreement, {});
    const specs = parseJson(r.specialties, []);
    const m = metricsFor(r.id, period);
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      display_name: `${r.title || ''} ${r.name}`.trim(),
      username: r.username,
      email: r.email,
      phone: r.phone,
      active: !!r.active,
      specialties: specs,
      specialties_labels: specs.map((s) => AREA[s]),
      bar_number: r.bar_number,
      bar_level: r.bar_level,
      firm: r.firm,
      capacity: r.capacity,
      utilization: r.capacity ? Math.round((m.open_assignments / r.capacity) * 100) / 100 : null,
      agreement: ag,
      agreement_text: describeAgreement(ag),
      package_remaining: ag.type === 'package' ? r.package_remaining : null,
      notes: r.notes,
      last_login_at: r.last_login_at,
      created_at: r.created_at,
      metrics: m,
    };
  }

  const svc = {
    metricsFor,

    list({ period, area, active } = {}) {
      const p = isValidPeriod(period) ? period : periodOf(nowIso());
      const rows = db.all(
        "SELECT u.*, l.title, l.specialties, l.bar_number, l.bar_level, l.firm, l.capacity, l.agreement, l.package_remaining, l.notes FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.role = 'lawyer' ORDER BY u.active DESC, u.name",
      );
      let list = rows.map((r) => mapLawyer(r, p));
      if (area && AREA_CODES.includes(area)) list = list.filter((l) => l.specialties.includes(area));
      if (active === 'true' || active === true) list = list.filter((l) => l.active);
      const totals = {
        lawyers: list.length,
        active: list.filter((l) => l.active).length,
        capacity: list.filter((l) => l.active).reduce((s, l) => s + l.capacity, 0),
        // الطاقة والحمل يُحسبان على نفس المجموعة (المحامون النشطون) حتى تكون المقارنة صحيحة
        open_assignments: list.filter((l) => l.active).reduce((s, l) => s + l.metrics.open_assignments, 0),
        open_assignments_all: list.reduce((s, l) => s + l.metrics.open_assignments, 0),
        overdue: list.reduce((s, l) => s + l.metrics.overdue, 0),
        completed_in_period: list.reduce((s, l) => s + l.metrics.completed_in_period, 0),
        pro_bono_in_period: list.reduce((s, l) => s + l.metrics.pro_bono_in_period, 0),
      };
      return { period: p, totals, items: list };
    },

    detail(id, period) {
      const p = isValidPeriod(period) ? period : periodOf(nowIso());
      const r = db.get(
        "SELECT u.*, l.title, l.specialties, l.bar_number, l.bar_level, l.firm, l.capacity, l.agreement, l.package_remaining, l.notes FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ? AND u.role = 'lawyer'",
        id,
      );
      if (!r) throw notFound('المحامي غير موجود');
      const assignments = db.all(
        `SELECT a.id, a.role, a.status, a.due_at, a.assigned_at, a.first_submitted_at, a.approved_at, c.id AS case_id, c.code AS case_code, c.title AS case_title, c.status AS case_status
         FROM assignments a JOIN cases c ON c.id = a.case_id WHERE a.lawyer_id = ? ORDER BY a.id DESC LIMIT 200`,
        id,
      );
      const matters = db.all('SELECT id, code, title, status FROM matters WHERE responsible_lawyer_id = ? ORDER BY id DESC', id);
      return { lawyer: mapLawyer(r, p), assignments, matters, statement: app.accounting.statement(id) };
    },

    create(body, actor) {
      const username = validateUsername(body.username);
      const password = validatePassword(body.password);
      const name = v.str(body.name, 'اسم المحامي', { required: true, max: 120 });
      const agreement = validateAgreement(body.agreement);
      const specialties = specialtiesOf(body.specialties);
      const t = nowIso();
      const id = db.tx(() => {
        const uid = db.insert('users', {
          role: 'lawyer',
          username,
          name,
          email: v.email(body.email, 'البريد الإلكتروني'),
          phone: v.phone(body.phone, 'رقم الهاتف'),
          password_hash: hashPassword(password),
          active: 1,
          created_at: t,
        });
        db.insert('lawyers', {
          user_id: uid,
          title: v.str(body.title, 'اللقب', { max: 20 }) || 'أ.',
          specialties: JSON.stringify(specialties),
          bar_number: v.str(body.bar_number, 'رقم القيد', { max: 40 }),
          bar_level: v.str(body.bar_level, 'درجة القيد', { max: 40 }),
          firm: v.str(body.firm, 'مكتب المحاماة', { max: 150 }),
          capacity: v.int(body.capacity, 'الطاقة الاستيعابية', { min: 1, max: 1000 }) ?? 10,
          agreement: JSON.stringify(agreement),
          package_remaining: agreement.type === 'package' ? 0 : null,
          notes: v.str(body.notes, 'ملاحظات', { max: 3000 }),
        });
        if (agreement.type === 'package') app.accounting.addPackage(uid, { size: agreement.package_size, price: agreement.package_price }, actor);
        return uid;
      });
      return svc.detail(id).lawyer;
    },

    update(id, body, actor) {
      const r = db.get("SELECT u.*, l.agreement FROM users u JOIN lawyers l ON l.user_id = u.id WHERE u.id = ? AND u.role = 'lawyer'", id);
      if (!r) throw notFound('المحامي غير موجود');
      const userPatch = {};
      const lawyerPatch = {};
      if (body.name !== undefined) userPatch.name = v.str(body.name, 'اسم المحامي', { required: true, max: 120 });
      if (body.email !== undefined) userPatch.email = v.email(body.email, 'البريد الإلكتروني');
      if (body.phone !== undefined) userPatch.phone = v.phone(body.phone, 'رقم الهاتف');
      if (body.active !== undefined) {
        userPatch.active = v.bool(body.active) ? 1 : 0;
        if (userPatch.active !== r.active) userPatch.deactivated_at = userPatch.active ? null : nowIso();
      }
      if (body.title !== undefined) lawyerPatch.title = v.str(body.title, 'اللقب', { max: 20 }) || 'أ.';
      if (body.specialties !== undefined) lawyerPatch.specialties = JSON.stringify(specialtiesOf(body.specialties));
      if (body.bar_number !== undefined) lawyerPatch.bar_number = v.str(body.bar_number, 'رقم القيد', { max: 40 });
      if (body.bar_level !== undefined) lawyerPatch.bar_level = v.str(body.bar_level, 'درجة القيد', { max: 40 });
      if (body.firm !== undefined) lawyerPatch.firm = v.str(body.firm, 'مكتب المحاماة', { max: 150 });
      if (body.capacity !== undefined) lawyerPatch.capacity = v.int(body.capacity, 'الطاقة الاستيعابية', { required: true, min: 1, max: 1000 });
      if (body.notes !== undefined) lawyerPatch.notes = v.str(body.notes, 'ملاحظات', { max: 3000 });
      let newPackage = null;
      let leavingMonthly = null;
      if (body.agreement !== undefined) {
        const ag = validateAgreement(body.agreement);
        const old = parseJson(r.agreement, {});
        lawyerPatch.agreement = JSON.stringify(ag);
        if (['monthly', 'monthly_quota'].includes(old.type) && ag.type !== old.type) leavingMonthly = old;
        if (ag.type === 'package' && old.type !== 'package') newPackage = ag;
        if (ag.type !== 'package') lawyerPatch.package_remaining = null;
      }
      db.tx(() => {
        // الانتقال من اتفاق شهري: يُصدر المبلغ الشهري للفترة الجارية بنسبة الأيام المنقضية قبل تغيير الاتفاق
        if (leavingMonthly) app.accounting.settlePartialMonth(id, leavingMonthly, actor);
        db.update('users', id, userPatch);
        db.update('lawyers', id, lawyerPatch, 'user_id');
        if (newPackage) {
          db.run('UPDATE lawyers SET package_remaining = 0 WHERE user_id = ?', id);
          app.accounting.addPackage(id, { size: newPackage.package_size, price: newPackage.package_price }, actor);
        }
      });
      if (userPatch.active === 0) app.auth.revokeUserSessions(id);
      return svc.detail(id).lawyer;
    },

    setPassword(id, password, actor) {
      const u = db.get('SELECT * FROM users WHERE id = ?', id);
      if (!u) throw notFound('المستخدم غير موجود');
      if (u.role !== 'lawyer' && actor.role !== 'admin') throw badRequest('غير مسموح');
      db.update('users', id, { password_hash: hashPassword(validatePassword(password)) });
      app.auth.revokeUserSessions(id);
      return { ok: true };
    },

    /** اقتراح المحامين الأنسب لملف/تخصص: التخصص أولًا ثم الحمل الحالي ثم الأداء */
    suggest({ area, case_id }) {
      const p = periodOf(nowIso());
      const exclude = case_id
        ? new Set(db.all("SELECT lawyer_id FROM assignments WHERE case_id = ? AND status != 'withdrawn'", Number(case_id)).map((r) => r.lawyer_id))
        : new Set();
      const list = svc.list({ period: p }).items.filter((l) => l.active && !exclude.has(l.id));
      const scored = list.map((l) => {
        const specialty = area && l.specialties.includes(area) ? 1 : 0;
        const load = l.capacity ? l.metrics.open_assignments / l.capacity : 1;
        const quality = l.metrics.avg_quality ? l.metrics.avg_quality / 5 : 0.6;
        const speed = l.metrics.avg_response_hours ? Math.max(0, 1 - l.metrics.avg_response_hours / 120) : 0.5;
        const score = specialty * 3 + (1 - Math.min(load, 1.5)) * 2 + quality + speed - l.metrics.overdue * 0.3;
        const reasons = [];
        // صيغة «البيان: العدد» محايدة جنسًا وعددًا («التخصص:» بدل «متخصص في»)
        if (specialty) reasons.push(`التخصص: ${AREA[area]}`);
        reasons.push(`الإسنادات المفتوحة: ${l.metrics.open_assignments} من ${l.capacity}`);
        if (l.metrics.avg_response_hours !== null) {
          const h = Number(l.metrics.avg_response_hours);
          reasons.push(`متوسط زمن الرد: ${Number.isInteger(h) ? arabicCount(h, AR_UNITS.hour) : `${h} ساعة`}`);
        }
        if (l.metrics.overdue) reasons.push(`إسنادات متأخرة: ${l.metrics.overdue}`);
        return { ...l, score: Math.round(score * 100) / 100, specialty_match: !!specialty, over_capacity: load >= 1, reasons };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored;
    },

    // ===== مستخدمو الإدارة =====
    staffList() {
      return db.all("SELECT id, role, username, name, email, phone, active, created_at, last_login_at FROM users WHERE role IN ('admin','case_manager') ORDER BY role, name");
    },
    createStaff(body) {
      const role = v.oneOf(body.role, ['admin', 'case_manager'], 'الدور', { required: true });
      const id = db.insert('users', {
        role,
        username: validateUsername(body.username),
        name: v.str(body.name, 'الاسم', { required: true, max: 120 }),
        email: v.email(body.email, 'البريد الإلكتروني'),
        phone: v.phone(body.phone, 'رقم الهاتف'),
        password_hash: hashPassword(validatePassword(body.password)),
        active: 1,
        created_at: nowIso(),
      });
      return db.get('SELECT id, role, username, name, email, phone, active, created_at FROM users WHERE id = ?', id);
    },
    updateStaff(id, body, actor) {
      const u = db.get("SELECT * FROM users WHERE id = ? AND role IN ('admin','case_manager')", id);
      if (!u) throw notFound('المستخدم غير موجود');
      const patch = {};
      if (body.name !== undefined) patch.name = v.str(body.name, 'الاسم', { required: true, max: 120 });
      if (body.email !== undefined) patch.email = v.email(body.email, 'البريد الإلكتروني');
      if (body.phone !== undefined) patch.phone = v.phone(body.phone, 'رقم الهاتف');
      if (body.role !== undefined) patch.role = v.oneOf(body.role, ['admin', 'case_manager'], 'الدور', { required: true });
      if (body.active !== undefined) patch.active = v.bool(body.active) ? 1 : 0;
      if (id === actor.id && (patch.active === 0 || (patch.role && patch.role !== 'admin'))) {
        throw badRequest('لا يمكنك إيقاف حسابك أو خفض صلاحياتك بنفسك');
      }
      if ((patch.active === 0 || patch.role === 'case_manager') && u.role === 'admin') {
        const admins = Number(db.value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1 AND id != ?", id));
        if (!admins) throw badRequest('يجب أن يبقى حساب نشط واحد على الأقل بدور «إدارة النظام»');
      }
      if (body.password) patch.password_hash = hashPassword(validatePassword(body.password));
      db.update('users', id, patch);
      if (patch.active === 0 || patch.password_hash) app.auth.revokeUserSessions(id);
      return db.get('SELECT id, role, username, name, email, phone, active, created_at FROM users WHERE id = ?', id);
    },
  };
  return svc;
}

export { LABELS };
