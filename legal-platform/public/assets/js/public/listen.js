// v9.2 — «اسمعي»: قراءة الشاشة بصوت عربي من الموبايل نفسه (speechSynthesis). بلا استيراد وبلا DOM عام:
// تستقبل العناصر نفسها من الصفحة. لا تتكلم أبدًا بلا ضغطة (المتصفح يمنع ذلك أصلًا).
//   canListen()                 → Promise<boolean>: يوجد صوت عربي (ينتظر voiceschanged حتى 2.5 ثانية)
//   speak([{ text, el }], { onEnd, onFail })   يقرأ بالترتيب ويضع .is-speaking على العنصر المقروء
//   stop()                      يوقف القراءة
//   listenOn() / setListen(b)   «السماع شغال» في هذه الجلسة (sessionStorage bm.listen)
//   readScreen(items, opts)     يقرأ الشاشة الجديدة إن كان السماع شغالًا
//   spellPhone(digits)          «صفر، واحد، صفر. …» بمجموعات 3-4-4
//   numberWords(n)              29 → «تسعة وعشرين»
// onFail(reason): 'nostart' (لا بداية خلال ثانيتين: الصوت غير محمّل)، 'error'، 'not-allowed' (يحتاج ضغطة)

const G = globalThis;
const KEY = 'bm.listen';
const START_TIMEOUT_MS = 2000;
const VOICE_WAIT_MS = 2500;
const RATE = 0.9;

const synth = () => G.speechSynthesis || null;
let voice = null;
let run = null;
let marked = null;

function pickVoice() {
  const s = synth();
  if (!s || typeof s.getVoices !== 'function') return null;
  const ar = (s.getVoices() || []).filter((v) => /^ar/i.test(v.lang || ''));
  return ar.find((v) => /^ar[-_]EG/i.test(v.lang)) || ar[0] || null;
}

export function canListen() {
  const s = synth();
  if (!s || typeof G.SpeechSynthesisUtterance !== 'function') return Promise.resolve(false);
  voice = pickVoice();
  if (voice) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      s.removeEventListener?.('voiceschanged', on);
      voice = pickVoice();
      resolve(!!voice);
    };
    const on = () => {
      if (pickVoice()) finish();
    };
    s.addEventListener?.('voiceschanged', on);
    setTimeout(finish, VOICE_WAIT_MS);
  });
}

function mark(el) {
  if (marked && marked !== el) marked.classList?.remove('is-speaking');
  marked = el || null;
  marked?.classList?.add('is-speaking');
}

export function stop() {
  run = null;
  try {
    synth()?.cancel();
  } catch {
    /* لا شيء */
  }
  mark(null);
}

export function speak(items, { onEnd, onFail } = {}) {
  stop();
  const s = synth();
  if (!s || typeof G.SpeechSynthesisUtterance !== 'function') {
    onFail?.('error');
    return;
  }
  const me = {};
  run = me;
  const list = (items || []).filter((x) => x && String(x.text || '').trim());
  let i = 0;
  let started = false;
  // صوت عربي مذكور في القائمة لكنه غير محمّل على الموبايل: لا يبدأ أبدًا
  const timer = setTimeout(() => {
    if (run === me && !started) {
      stop();
      onFail?.('nostart');
    }
  }, START_TIMEOUT_MS);
  const next = () => {
    if (run !== me) return;
    if (i >= list.length) {
      clearTimeout(timer);
      mark(null);
      run = null;
      onEnd?.();
      return;
    }
    const item = list[i];
    i += 1;
    const u = new G.SpeechSynthesisUtterance(String(item.text));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'ar-EG';
    u.rate = RATE;
    u.onstart = () => {
      started = true;
      if (run === me) mark(item.el);
    };
    u.onend = next;
    u.onerror = (e) => {
      const err = e?.error;
      if (run !== me || err === 'interrupted' || err === 'canceled') return;
      clearTimeout(timer);
      stop();
      onFail?.(err === 'not-allowed' ? 'not-allowed' : 'error');
    };
    s.speak(u);
  };
  next();
}

export function listenOn() {
  try {
    return G.sessionStorage?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setListen(on) {
  try {
    if (on) G.sessionStorage.setItem(KEY, '1');
    else G.sessionStorage.removeItem(KEY);
  } catch {
    /* التخزين غير متاح */
  }
}

/** شاشة جديدة بعد ضغطة: تُقرأ وحدها لو السماع شغال */
export function readScreen(items, opts) {
  if (!listenOn()) return false;
  speak(items, opts);
  return true;
}

const DIGITS = ['صفر', 'واحد', 'اتنين', 'تلاتة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'تمانية', 'تسعة'];

/** رقم الموبايل رقمًا رقمًا بمجموعات 3-4-4 (وقفة قصيرة بين الأرقام وأطول بين المجموعات) */
export function spellPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  const groups = d.length === 11 ? [d.slice(0, 3), d.slice(3, 7), d.slice(7)] : [d];
  return groups.map((g) => [...g].map((x) => DIGITS[Number(x)]).join('، ')).join('. ');
}

const ONES = ['', 'واحد', 'اتنين', 'تلاتة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'تمانية', 'تسعة'];
const TEENS = ['عشرة', 'حداشر', 'اتناشر', 'تلتاشر', 'أربعتاشر', 'خمستاشر', 'ستاشر', 'سبعتاشر', 'تمنتاشر', 'تسعتاشر'];
const TENS = ['', '', 'عشرين', 'تلاتين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'تمانين', 'تسعين'];
const HUNDREDS = ['', 'مية', 'ميتين', 'تلتمية', 'ربعمية', 'خمسمية', 'ستمية', 'سبعمية', 'تمنمية', 'تسعمية'];

function under1000(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r >= 20) parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[r / 10]);
  else if (r >= 10) parts.push(TEENS[r - 10]);
  else if (r) parts.push(ONES[r]);
  return parts.join(' و');
}

/** العدد بالكلام المصري: 29 → «تسعة وعشرين»، 1205 → «ألف ومتين وخمسة» تقريبًا كما يُقال */
export function numberWords(n) {
  const k = Math.floor(Math.abs(Number(n) || 0));
  if (!k) return 'صفر';
  if (k >= 1000000) return String(k);
  const th = Math.floor(k / 1000);
  const rest = k % 1000;
  const parts = [];
  if (th === 1) parts.push('ألف');
  else if (th === 2) parts.push('ألفين');
  else if (th >= 3 && th <= 10) parts.push(`${under1000(th)} آلاف`);
  else if (th > 10) parts.push(`${under1000(th)} ألف`);
  if (rest) parts.push(under1000(rest));
  return parts.join(' و');
}
