// v9 — وحدة الذكاء الاصطناعي: الإعدادات الحية وإعادة التهيئة، اختبار الاتصال، سجل الاستهلاك والتكلفة، سقف الإنفاق،
// الردود المقترحة، تحليل المستندات، الاسترشاد بالمعرفة المعتمدة في المسودات، والمجالات الجديدة (GRD / PEN).
// لا يُستدعى Anthropic API الحقيقي أبدًا: تُستبدل الحزمة بنسخة وهمية عبر setSdkLoader.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { ok, newCase, createLawyer, assign, assertNoLeak, LAWYER_FORBIDDEN_KEYS } from './lane-b-kit.test.js';
import { setSdkLoader, estimateCostMicroUsd, priceFor, documentBlockFor, AI_MAX_IMAGE_BYTES, AI_MAX_PDF_BYTES } from '../src/ai/anthropic.js';
import { periodOf } from '../src/util.js';
import * as H from '../src/ai/heuristic.js';
import { hashPassword } from '../src/auth.js';
import { LEGAL_AREAS, AREA_CODES, LABELS } from '../src/constants.js';

// ───────────── نسخة وهمية من @anthropic-ai/sdk ─────────────
class APIError extends Error {
  constructor(status, message = 'error') {
    super(message);
    this.status = status;
  }
}
class AuthenticationError extends APIError {}
class RateLimitError extends APIError {}
class InternalServerError extends APIError {}
class APIConnectionError extends Error {
  constructor() {
    super('Connection error.');
    this.name = 'APIConnectionError';
  }
}

const USAGE = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 };

/** يحدد الوظيفة من مخطط المخرجات المطلوب */
function featureOf(params) {
  const props = params.output_config?.format?.schema?.properties || {};
  if (props.suggestions) return 'reply';
  if (props.doc_type) return 'document_analysis';
  if (props.used_sources) return 'draft';
  if (props.issues) return 'issues';
  if (props.legal_area) return 'intake_analysis';
  if (props.text) return 'client_version';
  return 'ping';
}

const DEFAULT_OUTPUT = {
  intake_analysis: {
    title: 'صرف معاش الزوج المتوفى',
    summary: 'أرملة تسأل عن صرف معاش زوجها.',
    legal_area: 'PEN',
    confidence: 0.9,
    secondary_areas: ['INH'],
    facts: ['توفي الزوج'],
    missing_info: [{ item: 'رقم المعاش', kind: 'information' }],
    information_sufficient: false,
    suggested_issues: [{ title: 'تحديد المستحقين في المعاش', details: null, legal_area: 'PEN' }],
    urgency: 'normal',
    specialist_hint: null,
  },
  issues: { issues: [{ title: 'مسألة', details: null, legal_area: 'INH' }] },
  draft: { text: 'مسودة آلية من Claude', used_sources: [] },
  client_version: { text: 'رسالة للمستفيد' },
  reply: { suggestions: [{ tone: 'formal', text: 'تحية طيبة، ملفكم قيد الدراسة. — مؤسسة بيوت مصر' }, { tone: 'brief', text: 'ملفكم قيد الدراسة.' }] },
  document_analysis: {
    doc_type: 'inheritance_declaration',
    confidence: 0.92,
    summary: 'إعلام وراثة صادر من محكمة الأسرة.',
    key_facts: [
      { kind: 'court', label: 'المحكمة', value: 'محكمة الأسرة بمدينة نصر' },
      { kind: 'other', label: 'هاتف', value: '01012345678' },
    ],
    proves: ['تحديد الورثة'],
    red_flags: [],
    missing_related: ['شهادة الوفاة'],
    legible: true,
  },
};

function installFakeSdk() {
  const state = { calls: [], constructed: 0, loaderCalls: 0, handler: null, outputs: {} };
  class FakeAnthropic {
    constructor(opts) {
      state.constructed += 1;
      this.opts = opts;
      this.beta = {
        messages: {
          create: async (params, reqOpts) => {
            const feature = featureOf(params);
            state.calls.push({ params, reqOpts, feature });
            if (state.handler) {
              const r = await state.handler(params, feature, state.calls.length);
              if (r) return r;
            }
            const out = state.outputs[feature] || DEFAULT_OUTPUT[feature];
            return {
              id: `msg_${state.calls.length}`,
              model: params.model,
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: feature === 'ping' ? 'تم' : JSON.stringify(out) }],
              usage: { ...USAGE },
            };
          },
        },
      };
    }
  }
  Object.assign(FakeAnthropic, { APIError, AuthenticationError, RateLimitError, InternalServerError, APIConnectionError });
  setSdkLoader(() => {
    state.loaderCalls += 1;
    return FakeAnthropic;
  });
  state.reset = () => {
    state.calls.length = 0;
    state.handler = null;
    state.outputs = {};
  };
  return state;
}

const fake = installFakeSdk();
after(() => setSdkLoader(null));

async function withApp(fn, { seed = 'none', config = {} } = {}) {
  fake.reset();
  const t = await startTestApp({ seed, config: { ai: { provider: 'auto', anthropicApiKey: '' }, ...config } });
  try {
    return await fn(t);
  } finally {
    await t.close();
  }
}

/** حساب «إدارة الحالات» في قاعدة بيانات اختبار فارغة */
let mgrSeq = 0;
async function managerLogin(t) {
  mgrSeq += 1;
  const username = `casemgr${mgrSeq}`;
  t.app.db.insert('users', { role: 'case_manager', username, name: 'مديرة الحالات', password_hash: hashPassword('Manager@2026'), active: 1, created_at: new Date().toISOString() });
  return t.login(username, 'Manager@2026');
}

const enableClaude = (t, extra = {}) => t.app.integrations.set('anthropic', { api_key: 'sk-ant-test-0000', ...extra }, null);

async function manualIntake(admin, t, text, phone = `0101${String(Date.now()).slice(-7)}`) {
  const r = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone, name: 'مستفيدة اختبار', text }), 201, 'manual intake');
  t.app.ai.cancelTimers();
  return r;
}

