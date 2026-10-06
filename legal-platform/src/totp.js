// التحقق بخطوتين: Base32 (RFC 4648)، HOTP (RFC 4226)، TOTP (RFC 6238: SHA1، 30 ثانية، 6 أرقام، سماحية ±خطوة)،
// ورموز الاسترداد. كلها عبر node:crypto بدون أي اعتماديات.
import crypto from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** ترميز Base32 بدون حشو (صيغة تطبيقات المصادقة) */
export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** فك Base32 (يتجاهل المسافات والحشو وحالة الأحرف) */
export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226): HMAC-SHA1 + اقتطاع ديناميكي */
export function hotp(secret, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;

/** الخطوة الزمنية لوقت معين (بالمللي ثانية) */
export function totpStep(ms = Date.now()) {
  return Math.floor(ms / 1000 / TOTP_PERIOD);
}

/** رمز TOTP لوقت معين */
export function totp(secret, ms = Date.now(), digits = TOTP_DIGITS) {
  return hotp(secret, totpStep(ms), digits);
}

/**
 * التحقق من رمز TOTP مع سماحية ±window خطوة لاختلاف الساعات.
 * يعيد رقم الخطوة المطابقة (لمنع إعادة الاستخدام) أو null.
 * afterStep: ترفض أي خطوة ≤ آخر خطوة مقبولة (الرمز نفسه لا يُقبل مرتين).
 */
export function verifyTotp(secret, code, { ms = Date.now(), window = 1, afterStep = null } = {}) {
  const c = String(code ?? '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = totpStep(ms);
  for (let d = -window; d <= window; d++) {
    const step = now + d;
    if (afterStep !== null && afterStep !== undefined && step <= afterStep) continue;
    const expected = hotp(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return step;
  }
  return null;
}

/** سر جديد: 20 بايت (160 بت كما توصي RFC 4226) */
export function newTotpSecret() {
  return crypto.randomBytes(20);
}

/** رابط otpauth:// لتطبيقات المصادقة (Google Authenticator، Microsoft Authenticator، 1Password…) */
export function otpauthUri({ secretB32, account, issuer }) {
  const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const label = `${enc(issuer)}:${enc(account)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

// ===== رموز الاسترداد =====
// أبجدية Crockford (بدون i وl وo وu لتجنب الالتباس): 10 أحرف = 50 بت لكل رمز، تُعرض بصيغة xxxxx-xxxxx
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
export const RECOVERY_CODE_COUNT = 10;

export function newRecoveryCode() {
  const bytes = crypto.randomBytes(10);
  let s = '';
  for (const b of bytes) s += CROCKFORD[b & 31];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** توحيد رمز الاسترداد المُدخل (حالة الأحرف، الشرطات، المسافات، الأحرف الملتبسة) */
export function normalizeRecoveryCode(input) {
  const s = String(input ?? '')
    .toLowerCase()
    .replace(/[\s-]/g, '')
    .replace(/o/g, '0')
    .replace(/[il]/g, '1');
  return /^[0-9a-hjkmnp-tv-z]{10}$/.test(s) ? s : null;
}

const RC_SCRYPT = { N: 4096, r: 8, p: 1 };
export function hashRecoveryCode(code) {
  const norm = normalizeRecoveryCode(code);
  if (!norm) throw new Error('invalid recovery code');
  const salt = crypto.randomBytes(12);
  const hash = crypto.scryptSync(norm, salt, 24, RC_SCRYPT);
  return `s1$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyRecoveryCode(input, stored) {
  const norm = normalizeRecoveryCode(input);
  if (!norm || typeof stored !== 'string') return false;
  const [ver, saltB64, hashB64] = stored.split('$');
  if (ver !== 's1') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(norm, Buffer.from(saltB64, 'base64'), expected.length, RC_SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

// ===== تشفير الأسرار بمفتاح خارج قاعدة البيانات =====
/**
 * صندوق تشفير AES-256-GCM بمفتاح مشتق (HKDF) من المفتاح الرئيسي للمنصة:
 * APP_SECRET (32 حرفًا على الأقل) أو ملف data/.secret-key (نفس مفتاح أسرار التكاملات).
 */
export function createSealer(masterKey, purpose) {
  const key = Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(`bm:${purpose}:v1`), 32));
  return {
    seal(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(Buffer.from(plain)), c.final()]);
      return ['k1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
    },
    /** يعيد Buffer أو null إن تعذر فك التشفير (مفتاح مختلف) */
    open(sealed) {
      try {
        const [ver, iv, tag, data] = String(sealed || '').split(':');
        if (ver !== 'k1') return null;
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        d.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]);
      } catch {
        return null;
      }
    },
  };
}
