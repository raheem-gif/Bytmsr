// بيانات تجريبية لوحدة الحسابات والأمان (الإصدار 9): دعوات معلقة ومنتهية، مسؤولة امتثال بتحقق بخطوتين،
// جلسات على أجهزة مختلفة، وسجل أمان واقعي (دخول، محاولات فاشلة، إيقاف مؤقت وتنبيه حرج، كلمة مرور مؤقتة، روابط البوابة).
// تُنشأ عبر نفس الخدمات المستخدمة في التشغيل الفعلي.
import { sha256, randomToken, nowIso, addHours } from '../util.js';
import { base32Decode } from '../totp.js';
import { hashPassword } from '../auth.js';

const UA = {
  officeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  bot: 'python-requests/2.31.0',
};
// عناوين توضيحية: مقر المؤسسة بمدينة نصر، شبكة محمول، وعنوان خارجي لمحاولة تخمين
const IP = { office: '41.33.152.18', mobile: '197.38.102.77', home: '156.204.61.9', foreign: '185.220.101.44' };

/** سر التحقق بخطوتين للحساب التجريبي «heba» (لتجربة الدخول على خطوتين: أضفه يدويًا في أي تطبيق مصادقة) */
export const DEMO_TOTP_SECRET = 'BEYOOTMISRDEMOTWOFACTORKEYSECRET';

