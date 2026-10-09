// v10 b2b-staff (STF-8، U10-S21) — «شركة عميلة»: صفحة الشركة لفريق المكتب بتبويبات:
// «نظرة عامة» (الحالة وتغييرها لمدير النظام، الباقة، الاستخدام كما تراه الشركة، صحة الخدمة، الطلبات المفتوحة، المواعيد،
// مدير العلاقة والملاحظات الداخلية) · «الطلبات» · «المستخدمون» (البريد والترقية إلى «مدير البوابة» وأمان الحساب لمدير
// النظام فقط، L-60) · «الكيانات والأطراف» · «الباقة والتكاليف» (مدير النظام: الاشتراك وتغييره، التكاليف وإلغاؤها
// واستبدالها بأقل، تصدير CSV) · «الذاكرة القانونية» (نموذج البوابة نفسه coMemoryForm مع ملاحظات داخلية، والحذف النهائي
// لمدير النظام) · «الفريق المفضل» · «السجل». الخادم هو المرجع في كل صلاحية؛ الواجهة تخفي ما ليس للدور وتعرض 403 بلطف.

import { h, mount } from '../../../lib/h.js';
import { api, filesToUploads, downloadFile, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, relative, dateTime, date, money, percent, count, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  badge,
  codeTag,
  kv,
  table,
  tabs,
  button,
  asyncButton,
  modal,
  form,
  formDialog,
  confirmDialog,
  icon,
  alertBox,
  toast,
  errorMessage,
  emptyState,
  loading,
  errorState,
  copyButton,
  filterBar,
  searchInput,
  selectInput,
  discardGuard,
  fileInput,
} from '../../../lib/ui.js';
import { slaChip, stageBadgeStaff, typeBadge, flagChips, clockOf } from './company-requests.js';
import { statusBadgeOf, prefixChecker, PREFIX_COPY } from './companies.js';
import { termsEditor, termsView, termsSummary, TERMS_BLANK } from '../../components/company-plan-terms.js';
import { MEMORY_KINDS, memoryKindByKey } from '../../../lib/company-catalog.js';
import { coUsageMeter } from '../../../lib/company-ui.js';

const ROLES = ['company_admin', 'member', 'viewer'];
const ADMIN_ONLY = 'للمدير فقط';
/** نص تأكيد تغيير بريد مستخدم الشركة (L-60، T22) */
export const EMAIL_CHANGE_COPY = 'سيُرسل إشعار أمني إلى البريد القديم ويُسجَّل خروج المستخدم من كل الأجهزة.';
/** جملة النسخ الاحتياطية عند الحذف النهائي (CS-18) */
export const PURGE_BACKUPS_COPY = 'تبقى نسخ من البيانات المحذوفة في النسخ الاحتياطية حتى تُستبدل.';
const SUSPEND_COPY = 'الإيقاف يجعل البوابة للاطلاع فقط للشركة.';
const POD_HINT = 'يُستخدم في ترتيب المحامين المقترحين. لا تراه الشركة ولا المحامون.';
const STATUS_TARGETS = ['active', 'past_due', 'suspended', 'ended'];
const STATUS_TARGET_LABELS = { active: 'نشطة', past_due: 'متأخرة السداد', suspended: 'موقوفة', ended: 'منتهية' };
const USER_TONE = { active: 'success', invite_pending: 'info', locked: 'warning', inactive: 'neutral' };
const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' };
const POD_ROLES = ['preferred_lead', 'preferred_reviewer', 'excluded'];
const MEMORY_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt';
const opts = (group, keys) => (keys || Object.keys({})).map((k) => ({ value: k, label: label(group, k) }));
const day = (key) => (key ? date(`${String(key).slice(0, 10)}T10:00:00Z`) : '—');
const timeOf = (iso) => (iso ? h('time', { datetime: iso, title: dateTime(iso) }, relative(iso)) : '—');
const cairoKey = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : null);

/** رسالة 403 بصياغة فريق المكتب */
function forbiddenToast(err) {
  toast(err?.status === 403 ? 'هذا الإجراء متاح لدور «إدارة النظام» فقط.' : errorMessage(err), 'danger');
}

