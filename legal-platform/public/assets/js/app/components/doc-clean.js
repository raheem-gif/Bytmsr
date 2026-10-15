// v12 media (MD-5، M12-26، L12-59، L12-61) — أدوات الفريق داخل عارض المستند. يُحمَّل من doc-viewer.js عند فتح العارض للفريق.
//
//   cleanActions(d, { onChange }) → <div> بأزرار:
//     «نظّف المستند» (DOC-05) / «نظّفه مرة أخرى» (DOC-06): ماسح المتصفح يعمل على الصورة الأصلية المحفوظة، وورقة الأركان
//       تفتح ليتأكد الموظف، ثم POST /api/admin/documents/:id/clean (نسخة جديدة، والعرض ← النسخة المحسّنة، والأصل باقٍ).
//     «رجّع الأصل» (DOC-07) / «اعرض النسخة المحسّنة» (DOC-08): PUT /api/admin/documents/:id/display — ينقل مؤشر العرض فقط.
//     «تفاصيل النسخ» (DOC-09): سطر واحد (DOC-10) ببصمتي sha256 والمصدر والمعاملات (GET /api/admin/documents/:id/files).
//   onChange(publicView) بعد أي تغيير (يحدّث العارض والقائمة).
//     «النص» (DOC-12): لوحة النص المقروء آليًا (DOC-13، MD-10، L12-17، L12-35) — للفريق فقط: الوسم «نص مستخرج آليًا من
//       المستند، راجعه قبل الاعتماد عليه.»، نسخ، تصحيح (P1)، و«اقرأ النص الآن» / «اقرأ النص بـ Claude» (DOC-14).
//   openTextPanel(d) → اللوحة في ورقة مستقلة (من العارض ومن قائمة ⋯).
// كل إجراء يُسجَّل على الخادم (سجل الأمان + السجل الزمني). لا شيء هنا للمحامي أو للشركة.
import { h, mount } from '../../lib/h.js';
import { api, downloadUrl } from '../../lib/api.js';
import { toast, errorMessage, modal } from '../../lib/ui.js';

// ───────── لوحة النص (MD-10) ─────────
export const OCR_LABEL = 'نص مستخرج آليًا من المستند، راجعه قبل الاعتماد عليه.';
const OCR_WHY = {
  tool_missing: 'أداة القراءة غير مثبتة على الخادم.',
  off: 'قراءة النص متوقفة من «الإعدادات».',
  unsupported: 'هذا النوع من الملفات لا يُقرأ نصه.',
  low_memory: 'ذاكرة الخادم غير كافية الآن. ستُعاد المحاولة لاحقًا.',
  no_text: 'لم يُعثر على نص في المستند.',
  needs_imagemagick: 'الصورة كبيرة وتحتاج ImageMagick على الخادم.',
  timeout: 'استغرقت القراءة وقتًا أطول من المسموح.',
  crashed: 'توقفت القراءة فجأة.',
  claude_not_allowed: 'إرسال صور المستندات إلى Claude غير مسموح.',
  claude_company: 'قراءة مستندات الشركات بـ Claude غير مسموحة.',
  claude_before_disclosure: 'وصل المستند قبل إعلان القراءة بـ Claude في سياسة الخصوصية.',
  claude_budget: 'ميزانية الذكاء الاصطناعي لهذا الشهر لا تتسع.',
  claude_budget_share: 'حصة قراءة المستندات من الميزانية لا تتسع.',
  claude_ai_off: 'Claude غير مضبوط في «التكاملات».',
};
const why = (code) => OCR_WHY[code] || 'تعذرت القراءة.';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('نُسخ النص', 'success');
  } catch {
    toast('تعذر النسخ. حدّد النص وانسخه يدويًا.', 'danger');
  }
}

