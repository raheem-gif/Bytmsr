// سجل الأمان — (الإصدار 9 — وحدة accounts)
// من فعل ماذا ومتى ومن أين: الدخول والمحاولات الفاشلة والإيقاف المؤقت، الدعوات وكلمات المرور والتحقق بخطوتين،
// تغيير الأدوار والإعدادات، روابط بوابة العملاء، والتصدير. مع تصفية وتقسيم صفحات وتصدير CSV.
import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadFile } from '../../../lib/api.js';
import { label, dateTime, relative, num, count, cairoDateToIso } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  table,
  kv,
  badge,
  statCard,
  button,
  asyncButton,
  toast,
  modal,
  filterBar,
  searchInput,
  selectInput,
  loading,
  errorState,
  emptyState,
  codeTag,
  ltr,
} from '../../../lib/ui.js';

const SEVERITY_TONES = { info: 'neutral', warning: 'warning', critical: 'danger' };
const GROUP_LABELS = {
  auth: 'الدخول والجلسات',
  account: 'الحسابات وكلمات المرور',
  user: 'المستخدمون والأدوار',
  portal: 'صفحة المتابعة',
  settings: 'الإعدادات',
  security: 'سياسة الأمان',
  integration: 'التكاملات',
  audit: 'سجل الأمان',
  system: 'إعداد المنصة وصيانتها',
  backup: 'النسخ الاحتياطي',
  whatsapp: 'قوالب واتساب',
  document: 'المستندات المرسلة',
  data: 'استيراد البيانات وتصديرها',
  impact: 'تقرير الأثر',
  calendar: 'اشتراك التقويم',
  ai: 'الذكاء الاصطناعي',
  program: 'البرامج والتمويل',
  print: 'الطباعة',
};
const FILTER_KEYS = ['q', 'type', 'severity', 'user_id', 'from', 'to'];

function severityBadge(sev) {
  return badge(label('security_severity', sev), SEVERITY_TONES[sev] || 'neutral', { dot: true });
}

function dataRows(data) {
  if (!data || typeof data !== 'object') return [];
  const LABELS = {
    username: 'اسم المستخدم المُدخل',
    reason: 'السبب',
    consecutive_failures: 'محاولات فاشلة متتالية',
    locked_until: 'موقوف حتى',
    method: 'الطريقة',
    target_user_id: 'رقم الحساب المعني',
    expires_at: 'صالح حتى',
    sessions_revoked: 'جلسات أُنهيت',
    count: 'العدد',
    rows: 'عدد الصفوف',
    remaining: 'المتبقي',
    role: 'الدور',
    from: 'من',
    to: 'إلى',
    fields: 'الحقول',
    client_id: 'رقم المستفيد/ة',
    intake_id: 'رقم الطلب الوارد',
    revoked: 'أُلغي',
    sent: 'أُرسل عبر واتساب',
    renamed: 'صُحح الاسم',
    previous_name: 'الاسم السابق',
    was_temporary: 'كانت كلمة المرور مؤقتة',
    alert: 'نُبّهت الإدارة',
    pledge_accepted_at: 'الإقرار بالتعهد بالسرية',
    filters: 'الفلاتر المطبقة',
    changes: 'التغييرات',
  };
  const REASONS = { password: 'كلمة مرور غير صحيحة', '2fa': 'رمز تحقق غير صحيح', unknown_user: 'اسم مستخدم غير موجود', inactive: 'حساب موقوف' };
  // أسماء الحقول والإعدادات بالعربية بدل مفاتيحها البرمجية
  const FIELD_NAMES = {
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'رقم الموبايل',
    security_require_2fa_admins: 'إلزام «إدارة النظام» بالتحقق بخطوتين',
    session_idle_hours: 'مهلة عدم النشاط (ساعات)',
    session_max_hours: 'الحد الأقصى لعمر الجلسة (ساعات)',
    invite_valid_hours: 'صلاحية رابط الدعوة (ساعات)',
    reset_valid_hours: 'صلاحية رابط إعادة التعيين (ساعات)',
    security_audit_retention_days: 'مدة الاحتفاظ بسجل الأمان (أيام)',
    security_totp_issuer: 'اسم الجهة في تطبيق المصادقة',
  };
  const plain = (x) => (typeof x === 'boolean' ? (x ? 'مفعّل' : 'غير مفعّل') : x === null || x === undefined ? '—' : String(x));
  const fmtVal = (k, v) => {
    if (v === null || v === undefined) return '—';
    if (k === 'reason') return REASONS[v] || String(v);
    if (k === 'fields' && Array.isArray(v)) return v.map((f) => FIELD_NAMES[f] || f).join('، ');
    if (k === 'changes' && typeof v === 'object' && !Array.isArray(v)) {
      return h(
        'ul.acc-change-list',
        Object.entries(v).map(([key, c]) => h('li', `${FIELD_NAMES[key] || key}: `, h('bdi', plain(c && c.from)), ' ← ', h('bdi', plain(c && c.to)))),
      );
    }
    if (k === 'role' || ((k === 'from' || k === 'to') && ['admin', 'case_manager', 'lawyer'].includes(v))) return label('user_role', v);
    if (k === 'method') return { invite: 'دعوة', temporary_password: 'كلمة مرور مؤقتة', password: 'كلمة مرور' }[v] || label('auth_method', v);
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return dateTime(v);
    if (Array.isArray(v)) return v.join('، ');
    if (typeof v === 'object') return h('code.acc-json', { dir: 'ltr' }, JSON.stringify(v));
    return String(v);
  };
  return Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [LABELS[k] || k, fmtVal(k, v)]);
}

