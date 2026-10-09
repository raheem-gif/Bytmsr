// v11 segment-server §5.1 — pure module: segment vocabulary (no imports, no DOM; not in any charity closure)
export const SEGMENTS = ['charity', 'paid'];
export const SEG_PARAM = 'seg';
export const SEG_COOKIE = 'bm_seg';
export const SEG_COOKIE_MAX_AGE = 15552000;

export function parseSegment(v) {
  return v === 'charity' || v === 'paid' ? v : null;
}

// the FIRST bm_seg in the header decides (RFC 6265 order)
export function segmentFromCookie(header) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SEG_COOKIE) return parseSegment(part.slice(i + 1).trim());
  }
  return null;
}

// G11-26 (r2): same keys and order as topics.js
const T = (label, wa_title, wa_desc, wa_phrase, seo, sub = '') => ({ label, sub, wa_title, wa_desc, wa_phrase, seo });
export const PAID_TOPICS = {
  inh: T('الميراث', 'الميراث', 'إعلام الوراثة وقسمة التركة والنزاع على الميراث', 'الميراث', 'الميراث وقسمة التركات'),
  pen: T('المعاشات', 'المعاشات والتأمينات', 'صرف المعاش ووقفه والتأمينات الاجتماعية', 'المعاشات والتأمينات', 'المعاشات والتأمينات الاجتماعية'),
  guardianship: T('أموال القاصرين', 'أموال القاصرين', 'الولاية على المال والنيابة الحسبية', 'أموال القاصرين والولاية على المال', 'الولاية على المال'),
  alimony: T('النفقة', 'النفقة', 'نفقة الزوجة والأبناء ومتجمد النفقة', 'النفقة', 'النفقة'),
  custody: T('الحضانة والرؤية', 'الحضانة والرؤية', 'الحضانة والرؤية والولاية التعليمية', 'الحضانة والرؤية', 'الحضانة والرؤية'),
  rent: T('العقارات والإيجار', 'العقارات والإيجار', 'الإيجار القديم والجديد والإخلاء ونزاعات الملكية', 'العقارات والإيجار', 'العقارات والإيجار'),
  papers: T('الأوراق الرسمية', 'الأوراق الرسمية', 'استخراج المستندات وتصحيح البيانات والقيود', 'استخراج الأوراق الرسمية', 'استخراج المستندات الرسمية'),
  other: T('موضوع آخر', 'موضوع آخر', 'أي مسألة قانونية أخرى للأفراد أو الشركات', '', '', 'الطلاق والخلع، العقود، العمل، الشركات، وغيرها'),
};

export const PAID_PREFILL_HEAD = 'مرحبًا، أرغب في حجز استشارة قانونية';
export const COMPANY_PREFILL = 'مرحبًا، نرغب في التواصل بخصوص الخدمات القانونية للشركات.';
export const CHOICE_IDS = { charity: 'seg:charity', paid: 'seg:paid' };
export const REQUESTER_EMPLOYEES = ['1-10', '11-50', '51-200', '200+'];
export const REQUESTER_NEEDS = ['contracts', 'employees', 'compliance', 'disputes', 'subscription'];

export function paidWaPrefill(topicKey) {
  const t = Object.hasOwn(PAID_TOPICS, topicKey) ? PAID_TOPICS[topicKey] : null;
  return t && t.wa_phrase ? `${PAID_PREFILL_HEAD} بخصوص ${t.wa_phrase}.` : `${PAID_PREFILL_HEAD}.`;
}

// NFC, no tashkeel/tatweel/bidi marks, one comma form, alef/ta-marbuta/ya forms unified, single spaces
const N = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/,/g, '،')
    .replace(/\s+/g, ' ')
    .trim();

// the paid / company sentence opening a message → { topic|null, requester:'company'|null, rest } | null
export function paidPrefillOf(text) {
  const raw = String(text ?? '').trim();
  const end = raw.search(/[.!؟?\n]/);
  const sentence = N(end < 0 ? raw : raw.slice(0, end));
  const rest = end < 0 ? '' : raw.slice(end + 1).trim();
  const co = N(COMPANY_PREFILL.slice(0, -1));
  if (sentence.startsWith(co)) return { topic: null, requester: 'company', rest: sentence === co ? rest : raw };
  const head = N(PAID_PREFILL_HEAD);
  if (!sentence.startsWith(head)) return null;
  const after = sentence.slice(head.length).trim();
  let topic = null;
  if (after.startsWith('بخصوص ')) {
    for (const k in PAID_TOPICS) if (PAID_TOPICS[k].wa_phrase && N(PAID_TOPICS[k].wa_phrase) === after.slice(6).trim()) topic = k;
  }
  return { topic, requester: null, rest: !after || topic ? rest : raw };
}

const CHOICES = { charity: ['خيري', 'خيري مجاني', 'مجاني'], paid: ['افراد وشركات', 'افراد', 'شركات', 'مدفوع', 'خدمه مدفوعه'] };
// a whole message naming one side → 'charity' | 'paid' | null
export function choiceFromText(text) {
  const s = N(text).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 30) return null;
  for (const k of SEGMENTS) if (CHOICES[k].includes(s)) return k;
  return null;
}
