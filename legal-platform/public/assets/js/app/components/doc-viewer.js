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
//
// v12 media (MD-5، L12-59، L12-61): العارض يعرض الملف المعروض (display_file_id)، وزر «الأصل» يبدّل بين النسخة المحسّنة
// والصورة الأصلية (للفريق وللمحامي الذي أُتيح له المستند)، وبجواره على كل عرض للنسخة المحسّنة «نسخة محسّنة آليًا · الأصل
// محفوظ» (DOC-16). مستند PDF من عدة صفحات مصوّرة: «الأصل» يعرض صور الصفحات واحدة واحدة. للفريق وحده (doc-clean.js، يُحمَّل
// عند الحاجة): «نظّف المستند» / «نظّفه مرة أخرى»، «رجّع الأصل» / «اعرض النسخة المحسّنة»، و«تفاصيل النسخ» (sha256 والمصدر
// والمعاملات). بوابة الشركات (urlFor خاص) لا ترى شيئًا من ذلك. الصفحات لا تتغير: docRow/openDocument/docMenu كما هي.
//   variantOf(d) → { mainClean, pages, initial: 'clean' | 'original', pdf } | null
//   docVariantNote(d) → سطر DOC-16 (أو DOC-17 لـ HEIC عند الفريق) أو null
//   docViewButton(d, { onChange }) → زر «عرض» لقوائم الفريق (لصفحات تريد العارض بدل التنزيل)
import { h, svg, mount } from '../../lib/h.js';
import { downloadUrl, formatBytes } from '../../lib/api.js';
import { icon, modal, button } from '../../lib/ui.js';

// ───────── v12 media (MD-5): النسخ والأصل ─────────
export const CLEAN_NOTE = 'نسخة محسّنة آليًا · الأصل محفوظ'; // DOC-16 (L12-59)
export const HEIC_NOTE = 'صيغة HEIC لا تُعرض هنا. اطلب صورة JPG.'; // DOC-17 (L12-73)

/** من يفتح العارض: 'staff' | 'lawyer' في /app، و'company' لبوابة الشركات (urlFor خاص)، و'other' خارج المنصة */
function viewerRole(urlFor) {
  if (urlFor && urlFor !== defaultUrlFor) return 'company';
  try {
    if (!/^\/app(?:\/|$)/.test(window.location.pathname)) return 'other';
    const root = document.documentElement;
    return root.classList.contains('lh-lawyer-ui') || document.querySelector('.is-lawyer') ? 'lawyer' : 'staff';
  } catch {
    return 'other';
  }
}

/** تنسيق العارض والملاحظات (v12-media.css) مرة واحدة، عند الحاجة فقط */
function mediaCss() {
  try {
    if (document.querySelector('link[data-scn-css]')) return;
    const href = new URL('../../../css/v12-media.css', import.meta.url).pathname;
    document.head.append(h('link', { rel: 'stylesheet', href, 'data-scn-css': '1' }));
  } catch {
    /* بلا تنسيق: العناصر تبقى مقروءة */
  }
}

/** نموذج النسخ لمستند (من publicView.scan)، أو null حين لا توجد نسخة محسّنة وأصل يُبدَّل بينهما */
export function variantOf(d) {
  const s = d && d.scan;
  if (!s || !s.clean) return null;
  const mainClean = s.state === 'client' || s.state === 'staff';
  if (mainClean && !(Number(s.originals) > 0)) return null;
  return {
    mainClean,
    pages: mainClean ? Math.max(1, Number(s.pages) || 1) : 1,
    initial: s.display === 'original' ? 'original' : 'clean',
    pdf: String(d.mime || '') === 'application/pdf',
  };
}

/** رابط نسخة: file = clean | original، page ≥ 1 */
function variantUrl(d, { file, page = 1, inline = true } = {}) {
  const q = [`file=${file}`];
  if (page > 1) q.push(`page=${page}`);
  if (inline) q.push('inline=1');
  return `${downloadUrl(d.id)}?${q.join('&')}`;
}

/** سطر تحت اسم المستند في القوائم: DOC-16 حين تُعرض النسخة المحسّنة، وDOC-17 لصورة HEIC عند الفريق */
export function docVariantNote(d, { role = viewerRole() } = {}) {
  if (role === 'company' || role === 'other') return null;
  const v = variantOf(d);
  if (v && v.initial === 'clean') return h('span.lw-doc-meta.doc-variant__note', { tag: 'DOC-16' }, CLEAN_NOTE);
  if (role === 'staff' && d && d.scan && d.scan.reason === 'heic') return h('span.lw-doc-meta.doc-variant__note', { tag: 'DOC-17' }, HEIC_NOTE);
  return null;
}

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

