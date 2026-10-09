// الإصدار 10 — بوابة المستندات لكل ما يخرج من المكتب إلى شركة (L-56، CO-5، CS-12، INV-B11).
// تُستخدم في الفحص المسبق للتسليم وفي إرساله وفي رسائل الفريق للشركة التي تحمل مرفقات.
//
// ما تفحصه:
//  1) النصوص (العنوان والملخص والنص والتوصيات، وعناوين المرفقات وأسماء ملفاتها): أسماء كل محامٍ أُسند إليه الملف يومًا —
//     الاسم العربي (كاملًا، والأول مع الأخير، والأول مع الثاني) بعد توحيد الحروف وحذف الألقاب («أ.»، «الأستاذ»، «د.»،
//     «المحامي»…)، واسم المستخدم، والاسم بالإنجليزية (lawyers.name_latin) دون اعتبار لحالة الأحرف وعلى حدود الكلمات.
//  2) بيانات الكاتب في الملفات (بلا اعتماديات): docx/xlsx/pptx بقارئ صغير للفهرس المركزي لملف ZIP مع zlib.inflateRawSync
//     (كل عنصر ≤ 5 ميجابايت بعد فك الضغط) — dc:creator وcp:lastModifiedBy وw:author (التعديلات المتعقبة والتعليقات) ومؤلفو
//     تعليقات Excel وPowerPoint؛ وPDF بقراءة أول 256 كيلوبايت وآخرها بحثًا عن /Author (نصًا أو ست عشريًا أو UTF-16) وdc:creator.
//  3) كل ملف Office أو PDF يُعد «ملفًا يحتاج مراجعة» (office_docs)؛ ملف ZIP تالف أو ملف Office قديم (doc/xls) يُعامل كأنه
//     يحمل بيانات كاتب. اسم محامٍ في بيانات الملف ← 409 file_author_names بلا تجاوز (يُحفظ الملف من جديد بلا اسم).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { normalizeArabic } from '../util.js';

const ZIP_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
const OLE_MIMES = new Set(['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint']);
const PDF_MIME = 'application/pdf';
const MAX_INFLATED = 5 * 1024 * 1024;
const PDF_WINDOW = 256 * 1024;

// ───────────────────────── توحيد الأسماء ─────────────────────────
/** ألقاب تسبق الاسم وتُحذف قبل المقارنة */
const HONORIFICS_RE = /(^|\s)(?:ا\.|د\.|م\.|الاستاذه|الاستاذ|استاذه|استاذ|الدكتوره|الدكتور|المحاميه|المحامي|المستشاره|المستشار)(?=\s|$)/gu;

