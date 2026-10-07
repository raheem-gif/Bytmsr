// شاشة فرز الطلب الوارد: المحادثة، تحليل الذكاء الاصطناعي (مساعد فقط)، بيانات الفرز، العميل الموحد عبر القنوات،
// ثم قرار الإدارة: تحويل إلى ملف قانوني له كود مستقل، أو تعامل داخلي دون محامٍ، أو أرشفة.

import { h, frag, mount } from '../../../lib/h.js';
import { api, downloadUrl, formatBytes } from '../../../lib/api.js';
import { label, areaLabel, areaOptions, options, governorateOptions, relative, dateTime, date, percent, count, toLatinDigits, cairoToday } from '../../../lib/fmt.js';
import {
  pageHeader,
  card,
  button,
  asyncButton,
  badge,
  statusBadge,
  icon,
  codeTag,
  ltr,
  kv,
  timeline,
  chatThread,
  emptyState,
  alertBox,
  field,
  form,
  modal,
  formDialog,
  confirmDialog,
  confirmDanger,
  toast,
  copyButton,
  progressBar,
  chips,
  richText,
  errorMessage,
} from '../../../lib/ui.js';
import { channelIcons, similarText, CHANNEL_ICONS, reloadAndFocus } from './inbox.js';
import { pickClient } from './clients.js';
import { beneficiaryCard } from '../../components/beneficiary.js'; // v9 practice
import { programSelect } from '../../components/program-picker.js';
import { MERGE_LABEL } from '../../labels.js';
// v9: ردود جاهزة واقتراح رد بالذكاء الاصطناعي في محرر الرد، وتحليل المستندات (أدوات مشتركة مع صفحة الملف)
import { composerTools, docAnalysisStore, docAiBadge, docAiAction, docAiResultsCard } from './case-detail.js';

const OPEN = ['new', 'in_review', 'awaiting_client'];
/** (إصلاح 9.1) اسم عام لا يقول ما في الورقة: «ورقة 1»، «ورقة-2.jpg»، «صورة 3»، «IMG_2041.jpg» */
export const GENERIC_DOC_NAME = /^\s*(?:ورقة|ورقه|صورة|صوره|مستند|مرفق|IMG|image|photo|scan|document|file|DSC|PXL|WhatsApp Image)[\s_-]*[\d\s_.:-]*(?:at[\d\s_.:-]*)?(?:\.(?:jpe?g|png|webp|heic|pdf))?\s*$/i;
const REPLY_CHANNELS = [
  { value: 'auto', label: 'تلقائي (آخر قناة تواصل منها المستفيد/ة)' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'الموقع (صفحة المتابعة)' },
];

const SOURCE_DETAIL_LABELS = {
  utm_source: 'مصدر الزيارة (utm_source)',
  utm_medium: 'الوسيط (utm_medium)',
  utm_campaign: 'الحملة (utm_campaign)',
  utm_content: 'محتوى الإعلان (utm_content)',
  utm_term: 'الكلمة المفتاحية (utm_term)',
  ref: 'رمز جهة الإحالة',
  referrer: 'الصفحة المحيلة',
  landing_path: 'صفحة الدخول',
  ad_id: 'رقم الإعلان',
  source_type: 'نوع الإحالة',
  source_url: 'رابط الإعلان',
  headline: 'عنوان الإعلان',
  ad_body: 'نص الإعلان',
  ctwa_clid: 'معرّف النقرة (ctwa_clid)',
  entered_by: 'سجّله يدويًا',
  intake_mode: 'طريقة تعبئة النموذج',
};
const SOURCE_TYPE_LABELS = { ad: 'إعلان ممول', post: 'منشور' };
const INTAKE_MODE_LABELS = { form: 'نموذج منظم', guided: 'خطوة بخطوة' };
// مفاتيح داخلية في source_detail (التحقق من الهوية) تُعرض بتنبيه مخصص لا كصفوف خام
// (v9.1 b-forms) وكود تأكيد الرقم برسالة واتساب (confirm_*) لا يُعرض كذلك
const isInternalSourceKey = (k) => k === 'phone_match_unverified' || k.startsWith('identity_') || k.startsWith('confirm_');

const ACTOR_TONES = { ai: 'accent', client: 'info', staff: 'primary', lawyer: 'info', system: 'muted' };

function activityIcon(type = '') {
  if (type.startsWith('ai.')) return 'sparkle';
  if (type.startsWith('message.')) return 'message';
  if (type === 'intake.converted') return 'briefcase';
  if (type === 'intake.archived') return 'x';
  if (type === 'intake.handled_internally') return 'checkCircle';
  if (type === 'intake.reopened') return 'refresh';
  if (type === 'intake.created' || type === 'intake.manual') return 'inbox';
  if (type.startsWith('client.')) return 'user';
  return null;
}

