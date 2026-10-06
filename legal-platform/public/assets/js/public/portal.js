// بوابة العميل /p/<token>: طلبات بانتظار الرد، الردود، المواعيد، الفواتير، المحادثة، والملفات.

import { h, mount } from '../lib/h.js';
import { api, filesToUploads, ApiError } from '../lib/api.js';
import { setMeta, date, dateTime, time, relative, money, calendarParts, label } from '../lib/fmt.js';
import {
  card,
  emptyState,
  badge,
  statusBadge,
  statusTone,
  codeTag,
  chatThread,
  form,
  toast,
  icon,
  button,
  table,
  alertBox,
  errorState,
  loading,
  fileInput,
  asyncButton,
  dueBadge,
  richText,
} from '../lib/ui.js';
import { bindSettings, whatsappUrl, hydrateIcons, setYear } from './common.js';

const MAX_FILES = 5;
const MAX_BYTES = 8 * 1024 * 1024;

const root = document.getElementById('portal-root');
const token = (() => {
  const seg = window.location.pathname.split('/').filter(Boolean)[1] || '';
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
})();
const base = `/portal/${encodeURIComponent(token)}`;
let settings = {};

const orgName = () => settings.org_name || 'بيوت مصر';

function sectionCard(id, opts) {
  const c = card(opts);
  c.id = id;
  c.classList.add('portal-section');
  return c;
}

// ───────────── طلبات المعلومات والمستندات ─────────────

function replyForm(r) {
  const isDoc = r.kind === 'document';
  const f = form(
    [
      {
        name: 'body',
        label: 'ردك',
        type: 'textarea',
        rows: 4,
        maxLength: 5000,
        placeholder: isDoc ? 'اكتب ملاحظة مع المستند إن أردت…' : 'اكتب ردك هنا…',
      },
      {
        name: 'documents',
        label: isDoc ? 'المستند المطلوب' : 'إرفاق مستندات (اختياري)',
        type: 'file',
        maxFiles: MAX_FILES,
        maxBytes: MAX_BYTES,
      },
    ],
    {
      columns: 1,
      submitLabel: 'إرسال الرد',
      submitIcon: 'send',
      onSubmit: async (v) => {
        if (!v.body && !v.documents.length) throw new Error('اكتب ردك أو أرفق مستندًا واحدًا على الأقل');
        const documents = await filesToUploads(v.documents, { maxBytes: MAX_BYTES });
        await api.post(`${base}/requests/${encodeURIComponent(r.id)}/reply`, { body: v.body, documents });
        toast(`تم إرسال ردك بنجاح، وسيراجعه فريق ${orgName()}`, 'success');
        await load({ keepScroll: true });
      },
    },
  );
  return f.el;
}

function requestItem(r) {
  const isDoc = r.kind === 'document';
  let footer;
  if (r.can_reply) footer = replyForm(r);
  else if (r.status === 'cancelled' || r.status === 'rejected') footer = alertBox('لم يعد هذا الطلب مطلوبًا، ولا حاجة للرد عليه.', 'info');
  else footer = alertBox('تم استلام ردك وسيتم مراجعته', 'success');
  return h(
    'article.request-item',
    { class: r.can_reply && 'is-pending' },
    h(
      'div.row-between',
      h(
        'div.row',
        badge(label('info_request_kind', r.kind), isDoc ? 'accent' : 'info', { icon: isDoc ? 'file' : 'info' }),
        r.case_code && h('span.small.muted', 'ملف ', codeTag(r.case_code)),
      ),
      h('time.small.muted', { datetime: r.created_at, title: dateTime(r.created_at) }, date(r.created_at)),
    ),
    h('p.request-msg', richText(r.message)),
    footer,
  );
}

function requestsSection(requests) {
  const sorted = [...requests].sort((a, b) => Number(b.can_reply) - Number(a.can_reply) || new Date(b.created_at) - new Date(a.created_at));
  const pending = requests.filter((r) => r.can_reply).length;
  return sectionCard('requests', {
    title: 'طلبات بانتظار ردك',
    subtitle: pending
      ? 'نحتاج منك هذه المعلومات أو المستندات لنكمل دراسة ملفك.'
      : 'لا يوجد ما ينتظر ردك الآن، وسنُبلغك إن احتجنا أي شيء.',
    icon: 'message',
    body: sorted.length
      ? h('div.list-plain', sorted.map(requestItem))
      : emptyState('لا توجد طلبات بانتظار ردك حاليًا', null, { compact: true, icon: 'checkCircle' }),
  });
}

