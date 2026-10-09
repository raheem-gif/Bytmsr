// v9.1 — إصلاحات الخلفية بعد مراجعة الرحلات والأمان: الاستيلاء على صفحة المتابعة برسالة التأكيد الجاهزة،
// الروابط في نص الرسائل، رسالة التأكيد كوقائع، طلبات الورق نصف المجابة، عنوان الجلسة التالية، ملاحظة اللقاء للمحامي،
// صوتها في محادثتها، مستندات الملف المستمر، الرد بعد التقديم، الكود الداخلي في البوابة، «تذكّرني»، حصة المكالمات،
// رابط إعادة التعيين من ترويسة Host، قالب portal_update، تنظيف نص الإدارة للمحامي، ومجهِّل المعرفة.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload, resetClock, freezeClock } from './helpers.js';
import { ok, uniquePhone, phoneCore, newCase, createLawyer, outbox, runAutomations, plusDays, notificationsOf } from './lane-b-kit.test.js';
import { withoutLinkLines, stripIdentityConfirm } from '../src/channels/engine.js';

afterEach(() => resetClock());

const desc = 'جوزي اتوفى من 4 شهور ومش عارفة أطلّع معاشه أنا والعيال، ومحدش راضي يقولي محتاجة ورق إيه.';
const waFrom = (local) => `20${local.slice(1)}`;
const codeOf = (confirmUrl) => /كود التأكيد (\d{6})/.exec(decodeURIComponent(confirmUrl.split('?text=')[1]))[1];
const confirmText = (confirmUrl) => decodeURIComponent(confirmUrl.split('?text=')[1]);
const tokenOf = (url) => String(url).split('/p/')[1];
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/** واتساب «حقيقي» بلا شبكة: يلتقط النصوص المرسلة فعلًا (dispatch) */
function stubWhatsApp(app) {
  const sent = [];
  app.whatsapp.sendText = async (to, body) => {
    sent.push({ type: 'text', to, body });
    return `wamid.T${sent.length}`;
  };
  app.whatsapp.sendButtons = async (to, body) => {
    sent.push({ type: 'buttons', to, body });
    return `wamid.T${sent.length}`;
  };
  app.whatsapp.sendTemplate = async (to, name, lang, params) => {
    sent.push({ type: 'template', to, name, params });
    return `wamid.T${sent.length}`;
  };
  app.whatsapp.markRead = async () => true;
  return sent;
}
const LIVE_WA = { token: 'EAAFAKE-test-token-123456', phoneNumberId: '123456789012345', verifyToken: 'verify-me', appSecret: 'test-secret', numberDigits: '201000000001' };

/** عميلة موثّقة على واتساب (رسالة خاصة منها أولًا) */
async function victim(t, phone = uniquePhone(), text = 'أنا سامية، عندي سؤال عن ميراث جوزي الله يرحمه') {
  t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(phone), name: 'سامية محمود عبد الحميد', text }));
  const clientId = t.app.db.value("SELECT client_id FROM client_identities WHERE kind = 'phone' AND value LIKE ?", `%${phoneCore(phone)}`);
  return { phone, clientId };
}