// ═════════════════════════ الإعدادات الحية ═════════════════════════
describe('live configuration from the integrations store', () => {
  test('provider switches on integrations.changed without restart (key, model, mode, budget)', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      let s = ok(await admin.get('/api/admin/ai/status'));
      assert.equal(s.provider, 'heuristic');
      assert.equal(s.configured, false);
      assert.equal(s.key_set, false);

      enableClaude(t);
      s = ok(await admin.get('/api/admin/ai/status'));
      assert.equal(s.provider, 'anthropic', 'saving a key reconfigures the AI service immediately');
      assert.equal(s.model, 'claude-opus-5-5', 'default model');
      assert.equal(s.effort, 'medium');
      assert.equal(JSON.stringify(s).includes('sk-ant-test-0000'), false, 'the API key is never returned');

      t.app.integrations.set('anthropic', { model: 'claude-sonnet-5-5', effort: 'low', monthly_budget_usd: '25' }, null);
      s = t.app.ai.status();
      assert.equal(s.model, 'claude-sonnet-5-5');
      assert.equal(s.effort, 'low');
      assert.equal(s.budget.limit_usd, 25);

      t.app.integrations.set('anthropic', { provider: 'heuristic' }, null);
      assert.equal(t.app.ai.status().provider, 'heuristic', 'mode «heuristic» disables Claude even with a key');

      t.app.integrations.set('anthropic', { provider: 'auto', api_key: '' }, null);
      assert.equal(t.app.ai.status().provider, 'heuristic', 'removing the key falls back to the local analyzer');

      // /api/meta exposes the AI status to staff only
      assert.equal(ok(await admin.get('/api/meta')).ai.provider, 'heuristic');
      assert.equal(ok(await t.client().get('/api/meta')).ai, undefined, 'anonymous visitors do not see AI status');
    });
  });

  test('end to end through the admin integrations API: save key → Claude live; test button uses app.ai.test()', async (tc) => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const put = await admin.put('/api/admin/integrations/anthropic', { values: { api_key: 'sk-ant-api03-testkey1234567890', monthly_budget_usd: '40' } });
      if (put.status === 404) {
        tc.skip('integrations API (platform lane) not available');
        return;
      }
      ok(put, 200, 'save anthropic integration');
      const s = ok(await admin.get('/api/admin/ai/status'));
      assert.equal(s.provider, 'anthropic', 'saving from the integrations page reconfigures the AI service without restart');
      assert.equal(s.budget.limit_usd, 40);
      const r = ok(await admin.post('/api/admin/integrations/anthropic/test', {}));
      assert.equal(r.ok, true);
      assert.match(r.message, /نجح الاتصال بخدمة Claude/);
      assert.equal(fake.constructed >= 1, true);
      assert.equal(fake.calls.at(-1).params.model, 'claude-opus-5-5');
      ok(await admin.put('/api/admin/integrations/anthropic', { values: { provider: 'heuristic' } }));
      assert.equal(ok(await admin.get('/api/admin/ai/status')).provider, 'heuristic');
    });
  });

  test('requests use the configured model, effort, prompt caching and structured outputs', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const it = await manualIntake(admin, t, 'جوزي اتوفى من 4 شهور وعايزة أصرف معاشه أنا والعيال');
      enableClaude(t, { model: 'claude-opus-5-5', effort: 'high' });
      const sug = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(sug.provider, 'anthropic');
      assert.equal(sug.output.legal_area, 'PEN');
      const call = fake.calls.find((c) => c.feature === 'intake_analysis');
      assert.ok(call, 'the fake SDK received the analysis request');
      const p = call.params;
      assert.equal(p.model, 'claude-opus-5-5');
      assert.equal(p.output_config.effort, 'high');
      assert.equal(p.output_config.format.type, 'json_schema');
      assert.ok(p.output_config.format.schema.properties.legal_area.enum.includes('GRD'), 'new areas are offered to the model');
      assert.ok(Array.isArray(p.system) && p.system.length === 2);
      assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' }, 'stable system prompt is cached');
      assert.match(p.system[0].text, /الأرامل والأيتام/);
      assert.match(p.system[0].text, /لا تذكر رقم قانون أو مادة/);
      assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
      assert.equal(p.fallbacks, 'default');
      assert.equal(JSON.stringify(p.system).includes(new Date().toISOString().slice(0, 13)), false, 'no timestamps in the cached prefix');
    });
  });
});

// ═════════════════════════ اختبار الاتصال ═════════════════════════
describe('connection test (app.ai.test / POST /api/admin/ai/test)', () => {
  test('ok result with model and latency; Arabic errors mapped from status codes; admin only', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const manager = await managerLogin(t);
      let r = ok(await admin.post('/api/admin/ai/test', {}));
      assert.equal(r.ok, false);
      assert.equal(r.code, 'not_configured');
      assert.match(r.error, /مفتاح/);

      enableClaude(t);
      assert.equal((await manager.post('/api/admin/ai/test', {})).status, 403, 'case managers cannot spend credit on tests');
      r = ok(await admin.post('/api/admin/ai/test', {}));
      assert.equal(r.ok, true);
      assert.equal(r.model, 'claude-opus-5-5');
      assert.equal(typeof r.latency_ms, 'number');
      const ping = fake.calls.find((c) => c.feature === 'ping');
      assert.equal(ping.reqOpts.maxRetries, 0, 'the test request is not retried silently');

      const cases = [
        [() => { throw new AuthenticationError(401, 'invalid x-api-key'); }, 'invalid_key', /مفتاح Anthropic API غير صالح/],
        [() => { throw new RateLimitError(429, 'rate limited'); }, 'rate_limited', /حد الاستخدام/],
        [() => { throw new APIError(529, 'overloaded'); }, 'overloaded', /مزدحمة/],
        [() => { throw new APIConnectionError(); }, 'network', /تعذر الاتصال/],
      ];
      for (const [h, code, re] of cases) {
        fake.handler = h;
        const res = await t.app.ai.test({ id: 1, name: 'admin' });
        assert.equal(res.ok, false);
        assert.equal(res.code, code);
        assert.match(res.error, re);
      }
      fake.handler = null;
      const usage = ok(await admin.get('/api/admin/ai/usage'));
      const tests = usage.by_feature.find((f) => f.feature === 'connection_test');
      assert.equal(tests.calls, 5);
      assert.equal(tests.errors, 4);
      assert.equal(usage.recent_errors.length, 4);
      assert.ok(usage.recent_errors.every((e) => /[؀-ۿ]/.test(e.error)), 'errors are stored in Arabic');
      const audit = t.app.db.all("SELECT * FROM security_events WHERE type = 'ai.connection_test'");
      assert.equal(audit.length, 5, 'every test run is written to the security log');
      assert.equal(audit.filter((e) => e.severity === 'warning').length, 4);
    });
  });
});