export default async function render(ctx) {
  const id = ctx.params.id;
  const user = ctx.user || {};
  const isAdmin = user.role === 'admin';
  let c = await api.get(`/admin/companies/${encodeURIComponent(id)}`);
  const headerHost = h('div');
  let tabsEl = null;

  async function reload(tab) {
    c = await api.get(`/admin/companies/${encodeURIComponent(id)}`);
    drawHeader();
    if (tabsEl) tabsEl.refresh(tab);
  }

  function drawHeader() {
    const co = c.company;
    mount(
      headerHost,
      pageHeader({
        title: co.name,
        breadcrumbs: [{ label: 'الشركات العميلة', href: '#/companies' }, { label: co.name }],
        meta: h('div.cr-meta', codeTag(co.prefix), codeTag(co.code), statusBadgeOf(co), co.read_only ? badge('البوابة للاطلاع فقط', 'warning', { icon: 'alert' }) : null),
        actions: isAdmin ? button('تعديل بيانات الشركة', { variant: 'secondary', icon: 'edit', onClick: () => editCompany() }) : null,
      }),
    );
  }

  // ───────────── تعديل بيانات الشركة (A) ─────────────
  async function editCompany() {
    const co = c.company;
    const s = co.settings || {};
    const prefix = prefixChecker({ companyId: co.id, current: co.prefix });
    await formDialog({
      title: 'تعديل بيانات الشركة',
      size: 'lg',
      fields: [
        { name: 'name', label: 'الاسم المعروض', required: true, maxLength: 150, dir: 'auto' },
        { name: 'prefix', label: 'البادئة', required: true, ltr: true, readonly: !!co.prefix_locked, hint: co.prefix_locked ? PREFIX_COPY.locked : 'حروف لاتينية كبيرة من 2 إلى 5' },
        { name: 'legal_name', label: 'الاسم القانوني', maxLength: 200, dir: 'auto' },
        { name: 'commercial_registry', label: 'السجل التجاري', maxLength: 60, ltr: true },
        { name: 'tax_id', label: 'البطاقة الضريبية', maxLength: 60, ltr: true },
        { name: 'industry', label: 'النشاط', maxLength: 120 },
        { name: 'address', label: 'العنوان', maxLength: 300, full: true },
        co.status === 'trial' && { name: 'trial_ends_at', label: 'نهاية الفترة التجريبية', type: 'date', endOfDay: true },
        { name: 'default_visibility', label: 'الظهور الافتراضي للطلبات الجديدة', type: 'select', required: true, placeholder: false, options: opts('company_visibility', ['company', 'private']) },
        {
          name: 'quote_approvers',
          label: 'من يوافق على عروض الأسعار',
          type: 'select',
          required: true,
          placeholder: false,
          options: [
            { value: 'admins', label: 'مديرو البوابة فقط' },
            { value: 'admins_or_submitter', label: 'مديرو البوابة أو مرسل الطلب' },
          ],
        },
        { name: 'show_account_manager', type: 'checkbox', text: 'إظهار اسم مدير العلاقة للشركة («مدير علاقتكم لدينا»)' },
        { name: 'require_2fa', type: 'checkbox', text: 'إلزام كل مستخدمي الشركة بالتحقق بخطوتين' },
      ],
      values: {
        name: co.name,
        prefix: co.prefix,
        legal_name: co.legal_name,
        commercial_registry: co.commercial_registry,
        tax_id: co.tax_id,
        industry: co.industry,
        address: co.address,
        trial_ends_at: co.trial_ends_at,
        default_visibility: s.default_visibility || 'company',
        quote_approvers: s.quote_approvers || 'admins',
        show_account_manager: s.show_account_manager !== false,
        require_2fa: !!co.require_2fa,
      },
      setup: (f) => {
        if (!co.prefix_locked) {
          prefix.attach(f.control('prefix').input);
          f.control('prefix').wrap.append(prefix.status);
        }
      },
      onSubmit: async (v, f) => {
        if (!co.prefix_locked && v.prefix !== co.prefix && !(await prefix.check())) {
          f.setErrors({ prefix: PREFIX_COPY[prefix.reason()] || PREFIX_COPY.invalid });
          throw new Error(PREFIX_COPY[prefix.reason()] || PREFIX_COPY.invalid);
        }
        const body = {
          name: v.name,
          legal_name: v.legal_name || null,
          commercial_registry: v.commercial_registry || null,
          tax_id: v.tax_id || null,
          industry: v.industry || null,
          address: v.address || null,
          require_2fa: !!v.require_2fa,
          settings: { default_visibility: v.default_visibility, quote_approvers: v.quote_approvers, show_account_manager: !!v.show_account_manager },
        };
        if (!co.prefix_locked) body.prefix = String(v.prefix || '').toUpperCase();
        if (co.status === 'trial' && v.trial_ends_at) body.trial_ends_at = v.trial_ends_at;
        c = await api.patch(`/admin/companies/${co.id}`, body);
        drawHeader();
        tabsEl?.refresh('overview');
        toast('حُفظت بيانات الشركة.', 'success');
      },
    });
  }

  // ───────────── «نظرة عامة» ─────────────
  async function overview() {
    const co = c.company;
    const sub = c.subscription;
    const [usage, open] = await Promise.all([
      api.get(`/admin/companies/${co.id}/usage`).catch(() => null),
      api.get('/admin/company-requests', { company_id: co.id, status: 'open' }).catch(() => ({ items: [] })),
    ]);
    const q = usage?.quota || c.quota;
    const sla = usage?.usage?.sla || {};
    const upcoming = usage?.usage?.upcoming_renewals || c.memory?.upcoming || [];
    const pct = (x) => (x == null ? '—' : percent(x));

    const statusCard = card({
      title: 'الحالة والاشتراك',
      icon: 'building',
      actions: isAdmin ? button('تغيير الحالة', { variant: 'secondary', size: 'sm', onClick: () => changeStatus() }) : null,
      body: h(
        'div.stack',
        kv(
          [
            ['الحالة', h('span.cr-meta', statusBadgeOf(co), co.status_reason ? h('span.muted', { dir: 'auto' }, co.status_reason) : null)],
            co.trial_ends_at ? ['تنتهي التجربة', h('span', day(cairoKey(co.trial_ends_at)), ' · ', timeOf(co.trial_ends_at))] : null,
            ['الباقة', sub ? `${sub.plan_name} (${sub.period_label})` : 'بلا اشتراك نشط'],
            sub ? ['بداية الاشتراك', day(sub.starts_on)] : null,
            sub ? ['الفترة التالية تبدأ', day(sub.next_period_starts)] : null,
            sub ? ['الشروط', termsSummary(sub.terms || {}, { money: isAdmin })] : null,
          ].filter(Boolean),
          { columns: 2 },
        ),
        co.read_only ? alertBox('البوابة للاطلاع فقط: لا تستطيع الشركة إرسال طلبات أو الرد الآن.', 'warning') : null,
      ),
    });

    const usageCard = card({
      title: 'الاستخدام في الدورة الحالية',
      icon: 'chart',
      subtitle: q ? `${day(q.cycle_start)} – ${day(q.cycle_end)}` : null,
      body: h(
        'div.stack',
        h('div.cs-preview-card.cs-usage', h('p.cs-sub', 'كما تراه الشركة'), coUsageMeter(q, { showPrices: isAdmin, policy: q?.policy, price: q?.overage_price, hasManager: !!co.account_manager })),
        kv(
          [
            ['الطلبات العاجلة', q?.urgent_included == null ? `${q?.urgent_used ?? 0} — غير محدودة` : h('span.num', `${q.urgent_used ?? 0} من ${q.urgent_included}`)],
            ['بانتظار الاحتساب', h('span.num', String(q?.pending ?? 0))],
            ['صحة الخدمة هذا الشهر', `الرد الأول في الموعد ${pct(sla.first_response_met_rate)} · التسليم في الموعد ${pct(sla.delivery_met_rate)}`],
            usage?.usage?.satisfaction?.count ? ['رضا الشركة', `${usage.usage.satisfaction.avg_rating?.toFixed?.(1) ?? '—'} من 5 (${count(usage.usage.satisfaction.count, ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييمًا'])})`] : null,
          ].filter(Boolean),
          { columns: 2 },
        ),
      ),
    });

    const openCard = card({
      title: 'الطلبات المفتوحة',
      icon: 'inboxStack',
      actions: button('كل الطلبات', { variant: 'ghost', size: 'sm', onClick: () => tabsEl.setActive('requests') }),
      body: (open.items || []).length
        ? h(
            'ul.cr-rows',
            open.items.slice(0, 8).map((r) =>
              h(
                'li.cr-row',
                codeTag(r.code),
                h('div.cr-row-main', h('a', { href: `#/company-requests/${r.id}`, dir: 'auto' }, r.title), h('span.muted', r.type_label)),
                stageBadgeStaff(r),
                slaChip(r.sla, { withDue: false, compact: true, clock: clockOf(r) }),
              ),
            ),
          )
        : emptyState('لا طلبات مفتوحة لهذه الشركة.', null, { compact: true, icon: 'checkCircle' }),
    });

    const renewalsCard = card({
      title: 'مواعيد قادمة',
      icon: 'calendarClock',
      body: upcoming.length
        ? h(
            'ul.cr-rows',
            upcoming.slice(0, 8).map((m) =>
              h(
                'li.cr-row',
                badge(m.kind_label, 'neutral', { className: 'badge-outline' }),
                h('div.cr-row-main', h('a', { href: `#/companies/${co.id}?tab=memory&item=${m.memory_id || m.id}`, dir: 'auto', onClick: (e) => (e.preventDefault(), openMemoryItem({ mid: m.memory_id || m.id, company: c, user, onDone: () => reload() })) }, m.title), h('span.muted', `${dateKindLabel(m.date_kind)} ${day(m.date || m.next_date)}`)),
                m.days_left != null ? badge(m.days_left <= 7 ? `خلال ${count(m.days_left, 'day')}` : `بعد ${count(m.days_left, 'day')}`, m.days_left <= 7 ? 'warning' : 'neutral', { icon: 'clock' }) : null,
              ),
            ),
          )
        : emptyState('لا مواعيد خلال الشهرين القادمين.', null, { compact: true, icon: 'calendar' }),
    });

    // مدير العلاقة والملاحظات الداخلية (التعديل لمدير النظام)
    const notes = h('textarea.input', { rows: 4, maxlength: 3000, dir: 'auto', readonly: !isAdmin, 'aria-label': 'ملاحظات داخلية' });
    notes.value = co.notes_internal || '';
    let staff = [];
    if (isAdmin) staff = await api.get('/admin/staff').catch(() => []);
    const amSel = isAdmin
      ? h(
          'select.input',
          { 'aria-label': 'مدير العلاقة' },
          staff.filter((s) => s.role === 'admin' || s.role === 'case_manager').map((s) => h('option', { value: String(s.id), selected: co.account_manager?.id === s.id }, `${s.name} — ${label('user_role', s.role)}`)),
        )
      : null;
    const relCard = card({
      title: 'مدير العلاقة والملاحظات',
      icon: 'userCog',
      body: h(
        'div.stack',
        isAdmin ? h('div.field', h('label.field-label', 'مدير العلاقة'), h('div.select-wrap', amSel), h('p.field-hint', 'يراه مديرو البوابة باسمه: «مدير علاقتكم لدينا» (إن كان الإظهار مفعّلًا).')) : kv([['مدير العلاقة', co.account_manager?.name || '—']]),
        h('div.field', h('label.field-label', 'ملاحظات داخلية'), notes, h('p.field-hint', 'لفريق المكتب فقط؛ لا تراها الشركة ولا المحامون.')),
        isAdmin
          ? h(
              'div.form-actions',
              asyncButton('حفظ', async () => {
                const body = { notes_internal: notes.value.trim() || null };
                if (amSel && Number(amSel.value) !== co.account_manager?.id) body.account_manager_id = Number(amSel.value);
                try {
                  c = await api.patch(`/admin/companies/${co.id}`, body);
                  drawHeader();
                  toast('حُفظ.', 'success');
                } catch (err) {
                  forbiddenToast(err);
                }
              }, { variant: 'primary' }),
            )
          : null,
      ),
    });

    return h('div.cd-grid', h('div.cd-col', statusCard, usageCard, openCard), h('div.cd-col', relCard, renewalsCard, conflictsCard()));
  }

  function conflictsCard() {
    const list = c.conflicts || [];
    if (!list.length) return null;
    return card({
      title: 'تشابه أسماء محتمل',
      icon: 'alert',
      body: h(
        'ul.cr-list',
        list.slice(0, 6).map((m) => h('li', h('span', { dir: 'auto' }, m.client?.name || m.party?.name || m.name || ''), m.reason ? h('span.muted', ` — ${m.reason}`) : null)),
      ),
    });
  }

  async function changeStatus() {
    const co = c.company;
    await formDialog({
      title: 'تغيير حالة الشركة',
      intro: SUSPEND_COPY,
      fields: [
        { name: 'status', label: 'الحالة الجديدة', type: 'select', required: true, options: STATUS_TARGETS.filter((s) => s !== co.status).map((s) => ({ value: s, label: STATUS_TARGET_LABELS[s] })) },
        { name: 'reason', label: 'السبب', type: 'textarea', required: true, maxLength: 500, rows: 3 },
      ],
      submitLabel: 'تغيير الحالة',
      onSubmit: async (v) => {
        c = await api.post(`/admin/companies/${co.id}/status`, { status: v.status, reason: v.reason });
        drawHeader();
        tabsEl?.refresh('overview');
        toast(`أصبحت حالة ${co.name}: ${c.company.status_label}.`, 'success');
      },
    });
  }

  // ───────────── «الطلبات» ─────────────
  async function requestsTab() {
    const host = h('div');
    let status = 'all';
    let qText = '';
    async function load() {
      mount(host, loading());
      try {
        const res = await api.get('/admin/company-requests', { company_id: c.company.id, status, q: qText || undefined });
        tabsEl?.setCount('requests', status === 'all' && !qText ? res.items?.length ?? 0 : undefined);
        mount(
          host,
          card({
            flush: true,
            body: table({
              caption: 'طلبات الشركة',
              stack: true,
              rows: res.items || [],
              empty: 'لا طلبات تطابق هذا الاختيار.',
              onRowClick: (r) => ctx.navigate(`/company-requests/${r.id}`),
              columns: [
                { key: 'code', label: 'الطلب', render: (r) => h('div.cq-cell-req', codeTag(r.code), h('a', { href: `#/company-requests/${r.id}`, dir: 'auto' }, r.title)) },
                { key: 'type', label: 'النوع', render: (r) => typeBadge(r.type, r.type_label) },
                { key: 'status', label: 'الحالة', render: (r) => h('div.cq-cell-st', stageBadgeStaff(r), flagChips(r.flags)) },
                { key: 'sla', label: 'الموعد', render: (r) => slaChip(r.sla, { withDue: false, clock: clockOf(r) }) },
                { key: 'priority', label: 'الأولوية', render: (r) => r.priority_label || label('priority', r.priority) },
                { key: 'handler', label: 'المسؤول', render: (r) => r.handler?.name || '—' },
                { key: 'updated', label: 'آخر تحديث', render: (r) => timeOf(r.updated_at) },
              ],
            }),
          }),
        );
      } catch (err) {
        mount(host, errorState(err, load));
      }
    }
    await load();
    return h(
      'div.stack',
      filterBar([
        selectInput({
          label: 'الحالة',
          allLabel: 'كل الطلبات',
          options: [
            { value: 'open', label: 'المفتوحة' },
            { value: 'closed', label: 'المغلقة' },
          ],
          value: '',
          onChange: (v) => ((status = v || 'all'), load()),
        }),
        searchInput({ label: 'بحث في طلبات الشركة', placeholder: 'كود الطلب أو عنوانه', onSearch: (v) => ((qText = v), load()) }),
      ]),
      host,
    );
  }

  // ───────────── «المستخدمون» ─────────────
  async function usersTab() {
    const res = await api.get(`/admin/companies/${c.company.id}/users`);
    const items = res.items || [];
    const activeAdmins = items.filter((u) => u.role === 'company_admin' && u.active && u.state !== 'invite_pending').length;
    const maxUsers = c.subscription?.terms?.max_users ?? null;
    const activeCount = items.filter((u) => u.active).length;
    return card({
      title: 'المستخدمون',
      subtitle: maxUsers == null ? `${count(activeCount, ['مستخدم نشط', 'مستخدمَين نشطَين', 'مستخدمين نشطين', 'مستخدمًا نشطًا'])}` : `${activeCount} من ${maxUsers} في الباقة`,
      icon: 'users',
      actions: c.company.read_only ? null : button('دعوة مستخدم', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => inviteUser({ activeAdmins }) }),
      flush: true,
      body: table({
        caption: 'مستخدمو بوابة الشركة',
        stack: true,
        rows: items,
        empty: 'لا مستخدمين بعد.',
        columns: [
          {
            key: 'name',
            label: 'المستخدم',
            render: (u) => h('div.cq-cell-req', h('strong', { dir: 'auto' }, u.name), u.job_title ? h('span.muted', { dir: 'auto' }, u.job_title) : null),
          },
          { key: 'contact', label: 'البريد والهاتف', render: (u) => h('div.cq-cell-req', h('bdi', { dir: 'ltr' }, u.email), u.phone ? h('bdi.muted', { dir: 'ltr' }, u.phone) : null) },
          {
            key: 'role',
            label: 'الدور',
            render: (u) => h('div.cq-cell-st', badge(u.role_label, u.role === 'company_admin' ? 'primary' : 'neutral', { className: 'badge-outline' }), u.billing_contact ? badge('جهة الفواتير', 'neutral', { className: 'badge-outline' }) : null),
          },
          { key: 'state', label: 'الحالة', render: (u) => h('div.cq-cell-st', badge(u.state_label, USER_TONE[u.state] || 'neutral', { dot: true }), u.two_factor ? badge('تحقق بخطوتين', 'success', { icon: 'shieldCheck' }) : null) },
          { key: 'last', label: 'آخر دخول', render: (u) => timeOf(u.last_login_at) },
          { key: 'actions', label: 'إجراءات', render: (u) => userActions(u, { activeAdmins }) },
        ],
      }),
    });
  }

  function userActions(u, { activeAdmins }) {
    const btns = [button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: () => editUser(u, { activeAdmins }) })];
    if (u.state === 'invite_pending' && u.active) btns.push(button('إعادة إرسال الدعوة', { variant: 'ghost', size: 'sm', icon: 'send', onClick: () => resendInvite(u) }));
    if (isAdmin) btns.push(button('أمان الحساب', { variant: 'ghost', size: 'sm', icon: 'shieldCheck', onClick: () => securityMenu(u) }));
    return h('div.cd-actions', btns);
  }

  function inviteResult(res, who) {
    const inv = res.invite || {};
    if (inv.emailed) {
      toast(`أرسلنا الدعوة إلى ${who}.`, 'success');
      return;
    }
    if (inv.url) {
      modal({
        title: 'رابط الدعوة',
        size: 'md',
        body: h(
          'div.cs-invite',
          alertBox('البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط.', 'warning'),
          h('div.cs-invite-link', h('input.input', { type: 'text', readonly: true, dir: 'ltr', value: inv.url, 'aria-label': 'رابط الدعوة' }), copyButton(inv.url, 'نسخ', { variant: 'secondary', size: 'md' })),
        ),
        actions: [{ label: 'تم', variant: 'primary' }],
      });
    }
  }

  async function inviteUser({ activeAdmins }) {
    const blockAdmin = !isAdmin && activeAdmins > 0;
    await formDialog({
      title: 'دعوة مستخدم',
      intro: 'يصله رابط ليختار كلمة مروره ويقبل شروط الخدمة.',
      fields: [
        { name: 'name', label: 'الاسم', required: true, minLength: 2, maxLength: 120, dir: 'auto' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', required: true },
        { name: 'job_title', label: 'الوظيفة', maxLength: 120 },
        { name: 'phone', label: 'الهاتف', type: 'phone' },
        {
          name: 'role',
          label: 'الدور',
          type: 'select',
          required: true,
          placeholder: false,
          options: ROLES.map((r) => ({ value: r, label: r === 'company_admin' && blockAdmin ? `${label('company_user_role', r)} — ${ADMIN_ONLY}` : label('company_user_role', r), disabled: r === 'company_admin' && blockAdmin })),
          hint: blockAdmin ? `دعوة «مدير بوابة» ثانٍ: ${ADMIN_ONLY}.` : null,
        },
        { name: 'billing_contact', type: 'checkbox', text: 'جهة الفواتير (تتلقى إشعارات التكاليف الإضافية)' },
      ],
      values: { role: 'member' },
      submitLabel: 'إرسال الدعوة',
      onSubmit: async (v) => {
        const res = await api.post(`/admin/companies/${c.company.id}/users`, { ...v, job_title: v.job_title || undefined, phone: v.phone || undefined, billing_contact: !!v.billing_contact });
        tabsEl.refresh('users');
        inviteResult(res, v.email);
      },
    });
  }

  async function editUser(u, { activeAdmins }) {
    const canPromote = isAdmin || u.role === 'company_admin';
    const res = await formDialog({
      title: `تعديل ${u.name}`,
      fields: [
        { name: 'name', label: 'الاسم', required: true, minLength: 2, maxLength: 120, dir: 'auto' },
        { name: 'job_title', label: 'الوظيفة', maxLength: 120 },
        { name: 'phone', label: 'الهاتف', type: 'phone' },
        {
          name: 'email',
          label: 'البريد الإلكتروني',
          type: 'email',
          required: true,
          disabled: !isAdmin,
          hint: isAdmin ? EMAIL_CHANGE_COPY : `تغيير البريد: ${ADMIN_ONLY}.`,
        },
        {
          name: 'role',
          label: 'الدور',
          type: 'select',
          required: true,
          placeholder: false,
          options: ROLES.map((r) => ({ value: r, label: r === 'company_admin' && !canPromote ? `${label('company_user_role', r)} — ${ADMIN_ONLY}` : label('company_user_role', r), disabled: r === 'company_admin' && !canPromote })),
          hint: canPromote ? null : `الترقية إلى «مدير البوابة»: ${ADMIN_ONLY}.`,
        },
        { name: 'billing_contact', type: 'checkbox', text: 'جهة الفواتير (تتلقى إشعارات التكاليف الإضافية)' },
        { name: 'active', type: 'checkbox', text: 'الحساب نشط' },
      ],
      values: { name: u.name, job_title: u.job_title, phone: u.phone, email: u.email, role: u.role, billing_contact: !!u.billing_contact, active: !!u.active },
      onSubmit: async (v) => {
        const body = {};
        if (v.name !== u.name) body.name = v.name;
        if ((v.job_title || null) !== (u.job_title || null)) body.job_title = v.job_title || null;
        if ((v.phone || null) !== (u.phone || null)) body.phone = v.phone || null;
        if (v.role !== u.role) body.role = v.role;
        if (!!v.billing_contact !== !!u.billing_contact) body.billing_contact = !!v.billing_contact;
        if (!!v.active !== !!u.active) body.active = !!v.active;
        const emailChange = isAdmin && v.email && v.email.toLowerCase() !== String(u.email).toLowerCase();
        if (emailChange) {
          const ok = await confirmDialog({ title: 'تغيير البريد الإلكتروني', message: EMAIL_CHANGE_COPY, confirmLabel: 'تغيير البريد' });
          if (!ok) throw new Error('أُلغي تغيير البريد.');
          body.email = v.email;
        }
        if (u.role === 'company_admin' && v.role !== 'company_admin' && u.active && activeAdmins <= 1) {
          throw new Error('يجب أن يبقى للشركة مدير بوابة واحد نشط على الأقل. عيّن مديرًا آخر أولًا.');
        }
        if (!Object.keys(body).length) return {};
        return api.patch(`/admin/company-users/${u.id}`, body);
      },
    });
    if (res) {
      tabsEl.refresh('users');
      toast('حُفظ. أُبلغ مديرو البوابة بالتعديل.', 'success');
    }
  }

  async function resendInvite(u) {
    try {
      const res = await api.post(`/admin/company-users/${u.id}/invite`, {});
      inviteResult(res, u.email);
      tabsEl.refresh('users');
    } catch (err) {
      forbiddenToast(err);
    }
  }

  function securityMenu(u) {
    const run = async (path, { title, message, done, danger = true }) => {
      const ok = await confirmDialog({ title, message, confirmLabel: title, danger });
      if (!ok) return;
      try {
        const res = await api.post(`/admin/company-users/${u.id}/${path}`, {});
        m.close();
        if (path === 'reset-link') {
          const r = res.reset || {};
          if (r.url) {
            modal({
              title: 'رابط تعيين كلمة المرور',
              body: h(
                'div.cs-invite',
                alertBox(r.emailed ? 'أرسلنا الرابط بالبريد أيضًا. انسخه الآن إن احتجت — يظهر الآن فقط.' : 'البريد غير مُعدّ: انسخ الرابط وأرسله بنفسك — يظهر الآن فقط.', 'warning'),
                h('div.cs-invite-link', h('input.input', { type: 'text', readonly: true, dir: 'ltr', value: r.url, 'aria-label': 'رابط تعيين كلمة المرور' }), copyButton(r.url, 'نسخ', { variant: 'secondary', size: 'md' })),
              ),
              actions: [{ label: 'تم', variant: 'primary' }],
            });
          } else toast(`أرسلنا رابط تعيين كلمة المرور إلى ${u.email}.`, 'success');
        } else toast(done, 'success');
        tabsEl.refresh('users');
      } catch (err) {
        forbiddenToast(err);
      }
    };
    const m = modal({
      title: `أمان حساب ${u.name}`,
      subtitle: u.email,
      size: 'sm',
      body: h(
        'div.cd-security',
        h('p.cs-note', icon('info', { size: 16 }), 'كل إجراء هنا يُسجَّل في سجل الأمان ويُبلَّغ به مديرو البوابة.'),
        button('رابط تعيين كلمة مرور', { variant: 'secondary', icon: 'lock', disabled: u.state === 'invite_pending' || !u.active, onClick: () => run('reset-link', { title: 'رابط تعيين كلمة مرور', message: 'يُصدر رابط صالح 24 ساعة لتعيين كلمة مرور جديدة، ويُرسل بالبريد إن أمكن.', danger: false }) }),
        button('إلغاء التحقق بخطوتين', { variant: 'secondary', icon: 'shieldCheck', disabled: !u.two_factor, onClick: () => run('2fa/reset', { title: 'إلغاء التحقق بخطوتين', message: 'يُلغى التحقق بخطوتين لهذا الحساب ويُسجَّل خروجه من كل الأجهزة.', done: 'أُلغي التحقق بخطوتين.' }) }),
        button('فك القفل', { variant: 'secondary', icon: 'lock', disabled: u.state !== 'locked' && !u.locked_until, onClick: () => run('unlock', { title: 'فك القفل', message: 'يُرفع الإيقاف المؤقت بعد محاولات الدخول الخاطئة.', done: 'رُفع الإيقاف المؤقت.', danger: false }) }),
        button('تسجيل الخروج من كل الأجهزة', { variant: 'secondary', icon: 'logout', onClick: () => run('sessions/revoke', { title: 'تسجيل الخروج من كل الأجهزة', message: 'تنتهي كل جلسات هذا المستخدم الآن.', done: 'سُجّل خروجه من كل الأجهزة.' }) }),
      ),
      actions: [{ label: 'إغلاق', variant: 'ghost' }],
    });
  }

  // ───────────── «الكيانات والأطراف» ─────────────
  async function entitiesTab() {
    const co = c.company;
    const [cps] = await Promise.all([api.get(`/admin/companies/${co.id}/counterparties`).catch(() => ({ items: [] }))]);
    const ents = c.entities || [];
    const maxEnt = c.subscription?.terms?.max_entities ?? null;
    const activeEnts = ents.filter((e) => e.status === 'active').length;
    const atMax = maxEnt != null && activeEnts >= maxEnt;
    const entCard = card({
      title: 'الكيانات',
      subtitle: maxEnt == null ? null : `${activeEnts} من ${maxEnt} في الباقة`,
      icon: 'landmark',
      actions: h(
        'div.cd-actions',
        atMax && !isAdmin ? h('span.cr-hint', icon('info', { size: 14 }), `وصلت الشركة لحد الكيانات في باقتها؛ التجاوز ${ADMIN_ONLY}.`) : null,
        button('إضافة كيان', { variant: 'primary', size: 'sm', icon: 'plus', disabled: atMax && !isAdmin, onClick: () => editEntity(null, { atMax }) }),
      ),
      flush: true,
      body: table({
        caption: 'كيانات الشركة',
        stack: true,
        rows: ents,
        empty: 'لا كيانات.',
        columns: [
          { key: 'name', label: 'الكيان', render: (e) => h('span', { dir: 'auto' }, e.name) },
          { key: 'relation', label: 'العلاقة', render: (e) => e.relation_label },
          { key: 'form', label: 'الشكل القانوني', render: (e) => e.legal_form_label || '—' },
          { key: 'reg', label: 'السجل التجاري', render: (e) => (e.commercial_registry ? h('bdi', { dir: 'ltr' }, e.commercial_registry) : '—') },
          { key: 'status', label: 'الحالة', render: (e) => badge(e.status === 'active' ? 'نشط' : 'موقوف', e.status === 'active' ? 'success' : 'neutral', { dot: true }) },
          { key: 'a', label: 'إجراءات', render: (e) => button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: () => editEntity(e) }) },
        ],
      }),
    });
    const cpCard = card({
      title: 'الأطراف المتعاملة',
      subtitle: 'موردون ومشترون وشركاء ومؤجرون تتكرر أسماؤهم في طلبات الشركة وذاكرتها.',
      icon: 'users',
      actions: button('إضافة طرف', { variant: 'secondary', size: 'sm', icon: 'plus', onClick: () => editCounterparty(null) }),
      flush: true,
      body: table({
        caption: 'الأطراف المتعاملة',
        stack: true,
        rows: cps.items || [],
        empty: 'لا أطراف مسجلة بعد.',
        columns: [
          { key: 'name', label: 'الطرف', render: (p) => h('div.cq-cell-req', h('span', { dir: 'auto' }, p.name), p.registry_no ? h('bdi.muted', { dir: 'ltr' }, p.registry_no) : null) },
          { key: 'kind', label: 'النوع', render: (p) => p.kind_label },
          {
            key: 'risk',
            label: 'المخاطر',
            render: (p) =>
              h(
                'div.cq-cell-st',
                p.risk_level ? badge(label('company_risk_level', p.risk_level), RISK_TONE[p.risk_level] || 'neutral', { icon: p.risk_level === 'low' ? 'checkCircle' : 'alert' }) : '—',
                p.blocked ? badge('محظور التعامل', 'danger', { icon: 'alert' }) : null,
                p.private_only ? badge('لمديري البوابة فقط', 'neutral', { className: 'badge-outline' }) : null,
              ),
          },
          { key: 'mem', label: 'في الذاكرة', render: (p) => h('span.num', String(p.memory_items ?? 0)) },
          { key: 'a', label: 'إجراءات', render: (p) => button('تعديل', { variant: 'ghost', size: 'sm', icon: 'edit', onClick: () => editCounterparty(p) }) },
        ],
      }),
    });
    return h('div.stack', entCard, cpCard);
  }

  async function editEntity(e, { atMax = false } = {}) {
    const co = c.company;
    const isNew = !e;
    const parents = (c.entities || []).filter((x) => x.status === 'active' && (!e || x.id !== e.id));
    const needOverride = isNew && atMax && isAdmin;
    await formDialog({
      title: isNew ? 'إضافة كيان' : `تعديل ${e.name}`,
      intro: needOverride ? 'وصلت الشركة لحد الكيانات في باقتها. الإضافة تتجاوز الحد وتُسجَّل في سجل الأمان.' : null,
      fields: [
        { name: 'name', label: 'الاسم القانوني', required: true, maxLength: 200, dir: 'auto' },
        { name: 'legal_form', label: 'الشكل القانوني', type: 'select', options: opts('legal_form', ['llc', 'jsc', 'sole', 'branch', 'partnership', 'other']) },
        e?.relation === 'parent' ? null : { name: 'relation', label: 'العلاقة', type: 'select', required: true, placeholder: false, options: opts('company_entity_relation', ['subsidiary', 'affiliate', 'branch']) },
        e?.relation === 'parent' ? null : { name: 'parent_entity_id', label: 'تابع لـ', type: 'select', options: parents.map((p) => ({ value: p.id, label: p.name })) },
        { name: 'commercial_registry', label: 'السجل التجاري', maxLength: 60, ltr: true },
        { name: 'tax_id', label: 'البطاقة الضريبية', maxLength: 60, ltr: true },
        { name: 'jurisdiction', label: 'جهة التسجيل', maxLength: 120 },
        !isNew && e.relation !== 'parent' ? { name: 'active', type: 'checkbox', text: 'الكيان نشط' } : null,
        needOverride ? { name: 'override_reason', label: 'سبب تجاوز حد الباقة', type: 'textarea', required: true, maxLength: 500, rows: 2 } : null,
      ].filter(Boolean),
      values: e ? { ...e, active: e.status === 'active' } : { relation: 'subsidiary', parent_entity_id: (c.entities || []).find((x) => x.relation === 'parent')?.id },
      onSubmit: async (v) => {
        const body = { name: v.name, legal_form: v.legal_form || null, commercial_registry: v.commercial_registry || null, tax_id: v.tax_id || null, jurisdiction: v.jurisdiction || null };
        if (v.relation) body.relation = v.relation;
        if (v.parent_entity_id !== undefined) body.parent_entity_id = v.parent_entity_id || null;
        if (!isNew && e.relation !== 'parent') body.status = v.active ? 'active' : 'inactive';
        if (needOverride) {
          body.override = true;
          body.override_reason = v.override_reason;
        }
        if (isNew) await api.post(`/admin/companies/${co.id}/entities`, body);
        else await api.patch(`/admin/company-entities/${e.id}`, body);
        await reload('entities');
        toast(isNew ? 'أُضيف الكيان.' : 'حُفظ الكيان.', 'success');
      },
    });
  }

  async function editCounterparty(p) {
    const co = c.company;
    await formDialog({
      title: p ? `تعديل ${p.name}` : 'إضافة طرف',
      fields: [
        { name: 'name', label: 'الاسم', required: true, maxLength: 200, dir: 'auto' },
        { name: 'kind', label: 'النوع', type: 'select', required: true, placeholder: false, options: opts('company_counterparty_kind', ['supplier', 'customer', 'partner', 'landlord', 'regulator', 'employee', 'other']) },
        { name: 'registry_no', label: 'السجل التجاري', maxLength: 60, ltr: true },
        { name: 'risk_level', label: 'درجة المخاطر', type: 'select', options: opts('company_risk_level', ['low', 'medium', 'high']) },
        { name: 'notes', label: 'ملاحظات داخلية', type: 'textarea', maxLength: 1000, rows: 2, hint: 'لا تراها الشركة ولا المحامون.' },
        { name: 'blocked', type: 'checkbox', text: 'محظور التعامل' },
      ],
      values: p || { kind: 'supplier' },
      onSubmit: async (v) => {
        const body = { name: v.name, kind: v.kind, registry_no: v.registry_no || null, risk_level: v.risk_level || null, notes: v.notes || null, blocked: !!v.blocked };
        if (p) await api.patch(`/admin/company-counterparties/${p.id}`, body);
        else await api.post(`/admin/companies/${co.id}/counterparties`, body);
        tabsEl.refresh('entities');
        toast('حُفظ الطرف.', 'success');
      },
    });
  }

  // ───────────── «الباقة والتكاليف» (A) ─────────────
  async function planTab() {
    const co = c.company;
    const sub = c.subscription;
    const usage = await api.get(`/admin/companies/${co.id}/usage`).catch(() => null);
    const cycles = usage?.usage?.cycles || [];
    let cycle = cycles[0]?.start || '';
    const chargesHost = h('div');
    const subCard = card({
      title: 'الاشتراك',
      icon: 'fileText',
      actions: button('تغيير الباقة', { variant: 'secondary', size: 'sm', icon: 'edit', onClick: () => changePlan() }),
      body: sub
        ? h(
            'div.stack',
            kv(
              [
                ['الباقة', `${sub.plan_name} (${sub.period_label})`],
                ['السعر', sub.terms?.price_minor != null ? money(sub.terms.price_minor / 100) : '—'],
                ['بداية الاشتراك', day(sub.starts_on)],
                ['الفترة التالية تبدأ', day(sub.next_period_starts)],
                ['ينتهي في', sub.ends_on ? day(sub.ends_on) : 'بلا نهاية محددة'],
                ['التجديد', sub.renews === 'manual' ? 'يدوي' : 'تلقائي'],
              ],
              { columns: 2 },
            ),
            termsView(sub.terms || {}, { money: true }),
          )
        : emptyState('لا اشتراك نشط لهذه الشركة.', button('بدء اشتراك', { variant: 'primary', onClick: () => changePlan() }), { compact: true }),
    });

    async function loadCharges() {
      mount(chargesHost, loading());
      try {
        const res = await api.get(`/admin/companies/${co.id}/charges`, { cycle: cycle || undefined });
        mount(
          chargesHost,
          table({
            caption: 'التكاليف الإضافية',
            stack: true,
            rows: res.items || [],
            empty: 'لا تكاليف إضافية في هذه الدورة.',
            rowClass: (x) => (x.voided ? 'is-voided' : null),
            columns: [
              { key: 'when', label: 'التاريخ', render: (x) => day(cairoKey(x.created_at)) },
              { key: 'kind', label: 'النوع', render: (x) => x.kind_label },
              { key: 'desc', label: 'الوصف', render: (x) => h('div.cq-cell-req', h('span', { dir: 'auto' }, x.description), x.quote_number ? h('span.muted', `عرض ${x.quote_number}${x.quote_basis === 'capped' && x.cap != null ? ` · بحد أقصى ${money(x.cap)}` : ''}`) : null) },
              { key: 'req', label: 'الطلب', render: (x) => (x.request_code ? (x.request_id ? h('a', { href: `#/company-requests/${x.request_id}` }, codeTag(x.request_code)) : codeTag(x.request_code)) : '—') },
              { key: 'amount', label: 'المبلغ', render: (x) => h('span.num', { class: x.voided ? 'is-struck' : null }, x.amount_text || money(x.amount)) },
              { key: 'state', label: 'الحالة', render: (x) => (x.voided ? badge('ملغاة', 'neutral', { title: x.void_reason || '' }) : x.replaces_charge_id ? badge('بديلة لتكلفة أعلى', 'info') : badge('معتمدة', 'success', { dot: true })) },
              {
                key: 'a',
                label: 'إجراءات',
                render: (x) =>
                  x.voided
                    ? x.void_reason
                      ? h('span.muted', { dir: 'auto' }, x.void_reason)
                      : null
                    : h(
                        'div.cd-actions',
                        button('استبدال بمبلغ أقل', { variant: 'ghost', size: 'sm', onClick: () => addCharge(x) }),
                        button('إلغاء', { variant: 'ghost', size: 'sm', onClick: () => voidCharge(x) }),
                      ),
              },
            ],
          }),
          h('p.cd-total', 'إجمالي المعتمد: ', h('strong.num', money(res.total_unvoided || 0))),
        );
      } catch (err) {
        mount(chargesHost, errorState(err, loadCharges));
      }
    }

    const cycleSel = h(
      'select.input',
      { 'aria-label': 'الدورة', onChange: (e) => ((cycle = e.target.value), loadCharges()) },
      cycles.map((x, i) => h('option', { value: x.start }, `${i === 0 ? 'الدورة الحالية' : i === 1 ? 'الدورة السابقة' : 'دورة'}: ${day(x.start)} – ${day(x.end)}`)),
    );
    const chargesCard = card({
      title: 'التكاليف الإضافية',
      subtitle: 'كل تكلفة تُضاف يُبلَّغ بها مديرو البوابة وجهات الفواتير في البوابة وبالبريد.',
      icon: 'wallet',
      actions: h(
        'div.cd-actions',
        cycles.length ? h('div.select-wrap.cd-cycle', cycleSel) : null,
        asyncButton('تصدير CSV', async () => {
          try {
            await downloadFile('/admin/company-charges.csv', { cycle: cycle || undefined, company_id: co.id }, { fallbackName: 'company-charges.csv' });
          } catch (err) {
            toast(errorMessage(err), 'danger');
          }
        }, { variant: 'secondary', size: 'sm', icon: 'download' }),
        button('إضافة تكلفة', { variant: 'primary', size: 'sm', icon: 'plus', onClick: () => addCharge(null) }),
      ),
      body: chargesHost,
    });

    async function addCharge(replace) {
      await formDialog({
        title: replace ? 'استبدال بمبلغ أقل' : 'إضافة تكلفة',
        intro: replace
          ? `لا يزيد المبلغ الجديد على ${replace.amount_text || money(replace.amount)}؛ تُلغى التكلفة الحالية وتُضاف البديلة، وتُبلَّغ الشركة.`
          : 'تُضاف التكلفة لسجل الشركة ويُبلَّغ بها مديرو البوابة وجهات الفواتير فورًا. لا تُضف تكلفة لم توافق عليها الشركة أو لم تنص عليها باقتها.',
        fields: [
          replace ? null : { name: 'kind', label: 'النوع', type: 'select', required: true, placeholder: false, options: opts('company_charge_kind', ['out_of_scope', 'overage', 'expense', 'adjustment']) },
          { name: 'description', label: 'الوصف', required: true, maxLength: 300, dir: 'auto' },
          { name: 'amount', label: 'المبلغ', type: 'money', required: true, min: 0.01, max: replace ? Number(replace.amount) : undefined },
          replace ? null : { name: 'request_code', label: 'كود الطلب (اختياري)', ltr: true, placeholder: `${co.prefix}-0001` },
        ].filter(Boolean),
        values: replace ? { description: replace.description, amount: replace.amount } : { kind: 'adjustment' },
        submitLabel: replace ? 'استبدال' : 'إضافة',
        onSubmit: async (v) => {
          const body = { description: v.description, amount: v.amount };
          if (replace) body.replaces_charge_id = replace.id;
          else {
            body.kind = v.kind;
            if (v.request_code) body.request_code = String(v.request_code).toUpperCase();
          }
          await api.post(`/admin/companies/${co.id}/charges`, body);
          await loadCharges();
          toast('أُضيفت التكلفة وأُبلغت الشركة.', 'success');
        },
      });
    }

    async function voidCharge(x) {
      await formDialog({
        title: 'إلغاء تكلفة',
        intro: `${x.kind_label} · ${x.amount_text || money(x.amount)}`,
        fields: [{ name: 'reason', label: 'سبب الإلغاء', type: 'textarea', required: true, maxLength: 300, rows: 2 }],
        submitLabel: 'إلغاء التكلفة',
        onSubmit: async (v) => {
          await api.post(`/admin/company-charges/${x.id}/void`, { reason: v.reason });
          await loadCharges();
          toast('أُلغيت التكلفة.', 'success');
        },
      });
    }

    await loadCharges();
    const usageCard = usage?.usage
      ? card({
          title: 'الاستخدام في الدورة',
          icon: 'chart',
          body: kv(
            [
              ['أُرسلت', h('span.num', String(usage.usage.requests?.submitted ?? 0))],
              ['بدأ العمل عليها', h('span.num', String(usage.usage.requests?.accepted ?? 0))],
              ['سُلِّمت', h('span.num', String(usage.usage.requests?.delivered ?? 0))],
              ['ضمن الباقة', h('span.num', `${usage.usage.requests?.included_used ?? 0}${usage.usage.requests?.included_limit != null ? ` من ${usage.usage.requests.included_limit}` : ''}`)],
              ['تكلفة إضافية', h('span.num', String(usage.usage.requests?.overage ?? 0))],
              ['خارج الباقة', h('span.num', String(usage.usage.requests?.out_of_scope ?? 0))],
            ],
            { columns: 3 },
          ),
        })
      : null;
    return h('div.stack', subCard, chargesCard, usageCard);
  }

  async function changePlan() {
    const co = c.company;
    const sub = c.subscription;
    const plans = ((await api.get('/admin/company-plans').catch(() => ({ items: [] }))).items || []).filter((p) => p.active);
    const CUSTOM = 'custom';
    let choice = sub?.plan_id ? String(sub.plan_id) : plans[0] ? String(plans[0].id) : CUSTOM;
    const baseTerms = () => (choice === CUSTOM ? sub?.terms || TERMS_BLANK : plans.find((p) => String(p.id) === choice)?.terms || TERMS_BLANK);
    const editor = termsEditor(baseTerms(), { money: true });
    const f = form(
      [
        { name: 'plan', label: 'الباقة', type: 'select', required: true, placeholder: false, options: [...plans.map((p) => ({ value: String(p.id), label: p.name })), { value: CUSTOM, label: 'شروط مخصصة' }], onChange: (v) => ((choice = v || CUSTOM), editor.setTerms(baseTerms())) },
        { name: 'starts_on', label: 'يبدأ الاشتراك الجديد في', type: 'date', required: true },
        {
          name: 'renews',
          label: 'التجديد',
          type: 'select',
          required: true,
          placeholder: false,
          options: [
            { value: 'auto', label: 'تلقائي' },
            { value: 'manual', label: 'يدوي' },
          ],
        },
        { name: 'ends_on', label: 'ينتهي في (اختياري)', type: 'date' },
        { name: 'note', label: 'ملاحظة', maxLength: 500, full: true },
      ],
      { values: { plan: choice, starts_on: cairoToday(), renews: sub?.renews || 'auto' }, footer: false },
    );
    const alertHost = h('div.cs-alert');
    let done = false;
    modal({
      sheet: true,
      className: 'cs-sheet cs-sheet-lg',
      title: sub ? 'تغيير الباقة' : 'بدء اشتراك',
      subtitle: co.name,
      beforeClose: discardGuard(() => editor.isDirty(), { singular: true }),
      body: h(
        'div.cs-body',
        sub ? alertBox('ينتهي الاشتراك الحالي اليوم ويبدأ الجديد بلقطة من الشروط أدناه؛ يبقى السجل محفوظًا.', 'info') : null,
        alertHost,
        f.el,
        h('h3.cs-section-title', 'شروط الاشتراك'),
        editor.el,
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حفظ الاشتراك',
          variant: 'primary',
          icon: 'check',
          onClick: async () => {
            mount(alertHost, null);
            if (!(f.validate() & editor.validate())) return false;
            const v = f.getValues();
            const body = { terms: editor.getTerms(), starts_on: cairoKey(v.starts_on), renews: v.renews, ends_on: v.ends_on ? cairoKey(v.ends_on) : undefined, note: v.note || undefined };
            if (choice !== CUSTOM) body.plan_id = Number(choice);
            try {
              await api.put(`/admin/companies/${co.id}/subscription`, body);
              done = true;
              return undefined;
            } catch (err) {
              editor.showError(err);
              f.showError(err);
              mount(alertHost, alertBox(errorMessage(err), 'danger'));
              return false;
            }
          },
        },
      ],
      onClose: async () => {
        if (!done) return;
        toast('حُفظ الاشتراك الجديد.', 'success');
        await reload('plan');
      },
    });
  }

  // ───────────── «الذاكرة القانونية» ─────────────
  async function memoryTab() {
    const host = h('div');
    const st = { kind: '', q: '', archived: false };
    async function load() {
      mount(host, loading());
      try {
        const res = await api.get(`/admin/companies/${c.company.id}/memory`, { kind: st.kind || undefined, q: st.q || undefined, include_archived: st.archived ? 1 : undefined });
        tabsEl?.setCount('memory', res.under_review ? res.under_review : undefined);
        mount(
          host,
          res.under_review ? alertBox(`${count(res.under_review, 'item')} بانتظار مراجعة الفريق (حفظتها الشركة عند اعتماد تسليم).`, 'warning', { icon: 'alert' }) : null,
          card({
            flush: true,
            body: table({
              caption: 'الذاكرة القانونية للشركة',
              stack: true,
              rows: res.items || [],
              empty: 'لا عناصر في الذاكرة بهذا الاختيار.',
              onRowClick: (m) => openMemoryItem({ mid: m.id, company: c, user, onDone: load }),
              columns: [
                { key: 'kind', label: 'النوع', render: (m) => badge(m.kind_label, 'neutral', { className: 'badge-outline' }) },
                {
                  key: 'title',
                  label: 'العنصر',
                  render: (m) => h('div.cq-cell-req', h('a', { href: `#/companies/${c.company.id}?tab=memory`, dir: 'auto', onClick: (e) => (e.preventDefault(), e.stopPropagation(), openMemoryItem({ mid: m.id, company: c, user, onDone: load })) }, m.title), m.counterparty ? h('span.muted', { dir: 'auto' }, m.counterparty.name) : null),
                },
                {
                  key: 'status',
                  label: 'الحالة',
                  render: (m) => h('div.cq-cell-st', m.under_review ? badge('قيد المراجعة', 'warning', { icon: 'alert' }) : badge(m.status_label, 'neutral'), m.archived ? badge('مؤرشف', 'neutral', { className: 'badge-outline' }) : null),
                },
                { key: 'date', label: 'أقرب موعد', render: (m) => (m.notice_deadline ? h('span', 'إخطار: ', day(m.notice_deadline)) : m.next_date ? day(m.next_date) : '—') },
                { key: 'access', label: 'من يراه في الشركة', render: (m) => m.access_label },
                { key: 'src', label: 'من طلب', render: (m) => (m.source_request ? h('a', { href: `#/company-requests/${m.source_request.id}`, onClick: (e) => e.stopPropagation() }, codeTag(m.source_request.code)) : '—') },
                { key: 'docs', label: 'مستندات', render: (m) => h('span.num', String(m.documents_count ?? 0)) },
              ],
            }),
          }),
        );
      } catch (err) {
        mount(host, errorState(err, load));
      }
    }
    await load();
    const archivedCb = h('input', { type: 'checkbox', onChange: (e) => ((st.archived = e.target.checked), load()) });
    return h(
      'div.stack',
      h(
        'div.cq-bar',
        filterBar([
          selectInput({ label: 'النوع', allLabel: 'كل الأنواع', options: MEMORY_KINDS.map((k) => ({ value: k.key, label: k.list_label })), value: '', onChange: (v) => ((st.kind = v), load()) }),
          searchInput({ label: 'بحث في الذاكرة', placeholder: 'عنوان أو طرف أو ملاحظة', onSearch: (v) => ((st.q = v), load()) }),
          h('label.check.cq-flag-filter', archivedCb, h('span', 'يشمل المؤرشف')),
        ]),
        button('إضافة عنصر', { variant: 'primary', icon: 'plus', onClick: () => createMemoryItem({ company: c, user, onDone: load }) }),
      ),
      host,
    );
  }

  // ───────────── «الفريق المفضل» ─────────────
  async function podTab() {
    const co = c.company;
    const [pod, lawyers] = await Promise.all([api.get(`/admin/companies/${co.id}/team`), api.get('/admin/lawyers').catch(() => ({ items: [] }))]);
    const law = (lawyers.items || []).filter((l) => l.active);
    let rows = (pod.items || []).map((x) => ({ lawyer_id: x.lawyer_id, role: x.role, note: x.note || '' }));
    const listHost = h('div');
    const draw = () =>
      mount(
        listHost,
        rows.length
          ? h(
              'ul.cd-pod',
              rows.map((r, i) =>
                h(
                  'li.cd-pod-row',
                  h('div.select-wrap', h('select.input', { 'aria-label': 'المحامي', onChange: (e) => (r.lawyer_id = Number(e.target.value)) }, law.map((l) => h('option', { value: String(l.id), selected: l.id === r.lawyer_id }, l.display_name || l.name)))),
                  h('div.select-wrap', h('select.input', { 'aria-label': 'الدور', onChange: (e) => (r.role = e.target.value) }, POD_ROLES.map((k) => h('option', { value: k, selected: k === r.role }, label('company_pod_role', k))))),
                  h('input.input', { type: 'text', value: r.note, maxlength: 300, placeholder: 'ملاحظة', 'aria-label': 'ملاحظة', onInput: (e) => (r.note = e.target.value) }),
                  button('', { variant: 'ghost', icon: 'trash', ariaLabel: 'حذف', onClick: () => ((rows = rows.filter((_, j) => j !== i)), draw()) }),
                ),
              ),
            )
          : emptyState('لا محامين مفضلين أو مستبعدين لهذه الشركة.', null, { compact: true, icon: 'users' }),
      );
    draw();
    return card({
      title: 'الفريق المفضل',
      subtitle: POD_HINT,
      icon: 'users',
      body: h(
        'div.stack',
        listHost,
        h(
          'div.form-actions',
          button('إضافة محامٍ', { variant: 'secondary', icon: 'plus', disabled: !law.length, onClick: () => ((rows = [...rows, { lawyer_id: law[0]?.id, role: 'preferred_lead', note: '' }]), draw()) }),
          asyncButton('حفظ الفريق', async () => {
            try {
              const res = await api.put(`/admin/companies/${co.id}/team`, { items: rows.map((r) => ({ lawyer_id: r.lawyer_id, role: r.role, note: r.note || null })) });
              rows = (res.items || []).map((x) => ({ lawyer_id: x.lawyer_id, role: x.role, note: x.note || '' }));
              draw();
              toast('حُفظ الفريق المفضل.', 'success');
            } catch (err) {
              toast(errorMessage(err), 'danger');
            }
          }, { variant: 'primary' }),
        ),
      ),
    });
  }

  // ───────────── «السجل» (A) ─────────────
  async function logTab() {
    const res = await api.get('/admin/audit', { q: c.company.name, page_size: 50 });
    return card({
      title: 'السجل',
      subtitle: 'أحداث الأمان والإجراءات الحساسة الخاصة بهذه الشركة (من سجل الأمان).',
      icon: 'clock',
      flush: true,
      body: table({
        caption: 'سجل الشركة',
        stack: true,
        rows: res.items || [],
        empty: 'لا أحداث مسجلة.',
        columns: [
          { key: 'when', label: 'الوقت', render: (e) => timeOf(e.created_at) },
          { key: 'type', label: 'الحدث', render: (e) => badge(e.type_label || e.type, e.severity === 'warning' ? 'warning' : e.severity === 'critical' ? 'danger' : 'neutral') },
          { key: 'actor', label: 'بواسطة', render: (e) => h('span', { dir: 'auto' }, e.actor_name || '—') },
          { key: 'summary', label: 'التفاصيل', render: (e) => h('span', { dir: 'auto' }, e.summary) },
        ],
      }),
    });
  }

  drawHeader();
  const items = [
    { key: 'overview', label: 'نظرة عامة', render: overview },
    { key: 'requests', label: 'الطلبات', count: c.requests?.total ?? null, render: requestsTab },
    { key: 'users', label: 'المستخدمون', count: (c.users || []).length, render: usersTab },
    { key: 'entities', label: 'الكيانات والأطراف', render: entitiesTab },
    isAdmin ? { key: 'plan', label: 'الباقة والتكاليف', render: planTab } : null,
    { key: 'memory', label: 'الذاكرة القانونية', render: memoryTab },
    { key: 'pod', label: 'الفريق المفضل', render: podTab },
    isAdmin ? { key: 'log', label: 'السجل', render: logTab } : null,
  ].filter(Boolean);
  const want = items.some((x) => x.key === ctx.query.tab) ? ctx.query.tab : 'overview';
  tabsEl = tabs(items, { active: want, className: 'cd-tabs' });
  const page = h('div.cq-page.cd-page', headerHost, tabsEl);
  if (ctx.query.item) setTimeout(() => openMemoryItem({ mid: Number(ctx.query.item), company: c, user, onDone: () => tabsEl.refresh('memory') }), 0);
  return page;
}

