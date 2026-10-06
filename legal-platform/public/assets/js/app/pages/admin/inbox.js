// صندوق الوارد الموحد: كل ما يصل من واتساب والموقع وأي قناة أخرى في قائمة واحدة للفرز.
// القناة (واتساب، الموقع…) ليست هي المصدر (إعلان فيسبوك، بحث جوجل…): نعرض الاثنين معًا.

import { h, frag, mount } from '../../../lib/h.js';
import { api, ApiError } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, governorateOptions, relative, dateTime, count } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  badge,
  statusBadge,
  icon,
  codeTag,
  emptyState,
  errorState,
  loading,
  filterBar,
  searchInput,
  selectInput,
  formDialog,
  toast,
} from '../../../lib/ui.js';

// ───────────── أدوات مشتركة لصفحات المسار (تُستورد من الصفحات الأخرى) ─────────────

/** أيقونة كل قناة تواصل. */
export const CHANNEL_ICONS = { whatsapp: 'whatsapp', website: 'globe', phone: 'phone', walk_in: 'user', email: 'mail' };

/** أيقونات القنوات التي تواصل منها العميل، مع اسم كل قناة لقارئات الشاشة. */
export function channelIcons(channels = [], { size = 16, withLabels = false } = {}) {
  const list = [...new Set((channels || []).filter(Boolean))];
  return h(
    'span.pa-chans',
    { class: withLabels && 'pa-chans-labeled' },
    list.map((c) =>
      h(
        'span.pa-chan',
        { class: `pa-chan-${c}`, title: label('channel', c) },
        icon(CHANNEL_ICONS[c] || 'message', { size }),
        withLabels ? h('span', label('channel', c)) : h('span.sr-only', label('channel', c)),
      ),
    ),
  );
}

/** «يشبه N حالات سابقة» بصيغة عربية سليمة. */
export function similarText(n) {
  return `يشبه ${count(n, ['حالة سابقة واحدة', 'حالتين سابقتين', 'حالات سابقة', 'حالة سابقة'])}`;
}

