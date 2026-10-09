// بوابة المحامي — وضع الكتابة المركّز «رأيي» (الإصدار 9.1: L-03، L-13، L-14، وجانب المحامي من B91-16).
//
// لا يضيع حرف: كل ما يُكتب يُنسخ على الجهاز (localStorage، وإن تعذر ففي هذه النافذة) قبل أي إرسال، ويُحفظ على المنصة
// بعد توقف الكتابة وعند مغادرة الحقل أو إخفاء الصفحة أو عودة الاتصال، مع إعادة محاولة متدرجة. لا يُحذف نص الجهاز إلا
// بعد أن يؤكد الخادم حفظ النص نفسه. عند الفتح: نص الجهاز المبني على آخر نسخة على المنصة يُستعاد تلقائيًا، وإن اختلف
// النصان (جهاز آخر عدّل) يختار المحامي — لا كتابة صامتة فوق نص أحدث (الخادم يرد 409 draft_conflict).
//
// الهاتف: صفحة كاملة بحجم الجزء الظاهر من الشاشة (visualViewport): شريط علوي (رجوع، العنوان، حالة الحفظ)، ملاحظات
// الإدارة عند الإعادة، المحرر، وشريط سفلي فوق لوحة المفاتيح («المطلوب والمسائل»، عدد الكلمات، ⋯، «تقديم»).
// الحاسوب (≥ 1024px): المحرر (72ch) + لوحة مرجعية ثابتة 380px بتبويبات.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { time, shortDate, num, isoToCairoDate, cairoToday, label, percent, areaLabel } from '../../../lib/fmt.js';
import { button, toast, modal, icon, richText, errorMessage, errorState, setBusy, uid, badge } from '../../../lib/ui.js';
import { count } from '../../words.js';
import {
  createDraftStore,
  decideRestore,
  createAutosaver,
  wordCount,
  parseReviewNotes,
  loadNoteChecks,
  saveNoteChecks,
} from '../../components/draft-store.js';
import { diffParagraphs } from '../../components/text-diff.js';
import { docRow, openDocument, lwIcon } from '../../components/doc-viewer.js';
import { haptic } from '../../../lib/haptics.js'; // v10 experience (H-E5)
import { companyContextSection } from './assignment.js'; // v10 b2b-staff (U10-L03): «سياق الشركة» في مرجع الكتابة