function dateKindLabel(k) {
  return { notice: 'آخر موعد للإخطار', end: 'ينتهي', next: 'الموعد التالي' }[k] || '';
}

// ───────────────────────── الذاكرة القانونية: ورقة العنصر (مشتركة مع صفحة الطلب) ─────────────────────────

/** قيم نموذج الذاكرة من عرض العنصر: الحقول المربوطة بأعمدة (الطرف، الكيان، القيمة، التواريخ) والباقي من data */
export function memoryValues(it, specs = []) {
  const data = it.data || {};
  const out = { remind_days: it.remind_days, access: it.access };
  for (const s of specs) {
    let v;
    if (s.column === 'counterparty') v = it.counterparty?.name;
    else if (s.column === 'entity_id') v = it.entity?.id;
    else if (s.column === 'value_minor') v = it.value;
    else if (s.column) v = it[s.column] ?? data[s.key];
    else if (s.kind === 'money' && data[`${s.key}_minor`] != null) v = data[`${s.key}_minor`] / 100;
    else v = data[s.key];
    if (v !== undefined && v !== null) out[s.key] = v;
  }
  return out;
}

/** خيارات الكيانات والأطراف لنموذج الذاكرة */
async function memoryFormContext(companyId, company) {
  const ents = company?.entities || (await api.get(`/admin/companies/${companyId}`).catch(() => ({ entities: [] }))).entities || [];
  const cps = (await api.get(`/admin/companies/${companyId}/counterparties`).catch(() => ({ items: [] }))).items || [];
  return { entities: ents.filter((e) => e.status === 'active'), counterparties: cps };
}

