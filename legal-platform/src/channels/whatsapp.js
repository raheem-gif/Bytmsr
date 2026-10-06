// قناة واتساب: استقبال Webhooks من WhatsApp Business Platform (Cloud API) والإرسال عبرها.
// بيانات الاعتماد تُقرأ من مخزن التكاملات المشفر (app.integrations.get('whatsapp')) مع أولوية متغيرات البيئة،
// وتُعاد قراءتها فور حفظها من لوحة الإدارة (الحدث integrations.changed).
// بدون رمز الوصول ومعرّف الرقم يعمل النظام في «وضع المحاكاة»: تُسجَّل الرسائل الصادرة دون إرسال فعلي.
import crypto from 'node:crypto';
import { normalizePhone } from '../util.js';

const GRAPH = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v21.0';

/** التحقق من توقيع Meta (X-Hub-Signature-256) على الجسم الخام */
export function verifySignature(rawBody, header, appSecret) {
  if (!appSecret) return false; // بدون سر لا يمكن التحقق؛ قرار قبول الرسائل غير الموقعة (المحاكاة فقط) يتخذه المسار صراحة
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const got = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(got)) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(got, 'hex'), expected);
}

/** تحديد مصدر العميل من بيانات الإحالة في الإعلانات الممولة (Click-to-WhatsApp Ads) */
export function sourceFromReferral(referral) {
  if (!referral) return null;
  const url = String(referral.source_url || '').toLowerCase();
  const isAd = referral.source_type === 'ad' || !!referral.ctwa_clid;
  let source;
  if (url.includes('instagram')) source = isAd ? 'instagram_ad' : 'social_organic';
  else if (url.includes('facebook') || url.includes('fb.')) source = isAd ? 'facebook_ad' : 'social_organic';
  else source = isAd ? 'meta_ad' : 'social_organic';
  return {
    source,
    campaign: referral.headline || referral.source_id || null,
    detail: {
      ad_id: referral.source_id || null,
      source_type: referral.source_type || null,
      source_url: referral.source_url || null,
      headline: referral.headline || null,
      ad_body: referral.body || null,
      ctwa_clid: referral.ctwa_clid || null,
    },
  };
}

function describeNonText(m) {
  switch (m.type) {
    case 'image': return m.image?.caption || '[صورة]';
    case 'document': return m.document?.caption || `[مستند: ${m.document?.filename || 'ملف'}]`;
    case 'audio': return '[رسالة صوتية]';
    case 'video': return m.video?.caption || '[فيديو]';
    case 'sticker': return '[ملصق]';
    case 'location': {
      const l = m.location || {};
      return `[موقع جغرافي${l.name ? ': ' + l.name : ''}${l.address ? ' — ' + l.address : ''} (${l.latitude}, ${l.longitude})]`;
    }
    case 'contacts': return `[جهة اتصال: ${(m.contacts || []).map((c) => c.name?.formatted_name).filter(Boolean).join('، ')}]`;
    case 'button': return m.button?.text || '[زر]';
    case 'interactive':
      return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[رد تفاعلي]';
    default: return `[رسالة من نوع غير مدعوم: ${m.type}]`;
  }
}

/** رد بزر: أزرار الرسائل التفاعلية (button_reply / list_reply) أو أزرار الرد السريع في القوالب (button.payload) */
function replyOf(m) {
  if (m.type === 'interactive') {
    const r = m.interactive?.button_reply || m.interactive?.list_reply;
    if (r) return { kind: 'interactive', id: String(r.id || ''), title: String(r.title || '') };
  }
  if (m.type === 'button' && m.button) return { kind: 'template_button', id: String(m.button.payload || ''), title: String(m.button.text || '') };
  return null;
}

/**
 * تحويل جسم Webhook إلى رسائل موحدة + تحديثات حالة الرسائل الصادرة.
 * @returns {{ messages: Array, statuses: Array }}
 */
