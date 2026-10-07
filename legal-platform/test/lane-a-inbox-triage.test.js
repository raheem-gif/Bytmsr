// Lane A — Unified inbox triage: manual intake (phone/walk-in/email doors), handle internally / archive / reopen,
// conversion to a Case, AI assistance with staff decision + feedback, and outbound channel selection.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload, samplePdf } from './helpers.js';

const DESC = 'توفي والدي وترك شقة ومحلًا تجاريًا، وأخي الأكبر يرفض قسمة التركة ويضع يده على المحل.';

async function sendWa(t, opts) {
  const r = await t.client().post('/webhooks/whatsapp', waPayload(opts));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function webIntake(t, body = {}) {
  const r = await t.client().post('/api/public/intake', { name: 'مواطن', phone: '01011112222', description: DESC, consent: true, ...body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function inbox(admin, query = '') {
  const r = await admin.get('/api/admin/intakes' + query);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function only(admin, query = '') {
  const l = await inbox(admin, query);
  assert.equal(l.total, 1, `expected exactly one intake, got ${l.total}`);
  return l.items[0];
}
async function waitFor(fn, { timeout = 4000, step = 50 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, step));
  }
}
async function metrics(admin) {
  const r = await admin.get('/api/admin/ai/metrics');
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.body.fields.map((f) => [f.field, f]));
  const get = (field, verdict) => by[field]?.[verdict] ?? 0;
  return { raw: r.body, get };
}

describe('Manual intake — phone / walk-in / email doors feed the same engine', () => {
  test('staff log a phone call: intake with channel phone and the chosen source; later WhatsApp from that number joins the same intake', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const r = await admin.post('/api/admin/intakes', {
        channel: 'phone',
        phone: '01155554444',
        name: 'الحاجة فاطمة',
        text: 'اتصلت تسأل عن حقها في معاش زوجها المتوفى وكيفية استخراج إعلام الوراثة.',
        source: 'referral',
        campaign: 'جمعية الأمل',
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.match(r.body.code, /^REQ-\d{4}-\d{5}$/);
      assert.equal(r.body.first_channel, 'phone');
      assert.equal(r.body.source, 'referral');
      assert.equal(r.body.status, 'new');

      await sendWa(t, { from: '201155554444', text: 'أنا فاطمة اللي كلمتكم في التليفون، معايا صورة شهادة الوفاة.' });
      const it = await only(admin, '?scope=all');
      assert.equal(it.id, r.body.id);
      assert.deepEqual([...it.channels].sort(), ['phone', 'whatsapp']);
      assert.equal(it.messages_count, 2);
      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      assert.equal(d.client.name, 'الحاجة فاطمة');
      assert.equal(d.client.phone, '+201155554444');
    } finally {
      await t.close();
    }
  });

  test('manual intake validation: phone required for phone/walk-in, email required for email, WhatsApp/website cannot be faked manually', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const text = 'وصف الطلب كما رواه المواطن في المكالمة.';
      const cases = [
        [{ channel: 'phone', text }, 400],
        [{ channel: 'walk_in', text }, 400],
        [{ channel: 'email', phone: '01155554444', text }, 400],
        [{ channel: 'whatsapp', phone: '01155554444', text }, 400],
        [{ channel: 'website', phone: '01155554444', text }, 400],
        [{ channel: 'phone', phone: '01155554444' }, 400],
        [{ channel: 'phone', phone: 'abc', text }, 400],
        [{ channel: 'phone', phone: '01155554444', text, source: 'tiktok_magic' }, 400],
      ];
      for (const [body, status] of cases) {
        const r = await admin.post('/api/admin/intakes', body);
        assert.equal(r.status, status, `${JSON.stringify(body)} -> ${r.status} ${JSON.stringify(r.body)}`);
        assert.equal(typeof r.body.error, 'string');
      }
      assert.equal((await inbox(admin, '?scope=all')).total, 0, 'rejected manual intakes must not create anything');
      const email = await admin.post('/api/admin/intakes', { channel: 'email', email: 'Client@Example.com', text, name: 'عميل بريد' });
      assert.equal(email.status, 201, JSON.stringify(email.body));
      assert.equal(email.body.first_channel, 'email');
      const walk = await admin.post('/api/admin/intakes', { channel: 'walk_in', phone: '01234567890', text });
      assert.equal(walk.status, 201, JSON.stringify(walk.body));
      assert.equal(walk.body.first_channel, 'walk_in');
    } finally {
      await t.close();
    }
  });

  test('a case manager can log a manual intake and triage it', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const u = await admin.post('/api/admin/users', { role: 'case_manager', username: 'mona', name: 'منى', password: 'Manager@2026' });
      assert.equal(u.status, 201, JSON.stringify(u.body));
      const mgr = await t.login('mona', 'Manager@2026');
      const r = await mgr.post('/api/admin/intakes', { channel: 'walk_in', phone: '01099990000', text: 'حضر للمقر يسأل عن نزاع جيرة.' });
      assert.equal(r.status, 201);
      const h = await mgr.post(`/api/admin/intakes/${r.body.id}/handle-internally`, { resolution_note: 'تم توجيهه لمكتب التسوية' });
      assert.equal(h.status, 200, JSON.stringify(h.body));
      assert.equal(h.body.status, 'handled_internally');
    } finally {
      await t.close();
    }
  });
});

