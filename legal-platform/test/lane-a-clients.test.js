// Lane A — Clients: one independent Client ID across channels and time, identities, search,
// merging duplicates, resolving identity conflicts, and profile validation.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, waPayload } from './helpers.js';

const DESC = 'أخي يرفض تقسيم الميراث ويضع يده على الشقة، وأريد معرفة الإجراءات القانونية المتاحة.';

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
async function clientByPhone(admin, phone) {
  const r = await admin.get(`/api/admin/clients?q=${encodeURIComponent(phone)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1, `expected one client for ${phone}, got ${r.body.total}`);
  return r.body.items[0];
}
async function openInbox(admin) {
  return (await admin.get('/api/admin/intakes')).body;
}

describe('Client merge', () => {
  test('merging a duplicate (same person, second number) moves identities, intakes, cases and messages; later messages from either number reach the survivor', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201011100001', name: 'Mahmoud', text: DESC });
      const a = await clientByPhone(admin, '01011100001');
      const ai = (await openInbox(admin)).items[0];
      const kase = (await admin.post(`/api/admin/intakes/${ai.id}/convert`, { legal_area: 'INH', title: 'نزاع ميراث' })).body.case;

      const manual = await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01211100002', name: 'محمود حسن', text: 'اتصل من رقم آخر بخصوص نفس موضوع الميراث.' });
      assert.equal(manual.status, 201);
      const b = await clientByPhone(admin, '01211100002');
      assert.notEqual(a.id, b.id);
      assert.notEqual(a.code, b.code);

      const m = await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: b.id });
      assert.equal(m.status, 200, JSON.stringify(m.body));

      const list = (await admin.get('/api/admin/clients')).body;
      assert.equal(list.total, 1, 'the duplicate must disappear from the client list');
      assert.equal(list.items[0].code, a.code, 'the surviving Client ID is kept');

      const d = (await admin.get(`/api/admin/clients/${a.id}`)).body;
      assert.deepEqual(d.identities.filter((x) => x.kind === 'phone').map((x) => x.value).sort(), ['+201011100001', '+201211100002']);
      assert.equal(d.intakes.length, 2);
      assert.deepEqual(d.cases.map((c) => c.code), [kase.code]);
      assert.equal(d.client.name, 'Mahmoud', 'survivor keeps its own name');

      const old = await admin.get(`/api/admin/clients/${b.id}`);
      assert.ok(old.status === 404 || old.body.client.code === a.code, `the merged id must not show a separate client (${old.status})`);

      const mi = (await admin.get(`/api/admin/intakes/${manual.body.id}`)).body;
      assert.equal(mi.client.code, a.code, "the duplicate's intake now belongs to the survivor");

      await sendWa(t, { from: '201211100002', text: 'ده رقمي التاني، أنا محمود.' });
      await sendWa(t, { from: '201011100001', text: 'وأنا كمان من الرقم الأول.' });
      const after = await admin.get('/api/admin/clients');
      assert.equal(after.body.total, 1, 'no new client may be created for either number');
      for (const it of (await admin.get('/api/admin/intakes?scope=all')).body.items) assert.equal(it.client_code, a.code);
    } finally {
      await t.close();
    }
  });

  test('merge validation: self-merge 400, unknown 404, already-merged 409', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201011100011', text: 'أ' });
      await sendWa(t, { from: '201011100012', text: 'ب' });
      const a = await clientByPhone(admin, '01011100011');
      const b = await clientByPhone(admin, '01011100012');
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: a.id })).status, 400);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: 9999 })).status, 404);
      assert.equal((await admin.post(`/api/admin/clients/9999/merge`, { other_client_id: b.id })).status, 404);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, {})).status, 400);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: b.id })).status, 200);
      // دمج نفس العميلين مرة ثانية: تعارض واضح «مدموجان بالفعل»
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: b.id })).status, 409);
    } finally {
      await t.close();
    }
  });

  test('a reverse merge after a merge is refused cleanly and never corrupts either record', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201011100021', text: 'عميل أ' });
      await sendWa(t, { from: '201011100022', text: 'عميل ب' });
      const a = await clientByPhone(admin, '01011100021');
      const b = await clientByPhone(admin, '01011100022');
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/merge`, { other_client_id: b.id })).status, 200);

      // a second staff member, looking at the stale duplicate, merges "the other way"
      const rev = await admin.post(`/api/admin/clients/${b.id}/merge`, { other_client_id: a.id });
      const g = await admin.get(`/api/admin/clients/${a.id}`);
      const list = await admin.get('/api/admin/clients');
      const w = await t.client().post('/webhooks/whatsapp', waPayload({ from: '201011100022', text: 'رسالة جديدة بعد الدمج' }));
      const intakes = (await admin.get('/api/admin/intakes?scope=all')).body;
      assert.deepEqual(
        {
          reverse_merge_refused_with_4xx: rev.status >= 400 && rev.status < 500,
          survivor_readable: g.status === 200 && g.body.client?.code === a.code,
          client_list_ok: list.status === 200 && list.body.total === 1,
          inbound_whatsapp_processed: w.status === 200 && !w.body.failed,
          message_stored: (intakes.items || []).some((x) => x.last_message === 'رسالة جديدة بعد الدمج'),
        },
        { reverse_merge_refused_with_4xx: true, survivor_readable: true, client_list_ok: true, inbound_whatsapp_processed: true, message_stored: true },
        `reverse merge -> ${rev.status}; GET survivor -> ${g.status}; webhook -> ${JSON.stringify(w.body)}`,
      );
    } finally {
      await t.close();
    }
  });
});

