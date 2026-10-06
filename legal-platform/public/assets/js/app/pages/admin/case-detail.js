// ملف الاستشارة للإدارة: «ما تراه الإدارة ليس بالضرورة ما يراه المحامي».
// الإدارة ترى كل شيء (العميل، المصدر، المحادثة، التكلفة)، وتحدد لكل محامٍ بدقة ما يطّلع عليه،
// وتتوسط بينه وبين العميل في كل طلب، وتراجع رأيه قبل إعداد نسخة مبسطة للعميل وإرسالها، وهي وحدها من يغلق الملف.

import { h, frag, mount, clear } from '../../../lib/h.js';
import { api, ApiError, filesToUploads, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, money, percent, count, date, dateTime, relative } from '../../../lib/fmt.js';
import {
  icon,
  button,
  asyncButton,
  badge,
  statusBadge,
  statusTone,
  dueBadge,
  toast,
  modal,
  form,
  field,
  fileInput,
  table,
  tabs,
  card,
  kv,
  timeline,
  chatThread,
  emptyState,
  alertBox,
  pageHeader,
  chips,
  copyButton,
  codeTag,
  ltr,
  avatar,
  errorMessage,
  timeTag,
  uid,
  statCard,
  loading,
  errorState,
  selectInput,
} from '../../../lib/ui.js';

// ───────────────────────── أدوات مشتركة (تستخدمها صفحة الملف المستمر أيضًا) ─────────────────────────

/** قنوات الإرسال المتاحة للإدارة. */
export const CHANNEL_OPTIONS = [
  { value: 'auto', label: 'تلقائي — آخر قناة تواصل منها العميل' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'بوابة العميل على الموقع' },
];

/**
 * نموذج داخل نافذة مع إتاحة واجهة النموذج (setup) وإمكانية إضافة محتوى قبله وبعده.
 * يعيد Promise بنتيجة onSubmit (أو القيم) عند الحفظ، أو null عند الإلغاء.
 */
export function formModal({ title, intro, before, after, fields, values, submitLabel = 'حفظ', submitIcon, size = 'md', onSubmit, setup, danger = false, className } = {}) {
  return new Promise((resolve) => {
    let result = null;
    let m = null;
    const f = form(fields, {
      values,
      footer: false,
      className,
      onSubmit: async (vals, fapi) => {
        const r = onSubmit ? await onSubmit(vals, fapi) : undefined;
        result = r === undefined ? vals : r;
      },
      onSuccess: () => m && m.close('submit'),
    });
    m = modal({
      title,
      size,
      body: frag(intro && h('p.modal-intro', intro), before, f.el, after),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        { label: submitLabel, variant: danger ? 'danger' : 'primary', icon: submitIcon, onClick: async () => ((await f.submit()) ? undefined : false) },
      ],
      onClose: (reason) => resolve(reason === 'submit' ? result : null),
    });
    if (setup) setup(f, m);
  });
}

/**
 * نافذة تأكيد لإجراء خطِر تعيد Promise<boolean>.
 * (بديل محلي لـ confirmDanger: زر «إلغاء» فيها يعيد false فتبقى النافذة مفتوحة.)
 */
export function confirmAction({ title = 'تأكيد الإجراء', message, confirmLabel = 'نعم، متابعة', danger = true } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    modal({
      title,
      size: 'sm',
      body: h('p.confirm-message', message || 'هل أنت متأكد من تنفيذ هذا الإجراء؟'),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: confirmLabel,
          variant: danger ? 'danger' : 'primary',
          onClick: () => {
            ok = true;
          },
        },
      ],
      onClose: () => resolve(ok),
    });
  });
}

/** نجوم تقييم الجودة (1–5). */
export function stars(score) {
  const n = Math.max(0, Math.min(5, Number(score) || 0));
  return h(
    'span.pb-stars',
    { role: 'img', 'aria-label': `تقييم الجودة ${n} من 5`, title: `تقييم الجودة ${n} من 5` },
    [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= n ? 'is-on' : null, 'aria-hidden': 'true' }, '★')),
  );
}

/** كتلة نصية بعنوان صغير (صياغة المحامي، رد العميل، …). */
export function textBlock(title, text, { meta, iconName, tone, dir = 'auto' } = {}) {
  if (text == null || text === '') return null;
  return h(
    'div.pb-block',
    { class: tone && `pb-block-${tone}` },
    h('div.pb-block-label', iconName && icon(iconName, { size: 14 }), title),
    h('div.pb-block-text', { dir }, text),
    meta && h('div.pb-block-meta', meta),
  );
}

/**
 * محادثة العميل مع وسوم إضافية: الرسائل الآلية، الرسائل المرتبطة بطلب، وإعادة محاولة الرسائل الفاشلة.
 * @returns {HTMLElement} غلاف قابل للتمرير
 */
export function messageThread(messages = [], { onRetry, inLabel = 'العميل', outLabel = 'المؤسسة' } = {}) {
  const thread = chatThread(messages, { inLabel, outLabel, emptyText: 'لا توجد رسائل بعد' });
  const bubbles = thread.querySelectorAll('.msg');
  messages.forEach((m, i) => {
    const bubble = bubbles[i] && bubbles[i].querySelector('.msg-bubble');
    if (!bubble) return;
    const meta = m.meta || {};
    const extras = [];
    if (m.automated && m.automation_rule) extras.push(h('span.pb-msg-tag', icon('zap', { size: 12 }), label('automation_rule', m.automation_rule)));
    if (meta.info_request_id) extras.push(h('span.pb-msg-tag', icon('mail', { size: 12 }), 'ضمن طلب معلومات أرسلته الإدارة'));
    if (meta.client_answer_id) extras.push(h('span.pb-msg-tag.is-answer', icon('checkCircle', { size: 12 }), 'الرد النهائي على الاستشارة'));
    if (m.direction === 'out' && m.status === 'failed') {
      extras.push(
        h(
          'div.pb-msg-fail',
          { title: m.error || '' },
          icon('alert', { size: 14 }),
          h('span', 'تعذر إرسال هذه الرسالة'),
          onRetry && asyncButton('إعادة المحاولة', () => onRetry(m), { size: 'sm', variant: 'danger', icon: 'refresh' }),
        ),
      );
    }
    if (extras.length) bubble.append(h('div.pb-msg-extra', extras));
  });
  const wrap = h('div.pb-chat-scroll', { tabindex: '0', 'aria-label': 'سجل المحادثة مع العميل' }, thread);
  setTimeout(() => {
    wrap.scrollTop = wrap.scrollHeight;
  }, 40);
  return wrap;
}

/** صندوق كتابة رسالة للعميل مع اختيار القناة. */
export function messageComposer({ onSend, placeholder = 'اكتب رسالة للعميل…', hint } = {}) {
  const taId = uid('composer');
  const ta = h('textarea.input', { id: taId, rows: 3, placeholder, maxlength: 4000 });
  const sel = h(
    'select.input',
    { 'aria-label': 'قناة الإرسال' },
    CHANNEL_OPTIONS.map((o) => h('option', { value: o.value }, o.label)),
  );
  const err = h('p.field-error', { role: 'alert', hidden: true });
  const send = asyncButton(
    'إرسال',
    async () => {
      const body = ta.value.trim();
      if (!body) {
        mount(err, icon('alert', { size: 14 }), h('span', 'اكتب نص الرسالة أولًا'));
        err.hidden = false;
        ta.focus();
        return;
      }
      err.hidden = true;
      await onSend({ body, channel: sel.value });
      ta.value = '';
    },
    { variant: 'primary', icon: 'send' },
  );
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send.click();
    }
  });
  return h(
    'div.composer.pb-composer',
    h('label.field-label', { htmlFor: taId }, 'رسالة جديدة للعميل'),
    ta,
    err,
    h('div.composer-actions', h('div.select-wrap.pb-channel', sel), hint && h('span.small.muted.pb-composer-hint', hint), send),
  );
}

const ACT_ICONS = [
  ['case.closed', 'lock'],
  ['case', 'briefcase'],
  ['message', 'message'],
  ['opinion', 'fileText'],
  ['client_answer', 'send'],
  ['assignment', 'userPlus'],
  ['grants', 'shield'],
  ['info_request', 'mail'],
  ['counsel_request', 'users'],
  ['issue', 'flag'],
  ['documents', 'paperclip'],
  ['ai', 'sparkle'],
  ['billing', 'wallet'],
  ['intake', 'inbox'],
  ['matter', 'gavel'],
  ['event', 'calendar'],
  ['task', 'check'],
  ['invoice', 'wallet'],
  ['payment', 'wallet'],
  ['expense', 'wallet'],
  ['client', 'user'],
];

function activityIcon(type) {
  const t = String(type || '');
  const hit = ACT_ICONS.find(([p]) => t === p || t.startsWith(`${p}.`));
  return hit ? hit[1] : null;
}

/** السجل الزمني مع تصفية حسب الفاعل (الأحدث أولًا). */
export function activityTimeline(activity = []) {
  const groups = [
    ['all', 'الكل'],
    ['staff', 'الإدارة'],
    ['lawyer', 'المحامون'],
    ['client', 'العميل'],
    ['auto', 'النظام والذكاء الاصطناعي'],
  ];
  const match = (a, k) => (k === 'all' ? true : k === 'auto' ? a.actor_kind === 'system' || a.actor_kind === 'ai' : a.actor_kind === k);
  const items = [...activity].reverse();
  let current = 'all';
  const seg = h('div.segmented', { role: 'group', 'aria-label': 'تصفية السجل حسب الفاعل' });
  const host = h('div');
  function draw() {
    mount(
      seg,
      groups.map(([k, t]) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(current === k),
            onClick: () => {
              current = k;
              draw();
            },
          },
          t,
          h('span.tab-count', String(items.filter((a) => match(a, k)).length)),
        ),
      ),
    );
    mount(
      host,
      timeline(
        items
          .filter((a) => match(a, current))
          .map((a) => ({
            time: a.created_at,
            title: a.summary,
            actor: `${label('actor_kind', a.actor_kind)}${a.actor_name ? ` — ${a.actor_name}` : ''}`,
            tone: statusTone('actor_kind', a.actor_kind),
            icon: activityIcon(a.type),
          })),
        { empty: current === 'all' ? 'لا توجد أحداث مسجلة بعد' : 'لا توجد أحداث في هذا التصنيف' },
      ),
    );
  }
  draw();
  return h('div.stack', seg, host);
}

/** لوحة رفع مستندات (عنوان اختياري موحد). */
export function uploadPanel({ onUpload, hint } = {}) {
  const fi = fileInput({ maxFiles: 10 });
  const titleIn = h('input.input', { type: 'text', maxlength: 200, placeholder: 'مثال: صورة إعلام الوراثة' });
  const titleField = field('عنوان المستند (اختياري)', titleIn, { hint: 'يُطبَّق على كل الملفات المرفوعة معًا؛ إن تُرك فارغًا يُستخدم اسم الملف.' });
  const btn = asyncButton(
    'رفع المستندات',
    async () => {
      const files = fi.getFiles();
      if (!files.length) {
        toast('اختر ملفًا واحدًا على الأقل', 'warning');
        return;
      }
      const uploads = await filesToUploads(files);
      await onUpload({ files: uploads, title: titleIn.value.trim() || undefined });
      fi.clear();
      titleIn.value = '';
    },
    { variant: 'primary', icon: 'upload' },
  );
  return h('div.stack.pb-upload', fi.el, titleField, h('div.row', btn, hint && h('span.small.muted', hint)));
}

/** مراحل تقدم صغيرة: [{ label, state: 'done'|'current'|'todo'|'skipped' }] */
export function stepper(stages, { ariaLabel = 'مراحل الطلب' } = {}) {
  const sr = { done: 'مكتملة', current: 'المرحلة الحالية', todo: 'لم تبدأ بعد', skipped: 'تم تجاوزها' };
  return h(
    'ol.pb-steps',
    { 'aria-label': ariaLabel },
    stages.map((s, i) =>
      h(
        'li.pb-step',
        { 'aria-current': s.state === 'current' ? 'step' : null },
        h(
          'span.pb-step-pill',
          { class: `is-${s.state}` },
          h('span.pb-step-dot', { 'aria-hidden': 'true' }, s.state === 'done' ? icon('check', { size: 11 }) : String(i + 1)),
          h('span', s.label),
          h('span.sr-only', ` (${sr[s.state]})`),
        ),
      ),
    ),
  );
}

// ───────────────────────── ثوابت الصفحة ─────────────────────────

const TAB_KEYS = ['overview', 'team', 'requests', 'opinions', 'documents', 'conversation', 'timeline', 'cost'];
const OPEN_ASSIGNMENT = ['assigned', 'in_progress', 'returned'];
const COUNSEL_ROLE = { second_opinion: 'second_opinion', specialist_input: 'specialist', document_review: 'specialist', co_counsel: 'co_counsel' };
const QUALITY_OPTIONS = [
  { value: 5, label: '5 — ممتاز' },
  { value: 4, label: '4 — جيد جدًا' },
  { value: 3, label: '3 — جيد' },
  { value: 2, label: '2 — مقبول' },
  { value: 1, label: '1 — ضعيف' },
];
const COST_KIND = {
  direct: 'تكلفة مباشرة',
  expense: 'مصروفات',
  allocated: 'تكلفة محمّلة (تقديرية)',
  contribution: 'مساهمة تطوعية (غير مدفوعة)',
};

const F_ISSUES = ['مسألة واحدة', 'مسألتين', 'مسائل', 'مسألة'];
const F_DOCS = ['مستند واحد', 'مستندين', 'مستندات', 'مستندًا'];

function truncate(s, n = 90) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function inline(...children) {
  return h('span.pb-inline', children);
}

function isOverdue(a) {
  return Boolean(a.due_at && OPEN_ASSIGNMENT.includes(a.status) && new Date(a.due_at).getTime() < Date.now());
}

function providerLabel(s, status) {
  if (!s) return '';
  if (status && status.provider === s.provider && status.label) return status.label;
  return s.provider === 'anthropic' ? `Claude (${s.model || ''})` : 'المحلل المحلي (قواعد عربية بدون إنترنت)';
}

// ───────────────────────── الصفحة ─────────────────────────

