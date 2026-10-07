// الإصدار 9.1 — مسار l-home: تنبيهات الجهاز (Web Push) لتطبيق المنصة المثبت على الهاتف (L-20).
// بلا أي مكتبة خارجية: توقيع VAPID بـ ES256 (RFC 8292) وتشفير الحمولة aes128gcm (RFC 8291) عبر node:crypto.
//
// الخصوصية: الحمولة لا تحمل إلا {type, link} (رابط داخل المنصة)، ونص الإشعار على شاشة القفل عام دائمًا
// («لديك تحديث في منصة الدعم القانوني») بلا أكواد ولا بيانات مستفيدين. تُحذف الاشتراكات عند تسجيل الخروج وإنهاء الجلسات.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso, badRequest, sha256, cairoParts } from '../util.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

/** خدمات الدفع المعروفة فقط (لا يرسل الخادم طلبات إلى عناوين يختارها المستخدم: حماية من SSRF) */
export const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
/** أنواع الإشعارات التي تُرسل للجهاز (نفس محفزات تنبيهات واتساب) */
const PUSH_TYPES = /^(assignment\.(new|due_soon|overdue)|opinion\.returned|hearing\.outcome_missing|info_request\.(shared|answered)|.*extension.*)$/;

/** تشفير الحمولة لاشتراك (RFC 8291 aes128gcm). يعيد جسم الطلب كاملًا. */
export function encryptPayload(plaintext, { p256dh, auth }, { asKeys = null, salt = null } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw badRequest('مفاتيح اشتراك التنبيهات غير صالحة');
  const ecdh = asKeys || crypto.createECDH('prime256v1');
  if (!asKeys) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, authSecret, keyInfo, 32));
  const s = salt || crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, s, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, s, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(plaintext), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  s.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** فك التشفير من جهة المتصفح (للاختبارات): uaKeys = ECDH بمفتاح الاشتراك الخاص */
export function decryptPayload(buf, uaKeys, authB64u) {
  const salt = buf.subarray(0, 16);
  const idlen = buf.readUInt8(20);
  const asPublic = buf.subarray(21, 21 + idlen);
  const data = buf.subarray(21 + idlen);
  const uaPublic = uaKeys.getPublicKey();
  const secret = uaKeys.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, fromB64u(authB64u), keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const out = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString('utf8');
}

