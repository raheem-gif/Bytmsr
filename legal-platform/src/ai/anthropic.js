// مزود Claude عبر حزمة Anthropic الرسمية (@anthropic-ai/sdk) — اعتمادية اختيارية تُحمَّل فقط عند ضبط المفتاح.
// عند أي تعذر (غياب الحزمة، خطأ شبكة، رفض) يعود النظام تلقائيًا إلى المحلل المحلي دون إيقاف العمل.
import { AREA_CODES } from '../constants.js';

export class AiUnavailable extends Error {}

let sdkPromise = null;
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import('@anthropic-ai/sdk').then((m) => m.default || m).catch(() => null);
  }
  return sdkPromise;
}

const SYSTEM_BASE = `أنت مساعد قانوني داخلي لدى مؤسسة «بيوت مصر» التي تقدم خدمات قانونية للمواطنين في مصر.
تعمل لصالح الإدارة والمحامين فقط، ولا تخاطب العملاء مباشرة إلا عند طلب صياغة نسخة موجهة للعميل.
اكتب بالعربية الفصحى الواضحة. لا تخترع وقائع غير موجودة في النص، ولا تذكر أرقام مواد أو قوانين إلا إذا كنت متأكدًا تمامًا منها؛
وعند عدم التأكد اكتب «يحدد المحامي النص القانوني الحاكم». القرار النهائي دائمًا للإدارة والمحامي.`;

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'عنوان قصير ومحدد للحالة (حتى 12 كلمة)' },
    summary: { type: 'string', description: 'ملخص محايد للوقائع في 2-4 جمل' },
    legal_area: { type: 'string', enum: AREA_CODES },
    confidence: { type: 'number' },
    secondary_areas: { type: 'array', items: { type: 'string', enum: AREA_CODES } },
    facts: { type: 'array', items: { type: 'string' } },
    missing_info: {
      type: 'array',
      items: {
        type: 'object',
        properties: { item: { type: 'string' }, kind: { type: 'string', enum: ['information', 'document'] } },
        required: ['item', 'kind'],
        additionalProperties: false,
      },
    },
    information_sufficient: { type: 'boolean' },
    suggested_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          details: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          legal_area: { type: 'string', enum: AREA_CODES },
        },
        required: ['title', 'details', 'legal_area'],
        additionalProperties: false,
      },
    },
    urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
    specialist_hint: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'title', 'summary', 'legal_area', 'confidence', 'secondary_areas', 'facts', 'missing_info',
    'information_sufficient', 'suggested_issues', 'urgency', 'specialist_hint',
  ],
  additionalProperties: false,
};

const ISSUES_SCHEMA = {
  type: 'object',
  properties: { issues: ANALYSIS_SCHEMA.properties.suggested_issues },
  required: ['issues'],
  additionalProperties: false,
};

const TEXT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
};

