// v10 b2b-staff (STF-2، U10-S07…S10، S18) — صفحة طلب الشركة لفريق المكتب.
// الترويسة والمسؤول، «المواعيد» مع ما تراه الشركة، شرائط التنبيه، «الفرز المقترح» و«فحص الباقة»، الطلب كما أرسلته الشركة،
// بطاقة مرسل الطلب (للإدارة فقط)، المحادثة (رسالة للشركة · ملاحظة داخلية)، العمل وفريقه وصلاحيات الذاكرة، التسليمات،
// عروض الأسعار والتكاليف (مدير النظام)، والسجل. الخادم هو المرجع في كل صلاحية وكل بوابة (409 تُعرض في مكانها).

import { h, mount } from '../../../lib/h.js';
import { api, downloadUrl, filesToUploads, formatBytes } from '../../../lib/api.js';
import { label, areaLabel, relative, dateTime, percent, isoToCairoDate, count } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  asyncButton,
  badge,
  icon,
  codeTag,
  alertBox,
  emptyState,
  errorMessage,
  formDialog,
  modal,
  kv,
  table,
  timeline,
  toast,
  fileInput,
  setBusy,
} from '../../../lib/ui.js';
import { typeByKey, stageByKey, PRIORITIES, labelOf } from '../../../lib/company-catalog.js';
/** gate C-12: كلمات الاستعجال كما تراها الشركة */
const prioWord = (k) => labelOf(PRIORITIES, k);
import {
  slaChip,
  flagChips,
  typeBadge,
  stageBadgeStaff,
  whenText,
  hm,
  providerLabel,
  lawyerHitMatched,
} from './company-requests.js';
import { promiseText, teamAuthor } from '../../../lib/company-ui.js';
import { coRequestFields } from '../../../lib/company-forms.js';
import { typeFields } from '../../../lib/company-catalog-fields.js';
import { docAiButton } from '../../components/doc-ai.js';
import { assignNotices } from '../../components/company-accept-sheet.js';
import { openDocument } from '../../components/doc-viewer.js';

const OPEN = ['submitted', 'awaiting_company', 'in_progress', 'delivered'];
const SEVERITY = { high: ['مرتفعة', 'danger'], medium: ['متوسطة', 'warning'], low: ['منخفضة', 'neutral'] };
const URGENCY = { urgent: 'عاجل', high: 'مرتفع', normal: 'عادي', low: 'منخفض' };
const POLICY = { approve: 'موافقة الشركة', bill: 'تُضاف للمطالبة', block: 'لا طلبات إضافية' };
const FIRST_KIND = { accept: 'بدء العمل', clarify: 'استيضاح', quote: 'عرض سعر', overage: 'طلب موافقة على تكلفة إضافية', decline: 'اعتذار' };
const PAUSE_REASON = { info: 'بانتظار معلومة من الشركة', quote: 'بانتظار موافقة على عرض', overage: 'بانتظار موافقة على تكلفة إضافية' };
const DECLINE_KINDS = [
  { value: 'out_of_scope', label: 'خارج النطاق', text: 'نعتذر عن هذا الطلب لأنه خارج نطاق الخدمة المتفق عليها.' },
  { value: 'conflict', label: 'تعارض مصالح', text: 'نعتذر عن هذا الطلب لوجود تعارض مصالح يمنعنا من العمل عليه.' },
  { value: 'not_legal', label: 'ليس طلبًا قانونيًا', text: 'نعتذر عن هذا الطلب لأنه لا يتضمن مسألة قانونية نستطيع العمل عليها.' },
  { value: 'duplicate', label: 'مكرر', text: 'نعتذر عن هذا الطلب لأنه مكرر لطلب سابق نعمل عليه بالفعل.' },
  { value: 'other', label: 'آخر', text: '' },
];
const CLOSE_OUTCOMES = [
  { value: 'delivered', label: 'سُلِّم العمل' },
  { value: 'resolved', label: 'حُلّت المسألة' },
  { value: 'withdrawn', label: 'سحبت الشركة الطلب' },
  { value: 'duplicate', label: 'طلب مكرر' },
];
/**
 * review: صلاحيات الذاكرة المحفوظة لكل إسناد في هذه الجلسة (assignment_id → memory_ids من رد PUT). الخادم لا يعيدها في صفحة
 * الطلب بعد، فبدون هذا تعود ورقة الصلاحيات بعد الحفظ إلى «عناصر الطلب» ويسحب حفظٌ ثانٍ ما أُتيح للمحامي دون قصد.
 */
export const savedGrants = new Map();
export const grantsOf = (a) => (Array.isArray(a && a.memory_ids) ? a.memory_ids : savedGrants.get(a && a.assignment_id));
/** review: «طلب واحد / طلبان / 4 طلبات / 12 طلبًا» بانتظار الاحتساب (مطابقة العدد والمعدود) */
export const pendingPhrase = (n) => count(n, ['طلب واحد', 'طلبان', 'طلبات', 'طلبًا']);
const LAWYER_NAME_MSG = (name) => `الرسالة تحتوي اسم محامٍ من فريق العمل («${name}»). الشركة لا ترى أسماء المحامين — احذف الاسم أو أعد الصياغة.`;
const AUTHOR_MSG = (filename, name) => `الملف ${filename} يحمل اسم ${name} في بياناته — احفظه من جديد بلا اسم الكاتب ثم ارفعه`;

/**
 * «الطلب كما أرسلته الشركة»: مكوّن البوابة coRequestFields (نفس الصياغة التي رأتها الشركة)؛ إن تعذّر عرضه (وحدة البوابة
 * قيد التعديل) تُعرض الحقول نفسها من الكتالوج المشترك حتى لا تتعطل صفحة الفريق.
 */
function requestFieldsEl(typeKey, fields) {
  try {
    return coRequestFields(typeKey, fields);
  } catch {
    const pairs = typeFields(typeKey)
      .filter((f) => fields[f.key] !== undefined && fields[f.key] !== null && fields[f.key] !== '' && !(Array.isArray(fields[f.key]) && !fields[f.key].length))
      .map((f) => {
        const v = fields[f.key];
        const opt = (k) => f.options?.find((o) => o.key === k)?.label ?? k;
        const shown = f.kind === 'bool' ? (v ? 'نعم' : 'لا') : Array.isArray(v) ? v.map(opt).join('، ') : f.options ? opt(v) : String(v);
        return [f.label, h('span', { dir: 'auto' }, shown)];
      });
    return kv(pairs, { columns: 2 });
  }
}

