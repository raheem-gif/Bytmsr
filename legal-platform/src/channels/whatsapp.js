// قناة واتساب: استقبال Webhooks من WhatsApp Business Platform (Cloud API) والإرسال عبرها.
// بدون بيانات اعتماد يعمل النظام في «وضع المحاكاة»: تُسجَّل الرسائل الصادرة دون إرسال فعلي.
import crypto from 'node:crypto';
import { normalizePhone } from '../util.js';

const GRAPH = 'https://graph.facebook.com';

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

export function createWhatsApp(config, log) {
  const wa = config.whatsapp;
  const configured = !!(wa.token && wa.phoneNumberId);

  async function graph(pathname, init = {}) {
    const res = await fetch(`${GRAPH}/${wa.apiVersion}/${pathname}`, {
      ...init,
      headers: { Authorization: `Bearer ${wa.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(data?.error?.message || `WhatsApp API ${res.status}`);
      err.code = data?.error?.code;
      throw err;
    }
    return data;
  }

  return {
    configured,

    /** إرسال نص حر (داخل نافذة الـ 24 ساعة) */
    async sendText(toE164, body) {
      const data = await graph(`${wa.phoneNumberId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toE164.replace(/^\+/, ''),
          type: 'text',
          text: { body: body.slice(0, 4096), preview_url: false },
        }),
      });
      return data.messages?.[0]?.id || null;
    },

    /**
     * إرسال رسالة قالب معتمد (خارج نافذة الـ 24 ساعة).
     * يفترض قالبًا من فئة Utility يحتوي متغيرًا واحدًا {{1}} يحمل نص الرسالة.
     */
    async sendTemplate(toE164, templateName, language, body) {
      // قيود ميتا على متغيرات القوالب: بلا أسطر جديدة أو مسافات متتالية كثيرة
      const param = body.replace(/\s*\n+\s*/g, ' — ').replace(/ {4,}/g, '   ').slice(0, 1000);
      const data = await graph(`${wa.phoneNumberId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toE164.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: templateName,
            language: { code: language || 'ar' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: param }] }],
          },
        }),
      });
      return data.messages?.[0]?.id || null;
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
}
