// وحدة الحسابات والأمان (الإصدار 9): الدعوات، إعادة التعيين، كلمات المرور المؤقتة، التحقق بخطوتين (TOTP)،
// الإيقاف المؤقت وحدود المحاولات، مهلة عدم النشاط، الجلسات، سجل الأمان وصلاحياته، ومُرمِّز QR.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestApp, freezeClock, resetClock } from './helpers.js';
import { ok, createLawyer, newCase } from './lane-b-kit.test.js';
import { base32Encode, base32Decode, hotp, totp, verifyTotp, otpauthUri, normalizeRecoveryCode, hashRecoveryCode, verifyRecoveryCode, newRecoveryCode } from '../src/totp.js';
import { passwordProblem, describeUserAgent } from '../src/auth.js';
import { encodeQr, formatBits, versionBits } from '../public/assets/js/app/components/qr.js';

const STRONG = 'Strong#2026x';
const tokenOf = (url) => {
  const m = /#\/(?:invite|reset)\/([A-Za-z0-9_-]+)$/.exec(url || '');
  assert.ok(m, `no token in ${url}`);
  return m[1];
};
/** رمز TOTP لسر Base32 عند لحظة معينة */
const codeAt = (secretB32, ms) => totp(base32Decode(secretB32), ms);

// ───────────────────────── TOTP / Base32 / رموز الاسترداد ─────────────────────────
describe('accounts: TOTP primitives (RFC 4648 / RFC 4226 / RFC 6238)', () => {
  test('Base32 encode/decode matches RFC 4648 test vectors (unpadded)', () => {
    const vectors = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
    for (const [plain, enc] of vectors) {
      assert.equal(base32Encode(Buffer.from(plain)), enc);
      assert.equal(base32Decode(enc).toString(), plain);
      assert.equal(base32Decode(`${enc.toLowerCase()}====`).toString(), plain, 'case-insensitive, padding ignored');
    }
    assert.throws(() => base32Decode('MZ1W'), /invalid base32/);
  });

  test('HOTP matches the RFC 4226 appendix D values', () => {
    const secret = Buffer.from('12345678901234567890');
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => assert.equal(hotp(secret, counter), code));
  });

  test('TOTP matches RFC 6238 SHA1 vectors (8 digits, and the same vectors truncated to 6 digits)', () => {
    const secret = Buffer.from('12345678901234567890');
    const vectors = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, code8] of vectors) {
      assert.equal(totp(secret, seconds * 1000, 8), code8, `8 digits at T=${seconds}`);
      assert.equal(totp(secret, seconds * 1000), code8.slice(-6), `6 digits at T=${seconds}`);
    }
  });

  test('verification accepts ±1 step, rejects ±2 steps, malformed input and replayed steps', () => {
    const secret = Buffer.from('12345678901234567890');
    const t = 1111111111 * 1000;
    const step = Math.floor(t / 30000);
    assert.equal(verifyTotp(secret, totp(secret, t), { ms: t }), step);
    assert.equal(verifyTotp(secret, totp(secret, t - 30000), { ms: t }), step - 1, 'previous step accepted (clock skew)');
    assert.equal(verifyTotp(secret, totp(secret, t + 30000), { ms: t }), step + 1, 'next step accepted (clock skew)');
    assert.equal(verifyTotp(secret, totp(secret, t - 60000), { ms: t }), null, 'two steps old is rejected');
    assert.equal(verifyTotp(secret, totp(secret, t + 60000), { ms: t }), null);
    assert.equal(verifyTotp(secret, '12345', { ms: t }), null);
    assert.equal(verifyTotp(secret, 'abcdef', { ms: t }), null);
    assert.equal(verifyTotp(secret, `${totp(secret, t).slice(0, 3)} ${totp(secret, t).slice(3)}`, { ms: t }), step, 'spaces tolerated');
    assert.equal(verifyTotp(secret, totp(secret, t), { ms: t, afterStep: step }), null, 'the same step cannot be used twice');
  });

  test('otpauth URI and recovery codes', () => {
    const uri = otpauthUri({ secretB32: 'JBSWY3DPEHPK3PXP', account: 'admin', issuer: 'Beyoot Misr' });
    assert.equal(uri, 'otpauth://totp/Beyoot%20Misr:admin?secret=JBSWY3DPEHPK3PXP&issuer=Beyoot%20Misr&algorithm=SHA1&digits=6&period=30');
    const code = newRecoveryCode();
    assert.match(code, /^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
    const stored = hashRecoveryCode(code);
    assert.ok(!stored.includes(code.replace('-', '')), 'only a hash is stored');
    assert.ok(verifyRecoveryCode(code.toUpperCase().replace('-', ' '), stored), 'case and separators tolerated');
    assert.ok(!verifyRecoveryCode(newRecoveryCode(), stored));
    assert.equal(normalizeRecoveryCode('ABCDE-FGHJK'), 'abcdefghjk');
    assert.equal(normalizeRecoveryCode('short'), null);
  });

  test('password strength rules', () => {
    assert.match(passwordProblem('short1'), /8 أحرف/);
    assert.match(passwordProblem('onlyletters'), /الحروف والأرقام/);
    assert.match(passwordProblem('1234567890'), /الحروف والأرقام/);
    assert.match(passwordProblem('Password1'), /شائعة/);
    assert.match(passwordProblem('aaaa1111'), /تتكرر/);
    assert.match(passwordProblem('mona.saeed2026', { username: 'mona.saeed' }), /اسم المستخدم/);
    assert.equal(passwordProblem(STRONG), null);
    assert.equal(passwordProblem('Admin@2026'), null, 'existing demo passwords stay valid');
    assert.equal(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1').label, 'Safari على iPhone');
  });
});

// ───────────────────────── مُرمِّز QR ─────────────────────────
// مُفكك مستقل للاختبار: يقرأ معلومات الصيغة، يزيل القناع، يجمع الكلمات بالترتيب المتعرج، يفك التشبيك،
// يتحقق من متلازمات ريد-سولومون لكل كتلة (يجب أن تكون صفرًا)، ثم يفسر وضع البايت ويعيد النص.
const QR_M = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]] };
const QR_ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const GF_EXP = [];
const GF_LOG = [];
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
}
const gmul = (a, b) => (a && b ? GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255] : 0);

function decodeQr(m) {
  const size = m.length;
  const version = (size - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 10, 'size matches a version');
  // أنماط البحث
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
      assert.equal(m[oy + y][ox + x], d !== 2, `finder at ${ox},${oy}`);
    }
  }
  // أنماط التوقيت والوحدة الداكنة
  for (let i = 8; i < size - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, 'horizontal timing');
    assert.equal(m[i][6], i % 2 === 0, 'vertical timing');
  }
  assert.equal(m[size - 8][8], true, 'dark module');
  // معلومات الصيغة (نسختان متطابقتان وBCH صحيح)
  const pos1 = [];
  for (let i = 0; i <= 5; i++) pos1.push([8, i]);
  pos1.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) pos1.push([14 - i, 8]);
  const pos2 = [];
  for (let i = 0; i < 8; i++) pos2.push([size - 1 - i, 8]);
  for (let i = 8; i < 15; i++) pos2.push([8, size - 15 + i]);
  const read = (pos) => pos.reduce((acc, [x, y], i) => acc | ((m[y][x] ? 1 : 0) << i), 0);
  const f1 = read(pos1);
  assert.equal(f1, read(pos2), 'both format copies agree');
  const fmt = f1 ^ 0x5412;
  const data5 = fmt >>> 10;
  let rem = data5;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  assert.equal(((data5 << 10) | (rem & 0x3ff)), fmt, 'format BCH code valid');
  assert.equal(data5 >>> 3, 0, 'error correction level M');
  const mask = data5 & 7;
  // معلومات الإصدار
  if (version >= 7) {
    let v = 0;
    for (let i = 0; i < 18; i++) if (m[Math.floor(i / 3)][size - 11 + (i % 3)]) v |= 1 << i;
    assert.equal(v >>> 12, version, 'version info encodes the version');
    let r = version;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    assert.equal(v, (version << 12) | (r & 0xfff), 'version BCH code valid');
  }
  // خريطة الوحدات الوظيفية
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x0, y0, w, hgt) => { for (let y = y0; y < y0 + hgt; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true; };
  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  const al = QR_ALIGN[version];
  for (const ax of al) for (const ay of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
    mark(ax - 2, ay - 2, 5, 5);
  }
  if (version >= 7) {
    mark(size - 11, 0, 3, 6);
    mark(0, size - 11, 6, 3);
  }
  const MASK = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][mask];
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x]) bits.push(m[y][x] !== MASK(x, y) ? 1 : 0);
      }
    }
  }
  const [ecLen, groups] = QR_M[version];
  const blocks = groups.flatMap(([n, k]) => Array.from({ length: n }, () => ({ k, data: [], ecc: [] })));
  const total = blocks.reduce((s, b) => s + b.k + ecLen, 0);
  const cw = [];
  for (let i = 0; i < total; i++) cw.push(bits.slice(i * 8, i * 8 + 8).reduce((a, b) => (a << 1) | b, 0));
  let p = 0;
  const maxK = Math.max(...blocks.map((b) => b.k));
  for (let i = 0; i < maxK; i++) for (const b of blocks) if (i < b.k) b.data.push(cw[p++]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) b.ecc.push(cw[p++]);
  for (const b of blocks) {
    const poly = [...b.data, ...b.ecc];
    for (let i = 0; i < ecLen; i++) {
      const alpha = GF_EXP[i];
      let s = 0;
      for (const c of poly) s = gmul(s, alpha) ^ c;
      assert.equal(s, 0, `Reed-Solomon syndrome S${i} must be zero`);
    }
  }
  const data = blocks.flatMap((b) => b.data);
  const dbits = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  let q = 0;
  const take = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | dbits[q++]; return v; };
  assert.equal(take(4), 0b0100, 'byte mode');
  const len = take(version <= 9 ? 8 : 16);
  const bytes = Array.from({ length: len }, () => take(8));
  return { version, mask, text: new TextDecoder().decode(Uint8Array.from(bytes)) };
}

