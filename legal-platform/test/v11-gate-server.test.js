// v11 integration gate — server fixer: regression tests for the gate findings in the server area
// (J-01/R-16, F-D, F-A, F-C, F-E, K8/J-09/R-05, K10/R-11, J-03/V5, R-03, K2/J-08/R-01, R-02, R-04, R-18).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startTestApp, waPayload, freezeClock, resetClock, demoCode } from './helpers.js';
import { addressName } from '../src/util.js';
import * as words from '../public/assets/js/public/words.js';
import * as SEG from '../public/assets/js/public/segment.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = { whatsapp: { token: 'test-token-123456789012345', phoneNumberId: 'PN123', wabaId: 'WABA9', verifyToken: 'verify-me', appSecret: '', numberDigits: '201000000001' } };
const PAID_STORY = 'شركتي عندها عقد توريد مع مورد ومش ملتزم بالمواعيد، ومحتاجين نعرف حقنا القانوني في فسخ العقد.';
const admin0 = (t) => t.app.db.get("SELECT * FROM users WHERE username = 'admin'");
const lastIntake = (t) => t.app.db.get('SELECT * FROM intakes ORDER BY id DESC LIMIT 1');

function waOn(pid, { from = '201012345678', text = 'مرحبا', name = 'عميل', id } = {}) {
  const p = waPayload({ from, text, name, id });
  p.entry[0].changes[0].value.metadata.phone_number_id = pid;
  return p;
}
function stubFetch() {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://graph.facebook.com/')) return orig(url, init);
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT.${calls.length}` }] }), { status: 200 });
  };
  return { calls, restore: () => (globalThis.fetch = orig) };
}
const until = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};
async function paidCase(admin, phone, { area = 'CIV', title = 'نزاع مع مقاول على تشطيب شقة' } = {}) {
  let r = await admin.post('/api/admin/intakes', { channel: 'phone', phone, text: 'عميل يطلب استشارة بأتعاب في نزاع مع مقاول على تشطيب شقة', segment: 'paid' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const intakeId = r.body.id;
  r = await admin.post(`/api/admin/intakes/${intakeId}/convert`, { legal_area: area, title });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.case.segment, 'paid');
  return { intakeId, caseId: r.body.case.id };
}

// ═════════════ التقارير الخيرية لا تتغير بعمل الأفراد والشركات (INV-13) ═════════════
describe('v11 gate fixer-server — charity programme figures (J-01/R-16, F-D)', () => {
  test('J-01: an open paid case is not counted as «ملفات مفتوحة دون برنامج» (it can never be linked)', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const before = (await admin.get('/api/programs')).body.totals.unlinked_open_cases;
      const { caseId } = await paidCase(admin, '01011119101');
      assert.equal(t.app.db.value('SELECT status FROM cases WHERE id = ?', caseId) !== 'closed', true);
      const after = (await admin.get('/api/programs')).body.totals.unlinked_open_cases;
      assert.equal(after, before, 'paid data leaves the charity programmes tile unchanged');
      const pid = t.app.db.value("SELECT id FROM programs WHERE status = 'active' ORDER BY id LIMIT 1");
      const link = await admin.post(`/api/programs/${pid}/cases`, { case_id: caseId });
      assert.equal(link.status, 409, 'and it really cannot be linked');
      assert.equal(link.body.code, 'paid_case_program');
      assert.equal(Number(t.app.db.value("SELECT COUNT(*) FROM cases WHERE program_id IS NULL AND status != 'closed' AND company_id IS NULL AND segment = 'charity'")), after);
    } finally {
      await t.close();
    }
  });

  test('F-D: after a paid → charity override and a programme link, paid-era ledger entries stay out of the programme spend', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      const { caseId } = await paidCase(admin, '01011119102');
      const tarek = db.get("SELECT * FROM users WHERE username = 'tarek'");
      const lead = (await admin.post(`/api/admin/cases/${caseId}/assignments`, { lawyer_id: tarek.id, role: 'lead', brief: 'رأي' })).body.assignment;
      db.run("UPDATE assignments SET status = 'approved', approved_at = ? WHERE id = ?", new Date().toISOString(), lead.id);
      t.app.accounting.recordBillableEvent(lead.id, 'on_approval');
      assert.ok(Number(db.value("SELECT COUNT(*) FROM ledger_entries WHERE case_id = ? AND segment = 'paid'", caseId)) > 0, 'a paid-era ledger entry exists');
      const pid = db.value("SELECT id FROM programs WHERE status = 'active' ORDER BY id LIMIT 1");
      const spend0 = (await admin.get(`/api/print/programme/${pid}`)).body;
      const ov = await admin.put(`/api/admin/cases/${caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' });
      assert.equal(ov.status, 200, JSON.stringify(ov.body));
      t.app.programs.linkCase(caseId, pid, admin0(t), { force: true });
      assert.equal(db.value('SELECT program_id FROM cases WHERE id = ?', caseId), pid);
      const spend1 = (await admin.get(`/api/print/programme/${pid}`)).body;
      for (const k of ['generated_at', 'date']) {
        delete spend0[k];
        delete spend1[k];
      }
      const lines = (doc) => JSON.stringify(doc).match(/"source":"ledger"/g)?.length || 0;
      assert.equal(lines(spend1), lines(spend0), 'no paid-era ledger line is added to the programme');
      const d = t.app.programs.detail(pid);
      assert.ok(Array.isArray(d.spend.lines));
      assert.ok(!d.spend.lines.some((l) => l.case_id === caseId && l.source === 'ledger'), 'detail spend lines exclude the paid snapshot');
    } finally {
      await t.close();
    }
  });
});

