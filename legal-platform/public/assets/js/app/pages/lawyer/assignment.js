// بوابة المحامي — صفحة الإسناد (الإصدار 9.1، L-04): يُفهم الإسناد في دقيقة، ويُطلب أي شيء من أي موضع.
// كل ما يُعرض هنا مبني من المنح الصريحة للإدارة (src/services/visibility.js). المحامي لا يرى بيانات اتصال
// المستفيد/ة ولا يتواصل معه، ولا يغلق الملف: يطلب من خلال المنصة، ويكتب رأيه في وضع الكتابة (#/my/assignments/:id/write).
//
// الهاتف: ترويسة (العنوان، المجال والدور، موعد التسليم) + شريط مقاطع «الملف | رأيي | الطلبات» + شريط إجراء سفلي.
// الحاسوب (≥ 1024px): «الملف» في العمود الرئيسي، و«رأيي» و«الطلبات» في عمود جانبي 380px.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, shortDate, dateTime, time, relative, money, num, isoToCairoDate, cairoToday } from '../../../lib/fmt.js';
import { alertBox, button, toast, modal, confirmDialog, formDialog, field, emptyState, errorState, icon, richText, uid, errorMessage, setBusy } from '../../../lib/ui.js';
import { count, deadline, requestStatus, counselStatus } from '../../words.js';
import { docRow, openDocument } from '../../components/doc-viewer.js';
import { openRequestSheet } from '../../components/request-sheet.js';
import { createDraftStore, wordCount, parseReviewNotes } from '../../components/draft-store.js';

const EDITABLE = ['assigned', 'in_progress', 'returned'];
const SEGMENTS = [
  { key: 'file', label: 'الملف' },
  { key: 'mine', label: 'رأيي' },
  { key: 'requests', label: 'الطلبات' },
];
const PRIVACY_LINE = 'تصل طلباتك للإدارة، وهي التي تتواصل مع المستفيد/ة.';
const KIND_CHIP = { document: 'مستند', information: 'معلومة', extension: 'مهلة', admin_question: 'سؤال للإدارة' };
const KIND_HINTS = {
  second_opinion: 'رأي مستقل من محامٍ آخر في نفس المسائل للتحقق من النتيجة.',
  specialist_input: 'رأي محامٍ متخصص في مجال آخر بشأن مسألة محددة (مثل الضرائب أو العمل).',
  document_review: 'مراجعة مستند أو عقد بعينه من محامٍ مختص.',
  co_counsel: 'مشاركة محامٍ في دراسة مسألة معقدة إلى جانبك.',
};
const DAY_MS = 86400000;

/** يغلف معالج نقر غير متزامن: أي خطأ يظهر في رسالة بدل أن يضيع. */
const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    if (!(err && err.name === 'AbortError')) toast(errorMessage(err), 'danger');
  }
};

function readSession(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* تفضيل على الجهاز فقط */
  }
}