describe('accounts: QR encoder (byte mode, ECC M, versions 1–10)', () => {
  test('matches reference matrices produced by an independent QR library', () => {
    // مصفوفات مرجعية (SHA-256 لصفوف المصفوفة بلا هامش) من مكتبة qrcode المرجعية بالإصدار والقناع نفسيهما
    const vectors = [
      ['otpauth://totp/Beyoot%20Misr:admin?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Beyoot%20Misr&algorithm=SHA1&digits=6&period=30', 8, 5, '7d73db6ae2ea845c80a884016ad1d626f0885ca1f5e37129aa90233ca49cb4c4'],
      ['مؤسسة بيوت مصر لدعم الأرامل والأيتام', 5, 0, 'bdcf5374c9b89aafeab0feee3d2fd115c23f67d8e36ef966f3b62441254bf102'],
      ['z'.repeat(213), 10, 7, '253da557eea8cedaf26e8a042c46688716a06331417decfd6bb98da9637e5220'],
    ];
    for (const [text, version, mask, sha] of vectors) {
      const q = encodeQr(text, { mask });
      assert.equal(q.version, version);
      const rows = q.modules.map((r) => r.map((b) => (b ? '1' : '0')).join('')).join('\n');
      assert.equal(crypto.createHash('sha256').update(rows).digest('hex'), sha, `reference matrix for v${version} mask ${mask}`);
    }
    const small = encodeQr('BM', { mask: 2 });
    assert.deepEqual(
      small.modules.map((r) => r.map((b) => (b ? 1 : 0)).join('')),
      ['111111100111101111111', '100000100000001000001', '101110101110101011101', '101110101010101011101', '101110101101101011101', '100000101010101000001', '111111101010101111111', '000000001001100000000', '101111100110101111100', '111011000000100101000', '011011111001010011110', '011010011100000110101', '110011110111010010100', '000000001011111001000', '111111100100101100010', '100000101001111001001', '101110101010100100100', '101110101100100100100', '101110101111010011100', '100000100110000110100', '111111101011010011110'],
    );
  });

  test('every version 1–10 and every mask round-trips through an independent decoder', () => {
    const lengths = [1, 14, 15, 26, 42, 62, 84, 106, 122, 152, 180, 213];
    for (const n of lengths) {
      const text = `otpauth://totp/x?secret=${'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.repeat(8)}`.slice(0, n);
      for (const mask of [null, 0, 3, 6]) {
        const q = encodeQr(text, mask === null ? {} : { mask });
        const d = decodeQr(q.modules);
        assert.equal(d.text, text);
        assert.equal(d.version, q.version);
        if (mask !== null) assert.equal(d.mask, mask);
      }
    }
    const arabic = 'السلام عليكم — رمز التحقق';
    assert.equal(decodeQr(encodeQr(arabic).modules).text, arabic, 'UTF-8 byte mode');
    assert.equal(encodeQr('x'.repeat(14)).version, 1);
    assert.equal(encodeQr('x'.repeat(15)).version, 2);
    assert.equal(encodeQr('x'.repeat(213)).version, 10);
    assert.throws(() => encodeQr('x'.repeat(214)), RangeError);
  });

  test('format and version BCH words match ISO 18004 tables', () => {
    // جدول معلومات الصيغة للمستوى M (الأقنعة 0..7)
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(formatBits), [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0]);
    assert.equal(versionBits(7), 0x07c94);
    assert.equal(versionBits(10), 0x0a4d3);
  });
});