// ═════════════ تحويل ملف مدفوع إلى «خيري» يلغي أتعاب الملف المستمر ويوقف التذكير (F-A) ═════════════
describe('v11 gate fixer-server — paid → charity override and fees (F-A)', () => {
  test('matter fee invoices of the paid era are cancelled with the case-level ones; invoice_reminder never chases the now-charity client', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      const { caseId } = await paidCase(admin, '01011119201');
      const m = await admin.post(`/api/admin/cases/${caseId}/matter`, { kind: 'litigation' });
      assert.equal(m.status, 201, JSON.stringify(m.body));
      const mid = m.body.id ?? m.body.matter?.id ?? db.value('SELECT matter_id FROM cases WHERE id = ?', caseId);
      const due = new Date(Date.now() - 2 * 86400000).toISOString();
      const mInv = (await admin.post(`/api/admin/matters/${mid}/invoices`, { description: 'أتعاب المحاماة في الدعوى', amount: 5000, due_at: due })).body;
      const cInv = (await admin.post(`/api/admin/cases/${caseId}/invoices`, { amount: 1000, due_at: due })).body.invoice;
      const kept = (await admin.post(`/api/admin/matters/${mid}/invoices`, { description: 'أتعاب مرحلة أولى', amount: 3000, due_at: due })).body;
      for (const id of [mInv.id, cInv.id, kept.id]) db.run('UPDATE invoices SET client_agreed_at = ? WHERE id = ?', new Date().toISOString(), id);
      t.app.matters.addPayment(kept.id, { amount: 500 }, admin0(t));
      const ov = await admin.put(`/api/admin/cases/${caseId}/segment`, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' });
      assert.equal(ov.status, 200, JSON.stringify(ov.body));
      const status = (id) => db.value('SELECT status FROM invoices WHERE id = ?', id);
      assert.equal(status(cInv.id), 'cancelled');
      assert.equal(status(mInv.id), 'cancelled', 'the paid-era matter invoice is cancelled too');
      assert.notEqual(status(kept.id), 'cancelled', 'an invoice with payments stays (admin decides)');
      assert.deepEqual([...ov.body.cancelled_invoices].sort(), [cInv.number, mInv.number].sort());
      // ولا تذكير آلي بأتعاب صدرت قبل التحويل إلى «خيري» (حتى ما عليه دفعة)
      const before = Number(db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'invoice_reminder'"));
      t.app.automations.runAll();
      assert.equal(Number(db.value("SELECT COUNT(*) FROM messages WHERE automation_rule = 'invoice_reminder'")), before, 'no invoice_reminder to the now-charity client');
    } finally {
      await t.close();
    }
  });

  test('a charity-era matter invoice (before the case became paid) is not cancelled by a later paid → charity override', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      let r = await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011119202', text: 'أرملة عندها نزاع ميراث على شقة والدها', segment: 'charity' });
      r = await admin.post(`/api/admin/intakes/${r.body.id}/convert`, { legal_area: 'INH', title: 'ميراث' });
      const caseId = r.body.case.id;
      await admin.post(`/api/admin/cases/${caseId}/matter`, { kind: 'litigation' });
      const mid = db.value('SELECT matter_id FROM cases WHERE id = ?', caseId);
      freezeClock(new Date(Date.now() - 3600 * 1000).toISOString());
      const fee = (await admin.post(`/api/admin/matters/${mid}/invoices`, { description: 'رسوم إدارية رمزية', amount: 200, due_at: new Date().toISOString() })).body;
      resetClock();
      assert.equal((await admin.put(`/api/admin/cases/${caseId}/segment`, { segment: 'paid', reason: 'دخله يكفي' })).status, 200);
      const back = await admin.put(`/api/admin/cases/${caseId}/segment`, { segment: 'charity', reason: 'اختار النوع الخطأ' });
      assert.equal(back.status, 200);
      assert.notEqual(db.value('SELECT status FROM invoices WHERE id = ?', fee.id), 'cancelled');
      assert.deepEqual(back.body.cancelled_invoices, []);
    } finally {
      resetClock();
      await t.close();
    }
  });
});

