// v12 entry (§5.2، L12-27، L12-76، L12-80): مسار الطلب (service_line / pathway) — الكاتب الوحيد لأعمدة schema 87.
// الموقع يكتب بعد engine.receive (onlyIfEmpty، داخل try/catch: فشل المسار لا يُفشل الطلب أبدًا)، وقائمة واتساب
// ورسالته الجاهزة والفريق يكتبون من مساراتهم. المسارات للأفراد والشركات فقط: طلب «خيري» (أو بلا نوع) لا يُكتب له
// مسار إلا بيد الفريق. classify هو المحلل الوحيد لروابط /start و?path= (كل Location = canonical + معاملات الحملة).
// countView عدادات زيارات الصفحة الأولى في الذاكرة، تُكتب كل 60 ثانية وعند الإغلاق (لا كتابة SQLite لكل زيارة).
import {
  TREE_VERSION,
  PATHWAY_SOURCES,
  RETIRED,
  resolvePath,
  allPages,
  trail,
} from '../../public/assets/js/public/entry-tree.js';
import { isSpeculative } from '../site.js';
import { nowIso, addDays, cairoDayKey, parseJson, truncate } from '../util.js';

export const PATHWAY_LINES = ['consultation', 'litigation', 'company'];
export const PATHWAY_SOURCE_KEYS = Object.keys(PATHWAY_SOURCES);
/** النص حين لا يوجد مسار (L12-81) */
export const NO_PATHWAY_LABEL = 'لم يُحدَّد النوع';
const OPEN_STATUSES = "('new','in_review','awaiting_client')";
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|headless/i;
const FLUSH_MS = 60 * 1000;
const KEEP_DAYS = 730;

