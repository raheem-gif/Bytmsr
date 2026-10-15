// v12 media (D6): تحويل رسائل العملاء الصوتية إلى نص آلي — مسودة يراجعها الفريق ولا تصل لمحامٍ أو عميل أو شركة (L12-18).
// لا اعتماديات: fetch / FormData / Blob في Node 22. المزوّدون: خدمة متوافقة مع OpenAI (OpenAI أو Groq أو خادم Whisper
// خاص بالمكتب) أو Google Speech-to-Text، أو متوقف (الافتراضي). الإعدادات من «التكاملات ← تحويل الرسائل الصوتية إلى نص»
// (INTEGRATION_SPEC.stt، المفتاح مشفر ولا يُعاد للواجهة).
//
// MD-6: المحوّلان (OpenAI-compatible وGoogle)، فحص عنوان الخدمة قبل كل اتصال (SSRF، L12-71)، إعادة المحاولة فقط لـ 429/503
// أو خطأ شبكة قبل الإرسال (L12-69)، ووحدة الطابور: صوت العميل فقط، الجهة الخارجية لطلبات الأفراد والشركات إلا بإذن «خيري»
// وللرسائل بعد إعلان الخصوصية (L12-62)، المدة المحسوبة وحد الدقائق اليومي لكل شخص والميزانية (L12-71).
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { nowIso, periodOf, cairoDayKey, ApiError, badRequest } from '../util.js';

export const STT_PROVIDERS = ['off', 'openai_compatible', 'google'];
export const STT_HOSTING = { third_party: 'جهة خارجية', own_server: 'خادم المكتب' };

/** التوجيه الافتراضي للنموذج (M §4.2، قابل للتعديل من بطاقة التكامل) */
export const STT_DEFAULT_PROMPT =
  'رسالة صوتية باللهجة المصرية من شخص يطلب مساعدة قانونية من مكتب محاماة: ميراث، معاش، نفقة، حضانة، إيجار، عمل، عقود، شركات. اكتب الكلام كما قيل دون تصحيح أو تلخيص.';

/** قوالب جاهزة لبطاقة التكامل (تملأ الحقول فقط؛ لا تُخزَّن) */
export const STT_PRESETS = [
  { id: 'openai', label: 'OpenAI', provider: 'openai_compatible', base_url: 'https://api.openai.com', model: 'gpt-4o-transcribe', hosting: 'third_party', vendor_name: 'OpenAI', price_per_minute_usd: '0.006' },
  { id: 'groq', label: 'Groq', provider: 'openai_compatible', base_url: 'https://api.groq.com/openai', model: 'whisper-large-v3', hosting: 'third_party', vendor_name: 'Groq', price_per_minute_usd: '0.00185' },
  { id: 'own_whisper', label: 'خادم Whisper خاص بالمكتب', provider: 'openai_compatible', base_url: 'http://127.0.0.1:8000', model: 'Systran/faster-whisper-large-v3', hosting: 'own_server', vendor_name: '', price_per_minute_usd: '0' },
  { id: 'google', label: 'Google Speech-to-Text', provider: 'google', base_url: '', model: '', hosting: 'third_party', vendor_name: 'Google', price_per_minute_usd: '0.016' },
];

/** سبب عدم التحويل كما يظهر للفريق: «لم يُحوَّل آليًا: {السبب}» (MD-8) */
export const STT_REASONS = {
  off: 'التحويل متوقف',
  not_client: 'ليست رسالة من العميل',
  mime: 'صيغة الصوت غير مدعومة',
  too_big: 'الملف أكبر من الحد المسموح',
  charity: 'طلب «خيري» لا يُرسل صوته إلى جهة خارجية',
  before_disclosure: 'وصلت هذه الرسالة قبل إعلان تحويل الصوت في سياسة الخصوصية.',
  too_long: 'الرسالة أطول من الحد المسموح',
  client_cap: 'بلغ صاحب الرسالة حد الدقائق اليومي',
  budget: 'بلغ إنفاق التحويل الحد الشهري',
  auth: 'رفض المزوّد المفتاح',
  timeout: 'انتهت المهلة دون رد',
  network: 'تعذر الاتصال بالمزوّد',
  http: 'رفض المزوّد الطلب',
  blocked_host: 'عنوان الخدمة غير مسموح',
  missing_file: 'ملف الرسالة غير موجود',
  gone: 'ملف الرسالة غير موجود',
  crashed: 'توقف التحويل أثناء التشغيل',
};
export const sttReason = (code) => STT_REASONS[code] || 'تعذر التحويل';

/** رسالة الخطأ عند حفظ مزوّد خارجي بلا اسم أو بلا تأكيد شروطه (§10.2) */
export const STT_VENDOR_REQUIRED = 'اكتب اسم المزوّد وأكّد شروطه قبل الحفظ.';

