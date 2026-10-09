// خدمة الذكاء الاصطناعي: تحليل الطلبات، اقتراح المسائل، المسودات (مع الاسترشاد بالمعرفة المعتمدة)، النسخة الموجهة للمستفيد،
// الردود المقترحة، تحليل المستندات، البحث عن الحالات المشابهة، وتسجيل التصحيحات (التغذية الراجعة) لقياس الأداء وتحسينه.
// الإعدادات تُقرأ حيًّا من مخزن التكاملات (app.integrations) وتُعاد تهيئتها عند تغييرها دون إعادة تشغيل الخادم،
// وكل استدعاء يُسجَّل في ai_usage (الرموز والتكلفة التقديرية) مع سقف إنفاق شهري يعيد النظام إلى المحلل المحلي عند تجاوزه.
import fs from 'node:fs';
import path from 'node:path';
import {
  nowIso, parseJson, notFound, badRequest, truncate, arabicCount, arabicPercent, AR_UNITS,
  periodOf, isValidPeriod, arabicPeriod, arabicDate, arabicTime, cairoDayKey, v, latinDigits,
} from '../util.js';
import { LABELS, LEGAL_AREAS } from '../constants.js';
import { STORY_TRACKS } from '../constants.js'; // v9.2 (admin-ai)
import { topicByKey } from '../../public/assets/js/public/topics.js'; // v9.2: الموضوع الذي اختارته
import * as H from './heuristic.js';
import {
  createAnthropicProvider, AiUnavailable, estimateCostMicroUsd, priceFor, documentBlockFor,
  DEFAULT_MODEL, REPLY_TONES, DOC_TYPES, FACT_KINDS, FLAG_KINDS, MODEL_PRICES,
} from './anthropic.js';
import { buildIndex, similarityRatio, tokens } from './text.js';
import { factsText } from '../channels/engine.js'; // v9.1 fixes: رسالة تأكيد الرقم ليست من وقائع الطلب
import { normalizePhone } from '../util.js'; // v9.2 (admin-ai)
import { ApiError } from '../util.js'; // v10 b2b-server
import { createCompanyAi } from './company.js'; // v10 b2b-server (SRV-7): فرز طلبات الشركات

// مسميات أحداث الأمان الخاصة بالذكاء الاصطناعي تُضاف لمسميات سجل الأمان (مثل وحدة الرسائل)
if (LABELS.security_event && LABELS.ai_security_event) {
  for (const [k, val] of Object.entries(LABELS.ai_security_event)) if (!LABELS.security_event[k]) LABELS.security_event[k] = val;
}

const HEURISTIC_MODEL = 'local-rules-v1';
const MODES = ['auto', 'anthropic', 'heuristic'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const REPLY_INTENTS = ['answer', 'ask_documents', 'reassure', 'schedule'];
const AREA_LABEL = Object.fromEntries(LEGAL_AREAS.map((a) => [a.code, a.label]));

/** رمز مرجعي ثابت لسجل المعرفة (يُذكر في «استُرشد بـ») */
export const krCode = (id) => `KR-${String(id).padStart(5, '0')}`;

const usd = (n) => `${(Math.round(Number(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} دولار`;

/** قص نص مع الحفاظ على الأسطر (بخلاف truncate التي تدمج المسافات) */
function clip(text, n) {
  const s = String(text ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

// المستندات المصرية (البطاقة، شهادات الميلاد والوفاة، الأحكام) تكتب الأرقام غالبًا بالأرقام العربية (٠١٢…)،
// وقد ينقلها النموذج كما هي؛ لذا تُوحَّد الأرقام إلى اللاتينية قبل البحث عن الهواتف والأرقام القومية
// (وهو أيضًا أسلوب عرض الأرقام في المنظومة كلها).
const PHONE_LIKE = /(?:\+|00)?\d[\d\s\- ]{8,16}\d/g;
const NATIONAL_ID = /(?<!\d)[23]\d{13}(?!\d)/g;

/** حذف أرقام الهواتف المصرية من نص (تبقى بقية الأرقام كما هي) — لنتائج تحليل المستندات المحفوظة */
export function stripPhones(text) {
  if (typeof text !== 'string') return text;
  return latinDigits(text).replace(PHONE_LIKE, (m) => {
    const d = m.replace(/\D/g, '');
    return /^(?:01[0125]\d{8}|(?:20|0020)1[0125]\d{8}|0[2-9]\d{7,8})$/.test(d) ? '[رقم هاتف]' : m;
  });
}

/** إخفاء أرقام الهواتف والأرقام القومية والبريد من نصوص موجهة للمحامين */
export function maskSensitive(value) {
  if (typeof value === 'string') {
    return latinDigits(value)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[بريد مخفي]')
      .replace(NATIONAL_ID, '[رقم قومي مخفي]')
      .replace(PHONE_LIKE, (m) => {
        const d = m.replace(/\D/g, '');
        return d.length >= 10 && d.length <= 15 && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(m.trim()) ? '[رقم مخفي]' : m;
      });
  }
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, maskSensitive(x)]));
  return value;
}

// أسباب العودة للمحلل المحلي التي يجوز أن يراها المحامي كما هي (تخص الملف نفسه)؛
// أما غيرها (سقف الإنفاق ومبلغه، المفتاح، أخطاء الخدمة) فشأن داخلي للإدارة ويظهر للمحامي بصيغة عامة.
const LAWYER_SAFE_REASON = /^(?:نوع الملف غير مدعوم|حجم الملف أكبر من الحد|تعذرت قراءة الملف)/;
const LAWYER_GENERIC_REASON = 'المساعد الذكي غير متاح حاليًا، فاستُخدم المحلل المحلي.';
function lawyerReason(reason) {
  if (!reason) return null;
  return LAWYER_SAFE_REASON.test(String(reason)) ? String(reason) : LAWYER_GENERIC_REASON;
}

// ───────────── v9.2 (admin-ai): تنظيف مسودات «ماذا يصير الطلب» (A92-13) ─────────────
// أكواد الملفات الداخلية لا تصل للمستفيدة (رقم الطلب REQ هو الرقم الوحيد الذي تعرفه)
const INTERNAL_CODE = /\b(?:CL|INH|FAM|GRD|PEN|PRP|CIV|LAB|CRM|COM|TAX|ADM|GEN|MTR|KR)-\d{3,}(?:-\d{3,})?\b/g;
// [R2-A21] لا روابط في أي مسودة (رابط صفحتها يُضاف عند الإرسال فقط من {portal_link})
const URL_LIKE = /(?:https?:\/\/\S+|www\.\S+|wa\.me\/\S*)/gi;
export const STORY_CAP_REASON = 'بلغ الطلب حد التحليل التلقائي بـ Claude خلال 24 ساعة؛ اضغط «حلّل الآن» لاستخدام Claude';