// ───────────── الردود والمواعيد والفواتير ─────────────

function answersSection(answers) {
  const sorted = [...answers].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  return sectionCard('answers', {
    title: `ردود ${orgName()}`,
    subtitle: 'الرأي القانوني المعتمد من الإدارة بعد دراسة المحامي المختص لملفك.',
    icon: 'fileText',
    body: sorted.length
      ? h(
          'div.list-plain',
          sorted.map((a) =>
            h(
              'article.answer-item',
              h(
                'div.row-between',
                h('div.row', a.case_code && h('span.small.muted', 'ملف ', codeTag(a.case_code))),
                h('time.small.muted', { datetime: a.sent_at, title: dateTime(a.sent_at) }, dateTime(a.sent_at)),
              ),
              h('div.answer-body', richText(a.body)),
            ),
          ),
        )
      : emptyState('لم تصلك ردود بعد. سنُبلغك فور اعتماد الرد على استشارتك.', null, { compact: true, icon: 'fileText' }),
  });
}

function eventsSection(events) {
  const sorted = [...events].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  return sectionCard('events', {
    title: 'مواعيدك القادمة',
    subtitle: 'الجلسات والمواعيد المرتبطة بملفاتك. المواعيد المميزة تتطلب حضورك شخصيًا.',
    icon: 'calendar',
    body: sorted.length
      ? h(
          'ul.list-plain',
          sorted.map((e) => {
            const p = calendarParts(e.starts_at);
            return h(
              'li.event-item',
              { class: e.client_attendance_required ? 'is-required' : null },
              h('div.event-date', { 'aria-hidden': 'true' }, h('span.d', p.day), h('span.m', p.month)),
              h(
                'div.event-info',
                h(
                  'div.row',
                  h('span.event-title', e.title || label('event_kind', e.kind)),
                  e.kind && badge(label('event_kind', e.kind), statusTone('event_kind', e.kind)),
                  // client_attendance_required رقم (0/1) من قاعدة البيانات: الشرط الثلاثي يمنع ظهور «0»
                  e.client_attendance_required ? badge('يلزم حضورك', 'warning', { icon: 'alert' }) : null,
                ),
                h(
                  'div.event-meta',
                  h('span', icon('calendar', { size: 14 }), `${p.weekday}، ${date(e.starts_at)}`),
                  h('span', icon('clock', { size: 14 }), `${time(e.starts_at)} (${relative(e.starts_at)})`),
                  e.location && h('span', icon('mapPin', { size: 14 }), e.location),
                  e.matter_code && h('span', 'ملف ', codeTag(e.matter_code)),
                ),
              ),
            );
          }),
        )
      : emptyState('لا توجد مواعيد قادمة', null, { compact: true, icon: 'calendar' }),
  });
}

function invoicesSection(invoices) {
  return sectionCard('invoices', {
    title: 'الفواتير',
    icon: 'wallet',
    flush: true,
    body: table({
      columns: [
        { key: 'number', label: 'رقم الفاتورة', render: (i) => codeTag(i.number) },
        { key: 'description', label: 'البيان', className: 'col-wide' },
        { key: 'amount', label: 'المبلغ', render: (i) => h('span.nowrap', money(i.amount)) },
        { key: 'paid_amount', label: 'المسدد', render: (i) => h('span.nowrap', money(i.paid_amount || 0)) },
        {
          key: 'due_at',
          label: 'تاريخ الاستحقاق',
          render: (i) =>
            h(
              'div.stack-sm',
              h('span.nowrap', date(i.due_at)),
              (i.status === 'unpaid' || i.status === 'partially_paid') && i.due_at ? dueBadge(i.due_at) : null,
            ),
        },
        { key: 'status', label: 'الحالة', render: (i) => statusBadge('invoice_status', i.status) },
      ],
      rows: invoices,
      caption: 'الفواتير',
    }),
  });
}

// ───────────── المحادثة ─────────────