export function createAnthropicProvider({ apiKey, model, effort = 'medium', log }) {
  let client = null;

  async function getClient() {
    if (client) return client;
    const Anthropic = await loadSdk();
    if (!Anthropic) throw new AiUnavailable('حزمة @anthropic-ai/sdk غير مثبتة (npm install)');
    client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 });
    return client;
  }

  async function structured({ system, prompt, schema, maxTokens = 16000 }) {
    const c = await getClient();
    const Anthropic = await loadSdk();
    let response;
    try {
      response = await c.beta.messages.create({
        model,
        max_tokens: maxTokens,
        // عند رفض الطلب من مصنفات الأمان يُعاد تشغيله تلقائيًا على النموذج البديل الموصى به
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: `${SYSTEM_BASE}\n\n${system}`,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort, format: { type: 'json_schema', schema } },
      });
    } catch (e) {
      if (Anthropic && e instanceof Anthropic.AuthenticationError) throw new AiUnavailable('مفتاح Claude غير صالح');
      if (Anthropic && e instanceof Anthropic.RateLimitError) throw new AiUnavailable('تم تجاوز حد الاستخدام مؤقتًا');
      if (Anthropic && e instanceof Anthropic.APIError) throw new AiUnavailable(`خطأ من خدمة Claude (${e.status ?? 'اتصال'})`);
      throw new AiUnavailable('تعذر الاتصال بخدمة Claude');
    }
    if (response.stop_reason === 'refusal') throw new AiUnavailable('اعتذر النموذج عن معالجة هذا الطلب');
    if (response.stop_reason === 'max_tokens') throw new AiUnavailable('تجاوز الرد الحد الأقصى للطول');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return { data: JSON.parse(text), model: response.model || model };
    } catch {
      log?.('anthropic: invalid JSON output');
      throw new AiUnavailable('رد غير صالح من النموذج');
    }
  }

  return {
    name: 'anthropic',
    model,

    async analyzeIntake(text, ctx = {}) {
      const { data, model: m } = await structured({
        system: `مهمتك فرز طلب وارد من مواطن (عبر واتساب أو الموقع) قبل أن تقرر الإدارة ما إذا كان يستحق فتح ملف.
المجالات: ${AREA_CODES.join(', ')} (INH مواريث، FAM أحوال شخصية، PRP عقارات وإيجارات، CIV مدني وعقود، LAB عمل، CRM جنائي، COM تجاري وشركات، TAX ضرائب، ADM إداري، GEN أخرى).
- missing_info: المعلومات والمستندات التي يحتاجها المحامي ولم ترد في الرسائل (kind=document للمستندات).
- information_sufficient = true فقط إذا كانت الوقائع كافية لإبداء رأي مبدئي.
- secondary_areas: مجالات أخرى قد تستدعي رأي متخصص (مثل الأثر الضريبي في تركة).
- confidence بين 0 و 1.`,
        prompt: `المحافظة المعروفة: ${ctx.governorate || 'غير معروفة'}\n\nرسائل صاحب الطلب:\n"""\n${text}\n"""`,
        schema: ANALYSIS_SCHEMA,
      });
      return { ...data, _model: m };
    },

    async suggestIssues({ title, facts, area }) {
      const { data, model: m } = await structured({
        system: 'اقترح المسائل القانونية التي يجب على المحامي بحثها في هذا الملف، مرتبة حسب الأهمية، بحد أقصى 7 مسائل.',
        prompt: `عنوان الملف: ${title}\nالمجال: ${area}\n\nالوقائع:\n"""\n${facts}\n"""`,
        schema: ISSUES_SCHEMA,
      });
      return { issues: data.issues, _model: m };
    },

    async draftOpinion({ title, area, facts, brief, issues, missing, similar }) {
      const { data, model: m } = await structured({
        system: `اكتب مسودة أولية منظمة لرأي قانوني يستكمله المحامي. ابدأ بسطر يوضح أنها مسودة آلية تحتاج مراجعة.
الأقسام: الوقائع، المسائل، التحليل، الرأي والتوصيات، المستندات المطلوب استيفاؤها.
اعتمد فقط على المعلومات المتاحة أدناه (هي كل ما أتاحته الإدارة لهذا المحامي).`,
        prompt: JSON.stringify({ title, area, brief, facts, issues, missing, similar_cases_anonymized: similar }, null, 2),
        schema: TEXT_SCHEMA,
      });
      return { text: data.text, _model: m };
    },

    async clientVersion({ clientName, caseCode, opinion }) {
      const { data, model: m } = await structured({
        system: `أعد صياغة الرأي القانوني المعتمد في رسالة موجهة للعميل باسم «بيوت مصر»: لغة بسيطة ومهذبة، خطوات عملية واضحة،
بدون مصطلحات معقدة، وبدون أي ملاحظات داخلية أو أسماء المحامين. اختم بأن الإفادة مبنية على المعلومات المقدمة وبدعوة للتواصل.`,
        prompt: `اسم العميل: ${clientName || 'غير متاح'}\nرقم الملف: ${caseCode}\n\nالرأي المعتمد:\n"""\n${opinion}\n"""`,
        schema: TEXT_SCHEMA,
      });
      return { text: data.text, _model: m };
    },
  };
}
