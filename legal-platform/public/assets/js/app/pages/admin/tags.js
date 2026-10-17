// v12 tags (TG-5، T12-62…T12-64): صفحة «رموز العناصر» للإدارة ومدير الحالة، للقراءة فقط.
// تجلب السجل كله مرة واحدة من GET /api/admin/tags (طلب واحد = سطر واحد في سجل الأمان) ثم تبحث وتصفّي في المتصفح:
// رمز كامل أولًا (S-14، s14، S-١٤)، ثم جزء رمز، ثم كلمات من النص أو اسم الشاشة. رسائل واتساب والبريد (W/E) تُفتح على
// نص كل صيغة كاملًا بقيم مثال. لا تعديل هنا (T12-64): النصوص تُعدَّل في مكانها أو في الكود.
// مسارات الملفات وأرقام الأسطر يرسلها الخادم لمدير النظام وحده.
import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { count } from '../../../lib/fmt.js';
import { pageHeader, searchInput, copyButton, codeTag, emptyState, errorState, loading } from '../../../lib/ui.js';
import { normalizeCode, partialCode, compareCodes, foldAr } from '../../../lib/tags-pages.js';
import { tagsToggle } from '../../../lib/tags-boot.js';

const LS_KEY = 'bm_tags';
const SURFACE_ORDER = ['', 'site', 'request', 'company', 'app', 'msg'];
const CODES = ['رمز واحد', 'رمزان', 'رموز', 'رمزًا'];
const FORMS = ['صيغة واحدة', 'صيغتان', 'صيغ', 'صيغة'];
/** من أين تخرج الرسالة (T12-63 «سيُرسل من…») حسب نوعها في السجل */
const SENT_FROM = {
  'رسالة واتساب': 'سيُرسل من رقم واتساب المكتب إلى صاحب الطلب.',
  'رسالة واتساب للمحامي': 'سيُرسل من رقم واتساب المكتب إلى المحامي.',
  بريد: 'سيُرسل من بريد المنصة.',
};

// تنسيق الصفحة: عنصر <style> واحد (CSP style-src يسمح به كما في الطبقة نفسها، T12-34)
const CSS = `
.tgs-page{display:flex;flex-direction:column;gap:16px;min-width:0}
.tgs-tools{display:flex;flex-direction:column;gap:12px;position:sticky;top:0;z-index:2;background:var(--bg,var(--surface));padding-block:8px}
.tgs-tools .search-input{max-width:520px}
.tgs-tools .search-input .input{min-height:48px}
.tgs-seg{flex-wrap:nowrap;max-width:100%;overflow-x:auto}
.tgs-seg>.seg{flex:0 0 auto;min-height:44px}
.tgs-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;max-width:520px;cursor:pointer}
.tgs-switch span{font-weight:600}
.tgs-status{margin:0;color:var(--text-muted);font-size:14px}
.tgs-group{display:flex;flex-direction:column;border:0;border-top:1px solid var(--ink,currentColor);border-radius:2px;background:none;overflow:hidden;content-visibility:auto;contain-intrinsic-size:auto 400px}
.tgs-group-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;padding:12px 0;border-bottom:1px solid var(--rule,var(--border));background:none}
.tgs-group-head h2{margin:0;font-size:16px}
.tgs-group-head .muted{font-size:13px}
.tgs-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;padding:10px 0;border-top:1px solid var(--rule,var(--border))}
.tgs-row:first-of-type{border-top:0}
.tgs-row>.btn{grid-row:span 3;align-self:start;min-height:44px;min-width:92px;justify-content:flex-start;padding-inline:0;border:0;border-radius:0;background:none;box-shadow:none;color:var(--ink,inherit);direction:ltr;unicode-bidi:isolate;font-family:var(--font-mono,ui-monospace,monospace);font-weight:700;text-decoration:underline;text-decoration-color:var(--rule-2,currentColor);text-underline-offset:.3em}
.tgs-kind{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;color:var(--text-muted)}
.tgs-text{margin:0;overflow-wrap:anywhere;white-space:pre-line}
.tgs-note{margin:0;font-size:13px;color:var(--text-muted);overflow-wrap:anywhere}
.tgs-src{direction:ltr;unicode-bidi:isolate;text-align:start;font-family:var(--font-mono,ui-monospace,monospace);font-size:12px}
.tgs-forms{grid-column:2}
.tgs-forms>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:6px;font-weight:600;color:var(--primary-700)}
.tgs-form{margin:0 0 8px;padding:10px 12px;border-radius:10px;background:var(--gray-50,var(--surface));border:1px solid var(--border)}
.tgs-form b{display:block;font-size:13px;margin-bottom:4px}
.tgs-form p{margin:0;white-space:pre-line;overflow-wrap:anywhere}
@media (max-width:600px){.tgs-row{grid-template-columns:minmax(0,1fr)}.tgs-row>.btn{grid-row:auto;justify-self:start}.tgs-forms{grid-column:1}}
`;

