// بانتظار قرار الإدارة: كل ما يمر بالإدارة قبل أن يصل إلى العميل أو المحامي.
// المحامي لا يتواصل مع العميل، ولا يضم زميلًا بنفسه، ولا يصل رأيه للعميل إلا بعد اعتماد الإدارة.

import { h } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, relative, dateTime, count } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  asyncButton,
  badge,
  statusBadge,
  dueBadge,
  icon,
  codeTag,
  table,
  emptyState,
  alertBox,
  formDialog,
  confirmDialog,
  toast,
  richText,
} from '../../../lib/ui.js';
import { replaceQuery, reloadAndFocus } from './inbox.js';

const SEND_CHANNELS = [
  { value: 'auto', label: 'تلقائي (آخر قناة تواصل منها العميل)' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'الموقع (بوابة العميل)' },
];

function when(iso, prefix = '') {
  if (!iso) return null;
  return h('time.small.muted', { datetime: iso, title: dateTime(iso) }, `${prefix}${relative(iso)}`);
}

function caseLink(r, tab) {
  return h(
    'a.pa-case-link',
    { href: `#/cases/${r.case_id}${tab ? `?tab=${tab}` : ''}` },
    codeTag(r.case_code),
    h('span.pa-case-link-title', r.case_title || ''),
  );
}

function quote(text, cls = '') {
  return h('blockquote.pa-quote', { class: cls, dir: 'auto' }, richText(text || ''));
}

