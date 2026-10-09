// صندوق الوارد الموحد: كل ما يصل من واتساب والموقع وأي قناة أخرى في قائمة واحدة للفرز.
// القناة (واتساب، الموقع…) ليست هي المصدر (إعلان فيسبوك، بحث جوجل…): نعرض الاثنين معًا.

import { h, mount } from '../../../lib/h.js';
import { api, ApiError } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, governorateOptions, relative, dateTime, count } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  asyncButton,
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
  richText,
  modal,
} from '../../../lib/ui.js';
// v11 segment-staff (ST-1): نوع الخدمة — المفتاح والرقائق وتسجيل الطلب اليدوي
import { segmentSwitch, segmentChip, hintChip, mismatchChip, lineMismatchChip, segLabel, parseSeg, SEGMENT_TITLE } from '../../components/segment-ui.js';

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

/**
 * يعيد عرض الصفحة بعد إجراء ثم يضع التركيز على عنصر مناسب (أو المحتوى الرئيسي)
 * حتى لا يضيع مستخدم لوحة المفاتيح بعد اختفاء الزر الذي ضغطه.
 */
export async function reloadAndFocus(ctx, selector) {
  await ctx.reload();
  const active = document.activeElement;
  if (active && active !== document.body && active.isConnected) return;
  const el = (selector && document.querySelector(selector)) || document.getElementById('main');
  if (!el) return;
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/** خطأ تحقق مرتبط بحقل في النموذج (يظهر تحت الحقل وفي تنبيه النموذج). */
export function fieldError(name, message) {
  return new ApiError(message, { status: 422, code: 'validation', details: { fields: { [name]: message } } });
}

// ───────────── الصفحة ─────────────

const PAGE = 50;
const PRIORITY_FILTERS = [
  { value: 'high_or_urgent', label: 'عاجلة أو عالية' },
  ...['urgent', 'high', 'normal', 'low'].map((v) => ({ value: v, label: label('priority', v) })),
];
const OPEN_STATUSES = ['new', 'in_review', 'awaiting_client'];
const CLOSED_STATUSES = ['handled_internally', 'converted', 'archived'];

const TABS = [
  { key: 'open', label: 'المفتوحة', count: (c) => OPEN_STATUSES.reduce((s, k) => s + (c[k] || 0), 0) },
  // v11 segment-staff: مسمى الحالة يُقرأ عند الرسم (بعد /api/meta) لا عند تحميل الوحدة — كان يظهر أحيانًا المفتاح الخام
  ...[...OPEN_STATUSES, ...CLOSED_STATUSES].map((s) => ({ key: s, get label() { return label('intake_status', s); }, count: (c) => c[s] || 0 })),
  { key: 'all', label: 'الكل', count: (c) => Object.values(c).reduce((s, n) => s + (Number(n) || 0), 0) },
];

// v9.2 (admin-ai) — القصص: طريقة العرض (بطاقات الفرز أو القائمة) وتصفية حسب حالة القصة
const VIEW_KEY = 'bm.inbox.view';
const STORY_FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'callback', label: 'طلبت مكالمة' },
  { key: 'ready', label: 'جاهزة للقرار' },
  { key: 'collecting', label: 'القصة لسه بتتكتب' },
  { key: 'stale', label: 'وصل جديد بعد الملخص' },
  { key: 'awaiting', label: 'بانتظار ردها' },
  { key: 'voice', label: 'رسائل صوتية لم تُكتب' },
];
const STORY_EMPTY = {
  ready: 'لا توجد قصص جاهزة للقرار الآن.',
  collecting: 'لا توجد قصص تُكتب الآن.',
  callback: 'لا توجد طلبات مكالمة الآن.',
};
const TRACK_ICONS = { consultation: 'briefcase', matter: 'gavel', internal: 'send', refer: 'send', need_info: 'message' };
const MINUTES = ['دقيقة واحدة', 'دقيقتين', 'دقائق', 'دقيقة'];

// v11 segment-staff (ST-1): مفتاح نوع الخدمة يُتذكَّر في المتصفح (والرابط ?segment= يغلبه)
const SEG_KEY = 'bm.inbox.seg';
const SEG_FILTERS = ['charity', 'paid', 'unset'];
function readSeg() {
  try {
    const v = window.localStorage.getItem(SEG_KEY);
    return SEG_FILTERS.includes(v) ? v : '';
  } catch {
    return '';
  }
}
function saveSeg(v) {
  try {
    if (v) window.localStorage.setItem(SEG_KEY, v);
    else window.localStorage.removeItem(SEG_KEY);
  } catch {
    /* تخزين المتصفح غير متاح: يبقى الاختيار لهذه الزيارة فقط */
  }
}
/** حبة محايدة بأيقونة داخل بطاقة الفرز (r2 P12: لا برتقالي ولا ذهبي ولا أخضر غير رقاقة النوع) */
function quietPill(text, iconName, { className, title } = {}) {
  return h('span.pill.pill-neutral', { class: className, title }, iconName && icon(iconName, { size: 14 }), h('span', text));
}

