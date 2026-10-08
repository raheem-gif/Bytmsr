// الإصدار 10 — فرز طلبات الشركات بالذكاء الاصطناعي (B10 §10، L-29، CS-13، CS-24): المحلل المحلي دائمًا متاح (P0)،
// وClaude عند ضبطه وضمن سقف الإنفاق (P1) عبر run()/store() نفسها في src/ai/index.js. المخرجات لفريق المكتب فقط.
//
// العزل (INV-B8): سياق الشركة يُبنى من ذاكرتها وطلباتها هي فقط — كل SQL هنا يربط company_id، ومفتاح ذاكرة الفهرس
// company:${id}:${count}:${maxUpdated} لا يشارك فهارس الأفراد أبدًا. الحد التلقائي «3 مرات لكل طلب في 24 ساعة» يُعد من
// صفوف ai_usage المحفوظة (لا من الذاكرة) فيبقى بعد إعادة التشغيل، وإعادة التشغيل اليدوية من الفريق 20 في الساعة لكل موظف.
import { nowIso, parseJson, normalizeArabic, ApiError, cairoDayKey, now } from '../util.js';
import { buildIndex } from './text.js';
import { triageHeuristic, postProcessTriage } from './company-heuristic.js';
import { lawyerMemoryData, memoryKindByKey } from '../../public/assets/js/lib/company-catalog-fields.js';
import { TERMS_DEFAULTS } from '../services/company-billing.js';

export const TRIAGE_AUTO_PER_DAY = 3;
export const TRIAGE_STAFF_PER_HOUR = 20;
const FEATURE = 'company_triage';
const DELIVERABLE_FEATURE = 'company_deliverable';
const RISK_LEVELS = ['low', 'medium', 'high'];

/**
 * تنظيف مخرجات «ملخص التسليم» (B10 §10.2): الأطوال، درجة المخاطر، وحذف أسماء المحامين المسجلة صراحةً
 * (الاسم الكامل واسم المستخدم والاسم اللاتيني). بوابة الإرسال تفحص بعد ذلك كل الصيغ الأخرى (L-56).
 */