export function createPathways(app) {
  const { db } = app;

  // ───────────── السياق والتحليل ─────────────

  /** سياق الشجرة من الإعدادات (L12-63): خدمة الشركات مفعّلة؟ بوابة الشركات مفتوحة؟ */
  function treeCtx() {
    const b2b = app.settings.get('b2b_enabled') !== false;
    let portal = b2b;
    if (b2b) {
      try {
        portal = app.site?.companyPortalOpen ? !!app.site.companyPortalOpen() : true;
      } catch {
        portal = true;
      }
    }
    return { b2b, portal };
  }

  function canonicalOf(r) {
    if (r.exit) return r.node.to.href;
    if (r.leaf) return `/intake?path=${r.path}`;
    return `/start/${r.path}`;
  }

  /**
   * المحلل الوحيد (L12-76). raw = مسار رابط يبدأ بـ /start (serveTree) أو '/'، أو قيمة ?path= المجردة (serveIntake).
   * ← { kind: 'page'|'leaf'|'exit'|'retired'|'ancestor'|'root', canonical, path }
   *   page: صفحة اختيار (canonical '/start/…' أو '/')، leaf: ورقة طلب ('/intake?path=…')، exit: مخرج ('/company')،
   *   retired: معرّف أُحيل في RETIRED (canonical = الهدف)، ancestor: مسار غير صالح ← أعمق صفحة/ورقة صالحة قبله أو '/'،
   *   root: '/start' أو '/start/' أو مسار فارغ ← '/'. canonical ثابت داخلي دائمًا (لا يبدأ بـ // ولا /\).
   */
  function classify(raw, ctx = treeCtx()) {
    let s = typeof raw === 'string' ? raw : '';
    if (s === '/') return { kind: 'page', canonical: '/', path: '' };
    if (s === '/start' || s === '/start/') return { kind: 'root', canonical: '/', path: '' };
    if (s.startsWith('/start/')) s = s.slice(7);
    if (s.endsWith('/')) s = s.slice(0, -1); // شرطة أخيرة واحدة: نفس الصفحة (301 من serveTree)
    if (!s) return { kind: 'root', canonical: '/', path: '' };
    const segs = s.split('/').slice(0, 8);
    const full = segs.join('/');
    const r = segs.length <= 3 ? resolvePath(full, ctx) : null;
    if (r) {
      // صفحة تُتخطى في هذا السياق (بوابة الشركات مغلقة) تُحل إلى هدفها: نوعها نوع الهدف؛ وRETIRED = 'retired'
      const kind = isRetired(full) ? 'retired' : r.exit ? 'exit' : r.leaf ? 'leaf' : 'page';
      return { kind, canonical: canonicalOf(r), path: r.path };
    }
    for (let n = Math.min(segs.length, 4) - 1; n >= 1; n--) {
      const a = resolvePath(segs.slice(0, n).join('/'), ctx);
      if (a) return { kind: 'ancestor', canonical: canonicalOf(a), path: a.path };
    }
    return { kind: 'ancestor', canonical: '/', path: '' };
  }

  function isRetired(full) {
    return Object.keys(RETIRED).some((k) => full === k || full.startsWith(`${k}/`));
  }

  /** resolvePath بلا سياق (RETIRED مطبّق): للتحقق من مسار مخزّن أو مرسل */
  function resolve(raw) {
    return resolvePath(raw);
  }

  // ───────────── القراءة ─────────────

  function formOf(row) {
    const f = parseJson(row?.form_answers, null);
    return f && typeof f === 'object' && !Array.isArray(f) ? f : null;
  }

  /** كتلة المسار للفريق (E12-50) ← { path, line, labels, staff_labels, tags, source, source_label, set_at } أو null */
  function block(row) {
    if (!row || !row.pathway) return null;
    const r = resolvePath(row.pathway);
    const snap = formOf(row)?.pathway;
    const current = r && !r.exit;
    const staffLabels = current ? trail(r.path, { staff: true }) : Array.isArray(snap?.labels) ? snap.labels.map(String) : [];
    const labels = current ? trail(r.path) : staffLabels;
    const path = current ? r.path : row.pathway;
    return {
      path,
      line: row.service_line || String(row.pathway).split('/')[0] || null,
      labels,
      staff_labels: staffLabels,
      tags: current ? tagsOf(r.path) : [],
      source: row.pathway_source || null,
      source_label: PATHWAY_SOURCES[row.pathway_source] || null,
      set_at: row.pathway_set_at || null,
    };
  }

  function tagsOf(path) {
    const out = [];
    const segs = path.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const r = resolvePath(segs.slice(0, i).join('/'));
      if (r) out.push(r.node.tag);
    }
    return out;
  }

  /** حقول صف القائمة (E12-49): pathway_labels = كلمات الفريق «الخط › المجال › الموضوع» (الحالية، وإلا اللقطة) */
  function rowFields(row) {
    const b = block(row);
    return { service_line: row?.service_line ?? null, pathway: row?.pathway ?? null, pathway_labels: b ? b.staff_labels : null };
  }

  /** سطر سياق الذكاء الاصطناعي (E12-54، L12-28): لطلبات الأفراد والشركات ذات المسار فقط (هاش «خيري» لا يتغير) */
  function storyLine(row) {
    if (!row || row.segment !== 'paid') return null;
    const b = block(row);
    if (!b || !b.staff_labels.length) return null;
    return `[المسار الذي اختاره: ${b.staff_labels.join(' › ')}]`;
  }

  /** شرط الخط (E12-49) ← { sql, params }؛ line ∈ consultation|litigation|company|none، وإلا null */
  function lineSql(line, alias = 'i') {
    const a = /^[a-z_][a-z0-9_]*$/i.test(alias) ? alias : 'i';
    if (line === 'none') return { sql: `${a}.service_line IS NULL`, params: [] };
    if (PATHWAY_LINES.includes(line)) return { sql: `${a}.service_line = ?`, params: [line] };
    return null;
  }

  /** أعداد الطلبات المفتوحة لكل خط تحت نفس المرشحات (قبل مرشح الخط نفسه، مثل segment_counts) */
  function lineCounts(whereSql = '1', params = []) {
    const r = db.get(
      `SELECT COALESCE(SUM(CASE WHEN i.service_line = 'consultation' THEN 1 ELSE 0 END), 0) AS consultation,
              COALESCE(SUM(CASE WHEN i.service_line = 'litigation' THEN 1 ELSE 0 END), 0) AS litigation,
              COALESCE(SUM(CASE WHEN i.service_line = 'company' THEN 1 ELSE 0 END), 0) AS company,
              COALESCE(SUM(CASE WHEN i.service_line IS NULL THEN 1 ELSE 0 END), 0) AS none
         FROM intakes i LEFT JOIN clients cl ON cl.id = i.client_id
        WHERE (${whereSql}) AND i.status IN ${OPEN_STATUSES}`,
      ...params,
    );
    return { consultation: Number(r?.consultation || 0), litigation: Number(r?.litigation || 0), company: Number(r?.company || 0), none: Number(r?.none || 0) };
  }

  // ───────────── الكتابة ─────────────

  const labelsText = (labels) => (labels && labels.length ? labels.join(' › ') : NO_PATHWAY_LABEL);

  /**
   * كتابة المسار (الكاتب الوحيد، L12-27). source ∈ website|wa_menu|wa_tag|staff.
   * ← null حين لا يُكتب شيء (مسار غير صالح أو مخرج، طلب ليس «أفراد وشركات» لغير الفريق، onlyIfEmpty والمسار موجود،
   *   أو قيمة الفريق تمنع الكتابة الآلية)، وإلا { changed, from, to, line, path, block }.
   * path = null يمسح المسار (للفريق فقط). website يحفظ لقطة form_answers.pathway = { v, path, labels } (كلمات الفريق).
   * سجل: 'intake.pathway_set' (الموقع وواتساب) أو 'intake.pathway_changed' + سجل الأمان (الفريق).
   */
  function set(intakeId, path, { source, actor = null, ctx = null, reason = null, onlyIfEmpty = false } = {}) {
    if (!PATHWAY_SOURCES[source]) throw new TypeError(`pathways.set: unknown source ${source}`);
    const intake = db.get('SELECT * FROM intakes WHERE id = ?', Number(intakeId));
    if (!intake) return null;
    const staff = source === 'staff';
    if (!staff && intake.segment !== 'paid') return null;
    let to = null;
    let line = null;
    if (path === null || path === undefined || path === '') {
      if (!staff) return null;
    } else {
      const r = resolve(String(path));
      if (!r || r.exit) return null;
      to = r.path;
      line = to.split('/')[0];
    }
    const from = intake.pathway || null;
    if (from === to && (staff || intake.pathway_source === source)) {
      return staff ? { changed: false, from, to, line, path: to, block: block(intake) } : null;
    }
    const at = nowIso();
    const guards = ['id = ?'];
    if (onlyIfEmpty) guards.push('pathway IS NULL');
    // الكتابة الآلية لا تغلب قيمة الفريق أبدًا، ولا مصدرًا آليًا آخر (قائمة واتساب لا تغيّر مسار الموقع)
    if (!staff) guards.push('(pathway_source IS NULL OR pathway_source = ?)');
    const params = [line, to, source, at, Number(intakeId)];
    if (!staff) params.push(source);
    let changed = 0;
    db.tx(() => {
      changed = db.run(`UPDATE intakes SET service_line = ?, pathway = ?, pathway_source = ?, pathway_set_at = ? WHERE ${guards.join(' AND ')}`, ...params).changes;
      if (!changed) return;
      if (source === 'website' && to) {
        const f = formOf(intake) || {};
        f.pathway = { v: TREE_VERSION, path: to, labels: trail(to, { staff: true }) };
        db.run('UPDATE intakes SET form_answers = ? WHERE id = ?', JSON.stringify(f), intake.id);
      }
      const data = { entity: 'intake', id: intake.id, code: intake.code, from, to, source, ...(reason ? { reason: truncate(String(reason), 300) } : {}) };
      if (staff) {
        const fromText = labelsText(from ? trail(from, { staff: true }) : null);
        const toText = labelsText(to ? trail(to, { staff: true }) : null);
        const why = reason ? `: ${truncate(String(reason), 300)}` : '';
        app.activity.log({ intake_id: intake.id, client_id: intake.client_id, actor, type: 'intake.pathway_changed', summary: `غيّر ${actor?.name || 'الفريق'} مسار الطلب من «${fromText}» إلى «${toText}»${why}`, data });
        app.audit?.log({ actor, ctx, type: 'intake.pathway_changed', severity: 'info', summary: `تغيير مسار الطلب ${intake.code}: «${fromText}» ← «${toText}»`, data });
      } else {
        app.activity.log({ intake_id: intake.id, client_id: intake.client_id, actor: actor || { kind: 'client' }, type: 'intake.pathway_set', summary: `اختار/ت «${labelsText(trail(to))}» ${PATHWAY_SOURCES[source]}`, data });
      }
    });
    if (!changed) return null;
    const row = db.get('SELECT * FROM intakes WHERE id = ?', intake.id);
    return { changed: true, from, to, line, path: to, block: block(row) };
  }

  // ───────────── عدادات الزيارات (E12-55، L12-80) ─────────────

  const viewKeys = new Set(['khayri', ...allPages().map((p) => p.path)]);
  const pending = new Map(); // 'YYYY-MM-DD|node' ← عدد
  let timer = null;

  /** زيارة صفحة (GET 200 فقط؛ لا HEAD ولا تحميل مسبق ولا زاحف). nodePath: '' للصفحة الأولى، 'litigation/defend'، أو 'khayri' */
  function countView(nodePath, req = null) {
    if (req) {
      if (String(req.method || 'GET').toUpperCase() !== 'GET') return false;
      if (isSpeculative(req)) return false;
      if (BOT_RE.test(String(req.headers?.['user-agent'] || ''))) return false;
    }
    const key = nodePath === null || nodePath === undefined || nodePath === '/' ? '' : String(nodePath);
    if (!viewKeys.has(key)) return false;
    const k = `${cairoDayKey(nowIso())}|${key}`;
    pending.set(k, (pending.get(k) || 0) + 1);
    if (!timer) {
      timer = setInterval(() => {
        try {
          flushViews();
        } catch (e) {
          app.log?.('entry_tree flush', e);
        }
      }, FLUSH_MS);
      timer.unref?.();
    }
    return true;
  }

  /** كتابة العدادات المعلقة في entry_tree_daily (معاملة واحدة) ← عدد الصفوف */
  function flushViews() {
    if (!pending.size) return 0;
    const rows = [...pending.entries()];
    pending.clear();
    db.tx(() => {
      for (const [k, n] of rows) {
        const i = k.indexOf('|');
        db.run(
          'INSERT INTO entry_tree_daily (day, node, views) VALUES (?, ?, ?) ON CONFLICT(day, node) DO UPDATE SET views = views + excluded.views',
          k.slice(0, i),
          k.slice(i + 1),
          n,
        );
      }
    });
    return rows.length;
  }

  /** حذف عدادات أقدم من 730 يومًا ← عدد الصفوف */
  function purgeViews() {
    const cutoff = cairoDayKey(addDays(nowIso(), -KEEP_DAYS));
    return db.run('DELETE FROM entry_tree_daily WHERE day < ?', cutoff).changes;
  }

  // الإغلاق: تُكتب العدادات قبل إغلاق قاعدة البيانات (app.close ← db.close)
  const dbClose = db.close.bind(db);
  db.close = (...args) => {
    if (timer) clearInterval(timer);
    timer = null;
    try {
      flushViews();
    } catch (e) {
      app.log?.('entry_tree flush on close', e);
    }
    return dbClose(...args);
  };

  app.jobs?.register('entry_tree.purge', {
    everyMinutes: 24 * 60,
    label: 'عدادات زيارات الصفحة الأولى: حفظ المعلق وحذف ما مضى عليه سنتان',
    run: async () => ({ flushed: flushViews(), deleted: purgeViews() }),
  });

  return {
    treeCtx,
    classify,
    resolve,
    set,
    block,
    rowFields,
    lineSql,
    lineCounts,
    countView,
    flushViews,
    storyLine,
    purgeViews,
  };
}