export default async function render(ctx) {
  const q = await api.get('/admin/queue');

  async function act(fn, success, key) {
    await fn();
    toast(success, 'success');
    await reloadAndFocus(ctx, `#pa-q-${key}`);
  }

  // ───────────── طلبات المعلومات ─────────────
  async function approveInfo(r) {
    const res = await formDialog({
      title: 'موافقة وإرسال للعميل',
      intro: 'صِغ الطلب بلغة واضحة للعميل. يُرسل من قناة المؤسسة مع رقم الملف، ولا يظهر للعميل اسم المحامي أو بياناته.',
      size: 'lg',
      submitLabel: 'إرسال للعميل',
      values: { client_message: r.question, channel: 'auto' },
      fields: [
        { type: 'static', label: `سؤال المحامي (${r.requested_by_name || 'محامٍ'})`, value: r.question, full: true },
        { name: 'client_message', label: 'نص الرسالة للعميل', type: 'textarea', required: true, maxLength: 3000, rows: 5 },
        { name: 'channel', label: 'قناة الإرسال', type: 'select', placeholder: false, options: SEND_CHANNELS },
      ],
      onSubmit: (v) => api.post(`/admin/info-requests/${r.id}/approve`, { client_message: v.client_message, channel: v.channel }),
    });
    if (res) {
      toast(`أُرسل الطلب للعميل${res.sent_channel ? ` عبر ${label('channel', res.sent_channel)}` : ''}`, 'success');
      await reloadAndFocus(ctx, '#pa-q-info_requests');
    }
  }

  async function rejectInfo(r) {
    const res = await formDialog({
      title: 'رفض طلب المعلومات',
      intro: 'لن يُرسل شيء للعميل، وسيصل سبب الرفض للمحامي.',
      submitLabel: 'رفض الطلب',
      fields: [{ name: 'note', label: 'سبب الرفض (يراه المحامي)', type: 'textarea', required: true, maxLength: 2000, rows: 3, hint: 'مثال: المعلومة متاحة بالفعل في ملخص الوقائع.' }],
      onSubmit: (v) => api.post(`/admin/info-requests/${r.id}/reject`, { note: v.note }),
    });
    if (res) {
      toast('رُفض الطلب وأُبلغ المحامي بالسبب', 'success');
      await reloadAndFocus(ctx, '#pa-q-info_requests');
    }
  }

  async function shareReply(r) {
    const res = await formDialog({
      title: 'إتاحة رد العميل للمحامي',
      intro: 'راجع الرد قبل إتاحته: المحامي يرى النص الذي تكتبه هنا فقط، فاحذف أي رقم هاتف أو بيانات تواصل لا يحتاجها.',
      size: 'lg',
      submitLabel: 'إتاحة للمحامي',
      values: { response_text: r.client_reply || '' },
      fields: [
        { type: 'static', label: 'المطلوب من العميل', value: r.client_message || r.question, full: true },
        { name: 'response_text', label: 'الرد الذي سيراه المحامي', type: 'textarea', required: true, maxLength: 10000, rows: 6 },
      ],
      onSubmit: (v) => api.post(`/admin/info-requests/${r.id}/share`, { response_text: v.response_text }),
    });
    if (res) {
      toast('أصبح الرد متاحًا للمحامي', 'success');
      await reloadAndFocus(ctx, '#pa-q-client_replies');
    }
  }

  async function rejectCounsel(r) {
    const res = await formDialog({
      title: 'رفض طلب المساعدة',
      submitLabel: 'رفض الطلب',
      fields: [{ name: 'note', label: 'سبب الرفض (يراه المحامي)', type: 'textarea', required: true, maxLength: 2000, rows: 3 }],
      onSubmit: (v) => api.post(`/admin/counsel-requests/${r.id}/reject`, { note: v.note }),
    });
    if (res) {
      toast('رُفض طلب المساعدة وأُبلغ المحامي', 'success');
      await reloadAndFocus(ctx, '#pa-q-counsel_requests');
    }
  }

  function item({ head, body, foot, actions, tone }) {
    return h(
      'li.pa-qitem',
      { class: tone && `is-${tone}` },
      h('div.pa-qitem-head', head),
      body && h('div.pa-qitem-body', body),
      (foot || actions) && h('div.pa-qitem-foot', h('div.pa-qitem-meta', foot), actions && h('div.pa-qitem-actions', actions)),
    );
  }

  const list = (rows, fn) => h('ul.pa-qlist', rows.map(fn));

  // ───────────── الأقسام ─────────────
  const SECTIONS = [
    {
      key: 'info_requests',
      title: 'طلبات معلومات من المحامين',
      icon: 'info',
      hint: 'المحامي لا يتواصل مع العميل مباشرة: راجع السؤال وصِغه للعميل ثم أرسله من قناة المؤسسة.',
      empty: 'لا توجد طلبات معلومات بانتظار الموافقة',
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r, 'requests'), statusBadge('info_request_kind', r.kind)],
            body: quote(r.question),
            foot: [h('span', icon('user', { size: 14 }), r.requested_by_name || 'الإدارة'), when(r.created_at)],
            actions: [
              button('موافقة وإرسال', { variant: 'primary', size: 'sm', icon: 'send', onClick: () => approveInfo(r) }),
              button('رفض', { variant: 'ghost', size: 'sm', icon: 'x', onClick: () => rejectInfo(r) }),
            ],
          }),
        ),
    },
    {
      key: 'client_replies',
      title: 'ردود العملاء بانتظار المراجعة',
      icon: 'message',
      hint: 'لا يصل رد العميل للمحامي إلا بعد مراجعة الإدارة. لإتاحة مستند أرسله العميل افتح الملف.',
      empty: 'لا توجد ردود عملاء تنتظر المراجعة',
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r, 'requests'), statusBadge('info_request_kind', r.kind)],
            body: h(
              'div.stack-sm',
              h('p.small.muted', 'المطلوب: ', r.client_message || r.question),
              r.client_reply ? quote(r.client_reply, 'is-client') : h('p.small.muted', 'أرسل العميل مستندًا دون نص.'),
            ),
            foot: [h('span', icon('user', { size: 14 }), `طلبه: ${r.requested_by_name || 'الإدارة'}`), when(r.replied_at, 'رد العميل ')],
            actions: [
              button('إتاحة للمحامي', { variant: 'primary', size: 'sm', icon: 'eye', onClick: () => shareReply(r) }),
              button('فتح الملف لإرفاق المستندات', { variant: 'ghost', size: 'sm', icon: 'paperclip', href: `#/cases/${r.case_id}?tab=requests` }),
            ],
          }),
        ),
    },
    {
      key: 'counsel_requests',
      title: 'طلبات مساعدة محامٍ',
      icon: 'users',
      hint: 'المحامي لا يفتح الملف لزميل بنفسه: تختار الإدارة المحامي المساعد وتحدد بدقة ما يراه.',
      empty: 'لا توجد طلبات مساعدة بانتظار الإدارة',
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r, 'requests'), statusBadge('counsel_kind', r.kind), r.specialty && badge(areaLabel(r.specialty), 'info')],
            body: h(
              'div.stack-sm',
              quote(r.description),
              (r.issue_ids && r.issue_ids.length) || (r.document_ids && r.document_ids.length)
                ? h(
                    'p.small.muted',
                    `يشير الطلب إلى ${[
                      r.issue_ids.length && count(r.issue_ids.length, ['مسألة واحدة', 'مسألتين', 'مسائل', 'مسألة']),
                      r.document_ids.length && count(r.document_ids.length, ['مستند واحد', 'مستندين', 'مستندات', 'مستندًا']),
                    ]
                      .filter(Boolean)
                      .join(' و')} مما أُتيح له.`,
                  )
                : null,
            ),
            foot: [h('span', icon('user', { size: 14 }), `طلبه: ${r.requester_name || 'محامٍ'}`), when(r.created_at)],
            actions: [
              button('اختيار المحامي وتحديد الصلاحيات', { variant: 'primary', size: 'sm', icon: 'userPlus', href: `#/cases/${r.case_id}?tab=requests` }),
              button('رفض', { variant: 'ghost', size: 'sm', icon: 'x', onClick: () => rejectCounsel(r) }),
            ],
          }),
        ),
    },
    {
      key: 'opinions',
      title: 'آراء بانتظار المراجعة',
      icon: 'fileText',
      hint: '«تقديم» المحامي يصل للإدارة أولًا: اعتمد الرأي أو أعده للتعديل قبل إعداد النسخة الموجهة للعميل.',
      empty: 'لا توجد آراء مقدمة تنتظر المراجعة',
      flush: true,
      render: (rows) =>
        table({
          caption: 'آراء بانتظار المراجعة',
          columns: [
            { key: 'case', label: 'الملف', className: 'col-wide', render: (r) => caseLink(r, 'opinions') },
            { key: 'lawyer_name', label: 'المحامي' },
            { key: 'role', label: 'الدور في الفريق', render: (r) => statusBadge('assignment_role', r.role, { dot: false }) },
            { key: 'version', label: 'النسخة', align: 'center', render: (r) => h('span.ltr', `v${r.version}`) },
            { key: 'submitted_at', label: 'قُدِّم', render: (r) => when(r.submitted_at) },
            { key: 'go', label: '', render: (r) => button('مراجعة الرأي', { size: 'sm', icon: 'eye', href: `#/cases/${r.case_id}?tab=opinions` }) },
          ],
          rows,
        }),
    },
    {
      key: 'proposed_issues',
      title: 'مسائل اقترحها المحامون',
      icon: 'flag',
      hint: 'المسألة المعتمدة تُتاح تلقائيًا للمحامي الذي اقترحها، والمستبعدة لا تظهر لأحد.',
      empty: 'لا توجد مسائل مقترحة بانتظار الاعتماد',
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r), r.legal_area && badge(areaLabel(r.legal_area), 'primary')],
            body: h('div.stack-sm', h('strong.pa-issue-proposed', r.title), r.details && h('p.small', { dir: 'auto' }, r.details)),
            foot: [h('span', icon('user', { size: 14 }), `اقترحها: ${r.proposed_by_name || 'محامٍ'}`), when(r.created_at)],
            actions: [
              asyncButton(
                'اعتماد',
                () => act(() => api.patch(`/admin/cases/${r.case_id}/issues/${r.id}`, { status: 'active' }), 'اعتُمدت المسألة وأُتيحت للمحامي', 'proposed_issues'),
                { variant: 'primary', size: 'sm', icon: 'check' },
              ),
              asyncButton(
                'استبعاد',
                async () => {
                  const ok = await confirmDialog({
                    title: 'استبعاد المسألة',
                    message: `ستُستبعد المسألة «${r.title}» من الملف ${r.case_code} ولن تظهر لأي محامٍ.`,
                    confirmLabel: 'استبعاد',
                    danger: true,
                  });
                  if (ok) await act(() => api.patch(`/admin/cases/${r.case_id}/issues/${r.id}`, { status: 'dropped' }), 'استُبعدت المسألة', 'proposed_issues');
                },
                { variant: 'ghost', size: 'sm', icon: 'x' },
              ),
            ],
          }),
        ),
    },
    {
      key: 'approved_unanswered',
      title: 'ملفات معتمدة لم يُرسل الرد للعميل',
      icon: 'send',
      hint: 'بعد اعتماد الرأي تعد الإدارة نسخة مبسطة موجهة للعميل وترسلها من قناة المؤسسة.',
      empty: 'لا توجد ملفات معتمدة تنتظر الرد على العميل',
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r, 'opinions'), statusBadge('case_status', 'approved')],
            foot: [when(r.updated_at, 'آخر تحديث ')],
            actions: [button('إعداد الرد للعميل', { variant: 'primary', size: 'sm', icon: 'edit', href: `#/cases/${r.case_id}?tab=opinions` })],
          }),
        ),
    },
    {
      key: 'overdue_assignments',
      title: 'إسنادات متأخرة',
      icon: 'clock',
      hint: 'محامون تجاوزوا الموعد المحدد للرد. تواصل معهم أو أعد توزيع المهمة.',
      empty: 'لا توجد إسنادات متأخرة',
      flush: true,
      render: (rows) =>
        table({
          caption: 'إسنادات متأخرة',
          rowClass: () => 'is-highlight',
          columns: [
            { key: 'case', label: 'الملف', className: 'col-wide', render: (r) => caseLink(r) },
            { key: 'lawyer_name', label: 'المحامي' },
            { key: 'role', label: 'الدور', render: (r) => statusBadge('assignment_role', r.role, { dot: false }) },
            { key: 'status', label: 'الحالة', render: (r) => statusBadge('assignment_status', r.status) },
            { key: 'due_at', label: 'الموعد', render: (r) => dueBadge(r.due_at) },
          ],
          rows,
        }),
    },
    {
      key: 'identity_conflicts',
      title: 'رسائل من أرقام تذكر طلبات لعملاء آخرين',
      icon: 'shield',
      hint: 'لا يدمج النظام العميلين تلقائيًا حماية للخصوصية: تحقق من هوية المرسل قبل أي دمج أو رد بتفاصيل.',
      empty: 'لا توجد رسائل تحتاج تحققًا من الهوية',
      render: (rows) =>
        list(rows, (r) =>
          item({
            tone: 'warning',
            head: [h('span.pa-qitem-label', icon('alert', { size: 15 }), 'يذكر الطلب'), codeTag(r.referenced_code)],
            body: quote(r.body),
            foot: [when(r.created_at)],
            actions: [button('التحقق من الهوية', { variant: 'primary', size: 'sm', icon: 'shieldCheck', href: `#/inbox/${r.intake_id}` })],
          }),
        ),
    },
    {
      key: 'awaiting_client',
      title: 'بانتظار رد العميل',
      icon: 'message',
      hint: 'طلبات أُرسلت للعميل ولم يرد بعد — للاطلاع فقط؛ التذكير الآلي يعمل حسب قواعد الأتمتة.',
      empty: 'لا توجد طلبات بانتظار رد العملاء',
      readonly: true,
      render: (rows) =>
        list(rows, (r) =>
          item({
            head: [caseLink(r, 'requests'), statusBadge('info_request_kind', r.kind)],
            body: h('p.pa-qitem-text', { dir: 'auto' }, r.client_message || r.question),
            foot: [
              r.sent_at && h('span', { title: dateTime(r.sent_at) }, `أُرسل ${relative(r.sent_at)}${r.sent_channel ? ` عبر ${label('channel', r.sent_channel)}` : ''}`),
              r.reminder_count > 0 && badge(r.reminder_count === 1 ? 'أُرسل تذكير واحد' : `أُرسلت ${r.reminder_count} تذكيرات`, 'neutral', { icon: 'bell' }),
            ],
          }),
        ),
    },
  ];

  const total = SECTIONS.filter((s) => !s.readonly).reduce((n, s) => n + (q[s.key] || []).length, 0);
  const sectionEls = new Map();

  const cards = SECTIONS.map((s) => {
    const rows = q[s.key] || [];
    const el = !rows.length
      ? h(
          'section.card.pa-qcard.is-empty',
          h(
            'div.pa-qempty',
            h('span.pa-qempty-icon', icon(s.icon, { size: 16 })),
            h('div.pa-qempty-text', h('h2.pa-qempty-title', s.title), h('p', s.empty)),
            h('span.pa-qempty-ok', icon('checkCircle', { size: 16 }), h('span.sr-only', 'لا يوجد')),
          ),
        )
      : card({
      title: s.title,
      subtitle: s.hint,
      icon: s.icon,
      className: ['pa-qcard', !rows.length && 'is-empty'],
      flush: Boolean(rows.length && s.flush),
      actions: badge(String(rows.length), rows.length ? (s.readonly ? 'neutral' : 'warning') : 'muted', { title: `العدد: ${rows.length}` }),
      body: rows.length ? s.render(rows) : emptyState(s.empty, null, { compact: true, icon: 'checkCircle' }),
    });
    el.id = `pa-q-${s.key}`;
    el.tabIndex = -1;
    sectionEls.set(s.key, el);
    return el;
  });

  function jump(key) {
    const el = sectionEls.get(key);
    if (!el) return;
    replaceQuery('/queue', { section: key });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }

  const nav = h(
    'nav.pa-qnav',
    { 'aria-label': 'أقسام قائمة القرارات' },
    SECTIONS.map((s) => {
      const n = (q[s.key] || []).length;
      return h(
        'button.pa-qnav-item',
        { type: 'button', class: n ? (s.readonly ? 'is-info' : 'is-pending') : 'is-zero', onClick: () => jump(s.key) },
        h('span', s.title),
        h('span.tab-count', String(n)),
      );
    }),
  );

  if (ctx.query.section && sectionEls.has(ctx.query.section)) {
    requestAnimationFrame(() => setTimeout(() => jump(ctx.query.section), 60));
  }

  return h(
    'div.pa-page.pa-page-queue',
    pageHeader({
      title: 'بانتظار قرار الإدارة',
      subtitle: 'كل ما يحتاج قرارًا من الإدارة قبل أن يصل إلى العميل أو المحامي',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'بانتظار قرار الإدارة' }],
      meta: [badge(total ? `بانتظار قرارك: ${total}` : 'لا توجد قرارات معلقة', total ? 'warning' : 'success', { icon: total ? 'clock' : 'checkCircle' })],
      actions: button('تحديث', { variant: 'ghost', icon: 'refresh', onClick: () => ctx.reload() }),
    }),
    total === 0 && alertBox('لا يوجد ما ينتظر قرارك الآن. ستظهر هنا طلبات المحامين وردود العملاء والآراء المقدمة فور وصولها.', 'success', { title: 'كل شيء محدَّث' }),
    nav,
    h('div.pa-qgrid', cards),
  );
}