/** مستند للفريق: عرض + تحليل */
function docItem(d, { analyze = true } = {}) {
  return h(
    'li.cr-doc',
    icon('paperclip', { size: 15 }),
    h('a.cr-doc-name', { href: downloadUrl(d.id), dir: 'auto', onClick: (e) => (e.preventDefault(), openDocument(d)) }, d.title || d.filename),
    h('span.cr-doc-meta', [d.size ? formatBytes(d.size) : null, d.uploaded_by_kind === 'client' ? 'من الشركة' : d.uploaded_by_kind === 'lawyer' ? 'من المحامي' : 'من الفريق'].filter(Boolean).join(' · ')),
    analyze ? docAiButton({ documentId: d.id, label: 'تحليل' }) : null,
  );
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const user = ctx.user || {};
  const isAdmin = user.role === 'admin';
  let d = await api.get(`/admin/company-requests/${encodeURIComponent(id)}`);
  const staff = await api.get('/admin/staff').catch(() => []);
  let memoryIndex = null; // عناصر ذاكرة الشركة (لحل مراجع الفرز M-n)
  const root = h('div.cr-page');
  let composerState = { mode: 'company', text: '', files: [], docsReviewed: false };

  async function refresh(next) {
    d = next && next.request && next.rev !== undefined ? next : await api.get(`/admin/company-requests/${encodeURIComponent(id)}`);
    draw();
  }
  const done = (res) => refresh(res && res.rev !== undefined ? res : null);

  /** 409 request_changed: إعادة التحميل مع تنبيه */
  async function guard(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err && err.code === 'request_changed') {
        toast('تغيّر الطلب منذ فتحته؛ عُرضت آخر نسخة.', 'warning', 6000);
        await refresh();
        return null;
      }
      throw err;
    }
  }

  // ───────────── الأوراق ─────────────
  async function openAccept(plan = null) {
    const { openAcceptSheet } = await import('../../components/company-accept-sheet.js');
    await openAcceptSheet({ detail: d, user, plan, onDone: done, onDecline: () => decline() });
  }
  async function openClarify(prefill = {}) {
    const { openClarifySheet } = await import('../../components/company-clarify-sheet.js');
    await openClarifySheet({ detail: d, user, ...prefill, onDone: done });
  }
  async function openQuote(opts = {}) {
    const { openQuoteSheet } = await import('../../components/company-quote-sheet.js');
    await openQuoteSheet({ detail: d, user, ...opts, onDone: done });
  }
  async function openDeliverable(deliverable = null) {
    const { openDeliverableSheet } = await import('../../components/company-deliverable-sheet.js');
    // gate J-12: «إعداد تسليم» يتابع المسودة المفتوحة إن وُجدت (مسودة واحدة لكل طلب)
    const draft = deliverable || [...(d.deliverables || [])].reverse().find((x) => x.status === 'draft') || null;
    await openDeliverableSheet({ detail: d, user, deliverable: draft, onDone: done });
  }
  async function openGrants(a) {
    const { openMemoryGrants } = await import('../../components/company-memory-grants.js');
    await openMemoryGrants({
      detail: d,
      assignment: { ...a, memory_ids: grantsOf(a) },
      onDone: (saved) => {
        if (saved && Array.isArray(saved.memory_ids)) savedGrants.set(a.assignment_id, saved.memory_ids);
        refresh();
      },
    });
  }

  // ───────────── الإجراءات البسيطة ─────────────
  async function setHandler(v, sel) {
    sel.disabled = true;
    try {
      const res = await guard(() => api.patch(`/admin/company-requests/${d.request.id}`, { rev: d.rev, handler_id: v ? Number(v) : null }));
      if (res) {
        toast('حُفظ المسؤول عن الطلب.', 'success');
        await refresh(res);
      }
    } catch (err) {
      toast(errorMessage(err), 'danger');
      sel.value = d.request.handler_id ? String(d.request.handler_id) : '';
    } finally {
      sel.disabled = false;
    }
  }

  async function changeDue() {
    const res = await formDialog({
      title: 'تعديل موعد التسليم',
      intro: 'تراه الشركة: «عُدِّل موعد التسليم: {السبب}». لا تذكر أسماء المحامين في السبب.',
      submitLabel: 'حفظ الموعد',
      values: { delivery_due_at: d.sla.delivery_due_at },
      fields: [
        { name: 'delivery_due_at', label: 'موعد التسليم الجديد', type: 'datetime', required: true },
        { name: 'due_reason', label: 'السبب', type: 'textarea', required: true, maxLength: 300, rows: 2 },
      ],
      onSubmit: (v) => api.patch(`/admin/company-requests/${d.request.id}`, { rev: d.rev, delivery_due_at: v.delivery_due_at, due_reason: v.due_reason }),
    });
    if (res) {
      toast('عُدِّل موعد التسليم وأُبلغت الشركة.', 'success');
      await refresh(res);
    }
  }

  async function decline() {
    let f = null;
    const res = await formDialog({
      title: 'اعتذار عن الطلب',
      submitLabel: 'إرسال الاعتذار للشركة',
      size: 'lg',
      values: { kind: 'out_of_scope', reason_for_company: DECLINE_KINDS[0].text },
      fields: [
        { name: 'kind', label: 'السبب', type: 'select', required: true, placeholder: false, options: DECLINE_KINDS.map((k) => ({ value: k.value, label: k.label })), onChange: (v, api2) => {
          const k = DECLINE_KINDS.find((x) => x.value === v);
          const c = api2.control('reason_for_company');
          if (k && k.text && c) c.set(k.text);
        } },
        { name: 'reason_for_company', label: 'ما تراه الشركة', type: 'textarea', required: true, minLength: 5, maxLength: 1000, rows: 3, full: true },
        { name: 'note', label: 'ملاحظة داخلية', type: 'textarea', maxLength: 2000, rows: 2, full: true, hint: 'لا تراها الشركة.' },
      ],
      setup: (x) => (f = x),
      onSubmit: (v) => api.post(`/admin/company-requests/${d.request.id}/decline`, { rev: d.rev, kind: v.kind, reason_for_company: v.reason_for_company, note: v.note || undefined }),
    });
    void f;
    if (res) {
      toast(`أُرسل الاعتذار إلى ${d.company.name}.`, 'success');
      await refresh(res);
    }
  }

  async function closeRequest() {
    const res = await formDialog({
      title: 'إغلاق الطلب',
      submitLabel: 'إغلاق الطلب',
      values: { outcome: d.request.status === 'delivered' ? 'delivered' : 'resolved' },
      fields: [
        { name: 'outcome', label: 'النتيجة', type: 'select', required: true, placeholder: false, options: CLOSE_OUTCOMES },
        { name: 'note_for_company', label: 'ملاحظة للشركة', type: 'textarea', maxLength: 1000, rows: 3, full: true, hint: 'اختيارية — تظهر للشركة في صفحة الطلب.' },
      ],
      onSubmit: (v) => api.post(`/admin/company-requests/${d.request.id}/close`, { rev: d.rev, outcome: v.outcome, note_for_company: v.note_for_company || undefined }),
    });
    if (res) {
      toast('أُغلق الطلب.', 'success');
      await refresh(res);
    }
  }

  async function reopen() {
    const res = await formDialog({
      title: 'إعادة فتح الطلب',
      intro: 'خلال 30 يومًا من الإغلاق. يعود الطلب «جارٍ العمل» بموعد تسليم جديد، وتُبلَّغ الشركة.',
      submitLabel: 'إعادة فتح الطلب',
      fields: [{ name: 'reason', label: 'السبب', type: 'textarea', required: true, maxLength: 500, rows: 3, full: true }],
      onSubmit: (v) => api.post(`/admin/company-requests/${d.request.id}/reopen`, { rev: d.rev, reason: v.reason }),
    });
    if (res) {
      toast('أُعيد فتح الطلب.', 'success');
      await refresh(res);
    }
  }

  async function ackEscalation() {
    const res = await formDialog({
      title: 'تم الاطلاع على التصعيد',
      submitLabel: 'تم الاطلاع',
      fields: [{ name: 'note', label: 'ملاحظة المتابعة', type: 'textarea', required: true, maxLength: 1000, rows: 3, full: true, hint: 'داخلية — تُحفظ في ملاحظات الطلب.' }],
      onSubmit: (v) => api.post(`/admin/company-requests/${d.request.id}/escalation/ack`, { note: v.note }),
    });
    if (res) {
      toast('سُجّل الاطلاع على التصعيد.', 'success');
      await refresh(res);
    }
  }

  async function withdrawQuote(q) {
    const res = await formDialog({
      title: `سحب العرض ${q.number}`,
      intro: 'يُبلَّغ مديرو البوابة في الشركة بسحب العرض، ويعود الطلب إلى الفرز.',
      submitLabel: 'سحب العرض',
      fields: [{ name: 'reason', label: 'السبب (داخلي)', type: 'textarea', maxLength: 500, rows: 2, full: true }],
      onSubmit: (v) => api.post(`/admin/company-quotes/${q.id}/withdraw`, { reason: v.reason || undefined }),
    });
    if (res) {
      toast('سُحب العرض.', 'success');
      await refresh(res);
    }
  }

  async function withdrawDeliverable(x) {
    const res = await formDialog({
      title: 'سحب التسليم',
      intro: 'ترى الشركة: «سحب فريقكم القانوني هذا التسليم: {السبب}».',
      submitLabel: 'سحب التسليم',
      fields: [{ name: 'reason', label: 'السبب', type: 'textarea', required: true, maxLength: 500, rows: 2, full: true }],
      onSubmit: (v) => api.post(`/admin/company-deliverables/${x.id}/withdraw`, { reason: v.reason }),
    });
    if (res) {
      toast('سُحب التسليم.', 'success');
      await refresh(res);
    }
  }

  async function rerunTriage(btn) {
    setBusy(btn, true);
    try {
      await api.post(`/admin/company-requests/${d.request.id}/triage`, {});
      toast('اكتمل الفرز.', 'success');
      await refresh();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    } finally {
      setBusy(btn, false);
    }
  }

  /**
   * «مراجعة العقد في الذاكرة» (memory_pending، L-55؛ P0): نفس نموذج البوابة (coMemoryForm مع staff:true) في ورقة عنصر
   * الذاكرة المشتركة مع صفحة الشركة، و«حفظ وتأكيد» يزيل العلامة عن الطلب.
   */
  async function reviewMemory() {
    const mid = d.memory_item?.id;
    if (!mid) return;
    const { openMemoryItem } = await import('./company-detail.js');
    await openMemoryItem({ mid, companyId: d.company.id, user, onDone: () => refresh() });
  }

  // ───────────── الأجزاء ─────────────
  function header() {
    const r = d.request;
    const handlerSel = h(
      'select.input',
      { 'aria-label': 'المسؤول عن الطلب', onChange: (e) => setHandler(e.target.value, e.target) },
      h('option', { value: '' }, '— بلا مسؤول —'),
      (Array.isArray(staff) ? staff : []).map((s) => h('option', { value: String(s.id), selected: r.handler_id === s.id }, `${s.name}${s.role === 'admin' ? ' (مدير النظام)' : ''}`)),
    );
    const accepted = !!d.case;
    const actions = [];
    if (accepted && OPEN.includes(r.status)) {
      actions.push(button('سؤال للشركة', { variant: 'secondary', icon: 'message', onClick: () => openClarify() }));
      actions.push(button('إعداد تسليم', { variant: 'primary', icon: 'send', onClick: () => openDeliverable() }));
      actions.push(button('إغلاق الطلب', { variant: 'ghost', icon: 'check', onClick: closeRequest }));
      if (r.status === 'in_progress') actions.push(button('اعتذار عن الطلب', { variant: 'ghost', icon: 'x', onClick: decline }));
    } else if (r.status === 'closed' && accepted) {
      actions.push(button('إعادة فتح الطلب', { variant: 'secondary', icon: 'refresh', onClick: reopen }));
    }
    return pageHeader({
      title: r.title,
      breadcrumbs: [{ label: 'طلبات الشركات', href: '#/company-requests' }, { label: r.code }],
      meta: h(
        'div.cr-meta',
        codeTag(r.code),
        h('a.cr-company-link', { href: `#/companies/${d.company.id}` }, icon('building', { size: 15 }), d.company.name),
        typeBadge(r.type, r.type_label),
        r.priority && badge(prioWord(r.priority), r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'neutral', { icon: 'flag' }),
        stageBadgeStaff(r),
        r.status_label && r.status_label !== stageByKey(r.stage)?.staff_label ? h('span.cr-status', r.status_label) : null,
        d.company.read_only && badge('الشركة للاطلاع فقط', 'warning', { icon: 'lock' }),
      ),
      actions: [h('label.cr-handler', h('span', 'المسؤول عن الطلب'), h('div.select-wrap', handlerSel)), ...actions],
    });
  }

  function whenBox() {
    const s = d.sla || {};
    const r = d.request;
    const rows = [];
    if (s.first_response_at) {
      const onTime = !s.first_response_due_at || s.first_response_at <= s.first_response_due_at;
      rows.push(['الرد الأول', h('span', `تم ${whenText(s.first_response_at)} (${onTime ? 'في الموعد' : 'بعد الموعد'})`, r.first_response_kind ? h('span.muted', ` — ${FIRST_KIND[r.first_response_kind] || r.first_response_kind}`) : null)]);
    } else if (s.first_response_due_at) {
      rows.push(['الرد الأول', h('div.stack-sm', h('span', `قبل ${whenText(s.first_response_due_at)}`), s.phase === 'first_response' ? slaChip(s, { withDue: false }) : null)]);
    }
    if (s.confirm_due_at && !s.delivery_due_at) rows.push(['تأكيد الموعد', h('div.stack-sm', h('span', `قبل ${whenText(s.confirm_due_at)}`), s.phase === 'confirm' ? slaChip(s, { withDue: false }) : null)]);
    if (s.delivery_due_at) {
      rows.push([
        'التسليم',
        h(
          'div.stack-sm',
          h('span', whenText(s.delivery_due_at)),
          s.phase === 'delivery' || s.state === 'paused' ? slaChip(s, { withDue: false }) : null,
          s.delivery_due_original_at && s.delivery_due_original_at !== s.delivery_due_at ? h('span.muted', `الأصلي: ${whenText(s.delivery_due_original_at)}`) : null,
          s.delivery_due_reason ? h('span.muted', { dir: 'auto' }, `السبب: ${s.delivery_due_reason}`) : null,
        ),
      ]);
    } else if (['met', 'missed'].includes(s.state)) rows.push(['التسليم', slaChip(s)]);
    if (Number(s.paused_minutes_total) > 0 || (s.pauses || []).length) {
      rows.push([
        'مدة التوقف',
        h(
          'div.stack-sm',
          h('span', h('span.num', hm(s.paused_minutes_total)), ' س عمل'),
          (s.pauses || []).length
            ? h('ul.cr-pauses', s.pauses.map((p) => h('li', `${PAUSE_REASON[p.reason] || p.reason}: ${whenText(p.started_at)}${p.ended_at ? ` ← ${whenText(p.ended_at)}` : ' (مستمر)'}`)))
            : null,
        ),
      ]);
    }
    const sees = promiseText(s.company_sees || {}, { stage: r.stage, remainingHours: r.remaining_business_hours });
    const canEditDue = !!s.delivery_due_at && ['in_progress', 'delivered'].includes(r.status);
    return card({
      title: 'المواعيد',
      icon: 'calendarClock',
      className: 'cr-when',
      body: h(
        'div.stack',
        rows.length ? kv(rows) : h('p.muted', 'لم تُحدَّد مواعيد بعد.'),
        sees && sees.text ? h('p.cr-sees', icon('eye', { size: 15 }), h('span', `ما تراه الشركة: «${sees.text}»`)) : null,
        canEditDue ? button('تعديل موعد التسليم', { variant: 'secondary', size: 'sm', icon: 'edit', onClick: changeDue }) : null,
      ),
    });
  }

  function banners() {
    const r = d.request;
    const f = new Set(r.flags || []);
    const out = [];
    // U10-S11: بدأ العمل لكن تعذّر إسناد محامٍ — يبقى ظاهرًا حتى يُغلق
    const notice = assignNotices.get(r.id);
    if (notice && notice.items.length) {
      out.push(
        h(
          'div.cr-banner.is-warning',
          icon('alert', { size: 18 }),
          h('div.cr-banner-text', notice.items.map((e) => h('p', `بدأ العمل، لكن تعذر إسناد ${e.lawyer_name || 'المحامي'}: ${e.error || e.code}.`))),
          d.case ? button('إسناد من ملف العمل', { variant: 'primary', size: 'sm', href: `#/cases/${d.case.id}?tab=team` }) : null,
          button('', { variant: 'ghost', size: 'sm', icon: 'x', ariaLabel: 'إخفاء التنبيه', onClick: () => (assignNotices.delete(r.id), draw()) }),
        ),
      );
    }
    if (r.escalation) {
      out.push(
        h(
          'div.cr-banner.is-danger',
          { id: 'cr-escalation' },
          icon('alert', { size: 18 }),
          h('div.cr-banner-text', h('strong', 'صعّدت الشركة الطلب: '), h('q', { dir: 'auto' }, r.escalation.reason || '—'), h('span.muted', ` — ${whenText(r.escalation.at)}`)),
          button('تم الاطلاع', { variant: 'primary', size: 'sm', onClick: ackEscalation }),
        ),
      );
    }
    if (f.has('plan_error') || f.has('quote_approved')) {
      out.push(
        h(
          'div.cr-banner',
          { class: f.has('plan_error') ? 'is-danger' : 'is-success' },
          icon(f.has('plan_error') ? 'alert' : 'checkCircle', { size: 18 }),
          h(
            'div.cr-banner-text',
            h('strong', f.has('plan_error') ? 'تعذّر بدء العمل تلقائيًا بعد موافقة الشركة على العرض.' : 'وافقت الشركة على العرض — ابدأ العمل.'),
            r.accept_plan_error ? h('p', { dir: 'auto' }, r.accept_plan_error) : null,
          ),
          r.status === 'submitted' || r.status === 'awaiting_company' ? button('بدء العمل', { variant: 'primary', size: 'sm', icon: 'briefcase', onClick: () => openAccept(r.accept_plan || null) }) : null,
        ),
      );
    }
    if (f.has('memory_pending') && d.memory_item) {
      out.push(
        h(
          'div.cr-banner.is-info',
          { id: 'cr-memory' },
          icon('bookOpen', { size: 18 }),
          h('div.cr-banner-text', h('strong', 'عقد جديد في الذاكرة القانونية بانتظار مراجعتك: '), h('span', { dir: 'auto' }, d.memory_item.title)),
          button('مراجعة العقد في الذاكرة', { variant: 'primary', size: 'sm', onClick: reviewMemory }),
        ),
      );
    }
    if (f.has('company_not_emailed')) {
      out.push(h('div.cr-banner.is-warning', icon('mailWarning', { size: 18 }), h('div.cr-banner-text', h('strong', 'لم تُبلَّغ الشركة بالبريد — اتصلوا بها.'), h('p', 'آخر تنبيه للشركة على هذا الطلب لم يصل بالبريد الإلكتروني؛ تظهر لها الرسالة في البوابة فقط.'))));
    }
    if (f.has('deadline_conflict') && r.needed_by && d.sla.delivery_due_at) {
      out.push(h('div.cr-banner.is-warning', icon('calendarClock', { size: 18 }), h('div.cr-banner-text', `الموعد الذي طلبته الشركة (${isoToCairoDate(r.needed_by) || r.needed_by}) قبل موعد التسليم المحسوب (${whenText(d.sla.delivery_due_at)}).`)));
    }
    if (f.has('clarification_answered')) {
      out.push(
        h(
          'div.cr-banner.is-info',
          icon('message', { size: 18 }),
          h('div.cr-banner-text', h('strong', 'ردّت الشركة على الاستيضاح.'), ' راجِع الرد في المحادثة.'),
          button('عرض الرد', { variant: 'secondary', size: 'sm', onClick: () => document.getElementById('cr-thread')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }),
        ),
      );
    }
    if (f.has('opinion_approved_not_delivered')) {
      out.push(h('div.cr-banner.is-info', icon('fileText', { size: 18 }), h('div.cr-banner-text', h('strong', 'رأي معتمد في ملف العمل لم يُسلَّم للشركة بعد.')), button('إعداد التسليم', { variant: 'primary', size: 'sm', icon: 'send', onClick: () => openDeliverable() })));
    }
    // U10-S18: بعد التسليم
    const finals = (d.deliverables || []).filter((x) => x.final && x.status === 'released');
    const lastFinal = finals[finals.length - 1];
    if (f.has('changes_requested') && lastFinal) {
      const rev = r.revisions || {};
      out.push(
        h(
          'div.cr-banner.is-warning.cr-changes',
          icon('edit', { size: 18 }),
          h(
            'div.cr-banner-text',
            h('strong', `طلبت الشركة تعديلات (${rev.used ?? 1} من ${rev.max ?? '—'})`),
            lastFinal.feedback ? h('p', { dir: 'auto' }, h('q', lastFinal.feedback)) : null,
            d.sla.delivery_due_at ? h('p', `التسليم المعدّل: ${whenText(d.sla.delivery_due_at)}`) : null,
          ),
          d.case ? button('إعادة إشراك المحامي', { variant: 'secondary', size: 'sm', icon: 'refresh', href: `#/cases/${d.case.id}?focus=team` }) : null,
        ),
      );
    }
    const accepted = (d.deliverables || []).find((x) => x.decision === 'accepted');
    if (accepted) {
      const low = Number(accepted.rating) > 0 && Number(accepted.rating) <= 2;
      out.push(
        h(
          'div.cr-banner',
          { class: low ? 'is-warning' : 'is-success' },
          icon(low ? 'alert' : 'checkCircle', { size: 18 }),
          h(
            'div.cr-banner-text',
            h('strong', 'اعتمدت الشركة التسليم'),
            accepted.rating ? h('span', ' · تقييمها ', h('span.cr-stars', { 'aria-label': `${accepted.rating} من 5` }, '★'.repeat(accepted.rating) + '☆'.repeat(5 - accepted.rating))) : null,
            accepted.feedback ? h('p', { dir: 'auto' }, h('q', accepted.feedback)) : null,
          ),
        ),
      );
    } else if (r.status === 'closed' && r.resolution === 'auto_closed') {
      out.push(h('div.cr-banner.is-neutral', icon('clock', { size: 18 }), h('div.cr-banner-text', 'أُغلق تلقائيًا بعد 7 أيام')));
    }
    if (r.status === 'declined') out.push(h('div.cr-banner.is-neutral', icon('x', { size: 18 }), h('div.cr-banner-text', h('strong', 'اعتذرنا عن الطلب: '), h('span', { dir: 'auto' }, r.resolution_note || ''))));
    if (r.status === 'cancelled') out.push(h('div.cr-banner.is-neutral', icon('x', { size: 18 }), h('div.cr-banner-text', 'ألغت الشركة الطلب.')));
    return out.length ? h('div.cr-banners', out) : null;
  }

  function memoryRefLine(ref) {
    const m = /^M-(\d+)$/.exec(ref.ref || '');
    const rq = /^R-([A-Z]{2,5}-\d{4,6})$/.exec(ref.ref || '');
    if (m) {
      const it = memoryIndex && memoryIndex.get(Number(m[1]));
      const text = it ? `${it.kind_label} · ${it.title}` : `عنصر من الذاكرة (${ref.ref})`;
      // gate C-13: نوع العنصر «موقف معتمد من الإدارة» ظاهر في النص؛ الشارة لمن يراه في الشركة (مديرو البوابة فقط)
      return h('li', h('a', { href: `#/companies/${d.company.id}?tab=memory&item=${m[1]}`, dir: 'auto' }, text), it && it.access === 'admins' ? badge(it.access_label || 'مديرو البوابة فقط', 'warning') : null, ref.why ? h('span.muted', ` — ${ref.why}`) : null);
    }
    if (rq) return h('li', h('a', { href: `#/company-requests?q=${encodeURIComponent(rq[1])}&status=closed` }, `طلب سابق ${rq[1]}`), ref.why ? h('span.muted', ` — ${ref.why}`) : null);
    return h('li', ref.ref, ref.why ? h('span.muted', ` — ${ref.why}`) : null);
  }

  function triageCard() {
    const r = d.request;
    const t = d.triage && d.triage.output;
    const sc = d.scope_check;
    const accepted = !!d.case;
    const parts = [];
    if (t) {
      parts.push(h('p.cr-oneline', { dir: 'auto' }, t.one_line || r.title));
      const typeLine = h('p', `النوع: ${typeByKey(r.type)?.label || r.type} (اختارته الشركة)`, t.type_confidence != null ? h('span', ' · ثقة ', h('span.num', percent(t.type_confidence))) : null);
      parts.push(typeLine);
      if (t.type && t.type !== r.type) parts.push(h('p.cr-disagree', icon('sparkle', { size: 14 }), `يرى الفرز أنه «${typeByKey(t.type)?.label || t.type}»: ${t.type_reason || ''}`));
      parts.push(
        kv(
          [
            ['المجال', h('span', areaLabel(t.practice_area || r.practice_area), (t.skills || []).length ? h('span.cr-chips', t.skills.map((s) => badge(label('b2b_skill', s), 'primary'))) : null)],
            ['الاستعجال المقترح', `${URGENCY[t.urgency] || t.urgency || '—'}${t.urgency_reason ? ` — ${t.urgency_reason}` : ''}`],
            ['الحجم', t.effort ? h('span', `${t.effort.size || '—'} · `, h('span.num', `${t.effort.hours_min ?? '—'}–${t.effort.hours_max ?? '—'}`), ` ساعات${t.effort.reason ? ` — ${t.effort.reason}` : ''}`) : null],
            ['نوع التسليم', t.deliverable_kind ? label('company_deliverable_kind', t.deliverable_kind) : null],
            ['مراجعة نهائية', `${t.senior_review ?? t.senior_review_recommended ? 'مقترحة' : 'غير لازمة'}`],
            ['العمل المستبعد', !t.excluded_work || t.excluded_work === 'none' ? 'لا يوجد' : `${label('company_excluded_work', t.excluded_work)} — ${t.scope_reason || ''}`],
          ],
          { columns: 2 },
        ),
      );
      if ((t.risk_flags || []).length) {
        parts.push(
          h(
            'div.cr-sub',
            h('h3.cr-sub-title', 'المخاطر'),
            h('ul.cr-risks', t.risk_flags.map((x) => h('li', badge(SEVERITY[x.severity]?.[0] || x.severity, SEVERITY[x.severity]?.[1] || 'neutral', { dot: true }), h('span', ` ${label('company_risk', x.code)}${x.note ? `: ${x.note}` : ''}`)))),
          ),
        );
      }
      const missing = t.missing_info || [];
      if (missing.length) {
        const checks = missing.map((x) => ({ x, cb: h('input', { type: 'checkbox', checked: true }) }));
        parts.push(
          h(
            'div.cr-sub',
            h('h3.cr-sub-title', 'ينقصه'),
            h('ul.cr-missing', checks.map(({ x, cb }) => h('li', h('label.check', cb, h('span', h('strong', x.kind === 'document' ? 'مستند: ' : 'معلومة: '), x.item, x.why ? h('span.muted', ` — ${x.why}`) : null))))),
            OPEN.includes(r.status) ? button('اسأل الشركة عن المحدد', { variant: 'secondary', size: 'sm', icon: 'message', onClick: () => openClarify({ items: checks.filter((c) => c.cb.checked).map((c) => c.x.item) }) }) : null,
          ),
        );
      }
      if ((t.memory_refs || []).length) parts.push(h('div.cr-sub', h('h3.cr-sub-title', 'من ذاكرة الشركة'), h('ul.cr-refs', t.memory_refs.map(memoryRefLine))));
      if ((t.questions_for_company || []).length) {
        parts.push(
          h(
            'div.cr-sub',
            h('h3.cr-sub-title', 'أسئلة مقترحة للشركة'),
            h('ol.cr-questions', t.questions_for_company.map((q) => h('li', { dir: 'auto' }, q))),
            OPEN.includes(r.status) ? button('نقلها إلى سؤال للشركة', { variant: 'ghost', size: 'sm', icon: 'copy', onClick: () => openClarify({ items: t.questions_for_company }) }) : null,
          ),
        );
      }
    } else {
      parts.push(h('p.muted', 'لم يُحلَّل الطلب بعد.'));
    }
    // فحص الباقة (حتمي، B10 scope_check)
    if (sc) {
      const q = sc.quota || {};
      const quotaText = q.unlimited ? 'الطلبات المشمولة غير محدودة' : `الحصة ${q.used ?? 0} من ${q.included ?? '—'} هذا الشهر${q.pending ? ` (و${pendingPhrase(q.pending)} بانتظار الاحتساب)` : ''}`;
      parts.push(
        h(
          'div.cr-scope',
          { class: sc.in_plan ? 'is-ok' : 'is-out' },
          h('h3.cr-sub-title', 'فحص الباقة'),
          sc.in_plan
            ? h('p', icon('checkCircle', { size: 15 }), ` ضمن الباقة ✓ — ${typeByKey(r.type)?.label || r.type} ضمن نطاق ${d.company.plan?.name || 'الباقة'} · ${quotaText} · سياسة التجاوز: ${POLICY[q.policy] || '—'}`)
            : h('p', icon('alert', { size: 15 }), ` خارج الباقة: ${(sc.reason_labels || []).join('، ')}`),
          sc.would_be === 'overage' && sc.in_plan ? h('p.cr-scope-note', 'استنفدت الشركة الطلبات المشمولة في دورتها: بدء العمل يحتاج موافقة على تكلفة إضافية أو يُضيفها حسب سياسة الباقة.') : null,
        ),
      );
    }
    const footer = d.triage
      ? h(
          'div.cr-triage-foot',
          badge(providerLabel(d.triage.provider), d.triage.provider === 'heuristic' ? 'neutral' : 'info', { icon: 'sparkle' }),
          h('time.muted', { datetime: d.triage.created_at, title: dateTime(d.triage.created_at) }, relative(d.triage.created_at)),
          !accepted ? asyncButton('إعادة التحليل', (e, b) => rerunTriage(b), { variant: 'ghost', size: 'sm', icon: 'refresh' }) : null,
        )
      : !accepted
        ? asyncButton('تحليل الآن', (e, b) => rerunTriage(b), { variant: 'secondary', size: 'sm', icon: 'sparkle' })
        : null;
    const canStart = !accepted && r.status === 'submitted';
    const canQuote = isAdmin && ['submitted', 'awaiting_company'].includes(r.status) && !(d.quotes || []).some((q) => q.status === 'sent');
    const actions = !accepted && ['submitted', 'awaiting_company'].includes(r.status)
      ? h(
          'div.cr-actions',
          canStart ? button('بدء العمل…', { variant: 'primary', icon: 'briefcase', onClick: () => openAccept() }) : null,
          button('سؤال للشركة', { variant: 'secondary', icon: 'message', onClick: () => openClarify() }),
          isAdmin
            ? button('عرض سعر', { variant: 'secondary', icon: 'wallet', disabled: !canQuote, title: canQuote ? null : 'يوجد عرض مفتوح', onClick: () => openQuote() })
            : !sc || sc.in_plan
              ? null
              : h('span.cr-hint', icon('lock', { size: 14 }), 'يحتاج عرض سعر من مدير النظام'),
          button('اعتذار عن الطلب', { variant: 'ghost', icon: 'x', onClick: decline }),
        )
      : null;
    const body = h('div.stack', parts, footer, actions);
    if (accepted) {
      return h('details.card.cr-triage-done', h('summary.card-header', h('h2.card-title', 'الفرز وقت القبول')), h('div.card-body', body));
    }
    return card({ title: 'الفرز المقترح', icon: 'sparkle', className: 'cr-triage', body });
  }

  function asSubmitted() {
    const r = d.request;
    const fieldsHost = h('div.cr-fields', requestFieldsEl(r.type, r.fields || {}));
    const fields = r.fields || {};
    const lang = fields.output_language ? label('company_output_language', fields.output_language) : null;
    const sub = d.submitter;
    return card({
      title: 'الطلب كما أرسلته الشركة',
      icon: 'fileText',
      body: h(
        'div.stack',
        fieldsHost,
        h('div.cr-desc', h('h3.cr-sub-title', 'الوصف'), h('p', { dir: 'auto' }, r.description)),
        kv(
          [
            ['الكيان', r.entity?.name || null],
            ['الاستعجال المطلوب', `${prioWord(r.requested_priority || r.priority)}${r.priority_changed ? ` (المعتمد: ${prioWord(r.priority)})` : ''}`],
            r.urgent_reason ? ['سبب الاستعجال', h('span', { dir: 'auto' }, r.urgent_reason)] : null,
            ['مطلوب قبل', r.needed_by ? isoToCairoDate(r.needed_by) || r.needed_by : null],
            ['لغة التسليم', lang && lang !== fields.output_language ? lang : { ar: 'العربية', en: 'الإنجليزية', both: 'العربية والإنجليزية' }[fields.output_language] || 'العربية'],
            ['الخصوصية', r.visibility === 'private' ? 'خاص: يراه مرسله ومديرو البوابة والمتابعون' : 'كل فريق الشركة'],
            ['المتابعون', (d.watchers || []).length ? d.watchers.map((w) => `${w.name} (${w.role_label})`).join('، ') : null],
          ],
          { columns: 2 },
        ),
        sub
          ? h(
              'div.cr-submitter',
              h('h3.cr-sub-title', 'مرسل الطلب'),
              kv([
                ['الاسم', sub.name],
                ['الوظيفة', sub.job_title],
                ['البريد الإلكتروني', sub.email ? h('bdi', { dir: 'ltr' }, sub.email) : null],
                ['الهاتف', sub.phone ? h('bdi', { dir: 'ltr' }, sub.phone) : null],
                ['الدور', sub.role_label],
              ]),
              h('p.cr-private', icon('lock', { size: 14 }), 'للإدارة فقط — لا تُشارك بيانات موظفي الشركة مع المحامين.'),
            )
          : null,
        h('div', h('h3.cr-sub-title', `المستندات (${(d.documents || []).length})`), (d.documents || []).length ? h('ul.cr-docs', d.documents.map((x) => docItem(x))) : h('p.muted', 'لا مستندات.')),
      ),
    });
  }

  function threadItems() {
    const items = [];
    const msgs = d.messages || [];
    const byId = new Map(msgs.map((m) => [m.id, m]));
    for (const m of msgs) items.push({ at: m.created_at, kind: 'msg', m });
    for (const n of d.notes || []) items.push({ at: n.created_at, kind: 'note', n });
    items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return items.map((x) => {
      if (x.kind === 'note') {
        return h(
          'li.cr-msg.is-note',
          h('div.cr-msg-head', icon('lock', { size: 14 }), h('strong', 'ملاحظة داخلية — لا تراها الشركة'), h('span.muted', ` · ${x.n.author}`), h('time.muted', { datetime: x.at, title: dateTime(x.at) }, relative(x.at))),
          h('p', { dir: 'auto' }, x.n.body),
        );
      }
      const m = x.m;
      const inbound = m.direction === 'in';
      const kindLabel = { clarification: 'استيضاح', clarification_reply: 'رد على الاستيضاح', quote: 'عرض سعر', deliverable: 'تسليم', status: 'تحديث الحالة' }[m.kind];
      const replyTo = m.reply_to_id ? byId.get(m.reply_to_id) : null;
      const missing = (m.missing_items || []).map((i) => (replyTo && replyTo.items && replyTo.items[i] ? replyTo.items[i].label : null)).filter(Boolean);
      return h(
        'li.cr-msg',
        { class: [inbound ? 'is-in' : 'is-out', m.kind === 'status' && 'is-status'] },
        h(
          'div.cr-msg-head',
          inbound ? h('strong', m.author?.name || 'الشركة') : teamAuthor(),
          inbound ? h('span.muted', ' · من الشركة') : m.author?.staff_name ? h('span.muted', ` · أرسلها: ${m.author.staff_name}`) : null,
          kindLabel ? badge(kindLabel, m.kind === 'clarification' ? 'warning' : 'neutral') : null,
          h('time.muted', { datetime: m.created_at, title: dateTime(m.created_at) }, relative(m.created_at)),
        ),
        m.body ? h('p', { dir: 'auto' }, m.body) : null,
        (m.items || []).length ? h('ol.cr-msg-items', m.items.map((i) => h('li', { dir: 'auto' }, i.label))) : null,
        m.kind === 'clarification' ? h('p.muted', m.answered_at ? `ردّت الشركة ${relative(m.answered_at)}` : 'لم ترد الشركة بعد') : null,
        missing.length ? h('p.cr-unavailable', icon('info', { size: 14 }), `غير متوفر لدى الشركة: ${missing.join('، ')}`) : null,
        (m.documents || []).length ? h('ul.cr-docs', m.documents.map((doc) => docItem(doc))) : null,
      );
    });
  }

  function composer() {
    const r = d.request;
    const closed = ['declined', 'cancelled'].includes(r.status);
    const errHost = h('div.cr-composer-err', { 'aria-live': 'assertive' });
    const ta = h('textarea.input', { rows: 4, maxlength: 5000, 'aria-label': 'نص الرسالة', placeholder: 'اكتب رسالتك…', dir: 'auto' });
    ta.value = composerState.text;
    ta.addEventListener('input', () => (composerState.text = ta.value));
    const fi = fileInput({ maxFiles: 5, label: 'إرفاق ملفات للشركة', onChange: () => (composerState.files = fi.getFiles()) });
    if (composerState.files.length) fi.setFiles(composerState.files);
    const reviewed = h('input', { type: 'checkbox', checked: composerState.docsReviewed, onChange: () => (composerState.docsReviewed = reviewed.checked) });
    const reviewBox = h(
      'label.check.cr-docs-reviewed',
      { hidden: true },
      reviewed,
      h('span', 'ملفات Word وExcel وPDF قد تحمل اسم كاتبها في خصائصها وفي التعديلات المتعقَّبة والتعليقات؛ راجعتُ الملفات وتأكدت من خلوّها من أسماء المحامين.'),
    );
    const filesWrap = h('div.cr-composer-files', fi.el, reviewBox);
    const seg = h('div.segmented.cr-mode', { role: 'group', 'aria-label': 'نوع الرسالة' });
    const sendBtn = button('إرسال للشركة', { variant: 'primary', icon: 'send' });
    function drawSeg() {
      mount(
        seg,
        [
          ['company', 'رسالة للشركة', 'send'],
          ['note', 'ملاحظة داخلية', 'lock'],
        ].map(([v, t, ic]) =>
          h(
            'button.seg',
            {
              type: 'button',
              'aria-pressed': String(composerState.mode === v),
              onClick: () => {
                composerState.mode = v;
                drawSeg();
              },
            },
            icon(ic, { size: 15 }),
            t,
          ),
        ),
      );
      const note = composerState.mode === 'note';
      filesWrap.hidden = note;
      wrap.classList.toggle('is-note', note);
      const lbl = sendBtn.querySelector('.btn-label');
      if (lbl) lbl.textContent = note ? 'حفظ الملاحظة' : 'إرسال للشركة';
      mount(errHost);
    }
    async function send() {
      mount(errHost);
      const text = ta.value.trim();
      if (!text) {
        mount(errHost, h('p.field-error', { role: 'alert' }, 'اكتب نص الرسالة.'));
        ta.focus();
        return;
      }
      setBusy(sendBtn, true);
      try {
        const note = composerState.mode === 'note';
        const body = { body: text, internal: note || undefined };
        if (!note) {
          const files = fi.getFiles();
          if (files.length) body.files = await filesToUploads(files);
          if (composerState.docsReviewed) body.docs_reviewed = true;
        }
        const res = await api.post(`/admin/company-requests/${r.id}/messages`, body);
        composerState = { mode: composerState.mode, text: '', files: [], docsReviewed: false };
        toast(note ? 'حُفظت الملاحظة الداخلية.' : 'أُرسلت الرسالة للشركة.', 'success');
        await refresh(res);
      } catch (err) {
        const det = err && err.details;
        let msg = errorMessage(err);
        if (err && err.code === 'lawyer_names' && det && det.lawyer_names && det.lawyer_names[0]) msg = LAWYER_NAME_MSG(lawyerHitMatched(det.lawyer_names[0])); // gate K4
        if (err && err.code === 'file_author_names' && det && det.file_authors && det.file_authors[0]) {
          const fa = det.file_authors[0];
          msg = AUTHOR_MSG(fa.filename || (det.office_docs || []).find((o) => o.id === fa.document_id)?.filename || 'المرفق', (fa.names || [])[0] || '');
        }
        if (err && err.code === 'office_docs_review_required') {
          reviewBox.hidden = false;
          reviewed.focus();
        }
        mount(errHost, h('p.field-error', { role: 'alert' }, msg));
      } finally {
        setBusy(sendBtn, false);
      }
    }
    sendBtn.addEventListener('click', send);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        send();
      }
    });
    const wrap = h('div.cr-composer', seg, ta, filesWrap, errHost, h('div.cr-composer-actions', sendBtn));
    drawSeg();
    return closed ? h('p.muted', 'الطلب مغلق؛ يمكن إضافة ملاحظات داخلية فقط من صفحة الشركة.') : wrap;
  }

  function threadCard() {
    const items = threadItems();
    return h(
      'section.card.cr-thread',
      { id: 'cr-thread' },
      h('div.card-header', h('div.card-heading', h('span.card-icon', icon('message', { size: 18 })), h('h2.card-title', 'المحادثة مع الشركة'))),
      h('div.card-body', items.length ? h('ol.cr-msgs', items) : emptyState('لا رسائل بعد.', null, { compact: true, icon: 'message' }), composer()),
    );
  }

  function workCard() {
    const c = d.case;
    if (!c) return null;
    const rows = c.team || [];
    return card({
      title: 'العمل',
      icon: 'briefcase',
      body: h(
        'div.stack',
        h('p.cr-case', 'ملف العمل الداخلي: ', codeTag(c.code), ' ', badge(c.status_label, 'neutral'), ' ', button('فتح', { variant: 'link', size: 'sm', href: `#/cases/${c.id}` })),
        table({
          caption: 'فريق العمل',
          rows,
          empty: 'لم يُسند محامٍ بعد.',
          columns: [
            { key: 'role', label: 'الدور', render: (a) => a.role_label },
            { key: 'lawyer', label: 'المحامي', render: (a) => a.lawyer_name },
            { key: 'status', label: 'الحالة', render: (a) => a.status_label },
            { key: 'due', label: 'الموعد', render: (a) => (a.due_at ? h('time', { datetime: a.due_at, title: dateTime(a.due_at) }, whenText(a.due_at)) : null) },
            {
              key: 'grants',
              label: 'صلاحيات الذاكرة',
              render: (a) =>
                a.status === 'withdrawn'
                  ? null
                  : h('span.cr-grants', Array.isArray(grantsOf(a)) ? h('span.num', String(grantsOf(a).length)) : null, button('تعديل', { variant: 'link', size: 'sm', onClick: () => openGrants(a) })),
            },
          ],
        }),
        (c.opinions || []).length
          ? h('div', h('h3.cr-sub-title', 'الآراء'), h('ul.cr-list', c.opinions.map((o) => h('li', `${label('assignment_role', o.role)} · ${o.lawyer_name} · الإصدار ${o.version} · `, badge(label('opinion_status', o.status), o.status === 'approved' ? 'success' : 'warning')))))
          : null,
        (c.work_files || []).length ? h('div', h('h3.cr-sub-title', 'ملفات عمل المحامين'), h('ul.cr-docs', c.work_files.map((x) => docItem(x, { analyze: false })))) : null,
        (d.memory_refs || []).length ? h('div', h('h3.cr-sub-title', 'عناصر الذاكرة المرتبطة بالطلب'), h('ul.cr-list', d.memory_refs.map((m) => h('li', `${m.kind_label} · `, h('span', { dir: 'auto' }, m.title))))) : null,
      ),
    });
  }

  function deliverablesCard() {
    const list = d.deliverables || [];
    const accepted = !!d.case;
    if (!accepted && !list.length) return null;
    const STATUS_TONE = { draft: 'neutral', released: 'success', withdrawn: 'muted' };
    const decision = (x) => (x.decision === 'accepted' ? `اعتمدته الشركة${x.rating ? ` · ${'★'.repeat(x.rating)}` : ''}` : x.decision === 'changes_requested' ? 'طلبت الشركة تعديلات' : null);
    return card({
      title: 'التسليمات',
      icon: 'send',
      actions: accepted && OPEN.includes(d.request.status) ? button('إعداد تسليم', { variant: 'secondary', size: 'sm', icon: 'plus', onClick: () => openDeliverable() }) : null,
      body: list.length
        ? h(
            'ul.cr-rows',
            list.map((x) =>
              h(
                'li.cr-row',
                h('span.cr-row-num.num', `الإصدار ${x.version}`),
                h('div.cr-row-main', h('strong', { dir: 'auto' }, x.title), h('span.muted', `${x.kind_label} · ${x.final ? 'نهائي' : 'مرحلي'}${x.released_at ? ` · أُرسل ${relative(x.released_at)}` : ''}`), decision(x) ? h('span', decision(x)) : null),
                badge(x.status_label || x.status, STATUS_TONE[x.status] || 'neutral', { dot: true }),
                x.status === 'draft'
                  ? button('متابعة', { variant: 'secondary', size: 'sm', onClick: () => openDeliverable(x) })
                  : x.status === 'released' && isAdmin && x.decision !== 'accepted'
                    ? button('سحب التسليم', { variant: 'ghost', size: 'sm', onClick: () => withdrawDeliverable(x) })
                    : null,
              ),
            ),
          )
        : emptyState('لا تسليمات بعد.', null, { compact: true, icon: 'send' }),
    });
  }

  function quotesCard() {
    const quotes = d.quotes || [];
    const charges = d.charges; // مدير النظام فقط (null لغيره)
    if (!quotes.length && !(charges && charges.length)) return null;
    return card({
      title: isAdmin ? 'عروض الأسعار والرسوم' : 'عروض الأسعار',
      icon: 'wallet',
      body: h(
        'div.stack',
        quotes.length
          ? h(
              'ul.cr-rows',
              quotes.map((q) =>
                h(
                  'li.cr-row',
                  codeTag(q.number),
                  h(
                    'div.cr-row-main',
                    h('strong', `${q.kind_label} · ${q.basis_label}`, q.amount_text ? h('span.num', ` · ${q.amount_text}`) : null),
                    h('span.muted', `أُرسل ${relative(q.sent_at)}${q.decided_at ? ` · القرار ${relative(q.decided_at)}` : ''}${q.status === 'sent' ? ` · صالح حتى ${isoToCairoDate(q.valid_until)}` : ''}`),
                  ),
                  badge(q.status_label, q.status === 'approved' ? 'success' : q.status === 'sent' ? 'warning' : 'muted', { dot: true }),
                  q.status === 'sent' && isAdmin ? button('سحب العرض', { variant: 'ghost', size: 'sm', onClick: () => withdrawQuote(q) }) : null,
                ),
              ),
            )
          : null,
        charges && charges.length
          ? h(
              'div',
              h('h3.cr-sub-title', 'التكاليف على هذا الطلب'),
              h('ul.cr-list', charges.map((ch) => h('li', `${ch.kind_label || ch.kind} · `, h('span.num', ch.amount_text || ''), ch.voided ? badge('ملغاة', 'muted') : null, h('span.muted', ` · ${relative(ch.created_at)}`)))),
            )
          : null,
      ),
    });
  }

  function activityCard() {
    const items = (d.activity || []).map((a) => ({ time: a.created_at, title: a.summary, actor: a.actor_name || null, tone: a.actor_kind === 'company' ? 'info' : 'neutral' }));
    return h('details.card.cr-log', h('summary.card-header', h('h2.card-title', `السجل (${items.length})`)), h('div.card-body', timeline(items)));
  }

  let focused = false;
  function draw() {
    // review: ?focus= يُطبَّق مرة واحدة عند فتح الصفحة، لا بعد كل تحديث (كان يقفز بالصفحة بعد كل إجراء)
    const focus = focused ? null : ctx.query.focus;
    focused = true;
    mount(
      root,
      header(),
      banners(),
      h(
        'div.detail-layout.cr-layout',
        h('div.detail-main', triageCard(), asSubmitted(), threadCard(), workCard(), deliverablesCard(), quotesCard(), activityCard()),
        h('aside.detail-side', whenBox()),
      ),
    );
    if (focus === 'thread') requestAnimationFrame(() => document.getElementById('cr-thread')?.scrollIntoView({ block: 'start' }));
    else if (focus === 'escalation') requestAnimationFrame(() => document.getElementById('cr-escalation')?.scrollIntoView({ block: 'center' }));
    else if (focus === 'memory') requestAnimationFrame(() => document.getElementById('cr-memory')?.scrollIntoView({ block: 'center' }));
  }

  // مراجع الذاكرة في الفرز تحتاج عناوين العناصر
  const refs = d.triage && d.triage.output && d.triage.output.memory_refs;
  if (refs && refs.some((x) => /^M-\d+$/.test(x.ref || ''))) {
    try {
      const mem = await api.get(`/admin/companies/${d.company.id}/memory`);
      memoryIndex = new Map((mem.items || []).map((m) => [m.id, m]));
    } catch {
      memoryIndex = null;
    }
  }
  draw();
  return root;
}
