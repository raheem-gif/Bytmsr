// v12 integration gate — server fixer: the tree answers reach the staff (JR-01), the tree's urgent flag reaches triage
// (JR-02), the client's cleaned documents reach the matter folder (JR-03), a paid brief never says «المستفيدة» (JR-05),
// the company portal's contracting party is the firm (V-01), «الصفحة الأولى» saves log only changed keys (JR-12), the start
// banner and account messages name the firm (JR-16, V-28), archived web voice and STT seconds (SEC-2), the WhatsApp lines
// menu ignores stale taps (SEC-5), a lawyer's download name is redacted (SEC-8), versioned static assets go out compressed
// (R-03), the wa_choice_privacy warning (R-04), and the tag registry (TA-01, TA-04, TA-08, TA-09).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { staffLines } from '../public/assets/js/public/topics.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ok = (r, status = 200) => {
  assert.equal(r.status, status, JSON.stringify(r.body).slice(0, 400));
  return r.body;
};
const CHARITY_RE = /بيوت مصر|الأرامل|الأيتام/;
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);

/** عميل بوابة الشركات (كعكة bm_csid) */
function companyClient(base) {
  let cookie = '';
  const req = async (method, url, body) => {
    const h = {};
    if (cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(base + url, { method, headers: h, body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body), redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    const m = set && /bm_csid=([^;]*)/.exec(set);
    if (m) cookie = m[1] ? `bm_csid=${m[1]}` : '';
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  };
  return { get: (u) => req('GET', u), post: (u, b) => req('POST', u, b) };
}

let seq = 0;
const phone = () => `0101${String(4400000 + ++seq).padStart(7, '0')}`;

describe('v12 gate — server fixer (demo seed)', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
  });
  after(async () => {
    await t?.close();
  });
  const post = (body) => t.client().post('/api/public/intake', { consent: true, description: 'وصلني إعلان ومحتاج حد يساعدني في الموضوع ده', ...body });
  const row = (ref) => t.app.db.get('SELECT * FROM intakes WHERE code = ?', ref);
  const detail = async (id) => ok(await admin.get(`/api/admin/intakes/${id}`));
  const formOfDetail = (d) => d.form || d.intake?.form || null;

  test('JR-01: tree answers (case.next, judgment.when, alimony.for, «لا يوجد» أبناء) reach the request card, the inbox row and the analysis context', async () => {
    const cases = [
      ['litigation/defend/family', { 'case.next': 'soon' }, ['أقرب جلسة أو موعد: خلال 14 يومًا']],
      ['litigation/judgment/civil', { 'judgment.when': 'mid' }, ['تاريخ صدور الحكم: من 15 إلى 40 يومًا']],
      ['consultation/family/alimony', { 'alimony.for': 'both', children: 'none' }, ['النفقة مطلوبة لـ: الزوجة والأبناء', 'عدد الأبناء أقل من 18 سنة: لا يوجد']],
      ['consultation/property/new-rent', { 'rent.side': 'tenant' }, ['صفة مقدّم الطلب: المستأجر']],
      ['litigation/paper', { 'case.next': 'unknown' }, ['أقرب جلسة أو موعد: لا يعرف']],
    ];
    for (const [pathway, answers, want] of cases) {
      const r = await post({ phone: phone(), pathway, answers, entry: 'tree' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const i = row(r.body.reference);
      const d = await detail(i.id);
      const lines = formOfDetail(d)?.lines || [];
      for (const w of want) assert.ok(lines.includes(w), `${pathway}: ${w} in ${JSON.stringify(lines)}`);
      assert.equal(new Set(lines).size, lines.length, 'no duplicate line');
      const inbox = ok(await admin.get('/api/admin/intakes?view=all&q=' + encodeURIComponent(i.code)));
      const it = (inbox.items || []).find((x) => x.id === i.id);
      if (it?.form) for (const w of want) assert.ok(it.form.lines.includes(w), `inbox ${w}`);
      const ctx = t.app.stories.storyText(i.id).contextText;
      for (const w of want) assert.ok(ctx.includes(w), `analysis context: ${w}`);
    }
    // the topic line and the topic answers stay as they were (consultation leaf with a topics.js question)
    const inh = await post({ phone: phone(), pathway: 'consultation/family/inheritance', answers: { 'inh.deceased': 'parent' }, entry: 'tree' });
    const il = formOfDetail(await detail(row(inh.body.reference).id)).lines;
    assert.ok(il.includes('المتوفى: أحد الوالدين'), JSON.stringify(il));
    assert.equal(il.filter((x) => x.startsWith('المتوفى')).length, 1);
    // a staff path edit keeps the client's answer visible (the question is rendered with the first leaf that asks it)
    const moved = await post({ phone: phone(), pathway: 'litigation/defend/labour', answers: { 'case.next': 'later' }, entry: 'tree' });
    const mi = row(moved.body.reference);
    t.app.db.run("UPDATE intakes SET pathway = 'consultation/work/wages', pathway_source = 'staff' WHERE id = ?", mi.id);
    assert.ok(formOfDetail(await detail(mi.id)).lines.includes('أقرب جلسة أو موعد: بعد أكثر من 14 يومًا'));
  });

  test('JR-01: a charity web form (no tree) keeps its 11.0 lines and context byte for byte', async () => {
    const r = await post({ phone: phone(), segment: 'charity', topic: 'rent', answers: { 'rent.home': 'rented_old', 'rent.evict': 'yes' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const i = row(r.body.reference);
    const form = t.app.stories.formOf(i);
    assert.deepEqual(form.lines, staffLines(JSON.parse(i.form_answers)), 'charity lines = topics.js staffLines as in 11.0');
    assert.ok(form.lines.length >= 2, JSON.stringify(form.lines));
    assert.ok(!form.lines.some((x) => /أقرب جلسة|لا يعرف/.test(x)), JSON.stringify(form.lines));
    assert.equal(i.priority, 'normal', 'the tree urgency rule does not touch charity requests');
  });

  test('JR-02: an urgent tree answer → priority «عالية» at once, an activity line, the analysis keeps it, the urgent notice fires once', async () => {
    const quiet = { description: 'عندي ورقة من المحكمة ومش فاهم المطلوب' };
    const cases = [
      ['litigation/paper', { 'case.next': 'unknown' }],
      ['litigation/judgment/civil', { 'judgment.when': 'mid' }],
      ['litigation/defend/family', { 'case.next': 'soon' }],
    ];
    for (const [pathway, answers] of cases) {
      const r = await post({ phone: phone(), pathway, answers, entry: 'tree', ...quiet });
      assert.equal(r.status, 201);
      assert.equal(r.body.urgent, true);
      const i = row(r.body.reference);
      assert.equal(i.priority, 'high', pathway);
      assert.ok(t.app.db.get("SELECT 1 FROM activity WHERE intake_id = ? AND type = 'intake.urgent_hint'", i.id), 'activity line');
      t.app.ai.cancelTimers?.(i.id);
      t.app.db.run("UPDATE intakes SET story_state = 'ready' WHERE id = ?", i.id);
      await t.app.ai.analyzeIntake(i.id, null, { auto: true });
      const sug = t.app.ai.latest('intake', i.id, 'intake_analysis');
      assert.ok(['high', 'urgent'].includes(sug.output.urgency), `${pathway}: ${sug.output.urgency}`);
      const act = t.app.db.get("SELECT summary FROM activity WHERE intake_id = ? AND type = 'ai.analyzed' ORDER BY id DESC LIMIT 1", i.id);
      assert.match(act.summary, /أولوية (عالية|عاجلة)/);
      const after = t.app.db.get('SELECT priority, notices_sent FROM intakes WHERE id = ?', i.id);
      assert.equal(after.priority, 'high');
      assert.ok(JSON.parse(after.notices_sent || '[]').includes('urgent_ready'), `urgent notice: ${after.notices_sent}`);
      const d = await detail(i.id);
      assert.equal(formOfDetail(d).urgent_hint, true);
    }
    // not urgent → normal
    const n = await post({ phone: phone(), pathway: 'litigation/defend/family', answers: { 'case.next': 'later' }, entry: 'tree', ...quiet });
    assert.equal(row(n.body.reference).priority, 'normal');
    // the inbox row carries the priority the badge reads
    const ui = read('public/assets/js/app/pages/admin/inbox.js');
    assert.match(ui, /\['high', 'urgent'\]\.includes\(it\.priority\)/);
  });

  test('JR-03 + JR-05: conversion → the matter folder lists the client\'s cleaned documents for staff; the lawyer sees them only once shared or granted; the brief says «لصاحب الطلب»', async () => {
    const r = await post({
      phone: phone(),
      pathway: 'litigation/defend/family',
      answers: { 'case.next': 'soon' },
      entry: 'tree',
      description: 'وصلني إعلان بدعوى نفقة من طليقتي والجلسة بعد أسبوعين في محكمة الأسرة',
      documents: [{ filename: 'court-paper.jpg', mime: 'image/jpeg', data_base64: JPEG_1PX.toString('base64') }],
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const i = row(r.body.reference);
    t.app.ai.cancelTimers?.(i.id);
    t.app.db.run("UPDATE intakes SET story_state = 'ready' WHERE id = ?", i.id);
    await t.app.ai.analyzeIntake(i.id, null, { auto: true });
    const pr = ok(await admin.get(`/api/admin/intakes/${i.id}/proposal`));
    for (const k of ['consultation', 'matter']) {
      const brief = pr.drafts[k]?.case?.brief_draft || '';
      assert.ok(!/المستفيد/.test(brief), `${k} brief: ${brief}`);
    }
    const ahmed = t.app.db.get("SELECT id FROM users WHERE username = 'ahmed'");
    const acc = ok(
      await admin.post(`/api/admin/intakes/${i.id}/accept`, {
        track: 'matter',
        story_rev: pr.story.rev,
        case: pr.drafts.matter.case,
        matter: { ...(pr.drafts.matter.matter || { kind: 'litigation' }), kind: 'litigation', responsible_lawyer_id: ahmed.id, notes: pr.drafts.matter.case.brief_draft },
      }),
    );
    const mid = acc.matter.id;
    const m = ok(await admin.get(`/api/admin/matters/${mid}`));
    assert.ok(!/المستفيد/.test(m.matter.notes || ''), m.matter.notes);
    const docs = m.case_documents || [];
    assert.equal(docs.length, 1, JSON.stringify(docs));
    assert.equal(docs[0].filename, 'court-paper.jpg');
    assert.equal(docs[0].shared_with_matter, false);
    const lawyer = await t.login('ahmed');
    const lv = ok(await lawyer.get(`/api/lawyer/matters/${mid}`));
    assert.equal((lv.documents || []).length, 0, 'not shared yet: the lawyer sees nothing');
    assert.ok([403, 404].includes((await lawyer.get(`/api/documents/${docs[0].id}/download`)).status));
    // «إتاحة للمحامي المسؤول» → it moves into the folder the lawyer sees
    ok(await admin.patch(`/api/admin/documents/${docs[0].id}`, { matter_id: mid }));
    const m2 = ok(await admin.get(`/api/admin/matters/${mid}`));
    assert.equal(m2.case_documents.length, 0);
    assert.equal(m2.documents.length, 1);
    const lv2 = ok(await lawyer.get(`/api/lawyer/matters/${mid}`));
    assert.deepEqual(lv2.documents.map((x) => x.id), [docs[0].id]);
    assert.ok(!JSON.stringify(lv2).includes(i.contact_phone.slice(-8)), 'no client phone to the lawyer');
    // a document granted on the case assignment shows on the lawyer's matter page too (same grant rule)
    ok(await admin.patch(`/api/admin/documents/${docs[0].id}`, { matter_id: null }));
    const caseId = m.matter.case_id;
    const now = new Date().toISOString();
    const asg = t.app.db.insert('assignments', { case_id: caseId, lawyer_id: ahmed.id, role: 'lead', status: 'assigned', assigned_at: now });
    t.app.db.run("INSERT INTO assignment_grants (assignment_id, resource, resource_id, granted_at) VALUES (?, 'document', ?, ?)", asg, docs[0].id, now);
    const lv3 = ok(await lawyer.get(`/api/lawyer/matters/${mid}`));
    assert.deepEqual(lv3.documents.map((x) => x.id), [docs[0].id]);
    const m3 = ok(await admin.get(`/api/admin/matters/${mid}`));
    assert.equal(m3.case_documents[0].lawyer_granted, true);
    // the staff page renders the new card from case_documents
    const ui = read('public/assets/js/app/pages/admin/matter-detail.js');
    assert.match(ui, /d\.case_documents/);
    assert.match(ui, /مستندات من الطلب والاستشارة/);
  });

  test('JR-05: the paid fallback brief and the analyzer brief say «لصاحب الطلب»; a charity brief keeps «للمستفيدة»', async () => {
    const src = read('src/services/stories.js');
    assert.match(src, /tone === 'charity' \? 'للمستفيدة' : 'لصاحب الطلب'/);
    const charity = await post({ phone: phone(), segment: 'charity', description: 'جوزي مات ورافعين علينا قضية والجلسة الشهر الجاي في محكمة الأسرة' });
    const ci = row(charity.body.reference);
    t.app.ai.cancelTimers?.(ci.id);
    t.app.db.run("UPDATE intakes SET story_state = 'ready' WHERE id = ?", ci.id);
    await t.app.ai.analyzeIntake(ci.id, null, { auto: true });
    const sug = t.app.ai.latest('intake', ci.id, 'intake_analysis');
    const b = sug.output.request_draft?.brief_for_lawyer;
    if (b) assert.match(b, /للمستفيدة/, 'charity analysis unchanged');
  });

  test('V-01: the company portal names the firm as the contracting party, never the charity foundation', async () => {
    const co = companyClient(t.base);
    ok(await co.post('/api/company/auth/login', { email: 'mariam@nilefoods.example', password: 'Company@2026' }));
    const plan = ok(await co.get('/api/company/plan'));
    assert.equal(plan.contracting_entity.legal_name, String(t.app.settings.get('firm_legal_name') || '').trim() || t.app.brand.displayName());
    assert.equal(plan.contracting_entity.registration, '');
    const firmBefore = t.app.settings.get('firm_legal_name');
    for (const p of ['/api/company/plan', '/api/company/company', '/api/company/meta', '/api/company/overview']) {
      const res = await co.get(p);
      if (res.status !== 200) continue;
      assert.doesNotMatch(JSON.stringify(res.body), CHARITY_RE, p);
    }
    ok(await admin.patch('/api/admin/settings', { firm_legal_name: 'إمام وشركاه', firm_registration: 'سجل تجاري رقم 12345 القاهرة' }));
    const plan2 = ok(await co.get('/api/company/plan'));
    assert.deepEqual(plan2.contracting_entity, { legal_name: 'إمام وشركاه', registration: 'سجل تجاري رقم 12345 القاهرة' });
    assert.equal((await admin.patch('/api/admin/settings', { firm_registration: 'https://example.com' })).status, 400);
    const health = ok(await admin.get('/api/admin/system/health'));
    const checks = health.checks || health.readiness?.checks || [];
    assert.ok(!checks.some((c) => c.key === 'contracting_entity'), 'set → no warning');
    ok(await admin.patch('/api/admin/settings', { firm_legal_name: '', firm_registration: '' }));
    assert.equal(ok(await co.get('/api/company/plan')).contracting_entity.legal_name, t.app.brand.displayName(), 'no legal name → the brand');
    assert.ok((ok(await admin.get('/api/admin/system/health')).checks || []).some((c) => c.key === 'contracting_entity'), 'empty → warning');
    ok(await admin.patch('/api/admin/settings', { firm_legal_name: firmBefore || '' }));
    assert.ok(!read('src/services/companies.js').match(/function contractingEntity\(\) \{[\s\S]{0,400}org_legal_name/), 'never org_legal_name');
  });

  test('JR-12: a save that changes one key logs that key only; a save that changes nothing writes no «تعديل الإعدادات» row', async () => {
    const count = () => Number(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE type = 'settings.updated'"));
    const s = t.app.settings;
    const same = { org_phone_paid: s.get('org_phone_paid') || '', firm_legal_name: s.get('firm_legal_name') || '', firm_city: s.get('firm_city') || '', firm_founded: s.get('firm_founded') || '', firm_partners: s.get('firm_partners') || [] };
    const before = count();
    ok(await admin.patch('/api/admin/settings', same));
    assert.equal(count(), before, 'nothing changed → no row');
    ok(await admin.patch('/api/admin/settings', { ...same, charity_public: !s.get('charity_public') }));
    const ev = t.app.db.get("SELECT summary FROM security_events WHERE type = 'settings.updated' ORDER BY id DESC LIMIT 1");
    assert.equal(ev.summary, 'تم تعديل الإعدادات: charity_public');
    ok(await admin.patch('/api/admin/settings', { ...same, charity_public: false }));
  });

  test('JR-16 + V-28: the start banner and the account messages name the firm, not the charity platform', async () => {
    const banner = read('server.js');
    assert.doesNotMatch(banner, /بيوت مصر/);
    assert.match(banner, /منصة المكتب/);
    const src = read('src/services/accounts.js');
    assert.doesNotMatch(src, /منصة الدعم القانوني|برنامج الدعم القانوني/);
    const lawyerId = t.app.db.value("SELECT id FROM users WHERE username = 'hany'");
    const r = await admin.post(`/api/admin/users/${lawyerId}/reset-link`, {});
    const msg = r.status === 200 ? r.body.message || '' : '';
    if (msg) {
      assert.doesNotMatch(msg, CHARITY_RE);
      assert.doesNotMatch(msg, /منصة الدعم القانوني/);
    }
    for (const f of ['src/routes/lawyer-home.js', 'src/services/lawyer-alerts.js']) assert.doesNotMatch(read(f), /منصة الدعم القانوني/, f);
  });
});

// ═════════════ lows and mediums without the demo seed ═════════════
const LIVE = { whatsapp: { token: 'test-token-123456789012345', phoneNumberId: 'PN123', wabaId: 'WABA9', verifyToken: 'verify-me', appSecret: '', numberDigits: '201000000001' } };

describe('v12 gate — server fixer (no seed)', () => {
  test('SEC-5: a stale line button after a row was chosen changes nothing; a typed digit is read only against the list actually sent for the current line', async () => {
    const { waPayload } = await import('./helpers.js');
    const t = await startTestApp({ seed: 'none', config: { ...LIVE, publicBaseUrl: 'https://emam.example' } });
    try {
      const admin0 = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      t.app.integrations.set('whatsapp', { paid_phone_number_id: 'PAIDID', paid_number: '201000000002' }, admin0);
      t.app.segments.markPaidVerified('PAIDID', '201000000002');
      t.app.settings.set('wa_lines_menu_enabled', true);
      const send = (from, extra) => {
        const p = waPayload({ from, ...extra });
        p.entry[0].changes[0].value.metadata.phone_number_id = 'PAIDID';
        return t.app.engine.handleWhatsAppWebhook(p);
      };
      const tap = (from, id, list = false) => send(from, { type: 'interactive', extra: { interactive: list ? { type: 'list_reply', list_reply: { id, title: 'x' } } : { type: 'button_reply', button_reply: { id, title: 'x' } } } });
      const row = (id) => t.app.db.get('SELECT pathway, pathway_source FROM intakes WHERE id = ?', id);
      // (1) خط ← صف ← زر خط قديم: لا يتغير المسار
      await send('201012340091', { text: 'مرحبا' });
      const i = t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');
      await tap('201012340091', 'line:litigation');
      await tap('201012340091', 'path:litigation/defend', true);
      assert.equal(row(i.id).pathway, 'litigation/defend');
      await tap('201012340091', 'line:consultation');
      assert.equal(row(i.id).pathway, 'litigation/defend', 'stale line button ignored');
      await send('201012340091', { text: '2' });
      assert.equal(row(i.id).pathway, 'litigation/defend', 'a typed digit does not move a chosen row');
      const list = t.app.db.get("SELECT meta FROM messages WHERE intake_id = ? AND automation_rule = 'lines_list'", i.id);
      assert.equal(JSON.parse(list.meta).lines_line, 'litigation', 'the list message carries its line');
      // (2) خط ← تغيير الخط بزر قديم قبل الصف ← رقم مكتوب: قائمة الاستشارة لم تُرسل، فلا يُقرأ الرقم صفًّا
      await send('201012340092', { text: 'مرحبا' });
      const j = t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');
      await tap('201012340092', 'line:litigation');
      await tap('201012340092', 'line:consultation');
      assert.equal(row(j.id).pathway, 'consultation');
      await send('201012340092', { text: '2' });
      assert.equal(row(j.id).pathway, 'consultation', 'digit not read against a list never sent');
      // (3) المسار العادي ما زال يعمل: خط ← رقم مكتوب من قائمته
      await send('201012340093', { text: 'مرحبا' });
      const k = t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');
      await tap('201012340093', 'line:litigation');
      await send('201012340093', { text: '2' });
      assert.equal(row(k.id).pathway, 'litigation/defend', 'typed row from the list that was sent');
    } finally {
      await t.close();
    }
  });

  test('SEC-2: archived web voice — website audio is stored but never auto-transcribed; claimed seconds never raise the STT estimate; billing uses the provider duration', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      assert.equal(t.app.settings.get('web_voice_enabled'), false);
      // التقدير: ثانية مُعلنة لا تتجاوز ما في الملف
      const small = Buffer.alloc(1200, 1);
      assert.equal(t.app.stt.estimateSeconds({ mime: 'audio/ogg', buffer: small, seconds: 600 }), 0.6, 'claimed 600 s on a 1.2 KB clip → bytes / 2000');
      assert.equal(t.app.stt.estimateSeconds({ mime: 'audio/ogg', buffer: null, seconds: 42 }), 42, 'no file: the claim is all there is');
      // التحويل التلقائي مضبوط (مزوّد وهمي)، لكن صوت الموقع لا يُحوَّل تلقائيًا ما دام التسجيل مؤرشفًا
      t.app.stt.configured = () => true;
      let enq = 0;
      const realEnqueue = t.app.media.enqueue;
      t.app.media.enqueue = (kind, id) => {
        if (kind === 'stt') enq += 1;
        return realEnqueue.call(t.app.media, kind, id);
      };
      const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(1196, 7)]).toString('base64');
      const r = await t.client().post('/api/public/intake', { consent: true, phone: '01012345690', pathway: 'consultation/property/new-rent', answers: { 'rent.side': 'tenant' }, entry: 'tree', description: '', documents: [{ filename: 'v.ogg', mime: 'audio/ogg', data_base64: OGG, seconds: 600 }] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(enq, 0, 'no automatic STT job for website audio while web voice is archived');
      assert.equal(Number(t.app.db.value("SELECT COALESCE(SUM(seconds), 0) FROM media_usage WHERE kind = 'stt'")), 0);
      // واتساب أو تفعيل التسجيل: يعود التحويل التلقائي
      t.app.settings.set('web_voice_enabled', true);
      const r2 = await t.client().post('/api/public/intake', { consent: true, phone: '01012345691', pathway: 'consultation/property/new-rent', answers: { 'rent.side': 'tenant' }, entry: 'tree', description: '', documents: [{ filename: 'v.ogg', mime: 'audio/ogg', data_base64: OGG }] });
      assert.equal(r2.status, 201);
      assert.equal(enq, 1, 'web voice on → auto STT as before');
      const src = read('src/ai/stt.js');
      assert.match(src, /Number\.isFinite\(r\.duration\) && r\.duration > 0 \? Math\.round\(r\.duration \* 10\) \/ 10 : pol\.seconds/);
    } finally {
      await t.close();
    }
  });

  test('JR-11: an STT test against 127.0.0.1 without STT_ALLOW_LOCAL names the remedy', async () => {
    const t = await startTestApp({ seed: 'none' });
    const prev = process.env.STT_ALLOW_LOCAL;
    delete process.env.STT_ALLOW_LOCAL;
    try {
      const admin = await t.login('admin');
      const put = await admin.put('/api/admin/integrations/stt', { values: { provider: 'openai_compatible', base_url: 'http://127.0.0.1:8000', hosting: 'own_server', model: 'whisper-1' } });
      assert.equal(put.status, 200, JSON.stringify(put.body));
      const r = ok(await admin.post('/api/admin/integrations/stt/test'));
      assert.equal(r.ok, false);
      assert.equal(r.code, 'blocked_local');
      assert.match(read('public/assets/js/app/pages/admin/integrations.js'), /blocked_local: '[^']*STT_ALLOW_LOCAL=1/);
    } finally {
      if (prev !== undefined) process.env.STT_ALLOW_LOCAL = prev;
      await t.close();
    }
  });

  test('R-03: versioned static JS under 1 KB (tags-boot.js) goes out br-compressed', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const { assetVersion } = await import('../src/http.js');
      const v = assetVersion(path.join(ROOT, 'public/assets/js/lib/tags-boot.js'));
      for (const u of [`/assets/js/lib/tags-boot.js?v=${v}`, '/assets/js/lib/tags-boot.js']) {
        const res = await fetch(`${t.base}${u}`, { headers: { 'accept-encoding': 'br' } });
        assert.equal(res.status, 200, u);
        assert.equal(res.headers.get('content-encoding'), 'br', u);
        const len = Number(res.headers.get('content-length'));
        assert.ok(len > 0 && len <= 450, `${u}: ${len} B br on the wire (T12-80 d)`);
        await res.arrayBuffer();
      }
    } finally {
      await t.close();
    }
  });

  test('R-04 (L12-90 mapping for the edited v11-gate-server test): a policy that only promises human review raises wa_choice_privacy as a warning with its href and detail', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-gate-privacy-'));
    const prevDir = t.app.config.publicDir;
    try {
      fs.writeFileSync(path.join(tmp, 'privacy.html'), '<!doctype html><p>كل رد يصلك يراجعه شخص مختص قبل إرساله.</p>');
      t.app.config.publicDir = tmp;
      t.app.settings.set('charity_public', true);
      const admin0 = t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0, null, { confirm: true });
      t.app.settings.set('wa_segment_choice_enabled', true);
      const item = t.app.segments.readiness().find((x) => x.key === 'wa_choice_privacy');
      assert.ok(item, 'warning present for the legacy promise');
      assert.equal(item.level, 'warning');
      assert.equal(item.href, '#/settings?section=stories');
      assert.match(item.detail, /«كل رد يصلك يراجعه شخص مختص»/);
      // the 12.0 sentence (L12-77) silences it
      fs.writeFileSync(path.join(tmp, 'privacy.html'), '<p>الرسائل الثابتة مثل الترحيب وقائمة الخدمات تُرسل آليًا، وكل رد على موضوعك يكتبه أو يراجعه شخص مختص.</p>');
      assert.ok(!t.app.segments.readiness().some((x) => x.key === 'wa_choice_privacy'));
    } finally {
      t.app.config.publicDir = prevDir;
      fs.rmSync(tmp, { recursive: true, force: true });
      await t.close();
    }
  });

  test('SEC-8: a lawyer downloading a company document gets a neutral file name (no employee name or phone)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      // مستند شركة باسم ملف يحمل اسم موظفة وهاتفها؛ الإرسال للمحامي (forLawyer، من media.downloadVariant) باسم محايد
      const cl = t.app.db.insert('clients', { code: 'CL-G-1', name: 'عميل', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      const saved = t.app.documents.save({ filename: 'عقد-دينا-سمير-01001234567.pdf', mime: 'application/pdf', data_base64: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64') }, { client_id: cl }, { id: 1, role: 'admin' });
      const docId = typeof saved === 'object' ? saved.id : saved;
      t.app.db.run('UPDATE documents SET company_id = 1 WHERE id = ?', docId);
      const doc = t.app.documents.get(docId);
      const headers = {};
      const res = { setHeader: (k, v) => (headers[k.toLowerCase()] = String(v)), end: () => {}, statusCode: 0, on: () => res, once: () => res, emit: () => {}, write: () => true };
      try {
        t.app.documents.send(res, doc, { forLawyer: true });
      } catch {
        /* streaming to the fake response is not needed: the headers are set before */
      }
      const cd = decodeURIComponent(headers['content-disposition'] || '');
      assert.ok(cd, 'content-disposition set');
      assert.doesNotMatch(cd, /دينا|سمير|01001234567/, cd);
      assert.match(cd, new RegExp(`document-${docId}`));
      // الفريق يرى الاسم الأصلي
      const h2 = {};
      try {
        t.app.documents.send({ ...res, setHeader: (k, v) => (h2[k.toLowerCase()] = String(v)) }, doc, {});
      } catch {
        /* كما أعلاه */
      }
      assert.match(decodeURIComponent(h2['content-disposition'] || ''), /دينا/);
      assert.match(read('src/services/media.js'), /forLawyer: user\?\.role === 'lawyer'/);
    } finally {
      await t.close();
    }
  });

  test('TA-01: every code literal in the scanned source is a registry item (helpers, defaults, ternaries, local TAGS maps)', async () => {
    const { scanSources, listSourceFiles, tokenize } = await import('../src/tags/scan.js');
    const { buildRegistry, loadModuleData } = await import('../src/tags/registry.js');
    const { PAGES } = await import('../public/assets/js/lib/tags-pages-app.js');
    const scan = scanSources({ root: ROOT });
    const reg = buildRegistry(scan, { moduleData: await loadModuleData(ROOT) });
    const known = new Set(reg.items.map((x) => x.code));
    // ليست رموز عناصر: اسم منحنى مفتاح Web Push
    const NOT_CODES = new Set(['P-256']);
    const missing = [];
    for (const rel of listSourceFiles(ROOT)) {
      if (rel.endsWith('.html')) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      for (const tk of tokenize(src).toks) {
        if (tk.t !== 'str') continue;
        const v = src.slice(tk.s + 1, tk.e - 1);
        const m = /^([A-Z]{1,6})-(?!00$)(\d{2,3})$/.exec(v);
        if (!m || !PAGES[m[1]] || NOT_CODES.has(v)) continue;
        if (!known.has(v)) missing.push(`${v} ${rel}`);
      }
    }
    assert.deepEqual(missing, []);
    for (const c of ['L-01', 'I-04', 'IC-03', 'IC-09', 'SYS-06', 'SYS-07', 'SYS-09', 'SYS-10', 'INT-06', 'INT-17', 'CT-21']) assert.ok(known.has(c), c);
    const md = read('TAGS.md');
    assert.match(md, /^\| L-01 \| رابط \| عن المكتب/m);
    assert.match(md, /^\| IC-03 \| حقل \| اسم الشركة/m);
  });

  test('TA-04 + TA-08 + TA-09: owner-facing texts — paid copy with the «خيري» form, split side variants, card titles and submit labels, company labels, full e-mail bodies, Arabic headers', async () => {
    const md = read('TAGS.md');
    const row = (code) => md.split('\n').find((l) => l.startsWith(`| ${code} |`)) || '';
    assert.match(row('P-45'), /\| لا يوجد مطلوب منكم الآن\.<br>الصيغ: أفراد وشركات «لا يوجد مطلوب منكم الآن\.» · خيري «مفيش حاجة مطلوبة منك دلوقتي\.»/);
    assert.match(row('PL-02'), /\| اتصلوا بنا</);
    assert.match(row('PV-31'), /\| بيانات تقدّمونها<br>الصيغ: أفراد وشركات «بيانات تقدّمونها» · خيري «بيانات تقدّمها أنت»/);
    assert.doesNotMatch(row('TM-24'), /قبول الطلبات قبول الطلبات/);
    assert.match(row('LGN-36'), /\| زر \| تسجيل الدخول \|/);
    assert.doesNotMatch(row('INT-44'), /توجيه النموذج/);
    assert.match(row('CK-07'), /\| صياغة عقد<br>الصيغ: بوابة الشركات «صياغة عقد» · الفريق «إعداد عقد»/);
    assert.match(row('E-05'), /نص الرسالة: «مرحبًا/);
    assert.match(row('E-03'), /الموضوع: «تغيّرت كلمة المرور لحسابكم»/);
    assert.doesNotMatch(row('E-12'), /\(نص متغير\)/);
    assert.match(md, /\| الرمز \| النوع \| النص \| مكانه في الملفات \|/);
    assert.match(md, /\| البادئة \| السطح \| الشاشة \| الرابط أو مكان الظهور \| عدد الرموز \|/);
    assert.match(md, /^\| H \| [^|]+ \| [^|]+ \| يظهر في: أعلى كل صفحات الموقع العام \|/m);
    assert.match(md, /^\| LCA \| .*\| 0 \(تستعمل رموز CAL \(التقويم\)\) \|$/m);
    assert.doesNotMatch(md, /^\| RV \| /m, 'zero-code screens hidden');
    assert.doesNotMatch(md, /\| Code \| Kind \| Text \| Where \|/);
    // /app#/tags: «النص كاملًا» carries the forms
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const r = ok(await admin.get('/api/admin/tags?q=CK-07'));
      const it = r.items.find((x) => x.code === 'CK-07');
      assert.deepEqual(it.variants.map((v) => v.label), ['بوابة الشركات', 'الفريق']);
      const e = ok(await admin.get('/api/admin/tags?q=E-05')).items.find((x) => x.code === 'E-05');
      assert.deepEqual(e.variants.map((v) => v.label), ['الموضوع', 'نص الرسالة']);
      assert.match(e.variants[1].text, /يوجد تحديث على طلبكم/);
    } finally {
      await t.close();
    }
  });
});