/** يحدّث استعلام الرابط الحالي دون إعادة عرض الصفحة (للحفاظ على الفلاتر عند الرجوع). */
export function replaceQuery(path, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  const hash = `#${path}${qs ? `?${qs}` : ''}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

/** خطأ تحقق مرتبط بحقل في النموذج (يظهر تحت الحقل وفي تنبيه النموذج). */
export function fieldError(name, message) {
  return new ApiError(message, { status: 422, code: 'validation', details: { fields: { [name]: message } } });
}

// ───────────── الصفحة ─────────────

const PAGE = 50;
const OPEN_STATUSES = ['new', 'in_review', 'awaiting_client'];
const CLOSED_STATUSES = ['handled_internally', 'converted', 'archived'];

const TABS = [
  { key: 'open', label: 'المفتوحة', count: (c) => OPEN_STATUSES.reduce((s, k) => s + (c[k] || 0), 0) },
  ...[...OPEN_STATUSES, ...CLOSED_STATUSES].map((s) => ({ key: s, label: label('intake_status', s), count: (c) => c[s] || 0 })),
  { key: 'all', label: 'الكل', count: (c) => Object.values(c).reduce((s, n) => s + (Number(n) || 0), 0) },
];

function apiQuery(state, offset = 0) {
  const q = { channel: state.channel, source: state.source, area: state.area, q: state.q, limit: PAGE, offset };
  if (state.tab === 'all') q.scope = 'all';
  else if (state.tab === 'open') q.scope = 'open';
  else q.status = state.tab;
  return q;
}

export default async function render(ctx) {
  const state = {
    tab: TABS.some((t) => t.key === ctx.query.status) ? ctx.query.status : 'open',
    q: ctx.query.q || '',
    channel: ctx.query.channel || '',
    source: ctx.query.source || '',
    area: ctx.query.area || '',
  };
  let data = await api.get('/admin/intakes', apiQuery(state));
  let items = data.items || [];
  let seq = 0;

  const tabBar = h('div.segmented.pa-tabs', { role: 'group', 'aria-label': 'تصفية حسب حالة الطلب' });
  const resultInfo = h('p.pa-result-info', { 'aria-live': 'polite' });
  const listHost = h('div');
  const moreHost = h('div.pa-more');

  function syncUrl() {
    replaceQuery('/inbox', { status: state.tab === 'open' ? '' : state.tab, q: state.q, channel: state.channel, source: state.source, area: state.area });
  }

  function hasFilters() {
    return Boolean(state.q || state.channel || state.source || state.area);
  }

  function drawTabs() {
    const counts = data.counts || {};
    mount(
      tabBar,
      TABS.map((t) =>
        h(
          'button.seg',
          { type: 'button', 'aria-pressed': String(state.tab === t.key), onClick: () => setTab(t.key) },
          t.label,
          h('span.tab-count', String(t.count(counts))),
        ),
      ),
    );
  }

  function setTab(key) {
    if (state.tab === key) return;
    state.tab = key;
    drawTabs();
    load();
  }

  async function load({ append = false } = {}) {
    const my = ++seq;
    syncUrl();
    if (!append) mount(listHost, loading('جارٍ تحميل الطلبات…'));
    try {
      const res = await api.get('/admin/intakes', apiQuery(state, append ? items.length : 0));
      if (my !== seq) return;
      data = res;
      items = append ? items.concat(res.items || []) : res.items || [];
      drawTabs();
      drawList();
    } catch (err) {
      if (my !== seq) return;
      if (append) toast(err.message, 'danger');
      else mount(listHost, errorState(err, () => load()));
    }
  }

  function row(it) {
    const ai = it.ai || null;
    const subject = it.title
      ? h('span.pa-irow-title', it.title)
      : ai && ai.title
        ? h(
            'span.pa-irow-title.is-ai',
            { title: 'عنوان مقترح من الذكاء الاصطناعي لم تعتمده الإدارة بعد' },
            icon('sparkle', { size: 14 }),
            h('span.pa-ai-tag', 'اقتراح'),
            h('span', ai.title),
          )
        : h('span.pa-irow-title.is-empty', 'لم يُحدَّد موضوع الطلب بعد');
    const area = it.legal_area
      ? badge(areaLabel(it.legal_area), 'primary')
      : ai && ai.legal_area
        ? badge(areaLabel(ai.legal_area), 'muted', { icon: 'sparkle', title: 'تصنيف مقترح من الذكاء الاصطناعي' })
        : null;
    const out = it.last_direction === 'out';
    const preview = it.last_message
      ? h(
          'p.pa-irow-preview',
          h(
            'span.pa-dir',
            { class: out ? 'is-out' : 'is-in' },
            icon(out ? 'arrowLeft' : 'arrowRight', { size: 13 }),
            out ? 'ردّنا:' : 'العميل:',
          ),
          h('span.pa-irow-preview-text', { dir: 'auto' }, it.last_message),
        )
      : null;
    const showStatus = !OPEN_STATUSES.includes(state.tab) && !CLOSED_STATUSES.includes(state.tab);
    const at = it.last_message_at || it.created_at;
    return h(
      'li',
      h(
        'a.pa-irow',
        { href: `#/inbox/${it.id}`, class: [it.unread_count > 0 && 'is-unread', `pa-st-${it.status}`] },
        h(
          'div.pa-irow-main',
          h(
            'div.pa-irow-head',
            codeTag(it.code),
            h('strong.pa-irow-name', it.contact_name || 'بدون اسم'),
            it.returning_client && badge('عميل سابق', 'accent', { icon: 'refresh', title: 'لهذا العميل طلبات سابقة لدى المؤسسة' }),
            it.client_code && h('span.pa-irow-client', { dir: 'ltr' }, it.client_code),
          ),
          h('div.pa-irow-subject', subject, area),
          preview,
          h(
            'div.pa-irow-meta',
            channelIcons(it.channels && it.channels.length ? it.channels : [it.first_channel]),
            statusBadge('source', it.source, { dot: false }),
            it.priority && it.priority !== 'normal' && statusBadge('priority', it.priority, { icon: it.priority === 'low' ? null : 'flag', dot: false }),
            showStatus && statusBadge('intake_status', it.status),
            h('span.pa-count', { title: 'عدد الرسائل' }, icon('message', { size: 14 }), h('span', String(it.messages_count || 0)), h('span.sr-only', 'رسائل')),
            it.documents_count > 0 &&
              h('span.pa-count', { title: 'عدد المرفقات' }, icon('paperclip', { size: 14 }), h('span', String(it.documents_count)), h('span.sr-only', 'مرفقات')),
            ai && ai.similar_count > 0 && badge(similarText(ai.similar_count), 'info', { icon: 'sparkle', title: 'حسب تحليل الذكاء الاصطناعي لملفات المؤسسة السابقة' }),
            ai && ai.missing_count > 0 && badge(`نواقص: ${ai.missing_count}`, 'warning', { title: 'معلومات أو مستندات ناقصة يقترحها الذكاء الاصطناعي' }),
          ),
        ),
        h(
          'div.pa-irow-side',
          h('time.pa-irow-time', { datetime: at, title: dateTime(at) }, relative(at)),
          it.unread_count > 0 &&
            h('span.pa-unread', { title: `${it.unread_count} رسالة غير مقروءة` }, String(it.unread_count), h('span.sr-only', ' غير مقروءة')),
          it.case_id && h('span.pa-irow-case', icon('briefcase', { size: 13 }), 'له ملف'),
        ),
      ),
    );
  }

  function drawList() {
    const total = Number(data.total) || 0;
    resultInfo.textContent = total
      ? `عدد الطلبات: ${total}${items.length < total ? ` — المعروض ${items.length}` : ''}`
      : '';
    if (!items.length) {
      const clear = hasFilters()
        ? button('مسح الفلاتر', {
            icon: 'x',
            onClick: () => {
              Object.assign(state, { q: '', channel: '', source: '', area: '' });
              mount(filtersHost, buildFilters());
              load();
            },
          })
        : null;
      const text = hasFilters()
        ? 'لا توجد طلبات تطابق البحث أو الفلاتر المختارة'
        : state.tab === 'open'
          ? 'لا توجد طلبات مفتوحة تنتظر الفرز الآن'
          : 'لا توجد طلبات في هذه الحالة';
      mount(listHost, card({ body: emptyState(text, clear, { icon: 'inbox' }) }));
      mount(moreHost);
      return;
    }
    mount(listHost, card({ flush: true, body: h('ul.pa-ilist', { 'aria-label': 'الطلبات الواردة' }, items.map(row)) }));
    mount(
      moreHost,
      items.length < total &&
        button(`عرض المزيد (${total - items.length})`, { icon: 'chevronDown', onClick: (e) => {
          e.currentTarget.disabled = true;
          load({ append: true });
        } }),
    );
  }

  const filtersHost = h('div');
  function buildFilters() {
    return filterBar([
      searchInput({
        placeholder: 'ابحث برقم الطلب أو الاسم أو الهاتف أو نص الرسائل…',
        label: 'بحث في الطلبات',
        value: state.q,
        onSearch: (v) => {
          state.q = v;
          load();
        },
      }),
      selectInput({
        label: 'قناة التواصل',
        allLabel: 'كل القنوات',
        options: options('channel'),
        value: state.channel,
        onChange: (v) => {
          state.channel = v;
          load();
        },
      }),
      selectInput({
        label: 'مصدر العميل',
        allLabel: 'كل المصادر',
        options: options('source'),
        value: state.source,
        onChange: (v) => {
          state.source = v;
          load();
        },
      }),
      selectInput({
        label: 'المجال القانوني',
        allLabel: 'كل المجالات',
        options: areaOptions(),
        value: state.area,
        onChange: (v) => {
          state.area = v;
          load();
        },
      }),
    ]);
  }
  mount(filtersHost, buildFilters());

  async function manualIntake() {
    const created = await formDialog({
      title: 'تسجيل طلب يدوي',
      intro:
        'للطلبات التي تصل بمكالمة هاتفية أو حضور شخصي أو بريد إلكتروني. يدخل الطلب نفس محرك الاستقبال، ويُربط بالعميل تلقائيًا إن كان رقمه أو بريده مسجلًا من قبل.',
      size: 'lg',
      submitLabel: 'تسجيل الطلب',
      values: { channel: 'phone', source: 'unknown' },
      fields: [
        {
          name: 'channel',
          label: 'كيف وصل الطلب؟ (القناة)',
          type: 'select',
          required: true,
          placeholder: false,
          options: ['phone', 'walk_in', 'email'].map((v) => ({ value: v, label: label('channel', v) })),
        },
        { name: 'name', label: 'اسم العميل', maxLength: 150, autocomplete: 'off' },
        { name: 'phone', label: 'رقم الموبايل', type: 'phone', hint: 'مطلوب للمكالمات والحضور الشخصي' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', hint: 'مطلوب إذا وصل الطلب بالبريد' },
        { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions() },
        { name: 'source', label: 'كيف عرف العميل بالمؤسسة؟ (المصدر)', type: 'select', placeholder: false, options: options('source') },
        { name: 'campaign', label: 'الحملة أو جهة الإحالة', maxLength: 150, hint: 'اختياري — مثل اسم الإعلان أو الجمعية المحيلة', full: true },
        { name: 'text', label: 'وصف الطلب كما رواه العميل', type: 'textarea', required: true, minLength: 10, maxLength: 20000, rows: 5 },
      ],
      onSubmit: async (v) => {
        if (v.channel !== 'email' && !v.phone) throw fieldError('phone', 'رقم الموبايل مطلوب للمكالمات والحضور الشخصي');
        if (v.channel === 'email' && !v.email) throw fieldError('email', 'البريد الإلكتروني مطلوب للطلبات الواردة بالبريد');
        return api.post('/admin/intakes', {
          channel: v.channel,
          name: v.name || undefined,
          phone: v.phone || undefined,
          email: v.email || undefined,
          governorate: v.governorate || undefined,
          source: v.source || undefined,
          campaign: v.campaign || undefined,
          text: v.text,
        });
      },
    });
    if (created && created.id) {
      toast(`تم تسجيل الطلب ${created.code}`, 'success');
      ctx.navigate(`/inbox/${created.id}`);
    }
  }

  drawTabs();
  drawList();

  const header = pageHeader({
    title: 'صندوق الوارد الموحد',
    subtitle: 'كل ما يصل من واتساب والموقع وأي قناة أخرى يظهر هنا في مكان واحد',
    breadcrumbs: [{ label: 'لوحة المتابعة', href: '#/dashboard' }, { label: 'صندوق الوارد الموحد' }],
    meta: h(
      'p.pa-principle',
      icon('info', { size: 15 }),
      h('span', h('strong', 'القناة'), ' هي طريقة التواصل (واتساب، الموقع…)، و', h('strong', 'المصدر'), ' هو ما جاء بالعميل (إعلان، بحث، إحالة…). والرسالة لا تصبح ملفًا إلا بقرار من الإدارة.'),
    ),
    actions: [
      button('تحديث', { variant: 'ghost', icon: 'refresh', onClick: () => load() }),
      button('تسجيل طلب يدوي', { variant: 'primary', icon: 'plus', onClick: manualIntake }),
    ],
  });

  return frag(header, h('div.pa-tabs-wrap', tabBar), filtersHost, resultInfo, listHost, moreHost);
}