// ───────────────────────── الدعوات ─────────────────────────
describe('accounts: invites', () => {
  let t;
  let admin;
  let manager;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mgr', name: 'مديرة الحالات', password: 'Manager@2026' }), 201);
    manager = await t.login('mgr', 'Manager@2026');
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  test('creating a lawyer without a password issues a one-time invite (72h) with a WhatsApp link; only admins may do it', async () => {
    const body = { username: 'nour', name: 'نور الهدى', specialties: ['FAM'], agreement: { type: 'pro_bono' }, phone: '01001234567' };
    assert.equal((await manager.post('/api/admin/lawyers', body)).status, 403, 'case managers cannot create lawyers');
    const created = ok(await admin.post('/api/admin/lawyers', body), 201);
    assert.equal(created.invite_pending, true);
    const inv = created.invite;
    assert.equal(inv.kind, 'invite');
    assert.equal(inv.valid_hours, 72);
    assert.ok(Math.abs(Date.parse(inv.expires_at) - Date.now() - 72 * 3600000) < 60000);
    assert.match(inv.url, /\/app#\/invite\/[A-Za-z0-9_-]{40,}$/);
    assert.match(inv.whatsapp_url, /^https:\/\/wa\.me\/201001234567\?text=/);
    assert.match(decodeURIComponent(inv.whatsapp_url.split('text=')[1]), /أ\. نور الهدى/);
    assert.ok(inv.message.includes(inv.url) && inv.message.includes('nour'));
    const token = tokenOf(inv.url);
    // الرمز لا يُخزن كما هو
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM account_tokens WHERE token_hash = ?', token), 0);
    // لا يمكن الدخول قبل قبول الدعوة، ولا يُقترح للإسناد
    assert.equal((await t.client().post('/api/auth/login', { username: 'nour', password: '' })).status, 401);
    const sugg = ok(await admin.get('/api/admin/lawyers/suggest?area=FAM'));
    assert.ok(!sugg.some((l) => l.id === created.id), 'invite-pending lawyers are not suggested for assignments');
    // ولا يُسند إليه يدويًا: لا يستطيع الدخول ليرى الإسناد وتسري مدته
    const kase = await newCase(admin, { legal_area: 'FAM' });
    const blockedAssign = await admin.post(`/api/admin/cases/${kase.id}/assignments`, { lawyer_id: created.id, role: 'lead' });
    assert.equal(blockedAssign.status, 409);
    assert.match(blockedAssign.body.error, /لم يفعّل هذا المحامي حسابه/);
    const list = ok(await admin.get('/api/admin/lawyers'));
    assert.equal((list.items || list).find((l) => l.id === created.id).invite_pending, true);

    // فحص الرابط بدون دخول
    const anon = t.client();
    const info = ok(await anon.post('/api/auth/link', { token }));
    assert.equal(info.kind, 'invite');
    assert.equal(info.user.username, 'nour');
    assert.ok(!JSON.stringify(info).includes('01001234567'), 'the link check does not reveal contact data');

    // القبول: تأكيد الاسم + كلمة مرور قوية ومتطابقة
    assert.equal((await anon.post('/api/auth/invite/accept', { token, name: 'نور الهدى سامي', password: 'weakpass', password_confirm: 'weakpass' })).status, 400);
    const mismatch = await anon.post('/api/auth/invite/accept', { token, name: 'نور الهدى سامي', password: STRONG, password_confirm: `${STRONG}!` });
    assert.equal(mismatch.status, 400);
    assert.ok(mismatch.body.details.fields.password_confirm);
    // التعهد بالسرية شرط على الخادم (لا يكفي التحقق في الواجهة)
    const noPledge = await anon.post('/api/auth/invite/accept', { token, name: 'نور الهدى سامي', password: STRONG, password_confirm: STRONG });
    assert.equal(noPledge.status, 400);
    assert.ok(noPledge.body.details.fields.pledge, 'the confidentiality pledge is required server-side');
    assert.equal((await anon.post('/api/auth/invite/accept', { token, name: 'نور الهدى سامي', password: STRONG, password_confirm: STRONG, pledge: 'yes' })).status, 400, 'only an explicit true counts');
    const accepted = ok(await anon.post('/api/auth/invite/accept', { token, name: 'نور الهدى سامي', password: STRONG, password_confirm: STRONG, pledge: true }));
    assert.ok(ok(await anon.get('/api/account')).user.confidentiality_pledged_at, 'the pledge time is recorded');
    assert.ok(ok(await admin.get(`/api/admin/accounts/${created.id}`)).confidentiality_pledged_at);
    assert.equal(accepted.user.username, 'nour');
    assert.equal(accepted.user.name, 'نور الهدى سامي');
    assert.equal(ok(await anon.get('/api/auth/me')).user.role, 'lawyer', 'accepting signs the user in');
    assert.equal((await anon.get('/api/lawyer/dashboard')).status, 200);
    ok(await admin.post(`/api/admin/cases/${kase.id}/assignments`, { lawyer_id: created.id, role: 'lead' }), 201, 'assignable once activated');

    // استخدام واحد فقط
    const again = await t.client().post('/api/auth/invite/accept', { token, name: 'x x x', password: STRONG, password_confirm: STRONG, pledge: true });
    assert.equal(again.status, 410);
    assert.equal(again.body.code, 'link_used');
    assert.equal((await t.client().post('/api/auth/link', { token })).status, 410);
    ok(await t.client().post('/api/auth/login', { username: 'nour', password: STRONG }));

    const types = ok(await admin.get('/api/admin/audit?q=nour')).items.map((e) => e.type);
    for (const ty of ['user.created', 'account.invite_created', 'account.invite_accepted']) assert.ok(types.includes(ty), `audit has ${ty}`);
    const notes = ok(await admin.get('/api/notifications')).items;
    assert.ok(notes.some((n) => n.title.includes('فعّل') && n.link === `#/lawyers/${created.id}`), 'the inviting admin is notified');
  });

  test('staff invites: expiry, resend (old link revoked), revoke, and pending list', async () => {
    const created = ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'youssef', name: 'يوسف كمال' }), 201);
    assert.ok(created.invite);
    const first = tokenOf(created.invite.url);
    let pending = ok(await admin.get('/api/admin/accounts/invites')).items;
    assert.equal(pending.find((x) => x.username === 'youssef').invite.status, 'active');

    // انتهاء الصلاحية (الجلسات الحالية تنتهي أيضًا بمهلة عدم النشاط، فنقرأ الحالة من الخدمة مباشرة)
    freezeClock(new Date(Date.now() + 73 * 3600000).toISOString());
    const expired = await t.client().post('/api/auth/link', { token: first });
    assert.equal(expired.status, 410);
    assert.equal(expired.body.code, 'link_expired');
    pending = t.app.accounts.pendingInvites();
    assert.equal(pending.find((x) => x.username === 'youssef').invite.status, 'expired');
    resetClock();

    // إعادة الإصدار تلغي الرابط السابق
    admin = await t.login('admin');
    manager = await t.login('mgr', 'Manager@2026');
    const resent = ok(await admin.post(`/api/admin/accounts/${created.id}/invite`));
    const second = tokenOf(resent.url);
    assert.notEqual(second, first);
    assert.match(resent.whatsapp_url, /^https:\/\/wa\.me\/\?text=/, 'no phone known → WhatsApp contact picker');
    assert.equal((await t.client().post('/api/auth/link', { token: first })).body.code, 'link_revoked');
    assert.equal(ok(await t.client().post('/api/auth/link', { token: second })).user.username, 'youssef');

    // الإلغاء
    assert.equal((await manager.post(`/api/admin/accounts/${created.id}/invite/revoke`)).status, 403);
    const summary = ok(await admin.post(`/api/admin/accounts/${created.id}/invite/revoke`));
    assert.equal(summary.invite.status, 'revoked');
    assert.equal((await t.client().post('/api/auth/invite/accept', { token: second, name: 'يوسف كمال', password: STRONG, password_confirm: STRONG, pledge: true })).body.code, 'link_revoked');
    assert.equal((await admin.post(`/api/admin/accounts/${created.id}/invite/revoke`)).status, 409, 'nothing left to revoke');
    // لا يمكن إصدار رابط إعادة تعيين لحساب لم يُفعَّل
    assert.equal((await admin.post(`/api/admin/accounts/${created.id}/reset-link`)).status, 409);
    const types = ok(await admin.get(`/api/admin/audit?user_id=${created.id}`)).items.map((e) => e.type);
    assert.ok(types.includes('account.invite_resent') && types.includes('account.invite_revoked'));
  });

  test('invalid tokens are rejected without leaking anything', async () => {
    const c = t.client();
    for (const token of ['', 'short', 'x'.repeat(300), 'A'.repeat(43)]) {
      const r = await c.post('/api/auth/link', { token });
      assert.equal(r.status, 404);
      assert.equal(r.body.code, 'link_invalid');
    }
  });
});

