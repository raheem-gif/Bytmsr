// قواعد كلمة المرور في الواجهة (مطابقة لـ passwordProblem في src/auth.js) ومؤشر قوة بسيط.
import { h } from '../../lib/h.js';

export const PASSWORD_HINT = 'ثمانية أحرف على الأقل تجمع بين الحروف والأرقام، ولا تحتوي على اسم المستخدم';

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '0123456789', '87654321', '11111111', '00000000', '12341234', '11223344',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword1', 'qwerty123', 'qwertyuiop',
  'qwerty12', '1qaz2wsx', 'abc12345', 'abcd1234', 'abcdefg1', 'admin123', 'admin1234', 'admin@123', 'admin@1234',
  'iloveyou1', 'welcome1', 'welcome123', 'letmein1', 'changeme1', 'egypt123', 'cairo123', 'misr1234', 'lawyer123',
]);

/** نفس رسائل الخادم بالعربية، أو null إن كانت كلمة المرور مقبولة */
export function passwordProblem(password, username = '') {
  const p = String(password || '');
  if (p.length < 8) return 'كلمة المرور يجب ألا تقل عن 8 أحرف';
  if (p.length > 200) return 'كلمة المرور أطول من المسموح';
  if (!/\p{L}/u.test(p) || !/\p{N}/u.test(p)) return 'كلمة المرور يجب أن تجمع بين الحروف والأرقام';
  const lower = p.toLowerCase();
  if (COMMON.has(lower)) return 'كلمة المرور شائعة وسهلة التخمين، اختر كلمة مرور أخرى';
  if (new Set(lower).size < 4) return 'كلمة المرور ضعيفة: تتكرر فيها الأحرف نفسها، اختر كلمة مرور أكثر تنوعًا';
  const u = String(username || '').trim().toLowerCase();
  if (u.length >= 3 && lower.includes(u)) return 'كلمة المرور يجب ألا تحتوي على اسم المستخدم';
  return null;
}

/** درجة تقريبية 0–4 للعرض فقط */
export function passwordScore(password, username = '') {
  const p = String(password || '');
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/\p{L}/u.test(p) && /\p{N}/u.test(p)) s++;
  if (/[^\p{L}\p{N}]/u.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++;
  if (passwordProblem(p, username)) s = Math.min(s, 1);
  return s;
}

const LEVELS = [
  ['', ''],
  ['ضعيفة', 'danger'],
  ['مقبولة', 'warning'],
  ['جيدة', 'info'],
  ['قوية', 'success'],
];

/**
 * مؤشر قوة يُربط بحقل كلمة مرور داخل نموذج form(): attachStrength(formApi, 'password', () => username)
 */
export function attachStrength(formApi, fieldName, getUsername = () => '') {
  const c = formApi.control(fieldName);
  if (!c || !c.input) return null;
  const bar = h('span.acc-strength-bar');
  const text = h('span.acc-strength-text', { 'aria-live': 'polite' });
  const meter = h('div.acc-strength', { 'data-level': '0' }, h('span.acc-strength-track', bar), text);
  const update = () => {
    const v = c.input.value;
    const score = v ? passwordScore(v, getUsername()) : 0;
    const problem = v ? passwordProblem(v, getUsername()) : null;
    meter.dataset.level = String(score);
    text.textContent = v ? (problem ? `غير مقبولة: ${problem}` : `قوة كلمة المرور: ${LEVELS[score][0] || 'مقبولة'}`) : '';
  };
  c.input.addEventListener('input', update);
  c.wrap.append(meter);
  update();
  return meter;
}
