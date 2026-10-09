// خط المعرفة المؤسسية (Knowledge Pipeline):
// لا نحفظ الإجابة النهائية فقط، بل رحلة التفكير والتصحيح كاملة — مع فصل البيانات الشخصية وإخفائها،
// ولا تُستخدم الحالة معرفيًا أو تدريبيًا إلا بعد مراجعة الإدارة واعتمادها.
import { nowIso, parseJson, badRequest, notFound, conflict, v } from '../util.js';
import { LABELS, ENUMS, LEGAL_AREAS, AREA_CODES } from '../constants.js';
import { redact, familyNames } from '../ai/redact.js';

const AREA = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

export function createKnowledge(app) {
  const { db } = app;

  function knownNames(caseId) {
    const c = db.get('SELECT client_id FROM cases WHERE id = ?', caseId);
    const names = [];
    const client = c ? db.get('SELECT name FROM clients WHERE id = ?', c.client_id) : null;
    if (client?.name) names.push(client.name);
    const intake = db.get('SELECT contact_name FROM intakes WHERE case_id = ?', caseId);
    if (intake?.contact_name) names.push(intake.contact_name);
    for (const r of db.all('SELECT DISTINCT u.name FROM assignments a JOIN users u ON u.id = a.lawyer_id WHERE a.case_id = ?', caseId)) names.push(r.name);
    for (const r of db.all("SELECT name FROM users WHERE role IN ('admin','case_manager')")) names.push(r.name);
    // v9.1 fixes: أسماء الأبناء والأسرة المذكورة في الوقائع ورسائلها وملاحظات الجلسات («طفلان قاصران (يوسف ومريم)»،
    // «شهادات ميلاد يوسف ومريم»، الكنية «أم يوسف») تُخفى أينما وردت في السجل
    const kase = db.get('SELECT facts_shared, facts_internal, intake_id, client_id FROM cases WHERE id = ?', caseId);
    const texts = [kase?.facts_shared, kase?.facts_internal, client?.name, intake?.contact_name];
    if (kase?.intake_id) texts.push(db.value('SELECT summary FROM intakes WHERE id = ?', kase.intake_id));
    for (const r of db.all("SELECT body FROM messages WHERE (case_id = ? OR (? IS NOT NULL AND intake_id = ?)) AND direction = 'in'", caseId, kase?.intake_id ?? null, kase?.intake_id ?? null)) texts.push(r.body);
    for (const r of db.all('SELECT summary, body FROM client_answers WHERE case_id = ?', caseId)) texts.push(r.summary, r.body);
    for (const r of db.all('SELECT e.client_note FROM matter_events e JOIN matters m ON m.id = e.matter_id WHERE m.case_id = ? AND e.client_note IS NOT NULL', caseId)) texts.push(r.client_note);
    for (const t of texts) if (t) names.push(...familyNames(t));
    return names;
  }

  // v10 b2b-server (L-30، CS-33): أسماء تُخفى في سجل ملف شركة — مستخدموها وكياناتها وأطرافها واسمها
  function companyNames(co) {
    const names = [co.name, co.legal_name];
    for (const r of db.all('SELECT name FROM company_users WHERE company_id = ?', co.id)) names.push(r.name);
    for (const r of db.all('SELECT name FROM company_entities WHERE company_id = ?', co.id)) names.push(r.name);
    for (const r of db.all('SELECT name FROM company_counterparties WHERE company_id = ?', co.id)) names.push(r.name);
    return names.filter(Boolean);
  }
  /** رموز الطلبات والشركة وأرقام سجلها وبطاقتها الضريبية وبريد مستخدميها */
  function companyCodes(co, text) {
    let s = String(text || '');
    s = s.replace(new RegExp(`\\b${co.prefix}-\\d{3,6}\\b`, 'g'), '[رقم طلب]').replace(/\bCO-\d{3,6}\b/g, '[رقم شركة]');
    for (const x of [co.commercial_registry, co.tax_id, ...db.all('SELECT commercial_registry, tax_id FROM company_entities WHERE company_id = ?', co.id).flatMap((e) => [e.commercial_registry, e.tax_id])]) {
      if (x && String(x).length >= 4) s = s.split(String(x)).join('[رقم سجل]');
    }
    for (const r of db.all('SELECT email FROM company_users WHERE company_id = ?', co.id)) if (r.email) s = s.split(r.email).join('[بريد إلكتروني]');
    return s;
  }

  function mapRecord(r) {
    return {
      ...r,
      issues: parseJson(r.issues, []),
      info_requested: parseJson(r.info_requested, []),
      documents_requested: parseJson(r.documents_requested, []),
      specialists: parseJson(r.specialists, []),
      ai_corrections: parseJson(r.ai_corrections, []),
      journey: parseJson(r.journey, []),
      tags: parseJson(r.tags, []),
      redaction_report: parseJson(r.redaction_report, {}),
      legal_area_label: AREA[r.legal_area],
    };
  }

  const svc = {
    /** إنشاء/تحديث سجل المعرفة عند إغلاق الملف (لا يمس السجلات المعتمدة) */
    buildFromCase(caseId) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) return null;
      const existing = db.get('SELECT * FROM knowledge_records WHERE case_id = ?', caseId);
      // v10 b2b-server (L-30، حارس #28): سجل ملف شركة نطاقه «الشركة» دائمًا ولا يُعتمد للاستخدام العام؛ يُعاد بناؤه بنطاقه
      const co = c.company_id ? db.get('SELECT * FROM companies WHERE id = ?', c.company_id) : null;
      if (existing && existing.status !== 'pending_review' && !(co && existing.status === 'company_only')) return mapRecord(existing);
      const names = knownNames(caseId);
      if (co) {
        names.push(...companyNames(co));
        // gate J-24: سجل ملف الشركة لا يحتفظ باسم المحامي بالإنجليزية ولا باسم مستخدمه (يصل للشركة في التسليمات بهذه الصيغ)
        for (const l of db.all('SELECT DISTINCT u.username, l.name_latin FROM assignments a JOIN users u ON u.id = a.lawyer_id LEFT JOIN lawyers l ON l.user_id = u.id WHERE a.case_id = ?', caseId)) {
          for (const n of [l.name_latin, l.username]) {
            if (!n || String(n).length < 3) continue;
            const t = String(n).trim();
            names.push(t, t.toLowerCase(), t.replace(/\b\p{L}/gu, (x) => x.toUpperCase()));
          }
        }
      }
      const counts = {};
      const R = (text) => {
        const r = redact(text || '', { names });
        for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] || 0) + n;
        return co ? companyCodes(co, r.text) : r.text;
      };
      const intake = c.intake_id ? db.get('SELECT * FROM intakes WHERE id = ?', c.intake_id) : null;
      const facts = R(c.facts_shared || c.facts_internal || intake?.summary || '');
      const issues = db.all("SELECT title FROM case_issues WHERE case_id = ? AND status = 'active' ORDER BY number", caseId).map((i) => R(i.title));
      // v9.1 l-work: طلبات المهلة والأسئلة للإدارة و«أحتاج هذا أيضًا» ليست «معلومات طُلبت» في سجل المعرفة
      const irs = db.all("SELECT kind, question FROM info_requests WHERE case_id = ? AND status != 'cancelled' AND kind IN ('document','information') AND duplicate_of_id IS NULL ORDER BY id", caseId);
      const specialists = db
        .all('SELECT kind, specialty, description FROM counsel_requests WHERE case_id = ? AND status IN (\'assigned\',\'completed\') ORDER BY id', caseId)
        .map((x) => ({ kind: x.kind, kind_label: LABELS.counsel_kind[x.kind], specialty: x.specialty, specialty_label: x.specialty ? AREA[x.specialty] : null, reason: R(x.description) }));
      const leadOpinion =
        db.get(
          `SELECT o.body FROM opinions o JOIN assignments a ON a.id = o.assignment_id
           WHERE o.case_id = ? AND o.status = 'approved' AND a.role = 'lead' ORDER BY o.id DESC LIMIT 1`,
          caseId,
        ) || db.get("SELECT body FROM opinions WHERE case_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 1", caseId);
      const specialistOpinions = db
        .all(
          `SELECT o.body, a.role FROM opinions o JOIN assignments a ON a.id = o.assignment_id
           WHERE o.case_id = ? AND o.status = 'approved' AND a.role != 'lead' ORDER BY o.id`,
          caseId,
        )
        .map((o) => `[${LABELS.assignment_role[o.role]}]\n${R(o.body)}`);
      const answer = db.get("SELECT body FROM client_answers WHERE case_id = ? AND status = 'sent' ORDER BY id DESC LIMIT 1", caseId);
      const corrections = db
        .all("SELECT field, verdict, ai_value, final_value, note, actor_role FROM ai_feedback WHERE case_id = ? OR (entity_type = 'intake' AND entity_id = ?) ORDER BY id", caseId, c.intake_id ?? -1)
        .filter((f) => f.verdict !== 'accepted')
        .map((f) => ({
          field: f.field,
          field_label: LABELS.ai_field[f.field],
          verdict: f.verdict,
          verdict_label: LABELS.ai_verdict[f.verdict],
          ai_value: R(String(f.ai_value ?? '')).slice(0, 1500),
          final_value: R(String(f.final_value ?? '')).slice(0, 1500),
          by: f.actor_role === 'lawyer' ? 'المحامي' : 'الإدارة',
          // ملاحظات الموظفين نص حر قد يذكر اسم العميل أو رقمه: تمر بنفس الإخفاء
          note: f.note ? R(String(f.note)).slice(0, 1000) : null,
        }));
      // رحلة الحالة: من الرسالة غير المنظمة حتى الإجابة المعتمدة
      const journey = app.activity
        .forCase(caseId, c.intake_id)
        .filter((a) => !['message.received', 'message.sent', 'assignment.opened'].includes(a.type))
        .map((a) => ({ at: a.created_at, actor: LABELS.actor_kind[a.actor_kind] || a.actor_kind, type: a.type, summary: R(a.summary) }));

      const finalAnswer = [leadOpinion ? R(leadOpinion.body) : null, ...specialistOpinions].filter(Boolean).join('\n\n');
      const t = nowIso();
      const row = {
        legal_area: c.legal_area,
        title: R(c.title),
        facts,
        issues: JSON.stringify(issues),
        info_requested: JSON.stringify(irs.filter((x) => x.kind === 'information').map((x) => R(x.question))),
        documents_requested: JSON.stringify(irs.filter((x) => x.kind === 'document').map((x) => R(x.question))),
        specialists: JSON.stringify(specialists),
        final_answer: finalAnswer || null,
        client_answer: answer ? R(answer.body) : null,
        ai_corrections: JSON.stringify(corrections),
        journey: JSON.stringify(journey),
        outcome: c.outcome,
        redaction_report: JSON.stringify({ method: 'heuristic', counts, reviewed: false }),
        updated_at: t,
      };
      // v10 b2b-server (L-30): النطاق والشركة والحالة تُحسب هنا وتُكتب في الإدراج والتحديث معًا؛ بلا إشعار «بانتظار المراجعة»
      if (co) {
        row.scope = 'company';
        row.company_id = co.id;
        row.status = 'company_only';
        row.usage = 'none';
        if (existing) db.update('knowledge_records', existing.id, row);
        else db.insert('knowledge_records', { case_id: caseId, ...row, created_at: t });
        return svc.get(db.value('SELECT id FROM knowledge_records WHERE case_id = ?', caseId));
      }
      let id;
      if (existing) {
        db.update('knowledge_records', existing.id, row);
        id = existing.id;
        if (existing.reviewed_by) {
          // سجل سبق اعتماده ثم أعيد فتح ملفه: يحتاج مراجعة جديدة بعد إعادة البناء
          app.notifications.notifyStaff({
            type: 'knowledge.pending',
            title: `حالة أعيد إغلاقها بانتظار إعادة مراجعة المعرفة (${c.code})`,
            body: 'أعيد بناء السجل من الملف بعد إعادة فتحه وإغلاقه. راجع الإخفاء والمحتوى قبل اعتماده مرة أخرى.',
            link: `#/knowledge/${id}`,
          });
        }
      } else {
        id = db.insert('knowledge_records', { case_id: caseId, ...row, status: 'pending_review', usage: 'none', created_at: t });
        app.notifications.notifyStaff({
          type: 'knowledge.pending',
          title: `حالة جديدة بانتظار مراجعة المعرفة المؤسسية (${c.code})`,
          body: 'راجع إخفاء البيانات الشخصية وحدد صلاحية الحالة للاستخدام المعرفي أو التدريبي.',
          link: `#/knowledge/${id}`,
        });
      }
      return svc.get(id);
    },

    get(id) {
      const r = db.get('SELECT k.*, c.code AS case_code, u.name AS reviewed_by_name FROM knowledge_records k LEFT JOIN cases c ON c.id = k.case_id LEFT JOIN users u ON u.id = k.reviewed_by WHERE k.id = ?', id);
      if (!r) throw notFound('السجل غير موجود');
      return mapRecord(r);
    },

    list({ status, area, usage, q } = {}) {
      const where = ['1=1'];
      const params = [];
      if (status && ENUMS.knowledge_status.includes(status)) {
        where.push('k.status = ?');
        params.push(status);
      }
      if (usage && ENUMS.knowledge_usage.includes(usage)) {
        where.push('k.usage = ?');
        params.push(usage);
      }
      if (area && AREA_CODES.includes(area)) {
        where.push('k.legal_area = ?');
        params.push(area);
      }
      if (q) {
        const like = `%${String(q).trim()}%`;
        where.push('(k.title LIKE ? OR k.facts LIKE ? OR k.final_answer LIKE ?)');
        params.push(like, like, like);
      }
      const items = db
        .all(
          `SELECT k.id, k.case_id, k.legal_area, k.title, k.status, k.usage, k.outcome, k.created_at, k.updated_at, k.specialists, k.ai_corrections, k.tags, c.code AS case_code
           FROM knowledge_records k LEFT JOIN cases c ON c.id = k.case_id WHERE ${where.join(' AND ')} ORDER BY k.id DESC LIMIT 500`,
          ...params,
        )
        .map((r) => ({
          ...r,
          legal_area_label: AREA[r.legal_area],
          specialists_count: parseJson(r.specialists, []).length,
          corrections_count: parseJson(r.ai_corrections, []).length,
          tags: parseJson(r.tags, []),
          specialists: undefined,
          ai_corrections: undefined,
        }));
      const stats = {
        total: Number(db.value('SELECT COUNT(*) FROM knowledge_records')),
        pending_review: Number(db.value("SELECT COUNT(*) FROM knowledge_records WHERE status = 'pending_review'")),
        approved: Number(db.value("SELECT COUNT(*) FROM knowledge_records WHERE status = 'approved'")),
        training: Number(db.value("SELECT COUNT(*) FROM knowledge_records WHERE status = 'approved' AND usage = 'knowledge_training'")),
        excluded: Number(db.value("SELECT COUNT(*) FROM knowledge_records WHERE status = 'excluded'")),
        by_area: db.all("SELECT legal_area, COUNT(*) AS n FROM knowledge_records WHERE status = 'approved' GROUP BY legal_area").map((r) => ({ ...r, label: AREA[r.legal_area], n: Number(r.n) })),
      };
      return { items, stats };
    },

    update(id, body, actor) {
      const r = svc.get(id);
      const patch = { updated_at: nowIso() };
      if (body.title !== undefined) patch.title = v.str(body.title, 'العنوان', { required: true, max: 300 });
      if (body.facts !== undefined) patch.facts = v.str(body.facts, 'الوقائع', { required: true, max: 20000 });
      if (body.final_answer !== undefined) patch.final_answer = v.str(body.final_answer, 'الإجابة المعتمدة', { max: 60000 });
      if (body.client_answer !== undefined) patch.client_answer = v.str(body.client_answer, 'الرد على العميل', { max: 10000 });
      if (body.legal_area !== undefined) patch.legal_area = v.oneOf(body.legal_area, AREA_CODES, 'المجال', { required: true });
      if (body.issues !== undefined) {
        if (!Array.isArray(body.issues)) throw badRequest('المسائل يجب أن تكون قائمة');
        patch.issues = JSON.stringify(body.issues.map((x) => v.str(x, 'المسألة', { required: true, max: 500 })));
      }
      if (body.tags !== undefined) {
        if (!Array.isArray(body.tags)) throw badRequest('الوسوم يجب أن تكون قائمة');
        patch.tags = JSON.stringify(body.tags.map((x) => v.str(x, 'الوسم', { required: true, max: 50 })).slice(0, 20));
      }
      // أي تعديل بعد الاعتماد يعيد السجل للمراجعة حتى لا يُستخدم محتوى لم يُراجع
      if (r.status === 'approved' && Object.keys(patch).some((k) => ['title', 'facts', 'final_answer', 'client_answer', 'issues'].includes(k))) {
        patch.status = 'pending_review';
        patch.usage = 'none';
      }
      db.update('knowledge_records', r.id, patch);
      return svc.get(r.id);
    },

    approve(id, body, actor) {
      const r = svc.get(id);
      // v10 b2b-server (L-30): معرفة ملفات الشركات لا تُعتمد للاستخدام العام في 10.0
      if (r.scope === 'company' || r.company_id) throw Object.assign(conflict('هذه حالة من ملف شركة؛ لا تُعتمد في المعرفة العامة.'), { code: 'company_knowledge_not_shareable' });
      const usage = v.oneOf(body.usage, ['knowledge', 'knowledge_training'], 'نطاق الاستخدام', { required: true });
      if (!body.confirm_redaction) throw badRequest('يجب تأكيد مراجعة إخفاء البيانات الشخصية قبل الاعتماد');
      if (!r.facts || r.facts.trim().length < 20) throw conflict('لا يمكن اعتماد سجل بلا وقائع كافية');
      const report = { ...r.redaction_report, reviewed: true, reviewed_at: nowIso() };
      db.update('knowledge_records', r.id, {
        status: 'approved',
        usage,
        review_note: v.str(body.note, 'ملاحظة', { max: 2000 }),
        reviewed_by: actor.id,
        reviewed_at: nowIso(),
        redaction_report: JSON.stringify(report),
        updated_at: nowIso(),
      });
      app.activity.log({ case_id: r.case_id, actor, type: 'knowledge.approved', summary: `اعتُمدت الحالة في المعرفة المؤسسية (${LABELS.knowledge_usage[usage]})` });
      return svc.get(r.id);
    },

    exclude(id, body, actor) {
      const r = svc.get(id);
      db.update('knowledge_records', r.id, {
        status: 'excluded',
        usage: 'none',
        review_note: v.str(body.note, 'سبب الاستبعاد', { required: true, max: 2000 }),
        reviewed_by: actor.id,
        reviewed_at: nowIso(),
        updated_at: nowIso(),
      });
      app.activity.log({ case_id: r.case_id, actor, type: 'knowledge.excluded', summary: 'استُبعدت الحالة من الاستخدام المعرفي' });
      return svc.get(r.id);
    },

    /** إعادة الإخفاء والبناء من الملف (للسجلات غير المعتمدة) */
    rebuild(id) {
      const r = svc.get(id);
      if (r.status === 'approved') throw conflict('السجل معتمد. أعده للمراجعة أولًا بتعديله.');
      if (!r.case_id) throw badRequest('السجل غير مرتبط بملف');
      if (r.status === 'excluded') db.update('knowledge_records', r.id, { status: 'pending_review' });
      return svc.buildFromCase(r.case_id);
    },

    /** بحث في المعرفة المعتمدة (للإدارة) */
    search(q) {
      return app.ai.similar(q, { scope: 'lawyer', limit: 15 });
    },

    /** تصدير الحالات المعتمدة للتدريب/التقييم (مجهلة فقط) */
    exportTraining() {
      return db
        .all("SELECT * FROM knowledge_records WHERE status = 'approved' AND usage = 'knowledge_training' AND (scope IS NULL OR scope = 'global') ORDER BY id") // v10 (L-30)
        .map(mapRecord)
        .map((r) => ({
          id: r.id,
          legal_area: r.legal_area,
          title: r.title,
          facts: r.facts,
          issues: r.issues,
          info_requested: r.info_requested,
          documents_requested: r.documents_requested,
          specialists: r.specialists.map((s) => ({ kind: s.kind, specialty: s.specialty })),
          final_answer: r.final_answer,
          client_answer: r.client_answer,
          ai_corrections: r.ai_corrections,
          outcome: r.outcome,
        }));
    },
  };
  return svc;
}