export default async function render(ctx) {
  const id = ctx.params.id;
  const [data, staff] = await Promise.all([
    api.get(`/admin/cases/${encodeURIComponent(id)}`),
    api.get('/admin/staff').catch(() => []),
  ]);
  const c = data.case;
  const closed = c.status === 'closed';
  ctx.setTitle(`${c.code} — ملف استشارة`);

  const assignmentById = new Map(data.assignments.map((a) => [a.id, a]));
  const issueById = new Map(data.issues.map((i) => [i.id, i]));
  const docById = new Map(data.documents.map((d) => [d.id, d]));
  const staffById = new Map((staff || []).map((s) => [s.id, s]));
  const activeTeam = data.assignments.filter((a) => a.status !== 'withdrawn');
  const lead = activeTeam.find((a) => a.role === 'lead') || null;
  const aiStatus = data.ai ? data.ai.status : null;

  let tabsEl = null;

  // ── التنقل بين التبويبات وحفظها في الرابط ──
  function syncTab(key) {
    const qs = key && key !== 'overview' ? `?tab=${key}` : '';
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/cases/${id}${qs}`);
    } catch {
      /* لا شيء */
    }
  }
  function goTab(key) {
    if (!tabsEl) return;
    tabsEl.setActive(key);
    syncTab(key);
    tabsEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function refresh(msg, { tab } = {}) {
    if (msg) toast(msg, 'success');
    if (tab) syncTab(tab);
    ctx.refreshShell();
    await ctx.reload();
  }

  const lawyerLabel = (a) => (a ? a.lawyer_name : '—');
  const issueText = (iid) => {
    const i = issueById.get(iid);
    return i ? `المسألة رقم ${i.number}: ${i.title}` : `مسألة #${iid}`;
  };

  // ───────────────────────── الترويسة ─────────────────────────

  function headerActions() {
    const acts = [button('رسالة للعميل', { icon: 'message', onClick: openMessageDialog })];
    if (data.matter) acts.push(button('فتح الملف المستمر', { icon: 'gavel', href: `#/matters/${data.matter.id}` }));
    else {
      acts.push(
        asyncButton(
          'تحويل إلى ملف مستمر',
          async () => {
            const res = await api.get('/admin/lawyers', { active: 'true' });
            openMatterDialog((res && res.items) || []);
          },
          { icon: 'gavel' },
        ),
      );
    }
    if (closed) acts.push(button('إعادة فتح الملف', { icon: 'refresh', variant: 'primary', onClick: openReopenDialog }));
    else acts.push(button('إغلاق الملف', { icon: 'lock', variant: 'danger', onClick: openCloseDialog }));
    return acts;
  }

  const header = pageHeader({
    title: c.title,
    breadcrumbs: [
      { label: 'ملفات الاستشارات', href: '#/cases' },
      { label: c.code },
    ],
    meta: [
      codeTag(c.code, { className: 'pb-code-lg' }),
      statusBadge('case_status', c.status),
      badge(`الأولوية: ${label('priority', c.priority)}`, statusTone('priority', c.priority), { icon: 'flag' }),
      badge(areaLabel(c.legal_area), 'neutral', { icon: 'scale' }),
      closed && c.outcome && statusBadge('case_outcome', c.outcome),
    ],
    actions: headerActions(),
  });

  // ───────────────────────── شريط ما يحتاج قرار الإدارة ─────────────────────────

  function attentionBar() {
    if (closed) {
      return alertBox(
        frag(
          h('div', `أُغلق الملف في ${date(c.closed_at)} — النتيجة: ${label('case_outcome', c.outcome)}.`),
          c.closure_note && h('div', `ملاحظة الإغلاق: ${c.closure_note}`),
          h('div', 'لا يمكن تعديل الفريق أو الطلبات إلا بعد إعادة فتح الملف.'),
        ),
        'info',
        { title: 'الملف مغلق', icon: 'lock' },
      );
    }
    const items = [];
    const add = (iconName, text, tab, btnText, onClick) => items.push({ iconName, text, tab, btnText, onClick });
    const submitted = data.opinions.filter((o) => o.status === 'submitted').length;
    const pendingInfo = data.info_requests.filter((r) => r.status === 'pending_admin').length;
    const replied = data.info_requests.filter((r) => r.status === 'client_replied').length;
    const pendingCounsel = data.counsel_requests.filter((r) => r.status === 'pending_admin').length;
    const proposed = data.issues.filter((i) => i.status === 'proposed').length;
    const overdue = activeTeam.filter(isOverdue).length;
    if (!activeTeam.length) add('userPlus', 'لم يُسند الملف لأي محامٍ بعد', 'team', 'إسناد محامٍ', () => openAssignDialog());
    if (submitted) add('fileText', `آراء مقدَّمة بانتظار مراجعتك: ${submitted}`, 'opinions', 'مراجعة الآراء');
    if (pendingInfo) add('mail', `طلبات معلومات بانتظار موافقتك قبل مراسلة العميل: ${pendingInfo}`, 'requests', 'عرض الطلبات');
    if (replied) add('message', `ردود من العميل بانتظار مراجعتك وإتاحتها للمحامي: ${replied}`, 'requests', 'عرض الردود');
    if (pendingCounsel) add('users', `طلبات مساعدة محامٍ بانتظار قرارك: ${pendingCounsel}`, 'requests', 'عرض الطلبات');
    if (proposed) add('flag', `مسائل اقترحها المحامون بانتظار الاعتماد: ${proposed}`, 'overview', 'عرض المسائل');
    if (overdue) add('clock', `إسنادات تجاوزت موعد التسليم: ${overdue}`, 'team', 'عرض الفريق');
    if (c.status === 'approved') add('send', 'الرأي معتمد — أعِدّ الرد الموجه للعميل وأرسله', 'opinions', 'إعداد الرد');
    if (c.status === 'answered') add('checkCircle', 'تم الرد على العميل — أغلق الملف عند انتهاء المتابعة', null, 'إغلاق الملف', openCloseDialog);
    if (!items.length) return null;
    return h(
      'section.pb-attention',
      { 'aria-label': 'ما يحتاج إلى قرار الإدارة في هذا الملف' },
      h('div.pb-attention-title', icon('bell', { size: 18 }), 'بانتظار قرارك في هذا الملف'),
      h(
        'ul.pb-attention-list',
        items.map((it) =>
          h(
            'li.pb-attention-item',
            icon(it.iconName, { size: 16 }),
            h('span.pb-attention-text', it.text),
            button(it.btnText, { size: 'sm', variant: 'secondary', onClick: it.onClick || (() => goTab(it.tab)) }),
          ),
        ),
      ),
    );
  }

  // ───────────────────────── بطاقتا الملخص ─────────────────────────

  function summaryCards() {
    const cl = data.client;
    const intake = data.intake;
    const chans = new Set([...(intake?.channels || []), ...((cl?.identities || []).flatMap((i) => i.channels || []))]);
    const campaign = intake?.campaign || c.campaign;
    const clientCard = card({
      title: 'العميل ومصدره',
      subtitle: 'للإدارة فقط — لا يُتاح لأي محامٍ مهما كانت صلاحياته',
      icon: 'lock',
      className: 'pb-client-card',
      body: kv([
        ['العميل', cl ? inline(h('a', { href: `#/clients/${cl.id}` }, cl.name || 'عميل بدون اسم'), codeTag(cl.code)) : null],
        ['الهاتف', cl?.phone ? inline(ltr(cl.phone), copyButton(cl.phone, '')) : null],
        ['قنوات التواصل', chans.size ? chips([...chans].map((ch) => ({ label: label('channel', ch), tone: ch === 'whatsapp' ? 'success' : 'info' }))) : null],
        ['المحافظة', cl?.governorate],
        ['مصدر العميل', h('span', label('source', intake?.source || c.source), campaign && h('span.cell-sub.pb-d-block', `الحملة: ${campaign}`))],
        ['قناة الوصول', label('channel', intake?.first_channel || c.channel)],
        ['الطلب الأصلي', intake ? inline(h('a.pb-code-link', { href: `#/inbox/${intake.id}`, 'aria-label': `فتح الطلب الوارد ${intake.code}` }, codeTag(intake.code)), h('span.small.muted', dateTime(intake.created_at))) : null],
      ]),
      footer: h('p.small.muted', 'المصدر هو ما جاء بالعميل (مثل إعلان ممول)، والقناة هي الباب الذي تواصل منه (واتساب أو الموقع)؛ وكل الأبواب تصل إلى محرك الاستقبال نفسه.'),
    });

    const manager = staffById.get(c.case_manager_id);
    const fileCard = card({
      title: 'متابعة الملف',
      icon: 'briefcase',
      actions: !closed && button('تعديل البيانات', { size: 'sm', icon: 'edit', onClick: openEditCaseDialog }),
      body: kv([
        ['مدير الحالة', manager ? manager.name : c.case_manager_name || null],
        ['الموعد المستهدف', c.due_at ? inline(h('span', date(c.due_at)), !closed && dueBadge(c.due_at)) : h('span.muted', 'بدون موعد محدد')],
        ['فريق العمل', activeTeam.length ? h('span', `${activeTeam.length} — المحامي الأساسي: ${lead ? lead.lawyer_name : 'لم يُحدَّد'}`) : h('span.muted', 'لم يُسند لأي محامٍ بعد')],
        ['الملف المستمر', data.matter ? inline(h('a.pb-code-link', { href: `#/matters/${data.matter.id}` }, codeTag(data.matter.code)), statusBadge('matter_status', data.matter.status)) : h('span.muted', 'لا يوجد')],
        [
          'المعرفة المؤسسية',
          data.knowledge
            ? inline(h('a', { href: `#/knowledge/${data.knowledge.id}` }, `السجل المعرفي #${data.knowledge.id}`), statusBadge('knowledge_status', data.knowledge.status))
            : h('span.muted', closed ? 'لم يُنشأ سجل' : 'يُنشأ سجل مجهّل تلقائيًا عند الإغلاق'),
        ],
        ['أُنشئ', h('span', dateTime(c.created_at))],
        closed && ['أُغلق', h('span', dateTime(c.closed_at))],
      ]),
    });
    return h('div.grid-2.pb-summary', clientCard, fileCard);
  }

  // ───────────────────────── نظرة عامة ─────────────────────────

  function factsBlock(kind) {
    const internal = kind === 'internal';
    const fieldKey = internal ? 'facts_internal' : 'facts_shared';
    const value = c[fieldKey] || '';
    const title = internal ? 'الوقائع الداخلية — لا يراها المحامون' : 'ملخص الوقائع المتاح للمحامين';
    const viewers = activeTeam.filter((a) => a.grants.facts);
    const body = h('div.pb-facts-body');
    const editBtn = !closed && button('تعديل', { size: 'sm', icon: 'edit', onClick: () => edit() });

    function show() {
      mount(
        body,
        value
          ? h('div.pb-fact-text', { dir: 'auto' }, value)
          : emptyState(internal ? 'لم تُسجَّل وقائع داخلية بعد' : 'لم يُكتب ملخص الوقائع للمحامين بعد — بدونه لن يجد المحامي ما يدرسه', null, { compact: true, icon: internal ? 'lock' : 'fileText' }),
      );
      if (editBtn) editBtn.hidden = false;
    }

    function edit() {
      const taId = uid('facts');
      const ta = h('textarea.input.pb-fact-input', { id: taId, rows: 10, value, maxlength: 20000 });
      const save = asyncButton(
        'حفظ',
        async () => {
          await api.patch(`/admin/cases/${id}`, { [fieldKey]: ta.value });
          await refresh(internal ? 'تم حفظ الوقائع الداخلية' : 'تم حفظ ملخص الوقائع وأُبلغ أعضاء الفريق الذين يرونه');
        },
        { variant: 'primary', icon: 'check' },
      );
      mount(
        body,
        h('label.sr-only', { htmlFor: taId }, title),
        ta,
        !internal &&
          alertBox('لا تكتب في الملخص رقم الهاتف أو العنوان أو أي بيانات تواصل. سيُبلَّغ أعضاء الفريق الذين يرون الوقائع بالتحديث.', 'warning'),
        h('div.btn-group', save, button('إلغاء', { variant: 'ghost', onClick: show })),
      );
      if (editBtn) editBtn.hidden = true;
      ta.focus();
    }

    show();
    const foot = internal
      ? h('div.pb-facts-foot', icon('eyeOff', { size: 15 }), 'ملاحظات الإدارة فقط: مصدر العميل وتفضيلات التواصل وأي تفاصيل لا تخص المحامي.')
      : h(
          'div.pb-facts-foot',
          icon('eye', { size: 15 }),
          viewers.length ? h('span', 'يراه حاليًا:') : h('span', 'لا يراه أي محامٍ حاليًا'),
          viewers.length > 0 && chips(viewers.map((a) => ({ label: a.lawyer_name, tone: 'primary' }))),
        );
    return card({
      title,
      subtitle: internal ? null : 'يظهر فقط لأعضاء الفريق الممنوحين صلاحية «ملخص الوقائع»',
      icon: internal ? 'lock' : 'eye',
      className: ['pb-facts', internal ? 'pb-facts-internal' : 'pb-facts-shared'],
      actions: editBtn,
      body: frag(body, foot),
    });
  }

  function issueViewers(issueId) {
    return activeTeam.filter((a) => a.grants.issue_ids.includes(issueId));
  }

  function issueItem(i) {
    const viewers = issueViewers(i.id);
    const origin =
      i.origin === 'ai'
        ? badge('اقتراح الذكاء الاصطناعي', 'accent', { icon: 'sparkle' })
        : i.origin === 'lawyer'
          ? badge(`اقترحها المحامي ${i.proposed_by_name || ''}`.trim(), 'info', { icon: 'user' })
          : null;
    const acts = [];
    if (!closed) {
      if (i.status === 'proposed') {
        acts.push(
          asyncButton(
            'اعتماد المسألة',
            async () => {
              await api.patch(`/admin/cases/${id}/issues/${i.id}`, { status: 'active' });
              await refresh(`اعتُمدت المسألة رقم ${i.number} وأُتيحت للمحامي الذي اقترحها`);
            },
            { size: 'sm', variant: 'primary', icon: 'check' },
          ),
        );
      }
      if (i.status !== 'dropped') {
        acts.push(button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openIssueDialog(i) }));
        acts.push(
          asyncButton(
            i.status === 'proposed' ? 'عدم الاعتماد' : 'استبعاد',
            async () => {
              const ok = await confirmAction({
                title: `استبعاد المسألة رقم ${i.number}`,
                message: 'ستُستبعد المسألة من الملف وتُسحب إتاحتها من كل أعضاء الفريق. يمكنك إعادة تفعيلها لاحقًا.',
                confirmLabel: 'نعم، استبعاد',
              });
              if (!ok) return;
              await api.patch(`/admin/cases/${id}/issues/${i.id}`, { status: 'dropped' });
              await refresh(`استُبعدت المسألة رقم ${i.number}`);
            },
            { size: 'sm', variant: 'ghost', icon: 'x' },
          ),
        );
      } else {
        acts.push(
          asyncButton(
            'إعادة تفعيل',
            async () => {
              await api.patch(`/admin/cases/${id}/issues/${i.id}`, { status: 'active' });
              await refresh(`أُعيد تفعيل المسألة رقم ${i.number}. أتحها للمحامين من الصلاحيات عند الحاجة.`);
            },
            { size: 'sm', variant: 'ghost', icon: 'refresh' },
          ),
        );
      }
    }
    return h(
      'li.pb-issue',
      { class: `is-${i.status}` },
      h('span.pb-issue-num', { 'aria-hidden': 'true' }, String(i.number)),
      h(
        'div.pb-issue-main',
        h('div.pb-issue-label', `المسألة رقم ${i.number}`, i.status === 'proposed' && ' — مقترحة بانتظار اعتمادك', i.status === 'dropped' && ' — مستبعدة'),
        h('div.pb-issue-title', i.title),
        i.details && h('div.pb-issue-details', { dir: 'auto' }, i.details),
        h(
          'div.pb-issue-meta',
          i.legal_area && i.legal_area !== c.legal_area && badge(areaLabel(i.legal_area), 'info', { icon: 'scale' }),
          origin,
          i.status === 'active' &&
            (viewers.length
              ? h('span.small.muted', `متاحة لـ: ${viewers.map((a) => a.lawyer_name).join('، ')}`)
              : h('span.small.muted', 'غير متاحة لأي محامٍ بعد')),
        ),
      ),
      acts.length > 0 && h('div.pb-issue-actions', acts),
    );
  }

  function aiSuggestionsPanel() {
    const sug = data.ai?.issues;
    const list = (sug?.output?.issues || []).map((x) => (typeof x === 'string' ? { title: x } : x)).filter((x) => x && x.title);
    if (!sug || !list.length) return null;
    const existing = new Set(data.issues.filter((i) => i.status !== 'dropped').map((i) => i.title.trim()));
    return h(
      'div.pb-ai-panel',
      h(
        'div.pb-ai-head',
        icon('sparkle', { size: 16 }),
        h('strong', 'مسائل يقترحها الذكاء الاصطناعي'),
        h('span.small.muted', `${providerLabel(sug, aiStatus)} · ${relative(sug.created_at)}`),
      ),
      h('p.small.muted', 'اقتراحات مساعدة فقط؛ إضافتك لأي منها تُسجَّل كتغذية راجعة لقياس دقة الذكاء الاصطناعي وتحسينه.'),
      h(
        'ul.pb-ai-list',
        list.map((s) => {
          const added = existing.has(String(s.title).trim());
          return h(
            'li.pb-ai-item',
            h(
              'div.pb-ai-text',
              h('div.cell-title', s.title),
              s.details && h('div.cell-sub', s.details),
              s.legal_area && s.legal_area !== c.legal_area && badge(areaLabel(s.legal_area), 'info'),
            ),
            added
              ? badge('أُضيفت', 'success', { icon: 'check' })
              : !closed &&
                  asyncButton(
                    'إضافة',
                    async () => {
                      await api.post(`/admin/cases/${id}/issues`, {
                        title: s.title,
                        details: s.details || null,
                        legal_area: s.legal_area || c.legal_area,
                        origin: 'ai',
                        suggestion_id: sug.id,
                      });
                      await refresh('أُضيفت المسألة المقترحة إلى الملف');
                    },
                    { size: 'sm', icon: 'plus' },
                  ),
          );
        }),
      ),
    );
  }

  function issuesCard() {
    const active = data.issues.filter((i) => i.status === 'active');
    const proposed = data.issues.filter((i) => i.status === 'proposed');
    const dropped = data.issues.filter((i) => i.status === 'dropped');
    const actions = !closed && [
      asyncButton(
        'اقتراح مسائل بالذكاء الاصطناعي',
        async () => {
          await api.post(`/admin/cases/${id}/ai/issues`);
          await refresh('وصلت اقتراحات الذكاء الاصطناعي — راجع المسائل المقترحة وأضف ما يناسب منها');
        },
        { size: 'sm', icon: 'sparkle' },
      ),
      button('إضافة مسألة', { size: 'sm', variant: 'primary', icon: 'plus', onClick: () => openIssueDialog(null) }),
    ];
    return card({
      title: 'المسائل القانونية',
      subtitle: 'كل مسألة مرقمة، وتُتاح لكل محامٍ على حدة من «تعديل الصلاحيات» في تبويب الفريق',
      icon: 'flag',
      actions,
      body: h(
        'div.stack',
        proposed.length > 0 && h('ol.pb-issue-list', { 'aria-label': 'مسائل مقترحة' }, proposed.map(issueItem)),
        active.length
          ? h('ol.pb-issue-list', { 'aria-label': 'المسائل المعتمدة' }, active.map(issueItem))
          : emptyState('لا توجد مسائل معتمدة بعد. أضف المسائل التي يجب أن يجيب عنها الفريق.', null, { compact: true, icon: 'flag' }),
        aiSuggestionsPanel(),
        dropped.length > 0 &&
          h('details.pb-older', h('summary', `المسائل المستبعدة (${dropped.length})`), h('ol.pb-issue-list', dropped.map(issueItem))),
      ),
    });
  }

  function aiAnalysisCard() {
    const s = data.ai?.intake_analysis;
    if (!s) {
      return card({ title: 'تحليل الذكاء الاصطناعي للطلب', icon: 'sparkle', body: emptyState('لا يوجد تحليل آلي للطلب الأصلي', null, { compact: true, icon: 'sparkle' }) });
    }
    const o = s.output || {};
    const missing = (o.missing_info || []).map((m) => (typeof m === 'string' ? { item: m, kind: 'information' } : m)).filter((m) => m && m.item);
    return card({
      title: 'تحليل الذكاء الاصطناعي للطلب',
      subtitle: `${providerLabel(s, aiStatus)} · ${relative(s.created_at)}`,
      icon: 'sparkle',
      body: h(
        'div.stack',
        o.summary && textBlock('الملخص', o.summary),
        kv([
          [
            'التصنيف المقترح',
            o.legal_area
              ? inline(
                  h('span', areaLabel(o.legal_area)),
                  o.legal_area === c.legal_area ? badge('يطابق قرار الإدارة', 'success') : badge('صحّحته الإدارة', 'warning'),
                )
              : null,
          ],
          ['درجة الثقة', o.confidence != null ? percent(o.confidence) : null],
          ['مجالات ثانوية', (o.secondary_areas || []).length ? chips(o.secondary_areas.map((a) => ({ label: areaLabel(a), tone: 'info' }))) : null],
          ['درجة الإلحاح', o.urgency ? label('priority', o.urgency) : null],
        ]),
        o.specialist_hint && alertBox(o.specialist_hint, 'info', { icon: 'users' }),
        missing.length > 0 &&
          h(
            'div.stack-sm',
            h('div.pb-sub-h', 'معلومات ومستندات ناقصة'),
            h(
              'ul.pb-missing',
              missing.map((m) =>
                h(
                  'li',
                  h('span.pb-missing-text', badge(label('info_request_kind', m.kind === 'document' ? 'document' : 'information'), m.kind === 'document' ? 'accent' : 'info'), ' ', m.item),
                  !closed &&
                    button('اطلب من العميل', {
                      size: 'sm',
                      variant: 'link',
                      icon: 'send',
                      onClick: () => openStaffRequestDialog({ kind: m.kind === 'document' ? 'document' : 'information', question: m.item }),
                    }),
                ),
              ),
            ),
          ),
        h('p.small.muted', 'مساعد آلي — القرار النهائي دائمًا للإدارة، وتُسجَّل تصحيحاتها لقياس دقته.'),
      ),
    });
  }

  function similarCard() {
    const sim = data.ai?.similar || { items: [], total: 0 };
    const items = sim.items || [];
    return card({
      title: 'حالات مشابهة تعاملت معها المؤسسة',
      subtitle: items.length ? `عدد الحالات المشابهة: ${sim.total || items.length}` : null,
      icon: 'book',
      body: items.length
        ? h(
            'ul.pb-sim-list',
            items.map((x) =>
              h(
                'li.pb-sim-item',
                h(
                  'a.pb-sim-link',
                  { href: x.type === 'knowledge' ? `#/knowledge/${x.id}` : `#/cases/${x.id}` },
                  x.code ? codeTag(x.code) : badge('مادة معرفية', 'accent'),
                  h('span.pb-sim-title', x.title),
                ),
                h(
                  'div.pb-sim-meta',
                  h('span', areaLabel(x.legal_area)),
                  x.outcome ? h('span', label('case_outcome', x.outcome)) : x.status ? h('span', label('case_status', x.status)) : null,
                  x.score != null && badge(`تشابه ${percent(x.score)}`, 'neutral'),
                ),
              ),
            ),
          )
        : emptyState('لا توجد حالات مشابهة بالقدر الكافي', null, { compact: true, icon: 'book' }),
    });
  }

  function renderOverview() {
    return h(
      'div.stack-lg',
      h('div.grid-2.pb-facts-grid', factsBlock('internal'), factsBlock('shared')),
      h('div.detail-layout', h('div.detail-main', issuesCard()), h('div.detail-side', aiAnalysisCard(), similarCard())),
    );
  }

  // ───────────────────────── محرر الصلاحيات ─────────────────────────

  /**
   * محرر «ما يراه هذا المحامي». يُستخدم عند الإسناد وإسناد طلب المساعدة وتعديل الصلاحيات.
   * @returns {{el:HTMLElement, value:()=>object, set:(g:object)=>void, touched:()=>boolean}}
   */
  function grantsEditor({ initial = {}, assignmentId = null } = {}) {
    const issues = data.issues.filter((i) => i.status === 'active');
    const docs = data.documents;
    const others = data.assignments.filter((a) => a.status !== 'withdrawn' && a.id !== assignmentId);
    const sharedIrs = data.info_requests.filter((r) => r.status === 'shared' && (assignmentId == null || r.assignment_id !== assignmentId));
    let touched = false;

    const factsCb = h('input', { type: 'checkbox' });
    const nameCb = h('input', { type: 'checkbox' });
    const maps = { issue: new Map(), document: new Map(), opinion: new Map(), info_request: new Map() };
    const summary = h('p.pb-grants-summary', { 'aria-live': 'polite' });

    function onChange() {
      touched = true;
      update();
    }
    factsCb.addEventListener('change', onChange);
    nameCb.addEventListener('change', onChange);

    function group(legend, hint, list, map, keyOf, renderItem, emptyText) {
      const tools =
        list.length > 1 &&
        h(
          'div.pb-grants-tools',
          button('تحديد الكل', {
            size: 'sm',
            variant: 'link',
            onClick: () => {
              map.forEach((cb) => (cb.checked = true));
              onChange();
            },
          }),
          button('إلغاء التحديد', {
            size: 'sm',
            variant: 'link',
            onClick: () => {
              map.forEach((cb) => (cb.checked = false));
              onChange();
            },
          }),
        );
      return h(
        'fieldset.pb-grants-group',
        h('legend', legend),
        hint && h('p.small.muted', hint),
        tools,
        list.length
          ? h(
              'div.pb-grants-list',
              list.map((it) => {
                const cb = h('input', { type: 'checkbox', value: String(keyOf(it)) });
                cb.addEventListener('change', onChange);
                map.set(keyOf(it), cb);
                return h('label.check.pb-grant', cb, h('span.pb-grant-text', renderItem(it)));
              }),
            )
          : h('p.small.muted', emptyText),
      );
    }

    const el = h(
      'div.pb-grants',
      h('p.pb-grants-lead', icon('shield', { size: 16 }), 'يرى المحامي فقط ما تحدده هنا — ولا شيء غيره.'),
      h(
        'fieldset.pb-grants-group',
        h('legend', 'الوقائع والهوية'),
        h(
          'div.pb-grants-list',
          h(
            'label.check.pb-grant',
            factsCb,
            h(
              'span.pb-grant-text',
              h('span.cell-title', 'ملخص الوقائع'),
              c.facts_shared
                ? h('span.cell-sub', truncate(c.facts_shared, 120))
                : h('span.cell-sub.pb-warn-text', 'لم يُكتب ملخص الوقائع بعد — اكتبه من تبويب «نظرة عامة»'),
            ),
          ),
          h(
            'label.check.pb-grant',
            nameCb,
            h(
              'span.pb-grant-text',
              h('span.cell-title', 'اسم العميل'),
              h('span.cell-sub.pb-warn-text', 'الهاتف وبيانات التواصل لا تُتاح أبدًا — الاسم فقط'),
            ),
          ),
        ),
      ),
      group(
        'المسائل القانونية',
        'المحامي المتخصص يحتاج غالبًا إلى مسألة واحدة فقط.',
        issues,
        maps.issue,
        (i) => i.id,
        (i) => frag(h('span.cell-title', `المسألة رقم ${i.number}`), h('span.cell-sub', i.title)),
        'لا توجد مسائل معتمدة في الملف بعد',
      ),
      group(
        'المستندات',
        null,
        docs,
        maps.document,
        (d) => d.id,
        (d) => frag(h('span.cell-title', { dir: 'auto' }, d.title), h('span.cell-sub', `${label('actor_kind', d.uploaded_by_kind)} · ${formatBytes(d.size)}`)),
        'لا توجد مستندات في الملف',
      ),
      group(
        'آراء أعضاء الفريق الآخرين',
        'يرى المحامي الرأي المقدَّم أو المعتمد فقط، لا المسودات.',
        others,
        maps.opinion,
        (a) => a.id,
        (a) => frag(h('span.cell-title', a.lawyer_name), h('span.cell-sub', `${label('assignment_role', a.role)} · ${label('assignment_status', a.status)}`)),
        'لا يوجد أعضاء آخرون في الفريق',
      ),
      group(
        'طلبات معلومات سبق إتاحتها',
        'إجابات حصلت عليها الإدارة من العميل لطلبات أخرى.',
        sharedIrs,
        maps.info_request,
        (r) => r.id,
        (r) => frag(h('span.cell-title', label('info_request_kind', r.kind)), h('span.cell-sub', truncate(r.question, 120))),
        'لا توجد طلبات معلومات متاحة للمشاركة',
      ),
      h(
        'div.pb-grants-never',
        icon('lock', { size: 16 }),
        h('div', h('strong', 'لا يُتاح لأي محامٍ أبدًا: '), 'رقم الهاتف وبيانات التواصل، المحادثة الأصلية مع العميل، مصدر العميل والحملة، الوقائع الداخلية، والتكلفة.'),
      ),
      summary,
    );

    function value() {
      const ids = (map) => [...map.entries()].filter(([, cb]) => cb.checked).map(([k]) => k);
      return {
        facts: factsCb.checked,
        client_name: nameCb.checked,
        issue_ids: ids(maps.issue),
        document_ids: ids(maps.document),
        opinion_assignment_ids: ids(maps.opinion),
        info_request_ids: ids(maps.info_request),
      };
    }

    function set(g = {}) {
      factsCb.checked = Boolean(g.facts);
      nameCb.checked = Boolean(g.client_name);
      const apply = (map, list) => {
        const s = new Set((list || []).map(Number));
        map.forEach((cb, k) => (cb.checked = s.has(Number(k))));
      };
      apply(maps.issue, g.issue_ids);
      apply(maps.document, g.document_ids);
      apply(maps.opinion, g.opinion_assignment_ids);
      apply(maps.info_request, g.info_request_ids);
      update();
    }

    function update() {
      const v = value();
      const parts = [];
      if (v.facts) parts.push('ملخص الوقائع');
      if (v.client_name) parts.push('اسم العميل');
      if (v.issue_ids.length) parts.push(count(v.issue_ids.length, F_ISSUES));
      if (v.document_ids.length) parts.push(count(v.document_ids.length, F_DOCS));
      if (v.opinion_assignment_ids.length) parts.push(`آراء أعضاء الفريق (${v.opinion_assignment_ids.length})`);
      if (v.info_request_ids.length) parts.push(`طلبات معلومات متاحة (${v.info_request_ids.length})`);
      summary.textContent = parts.length
        ? `ما سيراه المحامي: ${parts.join('، ')}، بالإضافة إلى السؤال المطلوب منه.`
        : 'لن يرى المحامي سوى السؤال المطلوب منه.';
    }

    set(initial);
    return { el, value, set, touched: () => touched };
  }

  // ───────────────────────── الفريق والصلاحيات ─────────────────────────

  function seesSummary(a) {
    const g = a.grants || {};
    const yesNo = (ok, text) =>
      h('div.pb-sees-row', h('span', { class: ok ? 'pb-yes' : 'pb-no' }, icon(ok ? 'checkCircle' : 'eyeOff', { size: 16 })), h('span', text), h('span.sr-only', ok ? ' — متاح' : ' — غير متاح'));
    const listRow = (title, items, emptyText) =>
      h(
        'div.pb-sees-row.pb-sees-list',
        h('span', { class: items.length ? 'pb-yes' : 'pb-no' }, icon(items.length ? 'checkCircle' : 'eyeOff', { size: 16 })),
        h('div', h('span.pb-sees-label', title), items.length ? chips(items) : h('span.small.muted', emptyText)),
      );
    const issueChips = (g.issue_ids || [])
      .map((iid) => issueById.get(iid))
      .filter(Boolean)
      .sort((x, y) => x.number - y.number)
      .map((i) => ({ label: `رقم ${i.number}`, tone: 'primary' }));
    const docChips = (g.document_ids || []).map((did) => docById.get(did)).filter(Boolean).map((d) => ({ label: truncate(d.title, 40) }));
    const opChips = (g.opinion_assignment_ids || []).map((aid) => assignmentById.get(aid)).filter(Boolean).map((x) => ({ label: x.lawyer_name, tone: 'info' }));
    const irChips = (g.info_request_ids || [])
      .map((rid) => data.info_requests.find((r) => r.id === rid))
      .filter(Boolean)
      .map((r) => ({ label: truncate(r.question, 40) }));
    return h(
      'div.pb-sees',
      h('div.pb-sees-title', icon('eye', { size: 16 }), 'ما يراه هذا المحامي'),
      h(
        'div.pb-sees-grid',
        yesNo(g.facts, 'ملخص الوقائع'),
        yesNo(g.client_name, 'اسم العميل'),
        listRow('المسائل', issueChips, 'لا توجد مسائل متاحة'),
        listRow('المستندات', docChips, 'لا توجد مستندات متاحة'),
        listRow('آراء الزملاء', opChips, 'لا يرى آراء أعضاء آخرين'),
        listRow('طلبات معلومات من آخرين', irChips, 'لا شيء'),
      ),
      h('div.pb-never', icon('lock', { size: 14 }), 'لا يُتاح أبدًا: الهاتف وبيانات التواصل · المحادثة الأصلية · المصدر · التكلفة'),
    );
  }

  function feeText(a) {
    if (a.fee_mode === 'custom') return `${money(a.fee_amount)} — مبلغ محدد لهذه المهمة`;
    if (a.fee_mode === 'pro_bono') return label('fee_mode', 'pro_bono');
    return `حسب اتفاق المحامي${a.agreement_type ? ` (${label('agreement_type', a.agreement_type)})` : ''}`;
  }

  function billingNode(a) {
    const b = a.billing;
    if (!b) return h('span.muted', 'لم تُسجَّل واقعة استحقاق بعد');
    return inline(
      statusBadge('treatment', b.treatment),
      b.amount ? h('strong', money(b.amount)) : null,
      b.notional ? h('span.small.muted', `قيمة المساهمة: ${money(b.notional)}`) : null,
      b.period && h('span.small.muted', 'عن شهر ', ltr(b.period)),
    );
  }

  function memberCard(a) {
    const active = a.status !== 'withdrawn';
    const editable = active && !closed;
    const cr = a.counsel_request_id ? data.counsel_requests.find((r) => r.id === a.counsel_request_id) : null;
    const acts = editable
      ? h(
          'div.btn-group.pb-member-actions',
          button('تعديل الصلاحيات', { size: 'sm', variant: 'primary', icon: 'shield', onClick: () => openGrantsDialog(a) }),
          button('تعديل الإسناد', { size: 'sm', icon: 'edit', onClick: () => openEditAssignmentDialog(a) }),
          a.status !== 'approved' && button('سحب الإسناد', { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => openWithdrawDialog(a) }),
        )
      : null;
    return h(
      'article.pb-member',
      { class: [!active && 'is-withdrawn', isOverdue(a) && 'is-overdue'] },
      h(
        'div.pb-member-head',
        avatar(a.lawyer_name),
        h(
          'div.pb-member-id',
          h('a.pb-member-name', { href: `#/lawyers/${a.lawyer_id}` }, a.lawyer_name),
          h(
            'div.row',
            statusBadge('assignment_role', a.role),
            statusBadge('assignment_status', a.status),
            active && OPEN_ASSIGNMENT.includes(a.status) && dueBadge(a.due_at),
          ),
          (a.specialties || []).length > 0 && h('span.cell-sub', `التخصصات: ${a.specialties.map(areaLabel).join('، ')}`),
        ),
        acts,
      ),
      cr && h('p.small.muted.pb-cr-origin', icon('users', { size: 14 }), `بناءً على طلب ${cr.requester_name}: ${label('counsel_kind', cr.kind)}${cr.specialty ? ` — ${areaLabel(cr.specialty)}` : ''}`),
      textBlock('السؤال المطلوب تحديدًا', a.brief || 'لم يُحدَّد سؤال بعينه', { iconName: 'fileText' }),
      kv(
        [
          ['الأتعاب', feeText(a)],
          ['الاحتساب المالي', billingNode(a)],
          ['تاريخ الإسناد', dateTime(a.assigned_at)],
          ['فتح الملف', a.first_opened_at ? dateTime(a.first_opened_at) : h('span.muted', 'لم يفتحه بعد')],
          ['موعد التسليم', a.due_at ? dateTime(a.due_at) : null],
          ['تقديم الرأي', a.submitted_at ? dateTime(a.submitted_at) : h('span.muted', 'لم يُقدَّم بعد')],
          a.approved_at && ['الاعتماد', dateTime(a.approved_at)],
          a.hours_spent != null && ['الساعات المسجلة', `${a.hours_spent} ساعة`],
        ],
        { columns: 2, className: 'pb-member-kv' },
      ),
      active && seesSummary(a),
    );
  }

  function renderTeam() {
    const active = data.assignments.filter((a) => a.status !== 'withdrawn');
    const withdrawn = data.assignments.filter((a) => a.status === 'withdrawn');
    return h(
      'div.stack',
      h(
        'div.pb-team-head',
        alertBox(
          'ما تراه الإدارة ليس بالضرورة ما يراه المحامي: كل عضو يرى فقط ما منحته له صراحة، ولكلٍّ دوره وأتعابه المستقلة.',
          'info',
          { icon: 'shield' },
        ),
        !closed && button('إسناد محامٍ', { variant: 'primary', icon: 'userPlus', onClick: () => openAssignDialog() }),
      ),
      active.length
        ? h('div.stack', active.map(memberCard))
        : emptyState('لم يُسند الملف لأي محامٍ بعد', !closed && button('إسناد محامٍ', { variant: 'primary', icon: 'userPlus', onClick: () => openAssignDialog() }), { icon: 'users' }),
      withdrawn.length > 0 && h('details.pb-older', h('summary', `إسنادات مسحوبة (${withdrawn.length})`), h('div.stack.mt-2', withdrawn.map(memberCard))),
    );
  }

  async function openAssignDialog({ counsel = null } = {}) {
    const activeLead = data.assignments.find((a) => a.role === 'lead' && a.status !== 'withdrawn');
    const roleOptions = options('assignment_role').map((o) => ({ ...o, disabled: o.value === 'lead' && Boolean(activeLead || counsel) }));
    let role = counsel ? COUNSEL_ROLE[counsel.kind] || 'specialist' : activeLead ? 'specialist' : 'lead';
    let area = counsel?.specialty || c.legal_area;
    let selected = null;
    let lawyers = [];
    const radioName = uid('lawyer');
    const errBox = h('div');
    const pickHost = h('div.pb-pick-list', { role: 'radiogroup', 'aria-label': 'المحامون المقترحون مرتبين حسب الملاءمة' });
    const rolesNote = h('p.small.muted.pb-grants-note', { 'aria-live': 'polite' });

    const grants = grantsEditor({
      initial: counsel
        ? { facts: true, client_name: false, issue_ids: counsel.issue_ids || [], document_ids: counsel.document_ids || [], opinion_assignment_ids: [], info_request_ids: [] }
        : { facts: true, client_name: false, issue_ids: [], document_ids: [], opinion_assignment_ids: [], info_request_ids: [] },
    });

    async function loadDefaults(fromRoleChange) {
      if (counsel) return;
      try {
        const g = await api.get(`/admin/cases/${id}/default-grants`, { role });
        if (fromRoleChange || !grants.touched()) {
          grants.set(g);
          rolesNote.textContent = fromRoleChange ? `حُدّثت الصلاحيات المقترحة لدور «${label('assignment_role', role)}». راجعها قبل الإسناد.` : '';
        }
      } catch {
        /* تبقى الصلاحيات الحالية */
      }
    }

    function syncPicks() {
      pickHost.querySelectorAll('.pb-pick').forEach((el) => el.classList.toggle('is-selected', el.dataset.id === String(selected)));
    }

    function pickCard(l, idx) {
      const input = h('input', {
        type: 'radio',
        name: radioName,
        value: String(l.id),
        checked: selected === l.id,
        onChange: () => {
          selected = l.id;
          clear(errBox);
          syncPicks();
        },
      });
      return h(
        'label.pb-pick',
        { dataset: { id: l.id }, class: selected === l.id && 'is-selected' },
        input,
        h(
          'span.pb-pick-main',
          h(
            'span.pb-pick-head',
            h('span.cell-title', l.display_name || l.name),
            idx === 0 && badge('الأعلى ترتيبًا', 'accent', { icon: 'star' }),
            l.specialty_match ? badge('تخصص مطابق', 'success', { icon: 'check' }) : badge('خارج التخصص المطلوب', 'warning', { icon: 'alert' }),
            l.over_capacity && badge('تجاوز طاقته الاستيعابية', 'danger', { icon: 'alert' }),
          ),
          (l.specialties || []).length > 0 && h('span.cell-sub', `التخصصات: ${l.specialties.map(areaLabel).join('، ')}`),
          (l.reasons || []).length > 0 && h('span.cell-sub', l.reasons.join(' · ')),
          l.agreement_text && h('span.cell-sub', `الاتفاق: ${l.agreement_text}`),
        ),
      );
    }

    async function loadSuggestions() {
      mount(pickHost, loading('جارٍ ترتيب المحامين المقترحين…'));
      try {
        const res = await api.get(`/admin/cases/${id}/suggest-lawyers`, { area });
        lawyers = (res && res.items) || [];
        if (selected && !lawyers.some((l) => l.id === selected)) selected = null;
        mount(
          pickHost,
          lawyers.length
            ? lawyers.map(pickCard)
            : emptyState('لا يوجد محامون نشطون غير أعضاء الفريق الحاليين', null, { compact: true, icon: 'users' }),
        );
      } catch (err) {
        mount(pickHost, errorState(err, loadSuggestions));
      }
    }

    const areaSel = selectInput({
      options: areaOptions(),
      value: area,
      allLabel: null,
      label: 'التخصص المطلوب',
      onChange: (v) => {
        area = v;
        loadSuggestions();
      },
    });

    const f = form(
      [
        {
          name: 'role',
          label: 'دور المحامي في الملف',
          type: 'select',
          required: true,
          options: roleOptions,
          placeholder: false,
          hint: activeLead ? `يوجد محامٍ أساسي بالفعل (${activeLead.lawyer_name})؛ لا يُسمح إلا بمحامٍ أساسي واحد نشط.` : null,
          onChange: (v) => {
            if (!v || v === role) return;
            role = v;
            loadDefaults(true);
          },
        },
        { name: 'due_at', label: 'موعد التسليم', type: 'date', endOfDay: true, hint: ctx.meta?.settings?.default_assignment_days ? `إن تُرك فارغًا يكون بعد ${ctx.meta.settings.default_assignment_days} أيام من الإسناد (المدة الافتراضية في الإعدادات).` : 'إن تُرك فارغًا يُحدَّد حسب المدة الافتراضية في الإعدادات.' },
        {
          name: 'fee_mode',
          label: 'معاملة الأتعاب لهذه المهمة',
          type: 'select',
          required: true,
          placeholder: false,
          options: options('fee_mode'),
          onChange: (v, fapi) => {
            fapi.control('fee_amount').wrap.hidden = v !== 'custom';
          },
        },
        { name: 'fee_amount', label: 'مبلغ الأتعاب', type: 'money', min: 0.01, hint: 'يُستحق للمحامي عند اعتماد رأيه أو حسب اتفاقه.' },
        {
          name: 'brief',
          label: 'السؤال المطلوب تحديدًا',
          type: 'textarea',
          required: true,
          minLength: 10,
          maxLength: 5000,
          rows: 4,
          placeholder: 'مثال: إبداء الرأي في الأثر الضريبي لبيع الشقة الموروثة (المسألة رقم 3 فقط).',
          hint: 'كلما كان السؤال محددًا كان الرأي أدق وأسرع.',
        },
      ],
      {
        values: {
          role,
          fee_mode: 'agreement',
          brief: counsel ? `${label('counsel_kind', counsel.kind)}: ${counsel.description || ''}` : '',
        },
        footer: false,
      },
    );
    f.control('fee_amount').wrap.hidden = true;

    let shareCb = null;
    let requester = null;
    if (counsel) {
      requester = assignmentById.get(counsel.requester_assignment_id);
      shareCb = h('input', { type: 'checkbox', checked: true });
    }

    let result = null;
    const body = frag(
      counsel &&
        alertBox(
          frag(
            h('div', `طلبه: ${counsel.requester_name || lawyerLabel(requester)} — ${label('counsel_kind', counsel.kind)}${counsel.specialty ? ` — التخصص: ${areaLabel(counsel.specialty)}` : ''}`),
            h('div.pb-pre', counsel.description),
          ),
          'info',
          { title: 'طلب مساعدة محامٍ', icon: 'users' },
        ),
      h(
        'section.pb-dialog-section',
        h('h3.pb-dialog-h', h('span.pb-dialog-num', '1'), 'اختيار المحامي'),
        h('div.row.pb-area-row', h('span.small.muted', 'ترتيب المحامين حسب الملاءمة لتخصص:'), areaSel),
        pickHost,
      ),
      h('section.pb-dialog-section', h('h3.pb-dialog-h', h('span.pb-dialog-num', '2'), 'الدور والتكليف والأتعاب'), f.el),
      h(
        'section.pb-dialog-section',
        h('h3.pb-dialog-h', h('span.pb-dialog-num', '3'), 'ما يراه هذا المحامي'),
        rolesNote,
        grants.el,
        counsel &&
          h(
            'label.check.check-single',
            shareCb,
            h('span', `إتاحة رأي المحامي الجديد للمحامي الطالب (${counsel.requester_name || lawyerLabel(requester)})`),
          ),
      ),
      errBox,
    );

    modal({
      title: counsel ? 'إسناد طلب المساعدة إلى محامٍ' : 'إسناد محامٍ إلى الملف',
      size: 'lg',
      body,
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'إسناد المحامي',
          variant: 'primary',
          icon: 'userPlus',
          onClick: async () => {
            clear(errBox);
            const showErr = (msg) => {
              mount(errBox, alertBox(msg, 'danger'));
              errBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            };
            if (!selected) {
              showErr('اختر المحامي من القائمة أولًا.');
              pickHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              return false;
            }
            if (!f.validate()) return false;
            const v = f.getValues();
            if (v.fee_mode === 'custom' && !(Number(v.fee_amount) > 0)) {
              f.setErrors({ fee_amount: 'أدخل مبلغ الأتعاب المحدد لهذه المهمة' });
              return false;
            }
            const payload = {
              lawyer_id: selected,
              role: v.role,
              brief: v.brief,
              due_at: v.due_at || undefined,
              fee_mode: v.fee_mode,
              fee_amount: v.fee_mode === 'custom' ? v.fee_amount : undefined,
              grants: grants.value(),
            };
            try {
              result = counsel
                ? await api.post(`/admin/counsel-requests/${counsel.id}/assign`, { ...payload, share_with_requester: shareCb.checked })
                : await api.post(`/admin/cases/${id}/assignments`, payload);
            } catch (err) {
              showErr(errorMessage(err));
              return false;
            }
            return undefined;
          },
        },
      ],
      onClose: async (reason) => {
        if (reason !== 'action' || !result) return;
        (result.warnings || []).forEach((w) => toast(w, 'warning', 9000));
        await refresh(counsel ? 'تم إسناد طلب المساعدة وأُبلغ المحاميان' : 'تم إسناد المحامي وأُبلغ بالمهمة', { tab: counsel ? 'requests' : 'team' });
      },
    });
    loadSuggestions();
    loadDefaults(false);
  }

  function openGrantsDialog(a) {
    const ed = grantsEditor({ initial: a.grants, assignmentId: a.id });
    let saved = false;
    modal({
      title: `ما يراه ${a.lawyer_name}`,
      size: 'lg',
      body: frag(
        h('p.modal-intro', `${label('assignment_role', a.role)} — أي تعديل يُطبَّق فورًا ويُبلَّغ به المحامي.`),
        ed.el,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حفظ الصلاحيات',
          variant: 'primary',
          icon: 'shield',
          onClick: async () => {
            await api.put(`/admin/assignments/${a.id}/grants`, ed.value());
            saved = true;
          },
        },
      ],
      onClose: () => {
        if (saved) refresh('تم تحديث ما يراه المحامي وأُبلغ بالتحديث', { tab: 'team' });
      },
    });
  }

  async function openEditAssignmentDialog(a) {
    const locked = Boolean(a.billing);
    const res = await formModal({
      title: `تعديل إسناد ${a.lawyer_name}`,
      intro: locked ? 'سُجلت واقعة الاستحقاق لهذا الإسناد، لذا لا يمكن تعديل الأتعاب.' : null,
      fields: [
        { name: 'brief', label: 'السؤال المطلوب تحديدًا', type: 'textarea', rows: 4, maxLength: 5000 },
        { name: 'due_at', label: 'موعد التسليم', type: 'datetime' },
        {
          name: 'fee_mode',
          label: 'معاملة الأتعاب',
          type: 'select',
          placeholder: false,
          options: options('fee_mode'),
          disabled: locked,
          onChange: (v, fapi) => {
            fapi.control('fee_amount').wrap.hidden = v !== 'custom';
          },
        },
        { name: 'fee_amount', label: 'مبلغ الأتعاب', type: 'money', min: 0.01, disabled: locked },
      ],
      values: { brief: a.brief || '', due_at: a.due_at, fee_mode: a.fee_mode, fee_amount: a.fee_amount },
      setup: (f) => {
        f.control('fee_amount').wrap.hidden = a.fee_mode !== 'custom';
      },
      onSubmit: async (v, fapi) => {
        const body = { brief: v.brief || null, due_at: v.due_at || null };
        if (!locked) {
          if (v.fee_mode === 'custom' && !(Number(v.fee_amount) > 0)) {
            fapi.setErrors({ fee_amount: 'أدخل مبلغ الأتعاب المحدد لهذه المهمة' });
            throw new Error('أدخل مبلغ الأتعاب المحدد لهذه المهمة');
          }
          if (v.fee_mode !== a.fee_mode || (v.fee_mode === 'custom' && Number(v.fee_amount) !== Number(a.fee_amount))) {
            body.fee_mode = v.fee_mode;
            if (v.fee_mode === 'custom') body.fee_amount = v.fee_amount;
          }
        }
        return api.patch(`/admin/assignments/${a.id}`, body);
      },
    });
    if (res) await refresh('تم تحديث بيانات الإسناد', { tab: 'team' });
  }

  async function openWithdrawDialog(a) {
    const res = await formModal({
      title: `سحب الإسناد من ${a.lawyer_name}`,
      intro: 'سيتوقف وصول المحامي إلى الملف فورًا، وتُلغى طلباته المعلقة، ويُعتبر رأيه المقدَّم (إن وُجد) نسخة سابقة. لا يمكن التراجع عن هذا الإجراء.',
      danger: true,
      submitLabel: 'نعم، سحب الإسناد',
      submitIcon: 'x',
      fields: [{ name: 'note', label: 'سبب السحب (يصل للمحامي)', type: 'textarea', rows: 3, maxLength: 500 }],
      onSubmit: (v) => api.post(`/admin/assignments/${a.id}/withdraw`, { note: v.note || null }),
    });
    if (res) await refresh('تم سحب الإسناد', { tab: 'team' });
  }

  // ───────────────────────── الطلبات ─────────────────────────

  function irStages(r) {
    let states;
    switch (r.status) {
      case 'pending_admin':
        states = ['done', 'current', 'todo', 'todo'];
        break;
      case 'sent_to_client':
        states = ['done', 'done', 'current', 'todo'];
        break;
      case 'client_replied':
        states = ['done', 'done', 'done', 'current'];
        break;
      case 'shared':
        states = r.sent_at ? ['done', 'done', r.client_reply ? 'done' : 'skipped', 'done'] : ['done', 'skipped', 'skipped', 'done'];
        break;
      default:
        states = ['done', 'todo', 'todo', 'todo'];
    }
    const labels = [r.assignment_id ? 'طلب المحامي' : 'طلب الإدارة', 'موافقة الإدارة والإرسال للعميل', 'رد العميل', 'مراجعة الإدارة والإتاحة للمحامي'];
    return labels.map((l, i) => ({ label: l, state: states[i] }));
  }

  function docChips(docs) {
    if (!docs || !docs.length) return null;
    return h(
      'div.pb-doc-chips',
      docs.map((d) =>
        h('a.doc-chip', { href: downloadUrl(d.id), target: '_blank', rel: 'noopener noreferrer', title: `تنزيل ${d.filename || d.title}` }, icon('paperclip', { size: 14 }), h('span', { dir: 'auto' }, d.title || d.filename)),
      ),
    );
  }

  function infoRequestCard(r) {
    const requester = r.assignment_id ? assignmentById.get(r.assignment_id) : null;
    const who = r.assignment_id ? `طلبه: ${requester ? requester.lawyer_name : r.requested_by_name || 'محامٍ'}` : `أنشأته الإدارة${r.requested_by_name ? ` (${r.requested_by_name})` : ''}`;
    const needs = ['pending_admin', 'client_replied'].includes(r.status);
    const acts = [];
    if (!closed) {
      if (r.status === 'pending_admin') {
        acts.push(button('موافقة وإرسال للعميل', { variant: 'primary', size: 'sm', icon: 'send', onClick: () => openApproveIrDialog(r) }));
        acts.push(button('الرد مباشرة دون سؤال العميل', { size: 'sm', icon: 'checkCircle', onClick: () => openShareIrDialog(r, { direct: true }) }));
        acts.push(button('رفض الطلب', { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => openRejectIrDialog(r) }));
      } else if (r.status === 'sent_to_client') {
        acts.push(button('تسجيل رد العميل', { variant: 'primary', size: 'sm', icon: 'message', onClick: () => openRecordReplyDialog(r) }));
        acts.push(button('إتاحة للمحامي', { size: 'sm', icon: 'shieldCheck', onClick: () => openShareIrDialog(r) }));
        acts.push(button('إلغاء الطلب', { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => cancelIr(r) }));
      } else if (r.status === 'client_replied') {
        acts.push(button('مراجعة وإتاحة للمحامي', { variant: 'primary', size: 'sm', icon: 'shieldCheck', onClick: () => openShareIrDialog(r) }));
        acts.push(button('تسجيل رد إضافي', { size: 'sm', icon: 'message', onClick: () => openRecordReplyDialog(r) }));
        acts.push(button('إلغاء الطلب', { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => cancelIr(r) }));
      }
    }
    const showSteps = !['rejected', 'cancelled'].includes(r.status);
    return h(
      'article.pb-req',
      { class: needs && 'needs-action' },
      h(
        'div.pb-req-head',
        statusBadge('info_request_kind', r.kind),
        statusBadge('info_request_status', r.status),
        h('span.small.muted', who),
        h('span.small.muted', '·'),
        timeTag(r.created_at, { relative: true }),
        r.reminder_count > 0 && badge(`تذكيرات آلية للعميل: ${r.reminder_count}`, 'accent', { icon: 'zap', title: r.last_reminder_at ? `آخر تذكير: ${dateTime(r.last_reminder_at)}` : null }),
      ),
      showSteps && stepper(irStages(r)),
      h(
        'div.pb-blocks',
        textBlock(r.assignment_id ? 'صياغة المحامي (داخلية)' : 'المطلوب (صياغة داخلية)', r.question, { iconName: 'fileText' }),
        textBlock('الرسالة التي أُرسلت للعميل', r.client_message, {
          iconName: 'send',
          meta: r.sent_at ? `${r.sent_channel ? `عبر ${label('channel', r.sent_channel)} · ` : ''}${dateTime(r.sent_at)}` : null,
        }),
        textBlock('رد العميل', r.client_reply, { iconName: 'message', meta: r.replied_at ? dateTime(r.replied_at) : null, tone: 'client' }),
        textBlock('ما أُتيح للمحامي', r.response_text, { iconName: 'shieldCheck', meta: r.shared_at ? dateTime(r.shared_at) : null, tone: 'shared' }),
        textBlock(r.status === 'rejected' ? 'سبب الرفض' : 'ملاحظة الإدارة', r.admin_note, { iconName: 'info', tone: 'note' }),
      ),
      docChips(r.documents),
      acts.length > 0 && h('div.btn-group', acts),
    );
  }

  function counselCard(r) {
    const requester = assignmentById.get(r.requester_assignment_id);
    const assigned = r.assigned_assignment_id ? assignmentById.get(r.assigned_assignment_id) : null;
    const issues = (r.issue_ids || []).map(issueText);
    const docs = (r.document_ids || []).map((did) => docById.get(did)).filter(Boolean);
    const acts = [];
    if (!closed && r.status === 'pending_admin') {
      acts.push(button('إسناد إلى محامٍ', { variant: 'primary', size: 'sm', icon: 'userPlus', onClick: () => openAssignDialog({ counsel: r }) }));
      acts.push(button('رفض', { size: 'sm', variant: 'ghost', icon: 'x', onClick: () => openRejectCounselDialog(r) }));
    }
    return h(
      'article.pb-req',
      { class: r.status === 'pending_admin' && 'needs-action' },
      h(
        'div.pb-req-head',
        statusBadge('counsel_kind', r.kind),
        statusBadge('counsel_status', r.status),
        r.specialty && badge(`التخصص المطلوب: ${areaLabel(r.specialty)}`, 'info', { icon: 'scale' }),
        h('span.small.muted', `طلبه: ${r.requester_name || lawyerLabel(requester)}${requester ? ` — ${label('assignment_role', requester.role)}` : ''}`),
        h('span.small.muted', '·'),
        timeTag(r.created_at, { relative: true }),
      ),
      h(
        'div.pb-blocks',
        textBlock('وصف المطلوب', r.description, { iconName: 'fileText' }),
        issues.length > 0 && textBlock('المسائل المشار إليها', issues.join('\n'), { iconName: 'flag' }),
        textBlock(r.status === 'rejected' ? 'سبب الرفض' : 'ملاحظة الإدارة', r.admin_note, { iconName: 'info', tone: 'note' }),
      ),
      docs.length > 0 && h('div.stack-sm', h('span.small.muted', 'المستندات المشار إليها:'), docChips(docs)),
      assigned &&
        h(
          'p.pb-assigned-line',
          icon('userPlus', { size: 15 }),
          `أُسند إلى ${assigned.lawyer_name} بصفته «${label('assignment_role', assigned.role)}» — `,
          statusBadge('assignment_status', assigned.status),
          button('عرض في الفريق', { size: 'sm', variant: 'link', onClick: () => goTab('team') }),
        ),
      acts.length > 0 && h('div.btn-group', acts),
    );
  }

  function renderRequests() {
    const order = { pending_admin: 0, client_replied: 1, sent_to_client: 2, shared: 3, rejected: 4, cancelled: 5 };
    const irs = [...data.info_requests].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.id - a.id);
    const crOrder = { pending_admin: 0, assigned: 1, completed: 2, rejected: 3, cancelled: 4 };
    const crs = [...data.counsel_requests].sort((a, b) => (crOrder[a.status] ?? 9) - (crOrder[b.status] ?? 9) || b.id - a.id);
    return h(
      'div.stack-lg',
      alertBox(
        'المحامي لا يتواصل مع العميل أبدًا: يضغط «طلب معلومات» أو «طلب مستند» أو «طلب مساعدة محامٍ»، فتوافق الإدارة وتتواصل المؤسسة مع العميل، ثم تراجع الإدارة الرد وتتيحه للمحامي.',
        'info',
        { icon: 'shield' },
      ),
      card({
        title: 'طلبات المعلومات والمستندات',
        subtitle: 'كل طلب يمر بالإدارة قبل أن يصل للعميل، وكل رد يمر بها قبل أن يصل للمحامي',
        icon: 'mail',
        actions: !closed && button('طلب من العميل مباشرة', { size: 'sm', variant: 'primary', icon: 'send', onClick: () => openStaffRequestDialog() }),
        body: irs.length ? h('div.stack', irs.map(infoRequestCard)) : emptyState('لا توجد طلبات معلومات أو مستندات في هذا الملف', null, { compact: true, icon: 'mail' }),
      }),
      card({
        title: 'طلبات مساعدة محامٍ',
        subtitle: 'رأي ثانٍ، رأي متخصص، مراجعة مستند، أو مشاركة محامٍ — تختار الإدارة المحامي وتحدد ما يراه',
        icon: 'users',
        body: crs.length ? h('div.stack', crs.map(counselCard)) : emptyState('لم يطلب أي محامٍ مساعدة في هذا الملف', null, { compact: true, icon: 'users' }),
      }),
    );
  }

  async function openStaffRequestDialog(prefill = {}) {
    const res = await formModal({
      title: 'طلب معلومة أو مستند من العميل مباشرة',
      intro: 'تُرسل الرسالة باسم المؤسسة، ويُضاف إليها تلقائيًا رقم الملف وطريقة الرد.',
      fields: [
        { name: 'kind', label: 'نوع الطلب', type: 'select', required: true, placeholder: false, options: options('info_request_kind') },
        { name: 'channel', label: 'قناة الإرسال', type: 'select', placeholder: false, options: CHANNEL_OPTIONS },
        { name: 'question', label: 'المطلوب (للسجل الداخلي)', type: 'textarea', required: true, minLength: 5, maxLength: 3000, rows: 3 },
        { name: 'client_message', label: 'نص الرسالة للعميل', type: 'textarea', maxLength: 3000, rows: 4, hint: 'اتركه فارغًا لإرسال نص المطلوب كما هو.' },
      ],
      values: { kind: prefill.kind || 'information', channel: 'auto', question: prefill.question || '' },
      submitLabel: 'إرسال للعميل',
      submitIcon: 'send',
      onSubmit: (v) =>
        api.post(`/admin/cases/${id}/info-requests`, { kind: v.kind, question: v.question, client_message: v.client_message || v.question, channel: v.channel || 'auto' }),
    });
    if (res) await refresh('أُرسل الطلب للعميل', { tab: 'requests' });
  }

  async function openApproveIrDialog(r) {
    const res = await formModal({
      title: 'موافقة وإرسال الطلب للعميل',
      intro: 'صِغ السؤال بلغة واضحة مناسبة للعميل. سيُضاف تلقائيًا رقم الملف وطريقة الرد.',
      before: textBlock(r.assignment_id ? 'صياغة المحامي (لن يراها العميل)' : 'المطلوب', r.question, { iconName: 'fileText' }),
      fields: [
        { name: 'client_message', label: 'نص الرسالة للعميل', type: 'textarea', required: true, maxLength: 3000, rows: 5 },
        { name: 'channel', label: 'قناة الإرسال', type: 'select', placeholder: false, options: CHANNEL_OPTIONS },
      ],
      values: { client_message: r.question, channel: 'auto' },
      submitLabel: 'إرسال للعميل',
      submitIcon: 'send',
      onSubmit: (v) => api.post(`/admin/info-requests/${r.id}/approve`, { client_message: v.client_message, channel: v.channel || 'auto' }),
    });
    if (res) await refresh('أُرسل الطلب للعميل، وسيُبلَّغ المحامي عند إتاحة الرد', { tab: 'requests' });
  }

  async function openRejectIrDialog(r) {
    const res = await formModal({
      title: 'رفض طلب المعلومات',
      intro: 'لن يُرسل شيء للعميل، وسيصل سبب الرفض للمحامي.',
      before: textBlock('صياغة المحامي', r.question, { iconName: 'fileText' }),
      danger: true,
      submitLabel: 'رفض الطلب',
      fields: [{ name: 'note', label: 'سبب الرفض', type: 'textarea', required: true, maxLength: 2000, rows: 3 }],
      onSubmit: (v) => api.post(`/admin/info-requests/${r.id}/reject`, { note: v.note }),
    });
    if (res) await refresh('رُفض الطلب وأُبلغ المحامي', { tab: 'requests' });
  }

  async function openShareIrDialog(r, { direct = false } = {}) {
    const docs = data.documents;
    const others = activeTeam.filter((a) => a.id !== r.assignment_id);
    const requester = r.assignment_id ? assignmentById.get(r.assignment_id) : null;
    const res = await formModal({
      title: direct ? 'الرد على طلب المحامي مباشرة' : 'مراجعة الرد وإتاحته للمحامي',
      size: 'lg',
      intro: direct
        ? 'إن كانت المعلومة متوفرة لدى الإدارة، أجب المحامي مباشرة دون مراسلة العميل.'
        : 'سيرى المحامي نص الرد والمستندات المختارة فقط، ولن يرى رسالة العميل الأصلية ولا رقمه.',
      before: frag(
        textBlock(r.assignment_id ? 'صياغة المحامي' : 'المطلوب', r.question, { iconName: 'fileText' }),
        textBlock('رد العميل كما ورد', r.client_reply, { iconName: 'message', tone: 'client' }),
      ),
      fields: [
        {
          name: 'response_text',
          label: 'الرد المتاح للمحامي',
          type: 'textarea',
          required: true,
          maxLength: 10000,
          rows: 5,
          hint: 'صِغ المعلومة بشكل مهني ومحايد، دون بيانات تواصل العميل.',
        },
        docs.length > 0 && {
          name: 'document_ids',
          label: 'المستندات التي تُتاح معه',
          type: 'checkboxes',
          options: docs.map((d) => ({ value: d.id, label: d.title })),
        },
        others.length > 0 && {
          name: 'share_with_assignment_ids',
          label: requester ? `إتاحة الرد أيضًا لأعضاء آخرين في الفريق (إضافة إلى ${requester.lawyer_name})` : 'إتاحة الرد لأعضاء الفريق',
          type: 'checkboxes',
          options: others.map((a) => ({ value: a.id, label: `${a.lawyer_name} — ${label('assignment_role', a.role)}` })),
        },
      ],
      values: {
        response_text: r.response_text || r.client_reply || '',
        document_ids: docs.filter((d) => d.info_request_id === r.id).map((d) => d.id),
        share_with_assignment_ids: [],
      },
      submitLabel: 'إتاحة للمحامي',
      submitIcon: 'shieldCheck',
      onSubmit: (v) =>
        api.post(`/admin/info-requests/${r.id}/share`, {
          response_text: v.response_text,
          document_ids: v.document_ids || [],
          share_with_assignment_ids: v.share_with_assignment_ids || [],
        }),
    });
    if (res) await refresh('أُتيح الرد للمحامي وأُبلغ به', { tab: 'requests' });
  }

  async function openRecordReplyDialog(r) {
    const inbound = data.messages.filter((m) => m.direction === 'in').slice().reverse();
    const after = r.sent_at ? new Date(r.sent_at).getTime() : 0;
    const linkable = data.documents.filter((d) => !d.info_request_id || d.info_request_id === r.id);
    const msgLabel = (m) =>
      h(
        'span.pb-msg-pick',
        h('span.pb-msg-pick-meta', `${label('channel', m.channel)} · ${dateTime(m.created_at)}`),
        h('span.pb-msg-pick-body', { dir: 'auto' }, truncate(m.body, 220)),
        (m.documents || []).length > 0 && h('span.cell-sub', `مرفقات: ${m.documents.map((d) => d.filename).join('، ')}`),
      );
    const res = await formModal({
      title: 'تسجيل رد العميل على الطلب',
      size: 'lg',
      className: 'pb-reply-form',
      intro: 'اختر رسائل العميل التي تمثل رده على هذا الطلب (تُربط مرفقاتها تلقائيًا)، أو اكتب ملخص الرد إن ورد بطريقة أخرى.',
      before: textBlock('الرسالة المرسلة للعميل', r.client_message || r.question, { iconName: 'send', meta: r.sent_at ? dateTime(r.sent_at) : null }),
      fields: [
        inbound.length
          ? { name: 'message_ids', label: 'رسائل العميل (الأحدث أولًا)', type: 'checkboxes', options: inbound.map((m) => ({ value: m.id, label: msgLabel(m) })) }
          : { name: '_none', type: 'static', label: 'رسائل العميل', value: 'لا توجد رسائل واردة من العميل في هذا الملف بعد', full: true },
        linkable.length > 0 && {
          name: 'document_ids',
          label: 'مستندات أخرى في الملف تخص هذا الطلب',
          type: 'checkboxes',
          options: linkable.map((d) => ({ value: d.id, label: d.title })),
        },
        { name: 'reply_text', label: 'ملخص الرد (اختياري)', type: 'textarea', rows: 3, maxLength: 10000, hint: 'مثلًا إن أفاد العميل بالمعلومة في مكالمة هاتفية.' },
      ],
      values: {
        message_ids: inbound.filter((m) => after && new Date(m.created_at).getTime() > after).map((m) => m.id),
        document_ids: linkable.filter((d) => d.info_request_id === r.id).map((d) => d.id),
      },
      submitLabel: 'تسجيل الرد',
      submitIcon: 'check',
      onSubmit: (v) => {
        const mids = v.message_ids || [];
        const dids = v.document_ids || [];
        if (!mids.length && !dids.length && !v.reply_text) throw new Error('حدد رسالة من رسائل العميل أو مستندًا، أو اكتب ملخص الرد.');
        return api.post(`/admin/info-requests/${r.id}/record-reply`, { message_ids: mids, document_ids: dids, reply_text: v.reply_text || null });
      },
    });
    if (res) await refresh('سُجل رد العميل. راجعه ثم أتحه للمحامي.', { tab: 'requests' });
  }

  async function cancelIr(r) {
    const ok = await confirmAction({
      title: 'إلغاء طلب المعلومات',
      message: 'سيُلغى الطلب ولن تتابعه المؤسسة مع العميل، ولن تُرسل له تذكيرات آلية. هل تريد المتابعة؟',
      confirmLabel: 'نعم، إلغاء الطلب',
    });
    if (!ok) return;
    try {
      await api.post(`/admin/info-requests/${r.id}/cancel`);
      await refresh('أُلغي الطلب', { tab: 'requests' });
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  }

  async function openRejectCounselDialog(r) {
    const res = await formModal({
      title: 'رفض طلب المساعدة',
      intro: 'سيصل سبب الرفض للمحامي الذي طلب المساعدة.',
      danger: true,
      submitLabel: 'رفض الطلب',
      fields: [{ name: 'note', label: 'سبب الرفض', type: 'textarea', required: true, maxLength: 2000, rows: 3 }],
      onSubmit: (v) => api.post(`/admin/counsel-requests/${r.id}/reject`, { note: v.note }),
    });
    if (res) await refresh('رُفض طلب المساعدة وأُبلغ المحامي', { tab: 'requests' });
  }

  // ───────────────────────── الآراء والمراجعة ─────────────────────────

  function pipeline() {
    const ops = data.opinions;
    const approved = ops.filter((o) => o.status === 'approved');
    const submitted = ops.filter((o) => o.status === 'submitted');
    const answers = data.client_answers;
    const sent = answers.filter((x) => x.status === 'sent');
    const drafts = answers.filter((x) => x.status === 'draft');
    const st = (done, current) => (done ? 'done' : current ? 'current' : 'todo');
    const stages = [
      { title: 'رأي المحامي (داخلي)', sub: ops.length ? `آراء مقدَّمة: ${ops.length}` : 'لم يُقدَّم رأي بعد', icon: 'fileText', state: st(ops.length > 0, activeTeam.length > 0) },
      { title: 'مراجعة الإدارة', sub: submitted.length ? `بانتظار مراجعتك: ${submitted.length}` : approved.length ? `آراء معتمدة: ${approved.length}` : '—', icon: 'shieldCheck', state: st(approved.length > 0 && !submitted.length, submitted.length > 0) },
      { title: 'نسخة العميل', sub: answers.length ? `مسودات: ${drafts.length} · مرسلة: ${sent.length}` : approved.length ? 'أعِدّها من رأي معتمد' : '—', icon: 'edit', state: st(answers.length > 0 && !drafts.length, approved.length > 0 && (!answers.length || drafts.length > 0)) },
      { title: 'الإرسال للعميل', sub: sent.length ? `أُرسل ${dateTime(sent[sent.length - 1].sent_at)}` : '—', icon: 'send', state: st(sent.length > 0, drafts.length > 0) },
    ];
    const sr = { done: 'مكتملة', current: 'المرحلة الحالية', todo: 'لم تبدأ بعد' };
    return h(
      'section.card.pb-pipeline-card',
      h(
        'div.card-body',
        h(
          'ol.pb-pipeline',
          { 'aria-label': 'مسار الرأي حتى يصل للعميل' },
          stages.map((s, i) =>
            h(
              'li.pb-stage',
              { class: `is-${s.state}`, 'aria-current': s.state === 'current' ? 'step' : null },
              h('span.pb-stage-icon', { 'aria-hidden': 'true' }, icon(s.state === 'done' ? 'check' : s.icon, { size: 18 })),
              h('span.pb-stage-text', h('span.pb-stage-title', `${i + 1}. ${s.title}`), h('span.pb-stage-sub', s.sub), h('span.sr-only', ` (${sr[s.state]})`)),
            ),
          ),
        ),
        h('p.small.muted.mt-3', 'ضغط المحامي على «تقديم» لا يعني أن العميل تلقى الرد: يعود الرأي أولًا للإدارة لتعتمده أو تعيده، ثم تُعِد الإدارة نسخة مبسطة موجهة للعميل وترسلها.'),
      ),
    );
  }

  function opinionItem(o, a) {
    const acts = [];
    if (!closed && o.status === 'submitted') {
      acts.push(button('اعتماد الرأي', { variant: 'primary', size: 'sm', icon: 'check', onClick: () => openApproveOpinionDialog(o, a) }));
      acts.push(button('إعادة للمحامي', { size: 'sm', icon: 'refresh', onClick: () => openReturnOpinionDialog(o, a) }));
    }
    if (!closed && o.status === 'approved') {
      acts.push(button('إعداد رد للعميل من هذا الرأي', { size: 'sm', icon: 'edit', onClick: () => openAnswerDialog({ opinion: o, answer: latestDraft() }) }));
    }
    return h(
      'article.pb-opinion',
      { class: `is-${o.status}` },
      h(
        'div.pb-opinion-head',
        h('strong', `الإصدار ${o.version}`),
        statusBadge('opinion_status', o.status),
        o.submitted_at && h('span.small.muted', `قُدِّم ${dateTime(o.submitted_at)}`),
        o.reviewed_at && h('span.small.muted', `رُوجع ${dateTime(o.reviewed_at)}${o.reviewer_name ? ` — ${o.reviewer_name}` : ''}`),
        o.quality_score ? stars(o.quality_score) : null,
      ),
      h('div.pb-opinion-body', { dir: 'auto' }, o.body),
      o.review_note && h('div.pb-review-note', { class: o.status === 'returned' && 'is-returned' }, h('strong', o.status === 'returned' ? 'ملاحظات الإعادة: ' : 'ملاحظة المراجعة: '), o.review_note),
      acts.length > 0 && h('div.btn-group', acts),
    );
  }

  function opinionGroups() {
    const groups = new Map();
    for (const o of data.opinions) {
      if (!groups.has(o.assignment_id)) groups.set(o.assignment_id, []);
      groups.get(o.assignment_id).push(o);
    }
    if (!groups.size) {
      return card({
        title: 'آراء المحامين',
        icon: 'fileText',
        body: emptyState(activeTeam.length ? 'لم يقدّم أي محامٍ رأيه بعد. ستظهر الآراء هنا فور تقديمها للإدارة.' : 'أسند الملف لمحامٍ أولًا ليقدّم رأيه.', null, { compact: true, icon: 'fileText' }),
      });
    }
    const orderedIds = data.assignments.map((a) => a.id).filter((x) => groups.has(x));
    return h(
      'div.stack',
      orderedIds.map((aid) => {
        const a = assignmentById.get(aid);
        const versions = [...groups.get(aid)].sort((x, y) => y.version - x.version);
        const [latest, ...older] = versions;
        return card({
          title: h('span.pb-inline', a ? a.lawyer_name : `عضو #${aid}`, a && statusBadge('assignment_role', a.role)),
          subtitle: a ? `حالة الإسناد: ${label('assignment_status', a.status)}` : null,
          icon: 'user',
          className: latest.status === 'submitted' ? 'pb-op-group needs-action' : 'pb-op-group',
          body: h(
            'div.stack',
            opinionItem(latest, a),
            older.length > 0 && h('details.pb-older', h('summary', `الإصدارات السابقة (${older.length})`), h('div.stack.mt-2', older.map((o) => opinionItem(o, a)))),
          ),
        });
      }),
    );
  }

  function answersCard() {
    const approved = data.opinions.filter((o) => o.status === 'approved');
    const answers = [...data.client_answers].sort((x, y) => y.id - x.id);
    const opById = new Map(data.opinions.map((o) => [o.id, o]));
    const item = (ans) => {
      const op = ans.opinion_id ? opById.get(ans.opinion_id) : null;
      const a = op ? assignmentById.get(op.assignment_id) : null;
      return h(
        'article.answer-item.pb-answer',
        { class: ans.status === 'draft' && 'is-draft' },
        h(
          'div.pb-opinion-head',
          statusBadge('client_answer_status', ans.status),
          op && h('span.small.muted', `مبني على رأي ${a ? a.lawyer_name : op.lawyer_name} (الإصدار ${op.version})`),
          h('span.small.muted', ans.status === 'sent' ? `أُرسل ${dateTime(ans.sent_at)}${ans.channel ? ` عبر ${label('channel', ans.channel)}` : ''}` : `آخر تحديث ${relative(ans.updated_at)}`),
        ),
        h('div.answer-body', { dir: 'auto' }, ans.body),
        ans.status === 'draft' &&
          !closed &&
          h(
            'div.btn-group.mt-3',
            button('إرسال للعميل', { variant: 'primary', size: 'sm', icon: 'send', onClick: () => openSendAnswerDialog(ans) }),
            button('تعديل', { size: 'sm', icon: 'edit', onClick: () => openAnswerDialog({ answer: ans }) }),
          ),
      );
    };
    return card({
      title: 'الرد الموجه للعميل',
      subtitle: 'الصياغة النهائية للعميل قد تختلف عن الصياغة المهنية الداخلية؛ تراجعها الإدارة قبل الإرسال',
      icon: 'send',
      actions:
        !closed &&
        approved.length > 0 &&
        button(latestDraft() ? 'متابعة مسودة الرد' : 'إعداد رد للعميل', { size: 'sm', variant: 'primary', icon: 'edit', onClick: () => openAnswerDialog({ answer: latestDraft() }) }),
      body: answers.length
        ? h('div.stack', answers.map(item))
        : emptyState(approved.length ? 'لم يُعَدّ رد للعميل بعد. ابدأ من رأي معتمد.' : 'لا يوجد رأي معتمد بعد؛ اعتمد رأي المحامي أولًا ثم أعِدّ الرد للعميل.', null, { compact: true, icon: 'send' }),
    });
  }

  function latestDraft() {
    return data.client_answers.filter((x) => x.status === 'draft').sort((x, y) => y.id - x.id)[0] || null;
  }

  function renderOpinions() {
    return h('div.stack-lg', pipeline(), opinionGroups(), answersCard());
  }

  async function openApproveOpinionDialog(o, a) {
    const isLead = a && a.role === 'lead';
    const res = await formModal({
      title: `اعتماد رأي ${a ? a.lawyer_name : o.lawyer_name}`,
      intro: `الاعتماد يعني أن الرأي سليم مهنيًا، ولا يصل للعميل إلا بعد إعداد نسخة مبسطة وإرسالها.${isLead ? ' اعتماد رأي المحامي الأساسي ينقل الملف إلى «معتمد — بانتظار الرد على العميل».' : ''} قد تُستحق أتعاب المحامي عند الاعتماد حسب اتفاقه.`,
      fields: [
        { name: 'quality_score', label: 'تقييم جودة الرأي', type: 'select', required: true, options: QUALITY_OPTIONS, hint: 'يُستخدم في مؤشرات أداء المحامي وترشيحه للملفات القادمة.' },
        { name: 'note', label: 'ملاحظة للمحامي (اختيارية)', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      submitLabel: 'اعتماد الرأي',
      submitIcon: 'check',
      onSubmit: (v) => api.post(`/admin/opinions/${o.id}/approve`, { quality_score: v.quality_score, note: v.note || null }),
    });
    if (res) await refresh('اعتُمد الرأي وأُبلغ المحامي', { tab: 'opinions' });
  }

  async function openReturnOpinionDialog(o, a) {
    const res = await formModal({
      title: `إعادة رأي ${a ? a.lawyer_name : o.lawyer_name} للتعديل`,
      intro: 'ستظهر ملاحظاتك للمحامي، وتُنشأ له نسخة عمل جديدة من نص رأيه حتى لا يضيع شيء.',
      fields: [{ name: 'note', label: 'ملاحظات الإعادة', type: 'textarea', required: true, minLength: 10, maxLength: 5000, rows: 5 }],
      submitLabel: 'إعادة للمحامي',
      submitIcon: 'refresh',
      onSubmit: (v) => api.post(`/admin/opinions/${o.id}/return`, { note: v.note }),
    });
    if (res) await refresh('أُعيد الرأي للمحامي مع ملاحظاتك', { tab: 'opinions' });
  }

  async function openAnswerDialog({ opinion = null, answer = null } = {}) {
    const approved = data.opinions.filter((o) => o.status === 'approved');
    if (!approved.length && !answer) {
      toast('اعتمد رأيًا واحدًا على الأقل قبل إعداد الرد للعميل', 'warning');
      return;
    }
    const opById = new Map(data.opinions.map((o) => [o.id, o]));
    const opLabel = (o) => {
      const a = assignmentById.get(o.assignment_id);
      return `${a ? a.lawyer_name : o.lawyer_name} — ${label('assignment_role', o.role)} (الإصدار ${o.version})`;
    };
    const initialOp = opinion || (answer && answer.opinion_id ? opById.get(answer.opinion_id) : null) || (approved.length === 1 ? approved[0] : null);
    let autoText = answer ? null : initialOp ? initialOp.body : '';
    let fref = null;
    const aiNote = h('p.small.muted', { 'aria-live': 'polite' });
    const aiBtn = asyncButton(
      'صياغة مبسطة بالذكاء الاصطناعي',
      async () => {
        const opId = fref.control('opinion_id').get();
        if (!opId) {
          fref.setErrors({ opinion_id: 'اختر الرأي المعتمد أولًا' });
          return;
        }
        const sug = await api.post(`/admin/cases/${id}/ai/client-version`, { opinion_id: opId });
        const text = sug && sug.output && sug.output.text;
        if (!text) {
          toast('لم يُرجِع الذكاء الاصطناعي صياغة، اكتب الرد يدويًا', 'warning');
          return;
        }
        fref.control('body').set(text);
        autoText = text;
        aiNote.textContent = `صياغة آلية (${providerLabel(sug, aiStatus)}). راجعها وعدّلها قبل الحفظ — المسؤولية على الإدارة.`;
      },
      { size: 'sm', icon: 'sparkle' },
    );
    const res = await formModal({
      title: answer ? 'تعديل الرد الموجه للعميل' : 'إعداد رد للعميل',
      size: 'lg',
      intro: 'ابدأ من نص الرأي المعتمد ثم بسّطه بلغة يفهمها العميل، أو استعن بالذكاء الاصطناعي ثم راجع الصياغة.',
      fields: [
        {
          name: 'opinion_id',
          label: 'الرأي المعتمد الذي يُبنى عليه الرد',
          type: 'select',
          required: true,
          options: approved.map((o) => ({ value: o.id, label: opLabel(o) })),
          full: true,
          onChange: (v) => {
            const o = opById.get(Number(v));
            const bodyCtl = fref.control('body');
            const cur = bodyCtl.get();
            if (o && (!cur || cur === (autoText || '').trim())) {
              bodyCtl.set(o.body);
              autoText = o.body;
            }
          },
        },
        { name: '_ai', type: 'static', label: 'مساعدة الذكاء الاصطناعي', full: true, render: () => h('div.stack-sm', h('div.row', aiBtn), aiNote) },
        { name: 'body', label: 'نص الرد للعميل', type: 'textarea', required: true, maxLength: 4000, rows: 14, counter: true },
      ],
      values: { opinion_id: initialOp ? initialOp.id : null, body: answer ? answer.body : initialOp ? initialOp.body : '' },
      setup: (f) => {
        fref = f;
      },
      submitLabel: 'حفظ المسودة',
      submitIcon: 'check',
      onSubmit: (v) => api.post(`/admin/cases/${id}/client-answers`, { id: answer ? answer.id : undefined, opinion_id: v.opinion_id, body: v.body }),
    });
    if (res) await refresh('حُفظت مسودة الرد. راجعها ثم أرسلها للعميل.', { tab: 'opinions' });
  }

  async function openSendAnswerDialog(ans) {
    const res = await formModal({
      title: 'إرسال الرد للعميل',
      intro: 'بعد الإرسال لا يمكن تعديل الرد. تأكد من مراجعة الصياغة النهائية.',
      before: h('div.pb-preview', { dir: 'auto' }, ans.body),
      fields: [{ name: 'channel', label: 'قناة الإرسال', type: 'select', placeholder: false, options: CHANNEL_OPTIONS }],
      values: { channel: 'auto' },
      submitLabel: 'إرسال الآن',
      submitIcon: 'send',
      onSubmit: (v) => api.post(`/admin/client-answers/${ans.id}/send`, { channel: v.channel || 'auto' }),
    });
    if (res) await refresh('أُرسل الرد للعميل. أغلق الملف عند انتهاء المتابعة.', { tab: 'opinions' });
  }

  // ───────────────────────── المستندات ─────────────────────────

  function renderDocuments() {
    const viewersOf = (did) => activeTeam.filter((a) => (a.grants.document_ids || []).includes(did));
    const irById = new Map(data.info_requests.map((r) => [r.id, r]));
    const columns = [
      {
        key: 'title',
        label: 'المستند',
        className: 'col-wide',
        render: (d) =>
          h(
            'div',
            h('div.cell-title', { dir: 'auto' }, d.title),
            d.filename !== d.title && h('div.cell-sub', { dir: 'auto' }, d.filename),
            d.info_request_id && irById.has(d.info_request_id) && h('div.cell-sub', `مرفق بطلب: ${truncate(irById.get(d.info_request_id).question, 60)}`),
          ),
      },
      { key: 'by', label: 'أضافه', render: (d) => statusBadge('actor_kind', d.uploaded_by_kind) },
      { key: 'date', label: 'التاريخ', render: (d) => h('span.small.nowrap', dateTime(d.created_at)) },
      { key: 'size', label: 'الحجم', render: (d) => h('span.small.nowrap', formatBytes(d.size)) },
      {
        key: 'viewers',
        label: 'من يراه من الفريق',
        render: (d) => {
          const v = viewersOf(d.id);
          return v.length ? chips(v.map((a) => ({ label: a.lawyer_name, tone: 'primary' }))) : h('span.small.muted.pb-inline', icon('lock', { size: 13 }), 'الإدارة فقط');
        },
      },
      {
        key: 'actions',
        label: 'إجراءات',
        render: (d) =>
          h(
            'div.btn-group.pb-table-actions',
            button('تنزيل', { size: 'sm', variant: 'ghost', icon: 'download', href: downloadUrl(d.id), target: '_blank', ariaLabel: `تنزيل ${d.title}` }),
            button('إعادة تسمية', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openRenameDocDialog(d), ariaLabel: `إعادة تسمية ${d.title}` }),
          ),
      },
    ];
    return h(
      'div.stack',
      card({
        title: 'مستندات الملف',
        subtitle: 'لا يرى أي محامٍ مستندًا إلا إذا أتحته له من «تعديل الصلاحيات» في تبويب الفريق',
        icon: 'paperclip',
        flush: true,
        body: table({ columns, rows: data.documents, empty: 'لا توجد مستندات في هذا الملف بعد', caption: 'مستندات الملف' }),
      }),
      card({
        title: 'رفع مستندات جديدة',
        icon: 'upload',
        body: uploadPanel({
          hint: 'المستندات المرفوعة هنا تبقى للإدارة فقط حتى تتيحها.',
          onUpload: async (payload) => {
            await api.post(`/admin/cases/${id}/documents`, payload);
            await refresh('رُفعت المستندات إلى الملف', { tab: 'documents' });
          },
        }),
      }),
    );
  }

  async function openRenameDocDialog(d) {
    const res = await formModal({
      title: 'إعادة تسمية المستند',
      fields: [{ name: 'title', label: 'عنوان المستند', type: 'text', required: true, maxLength: 200 }],
      values: { title: d.title },
      onSubmit: (v) => api.patch(`/admin/documents/${d.id}`, { title: v.title }),
    });
    if (res) await refresh('تم تحديث عنوان المستند', { tab: 'documents' });
  }

  // ───────────────────────── المحادثة ─────────────────────────

  function renderConversation() {
    const failed = data.messages.filter((m) => m.direction === 'out' && m.status === 'failed').length;
    return h(
      'div.stack',
      alertBox('المحادثة الأصلية مع العميل تراها الإدارة فقط، ولا تُتاح لأي محامٍ. الرسائل من واتساب والموقع تظهر هنا في خيط واحد.', 'info', { icon: 'lock' }),
      failed > 0 && alertBox(`رسائل تعذر إرسالها: ${failed}. يمكنك إعادة المحاولة من داخل الرسالة.`, 'danger'),
      messageThread(data.messages, {
        inLabel: data.client?.name || 'العميل',
        outLabel: 'المؤسسة',
        onRetry: async (m) => {
          await api.post(`/admin/messages/${m.id}/retry`);
          await refresh('أُعيدت محاولة إرسال الرسالة', { tab: 'conversation' });
        },
      }),
      messageComposer({
        hint: 'بدون بيانات اعتماد واتساب تُسجَّل الرسائل «إرسال تجريبي (محاكاة)». للإرسال السريع: Ctrl+Enter',
        onSend: async ({ body, channel }) => {
          await api.post(`/admin/cases/${id}/messages`, { body, channel });
          await refresh('أُرسلت الرسالة للعميل', { tab: 'conversation' });
        },
      }),
    );
  }

  // ───────────────────────── التكلفة ─────────────────────────

  function renderCost() {
    const cost = data.cost;
    if (!cost) return emptyState('لا تتوفر بيانات التكلفة لهذا الملف', null, { icon: 'wallet' });
    const parts = [
      { key: 'direct', label: 'تكلفة مباشرة', value: cost.direct, tone: 'primary' },
      { key: 'expenses', label: 'مصروفات', value: cost.expenses, tone: 'warning' },
      { key: 'allocated', label: 'تكلفة محمّلة (تقديرية)', value: cost.allocated, tone: 'info' },
    ];
    const max = Math.max(...parts.map((p) => Number(p.value) || 0), Number(cost.pro_bono_value) || 0, 1);
    const bars = h(
      'div.pb-bars',
      { role: 'list', 'aria-label': 'مكونات تكلفة الملف' },
      [...parts, { key: 'pro_bono', label: 'قيمة المساهمات التطوعية', value: cost.pro_bono_value, tone: 'success' }].map((p) =>
        h(
          'div.pb-bar-row',
          { role: 'listitem' },
          h('span.pb-bar-label', p.label),
          h('span.pb-bar-track', { 'aria-hidden': 'true' }, h('span.pb-bar-fill', { class: `tone-${p.tone}`, style: { width: `${Number(p.value) > 0 ? Math.max(1, Math.round((Number(p.value) / max) * 100)) : 0}%` } })),
          h('span.pb-bar-value', money(p.value || 0)),
        ),
      ),
    );
    return h(
      'div.stack',
      h(
        'div.stats-grid',
        statCard({ label: 'إجمالي تكلفة الملف', value: money(cost.total), icon: 'wallet', tone: 'primary', hint: 'مباشرة + مصروفات + محمّلة' }),
        statCard({ label: 'التكلفة المباشرة', value: money(cost.direct), icon: 'briefcase', tone: 'neutral', hint: 'أتعاب مستحقة لهذا الملف' }),
        statCard({ label: 'التكلفة المحمّلة', value: money(cost.allocated), icon: 'chart', tone: 'info', hint: 'تقديرية' }),
        statCard({ label: 'قيمة المساهمات التطوعية', value: money(cost.pro_bono_value), icon: 'star', tone: 'success', hint: `لا تُدفع · محامون مشاركون: ${cost.lawyers_involved ?? '—'}` }),
      ),
      alertBox('التكلفة المحمّلة تقديرية (حصة من المبالغ الشهرية أو الباقات). التكلفة للإدارة فقط ولا تظهر لأي محامٍ.', 'info'),
      card({ title: 'مكونات التكلفة', icon: 'chart', body: bars }),
      card({
        title: 'بنود التكلفة',
        icon: 'wallet',
        flush: true,
        body: table({
          columns: [
            { key: 'label', label: 'البند', className: 'col-wide' },
            { key: 'kind', label: 'النوع', render: (l) => badge(COST_KIND[l.kind] || l.kind, l.kind === 'contribution' ? 'success' : l.kind === 'allocated' ? 'info' : 'neutral') },
            { key: 'status', label: 'حالة القيد', render: (l) => (l.status ? statusBadge('ledger_status', l.status) : null) },
            { key: 'amount', label: 'المبلغ', align: 'end', render: (l) => h('strong.nowrap', money(l.amount)) },
          ],
          rows: cost.lines || [],
          empty: 'لا توجد بنود تكلفة مسجلة بعد',
          caption: 'بنود تكلفة الملف',
        }),
      }),
    );
  }

  // ───────────────────────── نوافذ الترويسة ─────────────────────────

  async function openMessageDialog() {
    const res = await formModal({
      title: 'رسالة للعميل',
      intro: `تُرسل باسم المؤسسة إلى ${data.client?.name || 'العميل'}، وتظهر في تبويب المحادثة.`,
      fields: [
        { name: 'body', label: 'نص الرسالة', type: 'textarea', required: true, maxLength: 4000, rows: 5 },
        { name: 'channel', label: 'قناة الإرسال', type: 'select', placeholder: false, options: CHANNEL_OPTIONS },
      ],
      values: { channel: 'auto' },
      submitLabel: 'إرسال',
      submitIcon: 'send',
      onSubmit: (v) => api.post(`/admin/cases/${id}/messages`, { body: v.body, channel: v.channel || 'auto' }),
    });
    if (res) await refresh('أُرسلت الرسالة للعميل', { tab: 'conversation' });
  }

  async function openEditCaseDialog() {
    const staffOptions = (staff || []).map((s) => ({ value: s.id, label: `${s.name} (${label('user_role', s.role)})` }));
    const res = await formModal({
      title: 'تعديل بيانات الملف',
      fields: [
        { name: 'title', label: 'عنوان الملف', type: 'text', required: true, maxLength: 200, full: true },
        { name: 'legal_area', label: 'المجال القانوني', type: 'select', required: true, options: areaOptions(), hint: 'يبقى كود الملف كما هو؛ يُصحَّح المجال للتقارير والمعرفة.' },
        { name: 'priority', label: 'الأولوية', type: 'select', required: true, options: options('priority') },
        { name: 'due_at', label: 'الموعد المستهدف', type: 'date', endOfDay: true },
        staffOptions.length > 0 && { name: 'case_manager_id', label: 'مدير الحالة', type: 'select', options: staffOptions },
      ],
      values: { title: c.title, legal_area: c.legal_area, priority: c.priority, due_at: c.due_at, case_manager_id: c.case_manager_id },
      onSubmit: (v) => {
        const body = { title: v.title, legal_area: v.legal_area, priority: v.priority, due_at: v.due_at || null };
        if (staffOptions.length) body.case_manager_id = v.case_manager_id || null;
        return api.patch(`/admin/cases/${id}`, body);
      },
    });
    if (res) await refresh('تم تحديث بيانات الملف');
  }

  /** ينفذ طلبًا قد يُرفض بسبب آراء مقدمة لم تُراجع، ويعرض خيار التجاوز بعد التأكيد. */
  async function withPendingOpinionsOverride(send) {
    try {
      return await send(false);
    } catch (err) {
      const pending = err instanceof ApiError && err.status === 409 && err.details && err.details.pending_opinions;
      if (!pending || !pending.length) throw err;
      const ok = await confirmAction({
        title: 'توجد آراء مقدَّمة لم تُراجع بعد',
        message: `في الملف ${pending.length === 1 ? 'رأي مقدَّم' : `${pending.length} آراء مقدَّمة`} بانتظار مراجعة الإدارة. الإغلاق الآن سيحوّلها إلى «نسخة سابقة» ويسحب الإسنادات المفتوحة دون اعتماد. هل تريد الإغلاق مع تجاوز الآراء المعلقة؟`,
        confirmLabel: 'إغلاق مع تجاوز الآراء المعلقة',
      });
      if (!ok) throw new ApiError('لم يُغلق الملف. راجع الآراء المقدمة من تبويب «الآراء والمراجعة» أولًا.', { status: 409 });
      return send(true);
    }
  }

  async function openCloseDialog() {
    const res = await formModal({
      title: 'إغلاق الملف',
      intro: 'الإغلاق قرار الإدارة وحدها. ستُلغى الطلبات المعلقة، وتُسحب الإسنادات المفتوحة، ويُنشأ تلقائيًا سجل معرفي مجهّل بانتظار مراجعتك قبل استخدامه في المعرفة أو التدريب.',
      danger: true,
      submitLabel: 'إغلاق الملف',
      submitIcon: 'lock',
      fields: [
        { name: 'outcome', label: 'نتيجة الملف', type: 'select', required: true, options: options('case_outcome') },
        { name: 'note', label: 'ملاحظة الإغلاق', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      values: { outcome: c.status === 'answered' ? 'answered' : null },
      onSubmit: (v) => withPendingOpinionsOverride((force) => api.post(`/admin/cases/${id}/close`, { outcome: v.outcome, note: v.note || null, force: force || undefined })),
    });
    if (res) await refresh('أُغلق الملف، وأُنشئ سجل معرفي مجهّل للمراجعة');
  }

  async function openReopenDialog() {
    const res = await formModal({
      title: 'إعادة فتح الملف',
      intro: 'سيعود الملف إلى العمل ويمكنك إسناده من جديد. الإسنادات المسحوبة عند الإغلاق لا تعود تلقائيًا.',
      fields: [{ name: 'note', label: 'سبب إعادة الفتح (اختياري)', type: 'textarea', rows: 3, maxLength: 1000 }],
      submitLabel: 'إعادة فتح الملف',
      submitIcon: 'refresh',
      onSubmit: (v) => api.post(`/admin/cases/${id}/reopen`, { note: v.note || null }),
    });
    if (res) await refresh('أُعيد فتح الملف');
  }

  async function openMatterDialog(lawyers) {
    const lawyerOptions = (lawyers || []).map((l) => ({ value: l.id, label: l.display_name || l.name }));
    const res = await formModal({
      title: 'تحويل الاستشارة إلى ملف عمل مستمر',
      size: 'lg',
      intro: 'يُنشأ ملف مستمر (تمثيل قضائي أو عمل قانوني مستمر) مرتبط بنفس العميل وهذه الاستشارة، دون فقد أي شيء مما تم.',
      fields: [
        { name: 'kind', label: 'نوع الملف', type: 'select', required: true, options: options('matter_kind') },
        { name: 'responsible_lawyer_id', label: 'المحامي المسؤول', type: 'select', options: lawyerOptions, hint: 'يرى الملف المستمر من بوابته دون بيانات تواصل العميل أو الفواتير.' },
        { name: 'title', label: 'عنوان الملف المستمر', type: 'text', maxLength: 200, full: true },
        { name: 'court', label: 'المحكمة', type: 'text', maxLength: 150 },
        { name: 'circuit', label: 'الدائرة', type: 'text', maxLength: 100 },
        { name: 'lawsuit_number', label: 'رقم الدعوى', type: 'text', maxLength: 60, ltr: true },
        { name: 'lawsuit_year', label: 'سنة الدعوى', type: 'text', maxLength: 10, ltr: true },
        { name: 'opponent', label: 'الخصم', type: 'text', maxLength: 200 },
        { name: 'agreed_fee', label: 'الأتعاب المتفق عليها مع العميل', type: 'money', min: 0 },
        { name: 'notes', label: 'ملاحظات وتكليف المحامي', type: 'textarea', rows: 4, maxLength: 10000 },
        !closed && { name: 'close_case', type: 'checkbox', text: 'إغلاق ملف الاستشارة بنتيجة «تحوّل إلى ملف عمل مستمر»', full: true },
      ],
      values: {
        kind: 'litigation',
        title: c.title,
        responsible_lawyer_id: lead ? lead.lawyer_id : null,
        lawsuit_year: String(new Date().getFullYear()),
        close_case: true,
      },
      submitLabel: 'إنشاء الملف المستمر',
      submitIcon: 'gavel',
      onSubmit: (v) =>
        withPendingOpinionsOverride((force) =>
          api.post(`/admin/cases/${id}/matter`, {
            kind: v.kind,
            title: v.title || null,
            responsible_lawyer_id: v.responsible_lawyer_id || null,
            court: v.court || null,
            circuit: v.circuit || null,
            lawsuit_number: v.lawsuit_number || null,
            lawsuit_year: v.lawsuit_year || null,
            opponent: v.opponent || null,
            agreed_fee: v.agreed_fee ?? null,
            notes: v.notes || null,
            close_case: closed ? false : Boolean(v.close_case),
            force: force || undefined,
          }),
        ),
    });
    if (res && res.id) {
      toast(`أُنشئ الملف المستمر ${res.code || ''}`.trim(), 'success');
      ctx.refreshShell();
      ctx.navigate(`/matters/${res.id}`);
    }
  }

  async function openIssueDialog(issue) {
    const res = await formModal({
      title: issue ? `تعديل المسألة رقم ${issue.number}` : 'إضافة مسألة قانونية',
      intro: issue ? null : 'تأخذ المسألة الرقم التالي تلقائيًا، ثم تتيحها لمن تريد من الفريق.',
      fields: [
        { name: 'title', label: 'عنوان المسألة', type: 'text', required: true, maxLength: 300, full: true },
        { name: 'legal_area', label: 'مجال المسألة', type: 'select', options: areaOptions(), placeholder: false, hint: 'قد تختلف عن مجال الملف (مثل مسألة ضريبية في ملف مواريث).' },
        { name: 'details', label: 'تفاصيل (اختيارية)', type: 'textarea', rows: 3, maxLength: 3000 },
      ],
      values: issue ? { title: issue.title, legal_area: issue.legal_area || c.legal_area, details: issue.details || '' } : { legal_area: c.legal_area },
      onSubmit: (v) =>
        issue
          ? api.patch(`/admin/cases/${id}/issues/${issue.id}`, { title: v.title, legal_area: v.legal_area, details: v.details || null })
          : api.post(`/admin/cases/${id}/issues`, { title: v.title, legal_area: v.legal_area, details: v.details || null }),
    });
    if (res) await refresh(issue ? 'تم تعديل المسألة' : `أُضيفت المسألة رقم ${res.number || ''}`.trim());
  }

  // ───────────────────────── التجميع ─────────────────────────

  const pendingRequests =
    data.info_requests.filter((r) => ['pending_admin', 'client_replied'].includes(r.status)).length +
    data.counsel_requests.filter((r) => r.status === 'pending_admin').length;
  const submittedOps = data.opinions.filter((o) => o.status === 'submitted').length;
  const nz = (n) => (n > 0 ? n : null);

  const initialTab = TAB_KEYS.includes(ctx.query.tab) ? ctx.query.tab : 'overview';
  tabsEl = tabs(
    [
      { key: 'overview', label: 'نظرة عامة', icon: 'briefcase', render: renderOverview },
      { key: 'team', label: 'الفريق والصلاحيات', icon: 'users', count: nz(activeTeam.length), render: renderTeam },
      { key: 'requests', label: 'الطلبات', icon: 'mail', count: nz(pendingRequests), render: renderRequests },
      { key: 'opinions', label: 'الآراء والمراجعة', icon: 'fileText', count: nz(submittedOps), render: renderOpinions },
      { key: 'documents', label: 'المستندات', icon: 'paperclip', count: nz(data.documents.length), render: renderDocuments },
      { key: 'conversation', label: 'المحادثة', icon: 'message', count: nz(data.messages.length), render: renderConversation },
      { key: 'timeline', label: 'السجل', icon: 'clock', render: () => card({ title: 'السجل الزمني للملف', icon: 'clock', body: activityTimeline(data.activity) }) },
      { key: 'cost', label: 'التكلفة', icon: 'wallet', render: renderCost },
    ],
    { active: initialTab, onChange: (key) => syncTab(key), className: 'pb-case-tabs' },
  );

  return frag(header, attentionBar(), summaryCards(), tabsEl);
}