function ensureStyle() {
  if (document.getElementById('tgs-style')) return;
  document.head.append(h('style#tgs-style', CSS));
}

/** هل التفضيل محفوظ على هذا الجهاز (المفتاح يكتبه مفتاح الحساب وحده، L12-43) */
function onThisDevice() {
  try {
    return localStorage.getItem(LS_KEY) === '1';
  } catch {
    return false;
  }
}

/** ترتيب البحث نفسه في الخادم (src/routes/tags.js): رمز كامل ← جزء رمز ← كلمات */
export function searchItems(items, q) {
  const raw = String(q || '').trim().slice(0, 80);
  if (!raw) return items;
  const exact = normalizeCode(raw);
  const part = partialCode(raw);
  // كلمات عربية بلا همزات أو تشكيل تكفي: «تاسيس شركات» تجد «تأسيس شركات» (foldAr، review)
  const words = foldAr(raw).split(/\s+/).filter(Boolean);
  // جزء الرقم: «E-0» ← E-01…E-09، و«s1» ← S-01 وS-1x وS-1xx
  const partOf = (code) => {
    const d = code.split('-')[1];
    return !part.digits || d.startsWith(part.digits) || (Number(part.digits) > 0 && String(Number(d)).startsWith(String(Number(part.digits))));
  };
  const score = (it) => {
    if (exact && it.code === exact) return 3;
    if (part && it.prefix === part.prefix && partOf(it.code)) return 2;
    if (part && !part.digits && it.prefix.startsWith(part.prefix)) return 1;
    const hay = foldAr(`${it.text} ${it.screen} ${(it.variants || []).map((v) => v.text).join(' ')}`);
    return words.every((w) => hay.includes(w)) ? 1 : 0;
  };
  return items
    .map((it) => [score(it), it])
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || compareCodes(a[1].code, b[1].code))
    .map(([, it]) => it);
}

function row(it, admin) {
  const sent = SENT_FROM[it.kind];
  const forms = it.variants?.length ? it.variants : null;
  return h(
    'div.tgs-row',
    { id: `tgs-${it.code}`, tag: 'TGS-08' },
    copyButton(it.code, it.code, { size: 'sm', variant: 'secondary', tag: 'TGS-09' }),
    h('div.tgs-kind', h('span', it.kind)),
    h('p.tgs-text', it.text || '—'),
    h(
      'div',
      sent && h('p.tgs-note', sent),
      it.setting && h('p.tgs-note', `يُعدَّل من الإعدادات ← ${it.setting}`),
      it.shared?.length && h('p.tgs-note', 'يظهر النص نفسه أيضًا في: ', h('span.tgs-src', it.shared.join('، '))),
      admin && it.file && h('p.tgs-note.tgs-src', `${it.file}${it.line ? `:${it.line}` : ''}`),
    ),
    forms &&
      h(
        'details.tgs-forms',
        { tag: 'TGS-10' },
        h('summary', { tag: 'TGS-13' }, `النص كاملًا (${count(forms.length, FORMS)})`),
        forms.map((v) => h('div.tgs-form', { tag: 'TGS-11' }, v.label && h('b', v.label), h('p', v.text))),
      ),
  );
}

