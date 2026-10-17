// v12 tags (TG-5، T12-62…T12-64، §2.1): سجل «رموز العناصر» للقراءة فقط.
//
//   GET /api/admin/tags?q=&surface=&prefix=   S (الإدارة ومدير الحالة)؛ مسارات الملفات وأرقام الأسطر لمدير النظام وحده
//
// يُبنى السجل من المصدر نفسه (src/tags/scan.js + registry.js) عند أول طلب ويُخزَّن ما دامت تواريخ تعديل الملفات كما هي.
// كل طلب يُسجَّل في سجل الأمان (tags.registry_viewed، info، بلا بيانات شخصية). الصفحة لا تعدّل شيئًا (T12-64): تعديل
// النصوص يبقى في مكانه (الأتمتة، الردود الجاهزة، الإعدادات) أو في الكود.
// بلا جلسة ← 401، والمحامي ← 403. جلسة بوابة الشركات وحدها ← 401 مثل كل مسارات الإدارة (INV-B2؛ PW-T5).
// T12-83 يذكر 403 لجلسة الشركة، لكن ثابت العزل في test/v10-b2b-server-isolation.test.js يُبقيها 401.
import fs from 'node:fs';
import path from 'node:path';
import { requireStaff } from '../auth.js';
import { cachedScan, ROOT } from '../tags/scan.js';
import { buildRegistry, loadLedger, loadModuleData, readVersion, LEDGER_FILE, SURFACES, normalizeCode, compareCodes } from '../tags/registry.js';
import { partialCode, foldAr } from '../../public/assets/js/lib/tags-pages.js';

/** قيم مثال لملء نصوص الرسائل في الصفحة (T12-63): لا بيانات حقيقية */
const SAMPLE = {
  charity: { first_name: 'أم محمد', hello: 'أهلًا يا أم محمد', ref_no: 'طلب رقم 29' },
  paid: { first_name: 'أ. نادية', hello: 'مرحبًا أ. نادية', ref_no: 'الطلب رقم 29' },
  any: {
    ref: 'REQ-2026-00029',
    code: '482913',
    portal_link: 'https://…/p/…',
    base_url: 'https://…',
    office_hours: 'من الأحد إلى الخميس، 10 صباحًا إلى 6 مساءً',
    questions: '• ما تاريخ الحكم؟',
    title: 'صورة الحكم',
    request: 'صورة بطاقة الرقم القومي',
    amount: '1,500',
    description: 'أتعاب الاستشارة',
    date: 'الأحد 20 أكتوبر',
    time_spoken: '10 الصبح',
    event_kind: 'جلسة',
    location: 'محكمة الأسرة بمدينة نصر',
  },
};

/** يملأ {متغيرات} النص بقيم مثال حسب النبرة (الخيري بصيغة المؤنث لأغلب المستفيدات) */
export function sampleFill(text, tone, names = {}) {
  const pool = { ...SAMPLE.any, ...(tone === 'charity' ? SAMPLE.charity : SAMPLE.paid), ...names };
  return String(text || '')
    .replace(/\{ي\}/g, tone === 'charity' ? 'ي' : '')
    .replace(/\{ة\}/g, tone === 'charity' ? 'ة' : '')
    .replace(/\{([a-z_]+)\}/g, (m, k) => (pool[k] != null ? pool[k] : m));
}

const toneOf = (label) => (/خيري|محايد/.test(String(label || '')) && !/أفراد/.test(String(label || '')) ? 'charity' : 'paid');