// ═════════════ عميل أفراد وشركات عائد على الرقم الأساسي «الخيري» (F-C) ═════════════
describe('v11 gate fixer-server — returning paid client on the charity-mode main number (F-C)', () => {
  test('untagged message → stays «خيري» (L11-21) but carries a non-applying «يبدو أفراد وشركات» hint; source label «الرقم الأساسي»', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      const admin = await t.login('admin');
      const db = t.app.db;
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119301', text: `${SEG.paidWaPrefill('rent')} عندي عقد إيجار محل` }));
      const first = lastIntake(t);
      assert.equal(first.segment, 'paid');
      assert.equal(first.segment_source, 'wa_tag');
      const cv = await admin.post(`/api/admin/intakes/${first.id}/convert`, { legal_area: 'CIV', title: 'عقد إيجار محل' });
      assert.equal(cv.status, 201, JSON.stringify(cv.body));
      db.run("UPDATE cases SET status = 'closed', closed_at = ? WHERE id = ?", new Date().toISOString(), cv.body.case.id);
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119301', text: 'مساء الخير، عندي مشكلة تانية: المقاول ما سلمش الشقة في ميعادها' }));
      const second = lastIntake(t);
      assert.notEqual(second.id, first.id, 'a new request');
      assert.equal(second.segment, 'charity', 'never applied automatically (INV-04/L11-21)');
      assert.equal(second.segment_source, 'wa_line');
      const det = (await admin.get(`/api/admin/intakes/${second.id}`)).body;
      assert.equal(det.segment.hint?.segment, 'paid');
      assert.deepEqual(det.segment.mismatch_hint?.reasons, ['عميل أفراد وشركات سابق']);
      assert.equal(det.segment.source_label, 'الرقم الأساسي', 'one number: not «رقم واتساب المخصص»');
      // عميلة خيري عائدة: لا اقتراح
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119302', text: 'السلام عليكم جوزي اتوفى وعايزة أعرف حقي في الشقة' }));
      const ch = lastIntake(t);
      assert.equal((await admin.get(`/api/admin/intakes/${ch.id}`)).body.segment.mismatch_hint, null);
    } finally {
      await t.close();
    }
  });
});

