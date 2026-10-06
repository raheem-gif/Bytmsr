// إعدادات التكاملات (واتساب للأعمال، Claude) من واجهة الإدارة بدل متغيرات البيئة فقط.
// الأسرار تُخزن مشفرة (AES-256-GCM) في قاعدة البيانات بمفتاح خارجها:
//   APP_SECRET (متغير بيئة، 32 حرفًا على الأقل) أو ملف data/.secret-key يُنشأ تلقائيًا (احفظه مع النسخ الاحتياطية).
// قيمة متغير البيئة — إن ضُبطت — تتقدم دائمًا على القيمة المخزنة.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, badRequest, notFound, parseJson } from '../util.js';
import { LABELS } from '../constants.js';

/**
 * تعريف كل تكامل: الحقول، أيها سري (لا يُعاد للواجهة أبدًا)، ومصدره من الإعدادات المحمّلة من البيئة.
 * cfg: دالة تقرأ القيمة من config (أي من متغيرات البيئة).
 */
export const INTEGRATION_SPEC = {
  whatsapp: {
    label: 'واتساب للأعمال (WhatsApp Cloud API)',
    fields: {
      token: { label: 'رمز الوصول الدائم (System User Token)', secret: true, env: 'WHATSAPP_TOKEN', cfg: (c) => c.whatsapp?.token },
      phone_number_id: { label: 'معرّف رقم الهاتف (Phone Number ID)', env: 'WHATSAPP_PHONE_NUMBER_ID', cfg: (c) => c.whatsapp?.phoneNumberId },
      waba_id: { label: 'معرّف حساب واتساب للأعمال (WABA ID)', env: 'WHATSAPP_WABA_ID', cfg: (c) => c.whatsapp?.wabaId },
      app_secret: { label: 'سر التطبيق (App Secret)', secret: true, env: 'WHATSAPP_APP_SECRET', cfg: (c) => c.whatsapp?.appSecret },
      verify_token: { label: 'رمز التحقق من Webhook', secret: true, env: 'WHATSAPP_VERIFY_TOKEN', cfg: (c) => c.whatsapp?.verifyToken },
      number: { label: 'رقم واتساب الظاهر للمستفيدين (أرقام دولية فقط)', env: 'WHATSAPP_NUMBER', cfg: (c) => c.whatsapp?.numberDigits },
      api_version: { label: 'إصدار Graph API', env: 'WHATSAPP_API_VERSION', cfg: (c) => (process.env.WHATSAPP_API_VERSION ? c.whatsapp?.apiVersion : ''), default: 'v21.0' },
    },
  },
  anthropic: {
    label: 'الذكاء الاصطناعي (Claude من Anthropic)',
    fields: {
      api_key: { label: 'مفتاح Anthropic API', secret: true, env: 'ANTHROPIC_API_KEY', cfg: (c) => c.ai?.anthropicApiKey },
      model: { label: 'النموذج (عند تفعيل Claude)', env: 'AI_MODEL', cfg: (c) => (process.env.AI_MODEL ? c.ai?.model : ''), default: 'claude-opus-5-5', code: true },
      // options: القيم المقبولة وتسمياتها العربية (تُعرض للإدارة بدل القيمة الإنجليزية الخام)
      effort: { label: 'مستوى الجهد', env: 'AI_EFFORT', cfg: (c) => (process.env.AI_EFFORT ? c.ai?.effort : ''), default: 'medium', options: LABELS.ai_effort },
      provider: { label: 'وضع التشغيل', env: 'AI_PROVIDER', cfg: (c) => (process.env.AI_PROVIDER ? c.ai?.provider : ''), default: 'auto', options: LABELS.ai_mode },
      monthly_budget_usd: { label: 'سقف الإنفاق الشهري بالدولار (0 = بلا سقف)', env: 'AI_MONTHLY_BUDGET_USD', cfg: () => process.env.AI_MONTHLY_BUDGET_USD || '', default: '0' },
    },
  },
};

