// أدوات الاختبار: تشغيل نسخة معزولة من التطبيق على منفذ عشوائي وقاعدة بيانات مؤقتة، وعميل HTTP يحفظ الكعكات.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { bootstrap } from '../src/bootstrap.js';
import { setClock } from '../src/util.js';

/**
 * تشغيل تطبيق معزول.
 * @param {object} opts { seed: 'demo' | 'none', config: {...overrides} }
 *   seed 'demo' يملأ البيانات التجريبية الكاملة (حسابات: admin/Admin@2026، manager/Manager@2026، ahmed|mohamed|salwa|hany|yasmine|tarek|rania|amr / Lawyer@2026).
 *   seed 'none' ينشئ فقط مدير نظام: admin / Admin@2026 (وضع إنتاج، بلا بيانات تجريبية).
 */
export async function startTestApp({ seed = 'none', config = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-test-'));
  const cfg = loadConfig({
    dataDir: dir,
    dbPath: path.join(dir, 'test.db'),
    uploadsDir: path.join(dir, 'uploads'),
    demo: seed === 'demo',
    adminUsername: 'admin',
    adminPassword: 'Admin@2026',
    schedulerIntervalSeconds: 0,
    silent: true,
    // رقم اختبار صريح (الرقم التوضيحي 201000000000 يُعامل كـ«غير مضبوط» ولا يُنتج رابط wa.me)
    whatsapp: { token: '', phoneNumberId: '', verifyToken: 'verify-me', appSecret: '', numberDigits: '201000000001' },
    ai: { provider: 'heuristic', anthropicApiKey: '' },
    ...config,
  });
  const app = createApp(cfg);
  await bootstrap(app);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    app,
    base,
    dir,
    client: () => new Client(base),
    async login(username, password = username === 'admin' ? 'Admin@2026' : username === 'manager' ? 'Manager@2026' : 'Lawyer@2026') {
      const c = new Client(base);
      const r = await c.post('/api/auth/login', { username, password });
      if (r.status !== 200) throw new Error(`login failed for ${username}: ${r.status} ${JSON.stringify(r.body)}`);
      c.user = r.body.user;
      return c;
    },
    async close() {
      setClock(null);
      await app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** عميل HTTP بسيط يحفظ كعكة الجلسة ويرسل JSON */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }
  async request(method, url, body, headers = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' || body instanceof Buffer ? body : JSON.stringify(body);
      if (!h['content-type']) h['content-type'] = 'application/json';
    } else if (method !== 'GET' && method !== 'HEAD') {
      payload = '{}';
      if (!h['content-type']) h['content-type'] = 'application/json';
    }
    const res = await fetch(this.base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = /bm_sid=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `bm_sid=${m[1]}` : '';
    }
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) data = await res.json();
    else if (ct.startsWith('text/')) data = await res.text();
    else data = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: data, headers: res.headers };
  }
  /**
   * تنزيل حساس (تصدير CSV، نسخة احتياطية، تصدير كامل): POST يصدر رابطًا لمرة واحدة ثم GET له
   * (src/services/downloads.js). يعيد رد POST كما هو إن لم يكن 200 (403/404/409…).
   */
  async download(url, body = {}) {
    const ticket = await this.post(url, body);
    if (ticket.status !== 200 || !ticket.body?.url) return ticket;
    const r = await this.get(ticket.body.url);
    r.ticket = ticket.body;
    return r;
  }
  get(url, headers) { return this.request('GET', url, undefined, headers); }
  post(url, body, headers) { return this.request('POST', url, body, headers); }
  put(url, body, headers) { return this.request('PUT', url, body, headers); }
  patch(url, body, headers) { return this.request('PATCH', url, body, headers); }
  del(url, body, headers) { return this.request('DELETE', url, body, headers); }
}

/** ملف PDF صغير بصيغة base64 للاختبارات */
export function samplePdf(name = 'doc.pdf') {
  const pdf = '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n';
  return { filename: name, mime: 'application/pdf', data_base64: Buffer.from(pdf).toString('base64') };
}

/** بناء Webhook واتساب بصيغة Meta */
export function waPayload({ from = '201012345678', name = 'عميل', text = 'مرحبا', id, referral, type = 'text', extra = {} } = {}) {
  const msg = { from, id: id || `wamid.TEST.${Math.random().toString(36).slice(2)}`, timestamp: String(Math.floor(Date.now() / 1000)), type, ...extra };
  if (type === 'text') msg.text = { body: text };
  if (referral) msg.referral = referral;
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'PNID' }, contacts: [{ profile: { name }, wa_id: from }], messages: [msg] } }] }],
  };
}

/** ضبط ساعة التطبيق (للأتمتة المعتمدة على الوقت) */
export function freezeClock(iso) {
  const t = new Date(iso).getTime();
  setClock(() => new Date(t));
}
export function resetClock() {
  setClock(null);
}
