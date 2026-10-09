// الردود الجاهزة وقوالب واتساب ورضا العملاء (الإصدار 9 — وحدة messaging):
// • الردود الجاهزة: نصوص معتمدة باختصارات ومتغيرات يدرجها الفريق في رسائل المستفيدين، مع عداد الاستخدام.
// • قوالب واتساب: القوالب المعتمدة من ميتا (مزامنة من حساب واتساب للأعمال) وربطها بأغراض الإرسال خارج نافذة الـ 24 ساعة.
// • رضا العملاء: نتائج استبيان الرضا بعد الرد (بالشهر والمجال والمحامي) وآخر التقييمات والتعليقات.

import { h, frag, mount } from '../../../lib/h.js';
import { api } from '../../../lib/api.js';
import { label, options, num, count, percent, relative, dateTime, orgName, areaLabel } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  tabs,
  table,
  filterBar,
  searchInput,
  selectInput,
  badge,
  button,
  asyncButton,
  emptyState,
  alertBox,
  modal,
  form,
  toast,
  icon,
  codeTag,
  confirmDialog,
  statCard,
  progressBar,
  copyButton,
  errorMessage,
  field,
} from '../../../lib/ui.js';
import { templateNodes } from '../../components/quick-replies.js';
import { replaceQuery } from './lawyers.js';

const CATEGORY_TONES = { documents: 'info', procedures: 'primary', appointments: 'accent', portal: 'success', greeting: 'neutral', general: 'muted' };
const USES = ['مرة واحدة', 'مرتين', 'مرات', 'مرة'];
// يُستخدم مرفوعًا («تمت المزامنة: قالبان»، عنوان فرعي مستقل)
const TEMPLATES_UNIT = ['قالب واحد', 'قالبان', 'قوالب', 'قالبًا'];
const RATINGS_UNIT = ['تقييم واحد', 'تقييمين', 'تقييمات', 'تقييمًا'];
const SAMPLE = () => ({ client_name: 'أم يوسف', case_code: 'INH-2026-00482', request_code: 'REQ-2026-00125', org_name: orgName() });

const TEMPLATE_STATUS_TONE = { APPROVED: 'success', PENDING: 'warning', IN_APPEAL: 'warning', REJECTED: 'danger', PAUSED: 'warning', DISABLED: 'muted', PENDING_DELETION: 'muted', DELETED: 'muted', LIMIT_EXCEEDED: 'danger' };
const MAPPING_STATE = {
  ok: { text: 'مربوط ويعمل', tone: 'success' },
  unmapped: { text: 'غير مربوط', tone: 'muted' },
  missing: { text: 'القالب لم يعد موجودًا', tone: 'danger' },
  not_approved: { text: 'القالب غير معتمد حاليًا', tone: 'warning' },
  param_mismatch: { text: 'عدد متغيرات القالب تغيّر', tone: 'warning' },
};
const TABS = ['replies', 'templates', 'survey'];

/** نجوم تقييم العميل (1–5) مع وصف لقارئات الشاشة. */
export function ratingStars(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return h(
    'span.qr-stars',
    { role: 'img', 'aria-label': `تقييم المستفيد/ة ${v} من 5`, title: `${v} من 5` },
    [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= v ? 'is-on' : null, 'aria-hidden': 'true' }, '★')),
  );
}

function ratingText(avg) {
  return avg == null ? '—' : `${num(avg)} من 5`;
}

