// إنشاء حساب «إدارة النظام» أو استرداده من سطر أوامر الخادم (لا يحتاج الخادم أن يكون متوقفًا).
//
//   npm run admin -- --username director --password 'كلمة-مرور-قوية' [--name "الاسم"] [--reset-2fa]
//   npm run admin -- --username director            ← تُطلب كلمة المرور مخفية مرتين (أفضل من كتابتها في الأمر)
//   echo 'Strong#Pass2026' | npm run admin -- --username director --password-stdin
//
// • إن وُجد الحساب بدور «إدارة النظام»: تُعاد كلمة المرور، ويُعاد تفعيل الحساب ويُفك أي قفل، وتُنهى كل جلساته.
//   مع --reset-2fa يُلغى التحقق بخطوتين ورموز الاسترداد (عند فقد الهاتف).
// • إن لم يوجد: يُنشأ حساب جديد بدور «إدارة النظام» (ويكتمل «الإعداد الأول» إن كانت المنصة في وضع الإعداد).
// • يرفض كلمات المرور الضعيفة، ولا يحوّل حساب محامٍ أو مدير حالات إلى مدير نظام.
// • كل عملية تُسجَّل في سجل الأمان.
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config.js';
import { Db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { strongPasswordProblem, usernameProblem, PASSWORD_POLICY } from '../src/services/system.js';
import { nowIso } from '../src/util.js';

const ROLE_AR = { admin: 'إدارة النظام', case_manager: 'إدارة الحالات', lawyer: 'محامٍ' };

const HELP = `استرداد أو إنشاء حساب «إدارة النظام» — Admin account recovery

الاستخدام / Usage:
  npm run admin -- --username <user> [--password <pass> | --password-stdin] [--name "<الاسم>"] [--reset-2fa]

الخيارات:
  --username        اسم المستخدم (حروف لاتينية وأرقام ونقطة وشرطة)
  --password        كلمة المرور الجديدة (يُفضّل تركها ليُطلب إدخالها مخفية)
  --password-stdin  قراءة كلمة المرور من الإدخال القياسي (للأتمتة)
  --name            الاسم الظاهر للحساب (اختياري)
  --reset-2fa       إلغاء التحقق بخطوتين ورموز الاسترداد للحساب
  --help            عرض هذه المساعدة

شروط كلمة المرور: ${PASSWORD_POLICY.join('؛ ')}.
`;

function fail(msg, code = 1) {
  console.error(`خطأ: ${msg}`);
  process.exit(code);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (s === '\r\n' || s === '\n' || s === '\r') rl.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdinLine() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
}

let args;
try {
  args = parseArgs({
    options: {
      username: { type: 'string', short: 'u' },
      password: { type: 'string', short: 'p' },
      'password-stdin': { type: 'boolean', default: false },
      name: { type: 'string', short: 'n' },
      'reset-2fa': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  }).values;
} catch (e) {
  console.error(HELP);
  fail(`خيار غير معروف أو ناقص: ${e.message}`, 2);
}
if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const username = String(args.username || '').trim();
if (!username) {
  console.error(HELP);
  fail('حدد اسم المستخدم بالخيار --username', 2);
}
const uProblem = usernameProblem(username);
if (uProblem) fail(uProblem);

let password = args.password;
if (password !== undefined) {
  console.warn('تنبيه: كتابة كلمة المرور داخل الأمر قد تحفظها في سجل الأوامر (history). يُفضّل تركها ليُطلب إدخالها مخفية.');
} else if (args['password-stdin']) {
  password = await readStdinLine();
} else if (process.stdin.isTTY) {
  password = await askHidden('كلمة المرور الجديدة: ');
  const again = await askHidden('أعد كتابة كلمة المرور: ');
  if (password !== again) fail('كلمتا المرور غير متطابقتين');
} else {
  fail('لم تُحدد كلمة المرور. استخدم --password أو --password-stdin، أو شغّل الأمر في طرفية تفاعلية.', 2);
}

const problem = strongPasswordProblem(password, { username });
if (problem) fail(`كلمة المرور مرفوضة: ${problem}`);

const name = args.name !== undefined ? String(args.name).trim().slice(0, 100) : null;
if (name !== null && name.length < 3) fail('الاسم يجب ألا يقل عن 3 أحرف');

const config = loadConfig();
const db = new Db(config.dbPath);
const hasTable = (t) => !!db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", t);
const userCols = new Set(db.all('PRAGMA table_info(users)').map((r) => r.name));

let outcome;
try {
  outcome = db.tx(() => {
    const existing = db.get('SELECT * FROM users WHERE username = ?', username);
    const now = nowIso();
    if (existing && existing.role !== 'admin') {
      throw new Error(
        `الحساب «${existing.username}» موجود بدور «${ROLE_AR[existing.role] || existing.role}» ولا يمكن تحويله إلى «إدارة النظام» من هنا. اختر اسم مستخدم آخر لحساب مدير النظام.`,
      );
    }
    if (existing) {
      const patch = { password_hash: hashPassword(password), active: 1 };
      if (userCols.has('deactivated_at')) patch.deactivated_at = null;
      if (name) patch.name = name;
      if (userCols.has('must_change_password')) patch.must_change_password = 0;
      if (userCols.has('failed_login_count')) patch.failed_login_count = 0;
      if (userCols.has('locked_until')) patch.locked_until = null;
      if (userCols.has('password_changed_at')) patch.password_changed_at = now;
      const keys = Object.keys(patch);
      db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), existing.id);
      const sessions = db.run('DELETE FROM sessions WHERE user_id = ?', existing.id).changes;
      if (hasTable('login_challenges')) db.run('DELETE FROM login_challenges WHERE user_id = ?', existing.id);
      // روابط إعادة التعيين أو الدعوة المعلقة لهذا الحساب تُلغى: قد تكون أُنشئت بيد من استولى على حساب آخر
      let linksRevoked = 0;
      if (hasTable('account_tokens')) {
        linksRevoked = db.run('UPDATE account_tokens SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL', now, existing.id).changes;
      }
      let twoFactorReset = false;
      if (args['reset-2fa']) {
        if (hasTable('user_2fa')) twoFactorReset = db.run('DELETE FROM user_2fa WHERE user_id = ?', existing.id).changes > 0;
        if (hasTable('user_recovery_codes')) db.run('DELETE FROM user_recovery_codes WHERE user_id = ?', existing.id);
      }
      return { action: 'reset', id: existing.id, name: name || existing.name, sessions, twoFactorReset, linksRevoked };
    }
    const firstUser = Number(db.value('SELECT COUNT(*) FROM users')) === 0;
    const row = { role: 'admin', username, name: name || 'مدير النظام', password_hash: hashPassword(password), active: 1, created_at: now };
    if (userCols.has('password_changed_at')) row.password_changed_at = now;
    const id = db.insert('users', row);
    if (firstUser && hasTable('system_setup')) {
      db.run(
        `INSERT INTO system_setup (id, token_hash, method, completed_at, completed_by) VALUES (1, NULL, 'cli', ?, ?)
         ON CONFLICT(id) DO UPDATE SET token_hash = NULL, token_expires_at = NULL, method = 'cli', completed_at = excluded.completed_at, completed_by = excluded.completed_by`,
        now,
        id,
      );
    }
    return { action: 'create', id, name: row.name, firstUser };
  });
} catch (e) {
  db.close();
  fail(e.message);
}

