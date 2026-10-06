// فحص ذاتي لدوال التوقيت والتنسيق: node test/fmt-selfcheck.mjs
// (يمكن نقله إلى test/ لاحقًا). يتحقق من التحويل ذهابًا وإيابًا بتوقيت القاهرة شتاءً وصيفًا وحول تغيير الساعة.
import assert from 'node:assert/strict';
import {
  isoToCairoInput, cairoInputToIso, isoToCairoDate, cairoDateToIso, cairoOffsetMs,
  relative, dueInfo, count, money, percent, date, dateTime, normalizeEgPhone,
} from '../public/assets/js/lib/fmt.js';

// شتاء (UTC+2) وصيف (UTC+3 — أُعيد العمل بالتوقيت الصيفي في مصر منذ 2023)
assert.equal(cairoInputToIso('2026-01-15T10:30'), '2026-01-15T08:30:00.000Z');
assert.equal(isoToCairoInput('2026-01-15T08:30:00.000Z'), '2026-01-15T10:30');
assert.equal(cairoInputToIso('2026-07-01T10:30'), '2026-07-01T07:30:00.000Z');
assert.equal(isoToCairoInput('2026-07-01T07:30:00.000Z'), '2026-07-01T10:30');
assert.equal(isoToCairoDate('2026-07-01T21:30:00Z'), '2026-07-02');
assert.equal(cairoDateToIso('2026-07-02'), '2026-07-01T21:00:00.000Z');
assert.equal(cairoDateToIso('2026-01-02', true), '2026-01-02T21:59:59.999Z');
// حول بداية التوقيت الصيفي (آخر جمعة في أبريل) ونهايته (آخر خميس في أكتوبر)
assert.equal(cairoOffsetMs(new Date('2026-04-23T21:59:00Z')) / 3600e3, 2);
assert.equal(cairoOffsetMs(new Date('2026-04-23T22:00:00Z')) / 3600e3, 3);
assert.equal(cairoInputToIso('2026-04-24T01:30'), '2026-04-23T22:30:00.000Z');
assert.equal(cairoInputToIso('2026-10-30T12:00'), '2026-10-30T10:00:00.000Z');
// ذهاب وإياب لكل ساعة في السنة (الساعة المكررة عند الرجوع تُقبل بأي من الحدثين)
for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 3600e3) {
  const iso = new Date(t).toISOString();
  const back = cairoInputToIso(isoToCairoInput(iso));
  if (back !== iso) assert.equal(isoToCairoInput(back), isoToCairoInput(iso), iso);
}
for (let t = Date.parse('2026-01-01T12:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 86400e3) {
  const d = isoToCairoDate(new Date(t).toISOString());
  assert.equal(isoToCairoDate(cairoDateToIso(d)), d);
}
// التنسيق العربي
const now = Date.parse('2026-10-06T12:00:00Z');
assert.equal(relative(new Date(now - 3 * 3600e3).toISOString(), now), 'منذ 3 ساعات');
assert.equal(relative(new Date(now + 2 * 86400e3).toISOString(), now), 'بعد يومين');
assert.equal(relative(new Date(now - 15 * 86400e3).toISOString(), now), 'منذ 15 يومًا');
assert.equal(dueInfo(new Date(now - 2 * 86400e3).toISOString(), now).text, 'متأخر منذ يومين');
assert.equal(dueInfo(new Date(now + 5 * 3600e3).toISOString(), now).tone, 'warning');
assert.equal(count(11, 'char'), '11 حرفًا');
assert.equal(money(1500), '1,500 ج.م');
assert.equal(percent(0.734), '73%');
assert.equal(date('2026-11-15T08:30:00Z'), '15 نوفمبر 2026');
assert.equal(dateTime('2026-11-15T08:30:00Z'), '15 نوفمبر 2026، 10:30 ص');
assert.equal(normalizeEgPhone('+20 101 234 5678'), '01012345678');
assert.equal(normalizeEgPhone('٠١٢٢٣٤٥٦٧٨٩'), '01223456789');
assert.equal(normalizeEgPhone('01312345678'), null);
console.log('fmt self-check: OK');
