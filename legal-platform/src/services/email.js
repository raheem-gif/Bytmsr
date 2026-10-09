// الإصدار 10 — البريد الإلكتروني لخدمة الشركات (L-32، CO-2، CS-4، CS-17): صندوق صادر email_outbox ومزوّد الإرسال.
// البريد هو قناة التنبيه الوحيدة للشركات (لا واتساب، L-33)، ولا يحمل أي محتوى قانوني: لا عناوين طلبات، ولا أسماء أطراف،
// ولا نص استشارة — تنبيه قصير ورابط للبوابة من PUBLIC_BASE_URL فقط. الروابط السرية (الدعوة وإعادة التعيين) تبقى في الذاكرة
// حتى تُرسل ولا تُحفظ في قاعدة البيانات (عدا العرض التجريبي). اسم المكتب اللاتيني داخل السطر العربي معزول بـ U+2068…U+2069.
//
// المزوّدان: «outbox» (افتراضي؛ تُسجَّل الرسائل في الصادر بحالة simulated ولا تُرسل) و«smtp» (عميل بلا اعتماديات على
// node:net/node:tls). تقوية SMTP (CS-4): كل قيمة ترويسة بترميز RFC 2047، وأي CR/LF/NUL في مدخل ترويسة يُرفض، و«To:» عنوان
// فقط بلا اسم، وSTARTTLS إلزامي عند اختياره ولا AUTH قبل التشفير، وفحص الشهادة، وTLS 1.2 فأعلى، والمنافذ 25/465/587/2525،
// ويُحفظ السطر الأول فقط (≤ 200 حرف) من خطأ الخادم. الإرسال (CS-17): ميزانية 20 ثانية واتصال واحد في كل تشغيلة (RSET بين
// الرسائل)، والصفوف العالقة «جارٍ الإرسال» أكثر من 10 دقائق تعود للانتظار عند بدء التشغيل (أو تفشل إن حملت رابطًا سريًا).
// email_enabled = المزوّد ليس outbox و PUBLIC_BASE_URL مضبوط، أو العرض التجريبي؛ يحدد كل جملة في البوابة تعد بالبريد (CO-2).
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { nowIso, now, arabicCount, ApiError } from '../util.js';
import { LABELS, DEFAULT_SETTINGS } from '../constants.js';
import { INTEGRATION_SPEC } from './integrations.js';

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
/** عزل اسم لاتيني داخل سطر عربي في رسالة نصية */
export const isolate = (s) => `${FSI}${s}${PDI}`;