function readView() {
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    return v === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}
function saveView(v) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* تخزين المتصفح غير متاح: يبقى الاختيار لهذه الزيارة فقط */
  }
}

function apiQuery(state, offset = 0) {
  const q = { channel: state.channel, source: state.source, area: state.area, priority: state.priority, q: state.q, segment: state.seg || undefined, limit: PAGE, offset };
  if (state.tab === 'all') q.scope = 'all';
  else if (state.tab === 'open') q.scope = 'open';
  else q.status = state.tab;
  if (state.story && state.tab === 'open') q.story = state.story;
  if (state.view === 'cards') q.sort = 'triage';
  return q;
}

export default async function render(ctx) {
  const state = {
    tab: TABS.some((t) => t.key === ctx.query.status) ? ctx.query.status : 'open',
    q: ctx.query.q || '',
    channel: ctx.query.channel || '',
    source: ctx.query.source || '',
    area: ctx.query.area || '',
    priority: PRIORITY_FILTERS.some((p) => p.value === ctx.query.priority) ? ctx.query.priority : '',
    story: STORY_FILTERS.some((f) => f.key && f.key === ctx.query.story) ? ctx.query.story : '',
    view: readView(),
    seg: SEG_FILTERS.includes(ctx.query.segment) ? ctx.query.segment : readSeg(),
  };
  if (state.tab !== 'open') state.story = '';
  let data = await api.get('/admin/intakes', apiQuery(state));
  let items = data.items || [];
  let seq = 0;

  const tabBar = h('div.segmented.pa-tabs', { role: 'group', 'aria-label': 'تصفية حسب حالة الطلب' });
  const resultInfo = h('p.pa-result-info', { 'aria-live': 'polite' });
  const listHost = h('div');
  const moreHost = h('div.pa-more');
  const storyBar = h('div.pa-story-filters', { role: 'group', 'aria-label': 'حالة القصة' });
  const viewSwitch = h('div.segmented.pa-viewswitch', { role: 'group', 'aria-label': 'طريقة العرض' });
  // v11 segment-staff (ST-1): «الكل · خيري · أفراد وشركات · غير محدد» بأعداد الطلبات المفتوحة تحت الفلاتر الأخرى
  // (segment_counts)؛ تحت 600px المسميات القصيرة بلا أيقونات (CSS في v11-segment.css)
  // review: segment_counts = الطلبات المفتوحة؛ تظهر الأعداد في تبويب «المفتوحة» وحده حيث تساوي ما في القائمة
  const segCounts = (res) => (state.tab === 'open' ? (res && res.segment_counts) || null : null);
  const segSwitch = segmentSwitch({
    value: state.seg,
    counts: segCounts(data),
    onChange: (v) => {
      state.seg = v || '';
      saveSeg(state.seg);
      load();
    },
  });
  // r2 P21: على الهاتف تصير الفلاتر حبة واحدة «تصفية» (بعدد المفعّل منها) تفتح ورقة
  const filterPill = h('button.pa-filter-pill', { type: 'button', 'aria-haspopup': 'dialog', onClick: () => openFilterSheet() });
  const countLine = h('span.pa-count-line');

  function syncUrl() {
    replaceQuery('/inbox', {
      segment: state.seg,
      status: state.tab === 'open' ? '' : state.tab,
      story: state.story,
      q: state.q,
      channel: state.channel,
      source: state.source,
      area: state.area,
      priority: state.priority,
    });
  }

  function hasFilters() {
    return Boolean(state.q || state.channel || state.source || state.area || state.priority);
  }

  function activeFilters() {
    return [state.q, state.channel, state.source, state.area, state.priority].filter(Boolean).length;
  }

  function drawFilterPill() {
    const n = activeFilters();
    filterPill.classList.toggle('is-active', n > 0);
    filterPill.setAttribute('aria-label', n ? `تصفية — المفعّل: ${n}` : 'تصفية');
    mount(filterPill, icon('filter', { size: 16 }), h('span', 'تصفية'), n ? h('span.count.pa-filter-n', { 'aria-hidden': 'true' }, String(n)) : null);
  }

  /** سطر الأعداد تحت العنوان (V11-46): «22 طلبًا مفتوحًا · جاهزة للقرار: 15 · طلبت مكالمة: 2» */
  function drawCountLine() {
    const c = data.counts || {};
    const sc = data.story_counts || {};
    const open = OPEN_STATUSES.reduce((s, k) => s + (Number(c[k]) || 0), 0);
    const bits = [count(open, ['طلب مفتوح واحد', 'طلبان مفتوحان', 'طلبات مفتوحة', 'طلبًا مفتوحًا'])];
    if (Number(sc.ready) > 0) bits.push(`جاهزة للقرار: ${sc.ready}`);
    // «طلبت مكالمة» تظهر في رقائق القصة أيضًا، فتُخفى من هذا السطر على الهاتف ليبقى سطرًا واحدًا
    mount(countLine, bits.join(' · '), Number(sc.callback) > 0 ? h('span.pa-count-callback', ` · طلبت مكالمة: ${sc.callback}`) : null);
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

  function drawStoryBar() {
    storyBar.hidden = state.tab !== 'open';
    const sc = data.story_counts || {};
    mount(
      storyBar,
      STORY_FILTERS.map((f) =>
        h(
          'button.pa-sf',
          {
            type: 'button',
            class: f.key && `pa-sf-${f.key}`,
            'aria-pressed': String(state.story === f.key),
            onClick: () => {
              if (state.story === f.key) return;
              state.story = f.key;
              drawStoryBar();
              load();
            },
          },
          f.key === 'callback' ? icon('phone', { size: 14 }) : f.key === 'voice' ? icon('mic', { size: 14 }) : null,
          f.key ? `${f.label} (${Number(sc[f.key]) || 0})` : f.label,
        ),
      ),
    );
  }

  function drawViewSwitch() {
    mount(
      viewSwitch,
      [
        ['cards', 'بطاقات', 'grid'],
        ['list', 'قائمة', 'list'],
      ].map(([v, text, ic]) =>
        h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(state.view === v),
            onClick: () => {
              if (state.view === v) return;
              state.view = v;
              saveView(v);
              drawViewSwitch();
              load();
            },
          },
          icon(ic, { size: 16 }),
          text,
        ),
      ),
    );
  }

  function setTab(key) {
    if (state.tab === key) return;
    state.tab = key;
    if (key !== 'open') state.story = '';
    drawTabs();
    drawStoryBar();
    load();
  }

  async function load({ append = false } = {}) {
    const my = ++seq;
    syncUrl();
    if (!append) mount(listHost, loading('جارٍ تحميل الطلبات…'));
    try {
      const res = await api.get('/admin/intakes', apiQuery(state, append ? items.length : 0));
      if (my !== seq) return;
      const before = items.length;
      data = res;
      items = append ? items.concat(res.items || []) : res.items || [];
      drawTabs();
      drawStoryBar();
      segSwitch.update({ counts: segCounts(res) });
      drawFilterPill();
      drawCountLine();
      drawList();
      if (append) {
        const next = listHost.querySelectorAll(state.view === 'cards' ? '.pa-story-name' : '.pa-irow')[before];
        if (next) next.focus();
      }
    } catch (err) {
      if (my !== seq) return;
      if (append) toast(err.message, 'danger');
      else mount(listHost, errorState(err, () => load()));
    }
  }

  /** اقتراح نوع لطلب «غير محدد»، و«يبدو أفراد وشركات» لطلب خيري، و«كتب على …» / رقم غير مضبوط */
  function segExtras(it) {
    const hint = it.segment_hint || null;
    return [
      !it.segment && hint ? hintChip(hint) : null,
      it.segment === 'charity' && hint && hint.segment === 'paid' ? mismatchChip(hint) : null,
      it.line_mismatch ? lineMismatchChip(it.line_mismatch) : null,
      it.wa_line === 'unknown' ? quietPill(segLabel('wa_line', 'unknown'), 'alert', { className: 'seg-line is-unknown' }) : null,
    ];
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
    // v11 segment-staff (L11-16 r2): الأخضر والذهبي لنوع الخدمة وحده — المجال حبة محايدة
    const area = it.legal_area
      ? badge(areaLabel(it.legal_area), 'neutral')
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
            out ? 'ردّنا:' : 'المستفيد/ة:',
          ),
          h('span.pa-irow-preview-text', { dir: 'auto' }, richText(it.last_message)),
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
            it.returning_client && badge('مستفيد/ة سابق/ة', 'neutral', { icon: 'refresh', title: 'لهذا المستفيد/ة طلبات سابقة لدى المؤسسة' }),
            it.client_code && h('span.pa-irow-client', { dir: 'ltr' }, it.client_code),
          ),
          h('div.pa-irow-subject', subject, area),
          preview,
          h(
            'div.pa-irow-meta',
            // v11 segment-staff (ST-1): نوع الخدمة أول ما في سطر البيانات (نص + أيقونة)، والاقتراح/اختلاف الرقم حبات محايدة
            segmentChip(it.segment, { source: it.segment_source, requesterKind: it.requester_kind }),
            segExtras(it),
            channelIcons(it.channels && it.channels.length ? it.channels : [it.first_channel]),
            // المصدر حبة محايدة: البرتقالي/الذهبي لا يشتبه بنوع الخدمة (L11-16 r2)
            badge(label('source', it.source), 'neutral'),
            it.priority && it.priority !== 'normal' && statusBadge('priority', it.priority, { icon: it.priority === 'low' ? null : 'flag', dot: false }),
            showStatus && statusBadge('intake_status', it.status),
            h('span.pa-count', { title: 'عدد الرسائل' }, icon('message', { size: 14 }), h('span', String(it.messages_count || 0)), h('span.sr-only', 'رسائل')),
            it.documents_count > 0 &&
              h('span.pa-count', { title: 'عدد المرفقات' }, icon('paperclip', { size: 14 }), h('span', String(it.documents_count)), h('span.sr-only', 'مرفقات')),
            ai && ai.similar_count > 0 && badge(similarText(ai.similar_count), 'info', { icon: 'sparkle', title: 'حسب تحليل الذكاء الاصطناعي لملفات المؤسسة السابقة' }),
            ai && ai.missing_count > 0 && badge(`نواقص: ${ai.missing_count}`, 'warning', { title: 'معلومات أو مستندات ناقصة يقترحها الذكاء الاصطناعي' }),
            // v9.2: حالة القصة والمسار المقترح في القائمة أيضًا
            it.story && it.story.view && it.story.view !== 'decided' && h('span.pa-irow-story', { class: `is-${it.story.view}` }, label('story_view', it.story.view)),
            ai && ai.track && OPEN_STATUSES.includes(it.status) && quietPill(`المقترح: ${label('story_track', ai.track)}`, 'sparkle'),
          ),
        ),
        h(
          'div.pa-irow-side',
          h('time.pa-irow-time', { datetime: at, title: dateTime(at) }, relative(at)),
          it.unread_count > 0 &&
            h('span.pa-unread', { title: count(it.unread_count, ['رسالة غير مقروءة', 'رسالتان غير مقروءتين', 'رسائل غير مقروءة', 'رسالة غير مقروءة']) }, String(it.unread_count), h('span.sr-only', ' غير مقروءة')),
          it.case_id && h('span.pa-irow-case', icon('briefcase', { size: 13 }), 'له ملف'),
        ),
      ),
    );
  }

  // ───────────── v9.2 بطاقات الفرز (A92-17) ─────────────
  const sheetMod = () => import('../../components/story-sheet.js');
  const callMod = () => import('../../components/call-note.js');

  function afterDecision(res) {
    if (res && res.next) ctx.navigate(res.next);
    else load();
  }

  async function openSheet(it, extra = {}) {
    const { openStorySheet } = await sheetMod();
    await openStorySheet({
      intakeId: it.id,
      name: it.contact_name || null,
      userId: ctx.user && ctx.user.id,
      onDone: afterDecision,
      onCalled: () => load(),
      onReview: () => ctx.navigate(`/inbox/${it.id}?focus=chat`),
      segmentHint: it.segment_hint || null, // v11 segment-staff
      requesterKind: it.requester_kind || null,
      ...extra,
    });
  }

  /**
   * «سجّل المكالمة» / «اتصل بها» من البطاقة: الاقتراح (للإدارة فقط) يعطي سطر المكالمة ورقمها للاتصال —
   * القائمة نفسها تبقى بلا أرقام هواتف (S-22)، والرقم يظهر فقط في نافذة المكالمة.
   */
  async function logCall(it, proposal = null) {
    const [{ openCallNote }, p] = await Promise.all([callMod(), proposal ? Promise.resolve(proposal) : api.get(`/admin/intakes/${it.id}/proposal`)]);
    const r = await openCallNote({
      intake: {
        id: it.id,
        code: it.code,
        unconfirmed: Boolean(it.identity_unconfirmed),
        callIntro: p && p.actions ? p.actions.call_intro : null,
        phone: p && p.identity ? p.identity.phone : null,
        form: (p && p.identity && p.identity.form) || it.address_form || 'f',
      },
      script: p && p.actions && p.actions.primary === 'call' ? p.actions.call_script : null,
    });
    if (r) await load();
  }

  async function logAttempt(it) {
    const { openCallAttempt } = await callMod();
    const a = await openCallAttempt({ intakeId: it.id, code: it.code });
    if (a) await load();
  }

  async function callFirst(it) {
    await logCall(it, await api.get(`/admin/intakes/${it.id}/proposal`));
  }

  async function summarizeNow(it) {
    const r = await api.post(`/admin/intakes/${it.id}/story/ready`, {});
    await load();
    await openSheet(it, { proposal: r.proposal });
  }

  async function analyzeNow(it) {
    await api.post(`/admin/intakes/${it.id}/analyze`);
    toast('اكتمل تحليل الذكاء الاصطناعي', 'success');
    await load();
  }

  function ribbon(it, view) {
    const st = it.story || {};
    const ai = it.ai || null;
    const quiet = Number(st.quiet_minutes) || 10;
    const line = (b, text) => h('div.pa-story-ribbon', { class: `is-${view}` }, b, text ? h('span.pa-story-ribbon-text', text) : null);
    switch (view) {
      case 'callback':
        return line(badge('طلبت مكالمة', 'info', { icon: 'phone' }), `لم تحكِ مشكلتها بعد — الوقت المناسب: ${(it.form && it.form.callback_label) || 'أي وقت'}`);
      case 'collecting':
        return line(
          h('span.badge.badge-info.pa-story-live', h('span.pa-live-dot', { 'aria-hidden': 'true' }), h('span', 'القصة لسه بتتكتب…')),
          `آخر رسالة ${relative(it.last_message_at || it.created_at)} — تُلخَّص تلقائيًا بعد ${count(quiet, MINUTES)} بلا رسائل`,
        );
      case 'blocked':
        return line(badge(st.media_failed ? 'تعذّر تنزيل رسالة صوتية' : 'فيها رسالة صوتية لم تُكتب', 'warning', { icon: 'mic' }), null);
      case 'stale':
        return line(badge(`وصل جديد بعد الملخص (${Number(st.new_since_summary) || 0})`, 'warning', { icon: 'refresh' }), null);
      case 'awaiting':
        return line(badge('بانتظار ردها', 'neutral', { icon: 'clock' }), it.last_direction === 'out' && it.last_message_at ? `سألناها ${relative(it.last_message_at)}` : null);
      case 'decided':
        return line(badge('تم القرار', 'muted', { icon: 'checkCircle' }), st.resolution_kind_label || label('intake_status', it.status));
      default:
        return line(badge('جاهزة للقرار', 'success', { icon: 'checkCircle' }), ai && ai.analyzed_at ? `اتلخّصت ${relative(ai.analyzed_at)}` : null);
    }
  }

  function storyCard(it) {
    const st = it.story || {};
    const ai = it.ai || null;
    const open = OPEN_STATUSES.includes(it.status);
    const view = st.view || (open ? 'ready' : 'decided');
    const at = it.last_message_at || it.created_at;
    const nameId = `pa-story-${it.id}`;
    const voiceMissing = st.voice ? Number(st.voice.missing) || 0 : 0;
    const form = it.form || null;

    // سطر واحد: ملخص الذكاء الاصطناعي، أو اختياراتها في الموقع لطلب المكالمة
    let summary;
    if (view === 'callback' && form && form.lines && form.lines.length) {
      const lines = form.lines.filter((x) => !/^طلبت مكالمة/.test(x));
      summary = h('p.pa-story-line.is-form', { title: form.title || '' }, icon('globe', { size: 14 }), h('span', lines.length ? lines.join(' · ') : 'لم تختر موضوعًا'));
    } else if (ai && (ai.one_line || ai.title)) {
      summary = h(
        'p.pa-story-line',
        h('span.pa-ai-mark', icon('sparkle', { size: 14 }), h('span.pa-ai-tag', 'اقتراح')),
        ai.preview && badge('ملخص مبدئي', 'muted'),
        h('span.pa-story-line-text', { dir: 'auto' }, ai.one_line || ai.title),
      );
    } else {
      summary = h('p.pa-story-line.is-empty', it.title || (it.last_message ? h('span', { dir: 'auto' }, it.last_message) : 'لم يُحدَّد موضوع الطلب بعد'));
    }

    const urgent = (ai && ['high', 'urgent'].includes(ai.urgency) ? ai.urgency : null) || (['high', 'urgent'].includes(it.priority) ? it.priority : null);
    const chipsRow = h(
      'div.pa-story-chips',
      // V11-47: سطر البيانات = الكود ثم حبات قليلة (الرأس: القناة · الاسم · النوع · الوقت)
      codeTag(it.code, { className: 'pa-story-code' }),
      // r2 P12: اقتراح الذكاء الاصطناعي وحبات التنبيه محايدة بأيقونتها (الألوان لنوع الخدمة والحالات وحدها)
      ai && ai.track && open && quietPill(`المقترح: ${label('story_track', ai.track)}`, 'sparkle', { className: 'pa-story-track' }),
      urgent && statusBadge('priority', urgent, { icon: 'flag', dot: false }),
      voiceMissing > 0 && quietPill(`${voiceMissing} لم تُكتب`, 'mic', { className: 'pa-story-voice', title: 'رسائل صوتية لم تكتبها الإدارة بعد' }),
      st.topic_label && badge(`الموضوع: ${st.topic_label}`, 'neutral'),
      it.documents_count > 0 && h('span.pa-count', { title: 'عدد المرفقات' }, icon('paperclip', { size: 14 }), h('span', String(it.documents_count)), h('span.sr-only', 'مرفقات')),
      it.identity_unconfirmed && quietPill('رقم غير مؤكد', 'shield'),
      segExtras(it),
      view !== 'callback' && form && form.callback && badge(`طلبت مكالمة (${form.callback_label || 'أي وقت'})`, 'info', { icon: 'phone' }),
      Number(st.call_attempts) > 0 && badge(`محاولات الاتصال: ${st.call_attempts}`, 'neutral', { icon: 'phone-off' }),
    );

    // الزر الأساسي حسب حالة القصة والمسار
    const btnOpts = (ic) => ({ variant: 'primary', icon: ic, className: 'pa-story-primary' });
    let actions = [];
    if (open) {
      const track = ai && ai.track;
      if (view === 'callback') {
        actions = [
          asyncButton('سجّل المكالمة', () => logCall(it), btnOpts('phone')),
          asyncButton(it.address_form === 'm' ? 'لم يرد' : 'لم ترد', () => logAttempt(it), { icon: 'phone-off', className: 'pa-story-noanswer' }),
        ];
      } else if (view === 'blocked') {
        actions = [button('اسمع الرسالة الصوتية', { ...btnOpts('mic'), href: `#/inbox/${it.id}?focus=voice` })];
      } else if (view === 'collecting') {
        actions = [asyncButton('لخّصها الآن', () => summarizeNow(it), btnOpts('sparkle'))];
      } else if (view === 'awaiting') {
        actions = [];
      } else if (!ai) {
        actions = [asyncButton('حلّل الآن', () => analyzeNow(it), btnOpts('sparkle'))];
      } else if (it.identity_unconfirmed && ['internal', 'refer', 'need_info'].includes(track) && !st.called) {
        // [بوابة 9.2 G5] بعد «سجّل المكالمة» (آخر ما وصل مكالمة) الخطوة التالية القرار نفسه، لا مكالمة ثانية
        actions = [asyncButton(it.address_form === 'm' ? 'اتصل به' : 'اتصل بها', () => callFirst(it), btnOpts('phone'))];
      } else if (track) {
        actions = [asyncButton(label('story_track_action', track), () => openSheet(it, { track }), btnOpts(TRACK_ICONS[track] || 'check'))];
      }
    }
    actions.push(button('فتح الطلب', { variant: 'ghost', icon: 'chevronLeft', href: `#/inbox/${it.id}`, className: 'pa-story-open' }));

    return h(
      'li',
      h(
        'article.pa-story',
        { class: [`is-${view}`, it.unread_count > 0 && 'is-unread'], 'aria-labelledby': nameId, dataset: { id: String(it.id), view } },
        h(
          'div.pa-story-head',
          channelIcons(it.channels && it.channels.length ? it.channels : [it.first_channel], { size: 15 }),
          h('a.pa-story-name', { id: nameId, href: `#/inbox/${it.id}` }, it.contact_name || 'بدون اسم'),
          // v11 segment-staff (ST-1, V11-47): رقاقة نوع الخدمة بجوار الاسم — لا تحرّك بقية البطاقة
          segmentChip(it.segment, { source: it.segment_source, requesterKind: it.requester_kind, className: 'pa-story-seg' }),
          it.unread_count > 0 && h('span.pa-unread', { title: count(it.unread_count, ['رسالة غير مقروءة', 'رسالتان غير مقروءتين', 'رسائل غير مقروءة', 'رسالة غير مقروءة']) }, String(it.unread_count), h('span.sr-only', ' غير مقروءة')),
          h('time.pa-story-time', { datetime: at, title: dateTime(at) }, relative(at)),
        ),
        ribbon(it, view),
        summary,
        chipsRow,
        h('div.pa-story-actions', actions),
      ),
    );
  }

  function drawList() {
    const total = Number(data.total) || 0;
    resultInfo.textContent = total
      ? `عدد الطلبات: ${total}${items.length < total ? ` — المعروض ${items.length}` : ''}`
      : '';
    if (!items.length) {
      // review: نوع الخدمة المختار (وقد يكون محفوظًا من زيارة سابقة) يُسمّى في الرسالة ويُلغى بزر واحد
      const segOnly = !hasFilters() && state.seg;
      const clear = hasFilters()
        ? button('مسح الفلاتر', {
            icon: 'x',
            onClick: () => {
              Object.assign(state, { q: '', channel: '', source: '', area: '', priority: '' });
              mount(filtersHost, buildFilters());
              drawFilterPill();
              load();
            },
          })
        : segOnly
          ? button('عرض كل الأنواع', {
              icon: 'x',
              className: 'pa-seg-all',
              onClick: () => {
                state.seg = '';
                saveSeg('');
                segSwitch.update({ value: '' });
                load();
              },
            })
          : null;
      const text = hasFilters()
        ? 'لا توجد طلبات تطابق البحث أو الفلاتر المختارة'
        : segOnly
          ? `لا توجد هنا طلبات نوع خدمتها «${state.seg === 'unset' ? 'غير محدد' : segLabel('segment', state.seg)}».`
        : state.story && STORY_EMPTY[state.story]
          ? STORY_EMPTY[state.story]
          : state.tab === 'open'
            ? 'لا توجد طلبات مفتوحة تنتظر الفرز الآن'
            : 'لا توجد طلبات في هذه الحالة';
      mount(listHost, card({ body: emptyState(text, clear, { icon: 'inbox' }) }));
      mount(moreHost);
      return;
    }
    if (state.view === 'cards') mount(listHost, h('ul.pa-stories', { 'aria-label': 'قصص المستفيدات حسب الأولوية' }, items.map(storyCard)));
    else mount(listHost, card({ flush: true, body: h('ul.pa-ilist', { 'aria-label': 'الطلبات الواردة' }, items.map(row)) }));
    mount(
      moreHost,
      items.length < total &&
        button(`عرض المزيد (${total - items.length})`, { icon: 'chevronDown', onClick: (e) => {
          e.currentTarget.disabled = true;
          load({ append: true });
        } }),
    );
  }

  const filtersHost = h('div.pa-filters-desk');
  // (v10 gate J-25) «بوابة الشركة» قناة طلبات الشركات فقط، ولا تطابق أي طلب وارد للأفراد
  const channelOptions = () => options('channel').filter((o) => o.value !== 'company_portal');
  const filterSpecs = () => [
    { key: 'channel', label: 'قناة التواصل', allLabel: 'كل القنوات', options: channelOptions() },
    { key: 'source', label: 'مصدر المستفيد/ة', allLabel: 'كل المصادر', options: options('source') },
    { key: 'area', label: 'المجال القانوني', allLabel: 'كل المجالات', options: areaOptions() },
    { key: 'priority', label: 'الأولوية', allLabel: 'كل الأولويات', options: PRIORITY_FILTERS },
  ];
  const SEARCH_PLACEHOLDER = 'ابحث برقم الطلب أو الاسم أو الهاتف أو نص الرسائل…';
  function buildFilters() {
    return filterBar([
      searchInput({
        placeholder: SEARCH_PLACEHOLDER,
        label: 'بحث في الطلبات',
        value: state.q,
        onSearch: (v) => {
          state.q = v;
          drawFilterPill();
          load();
        },
      }),
      ...filterSpecs().map((f) =>
        selectInput({
          label: f.label,
          allLabel: f.allLabel,
          options: f.options,
          value: state[f.key],
          onChange: (v) => {
            state[f.key] = v;
            drawFilterPill();
            load();
          },
        }),
      ),
    ]);
  }

  /** r2 P21: ورقة «تصفية» على الهاتف — البحث والقوائم وطريقة العرض، وتُطبَّق بـ «عرض النتائج» */
  function openFilterSheet() {
    const draft = { channel: state.channel, source: state.source, area: state.area, priority: state.priority, view: state.view };
    const search = searchInput({ placeholder: SEARCH_PLACEHOLDER, label: 'بحث في الطلبات', value: state.q, onSearch: () => {} });
    const selects = filterSpecs().map((f) => {
      const el = selectInput({ label: f.label, allLabel: f.allLabel, options: f.options, value: draft[f.key], onChange: (v) => (draft[f.key] = v) });
      return h('div.field', h('span.field-label', f.label), el);
    });
    const viewSeg = h(
      'div.segmented.pa-viewswitch-sheet',
      { role: 'group', 'aria-label': 'طريقة العرض' },
      [
        ['cards', 'بطاقات', 'grid'],
        ['list', 'قائمة', 'list'],
      ].map(([v, text, ic]) => {
        const b = h(
          'button.seg',
          {
            type: 'button',
            'aria-pressed': String(draft.view === v),
            onClick: () => {
              draft.view = v;
              viewSeg.querySelectorAll('.seg').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            },
          },
          icon(ic, { size: 16 }),
          text,
        );
        return b;
      }),
    );
    const apply = (reset) => {
      const q = reset ? '' : (search.querySelector('input')?.value || '').trim();
      Object.assign(state, reset ? { q: '', channel: '', source: '', area: '', priority: '' } : { q, channel: draft.channel, source: draft.source, area: draft.area, priority: draft.priority });
      if (!reset && draft.view !== state.view) {
        state.view = draft.view;
        saveView(state.view);
        drawViewSwitch();
      }
      mount(filtersHost, buildFilters());
      drawFilterPill();
      load();
    };
    modal({
      sheet: true,
      className: 'pa-filter-sheet',
      title: 'تصفية',
      body: h('div.stack', search, ...selects, h('div.field', h('span.field-label', 'طريقة العرض'), viewSeg)),
      actions: [
        { label: 'مسح الفلاتر', variant: 'ghost', onClick: () => apply(true) },
        { label: 'عرض النتائج', variant: 'primary', onClick: () => apply(false) },
      ],
    });
  }

  mount(filtersHost, buildFilters());

  async function manualIntake() {
    // v11 segment-staff (ST-1): «نوع الخدمة» إلزامي بلا اختيار افتراضي (أزرار اختيار)؛ الخادم يسجّل المصدر «سجلته الإدارة»
    let manualSeg = null;
    let manualForm = null;
    const segRadios = h(
      'div.seg-choice-opts',
      { role: 'radiogroup', 'aria-label': SEGMENT_TITLE },
      ['charity', 'paid'].map((v) =>
        h(
          'label.seg-choice-opt',
          { class: `is-${v}` },
          h('input', {
            type: 'radio',
            name: 'manual-segment',
            value: v,
            required: true,
            onChange: (e) => {
              if (!e.target.checked) return;
              manualSeg = v;
              manualForm?.control('segment')?.wrap.setError('');
            },
          }),
          h('span', segLabel('segment_long', v)),
        ),
      ),
    );
    const created = await formDialog({
      title: 'تسجيل طلب يدوي',
      intro:
        'للطلبات التي تصل بمكالمة هاتفية أو حضور شخصي أو بريد إلكتروني. يدخل الطلب نفس محرك الاستقبال، ويُربط بالمستفيد/ة تلقائيًا إن كان رقمه أو بريده مسجلًا من قبل.',
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
        { name: 'segment', label: [SEGMENT_TITLE, h('span.req', { 'aria-hidden': 'true' }, '*')], type: 'static', full: true, render: () => segRadios },
        { name: 'name', label: 'اسم المستفيد/ة', maxLength: 150, autocomplete: 'off' },
        { name: 'phone', label: 'رقم الموبايل', type: 'phone', hint: 'مطلوب للمكالمات والحضور الشخصي' },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', hint: 'مطلوب إذا وصل الطلب بالبريد' },
        { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions() },
        { name: 'source', label: 'كيف عرف المستفيد/ة بالمؤسسة؟ (المصدر)', type: 'select', placeholder: false, options: options('source') },
        { name: 'campaign', label: 'الحملة أو جهة الإحالة', maxLength: 150, hint: 'اختياري — مثل اسم الإعلان أو الجمعية المحيلة', full: true },
        { name: 'text', label: 'وصف الطلب كما رواه المستفيد/ة', type: 'textarea', required: true, minLength: 10, maxLength: 20000, rows: 5 },
      ],
      // نوع الخدمة يُفحص مع بقية الحقول (لا بعدها)
      setup: (f) => {
        manualForm = f;
        const validate = f.validate;
        f.validate = () => {
          const ok = validate();
          if (parseSeg(manualSeg)) return ok;
          f.control('segment').wrap.setError('اختاروا نوع الخدمة أولًا.');
          if (ok) segRadios.querySelector('input')?.focus();
          return false;
        };
      },
      onSubmit: async (v) => {
        if (!parseSeg(manualSeg)) throw fieldError('segment', 'اختاروا نوع الخدمة أولًا.');
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
          segment: manualSeg,
        });
      },
    });
    if (created && created.id) {
      toast(`تم تسجيل الطلب ${created.code}`, 'success');
      ctx.navigate(`/inbox/${created.id}`);
    }
  }

  drawTabs();
  drawStoryBar();
  drawViewSwitch();
  drawFilterPill();
  drawCountLine();
  drawList();

  // V11-46: عنوان كبير + سطر أعداد واحد، والشرح في ⓘ (كان فقرتين تحت العنوان)
  const explain = h(
    'details.pa-explain',
    h('summary', { 'aria-label': 'عن صندوق الوارد' }, icon('info', { size: 18 }), h('span.sr-only', 'عن صندوق الوارد')),
    h(
      'div.pa-explain-body',
      h('p', 'كل ما يصل من واتساب والموقع وأي قناة أخرى يظهر هنا في مكان واحد'),
      h(
        'p.pa-principle',
        icon('info', { size: 15 }),
        h('span', h('strong', 'القناة'), ' هي طريقة التواصل (واتساب، الموقع…)، و', h('strong', 'المصدر'), ' هو ما جاء بالمستفيد/ة (إعلان، بحث، إحالة…). والرسالة لا تصبح ملفًا إلا بقرار من الإدارة.'),
      ),
      h('p', segmentChip('charity'), ' ', segmentChip('paid'), ' ', segmentChip(null), ' — ', 'نوع الخدمة: الذهبي خيري، والأخضر أفراد وشركات.'),
    ),
  );
  const header = pageHeader({
    title: 'صندوق الوارد الموحد',
    // V11-46: مسار التنقل لصفحات التفاصيل وحدها
    subtitle: h('span.pa-sub', countLine, explain),
    actions: [
      button('تحديث', { variant: 'ghost', icon: 'refresh', onClick: () => load(), className: 'pa-refresh-btn', ariaLabel: 'تحديث' }),
      // r2 P21: تحت 600px زر «+» دائري في شريط العنوان بنفس الاسم لقارئات الشاشة
      button('تسجيل طلب يدوي', { variant: 'primary', icon: 'plus', onClick: manualIntake, className: 'pa-manual-btn', ariaLabel: 'تسجيل طلب يدوي' }),
    ],
  });

  return h(
    'div.pa-page.pa-page-inbox',
    header,
    // V11-47: مفتاح نوع الخدمة وطريقة العرض في صف واحد (طريقة العرض في ورقة «تصفية» على الهاتف)
    h('div.pa-segbar', segSwitch, viewSwitch),
    h('div.pa-tabs-wrap', tabBar),
    filtersHost,
    h('div.pa-inbox-bar', filterPill, storyBar),
    resultInfo,
    listHost,
    moreHost,
  );
}
