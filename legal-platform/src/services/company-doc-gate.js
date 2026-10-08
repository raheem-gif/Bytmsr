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

/**
 * هل يذكر النص أحد المحامين؟ lawyers = [{ name, username, name_latin }]. يعيد أسماء المحامين المذكورين (الاسم العربي للعرض).
 */
export function findLawyerNames(text, lawyers) {
  const raw = String(text ?? '');
  if (!raw.trim() || !lawyers?.length) return [];
  const ar = normalizeForNames(raw);
  const la = normalizeLatin(raw);
  const laJoined = la.replace(/\bel\s+/g, 'el');
  const hits = [];
  for (const l of lawyers) {
    let hit = arabicNameVariants(l.name).some((v) => containsPhrase(ar, v));
    if (!hit && l.username && String(l.username).length >= 3) hit = containsPhrase(la, String(l.username).toLowerCase(), { latin: true });
    if (!hit && l.name_latin) hit = latinNameVariants(l.name_latin).some((v) => containsPhrase(la, v, { latin: true }) || containsPhrase(laJoined, v, { latin: true }));
    if (hit && !hits.includes(l.name)) hits.push(l.name);
  }
  return hits;
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
    const pushName = (field, name) => {
      const k = `${field}|${name}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.lawyer_names.push({ field, name });
    };
    for (const [field, value] of Object.entries(texts || {})) {
      const text = Array.isArray(value) ? value.join('\n') : value;
      for (const n of findLawyerNames(text, lawyers)) pushName(field, n);
    }
    for (const id of [...new Set((documentIds || []).map(Number))]) {
      const d = db.get('SELECT * FROM documents WHERE id = ?', id);
      const belongs = d && ((cid && d.case_id === cid) || (requestId && d.company_request_id === requestId));
      if (!belongs) {
        out.foreign_docs.push(id);
        continue;
      }
      for (const n of findLawyerNames(`${d.title || ''}\n${d.filename || ''}`, lawyers)) pushName(`document:${d.id}`, n);
      const meta = documentAuthors(d);
      if (!meta) continue;
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
    if (result.lawyer_names.length && !allowNames) return { status: 409, code: 'lawyer_names', message: `النص يذكر اسم ${result.lawyer_names[0].name}. فريقكم القانوني هو صاحب التسليم أمام الشركة؛ احذف أسماء المحامين.` };
    if (result.office_docs.length && !docsReviewed) return { status: 409, code: 'office_docs_review_required', message: 'ملفات Word وExcel وPDF قد تحمل اسم كاتبها في خصائصها؛ راجِع الملفات وأكّد خلوّها من أسماء المحامين.' };
    return null;
  }

  return { companyDocGate, gateError, caseLawyers, documentAuthors, findLawyerNames };
}