describe('Identity conflicts and identities', () => {
  test('after the privacy alert, staff verify the stranger and link the new intake to the original client (link-client)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await webIntake(t, { phone: '01033300001', name: 'رشا' });
      await sendWa(t, { from: '201033300002', name: 'Rasha 2', text: `ده رقم جوزي، رقم طلبي ${web.reference}` });
      const admin = await t.login('admin');
      const items = (await openInbox(admin)).items;
      assert.equal(items.length, 2, 'not auto-merged');
      const original = items.find((x) => x.code === web.reference);
      const stranger = items.find((x) => x.code !== web.reference);
      assert.notEqual(stranger.client_id, original.client_id);

      assert.equal((await admin.post(`/api/admin/intakes/${stranger.id}/link-client`, {})).status, 400);
      assert.equal((await admin.post(`/api/admin/intakes/${stranger.id}/link-client`, { client_id: 99999 })).status, 404);
      const linked = await admin.post(`/api/admin/intakes/${stranger.id}/link-client`, { client_id: original.client_id });
      assert.equal(linked.status, 200, JSON.stringify(linked.body));
      const again = await admin.post(`/api/admin/intakes/${stranger.id}/link-client`, { client_id: original.client_id });
      assert.equal(again.status, 200, 'linking twice is harmless');

      const d = (await admin.get(`/api/admin/intakes/${stranger.id}`)).body;
      assert.equal(d.client.code, original.client_code);
      const phones = d.client.identities.filter((x) => x.kind === 'phone').map((x) => x.value).sort();
      assert.deepEqual(phones, ['+201033300001', '+201033300002']);
      assert.equal((await admin.get('/api/admin/clients')).body.total, 1);
      assert.equal(d.client.name, 'رشا', 'the verified client keeps her name');
    } finally {
      await t.close();
    }
  });

  test("adding a phone owned by another client is refused (409, pointing to that client); a new phone routes that number's WhatsApp to the client", async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const admin = await t.login('admin');
      await sendWa(t, { from: '201044400001', text: DESC });
      await sendWa(t, { from: '201044400002', text: 'عميل آخر تمامًا' });
      const a = await clientByPhone(admin, '01044400001');
      const b = await clientByPhone(admin, '01044400002');

      const clash = await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'phone', value: '01044400002' });
      assert.equal(clash.status, 409, JSON.stringify(clash.body));
      assert.equal(clash.body.details?.client_code, b.code);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'fax', value: '123' })).status, 400);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'phone', value: 'not a phone' })).status, 400);
      assert.equal((await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'email', value: 'bad@' })).status, 400);

      const add = await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'phone', value: '01277788899' });
      assert.equal(add.status, 200, JSON.stringify(add.body));
      assert.ok(add.body.some((x) => x.value === '+201277788899'));
      const mail = await admin.post(`/api/admin/clients/${a.id}/identities`, { kind: 'email', value: 'A.Client@Example.com' });
      assert.equal(mail.status, 200);
      assert.ok(mail.body.some((x) => x.kind === 'email' && x.value === 'a.client@example.com'));

      await sendWa(t, { from: '201277788899', text: 'ده رقمي الجديد' });
      assert.equal((await admin.get('/api/admin/clients')).body.total, 2, 'no client is created for the newly linked number');
      const ai = (await admin.get(`/api/admin/clients/${a.id}`)).body;
      assert.equal(ai.intakes.length, 1, 'the message joins the open intake of the same client');
      const idet = (await admin.get(`/api/admin/intakes/${ai.intakes[0].id}`)).body;
      assert.ok(idet.messages.some((m) => m.body === 'ده رقمي الجديد'));
      const bi = (await admin.get(`/api/admin/clients/${b.id}`)).body;
      assert.equal(bi.identities.length, 1, "the other client's identities are untouched");
    } finally {
      await t.close();
    }
  });
});

