// Lane A — Website door (validation, consent, honeypot, attachments), client portal (token access, messages,
// replies to information requests), and privacy of the unauthenticated website door.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload, samplePdf, freezeClock, resetClock } from './helpers.js';

const DESC = 'زوجي توفي منذ عام وترك شقة باسمه، وأهل زوجي يطالبون ببيعها، وأريد معرفة حقي وحق أطفالي القُصّر.';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function form(extra = {}) {
  return { name: 'أم يوسف', phone: '01011112222', description: DESC, consent: true, ...extra };
}
async function submit(t, body) {
  return t.client().post('/api/public/intake', body);
}
async function totalIntakes(admin) {
  return (await admin.get('/api/admin/intakes?scope=all')).body.total;
}
function tokenOf(portalUrl) {
  return portalUrl.split('/p/')[1];
}
async function sendWa(t, opts) {
  const r = await t.client().post('/webhooks/whatsapp', waPayload(opts));
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

describe('Website intake validation', () => {
  test('an Egyptian mobile number is required (missing, landline, foreign and malformed numbers are rejected)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      for (const phone of [undefined, '', '0223456789', '+971501234567', '0101234567', '01312345678']) {
        const r = await submit(t, form({ phone }));
        assert.equal(r.status, 400, `phone ${phone} -> ${r.status}`);
        assert.equal(r.body.code, 'bad_phone'); // v11 segment-server (intended, r2 S16): رمز ثابت لكل خطأ في نموذج الطلب
        assert.match(r.body.error, /[؀-ۿ]/);
      }
      assert.equal(await totalIntakes(admin), 0);
      assert.equal((await admin.get('/api/admin/clients')).body.total, 0, 'rejected submissions must not create clients');
      const ok = await submit(t, form({ phone: '01212345678' }));
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      assert.equal(await totalIntakes(admin), 1);
    } finally {
      await t.close();
    }
  });

  test('privacy consent is required (missing or false => 400)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const { consent: _c, ...noConsent } = form();
      assert.equal((await submit(t, noConsent)).status, 400);
      assert.equal((await submit(t, form({ consent: false }))).status, 400);
      assert.equal(await totalIntakes(admin), 0);
      assert.equal((await submit(t, form({ consent: true }))).status, 201);
    } finally {
      await t.close();
    }
  });

  test('honeypot: a bot filling the hidden "website" field gets a quiet success but nothing is stored', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const r = await submit(t, form({ website: 'http://spam.example' }));
      assert.ok(r.status >= 200 && r.status < 300, `bots should not learn they were caught (${r.status})`);
      assert.ok(!r.body.reference, 'no reference is issued');
      assert.ok(!r.body.portal_url, 'no portal link is issued');
      assert.equal(await totalIntakes(admin), 0);
      assert.equal((await admin.get('/api/admin/clients')).body.total, 0);
      assert.equal((await admin.get('/api/notifications')).body.items.length, 0);
    } finally {
      await t.close();
    }
  });

  test('description needs a minimum length; name, email, governorate and legal area are validated', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const bad = [
        // v9.1 b-forms: الحد الأدنى صار 10 حروف (أو رسالة صوتية)، فـ«معاش» وحدها قصيرة
        form({ description: 'معاش' }),
        form({ description: '                         ' }),
        form({ description: undefined }),
        form({ name: '' }),
        form({ email: 'not-an-email' }),
        form({ governorate: 'باريس' }),
        form({ legal_area: 'SPACE' }),
        form({ documents: 'not-a-list' }),
      ];
      for (const b of bad) {
        const r = await submit(t, b);
        assert.equal(r.status, 400, `${JSON.stringify(b).slice(0, 120)} -> ${r.status}`);
      }
      assert.equal(await totalIntakes(admin), 0);
      const ok = await submit(t, form({ email: 'OmYoussef@Example.com', governorate: 'الإسكندرية', legal_area: 'INH', mode: 'guided' }));
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      assert.equal(it.legal_area, 'INH', 'citizen hint is kept as the initial area');
      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      assert.equal(d.intake.governorate, 'الإسكندرية');
      assert.ok(d.client.identities.some((x) => x.kind === 'email' && x.value === 'omyoussef@example.com'));
    } finally {
      await t.close();
    }
  });

  test('attachments are saved with the website message (both files, linked to the message, uploaded by the client)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const pdf = samplePdf('عقد_الشقة.pdf');
      const png = { filename: 'صورة_البطاقة.png', mime: 'image/png', data_base64: PNG_1PX };
      const r = await submit(t, form({ documents: [pdf, png] }));
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      assert.equal(it.documents_count, 2);
      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      assert.deepEqual(d.documents.map((x) => x.filename).sort(), ['صورة_البطاقة.png', 'عقد_الشقة.pdf'].sort());
      assert.equal(d.messages[0].documents.length, 2, 'documents are linked to the website message');
      for (const doc of d.documents) assert.equal(doc.uploaded_by_kind, 'client');
      const pdfDoc = d.documents.find((x) => x.filename === 'عقد_الشقة.pdf');
      assert.equal(pdfDoc.mime, 'application/pdf');
      assert.equal(pdfDoc.size, Buffer.from(pdf.data_base64, 'base64').length);
    } finally {
      await t.close();
    }
  });

  test('staff can download a saved attachment: original bytes, its MIME type, as an attachment', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const pdf = samplePdf('عقد_الشقة.pdf');
      assert.equal((await submit(t, form({ documents: [pdf] }))).status, 201);
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      const doc = (await admin.get(`/api/admin/intakes/${it.id}`)).body.documents[0];
      const dl = await admin.get(`/api/documents/${doc.id}/download`);
      assert.equal(dl.status, 200);
      assert.equal(dl.headers.get('content-type'), 'application/pdf', `download returned ${dl.headers.get('content-type')}: ${JSON.stringify(dl.body).slice(0, 80)}`);
      assert.match(dl.headers.get('content-disposition') || '', /attachment/);
      assert.ok(Buffer.isBuffer(dl.body));
      assert.equal(Buffer.compare(dl.body, Buffer.from(pdf.data_base64, 'base64')), 0, 'downloaded bytes equal the uploaded bytes');
    } finally {
      await t.close();
    }
  });

  test('client documents cannot be downloaded anonymously (401) or by an unassigned lawyer (404)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      assert.equal((await submit(t, form({ documents: [samplePdf('سري.pdf')] }))).status, 201);
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      const doc = (await admin.get(`/api/admin/intakes/${it.id}`)).body.documents[0];
      const anon = await t.client().get(`/api/documents/${doc.id}/download`);
      assert.equal(anon.status, 401);
      const lw = await admin.post('/api/admin/lawyers', { username: 'outsider', password: 'Lawyer@2026', name: 'محامٍ غير مكلف', specialties: ['INH'], agreement: { type: 'per_case', rate: 500 } });
      assert.equal(lw.status, 201);
      const lawyer = await t.login('outsider', 'Lawyer@2026');
      const denied = await lawyer.get(`/api/documents/${doc.id}/download`);
      assert.equal(denied.status, 404, 'an unassigned lawyer must not be able to download client documents');
      assert.equal(denied.body.code, 'not_found');
      assert.equal((await lawyer.get('/api/documents/999999/download')).status, 404, 'missing and forbidden documents look the same');
    } finally {
      await t.close();
    }
  });

  test('unsupported or oversized attachments are rejected and nothing is stored; filenames are sanitized', async () => {
    const t = await startTestApp({ seed: 'none', config: { maxUploadMb: 1 } });
    try {
      const admin = await t.login('admin');
      const exe = { filename: 'invoice.exe', mime: 'application/x-msdownload', data_base64: Buffer.from('MZ fake').toString('base64') };
      assert.equal((await submit(t, form({ documents: [samplePdf('ok.pdf'), exe] }))).status, 400);
      const big = { filename: 'big.pdf', mime: 'application/pdf', data_base64: Buffer.alloc(1.5 * 1024 * 1024, 65).toString('base64') };
      assert.equal((await submit(t, form({ documents: [big] }))).status, 400);
      assert.equal(await totalIntakes(admin), 0, 'a rejected upload must not leave a half-created intake');
      assert.equal((await admin.get('/api/admin/clients')).body.total, 0);

      const evil = { ...samplePdf(), filename: '../../../etc/passwd.pdf' };
      const ok = await submit(t, form({ documents: [evil] }));
      assert.equal(ok.status, 201);
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      assert.equal(d.documents.length, 1);
      assert.ok(!d.documents[0].filename.includes('/') && !d.documents[0].filename.includes('..'), d.documents[0].filename);
    } finally {
      await t.close();
    }
  });
});

