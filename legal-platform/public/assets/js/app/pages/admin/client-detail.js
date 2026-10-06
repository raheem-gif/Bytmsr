// ملف العميل: بياناته، وسائل التواصل المرتبطة به (هاتف/بريد عبر كل القنوات)، تاريخ علاقته بالمؤسسة
// (طلبات ← ملفات استشارة ← ملفات مستمرة)، الفواتير، رابط البوابة، ودمج العملاء المكررين.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, governorateOptions, relative, dateTime, date, money, num, normalizeEgPhone, toLatinDigits } from '../../../lib/fmt.js';
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
  ltr,
  kv,
  table,
  timeline,
  emptyState,
  statCard,
  formDialog,
  confirmDialog,
  confirmDanger,
  toast,
  copyButton,
  errorMessage,
} from '../../../lib/ui.js';
import { channelIcons, fieldError, reloadAndFocus } from './inbox.js';
import { pickClient } from './clients.js';

const ACTOR_TONES = { ai: 'accent', client: 'info', staff: 'primary', lawyer: 'info', system: 'muted' };

export default async function render(ctx) {
  const d = await api.get(`/admin/clients/${encodeURIComponent(ctx.params.id)}`);
  const c = d.client;
  const base = `/admin/clients/${c.id}`;
  const identities = d.identities || [];
  const intakes = d.intakes || [];
  const cases = d.cases || [];
  const matters = d.matters || [];
  const invoices = d.invoices || [];
  const hasPhone = identities.some((x) => x.kind === 'phone');
  ctx.setTitle(`العميل ${c.code}`);

  // إذا فُتح رابط عميل دُمج في آخر، يعيد الخادم العميل الأساسي: نصحح الرابط
  if (String(c.id) !== String(ctx.params.id)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/clients/${c.id}`);
  }

  async function run(fn) {
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  }

  // ───────────── الإجراءات ─────────────
  async function editProfile() {
    const res = await formDialog({
      title: 'تعديل بيانات العميل',
      size: 'lg',
      values: { name: c.name, national_id: c.national_id, governorate: c.governorate, email: c.email, notes: c.notes },
      fields: [
        { name: 'name', label: 'الاسم', maxLength: 150 },
        { name: 'national_id', label: 'الرقم القومي', ltr: true, maxLength: 14, hint: '14 رقمًا يبدأ بـ 2 أو 3' },
        { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions() },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
        { name: 'notes', label: 'ملاحظات داخلية', type: 'textarea', rows: 3, maxLength: 5000, hint: 'لا تظهر للعميل ولا للمحامين' },
      ],
      onSubmit: async (v) => {
        const nid = toLatinDigits(v.national_id || '').replace(/\s/g, '');
        if (nid && !/^[23]\d{13}$/.test(nid)) throw fieldError('national_id', 'الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3');
        return api.patch(base, {
          name: v.name || null,
          national_id: nid || null,
          governorate: v.governorate || null,
          email: v.email || null,
          notes: v.notes || null,
        });
      },
    });
    if (res) {
      toast('تم حفظ بيانات العميل', 'success');
      await reloadAndFocus(ctx, '#pa-profile');
    }
  }

  async function addIdentity() {
    const res = await formDialog({
      title: 'إضافة وسيلة تواصل',
      intro: 'أي رسالة تصل لاحقًا من هذا الرقم أو البريد — عبر واتساب أو الموقع أو غيرهما — ستُربط تلقائيًا بهذا العميل.',
      values: { kind: 'phone' },
      fields: [
        {
          name: 'kind',
          label: 'النوع',
          type: 'select',
          required: true,
          placeholder: false,
          options: [
            { value: 'phone', label: 'رقم هاتف' },
            { value: 'email', label: 'بريد إلكتروني' },
          ],
        },
        { name: 'value', label: 'الرقم أو البريد', required: true, ltr: true, maxLength: 200, placeholder: '01XXXXXXXXX أو name@example.com' },
      ],
      onSubmit: async (v) => {
        let value = v.value;
        if (v.kind === 'phone') {
          const p = normalizeEgPhone(value);
          const digits = toLatinDigits(value).replace(/[^\d+]/g, '');
          if (!p && !/^\+\d{8,15}$/.test(digits)) throw fieldError('value', 'أدخل رقم موبايل مصريًا صحيحًا مثل 01012345678 أو رقمًا دوليًا يبدأ بـ +');
          value = p || digits;
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
          throw fieldError('value', 'أدخل بريدًا إلكترونيًا صحيحًا');
        }
        return api.post(`${base}/identities`, { kind: v.kind, value });
      },
    });
    if (res) {
      toast('أُضيفت وسيلة التواصل للعميل', 'success');
      await reloadAndFocus(ctx, '#pa-identities');
    }
  }

  async function mergeDuplicate() {
    const other = await pickClient({
      title: 'دمج عميل مكرر في هذا العميل',
      intro: `اختر العميل المكرر (نفس الشخص مسجّل برقم أو بريد آخر). ستنتقل كل بياناته إلى ${c.code}.`,
      excludeId: c.id,
    });
    if (!other) return;
    const ok = await confirmDanger({
      title: 'تأكيد الدمج',
      message: `سيُنقل كل ما يخص العميل ${other.code}${other.name ? ` (${other.name})` : ''} — أرقامه وطلباته وملفاته ورسائله وفواتيره — إلى هذا العميل ${c.code}، ويتوقف استخدام الرقم ${other.code}. لا يمكن التراجع عن الدمج.`,
      confirmLabel: 'نعم، ادمج في هذا العميل',
    });
    if (!ok) return;
    await run(async () => {
      await api.post(`${base}/merge`, { other_client_id: other.id });
      toast(`تم دمج العميل ${other.code} في ${c.code}`, 'success');
      await reloadAndFocus(ctx, '#main');
    });
  }

  // ───────────── البوابة ─────────────
  const portalHost = h('div.pa-portal-result', { 'aria-live': 'polite' });
  function showPortalUrl(url) {
    const absolute = /^https?:\/\//.test(url) ? url : `${window.location.origin}${url}`;
    mount(
      portalHost,
      h(
        'div.stack-sm',
        h('label.field-label', { htmlFor: 'pa-portal-url' }, 'الرابط الخاص بالعميل'),
        h(
          'div.pa-url-row',
          h('input.input#pa-portal-url', { type: 'text', readonly: true, dir: 'ltr', value: absolute, onFocus: (e) => e.target.select() }),
          copyButton(absolute, 'نسخ', { variant: 'secondary' }),
        ),
        h('p.field-hint', 'شارك الرابط مع العميل فقط؛ من يملكه يستطيع الاطلاع على ملفاته والرد على الطلبات.'),
      ),
    );
  }
  const genBtn = asyncButton(
    'إنشاء رابط',
    async () => {
      const res = await api.post(`${base}/portal-link`, { send: false });
      showPortalUrl(res.url);
      toast('أُنشئ رابط جديد للبوابة', 'success');
    },
    { size: 'sm', icon: 'link' },
  );
  const sendBtn = asyncButton(
    'إرسال عبر واتساب',
    async () => {
      const ok = await confirmDialog({
        title: 'إرسال رابط البوابة للعميل',
        message: `سيُنشأ رابط جديد ويُرسل للعميل ${c.name || c.code} عبر واتساب من رقم المؤسسة.`,
        confirmLabel: 'إرسال الرابط',
      });
      if (!ok) return;
      const res = await api.post(`${base}/portal-link`, { send: true });
      showPortalUrl(res.url);
      toast(res.message_id ? 'أُرسل الرابط للعميل (يظهر كإرسال تجريبي إن لم تُضبط بيانات واتساب)' : 'أُنشئ الرابط', 'success');
    },
    { size: 'sm', variant: 'whatsapp', icon: 'whatsapp', disabled: !hasPhone, title: hasPhone ? null : 'لا يوجد رقم هاتف مسجل لهذا العميل' },
  );

  // ───────────── الأقسام ─────────────
  function profileCard() {
    return card({
      title: 'بيانات العميل',
      icon: 'user',
      actions: button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: editProfile }),
      body: kv([
        ['رقم العميل', codeTag(c.code)],
        ['الاسم', c.name],
        ['الرقم القومي', c.national_id ? ltr(c.national_id) : null],
        ['المحافظة', c.governorate],
        ['البريد', c.email ? ltr(c.email) : null],
        ['عميل منذ', date(c.created_at)],
        ['ملاحظات داخلية', c.notes ? h('span.pre', c.notes) : null],
      ]),
    });
  }

  function identitiesCard() {
    return card({
      title: 'وسائل التواصل',
      subtitle: 'كل ما يصل من هذه الأرقام والعناوين يُربط بهذا العميل',
      icon: 'link',
      actions: button('إضافة', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: addIdentity }),
      body: identities.length
        ? h(
            'ul.pa-ident.is-lg',
            identities.map((x) =>
              h(
                'li',
                icon(x.kind === 'phone' ? 'phone' : 'mail', { size: 16 }),
                h('span.pa-ident-main', ltr(x.value), h('span.small.muted', `أُضيف ${relative(x.created_at)}`)),
                x.channels && x.channels.length ? channelIcons(x.channels, { size: 14, withLabels: true }) : h('span.small.muted', 'لم تصل منه رسائل بعد'),
              ),
            ),
          )
        : emptyState('لا توجد وسائل تواصل مسجلة', null, { compact: true, icon: 'phone' }),
    });
  }

  function portalCard() {
    return card({
      title: 'بوابة العميل',
      subtitle: 'رابط آمن يتابع منه العميل ملفاته ويرد على الطلبات ويرفع المستندات دون كلمة مرور',
      icon: 'globe',
      body: h('div.stack-sm', h('div.btn-group', genBtn, sendBtn), portalHost),
    });
  }

  function mergeCard() {
    return card({
      title: 'عميل مكرر؟',
      icon: 'users',
      body: h(
        'div.stack-sm',
        h('p.small.muted', 'إذا كان نفس الشخص مسجلًا برقم عميل آخر (مثلًا تواصل من رقم هاتف مختلف)، ادمج ذلك الرقم في هذا العميل ليصبح له تاريخ واحد.'),
        button('دمج عميل مكرر في هذا العميل', { size: 'sm', icon: 'users', onClick: mergeDuplicate }),
      ),
    });
  }

  function historyCard() {
    const items = [];
    for (const i of intakes) {
      items.push({
        at: i.created_at,
        title: h(
          'span.pa-tl-title',
          h('a', { href: `#/inbox/${i.id}` }, 'طلب وارد ', codeTag(i.code)),
          statusBadge('intake_status', i.status),
        ),
        body: h(
          'span.pa-tl-body',
          h('span', i.title || 'بدون موضوع محدد'),
          h('span.pa-tl-meta', i.first_channel && channelIcons([i.first_channel], { size: 13, withLabels: true }), i.source && statusBadge('source', i.source, { dot: false })),
        ),
        icon: 'inbox',
        tone: 'info',
      });
    }
    for (const k of cases) {
      items.push({
        at: k.created_at,
        title: h('span.pa-tl-title', h('a', { href: `#/cases/${k.id}` }, 'ملف استشارة ', codeTag(k.code)), statusBadge('case_status', k.status)),
        body: h(
          'span.pa-tl-body',
          h('span', k.title),
          h(
            'span.pa-tl-meta',
            k.legal_area && badge(areaLabel(k.legal_area), 'primary'),
            k.outcome && badge(label('case_outcome', k.outcome), 'neutral'),
            k.closed_at && h('span.small.muted', `أُغلق في ${date(k.closed_at)}`),
          ),
        ),
        icon: 'briefcase',
        tone: 'primary',
      });
    }
    for (const m of matters) {
      items.push({
        at: m.opened_at,
        title: h('span.pa-tl-title', h('a', { href: `#/matters/${m.id}` }, 'ملف مستمر ', codeTag(m.code)), statusBadge('matter_status', m.status)),
        body: h(
          'span.pa-tl-body',
          h('span', m.title),
          h('span.pa-tl-meta', m.kind && badge(label('matter_kind', m.kind), 'accent'), m.closed_at && h('span.small.muted', `أُغلق في ${date(m.closed_at)}`)),
        ),
        icon: 'gavel',
        tone: 'accent',
      });
    }
    items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return card({
      title: 'تاريخ العلاقة مع المؤسسة',
      subtitle: 'الطلبات وملفات الاستشارة والملفات المستمرة مرتبة من الأحدث',
      icon: 'clock',
      body: timeline(
        items.map((x) => ({ time: x.at, title: x.title, body: x.body, icon: x.icon, tone: x.tone })),
        { empty: 'لا توجد طلبات أو ملفات لهذا العميل بعد' },
      ),
    });
  }

  function invoicesCard() {
    const open = invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status));
    const due = open.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    return card({
      title: 'الفواتير',
      icon: 'wallet',
      subtitle: open.length ? `فواتير غير مسددة بالكامل: ${open.length} — بقيمة ${money(due)}` : null,
      flush: invoices.length > 0,
      body: invoices.length
        ? table({
            caption: 'فواتير العميل',
            columns: [
              { key: 'number', label: 'رقم الفاتورة', render: (r) => codeTag(r.number) },
              { key: 'description', label: 'البيان', className: 'col-wide' },
              { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => h('span.nowrap', money(r.amount)) },
              {
                key: 'due_at',
                label: 'الاستحقاق',
                render: (r) =>
                  h('span.pa-cell-stack', h('span.nowrap', date(r.due_at)), ['unpaid', 'partially_paid'].includes(r.status) && r.due_at ? dueBadge(r.due_at) : null),
              },
              { key: 'status', label: 'الحالة', render: (r) => statusBadge('invoice_status', r.status) },
            ],
            rows: invoices,
          })
        : emptyState('لا توجد فواتير لهذا العميل', null, { compact: true, icon: 'wallet' }),
    });
  }

  function activityCard() {
    const items = (d.activity || []).map((a) => ({
      time: a.created_at,
      title: a.summary,
      actor: a.actor_name || label('actor_kind', a.actor_kind),
      tone: ACTOR_TONES[a.actor_kind] || 'neutral',
    }));
    return card({ title: 'سجل النشاط', subtitle: 'آخر 50 حدثًا', icon: 'clock', body: timeline(items) });
  }

  function withId(el, id) {
    el.id = id;
    el.tabIndex = -1;
    return el;
  }

  const openCases = cases.filter((k) => k.status !== 'closed').length;
  const openMatters = matters.filter((m) => m.status !== 'closed').length;
  const stats = h(
    'div.stats-grid.pa-stats.pa-stats-sm',
    statCard({ label: 'الطلبات الواردة', value: num(intakes.length), icon: 'inbox', tone: 'info' }),
    statCard({ label: 'ملفات الاستشارة', value: num(cases.length), hint: openCases ? `المفتوحة: ${openCases}` : 'لا ملفات مفتوحة', icon: 'briefcase', tone: 'primary' }),
    statCard({ label: 'الملفات المستمرة', value: num(matters.length), hint: openMatters ? `المفتوحة: ${openMatters}` : null, icon: 'gavel', tone: 'accent' }),
    statCard({
      label: 'فواتير غير مسددة',
      value: num(invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status)).length),
      icon: 'wallet',
      tone: invoices.some((i) => ['unpaid', 'partially_paid'].includes(i.status)) ? 'warning' : 'neutral',
    }),
  );

  const phone = identities.find((x) => x.kind === 'phone');
  const header = pageHeader({
    title: c.name || 'عميل بدون اسم',
    breadcrumbs: [{ label: 'العملاء', href: '#/clients' }, { label: c.code }],
    meta: [
      codeTag(c.code),
      phone && h('span.pa-chan-line', icon('phone', { size: 14 }), ltr(phone.value)),
      c.governorate && h('span.pa-chan-line', icon('mapPin', { size: 14 }), c.governorate),
      h('span.small.muted', { title: dateTime(c.created_at) }, `عميل منذ ${date(c.created_at)}`),
    ],
    actions: [
      button('تعديل البيانات', { icon: 'edit', onClick: editProfile }),
      button('دمج عميل مكرر', { variant: 'ghost', icon: 'users', onClick: mergeDuplicate }),
    ],
  });

  return h(
    'div.pa-page.pa-page-client',
    header,
    stats,
    h(
      'div.detail-layout',
      h('div.detail-main', historyCard(), invoicesCard(), activityCard()),
      h('div.detail-side', withId(profileCard(), 'pa-profile'), withId(identitiesCard(), 'pa-identities'), portalCard(), mergeCard()),
    ),
  );
}