export default async function render(ctx) {
  const isAdmin = ctx.user?.role === 'admin';
  let active = TABS.includes(ctx.query.tab) ? ctx.query.tab : 'replies';

  // ═════════════════════ الردود الجاهزة ═════════════════════
  async function renderReplies() {
    const state = { q: ctx.query.q || '', category: ctx.query.category || '', items: [] };
    const listHost = h('div.qr-grid', { 'aria-live': 'polite' });
    const countLine = h('p.small.muted.qr-count');

    async function load() {
      const d = await api.get('/admin/quick-replies');
      state.items = Array.isArray(d.items) ? d.items : [];
      tabsEl.setCount('replies', state.items.length);
      draw();
    }

    const norm = (s) => String(s || '').replace(/[ً-ْـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase();
    function draw() {
      const q = norm(state.q.trim());
      const items = state.items.filter((r) => (!state.category || r.category === state.category) && (!q || [r.title, r.shortcut, r.body].some((x) => norm(x).includes(q))));
      countLine.textContent = state.items.length
        ? items.length === state.items.length
          ? `${count(state.items.length, ['رد جاهز واحد', 'ردان جاهزان', 'ردود جاهزة', 'ردًا جاهزًا'])}، مرتبة حسب الأكثر استخدامًا`
          : `المطابق للبحث: ${num(items.length)} من ${num(state.items.length)}`
        : '';
      if (!state.items.length) {
        mount(
          listHost,
          emptyState('أضف أول رد جاهز: قائمة المستندات المطلوبة، أو العنوان، أو شرح البوابة… ثم أدرجه في أي محادثة بضغطة.', button('رد جاهز جديد', { variant: 'primary', icon: 'plus', onClick: () => openEditor() }), {
            icon: 'zap',
            title: 'لا توجد ردود جاهزة بعد',
          }),
        );
        return;
      }
      if (!items.length) {
        mount(listHost, emptyState('لا توجد ردود مطابقة للبحث أو التصنيف المختار', null, { icon: 'search', compact: true }));
        return;
      }
      mount(listHost, items.map(replyCard));
    }

    function replyCard(r) {
      return h(
        'article.qr-card',
        h(
          'header.qr-card-head',
          h('h3.qr-card-title', r.title),
          h(
            'div.qr-card-tags',
            r.shortcut ? h('code.qr-shortcut', { dir: 'auto', title: 'اكتب الاختصار في محرر الرسالة ثم مسافة لإدراج الرد' }, r.shortcut) : null,
            badge(r.category_label || label('quick_reply_category', r.category), CATEGORY_TONES[r.category] || 'neutral'),
          ),
        ),
        h('p.qr-card-body', { dir: 'auto' }, templateNodes(r.body)),
        h(
          'footer.qr-card-foot',
          h(
            'span.small.muted.qr-usage',
            icon('zap', { size: 14 }),
            r.usage_count ? `استُخدم ${count(r.usage_count, USES)}` : 'لم يُستخدم بعد',
            r.last_used_at ? h('time', { datetime: r.last_used_at, title: dateTime(r.last_used_at) }, ` — آخر استخدام ${relative(r.last_used_at)}`) : null,
          ),
          h(
            'div.qr-card-actions',
            copyButton(r.body, 'نسخ'),
            button('تعديل', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => openEditor(r), ariaLabel: `تعديل الرد «${r.title}»` }),
            button('حذف', {
              size: 'sm',
              variant: 'ghost',
              icon: 'trash',
              ariaLabel: `حذف الرد «${r.title}»`,
              onClick: async () => {
                const yes = await confirmDialog({ title: 'حذف الرد الجاهز', message: `سيُحذف الرد «${r.title}» نهائيًا ولن يظهر في المحادثات. هل تريد المتابعة؟`, confirmLabel: 'حذف الرد', danger: true });
                if (!yes) return;
                try {
                  await api.del(`/admin/quick-replies/${encodeURIComponent(r.id)}`);
                  toast('تم حذف الرد الجاهز', 'success');
                  await load();
                } catch (err) {
                  toast(errorMessage(err), 'danger');
                }
              },
            }),
          ),
        ),
      );
    }

    function openEditor(r = null) {
      const f = form(
        [
          { name: 'title', label: 'عنوان الرد', required: true, maxLength: 120, placeholder: 'مثال: المستندات المطلوبة لإعلام الوراثة' },
          { name: 'shortcut', label: 'الاختصار (اختياري)', maxLength: 31, placeholder: '/وثائق', hint: 'يبدأ بـ «/» دون مسافات؛ يكتبه الموظف في المحادثة ثم مسافة ليُدرج الرد.' },
          { name: 'category', label: 'التصنيف', type: 'select', required: true, placeholder: false, options: options('quick_reply_category') },
          { name: 'body', label: 'نص الرد', type: 'textarea', rows: 7, required: true, maxLength: 4000, full: true },
        ],
        { footer: false, values: r ? { title: r.title, shortcut: r.shortcut || '', category: r.category, body: r.body } : { category: 'general' } },
      );
      const ta = f.control('body').input;
      ta.setAttribute('dir', 'auto');
      const preview = h('p.qr-preview-body', { dir: 'auto' });
      const updatePreview = () => mount(preview, ta.value.trim() ? templateNodes(ta.value, { values: SAMPLE() }) : h('span.muted', 'اكتب نص الرد لتظهر المعاينة'));
      ta.addEventListener('input', updatePreview);
      updatePreview();
      const legend = h(
        'div.pd-legend.qr-legend',
        h('div.pd-legend-title', 'المتغيرات — اضغط لإدراجها في موضع المؤشر، وتُملأ تلقائيًا من بيانات المحادثة:'),
        h(
          'div.pd-legend-items',
          options('quick_reply_variable').map(({ value: k, label: desc }) =>
            h(
              'button.pd-ph',
              {
                type: 'button',
                title: `إدراج ${desc}`,
                onClick: () => {
                  const token = `{${k}}`;
                  const s = ta.selectionStart ?? ta.value.length;
                  const e = ta.selectionEnd ?? ta.value.length;
                  ta.value = ta.value.slice(0, s) + token + ta.value.slice(e);
                  ta.focus();
                  ta.setSelectionRange(s + token.length, s + token.length);
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                },
              },
              h('code', { dir: 'ltr' }, `{${k}}`),
              h('span', desc),
            ),
          ),
        ),
      );
      modal({
        title: r ? `تعديل «${r.title}»` : 'رد جاهز جديد',
        size: 'lg',
        body: frag(f.el, legend, h('div.qr-preview', h('div.qr-preview-label', icon('eye', { size: 14 }), 'معاينة بمثال واقعي'), preview)),
        actions: [
          { label: 'إلغاء', variant: 'ghost' },
          {
            label: r ? 'حفظ التعديلات' : 'إضافة الرد',
            variant: 'primary',
            icon: 'check',
            onClick: async () => {
              if (!f.validate()) return false;
              const v = f.getValues();
              const allowed = options('quick_reply_variable').map((o) => o.value);
              const unknown = [...new Set([...v.body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !allowed.includes(k)))];
              if (unknown.length) {
                f.setErrors({ body: `متغير غير معروف: ${unknown.map((k) => `{${k}}`).join('، ')}` });
                return false;
              }
              try {
                if (r) await api.patch(`/admin/quick-replies/${encodeURIComponent(r.id)}`, v);
                else await api.post('/admin/quick-replies', v);
              } catch (err) {
                f.showError(err);
                return false;
              }
              toast(r ? 'تم حفظ الرد الجاهز' : 'أُضيف الرد الجاهز', 'success');
              await load();
              return undefined;
            },
          },
        ],
      });
    }

    const syncUrl = () => replaceQuery('/quick-replies', { tab: '', q: state.q, category: state.category });
    const filters = filterBar([
      searchInput({
        placeholder: 'ابحث في العنوان أو النص أو الاختصار…',
        value: state.q,
        label: 'بحث في الردود الجاهزة',
        onSearch: (q) => {
          state.q = q;
          syncUrl();
          draw();
        },
      }),
      selectInput({
        label: 'التصنيف',
        allLabel: 'كل التصنيفات',
        value: state.category,
        options: options('quick_reply_category'),
        onChange: (c) => {
          state.category = c;
          syncUrl();
          draw();
        },
      }),
      h('div.qr-filter-spacer'),
      button('رد جاهز جديد', { variant: 'primary', icon: 'plus', onClick: () => openEditor() }),
    ]);
    filters.querySelector('select').value = state.category;
    await load();
    return h(
      'div.stack',
      h(
        'p.qr-intro',
        'الردود الجاهزة تختصر كتابة الرسائل المتكررة وتوحّد صياغتها. تظهر في محرر الرسائل بزر «ردود جاهزة»، ويمكن إدراج أي رد بكتابة اختصاره مثل ',
        h('code.qr-shortcut', '/وثائق'),
        ' ثم مسافة.',
      ),
      filters,
      countLine,
      listHost,
    );
  }

  // ═════════════════════ قوالب واتساب ═════════════════════
  async function renderTemplates() {
    const host = h('div.stack');
    let data = await api.get('/admin/whatsapp/templates');

    function statusAlert() {
      const last = data.last_synced_at ? `آخر مزامنة ${relative(data.last_synced_at)} (${dateTime(data.last_synced_at)}).` : 'لم تُزامَن القوالب بعد.';
      if (data.configured && data.waba_set) {
        return alertBox(
          `الإرسال الحقيقي عبر WhatsApp Cloud API مفعّل. خارج نافذة الـ 24 ساعة تُرسل المنصة القالب المربوط بكل غرض أدناه بمتغيراته بالترتيب. ${last}`,
          'success',
          { title: 'واتساب متصل', icon: 'whatsapp' },
        );
      }
      if (data.configured) {
        return alertBox(`الإرسال مفعّل، لكن معرّف حساب واتساب للأعمال (WABA ID) غير مضبوط، فلا يمكن مزامنة القوالب. اضبطه من صفحة التكاملات. ${last}`, 'warning', {
          title: 'تنقص بيانات المزامنة',
          icon: 'whatsapp',
        });
      }
      return alertBox(
        `المنصة في وضع المحاكاة: تُسجَّل الرسائل دون إرسال فعلي. القوالب والربط المحفوظ هنا يُستخدمان تلقائيًا فور ضبط بيانات واتساب الحقيقية من صفحة التكاملات. ${last}`,
        'info',
        { title: 'واتساب في وضع المحاكاة', icon: 'whatsapp' },
      );
    }

    function paramChips(m) {
      const params = m.mapping?.params || [];
      if (!params.length) return h('span.small.muted', 'بلا متغيرات');
      return h(
        'ol.qr-params',
        params.map((p, i) => h('li', h('code', { dir: 'ltr' }, `{{${i + 1}}}`), icon('arrowLeft', { size: 12 }), h('span', label('wa_template_variable', p)))),
      );
    }

    function mappingRow(m) {
      const st = MAPPING_STATE[m.state] || MAPPING_STATE.unmapped;
      const legacy = m.purpose === 'case_update' && m.state === 'unmapped' && data.legacy_template;
      return h(
        'li.qr-map',
        h(
          'div.qr-map-main',
          h('div.qr-map-title', h('strong', m.label), badge(st.text, st.tone, { dot: true })),
          m.mapping
            ? h('div.qr-map-tpl', codeTag(m.mapping.template_name), h('span.small.muted', `اللغة: ${m.mapping.language}`), paramChips(m))
            : h(
                'p.small.muted',
                legacy
                  ? `يُستخدم القالب الافتراضي من الإعدادات «${data.legacy_template}» بمتغير واحد يحمل نص الرسالة.`
                  : /@paid$/.test(m.purpose) // v11 segment-staff (ST-6، r2 S15): بديل الأفراد والشركات قالب محايد، ولا نص خيري أبدًا
                    ? m.purpose === 'portal_update@paid'
                      ? 'بلا ربط: يُستخدم قالب «تنبيه بجديد في صفحة المتابعة» المحايد.'
                      : m.purpose === 'case_update@paid'
                        ? 'بلا ربط: يُستخدم «تنبيه بجديد في صفحة المتابعة» للأفراد والشركات، ثم المحايد.'
                        : 'بلا ربط: يُستخدم قالب «تحديثات الملف» للأفراد والشركات، ثم «تنبيه بجديد في صفحة المتابعة» — لا يصل قالب الخيري لعميل بأتعاب.'
                  : m.purpose === 'otp'
                    ? 'بدون قالب مصادقة لا يصل رمز الدخول إلا لمستفيد/ة راسلنا خلال آخر 24 ساعة.'
                    : m.purpose === 'case_update'
                      ? 'لا يوجد قالب: الرسائل خارج نافذة الـ 24 ساعة ستفشل.'
                      : 'يُستخدم قالب «تحديثات الملف» بنص الرسالة كاملًا.',
              ),
        ),
        isAdmin
          ? h(
              'div.qr-map-actions',
              button(m.mapping ? 'تعديل الربط' : 'ربط قالب', { size: 'sm', variant: m.mapping ? 'ghost' : 'secondary', icon: 'link', onClick: () => openMapping(m) }),
              m.mapping
                ? button('إلغاء الربط', {
                    size: 'sm',
                    variant: 'ghost',
                    icon: 'x',
                    onClick: async () => {
                      const yes = await confirmDialog({ title: 'إلغاء ربط القالب', message: `لن يُستخدم القالب «${m.mapping.template_name}» لغرض «${m.label}». هل تريد المتابعة؟`, confirmLabel: 'إلغاء الربط', danger: true });
                      if (!yes) return;
                      try {
                        await api.del(`/admin/whatsapp/template-mappings/${encodeURIComponent(m.purpose)}`);
                        toast('أُلغي الربط', 'success');
                        await refresh();
                      } catch (err) {
                        toast(errorMessage(err), 'danger');
                      }
                    },
                  })
                : null,
            )
          : null,
      );
    }

    function openMapping(m) {
      const usable = data.templates.filter((t) => t.usable && (m.purpose !== 'otp' || t.category === 'AUTHENTICATION'));
      if (!usable.length) {
        toast(m.purpose === 'otp' ? 'لا يوجد قالب مصادقة معتمد. أنشئه في مدير واتساب ثم زامن القوالب.' : 'لا توجد قوالب معتمدة. زامن القوالب أولًا.', 'warning', 6000);
        return;
      }
      const keyOf = (t) => `${t.name}|${t.language}`;
      const current = m.mapping ? `${m.mapping.template_name}|${m.mapping.language}` : keyOf(usable[0]);
      const sel = h(
        'select.input',
        { id: 'qr-map-template', 'aria-label': 'القالب' },
        usable.map((t) => h('option', { value: keyOf(t), selected: keyOf(t) === current }, `${t.name} (${t.language}) — ${t.category_label}`)),
      );
      const paramsHost = h('div.qr-map-params');
      const preview = h('p.qr-preview-body', { dir: 'auto' });
      let selects = [];
      function draw(keepParams) {
        const t = usable.find((x) => keyOf(x) === sel.value) || usable[0];
        const prev = keepParams ? m.mapping?.params || [] : [];
        selects = Array.from({ length: t.param_count }, (_, i) => {
          const s = h(
            'select.input',
            { 'aria-label': `قيمة المتغير {{${i + 1}}}` },
            m.variables.map((k) => h('option', { value: k }, label('wa_template_variable', k))),
          );
          s.value = prev[i] && m.variables.includes(prev[i]) ? prev[i] : m.purpose === 'otp' ? 'code' : i === t.param_count - 1 && m.variables.includes('body') ? 'body' : m.variables[Math.min(i, m.variables.length - 1)];
          s.addEventListener('change', updatePreview);
          return s;
        });
        mount(
          paramsHost,
          t.param_count
            ? selects.map((s, i) => h('label.qr-map-param', h('code', { dir: 'ltr' }, `{{${i + 1}}}`), h('span.muted', '←'), s))
            : h('p.small.muted', 'هذا القالب بلا متغيرات؛ يُرسل نصه كما هو.'),
        );
        updatePreview();
      }
      function updatePreview() {
        const t = usable.find((x) => keyOf(x) === sel.value) || usable[0];
        const vals = selects.map((s) => `«${label('wa_template_variable', s.value)}»`);
        const text = String(t.body_text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (x, n) => vals[Number(n) - 1] || x);
        mount(preview, text, t.footer_text ? h('span.qr-preview-footer', t.footer_text) : null);
      }
      sel.addEventListener('change', () => draw(false));
      draw(true);
      modal({
        title: `ربط قالب: ${m.label}`,
        size: 'lg',
        body: h(
          'div.stack',
          h('p.modal-intro', 'اختر قالبًا معتمدًا من ميتا، ثم حدد ما يوضع في كل متغير بالترتيب. تُستبعد القوالب غير المعتمدة أو التي تحتوي متغيرات في العنوان.'),
          h('div.field', h('label.field-label', { htmlFor: 'qr-map-template' }, 'القالب'), h('div.select-wrap', sel)),
          h('div.field', h('span.field-label', 'متغيرات القالب'), paramsHost),
          h('div.qr-preview', h('div.qr-preview-label', icon('eye', { size: 14 }), 'نص القالب كما سيصل'), preview),
        ),
        actions: [
          { label: 'إلغاء', variant: 'ghost' },
          {
            label: 'حفظ الربط',
            variant: 'primary',
            icon: 'check',
            onClick: async () => {
              const [name, language] = sel.value.split('|');
              await api.put(`/admin/whatsapp/template-mappings/${encodeURIComponent(m.purpose)}`, { template_name: name, language, params: selects.map((s) => s.value) });
              toast('تم حفظ ربط القالب', 'success');
              await refresh();
            },
          },
        ],
      });
    }

    function templatesTable() {
      return table({
        caption: 'قوالب واتساب المتزامنة',
        className: 'qr-mtable',
        rowClass: (t) => (t.removed ? 'qr-row-removed' : null),
        columns: [
          {
            key: 'name',
            label: 'القالب',
            render: (t) => h('div.stack-sm.qr-cell', codeTag(t.name), h('span.cell-sub', `اللغة: ${t.language}`), t.removed ? badge('حُذف من حساب واتساب', 'muted') : null),
          },
          { key: 'category', label: 'الفئة', render: (t) => badge(t.category_label || '—', t.category === 'AUTHENTICATION' ? 'accent' : t.category === 'MARKETING' ? 'warning' : 'info') },
          {
            key: 'status',
            label: 'الحالة',
            render: (t) => h('div.stack-sm.qr-cell', badge(t.status_label, TEMPLATE_STATUS_TONE[t.status] || 'neutral', { dot: true }), t.rejected_reason ? h('span.cell-sub', `السبب: ${t.rejected_reason}`) : null),
          },
          { key: 'param_count', label: 'المتغيرات', align: 'center', render: (t) => num(t.param_count) },
          {
            key: 'body_text',
            label: 'النص',
            className: 'qr-col-body',
            render: (t) =>
              h(
                'div.qr-tpl-text',
                { dir: 'auto' },
                t.header_text ? h('strong.qr-tpl-header', t.header_text) : null,
                h('span', String(t.body_text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, '{{$1}}')),
                t.footer_text ? h('span.qr-tpl-footer', t.footer_text) : null,
                t.buttons?.length ? h('span.qr-tpl-buttons', t.buttons.map((b) => h('span.chip', b.text || b.type))) : null,
              ),
          },
        ],
        rows: data.templates,
        empty: data.configured ? 'لا توجد قوالب بعد. اضغط «مزامنة القوالب» لجلبها من حساب واتساب للأعمال.' : 'لا توجد قوالب متزامنة بعد.',
      });
    }

    async function refresh() {
      data = await api.get('/admin/whatsapp/templates');
      draw();
    }

    /** مفتاح «الدخول برمز واتساب» لصفحة /portal (للإدارة فقط) مع سبب عدم الإتاحة إن وُجد */
    function otpCard() {
      const st = data.portal_otp || { enabled: true, available: true, simulation: !data.configured };
      const otpMapping = data.mappings.find((m) => m.purpose === 'otp');
      let note;
      let tone;
      if (!st.enabled) {
        note = 'موقوف: تعرض صفحة «متابعة طلبك» (/portal) رسالة بأن الخدمة غير متاحة، ويتواصل المستفيد/ة معكم لإرسال رابط صفحته.';
        tone = 'muted';
      } else if (!st.available) {
        note = 'مفعّل في الإعدادات لكنه غير متاح للمستفيدين: واتساب غير متصل في بيئة الإنتاج، فلن يصل أي رمز. اضبط بيانات واتساب من صفحة التكاملات.';
        tone = 'warning';
      } else if (st.simulation) {
        note = 'وضع المحاكاة: لا تُرسل رسائل حقيقية، ويظهر رمز الدخول في «صندوق الصادر» بصفحة الأتمتة للتجربة فقط.';
        tone = 'info';
      } else {
        note =
          otpMapping?.state === 'ok'
            ? 'يعمل: يصل الرمز للمستفيد/ة بقالب المصادقة المربوط، ولا يُحفظ الرمز في قاعدة البيانات.'
            : 'يعمل، لكن بلا قالب مصادقة مربوط لا يصل الرمز إلا لمستفيد/ة راسلكم خلال آخر 24 ساعة. اربط قالب «رمز الدخول إلى صفحة المتابعة» أدناه.';
        tone = otpMapping?.state === 'ok' ? 'success' : 'warning';
      }
      const sw = h(
        'button.pd-switch',
        { type: 'button', role: 'switch', 'aria-checked': String(!!st.enabled), 'aria-label': 'تفعيل الدخول إلى صفحة المتابعة برمز واتساب' },
        h('span.pd-switch-track', { 'aria-hidden': 'true' }, h('span.pd-switch-thumb')),
        h('span.pd-switch-text', st.enabled ? 'مفعّل' : 'موقوف'),
      );
      sw.addEventListener('click', async () => {
        if (sw.disabled) return;
        const next = !st.enabled;
        if (!next) {
          const yes = await confirmDialog({
            title: 'إيقاف الدخول برمز واتساب',
            message: 'لن يتمكن المستفيدون من الدخول إلى صفحاتهم من «متابعة طلبك» برمز واتساب حتى تعيد التفعيل، وتبقى الروابط المرسلة لهم صالحة. هل تريد المتابعة؟',
            confirmLabel: 'إيقاف',
            danger: true,
          });
          if (!yes) return;
        }
        sw.disabled = true;
        try {
          await api.patch('/admin/settings', { portal_otp_enabled: next });
          toast(next ? 'فُعّل الدخول إلى صفحة المتابعة برمز واتساب' : 'أُوقف الدخول إلى صفحة المتابعة برمز واتساب', 'success');
          await refresh();
        } catch (err) {
          toast(errorMessage(err), 'danger');
          sw.disabled = false;
        }
      });
      return card({
        title: 'الدخول إلى صفحة المتابعة برمز واتساب',
        subtitle: 'صفحة /portal: يكتب المستفيد/ة رقمه المسجل فيصله رمز من 6 أرقام',
        icon: 'lock',
        actions: sw,
        body: alertBox(note, tone === 'muted' ? 'info' : tone),
      });
    }

    function draw() {
      const approved = data.templates.filter((t) => t.usable).length;
      const actions = isAdmin
        ? h(
            'div.row.qr-tpl-actions',
            asyncButton(
              'مزامنة القوالب',
              async () => {
                const r = await api.post('/admin/whatsapp/templates/sync', {});
                data = r;
                draw();
                toast(
                  r.total
                    ? `تمت المزامنة: ${count(r.total, TEMPLATES_UNIT)}، المعتمد منها ${num(r.approved)}${r.removed ? `، وأُزيل من الحساب ${count(r.removed, TEMPLATES_UNIT)}` : ''}`
                    : 'تمت المزامنة: لا توجد قوالب في حساب واتساب للأعمال بعد.',
                  'success',
                );
              },
              { variant: 'primary', icon: 'refresh', disabled: !data.configured || !data.waba_set, title: !data.configured ? 'يتطلب ضبط بيانات واتساب الحقيقية' : null },
            ),
            asyncButton(
              'اختبار الاتصال',
              async () => {
                const r = await api.post('/admin/whatsapp/test', {});
                if (r.ok) toast(r.message || 'تم الاتصال بنجاح', 'success', 6000);
                else toast(r.error || 'فشل الاتصال', 'danger');
              },
              { variant: 'secondary', icon: 'whatsapp' },
            ),
            button('إعدادات التكاملات', { variant: 'ghost', icon: 'settings', href: '#/integrations' }),
          )
        : null;
      mount(
        host,
        statusAlert(),
        actions,
        isAdmin ? otpCard() : null,
        card({
          title: 'ربط القوالب بأغراض الإرسال',
          subtitle: 'ماذا ترسل المنصة خارج نافذة الـ 24 ساعة لكل نوع من الرسائل',
          icon: 'link',
          body: h('ul.qr-maps', data.mappings.map(mappingRow)),
        }),
        card({
          title: 'القوالب المتزامنة',
          subtitle: data.templates.length ? `${count(data.templates.length, TEMPLATES_UNIT)} — المعتمد والقابل للاستخدام: ${num(approved)}` : null,
          icon: 'whatsapp',
          flush: true,
          body: templatesTable(),
        }),
      );
    }
    draw();
    return host;
  }

  // ═════════════════════ رضا العملاء ═════════════════════
  /** حد التقييم المنخفض الذي يُنبَّه عنده مدير الحالة (للإدارة فقط؛ من 1 إلى 4) */
  function thresholdCard(current) {
    const sel = h(
      'select.input',
      { id: 'qr-threshold' },
      [1, 2, 3, 4].map((n) =>
        h(
          'option',
          { value: String(n), selected: n === current },
          `${n} من 5${n > 1 ? ' فأقل' : ''} — ${[...Array(n).keys()].map((i) => label('satisfaction_rating', n - i)).join(' أو ')}`,
        ),
      ),
    );
    const save = asyncButton(
      'حفظ',
      async () => {
        await api.patch('/admin/settings', { survey_low_rating_threshold: Number(sel.value) });
        toast('حُفظ حد التقييم المنخفض، ويسري على التقييمات الجديدة والإحصاءات', 'success');
      },
      { variant: 'secondary', icon: 'check' },
    );
    return card({
      title: 'إعدادات الاستبيان',
      icon: 'settings',
      body: h(
        'div.stack-sm',
        h(
          'div.qr-threshold',
          field('التقييم المنخفض الذي يُنبَّه عنده مدير الحالة فورًا', h('div.select-wrap', sel), {
            hint: 'عند تقييم منخفض يُطلب من المستفيد/ة أيضًا توضيح ما لم يعجبه، ويظهر تعليقه في الملف.',
          }),
          save,
        ),
        h('p.small.muted', 'موعد إرسال الاستبيان ونصه ومدة قبول التقييم تُضبط من ', h('a', { href: '#/automations' }, 'صفحة الأتمتة'), '.'),
      ),
    });
  }

  async function renderSurvey() {
    const s = await api.get('/admin/surveys/summary');
    const t = s.totals || {};
    const stats = h(
      'div.stats-grid',
      statCard({ label: 'متوسط رضا المستفيدين', value: ratingText(t.avg_rating), hint: t.responses ? `من ${count(t.responses, RATINGS_UNIT)}` : 'لا تقييمات بعد', icon: 'star', tone: 'accent' }),
      statCard({ label: 'نسبة الاستجابة', value: t.response_rate == null ? '—' : percent(t.response_rate), hint: `${t.surveys_sent ? `أُرسل ${count(t.surveys_sent, ['استبيان واحد', 'استبيانان', 'استبيانات', 'استبيانًا'])}` : 'لم يُرسل أي استبيان'}${t.undelivered ? ` — وتعذر إرسال ${count(t.undelivered, ['استبيان واحد', 'استبيانين', 'استبيانات', 'استبيانًا'])}` : ''}`, icon: 'message', tone: 'info' }),
      statCard({ label: 'تقييمات منخفضة', value: num(t.low_ratings || 0), hint: `${num(s.threshold)} من 5 فأقل — يُنبَّه مدير الحالة فورًا`, icon: 'alert', tone: t.low_ratings ? 'danger' : 'success' }),
      statCard({ label: 'بانتظار التقييم', value: num(t.awaiting || 0), hint: 'استبيانات سارية لم يرد عليها المستفيد/ة', icon: 'clock', tone: 'neutral' }),
    );
    if (!t.surveys_sent && !t.responses && !t.undelivered) {
      return h(
        'div.stack',
        stats,
        card({
          body: emptyState('يُرسل استبيان الرضا تلقائيًا بعد إرسال الرد النهائي للمستفيد/ة بيوم (قابل للتعديل من صفحة الأتمتة)، وتظهر النتائج هنا.', button('إعدادات الاستبيان في الأتمتة', { href: '#/automations', icon: 'zap' }), { icon: 'star', title: 'لم تُرسل استبيانات بعد' }),
        }),
        isAdmin ? thresholdCard(s.threshold) : null,
      );
    }
    const dist = s.distribution || {};
    const total = Object.values(dist).reduce((a, b) => a + Number(b || 0), 0) || 1;
    const distCard = card({
      title: 'توزيع التقييمات',
      icon: 'chart',
      body: h(
        'ul.qr-dist',
        [5, 4, 3, 2, 1].map((n) =>
          h(
            'li',
            h('span.qr-dist-label', ratingStars(n), h('span.small', label('satisfaction_rating', n))),
            progressBar(Number(dist[n] || 0), total, n <= s.threshold ? 'warning' : n >= 4 ? 'primary' : 'accent', { label: `${label('satisfaction_rating', n)}: ${dist[n] || 0}`, visibleLabel: false }),
            h('span.qr-dist-count', num(dist[n] || 0)),
          ),
        ),
      ),
    });
    const avgCell = (r) => h('span.nowrap', ratingStars(Math.round(r.avg_rating || 0)), ' ', h('span.small', ratingText(r.avg_rating)));
    const monthCard = card({
      title: 'بالشهر',
      icon: 'calendar',
      flush: true,
      body: table({
        caption: 'رضا المستفيدين بالشهر',
        className: 'qr-mtable',
        columns: [
          { key: 'label', label: 'الشهر' },
          { key: 'sent', label: 'أُرسل', align: 'center', render: (r) => num(r.sent) },
          { key: 'responses', label: 'التقييمات', align: 'center', render: (r) => num(r.responses) },
          { key: 'avg', label: 'المتوسط', render: (r) => (r.responses ? avgCell(r) : h('span.muted', '—')) },
        ],
        rows: [...(s.by_month || [])].reverse(),
      }),
    });
    const areaCard = card({
      title: 'بالمجال القانوني',
      icon: 'book',
      flush: true,
      body: table({
        caption: 'رضا المستفيدين بالمجال القانوني',
        className: 'qr-mtable',
        columns: [
          { key: 'label', label: 'المجال', render: (r) => r.label || areaLabel(r.area) },
          { key: 'responses', label: 'التقييمات', align: 'center', render: (r) => num(r.responses) },
          { key: 'avg', label: 'المتوسط', render: avgCell },
          { key: 'low', label: 'منخفض', align: 'center', render: (r) => (r.low ? badge(num(r.low), 'danger') : h('span.muted', '0')) },
        ],
        rows: s.by_area || [],
      }),
    });
    const lawyerCard = card({
      title: 'بالمحامي الأساسي',
      icon: 'users',
      flush: true,
      body: table({
        caption: 'رضا المستفيدين بالمحامي الأساسي',
        className: 'qr-mtable',
        columns: [
          { key: 'name', label: 'المحامي', render: (r) => h('a', { href: `#/lawyers/${r.lawyer_id}` }, r.name) },
          { key: 'responses', label: 'التقييمات', align: 'center', render: (r) => num(r.responses) },
          { key: 'avg', label: 'المتوسط', render: avgCell },
          { key: 'low', label: 'منخفض', align: 'center', render: (r) => (r.low ? badge(num(r.low), 'danger') : h('span.muted', '0')) },
        ],
        rows: s.by_lawyer || [],
        empty: 'لا توجد تقييمات لملفات لها محامٍ أساسي معتمد بعد',
      }),
    });
    const recent = card({
      title: 'آخر التقييمات والتعليقات',
      icon: 'message',
      body: (s.recent || []).length
        ? h(
            'ul.qr-feedback',
            s.recent.map((r) =>
              h(
                'li.qr-fb',
                { class: r.low && 'is-low' },
                h(
                  'div.qr-fb-head',
                  ratingStars(r.rating),
                  h('strong', r.rating_label),
                  h('a.qr-fb-case', { href: `#/cases/${r.case_id}`, 'aria-label': `فتح الملف ${r.case_code}` }, codeTag(r.case_code)),
                  r.low ? badge('تقييم منخفض', 'danger', { icon: 'alert' }) : null,
                  h('span.small.muted', label('channel', r.channel)),
                  h('time.small.muted', { datetime: r.created_at, title: dateTime(r.created_at) }, relative(r.created_at)),
                ),
                r.case_title ? h('p.small.muted.qr-fb-title', r.case_title) : null,
                r.comment ? h('blockquote.qr-fb-comment', { dir: 'auto' }, r.comment) : null,
              ),
            ),
          )
        : emptyState('لا توجد تقييمات بعد', null, { compact: true, icon: 'star' }),
    });
    return h(
      'div.stack',
      h('p.qr-intro', 'يُرسل استبيان الرضا للمستفيد/ة تلقائيًا بعد إرسال الرد النهائي (أزرار «ممتاز / جيد / غير راضٍ» داخل نافذة واتساب، أو رد برقم من 1 إلى 5)، ويُنبَّه مدير الحالة فور أي تقييم منخفض. ', h('a', { href: '#/automations' }, 'إعدادات توقيت الاستبيان ونصه')),
      stats,
      h('div.grid-2.qr-survey-grid', distCard, recent),
      h('div.grid-2.qr-survey-grid', areaCard, lawyerCard),
      monthCard,
      isAdmin ? thresholdCard(s.threshold) : null,
    );
  }

  const tabsEl = tabs(
    [
      { key: 'replies', label: 'الردود الجاهزة', icon: 'zap', render: renderReplies },
      { key: 'templates', label: 'قوالب واتساب', icon: 'whatsapp', render: renderTemplates },
      { key: 'survey', label: 'رضا المستفيدين', icon: 'star', render: renderSurvey },
    ],
    {
      active,
      onChange: (key) => {
        active = key;
        replaceQuery('/quick-replies', { tab: key === 'replies' ? '' : key });
      },
    },
  );

  return frag(
    pageHeader({
      title: 'الردود الجاهزة وقوالب واتساب',
      subtitle: 'نصوص جاهزة لرسائل المستفيدين، وقوالب واتساب المعتمدة للإرسال خارج نافذة الـ 24 ساعة، ونتائج استبيان رضا المستفيدين.',
    }),
    tabsEl,
  );
}