/**
 * v10 b2b-portal (L-42): urlFor(doc, { inline }) يبني رابط العرض/التنزيل (بوابة الشركات: /api/company/documents/:id/download).
 * الافتراضي روابط المنصة كما هي.
 */
export const defaultUrlFor = (d, { inline = false } = {}) => (inline ? viewUrl(d.id) : downloadUrl(d.id));

export function downloadDocument(d, { urlFor = defaultUrlFor } = {}) {
  // بلا سمة download: الخادم يرسل Content-Disposition: attachment للتنزيل الصريح فقط
  const a = document.createElement('a');
  a.href = urlFor(d, { inline: false });
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

/** فتح المستند للقراءة دون تنزيله */
export function openDocument(d, opts = {}) {
  const k = docKind(d);
  const urlFor = opts.urlFor || defaultUrlFor;
  if (k === 'image') return openImageViewer(d, opts);
  // v12 media: PDF مصوّر يُعرض أصله أولًا (القص غير مؤكد، L12-59) ← العارض على صور الصفحات الأصلية
  const v = urlFor === defaultUrlFor && viewerRole(urlFor) !== 'other' ? variantOf(d) : null;
  if (k === 'pdf' && v && v.initial === 'original') return openImageViewer(d, opts);
  if (k === 'pdf') {
    if (urlFor === defaultUrlFor) window.open(viewUrl(d.id), '_blank', 'noopener');
    else window.open(urlFor(d, { inline: true }), '_blank', 'noopener');
    return null;
  }
  downloadDocument(d, { urlFor });
  return null;
}

/** قائمة ⋯ للمستند: «تنزيل على الهاتف» (+ «تحليل المستند» مع Claude فقط) */
export function docMenu(d, { claude = false, onAnalyze, urlFor = defaultUrlFor, onChange } = {}) {
  let m = null;
  const role = viewerRole(urlFor);
  const v = role === 'staff' || role === 'lawyer' ? variantOf(d) : null;
  const item = (label, hint, iconName, fn) =>
    h(
      'button.lw-menu-item',
      { type: 'button', onClick: () => { m.close('action'); fn(); }, tag: 'DOC-18' },
      h('span.lw-menu-icon', lwIcon(iconName, { size: 20 })),
      h('span.lw-menu-text', h('strong', label), hint && h('span.lw-menu-hint', hint)),
    );
  m = modal({
    title: docName(d),
    size: 'sm',
    sheet: true, className: 'lw-sheet',
    body: h(
      'div.lw-menu',
      item('تنزيل على الهاتف', 'يبقى الملف في التنزيلات؛ احذفه بعد الانتهاء.', 'download', () => downloadDocument(d, { urlFor })),
      // v12 media (MD-5): صور الصفحات الأصلية لمستند PDF مصوّر يُفتح افتراضيًا بنسخته المحسّنة
      v && v.pdf && v.initial === 'clean' ? item('الصور الأصلية', `كما صوّرها المرسل (${v.pages === 1 ? 'صفحة واحدة' : v.pages === 2 ? 'صفحتان' : `${v.pages} صفحات`})`, 'image', () => openImageViewer(d, { claude, onAnalyze, urlFor, onChange, view: 'original' })) : null,
      // v12 media (MD-10): النص المقروء آليًا للفريق فقط (لا نص للمحامي في 12.0، L12-17)
      // tags:variant (DOC-12 «النص» نفسه في أدوات العارض)
      role === 'staff' && docKind(d) !== 'doc' ? h('div', { tag: 'DOC-12' }, item('النص المقروء آليًا', 'مسودة للمراجعة، للفريق فقط.', 'fileText', () => import('./doc-clean.js').then((x) => x.openTextPanel(d)))) : null,
      claude && onAnalyze ? item('تحليل المستند', null, 'sparkle', () => onAnalyze(d)) : null,
    ),
    tag: 'DOC-19',
  });
  return m;
}

/**
 * عارض الصور داخل التطبيق: خلفية داكنة، الصورة بعرض الشاشة، وتكبير الإصبعين الأصلي في المتصفح.
 * زر الرجوع في الهاتف يغلقه أيضًا، وموضع التمرير في الصفحة لا يتغير.
 * v12 media (MD-5): شريط «الأصل» + DOC-16 فوق الصورة حين للمستند نسخة محسّنة وأصل، وأدوات الفريق أسفلها.
 * opts.view = 'clean' | 'original' يفرض البداية؛ opts.onChange(d) بعد أي تغيير من الفريق (تنظيف أو تغيير المعروض).
 */
export function openImageViewer(d, { claude = false, onAnalyze, urlFor = defaultUrlFor, onChange, view = null } = {}) {
  const scrollY = window.scrollY;
  const role = viewerRole(urlFor);
  const status = h('p.lw-viewer-status', { role: 'status' }, 'جارٍ الفتح…');
  const img = h('img.lw-viewer-img', { alt: docName(d), decoding: 'async' });
  const stage = h('div.lw-viewer-stage', { tabindex: '0', 'aria-label': docName(d) }, status, img);
  img.addEventListener('load', () => {
    status.hidden = true;
    img.classList.add('is-loaded');
  });
  img.addEventListener('error', () => {
    mount(status, 'تعذر فتح الصورة. ', button('تنزيل', { variant: 'link', size: 'sm', onClick: () => downloadDocument(d, { urlFor }), tag: 'DOC-20' }));
  });

  // v12 media: الحالة — أي نسخة تُعرض الآن، وأي صفحة من الأصل
  const variants = role === 'staff' || role === 'lawyer';
  let model = variants ? variantOf(d) : null;
  const st = { view: view || (model ? model.initial : 'clean'), page: 1 };
  const bar = h('div.doc-variant', { tag: 'DOC-01' });
  const tools = h('div.doc-clean');
  const body = model || role === 'staff' ? h('div.doc-view', bar, stage, tools) : stage;
  if (body !== stage) mediaCss();

  function show() {
    status.hidden = false;
    img.classList.remove('is-loaded');
    mount(status, 'جارٍ الفتح…');
    if (!model) {
      img.hidden = false;
      img.src = urlFor(d, { inline: true });
      return;
    }
    if (st.view === 'clean' && model.pdf) {
      // النسخة المحسّنة لمستند من عدة صفحات = ملف PDF: يُفتح في عارض المتصفح
      img.hidden = true;
      img.removeAttribute('src');
      mount(
        status,
        h(
          'span.doc-pdf',
          `${CLEAN_NOTE}. `,
          h('a.doc-variant__link', { href: variantUrl(d, { file: 'clean' }), target: '_blank', rel: 'noopener', tag: 'DOC-04' }, 'فتح ملف PDF'),
        ),
      );
      return;
    }
    img.hidden = false;
    img.src = st.view === 'original' ? variantUrl(d, { file: 'original', page: st.page }) : variantUrl(d, { file: 'clean' });
  }

  function drawBar() {
    if (!model) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const orig = st.view === 'original';
    const toggle = h(
      'button.doc-variant__toggle',
      {
        type: 'button',
        'aria-pressed': orig ? 'true' : 'false',
        title: orig ? 'اعرض النسخة المحسّنة' : 'اعرض الصورة الأصلية كما وصلت',
        tag: 'DOC-02',
        onClick: () => {
          st.view = orig ? 'clean' : 'original';
          st.page = 1;
          drawBar();
          show();
        },
      },
      'الأصل',
    );
    const pages = model.mainClean ? model.pages : 1;
    const pager =
      orig && pages > 1
        ? h(
            'span.doc-variant__pager',
            { tag: 'DOC-03' },
            h('button.doc-variant__pg', { type: 'button', disabled: st.page <= 1, onClick: () => ((st.page -= 1), drawBar(), show()), tag: 'DOC-21' }, 'السابقة'),
            h('span.doc-variant__pn', { 'aria-live': 'polite' }, `صفحة ${st.page} من ${pages}`),
            h('button.doc-variant__pg', { type: 'button', disabled: st.page >= pages, onClick: () => ((st.page += 1), drawBar(), show()), tag: 'DOC-22' }, 'التالية'),
          )
        : null;
    // tags:variant (DOC-16 نفسه في القائمة وفي العارض)
    mount(bar, toggle, orig ? h('span.doc-variant__note', 'الصورة الأصلية كما وصلت') : h('span.doc-variant__note', { tag: 'DOC-16' }, CLEAN_NOTE), pager);
  }

  // أدوات الفريق (doc-clean.js، تُحمَّل عند فتح العارض للفريق فقط)
  function drawTools() {
    if (role !== 'staff') {
      tools.hidden = true;
      return;
    }
    tools.hidden = false;
    import('./doc-clean.js')
      .then((m) =>
        mount(
          tools,
          m.cleanActions(d, {
            onChange: (fresh) => {
              Object.assign(d, fresh);
              model = variantOf(d);
              st.view = model ? model.initial : 'clean';
              st.page = 1;
              drawBar();
              drawTools();
              show();
              if (onChange) onChange(d);
            },
          }),
        ),
      )
      .catch(() => {
        tools.hidden = true;
      });
  }
  drawBar();
  drawTools();
  show();

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
    body,
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
    tag: 'DOC-23',
  });
  // «رجوع» في بداية الشريط، و⋯ في نهايته (بدل زر الإغلاق الافتراضي)
  const header = handle.el.querySelector('.modal-header');
  const back = h('button.lw-viewer-back', { type: 'button', onClick: () => handle.close('back-button'), tag: 'DOC-24' }, icon('arrowRight', { size: 20 }), h('span', 'رجوع'));
  const more = h('button.lw-viewer-more', { type: 'button', 'aria-label': 'خيارات المستند', onClick: () => docMenu(d, { claude, onAnalyze, urlFor, onChange }), tag: 'DOC-25' }, icon('more', { size: 22 }));
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
 * v12 media (MD-5): زر «عرض» لقوائم مستندات الفريق — يفتح العارض (مع «الأصل» و«نظّف المستند») بدل التنزيل.
 * للصور وملفات PDF فقط (غيرها null). onChange(d) بعد تنظيف أو تغيير المعروض.
 */
