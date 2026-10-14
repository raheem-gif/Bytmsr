// صحة النظام، النسخ الاحتياطي، التصدير الكامل، إدارة التكاملات، والإعداد الأول (معالج /setup).
// (الإصدار 9 — وحدة platform)
//
// • الإعداد الأول: عند أول تشغيل في الإنتاج بقاعدة فارغة وبدون ADMIN_USERNAME/ADMIN_PASSWORD تعمل المنصة في «وضع الإعداد»:
//   يُطبع رابط برمز عشوائي في سجل الخادم (يُخزن مُجزّأً فقط)، وكل /api/* عدا مسارات الإعداد و/api/meta تعيد 503،
//   وبعد الإتمام يُلغى الرمز نهائيًا وتعيد /setup الخطأ 404.
// • النسخ الاحتياطي: لقطة متسقة أثناء التشغيل بـ VACUUM INTO إلى DATA_DIR/backups مع فحص سلامة واحتفاظ بآخر N نسخة.
// • التصدير الكامل: أرشيف .tar.gz (قاعدة البيانات + المرفقات + manifest.json بتجزئات sha256) لنقل المنصة لخادم جديد.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword, passwordProblem, RateLimiter } from '../auth.js';
import { sendJson } from '../http.js';
import { INTEGRATION_SPEC } from './integrations.js';
import { tarChunks } from './system-tar.js';
import { isPlaceholderWhatsApp, publicWhatsAppDigits } from '../channels/whatsapp.js';
import {
  ApiError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  now,
  nowIso,
  addHours,
  arabicCount,
  arabicDate,
  sha256,
  randomToken,
  cairoParts,
  latinDigits,
  normalizePhone,
  parseJson,
  v,
} from '../util.js';
import { STORY_AUTO_RULES } from '../constants.js'; // v9.2 بوابة K7

// ───────────────────────── ثوابت عامة ─────────────────────────

/** اسم ملف النسخة: platform-YYYYMMDD-HHmm.db (بتوقيت القاهرة) مع لاحقة -N عند التكرار في نفس الدقيقة */
export const BACKUP_FILE_RE = /^platform-\d{8}-\d{4}(?:-\d{1,3})?\.db$/;
export const SETUP_TTL_HOURS = 72;
// محاولات التحقق من رمز الإعداد لكل عنوان IP في 15 دقيقة. لا يوجد إيقاف عام للرمز بعد عدد من المحاولات الفاشلة:
// الرمز عشوائي بطول 192 بت فلا يمكن تخمينه، والإيقاف العام كان يسمح لأي زائر مجهول بتعطيل الإعداد (حجب الخدمة).
const SETUP_ATTEMPTS_PER_IP = 20;
const BACKUP_STALE_HOURS = 48;
// خمول التنزيل المتدفق للتصدير الكامل قبل قطع الاتصال (حتى لا يحجز عميل متوقف قفل التصدير إلى الأبد)
const EXPORT_IDLE_MS = 10 * 60 * 1000;
const KEEP_TESTS_PER_INTEGRATION = 20;

/** إعدادات ملف المؤسسة التي يضبطها معالج الإعداد (المفتاح، التسمية، الحد الأقصى، إلزامي؟) */
export const ORG_FIELDS = [
  ['org_name', 'الاسم المختصر للمؤسسة', 100, true],
  ['org_legal_name', 'الاسم الرسمي الكامل', 200, true],
  ['org_tagline', 'الشعار أو الوصف المختصر', 200, false],
  ['org_registration', 'بيانات الإشهار', 200, false],
  ['org_phone', 'هاتف المؤسسة', 30, true],
  ['whatsapp_display_number', 'رقم واتساب الظاهر للمستفيدين', 30, false],
  ['org_address', 'عنوان المقر', 300, false],
  ['org_facebook_url', 'صفحة فيسبوك', 300, false],
];

// كلمات شائعة لا تصلح وحدها أساسًا لكلمة مرور مدير النظام (بعد حذف الأرقام والرموز)
const WEAK_WORDS = new Set([
  'password', 'passw', 'pass', 'admin', 'administrator', 'root', 'qwerty', 'qwertyuiop', 'azerty', 'asdf', 'asdfgh', 'zxcvbn',
  'letmein', 'welcome', 'iloveyou', 'abc', 'abcd', 'abcdef', 'test', 'user', 'login', 'secret', 'manager', 'beyoot', 'bayout',
  'beyootmisr', 'bayoutmasr', 'misr', 'masr', 'egypt', 'cairo', 'legal', 'lawyer',
]);

/**
 * سياسة كلمة مرور قوية لحسابات «إدارة النظام» المنشأة من معالج الإعداد أو سطر الأوامر.
 * @returns {string|null} سبب الرفض بالعربية أو null إن كانت مقبولة
 */
export function strongPasswordProblem(password, { username } = {}) {
  const basic = passwordProblem(password);
  if (basic) return basic;
  const pw = String(password);
  if (pw.length < 10) return 'كلمة مرور مدير النظام يجب ألا تقل عن 10 أحرف';
  const classes = [/[\p{Ll}\p{Lo}]/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) => re.test(pw)).length;
  if (classes < 3) return 'كلمة المرور ضعيفة: استخدم ثلاثة أنواع على الأقل من (حروف صغيرة، حروف كبيرة، أرقام، رموز)';
  if (new Set(pw).size < 6) return 'كلمة المرور ضعيفة: حروفها مكررة وقليلة التنوع';
  const lower = pw.toLowerCase();
  if (username && String(username).length >= 3 && lower.includes(String(username).toLowerCase())) {
    return 'لا تستخدم اسم المستخدم داخل كلمة المرور';
  }
  const letters = latinDigits(lower).replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return 'كلمة المرور ضعيفة: أغلبها أرقام ورموز، أضف كلمة أو حروفًا يصعب تخمينها';
  if (WEAK_WORDS.has(letters)) return 'كلمة المرور سهلة التخمين (كلمة شائعة مع أرقام أو رموز)، اختر عبارة أخرى';
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/.test(lower) && letters.length < 6) {
    return 'كلمة المرور سهلة التخمين (تسلسل شائع)، اختر عبارة أطول وأقل توقعًا';
  }
  return null;
}

export const PASSWORD_POLICY = [
  '10 أحرف على الأقل',
  'ثلاثة أنواع على الأقل من: حروف صغيرة، حروف كبيرة، أرقام، رموز',
  'لا تحتوي على اسم المستخدم ولا على كلمة شائعة مثل admin أو password',
];

/** اسم مستخدم بنفس قواعد بقية الحسابات (حروف لاتينية وأرقام ونقطة وشرطة) */
export function usernameProblem(u) {
  const s = typeof u === 'string' ? u.trim() : '';
  if (!s) return 'اسم المستخدم مطلوب';
  if (s.length < 3 || s.length > 40) return 'اسم المستخدم يجب أن يكون من 3 إلى 40 حرفًا';
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return 'اسم المستخدم يقبل الحروف اللاتينية والأرقام والنقطة والشرطة فقط';
  return null;
}

/** ختم زمني لأسماء الملفات بتوقيت القاهرة: 20261006-1430 */
export function fileStamp(d = now()) {
  const p = cairoParts(d);
  const z = (n) => String(n).padStart(2, '0');
  return `${p.year}${z(p.month)}${z(p.day)}-${z(p.hour)}${z(p.minute)}`;
}

/** فحص سلامة ملف قاعدة بيانات SQLite (للقراءة فقط) */
export function quickCheck(file) {
  let d;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const rows = d.prepare('PRAGMA quick_check').all();
    const msg = rows.map((r) => Object.values(r)[0]).join('; ');
    return msg === 'ok' ? 'ok' : msg.slice(0, 300) || 'unknown';
  } catch (e) {
    return `error: ${String(e?.message || e).slice(0, 200)}`;
  } finally {
    try {
      d?.close();
    } catch {
      // مغلقة
    }
  }
}

/** إحصاء ملفات مجلد (عدد وحجم) دون اتباع الروابط الرمزية */
export function dirStats(dir) {
  let files = 0;
  let bytes = 0;
  for (const f of walkFiles(dir)) {
    files += 1;
    bytes += f.size;
  }
  return { files, bytes };
}

/** يمر على كل الملفات العادية داخل مجلد (مسار نسبي بفواصل /) */
export function* walkFiles(dir) {
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) stack.push(r);
      else if (e.isFile()) {
        let st;
        try {
          st = fs.statSync(path.join(dir, r));
        } catch {
          continue;
        }
        yield { rel: r, full: path.join(dir, r), size: st.size, mtime: st.mtimeMs / 1000 };
      }
    }
  }
}

function fileSize(f) {
  try {
    return fs.statSync(f).size;
  } catch {
    return 0;
  }
}

const AR_RE = /[؀-ۿ]/;
// عزل الاتجاه (LRI…PDI) للمسارات والقيم اللاتينية داخل جمل عربية
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const SECRETISH = /token|secret|key|password|authorization/i;

function scrubDetails(x, depth = 0) {
  if (x == null || depth > 4) return x ?? null;
  if (Array.isArray(x)) return x.slice(0, 20).map((i) => scrubDetails(i, depth + 1));
  if (typeof x === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(x)) {
      if (SECRETISH.test(k)) continue;
      out[k] = scrubDetails(val, depth + 1);
    }
    return out;
  }
  if (typeof x === 'string') return x.slice(0, 500);
  return x;
}

// ───────────────────────── التحقق من قيم التكاملات ─────────────────────────