/** خطأ تحويل: code ∈ auth | http | network | timeout | too_long | too_big | budget | off | blocked_host | not_implemented */
export class SttError extends Error {
  constructor(code, message = code, { retryable = false, status = null, billed = false } = {}) {
    super(message);
    this.name = 'SttError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.billed = billed;
  }
}

const TRUE_RE = /^(?:yes|true|1|on)$/i;
const URL_RE = /(?:https?:\/\/|www\.)/i;

/**
 * Ogg/Opus (رسائل واتساب): القنوات ومعدل الإدخال والمدة بالثواني = (موضع آخر صفحة − pre-skip) / 48000، أو null.
 */
export function oggOpusInfo(buf) {
  if (!buf || buf.length < 47 || buf.toString('latin1', 0, 4) !== 'OggS') return null;
  const segs = buf[26];
  const dataAt = 27 + segs;
  if (buf.length < dataAt + 19 || buf.toString('latin1', dataAt, dataAt + 8) !== 'OpusHead') return null;
  const channels = buf[dataAt + 9];
  const preSkip = buf.readUInt16LE(dataAt + 10);
  const inputRate = buf.readUInt32LE(dataAt + 12);
  let granule = null;
  const from = Math.max(0, buf.length - 64 * 1024);
  for (let i = buf.length - 27; i >= from; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      const lo = buf.readUInt32LE(i + 6);
      const hi = buf.readUInt32LE(i + 10);
      if (hi === 0xffffffff) continue;
      granule = hi * 2 ** 32 + lo;
      break;
    }
  }
  const seconds = granule && granule > preSkip ? Math.round(((granule - preSkip) / 48000) * 10) / 10 : null;
  return { channels, inputRate, preSkip, seconds };
}

// ───────── فحص عنوان الخدمة قبل كل اتصال (L12-71) ─────────
const GOOGLE_BASE = 'https://speech.googleapis.com';
const TEST_CLIP = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'seed-assets', 'stt-test.ogg');
/** أنواع الصوت المقبولة للتحويل وأقصى حجم (M12-07) */
export const STT_MIMES = new Set(['audio/ogg', 'audio/webm', 'audio/mpeg', 'audio/mp4']);
export const STT_MAX_BYTES = 25 * 1024 * 1024;
/** Google المتزامن ≤ 59 ثانية (MD-L6) */
export const GOOGLE_MAX_SECONDS = 59;
let timeoutMs = 90_000;
let fetchImpl = (url, init) => fetch(url, init);
/** للاختبارات: بديل لـ fetch (null = الحقيقي) ومهلة أقصر */
export function setFetch(fn) {
  fetchImpl = typeof fn === 'function' ? fn : (url, init) => fetch(url, init);
}
export function setTimeoutMs(ms) {
  timeoutMs = Number(ms) > 0 ? Number(ms) : 90_000;
}
const PRE_SEND = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'ECONNABORTED']);

