// v9.1 b-forms — مسجّل الرسالة الصوتية للمستفيدة (نموذج الطلب، والردود والرسائل في صفحة المتابعة).
//
// API (ثابت؛ يستخدمه نموذج الطلب وصفحة المتابعة):
//   voiceRecorder({ maxSeconds = 180, onChange(blobOrNull, { seconds }), address = 'f'|'m', whatsappUrl = null,
//                   variant = 'big'|'compact', initial = { blob, seconds } | null }) → HTMLElement
//     الحالات: جاهز ← (تنبيه إذن الميكروفون) ← يسجّل (زر «خلّصت» + عدّاد «0:12 من 3:00») ← مسجّلة (اسمعيها / امسحيها)
//     ورفض الإذن أو عدم الدعم: رسالة بديلة (الكتابة، أو واتساب إن كان مضبوطًا) ولا يُكسر شيء.
//     العنصر يحمل أيضًا: getBlob() · getSeconds() · setRecording({ blob, seconds }) · reset() · stop() · setDisabled(bool)
//     و dataset.state = idle|asking|recording|recorded|denied|unsupported
//   blobToUpload(blob, filename) → Promise<{ filename, mime, data_base64 }>   (بصيغة مرفقات /api/public/intake و/api/portal)
//   canRecord() → boolean
//
// يعتمد على h.js فقط (بلا مكتبة المكونات) ليبقى خفيفًا على الصفحات العامة، ويحمّل ملف التنسيق v91-b-forms.css بنفسه إن لم يكن محمّلًا.

import { h, svg, mount } from '../lib/h.js';