function tidy(s) {
  return String(s ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function noUrls(s) {
  return typeof s === 'string' ? tidy(s.replace(URL_LIKE, '')) : s;
}
/**
 * [بوابة 9.2 S7] نص للمحامي (وقائع/سؤال المحامي): فوق إخفاء الهواتف والأرقام القومية والروابط، لا كود تأكيد الرقم
 * ولا رقم الطلب ولا رقم البيت واسم الشارع («12 شارع النصر» ← «[عنوان مخفي]»؛ الحي/المدينة تبقى للاختصاص).
 */
const CONFIRM_CODE_LIKE = /(?:و\s*)?كود\s*(?:ال)?تأكيد\s*[:：]?\s*\d{6}(?!\d)/g;
const REQ_CODE_LIKE = /\bREQ-\d{4}-\d{3,}\b/gi;
const STREET_LIKE = /\d{1,5}\s*(?:شارع|ش\.)\s*[^\s،,.\n]+/g;
function forLawyer(s) {
  if (typeof s !== 'string') return s;
  const t = latinDigits(s).replace(CONFIRM_CODE_LIKE, ' ').replace(REQ_CODE_LIKE, '').replace(STREET_LIKE, '[عنوان مخفي]');
  return noUrls(maskSensitive(t.replace(/[ \t]+([.،,؛])/g, '$1')));
}
/** نص موجه لها: بلا أكواد داخلية ولا روابط ولا أي رقم هاتف غير رقم المؤسسة */
function forHer(s, orgPhone) {
  if (typeof s !== 'string') return s;
  const org = orgPhone ? normalizePhone(orgPhone) : null;
  const t = latinDigits(s)
    .replace(URL_LIKE, '')
    .replace(INTERNAL_CODE, '')
    .replace(PHONE_LIKE, (m) => {
      const p = normalizePhone(m);
      return p && org && p === org ? m : '';
    });
  return tidy(t);
}
const clipOrNull = (x, n) => (x === null || x === undefined || String(x).trim() === '' ? null : clip(x, n));

/**
 * توحيد مخرجات «ماذا يصير الطلب» من Claude أو المحلل المحلي: مسار صالح (وإلا مسار المحلل المحلي لنفس النص)،
 * قص الأطوال، إخفاء الهواتف والأرقام القومية فيما يخص المحامي، حذف الأكواد والروابط والأرقام الأجنبية مما يخصها،
 * وحقول كل مسار فقط. ctx: { fallback: () => مخرجات المحلل المحلي, orgPhone, storyRev, voice, preview, questionsFor }
 */
export function normalizeStory(raw, ctx = {}) {
  const o = { ...(raw || {}) };
  let local = null;
  const loc = () => (local || (local = ctx.fallback ? ctx.fallback() : null));
  if (o.blocked) {
    o.recommended_track = null;
  } else if (!STORY_TRACKS.includes(o.recommended_track)) {
    const l = loc();
    o.recommended_track = l?.recommended_track ?? null;
    o.track_reason = o.track_reason || l?.track_reason || null;
    o.track_confidence = Number.isFinite(Number(o.track_confidence)) && o.track_confidence !== null && o.track_confidence !== undefined ? o.track_confidence : l?.track_confidence ?? null;
    if (!o.request_draft || typeof o.request_draft !== 'object') o.request_draft = l?.request_draft || null;
    if (l?.blocked && !o.blocked) o.blocked = l.blocked;
    if (!o.reply_source && l?.reply_source) o.reply_source = l.reply_source;
  }
  if (!o.one_line) o.one_line = loc()?.one_line || o.title || '';
  o.one_line = clip(o.one_line, 160);
  o.track_reason = o.track_reason ? clip(o.track_reason, 300) : null;
  o.track_confidence = o.track_confidence === null || o.track_confidence === undefined ? null : Math.max(0, Math.min(1, Number(o.track_confidence) || 0));
  const d = { ...(o.request_draft && typeof o.request_draft === 'object' ? o.request_draft : {}) };
  const track = o.recommended_track;
  const draft = {
    title: clip(d.title || o.title || '', 200),
    facts_for_lawyer: forLawyer(clip(d.facts_for_lawyer || o.summary || '', 6000)),
    internal_note: clipOrNull(d.internal_note, 2000),
    brief_for_lawyer: ['consultation', 'matter'].includes(track) ? forLawyer(clipOrNull(d.brief_for_lawyer, 1000)) : null,
    matter: null,
    questions_for_her: [],
    reply_to_her: null,
    referral_target: null,
    resolution_note: null,
  };
  if (track === 'matter') {
    const m = d.matter && typeof d.matter === 'object' ? d.matter : {};
    draft.matter = {
      kind: m.kind === 'ongoing' ? 'ongoing' : 'litigation',
      court: noUrls(maskSensitive(clipOrNull(m.court, 150))),
      opponent: noUrls(maskSensitive(clipOrNull(m.opponent, 200))),
      next_hearing_text: noUrls(maskSensitive(clipOrNull(m.next_hearing_text, 200))),
    };
  }
  if (track === 'need_info') {
    let qs = (Array.isArray(d.questions_for_her) ? d.questions_for_her : []).map((q) => forHer(String(q ?? ''), ctx.orgPhone)).filter(Boolean).map((q) => clip(q, 160));
    if (!qs.length && ctx.questionsFor) qs = ctx.questionsFor(o.legal_area);
    draft.questions_for_her = qs.slice(0, 3);
  }
  if (track === 'internal' || track === 'refer') {
    draft.reply_to_her = d.reply_to_her ? clip(forHer(d.reply_to_her, ctx.orgPhone), 1000) || null : null;
    draft.resolution_note = clipOrNull(noUrls(d.resolution_note), 500);
    if (track === 'refer') draft.referral_target = clipOrNull(noUrls(d.referral_target), 200);
  }
  o.request_draft = draft;
  if (!['internal', 'refer'].includes(track)) delete o.reply_source;
  o.story_rev = ctx.storyRev ?? o.story_rev ?? 0;
  if (ctx.voice) o.voice = { total: ctx.voice.total || 0, done: ctx.voice.done || 0, missing: ctx.voice.missing || 0 };
  o.preview = !!ctx.preview;
  o.blocked = o.blocked || null;
  return o;
}

export function createAi(app) {
  const { db, config } = app;
  const timers = new Map();
  const indexCache = new Map();
  // v9.2 [R2-A15/A10]: تحليل تلقائي واحد لكل طلب في الوقت نفسه (وإعادة واحدة إن تغيرت القصة أثناءه)،
  // وحد عام لاستدعاءات Claude التلقائية المتزامنة
  const inflight = new Set();
  const rerun = new Set();
  // [بوابة 9.2 S4/R2] التحليل الجاري لكل طلب (تلقائي أو بطلب الإدارة): نقرة ثانية أو زميل آخر ينضم إليه بدل تحليل موازٍ
  const running = new Map();
  const CLAUDE_AUTO_CONCURRENCY = 2;
  let claudeRunning = 0;
  const claudeQueue = [];
  async function withClaudeSlot(fn) {
    if (claudeRunning >= CLAUDE_AUTO_CONCURRENCY) await new Promise((resolve) => claudeQueue.push(resolve));
    claudeRunning += 1;
    try {
      return await fn();
    } finally {
      claudeRunning -= 1;
      const next = claudeQueue.shift();
      if (next) next();
    }
  }

  // ───────────── الإعدادات الحية ─────────────
  function readConfig() {
    let eff = {};
    let st = null;
    try {
      eff = app.integrations ? app.integrations.get('anthropic') : {};
      st = app.integrations ? app.integrations.status('anthropic') : null;
    } catch (e) {
      app.log('ai: reading integration settings failed', e);
    }
    // القيمة المضبوطة صراحة (بيئة أو لوحة الإدارة) تتقدم؛ وإلا إعدادات التشغيل (config.ai) ثم الافتراضي
    const pick = (k, fromConfig, def) => {
      const src = st?.fields?.[k]?.source;
      const explicit = src === 'env' || src === 'db' ? eff[k] : '';
      return String(explicit || fromConfig || eff[k] || def);
    };
    const mode = pick('provider', config.ai?.provider, 'auto').toLowerCase();
    const effort = pick('effort', config.ai?.effort, 'medium');
    const budget = Number(String(eff.monthly_budget_usd ?? '').replace(',', '.'));
    return {
      mode: MODES.includes(mode) ? mode : 'auto',
      apiKey: String(eff.api_key || config.ai?.anthropicApiKey || ''),
      model: pick('model', config.ai?.model, DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      effort: EFFORTS.includes(effort) ? effort : 'medium',
      budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : 0,
    };
  }

  let cfg = readConfig();
  let anthropic = null;
  function build() {
    anthropic =
      cfg.mode !== 'heuristic' && cfg.apiKey
        ? createAnthropicProvider({
            apiKey: cfg.apiKey,
            model: cfg.model,
            effort: cfg.effort,
            log: app.log,
            orgName: () => app.brand.displayName(), // v10 experience (H-E3)
            onUsage: (rec) => recordUsage(rec),
          })
        : null;
  }
  build();

  // ───────────── سجل الاستهلاك وسقف الإنفاق ─────────────
  function recordUsage(rec) {
    const u = rec.usage || {};
    const cost = rec.provider === 'anthropic' ? estimateCostMicroUsd(rec.model, u) : 0;
    const t = nowIso();
    try {
      db.insert('ai_usage', {
        feature: rec.feature || 'other',
        entity_type: rec.entity_type ?? null,
        entity_id: rec.entity_id ?? null,
        provider: rec.provider,
        model: rec.model || null,
        input_tokens: Number(u.input_tokens) || 0,
        output_tokens: Number(u.output_tokens) || 0,
        cache_read_tokens: Number(u.cache_read_input_tokens) || 0,
        cache_write_tokens: Number(u.cache_creation_input_tokens) || 0,
        cost_micro_usd: cost,
        latency_ms: rec.latency_ms ?? null,
        ok: rec.ok === false ? 0 : 1,
        error: rec.error ? truncate(rec.error, 500) : null,
        fallback: rec.fallback ? 1 : 0,
        fallback_reason: rec.fallback_reason ? truncate(rec.fallback_reason, 300) : null,
        period: periodOf(t),
        user_id: rec.user_id ?? null,
        created_at: t,
      });
    } catch (e) {
      app.log('ai usage insert failed', e);
    }
    if (cost > 0) checkBudget();
  }

  function spentMicro(period) {
    return Number(db.value("SELECT COALESCE(SUM(cost_micro_usd), 0) FROM ai_usage WHERE period = ? AND provider = 'anthropic'", period)) || 0;
  }
  function budgetState() {
    const period = periodOf(nowIso());
    // المقارنة بأعداد صحيحة (أجزاء المليون من الدولار) لتفادي أخطاء الكسور العشرية
    const spentM = spentMicro(period);
    const limit = cfg.budgetUsd;
    const limitM = Math.round(limit * 1e6);
    return {
      period,
      limit_usd: limit || null,
      spent_usd: spentM / 1e6,
      ratio: limit ? Math.round((spentM / limitM) * 1000) / 1000 : null,
      warning: !!limit && spentM * 10 >= limitM * 8,
      exceeded: !!limit && spentM >= limitM,
      notified: !!db.get("SELECT 1 FROM ai_budget_alerts WHERE period = ? AND kind = 'exceeded'", period),
    };
  }
  function alertOnce(b, kind) {
    const r = db.run(
      'INSERT OR IGNORE INTO ai_budget_alerts (period, kind, budget_usd, spent_usd, notified_at) VALUES (?, ?, ?, ?, ?)',
      b.period,
      kind,
      b.limit_usd,
      b.spent_usd,
      nowIso(),
    );
    if (!r.changes) return false;
    const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((x) => x.id);
    const month = arabicPeriod(b.period);
    if (kind === 'exceeded') {
      app.notifications.notify(admins, {
        type: 'ai.budget_exceeded',
        title: `تجاوز إنفاق الذكاء الاصطناعي السقف الشهري (${month})`,
        body: `بلغ الإنفاق التقديري ${usd(b.spent_usd)} من سقف ${usd(b.limit_usd)}. يعمل النظام الآن بالمحلل المحلي حتى بداية الشهر القادم أو رفع السقف من صفحة التكاملات.`,
        link: '#/knowledge?tab=ai',
      });
      app.audit?.log({ type: 'ai.budget_exceeded', severity: 'warning', summary: `تجاوز إنفاق الذكاء الاصطناعي السقف الشهري: ${usd(b.spent_usd)} من ${usd(b.limit_usd)}`, data: b });
    } else {
      app.notifications.notify(admins, {
        type: 'ai.budget_warning',
        title: `اقترب إنفاق الذكاء الاصطناعي من السقف الشهري (${month})`,
        body: `بلغ الإنفاق التقديري ${usd(b.spent_usd)} (${arabicPercent(b.ratio)} من السقف ${usd(b.limit_usd)}). عند بلوغ السقف يعود النظام تلقائيًا إلى المحلل المحلي.`,
        link: '#/knowledge?tab=ai',
      });
    }
    return true;
  }
  function checkBudget() {
    const b = budgetState();
    if (!b.limit_usd) return b;
    if (b.exceeded) alertOnce(b, 'exceeded');
    else if (b.warning) alertOnce(b, 'warning');
    return budgetState();
  }

  /** المزود الفعلي لهذا الطلب: Claude ما لم يُتجاوز السقف أو لم يُضبط */
  function active() {
    if (!anthropic) {
      if (cfg.mode === 'anthropic' && !cfg.apiKey) return { provider: null, reason: 'لم يُضبط مفتاح Anthropic API' };
      return { provider: null, reason: null };
    }
    const b = budgetState();
    if (b.exceeded) {
      if (!b.notified) checkBudget();
      return { provider: null, reason: `تجاوز الإنفاق الشهري السقف المحدد (${usd(b.limit_usd)})`, budget: true };
    }
    return { provider: anthropic };
  }

  async function run(method, args, fallback, meta = {}, { forceLocal = false, reason = null } = {}) {
    // v9.2: forceLocal = المحلل المحلي حتى مع Claude (قصة بلا كلام كافٍ، أو بلوغ الحد اليومي للطلب)
    if (forceLocal) {
      recordUsage({ ...meta, provider: 'heuristic', model: HEURISTIC_MODEL, ok: true, fallback: !!reason, fallback_reason: reason });
      return { output: fallback(), provider: 'heuristic', model: HEURISTIC_MODEL, ...(reason ? { fallback_reason: reason } : {}) };
    }
    const a = active();
    if (a.provider) {
      try {
        const out = await a.provider[method](args, meta);
        const model = out._model;
        delete out._model;
        return { output: out, provider: 'anthropic', model };
      } catch (e) {
        if (!(e instanceof AiUnavailable)) app.log('ai provider error', e);
        recordUsage({ ...meta, provider: 'heuristic', model: HEURISTIC_MODEL, ok: true, fallback: true, fallback_reason: e.message });
        return { output: fallback(), provider: 'heuristic', model: HEURISTIC_MODEL, fallback_reason: e.message };
      }
    }
    recordUsage({ ...meta, provider: 'heuristic', model: HEURISTIC_MODEL, ok: true, fallback: !!a.reason, fallback_reason: a.reason });
    return { output: fallback(), provider: 'heuristic', model: HEURISTIC_MODEL, ...(a.reason ? { fallback_reason: a.reason } : {}) };
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
           (SELECT substr(group_concat(m.body, ' '), 1, 3000) FROM messages m WHERE m.intake_id = c.intake_id AND m.direction = 'in' AND json_extract(m.meta, '$.identity_confirm') IS NULL) AS client_text
         FROM cases c LEFT JOIN intakes i ON i.id = c.intake_id
         WHERE c.company_id IS NULL`, // v10 b2b-server (حارس #20): ملفات الشركات خارج «الحالات المشابهة» للأفراد
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
      .all("SELECT id, title, legal_area, facts, issues, final_answer FROM knowledge_records WHERE status = 'approved' AND usage != 'none' AND (scope IS NULL OR scope = 'global')") // v10 (#21)
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

  // ───────────── سياق الاسترشاد (RAG) ─────────────
  /** أعلى الحالات المعتمدة المجهّلة تشابهًا (المعتمدة والمراجَع إخفاؤها فقط) مع مقتطف من الإجابة المعتمدة */
  function precedents(text, { area = null, limit = 3 } = {}) {
    const hits = svc.similar(text, { scope: 'lawyer', limit, area }).items;
    if (!hits.length) return [];
    const rows = db.all(
      `SELECT id, title, legal_area, issues, documents_requested, final_answer FROM knowledge_records
       WHERE status = 'approved' AND usage != 'none' AND (scope IS NULL OR scope = 'global') AND id IN (${hits.map(() => '?').join(',')})`,
      ...hits.map((x) => x.id),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return hits
      .filter((h) => byId.has(h.id))
      .map((h) => {
        const r = byId.get(h.id);
        return {
          ref: krCode(r.id),
          title: r.title,
          legal_area: r.legal_area,
          similarity: h.score,
          issues: parseJson(r.issues, []).slice(0, 6),
          documents_requested: parseJson(r.documents_requested, []).slice(0, 6),
          approved_answer_excerpt: truncate(r.final_answer || '', 1500),
        };
      });
  }

  /** ملخصات تحليلات المستندات (آخر تحليل لكل مستند) لإدراجها في سياق المسودة */
  function analysesFor(documentIds, { forLawyer = false } = {}) {
    const ids = [...new Set(documentIds.filter(Boolean))];
    if (!ids.length) return [];
    const rows = db.all(
      `SELECT x.*, d.title AS doc_title, d.filename FROM document_ai x JOIN documents d ON d.id = x.document_id
       WHERE x.id IN (SELECT MAX(id) FROM document_ai WHERE document_id IN (${ids.map(() => '?').join(',')}) GROUP BY document_id)
       ORDER BY x.document_id`,
      ...ids,
    );
    return rows.map((row) => {
      const r = parseJson(row.result, {});
      const item = {
        document: row.doc_title || row.filename,
        type: LABELS.ai_doc_type?.[row.doc_type] || row.doc_type,
        automated_preliminary: row.provider !== 'anthropic',
        summary: r.summary || '',
        proves: r.proves || [],
        red_flags: (r.red_flags || []).map((f) => f.text),
        missing_related: r.missing_related || [],
      };
      return forLawyer ? maskSensitive(item) : item;
    });
  }

  // ───────────── الردود المقترحة ─────────────
  const INTAKE_PHRASE = {
    new: 'قيد الفرز والدراسة',
    in_review: 'قيد الفرز والدراسة',
    awaiting_client: 'بانتظار ردكم لاستكمال الدراسة',
    handled_internally: 'تمت الإفادة بشأنه',
    converted: 'قيد الدراسة لدى الفريق القانوني',
    archived: 'مغلق',
  };
  const CASE_PHRASE = {
    new: 'قيد الدراسة',
    assigned: 'قيد الدراسة',
    in_progress: 'قيد الدراسة',
    under_review: 'في مرحلة المراجعة النهائية',
    approved: 'انتهت دراسته، وسنوافيكم بالإفادة قريبًا',
    answered: 'تمت الإفادة فيه',
    closed: 'مغلق',
  };
  const MATTER_PHRASE = { open: 'قيد المتابعة', on_hold: 'متوقف مؤقتًا', closed: 'مغلق' };

  function conversation(where, ...params) {
    // الرسائل الصادرة التي فشل إرسالها لم تصل للمستفيد، فلا تدخل في سياق الرد
    return db
      .all(
        `SELECT * FROM (SELECT id, direction, body, automated, created_at, meta FROM messages
         WHERE (${where}) AND NOT (direction = 'out' AND status = 'failed') ORDER BY id DESC LIMIT 20) ORDER BY id`,
        ...params,
      )
      // (v9.1 fixes: رسالة تأكيد الرقم بلا رقم الطلب والكود)
      .map((m) => (m.direction === 'in' ? { ...m, body: factsText(m.body, m.meta) } : m))
      .filter((m) => String(m.body || '').trim())
      .map((m) => ({
        from: m.direction === 'in' ? 'المستفيد' : m.automated ? 'رسالة آلية من المؤسسة' : 'فريق المؤسسة',
        at: arabicDate(m.created_at, { weekday: false }),
        text: truncate(m.body, 600),
      }));
  }

  function replyContext(kind, id) {
    const org = app.brand.displayName(); // v10 experience (H-E3)
    const base = { org_name: org, org_address: app.settings.get('org_address') || null };
    let ctx;
    let lawyerIds = [];
    if (kind === 'intake') {
      const i = db.get('SELECT * FROM intakes WHERE id = ?', id);
      if (!i) throw notFound('الطلب غير موجود');
      const an = svc.latest('intake', i.id, 'intake_analysis')?.output || null;
      ctx = {
        ...base,
        kind,
        code: i.code,
        status_phrase: INTAKE_PHRASE[i.status] || 'قيد المتابعة',
        closed: i.status === 'archived',
        legal_area: AREA_LABEL[i.legal_area || an?.legal_area] || null,
        summary: an?.summary || i.summary || null,
        missing: (an?.missing_info || []).map((m) => (typeof m === 'string' ? { item: m, kind: 'information' } : m)).slice(0, 8),
        pending_requests: [],
        approved_answer: null,
        next_event: null,
        conversation: conversation('intake_id = ?', i.id),
      };
      if (i.case_id) lawyerIds = db.all('SELECT lawyer_id FROM assignments WHERE case_id = ?', i.case_id).map((r) => r.lawyer_id);
    } else if (kind === 'case') {
      const c = db.get('SELECT * FROM cases WHERE id = ?', id);
      if (!c) throw notFound('الملف غير موجود');
      const an = c.intake_id ? svc.latest('intake', c.intake_id, 'intake_analysis')?.output : null;
      const sent = db.get("SELECT body, sent_at FROM client_answers WHERE case_id = ? AND status = 'sent' ORDER BY id DESC LIMIT 1", c.id);
      const draft = sent
        ? null
        : db.get(
            `SELECT ca.body FROM client_answers ca JOIN opinions o ON o.id = ca.opinion_id
             WHERE ca.case_id = ? AND ca.status = 'draft' AND o.status = 'approved' ORDER BY ca.id DESC LIMIT 1`,
            c.id,
          );
      // قائمة النواقص بحسب مجال الملف المعتمد من الإدارة (قد يختلف عن تصنيف الفرز الآلي)
      let missing = (an?.missing_info || []).map((m) => (typeof m === 'string' ? { item: m, kind: 'information' } : m));
      if (!an || an.legal_area !== c.legal_area) {
        const inbound = db.all("SELECT body, meta FROM messages WHERE (case_id = ? OR (? IS NOT NULL AND intake_id = ?)) AND direction = 'in' ORDER BY id", c.id, c.intake_id, c.intake_id).map((m) => factsText(m.body, m.meta));
        const gov = db.value('SELECT governorate FROM clients WHERE id = ?', c.client_id);
        missing = H.missingInfoFor(c.legal_area, [c.title, c.facts_shared, ...inbound].filter(Boolean).join('\n'), { governorate: gov || 'معروفة' });
      }
      ctx = {
        ...base,
        kind,
        code: c.code,
        status_phrase: CASE_PHRASE[c.status] || 'قيد المتابعة',
        closed: c.status === 'closed',
        legal_area: AREA_LABEL[c.legal_area] || null,
        summary: c.facts_shared || an?.summary || null,
        missing: missing.slice(0, 8),
        // ما وافقت الإدارة على إرساله للمستفيد بصياغتها هي فقط
        pending_requests: db
          .all("SELECT kind, client_message FROM info_requests WHERE case_id = ? AND status = 'sent_to_client' AND client_message IS NOT NULL ORDER BY id", c.id)
          .map((r) => ({ kind: r.kind, question: truncate(r.client_message, 400) })),
        approved_answer: sent
          ? { text: clip(sent.body, 3000), sent: true, sent_on: sent.sent_at ? arabicDate(sent.sent_at, { weekday: false }) : null }
          : draft
            ? { text: clip(draft.body, 3000), sent: false }
            : null,
        next_event: null,
        conversation: conversation('case_id = ? OR (? IS NOT NULL AND intake_id = ?)', c.id, c.intake_id, c.intake_id),
        _intakeId: c.intake_id,
      };
      lawyerIds = db.all('SELECT lawyer_id FROM assignments WHERE case_id = ?', c.id).map((r) => r.lawyer_id);
    } else {
      const m = db.get('SELECT * FROM matters WHERE id = ?', id);
      if (!m) throw notFound('الملف غير موجود');
      const e = db.get(
        "SELECT * FROM matter_events WHERE matter_id = ? AND status = 'scheduled' AND starts_at >= ? AND client_text_approved = 1 ORDER BY starts_at LIMIT 1",
        m.id,
        nowIso(),
      );
      ctx = {
        ...base,
        kind,
        code: m.code,
        status_phrase: MATTER_PHRASE[m.status] || 'قيد المتابعة',
        closed: m.status === 'closed',
        legal_area: null,
        summary: m.title,
        missing: [],
        pending_requests: [],
        approved_answer: null,
        next_event: e
          ? {
              // «موعد آخر» لا تصلح داخل جملة التذكير؛ يكفي «موعد»
              kind_label: e.kind === 'other' ? 'موعد' : LABELS.event_kind[e.kind] || 'موعد',
              title: e.title,
              date: arabicDate(e.starts_at),
              time: arabicTime(e.starts_at),
              location: e.location || null,
              attendance: !!e.client_attendance_required,
            }
          : null,
        conversation: conversation('matter_id = ?', m.id),
      };
      lawyerIds = [m.responsible_lawyer_id, ...db.all('SELECT lawyer_id FROM assignments WHERE case_id = ?', m.case_id).map((r) => r.lawyer_id)];
    }
    // لا نطلب مستندًا موجودًا بالفعل في الملف (حسب اسمه أو نوعه في آخر تحليل له)
    if (ctx.missing.length && kind !== 'matter') {
      const where = kind === 'case' ? 'd.case_id = ? OR (? IS NOT NULL AND d.intake_id = ?)' : 'd.intake_id = ?';
      const params = kind === 'case' ? [id, ctx._intakeId ?? null, ctx._intakeId ?? null] : [id];
      const have = new Set(
        db
          .all(`SELECT d.title, d.filename, (SELECT doc_type FROM document_ai x WHERE x.document_id = d.id ORDER BY x.id DESC LIMIT 1) AS ai_type FROM documents d WHERE ${where}`, ...params)
          .map((d) => (d.ai_type && d.ai_type !== 'other' ? d.ai_type : H.docTypeOf(`${d.title} ${d.filename}`)))
          .filter(Boolean),
      );
      if (have.size) ctx.missing = ctx.missing.filter((m) => m.kind !== 'document' || !have.has(H.docTypeOf(m.item)));
    }
    // ولا نكرر ما سبق طلبه من المستفيد (أُرسل أو أُجيب عنه)، ولا نسأل عن المحافظة إن كانت معروفة
    if (ctx.missing.length && kind === 'case') {
      const asked = db.all("SELECT question, client_message FROM info_requests WHERE case_id = ? AND status NOT IN ('rejected','cancelled')", id).map((r) => `${r.question} ${r.client_message || ''}`);
      const askedTypes = new Set(asked.map((q) => H.docTypeOf(q)).filter(Boolean));
      ctx.missing = ctx.missing.filter((m) => !(m.kind === 'document' && askedTypes.has(H.docTypeOf(m.item))) && !asked.some((q) => similarityRatio(m.item, q) >= 0.3));
      const gov = db.value('SELECT cl.governorate FROM cases c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?', id);
      if (gov) ctx.missing = ctx.missing.filter((m) => !/المحافظة|محل الإقامة/.test(m.item));
    }
    delete ctx._intakeId;
    // أسماء المحامين لا تظهر أبدًا في رسالة موجهة للمستفيد (حماية إضافية بعد التوليد)
    const names = lawyerIds.length
      ? db.all(`SELECT name FROM users WHERE id IN (${lawyerIds.filter(Boolean).map(() => '?').join(',') || 'NULL'})`, ...lawyerIds.filter(Boolean)).map((r) => r.name)
      : [];
    return { ctx, lawyerNames: names };
  }

  function scrubNames(text, names) {
    let s = String(text);
    for (const full of names) {
      const parts = String(full || '').trim().split(/\s+/);
      if (parts.length < 2) continue;
      for (const variant of [parts.join(' '), parts.slice(0, 2).join(' ')]) {
        if (variant.length >= 5 && s.includes(variant)) s = s.split(variant).join('الفريق القانوني');
      }
    }
    return s;
  }

  // ───────────── تحليل المستندات ─────────────
  function readDocument(doc) {
    const root = path.resolve(config.uploadsDir);
    const abs = path.resolve(root, doc.storage_key);
    if (!abs.startsWith(root + path.sep)) return null;
    return fs.readFileSync(abs);
  }

  function normalizeDocResult(o) {
    // أرقام الهواتف لا تُحفظ في أي حقل من نتيجة التحليل حتى لو ظهرت في المستند (بالأرقام العربية أو اللاتينية)
    const str = (x, n = 600) => stripPhones(truncate(String(x ?? ''), n));
    const arr = (x, n = 8) => (Array.isArray(x) ? x : []).slice(0, n);
    const out = {
      doc_type: DOC_TYPES.includes(o.doc_type) ? o.doc_type : 'other',
      confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)),
      summary: str(o.summary, 900),
      key_facts: arr(o.key_facts, 20)
        .filter((f) => f && String(f.value || '').trim())
        .map((f) => ({ kind: FACT_KINDS.includes(f.kind) ? f.kind : 'other', label: str(f.label, 120), value: str(f.value, 300) })),
      proves: arr(o.proves).map((x) => str(x, 400)).filter(Boolean),
      red_flags: arr(o.red_flags).filter((f) => f && f.text).map((f) => ({ kind: FLAG_KINDS.includes(f.kind) ? f.kind : 'other', text: str(f.text, 400) })),
      missing_related: arr(o.missing_related).map((x) => str(x, 300)).filter(Boolean),
      note: o.note ? str(o.note, 400) : null,
    };
    if (o.legible === false && !out.red_flags.some((f) => f.kind === 'illegible')) {
      out.red_flags.unshift({ kind: 'illegible', text: 'تعذرت قراءة أجزاء كبيرة من المستند؛ يُستحسن طلب نسخة أوضح.' });
    }
    return out;
  }

  function mapDocAi(row, { forLawyer = false } = {}) {
    if (!row) return null;
    const r = parseJson(row.result, {});
    const doc = db.get('SELECT sha256 FROM documents WHERE id = ?', row.document_id);
    const result = {
      summary: r.summary || '',
      confidence: r.confidence ?? null,
      key_facts: r.key_facts || [],
      proves: r.proves || [],
      red_flags: r.red_flags || [],
      missing_related: r.missing_related || [],
      note: r.note || null,
      fallback_reason: forLawyer ? lawyerReason(r._fallback_reason) : r._fallback_reason || null,
    };
    const out = {
      id: row.id,
      document_id: row.document_id,
      provider: row.provider,
      model: row.model,
      heuristic: row.provider !== 'anthropic',
      doc_type: row.doc_type,
      doc_type_label: LABELS.ai_doc_type?.[row.doc_type] || row.doc_type,
      stale: !!(doc && row.sha256 && doc.sha256 !== row.sha256),
      created_at: row.created_at,
      result: forLawyer ? maskSensitive(result) : result,
    };
    if (!forLawyer) {
      out.case_id = row.case_id;
      out.created_by_name = row.created_by ? db.value('SELECT name FROM users WHERE id = ?', row.created_by) || null : null;
      out.created_by_role = row.created_by_role || null;
    }
    return out;
  }

  // ───────────── v9.2 (admin-ai): نص القصة وسياق المسار ─────────────
  /** نص القصة كما يدخل التحليل (app.stories.storyText)، أو نص الإصدار 9.1 إن لم تتوفر الخدمة */
  function storyOf(intake) {
    if (app.stories?.storyText) return app.stories.storyText(intake.id);
    const msgs = db.all("SELECT body, meta FROM messages WHERE intake_id = ? AND direction = 'in' ORDER BY id", intake.id);
    const docs = db.all('SELECT filename FROM documents WHERE intake_id = ?', intake.id);
    let text = msgs.map((m) => factsText(m.body, m.meta)).filter((x) => x.trim()).join('\n');
    if (docs.length) text += `\n[مرفقات مرسلة: ${docs.map((d) => d.filename).join('، ')}]`;
    return { clientText: text, contextText: text, voice: { total: 0, done: 0, missing: 0 }, meaningfulLetters: H.meaningfulLetters(text), blocked: null, hasMedia: docs.length > 0 };
  }
  /** سياق المسار للمحلل المحلي: المحافظة والموضوع والرسائل الصوتية ودليل التوجيه والردود الجاهزة */
  function trackCtx(intake, st) {
    let quickReplies = [];
    try {
      quickReplies = db.all('SELECT id, title, body, usage_count FROM quick_replies ORDER BY usage_count DESC, id LIMIT 200');
    } catch {
      quickReplies = [];
    }
    const referrals = app.settings.get('story_referrals');
    return {
      governorate: intake.governorate,
      topic: intake.topic || null,
      topicArea: topicByKey(intake.topic)?.area || null,
      voice: st.voice,
      referrals: Array.isArray(referrals) ? referrals : [],
      quickReplies,
      meaningfulLetters: st.meaningfulLetters,
      blocked: st.blocked || null,
    };
  }
  /** [R2-A1] كل نتيجة محفوظة (عدا الملخص المبدئي) تقدّم analyzed_rev ولا ترجعه أبدًا (MAX) */
  function markAnalyzed(intakeId, rev, track) {
    db.run('UPDATE intakes SET analyzed_rev = MAX(analyzed_rev, ?), ai_track = ? WHERE id = ?', rev, track || null, intakeId);
  }
  /** اقتراح محجوب: يُستبدل آخر اقتراح محجوب في مكانه بدل إضافة صف جديد */
  function storeBlocked(intakeId, output, actor) {
    const last = db.get("SELECT id, output FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_analysis' ORDER BY id DESC LIMIT 1", intakeId);
    if (last && parseJson(last.output, {}).blocked) {
      db.update('ai_suggestions', last.id, { provider: 'heuristic', model: HEURISTIC_MODEL, output: JSON.stringify(output), created_by: actor?.id ?? null, created_at: nowIso() });
      return svc.suggestion(last.id);
    }
    return store('intake', intakeId, 'intake_analysis', { output, provider: 'heuristic', model: HEURISTIC_MODEL }, actor);
  }

  const svc = {
    reconfigure() {
      cfg = readConfig();
      build();
      // خفض السقف تحت الإنفاق الحالي يُطبَّق ويُبلَّغ عنه فورًا (مرة واحدة في الشهر)
      if (cfg.budgetUsd) checkBudget();
      return svc.status();
    },

    status() {
      const configured = !!anthropic;
      const b = budgetState();
      const blocked = configured && b.exceeded;
      const provider = configured && !blocked ? 'anthropic' : 'heuristic';
      let label;
      if (provider === 'anthropic') label = `Claude (${cfg.model})`;
      else if (blocked) label = 'المحلل المحلي — تجاوز الإنفاق السقف الشهري';
      else label = 'المحلل المحلي (قواعد عربية بدون إنترنت)';
      return {
        provider,
        model: provider === 'anthropic' ? cfg.model : HEURISTIC_MODEL,
        label,
        configured,
        configured_model: cfg.model,
        mode: cfg.mode,
        effort: cfg.effort,
        key_set: !!cfg.apiKey,
        budget: b,
        price: (({ input, output, cache_read, cache_write, known }) => ({ input, output, cache_read, cache_write, known }))(priceFor(cfg.model)),
      };
    },

    /** طلب صغير حقيقي للتحقق من المفتاح والنموذج: { ok, model, latency_ms } أو { ok:false, error } */
    async test(actor = null, ctx = null) {
      if (!anthropic) {
        const error = cfg.mode === 'heuristic' && cfg.apiKey ? 'المزوّد مضبوط على «المحلل المحلي فقط»؛ غيّره إلى «تلقائي» أو «Claude» أولًا' : 'لم يُضبط مفتاح Anthropic API بعد';
        return { ok: false, error, message: error, code: 'not_configured' };
      }
      const r = await anthropic.ping({ feature: 'connection_test', user_id: actor?.id ?? null });
      r.message = r.ok
        ? `نجح الاتصال بخدمة Claude (النموذج ${r.model}) خلال ${(r.latency_ms / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} ثانية`
        : r.error;
      // صفحة التكاملات (وحدة platform) تستدعي test() دون فاعل وتسجل الاختبار بنفسها؛ نسجل هنا عند الاستدعاء المباشر فقط
      if (actor) app.audit?.log({
        actor,
        ctx,
        type: 'ai.connection_test',
        severity: r.ok ? 'info' : 'warning',
        summary: r.ok ? `نجح اختبار الاتصال بخدمة Claude (${r.model}، ${r.latency_ms} مللي ثانية)` : `فشل اختبار الاتصال بخدمة Claude: ${r.error}`,
        data: { ok: r.ok, model: r.model || cfg.model, code: r.code || null },
      });
      return r;
    },

    checkBudget,

    /** لوحة الاستهلاك: تكلفة الشهر، الاستدعاءات حسب الوظيفة والنموذج، الأخطاء، والاتجاه الشهري */
    usage({ period } = {}) {
      const p = isValidPeriod(period) ? period : periodOf(nowIso());
      const agg = `COUNT(*) AS calls,
        SUM(provider = 'anthropic') AS claude_calls,
        SUM(provider = 'heuristic') AS heuristic_calls,
        SUM(ok = 0) AS errors,
        SUM(fallback = 1) AS fallbacks,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(cost_micro_usd), 0) AS cost_micro,
        AVG(CASE WHEN provider = 'anthropic' AND ok = 1 THEN latency_ms END) AS avg_latency_ms`;
      const norm = (r) => ({
        calls: Number(r.calls) || 0,
        claude_calls: Number(r.claude_calls) || 0,
        heuristic_calls: Number(r.heuristic_calls) || 0,
        errors: Number(r.errors) || 0,
        fallbacks: Number(r.fallbacks) || 0,
        input_tokens: Number(r.input_tokens) || 0,
        output_tokens: Number(r.output_tokens) || 0,
        cache_read_tokens: Number(r.cache_read_tokens) || 0,
        cache_write_tokens: Number(r.cache_write_tokens) || 0,
        cost_usd: (Number(r.cost_micro) || 0) / 1e6,
        avg_latency_ms: r.avg_latency_ms == null ? null : Math.round(Number(r.avg_latency_ms)),
      });
      const totals = norm(db.get(`SELECT ${agg} FROM ai_usage WHERE period = ?`, p));
      const byFeature = db
        .all(`SELECT feature, ${agg} FROM ai_usage WHERE period = ? GROUP BY feature ORDER BY cost_micro DESC, calls DESC`, p)
        .map((r) => ({ feature: r.feature, label: LABELS.ai_feature?.[r.feature] || r.feature, ...norm(r) }));
      const byModel = db
        .all(`SELECT model, ${agg} FROM ai_usage WHERE period = ? AND provider = 'anthropic' GROUP BY model ORDER BY cost_micro DESC`, p)
        .map((r) => ({ model: r.model, ...norm(r) }));
      const monthly = db
        .all(`SELECT period, ${agg} FROM ai_usage GROUP BY period ORDER BY period DESC LIMIT 6`)
        .map((r) => ({ period: r.period, label: arabicPeriod(r.period), ...norm(r) }));
      const dayMap = new Map();
      for (const r of db.all("SELECT created_at, cost_micro_usd FROM ai_usage WHERE period = ? AND provider = 'anthropic' ORDER BY id", p)) {
        const k = cairoDayKey(r.created_at);
        const cur = dayMap.get(k) || { day: k, calls: 0, cost_usd: 0 };
        cur.calls += 1;
        cur.cost_usd += Number(r.cost_micro_usd) / 1e6;
        dayMap.set(k, cur);
      }
      const daily = [...dayMap.values()];
      const recentErrors = db
        .all(
          `SELECT a.id, a.feature, a.model, a.error, a.latency_ms, a.created_at, u.name AS user_name FROM ai_usage a
           LEFT JOIN users u ON u.id = a.user_id WHERE a.ok = 0 ORDER BY a.id DESC LIMIT 10`,
        )
        .map((r) => ({ ...r, label: LABELS.ai_feature?.[r.feature] || r.feature }));
      return {
        period: p,
        period_label: arabicPeriod(p),
        status: svc.status(),
        budget: budgetState(),
        totals,
        by_feature: byFeature,
        by_model: byModel,
        monthly,
        daily,
        recent_errors: recentErrors,
        prices: MODEL_PRICES,
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

    precedents,

    /**
     * جدولة تحليل تلقائي لطلب (مؤجل قليلًا لتجميع الرسائل المتتابعة). مؤقت واحد لكل طلب: الأحدث يحل محل السابق.
     * opts.preview: ملخص مبدئي محلي فقط (v9.2: أثناء كتابة القصة مع Claude). عند انتهاء المؤقت يُتحقق أن الطلب ما زال مفتوحًا.
     */
    scheduleIntakeAnalysis(intakeId, delayMs = anthropic ? 4000 : 300, opts = {}) {
      clearTimeout(timers.get(intakeId));
      const t = setTimeout(() => {
        timers.delete(intakeId);
        let i = null;
        try {
          i = db.get('SELECT status FROM intakes WHERE id = ?', intakeId);
        } catch {
          return; // قاعدة البيانات أُغلقت
        }
        if (!i || !['new', 'in_review', 'awaiting_client'].includes(i.status)) return;
        const job = opts.preview ? Promise.resolve().then(() => svc.previewIntake(intakeId)) : svc.runAuto(intakeId, opts);
        job.catch((e) => app.log('ai analyze', e));
      }, delayMs);
      t.unref?.();
      timers.set(intakeId, t);
    },
    /** إلغاء المؤقتات: كلها، أو مؤقتات طلب واحد (ومعها مؤقت «السكوت» للقصة) */
    cancelTimers(intakeId = null) {
      if (intakeId === null || intakeId === undefined) {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
        svc.companyAi?.cancelTimers(); // v10 b2b-server
      } else {
        clearTimeout(timers.get(intakeId));
        timers.delete(intakeId);
      }
      app.stories?.clearQuietTimers?.(intakeId);
    },
    /** هل هناك تحليل تلقائي مجدول لهذا الطلب؟ (للاختبارات وصحة النظام) */
    hasTimer(intakeId) {
      return timers.has(intakeId);
    },

    /**
     * v9.2 [R2-A1/A10/A15]: تحليل تلقائي: محاولة محسوبة على رقم مراجعة القصة (حتى 3، بينها 10 دقائق عبر المهمة الدورية)،
     * وتحليل واحد لكل طلب في الوقت نفسه (طلب أثناء التشغيل = إعادة واحدة بعده إن تغيرت القصة).
     */
    async runAuto(intakeId, opts = {}) {
      if (inflight.has(intakeId)) {
        rerun.add(intakeId);
        return null;
      }
      inflight.add(intakeId);
      const job = (async () => {
        db.run('UPDATE intakes SET analysis_attempted_at = ?, analysis_attempts = analysis_attempts + 1 WHERE id = ?', nowIso(), intakeId);
        return svc.analyzeIntake(intakeId, null, { ...opts, auto: true, counted: true });
      })();
      running.set(intakeId, job);
      try {
        return await job;
      } finally {
        if (running.get(intakeId) === job) running.delete(intakeId);
        inflight.delete(intakeId);
        if (rerun.delete(intakeId)) {
          try {
            app.stories?.scheduleAnalysis?.(intakeId, 'rerun');
          } catch (e) {
            app.log('ai rerun', e);
          }
        }
      }
    },

    /**
     * [بوابة 9.2 S4/R2/S6] تحليل تطلبه الإدارة («حلّل الآن»، «لخّصها الآن»، بعد تسجيل مكالمة أو نقل رسائل):
     * تحليل واحد لكل طلب في الوقت نفسه — نقرة أثناء تحليل جارٍ (تلقائي أو من زميل) تنتظره وتعيد نتيجته بدل استدعاء Claude
     * مرة ثانية، ثم يُحلَّل فقط إن وصل جديد بعده. reuseRecentMs: لا تحليل جديد إن كان آخر تحليل كامل لنفس مراجعة القصة
     * أحدث من هذه المدة. لا ينتظر طابور التحليل التلقائي العام (opts.noSlot) حتى لا تتعلق نافذة الموظف خلف التحليلات المتراكمة.
     */
    async analyzeByStaff(intakeId, actor = null, { reuseRecentMs = 0, ...opts } = {}) {
      const upToDate = (maxAgeMs) => {
        const i = db.get('SELECT story_rev, analyzed_rev FROM intakes WHERE id = ?', intakeId);
        const last = svc.latest('intake', intakeId, 'intake_analysis');
        if (!i || !last || Number(i.analyzed_rev) < Number(i.story_rev)) return null;
        return maxAgeMs && Date.parse(nowIso()) - Date.parse(last.created_at) < maxAgeMs ? last : null;
      };
      for (let k = 0; k < 3 && running.has(intakeId); k += 1) {
        try {
          await running.get(intakeId);
        } catch {
          /* فشل التحليل الجاري: نحاول بأنفسنا */
        }
        const fresh = upToDate(5 * 60 * 1000);
        if (fresh) return fresh;
      }
      if (reuseRecentMs) {
        const recent = upToDate(reuseRecentMs);
        if (recent) return recent;
      }
      inflight.add(intakeId);
      const job = svc.analyzeIntake(intakeId, actor, { ...opts, noSlot: true });
      running.set(intakeId, job);
      try {
        return await job;
      } finally {
        if (running.get(intakeId) === job) running.delete(intakeId);
        inflight.delete(intakeId);
        if (rerun.delete(intakeId)) {
          try {
            app.stories?.scheduleAnalysis?.(intakeId, 'rerun');
          } catch (e) {
            app.log('ai rerun', e);
          }
        }
      }
    },
    /** هل يجري الآن تحليل لهذا الطلب؟ (للاختبارات) */
    isRunning(intakeId) {
      return running.has(intakeId);
    },

    /** عدد تحليلات Claude التلقائية (ومنها بعد تسجيل مكالمة) لهذا الطلب خلال 24 ساعة: هل بلغ الحد؟ */
    capReached(intakeId) {
      const max = Math.max(1, Number(app.settings.get('story_auto_ai_max_per_day')) || 6);
      const since = new Date(Date.parse(nowIso()) - 24 * 3600 * 1000).toISOString();
      const n = Number(
        db.value(
          "SELECT COUNT(*) FROM ai_usage WHERE feature = 'intake_analysis' AND provider = 'anthropic' AND entity_type = 'intake' AND entity_id = ? AND user_id IS NULL AND created_at >= ?",
          intakeId,
          since,
        ),
      );
      return n >= max;
    },

    /** آخر تحليل كامل للطلب، وإلا الملخص المبدئي (preview: true) — للقائمة والتفاصيل فقط */
    latestStory(intakeId) {
      const full = svc.latest('intake', intakeId, 'intake_analysis');
      if (full) return full;
      const pre = svc.latest('intake', intakeId, 'intake_preview');
      return pre ? { ...pre, output: { ...pre.output, preview: true } } : null;
    },

    /**
     * تحليل طلب وارد: تلخيص، تصنيف، وقائع، نواقص، مسائل مقترحة، حالات مشابهة — و(v9.2) ماذا يصير الطلب ومسوداته.
     * opts: { auto: تحليل تلقائي (يُحسب على الحد اليومي ولا يستدعي Claude لقصة بلا كلام كافٍ)، forceLocal، counted }
     * كل نتيجة محفوظة (كاملة أو محجوبة أو بديل محلي) تقدّم analyzed_rev إلى رقم مراجعة القصة وقت القراءة (MAX).
     */
    async analyzeIntake(intakeId, actor = null, opts = {}) {
      const intake = db.get('SELECT * FROM intakes WHERE id = ?', intakeId);
      if (!intake) throw notFound('الطلب غير موجود');
      const snapshotRev = Number(intake.story_rev) || 0;
      if (!opts.counted) db.run('UPDATE intakes SET analysis_attempted_at = ?, analysis_attempts = analysis_attempts + 1 WHERE id = ?', nowIso(), intakeId);
      const st = storyOf(intake);
      const ctx = trackCtx(intake, st);
      const local = () => H.analyzeIntake(st.clientText, ctx);
      const norm = (out, extra = {}) =>
        normalizeStory(out, { fallback: local, orgPhone: app.settings.get('org_phone'), storyRev: snapshotRev, voice: st.voice, questionsFor: H.questionsFor, ...extra });
      const meta = { feature: 'intake_analysis', entity_type: 'intake', entity_id: intakeId, user_id: actor?.id ?? null };
      if (st.blocked) {
        // [R2-A1d] قصة محجوبة (رسالة صوتية لم تُكتب، تنزيل فشل، طلب مكالمة بلا حكاية): اقتراح محلي واحد يُستبدل في مكانه،
        // بلا سجل استهلاك ولا نشاط «حلل الذكاء الاصطناعي» ولا Claude
        const output = norm(local());
        output.similar = svc.similar(st.clientText, { scope: 'staff', limit: 10, area: output.legal_area });
        const sug = storeBlocked(intakeId, output, actor);
        markAnalyzed(intakeId, snapshotRev, null);
        return sug;
      }
      let forceLocal = !!opts.forceLocal;
      let reason = null;
      const a = active();
      if (a.provider && opts.auto && !forceLocal) {
        // [R2-A3] لا Claude لقصة تحية فقط (أقل من 25 حرفًا بلا صوت أو صورة أو مستند)؛ [R2-A15] الحد اليومي لكل طلب
        if (st.meaningfulLetters < 25 && !st.hasMedia) forceLocal = true;
        else if (svc.capReached(intakeId)) {
          forceLocal = true;
          reason = STORY_CAP_REASON;
        }
      }
      const words = app.stories?.words ? app.stories.words(intake) : { form: 'f' };
      const args = {
        text: st.contextText,
        governorate: intake.governorate,
        channel: LABELS.channel[intake.first_channel] || intake.first_channel,
        topic: topicByKey(intake.topic)?.staff || null,
        form: words.form,
        voice: st.voice,
      };
      const exec = () => run('analyzeIntake', args, local, meta, { forceLocal, reason });
      const result = a.provider && opts.auto && !forceLocal && !opts.noSlot ? await withClaudeSlot(exec) : await exec();
      // [بوابة 9.2 R4] بُتّ في الطلب أثناء انتظار المزوّد (قرار، تحويل، إغلاق): لا اقتراح جديد ولا نشاط ولا أولوية على طلب انتهى
      const OPEN_NOW = ['new', 'in_review', 'awaiting_client'];
      const nowRow = db.get('SELECT status, priority FROM intakes WHERE id = ?', intakeId);
      if (OPEN_NOW.includes(intake.status) && (!nowRow || !OPEN_NOW.includes(nowRow.status))) return null;
      result.output = norm(result.output);
      result.output.similar = svc.similar(st.clientText, { scope: 'staff', limit: 10, area: result.output.legal_area });
      const sug = store('intake', intakeId, 'intake_analysis', result, actor);
      markAnalyzed(intakeId, snapshotRev, result.output.recommended_track);
      app.activity.log({
        intake_id: intakeId,
        client_id: intake.client_id,
        actor: { kind: 'ai' },
        type: 'ai.analyzed',
        summary: `حلل الذكاء الاصطناعي الطلب: ${LABELS.priority[result.output.urgency] ? 'أولوية ' + LABELS.priority[result.output.urgency] + '، ' : ''}التصنيف المقترح «${AREA_LABEL[result.output.legal_area] || result.output.legal_area}»`,
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
            summary: `هذا الطلب يشبه ${arabicCount(similarCount, AR_UNITS.similar)} تعاملت معها المؤسسة من قبل`,
            data: { count: similarCount },
          });
          app.notifications.notifyStaff({
            type: 'ai.similar',
            title: `الطلب ${intake.code} يشبه ${arabicCount(similarCount, ['حالة سابقة', 'حالتين سابقتين', 'حالات سابقة', 'حالة سابقة'])}`,
            body: 'يمكن الاستفادة من الحالات السابقة في التصنيف واختيار المحامي.',
            link: `#/inbox/${intakeId}`,
          });
        }
      }
      // رفع الأولوية تلقائيًا للحالات العاجلة (قرار قابل للتعديل من الإدارة)
      if (['high', 'urgent'].includes(result.output.urgency) && (nowRow?.priority ?? intake.priority) === 'normal' && (nowRow?.status ?? intake.status) !== 'converted') {
        db.update('intakes', intakeId, { priority: result.output.urgency, updated_at: nowIso() });
      }
      // v9.2 [R2-A10]: قصة عاجلة جاهزة ← تنبيه واحد للإدارة
      try {
        app.stories?.urgentCheck(intakeId);
      } catch (e) {
        app.log('stories.urgentCheck failed', e);
      }
      return sug;
    },

    /**
     * v9.2 [R2-A16]: ملخص مبدئي محلي أثناء كتابة القصة (نوع intake_preview، صف واحد لكل طلب): بلا سجل استهلاك ولا نشاط
     * ولا تنبيه تشابه ولا تغيير أولوية، ولا يقدّم analyzed_rev.
     */
    previewIntake(intakeId) {
      const intake = db.get('SELECT * FROM intakes WHERE id = ?', intakeId);
      if (!intake) throw notFound('الطلب غير موجود');
      const st = storyOf(intake);
      const ctx = trackCtx(intake, st);
      const local = () => H.analyzeIntake(st.clientText, ctx);
      const output = normalizeStory(local(), { fallback: local, orgPhone: app.settings.get('org_phone'), storyRev: Number(intake.story_rev) || 0, voice: st.voice, preview: true, questionsFor: H.questionsFor });
      output.similar = { total: 0, items: [] };
      const prev = db.get("SELECT id FROM ai_suggestions WHERE entity_type = 'intake' AND entity_id = ? AND kind = 'intake_preview' ORDER BY id DESC LIMIT 1", intakeId);
      if (prev) {
        db.update('ai_suggestions', prev.id, { provider: 'heuristic', model: HEURISTIC_MODEL, output: JSON.stringify(output), created_at: nowIso() });
        return svc.suggestion(prev.id);
      }
      const id = db.insert('ai_suggestions', { entity_type: 'intake', entity_id: intakeId, kind: 'intake_preview', provider: 'heuristic', model: HEURISTIC_MODEL, output: JSON.stringify(output), created_by: null, created_at: nowIso() });
      return svc.suggestion(id);
    },

    async suggestIssuesForCase(caseId, actor) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) throw notFound('الملف غير موجود');
      const facts = [c.facts_shared, c.facts_internal].filter(Boolean).join('\n') || c.title;
      const result = await run(
        'suggestIssues',
        { title: c.title, facts, area: c.legal_area },
        () => {
          const cls = H.classify(facts);
          return { issues: H.suggestIssuesFor(c.legal_area, `${c.title}\n${facts}`, cls.secondary.filter((a) => a !== c.legal_area)) };
        },
        { feature: 'issues', entity_type: 'case', entity_id: caseId, user_id: actor?.id ?? null },
      );
      return store('case', caseId, 'issues', result, actor);
    },

    /**
     * مسودة أولية لمحامٍ — تعتمد فقط على ما أتاحته الإدارة له + المعرفة المعتمدة المجهّلة + تحليلات المستندات المتاحة له.
     * مع Claude تُذكر في آخر المسودة رموز الحالات المعتمدة التي استُرشد بها (استُرشد بـ: KR-…).
     */
    async draftForAssignment(assignmentId, lawyer) {
      const a = app.visibility.requireAssignment(assignmentId, lawyer);
      // v10 b2b-server (L-29، CS-35، حارس #30): لا مسودات آلية على ملفات الشركات حتى يُبنى draft_b2b
      if (db.get('SELECT 1 FROM cases WHERE id = ? AND company_id IS NOT NULL', a.case_id)) throw new ApiError(409, 'المسودة الآلية غير متاحة في ملفات الشركات بعد؛ اكتب الرأي مباشرة.', 'company_case_no_ai_draft');
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
      const sources = precedents(`${view.case.title}\n${facts}`, { area: view.case.legal_area, limit: 3 });
      const grantedDocs = (view.documents || []).map((d) => d.id);
      const result = await run(
        'draftOpinion',
        // الحالات المعتمدة مجهّلة مسبقًا؛ ويُعاد إخفاء الأرقام والهواتف احتياطيًا لأن السياق موجه لمحامٍ
        { ...args, precedents: maskSensitive(sources), documents: analysesFor(grantedDocs, { forLawyer: true }) },
        () => ({ text: H.draftOpinion(args) }),
        { feature: 'draft', entity_type: 'assignment', entity_id: assignmentId, user_id: lawyer.id },
      );
      // سبب العودة للمحلل المحلي يصل للمحامي بصيغة عامة (سقف الإنفاق ومبلغه وحالة المفتاح شأن داخلي للإدارة)،
      // والسبب التفصيلي محفوظ في سجل الاستهلاك ai_usage للإدارة
      if (result.fallback_reason) result.fallback_reason = lawyerReason(result.fallback_reason);
      if (result.provider === 'anthropic') {
        const known = new Map(sources.map((s) => [s.ref, s]));
        const used = [...new Set((result.output.used_sources || []).map((x) => String(x).trim()).filter((x) => known.has(x)))];
        delete result.output.used_sources;
        result.output.sources = used.map((ref) => ({ ref, title: known.get(ref).title }));
        if (used.length) result.output.text = `${String(result.output.text || '').trimEnd()}\n\nاستُرشد بـ: ${used.join('، ')}`;
      }
      const sug = store('assignment', assignmentId, 'draft', result, lawyer);
      app.activity.log({
        case_id: a.case_id,
        actor: lawyer,
        type: 'ai.draft',
        summary: 'أعد الذكاء الاصطناعي مسودة أولية للمحامي',
        data: { suggestion_id: sug.id, assignment_id: assignmentId, sources: (sug.output.sources || []).map((s) => s.ref) },
      });
      return sug;
    },

    async clientVersion(caseId, opinionId, actor) {
      const c = db.get('SELECT * FROM cases WHERE id = ?', caseId);
      if (!c) throw notFound('الملف غير موجود');
      const op = db.get('SELECT * FROM opinions WHERE id = ? AND case_id = ?', opinionId, caseId);
      if (!op) throw notFound('الرأي غير موجود');
      const client = app.clients.get(c.client_id);
      const args = { clientName: client?.name, caseCode: c.code, opinion: op.body, orgName: app.brand.displayName() }; // v10 experience (H-E3)
      const sources = precedents(`${c.title}\n${c.facts_shared || ''}`, { area: c.legal_area, limit: 3 });
      const docIds = db.all('SELECT id FROM documents WHERE case_id = ?', c.id).map((r) => r.id);
      const result = await run(
        'clientVersion',
        { ...args, precedents: sources, documents: analysesFor(docIds) },
        () => ({ text: H.clientVersion(args) }),
        { feature: 'client_version', entity_type: 'case', entity_id: caseId, user_id: actor?.id ?? null },
      );
      // v9.1 b-portal (B91-08): «الخلاصة بكلام بسيط» و«الخطوات» مقترحتان دائمًا (من Claude، وإلا من المحلل المحلي
      // بخطوات المحامي المقترحة للمستفيد/ة إن وُجدت)؛ تراجعها الإدارة قبل الحفظ
      if (result.output && (!result.output.summary || !result.output.steps?.length)) {
        const local = H.clientSummary({ opinion: op.body, clientSteps: op.client_steps });
        result.output.summary = result.output.summary || local.summary;
        result.output.steps = result.output.steps?.length ? result.output.steps : local.steps;
      }
      if (result.provider === 'anthropic' && sources.length) {
        // للإدارة فقط: ما استُرشد به (لا يدخل في نص الرسالة الموجهة للمستفيد)
        result.output.sources = sources.map((s) => ({ ref: s.ref, title: s.title }));
        result.output.rag_note = `استُرشد بـ: ${sources.map((s) => s.ref).join('، ')}`;
      }
      return store('case', caseId, 'client_version', result, actor);
    },

    /**
     * ردود واتساب مقترحة للإدارة على طلب وارد أو ملف استشارة أو ملف مستمر.
     * body: { intake_id | case_id | matter_id, intent? }
     */
    async suggestReply(body, actor) {
      const keys = ['intake_id', 'case_id', 'matter_id'].filter((k) => body?.[k] !== undefined && body?.[k] !== null && body?.[k] !== '');
      if (keys.length !== 1) throw badRequest('حدد طلبًا واردًا أو ملفًا واحدًا فقط لاقتراح الرد');
      const kind = keys[0].replace('_id', '');
      const id = v.int(body[keys[0]], 'المعرف', { required: true, min: 1 });
      const intent = v.oneOf(body.intent, REPLY_INTENTS, 'الغرض من الرد') || 'answer';
      const { ctx, lawyerNames } = replyContext(kind, id);
      const heuristic = () => ({ suggestions: H.suggestReplies({ ...ctx, intent }) });
      const forModel = {
        intent,
        reference: ctx.code,
        reference_kind: { intake: 'طلب وارد', case: 'ملف استشارة', matter: 'ملف مستمر' }[kind],
        status: ctx.status_phrase,
        legal_area: ctx.legal_area,
        facts_summary: ctx.summary,
        missing_info: ctx.missing,
        requests_sent_to_beneficiary: ctx.pending_requests,
        approved_answer: ctx.approved_answer,
        approved_appointment: ctx.next_event,
        organization: { name: ctx.org_name, address: ctx.org_address },
        conversation: ctx.conversation,
      };
      const result = await run('suggestReplies', forModel, heuristic, { feature: 'reply', entity_type: kind, entity_id: id, user_id: actor?.id ?? null });
      const clean = (list) =>
        (Array.isArray(list) ? list : [])
          .filter((s) => s && String(s.text || '').trim())
          .slice(0, 3)
          .map((s) => ({ tone: REPLY_TONES.includes(s.tone) ? s.tone : 'formal', text: clip(scrubNames(String(s.text).trim(), lawyerNames), 1500) }));
      let suggestions = clean(result.output.suggestions);
      if (!suggestions.length) {
        result.provider = 'heuristic';
        result.model = HEURISTIC_MODEL;
        result.fallback_reason = 'لم يقترح النموذج ردًا صالحًا';
        suggestions = clean(heuristic().suggestions);
      }
      const grounded = [];
      if (ctx.conversation.length) grounded.push(`المحادثة (${arabicCount(ctx.conversation.length, ['رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'])})`);
      if (ctx.missing.length) grounded.push('النواقص في تحليل الفرز');
      if (ctx.pending_requests.length) grounded.push(arabicCount(ctx.pending_requests.length, ['طلب مرسل للمستفيد', 'طلبان مرسلان للمستفيد', 'طلبات مرسلة للمستفيد', 'طلبًا مرسلًا للمستفيد']));
      if (ctx.approved_answer) grounded.push(ctx.approved_answer.sent ? 'الرد المعتمد المرسل' : 'الرد المعتمد (لم يُرسل بعد)');
      if (ctx.next_event) grounded.push('موعد معتمد قادم');
      result.output = { intent, suggestions, grounded_on: grounded };
      const sug = store(kind, id, 'reply', result, actor);
      return {
        id: sug.id,
        intent,
        suggestions,
        grounded_on: grounded,
        provider: sug.provider,
        model: sug.model,
        fallback_reason: sug.output._fallback_reason || null,
      };
    },

    /** تسجيل ما فعله الموظف بالرد المقترح (استخدمه كما هو / عدّله / رفضه) كتغذية راجعة */
    replyFeedback(suggestionId, body, actor) {
      const sug = svc.suggestion(suggestionId);
      if (!sug || sug.kind !== 'reply') throw notFound('الاقتراح غير موجود');
      const list = sug.output.suggestions || [];
      const index = v.int(body.index, 'رقم الرد المقترح', { required: true, min: 0, max: Math.max(0, list.length - 1) });
      const original = list[index]?.text || '';
      const action = v.oneOf(body.action, ['used', 'sent', 'rejected'], 'الإجراء') || 'used';
      const finalText = v.str(body.final_text, 'النص النهائي', { max: 4000 });
      const ratio = finalText ? similarityRatio(original, finalText) : 1;
      const verdict = action === 'rejected' ? 'rejected' : finalText && finalText.trim() !== original.trim() && ratio < 0.9 ? 'corrected' : 'accepted';
      let caseId = null;
      if (sug.entity_type === 'case') caseId = sug.entity_id;
      else if (sug.entity_type === 'matter') caseId = db.value('SELECT case_id FROM matters WHERE id = ?', sug.entity_id) ?? null;
      else if (sug.entity_type === 'intake') caseId = db.value('SELECT case_id FROM intakes WHERE id = ?', sug.entity_id) ?? null;
      svc.recordFeedback({
        suggestion_id: sug.id,
        entity_type: sug.entity_type,
        entity_id: sug.entity_id,
        case_id: caseId,
        field: 'reply',
        verdict,
        ai_value: original,
        final_value: action === 'rejected' ? null : finalText || original,
        actor,
        note: `الغرض: ${LABELS.ai_reply_intent?.[sug.output.intent] || sug.output.intent || '—'}، النبرة: ${LABELS.ai_reply_tone?.[list[index]?.tone] || '—'}${verdict === 'corrected' ? `، نسبة التشابه بعد التعديل: ${arabicPercent(ratio)}` : ''}`,
        replace: true,
      });
      return { ok: true, verdict };
    },

    // ───────────── تحليل المستندات ─────────────
    /** يُحلل مستندًا (للإدارة، أو لمحامٍ أُتيح له المستند) ويحفظ النتيجة */
    async analyzeDocument(documentId, actor) {
      const doc = app.documents.get(documentId);
      // المحامي: 404 لأي مستند لم يُتح له (لا نكشف وجوده)
      if (!doc || !app.documents.canAccess(actor, doc)) throw notFound('المستند غير موجود');
      const caseRow = doc.case_id
        ? db.get('SELECT id, title, legal_area FROM cases WHERE id = ?', doc.case_id)
        : doc.matter_id
          ? db.get('SELECT c.id, m.title, c.legal_area FROM matters m JOIN cases c ON c.id = m.case_id WHERE m.id = ?', doc.matter_id)
          : null;
      const meta = { feature: 'document_analysis', entity_type: 'document', entity_id: doc.id, user_id: actor?.id ?? null };
      let result;
      const a = active();
      let block = null;
      let blockReason = null;
      if (a.provider) {
        // لا يُقرأ الملف ولا يُرسل إلا عند تفعيل Claude فعليًا
        let buffer = null;
        try {
          buffer = readDocument(doc);
        } catch {
          buffer = null;
        }
        ({ block, reason: blockReason = null } = documentBlockFor({ mime: doc.mime, buffer }));
      }
      if (a.provider && !block) {
        recordUsage({ ...meta, provider: 'heuristic', model: HEURISTIC_MODEL, ok: true, fallback: true, fallback_reason: blockReason });
        result = { output: H.analyzeDocument(doc, { reason: blockReason }), provider: 'heuristic', model: HEURISTIC_MODEL, fallback_reason: blockReason };
      } else {
        result = await run(
          'analyzeDocument',
          { block, filename: doc.filename, title: doc.title, area: caseRow ? `${caseRow.legal_area} — ${AREA_LABEL[caseRow.legal_area] || ''}` : null, caseTitle: caseRow?.title || null },
          () => H.analyzeDocument(doc),
          meta,
        );
      }
      const output = normalizeDocResult(result.output);
      if (result.fallback_reason) output._fallback_reason = result.fallback_reason;
      const id = db.insert('document_ai', {
        document_id: doc.id,
        case_id: doc.case_id ?? caseRow?.id ?? null,
        intake_id: doc.intake_id ?? null,
        matter_id: doc.matter_id ?? null,
        provider: result.provider,
        model: result.model,
        doc_type: output.doc_type,
        result: JSON.stringify(output),
        sha256: doc.sha256,
        created_by: actor?.id ?? null,
        created_by_role: actor?.role ?? null,
        created_at: nowIso(),
      });
      app.activity.log({
        case_id: doc.case_id ?? null,
        intake_id: doc.case_id ? null : doc.intake_id ?? null,
        matter_id: doc.matter_id ?? null,
        actor,
        type: 'ai.document_analyzed',
        summary: `${result.provider === 'anthropic' ? 'حلل الذكاء الاصطناعي' : 'صُنّف مبدئيًا'} المستند «${truncate(doc.title || doc.filename, 80)}»: ${LABELS.ai_doc_type?.[output.doc_type] || output.doc_type}`,
        data: { document_id: doc.id, analysis_id: id, provider: result.provider },
      });
      return mapDocAi(db.get('SELECT * FROM document_ai WHERE id = ?', id), { forLawyer: actor?.role === 'lawyer' });
    },

    /** آخر تحليل لمستند (مع نفس فحص الصلاحية) */
    documentAnalysis(documentId, actor) {
      const doc = app.documents.get(documentId);
      if (!doc || !app.documents.canAccess(actor, doc)) throw notFound('المستند غير موجود');
      const row = db.get('SELECT * FROM document_ai WHERE document_id = ? ORDER BY id DESC LIMIT 1', doc.id);
      return { document: app.documents.publicView(doc), analysis: mapDocAi(row, { forLawyer: actor?.role === 'lawyer' }) };
    },

    /** قائمة آخر تحليل لكل مستند (للإدارة): لملف أو طلب أو ملف مستمر، أو الأحدث عمومًا */
    documentAnalyses({ case_id, intake_id, matter_id, limit } = {}) {
      const where = [];
      const params = [];
      const idf = (val, label) => v.int(val, label, { min: 1 });
      if (case_id) {
        where.push('x.case_id = ?');
        params.push(idf(case_id, 'الملف'));
      }
      if (intake_id) {
        where.push('x.intake_id = ?');
        params.push(idf(intake_id, 'الطلب'));
      }
      if (matter_id) {
        where.push('x.matter_id = ?');
        params.push(idf(matter_id, 'الملف المستمر'));
      }
      const lim = Math.min(Math.max(Number(limit) || 30, 1), 200);
      const rows = db.all(
        `SELECT x.*, d.title AS doc_title, d.filename, d.mime, d.size, c.code AS case_code FROM document_ai x
         JOIN documents d ON d.id = x.document_id LEFT JOIN cases c ON c.id = x.case_id
         WHERE x.id IN (SELECT MAX(id) FROM document_ai GROUP BY document_id) ${where.length ? `AND ${where.join(' AND ')}` : ''}
         ORDER BY x.id DESC LIMIT ?`,
        ...params,
        lim,
      );
      return {
        items: rows.map((r) => ({
          ...mapDocAi(r),
          document: { id: r.document_id, title: r.doc_title, filename: r.filename, mime: r.mime, size: r.size },
          case_code: r.case_code || null,
        })),
      };
    },

    // ===== التصحيحات والتغذية الراجعة =====
    /**
     * replace: القرارات الآلية (تحويل، تعامل داخلي، تقديم مسودة) تستبدل التقييم السابق لنفس الاقتراح والحقل
     * بدل أن تتكرر فتُضخّم المؤشرات؛ أما ملاحظات الموظفين الصريحة فتُضاف دائمًا.
     */
    recordFeedback({ suggestion_id = null, entity_type, entity_id, case_id = null, field, verdict, ai_value = null, final_value = null, actor = null, note = null, replace = false }) {
      const row = {
        verdict,
        ai_value: ai_value === null || ai_value === undefined ? null : typeof ai_value === 'string' ? ai_value : JSON.stringify(ai_value),
        final_value: final_value === null || final_value === undefined ? null : typeof final_value === 'string' ? final_value : JSON.stringify(final_value),
        actor_user_id: actor?.id ?? null,
        actor_role: actor?.role ?? actor?.kind ?? null,
        note,
        created_at: nowIso(),
      };
      if (replace && suggestion_id) {
        const prev = db.get(
          'SELECT id, case_id FROM ai_feedback WHERE suggestion_id = ? AND field = ? AND entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1',
          suggestion_id,
          field,
          entity_type,
          entity_id,
        );
        if (prev) {
          db.update('ai_feedback', prev.id, { ...row, case_id: case_id ?? prev.case_id });
          return;
        }
      }
      db.insert('ai_feedback', { suggestion_id, entity_type, entity_id, case_id, field, ...row });
    },

    /** مقارنة قرار الإدارة النهائي باقتراح الذكاء الاصطناعي عند تحويل الطلب إلى ملف */
    feedbackOnConversion(intakeId, caseId, { legal_area, title }, actor) {
      const sug = svc.latest('intake', intakeId, 'intake_analysis');
      if (!sug) return;
      const o = sug.output;
      svc.recordFeedback({
        suggestion_id: sug.id, entity_type: 'intake', entity_id: intakeId, case_id: caseId, field: 'legal_area',
        verdict: o.legal_area === legal_area ? 'accepted' : 'corrected', ai_value: o.legal_area, final_value: legal_area, actor, replace: true,
      });
      if (o.title) {
        const same = o.title.trim() === String(title).trim();
        svc.recordFeedback({
          suggestion_id: sug.id, entity_type: 'intake', entity_id: intakeId, case_id: caseId, field: 'title',
          verdict: same ? 'accepted' : similarityRatio(o.title, title) >= 0.5 ? 'accepted' : 'corrected',
          ai_value: o.title, final_value: title, actor, replace: true,
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
        note: `نسبة التشابه بين المسودة والنسخة المقدمة: ${arabicPercent(ratio)}`,
        replace: true,
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

  // إعادة التهيئة فور تغيير إعدادات Claude من لوحة الإدارة (دون إعادة تشغيل)
  app.events.on('integrations.changed', (p) => {
    if (p?.name !== 'anthropic') return;
    try {
      svc.reconfigure();
    } catch (e) {
      app.log('ai reconfigure failed', e);
    }
  });

  // متابعة دورية لسقف الإنفاق (تظهر حالتها في صفحة صحة النظام)
  app.jobs?.register('ai.budget', {
    everyMinutes: 60,
    label: 'متابعة سقف إنفاق الذكاء الاصطناعي',
    run: async () => {
      const b = checkBudget();
      return { period: b.period, spent_usd: Math.round(b.spent_usd * 100) / 100, limit_usd: b.limit_usd, exceeded: b.exceeded };
    },
  });

  // حالة الذكاء الاصطناعي في /api/meta للإدارة فقط (لإظهار شريط التنبيه عند تجاوز السقف)
  app.metaProviders?.push((ctx) => {
    const u = ctx?.user;
    if (!u || (u.role !== 'admin' && u.role !== 'case_manager')) return {};
    const s = svc.status();
    return { ai: { provider: s.provider, model: s.model, label: s.label, budget_exceeded: !!s.budget.exceeded, budget_warning: !!s.budget.warning } };
  });

  // v10 b2b-server (SRV-7): فرز طلبات الشركات بنفس run()/store() وسقف الإنفاق؛ سياق الشركة لا يشارك فهارس الأفراد (CS-13)
  svc.companyAi = createCompanyAi(app, { run, store, active });
  svc.triageCompanyRequest = (requestId, actor = null, opts = {}) => svc.companyAi.triage(requestId, actor, opts);
  svc.scheduleCompanyTriage = (requestId, opts = {}) => svc.companyAi.schedule(requestId, opts);
  svc.companyContext = (companyId, opts = {}) => svc.companyAi.companyContext(companyId, opts);

  return svc;
}