/**
 * ورقة عنصر الذاكرة لفريق المكتب: نموذج البوابة نفسه (coMemoryForm, staff:true) + الحالة + «ملاحظات داخلية» + المستندات،
 * مع «حفظ وتأكيد» للعنصر قيد المراجعة (memory_pending، L-55)، والأرشفة، والحذف النهائي لمدير النظام.
 * @param {{mid:number, company?:object, user:object, onDone?:Function}} o
 */
export async function openMemoryItem({ mid, company = null, companyId: cid = null, user = {}, onDone } = {}) {
  const isAdmin = user.role === 'admin';
  let data;
  try {
    data = await api.get(`/admin/company-memory/${mid}`);
  } catch (err) {
    toast(errorMessage(err), 'danger');
    return null;
  }
  const [{ coMemoryForm }, { memoryFields }] = await Promise.all([import('../../../lib/company-forms.js'), import('../../../lib/company-catalog-fields.js')]);
  const it = data.item;
  const companyId = company?.company?.id || cid || it.company_id;
  const fctx = await memoryFormContext(companyId, company);
  const kindMeta = memoryKindByKey(it.kind);
  const values = memoryValues(it, memoryFields(it.kind));
  const mf = coMemoryForm(it.kind, values, { staff: true, admin: true, entities: fctx.entities, counterparties: fctx.counterparties });
  const statusSel = h('select.input', { 'aria-label': 'الحالة' }, (kindMeta?.statuses || []).map((s) => h('option', { value: s.key, selected: s.key === it.status }, s.label)));
  const notes = h('textarea.input', { rows: 3, maxlength: 4000, dir: 'auto', 'aria-label': 'ملاحظات داخلية' });
  notes.value = it.staff_notes || '';
  const fileIn = fileInput({ accept: MEMORY_ACCEPT, maxFiles: 5, label: 'إضافة مستندات' });
  const alertHost = h('div.cs-alert');
  const docsHost = h('div');
  const drawDocs = (docs) =>
    mount(
      docsHost,
      (docs || []).length
        ? h(
            'ul.cr-docs',
            docs.map((x) => h('li.cr-doc', icon('fileText', { size: 16 }), h('a.cr-doc-name', { href: downloadUrl(x.id), target: '_blank', rel: 'noopener', dir: 'auto' }, x.title || x.filename), h('span.cr-doc-meta', `${formatBytes(x.size)} · ${x.uploaded_by_kind === 'client' ? 'من الشركة' : 'من الفريق'}`))),
          )
        : h('p.muted', 'لا مستندات.'),
    );
  drawDocs(data.documents);
  const snapshot = JSON.stringify([mf.values(), notes.value, statusSel.value]);
  const isDirty = () => JSON.stringify([mf.values(), notes.value, statusSel.value]) !== snapshot || fileIn.getFiles().length > 0;

  async function save({ confirm = false } = {}) {
    mount(alertHost, null);
    const vr = mf.validate();
    if (!vr.ok) return false;
    const body = { ...vr.values, staff_notes: notes.value.trim() || null, status: statusSel.value };
    if (confirm) {
      body.confirm = true;
      if (body.status === 'under_review') body.status = 'active';
    }
    try {
      await api.patch(`/admin/company-memory/${it.id}`, body);
      if (fileIn.getFiles().length) await api.post(`/admin/company-memory/${it.id}/documents`, { files: await filesToUploads(fileIn.getFiles()) });
      return true;
    } catch (err) {
      mf.showError(err);
      mount(alertHost, alertBox(errorMessage(err), 'danger'));
      return false;
    }
  }

  let changed = false;
  const extraActions = h(
    'div.cd-actions',
    asyncButton(it.archived ? 'استعادة من الأرشيف' : 'أرشفة', async () => {
      try {
        await api.post(`/admin/company-memory/${it.id}/archive`, it.archived ? { restore: true } : {});
        changed = true;
        handle.close('action');
        toast(it.archived ? 'استُعيد العنصر.' : 'أُرشف العنصر؛ يبقى في البحث المؤرشف.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'danger');
      }
    }, { variant: 'ghost', size: 'sm', icon: 'inbox' }),
    isAdmin ? button('حذف نهائي', { variant: 'ghost', size: 'sm', icon: 'trash', className: 'is-danger', onClick: () => purge() }) : null,
  );

  async function purge() {
    const input = h('input.input', { type: 'text', dir: 'auto', 'aria-label': 'اكتب اسم العنصر للتأكيد' });
    const err = h('p.field-error', { hidden: true });
    modal({
      title: 'حذف نهائي من الذاكرة',
      size: 'sm',
      body: h(
        'div.stack',
        alertBox(`يُحذف العنصر ومستنداته غير المشتركة وتذكيراته وصلاحيات المحامين عليه. لا يمكن التراجع. ${PURGE_BACKUPS_COPY}`, 'danger'),
        h('div.field', h('label.field-label', 'اكتب اسم العنصر للتأكيد'), h('p.field-hint', { dir: 'auto' }, it.title), input, err),
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'حذف نهائي',
          variant: 'danger',
          onClick: async () => {
            if (input.value.trim() !== String(it.title).trim()) {
              err.textContent = 'الاسم لا يطابق عنوان العنصر.';
              err.hidden = false;
              return false;
            }
            try {
              await api.del(`/admin/company-memory/${it.id}?purge=1`);
              changed = true;
              handle.close('action');
              toast('حُذف العنصر نهائيًا.', 'success');
              return undefined;
            } catch (e) {
              err.textContent = errorMessage(e);
              err.hidden = false;
              return false;
            }
          },
        },
      ],
    });
  }

  const handle = modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-memory',
    title: it.under_review ? 'مراجعة العقد في الذاكرة' : it.title,
    subtitle: `${it.kind_label}${it.source_request ? ` · من طلب ${it.source_request.code}` : ''}`,
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body.cs-two',
      h(
        'div.cs-col',
        it.under_review ? alertBox('حفظت الشركة هذا العقد في ذاكرتها القانونية عند اعتماد التسليم. راجِع بياناته ثم «حفظ وتأكيد»؛ يبقى «قيد المراجعة» حتى ذلك.', 'warning', { icon: 'alert' }) : null,
        alertHost,
        mf.el,
      ),
      h(
        'div.cs-col',
        h('div.field', h('label.field-label', 'الحالة'), h('div.select-wrap', statusSel)),
        h('div.field', h('label.field-label', 'ملاحظات داخلية'), notes, h('p.field-hint', 'لفريق المكتب فقط؛ لا تراها الشركة ولا المحامون.')),
        h('section.cs-section', h('h3.cs-section-title', 'المستندات'), docsHost, fileIn.el),
        kv(
          [
            ['أضافه', it.created_by ? `${it.created_by.name || ''}${it.created_by.kind === 'staff' ? ' (الفريق)' : ''}` : '—'],
            ['راجعه', it.reviewed_at ? `${it.reviewed_by || ''} · ${date(it.reviewed_at)}` : 'لم يُراجع بعد'],
            it.source_request ? ['من طلب', h('a', { href: `#/company-requests/${it.source_request.id}` }, codeTag(it.source_request.code))] : null,
            ['صلاحيات المحامين', it.grantable === false ? 'لا يُتاح للمحامين (بيانات أشخاص)' : data.grants ? `متاح في ${count(data.grants, ['إسناد واحد', 'إسنادين', 'إسنادات', 'إسنادًا'])}` : 'لم يُتح لأي محامٍ'],
            (data.reminders || []).length ? ['التذكيرات المرسلة', (data.reminders || []).map((r) => `${day(r.due_date)} (قبل ${count(r.offset_days, 'day')})`).join('، ')] : null,
          ].filter(Boolean),
        ),
        extraActions,
      ),
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      it.under_review
        ? { label: 'حفظ وتأكيد', variant: 'primary', icon: 'check', onClick: async () => ((await save({ confirm: true })) ? ((changed = true), undefined) : false) }
        : { label: 'حفظ', variant: 'primary', icon: 'check', onClick: async () => ((await save()) ? ((changed = true), undefined) : false) },
    ],
    onClose: () => {
      if (!changed) return;
      if (it.under_review) toast('أُكّد العنصر في الذاكرة القانونية.', 'success');
      if (onDone) onDone();
    },
  });
  return handle;
}

