// مكتبة المكونات: كل دالة تعيد عقدة DOM مبنية بـ h() دون innerHTML.

import { h, svg, frag, mount, clear } from './h.js';
import { ApiError, downloadUrl, formatBytes, GENERIC_ERROR } from './api.js';
import {
  label as lbl,
  dateTime,
  relative,
  time as fmtTime,
  dayLabel,
  isoToCairoDate,
  isoToCairoInput,
  cairoInputToIso,
  cairoDateToIso,
  normalizeEgPhone,
  toLatinDigits,
  count,
  dueInfo,
  getMeta,
} from './fmt.js';
// v10 experience (X10-M2/M3): أوراق تتبع الإصبع ونوافذ تتجسّد من الزر الذي فتحها
import { attachSheet } from './sheet-motion.js';
import { spring, SPRING, reducedMotion } from './spring.js';

let uidSeq = 0;
/** معرّف فريد لعناصر الصفحة. */
export function uid(prefix = 'ui') {
  uidSeq += 1;
  return `${prefix}-${uidSeq}`;
}

// أكواد الملفات (INH-2026-00482) وأرقام الهواتف المكتوبة بمسافات (+20 100 000 0000)
const LTR_TOKEN_RE = /([A-Z]{2,5}-\d{4}-\d{2,6}|[A-Z]{2,5}-\d{5}|\+?\d[\d ]{7,}\d)/g;

/**
 * نص عادي مع عزل الأكواد وأرقام الهواتف باتجاه LTR ومنع كسرها بين سطرين.
 * يعيد مصفوفة عقد صالحة كأبناء لـ h(). richText('رأي في الملف INH-2026-00482')
 */
export function richText(text) {
  const parts = String(text ?? '').split(LTR_TOKEN_RE);
  return parts.map((p, i) => (i % 2 ? h('span.ltr.nowrap', { dir: 'ltr' }, p) : p)).filter((p) => p !== '');
}

