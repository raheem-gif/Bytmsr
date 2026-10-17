// v12 media (MD-2): corner sheet (M §5.3, L12-72): <button> corners, drag, arrows, tap-then-point, rotate, modes, as-is, preview.
import { h, svg } from './h.js';
import { session, applyRender } from './scanner.js';

/** Arabic page count (copy of entry-tree.js pagesAr, L12-86) */
export function pagesAr(n) {
  const k = Math.max(0, Math.round(Number(n) || 0));
  if (k === 1) return 'صفحة واحدة';
  if (k === 2) return 'صفحتان';
  const r = k % 100;
  return r >= 3 && r <= 10 ? `${k} صفحات` : `${k} صفحة`;
}

const P = {
  preparing: 'جارٍ تجهيز المستند…',
  batch: (i, n) => `جارٍ تجهيز الصورة ${i} من ${n}…`,
  partial: 'المستند غير ظاهر بالكامل. هل تريدون إعادة التصوير؟',
  notFound: 'لم نجد حدود المستند. اسحبوا الدوائر إلى أركانه.',
  retake: 'إعادة التصوير',
  keep: 'استخدام الصورة كما هي',
  handles: 'اسحبوا الدوائر إلى أركان المستند',
  keys: 'أو المسوا الركن ثم مكانه الصحيح، أو حرّكوه بالأسهم.',
  rotate: 'تدوير',
  done: 'تم',
  addPage: 'صفحة أخرى',
  addHint: 'صفحة ثانية من نفس المستند؟',
  corners: ['الركن العلوي الأيسر', 'الركن العلوي الأيمن', 'الركن السفلي الأيمن', 'الركن السفلي الأيسر'],
  modes: true,
  pages: true,
};
export const SCAN_COPY = {
  f: {
    preparing: 'بنجهّز الورقة…',
    partial: 'الورقة مش باينة كلها. صوّريها تاني؟',
    notFound: 'مش لاقيين حدود الورقة. حرّكي الدواير على أركانها.',
    retake: 'صوّري تاني',
    keep: 'كده كويس',
    handles: 'اسحبي الدواير لأركان الورقة',
    keys: 'أو المسي الركن وبعدين المسي مكانه، أو حرّكيه بالأسهم.',
    rotate: 'لف',
    done: 'تمام',
    corners: ['الركن اللي فوق على الشمال', 'الركن اللي فوق على اليمين', 'الركن اللي تحت على اليمين', 'الركن اللي تحت على الشمال'],
    modes: false,
    pages: false,
  },
  m: {
    preparing: 'بنجهّز الورقة…',
    partial: 'الورقة مش باينة كلها. صوّرها تاني؟',
    notFound: 'مش لاقيين حدود الورقة. حرّك الدواير على أركانها.',
    retake: 'صوّر تاني',
    keep: 'كده كويس',
    handles: 'اسحب الدواير لأركان الورقة',
    keys: 'أو المس الركن وبعدين المس مكانه، أو حرّكه بالأسهم.',
    rotate: 'لف',
    done: 'تمام',
    corners: ['الركن اللي فوق على الشمال', 'الركن اللي فوق على اليمين', 'الركن اللي تحت على اليمين', 'الركن اللي تحت على الشمال'],
    modes: false,
    pages: false,
  },
  p: P,
  company: P,
  staff: {
    ...P,
    partial: 'المستند غير ظاهر بالكامل',
    notFound: 'لم تُكتشف حدود المستند. اسحب الأركان.',
    keep: 'استخدم الصورة كما هي',
    handles: 'اسحب الأركان',
    keys: 'أو اختر الركن ثم المس مكانه، أو حرّكه بالأسهم.',
    reset: 'إعادة الضبط',
  },
};
// modes (p, company, staff)
const MODES = [
  { mode: 'color', label: 'ألوان', tag: 'SC-07' },
  { mode: 'gray', label: 'رمادي', tag: 'SC-08' },
  { mode: 'bw', label: 'أبيض وأسود', tag: 'SC-09' },
];

export function registerOf(address) {
  return SCAN_COPY[address] ? address : 'f';
}

export function loadScanStyles() {
  try {
    if (document.querySelector('link[data-scn-css]')) return;
    const href = new URL('../../css/v12-media.css', import.meta.url).pathname;
    document.head.append(h('link', { rel: 'stylesheet', href, 'data-scn-css': '1' }));
  } catch {
    /* المكوّن يعمل بلا تنسيقه */
  }
}

/** note under a thumb when the page is cut or not found */
export function scanNote(page, { register = 'f', onRetake, onKeep } = {}) {
  if (!page || (page.state !== 'partial' && page.state !== 'notfound')) return null;
  const t = SCAN_COPY[registerOf(register)];
  return h(
    'div.scn-note',
    { role: 'status', tag: 'SC-14' },
    h('p.scn-note__t', page.state === 'partial' ? t.partial : t.notFound),
    h(
      'div.scn-note__acts',
      onRetake && h('button.scn-btn.scn-btn--line.scn-btn--sm', { type: 'button', onClick: onRetake, tag: 'SC-15' }, t.retake),
      onKeep && h('button.scn-btn.scn-btn--text.scn-btn--sm', { type: 'button', onClick: onKeep, tag: 'SC-16' }, t.keep),
    ),
  );
}