/** عنوان بريد صالح للترويسة To: عنوان فقط بلا اسم ظاهر ولا مسافات أو علامات تنصيص أو أقواس زاوية (CS-4) */
export function validAddress(addr) {
  const s = String(addr ?? '');
  if (!s || s.length > 254 || /[\s"'<>()[\],;:\\\r\n\0]/.test(s)) return false;
  const parts = s.split('@');
  return parts.length === 2 && !!parts[0] && /^[^.@][^@]*\.[^.@]+$/.test(parts[1]);
}
/** قيمة ترويسة فيها CR أو LF أو NUL: تُرفض (CS-4) */
export const unsafeHeader = (s) => /[\r\n\0]/.test(String(s ?? ''));

/** ترميز RFC 2047 (UTF-8، Base64) مقسّمًا بحيث لا تتجاوز الكلمة المرمّزة 75 حرفًا ولا تُقسم المحارف متعددة البايتات */
export function encodeHeader(value) {
  const s = String(value ?? '');
  if (/^[\x20-\x7e]*$/.test(s) && !/=\?/.test(s)) return s;
  const words = [];
  let chunk = '';
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/** نص الرسالة الكامل (ترويسات + جسم Base64 بأسطر 76 حرفًا) — يرمي إن حمل مدخل ترويسة CR/LF/NUL */
export function buildMessage({ from, fromName = '', to, subject, text, messageId, date = new Date() }) {
  for (const [k, val] of Object.entries({ from, fromName, to, subject })) {
    if (unsafeHeader(val)) throw new Error(`ترويسة غير صالحة (${k})`);
  }
  if (!validAddress(from)) throw new Error('عنوان المرسل غير صالح');
  if (!validAddress(to)) throw new Error('عنوان المستلم غير صالح');
  const body = Buffer.from(String(text ?? '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const headers = [
    `From: ${fromName ? `${encodeHeader(fromName)} ` : ''}<${from}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

export const SMTP_PORTS = Object.freeze([25, 465, 587, 2525]);
const firstLine = (s) => String(s ?? '').split(/\r?\n/)[0].slice(0, 200);

/**
 * اتصال SMTP واحد (بلا اعتماديات). opts: { host, port, security: 'starttls'|'tls', user, password, timeoutMs, tlsOptions,
 * netImpl, tlsImpl, transcript:[] }. tlsOptions للاختبارات فقط (شهادة جهة اعتماد للخادم الوهمي) — لا يُضبط من الواجهة.
 */
export class SmtpConnection {
  constructor(opts) {
    this.o = { timeoutMs: 15000, ...opts };
    this.socket = null;
    this.buf = '';
    this.waiters = [];
    this.early = [];
    this.lines = [];
    this.ext = new Set();
    this.authMethods = new Set();
    this.transcript = opts.transcript || [];
    this.closed = false;
    this.error = null;
  }
  _attach(sock) {
    this.socket = sock;
    sock.setEncoding?.('utf8');
    sock.on('data', (d) => this._onData(String(d)));
    sock.on('error', (e) => this._fail(e));
    sock.on('close', () => this._fail(new Error('انقطع الاتصال بخادم البريد')));
  }
  _fail(e) {
    if (!this.error) this.error = e;
    this.closed = true;
    const ws = this.waiters.splice(0);
    for (const w of ws) w.reject(e);
  }
  _onData(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      this.transcript.push(`S: ${line}`);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), lines: this.lines.splice(0) };
        const w = this.waiters.shift();
        // رد وصل قبل أن ننتظره (مثل التحية فور الاتصال) يُحفظ حتى يُطلب
        if (w) w.resolve(reply);
        else this.early.push(reply);
      }
    }
  }
  _read() {
    if (this.early.length) return Promise.resolve(this.early.shift());
    if (this.closed) return Promise.reject(this.error || new Error('الاتصال مغلق'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(w);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error('انتهت مهلة انتظار رد خادم البريد'));
        this.socket?.destroy();
      }, this.o.timeoutMs);
      const w = {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.waiters.push(w);
    });
  }
  async cmd(line, { expect = [250], log = line } = {}) {
    this.transcript.push(`C: ${log}`);
    const p = this._read();
    this.socket.write(`${line}\r\n`);
    const r = await p;
    if (!expect.includes(r.code)) {
      const e = new Error(firstLine(r.lines.join(' ')));
      e.smtpCode = r.code;
      throw e;
    }
    return r;
  }
  _connect(useTls, socket = null) {
    const { host } = this.o;
    // connectPort: للاختبارات فقط (خادم وهمي على منفذ عشوائي) — المنفذ المضبوط نفسه يبقى مقيدًا بـ 25/465/587/2525
    const port = this.o.connectPort || this.o.port;
    const netImpl = this.o.netImpl || net;
    const tlsImpl = this.o.tlsImpl || tls;
    return new Promise((resolve, reject) => {
      let s;
      const timer = setTimeout(() => {
        s?.destroy();
        reject(new Error('انتهت مهلة الاتصال بخادم البريد'));
      }, this.o.timeoutMs);
      const done = (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(s);
      };
      if (useTls) {
        // فحص الشهادة إلزامي، و TLS 1.2 فأعلى، واسم الخادم للتحقق (CS-4)
        s = tlsImpl.connect({ host, port, socket: socket || undefined, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, minVersion: 'TLSv1.2', ...(this.o.tlsOptions || {}) }, () => {
          if (!s.authorized) return done(Object.assign(new Error(`شهادة خادم البريد غير موثوقة: ${s.authorizationError || ''}`.trim()), { permanent: true }));
          done();
        });
        // فشل التحقق من الشهادة (موقعة ذاتيًا، اسم مختلف…) خطأ إعداد لا تُعاد معه المحاولة
        s.once('error', (e) => done(/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|altname|certificate/i.test(`${e.code || ''} ${e.message || ''}`) ? Object.assign(e, { permanent: true }) : e));
      } else {
        s = netImpl.connect({ host, port }, () => done());
        s.once('error', (e) => done(e));
      }
    });
  }
  _ehloParse(r) {
    this.ext = new Set();
    this.authMethods = new Set();
    for (const l of r.lines.slice(1)) {
      const t = l.slice(4).trim().toUpperCase();
      const [k, ...rest] = t.split(/\s+/);
      this.ext.add(k);
      if (k === 'AUTH') for (const m of rest) this.authMethods.add(m);
    }
  }
  async open() {
    try {
      return await this._open();
    } catch (e) {
      // لا اتصال معلّق بعد فشل (لا STARTTLS، شهادة مرفوضة، دخول مرفوض…)
      this.socket?.destroy();
      this.closed = true;
      throw e;
    }
  }
  async _open() {
    const { security, port } = this.o;
    if (!SMTP_PORTS.includes(Number(port))) throw new Error('منفذ SMTP غير مسموح (المسموح 25 أو 465 أو 587 أو 2525)');
    if (!['starttls', 'tls'].includes(security)) throw new Error('نوع التشفير يجب أن يكون STARTTLS أو TLS');
    const name = 'localhost';
    if (security === 'tls') {
      const s = await this._connect(true);
      this._attach(s);
    } else {
      const s = await this._connect(false);
      this._attach(s);
    }
    const greet = await this._read();
    if (greet.code !== 220) throw new Error(firstLine(greet.lines.join(' ')));
    this._ehloParse(await this.cmd(`EHLO ${name}`));
    if (security === 'starttls') {
      // STARTTLS إلزامي: لا متابعة بلا تشفير، ولا AUTH قبله أبدًا
      if (!this.ext.has('STARTTLS')) throw Object.assign(new Error('خادم البريد لا يدعم STARTTLS؛ أُوقف الإرسال قبل إرسال بيانات الدخول'), { permanent: true });
      await this.cmd('STARTTLS', { expect: [220] });
      // gate G7-07: أي رد أو بيانات وصلت بعد «220» وقبل التشفير حقنٌ محتمل من وسيط — لا تُحمل عبر STARTTLS أبدًا
      if (this.early.length || this.buf || this.lines.length) {
        throw Object.assign(new Error('أرسل خادم البريد بيانات غير متوقعة قبل بدء التشفير؛ أُوقف الإرسال'), { permanent: true });
      }
      this.early = [];
      this.buf = '';
      this.lines = [];
      const plain = this.socket;
      plain.removeAllListeners('data');
      plain.removeAllListeners('close');
      plain.removeAllListeners('error');
      plain.on('error', () => {});
      const s = await this._connect(true, plain);
      this.closed = false;
      this.error = null;
      this._attach(s);
      this._ehloParse(await this.cmd(`EHLO ${name}`));
    }
    if (this.o.user) {
      if (this.authMethods.has('PLAIN')) {
        const tok = Buffer.from(`\0${this.o.user}\0${this.o.password || ''}`, 'utf8').toString('base64');
        await this.cmd(`AUTH PLAIN ${tok}`, { expect: [235], log: 'AUTH PLAIN ****' });
      } else if (this.authMethods.has('LOGIN')) {
        await this.cmd('AUTH LOGIN', { expect: [334] });
        await this.cmd(Buffer.from(this.o.user, 'utf8').toString('base64'), { expect: [334], log: '****' });
        await this.cmd(Buffer.from(this.o.password || '', 'utf8').toString('base64'), { expect: [235], log: '****' });
      } else throw new Error('خادم البريد لا يعرض طريقة دخول مدعومة (PLAIN أو LOGIN)');
    }
    return this;
  }
  async send({ from, to, data }) {
    await this.cmd(`MAIL FROM:<${from}>`);
    await this.cmd(`RCPT TO:<${to}>`, { expect: [250, 251] });
    await this.cmd('DATA', { expect: [354] });
    // نقطة في بداية سطر تُضاعف (dot-stuffing)
    const stuffed = data.replace(/(^|\r\n)\./g, '$1..');
    const r = await this.cmd(`${stuffed}\r\n.`, { log: '[message]' });
    return firstLine(r.lines.join(' '));
  }
  async reset() {
    await this.cmd('RSET');
  }
  async close() {
    try {
      if (!this.closed) await this.cmd('QUIT', { expect: [221, 250] });
    } catch {
      /* لا يهم */
    }
    this.socket?.destroy();
    this.closed = true;
  }
}

/** خطوات إعادة المحاولة: دقيقة، 10 دقائق، ساعة، ثم «تعذّر الإرسال» */
const BACKOFF_MIN = [1, 10, 60];
const FLUSH_BUDGET_MS = 20000;
const FLUSH_BATCH = 50;
const STALE_SENDING_MS = 10 * 60 * 1000;
const LINK_EXPIRED = 'انتهت صلاحية الرابط قبل الإرسال؛ اطلب رابطًا جديدًا';
const DAYS_FORMS = ['يوم', 'يومين', 'أيام', 'يومًا'];

export function createEmail(app) {
  const { db, config } = app;
  /** id → الرابط السري (لا يُحفظ أبدًا خارج العرض التجريبي) */
  const secrets = new Map();
  let flushing = false;

  const brand = () => app.companies?.brandName?.() || app.brand?.displayName?.() || app.settings.get('brand_name') || DEFAULT_SETTINGS.brand_name || app.settings.get('org_name') || '';

  function settingsOf() {
    let s = {};
    try {
      if (INTEGRATION_SPEC.email) s = app.integrations.get('email') || {};
    } catch {
      s = {};
    }
    const provider = String(s.provider || process.env.EMAIL_PROVIDER || 'outbox').toLowerCase();
    return { ...s, provider: ['outbox', 'smtp'].includes(provider) ? provider : 'outbox' };
  }
  /** إعدادات SMTP الفعلية أو { error } */
  function smtpOptions() {
    const s = settingsOf();
    const port = Number(s.smtp_port || 587);
    const security = String(s.smtp_security || (port === 465 ? 'tls' : 'starttls')).toLowerCase();
    const from = String(s.from_address || '').trim();
    if (!s.smtp_host) return { error: 'لم يُضبط خادم SMTP' };
    if (!validAddress(from)) return { error: 'عنوان المرسل غير صالح أو غير مضبوط' };
    if (unsafeHeader(s.from_name) || unsafeHeader(s.smtp_host)) return { error: 'قيمة غير صالحة في إعدادات البريد' };
    return { host: String(s.smtp_host).trim(), port, security, user: s.smtp_user || '', password: s.smtp_password || '', from, fromName: String(s.from_name || brand()).trim() };
  }

  // عند بدء التشغيل: صفوف «جارٍ الإرسال» أقدم من 10 دقائق تعود للانتظار، أو تفشل إن حملت رابطًا سريًا (ضاع من الذاكرة) — CS-17
  function recoverStale() {
    const cutoff = new Date(now().getTime() - STALE_SENDING_MS).toISOString();
    let n = 0;
    for (const r of db.all("SELECT id, body_text FROM email_outbox WHERE status = 'sending' AND COALESCE(next_attempt_at, created_at) <= ?", cutoff)) {
      // (gate G-R2: يُستدعى أيضًا في بداية كل flush — الرابط السري الذي ما زال في الذاكرة يُعاد إرساله بدل أن يفشل)
      if (String(r.body_text).includes('{link}') && !secrets.has(r.id)) db.run("UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ? AND status = 'sending'", LINK_EXPIRED, r.id);
      else db.run("UPDATE email_outbox SET status = 'queued', next_attempt_at = ? WHERE id = ? AND status = 'sending'", nowIso(), r.id);
      n += 1;
    }
    return n;
  }
  try {
    recoverStale();
  } catch (e) {
    app.log?.('email recover', e);
  }

  const svc = {
    isolate,
    validAddress,
    encodeHeader,
    buildMessage,
    SmtpConnection,
    recoverStale,
    provider: () => settingsOf().provider,
    /** عنوان المنصة العام (PUBLIC_BASE_URL) أو '' */
    publicBase: () => config.publicBaseUrl || '',
    /** أساس روابط البريد: PUBLIC_BASE_URL، وفي العرض التجريبي فقط عنوان محلي */
    linkBase: () => config.publicBaseUrl || (config.demo ? `http://localhost:${config.port || 3000}` : ''),
    /** هل تعد البوابة بالبريد؟ (L-32، CO-2) */
    enabled: () => !!config.demo || (settingsOf().provider !== 'outbox' && !!config.publicBaseUrl),
    /** الصادر يُحاكي ولا يرسل (المزوّد outbox أو العرض التجريبي) */
    isSimulated: () => !!config.demo || settingsOf().provider === 'outbox',

    /**
     * إضافة رسالة إلى الصادر. secretLink: رابط سري يُستبدل به {link} عند الإرسال (لا يُحفظ إلا في العرض التجريبي).
     * security: رسائل أمان الحساب (لا يحدها email_pref ولا الحد في الساعة). يعيد { id, status }.
     */
    queue({ to, toName = null, subject, text, purpose, companyId = null, companyUserId = null, dedupeKey = null, secretLink = null, security = false }) {
      const t = nowIso();
      if (dedupeKey) {
        const prev = db.get('SELECT id, status FROM email_outbox WHERE dedupe_key = ?', dedupeKey);
        if (prev) return { id: prev.id, status: prev.status, duplicate: true };
      }
      let status;
      let error = null;
      let body = String(text || '');
      if (!validAddress(to) || unsafeHeader(subject) || unsafeHeader(toName)) {
        status = 'failed';
        error = 'عنوان بريد أو ترويسة غير صالحة';
      } else if (!security && companyUserId) {
        const max = Math.max(1, Number(app.settings.get('company_email_max_per_hour')) || 20);
        const hourAgo = new Date(now().getTime() - 3600000).toISOString();
        const recent = Number(db.value("SELECT COUNT(*) FROM email_outbox WHERE company_user_id = ? AND created_at >= ? AND purpose NOT IN ('security','security_old_email','invite','reset')", companyUserId, hourAgo));
        if (recent >= max) {
          status = 'skipped';
          error = 'تجاوز الحد الأقصى للرسائل في الساعة لهذا المستخدم';
        }
      }
      if (!status) {
        if (config.demo) {
          status = 'simulated';
          if (secretLink) body = body.split('{link}').join(secretLink);
        } else if (svc.provider() === 'outbox') {
          status = 'simulated';
        } else if (!config.publicBaseUrl) {
          status = 'skipped';
          error = 'لم يُضبط PUBLIC_BASE_URL؛ لا تُرسل رسائل بروابط بدونه';
        } else status = 'queued';
      }
      const id = db.insert('email_outbox', {
        to_address: String(to || '').slice(0, 254),
        to_name: toName ? String(toName).replace(/[\r\n\0]/g, ' ').slice(0, 120) : null,
        subject: String(subject || '').replace(/[\r\n\0]/g, ' ').slice(0, 200),
        body_text: body.slice(0, 8000),
        purpose,
        company_id: companyId,
        company_user_id: companyUserId,
        status,
        provider: svc.provider(),
        attempts: 0,
        next_attempt_at: status === 'queued' ? t : null,
        error,
        dedupe_key: dedupeKey,
        created_at: t,
      });
      if (status === 'queued' && secretLink) secrets.set(id, secretLink);
      return { id, status };
    },

    /** الرابط السري لرسالة في الانتظار (لمهمة الإرسال) */
    secretFor: (id) => secrets.get(id) || null,
    forgetSecret: (id) => secrets.delete(id),

    /** رابط صفحة داخل البوابة (غير سري) */
    portalLink: (hash = '#/') => {
      const base = svc.linkBase();
      return base ? `${base}/company${hash.startsWith('#') ? hash : `#${hash}`}` : '';
    },

    /**
     * رسالة من قالب (U10-89): الموضوع «{الحدث} — {الرمز}» بلا اسم المكتب، والجسم سطر الحدث ورابط البوابة والتذييل.
     * opts: { to, name, company, companyUserId, vars, secretLink, security, dedupeKey, purpose? }
     */
    send(template, opts = {}) {
      const msg = svc.render(template, opts);
      if (!msg) return null;
      return svc.queue({
        to: opts.to,
        toName: opts.name || null,
        subject: msg.subject,
        text: msg.text,
        purpose: opts.purpose || msg.purpose,
        companyId: opts.company?.id ?? opts.companyId ?? null,
        companyUserId: opts.companyUserId ?? null,
        dedupeKey: opts.dedupeKey || null,
        secretLink: opts.secretLink || null,
        security: !!opts.security,
      });
    },

    /** نص الرسالة من القالب: { subject, text, purpose } */
    render(template, { name = '', company = null, vars = {} } = {}) {
      const b = isolate(brand());
      const hello = `مرحبًا ${name || ''}،`.replace(' ،', '،');
      const footer = `— فريقكم القانوني في ${b} · رسالة آلية؛ للرد استخدموا البوابة.`;
      const companyName = company?.name || '';
      const portal = (hash) => {
        const link = svc.portalLink(hash);
        return link ? `للتفاصيل افتحوا البوابة: ${link}` : 'للتفاصيل افتحوا بوابة الشركات.';
      };
      const lines = (...ls) => ls.filter(Boolean).join('\n');
      switch (template) {
        case 'invite': {
          // J-19/K9: صيغة محايدة تذكر العلامة مرة واحدة (لا «دعاكم فريق {brand} … لدى {brand}»، ولا فعل مذكر لداعية)
          const inviter = vars.inviter ? vars.inviter : 'فريقكم القانوني';
          return {
            purpose: 'invite',
            subject: 'دعوة للانضمام إلى إدارتكم القانونية',
            text: lines(
              hello,
              `تلقّيتم دعوة من ${inviter} للانضمام إلى بوابة ${companyName} لدى ${b} — إدارتكم القانونية.`,
              `لتفعيل حسابكم واختيار كلمة المرور افتحوا الرابط التالي (صالح لمرة واحدة حتى ${vars.until}): {link}`,
              'إن لم تكونوا تتوقعون هذه الرسالة فتجاهلوها.',
              footer,
            ),
          };
        }
        case 'reset':
          return {
            purpose: 'reset',
            subject: 'تعيين كلمة مرور جديدة لحسابكم',
            text: lines(
              hello,
              `لتعيين كلمة مرور جديدة لحسابكم على بوابة ${companyName} افتحوا الرابط التالي (صالح لمرة واحدة حتى ${vars.until}): {link}`,
              'إن لم تطلبوا ذلك فتجاهلوا هذه الرسالة وتواصلوا مع مديري البوابة في شركتكم.',
              footer,
            ),
          };
        case 'security': {
          const event = vars.event || 'تغيّرت إعدادات الأمان لحسابكم';
          return {
            purpose: 'security',
            subject: event,
            text: lines(hello, `${event}.`, 'إن لم تكونوا أنتم فتواصلوا مع مديري البوابة في شركتكم فورًا.', footer),
          };
        }
        case 'security_old_email':
          return {
            purpose: 'security_old_email',
            subject: 'تغيّر البريد الإلكتروني لحسابكم',
            text: lines(
              hello,
              `غيّر فريقكم القانوني البريد الإلكتروني المسجل لحسابكم على بوابة ${companyName}، وسُجّل خروجكم من كل الأجهزة. لن تصل رسائل البوابة إلى هذا البريد بعد الآن.`,
              'إن لم تطلبوا ذلك فتواصلوا مع مديري البوابة في شركتكم فورًا.',
              footer,
            ),
          };
        case 'request_update':
          return { purpose: 'request_update', subject: `تحديث على طلبكم — ${vars.code}`, text: lines(hello, `يوجد تحديث على طلبكم ${vars.code}.`, portal(`#/requests/${vars.code}`), footer) };
        case 'clarification':
          return { purpose: 'clarification', subject: `فريقكم القانوني يحتاج معلومة — ${vars.code}`, text: lines(hello, `يحتاج فريقكم القانوني معلومة منكم لاستكمال الطلب ${vars.code}.`, portal(`#/requests/${vars.code}?focus=action`), footer) };
        case 'quote':
          return { purpose: 'quote', subject: `عرض سعر بانتظار موافقتكم — ${vars.code}`, text: lines(hello, `وصلكم عرض سعر على الطلب ${vars.code} بانتظار موافقتكم.`, portal(`#/requests/${vars.code}?focus=action`), footer) };
        case 'deliverable':
          return { purpose: 'deliverable', subject: `جاهز للمراجعة — ${vars.code}`, text: lines(hello, `التسليم الخاص بالطلب ${vars.code} جاهز للمراجعة.`, portal(`#/requests/${vars.code}?focus=deliverable`), footer) };
        case 'renewal':
          return {
            purpose: 'renewal',
            subject: 'موعد يقترب في ذاكرتكم القانونية',
            text: lines(
              hello,
              `يقترب موعد مهم في ذاكرتكم القانونية: ${vars.kind_label} — ${vars.date}${vars.days !== undefined ? (Number(vars.days) === 0 ? ' (اليوم)' : ` (بعد ${arabicCount(vars.days, DAYS_FORMS)})`) : ''}.`,
              portal(vars.memory_id ? `#/memory/item/${vars.memory_id}` : '#/memory'),
              footer,
            ),
          };
        case 'charge_added':
          return {
            purpose: 'charge_added',
            subject: vars.code ? `تكلفة إضافية — ${vars.code}` : 'تكلفة إضافية',
            text: lines(hello, `أُضيفت تكلفة إضافية ${vars.amount}${vars.code ? ` — ${vars.code}` : ''}.`, portal('#/plan'), footer),
          };
        case 'trial':
          return { purpose: 'trial', subject: vars.subject || 'الفترة التجريبية', text: lines(hello, vars.line || '', portal('#/plan'), footer) };
        case 'staff_alert': {
          const base = svc.linkBase();
          const link = base && vars.request_id ? `${base}/app#/company-requests/${vars.request_id}` : '';
          return { purpose: 'staff_alert', subject: vars.subject, text: lines(vars.subject, link) };
        }
        case 'test':
          return { purpose: 'test', subject: 'رسالة تجربة من منصة المكتب', text: lines('هذه رسالة تجربة للتأكد من إعدادات البريد الإلكتروني.', footer) };
        default:
          return null;
      }
    },

    /**
     * إرسال الصادر (مهمة email.flush، CS-17): ≤ 50 رسالة، ميزانية 20 ثانية، اتصال SMTP واحد مع RSET بين الرسائل.
     * opts.only: معرّفات بعينها (رسالة التجربة)؛ opts.smtp: خيارات إضافية للاختبارات (tlsOptions، netImpl، transcript).
     */
    async flush({ only = null, smtp = {} } = {}) {
      if (flushing) return { busy: true };
      if (svc.isSimulated() && !only) return { sent: 0, failed: 0, simulated: true };
      flushing = true;
      const started = Date.now();
      const out = { sent: 0, failed: 0, retried: 0 };
      let conn = null;
      try {
        // gate G-R2: صف بقي «جارٍ الإرسال» بعد إعادة تشغيل (أو تعطل) يعود للانتظار دون انتظار إعادة تشغيل أخرى؛ لا يمسك أي
        // تشغيل صفًا أكثر من FLUSH_BUDGET_MS (20 ث) فصفوف أقدم من 10 دقائق ليست قيد الإرسال
        try {
          recoverStale();
        } catch (e) {
          app.log?.('email recover', e);
        }
        const t = nowIso();
        const rows = only
          ? db.all(`SELECT * FROM email_outbox WHERE id IN (${only.map(() => '?').join(',')}) AND status = 'queued'`, ...only)
          : db.all("SELECT * FROM email_outbox WHERE status = 'queued' AND COALESCE(next_attempt_at, created_at) <= ? ORDER BY id LIMIT ?", t, FLUSH_BATCH);
        if (!rows.length) return { ...out, idle: true };
        const opts = smtpOptions();
        for (const row of rows) {
          if (Date.now() - started > FLUSH_BUDGET_MS) break;
          // مطالبة بالصف (لا يرسله تشغيلان)
          const claimed = db.run("UPDATE email_outbox SET status = 'sending', attempts = attempts + 1, next_attempt_at = ?, provider = 'smtp' WHERE id = ? AND status = 'queued'", nowIso(), row.id).changes;
          if (!claimed) continue;
          const attempts = Number(row.attempts || 0) + 1;
          const fail = (msg, { permanent = false } = {}) => {
            const err = firstLine(msg);
            if (permanent || attempts > BACKOFF_MIN.length) {
              db.run("UPDATE email_outbox SET status = 'failed', error = ? WHERE id = ?", err, row.id);
              secrets.delete(row.id);
              out.failed += 1;
              svc.notifyFailure(row, err);
            } else {
              const next = new Date(now().getTime() + BACKOFF_MIN[attempts - 1] * 60000).toISOString();
              db.run("UPDATE email_outbox SET status = 'queued', error = ?, next_attempt_at = ? WHERE id = ?", err, next, row.id);
              out.retried += 1;
            }
          };
          if (opts.error) {
            fail(opts.error);
            continue;
          }
          let text = row.body_text;
          if (text.includes('{link}')) {
            const link = secrets.get(row.id);
            if (!link) {
              fail(LINK_EXPIRED, { permanent: true });
              continue;
            }
            text = text.split('{link}').join(link);
          }
          let data;
          try {
            const domain = opts.from.split('@')[1];
            data = buildMessage({ from: opts.from, fromName: opts.fromName, to: row.to_address, subject: row.subject, text, messageId: `${crypto.randomBytes(12).toString('hex')}@${domain}`, date: now() });
          } catch (e) {
            fail(e.message, { permanent: true });
            continue;
          }
          try {
            if (!conn) conn = await new SmtpConnection({ ...opts, ...smtp }).open();
            else await conn.reset();
            const resp = await conn.send({ from: opts.from, to: row.to_address, data });
            db.run("UPDATE email_outbox SET status = 'sent', sent_at = ?, error = NULL, provider_message_id = ? WHERE id = ?", nowIso(), resp.slice(0, 200), row.id);
            secrets.delete(row.id);
            out.sent += 1;
          } catch (e) {
            // رفض نهائي من الخادم (5xx) أو مشكلة أمان في الإعداد (لا STARTTLS، شهادة غير موثوقة) = فشل مباشر بلا إعادة
            fail(e.message || String(e), { permanent: !!e.permanent || (Number(e.smtpCode) >= 500 && Number(e.smtpCode) < 600) });
            try {
              await conn?.close();
            } catch {
              /* لا يهم */
            }
            conn = null;
          }
        }
        return out;
      } finally {
        try {
          await conn?.close();
        } catch {
          /* لا يهم */
        }
        flushing = false;
      }
    },

    /** فشل نهائي: إشعار واحد لمديري النظام في الساعة (email.failed، CS-16) */
    notifyFailure(row, err) {
      try {
        const hour = nowIso().slice(0, 13);
        app.companyNotify?.once('email.failed', `email.failed:${hour}`, () => {
          const admins = db.all("SELECT id FROM users WHERE role = 'admin' AND active = 1").map((x) => x.id);
          app.notifications.notify(admins, { type: 'email.failed', title: 'تعذّر إرسال رسائل بريد للشركات', body: `${LABELS.email_purpose?.[row.purpose] || row.purpose}: ${err}`, link: '#/automations?tab=outbox' });
        });
      } catch (e) {
        app.log?.('email failure notify', e);
      }
    },

    /** «إرسال رسالة تجربة إلى بريدي» (A): إلى users.email للمدير الذي ضغط */
    async test(actor, { smtp = {} } = {}) {
      const u = actor?.id ? db.get('SELECT id, email, name FROM users WHERE id = ?', actor.id) : null;
      if (!u?.email || !validAddress(u.email)) return { ok: false, message: 'أضف بريدك الإلكتروني إلى حسابك أولًا («حسابي والأمان») ثم أعد التجربة.' };
      if (settingsOf().provider !== 'smtp') return { ok: false, message: 'المزوّد الحالي «بلا إرسال — صندوق صادر فقط»؛ اختر SMTP واحفظ الإعدادات ثم أعد التجربة.' };
      const msg = svc.render('test', {});
      const t = nowIso();
      const id = db.insert('email_outbox', { to_address: u.email, to_name: null, subject: msg.subject, body_text: msg.text, purpose: 'test', status: 'queued', provider: 'smtp', attempts: BACKOFF_MIN.length, next_attempt_at: t, created_at: t });
      await svc.flush({ only: [id], smtp });
      const row = db.get('SELECT status, error FROM email_outbox WHERE id = ?', id);
      if (row.status === 'queued') db.run("UPDATE email_outbox SET status = 'failed' WHERE id = ?", id);
      app.audit?.log({ actor, type: 'email.test_sent', severity: row.status === 'sent' ? 'info' : 'warning', summary: `رسالة تجربة للبريد الإلكتروني: ${row.status === 'sent' ? 'أُرسلت' : 'تعذّر الإرسال'}`, data: { outbox_id: id, ok: row.status === 'sent' } });
      return row.status === 'sent' ? { ok: true, message: `أُرسلت رسالة التجربة إلى ${u.email}.` } : { ok: false, message: `تعذّر الإرسال: ${row.error || 'خطأ غير معروف'}` };
    },

    /** صندوق الصادر لمدير النظام (بلا نص الرسائل) */
    outboxList({ status = null, limit = 100 } = {}) {
      const n = Math.min(Math.max(Number(limit) || 100, 1), 200);
      const where = [];
      const params = [];
      if (status && LABELS.email_status?.[status]) {
        where.push('status = ?');
        params.push(status);
      }
      const rows = db.all(`SELECT id, to_address, purpose, status, error, created_at, sent_at, attempts FROM email_outbox ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`, ...params, n);
      const counts = Object.fromEntries(db.all('SELECT status, COUNT(*) AS n FROM email_outbox GROUP BY status').map((r) => [r.status, Number(r.n)]));
      return {
        provider: svc.provider(),
        enabled: svc.enabled(),
        counts,
        items: rows.map((r) => ({
          id: r.id,
          to_address: r.to_address,
          purpose: r.purpose,
          purpose_label: LABELS.email_purpose?.[r.purpose] || r.purpose,
          status: r.status,
          status_label: LABELS.email_status?.[r.status] || r.status,
          error: r.error || null,
          attempts: Number(r.attempts) || 0,
          created_at: r.created_at,
          sent_at: r.sent_at || null,
        })),
      };
    },

    /** حذف صفوف الصادر الأقدم من مدة الاحتفاظ (b2b.cleanup) */
    purgeOld() {
      const days = Math.max(7, Number(app.settings.get('b2b_outbox_retention_days')) || 90);
      const cutoff = new Date(now().getTime() - days * 86400000).toISOString();
      return db.run("DELETE FROM email_outbox WHERE created_at < ? AND status IN ('sent','simulated','failed','skipped')", cutoff).changes;
    },

    /** بنود جاهزية الإطلاق (B10-59 مرفوع إلى P0، CO-2، L-62): حمراء متى وُجدت شركة */
    readiness() {
      const companies = Number(db.value("SELECT COUNT(*) FROM companies WHERE status != 'ended'"));
      if (!companies) return [];
      const items = [];
      const p = settingsOf();
      if (config.demo) items.push({ key: 'email', level: 'info', title: 'البريد الإلكتروني للشركات: وضع العرض التجريبي', detail: 'الرسائل تُحفظ في صندوق الصادر ولا تُرسل.', href: '#/integrations' });
      else if (p.provider === 'outbox') {
        items.push({ key: 'email', level: 'danger', title: 'البريد الإلكتروني للشركات غير مضبوط', detail: 'لا تصل الشركات أي رسالة (دعوات، استيضاحات، عروض أسعار، تسليمات) — البريد قناتها الوحيدة. اضبط SMTP من «التكاملات».', href: '#/integrations' });
      } else {
        const o = smtpOptions();
        items.push(o.error ? { key: 'email', level: 'danger', title: 'إعدادات SMTP ناقصة', detail: o.error, href: '#/integrations' } : { key: 'email', level: 'ok', title: 'البريد الإلكتروني للشركات عبر SMTP', detail: `${o.host}:${o.port}`, href: '#/integrations' });
      }
      if (!config.publicBaseUrl && !config.demo) items.push({ key: 'b2b_base_url', level: 'danger', title: 'PUBLIC_BASE_URL غير مضبوط وتوجد شركات', detail: 'بدونه لا تُرسل رسائل الشركات (لا روابط للبوابة ولا للدعوات).', href: null });
      const legal = String(app.settings.get('org_legal_name') || '');
      if (!legal || legal === DEFAULT_SETTINGS.org_legal_name) {
        items.push({ key: 'contracting_entity', level: 'danger', title: 'بيانات الجهة المتعاقدة ما زالت الافتراضية', detail: 'تظهر للشركات في «الباقة والاستخدام» و«بيانات الشركة». اضبط الاسم القانوني والسجل التجاري من «ملف المؤسسة».', href: '#/settings?section=org' });
      }
      return items;
    },
  };

  // الإرسال كل دقيقة (لا يعمل في العرض التجريبي ولا مع صندوق الصادر)
  app.jobs?.register('email.flush', {
    everyMinutes: 1,
    label: 'إرسال بريد الشركات المنتظر',
    deferred: (r) => !!r?.deferred,
    run: async () => {
      if (svc.isSimulated()) return { deferred: true, simulated: true };
      return svc.flush();
    },
  });

  void ApiError;
  return svc;
}