// ═════════════ القوالب خارج النافذة لعملاء الأفراد والشركات (F-E) ═════════════
describe('v11 gate fixer-server — paid tone never falls back to the legacy charity template (F-E)', () => {
  test('no @paid / portal_update mapping: paid → no template (portal only), charity keeps the legacy template; readiness warns', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.settings.set('whatsapp_template_name', 'case_update_legacy');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119401', text: `${SEG.paidWaPrefill('inh')} ورث والدي` }));
      const paid = lastIntake(t);
      assert.equal(paid.segment, 'paid');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119402', text: 'السلام عليكم جوزي اتوفى وعايزة أعرف حقي في الشقة' }));
      const charity = lastIntake(t);
      assert.equal(charity.segment, 'charity');
      const plan = (i) => t.app.messaging.templatePlan({ id: 0, client_id: i.client_id, intake_id: i.id, case_id: null, matter_id: null, body: 'نص', to_address: '+201011119401' }, {});
      assert.equal(plan(paid), null, 'paid: the 10.0 charity template is never used');
      assert.equal(plan(charity)?.name, 'case_update_legacy', 'charity unchanged');
      assert.ok(t.app.segments.readiness().some((x) => x.key === 'wa_paid_no_template' && x.level === 'warning'));
      t.app.db.run("INSERT INTO wa_template_mappings (purpose, template_name, language, params, updated_at) VALUES ('portal_update', 'portal_update', 'ar', '[]', ?)", new Date().toISOString());
      assert.ok(!t.app.segments.readiness().some((x) => x.key === 'wa_paid_no_template'));
    } finally {
      await t.close();
    }
  });
});

// ═════════════ رقم مُستبدل (K8/J-09/R-05) ═════════════
describe('v11 gate fixer-server — a replaced main number keeps WhatsApp (templates only) for existing clients (K8)', () => {
  test('main id replaced: same side\'s current number, closed window, template from the new id; staff see «استُبدل»; unknown ids stay page-only', async () => {
    // المعرّف الأساسي من قاعدة البيانات (قيمة البيئة تغلب، فلا تُستبدل من التكاملات)
    const t = await startTestApp({ seed: 'none', config: { whatsapp: { ...LIVE.whatsapp, phoneNumberId: '' } } });
    const f = stubFetch();
    try {
      const admin = await t.login('admin');
      t.app.integrations.set('whatsapp', { phone_number_id: 'PN123' }, admin0(t));
      assert.equal(t.app.segments.lines()[0].pid, 'PN123');
      t.app.settings.set('whatsapp_template_name', 'case_update');
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119501', text: 'السلام عليكم عندي مشكلة في معاش والدي' }));
      const i = lastIntake(t);
      const story = { clientId: i.client_id, intakeId: i.id };
      assert.equal(t.app.segments.lineForStory(story), 'main');
      assert.equal(t.app.engine.inWindow(i.client_id, 'main'), true);
      t.app.integrations.set('whatsapp', { phone_number_id: 'PN999' }, admin0(t));
      assert.equal(t.app.segments.lineForStory(story), 'main', 'same side, current number (was null → follow-up page only)');
      assert.equal(t.app.engine.inWindow(i.client_id, 'main'), false, 'INV-05: the new number starts with a closed window');
      assert.equal(t.app.segments.storyLineReplaced(story), true);
      const det = (await admin.get(`/api/admin/intakes/${i.id}`)).body;
      assert.equal(det.send_line.key, 'main');
      assert.match(det.send_line.label, /استُبدل/);
      assert.equal(t.app.engine.channelHint(story).text, 'الرقم الذي كتب عليه استُبدل — سيُرسل بقالب من الرقم الحالي + صفحة المتابعة');
      const before = f.calls.length;
      const r = await admin.post(`/api/admin/intakes/${i.id}/reply`, { body: 'أهلًا، عندنا جديد في طلبك' });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(r.body.channel, 'whatsapp');
      assert.ok(await until(() => f.calls.length > before), 'sent');
      const sent = f.calls.slice(before).find((c) => c.url.endsWith('/messages'));
      assert.ok(sent.url.endsWith('/PN999/messages'), sent.url);
      assert.equal(JSON.parse(sent.body).type, 'template', 'outside the window only a template leaves');
      assert.ok(!f.calls.some((c) => c.url.includes('/PN123/')), 'nothing from the old id');
      // رسالة جديدة على المعرّف القديم = رقم غير مضبوط: تُحفظ ولا يُرد عليها آليًا (INV-16)
      t.app.engine.handleWhatsAppWebhook(waOn('PN123', { from: '201011119502', text: 'مرحبا عندي سؤال' }));
      const u = lastIntake(t);
      assert.equal(u.wa_line, 'unknown');
      assert.equal(t.app.segments.lineForStory({ clientId: u.client_id, intakeId: u.id }), null);
      // ويكتب العميل من جديد على الرقم الحالي ← النافذة تُفتح ولا علامة «استُبدل»
      t.app.engine.handleWhatsAppWebhook(waOn('PN999', { from: '201011119501', text: 'تمام شكرًا' }));
      assert.equal(t.app.engine.inWindow(i.client_id, 'main'), true);
      assert.equal(t.app.segments.storyLineReplaced(story), false);
    } finally {
      f.restore();
      await t.close();
    }
  });
});