function chatSection(messages) {
  const thread = chatThread(messages, {
    mine: 'in',
    docHref: null,
    inLabel: 'أنت',
    outLabel: orgName(),
    emptyText: 'لا توجد رسائل بعد. اكتب لنا أول رسالة من هنا.',
  });
  thread.classList.add('portal-chat');
  const ta = h('textarea.input', { id: 'portal-msg', rows: 3, maxlength: 5000, placeholder: 'اكتب رسالتك إلى فريق الإدارة…' });
  const files = fileInput({ maxFiles: MAX_FILES, maxBytes: MAX_BYTES, label: 'إرفاق مستندات (اختياري)' });
  const send = asyncButton(
    'إرسال',
    async () => {
      const body = ta.value.trim();
      const chosen = files.getFiles();
      if (!body && !chosen.length) {
        toast('اكتب رسالتك أو أرفق مستندًا أولًا', 'warning');
        ta.focus();
        return;
      }
      const documents = await filesToUploads(chosen, { maxBytes: MAX_BYTES });
      await api.post(`${base}/messages`, { body, documents });
      toast('تم إرسال رسالتك', 'success');
      await load({ keepScroll: true });
    },
    { variant: 'primary', icon: 'send' },
  );
  const c = sectionCard('chat', {
    title: 'المحادثة',
    subtitle: `راسل فريق ${orgName()} مباشرة من هنا، وستظهر الردود في هذه المحادثة.`,
    icon: 'message',
    body: h(
      'div.stack',
      thread,
      h(
        'div.composer',
        h('label.field-label', { htmlFor: 'portal-msg' }, 'رسالة جديدة'),
        ta,
        files.el,
        h('div.composer-actions', h('span.small.muted', 'الحد الأقصى 5 ملفات، وحجم الملف لا يزيد على 8 ميجابايت'), send),
      ),
    ),
  });
  requestAnimationFrame(() => (thread.scrollTop = thread.scrollHeight));
  return c;
}

// ───────────── الملفات ─────────────

function filesSection(cases, intakes) {
  const caseRows = cases.map((c) =>
    h(
      'li.case-row',
      h('div.case-row-main', codeTag(c.code), h('span.case-row-title', c.title || 'استشارة قانونية')),
      badge(c.status_label || label('case_status', c.status), statusTone('case_status', c.status), { dot: true }),
    ),
  );
  const intakeRows = intakes.map((i) =>
    h(
      'li.case-row',
      h('div.case-row-main', codeTag(i.code), h('span.case-row-title', 'طلب استشارة'), h('span.small.muted', `قُدِّم في ${date(i.created_at)}`)),
      badge(i.status_label || label('intake_status', i.status), statusTone('intake_status', i.status), { dot: true }),
    ),
  );
  return sectionCard('files', {
    title: 'ملفاتك',
    subtitle: 'كل ملفاتك وطلباتك لدينا وحالة كل منها.',
    icon: 'briefcase',
    body:
      caseRows.length || intakeRows.length
        ? h(
            'div.stack',
            caseRows.length > 0 ? h('div.stack-sm', h('h3.small.muted', 'ملفات الاستشارات'), h('ul.list-plain', caseRows)) : null,
            intakeRows.length > 0 ? h('div.stack-sm', h('h3.small.muted', 'طلباتك المقدَّمة'), h('ul.list-plain', intakeRows)) : null,
          )
        : emptyState('لا توجد ملفات بعد', null, { compact: true, icon: 'briefcase' }),
  });
}

// ───────────── الصفحة ─────────────

function summaryLink(href, iconName, num, text) {
  return h(
    'a',
    { href },
    h('span.sum-icon', icon(iconName, { size: 20 })),
    h('span', h('span.sum-num', String(num)), h('span.sum-label', text)),
  );
}

