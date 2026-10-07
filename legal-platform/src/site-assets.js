// رسم الملفات الثابتة بأرقام إصدار ثابتة (الإصدار 9.1 — مسار b-site، B91-11):
// كل ملف JS يُطلب برقم إصداره (?v=…) تُعاد كتابة استيراداته النسبية ('./x.js' و'../lib/y.js' وimport('./z.js'))
// إلى روابط بأرقام إصدارها، وكل ملف CSS تُعاد كتابة روابط url() المحلية فيه (الخطوط والصور) بنفس الطريقة،
// فيُخزَّن كل ملف في المتصفح سنة كاملة (immutable) ولا يُعاد التحقق منه في الزيارة التالية.
//
// رقم إصدار JS/CSS يُحسب من محتوى الملف ومحتوى كل ما يستورده (مباشرة أو بشكل غير مباشر)، فأي تعديل في
// ملف مستورَد يغيّر رقم كل من يستورده، ولا يبقى في المتصفح ملف قديم يشير إلى نسخة قديمة.
// لا تُعاد كتابة الطلبات بلا ?v (مثل منصة /app وعامل خدمتها) فيبقى سلوكها كما هو.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const GRAPH_EXT = new Set(['.js', '.mjs', '.css']);
const RECHECK_MS = 1000; // إعادة فحص تواريخ تعديل الملفات بعد ثانية على الأكثر (يكفي للتطوير ولا يكلف شيئًا في الإنتاج)