// ═════════════ الجاهزية: أزرار نوع الخدمة وسياسة الخصوصية (K10/R-11) ═════════════
describe('v11 gate fixer-server — readiness for choice buttons on a shared number (K10/R-11, S11-24)', () => {
  test('shared + buttons off → wa_shared_choice is a warning; buttons on while privacy promises human review → wa_choice_privacy', async () => {
    const t = await startTestApp({ seed: 'none', config: LIVE });
    try {
      t.app.integrations.set('whatsapp', { segment: 'shared' }, admin0(t), null, { confirm: true });
      t.app.settings.set('wa_segment_choice_enabled', false);
      let items = t.app.segments.readiness();
      assert.equal(items.find((x) => x.key === 'wa_shared_choice')?.level, 'warning');
      assert.ok(!items.some((x) => x.key === 'wa_choice_privacy'));
      t.app.settings.set('wa_segment_choice_enabled', true);
      items = t.app.segments.readiness();
      assert.ok(/يراجعه شخص مختص/.test(fs.readFileSync(path.join(ROOT, 'public/privacy.html'), 'utf8')), 'privacy text still promises human review');
      const it = items.find((x) => x.key === 'wa_choice_privacy');
      assert.ok(it, JSON.stringify(items.map((x) => x.key)));
      assert.equal(it.level, 'warning');
      assert.equal(it.href, '#/settings?section=stories');
      assert.match(it.detail, /«كل رد يصلك يراجعه شخص مختص»/);
      // الرقم الأساسي «الخيري» (لا أزرار تُرسل أصلًا) ← لا تحذير
      t.app.integrations.set('whatsapp', { segment: 'charity' }, admin0(t), null, { confirm: true });
      assert.ok(!t.app.segments.readiness().some((x) => x.key === 'wa_choice_privacy'));
    } finally {
      await t.close();
    }
  });

  test('story-settings hint quotes the privacy sentence with «…»', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/assets/js/app/components/story-settings.js'), 'utf8');
    assert.ok(src.includes('«كل رد يصلك يراجعه شخص مختص»'));
    assert.ok(!/"كل رد يصلك يراجعه شخص مختص" في سياسة الخصوصية؛ الأزرار/.test(src));
  });
});