// ───────────────────────── إعادة التعيين وكلمة المرور المؤقتة وتغيير كلمة المرور ─────────────────────────
describe('accounts: reset links, temporary passwords and password change', () => {
  let t;
  let admin;
  let lawyer;
  let L;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    L = await createLawyer(admin, { username: 'ahmed1' });
    lawyer = await t.login('ahmed1', 'Lawyer@2026');
  });
  after(async () => t.close());

  test('admin reset link: one-time, revokes every session, then the new password works', async () => {
    const other = await t.login('ahmed1', 'Lawyer@2026');
    assert.equal((await lawyer.get('/api/admin/accounts')).status, 403);
    const link = ok(await admin.post(`/api/admin/accounts/${L.id}/reset-link`));
    assert.equal(link.kind, 'reset');
    assert.equal(link.valid_hours, 24);
    const token = tokenOf(link.url);
    assert.equal(ok(await admin.get(`/api/admin/accounts/${L.id}`)).reset_link.status, 'active');
    const c = t.client();
    assert.equal(ok(await c.post('/api/auth/link', { token })).kind, 'reset');
    assert.equal((await c.post('/api/auth/invite/accept', { token, name: 'xxx', password: STRONG, password_confirm: STRONG, pledge: true })).status, 404, 'a reset link is not an invite');
    const r = ok(await c.post('/api/auth/reset', { token, password: STRONG, password_confirm: STRONG }));
    assert.equal(r.username, 'ahmed1');
    assert.equal((await lawyer.get('/api/lawyer/dashboard')).status, 401, 'old sessions revoked');
    assert.equal((await other.get('/api/lawyer/dashboard')).status, 401);
    assert.equal((await t.client().post('/api/auth/login', { username: 'ahmed1', password: 'Lawyer@2026' })).status, 401);
    lawyer = await t.login('ahmed1', STRONG);
    assert.equal((await c.post('/api/auth/reset', { token, password: 'Another#2027', password_confirm: 'Another#2027' })).body.code, 'link_used');
    const ev = ok(await admin.get(`/api/admin/audit?user_id=${L.id}&type=account`)).items.map((e) => e.type);
    assert.ok(ev.includes('account.password_reset_link') && ev.includes('account.password_reset'));
  });

  test('temporary password forces a change on next login; until then only account routes work', async () => {
    assert.equal((await admin.post(`/api/admin/accounts/${L.id}/temp-password`, { password: 'short' })).status, 400);
    ok(await admin.post(`/api/admin/accounts/${L.id}/temp-password`, { password: 'Temp#2026pass' }));
    assert.equal((await lawyer.get('/api/lawyer/dashboard')).status, 401, 'sessions revoked');
    const c = t.client();
    const login = ok(await c.post('/api/auth/login', { username: 'ahmed1', password: 'Temp#2026pass' }));
    assert.equal(login.user.restricted, 'password_change');
    const blocked = await c.get('/api/lawyer/dashboard');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'password_change_required');
    assert.equal((await c.get('/api/notifications')).status, 403);
    assert.equal(ok(await c.get('/api/auth/session')).user.restricted, 'password_change');
    assert.equal(ok(await c.get('/api/account')).user.password_change_required, true);
    // تغيير كلمة المرور يتطلب الحالية ويرفض الضعيفة والمطابقة للحالية
    assert.equal((await c.post('/api/account/password', { current_password: 'wrong', new_password: STRONG })).status, 400);
    assert.equal((await c.post('/api/account/password', { current_password: 'Temp#2026pass', new_password: 'ahmed1ahmed1x' })).status, 400);
    assert.equal((await c.post('/api/account/password', { current_password: 'Temp#2026pass', new_password: 'Temp#2026pass' })).status, 400);
    const changed = ok(await c.post('/api/account/password', { current_password: 'Temp#2026pass', new_password: STRONG, new_password_confirm: STRONG }));
    assert.equal(changed.user.restricted, null);
    assert.equal((await c.get('/api/lawyer/dashboard')).status, 200);
    lawyer = c;
  });

  test('the legacy admin password endpoints now set a temporary password and are audited', async () => {
    ok(await admin.post(`/api/admin/lawyers/${L.id}/password`, { password: 'Legacy#2026x' }));
    const c = t.client();
    assert.equal(ok(await c.post('/api/auth/login', { username: 'ahmed1', password: 'Legacy#2026x' })).user.restricted, 'password_change');
    ok(await c.post('/api/account/password', { current_password: 'Legacy#2026x', new_password: STRONG }));
    lawyer = c;
    const ev = ok(await admin.get(`/api/admin/audit?type=account.temp_password_set&user_id=${L.id}`));
    assert.ok(ev.total >= 2);
    // تعديل بيانات وإيقاف/تفعيل تُسجل في سجل الأمان
    ok(await admin.patch(`/api/admin/lawyers/${L.id}`, { active: false }));
    assert.equal((await lawyer.get('/api/auth/me')).status, 401, 'deactivation ends the sessions');
    ok(await admin.patch(`/api/admin/lawyers/${L.id}`, { active: true }));
    lawyer = await t.login('ahmed1', STRONG);
    const types = ok(await admin.get(`/api/admin/audit?user_id=${L.id}&type=user`)).items.map((e) => e.type);
    assert.ok(types.includes('user.deactivated') && types.includes('user.activated'));
  });

  test('changing my own password signs out my other sessions but keeps this one', async () => {
    const other = await t.login('ahmed1', STRONG);
    const r = ok(await lawyer.post('/api/account/password', { current_password: STRONG, new_password: 'Changed#2027y', new_password_confirm: 'Changed#2027y' }));
    assert.equal(r.other_sessions_revoked, 1);
    assert.equal((await other.get('/api/auth/me')).status, 401);
    assert.equal((await lawyer.get('/api/auth/me')).status, 200);
  });

  test('profile: lawyers edit contact data but not their name; staff can rename themselves', async () => {
    const before = ok(await lawyer.get('/api/account'));
    assert.equal(before.editable.name, false);
    assert.equal((await lawyer.patch('/api/account', { name: 'اسم آخر تمامًا' })).status, 400);
    const after = ok(await lawyer.patch('/api/account', { phone: '01098765432', email: 'Ahmed@Example.org' }));
    assert.equal(after.user.phone, '+201098765432');
    assert.equal(after.user.email, 'ahmed@example.org');
    assert.equal((await lawyer.patch('/api/account', { email: 'not-an-email' })).status, 400);
    const me = ok(await admin.patch('/api/account', { name: 'كريم منصور' }));
    assert.equal(me.user.name, 'كريم منصور');
  });
});