export function createTagsRegistry(app, { root = ROOT } = {}) {
  let cache = null;
  let building = null;
  const ledgerSig = () => {
    try {
      const st = fs.statSync(path.join(root, LEDGER_FILE));
      return `${st.size}:${Math.floor(st.mtimeMs)}`;
    } catch {
      return '';
    }
  };

  /** السجل الكامل (مخزَّن حسب المسح المخزَّن وتاريخ الدفتر) */
  async function registry() {
    const scan = cachedScan(root);
    const sig = ledgerSig();
    if (cache && cache.scan === scan && cache.sig === sig) return cache;
    if (building) return building;
    building = (async () => {
      const moduleData = await loadModuleData(root);
      const reg = buildRegistry(scan, { ledger: loadLedger(root), moduleData, version: readVersion(root) });
      cache = { scan, sig, reg, texts: moduleData.texts };
      return cache;
    })().finally(() => {
      building = null;
    });
    return building;
  }

  /** بحث: رمز كامل أولًا، ثم جزء رمز (s1 ← S-1…)، ثم كلمات في النص أو اسم الشاشة */
  function search(items, q) {
    const raw = String(q || '').trim().slice(0, 80);
    if (!raw) return items;
    const exact = normalizeCode(raw);
    const part = partialCode(raw);
    // كلمات عربية بلا همزات أو تشكيل تكفي: «تاسيس» تجد «تأسيس» (foldAr، review)
    const words = foldAr(raw).split(/\s+/).filter(Boolean);
    // جزء الرقم: «E-0» ← E-01…E-09، و«s1» ← S-01 وS-1x وS-1xx (كما في صفحة الرموز)
    const partOf = (code) => {
      const d = code.split('-')[1];
      return !part.digits || d.startsWith(part.digits) || (Number(part.digits) > 0 && String(Number(d)).startsWith(String(Number(part.digits))));
    };
    const hit = (it) => {
      if (exact && it.code === exact) return 3;
      if (part && it.prefix === part.prefix && partOf(it.code)) return 2;
      if (part && !part.digits && it.prefix.startsWith(part.prefix)) return 1;
      const hay = foldAr(`${it.text} ${it.screen}`);
      return words.every((w) => hay.includes(w)) ? 1 : 0;
    };
    return items
      .map((it) => [hit(it), it])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0] || compareCodes(a[1].code, b[1].code))
      .map(([, it]) => it);
  }

  return {
    registry,
    search,
    /** GET /api/admin/tags */
    async list(query, user, ctx) {
      const { reg, texts } = await registry();
      const surface = SURFACES[query.surface] ? query.surface : '';
      const prefix = /^[A-Z]{1,3}$/.test(String(query.prefix || '')) ? String(query.prefix) : '';
      const admin = user.role === 'admin';
      let items = reg.items;
      if (surface) items = items.filter((it) => it.surface === surface);
      if (prefix) items = items.filter((it) => it.prefix === prefix);
      items = search(items, query.q);
      app.audit.log({
        actor: user,
        ctx,
        type: 'tags.registry_viewed',
        severity: 'info',
        summary: 'عرض سجل رموز العناصر',
        data: { q: String(query.q || '').slice(0, 80) || null, surface: surface || null, prefix: prefix || null, results: items.length },
      });
      const out = items.map((it) => {
        const row = { code: it.code, prefix: it.prefix, surface: it.surface, screen: it.screen, kind: it.kind, text: it.text };
        if (it.shared?.length) row.shared = it.shared.map((s) => s.code);
        if (it.setting) row.setting = it.setting;
        if (it.reserved) row.reserved = it.reserved;
        // رسائل واتساب والبريد: كل صيغة بنصها كاملًا مملوءًا بقيم مثال (T12-63)
        if (it.surface === 'msg') {
          const variants = it.key ? texts[it.key] || texts[`alert:${it.key}`] : null;
          if (variants?.length) row.variants = variants.map((v) => ({ label: v.label, text: sampleFill(v.text, toneOf(v.label), { firm_name: app.brand?.displayName?.() || '', org_name: app.brand?.displayName?.() || '' }) }));
        }
        // v12 gate fixer-server (TA-04): صيغ نص العنصر (جانبا الموقع، الشركة والفريق) في «النص كاملًا»
        if (!row.variants && it.texts?.length) row.variants = it.texts.map((v) => ({ label: v.label, text: v.text }));
        if (admin) {
          row.file = it.file;
          row.line = it.line || null;
          if (it.variants?.length) row.where = it.variants.map((v) => ({ file: v.file, line: v.line || null, label: v.label || '' }));
        }
        return row;
      });
      const counts = new Map();
      for (const it of reg.items) counts.set(it.prefix, (counts.get(it.prefix) || 0) + 1);
      return {
        version: reg.version,
        frozen: reg.frozen,
        total: reg.total,
        surfaces: SURFACES,
        prefixes: reg.prefixes.filter((p) => counts.get(p.prefix)).map((p) => ({ prefix: p.prefix, surface: p.surface, name: p.name, url: p.url, count: counts.get(p.prefix) })),
        items: out,
      };
    },
  };
}

export function registerTagsRoutes(router, app) {
  const tags = (app.tags = createTagsRegistry(app));
  router.get(
    '/api/admin/tags',
    async (ctx) => tags.list(ctx.query || {}, requireStaff(ctx), ctx),
  );
}