describe('Client portal', () => {
  test('GET with a valid token shows the client their own requests and conversation — without internal notes or marketing data', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const res = (await submit(t, form({ name: 'هدى سالم', attribution: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'SECRET-CAMPAIGN' } }))).body;
      const admin = await t.login('admin');
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      await admin.patch(`/api/admin/intakes/${it.id}`, { internal_notes: 'ملاحظة داخلية سرية: العميلة متوترة' });
      await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'استلمنا طلبك وجاري المراجعة.' });

      const p = await t.client().get(`/api/portal/${tokenOf(res.portal_url)}`);
      assert.equal(p.status, 200, JSON.stringify(p.body));
      assert.equal(p.body.client.name, 'هدى سالم');
      assert.ok(p.body.intakes.some((x) => x.code === res.reference));
      assert.ok(p.body.messages.some((m) => m.direction === 'in' && m.body === DESC));
      assert.ok(p.body.messages.some((m) => m.direction === 'out' && m.body === 'استلمنا طلبك وجاري المراجعة.'));
      const s = JSON.stringify(p.body);
      assert.ok(!s.includes('ملاحظة داخلية سرية'), 'internal notes must not reach the client');
      assert.ok(!s.includes('SECRET-CAMPAIGN') && !s.includes('facebook_ad'), 'marketing attribution is internal');
    } finally {
      await t.close();
    }
  });

  test('invalid, unknown or expired tokens get 404 and cannot post', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const res = (await submit(t, form())).body;
      const anon = t.client();
      for (const tok of ['abc', 'A'.repeat(32), tokenOf(res.portal_url).slice(0, -1) + (tokenOf(res.portal_url).endsWith('A') ? 'B' : 'A')]) {
        const r = await anon.get(`/api/portal/${tok}`);
        assert.equal(r.status, 404, tok);
        assert.equal(r.body.code, 'not_found');
        assert.equal((await anon.post(`/api/portal/${tok}/messages`, { body: 'رسالة' })).status, 404);
      }
      const admin = await t.login('admin');
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      assert.equal(it.messages_count, 1, 'nothing was posted through invalid tokens');

      freezeClock(new Date(Date.now() + 400 * 86400000).toISOString());
      assert.equal((await anon.get(`/api/portal/${tokenOf(res.portal_url)}`)).status, 404, 'portal links expire');
    } finally {
      resetClock();
      await t.close();
    }
  });

  test('a message sent from the portal lands in the same open intake (channel website) and alerts staff; empty messages are rejected', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const res = (await submit(t, form())).body;
      const tok = tokenOf(res.portal_url);
      const c = t.client();
      assert.equal((await c.post(`/api/portal/${tok}/messages`, { body: '   ' })).status, 400);
      const m = await c.post(`/api/portal/${tok}/messages`, { body: 'أرسلت لكم صورة العقد.', documents: [samplePdf('العقد.pdf')] });
      assert.equal(m.status, 200, JSON.stringify(m.body));
      const admin = await t.login('admin');
      const list = (await admin.get('/api/admin/intakes')).body;
      assert.equal(list.total, 1);
      const it = list.items[0];
      assert.equal(it.code, res.reference);
      assert.equal(it.messages_count, 2);
      assert.equal(it.documents_count, 1);
      assert.ok(it.unread_count >= 2);
      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      const last = d.messages[d.messages.length - 1];
      assert.equal(last.channel, 'website');
      assert.equal(last.direction, 'in');
      assert.equal(last.body, 'أرسلت لكم صورة العقد.');
      assert.equal(last.documents.length, 1);
    } finally {
      await t.close();
    }
  });

  test('information request round-trip: admin sends, client replies with a document via the portal, staff review & share; later replies are refused', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const res = (await submit(t, form())).body;
      const other = (await submit(t, form({ phone: '01099998888', name: 'عميل آخر' }))).body;
      const tok = tokenOf(res.portal_url);
      const admin = await t.login('admin');
      const it = (await admin.get(`/api/admin/intakes?q=${res.reference}`)).body.items.find((x) => x.code === res.reference);
      const kase = (await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'INH', title: 'حقوق الزوجة والقصر في شقة الزوج' })).body.case;

      const ir = await admin.post(`/api/admin/cases/${kase.id}/info-requests`, { kind: 'document', question: 'صورة إعلام الوراثة', client_message: 'برجاء رفع صورة إعلام الوراثة.' });
      assert.equal(ir.status, 200, JSON.stringify(ir.body));
      assert.equal(ir.body.status, 'sent_to_client');
      assert.equal(ir.body.sent_channel, 'website', 'a website client is contacted on the website');

      const p = (await t.client().get(`/api/portal/${tok}`)).body;
      const req = p.requests.find((x) => x.id === ir.body.id);
      assert.ok(req, 'the request is visible in the portal');
      assert.equal(req.can_reply, true);
      // v9.1 b-portal (B91-02): رقم الطلب REQ هو الرقم الوحيد الذي تراه؛ case_code لا يصل للصفحة (cases[] باقية للتوافق)
      assert.equal(req.case_code, undefined);
      assert.equal(req.story_ref, res.reference);
      // v9.1 fixes: cases[] تحمل رقم الطلب REQ (ref) بدل كود الملف الداخلي
      assert.ok(p.cases.some((c) => c.ref === res.reference && c.code === undefined));
      assert.ok(!JSON.stringify(p).includes(kase.code), 'no internal case code anywhere in the portal JSON');

      // another client's token cannot answer this request
      const foreign = await t.client().post(`/api/portal/${tokenOf(other.portal_url)}/requests/${ir.body.id}/reply`, { body: 'رد دخيل' });
      assert.equal(foreign.status, 404);
      assert.equal((await t.client().post(`/api/portal/${tok}/requests/99999/reply`, { body: 'x' })).status, 404);
      assert.equal((await t.client().post(`/api/portal/${tok}/requests/${ir.body.id}/reply`, {})).status, 400);

      const reply = await t.client().post(`/api/portal/${tok}/requests/${ir.body.id}/reply`, { body: 'مرفق إعلام الوراثة.', documents: [samplePdf('اعلام_وراثة.pdf')] });
      assert.equal(reply.status, 200, JSON.stringify(reply.body));

      const cd = (await admin.get(`/api/admin/cases/${kase.id}`)).body;
      const r = cd.info_requests.find((x) => x.id === ir.body.id);
      assert.equal(r.status, 'client_replied');
      assert.match(r.client_reply, /مرفق إعلام الوراثة/);
      assert.equal(r.documents.length, 1);
      assert.equal(r.documents[0].filename, 'اعلام_وراثة.pdf');
      assert.ok(cd.documents.some((x) => x.filename === 'اعلام_وراثة.pdf'), 'the document joins the case file');
      assert.ok(cd.messages.some((m) => m.direction === 'in' && m.body === 'مرفق إعلام الوراثة.'));
      const notes = (await admin.get('/api/notifications')).body.items;
      assert.ok(notes.some((n) => n.type === 'info_request.replied' || (n.title || '').includes(kase.code)), 'staff are told the client replied');
      assert.equal((await admin.get('/api/admin/intakes')).body.items.filter((x) => x.code !== other.reference).length, 0, 'portal reply must not open a new intake');

      const sh = await admin.post(`/api/admin/info-requests/${ir.body.id}/share`, { response_text: 'أرسلت العميلة إعلام الوراثة.', document_ids: [r.documents[0].id] });
      assert.equal(sh.status, 200, JSON.stringify(sh.body));
      const late = await t.client().post(`/api/portal/${tok}/requests/${ir.body.id}/reply`, { body: 'رد متأخر' });
      assert.equal(late.status, 409, 'a request no longer awaiting the client cannot be answered');
    } finally {
      await t.close();
    }
  });

  test('staff can issue and send a fresh portal link; for a WhatsApp client it goes out on WhatsApp (simulated)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201044400011', text: 'عندي مشكلة في عقد العمل' });
      const admin = await t.login('admin');
      const it = (await admin.get('/api/admin/intakes')).body.items[0];
      const r = await admin.post(`/api/admin/clients/${it.client_id}/portal-link`, { send: true });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.match(r.body.url, /\/p\/[A-Za-z0-9_-]{20,}$/);
      assert.ok(r.body.message_id);
      const out = (await admin.get('/api/admin/outbox')).body.find((m) => m.id === r.body.message_id);
      assert.equal(out.channel, 'whatsapp');
      assert.equal(out.status, 'simulated');
      const p = await t.client().get(`/api/portal/${tokenOf(r.body.url)}`);
      assert.equal(p.status, 200);
      // v9.1 fixes (B91-02): كود العميل CL- داخلي لا يصل للصفحة
      assert.equal(p.body.client.code, null);
      assert.ok(!JSON.stringify(p.body).includes(it.client_code));
    } finally {
      await t.close();
    }
  });
});