// ═════════════════════════ الاستهلاك والتكلفة وسقف الإنفاق ═════════════════════════
describe('usage recording and monthly budget', () => {
  test('every model call is recorded with tokens, model, latency and estimated cost', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const it = await manualIntake(admin, t, 'والدي توفى وساب شقة وأخويا رافض يقسم الميراث');
      enableClaude(t);
      ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      const row = t.app.db.get("SELECT * FROM ai_usage WHERE feature = 'intake_analysis' AND provider = 'anthropic'");
      assert.ok(row);
      assert.equal(row.entity_type, 'intake');
      assert.equal(row.entity_id, it.id);
      assert.equal(row.model, 'claude-opus-5-5');
      assert.equal(row.input_tokens, 1000);
      assert.equal(row.output_tokens, 500);
      assert.equal(row.cache_read_tokens, 2000);
      assert.equal(row.ok, 1);
      assert.ok(row.latency_ms >= 0);
      // 1000×4 + 500×20 + 2000×0.2 = 14400 جزء من المليون من الدولار
      assert.equal(row.cost_micro_usd, 14400);
      assert.equal(estimateCostMicroUsd('claude-opus-5-5', USAGE), 14400);
      assert.equal(priceFor('claude-unknown-x').known, false, 'unknown models are priced at the default model');

      // خطأ من الخدمة: يُسجل كخطأ ثم يُخدم الطلب بالمحلل المحلي
      fake.handler = () => {
        throw new InternalServerError(500, 'boom');
      };
      const sug = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(sug.provider, 'heuristic');
      assert.match(sug.output._fallback_reason, /خطأ مؤقت/);
      fake.handler = null;

      const usage = ok(await admin.get('/api/admin/ai/usage'));
      assert.equal(usage.totals.claude_calls, 2);
      assert.equal(usage.totals.errors, 1);
      assert.equal(usage.totals.fallbacks, 1);
      assert.equal(usage.totals.cost_usd, 0.0144);
      const f = usage.by_feature.find((x) => x.feature === 'intake_analysis');
      assert.equal(f.label, 'تحليل الطلبات الواردة وتصنيفها');
      assert.equal(usage.by_model[0].model, 'claude-opus-5-5');
      assert.equal(usage.monthly.length, 1);
      assert.match(usage.period, /^\d{4}-\d{2}$/);

      // صلاحيات لوحة الاستهلاك
      const lawyer = await createLawyer(admin, {});
      const lc = await t.login(lawyer.username);
      assert.equal((await lc.get('/api/admin/ai/usage')).status, 403);
      assert.equal((await t.client().get('/api/admin/ai/usage')).status, 401);
      assert.equal((await (await managerLogin(t)).get('/api/admin/ai/usage')).status, 200);
    });
  });

  test('over budget: automatic fallback to the heuristic provider, admins notified once per month', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const it = await manualIntake(admin, t, 'جوزي اتوفى وعايزة أصرف معاشه');
      fake.outputs.intake_analysis = DEFAULT_OUTPUT.intake_analysis;
      // كل استدعاء = 1000 رمز مخرجات = 0.02 دولار؛ السقف 0.025: الأول يصل 80% (تحذير) والثاني يتجاوز السقف
      fake.handler = (params) => ({ model: params.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(DEFAULT_OUTPUT.intake_analysis) }], usage: { input_tokens: 0, output_tokens: 1000 } });
      enableClaude(t, { monthly_budget_usd: '0.025' });
      const countNotes = (type) => Number(t.app.db.value("SELECT COUNT(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE n.type = ? AND u.role = 'admin'", type));

      let s = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(s.provider, 'anthropic');
      assert.equal(countNotes('ai.budget_warning'), 1, 'a single warning at 80% of the budget');
      assert.equal(countNotes('ai.budget_exceeded'), 0);

      s = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(s.provider, 'anthropic');
      assert.equal(countNotes('ai.budget_exceeded'), 1, 'admins are notified when the budget is exceeded');
      const callsBefore = fake.calls.length;

      for (let i = 0; i < 2; i++) {
        s = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
        assert.equal(s.provider, 'heuristic', 'over budget the local analyzer serves the request');
        assert.match(s.output._fallback_reason, /السقف/);
      }
      assert.equal(fake.calls.length, callsBefore, 'no request reaches Claude while over budget');
      const st = ok(await admin.get('/api/admin/ai/status'));
      assert.equal(st.provider, 'heuristic');
      assert.equal(st.configured, true);
      assert.equal(st.budget.exceeded, true);
      assert.equal(ok(await admin.get('/api/meta')).ai.budget_exceeded, true, 'the banner flag is exposed to staff');
      const usage = ok(await admin.get('/api/admin/ai/usage'));
      assert.equal(usage.budget.exceeded, true);
      assert.equal(usage.budget.spent_usd, 0.04);

      // المهمة الدورية والطلبات اللاحقة لا تكرر الإشعار في نفس الشهر
      const jobs = await t.app.jobs.runDue({ force: true, only: 'ai.budget' });
      assert.equal(jobs[0].ok, true);
      assert.equal(jobs[0].result.exceeded, true);
      ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(countNotes('ai.budget_exceeded'), 1, 'only one notification per month');
      assert.equal(countNotes('ai.budget_warning'), 1);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'ai.budget_exceeded'")), 1);

      // رفع السقف يعيد Claude فورًا
      t.app.integrations.set('anthropic', { monthly_budget_usd: '100' }, null);
      s = ok(await admin.post(`/api/admin/intakes/${it.id}/analyze`, {}));
      assert.equal(s.provider, 'anthropic');
    });
  });
});

