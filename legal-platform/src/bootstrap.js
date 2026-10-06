// التهيئة عند أول تشغيل: بيانات تجريبية في الوضع التجريبي، أو حساب مدير النظام من متغيرات البيئة في الإنتاج.
import { hashPassword, passwordProblem } from './auth.js';
import { nowIso } from './util.js';
import { seedDemo } from './seed.js';

export async function bootstrap(app) {
  const users = Number(app.db.value('SELECT COUNT(*) FROM users'));
  if (users > 0) return { seeded: false };
  if (app.config.demo) {
    await seedDemo(app);
    return { seeded: true };
  }
  const { adminUsername, adminPassword } = app.config;
  if (!adminUsername || !adminPassword) {
    throw new Error(
      'قاعدة البيانات فارغة. في وضع الإنتاج يجب ضبط ADMIN_USERNAME و ADMIN_PASSWORD لإنشاء حساب مدير النظام الأول ' +
        '(أو شغّل بالوضع التجريبي DEMO=1).',
    );
  }
  const problem = passwordProblem(adminPassword);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  app.db.insert('users', {
    role: 'admin',
    username: adminUsername,
    name: 'مدير النظام',
    password_hash: hashPassword(adminPassword),
    active: 1,
    created_at: nowIso(),
  });
  return { seeded: false, admin_created: true };
}