describe('Privacy of the unauthenticated website door', () => {
  test("submitting the website form with an existing client's phone must not hand the submitter a portal exposing that client's file", async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      // anyone can type a known phone number into the public form
      const r = await submit(t, form({ name: 'شخص آخر', phone: '01012345678', description: 'أريد استشارة قانونية بخصوص موضوع عائلي مهم جدًا.' }));
      assert.equal(r.status, 201);
      if (r.body.portal_url) {
        const p = await t.client().get(`/api/portal/${tokenOf(r.body.portal_url)}`);
        const s = JSON.stringify(p.body);
        assert.ok(!s.includes('INH-2026-00482'), "the existing client's case must not be exposed to an unverified website submitter");
        assert.ok(!s.includes('سامية'), "the existing client's name must not be exposed");
        assert.ok(!(p.body.messages || []).some((m) => m.direction === 'out'), "staff messages to the existing client must not be exposed");
      }
    } finally {
      await t.close();
    }
  });

  test("a new phone + an existing client's email must not unlock that client's portal or silently attach the phone to them", async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const victim = (await submit(t, form({ name: 'ليلى', phone: '01022233344', email: 'laila@example.com' }))).body;
      const admin = await t.login('admin');
      const vi = (await admin.get('/api/admin/intakes')).body.items[0];
      const kase = (await admin.post(`/api/admin/intakes/${vi.id}/convert`, { legal_area: 'FAM', title: 'نفقة وحضانة' })).body.case;
      await admin.post(`/api/admin/cases/${kase.id}/messages`, { body: 'رسالة سرية لليلى بخصوص الحضانة.' });

      const attacker = await submit(t, form({ name: 'مجهول', phone: '01155566677', email: 'laila@example.com' }));
      assert.equal(attacker.status, 201);
      if (attacker.body.portal_url) {
        const p = await t.client().get(`/api/portal/${tokenOf(attacker.body.portal_url)}`);
        const s = JSON.stringify(p.body);
        assert.ok(!s.includes(kase.code), "victim's case code exposed through email match");
        assert.ok(!s.includes('رسالة سرية لليلى'), "victim's messages exposed through email match");
      }
      const vc = (await admin.get(`/api/admin/clients/${vi.client_id}`)).body;
      assert.ok(!vc.identities.some((x) => x.value === '+201155566677'), "an unverified phone must not be auto-linked to the victim's client");
      void victim;
    } finally {
      await t.close();
    }
  });
});