export function parseWebhook(payload) {
  const messages = [];
  const statuses = [];
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return { messages, statuses };
  for (const entry of payload.entry) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = new Map((value.contacts || []).map((c) => [c.wa_id, c.profile?.name || null]));
      for (const m of value.messages || []) {
        if (m.type === 'reaction' || m.type === 'system') continue;
        const media = ['image', 'document', 'audio', 'video', 'sticker'].includes(m.type) ? m[m.type] : null;
        messages.push({
          channel: 'whatsapp',
          external_id: m.id,
          from_phone: normalizePhone(m.from),
          contact_name: names.get(m.from) || null,
          text: m.type === 'text' ? m.text?.body || '' : describeNonText(m),
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
          attachments: media && m.type !== 'sticker'
            ? [{ media_id: media.id, mime: media.mime_type, filename: media.filename || null, kind: m.type }]
            : [],
          referral: m.referral || null,
          context_id: m.context?.id || null,
          reply: replyOf(m),
        });
      }
      for (const s of value.statuses || []) {
        statuses.push({
          external_id: s.id,
          status: s.status, // sent | delivered | read | failed
          timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
          error: s.errors?.[0] ? `${s.errors[0].code}: ${s.errors[0].title || s.errors[0].message || ''}` : null,
        });
      }
    }
  }
  return { messages, statuses };
}

/**
 * قيود ميتا على متغيرات القوالب: لا أسطر جديدة ولا علامات جدولة ولا أكثر من 4 مسافات متتالية، ولا قيمة فارغة.
 */
export function templateParam(value, max = 1024) {
  const s = String(value ?? '')
    .replace(/\t/g, ' ')
    .replace(/\s*\n+\s*/g, ' — ')
    .replace(/ {4,}/g, '   ')
    .trim()
    .slice(0, max);
  return s || '-';
}