const INTEGRATION_RULES = {
  whatsapp: {
    token: (s) => (/\s/.test(s) || s.length < 20 ? 'رمز الوصول غير صالح: نص طويل متصل بدون مسافات كما نسخته من ميتا' : null),
    phone_number_id: (s) => (/^\d{5,30}$/.test(s) ? null : 'معرّف رقم الهاتف (Phone Number ID) أرقام فقط'),
    waba_id: (s) => (/^\d{5,30}$/.test(s) ? null : 'معرّف حساب واتساب للأعمال (WABA ID) أرقام فقط'),
    app_secret: (s) => (/^[A-Za-z0-9]{16,128}$/.test(s) ? null : 'سر التطبيق (App Secret) حروف لاتينية وأرقام فقط (32 خانة عادة)'),
    verify_token: (s) => (/^[\x21-\x7e]{8,200}$/.test(s) ? null : 'رمز التحقق 8 خانات على الأقل من الحروف اللاتينية والأرقام والرموز بدون مسافات'),
    number: (s) =>
      !/^\d{8,15}$/.test(s)
        ? 'رقم واتساب غير صالح، اكتبه بالصيغة الدولية مثل 201211114662'
        : isPlaceholderWhatsApp(s)
          ? 'هذا رقم توضيحي وليس رقم واتساب المؤسسة؛ اكتب الرقم الفعلي مثل 201211114662'
          : null,
    api_version: (s) => (/^v\d{1,2}\.\d$/.test(s) ? null : 'إصدار Graph API يُكتب بالصيغة v21.0'),
    // v11 segment-server (§5.4): وضع الرقم الأساسي ورقم الأفراد والشركات (التحقق المترابط في app.segments.checkWhatsAppSave)
    segment: (s) => (['charity', 'shared'].includes(s) ? null : 'اختر ما يخدمه الرقم الأساسي من القائمة'),
    paid_phone_number_id: (s) => (/^\d{5,30}$/.test(s) ? null : 'معرّف رقم الأفراد والشركات (Phone Number ID) أرقام فقط'),
    paid_number: (s) =>
      !/^\d{8,15}$/.test(s)
        ? 'رقم واتساب الأفراد والشركات غير صالح، اكتبه بالصيغة الدولية مثل 201211114663'
        : isPlaceholderWhatsApp(s)
          ? 'هذا رقم توضيحي وليس رقم واتساب الأفراد والشركات'
          : null,
  },
  anthropic: {
    api_key: (s) => (/^sk-ant-[A-Za-z0-9_-]{10,300}$/.test(s) ? null : 'مفتاح Anthropic غير صالح: يبدأ بـ sk-ant- كما يظهر في console.anthropic.com'),
    model: (s) => (/^[a-z0-9][a-z0-9._-]{2,80}(\[1m\])?$/i.test(s) ? null : 'اسم النموذج غير صالح، مثل claude-opus-5-5'),
    effort: (s) => (['low', 'medium', 'high', 'xhigh', 'max'].includes(s) ? null : 'اختر مستوى الجهد من القائمة: منخفض أو متوسط أو مرتفع أو مرتفع جدًا أو أقصى جهد'),
    provider: (s) => (['auto', 'anthropic', 'heuristic'].includes(s) ? null : 'اختر وضع التشغيل من القائمة: تلقائي أو Claude دائمًا أو المحلل المحلي فقط'),
    monthly_budget_usd: (s) => {
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 && n <= 100000 ? null : 'سقف الإنفاق رقم بالدولار من 0 إلى 100000';
    },
  },
  // v10 b2b-server (CS-4): لا CR/LF/NUL في أي قيمة تصل ترويسة أو أمرًا، والمنافذ والتشفير من القائمة فقط
  email: {
    provider: (s) => (['outbox', 'smtp'].includes(s) ? null : 'اختر طريقة الإرسال من القائمة'),
    smtp_host: (s) => (/^[A-Za-z0-9.-]{1,253}$/.test(s) ? null : 'اسم خادم SMTP غير صالح، مثل smtp.example.com'),
    smtp_port: (s) => (['25', '465', '587', '2525'].includes(s) ? null : 'المنافذ المسموحة: 25 أو 465 أو 587 أو 2525'),
    smtp_security: (s) => (['starttls', 'tls'].includes(s) ? null : 'اختر STARTTLS أو TLS'),
    smtp_user: (s) => (/[\r\n\0]/.test(s) || s.length > 254 ? 'اسم المستخدم غير صالح' : null),
    smtp_password: (s) => (/[\r\n\0]/.test(s) ? 'كلمة المرور تحتوي على رموز غير مسموحة' : null),
    from_address: (s) => (s.length <= 254 && /^[^\s"'<>()[\],;:\\@]+@[^\s"'<>()[\],;:\\@]+\.[^\s"'<>()[\],;:\\@]+$/.test(s) ? null : 'عنوان المرسل غير صالح، مثل legal@example.com'),
    from_name: (s) => (/[\p{Cc}\p{Cf}<>]/u.test(s) || s.length > 80 ? 'اكتب اسم المرسل بحروف عادية بلا رموز تحكم أو أقواس (80 حرفًا على الأكثر)' : null),
  },
};

function normalizeIntegrationValue(name, key, raw) {
  let s = latinDigits(String(raw)).trim();
  if (name === 'whatsapp' && (key === 'number' || key === 'paid_number')) {
    const p = normalizePhone(s);
    s = p ? p.replace(/^\+/, '') : s.replace(/\D/g, '');
  }
  if (name === 'whatsapp' && (key === 'phone_number_id' || key === 'waba_id' || key === 'paid_phone_number_id')) s = s.replace(/\s/g, '');
  if (name === 'whatsapp' && key === 'segment') s = s.toLowerCase(); // v11 segment-server
  if (name === 'anthropic' && (key === 'effort' || key === 'provider')) s = s.toLowerCase();
  if (name === 'anthropic' && key === 'monthly_budget_usd') s = String(Number(s));
  if (name === 'email' && key === 'smtp_password') s = String(raw); // v10 b2b-server: كلمة المرور كما كُتبت
  if (name === 'email' && ['provider', 'smtp_security', 'smtp_host', 'from_address'].includes(key)) s = s.toLowerCase(); // v10 b2b-server
  return s;
}

/**
 * ينظف ويتحقق من قيم تكامل قبل الحفظ.
 * allowClear: القيمة الفارغة تعني «احذف القيمة المحفوظة». بدونه تُتجاهل القيم الفارغة.
 */
export function cleanIntegrationPatch(name, raw, { allowClear = false } = {}) {
  const spec = INTEGRATION_SPEC[name];
  if (!spec) throw notFound('التكامل غير معروف');
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('بيانات التكامل غير صالحة');
  const out = {};
  const errors = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!spec.fields[key]) throw badRequest(`حقل غير معروف: ${key}`);
    if (val === null || val === undefined || String(val).trim() === '') {
      if (allowClear) out[key] = '';
      continue;
    }
    if (typeof val !== 'string' && typeof val !== 'number') {
      errors[key] = `قيمة «${spec.fields[key].label}» غير صالحة`;
      continue;
    }
    const s = normalizeIntegrationValue(name, key, val);
    if (s.length > 2000) {
      errors[key] = 'القيمة أطول من المسموح';
      continue;
    }
    const problem = INTEGRATION_RULES[name]?.[key]?.(s);
    if (problem) errors[key] = problem;
    else out[key] = s;
  }
  const keys = Object.keys(errors);
  if (keys.length) throw badRequest(errors[keys[0]], { fields: errors });
  return out;
}

// ───────────────────────── الخدمة ─────────────────────────