// ═════════════════════════ الردود المقترحة ═════════════════════════
describe('suggested replies for staff', () => {
  test('permissions and validation', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const it = await manualIntake(admin, t, 'عايزة أعرف إزاي أصرف معاش جوزي الله يرحمه');
      const lawyer = await createLawyer(admin, {});
      const lc = await t.login(lawyer.username);
      assert.equal((await t.client().post('/api/admin/ai/suggest-reply', { intake_id: it.id })).status, 401);
      assert.equal((await lc.post('/api/admin/ai/suggest-reply', { intake_id: it.id })).status, 403, 'lawyers never draft client messages');
      assert.equal((await admin.post('/api/admin/ai/suggest-reply', {})).status, 400);
      assert.equal((await admin.post('/api/admin/ai/suggest-reply', { intake_id: it.id, case_id: 1 })).status, 400);
      assert.equal((await admin.post('/api/admin/ai/suggest-reply', { intake_id: it.id, intent: 'promise_win' })).status, 400);
      assert.equal((await admin.post('/api/admin/ai/suggest-reply', { intake_id: 'abc' })).status, 400);
      assert.equal((await admin.post('/api/admin/ai/suggest-reply', { case_id: 99999 })).status, 404);
      const manager = await managerLogin(t);
      const r = ok(await manager.post('/api/admin/ai/suggest-reply', { intake_id: it.id, intent: 'reassure' }));
      assert.equal(r.provider, 'heuristic');
      assert.ok(r.suggestions.length >= 2 && r.suggestions.length <= 3);
      assert.equal((await lc.post(`/api/admin/ai/suggestions/${r.id}/feedback`, { index: 0 })).status, 403);
    });
  });

  test('heuristic replies are grounded in the missing-info checklist, pending requests and the approved answer — never lawyer names or internal notes', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { name: 'أستاذ رامي فتحي', specialties: ['GRD'] });
      const c = await newCase(admin, {
        legal_area: 'GRD',
        title: 'الصرف من أموال القاصرين',
        text: 'عيالي قصر وليهم فلوس من ورث أبوهم في البنك والنيابة الحسبية مش راضية تصرف لي منها',
        facts_shared: 'أرملة لديها أبناء قصر، وأموالهم المودعة تحت إشراف النيابة الحسبية.',
        internal_notes: 'ملاحظة داخلية سرية: تفضل الاتصال بعد العصر',
        facts_internal: 'وقائع داخلية لا تُرسل',
        docs: ['قرار_الوصاية.pdf'],
      });
      t.app.ai.cancelTimers();
      await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة' });
      ok(await admin.post(`/api/admin/cases/${c.id}/info-requests`, { kind: 'document', question: 'شهادات ميلاد الأبناء', client_message: 'برجاء إرسال صور شهادات ميلاد الأبناء القصر.' }));

      const r = ok(await admin.post('/api/admin/ai/suggest-reply', { case_id: c.id, intent: 'ask_documents' }));
      assert.equal(r.intent, 'ask_documents');
      assert.equal(r.provider, 'heuristic');
      const all = r.suggestions.map((s) => s.text).join('\n');
      assert.match(all, new RegExp(c.code), 'replies reference the file code');
      assert.match(all, /شهادات ميلاد الأبناء القصر/, 'the staff-approved request sent to the client is reused');
      assert.match(all, /كشف حساب أموال القاصرين/, 'the GRD missing-info checklist is used');
      assert.doesNotMatch(all, /قرار الوصاية/, 'a document already in the file is not requested again');
      assert.doesNotMatch(all, /رامي/, 'no lawyer name');
      assert.doesNotMatch(all, /سرية|لا تُرسل/, 'no internal notes or internal facts');
      for (const s of r.suggestions) assert.ok(['formal', 'warm', 'brief'].includes(s.tone));
      assert.ok(r.grounded_on.some((g) => /مرسل/.test(g)));

      const ans = ok(await admin.post('/api/admin/ai/suggest-reply', { case_id: c.id }));
      assert.equal(ans.intent, 'answer');
      assert.doesNotMatch(ans.suggestions.map((s) => s.text).join('\n'), /رامي/);

      // تغذية راجعة: استخدام كما هو، ثم تعديل
      ok(await admin.post(`/api/admin/ai/suggestions/${r.id}/feedback`, { index: 0, action: 'used', final_text: r.suggestions[0].text }));
      let fb = t.app.db.get("SELECT * FROM ai_feedback WHERE field = 'reply' AND suggestion_id = ?", r.id);
      assert.equal(fb.verdict, 'accepted');
      assert.equal(fb.case_id, c.id);
      const res = ok(await admin.post(`/api/admin/ai/suggestions/${r.id}/feedback`, { index: 1, action: 'sent', final_text: 'نص مختلف تمامًا كتبه الموظف بنفسه دون الاعتماد على المقترح' }));
      assert.equal(res.verdict, 'corrected');
      fb = t.app.db.all("SELECT * FROM ai_feedback WHERE field = 'reply' AND suggestion_id = ?", r.id);
      assert.equal(fb.length, 1, 'one decision per suggestion set (latest wins)');
      assert.equal(fb[0].verdict, 'corrected');
      assert.equal((await admin.post(`/api/admin/ai/suggestions/${r.id}/feedback`, { index: 9 })).status, 400);
      assert.equal((await admin.post('/api/admin/ai/suggestions/99999/feedback', { index: 0 })).status, 404);
      const metrics = ok(await admin.get('/api/admin/ai/metrics'));
      assert.ok(metrics.fields.some((f) => f.field === 'reply' && f.label === 'الردود المقترحة على المستفيد'));
    });
  });

  test('schedule intent on a matter uses only the staff-approved appointment', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'FAM', title: 'نفقة صغار بعد وفاة الأب', text: 'جوزي اتوفى وجد العيال رافض يصرف عليهم' });
      t.app.ai.cancelTimers();
      const m = ok(await admin.post(`/api/admin/cases/${c.id}/matter`, { kind: 'litigation', court: 'محكمة الأسرة بمدينة نصر' }), 201);
      const mid = m.id ?? m.matter?.id;
      const when = new Date(Date.now() + 5 * 86400000).toISOString();
      ok(await admin.post(`/api/admin/matters/${mid}/events`, { kind: 'hearing', title: 'جلسة نظر دعوى نفقة الأقارب', starts_at: when, location: 'محكمة الأسرة بمدينة نصر', client_attendance_required: true }));
      const r = ok(await admin.post('/api/admin/ai/suggest-reply', { matter_id: mid, intent: 'schedule' }));
      const all = r.suggestions.map((s) => s.text).join('\n');
      assert.match(all, /جلسة نظر دعوى نفقة الأقارب/);
      assert.match(all, /يلزم حضوركم شخصيًا/);
      assert.match(all, /نوع الموعد: جلسة/);
    });
  });

  test('Claude replies: grounded context is sent, lawyer names are scrubbed after generation, feedback works', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { name: 'هاني عبد الرحمن' });
      const c = await newCase(admin, { legal_area: 'PEN', title: 'صرف معاش الأرملة', text: 'جوزي اتوفى وعايزة أصرف معاشه', internal_notes: 'سري جدا' });
      t.app.ai.cancelTimers();
      await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة' });
      enableClaude(t);
      fake.outputs.reply = { suggestions: [{ tone: 'warm', text: 'يتابع ملفكم الأستاذ هاني عبد الرحمن. — مؤسسة بيوت مصر' }, { tone: 'formal', text: 'تحية طيبة، ملفكم قيد الدراسة.' }] };
      const r = ok(await admin.post('/api/admin/ai/suggest-reply', { case_id: c.id, intent: 'reassure' }));
      assert.equal(r.provider, 'anthropic');
      assert.equal(r.suggestions.length, 2);
      assert.doesNotMatch(r.suggestions[0].text, /هاني/, 'lawyer names are removed even if the model writes them');
      assert.match(r.suggestions[0].text, /الفريق القانوني/);
      const call = fake.calls.find((x) => x.feature === 'reply');
      const sent = JSON.parse(call.params.messages[0].content);
      assert.equal(sent.intent, 'reassure');
      assert.equal(sent.reference, c.code);
      assert.ok(Array.isArray(sent.conversation) && sent.conversation.length >= 1);
      assert.equal(JSON.stringify(sent).includes('سري جدا'), false, 'internal notes are never sent to the model for client replies');
      assert.equal(JSON.stringify(sent).includes('هاني'), false, 'lawyer names are not part of the context');
      assert.equal(call.params.output_config.effort, 'low');
      const row = t.app.db.get("SELECT * FROM ai_usage WHERE feature = 'reply' AND provider = 'anthropic'");
      assert.equal(row.entity_type, 'case');
      // رد فارغ من النموذج ← المحلل المحلي
      fake.outputs.reply = { suggestions: [] };
      const r2 = ok(await admin.post('/api/admin/ai/suggest-reply', { case_id: c.id }));
      assert.equal(r2.provider, 'heuristic');
      assert.ok(r2.suggestions.length >= 2);
    });
  });
});