// ───────────────────────── التحقق بخطوتين والدخول ─────────────────────────
describe('accounts: two-factor authentication and two-step login', () => {
  let t;
  let admin;
  let secret;
  let codes;
  let baseMs;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    baseMs = Date.now();
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  test('enrolment: password re-check, QR data, confirmation code, 10 hashed recovery codes', async () => {
    const stale = await t.login('admin');
    // جلسة قديمة (أكثر من 10 دقائق) تحتاج كلمة المرور لبدء الإعداد
    t.app.db.run('UPDATE sessions SET created_at = ? WHERE user_id = 1', new Date(Date.now() - 3600000).toISOString());
    assert.equal((await stale.post('/api/account/2fa/setup', {})).status, 400);
    assert.equal((await stale.post('/api/account/2fa/setup', { password: 'nope' })).status, 400);
    const setup = ok(await admin.post('/api/account/2fa/setup', { password: 'Admin@2026' }));
    assert.match(setup.secret, /^[A-Z2-7]{32}$/);
    assert.deepEqual(setup.secret_groups.join(''), setup.secret);
    assert.ok(setup.secret_groups.every((g) => g.length === 4));
    assert.match(setup.otpauth_uri, /^otpauth:\/\/totp\/Beyoot%20Misr:admin\?secret=[A-Z2-7]{32}&issuer=Beyoot%20Misr/);
    assert.ok(decodeQr(encodeQr(setup.otpauth_uri).modules).text === setup.otpauth_uri, 'the QR code encodes the otpauth URI');
    secret = setup.secret;
    const row = t.app.db.get('SELECT * FROM user_2fa WHERE user_id = 1');
    assert.ok(row.pending_secret_enc && !row.pending_secret_enc.includes(secret), 'secret stored encrypted');
    assert.equal(ok(await admin.get('/api/account')).two_factor.enabled, false, 'not enabled before confirmation');
    assert.equal((await admin.post('/api/account/2fa/enable', { code: '000000' })).status, 400);
    const en = ok(await admin.post('/api/account/2fa/enable', { code: codeAt(secret, baseMs) }));
    codes = en.recovery_codes;
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    const stored = t.app.db.all('SELECT code_hash FROM user_recovery_codes WHERE user_id = 1').map((r) => r.code_hash).join('|');
    assert.ok(codes.every((c) => !stored.includes(c) && !stored.includes(c.replace('-', ''))), 'recovery codes hashed');
    const status = ok(await admin.get('/api/account')).two_factor;
    assert.equal(status.enabled, true);
    assert.equal(status.recovery_remaining, 10);
    assert.equal((await admin.post('/api/account/2fa/setup', { password: 'Admin@2026' })).status, 409);
  });

  test('login becomes two-step: no session after the password, wrong code counted, TOTP replay refused', async () => {
    freezeClock(new Date(baseMs + 60000).toISOString());
    const c = t.client();
    const step1 = await c.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.two_factor_required, true);
    assert.equal(step1.body.user, undefined);
    assert.equal(step1.headers.get('set-cookie'), null, 'no session cookie before the second factor');
    assert.equal((await c.get('/api/auth/me')).status, 401);
    const bad = await c.post('/api/auth/login/2fa', { challenge: step1.body.challenge, code: '123456' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'invalid_code');
    assert.equal(bad.body.details.attempts_left, 4);
    const good = ok(await c.post('/api/auth/login/2fa', { challenge: step1.body.challenge, code: codeAt(secret, baseMs + 60000) }));
    assert.equal(good.user.username, 'admin');
    assert.equal((await c.get('/api/auth/me')).status, 200);
    // الرمز نفسه لا يُقبل مرة ثانية، والتحدي لا يُستخدم مرتين
    assert.equal((await c.post('/api/auth/login/2fa', { challenge: step1.body.challenge, code: codeAt(secret, baseMs + 60000) })).body.code, 'challenge_expired');
    const c2 = t.client();
    const s2 = ok(await c2.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    assert.equal((await c2.post('/api/auth/login/2fa', { challenge: s2.challenge, code: codeAt(secret, baseMs + 60000) })).status, 400, 'TOTP replay refused');
    const sessions = ok(await c.get('/api/account/sessions')).items;
    assert.equal(sessions.find((s) => s.current).auth_method, 'totp');
    // انتهاء مهلة التحدي
    freezeClock(new Date(baseMs + 60000 + 6 * 60000).toISOString());
    assert.equal((await c2.post('/api/auth/login/2fa', { challenge: s2.challenge, code: codeAt(secret, baseMs + 60000 + 6 * 60000) })).body.code, 'challenge_expired');
    resetClock();
  });

  test('recovery codes work once; max attempts per challenge; account lockout counts 2FA failures', async () => {
    const c = t.client();
    const s = ok(await c.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    const r = ok(await c.post('/api/auth/login/2fa', { challenge: s.challenge, recovery_code: codes[0].toUpperCase() }));
    assert.equal(r.recovery_codes_remaining, 9);
    assert.equal(ok(await c.get('/api/account/sessions')).items.find((x) => x.current).auth_method, 'recovery');
    const c2 = t.client();
    const s2 = ok(await c2.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    assert.equal((await c2.post('/api/auth/login/2fa', { challenge: s2.challenge, recovery_code: codes[0] })).status, 400, 'a recovery code is single-use');
    // رمز الاسترداد في حقل الرمز العادي يُقبل أيضًا
    ok(await c2.post('/api/auth/login/2fa', { challenge: s2.challenge, code: codes[1] }));
    const ev = ok(await admin.get('/api/admin/audit?type=auth.2fa_recovery_used'));
    assert.equal(ev.total, 2);
    assert.equal(ev.items[0].severity, 'warning');
    // أقصى عدد للمحاولات على التحدي الواحد
    const c3 = t.client();
    const s3 = ok(await c3.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    let last;
    for (let i = 0; i < 5; i++) last = await c3.post('/api/auth/login/2fa', { challenge: s3.challenge, code: String(100000 + i) });
    assert.ok([401, 429].includes(last.status), `challenge exhausted (${last.status})`);
    assert.equal((await c3.post('/api/auth/login/2fa', { challenge: s3.challenge, code: codeAt(secret, Date.now()) })).status === 200, false);
    // خمس محاولات فاشلة للرمز = إيقاف مؤقت للحساب
    const locked = await t.client().post('/api/auth/login', { username: 'admin', password: 'Admin@2026' });
    assert.equal(locked.status, 429);
    assert.match(locked.body.error, /مؤقتًا/);
    t.app.db.run('UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = 1');
  });

  test('disabling requires password + code; regenerating codes invalidates the old ones', async () => {
    admin = t.client();
    const s = ok(await admin.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    ok(await admin.post('/api/auth/login/2fa', { challenge: s.challenge, recovery_code: codes[2] }));
    assert.equal((await admin.post('/api/account/2fa/recovery-codes', { password: 'Admin@2026', code: '000000' })).status, 400);
    const regen = ok(await admin.post('/api/account/2fa/recovery-codes', { password: 'Admin@2026', code: codes[3] }));
    assert.equal(regen.recovery_codes.length, 10);
    assert.equal(regen.two_factor.recovery_remaining, 10);
    const c = t.client();
    const s2 = ok(await c.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
    assert.equal((await c.post('/api/auth/login/2fa', { challenge: s2.challenge, recovery_code: codes[4] })).status, 400, 'old codes no longer work');
    assert.equal((await admin.post('/api/account/2fa/disable', { password: 'wrong', code: regen.recovery_codes[0] })).status, 400);
    ok(await admin.post('/api/account/2fa/disable', { password: 'Admin@2026', code: regen.recovery_codes[0] }));
    assert.equal(ok(await admin.get('/api/account')).two_factor.enabled, false);
    const ev = ok(await admin.get('/api/admin/audit?type=account.2fa_disabled'));
    assert.equal(ev.items[0].severity, 'critical', 'an admin disabling 2FA is a critical event');
    ok(await t.client().post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }));
  });

  test('policy security_require_2fa_admins forces admins to enrol; admin can reset 2FA for a lost phone', async () => {
    // لا يمكن تفعيل السياسة قبل أن يفعّل المسؤول التحقق لنفسه
    assert.equal((await admin.patch('/api/admin/security/policy', { security_require_2fa_admins: true })).status, 400);
    const setup = ok(await admin.post('/api/account/2fa/setup', { password: 'Admin@2026' }));
    freezeClock(new Date(Date.now() + 5 * 60000).toISOString());
    ok(await admin.post('/api/account/2fa/enable', { code: codeAt(setup.secret, Date.now() + 5 * 60000) }));
    resetClock();
    const pol = ok(await admin.patch('/api/admin/security/policy', { security_require_2fa_admins: true }));
    assert.equal(pol.security_require_2fa_admins, true);
    assert.equal((await admin.post('/api/account/2fa/disable', { password: 'Admin@2026', code: '123456' })).status, 409, 'cannot disable while the policy is on');

    ok(await admin.post('/api/admin/users', { role: 'admin', username: 'admin2', name: 'مديرة ثانية', password: 'Second#2026', temporary_password: false }), 201);
    const c = t.client();
    const login = ok(await c.post('/api/auth/login', { username: 'admin2', password: 'Second#2026' }));
    assert.equal(login.user.restricted, 'two_factor_enrollment');
    const blocked = await c.get('/api/admin/dashboard');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'two_factor_enrollment_required');
    // جلسة حديثة: يبدأ الإعداد دون إعادة كلمة المرور
    const st = ok(await c.post('/api/account/2fa/setup', {}));
    const done = ok(await c.post('/api/account/2fa/enable', { code: codeAt(st.secret, Date.now()) }));
    assert.equal(done.user.restricted, null);
    assert.equal((await c.get('/api/admin/dashboard')).status, 200);
    // مدير الحالات غير مشمول بالسياسة
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'cm9', name: 'مدير حالات', password: 'Manager#2026' }), 201);
    assert.equal(ok(await t.client().post('/api/auth/login', { username: 'cm9', password: 'Manager#2026' })).user.restricted, null);

    // فقدان الهاتف: الإدارة تلغي التحقق بخطوتين (حدث حرج) ثم يُلزم بإعادة التفعيل
    const admin2 = ok(await admin.get('/api/admin/accounts?role=staff')).items.find((x) => x.username === 'admin2');
    const reset = ok(await admin.post(`/api/admin/accounts/${admin2.id}/2fa/reset`));
    assert.equal(reset.two_factor_enabled, false);
    assert.equal((await c.get('/api/auth/me')).status, 401, 'sessions revoked');
    assert.equal(ok(await t.client().post('/api/auth/login', { username: 'admin2', password: 'Second#2026' })).user.restricted, 'two_factor_enrollment');
    assert.equal(ok(await admin.get('/api/admin/audit?type=account.2fa_reset_by_admin')).items[0].severity, 'critical');
    ok(await admin.patch('/api/admin/security/policy', { security_require_2fa_admins: false }));
  });
});