// ═════════════ المخاطبة باللقب (J-03/V5) ═════════════
describe('v11 gate fixer-server — honorific + first name, never the honorific alone (J-03/V5)', () => {
  test('addressName (server util.js = public words.js)', () => {
    for (const fn of [addressName, words.addressName]) {
      assert.equal(fn('م. رامي فؤاد'), 'م. رامي');
      assert.equal(fn('أ. هشام'), 'أ. هشام');
      assert.equal(fn('د. سامي عبد الله'), 'د. سامي');
      assert.equal(fn('أ/ نادية علي'), 'أ/ نادية');
      assert.equal(fn('الأستاذ هشام كمال'), 'أستاذ هشام');
      assert.equal(fn('م. عبد الله محمد'), 'م. عبد الله');
      assert.equal(fn('م.'), '', 'an honorific alone → «مرحبًا بكم» fallback');
      assert.equal(fn('أ.'), '');
      // 9.1 rules unchanged
      assert.equal(fn('أم محمد عبد الله'), 'أم محمد');
      assert.equal(fn('سامية محمود'), 'سامية');
      assert.equal(fn('عبد الله محمد'), 'عبد الله');
      assert.equal(fn('أم'), '');
      assert.equal(fn('السيد عبد الفتاح'), 'السيد', '«السيد» is a first name, not an honorific');
    }
  });

  test('paid drafts and the change message greet «مرحبًا م. رامي»', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      const r = await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011119601', name: 'م. رامي فؤاد', text: PAID_STORY, segment: 'paid' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      await t.app.ai.analyzeIntake(r.body.id);
      const prop = (await admin.get(`/api/admin/intakes/${r.body.id}/proposal`)).body;
      const text = JSON.stringify(prop.drafts);
      assert.ok(!/مرحبًا م\.،/.test(text), 'never «مرحبًا م.،»');
      assert.ok(/م\. رامي/.test(text), text.slice(0, 300));
      const det = (await admin.get(`/api/admin/intakes/${r.body.id}`)).body;
      const msg = det.segment.change_message?.charity || '';
      assert.ok(!/مرحبًا م\.،/.test(msg), msg);
    } finally {
      await t.close();
    }
  });
});

// ═════════════ حدود شهر القاهرة في لوحة المتابعة (R-03) ═════════════
describe('v11 gate fixer-server — dashboard month uses the Cairo month range (R-03)', () => {
  test('a paid case opened at 00:30 Cairo on the 1st counts in that month (UTC is still the previous month)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      freezeClock('2026-09-30T21:30:00.000Z'); // 00:30 بتوقيت القاهرة، 1 أكتوبر
      const before = (await admin.get('/api/admin/dashboard')).body.month;
      assert.equal(before.period, '2026-10');
      await paidCase(admin, '01011119701');
      let r = await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011119702', text: 'أرملة عندها نزاع ميراث على شقة والدها', segment: 'charity' });
      r = await admin.post(`/api/admin/intakes/${r.body.id}/convert`, { legal_area: 'INH', title: 'ميراث' });
      assert.equal(r.status, 201);
      const after = (await admin.get('/api/admin/dashboard')).body.month;
      assert.equal(after.paid.cases_opened, before.paid.cases_opened + 1);
      assert.equal(after.cases_opened, before.cases_opened + 1);
    } finally {
      resetClock();
      await t.close();
    }
  });
});