// ═════════════════════════ 1) الاستيلاء على صفحة المتابعة برسالة التأكيد الجاهزة (high) ═════════════════════════
describe('B91-01 confirmation code cannot hand a website link holder the phone owner\'s page', () => {
  test('attacker submits with her phone, she sends the prefilled text: the attacker link is revoked and sees nothing; the reply stores no link', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const v = await victim(t);
      // المهاجم يقدّم طلبًا من الموقع برقمها
      const submission = 'attackerSubmission0001';
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone: v.phone, consent: true, description: desc, submission_id: submission }), 201);
      const attacker = tokenOf(r.portal_url);
      assert.equal(ok(await t.client().get(`/api/portal/${attacker}`)).home.whatsapp_confirmed, false);
      // صاحبة الرقم ترسل الرسالة الجاهزة من واتساب
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(v.phone), text: confirmText(r.confirm_url) }));
      const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
      assert.equal(JSON.parse(intake.source_detail).identity_confirmed_via, 'whatsapp_ref');
      // رابط الموقع الذي صدر قبل التأكيد أُلغي
      assert.equal((await t.client().get(`/api/portal/${attacker}`)).status, 404);
      assert.equal((await t.client().post(`/api/portal/${attacker}/callback`, { when: 'any' })).status, 404);
      // إعادة الإرسال بنفس submission_id لا تُصدر رابطًا جديدًا لطلب تأكد رقمه
      const again = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone: v.phone, consent: true, description: desc, submission_id: submission }), 201);
      assert.equal(again.reference, r.reference);
      assert.equal(again.portal_url, null);
      assert.equal(again.confirm_url, null);
      // رد التأكيد: لا رابط في نص الرسالة ولا متغيراتها
      const reply = t.app.db.get("SELECT * FROM messages WHERE automation_rule = 'identity_confirm'");
      assert.ok(reply);
      assert.ok(!reply.body.includes('/p/'), reply.body);
      assert.ok(!reply.meta.includes('/p/'), reply.meta);
      assert.ok(reply.body.includes(r.reference));
      // رسائل واتساب الخاصة بعدها لا تصل أي رابط موقع
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(v.phone), text: 'رقمي القومي 28501011234567 وعنواني 5 شارع النصر' }));
      for (const row of t.app.db.all('SELECT body FROM messages')) assert.ok(!/\/p\/[A-Za-z0-9_-]{20,}/.test(row.body), row.body);
    } finally {
      await t.close();
    }
  });

  test('before confirmation her WhatsApp messages never join the website request (staff replies there would reach the link holder)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      // رقم جديد تمامًا: المهاجم يقدّم أولًا فيُنشأ عميل جديد من الموقع
      const phone = uniquePhone();
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone, consent: true, description: desc }), 201);
      const web = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(phone), text: 'السلام عليكم، رقمي القومي 28501011234567' }));
      const m = t.app.db.get("SELECT * FROM messages WHERE direction = 'in' AND channel = 'whatsapp' ORDER BY id DESC LIMIT 1");
      assert.notEqual(m.intake_id, web.id, 'the owner\'s message opened its own request');
      // ردّ الإدارة على طلب الموقع لا يحمل شيئًا من رسالتها، وحامل الرابط لا يرى رسالتها
      const portal = JSON.stringify(ok(await t.client().get(`/api/portal/${tokenOf(r.portal_url)}`)));
      assert.ok(!portal.includes('28501011234567'));
      void admin;
    } finally {
      await t.close();
    }
  });

  test('staff «تأكيد الهوية» keeps the website link website-only: WhatsApp messages and replies never show there', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const phone = uniquePhone();
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone, consent: true, description: desc }), 201);
      const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
      ok(await admin.post(`/api/admin/intakes/${intake.id}/confirm-identity`, {}));
      assert.equal(ok(await admin.post(`/api/admin/intakes/${intake.id}/reply`, { body: 'أهلًا، محتاجين شهادة الوفاة' })).channel, 'whatsapp');
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(phone), text: 'حاضر، رقمي القومي 28501011234567' }));
      const view = ok(await t.client().get(`/api/portal/${tokenOf(r.portal_url)}`));
      const s = JSON.stringify(view);
      assert.ok(!s.includes('محتاجين شهادة الوفاة'));
      assert.ok(!s.includes('28501011234567'));
      assert.ok(view.messages.every((m) => m.channel === 'website'));
    } finally {
      await t.close();
    }
  });

  test('live WhatsApp: the link is issued at dispatch (absolute, phone-scoped) and never stored; no PUBLIC_BASE_URL → no link line', async () => {
    for (const base of ['https://legal.example.org', '']) {
      const t = await startTestApp({ seed: 'none', config: { whatsapp: LIVE_WA, publicBaseUrl: base } });
      try {
        const sent = stubWhatsApp(t.app);
        const phone = uniquePhone();
        const r = ok(await t.client().post('/api/public/intake', { name: 'أم محمد عبد الله', phone, consent: true, description: desc }), 201);
        t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(phone), text: confirmText(r.confirm_url) }));
        await tick();
        const text = sent.find((x) => x.type === 'text' && x.body.includes('رقم طلبك'));
        assert.ok(text, JSON.stringify(sent));
        const row = t.app.db.get("SELECT * FROM messages WHERE automation_rule = 'identity_confirm'");
        assert.equal(row.status, 'sent');
        assert.ok(!row.body.includes('/p/') && !row.meta.includes('/p/'));
        if (base) {
          const m = /صفحة طلبك: (https:\/\/legal\.example\.org\/p\/([A-Za-z0-9_-]{20,}))/.exec(text.body);
          assert.ok(m, text.body);
          const page = ok(await t.client().get(`/api/portal/${m[2]}`));
          assert.ok(JSON.stringify(page).includes(r.reference));
        } else {
          assert.ok(!text.body.includes('/p/'), text.body);
          assert.ok(!text.body.includes('صفحة طلبك'), text.body);
          assert.ok(text.body.includes('رقم طلبك'));
        }
      } finally {
        await t.close();
      }
    }
  });

  test('withoutLinkLines drops the link and its label, keeping the sentence before it', () => {
    assert.equal(withoutLinkLines('أهلًا\nصفحة طلبك: {portal_link}\n— بيوت مصر'), 'أهلًا\n— بيوت مصر');
    assert.equal(withoutLinkLines('صوّري الورقة وابعتيها هنا على واتساب، أو من صفحتك: {portal_link}'), 'صوّري الورقة وابعتيها هنا على واتساب.');
    assert.equal(withoutLinkLines('أهلًا يا سامية، دي صفحة طلبك عند بيوت مصر. منها تعرفي كل جديد وتبعتي الورق: {portal_link}'), 'أهلًا يا سامية، دي صفحة طلبك عند بيوت مصر.');
  });

  test('health check: live WhatsApp without PUBLIC_BASE_URL is «danger» and says links will not be sent', async () => {
    const t = await startTestApp({ seed: 'none', config: { whatsapp: LIVE_WA, publicBaseUrl: '' } });
    try {
      stubWhatsApp(t.app);
      const admin = await t.login('admin');
      const check = ok(await admin.get('/api/admin/system/health')).checks.find((c) => c.key === 'base_url');
      assert.equal(check.level, 'danger');
      assert.match(check.detail, /بلا رابط صفحة المتابعة/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 2) رسالة التأكيد ليست وقائع الطلب ═════════════════════════
describe('The WhatsApp confirmation message is not case facts', () => {
  test('the REQ and the code are left out of the AI facts, summary and the inbox preview', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const phone = uniquePhone();
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone, consent: true, description: desc }), 201);
      const code = codeOf(r.confirm_url);
      t.app.engine.handleWhatsAppWebhook(waPayload({ from: waFrom(phone), text: confirmText(r.confirm_url) }));
      const intake = t.app.db.get('SELECT * FROM intakes WHERE code = ?', r.reference);
      const msg = t.app.db.get("SELECT * FROM messages WHERE intake_id = ? AND direction = 'in' AND channel = 'whatsapp'", intake.id);
      assert.equal(JSON.parse(msg.meta).identity_confirm, 'confirmed');
      const sug = await t.app.ai.analyzeIntake(intake.id);
      const out = JSON.stringify(sug.output || sug);
      assert.ok(!out.includes(code), out);
      assert.ok(!out.includes('رقم طلبي'), out);
      const list = ok(await admin.get('/api/admin/intakes')).items.find((i) => i.id === intake.id);
      assert.ok(!String(list.last_message || '').includes(code));
      assert.equal(stripIdentityConfirm(`السلام عليكم، ده رقم طلبي ${r.reference} وكود التأكيد ${code}`), '');
      assert.equal(stripIdentityConfirm(`ده رقم طلبي ${r.reference} وكود التأكيد ${code}. وكمان عايزة أسأل عن المعاش`), 'وكمان عايزة أسأل عن المعاش');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 3) طلب الورق نصف المجاب (لا يختفي الباقي بصمت) ═════════════════════════
describe('A partly answered document request keeps the missing item open for her', () => {
  test('sharing with an item still «needed» opens «لسه محتاجين: …» on her page; staff see the warning; request_rest:false skips it', async () => {
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const lw = await createLawyer(admin, { specialties: ['INH'] });
      const cL = await t.login(lw.username);
      const k = await newCase(admin, { clientName: 'سامية محمود', legal_area: 'INH', title: 'ميراث' });
      const a = ok(await admin.post(`/api/admin/cases/${k.id}/assignments`, { lawyer_id: lw.id, role: 'lead', grants: { facts: true } }), 201).assignment;
      const token = tokenOf(ok(await admin.post(`/api/admin/clients/${k.clientId}/portal-link`, {})).url);
      const make = async () => {
        const r = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', items: ['إعلام الوراثة', 'عقد الشقة أو إيصال الكهرباء'] }), 201);
        ok(await admin.post(`/api/admin/info-requests/${r.id}/approve`, { client_message: 'محتاجين صورة الورقتين دول.' }));
        const pdf = { filename: 'اعلام.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64') };
        ok(await t.client().post(`/api/portal/${token}/requests/${r.id}/reply`, { documents: [{ ...pdf, item: 0 }] }));
        return r;
      };
      const r = await make();
      const det = ok(await admin.get(`/api/admin/cases/${k.id}`));
      assert.deepEqual(det.info_requests.find((x) => x.id === r.id).items_needed, ['عقد الشقة أو إيصال الكهرباء']);
      const docs = t.app.db.all('SELECT id FROM documents WHERE info_request_id = ?', r.id).map((d) => d.id);
      const shared = ok(await admin.post(`/api/admin/info-requests/${r.id}/share`, { response_text: 'وصل إعلام الوراثة، والعقد لم يصل بعد.', document_ids: docs }));
      assert.ok(shared.follow_up_id);
      assert.deepEqual(shared.follow_up_items, ['عقد الشقة أو إيصال الكهرباء']);
      const v = ok(await t.client().get(`/api/portal/${token}`));
      const open = v.requests.find((x) => x.id === shared.follow_up_id);
      assert.ok(open, 'the missing item is still asked of her');
      assert.equal(open.message, 'لسه محتاجين: عقد الشقة أو إيصال الكهرباء');
      assert.deepEqual(open.items.map((i) => [i.label, i.status]), [['عقد الشقة أو إيصال الكهرباء', 'needed']]);
      assert.ok(v.home.next.some((n) => n.kind === 'request' && n.id === shared.follow_up_id));
      const lv = ok(await cL.get(`/api/lawyer/assignments/${a.id}`));
      assert.ok(lv.info_requests.some((x) => x.id === shared.follow_up_id && x.status === 'sent_to_client'), 'the lawyer sees it is being chased');
      // بلا طلب الباقي
      const r2 = await make();
      const s2 = ok(await admin.post(`/api/admin/info-requests/${r2.id}/share`, { response_text: 'يكفي ما وصل.', request_rest: false }));
      assert.equal(s2.follow_up_id, null);
      // طلب لم تجب عن أي بند منه وأجابت عنه الإدارة مباشرة: لا يُكرَّر عليها
      const r3 = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', items: ['قسيمة الزواج'] }), 201);
      ok(await admin.post(`/api/admin/info-requests/${r3.id}/approve`, { client_message: 'محتاجين قسيمة الزواج.' }));
      assert.deepEqual(ok(await admin.get(`/api/admin/cases/${k.id}`)).info_requests.find((x) => x.id === r3.id).items_needed, []);
      assert.equal(ok(await admin.post(`/api/admin/info-requests/${r3.id}/share`, { response_text: 'القسيمة عندنا في الملف.' })).follow_up_id, null);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 4) الجلسات: العنوان، ملاحظة اللقاء للمحامي، كلامها في محادثتها، التذكير بالقائمة ═════════════════════════
describe('Court hearings: neutral next title, meeting promise and attendance for the lawyer, her own words, reminder list', () => {
  test('end to end on one matter', async () => {
    const T0 = '2026-10-04T08:00:00.000Z';
    freezeClock(T0);
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const lw = await createLawyer(admin, { specialties: ['INH'] });
      const cL = await t.login(lw.username);
      const k = await newCase(admin, { clientName: 'أم يوسف محمود', legal_area: 'INH', title: 'فرز وتجنيب', docs: ['شهادة_الوفاة.pdf', 'اعلام_الوراثة.pdf'] });
      // F6: مستند أُتيح للمحامي في الاستشارة يظهر له في الملف المستمر
      const docId = k.docs[0].id;
      ok(await admin.post(`/api/admin/cases/${k.id}/assignments`, { lawyer_id: lw.id, role: 'lead', grants: { facts: true, document_ids: [docId] } }), 201);
      const m = ok(await admin.post(`/api/admin/cases/${k.id}/matter`, { kind: 'litigation', responsible_lawyer_id: lw.id, court: 'محكمة الأسرة' }), 201);
      let lv = ok(await cL.get(`/api/lawyer/matters/${m.id}`));
      assert.deepEqual(lv.documents.map((d) => d.id), [docId], 'only the document already granted to him');
      // الجلسة الأولى بملاحظة «هاتي معاكي» وسطر لقاء
      const ev = ok(
        await admin.post(`/api/admin/matters/${m.id}/events`, {
          kind: 'hearing',
          title: 'الجلسة الأولى — نظر دعوى الفرز والتجنيب',
          starts_at: plusDays(T0, 2),
          client_attendance_required: true,
          client_note: 'بطاقتك الشخصية\nشهادات ميلاد يوسف ومريم\nالمحامي هيقابلك عند باب المحكمة الساعة 8:30',
        }),
      );
      assert.ok((await notificationsOf(cL)).some((n) => n.type === 'event.meeting_promise' && n.body.includes('عند باب المحكمة الساعة 8:30')));
      lv = ok(await cL.get(`/api/lawyer/matters/${m.id}`));
      let row = lv.events.find((e) => e.id === ev.id);
      assert.equal(row.meeting_promise, 'وعدت الإدارة المستفيد/ة بلقائك: «المحامي هيقابلك عند باب المحكمة الساعة 8:30»');
      assert.equal(row.client_note, undefined, 'the note itself (children names) does not reach the lawyer');
      assert.ok(!JSON.stringify(lv).includes('مريم'));
      // تذكير قبلها: قائمة «هاتي معاكي» وسطر اللقاء
      await runAutomations(admin);
      const rem = (await outbox(admin)).filter((x) => x.automation_rule === 'hearing_reminder' && x.matter_id === m.id);
      assert.equal(rem.length, 1);
      assert.match(rem[0].body, /هاتي معاكي: بطاقتك الشخصية، شهادات ميلاد يوسف ومريم/);
      assert.match(rem[0].body, /المحامي هيقابلك عند باب المحكمة الساعة 8:30\n\u200f?— /); // v10 experience (intended, L-07): Latin signature lines start with RLM
      // ردها من صفحتها: كلامها هي في محادثتها، والمحامي يعرف الحضور
      const token = tokenOf(ok(await admin.post(`/api/admin/clients/${k.clientId}/portal-link`, {})).url);
      ok(await t.client().post(`/api/portal/${token}/events/${ev.id}/response`, { answer: 'yes' }));
      const p = ok(await t.client().get(`/api/portal/${token}`));
      const mine = p.messages.filter((x) => x.direction === 'in').pop();
      assert.match(mine.body, /^هحضر إن شاء الله — جلسة يوم /);
      assert.ok(!/المستفيدة/.test(mine.body));
      lv = ok(await cL.get(`/api/lawyer/matters/${m.id}`));
      row = lv.events.find((e) => e.id === ev.id);
      assert.equal(row.client_attendance, 'coming');
      assert.equal(row.client_attendance_label, 'أكّدت المستفيد/ة الحضور');
      assert.ok((await notificationsOf(cL)).some((n) => n.type === 'event.client_attendance'));
      const cal = ok(await cL.get(`/api/lawyer/calendar?from=${encodeURIComponent(plusDays(T0, -1))}&to=${encodeURIComponent(plusDays(T0, 5))}`));
      const item = (cal.items || cal).find((x) => x.event_id === ev.id);
      assert.ok(item && item.meeting_promise && item.client_attendance === 'coming', JSON.stringify(item));
      // F3: «تأجّلت» ← الجلسة التالية بعنوان محايد (لا «الجلسة الأولى» ثانية)
      freezeClock(plusDays(T0, 2.2));
      const day = new Date(Date.parse(plusDays(T0, 30))).toISOString().slice(0, 10);
      const out = ok(await cL.post(`/api/lawyer/matter-events/${ev.id}/outcome`, { result: 'adjourned', reason: 'documents', next_date: day, client_ref: 'fixbe-outcome-0001' }));
      assert.equal(out.next_event.title, 'جلسة — لتقديم مستندات');
      const ev2 = ok(await admin.post(`/api/admin/matters/${m.id}/events`, { kind: 'hearing', title: 'الجلسة الثانية', starts_at: plusDays(T0, 40) }));
      freezeClock(plusDays(T0, 40.2));
      const day2 = new Date(Date.parse(plusDays(T0, 60))).toISOString().slice(0, 10);
      assert.equal(ok(await cL.post(`/api/lawyer/matter-events/${ev2.id}/outcome`, { result: 'adjourned', next_date: day2, client_ref: 'fixbe-outcome-0002' })).next_event.title, 'الجلسة القادمة');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 5) رد بعد تقديم الرأي ═════════════════════════
describe('A reply that reaches the lawyer after he submitted', () => {
  test('«اليوم» keeps an informational row and the approve dialog data carries the warning', async () => {
    const t = await startTestApp({ seed: 'none', config: { sessionTtlHours: 24 * 365 } });
    try {
      const admin = await t.login('admin');
      const lw = await createLawyer(admin, { specialties: ['INH'] });
      const cL = await t.login(lw.username);
      const k = await newCase(admin, { clientName: 'سامية محمود', legal_area: 'INH', title: 'ميراث' });
      const a = ok(await admin.post(`/api/admin/cases/${k.id}/assignments`, { lawyer_id: lw.id, role: 'lead', grants: { facts: true } }), 201).assignment;
      const r = ok(await cL.post(`/api/lawyer/assignments/${a.id}/info-requests`, { kind: 'document', items: ['إعلام الوراثة'] }), 201);
      ok(await admin.post(`/api/admin/info-requests/${r.id}/approve`, { client_message: 'محتاجين إعلام الوراثة.' }));
      ok(await cL.post(`/api/lawyer/assignments/${a.id}/open`));
      const sub = ok(await cL.post(`/api/lawyer/assignments/${a.id}/submit`, { body: 'الرأي القانوني: بعد دراسة الوقائع المتاحة يتبين أن للعميل الحق في المطالبة بنصيبه الشرعي.' }));
      await tick(15);
      ok(await admin.post(`/api/admin/info-requests/${r.id}/share`, { response_text: 'وصل إعلام الوراثة.' }));
      const today = ok(await cL.get('/api/lawyer/today'));
      assert.ok(today.actions.some((x) => x.kind === 'info_shared' && x.assignment_id === a.id && x.after_submit === true), JSON.stringify(today.actions));
      const op = ok(await admin.get(`/api/admin/cases/${k.id}`)).opinions.find((o) => o.id === sub.id);
      assert.deepEqual(op.replies_after_submit.map((x) => x.id), [r.id]);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 6) البوابة: لا أكواد داخلية، وحصة المكالمات لكل رابط ═════════════════════════
describe('Portal hygiene: no internal codes in the JSON; callback quota per link scope', () => {
  test('cases[] carries the REQ number, never INH-/CL- codes', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const k = await newCase(admin, { clientName: 'سامية محمود', legal_area: 'INH', title: 'ميراث' });
      const token = tokenOf(ok(await admin.post(`/api/admin/clients/${k.clientId}/portal-link`, {})).url);
      const v = ok(await t.client().get(`/api/portal/${token}`));
      const s = JSON.stringify(v);
      assert.doesNotMatch(s, /\b(?:CL|INH|FAM|GRD|PEN|PRP|CIV|LAB|CRM|COM|TAX|ADM|GEN|MTR)-\d/);
      assert.match(v.cases[0].ref, /^REQ-\d{4}-\d{5}$/);
    } finally {
      await t.close();
    }
  });

  test('an unverified website submission with her number cannot use up her own daily callbacks', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const v = await victim(t);
      const r = ok(await t.client().post('/api/public/intake', { name: 'سامية', phone: v.phone, consent: true, description: desc }), 201);
      const attacker = tokenOf(r.portal_url);
      ok(await t.client().post(`/api/portal/${attacker}/callback`, { when: 'any' }));
      ok(await t.client().post(`/api/portal/${attacker}/callback`, { when: 'any' }));
      assert.equal((await t.client().post(`/api/portal/${attacker}/callback`, { when: 'any' })).status, 429);
      const own = tokenOf(ok(await admin.post(`/api/admin/clients/${v.clientId}/portal-link`, {})).url);
      ok(await t.client().post(`/api/portal/${own}/callback`, { when: 'morning' }));
      // رسالتها بكلامها هي، لا «طلبت المستفيدة مكالمة»
      const last = t.app.db.get("SELECT body FROM messages WHERE direction = 'in' AND json_extract(meta, '$.callback') IS NOT NULL ORDER BY id DESC LIMIT 1");
      assert.equal(last.body, 'عايزة حد يكلمني — الصبح');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 7) نص الإدارة للمستفيدة كما يراه المحامي ═════════════════════════
describe('«مطلوب بالفعل» shows the lawyer no portal link, kunya or address', () => {
  test('relative /p/ link, wa.me, kunya and street address are stripped; item requests show items only', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const lw = await createLawyer(admin, { specialties: ['INH'] });
      const cL = await t.login(lw.username);
      const k = await newCase(admin, { clientName: 'سامية محمود عبد الحميد', legal_area: 'INH', title: 'ميراث' });
      const a = ok(await admin.post(`/api/admin/cases/${k.id}/assignments`, { lawyer_id: lw.id, role: 'lead', grants: { facts: true } }), 201).assignment;
      const link = ok(await admin.post(`/api/admin/clients/${k.clientId}/portal-link`, {})).url;
      const msg = `أهلًا يا أم محمد، ابعتي من صفحتك ${link} أو على wa.me/201000000001 وعنوانك 12 ش التحرير بالدقي`;
      ok(await admin.post(`/api/admin/cases/${k.id}/info-requests`, { kind: 'information', question: 'هل في عقد قسمة؟', client_message: `${msg} — هل عندك عقد قسمة؟` }));
      ok(await admin.post(`/api/admin/cases/${k.id}/info-requests`, { kind: 'document', question: 'البطاقة', client_message: msg, items: 'بطاقة أم محمد\nعقد الشقة' }));
      const v = ok(await cL.get(`/api/lawyer/assignments/${a.id}`));
      const s = JSON.stringify(v.case_open_requests);
      assert.ok(v.case_open_requests.length === 2, s);
      for (const bad of [tokenOf(link), '/p/', 'wa.me', 'أم محمد', 'التحرير', 'سامية']) assert.ok(!s.includes(bad), `${bad} leaked: ${s}`);
      assert.match(s, /عقد قسمة/);
      const docReq = v.case_open_requests.find((x) => x.kind === 'document');
      assert.equal(docReq.client_message, docReq.items.join('، '), 'item requests show the items only');
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 8) مجهِّل المعرفة: أسماء الأبناء، وعدم ابتلاع «المعاش.» ═════════════════════════
describe('Knowledge anonymiser', () => {
  test('children names from the facts are redacted everywhere; «المعاش. مرفق» is not an address', async () => {
    const { redact, familyNames } = await import('../src/ai/redact.js');
    const facts = 'طفلان قاصران (يوسف ومريم) وسؤال عن خطوات صرف المعاش. مرفق صورة شهادة الوفاة.';
    const names = familyNames(facts);
    assert.deepEqual(names.sort(), ['مريم', 'يوسف']);
    const out = redact(`${facts} القسمة بين يوسف ومريم: يوسف ياخد الضعف ومريم تاخد النص`, { names }).text;
    assert.ok(!/يوسف|مريم/.test(out), out);
    assert.match(out, /صرف المعاش\. مرفق صورة شهادة الوفاة/);
    assert.match(redact('وعنوانك 12 ش التحرير بالدقي').text, /\[عنوان\]/);
    assert.ok(!redact('في الشارع الرئيسي').text.includes('[عنوان]'));
  });
});

// ═════════════════════════ 9) «تذكّرني» تحت سياسة الإدارة ═════════════════════════
describe('Remember-me follows the admin session policy', () => {
  test('tightened session policy caps it; an explicit admin choice enables or disables it', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const lw = await createLawyer(admin);
      const login = async () => {
        const c = t.client();
        const r = await c.post('/api/auth/login', { username: lw.username, password: 'Lawyer@2026', remember: true });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return Number(/Max-Age=(\d+)/.exec(r.headers.get('set-cookie'))[1]);
      };
      assert.equal(await login(), 7 * 24 * 3600, 'default L-17 behaviour');
      ok(await admin.patch('/api/admin/settings', { session_max_hours: 8, session_idle_hours: 1 }));
      assert.equal(await login(), 8 * 3600, 'a tightened policy is not silently overridden');
      const pol = ok(await admin.get('/api/admin/security/policy'));
      assert.equal(pol.lawyer_remember, 'off');
      assert.equal(pol.lawyer_remember_capped, true);
      ok(await admin.patch('/api/admin/security/policy', { lawyer_remember: 'all', lawyer_remember_days: 2 }));
      assert.equal(await login(), 2 * 24 * 3600, 'explicit admin choice');
      ok(await admin.patch('/api/admin/security/policy', { lawyer_remember: 'with_2fa' }));
      assert.equal(await login(), 8 * 3600, 'no 2FA → normal session');
      const ev = t.app.db.get("SELECT severity, summary FROM security_events WHERE type = 'security.policy_updated' ORDER BY id DESC LIMIT 1");
      assert.match(ev.summary, /تذكّرني/);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 10) رابط إعادة التعيين ليس من ترويسة Host ═════════════════════════
describe('Self-service reset never builds links from the Host header', () => {
  async function setup(config, prepare = () => {}) {
    const t = await startTestApp({ seed: 'none', config });
    try {
      t.app.config.demo = true;
      prepare(t);
      const admin = await t.login('admin');
      const lw = await createLawyer(admin);
      const c = await t.login(lw.username);
      ok(await c.patch('/api/account', { alert_whatsapp: true, phone: '01201234567' }));
      return { t, admin, lw };
    } catch (e) {
      await t.close();
      throw e;
    }
  }
  const reset = (t, username, host) => fetch(`${t.base}/api/auth/reset-request`, { method: 'POST', headers: { 'content-type': 'application/json', host }, body: JSON.stringify({ username }) });

  test('demo without PUBLIC_BASE_URL: nothing is sent and no reset token is issued', async () => {
    const { t, lw } = await setup({});
    try {
      await reset(t, lw.username, 'evil-attacker.example');
      await tick(40);
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM account_tokens WHERE user_id = ? AND kind = 'reset'", lw.id)), 0);
    } finally {
      await t.close();
    }
  });

  test('with PUBLIC_BASE_URL the link uses it, and an admin-issued link is not revoked by a self-service request', async () => {
    let sent = [];
    const { t, admin, lw } = await setup({ whatsapp: LIVE_WA, publicBaseUrl: 'https://legal.example.org' }, (tt) => {
      sent = stubWhatsApp(tt.app);
      tt.app.messaging.mappings = () => [{ purpose: 'lawyer_alert', state: 'ok' }];
      tt.app.messaging.templatePlan = (msg, meta, vars) => ({ name: 'lawyer_alert', language: 'ar', params: [vars.body || msg.body], buttons: [] });
    });
    try {
      await reset(t, lw.username, 'evil-attacker.example');
      await tick(60);
      const text = sent.map((x) => JSON.stringify(x)).join('\n');
      assert.ok(!text.includes('evil-attacker'), text);
      assert.match(text, /https:\/\/legal\.example\.org\/app#\/reset\//);
      // رابط من الإدارة ساري ← الطلب الذاتي لا يلغيه
      ok(await admin.post(`/api/admin/accounts/${lw.id}/reset-link`, {}));
      const adminTok = t.app.db.get("SELECT id FROM account_tokens WHERE user_id = ? AND kind = 'reset' ORDER BY id DESC LIMIT 1", lw.id);
      await reset(t, lw.username, 'legal.example.org');
      await tick(60);
      const row = t.app.db.get('SELECT revoked_at FROM account_tokens WHERE id = ?', adminTok.id);
      assert.equal(row.revoked_at, null);
    } finally {
      await t.close();
    }
  });
});

// ═════════════════════════ 11) قالب portal_update محايد ═════════════════════════
describe('Seeded Meta template portal_update', () => {
  test('body is gender-neutral (no «افتحي»)', async () => {
    const { PORTAL_UPDATE_TEMPLATE_BODY } = await import('../src/seed-v91-b-site.js');
    assert.ok(!/افتحي|افتح\{ي\}/.test(PORTAL_UPDATE_TEMPLATE_BODY));
    assert.equal(PORTAL_UPDATE_TEMPLATE_BODY, 'أهلًا يا {{1}}، في جديد في طلبك عند {{2}}.\nصفحة طلبك: {{3}}');
  });
});