// ═════════════════════════ تحليل المستندات ═════════════════════════
describe('document analysis', () => {
  test('heuristic path: never sends the file when Claude is not configured; clear preliminary note; stored and listed', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'INH', docs: ['شهادة_الوفاة.pdf', 'عقد_إيجار_المحل.pdf'] });
      const [death, lease] = c.docs;
      const r = ok(await admin.post(`/api/admin/ai/documents/${death.id}/analyze`, {}), 201);
      assert.equal(r.provider, 'heuristic');
      assert.equal(r.heuristic, true);
      assert.equal(r.doc_type, 'death_certificate');
      assert.equal(r.doc_type_label, 'شهادة وفاة');
      assert.match(r.result.note, /تحليل مبدئي دون ذكاء اصطناعي/);
      assert.ok(r.result.missing_related.includes('إعلام الوراثة'));
      assert.equal(fake.loaderCalls === 0 || fake.calls.length === 0, true);
      assert.equal(fake.calls.length, 0, 'no document is sent to the AI without a configured integration');
      const r2 = ok(await admin.post(`/api/admin/ai/documents/${lease.id}/analyze`, {}), 201);
      assert.equal(r2.doc_type, 'lease_contract');
      const got = ok(await admin.get(`/api/admin/ai/documents/${death.id}`));
      assert.equal(got.analysis.id, r.id);
      assert.equal(got.document.id, death.id);
      const list = ok(await admin.get(`/api/admin/ai/documents?case_id=${c.id}`));
      assert.equal(list.items.length, 2);
      assert.equal(list.items[0].case_code, c.code);
      assert.equal(t.app.db.value('SELECT COUNT(*) FROM document_ai'), 2);
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE type = 'ai.document_analyzed' AND case_id = ?", c.id));
      assert.equal((await admin.post('/api/admin/ai/documents/99999/analyze', {})).status, 404);
      assert.equal((await admin.post('/api/admin/ai/documents/abc/analyze', {})).status, 400);
      const manager = await managerLogin(t);
      assert.equal((await manager.post(`/api/admin/ai/documents/${death.id}/analyze`, {})).status, 201);
    });
  });

  test('lawyers can analyse only documents granted to them (404 otherwise); output hides phone numbers', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['INH'] });
      const other = await createLawyer(admin, { specialties: ['INH'] });
      const c = await newCase(admin, { legal_area: 'INH', docs: ['إعلام_وراثة.pdf', 'بطاقة_رقم_قومي.pdf'] });
      const [granted, hidden] = c.docs;
      const a = await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة', grants: { facts: true, document_ids: [granted.id] } });
      void a;
      const lc = await t.login(lawyer.username);
      const oc = await t.login(other.username);
      assert.equal((await lc.post(`/api/lawyer/ai/documents/${hidden.id}/analyze`, {})).status, 404, 'not granted → 404');
      assert.equal((await lc.get(`/api/lawyer/ai/documents/${hidden.id}`)).status, 404);
      assert.equal((await oc.post(`/api/lawyer/ai/documents/${granted.id}/analyze`, {})).status, 404, 'another lawyer → 404');
      assert.equal((await lc.post(`/api/admin/ai/documents/${granted.id}/analyze`, {})).status, 403, 'lawyers cannot use the admin endpoint');

      enableClaude(t);
      const r = ok(await lc.post(`/api/lawyer/ai/documents/${granted.id}/analyze`, {}), 201);
      assert.equal(r.provider, 'anthropic');
      assert.equal(r.doc_type, 'inheritance_declaration');
      assertNoLeak(r, { keys: LAWYER_FORBIDDEN_KEYS, values: ['01012345678', c.phone] }, 'lawyer document analysis');
      assert.equal(r.created_by_name, undefined, 'staff identities are not exposed to lawyers');
      const call = fake.calls.find((x) => x.feature === 'document_analysis');
      const block = call.params.messages[0].content[0];
      assert.equal(block.type, 'document');
      assert.equal(block.source.type, 'base64');
      assert.equal(block.source.media_type, 'application/pdf');
      assert.ok(Buffer.from(block.source.data, 'base64').toString('latin1').startsWith('%PDF'));
      const text = call.params.messages[0].content[1].text;
      assert.equal(text.includes(c.phone), false, 'no client phone in the document prompt');
      const got = ok(await lc.get(`/api/lawyer/ai/documents/${granted.id}`));
      assert.equal(got.analysis.id, r.id);
      const staffView = ok(await admin.get(`/api/admin/ai/documents/${granted.id}`));
      assert.equal(staffView.analysis.created_by_role, 'lawyer');
      const phoneFact = staffView.analysis.result.key_facts.find((f) => f.label === 'هاتف');
      assert.equal(phoneFact.value, '[رقم هاتف]', 'phone numbers are never stored in analysis results');
    });
  });

  test('images are sent as image blocks; unsupported types fall back without contacting Claude', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'INH' });
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60000, 1)]);
      const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2000, 0)]);
      const up = ok(await admin.post(`/api/admin/cases/${c.id}/documents`, {
        files: [
          { filename: 'شهادة_ميلاد.png', mime: 'image/png', data_base64: png.toString('base64') },
          { filename: 'مذكرة.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data_base64: docx.toString('base64') },
        ],
      }));
      enableClaude(t);
      const img = ok(await admin.post(`/api/admin/ai/documents/${up[0].id}/analyze`, {}), 201);
      assert.equal(img.provider, 'anthropic');
      const call = fake.calls.find((x) => x.feature === 'document_analysis');
      assert.equal(call.params.messages[0].content[0].type, 'image');
      assert.equal(call.params.messages[0].content[0].source.media_type, 'image/png');
      const before = fake.calls.length;
      const w = ok(await admin.post(`/api/admin/ai/documents/${up[1].id}/analyze`, {}), 201);
      assert.equal(w.provider, 'heuristic');
      assert.match(w.result.fallback_reason, /غير مدعوم/);
      assert.match(w.result.note, /تحليل مبدئي دون ذكاء اصطناعي/);
      assert.equal(fake.calls.length, before, 'unsupported files are never sent');
    });
  });
});