export function createSystem(app) {
  const { db, config } = app;
  const startedAt = nowIso();
  const memoryDb = config.dbPath === ':memory:';
  const backupsDir = path.join(config.dataDir || path.dirname(config.dbPath), 'backups');
  const setupLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: SETUP_ATTEMPTS_PER_IP });
  let setupActive = false;
  let backupRunning = false;
  let exportRunning = false;
  const testing = new Set();

  /** مسار للعرض: نسبي إلى مجلد المشروع إن كان داخله، وإلا المسار الكامل */
  const displayPath = (p) => {
    const rel = path.relative(config.root || process.cwd(), p);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
  };
  const keyFileDisplay = () => displayPath(path.join(config.dataDir || path.dirname(config.dbPath), '.secret-key'));
  const userCount = () => Number(db.value('SELECT COUNT(*) FROM users'));
  const setupRow = () => db.get('SELECT * FROM system_setup WHERE id = 1');

  function baseUrlFromRequest(ctx) {
    if (config.publicBaseUrl) return config.publicBaseUrl;
    const trust = process.env.TRUST_PROXY === '1';
    const h = ctx?.req?.headers || {};
    const first = (x) => String(x || '').split(',')[0].trim();
    let proto = trust && h['x-forwarded-proto'] ? first(h['x-forwarded-proto']) : ctx?.req?.socket?.encrypted ? 'https' : 'http';
    if (!['http', 'https'].includes(proto)) proto = 'http';
    let host = trust && h['x-forwarded-host'] ? first(h['x-forwarded-host']) : String(h.host || '');
    if (!/^[A-Za-z0-9.\-:[\]]{1,255}$/.test(host)) host = `localhost:${config.port}`;
    return `${proto}://${host}`;
  }

  function notFoundHtml(res) {
    // صفحة 404 بهوية الموقع العام إن توفرت (src/app.js)
    if (typeof app.notFoundPage === 'function') {
      app.notFoundPage(res);
      return;
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة غير موجودة</title>' +
        '<style>body{font-family:Tahoma,sans-serif;background:#f6f7f8;color:#1d2a30;display:grid;place-items:center;min-height:100vh;margin:0}main{text-align:center;padding:24px}a{color:#0b3d29}</style></head>' + // v10 experience: H-E4 · v11 gate fixer-server (R-18): أخضر الشعار
        '<body><main><h1>الصفحة غير موجودة</h1><p>تأكد من الرابط أو عد إلى <a href="/">الصفحة الرئيسية</a>.</p></main></body></html>',
    );
  }

  function settingsSnapshot() {
    const s = app.settings.all();
    return Object.fromEntries(ORG_FIELDS.map(([k]) => [k, s[k] ?? '']));
  }

  function validateOrg(org = {}) {
    if (org === null || typeof org !== 'object' || Array.isArray(org)) throw badRequest('بيانات المؤسسة غير صالحة');
    const out = {};
    const errors = {};
    for (const [key, label, max, required] of ORG_FIELDS) {
      try {
        const s = v.str(org[key], label, { required, max });
        if (s === null) {
          if (org[key] !== undefined) out[key] = '';
          continue;
        }
        if (key === 'org_phone' || key === 'whatsapp_display_number') {
          if (!normalizePhone(s)) throw badRequest(`رقم «${label}» غير صالح`);
          if (key === 'whatsapp_display_number' && isPlaceholderWhatsApp(s)) throw badRequest('هذا رقم توضيحي وليس رقم واتساب المؤسسة؛ اكتب الرقم الفعلي أو اترك الحقل فارغًا');
        }
        if (key === 'org_facebook_url') {
          let u;
          try {
            u = new URL(s);
          } catch {
            throw badRequest('رابط صفحة فيسبوك غير صالح');
          }
          if (u.protocol !== 'https:' || !/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(u.hostname)) {
            throw badRequest('رابط صفحة فيسبوك يجب أن يبدأ بـ https://www.facebook.com/');
          }
        }
        out[key] = s;
      } catch (e) {
        errors[key] = e.message;
      }
    }
    const keys = Object.keys(errors);
    if (keys.length) throw badRequest(errors[keys[0]], { fields: errors });
    return out;
  }

  // ───────── وضع الإعداد الأول ─────────

  function markSetupCompleted(method, userId = null, ip = null) {
    db.run(
      `INSERT INTO system_setup (id, token_hash, method, completed_at, completed_by, completed_ip) VALUES (1, NULL, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET token_hash = NULL, token_expires_at = NULL, method = excluded.method,
         completed_at = excluded.completed_at, completed_by = excluded.completed_by, completed_ip = excluded.completed_ip`,
      method,
      nowIso(),
      userId,
      ip,
    );
    setupActive = false;
  }

  /**
   * يتحقق من رمز الإعداد (ثابت التوقيت) ويعيد صف الحالة أو يرمي خطأ.
   * المحاولات الخاطئة تُعد وتُسجل (أول 10 ثم كل 50) لكنها لا تُلغي الرمز: الحماية من التخمين بطول الرمز وحد المعدل لكل IP.
   */
  function checkSetupToken(token, ctx) {
    if (!svc.isSetupMode()) throw notFound('الصفحة غير موجودة');
    setupLimiter.hit(ctx?.ip || 'unknown');
    const row = setupRow();
    if (!row?.token_hash) {
      throw forbidden('لا يوجد رمز إعداد صالح. أعد تشغيل الخادم للحصول على رابط إعداد جديد من سجل التشغيل.');
    }
    const given = typeof token === 'string' ? token.trim() : '';
    const a = Buffer.from(sha256(given), 'hex');
    const b = Buffer.from(row.token_hash, 'hex');
    const ok = given.length >= 16 && given.length <= 200 && a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      const failed = Number(row.failed_attempts || 0) + 1;
      db.run('UPDATE system_setup SET failed_attempts = ? WHERE id = 1', failed);
      if (failed <= 10 || failed % 50 === 0) {
        app.audit?.log({ ctx, type: 'system.setup_token_failed', severity: 'warning', summary: `محاولة إعداد أول برمز غير صحيح (المحاولة رقم ${failed})`, data: { failed_attempts: failed } });
      }
      throw forbidden('رمز الإعداد غير صحيح. انسخ الرابط كاملًا كما ظهر في سجل تشغيل الخادم (Logs).');
    }
    if (row.token_expires_at && row.token_expires_at <= nowIso()) {
      throw forbidden('انتهت صلاحية رمز الإعداد. أعد تشغيل الخادم للحصول على رابط جديد من سجل التشغيل.');
    }
    return row;
  }

  // ───────── النسخ الاحتياطي ─────────

  function backupPath(file) {
    if (typeof file !== 'string' || !BACKUP_FILE_RE.test(file)) throw notFound('النسخة الاحتياطية غير موجودة');
    const full = path.join(backupsDir, file);
    if (!fs.existsSync(full)) throw notFound('النسخة الاحتياطية غير موجودة');
    return full;
  }

  function backupFiles() {
    let names = [];
    try {
      names = fs.readdirSync(backupsDir).filter((n) => BACKUP_FILE_RE.test(n));
    } catch {
      return [];
    }
    return names
      .map((file) => {
        try {
          const st = fs.statSync(path.join(backupsDir, file));
          return st.isFile() ? { file, size_bytes: st.size, mtime: st.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime || b.file.localeCompare(a.file));
  }

  function prune(keep) {
    const n = Math.max(1, Math.floor(Number(keep) || 14));
    const removed = [];
    for (const f of backupFiles().slice(n)) {
      try {
        fs.rmSync(path.join(backupsDir, f.file), { force: true });
        removed.push(f.file);
        db.run("UPDATE system_backups SET deleted_at = ?, deleted_reason = 'retention' WHERE file = ? AND deleted_at IS NULL", nowIso(), f.file);
      } catch (e) {
        app.log(`backup prune failed for ${f.file}`, e);
      }
    }
    return removed;
  }

  /** لقطة متسقة لقاعدة البيانات أثناء التشغيل (VACUUM INTO) في ملف مؤقت ثم فحص سلامتها */
  function snapshotTo(target) {
    if (memoryDb) throw conflict('قاعدة البيانات تعمل في الذاكرة ولا يمكن نسخها احتياطيًا');
    if (db.depth > 0) throw conflict('لا يمكن إنشاء نسخة احتياطية أثناء معاملة مفتوحة');
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.rmSync(target, { force: true });
    db.raw.prepare('VACUUM INTO ?').run(target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // أنظمة ملفات لا تدعم الصلاحيات
    }
    return quickCheck(target);
  }

  function lastBackup() {
    const f = backupFiles()[0];
    if (!f) return null;
    const row = db.get('SELECT created_at FROM system_backups WHERE file = ?', f.file);
    const created = row?.created_at || new Date(f.mtime).toISOString();
    return { file: f.file, size_bytes: f.size_bytes, created_at: created, age_hours: Math.max(0, (Date.now() - Date.parse(created)) / 3600000) };
  }

  function jobState(name) {
    return app.jobs.list().find((j) => j.name === name) || null;
  }

  // ───────── التكاملات ─────────

  function testTarget(name) {
    return name === 'whatsapp' ? app.whatsapp : name === 'anthropic' ? app.ai : name === 'email' ? app.email : null; // v10 b2b-server: email
  }

  /**
   * بصمة قصيرة لبيانات الاعتماد التي اختُبرت (لا تكشف القيمة): تُحفظ مع نتيجة الاختبار حتى نعرف
   * أن آخر اختبار يخص البيانات الحالية لا بيانات سابقة (تغيرت من لوحة الإدارة أو من متغيرات البيئة).
   */
  function credFingerprint(name) {
    const eff = app.integrations.get(name);
    const parts = name === 'whatsapp' ? [eff.token, eff.phone_number_id] : name === 'email' ? [eff.provider, eff.smtp_host, eff.smtp_port, eff.smtp_user, eff.smtp_password, eff.from_address] : [eff.api_key, eff.model]; // v10 b2b-server
    return sha256(`bm-cred-fp|${name}|${parts.map((x) => x || '').join('|')}`).slice(0, 16);
  }

  function lastTest(name) {
    const r = db.get(
      `SELECT t.*, u.name AS tested_by_name FROM integration_tests t LEFT JOIN users u ON u.id = t.tested_by
       WHERE t.name = ? ORDER BY t.id DESC LIMIT 1`,
      name,
    );
    if (!r) return null;
    const details = parseJson(r.details, null);
    const fp = details && typeof details === 'object' ? details.cred_fp : undefined;
    let clean = details;
    if (fp !== undefined) {
      const { cred_fp: _fp, ...rest } = details;
      clean = Object.keys(rest).length ? rest : null;
    }
    // نتيجة قديمة: اختُبرت بيانات اعتماد مختلفة عن الحالية (أو حُفظت البيانات بعد الاختبار ولا بصمة للمقارنة)
    const meta = db.get('SELECT updated_at FROM integration_secrets WHERE name = ?', name);
    const stale = fp ? fp !== credFingerprint(name) : !!(meta?.updated_at && r.tested_at < meta.updated_at);
    return { ...r, ok: !!r.ok, details: clean, stale };
  }

  /**
   * حالة واتساب الفعلية للعرض (صحة النظام، لوحة المتابعة، صفحة التكاملات):
   * «متصل» فقط بعد اختبار اتصال ناجح لبيانات الاعتماد الحالية؛ وإلا «لم يُختبر» أو «فشل آخر اختبار».
   */
  function whatsappState(configured, test) {
    if (!configured) return { state: 'simulation', label: 'وضع المحاكاة (لا تُرسل رسائل فعلية)' };
    if (!test || test.stale) return { state: 'untested', label: 'مضبوط (لم يُختبر الاتصال بعد)' };
    if (!test.ok) return { state: 'failed', label: 'مضبوط — فشل آخر اختبار للاتصال' };
    return { state: 'connected', label: 'متصل بـ WhatsApp Cloud API' };
  }

  function integrationItem(name) {
    const st = app.integrations.status(name);
    const eff = app.integrations.get(name);
    const meta = db.get(
      'SELECT s.updated_at, u.name AS updated_by_name FROM integration_secrets s LEFT JOIN users u ON u.id = s.updated_by WHERE s.name = ?',
      name,
    );
    const fields = Object.entries(st.fields).map(([key, f]) => ({ key, ...f }));
    const item = {
      name,
      label: st.label,
      fields,
      undecryptable: !!st.undecryptable,
      configured: name === 'whatsapp' ? !!(eff.token && eff.phone_number_id) : name === 'email' ? eff.provider === 'smtp' && !!eff.smtp_host && !!eff.from_address : !!eff.api_key, // v10 b2b-server: email
      test_available: typeof testTarget(name)?.test === 'function',
      last_test: lastTest(name),
      updated_at: meta?.updated_at || null,
      updated_by_name: meta?.updated_by_name || null,
    };
    if (name === 'whatsapp') {
      // live: الإرسال الحقيقي مفعّل (بيانات مضبوطة)؛ state/label: هل ثبت الاتصال فعلًا باختبار ناجح للبيانات الحالية
      const live = !!app.whatsapp?.configured;
      const st2 = whatsappState(live, item.last_test);
      item.runtime = { live, state: st2.state, label: st2.label };
      item.app_secret_set = !!eff.app_secret;
      item.verify_token_set = !!eff.verify_token;
      // v11 segment-server [r2 S4]: رقم الأفراد والشركات يظهر للعامة فقط بعد التحقق منه في «اختبار الاتصال»
      item.paid_verified_at = app.segments?.paidVerifiedAt?.() || null;
    } else {
      const ai = app.ai?.status?.() || {};
      item.runtime = { live: ai.provider === 'anthropic', label: ai.label || '', provider: ai.provider || null, model: ai.model || null };
    }
    return item;
  }

  function normalizeTestResult(r) {
    if (r === true) return { ok: true, message: 'نجح الاتصال' };
    if (r === false || r == null) return { ok: false, message: 'فشل اختبار الاتصال' };
    if (typeof r === 'string') return { ok: true, message: r };
    const ok = r.ok !== false && !r.error;
    const raw = r.message || r.label || (typeof r.error === 'string' ? r.error : null) || (ok ? 'نجح الاتصال' : 'فشل اختبار الاتصال');
    const message = AR_RE.test(raw) ? raw : ok ? `نجح الاتصال: ${raw}` : `فشل الاتصال: ${raw}`;
    const { ok: _o, message: _m, label: _l, error: _e, ...rest } = r;
    const details = scrubDetails(r.details !== undefined ? r.details : Object.keys(rest).length ? rest : null);
    return { ok, message: String(message).slice(0, 500), details };
  }

  /** يسجل نسخة تلقائية أُنشئت خارج المجدول تشغيلًا ناجحًا لمهمة النسخ اليومي (فلا يكررها المجدول فورًا) */
  function recordBackupJob(b) {
    const t = nowIso();
    db.run(
      `INSERT INTO job_runs (name, last_started_at, last_finished_at, last_ok_at, last_error, last_result, runs) VALUES ('backup', ?, ?, ?, NULL, ?, 1)
       ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at, last_finished_at = excluded.last_finished_at,
         last_ok_at = excluded.last_ok_at, last_error = NULL, last_result = excluded.last_result, runs = runs + 1`,
      t,
      t,
      t,
      JSON.stringify({ file: b.file, size_bytes: b.size_bytes, pruned: b.pruned.length }),
    );
  }

  // ───────── الواجهة العامة للخدمة ─────────

  const svc = {
    startedAt,
    backupsDir,

    // ===== الإعداد الأول =====
    isSetupMode() {
      if (!setupActive) return false;
      if (userCount() > 0) {
        setupActive = false;
        return false;
      }
      return true;
    },

    /** يبدأ وضع الإعداد: رمز جديد (يُخزن مُجزّأً) صالح لمدة SETUP_TTL_HOURS، ويُلغي أي رمز سابق */
    beginSetup() {
      if (userCount() > 0) throw conflict('تم إعداد المنصة بالفعل');
      const token = randomToken(24);
      const created = nowIso();
      const expires = addHours(created, SETUP_TTL_HOURS);
      db.run(
        `INSERT INTO system_setup (id, token_hash, token_created_at, token_expires_at, failed_attempts) VALUES (1, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET token_hash = excluded.token_hash, token_created_at = excluded.token_created_at,
           token_expires_at = excluded.token_expires_at, failed_attempts = 0, completed_at = NULL, completed_by = NULL, method = NULL`,
        sha256(token),
        created,
        expires,
      );
      setupActive = true;
      const base = config.publicBaseUrl || `http://localhost:${config.port}`;
      return { token, url: `${base}/setup#token=${token}`, expires_at: expires };
    },

    markSetupCompleted,

    /**
     * حارس وضع الإعداد: يُستدعى في بداية كل طلب HTTP.
     * يعيد true إذا أرسل الرد بنفسه (503 أو تحويل)، وfalse ليكمل الطلب مساره العادي.
     */
    gate(req, res, url) {
      if (!setupActive || !svc.isSetupMode()) return false;
      const p = url.pathname;
      if (p.startsWith('/api/setup/') || p === '/api/meta' || p === '/healthz') return false;
      if (p.startsWith('/api/') || p.startsWith('/webhooks/')) {
        res.setHeader('Retry-After', '300');
        // نموذج الطلب وبوابة المستفيد: رسالة مفهومة للمستفيد بدل تعليمات تقنية موجهة لمدير النظام
        if (p.startsWith('/api/public/') || p.startsWith('/api/portal/')) {
          let phone = '';
          try {
            phone = String(app.settings.get('org_phone') || '').trim();
          } catch {
            phone = '';
          }
          sendJson(res, 503, {
            error: `الخدمة قيد التجهيز حاليًا ولا تستقبل الطلبات عبر الموقع بعد.${phone ? ` للتواصل اتصل بنا على ${phone}.` : ' حاول مرة أخرى لاحقًا.'}`,
            code: 'service_unavailable',
          });
          return true;
        }
        sendJson(res, 503, {
          error: 'المنصة في وضع الإعداد الأول ولم يُنشأ حساب مدير النظام بعد. أكمل الإعداد من الرابط الظاهر في سجل تشغيل الخادم.',
          code: 'setup_required',
        });
        return true;
      }
      if (p === '/app' || p === '/app/') {
        res.statusCode = 302;
        res.setHeader('Location', '/setup');
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return true;
      }
      return false;
    },

    setupStatus(ctx) {
      if (!svc.isSetupMode()) throw notFound('الصفحة غير موجودة');
      const row = setupRow();
      return {
        setup_required: true,
        version: app.version,
        token_expires_at: row?.token_expires_at || null,
        defaults: settingsSnapshot(),
        org_fields: ORG_FIELDS.map(([key, label, max, required]) => ({ key, label, max, required })),
        password_policy: PASSWORD_POLICY,
        integrations: Object.fromEntries(
          Object.entries(INTEGRATION_SPEC).map(([name, s]) => [
            name,
            {
              label: s.label,
              fields: Object.entries(s.fields).map(([key, f]) => ({ key, label: f.label, secret: !!f.secret, env: f.env, default: f.default || null, from_env: !!(f.cfg && f.cfg(config)) })),
            },
          ]),
        ),
        key_source: app.integrations.keySource,
        webhook_url: `${baseUrlFromRequest(ctx)}/webhooks/whatsapp`,
      };
    },

    verifySetupToken(token, ctx) {
      const row = checkSetupToken(token, ctx);
      return { ok: true, expires_at: row.token_expires_at };
    },

    /** إتمام الإعداد: ملف المؤسسة + حساب مدير النظام الأول + (اختياريًا) مفاتيح التكاملات */
    completeSetup(body, ctx) {
      const b = body || {};
      checkSetupToken(b.token, ctx);
      const settings = validateOrg(b.org || {});
      const a = b.admin || {};
      const fieldErrors = {};
      let name;
      try {
        name = v.str(a.name, 'اسم مدير النظام', { required: true, min: 3, max: 100 });
      } catch (e) {
        fieldErrors.name = e.message;
      }
      const username = typeof a.username === 'string' ? a.username.trim() : '';
      const uProblem = usernameProblem(username);
      if (uProblem) fieldErrors.username = uProblem;
      let email = null;
      try {
        email = v.email(a.email, 'البريد الإلكتروني');
      } catch (e) {
        fieldErrors.email = e.message;
      }
      const password = typeof a.password === 'string' ? a.password : '';
      const pProblem = strongPasswordProblem(password, { username });
      if (pProblem) fieldErrors.password = pProblem;
      else if (a.password_confirm !== undefined && a.password_confirm !== password) fieldErrors.password_confirm = 'تأكيد كلمة المرور غير مطابق';
      const keys = Object.keys(fieldErrors);
      if (keys.length) throw badRequest(fieldErrors[keys[0]], { fields: fieldErrors, step: 'admin' });

      const integ = b.integrations && typeof b.integrations === 'object' ? b.integrations : {};
      const patches = {};
      for (const n of Object.keys(INTEGRATION_SPEC)) {
        try {
          const p = cleanIntegrationPatch(n, integ[n]);
          if (Object.keys(p).length) patches[n] = p;
        } catch (e) {
          if (e instanceof ApiError) throw new ApiError(e.status, e.message, e.code, { ...(e.details || {}), step: 'integrations', integration: n });
          throw e;
        }
      }
      // رقم واتساب المؤسسة مصدره واحد هو «التكاملات»: إن كُتب في ملف المؤسسة فقط يُحفظ رقمًا للتكامل،
      // وإن كُتب في خطوة التكاملات فقط يظهر كذلك في الإعدادات العامة (بصيغة دولية)
      const orgWa = publicWhatsAppDigits(settings.whatsapp_display_number);
      if (orgWa && !patches.whatsapp?.number) patches.whatsapp = { ...(patches.whatsapp || {}), number: orgWa };
      else if (!orgWa && patches.whatsapp?.number) settings.whatsapp_display_number = `+${patches.whatsapp.number}`;

      let userId;
      db.tx(() => {
        if (userCount() > 0) throw conflict('تم إعداد المنصة بالفعل');
        userId = db.insert('users', {
          role: 'admin',
          username,
          name,
          email,
          password_hash: hashPassword(password),
          active: 1,
          created_at: nowIso(),
        });
        for (const [k, val] of Object.entries(settings)) app.settings.set(k, val);
        markSetupCompleted('wizard', userId, ctx?.ip || null);
      });
      const actor = db.get('SELECT * FROM users WHERE id = ?', userId);
      for (const [n, p] of Object.entries(patches)) {
        try {
          app.integrations.set(n, p, actor, ctx);
        } catch (e) {
          app.log(`setup: saving integration ${n} failed`, e);
        }
      }
      app.audit?.log({
        actor,
        ctx,
        type: 'system.setup_completed',
        severity: 'warning',
        summary: 'اكتمل الإعداد الأول للمنصة وأُنشئ حساب مدير النظام الأول',
        data: { username, integrations: Object.keys(patches), org_fields: Object.keys(settings) },
      });
      app.events?.emit('system.setup_completed', { userId });
      // أول نسخة احتياطية الآن (المنصة جديدة لكن الإعدادات ومفاتيح التكاملات تستحق النسخ)
      svc.initialBackup();
      let user = null;
      try {
        user = app.auth.login(ctx, username, password);
      } catch (e) {
        app.log('setup: auto-login failed', e);
      }
      return { ok: true, user: user && user.id ? user : null, redirect: '/app' };
    },

    // ===== النسخ الاحتياطي =====
    /** ينشئ نسخة احتياطية الآن. kind: auto | manual | pre_restore */
    backupNow({ kind = 'manual', actor = null, ctx = null } = {}) {
      if (backupRunning) throw conflict('توجد نسخة احتياطية قيد الإنشاء الآن، انتظر لحظات ثم حاول مرة أخرى');
      backupRunning = true;
      try {
        fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 });
        const stamp = fileStamp();
        // اسم لم يُستخدم من قبل (لا على القرص ولا في السجل) حتى لا يُعاد إحياء سجل نسخة محذوفة بنفس الاسم
        const taken = (name) => fs.existsSync(path.join(backupsDir, name)) || !!db.get('SELECT 1 FROM system_backups WHERE file = ?', name);
        let file = `platform-${stamp}.db`;
        for (let i = 2; taken(file) && i < 1000; i++) file = `platform-${stamp}-${i}.db`;
        const tmp = path.join(backupsDir, `.${file}.partial`);
        const t0 = Date.now();
        let integrity;
        try {
          integrity = snapshotTo(tmp);
          if (integrity !== 'ok') throw new Error(`integrity check failed: ${integrity}`);
          fs.renameSync(tmp, path.join(backupsDir, file));
        } finally {
          fs.rmSync(tmp, { force: true });
        }
        const duration = Date.now() - t0;
        const size = fileSize(path.join(backupsDir, file));
        const created = nowIso();
        db.run(
          `INSERT INTO system_backups (file, kind, size_bytes, duration_ms, integrity, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(file) DO UPDATE SET kind = excluded.kind, size_bytes = excluded.size_bytes, duration_ms = excluded.duration_ms,
             integrity = excluded.integrity, created_by = excluded.created_by, created_at = excluded.created_at, deleted_at = NULL, deleted_reason = NULL`,
          file,
          kind,
          size,
          duration,
          integrity,
          actor?.id ?? null,
          created,
        );
        const pruned = prune(app.settings.get('backup_retention'));
        app.audit?.log({
          actor,
          ctx,
          type: 'backup.created',
          severity: 'info',
          summary: kind === 'auto' ? `نسخة احتياطية تلقائية ${file}` : `نسخة احتياطية يدوية ${file}`,
          data: { file, size_bytes: size, kind, pruned },
        });
        return { file, kind, size_bytes: size, duration_ms: duration, integrity, created_at: created, pruned };
      } finally {
        backupRunning = false;
      }
    },

    /**
     * البيانات التجريبية: نسخة «تلقائية» حقيقية تُنشأ بعد اكتمال كل البيانات التجريبية (من bootstrap) حتى تكون
     * قابلة للتنزيل والاستعادة ومطابقة لما يراه المستخدم، مع تسجيل آخر تشغيل لمهمة النسخ اليومي فلا يكررها المجدول فور البدء.
     */
    demoBackup() {
      if (memoryDb) return null;
      const b = svc.backupNow({ kind: 'auto' });
      recordBackupJob(b);
      return b;
    },

    /**
     * أول نسخة احتياطية فور اكتمال الإعداد الأول (من المعالج): لا ننتظر دورة المهمة اليومية (24 ساعة) لأول نسخة.
     * تُسجل تشغيلًا ناجحًا لمهمة «backup» فتبدأ الدورة اليومية من الآن. لا تُفشل الإعداد إن تعذرت (تعيد المجدول المحاولة).
     */
    initialBackup() {
      if (memoryDb || !app.settings.get('backup_enabled')) return null;
      try {
        const b = svc.backupNow({ kind: 'auto' });
        recordBackupJob(b);
        return b;
      } catch (e) {
        app.log('initial backup after setup failed', e);
        return null;
      }
    },

    listBackups() {
      const rows = Object.fromEntries(
        db
          .all('SELECT b.*, u.name AS created_by_name FROM system_backups b LEFT JOIN users u ON u.id = b.created_by WHERE b.deleted_at IS NULL')
          .map((r) => [r.file, r]),
      );
      return backupFiles().map((f) => {
        const r = rows[f.file];
        return {
          file: f.file,
          size_bytes: f.size_bytes,
          created_at: r?.created_at || new Date(f.mtime).toISOString(),
          kind: r?.kind || null,
          integrity: r?.integrity || null,
          duration_ms: r?.duration_ms ?? null,
          created_by_name: r?.created_by_name || null,
        };
      });
    },

    backupsOverview() {
      const items = svc.listBackups();
      const last = lastBackup();
      return {
        enabled: !!app.settings.get('backup_enabled'),
        retention: Number(app.settings.get('backup_retention')) || 14,
        directory: displayPath(backupsDir),
        available: !memoryDb,
        items,
        total_bytes: items.reduce((s, x) => s + x.size_bytes, 0),
        last,
        stale: !last || last.age_hours > BACKUP_STALE_HOURS,
        stale_after_hours: BACKUP_STALE_HOURS,
        job: jobState('backup'),
      };
    },

    saveBackupSettings(body, actor, ctx) {
      const b = body || {};
      const out = {};
      if (b.enabled !== undefined) out.backup_enabled = v.bool(b.enabled);
      if (b.retention !== undefined) out.backup_retention = v.int(b.retention, 'عدد النسخ المحتفظ بها', { required: true, min: 1, max: 365 });
      if (!Object.keys(out).length) throw badRequest('لم تُرسل أي إعدادات');
      for (const [k, val] of Object.entries(out)) app.settings.set(k, val);
      app.audit?.log({
        actor,
        ctx,
        type: 'backup.settings_changed',
        severity: out.backup_enabled === false ? 'warning' : 'info',
        summary: out.backup_enabled === false ? 'إيقاف النسخ الاحتياطي التلقائي' : 'تعديل إعدادات النسخ الاحتياطي',
        data: out,
      });
      return svc.backupsOverview();
    },

    /** يتحقق من اسم ملف نسخة احتياطية ووجوده (404 إن لم يوجد) ويعيد الاسم — قبل إصدار رابط التنزيل */
    checkBackupFile(file) {
      backupPath(file);
      return file;
    },

    /** هل يمكن بدء تصدير كامل الآن؟ (يرمي 409 إن كان تصدير آخر يعمل أو كانت قاعدة البيانات في الذاكرة) */
    checkExportAvailable() {
      if (exportRunning) throw conflict('يجري تصدير آخر الآن، انتظر حتى ينتهي');
      if (memoryDb) throw conflict('قاعدة البيانات تعمل في الذاكرة ولا يمكن تصديرها');
      return true;
    },

    /** إرسال ملف نسخة احتياطية للتنزيل (متدفق) مع تسجيله في سجل الأمان */
    sendBackup(ctx, file, actor) {
      const full = backupPath(file);
      const size = fileSize(full);
      app.audit?.log({
        actor,
        ctx,
        type: 'backup.downloaded',
        severity: 'warning',
        summary: `تنزيل النسخة الاحتياطية ${file}`,
        data: { file, size_bytes: size },
      });
      const res = ctx.res;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.setHeader('Content-Length', size);
      res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
      res.setHeader('Cache-Control', 'no-store');
      const stream = fs.createReadStream(full);
      stream.on('error', (e) => {
        app.log('backup download stream failed', e);
        res.destroy(e);
      });
      stream.pipe(res);
    },

    deleteBackup(file, actor, ctx) {
      const full = backupPath(file);
      fs.rmSync(full, { force: true });
      db.run("UPDATE system_backups SET deleted_at = ?, deleted_reason = 'manual' WHERE file = ? AND deleted_at IS NULL", nowIso(), file);
      app.audit?.log({ actor, ctx, type: 'backup.deleted', severity: 'warning', summary: `حذف النسخة الاحتياطية ${file}`, data: { file } });
      return { ok: true };
    },

    // ===== التصدير الكامل =====
    /**
     * يبث أرشيف .tar.gz كاملًا: README.txt + data/platform.db (لقطة متسقة) + data/uploads/** + (اختياريًا) data/.secret-key
     * ثم manifest.json في النهاية بتجزئات sha256 لكل ملف.
     */
    async exportArchive(ctx, actor, { includeKey = false } = {}) {
      if (exportRunning) throw conflict('يجري تصدير آخر الآن، انتظر حتى ينتهي');
      if (memoryDb) throw conflict('قاعدة البيانات تعمل في الذاكرة ولا يمكن تصديرها');
      exportRunning = true;
      const stamp = fileStamp();
      const root = `beyoot-legal-export-${stamp}`;
      const tmp = path.join(backupsDir, `.export-${randomToken(6)}.db`);
      try {
        const integrity = snapshotTo(tmp);
        if (integrity !== 'ok') throw new ApiError(500, 'فشل فحص سلامة لقطة قاعدة البيانات، لم يُنشأ التصدير', 'integrity_failed');
        const keySource = app.integrations.keySource;
        const keyFile = path.join(config.dataDir || path.dirname(config.dbPath), '.secret-key');
        const withKey = includeKey && keySource === 'file' && fs.existsSync(keyFile);
        // مفاتيح تنبيهات الأجهزة (Web Push) تُنقل مع المفاتيح حتى لا يُضطر المحامون لإعادة تفعيل التنبيهات بعد نقل الخادم
        const vapidFile = path.join(config.dataDir || path.dirname(config.dbPath), 'vapid.json');
        const withVapid = includeKey && fs.existsSync(vapidFile);
        const counts = {};
        for (const t of ['users', 'clients', 'intakes', 'cases', 'matters', 'documents', 'messages']) {
          try {
            counts[t] = Number(db.value(`SELECT COUNT(*) FROM ${t}`));
          } catch {
            // جدول غير موجود
          }
        }
        const s = app.settings.all();
        const files = [];
        const readme = [
          'Beyoot Misr legal platform — full export / تصدير كامل لمنصة بيوت مصر القانونية',
          '',
          'Contents:',
          '  data/platform.db   SQLite database snapshot (VACUUM INTO, integrity checked)',
          '  data/uploads/      uploaded documents',
          withKey ? '  data/.secret-key   encryption key for integration secrets (KEEP PRIVATE)' : '  (encryption key not included)',
          withVapid ? '  data/vapid.json    device-alert (Web Push) signing keys (KEEP PRIVATE)' : '  (device-alert keys not included)',
          '  manifest.json      sha256 of every file',
          '',
          'Restore on a new server (stop the server first):',
          '  npm run restore -- /path/to/this-file.tar.gz --yes',
          'See DEPLOY.md for details. / راجع ملف DEPLOY.md لخطوات الاستعادة بالتفصيل.',
          '',
          'WARNING: this archive contains personal data of beneficiaries. Store it encrypted and delete copies you no longer need.',
          'تحذير: هذا الأرشيف يحتوي على بيانات شخصية للمستفيدين. احفظه في مكان مشفر واحذف النسخ غير المطلوبة.',
          '',
        ].join('\n');
        async function* entries() {
          const add = (e) => {
            files.push(e);
            return e;
          };
          yield { name: `${root}/README.txt`, data: readme };
          yield add({ name: `${root}/data/platform.db`, file: tmp, rel: 'data/platform.db' });
          for (const f of walkFiles(config.uploadsDir)) {
            yield add({ name: `${root}/data/uploads/${f.rel}`, file: f.full, size: f.size, mtime: f.mtime, rel: `data/uploads/${f.rel}` });
          }
          if (withKey) yield add({ name: `${root}/data/.secret-key`, data: fs.readFileSync(keyFile), mode: 0o600, rel: 'data/.secret-key' });
          if (withVapid) yield add({ name: `${root}/data/vapid.json`, data: fs.readFileSync(vapidFile), mode: 0o600, rel: 'data/vapid.json' });
          const uploads = files.filter((f) => f.rel.startsWith('data/uploads/'));
          const manifest = {
            format: 'beyoot-legal-export',
            format_version: 1,
            app_version: app.version,
            created_at: nowIso(),
            created_by: actor?.username || null,
            node: process.version,
            org_name: s.org_name || null,
            database: { path: 'data/platform.db', size: files[0].written, sha256: files[0].sha256, integrity, counts },
            uploads: { files: uploads.length, bytes: uploads.reduce((x, f) => x + (f.written || 0), 0) },
            secret_key: withKey ? 'included' : keySource === 'env' ? 'env' : keySource === 'file' ? 'not_included' : 'none',
            files: files.map((f) => ({ path: f.rel, size: f.written, sha256: f.sha256 })),
          };
          yield { name: `${root}/manifest.json`, data: JSON.stringify(manifest, null, 2) };
        }
        app.audit?.log({
          actor,
          ctx,
          type: 'system.export',
          severity: withKey ? 'critical' : 'warning',
          summary: withKey ? 'تصدير كامل للمنصة (مع مفتاح التشفير)' : 'تصدير كامل للمنصة (قاعدة البيانات والمرفقات)',
          data: { file: `${root}.tar.gz`, include_key: withKey },
        });
        const res = ctx.res;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${root}.tar.gz"`);
        res.setHeader('Cache-Control', 'no-store');
        // عميل توقف عن الاستلام: نقطع الاتصال بعد مهلة خمول حتى يُحذف الملف المؤقت ويتحرر قفل التصدير
        if (typeof res.setTimeout === 'function') res.setTimeout(EXPORT_IDLE_MS, () => res.destroy(new Error('export idle timeout')));
        await pipeline(Readable.from(tarChunks(entries()), { objectMode: false }), zlib.createGzip({ level: 6 }), res);
        return { ok: true };
      } finally {
        fs.rmSync(tmp, { force: true });
        exportRunning = false;
      }
    },

    // ===== المهام الدورية =====
    async runJob(name, actor, ctx) {
      const job = app.jobs.list().find((j) => j.name === name);
      if (!job) throw notFound('المهمة غير موجودة');
      const out = await app.jobs.runDue({ force: true, only: name });
      const r = out.find((x) => x.name === name);
      if (!r) throw conflict('المجدول ينفذ مهامًا دورية الآن، حاول مرة أخرى بعد لحظات');
      app.audit?.log({
        actor,
        ctx,
        type: 'system.job_run',
        severity: 'info',
        summary: `تشغيل المهمة الدورية «${job.label}» يدويًا`,
        data: { name, ok: r.ok },
      });
      return { ...r, job: jobState(name) };
    },

    // ===== التكاملات =====
    /**
     * حالة واتساب المختصرة للوحة المتابعة والإعدادات:
     * state = simulation | untested | failed | connected، و«متصل» فقط بعد اختبار ناجح لبيانات الاعتماد الحالية.
     */
    whatsappStatus() {
      const live = !!app.whatsapp?.configured;
      const test = live ? lastTest('whatsapp') : null;
      const st = whatsappState(live, test);
      return { configured: live, live, state: st.state, label: st.label, last_tested_at: test?.tested_at || null, last_test_ok: test ? test.ok && !test.stale : null };
    },

    integrationsOverview(ctx) {
      const keySource = app.integrations.keySource;
      return {
        key_source: keySource,
        key_file: keySource === 'file' ? keyFileDisplay() : null,
        public_base_url: config.publicBaseUrl || null,
        webhook_url: `${baseUrlFromRequest(ctx)}/webhooks/whatsapp`,
        webhook_path: '/webhooks/whatsapp',
        items: Object.keys(INTEGRATION_SPEC).map(integrationItem),
      };
    },

    saveIntegration(name, body, actor, ctx) {
      if (!INTEGRATION_SPEC[name]) throw notFound('التكامل غير معروف');
      let raw = body && body.values && typeof body.values === 'object' ? body.values : body;
      // v11 segment-server [r2 S3]: «confirm» تأكيد تغيير وضع الرقم الأساسي، وليس حقلًا من حقول التكامل
      const confirm = body?.confirm === true;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'confirm' in raw && !INTEGRATION_SPEC[name].fields.confirm) {
        const { confirm: _c, ...rest } = raw;
        raw = rest;
      }
      const patch = cleanIntegrationPatch(name, raw, { allowClear: true });
      if (!Object.keys(patch).length) throw badRequest('لم تُرسل أي قيم لتحديثها');
      app.integrations.set(name, patch, actor, ctx, { confirm });
      if (name === 'email') app.audit?.log({ actor, ctx, type: 'email.settings_updated', severity: 'warning', summary: 'تحديث إعدادات البريد الإلكتروني', data: { fields: Object.keys(patch) } }); // v10 b2b-server
      const item = integrationItem(name);
      const spec = INTEGRATION_SPEC[name].fields;
      const warnings = Object.keys(patch)
        .filter((k) => item.fields.find((f) => f.key === k)?.source === 'env')
        .map((k) => `«${spec[k].label}» مضبوط من متغير البيئة ${spec[k].env}، وقيمة البيئة تتقدم على القيمة المحفوظة هنا.`);
      return { ...item, warnings };
    },

    async testIntegration(name, actor, ctx) {
      if (!INTEGRATION_SPEC[name]) throw notFound('التكامل غير معروف');
      const target = testTarget(name);
      if (typeof target?.test !== 'function') {
        throw new ApiError(
          501,
          name === 'whatsapp' ? 'اختبار اتصال واتساب غير متاح بعد في هذا الإصدار من المنصة' : 'اختبار اتصال Claude غير متاح بعد في هذا الإصدار من المنصة',
          'not_implemented',
        );
      }
      if (testing.has(name)) throw conflict('يجري اختبار هذا التكامل الآن، انتظر النتيجة');
      testing.add(name);
      const t0 = Date.now();
      let result;
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('انتهت مهلة الاختبار (30 ثانية) دون رد من الخدمة')), 30000);
        });
        result = normalizeTestResult(await Promise.race([Promise.resolve().then(() => (name === 'email' ? target.test(actor) : target.test())), timeout])); // v10 b2b-server: البريد يرسل التجربة لبريد المدير
      } catch (e) {
        const msg = String(e?.message || e || '');
        result = { ok: false, message: AR_RE.test(msg) ? msg.slice(0, 500) : `تعذر الاتصال: ${msg.slice(0, 300)}`, details: null };
      } finally {
        clearTimeout(timer);
        testing.delete(name);
      }
      result.duration_ms = Date.now() - t0;
      result.tested_at = nowIso();
      // بصمة بيانات الاعتماد المختبرة (للتعرف على نتيجة قديمة بعد تغيير البيانات)؛ لا تُعاد للواجهة
      const d = result.details;
      let storedDetails = JSON.stringify({ ...(d && typeof d === 'object' && !Array.isArray(d) ? d : d == null ? {} : { value: d }), cred_fp: credFingerprint(name) });
      if (storedDetails.length > 4000) storedDetails = JSON.stringify({ cred_fp: credFingerprint(name) });
      db.insert('integration_tests', {
        name,
        ok: result.ok ? 1 : 0,
        message: result.message,
        details: storedDetails,
        duration_ms: result.duration_ms,
        tested_by: actor?.id ?? null,
        tested_at: result.tested_at,
      });
      db.run(
        'DELETE FROM integration_tests WHERE name = ? AND id NOT IN (SELECT id FROM integration_tests WHERE name = ? ORDER BY id DESC LIMIT ?)',
        name,
        name,
        KEEP_TESTS_PER_INTEGRATION,
      );
      app.audit?.log({
        actor,
        ctx,
        type: 'integration.tested',
        severity: result.ok ? 'info' : 'warning',
        summary: `اختبار اتصال ${INTEGRATION_SPEC[name].label}: ${result.ok ? 'ناجح' : 'فاشل'}`,
        data: { name, ok: result.ok, duration_ms: result.duration_ms },
      });
      return result;
    },

    // ===== صحة النظام =====
    health(ctx) {
      const dbPath = config.dbPath;
      const dbBytes = memoryDb ? 0 : fileSize(dbPath);
      const walBytes = memoryDb ? 0 : fileSize(`${dbPath}-wal`);
      const pragma = (q) => {
        try {
          return db.value(q);
        } catch {
          return null;
        }
      };
      const tables = [
        ['users', 'المستخدمون'],
        ['lawyers', 'المحامون'],
        ['clients', 'المستفيدون (العملاء)'],
        ['intakes', 'الطلبات الواردة'],
        ['cases', 'ملفات الاستشارات'],
        ['matters', 'الملفات المستمرة'],
        ['assignments', 'الإسنادات'],
        ['messages', 'الرسائل'],
        ['documents', 'المستندات'],
        ['knowledge_records', 'سجلات المعرفة'],
        ['security_events', 'أحداث سجل الأمان'],
        ['sessions', 'الجلسات النشطة'],
      ];
      const counts = tables
        .map(([table, label]) => {
          try {
            // الجلسات: غير المنتهية فقط (المنتهية تُحذف دوريًا وقد تبقى حتى التنظيف التالي)
            const sql = table === 'sessions' ? 'SELECT COUNT(*) FROM sessions WHERE expires_at > ?' : `SELECT COUNT(*) FROM ${table}`;
            return { table, label, count: Number(table === 'sessions' ? db.value(sql, nowIso()) : db.value(sql)) };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      // حسابات «إدارة النظام» النشطة بلا تحقق بخطوتين (جدول user_2fa من وحدة الحسابات)
      let adminsWithout2fa = null;
      try {
        adminsWithout2fa = Number(
          db.value(
            `SELECT COUNT(*) FROM users u WHERE u.role = 'admin' AND u.active = 1
               AND NOT EXISTS (SELECT 1 FROM user_2fa f WHERE f.user_id = u.id AND f.enabled_at IS NOT NULL AND f.secret_enc IS NOT NULL)`,
          ),
        );
      } catch {
        adminsWithout2fa = null;
      }
      const uploads = dirStats(config.uploadsDir);
      let disk = null;
      try {
        const st = fs.statfsSync(config.dataDir || path.dirname(dbPath));
        disk = { free_bytes: Number(st.bavail) * Number(st.bsize), total_bytes: Number(st.blocks) * Number(st.bsize) };
      } catch {
        disk = null;
      }
      // [بوابة 9.2 K7] رسائل القصة الآلية (ترحيب/طلب الحكاية/«وصلتنا حكايتك») خارج نافذة الـ 24 ساعة تفشل عمدًا ولا يُعاد
      // إرسالها [R2-A19]: لا تُعد «رسائل صادرة فاشلة» هنا كما لا تُعد في مؤشر لوحة المتابعة
      const outboxRows = db.all(
        `SELECT status, COUNT(*) AS n FROM messages WHERE direction = 'out' AND status IN ('failed','queued')
           AND COALESCE(automation_rule, '') NOT IN (${STORY_AUTO_RULES.map((r) => `'${r}'`).join(', ')}) GROUP BY status`,
      );
      const outbox = { failed: 0, queued: 0 };
      for (const r of outboxRows) outbox[r.status] = Number(r.n);
      const jobs = app.jobs.list().map((j) => ({ ...j, last_result: parseJson(j.last_result, j.last_result ?? null) }));
      const wa = integrationItem('whatsapp');
      const ai = integrationItem('anthropic');
      const backups = svc.backupsOverview();
      const environment = config.demo ? 'demo' : config.production ? 'production' : 'development';
      const keySource = app.integrations.keySource;
      const setup = setupRow();

      // ── قائمة جاهزية الإطلاق ──
      const checks = [];
      const add = (key, level, title, detail, href) => checks.push({ key, level, title, detail, href: href || null });
      if (config.demo) {
        add('environment', config.production ? 'danger' : 'warning', 'الوضع التجريبي مفعّل', 'تظهر حسابات تجريبية في صفحة الدخول وبيانات وهمية. اضبط DEMO=0 و NODE_ENV=production قبل الإطلاق.');
      } else if (!config.production) {
        add('environment', 'warning', 'بيئة التشغيل ليست «إنتاج»', 'اضبط NODE_ENV=production عند التشغيل الفعلي.');
      } else add('environment', 'ok', 'بيئة الإنتاج', 'NODE_ENV=production والوضع التجريبي مطفأ.');
      // v9.1 fixes: مع واتساب الحقيقي وبلا رابط عام لا تحمل رسائل المستفيدين أي رابط لصفحتهم (رابط «/p/…» النسبي لا يُفتح من واتساب، فلا يُرسل)
      if (!config.publicBaseUrl && app.whatsapp?.configured) add('base_url', 'danger', 'الرابط العام غير مضبوط وواتساب يعمل', 'رسائل واتساب للمستفيدين تُرسل الآن بلا رابط صفحة المتابعة، وروابط تنبيهات المحامين وإعادة تعيين كلمة المرور لا تُرسل. اضبط PUBLIC_BASE_URL (مثل https://legal.example.org) فورًا.');
      else if (!config.publicBaseUrl) add('base_url', 'warning', 'الرابط العام غير مضبوط', 'اضبط PUBLIC_BASE_URL (مثل https://legal.example.org) لتعمل روابط بوابة المستفيد وWebhook بشكل صحيح. بدونه لا تحمل رسائل واتساب للمستفيدين رابط صفحتهم.');
      else if (!config.publicBaseUrl.startsWith('https://')) add('base_url', 'warning', 'الرابط العام لا يستخدم HTTPS', 'شغّل المنصة خلف HTTPS واضبط PUBLIC_BASE_URL بـ https لتفعيل الكعكات الآمنة.');
      else add('base_url', 'ok', 'الرابط العام بـ HTTPS', config.publicBaseUrl);
      if (keySource === 'env') add('key', 'ok', 'مفتاح التشفير من APP_SECRET', 'الأسرار المخزنة مشفرة بمفتاح خارج قاعدة البيانات.');
      else if (keySource === 'file') add('key', 'warning', 'مفتاح التشفير محفوظ في ملف على الخادم', `احفظ الملف ${LRI}${keyFileDisplay()}${PDI} مع النسخ الاحتياطية، أو اضبط APP_SECRET (32 حرفًا على الأقل) ثم أعد إدخال الأسرار.`, '#/integrations');
      else add('key', 'danger', 'مفتاح تشفير مؤقت', 'الأسرار المحفوظة من لوحة الإدارة ستضيع عند إعادة التشغيل. اضبط APP_SECRET فورًا.', '#/integrations');
      if (adminsWithout2fa === 0) add('admin_2fa', 'ok', 'التحقق بخطوتين مفعّل لكل حسابات «إدارة النظام»', 'كل حساب مدير نظام نشط يدخل بكلمة المرور ورمز تطبيق المصادقة.');
      else if (adminsWithout2fa > 0) {
        add(
          'admin_2fa',
          'warning',
          `${arabicCount(adminsWithout2fa, ['حساب واحد', 'حسابان', 'حسابات', 'حسابًا'])} لـ«إدارة النظام» بلا تحقق بخطوتين`,
          'حساب مدير النظام يطّلع على كل بيانات المستفيدين وأسرار التكاملات؛ فعّل التحقق بخطوتين من «حسابي والأمان»، ويمكن إلزام كل المديرين به من «الإعدادات».',
          '#/account',
        );
      }
      if (config.production && config.adminPassword) {
        add('admin_env', 'warning', 'كلمة مرور مدير النظام ما زالت في متغيرات البيئة', 'احذف ADMIN_USERNAME وADMIN_PASSWORD من إعدادات الخادم بعد إنشاء الحساب الأول؛ فهي لا تُستخدم بعد ذلك وتبقى مكشوفة لكل من يرى الإعدادات.');
      }
      if (wa.undecryptable || ai.undecryptable) add('undecryptable', 'danger', 'تعذر فك تشفير أسرار محفوظة', 'تغيّر مفتاح التشفير بعد حفظ الأسرار. أعد إدخال مفاتيح التكاملات.', '#/integrations');
      if (!wa.configured) add('whatsapp', 'warning', 'واتساب في وضع المحاكاة', 'لم تُضبط بيانات WhatsApp Cloud API بعد، فلا تُرسل رسائل فعلية للمستفيدين.', '#/integrations');
      else if (wa.runtime.state === 'failed') {
        const why = String(wa.last_test.message || 'فشل اختبار الاتصال').replace(/[.،\s]+$/, '');
        add('whatsapp', 'danger', 'آخر اختبار اتصال لواتساب فشل', `${why}. بعد تصحيح بيانات الاعتماد من صفحة التكاملات أعد «اختبار الاتصال».`, '#/integrations');
      } else if (!wa.app_secret_set) add('whatsapp', 'danger', 'سر تطبيق ميتا غير مضبوط', 'بدون App Secret يرفض النظام كل رسائل Webhook الواردة.', '#/integrations');
      else if (wa.runtime.state === 'untested') {
        add(
          'whatsapp',
          'warning',
          'لم يُختبر الاتصال بواتساب بعد',
          wa.last_test
            ? 'تغيّرت بيانات الاعتماد بعد آخر اختبار. اضغط «اختبار الاتصال» في صفحة التكاملات للتأكد من صلاحية رمز الوصول ومعرّف رقم الهاتف.'
            : 'البيانات مضبوطة لكن لم يُتحقق منها. اضغط «اختبار الاتصال» في صفحة التكاملات للتأكد من صلاحية رمز الوصول ومعرّف رقم الهاتف.',
          '#/integrations',
        );
      } else add('whatsapp', 'ok', 'واتساب مضبوط ومتصل', `${wa.runtime.label} — آخر اختبار ناجح يوم ${arabicDate(wa.last_test.tested_at)}.`);
      add('ai', ai.configured ? 'ok' : 'info', ai.configured ? 'Claude مضبوط' : 'الذكاء الاصطناعي: المحلل المحلي', ai.runtime.label || '', '#/integrations');
      // v10 b2b-server (B10-59 → P0، CO-2، L-62): البريد والرابط العام والجهة المتعاقدة — حمراء متى وُجدت شركة
      for (const it of app.email?.readiness?.() || []) add(it.key, it.level, it.title, it.detail, it.href);
      // v9.2 «ألوان المؤسسة»: المستوى ok في الحالتين (لا يؤثر في جاهزية الإطلاق)؛ السطر التالي لبند story_ack (H-A2)
      const brandItem = app.brand?.readiness?.() || { title: 'ألوان المؤسسة: الألوان الأصلية للمنصة', detail: '', href: '#/settings?section=brand' };
      add('brand', 'ok', brandItem.title, brandItem.detail, brandItem.href);
      // v11 segment-server [r2 S4/S9/S15]: رقم الأفراد والشركات، أرقام غير مضبوطة، قوالب الأفراد والشركات
      for (const it of app.segments?.readiness?.() || []) add(it.key, it.level, it.title, it.detail, it.href);
      // v9.2 [R2-B21] (H-A2): «وصلتنا حكايتك» متوقفة افتراضيًا؛ تحذير فقط حين يكون واتساب متصلًا فعلًا
      add(
        'story_ack',
        app.whatsapp?.configured && !app.settings.get('story_ack_enabled') ? 'warning' : 'ok',
        app.settings.get('story_ack_enabled') ? 'تأكيد وصول الحكاية مفعّل' : 'المستفيدات على واتساب لا يصلهن تأكيد وصول حكايتهن',
        app.settings.get('story_ack_enabled') ? 'تصل المستفيدة رسالة ثابتة برقم طلبها عندما تكتمل قصتها.' : 'فعّل «وصلتنا حكايتك» من الإعدادات ← القصص الواردة على واتساب (بعد مراجعة سياسة الخصوصية).',
        '#/settings?section=stories',
      );
      if (memoryDb) add('backup', 'warning', 'قاعدة بيانات في الذاكرة', 'لا يمكن النسخ الاحتياطي لقاعدة بيانات في الذاكرة.');
      else if (!backups.enabled) add('backup', 'warning', 'النسخ الاحتياطي التلقائي متوقف', 'فعّل النسخ الاحتياطي اليومي من هذه الصفحة.');
      else if (!backups.last) add('backup', 'warning', 'لا توجد نسخة احتياطية بعد', 'أنشئ نسخة احتياطية الآن وتأكد من نسخها خارج الخادم دوريًا.');
      else if (backups.stale) add('backup', 'warning', 'آخر نسخة احتياطية قديمة', `مر على آخر نسخة أكثر من ${BACKUP_STALE_HOURS} ساعة. تأكد من عمل المجدول.`);
      else add('backup', 'ok', 'النسخ الاحتياطي يعمل', backups.last.file);
      if (disk) {
        const gb = disk.free_bytes / 1024 ** 3;
        if (gb < 0.2) add('disk', 'danger', 'مساحة القرص على وشك النفاد', 'المساحة الحرة أقل من 200 ميجابايت؛ قد تفشل الكتابة والنسخ الاحتياطي.');
        else if (gb < 1) add('disk', 'warning', 'مساحة القرص منخفضة', 'المساحة الحرة أقل من 1 جيجابايت.');
      }
      if (!config.schedulerIntervalSeconds) add('scheduler', 'warning', 'المجدول متوقف', 'SCHEDULER_INTERVAL_SECONDS=0: لن تعمل الأتمتة ولا النسخ الاحتياطي التلقائي ولا إعادة إرسال الرسائل.');
      const failedJobs = jobs.filter((j) => j.last_error && (!j.last_ok_at || j.last_finished_at > j.last_ok_at));
      if (failedJobs.length) add('jobs', 'warning', 'مهام دورية فشلت في آخر تشغيل', failedJobs.map((j) => j.label).join('، '));
      if (outbox.failed) add('outbox', 'warning', 'رسائل صادرة فاشلة', 'راجع صندوق الصادر وأعد إرسال الرسائل الفاشلة.', '#/automations?tab=outbox&status=failed');

      return {
        version: app.version,
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        pid: process.pid,
        uptime_seconds: Math.round(process.uptime()),
        started_at: startedAt,
        environment,
        demo: !!config.demo,
        production: !!config.production,
        memory: { rss_bytes: process.memoryUsage().rss, heap_used_bytes: process.memoryUsage().heapUsed },
        setup: setup ? { method: setup.method || null, completed_at: setup.completed_at || null } : null,
        db: {
          file: memoryDb ? ':memory:' : path.basename(dbPath),
          size_bytes: dbBytes,
          wal_bytes: walBytes,
          journal_mode: pragma('PRAGMA journal_mode'),
          page_size: Number(pragma('PRAGMA page_size')) || null,
          page_count: Number(pragma('PRAGMA page_count')) || null,
          freelist_count: Number(pragma('PRAGMA freelist_count')) || 0,
        },
        uploads: { files: uploads.files, bytes: uploads.bytes },
        counts,
        disk,
        scheduler: { interval_seconds: Number(config.schedulerIntervalSeconds) || 0, enabled: !!config.schedulerIntervalSeconds },
        jobs,
        outbox,
        integrations: {
          whatsapp: { configured: wa.configured, live: wa.runtime.live, state: wa.runtime.state, label: wa.runtime.label, last_test: wa.last_test },
          anthropic: { configured: ai.configured, live: ai.runtime.live, label: ai.runtime.label, last_test: ai.last_test },
          key_source: keySource,
          // المسار الفعلي للمفتاح (DATA_DIR/.secret-key) لصفحة صحة النظام بدل «data/.secret-key» الثابت
          key_file: keySource === 'file' ? keyFileDisplay() : null,
        },
        backups: {
          enabled: backups.enabled,
          retention: backups.retention,
          count: backups.items.length,
          total_bytes: backups.total_bytes,
          last: backups.last,
          stale: backups.stale,
          stale_after_hours: BACKUP_STALE_HOURS,
        },
        checks,
        webhook_url: `${baseUrlFromRequest(ctx)}/webhooks/whatsapp`,
      };
    },

    /** ملخص قصير لطباعته في سجل التشغيل عند بدء الخادم */
    startupSummary() {
      const wa = integrationItem('whatsapp');
      const ai = integrationItem('anthropic');
      const src = (item, key) => item.fields.find((f) => f.key === key)?.source || null;
      return {
        whatsapp: wa.runtime.label,
        whatsapp_source: src(wa, 'token'),
        whatsapp_app_secret: wa.app_secret_set,
        ai: ai.runtime.label,
        ai_source: src(ai, 'api_key'),
        key_source: app.integrations.keySource,
        key_file: app.integrations.keySource === 'file' ? keyFileDisplay() : null,
        undecryptable: wa.undecryptable || ai.undecryptable,
        backups: !memoryDb && !!app.settings.get('backup_enabled'),
      };
    },
  };

  // ── المهمة الدورية: نسخة احتياطية يومية ──
  app.jobs.register('backup', {
    everyMinutes: 24 * 60,
    label: 'النسخ الاحتياطي اليومي لقاعدة البيانات',
    // التخطي في وضع الإعداد ليس تشغيلًا: تبقى المهمة مستحقة وتُنفذ في أول دورة بعد إنشاء مدير النظام
    // (من المعالج أو من سطر الأوامر) بدل الانتظار 24 ساعة من وقت الإقلاع
    deferred: (r) => r?.skipped === 'setup',
    run: async () => {
      if (svc.isSetupMode()) return { skipped: 'setup' };
      if (memoryDb) return { skipped: 'memory' };
      if (!app.settings.get('backup_enabled')) return { skipped: 'disabled' };
      const b = svc.backupNow({ kind: 'auto' });
      return { file: b.file, size_bytes: b.size_bytes, pruned: b.pruned.length };
    },
  });

  // ── /setup: تعمل في وضع الإعداد فقط، وبعده 404 دائمًا ──
  app.pageHandlers.set('/setup', (req, res) => {
    if (svc.isSetupMode()) {
      res.setHeader('Referrer-Policy', 'no-referrer');
      return false; // يكمل إلى الملف الثابت public/setup.html
    }
    notFoundHtml(res);
    return true;
  });

  // ── /healthz: فحص حي لقاعدة البيانات (يبقى 200 في وضع الإعداد حتى لا تعيد منصة الاستضافة تشغيل الحاوية) ──
  app.pageHandlers.set('/healthz', (req, res) => {
    try {
      db.value('SELECT 1');
      sendJson(res, 200, { ok: true, status: svc.isSetupMode() ? 'setup_required' : 'ok', version: app.version });
    } catch {
      sendJson(res, 503, { ok: false, status: 'db_unavailable' });
    }
    return true;
  });

  // ── /api/meta: إعلام الواجهة بوضع الإعداد والإصدار ──
  app.metaProviders.push(() => (svc.isSetupMode() ? { setup_required: true } : {}));

  return svc;
}