// سجل الأمان
try {
  db.insert('security_events', {
    type: outcome.action === 'create' ? 'system.admin_cli_created' : 'system.admin_cli_reset',
    severity: 'critical',
    user_id: outcome.id,
    actor_name: 'سطر أوامر الخادم',
    ip: null,
    user_agent: `cli (${process.env.USER || process.env.USERNAME || 'unknown'})`.slice(0, 300),
    summary:
      outcome.action === 'create'
        ? `أُنشئ حساب «إدارة النظام» ${username} من سطر أوامر الخادم`
        : `أُعيد تعيين كلمة مرور حساب «إدارة النظام» ${username} من سطر أوامر الخادم${outcome.twoFactorReset ? ' مع إلغاء التحقق بخطوتين' : ''}`,
    data: JSON.stringify({ username, action: outcome.action, sessions_revoked: outcome.sessions || 0, links_revoked: outcome.linksRevoked || 0, reset_2fa: !!args['reset-2fa'] }),
    created_at: nowIso(),
  });
} catch {
  // جدول سجل الأمان غير متاح في إصدار أقدم — لا نوقف الاسترداد
}
db.close();

if (outcome.action === 'create') {
  console.log(`تم إنشاء حساب «إدارة النظام» ${username} (${outcome.name}).`);
  if (outcome.firstUser) console.log('اكتمل الإعداد الأول للمنصة؛ لم يعد رابط /setup متاحًا.');
} else {
  console.log(`تمت إعادة تعيين كلمة مرور حساب «إدارة النظام» ${username} وإعادة تفعيله.`);
  console.log(outcome.sessions ? `أُنهيت كل الجلسات المفتوحة لهذا الحساب (عددها: ${outcome.sessions}).` : 'لم تكن هناك جلسات مفتوحة لهذا الحساب.');
  if (outcome.linksRevoked) console.log(`أُلغيت روابط إعادة التعيين أو الدعوة المعلقة لهذا الحساب (عددها: ${outcome.linksRevoked}).`);
  if (args['reset-2fa']) console.log(outcome.twoFactorReset ? 'أُلغي التحقق بخطوتين؛ فعّله من جديد من «حسابي والأمان» بعد الدخول.' : 'لم يكن التحقق بخطوتين مفعلًا لهذا الحساب.');
}
console.log(`ادخل من: ${config.publicBaseUrl || `http://localhost:${config.port}`}/app`);