// ═════════════ العرض التجريبي ثابت عبر حدود اليوم والشهر والسنة (K2/J-08/R-01, R-02, R-04) ═════════════
describe('v11 gate fixer-server — the demo seed is stable across day, DST, month and year boundaries (K2, R-02, R-04)', () => {
  const FAKE_DATE = `const FAKE = process.env.FAKE_NOW;
if (FAKE) {
  const RealDate = Date;
  const offset = RealDate.parse(FAKE) - RealDate.now();
  const fakeNow = () => RealDate.now() + offset;
  const Fake = new Proxy(RealDate, {
    construct(target, args, newTarget) { return Reflect.construct(target, args.length ? args : [fakeNow()], newTarget === Fake ? target : newTarget); },
    apply() { return new RealDate(fakeNow()).toString(); },
    get(t, p) { if (p === 'now') return fakeNow; return Reflect.get(t, p, t); },
  });
  globalThis.Date = Fake;
}
`;
  const SCRIPT = `import { startTestApp, demoCode } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'test/helpers.js')).href)};
import { usageCycle } from ${JSON.stringify(pathToFileURL(path.join(ROOT, 'public/assets/js/lib/company-sla.js')).href)};
const t = await startTestApp({ seed: 'demo' });
try {
  const db = t.app.db;
  const ch = db.get("SELECT * FROM company_charges WHERE kind = 'overage'");
  const startsOn = db.value("SELECT starts_on FROM company_subscriptions WHERE status = 'active' AND company_id = ?", ch.company_id);
  const hany = await t.login('hany');
  const s = (await hany.get('/api/lawyer/statement')).body;
  const prev = s.months.find((m) => m.period < s.this_month.period) || {};
  console.log('RESULT ' + JSON.stringify({ now: new Date().toISOString(), charge: ch.period, cycle: usageCycle(startsOn, new Date()).start, expected: s.this_month.expected_total, prev: prev.total, code: demoCode(t.app) }));
} finally {
  await t.close();
}
`;
  function runAt(fakeNow, dir) {
    return new Promise((resolve) => {
      const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', pathToFileURL(path.join(dir, 'fake-date.mjs')).href, path.join(dir, 'probe.mjs')], {
        env: { ...process.env, FAKE_NOW: fakeNow, NODE_OPTIONS: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (code) => resolve({ code, out, err }));
    });
  }

  test('overage charge in the previous usage cycle, hany\'s fee in the previous month, demo codes by suffix — at 00:05 Cairo (EEST), 23:30 after DST ends, day 22 of a new year', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-fake-'));
    try {
      fs.writeFileSync(path.join(dir, 'fake-date.mjs'), FAKE_DATE);
      fs.writeFileSync(path.join(dir, 'probe.mjs'), SCRIPT);
      const times = ['2026-10-09T21:05:00.000Z', '2026-11-03T21:30:00.000Z', '2027-01-22T09:00:00.000Z'];
      const runs = await Promise.all(times.map((x) => runAt(x, dir)));
      runs.forEach((r, k) => {
        const line = r.out.split('\n').find((l) => l.startsWith('RESULT '));
        assert.ok(line, `${times[k]}: ${r.code} ${r.err.slice(0, 2000)}`);
        const res = JSON.parse(line.slice(7));
        assert.ok(res.now.startsWith(times[k].slice(0, 13)), `${times[k]}: the fake clock is in effect (${res.now})`);
        assert.ok(res.charge && res.charge < res.cycle, `${times[k]}: charged in the previous usage cycle (${res.charge} < ${res.cycle})`);
        assert.equal(res.expected, 8000, `${times[k]}: hany's monthly amount only this month`);
        assert.equal(res.prev, 10500, `${times[k]}: the matter fee stays in the previous month`);
        assert.match(res.code, /^INH-\d{4}-00482$/);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('demoCode() finds the demo case whatever the seed year', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const code = demoCode(t.app);
      assert.match(code, /^INH-\d{4}-00482$/);
      assert.throws(() => demoCode(t.app, 'XXX-%-99999'));
    } finally {
      await t.close();
    }
  });
});

// ═════════════ بقايا الأخضر القديم (R-18) ═════════════
describe('v11 gate fixer-server — no 10.0 green fallback left (R-18)', () => {
  test('bare 404 fallbacks and theme-sync use the logo green #0b3d29', () => {
    for (const f of ['src/app.js', 'src/services/system.js', 'public/assets/js/app/theme-sync.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/#0b5a3c/i.test(src), f);
      assert.ok(/#0b3d29/i.test(src), f);
    }
  });
});