const AI_PLACEHOLDER_RE = /\[يُستكمل/;
const MIN_SUBMIT_CHARS = 20;
const STEP_SEP = '\u001e';
const MAX_STEPS = 8;
const EDITABLE = ['assigned', 'in_progress', 'returned'];
const LAPTOP = '(min-width: 1024px)';

const composite = (text, steps) => (steps && steps.trim() ? `${text}${STEP_SEP}${steps}` : text);
const splitComposite = (v) => {
  const i = String(v).indexOf(STEP_SEP);
  return i < 0 ? [String(v), ''] : [v.slice(0, i), v.slice(i + 1)];
};
const stepLines = (s) => String(s || '').split('\n').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** وقت الحفظ: الساعة فقط إن كان اليوم */
function savedAt(iso) {
  if (!iso) return '';
  return isoToCairoDate(iso) === cairoToday() ? time(iso) : `${shortDate(iso)} ${time(iso)}`;
}

/** هيكل الرأي (L-14) من المسائل المتاحة النشطة — نص عادي يُبنى على الجهاز بلا أي طلب للخادم */
export function opinionSkeleton(issues) {
  const active = (issues || []).filter((i) => i.status === 'active');
  const lines = ['أولًا: الوقائع المؤثرة', '', 'ثانيًا: التكييف القانوني', '', 'ثالثًا: الرأي في المسائل'];
  for (const i of active) lines.push(`المسألة ${i.number}: ${i.title}`);
  lines.push('', 'رابعًا: التوصيات والخطوات العملية', '', 'خامسًا: المستندات المطلوبة');
  return lines.join('\n');
}

/**
 * v10 b2b-staff (U10-L04، L-58): هيكل رأي ملف الشركة — تعبئة التسليم من الرأي المعتمد تقرأ «الخلاصة التنفيذية».
 * لعقود المراجعة والصياغة والسرية يُضاف «التعديلات المقترحة على البنود».
 */
export const COMPANY_HEADINGS = Object.freeze(['الخلاصة التنفيذية', 'المخاطر الرئيسية ودرجتها', 'التوصيات', 'التحليل القانوني']);
export const COMPANY_STEPS_LABEL = 'خطوات للشركة';
export const COMPANY_WRITE_HINT = 'تصيغ الإدارة التسليم النهائي للشركة. لا تذكر اسمك داخل النص أو في الملفات.';
const CONTRACT_TYPES = ['contract_review', 'contract_drafting', 'nda'];
export function companyOpinionSkeleton(issues, requestType) {
  const active = (issues || []).filter((i) => i.status === 'active');
  const lines = [];
  COMPANY_HEADINGS.forEach((t, i) => {
    if (i) lines.push('');
    lines.push(t);
    if (t === 'التحليل القانوني') for (const x of active) lines.push(`المسألة ${x.number}: ${x.title}`);
  });
  if (CONTRACT_TYPES.includes(requestType)) lines.push('', 'التعديلات المقترحة على البنود');
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // احتياطي: تحديد النص في حقل مؤقت
    const ta = h('textarea', { style: 'position:fixed;inset-inline-start:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const base = `/lawyer/assignments/${encodeURIComponent(id)}`;
  const overviewPath = `/my/assignments/${id}`;
  const writePath = `${overviewPath}/write`;
  const user = ctx.user || {};
  const store = createDraftStore({ userId: user.id, assignmentId: id });

  // ───────────── التحميل (مع إمكانية الكتابة دون اتصال من نسخة الجهاز) ─────────────
  let view;
  let offlineBoot = false;
  try {
    view = await api.get(base);
    if (view && view.assignment && !view.assignment.first_opened_at) view = await api.post(`${base}/open`);
  } catch (err) {
    const local = store.load();
    if (err && err.status === 0 && local) {
      offlineBoot = true;
      view = {
        assignment: { id: Number(id), status: 'in_progress' },
        case: { code: local.code || '', title: '', state: 'open' },
        issues: [],
        documents: [],
        team: [],
        my_opinions: [],
        current_draft: null,
        permissions: { can_edit: true },
        ai: { claude: false },
      };
    } else {
      return h('div.lw-write-error', errorState(err, () => ctx.reload()));
    }
  }

  if (!view.permissions.can_edit) {
    // مقدَّم أو معتمد أو مغلق: إلى «رأيي» في صفحة الإسناد
    ctx.navigate(`${overviewPath}?tab=mine`, { replace: true });
    return h('div');
  }

  const a = view.assignment;
  const c = view.case;
  const claude = !!(view.ai && view.ai.claude);
  const ops = view.my_opinions || [];
  const returned = a.status === 'returned' ? [...ops].reverse().find((o) => o.status === 'returned') || null : null;
  const notes = returned ? parseReviewNotes(returned.review_note) : [];
  const checks = returned ? loadNoteChecks(user.id, returned.id) : new Set();
  const draft = view.current_draft || null;
  let version = draft ? draft.version : Math.max(0, ...ops.map((o) => o.version)) + 1;
  let baseAt = draft ? draft.updated_at : null;
  let lastSavedAt = draft ? draft.updated_at : null;
  let aiSuggestionId = draft && draft.ai_suggestion_id ? draft.ai_suggestion_id : null;
  const serverSteps = draft && Array.isArray(draft.client_steps) ? draft.client_steps.join('\n') : '';
  const codeStore = store;
  if (c.code) store.code = c.code; // يظهر في رسالة حارس الخروج
  if (offlineBoot) {
    // دون اتصال: نحتفظ بأساس نسخة الجهاز حتى تُستعاد تلقائيًا عند عودة الشبكة (لا حفظ قبل معرفة نص المنصة)
    const l = store.load();
    baseAt = l.base_updated_at || null;
    version = l.version || version;
  }

  ctx.setTitle(`رأيي · الإصدار ${num(version)}`);

  // ───────────── العناصر ─────────────
  const root = h('div.lw-write', { class: returned && 'is-returned' });
  const destroyFns = [];
  let left = false;
  let disposed = false;

  // حالة الحفظ
  const chipIcon = h('span.lw-chip-icon', { 'aria-hidden': 'true' });
  const chipText = h('span.lw-chip-text');
  const chipAction = h('span.lw-chip-action');
  const chip = h('button.lw-savechip', { type: 'button', 'aria-live': 'polite', 'aria-atomic': 'true' }, chipIcon, chipText, chipAction);
  let chipState = 'idle';
  chip.addEventListener('click', () => {
    if (chipState === 'error' || chipState === 'offline') saver.retryNow();
    else if (chipState === 'expired') window.location.reload();
  });

  function setChip(state, extra) {
    chipState = state;
    chip.dataset.state = state;
    mount(chipAction);
    let iconNode = null;
    let text = '';
    if (state === 'saved') {
      text = lastSavedAt ? `محفوظ ✓ ${savedAt(lastSavedAt)}` : 'محفوظ ✓';
    } else if (state === 'saving' || state === 'dirty') {
      iconNode = h('span.spinner', { 'aria-hidden': 'true' });
      text = 'جارٍ الحفظ…';
    } else if (state === 'offline') {
      iconNode = lwIcon('cloudOff', { size: 15 });
      text =
        codeStore.mode === 'local'
          ? 'بلا اتصال — نصك محفوظ على هذا الجهاز'
          : codeStore.mode === 'session'
            ? 'بلا اتصال — نصك محفوظ في هذه النافذة فقط'
            : 'بلا اتصال — لم يُحفظ نصك بعد؛ لا تغلق الصفحة';
    } else if (state === 'error') {
      iconNode = icon('refresh', { size: 15 });
      text = 'تعذر الحفظ — نعيد المحاولة';
    } else if (state === 'expired') {
      iconNode = icon('lock', { size: 15 });
      text = 'انتهت الجلسة — نصك محفوظ على هذا الجهاز';
      mount(chipAction, h('span.lw-chip-btn', 'ادخل للمتابعة'));
    } else if (state === 'empty') {
      text = 'النص فارغ — لن يُحفظ';
    } else if (state === 'conflict') {
      iconNode = icon('alert', { size: 15 });
      text = 'نصّان مختلفان — اختر أحدهما';
    } else if (state === 'gone') {
      iconNode = icon('alert', { size: 15 });
      text = extra || 'تعذر الحفظ';
    } else {
      text = draft ? (lastSavedAt ? `محفوظ ✓ ${savedAt(lastSavedAt)}` : 'محفوظ ✓') : 'مسودة جديدة';
    }
    mount(chipIcon, iconNode);
    chipText.textContent = text;
  }

  // المحرر
  const taId = uid('lw-opinion');
  const ta = h('textarea.lw-editor', {
    id: taId,
    dir: 'rtl',
    rows: 6,
    maxlength: 60000,
    spellcheck: 'true',
    placeholder: 'اكتب رأيك هنا…',
    'aria-label': 'نص رأيك',
  });
  const wordsEl = h('span.lw-words', { 'aria-live': 'off' });

  // خطوات عملية للمستفيد/ة (B91-16) — اختيارية ومطوية
  const stepsTa = h('textarea.input.lw-steps-input', { rows: 4, dir: 'auto', maxlength: 3000, id: uid('lw-steps'), placeholder: 'خطوة في كل سطر' });
  const stepsWarn = h('p.lw-steps-warn', { hidden: true });
  const isCompany = !!view.company; // v10 b2b-staff (U10-L04)
  const stepsLabel = isCompany ? COMPANY_STEPS_LABEL : 'خطوات عملية للمستفيد/ة';
  const stepsBox = h(
    'details.lw-steps',
    h('summary', h('span', isCompany ? `${COMPANY_STEPS_LABEL} (اختياري، حتى ${MAX_STEPS})` : 'خطوات عملية للمستفيد/ة (اختياري)'), icon('chevronDown', { size: 18, className: 'lw-chev' })),
    h('div.lw-steps-body', h('label.sr-only', { htmlFor: stepsTa.id }, stepsLabel), stepsTa, h('p.field-hint', isCompany ? 'توصيات عملية بلغة واضحة؛ تراجعها الإدارة قبل التسليم ولا تظهر باسمك.' : 'بلغة بسيطة؛ تراجعها الإدارة قبل الإرسال ولا تظهر باسمك.'), stepsWarn),
  );

  const currentValue = () => composite(ta.value, stepsTa.value);

  // ───────────── محرك الحفظ ─────────────
  function backup() {
    // بعد إزالة الصفحة (الخروج أو انتهاء الجلسة) لا نكتب أي نسخة: قد تكون حُذفت عمدًا عند الخروج
    if (disposed) return codeStore.mode;
    if (left && !saver.pending) return codeStore.mode;
    return codeStore.write({ body: ta.value, steps: stepsTa.value || undefined, base_updated_at: baseAt, version });
  }

  async function saveToServer(value, { keepalive = false } = {}) {
    if (!alive()) {
      dispose();
      throw Object.assign(new Error('detached'), { status: 409, code: 'detached' });
    }
    if (offlineBoot) throw Object.assign(new Error('offline boot'), { status: 0, code: 'network_error' });
    const [text, steps] = splitComposite(value);
    backup();
    const lines = stepLines(steps).slice(0, MAX_STEPS).map((s) => s.slice(0, 300));
    // 'none': بدأنا قبل وجود مسودة على المنصة — إن ظهرت مسودة من جهاز آخر بنص مختلف يرد الخادم 409 بدل الكتابة فوقها
    const payload = { body: text, base_updated_at: baseAt || 'none', ai_suggestion_id: aiSuggestionId || undefined, client_steps: lines };
    const approxBytes = text.length * 2 + steps.length * 2 + 400;
    const res = await api.put(`${base}/draft`, payload, { keepalive: keepalive && approxBytes < 60000 });
    baseAt = res.updated_at;
    lastSavedAt = res.updated_at;
    if (res.version && res.version !== version) {
      version = res.version;
      titleEl.textContent = `رأيي · الإصدار ${num(version)}`;
    }
    // لا يُحذف نص الجهاز إلا بعد تأكيد حفظ النص نفسه
    if (res.length === text.length && currentValue() === value) codeStore.clear();
    else backup();
    return res;
  }

  const saver = createAutosaver({
    save: saveToServer,
    skip: (v) => !splitComposite(v)[0].trim(),
    onState: (state, info) => {
      if (disposed) return;
      if (state === 'conflict') {
        const d = (info && info.details) || {};
        showConflict({ body: d.server_body || '', updated_at: d.server_updated_at, steps: null }, { body: ta.value, steps: stepsTa.value, at: Date.now() });
        setChip('conflict');
        return;
      }
      if (state === 'gone') {
        backup();
        setChip('gone', errorMessage(info));
        showGone(info);
        return;
      }
      if (state === 'offline' || state === 'error' || state === 'expired') backup();
      setChip(state === 'dirty' && !navigator.onLine ? 'offline' : state);
    },
  });

  // ───────────── الشريط العلوي ─────────────
  const titleEl = h('span.lw-write-title-text', `رأيي · الإصدار ${num(version)}`);
  const backBtn = h(
    'a.lw-write-back',
    { href: `#${overviewPath}`, onClick: () => leave() },
    icon('arrowRight', { size: 20 }),
    h('span', 'الملف'),
  );
  const topBar = h('div.lw-write-top', backBtn, h('h1.lw-write-title', titleEl, c.code ? h('span.lw-write-code', ' · ', h('bdi.lw-code', { dir: 'ltr' }, c.code)) : null), chip);

  // ───────────── ملاحظات الإدارة (شريط قابل للطي) ─────────────
  const stripCount = h('span');
  const notesList = () =>
    h(
      'ol.lw-notes',
      notes.map((n, i) => {
        const cb = h('input', { type: 'checkbox', checked: checks.has(i), 'aria-label': `عولجت الملاحظة ${i + 1}` });
        cb.addEventListener('change', () => {
          if (cb.checked) checks.add(i);
          else checks.delete(i);
          saveNoteChecks(user.id, returned.id, checks);
          syncNotes();
        });
        return h('li.lw-note', { class: checks.has(i) && 'is-done' }, h('label.lw-note-label', cb, h('span.lw-note-num', num(i + 1)), h('span.lw-note-text', { dir: 'auto' }, n)));
      }),
    );
  const notesHosts = [];
  function syncNotes() {
    stripCount.textContent = `ملاحظات الإدارة · عولج ${num(checks.size)} من ${num(notes.length)}`;
    for (const host of notesHosts) mount(host, notesList());
  }
  let strip = null;
  if (returned && notes.length) {
    const stripBody = h('div.lw-strip-body', { id: uid('lw-notes'), hidden: true });
    notesHosts.push(stripBody);
    const stripToggle = h(
      'button.lw-strip-toggle',
      { type: 'button', 'aria-expanded': 'false', 'aria-controls': stripBody.id },
      stripCount,
      icon('chevronDown', { size: 18, className: 'lw-chev' }),
    );
    stripToggle.addEventListener('click', () => {
      const open = stripBody.hidden;
      stripBody.hidden = !open;
      stripToggle.setAttribute('aria-expanded', String(open));
      strip.classList.toggle('is-open', open);
    });
    strip = h('div.lw-strip', stripToggle, stripBody);
  }

  // ───────────── المرجع: المطلوب والمسائل والمستندات والزملاء ─────────────
  const analyzeDoc = (d) =>
    import('../../components/doc-ai.js')
      .then((m) => m.openDocAi({ documentId: d.id, scope: 'lawyer', onView: () => openDocument(d) }))
      .catch((err) => toast(errorMessage(err), 'danger'));
  const docOpts = (d) => ({ claude: claude && d.granted !== false, onAnalyze: analyzeDoc, sourceLabel: view.company && d.uploaded_by_kind === 'client' ? 'من الشركة' : undefined }); // v10 b2b-staff

  function briefRef() {
    const issues = (view.issues || []).filter((i) => i.status === 'active');
    return frag(
      h('section.lw-ref-sec', h('h3', 'المطلوب منك'), a.brief ? h('p.pre', { dir: 'auto' }, richText(a.brief)) : h('p.lw-muted', 'لم تحدد الإدارة تكليفًا تفصيليًا.')),
      h(
        'section.lw-ref-sec',
        h('h3', 'المسائل'),
        issues.length
          ? h('ol.lw-issues', issues.map((i) => h('li.lw-issue', h('span.lw-issue-num', { 'aria-hidden': 'true' }, num(i.number)), h('span.lw-issue-text', h('span.sr-only', `المسألة ${i.number}: `), h('span', { dir: 'auto' }, i.title)))))
          : h('p.lw-muted', 'لا مسائل محددة متاحة لك.'),
      ),
    );
  }
  function companyRef() {
    const host = h('div.lw-co-ref');
    const coOpts = { role: view.assignment && view.assignment.role, closed: !!(view.case && view.case.state === 'closed') }; // gate J-07/K10
    import('../../../lib/company-catalog-fields.js')
      .then((m) => mount(host, companyContextSection(view.company, { fields: m.memoryFields, ...coOpts })))
      .catch(() => mount(host, companyContextSection(view.company, coOpts)));
    return host;
  }
  function docsRef() {
    const docs = view.documents || [];
    return docs.length ? h('ul.lw-docs', docs.map((d) => docRow(d, docOpts(d)))) : h('p.lw-muted', 'لم تُتح لك الإدارة مستندات بعد.');
  }
  function teamRef() {
    const team = view.team || [];
    if (!team.length) return h('p.lw-muted', 'لا آراء زملاء متاحة لك.');
    return h(
      'div.lw-team',
      team.map((t) =>
        h(
          'details.lw-team-item',
          h('summary.lw-team-row', h('span.lw-team-who', [t.lawyer_name, t.role_label, t.opinion ? label('opinion_status', t.opinion.status) : 'لم يُقدَّم بعد'].filter(Boolean).join(' · ')), icon('chevronDown', { size: 18, className: 'lw-chev' })),
          h('div.lw-team-body', t.opinion ? h('div.lw-opinion-read.pre', { dir: 'auto' }, richText(t.opinion.body)) : h('p.lw-muted', 'سيصلك إشعار عند تقديم رأيه.')),
        ),
      ),
    );
  }
  function similarRef() {
    const host = h('div.lw-similar', h('p.lw-muted', 'ملخصات مجهّلة من ملفات سابقة راجعتها الإدارة.'));
    const btn = button('اعرض الحالات المشابهة', {
      variant: 'secondary',
      icon: 'book',
      onClick: async (e) => {
        setBusy(e.currentTarget, true);
        try {
          const res = await api.get(`${base}/similar`);
          const items = (res && res.items) || [];
          mount(
            host,
            items.length
              ? h(
                  'ul.lw-similar-list',
                  items.map((s) =>
                    h(
                      'li.lw-similar-item',
                      h('div.lw-similar-head', h('strong', { dir: 'auto' }, s.title), s.score != null ? badge(`تشابه ${percent(s.score)}`, 'info') : null),
                      h('p.lw-muted', areaLabel(s.legal_area)),
                      s.key_points ? h('p.pre', { dir: 'auto' }, s.key_points) : null,
                    ),
                  ),
                )
              : h('p.lw-muted', 'لا توجد حالات مشابهة معتمدة بعد.'),
          );
        } catch (err) {
          mount(host, errorState(err));
        } finally {
          if (e.currentTarget) setBusy(e.currentTarget, false);
        }
      },
    });
    return h('div', host, btn);
  }

  // اللوحة المرجعية على الحاسوب (تبويبات)
  const refTabs = [
    view.company ? { key: 'company', label: 'سياق الشركة', render: () => companyRef() } : null, // v10 b2b-staff (U10-L03)
    { key: 'brief', label: 'المطلوب والمسائل', render: briefRef },
    returned && notes.length ? { key: 'notes', label: 'ملاحظات الإدارة', render: () => { const host = h('div.lw-notes-host'); notesHosts.push(host); mount(host, notesList()); return host; } } : null,
    { key: 'docs', label: 'المستندات', render: docsRef },
    { key: 'team', label: 'آراء الزملاء', render: teamRef },
    { key: 'similar', label: 'حالات مشابهة', render: similarRef },
  ].filter(Boolean);
  let refActive = returned && notes.length ? 'notes' : 'brief';
  const refBody = h('div.lw-ref-body', { role: 'tabpanel', tabindex: '0' });
  const refTabsEl = h('div.lw-ref-tabs', { role: 'tablist', 'aria-label': 'مرجع الكتابة' });
  const refCache = new Map();
  function drawRef() {
    mount(
      refTabsEl,
      refTabs.map((t) =>
        h('button.lw-ref-tab', { type: 'button', role: 'tab', 'aria-selected': String(t.key === refActive), onClick: () => { refActive = t.key; drawRef(); } }, t.label),
      ),
    );
    if (!refCache.has(refActive)) refCache.set(refActive, refTabs.find((t) => t.key === refActive).render());
    mount(refBody, refCache.get(refActive));
  }
  const refPane = h('aside.lw-ref', { 'aria-label': 'مرجع الكتابة' }, refTabsEl, refBody);

  // لوحة «المطلوب والمسائل» على الهاتف (70vh، للقراءة فقط) — تعيد المؤشر لمكانه عند الإغلاق
  function openRefSheet() {
    const s0 = ta.selectionStart;
    const s1 = ta.selectionEnd;
    modal({
      title: 'المطلوب والمسائل',
      size: 'md',
      sheet: true, className: 'lw-sheet lw-ref-sheet',
      body: h('div.lw-ref-sheet-body', view.company ? companyRef() : null, briefRef(), h('section.lw-ref-sec', h('h3', 'المستندات'), docsRef())), // v10 b2b-staff
      onClose: () => {
        requestAnimationFrame(() => {
          ta.focus({ preventScroll: true });
          try {
            ta.setSelectionRange(s0, s1);
          } catch {
            /* لا شيء */
          }
        });
      },
    });
  }

  // ───────────── أدوات ⋯ ─────────────
  function insertSkeleton() {
    const sk = view.company ? companyOpinionSkeleton(view.issues, view.company.request_type) : opinionSkeleton(view.issues); // v10 b2b-staff
    const wasEmpty = !ta.value.trim();
    ta.value = wasEmpty ? sk : `${ta.value.replace(/\s+$/, '')}\n\n${sk}`;
    onEdit();
    ta.focus({ preventScroll: true });
    // المؤشر بعد العنوان الأول ليبدأ الكتابة تحته
    const pos = wasEmpty ? sk.indexOf('\n') + 1 : ta.value.length;
    ta.setSelectionRange(pos, pos);
    toast('أُدرج هيكل الرأي. اكتب تحت كل عنوان.', 'success');
  }

  function openCompare() {
    if (!returned) return;
    const d = diffParagraphs(returned.body, ta.value);
    const header = d.changed
      ? `التغييرات منذ الإصدار ${num(returned.version)}: ${count(d.changed, ['فقرة واحدة', 'فقرتان', 'فقرات', 'فقرة'])}`
      : `لا تغييرات منذ الإصدار ${num(returned.version)}`;
    const blocks = d.blocks.map((b) => {
      if (b.type === 'same') return h('p.lw-diff-p', { dir: 'auto' }, b.text);
      if (b.type === 'removed') return h('p.lw-diff-p.is-removed', { dir: 'auto' }, h('span.sr-only', 'حُذفت: '), h('del', b.text));
      if (b.type === 'added') return h('p.lw-diff-p.is-added', { dir: 'auto' }, h('span.sr-only', 'أُضيفت: '), h('ins', b.text));
      return h(
        'p.lw-diff-p.is-changed',
        { dir: 'auto' },
        h('span.sr-only', 'عُدّلت: '),
        b.words.map((w, i) => [i ? ' ' : '', w.op === 'add' ? h('ins', w.text) : w.op === 'del' ? h('del', w.text) : w.text]),
      );
    });
    let m = null;
    m = modal({
      title: header,
      size: 'lg',
      className: 'lw-diff-sheet',
      body: h('div.lw-diff', blocks),
      actions: [{ label: 'رجوع للكتابة', variant: 'primary', icon: 'edit', onClick: () => undefined }],
      onClose: () => requestAnimationFrame(() => ta.focus({ preventScroll: true })),
    });
    void m;
  }

  async function aiDraft(btn) {
    setBusy(btn, true);
    try {
      const res = await api.post(`${base}/ai/draft`);
      if (!res || !res.text) throw new Error('لم يُرجِع المساعد نصًا، حاول مرة أخرى');
      aiSuggestionId = res.id || aiSuggestionId;
      if (!ta.value.trim()) {
        ta.value = res.text;
        onEdit();
        toast('أُدرجت المسودة الآلية. راجعها قبل التقديم.', 'success', 5000);
      } else {
        let mode = null;
        modal({
          title: 'مسودة أولية آلية',
          size: 'lg',
          sheet: true, className: 'lw-sheet',
          body: frag(h('p.lw-muted', 'مسودة للمساعدة فقط — راجعها قبل التقديم.'), h('div.lw-ai-preview.pre', { dir: 'auto', tabindex: '0' }, res.text)),
          actions: [
            { label: 'إلغاء', variant: 'ghost' },
            { label: 'أضفها في النهاية', variant: 'secondary', onClick: () => { mode = 'append'; } },
            { label: 'استبدل نصي', variant: 'primary', onClick: () => { mode = 'replace'; } },
          ],
          onClose: () => {
            if (!mode) return;
            ta.value = mode === 'append' ? `${ta.value.replace(/\s+$/, '')}\n\n${res.text}` : res.text;
            onEdit();
          },
        });
      }
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(btn, false);
    }
  }

  function openSimilarSheet() {
    modal({ title: 'حالات مشابهة اعتمدتها المؤسسة', size: 'md', sheet: true, className: 'lw-sheet', body: similarRef() });
  }

  function openMenu() {
    const phone = !window.matchMedia(LAPTOP).matches;
    let m = null;
    const item = (labelText, hint, iconNode, fn) =>
      h(
        'button.lw-menu-item',
        { type: 'button', onClick: (e) => { m.close('action'); fn(e.currentTarget); } },
        h('span.lw-menu-icon', iconNode),
        h('span.lw-menu-text', h('strong', labelText), hint ? h('span.lw-menu-hint', hint) : null),
      );
    m = modal({
      title: 'أدوات الكتابة',
      size: 'sm',
      sheet: true, className: 'lw-sheet',
      body: h(
        'div.lw-menu',
        item('هيكل الرأي', 'عناوين الرأي والمسائل المتاحة لك', icon('queue', { size: 20 }), insertSkeleton),
        returned ? item('قارن بالإصدار المعاد', `ما تغيّر منذ الإصدار ${num(returned.version)}`, icon('refresh', { size: 20 }), openCompare) : null,
        claude && !view.company ? item('مسودة أولية آلية', 'مسودة للمساعدة فقط — راجعها قبل التقديم.', icon('sparkle', { size: 20 }), () => aiDraft(menuBtn)) : null, // v10 b2b-staff (L-29): لا مسودة آلية لملفات الشركات
        phone ? item('حالات مشابهة اعتمدتها المؤسسة', null, icon('book', { size: 20 }), openSimilarSheet) : null,
      ),
    });
  }

  // ───────────── الشريط السفلي ─────────────
  // على الشاشات الأضيق يظهر «المسائل» بدل النص الكامل؛ والاسم المقروء لقارئ الشاشة ثابت
  const refBtn = h(
    'button.lw-tool.lw-tool-ref',
    { type: 'button', 'aria-label': 'المطلوب والمسائل', onClick: openRefSheet },
    icon('book', { size: 18 }),
    h('span.lw-tool-long', { 'aria-hidden': 'true' }, 'المطلوب والمسائل'),
    h('span.lw-tool-short', { 'aria-hidden': 'true' }, 'المسائل'),
  );
  const skeletonBtn = h('button.lw-tool.lw-tool-skeleton', { type: 'button', onClick: insertSkeleton }, icon('queue', { size: 18 }), h('span', 'هيكل الرأي'));
  const menuBtn = h('button.lw-tool.lw-tool-more', { type: 'button', 'aria-label': 'أدوات أخرى', onClick: openMenu }, icon('more', { size: 22 }));
  const submitBtn = button('تقديم', { variant: 'primary', icon: 'send', className: 'lw-submit', onClick: () => openSubmit() });
  const kbdHint = h('span.lw-kbd-hint', 'Ctrl+S للحفظ الفوري');
  const toolbar = h('div.lw-write-toolbar', refBtn, skeletonBtn, wordsEl, kbdHint, h('span.lw-tool-spacer'), menuBtn, submitBtn);

  function updateCounters() {
    const n = wordCount(ta.value);
    wordsEl.textContent = n ? count(n, ['كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة']) : '';
    root.classList.toggle('is-empty', !ta.value.trim());
    const lines = stepLines(stepsTa.value);
    stepsWarn.hidden = lines.length <= MAX_STEPS;
    stepsWarn.textContent = lines.length > MAX_STEPS ? `تُحفظ أول ${count(MAX_STEPS, ['خطوة', 'خطوتين', 'خطوات', 'خطوة'])} فقط.` : '';
  }

  // نمو المحرر مع النص: لا شريط تمرير داخلي (scrollHeight === clientHeight)
  const scroller = h('div.lw-write-scroll');
  function grow() {
    const sc = window.matchMedia(LAPTOP).matches ? null : scroller;
    const before = sc ? sc.scrollTop : window.scrollY;
    ta.style.height = 'auto';
    const borders = ta.offsetHeight - ta.clientHeight;
    ta.style.height = `${ta.scrollHeight + Math.max(0, borders)}px`;
    if (sc) sc.scrollTop = before;
    else if (Math.abs(window.scrollY - before) > 1) window.scrollTo(0, before);
  }

  let backupTimer = null;
  function onEdit() {
    updateCounters();
    grow();
    if (!navigator.onLine) backup();
    else {
      clearTimeout(backupTimer);
      backupTimer = setTimeout(backup, 300);
    }
    saver.setBody(currentValue());
  }
  ta.addEventListener('input', onEdit);
  stepsTa.addEventListener('input', onEdit);
  ta.addEventListener('blur', () => saver.flush());
  stepsTa.addEventListener('blur', () => saver.flush());
  root.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      backup();
      saver.retryNow();
    }
  });

  // ───────────── التعارض بين نصّين ─────────────
  const bannerHost = h('div.lw-banner-host');
  function showConflict(server, local) {
    saver.pause();
    ta.readOnly = true;
    stepsTa.readOnly = true;
    ta.value = local.body;
    stepsTa.value = local.steps || '';
    onEditQuiet();
    const localTime = local.at ? time(new Date(local.at).toISOString()) : '';
    const serverTime = server.updated_at ? savedAt(server.updated_at) : '';
    const useLocal = button('استخدم نص هذا الجهاز', {
      variant: 'primary',
      size: 'sm',
      onClick: async (e) => {
        setBusy(e.currentTarget, true);
        try {
          const lines = stepLines(stepsTa.value).slice(0, MAX_STEPS);
          const res = await api.put(`${base}/draft`, { body: ta.value, client_steps: lines, base_updated_at: baseAt || undefined, force: true, ai_suggestion_id: aiSuggestionId || undefined });
          baseAt = res.updated_at;
          lastSavedAt = res.updated_at;
          if (res.length === ta.value.length) codeStore.clear();
          resolved(currentValue());
          toast('حُفظ نص هذا الجهاز على المنصة.', 'success');
        } catch (err) {
          toast(err && err.status === 0 ? 'لا يوجد اتصال. نصك محفوظ على هذا الجهاز.' : errorMessage(err), 'warning');
        } finally {
          setBusy(e.currentTarget, false);
        }
      },
    });
    const useServer = button('استخدم نص المنصة', {
      variant: 'secondary',
      size: 'sm',
      onClick: () => {
        ta.value = server.body;
        if (server.steps != null) stepsTa.value = server.steps;
        baseAt = server.updated_at;
        lastSavedAt = server.updated_at;
        codeStore.clear();
        resolved(currentValue());
      },
    });
    const copyOther = h(
      'button.lw-link',
      {
        type: 'button',
        onClick: async () => {
          const ok = await copyText(server.body);
          toast(ok ? 'نُسخ نص المنصة؛ يمكنك لصقه حيث تريد.' : 'تعذر النسخ تلقائيًا.', ok ? 'success' : 'warning');
        },
      },
      'انسخ النص الآخر',
    );
    mount(
      bannerHost,
      h(
        'div.lw-conflict',
        { role: 'alert' },
        h('p', `يوجد نصّان مختلفان: على هذا الجهاز (${count(wordCount(local.body), ['كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة'])}، ${localTime}) وعلى المنصة (${count(wordCount(server.body), ['كلمة واحدة', 'كلمتان', 'كلمات', 'كلمة'])}، ${serverTime}).`),
        h('div.lw-conflict-actions', useLocal, useServer),
        copyOther,
      ),
    );
    setChip('conflict');
  }
  function resolved(value) {
    mount(bannerHost);
    ta.readOnly = false;
    stepsTa.readOnly = false;
    onEditQuiet();
    saver.markSaved(value);
    saver.resume();
    saver.setBody(value);
    setChip('saved');
  }
  function onEditQuiet() {
    updateCounters();
    requestAnimationFrame(grow);
  }

  function showGone(err) {
    mount(
      bannerHost,
      h(
        'div.lw-conflict',
        { role: 'alert' },
        h('p', `${errorMessage(err)}. نصك محفوظ على هذا الجهاز.`),
        h(
          'div.lw-conflict-actions',
          button('انسخ نصك', { variant: 'secondary', size: 'sm', icon: 'copy', onClick: async () => toast((await copyText(ta.value)) ? 'نُسخ نصك.' : 'تعذر النسخ تلقائيًا.', 'info') }),
          button('افتح الملف', { variant: 'ghost', size: 'sm', href: `#${overviewPath}` }),
        ),
      ),
    );
  }

  // ───────────── التقديم ─────────────
  async function openSubmit() {
    const body = ta.value;
    if (body.trim().length < MIN_SUBMIT_CHARS) {
      toast(`اكتب رأيك (${count(MIN_SUBMIT_CHARS, ['حرف', 'حرفين', 'أحرف', 'حرفًا'])} على الأقل) قبل التقديم.`, 'warning');
      ta.focus();
      return;
    }
    if (AI_PLACEHOLDER_RE.test(body)) {
      toast('احذف أو أكمل أجزاء «[يُستكمل…]» قبل التقديم.', 'warning', 6000);
      const at = body.search(AI_PLACEHOLDER_RE);
      ta.focus();
      ta.setSelectionRange(at, at);
      return;
    }
    if (chipState === 'conflict') {
      toast('اختر أحد النصين أولًا.', 'warning');
      return;
    }
    const err = h('div.lw-req-error', { role: 'alert', hidden: !(navigator.onLine === false) });
    if (navigator.onLine === false) mount(err, icon('alert', { size: 18 }), h('span', 'لا يوجد اتصال. نصك محفوظ على هذا الجهاز؛ قدّمه عند عودة الشبكة.'));
    const hoursIn = h('input.input', { type: 'number', min: 0, max: 1000, step: '0.5', inputmode: 'decimal', id: uid('lw-hours') });
    const hoursWrap = h('div.lw-field', { hidden: true }, h('label.field-label', { htmlFor: hoursIn.id }, 'عدد الساعات (اختياري)'), hoursIn);
    const hoursToggle = h('button.lw-more-link', { type: 'button', onClick: () => { hoursWrap.hidden = false; hoursToggle.hidden = true; hoursIn.focus(); } }, '+ عدد الساعات (اختياري)');
    modal({
      title: 'تقديم الرأي للإدارة؟',
      size: 'sm',
      sheet: true, className: 'lw-sheet lw-submit-sheet',
      body: h(
        'div.lw-submit-body',
        h('p', 'لن تستطيع التعديل أثناء المراجعة. ستصلك النتيجة هنا.'),
        returned && notes.length ? h('p.lw-submit-notes', `الملاحظات المعالَجة: ${num(checks.size)} من ${num(notes.length)}`) : null,
        hoursToggle,
        hoursWrap,
        err,
      ),
      actions: [
        { label: 'ليس الآن', variant: 'ghost' },
        {
          label: 'قدّم الآن',
          variant: 'primary',
          icon: 'send',
          onClick: async () => {
            err.hidden = true;
            const show = (msg) => {
              mount(err, icon('alert', { size: 18 }), h('span', msg));
              err.hidden = false;
              return false;
            };
            backup();
            // أولًا: حفظ أي تعديل معلّق (ويكشف التعارض إن وُجد)
            const ok = await saver.flush();
            if (chipState === 'conflict') return show('تغيّر نصك على جهاز آخر؛ اختر أحد النصين أولًا.');
            if (!ok && (chipState === 'offline' || navigator.onLine === false)) return show('لا يوجد اتصال. نصك محفوظ على هذا الجهاز؛ قدّمه عند عودة الشبكة.');
            const hours = hoursIn.value === '' ? undefined : Number(hoursIn.value);
            if (hours !== undefined && (!Number.isFinite(hours) || hours < 0 || hours > 1000)) return show('عدد الساعات غير صالح.');
            try {
              saver.pause();
              const res = await api.post(`${base}/submit`, {
                body: ta.value,
                hours_spent: hours,
                ai_suggestion_id: aiSuggestionId || undefined,
                client_steps: stepLines(stepsTa.value).slice(0, MAX_STEPS),
                // نافذة قديمة لا تقدّم فوق نص أحدث حُفظ من جهاز آخر (409 draft_conflict ← يختار المحامي)
                base_updated_at: baseAt || 'none',
              });
              codeStore.clear();
              left = true;
              saver.destroy();
              cleanup();
              haptic('success'); // v10 experience (H-E5, X10-M6): الرأي قُدّم
              toast(`قُدّم رأيك (الإصدار ${num(res.version)}). ستصلك النتيجة هنا.`, 'success', 6000);
              ctx.navigate(`${overviewPath}?tab=mine`);
              return undefined;
            } catch (e) {
              saver.resume();
              backup();
              if (e && e.status === 0) return show('لا يوجد اتصال. نصك محفوظ على هذا الجهاز؛ قدّمه عند عودة الشبكة.');
              if (e && e.status === 409 && e.code === 'draft_conflict') {
                // تغيّر النص على المنصة من جهاز آخر: لا تقديم ولا كتابة فوقه — يختار المحامي أحد النصين ثم يقدّم
                const d = e.details || {};
                showConflict({ body: d.server_body || '', updated_at: d.server_updated_at, steps: null }, { body: ta.value, steps: stepsTa.value, at: Date.now() });
                return undefined;
              }
              return show(errorMessage(e));
            }
          },
        },
      ],
    });
  }

  // ───────────── دورة الحياة ─────────────
  // الصفحة أُزيلت دون تنقل (الخروج أو انتهاء الجلسة): نتوقف تمامًا حتى لا تُكتب نسخة قديمة بعد حذفها
  let wasConnected = false;
  const alive = () => !wasConnected || root.isConnected;
  function dispose() {
    if (disposed) return;
    disposed = true;
    left = true;
    saver.destroy();
    window.removeEventListener('hashchange', onHash);
    cleanup();
  }
  const onHidden = () => {
    if (!alive()) return dispose();
    if (document.visibilityState === 'hidden') {
      if (saver.pending) backup();
      saver.flush({ keepalive: true });
    } else if (saver.pending) saver.flush();
    return undefined;
  };
  const onPageHide = () => {
    if (alive() && saver.pending) backup();
  };
  const onBeforeUnload = () => {
    if (alive() && saver.pending) backup();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);
  destroyFns.push(() => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
  });
  // انقطاع الجلسة: النص على الجهاز قبل ظهور شاشة الدخول، ثم يعود الموجّه إلى هذه الصفحة بعد الدخول
  const onExpired = () => {
    if (!alive()) return dispose();
    backup();
    setChip('expired');
    // تُستبدل الصفحة بشاشة الدخول: لا مستمعات قديمة تكتب نصًا قديمًا بعد ذلك
    left = true;
    saver.destroy();
    dispose();
    return undefined;
  };
  // capture: يعمل قبل مستمع main.js الذي يستبدل الصفحة بشاشة الدخول، فتُكتب آخر الحروف (ما زال فيها مؤقت الـ300 مللي ثانية)
  window.addEventListener('auth:expired', onExpired, { capture: true });
  destroyFns.push(() => window.removeEventListener('auth:expired', onExpired, { capture: true }));
  const onOnlineBoot = () => {
    if (offlineBoot) ctx.reload();
  };
  if (offlineBoot) {
    window.addEventListener('online', onOnlineBoot);
    // بعض المتصفحات لا تطلق online لصفحة فُتحت دون اتصال: فحص خفيف كل 5 ثوانٍ
    const poll = setInterval(() => {
      if (!alive()) return dispose();
      if (document.visibilityState === 'hidden') return undefined;
      fetch('/healthz', { cache: 'no-store' })
        .then((r) => r.ok && onOnlineBoot())
        .catch(() => {});
      return undefined;
    }, 5000);
    destroyFns.push(() => {
      window.removeEventListener('online', onOnlineBoot);
      clearInterval(poll);
    });
  }
  const onOffline = () => {
    if (!alive()) return dispose();
    if (saver.pending) {
      backup();
      setChip('offline');
    }
    return undefined;
  };
  window.addEventListener('offline', onOffline);
  destroyFns.push(() => window.removeEventListener('offline', onOffline));

  // الهاتف: الصفحة بحجم الجزء الظاهر فوق لوحة المفاتيح
  const vv = window.visualViewport;
  const syncVV = () => {
    if (!vv) return;
    root.style.setProperty('--lw-vv-top', `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty('--lw-vv-h', `${Math.round(vv.height)}px`);
  };
  if (vv) {
    vv.addEventListener('resize', syncVV);
    vv.addEventListener('scroll', syncVV);
    destroyFns.push(() => {
      vv.removeEventListener('resize', syncVV);
      vv.removeEventListener('scroll', syncVV);
    });
    syncVV();
  }
  const mq = window.matchMedia(LAPTOP);
  const onMq = () => requestAnimationFrame(grow);
  mq.addEventListener('change', onMq);
  destroyFns.push(() => mq.removeEventListener('change', onMq));
  document.body.classList.add('lw-writing');
  destroyFns.push(() => document.body.classList.remove('lw-writing'));
  // أُزيلت الصفحة دون تغيّر الرابط (الخروج يستبدل التطبيق بشاشة الدخول): نتوقف فورًا — لا حفظ ولا نسخة بعد الخروج،
  // ولا يبقى منع تمرير الصفحة (lw-writing) على شاشة الدخول
  const detachWatch = new MutationObserver(() => {
    if (wasConnected && !root.isConnected) dispose();
  });
  detachWatch.observe(document.body, { childList: true, subtree: true });
  destroyFns.push(() => detachWatch.disconnect());

  function cleanup() {
    clearTimeout(backupTimer);
    while (destroyFns.length) {
      try {
        destroyFns.pop()();
      } catch {
        /* لا شيء */
      }
    }
  }
  function leave() {
    if (left) return;
    left = true;
    if (saver.pending) {
      codeStore.write({ body: ta.value, steps: stepsTa.value || undefined, base_updated_at: baseAt, version });
      saver.flush({ keepalive: true }).finally(() => saver.destroy());
    } else saver.destroy();
    cleanup();
  }
  const onHash = () => {
    const p = String(window.location.hash).replace(/^#!?/, '').split('?')[0].replace(/\/+$/, '');
    if (p !== writePath) {
      window.removeEventListener('hashchange', onHash);
      leave();
    }
  };
  window.addEventListener('hashchange', onHash);

  // ───────────── الاستعادة عند الفتح ─────────────
  const local = codeStore.load();
  const serverValue = { body: composite(draft ? draft.body : '', serverSteps), updated_at: draft ? draft.updated_at : null };
  const localValue = local ? { ...local, body: composite(local.body, local.steps || '') } : null;
  const decision = offlineBoot ? { action: 'offline' } : decideRestore(serverValue, localValue);
  ta.value = draft ? draft.body : '';
  stepsTa.value = serverSteps;
  if (serverSteps) stepsBox.open = true;
  saver.markSaved(currentValue());

  // ───────────── التجميع ─────────────
  const editorCol = h(
    'div.lw-write-main',
    bannerHost,
    h('label.sr-only', { htmlFor: taId }, 'نص رأيك'),
    ta,
    view.company ? h('p.field-hint.lw-co-hint', icon('info', { size: 14 }), COMPANY_WRITE_HINT) : null, // v10 b2b-staff (U10-L04)
    stepsBox,
  );
  mount(scroller, editorCol);
  mount(root, topBar, strip, h('div.lw-write-grid', h('div.lw-write-col', scroller, toolbar), refPane));
  drawRef();
  if (strip) syncNotes();
  else if (notesHosts.length) syncNotes();

  if (decision.action === 'restore') {
    ta.value = local.body;
    stepsTa.value = local.steps || stepsTa.value;
    if (stepsTa.value) stepsBox.open = true;
    const n = Math.max(1, wordCount(local.body) - wordCount(draft ? draft.body : ''));
    saver.setBody(currentValue());
    saver.flush();
    toast(`استعدنا ${count(n, ['كلمة واحدة', 'كلمتين', 'كلمات', 'كلمة'])} كتبتها دون اتصال.`, 'success', 5000);
  } else if (decision.action === 'conflict') {
    showConflict({ body: draft ? draft.body : '', updated_at: draft ? draft.updated_at : null, steps: serverSteps }, { body: local.body, steps: local.steps || '', at: local.at });
  } else if (decision.action === 'offline') {
    ta.value = local.body;
    stepsTa.value = local.steps || '';
    saver.markSaved(currentValue());
    setChip('offline');
  } else {
    if (local) codeStore.clear();
    setChip(draft ? 'saved' : 'idle');
  }
  updateCounters();
  requestAnimationFrame(() => {
    wasConnected = root.isConnected;
    grow();
    if (decision.action !== 'conflict') {
      // المؤشر في نهاية النص
      ta.focus({ preventScroll: true });
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      if (!window.matchMedia(LAPTOP).matches) scroller.scrollTop = scroller.scrollHeight;
    }
  });
  return root;
}