/** رسالة عربية آمنة للعرض من أي خطأ. */
export function errorMessage(err) {
  if (!err) return GENERIC_ERROR;
  if (typeof err === 'string') return err;
  if (err instanceof ApiError) return err.message;
  const msg = String(err.message || '');
  if (/[؀-ۿ]/.test(msg)) return msg;
  console.error(err); // eslint-disable-line no-console
  return 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

// ───────────────────────── الأيقونات ─────────────────────────
// رسومات خطية 24×24 (مستوحاة من Feather/Lucide — رخصة MIT/ISC).
// الصيغة: 'c cx cy r' دائرة، 'r x y w h rx' مستطيل، 'l x1 y1 x2 y2' خط، 'p …' polyline، 'g …' polygon، وغير ذلك path.
export const ICONS = {
  inbox: ['p 22 12 16 12 14 15 10 15 8 12 2 12', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  queue: ['g 12 2 2 7 12 12 22 7 12 2', 'p 2 17 12 22 22 17', 'p 2 12 12 17 22 12'],
  briefcase: ['r 2 7 20 14 2', 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  gavel: ['m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8', 'm16 16 6-6', 'm8 8 6-6', 'm9 7 8 8', 'm21 11-8-8'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'c 9 7 4', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'c 12 7 4'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'c 8.5 7 4', 'l 20 8 20 14', 'l 23 11 17 11'],
  scale: ['m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z', 'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z', 'M7 21h10', 'M12 3v18', 'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2'],
  chart: ['l 18 20 18 10', 'l 12 20 12 4', 'l 6 20 6 14', 'l 3 20 21 20'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  settings: ['c 12 12 3', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'p 16 17 21 12 16 7', 'l 21 12 9 12'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21', 'M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1'],
  globe: ['c 12 12 10', 'l 2 12 22 12', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'],
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'p 22 6 12 13 2 6'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'p 14 2 14 8 20 8'],
  fileText: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'p 14 2 14 8 20 8', 'l 16 13 8 13', 'l 16 17 8 17', 'l 10 9 8 9'],
  paperclip: ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'p 17 8 12 3 7 8', 'l 12 3 12 15'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'p 7 10 12 15 17 10', 'l 12 15 12 3'],
  check: ['p 20 6 9 17 4 12'],
  checkCircle: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'p 22 4 12 14.01 9 11.01'],
  x: ['l 18 6 6 18', 'l 6 6 18 18'],
  clock: ['c 12 12 10', 'p 12 6 12 12 16 14'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'l 12 9 12 13', 'l 12 17 12.01 17'],
  info: ['c 12 12 10', 'l 12 16 12 12', 'l 12 8 12.01 8'],
  sparkle: ['M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z', 'M20 3v4', 'M22 5h-4', 'M4 17v2', 'M5 18H3'],
  lock: ['r 3 11 18 11 2', 'M7 11V7a5 5 0 0 1 10 0v4'],
  eye: ['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z', 'c 12 12 3'],
  eyeOff: ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24', 'l 1 1 23 23'],
  plus: ['l 12 5 12 19', 'l 5 12 19 12'],
  minus: ['l 5 12 19 12'],
  send: ['l 22 2 11 13', 'g 22 2 15 22 11 13 2 9 22 2'],
  search: ['c 11 11 8', 'l 21 21 16.65 16.65'],
  menu: ['l 3 12 21 12', 'l 3 6 21 6', 'l 3 18 21 18'],
  chevronLeft: ['p 15 18 9 12 15 6'],
  chevronRight: ['p 9 18 15 12 9 6'],
  chevronDown: ['p 6 9 12 15 18 9'],
  chevronUp: ['p 18 15 12 9 6 15'],
  arrowLeft: ['l 19 12 5 12', 'p 12 19 5 12 12 5'],
  arrowRight: ['l 5 12 19 12', 'p 12 5 19 12 12 19'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  zap: ['g 13 2 3 14 12 14 11 22 21 10 12 10 13 2'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  calendar: ['r 3 4 18 18 2', 'l 16 2 16 6', 'l 8 2 8 6', 'l 3 10 21 10'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  externalLink: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'p 15 3 21 3 21 9', 'l 10 14 21 3'],
  refresh: ['p 23 4 23 10 17 10', 'p 1 20 1 14 7 14', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  shieldCheck: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'p 9 12 11 14 15 10'],
  filter: ['g 22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3'],
  edit: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
  trash: ['p 3 6 5 6 21 6', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  home: ['M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'p 9 22 9 12 15 12 15 22'],
  copy: ['r 9 9 13 13 2', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  mapPin: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'c 12 10 3'],
  more: ['c 12 12 1', 'c 19 12 1', 'c 5 12 1'],
  star: ['g 12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'l 4 22 4 15'],
  dot: ['c 12 12 4'],
  // v9.2 (admin-ai) — القصص الواردة: رسالة صوتية، عرض البطاقات/القائمة، اتصال لم ينجح، نقل رسالة إلى طلب جديد
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  'phone-off': [
    'M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91',
    'l 22 2 2 22',
  ],
  split: ['M16 3h5v5', 'M8 3H3v5', 'M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3', 'm15 9 6-6'],
  // v10 experience (L-45) — أيقونات خدمة الشركات لكل المسارات (شبكة Lucide 24 بنفس سُمك الخط)
  fileSignature: ['M20 19.5v.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8.5L18 5.5', 'M8 18h1', 'M18.42 9.61a2.1 2.1 0 1 1 2.97 2.97L16.95 17 13 18l.99-3.95 4.43-4.44Z'],
  filePen: ['M12.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v9.5', 'M14 2v4a2 2 0 0 0 2 2h4', 'M13.38 15.63a1 1 0 1 0-3-3l-5.02 5.01a2 2 0 0 0-.5.86l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .86-.5z'],
  fileLock: ['M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v1', 'M14 2v4a2 2 0 0 0 2 2h4', 'r 2 13 8 5 1', 'M8 13v-2a2 2 0 1 0-4 0v2'],
  userCog: ['c 18 15 3', 'c 9 7 4', 'M10 15H6a4 4 0 0 0-4 4v2', 'm21.7 16.4-.9-.3', 'm15.2 13.9-.9-.3', 'm16.6 18.7.3-.9', 'm19.1 12.2.3-.9', 'm19.6 18.7-.4-1', 'm16.8 12.3-.4-1', 'm14.3 16.6 1-.4', 'm20.7 13.8 1-.4'],
  megaphone: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  mailWarning: ['M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12.5', 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7', 'M20 14v4', 'M20 22v.01'],
  landmark: ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2l8 5H4z'],
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14', 'c 17 18 2', 'c 7 18 2'],
  calendarClock: ['M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5', 'M16 2v4', 'M8 2v4', 'M3 10h5', 'M17.5 17.5 16 16.3V14', 'c 16 16 6'],
  helpCircle: ['c 12 12 10', 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', 'M12 17h.01'],
  building: ['M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z', 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2', 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2', 'M10 6h4', 'M10 10h4', 'M10 14h4', 'M10 18h4'],
  bookOpen: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  // v11 visual (§5.8): «خيري» (قلب) و«تغيير نوع الخدمة» (سهمان متعاكسان)
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  swap: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
};
ICONS.moreHorizontal = ICONS.more;
ICONS.inboxStack = ICONS.queue;
ICONS.warning = ICONS.alert;
ICONS.close = ICONS.x;

// أيقونات اتجاهية تنعكس تلقائيًا في الواجهة العربية
const DIRECTIONAL = new Set(['send', 'logout']);

function shape(spec) {
  const [kind, ...rest] = spec.split(' ');
  switch (kind) {
    case 'c':
      return svg('circle', { cx: rest[0], cy: rest[1], r: rest[2] });
    case 'r':
      return svg('rect', { x: rest[0], y: rest[1], width: rest[2], height: rest[3], rx: rest[4] || 0 });
    case 'l':
      return svg('line', { x1: rest[0], y1: rest[1], x2: rest[2], y2: rest[3] });
    case 'p':
      return svg('polyline', { points: rest.join(' ') });
    case 'g':
      return svg('polygon', { points: rest.join(' ') });
    default:
      return svg('path', { d: spec });
  }
}

/** أيقونة SVG خطية. icon('inbox', { size: 18 }) */
export function icon(name, { size = 20, className, label } = {}) {
  const def = ICONS[name] || ICONS.dot;
  return svg(
    'svg',
    {
      class: ['icon', `icon-${name}`, DIRECTIONAL.has(name) && 'icon-dir', className],
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75, // v11 visual (V11-20): خط واحد 1.75
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      'aria-hidden': label ? null : 'true',
      role: label ? 'img' : null,
      'aria-label': label || null,
    },
    def.map(shape),
  );
}

/** أسماء الأيقونات المتاحة. */
export const iconNames = Object.keys(ICONS);

// v11 visual (V-4، L11-05): في كل شريط وقائمة جانبية علامة «EMAM إمام» الخضراء كصورة مخزّنة (لا يُعاد تلوينها بألوان
// المؤسسة، V11-04 القاعدة 7). حين يُوقف اسم المكتب في /app (brand_in_staff_app=false: staff_chrome ≠ الاسم) يعود رمز
// الميزان واسم المؤسسة كما في 9.2 (J6). نص الاسم يبقى في الصفحة لقارئ الشاشة (الصورة alt="").
function brandChromeOn() {
  const b = getMeta()?.brand || {};
  const sc = b.staff_chrome;
  return !sc || !sc.name || !b.name || sc.name === b.name;
}

/** شعار المؤسسة المصغر: علامة «EMAM إمام» (v11)، أو الميزان داخل مربع ذهبي حين يُوقف اسم المكتب في /app. */
export function brandMark({ size = 24 } = {}) {
  if (brandChromeOn()) return h('img.brand-logo', { src: '/assets/img/emam-mark-green.svg', alt: '', width: Math.round(size * 5.2), height: size, decoding: 'async' });
  return h('span.brand-mark', { 'aria-hidden': 'true' }, icon('scale', { size }));
}

/**
 * v11 visual (V11-04 القاعدتان 1 و2): الشعار الكامل لشاشات الدخول — الذهبي الغامق على الأبيض (tone 'deep')، والذهبي
 * الفاتح على أرضية الشعار الغامقة (tone 'bright'). العرض ≥ 200px، والنص البديل = اسم المكتب من الإعدادات (L11-33).
 * يعيد null حين يُوقف اسم المكتب في /app (تبقى شاشة 9.2 النصية).
 */
export function brandLockup({ tone = 'deep', width = 240 } = {}) {
  if (!brandChromeOn()) return null;
  const name = brandNames().name;
  return h('img.brand-lockup', {
    src: `/assets/img/emam-logo-${tone === 'bright' ? 'gold' : 'gold-deep'}.svg`,
    alt: name,
    width: Math.max(200, width),
    height: Math.round((Math.max(200, width) * 582) / 1392),
    decoding: 'async',
    ...nameDir(name),
  });
}

// ───────────────────────── v10 experience: اسم المكتب (X10-B2, §4.1) ─────────────────────────
// مصدره meta.brand (/api/meta و/api/company/meta كلاهما يحملانه). يُعزل دائمًا بـ <bdi dir="ltr" lang="en"> داخل الجمل
// العربية، ولا تباعد حروف على العربية حوله.
const BRAND_FALLBACK = { name: 'Emam Legal and Consultancy', short: 'Emam Legal' };
function brandNames() {
  const b = getMeta()?.brand || {};
  const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : BRAND_FALLBACK.name;
  const short = typeof b.short === 'string' && b.short.trim() ? b.short.trim() : BRAND_FALLBACK.short;
  return { name, short };
}

/** سطرا الشعار النصي (نفس قاعدة الخادم src/brand.js): { lead: المختصر، rest: بقية الاسم } أو { lead: الاسم، rest: '' } */
export function wordmarkParts(name = brandNames().name, short = brandNames().short) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  const sh = String(short ?? '').replace(/\s+/g, ' ').trim();
  if (sh && n.toLowerCase().startsWith(sh.toLowerCase())) return { lead: n.slice(0, sh.length), rest: n.slice(sh.length).trim() };
  return { lead: n, rest: '' };
}

// اسم لاتيني ← dir="ltr" lang="en"؛ وإن كتبت الإدارة اسمًا عربيًا يبقى معزولًا لكن بلغته واتجاهه
const nameDir = (s) => (/[\u0600-\u06FF]/.test(s) ? { dir: 'rtl', lang: 'ar' } : { dir: 'ltr', lang: 'en' });

/** اسم المكتب داخل جملة عربية: <bdi class="wordmark" dir="ltr" lang="en">…</bdi> (short = الاسم المختصر) */
export function brandEl({ short = false } = {}) {
  const b = brandNames();
  const text = short ? b.short : b.name;
  return h('bdi.wordmark', nameDir(text), text);
}

/**
 * الشعار النصي على سطرين: <bdi class="wordmark wordmark-{size} wordmark-{tone}" dir="ltr" lang="en"><b>{lead}</b> <span>{rest}</span></bdi>
 * size: 'md' | 'lg'؛ tone: 'light' (على سطح فاتح: نص أخضر) | 'dark' (على سطح غامق: أبيض وذهبي فاتح)؛
 * descriptor: سطر عربي اختياري تحته (span.wordmark-desc) فيُعاد الكل داخل span.wordmark-lockup.
 * name/short اختياريان (مثل meta.brand.staff_chrome في /app)؛ الافتراضي meta.brand.
 */
export function wordmark({ size = 'md', tone = 'light', descriptor, name, short } = {}) {
  const b = brandNames();
  const parts = wordmarkParts(name ?? b.name, short ?? (name != null ? '' : b.short));
  const mark = h(
    'bdi.wordmark',
    { class: [`wordmark-${size === 'lg' ? 'lg' : 'md'}`, `wordmark-${tone === 'dark' ? 'dark' : 'light'}`], ...nameDir(parts.lead + parts.rest) },
    h('b', parts.lead),
    parts.rest ? [' ', h('span', parts.rest)] : null,
  );
  if (!descriptor) return mark;
  return h('span.wordmark-lockup', mark, h('span.wordmark-desc', descriptor));
}

// ───────────────────────── الأزرار ─────────────────────────

/**
 * زر. button('حفظ', { variant: 'primary'|'secondary'|'ghost'|'danger'|'accent'|'whatsapp'|'link', size: 'sm'|'md'|'lg', icon, onClick, href })
 * مع href يُعاد رابط <a> بنفس الشكل.
 */
export function button(label, opts = {}) {
  const {
    variant = 'secondary',
    size = 'md',
    icon: iconName,
    iconEnd,
    onClick,
    type = 'button',
    disabled,
    title,
    className,
    href,
    target,
    ariaLabel,
    block,
    dataset,
  } = opts;
  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18;
  const hasLabel = label != null && label !== '';
  const content = [
    iconName && icon(iconName, { size: iconSize }),
    hasLabel && h('span.btn-label', label),
    iconEnd && icon(iconEnd, { size: iconSize }),
  ];
  const cls = ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, !hasLabel && 'btn-icon', block && 'btn-block', className];
  const aria = ariaLabel || (!hasLabel ? title : null);
  if (href) {
    return h(
      'a',
      {
        class: cls,
        href,
        target,
        rel: target === '_blank' ? 'noopener noreferrer' : null,
        title,
        'aria-label': aria,
        dataset,
        onClick,
      },
      content,
    );
  }
  return h('button', { type, class: cls, disabled, title, 'aria-label': aria, dataset, onClick }, content);
}

/** يضع الزر في حالة انتظار (spinner) أو يعيده. */
export function setBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevDisabled = btn.disabled ? '1' : '';
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.setAttribute('aria-busy', 'true');
  } else {
    btn.disabled = btn.dataset.prevDisabled === '1';
    delete btn.dataset.prevDisabled;
    btn.classList.remove('is-loading');
    btn.removeAttribute('aria-busy');
  }
}

/**
 * زر لعملية غير متزامنة: يُعطَّل ويعرض مؤشر انتظار، وتظهر الأخطاء في toast.
 * @param {string} label
 * @param {(e:Event, btn:HTMLButtonElement)=>Promise<any>} handler
 * @param {object} [opts] نفس خيارات button()
 */
export function asyncButton(label, handler, opts = {}) {
  const btn = button(label, {
    ...opts,
    onClick: async (e) => {
      if (btn.classList.contains('is-loading')) return;
      setBusy(btn, true);
      try {
        await handler(e, btn);
      } catch (err) {
        if (!(err && err.name === 'AbortError')) toast(errorMessage(err), 'danger');
      } finally {
        setBusy(btn, false);
      }
    },
  });
  return btn;
}

// ───────────────────────── الشارات ─────────────────────────

/** شارة ملونة. tone: neutral|info|success|warning|danger|accent|muted|primary */
export function badge(text, tone = 'neutral', { icon: iconName, dot, title, className } = {}) {
  return h(
    'span.badge',
    { class: [`badge-${tone}`, dot && 'badge-dot', className], title },
    iconName && icon(iconName, { size: 13 }),
    h('span', text == null || text === '' ? '—' : String(text)),
  );
}

// درجات الألوان لكل حالة في LABELS
// v11 gate fix (K1/J-07/R-06): no status, role or kind uses 'primary' (green tint) or 'accent' (gold) —
// those fills are reserved for the segment chips (gold = خيري, green = أفراد/شركة; r2 P12 / L11-16).
const STATUS_TONES = {
  user_role: { admin: 'neutral', case_manager: 'info', lawyer: 'neutral' },
  channel: { whatsapp: 'success', website: 'info', phone: 'neutral', walk_in: 'neutral', email: 'neutral' },
  source: {
    facebook_ad: 'info',
    instagram_ad: 'info',
    meta_ad: 'info',
    google: 'warning',
    direct: 'neutral',
    referral: 'success',
    social_organic: 'neutral',
    returning: 'neutral',
    other: 'muted',
    unknown: 'muted',
  },
  intake_status: {
    new: 'info',
    in_review: 'warning',
    awaiting_client: 'neutral',
    handled_internally: 'success',
    converted: 'success',
    archived: 'muted',
  },
  intake_kind: { inquiry: 'neutral', consultation: 'info' },
  priority: { low: 'muted', normal: 'neutral', high: 'warning', urgent: 'danger' },
  case_status: {
    new: 'info',
    assigned: 'neutral',
    in_progress: 'info',
    under_review: 'warning',
    approved: 'success',
    answered: 'success',
    closed: 'muted',
  },
  case_outcome: {
    answered: 'success',
    resolved: 'success',
    referred_matter: 'info',
    client_withdrew: 'muted',
    not_eligible: 'neutral',
    duplicate: 'muted',
  },
  assignment_role: { lead: 'neutral', specialist: 'info', second_opinion: 'info', reviewer: 'info', co_counsel: 'neutral' },
  assignment_status: {
    assigned: 'info',
    in_progress: 'neutral',
    submitted: 'warning',
    returned: 'danger',
    approved: 'success',
    withdrawn: 'muted',
  },
  fee_mode: { agreement: 'neutral', custom: 'info', pro_bono: 'neutral' },
  info_request_kind: { information: 'info', document: 'neutral' },
  info_request_status: {
    pending_admin: 'warning',
    rejected: 'danger',
    sent_to_client: 'info',
    client_replied: 'warning',
    shared: 'success',
    cancelled: 'muted',
  },
  counsel_kind: { second_opinion: 'info', specialist_input: 'info', document_review: 'neutral', co_counsel: 'neutral' },
  counsel_status: { pending_admin: 'warning', assigned: 'info', completed: 'success', rejected: 'danger', cancelled: 'muted' },
  opinion_status: { draft: 'neutral', submitted: 'warning', returned: 'danger', approved: 'success', superseded: 'muted' },
  client_answer_status: { draft: 'warning', sent: 'success' },
  agreement_type: {
    per_case: 'info',
    monthly: 'info',
    monthly_quota: 'info',
    package: 'neutral',
    pro_bono: 'success',
    csr: 'success',
  },
  billable_trigger: { on_approval: 'neutral', on_close: 'neutral' },
  treatment: {
    payable: 'warning',
    included_monthly: 'info',
    included_quota: 'info',
    overage: 'warning',
    package_credit: 'info',
    package_overage: 'warning',
    pro_bono: 'success',
    csr: 'success',
  },
  ledger_kind: {},
  ledger_status: { accrued: 'warning', paid: 'success', void: 'muted' },
  matter_kind: { litigation: 'neutral', ongoing: 'info' },
  matter_status: { open: 'success', on_hold: 'warning', closed: 'muted' },
  event_kind: { hearing: 'warning', meeting: 'info', expert: 'neutral', appointment: 'neutral', other: 'muted' },
  event_status: { scheduled: 'info', done: 'success', postponed: 'warning', cancelled: 'muted' },
  task_status: { open: 'info', done: 'success', cancelled: 'muted' },
  invoice_status: { unpaid: 'danger', partially_paid: 'warning', paid: 'success', cancelled: 'muted' },
  expense_paid_by: { organization: 'neutral', lawyer: 'warning', client: 'neutral' },
  knowledge_status: { pending_review: 'warning', approved: 'success', excluded: 'muted' },
  knowledge_usage: { none: 'muted', knowledge: 'info', knowledge_training: 'success' },
  message_status: {
    received: 'neutral',
    queued: 'muted',
    sent: 'info',
    delivered: 'info',
    read: 'success',
    failed: 'danger',
    simulated: 'neutral',
  },
  ai_field: {},
  ai_verdict: { accepted: 'success', corrected: 'warning', rejected: 'danger', missed: 'danger' },
  automation_rule: {},
  actor_kind: { staff: 'neutral', lawyer: 'info', client: 'neutral', system: 'muted', ai: 'info' },
};

/** درجة اللون المناسبة لحالة معينة. */
export { STATUS_TONES };

export function statusTone(group, key) {
  return STATUS_TONES[group]?.[key] || 'neutral';
}

/** شارة حالة بالمسمى العربي واللون المعرّف للمجموعة. statusBadge('case_status', 'closed') */
export function statusBadge(group, key, opts = {}) {
  if (key == null || key === '') return badge('—', 'muted');
  return badge(lbl(group, key), statusTone(group, key), { dot: true, ...opts });
}

/** شارة موعد استحقاق ملونة (متأخر/قريب/عادي). */
export function dueBadge(iso) {
  const info = dueInfo(iso);
  return badge(info.text, info.tone, { icon: 'clock', title: iso ? dateTime(iso) : null });
}

// ───────────────────────── Toast ─────────────────────────

let toastRegion = null;
function getToastRegion() {
  if (!toastRegion || !toastRegion.isConnected) {
    toastRegion = h('div.toast-region', { 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

const TOAST_ICONS = { info: 'info', success: 'checkCircle', warning: 'alert', danger: 'alert' };

/** رسالة منبثقة أعلى منتصف الشاشة. toast('تم الحفظ', 'success') */
export function toast(message, tone = 'info', ms = 3500) {
  const region = getToastRegion();
  // v10 (X10-F1/X10-P4): الخروج من نفس حافة الدخول، والإزالة عند انتهاء الانتقال (لا مؤقت يؤخر التنبيه التالي)
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    el.classList.remove('is-shown');
    el.classList.add('is-leaving');
    const done = () => el.remove();
    // انتقال زر الإغلاق (تمرير/ضغط) يصعد إلى التنبيه: لا يُحسب نهايةً لخروجه
    el.addEventListener('transitionend', (e) => e.target === el && done());
    setTimeout(done, 400);
  };
  const el = h(
    'div.toast',
    // المنطقة الحية تعلن الرسائل العادية؛ الأخطاء تُعلن فورًا بدور alert
    { class: `toast-${tone}`, role: tone === 'danger' ? 'alert' : null },
    icon(TOAST_ICONS[tone] || 'info', { size: 18 }),
    h('div.toast-msg', message),
    h('button.toast-close', { type: 'button', 'aria-label': 'إغلاق التنبيه', onClick: close }, icon('x', { size: 16 })),
  );
  region.appendChild(el);
  void el.offsetWidth; // نقطة البداية (خارج الحافة) تُرسم قبل الدخول
  el.classList.add('is-shown');
  if (ms > 0) setTimeout(close, tone === 'danger' ? Math.max(ms, 6000) : ms);
  return { close, el };
}

// ───────────────────────── النوافذ الحوارية ─────────────────────────

const modalStack = [];
// v10 experience (L-64): قفل تمرير الصفحة عدّادٌ لا صنف يُزال: نافذة تُغلق ثم أخرى تُفتح (أو ورقتان متراكبتان)
// لا تفتح التمرير خلف النافذة الباقية. كل نافذة تقفل مرة عند الفتح وتفتح مرة عند إغلاقها المنطقي.
let scrollLocks = 0;
function lockScroll() {
  scrollLocks += 1;
  document.body.classList.add('has-modal');
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (!scrollLocks) document.body.classList.remove('has-modal');
}
// v10 (X10-M2/M3): الحركة في متصفح حقيقي فقط؛ بيئة بلا matchMedia/rAF (اختبارات Node) تُزيل العقدة بمؤقت كما في 9.2
const canMove = () => typeof globalThis.matchMedia === 'function' && typeof globalThis.requestAnimationFrame === 'function';
const POP_EXIT = { damping: 1, response: 0.3 };

/**
 * الحركة المخفّضة: تلاشٍ بالشفافية فقط خلال 150ms (انتقال CSS — نفس مدة قاعدة الحركة المخفّضة العامة في app.css، فلا
 * يتراكب انتقالان). يبدأ بعد إطار (نقطة البداية مرسومة) ويُزال أثره بعد الانتهاء → { stop(), done }
 */
function fadeCss(els, to) {
  let raf = 0;
  let timer = 0;
  let res;
  const done = new Promise((r) => (res = r));
  for (const el of els) el.style.transition = 'opacity 150ms ease';
  raf = requestAnimationFrame(() => {
    for (const el of els) el.style.opacity = to >= 1 ? '' : String(to);
    timer = setTimeout(() => {
      for (const el of els) el.style.transition = '';
      res(true);
    }, 160);
  });
  return {
    stop() {
      globalThis.cancelAnimationFrame?.(raf);
      clearTimeout(timer);
      for (const el of els) el.style.transition = '';
      res(false);
    },
    done,
  };
}

/**
 * X10-M3: نافذة تتجسّد من الزر الذي فتحها وتعود إليه: p من 0 إلى 1 → transform: scale(0.94 + 0.06p)، الشفافية p
 * (وللخلفية المعتمة p)، ومركز التحويل = مركز الزر داخل النافذة (أو منتصفها إن اختفى الزر). نابض SPRING.ui بلا ارتداد؛
 * فتح جديد أثناء خروج نافذة = نافذة جديدة (لا شيء مقفول). الحركة المخفّضة: شفافية فقط خلال 150ms.
 * → { in(), out() → Promise (تُحسم حين تكاد تختفي)، stop() }
 */
function materialise(dialog, scrim, trigger) {
  const reduce = reducedMotion();
  let p = 0;
  let anim = null;
  const aim = () => {
    if (reduce) return; // بلا تحجيم؛ ولا قراءة للتخطيط قبل الشفافية 0 (وإلا بدأ انتقال CSS من 1 إلى 0)
    const ok = trigger && trigger !== document.body && trigger.isConnected && typeof trigger.getBoundingClientRect === 'function';
    const t = ok ? trigger.getBoundingClientRect() : null;
    const r = dialog.getBoundingClientRect();
    if (!t || !t.width || !r.width) return void (dialog.style.transformOrigin = '');
    const clamp = (v, max) => Math.round(Math.max(0, Math.min(max, v)));
    dialog.style.transformOrigin = `${clamp(t.left + t.width / 2 - r.left, r.width)}px ${clamp(t.top + t.height / 2 - r.top, r.height)}px`;
  };
  const paint = (v) => {
    p = v;
    const rest = v >= 0.999;
    dialog.style.transform = rest || reduce ? '' : `scale(${(0.94 + 0.06 * v).toFixed(4)})`;
    dialog.style.opacity = scrim.style.opacity = rest ? '' : String(Math.max(0, v).toFixed(3));
  };
  const run = (to, exit) =>
    new Promise((res) => {
      anim?.stop();
      const onUpdate = (v) => (paint(v), exit && v <= 0.04 && res(true));
      // rest بوحدة p (0..1): الافتراضي 0.5 مصمم للبكسل وكان ينهي الحركة عند منتصفها فتقفز النافذة إلى 1 أو تختفي فجأة
      anim = reduce ? fadeCss([dialog, scrim], to) : spring({ from: p, to, ...(exit ? POP_EXIT : SPRING.ui), rest: 0.002, onUpdate });
      anim.done.then(res);
    });
  return {
    in() {
      aim();
      paint(0);
      return run(1, false);
    },
    out() {
      if (!trigger || !trigger.isConnected) dialog.style.transformOrigin = '';
      return run(0, true);
    },
    stop: () => anim?.stop(),
  };
}

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusablesIn(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]'));
}

/**
 * نافذة حوارية مع حبس التركيز وإغلاق بـ Esc.
 * actions: [{ label, variant, icon, onClick }] — onClick قد تكون async؛ إعادة false تُبقي النافذة مفتوحة،
 * والأخطاء تظهر في toast وتبقى النافذة مفتوحة.
 * @returns {{close:(reason?:string)=>void, el:HTMLElement, body:HTMLElement}}
 *
 * (v9.1 l-court — إضافات متوافقة مع السابق، كلها اختيارية)
 *  sheet: true      ورقة سفلية على الهاتف (≤ 640px: ملتصقة بأسفل الشاشة بعرضها، مقبض سحب، السحب لأسفل يغلق)،
 *                   ونافذة عرضها 480px على الحاسوب (size يُتجاهل).
 *  subtitle         سطر ثانوي تحت العنوان (مثل «عنوان الجلسة · الأربعاء 7 أكتوبر 9:30 ص»).
 *  beforeClose(reason) يُستدعى قبل إغلاق يبدؤه المستخدم ('dismiss' زر ✕، 'escape'، 'backdrop'، 'swipe')؛
 *                   إن أعاد false (أو Promise<false>) تبقى النافذة مفتوحة — لتأكيد «تجاهل ما أدخلته؟».
 *
 * (v10 experience — L-12/L-64) الإغلاق البرمجي (handle.close()، أزرار الإجراءات، إرسال النموذج، closeAllModals) ينفّذ
 * الإغلاق المنطقي فورًا وبالتزامن: إرجاع التركيز، رفع inert عن الصفحة، onClose(reason)، وفك قفل التمرير (عدّاد).
 * العقدة المغادرة تأخذ في اللحظة نفسها inert وaria-hidden="true" و.is-leaving، وتخرج من مكدس النوافذ ومن معالجة Esc،
 * ثم تُزال بعد انتهاء حركة الخروج (closeAllModals: فورًا بلا حركة). beforeClose للإغلاق الذي يبدؤه المستخدم فقط.
 */
export function modal({ title, body, actions = [], size = 'md', onClose, dismissible = true, className, sheet = false, subtitle, beforeClose } = {}) {
  const titleId = uid('modal-title');
  const previousFocus = document.activeElement;
  let closed = false;
  let busy = false;
  let asking = false;
  // v10 (X10-M2/M3): motion = ورقة الهاتف (attachSheet)، pop = تجسّد النافذة من زرها؛ exiting = خروج يبدؤه المستخدم جارٍ
  let motion = null;
  let pop = null;
  let exiting = false;

  /** beforeClose(reason) → true = أغلق (يقبل Promise) */
  async function mayClose(reason) {
    if (closed || busy || asking) return false;
    if (!beforeClose) return true;
    asking = true;
    try {
      return (await beforeClose(reason)) !== false;
    } catch {
      return false;
    } finally {
      asking = false;
    }
  }

  /** إغلاق يبدؤه المستخدم: يمر على beforeClose أولًا. على الهاتف تخرج الورقة من نفس مسارها، ومن يمسكها أثناء
   *  الخروج يوقفه فتبقى مفتوحة (L-12)؛ الإغلاق المنطقي بعد خروجها فقط. */
  async function requestDismiss(reason) {
    if (exiting || !(await mayClose(reason)) || closed) return;
    if (motion) {
      exiting = true;
      const out = await motion.exit(reason, { interruptible: true });
      exiting = false;
      if (out) close(reason, { exited: true });
      return;
    }
    close(reason);
  }

  const bodyEl = h('div.modal-body', typeof body === 'function' ? null : body);
  const footer = actions.length ? h('div.modal-footer') : null;
  const grip = sheet ? h('div.modal-grip', { 'aria-hidden': 'true' }) : null;
  const dialog = h(
    'div.modal',
    { class: [sheet ? 'modal-sheet' : `modal-${size}`, className], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    grip,
    h(
      'div.modal-header',
      subtitle ? h('div.modal-heading', h('h2.modal-title', { id: titleId }, title || ''), h('p.modal-subtitle', subtitle)) : h('h2.modal-title', { id: titleId }, title || ''),
      dismissible &&
        h('button.modal-close', { type: 'button', 'aria-label': 'إغلاق', onClick: () => requestDismiss('dismiss') }, icon('x', { size: 20 })),
    ),
    bodyEl,
    footer,
  );
  // v10 (X10-M2): الخلفية المعتمة طبقة مستقلة تتغير شفافيتها مع موضع الورقة (لا تُعتّم الورقة نفسها)
  const scrim = h('div.modal-scrim', { 'aria-hidden': 'true' });
  const backdrop = h('div.modal-backdrop', { class: sheet && 'modal-backdrop-sheet' }, scrim, dialog);
  const handle = { close, el: dialog, body: bodyEl, requestDismiss };

  // v10 (X10-M2): على الهاتف تتبع الورقة الإصبع 1:1 من المقبض أو الترويسة؛ رمية سريعة أو سحب بعد المنتصف يغلقها
  // (بعد beforeClose)، والتراجع يبقيها. يُقرَّر عند الفتح (≤ 640px) وفي متصفح حقيقي فقط.
  if (sheet && canMove() && globalThis.matchMedia('(max-width: 640px)').matches) {
    motion = attachSheet({
      panel: dialog,
      scrim,
      handles: dismissible ? [grip, dialog.querySelector('.modal-header')] : [],
      // gate K7: بعد «تجاهل» في السحب تكون الورقة خارجة — Esc أو ✕ أثناء الخروج لا يسألان مرة ثانية
      canDismiss: async (reason) => {
        if (exiting) return false;
        const ok = await mayClose(reason);
        if (ok) exiting = true;
        return ok;
      },
      onExitCancelled: () => {
        exiting = false;
      },
      onDismissed: (reason) => {
        exiting = false;
        close(reason, { exited: true });
      },
    });
  }

  const buttons = actions.map((a) => {
    const btn = button(a.label, { variant: a.variant || 'secondary', icon: a.icon, disabled: a.disabled });
    btn.addEventListener('click', async () => {
      if (busy || closed) return;
      busy = true;
      buttons.forEach((b) => (b.disabled = true));
      setBusy(btn, true);
      let keepOpen = false;
      try {
        const r = a.onClick ? await a.onClick(handle) : undefined;
        keepOpen = r === false;
      } catch (err) {
        keepOpen = true;
        toast(errorMessage(err), 'danger');
      } finally {
        setBusy(btn, false);
        buttons.forEach((b, i) => (b.disabled = Boolean(actions[i].disabled)));
        busy = false;
      }
      if (!keepOpen) close('action');
    });
    footer.appendChild(btn);
    return btn;
  });
  handle.buttons = buttons;

  if (typeof body === 'function') mount(bodyEl, body(handle));

  // إخفاء الخلفية عن قارئات الشاشة ولوحة المفاتيح
  const inerted = [];
  for (const child of document.body.children) {
    if (child === backdrop || child === toastRegion || child.inert) continue;
    if (child.tagName === 'SCRIPT') continue;
    child.inert = true;
    inerted.push(child);
  }

  function onKey(e) {
    if (modalStack[modalStack.length - 1] !== handle) return;
    if (e.key === 'Escape' && dismissible && !busy) {
      e.preventDefault();
      requestDismiss('escape');
    } else if (e.key === 'Tab') {
      const items = focusablesIn(dialog);
      if (!items.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  let downOnBackdrop = false;
  const outside = (e) => e.target === backdrop || e.target === scrim;
  backdrop.addEventListener('mousedown', (e) => (downOnBackdrop = outside(e)));
  backdrop.addEventListener('click', (e) => {
    if (outside(e) && downOnBackdrop && dismissible && !busy) requestDismiss('backdrop');
  });

  /**
   * الإغلاق المنطقي (L-12/L-64) فوري دائمًا: التركيز، inert، onClose، القفل. exited: الورقة خرجت بإيماءة المستخدم فعلًا؛
   * instant: بلا حركة (تغيّر الصفحة). وإلا تكمل حركة الخروج المرئية وحدها والعقدة لا تلتقط لمسًا.
   */
  function close(reason = 'close', { instant = false, exited = false } = {}) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    const idx = modalStack.indexOf(handle);
    if (idx >= 0) modalStack.splice(idx, 1);
    inerted.forEach((el) => (el.inert = false));
    // L-64: العقدة المغادرة خارج التفاعل وقارئات الشاشة فورًا، وحركة الخروج المرئية تكمل وحدها
    backdrop.inert = true;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.classList.add('is-leaving');
    const remove = () => {
      motion?.destroy();
      pop?.stop();
      backdrop.remove();
    };
    if (instant || exited) remove();
    else if (motion || pop) {
      (motion ? motion.exit(reason, { interruptible: false }) : pop.out()).then(remove);
      setTimeout(remove, 700); // تبويب في الخلفية لا يرسم إطارات: لا تبقى العقدة معلّقة
    } else setTimeout(remove, 150);
    unlockScroll();
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
    if (onClose) onClose(reason);
  }

  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  lockScroll();
  modalStack.push(handle);
  // v10: الدخول من نفس مسار الخروج — الورقة من أسفل الشاشة، والنافذة من الزر الذي فتحها (X10-M3)
  if (motion) motion.enter();
  else if (canMove()) {
    pop = materialise(dialog, scrim, previousFocus);
    pop.in();
  }

  // الورقة السفلية لا تفتح لوحة المفاتيح تلقائيًا (أول ما فيها اختيار لا كتابة) إلا لعنصر عليه autofocus
  const firstField = sheet ? bodyEl.querySelector('[autofocus]') : bodyEl.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
  requestAnimationFrame(() => (firstField || dialog).focus({ preventScroll: true }));
  return handle;
}

/** يغلق كل النوافذ المفتوحة (يُستدعى عند التنقل بين الصفحات). */
export function closeAllModals() {
  // v10 (L-12): فوري بلا حركة خروج (تغيّر الصفحة)
  [...modalStack].reverse().forEach((m) => m.close('navigation', { instant: true }));
}

/** نافذة تأكيد تعيد Promise<boolean>. */
export function confirmDialog({ title = 'تأكيد الإجراء', message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      size: 'sm',
      body: h('p.confirm-message', message || 'هل أنت متأكد من تنفيذ هذا الإجراء؟'),
      actions: [
        // لا نُرجع false هنا: modal() يعتبر false «أبقِ النافذة مفتوحة»
        { label: cancelLabel, variant: 'ghost', onClick: () => { result = false; } },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/** تأكيد لإجراء خطِر (زر أحمر). */
export function confirmDanger(opts = {}) {
  return confirmDialog({ confirmLabel: 'نعم، متابعة', ...opts, danger: true });
}

// ───────────── v10 experience (L-64, CO-19): لا يضيع نص مكتوب بإيماءة ─────────────
/** نصوص نافذة «تجاهل ما كتبتموه؟» (الجمع لبوابة الشركات، والمفرد لفريق العمل) */
export const DISCARD_COPY = Object.freeze({
  plural: Object.freeze({ title: 'تجاهل ما كتبتموه؟', discard: 'تجاهل', keep: 'متابعة الكتابة' }),
  singular: Object.freeze({ title: 'تجاهل ما كتبته؟', discard: 'تجاهل', keep: 'متابعة الكتابة' }),
});

/**
 * يسأل قبل إغلاق ورقة فيها نص مكتوب: [«تجاهل»] [«متابعة الكتابة»] → Promise<boolean> (true = تجاهل وأغلق).
 * Esc أو ✕ أو الخلفية = متابعة الكتابة. copy: { title, discard, keep, message } أو { singular: true } لصيغة المفرد.
 */
export function confirmDiscard(copy = {}) {
  const c = { ...(copy && copy.singular ? DISCARD_COPY.singular : DISCARD_COPY.plural), ...(copy || {}) };
  return new Promise((resolve) => {
    let result = false;
    modal({
      title: c.title,
      size: 'sm',
      className: 'modal-discard',
      body: c.message ? h('p.confirm-message', c.message) : null,
      actions: [
        { label: c.discard, variant: 'danger', onClick: () => { result = true; } },
        { label: c.keep, variant: 'secondary', onClick: () => { result = false; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/**
 * beforeClose جاهز لورقة فيها حقل نصي: يغلق مباشرة إن لم يتغير شيء، وإلا يسأل confirmDiscard.
 * modal({ sheet: true, beforeClose: discardGuard(() => ta.value.trim() !== '') })
 */
export function discardGuard(isDirty, copy) {
  return async () => {
    let dirty = false;
    try {
      dirty = !!isDirty();
    } catch {
      dirty = false;
    }
    return dirty ? confirmDiscard(copy) : true;
  };
}

/**
 * نموذج داخل نافذة. يعيد Promise بالقيم أو null عند الإلغاء.
 * onSubmit(values, formApi) اختياري: يُنفَّذ قبل الإغلاق، وأي خطأ منه يظهر داخل النموذج.
 * setup(formApi) اختياري: يُستدعى بعد إنشاء النموذج (مثلًا لإظهار حقل حسب قيمة حقل آخر).
 */
export function formDialog({ title, fields, values, submitLabel = 'حفظ', cancelLabel = 'إلغاء', size = 'md', onSubmit, intro, setup } = {}) {
  return new Promise((resolve) => {
    let result = null;
    let m = null;
    const f = form(fields, {
      values,
      footer: false,
      onSubmit: async (vals) => {
        if (onSubmit) {
          const r = await onSubmit(vals, f);
          result = r === undefined ? vals : r;
        } else result = vals;
      },
      onSuccess: () => m && m.close('submit'),
    });
    m = modal({
      title,
      size,
      body: frag(intro && h('p.modal-intro', intro), f.el),
      actions: [
        { label: cancelLabel, variant: 'ghost', onClick: () => (result = null) },
        { label: submitLabel, variant: 'primary', onClick: async () => ((await f.submit()) ? undefined : false) },
      ],
      onClose: (reason) => resolve(reason === 'submit' || reason === 'action' ? result : null),
    });
    // setup(formApi): لإظهار/إخفاء حقول حسب قيم أخرى أو ضبط أخطاء مخصصة
    if (setup) setup(f);
  });
}

// ───────────────────────── النماذج ─────────────────────────

const TEXTLIKE = new Set(['text', 'textarea', 'password', 'email', 'phone']);

function isEmptyValue(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0) || v === false;
}

function parseNumber(raw) {
  const s = toLatinDigits(raw).replace(/[,٬\s]/g, '').replace('٫', '.');
  if (s === '') return null;
  if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/**
 * غلاف حقل: تسمية مرتبطة بالعنصر، تلميح، ورسالة خطأ.
 * @param {string} label
 * @param {HTMLElement} control
 * @param {{hint?:string, required?:boolean, error?:string, full?:boolean, group?:boolean, className?:string}} [opts]
 */
export function field(label, control, { hint, required, error, full, group, className } = {}) {
  const target =
    control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
      ? control
      : control.querySelector?.('input:not([type=hidden]), select, textarea');
  if (target && !target.id) target.id = uid('fld');
  const labelId = uid('lbl');
  const hintId = hint ? uid('hint') : null;
  const errId = uid('err');
  // النجمة بصرية فقط؛ السمة required تُعلن الإلزام لقارئات الشاشة
  const req = required ? h('span.req', { 'aria-hidden': 'true' }, '*') : null;
  let labelEl = null;
  if (label) {
    labelEl = group || !target
      ? h('span.field-label', { id: labelId }, label, req)
      : h('label.field-label', { id: labelId, htmlFor: target.id }, label, req);
  }
  if (group && label) {
    control.setAttribute('role', control.getAttribute('role') || 'group');
    control.setAttribute('aria-labelledby', labelId);
  }
  const errText = h('span');
  const errEl = h('p.field-error', { id: errId, hidden: true }, icon('alert', { size: 14 }), errText);
  const wrap = h(
    'div.field',
    { class: [full && 'field-full', className] },
    labelEl,
    control,
    hint && h('p.field-hint', { id: hintId }, hint),
    errEl,
  );
  const describe = (withErr) => {
    const el = group ? control : target;
    if (!el) return;
    const ids = [hintId, withErr && errId].filter(Boolean).join(' ');
    if (ids) el.setAttribute('aria-describedby', ids);
    else el.removeAttribute('aria-describedby');
  };
  describe(false);
  /** يعرض أو يخفي رسالة الخطأ */
  wrap.setError = (msg) => {
    errText.textContent = msg || '';
    errEl.hidden = !msg;
    wrap.classList.toggle('has-error', Boolean(msg));
    const el = group ? control : target;
    if (el) {
      if (msg) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
    describe(Boolean(msg));
  };
  if (error) wrap.setError(error);
  return wrap;
}

/**
 * حقل اختيار ملفات مع قائمة الملفات المختارة وإمكانية الحذف والسحب والإفلات.
 * @returns {{el:HTMLElement, input:HTMLInputElement, getFiles:()=>File[], setFiles:(f:File[])=>void, clear:()=>void}}
 */
export function fileInput({
  id = uid('file'),
  name,
  multiple = true,
  accept,
  maxFiles = 5,
  maxBytes = 8 * 1024 * 1024,
  label = 'اختر ملفات أو اسحبها إلى هنا',
  hint,
  onChange,
} = {}) {
  let files = [];
  const limit = multiple ? maxFiles : 1;
  const note = h('p.file-note', { role: 'alert', hidden: true });
  const list = h('ul.file-list');
  const input = h('input.file-native', {
    type: 'file',
    id,
    name,
    accept,
    multiple,
    onChange: () => {
      add([...input.files]);
      input.value = '';
    },
  });
  const zone = h(
    'label.file-drop',
    { htmlFor: id },
    h('span.file-drop-icon', icon('upload', { size: 22 })),
    h('span.file-drop-text', h('strong', label), h('span.file-drop-hint', hint || `حتى ${count(limit, 'file')}، وحجم الملف الواحد لا يزيد على ${formatBytes(maxBytes)}`)),
  );
  const showNote = (msg) => {
    note.textContent = msg || '';
    note.hidden = !msg;
  };

  function add(newFiles) {
    const problems = [];
    for (const f of newFiles) {
      if (f.size > maxBytes) {
        problems.push(`حجم الملف «${f.name}» يتجاوز ${formatBytes(maxBytes)}`);
        continue;
      }
      if (files.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (!multiple) files = [];
      if (files.length >= limit) {
        problems.push(`الحد الأقصى ${count(limit, 'file')}`);
        break;
      }
      files.push(f);
    }
    showNote(problems.join(' — '));
    render();
    if (onChange) onChange([...files]);
  }

  function render() {
    mount(
      list,
      files.map((f, i) =>
        h(
          'li.file-item',
          icon('file', { size: 18 }),
          h('span.file-name', { dir: 'auto', title: f.name }, f.name),
          h('span.file-size', formatBytes(f.size)),
          h(
            'button.file-remove',
            {
              type: 'button',
              'aria-label': `إزالة الملف ${f.name}`,
              onClick: () => {
                files.splice(i, 1);
                showNote('');
                render();
                if (onChange) onChange([...files]);
                input.focus();
              },
            },
            icon('x', { size: 16 }),
          ),
        ),
      ),
    );
    list.hidden = files.length === 0;
  }

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    if (e.dataTransfer?.files?.length) add([...e.dataTransfer.files]);
  });

  render();
  const el = h('div.file-input', input, zone, note, list);
  return {
    el,
    input,
    getFiles: () => [...files],
    setFiles: (arr) => {
      files = Array.isArray(arr) ? arr.filter((f) => f instanceof Blob).slice(0, limit) : [];
      render();
    },
    clear: () => {
      files = [];
      showNote('');
      render();
    },
  };
}

function requiredMessage(type) {
  switch (type) {
    case 'select':
      return 'يرجى الاختيار من القائمة';
    case 'checkbox':
      return 'يجب الموافقة للمتابعة';
    case 'file':
      return 'يرجى إرفاق ملف واحد على الأقل';
    case 'checkboxes':
    case 'multiselect':
      return 'اختر عنصرًا واحدًا على الأقل';
    default:
      return 'هذا الحقل مطلوب';
  }
}

function buildControl(spec, formApi) {
  const type = spec.type || 'text';
  const name = spec.name;
  const id = spec.id || uid(`f-${name || type}`);
  const c = { spec, name, type, wrap: null, focusEl: null, get: () => undefined, set: () => {}, check: () => null };
  const changed = () => spec.onChange && spec.onChange(c.get(), formApi);
  const common = {
    id,
    name,
    placeholder: spec.placeholder,
    required: spec.required,
    readonly: spec.readonly,
    disabled: spec.disabled,
    autocomplete: spec.autocomplete,
    dir: spec.ltr ? 'ltr' : spec.dir,
    onChange: changed,
  };

  if (type === 'hidden') {
    let v = spec.value;
    c.get = () => v;
    c.set = (x) => (v = x);
    return c;
  }

  if (type === 'static') {
    let v = spec.value;
    const box = h('div.static-value');
    c.set = (x) => {
      v = x;
      mount(box, spec.render ? spec.render(x) : x == null || x === '' ? '—' : String(x));
    };
    c.get = () => v;
    c.set(v);
    c.wrap = field(spec.label, box, { hint: spec.hint, full: spec.full });
    return c;
  }

  let control;
  let input;

  switch (type) {
    case 'textarea': {
      input = h('textarea.input', { ...common, rows: spec.rows || 4, maxlength: spec.maxLength });
      const minLen = spec.minLength ?? spec.min;
      const maxLen = spec.maxLength ?? spec.max;
      if (spec.counter || minLen || maxLen) {
        const counter = h('span.char-count', { 'aria-live': 'polite' });
        const update = () => {
          const n = input.value.trim().length;
          let t = `عدد الأحرف: ${n}`;
          if (maxLen) t += ` من ${maxLen}`;
          if (minLen && n < minLen) t += ` — الحد الأدنى ${count(minLen, 'char')}`;
          counter.textContent = t;
          counter.classList.toggle('is-ok', Boolean(minLen) && n >= minLen);
        };
        input.addEventListener('input', update);
        c.updateCounter = update;
        update();
        control = h('div.textarea-wrap', input, counter);
      } else control = input;
      c.get = () => input.value.trim();
      c.set = (v) => {
        input.value = v == null ? '' : String(v);
        if (c.updateCounter) c.updateCounter();
      };
      break;
    }
    case 'select': {
      const opts = spec.options || [];
      const map = new Map(opts.map((o) => [String(o.value), o.value]));
      const showPlaceholder = spec.placeholder !== false;
      input = h(
        'select.input',
        { ...common, placeholder: null },
        showPlaceholder && h('option', { value: '' }, spec.placeholder || '— اختر —'),
        opts.map((o) => h('option', { value: String(o.value), disabled: o.disabled }, o.label)),
      );
      control = h('div.select-wrap', input);
      c.get = () => (input.value === '' ? null : map.has(input.value) ? map.get(input.value) : input.value);
      c.set = (v) => (input.value = v == null ? '' : String(v));
      break;
    }
    case 'multiselect':
    case 'checkboxes': {
      const opts = spec.options || [];
      let selected = new Set();
      const items = opts.map((o) => {
        if (type === 'multiselect') {
          const b = h(
            'button.chip-toggle',
            {
              type: 'button',
              'aria-pressed': 'false',
              disabled: spec.disabled || spec.readonly,
              onClick: () => {
                if (selected.has(o.value)) selected.delete(o.value);
                else selected.add(o.value);
                sync();
                changed();
              },
            },
            icon('check', { size: 14 }),
            h('span', o.label),
          );
          return { o, el: b };
        }
        const cb = h('input', {
          type: 'checkbox',
          value: String(o.value),
          disabled: spec.disabled || spec.readonly,
          onChange: () => {
            if (cb.checked) selected.add(o.value);
            else selected.delete(o.value);
            changed();
          },
        });
        return { o, el: h('label.check', cb, h('span', o.label)), cb };
      });
      const sync = () =>
        items.forEach(({ o, el, cb }) => {
          if (cb) cb.checked = selected.has(o.value);
          else {
            el.setAttribute('aria-pressed', selected.has(o.value) ? 'true' : 'false');
            el.classList.toggle('is-on', selected.has(o.value));
          }
        });
      control = h(type === 'multiselect' ? 'div.chip-select' : 'div.check-list', { id }, items.map((i) => i.el));
      c.focusEl = () => items[0]?.cb || items[0]?.el;
      c.get = () => opts.map((o) => o.value).filter((v) => selected.has(v));
      c.set = (v) => {
        // المطابقة نصيًا حتى تتساوى القيم الرقمية والنصية (5 و '5')
        const keys = new Set((Array.isArray(v) ? v : v == null ? [] : [v]).map(String));
        selected = new Set(opts.filter((o) => keys.has(String(o.value))).map((o) => o.value));
        sync();
      };
      c.group = true;
      break;
    }
    case 'checkbox': {
      input = h('input', { type: 'checkbox', id, name, required: spec.required, disabled: spec.disabled || spec.readonly, onChange: changed });
      c.get = () => input.checked;
      c.set = (v) => (input.checked = Boolean(v));
      const req = spec.required ? h('span.req', { 'aria-hidden': 'true' }, '*') : null;
      control = h('label.check.check-single', { htmlFor: id, class: spec.checkClass }, input, h('span', spec.text || spec.label, req));
      break;
    }
    case 'number':
    case 'money': {
      input = h('input.input', {
        ...common,
        type: 'text',
        inputmode: type === 'money' ? 'decimal' : 'numeric',
        dir: 'ltr',
        autocomplete: 'off',
      });
      control = type === 'money' ? h('div.input-group', input, h('span.input-addon', 'ج.م')) : input;
      if (spec.suffix && type === 'number') control = h('div.input-group', input, h('span.input-addon', spec.suffix));
      c.get = () => {
        const n = parseNumber(input.value);
        return Number.isNaN(n) ? null : n;
      };
      c.raw = () => parseNumber(input.value);
      c.set = (v) => (input.value = v == null || v === '' ? '' : String(v));
      break;
    }
    case 'date': {
      input = h('input.input', { ...common, type: 'date', dir: 'ltr', min: spec.min, max: spec.max });
      c.get = () => (input.value ? cairoDateToIso(input.value, Boolean(spec.endOfDay)) : null);
      c.set = (v) => (input.value = !v ? '' : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : isoToCairoDate(v));
      break;
    }
    case 'datetime': {
      input = h('input.input', { ...common, type: 'datetime-local', dir: 'ltr', min: spec.min, max: spec.max });
      c.get = () => (input.value ? cairoInputToIso(input.value) : null);
      c.set = (v) => (input.value = v ? isoToCairoInput(v) : '');
      break;
    }
    case 'password': {
      input = h('input.input', { ...common, type: 'password', dir: 'ltr', autocomplete: spec.autocomplete || 'current-password' });
      const toggle = h('button.input-action', { type: 'button', 'aria-label': 'إظهار كلمة المرور', 'aria-pressed': 'false' }, icon('eye', { size: 18 }));
      toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        mount(toggle, icon(show ? 'eyeOff' : 'eye', { size: 18 }));
      });
      control = h('div.input-group.input-group-action', input, toggle);
      c.get = () => input.value;
      c.set = (v) => (input.value = v == null ? '' : String(v));
      break;
    }
    case 'phone': {
      input = h('input.input', {
        ...common,
        type: 'tel',
        inputmode: 'tel',
        dir: 'ltr',
        autocomplete: spec.autocomplete || 'tel',
        placeholder: spec.placeholder || '01XXXXXXXXX',
      });
      c.get = () => {
        const raw = input.value.trim();
        return normalizeEgPhone(raw) || toLatinDigits(raw);
      };
      c.set = (v) => (input.value = v == null ? '' : String(v));
      break;
    }
    case 'file': {
      const fi = fileInput({
        id,
        name,
        multiple: spec.multiple !== false,
        accept: spec.accept,
        maxFiles: spec.maxFiles || 5,
        maxBytes: spec.maxBytes || 8 * 1024 * 1024,
        label: spec.placeholder,
        onChange: changed,
      });
      control = fi.el;
      input = fi.input;
      c.get = () => fi.getFiles();
      c.set = (v) => fi.setFiles(v);
      c.fileApi = fi;
      break;
    }
    case 'email':
    case 'text':
    default: {
      input = h('input.input', {
        ...common,
        type: type === 'email' ? 'email' : 'text',
        dir: type === 'email' ? 'ltr' : common.dir,
        autocomplete: spec.autocomplete || (type === 'email' ? 'email' : null),
        maxlength: spec.maxLength,
      });
      c.get = () => input.value.trim();
      c.set = (v) => (input.value = v == null ? '' : String(v));
    }
  }

  if (!control) control = input;
  c.input = input;
  if (!c.focusEl) c.focusEl = () => input;
  c.check = () => {
    const v = c.get();
    if (type === 'number' || type === 'money') {
      const raw = c.raw();
      if (Number.isNaN(raw)) return 'أدخل رقمًا صحيحًا';
      if (raw == null) return spec.required ? spec.requiredMessage || requiredMessage(type) : null;
      if (spec.min != null && raw < spec.min) return `يجب ألا تقل القيمة عن ${spec.min}`;
      if (spec.max != null && raw > spec.max) return `يجب ألا تزيد القيمة على ${spec.max}`;
      if (type === 'number' && spec.integer && !Number.isInteger(raw)) return 'أدخل عددًا صحيحًا بدون كسور';
      return null;
    }
    // v9.1 l-home (L-10): رسالة خاصة بالحقل (مثل التعهد بالسرية) بدل الرسالة العامة — اختيارية ومتوافقة مع السابق
    if (spec.required && isEmptyValue(v)) return spec.requiredMessage || requiredMessage(type);
    if (isEmptyValue(v)) return null;
    if (type === 'phone' && !normalizeEgPhone(input.value)) return 'أدخل رقم موبايل مصري صحيح مثل 01012345678';
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'أدخل بريدًا إلكترونيًا صحيحًا';
    if (TEXTLIKE.has(type) && type !== 'phone' && type !== 'email') {
      const minLen = spec.minLength ?? spec.min;
      const maxLen = spec.maxLength ?? spec.max;
      if (minLen && v.length < minLen) return `اكتب ${count(minLen, 'char')} على الأقل`;
      if (maxLen && v.length > maxLen) return `يجب ألا يزيد النص على ${count(maxLen, 'char')}`;
    }
    if ((type === 'date' || type === 'datetime') && input.value) {
      if (spec.min && input.value < spec.min) return 'التاريخ أقدم من المسموح';
      if (spec.max && input.value > spec.max) return 'التاريخ أبعد من المسموح';
    }
    if (type === 'file') {
      const max = spec.multiple === false ? 1 : spec.maxFiles || 5;
      if (v.length > max) return `الحد الأقصى ${count(max, 'file')}`;
    }
    return null;
  };

  const showLabel = type !== 'checkbox';
  c.wrap = field(showLabel ? spec.label : null, control, {
    hint: spec.hint,
    required: showLabel && spec.required,
    full: spec.full || type === 'textarea' || type === 'file' || type === 'checkboxes' || type === 'multiselect',
    group: c.group,
    className: `field-${type}`,
  });
  return c;
}

/**
 * نموذج كامل من مواصفات الحقول.
 * الحقل: { name, label, type, options, required, hint, placeholder, min, max, minLength, maxLength, rows, accept,
 *          multiple, maxFiles, maxBytes, ltr, readonly, full, endOfDay, counter, text, onChange }
 * القيم: date/datetime ⇄ ISO UTC بتوقيت القاهرة، number/money → رقم أو null، checkboxes/multiselect → مصفوفة، file → File[].
 * @returns {{el:HTMLFormElement, getValues:()=>object, setValues:(v:object)=>void, validate:()=>boolean,
 *            setErrors:(m:object)=>void, showError:(e:any)=>void, clearErrors:()=>void, submit:()=>Promise<boolean>,
 *            control:(name:string)=>object|undefined}}
 */
export function form(fields, opts = {}) {
  const {
    values = {},
    onSubmit,
    onSuccess,
    submitLabel = 'حفظ',
    submitIcon,
    cancel,
    cancelLabel = 'إلغاء',
    className,
    columns = 2,
    footer = true,
  } = opts;
  const api = {};
  const controls = fields.filter(Boolean).map((spec) => buildControl(spec, api));
  // v10 (X10-F2): «كافئ مبكرًا، عاقب متأخرًا» — المرور بحقل فارغ لا يلوّنه بالأحمر (الإلزامي الفارغ يُنبَّه عند الإرسال)؛
  // الخطأ يظهر عند مغادرة حقل فيه قيمة غير صحيحة، ويختفي مع الضغطة التي تصلحه.
  for (const c of controls) {
    const el = c.wrap && c.focusEl?.();
    if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || /^(checkbox|radio|file)$/.test(el.type || '')) continue;
    let touched = false;
    el.addEventListener('blur', () => {
      if (!touched && isEmptyValue(c.get())) return;
      touched = true;
      c.wrap.setError(c.check() || '');
    });
    el.addEventListener('input', () => {
      touched = true;
      if (c.wrap.classList.contains('has-error')) c.wrap.setError(c.check() || '');
    });
  }
  const grid = h('div.form-grid', { class: columns === 1 && 'form-grid-1' }, controls.map((c) => c.wrap));
  const alert = h('div.alert.alert-danger.form-alert', { role: 'alert', hidden: true });
  let submitBtn = null;
  let footerEl = null;
  if (footer && onSubmit) {
    submitBtn = button(submitLabel, { variant: 'primary', type: 'submit', icon: submitIcon });
    footerEl = h('div.form-actions', submitBtn, cancel && button(cancelLabel, { variant: 'ghost', onClick: cancel }));
  }
  const el = h('form.form', { class: className, novalidate: true }, alert, grid, footerEl);
  let busy = false;

  const byName = (n) => controls.find((c) => c.name === n);

  api.el = el;
  api.control = byName;
  api.getValues = () => {
    const out = {};
    for (const c of controls) if (c.name) out[c.name] = c.get();
    return out;
  };
  api.setValues = (v = {}) => {
    for (const c of controls) if (c.name && Object.prototype.hasOwnProperty.call(v, c.name)) c.set(v[c.name]);
  };
  api.clearErrors = () => {
    alert.hidden = true;
    controls.forEach((c) => c.wrap && c.wrap.setError(''));
  };
  api.setErrors = (map = {}) => {
    let first = null;
    for (const [k, msg] of Object.entries(map)) {
      const c = byName(k);
      if (c && c.wrap && msg) {
        c.wrap.setError(String(msg));
        first = first || c;
      }
    }
    if (first) first.focusEl()?.focus();
    return Boolean(first);
  };
  api.showError = (err) => {
    const msg = errorMessage(err);
    mount(alert, icon('alert', { size: 18 }), h('span', msg));
    alert.hidden = false;
    const d = err && err.details;
    const fieldsMap = d && typeof d === 'object' && !Array.isArray(d) ? d.fields || d : null;
    if (fieldsMap && typeof fieldsMap === 'object') {
      const mapped = {};
      for (const [k, v] of Object.entries(fieldsMap)) if (typeof v === 'string' && byName(k)) mapped[k] = v;
      api.setErrors(mapped);
    }
    alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  api.validate = () => {
    api.clearErrors();
    let first = null;
    for (const c of controls) {
      if (!c.wrap || !c.check) continue;
      const msg = c.check();
      if (msg) {
        c.wrap.setError(msg);
        first = first || c;
      }
    }
    if (first) {
      const target = first.focusEl();
      if (target) {
        target.focus({ preventScroll: true });
        first.wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    return !first;
  };
  api.submit = async () => {
    if (busy) return false;
    if (!api.validate()) return false;
    if (!onSubmit) return true;
    busy = true;
    setBusy(submitBtn, true);
    try {
      await onSubmit(api.getValues(), api);
      if (onSuccess) onSuccess(api.getValues(), api);
      return true;
    } catch (err) {
      api.showError(err);
      return false;
    } finally {
      busy = false;
      setBusy(submitBtn, false);
    }
  };
  api.setDisabled = (disabled) => {
    el.querySelectorAll('input, select, textarea, button').forEach((x) => (x.disabled = disabled));
  };

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    api.submit();
  });

  api.setValues(values || {});
  return api;
}

// ───────────────────────── الجداول ─────────────────────────

/**
 * جدول متجاوب داخل غلاف يمرَّر أفقيًا.
 * columns: [{ key, label, render(row), width, align: 'start'|'center'|'end', className }]
 */
/**
 * إشارة التمرير الأفقي: حين يتجاوز المحتوى عرض الحاوية تتلاشى الحافة التي يختفي خلفها جزء من المحتوى
 * (الصنفان more-start / more-end حسب اتجاه النص)، فيعرف المستخدم أن هناك أعمدة أو أشهرًا أخرى.
 * startAtEnd: يبدأ العرض من نهاية السطر (يسار الصفحة العربية) — لمخططات تكون أحدث قيمها في النهاية.
 * @param {HTMLElement} el حاوية بها overflow-x: auto
 * @returns {HTMLElement}
 */
export function overflowCue(el, { startAtEnd = false } = {}) {
  if (!el || typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') return el;
  let raf = 0;
  let positioned = !startAtEnd;
  const update = () => {
    raf = 0;
    if (!el.isConnected) return;
    const max = el.scrollWidth - el.clientWidth;
    const rtl = window.getComputedStyle(el).direction === 'rtl';
    if (!positioned && max > 1) {
      positioned = true;
      // في RTL تكون scrollLeft صفرًا عند البداية (اليمين) وسالبة نحو اليسار
      el.scrollLeft = rtl ? -max : max;
    }
    const pos = Math.abs(el.scrollLeft); // المسافة الممررة من بداية السطر
    const over = max > 1;
    el.classList.toggle('has-overflow', over);
    el.classList.toggle('more-start', over && pos > 1);
    el.classList.toggle('more-end', over && pos < max - 1);
  };
  const schedule = () => {
    if (!raf) raf = window.requestAnimationFrame(update);
  };
  el.addEventListener('scroll', schedule, { passive: true });
  const ro = new window.ResizeObserver(schedule);
  ro.observe(el);
  if (el.firstElementChild) ro.observe(el.firstElementChild);
  return el;
}

export function table({ columns = [], rows = [], onRowClick, empty = 'لا توجد بيانات لعرضها', rowClass, caption, className, stack = false } = {}) {
  const thead = h(
    'thead',
    h(
      'tr',
      columns.map((col) =>
        h('th', { scope: 'col', class: [col.align && `align-${col.align}`, col.className], style: col.width ? { width: col.width } : null }, col.label ?? ''),
      ),
    ),
  );
  const tbody = h('tbody');
  if (!rows.length) {
    tbody.append(h('tr.table-empty', h('td', { colspan: columns.length || 1 }, emptyState(empty, null, { compact: true }))));
  }
  for (const row of rows) {
    const cells = columns.map((col) => {
      let v = col.render ? col.render(row) : row[col.key];
      if (v == null || v === '') v = h('span.muted', '—');
      return h('td', { class: [col.align && `align-${col.align}`, col.className], 'data-label': typeof col.label === 'string' ? col.label : null }, v);
    });
    const tr = h('tr', { class: [rowClass && rowClass(row), onRowClick && 'is-clickable'] }, cells);
    if (onRowClick) {
      tr.tabIndex = 0;
      const interactive = (t) => t.closest('a, button, input, select, textarea, label, [role="button"]');
      tr.addEventListener('click', (e) => {
        if (interactive(e.target) && interactive(e.target) !== tr) return;
        onRowClick(row, e);
      });
      tr.addEventListener('keydown', (e) => {
        if (e.target !== tr) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(row, e);
        }
      });
    }
    tbody.append(tr);
  }
  // stack: على الهاتف تتحول الصفوف إلى بطاقات مكدسة (التسمية من data-label) بدل التمرير الأفقي
  return overflowCue(h('div.table-wrap', { class: [className, stack && 'table-stack'] }, h('table.table', caption && h('caption.sr-only', caption), thead, tbody)));
}

// ───────────────────────── التبويبات ─────────────────────────

/**
 * تبويبات بعرض كسول تحتفظ بحالة كل لوحة.
 * items: [{ key, label, count, icon, render: () => Node|Promise<Node> }]
 * العنصر المعاد يحمل: el.setActive(key)، el.refresh(key?)، el.setCount(key, n)، el.active
 */
export function tabs(items = [], { active, onChange, className } = {}) {
  const base = uid('tabs');
  const tablist = h('div.tablist', { role: 'tablist' });
  const panels = h('div.tab-panels');
  const root = h('div.tabs', { class: className }, tablist, panels);
  const state = new Map();
  let current = null;

  items.forEach((item) => {
    const countEl = h('span.tab-count', { hidden: item.count == null }, item.count == null ? '' : String(item.count));
    const btn = h(
      'button.tab',
      {
        type: 'button',
        role: 'tab',
        id: `${base}-tab-${item.key}`,
        'aria-controls': `${base}-panel-${item.key}`,
        'aria-selected': 'false',
        tabindex: '-1',
        onClick: () => select(item.key, true),
      },
      item.icon && icon(item.icon, { size: 16 }),
      h('span', item.label),
      countEl,
    );
    const panel = h('div.tab-panel', { role: 'tabpanel', id: `${base}-panel-${item.key}`, 'aria-labelledby': btn.id, hidden: true, tabindex: '0' });
    tablist.append(btn);
    panels.append(panel);
    state.set(item.key, { item, btn, panel, countEl, rendered: false });
  });

  async function renderPanel(key) {
    const s = state.get(key);
    if (!s) return;
    s.rendered = true;
    try {
      const out = s.item.render ? s.item.render() : null;
      if (out && typeof out.then === 'function') {
        mount(s.panel, loading());
        mount(s.panel, await out);
      } else mount(s.panel, out);
    } catch (err) {
      mount(s.panel, errorState(err, () => renderPanel(key)));
    }
  }

  function select(key, focus = false) {
    const s = state.get(key);
    if (!s) return;
    const prev = current;
    current = key;
    root.active = key;
    for (const [k, x] of state) {
      const on = k === key;
      x.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      x.btn.tabIndex = on ? 0 : -1;
      x.btn.classList.toggle('is-active', on);
      x.panel.hidden = !on;
    }
    if (focus) s.btn.focus();
    if (!s.rendered) renderPanel(key);
    if (onChange && prev !== key && prev !== null) onChange(key, prev);
  }

  tablist.addEventListener('keydown', (e) => {
    const keys = items.map((i) => i.key);
    const idx = keys.indexOf(current);
    const rtl = getComputedStyle(root).direction === 'rtl';
    let next = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = keys[(idx + 1) % keys.length];
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = keys[(idx - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (next != null) {
      e.preventDefault();
      select(next, true);
    }
  });

  root.setActive = (key) => select(key);
  root.refresh = (key = current) => renderPanel(key);
  root.setCount = (key, n) => {
    const s = state.get(key);
    if (!s) return;
    s.countEl.textContent = n == null ? '' : String(n);
    s.countEl.hidden = n == null;
  };
  if (items.length) select(active != null && state.has(active) ? active : items[0].key);
  return root;
}

// ───────────────────────── البطاقات والتخطيط ─────────────────────────

/** بطاقة بعنوان وإجراءات ومحتوى. */
export function card({ title, subtitle, actions, body, footer, className, icon: iconName, flush } = {}) {
  const header =
    title || actions
      ? h(
          'div.card-header',
          h(
            'div.card-heading',
            iconName && h('span.card-icon', icon(iconName, { size: 18 })),
            h('div', title && h('h2.card-title', title), subtitle && h('p.card-subtitle', subtitle)),
          ),
          actions && h('div.card-actions', actions),
        )
      : null;
  return h(
    'section.card',
    { class: className },
    header,
    body != null && h('div.card-body', { class: flush && 'card-body-flush' }, body),
    footer && h('div.card-footer', footer),
  );
}

/** قسم بعنوان. section('المستندات', node1, node2) */
export function section(title, ...children) {
  return h('section.section', title && h('h2.section-title', title), children);
}

/** بطاقة رقم إحصائي. */
export function statCard({ label, value, hint, tone = 'primary', icon: iconName, href, onClick } = {}) {
  const content = [
    iconName && h('span.stat-icon', icon(iconName, { size: 20 })),
    h('div.stat-body', h('div.stat-label', label), h('div.stat-value', value == null ? '—' : value), hint && h('div.stat-hint', hint)),
  ];
  if (href) return h('a.stat-card', { class: `tone-${tone}`, href }, content);
  if (onClick) return h('button.stat-card', { class: `tone-${tone}`, type: 'button', onClick }, content);
  return h('div.stat-card', { class: `tone-${tone}` }, content);
}

/** قائمة مفتاح/قيمة. kv([['العميل', 'أحمد'], ['الهاتف', ltr('010…')]], { columns: 2 }) */
export function kv(pairs = [], { columns = 1, className } = {}) {
  return h(
    'dl.kv',
    { class: [columns > 1 && `kv-cols-${columns}`, className] },
    pairs
      .filter(Boolean)
      .map(([k, v]) =>
        h('div.kv-row', h('dt', k), h('dd', v == null || v === '' || (Array.isArray(v) && !v.length) ? h('span.muted', '—') : v)),
      ),
  );
}

/** وسم زمني بتوقيت القاهرة مع التاريخ الكامل في التلميح. */
export function timeTag(iso, { relative: rel = false } = {}) {
  if (!iso) return h('span.muted', '—');
  return h('time', { datetime: iso, title: rel ? dateTime(iso) : relative(iso) }, rel ? relative(iso) : dateTime(iso));
}

/** خط زمني. items: [{ time, title, body, actor, tone, icon }] */
export function timeline(items = [], { empty = 'لا توجد أحداث مسجلة بعد' } = {}) {
  if (!items.length) return emptyState(empty, null, { compact: true, icon: 'clock' });
  return h(
    'ol.timeline',
    items.map((it) =>
      h(
        'li.tl-item',
        { class: `tone-${it.tone || 'neutral'}` },
        h('span.tl-dot', { 'aria-hidden': 'true' }, it.icon ? icon(it.icon, { size: 13 }) : null),
        h(
          'div.tl-content',
          h('div.tl-head', h('span.tl-title', typeof it.title === 'string' ? richText(it.title) : it.title), it.time && h('span.tl-time', timeTag(it.time))),
          it.actor && h('div.tl-actor', it.actor),
          it.body && h('div.tl-body', typeof it.body === 'string' ? richText(it.body) : it.body),
        ),
      ),
    ),
  );
}

// v9.1 b-forms: مستند صوتي (بالنوع، أو بالامتداد إن لم يُرسل النوع)
export const isAudioDoc = (d) => /^audio\//.test(String(d?.mime || '')) || /\.(webm|ogg|oga|opus|m4a|mp3|aac)$/i.test(String(d?.filename || ''));
const CHANNEL_SHORT = { whatsapp: 'واتساب', website: 'الموقع', portal: 'الموقع', phone: 'مكالمة', email: 'بريد', walk_in: 'حضور', simulator: 'محاكاة' };
const STATUS_TICKS = { sent: 1, delivered: 2, read: 2 };

/**
 * محادثة بأسلوب واتساب. الوارد من العميل على جهة البداية والصادر من المؤسسة على جهة النهاية.
 * messages: [{ direction:'in'|'out', channel, body, created_at, status, automated, author_name, documents:[{id, filename}] }]
 * @param {{mine?:'out'|'in', docHref?:((id:any)=>string)|null, emptyText?:string, inLabel?:string, outLabel?:string}} [opts]
 *   mine: الاتجاه الذي يُعرض على جهة النهاية (الافتراضي out). docHref=null يعرض المستندات بدون روابط.
 */
export function chatThread(messages = [], { mine = 'out', docHref = downloadUrl, emptyText = 'لا توجد رسائل بعد', inLabel, outLabel } = {}) {
  if (!messages.length) return h('div.chat.chat-empty', emptyState(emptyText, null, { compact: true, icon: 'message' }));
  const list = h('div.chat', { role: 'log', 'aria-label': 'المحادثة' });
  let lastDay = null;
  for (const m of messages) {
    const day = isoToCairoDate(m.created_at);
    if (day && day !== lastDay) {
      list.append(h('div.chat-day', h('span', dayLabel(m.created_at))));
      lastDay = day;
    }
    const side = m.direction === mine ? 'end' : 'start';
    const author = m.author_name || (m.direction === 'in' ? inLabel : outLabel);
    const chan = m.channel ? h('span.chan-tag', { class: `chan-${m.channel}` }, m.channel === 'whatsapp' && icon('whatsapp', { size: 12 }), CHANNEL_SHORT[m.channel] || lbl('channel', m.channel)) : null;
    const docs = (m.documents || []).map((d) =>
      docHref
        ? isAudioDoc(d)
          ? // v9.1 b-forms: الرسالة الصوتية تُسمع داخل المحادثة (لا تُحمَّل قبل الضغط على تشغيل)
            h('span.doc-audio', h('audio', { controls: true, preload: 'none', src: docHref(d.id), 'aria-label': `رسالة صوتية: ${d.filename}` }), h('a.doc-chip', { href: docHref(d.id), target: '_blank', rel: 'noopener noreferrer', title: `تنزيل ${d.filename}` }, icon('paperclip', { size: 14 }), h('span', { dir: 'auto' }, d.filename)))
          : h('a.doc-chip', { href: docHref(d.id), target: '_blank', rel: 'noopener noreferrer', title: `تنزيل ${d.filename}` }, icon('paperclip', { size: 14 }), h('span', { dir: 'auto' }, d.filename))
        : h('span.doc-chip', icon('paperclip', { size: 14 }), h('span', { dir: 'auto' }, d.filename)),
    );
    const statusEl =
      m.direction === 'out' && m.status
        ? h(
            'span.msg-status',
            { class: `st-${m.status}`, title: lbl('message_status', m.status) },
            STATUS_TICKS[m.status] ? h('span.ticks', { 'aria-hidden': 'true' }, icon('check', { size: 13 }), STATUS_TICKS[m.status] > 1 && icon('check', { size: 13 })) : m.status === 'failed' ? icon('alert', { size: 13 }) : null,
            h('span', lbl('message_status', m.status)),
          )
        : null;
    list.append(
      h(
        'div.msg',
        { class: [`msg-${side}`, `msg-${m.direction}`, m.automated && 'msg-auto'] },
        h(
          'div.msg-bubble',
          (author || chan || m.automated) &&
            h('div.msg-meta', author && h('span.msg-author', author), chan, m.automated ? h('span.auto-tag', icon('zap', { size: 11 }), 'رسالة آلية') : null),
          m.body && h('div.msg-body', { dir: 'auto' }, richText(m.body)),
          docs.length ? h('div.msg-docs', docs) : null,
          h('div.msg-foot', h('time', { datetime: m.created_at, title: dateTime(m.created_at) }, fmtTime(m.created_at)), statusEl),
        ),
      ),
    );
  }
  return list;
}

// ───────────────────────── الحالات ─────────────────────────

/** حالة فارغة. emptyState('لا توجد ملفات', button(...)) */
export function emptyState(text, action, { icon: iconName = 'inbox', title, compact } = {}) {
  return h(
    'div.empty-state',
    { class: compact && 'is-compact' },
    h('span.empty-icon', icon(iconName, { size: compact ? 22 : 28 })),
    title && h('h3.empty-title', title),
    h('p.empty-text', text),
    action && h('div.empty-action', action),
  );
}

/** مؤشر تحميل. */
export function loading(text = 'جارٍ التحميل…') {
  return h('div.loading-state', { role: 'status', 'aria-live': 'polite' }, h('span.spinner', { 'aria-hidden': 'true' }), h('span', text));
}

/** هيكل تحميل رمادي متحرك. */
export function skeleton(lines = 3) {
  return h(
    'div.skeleton-block',
    { 'aria-hidden': 'true' },
    Array.from({ length: lines }, (_, i) => h('div.skeleton-line', { style: { width: `${[92, 76, 84, 60, 70][i % 5]}%` } })),
  );
}

/** حالة خطأ مع زر إعادة المحاولة. */
export function errorState(err, retry) {
  const status = err && err.status;
  const title = status === 403 ? 'غير مصرح لك' : status === 404 ? 'غير موجود' : 'تعذر تحميل البيانات';
  return h(
    'div.error-state',
    { role: 'alert' },
    h('span.empty-icon.is-danger', icon(status === 403 ? 'lock' : 'alert', { size: 28 })),
    h('h3.empty-title', title),
    h('p.empty-text', errorMessage(err)),
    // إعادة المحاولة لا تغيّر نتيجة «غير مصرح» أو «غير موجود»: يظهر الزر لأخطاء الشبكة والخادم فقط
    retry && ![401, 403, 404, 410].includes(status) && h('div.empty-action', button('إعادة المحاولة', { icon: 'refresh', onClick: retry })),
  );
}

/** صندوق تنبيه داخل الصفحة. tone: info|success|warning|danger */
export function alertBox(message, tone = 'info', { title, icon: iconName } = {}) {
  return h(
    'div.alert',
    { class: `alert-${tone}`, role: tone === 'danger' ? 'alert' : 'status' },
    icon(iconName || TOAST_ICONS[tone] || 'info', { size: 18 }),
    h('div', title && h('strong.alert-title', title), h('div', message)),
  );
}

/** ترويسة الصفحة مع مسار التنقل والإجراءات. breadcrumbs: [{ label, href }] */
/**
 * رأس الصفحة. titleMedia (اختياري): صورة رمزية أو أيقونة تُعرض بجوار العنوان خارج <h1>،
 * فيبقى نص العنوان نظيفًا لقارئات الشاشة وللنسخ («أ. أحمد عبد العظيم» لا «أأ. أحمد…»).
 */
export function pageHeader({ title, subtitle, actions, breadcrumbs, meta, titleMedia } = {}) {
  const crumbs =
    breadcrumbs && breadcrumbs.length
      ? h(
          'nav.breadcrumbs',
          { 'aria-label': 'مسار التنقل' },
          h(
            'ol',
            breadcrumbs.map((b, i) => {
              const last = i === breadcrumbs.length - 1;
              return h(
                'li',
                i > 0 && icon('chevronLeft', { size: 14, className: 'crumb-sep' }),
                b.href && !last ? h('a', { href: b.href }, b.label) : h('span', { 'aria-current': last ? 'page' : null }, b.label),
              );
            }),
          ),
        )
      : null;
  return h(
    'header.page-header',
    crumbs,
    h(
      'div.page-header-row',
      h(
        'div.page-header-text',
        titleMedia ? h('div.page-title-row', titleMedia, h('h1.page-title', title)) : h('h1.page-title', title),
        subtitle && h('p.page-subtitle', subtitle),
        meta && h('div.page-meta', meta),
      ),
      actions && h('div.page-actions', actions),
    ),
  );
}

/** شريط فلاتر يضم عناصر تحكم. */
export function filterBar(controls) {
  return h('div.filter-bar', { role: 'search' }, controls);
}

/** حقل بحث مع تأخير (debounce). */
export function searchInput({ placeholder = 'بحث…', value = '', onSearch, delay = 300, label = 'بحث' } = {}) {
  let timer = null;
  const input = h('input.input', {
    type: 'search',
    value,
    placeholder,
    'aria-label': label,
    onInput: () => {
      clearTimeout(timer);
      timer = setTimeout(() => onSearch && onSearch(input.value.trim()), delay);
    },
    onKeydown: (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        if (onSearch) onSearch(input.value.trim());
      }
    },
  });
  return h('div.search-input', icon('search', { size: 18 }), input);
}

/** قائمة منسدلة للفلاتر. options: [{value,label}] */
export function selectInput({ options = [], value = '', onChange, label, allLabel = 'الكل', className } = {}) {
  const sel = h(
    'select.input',
    { 'aria-label': label, value: value ?? '', onChange: () => onChange && onChange(sel.value) },
    allLabel !== null && h('option', { value: '' }, allLabel),
    options.map((o) => h('option', { value: String(o.value) }, o.label)),
  );
  return h('div.select-wrap', { class: className }, sel);
}

/** رقائق صغيرة. items: ['نص'] أو [{ label, value, tone }] */
export function chips(items = [], { onRemove, className } = {}) {
  return h(
    'div.chips',
    { class: className },
    items.map((it) => {
      const item = typeof it === 'object' && it !== null ? it : { label: String(it), value: it };
      return h(
        'span.chip',
        { class: item.tone && `chip-${item.tone}` },
        h('span', item.label),
        onRemove &&
          h('button.chip-remove', { type: 'button', 'aria-label': `إزالة ${item.label}`, onClick: () => onRemove(item.value, item) }, icon('x', { size: 13 })),
      );
    }),
  );
}

/**
 * (v9.1 l-court) اختيار واحد بمربعات كبيرة (variant 'tile' — شبكة columns أعمدة، ارتفاع ≥ 56px) أو شرائح
 * (variant 'chip' — ارتفاع ≥ 44px). نمط radiogroup: الأسهم تنقل الاختيار، ولا شيء مختار مسبقًا ما لم يُمرَّر value.
 * choiceTiles({ label, options: [{ value, label, icon?, hint? }], value, onChange(value), variant, columns, allowDeselect })
 * @returns {HTMLElement & { value: any, setValue(v:any):void }}
 */
export function choiceTiles({ label, options = [], value = null, onChange, variant = 'tile', columns = 2, allowDeselect = false, className } = {}) {
  let current = value;
  const labelId = label ? uid('choice') : null;
  const btns = options.map((o, i) =>
    h(
      'button.choice-tile',
      {
        type: 'button',
        role: 'radio',
        'aria-checked': o.value === current ? 'true' : 'false',
        tabindex: (current == null ? i === 0 : o.value === current) ? '0' : '-1',
        dataset: { value: String(o.value) },
        onClick: () => pick(o.value === current && allowDeselect ? null : o.value, true),
        onKeydown: (e) => {
          const dir = { ArrowLeft: 1, ArrowDown: 1, ArrowRight: -1, ArrowUp: -1 }[e.key]; // RTL: اليسار = التالي
          if (!dir) return;
          e.preventDefault();
          const next = options[(i + dir + options.length) % options.length];
          pick(next.value, true);
          btns[options.indexOf(next)].focus();
        },
      },
      o.icon ? icon(o.icon, { size: 20 }) : null,
      h('span.choice-tile-label', o.label),
      o.hint ? h('span.choice-tile-hint', o.hint) : null,
    ),
  );
  function sync() {
    btns.forEach((b, i) => {
      const on = options[i].value === current;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.classList.toggle('is-on', on);
      b.tabIndex = (current == null ? i === 0 : on) ? 0 : -1;
    });
  }
  function pick(v, fromUser) {
    if (v === current && !fromUser) return;
    const changed = v !== current;
    current = v;
    sync();
    if (changed && onChange) onChange(current);
  }
  const group = h(
    'div.choice-group',
    {
      class: [`choice-${variant}s`, className],
      role: 'radiogroup',
      'aria-labelledby': labelId,
      style: variant === 'tile' ? { '--choice-cols': String(columns) } : null,
    },
    btns,
  );
  sync();
  const wrap = label ? h('div.choice-field', h('div.field-label.choice-label', { id: labelId }, label), group) : group;
  Object.defineProperty(wrap, 'value', { get: () => current });
  wrap.setValue = (v) => pick(v, false);
  wrap.focusFirst = () => (btns.find((b) => b.tabIndex === 0) || btns[0])?.focus();
  return wrap;
}

/**
 * شريط تقدم. progressBar(7, 10, 'success', { label: 'الحصة الشهرية', showValue: true })
 * visibleLabel=false يجعل التسمية لقارئات الشاشة فقط.
 */
export function progressBar(value = 0, max = 100, tone = 'primary', { label, showValue = false, visibleLabel = true } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100)) : 0;
  const shownLabel = visibleLabel ? label : null;
  return h(
    'div.progress-wrap',
    (shownLabel || showValue) && h('div.progress-label', shownLabel && h('span', shownLabel), showValue && h('span.ltr', `${value} / ${max}`)),
    h(
      'div.progress',
      { class: `tone-${tone}`, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label || 'نسبة الإنجاز' },
      h('div.progress-bar', { style: { width: `${pct}%` } }),
    ),
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' }, readonly: true, value: text });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** زر نسخ نص إلى الحافظة. */
export function copyButton(text, label = 'نسخ', { size = 'sm', variant = 'ghost' } = {}) {
  const btn = button(label, {
    size,
    variant,
    icon: 'copy',
    ariaLabel: label ? null : `نسخ ${text}`,
    title: `نسخ ${text}`,
    onClick: async () => {
      const ok = await copyText(String(text));
      toast(ok ? 'تم النسخ إلى الحافظة' : 'تعذر النسخ، انسخ النص يدويًا', ok ? 'success' : 'warning', 2000);
      if (ok) {
        const ic = btn.querySelector('.icon');
        if (ic) ic.replaceWith(icon('check', { size: size === 'sm' ? 16 : 18 }));
        setTimeout(() => {
          const now = btn.querySelector('.icon');
          if (now) now.replaceWith(icon('copy', { size: size === 'sm' ? 16 : 18 }));
        }, 1500);
      }
    },
  });
  return btn;
}

/** شارة كود بخط ثابت واتجاه LTR (INH-2026-00482). */
export function codeTag(code, { className } = {}) {
  return h('span.code-tag', { class: className, dir: 'ltr', translate: 'no' }, code == null || code === '' ? '—' : String(code));
}

/** نص LTR معزول داخل سياق عربي (أرقام هواتف، أكواد). */
export function ltr(value) {
  return h('span.ltr', { dir: 'ltr' }, value == null || value === '' ? '—' : String(value));
}

const HONORIFICS = new Set(['أ.', 'د.', 'م.', 'أ/', 'د/', 'م/', 'الأستاذ', 'الأستاذة', 'الدكتور', 'الدكتورة', 'المحامي', 'المحامية', 'المستشار', 'أستاذ', 'أستاذة']);

/** دائرة بالحرف الأول من الاسم. */
export function avatar(name, { size = 'md' } = {}) {
  const words = String(name || '').trim().split(/\s+/).filter((w) => w && !HONORIFICS.has(w));
  const first = words[0] || '؟';
  const isArabic = /[؀-ۿ]/.test(first);
  const initials = isArabic ? first.replace(/^ال(?=..)/, '').charAt(0) : (first.charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  let hash = 0;
  for (const ch of String(name || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return h('span.avatar', { class: [`avatar-${size}`, `avatar-c${hash % 6}`], 'aria-hidden': 'true', title: name || '' }, initials);
}

// ───────────────────────── v10 experience: مكونات مشتركة للبوابات (X10-K5) ─────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * «أين وصل الطلب؟» بلغة بصرية واحدة: ol.step-tracker بخطوات منجزة/حالية/قادمة.
 * steps = [{ title, at?, hint? }] — at: تاريخ ISO (يُعرض بتوقيت القاهرة) أو نص جاهز؛ hint يظهر تحت الخطوة الحالية فقط.
 * current: رقم الخطوة الحالية بالعدّ من صفر (0 = الأولى)؛ current = steps.length يعني اكتملت كلها (بلا خطوة حالية).
 * state: 'normal' | 'waiting' — waiting = نقطة كهرمانية للخطوة الحالية (بانتظار ردكم/موافقتكم) دون الرجوع خطوة.
 * note: سطر إضافي تحت الخطوة الحالية (مثل «بانتظار ردكم»). label: aria-label للقائمة.
 * قارئات الشاشة: « (اكتملت)» للمنجزة و« (المرحلة الحالية)» للحالية، وaria-current="step".
 */
export function stepTracker(steps = [], { current = 0, state = 'normal', note, label } = {}) {
  const list = Array.isArray(steps) ? steps : [];
  const cur = Math.max(0, Math.min(Math.trunc(Number(current) || 0), list.length));
  const waiting = state === 'waiting' && cur < list.length;
  return h(
    'ol.step-tracker',
    { 'aria-label': label || null, class: waiting && 'has-waiting' },
    list.map((s, i) => {
      const done = i < cur;
      const isCur = i === cur;
      const wait = isCur && waiting;
      const at = s && s.at ? (ISO_RE.test(String(s.at)) ? dateTime(s.at) : String(s.at)) : '';
      return h(
        'li.step-tracker-step',
        { class: [done && 'is-done', isCur && 'is-current', wait && 'is-waiting'], 'aria-current': isCur ? 'step' : null },
        h('span.step-tracker-dot', { 'aria-hidden': 'true' }, done ? icon('check', { size: 14 }) : h('span.num', String(i + 1))),
        h(
          'span.step-tracker-text',
          h('span.step-tracker-title', s?.title ?? ''),
          at ? h('span.step-tracker-at.num', at) : null,
          isCur && s?.hint ? h('span.step-tracker-hint', s.hint) : null,
          isCur && note ? h('span.step-tracker-note', wait ? icon('clock', { size: 14 }) : null, h('span', note)) : null,
          h('span.sr-only', done ? ' (اكتملت)' : isCur ? ' (المرحلة الحالية)' : ''),
        ),
      );
    }),
  );
}

/**
 * صف قائمة بأسلوب iOS: ارتفاع ≥ 56px، ضغط بتعتيم فقط (بلا تصغير)، سهم في نهاية السطر.
 * href ← <a class="k-row">، onClick وحده ← <button type="button" class="k-row">، بلا أيهما ← <div class="k-row">.
 * icon: اسم أيقونة أو عنصر؛ badges: عنصر أو مصفوفة؛ trailing: نص أو عنصر في نهاية السطر (لا تضع زرًا داخل صف رابط/زر:
 * لصف بزر إجراء اترك href/onClick فارغين). chevron: يظهر افتراضيًا للصف القابل للضغط. dimOnly=false يضيف تصغير الضغط.
 */
export function kRow({ icon: iconName, title, sub, badges, trailing, href, onClick, dimOnly = true, chevron, className } = {}) {
  const tag = href ? 'a' : typeof onClick === 'function' ? 'button' : 'div';
  const showChevron = chevron ?? tag !== 'div';
  return h(
    `${tag}.k-row`,
    {
      href: tag === 'a' ? href : null,
      type: tag === 'button' ? 'button' : null,
      onClick: typeof onClick === 'function' ? onClick : null,
      class: [!dimOnly && 'k-row-scale', className],
    },
    iconName ? h('span.k-row-icon', { 'aria-hidden': 'true' }, typeof iconName === 'string' ? icon(iconName, { size: 22 }) : iconName) : null,
    h('span.k-row-main', h('span.k-row-title', title ?? ''), sub ? h('span.k-row-sub', sub) : null),
    badges ? h('span.k-row-badges', badges) : null,
    trailing != null && trailing !== '' ? h('span.k-row-trailing', trailing) : null,
    showChevron ? h('span.k-row-chevron', { 'aria-hidden': 'true' }, icon('chevronLeft', { size: 20 })) : null,
  );
}