// ───────────────────────── الإيقاف المؤقت ومهلة عدم النشاط والجلسات ─────────────────────────
describe('accounts: lockout, rate limits, idle timeout and sessions', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  test('5 consecutive failures lock the account (429, even with the right password); admin unlock; 10 failures alert admins', async () => {
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'victim', name: 'حساب مستهدف', password: 'Victim#2026' }), 201);
    const c = t.client();
    for (let i = 0; i < 4; i++) assert.equal((await c.post('/api/auth/login', { username: 'victim', password: `bad-${i}` })).status, 401);
    assert.equal((await c.post('/api/auth/login', { username: 'victim', password: 'bad-4' })).status, 401, 'the 5th failure is still a plain 401');
    const locked = await c.post('/api/auth/login', { username: 'victim', password: 'Victim#2026' });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'rate_limited');
    assert.ok(Date.parse(locked.body.details.locked_until) > Date.now());
    const accs = ok(await admin.get('/api/admin/accounts?role=staff')).items;
    const v = accs.find((x) => x.username === 'victim');
    assert.equal(v.state, 'locked');
    // نفس السلوك لاسم مستخدم غير موجود (لا يكشف وجود الحساب)
    const g = t.client();
    for (let i = 0; i < 5; i++) await g.post('/api/auth/login', { username: 'ghost-user', password: `bad-${i}` });
    assert.equal((await g.post('/api/auth/login', { username: 'ghost-user', password: 'x' })).status, 429);
    // رفع الإيقاف
    ok(await admin.post(`/api/admin/accounts/${v.id}/unlock`));
    ok(await t.client().post('/api/auth/login', { username: 'victim', password: 'Victim#2026' }));
    // عشر محاولات فاشلة متتالية = حدث حرج وإشعار للإدارة
    t.app.db.run("UPDATE users SET failed_login_count = 9 WHERE username = 'victim'");
    await t.client().post('/api/auth/login', { username: 'victim', password: 'bad-again' });
    const crit = ok(await admin.get('/api/admin/audit?severity=critical&type=auth'));
    assert.ok(crit.items.some((e) => e.type === 'auth.login_failed' && e.data.consecutive_failures === 10));
    const notes = ok(await admin.get('/api/notifications')).items;
    assert.ok(notes.some((n) => n.type === 'security' && n.title.includes('حساب مستهدف') && n.link === '#/audit'));
    const lockouts = ok(await admin.get('/api/admin/audit?type=auth.lockout')).items;
    assert.ok(lockouts.length >= 2 && lockouts.every((e) => e.severity === 'warning'));
    const failed = ok(await admin.get('/api/admin/audit?type=auth.login_failed&q=ghost-user')).items;
    assert.ok(failed.length >= 5 && failed[0].data.username === 'ghost-user', 'the tried username is recorded');
    assert.ok(failed[0].ip, 'the IP is recorded');
  });

  test('idle timeout is enforced server-side; last_seen_at is throttled to once per 5 minutes', async () => {
    const c = await t.login('admin');
    const sid = ok(await c.get('/api/account/sessions')).items.find((s) => s.current);
    const t0 = Date.now();
    freezeClock(new Date(t0 + 2 * 60000).toISOString());
    ok(await c.get('/api/auth/me'));
    assert.equal(t.app.db.value('SELECT last_seen_at FROM sessions WHERE public_id = ?', sid.id), sid.last_seen_at, 'not rewritten within 5 minutes');
    freezeClock(new Date(t0 + 6 * 60000).toISOString());
    ok(await c.get('/api/auth/me'));
    const seen = t.app.db.value('SELECT last_seen_at FROM sessions WHERE public_id = ?', sid.id);
    assert.equal(seen, new Date(t0 + 6 * 60000).toISOString());
    // 11 ساعة بعد آخر نشاط: ما زالت سارية (الافتراضي 12 ساعة)
    freezeClock(new Date(t0 + 6 * 60000 + 11 * 3600000).toISOString());
    ok(await c.get('/api/auth/me'));
    // ثم 12 ساعة ونصف بلا نشاط
    freezeClock(new Date(t0 + 6 * 60000 + 11 * 3600000 + 12.5 * 3600000).toISOString());
    assert.equal((await c.get('/api/auth/me')).status, 401);
    assert.equal(t.app.db.value('SELECT COUNT(*) FROM sessions WHERE public_id = ?', sid.id), 0, 'idle session deleted');
    resetClock();
    // الإعداد قابل للضبط
    admin = await t.login('admin');
    assert.equal((await admin.patch('/api/admin/security/policy', { session_idle_hours: 0 })).status, 400);
    assert.equal((await admin.patch('/api/admin/security/policy', { session_idle_hours: 100, session_max_hours: 48 })).status, 400, 'idle cannot exceed max');
    ok(await admin.patch('/api/admin/security/policy', { session_idle_hours: 1 }));
    const c2 = await t.login('admin');
    freezeClock(new Date(Date.now() + 61 * 60000).toISOString());
    assert.equal((await c2.get('/api/auth/me')).status, 401);
    resetClock();
    admin = await t.login('admin');
    ok(await admin.patch('/api/admin/security/policy', { session_idle_hours: 12 }));
    assert.ok(ok(await admin.get('/api/admin/audit?type=security.policy_updated')).total >= 2);
  });

  test('sessions: list my devices, revoke one, sign out everywhere else; never expose tokens', async () => {
    const phone = t.client();
    const r = await phone.post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1' });
    assert.equal(r.status, 200);
    const laptop = await t.login('admin');
    const list = ok(await admin.get('/api/account/sessions'));
    assert.ok(list.items.length >= 3);
    assert.equal(list.items.filter((s) => s.current).length, 1);
    const iphone = list.items.find((s) => s.device === 'Safari على iPhone');
    assert.ok(iphone && iphone.mobile && iphone.ip);
    const raw = JSON.stringify(list);
    assert.ok(!raw.includes('token_hash') && !/bm_sid/.test(raw));
    const current = list.items.find((s) => s.current);
    assert.equal((await admin.del(`/api/account/sessions/${current.id}`)).status, 400, 'use logout for the current session');
    ok(await admin.del(`/api/account/sessions/${iphone.id}`));
    assert.equal((await phone.get('/api/auth/me')).status, 401);
    assert.equal((await admin.del(`/api/account/sessions/${iphone.id}`)).status, 404);
    // لا يمكن إنهاء جلسات مستخدم آخر عبر هذا المسار
    const L = await createLawyer(admin, { username: 'sessl' });
    const lw = await t.login('sessl', 'Lawyer@2026');
    const lwSid = ok(await lw.get('/api/account/sessions')).items[0].id;
    assert.equal((await admin.del(`/api/account/sessions/${lwSid}`)).status, 404);
    assert.equal((await lw.get('/api/auth/me')).status, 200);
    const out = ok(await admin.post('/api/account/sessions/revoke-others'));
    assert.ok(out.revoked >= 1);
    assert.equal((await laptop.get('/api/auth/me')).status, 401);
    assert.equal((await admin.get('/api/auth/me')).status, 200);
    // الإدارة تنهي كل جلسات محامٍ
    const res = ok(await admin.post(`/api/admin/accounts/${L.id}/sessions/revoke`));
    assert.equal(res.revoked, 1);
    assert.equal((await lw.get('/api/auth/me')).status, 401);
    // تسجيل الخروج يُسجل في سجل الأمان
    const lw2 = await t.login('sessl', 'Lawyer@2026');
    ok(await lw2.post('/api/auth/logout'));
    assert.ok(ok(await admin.get('/api/admin/audit?type=auth.logout')).items.some((e) => e.user_id === L.id));
  });
});