describe('Client directory and profile', () => {
  test('search finds a client by code, name and any phone format', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await webIntake(t, { phone: '01011112222', name: 'عبد الرحمن الشربيني' });
      await webIntake(t, { phone: '01099998888', name: 'سارة يوسف' });
      const admin = await t.login('admin');
      const target = await clientByPhone(admin, '01011112222');
      for (const q of [target.code, 'الشربيني', '01011112222', '+201011112222', '201011112222', '1011112222', '٠١٠١١١١٢٢٢٢']) {
        const r = await admin.get(`/api/admin/clients?q=${encodeURIComponent(q)}`);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.items.map((x) => x.code), [target.code], `search "${q}"`);
      }
      assert.equal((await admin.get(`/api/admin/clients?q=${encodeURIComponent('لا يوجد أحد بهذا الاسم')}`)).body.total, 0);
    } finally {
      await t.close();
    }
  });

  test('searching a full phone number returns only the client with that exact number (no partial-digit false matches)', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201012345678', name: 'Target', text: 'مرحبا' });
      await sendWa(t, { from: '201234567890', name: 'Other person', text: 'مرحبا' });
      const admin = await t.login('admin');
      for (const q of ['01012345678', '+201012345678']) {
        const r = (await admin.get(`/api/admin/clients?q=${encodeURIComponent(q)}`)).body;
        assert.deepEqual(r.items.map((c) => c.phone), ['+201012345678'], `search "${q}" must not return a different person's record`);
      }
      const other = (await admin.get(`/api/admin/clients?q=${encodeURIComponent('01234567890')}`)).body;
      assert.deepEqual(other.items.map((c) => c.phone), ['+201234567890']);
    } finally {
      await t.close();
    }
  });

  test('profile edits: national id is validated (14 digits starting with 2/3, Arabic digits accepted) and staff-set names are not overwritten by WhatsApp profile names', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      await sendWa(t, { from: '201055500001', name: 'Nickname', text: DESC });
      const admin = await t.login('admin');
      const c = await clientByPhone(admin, '01055500001');
      assert.equal(c.name, 'Nickname');
      for (const bad of ['12345', '12345678901234', '4900101012345A', '290010101234567']) {
        const r = await admin.patch(`/api/admin/clients/${c.id}`, { national_id: bad });
        assert.equal(r.status, 400, `national id ${bad}`);
      }
      const ok = await admin.patch(`/api/admin/clients/${c.id}`, { national_id: '٢٩٠٠١٠١٠١٢٣٤٥٦', name: 'أحمد محمد علي', governorate: 'القاهرة' });
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.national_id, '29001010123456');
      assert.equal(ok.body.code, c.code, 'the Client ID never changes on edit');

      await sendWa(t, { from: '201055500001', name: 'Another Nick', text: 'متابعة' });
      const d = (await admin.get(`/api/admin/clients/${c.id}`)).body;
      assert.equal(d.client.name, 'أحمد محمد علي');
      assert.equal(d.client.national_id, '29001010123456');
      assert.equal((await admin.patch(`/api/admin/clients/${c.id}`, { email: 'nope' })).status, 400);
      assert.equal((await admin.get('/api/admin/clients/424242')).status, 404);
    } finally {
      await t.close();
    }
  });

  test('a client profile shows every intake, case and channel over time under one Client ID', async () => {
    const t = await startTestApp({ seed: 'none' });
    try {
      const web = await webIntake(t, { phone: '01066600001', name: 'منيرة' });
      const admin = await t.login('admin');
      const first = (await openInbox(admin)).items[0];
      assert.equal(first.code, web.reference);
      const c1 = (await admin.post(`/api/admin/intakes/${first.id}/convert`, { legal_area: 'INH', title: 'ميراث' })).body.case;
      assert.equal((await admin.post(`/api/admin/cases/${c1.id}/close`, { outcome: 'answered' })).status, 200);
      await sendWa(t, { from: '201066600001', text: 'رجعت تاني بمشكلة إيجار' });
      const second = (await openInbox(admin)).items[0];
      const c2 = (await admin.post(`/api/admin/intakes/${second.id}/convert`, { legal_area: 'PRP', title: 'إيجار' })).body.case;

      const d = (await admin.get(`/api/admin/clients/${first.client_id}`)).body;
      assert.equal(d.client.code, first.client_code);
      assert.deepEqual(d.intakes.map((i) => i.code).sort(), [web.reference, second.code].sort());
      assert.deepEqual(d.intakes.map((i) => i.first_channel).sort(), ['website', 'whatsapp']);
      assert.deepEqual(d.cases.map((x) => x.code).sort(), [c1.code, c2.code].sort());
      const closed = d.cases.find((x) => x.code === c1.code);
      assert.equal(closed.status, 'closed');
      const list = (await admin.get('/api/admin/clients')).body.items[0];
      assert.equal(list.cases_count, 2);
      assert.equal(list.open_cases_count, 1);
      assert.equal(list.intakes_count, 2);
    } finally {
      await t.close();
    }
  });
});