/** نص عربي قد يحتوي مصطلحًا لاتينيًا بين قوسين («رأي متخصص (Specialist)»): يُعزل الجزء اللاتيني */
function bidiText(text) {
  return String(text ?? '')
    .split(/(\([A-Za-z][^()]*\))/)
    .filter((p) => p !== '')
    .map((p) => (/^\([A-Za-z]/.test(p) ? h('span.nowrap', { dir: 'ltr' }, p) : p));
}

/** كود الملف كاملًا باتجاه LTR دون التفاف */
const codeBdi = (code) => h('bdi.lw-code', { dir: 'ltr' }, code);

/** وقت الحفظ: الساعة فقط إن كان اليوم، وإلا التاريخ المختصر والساعة */
function savedAt(iso) {
  if (!iso) return '';
  return isoToCairoDate(iso) === cairoToday() ? time(iso) : `${shortDate(iso)} ${time(iso)}`;
}

/** مدة التأخر: «3 ساعات» قبل يوم كامل، ثم «يومًا» / «يومين» / «3 أيام» */
function overdueText(dueIso) {
  const diff = Date.now() - new Date(dueIso).getTime();
  if (diff < DAY_MS) return count(Math.max(1, Math.round(diff / 3600000)), ['ساعة', 'ساعتين', 'ساعات', 'ساعة']);
  return count(Math.max(1, Math.floor(diff / DAY_MS)), ['يومًا', 'يومين', 'أيام', 'يومًا']);
}

/** تنظيف المستمعات حين تغادر الصفحة (لا يوفر الموجّه خطاف إزالة) */
function lifecycle(isCurrent) {
  const fns = [];
  const check = () => {
    if (isCurrent()) return;
    window.removeEventListener('hashchange', check);
    while (fns.length) {
      try {
        fns.pop()();
      } catch {
        /* لا شيء */
      }
    }
  };
  window.addEventListener('hashchange', check);
  return { add: (fn) => fns.push(fn), destroy: () => { while (fns.length) fns.pop()(); window.removeEventListener('hashchange', check); } };
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const base = `/lawyer/assignments/${encodeURIComponent(id)}`;
  const pagePath = `/my/assignments/${id}`;

  let view;
  try {
    view = await api.get(base);
    // أول فتح يُسجَّل بصمت (يبدأ احتساب العمل ويظهر للإدارة)
    if (view && view.assignment && !view.assignment.first_opened_at) {
      view = await api.post(`${base}/open`);
      ctx.refreshShell();
    }
  } catch (err) {
    return h('div.lw-asg', h('h1.lw-asg-title', 'الإسناد'), errorState(err, () => ctx.reload()));
  }

  ctx.setTitle(view.case.code);
  const claude = !!(view.ai && view.ai.claude);
  const user = ctx.user || {};
  const store = user.id ? createDraftStore({ userId: user.id, assignmentId: id, code: view.case.code }) : null;
  const life = lifecycle(() => {
    const p = String(window.location.hash).replace(/^#!?/, '').split('?')[0].replace(/\/+$/, '');
    return p === pagePath;
  });

  const segKey = `lw-seg:${id}`;
  let seg = ['file', 'mine', 'requests'].includes(ctx.query.tab) ? ctx.query.tab : readSession(segKey) || 'file';
  if (!SEGMENTS.some((s) => s.key === seg)) seg = 'file';
  let freshRequestId = null;

  const root = h('div.lw-asg');
  const hosts = {
    header: h('div.lw-asg-header'),
    segs: h('div.lw-seg-wrap'),
    file: h('section.lw-pane', { id: uid('lw-pane-file'), dataset: { pane: 'file' }, role: 'tabpanel', tabindex: '-1' }),
    mine: h('section.lw-pane', { id: uid('lw-pane-mine'), dataset: { pane: 'mine' }, role: 'tabpanel', tabindex: '-1' }),
    requests: h('section.lw-pane', { id: uid('lw-pane-req'), dataset: { pane: 'requests' }, role: 'tabpanel', tabindex: '-1' }),
    bar: h('div.lw-actionbar-host'),
  };

  // ───────────── البيانات المشتقة ─────────────

  const status = () => view.assignment.status;
  const closed = () => view.case.state === 'closed';
  const editable = () => !!view.permissions.can_edit;
  const canRequest = () => !!view.permissions.can_request;
  const returnedOpinion = () => [...(view.my_opinions || [])].reverse().find((o) => o.status === 'returned') || null;
  const isReturned = () => status() === 'returned' && !!returnedOpinion();
  const draftWords = () => wordCount(view.current_draft ? view.current_draft.body : '');
  const writeHref = `#${pagePath}/write`;

  async function refresh(parts = ['header', 'file', 'mine', 'requests', 'bar']) {
    const y = window.scrollY;
    view = await api.get(base);
    draw(parts);
    requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    });
    // التمييز يظهر مرة واحدة فقط للطلب الجديد
    if (freshRequestId) setTimeout(() => (freshRequestId = null), 3000);
  }

  function draw(parts = ['header', 'segs', 'file', 'mine', 'requests', 'bar']) {
    if (parts.includes('header')) mount(hosts.header, headerNode());
    if (parts.includes('segs') || parts.includes('requests')) mount(hosts.segs, segmentsNode());
    if (parts.includes('file')) mount(hosts.file, filePane());
    if (parts.includes('mine')) mount(hosts.mine, minePane());
    if (parts.includes('requests')) mount(hosts.requests, requestsPane());
    if (parts.includes('bar')) mount(hosts.bar, actionBar());
    applySegment();
  }

  // ───────────── الترويسة ─────────────

  function deadlineLine() {
    const a = view.assignment;
    if (closed()) return h('p.lw-due.is-muted', icon('lock', { size: 16 }), h('span', 'أغلقت الإدارة هذا الملف — للقراءة فقط.'));
    if (a.status === 'submitted') {
      const since = a.submitted_at ? relative(a.submitted_at) : '';
      return h('p.lw-due', icon('clock', { size: 18 }), h('span', `عند الإدارة للمراجعة ${since === 'الآن' ? 'منذ قليل' : since}`.trim()));
    }
    if (a.status === 'approved') {
      return h('p.lw-due.is-ok', icon('checkCircle', { size: 18 }), h('span', `اعتمدت الإدارة رأيك ${a.approved_at ? shortDate(a.approved_at) : ''}`.trim()));
    }
    if (!a.due_at || !EDITABLE.includes(a.status)) return null;
    const overdue = new Date(a.due_at).getTime() < Date.now();
    const pending = pendingExtension();
    if (overdue) {
      return frag(
        h(
          'p.lw-due.is-late',
          icon('alert', { size: 18 }),
          h('span', `متأخر ${overdueText(a.due_at)} — كان الموعد ${deadline(a.due_at)}`),
          canRequest() && !pending ? h('button.lw-due-link', { type: 'button', onClick: () => openSheet({ kind: 'extension' }) }, 'اطلب مهلة') : null,
        ),
        extensionNote(pending),
      );
    }
    return frag(h('p.lw-due', icon('clock', { size: 18 }), h('span', `سلّم رأيك قبل ${deadline(a.due_at)}`), h('span.lw-due-chip', relative(a.due_at))), extensionNote(pending));
  }

  /** طلب مهلة عند الإدارة: يظهر تحت الموعد مباشرة (حيث سيتغير الموعد إن وافقت الإدارة) */
  function pendingExtension() {
    return (view.info_requests || []).find((r) => r.own && r.kind === 'extension' && r.status === 'pending_admin') || null;
  }
  function extensionNote(p) {
    if (!p || !p.requested_due_at) return null;
    return h('p.lw-due-ext', icon('clock', { size: 16 }), h('span', `طلبت مهلة حتى ${dayOnly(p.requested_due_at)} — عند الإدارة`));
  }

  function headerNode() {
    const a = view.assignment;
    const c = view.case;
    const meta = [c.legal_area_label || areaLabel(c.legal_area), a.role_label || label('assignment_role', a.role)];
    if (c.priority === 'high' || c.priority === 'urgent') meta.push(`أولوية ${label('priority', c.priority)}`);
    const ret = isReturned() ? returnedOpinion() : null;
    const notes = ret ? parseReviewNotes(ret.review_note) : [];
    return frag(
      h('nav.lw-crumbs', { 'aria-label': 'مسار التنقل' }, h('a', { href: '#/my' }, 'إسناداتي'), h('span', { 'aria-hidden': 'true' }, ' › '), codeBdi(c.code)),
      h('h1.lw-asg-title', { dir: 'auto' }, c.title),
      h('p.lw-asg-meta', meta.join(' · ')),
      deadlineLine(),
      ret &&
        h(
          'div.lw-returned',
          h('p.lw-returned-title', icon('refresh', { size: 18 }), h('span', `أعادت الإدارة رأيك — ${count(Math.max(1, notes.length), 'note')}`)),
          notes[0] && h('p.lw-returned-preview', { dir: 'auto' }, notes[0]),
          editable() ? button('ابدأ التعديل', { variant: 'primary', icon: 'edit', href: writeHref, className: 'lw-returned-btn' }) : null,
        ),
    );
  }

  // ───────────── شريط المقاطع ─────────────

  function segmentsNode() {
    const newCount = (view.info_requests || []).filter((r) => r.is_new).length;
    const list = h(
      'div.lw-seg',
      { role: 'tablist', 'aria-label': 'أقسام الإسناد' },
      SEGMENTS.map((s) =>
        h(
          'button.lw-seg-btn',
          {
            type: 'button',
            role: 'tab',
            id: `lw-seg-${s.key}`,
            'aria-selected': String(seg === s.key),
            'aria-controls': hosts[s.key].id,
            tabindex: seg === s.key ? '0' : '-1',
            onClick: () => setSegment(s.key, true),
            onKeydown: (e) => {
              const i = SEGMENTS.findIndex((x) => x.key === seg);
              // RTL: السهم الأيسر يتقدم
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const step = e.key === 'ArrowLeft' ? 1 : -1;
                const next = SEGMENTS[(i + step + SEGMENTS.length) % SEGMENTS.length].key;
                setSegment(next, true);
                root.querySelector(`#lw-seg-${next}`)?.focus();
              }
            },
          },
          s.label,
          s.key === 'requests' && newCount ? h('span.lw-seg-dot', { 'aria-label': `${num(newCount)} جديد` }, num(newCount)) : null,
        ),
      ),
    );
    return list;
  }

  function setSegment(key, scrollTop) {
    seg = key;
    writeSession(segKey, key);
    mount(hosts.segs, segmentsNode());
    applySegment();
    if (scrollTop) {
      const top = hosts.segs.getBoundingClientRect().top + window.scrollY - 64;
      if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
    }
  }

  function applySegment() {
    root.dataset.seg = seg;
    for (const s of SEGMENTS) hosts[s.key].classList.toggle('is-active', s.key === seg);
  }

  // ───────────── «الملف» ─────────────

  function section(title, body, { className, extra } = {}) {
    return h('section.lw-sec', { class: className }, h('div.lw-sec-head', h('h2.lw-sec-title', title), extra || null), body);
  }

  function briefNode() {
    const a = view.assignment;
    const rb = view.requested_by;
    return h(
      'section.lw-brief',
      h('h2.lw-sec-title', icon('flag', { size: 18 }), 'المطلوب منك'),
      a.brief ? h('p.lw-brief-text.pre', { dir: 'auto' }, richText(a.brief)) : h('p.lw-muted', 'لم تحدد الإدارة تكليفًا تفصيليًا؛ ادرس المسائل المتاحة لك وأبدِ رأيك فيها.'),
      rb && h('p.lw-brief-by', `بطلب من ${rb.lawyer_name} — `, bidiText(rb.kind_label || label('counsel_kind', rb.kind)), rb.specialty_label ? ` — ${rb.specialty_label}` : ''),
    );
  }

  function factsNode() {
    const who = view.client_label
      ? h('p.lw-client', 'المستفيد/ة: ', h('strong', view.client_label))
      : h('p.lw-client.is-muted', 'اسم المستفيد/ة محجوب للخصوصية.');
    if (!view.facts_granted) return section('الوقائع', frag(who, h('p.lw-muted', 'لم تُتح لك الإدارة ملخص الوقائع في هذا الإسناد.')));
    if (!view.facts) return section('الوقائع', frag(who, h('p.lw-muted', 'لم تُضف الإدارة ملخصًا للوقائع بعد.')));
    const id = uid('lw-facts');
    const text = h('div.lw-facts.is-clamped.pre', { id, dir: 'auto' }, richText(view.facts));
    const more = h('button.lw-more', { type: 'button', 'aria-expanded': 'false', 'aria-controls': id }, 'اقرأ الباقي');
    more.addEventListener('click', () => {
      const open = text.classList.toggle('is-clamped') === false;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'اطوِ النص' : 'اقرأ الباقي';
    });
    // يظهر «اقرأ الباقي» فقط إن كان النص أطول من 8 أسطر
    requestAnimationFrame(() => {
      if (text.scrollHeight <= text.clientHeight + 2) {
        more.hidden = true;
        text.classList.remove('is-clamped');
      }
    });
    return section('الوقائع', frag(who, text, more));
  }

  function issuesNode() {
    const list = view.issues || [];
    const canPropose = !closed() && canRequest();
    const propose = canPropose ? h('button.lw-link', { type: 'button', onClick: safe(proposeIssue) }, icon('plus', { size: 16 }), 'اقترح مسألة') : null;
    if (!list.length) return section('المسائل', frag(h('p.lw-muted', 'لم تُتح لك مسائل محددة في هذا الإسناد.'), propose));
    return section(
      'المسائل',
      frag(
        h(
          'ol.lw-issues',
          list.map((i) =>
            h(
              'li.lw-issue',
              { class: i.status === 'proposed' && 'is-proposed' },
              h('span.lw-issue-num', { 'aria-hidden': 'true' }, num(i.number)),
              h(
                'span.lw-issue-text',
                h('span.sr-only', `المسألة ${i.number}: `),
                h('span', { dir: 'auto' }, i.title),
                i.status === 'proposed' ? h('span.lw-tag', 'مقترحة — بانتظار الإدارة') : null,
                i.legal_area && i.legal_area !== view.case.legal_area ? h('span.lw-tag', areaLabel(i.legal_area)) : null,
              ),
            ),
          ),
        ),
        propose,
      ),
    );
  }

  async function proposeIssue() {
    const res = await formDialog({
      title: 'اقتراح مسألة',
      intro: 'تعتمدها الإدارة قبل إضافتها إلى الملف.',
      submitLabel: 'أرسل الاقتراح',
      fields: [
        { name: 'title', label: 'عنوان المسألة', required: true, maxLength: 300, placeholder: 'مثال: مدى صحة عقد البيع الابتدائي غير المسجل في مواجهة الورثة' },
        { name: 'details', label: 'لماذا تقترحها؟ (اختياري)', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      onSubmit: (vals) => api.post(`${base}/issues`, { title: vals.title, details: vals.details || undefined }),
    });
    if (!res) return;
    toast(`أُرسل اقتراح المسألة ${num(res.number)} للإدارة`, 'success');
    await refresh(['file']);
  }

  const analyzeDoc = (d) => {
    import('../../components/doc-ai.js')
      .then((m) =>
        m.openDocAi({
          documentId: d.id,
          scope: 'lawyer',
          onView: () => openDocument(d),
          onRequestDoc: canRequest() ? (text) => openSheet({ kind: 'document', prefill: text }) : null,
        }),
      )
      .catch((err) => toast(errorMessage(err), 'danger'));
  };
  const rowOpts = (d) => ({ claude: claude && d.granted !== false, onAnalyze: analyzeDoc });

  function docsNode() {
    const docs = view.documents || [];
    return section(
      `المستندات (${num(docs.length)})`,
      docs.length
        ? h('ul.lw-docs', docs.map((d) => docRow(d, rowOpts(d))))
        : h('p.lw-muted', 'لم تُتح لك الإدارة مستندات بعد. اطلب ما تحتاجه من «اطلب».'),
    );
  }

  function teamNode() {
    const team = view.team || [];
    if (!team.length) return null;
    return section(
      `آراء الزملاء (${num(team.length)})`,
      h(
        'div.lw-team',
        team.map((t) => {
          const st = t.opinion ? label('opinion_status', t.opinion.status) : 'لم يُقدَّم بعد';
          const summary = h('summary.lw-team-row', h('span.lw-team-who', [t.lawyer_name, t.role_label || label('assignment_role', t.role), st].filter(Boolean).join(' · ')), icon('chevronDown', { size: 18, className: 'lw-chev' }));
          return h(
            'details.lw-team-item',
            summary,
            h(
              'div.lw-team-body',
              t.brief ? h('p.lw-muted', 'المطلوب منه: ', t.brief) : null,
              t.opinion ? h('div.lw-opinion-read.pre', { dir: 'auto' }, richText(t.opinion.body)) : h('p.lw-muted', 'سيصلك إشعار عند تقديم رأيه.'),
            ),
          );
        }),
      ),
    );
  }

  function feeLine() {
    const a = view.assignment;
    let fee = 'حسب اتفاقك';
    if (a.fee_mode === 'pro_bono') fee = 'تطوعًا دون مقابل';
    else if (a.fee_mode === 'custom' && a.fee_amount != null) fee = money(a.fee_amount);
    return h('p.lw-fee', `الأتعاب: ${fee}`);
  }

  function filePane() {
    return frag(briefNode(), factsNode(), issuesNode(), docsNode(), teamNode(), feeLine());
  }

  // ───────────── «رأيي» ─────────────

  function versionLine(o) {
    if (o.status === 'returned') return `الإصدار ${num(o.version)} — أُعيد بملاحظات ${o.reviewed_at ? shortDate(o.reviewed_at) : ''}`.trim();
    if (o.status === 'approved') return `الإصدار ${num(o.version)} — اعتمدته الإدارة ${o.reviewed_at ? shortDate(o.reviewed_at) : ''}`.trim();
    if (o.status === 'submitted') return `الإصدار ${num(o.version)} — قُدّم ${o.submitted_at ? shortDate(o.submitted_at) : ''}`.trim();
    if (o.status === 'draft') return `الإصدار ${num(o.version)} — مسودة`;
    return `الإصدار ${num(o.version)} — ${label('opinion_status', o.status)}`;
  }

  function minePane() {
    const ops = view.my_opinions || [];
    const draft = view.current_draft;
    const parts = [];
    if (editable()) {
      const body = draft ? draft.body : '';
      const local = store ? store.load() : null;
      const lines = body.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3);
      parts.push(
        h(
          'div.lw-mine-card',
          h('h2.lw-sec-title', draft ? `رأيي · الإصدار ${num(draft.version)}` : 'رأيي'),
          lines.length ? h('div.lw-mine-preview', { dir: 'auto' }, lines.map((l) => h('p', l))) : h('p.lw-muted', 'لم تبدأ كتابة رأيك بعد.'),
          draft ? h('p.lw-mine-meta', `${count(draftWords(), 'word')} · محفوظ ${savedAt(draft.updated_at)}`) : null,
          local && local.body !== body ? h('p.lw-mine-local', icon('alert', { size: 16 }), h('span', 'على هذا الجهاز نص لم يُحفظ على المنصة بعد؛ افتح الكتابة لحفظه.')) : null,
          button(lines.length ? 'أكمل الكتابة' : 'ابدأ الكتابة', { variant: 'primary', icon: 'edit', href: writeHref, block: true }),
        ),
      );
    } else {
      const latest = [...ops].reverse().find((o) => o.status !== 'draft' && o.status !== 'superseded') || null;
      if (latest) {
        parts.push(
          h(
            'div.lw-mine-card',
            h('h2.lw-sec-title', versionLine(latest)),
            latest.review_note ? h('div.lw-review-note', h('strong', latest.status === 'returned' ? 'ملاحظات الإدارة: ' : 'ملاحظة الإدارة: '), richText(latest.review_note)) : null,
            h('div.lw-opinion-read.pre', { dir: 'auto' }, richText(latest.body)),
          ),
        );
      } else parts.push(h('p.lw-muted', closed() ? 'أُغلق الملف دون رأي منك.' : 'لم تقدّم رأيًا في هذا الملف.'));
      // نص بقي على هذا الجهاز ولم يعد يمكن حفظه (قُدّم الرأي من جهاز آخر أو أُغلق الملف): ينسخه المحامي أو يحذفه
      const local = store ? store.load() : null;
      const shownBody = latest ? latest.body : '';
      if (local && local.body && local.body.trim() && local.body !== shownBody) parts.push(orphanNote(local));
    }
    const shownId = editable() ? draft && draft.id : (([...ops].reverse().find((o) => o.status !== 'draft' && o.status !== 'superseded')) || {}).id;
    const older = [...ops].filter((o) => o.id !== shownId).reverse();
    if (older.length) {
      parts.push(
        h(
          'details.lw-versions',
          h('summary', h('span', `الإصدارات السابقة (${num(older.length)})`), icon('chevronDown', { size: 18, className: 'lw-chev' })),
          h(
            'div.lw-versions-list',
            older.map((o) =>
              h(
                'details.lw-version',
                h('summary', versionLine(o)),
                o.review_note ? h('div.lw-review-note', { class: o.status === 'returned' && 'is-returned' }, h('strong', o.status === 'returned' ? 'ملاحظات الإدارة: ' : 'ملاحظة الإدارة: '), richText(o.review_note)) : null,
                h('div.lw-opinion-read.pre', { dir: 'auto' }, richText(o.body)),
              ),
            ),
          ),
        ),
      );
    }
    return frag(parts);
  }

  function orphanNote(local) {
    const copy = async () => {
      let done = false;
      try {
        await navigator.clipboard.writeText(local.body);
        done = true;
      } catch {
        done = false;
      }
      toast(done ? 'نُسخ النص؛ يمكنك لصقه حيث تريد.' : 'تعذر النسخ تلقائيًا.', done ? 'success' : 'warning');
    };
    const drop = safe(async () => {
      const ok = await confirmDialog({ title: 'حذف النص من هذا الجهاز؟', message: 'لن يمكن استعادته بعد الحذف.', confirmLabel: 'احذفه', cancelLabel: 'تراجع', danger: true });
      if (!ok) return;
      store.clear();
      mount(hosts.mine, minePane());
    });
    return h(
      'div.lw-mine-orphan',
      h('p.lw-mine-local', icon('alert', { size: 16 }), h('span', `على هذا الجهاز نص لم يصل للمنصة (${count(wordCount(local.body), 'word')}) ولم يعد يمكن حفظه هنا.`)),
      h(
        'div.lw-mine-orphan-actions',
        button('انسخ النص', { variant: 'secondary', size: 'sm', icon: 'copy', onClick: copy }),
        button('احذفه من الجهاز', { variant: 'ghost', size: 'sm', icon: 'x', onClick: drop }),
      ),
    );
  }

  // ───────────── «الطلبات» ─────────────

  function cancelInfo(r) {
    return h(
      'button.lw-link.is-danger',
      {
        type: 'button',
        onClick: safe(async (e) => {
          const ok = await confirmDialog({ title: 'إلغاء الطلب', message: 'لن يُعرض هذا الطلب على الإدارة.', confirmLabel: 'ألغِ الطلب', cancelLabel: 'تراجع', danger: true });
          if (!ok) return;
          setBusy(e.target.closest('button'), true);
          await api.post(`/lawyer/info-requests/${encodeURIComponent(r.id)}/cancel`);
          toast('أُلغي الطلب', 'success');
          await refresh(['requests']);
        }),
      },
      'ألغِ الطلب',
    );
  }

  function statusText(r) {
    if (r.kind === 'extension') {
      const until = r.requested_due_at ? dayOnly(r.requested_due_at) : '';
      if (r.status === 'pending_admin') return { text: `طلب مهلة حتى ${until} — عند الإدارة`, tone: 'wait' };
      if (r.status === 'shared' && r.extension_applied) return { text: `وافقت الإدارة: الموعد الجديد ${deadline(r.requested_due_at)}`, tone: 'ok' };
      if (r.status === 'shared') return { text: `ردّ الإدارة: ${r.response_text || ''}`, tone: 'ok' };
    }
    if (r.kind === 'admin_question' && r.status === 'shared') return { text: `ردّ الإدارة: ${r.response_text || ''}`, tone: 'ok' };
    // «أحتاج هذا أيضًا»: لا شيء عند الإدارة لتفعله الآن — الرد يصله تلقائيًا حين يصل من المستفيد/ة
    if (r.duplicate_of_id && r.status === 'pending_admin') return { text: 'سيصلك الرد نفسه عند وصوله', tone: 'wait' };
    const tone = r.status === 'shared' ? 'ok' : r.status === 'rejected' ? 'bad' : r.status === 'cancelled' ? 'muted' : 'wait';
    return { text: requestStatus(r.status, r.admin_note), tone };
  }

  function dayOnly(iso) {
    return deadline(iso).split('،')[0];
  }

  function itemsLine(r) {
    const items = r.items || [];
    if (!items.length) return null;
    if (r.status !== 'shared' || !items.some((it) => it.status)) return h('ul.lw-items', items.map((it) => h('li', { dir: 'auto' }, it.label)));
    const got = items.filter((it) => it.status === 'received').map((it) => it.label);
    const miss = items.filter((it) => it.status !== 'received').map((it) => it.label);
    return h('p.lw-items-status', [got.length ? `وصل: ${got.join('، ')}` : null, miss.length ? `ناقص: ${miss.join('، ')}` : null].filter(Boolean).join(' · '));
  }

  function infoRow(r) {
    const st = statusText(r);
    const isDup = !!r.duplicate_of_id;
    const chip = isDup ? 'أحتاج هذا أيضًا' : KIND_CHIP[r.kind] || r.kind_label;
    let text = r.question;
    if (isDup) {
      text = String(r.question || '').replace(/^أحتاج هذا أيضًا:\s*/, '');
      // البنود تظهر قائمةً تحت الرسالة (بحالتها بعد الرد)، فلا تُكرر بين قوسين في آخر النص
      if (r.items && r.items.length) text = text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '');
    }
    if (r.kind === 'extension') text = null;
    const docs = r.documents || [];
    const showResponse = r.status === 'shared' && r.response_text && r.kind !== 'extension' && r.kind !== 'admin_question';
    return h(
      'li.lw-reqrow',
      { class: [`is-${st.tone}`, freshRequestId === r.id && 'is-fresh', r.is_new && 'is-new'], dataset: { requestId: r.id } },
      h('div.lw-reqrow-head', h('span.lw-kind', chip), r.is_new ? h('span.lw-new', 'جديد') : null, h('span.lw-reqrow-status', st.text)),
      text && (isDup || !(r.items && r.items.length)) ? h('p.lw-reqrow-text', { dir: 'auto' }, text) : null,
      itemsLine(r),
      showResponse ? h('div.lw-answer', h('strong', 'الرد: '), richText(r.response_text)) : null,
      docs.length ? h('ul.lw-docs.is-tight', docs.map((d) => docRow(d, rowOpts(d)))) : null,
      h('div.lw-reqrow-foot', h('time.lw-muted', { datetime: r.created_at, title: dateTime(r.created_at) }, `طُلب ${shortDate(r.created_at)}`), r.own && r.status === 'pending_admin' ? cancelInfo(r) : null),
    );
  }

  function counselRow(r) {
    return h(
      'li.lw-reqrow',
      { class: r.status === 'rejected' ? 'is-bad' : r.status === 'completed' || r.status === 'assigned' ? 'is-ok' : 'is-wait' },
      h('div.lw-reqrow-head', h('span.lw-kind', bidiText(r.kind_label || label('counsel_kind', r.kind))), h('span.lw-reqrow-status', r.status === 'rejected' && r.admin_note ? `لم توافق الإدارة: ${r.admin_note}` : counselStatus(r.status))),
      h('p.lw-reqrow-text', { dir: 'auto' }, r.description),
      r.assigned_lawyer ? h('p.lw-muted', `أسندته الإدارة إلى ${r.assigned_lawyer}`) : null,
      h(
        'div.lw-reqrow-foot',
        h('time.lw-muted', { datetime: r.created_at }, `طُلب ${shortDate(r.created_at)}`),
        r.status === 'pending_admin'
          ? h(
              'button.lw-link.is-danger',
              {
                type: 'button',
                onClick: safe(async () => {
                  const ok = await confirmDialog({ title: 'إلغاء طلب المساعدة', message: 'لن يُعرض هذا الطلب على الإدارة.', confirmLabel: 'ألغِ الطلب', cancelLabel: 'تراجع', danger: true });
                  if (!ok) return;
                  await api.post(`/lawyer/counsel-requests/${encodeURIComponent(r.id)}/cancel`);
                  toast('أُلغي طلب المساعدة', 'success');
                  await refresh(['requests']);
                }),
              },
              'ألغِ الطلب',
            )
          : null,
      ),
    );
  }

  function alreadyRow(r) {
    return h(
      'li.lw-reqrow.is-wait',
      h('div.lw-reqrow-head', h('span.lw-kind', KIND_CHIP[r.kind] || ''), h('span.lw-reqrow-status', r.status === 'client_replied' ? 'وصل الرد — تراجعه الإدارة' : 'بانتظار الرد')),
      h('p.lw-reqrow-text', { dir: 'auto' }, r.client_message),
      r.items && r.items.length ? h('ul.lw-items', r.items.map((x) => h('li', { dir: 'auto' }, x))) : null,
      h(
        'div.lw-reqrow-foot',
        h('span.lw-muted', `طُلب ${shortDate(r.sent_at)}`),
        r.joined
          ? h('span.lw-joined', icon('checkCircle', { size: 16 }), 'طلبته — سيصلك الرد')
          : canRequest()
            ? button('أحتاج هذا أيضًا', {
                variant: 'secondary',
                size: 'sm',
                className: 'lw-already-btn', // ≥ 44px
                onClick: safe(async (e) => {
                  setBusy(e.currentTarget, true);
                  try {
                    const res = await api.post(`${base}/info-requests`, { duplicate_of_id: r.id, client_ref: `lw-${id}-dup-${r.id}-${Date.now().toString(36)}` });
                    toast('سيصلك الرد نفسه عند وصوله، دون سؤال المستفيد/ة مرة أخرى.', 'success', 5000);
                    freshRequestId = res && res.id;
                    await refresh(['requests']);
                  } finally {
                    setBusy(e.currentTarget, false);
                  }
                }),
              })
            : null,
      ),
    );
  }

  function requestsPane() {
    const all = view.info_requests || [];
    const own = all.filter((r) => r.own);
    const sharedOthers = all.filter((r) => !r.own);
    const counsel = view.counsel_requests || [];
    const already = view.case_open_requests || [];
    const ownRows = [...own.map((r) => ({ at: r.created_at, node: () => infoRow(r) })), ...counsel.map((r) => ({ at: r.created_at, node: () => counselRow(r) }))]
      .sort((x, y) => String(y.at).localeCompare(String(x.at)))
      .map((x) => x.node());
    return frag(
      canRequest() ? button('اطلب', { variant: 'primary', icon: 'plus', block: true, className: 'lw-req-cta', onClick: () => openSheet() }) : null,
      h('p.lw-privacy', icon('shield', { size: 16 }), h('span', PRIVACY_LINE)),
      section('طلباتك', ownRows.length ? h('ul.lw-reqs', ownRows) : h('p.lw-muted', 'لم ترسل طلبات في هذا الملف بعد.')),
      already.length ? section('مطلوب بالفعل من المستفيد/ة', h('ul.lw-reqs', already.map(alreadyRow))) : null,
      sharedOthers.length ? section('ردود متاحة لك', h('ul.lw-reqs', sharedOthers.map(infoRow))) : null,
    );
  }

  function openSheet(opts = {}) {
    if (!canRequest()) return;
    openRequestSheet({
      base,
      view,
      ...opts,
      onCreated: (res) => {
        freshRequestId = res && res.id;
        refresh(['requests', 'header']).catch((err) => toast(errorMessage(err), 'danger'));
      },
      onCounsel: openCounselDialog,
    });
  }

  // ───────────── طلب مساعدة محامٍ آخر (النافذة القائمة دون التنبيه التمهيدي) ─────────────

  function openCounselDialog() {
    const v = view;
    const groupName = uid('ckind');
    const kinds = options('counsel_kind');
    const radios = kinds.map((o) => {
      const input = h('input', { type: 'radio', name: groupName, value: o.value });
      return {
        value: o.value,
        input,
        el: h('label.check.pc-radio', input, h('span.pc-radio-text', h('strong', bidiText(o.label)), KIND_HINTS[o.value] && h('span.pc-radio-hint', KIND_HINTS[o.value]))),
      };
    });
    const kindField = field('نوع المساعدة المطلوبة', h('div.pc-radio-list', radios.map((r) => r.el)), { required: true, group: true, full: true });
    const specSelect = h('select.input', h('option', { value: '' }, '— اختر التخصص —'), areaOptions().map((o) => h('option', { value: o.value }, o.label)));
    const specField = field('التخصص المطلوب', h('div.select-wrap', specSelect), { hint: 'مطلوب عند طلب رأي متخصص.', full: true });
    const issues = (v.issues || []).filter((i) => i.status === 'active');
    const issueBoxes = issues.map((i) => {
      const cb = h('input', { type: 'checkbox', value: String(i.id) });
      return { id: i.id, cb, el: h('label.check', cb, h('span', `${num(i.number)}. ${i.title}`)) };
    });
    const issuesField = issues.length ? field('المسائل التي يتعلق بها الطلب', h('div.pc-check-col', issueBoxes.map((x) => x.el)), { group: true, full: true }) : null;
    const docs = (v.documents || []).filter((d) => d.granted !== false);
    const docBoxes = docs.map((d) => {
      const cb = h('input', { type: 'checkbox', value: String(d.id) });
      return { id: d.id, cb, el: h('label.check', cb, h('span', { dir: 'auto' }, d.title || d.filename)) };
    });
    const docsField = docs.length ? field('المستندات ذات الصلة', h('div.pc-check-col', docBoxes.map((x) => x.el)), { group: true, full: true }) : null;
    const desc = h('textarea.input', { rows: 4, maxlength: 3000, placeholder: 'مثال: أطلب رأيًا متخصصًا في الأثر الضريبي لانتقال الشقة بالميراث ثم بيعها، وبالأخص المسألة رقم 3.' });
    const descField = field('وصف المطلوب', desc, { required: true, full: true, hint: 'تختار الإدارة المحامي وتحدد ما يراه من الملف.' });
    const formAlert = h('div.alert.alert-danger', { role: 'alert', hidden: true });
    const grid = h('div.form-grid.form-grid-1', kindField, specField, issuesField, docsField, descField);
    const selectedKind = () => (radios.find((r) => r.input.checked) || {}).value || null;
    const syncSpec = () => {
      const required = selectedKind() === 'specialist_input';
      specField.classList.toggle('pc-required', required);
      specSelect.required = required;
    };
    radios.forEach((r) => r.input.addEventListener('change', () => { kindField.setError(''); syncSpec(); }));
    specSelect.addEventListener('change', () => specField.setError(''));
    desc.addEventListener('input', () => descField.setError(''));
    function validate() {
      let first = null;
      const fail = (f, msg, el) => {
        f.setError(msg);
        first = first || el;
      };
      [kindField, specField, descField].forEach((f) => f.setError(''));
      const kind = selectedKind();
      if (!kind) fail(kindField, 'اختر نوع المساعدة المطلوبة', radios[0].input);
      if (kind === 'specialist_input' && !specSelect.value) fail(specField, 'حدد التخصص المطلوب للرأي المتخصص', specSelect);
      const d = desc.value.trim();
      if (!d) fail(descField, 'هذا الحقل مطلوب', desc);
      else if (d.length < 10) fail(descField, 'اكتب 10 أحرف على الأقل', desc);
      if (first) first.focus();
      return !first;
    }
    modal({
      title: 'مساعدة محامٍ آخر',
      size: 'lg',
      sheet: true, className: 'lw-sheet',
      body: h('form.form', { novalidate: true, onSubmit: (e) => e.preventDefault() }, formAlert, grid),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'أرسل للإدارة',
          variant: 'primary',
          icon: 'send',
          onClick: async () => {
            formAlert.hidden = true;
            if (!validate()) return false;
            try {
              await api.post(`${base}/counsel-requests`, {
                kind: selectedKind(),
                specialty: specSelect.value || undefined,
                issue_ids: issueBoxes.filter((x) => x.cb.checked).map((x) => x.id),
                document_ids: docBoxes.filter((x) => x.cb.checked).map((x) => x.id),
                description: desc.value.trim(),
              });
            } catch (err) {
              mount(formAlert, icon('alert', { size: 18 }), h('span', errorMessage(err)));
              formAlert.hidden = false;
              return false;
            }
            toast('أُرسل طلب المساعدة للإدارة. سيصلك إشعار عند البت فيه.', 'success', 5000);
            refresh(['requests']).catch((err) => toast(errorMessage(err), 'danger'));
            return undefined;
          },
        },
      ],
    });
    syncSpec();
  }

  // ───────────── شريط الإجراء السفلي (الهاتف) ─────────────

  function actionBar() {
    const items = [];
    if (editable()) {
      const words = draftWords();
      const text = isReturned() ? 'عدّل رأيك' : words ? `أكمل رأيك · ${count(words, 'word')}` : 'اكتب رأيك';
      items.push(button(text, { variant: 'primary', icon: 'edit', href: writeHref, className: 'lw-bar-primary' }));
    }
    if (canRequest()) items.push(button('اطلب', { variant: editable() ? 'secondary' : 'primary', icon: 'plus', className: 'lw-bar-secondary', onClick: () => openSheet() }));
    if (!items.length) return null;
    return h('div.lw-actionbar', { role: 'region', 'aria-label': 'إجراءات الإسناد' }, items);
  }

  // إخفاء الشريط أثناء ظهور لوحة المفاتيح (visualViewport)
  const vv = window.visualViewport;
  if (vv) {
    const onVv = () => document.body.classList.toggle('lw-kb-open', vv.height < window.innerHeight - 150);
    vv.addEventListener('resize', onVv);
    life.add(() => {
      vv.removeEventListener('resize', onVv);
      document.body.classList.remove('lw-kb-open');
    });
  }
  document.body.classList.add('lw-has-actionbar');
  life.add(() => document.body.classList.remove('lw-has-actionbar'));

  // ───────────── التجميع ─────────────

  draw();
  mount(
    root,
    hosts.header,
    hosts.segs,
    h('div.lw-asg-grid', h('div.lw-asg-main', hosts.file), h('aside.lw-asg-side', hosts.mine, hosts.requests)),
    hosts.bar,
  );
  return root;
}
