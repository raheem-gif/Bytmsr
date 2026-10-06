// الأتمتة والرسائل: قواعد مرتبطة بما يحدث داخل الملف (جلسات، فواتير، مستندات، مواعيد إجرائية، تأخر المحامي)
// وصندوق الصادر لكل الرسائل الموجهة للعملاء مع إعادة إرسال الفاشل منها.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, options, num, count, dateTime, relative, orgName } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  table,
  tabs,
  filterBar,
  selectInput,
  badge,
  statusBadge,
  statusTone,
  button,
  asyncButton,
  emptyState,
  errorState,
  loading,
  alertBox,
  modal,
  form,
  toast,
  icon,
  codeTag,
  confirmDialog,
  richText,
} from '../../../lib/ui.js';
import { replaceQuery } from './lawyers.js';

const RULES = {
  hearing_reminder: {
    icon: 'calendar',
    audience: 'client',
    desc: 'يُرسَل للعميل قبل الجلسة أو الموعد الذي يلزم حضوره شخصيًا، مرة واحدة لكل موعد.',
    placeholders: {
      event_kind: 'نوع الموعد (جلسة، اجتماع…)',
      matter_code: 'كود الملف المستمر',
      date: 'تاريخ الموعد',
      time: 'ساعة الموعد',
      location: 'المكان',
      title: 'عنوان الموعد',
      org_name: 'اسم المؤسسة (من الإعدادات)',
    },
    sample: { event_kind: 'جلسة', matter_code: 'MTR-2026-00001', date: 'الخميس 8 أكتوبر 2026', time: '10:00 صباحًا', location: 'محكمة الأسرة ببنها', title: 'جلسة نظر دعوى النفقة' },
  },
  invoice_reminder: {
    icon: 'wallet',
    audience: 'client',
    desc: 'يُذكّر العميل بفاتورة تجاوزت تاريخ استحقاقها ولم تُسدَّد، بتكرار محدود حتى لا يصبح إزعاجًا.',
    placeholders: { invoice_number: 'رقم الفاتورة', amount: 'المبلغ المتبقي (رقم فقط)', due_date: 'تاريخ الاستحقاق', org_name: 'اسم المؤسسة (من الإعدادات)' },
    sample: { invoice_number: 'INV-2026-00001', amount: '300', due_date: '27 سبتمبر 2026' },
  },
  document_reminder: {
    icon: 'fileText',
    audience: 'client',
    desc: 'يُذكّر العميل بمعلومة أو مستند طلبناه منه ولم يصل بعد، فلا يتوقف الملف بسبب نقص بسيط.',
    placeholders: { case_code: 'كود الملف', request: 'نص الطلب الموجه للعميل', org_name: 'اسم المؤسسة (من الإعدادات)' },
    sample: { case_code: 'INH-2026-00482', request: 'برجاء إرسال صورة إعلام الوراثة' },
  },
  procedural_deadline: {
    icon: 'clock',
    audience: 'internal',
    desc: 'ينبّه المحامي المسؤول والإدارة قبل موعد إجرائي (مثل ميعاد طعن أو إيداع مذكرة) لم يُسجَّل إنجازه، ثم عند فواته.',
  },
  assignment_overdue: {
    icon: 'alert',
    audience: 'internal',
    desc: 'ينبّه المحامي والإدارة عندما يتجاوز إسناد الموعد المطلوب دون تقديم الرأي.',
  },
};

const PARAM_FIELDS = {
  days_before: { label: 'عدد الأيام قبل الموعد', hint: 'متى يبدأ التذكير أو التنبيه قبل الموعد', suffix: 'يوم' },
  after_days: { label: 'بعد كم يوم من إرسال الطلب للعميل', hint: 'لا يُرسل التذكير قبل مرور هذه المدة', suffix: 'يوم' },
  repeat_every_days: { label: 'الفاصل بين التذكيرات', hint: 'أقل مدة بين تذكيرين لنفس العنصر', suffix: 'يوم' },
  max_reminders: { label: 'الحد الأقصى للتذكيرات', hint: 'لكل فاتورة أو طلب', suffix: 'تذكير' },
};
const PARAM_ORDER = ['days_before', 'after_days', 'repeat_every_days', 'max_reminders'];