// ═════════════════════════ الاسترشاد بالمعرفة المعتمدة (RAG) ═════════════════════════
describe('RAG drafting', () => {
  function insertKnowledge(db, { title, status, usage, answer }) {
    const t = new Date().toISOString();
    return db.insert('knowledge_records', {
      legal_area: 'INH',
      title,
      facts: 'توفي المورث وترك شقة ومحلًا، ويرفض أحد الورثة القسمة ويضع يده على المحل، ومن الورثة قاصرون.',
      issues: JSON.stringify(['تحديد الورثة وأنصبتهم', 'امتناع أحد الورثة عن القسمة']),
      final_answer: answer,
      status,
      usage,
      created_at: t,
      updated_at: t,
    });
  }

  test('draft context includes only approved anonymized records + granted document analyses, and cites them', async () => {
    await withApp(async (t) => {
      const { db } = t.app;
      const approved = insertKnowledge(db, { title: 'نزاع على تركة فيها شقة ومحل وقاصرون', status: 'approved', usage: 'knowledge', answer: 'APPROVED-MARKER: يرفع الورثة دعوى فرز وتجنيب.' });
      insertKnowledge(db, { title: 'نزاع على تركة فيها شقة ومحل وقاصرون (قيد المراجعة)', status: 'pending_review', usage: 'none', answer: 'PENDING-MARKER' });
      insertKnowledge(db, { title: 'نزاع على تركة فيها شقة ومحل وقاصرون (مستبعد)', status: 'excluded', usage: 'none', answer: 'EXCLUDED-MARKER' });
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['INH'] });
      const c = await newCase(admin, {
        legal_area: 'INH',
        title: 'نزاع على تركة فيها شقة ومحل',
        facts_shared: 'توفي المورث وترك شقة ومحلًا، ويرفض الأخ الأكبر القسمة ويضع يده على المحل، ومن الورثة قاصرون.',
        docs: ['شهادة_الوفاة.pdf', 'عقد_سري.pdf'],
      });
      t.app.ai.cancelTimers();
      const [death, secret] = c.docs;
      ok(await admin.post(`/api/admin/ai/documents/${death.id}/analyze`, {}), 201);
      ok(await admin.post(`/api/admin/ai/documents/${secret.id}/analyze`, {}), 201);
      const a = await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة', grants: { facts: true, document_ids: [death.id] } });
      const lc = await t.login(lawyer.username);

      // بدون Claude: المسودة المحلية كما هي (بلا استشهاد)
      const local = ok(await lc.post(`/api/lawyer/assignments/${a.id}/ai/draft`, {}));
      assert.equal(local.provider, 'heuristic');
      assert.equal(local.text.includes('استُرشد بـ'), false);

      enableClaude(t);
      const ref = `KR-${String(approved).padStart(5, '0')}`;
      fake.outputs.draft = { text: 'مسودة آلية تحتاج مراجعة.\nأولًا: الوقائع…', used_sources: [ref, 'KR-99999'] };
      const d = ok(await lc.post(`/api/lawyer/assignments/${a.id}/ai/draft`, {}));
      assert.equal(d.provider, 'anthropic');
      assert.match(d.text, new RegExp(`استُرشد بـ: ${ref}$`), 'the draft cites the approved record it used');
      assert.equal(d.text.includes('KR-99999'), false, 'unknown references are dropped');
      assert.deepEqual(d.sources.map((s) => s.ref), [ref]);

      const call = fake.calls.find((x) => x.feature === 'draft');
      const ctx = JSON.parse(call.params.messages[0].content);
      const s = JSON.stringify(ctx);
      assert.ok(s.includes('APPROVED-MARKER'), 'approved knowledge is part of the context');
      assert.equal(s.includes('PENDING-MARKER'), false, 'pending records are never used');
      assert.equal(s.includes('EXCLUDED-MARKER'), false, 'excluded records are never used');
      assert.equal(ctx.approved_precedents[0].ref, ref);
      assert.equal(ctx.document_analyses.length, 1, 'only analyses of documents granted to this lawyer');
      assert.equal(ctx.document_analyses[0].type, 'شهادة وفاة');
      assert.equal(s.includes('عقد_سري'), false);
      assert.equal(s.includes(c.phone), false, 'no client phone in the lawyer draft context');
      for (const k of ['phone', 'national_id', 'internal_notes', 'facts_internal']) assert.equal(k in ctx, false);

      // النسخة الموجهة للمستفيد: المصادر للإدارة فقط ولا تدخل في نص الرسالة
      fake.outputs.client_version = { text: 'نص الرسالة للمستفيدة' };
      const op = t.app.db.get("SELECT id FROM opinions WHERE case_id = ? LIMIT 1", c.id);
      if (op) {
        const cv = ok(await admin.post(`/api/admin/cases/${c.id}/ai/client-version`, { opinion_id: op.id }));
        assert.equal(cv.output.text.includes('KR-'), false);
      }
    });
  });

  test('client version context includes approved precedents and the case document analyses; citation kept out of the client text', async () => {
    await withApp(async (t) => {
      const { db } = t.app;
      const approved = insertKnowledge(db, { title: 'نزاع على تركة فيها شقة ومحل وقاصرون', status: 'approved', usage: 'knowledge_training', answer: 'APPROVED-CV-MARKER' });
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['INH'] });
      const c = await newCase(admin, { legal_area: 'INH', title: 'نزاع على تركة فيها شقة ومحل', facts_shared: 'توفي المورث وترك شقة ومحلًا ويرفض أحد الورثة القسمة.', docs: ['إعلام_وراثة.pdf'] });
      t.app.ai.cancelTimers();
      ok(await admin.post(`/api/admin/ai/documents/${c.docs[0].id}/analyze`, {}), 201);
      const a = await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة' });
      const lc = await t.login(lawyer.username);
      ok(await lc.post(`/api/lawyer/assignments/${a.id}/open`, {}));
      const sub = ok(await lc.post(`/api/lawyer/assignments/${a.id}/submit`, { body: 'الرأي القانوني المعتمد: يحق للورثة طلب القسمة قضائيًا.' }));
      ok(await admin.post(`/api/admin/opinions/${sub.id}/approve`, { quality_score: 4 }));
      enableClaude(t);
      fake.outputs.client_version = { text: 'تحية طيبة، نفيدكم بالخطوات التالية.' };
      const cv = ok(await admin.post(`/api/admin/cases/${c.id}/ai/client-version`, { opinion_id: sub.id }));
      assert.equal(cv.provider, 'anthropic');
      assert.equal(cv.output.text.includes('KR-'), false, 'no knowledge references inside the client message');
      assert.equal(cv.output.rag_note, `استُرشد بـ: KR-${String(approved).padStart(5, '0')}`);
      const call = fake.calls.find((x) => x.feature === 'client_version');
      const ctx = JSON.parse(call.params.messages[0].content);
      assert.ok(JSON.stringify(ctx).includes('APPROVED-CV-MARKER'));
      assert.equal(ctx.document_analyses[0].type, 'إعلام وراثة');
    });
  });
});

// ═════════════════════════ المجالات الجديدة ═════════════════════════
describe('new legal areas: GRD (guardianship over money) and PEN (pensions)', () => {
  const SAMPLES = [
    ['INH', 'توفي والدي وترك شقة ومحلًا تجاريًا، وأخي الأكبر يرفض قسمة التركة ويضع يده على المحل.'],
    ['INH', 'والدي توفى وساب شقة ومحل وأخويا الكبير رافض يقسم الميراث، وفيه قصر من ولاد أخويا المتوفى. عايزة أعرف نصيبي في التركة.'],
    // ميراث الأرملة
    ['INH', 'جوزي اتوفى وأهله عايزين يطردوني من الشقة ومش عايزين يدوني نصيبي في الورث'],
    // نفقة الأيتام على الجد
    ['FAM', 'جوزي الله يرحمه ساب لي 3 عيال، وجدهم أبو جوزي مقتدر ورافض يصرف عليهم. ينفع أرفع نفقة للأيتام على الجد؟'],
    // حضانة بعد وفاة الزوج
    ['FAM', 'جوزي اتوفى وحماتي عايزة تاخد مني حضانة العيال وبتقول إن الحضانة ليها'],
    // معاش الزوج المتوفى
    ['PEN', 'جوزي اتوفى من 4 شهور وكان شغال في شركة ومتأمن عليه، عايزة أعرف إزاي أصرف معاشه أنا والعيال'],
    ['PEN', 'أنا أرملة وعندي 3 أيتام ومعنديش دخل، عايزة أقدم على تكافل وكرامة ومش عارفة الورق المطلوب'],
    ['PEN', 'اتصلت تسأل عن حقها في معاش زوجها المتوفى وكيفية استخراج إعلام الوراثة.'],
    // النيابة الحسبية
    ['GRD', 'عيالي قصر وليهم فلوس من ورث أبوهم في البنك، والنيابة الحسبية مش راضية تصرف لي منها لمصاريف المدارس'],
    ['GRD', 'جوزي اتوفى وعايزة أبقى وصية على ولادي عشان أقدر أتصرف في نصيبهم من الشقة، وجدهم معترض'],
    ['LAB', 'أنا عامل في شركة مقاولات من 6 سنين والشركة فصلتني من غير أي سبب، ومش عايزين يدوني شهادة خبرة. مرتبي 5500 جنيه.'],
    ['FAM', 'طليقي رافض يدفع نفقة بنتي (4 سنين) وعايز يطردنا من شقة الزوجية اللي عايشين فيها، مع إني أنا الحاضنة.'],
  ];

  test('classifier samples for widows’ typical problems', () => {
    for (const [area, text] of SAMPLES) assert.equal(H.classify(text).area, area, `«${text}» → ${area}`);
    // «النيابة الحسبية» ليست مسألة جنائية
    assert.equal(H.classify(SAMPLES[8][1]).secondary.includes('CRM'), false);
  });

  test('missing-info checklists and issue suggestions for GRD and PEN', () => {
    const grd = H.analyzeIntake('عيالي قصر وليهم فلوس في البنك والنيابة الحسبية مش راضية تصرف');
    const items = grd.missing_info.map((m) => m.item).join(' | ');
    for (const needle of ['قرار الوصاية أو الولاية على المال', 'كشف حساب أموال القاصرين', 'شهادات ميلاد الأبناء']) assert.ok(items.includes(needle), needle);
    assert.ok(grd.suggested_issues.every((i) => i.legal_area === 'GRD'));
    assert.match(grd.title, /القاصرين/);

    const pen = H.analyzeIntake('جوزي اتوفى وعايزة أصرف معاشه');
    const pItems = pen.missing_info.map((m) => m.item).join(' | ');
    for (const needle of ['رقم المعاش', 'شهادة الوفاة', 'إعلام الوراثة']) assert.ok(pItems.includes(needle), needle);
    assert.match(pen.title, /معاش المتوفى/);
    const tk = H.analyzeIntake('أنا أرملة وعايزة أقدم على تكافل وكرامة');
    assert.ok(tk.missing_info.some((m) => /البحث الاجتماعي/.test(m.item)));
    assert.ok(tk.suggested_issues.some((i) => /تكافل وكرامة/.test(i.title)));
    assert.ok(H.suggestIssuesFor('INH', 'توفي ومعاش', ['PEN']).some((i) => i.legal_area === 'PEN'));
  });

  test('new areas are first-class: labels, case codes, lawyer specialties, AI schema', async () => {
    assert.ok(AREA_CODES.includes('GRD') && AREA_CODES.includes('PEN'));
    assert.equal(LEGAL_AREAS.find((a) => a.code === 'GRD').label, 'الولاية على المال والنيابة الحسبية');
    assert.equal(LEGAL_AREAS.find((a) => a.code === 'PEN').label, 'معاشات وتأمينات وتكافل وكرامة');
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'PEN', title: 'صرف معاش' });
      assert.match(c.code, /^PEN-\d{4}-00001$/);
      const g = await newCase(admin, { legal_area: 'GRD', title: 'أموال القصر' });
      assert.match(g.code, /^GRD-\d{4}-00001$/);
      const lawyer = await createLawyer(admin, { specialties: ['GRD', 'PEN'] });
      assert.ok(lawyer.id);
      const list = ok(await admin.get('/api/admin/cases?area=GRD'));
      assert.equal(list.total, 1);
    });
  });
});