export default async function render() {
  ensureStyle();
  const page = h('div.tgs-page');
  let data = null;
  let q = '';
  let surface = '';
  const admin = () => data?.items?.some((it) => it.file);

  const listBox = h('div.tgs-list');
  const status = h('p.tgs-status', { role: 'status', 'aria-live': 'polite', tag: 'TGS-06' });
  const segs = h('div.segmented.tgs-seg', { role: 'group', 'aria-label': 'السطح', tag: 'TGS-03' });

  const sw = h('input.lh-switch#tgs-device', { type: 'checkbox', role: 'switch', checked: onThisDevice(), tag: 'TGS-14' });
  sw.addEventListener('change', () => tagsToggle(sw.checked, true));
  // يتبع المفتاح الطبقة إن شُغّلت أو أُخفيت من مكان آخر، في هذا التبويب (bm:tags) أو في تبويب آخر (storage، review)؛
  // ويزيل مستمعيه بعد مغادرة الصفحة
  const onTags = (e) => {
    if (!sw.isConnected) {
      removeEventListener('bm:tags', onTags);
      removeEventListener('storage', onTags);
    } else if (!e || e.type !== 'storage' || e.key === LS_KEY || e.key === null) sw.checked = onThisDevice();
  };
  addEventListener('bm:tags', onTags);
  addEventListener('storage', onTags);

  function draw() {
    if (!data) return;
    const pool = surface ? data.items.filter((it) => it.surface === surface) : data.items;
    const found = searchItems(pool, q);
    // «لا نتائج من 5,320 رمزًا» بدل «0 رمز من …» (review)
    status.textContent = q || surface ? `${found.length ? count(found.length, CODES) : 'لا نتائج'} من ${count(data.total, CODES)}` : count(data.total, CODES);
    if (!found.length) {
      mount(listBox, emptyState(q ? `لا يوجد رمز أو نص يطابق «${q}»` : 'لا رموز في هذا القسم', null, { compact: true, icon: 'search', tag: 'TGS-12' }));
      return;
    }
    const names = Object.fromEntries((data.prefixes || []).map((p) => [p.prefix, p]));
    const groups = [];
    for (const it of found) {
      const last = groups[groups.length - 1];
      if (last && last.prefix === it.prefix) last.items.push(it);
      else groups.push({ prefix: it.prefix, items: [it] });
    }
    const isAdmin = admin();
    mount(
      listBox,
      groups.map((g) =>
        h(
          'section.tgs-group',
          { 'aria-label': names[g.prefix]?.name || g.prefix, tag: 'TGS-07' },
          h('div.tgs-group-head', h('h2', { tag: 'TGS-15' }, names[g.prefix]?.name || g.items[0].screen), codeTag(`${g.prefix}-`), h('span.muted', count(g.items.length, CODES))),
          g.items.map((it) => row(it, isAdmin)),
        ),
      ),
    );
  }

  function drawSegs() {
    mount(
      segs,
      SURFACE_ORDER.map((key) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(surface === key),
            onClick: () => {
              surface = key;
              drawSegs();
              draw();
            },
            tag: 'TGS-04',
          },
          key ? data?.surfaces?.[key] || key : 'الكل',
        ),
      ),
    );
  }

  mount(
    page,
    pageHeader({
      title: 'رموز العناصر',
      subtitle: 'ابحث برمز العنصر أو بكلمة من نصه، ثم انسخ الرمز واذكره في طلب التعديل. القائمة للعرض فقط.',
      tag: 'TGS-01',
      titleTag: 'TGS-16',
    }),
    h(
      'div.tgs-tools',
      searchInput({
        placeholder: 'رمز مثل S-14 أو كلمة من النص',
        label: 'ابحث في الرموز',
        delay: 150,
        tag: 'TGS-02',
        onSearch: (v) => {
          q = v;
          draw();
        },
      }),
      segs,
      h('label.tgs-switch', { for: 'tgs-device', tag: 'TGS-05' }, h('span', 'إظهار رموز العناصر على هذا الجهاز'), sw),
      status,
    ),
    listBox,
  );
  drawSegs();

  async function load() {
    mount(listBox, loading('جارٍ تحميل الرموز…'));
    try {
      data = await api.get('/admin/tags');
      drawSegs();
      draw();
    } catch (err) {
      mount(listBox, errorState(err, load));
    }
  }
  load();
  return page;
}