export async function seedAccountsDemo(app, { at, adv, user }) {
  const { db } = app;
  const ctxOf = (ip, ua) => ({ ip, req: { headers: { 'user-agent': ua, host: 'localhost:3000' } }, res: { setHeader() {} } });
  const admin = () => user('admin');

  /** جلسة دخول حقيقية في الجدول (بدون رمز معروف) + حدث الدخول في سجل الأمان */
  function login(username, ip, ua, { method = 'password_only' } = {}) {
    const u = user(username);
    const created = nowIso();
    db.update('users', u.id, { last_login_at: created, failed_login_count: 0, locked_until: null });
    const how = { password_only: 'بكلمة المرور', totp: 'بكلمة المرور ورمز التحقق', invite: 'بعد قبول الدعوة' }[method];
    app.audit.log({ actor: u, ctx: ctxOf(ip, ua), type: 'auth.login', summary: `تسجيل دخول ناجح ${how}`, data: { method } });
  }
  function fail(username, ip, ua) {
    const u = user(username);
    app.auth.recordFailure(ctxOf(ip, ua), u || null, String(username).toLowerCase(), 'password');
  }

  // ── مسؤولة الامتثال وحماية البيانات: دُعيت قبل ثلاثة أسابيع، فعّلت حسابها والتحقق بخطوتين ──
  at(21, 11, 5);
  const heba = app.accounts.createInvitedUser('staff', { role: 'admin', username: 'heba', name: 'هبة عادل', phone: '01001234590', email: 'compliance@example.org' }, admin(), ctxOf(IP.office, UA.officeWin));
  adv(3);
  {
    const tok = db.get("SELECT id FROM account_tokens WHERE user_id = ? AND kind = 'invite' ORDER BY id DESC LIMIT 1", heba.id);
    db.tx(() => {
      db.update('users', heba.id, { password_hash: hashPassword('Compliance@2026'), invite_pending: 0, password_changed_at: nowIso(), confidentiality_pledged_at: nowIso() });
      db.run('UPDATE account_tokens SET used_at = ?, used_ip = ? WHERE id = ?', nowIso(), IP.home, tok.id);
    });
    const u = user('heba');
    app.audit.log({ actor: u, ctx: ctxOf(IP.home, UA.mac), type: 'account.invite_accepted', summary: 'قبول دعوة وتفعيل حساب هبة عادل (heba)', data: { target_user_id: u.id, pledge_accepted_at: nowIso() } });
    login('heba', IP.home, UA.mac, { method: 'invite' });
    adv(0.2);
    app.accounts.seedEnableTwoFactor(u.id, base32Decode(DEMO_TOTP_SECRET));
    app.audit.log({ actor: u, ctx: ctxOf(IP.home, UA.mac), type: 'account.2fa_enabled', summary: 'تفعيل التحقق بخطوتين لحساب هبة عادل (heba) وإصدار 10 رموز استرداد', data: { target_user_id: u.id } });
  }

  // ── دخول يومي معتاد للإدارة ──
  for (const [days, h, who, ip, ua] of [
    [14, 9, 'admin', IP.office, UA.officeWin],
    [14, 9, 'manager', IP.office, UA.firefox],
    [10, 10, 'heba', IP.office, UA.officeWin],
    [9, 21, 'manager', IP.mobile, UA.android],
    [7, 9, 'admin', IP.office, UA.officeWin],
  ]) {
    at(days, h, 12);
    login(who, ip, ua, { method: who === 'heba' ? 'totp' : 'password_only' });
  }
  at(10, 10, 40);
  app.audit.log({ actor: admin(), ctx: ctxOf(IP.office, UA.officeWin), type: 'settings.updated', summary: 'تم تعديل الإعدادات: default_assignment_days' });

  // ── محامٍ نسي كلمة مروره: كلمة مرور مؤقتة ثم تغييرها عند أول دخول ──
  at(8, 12, 30);
  {
    const amr = user('amr');
    app.accounts.audited(amr.id, admin(), ctxOf(IP.office, UA.officeWin), () => app.lawyers.setPassword(amr.id, 'Lawyer@2026', admin()));
    adv(2);
    db.update('users', amr.id, { must_change_password: 0, password_changed_at: nowIso() });
    login('amr', IP.mobile, UA.android);
    app.audit.log({ actor: user('amr'), ctx: ctxOf(IP.mobile, UA.android), type: 'account.password_changed', summary: 'استبدال كلمة المرور المؤقتة من صفحة الحساب', data: { target_user_id: amr.id, was_temporary: true } });
  }

  // ── دعوة منتهية لمدير حالات جديد لم يفعّل حسابه ──
  at(6, 13, 15);
  app.accounts.createInvitedUser('staff', { role: 'case_manager', username: 'youssef', name: 'يوسف كمال', phone: '01112345671' }, admin(), ctxOf(IP.office, UA.officeWin));

  // ── محاولات تخمين على حساب مدير النظام من عنوان خارجي: إيقاف مؤقت مرتين ثم تنبيه حرج للإدارة ──
  at(5, 2, 14);
  for (let i = 0; i < 5; i++) {
    fail('admin', IP.foreign, UA.bot);
    adv(0.01);
  }
  adv(0.3); // بعد انتهاء الإيقاف المؤقت الأول (15 دقيقة) عاود المهاجم المحاولة
  for (let i = 0; i < 5; i++) {
    fail('admin', IP.foreign, UA.bot);
    adv(0.01);
  }
  for (const name of ['administrator', 'root', 'beyoot']) fail(name, IP.foreign, UA.bot);
  at(5, 9, 3);
  login('admin', IP.office, UA.officeWin);
  app.audit.log({ actor: admin(), ctx: ctxOf(IP.office, UA.officeWin), type: 'security.policy_updated', summary: 'تعديل سياسة الأمان: مهلة عدم النشاط (8 ساعات)', data: { changes: { session_idle_hours: { from: 12, to: 8 } } } });
  app.audit.log({ actor: admin(), ctx: ctxOf(IP.office, UA.officeWin), type: 'security.policy_updated', summary: 'تعديل سياسة الأمان: مهلة عدم النشاط (12 ساعة)', data: { changes: { session_idle_hours: { from: 8, to: 12 } } } });

  // ── مديرة الحالات أخطأت كلمة المرور مرتين من هاتفها ──
  at(2, 20, 41);
  fail('manager', IP.mobile, UA.android);
  adv(0.02);
  fail('manager', IP.mobile, UA.android);
  adv(0.02);
  login('manager', IP.mobile, UA.android);

  // ── رابط بوابة جديد لعميلة وإلغاء روابط قديمة لأخرى ──
  at(1, 12, 5);
  const clients = db.all('SELECT id, code FROM clients ORDER BY id LIMIT 2');
  if (clients[0]) app.audit.log({ actor: user('manager'), ctx: ctxOf(IP.office, UA.firefox), type: 'portal.link_issued', summary: `إصدار رابط بوابة جديد للعميل ${clients[0].code} وإرساله عبر واتساب`, data: { client_id: clients[0].id, sent: true } });
  if (clients[1]) app.audit.log({ actor: admin(), ctx: ctxOf(IP.office, UA.officeWin), type: 'portal.revoked', severity: 'warning', summary: `إلغاء روابط بوابة العميل ${clients[1].code} (عدد الروابط الملغاة: 1)`, data: { client_id: clients[1].id, revoked: 1 } });

  // ── دعوة سارية لمحامية متطوعة جديدة (أحوال شخصية) لم تفعّل حسابها بعد ──
  at(1, 15, 20);
  app.accounts.createInvitedUser(
    'lawyer',
    {
      username: 'nour',
      name: 'نور الهدى سامي',
      title: 'أ.',
      phone: '01001234567',
      specialties: ['FAM'],
      capacity: 6,
      bar_level: 'ابتدائي',
      agreement: { type: 'pro_bono', notional_value: 500 },
      notes: 'تطوعت عبر صفحة المؤسسة على فيسبوك للمساعدة في قضايا النفقة والحضانة للأرامل.',
    },
    admin(),
    ctxOf(IP.office, UA.officeWin),
  );

  // ── جلسات نشطة الآن على أجهزة أخرى (لصفحة «حسابي» وإحصاءات سجل الأمان) — بأوقات نسبية إلى الوقت الفعلي ──
  const realNow = Date.now();
  for (const [username, ip, ua, createdHoursAgo, seenMinutesAgo] of [
    ['admin', IP.mobile, UA.iphone, 26, 45],
    ['admin', IP.home, UA.mac, 50, 180],
    ['manager', IP.office, UA.firefox, 5, 12],
    ['heba', IP.office, UA.officeWin, 3, 30],
  ]) {
    const u = user(username);
    const created = new Date(realNow - createdHoursAgo * 3600000).toISOString();
    db.insert('sessions', {
      token_hash: sha256(randomToken(32)),
      user_id: u.id,
      created_at: created,
      expires_at: addHours(created, 72),
      ip,
      user_agent: ua,
      public_id: randomToken(9),
      last_seen_at: new Date(realNow - seenMinutesAgo * 60000).toISOString(),
      auth_method: username === 'heba' ? 'totp' : 'password_only',
    });
  }
}