describe('Req 3 — admin decides: handle internally, archive, reopen, or convert', () => {
  test('handle internally (with reply to the client), leaves the open inbox, cannot be decided twice, and can be reopened', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201066600011', text: 'هو الشهر العقاري بيفتح يوم السبت؟' });
      const admin = await t.login('admin');
      const it = await only(admin);

      const missing = await admin.post(`/api/admin/intakes/${it.id}/handle-internally`, {});
      assert.equal(missing.status, 400, 'a resolution note is required');

      const h = await admin.post(`/api/admin/intakes/${it.id}/handle-internally`, { resolution_note: 'استفسار عام تم الرد عليه', reply: 'نعم، بعض المكاتب تعمل يوم السبت.' });
      assert.equal(h.status, 200, JSON.stringify(h.body));
      assert.equal(h.body.status, 'handled_internally');
      assert.equal(h.body.case_id, null, 'handling internally must not create a case');
      assert.equal((await inbox(admin)).total, 0, 'decided intake leaves the open inbox');
      assert.equal((await inbox(admin, '?status=handled_internally')).total, 1);
      assert.equal((await admin.get('/api/admin/cases')).body.total, 0);

      const d = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      const out = d.messages.filter((m) => m.direction === 'out');
      assert.equal(out.length, 1);
      assert.equal(out[0].channel, 'whatsapp');
      assert.equal(out[0].status, 'simulated', 'without WhatsApp credentials outbound is simulated');

      const again = await admin.post(`/api/admin/intakes/${it.id}/handle-internally`, { resolution_note: 'مرة أخرى' });
      assert.equal(again.status, 409);
      const convertDecided = await admin.post(`/api/admin/intakes/${it.id}/reopen`, {});
      assert.equal(convertDecided.status, 200, JSON.stringify(convertDecided.body));
      assert.equal(convertDecided.body.status, 'in_review');
      assert.equal((await inbox(admin)).total, 1, 'reopened intake is back in the open inbox');
      const reopenOpen = await admin.post(`/api/admin/intakes/${it.id}/reopen`, {});
      assert.equal(reopenOpen.status, 409, 'an already-open intake cannot be reopened');
    } finally {
      await t.close();
    }
  });

  test('archive requires a reason, removes from open inbox, and can be reopened', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201066600022', text: 'تست' });
      const admin = await t.login('admin');
      const it = await only(admin);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/archive`, {})).status, 400);
      const a = await admin.post(`/api/admin/intakes/${it.id}/archive`, { reason: 'رسالة تجريبية' });
      assert.equal(a.status, 200);
      assert.equal(a.body.status, 'archived');
      assert.equal((await inbox(admin)).total, 0);
      assert.equal((await inbox(admin, '?status=archived')).total, 1);
      const r = await admin.post(`/api/admin/intakes/${it.id}/reopen`, {});
      assert.equal(r.status, 200);
      assert.equal(r.body.status, 'in_review');
    } finally {
      await t.close();
    }
  });

  test('convert to a Case: validation, independent AREA-YYYY-NNNNN code, issues numbered, intake documents & messages move into the case, no second conversion', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await webIntake(t, { phone: '01077766655', name: 'سعاد', documents: [samplePdf('شهادة_الوفاة.pdf')] });
      const admin = await t.login('admin');
      const it = await only(admin);
      assert.equal(it.code, web.reference);

      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/convert`, { title: 'بدون مجال' })).status, 400);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'XYZ', title: 'مجال خاطئ' })).status, 400);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'INH' })).status, 400);
      assert.equal((await admin.get('/api/admin/cases')).body.total, 0, 'failed conversions must not create cases');

      const r = await admin.post(`/api/admin/intakes/${it.id}/convert`, {
        legal_area: 'INH',
        title: 'قسمة تركة مع امتناع أحد الورثة',
        facts_shared: 'توفي المورث وترك شقة ومحلًا.',
        facts_internal: 'العميلة تفضل التواصل مساءً.',
        issues: [{ title: 'تحديد الورثة وأنصبتهم' }, { title: 'امتناع الأخ عن القسمة' }, { title: 'الأثر الضريبي' }],
        priority: 'high',
        client: { name: 'سعاد إبراهيم', national_id: '28501011234567' },
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const c = r.body.case;
      assert.match(c.code, /^INH-\d{4}-\d{5}$/);
      assert.equal(c.status, 'new');

      const intake = (await admin.get(`/api/admin/intakes/${it.id}`)).body;
      assert.equal(intake.intake.status, 'converted');
      assert.equal(intake.intake.case_id, c.id);
      assert.equal(intake.case.code, c.code);

      const cd = (await admin.get(`/api/admin/cases/${c.id}`)).body;
      assert.deepEqual(cd.issues.map((i) => [i.number, i.title]), [[1, 'تحديد الورثة وأنصبتهم'], [2, 'امتناع الأخ عن القسمة'], [3, 'الأثر الضريبي']]);
      assert.equal(cd.documents.length, 1, 'documents sent with the intake belong to the case');
      assert.equal(cd.documents[0].filename, 'شهادة_الوفاة.pdf');
      assert.ok(cd.messages.some((m) => m.direction === 'in' && m.body === DESC));
      assert.equal(cd.client.name, 'سعاد إبراهيم');
      assert.equal(cd.client.national_id, '28501011234567');
      assert.equal(cd.client.code, it.client_code);

      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'INH', title: 'مرة ثانية' })).status, 409);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/archive`, { reason: 'x' })).status, 409);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/handle-internally`, { resolution_note: 'x' })).status, 409);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/reopen`, {})).status, 409);
      assert.equal((await admin.get('/api/admin/cases')).body.total, 1);
    } finally {
      await t.close();
    }
  });

  test('convert rejects an invalid national id without creating a case', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201066600033', text: 'عايز أعمل توكيل لأخويا يبيع الشقة.' });
      const admin = await t.login('admin');
      const it = await only(admin);
      const r = await admin.post(`/api/admin/intakes/${it.id}/convert`, { legal_area: 'CIV', title: 'توكيل بيع', client: { national_id: '12345' } });
      assert.equal(r.status, 400);
      assert.equal((await admin.get('/api/admin/cases')).body.total, 0);
      assert.equal((await only(admin)).status, 'new');
    } finally {
      await t.close();
    }
  });
});

describe('Req 4 — AI assists, staff decide, corrections become feedback', () => {
  test('incoming intake is analysed automatically (title, summary, legal area, missing info, similar cases) without deciding anything', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201033300011', text: DESC });
      const admin = await t.login('admin');
      const item = await waitFor(async () => {
        const l = await inbox(admin);
        return l.items[0]?.ai ? l.items[0] : null;
      });
      assert.equal(item.status, 'new', 'AI must not move the intake forward on its own');
      assert.equal(item.case_id, null);
      assert.equal((await admin.get('/api/admin/cases')).body.total, 0, 'AI never converts to a case');
      const d = (await admin.get(`/api/admin/intakes/${item.id}`)).body;
      const o = d.ai.output;
      assert.equal(typeof o.title, 'string');
      assert.ok(o.title.length > 0);
      assert.equal(typeof o.summary, 'string');
      assert.ok(o.summary.length > 0);
      const areas = (await admin.get('/api/meta')).body.constants.LEGAL_AREAS.map((a) => a.code);
      assert.ok(areas.includes(o.legal_area), o.legal_area);
      assert.equal(o.legal_area, 'INH', 'an inheritance story should be classified as INH');
      assert.ok(Array.isArray(o.missing_info));
      assert.ok(o.similar && typeof o.similar.total === 'number' && Array.isArray(o.similar.items));
      assert.equal(d.intake.legal_area, null, 'the AI suggestion must not overwrite the staff-owned classification');
    } finally {
      await t.close();
    }
  });

  test('similar cases are retrieved from earlier files for staff (demo data)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201077712345', text: 'والدي توفى وساب شقة ومحل وأخويا الكبير رافض يقسم الميراث، وفيه قصر من ولاد أخويا المتوفى. عايزة أعرف نصيبي في التركة.' });
      const l = await inbox(admin, '?q=201077712345');
      assert.equal(l.total, 1);
      const it = l.items[0];
      const sug = await admin.post(`/api/admin/intakes/${it.id}/analyze`, {});
      assert.equal(sug.status, 200, JSON.stringify(sug.body));
      assert.equal(sug.body.output.legal_area, 'INH');
      assert.ok(sug.body.output.similar.total >= 1, 'similar cases should be found');
      for (const s of sug.body.output.similar.items) assert.match(s.code, /^[A-Z]{3}-\d{4}-\d{5}$/);
    } finally {
      await t.close();
    }
  });

  test('conversion records AI feedback: corrected legal area & accepted classification show up in /api/admin/ai/metrics', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201033300021', text: DESC });
      await sendWa(t, { from: '201033300022', text: 'والدتي توفيت وتركت أرضًا زراعية، ونريد معرفة نصيب كل وارث من الميراث وتقسيم التركة.' });
      const items = (await inbox(admin)).items;
      assert.equal(items.length, 2);
      const sugA = (await admin.post(`/api/admin/intakes/${items[0].id}/analyze`, {})).body;
      const sugB = (await admin.post(`/api/admin/intakes/${items[1].id}/analyze`, {})).body;
      const before = await metrics(admin);

      // staff disagree with the AI classification for A
      const wrongArea = sugA.output.legal_area === 'FAM' ? 'CIV' : 'FAM';
      const cA = await admin.post(`/api/admin/intakes/${items[0].id}/convert`, { legal_area: wrongArea, title: 'عنوان مختلف تمامًا عن المقترح' });
      assert.equal(cA.status, 201);
      // staff accept the AI classification and title for B
      const cB = await admin.post(`/api/admin/intakes/${items[1].id}/convert`, { legal_area: sugB.output.legal_area, title: sugB.output.title });
      assert.equal(cB.status, 201);

      const afterM = await metrics(admin);
      assert.equal(afterM.get('legal_area', 'corrected'), before.get('legal_area', 'corrected') + 1);
      assert.equal(afterM.get('legal_area', 'accepted'), before.get('legal_area', 'accepted') + 1);
      assert.ok(afterM.get('title', 'accepted') >= before.get('title', 'accepted') + 1);
      const corr = afterM.raw.recent_corrections.find((x) => x.field === 'legal_area' && x.case_code === cA.body.case.code);
      assert.ok(corr, 'the correction must be traceable to the case');
      assert.equal(corr.ai_value, sugA.output.legal_area);
      assert.equal(corr.final_value, wrongArea);
    } finally {
      await t.close();
    }
  });

  test('staff can record explicit AI feedback (e.g. missed missing-info) and handling internally records the classification verdict', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201033300031', text: DESC });
      const it = (await inbox(admin)).items[0];
      await admin.post(`/api/admin/intakes/${it.id}/analyze`, {});
      const before = await metrics(admin);
      const bad = await admin.post(`/api/admin/intakes/${it.id}/ai-feedback`, { field: 'summary', verdict: 'great' });
      assert.equal(bad.status, 400);
      const fb = await admin.post(`/api/admin/intakes/${it.id}/ai-feedback`, { field: 'missing_info', verdict: 'missed', final_value: 'صورة إعلام الوراثة', note: 'لم يطلبها التحليل' });
      assert.equal(fb.status, 200, JSON.stringify(fb.body));
      const h = await admin.post(`/api/admin/intakes/${it.id}/handle-internally`, { resolution_note: 'تم توجيه العميلة', legal_area: 'FAM' });
      assert.equal(h.status, 200);
      const afterM = await metrics(admin);
      assert.equal(afterM.get('missing_info', 'missed'), before.get('missing_info', 'missed') + 1);
      const laBefore = before.get('legal_area', 'corrected') + before.get('legal_area', 'accepted');
      const laAfter = afterM.get('legal_area', 'corrected') + afterM.get('legal_area', 'accepted');
      assert.equal(laAfter, laBefore + 1);
    } finally {
      await t.close();
    }
  });
});

describe('Outbound replies use the client\'s channel; WhatsApp is simulated without credentials', () => {
  test('website client => website reply (visible in portal); WhatsApp client => WhatsApp reply recorded as simulated', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await webIntake(t, { phone: '01022200011' });
      await sendWa(t, { from: '201022200022', text: 'عندي سؤال عن قضية نفقة.' });
      const admin = await t.login('admin');
      const items = (await inbox(admin)).items;
      const webItem = items.find((x) => x.code === web.reference);
      const waItem = items.find((x) => x.code !== web.reference);

      const r1 = await admin.post(`/api/admin/intakes/${webItem.id}/reply`, { body: 'استلمنا طلبكم وسنتواصل قريبًا.' });
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(r1.body.channel, 'website');
      assert.notEqual(r1.body.status, 'failed');
      const token = web.portal_url.split('/p/')[1];
      const portal = (await t.client().get(`/api/portal/${token}`)).body;
      assert.ok(portal.messages.some((m) => m.direction === 'out' && m.body === 'استلمنا طلبكم وسنتواصل قريبًا.'), 'website reply must be visible in the portal');

      const r2 = await admin.post(`/api/admin/intakes/${waItem.id}/reply`, { body: 'برجاء إرسال صورة حكم الطلاق.' });
      assert.equal(r2.status, 200);
      assert.equal(r2.body.channel, 'whatsapp');
      assert.equal(r2.body.status, 'simulated');
      assert.equal(r2.body.to_address, '+201022200022');

      const outbox = (await admin.get('/api/admin/outbox?status=simulated')).body;
      assert.ok(outbox.some((m) => m.id === r2.body.id));
      assert.ok(!outbox.some((m) => m.id === r1.body.id));
      const settings = (await admin.get('/api/admin/automations')).body;
      assert.equal(settings.whatsapp_configured, false);
    } finally {
      await t.close();
    }
  });

  // v9.1 b-site (B91-01): رسالة واتساب من نفس الرقم بلا رقم الطلب وكود التأكيد لا تثبت أن صاحب الرقم هو مقدّم الطلب؛
  // الرد يبقى في صفحة المتابعة حتى تؤكد الإدارة الهوية (أو ترسل المستفيدة الرسالة الجاهزة بالكود)، ثم يصل على واتساب
  test('a website client who switches to WhatsApp is answered on WhatsApp once the number is confirmed; staff may still force the website channel', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await webIntake(t, { phone: '01022200033' });
      await sendWa(t, { from: '201022200033', text: 'أنا كملت هنا على واتساب.' });
      const admin = await t.login('admin');
      const it = (await inbox(admin)).items[0];
      assert.equal(it.code, web.reference);
      const before = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'تمام، سنكمل هنا.' });
      assert.equal(before.body.channel, 'website');
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'x', channel: 'whatsapp' })).status, 400);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/confirm-identity`, {})).status, 200);
      const r = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'تمام، سنكمل هنا.' });
      assert.equal(r.body.channel, 'whatsapp');
      assert.equal(r.body.status, 'simulated');
      const forced = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'رابط البوابة للمستندات.', channel: 'website' });
      assert.equal(forced.status, 200);
      assert.equal(forced.body.channel, 'website');
      const bad = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'x', channel: 'telegram' });
      assert.equal(bad.status, 400);
      const empty = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: '   ' });
      assert.equal(empty.status, 400);
    } finally {
      await t.close();
    }
  });
});