/** «صفحة أخرى»: next photo = a page of the same document; hint (JR-09) beside it */
export function addPageButton({ register = 'p', onClick, disabled = false, hint = false } = {}) {
  const t = SCAN_COPY[registerOf(register)];
  const btn = h('button.scn-btn.scn-btn--line.scn-btn--sm.scn-add', { type: 'button', onClick, disabled, tag: 'SC-17' }, t.addPage || P.addPage);
  return hint && t.addHint ? h('div.scn-add-row', h('span.scn-add__hint', { tag: 'SC-21' }, t.addHint), btn) : btn;
}

/** page count badge */
export function pagesBadge(n) {
  return h('span.scn-pages', { tag: 'SC-18' }, pagesAr(n));
}

/** preparing text (L12-58) */
export function prepText(register, i = 1, n = 1) {
  const t = SCAN_COPY[registerOf(register)];
  return n > 1 && t.batch ? t.batch(i, n) : t.preparing;
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const DEFAULT_QUAD = [
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
];
let uid = 0;

/** opens the sheet on a page; «تم» re-renders with the chosen corners, mode and turns */
export function editPage(page, { register = 'p', trigger = null, maxSide = 1754, quality = 0.7, sourceMax = 2400 } = {}) {
  loadScanStyles();
  const t = SCAN_COPY[registerOf(register)];
  return session(
    page.raw,
    (s) =>
      new Promise((resolve) => {
        const n = ++uid;
        const hintId = `scn-h-${n}`;
        const keysId = `scn-k-${n}`;
        let pts = (page.quad || page.detected || DEFAULT_QUAD).map((p) => [p[0], p[1]]);
        let mode = page.mode || 'auto';
        let turns = Number.isInteger(page.turns) ? page.turns : null;
        let selected = -1;
        let previewUrl = null;
        let imgUrl = null;
        let ticket = 0;
        let timer = 0;
        let finished = false;

        const img = h('img.scn__img', { alt: '', draggable: 'false' });
        const poly = svg('polygon');
        const shape = svg('svg.scn__poly', { viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, poly);
        const handles = t.corners.map((label, i) =>
          h('button.scn-handle', { type: 'button', 'aria-label': label, 'aria-describedby': `${hintId} ${keysId}`, 'aria-pressed': 'false', dataset: { i }, tag: 'SC-04' }),
        );
        const frame = h('div.scn__frame', img, shape, handles);
        const stage = h('div.scn__stage', frame);
        const result = h('img.scn__result', { alt: t === SCAN_COPY.f || t === SCAN_COPY.m ? 'الورقة بعد التحسين' : 'المستند بعد التحسين', hidden: true, tag: 'SC-05' });
        const modeBtns = t.modes
          ? MODES.map((m) =>
              h('button.scn-btn.scn-btn--seg', { type: 'button', 'aria-pressed': String((page.outMode || '') === m.mode), onClick: () => setMode(m.mode), tag: m.tag }, m.label),
            )
          : [];
        const doneBtn = h('button.scn-btn.scn-btn--primary', { type: 'button', onClick: () => finish('done'), tag: 'SC-12' }, t.done);
        const root = h(
          'div.scn',
          { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': hintId, tag: 'SC-01' },
          h(
            'div.scn__bar',
            h('p.scn__hint', { id: hintId, tag: 'SC-02' }, t.handles),
            h('button.scn__close', { type: 'button', 'aria-label': 'إغلاق', onClick: () => finish('cancel'), tag: 'SC-03' }, svg('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'aria-hidden': 'true' }, svg('path', { d: 'M18 6 6 18M6 6l12 12' }))),
          ),
          h('p.scn-sr', { id: keysId }, t.keys),
          stage,
          t.modes && h('div.scn__modes', { role: 'group', 'aria-label': 'الألوان', tag: 'SC-06' }, modeBtns),
          h(
            'div.scn__tools',
            result,
            h('button.scn-btn.scn-btn--line', { type: 'button', onClick: rotateOnce, tag: 'SC-10' }, t.rotate),
            t.reset && h('button.scn-btn.scn-btn--text', { type: 'button', onClick: reset, tag: 'SC-13' }, t.reset),
          ),
          h(
            'div.scn__actions',
            h('button.scn-btn.scn-btn--text', { type: 'button', onClick: () => finish('asis'), tag: 'SC-11' }, t.keep),
            doneBtn,
          ),
        );

        function place() {
          handles.forEach((b, i) => {
            b.style.setProperty('--x', String(pts[i][0]));
            b.style.setProperty('--y', String(pts[i][1]));
          });
          poly.setAttribute('points', pts.map(([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`).join(' '));
        }
        function layout() {
          const box = stage.getBoundingClientRect();
          const pad = 48;
          const aw = Math.max(40, box.width - pad);
          const ah = Math.max(40, box.height - pad);
          const aspect = s.width / s.height;
          const fw = Math.min(aw, ah * aspect);
          frame.style.setProperty('--fw', `${Math.round(fw)}px`);
          frame.style.setProperty('--fh', `${Math.round(fw / aspect)}px`);
        }
        function select(i) {
          selected = i;
          handles.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
        }
        function changed() {
          place();
          clearTimeout(timer);
          timer = setTimeout(refresh, 250);
        }
        async function refresh() {
          const my = ++ticket;
          try {
            const r = await s.render({ quad: pts, mode, turns, maxSide: 360, quality: 0.6 });
            if (my !== ticket || finished) return;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(r.blob);
            result.src = previewUrl;
            result.hidden = false;
            if (turns === null) turns = r.turns;
            modeBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(MODES[k].mode === r.mode)));
          } catch {
            if (my === ticket) result.hidden = true;
          }
        }
        function setMode(m) {
          mode = m;
          modeBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(MODES[k].mode === m)));
          changed();
        }
        function rotateOnce() {
          turns = ((turns ?? 0) + 1) % 4;
          changed();
        }
        function reset() {
          pts = (page.detected || DEFAULT_QUAD).map((p) => [p[0], p[1]]);
          mode = 'auto';
          turns = null;
          select(-1);
          changed();
        }

        // drag / touch
        let drag = null;
        let suppressClick = false;
        frame.addEventListener('pointerdown', (e) => {
          const hb = e.target.closest?.('.scn-handle');
          const r = frame.getBoundingClientRect();
          if (hb) {
            const i = handles.indexOf(hb);
            drag = { i, id: e.pointerId, sx: e.clientX, sy: e.clientY, p0: pts[i].slice(), moved: false, r };
            try {
              hb.setPointerCapture(e.pointerId);
            } catch {
              /* لا شيء */
            }
            return;
          }
          if (selected >= 0 && r.width && r.height) {
            e.preventDefault();
            pts[selected] = [clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height)];
            const i = selected;
            select(-1);
            changed();
            handles[i].focus();
          }
        });
        frame.addEventListener('pointermove', (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          const dx = e.clientX - drag.sx;
          const dy = e.clientY - drag.sy;
          if (!drag.moved && Math.hypot(dx, dy) < 6) return;
          drag.moved = true;
          e.preventDefault();
          pts[drag.i] = [clamp01(drag.p0[0] + dx / drag.r.width), clamp01(drag.p0[1] + dy / drag.r.height)];
          place();
        });
        const endDrag = (e) => {
          if (!drag || e.pointerId !== drag.id) return;
          if (drag.moved) {
            suppressClick = true;
            select(-1);
            changed();
          }
          drag = null;
        };
        frame.addEventListener('pointerup', endDrag);
        frame.addEventListener('pointercancel', endDrag);
        handles.forEach((b, i) => {
          b.addEventListener('click', () => {
            if (suppressClick) {
              suppressClick = false;
              return;
            }
            select(selected === i ? -1 : i);
          });
          b.addEventListener('keydown', (e) => {
            const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (!d) return;
            e.preventDefault();
            const r = frame.getBoundingClientRect();
            const step = e.shiftKey ? 16 : 4;
            pts[i] = [clamp01(pts[i][0] + (d[0] * step) / (r.width || 1)), clamp01(pts[i][1] + (d[1] * step) / (r.height || 1))];
            changed();
          });
        });

        // open / close
        const onKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            if (selected >= 0) select(-1);
            else finish('cancel');
            return;
          }
          if (e.key !== 'Tab') return;
          const f = [...root.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
          if (!f.length) return;
          const first = f[0];
          const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        };
        const onResize = () => layout();

        async function finish(action) {
          if (finished) return;
          if (action === 'done') {
            doneBtn.disabled = true;
            doneBtn.setAttribute('aria-busy', 'true');
            try {
              const r = await s.render({ quad: pts, mode, turns, maxSide, quality });
              finished = true;
              close();
              resolve({ action: 'done', page: applyRender(page, pts, mode, r) });
            } catch {
              doneBtn.disabled = false;
              doneBtn.removeAttribute('aria-busy');
              finished = true;
              close();
              resolve({ action: 'cancel' });
            }
            return;
          }
          finished = true;
          close();
          resolve({ action });
        }
        function close() {
          clearTimeout(timer);
          document.removeEventListener('keydown', onKey, true);
          window.removeEventListener('resize', onResize);
          root.remove();
          document.documentElement.classList.remove('scn-open');
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          if (imgUrl) URL.revokeObjectURL(imgUrl);
          try {
            trigger?.focus?.();
          } catch {
            /* لا شيء */
          }
        }

        document.documentElement.classList.add('scn-open');
        document.body.append(root);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        layout();
        place();
        doneBtn.focus();
        s.preview({ maxSide: 900 })
          .then((b) => {
            if (finished) return;
            imgUrl = URL.createObjectURL(b);
            img.src = imgUrl;
          })
          .catch(() => {});
        refresh();
      }),
    { sourceMax },
  );
}
