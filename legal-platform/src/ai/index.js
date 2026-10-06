// خدمة الذكاء الاصطناعي: تحليل الطلبات، اقتراح المسائل، المسودات، النسخة الموجهة للعميل،
// البحث عن الحالات المشابهة، وتسجيل التصحيحات (Feedback) لقياس الأداء وتحسينه.
import { nowIso, parseJson, notFound, truncate } from '../util.js';
import { LABELS, LEGAL_AREAS } from '../constants.js';
import * as H from './heuristic.js';
import { createAnthropicProvider, AiUnavailable } from './anthropic.js';
import { buildIndex, similarityRatio, tokens } from './text.js';

export function createAi(app) {
  const { db, config } = app;
  const wantAnthropic =
    config.ai.provider === 'anthropic' || (config.ai.provider === 'auto' && !!config.ai.anthropicApiKey);
  const anthropic = wantAnthropic && config.ai.anthropicApiKey
    ? createAnthropicProvider({ apiKey: config.ai.anthropicApiKey, model: config.ai.model, effort: config.ai.effort, log: app.log })
    : null;
  const timers = new Map();
  const indexCache = new Map();

  async function run(method, args, fallback) {
    if (anthropic) {
      try {
        const out = await anthropic[method](args);
        const model = out._model;
        delete out._model;
        return { output: out, provider: 'anthropic', model };
      } catch (e) {
        if (!(e instanceof AiUnavailable)) app.log('ai provider error', e);
        return { output: fallback(), provider: 'heuristic', model: 'local-rules-v1', fallback_reason: e.message };
      }
    }
    return { output: fallback(), provider: 'heuristic', model: 'local-rules-v1' };
  }

  function store(entity_type, entity_id, kind, result, actor) {
    const output = { ...result.output };
    if (result.fallback_reason) output._fallback_reason = result.fallback_reason;
    const id = db.insert('ai_suggestions', {
      entity_type,
      entity_id,
      kind,
      provider: result.provider,
      model: result.model,
      output: JSON.stringify(output),
      created_by: actor?.id ?? null,
      created_at: nowIso(),
    });
    return svc.suggestion(id);
  }

  // ===== فهارس التشابه =====
  function staffIndex() {
    const sig = db.get('SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM cases');
    const key = `staff:${sig.c}:${sig.u}`;
    if (indexCache.get('staff')?.key === key) return indexCache.get('staff').index;
    const docs = db
      .all(
        `SELECT c.id, c.code, c.title, c.legal_area, c.status, c.outcome, c.facts_shared, c.facts_internal, i.summary AS intake_summary,
           (SELECT substr(group_concat(m.body, ' '), 1, 3000) FROM messages m WHERE m.intake_id = c.intake_id AND m.direction = 'in') AS client_text
         FROM cases c LEFT JOIN intakes i ON i.id = c.intake_id`,
      )
      .map((r) => ({
        id: r.id,
        type: 'case',
        code: r.code,
        title: r.title,
        legal_area: r.legal_area,
        status: r.status,
        outcome: r.outcome,
        // نص العميل الأصلي (عامية غالبًا) مع الوقائع المصاغة، حتى يتطابق الوارد الجديد مع الحالتين
        text: [r.title, r.title, r.facts_shared, r.facts_internal, r.intake_summary, r.client_text].filter(Boolean).join('\n'),
      }));
    const index = buildIndex(docs);
    indexCache.set('staff', { key, index });
    return index;
  }
  function knowledgeIndex() {
    const sig = db.get("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM knowledge_records WHERE status = 'approved' AND usage != 'none'");
    const key = `kn:${sig.c}:${sig.u}`;
    if (indexCache.get('kn')?.key === key) return indexCache.get('kn').index;
    const docs = db
      .all("SELECT id, title, legal_area, facts, issues, final_answer FROM knowledge_records WHERE status = 'approved' AND usage != 'none'")
      .map((r) => ({
        id: r.id,
        type: 'knowledge',
        title: r.title,
        legal_area: r.legal_area,
        key_points: truncate(r.final_answer || '', 400),
        issues: parseJson(r.issues, []),
        text: [r.title, r.title, r.facts, parseJson(r.issues, []).join('\n')].join('\n'),
      }));
    const index = buildIndex(docs);
    indexCache.set('kn', { key, index });
    return index;
  }

  const svc = {
    status() {
      return {
        provider: anthropic ? 'anthropic' : 'heuristic',
        model: anthropic ? config.ai.model : 'local-rules-v1',
        label: anthropic ? `Claude (${config.ai.model})` : 'المحلل المحلي (قواعد عربية بدون إنترنت)',
      };
    },

    suggestion(id) {
      const r = db.get('SELECT * FROM ai_suggestions WHERE id = ?', id);
      if (!r) return null;
      return { ...r, output: parseJson(r.output, {}) };
    },
    latest(entityType, entityId, kind) {
      const r = db.get(
        'SELECT * FROM ai_suggestions WHERE entity_type = ? AND entity_id = ? AND kind = ? ORDER BY id DESC LIMIT 1',
        entityType,
        entityId,
        kind,
      );
      return r ? { ...r, output: parseJson(r.output, {}) } : null;
    },

    /**
     * حالات مشابهة: للإدارة من كل ملفات المؤسسة، وللمحامي من المعرفة المعتمدة المجهّلة فقط.
     * الدرجة = تشابه النص (مقاطع وجذوع) + 0.1 إذا تطابق المجال القانوني.
     */
    similar(text, { scope = 'staff', excludeCaseId = null, limit = 10, area = null } = {}) {
      if (!text || !tokens(text).length) return { total: 0, items: [] };
      const threshold = Number(app.settings.get('similarity_threshold')) || 0.15;
      const AREA_BOOST = 0.1;
      const index = scope === 'staff' ? staffIndex() : knowledgeIndex();
      const res = index.query(text, { limit: 10000, threshold: Math.max(0, threshold - AREA_BOOST) });
      const all = res.items
        .filter((x) => !(x.doc.type === 'case' && x.doc.id === excludeCaseId))
        .map((x) => ({ doc: x.doc, score: x.score + (area && x.doc.legal_area === area ? AREA_BOOST : 0) }))
        .filter((x) => x.score >= threshold)
        .sort((a, b) => b.score - a.score);
      const items = all.slice(0, limit).map((x) => {
        const { text: _t, ...doc } = x.doc;
        return { ...doc, score: Math.round(Math.min(x.score, 1) * 100) / 100 };
      });
      return { total: all.length, items };
    },

    scheduleIntakeAnalysis(intakeId, delayMs = anthropic ? 4000 : 300) {
      clearTimeout(timers.get(intakeId));
      const t = setTimeout(() => {
        timers.delete(intakeId);
        svc.analyzeIntake(intakeId).catch((e) => app.log('ai analyze', e));
      }, delayMs);
      t.unref?.();
      timers.set(intakeId, t);
    },
    cancelTimers() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },

    /** تحليل طلب وارد: تلخيص، تصنيف، وقائع، نواقص، مسائل مقترحة، وحالات مشابهة */
    async analyzeIntake(intakeId, actor = null) {
      const intake = db.get('SELECT * FROM intakes WHERE id = ?', intakeId);
      if (!intake) throw notFound('الطلب غير موجود');
      const msgs = db.all("SELECT body FROM messages WHERE intake_id = ? AND direction = 'in' ORDER BY id", intakeId);
      const docs = db.all('SELECT filename FROM documents WHERE intake_id = ?', intakeId);
      let text = msgs.map((m) => m.body).join('\n');
      if (docs.length) text += `\n[مرفقات مرسلة: ${docs.map((d) => d.filename).join('، ')}]`;
      const ctx = { governorate: intake.governorate };
      const result = await run('analyzeIntake', text, () => H.analyzeIntake(text, ctx));
      result.output.similar = svc.similar(text, { scope: 'staff', limit: 10, area: result.output.legal_area });
      const sug = store('intake', intakeId, 'intake_analysis', result, actor);
      app.activity.log({
        intake_id: intakeId,
        client_id: intake.client_id,
        actor: { kind: 'ai' },
        type: 'ai.analyzed',
        summary: `حلل الذكاء الاصطناعي الطلب: ${LABELS.priority[result.output.urgency] ? 'أولوية ' + LABELS.priority[result.output.urgency] + '، ' : ''}التصنيف المقترح «${(LEGAL_AREAS.find((a) => a.code === result.output.legal_area) || {}).label || result.output.legal_area}»`,
        data: { suggestion_id: sug.id, provider: result.provider },
      });
      const similarCount = result.output.similar.total;
      if (similarCount >= 3) {
        const already = db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'ai.similar_alert'", intakeId);
        if (!already) {
          app.activity.log({
            intake_id: intakeId,
            actor: { kind: 'ai' },
            type: 'ai.similar_alert',
            summary: `هذا الطلب يشبه ${similarCount} حالات تعاملت معها المؤسسة من قبل`,
            data: { count: similarCount },
          });
          app.notifications.notifyStaff({
            type: 'ai.similar',
            title: `طلب ${intake.code} يشبه ${similarCount} حالات سابقة`,
            body: 'يمكن الاستفادة من الحالات السابقة في التصنيف واختيار المحامي.',
            link: `#/inbox/${intakeId}`,
          });
        }
      }
      // رفع الأولوية تلقائيًا للحالات العاجلة (قرار قابل للتعديل من الإدارة)
      if (['high', 'urgent'].includes(result.output.urgency) && intake.priority === 'normal' && intake.status !== 'converted') {
        db.update('intakes', intakeId, { priority: result.output.urgency, updated_at: nowIso() });
      }
      return sug;
    },

    async suggestIssuesForCase(caseId, actor) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) throw notFound('الملف غير موجود');
      const facts = [c.facts_shared, c.facts_internal].filter(Boolean).join('\n') || c.title;
      const result = await run('suggestIssues', { title: c.title, facts, area: c.legal_area }, () => {
        const cls = H.classify(facts);
        return { issues: H.suggestIssuesFor(c.legal_area, `${c.title}\n${facts}`, cls.secondary.filter((a) => a !== c.legal_area)) };
      });
      return store('case', caseId, 'issues', result, actor);
    },

    /** مسودة أولية لمحامٍ — تعتمد فقط على ما أتاحته الإدارة له + المعرفة المعتمدة المجهّلة */
    async draftForAssignment(assignmentId, lawyer) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      const view = app.visibility.assignmentView(assignmentId, lawyer);
      const facts = view.facts || '';
      const similar = svc.similar(`${view.case.title}\n${facts}`, { scope: 'lawyer', limit: 3, area: view.case.legal_area }).items;
      const args = {
        title: view.case.title,
        area: view.case.legal_area,
        facts,
        brief: view.assignment.brief,
        issues: view.issues.map((i) => ({ number: i.number, title: i.title, details: i.details })),
        missing: [],
        similar: similar.map((s) => ({ title: s.title, key_points: s.key_points })),
      };
      const result = await run('draftOpinion', args, () => ({ text: H.draftOpinion(args) }));
      const sug = store('assignment', assignmentId, 'draft', result, lawyer);
      app.activity.log({
        case_id: a.case_id,
        actor: lawyer,
        type: 'ai.draft',
        summary: 'أعد الذكاء الاصطناعي مسودة أولية للمحامي',
        data: { suggestion_id: sug.id, assignment_id: assignmentId },
      });
      return sug;
    },

    async clientVersion(caseId, opinionId, actor) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) throw notFound('الملف غير موجود');
      const op = db.get('SELECT * FROM opinions WHERE id = ? AND case_id = ?', opinionId, caseId);
      if (!op) throw notFound('الرأي غير موجود');
      const client = app.clients.get(c.client_id);
      const args = { clientName: client?.name, caseCode: c.code, opinion: op.body };
      const result = await run('clientVersion', args, () => ({ text: H.clientVersion(args) }));
      return store('case', caseId, 'client_version', result, actor);
    },

    // ===== التصحيحات والتغذية الراجعة =====
    recordFeedback({ suggestion_id = null, entity_type, entity_id, case_id = null, field, verdict, ai_value = null, final_value = null, actor = null, note = null }) {
      db.insert('ai_feedback', {
        suggestion_id,
        entity_type,
        entity_id,
        case_id,
        field,
        verdict,
        ai_value: ai_value === null || ai_value === undefined ? null : typeof ai_value === 'string' ? ai_value : JSON.stringify(ai_value),
        final_value: final_value === null || final_value === undefined ? null : typeof final_value === 'string' ? final_value : JSON.stringify(final_value),
        actor_user_id: actor?.id ?? null,
        actor_role: actor?.role ?? actor?.kind ?? null,
        note,
        created_at: nowIso(),
      });
    },

    /** مقارنة قرار الإدارة النهائي باقتراح الذكاء الاصطناعي عند تحويل الطلب إلى ملف */
    feedbackOnConversion(intakeId, caseId, { legal_area, title }, actor) {
      const sug = svc.latest('intake', intakeId, 'intake_analysis');
      if (!sug) return;
      const o = sug.output;
      svc.recordFeedback({
        suggestion_id: sug.id, entity_type: 'intake', entity_id: intakeId, case_id: caseId, field: 'legal_area',
        verdict: o.legal_area === legal_area ? 'accepted' : 'corrected', ai_value: o.legal_area, final_value: legal_area, actor,
      });
      if (o.title) {
        const same = o.title.trim() === String(title).trim();
        svc.recordFeedback({
          suggestion_id: sug.id, entity_type: 'intake', entity_id: intakeId, case_id: caseId, field: 'title',
          verdict: same ? 'accepted' : similarityRatio(o.title, title) >= 0.5 ? 'accepted' : 'corrected',
          ai_value: o.title, final_value: title, actor,
        });
      }
    },

    /** المحامي طلب معلومة: هل توقعها الذكاء الاصطناعي ضمن النواقص؟ */
    feedbackOnInfoRequest(caseId, question, actor) {
      const c = db.get('SELECT intake_id FROM cases WHERE id = ?', caseId);
      if (!c?.intake_id) return;
      const sug = svc.latest('intake', c.intake_id, 'intake_analysis');
      if (!sug) return;
      const missing = (sug.output.missing_info || []).map((m) => (typeof m === 'string' ? m : m.item));
      const anticipated = missing.some((m) => similarityRatio(m, question) >= 0.2);
      svc.recordFeedback({
        suggestion_id: sug.id, entity_type: 'intake', entity_id: c.intake_id, case_id: caseId, field: 'missing_info',
        verdict: anticipated ? 'accepted' : 'missed', ai_value: missing, final_value: question, actor,
        note: sug.output.information_sufficient ? 'كان الذكاء الاصطناعي قد اعتبر المعلومات كافية' : null,
      });
    },

    /** المحامي احتاج متخصصًا: هل توقع الذكاء الاصطناعي المجال الثانوي؟ */
    feedbackOnCounsel(caseId, specialty, actor) {
      if (!specialty) return;
      const c = db.get('SELECT intake_id FROM cases WHERE id = ?', caseId);
      if (!c?.intake_id) return;
      const sug = svc.latest('intake', c.intake_id, 'intake_analysis');
      if (!sug) return;
      const predicted = sug.output.secondary_areas || [];
      svc.recordFeedback({
        suggestion_id: sug.id, entity_type: 'intake', entity_id: c.intake_id, case_id: caseId, field: 'specialist_needed',
        verdict: predicted.includes(specialty) ? 'accepted' : 'missed', ai_value: predicted, final_value: specialty, actor,
      });
    },

    /** مقدار تعديل المحامي على المسودة الآلية عند التقديم */
    feedbackOnDraft(opinion, actor) {
      if (!opinion.ai_suggestion_id) return;
      const sug = svc.suggestion(opinion.ai_suggestion_id);
      if (!sug) return;
      const ratio = similarityRatio(sug.output.text || '', opinion.body);
      svc.recordFeedback({
        suggestion_id: sug.id, entity_type: 'assignment', entity_id: opinion.assignment_id, case_id: opinion.case_id, field: 'draft',
        verdict: ratio >= 0.85 ? 'accepted' : ratio >= 0.2 ? 'corrected' : 'rejected',
        ai_value: truncate(sug.output.text, 2000), final_value: truncate(opinion.body, 2000), actor,
        note: `نسبة التشابه بين المسودة والنسخة المقدمة: ${Math.round(ratio * 100)}%`,
      });
    },

    /** مؤشرات أداء الذكاء الاصطناعي من التصحيحات المتراكمة */
    metrics() {
      const rows = db.all('SELECT field, verdict, COUNT(*) AS n FROM ai_feedback GROUP BY field, verdict');
      const fields = {};
      for (const r of rows) {
        fields[r.field] = fields[r.field] || { field: r.field, label: LABELS.ai_field[r.field] || r.field, total: 0, accepted: 0, corrected: 0, rejected: 0, missed: 0 };
        fields[r.field][r.verdict] += Number(r.n);
        fields[r.field].total += Number(r.n);
      }
      const list = Object.values(fields).map((f) => ({ ...f, accuracy: f.total ? Math.round((f.accepted / f.total) * 1000) / 1000 : null }));
      const monthly = db.all(
        `SELECT substr(created_at, 1, 7) AS month, field, SUM(verdict = 'accepted') AS accepted, COUNT(*) AS total
         FROM ai_feedback GROUP BY month, field ORDER BY month`,
      ).map((r) => ({ ...r, accepted: Number(r.accepted), total: Number(r.total), accuracy: r.total ? Number(r.accepted) / Number(r.total) : null }));
      const providers = db.all('SELECT provider, kind, COUNT(*) AS n FROM ai_suggestions GROUP BY provider, kind');
      const recent = db.all(
        `SELECT f.*, u.name AS actor_name, c.code AS case_code FROM ai_feedback f
         LEFT JOIN users u ON u.id = f.actor_user_id LEFT JOIN cases c ON c.id = f.case_id
         WHERE f.verdict != 'accepted' ORDER BY f.id DESC LIMIT 30`,
      );
      return { fields: list, monthly, providers, recent_corrections: recent, status: svc.status() };
    },
  };
  return svc;
}