/** إضافة عنصر ذاكرة من فريق المكتب: اختيار النوع ثم نموذج البوابة نفسه + ملاحظات داخلية + ملفات */
export async function createMemoryItem({ company, user = {}, onDone } = {}) {
  const { coMemoryForm } = await import('../../../lib/company-forms.js');
  const companyId = company.company.id;
  const fctx = await memoryFormContext(companyId, company);
  let kind = 'contract';
  let mf = null;
  const formHost = h('div');
  const notes = h('textarea.input', { rows: 3, maxlength: 4000, dir: 'auto', 'aria-label': 'ملاحظات داخلية' });
  const fileIn = fileInput({ accept: MEMORY_ACCEPT, maxFiles: 5, label: 'المستندات' });
  const alertHost = h('div.cs-alert');
  const drawForm = () => {
    mf = coMemoryForm(kind, {}, { staff: true, admin: true, entities: fctx.entities, counterparties: fctx.counterparties });
    mount(formHost, mf.el);
  };
  const kindSel = h('select.input', { 'aria-label': 'النوع', onChange: (e) => ((kind = e.target.value), drawForm()) }, MEMORY_KINDS.map((k) => h('option', { value: k.key }, k.label)));
  drawForm();
  let created = null;
  const isDirty = () => Object.keys(mf?.values() || {}).some((k) => !['access', 'remind_days', 'currency', 'renewal_type', 'recurrence'].includes(k)) || notes.value.trim() !== '' || fileIn.getFiles().length > 0;
  modal({
    sheet: true,
    className: 'cs-sheet cs-sheet-lg cs-memory',
    title: 'إضافة عنصر إلى الذاكرة القانونية',
    subtitle: company.company.name,
    beforeClose: discardGuard(isDirty, { singular: true }),
    body: h(
      'div.cs-body',
      alertHost,
      h('div.field', h('label.field-label', 'النوع'), h('div.select-wrap', kindSel)),
      formHost,
      h('div.field', h('label.field-label', 'ملاحظات داخلية'), notes, h('p.field-hint', 'لفريق المكتب فقط؛ لا تراها الشركة ولا المحامون.')),
      fileIn.el,
    ),
    actions: [
      { label: 'إلغاء', variant: 'ghost' },
      {
        label: 'إضافة',
        variant: 'primary',
        icon: 'plus',
        onClick: async () => {
          mount(alertHost, null);
          const vr = mf.validate();
          if (!vr.ok) return false;
          try {
            const body = { kind, ...vr.values, staff_notes: notes.value.trim() || undefined };
            if (fileIn.getFiles().length) body.files = await filesToUploads(fileIn.getFiles());
            created = await api.post(`/admin/companies/${companyId}/memory`, body);
            return undefined;
          } catch (err) {
            mf.showError(err);
            mount(alertHost, alertBox(errorMessage(err), 'danger'));
            return false;
          }
        },
      },
    ],
    onClose: () => {
      if (!created) return;
      toast('أُضيف العنصر إلى الذاكرة القانونية.', 'success');
      if (onDone) onDone(created);
    },
  });
}
