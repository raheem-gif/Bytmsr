// Lane A — Intake Engine: two doors (website + WhatsApp), one inbox, source vs channel,
// codes & counters, returning clients. Expectations come from the product requirements (1, 2, 3).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload, freezeClock, resetClock, demoCode } from './helpers.js';

const DESC = 'توفي والدي وترك شقة ومحلًا تجاريًا، وأريد معرفة نصيب كل وارث وكيفية تقسيم التركة بين الإخوة دون نزاع.';
const REQ_RE = /^REQ-(\d{4})-(\d{5})$/;
const CL_RE = /^CL-(\d{5})$/;

function cairoYear(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric' }).format(d));
}

async function webIntake(t, body = {}) {
  return t.client().post('/api/public/intake', { name: 'مواطن تجريبي', phone: '01011112222', description: DESC, consent: true, ...body });
}
async function okWebIntake(t, body) {
  const r = await webIntake(t, body);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
async function sendWa(t, opts) {
  const r = await t.client().post('/webhooks/whatsapp', waPayload(opts));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function inbox(admin, query = '') {
  const r = await admin.get('/api/admin/intakes' + query);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function intakeByCode(admin, code) {
  const l = await inbox(admin, `?scope=all&q=${encodeURIComponent(code)}`);
  const it = l.items.find((x) => x.code === code);
  assert.ok(it, `intake ${code} should be in the inbox`);
  return it;
}
async function detail(admin, intakeId) {
  const r = await admin.get(`/api/admin/intakes/${intakeId}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function convert(admin, intakeId, body = {}) {
  const r = await admin.post(`/api/admin/intakes/${intakeId}/convert`, { legal_area: 'INH', title: 'نزاع على تركة', facts_shared: 'وقائع مختصرة للمحامي', ...body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.case;
}

describe('Req 1 — two doors, one Intake Engine, one inbox', () => {
  test('website intake returns a REQ-YYYY-NNNNN reference, a portal link and a prefilled wa.me link, and lands in the unified inbox', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const res = await okWebIntake(t, {
        name: 'منى عادل',
        phone: '01098765432',
        governorate: 'الجيزة',
        legal_area: 'FAM',
        attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'family-law' },
      });
      const m = REQ_RE.exec(res.reference);
      assert.ok(m, `reference ${res.reference} must look like REQ-YYYY-NNNNN`);
      assert.equal(Number(m[1]), cairoYear());
      assert.match(res.portal_url, /\/p\/[A-Za-z0-9_-]{20,100}$/);
      assert.ok(res.whatsapp_url.startsWith('https://wa.me/201000000001?text='), res.whatsapp_url);
      assert.ok(decodeURIComponent(res.whatsapp_url.split('text=')[1]).includes(res.reference), 'prefilled WhatsApp text must carry the reference');

      const admin = await t.login('admin');
      const list = await inbox(admin);
      assert.equal(list.total, 1);
      const it = list.items[0];
      assert.equal(it.code, res.reference);
      assert.equal(it.status, 'new');
      assert.equal(it.first_channel, 'website');
      assert.deepEqual(it.channels, ['website']);
      assert.equal(it.source, 'google');
      assert.match(it.client_code, CL_RE);
      assert.equal(it.case_id, null, 'a message is not automatically a case');

      const d = await detail(admin, it.id);
      assert.equal(d.messages.length, 1);
      assert.equal(d.messages[0].direction, 'in');
      assert.equal(d.messages[0].channel, 'website');
      assert.equal(d.messages[0].body, DESC);
      assert.equal(d.client.phone, '+201098765432');
      assert.equal(d.client.name, 'منى عادل');
      assert.equal(d.client.code, it.client_code);
    } finally {
      await t.close();
    }
  });

  // v9.1 fixes: نفس العميل دائمًا، لكن رسالة واتساب بلا كود التأكيد لا تُضاف لطلب الموقع غير المؤكد (رابطه في متصفح
  // لم يثبت أنه صاحب الرقم)؛ الرسالة الجاهزة برقم الطلب وكود التأكيد تكمل نفس الطلب (انظر الاختبار التالي)
  test('website then WhatsApp from the same phone (wa_id format) is the SAME client; without the confirmation code it opens its own request', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await okWebIntake(t, { phone: '01011112222', name: 'هبة' });
      const wa = await sendWa(t, { from: '201011112222', name: 'Heba', text: 'أنا اللي بعت الطلب من الموقع، عندي سؤال إضافي عن نصيب الأخت.' });
      assert.equal(wa.received, 1);

      const admin = await t.login('admin');
      const list = await inbox(admin, '?scope=all');
      assert.equal(list.total, 2);
      const it = list.items.find((x) => x.code === web.reference);
      assert.equal(it.first_channel, 'website');
      assert.deepEqual([...it.channels].sort(), ['website']);
      assert.equal(it.messages_count, 1);

      const clients = await admin.get('/api/admin/clients');
      assert.equal(clients.body.total, 1, 'only ONE client must exist');
      const d = await detail(admin, it.id);
      assert.deepEqual(d.messages.map((x) => x.channel), ['website']);
      const phones = d.client.identities.filter((x) => x.kind === 'phone');
      assert.equal(phones.length, 1);
      assert.equal(phones[0].value, '+201011112222');
      assert.deepEqual([...phones[0].channels].sort(), ['website', 'whatsapp']);
      assert.equal(d.client.name, 'هبة', 'the WhatsApp profile name must not overwrite the name the citizen gave');
    } finally {
      await t.close();
    }
  });

  test('the prefilled wa.me text quoting the reference attaches to THAT intake even when a newer open intake exists for the same phone', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const first = await okWebIntake(t, { phone: '01033334444', description: 'مشكلة في عقد إيجار الشقة والمالك يرفض استلام الإيجار منذ ثلاثة أشهر.' });
      const second = await okWebIntake(t, { phone: '01033334444', description: 'سؤال آخر منفصل عن نفقة الأطفال بعد الطلاق وكيفية رفع دعوى نفقة.' });
      assert.notEqual(first.reference, second.reference);
      // v9.1 fixes: الرسالة الجاهزة الحالية (رقم الطلب + كود التأكيد) — رقم الطلب وحده لا يضيف الرسالة لطلب موقع غير مؤكد
      const prefilled = decodeURIComponent(first.confirm_url.split('text=')[1]);
      await sendWa(t, { from: '201033334444', text: prefilled });

      const admin = await t.login('admin');
      const a = await intakeByCode(admin, first.reference);
      const b = await intakeByCode(admin, second.reference);
      assert.equal(a.client_id, b.client_id, 'both requests belong to the same client');
      const da = await detail(admin, a.id);
      const db = await detail(admin, b.id);
      assert.ok(da.messages.some((m) => m.channel === 'whatsapp' && m.body === prefilled), 'WhatsApp message must join the referenced intake');
      assert.ok(!db.messages.some((m) => m.channel === 'whatsapp'), 'WhatsApp message must NOT go to the other (newer) intake');
      assert.deepEqual([...da.intake.channels].sort(), ['website', 'whatsapp']);
      assert.equal((await inbox(admin, '?scope=all')).total, 2, 'no third intake may be created');
    } finally {
      await t.close();
    }
  });

  test("a DIFFERENT phone quoting someone else's reference is NOT merged: separate client & intake, staff alerted", async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const victim = await okWebIntake(t, { phone: '01022223333', name: 'نادية فهمي' });
      const admin = await t.login('admin');
      const before = (await admin.get('/api/notifications?limit=200')).body.items.length;

      await sendWa(t, { from: '201055556666', name: 'غريب', text: `السلام عليكم رقم طلبي ${victim.reference} عايز أعرف وصل لفين` });

      const va = await intakeByCode(admin, victim.reference);
      const vd = await detail(admin, va.id);
      assert.equal(vd.messages.length, 1, "stranger's message must not be attached to the victim's intake");
      assert.deepEqual(vd.client.identities.map((x) => x.value), ['+201022223333'], "stranger's phone must not be linked to the victim's client");

      const list = await inbox(admin, '?scope=all');
      assert.equal(list.total, 2);
      const other = list.items.find((x) => x.code !== victim.reference);
      assert.notEqual(other.client_id, va.client_id);
      assert.notEqual(other.client_code, va.client_code);
      const od = await detail(admin, other.id);
      assert.equal(od.client.identities.some((x) => x.value === '+201022223333'), false);
      assert.notEqual(od.client.name, 'نادية فهمي');
      assert.equal(od.client.other_intakes.length, 0, "the stranger's client record must not expose the victim's intakes");

      const notes = (await admin.get('/api/notifications?limit=200')).body.items;
      assert.ok(notes.length > before);
      assert.ok(
        notes.some((n) => n.type !== 'intake.new' && `${n.title} ${n.body || ''}`.includes(victim.reference)),
        'staff must be alerted about a different number quoting an existing reference',
      );
    } finally {
      await t.close();
    }
  });

  test('WhatsApp first, then the website form from the same phone resolves to the same Client ID', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201044445555', name: 'Karim', text: 'عندي مشكلة مع صاحب العمل رفض يدفع مستحقاتي بعد الفصل.' });
      const web = await okWebIntake(t, { phone: '01044445555', name: 'كريم سامي', description: 'تم فصلي تعسفيًا من العمل ولم أحصل على مستحقاتي ومكافأة نهاية الخدمة.' });
      const admin = await t.login('admin');
      const clients = (await admin.get('/api/admin/clients')).body;
      assert.equal(clients.total, 1);
      const it = await intakeByCode(admin, web.reference);
      assert.equal(it.client_code, clients.items[0].code);
      const d = await detail(admin, it.id);
      assert.deepEqual([...d.client.identities[0].channels].sort(), ['website', 'whatsapp']);
    } finally {
      await t.close();
    }
  });

  test('phone variants (local, wa_id, +20, 0020, Arabic-Indic digits) resolve to one client', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await okWebIntake(t, { phone: '٠١٠٦٦٦٧٧٧٨٨' });
      await okWebIntake(t, { phone: '+20 106 667 7788' });
      await okWebIntake(t, { phone: '00201066677788' });
      await sendWa(t, { from: '201066677788', text: 'متابعة لطلبي' });
      const admin = await t.login('admin');
      const clients = (await admin.get('/api/admin/clients')).body;
      assert.equal(clients.total, 1, JSON.stringify(clients.items.map((c) => c.phone)));
      assert.equal(clients.items[0].phone, '+201066677788');
      const list = await inbox(admin, '?scope=all');
      assert.equal(new Set(list.items.map((x) => x.client_code)).size, 1);
    } finally {
      await t.close();
    }
  });
});

describe('Demo scenario — سامية (CL-00881) and INH-2026-00482', () => {
  test('a new WhatsApp message from the client of an open case joins INH-2026-00482 under CL-00881; the case keeps source facebook_ad on channel whatsapp', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const openBefore = (await inbox(admin)).total;
      const code = demoCode(t.app); // v11 gate fixer-server (R-04, intended): INH-<سنة البذر>-00482
      const kase = (await admin.get(`/api/admin/cases?q=${code}`)).body.items[0];
      assert.equal(kase.code, code);
      assert.match(kase.code, /^INH-\d{4}-00482$/);
      assert.equal(kase.client_code, 'CL-00881');
      assert.equal(kase.source, 'facebook_ad');
      assert.equal(kase.channel, 'whatsapp');

      await sendWa(t, { from: '201012345678', name: 'Samia', text: 'مساء الخير، إعلام الوراثة لسه ما طلعش، هبعته أول ما يطلع.' });
      assert.equal((await inbox(admin)).total, openBefore, 'no new intake for a client with an open case');
      const cd = (await admin.get(`/api/admin/cases/${kase.id}`)).body;
      assert.ok(cd.messages.some((m) => m.direction === 'in' && m.body.startsWith('مساء الخير، إعلام الوراثة')));
      assert.equal(cd.client.code, 'CL-00881');
      assert.equal(cd.client.phone, '+201012345678');
      const cl = (await admin.get(`/api/admin/clients/${cd.client.id}`)).body;
      assert.equal(cl.client.code, 'CL-00881');
      assert.deepEqual(cl.identities.map((i) => i.value), ['+201012345678'], 'still one phone identity — no duplicate client or identity');
    } finally {
      await t.close();
    }
  });
});

describe('Req 2 — source (marketing) is distinct from channel (door)', () => {
  let t;
  let admin;
  const ids = {};
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    await sendWa(t, {
      from: '201070000001',
      text: 'شفت إعلانكم عن الميراث وعايز استشارة',
      referral: { source_url: 'https://fb.me/2xYzAd', source_type: 'ad', source_id: '120200001', headline: 'هل لك حق في ميراث؟', ctwa_clid: 'clid-1' },
    });
    await sendWa(t, {
      from: '201070000002',
      text: 'جاي من إعلان انستجرام بخصوص قضية نفقة',
      referral: { source_url: 'https://www.instagram.com/p/C0ad', source_type: 'ad', source_id: '120200002', headline: 'استشارة أسرة مجانية' },
    });
    await sendWa(t, {
      from: '201070000003',
      text: 'شفت البوست بتاعكم',
      referral: { source_url: 'https://www.facebook.com/bayoutmasr/posts/1', source_type: 'post', source_id: 'post-1' },
    });
    await sendWa(t, { from: '201070000004', text: 'مرحبا عايز أسأل عن قضية إيجار قديم' });
    ids.google = (await okWebIntake(t, { phone: '01170000005', attribution: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'inheritance-q3' } })).reference;
    ids.googleRef = (await okWebIntake(t, { phone: '01170000006', attribution: { referrer: 'https://www.google.com/' } })).reference;
    ids.partner = (await okWebIntake(t, { phone: '01170000007', attribution: { ref: 'NGO-12' } })).reference;
    ids.direct = (await okWebIntake(t, { phone: '01170000008', attribution: {} })).reference;
    ids.fbWeb = (await okWebIntake(t, { phone: '01170000009', attribution: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'fb-web' } })).reference;
    admin = await t.login('admin');
  });
  after(async () => {
    await t.close();
  });

  async function byPhoneSuffix(suffix) {
    const l = await inbox(admin, '?scope=all');
    for (const x of l.items) {
      const d = await detail(admin, x.id);
      if (d.client.phone.endsWith(suffix)) return d;
    }
    throw new Error(`no intake for phone ending ${suffix}`);
  }

  test('Click-to-WhatsApp facebook ad => source facebook_ad, channel whatsapp; the ad id is retained', async () => {
    const d = await byPhoneSuffix('70000001');
    assert.equal(d.intake.source, 'facebook_ad');
    assert.equal(d.intake.first_channel, 'whatsapp');
    assert.ok(JSON.stringify({ c: d.intake.campaign, s: d.intake.source_detail }).includes('120200001'), 'ad id should be kept for attribution');
  });

  test('Click-to-WhatsApp instagram ad => source instagram_ad, channel whatsapp', async () => {
    const d = await byPhoneSuffix('70000002');
    assert.equal(d.intake.source, 'instagram_ad');
    assert.equal(d.intake.first_channel, 'whatsapp');
  });

  test('a non-ad referral (organic post) is not counted as a paid ad; plain WhatsApp has no ad source', async () => {
    const organic = await byPhoneSuffix('70000003');
    assert.ok(!['facebook_ad', 'instagram_ad', 'meta_ad'].includes(organic.intake.source), organic.intake.source);
    const plain = await byPhoneSuffix('70000004');
    assert.ok(!['facebook_ad', 'instagram_ad', 'meta_ad'].includes(plain.intake.source), plain.intake.source);
    assert.equal(plain.intake.first_channel, 'whatsapp');
  });

  test('website UTM/referrer => google / referral / direct, and facebook cpc via website is facebook_ad on channel website', async () => {
    const expect = { google: 'google', googleRef: 'google', partner: 'referral', direct: 'direct', fbWeb: 'facebook_ad' };
    for (const [k, src] of Object.entries(expect)) {
      const it = await intakeByCode(admin, ids[k]);
      assert.equal(it.source, src, `${k} should be ${src}`);
      assert.equal(it.first_channel, 'website', `${k} channel`);
    }
  });

  test('inbox filters by source and by channel independently; funnel groups differ by source vs channel', async () => {
    const fb = await inbox(admin, '?scope=all&source=facebook_ad');
    assert.equal(fb.total, 2);
    assert.deepEqual(fb.items.map((x) => x.first_channel).sort(), ['website', 'whatsapp']);
    const fbWeb = await inbox(admin, '?scope=all&source=facebook_ad&channel=website');
    assert.equal(fbWeb.total, 1);
    assert.equal(fbWeb.items[0].code, ids.fbWeb);
    const wa = await inbox(admin, '?scope=all&channel=whatsapp');
    assert.equal(wa.total, 4);

    const bySource = (await admin.get('/api/admin/analytics/funnel?group=source')).body;
    const byChannel = (await admin.get('/api/admin/analytics/funnel?group=channel')).body;
    const s = Object.fromEntries(bySource.items.map((x) => [x.key, x.intakes]));
    const c = Object.fromEntries(byChannel.items.map((x) => [x.key, x.intakes]));
    assert.equal(s.facebook_ad, 2);
    assert.equal(s.instagram_ad, 1);
    assert.equal(s.google, 2);
    assert.equal(c.whatsapp, 4);
    assert.equal(c.website, 5);
  });
});

describe('Req 3 — independent codes, counters and returning clients', () => {
  test('REQ-YYYY-NNNNN / CL-NNNNN / AREA-YYYY-NNNNN formats, sequential counters, and a returning client consumes no new client code', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      freezeClock('2026-06-15T09:00:00Z');
      const refs = [];
      for (const phone of ['01200000001', '01200000002', '01200000003']) refs.push((await okWebIntake(t, { phone })).reference);
      const nums = refs.map((r) => {
        const m = REQ_RE.exec(r);
        assert.ok(m, r);
        assert.equal(m[1], '2026');
        return Number(m[2]);
      });
      assert.deepEqual(nums, [nums[0], nums[0] + 1, nums[0] + 2], 'intake counter must increment by one');

      const admin = await t.login('admin');
      const items = await Promise.all(refs.map((r) => intakeByCode(admin, r)));
      const clientNums = items.map((x) => {
        const m = CL_RE.exec(x.client_code);
        assert.ok(m, x.client_code);
        return Number(m[1]);
      });
      assert.deepEqual(clientNums, [clientNums[0], clientNums[0] + 1, clientNums[0] + 2], 'client counter must increment by one');

      // same person again: new REQ number, same CL id
      const again = await okWebIntake(t, { phone: '01200000001', description: 'طلب جديد لنفس العميل بخصوص عقد بيع أرض زراعية بين الإخوة.' });
      assert.equal(Number(REQ_RE.exec(again.reference)[2]), nums[2] + 1);
      const againItem = await intakeByCode(admin, again.reference);
      assert.equal(againItem.client_code, items[0].client_code);

      const c1 = await convert(admin, items[0].id, { legal_area: 'INH' });
      const c2 = await convert(admin, items[1].id, { legal_area: 'INH' });
      const c3 = await convert(admin, items[2].id, { legal_area: 'FAM', title: 'نفقة صغار' });
      const m1 = /^INH-2026-(\d{5})$/.exec(c1.code);
      const m2 = /^INH-2026-(\d{5})$/.exec(c2.code);
      assert.ok(m1 && m2, `${c1.code} ${c2.code}`);
      assert.equal(Number(m2[1]), Number(m1[1]) + 1);
      assert.match(c3.code, /^FAM-2026-\d{5}$/);
      assert.equal(new Set([c1.code, c2.code, c3.code]).size, 3);
      // case keeps a link to the same client & intake
      const cd = (await admin.get(`/api/admin/cases/${c1.id}`)).body;
      assert.equal(cd.client.code, items[0].client_code);
      assert.equal(cd.intake.code, refs[0]);

      // the year segment follows the calendar year
      freezeClock('2027-02-01T09:00:00Z');
      const next = await okWebIntake(t, { phone: '01200000004' });
      assert.match(next.reference, /^REQ-2027-\d{5}$/);
      const admin2 = await t.login('admin');
      const nextItem = await intakeByCode(admin2, next.reference);
      assert.match(nextItem.client_code, CL_RE);
      const c4 = await convert(admin2, nextItem.id, { legal_area: 'INH' });
      assert.match(c4.code, /^INH-2027-\d{5}$/);
    } finally {
      resetClock();
      await t.close();
    }
  });

  test('while a case is open, new WhatsApp messages go into that case — no new inbox intake', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201077788899', text: 'والدتي توفيت وعايزين نعمل إعلام وراثة ونقسم البيت.' });
      const admin = await t.login('admin');
      const it = (await inbox(admin)).items[0];
      const c = await convert(admin, it.id);
      await sendWa(t, { from: '201077788899', text: 'نسيت أقول إن فيه أرض زراعية كمان في البلد.' });
      assert.equal((await inbox(admin)).total, 0, 'no new open intake while the case is open');
      // the case list (before opening the case) must flag the unread client message
      const cl = (await admin.get(`/api/admin/cases?q=${c.code}`)).body.items[0];
      assert.ok(cl.unread_count >= 1, 'case must show an unread client message');
      const cd = (await admin.get(`/api/admin/cases/${c.id}`)).body;
      assert.ok(cd.messages.some((m) => m.body.includes('أرض زراعية')), 'message must be in the case conversation');
      assert.equal(cd.messages.filter((m) => m.direction === 'in').length, 2);
    } finally {
      await t.close();
    }
  });

  test('returning client after the case is closed: same CL id, a NEW intake, then a second case for the same client', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201088899900', name: 'Samir', text: 'عايز أعرف إزاي أقسم ميراث والدي بين الإخوة.' });
      const admin = await t.login('admin');
      const first = (await inbox(admin)).items[0];
      const case1 = await convert(admin, first.id);
      const closed = await admin.post(`/api/admin/cases/${case1.id}/close`, { outcome: 'answered', note: 'تم الرد' });
      assert.equal(closed.status, 200, JSON.stringify(closed.body));

      await sendWa(t, { from: '201088899900', text: 'السلام عليكم، عندي مشكلة جديدة خالص في عقد إيجار المحل.' });
      const open = await inbox(admin);
      assert.equal(open.total, 1, 'a new intake must be opened for the returning client');
      const second = open.items[0];
      assert.notEqual(second.id, first.id);
      assert.notEqual(second.code, first.code);
      assert.equal(second.client_code, first.client_code, 'returning client keeps the same Client ID');
      assert.equal(second.returning_client, true);

      const case2 = await convert(admin, second.id, { legal_area: 'PRP', title: 'نزاع إيجار محل' });
      assert.notEqual(case2.code, case1.code);
      assert.match(case2.code, /^PRP-\d{4}-\d{5}$/);
      const cl = (await admin.get(`/api/admin/clients/${second.client_id}`)).body;
      assert.equal(cl.client.code, first.client_code);
      assert.equal(cl.intakes.length, 2);
      assert.deepEqual(cl.cases.map((c) => c.code).sort(), [case1.code, case2.code].sort());
      assert.equal((await admin.get('/api/admin/clients')).body.total, 1);
    } finally {
      await t.close();
    }
  });

  test('after an intake is handled internally or archived, the next message opens a new intake for the same client', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201099900011', text: 'ممكن أعرف مواعيد عمل الشهر العقاري؟' });
      const admin = await t.login('admin');
      const i1 = (await inbox(admin)).items[0];
      const h = await admin.post(`/api/admin/intakes/${i1.id}/handle-internally`, { resolution_note: 'تم الرد بمواعيد العمل', reply: 'مواعيد العمل من 9 إلى 2 ظهرًا.' });
      assert.equal(h.status, 200, JSON.stringify(h.body));

      await sendWa(t, { from: '201099900011', text: 'شكرًا، وعندي سؤال تاني عن توكيل عام.' });
      let open = await inbox(admin);
      assert.equal(open.total, 1);
      const i2 = open.items[0];
      assert.notEqual(i2.id, i1.id);
      assert.equal(i2.client_code, i1.client_code);

      const a = await admin.post(`/api/admin/intakes/${i2.id}/archive`, { reason: 'استفسار مكرر' });
      assert.equal(a.status, 200, JSON.stringify(a.body));
      await sendWa(t, { from: '201099900011', text: 'لو سمحت محتاج حد يرد عليا بخصوص التوكيل.' });
      open = await inbox(admin);
      assert.equal(open.total, 1);
      assert.ok(![i1.id, i2.id].includes(open.items[0].id));
      assert.equal(open.items[0].client_code, i1.client_code);
    } finally {
      await t.close();
    }
  });

  test('a client reply to an awaiting_client intake stays in the same intake and returns it to review', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201012121212', text: 'جوزي طلقني وعايزة أعرف حقوقي.' });
      const admin = await t.login('admin');
      const it = (await inbox(admin)).items[0];
      const r = await admin.post(`/api/admin/intakes/${it.id}/reply`, { body: 'برجاء إرسال تاريخ الطلاق وعدد الأطفال.', await_client: true });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal((await intakeByCode(admin, it.code)).status, 'awaiting_client');
      await sendWa(t, { from: '201012121212', text: 'الطلاق كان من شهرين وعندي طفلين.' });
      const list = await inbox(admin);
      assert.equal(list.total, 1);
      assert.equal(list.items[0].id, it.id);
      assert.equal(list.items[0].status, 'in_review');
      assert.equal(list.items[0].messages_count, 3);
    } finally {
      await t.close();
    }
  });

  test('quoting an OLD reference after its case was closed still surfaces the message in the open inbox (not buried in a closed file)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await okWebIntake(t, { phone: '01055500011' });
      const admin = await t.login('admin');
      const it = await intakeByCode(admin, web.reference);
      const c = await convert(admin, it.id);
      assert.equal((await admin.post(`/api/admin/cases/${c.id}/close`, { outcome: 'answered' })).status, 200);
      // the citizen re-uses the old prefilled wa.me text months later
      const prefilled = decodeURIComponent(web.whatsapp_url.split('text=')[1]);
      await sendWa(t, { from: '201055500011', text: `${prefilled} عندي مشكلة جديدة في الميراث` });
      const open = await inbox(admin);
      assert.equal(open.total, 1, 'returning client quoting an old reference must appear in the open inbox');
      assert.equal(open.items[0].client_code, it.client_code);
    } finally {
      await t.close();
    }
  });

  test('quoting the reference of an ARCHIVED intake still surfaces the message in the open inbox', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await okWebIntake(t, { phone: '01055500022' });
      const admin = await t.login('admin');
      const it = await intakeByCode(admin, web.reference);
      assert.equal((await admin.post(`/api/admin/intakes/${it.id}/archive`, { reason: 'لم يرد العميل' })).status, 200);
      await sendWa(t, { from: '201055500022', text: `رقم طلبي ${web.reference} وأنا آسف على التأخير، عايز أكمل.` });
      const open = await inbox(admin);
      assert.equal(open.total, 1, 'the message must be visible in the open inbox (new or reopened intake)');
      assert.equal(open.items[0].client_code, it.client_code);
    } finally {
      await t.close();
    }
  });
});