export function createWebPush(app) {
  const { db, config } = app;
  let keys = null;
  /** مضيفات إضافية مسموحة (للاختبارات فقط) */
  const extraHosts = [];

  function keyFile() {
    const dir = config.dataDir || (config.dbPath && config.dbPath !== ':memory:' ? path.dirname(config.dbPath) : null);
    return dir ? path.join(dir, 'vapid.json') : null;
  }

  /** مفاتيح VAPID: تُنشأ مرة واحدة وتُحفظ في مجلد البيانات (0600) */
  function vapid() {
    if (keys) return keys;
    const file = keyFile();
    try {
      if (file && fs.existsSync(file)) {
        const k = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (k.publicKey && k.privateKey) keys = k;
      }
    } catch {
      keys = null;
    }
    if (!keys) {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.generateKeys();
      keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()), created_at: nowIso() };
      if (file) {
        try {
          fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
        } catch (e) {
          app.log('vapid key save failed', e);
        }
      }
    }
    return keys;
  }

  function privateKeyObject() {
    const k = vapid();
    const pub = fromB64u(k.publicKey);
    return crypto.createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', d: k.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
      format: 'jwk',
    });
  }

  /** ترويسة Authorization لـ VAPID (JWT موقّع بـ ES256) */
  function vapidHeader(endpoint) {
    const aud = new URL(endpoint).origin;
    const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const sub = config.publicBaseUrl && /^https:\/\//.test(config.publicBaseUrl) ? config.publicBaseUrl : 'mailto:legal-support@beyootmisr.org';
    const payload = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
    const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key: privateKeyObject(), dsaEncoding: 'ieee-p1363' });
    return `vapid t=${header}.${payload}.${b64u(sig)}, k=${vapid().publicKey}`;
  }

  function allowedEndpoint(endpoint) {
    let u;
    try {
      u = new URL(endpoint);
    } catch {
      return false;
    }
    if (extraHosts.some((h) => h === u.host)) return true;
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  }

  async function sendOne(sub, payload) {
    const body = encryptPayload(JSON.stringify(payload), sub);
    let res;
    try {
      res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: { Authorization: vapidHeader(sub.endpoint), TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream' },
        body,
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      db.run('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?', sub.id);
      return { ok: false, error: String(e?.message || e) };
    }
    if (res.status === 404 || res.status === 410) {
      db.run('DELETE FROM push_subscriptions WHERE id = ?', sub.id);
      return { ok: false, gone: true };
    }
    if (res.status >= 200 && res.status < 300) {
      db.run('UPDATE push_subscriptions SET last_sent_at = ?, failures = 0 WHERE id = ?', nowIso(), sub.id);
      return { ok: true };
    }
    db.run('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?', sub.id);
    return { ok: false, status: res.status };
  }

  const svc = {
    PUSH_HOSTS,
    publicKey: () => vapid().publicKey,
    /** للاختبارات: السماح بمضيف محلي يستقبل الطلبات */
    allowHostForTests(host) {
      extraHosts.push(host);
    },

    status(user, sessionHash) {
      const n = Number(db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', user.id));
      const here = sessionHash ? !!db.get('SELECT 1 FROM push_subscriptions WHERE user_id = ? AND session_hash = ?', user.id, sessionHash) : false;
      return { available: user.role === 'lawyer', public_key: vapid().publicKey, subscriptions: n, this_device: here };
    },

    subscribe(user, sessionHash, body = {}, ua = '') {
      if (user.role !== 'lawyer') throw badRequest('تنبيهات الجهاز متاحة لحسابات المحامين فقط');
      const sub = body.subscription || body;
      const endpoint = String(sub?.endpoint || '');
      const p256dh = String(sub?.keys?.p256dh || '');
      const auth = String(sub?.keys?.auth || '');
      if (!endpoint || endpoint.length > 1000 || !allowedEndpoint(endpoint)) throw badRequest('عنوان اشتراك التنبيهات غير مدعوم');
      if (fromB64u(p256dh).length !== 65 || fromB64u(auth).length < 16 || fromB64u(auth).length > 64) throw badRequest('مفاتيح اشتراك التنبيهات غير صالحة');
      const t = nowIso();
      db.run(
        `INSERT INTO push_subscriptions (user_id, session_hash, endpoint, p256dh, auth, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, session_hash = excluded.session_hash, p256dh = excluded.p256dh,
           auth = excluded.auth, user_agent = excluded.user_agent, failures = 0`,
        user.id,
        sessionHash || null,
        endpoint,
        p256dh,
        auth,
        String(ua || '').slice(0, 300),
        t,
      );
      app.audit?.log({ actor: user, type: 'account.push_enabled', summary: 'تفعيل تنبيهات الجهاز (Web Push) على هذا الجهاز' });
      return svc.status(user, sessionHash);
    },

    unsubscribe(user, sessionHash, body = {}) {
      const endpoint = String(body.endpoint || body.subscription?.endpoint || '');
      if (endpoint) db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', user.id, endpoint);
      else if (sessionHash) db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND session_hash = ?', user.id, sessionHash);
      return svc.status(user, sessionHash);
    },

    /** عند تسجيل الخروج من جلسة أو إنهاء جلسات: تُحذف اشتراكات تلك الجلسات */
    forgetSession(sessionHash) {
      if (sessionHash) db.run('DELETE FROM push_subscriptions WHERE session_hash = ?', sessionHash);
    },
    /** اشتراكات جلسات لم تعد موجودة (انتهت بالخمول أو بعمرها دون تسجيل خروج) تُحذف — لا تنبيه لجهاز خرج صاحبه */
    pruneOrphans() {
      return db.run('DELETE FROM push_subscriptions WHERE session_hash IS NULL OR session_hash NOT IN (SELECT token_hash FROM sessions)').changes;
    },
    forgetUser(userId, { exceptSessionHash = null } = {}) {
      if (exceptSessionHash) db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND (session_hash IS NULL OR session_hash != ?)', userId, exceptSessionHash);
      else db.run('DELETE FROM push_subscriptions WHERE user_id = ?', userId);
    },

    /** حمولة الإشعار: النوع والرابط داخل المنصة فقط */
    payloadFor(n) {
      const link = /^#\/[A-Za-z0-9/_?=&-]*$/.test(String(n.link || '')) ? n.link : '#/my';
      return { type: String(n.type || 'update').slice(0, 60), link };
    },

    /** يُستدعى من تنبيهات المحامي لكل إشعار: يرسل للأجهزة المشتركة (خارج ساعات الهدوء) دون انتظار */
    onNotify(userId, n) {
      if (!PUSH_TYPES.test(String(n.type || ''))) return 0;
      const hour = cairoParts(nowIso()).hour;
      if (hour >= 22 || hour < 8) return 0;
      // الأجهزة التي ما زالت جلستها قائمة فقط (الجلسة المنتهية لا يصلها حتى التنبيه العام)
      const subs = db.all(
        `SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id
         WHERE s.user_id = ? AND u.active = 1 AND u.role = 'lawyer' AND s.session_hash IN (SELECT token_hash FROM sessions WHERE user_id = ?)`,
        userId,
        userId,
      );
      if (!subs.length || app.engine?.dryRun) return 0;
      const payload = svc.payloadFor(n);
      for (const s of subs) sendOne(s, payload).catch((e) => app.log('web push send', e));
      return subs.length;
    },

    /** إرسال مباشر (للاختبارات والتشخيص) */
    async sendToUser(userId, payload) {
      const subs = db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId);
      const out = [];
      for (const s of subs) out.push(await sendOne(s, payload));
      return out;
    },

    sessionHashOf: (token) => (token ? sha256(token) : null),
  };
  return svc;
}
