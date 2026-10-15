// ملف العميل: بياناته، وسائل التواصل المرتبطة به (هاتف/بريد عبر كل القنوات)، تاريخ علاقته بالمؤسسة
// (طلبات ← ملفات استشارة ← ملفات مستمرة)، الفواتير، رابط البوابة، ودمج العملاء المكررين.

import { h, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, areaLabel, governorateOptions, relative, dateTime, date, money, num, count, normalizeEgPhone, toLatinDigits } from '../../../lib/fmt.js';
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
import { beneficiaryCard } from '../../components/beneficiary.js'; // v9 practice
import { MERGE_LABEL } from '../../labels.js';

const ACTOR_TONES = { ai: 'accent', client: 'info', staff: 'primary', lawyer: 'info', system: 'muted' };

export default async function render(ctx) {
  const d = await api.get(`/admin/clients/${encodeURIComponent(ctx.params.id)}`);
  const c = d.client;
  // v10 b2b-staff (STF-10، L-18): العميل الداخلي لشركة عميلة لا يُدار كمستفيد/ة — سطر واحد ورابط صفحة الشركة
  if (d.company || c.company_id) {
    const co = d.company || { id: c.company_id, name: c.name };
    ctx.setTitle(`حساب داخلي — ${co.name}`);
    return h(
      'div.page',
      pageHeader({ title: co.name, breadcrumbs: [{ label: 'المستفيدون', href: '#/clients', tag: 'CLF-01' }, { label: c.code }], titleTag: 'CLF-02', tag: 'CLF-03' }),
      card({
        body: h(
          'div.cd-shadow',
          icon('building', { size: 24 }),
          h('p', `هذا حساب داخلي لشركة عميلة — ${co.name}`),
          button('فتح صفحة الشركة', { variant: 'primary', icon: 'building', href: `#/companies/${co.id}`, tag: 'CLF-04' }),
        ),
        tag: 'CLF-05',
      }),
    );
  }
  const base = `/admin/clients/${c.id}`;
  const identities = d.identities || [];
  const intakes = d.intakes || [];
  const cases = d.cases || [];
  const matters = d.matters || [];
  const invoices = d.invoices || [];
  const hasPhone = identities.some((x) => x.kind === 'phone');
  ctx.setTitle(`ملف المستفيد/ة ${c.code}`);

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
      title: 'تعديل بيانات المستفيد/ة',
      size: 'lg',
      values: { name: c.name, national_id: c.national_id, governorate: c.governorate, email: c.email, notes: c.notes, address_form: c.address_form || '' },
      fields: [
        { name: 'name', label: 'الاسم', maxLength: 150, tag: 'CLF-06' },
        // v9.1 b-portal (B91-02): صيغة المخاطبة في صفحة المتابعة ورسائل واتساب
        {
          name: 'address_form',
          label: 'طريقة المخاطبة',
          type: 'select',
          placeholder: false,
          options: [
            { value: '', label: 'تلقائي من الاسم (مؤنث ما لم يبدأ بـ«أبو»)' },
            { value: 'f', label: 'مؤنث' },
            { value: 'm', label: 'مذكر' },
          ],
          hint: 'تُستخدم في صفحة المتابعة والرسائل: «صوّري الورقة» أو «صوّر الورقة».',
          tag: 'CLF-07',
        },
        { name: 'national_id', label: 'الرقم القومي', ltr: true, maxLength: 14, hint: '14 رقمًا يبدأ بـ 2 أو 3', tag: 'CLF-08' },
        { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions(), tag: 'CLF-09' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', tag: 'CLF-10' },
        { name: 'notes', label: 'ملاحظات داخلية', type: 'textarea', rows: 3, maxLength: 5000, hint: 'لا تظهر للمستفيد/ة ولا للمحامين', tag: 'CLF-11' },
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
          address_form: v.address_form || null, // v9.1 b-portal
        });
      },
      tag: 'CLF-12',
    });
    if (res) {
      toast('تم حفظ بيانات المستفيد/ة', 'success');
      await reloadAndFocus(ctx, '#pa-profile');
    }
  }

  async function addIdentity() {
    const res = await formDialog({
      title: 'إضافة وسيلة تواصل',
      intro: 'أي رسالة تصل لاحقًا من هذا الرقم أو البريد — عبر واتساب أو الموقع أو غيرهما — ستُربط تلقائيًا بهذا الملف.',
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
          tag: 'CLF-13',
        },
        { name: 'value', label: 'الرقم أو البريد', required: true, ltr: true, maxLength: 200, placeholder: '01XXXXXXXXX أو name@example.com', tag: 'CLF-14' },
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
      tag: 'CLF-15',
    });
    if (res) {
      toast('أُضيفت وسيلة التواصل للمستفيد/ة', 'success');
      await reloadAndFocus(ctx, '#pa-identities');
    }
  }

  async function mergeDuplicate() {
    const other = await pickClient({
      title: MERGE_LABEL,
      intro: 'اختر الملف المكرر (نفس الشخص مسجّل برقم أو بريد آخر). ستنتقل كل بياناته إلى هذا الملف.',
      excludeId: c.id,
    });
    if (!other) return;
    const ok = await confirmDanger({
      title: 'تأكيد الدمج',
      message: [
        'سيُنقل كل ما في الملف ',
        codeTag(other.code),
        other.name ? ` (${other.name})` : '',
        ' — الأرقام والطلبات والملفات والرسائل والفواتير — إلى هذا الملف ',
        codeTag(c.code),
        '، ويتوقف استخدام الرقم ',
        codeTag(other.code),
        '. لا يمكن التراجع عن الدمج.',
      ],
      confirmLabel: 'نعم، ادمج في هذا الملف',
      tag: 'CLF-16',
    });
    if (!ok) return;
    await run(async () => {
      await api.post(`${base}/merge`, { other_client_id: other.id });
      toast(`تم دمج الملف ${other.code} في ${c.code}`, 'success');
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
        h('label.field-label', { htmlFor: 'pa-portal-url' }, 'الرابط الخاص بالمستفيد/ة'),
        h(
          'div.pa-url-row',
          h('input.input#pa-portal-url', { type: 'text', readonly: true, dir: 'ltr', value: absolute, onFocus: (e) => e.target.select(), tag: 'CLF-17' }),
          copyButton(absolute, 'نسخ', { variant: 'secondary', tag: 'CLF-18' }),
        ),
        h('p.field-hint', 'شارك الرابط مع المستفيد/ة فقط؛ من يملكه يستطيع الاطلاع على ملفاته والرد على الطلبات.'),
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
    { size: 'sm', icon: 'link', tag: 'CLF-19' },
  );
  const sendBtn = asyncButton(
    'إرسال عبر واتساب',
    async () => {
      const ok = await confirmDialog({
        title: 'إرسال رابط البوابة للمستفيد/ة',
        message: `سيُنشأ رابط جديد ويُرسل للمستفيد/ة ${c.name || c.code} عبر واتساب من رقم المؤسسة.`,
        confirmLabel: 'إرسال الرابط',
        tag: 'CLF-20',
      });
      if (!ok) return;
      const res = await api.post(`${base}/portal-link`, { send: true });
      showPortalUrl(res.url);
      toast(res.message_id ? 'أُرسل الرابط للمستفيد/ة (يظهر كإرسال تجريبي إن لم تُضبط بيانات واتساب)' : 'أُنشئ الرابط', 'success');
    },
    { size: 'sm', variant: 'whatsapp', icon: 'whatsapp', disabled: !hasPhone, title: hasPhone ? null : 'لا يوجد رقم هاتف مسجل لهذا المستفيد/ة', tag: 'CLF-21' },
  );

  // ───────────── الأقسام ─────────────
  function profileCard() {
    return card({
      title: 'بيانات المستفيد/ة',
      icon: 'user',
      actions: button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: editProfile, tag: 'CLF-22' }),
      body: kv([
        ['كود المستفيد/ة', codeTag(c.code)],
        ['الاسم', c.name],
        ['الرقم القومي', c.national_id ? ltr(c.national_id) : null],
        ['المحافظة', c.governorate],
        ['البريد', c.email ? ltr(c.email) : null],
        ['طريقة المخاطبة', c.address_form === 'm' ? 'مذكر' : c.address_form === 'f' ? 'مؤنث' : null], // v9.1 b-portal
        ['مسجَّل لدينا منذ', date(c.created_at)],
        ['ملاحظات داخلية', c.notes ? h('span.pre', c.notes) : null],
      ]),
      titleTag: 'CLF-23',
      tag: 'CLF-24',
    });
  }

  function identitiesCard() {
    return card({
      title: 'وسائل التواصل',
      subtitle: 'كل ما يصل من هذه الأرقام والعناوين يُربط بهذا الملف',
      icon: 'link',
      actions: button('إضافة', { variant: 'ghost', size: 'sm', icon: 'plus', onClick: addIdentity, tag: 'CLF-25' }),
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
        : emptyState('لا توجد وسائل تواصل مسجلة', null, { compact: true, icon: 'phone', tag: 'CLF-26' }),
        titleTag: 'CLF-27',
        tag: 'CLF-28',
    });
  }

  const activeLinks = Number(d.active_portal_links ?? c.active_portal_links) || 0;
  async function revokePortal() {
    const ok = await confirmDanger({
      title: 'إلغاء روابط البوابة',
      message: `ستتوقف كل روابط البوابة السارية للمستفيد/ة ${c.name || c.code} فورًا، بما فيها روابط الطلبات المرسلة من الموقع، ولن يستطيع من يملكها الاطلاع على ملفاته. يمكن إنشاء رابط جديد بعد ذلك.`,
      confirmLabel: 'نعم، إلغاء الروابط',
      tag: 'CLF-29',
    });
    if (!ok) return;
    const res = await api.post(`${base}/revoke-portal`);
    const n = Number(res && res.revoked) || 0;
    toast(n ? `أُلغي ${count(n, ['رابط واحد', 'رابطان', 'روابط', 'رابطًا'])} للبوابة` : 'لا توجد روابط سارية لإلغائها', n ? 'success' : 'info');
    await reloadAndFocus(ctx, '#pa-portal');
  }

  function portalCard() {
    return card({
      title: 'صفحة المتابعة',
      subtitle: 'رابط آمن يتابع منه المستفيد/ة ملفاته ويرد على الطلبات ويرفع المستندات دون كلمة مرور',
      icon: 'globe',
      body: h(
        'div.stack-sm',
        h('div.btn-group', genBtn, sendBtn),
        portalHost,
        activeLinks > 0 &&
          h(
            'div.stack-sm',
            h('p.small.muted', `الروابط السارية الآن: ${count(activeLinks, ['رابط واحد', 'رابطان', 'روابط', 'رابطًا'])}. ألغِها إن وصل رابط لغير صاحب الملف أو شككت في ذلك.`),
            asyncButton('إلغاء روابط البوابة', revokePortal, { size: 'sm', variant: 'danger', icon: 'x', tag: 'CLF-30' }),
          ),
      ),
      titleTag: 'CLF-31',
      tag: 'CLF-32',
    });
  }

  function mergeCard() {
    return card({
      title: 'ملف مكرر؟',
      icon: 'users',
      body: h(
        'div.stack-sm',
        h('p.small.muted', 'إذا كان نفس الشخص مسجلًا بكود مستفيد/ة آخر (مثلًا تواصل من رقم هاتف مختلف)، ادمج ذلك الملف في هذا الملف ليصبح له تاريخ واحد.'),
        button(MERGE_LABEL, { size: 'sm', icon: 'users', onClick: mergeDuplicate, tag: 'CLF-33' }),
      ),
      titleTag: 'CLF-34',
      tag: 'CLF-35',
    });
  }

  function historyCard() {
    const items = [];
    for (const i of intakes) {
      items.push({
        at: i.created_at,
        title: h(
          'span.pa-tl-title',
          h('a', { href: `#/inbox/${i.id}`, tag: 'CLF-36' }, 'طلب وارد ', codeTag(i.code)),
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
        title: h('span.pa-tl-title', h('a', { href: `#/cases/${k.id}`, tag: 'CLF-37' }, 'ملف استشارة ', codeTag(k.code)), statusBadge('case_status', k.status)),
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
        title: h('span.pa-tl-title', h('a', { href: `#/matters/${m.id}`, tag: 'CLF-38' }, 'ملف مستمر ', codeTag(m.code)), statusBadge('matter_status', m.status)),
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
        { empty: 'لا توجد طلبات أو ملفات لهذا المستفيد/ة بعد' },
      ),
      titleTag: 'CLF-39',
      tag: 'CLF-40',
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
            caption: 'فواتير المستفيد/ة',
            columns: [
              { key: 'number', label: 'رقم الفاتورة', render: (r) => codeTag(r.number), tag: 'CLF-41' },
              { key: 'description', label: 'البيان', className: 'col-wide', tag: 'CLF-42' },
              { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => h('span.nowrap', money(r.amount)), tag: 'CLF-43' },
              {
                key: 'due_at',
                label: 'الاستحقاق',
                render: (r) =>
                  h('span.pa-cell-stack', h('span.nowrap', date(r.due_at)), ['unpaid', 'partially_paid'].includes(r.status) && r.due_at ? dueBadge(r.due_at) : null),
                  tag: 'CLF-44',
              },
              { key: 'status', label: 'الحالة', render: (r) => statusBadge('invoice_status', r.status), tag: 'CLF-45' },
            ],
            rows: invoices,
            rowTag: 'CLF-46',
            tag: 'CLF-47',
          })
        : emptyState('لا توجد فواتير لهذا المستفيد/ة', null, { compact: true, icon: 'wallet', tag: 'CLF-48' }),
        titleTag: 'CLF-49',
        tag: 'CLF-50',
    });
  }

  function activityCard() {
    const items = (d.activity || []).map((a) => ({
      time: a.created_at,
      title: a.summary,
      actor: a.actor_name || label('actor_kind', a.actor_kind),
      tone: ACTOR_TONES[a.actor_kind] || 'neutral',
    }));
    return card({ title: 'سجل النشاط', subtitle: 'آخر 50 حدثًا', icon: 'clock', body: timeline(items), titleTag: 'CLF-51', tag: 'CLF-52' });
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
    statCard({ label: 'الطلبات الواردة', value: num(intakes.length), icon: 'inbox', tone: 'info', tag: 'CLF-53' }),
    statCard({ label: 'ملفات الاستشارة', value: num(cases.length), hint: openCases ? `المفتوحة: ${openCases}` : 'لا ملفات مفتوحة', icon: 'briefcase', tone: 'primary', tag: 'CLF-54' }),
    statCard({ label: 'الملفات المستمرة', value: num(matters.length), hint: openMatters ? `المفتوحة: ${openMatters}` : null, icon: 'gavel', tone: 'accent', tag: 'CLF-55' }),
    statCard({
      label: 'فواتير غير مسددة',
      value: num(invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status)).length),
      icon: 'wallet',
      tone: invoices.some((i) => ['unpaid', 'partially_paid'].includes(i.status)) ? 'warning' : 'neutral',
      tag: 'CLF-56',
    }),
  );

  const phone = identities.find((x) => x.kind === 'phone');
  const header = pageHeader({
    title: c.name || 'بدون اسم',
    breadcrumbs: [{ label: 'المستفيدون', href: '#/clients', tag: 'CLF-57' }, { label: c.code }],
    meta: [
      codeTag(c.code),
      phone && h('span.pa-chan-line', icon('phone', { size: 14 }), ltr(phone.value)),
      c.governorate && h('span.pa-chan-line', icon('mapPin', { size: 14 }), c.governorate),
      h('span.small.muted', { title: dateTime(c.created_at) }, `مسجَّل لدينا منذ ${date(c.created_at)}`),
    ],
    actions: [
      button('تعديل البيانات', { icon: 'edit', onClick: editProfile, tag: 'CLF-58' }),
      button(MERGE_LABEL, { variant: 'ghost', icon: 'users', onClick: mergeDuplicate, tag: 'CLF-59' }),
    ],
    titleTag: 'CLF-60',
    tag: 'CLF-61',
  });

  return h(
    'div.pa-page.pa-page-client',
    header,
    stats,
    h(
      'div.detail-layout',
      h('div.detail-main', historyCard(), invoicesCard(), activityCard()),
      h('div.detail-side', withId(profileCard(), 'pa-profile'), withId(beneficiaryCard({ clientId: c.id, editable: true }), 'v9p-beneficiary'), withId(identitiesCard(), 'pa-identities'), withId(portalCard(), 'pa-portal'), mergeCard()),
    ),
  );
}