/** عدد متغيرات {{n}} في نص قالب */
export function countTemplateParams(text) {
  const nums = new Set();
  for (const m of String(text || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.add(Number(m[1]));
  return nums.size ? Math.max(...nums) : 0;
}

/** رسالة عربية مفهومة لأخطاء Graph API الشائعة (تُعرض للإدارة) */
export function graphErrorArabic(err) {
  if (!err) return 'خطأ غير معروف في الاتصال بواتساب';
  const code = Number(err.code);
  const sub = Number(err.subcode);
  if (err.network) return 'تعذر الاتصال بخوادم ميتا (Graph API). تحقق من اتصال الخادم بالإنترنت ثم أعد المحاولة.';
  switch (code) {
    case 190:
      return 'رمز الوصول غير صالح أو انتهت صلاحيته. أنشئ رمزًا دائمًا لمستخدم النظام (System User) وأعد حفظه.';
    case 10:
    case 200:
    case 294:
      return 'رمز الوصول لا يملك صلاحيات whatsapp_business_messaging و whatsapp_business_management على هذا الحساب.';
    case 100:
      if (sub === 33 || /does not exist|Unsupported get request|cannot be loaded/i.test(err.message || '')) {
        return 'معرّف رقم الهاتف أو حساب واتساب للأعمال غير صحيح، أو لا يملك الرمز صلاحية عليه.';
      }
      return `معامل غير صالح في الطلب المرسل إلى ميتا: ${err.message || ''}`.trim();
    case 4:
    case 80007:
    case 130429:
    case 131056:
      return 'تجاوزتم حد الطلبات المسموح به لدى ميتا مؤقتًا. أعد المحاولة بعد قليل.';
    case 131047:
      return 'انقضت نافذة الـ 24 ساعة منذ آخر رسالة من العميل؛ لا يُرسل الآن إلا قالب معتمد.';
    case 131026:
      return 'تعذر تسليم الرسالة لهذا الرقم (قد لا يكون مسجلًا على واتساب).';
    case 131030:
      return 'رقم المستلم غير مضاف إلى قائمة الأرقام المسموح بها في وضع التجربة لدى ميتا.';
    case 132000:
      return 'عدد متغيرات القالب لا يطابق القالب المعتمد لدى ميتا. راجع ربط القالب من صفحة الردود الجاهزة والقوالب.';
    case 132001:
      return 'القالب غير موجود أو غير معتمد بهذه اللغة. زامن القوالب وراجع الربط.';
    case 132015:
    case 132016:
      return 'القالب موقوف أو معطّل من ميتا بسبب انخفاض جودته.';
    case 131051:
      return 'نوع الرسالة غير مدعوم.';
    case 131052:
    case 131053:
      return 'تعذر رفع المستند إلى واتساب (نوع الملف أو حجمه غير مقبول).';
    case 368:
    case 131031:
      return 'حساب واتساب للأعمال مقيد مؤقتًا من ميتا بسبب مخالفة السياسات.';
    default:
      return `استجابة غير متوقعة من ميتا${code ? ` (رمز ${code})` : ''}${err.message ? `: ${err.message}` : ''}`;
  }
}

/** قراءة بيانات الاعتماد الفعلية: مخزن التكاملات (البيئة أولًا) أو config.whatsapp إن لم يتوفر */
function readSettings(config, app) {
  const base = config.whatsapp || {};
  let s = null;
  if (app?.integrations) {
    try {
      s = app.integrations.get('whatsapp');
    } catch {
      s = null;
    }
  }
  if (!s) {
    return {
      token: base.token || '',
      phoneNumberId: base.phoneNumberId || '',
      wabaId: base.wabaId || '',
      appSecret: base.appSecret || '',
      verifyToken: base.verifyToken || '',
      numberDigits: String(base.numberDigits || '').replace(/\D/g, ''),
      apiVersion: base.apiVersion || DEFAULT_API_VERSION,
    };
  }
  return {
    token: s.token || '',
    phoneNumberId: s.phone_number_id || '',
    wabaId: s.waba_id || '',
    appSecret: s.app_secret || '',
    verifyToken: s.verify_token || '',
    numberDigits: String(s.number || '').replace(/\D/g, ''),
    apiVersion: /^v\d+\.\d+$/.test(s.api_version || '') ? s.api_version : base.apiVersion || DEFAULT_API_VERSION,
  };
}

export function createWhatsApp(config, log, app = null) {
  let wa = readSettings(config, app);

  function graphError(status, data) {
    const e = data?.error || {};
    const err = new Error(e.message || `WhatsApp API ${status}`);
    err.code = e.code;
    err.subcode = e.error_subcode;
    err.status = status;
    err.arabic = graphErrorArabic(err);
    return err;
  }

  async function call(url, init) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout || 20000) });
    } catch (e) {
      const err = new Error(`WhatsApp API network error: ${e?.message || e}`);
      err.network = true;
      err.arabic = graphErrorArabic(err);
      throw err;
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) throw graphError(res.status, data);
    return data;
  }

  /** طلب Graph API بصيغة JSON */
  function graph(pathname, init = {}) {
    return call(`${GRAPH}/${wa.apiVersion}/${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${wa.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  }

  const to = (e164) => String(e164 || '').replace(/^\+/, '');

  async function sendMessage(payload) {
    const data = await graph(`${wa.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
    });
    return data.messages?.[0]?.id || null;
  }

  const svc = {
    /** هل الإرسال الحقيقي مفعّل؟ (يتغير فور حفظ الإعدادات من لوحة الإدارة) */
    get configured() {
      return !!(wa.token && wa.phoneNumberId);
    },

    /** القيم الفعلية المستخدمة الآن (للخادم فقط؛ لا تُعاد للواجهة لأنها تتضمن أسرارًا) */
    effective() {
      return { ...wa };
    },

    /** إعادة قراءة الإعدادات من مخزن التكاملات/البيئة */
    reconfigure() {
      const before = svc.configured;
      wa = readSettings(config, app);
      if (before !== svc.configured) log?.(`whatsapp ${svc.configured ? 'configured — live sending enabled' : 'not configured — simulation mode'}`);
      return svc.configured;
    },

    /** اختبار الاتصال: بيانات الرقم كما تراها ميتا */
    async test() {
      if (!wa.token || !wa.phoneNumberId) {
        return { ok: false, error: 'لم تُضبط بيانات الاعتماد بعد: يلزم رمز الوصول ومعرّف رقم الهاتف (Phone Number ID).' };
      }
      try {
        const d = await graph(`${wa.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, { method: 'GET' });
        const quality = { GREEN: 'مرتفعة', YELLOW: 'متوسطة', RED: 'منخفضة' }[d.quality_rating] || null;
        return {
          ok: true,
          message: `تم الاتصال بنجاح بالرقم ${d.display_phone_number || wa.phoneNumberId}${d.verified_name ? ` (${d.verified_name})` : ''}${quality ? ` — جودة الرقم لدى ميتا: ${quality}` : ''}`,
          display_phone_number: d.display_phone_number || null,
          verified_name: d.verified_name || null,
          quality_rating: d.quality_rating || null,
          code_verification_status: d.code_verification_status || null,
        };
      } catch (e) {
        return { ok: false, error: e.arabic || graphErrorArabic(e), code: e.code ?? null };
      }
    },

    /** إرسال نص حر (داخل نافذة الـ 24 ساعة) */
    sendText(toE164, body) {
      return sendMessage({ to: to(toE164), type: 'text', text: { body: String(body).slice(0, 4096), preview_url: false } });
    },

    /**
     * إرسال رسالة قالب معتمد (خارج نافذة الـ 24 ساعة).
     * params: نص واحد (قالب بمتغير واحد {{1}}) أو مصفوفة قيم بترتيب {{1}}…{{n}}.
     * opts.buttons: [{ index, sub_type: 'url'|'quick_reply'|'copy_code', value }] لمعاملات الأزرار (مثل رمز قالب المصادقة).
     */
    sendTemplate(toE164, templateName, language, params, opts = {}) {
      const list = (Array.isArray(params) ? params : params == null ? [] : [params]).map((p) => templateParam(p, Array.isArray(params) ? 1024 : 1000));
      const components = [];
      if (list.length) components.push({ type: 'body', parameters: list.map((text) => ({ type: 'text', text })) });
      for (const b of opts.buttons || []) {
        const param = b.sub_type === 'quick_reply' ? { type: 'payload', payload: String(b.value) } : { type: 'text', text: String(b.value) };
        components.push({ type: 'button', sub_type: b.sub_type === 'copy_code' ? 'url' : b.sub_type, index: String(b.index), parameters: [param] });
      }
      return sendMessage({
        to: to(toE164),
        type: 'template',
        template: { name: templateName, language: { code: language || 'ar' }, ...(components.length ? { components } : {}) },
      });
    },

    /** رسالة تفاعلية بأزرار رد (حتى 3 أزرار، عنوان الزر 20 حرفًا) — داخل النافذة فقط */
    sendButtons(toE164, bodyText, buttons, { footer } = {}) {
      return sendMessage({
        to: to(toE164),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: String(bodyText).slice(0, 1024) },
          ...(footer ? { footer: { text: String(footer).slice(0, 60) } } : {}),
          action: { buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) } })) },
        },
      });
    },

    /** إعلام العميل بأن رسالته قُرئت (يُعلِّم ما قبلها أيضًا) */
    async markRead(messageId) {
      await graph(`${wa.phoneNumberId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
      });
      return true;
    },

    /** رفع ملف إلى واتساب (multipart) وإرجاع معرّف الوسائط */
    async uploadMedia({ buffer, mime, filename }) {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('type', mime);
      form.append('file', new Blob([buffer], { type: mime }), filename || 'document');
      const data = await call(`${GRAPH}/${wa.apiVersion}/${wa.phoneNumberId}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${wa.token}` },
        body: form,
        timeout: 60000,
      });
      if (!data.id) throw Object.assign(new Error('media id missing'), { arabic: 'لم تُرجع ميتا معرّفًا للملف المرفوع' });
      return data.id;
    },

    /** إرسال مستند سبق رفعه */
    sendDocument(toE164, { mediaId, filename, caption }) {
      return sendMessage({
        to: to(toE164),
        type: 'document',
        document: { id: mediaId, filename: String(filename || 'document').slice(0, 240), ...(caption ? { caption: String(caption).slice(0, 1024) } : {}) },
      });
    },

    /** قوالب حساب واتساب للأعمال (مع الصفحات التالية) */
    async listTemplates({ maxPages = 10 } = {}) {
      if (!wa.wabaId) {
        throw Object.assign(new Error('waba id missing'), { arabic: 'لم يُضبط معرّف حساب واتساب للأعمال (WABA ID) في إعدادات التكاملات.' });
      }
      const out = [];
      let url = `${GRAPH}/${wa.apiVersion}/${wa.wabaId}/message_templates?fields=id,name,language,status,category,components,rejected_reason&limit=100`;
      for (let page = 0; url && page < maxPages; page++) {
        const data = await call(url, { method: 'GET', headers: { Authorization: `Bearer ${wa.token}` } });
        out.push(...(Array.isArray(data.data) ? data.data : []));
        const next = data.paging?.next;
        url = typeof next === 'string' && next.startsWith(`${GRAPH}/`) ? next : null;
      }
      return out;
    },

    /** تنزيل وسائط رسالة واردة (صورة/مستند/صوت) */
    async downloadMedia(mediaId) {
      const meta = await graph(mediaId, { method: 'GET' });
      if (!meta.url) throw new Error('media url missing');
      const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${wa.token}` }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`media download ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, mime: meta.mime_type || null };
    },

    log,
  };

  // حفظ الإعدادات من لوحة الإدارة يعيد التهيئة فورًا دون إعادة تشغيل الخادم
  app?.events?.on('integrations.changed', (p) => {
    if (!p || p.name === 'whatsapp') svc.reconfigure();
  });

  return svc;
}
