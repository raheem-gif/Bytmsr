// بوابة المحامي — مساحة العمل على ملف مسند (الإسناد): كل ما يُعرض هنا مبني من المنح الصريحة للإدارة.
// المحامي لا يرى بيانات اتصال العميل ولا يتواصل معه، ولا يغلق الملف: يطلب من خلال المنصة، ويقدّم رأيه للإدارة.

import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, date, dateTime, time, relative, money, num, count, percent, orgName, hours as hoursText, isoToCairoDate, cairoToday } from '../../../lib/fmt.js';
import { bidiText } from './matters.js';
import {
  pageHeader,
  card,
  alertBox,
  badge,
  statusBadge,
  dueBadge,
  codeTag,
  button,
  asyncButton,
  toast,
  modal,
  confirmDialog,
  formDialog,
  field,
  emptyState,
  errorState,
  icon,
  avatar,
  kv,
  richText,
  uid,
  errorMessage,
} from '../../../lib/ui.js';
import { docAiButton } from '../../components/doc-ai.js'; // v9 ai: تحليل المستندات المتاحة للمحامي فقط

const ACTIVE_STATUSES = ['assigned', 'in_progress', 'returned'];
const AUTOSAVE_MS = 2500;
const AI_PLACEHOLDER_RE = /\[يُستكمل/;
const MIN_SUBMIT_CHARS = 20;

// ───────────── تخزين محلي آمن ─────────────

function readJson(kind, key) {
  try {
    const raw = window[kind].getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(kind, key, value) {
  try {
    window[kind].setItem(key, JSON.stringify(value));
  } catch {
    /* التخزين غير متاح (وضع خاص أو ممتلئ) — نكمل بدونه */
  }
}
function removeKey(kind, key) {
  try {
    window[kind].removeItem(key);
  } catch {
    /* لا شيء */
  }
}

/** وقت الحفظ: الساعة فقط إن كان اليوم، وإلا التاريخ والساعة. */
function savedAt(iso) {
  if (!iso) return '';
  return isoToCairoDate(iso) === cairoToday() ? time(iso) : dateTime(iso);
}

/** يغلف معالج نقر غير متزامن: أي خطأ يظهر في رسالة بدل أن يضيع. */
const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    if (!(err && err.name === 'AbortError')) toast(errorMessage(err), 'danger');
  }
};

const KIND_HINTS = {
  second_opinion: 'رأي مستقل من محامٍ آخر في نفس المسائل للتحقق من النتيجة.',
  specialist_input: 'رأي محامٍ متخصص في مجال آخر بشأن مسألة محددة (مثل الضرائب أو العمل).',
  document_review: 'مراجعة مستند أو عقد بعينه من محامٍ مختص.',
  co_counsel: 'مشاركة محامٍ في دراسة مسألة معقدة إلى جانبك.',
};

const UPLOADER = { client: 'أرسله العميل', staff: 'أضافته الإدارة', lawyer: 'أضفته أنت', system: 'من النظام' };

/**
 * عنصر مستند مع رابط تنزيل.
 * ai: زر «تحليل المستند» (v9) — يُمرَّر فقط للمستندات التي أتاحتها الإدارة للمحامي (والخادم يرفض غيرها بـ 404).
 */
function docItem(d, { ai = false } = {}) {
  const name = d.title || d.filename;
  const link = button('تنزيل', { variant: 'ghost', size: 'sm', icon: 'download', href: downloadUrl(d.id), ariaLabel: `تنزيل ${name}` });
  link.setAttribute('download', d.filename || '');
  return h(
    'li.pc-doc',
    h('span.pc-doc-icon', icon('fileText', { size: 18 })),
    h(
      'div.pc-doc-text',
      h('span.pc-doc-name', { dir: 'auto', title: name }, name),
      h('span.pc-doc-meta', [formatBytes(d.size), UPLOADER[d.uploaded_by_kind], d.created_at && date(d.created_at)].filter(Boolean).join(' · ')),
    ),
    ai ? h('div.pc-doc-actions', link, docAiButton({ documentId: d.id, scope: 'lawyer' })) : link,
  );
}

/** نص طويل قابل للطي. */
function collapsibleText(text, { limit = 520, className } = {}) {
  const body = h('div.pc-longtext', { class: className, dir: 'auto' }, richText(text));
  if (String(text || '').length <= limit) return body;
  body.classList.add('is-clamped');
  const id = uid('lt');
  body.id = id;
  const toggle = button('عرض النص كاملًا', { variant: 'link', size: 'sm', icon: 'chevronDown' });
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('is-clamped') === false;
    toggle.setAttribute('aria-expanded', String(open));
    mount(toggle, icon(open ? 'chevronUp' : 'chevronDown', { size: 16 }), h('span.btn-label', open ? 'طي النص' : 'عرض النص كاملًا'));
  });
  return h('div.pc-longtext-wrap', body, toggle);
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const base = `/lawyer/assignments/${encodeURIComponent(id)}`;
  const crumbs = (code) => [
    { label: 'بوابة المحامي', href: '#/my' },
    { label: 'ملفاتي', href: '#/my' },
    { label: code || `#${id}` },
  ];

  let view;
  let justOpened = false;
  try {
    view = await api.get(base);
    // أول فتح للملف يُسجَّل مرة واحدة (يبدأ احتساب العمل ويظهر للإدارة)
    if (view && view.assignment && !view.assignment.first_opened_at) {
      view = await api.post(`${base}/open`);
      justOpened = true;
    }
  } catch (err) {
    return frag(pageHeader({ title: 'تفاصيل الإسناد', breadcrumbs: crumbs() }), card({ body: errorState(err, () => ctx.reload()) }));
  }

  ctx.setTitle(`ملف ${view.case.code}`);

  // مفاتيح التخزين المحلي
  const backupKey = `pc-draft-backup-${id}`;
  // «جديد» يحدده الخادم (is_new) من آخر اطلاع للمحامي على الملف
  const newIrIds = new Set(view.info_requests.filter((r) => r.is_new).map((r) => r.id));

  // ── حاويات الأقسام (تُعاد رسمها بعد كل تحديث دون المساس بمحرر الرأي) ──
  const hosts = {
    header: h('div'),
    banners: h('div.stack-sm'),
    brief: h('div'),
    facts: h('div'),
    issues: h('div'),
    docs: h('div'),
    team: h('div'),
    editor: h('div', { id: uid('pc-editor') }),
    versions: h('div'),
    summary: h('div'),
    ai: h('div'),
    info: h('div'),
    counsel: h('div'),
  };

  let editorApi = null;
  let editorMode = null;

  async function refresh({ rebuildEditor = false } = {}) {
    view = await api.get(base);
    view.info_requests.filter((r) => r.is_new).forEach((r) => newIrIds.add(r.id));
    drawAll({ rebuildEditor });
  }

  // كل حاوية تقبل التركيز برمجيًا حتى لا يضيع تركيز لوحة المفاتيح عند إعادة رسم القسم
  Object.values(hosts).forEach((el) => {
    el.setAttribute('tabindex', '-1');
    el.classList.add('pc-focus-host');
  });

  function drawAll({ rebuildEditor = false } = {}) {
    const v = view;
    const active = document.activeElement;
    const owner = active ? Object.values(hosts).find((x) => x !== active && x.contains(active)) : null;
    mount(hosts.header, headerNode(v));
    mount(hosts.banners, bannersNode(v));
    mount(hosts.brief, briefCard(v));
    mount(hosts.facts, factsCard(v));
    mount(hosts.issues, issuesCard(v));
    mount(hosts.docs, docsCard(v));
    mount(hosts.team, teamCard(v));
    mount(hosts.versions, versionsCard(v));
    mount(hosts.summary, summaryCard(v));
    mount(hosts.info, infoCard(v));
    mount(hosts.counsel, counselCard(v));
    const mode = v.permissions.can_edit ? 'edit' : 'read';
    if (rebuildEditor || mode !== editorMode || !editorApi) {
      if (editorApi) editorApi.destroy();
      editorMode = mode;
      const built = mode === 'edit' ? buildEditor(v) : { node: readOnlyOpinion(v), api: null };
      editorApi = built.api;
      mount(hosts.editor, built.node);
      mount(hosts.ai, aiCard(v));
    }
    if (owner && !active.isConnected && owner.isConnected) owner.focus({ preventScroll: true });
  }

  // ───────────── الترويسة والتنبيهات ─────────────

  function headerNode(v) {
    const a = v.assignment;
    const c = v.case;
    const active = ACTIVE_STATUSES.includes(a.status) && c.state !== 'closed';
    const jump =
      v.permissions.can_edit &&
      button('الانتقال إلى رأيي', {
        variant: 'secondary',
        icon: 'edit',
        onClick: () => {
          hosts.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const ta = hosts.editor.querySelector('textarea');
          if (ta) setTimeout(() => ta.focus({ preventScroll: true }), 350);
        },
      });
    return pageHeader({
      title: c.title,
      breadcrumbs: crumbs(c.code),
      actions: jump || null,
      meta: h(
        'div.pc-meta-row',
        codeTag(c.code),
        badge(c.legal_area_label || areaLabel(c.legal_area), 'neutral', { icon: 'book' }),
        badge(a.role_label || label('assignment_role', a.role), 'accent', { icon: 'user', title: 'دورك في فريق الملف' }),
        statusBadge('assignment_status', a.status),
        active && a.due_at && dueBadge(a.due_at),
        (c.priority === 'urgent' || c.priority === 'high') && statusBadge('priority', c.priority, { icon: 'flag', dot: false }),
        c.state === 'closed' && badge('الملف مغلق', 'muted', { icon: 'lock' }),
      ),
    });
  }

  function bannersNode(v) {
    const out = [];
    if (v.case.state === 'closed') {
      out.push(alertBox('أغلقت الإدارة هذا الملف — العرض للقراءة فقط.', 'warning', { icon: 'lock', title: 'ملف مغلق' }));
    }
    if (justOpened) {
      out.push(alertBox('سُجّل فتحك للملف وأصبحت حالته «قيد العمل». ستتابع الإدارة التقدم من خلال المنصة.', 'success', { icon: 'checkCircle' }));
    }
    out.push(
      alertBox(
        `هذا الملف مُسند إليك من ${orgName()}. لا تتواصل مع العميل مباشرة؛ اطلب أي معلومة أو مستند من خلال المنصة وستتولى الإدارة التواصل.`,
        'info',
        { icon: 'shield' },
      ),
    );
    const returned = [...v.my_opinions].reverse().find((o) => o.status === 'returned');
    if (v.assignment.status === 'returned' && returned) {
      out.push(
        alertBox(
          h('div', h('p.pre', richText(returned.review_note || 'راجع رأيك وعدّله ثم أعد تقديمه.')), h('p.small.mt-1', `أعادت الإدارة الإصدار ${num(returned.version)} ${returned.reviewed_at ? relative(returned.reviewed_at) : ''}. نسخة العمل أدناه تبدأ من نص الإصدار المعاد.`)),
          'danger',
          { icon: 'refresh', title: 'أعادت الإدارة رأيك للتعديل — ملاحظات المراجعة' },
        ),
      );
    }
    return out;
  }

  // ───────────── المطلوب، الوقائع، المسائل ─────────────

  function briefCard(v) {
    const a = v.assignment;
    const rb = v.requested_by;
    return card({
      title: 'المطلوب منك تحديدًا',
      icon: 'flag',
      className: 'pc-brief-card',
      body: frag(
        a.brief
          ? h('p.pc-brief.pre', richText(a.brief))
          : h('p.muted', 'لم تحدد الإدارة تكليفًا تفصيليًا لهذا الإسناد؛ ادرس المسائل المتاحة لك أدناه وأبدِ رأيك فيها.'),
        rb &&
          h(
            'div.pc-requested-by',
            icon('users', { size: 16 }),
            h(
              'span',
              'طلب المساعدة: ',
              h('strong', rb.lawyer_name),
              ' — ',
              bidiText(rb.kind_label || label('counsel_kind', rb.kind)),
              rb.specialty_label ? [' — ', rb.specialty_label] : null,
            ),
          ),
      ),
    });
  }

  function factsCard(v) {
    return card({
      title: 'الوقائع',
      icon: 'fileText',
      subtitle: 'كما أعدّتها الإدارة لك',
      body: frag(
        h('div.pc-client-line', icon('user', { size: 16 }), h('span', 'العميل: '), h('strong', v.client_label)),
        v.facts_granted
          ? v.facts
            ? collapsibleText(v.facts, { limit: 900, className: 'pc-facts' })
            : h('p.muted', 'لم تُضف الإدارة ملخصًا للوقائع بعد.')
          : alertBox('لم تُتح لك الإدارة ملخص الوقائع في هذا الإسناد. ركّز على المسائل والمستندات المتاحة لك، أو اطلب ما تحتاجه من معلومات.', 'warning', { icon: 'eyeOff' }),
      ),
    });
  }

  function issuesCard(v) {
    const canPropose = v.case.state !== 'closed' && v.permissions.can_request;
    const list = v.issues || [];
    return card({
      title: 'المسائل',
      subtitle: list.length ? `المسائل المتاحة لك: ${num(list.filter((i) => i.status === 'active').length)}` : null,
      icon: 'queue',
      actions: canPropose ? button('اقتراح مسألة جديدة', { variant: 'secondary', size: 'sm', icon: 'plus', onClick: safe(proposeIssue) }) : null,
      body: list.length
        ? h(
            'ol.pc-issues',
            list.map((i) =>
              h(
                'li.pc-issue',
                { class: i.status === 'proposed' && 'is-proposed' },
                h('span.pc-issue-num', { 'aria-hidden': 'true' }, num(i.number)),
                h(
                  'div.pc-issue-body',
                  h('span.sr-only', `المسألة رقم ${i.number}: `),
                  h('div.pc-issue-title', richText(i.title)),
                  i.details && h('p.pc-issue-details', richText(i.details)),
                  (i.status === 'proposed' || (i.legal_area && i.legal_area !== v.case.legal_area)) &&
                    h(
                      'div.row.mt-1',
                      i.status === 'proposed' && badge('مقترحة — بانتظار اعتماد الإدارة', 'warning', { icon: 'clock' }),
                      i.legal_area && i.legal_area !== v.case.legal_area && badge(areaLabel(i.legal_area), 'neutral'),
                    ),
                ),
              ),
            ),
          )
        : emptyState('لم تُتح لك مسائل محددة في هذا الإسناد. ادرس المطلوب منك أعلاه، ويمكنك اقتراح مسألة إن رأيت ذلك.', null, { compact: true, icon: 'queue' }),
    });
  }

  async function proposeIssue() {
    const res = await formDialog({
      title: 'اقتراح مسألة جديدة',
      intro: 'تُعرض المسألة المقترحة على الإدارة لاعتمادها قبل إضافتها رسميًا إلى الملف، وتظهر لك بحالة «مقترحة» حتى ذلك الحين.',
      submitLabel: 'إرسال الاقتراح',
      fields: [
        { name: 'title', label: 'عنوان المسألة', required: true, maxLength: 300, placeholder: 'مثال: مدى صحة عقد البيع الابتدائي غير المسجل في مواجهة الورثة' },
        { name: 'details', label: 'لماذا تقترح إضافتها؟ (اختياري)', type: 'textarea', rows: 4, maxLength: 3000 },
      ],
      onSubmit: (vals) => api.post(`${base}/issues`, { title: vals.title, details: vals.details || undefined }),
    });
    if (!res) return;
    toast(`أُرسل اقتراح المسألة رقم ${res.number} للإدارة`, 'success');
    await refresh();
  }

  // ───────────── المستندات وآراء الفريق ─────────────

  function docsCard(v) {
    const docs = v.documents || [];
    return card({
      title: 'المستندات المتاحة لك',
      icon: 'paperclip',
      subtitle: docs.length ? `عدد المستندات: ${num(docs.length)}` : null,
      body: docs.length
        ? // (v9 ai) التحليل للمستندات التي أتاحتها الإدارة فقط، لا لما رفعه المحامي نفسه
          h('ul.pc-docs.doc-ai-docs', docs.map((d) => docItem(d, { ai: d.granted === true })))
        : emptyState(
            v.permissions.can_request
              ? 'لم تُتح لك الإدارة أي مستندات في هذا الملف بعد. إن احتجت مستندًا فاضغط «طلب مستند».'
              : 'لم تُتح لك الإدارة أي مستندات في هذا الملف.',
            null,
            { compact: true, icon: 'paperclip' },
          ),
    });
  }

  function teamCard(v) {
    const team = v.team || [];
    return card({
      title: 'آراء أعضاء الفريق المتاحة لك',
      icon: 'users',
      subtitle: 'تُعرض آراء الزملاء فقط إذا أتاحتها الإدارة لك',
      body: team.length
        ? h(
            'ul.pc-team',
            team.map((t) =>
              h(
                'li.pc-team-item',
                h(
                  'div.pc-team-head',
                  avatar(t.lawyer_name, { size: 'sm' }),
                  h(
                    'div.pc-team-who',
                    h('strong', t.lawyer_name),
                    h('div.row', badge(t.role_label || label('assignment_role', t.role), 'primary'), t.specialty_label && badge(t.specialty_label, 'neutral', { icon: 'book' })),
                  ),
                ),
                t.brief && h('p.pc-team-brief', h('span.muted', 'المطلوب منه: '), richText(t.brief)),
                t.opinion
                  ? h(
                      'div.pc-team-opinion',
                      h(
                        'div.pc-team-op-meta',
                        h('span', `الإصدار ${num(t.opinion.version)}`),
                        statusBadge('opinion_status', t.opinion.status),
                        t.opinion.submitted_at && h('span.muted', `قُدّم ${date(t.opinion.submitted_at)}`),
                      ),
                      collapsibleText(t.opinion.body, { limit: 600 }),
                    )
                  : h('p.muted.small', 'لم يُقدَّم رأيه بعد. سيصلك إشعار عند تقديمه.'),
              ),
            ),
          )
        : emptyState('لا توجد آراء زملاء متاحة لك في هذا الملف.', null, { compact: true, icon: 'users' }),
    });
  }

  // ───────────── محرر الرأي ─────────────

  function readOnlyOpinion(v) {
    const a = v.assignment;
    const closed = v.case.state === 'closed';
    const latest = shownOpinion(v);
    let note;
    if (closed) note = alertBox('أغلقت الإدارة هذا الملف، ولم يعد تعديل الرأي متاحًا.', 'warning', { icon: 'lock' });
    else if (a.status === 'submitted') note = alertBox('لن يصل رأيك للعميل مباشرة؛ سيصلك إشعار عند اعتماده أو إعادته إليك بملاحظات. يمكنك خلال المراجعة طلب معلومات أو مستندات إضافية.', 'info', { icon: 'clock', title: 'قُدّم رأيك وهو قيد مراجعة الإدارة' });
    else if (a.status === 'approved') note = alertBox('تتولى الإدارة إعداد النسخة الموجهة للعميل وإرسالها من خلال قنوات المؤسسة. شكرًا لك.', 'success', { icon: 'checkCircle', title: 'اعتمدت الإدارة رأيك' });
    else note = alertBox('تعديل الرأي غير متاح في هذه المرحلة.', 'info');
    return card({
      title: 'رأيي',
      icon: 'edit',
      subtitle: latest ? `الإصدار ${num(latest.version)} — ${label('opinion_status', latest.status)}` : null,
      body: frag(
        note,
        latest && latest.status === 'approved' && latest.review_note && h('div.pc-review-note.mt-3', h('strong', 'ملاحظة الإدارة: '), richText(latest.review_note)),
        latest
          ? h('div.pc-opinion-read.mt-3', { dir: 'rtl' }, richText(latest.body))
          : emptyState('لم تقدّم رأيًا في هذا الملف.', null, { compact: true, icon: 'fileText' }),
      ),
    });
  }

  function buildEditor(v) {
    const draft = v.current_draft;
    const initial = draft ? draft.body : '';
    let lastSaved = initial;
    let lastSavedAt = draft ? draft.updated_at : null;
    let aiSuggestionId = draft && draft.ai_suggestion_id ? draft.ai_suggestion_id : null;
    let timer = null;
    let inflight = null;
    let queued = false;
    let locked = false;
    let destroyed = false;

    const taId = uid('opinion');
    const helpId = uid('opinion-help');
    const ta = h('textarea.input.pc-editor-input', {
      id: taId,
      dir: 'rtl',
      rows: 18,
      maxlength: 60000,
      spellcheck: 'true',
      'aria-describedby': helpId,
      placeholder: 'اكتب رأيك القانوني هنا: الوقائع المؤثرة، التكييف القانوني، الرأي في كل مسألة، ثم التوصيات العملية والخطوات المقترحة بالترتيب…',
    });
    ta.value = initial;

    const statusIcon = h('span.pc-save-icon', { 'aria-hidden': 'true' });
    const statusText = h('span');
    const retryBtn = button('إعادة المحاولة', { variant: 'link', size: 'sm', onClick: () => save() });
    retryBtn.hidden = true;
    const statusEl = h('div.pc-save-status', { role: 'status', 'aria-live': 'polite' }, statusIcon, statusText, retryBtn);
    const wordCount = h('span.pc-word-count');
    const fieldErr = h('p.field-error', { hidden: true, role: 'alert' });
    const placeholderWarn = alertBox('تحتوي المسودة على أجزاء «[يُستكمل…]» من المسودة الآلية. أكملها أو احذفها قبل التقديم.', 'warning', { icon: 'sparkle' });
    placeholderWarn.hidden = true;

    function setStatus(state, extra) {
      statusEl.dataset.state = state;
      retryBtn.hidden = state !== 'error';
      const icons = { saved: 'checkCircle', dirty: 'edit', saving: null, error: 'alert', empty: 'info', idle: 'info' };
      mount(statusIcon, state === 'saving' ? h('span.spinner', { 'aria-hidden': 'true' }) : icon(icons[state] || 'info', { size: 15 }));
      const texts = {
        saved: () => `حُفظت المسودة ${savedAt(extra)}`,
        dirty: () => 'تغييرات غير محفوظة…',
        saving: () => 'جارٍ الحفظ…',
        error: () => `تعذر حفظ المسودة: ${extra}. نصك محفوظ مؤقتًا على هذا الجهاز.`,
        empty: () => 'المسودة فارغة — لن تُحفظ قبل كتابة نص.',
        idle: () => 'تُحفظ المسودة تلقائيًا أثناء الكتابة.',
      };
      statusText.textContent = (texts[state] || texts.idle)();
    }

    function updateCounters() {
      const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
      wordCount.textContent = `${count(words, ['كلمة', 'كلمتان', 'كلمات', 'كلمة'])} · ${count(ta.value.length, ['حرف', 'حرفان', 'أحرف', 'حرفًا'])}`;
      placeholderWarn.hidden = !AI_PLACEHOLDER_RE.test(ta.value);
    }

    const backup = () => writeJson('sessionStorage', backupKey, { body: ta.value, at: Date.now() });

    async function save() {
      clearTimeout(timer);
      if (locked || destroyed) return true;
      const body = ta.value;
      if (body === lastSaved) {
        if (statusEl.dataset.state !== 'error') setStatus(lastSavedAt ? 'saved' : 'idle', lastSavedAt);
        return true;
      }
      if (!body.trim()) {
        setStatus('empty');
        return false;
      }
      if (inflight) {
        queued = true;
        return inflight;
      }
      setStatus('saving');
      inflight = (async () => {
        try {
          const res = await api.put(`${base}/draft`, { body, ai_suggestion_id: aiSuggestionId || undefined });
          lastSaved = body;
          lastSavedAt = res && res.updated_at ? res.updated_at : new Date().toISOString();
          if (res && res.version && subtitleRef.el) subtitleRef.el.textContent = `نسخة العمل — الإصدار ${num(res.version)}`;
          if (ta.value === body) {
            removeKey('sessionStorage', backupKey);
            setStatus('saved', lastSavedAt);
          } else setStatus('dirty');
          return true;
        } catch (err) {
          setStatus('error', errorMessage(err));
          if (!ta.isConnected) toast('تعذر حفظ مسودة رأيك قبل مغادرة الصفحة. النص محفوظ مؤقتًا على هذا الجهاز وسيُعرض عليك عند العودة للملف.', 'danger');
          return false;
        } finally {
          inflight = null;
          if (queued && !locked) {
            queued = false;
            save();
          } else if (!ta.isConnected) destroy();
        }
      })();
      return inflight;
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(save, AUTOSAVE_MS);
    }

    ta.addEventListener('input', () => {
      fieldErr.hidden = true;
      ta.removeAttribute('aria-invalid');
      updateCounters();
      if (ta.value !== lastSaved) {
        backup();
        setStatus('dirty');
        schedule();
      }
    });
    ta.addEventListener('blur', () => {
      if (ta.value !== lastSaved) save();
    });
    // اختصار Ctrl/⌘+S للحفظ الفوري
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        save();
      }
    });

    // حماية النص عند مغادرة الصفحة
    const isDirty = () => !locked && ta.value !== lastSaved;
    const onBeforeUnload = (e) => {
      if (destroyed) return;
      if (isDirty()) {
        backup();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onHashChange = () => {
      if (destroyed) return;
      if (isDirty()) save();
      const path = String(window.location.hash).replace(/^#!?/, '').split('?')[0].replace(/\/+$/, '');
      if (path !== `/my/assignments/${id}`) destroy();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('hashchange', onHashChange);

    function destroy() {
      if (destroyed) return;
      if (isDirty()) save();
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('hashchange', onHashChange);
    }

    // استعادة نص لم يُحفظ من جلسة سابقة
    const restoreHost = h('div');
    const saved = readJson('sessionStorage', backupKey);
    if (saved && typeof saved.body === 'string' && saved.body !== initial && saved.body.trim()) {
      const restoreBtn = button('استعادة النص غير المحفوظ', {
        variant: 'primary',
        size: 'sm',
        icon: 'refresh',
        onClick: () => {
          ta.value = saved.body;
          updateCounters();
          setStatus('dirty');
          mount(restoreHost);
          save();
          ta.focus();
        },
      });
      const discardBtn = button('تجاهل', {
        variant: 'ghost',
        size: 'sm',
        onClick: () => {
          removeKey('sessionStorage', backupKey);
          mount(restoreHost);
        },
      });
      mount(
        restoreHost,
        alertBox(
          h('div', h('p', `وجدنا نصًا كتبته على هذا الجهاز ${saved.at ? relative(new Date(saved.at).toISOString()) : ''} ولم يُحفظ على الخادم.`), h('div.row.mt-2', restoreBtn, discardBtn)),
          'warning',
          { icon: 'alert', title: 'نص غير محفوظ' },
        ),
      );
    } else if (saved) removeKey('sessionStorage', backupKey);

    // ── التقديم للإدارة ──
    function showFieldError(msg) {
      mount(fieldErr, icon('alert', { size: 14 }), h('span', msg));
      fieldErr.hidden = false;
      ta.setAttribute('aria-invalid', 'true');
      ta.focus();
    }

    async function onSubmit() {
      const body = ta.value;
      if (body.trim().length < MIN_SUBMIT_CHARS) {
        showFieldError(`اكتب رأيك (${count(MIN_SUBMIT_CHARS, 'char')} على الأقل) قبل التقديم.`);
        return;
      }
      if (AI_PLACEHOLDER_RE.test(body)) {
        showFieldError('المسودة ما زالت تحتوي على أجزاء «[يُستكمل…]» من المسودة الآلية. أكملها أو احذفها قبل التقديم.');
        return;
      }
      clearTimeout(timer);
      const result = await formDialog({
        title: 'تقديم الرأي للإدارة',
        intro: 'لن يصل رأيك للعميل مباشرة؛ ستراجعه الإدارة أولًا.',
        submitLabel: 'تقديم للمراجعة',
        size: 'md',
        fields: [
          {
            type: 'static',
            label: 'ماذا يحدث بعد التقديم؟',
            full: true,
            render: () =>
              h(
                'ol.pc-steps',
                h('li', 'تراجع الإدارة رأيك، فتعتمده أو تعيده إليك بملاحظات.'),
                h('li', 'بعد الاعتماد تُعِد الإدارة نسخة موجهة للعميل بلغة مبسطة وترسلها من خلال قنوات المؤسسة.'),
                h('li', 'لا يمكنك تعديل الرأي أثناء المراجعة، ويمكنك متابعة حالته من هذه الصفحة.'),
              ),
          },
          {
            name: 'hours_spent',
            label: 'الساعات التي استغرقها العمل (اختياري)',
            type: 'number',
            min: 0,
            max: 1000,
            suffix: 'ساعة',
            hint: 'يساعد الإدارة على قياس الجهد، ولا يظهر للعميل.',
            full: true,
          },
        ],
        onSubmit: async (vals) => {
          locked = true;
          try {
            if (inflight) await inflight;
            return await api.post(`${base}/submit`, {
              body: ta.value,
              hours_spent: vals.hours_spent ?? undefined,
              ai_suggestion_id: aiSuggestionId || undefined,
            });
          } catch (err) {
            locked = false;
            throw err;
          }
        },
      });
      if (!result) {
        if (!locked && ta.value !== lastSaved) schedule();
        return;
      }
      lastSaved = ta.value;
      removeKey('sessionStorage', backupKey);
      toast(`قُدّم رأيك (الإصدار ${num(result.version)}) للإدارة وهو الآن قيد المراجعة.`, 'success', 5000);
      await refresh({ rebuildEditor: true });
      hosts.editor.focus({ preventScroll: true });
      hosts.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const subtitleRef = { el: null };
    const submitBtn = button('تقديم الرأي للإدارة', { variant: 'primary', icon: 'send', onClick: safe(onSubmit) });
    const saveNow = button('حفظ الآن', { variant: 'ghost', size: 'sm', icon: 'check', onClick: () => save() });

    setStatus(lastSavedAt ? 'saved' : 'idle', lastSavedAt);
    updateCounters();

    const node = card({
      title: 'رأيي',
      icon: 'edit',
      className: 'pc-editor-card',
      subtitle: draft ? `نسخة العمل — الإصدار ${num(draft.version)}` : 'مسودة جديدة',
      actions: saveNow,
      body: frag(
        restoreHost,
        h('label.field-label.sr-only', { htmlFor: taId }, 'نص رأيك القانوني'),
        ta,
        fieldErr,
        h('div.pc-editor-bar', statusEl, wordCount),
        placeholderWarn,
        h('p.field-hint', { id: helpId }, 'تُحفظ المسودة تلقائيًا أثناء الكتابة وعند مغادرة الحقل (أو بالضغط على Ctrl+S). لا يراها أحد قبل أن تقدّمها.'),
      ),
      footer: h(
        'div.pc-submit-row',
        h('p.pc-submit-hint', icon('shield', { size: 16 }), h('span', 'عند التقديم يصل رأيك للإدارة أولًا للمراجعة، ولا يُرسل للعميل مباشرة.')),
        submitBtn,
      ),
    });

    subtitleRef.el = node.querySelector('.card-subtitle');

    return {
      node,
      api: {
        destroy,
        save,
        getBody: () => ta.value,
        /** إدراج نص المسودة الآلية (استبدال أو إلحاق) */
        insertAi(text, suggestionId, mode) {
          ta.value = mode === 'append' && ta.value.trim() ? `${ta.value.replace(/\s+$/, '')}\n\n${text}` : text;
          aiSuggestionId = suggestionId || aiSuggestionId;
          updateCounters();
          backup();
          setStatus('dirty');
          save();
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(0, 0);
          ta.scrollTop = 0;
        },
      },
    };
  }

  /** الإصدار المعروض في بطاقة «رأيي» (نسخة العمل أثناء التحرير، أو آخر إصدار مقدَّم في وضع القراءة). */
  function shownOpinion(v) {
    const ops = v.my_opinions || [];
    if (v.permissions.can_edit) return v.current_draft || null;
    return [...ops].reverse().find((o) => o.status !== 'draft' && o.status !== 'superseded') || ops[ops.length - 1] || null;
  }

  function versionsCard(v) {
    // الإصدار المعروض أعلاه لا يُكرر في السجل؛ يظهر السجل فقط عند وجود إصدارات سابقة
    const shown = shownOpinion(v);
    const ops = [...(v.my_opinions || [])].filter((o) => !shown || o.id !== shown.id).reverse();
    if (!ops.length) return null;
    return card({
      title: 'الإصدارات السابقة من رأيي',
      icon: 'clock',
      subtitle: `عدد الإصدارات: ${num(ops.length)}`,
      body: h(
        'div.pc-versions',
        ops.map((o) =>
          h(
            'details.pc-version',
            h(
              'summary',
              h('span.pc-version-title', `الإصدار ${num(o.version)}`),
              statusBadge('opinion_status', o.status),
              h(
                'span.pc-version-dates',
                o.submitted_at ? `قُدّم ${date(o.submitted_at)}` : `آخر تعديل ${relative(o.updated_at)}`,
                o.reviewed_at ? ` · رُوجع ${date(o.reviewed_at)}` : '',
              ),
            ),
            h(
              'div.pc-version-body',
              o.review_note &&
                h('div.pc-review-note', { class: o.status === 'returned' && 'is-returned' }, h('strong', o.status === 'returned' ? 'ملاحظات الإعادة: ' : 'ملاحظة الإدارة: '), richText(o.review_note)),
              h('div.pc-opinion-read', { dir: 'rtl' }, richText(o.body)),
            ),
          ),
        ),
      ),
    });
  }

  // ───────────── العمود الجانبي ─────────────

  function summaryCard(v) {
    const a = v.assignment;
    let fee = a.fee_mode_label || label('fee_mode', a.fee_mode);
    if (a.fee_mode === 'custom' && a.fee_amount != null) fee = `${fee}: ${money(a.fee_amount)}`;
    return card({
      title: 'ملخص الإسناد',
      icon: 'briefcase',
      body: kv([
        ['دوري في الفريق', h('span', bidiText(a.role_label || label('assignment_role', a.role)))],
        ['حالة الإسناد', statusBadge('assignment_status', a.status)],
        ['تاريخ الإسناد', a.assigned_at && dateTime(a.assigned_at)],
        ['أول فتح للملف', a.first_opened_at && dateTime(a.first_opened_at)],
        ['الموعد المطلوب', a.due_at ? h('div.stack-sm', h('span', dateTime(a.due_at)), ACTIVE_STATUSES.includes(a.status) && v.case.state !== 'closed' ? h('span', dueBadge(a.due_at)) : null) : 'بدون موعد محدد'],
        a.submitted_at && ['تاريخ التقديم', dateTime(a.submitted_at)],
        a.approved_at && ['تاريخ الاعتماد', dateTime(a.approved_at)],
        a.hours_spent != null && ['الساعات المسجلة', hoursText(a.hours_spent)],
        ['معاملة الأتعاب', a.fee_mode === 'pro_bono' ? badge(fee, 'accent', { icon: 'star' }) : h('span', bidiText(fee))],
        ['حالة الملف', v.case.state === 'closed' ? badge('مغلق', 'muted', { icon: 'lock' }) : badge('مفتوح', 'success', { dot: true })],
      ]),
      footer: h('p.small.muted', 'إغلاق الملف والتواصل مع العميل من مسؤولية الإدارة وحدها.'),
    });
  }

  function aiCard(v) {
    const canDraft = v.permissions.can_edit;
    const similarHost = h('div.pc-similar-host');

    const draftBtn =
      canDraft &&
      asyncButton(
        'مسودة أولية بالذكاء الاصطناعي',
        async () => {
          const res = await api.post(`${base}/ai/draft`);
          if (!res || !res.text) throw new Error('لم يُرجِع المساعد الذكي نصًا، حاول مرة أخرى');
          const current = editorApi ? editorApi.getBody() : '';
          if (!current.trim()) {
            editorApi.insertAi(res.text, res.id, 'replace');
            toast('أُدرجت المسودة الأولية في المحرر. راجعها واستكمل الأجزاء المحددة قبل التقديم.', 'success', 5000);
          } else {
            chooseInsertMode(res);
          }
          if (res.fallback_reason) toast('تعذر الوصول لنموذج الذكاء الاصطناعي، فأُعدت المسودة بالمحلل المحلي.', 'warning');
        },
        { variant: 'accent', icon: 'sparkle', block: true },
      );

    const similarBtn = asyncButton(
      'عرض الحالات المشابهة',
      async (_e, btn) => {
        const res = await api.get(`${base}/similar`);
        const items = (res && res.items) || [];
        btn.hidden = true;
        mount(
          similarHost,
          items.length
            ? h(
                'ul.pc-similar',
                items.map((s) =>
                  h(
                    'li.pc-similar-item',
                    h('div.pc-similar-head', h('strong', richText(s.title)), s.score != null && badge(`تشابه ${percent(s.score)}`, 'info')),
                    h('div.row', badge(areaLabel(s.legal_area), 'neutral', { icon: 'book' })),
                    s.key_points && collapsibleText(s.key_points, { limit: 220, className: 'pc-similar-points' }),
                    Array.isArray(s.issues) && s.issues.length ? h('ul.pc-similar-issues', s.issues.map((x) => h('li', x))) : null,
                  ),
                ),
              )
            : emptyState('لا توجد حالات مشابهة معتمدة في قاعدة المعرفة حتى الآن.', null, { compact: true, icon: 'book' }),
          button('تحديث', { variant: 'link', size: 'sm', icon: 'refresh', onClick: () => { btn.hidden = false; mount(similarHost); btn.click(); } }),
        );
      },
      { variant: 'secondary', icon: 'book', block: true },
    );

    return card({
      title: 'المساعد الذكي',
      icon: 'sparkle',
      subtitle: 'أداة مساعدة — القرار والصياغة النهائية لك',
      className: 'pc-ai-card',
      body: frag(
        canDraft &&
          h(
            'div.pc-ai-block',
            draftBtn,
            h('p.field-hint', 'تعتمد المسودة فقط على ما أُتيح لك، ويجب مراجعتها واستكمالها. تُسجَّل تعديلاتك عليها لتحسين جودة المساعد.'),
          ),
        h(
          'div.pc-ai-block',
          h('h3.pc-subhead', icon('book', { size: 16 }), 'حالات مشابهة اعتمدتها المؤسسة'),
          h('p.field-hint', 'ملخصات مجهّلة بالكامل من ملفات سابقة راجعتها الإدارة، دون أي بيانات تعريفية.'),
          similarBtn,
          similarHost,
        ),
      ),
    });
  }

  function chooseInsertMode(res) {
    let mode = null;
    modal({
      title: 'إدراج المسودة الأولية',
      size: 'lg',
      body: frag(
        h('p.modal-intro', 'محرر الرأي يحتوي على نص بالفعل. كيف تريد إدراج المسودة الآلية؟'),
        h('div.pc-ai-preview', { dir: 'rtl', tabindex: '0', 'aria-label': 'معاينة المسودة الآلية' }, richText(res.text)),
        h('p.field-hint.mt-2', 'تعتمد المسودة فقط على ما أُتيح لك، ويجب مراجعتها واستكمالها قبل التقديم.'),
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        { label: 'إضافة في نهاية النص', variant: 'secondary', icon: 'plus', onClick: () => (mode = 'append') },
        { label: 'استبدال النص الحالي', variant: 'primary', icon: 'refresh', onClick: () => (mode = 'replace') },
      ],
      onClose: () => {
        if (!mode || !editorApi) return;
        editorApi.insertAi(res.text, res.id, mode);
        toast(mode === 'append' ? 'أُضيفت المسودة الآلية في نهاية رأيك.' : 'استُبدل النص بالمسودة الآلية.', 'success');
      },
    });
  }

  // ───────────── طلبات المعلومات والمستندات ─────────────

  function infoCard(v) {
    const can = v.permissions.can_request;
    const list = v.info_requests || [];
    if (!can && !list.length) return null;
    const own = list.filter((r) => r.own);
    const shared = list.filter((r) => !r.own);
    const item = (r) => {
      const isNew = r.status === 'shared' && newIrIds.has(r.id);
      const docs = r.documents || [];
      const hint =
        r.status === 'sent_to_client'
          ? 'أرسلته الإدارة للعميل عبر قناة المؤسسة، وستتيح لك الرد بعد مراجعته.'
          : r.status === 'client_replied'
            ? 'وصل رد العميل وتراجعه الإدارة قبل إتاحته لك.'
            : r.status === 'pending_admin'
              ? 'لم يُرسل للعميل بعد — بانتظار موافقة الإدارة.'
              : null;
      return h(
        'li.pc-req',
        { class: [isNew && 'is-new', `is-${r.status}`] },
        h(
          'div.pc-req-head',
          badge(r.kind_label || label('info_request_kind', r.kind), r.kind === 'document' ? 'accent' : 'info', { icon: r.kind === 'document' ? 'paperclip' : 'message' }),
          statusBadge('info_request_status', r.status),
          isNew && badge('جديد', 'success', { icon: 'sparkle' }),
        ),
        h('p.pc-req-q', richText(r.question)),
        h('div.pc-req-meta', h('time', { datetime: r.created_at, title: dateTime(r.created_at) }, `طُلب ${relative(r.created_at)}`), hint && h('span', hint)),
        r.status === 'rejected' && r.admin_note && h('div.pc-req-note', h('strong', 'سبب عدم الموافقة: '), richText(r.admin_note)),
        r.status === 'shared' &&
          h(
            'div.pc-req-answer',
            h('div.pc-req-answer-title', icon('checkCircle', { size: 16 }), h('span', 'ما أتاحته لك الإدارة'), r.shared_at && h('time.muted', { datetime: r.shared_at }, relative(r.shared_at))),
            r.response_text && h('p.pre', richText(r.response_text)),
            docs.length ? h('ul.pc-docs.pc-docs-tight', docs.map((x) => docItem(x))) : null,
          ),
        r.own &&
          r.status === 'pending_admin' &&
          h(
            'div.pc-req-actions',
            asyncButton(
              'إلغاء الطلب',
              async () => {
                const ok = await confirmDialog({
                  title: 'إلغاء الطلب',
                  message: 'سيُلغى هذا الطلب ولن يُعرض على الإدارة. هل تريد المتابعة؟',
                  confirmLabel: 'نعم، إلغاء الطلب',
                  cancelLabel: 'تراجع',
                  danger: true,
                });
                if (!ok) return;
                await api.post(`/lawyer/info-requests/${encodeURIComponent(r.id)}/cancel`);
                toast('أُلغي الطلب', 'success');
                await refresh();
              },
              { variant: 'ghost', size: 'sm', icon: 'x' },
            ),
          ),
      );
    };
    return card({
      title: 'طلبات المعلومات والمستندات',
      icon: 'message',
      subtitle: 'سيصل طلبك للإدارة أولًا، وهي التي تتواصل مع العميل',
      body: frag(
        can &&
          h(
            'div.pc-req-buttons',
            button('طلب معلومات', { variant: 'secondary', icon: 'message', onClick: safe(() => openInfoDialog('information')) }),
            button('طلب مستند', { variant: 'secondary', icon: 'paperclip', onClick: safe(() => openInfoDialog('document')) }),
          ),
        own.length || shared.length
          ? frag(
              own.length ? h('ul.pc-reqs', own.map(item)) : null,
              shared.length
                ? frag(h('h3.pc-subhead.mt-3', icon('link', { size: 16 }), 'معلومات أتاحتها الإدارة من طلبات أخرى في الملف'), h('ul.pc-reqs', shared.map(item)))
                : null,
            )
          : emptyState('لم ترسل أي طلبات في هذا الملف بعد.', null, { compact: true, icon: 'message' }),
      ),
    });
  }

  async function openInfoDialog(kind) {
    const isDoc = kind === 'document';
    const res = await formDialog({
      title: isDoc ? 'طلب مستند من العميل' : 'طلب معلومات من العميل',
      intro: 'سيصل طلبك للإدارة أولًا، وهي التي تتواصل مع العميل عبر قنواتها الرسمية ثم تتيح لك الرد بعد مراجعته. اكتب المطلوب بوضوح وباختصار.',
      submitLabel: 'إرسال الطلب للإدارة',
      fields: [
        {
          name: 'question',
          label: isDoc ? 'ما المستند المطلوب؟ ولماذا تحتاجه؟' : 'ما المعلومة المطلوبة؟',
          type: 'textarea',
          rows: 5,
          required: true,
          minLength: 5,
          maxLength: 3000,
          placeholder: isDoc ? 'مثال: صورة إعلام الوراثة إن كان قد صدر، وإن لم يصدر نرجو الإفادة بذلك.' : 'مثال: هل صدر قرار بتعيين وصي على القاصرين؟ ومن هو الوصي؟',
        },
      ],
      onSubmit: (vals) => api.post(`${base}/info-requests`, { kind, question: vals.question }),
    });
    if (!res) return;
    toast('أُرسل طلبك للإدارة. سيصلك إشعار عند إرساله للعميل أو إتاحة الرد لك.', 'success', 5000);
    await refresh();
  }

  // ───────────── طلب مساعدة محامٍ آخر ─────────────

  function counselCard(v) {
    const can = v.permissions.can_request;
    const list = v.counsel_requests || [];
    if (!can && !list.length) return null;
    const issueNo = new Map((v.issues || []).map((i) => [i.id, i.number]));
    return card({
      title: 'طلب مساعدة محامٍ آخر',
      icon: 'users',
      subtitle: 'رأي ثانٍ أو رأي متخصص أو مراجعة مستند أو مشاركة محامٍ',
      body: frag(
        h('p.pc-note', icon('lock', { size: 15 }), h('span', 'لن يُفتح الملف لأي محامٍ تلقائيًا؛ تختار الإدارة المحامي وتحدد ما يراه.')),
        can && button('طلب مساعدة محامٍ', { variant: 'secondary', icon: 'userPlus', block: true, onClick: openCounselDialog }),
        list.length
          ? h(
              'ul.pc-reqs.mt-3',
              list.map((r) =>
                h(
                  'li.pc-req',
                  { class: `is-${r.status}` },
                  h('div.pc-req-head', badge(r.kind_label || label('counsel_kind', r.kind), 'primary'), statusBadge('counsel_status', r.status)),
                  r.specialty_label && h('div.small', h('span.muted', 'التخصص: '), r.specialty_label),
                  h('p.pc-req-q', richText(r.description)),
                  r.issue_ids && r.issue_ids.length
                    ? h('div.small', h('span.muted', 'المسائل المشار إليها: '), r.issue_ids.map((x) => (issueNo.has(x) ? `رقم ${issueNo.get(x)}` : `#${x}`)).join('، '))
                    : null,
                  r.assigned_lawyer && h('div.pc-req-assigned', icon('user', { size: 15 }), h('span', 'أسندته الإدارة إلى: '), h('strong', r.assigned_lawyer)),
                  r.status === 'rejected' && r.admin_note && h('div.pc-req-note', h('strong', 'سبب عدم الموافقة: '), richText(r.admin_note)),
                  h('div.pc-req-meta', h('time', { datetime: r.created_at, title: dateTime(r.created_at) }, `طُلب ${relative(r.created_at)}`)),
                  r.status === 'pending_admin' &&
                    h(
                      'div.pc-req-actions',
                      asyncButton(
                        'إلغاء الطلب',
                        async () => {
                          const ok = await confirmDialog({
                            title: 'إلغاء طلب المساعدة',
                            message: 'سيُلغى طلب المساعدة ولن يُعرض على الإدارة. هل تريد المتابعة؟',
                            confirmLabel: 'نعم، إلغاء الطلب',
                            cancelLabel: 'تراجع',
                            danger: true,
                          });
                          if (!ok) return;
                          await api.post(`/lawyer/counsel-requests/${encodeURIComponent(r.id)}/cancel`);
                          toast('أُلغي طلب المساعدة', 'success');
                          await refresh();
                        },
                        { variant: 'ghost', size: 'sm', icon: 'x' },
                      ),
                    ),
                ),
              ),
            )
          : null,
      ),
    });
  }

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
    const issuesField = issues.length
      ? field('المسائل التي يتعلق بها الطلب', h('div.pc-check-col', issueBoxes.map((x) => x.el)), { group: true, full: true, hint: 'يمكنك الإشارة فقط إلى المسائل المتاحة لك.' })
      : null;

    // يمكن الإشارة فقط إلى المستندات التي أتاحتها الإدارة
    const docs = (v.documents || []).filter((d) => d.granted !== false);
    const docBoxes = docs.map((d) => {
      const cb = h('input', { type: 'checkbox', value: String(d.id) });
      return { id: d.id, cb, el: h('label.check', cb, h('span', { dir: 'auto' }, d.title || d.filename)) };
    });
    const docsField = docs.length
      ? field('المستندات ذات الصلة', h('div.pc-check-col', docBoxes.map((x) => x.el)), { group: true, full: true, hint: 'تقرر الإدارة ما يُتاح للمحامي المساعد فعليًا.' })
      : null;

    const desc = h('textarea.input', {
      rows: 5,
      maxlength: 3000,
      placeholder: 'مثال: أطلب رأيًا متخصصًا في الأثر الضريبي لانتقال الشقة بالميراث ثم بيعها، وبالأخص المسألة رقم 3.',
    });
    const descField = field('وصف المطلوب', desc, { required: true, full: true, hint: 'وضّح السؤال المحدد الذي تحتاج فيه رأي الزميل (10 أحرف على الأقل).' });

    const formAlert = h('div.alert.alert-danger', { role: 'alert', hidden: true });
    const grid = h('div.form-grid.form-grid-1', kindField, specField, issuesField, docsField, descField);

    const selectedKind = () => (radios.find((r) => r.input.checked) || {}).value || null;
    const syncSpec = () => {
      const required = selectedKind() === 'specialist_input';
      specField.classList.toggle('pc-required', required);
      specSelect.required = required;
    };
    radios.forEach((r) => r.input.addEventListener('change', () => {
      kindField.setError('');
      syncSpec();
    }));
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
      title: 'طلب مساعدة محامٍ آخر',
      size: 'lg',
      body: frag(
        alertBox('لن يُفتح الملف لأي محامٍ تلقائيًا؛ تختار الإدارة المحامي وتحدد ما يراه من الملف، وتظهر لك حالة الطلب هنا.', 'info', { icon: 'lock' }),
        h('form.form.mt-3', { novalidate: true, onSubmit: (e) => e.preventDefault() }, formAlert, grid),
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'إرسال الطلب للإدارة',
          variant: 'primary',
          icon: 'send',
          onClick: async () => {
            formAlert.hidden = true;
            if (!validate()) return false;
            const kind = selectedKind();
            try {
              await api.post(`${base}/counsel-requests`, {
                kind,
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
            refresh().catch((err) => toast(errorMessage(err), 'danger'));
            return undefined;
          },
        },
      ],
    });
    syncSpec();
  }

  // ───────────── التجميع ─────────────

  drawAll();
  if (justOpened) ctx.refreshShell();

  return frag(
    hosts.header,
    hosts.banners,
    h(
      'div.detail-layout.pc-workspace',
      h('div.detail-main', hosts.brief, hosts.facts, hosts.issues, hosts.docs, hosts.team, hosts.editor, hosts.versions),
      h('div.detail-side', hosts.summary, hosts.ai, hosts.info, hosts.counsel),
    ),
  );
}