// ───────────────────────── سجل الأمان ─────────────────────────
describe('accounts: security audit log', () => {
  let t;
  let admin;
  let manager;
  let lawyer;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'mona', name: 'منى', password: 'Manager@2026' }), 201);
    manager = await t.login('mona', 'Manager@2026');
    await createLawyer(admin, { username: 'lw1' });
    lawyer = await t.login('lw1', 'Lawyer@2026');
  });
  after(async () => t.close());

  test('admin-only: anonymous 401, lawyers and case managers 403 on every audit/accounts route', async () => {
    const urls = ['/api/admin/audit', '/api/admin/audit/summary', '/api/admin/audit/facets', '/api/admin/audit/export.csv', '/api/admin/accounts', '/api/admin/accounts/invites', '/api/admin/accounts/1', '/api/admin/security/policy'];
    for (const u of urls) {
      assert.equal((await t.client().get(u)).status, 401, `anon ${u}`);
      assert.equal((await lawyer.get(u)).status, 403, `lawyer ${u}`);
      assert.equal((await manager.get(u)).status, 403, `manager ${u}`);
    }
    for (const u of ['/api/admin/accounts/1/reset-link', '/api/admin/accounts/1/unlock', '/api/admin/accounts/1/temp-password', '/api/admin/accounts/1/2fa/reset', '/api/admin/accounts/1/sessions/revoke']) {
      assert.equal((await lawyer.post(u, { password: 'Hacked#2026' })).status, 403, `lawyer POST ${u}`);
      assert.equal((await manager.post(u, { password: 'Hacked#2026' })).status, 403, `manager POST ${u}`);
    }
    ok(await t.client().post('/api/auth/login', { username: 'admin', password: 'Admin@2026' }), 200, 'admin password untouched');
    assert.equal((await manager.patch('/api/admin/security/policy', { session_idle_hours: 999 })).status, 403);
  });

  test('records logins, failures, role changes, portal links and settings; filters, pagination and details', async () => {
    await t.client().post('/api/auth/login', { username: 'mona', password: 'wrong-one' });
    const users = ok(await admin.get('/api/admin/users'));
    const mona = users.find((u) => u.username === 'mona');
    ok(await admin.patch(`/api/admin/users/${mona.id}`, { role: 'admin' }));
    ok(await admin.patch(`/api/admin/users/${mona.id}`, { role: 'case_manager' }));
    ok(await admin.patch('/api/admin/settings', { default_assignment_days: 5 }));
    const intake = ok(await admin.post('/api/admin/intakes', { channel: 'phone', phone: '01011112222', text: 'أرملة تسأل عن إعلام الوراثة' }), 201);
    const clientId = intake.client_id || intake.client?.id || t.app.db.value('SELECT id FROM clients ORDER BY id DESC LIMIT 1');
    ok(await admin.post(`/api/admin/clients/${clientId}/portal-link`, {}));
    ok(await admin.post(`/api/admin/clients/${clientId}/revoke-portal`, {}));

    const all = ok(await admin.get('/api/admin/audit?page_size=200'));
    const types = new Set(all.items.map((e) => e.type));
    for (const ty of ['auth.login', 'auth.login_failed', 'user.created', 'user.role_changed', 'settings.updated', 'portal.link_issued', 'portal.revoked']) assert.ok(types.has(ty), `logged ${ty}`);
    const elevate = all.items.find((e) => e.type === 'user.role_changed' && e.data.to === 'admin');
    assert.equal(elevate.severity, 'critical', 'elevation to admin is critical');
    assert.equal(elevate.type_label, 'تغيير الدور والصلاحيات');
    assert.equal(elevate.actor_name, 'مدير النظام');
    const failed = all.items.find((e) => e.type === 'auth.login_failed' && e.data.username === 'mona');
    assert.ok(failed && failed.ip);

    // التصفية
    const byType = ok(await admin.get('/api/admin/audit?type=auth'));
    assert.ok(byType.items.length && byType.items.every((e) => e.type.startsWith('auth.')));
    const bySev = ok(await admin.get('/api/admin/audit?severity=critical'));
    assert.ok(bySev.items.every((e) => e.severity === 'critical'));
    const byUser = ok(await admin.get(`/api/admin/audit?user_id=${mona.id}`));
    assert.ok(byUser.items.some((e) => e.type === 'user.role_changed'), 'events about a user are found by that user (target)');
    const byText = ok(await admin.get('/api/admin/audit?q=' + encodeURIComponent('إعلام')));
    assert.equal(byText.total, 0);
    const future = ok(await admin.get(`/api/admin/audit?from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`));
    assert.equal(future.total, 0);
    const past = ok(await admin.get(`/api/admin/audit?to=${encodeURIComponent(new Date(Date.now() - 86400000).toISOString())}`));
    assert.equal(past.total, 0);
    assert.equal((await admin.get('/api/admin/audit?severity=bogus')).status, 400);
    assert.equal((await admin.get('/api/admin/audit?from=not-a-date')).status, 400);
    // تقسيم الصفحات
    const p1 = ok(await admin.get('/api/admin/audit?page_size=5&page=1'));
    const p2 = ok(await admin.get('/api/admin/audit?page_size=5&page=2'));
    assert.equal(p1.items.length, 5);
    assert.ok(p1.pages >= 2);
    assert.ok(!p2.items.some((e) => p1.items.some((x) => x.id === e.id)));
    const facets = ok(await admin.get('/api/admin/audit/facets'));
    assert.ok(facets.types.some((x) => x.value === 'auth.login' && x.count > 0));
    assert.ok(facets.users.some((u) => u.id === mona.id));
    const summary = ok(await admin.get('/api/admin/audit/summary'));
    assert.ok(summary.logins_24h >= 3 && summary.failed_logins_24h >= 1 && summary.critical_7d >= 1);
  });

  test('CSV export: UTF-8 BOM, Arabic headers, formula-injection safe, and itself audited', async () => {
    await t.client().post('/api/auth/login', { username: '=cmd|calc', password: 'x' });
    const r = await fetch(`${t.base}/api/admin/audit/export.csv?type=auth`, { headers: { cookie: admin.cookie } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/csv; charset=utf-8/);
    assert.match(r.headers.get('content-disposition'), /attachment; filename="security-audit-\d{4}-\d{2}-\d{2}\.csv"/);
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM');
    const text = bytes.toString('utf8');
    assert.equal(text.charCodeAt(0), 0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    assert.ok(lines[0].startsWith('التاريخ والوقت (القاهرة),نوع الحدث'));
    assert.ok(lines.length > 2);
    assert.ok(lines.slice(1).every((l) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2},/.test(l)));
    assert.ok(!/,=cmd/.test(text), 'cells starting with = are neutralised');
    const ev = ok(await admin.get('/api/admin/audit?type=audit.exported'));
    assert.equal(ev.items[0].data.filters.type, 'auth');
    assert.equal((await lawyer.get('/api/admin/audit/export.csv')).status, 403);
  });

  test('my account activity shows only my own events', async () => {
    const mine = ok(await lawyer.get('/api/account/activity')).items;
    assert.ok(mine.length >= 2);
    const u = ok(await lawyer.get('/api/account')).user;
    assert.ok(mine.some((e) => e.by_me && e.type === 'auth.login' && e.user_id === u.id));
    const byAdmin = mine.find((e) => e.type === 'user.created');
    assert.ok(byAdmin && !byAdmin.by_me, 'what the administration did on my account is listed');
    assert.equal(byAdmin.actor_name, 'الإدارة');
    assert.equal(byAdmin.ip, null, 'staff IP addresses are not shown to the account holder');
    assert.ok(!mine.some((e) => /منى/.test(e.summary)), 'other users\' events are not included');
    assert.ok(mine.every((e) => e.data === undefined), 'raw event data is not exposed to the user');
  });

  test('cleanup job purges idle sessions, old used tokens and expired audit events; registered with the scheduler', async () => {
    const jobs = t.app.jobs.list().map((j) => j.name);
    assert.ok(jobs.includes('accounts.cleanup') && jobs.includes('accounts.invite_followup'));
    t.app.db.insert('security_events', { type: 'auth.login', severity: 'info', summary: 'قديم', created_at: '2020-01-01T00:00:00.000Z' });
    t.app.db.insert('security_events', { type: 'auth.lockout', severity: 'warning', summary: 'قديم مهم', created_at: new Date(Date.now() - 400 * 86400000).toISOString() });
    const res = t.app.accounts.cleanup();
    assert.ok(res.events >= 1);
    assert.equal(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE summary = 'قديم'"), 0);
    assert.equal(t.app.db.value("SELECT COUNT(*) FROM security_events WHERE summary = 'قديم مهم'"), 1, 'warnings are kept twice as long');
  });
});