export default async function render(ctx) {
  const d = await api.get(`/admin/intakes/${encodeURIComponent(ctx.params.id)}`);
  const it = d.intake;
  const cl = d.client;
  const ai = d.ai || null;
  const out = ai ? ai.output || {} : null;
  const isOpen = OPEN.includes(it.status);
  const aiTitle = out && out.title;
  ctx.setTitle(`الطلب ${it.code}`);

  const base = `/admin/intakes/${it.id}`;
  // رقم من نموذج الموقع يطابق عميلًا مسجلًا دون إثبات أن المرسل صاحبه
  const identity = it.identity || {
    phone_match_unverified: Boolean(it.source_detail && it.source_detail.phone_match_unverified === true),
    confirmed_at: null,
    confirmed_by_name: null,
  };
  const unverified = Boolean(identity.phone_match_unverified) && !identity.confirmed_at;
  const portalLinks = Number(it.active_portal_links) || 0;

  // ───────────── أدوات ─────────────
  async function run(fn) {
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), 'danger');
    }
  }

  // ───────────── التحقق من هوية المرسل ─────────────
  async function confirmIdentity() {
    const ok = await confirmDialog({
      title: 'تأكيد هوية المرسل',
      message: 'أكّد فقط بعد التحقق من أن مقدم الطلب هو صاحب رقم الهاتف المسجل (مثلًا بمكالمة على الرقم أو برسالة منه عبر واتساب). بعد التأكيد يُعامل الطلب كطلب من المستفيد/ة نفسه.',
      confirmLabel: 'تأكيد الهوية',
    });
    if (!ok) return;
    await api.post(`${base}/confirm-identity`);
    toast('تم تأكيد هوية المرسل', 'success');
    await reloadAndFocus(ctx, '#pa-identity');
  }

  async function revokePortal() {
    const ok = await confirmDanger({
      title: 'إلغاء روابط البوابة',
      message: 'ستتوقف روابط البوابة الخاصة بهذا الطلب فورًا، ولن يستطيع من يملكها متابعة الطلب أو الاطلاع على رسائله. يمكن إنشاء رابط جديد لاحقًا من ملف المستفيد/ة بعد التحقق.',
      confirmLabel: 'نعم، إلغاء الروابط',
    });
    if (!ok) return;
    const res = await api.post(`${base}/revoke-portal`);
    const n = Number(res && res.revoked) || 0;
    toast(n ? `أُلغي ${count(n, ['رابط واحد', 'رابطان', 'روابط', 'رابطًا'])} للبوابة` : 'لا توجد روابط سارية لإلغائها', n ? 'success' : 'info');
    await reloadAndFocus(ctx, '#pa-identity');
  }

  function identityBlock() {
    if (unverified) {
      return alertBox(
        h(
          'div.stack-sm',
          h('p', 'رقم الهاتف أُدخل من نموذج الموقع ويطابق مستفيدًا مسجلًا، ولم يُثبت أن المرسل هو صاحب الرقم. لا تُرسل معلومات عن ملفات المستفيد/ة الأخرى قبل التحقق.'),
          portalLinks > 0 &&
            h('p.small', `لهذا الطلب ${count(portalLinks, ['رابط بوابة ساري', 'رابطا بوابة ساريان', 'روابط بوابة سارية', 'رابط بوابة ساريًا'])}؛ من يملكه يتابع الطلب ويرى رسائله.`),
          h(
            'div.btn-group',
            asyncButton('تأكيد هوية المرسل', confirmIdentity, { size: 'sm', variant: 'primary', icon: 'shieldCheck' }),
            portalLinks > 0 && asyncButton('إلغاء روابط البوابة', revokePortal, { size: 'sm', variant: 'danger', icon: 'x' }),
          ),
        ),
        'warning',
        { title: 'تنبيه: هوية المرسل غير مؤكدة', icon: 'shield' },
      );
    }
    if (identity.phone_unverified && !identity.confirmed_at) {
      // طلب من نموذج الموقع برقم جديد: لا يظهر في بوابة صاحب الرقم (رمز واتساب أو رابط الإدارة) قبل التأكيد
      return h(
        'div.pa-note.small.muted.stack-sm',
        h(
          'p',
          icon('shield', { size: 15 }),
          ' ',
          'رقم الهاتف أُدخل من نموذج الموقع ولم يُثبت بعد أن مقدّم الطلب صاحبه؛ لذلك لا يظهر هذا الطلب في صفحة المتابعة التي يدخلها صاحب الرقم برمز واتساب أو برابط ترسله الإدارة. يتابعه مقدّمه بالرابط الذي وصله عند الإرسال.',
        ),
        h('div.btn-group', asyncButton('تأكيد هوية المرسل', confirmIdentity, { size: 'sm', icon: 'shieldCheck' })),
      );
    }
    if (identity.confirmed_at) {
      return h(
        'p.pa-note.small.muted',
        icon('shieldCheck', { size: 15 }),
        h('span', `تم التحقق من الهوية${identity.confirmed_by_name ? ` بواسطة ${identity.confirmed_by_name}` : ''} في ${dateTime(identity.confirmed_at)}.`),
      );
    }
    return null;
  }

  // ───────────── القرار ─────────────
  function decisionCard() {
    if (it.status === 'converted') {
      return alertBox(
        h(
          'div.pa-alert-row',
          h('span', 'قررت الإدارة أن هذا الطلب يستحق ملفًا قانونيًا، وصدر له الكود ', d.case ? codeTag(d.case.code) : null, '. تستمر المحادثة مع المستفيد/ة داخل الملف.'),
          d.case && button('فتح الملف', { variant: 'primary', size: 'sm', icon: 'briefcase', href: `#/cases/${d.case.id}` }),
        ),
        'success',
        { title: 'تحوّل الطلب إلى ملف قانوني', icon: 'checkCircle' },
      );
    }
    if (it.status === 'handled_internally' || it.status === 'archived') {
      const handled = it.status === 'handled_internally';
      return alertBox(
        h(
          'div.pa-alert-row',
          h('span', h('span.pa-alert-label', handled ? 'ملخص ما تم: ' : 'سبب الأرشفة: '), it.resolution_note || '—'),
          button('إعادة فتح الطلب', { size: 'sm', icon: 'refresh', onClick: reopen }),
        ),
        handled ? 'success' : 'info',
        { title: handled ? 'تعاملت الإدارة مع الطلب داخليًا دون إسناده لمحامٍ' : 'الطلب مؤرشف', icon: handled ? 'checkCircle' : 'info' },
      );
    }
    const opt = (cls, iconName, title, text, onClick) =>
      h('button.pa-decide-opt', { type: 'button', class: cls, onClick }, h('span.pa-decide-icon', icon(iconName, { size: 20 })), h('span.pa-decide-text', h('strong', title), h('span', text)));
    return card({
      title: 'ما القرار في هذا الطلب؟',
      subtitle: 'الرسالة لا تتحول تلقائيًا إلى ملف — تقرر الإدارة بعد قراءة الطلب وفرزه.',
      icon: 'scale',
      className: 'pa-decide-card',
      body: h(
        'div.pa-decide',
        opt('is-primary', 'briefcase', 'تحويل إلى ملف قانوني', 'يحتاج دراسة محامٍ: يصدر له كود ملف مستقل ويُسند إلى فريق.', openConvert),
        opt('', 'checkCircle', 'تعامل داخلي دون محامٍ', 'استفسار بسيط ترد عليه الإدارة مباشرة دون إسناده لمحامٍ.', openHandle),
        opt('is-muted', 'x', 'أرشفة', 'رسالة غير جدية أو مكررة أو خارج نطاق الخدمة. يمكن إعادة فتحها لاحقًا.', openArchive),
      ),
    });
  }

  async function reopen() {
    const ok = await confirmDialog({
      title: 'إعادة فتح الطلب',
      message: 'سيعود الطلب إلى قائمة الفرز بحالة «قيد الفرز» لتتخذ الإدارة قرارًا جديدًا بشأنه.',
      confirmLabel: 'إعادة الفتح',
    });
    if (!ok) return;
    await run(async () => {
      await api.post(`${base}/reopen`);
      toast('أُعيد فتح الطلب للفرز', 'success');
      await reloadAndFocus(ctx, '#pa-decision');
    });
  }

  async function openHandle() {
    const res = await formDialog({
      title: 'تعامل داخلي دون محامٍ',
      intro: 'استخدم هذا الخيار للاستفسارات البسيطة التي تجيب عنها الإدارة مباشرة. يُغلق الطلب ويُسجل ما تم في سجل المستفيد/ة، ولا يُصدر له كود ملف.',
      submitLabel: 'إغلاق الطلب كتعامل داخلي',
      size: 'lg',
      values: { legal_area: it.legal_area || (out && out.legal_area) || null, channel: 'auto' },
      fields: [
        {
          name: 'resolution_note',
          label: 'ملخص ما تم',
          type: 'textarea',
          required: true,
          minLength: 5,
          maxLength: 3000,
          rows: 3,
          hint: 'مثال: أُجيب المستفيد/ة بخطوات استخراج إعلام الوراثة والمستندات المطلوبة. يُحفظ داخليًا فقط.',
        },
        { name: 'legal_area', label: 'المجال القانوني', type: 'select', options: areaOptions(), hint: 'يساعد في قياس دقة تصنيف الذكاء الاصطناعي وتحليل الطلبات' },
        { name: 'channel', label: 'قناة الرد', type: 'select', placeholder: false, options: REPLY_CHANNELS },
        { name: 'reply', label: 'رد يُرسل للمستفيد/ة (اختياري)', type: 'textarea', maxLength: 4000, rows: 4, hint: 'اتركه فارغًا إذا كنت قد رددت عليه بالفعل في المحادثة أو هاتفيًا.' },
      ],
      onSubmit: (v) =>
        api.post(`${base}/handle-internally`, {
          resolution_note: v.resolution_note,
          legal_area: v.legal_area || undefined,
          reply: v.reply || undefined,
          channel: v.channel || 'auto',
        }),
    });
    if (res) {
      toast('أُغلق الطلب كتعامل داخلي دون إسناده لمحامٍ', 'success');
      await reloadAndFocus(ctx, '#pa-decision');
    }
  }

  async function openArchive() {
    const res = await formDialog({
      title: 'أرشفة الطلب',
      intro: 'تُستخدم الأرشفة للرسائل غير الجدية أو المكررة أو الخارجة عن نطاق الخدمة. يبقى الطلب محفوظًا ويمكن إعادة فتحه إذا تواصل المستفيد/ة مجددًا.',
      submitLabel: 'أرشفة الطلب',
      fields: [{ name: 'reason', label: 'سبب الأرشفة', type: 'textarea', required: true, minLength: 3, maxLength: 500, rows: 3 }],
      onSubmit: (v) => api.post(`${base}/archive`, { reason: v.reason }),
    });
    if (res) {
      toast('تمت أرشفة الطلب', 'success');
      await reloadAndFocus(ctx, '#pa-decision');
    }
  }

  // ───────────── التحويل إلى ملف ─────────────
  function openConvert() {
    const area0 = it.legal_area || (out && out.legal_area) || null;
    const facts = (out && Array.isArray(out.facts) ? out.facts : []).map((f) => `• ${f}`);
    const summary = it.summary || (out && out.summary) || '';
    const factsShared = [summary, facts.length ? `\nالوقائع كما وردت من المستفيد/ة:\n${facts.join('\n')}` : ''].filter(Boolean).join('\n').trim();

    const main = form(
      [
        { name: 'legal_area', label: 'المجال القانوني', type: 'select', required: true, options: areaOptions(), hint: 'يحدد بادئة كود الملف (مثل INH للمواريث)' },
        { name: 'title', label: 'عنوان الملف', required: true, maxLength: 200 },
        { name: 'priority', label: 'الأولوية', type: 'select', placeholder: false, options: options('priority') },
        { name: 'due_at', label: 'الموعد المستهدف للرد على المستفيد/ة', type: 'date', endOfDay: true, min: cairoToday() },
        {
          name: 'case_manager_id',
          label: 'مدير الحالة',
          type: 'select',
          options: (d.staff || []).map((s) => ({ value: s.id, label: `${s.name} — ${label('user_role', s.role)}` })),
        },
        {
          name: 'facts_shared',
          label: 'ملخص الوقائع للمحامين',
          type: 'textarea',
          rows: 6,
          maxLength: 20000,
          hint: 'هذا ما يمكن إتاحته للمحامين لاحقًا — لا تكتب هنا رقم الهاتف أو بيانات التواصل أو مصدر المستفيد/ة.',
        },
        { name: 'facts_internal', label: 'ملاحظات داخلية (لا تظهر للمحامين)', type: 'textarea', rows: 3, maxLength: 20000 },
      ],
      {
        footer: false,
        values: {
          legal_area: area0,
          title: it.title || aiTitle || '',
          priority: it.priority || 'normal',
          case_manager_id: it.assigned_staff_id || (ctx.user && ctx.user.id) || null,
          facts_shared: factsShared,
          facts_internal: it.internal_notes || '',
        },
      },
    );

    const clientForm = form(
      [
        { name: 'name', label: 'اسم المستفيد/ة', maxLength: 150 },
        { name: 'national_id', label: 'الرقم القومي', ltr: true, maxLength: 14, hint: '14 رقمًا — اختياري' },
        { name: 'governorate', label: 'المحافظة', type: 'select', options: governorateOptions() },
      ],
      { footer: false, columns: 2, values: { name: (cl && cl.name) || it.contact_name || '', national_id: (cl && cl.national_id) || '', governorate: (cl && cl.governorate) || it.governorate || null } },
    );

    // المسائل: المقترحة من الذكاء الاصطناعي (محددة مسبقًا) + ما يضيفه الموظف
    const issues = (out && Array.isArray(out.suggested_issues) ? out.suggested_issues : []).map((x) => ({
      title: x.title,
      details: x.details || null,
      legal_area: x.legal_area || null,
      origin: 'ai',
      checked: true,
    }));
    const issuesList = h('ol.pa-issues-list');
    const issueInput = h('input.input', { type: 'text', maxlength: 300, placeholder: 'اكتب مسألة قانونية أخرى…', 'aria-label': 'مسألة جديدة' });
    const issueArea = h(
      'select.input',
      { 'aria-label': 'مجال المسألة الجديدة' },
      h('option', { value: '' }, 'نفس مجال الملف'),
      areaOptions().map((o) => h('option', { value: o.value }, o.label)),
    );
    const issueNote = h('p.field-error', { hidden: true, role: 'alert' });

    function drawIssues() {
      if (!issues.length) {
        mount(issuesList, h('li.pa-issue.is-empty', 'لا توجد مسائل بعد. أضف المسائل التي يحتاج الملف إلى دراستها.'));
        return;
      }
      mount(
        issuesList,
        issues.map((x, i) => {
          const areaBadge = x.legal_area ? badge(areaLabel(x.legal_area), 'neutral') : null;
          if (x.origin === 'ai') {
            const cb = h('input', {
              type: 'checkbox',
              checked: x.checked,
              onChange: () => {
                x.checked = cb.checked;
              },
            });
            return h(
              'li.pa-issue',
              h('label.check', cb, h('span.pa-issue-title', x.title)),
              h('span.pa-issue-meta', areaBadge, badge('اقتراح الذكاء الاصطناعي', 'accent', { icon: 'sparkle' })),
            );
          }
          return h(
            'li.pa-issue',
            h('span.pa-issue-title', icon('check', { size: 16 }), x.title),
            h(
              'span.pa-issue-meta',
              areaBadge,
              badge('أضافتها الإدارة', 'primary'),
              button('', {
                variant: 'ghost',
                size: 'sm',
                icon: 'trash',
                title: `حذف المسألة: ${x.title}`,
                onClick: () => {
                  issues.splice(i, 1);
                  drawIssues();
                  issueInput.focus();
                },
              }),
            ),
          );
        }),
      );
    }
    function addIssue() {
      const t = issueInput.value.trim();
      issueNote.hidden = true;
      if (t.length < 3) {
        issueNote.textContent = 'اكتب عنوان المسألة (3 أحرف على الأقل)';
        issueNote.hidden = false;
        issueInput.focus();
        return;
      }
      if (issues.some((x) => x.title === t)) {
        issueNote.textContent = 'هذه المسألة موجودة بالفعل';
        issueNote.hidden = false;
        return;
      }
      issues.push({ title: t, details: null, legal_area: issueArea.value || null, origin: 'staff', checked: true });
      issueInput.value = '';
      issueArea.value = '';
      drawIssues();
      issueInput.focus();
    }
    issueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addIssue();
      }
    });
    drawIssues();

    // برنامج التمويل (اختياري) مع تنبيه الأهلية حسب المجال والمحافظة المختارين
    const program = programSelect({ area: area0, governorate: (cl && cl.governorate) || it.governorate || null });
    main.el.addEventListener('change', () => program.setContext({ area: main.getValues().legal_area }));
    clientForm.el.addEventListener('change', () => program.setContext({ governorate: clientForm.getValues().governorate }));

    let created = null;
    modal({
      title: 'تحويل الطلب إلى ملف قانوني',
      size: 'lg',
      body: frag(
        h(
          'p.modal-intro',
          richText('سيصدر للملف كود مستقل حسب المجال مثل INH-2026-00482، وتنتقل إليه المحادثة والمستندات. بعدها تختار الإدارة فريق المحامين وتحدد ما يراه كل منهم.'),
        ),
        main.el,
        h(
          'fieldset.pa-fieldset',
          h('legend', 'المسائل القانونية محل الدراسة'),
          h('p.field-hint', 'المسائل المقترحة محددة مسبقًا؛ ألغِ ما لا يلزم أو أضف غيرها. يمكن لاحقًا إتاحة كل مسألة لمحامٍ متخصص بعينه.'),
          issuesList,
          h('div.pa-issue-add', issueInput, h('div.select-wrap', issueArea), button('إضافة مسألة', { icon: 'plus', onClick: addIssue })),
          issueNote,
        ),
        h(
          'fieldset.pa-fieldset',
          h('legend', 'بيانات المستفيد/ة'),
          h('p.field-hint', 'تُحدَّث في ملف المستفيد/ة ', cl ? codeTag(cl.code) : null, '، ولا تظهر للمحامين إلا إذا أتاحت الإدارة الاسم صراحة.'),
          clientForm.el,
        ),
        h('fieldset.pa-fieldset', h('legend', 'التمويل'), program.el),
      ),
      actions: [
        { label: 'إلغاء', variant: 'ghost' },
        {
          label: 'تحويل وإصدار كود الملف',
          variant: 'primary',
          icon: 'briefcase',
          onClick: async () => {
            const okMain = main.validate();
            const okClient = clientForm.validate();
            if (!okMain || !okClient) return false;
            const v = main.getValues();
            const c = clientForm.getValues();
            const nid = toLatinDigits(c.national_id || '').replace(/\s/g, '');
            if (nid && !/^[23]\d{13}$/.test(nid)) {
              clientForm.setErrors({ national_id: 'الرقم القومي يجب أن يتكون من 14 رقمًا ويبدأ بـ 2 أو 3' });
              return false;
            }
            const client = {};
            if (c.name) client.name = c.name;
            if (nid) client.national_id = nid;
            if (c.governorate) client.governorate = c.governorate;
            const payload = {
              legal_area: v.legal_area,
              title: v.title,
              facts_shared: v.facts_shared || undefined,
              facts_internal: v.facts_internal || undefined,
              issues: issues.filter((x) => x.checked).map((x) => ({ title: x.title, details: x.details, legal_area: x.legal_area, origin: x.origin })),
              priority: v.priority || undefined,
              due_at: v.due_at || undefined,
              case_manager_id: v.case_manager_id || undefined,
              client: Object.keys(client).length ? client : undefined,
              ai_suggestion_id: ai ? ai.id : undefined,
              program_id: program.get() || undefined,
            };
            try {
              const res = await api.post(`${base}/convert`, payload);
              created = res.case;
            } catch (err) {
              main.showError(err);
              return false;
            }
            return undefined;
          },
        },
      ],
      onClose: () => {
        if (created) {
          toast(`تم إنشاء الملف ${created.code} — اختر الآن فريق المحامين وصلاحياتهم`, 'success', 6000);
          ctx.navigate(`/cases/${created.id}`);
        }
      },
    });
  }

  // ───────────── المحادثة ─────────────
  function conversationCard() {
    const msgs = d.messages || [];
    const conflicts = msgs.filter((m) => m.meta && m.meta.identity_conflict);
    const thread = chatThread(msgs, {
      inLabel: it.contact_name || (cl && cl.name) || 'المستفيد/ة',
      outLabel: 'المؤسسة',
      emptyText: 'لا توجد رسائل في هذا الطلب بعد',
    });
    // علامات داخل المحادثة: رقم يذكر طلبًا لعميل آخر، ورسائل فشل إرسالها
    const nodes = thread.querySelectorAll ? [...thread.querySelectorAll('.msg')] : [];
    msgs.forEach((m, i) => {
      const node = nodes[i];
      if (!node) return;
      const ic = m.meta && m.meta.identity_conflict;
      if (ic) {
        node.after(
          h(
            'div.pa-msg-flag',
            { class: m.direction === 'in' ? 'is-start' : 'is-end' },
            icon('alert', { size: 14 }),
            h('span', 'يذكر رقم طلب لمستفيد/ة آخر: ', codeTag(ic.intake_code)),
          ),
        );
      }
      if (m.direction === 'out' && m.status === 'failed') {
        node.after(
          h(
            'div.pa-msg-flag.is-end.is-danger',
            icon('alert', { size: 14 }),
            h('span', m.error ? `فشل الإرسال: ${m.error}` : 'فشل إرسال هذه الرسالة'),
            asyncButton(
              'إعادة المحاولة',
              async () => {
                await api.post(`/admin/messages/${m.id}/retry`);
                toast('أُعيدت محاولة الإرسال', 'success');
                await reloadAndFocus(ctx, '#pa-conversation');
              },
              { variant: 'link', size: 'sm', icon: 'refresh' },
            ),
          ),
        );
      }
      if (m.meta && m.meta.referral && m.meta.referral.headline) {
        node.after(h('div.pa-msg-flag.is-start.is-info', icon('flag', { size: 14 }), h('span', `وصلت عبر إعلان: «${m.meta.referral.headline}»`)));
      }
    });
    const scroller = h('div.pa-chat-scroll', thread);
    requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
    });

    const banners = conflicts.map((m) => {
      const ic = m.meta.identity_conflict;
      return alertBox(
        h(
          'div.pa-alert-row',
          h(
            'span',
            `رسالة بتاريخ ${dateTime(m.created_at)} من رقم غير مسجل لصاحب الطلب تذكر رقم الطلب `,
            codeTag(ic.intake_code),
            ic.client_code ? [' الخاص بالمستفيد/ة ', codeTag(ic.client_code)] : null,
            '. لم يدمج النظام الملفين تلقائيًا حماية للخصوصية — تحقق من هوية المرسل أولًا.',
          ),
          h(
            'span.row',
            ic.intake_id && button('فتح الطلب المذكور', { size: 'sm', icon: 'externalLink', href: `#/inbox/${ic.intake_id}` }),
            cl && ic.client_code && button('دمج بعد التحقق', { size: 'sm', icon: 'link', onClick: () => mergeFlow(ic.client_code) }),
          ),
        ),
        'warning',
        { title: 'يذكر رقم طلب لمستفيد/ة آخر' },
      );
    });

    // كل مستندات الطلب (المرفقة بالرسائل وغيرها) تُعرض مع تحليلها في بطاقة «مستندات الطلب» أسفل المحادثة
    const chans = it.channels && it.channels.length ? it.channels : [it.first_channel];
    return card({
      title: 'المحادثة',
      subtitle: `${count(msgs.length, ['رسالة واحدة', 'رسالتان', 'رسائل', 'رسالة'])} عبر ${chans.map((c) => label('channel', c)).join(' و')}`,
      icon: 'message',
      actions: channelIcons(chans, { withLabels: true }),
      body: frag(banners.length ? h('div.stack-sm.mb-3', banners) : null, scroller, composer()),
    });
  }

  // ───────────── المستندات وتحليلها (v9 ai) ─────────────
  const allDocs = d.documents || [];
  // آخر تحليل لكل مستند: ما حُلل ضمن الطلب، وما حُلل بعد تحويله إلى ملف
  const analyses = allDocs.length ? docAnalysisStore([{ intake_id: it.id }, d.case && d.case.id && { case_id: d.case.id }]) : null;

  // (إصلاح 9.1) صور المستفيدة تصل باسم «ورقة 1»/«صورة 2» فلا يفهم المحامي منها شيئًا: الفرز يسمّيها (شهادة الوفاة…)
  async function renameDoc(doc) {
    const res = await formDialog({
      title: 'تسمية المستند',
      intro: 'اكتب اسم الورقة كما هي (مثل: شهادة الوفاة، قسيمة الزواج). الاسم يظهر للمحامي إن أُتيح له المستند.',
      fields: [{ name: 'title', label: 'اسم المستند', type: 'text', required: true, maxLength: 200 }],
      values: { title: GENERIC_DOC_NAME.test(doc.title || '') ? '' : doc.title || '' },
      onSubmit: (v) => api.patch(`/admin/documents/${doc.id}`, { title: v.title }),
    });
    if (res) {
      toast('تم تحديث اسم المستند', 'success');
      await reloadAndFocus(ctx, '#pa-documents');
    }
  }

  function documentsCard() {
    const inMessages = new Set();
    for (const m of d.messages || []) for (const x of m.documents || []) inMessages.add(x.id);
    const generic = allDocs.filter((doc) => !String(doc.mime || '').startsWith('audio/') && GENERIC_DOC_NAME.test(doc.title || doc.filename || '')).length;
    const el = card({
      title: 'مستندات الطلب',
      subtitle: `عدد المستندات: ${allDocs.length} — حلّل المستند لمعرفة نوعه ووقائعه وما يثبته`,
      icon: 'paperclip',
      body: frag(
        generic
          ? h('p.pa-note.mb-2', icon('info', { size: 15 }), h('span', `${generic === 1 ? 'مستند باسم عام' : `${generic} مستندات بأسماء عامة`} مثل «ورقة 1»: سمّه بما فيه حتى يعرف المحامي ما لديه ولا يطلبه مرة أخرى.`))
          : null,
        h(
        'ul.pc-docs.doc-ai-docs',
        allDocs.map((doc) => {
          const name = doc.title || doc.filename || 'مستند';
          return h(
            'li.pc-doc',
            h('span.pc-doc-icon', icon('fileText', { size: 18 })),
            h(
              'div.pc-doc-text',
              // (إصلاح 9.1) اسم ملف بامتداد («ورقة-1.jpg») يُعرض LTR: كان يظهر «jpg.1-ورقة»
              h('span.pc-doc-name', { dir: /\.[A-Za-z0-9]{2,5}$/.test(name) ? 'ltr' : 'auto', title: name }, name),
              h(
                'span.pc-doc-meta',
                [formatBytes(doc.size), inMessages.has(doc.id) ? 'مرفق في المحادثة' : 'مرفق بالطلب', doc.created_at && dateTime(doc.created_at)].filter(Boolean).join(' · '),
              ),
              // v9.1 b-forms: الرسالة الصوتية تُسمع هنا مباشرة (metadata: مدتها ظاهرة قبل التشغيل)
              String(doc.mime || '').startsWith('audio/') && h('audio.doc-audio-player', { controls: true, preload: 'metadata', src: downloadUrl(doc.id), 'aria-label': `رسالة صوتية: ${name}` }),
              docAiBadge(analyses, doc.id),
            ),
            h(
              'div.pc-doc-actions',
              button('تنزيل', { size: 'sm', variant: 'ghost', icon: 'download', href: downloadUrl(doc.id), target: '_blank', ariaLabel: `تنزيل ${name}` }),
              !String(doc.mime || '').startsWith('audio/') && button('تسمية', { size: 'sm', variant: 'ghost', icon: 'edit', onClick: () => renameDoc(doc), ariaLabel: `تسمية ${name}` }),
              docAiAction(analyses, doc),
            ),
          );
        }),
        ),
      ),
    });
    return el;
  }

  function composer() {
    if (it.status === 'converted') {
      return h(
        'p.pa-note.mt-3',
        icon('info', { size: 15 }),
        h('span', 'تستمر المراسلات مع المستفيد/ة داخل الملف القانوني ', d.case ? h('a', { href: `#/cases/${d.case.id}` }, codeTag(d.case.code)) : null, '.'),
      );
    }
    const ta = h('textarea.input', { rows: 3, maxlength: 4000, placeholder: 'اكتب ردك على المستفيد/ة…' });
    // v9.1 b-site (B91-01): أين يصل الرد؟ «واتساب + صفحة المتابعة» أو «صفحة المتابعة فقط — الرقم غير مؤكد»
    const replyChannel = it.identity && it.identity.reply_channel ? `يصل الرد: ${it.identity.reply_channel.text}. ` : '';
    const wrap = field('الرد على المستفيد/ة', ta, { hint: `${replyChannel}يُرسل من قناة المؤسسة الرسمية ويُسجل في المحادثة. Ctrl + Enter للإرسال.` });
    // (v9) ردود جاهزة واقتراح رد. الهوية غير المؤكدة: الاسم كما كتبه المرسل فقط، دون ربط بملف العميل المسجل
    const tools = composerTools(ta, {
      context: {
        client_name: (unverified ? it.contact_name : (cl && cl.name) || it.contact_name) || undefined,
        request_code: it.code,
        intake_id: it.id,
        client_id: !unverified && it.client_id ? it.client_id : undefined,
      },
      ai: { intakeId: it.id },
    });
    const chan = h('select.input', { 'aria-label': 'قناة الإرسال' }, REPLY_CHANNELS.map((o) => h('option', { value: o.value }, o.label)));
    const awaitCb = h('input', { type: 'checkbox', disabled: !['new', 'in_review'].includes(it.status) });
    const sendBtn = asyncButton(
      'إرسال الرد',
      async () => {
        const body = ta.value.trim();
        if (!body) {
          wrap.setError('اكتب نص الرد أولًا');
          ta.focus();
          return;
        }
        wrap.setError('');
        const msg = await api.post(`${base}/reply`, { body, channel: chan.value, await_client: awaitCb.checked });
        tools.sent(body);
        toast(
          msg && msg.status === 'simulated'
            ? 'سُجّل الرد كإرسال تجريبي (محاكاة) لعدم ضبط بيانات واتساب'
            : `تم إرسال الرد${msg && msg.channel ? ` عبر ${label('channel', msg.channel)}` : ''}`,
          'success',
        );
        await reloadAndFocus(ctx, '.pa-composer textarea');
      },
      { variant: 'primary', icon: 'send' },
    );
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendBtn.click();
      }
    });
    return h(
      'div.composer.pa-composer',
      unverified &&
        h(
          'p.pa-note.is-warning',
          icon('alert', { size: 15 }),
          h('span', 'الهوية غير مؤكدة: الرد عبر واتساب يصل إلى صاحب الرقم المسجل، والرد عبر الموقع يصل إلى من أرسل النموذج — فلا تذكر تفاصيل من ملفات المستفيد/ة الأخرى.'),
        ),
      wrap,
      h(
        'div.composer-actions',
        tools.el,
        h(
          'div.pa-composer-opts',
          h('div.select-wrap', chan),
          h(
            'label.check',
            { title: it.status === 'awaiting_client' ? 'الطلب بانتظار المستفيد/ة بالفعل' : null },
            awaitCb,
            h('span', 'بانتظار رد المستفيد/ة'),
          ),
        ),
        sendBtn,
      ),
    );
  }

  // ───────────── بيانات الفرز ─────────────
  function triageCard() {
    if (it.status === 'converted') {
      return card({
        title: 'بيانات الفرز',
        icon: 'filter',
        body: kv(
          [
            ['موضوع الطلب', it.title],
            ['المجال القانوني', it.legal_area ? areaLabel(it.legal_area) : null],
            ['نوع الطلب', it.kind ? label('intake_kind', it.kind) : null],
            ['الأولوية', statusBadge('priority', it.priority)],
            ['ملخص الطلب', it.summary ? h('span.pre', it.summary) : null],
            ['ملاحظات داخلية', it.internal_notes ? h('span.pre', it.internal_notes) : null],
          ],
          { columns: 1 },
        ),
      });
    }
    const staffOpts = (d.staff || []).map((s) => ({ value: s.id, label: s.name }));
    const f = form(
      [
        { name: 'title', label: 'موضوع الطلب', maxLength: 200, full: true },
        { name: 'legal_area', label: 'المجال القانوني', type: 'select', options: areaOptions() },
        { name: 'kind', label: 'نوع الطلب', type: 'select', options: options('intake_kind') },
        { name: 'priority', label: 'الأولوية', type: 'select', required: true, placeholder: false, options: options('priority') },
        { name: 'assigned_staff_id', label: 'المسؤول عن الفرز', type: 'select', options: staffOpts },
        { name: 'source', label: 'مصدر المستفيد/ة', type: 'select', required: true, placeholder: false, options: options('source') },
        { name: 'campaign', label: 'الحملة / جهة الإحالة', maxLength: 150 },
        { name: 'summary', label: 'ملخص الطلب', type: 'textarea', rows: 3, maxLength: 5000 },
        { name: 'internal_notes', label: 'ملاحظات داخلية', type: 'textarea', rows: 3, maxLength: 10000, hint: 'لا تظهر للمستفيد/ة ولا للمحامين' },
      ],
      {
        values: {
          title: it.title,
          legal_area: it.legal_area,
          kind: it.kind,
          priority: it.priority || 'normal',
          assigned_staff_id: it.assigned_staff_id,
          source: it.source || 'unknown',
          campaign: it.campaign,
          summary: it.summary,
          internal_notes: it.internal_notes,
        },
        submitLabel: 'حفظ بيانات الفرز',
        submitIcon: 'check',
        onSubmit: (v) =>
          api.patch(base, {
            title: v.title || null,
            legal_area: v.legal_area || null,
            kind: v.kind || null,
            priority: v.priority,
            assigned_staff_id: v.assigned_staff_id || null,
            source: v.source,
            campaign: v.campaign || null,
            summary: v.summary || null,
            internal_notes: v.internal_notes || null,
          }),
        onSuccess: async () => {
          toast('تم حفظ بيانات الفرز', 'success');
          await reloadAndFocus(ctx, '#pa-triage');
        },
      },
    );

    const suggestions = out
      ? [
          ['title', out.title, out.title],
          ['legal_area', out.legal_area, out.legal_area ? areaLabel(out.legal_area) : null],
          ['priority', out.urgency, out.urgency ? label('priority', out.urgency) : null],
          ['summary', out.summary, out.summary],
        ].filter(([, v]) => v)
      : [];
    for (const [name, value, display] of suggestions) {
      const c = f.control(name);
      if (!c || !c.wrap) continue;
      c.wrap.append(
        h(
          'div.pa-suggest',
          h('span.pa-suggest-val', icon('sparkle', { size: 13 }), h('span', 'اقتراح: '), h('span.pa-suggest-text', display)),
          button('استخدام الاقتراح', {
            variant: 'link',
            size: 'sm',
            title: `استخدام اقتراح الذكاء الاصطناعي في حقل ${c.spec.label}`,
            onClick: () => {
              f.setValues({ [name]: value });
              const el = c.focusEl && c.focusEl();
              if (el) el.focus();
            },
          }),
        ),
      );
    }
    const fillAll = suggestions.length
      ? button('استخدام اقتراح الذكاء الاصطناعي', {
          size: 'sm',
          icon: 'sparkle',
          title: 'يملأ الحقول الفارغة فقط من اقتراحات الذكاء الاصطناعي',
          onClick: () => {
            const cur = f.getValues();
            const patch = {};
            for (const [name, value] of suggestions) {
              if (name === 'priority') {
                if (cur.priority === 'normal' && value !== 'normal') patch.priority = value;
              } else if (!cur[name]) patch[name] = value;
            }
            if (!Object.keys(patch).length) toast('الحقول ممتلئة بالفعل — استخدم «استخدام الاقتراح» بجوار كل حقل للاستبدال', 'info');
            else {
              f.setValues(patch);
              toast('مُلئت الحقول الفارغة من اقتراح الذكاء الاصطناعي — راجعها ثم احفظ', 'success');
            }
          },
        })
      : null;

    return card({
      title: 'بيانات الفرز',
      subtitle: 'تصنيف الطلب وأولويته ومصدره — بيانات داخلية لا يراها المستفيد/ة',
      icon: 'filter',
      actions: fillAll,
      body: f.el,
    });
  }

  // ───────────── تحليل الذكاء الاصطناعي ─────────────
  function latestFeedback(fieldName) {
    const rows = (d.feedback || []).filter((x) => x.field === fieldName && (!ai || x.suggestion_id == null || x.suggestion_id === ai.id));
    return rows.length ? rows[rows.length - 1] : null;
  }

  function feedbackControl(fieldName, aiValue) {
    const prev = latestFeedback(fieldName);
    let current = prev ? prev.verdict : null;
    const status = h('span.pa-fb-status', { 'aria-live': 'polite' });
    let okBtn;
    let badBtn;
    const sync = () => {
      okBtn.setAttribute('aria-pressed', String(current === 'accepted'));
      badBtn.setAttribute('aria-pressed', String(current === 'rejected' || current === 'corrected' || current === 'missed'));
      okBtn.classList.toggle('is-on', current === 'accepted');
      badBtn.classList.toggle('is-on', Boolean(current) && current !== 'accepted');
      status.textContent = current ? `مسجل: ${label('ai_verdict', current)}` : '';
    };
    const send = (verdict) => async () => {
      await api.post(`${base}/ai-feedback`, { field: fieldName, verdict, ai_value: aiValue });
      current = verdict;
      sync();
      toast('سُجّل تقييمك — يُستخدم لقياس دقة الذكاء الاصطناعي وتحسينه', 'success', 2500);
    };
    okBtn = asyncButton('صحيح', send('accepted'), { variant: 'ghost', size: 'sm', icon: 'check', className: 'pa-fb-btn is-ok' });
    badBtn = asyncButton('غير دقيق', send('rejected'), { variant: 'ghost', size: 'sm', icon: 'x', className: 'pa-fb-btn is-bad' });
    sync();
    return h('div.pa-fb', { role: 'group', 'aria-label': `تقييم: ${label('ai_field', fieldName)}` }, okBtn, badBtn, status);
  }

  function aiBlock(title, content, fb) {
    return h('section.pa-ai-block', h('div.pa-ai-block-head', h('h3.pa-ai-h', title), fb), content);
  }

  function aiCard() {
    const reanalyze = asyncButton(
      ai ? 'إعادة التحليل' : 'تحليل الآن',
      async () => {
        await api.post(`${base}/analyze`);
        toast('اكتمل تحليل الذكاء الاصطناعي', 'success');
        await reloadAndFocus(ctx, '#pa-ai');
      },
      { size: 'sm', icon: ai ? 'refresh' : 'sparkle' },
    );
    if (!ai) {
      return card({
        title: 'تحليل الذكاء الاصطناعي',
        icon: 'sparkle',
        className: 'pa-ai-card',
        body: emptyState('لم يُحلَّل هذا الطلب بعد. يقترح التحليل عنوانًا وتصنيفًا وملخصًا والمعلومات الناقصة والحالات المشابهة.', reanalyze, { compact: true, icon: 'sparkle' }),
      });
    }
    const provider = ai.provider === 'anthropic' ? 'Claude' : 'المحلل المحلي';
    const missing = Array.isArray(out.missing_info) ? out.missing_info : [];
    const missingItems = missing.map((m) => (typeof m === 'string' ? { item: m, kind: 'information' } : m));
    const similar = (out.similar && out.similar.items) || [];
    const similarTotal = (out.similar && out.similar.total) || similar.length;

    const blocks = [
      h(
        'div.pa-ai-meta',
        badge(provider, ai.provider === 'anthropic' ? 'accent' : 'neutral', { icon: 'sparkle', title: ai.model || '' }),
        h('time.small.muted', { datetime: ai.created_at, title: dateTime(ai.created_at) }, `حُلّل ${relative(ai.created_at)}`),
        h('span.spacer'),
        reanalyze,
      ),
      out._fallback_reason && alertBox(`تعذر الوصول إلى النموذج اللغوي فاستُخدم المحلل المحلي: ${out._fallback_reason}`, 'warning'),
      out.title && aiBlock('العنوان المقترح', h('p.pa-ai-text.is-strong', out.title), feedbackControl('title', out.title)),
      out.legal_area &&
        aiBlock(
          'التصنيف القانوني',
          h(
            'div.stack-sm',
            h('div.row', badge(areaLabel(out.legal_area), 'primary'), out.urgency && statusBadge('priority', out.urgency, { dot: false, title: 'الأولوية المقترحة' })),
            out.confidence != null &&
              progressBar(Math.round(out.confidence * 100), 100, out.confidence >= 0.7 ? 'success' : out.confidence >= 0.5 ? 'warning' : 'danger', {
                label: `درجة الثقة ${percent(out.confidence)}`,
              }),
            out.secondary_areas && out.secondary_areas.length
              ? h('div.pa-ai-sub', h('span.small.muted', 'مجالات ثانوية: '), chips(out.secondary_areas.map((a) => ({ label: areaLabel(a), tone: 'info' }))))
              : null,
            out.specialist_hint && h('p.pa-note', icon('users', { size: 15 }), h('span', out.specialist_hint)),
          ),
          feedbackControl('legal_area', out.legal_area),
        ),
      out.summary && aiBlock('الملخص', h('p.pa-ai-text', richText(out.summary)), feedbackControl('summary', out.summary)),
      Array.isArray(out.facts) && out.facts.length
        ? aiBlock('الوقائع المستخلصة', h('ul.pa-ai-list', out.facts.map((f) => h('li', { dir: 'auto' }, richText(f)))))
        : null,
      aiBlock(
        'معلومات ومستندات ناقصة',
        missingItems.length
          ? h(
              'ul.pa-missing',
              missingItems.map((m) =>
                h(
                  'li',
                  h('span.pa-missing-icon', { class: m.kind === 'document' ? 'is-doc' : 'is-info', title: m.kind === 'document' ? 'مستند' : 'معلومة' }, icon(m.kind === 'document' ? 'fileText' : 'info', { size: 15 })),
                  h('span', m.item),
                  h('span.sr-only', m.kind === 'document' ? ' (مستند)' : ' (معلومة)'),
                ),
              ),
            )
          : h('p.pa-ai-text.muted', 'تبدو المعلومات المقدمة كافية لبدء الدراسة.'),
        feedbackControl('missing_info', missingItems.map((m) => m.item)),
      ),
      Array.isArray(out.suggested_issues) && out.suggested_issues.length
        ? aiBlock(
            'مسائل قانونية مقترحة',
            h(
              'ol.pa-ai-list.is-numbered',
              out.suggested_issues.map((x) => h('li', h('span', x.title), x.legal_area && x.legal_area !== out.legal_area ? badge(areaLabel(x.legal_area), 'info') : null)),
            ),
          )
        : null,
      aiBlock(
        similarTotal ? similarText(similarTotal) : 'حالات مشابهة',
        similar.length
          ? h(
              'ul.pa-similar',
              similar.slice(0, 5).map((s) =>
                h(
                  'li',
                  h(
                    'a.pa-similar-link',
                    { href: s.type === 'case' || !s.type ? `#/cases/${s.id}` : `#/knowledge/${s.id}` },
                    h('span.pa-similar-head', s.code ? codeTag(s.code) : null, badge(`تشابه ${percent(s.score)}`, 'neutral')),
                    h('span.pa-similar-title', s.title),
                    h('span.pa-similar-foot', s.status ? statusBadge('case_status', s.status) : null, s.outcome ? h('span.small.muted', label('case_outcome', s.outcome)) : null),
                  ),
                ),
              ),
            )
          : h('p.pa-ai-text.muted', 'لم يجد الذكاء الاصطناعي حالات مشابهة في ملفات المؤسسة السابقة.'),
      ),
    ];

    const fbAll = d.feedback || [];
    const history = fbAll.length
      ? h(
          'details.pa-details',
          h('summary', `سجل تقييمات الإدارة لهذا التحليل (${fbAll.length})`),
          h(
            'ul.pa-fb-history',
            fbAll
              .slice()
              .reverse()
              .map((x) =>
                h('li', h('span', label('ai_field', x.field)), statusBadge('ai_verdict', x.verdict), h('time.small.muted', { datetime: x.created_at, title: dateTime(x.created_at) }, relative(x.created_at))),
              ),
          ),
        )
      : null;

    return card({
      title: 'تحليل الذكاء الاصطناعي',
      subtitle: 'مساعد فقط — القرار للإدارة، وتقييمك يُسجَّل لتحسينه',
      icon: 'sparkle',
      className: 'pa-ai-card',
      body: h('div.pa-ai', blocks, history),
    });
  }

  // ───────────── العميل ─────────────
  async function mergeFlow(initialQuery = '') {
    if (!cl) return;
    const target = await pickClient({
      title: MERGE_LABEL,
      intro: 'استخدم الدمج عندما يكون صاحب هذا الطلب هو نفسه مستفيدًا مسجلًا برقم أو بريد آخر. ابحث عن الملف الأساسي واختره.',
      excludeId: cl.id,
      initialQuery,
    });
    if (!target) return;
    const ok = await confirmDanger({
      title: 'تأكيد دمج الملفين',
      message: [
        'سيُدمج الملف ',
        codeTag(cl.code),
        cl.name ? ` (${cl.name})` : '',
        ' في الملف ',
        codeTag(target.code),
        target.name ? ` (${target.name})` : '',
        ': تنتقل إليه كل أرقام التواصل والطلبات والملفات والرسائل، ويتوقف استخدام الرقم ',
        codeTag(cl.code),
        '. لا يمكن التراجع عن الدمج.',
      ],
      confirmLabel: 'نعم، ادمج الملفين',
    });
    if (!ok) return;
    await run(async () => {
      await api.post(`${base}/link-client`, { client_id: target.id });
      toast(`تم الدمج — أصبح الطلب مرتبطًا بالمستفيد/ة ${target.code}`, 'success');
      await reloadAndFocus(ctx, '#pa-client');
    });
  }

  function clientCard() {
    if (!cl) {
      return card({ title: 'المستفيد/ة', icon: 'user', body: emptyState('لا يوجد مستفيد/ة مرتبط بهذا الطلب', null, { compact: true, icon: 'user' }) });
    }
    const idents = cl.identities || [];
    const allChannels = [...new Set([...idents.flatMap((x) => x.channels || []), ...(it.channels || [])])];
    const others = cl.other_intakes || [];
    const cases = cl.cases || [];
    return card({
      title: 'المستفيد/ة',
      icon: 'user',
      actions: button('ملف المستفيد/ة', { variant: 'ghost', size: 'sm', icon: 'externalLink', href: `#/clients/${cl.id}` }),
      body: h(
        'div.stack',
        kv([
          ['كود المستفيد/ة', h('a.pa-plain-link', { href: `#/clients/${cl.id}` }, codeTag(cl.code))],
          ['الاسم', cl.name || it.contact_name],
          ['الهاتف', cl.phone ? h('span.row', ltr(cl.phone), copyButton(cl.phone, '')) : null],
          cl.email && ['البريد', ltr(cl.email)],
          ['المحافظة', cl.governorate || it.governorate],
        ]),
        unverified
          ? h(
              'p.pa-note.is-warning',
              icon('alert', { size: 15 }),
              h('span', 'رُبط الطلب بهذا المستفيد/ة لتطابق رقم الهاتف فقط، والهوية غير مؤكدة: لا تعتمد على تاريخ المستفيد/ة أدناه في الرد قبل التحقق.'),
            )
          : allChannels.length
          ? h(
              'p.pa-note.is-info',
              icon('link', { size: 15 }),
              h(
                'span',
                allChannels.length > 1
                  ? `ربط النظام تلقائيًا ما وصل من ${allChannels.map((c) => label('channel', c)).join(' و')} بنفس المستفيد/ة `
                  : `يتعرّف النظام على هذا المستفيد/ة من رقمه، وأي رسالة منه عبر أي قناة تصل إلى نفس المستفيد/ة `,
                codeTag(cl.code),
                '.',
              ),
            )
          : null,
        idents.length
          ? h(
              'div',
              h('h3.pa-mini-h', 'وسائل التواصل المرتبطة'),
              h(
                'ul.pa-ident',
                idents.map((x) =>
                  h(
                    'li',
                    icon(x.kind === 'phone' ? 'phone' : 'mail', { size: 15 }),
                    ltr(x.value),
                    x.channels && x.channels.length ? channelIcons(x.channels, { size: 14 }) : null,
                  ),
                ),
              ),
            )
          : null,
        h(
          'div',
          h('h3.pa-mini-h', 'تاريخ المستفيد/ة مع المؤسسة'),
          others.length || cases.length
            ? h(
                'ul.pa-hist',
                cases.map((c) =>
                  h('li', h('a.pa-hist-link', { href: `#/cases/${c.id}` }, icon('briefcase', { size: 14 }), codeTag(c.code), h('span.pa-hist-title', c.title)), statusBadge('case_status', c.status)),
                ),
                others.map((o) =>
                  h(
                    'li',
                    h('a.pa-hist-link', { href: `#/inbox/${o.id}` }, icon('inbox', { size: 14 }), codeTag(o.code), h('span.pa-hist-title', o.title || date(o.created_at))),
                    statusBadge('intake_status', o.status),
                  ),
                ),
              )
            : h('p.small.muted', 'هذا أول تواصل لهذا المستفيد/ة مع المؤسسة.'),
        ),
        button(MERGE_LABEL, { size: 'sm', icon: 'users', onClick: () => mergeFlow() }),
      ),
    });
  }

  // ───────────── المصدر والقناة ─────────────
  function sourceCard() {
    const detail = it.source_detail && typeof it.source_detail === 'object' ? it.source_detail : {};
    const detailRows = Object.entries(detail)
      .filter(([k, v]) => !isInternalSourceKey(k) && v != null && v !== '')
      .map(([k, v]) => [
        SOURCE_DETAIL_LABELS[k] || k,
        k === 'source_type'
          ? SOURCE_TYPE_LABELS[v] || String(v)
          : k === 'intake_mode'
            ? INTAKE_MODE_LABELS[v] || String(v)
            : h('span.pa-break', { dir: 'auto' }, typeof v === 'object' ? JSON.stringify(v) : String(v)),
      ]);
    const chans = it.channels && it.channels.length ? it.channels : [it.first_channel];
    return card({
      title: 'المصدر والقناة',
      icon: 'flag',
      body: h(
        'div.stack-sm',
        h('p.pa-note', icon('info', { size: 15 }), h('span', 'المصدر هو ما جاء بالمستفيد/ة، والقناة هي طريقة التواصل: إعلان على فيسبوك قد يصل عبر واتساب.')),
        kv([
          ['المصدر', statusBadge('source', it.source, { dot: false })],
          ['الحملة', it.campaign ? h('span', { dir: 'auto' }, it.campaign) : null],
          ['أول قناة', it.first_channel ? h('span.pa-chan-line', icon(CHANNEL_ICONS[it.first_channel] || 'message', { size: 15 }), label('channel', it.first_channel)) : null],
          ['كل القنوات', channelIcons(chans, { withLabels: true, size: 14 })],
          ...detailRows,
        ]),
      ),
    });
  }

  // ───────────── السجل ─────────────
  function activityCard() {
    const items = (d.activity || [])
      .slice()
      .reverse()
      .map((a) => ({
        time: a.created_at,
        title: a.summary,
        actor: a.actor_name || label('actor_kind', a.actor_kind),
        tone: ACTOR_TONES[a.actor_kind] || 'neutral',
        icon: activityIcon(a.type),
      }));
    return card({ title: 'سجل النشاط', icon: 'clock', body: timeline(items) });
  }

  // ───────────── الترويسة والتخطيط ─────────────
  function withId(el, id) {
    el.id = id;
    el.tabIndex = -1;
    return el;
  }

  const identityEl = identityBlock();
  // عنوان واحد ثابت لكل الحالات («الطلب REQ-…» كعنوان المتصفح)، والموضوع تحته: لا يتبدل العنوان بين اسم المرسل
  // وموضوع الطلب بحسب حالته
  const header = pageHeader({
    title: `الطلب ${it.code}`,
    breadcrumbs: [
      { label: 'صندوق الوارد الموحد', href: '#/inbox' },
      { label: it.code },
    ],
    subtitle: it.title
      ? h('span', it.contact_name ? `${it.title} — ${it.contact_name}` : it.title)
      : it.contact_name || aiTitle
        ? h(
            'span',
            it.contact_name ? `من ${it.contact_name}` : null,
            aiTitle ? h('span.pa-ai-inline', icon('sparkle', { size: 14 }), `${it.contact_name ? ' · ' : ''}عنوان مقترح: ${aiTitle}`) : null,
          )
        : null,
    meta: [
      codeTag(it.code),
      statusBadge('intake_status', it.status),
      statusBadge('priority', it.priority, { dot: false, icon: 'flag' }),
      it.kind && badge(label('intake_kind', it.kind), 'neutral'),
      it.legal_area && badge(areaLabel(it.legal_area), 'primary'),
      h('span.small.muted', { title: dateTime(it.created_at) }, `وصل ${relative(it.created_at)}`),
    ],
    actions: [
      button('رجوع', { variant: 'ghost', icon: 'chevronRight', href: '#/inbox' }),
      it.status === 'converted' && d.case && button(`فتح الملف ${d.case.code}`, { variant: 'primary', icon: 'briefcase', href: `#/cases/${d.case.id}` }),
    ],
  });

  return h(
    'div.pa-page.pa-page-intake',
    header,
    h(
      'div.detail-layout',
      h(
        'div.detail-main',
        identityEl && withId(identityEl, 'pa-identity'),
        withId(decisionCard(), 'pa-decision'),
        withId(conversationCard(), 'pa-conversation'),
        allDocs.length ? withId(documentsCard(), 'pa-documents') : null,
        analyses && docAiResultsCard(analyses, allDocs),
        withId(triageCard(), 'pa-triage'),
        it.client_id && withId(beneficiaryCard({ clientId: it.client_id, intakeId: it.id, onChange: () => ctx.reload() }), 'v9p-beneficiary'),
        activityCard(),
      ),
      h('div.detail-side', withId(aiCard(), 'pa-ai'), withId(clientCard(), 'pa-client'), sourceCard()),
    ),
  );
}
