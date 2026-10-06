// التهيئة عند أول تشغيل (قاعدة بيانات بلا مستخدمين):
//   • الوضع التجريبي: بيانات تجريبية كاملة.
//   • الإنتاج مع ADMIN_USERNAME و ADMIN_PASSWORD: إنشاء حساب مدير النظام الأول من متغيرات البيئة.
//   • الإنتاج بدونهما: «وضع الإعداد الأول» — رابط /setup برمز عشوائي يُطبع في سجل التشغيل (يُخزن مُجزّأً فقط)
//     ويكمل منه المالك ملف المؤسسة وحساب مدير النظام ومفاتيح التكاملات.
import { hashPassword, passwordProblem } from './auth.js';
import { nowIso } from './util.js';
import { seedDemo } from './seed.js';
import { strongPasswordProblem, usernameProblem } from './services/system.js';

/**
 * @returns {Promise<{seeded:boolean, admin_created?:boolean, setup_required?:boolean, setup_url?:string, setup_token?:string,
 *   setup_expires_at?:string, warnings?:string[]}>}
 */
export async function bootstrap(app) {
  const users = Number(app.db.value('SELECT COUNT(*) FROM users'));
  if (users > 0) return { seeded: false };

  if (app.config.demo) {
    await seedDemo(app);
    app.system?.markSetupCompleted?.('demo');
    // نسخة احتياطية تجريبية بعد اكتمال كل البيانات (لا تمنع التشغيل إن تعذرت)
    try {
      app.system?.demoBackup?.();
    } catch (e) {
      app.log?.('demo backup failed', e);
    }
    return { seeded: true };
  }

  const { adminUsername, adminPassword } = app.config;
  if (adminUsername && adminPassword) {
    const uProblem = usernameProblem(adminUsername);
    if (uProblem) throw new Error(`ADMIN_USERNAME: ${uProblem}`);
    const problem = passwordProblem(adminPassword);
    if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
    const warnings = [];
    const strong = strongPasswordProblem(adminPassword, { username: adminUsername });
    if (strong) warnings.push(`ADMIN_PASSWORD ضعيفة (${strong}). غيّرها من «حسابي والأمان» فور الدخول، أو أعد تعيينها بالأمر: npm run admin -- --username ${adminUsername}`);
    const id = app.db.insert('users', {
      role: 'admin',
      username: adminUsername,
      name: 'مدير النظام',
      password_hash: hashPassword(adminPassword),
      active: 1,
      created_at: nowIso(),
    });
    app.system?.markSetupCompleted?.('env', id);
    app.audit?.log({
      actor: { id, name: 'مدير النظام' },
      type: 'system.setup_completed',
      severity: 'warning',
      summary: 'أُنشئ حساب مدير النظام الأول من متغيرات البيئة ADMIN_USERNAME / ADMIN_PASSWORD',
      data: { username: adminUsername, method: 'env' },
    });
    return { seeded: false, admin_created: true, warnings };
  }

  // وضع الإعداد الأول: لا نتوقف، بل ننتظر إكمال المالك للإعداد من المتصفح
  const setup = app.system.beginSetup();
  return { seeded: false, setup_required: true, setup_url: setup.url, setup_token: setup.token, setup_expires_at: setup.expires_at };
}