export function docViewButton(d, { onChange } = {}) {
  const k = docKind(d);
  if (k === 'doc') return null;
  return button('عرض', { size: 'sm', variant: 'ghost', icon: 'eye', ariaLabel: `عرض ${docName(d)}`, dataset: { tag: 'DOC-15' }, onClick: () => openDocument(d, { onChange }), tag: 'DOC-26' });
}

/**
 * صف مستند: الصف كله «عرض» (≥ 56px)، ونوع الملف في شريحة مستقلة باتجاه LTR، وزر ⋯ (44×44).
 * @param {object} d مستند من publicView
 * @param {{claude?:boolean, onAnalyze?:(d)=>void, source?:boolean}} [opts]
 */
export function docRow(d, { claude = false, onAnalyze, source = true, urlFor = defaultUrlFor, sourceLabel } = {}) {
  const k = docKind(d);
  const name = docName(d);
  const meta = [d.size ? formatBytes(d.size) : null, source ? sourceLabel || SOURCE[d.uploaded_by_kind] : null].filter(Boolean).join(' · ');
  const iconNode = k === 'image' ? lwIcon('image') : icon('fileText', { size: 20 });
  const open = h(
    'button.lw-doc-open',
    {
      type: 'button',
      'aria-label': k === 'doc' ? `تنزيل ${name}` : `عرض ${name}`,
      onClick: () => openDocument(d, { claude, onAnalyze, urlFor }),
      tag: 'DOC-27',
    },
    h('span.lw-doc-icon', { 'aria-hidden': 'true' }, iconNode),
    h(
      'span.lw-doc-text',
      h('span.lw-doc-name-line', h('span.lw-doc-name', { dir: 'auto' }, name), h('bdi.lw-doc-type', { dir: 'ltr' }, docTypeLabel(d))),
      meta && h('span.lw-doc-meta', meta, k === 'doc' ? ' · تنزيل' : null),
      urlFor === defaultUrlFor ? docVariantNote(d) : null, // v12 media: DOC-16 على كل عرض للنسخة المحسّنة
    ),
  );
  const more = h(
    'button.lw-doc-more',
    { type: 'button', 'aria-label': `خيارات ${name}`, onClick: () => docMenu(d, { claude, onAnalyze, urlFor }), tag: 'DOC-28' },
    icon('more', { size: 22 }),
  );
  return h('li.lw-doc', { dataset: { docId: d.id, kind: k } }, open, more);
}

export function docList(docs, opts = {}) {
  return h('ul.lw-docs', (docs || []).map((d) => docRow(d, opts)));
}