// ═════════════════════════ إصلاحات المراجعة ═════════════════════════

/** يجعل إنفاق الشهر الحالي أكبر من السقف (دون استدعاء Claude) */
function exhaustBudget(t, limit = '1') {
  enableClaude(t, { monthly_budget_usd: limit });
  const now = new Date().toISOString();
  t.app.db.insert('ai_usage', { feature: 'draft', provider: 'anthropic', model: 'claude-opus-5-5', cost_micro_usd: 5_000_000, ok: 1, period: periodOf(now), created_at: now });
}

describe('review fixes', () => {
  test('Arabic-Indic digits: phone numbers are stripped from every stored field and national IDs are masked for lawyers', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['INH'] });
      const c = await newCase(admin, { legal_area: 'INH', docs: ['بطاقة_الرقم_القومي.pdf'] });
      t.app.ai.cancelTimers();
      const [doc] = c.docs;
      await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة', grants: { facts: true, document_ids: [doc.id] } });
      enableClaude(t);
      fake.outputs.document_analysis = {
        doc_type: 'national_id',
        confidence: 0.9,
        summary: 'بطاقة رقم قومي لصاحبة الطلب، وعلى ظهرها رقم هاتف ٠١٠١٢٣٤٥٦٧٨.',
        key_facts: [
          { kind: 'number', label: 'الرقم القومي', value: '٢٩٠٠١٠١٠١٢٣٤٥٦' },
          { kind: 'other', label: 'هاتف', value: '٠١١ ٢٢٣٣ ٤٤٥٥' },
          { kind: 'other', label: 'هاتف دولي', value: '+20 115 555 6677' },
          { kind: 'date', label: 'تاريخ الإصدار', value: '٢٠٢٣-٠٥-١٠' },
        ],
        proves: ['هوية صاحبة الطلب (للتواصل: 01099998888)'],
        red_flags: [{ kind: 'unverified', text: 'يُتحقق من سريان البطاقة' }],
        missing_related: [],
        legible: true,
      };
      const staff = ok(await admin.post(`/api/admin/ai/documents/${doc.id}/analyze`, {}), 201);
      const stored = t.app.db.value('SELECT result FROM document_ai WHERE id = ?', staff.id);
      for (const phone of ['٠١٠١٢٣٤٥٦٧٨', '01012345678', '٠١١', '01122334455', '1155556677', '01099998888']) {
        assert.equal(stored.includes(phone), false, `phone ${phone} must not be stored`);
      }
      assert.match(stored, /\[رقم هاتف\]/);
      const facts = Object.fromEntries(staff.result.key_facts.map((f) => [f.label, f.value]));
      assert.equal(facts['الرقم القومي'], '29001010123456', 'staff keep the national ID (normalized to Latin digits)');
      assert.equal(facts['تاريخ الإصدار'], '2023-05-10', 'dates survive the phone filter');

      const lc = await t.login(lawyer.username);
      const lv = ok(await lc.get(`/api/lawyer/ai/documents/${doc.id}`));
      const lj = JSON.stringify(lv);
      assert.equal(lj.includes('29001010123456') || lj.includes('٢٩٠٠١٠١٠١٢٣٤٥٦'), false, 'lawyers never see national IDs');
      assert.match(lj, /\[رقم قومي مخفي\]/);
    });
  });

  test('size limits follow the API (base64 inflation): oversized images/PDFs are never sent', async () => {
    const small = Buffer.alloc(AI_MAX_IMAGE_BYTES, 1);
    const big = Buffer.alloc(AI_MAX_IMAGE_BYTES + 1, 1);
    assert.equal(documentBlockFor({ mime: 'image/png', buffer: small }).block.type, 'image');
    assert.ok(Buffer.from(documentBlockFor({ mime: 'image/png', buffer: small }).block.source.data).length <= 5 * 1024 * 1024, 'encoded image ≤ 5 MB');
    const r = documentBlockFor({ mime: 'image/jpeg', buffer: big });
    assert.equal(r.block, null);
    assert.match(r.reason, /حجم الملف أكبر من الحد المسموح للتحليل الآلي/);
    assert.ok(Math.ceil((AI_MAX_PDF_BYTES * 4) / 3) < 32 * 1024 * 1024, 'encoded PDF fits in a 32 MB request');
    assert.equal(documentBlockFor({ mime: 'application/pdf', buffer: Buffer.alloc(AI_MAX_PDF_BYTES + 1) }).block, null);
    assert.match(documentBlockFor({ mime: 'application/msword', buffer: Buffer.alloc(10) }).reason, /نوع الملف غير مدعوم/);

    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'INH' });
      t.app.ai.cancelTimers();
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(AI_MAX_IMAGE_BYTES, 7)]);
      const id = t.app.documents.save({ filename: 'صورة_إعلام_الوراثة.png', mime: 'image/png', buffer: png }, { case_id: c.id, client_id: c.client_id }, null);
      enableClaude(t);
      const a = ok(await admin.post(`/api/admin/ai/documents/${id}/analyze`, {}), 201);
      assert.equal(a.provider, 'heuristic');
      assert.equal(a.doc_type, 'inheritance_declaration');
      assert.match(a.result.fallback_reason, /حجم الملف أكبر/);
      assert.equal(fake.calls.filter((x) => x.feature === 'document_analysis').length, 0, 'the oversized image is not sent');
    });
  });

  test('lawyers never see the AI budget or key status in fallback reasons (staff keep the details)', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const lawyer = await createLawyer(admin, { specialties: ['INH'] });
      const c = await newCase(admin, { legal_area: 'INH', title: 'نزاع على تركة', docs: ['إعلام_وراثة.pdf'] });
      t.app.ai.cancelTimers();
      const [doc] = c.docs;
      const a = await assign(admin, c.id, { lawyer_id: lawyer.id, role: 'lead', brief: 'دراسة', grants: { facts: true, document_ids: [doc.id] } });
      exhaustBudget(t);
      const lc = await t.login(lawyer.username);
      const d = ok(await lc.post(`/api/lawyer/assignments/${a.id}/ai/draft`, {}));
      assert.equal(d.provider, 'heuristic');
      assert.ok(d.fallback_reason, 'the lawyer is told the assistant was unavailable');
      assert.doesNotMatch(d.fallback_reason, /دولار|السقف|الإنفاق|مفتاح/);
      const an = ok(await lc.post(`/api/lawyer/ai/documents/${doc.id}/analyze`, {}), 201);
      assert.equal(an.provider, 'heuristic');
      assert.doesNotMatch(JSON.stringify(an), /دولار|السقف|الإنفاق/);
      // الإدارة ترى السبب التفصيلي في التحليل وفي سجل الاستهلاك
      const sv = ok(await admin.get(`/api/admin/ai/documents/${doc.id}`));
      assert.match(sv.analysis.result.fallback_reason, /السقف/);
      assert.ok(t.app.db.get("SELECT 1 FROM ai_usage WHERE feature = 'draft' AND fallback = 1 AND fallback_reason LIKE '%السقف%'"));
      assert.equal(fake.calls.length, 0, 'nothing reaches Claude over budget');
    });
  });

  test('reply context skips outbound messages that failed to send', async () => {
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const c = await newCase(admin, { legal_area: 'PEN', title: 'صرف معاش', text: 'جوزي اتوفى وعايزة أصرف معاشه' });
      t.app.ai.cancelTimers();
      const now = new Date().toISOString();
      t.app.db.insert('messages', { case_id: c.id, client_id: c.client_id, direction: 'out', channel: 'whatsapp', body: 'FAILED-MARKER لم تصل', status: 'failed', created_at: now });
      t.app.db.insert('messages', { case_id: c.id, client_id: c.client_id, direction: 'out', channel: 'whatsapp', body: 'SENT-MARKER وصلت', status: 'sent', created_at: now });
      enableClaude(t);
      ok(await admin.post('/api/admin/ai/suggest-reply', { case_id: c.id }));
      const sent = JSON.stringify(JSON.parse(fake.calls.find((x) => x.feature === 'reply').params.messages[0].content));
      assert.equal(sent.includes('FAILED-MARKER'), false);
      assert.equal(sent.includes('SENT-MARKER'), true);
    });
  });

  test('heuristic wording: appointment reminders read naturally; closed files are not promised a follow-up; no «عميل»', async () => {
    const base = { kind: 'matter', code: 'MAT-2026-00001', org_name: 'مؤسسة بيوت مصر', missing: [], pending_requests: [] };
    for (const kind_label of ['جلسة', 'موعد إجرائي', 'موعد']) {
      const out = H.suggestReplies({ ...base, intent: 'schedule', next_event: { kind_label, title: 'تقديم المستندات', date: 'الأحد 11 أكتوبر 2026', time: '10:00 ص', location: 'مكتب التأمينات', attendance: true } });
      const all = out.map((s) => s.text).join('\n');
      assert.equal(out.length, 3);
      assert.doesNotMatch(all, /موعد موعد|بموعد جلسة|موعد اجتماع/, 'no doubled or mismatched «موعد»');
      assert.match(all, new RegExp(`نوع الموعد: ${kind_label}`));
      assert.match(all, /يلزم حضوركم شخصيًا/);
    }
    for (const intent of ['answer', 'reassure']) {
      const out = H.suggestReplies({ ...base, kind: 'case', code: 'INH-2026-00009', intent, status_phrase: 'مغلق', closed: true });
      const all = out.map((s) => s.text).join('\n');
      assert.ok(out.length >= 2);
      assert.doesNotMatch(all, /فور اكتمال دراسته|سنتواصل معكم قريبًا|محل اهتمام ومتابعة/, `${intent}: closed files are not promised a follow-up`);
    }
    const formal = H.suggestReplies({ ...base, kind: 'case', intent: 'ask_documents', missing: [{ item: 'صورة شهادة الوفاة', kind: 'document' }] })[0].text;
    assert.match(formal, /MAT-2026-00001، نرجو/);
    // طلب سابق معتمد بصيغة جملة كاملة: لا يتكرر فعل الطلب، ولا يتكرر المستند من قائمة النواقص
    const pendingCtx = {
      ...base,
      kind: 'case',
      status_phrase: 'قيد الدراسة',
      pending_requests: [{ kind: 'document', question: 'برجاء إرسال صورة إعلام الوراثة إن كان قد صدر.' }],
      missing: [{ item: 'صورة إعلام الوراثة (إن كان قد صدر)', kind: 'document' }, { item: 'صورة شهادة الوفاة', kind: 'document' }],
    };
    const ask = H.suggestReplies({ ...pendingCtx, intent: 'ask_documents' }).map((s) => s.text).join('\n');
    assert.doesNotMatch(ask, /(برجاء|نرجو)[^\n]{0,20}(برجاء|نرجو) إرسال/, 'no doubled request verb');
    assert.equal((ask.match(/إعلام الوراثة/g) || []).length <= 3, true);
    assert.doesNotMatch(ask.split('\n').filter((l) => l.startsWith('•')).join('\n'), /\(إن كان قد صدر\)/, 'the duplicate checklist item is dropped');
    const ans = H.suggestReplies({ ...pendingCtx, intent: 'answer' }).map((s) => s.text).join('\n');
    assert.doesNotMatch(ans, /إفادتنا عن: برجاء|\.\./);
    assert.equal(H.asItem('نرجو إفادتنا بعدد الأبناء.'), 'عدد الأبناء');
    assert.equal(H.asItem('هل تم تقديم تظلم؟'), 'هل تم تقديم تظلم؟');
    const cv = H.clientVersion({ caseCode: 'INH-2026-00001', opinion: 'الرأي', orgName: 'مؤسسة بيوت مصر' });
    assert.doesNotMatch(cv, /عميل/);
    assert.match(cv, /برنامج الدعم القانوني — مؤسسة بيوت مصر/);
  });

  test('AI security events are labelled for the audit page', async () => {
    assert.equal(LABELS.security_event['ai.budget_exceeded'], 'تجاوز إنفاق الذكاء الاصطناعي السقف الشهري');
    assert.equal(LABELS.security_event['ai.connection_test'], 'اختبار الاتصال بخدمة Claude');
    await withApp(async (t) => {
      const admin = await t.login('admin');
      const meta = ok(await admin.get('/api/meta'));
      assert.equal(meta.constants.LABELS.security_event['ai.budget_exceeded'], 'تجاوز إنفاق الذكاء الاصطناعي السقف الشهري');
    });
  });
});