function openEvent(e) {
  modal({
    title: e.type_label,
    size: 'md',
    body: h(
      'div.stack',
      h('p', e.summary),
      kv([
        ['الوقت', `${dateTime(e.created_at)} (${relative(e.created_at)})`],
        ['درجة الخطورة', severityBadge(e.severity)],
        ['نوع الحدث', codeTag(e.type)],
        ['المستخدم', e.actor_name ? `${e.actor_name}${e.actor_role ? ` — ${label('user_role', e.actor_role)}` : ''}` : 'زائر غير مسجل'],
        ['عنوان IP', e.ip ? ltr(e.ip) : null],
        ['الجهاز', e.device],
        ...dataRows(e.data),
      ]),
    ),
    actions: [{ label: 'إغلاق', variant: 'ghost' }],
  });
}

export default async function render(ctx) {
  const state = {
    q: ctx.query.q || '',
    type: ctx.query.type || '',
    severity: ctx.query.severity || '',
    user_id: ctx.query.user_id || '',
    from: ctx.query.from || '',
    to: ctx.query.to || '',
    page: Number(ctx.query.page) || 1,
  };
  const [facets, summary] = await Promise.all([api.get('/admin/audit/facets'), api.get('/admin/audit/summary')]);

  const filters = () => {
    const out = {};
    if (state.q) out.q = state.q;
    if (state.type) out.type = state.type;
    if (state.severity) out.severity = state.severity;
    if (state.user_id) out.user_id = state.user_id;
    if (state.from) out.from = cairoDateToIso(state.from);
    if (state.to) out.to = cairoDateToIso(state.to, true);
    return out;
  };
  function syncUrl() {
    const qs = new URLSearchParams();
    for (const k of FILTER_KEYS) if (state[k]) qs.set(k, state[k]);
    if (state.page > 1) qs.set('page', String(state.page));
    const s = qs.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/audit${s ? `?${s}` : ''}`);
  }

  // ───────────── الإحصاءات ─────────────
  const stats = h(
    'div.stats-grid.acc-stats',
    statCard({ label: 'دخول ناجح (24 ساعة)', value: num(summary.logins_24h), icon: 'user', tone: 'primary' }),
    statCard({ label: 'محاولات فاشلة (24 ساعة)', value: num(summary.failed_logins_24h), icon: 'alert', tone: summary.failed_logins_24h >= 10 ? 'danger' : 'warning', onClick: () => applyQuick({ type: 'auth.login_failed', severity: '' }) }),
    statCard({ label: 'إيقاف مؤقت (7 أيام)', value: num(summary.lockouts_7d), icon: 'lock', tone: summary.lockouts_7d ? 'danger' : 'success', hint: summary.locked_accounts ? `موقوف الآن: ${count(summary.locked_accounts, ['حساب واحد', 'حسابان', 'حسابات', 'حسابًا'])}` : null, onClick: () => applyQuick({ type: 'auth.lockout', severity: '' }) }),
    statCard({ label: 'أحداث حرجة (7 أيام)', value: num(summary.critical_7d), icon: 'shield', tone: summary.critical_7d ? 'danger' : 'success', onClick: () => applyQuick({ type: '', severity: 'critical' }) }),
    statCard({ label: 'جلسات نشطة الآن', value: num(summary.active_sessions), icon: 'globe', tone: 'info' }),
    statCard({ label: 'مديرو نظام بدون تحقق بخطوتين', value: num(summary.admins_without_2fa), icon: 'shieldCheck', tone: summary.admins_without_2fa ? 'warning' : 'success', href: '#/settings' }),
  );

  // ───────────── الفلاتر ─────────────
  const typeOptions = [
    ...facets.groups.filter((g) => GROUP_LABELS[g]).map((g) => ({ value: g, label: `كل أحداث: ${GROUP_LABELS[g]}` })),
    ...facets.types.map((t) => ({ value: t.value, label: t.count ? `${t.label} (${num(t.count)})` : t.label })),
  ];
  const search = searchInput({ placeholder: 'بحث في الوصف أو اسم المستخدم أو عنوان IP…', value: state.q, label: 'بحث في سجل الأمان', onSearch: (q) => { state.q = q; state.page = 1; load(); } });
  const typeSel = selectInput({ options: typeOptions, value: state.type, label: 'نوع الحدث', allLabel: 'كل الأنواع', onChange: (x) => { state.type = x; state.page = 1; load(); } });
  const sevSel = selectInput({ options: ['info', 'warning', 'critical'].map((s) => ({ value: s, label: label('security_severity', s) })), value: state.severity, label: 'درجة الخطورة', allLabel: 'كل الدرجات', onChange: (x) => { state.severity = x; state.page = 1; load(); } });
  const userSel = selectInput({ options: facets.users.map((u) => ({ value: String(u.id), label: `${u.name} — ${label('user_role', u.role)}` })), value: state.user_id, label: 'المستخدم', allLabel: 'كل المستخدمين', onChange: (x) => { state.user_id = x; state.page = 1; load(); } });
  const dateInput = (key, aria) =>
    h('input.input.acc-date', { type: 'date', dir: 'ltr', value: state[key], 'aria-label': aria, title: aria, onChange: (e) => { state[key] = e.target.value; state.page = 1; load(); } });
  const fromInput = dateInput('from', 'من تاريخ');
  const toInput = dateInput('to', 'إلى تاريخ');
  const clearBtn = button('مسح الفلاتر', { variant: 'ghost', size: 'sm', icon: 'x', onClick: clearAll });
  // سجل الأمان ببيانات المستخدمين وعناوين IP: رابط تنزيل لمرة واحدة بطلب POST بالفلاتر الحالية
  const exportBtn = asyncButton(
    'تصدير CSV',
    async () => {
      await downloadFile('/admin/audit/export.csv', filters(), { fallbackName: 'security-audit.csv' });
      toast('نُزّل ملف سجل الأمان (CSV)', 'success');
    },
    { variant: 'secondary', icon: 'download' },
  );

  function applyQuick(patch) {
    Object.assign(state, patch, { page: 1 });
    typeSel.querySelector('select').value = state.type;
    sevSel.querySelector('select').value = state.severity;
    load();
  }
  function clearAll() {
    Object.assign(state, { q: '', type: '', severity: '', user_id: '', from: '', to: '', page: 1 });
    search.querySelector('input').value = '';
    typeSel.querySelector('select').value = '';
    sevSel.querySelector('select').value = '';
    userSel.querySelector('select').value = '';
    fromInput.value = '';
    toInput.value = '';
    load();
  }

  // ───────────── النتائج ─────────────
  const results = h('div', loading());
  const totalEl = h('span.acc-total');
  let seq = 0;
  async function load() {
    const my = ++seq;
    syncUrl();
    const f = filters();
    clearBtn.hidden = !FILTER_KEYS.some((k) => state[k]);
    try {
      const res = await api.get('/admin/audit', { ...f, page: state.page, page_size: window.matchMedia('(max-width: 640px)').matches ? 20 : 50 });
      if (my !== seq) return;
      state.page = res.page;
      totalEl.textContent = res.total ? `${count(res.total, ['حدث واحد', 'حدثان', 'أحداث', 'حدثًا'])}` : '';
      if (!res.items.length) {
        mount(results, emptyState(FILTER_KEYS.some((k) => state[k]) ? 'لا توجد أحداث تطابق الفلاتر المحددة' : 'لم تُسجل أحداث أمان بعد', FILTER_KEYS.some((k) => state[k]) ? button('مسح الفلاتر', { variant: 'secondary', onClick: clearAll }) : null, { icon: 'shield' }));
        return;
      }
      mount(
        results,
        table({
          className: 'acc-audit-table',
          caption: 'أحداث سجل الأمان',
          rows: res.items,
          rowClass: (e) => `sev-${e.severity}`,
          onRowClick: (e) => openEvent(e),
          columns: [
            { key: 'time', label: 'الوقت', render: (e) => h('time.nowrap', { datetime: e.created_at, title: relative(e.created_at) }, dateTime(e.created_at)) },
            { key: 'severity', label: 'الخطورة', render: (e) => severityBadge(e.severity) },
            { key: 'type', label: 'الحدث', render: (e) => h('span.cell-title', e.type_label) },
            { key: 'actor', label: 'المستخدم', render: (e) => (e.actor_name ? h('div', h('span', e.actor_name), e.actor_role ? h('div.cell-sub', label('user_role', e.actor_role)) : null) : h('span.muted', 'زائر')) },
            { key: 'summary', label: 'الوصف', className: 'acc-col-summary', render: (e) => e.summary },
            { key: 'ip', label: 'العنوان والجهاز', render: (e) => (e.ip || e.device ? h('div', e.ip ? ltr(e.ip) : null, e.device ? h('div.cell-sub', e.device) : null) : null) },
          ],
        }),
        res.pages > 1
          ? h(
              'nav.acc-pager',
              { 'aria-label': 'صفحات النتائج' },
              button('السابق', { variant: 'secondary', size: 'sm', icon: 'chevronRight', disabled: res.page <= 1, onClick: () => { state.page = res.page - 1; load(); } }),
              h('span.acc-pager-text', `صفحة ${num(res.page)} من ${num(res.pages)}`),
              button('التالي', { variant: 'secondary', size: 'sm', iconEnd: 'chevronLeft', disabled: res.page >= res.pages, onClick: () => { state.page = res.page + 1; load(); } }),
            )
          : null,
      );
    } catch (err) {
      if (my !== seq) return;
      mount(results, errorState(err, load));
    }
  }
  load();

  return frag(
    pageHeader({
      title: 'سجل الأمان',
      subtitle: 'من فعل ماذا ومتى ومن أين: الدخول، الحسابات والصلاحيات، الإعدادات، وروابط صفحة المتابعة. لا يُعدَّل السجل ولا يُحذف من الواجهة.',
      breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'سجل الأمان' }],
      actions: exportBtn,
    }),
    stats,
    card({
      body: h(
        'div.stack',
        filterBar([search, typeSel, sevSel, userSel, h('div.acc-date-range', h('label.acc-date-label', 'من', fromInput), h('label.acc-date-label', 'إلى', toInput)), clearBtn]),
        h('div.acc-results-head', totalEl, h('span.small.muted', 'اضغط على أي حدث لعرض تفاصيله')),
        results,
      ),
    }),
  );
}

