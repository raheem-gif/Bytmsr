// v9.1 l-work — قراءة المستندات داخل التطبيق (L-05): صفوف مستندات، عارض صور مدمج، PDF في عارض المتصفح.
//
// الواجهة البرمجية:
//   docName(d)        الاسم المقروء: العنوان أو اسم الملف بلا امتداد، و«_»/«-» مسافات
//   docKind(d)        'pdf' | 'image' | 'doc' (من الخادم documents.publicView، أو من النوع)
//   docTypeLabel(d)   «PDF» | «صورة» | «Word» | «Excel» | «ملف»
//   viewUrl(id)       /api/documents/{id}/download?inline=1  (عرض فقط؛ الخادم يرسل no-store)
//   openDocument(d)   صورة → العارض المدمج؛ PDF → تبويب عارض المتصفح؛ غير ذلك → تنزيل
//   downloadDocument(d)
//   docRow(d, { claude, onAnalyze, sourceLabel }) → <li> صف كامل قابل للنقر (≥ 56px) + زر ⋯ (44×44)
//   docList(docs, opts) → <ul>
import { h, svg, mount } from '../../lib/h.js';
import { downloadUrl, formatBytes } from '../../lib/api.js';
import { icon, modal, button } from '../../lib/ui.js';

// أيقونات إضافية لمسار l-work (غير موجودة في ui.js): صورة، وانقطاع الاتصال
const LW_ICONS = {
  image: [['path', { d: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['polyline', { points: '21 15 16 10 5 21' }]],
  cloudOff: [['path', { d: 'M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3' }], ['line', { x1: 1, y1: 1, x2: 23, y2: 23 }]],
};

/** أيقونة إضافية (بنفس مظهر icon() في ui.js)، وتعود إلى icon() لغير ذلك */
export function lwIcon(name, { size = 20 } = {}) {
  const def = LW_ICONS[name];
  if (!def) return icon(name, { size });
  return svg(
    'svg',
    { class: ['icon', `icon-${name}`], width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false', 'aria-hidden': 'true' },
    def.map(([tag, attrs]) => svg(tag, attrs)),
  );
}

const SOURCE = { client: 'من المستفيد/ة', staff: 'من الإدارة', system: 'من الإدارة', lawyer: 'أضفته أنت' };

export function docKind(d) {
  if (d && (d.kind === 'pdf' || d.kind === 'image' || d.kind === 'doc')) return d.kind;
  const mime = String(d?.mime || '');
  if (mime === 'application/pdf') return 'pdf';
  if (/^image\/(jpeg|png|webp)$/.test(mime)) return 'image';
  return 'doc';
}

export function docName(d) {
  const raw = String((d && (d.title || d.filename)) || 'مستند');
  const noExt = raw.replace(/\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|txt|ogg|mp3|m4a|mp4|webm)$/i, '');
  return noExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'مستند';
}

export function docTypeLabel(d) {
  const k = docKind(d);
  if (k === 'pdf') return 'PDF';
  if (k === 'image') return 'صورة';
  const mime = String(d?.mime || '');
  if (/word/.test(mime)) return 'Word';
  if (/sheet|excel/.test(mime)) return 'Excel';
  if (/^audio\//.test(mime)) return 'صوت';
  return 'ملف';
}

export function viewUrl(id) {
  return `${downloadUrl(id)}?inline=1`;
}

export function downloadDocument(d) {
  // بلا سمة download: الخادم يرسل Content-Disposition: attachment للتنزيل الصريح فقط
  const a = document.createElement('a');
  a.href = downloadUrl(d.id);
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

/** فتح المستند للقراءة دون تنزيله */
export function openDocument(d, opts = {}) {
  const k = docKind(d);
  if (k === 'image') return openImageViewer(d, opts);
  if (k === 'pdf') {
    window.open(viewUrl(d.id), '_blank', 'noopener');
    return null;
  }
  downloadDocument(d);
  return null;
}

/** قائمة ⋯ للمستند: «تنزيل على الهاتف» (+ «تحليل المستند» مع Claude فقط) */
export function docMenu(d, { claude = false, onAnalyze } = {}) {
  let m = null;
  const item = (label, hint, iconName, fn) =>
    h(
      'button.lw-menu-item',
      { type: 'button', onClick: () => { m.close('action'); fn(); } },
      h('span.lw-menu-icon', icon(iconName, { size: 20 })),
      h('span.lw-menu-text', h('strong', label), hint && h('span.lw-menu-hint', hint)),
    );
  m = modal({
    title: docName(d),
    size: 'sm',
    sheet: true, className: 'lw-sheet',
    body: h(
      'div.lw-menu',
      item('تنزيل على الهاتف', 'يبقى الملف في التنزيلات؛ احذفه بعد الانتهاء.', 'download', () => downloadDocument(d)),
      claude && onAnalyze ? item('تحليل المستند', null, 'sparkle', () => onAnalyze(d)) : null,
    ),
  });
  return m;
}

/**
 * عارض الصور داخل التطبيق: خلفية داكنة، الصورة بعرض الشاشة، وتكبير الإصبعين الأصلي في المتصفح.
 * زر الرجوع في الهاتف يغلقه أيضًا، وموضع التمرير في الصفحة لا يتغير.
 */
export function openImageViewer(d, { claude = false, onAnalyze } = {}) {
  const scrollY = window.scrollY;
  const status = h('p.lw-viewer-status', { role: 'status' }, 'جارٍ الفتح…');
  const img = h('img.lw-viewer-img', { alt: docName(d), decoding: 'async' });
  const stage = h('div.lw-viewer-stage', { tabindex: '0', 'aria-label': docName(d) }, status, img);
  img.addEventListener('load', () => {
    status.hidden = true;
    img.classList.add('is-loaded');
  });
  img.addEventListener('error', () => {
    mount(status, 'تعذر فتح الصورة. ', button('تنزيل', { variant: 'link', size: 'sm', onClick: () => downloadDocument(d) }));
  });
  img.src = viewUrl(d.id);

  let pushed = false;
  let popped = false;
  const onPop = () => {
    popped = true;
    handle.close('back');
  };
  const handle = modal({
    title: docName(d),
    size: 'lg',
    className: 'lw-viewer',
    body: stage,
    onClose: () => {
      window.removeEventListener('popstate', onPop);
      img.removeAttribute('src');
      if (pushed && !popped) {
        try {
          window.history.back();
        } catch {
          /* لا شيء */
        }
      }
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
    },
  });
  // «رجوع» في بداية الشريط، و⋯ في نهايته (بدل زر الإغلاق الافتراضي)
  const header = handle.el.querySelector('.modal-header');
  const back = h('button.lw-viewer-back', { type: 'button', onClick: () => handle.close('back-button') }, icon('arrowRight', { size: 20 }), h('span', 'رجوع'));
  const more = h('button.lw-viewer-more', { type: 'button', 'aria-label': 'خيارات المستند', onClick: () => docMenu(d, { claude, onAnalyze }) }, icon('more', { size: 22 }));
  if (header) {
    header.prepend(back);
    header.append(more);
  }
  try {
    window.history.pushState({ lwViewer: true }, '', window.location.href);
    pushed = true;
    window.addEventListener('popstate', onPop);
  } catch {
    /* بلا سجل: يكفي زر «رجوع» */
  }
  requestAnimationFrame(() => back.focus({ preventScroll: true }));
  return handle;
}

/**
 * صف مستند: الصف كله «عرض» (≥ 56px)، ونوع الملف في شريحة مستقلة باتجاه LTR، وزر ⋯ (44×44).
 * @param {object} d مستند من publicView
 * @param {{claude?:boolean, onAnalyze?:(d)=>void, source?:boolean}} [opts]
 */
export function docRow(d, { claude = false, onAnalyze, source = true } = {}) {
  const k = docKind(d);
  const name = docName(d);
  const meta = [d.size ? formatBytes(d.size) : null, source ? SOURCE[d.uploaded_by_kind] : null].filter(Boolean).join(' · ');
  const iconNode = k === 'image' ? lwIcon('image') : icon('fileText', { size: 20 });
  const open = h(
    'button.lw-doc-open',
    {
      type: 'button',
      'aria-label': k === 'doc' ? `تنزيل ${name}` : `عرض ${name}`,
      onClick: () => openDocument(d, { claude, onAnalyze }),
    },
    h('span.lw-doc-icon', { 'aria-hidden': 'true' }, iconNode),
    h(
      'span.lw-doc-text',
      h('span.lw-doc-name-line', h('span.lw-doc-name', { dir: 'auto' }, name), h('bdi.lw-doc-type', { dir: 'ltr' }, docTypeLabel(d))),
      meta && h('span.lw-doc-meta', meta, k === 'doc' ? ' · تنزيل' : null),
    ),
  );
  const more = h(
    'button.lw-doc-more',
    { type: 'button', 'aria-label': `خيارات ${name}`, onClick: () => docMenu(d, { claude, onAnalyze }) },
    icon('more', { size: 22 }),
  );
  return h('li.lw-doc', { dataset: { docId: d.id, kind: k } }, open, more);
}

export function docList(docs, opts = {}) {
  return h('ul.lw-docs', (docs || []).map((d) => docRow(d, opts)));
}