/** لوحة النص المقروء آليًا لمستند (للفريق فقط). → عنصر يُعاد رسمه بعد كل إجراء */
export function textPanel(d) {
  const root = h('div.ocr-panel', { tag: 'DOC-13' }, h('p.ocr-panel__label', OCR_LABEL), h('p.ocr-panel__state', { role: 'status' }, 'جارٍ التحميل…'));
  const id = encodeURIComponent(d.id);

  async function load() {
    let data;
    try {
      data = await api.get(`/admin/documents/${id}/text`);
    } catch (err) {
      mount(root, h('p.ocr-panel__label', OCR_LABEL), h('p.ocr-panel__state', { role: 'alert' }, errorMessage(err)));
      return;
    }
    draw(data);
  }

  function actions(data) {
    const row = h('div.ocr-panel__actions', { tag: 'DOC-14' });
    const ask = (label, provider) =>
      h(
        'button.btn.btn--line.btn-sm',
        {
          type: 'button',
          onClick: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            try {
              await api.post(`/admin/documents/${id}/ocr`, provider ? { provider } : {});
              toast('طُلبت قراءة النص. تظهر خلال دقائق.', 'success');
              load();
            } catch (err) {
              toast(errorMessage(err), 'danger');
              b.disabled = false;
            }
          },
          tag: 'DOC-33',
        },
        label,
      );
    const busy = data.job && (data.job.state === 'queued' || data.job.state === 'running');
    if (!busy && data.can_read) row.append(ask(data.pages.length ? 'اقرأ النص مرة أخرى' : 'اقرأ النص الآن', null));
    if (!busy && data.can_claude) row.append(ask('اقرأ النص بـ Claude', 'claude'));
    return row.childNodes.length ? row : null;
  }

  function pageBlock(p, many) {
    const pre = h('pre.ocr-panel__text', { dir: 'auto' }, p.text || 'لا يوجد نص مقروء في هذه الصفحة.');
    const head = h(
      'p.ocr-panel__meta',
      many ? h('strong', `صفحة ${p.page}`) : null,
      many ? ' · ' : null,
      p.status === 'corrected' ? 'صحّحه الفريق' : `قرأه ${p.provider_label || p.provider}`,
    );
    const box = h('div.ocr-panel__page');
    const copy = h('button.btn-link', { type: 'button', onClick: () => copyText(p.text || ''), tag: 'DOC-34' }, 'نسخ');
    const edit = h(
      'button.btn-link',
      {
        type: 'button',
        onClick: () => {
          const ta = h('textarea.input.ocr-panel__edit', { dir: 'auto', rows: 10, 'aria-label': `تصحيح نص الصفحة ${p.page}`, tag: 'DOC-35' }, p.text || '');
          const save = h(
            'button.btn.btn--primary.btn-sm',
            {
              type: 'button',
              onClick: async (e) => {
                e.currentTarget.disabled = true;
                try {
                  await api.put(`/admin/documents/${id}/text/${p.page}`, { text: ta.value });
                  toast('حُفظ التصحيح', 'success');
                  load();
                } catch (err) {
                  toast(errorMessage(err), 'danger');
                  e.currentTarget.disabled = false;
                }
              },
              tag: 'DOC-36',
            },
            'حفظ التصحيح',
          );
          const cancel = h('button.btn.btn--text.btn-sm', { type: 'button', onClick: () => mount(box, head, pre, tools), tag: 'DOC-37' }, 'إلغاء');
          mount(box, head, ta, h('div.ocr-panel__actions', save, cancel));
          ta.focus();
        },
        tag: 'DOC-38',
      },
      'تصحيح',
    );
    const tools = h('p.ocr-panel__tools', copy, ' · ', edit);
    mount(box, head, pre, tools);
    return box;
  }

  function draw(data) {
    const nodes = [h('p.ocr-panel__label', OCR_LABEL)];
    const j = data.job;
    if (j && (j.state === 'queued' || j.state === 'running')) nodes.push(h('p.ocr-panel__state', { role: 'status' }, 'جارٍ قراءة النص…'));
    else if (!data.pages.length && j && (j.state === 'skipped' || j.state === 'failed')) nodes.push(h('p.ocr-panel__state', `لم يُقرأ النص: ${why(j.error)}`));
    else if (!data.pages.length) nodes.push(h('p.ocr-panel__state', 'لم يُقرأ نص هذا المستند بعد.'));
    const many = data.pages.length > 1;
    for (const p of data.pages) nodes.push(pageBlock(p, many));
    const act = actions(data);
    if (act) nodes.push(act);
    mount(root, nodes);
  }

  load();
  return root;
}