// import x from './a.js' · import './a.js' · export { y } from '../b.js' · export * from './c.js'
const STATIC_RE = /(\b(?:import|export)\b[\s\w*{},$]*?\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/[^'"\s?#]+?\.m?js)\2/g;
// import('./d.js')
const DYNAMIC_RE = /(\bimport\(\s*)(['"])(\.{1,2}\/[^'"\s?#]+?\.m?js)\2(\s*\))/g;
// url(/assets/fonts/x.woff2) · url("../img/y.svg")
const CSS_URL_RE = /(url\(\s*)(['"]?)((?:\/assets\/|\.{1,2}\/)[^'")\s?#]+\.(?:woff2|woff|png|svg|jpe?g|webp|gif|ico))\2(\s*\))/g;

const raw = new Map(); // ملف ← { key, hash, deps, dynamic, text, kind }
const closures = new Map(); // ملف ← { checkedAt, keys: Map(file → key), version, files }
const transformed = new Map(); // ملف ← { sig, body }

const statKey = (st) => `${st.size}-${Math.floor(st.mtimeMs)}`;

function statOf(file) {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

let publicRoot = null;
/** جذر المجلد العام (لحل روابط url(/assets/…) المطلقة في CSS). يضبطه serveStatic/الموقع عند أول استخدام. */
export function setPublicRoot(dir) {
  if (dir) publicRoot = path.resolve(dir);
}

function resolveRef(fromFile, spec) {
  if (spec.startsWith('/')) return publicRoot ? path.join(publicRoot, spec) : null;
  return path.resolve(path.dirname(fromFile), spec);
}

/** قراءة الملف وتحليل ما يستورده (مخزّن حسب تاريخ التعديل) */
function rawInfo(file) {
  const st = statOf(file);
  if (!st) return null;
  const key = statKey(st);
  const hit = raw.get(file);
  if (hit && hit.key === key) return hit;
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const info = { key, hash: crypto.createHash('sha256').update(buf).digest('base64url').slice(0, 16), deps: [], dynamic: [], text: null, kind: 'file' };
  if (GRAPH_EXT.has(ext)) {
    const text = buf.toString('utf8');
    info.text = text;
    info.kind = ext === '.css' ? 'css' : 'js';
    const seen = new Set();
    const add = (list, spec) => {
      const target = resolveRef(file, spec);
      if (target && !seen.has(target)) {
        seen.add(target);
        list.push(target);
      }
    };
    if (info.kind === 'js') {
      for (const m of text.matchAll(STATIC_RE)) add(info.deps, m[3]);
      for (const m of text.matchAll(DYNAMIC_RE)) add(info.dynamic, m[3]);
    } else {
      for (const m of text.matchAll(CSS_URL_RE)) add(info.deps, m[3]);
    }
  }
  raw.set(file, info);
  if (raw.size > 3000) raw.delete(raw.keys().next().value);
  return info;
}

/** كل الملفات التي يعتمد عليها الملف (الاستيراد الثابت والديناميكي وروابط CSS) */
function collect(file, out = new Map()) {
  if (out.has(file)) return out;
  const info = rawInfo(file);
  if (!info) return out;
  out.set(file, info);
  for (const d of info.deps) collect(d, out);
  for (const d of info.dynamic) collect(d, out);
  return out;
}

/**
 * رقم إصدار الملف: لـ JS/CSS من محتواه ومحتوى كل ما يعتمد عليه، ولغيرهما من محتواه فقط. null إن لم يوجد.
 */
export function graphVersion(file) {
  const ext = path.extname(file).toLowerCase();
  if (!GRAPH_EXT.has(ext)) {
    const info = rawInfo(file);
    return info ? info.hash.slice(0, 10) : null;
  }
  const now = Date.now();
  const c = closures.get(file);
  if (c && now - c.checkedAt < RECHECK_MS) return c.version;
  if (c) {
    let same = true;
    for (const [f, key] of c.keys) {
      const st = statOf(f);
      if (!st || statKey(st) !== key) {
        same = false;
        break;
      }
    }
    if (same) {
      c.checkedAt = now;
      return c.version;
    }
  }
  const all = collect(file);
  if (!all.size) {
    closures.delete(file);
    return null;
  }
  const h = crypto.createHash('sha256');
  const keys = new Map();
  for (const f of [...all.keys()].sort()) {
    const info = all.get(f);
    keys.set(f, info.key);
    h.update(`${publicRoot ? path.relative(publicRoot, f) : f}:${info.hash}\n`);
  }
  const version = h.digest('base64url').slice(0, 10);
  closures.set(file, { checkedAt: now, keys, version });
  if (closures.size > 3000) closures.delete(closures.keys().next().value);
  return version;
}

/**
 * محتوى JS/CSS بعد إضافة أرقام الإصدار لكل استيراد نسبي أو رابط url() محلي. null لغير ذلك.
 * الاستيراد لملف غير موجود يُترك كما هو.
 */
export function transformAsset(file) {
  const info = rawInfo(file);
  if (!info || !info.text) return null;
  const version = graphVersion(file);
  const hit = transformed.get(file);
  if (hit && hit.sig === `${info.key}:${version}`) return hit.body;
  const ver = (spec) => {
    const target = resolveRef(file, spec);
    const v = target ? graphVersion(target) : null;
    return v ? `${spec}?v=${v}` : spec;
  };
  let text;
  if (info.kind === 'js') {
    text = info.text
      .replace(STATIC_RE, (m, pre, q, spec) => `${pre}${q}${ver(spec)}${q}`)
      .replace(DYNAMIC_RE, (m, pre, q, spec, post) => `${pre}${q}${ver(spec)}${q}${post}`);
  } else {
    text = info.text.replace(CSS_URL_RE, (m, pre, q, spec, post) => `${pre}${q}${ver(spec)}${q}${post}`);
  }
  const body = Buffer.from(text, 'utf8');
  transformed.set(file, { sig: `${info.key}:${version}`, body });
  if (transformed.size > 1500) transformed.delete(transformed.keys().next().value);
  return body;
}

/**
 * الاستيرادات الثابتة لملف JS (مباشرة وغير مباشرة، دون الملف نفسه ودون الاستيراد الديناميكي) كمسارات عامة
 * بأرقام إصدارها: لروابط <link rel="modulepreload"> فتُنزَّل كل الوحدات معًا من أول رحلة للخادم.
 */
export function preloadClosure(file, publicDir = publicRoot) {
  const root = path.resolve(publicDir || '');
  const out = [];
  const seen = new Set([file]);
  const walk = (f) => {
    const info = rawInfo(f);
    if (!info) return;
    for (const d of info.deps) {
      if (seen.has(d)) continue;
      seen.add(d);
      walk(d);
      const v = graphVersion(d);
      const rel = path.relative(root, d);
      if (v && !rel.startsWith('..') && !path.isAbsolute(rel)) out.push(`/${rel.split(path.sep).join('/')}?v=${v}`);
    }
  };
  walk(file);
  return out;
}

export function isGraphAsset(file) {
  return GRAPH_EXT.has(path.extname(file).toLowerCase());
}