function v4num(ip) {
  return ip.split('.').reduce((a, b) => a * 256 + Number(b), 0);
}
const inV4 = (ip, cidr) => {
  const [base, bits] = cidr.split('/');
  const mask = bits === '0' ? 0 : (0xffffffff << (32 - Number(bits))) >>> 0;
  return ((v4num(ip) & mask) >>> 0) === ((v4num(base) & mask) >>> 0);
};
/** عنوان IPv6 ← 8 أعداد (16 بت)، ويقبل ذيل IPv4 (::ffff:1.2.3.4) واختصار «::»؛ غير صالح ← null */
function v6words(a) {
  let s = String(a || '').toLowerCase().split('%')[0];
  const dotted = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (dotted) {
    if (!net.isIPv4(dotted[1])) return null;
    const n = v4num(dotted[1]);
    s = `${s.slice(0, -dotted[1].length)}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const part = (x) => (x ? x.split(':') : []);
  const head = part(halves[0]);
  const tail = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const words = [...head, ...Array(fill).fill('0'), ...tail].map((w) => (/^[0-9a-f]{1,4}$/.test(w) ? parseInt(w, 16) : NaN));
  return words.length === 8 && words.every((w) => Number.isInteger(w)) ? words : null;
}
const v4of = (hi, lo) => [hi >>> 8, hi & 0xff, lo >>> 8, lo & 0xff].join('.');
/**
 * تصنيف عنوان IP: 'metadata' (ممنوع دائمًا: بيانات السحابة، غير المحدد، البث والمتعدد) | 'loopback' | 'private' | 'public'.
 * عناوين IPv6 التي تحمل IPv4 (‎::ffff:a9fe:a9fe‎، ‎::a.b.c.d‎، NAT64 ‎64:ff9b::/96‎، ‎6to4 2002::/16‎) تُصنَّف بعنوانها الداخلي،
 * فلا يمر ‎[::ffff:169.254.169.254]‎ (يكتبه URL بالصيغة الست عشرية) على أنه «عام» (مراجعة 12.0).
 */
export function classifyIp(ip) {
  const a = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(a)) {
    if (inV4(a, '169.254.0.0/16') || inV4(a, '0.0.0.0/8') || a === '100.100.100.200' || a === '192.0.0.192') return 'metadata';
    if (inV4(a, '224.0.0.0/4') || inV4(a, '240.0.0.0/4')) return 'metadata'; // متعدد، محجوز، 255.255.255.255
    if (inV4(a, '127.0.0.0/8')) return 'loopback';
    if (inV4(a, '10.0.0.0/8') || inV4(a, '172.16.0.0/12') || inV4(a, '192.168.0.0/16') || inV4(a, '100.64.0.0/10') || inV4(a, '198.18.0.0/15') || inV4(a, '192.0.0.0/24')) return 'private';
    return 'public';
  }
  if (net.isIPv6(a)) {
    const w = v6words(a);
    if (!w) return 'metadata';
    const zeros = (n) => w.slice(0, n).every((x) => x === 0);
    if (zeros(8)) return 'metadata'; // ::
    if (zeros(7) && w[7] === 1) return 'loopback'; // ::1
    if (zeros(5) && w[5] === 0xffff) return classifyIp(v4of(w[6], w[7])); // ::ffff:a.b.c.d
    if (zeros(6)) return classifyIp(v4of(w[6], w[7])); // ::a.b.c.d (متوافق قديم)
    if (w[0] === 0x64 && w[1] === 0xff9b && (w[2] === 0 || w[2] === 1)) return classifyIp(v4of(w[6], w[7])); // NAT64
    if (w[0] === 0x2002) return classifyIp(v4of(w[1], w[2])); // 6to4
    if (w[0] === 0xfd00 && w[1] === 0x0ec2 && w.slice(2, 7).every((x) => x === 0) && w[7] === 0x254) return 'metadata'; // fd00:ec2::254
    if ((w[0] & 0xff00) === 0xff00) return 'metadata'; // متعدد
    if ((w[0] & 0xfe00) === 0xfc00 || (w[0] & 0xffc0) === 0xfe80 || (w[0] & 0xffc0) === 0xfec0) return 'private';
    return 'public';
  }
  return 'metadata';
}
let lookupImpl = (host) => dns.lookup(host, { all: true, verbatim: true });
/**
 * يُرفض العنوان إن حُل إلى عنوان بيانات السحابة (دائمًا)، أو إلى شبكة خاصة أو المضيف المحلي لجهة خارجية، أو إلى المضيف
 * المحلي دون STT_ALLOW_LOCAL=1 (حتى لخادم المكتب). → يرمي SttError('blocked_host')
 */
export async function assertHostAllowed(urlStr, { hosting = 'third_party', env = process.env } = {}) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new SttError('blocked_host', 'bad url');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try {
      addrs = await lookupImpl(host);
    } catch {
      throw new SttError('network', 'dns', { retryable: true });
    }
  }
  if (!addrs || !addrs.length) throw new SttError('network', 'dns', { retryable: true });
  const allowLocal = String(env.STT_ALLOW_LOCAL || '') === '1';
  for (const { address } of addrs) {
    const kind = classifyIp(address);
    if (kind === 'metadata') throw new SttError('blocked_host', 'blocked address');
    if (kind === 'loopback' && !allowLocal) throw new SttError('blocked_host', 'loopback');
    if (kind === 'private' && hosting !== 'own_server') throw new SttError('blocked_host', 'private address');
  }
}
/** للاختبارات: بديل لـ dns.lookup (null = الحقيقي) */
export function setLookup(fn) {
  lookupImpl = typeof fn === 'function' ? fn : (host) => dns.lookup(host, { all: true, verbatim: true });
}

/** تشغيل الطلب مرة، أو حتى 3 مرات لـ 429/503 أو خطأ شبكة قبل الإرسال (0.4 ثم 0.8 ثانية). المهلة لا تُعاد. */
async function withRetry(fn, { tries = 3, baseMs = 400 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      last = e;
      if (!e.retryable || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}

async function callFetch(url, init) {
  try {
    return await fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new SttError('timeout', 'timeout', { billed: true });
    const code = e?.cause?.code || e?.code;
    if (PRE_SEND.has(code)) throw new SttError('network', 'network', { retryable: true });
    // بعد إرسال الجسم (أو تحويل مرفوض): لا إعادة
    throw new SttError('network', 'network', { billed: false });
  }
}
function httpError(status) {
  if (status === 401 || status === 403) return new SttError('auth', `HTTP ${status}`, { status });
  if (status === 429 || status === 503) return new SttError('http', `HTTP ${status}`, { status, retryable: true });
  if (status === 413) return new SttError('too_big', `HTTP ${status}`, { status });
  return new SttError('http', `HTTP ${status}`, { status });
}
const googleLang = (l) => (/^[a-z]{2,3}$/.test(l) ? (l === 'ar' ? 'ar-EG' : l) : l);

export function createStt(app) {
  const num = (s, d) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : d;
  };

  /** الإعدادات الفعلية (البيئة أولًا ثم المحفوظ ثم الافتراضي) بأنواعها */
  function settingsOf(raw) {
    const r = raw || {};
    const provider = STT_PROVIDERS.includes(r.provider) ? r.provider : 'off';
    return {
      provider,
      baseUrl: String(r.base_url || '').trim().replace(/\/+$/, ''),
      apiKey: r.api_key || '',
      model: String(r.model || '').trim(),
      language: String(r.language || 'ar').trim() || 'ar',
      prompt: String(r.prompt || STT_DEFAULT_PROMPT),
      hosting: r.hosting === 'own_server' ? 'own_server' : 'third_party',
      vendorName: String(r.vendor_name || '').trim(),
      noTrainingAttested: TRUE_RE.test(String(r.no_training_attested || '')),
      pricePerMinute: Math.max(0, num(r.price_per_minute_usd, 0.006)),
      budgetUsd: Math.max(0, num(r.monthly_budget_usd, 10)),
      maxSeconds: Math.max(1, Math.min(3600, Math.round(num(r.max_seconds, 600)))),
    };
  }
  const isThirdPartyOf = (s) => s.provider !== 'off' && s.hosting !== 'own_server';

  const svc = {
    STT_PROVIDERS,
    STT_PRESETS,

    settings() {
      return settingsOf(app.integrations.get('stt'));
    },

    /** المزوّد مضبوط ويمكن الاتصال به (مع شروط الجهة الخارجية: اسم المزوّد والتأكيد) */
    configured() {
      const s = svc.settings();
      if (s.provider === 'off') return false;
      if (s.provider === 'google' && !s.apiKey) return false;
      if (s.provider === 'openai_compatible' && !s.baseUrl) return false;
      if (isThirdPartyOf(s) && (!s.apiKey || !s.vendorName || !s.noTrainingAttested)) return false;
      return true;
    },

    /** هل يُرسل الصوت إلى جهة خارج المكتب؟ (يحدد قيد «خيري» وفقرة الخصوصية، L12-62) */
    isThirdParty(s = svc.settings()) {
      return isThirdPartyOf(s);
    },

    /**
     * تحقق قبل حفظ التكامل (يستدعيه integrations.set): يطبّع القيم في next، ويمسح المفتاح المحفوظ عند تغيير المزوّد أو
     * العنوان (L12-71)، ويرفض الجهة الخارجية بلا اسم مزوّد وتأكيد شروطه (L12-62). → { thirdPartyStarted }
     * @param {{ before: object, next: object, patch: object, effective: (stored: object) => object }} p
     */
    checkSave({ before, next, patch, effective }) {
      if (next.no_training_attested !== undefined) {
        if (TRUE_RE.test(String(next.no_training_attested))) next.no_training_attested = 'yes';
        else delete next.no_training_attested;
      }
      for (const k of ['provider', 'hosting']) if (next[k] !== undefined) next[k] = String(next[k]).trim().toLowerCase();
      const after = settingsOf(effective(next));
      const prev = settingsOf(before);
      const rawAfter = effective(next);
      if (rawAfter.provider && !STT_PROVIDERS.includes(rawAfter.provider)) throw badRequest('مزوّد التحويل غير معروف');
      if (rawAfter.hosting && !STT_HOSTING[rawAfter.hosting]) throw badRequest('مكان التشغيل غير معروف');
      if (after.provider === 'openai_compatible') {
        let u = null;
        try {
          u = new URL(after.baseUrl);
        } catch {
          u = null;
        }
        if (!u || !/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) throw badRequest('عنوان الخدمة غير صالح', { fields: { base_url: 'عنوان الخدمة غير صالح' } });
        if (after.hosting !== 'own_server' && u.protocol !== 'https:') throw badRequest('عنوان الخدمة يجب أن يبدأ بـ https://', { fields: { base_url: 'عنوان الخدمة يجب أن يبدأ بـ https://' } });
      }
      if (after.vendorName.length > 60 || URL_RE.test(after.vendorName) || /[<>]/.test(after.vendorName)) throw badRequest('اسم المزوّد غير صالح', { fields: { vendor_name: 'اسم المزوّد غير صالح' } });
      if (after.model.length > 100 || (after.model && !/^[\w.:/-]+$/.test(after.model))) throw badRequest('اسم النموذج غير صالح', { fields: { model: 'اسم النموذج غير صالح' } });
      if (!/^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(after.language)) throw badRequest('رمز اللغة غير صالح', { fields: { language: 'رمز اللغة غير صالح' } });
      if (after.prompt.length > 1000) throw badRequest('توجيه النموذج أطول من 1000 حرف', { fields: { prompt: 'توجيه النموذج أطول من 1000 حرف' } });
      const numField = (key, label, min, max) => {
        if (rawAfter[key] === undefined || rawAfter[key] === '') return;
        const n = Number(rawAfter[key]);
        if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`قيمة «${label}» غير صالحة`, { fields: { [key]: `قيمة «${label}» غير صالحة` } });
      };
      numField('price_per_minute_usd', 'السعر لكل دقيقة (دولار)', 0, 10);
      numField('monthly_budget_usd', 'حد الإنفاق الشهري (دولار)', 0, 100000);
      numField('max_seconds', 'أقصى مدة للرسالة (ثانية)', 1, 3600);
      if (isThirdPartyOf(after) && (!after.vendorName || !after.noTrainingAttested)) {
        throw new ApiError(400, STT_VENDOR_REQUIRED, 'stt_vendor_required', { fields: { vendor_name: STT_VENDOR_REQUIRED } });
      }
      // تغيير المزوّد أو العنوان يمسح المفتاح المحفوظ (إلا إن أُرسل مفتاح جديد في الطلب نفسه)
      if ((prev.provider !== after.provider || prev.baseUrl !== after.baseUrl) && !('api_key' in (patch || {}))) delete next.api_key;
      return { thirdPartyStarted: !isThirdPartyOf(prev) && isThirdPartyOf(after) };
    },

    /** بعد الحفظ: إعلان المعالجة عند جهة خارجية يبدأ من الآن (لا تحويل لصوت أقدم، L12-62) */
    afterSave(result) {
      if (result?.thirdPartyStarted) app.settings.set('stt_third_party_since', nowIso());
    },

    /**
     * المدة التي تُحسب بها التكلفة والحدود (L12-71): الأكبر بين ما يعلنه المرسل، وما في الحاوية (Ogg)، والحجم / 2000.
     */
    estimateSeconds({ mime = '', buffer = null, seconds = null } = {}) {
      const vals = [];
      const claimed = Number(seconds);
      if (Number.isFinite(claimed) && claimed > 0) vals.push(claimed);
      if (buffer && /ogg/.test(String(mime))) {
        const info = oggOpusInfo(buffer);
        if (info?.seconds) vals.push(info.seconds);
      }
      if (buffer?.length) vals.push(buffer.length / 2000);
      return vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null;
    },

    /** إنفاق هذا الشهر على تحويل الصوت (كل محاولة محسوبة الكلفة) */
    budgetState() {
      const s = svc.settings();
      const period = periodOf(nowIso());
      const spentMicro = Number(app.db.value("SELECT COALESCE(SUM(cost_micro_usd), 0) FROM media_usage WHERE period = ? AND kind = 'stt'", period)) || 0;
      const spent = spentMicro / 1e6;
      const limit = s.budgetUsd;
      return { period, spent_usd: Math.round(spent * 10000) / 10000, limit_usd: limit, warning: limit > 0 && spent >= 0.8 * limit, exceeded: limit > 0 && spent >= limit };
    },

    /**
     * تحويل صوت إلى نص عند المزوّد المضبوط. → { text, confidence|null, language, model, provider, raw }
     * يرمي SttError { code: off | blocked_host | network | timeout | auth | http | too_long | too_big, retryable, billed }
     */
    async transcribe({ buffer, mime, filename = 'audio.ogg', seconds = null } = {}) {
      const s = svc.settings();
      if (s.provider === 'off' || !svc.configured()) throw new SttError('off', 'speech-to-text is off');
      if (!buffer || !buffer.length) throw new SttError('http', 'empty audio');
      if (buffer.length > STT_MAX_BYTES) throw new SttError('too_big', 'too big');
      const type = String(mime || 'audio/ogg').split(';')[0];
      if (s.provider === 'google') {
        if (seconds !== null && Number(seconds) > GOOGLE_MAX_SECONDS) throw new SttError('too_long', 'google sync limit');
        const base = process.env.STT_GOOGLE_BASE_URL || GOOGLE_BASE;
        await assertHostAllowed(base, { hosting: 'third_party' });
        const isOgg = /ogg/.test(type);
        const info = isOgg ? oggOpusInfo(buffer) : null;
        const config = {
          encoding: isOgg ? 'OGG_OPUS' : 'WEBM_OPUS',
          sampleRateHertz: isOgg ? ([8000, 12000, 16000, 24000, 48000].includes(info?.inputRate) ? info.inputRate : 16000) : 48000,
          languageCode: googleLang(s.language),
          enableAutomaticPunctuation: true,
        };
        if (s.model && !/^gpt-|whisper/i.test(s.model)) config.model = s.model;
        return withRetry(async () => {
          // المفتاح في الترويسة، لا في الرابط (L12-71)
          const res = await callFetch(`${base.replace(/\/+$/, '')}/v1/speech:recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
            body: JSON.stringify({ config, audio: { content: Buffer.from(buffer).toString('base64') } }),
          });
          const body = await res.text();
          if (!res.ok) throw httpError(res.status);
          let data;
          try {
            data = JSON.parse(body);
          } catch {
            throw new SttError('http', 'bad json', { billed: true });
          }
          const alts = (data.results || []).map((r) => r?.alternatives?.[0]).filter(Boolean);
          const confs = alts.map((a) => a.confidence).filter((c) => Number.isFinite(c));
          return {
            text: alts.map((a) => String(a.transcript || '')).join(' ').replace(/\s+/g, ' ').trim(),
            confidence: confs.length ? Math.round((confs.reduce((x, y) => x + y, 0) / confs.length) * 1000) / 1000 : null,
            language: config.languageCode,
            model: s.model || null,
            provider: 'google',
            raw: { results: alts.length },
          };
        });
      }
      // openai_compatible
      await assertHostAllowed(s.baseUrl, { hosting: s.hosting });
      const model = s.model || 'gpt-4o-transcribe';
      return withRetry(async () => {
        const fd = new FormData();
        fd.append('file', new Blob([buffer], { type }), String(filename || 'audio.ogg').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'audio.ogg');
        fd.append('model', model);
        if (s.language) fd.append('language', s.language.split('-')[0]);
        if (s.prompt) fd.append('prompt', s.prompt);
        fd.append('response_format', /^gpt-4o/.test(model) ? 'json' : 'verbose_json');
        const res = await callFetch(`${s.baseUrl}/v1/audio/transcriptions`, {
          method: 'POST',
          headers: s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {},
          body: fd,
        });
        const body = await res.text();
        if (!res.ok) throw httpError(res.status);
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          throw new SttError('http', 'bad json', { billed: true });
        }
        const segs = Array.isArray(data.segments) ? data.segments : [];
        const lp = segs.map((x) => Number(x?.avg_logprob)).filter((x) => Number.isFinite(x));
        return {
          text: String(data.text || '').replace(/\s+/g, ' ').trim(),
          confidence: lp.length ? Math.round(Math.exp(lp.reduce((a, b) => a + b, 0) / lp.length) * 1000) / 1000 : null,
          language: data.language || s.language,
          model,
          provider: 'openai_compatible',
          raw: segs.length ? { segments: segs.slice(0, 200).map((x) => ({ start: x.start, end: x.end, text: String(x.text || '').slice(0, 500), no_speech_prob: x.no_speech_prob ?? null })) } : null,
        };
      });
    },

    /**
     * اختبار الاتصال بمقطع صامت مرفق (1.2 ثانية). → { ok, status, code, latency_ms } فقط (L12-71)؛ ينجح بـ HTTP 200 وJSON.
     */
    async test() {
      const t0 = Date.now();
      const s = svc.settings();
      if (s.provider === 'off') return { ok: false, status: null, code: 'off', latency_ms: 0 };
      if (!svc.configured()) return { ok: false, status: null, code: 'not_configured', latency_ms: 0 };
      let buffer;
      try {
        buffer = fs.readFileSync(TEST_CLIP);
      } catch {
        return { ok: false, status: null, code: 'no_clip', latency_ms: 0 };
      }
      try {
        await svc.transcribe({ buffer, mime: 'audio/ogg', filename: 'stt-test.ogg', seconds: 1.2 });
        svc.recordUsage({ seconds: 1.2, ok: true, documentId: null, provider: s.provider, model: s.model || null });
        return { ok: true, status: 200, code: 'ok', latency_ms: Date.now() - t0 };
      } catch (e) {
        const code = e instanceof SttError ? e.code : 'network';
        if (e?.billed) svc.recordUsage({ seconds: 1.2, ok: false, error: code, documentId: null, provider: s.provider, model: s.model || null });
        return { ok: false, status: e?.status ?? null, code, latency_ms: Date.now() - t0 };
      }
    },

    /** صف استهلاك (كل محاولة محسوبة الكلفة، L12-71): التكلفة = الدقائق × السعر */
    recordUsage({ seconds, ok = true, error = null, documentId = null, provider, model = null }) {
      const s = svc.settings();
      const secs = Math.max(0, Number(seconds) || 0);
      const cost = Math.round((secs / 60) * s.pricePerMinute * 1e6);
      const t = nowIso();
      app.db.insert('media_usage', { kind: 'stt', provider: provider || s.provider, model, document_id: documentId, seconds: secs, pages: null, cost_micro_usd: cost, ok: ok ? 1 : 0, error, period: periodOf(t), created_at: t });
      svc.checkBudget();
      return cost;
    },

    /** تنبيه المدراء مرة في الشهر عند 80٪ و100٪ من ميزانية التحويل */
    checkBudget() {
      const b = svc.budgetState();
      if (!b.limit_usd) return b;
      const kind = b.exceeded ? 'exceeded' : b.warning ? 'warning' : null;
      if (kind) svc.alertOnce(kind, b.period, () => {
        const body = `بلغ إنفاق تحويل الصوت ${b.spent_usd.toFixed(2)} دولار من حد ${b.limit_usd} دولار هذا الشهر.`;
        return kind === 'exceeded'
          ? { type: 'stt.budget_exceeded', title: 'توقف تحويل الرسائل الصوتية: بلغ الإنفاق الحد الشهري', body: `${body} تُكتب الرسائل الجديدة يدويًا حتى بداية الشهر القادم أو رفع الحد من «التكاملات».` }
          : { type: 'stt.budget_warning', title: 'اقترب إنفاق تحويل الرسائل الصوتية من الحد الشهري', body };
      });
      return b;
    },

    /** إشعار للمدراء مرة واحدة لكل (نوع، فترة) — العلامة صف في media_usage بنوع stt_alert (لا يدخل في الإنفاق) */
    alertOnce(kind, period, make) {
      const db = app.db;
      if (db.get("SELECT 1 FROM media_usage WHERE kind = 'stt_alert' AND provider = ? AND period = ?", kind, period)) return false;
      db.insert('media_usage', { kind: 'stt_alert', provider: kind, model: null, document_id: null, seconds: null, pages: null, cost_micro_usd: 0, ok: 1, error: null, period, created_at: nowIso() });
      const n = make();
      const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((x) => x.id);
      try {
        app.notifications.notify(admins, { ...n, link: '#/integrations' });
      } catch (e) {
        app.log('stt alert notify failed', e);
      }
      return true;
    },

    /**
     * هل يجوز تحويل هذا الصوت الآن؟ → null (نعم) أو سبب التخطي:
     * off · not_client · mime · too_big · charity (طلب «خيري» أو غير محدد عند جهة خارجية، L12-62) · before_disclosure ·
     * too_long · client_cap (التلقائي فقط) · budget
     */
    policy(doc, { buffer = null, manual = false, seconds = null } = {}) {
      const s = svc.settings();
      if (s.provider === 'off' || !svc.configured()) return { reason: 'off' };
      if (!doc || doc.uploaded_by_kind !== 'client' || !/^audio\//.test(String(doc.mime || ''))) return { reason: 'not_client' };
      if (!STT_MIMES.has(doc.mime)) return { reason: 'mime' };
      if (Number(doc.size) > STT_MAX_BYTES) return { reason: 'too_big' };
      const third = isThirdPartyOf(s);
      if (third) {
        const seg = svc.segmentOf(doc);
        if (seg !== 'paid' && app.settings.get('stt_charity_third_party') !== true) return { reason: 'charity' };
        const since = app.settings.get('stt_third_party_since') || '';
        if (!since || String(doc.created_at) < since) return { reason: 'before_disclosure' };
      }
      const secs = svc.estimateSeconds({ mime: doc.mime, buffer, seconds });
      if (secs !== null && secs > s.maxSeconds) return { reason: 'too_long', seconds: secs };
      if (s.provider === 'google' && secs !== null && secs > GOOGLE_MAX_SECONDS) return { reason: 'too_long', seconds: secs };
      if (!manual) {
        const cap = Math.max(1, Number(app.settings.get('stt_minutes_per_client_day')) || 20) * 60;
        const used = svc.clientSecondsToday(doc);
        if (used + (secs || 0) > cap) return { reason: 'client_cap', seconds: secs };
      }
      const b = svc.budgetState();
      if (b.limit_usd > 0) {
        const est = ((secs || 0) / 60) * s.pricePerMinute;
        if (b.exceeded || b.spent_usd + est > b.limit_usd) return { reason: 'budget', seconds: secs };
      }
      return { reason: null, seconds: secs };
    },

    /** نوع الخدمة للمستند (من الطلب أو الملف)، و NULL = «خيري» (L12-62) */
    segmentOf(doc) {
      const db = app.db;
      let seg = null;
      try {
        if (doc.intake_id) seg = db.value('SELECT segment FROM intakes WHERE id = ?', doc.intake_id);
        if (!seg && doc.case_id) seg = db.value('SELECT segment FROM cases WHERE id = ?', doc.case_id);
      } catch {
        seg = null;
      }
      return seg || 'charity';
    },

    /** ثواني التحويل الآلي لنفس الشخص (العميل) في يوم القاهرة الحالي */
    clientSecondsToday(doc) {
      const db = app.db;
      const clientId = doc.client_id || (doc.intake_id ? db.value('SELECT client_id FROM intakes WHERE id = ?', doc.intake_id) : null);
      const day = cairoDayKey(nowIso());
      const since = new Date(Date.parse(nowIso()) - 36 * 3600 * 1000).toISOString();
      const rows = clientId
        ? db.all(
            `SELECT u.seconds, u.created_at FROM media_usage u JOIN documents d ON d.id = u.document_id
             LEFT JOIN intakes i ON i.id = d.intake_id
             WHERE u.kind = 'stt' AND u.created_at >= ? AND (d.client_id = ? OR i.client_id = ?)`,
            since,
            clientId,
            clientId,
          )
        : db.all("SELECT seconds, created_at FROM media_usage WHERE kind = 'stt' AND document_id = ? AND created_at >= ?", doc.id, since);
      return rows.filter((r) => cairoDayKey(r.created_at) === day).reduce((a, r) => a + (Number(r.seconds) || 0), 0);
    },

    /** المسودة الآلية لرسالة (للفريق فقط) أو null */
    draftOf(documentId) {
      return app.db.get('SELECT * FROM voice_auto_transcripts WHERE document_id = ?', documentId) || null;
    },

    /** حفظ نتيجة/حالة المسودة (لا يمس outcome ولا played_ratio: يقررهما الفريق) */
    saveDraft(documentId, row) {
      const t = nowIso();
      app.db.run(
        `INSERT INTO voice_auto_transcripts (document_id, state, text, provider, model, language, confidence, seconds, raw, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id) DO UPDATE SET state = excluded.state, text = excluded.text, provider = excluded.provider, model = excluded.model,
           language = excluded.language, confidence = excluded.confidence, seconds = excluded.seconds, raw = excluded.raw, error = excluded.error,
           updated_at = excluded.updated_at`,
        documentId,
        row.state,
        row.text ?? null,
        row.provider || 'off',
        row.model ?? null,
        row.language ?? null,
        row.confidence ?? null,
        row.seconds ?? null,
        row.raw ? JSON.stringify(row.raw).slice(0, 20000) : null,
        row.error ?? null,
        t,
        t,
      );
    },

    /** بعد حفظ صوت من العميل (documents.save → voice.onAudioSaved): مهمة تحويل إن كان التحويل التلقائي مضبوطًا */
    onClientAudio(documentId) {
      if (app.settings.get('stt_auto') === false || !svc.configured() || !app.media) return null;
      try {
        return app.media.enqueue('stt', documentId);
      } catch (e) {
        app.log('stt enqueue failed', e);
        return null;
      }
    },

    /** وحدة الطابور (media.process): تحويل رسالة واحدة. job.priority ≥ 10 = «حوّل الآن» من الفريق (يتجاوز حد الشخص اليومي) */
    async runJob(job) {
      const doc = app.documents.get(job.document_id);
      if (!doc) return { state: 'skipped', error: 'gone' };
      const manual = Number(job.priority) >= 10;
      let buffer;
      try {
        const abs = path.resolve(app.config.uploadsDir, doc.storage_key);
        if (!abs.startsWith(path.resolve(app.config.uploadsDir) + path.sep)) return { state: 'failed', error: 'path' };
        buffer = fs.readFileSync(abs);
      } catch {
        return { state: 'failed', error: 'missing_file' };
      }
      const claimed = app.db.value('SELECT duration_seconds FROM voice_transcripts WHERE document_id = ?', doc.id);
      const s = svc.settings();
      const pol = svc.policy(doc, { buffer, manual, seconds: claimed });
      if (pol.reason) {
        svc.saveDraft(doc.id, { state: 'skipped', provider: s.provider, error: pol.reason, seconds: pol.seconds ?? null });
        if (pol.reason === 'budget') svc.checkBudget();
        return { state: 'skipped', error: pol.reason, provider: s.provider };
      }
      try {
        const r = await svc.transcribe({ buffer, mime: doc.mime, filename: doc.filename, seconds: pol.seconds });
        svc.recordUsage({ seconds: pol.seconds || 0, ok: true, documentId: doc.id, provider: r.provider, model: r.model });
        svc.saveDraft(doc.id, { state: r.text ? 'done' : 'empty', text: r.text || null, provider: r.provider, model: r.model, language: r.language, confidence: r.confidence, seconds: pol.seconds, raw: r.raw });
        return { state: 'done', provider: r.provider };
      } catch (e) {
        const code = e instanceof SttError ? e.code : 'error';
        if (e?.billed) svc.recordUsage({ seconds: pol.seconds || 0, ok: false, error: code, documentId: doc.id, provider: s.provider, model: s.model || null });
        if (code === 'auth') {
          svc.alertOnce('auth', cairoDayKey(nowIso()), () => ({ type: 'stt.auth_failed', title: 'تحويل الصوت متوقف: المفتاح مرفوض', body: 'رفض مزوّد التحويل المفتاح المحفوظ. حدّث المفتاح من «التكاملات ← تحويل الرسائل الصوتية إلى نص».' }));
        }
        // 429/503/خطأ شبكة قبل الإرسال: إعادة لاحقًا (1 ثم 5 ثم 30 دقيقة)؛ غير ذلك (ومنه المهلة) لا يُعاد
        if (e?.retryable && Number(job.attempts) < 4) return { state: 'retry', error: code, provider: s.provider };
        svc.saveDraft(doc.id, { state: 'failed', provider: s.provider, error: code, seconds: pol.seconds });
        return { state: 'failed', error: code, provider: s.provider };
      }
    },
  };
  return svc;
}