const REMINDER_FORMS = ['تذكير واحد', 'تذكيرين', 'تذكيرات', 'تذكيرًا'];

function paramSentence(key, n) {
  const v = Number(n) || 0;
  switch (key) {
    case 'days_before':
      return v === 1 ? 'قبل الموعد بيوم واحد' : v === 2 ? 'قبل الموعد بيومين' : `قبل الموعد بـ ${count(v, 'day')}`;
    case 'after_days':
      return v === 1 ? 'بعد يوم واحد من إرسال الطلب' : `بعد ${count(v, 'day')} من إرسال الطلب`;
    case 'repeat_every_days':
      return v === 1 ? 'يتكرر يوميًا' : `يتكرر كل ${count(v, 'day')}`;
    case 'max_reminders':
      return `بحد أقصى ${count(v, REMINDER_FORMS)}`;
    default:
      return `${key}: ${v}`;
  }
}

const ENTITY_LABELS = {
  matter_event: 'موعد',
  invoice: 'فاتورة',
  info_request: 'طلب معلومات',
  matter_task: 'مهمة إجرائية',
  assignment: 'إسناد لمحامٍ',
};

function runText(run) {
  let result = run.result;
  try {
    result = JSON.parse(run.result);
  } catch {
    /* نص عادي */
  }
  if (result && typeof result === 'object' && result.message_id) return 'أُرسلت رسالة للعميل';
  if (result === 'notified') return String(run.dedupe_key || '').startsWith('overdue:') ? 'تنبيه داخلي: فات الموعد' : 'أُرسل تنبيه داخلي';
  return 'نُفّذت';
}

/** نص القالب مع إبراز المتغيرات وعزلها باتجاه LTR. */
function templateNodes(tpl) {
  return String(tpl || '')
    .split(/(\{\w+\})/g)
    .filter((p) => p !== '')
    .map((p) => (/^\{\w+\}$/.test(p) ? h('code.pd-tok', { dir: 'ltr' }, p) : p));
}

function shorten(text, n) {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function fillTemplate(tpl, values) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (values[k] != null ? String(values[k]) : m));
}

/** مفتاح تبديل يمكن الوصول إليه بلوحة المفاتيح. */
function switchControl({ checked, label: text, onToggle }) {
  const btn = h(
    'button.pd-switch',
    { type: 'button', role: 'switch', 'aria-checked': String(Boolean(checked)), 'aria-label': text },
    h('span.pd-switch-track', { 'aria-hidden': 'true' }, h('span.pd-switch-thumb')),
    h('span.pd-switch-text', checked ? 'مفعّلة' : 'موقوفة'),
  );
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      await onToggle(btn.getAttribute('aria-checked') !== 'true');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });
  return btn;
}