/** توحيد نص عربي/لاتيني للمقارنة: الحروف، التشكيل، التطويل، الألقاب، وعلامات الترقيم إلى مسافات */
export function normalizeForNames(text) {
  let s = normalizeArabic(String(text ?? ''));
  s = s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
  s = s.replace(/[^\p{L}\p{N}.]+/gu, ' ');
  s = ` ${s} `.replace(HONORIFICS_RE, '$1 ');
  s = s.replace(/\./g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** صيغ الاسم العربي: الكامل، والأول مع الأخير، والأول مع الثاني (اسمان على الأقل) */
export function arabicNameVariants(name) {
  const n = normalizeForNames(name);
  if (!n) return [];
  const parts = n.split(' ').filter(Boolean);
  const out = new Set();
  if (parts.length >= 2) {
    out.add(parts.join(' '));
    out.add(`${parts[0]} ${parts[parts.length - 1]}`);
    out.add(`${parts[0]} ${parts[1]}`);
    // «عبد» جزء من الاسم المركب: «عبد الرحمن» لا يُعد اسمًا أول وحده
    if (parts[0] === 'عبد' && parts.length >= 3) {
      out.add(`${parts[0]} ${parts[1]} ${parts[parts.length - 1]}`);
      out.add(`${parts[0]} ${parts[1]} ${parts[2]}`);
      out.delete(`${parts[0]} ${parts[1]}`);
      out.delete(`${parts[0]} ${parts[parts.length - 1]}`);
    }
  }
  return [...out].filter((x) => x.split(' ').length >= 2);
}

/** صيغ الاسم اللاتيني: «Tarek El-Naggar» ← «tarek el naggar»، «tarek elnaggar»، «tarek naggar» */
export function latinNameVariants(name) {
  const n = String(name ?? '').toLowerCase().replace(/[^a-z\s'.-]/g, ' ').replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
  if (!n) return [];
  const out = new Set();
  const spaced = n.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const joined = n.replace(/-/g, '').replace(/\s+/g, ' ').trim();
  for (const v of [spaced, joined]) {
    const parts = v.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      out.add(parts.join(' '));
      out.add(`${parts[0]} ${parts[parts.length - 1]}`);
    }
  }
  return [...out];
}

/** gate K4: «Tarek El-Naggar» (طارق النجار) حين يختلف ما وُجد عن الاسم العربي، وإلا الاسم وحده */
export function nameShown(hit) {
  const m = String(hit?.matched || '').trim();
  const n = String(hit?.name || '');
  return m && normalizeForNames(m) !== normalizeForNames(n) ? `«${m}» (${n})` : n;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** هل يحتوي النص الموحَّد على العبارة كلمةً مستقلة (مع حرف عطف أو جر ملتصق في العربية)؟ */
function containsPhrase(normText, phrase, { latin = false } = {}) {
  if (!phrase) return false;
  const pre = latin ? '(?:^|[^a-z0-9])' : '(?:^|[^\\p{L}\\p{N}])[وفبل]?';
  const post = latin ? '(?=$|[^a-z0-9])' : '(?=$|[^\\p{L}\\p{N}])';
  const re = new RegExp(`${pre}${esc(phrase).replace(/ /g, '\\s+')}${post}`, latin ? 'i' : 'u');
  return re.test(normText);
}

/** نص لاتيني موحَّد للمقارنة (الشرطة والنقطة مسافة) */
function normalizeLatin(text) {
  return String(text ?? '').toLowerCase().replace(/[-_.'’]/g, ' ').replace(/\s+/g, ' ');
}

// ───────── gate K4/G7-04: مطابقة على كلمات النص الأصلي (لإظهار ما وُجد فعلًا) مع الصيغ الجزئية الشائعة ─────────
const AR_HONORIFIC_WORDS = new Set(['الاستاذ', 'الاستاذه', 'استاذ', 'استاذه', 'المحامي', 'المحاميه', 'الدكتور', 'الدكتوره', 'المستشار', 'المستشاره', 'الاستاذين']);
const AR_HONORIFIC_ABBR = new Set(['ا', 'د', 'م']);
const LA_HONORIFIC_WORDS = new Set(['mr', 'mrs', 'ms', 'dr', 'counsel', 'attorney', 'atty']);
const LA_PARTICLES = new Set(['el', 'al']);
/** كلمات النص بمواضعها: { n: الكلمة موحَّدة، s، e } */
function tokensOf(raw) {
  const out = [];
  for (const m of raw.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
    const n = normalizeArabic(m[0]).replace(/\p{M}/gu, '');
    if (n) out.push({ n, s: m.index, e: m.index + m[0].length });
  }
  return out;
}
/** نسخة تُدمج فيها أداة التعريف اللاتينية بما بعدها («el naggar» ← «elnaggar») */
function mergeParticles(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (LA_PARTICLES.has(t.n) && tokens[i + 1] && /^[a-z]/.test(tokens[i + 1].n)) {
      out.push({ n: t.n + tokens[i + 1].n, s: t.s, e: tokens[i + 1].e });
      i += 1;
    } else out.push(t);
  }
  return out;
}
const latinParts = (name) => String(name ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** هل تبدأ الكلمة بالكلمة المطلوبة مع حرف عطف/جر ملتصق في العربية («وطارق»، «لطارق»)؟ */
const tokEq = (tok, want, { clitic = false } = {}) => tok === want || (clitic && /^[وفبل]/.test(tok) && tok.slice(1) === want);

/**
 * كل ذكر لمحامٍ في النص: [{ name: الاسم العربي للعرض، matched: النص كما ورد }]. يلتقط:
 * الاسم العربي (كاملًا/الأول مع الأخير/الأول مع الثاني، ومع اسم أو اسمين بين الأول والأخير «طارق محمد النجار»)،
 * واللقب مع الاسم الأول («الأستاذ طارق»، «أ. طارق»، «المحامي عمرو»)، واسم المستخدم، والاسم اللاتيني
 * (كاملًا أو الأول مع الأخير أو الحرف الأول مع اسم العائلة «T. El-Naggar»، ومع لقب «Mr Tarek»).
 */
export function findLawyerHits(text, lawyers) {
  const raw = String(text ?? '');
  if (!raw.trim() || !lawyers?.length) return [];
  const toks = tokensOf(raw);
  const merged = mergeParticles(toks);
  const span = (a, b) => raw.slice(a.s, b.e).replace(/\s+/g, ' ').trim();
  const hits = [];
  const seen = new Set();
  const push = (l, matched) => {
    const k = `${l.name}|${matched}`;
    if (seen.has(k)) return;
    seen.add(k);
    hits.push({ name: l.name, matched });
  };
  /** تسلسل أول ثم 0..gap كلمات ثم أخير — يعيد [بداية، نهاية] أو null */
  const seq = (stream, first, last, { gap = 2, clitic = false } = {}) => {
    const found = [];
    for (let i = 0; i + first.length <= stream.length; i++) {
      if (!first.every((w, k) => tokEq(stream[i + k].n, w, { clitic: clitic && k === 0 }))) continue;
      const after = i + first.length;
      if (!last.length) {
        found.push([stream[i], stream[after - 1], i]);
        continue;
      }
      for (let g = 0; g <= gap; g++) {
        const j = after + g;
        if (j + last.length > stream.length) break;
        if (last.every((w, k) => stream[j + k].n === w)) {
          found.push([stream[i], stream[j + last.length - 1], i]);
          break;
        }
      }
    }
    return found;
  };
  for (const l of lawyers) {
    // العربي
    const parts = normalizeForNames(l.name).split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0] === 'عبد' && parts.length >= 3 ? parts.slice(0, 2) : parts.slice(0, 1);
      const rest = parts.slice(first.length);
      if (rest.length) {
        // (اسم أو اسمان بين الأول والأخير فقط حين يكون الأخير اسمًا طويلًا: «علي» قد تكون «على» بعد التوحيد)
        const lastAr = rest.slice(-1);
        for (const [a, b] of seq(toks, first, lastAr, { clitic: true, gap: lastAr[0].length >= 4 ? 2 : 0 })) push(l, span(a, b));
        // الأول مع الثاني متجاورين («طارق محمد»)
        if (rest.length >= 2) for (const [a, b] of seq(toks, [...first, rest[0]], [], { clitic: true })) push(l, span(a, b));
      }
      // لقب + الاسم الأول
      for (const [a, b, i] of seq(toks, first, [], { clitic: false })) {
        const prev = toks[i - 1];
        if (!prev) continue;
        const abbr = AR_HONORIFIC_ABBR.has(prev.n) && raw[prev.e] === '.';
        if (AR_HONORIFIC_WORDS.has(prev.n) || abbr) push(l, span(prev, b));
      }
    }
    // اسم المستخدم
    const u = String(l.username || '').toLowerCase();
    if (u.length >= 3) for (const t of toks) if (t.n === u) push(l, span(t, t));
    // اللاتيني
    const lp = latinParts(l.name_latin);
    if (lp.length >= 2) {
      const lpMerged = mergeParticles(lp.map((n) => ({ n, s: 0, e: 0 }))).map((x) => x.n);
      for (const [stream, p] of [[toks, lp], [merged, lpMerged]]) {
        if (p.length < 2) continue;
        const lastWord = p[p.length - 1];
        for (const [a, b] of seq(stream, [p[0]], [lastWord])) push(l, span(a, b));
        // الحرف الأول مع اسم العائلة («T. El-Naggar»)
        for (const [a, b] of seq(stream, [p[0][0]], [lastWord], { gap: 1 })) push(l, span(a, b));
        // لقب + الاسم الأول («Mr Tarek»)
        for (const [a, b, i] of seq(stream, [p[0]], [])) if (stream[i - 1] && LA_HONORIFIC_WORDS.has(stream[i - 1].n)) push(l, span(stream[i - 1], b));
      }
    }
  }
  // لكل محامٍ: الأطول أولًا (يُعرض «Tarek El-Naggar» لا «Tarek» وحدها)
  const order = new Map(lawyers.map((l, i) => [l.name, i]));
  return hits.map((x, i) => ({ x, i })).sort((a, b) => order.get(a.x.name) - order.get(b.x.name) || b.x.matched.length - a.x.matched.length || a.i - b.i).map((y) => y.x);
}

/**
 * هل يذكر النص أحد المحامين؟ lawyers = [{ name, username, name_latin }]. يعيد أسماء المحامين المذكورين (الاسم العربي للعرض).
 * (gate K4: findLawyerHits يعيد معها النص الذي وُجد فعلًا)
 */
export function findLawyerNames(text, lawyers) {
  const out = [];
  for (const h of findLawyerHits(text, lawyers)) if (!out.includes(h.name)) out.push(h.name);
  return out;
}

/** هل يطابق اسم كاتب في بيانات ملف أحد المحامين؟ (اسم كامل أو جزء منه أو اسم المستخدم) */
export function authorMatches(author, lawyers) {
  return findLawyerNames(author, lawyers).length > 0 || lawyers.some((l) => l.username && normalizeLatin(author).trim() === String(l.username).toLowerCase());
}

// ───────────────────────── قارئ ZIP صغير (الفهرس المركزي) ─────────────────────────
/**
 * يقرأ عناصر مختارة من ملف ZIP. يعيد { entries: Map(name → string), corrupt, oversized }.
 * لا يدعم ZIP64 ولا التشفير (يُعد الملف تالفًا فيُعامل كأنه يحمل بيانات كاتب).
 */
export function readZipEntries(buf, want) {
  const out = { entries: new Map(), corrupt: false, oversized: false };
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('short');
    let eocd = -1;
    const stop = Math.max(0, buf.length - 22 - 65535);
    for (let i = buf.length - 22; i >= stop; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('no eocd');
    const count = buf.readUInt16LE(eocd + 10);
    const cdSize = buf.readUInt32LE(eocd + 12);
    const cdOffset = buf.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff || cdOffset + cdSize > buf.length) throw new Error('zip64 or bad cd');
    let p = cdOffset;
    for (let n = 0; n < count; n++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad cd entry');
      const flags = buf.readUInt16LE(p + 8);
      const method = buf.readUInt16LE(p + 10);
      const compSize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const localOffset = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (!want(name)) continue;
      if (flags & 0x1) throw new Error('encrypted');
      if (size > MAX_INFLATED) {
        out.oversized = true;
        continue;
      }
      if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad local header');
      const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(start, start + compSize);
      let text;
      if (method === 0) text = data.toString('utf8');
      else if (method === 8) text = zlib.inflateRawSync(data, { maxOutputLength: MAX_INFLATED }).toString('utf8');
      else throw new Error('method');
      out.entries.set(name, text);
    }
  } catch {
    out.corrupt = true;
  }
  return out;
}

const xmlUnescape = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** أسماء الكتّاب في ملف Office حديث: { names, hasMeta, corrupt } */
export function officeAuthors(buf) {
  const z = readZipEntries(buf, (n) =>
    n === 'docProps/core.xml' ||
    n === 'word/document.xml' ||
    n === 'word/comments.xml' ||
    n === 'word/people.xml' ||
    /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/.test(n) ||
    /^xl\/comments\d*\.xml$/.test(n) ||
    /^xl\/threadedComments\/.+\.xml$/.test(n) ||
    n === 'xl/persons/person.xml' ||
    n === 'ppt/commentAuthors.xml',
  );
  const names = new Set();
  const add = (s) => {
    const t = xmlUnescape(s).replace(/\s+/g, ' ').trim();
    if (t) names.add(t);
  };
  for (const [name, xml] of z.entries) {
    if (name === 'docProps/core.xml') {
      for (const m of xml.matchAll(/<(?:dc:creator|cp:lastModifiedBy)[^>]*>([^<]*)<\//g)) add(m[1]);
    } else if (name.startsWith('word/')) {
      for (const m of xml.matchAll(/\bw:author="([^"]*)"/g)) add(m[1]);
      for (const m of xml.matchAll(/\bw15:userId="([^"]*)"/g)) add(m[1]);
    } else if (name.startsWith('xl/')) {
      for (const m of xml.matchAll(/<author>([^<]*)<\/author>/g)) add(m[1]);
      for (const m of xml.matchAll(/\bdisplayName="([^"]*)"/g)) add(m[1]);
    } else if (name === 'ppt/commentAuthors.xml') {
      for (const m of xml.matchAll(/\bname="([^"]*)"/g)) add(m[1]);
    }
  }
  return { names: [...names], hasMeta: names.size > 0 || z.corrupt || z.oversized, corrupt: z.corrupt };
}

/** فك سلسلة PDF حرفية: الهروب (\n \( \) \\ \ddd) ثم UTF-16BE إن بدأت بعلامة BOM */
function pdfLiteral(raw) {
  const bytes = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') {
      bytes.push(c.charCodeAt(0) & 0xff);
      continue;
    }
    const nx = raw[++i];
    if (nx === undefined) break;
    const map = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
    if (map[nx] !== undefined) bytes.push(map[nx]);
    else if (/[0-7]/.test(nx)) {
      let oct = nx;
      while (oct.length < 3 && /[0-7]/.test(raw[i + 1] || '')) oct += raw[++i];
      bytes.push(parseInt(oct, 8) & 0xff);
    } else if (nx === '\r' || nx === '\n') {
      /* سطر مستمر */
    } else bytes.push(nx.charCodeAt(0) & 0xff);
  }
  return decodePdfBytes(Buffer.from(bytes));
}
function decodePdfBytes(b) {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    const s = b.subarray(2);
    const sw = Buffer.alloc(s.length - (s.length % 2));
    for (let i = 0; i + 1 < s.length; i += 2) {
      sw[i] = s[i + 1];
      sw[i + 1] = s[i];
    }
    return sw.toString('utf16le');
  }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString('utf8');
  return b.toString('latin1');
}

/** أسماء الكتّاب في PDF (أول 256 كيلوبايت وآخرها): { names, hasMeta } */
export function pdfAuthors(buf) {
  const head = buf.subarray(0, PDF_WINDOW);
  const tail = buf.length > PDF_WINDOW ? buf.subarray(Math.max(PDF_WINDOW, buf.length - PDF_WINDOW)) : Buffer.alloc(0);
  const names = new Set();
  for (const part of [head, tail]) {
    const latin = part.toString('latin1');
    for (const m of latin.matchAll(/\/Author\s*\(((?:\\[\s\S]|[^\\)])*)\)/g)) {
      const t = pdfLiteral(m[1]).replace(/\s+/g, ' ').trim();
      if (t) names.add(t);
    }
    for (const m of latin.matchAll(/\/Author\s*<([0-9A-Fa-f\s]*)>/g)) {
      const hex = m[1].replace(/\s+/g, '');
      const t = decodePdfBytes(Buffer.from(hex.length % 2 ? `${hex}0` : hex, 'hex')).replace(/\s+/g, ' ').trim();
      if (t) names.add(t);
    }
    const utf = part.toString('utf8');
    for (const m of utf.matchAll(/<dc:creator>([\s\S]*?)<\/dc:creator>/g)) {
      for (const li of m[1].matchAll(/<rdf:li[^>]*>([^<]*)<\/rdf:li>/g)) {
        const t = xmlUnescape(li[1]).trim();
        if (t) names.add(t);
      }
    }
    for (const m of utf.matchAll(/<pdf:Author>([^<]*)<\/pdf:Author>/g)) {
      const t = xmlUnescape(m[1]).trim();
      if (t) names.add(t);
    }
  }
  return { names: [...names], hasMeta: names.size > 0 };
}

// ───────── gate G7-02: الصور والملفات النصية — بيانات EXIF/XMP/PNG ونص الملف ─────────
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.tif', '.tiff']);
const TEXT_EXT = new Set(['.txt', '.csv', '.md', '.rtf', '.json', '.xml', '.html', '.htm']);
/** 'image' | 'text' | null — ملفات تُفحص نصوصها بحثًا عن أسماء المحامين (ليست Office ولا PDF) */
export function scanKind(doc) {
  const ext = path.extname(String(doc?.filename || '')).toLowerCase();
  const mime = String(doc?.mime || '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (mime.startsWith('text/') || TEXT_EXT.has(ext) || mime === 'application/json' || mime === 'application/rtf') return 'text';
  return null;
}
/**
 * نصوص قابلة للقراءة داخل ملف ثنائي (مثل strings): ASCII/Latin-1 وUTF-16LE (XPAuthor في EXIF) وUTF-8 (XMP وiTXt)،
 * من أول 256 كيلوبايت وآخرها (حيث تقع بيانات EXIF/XMP/tEXt).
 */
export function textRuns(buf) {
  if (!Buffer.isBuffer(buf) || !buf.length) return '';
  const parts = [buf.subarray(0, PDF_WINDOW)];
  if (buf.length > PDF_WINDOW) parts.push(buf.subarray(Math.max(PDF_WINDOW, buf.length - PDF_WINDOW)));
  const out = [];
  for (const part of parts) {
    for (const m of part.toString('latin1').matchAll(/[\x20-\x7e]{4,}/g)) out.push(m[0]);
    for (const off of [0, 1]) {
      const u16 = part.subarray(off, part.length - ((part.length - off) % 2)).toString('utf16le');
      for (const m of u16.matchAll(/[\x20-\x7e\u0600-\u06ff]{4,}/g)) out.push(m[0]);
    }
    for (const m of part.toString('utf8').matchAll(/[\x20-\x7e\u0600-\u06ff]*[\u0600-\u06ff][\x20-\x7e\u0600-\u06ff]*/g)) if (m[0].trim().length >= 4) out.push(m[0]);
  }
  return out.join('\n');
}

/** نوع الملف للفحص: 'docx'|'xlsx'|'pptx'|'pdf'|'office_legacy'|null */
export function docKind(doc) {
  const ext = path.extname(String(doc?.filename || '')).toLowerCase();
  if (doc?.mime === PDF_MIME || ext === '.pdf') return 'pdf';
  if (ZIP_MIMES.has(doc?.mime) || ['.docx', '.xlsx', '.pptx'].includes(ext)) return ext === '.xlsx' || /sheet/.test(doc.mime || '') ? 'xlsx' : ext === '.pptx' || /presentation/.test(doc.mime || '') ? 'pptx' : 'docx';
  if (OLE_MIMES.has(doc?.mime) || ['.doc', '.xls', '.ppt'].includes(ext)) return 'office_legacy';
  return null;
}

export function createCompanyDocGate(app) {
  const { db, config } = app;

  /** محامو الملف: كل من أُسند إليه يومًا (بما في ذلك المسحوب إسنادهم) */
  function caseLawyers(caseId) {
    if (!caseId) return [];
    return db.all(
      `SELECT DISTINCT u.id, u.name, u.username, l.name_latin FROM assignments a JOIN users u ON u.id = a.lawyer_id
       LEFT JOIN lawyers l ON l.user_id = u.id WHERE a.case_id = ?`,
      caseId,
    );
  }

  function readDocBuffer(doc) {
    const abs = path.join(config.uploadsDir, doc.storage_key || '');
    if (!abs.startsWith(config.uploadsDir + path.sep)) return null;
    try {
      return fs.readFileSync(abs);
    } catch {
      return null;
    }
  }

  /**
   * gate G7-02: أسماء المحامين في صورة (EXIF Artist/XPAuthor، XMP، PNG tEXt/iTXt) أو في نص ملف نصي — [matched…].
   * في الصور لا يُعتد باسم المستخدم القصير وحده (أقل من 5 أحرف) حتى لا تطابقه بيانات ثنائية عشوائية.
   */
  function scanNames(doc, lawyers) {
    const kind = scanKind(doc);
    if (!kind || !lawyers.length) return [];
    const buf = readDocBuffer(doc);
    if (!buf) return [];
    const text = kind === 'text' ? buf.subarray(0, 1024 * 1024).toString('utf8') : textRuns(buf);
    const shortUser = new Set(lawyers.map((l) => String(l.username || '').toLowerCase()).filter((u) => u && u.length < 5));
    return [...new Set(findLawyerHits(text, lawyers).filter((h) => kind === 'text' || !shortUser.has(String(h.matched).toLowerCase())).map((h) => h.matched))];
  }

  /** محامو كل ملفات الشركة (لملفات الذاكرة التي لا ترتبط بملف بعينه) */
  function companyLawyers(companyId) {
    return db.all(
      `SELECT DISTINCT u.id, u.name, u.username, l.name_latin FROM assignments a JOIN cases c ON c.id = a.case_id JOIN users u ON u.id = a.lawyer_id
       LEFT JOIN lawyers l ON l.user_id = u.id WHERE c.company_id = ?`,
      companyId,
    );
  }

  /**
   * gate G7-02: بوابة ملفات الفريق التي تصل الشركة خارج التسليمات والرسائل (ذاكرة الشركة): اسم محامٍ في عنوان الملف أو
   * اسمه أو بياناته (Office/PDF/صور/نص) ← 409 كالتسليم. لا تُطلب مراجعة الخصائص هنا (ملفات الذاكرة مستندات الشركة نفسها).
   */
  function companyFilesGate({ companyId, documentIds = [] } = {}) {
    const lawyers = companyLawyers(companyId);
    const out = { lawyer_names: [], file_authors: [], office_docs: [], foreign_docs: [] };
    if (!lawyers.length) return out;
    for (const id of [...new Set((documentIds || []).map(Number))]) {
      const d = db.get('SELECT * FROM documents WHERE id = ?', id);
      if (!d) continue;
      for (const x of findLawyerHits(`${d.title || ''}\n${d.filename || ''}`, lawyers)) out.lawyer_names.push({ field: `document:${d.id}`, name: x.name, matched: x.matched });
      const meta = documentAuthors(d);
      const hit = meta ? meta.names.filter((n) => authorMatches(n, lawyers)) : scanNames(d, lawyers);
      if (hit.length) out.file_authors.push({ document_id: d.id, filename: d.filename, names: hit, source: meta ? (meta.kind === 'office_legacy' ? 'doc' : meta.kind) : scanKind(d) });
    }
    return out;
  }

  /** بيانات الكاتب لمستند محفوظ: { kind, names, hasMeta } أو null لغير ملفات Office/PDF */
  function documentAuthors(doc) {
    const kind = docKind(doc);
    if (!kind) return null;
    if (kind === 'office_legacy') return { kind, names: [], hasMeta: true };
    const buf = readDocBuffer(doc);
    if (!buf) return { kind, names: [], hasMeta: true };
    if (kind === 'pdf') return { kind, ...pdfAuthors(buf) };
    const r = officeAuthors(buf);
    return { kind, names: r.names, hasMeta: r.hasMeta };
  }

  /**
   * البوابة (L-56): companyDocGate({ requestId, caseId?, texts:{field: string}, documentIds }) →
   * { lawyer_names:[{field, name}], file_authors:[{document_id, names, source}], office_docs:[{id, filename, has_author_meta}], foreign_docs:[id] }
   */
  function companyDocGate({ requestId, caseId = undefined, texts = {}, documentIds = [] } = {}) {
    const req = requestId ? db.get('SELECT id, case_id FROM company_requests WHERE id = ?', requestId) : null;
    const cid = caseId !== undefined ? caseId : req?.case_id ?? null;
    const lawyers = caseLawyers(cid);
    const out = { lawyer_names: [], file_authors: [], office_docs: [], foreign_docs: [] };
    const seen = new Set();
    // gate K4: { field, name, matched } — matched هو النص كما ورد (قد يكون لاتينيًا أو اسم المستخدم)
    const pushName = (field, name, matched = name) => {
      const k = `${field}|${name}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.lawyer_names.push({ field, name, matched });
    };
    for (const [field, value] of Object.entries(texts || {})) {
      const text = Array.isArray(value) ? value.join('\n') : value;
      for (const x of findLawyerHits(text, lawyers)) pushName(field, x.name, x.matched);
    }
    for (const id of [...new Set((documentIds || []).map(Number))]) {
      const d = db.get('SELECT * FROM documents WHERE id = ?', id);
      const belongs = d && ((cid && d.case_id === cid) || (requestId && d.company_request_id === requestId));
      if (!belongs) {
        out.foreign_docs.push(id);
        continue;
      }
      for (const x of findLawyerHits(`${d.title || ''}\n${d.filename || ''}`, lawyers)) pushName(`document:${d.id}`, x.name, x.matched);
      const meta = documentAuthors(d);
      if (!meta) {
        // gate G7-02: صورة أو ملف نصي — تُفحص بياناتها ونصها
        const hit = scanNames(d, lawyers);
        if (hit.length) out.file_authors.push({ document_id: d.id, filename: d.filename, names: hit, source: scanKind(d) });
        continue;
      }
      out.office_docs.push({ id: d.id, filename: d.filename, has_author_meta: !!meta.hasMeta });
      const hit = meta.names.filter((n) => authorMatches(n, lawyers));
      if (hit.length) out.file_authors.push({ document_id: d.id, filename: d.filename, names: hit, source: meta.kind === 'office_legacy' ? 'doc' : meta.kind });
    }
    return out;
  }

  /** هل تمر البوابة؟ يعيد خطأ 409 المناسب أو null. allowNames: تجاوز الأسماء في النصوص فقط (مدير النظام) */
  function gateError(result, { docsReviewed = false, allowNames = false } = {}) {
    if (result.foreign_docs.length) return { status: 400, code: 'foreign_documents', message: 'بعض المرفقات لا تخص هذا الطلب أو ملفه.' };
    if (result.file_authors.length) {
      const f = result.file_authors[0];
      return { status: 409, code: 'file_author_names', message: `الملف ${f.filename} يحمل اسم ${f.names[0]} في بياناته — احفظه من جديد بلا اسم الكاتب ثم ارفعه.` };
    }
    if (result.lawyer_names.length && !allowNames) return { status: 409, code: 'lawyer_names', message: `النص يذكر اسم ${nameShown(result.lawyer_names[0])}. فريقكم القانوني هو صاحب التسليم أمام الشركة؛ احذف أسماء المحامين.` };
    if (result.office_docs.length && !docsReviewed) return { status: 409, code: 'office_docs_review_required', message: 'ملفات Word وExcel وPDF قد تحمل اسم كاتبها في خصائصها؛ راجِع الملفات وأكّد خلوّها من أسماء المحامين.' };
    return null;
  }

  return { companyDocGate, companyFilesGate, gateError, caseLawyers, companyLawyers, documentAuthors, scanNames, findLawyerNames, findLawyerHits, nameShown };
}