function loadKey(config) {
  const fromEnv = process.env.APP_SECRET || config.appSecret;
  if (fromEnv && String(fromEnv).length >= 32) return { key: crypto.createHash('sha256').update(String(fromEnv)).digest(), source: 'env' };
  const dir = config.dataDir || path.dirname(config.dbPath || '.');
  const file = path.join(dir, '.secret-key');
  try {
    if (fs.existsSync(file)) return { key: Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex'), source: 'file', file };
    fs.mkdirSync(dir, { recursive: true });
    const k = crypto.randomBytes(32);
    fs.writeFileSync(file, k.toString('hex'), { mode: 0o600 });
    return { key: k, source: 'file', file };
  } catch {
    // قاعدة بيانات في الذاكرة أو مجلد غير قابل للكتابة: مفتاح مؤقت لهذه الجلسة فقط
    return { key: crypto.randomBytes(32), source: 'ephemeral' };
  }
}

export function createIntegrations(app) {
  const { db, config } = app;
  const master = loadKey(config);

  function encrypt(obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', master.key, iv);
    const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
  }
  function decrypt(str) {
    try {
      const [ver, iv, tag, data] = String(str).split(':');
      if (ver !== 'v1') return {};
      const d = crypto.createDecipheriv('aes-256-gcm', master.key, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return parseJson(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'), {});
    } catch {
      // مفتاح مختلف عن المفتاح الذي شُفرت به القيم (مثل نقل قاعدة البيانات دون ملف المفتاح)
      return { __undecryptable: true };
    }
  }
  function stored(name) {
    const r = db.get('SELECT value_enc FROM integration_secrets WHERE name = ?', name);
    return r ? decrypt(r.value_enc) : {};
  }
  function spec(name) {
    const s = INTEGRATION_SPEC[name];
    if (!s) throw notFound('التكامل غير معروف');
    return s;
  }

  const svc = {
    spec: INTEGRATION_SPEC,
    keySource: master.source,

    /** القيم الفعلية المستخدمة (البيئة أولًا ثم المخزن ثم الافتراضي). للاستخدام داخل الخادم فقط. */
    get(name) {
      const s = spec(name);
      const st = stored(name);
      const out = {};
      for (const [k, f] of Object.entries(s.fields)) {
        const envVal = f.cfg ? f.cfg(config) : '';
        out[k] = envVal ? String(envVal) : st[k] !== undefined && st[k] !== '' ? String(st[k]) : f.default ?? '';
      }
      return out;
    },

    /** حالة الحقول للواجهة: لا تُعاد قيم الأسرار، فقط هل هي مضبوطة ومن أين */
    status(name) {
      const s = spec(name);
      const st = stored(name);
      const fields = {};
      for (const [k, f] of Object.entries(s.fields)) {
        const envVal = f.cfg ? f.cfg(config) : '';
        const source = envVal ? 'env' : st[k] !== undefined && st[k] !== '' ? 'db' : f.default ? 'default' : null;
        const value = envVal || st[k] || f.default || '';
        fields[k] = {
          label: f.label,
          secret: !!f.secret,
          set: !!value,
          source,
          env: f.env,
          value: f.secret ? null : value || null,
          // القيمة بالعربية للحقول ذات القيم المحددة (مثل «متوسط (موصى به)» بدل medium)؛ القيمة الخام تبقى في value
          value_label: !f.secret && f.options && value ? f.options[value] || null : null,
          options: f.options ? Object.entries(f.options).map(([v, l]) => ({ value: v, label: l })) : null,
          // معرّفات تقنية (مثل اسم النموذج) تُعرض كرمز لاتيني لا يلتف
          code: !!f.code,
          hint: f.secret && value ? `••••${String(value).slice(-4)}` : null,
        };
      }
      return { name, label: s.label, fields, undecryptable: !!st.__undecryptable, key_source: master.source };
    },

    /** حفظ قيم (القيمة الفارغة "" تحذف الحقل). يطلق الحدث integrations.changed لإعادة تهيئة الخدمة المعنية */
    set(name, patch, actor, ctx = null) {
      const s = spec(name);
      if (!patch || typeof patch !== 'object') throw badRequest('بيانات غير صالحة');
      const cur = stored(name);
      const next = cur.__undecryptable ? {} : { ...cur };
      for (const [k, val] of Object.entries(patch)) {
        if (!s.fields[k]) throw badRequest(`حقل غير معروف: ${k}`);
        if (val === null || val === undefined || val === '') delete next[k];
        else {
          const str = String(val).trim();
          if (str.length > 2000) throw badRequest('القيمة أطول من المسموح');
          next[k] = str;
        }
      }
      db.run(
        `INSERT INTO integration_secrets (name, value_enc, updated_by, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET value_enc = excluded.value_enc, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        name,
        encrypt(next),
        actor?.id ?? null,
        nowIso(),
      );
      app.audit?.log({ actor, ctx, type: 'integration.updated', severity: 'warning', summary: `تم تحديث إعدادات ${s.label}`, data: { name, fields: Object.keys(patch) } });
      app.events.emit('integrations.changed', { name });
      return svc.status(name);
    },
  };
  return svc;
}
