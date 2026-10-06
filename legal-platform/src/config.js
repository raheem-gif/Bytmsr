// الإعدادات من متغيرات البيئة (ملف .env اختياري في جذر المشروع)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let envLoaded = false;
function loadEnvFile() {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile(path.join(ROOT, '.env'));
  } catch {
    // لا يوجد ملف .env — نكتفي بمتغيرات البيئة
  }
}

function bool(v, def) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export function loadConfig(overrides = {}) {
  loadEnvFile();
  const env = process.env;
  const production = env.NODE_ENV === 'production';
  const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
  // على Render: الرابط العام للخدمة (https://<name>.onrender.com) إن لم يُضبط PUBLIC_BASE_URL صراحةً
  const publicBaseUrl = (env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  const cfg = {
    root: ROOT,
    production,
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0',
    dataDir,
    dbPath: env.DB_PATH ? path.resolve(ROOT, env.DB_PATH) : path.join(dataDir, 'platform.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    publicDir: path.join(ROOT, 'public'),
    // وضع العرض التجريبي: بيانات نموذجية + حسابات تجريبية + محاكي واتساب
    demo: bool(env.DEMO, !production),
    publicBaseUrl,
    cookieSecure: bool(env.COOKIE_SECURE, publicBaseUrl.startsWith('https://')),
    sessionTtlHours: Number(env.SESSION_TTL_HOURS || 12),
    portalTokenDays: Number(env.PORTAL_TOKEN_DAYS || 180),
    // رابط البوابة الصادر بعد الدخول برمز واتساب: أقصر عمرًا (يمكن الدخول برمز جديد في أي وقت)
    portalOtpTokenDays: Number(env.PORTAL_OTP_TOKEN_DAYS || 30),
    adminUsername: env.ADMIN_USERNAME || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 8),
    // الحد الأقصى لطلبات الموقع من نفس عنوان IP في الساعة (حماية من الإغراق)
    publicIntakePerHour: Number(env.PUBLIC_INTAKE_PER_HOUR || (production ? 20 : 200)),
    schedulerIntervalSeconds: Number(env.SCHEDULER_INTERVAL_SECONDS || 60),
    whatsapp: {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      wabaId: env.WHATSAPP_WABA_ID || '',
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
      appSecret: env.WHATSAPP_APP_SECRET || '',
      apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
      // الرقم الظاهر للعملاء ورابط wa.me (أرقام فقط بصيغة دولية، مثل 201000000000)
      numberDigits: (env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    },
    ai: {
      provider: (env.AI_PROVIDER || 'auto').toLowerCase(),
      anthropicApiKey: env.ANTHROPIC_API_KEY || '',
      model: env.AI_MODEL || 'claude-opus-5-5',
      effort: env.AI_EFFORT || 'medium',
    },
    ...overrides,
  };
  if (overrides.whatsapp) cfg.whatsapp = { ...defaultsOf('whatsapp', env), ...overrides.whatsapp };
  if (overrides.ai) cfg.ai = { ...defaultsOf('ai', env), ...overrides.ai };
  return cfg;
}

function defaultsOf(group, env) {
  if (group === 'whatsapp') {
    return {
      token: env.WHATSAPP_TOKEN || '',
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
      wabaId: env.WHATSAPP_WABA_ID || '',
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
      appSecret: env.WHATSAPP_APP_SECRET || '',
      apiVersion: env.WHATSAPP_API_VERSION || 'v21.0',
      numberDigits: (env.WHATSAPP_NUMBER || '').replace(/\D/g, ''),
    };
  }
  return {
    provider: (env.AI_PROVIDER || 'auto').toLowerCase(),
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    model: env.AI_MODEL || 'claude-opus-5-5',
    effort: env.AI_EFFORT || 'medium',
  };
}