export function postProcessDeliverable(out, { lawyers = [] } = {}) {
  const o = out && typeof out === 'object' ? out : {};
  const strip = (text) => {
    let t = String(text ?? '');
    for (const l of lawyers) {
      for (const n of [l.name, l.name_latin].filter(Boolean).sort((a, b) => b.length - a.length)) t = t.split(n).join('');
      if (l.username && String(l.username).length >= 3) t = t.replace(new RegExp(`\\b${String(l.username).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
    }
    return t.replace(/[ \t]{2,}/g, ' ').trim();
  };
  return {
    summary: strip(o.summary).slice(0, 600),
    recommendations: (Array.isArray(o.recommendations) ? o.recommendations : [])
      .map((x) => strip(typeof x === 'string' ? x : x?.text).slice(0, 200))
      .filter(Boolean)
      .slice(0, 8),
    risk_level: RISK_LEVELS.includes(o.risk_level) ? o.risk_level : null,
    body: strip(o.body).slice(0, 8000),
  };
}

export function createCompanyAi(app, { run, store, active }) {
  const { db } = app;
  const indexCache = new Map(); // companyId → { key, index }
  const timers = new Map();
  const inflight = new Set();

  /** فهرس ذاكرة الشركة وطلباتها المغلقة — مفتاحه يتضمن معرّف الشركة (CS-13) */
  function companyIndex(companyId) {
    const sig = db.get(
      `SELECT (SELECT COUNT(*) FROM company_memory WHERE company_id = ? AND archived_at IS NULL) AS mc,
              (SELECT MAX(updated_at) FROM company_memory WHERE company_id = ?) AS mu,
              (SELECT COUNT(*) FROM company_requests WHERE company_id = ? AND status = 'closed') AS rc,
              (SELECT MAX(updated_at) FROM company_requests WHERE company_id = ? AND status = 'closed') AS ru`,
      companyId,
      companyId,
      companyId,
      companyId,
    );
    const key = `company:${companyId}:${sig.mc + sig.rc}:${[sig.mu, sig.ru].filter(Boolean).sort().pop() || ''}`;
    const hit = indexCache.get(companyId);
    if (hit?.key === key) return hit.index;
    const memory = db
      .all(
        `SELECT m.*, cp.name AS cp_name, cp.name_norm AS cp_norm FROM company_memory m LEFT JOIN company_counterparties cp ON cp.id = m.counterparty_id AND cp.company_id = m.company_id
         WHERE m.company_id = ? AND m.archived_at IS NULL ORDER BY m.id DESC LIMIT 500`,
        companyId,
      )
      .map((m) => ({ id: `M-${m.id}`, ref: `M-${m.id}`, src: 'memory', row: m, text: [m.title, m.title, m.summary, m.cp_name, Object.values(parseJson(m.data, {}) || {}).filter((x) => typeof x === 'string').join(' ')].filter(Boolean).join('\n') }));
    const closed = db
      .all(
        `SELECT r.id, r.code, r.type, r.title, r.fields, (SELECT d.summary FROM company_deliverables d WHERE d.request_id = r.id AND d.status = 'released' AND d.final = 1 ORDER BY d.version DESC LIMIT 1) AS summary
         FROM company_requests r WHERE r.company_id = ? AND r.status = 'closed' ORDER BY r.id DESC LIMIT 50`,
        companyId,
      )
      .map((r) => ({ id: `R-${r.code}`, ref: `R-${r.code}`, src: 'request', row: r, text: [r.title, r.title, r.summary, Object.values(parseJson(r.fields, {}) || {}).filter((x) => typeof x === 'string').join(' ')].filter(Boolean).join('\n') }));
    const index = buildIndex([...memory, ...closed]);
    indexCache.set(companyId, { key, index });
    return index;
  }

  /**
   * سياق الشركة (B10 §10.4): عناصر الذاكرة وطلبات الشركة نفسها الأقرب لنص الطلب. forLawyer: حقول المحامي فقط بلا
   * ملاحظات داخلية ولا «مفوَّضين»؛ memoryIds: تقييد بعناصر محددة (المنح للمحامي) داخل الشركة نفسها.
   */
  function companyContext(companyId, { text = '', counterparties = [], type = null, forLawyer = false, memoryIds = null, limit = 8 } = {}) {
    const cpNorms = new Set(counterparties.filter(Boolean).map((n) => app.companyMemory?.counterpartyNorm(n) || normalizeArabic(n)));
    if (memoryIds) {
      const ids = memoryIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
      if (!ids.length) return [];
      return db
        .all(`SELECT * FROM company_memory WHERE company_id = ? AND archived_at IS NULL AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, companyId, ...ids)
        .filter((m) => !forLawyer || memoryKindByKey(m.kind)?.grantable !== false)
        .map((m) => memoryItem(m, { forLawyer }));
    }
    const index = companyIndex(companyId);
    const scored = index.query(text || '', { limit: 50 }).items.map((x) => ({ doc: x.doc, score: x.score }));
    const seen = new Set(scored.map((x) => x.doc.ref));
    // مطابقة الطرف الآخر بالاسم الموحَّد حتى لو لم يتشابه النص
    if (cpNorms.size) {
      for (const m of db.all('SELECT m.*, cp.name_norm AS cp_norm, cp.name AS cp_name FROM company_memory m JOIN company_counterparties cp ON cp.id = m.counterparty_id AND cp.company_id = m.company_id WHERE m.company_id = ? AND m.archived_at IS NULL', companyId)) {
        if (cpNorms.has(m.cp_norm) && !seen.has(`M-${m.id}`)) {
          scored.push({ doc: { ref: `M-${m.id}`, src: 'memory', row: m }, score: 0 });
          seen.add(`M-${m.id}`);
        }
      }
    }
    for (const s of scored) {
      const row = s.doc.row;
      if (s.doc.src === 'memory') {
        if (row.cp_norm && cpNorms.has(row.cp_norm)) s.score += 0.5;
        if (type === 'nda' && row.kind === 'template') s.score += 0.3;
        if (row.kind === 'position') s.score += 0.1;
      }
    }
    return scored
      .filter((s) => s.doc.src === 'request' || !forLawyer || memoryKindByKey(s.doc.row.kind)?.grantable !== false)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => (s.doc.src === 'memory' ? memoryItem(s.doc.row, { forLawyer, score: s.score }) : { ref: s.doc.ref, kind: 'request', title: s.doc.row.title, summary: s.doc.row.summary || null, score: Math.round(s.score * 100) / 100 }));
  }

  function memoryItem(m, { forLawyer = false, score = null } = {}) {
    const data = parseJson(m.data, {}) || {};
    const out = {
      ref: `M-${m.id}`,
      id: m.id,
      kind: m.kind,
      title: m.title,
      summary: m.summary || null,
      dates: { start_date: m.start_date || null, end_date: m.end_date || null, notice_deadline: m.notice_deadline || null, next_date: m.next_date || null },
      data: forLawyer ? lawyerMemoryData(m.kind, data) : data,
    };
    if (!forLawyer && m.staff_notes) out.staff_notes = m.staff_notes;
    if (score !== null) out.score = Math.round(score * 100) / 100;
    return out;
  }

  /** عدد مرات الفرز التلقائي للطلب خلال 24 ساعة (من ai_usage المحفوظة) */
  function autoRunsLastDay(requestId) {
    const since = new Date(now().getTime() - 86400000).toISOString();
    // ok = 1: تشغيل واحد = صف واحد (محاولة Claude فاشلة ثم المحلل المحلي لا تُحسبان مرتين)
    return Number(db.value("SELECT COUNT(*) FROM ai_usage WHERE feature = ? AND entity_type = 'company_request' AND entity_id = ? AND user_id IS NULL AND ok = 1 AND created_at >= ?", FEATURE, requestId, since));
  }
  function staffRunsLastHour(userId) {
    const since = new Date(now().getTime() - 3600000).toISOString();
    return Number(db.value('SELECT COUNT(*) FROM ai_usage WHERE feature = ? AND user_id = ? AND ok = 1 AND created_at >= ?', FEATURE, userId, since));
  }

  /** مدخلات الفرز (بلا أسماء موظفي الشركة ولا سعر الباقة) */
  function triageContext(r) {
    const company = db.get('SELECT * FROM companies WHERE id = ?', r.company_id);
    const terms = app.companyBilling?.activeSubscription(r.company_id)?.terms || TERMS_DEFAULTS;
    const fields = parseJson(r.fields, {}) || {};
    const documents = db.all("SELECT title, filename FROM documents WHERE company_request_id = ? AND uploaded_by_kind = 'client'", r.id);
    const entity = r.entity_id ? db.get('SELECT name FROM company_entities WHERE id = ? AND company_id = ?', r.entity_id, r.company_id) : null;
    const names = db.all('SELECT name FROM company_users WHERE company_id = ?', r.company_id).map((u) => u.name);
    const cps = ['counterparty_name', 'sender_name', 'supplier_name'].map((k) => fields[k]).filter(Boolean);
    const memory = companyContext(r.company_id, { text: `${r.title}\n${r.description}`, counterparties: cps, type: r.type, forLawyer: false, limit: 8 }).map((m) => ({ ...m, why: m.kind === 'request' ? 'طلب سابق مشابه للشركة.' : cps.length && m.ref.startsWith('M-') ? 'مرتبط بالطرف الآخر أو بموضوع الطلب.' : 'موضوع مشابه في ذاكرة الشركة.' }));
    return {
      company,
      ctx: {
        request: { type: r.type, title: r.title, description: r.description, priority: r.priority, urgent_reason: r.urgent_reason, needed_by: r.needed_by, visibility: r.visibility },
        fields,
        documents,
        entityName: entity?.name || null,
        today: cairoDayKey(nowIso()),
        plan: { scope_types: terms.scope_types || [], excluded_work: terms.excluded_work || [], contract_value_cap_minor: terms.contract_value_cap_minor ?? null, senior_review: terms.senior_review || 'never' },
        memory,
        names,
      },
    };
  }

  /** فرز طلب (تلقائيًا أو بطلب موظف): يحفظ الاقتراح ويربطه بالطلب. يعيد الاقتراح أو null عند بلوغ الحد التلقائي */
  async function triage(requestId, actor = null, { reason = null } = {}) {
    const r = db.get('SELECT * FROM company_requests WHERE id = ?', requestId);
    if (!r) throw new ApiError(404, 'طلب الشركة غير موجود', 'not_found');
    if (actor) {
      if (staffRunsLastHour(actor.id) >= TRIAGE_STAFF_PER_HOUR) throw new ApiError(429, 'بلغت حد إعادة الفرز (20 مرة في الساعة). حاول بعد قليل.', 'rate_limited');
    } else if (autoRunsLastDay(r.id) >= TRIAGE_AUTO_PER_DAY) {
      return null;
    }
    const { ctx } = triageContext(r);
    const meta = { feature: FEATURE, entity_type: 'company_request', entity_id: r.id, user_id: actor?.id ?? null };
    const provider = active?.()?.provider;
    const forceLocal = !provider || typeof provider.companyTriage !== 'function';
    const res = await run('companyTriage', { context: ctx }, () => triageHeuristic(ctx), meta, { forceLocal, reason: null });
    const output = postProcessTriage(res.output, ctx);
    if (reason) output._reason = reason;
    const sug = store('company_request', r.id, FEATURE, { ...res, output }, actor);
    db.run('UPDATE company_requests SET ai_suggestion_id = ?, triaged_at = ? WHERE id = ?', sug.id, nowIso(), r.id);
    return sug;
  }

  /**
   * «ملخص التسليم» (B10 §10.2، P1): من الرأي المعتمد إلى خلاصة وتوصيات ونص بلغة الأعمال. يُحفظ اقتراحًا (kind
   * deliverable_summary) ينسخه الفريق إلى المسودة؛ لا يُرسل للشركة تلقائيًا أبدًا. المحلل المحلي = التعبئة الحتمية (L-58).
   */
  async function deliverableSummary(requestId, actor, { opinionId } = {}) {
    const since = new Date(now().getTime() - 3600000).toISOString();
    if (Number(db.value('SELECT COUNT(*) FROM ai_usage WHERE feature = ? AND user_id = ? AND ok = 1 AND created_at >= ?', DELIVERABLE_FEATURE, actor.id, since)) >= TRIAGE_STAFF_PER_HOUR) {
      throw new ApiError(429, 'بلغت حد ملخصات التسليم (20 مرة في الساعة). حاول بعد قليل.', 'rate_limited');
    }
    const base = app.companyRequests.prefill(requestId, { opinion_id: opinionId });
    const r = db.get('SELECT * FROM company_requests WHERE id = ?', requestId);
    const lawyers = app.companyDocGate.caseLawyers(r.case_id);
    const sug0 = r.ai_suggestion_id ? app.ai.suggestion(r.ai_suggestion_id) : null;
    const tri = sug0 ? (typeof sug0.output === 'string' ? parseJson(sug0.output, {}) : sug0.output) || {} : {};
    const context = {
      request: { type: r.type, title: r.title },
      opinion: base.body,
      client_steps: base.recommendations,
      risk_level: base.risk_level,
      risk_flags: Array.isArray(tri.risk_flags) ? tri.risk_flags.map((x) => x.code) : [],
      lawyer_names: lawyers.flatMap((l) => [l.name, l.name_latin].filter(Boolean)),
    };
    const meta = { feature: DELIVERABLE_FEATURE, entity_type: 'company_request', entity_id: r.id, user_id: actor.id };
    const provider = active?.()?.provider;
    const forceLocal = !provider || typeof provider.companyDeliverable !== 'function';
    const res = await run('companyDeliverable', { context }, () => ({ summary: base.summary, recommendations: base.recommendations, risk_level: base.risk_level, body: base.body }), meta, { forceLocal, reason: null });
    const output = postProcessDeliverable(res.output, { lawyers });
    const sug = store('company_request', r.id, 'deliverable_summary', { ...res, output }, actor);
    const remaining = app.companyDocGate.findLawyerNames([output.summary, output.body, ...output.recommendations].join('\n'), lawyers);
    return { suggestion_id: sug.id, provider: sug.provider, model: sug.model, opinion_id: base.opinion_id, ...output, lawyer_names: remaining };
  }

  /** جدولة الفرز: 300 مللي ثانية للمحلل المحلي و4 ثوانٍ لـ Claude، واحد قيد التنفيذ لكل طلب */
  function schedule(requestId, { reason = null, delayMs = null } = {}) {
    if (app.settings.get('b2b_enabled') === false) return false;
    const provider = active?.()?.provider;
    const delay = delayMs ?? (provider && typeof provider.companyTriage === 'function' ? 4000 : 300);
    if (timers.has(requestId)) clearTimeout(timers.get(requestId));
    const timer = setTimeout(async () => {
      timers.delete(requestId);
      if (inflight.has(requestId)) return;
      inflight.add(requestId);
      try {
        await triage(requestId, null, { reason });
      } catch (e) {
        app.log('company triage failed', e);
      } finally {
        inflight.delete(requestId);
      }
    }, delay);
    timer.unref?.();
    timers.set(requestId, timer);
    return true;
  }
  function cancelTimers() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  }

  /** طلبات جديدة بلا فرز (بعد إعادة التشغيل) — مهمة b2b.triage */
  function pendingWithoutTriage() {
    return db.all("SELECT id FROM company_requests WHERE status = 'submitted' AND ai_suggestion_id IS NULL ORDER BY id LIMIT 50").map((x) => x.id);
  }

  return { triage, schedule, cancelTimers, companyContext, companyIndex, pendingWithoutTriage, autoRunsLastDay, triageContext, deliverableSummary };
}