// ───────────────────────── إصلاحات المراجعة ─────────────────────────
describe('accounts: review fixes', () => {
  let t;
  let admin;
  before(async () => {
    t = await startTestApp({ seed: 'none' });
    admin = await t.login('admin');
  });
  after(async () => {
    resetClock();
    await t.close();
  });

  test('background polling (notifications every 30s) does not keep an idle session alive', async () => {
    ok(await admin.patch('/api/admin/security/policy', { session_idle_hours: 1 }));
    const BG = { 'x-background-request': '1' };
    const idle = await t.login('admin');
    const busy = await t.login('admin');
    const t0 = Date.now();
    const seenOf = (c) => t.app.db.value('SELECT last_seen_at FROM sessions WHERE token_hash = ?', crypto.createHash('sha256').update(c.cookie.split('=')[1]).digest('hex'));
    const before = seenOf(idle);
    try {
      // 40 دقيقة من التبويب المفتوح دون أي تفاعل: طلبات الخلفية تنجح لكنها لا تُحدّث «آخر نشاط»
      freezeClock(new Date(t0 + 40 * 60000).toISOString());
      ok(await idle.get('/api/notifications', BG));
      ok(await busy.get('/api/notifications'));
      assert.equal(seenOf(idle), before, 'a background request is not activity');
      assert.equal(seenOf(busy), new Date(t0 + 40 * 60000).toISOString(), 'a normal request is activity');
      // بعد ساعة وعشر دقائق: الجلسة الخاملة تنتهي رغم استمرار الطلبات الدورية، والجلسة النشطة باقية
      freezeClock(new Date(t0 + 70 * 60000).toISOString());
      assert.equal((await idle.get('/api/notifications', BG)).status, 401);
      assert.equal((await busy.get('/api/notifications', BG)).status, 200);
    } finally {
      resetClock();
      admin = await t.login('admin');
      ok(await admin.patch('/api/admin/security/policy', { session_idle_hours: 12 }));
    }
  });

  test('security policy keys sent to the generic settings endpoint get the same validation, precondition and audit', async () => {
    // بدون تحقق بخطوتين لا يمكن إلزام الآخرين به — من أي مسار
    const forced = await admin.patch('/api/admin/settings', { security_require_2fa_admins: true });
    assert.equal(forced.status, 400);
    assert.equal(t.app.settings.get('security_require_2fa_admins'), false, 'nothing saved');
    assert.equal((await admin.patch('/api/admin/settings', { session_idle_hours: -5 })).status, 400);
    assert.equal((await admin.patch('/api/admin/settings', { session_max_hours: 1e9 })).status, 400);
    // قيمة صالحة مع مفتاح آخر خاطئ: لا يُحفظ شيء
    assert.equal((await admin.patch('/api/admin/settings', { session_idle_hours: 6, org_name: '' })).status, 400);
    assert.equal(t.app.auth.idleHours(), 12, 'all-or-nothing');
    const saved = ok(await admin.patch('/api/admin/settings', { session_idle_hours: 24, org_tagline: 'شعار' }));
    assert.equal(saved.session_idle_hours, 24);
    const pol = ok(await admin.get('/api/admin/audit?type=security.policy_updated')).items[0];
    assert.equal(pol.severity, 'warning', 'a longer idle timeout weakens the policy');
    assert.match(pol.summary, /مهلة عدم النشاط/);
    const gen = ok(await admin.get('/api/admin/audit?type=settings.updated')).items[0];
    assert.ok(!gen.summary.includes('session_idle_hours'), 'policy keys are not logged as generic settings');
    // اسم الجهة في تطبيق المصادقة: حروف لاتينية فقط (يظهر في رمز QR)
    assert.equal((await admin.patch('/api/admin/security/policy', { security_totp_issuer: 'بيوت مصر' })).status, 400);
    assert.equal(ok(await admin.patch('/api/admin/security/policy', { security_totp_issuer: 'Beyoot Misr Legal' })).security_totp_issuer, 'Beyoot Misr Legal');
    const setup = ok(await admin.post('/api/account/2fa/setup', { password: 'Admin@2026' }));
    assert.match(setup.otpauth_uri, /issuer=Beyoot%20Misr%20Legal/);
    ok(await admin.patch('/api/admin/security/policy', { session_idle_hours: 12 }));
  });

  test('creating an account with the admin role is a critical event and alerts the other admins', async () => {
    ok(await admin.post('/api/admin/users', { role: 'admin', username: 'second', name: 'مدير ثانٍ', password: 'Second#2026', temporary_password: false }), 201);
    const second = await t.login('second', 'Second#2026');
    const created = ok(await admin.get('/api/admin/audit?type=user.created')).items[0];
    assert.equal(created.severity, 'critical');
    // دعوة مدير ثالث: يُنبَّه المدير الثاني (لا من أنشأ الحساب)
    ok(await admin.post('/api/admin/users', { role: 'admin', username: 'third', name: 'مديرة ثالثة' }), 201);
    const notes = ok(await second.get('/api/notifications')).items;
    assert.ok(notes.some((n) => n.type === 'security' && n.title.includes('مديرة ثالثة')), 'another admin is alerted');
    assert.ok(!ok(await admin.get('/api/notifications')).items.some((n) => n.title.includes('مديرة ثالثة')), 'the creator is not notified of their own action');
    // مدير الحالات: حدث عادي بلا تنبيه
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'cmx', name: 'مدير حالات' }), 201);
    assert.equal(ok(await admin.get('/api/admin/audit?type=user.created')).items[0].severity, 'info');
  });

  test('an invite-pending account costs the same password hashing time as any other (no timing oracle)', async () => {
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'pending1', name: 'حساب بدعوة' }), 201);
    ok(await admin.post('/api/admin/users', { role: 'case_manager', username: 'real1', name: 'حساب مفعل', password: 'RealPass#2026' }), 201);
    const time = async (username) => {
      const c = t.client();
      const start = process.hrtime.bigint();
      const r = await c.post('/api/auth/login', { username, password: 'Wrong#Guess2026' });
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'اسم المستخدم أو كلمة المرور غير صحيحة');
      return Number(process.hrtime.bigint() - start) / 1e6;
    };
    const median = (xs) => xs.sort((a, b) => a - b)[1];
    const pending = median([await time('pending1'), await time('pending1'), await time('pending1')]);
    const real = median([await time('real1'), await time('real1'), await time('real1')]);
    assert.ok(pending > real * 0.4, `invite-pending login ${pending.toFixed(1)}ms vs active ${real.toFixed(1)}ms`);
  });

  test('restricted-session error codes are what the SPA listens for (auth:restricted)', async () => {
    const L = await createLawyer(admin, { username: 'tmp9' });
    ok(await admin.post(`/api/admin/accounts/${L.id}/temp-password`, { password: 'Temp#Pass2026' }));
    const c = await t.login('tmp9', 'Temp#Pass2026');
    const r = await c.get('/api/lawyer/dashboard');
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'password_change_required');
    const api = await import('node:fs').then((fs) => fs.readFileSync(new URL('../public/assets/js/lib/api.js', import.meta.url), 'utf8'));
    assert.ok(api.includes("'password_change_required'") && api.includes("'two_factor_enrollment_required'") && api.includes('auth:restricted'));
    const shell = await import('node:fs').then((fs) => fs.readFileSync(new URL('../public/assets/js/app/shell.js', import.meta.url), 'utf8'));
    assert.match(shell, /api\.get\('\/notifications', undefined, \{ background: true \}\)/, 'the notification poll is sent as a background request');
  });
});

// ───────────────────────── البيانات التجريبية ─────────────────────────
describe('accounts: demo seed', () => {
  test('pending + expired invites, a 2FA admin with a known demo secret, sessions and a realistic audit trail', async () => {
    const t = await startTestApp({ seed: 'demo' });
    try {
      const admin = await t.login('admin');
      const invites = ok(await admin.get('/api/admin/accounts/invites')).items;
      assert.equal(invites.find((x) => x.username === 'nour').invite.status, 'active');
      assert.equal(invites.find((x) => x.username === 'youssef').invite.status, 'expired');
      const summary = ok(await admin.get('/api/admin/audit/summary'));
      assert.ok(summary.lockouts_7d >= 2 && summary.critical_7d >= 1 && summary.pending_invites === 2);
      // دخول حساب مسؤولة الامتثال على خطوتين بالسر التجريبي المعروف
      const { DEMO_TOTP_SECRET } = await import('../src/services/accounts-seed.js');
      const c = t.client();
      const s = ok(await c.post('/api/auth/login', { username: 'heba', password: 'Compliance@2026' }));
      assert.equal(s.two_factor_required, true);
      ok(await c.post('/api/auth/login/2fa', { challenge: s.challenge, code: codeAt(DEMO_TOTP_SECRET, Date.now()) }));
      assert.equal(ok(await c.get('/api/auth/me')).user.role, 'admin');
      // الحسابات التجريبية الأخرى تدخل بخطوة واحدة كما كانت
      for (const u of ['manager', 'ahmed', 'mohamed', 'salwa', 'rania', 'hany', 'amr']) assert.equal((await t.login(u)).user.restricted, null);
      assert.ok(ok(await admin.get('/api/account/sessions')).items.length >= 3);
    } finally {
      await t.close();
    }
  });
});