export default async function render(ctx) {
  const isAdmin = ctx.user?.role === 'admin';
  const data = await api.get('/admin/automations');
  let rules = Array.isArray(data.rules) ? data.rules : [];
  const waConfigured = Boolean(data.whatsapp_configured);
  const validStatuses = options('message_status').map((o) => o.value);
  const outboxState = { status: validStatuses.includes(ctx.query.status) ? ctx.query.status : '' };
  let activeTab = ctx.query.tab === 'outbox' ? 'outbox' : 'rules';

  function syncUrl() {
    replaceQuery('/automations', { tab: activeTab === 'rules' ? '' : activeTab, status: activeTab === 'outbox' ? outboxState.status : '' });
  }

  // ───────────── حالة واتساب ─────────────
  const waBanner = alertBox(
    frag(
      h(
        'p',
        waConfigured
          ? 'الرسائل الآلية والفردية تُرسل فعليًا للعملاء عبر WhatsApp Business API، وتظهر حالة كل رسالة (أُرسلت، سُلّمت، قُرئت) في صندوق الصادر.'
          : 'لم تُضبط بيانات اعتماد WhatsApp Business بعد، لذلك تُسجَّل كل رسالة صادرة بحالة «إرسال تجريبي (محاكاة)» دون أن تصل للعميل فعليًا. تعمل القواعد كاملة حتى تتأكد من صياغتها قبل التشغيل الحقيقي.',
      ),
      h(
        'p.pd-wa-note',
        h('strong', 'نافذة الـ 24 ساعة: '),
        'يسمح واتساب بالرسائل الحرة خلال 24 ساعة من آخر رسالة أرسلها العميل فقط؛ خارجها لا تُرسل إلا قوالب معتمدة مسبقًا من ميتا، وتستخدم المنصة تلقائيًا القالب المحدد في الإعدادات.',
        isAdmin ? [' ', h('a', { href: '#/settings' }, 'إعدادات واتساب والتكاملات')] : null,
      ),
    ),
    waConfigured ? 'success' : 'warning',
    { title: waConfigured ? 'واتساب متصل — الإرسال حقيقي' : 'واتساب في وضع المحاكاة', icon: 'whatsapp' },
  );

  // ───────────── القواعد ─────────────
  const rulesHost = h('div.pd-rules');

  async function refreshRules() {
    const d = await api.get('/admin/automations');
    rules = Array.isArray(d.rules) ? d.rules : rules;
    drawRules();
  }

  function ruleCard(r) {
    const meta = RULES[r.key] || { icon: 'zap', audience: 'internal', desc: '' };
    const params = r.params || {};
    const paramKeys = PARAM_ORDER.filter((k) => k in params);
    const runs = Array.isArray(r.recent_runs) ? r.recent_runs : [];

    const toggle = isAdmin
      ? switchControl({
          checked: r.enabled,
          label: `تفعيل قاعدة «${r.label}»`,
          onToggle: async (next) => {
            if (!next) {
              const ok = await confirmDialog({
                title: 'إيقاف القاعدة',
                message: `لن ${meta.audience === 'client' ? 'تُرسل رسائل' : 'تُرسل تنبيهات'} «${r.label}» حتى تعيد تفعيلها. هل تريد المتابعة؟`,
                confirmLabel: 'إيقاف القاعدة',
                danger: true,
              });
              if (!ok) return;
            }
            try {
              await api.patch(`/admin/automations/${encodeURIComponent(r.key)}`, { enabled: next });
              toast(next ? `تم تفعيل «${r.label}»` : `تم إيقاف «${r.label}»`, 'success');
              await refreshRules();
            } catch (err) {
              toast(err.message || 'تعذر تحديث القاعدة', 'danger');
            }
          },
        })
      : r.enabled
        ? badge('مفعّلة', 'success', { dot: true })
        : badge('موقوفة', 'muted', { dot: true });

    return h(
      'article.pd-rule',
      { class: !r.enabled && 'is-off' },
      h(
        'header.pd-rule-head',
        h('span.pd-rule-icon', { class: meta.audience === 'client' ? 'tone-success' : 'tone-info' }, icon(meta.icon, { size: 20 })),
        h('div.pd-rule-title', h('h3', r.label)),
        h('div.pd-rule-toggle', toggle),
      ),
      h(
        'div.pd-badges',
        meta.audience === 'client' ? badge('رسالة للعميل عبر واتساب', 'success', { icon: 'whatsapp' }) : badge('تنبيه داخلي للمحامي والإدارة', 'info', { icon: 'bell' }),
      ),
      h('p.pd-rule-desc', meta.desc),
      paramKeys.length ? h('ul.pd-rule-params', paramKeys.map((k) => h('li', icon('check', { size: 14 }), paramSentence(k, params[k])))) : null,
      params.template
        ? h('div.pd-template', h('div.pd-template-label', icon('message', { size: 14 }), 'نص الرسالة'), h('p.pd-template-body', { dir: 'rtl' }, templateNodes(params.template)))
        : null,
      h(
        'div.pd-rule-runs',
        h('div.pd-rule-runs-head', h('span', icon('zap', { size: 14 }), r.total_runs ? `نُفّذت ${count(r.total_runs, ['مرة واحدة', 'مرتين', 'مرات', 'مرة'])}` : 'لم تُنفَّذ بعد')),
        runs.length
          ? h(
              'ul.pd-runs',
              runs.slice(0, 4).map((run) =>
                h(
                  'li',
                  h('time', { datetime: run.created_at, title: dateTime(run.created_at) }, relative(run.created_at)),
                  h('span', `${ENTITY_LABELS[run.entity_type] || 'عنصر'} رقم ${run.entity_id}`),
                  h('span.muted', runText(run)),
                ),
              ),
            )
          : null,
      ),
      isAdmin && (paramKeys.length || params.template)
        ? h('footer.pd-rule-foot', button('تعديل الإعدادات', { size: 'sm', icon: 'edit', onClick: () => openEdit(r) }))
        : null,
    );
  }

  function drawRules() {
    if (!rules.length) {
      mount(rulesHost, emptyState('لا توجد قواعد أتمتة معرّفة', null, { icon: 'zap' }));
      return;
    }
    mount(rulesHost, rules.map(ruleCard));
  }

  function openEdit(r) {
    const meta = RULES[r.key] || {};
    const params = r.params || {};
    const paramKeys = PARAM_ORDER.filter((k) => k in params);
    const hasTemplate = typeof params.template === 'string';
    const fields = paramKeys.map((k) => ({
      name: k,
      label: PARAM_FIELDS[k].label,
      hint: PARAM_FIELDS[k].hint,
      type: 'number',
      integer: true,
      required: true,
      min: 1,
      max: 365,
      suffix: PARAM_FIELDS[k].suffix,
    }));
    if (hasTemplate) fields.push({ name: 'template', label: 'نص الرسالة', type: 'textarea', rows: 5, required: true, maxLength: 1000, full: true, dir: 'auto' });
    const f = form(fields, { footer: false, values: params });
    const preview = h('p.pd-template-body', { dir: 'auto' });
    const placeholders = meta.placeholders || {};
    let legend = null;
    if (hasTemplate) {
      const ta = f.control('template').input;
      const updatePreview = () => mount(preview, richText(fillTemplate(ta.value, { org_name: orgName(), ...(meta.sample || {}) })));
      ta.addEventListener('input', updatePreview);
      updatePreview();
      legend = h(
        'div.pd-legend',
        h('div.pd-legend-title', 'المتغيرات المتاحة — اضغط لإدراجها في موضع المؤشر:'),
        h(
          'div.pd-legend-items',
          Object.entries(placeholders).map(([k, desc]) =>
            h(
              'button.pd-ph',
              {
                type: 'button',
                title: `إدراج ${desc}`,
                onClick: () => {
                  const token = `{${k}}`;
                  const start = ta.selectionStart ?? ta.value.length;
                  const end = ta.selectionEnd ?? ta.value.length;
                  ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
                  ta.focus();
                  ta.setSelectionRange(start + token.length, start + token.length);
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                },
              },
              h('code', { dir: 'ltr' }, `{${k}}`),
              h('span', desc),
            ),
          ),
        ),
      );
    }
    modal({
      title: `إعدادات «${r.label}»`,
      size: 'lg',
      body: frag(
        h('p.modal-intro', meta.desc || ''),
        f.el,
        legend,
        hasTemplate ? h('div.pd-template.pd-template-preview', h('div.pd-template-label', icon('eye', { size: 14 }), 'معاينة بمثال واقعي'), preview) : null,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حفظ الإعدادات',
          variant: 'primary',
          icon: 'check',
          onClick: async () => {
            if (!f.validate()) return false;
            const v = f.getValues();
            if (hasTemplate) {
              const unknown = [...new Set([...v.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !(k in placeholders)))];
              if (unknown.length) {
                f.setErrors({ template: `متغير غير معروف لهذه القاعدة: ${unknown.map((k) => `{${k}}`).join('، ')}` });
                return false;
              }
            }
            try {
              await api.patch(`/admin/automations/${encodeURIComponent(r.key)}`, { params: v });
            } catch (err) {
              f.showError(err);
              return false;
            }
            toast(`تم حفظ إعدادات «${r.label}»`, 'success');
            refreshRules().catch(() => ctx.reload());
            return undefined;
          },
        },
      ],
    });
  }

  function rulesPanel() {
    drawRules();
    return h(
      'div.stack',
      h('p.pd-section-hint.pd-intro', 'تعمل القواعد تلقائيًا كل دقيقة على الخادم، ولا تُرسل التذكير نفسه مرتين لنفس الموعد أو الطلب. يمكن تشغيلها يدويًا الآن للتحقق.'),
      rulesHost,
    );
  }

  // ───────────── صندوق الصادر ─────────────
  const outboxHost = h('div.stack');
  let outboxSeq = 0;

  async function loadOutbox() {
    const my = ++outboxSeq;
    mount(outboxHost, loading());
    try {
      const rows = await api.get('/admin/outbox', { status: outboxState.status });
      if (my !== outboxSeq) return;
      drawOutbox(Array.isArray(rows) ? rows : []);
    } catch (err) {
      if (my !== outboxSeq) return;
      mount(outboxHost, errorState(err, loadOutbox));
    }
  }

  function bodyCell(m) {
    const text = String(m.body || '');
    const short = text.length > 110;
    const p = h('p.pd-msg-body', { dir: 'auto' }, richText(short ? shorten(text, 110) : text));
    if (!short) return p;
    let open = false;
    const toggleBtn = button('عرض النص كاملًا', {
      size: 'sm',
      variant: 'link',
      onClick: () => {
        open = !open;
        mount(p, richText(open ? text : shorten(text, 110)));
        toggleBtn.setAttribute('aria-expanded', String(open));
        toggleBtn.querySelector('.btn-label').textContent = open ? 'إخفاء' : 'عرض النص كاملًا';
      },
    });
    toggleBtn.setAttribute('aria-expanded', 'false');
    return h('div.pd-msg', p, toggleBtn);
  }

  function drawOutbox(rows) {
    const counts = {};
    for (const m of rows) counts[m.status] = (counts[m.status] || 0) + 1;
    const failed = counts.failed || 0;
    if (!outboxState.status) tabsEl.setCount('outbox', failed ? `${num(failed)} فشل` : rows.length);
    mount(
      outboxHost,
      rows.length && !outboxState.status
        ? h(
            'div.pd-badges.pd-outbox-summary',
            h('span.cell-sub', `آخر ${count(rows.length, 'message')}: `),
            Object.entries(counts).map(([k, n]) => badge(`${label('message_status', k)}: ${num(n)}`, statusTone('message_status', k), { dot: true })),
          )
        : null,
      table({
        className: 'pd-table-tight',
        caption: 'الرسائل الصادرة للعملاء',
        rows,
        empty: outboxState.status ? 'لا توجد رسائل بهذه الحالة' : 'لم تُرسل أي رسائل بعد',
        rowClass: (m) => m.status === 'failed' && 'pd-row-failed',
        columns: [
          {
            key: 'time',
            label: 'الوقت',
            render: (m) =>
              h('div.pd-cell-stack', h('time.nowrap', { datetime: m.created_at, title: dateTime(m.created_at) }, relative(m.created_at)), h('span.cell-sub.nowrap', dateTime(m.created_at))),
          },
          {
            key: 'client',
            label: 'العميل',
            render: (m) =>
              m.client_id
                ? h('div.pd-cell-stack', h('a.cell-title', { href: `#/clients/${m.client_id}` }, m.client_name || 'عميل'), m.client_code && codeTag(m.client_code))
                : h('span.muted', '—'),
          },
          {
            key: 'file',
            label: 'الملف',
            render: (m) =>
              m.case_code || m.matter_code
                ? h(
                    'div.pd-cell-stack',
                    m.case_code && h('a', { href: `#/cases/${m.case_id}` }, codeTag(m.case_code)),
                    m.matter_code && h('a', { href: `#/matters/${m.matter_id}` }, codeTag(m.matter_code)),
                  )
                : h('span.muted', 'طلب وارد'),
          },
          {
            key: 'status',
            label: 'القناة والحالة',
            render: (m) => h('div.pd-cell-stack', h('span.nowrap', m.channel === 'whatsapp' && icon('whatsapp', { size: 14 }), ' ', label('channel', m.channel)), statusBadge('message_status', m.status)),
          },
          {
            key: 'source',
            label: 'المصدر',
            render: (m) =>
              m.automated
                ? h('div.pd-cell-stack', badge('رسالة آلية', 'accent', { icon: 'zap' }), h('span.cell-sub', label('automation_rule', m.automation_rule)))
                : h('div.pd-cell-stack', h('span', 'يدويًا'), h('span.cell-sub', m.author_name || 'النظام')),
          },
          { key: 'body', label: 'نص الرسالة', className: 'pd-col-body', render: bodyCell },
          rows.some((m) => m.status === 'failed' || m.error) && {
            key: 'actions',
            label: '',
            render: (m) =>
              m.status === 'failed'
                ? h(
                    'div.pd-cell-stack',
                    m.error ? h('span.pd-text-danger.small', m.error) : null,
                    asyncButton(
                      'إعادة الإرسال',
                      async () => {
                        await api.post(`/admin/messages/${encodeURIComponent(m.id)}/retry`);
                        toast('أُعيدت الرسالة إلى قائمة الإرسال', 'success');
                        loadOutbox();
                      },
                      { size: 'sm', icon: 'refresh' },
                    ),
                  )
                : m.error
                  ? h('span.pd-text-danger.small', m.error)
                  : null,
          },
        ].filter(Boolean),
      }),
    );
  }

  function outboxPanel() {
    const statusSel = selectInput({
      label: 'حالة الرسالة',
      allLabel: 'كل الحالات',
      value: outboxState.status,
      options: options('message_status').filter((o) => o.value !== 'received'),
      onChange: (v) => {
        outboxState.status = v;
        syncUrl();
        loadOutbox();
      },
    });
    loadOutbox();
    return h(
      'div.stack',
      h('p.pd-section-hint.pd-intro', 'كل ما أرسلته المؤسسة للعملاء — آليًا أو يدويًا — من نفس محرك الرسائل، مع حالته الفعلية. الرسائل الفاشلة يمكن إعادة إرسالها.'),
      filterBar([statusSel, button('تحديث', { icon: 'refresh', variant: 'ghost', onClick: loadOutbox })]),
      outboxHost,
    );
  }

  const tabsEl = tabs(
    [
      { key: 'rules', label: 'قواعد الأتمتة', icon: 'zap', count: rules.filter((r) => r.enabled).length, render: rulesPanel },
      { key: 'outbox', label: 'صندوق الصادر', icon: 'send', render: outboxPanel },
    ],
    {
      active: activeTab,
      onChange: (key) => {
        activeTab = key;
        syncUrl();
      },
    },
  );

  const runBtn = asyncButton(
    'تشغيل القواعد الآن',
    async () => {
      const res = await api.post('/admin/automations/run');
      if (res && res.skipped) {
        toast('القواعد قيد التشغيل بالفعل، حاول بعد لحظات', 'warning');
        return;
      }
      const entries = Object.entries(res || {});
      const total = entries.reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0);
      modal({
        title: 'نتيجة تشغيل القواعد',
        size: 'md',
        body: frag(
          h('p.modal-intro', total ? `نُفّذ ${count(total, ['إجراء واحد', 'إجراءان', 'إجراءات', 'إجراءً'])} جديد. لا تُكرر القواعد ما نُفّذ من قبل.` : 'لا يوجد جديد يستدعي التنفيذ الآن؛ كل ما يستحق التذكير أُرسل من قبل.'),
          h(
            'ul.pd-run-result',
            entries.map(([key, v]) => {
              const isClient = RULES[key]?.audience === 'client';
              let text;
              let tone;
              if (v === 'disabled') {
                text = 'القاعدة موقوفة';
                tone = 'muted';
              } else if (v === 'error') {
                text = 'حدث خطأ أثناء التنفيذ';
                tone = 'danger';
              } else if (!v) {
                text = 'لا جديد';
                tone = 'neutral';
              } else {
                text = isClient ? `${count(v, ['رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'])}${waConfigured ? '' : ' (محاكاة)'}` : count(v, ['تنبيه واحد', 'تنبيهان', 'تنبيهات', 'تنبيهًا']);
                tone = 'success';
              }
              return h('li', h('span', label('automation_rule', key)), badge(text, tone));
            }),
          ),
        ),
        actions: [{ label: 'تم', variant: 'primary' }],
        onClose: () => ctx.reload(),
      });
    },
    { variant: 'primary', icon: 'zap' },
  );

  return frag(
    pageHeader({
      title: 'الأتمتة والرسائل',
      subtitle: 'الرسائل الآلية مرتبطة بما يحدث داخل الملف، وليست رسائل تسويقية عامة.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'الأتمتة والرسائل' }],
      actions: runBtn,
    }),
    waBanner,
    !isAdmin && alertBox('تعديل القواعد وتفعيلها أو إيقافها متاح لمدير النظام فقط.', 'info'),
    card({ body: tabsEl }),
  );
}