function renderPortal(data) {
  const client = data.client || {};
  const requests = data.requests || [];
  const answers = data.answers || [];
  const events = data.events || [];
  const invoices = data.invoices || [];
  const unpaid = invoices.filter((i) => i.status === 'unpaid' || i.status === 'partially_paid');
  const firstName = String(client.name || '').trim().split(/\s+/)[0];

  document.title = `متابعة ملفك — ${orgName()}`;
  // رابط الموقع مقصور على طلب واحد: نرسل رقم الطلب في رسالة واتساب حتى تربطها الإدارة به
  const ref = client.code ? ` رقم ${client.code}` : client.reference ? `، رقم طلبي ${client.reference}` : '';
  const wa = whatsappUrl(settings.whatsapp_number_digits, `مرحبًا ${orgName()}، أتابع ملفي${ref}.`);
  document.querySelectorAll('a[data-cta="whatsapp"]').forEach((a) => {
    if (wa) {
      a.href = wa;
      a.hidden = false;
    }
  });

  mount(
    root,
    h(
      'section.portal-hero',
      h(
        'div.container',
        h('h1', firstName ? `مرحبًا ${firstName}` : 'مرحبًا بك'),
        h('p', `هذه صفحتك الخاصة لمتابعة طلباتك وملفاتك لدى ${orgName()}: ترد على طلباتنا، وترفع مستنداتك، وتراسلنا من مكان واحد.`),
        client.code ? h('p.row', h('span', 'رقم العميل:'), codeTag(client.code)) : null,
        !client.code && client.reference ? h('p.row', h('span', 'رقم طلبك:'), codeTag(client.reference), h('span.small', 'احتفظ به للمتابعة')) : null,
        h(
          'nav.portal-summary',
          { 'aria-label': 'ملخص ملفك' },
          summaryLink('#requests', 'message', requests.filter((r) => r.can_reply).length, 'طلبات بانتظار ردك'),
          summaryLink('#answers', 'fileText', answers.length, `ردود ${orgName()}`),
          summaryLink('#events', 'calendar', events.length, 'مواعيد قادمة'),
          invoices.length ? summaryLink('#invoices', 'wallet', unpaid.length, 'فواتير غير مسددة') : null,
        ),
      ),
    ),
    h(
      'div.container.portal-body',
      requestsSection(requests),
      answersSection(answers),
      eventsSection(events),
      invoices.length ? invoicesSection(invoices) : null,
      chatSection(data.messages || []),
      filesSection(data.cases || [], data.intakes || []),
    ),
  );
}

function renderInvalid(err) {
  document.title = `رابط غير صالح — ${orgName()}`;
  const wa = whatsappUrl(settings.whatsapp_number_digits, `مرحبًا ${orgName()}، رابط متابعة طلبي لا يعمل، أرجو المساعدة.`);
  mount(
    root,
    h(
      'div.error-page',
      h(
        'div.error-page-card',
        h('span.empty-icon.is-danger', icon('link', { size: 28 })),
        h('h1', 'تعذر فتح صفحة المتابعة'),
        h('p', (err && err.message) || 'الرابط غير صالح أو انتهت صلاحيته.'),
        h('p.muted', 'تأكد من فتح الرابط كاملًا كما وصلك، أو تواصل معنا وسنرسل لك رابطًا جديدًا.'),
        h(
          'div.cta-row',
          wa && button('تواصل معنا عبر واتساب', { variant: 'whatsapp', icon: 'whatsapp', href: wa, target: '_blank' }),
          button('تقديم طلب جديد', { variant: 'secondary', icon: 'plus', href: '/intake' }),
        ),
      ),
    ),
  );
}

async function load({ keepScroll = false } = {}) {
  if (!token) {
    renderInvalid(new ApiError('الرابط غير مكتمل؛ تأكد من نسخه كاملًا.', { status: 404, code: 'invalid_token' }));
    return;
  }
  if (!keepScroll) mount(root, loading('جارٍ تحميل ملفك…'));
  try {
    const data = await api.get(base);
    const y = window.scrollY;
    renderPortal(data);
    if (keepScroll) window.scrollTo(0, y);
  } catch (err) {
    if ([401, 403, 404, 410].includes(err.status)) renderInvalid(err);
    else mount(root, h('div.container.portal-body', errorState(err, () => load())));
  }
}

async function init() {
  hydrateIcons();
  setYear();
  try {
    const meta = setMeta(await api.get('/meta'));
    settings = meta.settings || {};
    bindSettings(settings);
  } catch {
    /* البوابة تعمل بالمسميات الافتراضية إن تعذر تحميل الإعدادات */
  }
  await load();
}

init();