// الترتيب حسب المواصفة: mp4 (آيفون وChrome الحديث) ثم webm/opus (أندرويد) ثم ogg (فايرفوكس)
const MIME_CANDIDATES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
const BITRATE = 24000; // نحو 540 كيلوبايت لثلاث دقائق
const MIN_SECONDS = 1;
const EXT = { 'audio/webm': '.webm', 'video/webm': '.webm', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'video/mp4': '.m4a', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3' };
const SERVER_MIME = { 'video/webm': 'audio/webm', 'audio/x-m4a': 'audio/mp4', 'video/mp4': 'audio/mp4' };

const COPY = {
  f: {
    start: 'اضغطي وسجّلي رسالة صوتية',
    startShort: 'سجّلي رسالة صوتية',
    permission: 'الموبايل هيسألك: تسمحي بالميكروفون؟ اختاري «سماح».',
    asking: 'لحظة…',
    recording: 'بنسجّل… اتكلمي براحتك',
    play: 'اسمعيها',
    pause: 'وقّفي',
    del: 'امسحيها',
    denied: (wa) => `الموبايل مش سامح بالميكروفون. اكتبي هنا بدل كده${wa ? '، أو ابعتي رسالة صوتية على واتساب' : ''}.`,
    noMic: 'مش لاقيين ميكروفون في الموبايل ده. اكتبي هنا بدل كده.',
    retry: 'جربي تاني',
    unsupported: ['تحبي تبعتي رسالة صوتية؟', 'ابعتيها على واتساب'],
    tooShort: 'التسجيل قصير أوي. اضغطي وسجّلي تاني.',
    failed: 'التسجيل وقف. جربي تاني.',
    auto: (max) => `التسجيل وقف لوحده بعد ${minutesText(max)}.`,
    wa: 'افتحي واتساب',
  },
  m: {
    start: 'اضغط وسجّل رسالة صوتية',
    startShort: 'سجّل رسالة صوتية',
    permission: 'الموبايل هيسألك: تسمح بالميكروفون؟ اختار «سماح».',
    asking: 'لحظة…',
    recording: 'بنسجّل… اتكلم براحتك',
    play: 'اسمعها',
    pause: 'وقّف',
    del: 'امسحها',
    denied: (wa) => `الموبايل مش سامح بالميكروفون. اكتب هنا بدل كده${wa ? '، أو ابعت رسالة صوتية على واتساب' : ''}.`,
    noMic: 'مش لاقيين ميكروفون في الموبايل ده. اكتب هنا بدل كده.',
    retry: 'جرب تاني',
    unsupported: ['تحب تبعت رسالة صوتية؟', 'ابعتها على واتساب'],
    tooShort: 'التسجيل قصير أوي. اضغط وسجّل تاني.',
    failed: 'التسجيل وقف. جرب تاني.',
    auto: (max) => `التسجيل وقف لوحده بعد ${minutesText(max)}.`,
    wa: 'افتح واتساب',
  },
};

function minutesText(sec) {
  const m = Math.round(sec / 60);
  if (m === 1) return 'دقيقة';
  if (m === 2) return 'دقيقتين';
  if (m >= 3 && m <= 10) return `${m} دقايق`;
  return `${m} دقيقة`;
}

/** 0:45 · 3:00 — الأرقام كما تظهر في عدّاد الموبايل */
export function clock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ───────── أيقونات صغيرة (مسارات SVG بنفس أسلوب مكتبة المكونات) ─────────
const PATHS = {
  mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
  stop: ['M7 7h10v10H7z'],
  play: ['M7 4l13 8-13 8z'],
  pause: ['M7 4h3v16H7z', 'M14 4h3v16h-3z'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  whatsapp: ['M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21'],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
};
const FILLED = new Set(['stop', 'play', 'pause']);

function ic(name, size = 22) {
  return svg(
    'svg',
    {
      class: `bmf-ic bmf-ic-${name}`,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: FILLED.has(name) ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    (PATHS[name] || []).map((d) => svg('path', { d })),
  );
}

/** يحمّل ملف تنسيق مكوّنات التسجيل والتصوير مرة واحدة إن لم تضمّنه الصفحة. */
export function ensureFormsStyles() {
  try {
    if (document.querySelector('link[data-bmf-css], link[href*="v91-b-forms.css"]')) return;
    const href = new URL('../../css/v91-b-forms.css', import.meta.url).pathname;
    document.head.append(h('link', { rel: 'stylesheet', href, 'data-bmf-css': '1' }));
  } catch {
    /* بلا تنسيق إضافي يبقى المكوّن صالحًا للاستخدام */
  }
}

/** هل يستطيع هذا المتصفح تسجيل رسالة صوتية؟ (يحتاج HTTPS أو localhost وصلاحية الميكروفون للصفحة) */
export function canRecord() {
  try {
    return !!(window.isSecureContext !== false && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' && typeof window.MediaRecorder === 'function');
  } catch {
    return false;
  }
}

function pickMime() {
  try {
    if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  } catch {
    return '';
  }
}

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

// ───────── (إصلاح 9.1) مدة تسجيل MP4 ─────────
// MediaRecorder يكتب MP4 مجزّأً (moov ثم moof/mdat) ومدته في الرأس (mvhd) صفر، فيعرض المشغل مدة ما قرأه من الأجزاء
// فقط (3.94 ث لتسجيل مدته 6.46 ث) أو «0:00» حتى التشغيل. نحسب المدة الحقيقية من الأجزاء (tfdt + مدد العينات في trun)
// ونكتبها في mvhd وtkhd وmdhd في أماكنها (بلا تغيير في حجم الملف ولا في الصوت نفسه). أي بنية غير متوقعة ← null (يبقى كما هو).

/**
 * @param {Uint8Array|ArrayBuffer} input ملف MP4
 * @returns {{bytes: Uint8Array, seconds: number}|null} نسخة مصححة، أو null إن لم يلزم أو لم يمكن
 */
export function fixMp4Duration(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u32 = (p) => dv.getUint32(p);
  const u64 = (p) => dv.getUint32(p) * 4294967296 + dv.getUint32(p + 4);
  function* boxes(start, end) {
    let p = start;
    while (p + 8 <= end) {
      let size = u32(p);
      let hdr = 8;
      if (size === 1) {
        if (p + 16 > end) return;
        size = u64(p + 8);
        hdr = 16;
      } else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) return;
      yield { t: String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]), body: p + hdr, end: p + size };
      p += size;
    }
  }
  const child = (box, t) => {
    for (const c of boxes(box.body, box.end)) if (c.t === t) return c;
    return null;
  };
  const v1 = (box) => b[box.body] === 1;
  try {
    let moov = null;
    const moofs = [];
    for (const x of boxes(0, b.length)) {
      if (x.t === 'moov') moov = x;
      else if (x.t === 'moof') moofs.push(x);
    }
    if (!moov || !moofs.length) return null;
    const mvhd = child(moov, 'mvhd');
    const traks = [...boxes(moov.body, moov.end)].filter((x) => x.t === 'trak');
    if (!mvhd || traks.length !== 1) return null; // تسجيل صوت: مسار واحد
    const tkhd = child(traks[0], 'tkhd');
    const mdia = child(traks[0], 'mdia');
    const mdhd = mdia && child(mdia, 'mdhd');
    if (!tkhd || !mdhd) return null;
    const mvDurAt = v1(mvhd) ? mvhd.body + 24 : mvhd.body + 16;
    if ((v1(mvhd) ? u64(mvDurAt) : u32(mvDurAt)) !== 0) return null; // المدة مكتوبة أصلًا
    const mvTs = u32(v1(mvhd) ? mvhd.body + 20 : mvhd.body + 12);
    const mdTs = u32(v1(mdhd) ? mdhd.body + 20 : mdhd.body + 12);
    if (!mvTs || !mdTs) return null;
    const mvex = child(moov, 'mvex');
    const trex = mvex && child(mvex, 'trex');
    const trexDur = trex ? u32(trex.body + 12) : 0;
    let end = 0;
    for (const moof of moofs) {
      for (const traf of boxes(moof.body, moof.end)) {
        if (traf.t !== 'traf') continue;
        const tfhd = child(traf, 'tfhd');
        const tfdt = child(traf, 'tfdt');
        if (!tfhd || !tfdt) return null;
        let t = v1(tfdt) ? u64(tfdt.body + 4) : u32(tfdt.body + 4);
        const hf = u32(tfhd.body) & 0xffffff;
        let q = tfhd.body + 8;
        if (hf & 0x1) q += 8;
        if (hf & 0x2) q += 4;
        const defDur = hf & 0x8 ? u32(q) : trexDur;
        for (const trun of boxes(traf.body, traf.end)) {
          if (trun.t !== 'trun') continue;
          const f = u32(trun.body) & 0xffffff;
          const count = u32(trun.body + 4);
          let r = trun.body + 8;
          if (f & 0x1) r += 4;
          if (f & 0x4) r += 4;
          const per = (f & 0x100 ? 4 : 0) + (f & 0x200 ? 4 : 0) + (f & 0x400 ? 4 : 0) + (f & 0x800 ? 4 : 0);
          if (r + count * per > trun.end) return null;
          if (!(f & 0x100) && !defDur) return null;
          for (let i = 0; i < count; i++) t += f & 0x100 ? u32(r + i * per) : defDur;
        }
        end = Math.max(end, t);
      }
    }
    if (!(end > 0) || end > 0xffffffff) return null;
    const out = b.slice();
    const o = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const put = (box, at, val) => {
      if (v1(box)) {
        o.setUint32(at, Math.floor(val / 4294967296));
        o.setUint32(at + 4, val % 4294967296);
      } else o.setUint32(at, val);
    };
    const movieDur = Math.round((end * mvTs) / mdTs);
    put(mvhd, mvDurAt, movieDur);
    put(tkhd, v1(tkhd) ? tkhd.body + 28 : tkhd.body + 20, movieDur);
    put(mdhd, v1(mdhd) ? mdhd.body + 24 : mdhd.body + 16, end);
    return { bytes: out, seconds: end / mdTs };
  } catch {
    return null;
  }
}

/** تسجيل MP4 بمدته الحقيقية في رأسه (وإلا يعود كما هو) */
async function withMp4Duration(blob) {
  try {
    if (!/mp4|m4a/i.test(blob.type || '')) return blob;
    const fixed = fixMp4Duration(new Uint8Array(await blob.arrayBuffer()));
    return fixed ? new Blob([fixed.bytes], { type: blob.type }) : blob;
  } catch {
    return blob;
  }
}

/**
 * تجهيز التسجيل للإرسال بصيغة مرفقات الخادم. الامتداد يطابق النوع الفعلي دائمًا
 * (الخادم يحدد النوع من الامتداد أولًا ثم يتحقق من محتوى الملف).
 */
export async function blobToUpload(blob, filename = 'رسالة-صوتية') {
  if (!blob) throw new Error('no recording');
  const raw = String(blob.type || '').split(';')[0].trim().toLowerCase() || 'audio/webm';
  const mime = SERVER_MIME[raw] || raw;
  const ext = EXT[raw] || EXT[mime] || '';
  let name = String(filename || 'رسالة-صوتية').trim().replace(/[\\/]/g, '-') || 'رسالة-صوتية';
  if (ext && !name.toLowerCase().endsWith(ext)) name = name.replace(/\.[A-Za-z0-9]{1,5}$/, '') + ext;
  return { filename: name, mime, data_base64: await readAsBase64(blob) };
}

/**
 * مسجّل رسالة صوتية واحدة.
 * @returns {HTMLElement}
 */
export function voiceRecorder({ maxSeconds = 180, onChange, address = 'f', whatsappUrl = null, variant = 'big', initial = null } = {}) {
  ensureFormsStyles();
  const t = COPY[address === 'm' ? 'm' : 'f'];
  const max = Math.max(5, Math.min(600, Number(maxSeconds) || 180));
  const el = h('div.bmf-rec', { class: variant === 'compact' ? 'bmf-rec--compact' : 'bmf-rec--big' });
  const live = h('span.bmf-sr', { 'aria-live': 'polite' });

  let state = 'idle';
  let blob = null;
  let seconds = 0;
  let url = null;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let startedAt = 0;
  let tick = null;
  let note = '';
  let asked = false;
  let disabled = false;
  let micGranted = false;
  // الزر المضغوط يُستبدل مع كل حالة: نعيد التركيز للزر الرئيسي الجديد (خلّصت / اسمعيها) بدل أن يضيع لأول الصفحة
  let keepFocus = false;
  const audio = h('audio', { preload: 'metadata', class: 'bmf-audio' });
  audio.addEventListener('ended', () => paint());
  audio.addEventListener('pause', () => paint());
  audio.addEventListener('play', () => paint());

  // إن كان الإذن ممنوحًا من قبل لا داعي لتنبيه «الموبايل هيسألك»
  try {
    navigator.permissions
      ?.query({ name: 'microphone' })
      .then((p) => {
        micGranted = p.state === 'granted';
        if (state === 'idle') paint();
      })
      .catch(() => {});
  } catch {
    /* المتصفح لا يدعم استعلام الصلاحيات */
  }

  const emit = () => {
    try {
      onChange?.(blob, { seconds });
    } catch (e) {
      console.error(e);
    }
  };

  function releaseStream() {
    try {
      stream?.getTracks().forEach((tr) => tr.stop());
    } catch {
      /* لا شيء */
    }
    stream = null;
  }

  function setUrl(b) {
    if (url) URL.revokeObjectURL(url);
    url = b ? URL.createObjectURL(b) : null;
    if (url) audio.src = url;
    else audio.removeAttribute('src');
  }

  async function start() {
    if (disabled || state === 'recording' || state === 'asking') return;
    note = '';
    asked = true;
    state = 'asking';
    paint();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      releaseStream();
      state = 'denied';
      note = e && e.name === 'NotFoundError' ? t.noMic : t.denied(!!whatsappUrl);
      paint();
      return;
    }
    micGranted = true;
    const mimeType = pickMime();
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: BITRATE });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        releaseStream();
        state = 'unsupported';
        paint();
        return;
      }
    }
    chunks = [];
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    });
    recorder.addEventListener('stop', finish);
    recorder.addEventListener('error', () => {
      note = t.failed;
      finish();
    });
    try {
      recorder.start(1000);
    } catch {
      releaseStream();
      state = 'idle';
      note = t.failed;
      paint();
      return;
    }
    startedAt = performance.now();
    state = 'recording';
    live.textContent = 'بدأ التسجيل';
    tick = setInterval(() => {
      const s = (performance.now() - startedAt) / 1000;
      if (s >= max) {
        note = t.auto(max);
        stop();
        return;
      }
      const timer = el.querySelector('.bmf-rec-now');
      if (timer) timer.textContent = clock(s);
    }, 250);
    paint();
  }

  function stop() {
    if (state !== 'recording' || !recorder) return;
    clearInterval(tick);
    tick = null;
    seconds = Math.min(max, (performance.now() - startedAt) / 1000);
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      else finish();
    } catch {
      finish();
    }
  }

  async function finish() {
    if (!recorder) return;
    const type = recorder.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
    recorder = null;
    clearInterval(tick);
    tick = null;
    releaseStream();
    let b = chunks.length ? new Blob(chunks, { type }) : null;
    chunks = [];
    // (إصلاح 9.1) MP4 المجزّأ: المدة الحقيقية في رأس الملف، فيعرضها المشغل (عند الإدارة وفي صفحتها) قبل التشغيل
    if (b && seconds >= MIN_SECONDS) {
      b = await withMp4Duration(b);
      if (state !== 'recording') return; // مُسحت أثناء التجهيز (reset)
    }
    if (!b || seconds < MIN_SECONDS) {
      state = 'idle';
      note = note || t.tooShort;
      blob = null;
      seconds = 0;
      setUrl(null);
      live.textContent = note;
      paint();
      emit();
      return;
    }
    blob = b;
    state = 'recorded';
    setUrl(b);
    live.textContent = `خلص التسجيل، مدته ${clock(seconds)}`;
    paint();
    emit();
  }

  function remove() {
    if (disabled) return;
    audio.pause();
    blob = null;
    seconds = 0;
    setUrl(null);
    state = 'idle';
    note = '';
    live.textContent = 'اتمسح التسجيل';
    paint();
    emit();
    el.querySelector('.bmf-rec-start')?.focus();
  }

  function togglePlay() {
    if (!url) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  // تبديل التطبيق (لواتساب مثلًا) أثناء التسجيل: نحفظ ما سُجّل بدل أن يضيع لو أُغلقت الصفحة
  const onHidden = () => {
    if (document.visibilityState === 'hidden' && state === 'recording') stop();
  };
  document.addEventListener('visibilitychange', onHidden);

  const MAIN_CONTROL = { idle: '.bmf-rec-start', denied: '.bmf-rec-start', recording: '.bmf-rec-stop', recorded: '.bmf-rec-play' };
  function paint() {
    keepFocus = keepFocus || el.contains(document.activeElement);
    renderState();
    if (!keepFocus) return;
    if (el.contains(document.activeElement)) {
      keepFocus = false;
      return;
    }
    const main = MAIN_CONTROL[state] ? el.querySelector(MAIN_CONTROL[state]) : null;
    if (main && !main.disabled) {
      main.focus({ preventScroll: true });
      keepFocus = false;
    } else if (state !== 'asking') keepFocus = false;
    // «لحظة…» (الزر معطّل لحين رد الموبايل): نحتفظ بالرغبة في التركيز للحالة التالية
  }

  function renderState() {
    el.dataset.state = state;
    const big = variant !== 'compact';
    const parts = [];
    if (state === 'unsupported') {
      el.hidden = !whatsappUrl;
      if (whatsappUrl) {
        parts.push(
          h(
            'p.bmf-rec-alt',
            ic('whatsapp', 20),
            h('span', t.unsupported[0], ' '),
            h('a', { href: whatsappUrl, target: '_blank', rel: 'noopener noreferrer' }, t.unsupported[1]),
          ),
        );
      }
      mount(el, parts, live);
      return;
    }
    el.hidden = false;
    if (state === 'idle' || state === 'asking' || state === 'denied') {
      const label = big ? t.start : t.startShort;
      parts.push(
        h(
          'button.bmf-rec-start',
          {
            type: 'button',
            disabled: disabled || state === 'asking',
            'aria-label': big ? null : label,
            title: big ? null : label,
            onClick: start,
          },
          h('span.bmf-rec-start-icon', ic('mic', big ? 30 : 22)),
          big ? h('span.bmf-rec-start-label', state === 'asking' ? t.asking : label) : null,
        ),
      );
      if (state === 'denied') {
        parts.push(
          h(
            'p.bmf-rec-note.is-warn',
            { role: 'alert' },
            ic('alert', 18),
            h('span', note, ' '),
            whatsappUrl && h('a', { href: whatsappUrl, target: '_blank', rel: 'noopener noreferrer' }, t.wa),
          ),
        );
      } else if (note) {
        parts.push(h('p.bmf-rec-note', { role: 'status' }, note));
      } else if (big && !asked && !micGranted) {
        parts.push(h('p.bmf-rec-hint', t.permission));
      }
    } else if (state === 'recording') {
      parts.push(
        h(
          'div.bmf-rec-live',
          h(
            'button.bmf-rec-stop',
            { type: 'button', onClick: stop },
            h('span.bmf-rec-stop-icon', ic('stop', big ? 26 : 18)),
            h('span.bmf-rec-stop-label', 'خلّصت'),
          ),
          h(
            'div.bmf-rec-status',
            h('span.bmf-rec-dot', { 'aria-hidden': 'true' }),
            h('span.bmf-rec-text', t.recording),
            h(
              'span.bmf-rec-timer',
              { 'aria-live': 'off' },
              h('span.bmf-rec-now', { dir: 'ltr' }, clock((performance.now() - startedAt) / 1000)),
              ' من ',
              h('span', { dir: 'ltr' }, clock(max)),
            ),
          ),
        ),
      );
    } else if (state === 'recorded') {
      const playing = !audio.paused && !audio.ended;
      parts.push(
        h(
          'div.bmf-rec-done',
          h('span.bmf-rec-title', ic('mic', 18), h('span', 'رسالتك الصوتية '), h('span.bmf-rec-dur', { dir: 'ltr' }, `(${clock(seconds)})`)),
          h(
            'button.bmf-rec-play',
            { type: 'button', onClick: togglePlay, 'aria-pressed': String(playing) },
            ic(playing ? 'pause' : 'play', 18),
            h('span', playing ? t.pause : t.play),
          ),
          h(
            'button.bmf-rec-del',
            { type: 'button', disabled, onClick: remove, 'aria-label': `${t.del} — رسالتك الصوتية` },
            ic('trash', 18),
            h('span', t.del),
          ),
        ),
      );
      if (note) parts.push(h('p.bmf-rec-note', { role: 'status' }, note));
    }
    mount(el, parts, audio, live);
  }

  el.getBlob = () => blob;
  el.getSeconds = () => seconds;
  el.isRecording = () => state === 'recording';
  el.stop = stop;
  el.reset = () => {
    if (state === 'recording') {
      clearInterval(tick);
      try {
        recorder?.removeEventListener('stop', finish);
        recorder?.stop();
      } catch {
        /* لا شيء */
      }
      recorder = null;
      releaseStream();
    }
    audio.pause();
    blob = null;
    seconds = 0;
    setUrl(null);
    state = canRecord() ? 'idle' : 'unsupported';
    note = '';
    paint();
  };
  el.setRecording = ({ blob: b, seconds: s } = {}) => {
    if (!b) return el.reset();
    blob = b;
    seconds = Number(s) || 0;
    setUrl(b);
    state = 'recorded';
    note = '';
    paint();
  };
  el.setDisabled = (v) => {
    disabled = !!v;
    el.querySelectorAll('button').forEach((b) => {
      if (!b.classList.contains('bmf-rec-play')) b.disabled = disabled;
    });
  };
  el.destroy = () => {
    document.removeEventListener('visibilitychange', onHidden);
    el.reset();
    setUrl(null);
  };

  if (!canRecord()) state = 'unsupported';
  if (initial && initial.blob) el.setRecording(initial);
  else paint();
  return el;
}