/** اللوحة في ورقة مستقلة (فوق العارض أو من قائمة ⋯) */
export function openTextPanel(d) {
  try {
    if (!document.querySelector('link[data-scn-css]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('../../../css/v12-media.css', import.meta.url).pathname, 'data-scn-css': '1' }));
  } catch {
    /* بلا تنسيق: اللوحة مقروءة */
  }
  return modal({ title: 'النص المقروء آليًا', size: 'md', sheet: true, className: 'ocr-sheet', body: textPanel(d), tag: 'DOC-39' });
}

const MODE_TEXT = { auto: 'تلقائي', color: 'ألوان', gray: 'رمادي', bw: 'أبيض وأسود' };
const SCANNABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);
// الفريق: مصدر حتى 3200 px وصفحة حتى 2339 px (A4 بدقة 200) كما في رفع الفريق
const STAFF_OPTS = { sourceMax: 3200, maxSide: 2339, quality: 0.72 };

/** هل يقبل المستند التنظيف في المتصفح؟ صورة من صفحة واحدة (كما يتحقق الخادم) */
export function canClean(d) {
  if (!d || !SCANNABLE.has(String(d.mime || ''))) return false;
  const s = d.scan;
  if (s && (s.state === 'skipped' || Number(s.pages) > 1)) return false;
  return true;
}

function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * «نظّف المستند»: الأصل ← ماسح المتصفح ← ورقة الأركان ← رفع النسخة. → publicView، أو null عند الإلغاء.
 * أي فشل في الماسح يرمي خطأ برسالة عربية.
 */
export async function cleanInBrowser(d, { trigger = null } = {}) {
  const res = await fetch(`${downloadUrl(d.id)}?file=original&inline=1`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error('تعذر تحميل الصورة الأصلية.');
  const blob = await res.blob();
  const base = String(d.title || d.filename || 'مستند').replace(/\.[A-Za-z0-9]{1,5}$/, '');
  const file = new File([blob], `${base}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type || d.mime });
  const up = await import('../../public/upload.js');
  const { scanner, sheet } = await up.loadScanner();
  if (!scanner.supportsScanner()) throw new Error('هذا المتصفح لا يدعم تحسين الصور. جرّب متصفحًا أحدث.');
  let page;
  try {
    page = await scanner.scanPage(file, STAFF_OPTS);
  } catch {
    throw new Error('تعذر تجهيز الصورة للتحسين.');
  }
  const r = await sheet.editPage(page, { register: 'staff', trigger, ...STAFF_OPTS });
  if (!r || r.action !== 'done' || !r.page || !r.page.clean) return null;
  const { file: out, scan } = await scanner.docFile([r.page], { name: base });
  if (!scan) return null;
  const { originals: _o, ...params } = scan;
  const data_base64 = await readAsBase64(out);
  return api.post(`/admin/documents/${encodeURIComponent(d.id)}/clean`, { file: { filename: out.name, mime: out.type, data_base64 }, params });
}

/** «رجّع الأصل» / «اعرض النسخة المحسّنة» → publicView */
export function setDisplay(d, show) {
  return api.put(`/admin/documents/${encodeURIComponent(d.id)}/display`, { show });
}

const short = (hex) => (hex ? `${String(hex).slice(0, 12)}…${String(hex).slice(-4)}` : '');
function hash(hex) {
  return h('code', { dir: 'ltr', title: hex, 'aria-label': `sha256 ${hex}` }, `sha256:${short(hex)}`);
}

/** سطر المعلومات: الأصل sha256 · المحسّنة sha256 · المصدر · المعاملات */
export function infoLine(info) {
  const files = (info.files || []).filter((f) => !f.replaced);
  const original = info.main.role === 'original' ? info.main : files.find((f) => f.role === 'original' && f.page === 1);
  const clean = files.find((f) => f.role === 'clean') || (info.main.role === 'clean' ? info.main : null);
  const src = files.find((f) => f.role === 'clean') || files.find((f) => f.role === 'original');
  const p = src && src.params;
  const params = p
    ? [MODE_TEXT[p.mode] || null, Number.isFinite(p.score) ? `الثقة ${Math.round(p.score * 100)}٪` : null, p.partial ? 'الورقة مقصوصة' : null, p.adjusted ? 'الأركان عُدّلت يدويًا' : null].filter(Boolean).join('، ')
    : '';
  const parts = [];
  if (original) parts.push(h('span', 'الأصل: ', hash(original.sha256)));
  if (clean) parts.push(h('span', 'المحسّنة: ', hash(clean.sha256)));
  if (src) parts.push(h('span', `المصدر: ${src.source_label}`));
  if (params) parts.push(h('span', `المعاملات: ${params}`));
  const nodes = [];
  parts.forEach((x, i) => nodes.push(i ? ' · ' : null, x));
  return h('p.doc-info', { tag: 'DOC-10' }, nodes.length ? nodes : 'لا توجد نسخ أخرى لهذا المستند.');
}

/** أدوات الفريق في العارض */
export function cleanActions(d, { onChange } = {}) {
  const root = h('div.doc-clean__row');
  const info = h('div.doc-clean__info');
  const s = d.scan || null;
  const hasClean = !!(s && s.clean);
  const showing = s ? s.display : 'original';
  const mainClean = !!(s && (s.state === 'client' || s.state === 'staff'));
  let busy = false;

  const run = async (btn, fn, done) => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    try {
      const fresh = await fn();
      if (fresh) {
        toast(done, 'success');
        if (onChange) onChange(fresh);
      }
    } catch (err) {
      toast(errorMessage(err) || err?.message || 'تعذر تنفيذ الإجراء', 'danger');
    } finally {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  };
  // v12 tags (TG-6): الرمز في كائن حرفي { tag } ليقرأه سجل الرموز (T12-51)
  const btn = (label, { tag }, onClick, extra = {}) => h('button.doc-clean__btn', { type: 'button', tag, onClick: (e) => onClick(e.currentTarget), ...extra }, label);

  const items = [];
  if (canClean(d)) {
    const again = hasClean;
    items.push(
      // tags:skip the two literals below carry DOC-06 / DOC-05
      btn(again ? 'نظّفه مرة أخرى' : 'نظّف المستند', again ? { tag: 'DOC-06' } : { tag: 'DOC-05' }, (b) =>
        run(b, () => cleanInBrowser(d, { trigger: b }), 'حُفظت النسخة المحسّنة، والأصل محفوظ'),
      ),
    );
  }
  if (hasClean && (mainClean ? Number(s.originals) > 0 : true)) {
    if (showing === 'clean') items.push(btn('رجّع الأصل', { tag: 'DOC-07' }, (b) => run(b, () => setDisplay(d, 'original'), 'يُعرض الأصل أولًا الآن')));
    else items.push(btn('اعرض النسخة المحسّنة', { tag: 'DOC-08' }, (b) => run(b, () => setDisplay(d, 'clean'), 'تُعرض النسخة المحسّنة أولًا الآن')));
  }
  const infoBtn = btn(
    'تفاصيل النسخ',
    { tag: 'DOC-09' },
    async (b) => {
      if (!info.hidden && info.firstChild) {
        info.hidden = true;
        b.setAttribute('aria-expanded', 'false');
        return;
      }
      b.disabled = true;
      try {
        const data = await api.get(`/admin/documents/${encodeURIComponent(d.id)}/files`);
        mount(info, infoLine(data));
        info.hidden = false;
        b.setAttribute('aria-expanded', 'true');
      } catch (err) {
        toast(errorMessage(err), 'danger');
      } finally {
        b.disabled = false;
      }
    },
    { 'aria-expanded': 'false' },
  );
  items.push(infoBtn);
  // v12 media (MD-10): «النص» للصور وملفات PDF
  if (/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(String(d.mime || ''))) items.push(h('button.doc-clean__btn', { type: 'button', tag: 'DOC-12', onClick: () => openTextPanel(d) }, 'النص'));
  info.hidden = true;
  mount(root, items);
  return h('div.doc-clean__wrap', { tag: 'DOC-11' }, root, info);
}
